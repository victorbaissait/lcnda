<?php
declare(strict_types=1);

/**
 * 🖼️ Retouche des photos (visionneuse → « Retoucher ») : luminosité, contraste, couleurs et courbe sont calculés
 * dans le navigateur ; le serveur reçoit l'image finie.
 *  - L'original est toujours gardé. Chaque retouche est une version de plus de la même photo (structure n°17,
 *    table media_versions) ; on choisit la version affichée partout (media.filename), et on peut en changer.
 *  - « Enregistrer une copie » crée au contraire un autre média, rattaché aux mêmes fiches.
 * Tous les fichiers restent dans media/. Un fichier n'est effacé que s'il ne sert plus à rien.
 */

const RETOUCH_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

/** Range le fichier reçu dans media/ sous un nouveau nom ; rend ce nom. */
function retouch_store_upload(?array $file): string
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { throw new RuntimeException('Image retouchée non reçue.'); }
    if ((int) $file['size'] > 60 * 1024 * 1024) { throw new RuntimeException('Image trop grande (plus de 60 Mo).'); }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
    if (!isset(RETOUCH_TYPES[$mime])) { throw new RuntimeException('Format d’image non pris en charge.'); }
    $name = bin2hex(random_bytes(16)) . '.' . RETOUCH_TYPES[$mime];
    if (!@move_uploaded_file((string) $file['tmp_name'], MEDIA_DIR . '/' . $name) && !@copy((string) $file['tmp_name'], MEDIA_DIR . '/' . $name)) {
        throw new RuntimeException('Impossible d’enregistrer l’image retouchée.');
    }
    return $name;
}

/** Un fichier sert-il encore (à un média ou à une version) ? Un import GEDCOM peut faire partager un fichier à deux médias. */
function retouch_file_used(PDO $pdo, string $file, int $exceptVersion = 0): bool
{
    $s = $pdo->prepare('SELECT (SELECT count(*) FROM media WHERE filename=? OR thumbnail=?) + (SELECT count(*) FROM media_versions WHERE filename=? AND id<>?)');
    $s->execute([$file, $file, $file, $exceptVersion]);
    return (int) $s->fetchColumn() > 0;
}

/** Les versions d'une photo (l'original en premier) et celle qui est affichée. */
function retouch_versions(PDO $pdo, int $id): array
{
    $m = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $m->execute([$id]);
    $shown = (string) $m->fetchColumn();
    $s = $pdo->prepare('SELECT id, filename, label, is_original, created_at FROM media_versions WHERE media_id=? ORDER BY is_original DESC, id'); $s->execute([$id]);
    $rows = $s->fetchAll();
    if (!$rows) { return [['id' => 0, 'filename' => $shown, 'label' => 'Original', 'is_original' => 1, 'created_at' => '', 'shown' => true]]; }
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'filename' => $r['filename'], 'label' => $r['label'], 'is_original' => (int) $r['is_original'], 'created_at' => $r['created_at'], 'shown' => $r['filename'] === $shown], $rows);
}

