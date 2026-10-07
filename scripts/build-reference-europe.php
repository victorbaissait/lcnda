<?php
declare(strict_types=1);

/**
 * Fabrique les communes des pays voisins pour les battues, un fichier par pays :
 *   data/reference/geo-<pays>.sqlite.gz   (contours simplifiés, voisinages internes, lieux GeoNames)
 *   data/reference/geo-frontieres.sqlite.gz   (communes voisines de part et d'autre des frontières)
 *
 * SOURCES PUBLIQUES uniquement (jamais une généalogie), téléchargées dans vendor/geo/.cache (Espagne : lineas_limite/,
 * téléchargé par Victor sur le portail du CNIG après acceptation des conditions) :
 *   - Belgique : communes 2025 IGN-NGI (via ODWB), licence ouverte IGN ;
 *   - Suisse + Liechtenstein : swissBOUNDARIES3D 2026 © swisstopo, Opendata BY ;
 *   - Luxembourg : communes du cadastre (data.public.lu), CC0 ;
 *   - Allemagne : VG250 au 01.01 © BKG, dl-de/by-2-0 ;
 *   - Italie : confini amministrativi 2026 (versione generalizzata) © ISTAT, CC BY 4.0 ;
 *   - Autriche : Gemeinden 2026 © Statistik Austria, CC BY 4.0 ;
 *   - Espagne : recintos municipales © Instituto Geográfico Nacional (CNIG), CC BY 4.0 ;
 *   - outre-mer français : france-geojson (IGN Admin Express, Licence Ouverte) ;
 *   - lieux et anciennes communes : GeoNames <pays>.zip (CC BY 4.0) ;
 *   - France métropolitaine (seulement pour les voisinages aux frontières) : data/geo/communes.geojson.
 *
 * Codes : préfixés par le pays (« BE-57081 », « DE-08311000 ») pour ne jamais se confondre avec un code INSEE.
 * La France, outre-mer compris, garde ses codes INSEE (97101 = Les Abymes).
 *
 *   php -d memory_limit=8G scripts/build-reference-europe.php
 */

ini_set('memory_limit', '8192M');
require __DIR__ . '/../lib/text.php';
$root = dirname(__DIR__);
$cache = $root . '/vendor/geo/.cache';
$out = $root . '/data/reference';
@mkdir($out, 0775, true);

const SIMPLIFY_M = 150;   // tracés livrés (la France métropolitaine est encore plus simplifiée)
const PRESIMPLIFY_M = 15; // tracés de travail, pour calculer les voisinages sans saturer la mémoire
const INTERNAL_M = 40;    // voisines dans un même pays : limites à moins de 40 m (sources cohérentes)
const BORDER_M = 165;     // voisines de part et d'autre d'une frontière : moins de ~150 m (+ marge de travail)
const SAMPLE_M = 40;      // un point tous les 40 m le long des limites

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

