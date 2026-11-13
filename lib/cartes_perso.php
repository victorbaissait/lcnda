<?php
declare(strict_types=1);

/**
 * LCNDA — 🗺 Mes cartes (Carte → « 🗺 Mes cartes ») : des cartes faites sur mesure, chacune = un nom, une description, un fond
 * (ceux de la Carte), une période, une vue gardée et des COUCHES choisies parmi tout ce que la base sait placer, chaque couche
 * avec ses filtres (dates, personnes et leurs ascendants / descendants, Sosa, branche, étiquettes, lieu ou zone, certitude,
 * sortes d'événements…) et son style. Écran : assets/js/heritage-cartes-perso.js (moteur de la Carte : app-carte.js, crochets
 * ext.mapSetup / ext.mapDraw), calculs purs : assets/js/app-cartes-perso-core.js. Mode d'emploi : docs/UI.md (« 🗺 Mes cartes »).
 *
 * GET  cartes_perso&op=list              → mes cartes (sans les supprimées) + les cartes prêtes (« 🖼 Images de lieux »)
 * GET  cartes_perso&op=get&id=N          → une carte
 * GET  cartes_perso&op=data&def=JSON     → les formes de chaque couche (lecture seule, bornée) ; &share=1 (exports, site, impression) :
 *                                          jamais un vivant ni une fiche confidentielle (df_hidden_people, comme les autres exports).
 * POST cartes_perso_write {op: save | delete | restore | duplicate | order}
 *                                        → une carte enregistrée (définition nettoyée ici aussi), supprimée (gardée 30 jours pour
 *                                          « ↶ Annuler »), remise, copiée.
 * Rien n'est écrit dans la généalogie : une carte ne garde que sa définition (jamais les données).
 */

const MCP_MAX_LAYERS = 24;
const MCP_MAX_FEATURES = 20000;
const MCP_MAX_DEF = 60000;
/** les sortes de couches : clé => [icône, nom, couleur de départ, forme de départ] (même liste dans app-cartes-perso-core.js) */
const MCP_KINDS = [
    'births' => ['👶', 'Naissances', '#2b8a3e', 'circle'],
    'marriages' => ['💍', 'Mariages', '#c2255c', 'diamond'],
    'deaths' => ['✝', 'Décès', '#495057', 'square'],
    'burials' => ['⚱', 'Inhumations et tombes', '#7048e8', 'square'],
    'residences' => ['🏠', 'Résidences', '#1971c2', 'circle'],
    'census' => ['📋', 'Recensements', '#0b7285', 'triangle'],
    'events' => ['📅', 'Événements (choisis)', '#e8590c', 'circle'],
    'moves' => ['➜', 'Migrations et voyages', '#d9480f', 'circle'],
    'life' => ['🧭', 'Lieux de vie d’une personne', '#f08c00', 'circle'],
    'surnames' => ['🔤', 'Patronymes', '#5f3dc4', 'circle'],
    'trades' => ['🔨', 'Métiers', '#c2611a', 'square'],
    'houses' => ['🏡', 'Maisons', '#8a6a2f', 'pin'],
    'placeimages' => ['🖼', 'Images de lieux', '#0ca678', 'pin'],
    'monuments' => ['🎖', 'Monuments aux morts', '#b42318', 'star'],
    'sources' => ['📚', 'Sources', '#364fc7', 'square'],
    'media' => ['📷', 'Médias placés', '#1098ad', 'pin'],
    'animals' => ['🐾', 'Animaux suivis', '#2f9e44', 'circle'],
    'history' => ['🏛', 'Événements historiques', '#862e9c', 'star'],
    'drawn' => ['✏️', 'Mes couches dessinées ou importées', '#d9480f', 'circle'],
];
const MCP_SHAPES = ['circle', 'square', 'diamond', 'triangle', 'star', 'pin', 'cross'];
const MCP_CERT = ['certain' => 1.0, 'deduced' => 0.8, 'estimated' => 0.6, 'doubt' => 0.35, 'unknown' => null];
const MCP_TAGS = [
    'births' => ['BIRT', 'CHR', 'BAPM'], 'marriages' => ['MARR', 'MRCI', 'MRRE', 'ENGA', 'MARC', 'MARB'], 'deaths' => ['DEAT'],
    'burials' => ['BURI', 'CREM'], 'residences' => ['RESI'],
];

function cartes_perso_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS custom_maps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        def_json TEXT NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}

function cartes_perso_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'cartes_perso') {
            $op = scalar_text($_GET['op'] ?? '', 'op');
            json_response(match ($op) {
                'list' => ['maps' => mcp_list($pdo), 'ready' => mcp_ready(), 'kinds' => mcp_kinds_out()],
                'get' => ['map' => mcp_get($pdo, safe_int($_GET['id'] ?? 0))],
                'data' => mcp_data($pdo, mcp_def_from((string) ($_GET['def'] ?? '')), !empty($_GET['share'])),
                default => throw new RuntimeException('Demande de carte inconnue.'),
            });
        }
        if ($isWrite && $action === 'cartes_perso_write') {
            cartes_perso_schema($pdo);
            $op = scalar_text($payload['op'] ?? '', 'op');
            json_response(match ($op) {
                'save' => mcp_save($pdo, $payload),
                'delete' => mcp_delete($pdo, $payload, true),
                'restore' => mcp_delete($pdo, $payload, false),
                'duplicate' => mcp_duplicate($pdo, $payload),
                'order' => mcp_order($pdo, $payload),
                default => throw new RuntimeException('Opération de carte inconnue.'),
            });
        }
        json_response(['error' => 'Action de carte inconnue.'], 400);
    } catch (JsonException) {
        json_response(['error' => 'Carte illisible.'], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}

function mcp_kinds_out(): array
{
    $o = [];
    foreach (MCP_KINDS as $k => [$i, $n, $c, $s]) { $o[] = ['key' => $k, 'icon' => $i, 'name' => $n, 'color' => $c, 'shape' => $s]; }
    return $o;
}

/** les cartes prêtes d'office (pas en base tant qu'on ne les modifie pas) */
function mcp_ready(): array
{
    return [[
        'id' => 'ready:images', 'ready' => true, 'name' => '🖼 Images de lieux',
        'description' => 'Les photos, cartes postales et gravures de lieux : à leur place, en zone quand le lieu exact n’est pas sûr, avec l’angle de prise de vue.',
        'def' => mcp_clean_def(['legend' => true, 'layers' => [['kind' => 'placeimages', 'name' => 'Images de lieux', 's' => ['cluster' => true, 'labels' => false, 'size' => 12]]]]),
    ]];
}

/* ═════════ Les cartes enregistrées ═════════ */

function mcp_table(PDO $pdo): bool
{
    return (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='custom_maps'")->fetchColumn();
}

function mcp_row(array $r): array
{
    $d = json_decode((string) $r['def_json'], true);
    $def = mcp_clean_def(is_array($d) ? $d : []);
    return ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'description' => (string) $r['description'], 'def' => $def,
        'layers' => count($def['layers']), 'sort_order' => (int) $r['sort_order'], 'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at']];
}

function mcp_list(PDO $pdo): array
{
    if (!mcp_table($pdo)) { return []; }
    return array_map('mcp_row', $pdo->query('SELECT * FROM custom_maps WHERE deleted_at IS NULL ORDER BY sort_order, id')->fetchAll());
}

function mcp_get(PDO $pdo, int $id): array
{
    if (!mcp_table($pdo)) { throw new RuntimeException('Carte introuvable.'); }
    $s = $pdo->prepare('SELECT * FROM custom_maps WHERE id=? AND deleted_at IS NULL'); $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Carte introuvable.'); }
    return mcp_row($r);
}

function mcp_text(mixed $v, int $max): string
{
    if (!is_scalar($v)) { return ''; }
    $t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) $v) ?? '';
    return mb_substr(trim($t), 0, $max);
}
function mcp_color(mixed $v, string $fallback): string
{
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : $fallback;
}
function mcp_num(mixed $v, float $min, float $max, ?float $fallback): ?float
{
    if (!is_numeric($v)) { return $fallback; }
    $n = (float) $v;
    return is_finite($n) ? max($min, min($max, $n)) : $fallback;
}
function mcp_ids(mixed $v, int $max = 200): array
{
    if (!is_array($v)) { return []; }
    $o = [];
    foreach (array_slice($v, 0, $max) as $x) { $n = is_array($x) ? (int) ($x['id'] ?? 0) : (int) $x; if ($n > 0) { $o[$n] = $n; } }
    return array_values($o);
}
/** années d'un texte de date (« 1850 », « entre 1880 et 1885 », « avant 1900 », « 7 mai 1925 ») → [de, à] (null = ouvert) */
function mcp_years(string $t): array
{
    $t = mb_strtolower(trim($t));
    if ($t === '') { return [null, null]; }
    preg_match_all('/(?<!\d)(\d{3,4})(?!\d)/', $t, $m);
    $ys = array_map('intval', $m[1] ?? []);
    if (!$ys) { return [null, null]; }
    if (preg_match('/^(avant|av\.?|jusqu)/u', $t)) { return [null, $ys[0]]; }
    if (preg_match('/^(apr[eè]s|ap\.?|depuis|à partir)/u', $t)) { return [$ys[0], null]; }
    return [min($ys), max($ys)];
}

/** « Du … au … » (C4) → [de, à] : « 1850 » seul dans « Du » = à partir de 1850 ; « entre 1880 et 1900 » = les deux */
function mcp_range(string $from, string $to): array
{
    [$a0, $a1] = mcp_years($from); [$b0, $b1] = mcp_years($to);
    $lo = $a0; $hi = null;
    if ($from !== '' && ($a0 === null || $a1 !== $a0 || preg_match('/\b(entre|et)\b|[–-]/u', $from))) { $hi = $a1; }
    if ($to !== '') { $hi = $b1 ?? $b0; }
    return [$lo, $hi];
}