function retouch_media(PDO $pdo, ?array $file, array $post): never
{
    $id = safe_int($post['media_id'] ?? 0);
    $mode = ($post['mode'] ?? '') === 'copy' ? 'copy' : 'version';
    $show = !empty($post['show']) && $post['show'] !== '0';
    $s = $pdo->prepare('SELECT * FROM media WHERE id=?'); $s->execute([$id]);
    $media = $s->fetch();
    if (!$media) { json_response(['error' => 'Média introuvable.'], 404); }
    if (strtolower((string) $media['media_type']) !== 'image') { json_response(['error' => 'Seules les images se retouchent.'], 422); }
    try {
        $name = retouch_store_upload($file);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
    $current = basename((string) $media['filename']);
    $pdo->beginTransaction();
    try {
        if ($mode === 'copy') {
            $row = $media;
            unset($row['id'], $row['source_id']);
            $row['filename'] = $name; $row['thumbnail'] = $name;
            $row['title'] = trim((string) $media['title']) !== '' ? $media['title'] . ' (retouchée)' : 'Photo retouchée';
            // La copie n'est ni un côté de carte postale, ni une lettre de la correspondance, ni le portrait
            foreach (['postcard_group' => '', 'postcard_side' => '', 'is_person_photo' => 0, 'correspondence_reply_to_media_id' => 0] as $col => $val) { if (array_key_exists($col, $row)) { $row[$col] = $val; } }
            if (array_key_exists('created_at', $row)) { $row['created_at'] = date('Y-m-d H:i:s'); }
            if (array_key_exists('updated_at', $row)) { $row['updated_at'] = date('Y-m-d H:i:s'); }
            $cols = array_keys($row);
            $pdo->prepare('INSERT INTO media(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($row));
            $newId = (int) $pdo->lastInsertId();
            // Rattachée aux mêmes fiches, juste après l'original
            $pdo->prepare('INSERT INTO media_links(media_id, entity_type, entity_id, position, collection_key, collection_label)
                SELECT ?, entity_type, entity_id, position + 0.5, collection_key, collection_label FROM media_links WHERE media_id=?')->execute([$newId, $id]);
            log_change($pdo, 'media', $newId, 'create', 'Copie retouchée du média « ' . ($media['title'] ?: $media['filename']) . ' »');
            $result = ['mode' => 'copy', 'media_id' => $newId];
        } else {
            // Première retouche : la photo d'avant devient la version « Original »
            $has = $pdo->prepare('SELECT count(*) FROM media_versions WHERE media_id=?'); $has->execute([$id]);
            if (!(int) $has->fetchColumn()) {
                $pdo->prepare('INSERT INTO media_versions(media_id, filename, label, is_original) VALUES(?,?,?,1)')->execute([$id, $current, 'Original']);
            }
            $n = $pdo->prepare('SELECT count(*) FROM media_versions WHERE media_id=? AND is_original=0'); $n->execute([$id]);
            $label = 'Retouche ' . ((int) $n->fetchColumn() + 1) . ' — ' . date('d/m/Y');
            $pdo->prepare('INSERT INTO media_versions(media_id, filename, label, is_original) VALUES(?,?,?,0)')->execute([$id, $name, $label]);
            if ($show) {
                $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([$name, $name, $id]);
            }
            log_change($pdo, 'media', $id, 'update', 'Nouvelle version retouchée de « ' . ($media['title'] ?: $current) . ' »' . ($show ? ' (affichée)' : ''), ['filename' => $current], ['filename' => $show ? $name : $current]);
            $result = ['mode' => 'version', 'media_id' => $id, 'filename' => $show ? $name : $current, 'versions' => retouch_versions($pdo, $id)];
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        @unlink(MEDIA_DIR . '/' . $name);
        json_response(['error' => $e->getMessage()], 500);
    }
    json_response(['ok' => true, 'result' => $result]);
}

/** Choisir la version affichée par défaut (l'original ou une retouche). */
function retouch_show_version(PDO $pdo, array $data): array
{
    $id = safe_int($data['media_id'] ?? 0);
    $s = $pdo->prepare('SELECT filename FROM media_versions WHERE id=? AND media_id=?'); $s->execute([safe_int($data['version_id'] ?? 0), $id]);
    $file = $s->fetchColumn();
    if ($file === false) { throw new RuntimeException('Version introuvable.'); }
    if (!is_file(MEDIA_DIR . '/' . basename((string) $file))) { throw new RuntimeException('Le fichier de cette version n’est plus dans le dossier des médias.'); }
    $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([$file, $file, $id]);
    log_change($pdo, 'media', $id, 'update', 'Version affichée changée');
    return ['filename' => $file, 'versions' => retouch_versions($pdo, $id)];
}

/** Supprimer une retouche (jamais l'original). Si elle était affichée, c'est l'original qui reprend sa place. */
function retouch_delete_version(PDO $pdo, array $data): never
{
    $id = safe_int($data['media_id'] ?? 0);
    $vid = safe_int($data['version_id'] ?? 0);
    $s = $pdo->prepare('SELECT filename, is_original FROM media_versions WHERE id=? AND media_id=?'); $s->execute([$vid, $id]);
    $v = $s->fetch();
    if (!$v) { json_response(['error' => 'Version introuvable.'], 404); }
    if ((int) $v['is_original']) { json_response(['error' => 'L’original ne se supprime pas.'], 422); }
    $pdo->beginTransaction();
    try {
        $m = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $m->execute([$id]);
        if ((string) $m->fetchColumn() === (string) $v['filename']) {
            $o = $pdo->prepare('SELECT filename FROM media_versions WHERE media_id=? AND is_original=1'); $o->execute([$id]);
            $orig = (string) $o->fetchColumn();
            $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([$orig, $orig, $id]);
        }
        $pdo->prepare('DELETE FROM media_versions WHERE id=?')->execute([$vid]);
        log_change($pdo, 'media', $id, 'update', 'Version retouchée supprimée');
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        json_response(['error' => $e->getMessage()], 500);
    }
    // Base à jour : le fichier part s'il ne sert plus à rien
    if (!retouch_file_used($pdo, (string) $v['filename'])) { @unlink(MEDIA_DIR . '/' . basename((string) $v['filename'])); }
    $vs = retouch_versions($pdo, $id);
    json_response(['ok' => true, 'result' => ['versions' => $vs, 'filename' => (array_values(array_filter($vs, static fn($x) => $x['shown']))[0]['filename'] ?? '')]]);
}
