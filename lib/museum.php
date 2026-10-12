<?php
declare(strict_types=1);

/**
 * 🏛️ Musée de famille (structure n°16) : on y entre par la Pièce d'archives (porte « Musée »).
 *  - des salles (nom, texte d'accueil, enregistrement audio, taille, couleur des murs, sol) ;
 *  - dans chaque salle : photos et documents de la base, objets de famille (en vitrine), œuvres (cadre large,
 *    chevalet), textes aux murs, décor et sièges ; chaque œuvre a son cartel, sa description et son audio ;
 *  - un livre d'or, un catalogue imprimable, une visite autoguidée (enregistrements ou voix de synthèse) ;
 *  - partage : un site web autonome (index.html à ouvrir d'un double-clic) ou un fichier .lcnda-musee
 *    qu'un autre utilisateur de LCNDA importe (« musées reçus »).
 * Les fichiers propres au musée (audios, images ajoutées depuis l'ordinateur, musées reçus) sont dans media/musee/<id>/.
 */

const MUSEUM_KINDS = ['photo', 'document', 'artwork', 'object', 'text', 'decor', 'seat'];
const MUSEUM_WALLS = ['back', 'left', 'right', 'front', 'center'];
const MUSEUM_MODELS = ['bench', 'chair', 'sofa', 'plant', 'column', 'pedestal', 'rope', 'rug', 'lamp', 'vase', 'piano', 'table', 'screen', 'vitrine'];
const MUSEUM_AUDIO = ['audio/mpeg' => 'mp3', 'audio/mp4' => 'm4a', 'audio/x-m4a' => 'm4a', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav', 'audio/ogg' => 'ogg', 'audio/webm' => 'webm', 'video/webm' => 'webm'];
const MUSEUM_IMAGES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

function museum_dir(int $id): string
{
    $dir = MEDIA_DIR . '/musee/' . $id;
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier du musée.'); }
    return $dir;
}

/** Adresse web d'un fichier de media/ (chaque morceau du chemin est encodé). */
function museum_url(string $relative): string
{
    return $relative === '' ? '' : 'media/' . implode('/', array_map('rawurlencode', explode('/', $relative)));
}

/** Le musée de l'utilisateur : créé avec une première salle la première fois qu'on y entre. */
function museum_own_id(PDO $pdo): int
{
    $id = (int) $pdo->query('SELECT id FROM museums WHERE imported=0 ORDER BY id LIMIT 1')->fetchColumn();
    if ($id) { return $id; }
    $pdo->prepare('INSERT INTO museums(title, subtitle, intro, settings_json) VALUES(?,?,?,?)')->execute(['Musée de la famille', '', 'Bienvenue dans le musée de notre famille.', json_encode(['guestbook' => true])]);
    $id = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO museum_rooms(museum_id, position, name, intro, settings_json) VALUES(?,?,?,?,?)')->execute([$id, 1, 'Les visages de la famille', 'Les portraits de ceux qui nous ont précédés.', json_encode(['size' => 'medium', 'wall' => '#ffffff', 'floor' => 'light'])]);
    return $id;
}

function museums_list(PDO $pdo): array
{
    museum_own_id($pdo);
    return $pdo->query('SELECT m.id, m.title, m.subtitle, m.author, m.imported, m.created_at, (SELECT count(*) FROM museum_rooms r WHERE r.museum_id=m.id) AS rooms,
        (SELECT count(*) FROM museum_items i JOIN museum_rooms r ON r.id=i.room_id WHERE r.museum_id=m.id) AS items FROM museums m ORDER BY m.imported, m.id')->fetchAll();
}

function museum_settings(string $json): array
{
    $s = json_decode($json, true);
    return is_array($s) ? $s : [];
}

/** Tout le musée, prêt pour la visite (adresses des images et des sons) et pour l'aménagement. */
function museum_get(PDO $pdo, int $id): array
{
    if (!$id) { $id = museum_own_id($pdo); }
    $s = $pdo->prepare('SELECT * FROM museums WHERE id=?'); $s->execute([$id]);
    $m = $s->fetch();
    if (!$m) { throw new RuntimeException('Musée introuvable.'); }
    $rooms = $pdo->prepare('SELECT * FROM museum_rooms WHERE museum_id=? ORDER BY position, id'); $rooms->execute([$id]);
    $rooms = $rooms->fetchAll();
    $items = $pdo->prepare("SELECT i.*, me.filename AS media_file, me.title AS media_title, me.date_text AS media_date, me.description AS media_description,
            o.title AS object_title, o.kind AS object_kind, o.description AS object_description,
            (SELECT m2.filename FROM family_collection_media cm JOIN media m2 ON m2.id=cm.media_id WHERE cm.collection_type='family_object' AND cm.collection_id=i.object_id AND m2.media_type='image' ORDER BY cm.position, cm.id LIMIT 1) AS object_file,
            TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS person_name
        FROM museum_items i JOIN museum_rooms r ON r.id=i.room_id LEFT JOIN media me ON me.id=i.media_id LEFT JOIN family_objects o ON o.id=i.object_id LEFT JOIN persons p ON p.id=i.person_id
        WHERE r.museum_id=? ORDER BY i.position, i.id");
    $items->execute([$id]);
    $byRoom = [];
    foreach ($items->fetchAll() as $it) {
        $file = $it['file'] !== '' ? (string) $it['file'] : (string) ($it['media_file'] ?: $it['object_file'] ?: '');
        $byRoom[(int) $it['room_id']][] = [
            'id' => (int) $it['id'], 'room_id' => (int) $it['room_id'], 'position' => (int) $it['position'], 'kind' => $it['kind'], 'wall' => $it['wall'],
            'media_id' => $it['media_id'] ? (int) $it['media_id'] : null, 'object_id' => $it['object_id'] ? (int) $it['object_id'] : null,
            'person_id' => $it['person_id'] ? (int) $it['person_id'] : null, 'person_name' => trim((string) $it['person_name']),
            'file' => (string) $it['file'], 'source_title' => (string) ($it['media_title'] ?: $it['object_title'] ?: ''),
            'title' => $it['title'], 'cartel' => $it['cartel'], 'description' => $it['description'],
            'image' => in_array($it['kind'], ['text', 'decor', 'seat'], true) ? '' : museum_url($file), 'image_file' => $file,
            'audio' => museum_url((string) $it['audio_file']), 'audio_file' => (string) $it['audio_file'],
            'in_tour' => (int) $it['in_tour'], 'settings' => museum_settings((string) $it['settings_json']),
        ];
    }
    $out = [];
    foreach ($rooms as $r) {
        $out[] = ['id' => (int) $r['id'], 'position' => (int) $r['position'], 'name' => $r['name'], 'intro' => $r['intro'],
            'audio' => museum_url((string) $r['audio_file']), 'audio_file' => (string) $r['audio_file'], 'settings' => museum_settings((string) $r['settings_json']),
            'items' => $byRoom[(int) $r['id']] ?? []];
    }
    $book = $pdo->prepare('SELECT id, name, message, created_at FROM museum_guestbook WHERE museum_id=? ORDER BY id'); $book->execute([$id]);
    $guestbook = array_map(static fn($g) => ['id' => (int) $g['id'], 'name' => $g['name'], 'message' => $g['message'], 'date' => date('d/m/Y', strtotime((string) $g['created_at']) ?: time())], $book->fetchAll());
    return ['id' => (int) $m['id'], 'title' => $m['title'], 'subtitle' => $m['subtitle'], 'intro' => $m['intro'], 'author' => $m['author'], 'imported' => (int) $m['imported'],
        'settings' => museum_settings((string) $m['settings_json']), 'rooms' => $out, 'guestbook' => $guestbook];
}

/** Un musée reçu se visite mais ne se modifie pas (sauf pendant son import). */
function museum_writable(PDO $pdo, int $museumId): void
{
    $s = $pdo->prepare('SELECT imported FROM museums WHERE id=?'); $s->execute([$museumId]);
    $v = $s->fetchColumn();
    if ($v === false) { throw new RuntimeException('Musée introuvable.'); }
    if ((int) $v === 1 && empty($GLOBALS['museum_importing'])) { throw new RuntimeException('Un musée reçu ne se modifie pas.'); }
}
function museum_of_room(PDO $pdo, int $roomId): int
{
    $s = $pdo->prepare('SELECT museum_id FROM museum_rooms WHERE id=?'); $s->execute([$roomId]);
    return (int) $s->fetchColumn();
}
function museum_of_item(PDO $pdo, int $itemId): int
{
    $s = $pdo->prepare('SELECT r.museum_id FROM museum_items i JOIN museum_rooms r ON r.id=i.room_id WHERE i.id=?'); $s->execute([$itemId]);
    return (int) $s->fetchColumn();
}

function museum_check(PDO $pdo, int $museumId): void
{
    $s = $pdo->prepare('SELECT 1 FROM museums WHERE id=?'); $s->execute([$museumId]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Musée introuvable.'); }
}

function museum_clean_settings(mixed $raw, array $allowed): string
{
    $raw = is_array($raw) ? $raw : (is_string($raw) ? (json_decode($raw, true) ?: []) : []);
    $out = [];
    foreach ($allowed as $k => $type) {
        if (!array_key_exists($k, $raw)) { continue; }
        $v = $raw[$k];
        if ($type === 'color') { if (is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v)) { $out[$k] = $v; } }
        elseif ($type === 'bool') { $out[$k] = !empty($v) && $v !== '0'; }
        elseif ($type === 'num') { if ($v !== '' && $v !== null && is_numeric($v)) { $out[$k] = max(-1, min(3.4, round((float) $v, 3))); } }
        elseif ($type === 'deg') { if ($v !== '' && $v !== null && is_numeric($v)) { $d = fmod((float) $v + 180, 360); if ($d < 0) { $d += 360; } $out[$k] = (int) round($d - 180); } }
        elseif (is_array($type)) { if (in_array($v, $type, true)) { $out[$k] = $v; } }
    }
    return json_encode($out);
}

function museum_save(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0) ?: museum_own_id($pdo);
    museum_writable($pdo, $id);
    $pdo->prepare('UPDATE museums SET title=?, subtitle=?, intro=?, author=?, settings_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([
        mb_substr(safe_text($data['title'] ?? ''), 0, 120) ?: 'Musée de la famille', mb_substr(safe_text($data['subtitle'] ?? ''), 0, 200), h_long($data, 'intro', 4000),
        mb_substr(safe_text($data['author'] ?? ''), 0, 120), museum_clean_settings($data['settings'] ?? [], ['guestbook' => 'bool', 'wall' => 'color']), $id]);
    return ['id' => $id];
}

function museum_save_room(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $settings = museum_clean_settings($data['settings'] ?? [], ['size' => ['small', 'medium', 'large'], 'wall' => 'color', 'floor' => ['light', 'wood', 'stone', 'dark']]);
    $vals = [mb_substr(safe_text($data['name'] ?? ''), 0, 120) ?: 'Nouvelle salle', h_long($data, 'intro', 4000), $settings];
    if ($id) {
        museum_writable($pdo, museum_of_room($pdo, $id));
        $pdo->prepare('UPDATE museum_rooms SET name=?, intro=?, settings_json=? WHERE id=?')->execute([...$vals, $id]);
        if (array_key_exists('audio_file', $data) && $data['audio_file'] === '') { museum_drop_file($pdo, 'museum_rooms', $id); }
        return ['id' => $id];
    }
    $museumId = safe_int($data['museum_id'] ?? 0) ?: museum_own_id($pdo);
    museum_writable($pdo, $museumId);
    $pdo->prepare('INSERT INTO museum_rooms(museum_id, position, name, intro, settings_json) VALUES(?,(SELECT COALESCE(max(position),0)+1 FROM museum_rooms WHERE museum_id=?),?,?,?)')->execute([$museumId, $museumId, ...$vals]);
    return ['id' => (int) $pdo->lastInsertId()];
}

/** Efface les fichiers du musée qui ne servent plus à aucune salle ni œuvre. */
function museum_gc(PDO $pdo, array $files): void
{
    $used = $pdo->prepare('SELECT (SELECT count(*) FROM museum_items WHERE file=? OR audio_file=?) + (SELECT count(*) FROM museum_rooms WHERE audio_file=?)');
    foreach (array_unique(array_filter(array_map('strval', $files))) as $f) {
        if (!str_starts_with($f, 'musee/') || str_contains($f, '..')) { continue; }
        $used->execute([$f, $f, $f]);
        if (!(int) $used->fetchColumn()) { @unlink(MEDIA_DIR . '/' . $f); }
    }
}

/** Efface l'audio d'une salle ou d'une œuvre (et son fichier). */
function museum_drop_file(PDO $pdo, string $table, int $id): void
{
    $s = $pdo->prepare("SELECT audio_file FROM {$table} WHERE id=?"); $s->execute([$id]);
    $f = (string) $s->fetchColumn();
    $pdo->prepare("UPDATE {$table} SET audio_file='' WHERE id=?")->execute([$id]);
    museum_gc($pdo, [$f]);
}

function museum_delete_room(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    museum_writable($pdo, museum_of_room($pdo, $id));
    $files = $pdo->prepare("SELECT audio_file FROM museum_rooms WHERE id=? UNION ALL SELECT audio_file FROM museum_items WHERE room_id=? UNION ALL SELECT file FROM museum_items WHERE room_id=?");
    $files->execute([$id, $id, $id]);
    $list = $files->fetchAll(PDO::FETCH_COLUMN);
    $pdo->prepare('DELETE FROM museum_items WHERE room_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM museum_rooms WHERE id=?')->execute([$id]);
    museum_gc($pdo, $list);
    return ['ok' => true];
}

/** Change l'ordre des salles d'un musée, ou des œuvres d'une salle (liste des numéros dans le nouvel ordre). */
function museum_reorder(PDO $pdo, array $data): array
{
    $rooms = ($data['what'] ?? '') === 'rooms';
    $ids = array_values(array_map('intval', is_array($data['ids'] ?? null) ? $data['ids'] : []));
    if (!$ids) { return ['ok' => true]; }
    // Tous dans le même musée (salles) ou la même salle (œuvres), et ce musée doit être modifiable
    $groups = array_unique(array_map(static fn($id) => $rooms ? museum_of_room($pdo, $id) : museum_of_item($pdo, $id) . ':' . (int) $pdo->query('SELECT room_id FROM museum_items WHERE id=' . $id)->fetchColumn(), $ids));
    if (count($groups) !== 1 || str_starts_with((string) reset($groups), '0')) { throw new RuntimeException('Ordre impossible : éléments de salles différentes.'); }
    museum_writable($pdo, (int) reset($groups));
    $up = $pdo->prepare('UPDATE ' . ($rooms ? 'museum_rooms' : 'museum_items') . ' SET position=? WHERE id=?');
    foreach ($ids as $k => $id) { $up->execute([$k + 1, $id]); }
    return ['ok' => true];
}

function museum_save_item(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $kind = in_array($data['kind'] ?? '', MUSEUM_KINDS, true) ? $data['kind'] : 'photo';
    $wall = in_array($data['wall'] ?? '', MUSEUM_WALLS, true) ? $data['wall'] : (in_array($kind, ['object', 'decor', 'seat'], true) ? 'center' : 'back');
    if (in_array($kind, ['decor', 'seat'], true)) { $wall = 'center'; }
    $settings = museum_clean_settings($data['settings'] ?? [], ['scale' => 'num', 'px' => 'num', 'pz' => 'num', 'along' => 'num', 'y' => 'num', 'rot' => 'deg', 'model' => MUSEUM_MODELS]);
    $file = safe_text($data['file'] ?? '');
    if ($file !== '' && (!str_starts_with($file, 'musee/') || str_contains($file, '..'))) { $file = ''; }
    $vals = [$kind, $wall, safe_int($data['media_id'] ?? 0) ?: null, safe_int($data['object_id'] ?? 0) ?: null, safe_int($data['person_id'] ?? 0) ?: null, $file,
        mb_substr(safe_text($data['title'] ?? ''), 0, 200), h_long($data, 'cartel', 1000), h_long($data, 'description', 6000), !empty($data['in_tour']) ? 1 : 0, $settings];
    if ($id) {
        museum_writable($pdo, museum_of_item($pdo, $id));
        $pdo->prepare('UPDATE museum_items SET kind=?, wall=?, media_id=?, object_id=?, person_id=?, file=?, title=?, cartel=?, description=?, in_tour=?, settings_json=? WHERE id=?')->execute([...$vals, $id]);
        if (array_key_exists('audio_file', $data) && $data['audio_file'] === '') { museum_drop_file($pdo, 'museum_items', $id); }
        return ['id' => $id];
    }
    $roomId = safe_int($data['room_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM museum_rooms WHERE id=?'); $s->execute([$roomId]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Salle introuvable.'); }
    museum_writable($pdo, museum_of_room($pdo, $roomId));
    $pdo->prepare('INSERT INTO museum_items(kind, wall, media_id, object_id, person_id, file, title, cartel, description, in_tour, settings_json, room_id, position)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(max(position),0)+1 FROM museum_items WHERE room_id=?))')->execute([...$vals, $roomId, $roomId]);
    return ['id' => (int) $pdo->lastInsertId()];
}

function museum_delete_item(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    museum_writable($pdo, museum_of_item($pdo, $id));
    $s = $pdo->prepare('SELECT audio_file, file FROM museum_items WHERE id=?'); $s->execute([$id]);
    $list = array_values((array) $s->fetch(PDO::FETCH_NUM));
    $pdo->prepare('DELETE FROM museum_items WHERE id=?')->execute([$id]);
    museum_gc($pdo, $list);
    return ['ok' => true];
}

/** Fichier envoyé depuis l'ordinateur : un son (salle ou œuvre) ou une image (œuvre qui n'est pas dans la base). */
function museum_upload(PDO $pdo, ?array $file, array $post): never
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { json_response(['error' => 'Fichier non reçu.'], 422); }
    $target = (string) ($post['target'] ?? ''); // room_audio | item_audio | item_image
    $id = safe_int($post['id'] ?? 0);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
    $isAudio = str_ends_with($target, '_audio');
    $ext = $isAudio ? (MUSEUM_AUDIO[$mime] ?? null) : (MUSEUM_IMAGES[$mime] ?? null);
    if (!$ext && $isAudio && in_array(strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION)), ['mp3', 'm4a', 'wav', 'ogg'], true)) { $ext = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION)); }
    if (!$ext) { json_response(['error' => $isAudio ? 'Il faut un son (MP3, M4A, WAV, OGG).' : 'Il faut une image (JPEG, PNG, WebP).'], 422); }
    if ((int) $file['size'] > ($isAudio ? 200 : 40) * 1024 * 1024) { json_response(['error' => 'Fichier trop lourd.'], 422); }
    $table = $target === 'room_audio' ? 'museum_rooms' : 'museum_items';
    $q = $table === 'museum_rooms' ? 'SELECT museum_id FROM museum_rooms WHERE id=?' : 'SELECT r.museum_id FROM museum_items i JOIN museum_rooms r ON r.id=i.room_id WHERE i.id=?';
    $s = $pdo->prepare($q); $s->execute([$id]);
    $museumId = (int) $s->fetchColumn();
    if (!$museumId) { json_response(['error' => 'Salle ou œuvre introuvable.'], 404); }
    try { museum_writable($pdo, $museumId); } catch (RuntimeException $e) { json_response(['error' => $e->getMessage()], 422); }
    $name = bin2hex(random_bytes(10)) . '.' . $ext;
    $dest = museum_dir($museumId) . '/' . $name;
    if (!@move_uploaded_file((string) $file['tmp_name'], $dest) && !@copy((string) $file['tmp_name'], $dest)) { json_response(['error' => 'Impossible de ranger le fichier.'], 500); }
    $rel = 'musee/' . $museumId . '/' . $name;
    if ($isAudio) {
        museum_drop_file($pdo, $table, $id);
        $pdo->prepare("UPDATE {$table} SET audio_file=? WHERE id=?")->execute([$rel, $id]);
    } else {
        $old = $pdo->prepare('SELECT file FROM museum_items WHERE id=?'); $old->execute([$id]);
        $o = (string) $old->fetchColumn();
        $pdo->prepare('UPDATE museum_items SET file=?, media_id=NULL WHERE id=?')->execute([$rel, $id]);
        museum_gc($pdo, [$o]);
    }
    json_response(['ok' => true, 'file' => $rel, 'url' => museum_url($rel)]);
}

