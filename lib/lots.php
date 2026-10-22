<?php
declare(strict_types=1);

/**
 * ⚙️ Traitements par lot (Listes → 🛠️ Outils de modification → « ⚙️ Traitements par lot », assets/js/heritage-lot.js) :
 * renommer, redimensionner, changer de format… plusieurs images, documents, classeurs ou sons d'un coup.
 * Tout le travail sur les fichiers se fait dans le navigateur ; le serveur range seulement le résultat :
 *  - POST lot_begin {count}            → {token} : un « lot » (son journal, pour « ↶ Annuler ») ;
 *  - POST lot_item (multipart)         → un fichier du lot : nouvelle version d'un média (l'original reste dans les
 *    versions, table media_versions comme la retouche), copie dans les médias (reliée aux mêmes fiches), nouveau média
 *    (fichier venu de l'ordinateur), ou seulement le titre, des étiquettes, une personne reliée (mode « meta ») ;
 *  - POST lot_undo {token}             → remet tout comme avant (versions retirées, copies supprimées, titres, étiquettes
 *    et liens défaits), dans l'ordre inverse.
 * Le journal est un petit fichier JSON par lot (DATA_DIR/cache/lots/<jeton>.json, gardé 7 jours) : pas de table à créer.
 * Types de fichiers bornés (liste blanche : extension + premiers octets), tailles bornées, noms de fichiers tirés au hasard.
 */

const LOT_ACTIONS = ['lot_begin', 'lot_item', 'lot_undo'];
/** extension → [famille, media_type, Mo au plus] ; la famille dit ce qui peut devenir la version de quoi */
const LOT_TYPES = [
    'jpg' => ['image', 'image', 60], 'jpeg' => ['image', 'image', 60], 'png' => ['image', 'image', 60], 'webp' => ['image', 'image', 60],
    'avif' => ['image', 'image', 60], 'gif' => ['image', 'image', 60],
    'pdf' => ['pdf', 'pdf', 120],
    'docx' => ['doc', 'document', 60], 'odt' => ['doc', 'document', 60], 'rtf' => ['doc', 'document', 60], 'md' => ['doc', 'document', 20],
    'txt' => ['doc', 'document', 20], 'html' => ['doc', 'document', 20],
    'xlsx' => ['doc', 'document', 60], 'ods' => ['doc', 'document', 60], 'csv' => ['doc', 'document', 60],
    'mp3' => ['audio', 'audio', 400], 'wav' => ['audio', 'audio', 400], 'ogg' => ['audio', 'audio', 400], 'flac' => ['audio', 'audio', 400],
    'm4a' => ['audio', 'audio', 400], 'aiff' => ['audio', 'audio', 400],
];
const LOT_MAX_ITEMS = 2000;

function lot_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    if (!$isWrite) { json_response(['error' => 'Cette action s’envoie en POST.'], 405); }
    try {
        if ($action === 'lot_begin') { json_response(['ok' => true, 'result' => lot_begin($payload)]); }
        if ($action === 'lot_item') { json_response(['ok' => true, 'result' => lot_item($pdo, $_FILES['file'] ?? null, $_POST ?: $payload)]); }
        if ($action === 'lot_undo') { json_response(['ok' => true, 'result' => lot_undo($pdo, $payload)]); }
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
    json_response(['error' => 'Action inconnue'], 404);
}

function lot_dir(): string
{
    $dir = DATA_DIR . '/cache/lots';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier des traitements par lot.'); }
    return $dir;
}

function lot_token_file(string $token): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $token)) { throw new LcndaBadInput('Lot inconnu.'); }
    return lot_dir() . '/' . $token . '.json';
}

function lot_begin(array $data): array
{
    // les vieux journaux (plus de 7 jours) partent : on ne défait plus un lot aussi ancien
    foreach (glob(lot_dir() . '/*.json') ?: [] as $old) { if (@filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $token = bin2hex(random_bytes(16));
    $count = max(0, min(LOT_MAX_ITEMS, safe_int($data['count'] ?? 0)));
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 80);
    file_put_contents(lot_token_file($token), json_encode(['created' => date('c'), 'count' => $count, 'name' => $name, 'items' => []], JSON_UNESCAPED_UNICODE), LOCK_EX);
    return ['token' => $token];
}

/** ajoute des étapes au journal d'un lot (sous verrou : deux envois rapprochés n'écrasent rien) */
function lot_journal_add(string $token, array $steps): void
{
    $file = lot_token_file($token);
    $fh = @fopen($file, 'c+');
    if (!$fh) { throw new LcndaBadInput('Lot inconnu ou trop ancien : recommence le traitement.'); }
    try {
        flock($fh, LOCK_EX);
        $j = json_decode((string) stream_get_contents($fh), true);
        if (!is_array($j) || !isset($j['items'])) { throw new LcndaBadInput('Lot inconnu ou trop ancien : recommence le traitement.'); }
        if (count($j['items']) >= LOT_MAX_ITEMS * 6) { throw new LcndaBadInput('Ce lot est trop grand.'); }
        foreach ($steps as $s) { $j['items'][] = $s; }
        ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($j, JSON_UNESCAPED_UNICODE)); fflush($fh);
    } finally { flock($fh, LOCK_UN); fclose($fh); }
}

