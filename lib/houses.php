<?php
declare(strict_types=1);

/**
 * 🏠 Maisons de famille (interface : assets/js/heritage-house.js et heritage-house3d.js) : le plan d'une maison (étages, murs,
 * portes, fenêtres, pièces, meubles, textures), relié à un lieu et à des personnes, et les objets 3D importés (OBJ, STL, glTF,
 * GLB), rangés à part pour servir dans toutes les maisons. Tables créées à la première utilisation (sans changer le numéro de structure).
 */

const HOUSE_DOC_MAX = 6000000;
const HOUSE_MODEL_MAX = 30000000;
const HOUSE_MODEL_EXT = ['obj', 'stl', 'glb', 'gltf', 'mtl'];

function houses_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS houses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', place_id INTEGER, place_text TEXT NOT NULL DEFAULT '',
        period TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}', thumb TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS house_models (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', ext TEXT NOT NULL, filename TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
        dims_json TEXT NOT NULL DEFAULT '{}', thumb TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function house_models_dir(): string
{
    $dir = SHARED_DATA_DIR . '/house-models';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    return $dir;
}

function houses_list(PDO $pdo): array
{
    houses_ensure($pdo);
    $rows = array_map(static function ($r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $floors = is_array($d['floors'] ?? null) ? $d['floors'] : [];
        $rooms = 0; foreach ($floors as $f) { $rooms += is_array($f['rooms'] ?? null) ? count($f['rooms']) : 0; }
        $people = is_array($d['meta']['people'] ?? null) ? count($d['meta']['people']) : 0;
        return ['id' => (int) $r['id'], 'name' => $r['name'], 'place' => $r['place_text'], 'place_id' => (int) $r['place_id'], 'period' => $r['period'], 'thumb' => $r['thumb'],
            'floors' => count($floors), 'rooms' => $rooms, 'people' => $people, 'updated_at' => $r['updated_at'], 'links' => house_links_of($d)];
    }, $pdo->query('SELECT id, name, place_id, place_text, period, data_json, thumb, updated_at FROM houses ORDER BY updated_at DESC')->fetchAll());
    return house_links_fresh($pdo, $rows);
}

/* ═════════ Les liens d'une maison : personnes, recensements, époques ═════════ */

/** ce à quoi la maison est rattachée : ses habitants (et les personnes liées à ses pièces, à toutes les époques), ses recensements (et l'époque de chacun), ses époques */
function house_links_of(array $d): array
{
    $people = [];
    $add = static function (mixed $p, string $how) use (&$people): void {
        if (!is_array($p)) { return; }
        $pid = (int) ($p['id'] ?? 0); if ($pid <= 0) { return; }
        $people[$pid] ??= ['id' => $pid, 'label' => mb_substr((string) ($p['label'] ?? ''), 0, 200), 'how' => []];
        if ($how !== '' && !in_array($how, $people[$pid]['how'], true) && count($people[$pid]['how']) < 6) { $people[$pid]['how'][] = $how; }
    };
    foreach ((array) ($d['meta']['people'] ?? []) as $p) { $add($p, 'habitant' . (is_array($p) && trim((string) ($p['role'] ?? '')) !== '' ? ' (' . mb_substr(trim((string) $p['role']), 0, 80) . ')' : '')); }
    $sets = [is_array($d['floors'] ?? null) ? $d['floors'] : []];
    foreach ((array) ($d['versions'] ?? []) as $v) { if (is_array($v) && is_array($v['floors'] ?? null)) { $sets[] = $v['floors']; } }
    foreach ($sets as $fl) { foreach ($fl as $f) { foreach ((array) (is_array($f) ? ($f['rooms'] ?? []) : []) as $rm) { if (is_array($rm)) { foreach ((array) ($rm['people'] ?? []) as $p) { $add($p, 'pièce : ' . mb_substr((string) ($rm['name'] ?? 'Pièce'), 0, 60)); } } } } }
    $census = [];
    foreach ((array) ($d['meta']['census'] ?? []) as $c) {
        $cid = is_array($c) ? (int) ($c['id'] ?? 0) : 0; if ($cid <= 0 || isset($census[$cid])) { continue; }
        $census[$cid] = ['id' => $cid, 'label' => mb_substr((string) ($c['label'] ?? ''), 0, 200), 'short' => mb_substr((string) ($c['short'] ?? ''), 0, 120), 'pid' => (int) ($c['pid'] ?? 0), 'ver' => (string) ($c['ver'] ?? '')];
    }
    $vers = [];
    foreach ((array) ($d['versions'] ?? []) as $v) { if (is_array($v) && (string) ($v['id'] ?? '') !== '') { $vers[] = ['id' => (string) $v['id'], 'label' => mb_substr((string) ($v['label'] ?? ''), 0, 120), 'date' => mb_substr((string) ($v['date'] ?? ''), 0, 40)]; } }
    return ['people' => array_values($people), 'census' => array_values($census), 'versions' => $vers, 'ver' => (string) ($d['ver'] ?? '')];
}

