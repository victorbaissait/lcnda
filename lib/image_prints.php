<?php
declare(strict_types=1);

/**
 * 🔍 Images semblables et 👯 doublons d'images (assets/js/app-image-prints.js, assets/js/heritage-images-similaires.js).
 *
 * Les « empreintes » des photos sont calculées dans le navigateur (rien n'est envoyé ailleurs) : hachages perceptuels
 * aHash / dHash / pHash (64 bits, sur l'image en gris), histogramme des couleurs, petites vignettes (gris 48 × 48, couleurs
 * 16 × 16) pour vérifier une correspondance, et jusqu'à 160 points caractéristiques
 * (coins FAST sur 4 échelles + descripteur binaire BRIEF de 256 bits) pour reconnaître une photo recadrée ou zoomée.
 * Ici, on les range (table image_prints, une ligne par média, avec la taille et la date du fichier : une photo retouchée,
 * tournée ou remplacée est recalculée toute seule), on garde les « Ce n'est pas un doublon » (image_not_duplicates) et
 * on fait la fusion d'un groupe de doublons : les liens (fiches, événements, étiquettes, albums, recueils, enquêtes,
 * portrait, zones des visages…) passent sur la photo gardée, les autres vont à la corbeille (le fichier reste sur le
 * disque) ou deviennent des versions de la photo gardée. Chaque fusion est notée pas à pas (image_dup_merges) pour que
 * « ↶ Annuler » remette tout exactement comme avant, même longtemps après.
 *
 * Tables (structure n°60, lib/migrations.php) : image_prints, image_not_duplicates, image_dup_merges.
 *
 * GET  image_prints_status&algo=  · image_prints_todo&algo=&limit=  · image_prints_all&algo=  · image_dup_state
 * POST image_prints_save {algo, items:[{media_id, filename, w, h, print | error}]}
 *      image_dup_dismiss {pairs:[[a,b]…], undo}  · image_dup_merge {keep, others:[{id, map}], mode: trash|version}
 *      image_dup_undo {token}
 */

const IMGPRINT_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff', 'heic'];
const IMGPRINT_MAX_KP = 160;
const IMGPRINT_KP_BYTES = 37;      // x (2 octets), y (2), échelle (1), descripteur (32)
const IMGPRINT_SAVE_MAX = 24;      // empreintes envoyées d'un coup
const IMGDUP_MAX_OTHERS = 60;
/** les autres endroits qui montrent un média : ils passent sur la photo gardée (table, colonne) */
const IMGDUP_REFS = [
    ['persons', 'portrait_media_id'], ['events', 'confidence_media_id'], ['name_variants', 'source_media_id'],
    ['investigation_media', 'media_id'], ['family_collection_media', 'media_id'], ['old_maps', 'media_id'],
    ['museum_items', 'media_id'], ['recueils', 'cover_media_id'], ['recueil_images', 'media_id'],
    ['photo_map_items', 'media_id'], ['postcards', 'media_id'], ['postcards', 'verso_media_id'],
    ['person_online_sheets', 'screenshot_media_id'], ['archive_digest_media', 'media_id'], ['cited_names', 'media_id'],
    ['media', 'correspondence_reply_to_media_id'],
];

function image_prints_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS image_prints (
        media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
        filename TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        file_mtime INTEGER NOT NULL DEFAULT 0,
        algo INTEGER NOT NULL DEFAULT 0,
        sha1 TEXT NOT NULL DEFAULT '',
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS image_not_duplicates (
        media_a INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        media_b INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(media_a, media_b),
        CHECK(media_a < media_b)
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_image_not_dup_b ON image_not_duplicates(media_b)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS image_dup_merges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        keep_id INTEGER NOT NULL,
        others_json TEXT NOT NULL DEFAULT '[]',
        mode TEXT NOT NULL DEFAULT 'trash',
        ops_json TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        undone_at TEXT
    )");
}

function imgprint_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $q = $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('image_prints','image_not_duplicates','image_dup_merges')");
    if ((int) $q->fetchColumn() < 3) { image_prints_schema($pdo); }
    $done = true;
}

function imgprint_ext(string $filename): string
{
    return strtolower(pathinfo($filename, PATHINFO_EXTENSION));
}

function imgprint_algo(mixed $v): int
{
    $a = safe_int($v);
    if ($a < 1 || $a > 999) { throw new LcndaBadInput('Version des empreintes incorrecte.'); }
    return $a;
}

/** le fichier d'un média, seulement s'il est bien dans le dossier des médias */
function imgprint_path(string $filename): ?string
{
    $safe = str_replace(['\\', "\0"], ['/', ''], $filename);
    if ($safe === '' || str_contains($safe, '..')) { return null; }
    $root = realpath(MEDIA_DIR);
    $path = realpath(MEDIA_DIR . '/' . $safe);
    if (!$root || !$path || !str_starts_with($path, $root . DIRECTORY_SEPARATOR) || !is_file($path)) { return null; }
    return $path;
}