/** une définition remise d'aplomb (mêmes règles que cleanDef d'app-cartes-perso-core.js) */
function mcp_clean_def(array $d): array
{
    $view = null;
    if (is_array($d['view'] ?? null) && is_numeric($d['view']['lat'] ?? null) && is_numeric($d['view']['lon'] ?? null)) {
        $view = ['lat' => round((float) mcp_num($d['view']['lat'], -85, 85, 46.7), 5), 'lon' => round((float) mcp_num($d['view']['lon'], -180, 180, 2.3), 5), 'zoom' => (int) mcp_num($d['view']['zoom'] ?? 6, 2, 19, 6)];
    }
    $t = is_array($d['time'] ?? null) ? $d['time'] : [];
    $time = ['from' => mcp_text($t['from'] ?? '', 60), 'to' => mcp_text($t['to'] ?? '', 60), 'mode' => in_array($t['mode'] ?? '', ['cumul', 'window'], true) ? $t['mode'] : 'cumul',
        'win' => (int) mcp_num($t['win'] ?? 10, 1, 200, 10), 'secs' => (int) mcp_num($t['secs'] ?? 12, 3, 120, 12)];
    $layers = [];
    $raw = is_array($d['layers'] ?? null) ? array_values($d['layers']) : [];
    if (count($raw) > MCP_MAX_LAYERS) { throw new RuntimeException('Trop de couches sur une carte (' . MCP_MAX_LAYERS . ' au plus).'); }
    foreach ($raw as $i => $l) { if (is_array($l) && ($c = mcp_clean_layer($l, $i))) { $layers[] = $c; } }
    return ['v' => 1, 'bg' => is_string($d['bg'] ?? null) && preg_match('/^[a-z0-9_-]{1,40}$/', $d['bg']) ? $d['bg'] : '',
        'legend' => !array_key_exists('legend', $d) || !empty($d['legend']), 'view' => $view, 'time' => $time, 'layers' => $layers];
}

function mcp_clean_layer(array $l, int $i): ?array
{
    $kind = (string) ($l['kind'] ?? '');
    if (!isset(MCP_KINDS[$kind])) { return null; }
    [, $name, $color, $shape] = MCP_KINDS[$kind];
    $f = is_array($l['f'] ?? null) ? $l['f'] : [];
    $s = is_array($l['s'] ?? null) ? $l['s'] : [];
    $cert = array_values(array_intersect(['certain', 'deduced', 'estimated', 'doubt', 'unknown', 'probable', 'possible', 'verify'], is_array($f['cert'] ?? null) ? $f['cert'] : []));
    return [
        'id' => is_string($l['id'] ?? null) && preg_match('/^[a-z0-9_-]{1,24}$/i', $l['id']) ? $l['id'] : 'l' . ($i + 1),
        'kind' => $kind, 'name' => mcp_text($l['name'] ?? '', 80) ?: $name, 'visible' => !array_key_exists('visible', $l) || !empty($l['visible']),
        'f' => [
            'from' => mcp_text($f['from'] ?? '', 60), 'to' => mcp_text($f['to'] ?? '', 60), 'undated' => !array_key_exists('undated', $f) || !empty($f['undated']),
            'persons' => mcp_ids($f['persons'] ?? []), 'rel' => in_array($f['rel'] ?? '', ['self', 'asc', 'desc', 'both'], true) ? $f['rel'] : 'self',
            'gens' => (int) mcp_num($f['gens'] ?? 4, 1, 40, 4), 'sosa' => !empty($f['sosa']), 'sosaGens' => (int) mcp_num($f['sosaGens'] ?? 0, 0, 40, 0),
            'branch' => (int) mcp_num($f['branch'] ?? 0, 0, PHP_INT_MAX, 0), 'side' => in_array($f['side'] ?? '', ['', 'father', 'mother'], true) ? ($f['side'] ?? '') : '',
            'labels' => mcp_ids($f['labels'] ?? [], 40), 'gender' => in_array($f['gender'] ?? '', ['', 'male', 'female', 'unknown'], true) ? ($f['gender'] ?? '') : '',
            'place' => (int) mcp_num($f['place'] ?? 0, 0, PHP_INT_MAX, 0), 'radius' => (float) mcp_num($f['radius'] ?? 15, 0.1, 2000, 15),
            'zone' => (int) mcp_num($f['zone'] ?? 0, 0, PHP_INT_MAX, 0), 'cert' => $cert,
            'types' => mcp_ids($f['types'] ?? [], 80), 'text' => mcp_text($f['text'] ?? '', 120), 'pets' => mcp_ids($f['pets'] ?? [], 80),
            'layers' => mcp_ids($f['layers'] ?? [], 80), 'retained' => !empty($f['retained']), 'voyages' => !array_key_exists('voyages', $f) || !empty($f['voyages']),
        ],
        's' => [
            'color' => mcp_color($s['color'] ?? '', $color), 'shape' => in_array($s['shape'] ?? '', MCP_SHAPES, true) ? $s['shape'] : $shape,
            'size' => (int) mcp_num($s['size'] ?? 10, 4, 40, 10), 'opacity' => (int) mcp_num($s['opacity'] ?? 90, 10, 100, 90),
            'cluster' => !array_key_exists('cluster', $s) || !empty($s['cluster']), 'heat' => !empty($s['heat']), 'labels' => !empty($s['labels']),
            'byCat' => !empty($s['byCat']), 'lines' => !array_key_exists('lines', $s) || !empty($s['lines']), 'cones' => !array_key_exists('cones', $s) || !empty($s['cones']),
        ],
    ];
}

function mcp_def_from(string $json): array
{
    if (strlen($json) > MCP_MAX_DEF) { throw new RuntimeException('Carte trop longue à décrire.'); }
    $d = $json === '' ? [] : json_decode($json, true, 32, JSON_THROW_ON_ERROR);
    return mcp_clean_def(is_array($d) ? $d : []);
}