/** le nom envoyé par la page : sans chemin, sans caractère de contrôle, 150 caractères au plus */
function lot_clean_name(string $name): string
{
    $name = basename(str_replace('\\', '/', $name));
    $name = preg_replace('/[\x00-\x1f\x7f<>:"\/\\\\|?*]+/u', '', $name) ?? '';
    $name = trim($name, " .\t");
    return mb_substr($name, 0, 150);
}

/** vérifie un fichier reçu (liste blanche : extension + premiers octets) et le range dans media/ sous un nom tiré au hasard */
function lot_store_upload(?array $file, string $origName): array
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { throw new LcndaBadInput('Fichier non reçu.'); }
    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    if ($ext === 'jpeg') { $ext = 'jpg'; }
    if (!isset(LOT_TYPES[$ext])) { throw new LcndaBadInput('Ce type de fichier ne se range pas dans les médias (' . ($ext !== '' ? '.' . $ext : 'sans extension') . ').'); }
    [$family, $mediaType, $mb] = LOT_TYPES[$ext];
    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0) { throw new LcndaBadInput('Fichier vide.'); }
    if ($size > $mb * 1024 * 1024) { throw new LcndaBadInput("Fichier trop gros (plus de {$mb} Mo)."); }
    $tmp = (string) $file['tmp_name'];
    $head = (string) @file_get_contents($tmp, false, null, 0, 65536);
    $mime = (string) (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
    $zip = str_starts_with($head, "PK\x03\x04");
    $isText = !str_contains($head, "\0");
    $ok = match ($ext) {
        'jpg' => str_starts_with($head, "\xFF\xD8\xFF"),
        'png' => str_starts_with($head, "\x89PNG\r\n\x1a\n"),
        'gif' => str_starts_with($head, 'GIF87a') || str_starts_with($head, 'GIF89a'),
        'webp' => str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP',
        'avif' => substr($head, 4, 4) === 'ftyp' && in_array(substr($head, 8, 4), ['avif', 'avis'], true),
        'pdf' => str_starts_with($head, '%PDF-'),
        'docx', 'odt', 'xlsx', 'ods' => $zip,
        'rtf' => str_starts_with(ltrim($head), '{\\rtf'),
        'md', 'txt', 'csv', 'html' => $isText,
        'mp3' => $mime === 'audio/mpeg' || str_starts_with($head, 'ID3') || (strlen($head) > 1 && ord($head[0]) === 0xFF && (ord($head[1]) & 0xE0) === 0xE0),
        'wav' => str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WAVE',
        'ogg' => str_starts_with($head, 'OggS'),
        'flac' => str_starts_with($head, 'fLaC'),
        'm4a' => substr($head, 4, 4) === 'ftyp',
        'aiff' => str_starts_with($head, 'FORM') && in_array(substr($head, 8, 4), ['AIFF', 'AIFC'], true),
        default => false,
    };
    if (!$ok) { throw new LcndaBadInput('Le contenu du fichier ne correspond pas à son extension (.' . $ext . ').'); }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!@move_uploaded_file($tmp, MEDIA_DIR . '/' . $name) && !@copy($tmp, MEDIA_DIR . '/' . $name)) { throw new RuntimeException('Impossible de ranger le fichier dans les médias.'); }
    return ['name' => $name, 'family' => $family, 'media_type' => $mediaType, 'ext' => $ext];
}

/** la famille d'un média déjà dans la base (pour refuser qu'un PDF devienne la version d'une photo) */
function lot_media_family(array $media): string
{
    $t = strtolower((string) $media['media_type']);
    if ($t === 'image') { return 'image'; }
    if ($t === 'audio') { return 'audio'; }
    if ($t === 'video') { return 'video'; }
    if ($t === 'pdf' || strtolower(pathinfo((string) $media['filename'], PATHINFO_EXTENSION)) === 'pdf') { return $t === 'pdf' ? 'pdf' : 'doc'; }
    return 'doc';
}

