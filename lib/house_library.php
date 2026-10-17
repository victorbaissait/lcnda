<?php
declare(strict_types=1);

/**
 * 🏠 Plan de maison : la bibliothèque d'objets au-delà du mobilier intégré (interface : assets/js/heritage-house-lib.js).
 *  - « Créer un objet » : ses propres objets (nom, catégorie, taille, couleur, forme vue de dessus et en 3D, image), table house_objects ;
 *  - « 📦 Bibliothèque en ligne (libre de droit) » : les modèles 3D de Poly Haven (CC0, domaine public), cherchés et téléchargés
 *    par le serveur (https seulement, liste fermée d'adresses, chaque redirection vérifiée, tailles et durées bornées), puis
 *    rangés comme un objet importé (« Mes objets ») au format GLB (un seul fichier : textures et données intégrées) ;
 *  - « 📦 Pack ZIP » : un pack téléchargé soi-même (Kenney, Quaternius, OpenGameArt en CC0…) dont on choisit les modèles.
 * La licence, l'auteur et la source de chaque modèle sont gardés avec lui et affichés.
 */

const HOUSE_LIB_HOSTS = ['api.polyhaven.com', 'dl.polyhaven.org', 'cdn.polyhaven.com'];
const HOUSE_LIB_UA = 'LCNDA-genealogie/1.0 (plan de maison familiale; +https://github.com/victorbaissait/lcnda)';
const HOUSE_LIB_TOTAL_MAX = 40000000;   // un modèle et ses textures : 40 Mo au plus
const HOUSE_PACK_MAX = 150000000;       // un pack ZIP : 150 Mo au plus
const HOUSE_LIB_ACTIONS = ['house_objects', 'save_house_object', 'delete_house_object', 'house_online', 'house_online_thumb', 'house_online_import',
    'house_model_meta', 'update_house_model', 'house_pack_upload', 'house_pack_import', 'house_pack_cancel'];
const HOUSE_OBJ_SHAPES2D = ['box', 'rounded', 'round', 'oval', 'lshape', 'tri', 'table', 'chair', 'armchair', 'sofa', 'bed1', 'bed2', 'cabinet', 'wardrobe', 'drawers', 'chest', 'shelves', 'plant', 'barrel', 'desk', 'rug', 'animal', 'hut', 'cone'];
const HOUSE_OBJ_SHAPES3D = ['box', 'cyl', 'table', 'legsbox', 'cabinet', 'wardrobe', 'drawers', 'chest', 'shelves', 'chair', 'sofa', 'bed1', 'plant', 'ball', 'cone', 'hut', 'lshape', 'rug', 'animal', 'img'];

