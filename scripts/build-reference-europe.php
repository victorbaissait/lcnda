<?php
declare(strict_types=1);

/**
 * Fabrique les communes des pays voisins pour les battues (phase 1 : Belgique, Suisse, Liechtenstein, Luxembourg) :
 *   data/reference/geo-be.sqlite.gz, geo-ch.sqlite.gz, geo-li.sqlite.gz, geo-lu.sqlite.gz
 *   data/reference/geo-frontieres.sqlite.gz   (communes voisines de part et d'autre des frontières)
 *
 * SOURCES PUBLIQUES uniquement (jamais une généalogie), dans vendor/geo/.cache :
 *   - Belgique : communes 2025 de l'IGN belge (ODWB), licence ouverte IGN (mention « IGN-NGI ») ;
 *   - Suisse + Liechtenstein : swissBOUNDARIES3D 2026 (swisstopo), Opendata BY (mention « swisstopo ») ;
 *   - Luxembourg : communes du cadastre (data.public.lu), CC0 ;
 *   - lieux et anciennes communes : GeoNames BE/CH/LI/LU.zip (CC BY 4.0) ;
 *   - France (seulement pour les voisinages aux frontières) : data/geo/communes.geojson (tracé précis).
 *
 * Codes : préfixés par le pays (« BE-57081 », « CH-6621 », « LI-7001 », « LU-0607 ») pour ne jamais se confondre avec
 * un code INSEE (21004 = Aignay-le-Duc ET une commune belge). Les communes françaises gardent leur code INSEE.
 *
 *   php -d memory_limit=4G scripts/build-reference-europe.php
 */

ini_set('memory_limit', '4096M');
require __DIR__ . '/../lib/text.php';
$root = dirname(__DIR__);
$cache = $root . '/vendor/geo/.cache';
$out = $root . '/data/reference';
@mkdir($out, 0775, true);

const COUNTRY_NAMES = ['BE' => 'Belgique', 'CH' => 'Suisse', 'LI' => 'Liechtenstein', 'LU' => 'Luxembourg', 'FR' => 'France'];
const SIMPLIFY_M = 150;       // tolérance de simplification des tracés livrés (la France est encore plus simplifiée)
const BORDER_M = 150;         // deux communes de pays différents sont voisines si leurs limites sont à moins de 150 m
const SAMPLE_M = 40;          // un point tous les 40 m le long des limites pour comparer les tracés

$fold = static fn(string $v): string => trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(ascii_fold($v))));

// ─── Géométrie ───────────────────────────────────────────────────────────────────────────────

/** Coordonnées suisses LV95 (E, N) → GPS (formules approchées officielles de swisstopo, ~1 m). */
function lv95_to_wgs84(float $e, float $n): array
{
    $y = ($e - 2600000) / 1000000; $x = ($n - 1200000) / 1000000;
    $lon = 2.6779094 + 4.728982 * $y + 0.791484 * $y * $x + 0.1306 * $y * $x * $x - 0.0436 * $y * $y * $y;
    $lat = 16.9023892 + 3.238272 * $x - 0.270978 * $y * $y - 0.002528 * $x * $x - 0.0447 * $y * $y * $x - 0.0140 * $x * $x * $x;
    return [round($lon * 100 / 36, 6), round($lat * 100 / 36, 6)];
}

