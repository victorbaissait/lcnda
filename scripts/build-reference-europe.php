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
 *   - Tchéquie : RÚIAN © ČÚZK (CC BY 4.0) ; Slovaquie : INSPIRE AU © ÚGKK SR (CC BY 4.0) ; Pologne : PRG © GUGiK ;
 *     Pays-Bas : Bestuurlijke Gebieden © Kadaster (CC BY 4.0) ; Slovénie : RPE © GURS (CC BY 4.0) ;
 *     Hongrie : MKH © Lechner Tudásközpont ; Québec : SDA © Gouvernement du Québec (CC BY 4.0) ;
 *   - Portugal, Croatie, Bosnie, Andorre, Monaco, Saint-Marin, Vatican : © OpenStreetMap (ODbL), par Overpass ;
 *   - lieux et anciennes communes : GeoNames <pays>.zip (CC BY 4.0) ;
 *   - France métropolitaine (seulement pour les voisinages aux frontières) : data/geo/communes.geojson.
 *
 * Codes : préfixés par le pays (« BE-57081 », « DE-08311000 ») pour ne jamais se confondre avec un code INSEE.
 * La France, outre-mer compris, garde ses codes INSEE (97101 = Les Abymes).
 *
 *   php scripts/build-reference-europe.php        (plusieurs dizaines de minutes, ~25 Go de mémoire)
 */

ini_set('memory_limit', getenv('LCNDA_BUILD_MEMORY') ?: '40G'); // ~25 Go avec tous les pays
require __DIR__ . '/../lib/text.php';
$root = dirname(__DIR__);
$cache = $root . '/vendor/geo/.cache';
$out = $root . '/data/reference';
@mkdir($out, 0775, true);

const SIMPLIFY_M = 150;   // tracés livrés (la France métropolitaine est encore plus simplifiée)
const PRESIMPLIFY_M = 15; // tracés de travail, pour calculer les voisinages sans saturer la mémoire
const INTERNAL_M = 40;    // voisines dans un même pays : limites à moins de 40 m (sources cohérentes)
const BORDER_M = 165;     // voisines de part et d'autre d'une frontière : moins de ~150 m (+ marge de travail)
const SAMPLE_M = 40;
const PLACES_LIGHT_ABOVE = 100000; // au-delà, lieux allégés (voir plus bas)      // un point tous les 40 m le long des limites

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

/** Coordonnées géographiques sur un ellipsoïde local → WGS84, par translation + rotation (Helmert, convention « position vector »). */
function helmert_to_wgs84(float $latDeg, float $lonDeg, float $a, float $invF, array $p): array
{
    $f = 1 / $invF; $e2 = $f * (2 - $f);
    $lat = deg2rad($latDeg); $lon = deg2rad($lonDeg);
    $n = $a / sqrt(1 - $e2 * sin($lat) ** 2);
    $x = $n * cos($lat) * cos($lon); $y = $n * cos($lat) * sin($lon); $z = $n * (1 - $e2) * sin($lat);
    [$tx, $ty, $tz, $rx, $ry, $rz, $s] = $p + [0, 0, 0, 0, 0, 0, 0];
    $k = 1 + $s * 1e-6; $rx = deg2rad($rx / 3600); $ry = deg2rad($ry / 3600); $rz = deg2rad($rz / 3600);
    $x2 = $tx + $k * ($x - $rz * $y + $ry * $z);
    $y2 = $ty + $k * ($rz * $x + $y - $rx * $z);
    $z2 = $tz + $k * (-$ry * $x + $rx * $y + $z);
    $A = 6378137.0; $E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);
    $pp = hypot($x2, $y2); $la = atan2($z2, $pp * (1 - $E2));
    for ($i = 0; $i < 6; $i++) { $nn = $A / sqrt(1 - $E2 * sin($la) ** 2); $la = atan2($z2 + $E2 * $nn * sin($la), $pp); }
    return [round(rad2deg(atan2($y2, $x2)), 6), round(rad2deg($la), 6)];
}

/** Tchéquie / Slovaquie : S-JTSK Křovák Est-Nord (EPSG:5514) → GPS (formules EPSG, puis Helmert S-JTSK → WGS84). */
function krovak_to_wgs84(float $e, float $n): array
{
    static $c = null;
    $a = 6377397.155; $invF = 299.1528128; $f = 1 / $invF; $e2 = $f * (2 - $f); $ee = sqrt($e2);
    if ($c === null) {
        $phiC = deg2rad(49.5); $alphaC = deg2rad(30 + 17 / 60 + 17.30311 / 3600); $phiP = deg2rad(78.5); $kp = 0.9999;
        $A = $a * sqrt(1 - $e2) / (1 - $e2 * sin($phiC) ** 2);
        $B = sqrt(1 + $e2 * cos($phiC) ** 4 / (1 - $e2));
        $g0 = asin(sin($phiC) / $B);
        $t0 = tan(M_PI / 4 + $g0 / 2) * ((1 + $ee * sin($phiC)) / (1 - $ee * sin($phiC))) ** ($ee * $B / 2) / tan(M_PI / 4 + $phiC / 2) ** $B;
        $c = compact('alphaC', 'phiP', 'B', 't0') + ['n' => sin($phiP), 'r0' => $kp * $A / tan($phiP)];
    }
    $x = -$n; $y = -$e; // Křovák classique : X vers le sud, Y vers l'ouest
    $r = hypot($x, $y); $theta = atan2($y, $x); $D = $theta / sin($c['phiP']);
    $T = 2 * (atan(($c['r0'] / $r) ** (1 / $c['n']) * tan(M_PI / 4 + $c['phiP'] / 2)) - M_PI / 4);
    $U = asin(cos($c['alphaC']) * sin($T) - sin($c['alphaC']) * cos($T) * cos($D));
    $V = asin(cos($T) * sin($D) / cos($U));
    $phi = $U;
    for ($i = 0; $i < 8; $i++) {
        $phi = 2 * (atan($c['t0'] ** (-1 / $c['B']) * tan($U / 2 + M_PI / 4) ** (1 / $c['B']) * ((1 + $ee * sin($phi)) / (1 - $ee * sin($phi))) ** ($ee / 2)) - M_PI / 4);
    }
    $lon = deg2rad(24 + 50 / 60) - $V / $c['B'];
    return helmert_to_wgs84(rad2deg($phi), rad2deg($lon), $a, $invF, [570.8, 85.7, 462.8, 4.998, 1.587, 5.261, 3.56]);
}