/** les photos de la base (un fichier image), avec l'état de leur empreinte */
function imgprint_rows(PDO $pdo): array
{
    imgprint_ready($pdo);
    $rows = $pdo->query("SELECT m.id, m.filename, m.media_type, p.filename AS p_file, p.file_size, p.file_mtime, p.algo, p.error, (p.data<>'') AS has_data
        FROM media m LEFT JOIN image_prints p ON p.media_id=m.id WHERE trim(COALESCE(m.filename,''))<>'' ORDER BY m.id")->fetchAll(PDO::FETCH_ASSOC);
    // une photo ou un document photographié (un acte en .jpg) : c'est l'extension du fichier qui compte
    return array_values(array_filter($rows, static fn($r) => in_array(imgprint_ext((string) $r['filename']), IMGPRINT_EXTS, true)
        && !in_array(strtolower((string) $r['media_type']), ['audio', 'video'], true)));
}

/** « fresh » : empreinte à jour · « failed » : illisible pour ce fichier-là · « todo » : à (re)calculer · « gone » : fichier absent */
function imgprint_state(array $r, int $algo): string
{
    $path = imgprint_path((string) $r['filename']);
    if (!$path) { return 'gone'; }
    clearstatcache(true, $path);
    $same = (string) $r['p_file'] === (string) $r['filename'] && (int) $r['file_size'] === (int) @filesize($path) && (int) $r['file_mtime'] === (int) @filemtime($path);
    if (!$same) { return 'todo'; }
    if ((string) $r['error'] !== '') { return 'failed'; }
    return (int) $r['algo'] === $algo && $r['has_data'] ? 'fresh' : 'todo';
}

function imgprint_status(PDO $pdo, int $algo): array
{
    $c = ['total' => 0, 'fresh' => 0, 'todo' => 0, 'failed' => 0, 'gone' => 0];
    foreach (imgprint_rows($pdo) as $r) { $c['total']++; $c[imgprint_state($r, $algo)]++; }
    $c['done'] = $c['fresh'] + $c['failed'];
    $c['readable'] = $c['total'] - $c['gone'];
    return $c;
}

function imgprint_todo(PDO $pdo, int $algo, int $limit): array
{
    $limit = max(1, min(IMGPRINT_SAVE_MAX, $limit));
    $items = []; $remaining = 0;
    foreach (imgprint_rows($pdo) as $r) {
        if (imgprint_state($r, $algo) !== 'todo') { continue; }
        $remaining++;
        if (count($items) < $limit) { $items[] = ['id' => (int) $r['id'], 'filename' => (string) $r['filename']]; }
    }
    return ['items' => $items, 'remaining' => $remaining];
}

/** une empreinte envoyée par la page : seulement des nombres bornés, des hachages hexadécimaux et du base64 de la bonne taille */
function imgprint_clean(mixed $p): array
{
    if (!is_array($p)) { throw new LcndaBadInput('Empreinte d’image incorrecte.'); }
    $hex = static function ($v, string $k): string {
        if (!is_string($v) || !preg_match('/^[0-9a-f]{16}$/', $v)) { throw new LcndaBadInput("Empreinte d’image incorrecte ($k)."); }
        return $v;
    };
    $num = static function ($v, float $min, float $max, string $k): float {
        if (!is_int($v) && !is_float($v) && !(is_string($v) && is_numeric($v))) { throw new LcndaBadInput("Empreinte d’image incorrecte ($k)."); }
        return max($min, min($max, (float) $v));
    };
    $nw = (int) $num($p['nw'] ?? 0, 1, 1024, 'nw'); $nh = (int) $num($p['nh'] ?? 0, 1, 1024, 'nh');
    $hist = $p['hist'] ?? '';
    $histRaw = is_string($hist) && strlen($hist) <= 100 ? base64_decode($hist, true) : false;
    if ($histRaw === false || strlen($histRaw) !== 64) { throw new LcndaBadInput('Empreinte d’image incorrecte (couleurs).'); }
    $thumb = static function ($v, int $len, string $k): string {
        $raw = is_string($v) && strlen($v) <= (int) ceil($len / 3) * 4 + 4 ? base64_decode($v, true) : false;
        if ($raw === false || strlen($raw) !== $len) { throw new LcndaBadInput("Empreinte d’image incorrecte ($k)."); }
        return base64_encode($raw);
    };
    $kp = $p['kp'] ?? '';
    if (!is_string($kp) || strlen($kp) > (int) ceil(IMGPRINT_MAX_KP * IMGPRINT_KP_BYTES / 3) * 4 + 4) { throw new LcndaBadInput('Empreinte d’image incorrecte (points).'); }
    $kpRaw = $kp === '' ? '' : base64_decode($kp, true);
    if ($kpRaw === false || strlen($kpRaw) % IMGPRINT_KP_BYTES !== 0) { throw new LcndaBadInput('Empreinte d’image incorrecte (points).'); }
    return ['nw' => $nw, 'nh' => $nh, 'a' => $hex($p['a'] ?? '', 'a'), 'd' => $hex($p['d'] ?? '', 'd'), 'p' => $hex($p['p'] ?? '', 'p'),
        'hist' => base64_encode($histRaw), 'lum' => round($num($p['lum'] ?? 0, 0, 255, 'lum'), 1), 'sat' => round($num($p['sat'] ?? 0, 0, 255, 'sat'), 1),
        'g' => $thumb($p['g'] ?? '', 48 * 48, 'vignette'), 'c' => $thumb($p['c'] ?? '', 16 * 16 * 3, 'couleurs'),
        'kp' => $kpRaw === '' ? '' : base64_encode($kpRaw)];
}

function imgprint_sha1(string $filename, string $path): string
{
    if (function_exists('media_hash_cache_load') && function_exists('media_file_sha1')) {
        $cache = media_hash_cache_load();
        $h = media_file_sha1($cache, $filename, $path);
        media_hash_cache_save($cache);
        return (string) $h;
    }
    return (string) @hash_file('sha1', $path);
}

function imgprint_save(PDO $pdo, array $d): array
{
    imgprint_ready($pdo);
    $algo = imgprint_algo($d['algo'] ?? 0);
    $items = $d['items'] ?? null;
    if (!is_array($items) || !array_is_list($items)) { throw new LcndaBadInput('Donnée incorrecte (« items ») : une liste est attendue.'); }
    if (count($items) > IMGPRINT_SAVE_MAX) { throw new LcndaBadInput('Trop d’empreintes envoyées d’un coup.'); }
    $get = $pdo->prepare('SELECT filename FROM media WHERE id=?');
    $put = $pdo->prepare("INSERT INTO image_prints(media_id, filename, file_size, file_mtime, algo, sha1, width, height, data, error, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(media_id) DO UPDATE SET filename=excluded.filename, file_size=excluded.file_size, file_mtime=excluded.file_mtime, algo=excluded.algo,
        sha1=excluded.sha1, width=excluded.width, height=excluded.height, data=excluded.data, error=excluded.error, updated_at=CURRENT_TIMESTAMP");
    $saved = 0; $skipped = 0;
    foreach ($items as $it) {
        if (!is_array($it)) { throw new LcndaBadInput('Empreinte d’image incorrecte.'); }
        $id = safe_int($it['media_id'] ?? 0);
        $file = scalar_text($it['filename'] ?? '', 'filename');
        $get->execute([$id]);
        $current = $get->fetchColumn();
        // le média a disparu ou changé de fichier pendant le calcul : on laisse, il sera recalculé
        if ($current === false || (string) $current !== $file) { $skipped++; continue; }
        $path = imgprint_path($file);
        if (!$path) { $skipped++; continue; }
        clearstatcache(true, $path);
        $size = (int) @filesize($path); $mtime = (int) @filemtime($path);
        $error = mb_substr(safe_text($it['error'] ?? ''), 0, 200);
        $w = max(0, min(200000, safe_int($it['w'] ?? 0))); $h = max(0, min(200000, safe_int($it['h'] ?? 0)));
        $data = '';
        if ($error === '') { $data = json_encode(imgprint_clean($it['print'] ?? null), JSON_UNESCAPED_SLASHES); }
        $put->execute([$id, $file, $size, $mtime, $algo, $error === '' ? imgprint_sha1($file, $path) : '', $w, $h, $data, $error]);
        $saved++;
    }
    return ['saved' => $saved, 'skipped' => $skipped];
}

/** toutes les empreintes à jour, avec ce qu'il faut pour montrer chaque photo (titre, vignette, taille, liens) */
function imgprint_all(PDO $pdo, int $algo): array
{
    imgprint_ready($pdo);
    $fresh = [];
    foreach (imgprint_rows($pdo) as $r) { if (imgprint_state($r, $algo) === 'fresh') { $fresh[(int) $r['id']] = true; } }
    $out = [];
    if ($fresh) {
        $links = imgdup_link_counts($pdo, array_keys($fresh));
        $rows = $pdo->query("SELECT m.id, m.title, m.document_title, m.filename, m.thumbnail, m.media_type, m.date_text, m.document_reference, m.created_at,
            p.sha1, p.width, p.height, p.file_size, p.data FROM media m JOIN image_prints p ON p.media_id=m.id ORDER BY m.id")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $id = (int) $r['id'];
            if (!isset($fresh[$id])) { continue; }
            $data = json_decode((string) $r['data'], true);
            if (!is_array($data)) { continue; }
            $out[] = ['id' => $id, 'title' => (string) ($r['title'] ?: $r['document_title'] ?: ''), 'filename' => (string) $r['filename'], 'thumbnail' => (string) $r['thumbnail'],
                'media_type' => (string) $r['media_type'], 'date_text' => (string) $r['date_text'], 'cote' => (string) $r['document_reference'], 'created_at' => (string) $r['created_at'],
                'ext' => imgprint_ext((string) $r['filename']), 'size' => (int) $r['file_size'], 'sha1' => (string) $r['sha1'], 'w' => (int) $r['width'], 'h' => (int) $r['height'],
                'links' => $links[$id] ?? ['n' => 0], 'print' => $data];
        }
    }
    return ['algo' => $algo, 'items' => $out, 'status' => imgprint_status($pdo, $algo)];
}

/** combien de choses montrent chaque média : fiches, événements, familles, sources, étiquettes, albums, portraits… et les noms des personnes */
function imgdup_link_counts(PDO $pdo, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids), static fn($i) => $i > 0));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        $q = $pdo->prepare("SELECT media_id, entity_type, count(*) n FROM media_links WHERE media_id IN ($in) GROUP BY media_id, entity_type");
        $q->execute($chunk);
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $k = match ((string) $r['entity_type']) { 'person' => 'persons', 'event' => 'events', 'family' => 'families', 'source' => 'sources', default => 'other' };
            $out[(int) $r['media_id']][$k] = ($out[(int) $r['media_id']][$k] ?? 0) + (int) $r['n'];
        }
        $q = $pdo->prepare("SELECT entity_id, count(*) FROM label_links WHERE entity_type='media' AND entity_id IN ($in) GROUP BY entity_id");
        $q->execute($chunk);
        foreach ($q->fetchAll(PDO::FETCH_NUM) as [$id, $n]) { $out[(int) $id]['labels'] = (int) $n; }
        $q = $pdo->prepare("SELECT portrait_media_id, count(*) FROM persons WHERE portrait_media_id IN ($in) GROUP BY portrait_media_id");
        $q->execute($chunk);
        foreach ($q->fetchAll(PDO::FETCH_NUM) as [$id, $n]) { $out[(int) $id]['portraits'] = (int) $n; }
        foreach ([['family_collection_media', 'albums'], ['recueil_images', 'albums'], ['photo_map_items', 'albums'], ['investigation_media', 'other']] as [$t, $k]) {
            if (!imgdup_has_col($pdo, $t, 'media_id')) { continue; }
            $q = $pdo->prepare("SELECT media_id, count(*) FROM {$t} WHERE media_id IN ($in) GROUP BY media_id");
            $q->execute($chunk);
            foreach ($q->fetchAll(PDO::FETCH_NUM) as [$id, $n]) { $out[(int) $id][$k] = ($out[(int) $id][$k] ?? 0) + (int) $n; }
        }
        $q = $pdo->prepare("SELECT media_id, count(*) FROM media_tags WHERE media_id IN ($in) GROUP BY media_id");
        $q->execute($chunk);
        foreach ($q->fetchAll(PDO::FETCH_NUM) as [$id, $n]) { $out[(int) $id]['tags'] = (int) $n; }
        // les personnes : celles de la fiche, et celles reconnues sur la photo
        $q = $pdo->prepare("SELECT DISTINCT x.media_id, p.id, trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS name FROM (
                SELECT media_id, entity_id AS person_id FROM media_links WHERE entity_type='person' AND media_id IN ($in)
                UNION SELECT media_id, person_id FROM media_tags WHERE media_id IN ($in)
            ) x JOIN persons p ON p.id=x.person_id ORDER BY name");
        $q->execute([...$chunk, ...$chunk]);
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $m = (int) $r['media_id'];
            if (count($out[$m]['people'] ?? []) < 6) { $out[$m]['people'][] = ['id' => (int) $r['id'], 'name' => (string) $r['name'] ?: 'Personne sans nom']; }
        }
    }
    foreach ($out as $id => &$o) {
        $o['n'] = array_sum(array_map(static fn($v) => is_int($v) ? $v : 0, array_diff_key($o, ['people' => 1])));
    }
    unset($o);
    return $out;
}