/** Géométrie GeoPackage (en-tête GP + WKB, avec ou sans Z) → liste de polygones [anneaux [[x,y]…]…]. */
function gpkg_polygons(string $blob, callable $project): array
{
    $flags = ord($blob[3]);
    $envelope = [0, 32, 48, 48, 64][($flags >> 1) & 7] ?? 0;
    $wkb = substr($blob, 8 + $envelope);
    $pos = 0;
    $readGeom = static function () use (&$readGeom, &$pos, $wkb, $project): array {
        $le = ord($wkb[$pos]) === 1; $pos++;
        $type = unpack($le ? 'V' : 'N', substr($wkb, $pos, 4))[1]; $pos += 4;
        $hasZ = ($type & 0x80000000) || ($type >= 1000 && $type < 2000) || ($type >= 3000);
        $base = $type & 0xFFFF; $base = $base % 1000;
        $dims = $hasZ ? 3 : 2;
        $double = static function () use (&$pos, $wkb, $le): float { $b = substr($wkb, $pos, 8); $pos += 8; if (!$le) { $b = strrev($b); } return unpack('e', $b)[1]; };
        $uint = static function () use (&$pos, $wkb, $le): int { $v = unpack($le ? 'V' : 'N', substr($wkb, $pos, 4))[1]; $pos += 4; return $v; };
        if ($base === 3) {
            $rings = [];
            for ($r = 0, $nr = $uint(); $r < $nr; $r++) {
                $ring = [];
                for ($i = 0, $np = $uint(); $i < $np; $i++) { $x = $double(); $y = $double(); if ($dims === 3) { $double(); } $ring[] = $project($x, $y); }
                $rings[] = $ring;
            }
            return [$rings];
        }
        if ($base === 6) {
            $polys = [];
            for ($p = 0, $n = $uint(); $p < $n; $p++) { foreach ($readGeom() as $poly) { $polys[] = $poly; } }
            return $polys;
        }
        throw new RuntimeException("Géométrie non prise en charge (type {$type})");
    };
    return $readGeom();
}

/** GeoJSON Polygon / MultiPolygon → liste de polygones. */
function geojson_polygons(array $g): array
{
    return match ($g['type'] ?? '') { 'Polygon' => [$g['coordinates']], 'MultiPolygon' => $g['coordinates'], default => [] };
}

/** Distance approchée en mètres (suffisante à l'échelle d'une frontière). */
function meters(array $a, array $b): float
{
    $k = cos(deg2rad(($a[1] + $b[1]) / 2));
    return hypot(($b[0] - $a[0]) * 111320 * $k, ($b[1] - $a[1]) * 110540);
}

/** Douglas-Peucker sur un anneau (le premier et le dernier point sont gardés). */
function simplify_ring(array $pts, float $tol): array
{
    $n = count($pts);
    if ($n <= 4) { return $pts; }
    $keep = array_fill(0, $n, false); $keep[0] = $keep[$n - 1] = true;
    $stack = [[0, $n - 1]];
    while ($stack) {
        [$a, $b] = array_pop($stack);
        $max = 0; $idx = -1;
        for ($i = $a + 1; $i < $b; $i++) {
            $d = segment_distance($pts[$i], $pts[$a], $pts[$b]);
            if ($d > $max) { $max = $d; $idx = $i; }
        }
        if ($idx > 0 && $max > $tol) { $keep[$idx] = true; $stack[] = [$a, $idx]; $stack[] = [$idx, $b]; }
    }
    $out = [];
    foreach ($pts as $i => $p) { if ($keep[$i]) { $out[] = $p; } }
    return count($out) >= 4 ? $out : [$pts[0], $pts[intdiv($n, 3)], $pts[intdiv(2 * $n, 3)], $pts[0]];
}

function segment_distance(array $p, array $a, array $b): float
{
    $k = cos(deg2rad($p[1]));
    [$px, $py, $ax, $ay, $bx, $by] = [$p[0] * $k, $p[1], $a[0] * $k, $a[1], $b[0] * $k, $b[1]];
    $dx = $bx - $ax; $dy = $by - $ay;
    $t = ($dx || $dy) ? max(0, min(1, (($px - $ax) * $dx + ($py - $ay) * $dy) / ($dx * $dx + $dy * $dy))) : 0;
    return hypot($px - ($ax + $t * $dx), $py - ($ay + $t * $dy)) * 110540;
}

function simplify_polygons(array $polys, float $tol): array
{
    $out = [];
    foreach ($polys as $poly) {
        $rings = [];
        foreach ($poly as $i => $ring) {
            $s = simplify_ring($ring, $tol);
            if ($i === 0 || count($s) >= 4) { $rings[] = $s; }
        }
        if ($rings) { $out[] = $rings; }
    }
    return $out;
}