/** Hongrie : EOV (EPSG:23700, Hotine oblique Mercator variante B) → GPS (Helmert HD72 → WGS84). */
function eov_to_wgs84(float $e, float $n): array
{
    static $c = null;
    $a = 6378160.0; $invF = 298.247167427; $f = 1 / $invF; $e2 = $f * (2 - $f); $ee = sqrt($e2);
    if ($c === null) {
        $phiC = deg2rad(47 + 8 / 60 + 39.8174 / 3600); $lamC = deg2rad(19 + 2 / 60 + 54.8584 / 3600); $alphaC = deg2rad(90); $kc = 0.99993;
        $B = sqrt(1 + $e2 * cos($phiC) ** 4 / (1 - $e2));
        $A = $a * $B * $kc * sqrt(1 - $e2) / (1 - $e2 * sin($phiC) ** 2);
        $t0 = tan(M_PI / 4 - $phiC / 2) / ((1 - $ee * sin($phiC)) / (1 + $ee * sin($phiC))) ** ($ee / 2);
        $D = max(1.0, $B * sqrt(1 - $e2) / (cos($phiC) * sqrt(1 - $e2 * sin($phiC) ** 2)));
        $F = $D + sqrt($D * $D - 1);
        $H = $F * $t0 ** $B; $G = ($F - 1 / $F) / 2;
        $g0 = asin(sin($alphaC) / $D);
        $lam0 = $lamC - asin($G * tan($g0)) / $B;
        $uc = $A * ($lamC - $lam0); // azimut de 90° : cas particulier de la variante B
        $c = compact('A', 'B', 'H', 'g0', 'lam0', 'uc') + ['gc' => deg2rad(90)];
    }
    $v = ($e - 650000) * cos($c['gc']) - ($n - 200000) * sin($c['gc']);
    $u = ($n - 200000) * cos($c['gc']) + ($e - 650000) * sin($c['gc']) + $c['uc'];
    $Q = exp(-$c['B'] * $v / $c['A']); $S = ($Q - 1 / $Q) / 2; $T = ($Q + 1 / $Q) / 2; $V = sin($c['B'] * $u / $c['A']);
    $U = ($V * cos($c['g0']) + $S * sin($c['g0'])) / $T;
    $t = ($c['H'] / sqrt((1 + $U) / (1 - $U))) ** (1 / $c['B']);
    $chi = M_PI / 2 - 2 * atan($t);
    $phi = $chi + sin(2 * $chi) * ($e2 / 2 + 5 * $e2 ** 2 / 24 + $e2 ** 3 / 12 + 13 * $e2 ** 4 / 360)
        + sin(4 * $chi) * (7 * $e2 ** 2 / 48 + 29 * $e2 ** 3 / 240 + 811 * $e2 ** 4 / 11520)
        + sin(6 * $chi) * (7 * $e2 ** 3 / 120 + 81 * $e2 ** 4 / 1120) + sin(8 * $chi) * (4279 * $e2 ** 4 / 161280);
    $lam = $c['lam0'] - atan2($S * cos($c['g0']) - $V * sin($c['g0']), cos($c['B'] * $u / $c['A'])) / $c['B'];
    return helmert_to_wgs84(rad2deg($phi), rad2deg($lam), $a, $invF, [52.17, -71.82, -14.9]);
}

/** Pays-Bas : RD New (EPSG:28992) → GPS, formules approchées officielles (Schreutelkamp et Strang van Hees, ~1 m). */
function rd_to_wgs84(float $x, float $y): array
{
    $dx = ($x - 155000) * 1e-5; $dy = ($y - 463000) * 1e-5;
    $n = 3235.65389 * $dy - 32.58297 * $dx ** 2 - 0.2475 * $dy ** 2 - 0.84978 * $dx ** 2 * $dy - 0.0655 * $dy ** 3 - 0.01709 * $dx ** 2 * $dy ** 2
        - 0.00738 * $dx + 0.0053 * $dx ** 4 - 0.00039 * $dx ** 2 * $dy ** 3 + 0.00033 * $dx ** 4 * $dy - 0.00012 * $dx * $dy;
    $e = 5260.52916 * $dx + 105.94684 * $dx * $dy + 2.45656 * $dx * $dy ** 2 - 0.81885 * $dx ** 3 + 0.05594 * $dx * $dy ** 3 - 0.05607 * $dx ** 3 * $dy
        + 0.01199 * $dy - 0.00256 * $dx ** 3 * $dy ** 2 + 0.00128 * $dx * $dy ** 4 + 0.00022 * $dy ** 2 - 0.00022 * $dx ** 2 + 0.00026 * $dx ** 5;
    return [round(5.387206 + $e / 3600, 6), round(52.15517 + $n / 3600, 6)];
}

/** Relation OpenStreetMap (réponse Overpass « out geom ») → polygones : les chemins sont raccordés bout à bout en anneaux. */
function osm_polygons(array $rel): array
{
    $ways = ['outer' => [], 'inner' => []];
    foreach ($rel['members'] ?? [] as $m) {
        if (($m['type'] ?? '') !== 'way' || empty($m['geometry'])) { continue; }
        $pts = array_map(static fn($g) => [round((float) $g['lon'], 7), round((float) $g['lat'], 7)], $m['geometry']);
        $ways[($m['role'] ?? '') === 'inner' ? 'inner' : 'outer'][] = $pts;
    }
    $key = static fn(array $p): string => $p[0] . ',' . $p[1];
    $rings = [];
    foreach ($ways as $role => $list) {
        // Index des extrémités : chemin => ses deux bouts (raccordement en temps linéaire, même pour des milliers de tronçons)
        $byEnd = []; $used = [];
        foreach ($list as $i => $w) { $byEnd[$key($w[0])][] = $i; $byEnd[$key(end($w))][] = $i; }
        foreach ($list as $start => $first) {
            if (isset($used[$start])) { continue; }
            $used[$start] = true; $ring = $first;
            while ($key($ring[0]) !== $key(end($ring))) {
                $tail = $key(end($ring)); $next = null;
                foreach ($byEnd[$tail] ?? [] as $i) { if (!isset($used[$i])) { $next = $i; break; } }
                if ($next === null) { $ring[] = $ring[0]; break; } // anneau incomplet dans OSM : refermé tel quel
                $used[$next] = true; $w = $list[$next];
                array_pop($ring);
                $ring = array_merge($ring, $key($w[0]) === $tail ? $w : array_reverse($w));
            }
            if (count($ring) >= 4) { $rings[$role][] = $ring; }
        }
    }
    $polys = array_map(static fn($r) => [$r], $rings['outer'] ?? []);
    foreach ($rings['inner'] ?? [] as $hole) {
        foreach ($polys as $i => $poly) { if (point_in_polygons($hole[0][0], $hole[0][1], [[$poly[0]]])) { $polys[$i][] = $hole; break; } }
    }
    return $polys;
}

