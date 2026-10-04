<?php
declare(strict_types=1);

ini_set('memory_limit', '1024M');
require __DIR__ . '/../lib/bootstrap.php';

$path = $argv[1] ?? (APP_ROOT . '/data/geo/communes-version-simplifiee.geojson');
if (!is_file($path)) {
    fwrite(STDERR, "Fichier introuvable : {$path}\n");
    exit(1);
}

$raw = file_get_contents($path);
if ($raw === false) {
    fwrite(STDERR, "Lecture impossible : {$path}\n");
    exit(1);
}

$geojson = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
unset($raw);
if (($geojson['type'] ?? '') !== 'FeatureCollection' || !is_array($geojson['features'] ?? null)) {
    fwrite(STDERR, "GeoJSON invalide : FeatureCollection attendue.\n");
    exit(1);
}

function commune_rings(array $geometry): array
{
    $type = (string) ($geometry['type'] ?? '');
    $coordinates = $geometry['coordinates'] ?? [];
    if ($type === 'Polygon') {
        return is_array($coordinates) ? $coordinates : [];
    }
    if ($type === 'MultiPolygon') {
        $rings = [];
        foreach ($coordinates as $polygon) {
            if (is_array($polygon)) {
                foreach ($polygon as $ring) {
                    if (is_array($ring)) {
                        $rings[] = $ring;
                    }
                }
            }
        }
        return $rings;
    }
    return [];
}

function commune_bounds(array $rings): array
{
    $minLon = $minLat = INF;
    $maxLon = $maxLat = -INF;
    foreach ($rings as $ring) {
        foreach ($ring as $point) {
            if (!is_array($point) || count($point) < 2) {
                continue;
            }
            $lon = (float) $point[0];
            $lat = (float) $point[1];
            $minLon = min($minLon, $lon);
            $maxLon = max($maxLon, $lon);
            $minLat = min($minLat, $lat);
            $maxLat = max($maxLat, $lat);
        }
    }
    if ($minLon === INF) {
        return [null, null, null, null, null, null];
    }
    return [$minLon, $minLat, $maxLon, $maxLat, ($minLon + $maxLon) / 2, ($minLat + $maxLat) / 2];
}

function commune_point_key(array $point): string
{
    return number_format((float) $point[0], 6, '.', '') . ',' . number_format((float) $point[1], 6, '.', '');
}

function commune_edge_key(array $a, array $b): string
{
    $ka = commune_point_key($a);
    $kb = commune_point_key($b);
    return $ka < $kb ? $ka . '|' . $kb : $kb . '|' . $ka;
}

$pdo = db();
$pdo->exec('PRAGMA foreign_keys = OFF');
$pdo->beginTransaction();
$pdo->exec('DROP TABLE IF EXISTS commune_edge_import');
$pdo->exec('CREATE TABLE commune_edge_import(edge_key TEXT NOT NULL, insee_code TEXT NOT NULL)');

$insertContour = $pdo->prepare("INSERT INTO commune_contours(insee_code,name,geometry_json,min_lon,min_lat,max_lon,max_lat,centroid_lon,centroid_lat,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(insee_code) DO UPDATE SET
        name=excluded.name,
        geometry_json=excluded.geometry_json,
        min_lon=excluded.min_lon,
        min_lat=excluded.min_lat,
        max_lon=excluded.max_lon,
        max_lat=excluded.max_lat,
        centroid_lon=excluded.centroid_lon,
        centroid_lat=excluded.centroid_lat,
        updated_at=CURRENT_TIMESTAMP");
$insertEdge = $pdo->prepare('INSERT INTO commune_edge_import(edge_key,insee_code) VALUES(?,?)');

$imported = 0;

foreach ($geojson['features'] as $feature) {
    $properties = $feature['properties'] ?? [];
    $geometry = $feature['geometry'] ?? [];
    $insee = trim((string) ($properties['code'] ?? $properties['insee'] ?? ''));
    $name = trim((string) ($properties['nom'] ?? $properties['name'] ?? ''));
    if ($insee === '' || $name === '' || !is_array($geometry)) {
        continue;
    }
    $rings = commune_rings($geometry);
    [$minLon, $minLat, $maxLon, $maxLat, $centroidLon, $centroidLat] = commune_bounds($rings);
    if ($minLon === null) {
        continue;
    }
    $insertContour->execute([
        $insee,
        $name,
        json_encode($geometry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $minLon,
        $minLat,
        $maxLon,
        $maxLat,
        $centroidLon,
        $centroidLat,
    ]);
    $imported++;

    foreach ($rings as $ring) {
        $count = count($ring);
        if ($count < 2) {
            continue;
        }
        for ($i = 0; $i < $count - 1; $i++) {
            if (!is_array($ring[$i]) || !is_array($ring[$i + 1])) {
                continue;
            }
            $key = commune_edge_key($ring[$i], $ring[$i + 1]);
            $insertEdge->execute([$key, $insee]);
        }
    }
}

unset($geojson);

$pdo->exec('CREATE INDEX idx_commune_edge_import_key ON commune_edge_import(edge_key)');
$pdo->exec('DELETE FROM commune_neighbors');
$insertNeighbor = $pdo->prepare('INSERT OR IGNORE INTO commune_neighbors(insee_code,neighbor_insee_code) VALUES(?,?)');
$ownersStmt = $pdo->query('SELECT edge_key, group_concat(DISTINCT insee_code) AS owners, count(DISTINCT insee_code) AS owner_count FROM commune_edge_import GROUP BY edge_key HAVING owner_count > 1');
while ($edge = $ownersStmt->fetch(PDO::FETCH_ASSOC)) {
    $codes = array_values(array_filter(explode(',', (string) $edge['owners'])));
    $count = count($codes);
    for ($i = 0; $i < $count; $i++) {
        for ($j = $i + 1; $j < $count; $j++) {
            $a = $codes[$i];
            $b = $codes[$j];
            $insertNeighbor->execute([$a, $b]);
            $insertNeighbor->execute([$b, $a]);
        }
    }
}
$pdo->exec('DROP TABLE commune_edge_import');
$pairs = (int) $pdo->query('SELECT count(*) FROM commune_neighbors')->fetchColumn();

$pdo->commit();
$pdo->exec('PRAGMA foreign_keys = ON');

echo "Contours importés : {$imported}\n";
echo "Relations de voisinage : {$pairs}\n";