function museum_sign(PDO $pdo, array $data): array
{
    $id = safe_int($data['museum_id'] ?? 0) ?: museum_own_id($pdo);
    museum_check($pdo, $id);
    $st = $pdo->prepare('SELECT settings_json FROM museums WHERE id=?'); $st->execute([$id]);
    if ((museum_settings((string) $st->fetchColumn())['guestbook'] ?? true) === false) { throw new RuntimeException('Ce musée n’a pas de livre d’or.'); }
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 80);
    $message = mb_substr(trim((string) ($data['message'] ?? '')), 0, 2000);
    if ($name === '' || $message === '') { throw new RuntimeException('Il faut un nom et un message.'); }
    $pdo->prepare('INSERT INTO museum_guestbook(museum_id, name, message) VALUES(?,?,?)')->execute([$id, $name, $message]);
    return ['guestbook' => museum_get($pdo, $id)['guestbook']];
}

function museum_delete_guestbook(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM museum_guestbook WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

function museum_delete(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT imported FROM museums WHERE id=?'); $s->execute([$id]);
    if ((string) $s->fetchColumn() !== '1') { throw new RuntimeException('Seul un musée reçu peut être supprimé ; le tien se vide salle par salle.'); }
    $GLOBALS['museum_importing'] = true; // un musée reçu ne se modifie pas… sauf pour être supprimé
    try { foreach ($pdo->query('SELECT id FROM museum_rooms WHERE museum_id=' . $id)->fetchAll(PDO::FETCH_COLUMN) as $rid) { museum_delete_room($pdo, ['id' => (int) $rid]); } }
    finally { $GLOBALS['museum_importing'] = false; }
    $pdo->prepare('DELETE FROM museum_guestbook WHERE museum_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM museums WHERE id=?')->execute([$id]);
    $dir = MEDIA_DIR . '/musee/' . $id;
    if (is_dir($dir)) { foreach (glob($dir . '/*') ?: [] as $f) { @unlink($f); } @rmdir($dir); }
    return ['ok' => true];
}

/** Choisir ce qu'on expose : les images de la base, ou les objets de famille. */
function museum_pick(PDO $pdo, string $what, string $q): array
{
    $like = '%' . $q . '%';
    if ($what === 'objects') {
        $s = $pdo->prepare("SELECT o.id, o.title, o.kind, o.description,
                (SELECT m.filename FROM family_collection_media cm JOIN media m ON m.id=cm.media_id WHERE cm.collection_type='family_object' AND cm.collection_id=o.id AND m.media_type='image' ORDER BY cm.position, cm.id LIMIT 1) AS filename
            FROM family_objects o WHERE o.title LIKE ? OR o.kind LIKE ? ORDER BY o.title COLLATE NOCASE LIMIT 80");
        $s->execute([$like, $like]);
        return array_map(static fn($r) => $r + ['url' => museum_url((string) $r['filename'])], $s->fetchAll());
    }
    $s = $pdo->prepare("SELECT m.id, m.title, m.filename, m.date_text, m.description, m.document_reference,
            (SELECT TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) FROM media_links l JOIN persons p ON p.id=l.entity_id WHERE l.media_id=m.id AND l.entity_type='person' ORDER BY l.position LIMIT 1) AS person_name,
            (SELECT l.entity_id FROM media_links l WHERE l.media_id=m.id AND l.entity_type='person' ORDER BY l.position LIMIT 1) AS person_id
        FROM media m WHERE m.media_type='image' AND (? = '' OR m.title LIKE ? OR m.description LIKE ? OR m.date_text LIKE ? OR m.id IN (
            SELECT l.media_id FROM media_links l JOIN persons p ON p.id=l.entity_id WHERE l.entity_type='person' AND (COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) LIKE ?))
        ORDER BY m.id DESC LIMIT 120");
    $s->execute([$q, $like, $like, $like, $like]);
    return array_map(static fn($r) => $r + ['url' => museum_url((string) $r['filename'])], $s->fetchAll());
}

/* ───────────── Partage ───────────── */

/** Image réduite (bord le plus long ≤ $max) en JPEG, pour le site web ; sinon le fichier tel quel. */
function museum_shrunk_image(string $path, int $max): array
{
    $info = @getimagesize($path);
    if ($info && extension_loaded('gd') && max($info[0], $info[1]) > $max) {
        $loader = match ($info[2]) { IMAGETYPE_JPEG => 'imagecreatefromjpeg', IMAGETYPE_PNG => 'imagecreatefrompng', IMAGETYPE_WEBP => 'imagecreatefromwebp', IMAGETYPE_GIF => 'imagecreatefromgif', default => null };
        $img = $loader && function_exists($loader) ? @$loader($path) : null;
        if ($img) {
            $r = $max / max($info[0], $info[1]);
            $small = imagecreatetruecolor(max(1, (int) round($info[0] * $r)), max(1, (int) round($info[1] * $r)));
            imagefill($small, 0, 0, imagecolorallocate($small, 255, 255, 255));
            imagecopyresampled($small, $img, 0, 0, 0, 0, imagesx($small), imagesy($small), $info[0], $info[1]);
            ob_start(); imagejpeg($small, null, 86); $bytes = (string) ob_get_clean();
            return [$bytes, 'image/jpeg', 'jpg'];
        }
    }
    $mime = $info ? (string) $info['mime'] : 'image/jpeg';
    return [(string) file_get_contents($path), $mime, MUSEUM_IMAGES[$mime] ?? 'jpg'];
}

/** Données du musée pour l'export : images et sons repris dans le paquet. */
function museum_package(PDO $pdo, int $id, string $format, ZipArchive $zip): array
{
    $m = museum_get($pdo, $id);
    $n = 0; $done = [];
    $add = function (string $relative, bool $image) use ($zip, $format, &$n, &$done): string {
        if ($relative === '') { return ''; }
        if (isset($done[$relative])) { return $done[$relative]; } // même photo exposée deux fois : un seul fichier
        return $done[$relative] = (function () use ($relative, $image, $zip, $format, &$n): string {
        $path = MEDIA_DIR . '/' . $relative;
        if (!is_file($path)) { return ''; }
        $n++;
        if ($image) {
            [$bytes, $mime, $ext] = museum_shrunk_image($path, $format === 'site' ? 1600 : 2400);
            if ($format === 'site') { return 'data:' . $mime . ';base64,' . base64_encode($bytes); } // dans la page : marche même ouverte d'un double-clic
            $zip->addFromString("fichiers/{$n}.{$ext}", $bytes); return "fichiers/{$n}.{$ext}";
        }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $zip->addFile($path, "fichiers/{$n}.{$ext}"); return "fichiers/{$n}.{$ext}";
        })();
    };
    $rooms = [];
    foreach ($m['rooms'] as $r) {
        $items = [];
        foreach ($r['items'] as $it) {
            $items[] = ['kind' => $it['kind'], 'wall' => $it['wall'], 'title' => $it['title'], 'cartel' => $it['cartel'], 'description' => $it['description'], 'in_tour' => $it['in_tour'], 'settings' => $it['settings'],
                'image' => $it['image'] !== '' ? $add((string) $it['image_file'], true) : '', 'audio' => $add((string) $it['audio_file'], false)];
        }
        $rooms[] = ['name' => $r['name'], 'intro' => $r['intro'], 'settings' => $r['settings'], 'audio' => $add((string) $r['audio_file'], false), 'items' => $items];
    }
    return ['type' => 'lcnda-musee', 'version' => 1, 'title' => $m['title'], 'subtitle' => $m['subtitle'], 'intro' => $m['intro'], 'author' => $m['author'], 'settings' => $m['settings'],
        'rooms' => $rooms, 'guestbook' => array_map(static fn($g) => ['name' => $g['name'], 'message' => $g['message'], 'date' => $g['date']], $m['guestbook'])];
}

/** Télécharge le musée : « site » (site web à ouvrir partout) ou « lcnda » (fichier à importer dans LCNDA). */
function museum_export(PDO $pdo, int $id, string $format): never
{
    if (!class_exists('ZipArchive')) { json_response(['error' => 'Export impossible : l’extension PHP zip manque.'], 500); }
    $id = $id ?: museum_own_id($pdo);
    try { museum_check($pdo, $id); } catch (RuntimeException $e) { json_response(['error' => $e->getMessage()], 404); }
    $format = $format === 'site' ? 'site' : 'lcnda';
    $tmp = tempnam(sys_get_temp_dir(), 'musee');
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) { json_response(['error' => 'Impossible de préparer le fichier.'], 500); }
    $pkg = museum_package($pdo, $id, $format, $zip);
    $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower((string) iconv('UTF-8', 'ASCII//TRANSLIT', $pkg['title'] ?: 'musee'))), '-') ?: 'musee';
    if ($format === 'site') {
        $zip->addFromString('index.html', museum_site_html($pkg));
        $zip->addFromString('LISEZ-MOI.txt', "Musée « {$pkg['title']} »\r\n\r\nOuvrez le fichier index.html (double-clic) : la visite se fait dans le navigateur, sans internet ni logiciel à installer.\r\nPour le mettre en ligne, copiez tout ce dossier sur un hébergement web.\r\n\r\nFait avec LCNDA — Le Carnet numérique des ancêtres.\r\n");
        $name = "musee-{$slug}-site.zip";
    } else {
        $zip->addFromString('musee.json', json_encode($pkg, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $name = "musee-{$slug}.lcnda-musee.zip";
    }
    $zip->close();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp); @unlink($tmp);
    exit;
}

