<?php
declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';

ini_set('memory_limit', '512M');

const FR_ZIP = APP_ROOT . '/geo/FR.zip';
const FR_ENTRY = 'FR.txt';
const CITY_FEATURES = ['PPL'=>true,'PPLA'=>true,'PPLA2'=>true,'PPLA3'=>true,'PPLA4'=>true,'PPLA5'=>true,'PPLC'=>true,'PPLX'=>true];

function geo_norm(string $value): string
{
    $value = mb_strtolower(trim($value));
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if ($ascii !== false) $value = $ascii;
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $value));
}

function geo_stream()
{
    $path = 'zip://' . FR_ZIP . '#' . FR_ENTRY;
    $handle = fopen($path, 'r');
    if (!$handle) {
        throw new RuntimeException('Impossible de lire ' . FR_ZIP . '.');
    }
    return $handle;
}

function read_admin_maps(): array
{
    $maps = ['admin1'=>[], 'admin2'=>[], 'admin3'=>[], 'admin4'=>[]];
    $handle = geo_stream();
    while (($line = fgets($handle)) !== false) {
        $row = explode("\t", rtrim($line, "\r\n"));
        if (($row[6] ?? '') !== 'A') continue;
        $name = $row[1] ?? '';
        $feature = $row[7] ?? '';
        $a1 = $row[10] ?? '';
        $a2 = $row[11] ?? '';
        $a3 = $row[12] ?? '';
        $a4 = $row[13] ?? '';
        if ($feature === 'ADM1' && $a1 !== '') $maps['admin1'][$a1] = $name;
        elseif ($feature === 'ADM2' && $a1 !== '' && $a2 !== '') $maps['admin2'][$a1 . '.' . $a2] = preg_replace('/^Département du? /u', '', $name) ?: $name;
        elseif ($feature === 'ADM3' && $a1 !== '' && $a2 !== '' && $a3 !== '') $maps['admin3'][$a1 . '.' . $a2 . '.' . $a3] = $name;
        elseif ($feature === 'ADM4' && $a1 !== '' && $a2 !== '' && $a3 !== '' && $a4 !== '') $maps['admin4'][$a1 . '.' . $a2 . '.' . $a3 . '.' . $a4] = $name;
    }
    fclose($handle);
    return $maps;
}

function city_from_row(array $row, array $maps): array
{
    $rawName = $row[1] ?? '';
    $a1 = $row[10] ?? '';
    $a2 = $row[11] ?? '';
    $a3 = $row[12] ?? '';
    $a4 = $row[13] ?? '';
    $admin4Name = $maps['admin4'][$a1 . '.' . $a2 . '.' . $a3 . '.' . $a4] ?? '';
    $city = $rawName;
    $subdivision = '';
    if ($admin4Name !== '' && geo_norm($admin4Name) !== geo_norm($rawName)) {
        $city = $admin4Name;
        $subdivision = $rawName;
    }
    return [
        'geoname_id' => (int) ($row[0] ?? 0),
        'name' => $city,
        'subdivision' => $subdivision,
        'raw_name' => $rawName,
        'alternate_names' => $row[3] ?? '',
        'latitude' => (float) ($row[4] ?? 0),
        'longitude' => (float) ($row[5] ?? 0),
        'country' => 'France',
        'county' => $maps['admin2'][$a1 . '.' . $a2] ?? '',
        'state' => $maps['admin1'][$a1] ?? '',
        'admin1_code' => $a1,
        'admin2_code' => $a2,
        'admin3_code' => $a3,
        'admin4_code' => $a4,
        'feature_code' => $row[7] ?? '',
        'population' => (int) ($row[14] ?? 0),
    ];
}

function add_candidate_key(array &$index, string $key, int $position): void
{
    $key = geo_norm($key);
    if ($key === '') return;
    $index[$key][] = $position;
}