/** UTM (hémisphère nord) → GPS, ellipsoïde WGS84 / GRS80 (formules classiques, précision sub-métrique). */
function utm_to_wgs84(float $e, float $n, int $zone): array
{
    $a = 6378137.0; $f = 1 / 298.257223563; $k0 = 0.9996;
    $e2 = $f * (2 - $f); $ep2 = $e2 / (1 - $e2);
    $x = $e - 500000; $m = $n / $k0;
    $mu = $m / ($a * (1 - $e2 / 4 - 3 * $e2 ** 2 / 64 - 5 * $e2 ** 3 / 256));
    $e1 = (1 - sqrt(1 - $e2)) / (1 + sqrt(1 - $e2));
    $phi1 = $mu + (3 * $e1 / 2 - 27 * $e1 ** 3 / 32) * sin(2 * $mu) + (21 * $e1 ** 2 / 16 - 55 * $e1 ** 4 / 32) * sin(4 * $mu)
        + (151 * $e1 ** 3 / 96) * sin(6 * $mu) + (1097 * $e1 ** 4 / 512) * sin(8 * $mu);
    $c1 = $ep2 * cos($phi1) ** 2; $t1 = tan($phi1) ** 2;
    $n1 = $a / sqrt(1 - $e2 * sin($phi1) ** 2); $r1 = $a * (1 - $e2) / (1 - $e2 * sin($phi1) ** 2) ** 1.5;
    $d = $x / ($n1 * $k0);
    $lat = $phi1 - ($n1 * tan($phi1) / $r1) * ($d ** 2 / 2 - (5 + 3 * $t1 + 10 * $c1 - 4 * $c1 ** 2 - 9 * $ep2) * $d ** 4 / 24
        + (61 + 90 * $t1 + 298 * $c1 + 45 * $t1 ** 2 - 252 * $ep2 - 3 * $c1 ** 2) * $d ** 6 / 720);
    $lon = ($d - (1 + 2 * $t1 + $c1) * $d ** 3 / 6 + (5 - 2 * $c1 + 28 * $t1 - 3 * $c1 ** 2 + 8 * $ep2 + 24 * $t1 ** 2) * $d ** 5 / 120) / cos($phi1);
    return [round(rad2deg($lon) + ($zone * 6 - 183), 6), round(rad2deg($lat), 6)];
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
        $base = ($type & 0xFFFF) % 1000;
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

/** Lit un shapefile (polygones) + sa table .dbf : génère [attributs, polygones]. */
function shapefile_records(string $shp, callable $project): Generator
{
    $dbf = fopen(preg_replace('/\.shp$/i', '.dbf', $shp), 'rb');
    $head = fread($dbf, 32);
    $count = unpack('V', substr($head, 4, 4))[1]; $headerLen = unpack('v', substr($head, 8, 2))[1]; $recordLen = unpack('v', substr($head, 10, 2))[1];
    $fields = [];
    while (true) {
        $d = fread($dbf, 32);
        if ($d === '' || $d[0] === "\r") { break; }
        $fields[] = [rtrim(substr($d, 0, 11), "\0"), ord($d[16])];
    }
    $cpgFile = preg_replace('/\.shp$/i', '.cpg', $shp);
    $cpg = is_file($cpgFile) ? strtoupper(trim((string) file_get_contents($cpgFile))) : '';
    $utf8 = str_contains($cpg, 'UTF');
    fseek($dbf, $headerLen);
    $shpH = fopen($shp, 'rb');
    fseek($shpH, 100);
    for ($r = 0; $r < $count; $r++) {
        $rec = fread($dbf, $recordLen);
        $attrs = []; $off = 1;
        foreach ($fields as [$name, $len]) {
            $v = trim(substr($rec, $off, $len)); $off += $len;
            $attrs[$name] = $utf8 ? $v : mb_convert_encoding($v, 'UTF-8', 'ISO-8859-1');
        }
        $rh = fread($shpH, 8);
        $contentLen = unpack('N', substr($rh, 4, 4))[1] * 2;
        $c = fread($shpH, $contentLen);
        $type = unpack('V', substr($c, 0, 4))[1];
        if (!in_array($type, [5, 15, 25], true)) { yield [$attrs, []]; continue; }
        $nParts = unpack('V', substr($c, 36, 4))[1]; $nPoints = unpack('V', substr($c, 40, 4))[1];
        $parts = array_values(unpack('V*', substr($c, 44, 4 * $nParts)));
        $pts = unpack('e*', substr($c, 44 + 4 * $nParts, 16 * $nPoints));
        $polys = [];
        for ($p = 0; $p < $nParts; $p++) {
            $from = $parts[$p]; $to = $p + 1 < $nParts ? $parts[$p + 1] : $nPoints;
            $ring = []; $area = 0;
            for ($i = $from; $i < $to; $i++) { $ring[] = $project($pts[2 * $i + 1], $pts[2 * $i + 2]); }
            for ($i = 0, $n = count($ring) - 1; $i < $n; $i++) { $area += $ring[$i][0] * $ring[$i + 1][1] - $ring[$i + 1][0] * $ring[$i][1]; }
            // Shapefile : anneau extérieur dans le sens des aiguilles d'une montre (aire < 0), trous dans l'autre sens
            if ($area <= 0 || !$polys) { $polys[] = [$ring]; } else { $polys[count($polys) - 1][] = $ring; }
        }
        yield [$attrs, $polys];
    }
    fclose($dbf); fclose($shpH);
}

/** Distance approchée en mètres (suffisante à l'échelle d'une frontière). */
function meters(array $a, array $b): float
{
    $k = cos(deg2rad(($a[1] + $b[1]) / 2));
    return hypot(($b[0] - $a[0]) * 111320 * $k, ($b[1] - $a[1]) * 110540);
}

function segment_distance(array $p, array $a, array $b): float
{
    $k = cos(deg2rad($p[1]));
    [$px, $py, $ax, $ay, $bx, $by] = [$p[0] * $k, $p[1], $a[0] * $k, $a[1], $b[0] * $k, $b[1]];
    $dx = $bx - $ax; $dy = $by - $ay;
    $t = ($dx || $dy) ? max(0, min(1, (($px - $ax) * $dx + ($py - $ay) * $dy) / ($dx * $dx + $dy * $dy))) : 0;
    return hypot($px - ($ax + $t * $dx), $py - ($ay + $t * $dy)) * 110540;
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
        for ($i = $a + 1; $i < $b; $i++) { $d = segment_distance($pts[$i], $pts[$a], $pts[$b]); if ($d > $max) { $max = $d; $idx = $i; } }
        if ($idx > 0 && $max > $tol) { $keep[$idx] = true; $stack[] = [$a, $idx]; $stack[] = [$idx, $b]; }
    }
    $out = [];
    foreach ($pts as $i => $p) { if ($keep[$i]) { $out[] = $p; } }
    return count($out) >= 4 ? $out : [$pts[0], $pts[intdiv($n, 3)], $pts[intdiv(2 * $n, 3)], $pts[0]];
}

