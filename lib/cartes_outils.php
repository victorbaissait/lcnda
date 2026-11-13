<?php
declare(strict_types=1);

/**
 * LCNDA — 🧭 Outils de la Carte (assets/js/heritage-cartes-outils.js, calculs : assets/js/app-cartes-outils-core.js) :
 * trajets d'autrefois, grande carte à imprimer, relief 3D, « ✏️ Mes couches ».
 *
 * GET  cartes_outils&op=places → les lieux de la famille (naissances, mariages, décès), les migrations (naissance → décès),
 *                                une branche (ancêtres d'une personne), des portraits pour les médaillons. Jamais un vivant
 *                                ni une fiche confidentielle (df_hidden_people, comme l'export « pour partager ») : la grande
 *                                carte est faite pour être imprimée et montrée.
 * GET  cartes_outils&op=relief → la grille des altitudes d'une zone (lib/meteo.php : meteo_altitude, grille de 30″ du socle),
 *                                null là où il n'y a pas d'altitude (mer, hors des 14 pays).
 * GET  cartes_outils&op=layers → mes couches (table map_layers, migration 74).
 * POST cartes_outils_write {op: layer_save | layer_delete | layer_restore | layer_order}
 *                              → une couche enregistrée (formes remises d'aplomb ici aussi), supprimée (gardée 30 jours pour « ↶ Annuler »).
 */

const CO_MAX_FEATURES = 5000;
const CO_MAX_COORDS = 20000;

function cartes_outils_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS map_layers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#d9480f',
        visible INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        features TEXT NOT NULL DEFAULT '[]',
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}

