<?php
declare(strict_types=1);

/**
 * 🖼️ Retouche des photos (visionneuse → « Retoucher ») : luminosité, contraste, couleurs et courbe sont calculés
 * dans le navigateur ; le serveur reçoit l'image finie.
 *  - « Remplacer » : l'original est rangé dans media/originaux/ (une seule fois : c'est toujours le tout premier
 *    qui est gardé) et la fiche du média pointe vers l'image retouchée ; « Revenir à l'original » le remet.
 *  - « Enregistrer une copie » : un nouveau média, rattaché aux mêmes fiches, l'original ne change pas.
 */

const RETOUCH_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

function retouch_originals_dir(): string
{
    $dir = MEDIA_DIR . '/originaux';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier des originaux.'); }
    return $dir;
}

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

/** Un autre média utilise-t-il ce fichier ? (un import GEDCOM peut faire partager un fichier à deux médias) */
function retouch_file_shared(PDO $pdo, int $id, string $file): bool
{
    $s = $pdo->prepare('SELECT count(*) FROM media WHERE id<>? AND (filename=? OR thumbnail=?)'); $s->execute([$id, $file, $file]);
    return (int) $s->fetchColumn() > 0;
}

function retouch_media(PDO $pdo, ?array $file, array $post): never
{
    $id = safe_int($post['media_id'] ?? 0);
    $mode = ($post['mode'] ?? '') === 'copy' ? 'copy' : 'replace';
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
    $keptCopy = null; // copie de l'original rangée dans originaux/ par ce passage
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
            $pdo->commit();
        } else {
            $orig = $pdo->prepare('SELECT filename FROM media_originals WHERE media_id=?'); $orig->execute([$id]);
            $kept = $orig->fetchColumn();
            if ($kept === false) {
                // Premier passage : on COPIE l'original dans originaux/ (rien n'est déplacé tant que la base n'est pas à jour)
                $dest = retouch_originals_dir() . '/' . $current;
                if (is_file($dest)) { $dest = retouch_originals_dir() . '/' . bin2hex(random_bytes(4)) . '_' . $current; }
                if (!@copy(media_file_path($current), $dest)) { throw new RuntimeException('Impossible de mettre l’original de côté.'); }
                $keptCopy = $dest;
                $pdo->prepare('INSERT INTO media_originals(media_id, filename) VALUES(?,?)')->execute([$id, basename($dest)]);
            }
            $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([$name, $name, $id]);
            log_change($pdo, 'media', $id, 'update', 'Photo retouchée « ' . ($media['title'] ?: $current) . ' » (original gardé)', ['filename' => $current], ['filename' => $name]);
            $result = ['mode' => 'replace', 'media_id' => $id, 'filename' => $name];
            $pdo->commit();
            // Base à jour : l'ancien fichier (original déjà copié, ou retouche intermédiaire) peut partir, sauf s'il sert ailleurs
            if ($current !== '' && !retouch_file_shared($pdo, $id, $current)) { @unlink(MEDIA_DIR . '/' . $current); }
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        @unlink(MEDIA_DIR . '/' . $name);
        if ($keptCopy) { @unlink($keptCopy); }
        json_response(['error' => $e->getMessage()], 500);
    }
    json_response(['ok' => true, 'result' => $result]);
}

/** Remet l'original (route à part, hors de la transaction générale : les fichiers ne bougent qu'une fois la base à jour). */
function retouch_restore_original(PDO $pdo, array $data): never
{
    $id = safe_int($data['media_id'] ?? 0);
    $s = $pdo->prepare('SELECT m.filename AS current, o.filename AS original FROM media m JOIN media_originals o ON o.media_id=m.id WHERE m.id=?'); $s->execute([$id]);
    $row = $s->fetch();
    if (!$row) { json_response(['error' => 'Cette photo n’a pas été retouchée.'], 422); }
    $from = retouch_originals_dir() . '/' . basename((string) $row['original']);
    if (!is_file($from)) { json_response(['error' => 'L’original n’est plus dans media/originaux/.'], 422); }
    $name = basename((string) $row['original']);
    if (is_file(MEDIA_DIR . '/' . $name)) { $name = bin2hex(random_bytes(4)) . '_' . $name; }
    if (!@copy($from, MEDIA_DIR . '/' . $name)) { json_response(['error' => 'Impossible de remettre l’original.'], 500); }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([$name, $name, $id]);
        $pdo->prepare('DELETE FROM media_originals WHERE media_id=?')->execute([$id]);
        log_change($pdo, 'media', $id, 'update', 'Photo remise dans son état d’origine');
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        @unlink(MEDIA_DIR . '/' . $name);
        json_response(['error' => $e->getMessage()], 500);
    }
    @unlink($from);
    $current = basename((string) $row['current']);
    if ($current !== '' && $current !== $name && !retouch_file_shared($pdo, $id, $current)) { @unlink(MEDIA_DIR . '/' . $current); }
    json_response(['ok' => true, 'result' => ['filename' => $name]]);
}

/** Les médias (parmi ceux demandés) qui ont un original gardé. */
function retouch_has_original(PDO $pdo, int $id): bool
{
    $s = $pdo->prepare('SELECT 1 FROM media_originals WHERE media_id=?'); $s->execute([$id]);
    return (bool) $s->fetchColumn();
}