function imgdup_has_col(PDO $pdo, string $table, string $col): bool
{
    static $cache = [];
    $k = $table . '.' . $col;
    if (!isset($cache[$k])) {
        $cache[$k] = preg_match('/^[a-z_]+$/', $table) && in_array($col, array_column($pdo->query("PRAGMA table_info($table)")->fetchAll(PDO::FETCH_ASSOC), 'name'), true);
    }
    return $cache[$k];
}

/** les paires écartées (« Ce n'est pas un doublon ») et les fusions qu'on peut encore annuler */
function imgdup_state(PDO $pdo): array
{
    imgprint_ready($pdo);
    $pairs = array_map(static fn($r) => [(int) $r[0], (int) $r[1]], $pdo->query('SELECT media_a, media_b FROM image_not_duplicates')->fetchAll(PDO::FETCH_NUM));
    $merges = [];
    foreach ($pdo->query('SELECT token, keep_id, others_json, mode, summary, created_at FROM image_dup_merges WHERE undone_at IS NULL ORDER BY id DESC LIMIT 200')->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $keep = $pdo->prepare('SELECT id, title, filename, thumbnail FROM media WHERE id=?');
        $keep->execute([(int) $r['keep_id']]);
        $merges[] = ['token' => $r['token'], 'keep' => $keep->fetch(PDO::FETCH_ASSOC) ?: ['id' => (int) $r['keep_id'], 'title' => '', 'filename' => '', 'thumbnail' => ''],
            'others' => json_decode((string) $r['others_json'], true) ?: [], 'mode' => $r['mode'], 'summary' => $r['summary'], 'created_at' => $r['created_at']];
    }
    return ['dismissed' => $pairs, 'merges' => $merges];
}