function cartes_outils_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'cartes_outils') {
            $op = scalar_text($_GET['op'] ?? '', 'op');
            json_response(match ($op) {
                'places' => cartes_outils_places($pdo, $_GET),
                'relief' => cartes_outils_relief($_GET),
                'layers' => ['layers' => cartes_outils_layers($pdo)],
                default => throw new RuntimeException('Demande de carte inconnue.'),
            });
        }
        if ($isWrite && $action === 'cartes_outils_write') {
            cartes_outils_schema($pdo);
            $op = scalar_text($payload['op'] ?? '', 'op');
            json_response(match ($op) {
                'layer_save' => cartes_outils_layer_save($pdo, $payload),
                'layer_delete' => cartes_outils_layer_delete($pdo, $payload, true),
                'layer_restore' => cartes_outils_layer_delete($pdo, $payload, false),
                'layer_order' => cartes_outils_layer_order($pdo, $payload),
                default => throw new RuntimeException('Opération de carte inconnue.'),
            });
        }
        json_response(['error' => 'Action de carte inconnue.'], 400);
    } catch (JsonException $e) {
        json_response(['error' => 'Couche illisible.'], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}

/* ═════════ Les lieux de la famille (grande carte, relief) ═════════ */

/** les gens qu'on ne montre pas dans ce qui s'imprime ou se partage : vivants et fiches confidentielles */
function cartes_outils_hidden(PDO $pdo): array
{
    if (!function_exists('df_hidden_people')) { require_once __DIR__ . '/dates_feter.php'; }
    try { return df_hidden_people($pdo); } catch (Throwable) {
        $h = [];
        foreach ($pdo->query("SELECT id FROM persons WHERE COALESCE(is_private,0)=1 OR living_status <> 'deceased'") as $r) { $h[(int) $r['id']] = true; }
        return $h;
    }
}

function co_has_col(PDO $pdo, string $table, string $col): bool
{
    static $memo = [];
    $k = "$table.$col";
    return $memo[$k] ??= (bool) $pdo->query("SELECT 1 FROM pragma_table_info('$table') WHERE name=" . $pdo->quote($col))->fetchColumn();
}

function cartes_outils_places(PDO $pdo, array $q): array
{
    $hidden = cartes_outils_hidden($pdo);
    $branch = null;
    $root = safe_int($q['branch'] ?? 0);
    if ($root > 0) {
        if (!function_exists('h_ancestors')) { require_once __DIR__ . '/heritage.php'; }
        $branch = function_exists('h_ancestors') ? h_ancestors($pdo, $root, 40) : [$root => 1];
    }
    $yFrom = isset($q['year_from']) && is_numeric($q['year_from']) ? (int) $q['year_from'] : null;
    $yTo = isset($q['year_to']) && is_numeric($q['year_to']) ? (int) $q['year_to'] : null;
    $kindOf = static fn(string $t): string => in_array($t, ['BIRT', 'CHR', 'BAPM'], true) ? 'b' : (in_array($t, ['MARR', 'MRCI', 'MRRE', 'ENGA'], true) ? 'm' : (in_array($t, ['DEAT', 'BURI', 'CREM'], true) ? 'd' : 'o'));
    $rows = $pdo->query("SELECT e.id, e.year, e.person_id, e.family_id, f.partner1_id, f.partner2_id, t.gedcom_tag AS tag,
            pl.id AS place_id, pl.name, pl.county, pl.country, pl.latitude AS lat, pl.longitude AS lon, " . (co_has_col($pdo, 'places', 'altitude') ? 'pl.altitude' : 'NULL') . " AS alt
        FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
        LEFT JOIN families f ON f.id=e.family_id
        WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND pl.latitude <> '' AND pl.longitude <> ''
          AND t.gedcom_tag IN ('BIRT','CHR','BAPM','MARR','MRCI','MRRE','ENGA','DEAT','BURI','CREM','RESI','OCCU','CENS','EMIG','IMMI','NATU','GRAD','EDUC')")->fetchAll();
    $places = []; $byPerson = [];
    foreach ($rows as $r) {
        $people = array_values(array_filter([(int) $r['person_id'], (int) $r['partner1_id'], (int) $r['partner2_id']]));
        if (!$people) { continue; }
        if (array_filter($people, static fn($id) => isset($hidden[$id]))) { continue; } // un couple dont l'un est vivant ou confidentiel : pas montré
        if ($branch !== null && !array_filter($people, static fn($id) => isset($branch[$id]))) { continue; }
        $y = $r['year'] !== null && $r['year'] !== '' ? (int) $r['year'] : null;
        if ($y !== null && (($yFrom !== null && $y < $yFrom) || ($yTo !== null && $y > $yTo))) { continue; }
        $lat = (float) $r['lat']; $lon = (float) $r['lon'];
        if (abs($lat) > 90 || abs($lon) > 180 || ($lat == 0.0 && $lon == 0.0)) { continue; }
        $pid = (int) $r['place_id']; $k = $kindOf((string) $r['tag']);
        if (!isset($places[$pid])) {
            $places[$pid] = ['id' => $pid, 'name' => (string) $r['name'], 'county' => (string) ($r['county'] ?? ''), 'country' => (string) ($r['country'] ?? ''),
                'lat' => round($lat, 6), 'lon' => round($lon, 6), 'alt' => $r['alt'] !== null && $r['alt'] !== '' ? (float) $r['alt'] : null, 'b' => 0, 'm' => 0, 'd' => 0, 'o' => 0, 'n' => 0, 'y0' => null, 'y1' => null];
        }
        $places[$pid][$k]++; $places[$pid]['n']++;
        if ($y !== null) { $places[$pid]['y0'] = $places[$pid]['y0'] === null ? $y : min($places[$pid]['y0'], $y); $places[$pid]['y1'] = $places[$pid]['y1'] === null ? $y : max($places[$pid]['y1'], $y); }
        if ((int) $r['person_id'] && in_array($k, ['b', 'd'], true)) {
            $p = (int) $r['person_id'];
            if (!isset($byPerson[$p][$k]) || ($y !== null && ($byPerson[$p][$k]['y'] === null || ($k === 'b' ? $y < $byPerson[$p][$k]['y'] : $y > $byPerson[$p][$k]['y'])))) { $byPerson[$p][$k] = ['place' => $pid, 'y' => $y]; }
        }
    }
    // migrations : du lieu de naissance au lieu de décès quand ils diffèrent (une flèche par trajet, plus épaisse s'il y en a plusieurs)
    $moves = [];
    foreach ($byPerson as $bd) {
        if (!isset($bd['b'], $bd['d']) || $bd['b']['place'] === $bd['d']['place']) { continue; }
        $key = $bd['b']['place'] . '>' . $bd['d']['place'];
        $moves[$key] ??= ['from' => $bd['b']['place'], 'to' => $bd['d']['place'], 'n' => 0, 'y0' => null, 'y1' => null];
        $moves[$key]['n']++;
        foreach ([$bd['b']['y'], $bd['d']['y']] as $y) { if ($y !== null) { $moves[$key]['y0'] = $moves[$key]['y0'] === null ? $y : min($moves[$key]['y0'], $y); $moves[$key]['y1'] = $moves[$key]['y1'] === null ? $y : max($moves[$key]['y1'], $y); } }
    }
    // portraits pour les médaillons : seulement des personnes montrées, avec une photo
    $photos = [];
    $want = max(0, min(24, safe_int($q['photos'] ?? 12)));
    if ($want && $byPerson) {
        $st = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, m.filename FROM persons p JOIN media m ON m.id=p.portrait_media_id WHERE p.id=? AND m.filename <> ''");
        foreach (array_keys($byPerson) as $id) {
            if (count($photos) >= $want) { break; }
            $st->execute([$id]); $r = $st->fetch();
            if (!$r || !preg_match('/\.(jpe?g|png|webp|gif)$/i', (string) $r['filename']) || str_contains((string) $r['filename'], '..')) { continue; }
            $at = $byPerson[$id]['b'] ?? $byPerson[$id]['d'] ?? null; if (!$at || !isset($places[$at['place']])) { continue; }
            $photos[] = ['person_id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . $r['last_name']), 'url' => 'media/' . implode('/', array_map('rawurlencode', explode('/', (string) $r['filename']))),
                'place' => $at['place'], 'year' => $at['y']];
        }
    }
    $years = array_filter(array_merge(array_column($places, 'y0'), array_column($places, 'y1')), static fn($v) => $v !== null);
    $rootName = '';
    if ($root > 0 && !isset($hidden[$root])) { $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$root]); if ($r = $s->fetch()) { $rootName = trim($r['first_name'] . ' ' . $r['last_name']); } }
    $surname = '';
    try { $sid = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn(); if ($sid && !isset($hidden[$sid])) { $surname = (string) $pdo->query("SELECT last_name FROM persons WHERE id=$sid")->fetchColumn(); } } catch (Throwable) {}
    return ['places' => array_values($places), 'moves' => array_values($moves), 'photos' => $photos,
        'years' => $years ? [min($years), max($years)] : null, 'hidden' => count($hidden), 'branch' => $rootName, 'surname' => $surname];
}