/** Le point est-il dans l'un des polygones (anneau extérieur, trous déduits) ? */
function point_in_polygons(float $x, float $y, array $polys): bool
{
    $inRing = static function (array $ring) use ($x, $y): bool {
        $in = false;
        for ($i = 0, $j = count($ring) - 1, $n = count($ring); $i < $n; $j = $i++) {
            [$xi, $yi] = $ring[$i]; [$xj, $yj] = $ring[$j];
            if ((($yi > $y) !== ($yj > $y)) && ($x < ($xj - $xi) * ($y - $yi) / (($yj - $yi) ?: 1e-12) + $xi)) { $in = !$in; }
        }
        return $in;
    };
    foreach ($polys as $poly) {
        if (!$inRing($poly[0])) { continue; }
        $hole = false;
        foreach (array_slice($poly, 1) as $ring) { if ($inRing($ring)) { $hole = true; break; } }
        if (!$hole) { return true; }
    }
    return false;
}

function bounds(array $polys): array
{
    $minX = $minY = INF; $maxX = $maxY = -INF;
    foreach ($polys as $poly) { foreach ($poly[0] as $p) { $minX = min($minX, $p[0]); $maxX = max($maxX, $p[0]); $minY = min($minY, $p[1]); $maxY = max($maxY, $p[1]); } }
    return [$minX, $minY, $maxX, $maxY];
}

/** Points le long des limites extérieures, un tous les SAMPLE_M mètres. */
function boundary_samples(array $polys): array
{
    $pts = [];
    foreach ($polys as $poly) {
        $ring = $poly[0];
        for ($i = 0, $n = count($ring) - 1; $i < $n; $i++) {
            $a = $ring[$i]; $b = $ring[$i + 1];
            $steps = max(1, (int) ceil(meters($a, $b) / SAMPLE_M));
            for ($s = 0; $s < $steps; $s++) { $t = $s / $steps; $pts[] = [$a[0] + ($b[0] - $a[0]) * $t, $a[1] + ($b[1] - $a[1]) * $t]; }
        }
    }
    return $pts;
}

/**
 * Communes voisines : deux communes dont les limites passent à moins de $tolerance mètres l'une de l'autre.
 * Grille de cellules ($tolerance de côté) : on ne compare que les points des cellules voisines.
 * $communes : code => polygones (tracé précis). $onlyPairs(codeA, codeB) filtre les paires (ex. pays différents).
 */
function neighbors_by_distance(array $communes, float $tolerance, ?callable $onlyPairs = null): array
{
    $cellLat = $tolerance / 110540;
    $grid = []; $samples = [];
    foreach ($communes as $code => $polys) {
        $samples[$code] = boundary_samples($polys);
        foreach ($samples[$code] as $p) {
            $cellLon = $tolerance / (111320 * cos(deg2rad($p[1])));
            $grid[(int) floor($p[0] / $cellLon) . ':' . (int) floor($p[1] / $cellLat)][$code][] = $p;
        }
    }
    $pairs = [];
    foreach ($samples as $code => $pts) {
        foreach ($pts as $p) {
            $cellLon = $tolerance / (111320 * cos(deg2rad($p[1])));
            $cx = (int) floor($p[0] / $cellLon); $cy = (int) floor($p[1] / $cellLat);
            for ($dx = -1; $dx <= 1; $dx++) {
                for ($dy = -1; $dy <= 1; $dy++) {
                    foreach ($grid[($cx + $dx) . ':' . ($cy + $dy)] ?? [] as $other => $otherPts) {
                        if ($other === $code || isset($pairs[$code][$other]) || ($onlyPairs && !$onlyPairs((string) $code, (string) $other))) { continue; }
                        foreach ($otherPts as $q) { if (meters($p, $q) <= $tolerance) { $pairs[$code][$other] = $pairs[$other][$code] = true; break; } }
                    }
                }
            }
        }
    }
    return $pairs;
}

// ─── Lecture des communes de chaque pays (tracé précis) ─────────────────────────────────────

$countries = []; // cc => [code => ['name'=>, 'county'=>, 'state'=>, 'alt'=>, 'polys'=>]]