$pdo = db();
$maps = read_admin_maps();
$cities = [];
$cityByGeoname = [];
$candidateIndex = [];
$seenGeoIds = [];

$handle = geo_stream();
while (($line = fgets($handle)) !== false) {
    $row = explode("\t", rtrim($line, "\r\n"));
    if (($row[6] ?? '') !== 'P' || empty(CITY_FEATURES[$row[7] ?? ''])) continue;
    $city = city_from_row($row, $maps);
    if (!$city['geoname_id'] || $city['name'] === '') continue;
    if (isset($seenGeoIds[$city['geoname_id']])) continue;
    $seenGeoIds[$city['geoname_id']] = true;
    $position = count($cities);
    $cities[] = $city;
    add_candidate_key($candidateIndex, $city['raw_name'], $position);
    add_candidate_key($candidateIndex, $city['name'], $position);
    if ($city['subdivision'] !== '') add_candidate_key($candidateIndex, $city['name'] . ' ' . $city['subdivision'], $position);
    foreach (array_filter(array_map('trim', explode(',', $city['alternate_names']))) as $alternateName) {
        add_candidate_key($candidateIndex, $alternateName, $position);
    }
    $cityByGeoname[$city['geoname_id']] = $city;
}
fclose($handle);

$columns = ['geoname_id','name','subdivision','county','state','country','alternate_names','latitude','longitude','admin1_code','admin2_code','admin3_code','admin4_code','feature_code','population'];
$set = implode(',', array_map(static fn($column) => "{$column}=:{$column}", $columns));
$update = $pdo->prepare("UPDATE places SET {$set} WHERE id=:id");
$insert = $pdo->prepare('INSERT OR IGNORE INTO places(' . implode(',', $columns) . ') VALUES(:' . implode(',:', $columns) . ')');
$existingGeo = array_flip(array_map('intval', $pdo->query('SELECT geoname_id FROM places WHERE geoname_id IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN)));

$existing = $pdo->query("SELECT * FROM places WHERE country='' OR country='FR' OR country='France' OR country IS NULL")->fetchAll();
$usedGeoIds = [];
$updated = 0;
$ambiguous = 0;

foreach ($existing as $place) {
    if (!empty($place['geoname_id'])) {
        $usedGeoIds[(int) $place['geoname_id']] = true;
        continue;
    }
    $key = geo_norm((string) ($place['name'] ?? ''));
    $positions = $candidateIndex[$key] ?? [];
    if (!$positions) continue;
    $best = null;
    $bestScore = -1;
    $secondScore = -1;
    foreach ($positions as $position) {
        $city = $cities[$position];
        if (isset($existingGeo[(int) $city['geoname_id']]) || isset($usedGeoIds[(int) $city['geoname_id']])) continue;
        $score = 10;
        $county = geo_norm((string) ($place['county'] ?? ''));
        $state = geo_norm((string) ($place['state'] ?? ''));
        if ($county !== '' && str_contains($county, geo_norm($city['county']))) $score += 30;
        if ($state !== '' && str_contains($state, geo_norm($city['state']))) $score += 20;
        $score += min(9, (int) floor(log(max(1, $city['population']), 10)));
        if ($score > $bestScore) {
            $secondScore = $bestScore;
            $bestScore = $score;
            $best = $city;
        } elseif ($score > $secondScore) {
            $secondScore = $score;
        }
    }
    if (!$best || ($secondScore >= 10 && $bestScore === $secondScore)) {
        $ambiguous++;
        continue;
    }
    $params = array_intersect_key($best, array_flip($columns));
    $params['id'] = (int) $place['id'];
    $update->execute($params);
    $usedGeoIds[(int) $best['geoname_id']] = true;
    $existingGeo[(int) $best['geoname_id']] = true;
    $updated++;
}

$inserted = 0;
foreach ($cities as $city) {
    $geonameId = (int) $city['geoname_id'];
    if (isset($existingGeo[$geonameId]) || isset($usedGeoIds[$geonameId])) continue;
    $insert->execute(array_intersect_key($city, array_flip($columns)));
    $inserted++;
}

$legacyRows = $pdo->query("SELECT * FROM places WHERE country='France' AND geoname_id IS NULL")->fetchAll();
$findTarget = $pdo->prepare("SELECT * FROM places WHERE geoname_id=? LIMIT 1");
$moveEvents = $pdo->prepare('UPDATE events SET place_id=? WHERE place_id=?');
$moveCensus = $pdo->prepare('UPDATE census_records SET place_id=? WHERE place_id=?');
$copyLabels = $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id,entity_type,entity_id,created_at) SELECT label_id,entity_type,?,created_at FROM label_links WHERE entity_type='place' AND entity_id=?");
$deleteLabels = $pdo->prepare("DELETE FROM label_links WHERE entity_type='place' AND entity_id=?");
$deleteUnused = $pdo->prepare('DELETE FROM places WHERE id=? AND NOT EXISTS(SELECT 1 FROM events WHERE place_id=?) AND NOT EXISTS(SELECT 1 FROM census_records WHERE place_id=?)');
$merged = 0;
$legacyAmbiguous = 0;
foreach ($legacyRows as $place) {
    $positions = array_values(array_unique($candidateIndex[geo_norm((string) ($place['name'] ?? ''))] ?? []));
    $targets = [];
    $targetIds = [];
    foreach ($positions as $position) {
        $city = $cities[$position];
        if (isset($targetIds[(int) $city['geoname_id']])) continue;
        $findTarget->execute([(int) $city['geoname_id']]);
        if ($target = $findTarget->fetch()) {
            $targets[] = $target;
            $targetIds[(int) $city['geoname_id']] = true;
        }
    }
    if (!$targets) continue;
    $best = null;
    $bestScore = -1;
    $secondScore = -1;
    foreach ($targets as $target) {
        $score = 10;
        $county = geo_norm((string) ($place['county'] ?? ''));
        $state = geo_norm((string) ($place['state'] ?? ''));
        $oldAdmin = trim($county . ' ' . $state);
        $targetCounty = geo_norm((string) ($target['county'] ?? ''));
        $targetState = geo_norm((string) ($target['state'] ?? ''));
        if ($oldAdmin !== '' && $targetCounty !== '' && str_contains($oldAdmin, $targetCounty)) $score += 40;
        if ($oldAdmin !== '' && $targetState !== '' && str_contains($oldAdmin, $targetState)) $score += 25;
        $score += min(9, (int) floor(log(max(1, (int) ($target['population'] ?? 0)), 10)));
        if ($score > $bestScore) {
            $secondScore = $bestScore;
            $bestScore = $score;
            $best = $target;
        } elseif ($score > $secondScore) {
            $secondScore = $score;
        }
    }
    if (!$best || ($secondScore >= 10 && $bestScore === $secondScore)) {
        $legacyAmbiguous++;
        continue;
    }
    $oldId = (int) $place['id'];
    $targetId = (int) $best['id'];
    if ($oldId === $targetId) continue;
    $moveEvents->execute([$targetId,$oldId]);
    $moveCensus->execute([$targetId,$oldId]);
    $copyLabels->execute([$targetId,$oldId]);
    $deleteLabels->execute([$oldId]);
    $deleteUnused->execute([$oldId,$oldId,$oldId]);
    $merged++;
}

echo "GeoNames FR import terminé\n";
echo "Lieux lus: " . count($cities) . "\n";
echo "Lieux existants mis à jour: {$updated}\n";
echo "Lieux ajoutés: {$inserted}\n";
echo "Correspondances ambiguës laissées intactes: {$ambiguous}\n";
echo "Anciens lieux français fusionnés vers GeoNames: {$merged}\n";
echo "Anciennes correspondances encore ambiguës: {$legacyAmbiguous}\n";