function geonames_rows(string $zip, string $cc): Generator
{
    $h = fopen("zip://{$zip}#{$cc}.txt", 'r');
    if (!$h) { throw new RuntimeException("{$cc}.txt introuvable dans {$zip}"); }
    while (($line = fgets($h)) !== false) { yield explode("\t", rtrim($line, "\r\n")); }
    fclose($h);
}

/** Fichier Overpass → éléments (relations). */
function osm_elements(string $file): array
{
    return json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR)['elements'] ?? [];
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
    $charset = preg_match('/^(?:CP|WINDOWS-?)?(125[0-8])$/', $cpg, $m) ? 'CP' . $m[1] : 'ISO-8859-1';
    fseek($dbf, $headerLen);
    $shpH = fopen($shp, 'rb');
    fseek($shpH, 100);
    for ($r = 0; $r < $count; $r++) {
        $rec = fread($dbf, $recordLen);
        $attrs = []; $off = 1;
        foreach ($fields as [$name, $len]) {
            $v = trim(substr($rec, $off, $len)); $off += $len;
            $attrs[$name] = $utf8 ? $v : (string) iconv($charset, 'UTF-8//IGNORE', $v);
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

/** Points le long de toutes les limites (contours extérieurs ET trous : une enclave touche la commune qui l'entoure), un tous les SAMPLE_M mètres. */
function boundary_samples(array $polys): array
{
    $pts = [];
    foreach ($polys as $poly) {
        foreach ($poly as $ring) {
        for ($i = 0, $n = count($ring) - 1; $i < $n; $i++) {
            $a = $ring[$i]; $b = $ring[$i + 1];
            $steps = max(1, (int) ceil(meters($a, $b) / SAMPLE_M));
            for ($s = 0; $s < $steps; $s++) { $t = $s / $steps; $pts[] = [$a[0] + ($b[0] - $a[0]) * $t, $a[1] + ($b[1] - $a[1]) * $t]; }
        }
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
    'AT' => 'Autriche', 'ES' => 'Espagne', 'OM' => 'Outre-mer français', 'CZ' => 'Tchéquie', 'SK' => 'Slovaquie', 'PL' => 'Pologne',
    'NL' => 'Pays-Bas', 'SI' => 'Slovénie', 'HU' => 'Hongrie', 'PT' => 'Portugal', 'HR' => 'Croatie', 'BA' => 'Bosnie-Herzégovine',
    'AD' => 'Andorre', 'MC' => 'Monaco', 'SM' => 'Saint-Marin', 'VA' => 'Vatican', 'QC' => 'Québec', 'FR' => 'France',
    'US' => 'États-Unis', 'GB' => 'Royaume-Uni', 'IE' => 'Irlande', 'FI' => 'Finlande', 'AU' => 'Australie', 'EE' => 'Estonie', 'LV' => 'Lettonie',
    'LT' => 'Lituanie', 'SE' => 'Suède', 'NO' => 'Norvège', 'IS' => 'Islande', 'DK' => 'Danemark', 'BG' => 'Bulgarie', 'GR' => 'Grèce',
    'TR' => 'Turquie', 'UA' => 'Ukraine', 'BY' => 'Biélorussie', 'GE' => 'Géorgie', 'AM' => 'Arménie', 'AZ' => 'Azerbaïdjan',
    'ME' => 'Monténégro', 'MK' => 'Macédoine du Nord', 'AL' => 'Albanie', 'XK' => 'Kosovo', 'RS' => 'Serbie', 'RO' => 'Roumanie',
    'MT' => 'Malte', 'CY' => 'Chypre', 'NZ' => 'Nouvelle-Zélande', 'MX' => 'Mexique', 'GT' => 'Guatemala', 'BZ' => 'Belize',
    'SV' => 'Salvador', 'HN' => 'Honduras', 'NI' => 'Nicaragua', 'CR' => 'Costa Rica', 'PA' => 'Panama', 'DZ' => 'Algérie', 'MA' => 'Maroc',
    'TN' => 'Tunisie', 'LB' => 'Liban', 'JO' => 'Jordanie', 'NC' => 'Nouvelle-Calédonie', 'PF' => 'Polynésie française', 'CA' => 'Canada (hors Québec)',
    'WF' => 'Wallis-et-Futuna'];
// Pays des lieux (« Québec » est une province du Canada, l'outre-mer est la France)
$placeCountryOf = static fn(string $cc): string => ['OM' => 'France', 'QC' => 'Canada', 'CA' => 'Canada', 'NC' => 'France', 'PF' => 'France', 'WF' => 'France'][$cc] ?? $countryNames[$cc];
// Grandes unités (comtés, districts, communes suédoises…) : un village garde son nom, l'unité devient le « comté » du lieu
$coarse = array_flip(['US', 'AU', 'FI', 'SE', 'NO', 'IS', 'DK', 'EE', 'BG', 'GR', 'TR', 'UA', 'GE', 'ME', 'MK', 'RS', 'NZ', 'MX', 'GT', 'HN', 'SV', 'NI', 'BZ', 'AM', 'AZ', 'LB', 'JO', 'TN']);
$sources = [
    'BE' => 'Communes 2025 : IGN-NGI (Institut géographique national belge, licence ouverte), via ODWB',
    'CH' => 'swissBOUNDARIES3D 2026 © swisstopo (Opendata BY)', 'LI' => 'swissBOUNDARIES3D 2026 © swisstopo (Opendata BY)',
    'LU' => 'Communes : Administration du cadastre et de la topographie (data.public.lu, CC0)',
    'DE' => 'VG250 01.01. © GeoBasis-DE / BKG (dl-de/by-2-0)', 'IT' => 'Confini amministrativi 2026 © ISTAT (CC BY 4.0)',
    'AT' => 'Gemeinden 2026 © Statistik Austria – data.statistik.gv.at (CC BY 4.0)',
    'ES' => 'Recintos municipales © Instituto Geográfico Nacional – CNIG (CC BY 4.0)',
    'OM' => 'Communes d’outre-mer : IGN Admin Express via france-geojson (Licence Ouverte 2.0)',
    'CZ' => 'RÚIAN © ČÚZK (CC BY 4.0)', 'SK' => 'ZBGIS – INSPIRE Administrative Units © ÚGKK SR / GKÚ (CC BY 4.0)',
    'PL' => 'Państwowy Rejestr Granic © GUGiK (données libres)', 'NL' => 'Bestuurlijke Gebieden © Kadaster / PDOK (CC BY 4.0)',
    'SI' => 'Register prostorskih enot © GURS (CC BY 4.0)', 'HU' => 'Magyarország Közigazgatási Határai © Lechner Tudásközpont',
    'QC' => 'Découpages administratifs (SDA 1:20 000) © Gouvernement du Québec (CC BY 4.0)',
    'US' => 'Cartographic Boundary Files 2024 (comtés) – U.S. Census Bureau (domaine public)',
    'GB' => 'Parishes 2026 © ONS, contains OS data © Crown copyright (OGL v3) ; civil parishes © National Records of Scotland (OGL v3)',
    'IE' => 'Civil Parishes – National Statutory Boundaries 2026 © Tailte Éireann (CC BY 4.0)',
    'FI' => 'Kunnat 2025 © Tilastokeskus / Statistics Finland (CC BY 4.0)', 'AU' => 'Local Government Areas 2024 © Australian Bureau of Statistics (CC BY 4.0)',
] + array_fill_keys(['PT', 'HR', 'BA', 'AD', 'MC', 'SM', 'VA', 'EE', 'LV', 'LT', 'SE', 'NO', 'IS', 'DK', 'BG', 'GR', 'TR', 'UA', 'BY', 'GE', 'AM', 'AZ',
    'ME', 'MK', 'AL', 'XK', 'RS', 'RO', 'MT', 'CY', 'NZ', 'MX', 'GT', 'BZ', 'SV', 'HN', 'NI', 'CR', 'PA', 'DZ', 'MA', 'TN', 'LB', 'JO', 'NC', 'PF', 'CA', 'WF'],
    '© les contributeurs d’OpenStreetMap (ODbL 1.0)');
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
// Tchéquie (RÚIAN : Křovák, S-JTSK ; districts et régions d'après leurs propres fichiers)
$czOkresy = []; foreach (shapefile_records("{$cache}/cz/1/OKRESY_P.shp", static fn($x, $y) => [0, 0]) as [$a]) { $czOkresy[$a['KOD']] = $a['NAZEV']; }
$czKraje = []; foreach (shapefile_records("{$cache}/cz/1/VUSC_P.shp", static fn($x, $y) => [0, 0]) as [$a]) { $czKraje[$a['KOD']] = $a['NAZEV']; }
foreach (shapefile_records("{$cache}/cz/1/OBCE_P.shp", static fn(float $x, float $y) => krovak_to_wgs84($x, $y)) as [$a, $polys]) {
    $add('CZ', 'CZ-' . $a['KOD'], $a['NAZEV'], (string) ($czOkresy[$a['OKRES_KOD']] ?? ''), (string) ($czKraje[$a['VUSC_KOD']] ?? ''), $polys);
}

// Slovaquie (INSPIRE : obce = 4e niveau ; district et région d'après les niveaux supérieurs)
$sk = new PDO('sqlite:' . "{$cache}/sk/INSPIRE_AU.gpkg", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$skUnits = []; foreach ($sk->query("SELECT id, name, upperLevelUnit FROM AdministrativeUnit") as $r) { $skUnits[$r['id']] = $r; }
foreach ($sk->query("SELECT nationalCode, name, upperLevelUnit, geometry FROM AdministrativeUnit WHERE nationalLevel LIKE '%4thOrder'") as $r) {
    $okres = $skUnits[$r['upperLevelUnit']] ?? null; $kraj = $okres ? ($skUnits[$okres['upperLevelUnit']] ?? null) : null;
    $add('SK', 'SK-' . $r['nationalCode'], $r['name'], trim(preg_replace('/^okres /u', '', (string) ($okres['name'] ?? '')) ?? ''),
        (string) ($kraj['name'] ?? ''), gpkg_polygons($r['geometry'], static fn(float $x, float $y) => [round($x, 6), round($y, 6)]));
}
$sk = null;

// Pologne (PRG : ETRS89 en degrés ; gmina = 6 premiers chiffres du code TERYT, comme GeoNames)
$plPowiaty = []; foreach (shapefile_records("{$cache}/pl/A02_Granice_powiatow.shp", static fn($x, $y) => [0, 0]) as [$a]) { $plPowiaty[$a['JPT_KOD_JE']] = preg_replace('/^powiat /u', '', $a['JPT_NAZWA_']); }
$plWoj = []; foreach (shapefile_records("{$cache}/pl/A01_Granice_wojewodztw.shp", static fn($x, $y) => [0, 0]) as [$a]) { $plWoj[$a['JPT_KOD_JE']] = preg_replace('/^województwo /u', '', $a['JPT_NAZWA_']); }
foreach (shapefile_records("{$cache}/pl/A03_Granice_gmin.shp", static fn(float $x, float $y) => [round($x, 6), round($y, 6)]) as [$a, $polys]) {
    $k = (string) $a['JPT_KOD_JE'];
    $add('PL', 'PL-' . substr($k, 0, 6), $a['JPT_NAZWA_'], (string) ($plPowiaty[substr($k, 0, 4)] ?? ''), (string) ($plWoj[substr($k, 0, 2)] ?? ''), $polys);
}

// Pays-Bas (Kadaster : RD New)
$nl = new PDO('sqlite:' . "{$cache}/nl/BestuurlijkeGebieden_2026.gpkg", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
foreach ($nl->query('SELECT code, naam, ligt_in_provincie_naam, geom FROM gemeentegebied') as $r) {
    $add('NL', 'NL-' . $r['code'], $r['naam'], '', (string) $r['ligt_in_provincie_naam'], gpkg_polygons($r['geom'], static fn(float $x, float $y) => rd_to_wgs84($x, $y)));
}
$nl = null;

// Slovénie (GURS, service web déjà en GPS)
$si = json_decode((string) file_get_contents("{$cache}/si/obcine.json"), true, 512, JSON_THROW_ON_ERROR);
foreach ($si['features'] as $f) { $add('SI', 'SI-' . $f['properties']['SIFRA'], (string) $f['properties']['NAZIV'], '', '', geojson_polygons($f['geometry'])); }
unset($si);

// Hongrie (Lechner : EOV ; comitat retrouvé par position)
$huCounties = []; $huSettlements = [];
foreach (shapefile_records("{$cache}/hu/AdministrativeUnits.shp", static fn(float $x, float $y) => eov_to_wgs84($x, $y)) as [$a, $polys]) {
    if ($a['namespace'] === 'HU.AU.CY') { $huCounties[$a['namn']] = $polys; }
    elseif ($a['namespace'] === 'HU.AU.ST') { $huSettlements[] = [$a, $polys]; }
}
/** Nom de la zone (parmi $areas) qui contient un point intérieur de $polys ; rectangles englobants mis en cache. */
$containing = static function (array $polys, array $areas): string {
    static $boxes = [];
    $b = bounds($polys); [$x, $y] = [($b[0] + $b[2]) / 2, ($b[1] + $b[3]) / 2];
    // Point intérieur : milieu entre le centre et un point du contour (au plus 24 essais répartis le long du contour)
    foreach ($polys as $poly) {
        $ring = $poly[0]; $step = max(1, intdiv(count($ring), 24));
        for ($i = 0, $n = count($ring); $i < $n; $i += $step) {
            [$px, $py] = [($ring[$i][0] + $x) / 2, ($ring[$i][1] + $y) / 2];
            if (point_in_polygons($px, $py, [$poly])) { [$x, $y] = [$px, $py]; break 2; }
        }
    }
    foreach ($areas as $name => $area) {
        if (!$area) { continue; }
        $k = $name . '|' . count($area) . '|' . count($area[0][0]) . '|' . implode(',', $area[0][0][0]);
        $box = $boxes[$k] ??= bounds($area);
        if ($x < $box[0] || $x > $box[2] || $y < $box[1] || $y > $box[3]) { continue; }
        if (point_in_polygons($x, $y, $area)) { return (string) $name; }
    }
    return '';
};
foreach ($huSettlements as [$a, $polys]) {
    $add('HU', 'HU-' . substr($a['shn'], 2), str_replace('_', ' ', $a['namn']), '', $containing($polys, $huCounties), $polys);
}
unset($huSettlements);

// OpenStreetMap (Portugal, Croatie, Bosnie, micro-États)
// « Језеро / Opština Jezero » → « Jezero » ; « Grad Dugo Selo » → « Dugo Selo »
$stripPrefix = static fn(string $n): string => trim((string) preg_replace('/^(Grad|Općina|Opcina|Opština|Opstina|Општина|Град)\s+/u', '',
    str_contains($n, ' / ') ? trim(substr($n, strrpos($n, ' / ') + 3)) : $n));
$ptCounty = []; $ptState = []; $ptA1 = [];
foreach (geonames_rows("{$cache}/geonames-PT.zip", 'PT') as $r) {
    if (($r[6] ?? '') !== 'A') { continue; }
    if ($r[7] === 'ADM1') { $ptA1[$r[10]] = preg_replace('/^(Distrito de |Distrito do |Região Autónoma d[aoe]s? )/u', '', $r[1]); }
    if ($r[7] === 'ADM2') { $ptCounty[$r[11]] = [$r[1], $r[10]]; }
}
foreach (osm_elements("{$cache}/osm/PT-8.json") as $e) {
    $ine = (string) ($e['tags']['ref:ine'] ?? ''); if ($ine === '') { continue; }
    [$county, $a1] = $ptCounty[substr($ine, 0, 4)] ?? ['', ''];
    $add('PT', 'PT-' . $ine, (string) $e['tags']['name'], (string) $county, (string) ($ptA1[$a1] ?? ''), osm_polygons($e));
}
$hrCounties = [];
foreach (osm_elements("{$cache}/osm/HR-6.json") as $e) { if (str_starts_with((string) ($e['tags']['ISO3166-2'] ?? ''), 'HR-')) { $hrCounties[$e['tags']['name']] = osm_polygons($e); } }
// Zagreb : ville au rang de comitat (niveau 4), sans commune en dessous
foreach (osm_elements("{$cache}/osm/HR-6.json") as $e) { if (($e['tags']['ISO3166-2'] ?? '') === 'HR-21') { $add('HR', 'HR-' . $e['id'], 'Zagreb', 'Grad Zagreb', '', osm_polygons($e)); } }
foreach (osm_elements("{$cache}/osm/HR-7.json") as $e) {
    if (str_contains((string) $e['tags']['name'], 'Upravna enota')) { continue; } // unité slovène (Piran) captée par la zone croate
    $polys = osm_polygons($e);
    $add('HR', 'HR-' . $e['id'], $stripPrefix((string) $e['tags']['name']), $containing($polys, $hrCounties), '', $polys);
}
$baMunicipalities = [];
foreach (osm_elements("{$cache}/osm/BA-7.json") as $e) {
    if (str_starts_with((string) $e['tags']['name'], 'MZ ')) { continue; } // « mjesna zajednica » (quartier) mal rangé dans OSM
    $polys = osm_polygons($e); $baMunicipalities[] = $polys; $add('BA', 'BA-' . $e['id'], $stripPrefix((string) $e['tags']['name']), '', '', $polys); }
foreach (osm_elements("{$cache}/osm/BA-68.json") as $e) {
    if (($e['tags']['admin_level'] ?? '') !== '6') { continue; }
    $city = osm_polygons($e);
    $split = false; // ville déjà découpée en communes (Sarajevo, Istočno Sarajevo) : on garde les communes
    foreach ($baMunicipalities as $m) { if ($containing($m, ['in' => $city]) === 'in') { $split = true; break; } }
    if (!$split) { $add('BA', 'BA-' . $e['id'], $stripPrefix((string) $e['tags']['name']), '', '', $city); }
}
foreach (osm_elements("{$cache}/osm/BA-BRC.json") as $e) { $add('BA', 'BA-' . $e['id'], 'Brčko', '', '', osm_polygons($e)); } // district à statut propre
foreach (osm_elements("{$cache}/osm/AD-7.json") as $e) { $add('AD', 'AD-' . $e['id'], (string) $e['tags']['name'], '', '', osm_polygons($e)); }
foreach (osm_elements("{$cache}/osm/MC-8.json") as $e) { $add('MC', 'MC-' . $e['id'], 'Monaco', '', '', osm_polygons($e)); }
foreach (osm_elements("{$cache}/osm/VA-2.json") as $e) { if (($e['tags']['ISO3166-1'] ?? '') === 'VA') { $add('VA', 'VA-' . $e['id'], 'Città del Vaticano', '', '', osm_polygons($e)); } }
$smCountry = []; foreach (osm_elements("{$cache}/osm/SM-2.json") as $e) { $smCountry = osm_polygons($e); }
foreach (osm_elements("{$cache}/osm/SM-8.json") as $e) {
    $polys = osm_polygons($e);
    if ($polys && $containing($polys, ['SM' => $smCountry]) === 'SM') { $add('SM', 'SM-' . $e['id'], (string) $e['tags']['name'], '', '', $polys); }
}

// Québec (SDA 1:20 000 : NAD83, équivalent GPS ; municipalités, territoires non organisés et réserves)
$qc = new PDO('sqlite:' . "{$cache}/qc/SDA.gpkg", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
foreach ($qc->query('SELECT MUS_CO_GEO, MUS_NM_MUN, MUS_NM_MRC, geom FROM munic_s') as $r) {
    $add('QC', 'QC-' . $r['MUS_CO_GEO'], (string) $r['MUS_NM_MUN'], (string) $r['MUS_NM_MRC'], 'Québec', gpkg_polygons($r['geom'], static fn(float $x, float $y) => [round($x, 6), round($y, 6)]));
}
$qc = null;
// ─── Autres continents et reste de l'Europe ───

// États-Unis : comtés (Census Bureau, NAD83 ≈ GPS)
foreach (shapefile_records("{$cache}/us/cb_2024_us_county_500k.shp", static fn(float $x, float $y) => [round($x, 6), round($y, 6)]) as [$a, $polys]) {
    $add('US', 'US-' . $a['GEOID'], $a['NAMELSAD'], '', $a['STATE_NAME'], $polys);
}
// Finlande : communes (Statistics Finland, service web en GPS ; nom finnois, nom suédois en variante)
$fi = json_decode((string) file_get_contents("{$cache}/fi/kunnat.json"), true, 512, JSON_THROW_ON_ERROR);
foreach ($fi['features'] as $f) { $p = $f['properties']; $add('FI', 'FI-' . $p['kunta'], $p['nimi'], '', '', geojson_polygons($f['geometry']), $p['namn'] !== $p['nimi'] ? (string) $p['namn'] : ''); }
unset($fi);
// Australie : collectivités locales (ABS, GDA2020 ≈ GPS) ; les zones « non incorporées » ou sans adresse sont gardées
foreach (shapefile_records("{$cache}/au/LGA_2024_AUST_GDA2020.shp", static fn(float $x, float $y) => [round($x, 6), round($y, 6)]) as [$a, $polys]) {
    $add('AU', 'AU-' . $a['LGA_CODE24'], (string) $a['LGA_NAME24'], '', (string) $a['STE_NAME21'], $polys);
}
// Irlande : paroisses civiles (Tailte Éireann) ; une paroisse coupée par une limite de comté est regroupée par son identifiant
$ieCounties = []; foreach (osm_elements("{$cache}/osm/IE-6.json") as $e) { $ieCounties[preg_replace('/^County /u', '', (string) ($e['tags']['name:en'] ?? $e['tags']['name']))] = osm_polygons($e); }
foreach (glob("{$cache}/ie/parishes-*.geojson") as $file) {
    foreach (json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR)['features'] as $f) {
        $p = $f['properties']; $polys = geojson_polygons($f['geometry'] ?? []);
        if (!$polys) { continue; }
        $name = mb_convert_case(trim((string) preg_replace('/^Part of /i', '', (string) $p['ENG_NAME_VALUE'])), MB_CASE_TITLE);
        $add('IE', 'IE-' . (int) $p['BDY_ID'], $name, $containing($polys, $ieCounties), '', $polys, trim((string) preg_replace('/^Cuid de /u', '', (string) $p['GLE_NAME_VALUE'])));
    }
}
// Royaume-Uni : paroisses d'Angleterre et du pays de Galles (ONS) et paroisses civiles d'Écosse (NRS)
foreach (glob("{$cache}/gb/parishes-*.geojson") as $file) {
    foreach (json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR)['features'] as $f) {
        $p = $f['properties'];
        $welsh = trim((string) $p['PARNCP26NW']);
        $add('GB', 'GB-' . $p['PARNCP26CD'], (string) $p['PARNCP26NM'], (string) $p['LAD26NM'], str_starts_with((string) $p['PARNCP26CD'], 'W') ? 'Wales' : 'England',
            geojson_polygons($f['geometry'] ?? []), $welsh !== '' && $welsh !== $p['PARNCP26NM'] ? $welsh : '');
    }
}
foreach (glob("{$cache}/gb/scotland-parishes-*.geojson") as $file) {
    foreach (json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR)['features'] as $f) {
        $add('GB', 'GB-SCP' . $f['properties']['code'], (string) $f['properties']['name'], '', 'Scotland', geojson_polygons($f['geometry'] ?? []));
    }
}

// Pays décrits par OpenStreetMap : [fichier, niveau des communes, niveaux qui comblent les vides, niveau « comté », niveau « région »]
$osmCountries = [
    'EE' => ['EE-76', '7', [], '6', ''], 'SE' => ['SE-74', '7', [], '', '4'], 'NO' => ['NO-74', '7', [], '', '4'], 'IS' => ['IS-65', '6', [], '', '5'],
    'DK' => ['DK-74', '7', [], '', '4'], 'BG' => ['BG-54', '5', [], '', '4'], 'GR' => ['GR-75', '7', [], '', '5'], 'TR' => ['TR-64', '6', [], '', '4'],
    'UA' => ['UA-74', '7', [], '', '4'], 'GE' => ['GE-64', '6', [], '', '4'], 'ME' => ['ME-6', '6', [], '', ''], 'MK' => ['MK-7', '7', [], '', ''],
    'AL' => ['AL-86', '8', ['6'], '6', ''], 'RS' => ['RS-876', '8', ['7'], '6', ''], 'LT' => ['LT-654', '6', ['5'], '5', '4'],
    'LV' => ['LV-875', '8', ['7', '5'], '5', ''], 'RO' => ['RO-84', '8', [], '4', ''], 'MT' => ['MT-8', '8', [], '', ''], 'CY' => ['CY-86', '8', ['6'], '6', ''],
    'NZ' => ['NZ-64', '6', [], '', '4'], 'MX' => ['MX-64', '6', [], '', '4'], 'GT' => ['GT-64', '6', [], '', '4'], 'HN' => ['HN-64', '6', [], '', '4'],
    'SV' => ['SV-64', '6', [], '', '4'], 'NI' => ['NI-64', '6', [], '', '4'], 'CR' => ['CR-864', '8', ['6'], '6', '4'], 'PA' => ['PA-864', '8', ['6'], '6', '4'],
    'DZ' => ['DZ-84', '8', [], '', '4'], 'MA' => ['MA-84', '8', [], '', '4'], 'BY' => ['BY-864', '8', ['6'], '6', '4'],
    'AM' => ['AM-54', '5', [], '', '4'], 'AZ' => ['AZ-6', '6', [], '', ''], 'XK' => ['XK-65', '6', [], '5', ''], 'TN' => ['TN-54', '5', [], '', '4'],
    'LB' => ['LB-754', '7', ['5'], '5', '4'], 'JO' => ['JO-654', '6', ['5'], '5', '4'], 'BZ' => ['BZ-4', '4', [], '', ''],
    'NC' => ['FR-NC-8', '8', [], '', ''], 'PF' => ['FR-PF-8', '8', [], '', ''], 'WF' => ['FR-WF-87', '8', ['7'], '', ''],
    // Canada hors Québec (le Québec vient de sa source officielle) : une province par fichier, « CA-NB-86 »…
    'CA' => ['CA-*-86', '8', ['6'], '6', ''],
];
// Organisation propre à chaque province dans OSM : [niveaux des communes (tous gardés), niveaux qui comblent les vides]
$caLevels = ['NB' => [['8'], []], 'NS' => [['6'], []], 'PE' => [['8'], ['6']], 'ON' => [['8'], ['6']], 'MB' => [['6'], []], 'NL' => [['6'], []],
    'SK' => [['8', '6'], []], 'AB' => [['6'], []], 'BC' => [['6'], []]];
$caProvinces = ['NB' => 'Nouveau-Brunswick', 'NS' => 'Nouvelle-Écosse', 'PE' => 'Île-du-Prince-Édouard', 'ON' => 'Ontario', 'MB' => 'Manitoba',
    'NL' => 'Terre-Neuve-et-Labrador', 'SK' => 'Saskatchewan', 'AB' => 'Alberta', 'BC' => 'Colombie-Britannique'];
/** Translittération officielle du cyrillique : ukrainien (KMU 2010), bulgare (2009), sinon russe/biélorusse simplifié. */
function cyrillic_to_latin(string $text, string $lang): string
{
    $map = ['а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'ґ' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'e', 'є' => 'ie', 'ж' => 'zh', 'з' => 'z',
        'и' => 'i', 'і' => 'i', 'ї' => 'i', 'й' => 'i', 'к' => 'k', 'л' => 'l', 'м' => 'm', 'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r',
        'с' => 's', 'т' => 't', 'у' => 'u', 'ў' => 'u', 'ф' => 'f', 'х' => 'kh', 'ц' => 'ts', 'ч' => 'ch', 'ш' => 'sh', 'щ' => 'shch', 'ъ' => '',
        'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'iu', 'я' => 'ia', '’' => '', 'ʼ' => '', "'" => ''];
    if ($lang === 'uk') { $map = ['г' => 'h', 'и' => 'y', 'й' => 'i'] + $map; }
    if ($lang === 'bg') { $map = ['щ' => 'sht', 'ъ' => 'a', 'ю' => 'yu', 'я' => 'ya', 'й' => 'y', 'х' => 'h', 'ь' => 'y'] + $map; }
    $out = '';
    foreach (mb_str_split($text) as $i => $ch) {
        $lower = mb_strtolower($ch);
        if (!isset($map[$lower])) { $out .= $ch; continue; }
        $latin = $map[$lower];
        // ukrainien : є, ї, ю, я, й en début de mot s'écrivent ye, yi, yu, ya, y
        if ($lang === 'uk' && ($i === 0 || !preg_match('/\p{L}/u', mb_substr($text, $i - 1, 1)))) {
            $latin = ['є' => 'ye', 'ї' => 'yi', 'ю' => 'yu', 'я' => 'ya', 'й' => 'y'][$lower] ?? $latin;
        }
        $out .= $lower !== $ch ? mb_convert_case($latin, MB_CASE_TITLE) : $latin;
    }
    return $out;
}
/** Nom lisible : écriture latine telle quelle, sinon nom français, latin ou anglais, sinon translittéré (le nom local reste en variante). */
$osmName = static function (array $tags, string $cc = '') use ($stripPrefix): array {
    $local = trim((string) ($tags['name'] ?? ''));
    $clean = static fn(string $n): string => trim((string) preg_replace(['/^(Municipality of|Municipalité de|Municipalité d’|Municipalité d\'|Municipio de|Municipio|Distrito de|Dimos|Comuna|Oraș|Orașul|Municipiul)\s+/u',
        '/\s+(kommun|kommune|municipality|municipal district|community)$/iu'], '', $stripPrefix($n)));
    $latin = static fn(string $n): bool => (bool) preg_match('/^[\p{Latin}\p{Common}\p{Inherited}]+$/u', $n);
    if ($local !== '' && $latin($local)) { return [$clean($local), '']; }
    foreach (['name:fr', 'name:sr-Latn', 'name:en', 'int_name', 'name:latin', 'name:uk-Latn', 'name:be-Latn', 'name:bg-Latn'] as $k) {
        if (!empty($tags[$k]) && $latin((string) $tags[$k])) { return [$clean((string) $tags[$k]), $local]; }
    }
    if (preg_match('/\p{Cyrillic}/u', $local)) { return [$clean(cyrillic_to_latin($local, ['UA' => 'uk', 'BG' => 'bg'][$cc] ?? 'ru')), $local]; }
    return [$clean($local), ''];
};
foreach ($osmCountries as $cc => [$file, $level, $fill, $countyLevel, $stateLevel]) {
  $paths = glob("{$cache}/osm/{$file}.json");
  if (!$paths) { echo "  (pas de fichier {$file}.json : {$countryNames[$cc]} ignoré)\n"; continue; }
  foreach ($paths as $path) {
    $fixedState = $cc === 'CA' && preg_match('/CA-([A-Z]{2})-/', $path, $pm) ? ($caProvinces[$pm[1]] ?? '') : '';
    // La zone d'Overpass renvoie aussi les unités des pays voisins qui touchent la frontière : on ne garde que celles dont
    // un point intérieur est dans le contour du pays (ou de la province).
    $outlineKey = $cc === 'CA' ? 'CA-' . ($pm[1] ?? '') : $cc;
    $outline = [];
    // Îles (Nouvelle-Calédonie, Polynésie, Wallis-et-Futuna) : aucun voisin terrestre, et leur contour OSM n'englobe pas toutes les îles
    if (!in_array($cc, ['NC', 'PF', 'WF'], true)) {
        foreach (is_file("{$cache}/osm/{$outlineKey}-pays.json") ? osm_elements("{$cache}/osm/{$outlineKey}-pays.json") : [] as $e) { foreach (osm_polygons($e) as $poly) { $outline[] = $poly; } }
        if (!$outline) { echo "  (contour de {$outlineKey} absent : unités non filtrées)\n"; }
    }
    $fineLevels = [$level];
    if ($cc === 'CA' && isset($caLevels[$pm[1] ?? ''])) { [$fineLevels, $fill] = $caLevels[$pm[1]]; }
    $outside = 0;
    $byLevel = [];
    foreach (osm_elements($path) as $e) { $byLevel[(string) ($e['tags']['admin_level'] ?? '')][] = $e; }
    $parents = static function (string $l) use (&$byLevel, $osmName, $cc): array {
        $out = []; foreach ($byLevel[$l] ?? [] as $e) { $out[$osmName($e['tags'], $cc)[0]] = osm_polygons($e); } return $out;
    };

    $counties = $countyLevel !== '' && !in_array($countyLevel, $fineLevels, true) ? $parents($countyLevel) : [];
    $states = $stateLevel !== '' ? $parents($stateLevel) : [];
    $kept = [];
    foreach ([...$fineLevels, ...$fill] as $i => $l) {
        foreach ($byLevel[$l] ?? [] as $e) {
            $polys = osm_polygons($e);
            if (!$polys) { continue; }
            if ($outline && $containing($polys, ['in' => $outline]) !== 'in') { $outside++; continue; }
            if ($i >= count($fineLevels)) { // niveau supérieur : seulement là où aucune commune n'existe (grandes villes non découpées…)
                $covered = false;
                foreach ($kept as $k) { if ($containing($k, ['in' => $polys]) === 'in') { $covered = true; break; } }
                if ($covered) { continue; }
            }
            [$name, $alt] = $osmName($e['tags'], $cc);
            $code = in_array($cc, ['NC', 'PF', 'WF'], true) && !empty($e['tags']['ref:INSEE']) ? $cc . '-' . $e['tags']['ref:INSEE'] : $cc . '-' . $e['id'];
            $add($cc, $code, $name, $counties ? $containing($polys, $counties) : '', $fixedState ?: ($states ? $containing($polys, $states) : ''), $polys, $alt);
            $kept[] = $polys;
        }
    }
    if ($outside) { echo "  {$outlineKey} : {$outside} unité(s) d'un pays voisin écartée(s)\n"; }
  }
}
foreach (['FR-PM' => 'Saint-Pierre-et-Miquelon', 'FR-BL' => 'Saint-Barthélemy', 'FR-MF' => 'Saint-Martin'] as $file => $territory) {
    foreach (is_file("{$cache}/osm/{$file}-8.json") ? osm_elements("{$cache}/osm/{$file}-8.json") : [] as $e) {
        $insee = (string) ($e['tags']['ref:INSEE'] ?? '');
        if (preg_match('/^97[578]\d\d$/', $insee)) { $add('OM', $insee, (string) $e['tags']['name'], $territory, $territory, osm_polygons($e)); }
    }
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
        'CZ', 'SK', 'PL', 'PT' => ($r[7] ?? '') === 'ADM3' ? $cc . '-' . $r[12] : null,
        'NL' => ($r[7] ?? '') === 'ADM2' ? 'NL-' . $r[11] : null,
        default => null,
    };
}
function geonames_place_key(string $cc, array $r): string
{
    return match ($cc) {
        'BE', 'DE', 'GP', 'MQ', 'GF', 'RE', 'YT' => 'a4:' . ($r[13] ?? ''),
        'CH' => 'a3:' . (int) ($r[12] ?? 0), 'IT', 'AT', 'ES', 'CZ', 'SK', 'PL', 'PT' => 'a3:' . ($r[12] ?? ''), 'NL' => 'a2:' . ($r[11] ?? ''),
        'LU' => 'a2:' . ($r[10] ?? '') . '.' . ($r[11] ?? ''), 'LI' => 'a1:' . ($r[10] ?? ''), default => '',
    };
}
$geonamesFiles = ['BE' => ['BE'], 'CH' => ['CH'], 'LI' => ['LI'], 'LU' => ['LU'], 'DE' => ['DE'], 'IT' => ['IT'], 'AT' => ['AT'], 'ES' => ['ES'], 'OM' => ['GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'BL', 'MF'],
    'CZ' => ['CZ'], 'SK' => ['SK'], 'PL' => ['PL'], 'NL' => ['NL'], 'SI' => ['SI'], 'HU' => ['HU'], 'PT' => ['PT'], 'HR' => ['HR'], 'BA' => ['BA'],
    'AD' => ['AD'], 'MC' => ['MC'], 'SM' => ['SM'], 'VA' => ['VA'], 'QC' => ['CA']];
foreach (array_keys($countries) as $cc) { if (!isset($geonamesFiles[$cc]) && is_file("{$cache}/geonames-{$cc}.zip")) { $geonamesFiles[$cc] = [$cc]; } }
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
            if (($r[6] ?? '') !== 'A' || ($cc === 'QC' && ($r[10] ?? '') !== '10') || ($cc === 'CA' && ($r[10] ?? '') === '10')) { continue; }
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
            if (($r[6] ?? '') !== 'P' || (int) ($r[0] ?? 0) === 0 || ($cc === 'QC' && ($r[10] ?? '') !== '10') || ($cc === 'CA' && ($r[10] ?? '') === '10')) { continue; }
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
            if (isset($coarse[$cc])) { // grande unité : « Chicago, Cook County, Illinois »
                [$name, $sub, $county] = [$raw, '', $c['name'] ?? ''];
            } else {
                [$name, $sub] = ($c && $fold($c['name']) !== $fold($raw)) ? [$c['name'], $raw] : [$c['name'] ?? $raw, ''];
                $county = $c['county'] ?? '';
            }
            $placeCountry = $placeCountryOf($cc);
            $places[$cc][] = [(int) $r[0], $name, $sub, $county, $c['state'] ?? '', $placeCountry, mb_substr($r[3] ?? '', 0, 500), (float) $r[4], (float) $r[5], $code ?? '', $r[7], (int) ($r[14] ?? 0)];
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
        $places[$cc][] = [null, $c['name'], '', $c['county'], $c['state'], $placeCountryOf($cc), $c['alt'], round(($b[1] + $b[3]) / 2, 6), round(($b[0] + $b[2]) / 2, 6), $code, 'ADM', 0];
    }
    // Très grands pays (> 100 000 lieux) : seulement les lieux principaux sont copiés dans les bases (« lieux allégés ») ; les
    // hameaux sans population connue et les quartiers restent proposés à la saisie par le répertoire mondial (geo-world).
    $all = count($places[$cc]);
    if ($all > PLACES_LIGHT_ABOVE) {
        $places[$cc] = array_values(array_filter($places[$cc], static fn(array $p): bool => $p[0] === null || $p[11] > 0
            || in_array($p[10], ['PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLG', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH', 'ADM'], true)));
        printf("  lieux allégés : %d sur %d gardés\n", count($places[$cc]), $all);
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

// ─── Catalogue (livré avec l'application) ───
require __DIR__ . '/build-catalogue.php';