// Belgique
$be = json_decode((string) file_get_contents("{$cache}/communes-belgique-2025.geojson"), true, 512, JSON_THROW_ON_ERROR);
// Les champs de l'export ODWB sont parfois des listes (« ["85039"] »), parfois des textes.
$first = static fn($v): string => is_array($v) ? (string) ($v[0] ?? '') : (string) ($v ?? '');
$stripProvince = static fn(string $v): string => trim((string) preg_replace("/^Province (de |du |d’|d')/u", '', $v));
foreach ($be['features'] as $f) {
    $p = $f['properties'];
    $nis = $first($p['mun_code'] ?? '');
    $langs = (array) ($p['mun_off_language'] ?? ['FR']);
    $lang = in_array('FR', $langs, true) ? 'fr' : strtolower((string) $langs[0]);
    $name = $first($p['mun_name_' . $lang] ?? '') ?: $first($p['mun_name_fr'] ?? '');
    $alt = array_values(array_unique(array_filter([$first($p['mun_name_fr'] ?? ''), $first($p['mun_name_nl'] ?? ''), $first($p['mun_name_de'] ?? '')], static fn($n) => $n !== '' && $n !== $name)));
    $countries['BE']['BE-' . $nis] = ['name' => $name, 'alt' => implode(',', $alt), 'county' => $stripProvince($first($p['prov_name_fr'] ?? '')),
        'state' => $first($p['reg_name_fr'] ?? ''), 'polys' => geojson_polygons($f['geometry'] ?? $f['geo_shape']['geometry'] ?? [])];
}
unset($be);

