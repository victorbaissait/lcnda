<?php
declare(strict_types=1);

/**
 * Fabrique le fichier de données de référence livré avec LCNDA : data/reference/geo-fr.sqlite.gz
 * À partir des SOURCES PUBLIQUES uniquement (jamais d'une généalogie) :
 *   - contours des communes : communes-version-simplifiee.geojson (france-geojson, données IGN / Etalab,
 *     Licence Ouverte 2.0) → tables commune_contours + commune_neighbors (communes qui se touchent) ;
 *   - communes et lieux-dits : FR.zip de GeoNames (CC BY 4.0, https://www.geonames.org) → table geo_places.
 *
 *   php scripts/build-reference.php <communes.geojson> [<FR.zip>]
 */

ini_set('memory_limit', '2048M');
[$geojsonPath, $geonamesZip] = [$argv[1] ?? '', $argv[2] ?? ''];
if (!is_file($geojsonPath)) { fwrite(STDERR, "Usage : php scripts/build-reference.php <communes.geojson> [<FR.zip>]\n"); exit(1); }
$outDir = dirname(__DIR__) . '/data/reference';
@mkdir($outDir, 0775, true);
$tmp = sys_get_temp_dir() . '/lcnda-reference-' . bin2hex(random_bytes(4)) . '.sqlite';
$db = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF');
$db->exec("CREATE TABLE reference_info (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
$db->exec("CREATE TABLE commune_contours (insee_code TEXT PRIMARY KEY, name TEXT NOT NULL, geometry_json TEXT NOT NULL,
    min_lon REAL, min_lat REAL, max_lon REAL, max_lat REAL, centroid_lon REAL, centroid_lat REAL)");
$db->exec("CREATE TABLE commune_neighbors (insee_code TEXT NOT NULL, neighbor_insee_code TEXT NOT NULL, PRIMARY KEY(insee_code, neighbor_insee_code))");
$db->exec("CREATE TABLE geo_places (geoname_id INTEGER PRIMARY KEY, name TEXT, subdivision TEXT, county TEXT, state TEXT, country TEXT,
    alternate_names TEXT, latitude REAL, longitude REAL, admin1_code TEXT, admin2_code TEXT, admin3_code TEXT, admin4_code TEXT,
    feature_code TEXT, population INTEGER)");
$info = $db->prepare('INSERT INTO reference_info(key,value) VALUES(?,?)');

// ── Contours et voisinages ──
$geojson = json_decode((string) file_get_contents($geojsonPath), true, 512, JSON_THROW_ON_ERROR);
$rings = static function (array $g): array {
    $c = $g['coordinates'] ?? [];
    if (($g['type'] ?? '') === 'Polygon') { return $c; }
    if (($g['type'] ?? '') === 'MultiPolygon') { $r = []; foreach ($c as $poly) { foreach ($poly as $ring) { $r[] = $ring; } } return $r; }
    return [];
};
$key = static fn(array $p): string => number_format((float) $p[0], 6, '.', '') . ',' . number_format((float) $p[1], 6, '.', '');
$insertContour = $db->prepare('INSERT OR REPLACE INTO commune_contours VALUES(?,?,?,?,?,?,?,?,?)');
$edges = [];
$db->beginTransaction();
$contours = 0;
foreach ($geojson['features'] as $f) {
    $p = $f['properties'] ?? [];
    $insee = trim((string) ($p['code'] ?? $p['insee'] ?? ''));
    $name = trim((string) ($p['nom'] ?? $p['name'] ?? ''));
    $rs = $rings($f['geometry'] ?? []);
    if ($insee === '' || $name === '' || !$rs) { continue; }
    $minLon = $minLat = INF; $maxLon = $maxLat = -INF;
    foreach ($rs as $ring) {
        $n = count($ring);
        foreach ($ring as $i => $pt) {
            $minLon = min($minLon, (float) $pt[0]); $maxLon = max($maxLon, (float) $pt[0]);
            $minLat = min($minLat, (float) $pt[1]); $maxLat = max($maxLat, (float) $pt[1]);
            if ($i < $n - 1) {
                [$a, $b] = [$key($pt), $key($ring[$i + 1])];
                $edges[$a < $b ? "$a|$b" : "$b|$a"][$insee] = true;
            }
        }
    }
    $insertContour->execute([$insee, $name, json_encode($f['geometry'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $minLon, $minLat, $maxLon, $maxLat, ($minLon + $maxLon) / 2, ($minLat + $maxLat) / 2]);
    $contours++;
}
unset($geojson);
$insertNeighbor = $db->prepare('INSERT OR IGNORE INTO commune_neighbors VALUES(?,?)');
foreach ($edges as $owners) {
    if (count($owners) < 2) { continue; }
    $codes = array_keys($owners);
    foreach ($codes as $a) { foreach ($codes as $b) { if ($a !== $b) { $insertNeighbor->execute([(string) $a, (string) $b]); } } }
}
unset($edges);
$db->commit();
$info->execute(['contours_source', basename($geojsonPath) . ' (france-geojson, IGN / Etalab, Licence Ouverte 2.0)']);
$info->execute(['contours_sha256', hash_file('sha256', $geojsonPath)]);

// ── GeoNames : communes et lieux habités de France ──
$places = 0;
if ($geonamesZip !== '' && is_file($geonamesZip)) {
    $features = ['PPL' => 1, 'PPLA' => 1, 'PPLA2' => 1, 'PPLA3' => 1, 'PPLA4' => 1, 'PPLA5' => 1, 'PPLC' => 1, 'PPLX' => 1];
    $norm = static function (string $v): string {
        $v = mb_strtolower(trim($v));
        $v = strtr($v, ['à'=>'a','â'=>'a','ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','î'=>'i','ï'=>'i','ô'=>'o','ö'=>'o','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','œ'=>'oe','æ'=>'ae','ÿ'=>'y']);
        return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $v));
    };
    $read = static function () use ($geonamesZip) { $h = fopen('zip://' . $geonamesZip . '#FR.txt', 'r'); if (!$h) { throw new RuntimeException('FR.txt introuvable dans ' . $geonamesZip); } return $h; };
    $maps = ['admin1' => [], 'admin2' => [], 'admin4' => []];
    $h = $read();
    while (($line = fgets($h)) !== false) {
        $r = explode("\t", rtrim($line, "\r\n"));
        if (($r[6] ?? '') !== 'A') { continue; }
        [$feature, $a1, $a2, $a3, $a4] = [$r[7] ?? '', $r[10] ?? '', $r[11] ?? '', $r[12] ?? '', $r[13] ?? ''];
        if ($feature === 'ADM1') { $maps['admin1'][$a1] = $r[1]; }
        elseif ($feature === 'ADM2') { $maps['admin2']["$a1.$a2"] = preg_replace('/^Département du? /u', '', $r[1]) ?: $r[1]; }
        elseif ($feature === 'ADM4') { $maps['admin4']["$a1.$a2.$a3.$a4"] = $r[1]; }
    }
    fclose($h);
    $insertPlace = $db->prepare('INSERT OR IGNORE INTO geo_places VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $db->beginTransaction();
    $h = $read();
    while (($line = fgets($h)) !== false) {
        $r = explode("\t", rtrim($line, "\r\n"));
        if (($r[6] ?? '') !== 'P' || !isset($features[$r[7] ?? ''])) { continue; }
        [$raw, $a1, $a2, $a3, $a4] = [$r[1] ?? '', $r[10] ?? '', $r[11] ?? '', $r[12] ?? '', $r[13] ?? ''];
        if ((int) $r[0] === 0 || $raw === '') { continue; }
        // Un lieu-dit prend le nom de sa commune, son propre nom va en « subdivision » (comme l'import d'origine)
        $commune = $maps['admin4']["$a1.$a2.$a3.$a4"] ?? '';
        [$name, $sub] = ($commune !== '' && $norm($commune) !== $norm($raw)) ? [$commune, $raw] : [$raw, ''];
        $insertPlace->execute([(int) $r[0], $name, $sub, $maps['admin2']["$a1.$a2"] ?? '', $maps['admin1'][$a1] ?? '', 'France',
            $r[3] ?? '', (float) $r[4], (float) $r[5], $a1, $a2, $a3, $a4, $r[7], (int) ($r[14] ?? 0)]);
        $places++;
    }
    fclose($h);
    $db->commit();
    $info->execute(['geonames_source', 'GeoNames FR.zip (CC BY 4.0, https://www.geonames.org)']);
    $info->execute(['geonames_sha256', hash_file('sha256', $geonamesZip)]);
}
$info->execute(['built_at', date(DATE_ATOM)]);
$info->execute(['version', date('Ymd')]);
$db->exec('VACUUM');
$db = null;

$out = $outDir . '/geo-fr.sqlite.gz';
$in = fopen($tmp, 'rb'); $gz = gzopen($out, 'wb9');
while (!feof($in)) { gzwrite($gz, (string) fread($in, 1 << 20)); }
fclose($in); gzclose($gz);
printf("Contours : %d communes · voisinages calculés · lieux GeoNames : %d\n→ %s (%.1f Mo)\n", $contours, $places, $out, filesize($out) / 1048576);
unlink($tmp);