function house_lib_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    houses_ensure($pdo);
    $cols = array_column($pdo->query('PRAGMA table_info(house_models)')->fetchAll(), 'name');
    foreach (['license' => "TEXT NOT NULL DEFAULT ''", 'author' => "TEXT NOT NULL DEFAULT ''", 'source' => "TEXT NOT NULL DEFAULT ''", 'source_url' => "TEXT NOT NULL DEFAULT ''", 'cat' => "TEXT NOT NULL DEFAULT ''", 'mtl_id' => 'INTEGER NOT NULL DEFAULT 0'] as $c => $def) {
        if (!in_array($c, $cols, true)) { $pdo->exec("ALTER TABLE house_models ADD COLUMN $c $def"); }
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS house_objects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', cat TEXT NOT NULL DEFAULT '', w REAL NOT NULL DEFAULT 60, d REAL NOT NULL DEFAULT 60,
        h REAL NOT NULL DEFAULT 80, color TEXT NOT NULL DEFAULT '#9a8a7a', shape2d TEXT NOT NULL DEFAULT 'box', shape3d TEXT NOT NULL DEFAULT 'box', img TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

/** toutes les demandes de la bibliothèque (lecture et écriture) : hors de la grande transaction, car un téléchargement peut durer */
function house_lib_dispatch(PDO $pdo, string $action, bool $isWrite, array $data): never
{
    try {
        house_lib_ensure($pdo);
        $get = static fn(string $k) => $_GET[$k] ?? '';
        if (!$isWrite) {
            match ($action) {
                'house_objects' => json_response(['items' => house_objects_list($pdo)]),
                'house_online' => json_response(house_online_search((string) $get('source'), (string) $get('q'), (string) $get('cat'))),
                'house_online_thumb' => house_online_thumb((string) $get('id')),
                default => json_response(['error' => 'Cette demande doit être un envoi.'], 405),
            };
        }
        $result = match ($action) {
            'save_house_object' => save_house_object($pdo, $data),
            'delete_house_object' => delete_house_object($pdo, $data),
            'house_online_import' => house_online_import($pdo, $data),
            'house_model_meta' => house_model_meta($pdo, $data),
            'update_house_model' => update_house_model($pdo, $data),
            'house_pack_upload' => house_pack_upload($_FILES['file'] ?? null),
            'house_pack_import' => house_pack_import($pdo, $data),
            'house_pack_cancel' => house_pack_cancel($data),
            default => throw new RuntimeException('Demande inconnue.'),
        };
        json_response(['ok' => true, 'result' => $result]);
    } catch (Throwable $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}

/* ═════════ Mes objets créés ═════════ */
function house_obj_row(array $r): array
{
    return ['id' => (int) $r['id'], 'kind' => 'u' . $r['id'], 'name' => $r['name'], 'cat' => $r['cat'], 'w' => (float) $r['w'], 'd' => (float) $r['d'], 'h' => (float) $r['h'], 'color' => $r['color'],
        'shape2d' => $r['shape2d'], 'shape3d' => $r['shape3d'], 'img' => $r['img'], 'note' => $r['note'], 'updated_at' => $r['updated_at']];
}

function house_objects_list(PDO $pdo): array
{
    return array_map('house_obj_row', $pdo->query('SELECT * FROM house_objects ORDER BY name COLLATE NOCASE')->fetchAll());
}

/** une catégorie : un nom court, sans balise ni caractère de contrôle */
function house_lib_cat(mixed $v): string
{
    return mb_substr(trim(preg_replace('/[\x00-\x1F\x7F<>]/u', '', safe_text($v)) ?? ''), 0, 40);
}

function save_house_object(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $name = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', '', safe_text($d['name'] ?? '')) ?? ''), 0, 80);
    if ($name === '') { throw new RuntimeException('Donne un nom à l’objet.'); }
    $num = static function ($v, float $min, float $max, float $def): float { $n = is_numeric($v) ? (float) $v : $def; return round(max($min, min($max, $n)), 1); };
    $color = preg_match('/^#[0-9a-f]{6}$/i', (string) ($d['color'] ?? '')) ? strtolower((string) $d['color']) : '#9a8a7a';
    $s2 = in_array($d['shape2d'] ?? '', HOUSE_OBJ_SHAPES2D, true) ? $d['shape2d'] : 'box';
    $s3 = in_array($d['shape3d'] ?? '', HOUSE_OBJ_SHAPES3D, true) ? $d['shape3d'] : 'box';
    $img = (string) ($d['img'] ?? '');
    if ($img !== '' && (strlen($img) > 400000 || !preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $img))) { throw new RuntimeException('Image refusée : une image PNG, JPEG ou WebP de moins de 300 Ko.'); }
    if ($s3 === 'img' && $img === '') { $s3 = 'box'; }
    $vals = [$name, house_lib_cat($d['cat'] ?? '') ?: 'Mes objets', $num($d['w'] ?? 0, 1, 5000, 60), $num($d['d'] ?? 0, 1, 5000, 60), $num($d['h'] ?? 0, 0.5, 2000, 80), $color, $s2, $s3, $img, mb_substr(safe_text($d['note'] ?? ''), 0, 1000)];
    if ($id) {
        $s = $pdo->prepare('UPDATE house_objects SET name=?, cat=?, w=?, d=?, h=?, color=?, shape2d=?, shape3d=?, img=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([...$vals, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Objet introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO house_objects(name, cat, w, d, h, color, shape2d, shape3d, img, note) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    $s = $pdo->prepare('SELECT * FROM house_objects WHERE id=?'); $s->execute([$id]);
    return house_obj_row($s->fetch());
}

function delete_house_object(PDO $pdo, array $d): array
{
    $pdo->prepare('DELETE FROM house_objects WHERE id=?')->execute([safe_int($d['id'] ?? 0)]);
    return ['ok' => true];
}

/* ═════════ Les objets 3D importés : mesures, vignette, nom, catégorie ═════════ */
function house_model_meta(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $dims = is_array($d['dims'] ?? null) ? $d['dims'] : [];
    $dims = array_map(static fn($v) => is_numeric($v) ? round(max(0, min(100000, (float) $v)), 2) : 0, array_intersect_key($dims, ['w' => 1, 'd' => 1, 'h' => 1]));
    $thumb = (string) ($d['thumb'] ?? '');
    $sets = ['dims_json=?']; $vals = [json_encode($dims)];
    if ($thumb !== '' && strlen($thumb) <= 200000 && preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $thumb)) { $sets[] = "thumb=CASE WHEN thumb='' OR ? THEN ? ELSE thumb END"; $vals[] = !empty($d['force_thumb']) ? 1 : 0; $vals[] = $thumb; }
    $pdo->prepare('UPDATE house_models SET ' . implode(', ', $sets) . ' WHERE id=?')->execute([...$vals, $id]);
    return ['ok' => true];
}

function update_house_model(PDO $pdo, array $d): array
{
    $name = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', '', safe_text($d['name'] ?? '')) ?? ''), 0, 120);
    if ($name === '') { throw new RuntimeException('Nom manquant.'); }
    $pdo->prepare('UPDATE house_models SET name=?, cat=? WHERE id=?')->execute([$name, house_lib_cat($d['cat'] ?? ''), safe_int($d['id'] ?? 0)]);
    return ['ok' => true];
}

/** un fichier 3D rangé avec sa licence (comme un envoi, mais depuis le serveur) */
function house_lib_store(PDO $pdo, string $bytes, string $ext, string $name, array $meta): int
{
    if ($bytes === '' || strlen($bytes) > HOUSE_MODEL_MAX) { throw new RuntimeException('Modèle trop gros (30 Mo au plus) ou vide.'); }
    $file = bin2hex(random_bytes(16)) . '.' . $ext;
    if (file_put_contents(house_models_dir() . '/' . $file, $bytes) === false) { throw new RuntimeException('Enregistrement impossible.'); }
    $txt = static fn($k, $n = 200) => mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', '', safe_text($meta[$k] ?? '')) ?? ''), 0, $n);
    $url = trim((string) ($meta['source_url'] ?? '')); if (strlen($url) > 400 || filter_var($url, FILTER_VALIDATE_URL) === false || strtolower((string) parse_url($url, PHP_URL_SCHEME)) !== 'https' || preg_match('/[\s"<>\'`]/', $url)) { $url = ''; }
    $thumb = (string) ($meta['thumb'] ?? ''); if (strlen($thumb) > 200000 || !preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $thumb)) { $thumb = ''; }
    $pdo->prepare('INSERT INTO house_models(name, ext, filename, size, dims_json, thumb, license, author, source, source_url, cat, mtl_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([mb_substr($name, 0, 120) ?: 'Objet 3D', $ext, $file, strlen($bytes), '{}', $thumb, $txt('license', 120), $txt('author'), $txt('source', 120), $url, house_lib_cat($meta['cat'] ?? ''), safe_int($meta['mtl_id'] ?? 0)]);
    return (int) $pdo->lastInsertId();
}

/* ═════════ Internet : seulement en https, vers des adresses connues ═════════ */
function house_lib_url_ok(string $url): bool
{
    $p = parse_url($url);
    return is_array($p) && ($p['scheme'] ?? '') === 'https' && in_array(strtolower((string) ($p['host'] ?? '')), HOUSE_LIB_HOSTS, true) && !isset($p['user']) && !isset($p['pass']) && (!isset($p['port']) || (int) $p['port'] === 443);
}

/** une page ou un fichier : chaque redirection est vérifiée (elle doit rester dans la liste), taille et durée bornées */
function house_lib_http(string $url, int $max): array
{
    for ($hop = 0; $hop < 4; $hop++) {
        if (!house_lib_url_ok($url)) { throw new RuntimeException('Adresse refusée (seules les adresses de la bibliothèque en ligne sont permises).'); }
        if (function_exists('house_lib_http_mock')) { $r = house_lib_http_mock($url, $max); } // tests : un faux internet
        else {
            if (!function_exists('curl_init')) { throw new RuntimeException('Téléchargement impossible : PHP n’a pas l’extension curl.'); }
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 60,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => HOUSE_LIB_UA, CURLOPT_HEADER => false, CURLOPT_ENCODING => '',
                CURLOPT_NOPROGRESS => false, CURLOPT_PROGRESSFUNCTION => static fn($c, $dlT, $dl) => ($dlT > $max || $dl > $max) ? 1 : 0] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
            $body = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $errno = curl_errno($ch); $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            curl_close($ch);
            if ($errno === CURLE_ABORTED_BY_CALLBACK) { throw new RuntimeException('Fichier trop gros pour être téléchargé.'); }
            if ($body === false) { throw new RuntimeException('La bibliothèque en ligne ne répond pas : vérifie la connexion à internet (ou réessaie plus tard).'); }
            $r = ['code' => $code, 'body' => (string) $body, 'location' => $loc, 'type' => $type];
        }
        if (in_array($r['code'], [301, 302, 303, 307, 308], true) && $r['location'] !== '') { $url = $r['location']; continue; }
        if ($r['code'] === 429) { throw new RuntimeException('La bibliothèque demande de patienter (trop de demandes) : réessaie dans une minute.'); }
        if ($r['code'] === 404) { throw new RuntimeException('Modèle introuvable dans la bibliothèque.'); }
        if ($r['code'] < 200 || $r['code'] >= 300) { throw new RuntimeException("La bibliothèque a répondu par une erreur ({$r['code']})."); }
        if (strlen($r['body']) > $max) { throw new RuntimeException('Fichier trop gros pour être téléchargé.'); }
        return $r;
    }
    throw new RuntimeException('Trop de redirections.');
}

function house_lib_json(string $url): array
{
    $j = json_decode(house_lib_http($url, 15000000)['body'], true);
    if (!is_array($j)) { throw new RuntimeException('Réponse illisible de la bibliothèque en ligne.'); }
    return $j;
}

function house_lib_cache_dir(): string
{
    $dir = house_models_dir() . '/cache';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    return $dir;
}

/** la liste de tous les modèles de Poly Haven (gardée un jour sur le disque) */
function house_polyhaven_all(): array
{
    $f = house_lib_cache_dir() . '/polyhaven-models.json';
    if (is_file($f) && filemtime($f) > time() - 86400) { $j = json_decode((string) file_get_contents($f), true); if (is_array($j)) { return $j; } }
    $all = house_lib_json('https://api.polyhaven.com/assets?type=models');
    $out = [];
    foreach ($all as $id => $a) {
        if (!is_string($id) || !preg_match('/^[a-z0-9_]{1,80}$/', $id) || !is_array($a) || (int) ($a['type'] ?? 2) !== 2) { continue; }
        $out[$id] = ['name' => mb_substr((string) ($a['name'] ?? $id), 0, 120), 'authors' => array_slice(array_map('strval', array_keys(is_array($a['authors'] ?? null) ? $a['authors'] : [])), 0, 6),
            'cats' => array_slice(array_map('strval', is_array($a['categories'] ?? null) ? $a['categories'] : []), 0, 12), 'tags' => array_slice(array_map('strval', is_array($a['tags'] ?? null) ? $a['tags'] : []), 0, 20),
            'category' => mb_substr((string) ($a['category'] ?? ''), 0, 120), 'thumb' => house_lib_url_ok((string) ($a['thumbnail_url'] ?? '')) ? (string) $a['thumbnail_url'] : '', 'downloads' => (int) ($a['download_count'] ?? 0)];
    }
    @file_put_contents($f, json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $out;
}

/** mots français → mots anglais de Poly Haven (pour chercher « chaise » et trouver « chair ») */
const HOUSE_LIB_FR = ['chaise' => 'chair', 'fauteuil' => 'armchair', 'table' => 'table', 'lit' => 'bed', 'canape' => 'sofa', 'armoire' => 'cabinet', 'commode' => 'drawer', 'etagere' => 'shelf',
    'lampe' => 'lamp', 'plante' => 'plant', 'pot' => 'pot', 'vase' => 'vase', 'tonneau' => 'barrel', 'baril' => 'barrel', 'caisse' => 'crate', 'coffre' => 'chest', 'horloge' => 'clock', 'pendule' => 'clock',
    'banc' => 'bench', 'tabouret' => 'stool', 'bureau' => 'desk', 'livre' => 'book', 'bougie' => 'candle', 'chandelier' => 'candle', 'outil' => 'tool', 'marteau' => 'hammer', 'seau' => 'bucket', 'panier' => 'basket',
    'arbre' => 'tree', 'rocher' => 'rock', 'pierre' => 'stone', 'souche' => 'stump', 'buisson' => 'shrub', 'fleur' => 'flower', 'herbe' => 'grass', 'bois' => 'wood', 'cuisine' => 'kitchen', 'assiette' => 'plate',
    'bol' => 'bowl', 'tasse' => 'cup', 'theiere' => 'teapot', 'bouteille' => 'bottle', 'statue' => 'statue', 'buste' => 'bust', 'tapis' => 'rug', 'miroir' => 'mirror', 'cadre' => 'frame', 'tableau' => 'painting',
    'radio' => 'radio', 'telephone' => 'telephone', 'camera' => 'camera', 'appareil' => 'camera', 'machine' => 'machine', 'velo' => 'bicycle', 'brouette' => 'wheelbarrow', 'echelle' => 'ladder', 'lanterne' => 'lantern',
    'poele' => 'stove', 'cheminee' => 'fireplace', 'cuivre' => 'copper', 'fer' => 'iron', 'ancien' => 'vintage', 'vieux' => 'old', 'jouet' => 'toy', 'boite' => 'box', 'meuble' => 'furniture', 'nourriture' => 'food',
    'fruit' => 'fruit', 'pain' => 'bread', 'jardin' => 'garden', 'piano' => 'piano', 'guitare' => 'guitar', 'violon' => 'violin', 'tracteur' => 'tractor', 'charrette' => 'cart', 'roue' => 'wheel'];

function house_lib_norm(string $s): string
{
    $s = mb_strtolower($s);
    $t = class_exists('Normalizer') ? (string) Normalizer::normalize($s, Normalizer::FORM_D) : $s;
    return preg_replace('/\p{Mn}+/u', '', $t) ?? $s;
}

function house_online_search(string $source, string $q, string $cat): array
{
    if ($source !== 'polyhaven') { throw new RuntimeException('Source inconnue.'); }
    $all = house_polyhaven_all();
    $words = array_values(array_filter(preg_split('/[\s,;]+/', house_lib_norm(mb_substr($q, 0, 120))) ?: []));
    $cat = house_lib_norm(mb_substr($cat, 0, 60));
    $cats = [];
    $rows = [];
    foreach ($all as $id => $a) {
        foreach ($a['cats'] as $c) { $cats[$c] = ($cats[$c] ?? 0) + 1; }
        if ($cat !== '' && !in_array($cat, array_map('house_lib_norm', $a['cats']), true)) { continue; }
        $hay = house_lib_norm($id . ' ' . $a['name'] . ' ' . implode(' ', $a['tags']) . ' ' . implode(' ', $a['cats']) . ' ' . $a['category']);
        $ok = true;
        foreach ($words as $w) { $en = HOUSE_LIB_FR[$w] ?? (HOUSE_LIB_FR[rtrim($w, 'sx')] ?? null); if (!str_contains($hay, $w) && !($en && str_contains($hay, $en))) { $ok = false; break; } }
        if ($ok) { $rows[] = ['id' => $id, 'name' => $a['name'], 'authors' => $a['authors'], 'cats' => $a['cats'], 'tags' => array_slice($a['tags'], 0, 8), 'downloads' => $a['downloads'], 'page' => 'https://polyhaven.com/a/' . $id]; }
    }
    usort($rows, static fn($x, $y) => $y['downloads'] <=> $x['downloads']);
    arsort($cats);
    return ['source' => 'polyhaven', 'license' => 'CC0 1.0 (domaine public)', 'total' => count($rows), 'items' => array_slice($rows, 0, 120), 'cats' => array_slice(array_keys($cats), 0, 40)];
}

/** la vignette d'un modèle, par le serveur (gardée sur le disque) */
function house_online_thumb(string $id): never
{
    if (!preg_match('/^[a-z0-9_]{1,80}$/', $id)) { http_response_code(404); exit; }
    $f = house_lib_cache_dir() . '/ph-' . $id . '.img';
    if (!is_file($f)) {
        $all = house_polyhaven_all(); $u = $all[$id]['thumb'] ?? '';
        if ($u === '') { $u = 'https://cdn.polyhaven.com/asset_img/thumbs/' . $id . '.png?width=256&height=256'; }
        $r = house_lib_http($u, 600000);
        if (!house_lib_img_type($r['body'])) { http_response_code(404); exit; }
        file_put_contents($f, $r['body']);
    }
    $b = (string) file_get_contents($f);
    header('Content-Type: ' . (house_lib_img_type($b) ?: 'application/octet-stream')); header('X-Content-Type-Options: nosniff'); header('Cache-Control: private, max-age=604800');
    echo $b; exit;
}

/** le type d'une image d'après ses premiers octets (png, jpeg, webp) — rien d'autre n'est servi ni intégré */
function house_lib_img_type(string $b): string
{
    if (str_starts_with($b, "\x89PNG")) { return 'image/png'; }
    if (str_starts_with($b, "\xFF\xD8\xFF")) { return 'image/jpeg'; }
    if (str_starts_with($b, 'RIFF') && substr($b, 8, 4) === 'WEBP') { return 'image/webp'; }
    return '';
}

/** télécharger un modèle Poly Haven (glTF 1k + ses fichiers) et le ranger en GLB dans « Mes objets » */
function house_online_import(PDO $pdo, array $d): array
{
    if (($d['source'] ?? '') !== 'polyhaven') { throw new RuntimeException('Source inconnue.'); }
    $id = (string) ($d['id'] ?? '');
    if (!preg_match('/^[a-z0-9_]{1,80}$/', $id)) { throw new RuntimeException('Identifiant de modèle incorrect.'); }
    $info = house_lib_json('https://api.polyhaven.com/info/' . $id);
    if ((int) ($info['type'] ?? -1) !== 2) { throw new RuntimeException('Ce n’est pas un modèle 3D.'); }
    $files = house_lib_json('https://api.polyhaven.com/files/' . $id);
    $res = is_array($files['gltf'] ?? null) ? $files['gltf'] : [];
    uksort($res, static fn($a, $b) => (int) $a <=> (int) $b); // la plus petite résolution d'abord (1k)
    $want = (string) ($d['res'] ?? '1k'); $pick = null;
    foreach ([$want, ...array_keys($res)] as $k) { if (is_array($res[$k]['gltf'] ?? null)) { $pick = $res[$k]['gltf']; break; } }
    if (!$pick || !is_string($pick['url'] ?? null)) { throw new RuntimeException('Ce modèle n’existe pas en glTF.'); }
    $total = (int) ($pick['size'] ?? 0); foreach ((array) ($pick['include'] ?? []) as $inc) { $total += (int) ($inc['size'] ?? 0); }
    if ($total > HOUSE_LIB_TOTAL_MAX) { throw new RuntimeException('Modèle trop lourd (plus de 40 Mo avec ses textures).'); }
    $main = house_lib_http((string) $pick['url'], 15000000)['body'];
    $inc = is_array($pick['include'] ?? null) ? $pick['include'] : [];
    if (count($inc) > 60) { throw new RuntimeException('Modèle trop compliqué (trop de fichiers).'); }
    $got = 0;
    $glb = house_gltf_to_glb($main, static function (string $path) use ($inc, &$got) {
        $f = $inc[$path] ?? null;
        if (!is_array($f) || !is_string($f['url'] ?? null)) { throw new RuntimeException('Fichier manquant dans le modèle : ' . $path); }
        $b = house_lib_http($f['url'], HOUSE_LIB_TOTAL_MAX)['body'];
        if (isset($f['md5']) && is_string($f['md5']) && preg_match('/^[0-9a-f]{32}$/', $f['md5']) && md5($b) !== $f['md5']) { throw new RuntimeException('Fichier abîmé pendant le téléchargement (empreinte différente) : réessaie.'); }
        $got += strlen($b); if ($got > HOUSE_LIB_TOTAL_MAX) { throw new RuntimeException('Modèle trop lourd.'); }
        return $b;
    });
    $thumb = '';
    try { $t = house_lib_http(house_lib_url_ok((string) ($info['thumbnail_url'] ?? '')) ? (string) $info['thumbnail_url'] : 'https://cdn.polyhaven.com/asset_img/thumbs/' . $id . '.png?width=256&height=256', 190000)['body'];
        if ($ty = house_lib_img_type($t)) { $thumb = 'data:' . $ty . ';base64,' . base64_encode($t); } } catch (Throwable) {}
    $authors = implode(', ', array_slice(array_map('strval', array_keys(is_array($info['authors'] ?? null) ? $info['authors'] : [])), 0, 6));
    $name = mb_substr(trim(safe_text($d['name'] ?? '')), 0, 120) ?: mb_substr((string) ($info['name'] ?? $id), 0, 120);
    $mid = house_lib_store($pdo, $glb, 'glb', $name, ['license' => 'CC0 1.0 (domaine public)', 'author' => $authors, 'source' => 'Poly Haven', 'source_url' => 'https://polyhaven.com/a/' . $id, 'cat' => $d['cat'] ?? '', 'thumb' => $thumb]);
    return ['id' => $mid, 'name' => $name, 'ext' => 'glb', 'size' => strlen($glb)];
}

/**
 * Un glTF et ses fichiers à part (.bin, textures) → un seul GLB : les données sont mises bout à bout dans le bloc binaire,
 * les images y entrent aussi (PNG, JPEG, WebP seulement). $fetch(chemin relatif) rend les octets d'un fichier à part.
 */
function house_gltf_to_glb(string $gltfText, callable $fetch): string
{
    $j = json_decode($gltfText, false, 64);
    if (!$j instanceof stdClass || !isset($j->asset)) { throw new RuntimeException('Ce glTF est illisible.'); }
    foreach ((array) ($j->extensionsRequired ?? []) as $x) {
        if (!in_array($x, ['KHR_materials_emissive_strength', 'KHR_texture_transform', 'KHR_materials_ior', 'KHR_materials_specular'], true)) { throw new RuntimeException('Ce modèle utilise une compression (' . preg_replace('/[^\w]/', '', (string) $x) . ') que le plan ne sait pas encore lire.'); }
    }
    $read = static function (string $uri) use ($fetch): string {
        if (preg_match('#^data:[\w/+.-]*;base64,(.*)$#s', $uri, $m)) { $b = base64_decode($m[1], true); if ($b === false) { throw new RuntimeException('Données intégrées illisibles.'); } return $b; }
        $p = rawurldecode($uri);
        if ($p === '' || str_contains($p, '..') || str_starts_with($p, '/') || str_contains($p, '\\') || preg_match('#^[a-z][\w+.-]*:#i', $p)) { throw new RuntimeException('Chemin de fichier refusé dans le modèle.'); }
        return (string) $fetch($p);
    };
    $bin = ''; $offsets = [];
    $pad = static function () use (&$bin) { while (strlen($bin) % 4) { $bin .= "\0"; } };
    foreach ((array) ($j->buffers ?? []) as $i => $b) {
        $data = isset($b->uri) ? $read((string) $b->uri) : '';
        $pad(); $offsets[$i] = strlen($bin); $bin .= $data;
    }
    foreach ((array) ($j->bufferViews ?? []) as $bv) { $bi = (int) ($bv->buffer ?? 0); $bv->byteOffset = (int) ($bv->byteOffset ?? 0) + ($offsets[$bi] ?? 0); $bv->buffer = 0; }
    if (!isset($j->bufferViews)) { $j->bufferViews = []; }
    foreach ((array) ($j->images ?? []) as $im) {
        if (!isset($im->uri)) { continue; }
        $data = $read((string) $im->uri); $type = house_lib_img_type($data);
        if (!$type) { throw new RuntimeException('Une texture du modèle n’est pas une image PNG, JPEG ou WebP.'); }
        $pad(); $j->bufferViews[] = (object) ['buffer' => 0, 'byteOffset' => strlen($bin), 'byteLength' => strlen($data)]; $bin .= $data;
        $im->bufferView = count($j->bufferViews) - 1; $im->mimeType = $type; unset($im->uri);
        if (strlen($bin) > HOUSE_MODEL_MAX) { throw new RuntimeException('Modèle trop gros (30 Mo au plus).'); }
    }
    $pad();
    $j->buffers = strlen($bin) ? [(object) ['byteLength' => strlen($bin)]] : [];
    if (!$j->bufferViews) { unset($j->bufferViews); }
    $json = json_encode($j, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) { throw new RuntimeException('Conversion du modèle impossible.'); }
    while (strlen($json) % 4) { $json .= ' '; }
    $out = pack('V3', 0x46546C67, 2, 12 + 8 + strlen($json) + (strlen($bin) ? 8 + strlen($bin) : 0)) . pack('V2', strlen($json), 0x4E4F534A) . $json;
    if (strlen($bin)) { $out .= pack('V2', strlen($bin), 0x004E4942) . $bin; }
    if (strlen($out) > HOUSE_MODEL_MAX) { throw new RuntimeException('Modèle trop gros (30 Mo au plus).'); }
    return $out;
}

/* ═════════ Un pack ZIP téléchargé soi-même (Kenney, Quaternius, OpenGameArt…) ═════════ */
function house_pack_dir(): string
{
    $dir = house_models_dir() . '/packs';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    foreach (glob($dir . '/*.zip') ?: [] as $old) { if (filemtime($old) < time() - 6 * 3600) { @unlink($old); } } // les packs oubliés
    return $dir;
}

function house_pack_path(string $token): string
{
    if (!preg_match('/^[0-9a-f]{32}$/', $token)) { throw new RuntimeException('Pack inconnu.'); }
    $p = house_pack_dir() . '/' . $token . '.zip';
    if (!is_file($p)) { throw new RuntimeException('Le pack n’est plus là : renvoie le fichier ZIP.'); }
    return $p;
}

/** chemin dans un ZIP : sans « .. », sans chemin absolu */
function house_pack_clean(string $p): string
{
    $parts = [];
    foreach (explode('/', str_replace('\\', '/', $p)) as $s) { if ($s === '' || $s === '.') { continue; } if ($s === '..') { array_pop($parts); continue; } $parts[] = $s; }
    return implode('/', $parts);
}

function house_pack_upload(?array $file): array
{
    if (!class_exists('ZipArchive')) { throw new RuntimeException('PHP n’a pas l’extension zip : impossible d’ouvrir un pack.'); }
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) { throw new RuntimeException('Aucun fichier ZIP reçu (ou trop gros pour le serveur).'); }
    $size = (int) filesize((string) $file['tmp_name']);
    if ($size <= 0 || $size > HOUSE_PACK_MAX) { throw new RuntimeException('Pack trop gros (150 Mo au plus).'); }
    if ((string) file_get_contents((string) $file['tmp_name'], false, null, 0, 2) !== 'PK') { throw new RuntimeException('Ce fichier n’est pas un ZIP.'); }
    $token = bin2hex(random_bytes(16)); $path = house_pack_dir() . '/' . $token . '.zip';
    if (!move_uploaded_file((string) $file['tmp_name'], $path)) { throw new RuntimeException('Enregistrement impossible.'); }
    $z = new ZipArchive(); if ($z->open($path) !== true) { @unlink($path); throw new RuntimeException('ZIP illisible.'); }
    $items = []; $license = '';
    for ($i = 0; $i < min($z->numFiles, 20000); $i++) {
        $st = $z->statIndex($i); if (!$st) { continue; }
        $n = house_pack_clean((string) $st['name']);
        if ($n === '' || str_contains($n, '__MACOSX/') || str_starts_with(basename($n), '.')) { continue; }
        $ext = strtolower(pathinfo($n, PATHINFO_EXTENSION));
        if ($license === '' && preg_match('/^(licen[cs]e|readme)[^\/]*\.(txt|md)$/i', basename($n)) && $st['size'] < 20000) { $license = mb_substr(trim((string) $z->getFromIndex($i)), 0, 700); }
        if (in_array($ext, ['glb', 'gltf', 'obj', 'stl'], true) && $st['size'] > 0 && $st['size'] <= HOUSE_MODEL_MAX && count($items) < 800) { $items[] = ['path' => $n, 'ext' => $ext, 'size' => (int) $st['size']]; }
    }
    $z->close();
    if (!$items) { @unlink($path); throw new RuntimeException('Aucun modèle 3D (GLB, glTF, OBJ, STL) dans ce ZIP.'); }
    // un même modèle en plusieurs formats : GLB d'abord, puis glTF, OBJ, STL
    $rank = ['glb' => 0, 'gltf' => 1, 'obj' => 2, 'stl' => 3]; usort($items, static fn($a, $b) => [strtolower(pathinfo($a['path'], PATHINFO_FILENAME)), $rank[$a['ext']]] <=> [strtolower(pathinfo($b['path'], PATHINFO_FILENAME)), $rank[$b['ext']]]);
    return ['token' => $token, 'items' => $items, 'license_text' => preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $license) ?? ''];
}

