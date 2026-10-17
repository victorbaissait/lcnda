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
    return array_map(static function ($r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $floors = is_array($d['floors'] ?? null) ? $d['floors'] : [];
        $rooms = 0; foreach ($floors as $f) { $rooms += is_array($f['rooms'] ?? null) ? count($f['rooms']) : 0; }
        $people = is_array($d['meta']['people'] ?? null) ? count($d['meta']['people']) : 0;
        return ['id' => (int) $r['id'], 'name' => $r['name'], 'place' => $r['place_text'], 'place_id' => (int) $r['place_id'], 'period' => $r['period'], 'thumb' => $r['thumb'],
            'floors' => count($floors), 'rooms' => $rooms, 'people' => $people, 'updated_at' => $r['updated_at']];
    }, $pdo->query('SELECT id, name, place_id, place_text, period, data_json, thumb, updated_at FROM houses ORDER BY updated_at DESC')->fetchAll());
}

function house_get(PDO $pdo, int $id): array
{
    houses_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM houses WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Maison introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'place_id' => (int) $r['place_id'], 'place_text' => $r['place_text'], 'period' => $r['period'],
        'house' => json_decode((string) $r['data_json'], true) ?: new stdClass(), 'updated_at' => $r['updated_at']];
}

function save_house(PDO $pdo, array $data): array
{
    houses_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200) ?: 'Maison de famille';
    $placeId = safe_int($data['place_id'] ?? 0);
    if ($placeId) { $c = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $c->execute([$placeId]); if (!$c->fetchColumn()) { $placeId = 0; } }
    $house = is_array($data['house'] ?? null) ? $data['house'] : [];
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
    houses_ensure($pdo);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'ext' => $r['ext'], 'size' => (int) $r['size'], 'dims' => json_decode((string) $r['dims_json'], true) ?: new stdClass(), 'thumb' => $r['thumb'], 'created_at' => $r['created_at']],
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