function lot_ids(mixed $raw, int $max = 50): array
{
    $list = is_array($raw) ? $raw : explode(',', (string) $raw);
    $ids = [];
    foreach ($list as $v) { $i = safe_int($v); if ($i > 0) { $ids[$i] = $i; } if (count($ids) >= $max) { break; } }
    return array_values($ids);
}

/** un fichier du lot ; rend {media_id, mode, filename} */
function lot_item(PDO $pdo, ?array $file, array $post): array
{
    $token = (string) ($post['token'] ?? '');
    lot_token_file($token); // forme du jeton
    if (!is_file(lot_token_file($token))) { throw new LcndaBadInput('Lot inconnu ou trop ancien : recommence le traitement.'); }
    $mode = (string) ($post['mode'] ?? '');
    if (!in_array($mode, ['version', 'copy', 'new', 'meta'], true)) { throw new LcndaBadInput('Sortie inconnue.'); }
    $id = safe_int($post['media_id'] ?? 0);
    $title = mb_substr(safe_text($post['title'] ?? ''), 0, 300);
    $origName = lot_clean_name((string) ($post['name'] ?? ''));
    $labelIds = lot_ids($post['label_ids'] ?? '');
    $personId = safe_int($post['person_id'] ?? 0);
    $media = null;
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM media WHERE id=?'); $s->execute([$id]);
        $media = $s->fetch() ?: null;
        if (!$media) { throw new LcndaBadInput('Média introuvable (il a peut-être été supprimé entre-temps).'); }
    }
    if (in_array($mode, ['version', 'meta'], true) && !$media) { throw new LcndaBadInput('Ce fichier n’est pas encore dans les médias.'); }
    if ($personId) {
        if (!person_exists($pdo, $personId)) { throw new LcndaBadInput('Personne introuvable.'); }
        if (person_is_locked($pdo, $personId)) { throw new LcndaBadInput('Fiche verrouillée : on n’y relie pas de nouveau média. Déverrouille-la d’abord.'); }
    }
    $stored = null;
    if ($mode !== 'meta') {
        if ($origName === '') { throw new LcndaBadInput('Nom du fichier manquant.'); }
        $stored = lot_store_upload($file, $origName);
    }
    $steps = [];
    $pdo->beginTransaction();
    try {
        $mid = $id;
        if ($mode === 'version') {
            $fam = lot_media_family($media);
            if ($fam !== $stored['family'] && !($fam === 'doc' && $stored['family'] === 'doc')) {
                throw new LcndaBadInput('« ' . ($media['title'] ?: $media['filename']) . ' » : ce format ne peut pas devenir une version de ce média. Choisis « Copie dans les médias ».');
            }
            $current = basename((string) $media['filename']);
            $origAdded = false;
            $has = $pdo->prepare('SELECT count(*) FROM media_versions WHERE media_id=?'); $has->execute([$id]);
            if (!(int) $has->fetchColumn()) {
                $pdo->prepare('INSERT INTO media_versions(media_id, filename, label, is_original) VALUES(?,?,?,1)')->execute([$id, $current, 'Original']);
                $origAdded = true;
            }
            $word = 'Lot';
            $n = $pdo->prepare("SELECT COALESCE(max(CAST(substr(label, ?, instr(substr(label, ?), ' ')) AS INTEGER)), 0) FROM media_versions WHERE media_id=? AND label LIKE ?");
            $n->execute([mb_strlen($word) + 2, mb_strlen($word) + 2, $id, $word . ' %']);
            $note = mb_substr(safe_text($post['note'] ?? ''), 0, 120);
            $label = $word . ' ' . ((int) $n->fetchColumn() + 1) . ' — ' . date('d/m/Y') . ($note !== '' ? ' — ' . $note : '');
            $pdo->prepare('INSERT INTO media_versions(media_id, filename, label, is_original) VALUES(?,?,?,0)')->execute([$id, $stored['name'], $label]);
            $vid = (int) $pdo->lastInsertId();
            $thumb = $stored['family'] === 'image' ? $stored['name'] : ($stored['family'] === 'doc' ? '' : (string) $media['thumbnail']);
            $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([$stored['name'], $thumb, $id]);
            $steps[] = ['op' => 'version', 'media_id' => $id, 'version_id' => $vid, 'file' => $stored['name'], 'prev_filename' => $current, 'prev_thumbnail' => (string) $media['thumbnail'], 'orig_added' => $origAdded];
            log_change($pdo, 'media', $id, 'update', 'Traitement par lot : nouvelle version de « ' . ($media['title'] ?: $current) . ' »', ['filename' => $current], ['filename' => $stored['name']]);
        } elseif ($mode === 'copy' && $media) {
            $row = $media;
            unset($row['id'], $row['source_id']);
            $row['filename'] = $stored['name'];
            $row['thumbnail'] = $stored['family'] === 'image' ? $stored['name'] : '';
            $row['media_type'] = $stored['media_type'];
            $row['title'] = $title !== '' ? $title : (trim((string) $media['title']) !== '' ? $media['title'] . ' (copie)' : 'Copie');
            foreach (['postcard_group' => '', 'postcard_side' => '', 'is_person_photo' => 0, 'correspondence_reply_to_media_id' => 0] as $col => $val) { if (array_key_exists($col, $row)) { $row[$col] = $val; } }
            foreach (['created_at', 'updated_at'] as $col) { if (array_key_exists($col, $row)) { $row[$col] = date('Y-m-d H:i:s'); } }
            if (array_key_exists('duration_seconds', $row) && $stored['family'] !== 'audio') { $row['duration_seconds'] = null; }
            $cols = array_keys($row);
            $pdo->prepare('INSERT INTO media(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($row));
            $mid = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT INTO media_links(media_id, entity_type, entity_id, position, collection_key, collection_label)
                SELECT ?, entity_type, entity_id, position + 0.5, collection_key, collection_label FROM media_links WHERE media_id=?')->execute([$mid, $id]);
            $steps[] = ['op' => 'create', 'media_id' => $mid, 'file' => $stored['name']];
            log_change($pdo, 'media', $mid, 'create', 'Traitement par lot : copie de « ' . ($media['title'] ?: $media['filename']) . ' »');
            $title = ''; // déjà posé
        } elseif ($mode === 'copy' || $mode === 'new') {
            $t = $title !== '' ? $title : (preg_replace('/\.[^.]+$/', '', $origName) ?: 'Fichier');
            $pdo->prepare('INSERT INTO media(title, media_type, filename, thumbnail) VALUES(?, ?, ?, ?)')->execute([$t, $stored['media_type'], $stored['name'], $stored['family'] === 'image' ? $stored['name'] : '']);
            $mid = (int) $pdo->lastInsertId();
            $steps[] = ['op' => 'create', 'media_id' => $mid, 'file' => $stored['name']];
            log_change($pdo, 'media', $mid, 'create', 'Traitement par lot : « ' . $t . ' » rangé dans les médias');
            $mode = 'new'; $title = '';
        }
        // le titre (Renommer, « changer aussi le titre ») : seulement s'il change
        if ($title !== '' && $mid) {
            $cur = $pdo->prepare('SELECT title FROM media WHERE id=?'); $cur->execute([$mid]);
            $prev = (string) $cur->fetchColumn();
            if ($prev !== $title) {
                $pdo->prepare('UPDATE media SET title=? WHERE id=?')->execute([$title, $mid]);
                $steps[] = ['op' => 'title', 'media_id' => $mid, 'prev' => $prev];
                log_change($pdo, 'media', $mid, 'update', 'Traitement par lot : renommé « ' . $title . ' »', ['title' => $prev], ['title' => $title]);
            }
        }
        // étiquettes : seulement celles qui existent ; on ne note que celles qu'on vient de poser
        if ($labelIds) {
            $chk = $pdo->prepare('SELECT 1 FROM labels WHERE id=?');
            $ins = $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'media', ?)");
            $added = [];
            foreach ($labelIds as $lid) { $chk->execute([$lid]); if (!$chk->fetchColumn()) { continue; } $ins->execute([$lid, $mid]); if ($ins->rowCount() > 0) { $added[] = (int) $pdo->lastInsertId(); } }
            if ($added) { $steps[] = ['op' => 'labels', 'ids' => $added]; }
        }
        // relier à une personne (si ce n'est pas déjà fait)
        if ($personId) {
            $ex = $pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=?"); $ex->execute([$mid, $personId]);
            if (!$ex->fetchColumn()) {
                $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$mid, $personId, microtime(true)]);
                $steps[] = ['op' => 'links', 'ids' => [(int) $pdo->lastInsertId()]];
            }
        }
        if ($steps) { lot_journal_add($token, $steps); }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($stored) { @unlink(MEDIA_DIR . '/' . $stored['name']); }
        throw $e;
    }
    $f = $pdo->prepare('SELECT filename, title FROM media WHERE id=?'); $f->execute([$mid]); $r = $f->fetch() ?: [];
    return ['media_id' => $mid, 'mode' => $mode, 'filename' => (string) ($r['filename'] ?? ''), 'title' => (string) ($r['title'] ?? ''), 'steps' => count($steps)];
}