function mcp_save(PDO $pdo, array $p): array
{
    $id = safe_int($p['id'] ?? 0);
    $name = mcp_text($p['name'] ?? '', 80) ?: 'Ma carte';
    $desc = mcp_text($p['description'] ?? '', 1000);
    $def = mcp_clean_def(is_array($p['def'] ?? null) ? $p['def'] : []);
    $json = json_encode($def, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if (strlen($json) > MCP_MAX_DEF) { throw new RuntimeException('Carte trop longue à décrire.'); }
    if ($id > 0) {
        $s = $pdo->prepare('SELECT id FROM custom_maps WHERE id=?'); $s->execute([$id]);
        if (!$s->fetchColumn()) { throw new RuntimeException('Carte introuvable.'); }
        $pdo->prepare('UPDATE custom_maps SET name=?, description=?, def_json=?, deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $desc, $json, $id]);
    } else {
        $order = (int) $pdo->query('SELECT COALESCE(MAX(sort_order),0)+10 FROM custom_maps')->fetchColumn();
        $pdo->prepare('INSERT INTO custom_maps(name, description, def_json, sort_order) VALUES(?,?,?,?)')->execute([$name, $desc, $json, $order]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['ok' => true, 'map' => mcp_get($pdo, $id)];
}

function mcp_delete(PDO $pdo, array $p, bool $delete): array
{
    $id = safe_int($p['id'] ?? 0);
    $s = $pdo->prepare('SELECT id FROM custom_maps WHERE id=?'); $s->execute([$id]);
    if (!$id || !$s->fetchColumn()) { throw new RuntimeException('Carte introuvable.'); }
    $pdo->prepare('UPDATE custom_maps SET deleted_at=' . ($delete ? 'CURRENT_TIMESTAMP' : 'NULL') . ' WHERE id=?')->execute([$id]);
    $pdo->exec("DELETE FROM custom_maps WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')");
    return ['ok' => true, 'id' => $id];
}

function mcp_duplicate(PDO $pdo, array $p): array
{
    $src = mcp_get($pdo, safe_int($p['id'] ?? 0));
    $names = array_column(mcp_list($pdo), 'name');
    $name = mcp_text($p['name'] ?? '', 80);
    if ($name === '') { $n = 2; do { $name = mb_substr($src['name'], 0, 70) . " ($n)"; $n++; } while (in_array($name, $names, true)); }
    return mcp_save($pdo, ['name' => $name, 'description' => $src['description'], 'def' => $src['def']]);
}

function mcp_order(PDO $pdo, array $p): array
{
    $ids = array_values(array_filter(array_map('intval', is_array($p['ids'] ?? null) ? array_slice($p['ids'], 0, 500) : [])));
    $st = $pdo->prepare('UPDATE custom_maps SET sort_order=? WHERE id=?');
    foreach ($ids as $i => $id) { $st->execute([($i + 1) * 10, $id]); }
    return ['ok' => true];
}

/* ═════════ Les données d'une carte ═════════ */

function mcp_has_table(PDO $pdo, string $t): bool
{
    static $m = [];
    return $m[$t] ??= (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($t))->fetchColumn();
}
function mcp_has_col(PDO $pdo, string $t, string $c): bool
{
    static $m = [];
    return $m["$t.$c"] ??= mcp_has_table($pdo, $t) && (bool) $pdo->query("SELECT 1 FROM pragma_table_info('$t') WHERE name=" . $pdo->quote($c))->fetchColumn();
}
function mcp_ok_coord(mixed $lat, mixed $lon): bool
{
    if (!is_numeric($lat) || !is_numeric($lon)) { return false; }
    $a = (float) $lat; $o = (float) $lon;
    return is_finite($a) && is_finite($o) && abs($a) <= 90 && abs($o) <= 180 && !($a == 0.0 && $o == 0.0);
}
function mcp_pt(mixed $lat, mixed $lon): array { return [round((float) $lon, 6), round((float) $lat, 6)]; }

/** les parents d'une personne : [[id, genre, rang dans le couple]] */
function mcp_parents(PDO $pdo, int $id): array
{
    static $st = null;
    $st ??= $pdo->prepare('SELECT f.partner1_id AS a, f.partner2_id AS b, pa.gender AS ga, pb.gender AS gb FROM family_children fc JOIN families f ON f.id=fc.family_id LEFT JOIN persons pa ON pa.id=f.partner1_id LEFT JOIN persons pb ON pb.id=f.partner2_id WHERE fc.child_id=?');
    $st->execute([$id]);
    $o = [];
    foreach ($st->fetchAll() as $r) {
        if ((int) $r['a']) { $o[] = [(int) $r['a'], (string) $r['ga'], 1]; }
        if ((int) $r['b']) { $o[] = [(int) $r['b'], (string) $r['gb'], 2]; }
    }
    return $o;
}
/** les numéros Sosa des ancêtres de la personne de départ : [id => numéro] */
function mcp_sosa(PDO $pdo, int $maxGen = 40): array
{
    $root = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn();
    if (!$root) { return []; }
    $out = [$root => 1]; $level = [[$root, 1]];
    for ($g = 1; $g <= $maxGen && $level; $g++) {
        $next = [];
        foreach ($level as [$pid, $n]) {
            foreach (mcp_parents($pdo, $pid) as [$par, $gender, $rank]) {
                $num = $gender === 'female' ? 2 * $n + 1 : ($gender === 'male' ? 2 * $n : ($rank === 1 ? 2 * $n : 2 * $n + 1));
                if (!isset($out[$par]) && $num < PHP_INT_MAX / 4) { $out[$par] = $num; $next[] = [$par, $num]; }
            }
        }
        $level = $next;
    }
    return $out;
}

/** l'ensemble des personnes gardées par les filtres de personnes d'une couche (null = toutes) */
function mcp_person_scope(PDO $pdo, array $f): ?array
{
    if (!function_exists('h_ancestors')) { require_once __DIR__ . '/heritage.php'; }
    $sets = [];
    if ($f['persons']) {
        $s = [];
        foreach ($f['persons'] as $id) {
            $s[$id] = true;
            if (in_array($f['rel'], ['asc', 'both'], true)) { foreach (array_keys(h_ancestors($pdo, $id, $f['gens'])) as $x) { $s[(int) $x] = true; } }
            if (in_array($f['rel'], ['desc', 'both'], true)) { foreach (array_keys(h_descendants($pdo, [$id], $f['gens'], false)) as $x) { $s[(int) $x] = true; } }
        }
        $sets[] = $s;
    }
    if ($f['sosa'] || $f['side'] !== '') {
        $sosa = mcp_sosa($pdo, $f['sosaGens'] ?: 40);
        $s = [];
        foreach ($sosa as $id => $n) {
            if ($f['side'] !== '' && $n > 1) {
                // côté du père : 2, 4-5, 8-11… ; côté de la mère : 3, 6-7, 12-15…
                $b = $n; while ($b > 3) { $b >>= 1; }
                if (($f['side'] === 'father') !== ($b === 2)) { continue; }
            } elseif ($f['side'] !== '' && $n === 1) { continue; }
            $s[$id] = true;
        }
        $sets[] = $s;
    }
    if ($f['branch'] && mcp_has_table($pdo, 'branch_people')) {
        $st = $pdo->prepare('SELECT person_id FROM branch_people WHERE branch_id=?'); $st->execute([$f['branch']]);
        $s = array_fill_keys(array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN)), true);
        $st = $pdo->prepare('SELECT root_person_id FROM branches WHERE id=?'); $st->execute([$f['branch']]);
        if ($root = (int) $st->fetchColumn()) { $s[$root] = true; }
        $sets[] = $s;
    }
    if ($f['labels'] && mcp_has_table($pdo, 'label_links')) {
        $in = implode(',', $f['labels']);
        $sets[] = array_fill_keys(array_map('intval', $pdo->query("SELECT entity_id FROM label_links WHERE entity_type='person' AND label_id IN ($in)")->fetchAll(PDO::FETCH_COLUMN)), true);
    }
    if ($f['gender'] !== '') {
        $q = $f['gender'] === 'unknown' ? "SELECT id FROM persons WHERE gender IS NULL OR gender NOT IN ('male','female')" : 'SELECT id FROM persons WHERE gender=' . $pdo->quote($f['gender']);
        $sets[] = array_fill_keys(array_map('intval', $pdo->query($q)->fetchAll(PDO::FETCH_COLUMN)), true);
    }
    if (!$sets) { return null; }
    $out = array_shift($sets);
    foreach ($sets as $s) { $out = array_intersect_key($out, $s); }
    return $out;
}

/** le contexte de filtre d'une couche : personnes, cachés, années, cercle, zone, certitude */
function mcp_ctx(PDO $pdo, array $layer, array $def, ?array $hidden): array
{
    $f = $layer['f'];
    [$y0, $y1] = mcp_range($f['from'], $f['to']);
    [$m0, $m1] = mcp_range($def['time']['from'], $def['time']['to']);
    if ($m0 !== null) { $y0 = $y0 === null ? $m0 : max($y0, $m0); }
    if ($m1 !== null) { $y1 = $y1 === null ? $m1 : min($y1, $m1); }
    $circle = null;
    if ($f['place']) {
        $s = $pdo->prepare('SELECT latitude, longitude FROM places WHERE id=?'); $s->execute([$f['place']]);
        $r = $s->fetch();
        $circle = $r && mcp_ok_coord($r['latitude'], $r['longitude']) ? [(float) $r['latitude'], (float) $r['longitude'], $f['radius']] : [0.0, 0.0, -1.0];
    }
    $zone = null;
    if ($f['zone'] && mcp_has_table($pdo, 'map_layers')) {
        $s = $pdo->prepare('SELECT features FROM map_layers WHERE id=? AND deleted_at IS NULL'); $s->execute([$f['zone']]);
        $zone = [];
        foreach (json_decode((string) $s->fetchColumn(), true) ?: [] as $ft) { if (($ft['geometry']['type'] ?? '') === 'Polygon' && is_array($ft['geometry']['coordinates'][0] ?? null)) { $zone[] = $ft['geometry']['coordinates'][0]; } }
    }
    return ['f' => $f, 'scope' => mcp_person_scope($pdo, $f), 'hidden' => $hidden, 'y0' => $y0, 'y1' => $y1, 'circle' => $circle, 'zone' => $zone];
}

function mcp_year_ok(array $c, ?int $y, ?int $y1 = null): bool
{
    if ($y === null) { return $c['f']['undated']; }
    $hi = $y1 ?? $y;
    return !(($c['y0'] !== null && $hi < $c['y0']) || ($c['y1'] !== null && $y > $c['y1']));
}
function mcp_in_ring(float $lon, float $lat, array $ring): bool
{
    $in = false; $n = count($ring);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        $xi = (float) $ring[$i][0]; $yi = (float) $ring[$i][1]; $xj = (float) $ring[$j][0]; $yj = (float) $ring[$j][1];
        if ((($yi > $lat) !== ($yj > $lat)) && ($lon < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12) + $xi)) { $in = !$in; }
    }
    return $in;
}
/** le point est-il dans le lieu (cercle) et la zone choisis ? */
function mcp_where_ok(array $c, float $lon, float $lat): bool
{
    if ($c['circle'] !== null) {
        [$clat, $clon, $r] = $c['circle'];
        if ($r < 0) { return false; }
        if (!function_exists('h_distance_km')) { require_once __DIR__ . '/heritage.php'; }
        if (h_distance_km($clat, $clon, $lat, $lon) > $r) { return false; }
    }
    if ($c['zone'] !== null) {
        foreach ($c['zone'] as $ring) { if (mcp_in_ring($lon, $lat, $ring)) { return true; } }
        return false;
    }
    return true;
}
/** les gens d'une forme : gardée si l'un d'eux est dans le périmètre (et, en partage, aucun n'est caché) */
function mcp_people_ok(array $c, array $people): bool
{
    $people = array_values(array_filter($people));
    if ($c['hidden'] !== null) { foreach ($people as $p) { if (isset($c['hidden'][$p])) { return false; } } }
    if ($c['scope'] === null) { return true; }
    foreach ($people as $p) { if (isset($c['scope'][$p])) { return true; } }
    return false;
}

function mcp_names(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $o = [];
    foreach (array_chunk($ids, 500) as $ch) {
        foreach ($pdo->query('SELECT id, first_name, last_name FROM persons WHERE id IN (' . implode(',', $ch) . ')') as $r) {
            $o[(int) $r['id']] = trim(trim((string) $r['first_name']) . ' ' . mb_strtoupper(trim((string) $r['last_name'])));
        }
    }
    return $o;
}

function mcp_data(PDO $pdo, array $def, bool $share): array
{
    $hidden = null;
    if ($share) { require_once __DIR__ . '/cartes_outils.php'; $hidden = cartes_outils_hidden($pdo); }
    $out = []; $all = [];
    foreach ($def['layers'] as $layer) {
        $c = mcp_ctx($pdo, $layer, $def, $hidden);
        $feats = []; $note = '';
        try {
            $feats = match ($layer['kind']) {
                'births', 'marriages', 'deaths', 'residences' => mcp_events($pdo, $c, MCP_TAGS[$layer['kind']], []),
                'burials' => array_merge(mcp_events($pdo, $c, MCP_TAGS['burials'], []), mcp_graves($pdo, $c)),
                'events' => mcp_events($pdo, $c, [], $c['f']['types']),
                'census' => mcp_census($pdo, $c),
                'moves' => mcp_moves($pdo, $c),
                'life' => mcp_life($pdo, $c),
                'surnames' => mcp_surnames($pdo, $c),
                'trades' => mcp_trades($pdo, $c),
                'houses' => mcp_houses($pdo, $c),
                'placeimages' => mcp_place_images($pdo, $c),
                'monuments' => mcp_monuments($pdo, $c),
                'sources' => mcp_sources($pdo, $c),
                'media' => mcp_media($pdo, $c),
                'animals' => mcp_animals($pdo, $c),
                'history' => mcp_history($pdo, $c),
                'drawn' => mcp_drawn($pdo, $c),
                default => [],
            };
        } catch (PDOException) { $feats = []; $note = 'Ces données ne sont pas encore dans cette généalogie.'; }
        if ($layer['kind'] === 'life' && !$c['f']['persons']) { $note = 'Choisis une ou plusieurs personnes.'; }
        $cut = count($feats) > MCP_MAX_FEATURES;
        if ($cut) { $feats = array_slice($feats, 0, MCP_MAX_FEATURES); $note = 'Seulement les ' . MCP_MAX_FEATURES . ' premiers : précise les filtres.'; }
        $ys = [];
        foreach ($feats as $ft) { if (isset($ft['y'])) { $ys[] = $ft['y']; } if (isset($ft['y1'])) { $ys[] = $ft['y1']; } }
        $all = array_merge($all, $ys);
        $out[] = ['id' => $layer['id'], 'kind' => $layer['kind'], 'n' => count($feats), 'features' => $feats, 'years' => $ys ? [min($ys), max($ys)] : null, 'note' => $note, 'cut' => $cut];
    }
    return ['layers' => $out, 'years' => $all ? [min($all), max($all)] : null, 'share' => $share, 'hidden' => $hidden !== null ? count($hidden) : 0];
}