function imgdup_pairs(mixed $raw): array
{
    if (!is_array($raw) || !array_is_list($raw) || count($raw) > 2000) { throw new LcndaBadInput('Donnée incorrecte (« paires »).'); }
    $out = [];
    foreach ($raw as $p) {
        if (!is_array($p) || count($p) !== 2) { throw new LcndaBadInput('Donnée incorrecte (« paires »).'); }
        $a = safe_int($p[0] ?? 0); $b = safe_int($p[1] ?? 0);
        if ($a <= 0 || $b <= 0 || $a === $b) { continue; }
        $out[min($a, $b) . ':' . max($a, $b)] = [min($a, $b), max($a, $b)];
    }
    return array_values($out);
}

function imgdup_dismiss(PDO $pdo, array $d): array
{
    imgprint_ready($pdo);
    $pairs = imgdup_pairs($d['pairs'] ?? null);
    $undo = !empty($d['undo']);
    $n = 0;
    $exists = $pdo->prepare('SELECT count(*) FROM media WHERE id IN (?,?)');
    foreach ($pairs as [$a, $b]) {
        if ($undo) {
            $q = $pdo->prepare('DELETE FROM image_not_duplicates WHERE media_a=? AND media_b=?');
            $q->execute([$a, $b]);
            $n += $q->rowCount();
            continue;
        }
        $exists->execute([$a, $b]);
        if ((int) $exists->fetchColumn() !== 2) { continue; }
        $q = $pdo->prepare('INSERT OR IGNORE INTO image_not_duplicates(media_a, media_b) VALUES(?,?)');
        $q->execute([$a, $b]);
        $n += $q->rowCount();
    }
    return ['count' => $n];
}