function simplify_polygons(array $polys, float $tol): array
{
    $out = [];
    foreach ($polys as $poly) {
        $rings = [];
        foreach ($poly as $i => $ring) { $s = simplify_ring($ring, $tol); if ($i === 0 || count($s) >= 4) { $rings[] = $s; } }
        if ($rings) { $out[] = $rings; }
    }
    return $out;
}

function bounds(array $polys): array
{
    $minX = $minY = INF; $maxX = $maxY = -INF;
    foreach ($polys as $poly) { foreach ($poly[0] as $p) { $minX = min($minX, $p[0]); $maxX = max($maxX, $p[0]); $minY = min($minY, $p[1]); $maxY = max($maxY, $p[1]); } }
    return [$minX, $minY, $maxX, $maxY];
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

/** Communes dont les limites passent à moins de $tolerance mètres l'une de l'autre (grille de cellules). */
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

// ─── Pays : lecture des communes (tracé de travail allégé à 15 m) ───────────────────────────

$countryNames = ['BE' => 'Belgique', 'CH' => 'Suisse', 'LI' => 'Liechtenstein', 'LU' => 'Luxembourg', 'DE' => 'Allemagne', 'IT' => 'Italie',
    'AT' => 'Autriche', 'ES' => 'Espagne', 'OM' => 'Outre-mer français', 'FR' => 'France'];
$sources = [
    'BE' => 'Communes 2025 : IGN-NGI (Institut géographique national belge, licence ouverte), via ODWB',
    'CH' => 'swissBOUNDARIES3D 2026 © swisstopo (Opendata BY)', 'LI' => 'swissBOUNDARIES3D 2026 © swisstopo (Opendata BY)',
    'LU' => 'Communes : Administration du cadastre et de la topographie (data.public.lu, CC0)',
    'DE' => 'VG250 01.01. © GeoBasis-DE / BKG (dl-de/by-2-0)', 'IT' => 'Confini amministrativi 2026 © ISTAT (CC BY 4.0)',
    'AT' => 'Gemeinden 2026 © Statistik Austria – data.statistik.gv.at (CC BY 4.0)',
    'ES' => 'Recintos municipales © Instituto Geográfico Nacional – CNIG (CC BY 4.0)',
    'OM' => 'Communes d’outre-mer : IGN Admin Express via france-geojson (Licence Ouverte 2.0)',
];
$countries = [];
$add = static function (string $cc, string $code, string $name, string $county, string $state, array $polys, string $alt = '') use (&$countries): void {
    if (!$polys || $name === '') { return; }
    $polys = simplify_polygons($polys, PRESIMPLIFY_M);
    if (isset($countries[$cc][$code])) { foreach ($polys as $p) { $countries[$cc][$code]['polys'][] = $p; } return; }
    $countries[$cc][$code] = ['name' => $name, 'alt' => $alt, 'county' => $county, 'state' => $state, 'polys' => $polys];
};
$first = static fn($v): string => is_array($v) ? (string) ($v[0] ?? '') : (string) ($v ?? '');

// Belgique
$be = json_decode((string) file_get_contents("{$cache}/communes-belgique-2025.geojson"), true, 512, JSON_THROW_ON_ERROR);
foreach ($be['features'] as $f) {
    $p = $f['properties'];
    $langs = (array) ($p['mun_off_language'] ?? ['FR']);
    $lang = in_array('FR', $langs, true) ? 'fr' : strtolower((string) $langs[0]);
    $name = $first($p['mun_name_' . $lang] ?? '') ?: $first($p['mun_name_fr'] ?? '');
    $alt = array_values(array_unique(array_filter([$first($p['mun_name_fr'] ?? ''), $first($p['mun_name_nl'] ?? ''), $first($p['mun_name_de'] ?? '')], static fn($n) => $n !== '' && $n !== $name)));
    $add('BE', 'BE-' . $first($p['mun_code'] ?? ''), $name, trim((string) preg_replace("/^Province (de |du |d’|d')/u", '', $first($p['prov_name_fr'] ?? ''))),
        $first($p['reg_name_fr'] ?? ''), geojson_polygons($f['geometry'] ?? []), implode(',', $alt));
}
unset($be);

// Suisse et Liechtenstein
$gpkg = glob("{$cache}/ch/*.gpkg")[0] ?? '';
$ch = new PDO('sqlite:' . $gpkg, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$cantons = []; foreach ($ch->query('SELECT kantonsnummer, name FROM tlm_kantonsgebiet') as $r) { $cantons[(int) $r['kantonsnummer']] = $r['name']; }
$districts = []; foreach ($ch->query('SELECT bezirksnummer, name FROM tlm_bezirksgebiet') as $r) { $districts[(int) $r['bezirksnummer']] = $r['name']; }
foreach ($ch->query("SELECT bfs_nummer, name, icc, kantonsnummer, bezirksnummer, geom FROM tlm_hoheitsgebiet WHERE objektart='Gemeindegebiet' AND icc IN ('CH','LI') ORDER BY bfs_nummer") as $r) {
    $cc = $r['icc'];
    $add($cc, $cc . '-' . (int) $r['bfs_nummer'], $r['name'], $cc === 'CH' ? (string) ($districts[(int) $r['bezirksnummer']] ?? '') : '',
        $cc === 'CH' ? (string) ($cantons[(int) $r['kantonsnummer']] ?? '') : '', gpkg_polygons($r['geom'], static fn(float $x, float $y) => lv95_to_wgs84($x, $y)));
}
$ch = null;

// Luxembourg
$lu = json_decode((string) file_get_contents("{$cache}/communes-luxembourg-4326.geojson"), true, 512, JSON_THROW_ON_ERROR);
foreach ($lu['features'] as $f) { $p = $f['properties']; $add('LU', 'LU-' . $p['LAU2'], (string) $p['COMMUNE'], (string) $p['CANTON'], '', geojson_polygons($f['geometry'])); }
unset($lu);

// Allemagne (VG250 : UTM 32 ; seulement les terres, GF = 4)
$de = new PDO('sqlite:' . glob("{$cache}/de/*/DE_VG250.gpkg")[0], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$lander = []; foreach ($de->query('SELECT DISTINCT SN_L, GEN FROM vg250_lan WHERE GF=4') as $r) { $lander[$r['SN_L']] = $r['GEN']; }
$kreise = []; foreach ($de->query('SELECT DISTINCT AGS, GEN, BEZ FROM vg250_krs WHERE GF=4') as $r) { $kreise[$r['AGS']] = $r['GEN']; }
foreach ($de->query('SELECT AGS, GEN, SN_L, geom FROM vg250_gem WHERE GF=4') as $r) {
    $add('DE', 'DE-' . $r['AGS'], $r['GEN'], (string) ($kreise[substr($r['AGS'], 0, 5)] ?? ''), (string) ($lander[$r['SN_L']] ?? ''),
        gpkg_polygons($r['geom'], static fn(float $x, float $y) => utm_to_wgs84($x, $y, 32)));
}
$de = null;

// Italie (ISTAT généralisé : UTM 32 WGS84)
$itRegions = []; foreach (shapefile_records(glob("{$cache}/it/Reg*/*.shp")[0], static fn($x, $y) => [0, 0]) as [$a]) { $itRegions[(int) $a['COD_REG']] = $a['DEN_REG']; }
$itProv = []; foreach (shapefile_records(glob("{$cache}/it/ProvCM*/*.shp")[0], static fn($x, $y) => [0, 0]) as [$a]) { $itProv[(int) $a['COD_UTS']] = $a['DEN_UTS']; }
foreach (shapefile_records(glob("{$cache}/it/Com*/*.shp")[0], static fn(float $x, float $y) => utm_to_wgs84($x, $y, 32)) as [$a, $polys]) {
    $add('IT', 'IT-' . $a['PRO_COM_T'], $a['COMUNE'], (string) ($itProv[(int) $a['COD_UTS']] ?? ''), (string) ($itRegions[(int) $a['COD_REG']] ?? ''), $polys);
}

// Autriche (GPS ; Land d'après le 1er chiffre du code, district d'après GeoNames plus bas)
$atLander = [1 => 'Burgenland', 2 => 'Kärnten', 3 => 'Niederösterreich', 4 => 'Oberösterreich', 5 => 'Salzburg', 6 => 'Steiermark', 7 => 'Tirol', 8 => 'Vorarlberg', 9 => 'Wien'];
$at = json_decode((string) file_get_contents("{$cache}/communes-autriche-2026.geojson"), true, 512, JSON_THROW_ON_ERROR);
foreach ($at['features'] as $f) {
    $id = (string) $f['properties']['g_id'];
    $add('AT', 'AT-' . $id, (string) $f['properties']['g_name'], '', $atLander[(int) $id[0]] ?? '', geojson_polygons($f['geometry']));
}
unset($at);

// Espagne (CNIG : ETRS89 / REGCAN95, équivalents GPS ; NATCODE = 34 + communauté + province + code INE)
$esDir = $root . '/lineas_limite';
$esCommunities = []; $esProvinces = [];
foreach (['peninbal_etrs89', 'canarias_wgs84'] as $zone) {
    $dir = $zone === 'canarias_wgs84' ? 'SHP_WGS84' : 'SHP_ETRS89';
    foreach (shapefile_records("{$esDir}/{$dir}/recintos_autonomicas_inspire_{$zone}/recintos_autonomicas_inspire_{$zone}.shp", static fn($x, $y) => [0, 0]) as [$a]) { $esCommunities[substr($a['NATCODE'], 2, 2)] = $a['NAMEUNIT']; }
    foreach (shapefile_records("{$esDir}/{$dir}/recintos_provinciales_inspire_{$zone}/recintos_provinciales_inspire_{$zone}.shp", static fn($x, $y) => [0, 0]) as [$a]) { $esProvinces[substr($a['NATCODE'], 4, 2)] = $a['NAMEUNIT']; }
}
foreach (['peninbal_etrs89', 'canarias_wgs84'] as $zone) {
    $dir = $zone === 'canarias_wgs84' ? 'SHP_WGS84' : 'SHP_ETRS89';
    foreach (shapefile_records("{$esDir}/{$dir}/recintos_municipales_inspire_{$zone}/recintos_municipales_inspire_{$zone}.shp", static fn(float $x, float $y) => [round($x, 6), round($y, 6)]) as [$a, $polys]) {
        $nat = (string) $a['NATCODE'];
        $add('ES', 'ES-' . substr($nat, -5), (string) $a['NAMEUNIT'], (string) ($esProvinces[substr($nat, 4, 2)] ?? ''), (string) ($esCommunities[substr($nat, 2, 2)] ?? ''), $polys);
    }
}

// Outre-mer français (codes INSEE, sans préfixe)
foreach (['guadeloupe' => 'Guadeloupe', 'martinique' => 'Martinique', 'guyane' => 'Guyane', 'la-reunion' => 'La Réunion', 'mayotte' => 'Mayotte'] as $file => $region) {
    $om = json_decode((string) file_get_contents("{$cache}/communes-{$file}.geojson"), true, 512, JSON_THROW_ON_ERROR);
    foreach ($om['features'] as $f) { $add('OM', (string) $f['properties']['code'], (string) $f['properties']['nom'], $region, $region, geojson_polygons($f['geometry'])); }
}
foreach ($countries as $cc => $list) { printf("%-20s %6d communes\n", $countryNames[$cc], count($list)); }

// ─── Voisinages internes ─────────────────────────────────────────────────────────────────────
$internal = [];
foreach ($countries as $cc => $list) {
    $t = microtime(true);
    $internal[$cc] = neighbors_by_distance(array_map(static fn($c) => $c['polys'], $list), INTERNAL_M);
    printf("Voisinages en %-18s : %6d paires (%.0f s)\n", $countryNames[$cc], array_sum(array_map('count', $internal[$cc])) / 2, microtime(true) - $t);
}

// ─── Voisinages de part et d'autre des frontières ────────────────────────────────────────────
// Seules les communes proches d'un autre pays sont comparées : grille de cellules de 0,05° marquant les pays présents.
$countryOf = static fn(string $code): string => preg_match('/^([A-Z]{2})-/', $code, $m) ? $m[1] : (str_starts_with($code, '97') ? 'OM' : 'FR');
$fr = json_decode((string) file_get_contents($root . '/data/geo/communes.geojson'), true, 512, JSON_THROW_ON_ERROR);
$all = [];
foreach ($fr['features'] as $f) { $polys = geojson_polygons($f['geometry'] ?? []); if ($polys) { $all[(string) $f['properties']['code']] = simplify_polygons($polys, PRESIMPLIFY_M); } }
unset($fr);
foreach ($countries as $cc => $list) { if ($cc !== 'OM') { foreach ($list as $code => $c) { $all[$code] = $c['polys']; } } }
$cell = 0.05; $occupancy = []; $boxesAll = [];
foreach ($all as $code => $polys) {
    $b = $boxesAll[$code] = bounds($polys);
    for ($x = (int) floor($b[0] / $cell); $x <= (int) floor($b[2] / $cell); $x++) { for ($y = (int) floor($b[1] / $cell); $y <= (int) floor($b[3] / $cell); $y++) { $occupancy["{$x}:{$y}"][$countryOf((string) $code)] = true; } }
}
$candidates = [];
foreach ($boxesAll as $code => $b) {
    $mine = $countryOf((string) $code);
    for ($x = (int) floor($b[0] / $cell) - 1; $x <= (int) floor($b[2] / $cell) + 1 && !isset($candidates[$code]); $x++) {
        for ($y = (int) floor($b[1] / $cell) - 1; $y <= (int) floor($b[3] / $cell) + 1; $y++) {
            foreach ($occupancy["{$x}:{$y}"] ?? [] as $cc => $_) { if ($cc !== $mine) { $candidates[$code] = $all[$code]; break 2; } }
        }
    }
}
unset($all, $occupancy);
printf("Communes proches d'une frontière : %d\n", count($candidates));
$border = neighbors_by_distance($candidates, BORDER_M, static fn(string $a, string $b) => $countryOf($a) !== $countryOf($b));
$borderPairs = []; $byPair = [];
foreach ($border as $a => $list) {
    foreach ($list as $b => $_) {
        if (strcmp((string) $a, (string) $b) >= 0) { continue; }
        $borderPairs[] = [(string) $a, (string) $b];
        $k = implode('-', [min($countryOf((string) $a), $countryOf((string) $b)), max($countryOf((string) $a), $countryOf((string) $b))]);
        $byPair[$k] = ($byPair[$k] ?? 0) + 1;
    }
}
ksort($byPair);
foreach ($byPair as $k => $n) { echo "Voisinages entre pays {$k} : {$n} paires\n"; }

// ─── Lieux GeoNames (anciennes communes et lieux-dits en sous-nom) ───────────────────────────
function geonames_rows(string $zip, string $cc): Generator
{
    $h = fopen("zip://{$zip}#{$cc}.txt", 'r');
    if (!$h) { throw new RuntimeException("{$cc}.txt introuvable dans {$zip}"); }
    while (($line = fgets($h)) !== false) { yield explode("\t", rtrim($line, "\r\n")); }
    fclose($h);
}
/** Clé de commune GeoNames → code de nos contours, selon la façon dont chaque pays est numéroté. */
function geonames_commune_key(string $cc, array $r): ?string
{
    return match ($cc) {
        'BE' => ($r[7] ?? '') === 'ADM4' ? 'BE-' . $r[13] : null,
        'CH' => ($r[7] ?? '') === 'ADM3' ? 'CH-' . (int) $r[12] : null,
        'DE' => ($r[7] ?? '') === 'ADM4' ? 'DE-' . $r[13] : null,
        'IT' => ($r[7] ?? '') === 'ADM3' ? 'IT-' . $r[12] : null,
        'AT' => ($r[7] ?? '') === 'ADM3' ? 'AT-' . $r[12] : null,
        'ES' => ($r[7] ?? '') === 'ADM3' ? 'ES-' . $r[12] : null,
        'GP', 'MQ', 'GF', 'RE', 'YT' => ($r[7] ?? '') === 'ADM4' ? (string) $r[13] : null,
        default => null,
    };
}
function geonames_place_key(string $cc, array $r): string
{
    return match ($cc) {
        'BE', 'DE', 'GP', 'MQ', 'GF', 'RE', 'YT' => 'a4:' . ($r[13] ?? ''),
        'CH' => 'a3:' . (int) ($r[12] ?? 0), 'IT', 'AT', 'ES' => 'a3:' . ($r[12] ?? ''),
        'LU' => 'a2:' . ($r[10] ?? '') . '.' . ($r[11] ?? ''), 'LI' => 'a1:' . ($r[10] ?? ''), default => '',
    };
}
$geonamesFiles = ['BE' => ['BE'], 'CH' => ['CH'], 'LI' => ['LI'], 'LU' => ['LU'], 'DE' => ['DE'], 'IT' => ['IT'], 'AT' => ['AT'], 'ES' => ['ES'], 'OM' => ['GP', 'MQ', 'GF', 'RE', 'YT']];
$places = [];
foreach ($geonamesFiles as $cc => $files) {
    $byName = []; foreach ($countries[$cc] as $code => $c) { $byName[$fold($c['name'])] = $code; }
    // Index spatial (cellules de 0,1°) pour rattacher un lieu à la commune qui le contient
    $grid = [];
    foreach ($countries[$cc] as $code => $c) {
        $b = bounds($c['polys']);
        for ($x = (int) floor($b[0] * 10); $x <= (int) floor($b[2] * 10); $x++) { for ($y = (int) floor($b[1] * 10); $y <= (int) floor($b[3] * 10); $y++) { $grid["{$x}:{$y}"][] = $code; } }
    }
    $seen = []; $unmapped = 0; $atDistricts = [];
    foreach ($files as $gn) {
        $zip = "{$cache}/geonames-{$gn}.zip";
        $communeOf = [];
        foreach (geonames_rows($zip, $gn) as $r) {
            if (($r[6] ?? '') !== 'A') { continue; }
            if ($cc === 'AT' && ($r[7] ?? '') === 'ADM2') { $atDistricts[$r[11]] = preg_replace('/^Politischer Bezirk /u', '', $r[1]); }
            $key = geonames_commune_key($gn, $r);
            if ($key === null && $cc === 'LU' && ($r[7] ?? '') === 'ADM2') { $key = $byName[$fold($r[1])] ?? null; }
            if ($key === null && $cc === 'LI' && ($r[7] ?? '') === 'ADM1') { $key = $byName[$fold($r[1])] ?? null; }
            if ($key !== null && isset($countries[$cc][$key])) {
                $communeOf[geonames_place_key($gn, $r)] = $key;
                // Outre-mer : le fichier des contours a perdu l'article (« Abymes » pour « Les Abymes »), comme en métropole
                if ($cc === 'OM' && preg_match("/^(?:Le |La |Les |L')(.+)$/u", $r[1], $m) && $m[1] === $countries[$cc][$key]['name']) { $countries[$cc][$key]['name'] = $r[1]; }
            }
        }
        foreach (geonames_rows($zip, $gn) as $r) {
            if (($r[6] ?? '') !== 'P' || (int) ($r[0] ?? 0) === 0) { continue; }
            $code = $communeOf[geonames_place_key($gn, $r)] ?? null;
            if ($code === null) {
                [$lx, $ly] = [(float) $r[5], (float) $r[4]];
                foreach ($grid[(int) floor($lx * 10) . ':' . (int) floor($ly * 10)] ?? [] as $candidate) {
                    if (point_in_polygons($lx, $ly, $countries[$cc][$candidate]['polys'])) { $code = $candidate; break; }
                }
            }
            if ($code === null) { $unmapped++; }
            $c = $code ? $countries[$cc][$code] : null;
            $raw = $r[1];
            [$name, $sub] = ($c && $fold($c['name']) !== $fold($raw)) ? [$c['name'], $raw] : [$c['name'] ?? $raw, ''];
            $placeCountry = $cc === 'OM' ? 'France' : $countryNames[$cc];
            $places[$cc][] = [(int) $r[0], $name, $sub, $c['county'] ?? '', $c['state'] ?? '', $placeCountry, mb_substr($r[3] ?? '', 0, 500), (float) $r[4], (float) $r[5], $code ?? '', $r[7], (int) ($r[14] ?? 0)];
            if ($code) { $seen[$code] = true; }
        }
    }
    if ($cc === 'AT') { // district autrichien : d'après les 3 premiers chiffres du code de commune
        foreach ($countries['AT'] as $code => &$c) { $c['county'] = (string) ($atDistricts[substr($code, 3, 3)] ?? ''); }
        unset($c);
        foreach ($places['AT'] as &$p) { if ($p[9] !== '') { $p[3] = $countries['AT'][$p[9]]['county']; } }
        unset($p);
    }
    foreach ($countries[$cc] as $code => $c) {
        if (isset($seen[$code])) { continue; }
        $b = bounds($c['polys']);
        $places[$cc][] = [null, $c['name'], '', $c['county'], $c['state'], $cc === 'OM' ? 'France' : $countryNames[$cc], $c['alt'], round(($b[1] + $b[3]) / 2, 6), round(($b[0] + $b[2]) / 2, 6), $code, 'ADM', 0];
    }
    printf("Lieux GeoNames en %-18s : %6d (hors de toute commune : %d)\n", $countryNames[$cc], count($places[$cc]), $unmapped);
}

// ─── Écriture des fichiers ───────────────────────────────────────────────────────────────────
function write_gz(string $sqlite, string $target): void
{
    $in = fopen($sqlite, 'rb'); $gz = gzopen($target, 'wb9');
    while (!feof($in)) { gzwrite($gz, (string) fread($in, 1 << 20)); }
    fclose($in); gzclose($gz); unlink($sqlite);
    printf("→ %s (%.1f Mo)\n", basename($target), filesize($target) / 1048576);
}
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
        $ins->execute([(string) $code, $c['name'], json_encode($geometry, JSON_UNESCAPED_SLASHES), $b[0], $b[1], $b[2], $b[3], ($b[0] + $b[2]) / 2, ($b[1] + $b[3]) / 2]);
    }
    $insN = $db->prepare('INSERT OR IGNORE INTO commune_neighbors VALUES(?,?)');
    foreach ($internal[$cc] as $a => $l) { foreach ($l as $b => $_) { $insN->execute([(string) $a, (string) $b]); } }
    $insP = $db->prepare('INSERT INTO geo_places VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach ($places[$cc] as $p) { $insP->execute($p); }
    $info = $db->prepare('INSERT INTO reference_info VALUES(?,?)');
    foreach (['country' => $cc, 'country_name' => $countryNames[$cc], 'source' => $sources[$cc], 'places_source' => 'GeoNames (CC BY 4.0)',
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