/* ═════════ Une couche par sorte ═════════ */

/** les événements de ces sortes (tags GEDCOM) ou de ces types (ids) */
function mcp_events(PDO $pdo, array $c, array $tags, array $typeIds): array
{
    $where = [];
    if ($tags) { $where[] = 't.gedcom_tag IN (' . implode(',', array_map([$pdo, 'quote'], $tags)) . ')'; }
    if ($typeIds) { $where[] = 't.id IN (' . implode(',', array_map('intval', $typeIds)) . ')'; }
    $cond = $where ? '(' . implode(' OR ', $where) . ')' : '1=1';
    if ($c['y0'] !== null && !$c['f']['undated']) { $cond .= ' AND e.year >= ' . (int) $c['y0']; }
    if ($c['y1'] !== null && !$c['f']['undated']) { $cond .= ' AND e.year <= ' . (int) $c['y1']; }
    $rows = $pdo->query("SELECT e.id, e.year, e.date_text, e.person_id, f.partner1_id, f.partner2_id, t.gedcom_tag AS tag, t.label AS tl, t.id AS tid,
            e.fact_confidence AS fc, e.precise_lat, e.precise_lon, pl.id AS place_id, pl.name AS pname, pl.latitude, pl.longitude
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        WHERE $cond ORDER BY COALESCE(e.year, 99999), e.id")->fetchAll();
    $certOk = array_values(array_intersect($c['f']['cert'], array_keys(MCP_CERT)));
    $keep = [];
    foreach ($rows as $r) {
        $lat = $r['precise_lat'] ?? null; $lon = $r['precise_lon'] ?? null;
        if (!mcp_ok_coord($lat, $lon)) { $lat = $r['latitude']; $lon = $r['longitude']; }
        if (!mcp_ok_coord($lat, $lon)) { continue; }
        $y = $r['year'] !== null && $r['year'] !== '' ? (int) $r['year'] : null;
        if (!mcp_year_ok($c, $y)) { continue; }
        $fc = (string) ($r['fc'] ?: 'unknown');
        if ($certOk && !in_array($fc, $certOk, true)) { continue; }
        $people = [(int) $r['person_id'], (int) $r['partner1_id'], (int) $r['partner2_id']];
        if (!mcp_people_ok($c, $people)) { continue; }
        if (!mcp_where_ok($c, (float) $lon, (float) $lat)) { continue; }
        $keep[] = [$r, $people, (float) $lat, (float) $lon, $y, MCP_CERT[$fc] ?? null];
    }
    $names = $keep ? mcp_names($pdo, array_merge(...array_map(static fn($k) => $k[1], $keep))) : [];
    $o = [];
    foreach ($keep as [$r, $people, $lat, $lon, $y, $k]) {
        $who = implode(' et ', array_values(array_filter(array_map(static fn($p) => $names[$p] ?? '', array_values(array_unique(array_filter($people)))))));
        $o[] = ['g' => 'p', 'c' => mcp_pt($lat, $lon), 'y' => $y, 't' => $who ?: 'Sans nom', 's' => trim($r['tl'] . ($r['date_text'] ? ' · ' . $r['date_text'] : '')),
            'p' => (int) ($r['person_id'] ?: $r['partner1_id'] ?: $r['partner2_id']), 'pl' => (int) $r['place_id'], 'lab' => (string) $r['pname'], 'k' => $k, 'cat' => (string) $r['tl'], 'e' => (int) $r['id']];
    }
    return $o;
}

function mcp_graves(PDO $pdo, array $c): array
{
    if (!mcp_has_table($pdo, 'graves')) { return []; }
    $gp = mcp_has_table($pdo, 'grave_persons');
    $o = [];
    foreach ($pdo->query('SELECT * FROM graves WHERE gps_lat IS NOT NULL AND gps_lon IS NOT NULL') as $g) {
        if (!mcp_ok_coord($g['gps_lat'], $g['gps_lon'])) { continue; }
        $people = [];
        if ($gp) { $s = $pdo->prepare('SELECT person_id FROM grave_persons WHERE grave_id=?'); $s->execute([$g['id']]); $people = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); }
        if (($c['scope'] !== null || $c['hidden'] !== null) && !mcp_people_ok($c, $people ?: [0])) { continue; }
        if (!mcp_year_ok($c, null) || !mcp_where_ok($c, (float) $g['gps_lon'], (float) $g['gps_lat'])) { continue; }
        $n = mcp_names($pdo, $people);
        $o[] = ['g' => 'p', 'c' => mcp_pt($g['gps_lat'], $g['gps_lon']), 'y' => null, 't' => (string) ($g['cemetery_name'] ?: 'Tombe'), 's' => implode(' · ', array_values($n)), 'p' => $people[0] ?? 0, 'lab' => (string) ($g['city'] ?? ''), 'cat' => 'Tombe'];
    }
    return $o;
}

function mcp_census(PDO $pdo, array $c): array
{
    if (!mcp_has_table($pdo, 'census_records')) { return []; }
    $rows = $pdo->query('SELECT cr.id, cr.year, cr.address, pl.id AS place_id, pl.name, pl.latitude, pl.longitude FROM census_records cr JOIN places pl ON pl.id=cr.place_id')->fetchAll();
    $st = $pdo->prepare('SELECT person_id FROM census_members WHERE census_id=? AND person_id IS NOT NULL');
    $o = [];
    foreach ($rows as $r) {
        if (!mcp_ok_coord($r['latitude'], $r['longitude'])) { continue; }
        $y = $r['year'] !== null ? (int) $r['year'] : null;
        if (!mcp_year_ok($c, $y)) { continue; }
        $st->execute([$r['id']]); $people = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        if (($c['scope'] !== null || $c['hidden'] !== null) && !mcp_people_ok($c, $people ?: [0])) { continue; }
        if (!mcp_where_ok($c, (float) $r['longitude'], (float) $r['latitude'])) { continue; }
        $n = mcp_names($pdo, $people);
        $o[] = ['g' => 'p', 'c' => mcp_pt($r['latitude'], $r['longitude']), 'y' => $y, 't' => 'Recensement ' . ($y ?? ''), 's' => implode(', ', array_slice(array_values($n), 0, 6)) . (count($n) > 6 ? '…' : ''),
            'p' => $people[0] ?? 0, 'pl' => (int) $r['place_id'], 'lab' => (string) $r['name'], 'cat' => 'Recensement'];
    }
    return $o;
}