function imgdup_media(PDO $pdo, int $id): ?array
{
    $q = $pdo->prepare('SELECT * FROM media WHERE id=?');
    $q->execute([$id]);
    $m = $q->fetch(PDO::FETCH_ASSOC);
    return $m ?: null;
}

/** la correspondance entre les deux photos (coordonnées du doublon → photo gardée), envoyée par la page : bornée */
function imgdup_map(mixed $m): ?array
{
    if (!is_array($m)) { return null; }
    foreach (['s', 'tx', 'ty', 'ow', 'oh', 'kw', 'kh'] as $k) {
        if (!isset($m[$k]) || !is_numeric($m[$k])) { return null; }
    }
    $map = ['s' => (float) $m['s'], 'tx' => (float) $m['tx'], 'ty' => (float) $m['ty'], 'ow' => (float) $m['ow'], 'oh' => (float) $m['oh'], 'kw' => (float) $m['kw'], 'kh' => (float) $m['kh']];
    if ($map['s'] < 0.05 || $map['s'] > 20 || abs($map['tx']) > 20000 || abs($map['ty']) > 20000) { return null; }
    foreach (['ow', 'oh', 'kw', 'kh'] as $k) { if ($map[$k] < 1 || $map[$k] > 4096) { return null; } }
    return $map;
}

