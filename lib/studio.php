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
    $pdo->beginTransaction();
    try {
        if ($mode === 'copy') {
            $row = $media;
            unset($row['id'], $row['source_id']);
            $row['filename'] = $name; $row['thumbnail'] = $name;
            $row['title'] = trim((string) $media['title']) !== '' ? $media['title'] . ' (retouchée)' : 'Photo retouchée';
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
            $orig = $pdo->prepare('SELECT filename FROM media_originals WHERE media_id=?'); $orig->execute([$id]);
            $kept = $orig->fetchColumn();
            $current = (string) $media['filename'];
            if ($kept === false) { // premier passage : l'original part dans media/originaux/
                $from = media_file_path($current);
                if (!@rename($from, retouch_originals_dir() . '/' . basename($current))) { throw new RuntimeException('Impossible de mettre l’original de côté.'); }
                $pdo->prepare('INSERT INTO media_originals(media_id, filename) VALUES(?,?)')->execute([$id, basename($current)]);
            } elseif ($current !== '' && is_file(MEDIA_DIR . '/' . basename($current))) { // retouche d'une retouche : l'intermédiaire ne sert plus
                @unlink(MEDIA_DIR . '/' . basename($current));
            }
            $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([$name, $name, $id]);
            log_change($pdo, 'media', $id, 'update', 'Photo retouchée « ' . ($media['title'] ?: $current) . ' » (original gardé)', ['filename' => $current], ['filename' => $name]);
            $result = ['mode' => 'replace', 'media_id' => $id, 'filename' => $name];
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        @unlink(MEDIA_DIR . '/' . $name);
        json_response(['error' => $e->getMessage()], 500);
    }
    json_response(['ok' => true, 'result' => $result]);
}

function retouch_restore_original(PDO $pdo, array $data): array
{
    $id = safe_int($data['media_id'] ?? 0);
    $s = $pdo->prepare('SELECT m.filename AS current, o.filename AS original FROM media m JOIN media_originals o ON o.media_id=m.id WHERE m.id=?'); $s->execute([$id]);
    $row = $s->fetch();
    if (!$row) { throw new RuntimeException('Cette photo n’a pas été retouchée.'); }
    $from = retouch_originals_dir() . '/' . basename((string) $row['original']);
    if (!is_file($from)) { throw new RuntimeException('L’original n’est plus dans media/originaux/.'); }
    $to = MEDIA_DIR . '/' . basename((string) $row['original']);
    if (is_file($to)) { $to = MEDIA_DIR . '/' . bin2hex(random_bytes(4)) . '_' . basename((string) $row['original']); }
    if (!@rename($from, $to)) { throw new RuntimeException('Impossible de remettre l’original.'); }
    $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([basename($to), basename($to), $id]);
    $pdo->prepare('DELETE FROM media_originals WHERE media_id=?')->execute([$id]);
    if ((string) $row['current'] !== '' && basename((string) $row['current']) !== basename($to)) { @unlink(MEDIA_DIR . '/' . basename((string) $row['current'])); }
    log_change($pdo, 'media', $id, 'update', 'Photo remise dans son état d’origine');
    return ['filename' => basename($to)];
}

/** Les médias (parmi ceux demandés) qui ont un original gardé. */
function retouch_has_original(PDO $pdo, int $id): bool
{
    $s = $pdo->prepare('SELECT 1 FROM media_originals WHERE media_id=?'); $s->execute([$id]);
    return (bool) $s->fetchColumn();
}