/* ═════════ Le relief : la grille des altitudes d'une zone ═════════ */

function cartes_outils_relief(array $q): array
{
    require_once __DIR__ . '/meteo.php';
    $num = static fn(string $k): float => is_numeric($q[$k] ?? null) ? (float) $q[$k] : NAN;
    [$s, $w, $n, $e] = [$num('s'), $num('w'), $num('n'), $num('e')];
    if (!is_finite($s) || !is_finite($w) || !is_finite($n) || !is_finite($e) || $n <= $s || $e <= $w || $s < -85 || $n > 85 || $w < -180 || $e > 180) {
        throw new RuntimeException('Zone illisible : il faut un sud, un ouest, un nord et un est.');
    }
    // 4° × 6° au plus (≈ 450 km) : au-delà le relief ne se voit plus et la grille serait trop lourde
    if ($n - $s > 4) { $c = ($n + $s) / 2; $s = $c - 2; $n = $c + 2; }
    if ($e - $w > 6) { $c = ($e + $w) / 2; $w = $c - 3; $e = $c + 3; }
    $files = meteo_files();
    $countries = [];
    foreach ($files as $f) { $p = meteo_pdo($f['path']); if (!$p) { continue; } try { $v = $p->query("SELECT value FROM meta WHERE key='relief_countries'")->fetchColumn(); foreach (array_filter(explode(',', (string) $v)) as $cc) { $countries[$cc] = METEO_COUNTRY_NAMES[$cc] ?? $cc; } } catch (Throwable) {} }
    $base = ['s' => $s, 'w' => $w, 'n' => $n, 'e' => $e, 'installed' => (bool) $files, 'countries' => array_values($countries)];
    if (!$files) { return $base + ['rows' => 0, 'cols' => 0, 'z' => [], 'covered' => 0.0]; }
    $size = max(16, min(200, safe_int($q['size'] ?? 120)));
    $kx = cos(deg2rad(($s + $n) / 2));
    $wide = ($e - $w) * $kx >= ($n - $s);
    $cols = $wide ? $size : max(8, (int) round($size * ($e - $w) * $kx / ($n - $s)));
    $rows = $wide ? max(8, (int) round($size * ($n - $s) / (($e - $w) * $kx))) : $size;
    $z = []; $have = 0; $min = null; $max = null;
    for ($i = 0; $i < $rows; $i++) {
        $lat = $n - ($n - $s) * $i / ($rows - 1); // du nord au sud
        for ($j = 0; $j < $cols; $j++) {
            $a = meteo_altitude($lat, $w + ($e - $w) * $j / ($cols - 1));
            if ($a === null) { $z[] = null; continue; }
            $a = (int) round($a); $z[] = $a; $have++;
            $min = $min === null ? $a : min($min, $a); $max = $max === null ? $a : max($max, $a);
        }
    }
    return $base + ['rows' => $rows, 'cols' => $cols, 'z' => $z, 'min' => $min, 'max' => $max, 'covered' => round($have / max(1, $rows * $cols), 3)];
}