function house_pack_cancel(array $d): array
{
    try { @unlink(house_pack_path((string) ($d['token'] ?? ''))); } catch (Throwable) {}
    return ['ok' => true];
}

/** les modèles choisis dans le pack : rangés un par un (un glTF est converti en GLB, un OBJ garde ses couleurs MTL) */
function house_pack_import(PDO $pdo, array $d): array
{
    $path = house_pack_path((string) ($d['token'] ?? ''));
    $want = array_slice(array_values(array_filter((array) ($d['paths'] ?? []), 'is_string')), 0, 200);
    if (!$want) { throw new RuntimeException('Choisis au moins un modèle.'); }
    $meta = ['license' => $d['license'] ?? '', 'author' => $d['author'] ?? '', 'source' => $d['source'] ?? '', 'source_url' => $d['source_url'] ?? '', 'cat' => $d['cat'] ?? ''];
    if (trim(safe_text($meta['license'])) === '') { throw new RuntimeException('Indique la licence du pack (CC0, domaine public…).'); }
    $z = new ZipArchive(); if ($z->open($path) !== true) { throw new RuntimeException('ZIP illisible.'); }
    $get = static function (string $p) use ($z): string {
        $p = house_pack_clean($p); $st = $z->statName($p);
        if (!$st) { throw new RuntimeException('Fichier manquant dans le pack : ' . $p); }
        if ($st['size'] > HOUSE_MODEL_MAX) { throw new RuntimeException('Fichier trop gros dans le pack : ' . $p); }
        $b = $z->getFromName($p); if ($b === false) { throw new RuntimeException('Lecture impossible : ' . $p); }
        return $b;
    };
    $done = []; $errors = [];
    foreach ($want as $p) {
        $p = house_pack_clean($p); $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION)); $dir = str_contains($p, '/') ? dirname($p) . '/' : '';
        $name = ucfirst(trim(preg_replace('/[_\-]+/', ' ', pathinfo($p, PATHINFO_FILENAME)) ?? ''));
        try {
            $bytes = $get($p); $mtl = 0;
            if ($ext === 'glb' && !str_starts_with($bytes, 'glTF')) { throw new RuntimeException('GLB illisible.'); }
            if ($ext === 'gltf') { $bytes = house_gltf_to_glb($bytes, static fn(string $rel) => $get($dir . $rel)); $ext = 'glb'; }
            if ($ext === 'obj') {
                if (preg_match('/[\x00-\x08\x0E-\x1F]/', substr($bytes, 0, 512))) { throw new RuntimeException('OBJ illisible.'); }
                if (preg_match('/^\s*mtllib\s+(.+?)\s*$/m', $bytes, $m)) { try { $mt = $get($dir . trim($m[1])); if (!preg_match('/[\x00-\x08\x0E-\x1F]/', substr($mt, 0, 512))) { $mtl = house_lib_store($pdo, $mt, 'mtl', $name . ' (couleurs)', $meta); } } catch (Throwable) {} }
            }
            $done[] = ['id' => house_lib_store($pdo, $bytes, $ext, $name, $meta + ['mtl_id' => $mtl]), 'name' => $name, 'ext' => $ext, 'mtl' => $mtl];
        } catch (Throwable $e) { $errors[] = basename($p) . ' : ' . $e->getMessage(); }
    }
    $z->close();
    if (!empty($d['finish'])) { @unlink($path); }
    return ['items' => $done, 'errors' => array_slice($errors, 0, 20)];
}