// Suisse et Liechtenstein (swissBOUNDARIES3D : coordonnées LV95 → GPS)
$gpkg = glob("{$cache}/ch/*.gpkg")[0] ?? '';
if ($gpkg === '') { fwrite(STDERR, "GeoPackage suisse absent : décompresser swissboundaries3d_*.gpkg.zip dans vendor/geo/.cache/ch/\n"); exit(1); }
$ch = new PDO('sqlite:' . $gpkg, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$cantons = []; foreach ($ch->query('SELECT kantonsnummer, name FROM tlm_kantonsgebiet') as $r) { $cantons[(int) $r['kantonsnummer']] = $r['name']; }
$districts = []; foreach ($ch->query('SELECT bezirksnummer, name FROM tlm_bezirksgebiet') as $r) { $districts[(int) $r['bezirksnummer']] = $r['name']; }
foreach ($ch->query("SELECT bfs_nummer, name, icc, kantonsnummer, bezirksnummer, geom FROM tlm_hoheitsgebiet WHERE objektart='Gemeindegebiet' AND icc IN ('CH','LI') ORDER BY bfs_nummer") as $r) {
    $cc = $r['icc'];
    $code = $cc . '-' . (int) $r['bfs_nummer'];
    $polys = gpkg_polygons($r['geom'], static fn(float $x, float $y) => lv95_to_wgs84($x, $y));
    if (!isset($countries[$cc][$code])) {
        $countries[$cc][$code] = ['name' => $r['name'], 'alt' => '', 'county' => $cc === 'CH' ? (string) ($districts[(int) $r['bezirksnummer']] ?? '') : '',
            'state' => $cc === 'CH' ? (string) ($cantons[(int) $r['kantonsnummer']] ?? '') : '', 'polys' => []];
    }
    foreach ($polys as $poly) { $countries[$cc][$code]['polys'][] = $poly; } // commune en plusieurs morceaux
}
$ch = null;

// Luxembourg
$lu = json_decode((string) file_get_contents("{$cache}/communes-luxembourg-4326.geojson"), true, 512, JSON_THROW_ON_ERROR);
foreach ($lu['features'] as $f) {
    $p = $f['properties'];
    $countries['LU']['LU-' . $p['LAU2']] = ['name' => (string) $p['COMMUNE'], 'alt' => '', 'county' => (string) $p['CANTON'], 'state' => '', 'polys' => geojson_polygons($f['geometry'])];
}
unset($lu);

// France (tracé précis), seulement près des frontières
$fr = json_decode((string) file_get_contents($root . '/data/geo/communes.geojson'), true, 512, JSON_THROW_ON_ERROR);
$box = [INF, INF, -INF, -INF];
foreach (['BE', 'CH', 'LI', 'LU'] as $cc) { foreach ($countries[$cc] as $c) { $b = bounds($c['polys']); $box = [min($box[0], $b[0]), min($box[1], $b[1]), max($box[2], $b[2]), max($box[3], $b[3])]; } }
$frBorder = [];
foreach ($fr['features'] as $f) {
    $polys = geojson_polygons($f['geometry'] ?? []);
    if (!$polys) { continue; }
    $b = bounds($polys);
    if ($b[2] < $box[0] - 0.05 || $b[0] > $box[2] + 0.05 || $b[3] < $box[1] - 0.05 || $b[1] > $box[3] + 0.05) { continue; }
    $frBorder[(string) ($f['properties']['code'] ?? '')] = $polys;
}
unset($fr);
foreach ($countries as $cc => $list) { printf("%s : %d communes\n", COUNTRY_NAMES[$cc], count($list)); }
printf("France (près des frontières, pour les voisinages) : %d communes\n", count($frBorder));

// ─── Voisinages ──────────────────────────────────────────────────────────────────────────────
$countryOf = static fn(string $code): string => preg_match('/^([A-Z]{2})-/', $code, $m) ? $m[1] : 'FR';
$internal = [];
foreach ($countries as $cc => $list) {
    $internal[$cc] = neighbors_by_distance(array_map(static fn($c) => $c['polys'], $list), 25);
    printf("Voisinages en %s : %d paires\n", COUNTRY_NAMES[$cc], array_sum(array_map('count', $internal[$cc])) / 2);
}
// Entre pays : seulement les communes proches d'une frontière (bande de 3 km autour de chaque autre pays)
$all = $frBorder;
foreach ($countries as $list) { foreach ($list as $code => $c) { $all[$code] = $c['polys']; } }
$border = neighbors_by_distance($all, BORDER_M, static fn(string $a, string $b) => $countryOf($a) !== $countryOf($b));
$borderPairs = [];
foreach ($border as $a => $list) { foreach ($list as $b => $_) { if (strcmp((string) $a, (string) $b) < 0) { $borderPairs[] = [(string) $a, (string) $b]; } } }
$byPair = [];
foreach ($borderPairs as [$a, $b]) { $k = implode('-', [min($countryOf($a), $countryOf($b)), max($countryOf($a), $countryOf($b))]); $byPair[$k] = ($byPair[$k] ?? 0) + 1; }
ksort($byPair);
foreach ($byPair as $k => $n) { echo "Voisinages entre pays {$k} : {$n} paires\n"; }

// ─── Lieux GeoNames (anciennes communes en sous-nom) ─────────────────────────────────────────
function geonames_rows(string $zip, string $cc): Generator
{
    $h = fopen("zip://{$zip}#{$cc}.txt", 'r');
    if (!$h) { throw new RuntimeException("{$cc}.txt introuvable dans {$zip}"); }
    while (($line = fgets($h)) !== false) { yield explode("\t", rtrim($line, "\r\n")); }
    fclose($h);
}

$places = []; // cc => liste
$boxes = [];
foreach ($countries as $cc => $list) { foreach ($list as $code => $c) { $boxes[$cc][$code] = bounds($c['polys']); } }
$unmapped = [];
foreach (['BE', 'CH', 'LI', 'LU'] as $cc) {
    $zip = "{$cache}/geonames-{$cc}.zip";
    $byName = [];
    foreach ($countries[$cc] as $code => $c) { $byName[$fold($c['name'])] = $code; }
    // commune GeoNames → code de nos contours
    $communeOf = [];
    foreach (geonames_rows($zip, $cc) as $r) {
        if (($r[6] ?? '') !== 'A') { continue; }
        $fc = $r[7] ?? '';
        $key = match ($cc) { 'BE' => $fc === 'ADM4' ? 'BE-' . ($r[13] ?? '') : null, 'CH' => $fc === 'ADM3' ? 'CH-' . (int) ($r[12] ?? 0) : null,
            'LU' => $fc === 'ADM2' ? ($byName[$fold($r[1])] ?? null) : null, 'LI' => $fc === 'ADM1' ? ($byName[$fold($r[1])] ?? null) : null, default => null };
        if ($key === null || !isset($countries[$cc][$key])) { continue; }
        $adminKey = match ($cc) { 'BE' => 'a4:' . $r[13], 'CH' => 'a3:' . (int) $r[12], 'LU' => 'a2:' . $r[10] . '.' . $r[11], 'LI' => 'a1:' . $r[10] };
        $communeOf[$adminKey] = $key;
    }
    $seen = [];
    foreach (geonames_rows($zip, $cc) as $r) {
        if (($r[6] ?? '') !== 'P' || (int) ($r[0] ?? 0) === 0) { continue; }
        $adminKey = match ($cc) { 'BE' => 'a4:' . ($r[13] ?? ''), 'CH' => 'a3:' . (int) ($r[12] ?? 0), 'LU' => 'a2:' . ($r[10] ?? '') . '.' . ($r[11] ?? ''), 'LI' => 'a1:' . ($r[10] ?? '') };
        $code = $communeOf[$adminKey] ?? null;
        if ($code === null) {
            // Commune fusionnée depuis (GeoNames garde l'ancienne) : la commune actuelle qui contient le lieu
            [$lx, $ly] = [(float) $r[5], (float) $r[4]];
            foreach ($boxes[$cc] as $candidate => $b) {
                if ($lx < $b[0] || $lx > $b[2] || $ly < $b[1] || $ly > $b[3]) { continue; }
                if (point_in_polygons($lx, $ly, $countries[$cc][$candidate]['polys'])) { $code = $candidate; break; }
            }
        }
        $c = $code ? $countries[$cc][$code] : null;
        $raw = $r[1];
        [$name, $sub] = ($c && $fold($c['name']) !== $fold($raw)) ? [$c['name'], $raw] : [$c['name'] ?? $raw, ''];
        if (!$code) { $unmapped[$cc] = ($unmapped[$cc] ?? 0) + 1; }
        $places[$cc][] = [(int) $r[0], $name, $sub, $c['county'] ?? '', $c['state'] ?? '', COUNTRY_NAMES[$cc], $r[3] ?? '', (float) $r[4], (float) $r[5], $code ?? '', $r[7], (int) ($r[14] ?? 0)];
        if ($code) { $seen[$code] = true; }
    }
    // Commune sans aucun lieu habité dans GeoNames : la commune elle-même, à son centre
    foreach ($countries[$cc] as $code => $c) {
        if (isset($seen[$code])) { continue; }
        $b = bounds($c['polys']);
        $places[$cc][] = [null, $c['name'], '', $c['county'], $c['state'], COUNTRY_NAMES[$cc], $c['alt'], round(($b[1] + $b[3]) / 2, 6), round(($b[0] + $b[2]) / 2, 6), $code, 'ADM', 0];
    }
    printf("Lieux GeoNames en %s : %d (hors de toute commune : %d)\n", COUNTRY_NAMES[$cc], count($places[$cc]), $unmapped[$cc] ?? 0);
}

// ─── Écriture des fichiers ───────────────────────────────────────────────────────────────────
function write_gz(string $sqlite, string $target): void
{
    $in = fopen($sqlite, 'rb'); $gz = gzopen($target, 'wb9');
    while (!feof($in)) { gzwrite($gz, (string) fread($in, 1 << 20)); }
    fclose($in); gzclose($gz); unlink($sqlite);
    printf("→ %s (%.1f Mo)\n", basename($target), filesize($target) / 1048576);
}
$sources = [
    'BE' => 'Communes 2025 : IGN-NGI (Institut géographique national belge, licence ouverte), via ODWB',
    'CH' => 'swissBOUNDARIES3D 2026 © swisstopo (Opendata BY)', 'LI' => 'swissBOUNDARIES3D 2026 © swisstopo (Opendata BY)',
    'LU' => 'Communes : Administration du cadastre et de la topographie (data.public.lu, CC0)',
];
foreach ($countries as $cc => $list) {
    $tmp = sys_get_temp_dir() . '/lcnda-' . strtolower($cc) . '-' . bin2hex(random_bytes(3)) . '.sqlite';
    $db = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA journal_mode = OFF');
    $db->exec("CREATE TABLE reference_info (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    $db->exec("CREATE TABLE commune_contours (insee_code TEXT PRIMARY KEY, name TEXT NOT NULL, geometry_json TEXT NOT NULL,
        min_lon REAL, min_lat REAL, max_lon REAL, max_lat REAL, centroid_lon REAL, centroid_lat REAL)");
    $db->exec("CREATE TABLE commune_neighbors (insee_code TEXT NOT NULL, neighbor_insee_code TEXT NOT NULL, PRIMARY KEY(insee_code, neighbor_insee_code))");
    $db->exec("CREATE TABLE geo_places (geoname_id INTEGER, name TEXT, subdivision TEXT, county TEXT, state TEXT, country TEXT,
        alternate_names TEXT, latitude REAL, longitude REAL, admin4_code TEXT, feature_code TEXT, population INTEGER)");
    $db->beginTransaction();
    $ins = $db->prepare('INSERT INTO commune_contours VALUES(?,?,?,?,?,?,?,?,?)');
    foreach ($list as $code => $c) {
        $polys = simplify_polygons($c['polys'], SIMPLIFY_M);
        $b = bounds($polys);
        $geometry = count($polys) === 1 ? ['type' => 'Polygon', 'coordinates' => $polys[0]] : ['type' => 'MultiPolygon', 'coordinates' => $polys];
        $ins->execute([$code, $c['name'], json_encode($geometry, JSON_UNESCAPED_SLASHES), $b[0], $b[1], $b[2], $b[3], ($b[0] + $b[2]) / 2, ($b[1] + $b[3]) / 2]);
    }
    $insN = $db->prepare('INSERT OR IGNORE INTO commune_neighbors VALUES(?,?)');
    foreach ($internal[$cc] as $a => $l) { foreach ($l as $b => $_) { $insN->execute([(string) $a, (string) $b]); } }
    $insP = $db->prepare('INSERT INTO geo_places VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach ($places[$cc] as $p) { $insP->execute($p); }
    $info = $db->prepare('INSERT INTO reference_info VALUES(?,?)');
    foreach (['country' => $cc, 'country_name' => COUNTRY_NAMES[$cc], 'source' => $sources[$cc], 'places_source' => 'GeoNames ' . $cc . '.zip (CC BY 4.0)',
              'version' => date('Ymd'), 'built_at' => date(DATE_ATOM)] as $k => $v) { $info->execute([$k, $v]); }
    $db->commit(); $db->exec('VACUUM'); $db = null;
    write_gz($tmp, "{$out}/geo-" . strtolower($cc) . '.sqlite.gz');
}
$tmp = sys_get_temp_dir() . '/lcnda-frontieres-' . bin2hex(random_bytes(3)) . '.sqlite';
$db = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec("CREATE TABLE reference_info (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
$db->exec("CREATE TABLE border_neighbors (insee_code TEXT NOT NULL, neighbor_insee_code TEXT NOT NULL, PRIMARY KEY(insee_code, neighbor_insee_code))");
$ins = $db->prepare('INSERT OR IGNORE INTO border_neighbors VALUES(?,?)');
$db->beginTransaction();
foreach ($borderPairs as [$a, $b]) { $ins->execute([$a, $b]); $ins->execute([$b, $a]); }
$info = $db->prepare('INSERT INTO reference_info VALUES(?,?)');
foreach (['tolerance_m' => (string) BORDER_M, 'version' => date('Ymd'), 'built_at' => date(DATE_ATOM)] as $k => $v) { $info->execute([$k, $v]); }
$db->commit(); $db->exec('VACUUM'); $db = null;
write_gz($tmp, "{$out}/geo-frontieres.sqlite.gz");