function imgdup_move_ref(PDO $pdo, string $table, string $col, int $from, int $to, array &$ops, string $where = '', array $whereArgs = []): int
{
    if (!imgdup_has_col($pdo, $table, $col) || !imgdup_has_col($pdo, $table, 'id')) { return 0; }
    $sel = $pdo->prepare("SELECT id FROM {$table} WHERE {$col}=?" . $where);
    $sel->execute([$from, ...$whereArgs]);
    $ids = array_map('intval', $sel->fetchAll(PDO::FETCH_COLUMN));
    if (!$ids) { return 0; }
    $moved = [];
    $upd = $pdo->prepare("UPDATE OR IGNORE {$table} SET {$col}=? WHERE id=? AND {$col}=?");
    foreach ($ids as $rid) {
        $upd->execute([$to, $rid, $from]);
        if ($upd->rowCount()) { $moved[] = $rid; }
    }
    if ($moved) { $ops[] = ['op' => 'move', 'table' => $table, 'col' => $col, 'ids' => $moved, 'from' => $from, 'to' => $to]; }
    return count($moved);
}

/** fusionne un groupe : $keep reste, chaque autre lui donne ses liens puis part à la corbeille (ou devient une version) */
function imgdup_merge(PDO $pdo, array $d): array
{
    imgprint_ready($pdo);
    $keep = safe_int($d['keep'] ?? 0);
    $mode = scalar_text($d['mode'] ?? 'trash', 'mode');
    if (!in_array($mode, ['trash', 'version'], true)) { throw new LcndaBadInput('Choisis ce qu’on fait des autres photos : corbeille ou versions.'); }
    $K = imgdup_media($pdo, $keep);
    if (!$K) { throw new RuntimeException('La photo à garder est introuvable.'); }
    $raw = $d['others'] ?? null;
    if (!is_array($raw) || !array_is_list($raw) || !$raw) { throw new LcndaBadInput('Choisis au moins une photo à fusionner avec celle qu’on garde.'); }
    if (count($raw) > IMGDUP_MAX_OTHERS) { throw new LcndaBadInput('Trop de photos dans ce groupe : fusionne-les en plusieurs fois.'); }
    $others = [];
    foreach ($raw as $o) {
        $id = safe_int(is_array($o) ? ($o['id'] ?? 0) : $o);
        if ($id <= 0 || $id === $keep || isset($others[$id])) { continue; }
        $M = imgdup_media($pdo, $id);
        if (!$M) { throw new RuntimeException('Une des photos du groupe est introuvable (déjà fusionnée ?).'); }
        $others[$id] = ['row' => $M, 'map' => is_array($o) ? imgdup_map($o['map'] ?? null) : null];
    }
    if (!$others) { throw new LcndaBadInput('Choisis au moins une photo à fusionner avec celle qu’on garde.'); }
    if (!function_exists('delete_media')) { throw new RuntimeException('Fusion impossible ici.'); }
    $ops = []; $moved = 0; $tags = 0; $versions = 0;
    $verDate = date('d/m/Y');
    foreach ($others as $oid => ['row' => $O, 'map' => $map]) {
        // 1. les liens aux fiches, événements, familles, sources… (sans doublon : un lien qui existe déjà reste avec la photo écartée)
        $links = $pdo->prepare('SELECT id, entity_type, entity_id FROM media_links WHERE media_id=?');
        $links->execute([$oid]);
        $has = $pdo->prepare('SELECT 1 FROM media_links WHERE media_id=? AND entity_type=? AND entity_id=?');
        $mv = [];
        foreach ($links->fetchAll(PDO::FETCH_ASSOC) as $l) {
            $has->execute([$keep, $l['entity_type'], (int) $l['entity_id']]);
            if ($has->fetchColumn()) { continue; }
            $pdo->prepare('UPDATE media_links SET media_id=? WHERE id=?')->execute([$keep, (int) $l['id']]);
            $mv[] = (int) $l['id'];
        }
        if ($mv) { $ops[] = ['op' => 'move', 'table' => 'media_links', 'col' => 'media_id', 'ids' => $mv, 'from' => $oid, 'to' => $keep]; $moved += count($mv); }
        // 2. les étiquettes
        $moved += imgdup_move_ref($pdo, 'label_links', 'entity_id', $oid, $keep, $ops, " AND entity_type='media'");
        // 3. portrait, albums, recueils, enquêtes, cartes, musée, cartes postales, noms cités…
        foreach (IMGDUP_REFS as [$t, $c]) {
            if ($t === 'media' && $c === 'correspondence_reply_to_media_id') { $moved += imgdup_move_ref($pdo, $t, $c, $oid, $keep, $ops, ' AND id<>?', [$keep]); continue; }
            $moved += imgdup_move_ref($pdo, $t, $c, $oid, $keep, $ops);
        }
        // 4. les zones identifiées (visages, objets) : remises au même endroit sur la photo gardée
        if ($map) {
            $q = $pdo->prepare('SELECT id, x, y, w, h FROM media_tags WHERE media_id=?');
            $q->execute([$oid]);
            foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $t) {
                $x = ($map['s'] * ((float) $t['x'] / 100 * $map['ow']) + $map['tx']) / $map['kw'] * 100;
                $y = ($map['s'] * ((float) $t['y'] / 100 * $map['oh']) + $map['ty']) / $map['kh'] * 100;
                $w = $map['s'] * ((float) $t['w'] / 100 * $map['ow']) / $map['kw'] * 100;
                $h = $map['s'] * ((float) $t['h'] / 100 * $map['oh']) / $map['kh'] * 100;
                $cx = $x + $w / 2; $cy = $y + $h / 2;
                if ($cx < 0 || $cx > 100 || $cy < 0 || $cy > 100) { continue; } // hors de la photo gardée : la zone reste avec le doublon
                $nx = max(0.0, min(100.0, $x)); $ny = max(0.0, min(100.0, $y));
                $nw = max(0.5, min(100.0 - $nx, $w)); $nh = max(0.5, min(100.0 - $ny, $h));
                $pdo->prepare('UPDATE media_tags SET media_id=?, x=?, y=?, w=?, h=? WHERE id=?')->execute([$keep, round($nx, 3), round($ny, 3), round($nw, 3), round($nh, 3), (int) $t['id']]);
                $ops[] = ['op' => 'tag', 'id' => (int) $t['id'], 'old' => ['media_id' => $oid, 'x' => (float) $t['x'], 'y' => (float) $t['y'], 'w' => (float) $t['w'], 'h' => (float) $t['h']], 'to' => $keep];
                $tags++;
            }
        }
        // 5. « en versions » : le fichier du doublon devient une version de la photo gardée
        if ($mode === 'version' && trim((string) $O['filename']) !== '') {
            $n = $pdo->prepare('SELECT count(*) FROM media_versions WHERE media_id=?');
            $n->execute([$keep]);
            if (!(int) $n->fetchColumn() && trim((string) $K['filename']) !== '') {
                $pdo->prepare('INSERT INTO media_versions(media_id, filename, label, is_original) VALUES(?,?,?,1)')->execute([$keep, basename((string) $K['filename']), 'Original']);
                $ops[] = ['op' => 'insert', 'table' => 'media_versions', 'id' => (int) $pdo->lastInsertId()];
            }
            $label = mb_substr('Doublon — ' . (trim((string) $O['title']) !== '' ? $O['title'] : basename((string) $O['filename'])) . ' — ' . $verDate, 0, 200);
            $ins = $pdo->prepare('INSERT OR IGNORE INTO media_versions(media_id, filename, label, is_original) VALUES(?,?,?,0)');
            $ins->execute([$keep, basename((string) $O['filename']), $label]);
            if ($ins->rowCount()) { $ops[] = ['op' => 'insert', 'table' => 'media_versions', 'id' => (int) $pdo->lastInsertId()]; $versions++; }
        }
        // 6. la photo écartée part (le fichier reste sur le disque ; tout ce qui lui restait est gardé pour « ↶ Annuler »)
        delete_media($pdo, ['media_id' => $oid]);
        $cid = (int) $pdo->query("SELECT max(id) FROM change_log WHERE entity_type='media' AND action='delete' AND entity_id=" . (int) $oid)->fetchColumn();
        $ops[] = ['op' => 'deleted', 'media_id' => $oid, 'change_id' => $cid];
    }
    $token = bin2hex(random_bytes(12));
    $n = count($others);
    $title = trim((string) $K['title']) !== '' ? (string) $K['title'] : basename((string) $K['filename']);
    $summary = ($n > 1 ? "$n doublons fusionnés" : '1 doublon fusionné') . ' avec « ' . mb_substr($title, 0, 80) . ' »' . ($mode === 'version' ? ' (gardés en versions)' : ' (mis à la corbeille)');
    $pdo->prepare('INSERT INTO image_dup_merges(token, keep_id, others_json, mode, ops_json, summary) VALUES(?,?,?,?,?,?)')->execute([$token, $keep,
        json_encode(array_map(static fn($o) => ['id' => (int) $o['row']['id'], 'title' => (string) $o['row']['title'], 'filename' => (string) $o['row']['filename'], 'thumbnail' => (string) $o['row']['thumbnail']], array_values($others)), JSON_UNESCAPED_UNICODE),
        $mode, json_encode($ops, JSON_UNESCAPED_UNICODE), $summary]);
    log_change($pdo, 'media', $keep, 'update', $summary, null, ['image_dup_merge' => $token]);
    return ['token' => $token, 'summary' => $summary, 'moved' => $moved, 'tags' => $tags, 'versions' => $versions, 'removed' => array_keys($others)];
}