/* ═════════ Mes couches ═════════ */

function cartes_outils_layers(PDO $pdo): array
{
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='map_layers'")->fetchColumn()) { return []; }
    $out = [];
    foreach ($pdo->query('SELECT * FROM map_layers WHERE deleted_at IS NULL ORDER BY sort_order, id') as $r) { $out[] = co_layer_row($r); }
    return $out;
}

function co_layer_row(array $r): array
{
    $f = json_decode((string) $r['features'], true);
    return ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'color' => (string) $r['color'], 'visible' => (bool) (int) $r['visible'], 'sort_order' => (int) $r['sort_order'],
        'features' => is_array($f) ? $f : [], 'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at']];
}

function co_text(mixed $v, int $max): string
{
    if (!is_scalar($v) && $v !== null) { return ''; }
    $t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) $v) ?? '';
    return mb_substr(trim($t), 0, $max);
}
function co_color(mixed $v, string $fallback = ''): string
{
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : $fallback;
}
function co_point(mixed $c): ?array
{
    if (!is_array($c) || !isset($c[0], $c[1]) || !is_numeric($c[0]) || !is_numeric($c[1])) { return null; }
    $lon = (float) $c[0]; $lat = (float) $c[1];
    if (!is_finite($lon) || !is_finite($lat) || abs($lat) > 90 || abs($lon) > 180) { return null; }
    return [round($lon, 6), round($lat, 6)];
}
/** une forme remise d'aplomb côté serveur (mêmes règles que cleanFeature d'app-cartes-outils-core.js) */
function co_feature(mixed $f): ?array
{
    if (!is_array($f) || !is_array($f['geometry'] ?? null)) { return null; }
    $g = $f['geometry']; $p = is_array($f['properties'] ?? null) ? $f['properties'] : [];
    $kind = in_array($p['kind'] ?? '', ['point', 'note', 'route', 'zone'], true) ? $p['kind'] : '';
    $type = (string) ($g['type'] ?? '');
    $raw = is_array($g['coordinates'] ?? null) ? $g['coordinates'] : [];
    if ($type === 'Point') { $c = co_point($raw); if (!$c) { return null; } $kind = $kind === 'note' ? 'note' : 'point'; }
    elseif ($type === 'LineString') { $c = array_values(array_filter(array_map('co_point', array_slice($raw, 0, CO_MAX_COORDS)))); if (count($c) < 2) { return null; } $kind = 'route'; }
    elseif ($type === 'Polygon') {
        $ring = array_values(array_filter(array_map('co_point', array_slice(is_array($raw[0] ?? null) ? $raw[0] : [], 0, CO_MAX_COORDS))));
        if (count($ring) >= 2 && $ring[0] === $ring[count($ring) - 1]) { array_pop($ring); }
        if (count($ring) < 3) { return null; }
        $ring[] = $ring[0]; $c = [$ring]; $kind = 'zone';
    } else { return null; }
    return ['type' => 'Feature', 'geometry' => ['type' => $type, 'coordinates' => $c],
        'properties' => ['kind' => $kind, 'name' => co_text($p['name'] ?? '', 200), 'note' => co_text($p['note'] ?? '', 2000), 'color' => co_color($p['color'] ?? '')]];
}