/** le libellé d'un recensement (« Recensement 1906 · Bourg · rue Haute ») et la personne principale de son foyer */
function house_census_info(PDO $pdo, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids))); if (!$ids) { return []; }
    $in = implode(',', $ids); $out = [];
    foreach ($pdo->query("SELECT c.id, c.year, c.address, pl.name AS place, (SELECT m.person_id FROM census_members m WHERE m.census_id=c.id AND m.person_id IS NOT NULL ORDER BY m.is_primary DESC, m.id LIMIT 1) AS pid
        FROM census_records c LEFT JOIN places pl ON pl.id=c.place_id WHERE c.id IN ($in)") as $r) {
        $place = trim((string) $r['place']); $addr = trim((string) $r['address']);
        $out[(int) $r['id']] = ['label' => 'Recensement ' . $r['year'] . ($place !== '' ? ' · ' . $place : '') . ($addr !== '' ? ' · ' . $addr : ''), 'short' => $r['year'] . (($place ?: $addr) !== '' ? ' · ' . ($place ?: $addr) : ''), 'pid' => (int) $r['pid'], 'year' => (int) $r['year']];
    }
    return $out;
}

/** les noms des personnes et les libellés des recensements, tenus à jour (une fiche renommée, un recensement déplacé) */
function house_links_fresh(PDO $pdo, array $rows): array
{
    $pids = []; $cids = [];
    foreach ($rows as $r) { foreach ($r['links']['people'] as $p) { $pids[] = (int) $p['id']; } foreach ($r['links']['census'] as $c) { $cids[] = (int) $c['id']; } }
    $names = [];
    if ($pids) { foreach ($pdo->query('SELECT id, first_name, last_name FROM persons WHERE id IN (' . implode(',', array_unique(array_map('intval', $pids))) . ')') as $p) { $names[(int) $p['id']] = trim($p['first_name'] . ' ' . $p['last_name']); } }
    $cs = house_census_info($pdo, array_unique($cids));
    foreach ($rows as &$r) {
        $r['links']['people'] = array_values(array_filter(array_map(static function ($p) use ($names) { if (!isset($names[$p['id']])) { return null; } if ($names[$p['id']] !== '') { $p['label'] = $names[$p['id']]; } return $p; }, $r['links']['people'])));
        $r['links']['census'] = array_values(array_filter(array_map(static function ($c) use ($cs) { if (!isset($cs[$c['id']])) { return null; } return array_merge($c, ['label' => $cs[$c['id']]['label'], 'short' => $cs[$c['id']]['short'], 'pid' => $cs[$c['id']]['pid'] ?: $c['pid']]); }, $r['links']['census'])));
    }
    unset($r);
    return $rows;
}