/** un fichier de media/ part seulement s'il ne sert plus à rien */
function lot_drop_file(PDO $pdo, string $file): void
{
    $file = basename($file);
    if ($file === '' || !preg_match('/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/', $file)) { return; }
    $s = $pdo->prepare('SELECT (SELECT count(*) FROM media WHERE filename=? OR thumbnail=?) + (SELECT count(*) FROM media_versions WHERE filename=?)');
    $s->execute([$file, $file, $file]);
    if ((int) $s->fetchColumn() === 0) { @unlink(MEDIA_DIR . '/' . $file); }
}

/** ↶ Annuler tout le lot */
function lot_undo(PDO $pdo, array $data): array
{
    $file = lot_token_file((string) ($data['token'] ?? ''));
    if (!is_file($file)) { throw new LcndaBadInput('Ce lot a déjà été annulé, ou il est trop ancien.'); }
    $j = json_decode((string) file_get_contents($file), true);
    $steps = is_array($j['items'] ?? null) ? array_reverse($j['items']) : [];
    $drop = []; $n = 0; $media = [];
    $pdo->beginTransaction();
    try {
        foreach ($steps as $s) {
            $op = (string) ($s['op'] ?? ''); $mid = safe_int($s['media_id'] ?? 0);
            if ($op === 'links') { foreach (lot_ids($s['ids'] ?? [], 1000) as $lid) { $pdo->prepare("DELETE FROM media_links WHERE id=? AND entity_type='person'")->execute([$lid]); } }
            elseif ($op === 'labels') { foreach (lot_ids($s['ids'] ?? [], 1000) as $lid) { $pdo->prepare("DELETE FROM label_links WHERE id=? AND entity_type='media'")->execute([$lid]); } }
            elseif ($op === 'title' && $mid) { $pdo->prepare('UPDATE media SET title=? WHERE id=?')->execute([mb_substr((string) ($s['prev'] ?? ''), 0, 300), $mid]); }
            elseif ($op === 'create' && $mid) {
                $chk = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $chk->execute([$mid]); $fn = $chk->fetchColumn();
                if ($fn !== false && basename((string) $fn) === basename((string) ($s['file'] ?? ''))) {
                    foreach (['media_links' => 'media_id=?', 'label_links' => "entity_type='media' AND entity_id=?", 'media_versions' => 'media_id=?'] as $t => $w) { try { $pdo->prepare("DELETE FROM {$t} WHERE {$w}")->execute([$mid]); } catch (Throwable $_) {} }
                    $pdo->prepare('DELETE FROM media WHERE id=?')->execute([$mid]);
                    log_change($pdo, 'media', $mid, 'delete', 'Traitement par lot annulé : copie retirée');
                }
                $drop[] = (string) ($s['file'] ?? '');
            } elseif ($op === 'version' && $mid) {
                $vid = safe_int($s['version_id'] ?? 0); $vf = basename((string) ($s['file'] ?? ''));
                $cur = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $cur->execute([$mid]); $shown = $cur->fetchColumn();
                if ($shown !== false && basename((string) $shown) === $vf) {
                    $pdo->prepare('UPDATE media SET filename=?, thumbnail=? WHERE id=?')->execute([basename((string) ($s['prev_filename'] ?? '')), (string) ($s['prev_thumbnail'] ?? ''), $mid]);
                }
                $pdo->prepare('DELETE FROM media_versions WHERE id=? AND media_id=? AND is_original=0')->execute([$vid, $mid]);
                if (!empty($s['orig_added'])) {
                    $left = $pdo->prepare('SELECT count(*) FROM media_versions WHERE media_id=? AND is_original=0'); $left->execute([$mid]);
                    if (!(int) $left->fetchColumn()) { $pdo->prepare('DELETE FROM media_versions WHERE media_id=? AND is_original=1')->execute([$mid]); }
                }
                log_change($pdo, 'media', $mid, 'update', 'Traitement par lot annulé : version retirée');
                $drop[] = $vf;
            }
            if ($mid) { $media[$mid] = true; }
            $n++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    foreach ($drop as $f) { lot_drop_file($pdo, $f); }
    @unlink($file);
    return ['undone' => $n, 'media' => count($media)];
}