function cartes_outils_layer_save(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $name = co_text($d['name'] ?? '', 80) ?: 'Ma couche';
    $color = co_color($d['color'] ?? '', '#d9480f');
    $visible = !array_key_exists('visible', $d) || !empty($d['visible']) ? 1 : 0;
    $raw = is_array($d['features'] ?? null) ? $d['features'] : [];
    if (count($raw) > CO_MAX_FEATURES) { throw new RuntimeException('Trop de formes dans une couche (' . CO_MAX_FEATURES . ' au plus).'); }
    $features = array_values(array_filter(array_map('co_feature', $raw)));
    $json = json_encode($features, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if (strlen($json) > 8_000_000) { throw new RuntimeException('Couche trop lourde (8 Mo au plus).'); }
    if ($id > 0) {
        $s = $pdo->prepare('SELECT id FROM map_layers WHERE id=?'); $s->execute([$id]);
        if (!$s->fetchColumn()) { throw new RuntimeException('Couche introuvable.'); }
        $pdo->prepare('UPDATE map_layers SET name=?, color=?, visible=?, features=?, deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $color, $visible, $json, $id]);
    } else {
        $order = (int) $pdo->query('SELECT COALESCE(MAX(sort_order),0)+10 FROM map_layers')->fetchColumn();
        $pdo->prepare('INSERT INTO map_layers(name, color, visible, sort_order, features) VALUES(?,?,?,?,?)')->execute([$name, $color, $visible, $order, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    $s = $pdo->prepare('SELECT * FROM map_layers WHERE id=?'); $s->execute([$id]);
    return ['ok' => true, 'layer' => co_layer_row($s->fetch())];
}

function cartes_outils_layer_delete(PDO $pdo, array $d, bool $delete): array
{
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT id FROM map_layers WHERE id=?'); $s->execute([$id]);
    if (!$id || !$s->fetchColumn()) { throw new RuntimeException('Couche introuvable.'); }
    $pdo->prepare('UPDATE map_layers SET deleted_at=' . ($delete ? 'CURRENT_TIMESTAMP' : 'NULL') . ' WHERE id=?')->execute([$id]);
    $pdo->exec("DELETE FROM map_layers WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')"); // les couches supprimées depuis 30 jours partent pour de bon
    return ['ok' => true, 'id' => $id];
}

function cartes_outils_layer_order(PDO $pdo, array $d): array
{
    $ids = array_values(array_filter(array_map('intval', is_array($d['ids'] ?? null) ? array_slice($d['ids'], 0, 500) : [])));
    $st = $pdo->prepare('UPDATE map_layers SET sort_order=? WHERE id=?');
    foreach ($ids as $i => $id) { $st->execute([($i + 1) * 10, $id]); }
    return ['ok' => true];
}