/** les maisons rattachées à une personne (habitant, pièce, ou un recensement où elle est) ou à un recensement — pour le bloc « 🏠 Maisons » de la fiche et la fenêtre d'un recensement */
function house_links_lookup(PDO $pdo, int $personId, int $censusId): array
{
    houses_ensure($pdo);
    if ($personId <= 0 && $censusId <= 0) { return []; }
    $mine = [];
    if ($personId > 0) { $s = $pdo->prepare('SELECT DISTINCT census_id FROM census_members WHERE person_id=?'); $s->execute([$personId]); $mine = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); }
    $out = [];
    // un premier tri sans lire les plans (qui peuvent être lourds) : le numéro cherché doit y paraître
    $needles = []; foreach (array_unique(array_filter([$personId, $censusId, ...$mine])) as $n) { $needles[] = '"id":' . (int) $n . ','; $needles[] = '"id":' . (int) $n . '}'; }
    $s = $pdo->prepare('SELECT id, name, place_text, period, thumb, data_json, updated_at FROM houses WHERE ' . implode(' OR ', array_fill(0, count($needles), 'instr(data_json, ?) > 0')) . ' ORDER BY updated_at DESC'); $s->execute($needles);
    foreach ($s as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: []; $l = house_links_of($d); $why = []; $ver = '';
        $vname = static function (string $id) use ($l): string { foreach ($l['versions'] as $v) { if ($v['id'] === $id) { return trim($v['date'] . ($v['date'] !== '' && $v['label'] !== '' ? ' · ' : '') . $v['label']); } } return ''; };
        if ($personId > 0) { foreach ($l['people'] as $p) { if ($p['id'] === $personId) { $why = array_merge($why, $p['how']); } } }
        foreach ($l['census'] as $c) {
            if (($censusId > 0 && $c['id'] === $censusId) || ($personId > 0 && in_array($c['id'], $mine, true))) { $why[] = 'census:' . $c['id']; if ($c['ver'] !== '' && $ver === '') { $ver = $c['ver']; } }
        }
        if (!$why) { continue; }
        $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'place' => $r['place_text'], 'period' => $r['period'], 'thumb' => $r['thumb'], 'why' => $why, 'ver' => $ver, 'ver_label' => $ver !== '' ? $vname($ver) : '', 'versions' => count($l['versions']), 'updated_at' => $r['updated_at']];
    }
    // les recensements : leur libellé lisible
    $cids = []; foreach ($out as $h) { foreach ($h['why'] as $w) { if (str_starts_with($w, 'census:')) { $cids[] = (int) substr($w, 7); } } }
    $cs = house_census_info($pdo, array_unique($cids));
    foreach ($out as &$h) { $h['why'] = array_values(array_unique(array_map(static fn($w) => str_starts_with($w, 'census:') ? ('recensement ' . ($cs[(int) substr($w, 7)]['short'] ?? '')) : $w, $h['why']))); }
    unset($h);
    return $out;
}

/** rattacher (ou détacher) un recensement ou une personne à une maison, depuis la fenêtre du recensement ou la fiche ; « ver » : l'époque de la maison */
function house_link_set(PDO $pdo, array $data): array
{
    houses_ensure($pdo);
    $id = safe_int($data['house_id'] ?? 0); $cid = safe_int($data['census_id'] ?? 0); $pid = safe_int($data['person_id'] ?? 0); $on = !empty($data['on']);
    $ver = preg_match('/^[\w.:-]{1,60}$/', (string) ($data['ver'] ?? '')) ? (string) $data['ver'] : '';
    $s = $pdo->prepare('SELECT name, data_json FROM houses WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Maison introuvable.'); }
    $d = json_decode((string) $r['data_json'], true) ?: [];
    $d['meta'] = is_array($d['meta'] ?? null) ? $d['meta'] : ['people' => [], 'note' => ''];
    if ($cid > 0) {
        $list = array_values(array_filter((array) ($d['meta']['census'] ?? []), static fn($c) => is_array($c) && (int) ($c['id'] ?? 0) !== $cid));
        if ($on) {
            $info = house_census_info($pdo, [$cid])[$cid] ?? null; if (!$info) { throw new RuntimeException('Recensement introuvable.'); }
            $vers = array_column(array_filter((array) ($d['versions'] ?? []), 'is_array'), 'id');
            $list[] = ['id' => $cid, 'label' => $info['label'], 'short' => $info['short'], 'pid' => $info['pid']] + ($ver !== '' && in_array($ver, $vers, true) ? ['ver' => $ver] : []);
        }
        $d['meta']['census'] = $list;
    } elseif ($pid > 0) {
        $list = array_values(array_filter((array) ($d['meta']['people'] ?? []), static fn($p) => is_array($p) && (int) ($p['id'] ?? 0) !== $pid));
        if ($on) { $n = $pdo->prepare('SELECT trim(first_name || \' \' || last_name) FROM persons WHERE id=?'); $n->execute([$pid]); $label = (string) $n->fetchColumn(); if ($label === '') { throw new RuntimeException('Personne introuvable.'); } $list[] = ['id' => $pid, 'label' => $label, 'role' => mb_substr(safe_text($data['role'] ?? ''), 0, 200)]; }
        $d['meta']['people'] = $list;
    } else { throw new RuntimeException('Rien à rattacher.'); }
    $json = json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $pdo->prepare('UPDATE houses SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$json, $id]);
    log_change($pdo, 'meta', 0, 'update', ($on ? 'Maison rattachée : ' : 'Maison détachée : ') . $r['name']);
    return ['ok' => true];
}