/** ↶ Annuler une fusion : les étapes notées, à l'envers */
function imgdup_undo(PDO $pdo, array $d): array
{
    imgprint_ready($pdo);
    $token = scalar_text($d['token'] ?? '', 'token');
    if (!preg_match('/^[0-9a-f]{24}$/', $token)) { throw new LcndaBadInput('Fusion inconnue.'); }
    $q = $pdo->prepare('SELECT * FROM image_dup_merges WHERE token=?');
    $q->execute([$token]);
    $m = $q->fetch(PDO::FETCH_ASSOC);
    if (!$m) { throw new RuntimeException('Fusion introuvable.'); }
    if ($m['undone_at'] !== null) { throw new RuntimeException('Cette fusion est déjà annulée.'); }
    $ops = json_decode((string) $m['ops_json'], true) ?: [];
    if (!function_exists('restore_deleted_media')) { throw new RuntimeException('Annulation impossible ici.'); }
    foreach (array_reverse($ops) as $op) {
        switch ($op['op'] ?? '') {
            case 'deleted':
                $id = safe_int($op['media_id'] ?? 0);
                if (record_exists($pdo, 'media', $id)) { break; } // déjà remise (journal des modifications)
                $c = $pdo->prepare('SELECT * FROM change_log WHERE id=? AND entity_type=\'media\' AND entity_id=?');
                $c->execute([safe_int($op['change_id'] ?? 0), $id]);
                $change = $c->fetch(PDO::FETCH_ASSOC);
                if (!$change) { throw new RuntimeException('La photo écartée n’a pas été trouvée dans le journal.'); }
                restore_deleted_media($pdo, $change, json_decode((string) $change['before_json'], true) ?: []);
                break;
            case 'move':
                $t = (string) ($op['table'] ?? ''); $c = (string) ($op['col'] ?? '');
                $okTable = $t === 'media_links' || $t === 'label_links' || in_array([$t, $c], IMGDUP_REFS, true);
                if (!$okTable || !imgdup_has_col($pdo, $t, $c)) { break; }
                $upd = $pdo->prepare("UPDATE OR IGNORE {$t} SET {$c}=? WHERE id=? AND {$c}=?");
                foreach ((array) ($op['ids'] ?? []) as $rid) { $upd->execute([safe_int($op['from'] ?? 0), safe_int($rid), safe_int($op['to'] ?? 0)]); }
                break;
            case 'tag':
                $o = (array) ($op['old'] ?? []);
                $pdo->prepare('UPDATE media_tags SET media_id=?, x=?, y=?, w=?, h=? WHERE id=? AND media_id=?')->execute([safe_int($o['media_id'] ?? 0), (float) ($o['x'] ?? 0), (float) ($o['y'] ?? 0), (float) ($o['w'] ?? 0), (float) ($o['h'] ?? 0), safe_int($op['id'] ?? 0), safe_int($op['to'] ?? 0)]);
                break;
            case 'insert':
                if (($op['table'] ?? '') === 'media_versions') { $pdo->prepare('DELETE FROM media_versions WHERE id=?')->execute([safe_int($op['id'] ?? 0)]); }
                break;
        }
    }
    $pdo->prepare('UPDATE image_dup_merges SET undone_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $m['id']]);
    log_change($pdo, 'media', (int) $m['keep_id'], 'update', 'Fusion de doublons annulée : ' . $m['summary'], null, ['image_dup_undo' => $token]);
    return ['token' => $token, 'restored' => array_map(static fn($o) => (int) ($o['id'] ?? 0), json_decode((string) $m['others_json'], true) ?: [])];
}

function image_prints_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action === 'image_prints_status') { json_response(imgprint_status($pdo, imgprint_algo($_GET['algo'] ?? 0))); }
            if ($action === 'image_prints_todo') { json_response(imgprint_todo($pdo, imgprint_algo($_GET['algo'] ?? 0), safe_int($_GET['limit'] ?? 6, 6))); }
            if ($action === 'image_prints_all') { json_response(imgprint_all($pdo, imgprint_algo($_GET['algo'] ?? 0))); }
            if ($action === 'image_dup_state') { json_response(imgdup_state($pdo)); }
            json_response(['error' => 'Action inconnue sur les images semblables.'], 400);
        }
        $out = null;
        $pdo->beginTransaction();
        try {
            $out = match ($action) {
                'image_prints_save' => imgprint_save($pdo, $payload),
                'image_dup_dismiss' => imgdup_dismiss($pdo, $payload),
                'image_dup_merge' => imgdup_merge($pdo, $payload),
                'image_dup_undo' => imgdup_undo($pdo, $payload),
                default => throw new LcndaBadInput('Action inconnue sur les images semblables.'),
            };
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(['ok' => true] + $out);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