/** Le site web : une seule page qui contient Three.js, le moteur de visite et le musée (images comprises). */
function museum_site_html(array $pkg): string
{
    $three = (string) file_get_contents(APP_ROOT . '/assets/vendor/three.module.js');
    $three = (string) preg_replace('/^export\s*\{/m', 'const THREE = {', $three, 1); // le module devient un simple objet THREE
    $viewer = (string) file_get_contents(APP_ROOT . '/assets/js/museum-viewer.js');
    $css = (string) file_get_contents(APP_ROOT . '/assets/css/museum.css');
    $json = json_encode($pkg, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
    $title = htmlspecialchars((string) ($pkg['title'] ?: 'Musée de famille'), ENT_QUOTES);
    $safe = static fn(string $code) => str_ireplace('</script', '<\/script', $code);
    return "<!doctype html>\n<html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>{$title}</title>
<style>html,body{margin:0;height:100%;background:#fff;font-family:Georgia,'Times New Roman',serif}#musee{position:fixed;inset:0}{$css}</style></head>
<body><div id=\"musee\" tabindex=\"0\"></div>
<script>" . $safe($viewer) . "</script>
<script>(function(){" . $safe($three) . "
var data = " . $json . ";
var key = 'lcnda-musee-livre-' + (data.title || '');
try { data.guestbook = (data.guestbook || []).concat(JSON.parse(localStorage.getItem(key) || '[]')); } catch (e) {}
window.LCNDA_MUSEUM_VIEWER.mount(THREE, document.getElementById('musee'), data, {onSign: function (name, message) {
  var mine = []; try { mine = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
  var entry = {name: name, message: message, date: new Date().toLocaleDateString('fr-FR')}; mine.push(entry);
  try { localStorage.setItem(key, JSON.stringify(mine)); } catch (e) {}
  return Promise.resolve((data.guestbook || []).concat([entry]));
}});
})();</script></body></html>";
}

/** Importe un musée reçu (.lcnda-musee.zip) : il s'ajoute aux « musées reçus », le tien ne change pas. */
function museum_import(PDO $pdo, ?array $file): never
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { json_response(['error' => 'Fichier non reçu.'], 422); }
    if (!class_exists('ZipArchive')) { json_response(['error' => 'Import impossible : l’extension PHP zip manque.'], 500); }
    $zip = new ZipArchive();
    if ($zip->open((string) $file['tmp_name']) !== true) { json_response(['error' => 'Ce fichier n’est pas un musée LCNDA (.lcnda-musee.zip).'], 422); }
    $pkg = json_decode((string) $zip->getFromName('musee.json'), true);
    if (!is_array($pkg) || ($pkg['type'] ?? '') !== 'lcnda-musee') { $zip->close(); json_response(['error' => 'Ce fichier n’est pas un musée LCNDA.'], 422); }
    $pdo->beginTransaction();
    $GLOBALS['museum_importing'] = true;
    try {
        $pdo->prepare('INSERT INTO museums(title, subtitle, intro, author, imported, settings_json) VALUES(?,?,?,?,1,?)')->execute([
            mb_substr(safe_text($pkg['title'] ?? ''), 0, 120) ?: 'Musée reçu', mb_substr(safe_text($pkg['subtitle'] ?? ''), 0, 200), mb_substr((string) ($pkg['intro'] ?? ''), 0, 4000),
            mb_substr(safe_text($pkg['author'] ?? ''), 0, 120), museum_clean_settings($pkg['settings'] ?? [], ['guestbook' => 'bool', 'wall' => 'color'])]);
        $mid = (int) $pdo->lastInsertId();
        $dir = museum_dir($mid);
        $taken = [];
        $take = function ($ref, array $allowed) use ($zip, $dir, $mid, &$taken): string {
            $ref = (string) $ref;
            if (isset($taken[$ref])) { return $taken[$ref]; } // même image pour deux œuvres : un seul fichier
            if (!preg_match('#^fichiers/(\d+)\.([a-z0-9]{2,5})$#', $ref, $mm) || !in_array($mm[2], $allowed, true)) { return ''; }
            $stat = $zip->statName($ref); // taille vérifiée AVANT de décompresser (un petit zip peut cacher un énorme fichier)
            if (!$stat || (int) $stat['size'] > 200 * 1024 * 1024) { return ''; }
            $bytes = $zip->getFromName($ref);
            if ($bytes === false) { return ''; }
            $name = bin2hex(random_bytes(10)) . '.' . $mm[2];
            file_put_contents($dir . '/' . $name, $bytes);
            return $taken[$ref] = 'musee/' . $mid . '/' . $name;
        };
        $images = array_values(array_unique(MUSEUM_IMAGES)); $sounds = array_values(array_unique(MUSEUM_AUDIO));
        foreach (array_slice(is_array($pkg['rooms'] ?? null) ? $pkg['rooms'] : [], 0, 200) as $k => $r) {
            if (!is_array($r)) { continue; }
            $room = museum_save_room($pdo, ['museum_id' => $mid, 'name' => $r['name'] ?? '', 'intro' => $r['intro'] ?? '', 'settings' => $r['settings'] ?? []]);
            $audio = $take($r['audio'] ?? '', $sounds);
            if ($audio) { $pdo->prepare('UPDATE museum_rooms SET audio_file=? WHERE id=?')->execute([$audio, $room['id']]); }
            foreach (array_slice(is_array($r['items'] ?? null) ? $r['items'] : [], 0, 2000) as $it) {
                if (!is_array($it)) { continue; }
                $saved = museum_save_item($pdo, ['room_id' => $room['id'], 'kind' => $it['kind'] ?? 'photo', 'wall' => $it['wall'] ?? 'back', 'title' => $it['title'] ?? '', 'cartel' => $it['cartel'] ?? '',
                    'description' => $it['description'] ?? '', 'in_tour' => $it['in_tour'] ?? 1, 'settings' => $it['settings'] ?? [], 'file' => $take($it['image'] ?? '', $images)]);
                $a = $take($it['audio'] ?? '', $sounds);
                if ($a) { $pdo->prepare('UPDATE museum_items SET audio_file=? WHERE id=?')->execute([$a, $saved['id']]); }
            }
        }
        $ins = $pdo->prepare('INSERT INTO museum_guestbook(museum_id, name, message) VALUES(?,?,?)');
        foreach (array_slice(is_array($pkg['guestbook'] ?? null) ? $pkg['guestbook'] : [], 0, 2000) as $g) {
            if (is_array($g) && trim((string) ($g['message'] ?? '')) !== '') { $ins->execute([$mid, mb_substr(safe_text($g['name'] ?? ''), 0, 80), mb_substr((string) $g['message'], 0, 2000)]); }
        }
        $pdo->commit();
        $GLOBALS['museum_importing'] = false;
    } catch (Throwable $e) {
        $GLOBALS['museum_importing'] = false;
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        $zip->close();
        // les fichiers déjà copiés ne servent plus (et le numéro du musée sera réutilisé)
        if (isset($mid)) { foreach (glob(MEDIA_DIR . '/musee/' . (int) $mid . '/*') ?: [] as $f) { @unlink($f); } @rmdir(MEDIA_DIR . '/musee/' . (int) $mid); }
        json_response(['error' => 'Import impossible : ' . $e->getMessage()], 500);
    }
    $zip->close();
    json_response(['ok' => true, 'id' => $mid]);
}