/** un plan reçu : les recensements rattachés et les époques gardent une forme simple (le reste est vérifié à l'affichage) */
function house_clean_links(array $house): array
{
    if (isset($house['meta']['census'])) {
        $house['meta']['census'] = array_slice(array_values(array_map(static fn($c) => array_filter(['id' => (int) ($c['id'] ?? 0), 'label' => mb_substr(safe_text($c['label'] ?? ''), 0, 200), 'short' => mb_substr(safe_text($c['short'] ?? ''), 0, 120), 'pid' => (int) ($c['pid'] ?? 0),
            'ver' => preg_match('/^[\w.:-]{1,60}$/', (string) ($c['ver'] ?? '')) ? (string) $c['ver'] : ''], static fn($v) => $v !== '' && $v !== 0), array_filter((array) $house['meta']['census'], static fn($c) => is_array($c) && (int) ($c['id'] ?? 0) > 0))), 0, 300);
    }
    if (isset($house['versions'])) {
        $house['versions'] = array_slice(array_values(array_map(static function ($v) {
            $o = ['id' => preg_match('/^[\w.:-]{1,60}$/', (string) ($v['id'] ?? '')) ? (string) $v['id'] : 'v' . bin2hex(random_bytes(4)), 'label' => mb_substr(safe_text($v['label'] ?? ''), 0, 120), 'date' => mb_substr(safe_text($v['date'] ?? ''), 0, 40)];
            if (is_array($v['floors'] ?? null)) { $o['floors'] = $v['floors']; }
            if (is_array($v['roof'] ?? null)) { $o['roof'] = $v['roof']; }
            return $o;
        }, array_filter((array) $house['versions'], 'is_array'))), 0, 100);
        if (!$house['versions']) { unset($house['ver']); }
    }
    return $house;
}

function house_get(PDO $pdo, int $id): array
{
    houses_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM houses WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Maison introuvable.'); }
    // ☀️ les coordonnées du lieu (lumière du jour de la vue 3D) ; sans lieu : la France par défaut, côté navigateur
    $lat = null; $lon = null;
    if ((int) $r['place_id'] > 0) {
        try { $p = $pdo->prepare('SELECT latitude, longitude FROM places WHERE id=?'); $p->execute([(int) $r['place_id']]); $c = $p->fetch();
            if ($c && is_numeric($c['latitude']) && is_numeric($c['longitude']) && abs((float) $c['latitude']) <= 90 && abs((float) $c['longitude']) <= 180) { $lat = round((float) $c['latitude'], 5); $lon = round((float) $c['longitude'], 5); }
        } catch (Throwable $_) {}
    }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'place_id' => (int) $r['place_id'], 'place_text' => $r['place_text'], 'period' => $r['period'],
        'place_lat' => $lat, 'place_lon' => $lon,
        'house' => json_decode((string) $r['data_json'], true) ?: new stdClass(), 'updated_at' => $r['updated_at']];
}