/** naissance et décès (ou inhumation) de chaque personne : [id => ['b' => [lat, lon, an, nom], 'd' => …]] */
function mcp_bd(PDO $pdo): array
{
    $o = [];
    foreach ($pdo->query("SELECT e.person_id AS pid, t.gedcom_tag AS tag, e.year, COALESCE(e.precise_lat, pl.latitude) AS lat, COALESCE(e.precise_lon, pl.longitude) AS lon, pl.name
        FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY e.id") as $r) {
        if (!mcp_ok_coord($r['lat'], $r['lon'])) { continue; }
        $k = in_array($r['tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'b' : 'd';
        $pid = (int) $r['pid'];
        // la naissance avant le baptême, le décès avant l'inhumation
        if (isset($o[$pid][$k]) && !in_array($r['tag'], ['BIRT', 'DEAT'], true)) { continue; }
        $o[$pid][$k] = [(float) $r['lat'], (float) $r['lon'], $r['year'] !== null ? (int) $r['year'] : null, (string) $r['name']];
    }
    return $o;
}

function mcp_moves(PDO $pdo, array $c): array
{
    $o = [];
    $bd = mcp_bd($pdo);
    $names = mcp_names($pdo, array_keys($bd));
    foreach ($bd as $pid => $x) {
        if (!isset($x['b'], $x['d'])) { continue; }
        [$la, $loa, $ya, $na] = $x['b']; [$lb, $lob, $yb, $nb] = $x['d'];
        if (abs($la - $lb) < 1e-4 && abs($loa - $lob) < 1e-4) { continue; }
        if (!mcp_people_ok($c, [$pid]) || !mcp_year_ok($c, $ya, $yb)) { continue; }
        if (!mcp_where_ok($c, $loa, $la) && !mcp_where_ok($c, $lob, $lb)) { continue; }
        $o[] = ['g' => 'l', 'c' => [mcp_pt($la, $loa), mcp_pt($lb, $lob)], 'ys' => [$ya, $yb], 'y' => $ya, 'y1' => $yb, 't' => $names[$pid] ?? 'Sans nom',
            's' => "$na → $nb", 'p' => $pid, 'arrow' => true, 'cat' => 'Naissance → décès'];
    }
    if ($c['f']['voyages'] && mcp_has_table($pdo, 'person_voyages')) {
        foreach ($pdo->query('SELECT * FROM person_voyages WHERE dep_lat IS NOT NULL AND dest_lat IS NOT NULL') as $v) {
            if (!mcp_ok_coord($v['dep_lat'], $v['dep_lon']) || !mcp_ok_coord($v['dest_lat'], $v['dest_lon'])) { continue; }
            $pid = (int) $v['person_id']; $y = $v['departure_year'] !== null && $v['departure_year'] !== '' ? (int) $v['departure_year'] : null;
            if (!mcp_people_ok($c, [$pid]) || !mcp_year_ok($c, $y)) { continue; }
            if (!mcp_where_ok($c, (float) $v['dep_lon'], (float) $v['dep_lat']) && !mcp_where_ok($c, (float) $v['dest_lon'], (float) $v['dest_lat'])) { continue; }
            $pts = [mcp_pt($v['dep_lat'], $v['dep_lon'])];
            $route = json_decode((string) ($v['route_json'] ?? ''), true);
            if (is_array($route)) { foreach (array_slice($route, 0, 200) as $p) { $la = $p['lat'] ?? ($p[1] ?? null); $lo = $p['lon'] ?? ($p[0] ?? null); if (mcp_ok_coord($la, $lo)) { $pts[] = mcp_pt($la, $lo); } } }
            $pts[] = mcp_pt($v['dest_lat'], $v['dest_lon']);
            $n = mcp_names($pdo, [$pid]);
            $o[] = ['g' => 'l', 'c' => $pts, 'y' => $y, 't' => $n[$pid] ?? 'Voyage', 's' => trim(($v['departure_port'] ?: '') . ' → ' . ($v['destination'] ?: $v['arrival_port'] ?: '') . ($v['ship_name'] ? ' · ' . $v['ship_name'] : '')),
                'p' => $pid, 'arrow' => true, 'cat' => 'Voyage'];
        }
    }
    return $o;
}

/** les lieux de vie : chaque personne choisie (et ses ascendants / descendants si demandé), dans l'ordre des années */
function mcp_life(PDO $pdo, array $c): array
{
    if (!$c['f']['persons'] || $c['scope'] === null) { return []; }
    $ids = array_slice(array_keys($c['scope']), 0, 60);
    $names = mcp_names($pdo, $ids);
    $st = $pdo->prepare("SELECT e.id, e.year, e.date_text, t.label AS tl, e.fact_confidence AS fc, COALESCE(e.precise_lat, pl.latitude) AS lat, COALESCE(e.precise_lon, pl.longitude) AS lon, pl.id AS place_id, pl.name
        FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        WHERE e.person_id=:p OR f.partner1_id=:p OR f.partner2_id=:p");
    $sc = mcp_has_table($pdo, 'census_members') ? $pdo->prepare('SELECT cr.year, pl.latitude AS lat, pl.longitude AS lon, pl.id AS place_id, pl.name FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id JOIN places pl ON pl.id=cr.place_id WHERE cm.person_id=?') : null;
    $o = [];
    foreach ($ids as $pid) {
        if ($c['hidden'] !== null && isset($c['hidden'][$pid])) { continue; }
        $st->execute([':p' => $pid]);
        $steps = [];
        foreach ($st->fetchAll() as $r) {
            if (!mcp_ok_coord($r['lat'], $r['lon'])) { continue; }
            $y = $r['year'] !== null ? (int) $r['year'] : null;
            if (!mcp_year_ok($c, $y) || !mcp_where_ok($c, (float) $r['lon'], (float) $r['lat'])) { continue; }
            $steps[] = ['y' => $y, 'c' => mcp_pt($r['lat'], $r['lon']), 's' => trim($r['tl'] . ($r['date_text'] ? ' · ' . $r['date_text'] : '')), 'lab' => (string) $r['name'], 'pl' => (int) $r['place_id'], 'k' => MCP_CERT[(string) ($r['fc'] ?: 'unknown')] ?? null];
        }
        if ($sc) {
            $sc->execute([$pid]);
            foreach ($sc->fetchAll() as $r) {
                if (!mcp_ok_coord($r['lat'], $r['lon'])) { continue; }
                $y = $r['year'] !== null ? (int) $r['year'] : null;
                if (!mcp_year_ok($c, $y) || !mcp_where_ok($c, (float) $r['lon'], (float) $r['lat'])) { continue; }
                $steps[] = ['y' => $y, 'c' => mcp_pt($r['lat'], $r['lon']), 's' => 'Recensement ' . ($y ?? ''), 'lab' => (string) $r['name'], 'pl' => (int) $r['place_id'], 'k' => null];
            }
        }
        usort($steps, static fn($a, $b) => ($a['y'] ?? 99999) <=> ($b['y'] ?? 99999));
        if (!$steps) { continue; }
        $who = $names[$pid] ?? 'Sans nom';
        if (count($steps) > 1) { $o[] = ['g' => 'l', 'c' => array_column($steps, 'c'), 'ys' => array_column($steps, 'y'), 'y' => $steps[0]['y'], 'y1' => end($steps)['y'], 't' => $who, 's' => 'Lieux de vie', 'p' => $pid, 'arrow' => true, 'cat' => $who]; }
        foreach ($steps as $i => $s) { $o[] = ['g' => 'p', 'c' => $s['c'], 'y' => $s['y'], 't' => $who, 's' => $s['s'], 'p' => $pid, 'pl' => $s['pl'], 'lab' => $s['lab'], 'k' => $s['k'], 'n' => $i + 1, 'cat' => $who]; }
    }
    return $o;
}

function mcp_surnames(PDO $pdo, array $c): array
{
    $words = array_values(array_filter(array_map('trim', preg_split('/[,;]+/', $c['f']['text']) ?: [])));
    if (!$words) {
        $start = (string) $pdo->query('SELECT last_name FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn();
        if ($start !== '') { $words = [$start]; }
    }
    if (!$words) { return []; }
    $conds = []; $args = [];
    foreach (array_slice($words, 0, 12) as $w) { $conds[] = 'p.last_name LIKE ? COLLATE NOCASE'; $args[] = $w; if (mcp_has_table($pdo, 'surname_groups')) { $conds[] = 'g.name LIKE ? COLLATE NOCASE'; $args[] = $w; } }
    $join = mcp_has_table($pdo, 'surname_groups') ? 'LEFT JOIN surname_groups g ON g.id=p.surname_group_id' : '';
    $s = $pdo->prepare("SELECT p.id, p.last_name FROM persons p $join WHERE " . implode(' OR ', $conds)); $s->execute($args);
    $people = [];
    foreach ($s->fetchAll() as $r) { $people[(int) $r['id']] = (string) $r['last_name']; }
    if (!$people) { return []; }
    $bd = mcp_bd($pdo);
    $names = mcp_names($pdo, array_keys($people));
    $o = [];
    foreach ($people as $pid => $ln) {
        $at = $bd[$pid]['b'] ?? $bd[$pid]['d'] ?? null;
        if (!$at || !mcp_people_ok($c, [$pid])) { continue; }
        [$lat, $lon, $y, $pn] = $at;
        if (!mcp_year_ok($c, $y) || !mcp_where_ok($c, $lon, $lat)) { continue; }
        $o[] = ['g' => 'p', 'c' => mcp_pt($lat, $lon), 'y' => $y, 't' => $names[$pid] ?? $ln, 's' => isset($bd[$pid]['b']) ? 'Naissance' . ($y ? " · $y" : '') : 'Décès' . ($y ? " · $y" : ''), 'p' => $pid, 'lab' => $pn, 'cat' => mb_strtoupper($ln)];
    }
    return $o;
}

function mcp_trades(PDO $pdo, array $c): array
{
    $mc = __DIR__ . '/metiers_carte.php';
    if (!function_exists('metiers_classify') && is_file($mc)) { require_once $mc; }
    $sectors = function_exists('metiers_sector_info') ? metiers_sector_info() : [];
    $want = mb_strtolower($c['f']['text']);
    $rows = $pdo->query("SELECT e.person_id AS pid, COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')) AS job, e.year, COALESCE(e.precise_lat, pl.latitude) AS lat, COALESCE(e.precise_lon, pl.longitude) AS lon, pl.id AS place_id, pl.name
        FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE t.gedcom_tag='OCCU' AND e.person_id IS NOT NULL")->fetchAll();
    if (mcp_has_col($pdo, 'census_members', 'occupation')) {
        $rows = array_merge($rows, $pdo->query("SELECT cm.person_id AS pid, cm.occupation AS job, cr.year, pl.latitude AS lat, pl.longitude AS lon, pl.id AS place_id, pl.name
            FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id JOIN places pl ON pl.id=cr.place_id WHERE cm.person_id IS NOT NULL AND TRIM(COALESCE(cm.occupation,''))<>''")->fetchAll());
    }
    $names = mcp_names($pdo, array_column($rows, 'pid'));
    $o = [];
    foreach ($rows as $r) {
        $job = trim((string) $r['job']);
        if ($job === '' || !mcp_ok_coord($r['lat'], $r['lon'])) { continue; }
        if ($want !== '' && !str_contains(mb_strtolower($job), $want)) {
            $sec = function_exists('metiers_classify') ? metiers_classify($job)[3] : '';
            if (!isset($sectors[$want]) || $sec !== $want) { continue; }
        }
        $y = $r['year'] !== null ? (int) $r['year'] : null;
        $pid = (int) $r['pid'];
        if (!mcp_people_ok($c, [$pid]) || !mcp_year_ok($c, $y) || !mcp_where_ok($c, (float) $r['lon'], (float) $r['lat'])) { continue; }
        $cat = $job;
        if (function_exists('metiers_classify')) { $sec = metiers_classify($job)[3]; $cat = isset($sectors[$sec]) ? $sectors[$sec][1] . ' ' . $sectors[$sec][2] : $job; }
        $o[] = ['g' => 'p', 'c' => mcp_pt($r['lat'], $r['lon']), 'y' => $y, 't' => $names[$pid] ?? 'Sans nom', 's' => $job . ($y ? " · $y" : ''), 'p' => $pid, 'pl' => (int) $r['place_id'], 'lab' => (string) $r['name'], 'cat' => $cat];
    }
    return $o;
}

function mcp_houses(PDO $pdo, array $c): array
{
    if (!mcp_has_table($pdo, 'houses')) { return []; }
    $o = [];
    foreach ($pdo->query('SELECT h.id, h.name, h.period, h.place_text, pl.id AS place_id, pl.name AS pname, pl.latitude, pl.longitude FROM houses h JOIN places pl ON pl.id=h.place_id') as $r) {
        if (!mcp_ok_coord($r['latitude'], $r['longitude'])) { continue; }
        [$y, $y1] = mcp_years((string) $r['period']);
        if (!mcp_year_ok($c, $y, $y1) || !mcp_where_ok($c, (float) $r['longitude'], (float) $r['latitude'])) { continue; }
        $o[] = ['g' => 'p', 'c' => mcp_pt($r['latitude'], $r['longitude']), 'y' => $y, 'y1' => $y1, 't' => (string) ($r['name'] ?: 'Maison'), 's' => trim((string) $r['period'] . ' ' . ($r['place_text'] ?: '')), 'pl' => (int) $r['place_id'], 'lab' => (string) $r['pname'], 'house' => (int) $r['id'], 'cat' => 'Maison'];
    }
    return $o;
}

/** une miniature servie par l'app (jamais un chemin hors des médias) */
function mcp_thumb(string $file): string
{
    if ($file === '' || str_contains($file, '..') || !preg_match('/\.(jpe?g|png|webp|gif)$/i', $file)) { return ''; }
    return 'media/' . implode('/', array_map('rawurlencode', explode('/', $file)));
}

/** les médias reliés à des gens cachés (partage) */
function mcp_media_hidden(PDO $pdo, ?array $hidden): array
{
    if ($hidden === null || !$hidden || !mcp_has_table($pdo, 'media_links')) { return []; }
    $o = [];
    foreach ($pdo->query("SELECT media_id, entity_id FROM media_links WHERE entity_type='person'") as $r) { if (isset($hidden[(int) $r['entity_id']])) { $o[(int) $r['media_id']] = true; } }
    return $o;
}

/** 🖼 Images de lieux : les hypothèses de lieu de l'outil « 📍 Images de lieux » (lib/place_photos.php : pp_list) — un point, une
 *  ZONE (cercle ou polygone), plusieurs hypothèses par image avec leur certitude (en transparence) et le cône de prise de vue ;
 *  sans cet outil : les cartes postales placées (avec leur angle) et les images rangées sur un lieu. */
const MCP_PP_CERT = ['certain' => 1.0, 'probable' => 0.75, 'possible' => 0.5, 'verify' => 0.3];
function mcp_place_images(PDO $pdo, array $c): array
{
    $o = [];
    $hideM = mcp_media_hidden($pdo, $c['hidden']);
    $lib = __DIR__ . '/place_photos.php';
    if (!function_exists('pp_list') && is_file($lib)) { require_once $lib; }
    if (function_exists('pp_list')) {
        $certOk = array_values(array_intersect($c['f']['cert'], array_keys(MCP_PP_CERT)));
        foreach (pp_list($pdo, ['all' => 1])['items'] ?? [] as $it) {
            $mid = (int) $it['media_id'];
            if (isset($hideM[$mid])) { continue; }
            $y = isset($it['year']) && $it['year'] !== null ? (int) $it['year'] : null;
            if (!mcp_year_ok($c, $y)) { continue; }
            $gs = $it['guesses'] ?: ($it['retained'] ? [$it['retained']] : []);
            if ($c['f']['retained']) { $gs = array_values(array_filter($gs, static fn($g) => !empty($g['retained']))); }
            foreach ($gs as $g) {
                $cert = (string) ($g['certainty'] ?? 'probable');
                if ($certOk && !in_array($cert, $certOk, true)) { continue; }
                $k = MCP_PP_CERT[$cert] ?? 0.5;
                $base = ['y' => $y, 't' => (string) $it['title'], 's' => trim(($it['kind_label'] ?? '') . ($it['date_text'] ? ' · ' . $it['date_text'] : '') . ' · ' . ($g['certainty_label'] ?? '') . (!empty($g['retained']) ? ' (retenue)' : ' (hypothèse)')),
                    'lab' => (string) ($g['place']['name'] ?? $g['street'] ?? ''), 'm' => $mid, 'img' => mcp_img_ok((string) ($it['thumb'] ?? '')), 'k' => $k, 'grp' => $mid,
                    'h' => !empty($g['retained']) ? 'retenue' : 'hypothèse', 'cat' => (string) ($it['kind_label'] ?? 'Image')];
                $z = is_array($g['zone'] ?? null) ? $g['zone'] : null;
                if ($z && ($z['type'] ?? '') === 'circle' && mcp_ok_coord($z['lat'] ?? null, $z['lon'] ?? null)) {
                    if (!mcp_where_ok($c, (float) $z['lon'], (float) $z['lat'])) { continue; }
                    $o[] = ['g' => 'z', 'c' => [mcp_circle((float) $z['lat'], (float) $z['lon'], max(5.0, (float) ($z['r'] ?? 100)) / 1000)]] + $base;
                    continue;
                }
                if ($z && ($z['type'] ?? '') === 'polygon' && is_array($z['pts'] ?? null)) {
                    $ring = [];
                    foreach ($z['pts'] as $pt) { if (is_array($pt) && mcp_ok_coord($pt[0] ?? null, $pt[1] ?? null)) { $ring[] = mcp_pt($pt[0], $pt[1]); } }
                    if (count($ring) < 3) { continue; }
                    $cl = array_sum(array_column($ring, 1)) / count($ring); $co = array_sum(array_column($ring, 0)) / count($ring);
                    if (!mcp_where_ok($c, $co, $cl)) { continue; }
                    $ring[] = $ring[0];
                    $o[] = ['g' => 'z', 'c' => [$ring]] + $base;
                    continue;
                }
                $at = $g['at'] ?? null;
                if (!is_array($at) || !mcp_ok_coord($at['lat'] ?? null, $at['lon'] ?? null) || !mcp_where_ok($c, (float) $at['lon'], (float) $at['lat'])) { continue; }
                $ft = ['g' => 'p', 'c' => mcp_pt($at['lat'], $at['lon'])] + $base;
                if (is_numeric($g['bearing'] ?? null)) { $ft['cone'] = [round(fmod((float) $g['bearing'] + 360, 360), 1), is_numeric($g['fov'] ?? null) ? (float) $g['fov'] : 50.0, 0.35]; }
                $o[] = $ft;
            }
        }
        return $o;
    }
    if (mcp_has_table($pdo, 'postcards')) {
        foreach ($pdo->query('SELECT pc.*, m.filename, m.thumbnail, pl.name AS pname, pl.latitude, pl.longitude FROM postcards pc LEFT JOIN media m ON m.id=pc.media_id LEFT JOIN places pl ON pl.id=pc.place_id') as $r) {
            $lat = $r['view_lat'] ?? null; $lon = $r['view_lon'] ?? null; $exact = mcp_ok_coord($lat, $lon);
            if (!$exact) { $lat = $r['latitude']; $lon = $r['longitude']; }
            if (!mcp_ok_coord($lat, $lon) || isset($hideM[(int) $r['media_id']])) { continue; }
            [$y] = mcp_years((string) ($r['sent_date'] ?: $r['postmark'] ?: ''));
            if (!mcp_year_ok($c, $y) || !mcp_where_ok($c, (float) $lon, (float) $lat)) { continue; }
            $ft = ['g' => 'p', 'c' => mcp_pt($lat, $lon), 'y' => $y, 't' => (string) ($r['title'] ?: 'Carte postale'), 's' => trim(($r['publisher'] ?: '') . ($r['card_number'] ? ' n° ' . $r['card_number'] : '')),
                'lab' => (string) $r['pname'], 'm' => (int) $r['media_id'], 'img' => mcp_thumb((string) ($r['thumbnail'] ?: $r['filename'] ?: '')), 'k' => $exact ? 1.0 : 0.5, 'cat' => 'Carte postale'];
            if ($exact && is_numeric($r['view_bearing'] ?? null)) { $ft['cone'] = [round((float) $r['view_bearing'], 1), 50, 0.35]; }
            $o[] = $ft;
        }
    }
    if (mcp_has_col($pdo, 'media', 'place_id')) {
        foreach ($pdo->query("SELECT m.id, m.title, m.filename, m.thumbnail, m.date_text, pl.name AS pname, pl.latitude, pl.longitude FROM media m JOIN places pl ON pl.id=m.place_id
            WHERE m.media_type='image' AND COALESCE(m.is_person_photo,0)=0") as $r) {
            if (!mcp_ok_coord($r['latitude'], $r['longitude']) || isset($hideM[(int) $r['id']])) { continue; }
            [$y] = mcp_years((string) $r['date_text']);
            if (!mcp_year_ok($c, $y) || !mcp_where_ok($c, (float) $r['longitude'], (float) $r['latitude'])) { continue; }
            $o[] = ['g' => 'p', 'c' => mcp_pt($r['latitude'], $r['longitude']), 'y' => $y, 't' => (string) ($r['title'] ?: 'Image'), 's' => (string) $r['date_text'], 'lab' => (string) $r['pname'],
                'm' => (int) $r['id'], 'img' => mcp_thumb((string) ($r['thumbnail'] ?: $r['filename'])), 'k' => 0.6, 'cat' => 'Image du lieu'];
        }
    }
    return $o;
}
/** un cercle (centre, rayon en km) en anneau de 36 sommets [lon, lat] */
function mcp_circle(float $lat, float $lon, float $km): array
{
    $r = []; $dLat = $km / 111.32; $dLon = $km / (111.32 * max(0.01, cos(deg2rad($lat))));
    for ($i = 0; $i <= 36; $i++) { $a = 2 * M_PI * ($i % 36) / 36; $r[] = [round($lon + $dLon * cos($a), 6), round($lat + $dLat * sin($a), 6)]; }
    return $r;
}
function mcp_img_ok(string $u): string
{
    return preg_match('#^(media/|api\.php\?action=)[^"\'<>\s]{1,400}$#', $u) ? $u : '';
}

/** une forme venue d'un autre outil, remise au format des couches (point, ligne, zone ; certitude 0–1 ; cône) */
function mcp_clean_feature(mixed $f): ?array
{
    if (!is_array($f)) { return null; }
    $g = in_array($f['g'] ?? '', ['p', 'l', 'z'], true) ? $f['g'] : '';
    $pt = static fn($c) => is_array($c) && mcp_ok_coord($c[1] ?? null, $c[0] ?? null) ? [round((float) $c[0], 6), round((float) $c[1], 6)] : null;
    if ($g === 'p') { $c = $pt($f['c'] ?? null); if (!$c) { return null; } }
    elseif ($g === 'l') { $c = array_values(array_filter(array_map($pt, array_slice(is_array($f['c'] ?? null) ? $f['c'] : [], 0, 5000)))); if (count($c) < 2) { return null; } }
    elseif ($g === 'z') { $r = array_values(array_filter(array_map($pt, array_slice(is_array($f['c'][0] ?? null) ? $f['c'][0] : [], 0, 5000)))); if (count($r) < 3) { return null; } $c = [$r]; }
    else { return null; }
    $o = ['g' => $g, 'c' => $c, 't' => mcp_text($f['t'] ?? '', 200), 's' => mcp_text($f['s'] ?? '', 300), 'lab' => mcp_text($f['lab'] ?? '', 120), 'cat' => mcp_text($f['cat'] ?? '', 80)];
    foreach (['y', 'y1'] as $k) { if (is_numeric($f[$k] ?? null)) { $o[$k] = (int) $f[$k]; } }
    if (is_numeric($f['k'] ?? null)) { $o['k'] = round(max(0.05, min(1.0, (float) $f['k'])), 2); }
    if (is_numeric($f['m'] ?? null)) { $o['m'] = (int) $f['m']; }
    if (is_string($f['img'] ?? null) && preg_match('#^(media/|api\.php\?action=)[^"\'<>\s]{1,400}$#', $f['img'])) { $o['img'] = $f['img']; }
    if (is_array($f['cone'] ?? null) && is_numeric($f['cone'][0] ?? null)) { $o['cone'] = [round(fmod((float) $f['cone'][0] + 360, 360), 1), (float) mcp_num($f['cone'][1] ?? 50, 5, 180, 50), (float) mcp_num($f['cone'][2] ?? 0.5, 0.02, 50, 0.5)]; }
    if (isset($f['h']) && is_scalar($f['h'])) { $o['h'] = mcp_text($f['h'], 40); }
    return $o;
}

function mcp_monuments(PDO $pdo, array $c): array
{
    $o = [];
    if (mcp_has_col($pdo, 'persons', 'mort_pour_la_france')) {
        $ids = array_map('intval', $pdo->query('SELECT id FROM persons WHERE COALESCE(mort_pour_la_france,0)=1')->fetchAll(PDO::FETCH_COLUMN));
        $bd = mcp_bd($pdo); $names = mcp_names($pdo, $ids); $by = [];
        foreach ($ids as $pid) {
            $at = $bd[$pid]['b'] ?? null; if (!$at || !mcp_people_ok($c, [$pid])) { continue; }
            [$lat, $lon, , $pn] = $at;
            $y = $bd[$pid]['d'][2] ?? null;
            if (!mcp_year_ok($c, $y) || !mcp_where_ok($c, $lon, $lat)) { continue; }
            $k = "$lat,$lon";
            $by[$k] ??= ['g' => 'p', 'c' => mcp_pt($lat, $lon), 'y' => $y, 't' => 'Monument aux morts de ' . $pn, 's' => '', 'lab' => $pn, 'p' => $pid, 'cat' => 'Monument aux morts', 'who' => []];
            $by[$k]['who'][] = $names[$pid] ?? '';
        }
        foreach ($by as $m) { $m['s'] = implode(', ', array_slice(array_filter($m['who']), 0, 8)) . (count($m['who']) > 8 ? '…' : ''); unset($m['who']); $o[] = $m; }
    }
    if (mcp_has_table($pdo, 'field_trip_stops')) {
        foreach ($pdo->query("SELECT title, place_text, lat, lon, people_text FROM field_trip_stops WHERE kind='monument' AND lat IS NOT NULL AND lon IS NOT NULL") as $r) {
            if (!mcp_ok_coord($r['lat'], $r['lon']) || !mcp_year_ok($c, null) || !mcp_where_ok($c, (float) $r['lon'], (float) $r['lat'])) { continue; }
            if ($c['scope'] !== null) { continue; }
            $o[] = ['g' => 'p', 'c' => mcp_pt($r['lat'], $r['lon']), 'y' => null, 't' => (string) ($r['title'] ?: 'Monument aux morts'), 's' => (string) ($r['people_text'] ?? ''), 'lab' => (string) $r['place_text'], 'cat' => 'Sortie sur le terrain'];
        }
    }
    return $o;
}

function mcp_sources(PDO $pdo, array $c): array
{
    if (!mcp_has_table($pdo, 'source_links')) { return []; }
    $rows = $pdo->query("SELECT s.id AS sid, s.title, e.year, e.person_id, f.partner1_id, f.partner2_id, COALESCE(e.precise_lat, pl.latitude) AS lat, COALESCE(e.precise_lon, pl.longitude) AS lon, pl.id AS place_id, pl.name
        FROM source_links sl JOIN sources s ON s.id=sl.source_record_id JOIN events e ON sl.entity_type='event' AND e.id=sl.entity_id JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id")->fetchAll();
    $by = [];
    foreach ($rows as $r) {
        if (!mcp_ok_coord($r['lat'], $r['lon'])) { continue; }
        $y = $r['year'] !== null ? (int) $r['year'] : null;
        if (!mcp_people_ok($c, [(int) $r['person_id'], (int) $r['partner1_id'], (int) $r['partner2_id']]) || !mcp_year_ok($c, $y) || !mcp_where_ok($c, (float) $r['lon'], (float) $r['lat'])) { continue; }
        $k = $r['sid'] . '@' . $r['place_id'];
        $by[$k] ??= ['g' => 'p', 'c' => mcp_pt($r['lat'], $r['lon']), 'y' => $y, 't' => (string) ($r['title'] ?: 'Source'), 's' => '', 'pl' => (int) $r['place_id'], 'lab' => (string) $r['name'], 'src' => (int) $r['sid'], 'cat' => 'Source', 'n_' => 0];
        $by[$k]['n_']++;
        if ($y !== null && ($by[$k]['y'] === null || $y < $by[$k]['y'])) { $by[$k]['y'] = $y; }
    }
    return array_values(array_map(static function ($x) { $x['s'] = $x['n_'] . ' événement' . ($x['n_'] > 1 ? 's' : '') . ' cité' . ($x['n_'] > 1 ? 's' : ''); unset($x['n_']); return $x; }, $by));
}

function mcp_media(PDO $pdo, array $c): array
{
    $o = [];
    $hideM = mcp_media_hidden($pdo, $c['hidden']);
    $scopeM = null;
    if ($c['scope'] !== null && mcp_has_table($pdo, 'media_links')) {
        $scopeM = [];
        foreach ($pdo->query("SELECT media_id, entity_id FROM media_links WHERE entity_type='person'") as $r) { if (isset($c['scope'][(int) $r['entity_id']])) { $scopeM[(int) $r['media_id']] = true; } }
    }
    $add = static function (array $r, $lat, $lon, string $lab, string $cat) use (&$o, $c, $hideM, $scopeM) {
        $id = (int) $r['id'];
        if (!mcp_ok_coord($lat, $lon) || isset($hideM[$id]) || ($scopeM !== null && !isset($scopeM[$id]))) { return; }
        [$y] = mcp_years((string) ($r['date_text'] ?? ''));
        if (!$y && !empty($r['taken_at'])) { $y = (int) substr((string) $r['taken_at'], 0, 4) ?: null; }
        if (!mcp_year_ok($c, $y) || !mcp_where_ok($c, (float) $lon, (float) $lat)) { return; }
        $o[] = ['g' => 'p', 'c' => mcp_pt($lat, $lon), 'y' => $y, 't' => (string) ($r['title'] ?: 'Média'), 's' => (string) ($r['date_text'] ?? ''), 'lab' => $lab, 'm' => $id, 'img' => mcp_thumb((string) (($r['thumbnail'] ?? '') ?: ($r['filename'] ?? ''))), 'cat' => $cat];
    };
    $seen = [];
    if (mcp_has_table($pdo, 'photo_media_geo')) {
        foreach ($pdo->query('SELECT m.id, m.title, m.filename, m.thumbnail, m.date_text, g.lat, g.lon, g.taken_at FROM photo_media_geo g JOIN media m ON m.id=g.media_id') as $r) { $seen[(int) $r['id']] = true; $add($r, $r['lat'], $r['lon'], '', 'Position GPS de la photo'); }
    }
    if (mcp_has_col($pdo, 'media', 'place_id')) {
        foreach ($pdo->query('SELECT m.id, m.title, m.filename, m.thumbnail, m.date_text, pl.name AS pname, pl.latitude, pl.longitude FROM media m JOIN places pl ON pl.id=m.place_id') as $r) { if (!isset($seen[(int) $r['id']])) { $add($r, $r['latitude'], $r['longitude'], (string) $r['pname'], 'Rangé sur un lieu'); } }
    }
    return $o;
}

function mcp_animals(PDO $pdo, array $c): array
{
    if (!mcp_has_table($pdo, 'animal_observations') || !mcp_has_table($pdo, 'pets')) { return []; }
    $want = $c['f']['pets'] ? array_fill_keys($c['f']['pets'], true) : null;
    $names = [];
    foreach ($pdo->query('SELECT id, data_json FROM pets') as $r) { $d = json_decode((string) $r['data_json'], true) ?: []; $names[(int) $r['id']] = (string) ($d['name'] ?? $d['nom'] ?? ('Animal ' . $r['id'])); }
    $o = [];
    foreach ($pdo->query('SELECT o.id, o.pet_id, o.obs_iso, o.obs_date, o.lat, o.lon, o.place_text, o.note, pl.latitude AS plat, pl.longitude AS plon, pl.name AS pname FROM animal_observations o LEFT JOIN places pl ON pl.id=o.place_id ORDER BY o.obs_iso, o.id') as $r) {
        $pid = (int) $r['pet_id'];
        if ($want !== null && !isset($want[$pid])) { continue; }
        $lat = $r['lat']; $lon = $r['lon']; if (!mcp_ok_coord($lat, $lon)) { $lat = $r['plat']; $lon = $r['plon']; }
        if (!mcp_ok_coord($lat, $lon)) { continue; }
        $y = preg_match('/^(\d{4})/', (string) ($r['obs_iso'] ?? ''), $m) ? (int) $m[1] : (mcp_years((string) $r['obs_date'])[0]);
        if (!mcp_year_ok($c, $y) || !mcp_where_ok($c, (float) $lon, (float) $lat)) { continue; }
        $o[] = ['g' => 'p', 'c' => mcp_pt($lat, $lon), 'y' => $y, 't' => $pid ? ($names[$pid] ?? 'Animal') : 'Animal sans fiche', 's' => trim(($r['obs_date'] ?: $r['obs_iso'] ?: '') . ' ' . ($r['note'] ? '· ' . mb_substr((string) $r['note'], 0, 80) : '')), 'lab' => (string) ($r['place_text'] ?: $r['pname'] ?: ''), 'pet' => $pid, 'cat' => $pid ? ($names[$pid] ?? 'Animal') : 'Sans fiche'];
    }
    if (mcp_has_table($pdo, 'animal_gps')) {
        foreach ($pdo->query('SELECT DISTINCT pet_id FROM animal_gps')->fetchAll(PDO::FETCH_COLUMN) as $pid) {
            $pid = (int) $pid; if ($want !== null && !isset($want[$pid])) { continue; }
            $n = (int) $pdo->query("SELECT COUNT(*) FROM animal_gps WHERE pet_id=$pid")->fetchColumn();
            $step = max(1, (int) ceil($n / 1500));
            $pts = []; $y0 = null; $y1 = null;
            foreach ($pdo->query("SELECT t, lat, lon FROM (SELECT t, lat, lon, ROW_NUMBER() OVER (ORDER BY t) AS rn FROM animal_gps WHERE pet_id=$pid) WHERE (rn - 1) % $step = 0") as $g) {
                if (!mcp_ok_coord($g['lat'], $g['lon'])) { continue; }
                $y = (int) gmdate('Y', (int) $g['t']);
                if (!mcp_year_ok($c, $y)) { continue; }
                $pts[] = mcp_pt($g['lat'], $g['lon']); $y0 ??= $y; $y1 = $y;
            }
            if (count($pts) > 1) { $o[] = ['g' => 'l', 'c' => $pts, 'y' => $y0, 'y1' => $y1, 't' => $names[$pid] ?? 'Animal', 's' => 'Trajet GPS', 'pet' => $pid, 'cat' => $names[$pid] ?? 'Animal']; }
        }
    }
    return $o;
}

function mcp_history(PDO $pdo, array $c): array
{
    if (!mcp_has_table($pdo, 'history_events')) { return []; }
    $o = [];
    foreach ($pdo->query('SELECT h.id, h.from_year, h.to_year, h.date_text, h.title, h.category, pl.name, pl.latitude, pl.longitude FROM history_events h JOIN places pl ON pl.id=h.place_id') as $r) {
        if (!mcp_ok_coord($r['latitude'], $r['longitude'])) { continue; }
        $y = $r['from_year'] !== null ? (int) $r['from_year'] : null; $y1 = $r['to_year'] !== null ? (int) $r['to_year'] : null;
        if (!mcp_year_ok($c, $y, $y1) || !mcp_where_ok($c, (float) $r['longitude'], (float) $r['latitude'])) { continue; }
        $o[] = ['g' => 'p', 'c' => mcp_pt($r['latitude'], $r['longitude']), 'y' => $y, 'y1' => $y1, 't' => (string) $r['title'], 's' => (string) ($r['date_text'] ?: ''), 'lab' => (string) $r['name'], 'cat' => (string) ($r['category'] ?: 'Histoire')];
    }
    return $o;
}

function mcp_drawn(PDO $pdo, array $c): array
{
    if (!mcp_has_table($pdo, 'map_layers')) { return []; }
    $ids = $c['f']['layers'];
    $o = [];
    foreach ($pdo->query('SELECT * FROM map_layers WHERE deleted_at IS NULL ORDER BY sort_order, id') as $l) {
        if ($ids && !in_array((int) $l['id'], $ids, true)) { continue; }
        foreach (json_decode((string) $l['features'], true) ?: [] as $f) {
            $g = $f['geometry'] ?? []; $p = $f['properties'] ?? [];
            $col = is_string($p['color'] ?? null) && preg_match('/^#[0-9a-f]{6}$/i', $p['color']) ? $p['color'] : (string) $l['color'];
            $base = ['t' => (string) ($p['name'] ?? '') ?: (string) $l['name'], 's' => (string) ($p['note'] ?? ''), 'cat' => (string) $l['name'], 'col' => $col, 'y' => null];
            $type = $g['type'] ?? ''; $cs = $g['coordinates'] ?? null;
            if ($type === 'Point' && is_array($cs) && mcp_ok_coord($cs[1] ?? null, $cs[0] ?? null)) { if (mcp_where_ok($c, (float) $cs[0], (float) $cs[1])) { $o[] = ['g' => 'p', 'c' => [(float) $cs[0], (float) $cs[1]]] + $base; } }
            elseif ($type === 'LineString' && is_array($cs) && count($cs) > 1) { $o[] = ['g' => 'l', 'c' => $cs] + $base; }
            elseif ($type === 'Polygon' && is_array($cs[0] ?? null)) { $o[] = ['g' => 'z', 'c' => [$cs[0]]] + $base; }
        }
    }
    return $o;
}

/* ═════════ 🗺 Mes cartes dans le menu de choix (widget, site web) ═════════ */

function picker_custom_maps(PDO $pdo, string $q, int $offset, int $limit): array
{
    $all = array_merge(array_map(static fn($m) => $m + ['ready' => false], mcp_list($pdo)), mcp_ready());
    $ids = function_exists('picker_ids') ? picker_ids() : [];
    $fq = function_exists('picker_fold') ? picker_fold($q) : mb_strtolower($q);
    $rows = array_values(array_filter($all, static function ($m) use ($ids, $fq) {
        if ($ids) { return in_array($m['id'], $ids, true); }
        if ($fq === '') { return true; }
        return str_contains(function_exists('picker_fold') ? picker_fold($m['name'] . ' ' . $m['description']) : mb_strtolower($m['name'] . ' ' . $m['description']), $fq);
    }));
    return ['total' => count($rows), 'items' => array_map(static function ($m) {
        $kinds = array_map(static fn($l) => MCP_KINDS[$l['kind']][0] ?? '', $m['def']['layers']);
        $n = count($m['def']['layers']);
        return ['kind' => 'custommap', 'id' => $m['id'], 'title' => $m['name'] ?: 'Carte sans nom', 'meta' => trim($n . ' couche' . ($n > 1 ? 's' : '') . ' ' . implode('', array_unique($kinds)) . ($m['description'] ? ' · ' . mb_substr($m['description'], 0, 80) : '')),
            'badge' => !empty($m['ready']) ? 'prête' : '', 'badge_style' => '', 'group' => 'custommap', 'icon' => '🗺', 'short' => ''];
    }, array_slice($rows, $offset, $limit))];
}

function picker_branches(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!mcp_has_table($pdo, 'branches')) { return ['total' => 0, 'items' => []]; }
    $ids = function_exists('picker_ids') ? picker_ids() : [];
    $fq = function_exists('picker_fold') ? picker_fold($q) : mb_strtolower($q);
    $rows = [];
    foreach ($pdo->query('SELECT b.id, b.name, b.color, b.description, (SELECT COUNT(*) FROM branch_people bp WHERE bp.branch_id=b.id) AS n FROM branches b ORDER BY b.name') as $r) {
        if ($ids && !in_array((int) $r['id'], $ids, true)) { continue; }
        if (!$ids && $fq !== '' && !str_contains(function_exists('picker_fold') ? picker_fold($r['name'] . ' ' . $r['description']) : mb_strtolower((string) $r['name']), $fq)) { continue; }
        $rows[] = $r;
    }
    return ['total' => count($rows), 'items' => array_map(static fn($r) => ['kind' => 'branch', 'id' => (int) $r['id'], 'title' => (string) $r['name'], 'meta' => $r['n'] . ' personne' . ($r['n'] > 1 ? 's' : ''), 'color' => (string) $r['color'], 'group' => 'branch', 'icon' => '🌿'], array_slice($rows, $offset, $limit))];
}

function picker_map_layers(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!mcp_has_table($pdo, 'map_layers')) { return ['total' => 0, 'items' => []]; }
    $ids = function_exists('picker_ids') ? picker_ids() : [];
    $fq = function_exists('picker_fold') ? picker_fold($q) : mb_strtolower($q);
    $rows = [];
    foreach ($pdo->query('SELECT id, name, color, features FROM map_layers WHERE deleted_at IS NULL ORDER BY sort_order, id') as $r) {
        if ($ids && !in_array((int) $r['id'], $ids, true)) { continue; }
        if (!$ids && $fq !== '' && !str_contains(function_exists('picker_fold') ? picker_fold((string) $r['name']) : mb_strtolower((string) $r['name']), $fq)) { continue; }
        $f = json_decode((string) $r['features'], true) ?: [];
        $z = count(array_filter($f, static fn($x) => ($x['geometry']['type'] ?? '') === 'Polygon'));
        $rows[] = ['kind' => 'maplayer', 'id' => (int) $r['id'], 'title' => (string) $r['name'], 'meta' => count($f) . ' forme' . (count($f) > 1 ? 's' : '') . ($z ? " · $z zone" . ($z > 1 ? 's' : '') : ''), 'color' => (string) $r['color'], 'group' => 'maplayer', 'icon' => '✏️'];
    }
    return ['total' => count($rows), 'items' => array_slice($rows, $offset, $limit)];
}