function save_house(PDO $pdo, array $data): array
{
    houses_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200) ?: 'Maison de famille';
    $placeId = safe_int($data['place_id'] ?? 0);
    if ($placeId) { $c = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $c->execute([$placeId]); if (!$c->fetchColumn()) { $placeId = 0; } }
    $house = house_clean_links(is_array($data['house'] ?? null) ? $data['house'] : []); // recensements rattachés, époques
    // une image importée (vue de dessus d'un objet, plan scanné) : seulement des images sûres
    $json = json_encode($house, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > HOUSE_DOC_MAX) { throw new RuntimeException('Plan trop lourd (6 Mo au plus) : un plan scanné plus petit ?'); }
    if (preg_match('#(?:javascript:|<script|data:(?!image/(?:png|jpeg|webp|gif);base64,))#i', $json)) { throw new RuntimeException('Le plan contient un contenu refusé.'); }
    $thumb = (string) ($data['thumb'] ?? '');
    if (strlen($thumb) > 400000 || !preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $thumb)) { $thumb = ''; }
    $vals = [$name, $placeId ?: null, mb_substr(safe_text($data['place_text'] ?? ''), 0, 200), mb_substr(safe_text($data['period'] ?? ''), 0, 120), $json, $thumb];
    if ($id) {
        $s = $pdo->prepare('UPDATE houses SET name=?, place_id=?, place_text=?, period=?, data_json=?, thumb=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([...$vals, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Maison introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO houses(name, place_id, place_text, period, data_json, thumb) VALUES(?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, 'update', 'Plan de maison enregistré : ' . $name);
    return ['id' => $id];
}

function delete_house(PDO $pdo, array $data): array
{
    houses_ensure($pdo);
    $pdo->prepare('DELETE FROM houses WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

function rename_house(PDO $pdo, array $data): array
{
    houses_ensure($pdo);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($name === '') { throw new RuntimeException('Nom manquant.'); }
    $pdo->prepare('UPDATE houses SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

/* ─── objets 3D importés ─── */
function house_models_list(PDO $pdo): array
{
    house_lib_ensure($pdo); // licence, auteur, source, catégorie (lib/house_library.php)
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'ext' => $r['ext'], 'size' => (int) $r['size'], 'dims' => json_decode((string) $r['dims_json'], true) ?: new stdClass(), 'thumb' => $r['thumb'], 'created_at' => $r['created_at'],
        'license' => $r['license'], 'author' => $r['author'], 'source' => $r['source'], 'source_url' => $r['source_url'], 'cat' => $r['cat'], 'mtl' => (int) $r['mtl_id']],
        $pdo->query('SELECT * FROM house_models ORDER BY created_at DESC')->fetchAll());
}

/** un fichier 3D envoyé (multipart « file ») : vérifié (extension, taille, début du fichier), rangé à part, jamais exécuté */
function house_model_upload(PDO $pdo, ?array $file, array $post): never
{
    houses_ensure($pdo);
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) { json_response(['error' => 'Aucun fichier reçu.'], 422); }
    $ext = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, HOUSE_MODEL_EXT, true)) { json_response(['error' => 'Formats 3D acceptés : OBJ, STL, GLB, glTF (et MTL pour les couleurs d’un OBJ).'], 422); }
    $size = (int) filesize((string) $file['tmp_name']);
    if ($size <= 0 || $size > HOUSE_MODEL_MAX) { json_response(['error' => 'Fichier 3D trop gros (30 Mo au plus).'], 422); }
    $head = (string) file_get_contents((string) $file['tmp_name'], false, null, 0, 512);
    $ok = match ($ext) {
        'glb' => str_starts_with($head, 'glTF'),
        'gltf' => str_starts_with(ltrim($head), '{'),
        'stl' => true, // binaire ou texte
        default => !preg_match('/[\x00-\x08\x0E-\x1F]/', $head), // OBJ, MTL : du texte
    };
    if (!$ok) { json_response(['error' => 'Ce fichier ne ressemble pas à un fichier ' . strtoupper($ext) . '.'], 422); }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file((string) $file['tmp_name'], house_models_dir() . '/' . $name)) { json_response(['error' => 'Enregistrement impossible.'], 500); }
    $title = mb_substr(safe_text($post['name'] ?? ''), 0, 120) ?: pathinfo((string) $file['name'], PATHINFO_FILENAME);
    $dims = json_decode((string) ($post['dims'] ?? '{}'), true); $dims = is_array($dims) ? array_map(static fn($v) => is_numeric($v) ? round((float) $v, 2) : 0, array_intersect_key($dims, ['w' => 1, 'd' => 1, 'h' => 1])) : [];
    $thumb = (string) ($post['thumb'] ?? ''); if (strlen($thumb) > 200000 || !preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $thumb)) { $thumb = ''; }
    $pdo->prepare('INSERT INTO house_models(name, ext, filename, size, dims_json, thumb) VALUES(?,?,?,?,?,?)')->execute([$title, $ext, $name, $size, json_encode($dims), $thumb]);
    json_response(['ok' => true, 'result' => ['id' => (int) $pdo->lastInsertId(), 'name' => $title, 'ext' => $ext]]);
}

function house_model_file(PDO $pdo, int $id): never
{
    houses_ensure($pdo);
    $s = $pdo->prepare('SELECT ext, filename FROM house_models WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    $path = $r ? house_models_dir() . '/' . basename((string) $r['filename']) : '';
    if (!$r || !is_file($path)) { http_response_code(404); exit; }
    header('Content-Type: ' . ($r['ext'] === 'glb' ? 'model/gltf-binary' : ($r['ext'] === 'gltf' ? 'model/gltf+json' : 'application/octet-stream')));
    header('Content-Length: ' . filesize($path)); header('X-Content-Type-Options: nosniff'); header('Cache-Control: private, max-age=86400');
    readfile($path); exit;
}

function delete_house_model(PDO $pdo, array $data): array
{
    houses_ensure($pdo);
    $s = $pdo->prepare('SELECT filename FROM house_models WHERE id=?'); $s->execute([safe_int($data['id'] ?? 0)]); $f = $s->fetchColumn();
    if ($f) { @unlink(house_models_dir() . '/' . basename((string) $f)); }
    $pdo->prepare('DELETE FROM house_models WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}
