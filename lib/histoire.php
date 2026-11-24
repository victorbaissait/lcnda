<?php
declare(strict_types=1);

/**
 * 🏘 Histoire du lieu : le lieu à l'époque d'une personne (écran : assets/js/heritage-histoire.js).
 *
 * Les données sont dans UN fichier SQLite à part (jamais dans la base de la généalogie) : SHARED_DATA_DIR/histoire/histoire-locale.sqlite,
 * fabriqué par scripts/histoire/build-histoire.py (.github/workflows/histoire.yml) et installé en un bouton depuis la version
 * « histoire-donnees » du dépôt (comme la Météo d'autrefois : lib/meteo_dl.php). Ce qu'il contient :
 *   👥 population de chaque commune aux recensements (Insee, 1876 → 2023, communes au 1er janvier 2025) ;
 *   🚂 gares et leur date d'ouverture (Wikidata), positions des gares sans date (« Un siècle de gares », ODbL) ;
 *   🍇 dates de vendanges de 27 régions (Daux et al. 2012) et la table département → vignoble (scripts/histoire/vendanges-departements.csv) ;
 *   🌋 séismes de 1000 à 1899 (EPICA, INGV) ; 🌊 arrêtés CatNat depuis 1982 (GASPAR) et inondations historiques (BDHI, Géorisques).
 * 👶 La mortalité des enfants par département (French Human Mortality Database, frdata.org) n'est PAS dans le pack : ses auteurs
 * demandent de ne pas redistribuer leurs fichiers. L'app les télécharge donc chez eux, pour les seuls départements de la base
 * (bouton dans Réglages → 🏘 Histoire du lieu), et les garde dans SHARED_DATA_DIR/histoire/fhmd/.
 *
 * Règles écrites ici (dites aussi à l'écran) :
 *   - un recensement compte pour une date s'il est à 10 ans au plus (le plus proche) : on ne calcule pas de chiffre entre deux ;
 *   - vendanges : écart à la moyenne de la série (années d'avant 1880) ; ≥ 1 écart-type plus tôt → précoces (été chaud), plus tard → tardives (été frais) ;
 *     rien au-delà de 250 km du centre de la série ;
 *   - séisme « sans doute ressenti » : distance à l'épicentre sous un rayon tiré de l'intensité épicentrale (HIST_FELT_KM) — une règle simple,
 *     pas une observation : il n'existe pas d'intensités par commune en données ouvertes (SisFrance n'est pas libre) ;
 *   - temps de trajet : vitesses moyennes de HIST_SPEEDS, distance à vol d'oiseau × 1,3 (routes et voies ne sont pas droites).
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_HIST_DIR (un dossier à la place de GitHub et de frdata.org).
 */

const HIST_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/histoire-donnees/';
const HIST_FHMD_BASE = 'https://frdata.org/data/fhmd/5x5-NUTS3/';
const HIST_DL_STEP = 16 * 1024 * 1024;
const HIST_HEADER_SIZE = 4096;
const HIST_PACK_MAX = 512 * 1024 * 1024; // le pack fait ≈ 18 Mo : au-delà, ce n'en est pas un
const HIST_KIND = 'histoire';
const HIST_CENSUS_GAP = 10;
const HIST_GHD_MAX_KM = 250.0;
const HIST_FELT_KM = [5 => 25, 6 => 50, 7 => 100, 8 => 150, 9 => 250, 10 => 350, 11 => 450, 12 => 550];
/** vitesses moyennes (km/h) et heures de route par jour ; [année de début, année de fin) pour la diligence */
const HIST_SPEEDS = ['walk' => 4.0, 'walk_hours' => 8, 'coach' => 8.0, 'coach_hours' => 12, 'coach_from' => 1750, 'coach_to' => 1914,
    'train' => [[1827, 1900, 30.0], [1900, 1938, 45.0], [1938, 2100, 70.0]], 'detour' => 1.3, 'station_km' => 20.0];
const HIST_SOURCES_INFO = [
    'insee' => ['Insee : historique des populations communales', 'Population de chaque commune aux recensements', '1876 → 2023', 'Licence Ouverte / Etalab 2.0', '©Insee – Source(s) : Insee, recensements de la population', 'https://www.insee.fr/fr/statistiques/3698339'],
    'wikidata' => ['Wikidata : gares de France', 'Gares avec leur date d’ouverture', '1827 → aujourd’hui', 'CC0 (domaine public)', 'Wikidata', 'https://www.wikidata.org/'],
    'gares' => ['Un siècle de gares (R. Jeansoulin)', 'Position des gares en service, fermées ou disparues (sans date)', '1925 → 2018', 'ODbL 1.0', 'Robert Jeansoulin, Un siècle de gares du réseau ferroviaire français, data.gouv.fr, ODbL', 'https://www.data.gouv.fr/datasets/un-siecle-de-gares-du-reseau-ferroviaire-francais-en-service-fermees-ou-disparues'],
    'ghd' => ['Dates de vendanges (Daux et al. 2012)', 'Début des vendanges dans 27 régions viticoles', '1354 → 2007', 'Données publiques NOAA / WDS-Paleo, citation demandée', 'Daux V. et al. (2012), Climate of the Past 8, 1403–1418 ; données NOAA/WDS Paleoclimatology', 'https://www.ncei.noaa.gov/access/paleo-search/study/13194'],
    'epica' => ['EPICA v1.1 (INGV)', 'Séismes d’Europe : épicentre, date, intensité, magnitude', '1000 → 1899', 'CC BY 4.0', 'Rovida A., Antonucci A. (2021), EPICA v1.1, INGV, doi:10.13127/epica.1.1', 'https://emidius.eu/epica/'],
    'gaspar' => ['Géorisques : arrêtés CatNat (GASPAR)', 'Catastrophes naturelles reconnues, par commune', '1982 → aujourd’hui', 'Licence Ouverte / Etalab 2.0', 'Ministère de la Transition écologique – Géorisques, base GASPAR', 'https://www.georisques.gouv.fr/'],
    'bdhi' => ['Géorisques : inondations historiques (BDHI)', 'Inondations marquantes et communes touchées', 'Moyen Âge → 2018', 'Licence Ouverte / Etalab 2.0', 'Ministère de la Transition écologique – Géorisques, BDHI', 'https://www.georisques.gouv.fr/base-de-donnees/BDHI'],
    'fhmd' => ['French Human Mortality Database (frdata.org)', 'Tables de mortalité par département : risque de mourir avant 5 ans', '1901 → 2020', 'Téléchargement libre ; ne pas redistribuer (l’app télécharge chez eux, pour tes départements seulement)', 'Bonnet F., d’Albis H., French Human Mortality Database, frdata.org', 'https://frdata.org/en/french-human-mortality-database/'],
    'monde' => ['Le monde autour (LCNDA)', 'Grandes crues déjà listées dans l’app', 'toutes époques', 'CC BY-SA 4.0', 'Liste LCNDA d’après Wikipédia', ''],
];

/* ═════════════════════════ Les fichiers ═════════════════════════ */

function hist_dir(): string { return SHARED_DATA_DIR . '/histoire'; }
function hist_pack_path(): string { return hist_dir() . '/histoire-locale.sqlite'; }

function hist_pdo(): ?PDO
{
    static $pdo = false;
    $p = hist_pack_path();
    if ($pdo !== false && $pdo !== null) { return $pdo; }
    if (!is_file($p) || filesize($p) === 0) { return null; }
    try {
        $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $opts[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $pdo = new PDO('sqlite:' . $p, null, null, $opts);
        $pdo->query('SELECT 1 FROM meta LIMIT 1');
        return $pdo;
    } catch (Throwable) { $pdo = false; return null; }
}

function hist_meta(PDO $h): array
{
    static $m = null;
    return $m ??= $h->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
}

/** clé de comparaison d'un nom de commune (même règle que fold() dans scripts/histoire/build-histoire.py) */
function hist_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = str_replace(['œ', 'æ'], ['oe', 'ae'], $s);
    if (class_exists('Normalizer')) { $s = (string) Normalizer::normalize($s, Normalizer::FORM_D); $s = (string) preg_replace('/\p{Mn}+/u', '', $s); }
    else { $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ÿ' => 'y']); }
    $s = trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
    $s = (string) preg_replace('/^(saint|st) /', 'st ', $s); $s = (string) preg_replace('/ (saint|st) /', ' st ', $s);
    $s = (string) preg_replace('/^(sainte|ste) /', 'ste ', $s); $s = (string) preg_replace('/ (sainte|ste) /', ' ste ', $s);
    return $s;
}

function hist_km(float $a, float $b, float $c, float $d): float
{
    $r = M_PI / 180; $x = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
    return 6371 * 2 * asin(min(1.0, sqrt($x)));
}

/** le numéro de département d'un lieu (code INSEE, code GeoNames, sinon le nom du département : lib/monde_autour.php) */
function hist_place_dept(array $pl): string
{
    if (function_exists('world_place_dept')) { return world_place_dept($pl); }
    $insee = trim((string) ($pl['admin4_code'] ?? ''));
    return preg_match('/^(97\d|2[AB]|\d{2})/i', $insee, $m) ? strtoupper($m[1]) : '';
}

/** la commune de l'Insee d'un lieu : par son code (places.admin4_code), sinon par son nom dans son département */
function hist_commune(PDO $h, array $pl): ?array
{
    $code = strtoupper(trim((string) ($pl['admin4_code'] ?? '')));
    if (preg_match('/^(\d{5}|2[AB]\d{3})$/', $code)) {
        $s = $h->prepare('SELECT * FROM communes WHERE code=?'); $s->execute([$code]);
        if ($r = $s->fetch()) { return $r + ['match' => 'insee']; }
    }
    $country = mb_strtolower(trim((string) ($pl['country'] ?? '')));
    if ($country !== '' && !in_array($country, ['france', 'fr'], true)) { return null; }
    $dep = hist_place_dept($pl); $key = hist_fold((string) ($pl['name'] ?? ''));
    if ($key === '') { return null; }
    if ($dep !== '') { $s = $h->prepare('SELECT * FROM communes WHERE dep=? AND cle=?'); $s->execute([$dep, $key]); $rows = $s->fetchAll(); }
    else { $s = $h->prepare('SELECT * FROM communes WHERE cle=? LIMIT 2'); $s->execute([$key]); $rows = $s->fetchAll(); }
    return count($rows) === 1 ? $rows[0] + ['match' => 'name'] : null; // deux communes du même nom sans département : on ne choisit pas
}

/** la série d'une commune : [année => habitants] */
function hist_pop_series(PDO $h, array $c): array
{
    $years = array_map('intval', explode(',', (string) (hist_meta($h)['pop_years'] ?? '')));
    $vals = explode(',', (string) $c['pop']); $out = [];
    foreach ($years as $i => $y) { if (isset($vals[$i]) && $vals[$i] !== '') { $out[$y] = (int) $vals[$i]; } }
    return $out;
}

/** le recensement le plus proche d'une année (10 ans au plus), ou null */
function hist_census_at(array $series, int $year): ?array
{
    $best = null;
    foreach ($series as $y => $v) {
        $d = abs($y - $year);
        if ($d <= HIST_CENSUS_GAP && ($best === null || $d < $best[2] || ($d === $best[2] && $y < $best[0]))) { $best = [$y, $v, $d]; }
    }
    return $best ? ['census' => $best[0], 'value' => $best[1]] : null;
}

/* ═════════════════════════ Les lieux et les dates d'une personne ═════════════════════════ */

function hist_person_events(PDO $pdo, int $id): array
{
    $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(), 'name');
    $x = (in_array('admin4_code', $pc, true) ? ', pl.admin4_code' : ", '' AS admin4_code") . (in_array('admin2_code', $pc, true) ? ', pl.admin2_code' : ", '' AS admin2_code") . (in_array('subdivision', $pc, true) ? ', pl.subdivision' : ", '' AS subdivision");
    $s = $pdo->prepare("SELECT e.id, e.year, e.sort_date, e.date_text, t.gedcom_tag AS tag, pl.id AS place_id, pl.name, pl.county, pl.state, pl.country, pl.latitude AS lat, pl.longitude AS lon$x
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        WHERE e.person_id=? OR (e.scope='family' AND (f.partner1_id=? OR f.partner2_id=?)) ORDER BY e.year, e.id");
    $s->execute([$id, $id, $id]);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}

function hist_year_of(array $e): ?int
{
    if (is_numeric($e['year'] ?? null) && (int) $e['year'] > 0) { return (int) $e['year']; }
    if (preg_match('/^(\d{4})/', (string) ($e['sort_date'] ?? ''), $m)) { return (int) $m[1]; }
    return null;
}

/** naissance, mariage, décès (ou baptême, inhumation à défaut) : [quoi => événement] */
function hist_key_events(array $events): array
{
    $pick = static function (array $tags) use ($events): ?array {
        foreach ($tags as $t) { foreach ($events as $e) { if (strtoupper((string) $e['tag']) === $t && hist_year_of($e) !== null) { return $e; } } }
        return null;
    };
    return array_filter(['birth' => $pick(['BIRT', 'BAPM', 'CHR']), 'marriage' => $pick(['MARR']), 'death' => $pick(['DEAT', 'BURI'])]);
}

function hist_has_pos(array $e): bool { return is_numeric($e['lat'] ?? null) && is_numeric($e['lon'] ?? null) && !((float) $e['lat'] == 0.0 && (float) $e['lon'] == 0.0); }

/* ═════════════════════════ 👥 Population ═════════════════════════ */

function hist_population(PDO $h, array $key): array
{
    $out = []; $byPlace = [];
    foreach ($key as $what => $e) {
        if (empty($e['place_id'])) { continue; }
        $pid = (int) $e['place_id'];
        if (!isset($byPlace[$pid])) {
            $c = hist_commune($h, $e);
            $byPlace[$pid] = $c ? ['place_id' => $pid, 'place' => (string) $e['name'], 'code' => $c['code'], 'commune' => $c['nom'], 'match' => $c['match'], 'series' => hist_pop_series($h, $c), 'at' => []] : null;
        }
        if (!$byPlace[$pid]) { continue; }
        $y = hist_year_of($e);
        $at = hist_census_at($byPlace[$pid]['series'], $y);
        $byPlace[$pid]['at'][] = ['what' => $what, 'year' => $y] + ($at ?? ['census' => null, 'value' => null]);
    }
    // la commune de naissance : aussi au décès de la personne, même ailleurs (« 412 habitants quand il y naît, 230 à sa mort »)
    if (isset($key['birth'], $key['death']) && !empty($key['birth']['place_id']) && ($b = $byPlace[(int) $key['birth']['place_id']] ?? null) && (int) $key['birth']['place_id'] !== (int) ($key['death']['place_id'] ?? 0)) {
        $y = hist_year_of($key['death']); $at = hist_census_at($b['series'], $y);
        $byPlace[(int) $key['birth']['place_id']]['at'][] = ['what' => 'death_elsewhere', 'year' => $y] + ($at ?? ['census' => null, 'value' => null]);
    }
    foreach (array_filter($byPlace) as $p) { $p['years'] = array_keys($p['series']); $p['values'] = array_values($p['series']); unset($p['series']); $out[] = $p; }
    return $out;
}

/* ═════════════════════════ 🚂 Le train ═════════════════════════ */

/** les gares près d'un point (km) : [['nom', 'km', 'ouverture', 'src'], …] de la plus proche à la plus loin */
function hist_stations_near(PDO $h, float $lat, float $lon, float $maxKm, bool $dated = true): array
{
    $dl = $maxKm / 111.0; $dn = $maxKm / (111.0 * max(0.2, cos($lat * M_PI / 180)));
    $s = $h->prepare('SELECT nom, lat, lon, ouverture, precision, src FROM gares WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND ' . ($dated ? 'ouverture IS NOT NULL' : 'ouverture IS NULL'));
    $s->execute([$lat - $dl, $lat + $dl, $lon - $dn, $lon + $dn]);
    $out = [];
    foreach ($s->fetchAll() as $r) { $k = hist_km($lat, $lon, (float) $r['lat'], (float) $r['lon']); if ($k <= $maxKm) { $out[] = ['nom' => $r['nom'], 'km' => round($k, 1), 'ouverture' => $r['ouverture'] !== null ? (int) $r['ouverture'] : null, 'src' => $r['src']]; } }
    usort($out, static fn($a, $b) => $a['km'] <=> $b['km']);
    return $out;
}

/** le train près d'un lieu : la première gare ouverte à moins de 20 km, la plus proche connue, une gare sans date tout près */
function hist_train_at(PDO $h, float $lat, float $lon): array
{
    $near = hist_stations_near($h, $lat, $lon, HIST_SPEEDS['station_km']);
    $first = null;
    foreach ($near as $g) { if ($first === null || $g['ouverture'] < $first['ouverture'] || ($g['ouverture'] === $first['ouverture'] && $g['km'] < $first['km'])) { $first = $g; } }
    $closest = hist_stations_near($h, $lat, $lon, 60.0)[0] ?? null;
    $undated = hist_stations_near($h, $lat, $lon, 5.0, false)[0] ?? null;
    return ['first' => $first, 'closest' => $closest, 'undated' => $undated];
}

function hist_train(PDO $h, array $key): array
{
    $out = []; $seen = [];
    foreach (['birth', 'marriage', 'death'] as $what) {
        $e = $key[$what] ?? null; if (!$e || !hist_has_pos($e) || isset($seen[(int) $e['place_id']])) { continue; }
        $seen[(int) $e['place_id']] = 1;
        $out[] = ['what' => $what, 'place' => (string) $e['name'], 'place_id' => (int) $e['place_id']] + hist_train_at($h, (float) $e['lat'], (float) $e['lon']);
    }
    return $out;
}

/* ═════════════════════════ 🧭 Temps de trajet ═════════════════════════ */

function hist_train_speed(int $year): ?float
{
    foreach (HIST_SPEEDS['train'] as [$a, $b, $v]) { if ($year >= $a && $year < $b) { return $v; } }
    return null;
}

/** estimation entre deux lieux à une année : à pied, en diligence, en train (si une gare était ouverte près des deux) */
function hist_trip(PDO $h, array $a, array $b, int $year): ?array
{
    $km = hist_km((float) $a['lat'], (float) $a['lon'], (float) $b['lat'], (float) $b['lon']);
    if ($km < 5) { return null; }
    $road = $km * HIST_SPEEDS['detour'];
    $modes = [['mode' => 'walk', 'hours' => round($road / HIST_SPEEDS['walk'], 1), 'per_day' => HIST_SPEEDS['walk_hours']]];
    if ($year >= HIST_SPEEDS['coach_from'] && $year < HIST_SPEEDS['coach_to']) { $modes[] = ['mode' => 'coach', 'hours' => round($road / HIST_SPEEDS['coach'], 1), 'per_day' => HIST_SPEEDS['coach_hours']]; }
    $v = hist_train_speed($year);
    if ($v) {
        $open = static function (array $p) use ($h, $year): ?array { foreach (hist_stations_near($h, (float) $p['lat'], (float) $p['lon'], HIST_SPEEDS['station_km']) as $g) { if ($g['ouverture'] <= $year) { return $g; } } return null; };
        $ga = $open($a); $gb = $open($b);
        if ($ga && $gb && $ga['nom'] !== $gb['nom']) {
            $walk = ($ga['km'] + $gb['km']) * HIST_SPEEDS['detour'] / HIST_SPEEDS['walk'];
            $modes[] = ['mode' => 'train', 'hours' => round($road / $v + $walk, 1), 'speed' => $v, 'from_station' => $ga, 'to_station' => $gb];
        }
    }
    return ['km' => round($km), 'road_km' => round($road), 'year' => $year, 'modes' => $modes];
}

function hist_travel(PDO $h, array $key): array
{
    $out = [];
    foreach ([['birth', 'marriage'], ['birth', 'death'], ['marriage', 'death']] as [$x, $y]) {
        $a = $key[$x] ?? null; $b = $key[$y] ?? null;
        if (!$a || !$b || !hist_has_pos($a) || !hist_has_pos($b) || (int) $a['place_id'] === (int) $b['place_id']) { continue; }
        if (array_filter($out, static fn($t) => in_array((int) $b['place_id'], [$t['to_id'], $t['from_id']], true) && in_array((int) $a['place_id'], [$t['to_id'], $t['from_id']], true))) { continue; }
        $t = hist_trip($h, $a, $b, (int) hist_year_of($b));
        if ($t) { $out[] = $t + ['from' => (string) $a['name'], 'to' => (string) $b['name'], 'from_id' => (int) $a['place_id'], 'to_id' => (int) $b['place_id'], 'what' => $y, 'from_what' => $x]; }
    }
    return $out;
}

/* ═════════════════════════ 🍇 Les vendanges ═════════════════════════ */

function hist_harvest(PDO $h, array $e, int $year): ?array
{
    $dep = hist_place_dept($e);
    $cands = [];
    if ($dep !== '') { $s = $h->prepare('SELECT code FROM ghd_dep WHERE dep=? ORDER BY rang'); $s->execute([$dep]); $cands = array_column($s->fetchAll(), 'code'); }
    if (!$cands && hist_has_pos($e)) {
        $all = $h->query('SELECT code, lat, lon FROM ghd_series')->fetchAll();
        usort($all, static fn($a, $b) => hist_km((float) $e['lat'], (float) $e['lon'], (float) $a['lat'], (float) $a['lon']) <=> hist_km((float) $e['lat'], (float) $e['lon'], (float) $b['lat'], (float) $b['lon']));
        $cands = array_column(array_slice($all, 0, 3), 'code');
    }
    foreach ($cands as $code) {
        $s = $h->prepare('SELECT s.*, g.jours FROM ghd_series s JOIN ghd g ON g.code=s.code WHERE s.code=? AND g.annee=?'); $s->execute([$code, $year]);
        $r = $s->fetch(); if (!$r) { continue; }
        $km = hist_has_pos($e) ? hist_km((float) $e['lat'], (float) $e['lon'], (float) $r['lat'], (float) $r['lon']) : null;
        if ($km !== null && $km > HIST_GHD_MAX_KM) { continue; }
        $z = (float) $r['ecart'] > 0 ? ((float) $r['jours'] - (float) $r['moyenne']) / (float) $r['ecart'] : 0.0;
        $kind = $z <= -2 ? 'very_early' : ($z <= -1 ? 'early' : ($z >= 2 ? 'very_late' : ($z >= 1 ? 'late' : 'normal')));
        $date = (new DateTimeImmutable(sprintf('%04d-08-31', max(1, $year))))->modify('+' . (int) round((float) $r['jours']) . ' days')->format('m-d');
        return ['year' => $year, 'series' => $r['code'], 'series_name' => $r['nom'], 'km' => $km !== null ? round($km) : null, 'days' => (float) $r['jours'], 'mean' => (float) $r['moyenne'],
            'diff' => (int) round((float) $r['jours'] - (float) $r['moyenne']), 'z' => round($z, 2), 'kind' => $kind, 'date' => $date, 'ref' => $r['ref'], 'by_dept' => $dep !== ''];
    }
    return null;
}

function hist_climate(PDO $h, array $key): array
{
    $out = [];
    foreach (['birth', 'marriage', 'death'] as $what) {
        $e = $key[$what] ?? null; if (!$e || empty($e['place_id'])) { continue; }
        $y = hist_year_of($e); if ($y === null) { continue; }
        $r = hist_harvest($h, $e, $y);
        $out[] = ['what' => $what, 'place' => (string) $e['name']] + ($r ?? ['year' => $y, 'none' => true]);
    }
    return $out;
}

/* ═════════════════════════ 🌋 Séismes, 🌊 inondations ═════════════════════════ */

function hist_io_num(string $io): ?float
{
    if (!preg_match('/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/', trim($io), $m)) { return null; }
    return isset($m[2]) && $m[2] !== '' ? ((float) $m[1] + (float) $m[2]) / 2 : (float) $m[1];
}

/** le rayon (km) où un séisme d'intensité épicentrale $io est sans doute ressenti (règle de l'app, interpolée) */
function hist_felt_km(float $io): float
{
    if ($io < 5) { return 0.0; }
    $lo = (int) floor($io); $hi = min(12, $lo + 1); $f = $io - $lo;
    return (HIST_FELT_KM[$lo] ?? 550) * (1 - $f) + (HIST_FELT_KM[$hi] ?? 550) * $f;
}

function hist_quakes(PDO $h, array $places, int $from, int $to): array
{
    if (!$places || $to < $from) { return []; }
    $s = $h->prepare('SELECT * FROM seismes WHERE annee BETWEEN ? AND ?'); $s->execute([$from, $to]);
    $best = [];
    foreach ($s->fetchAll() as $q) {
        $io = hist_io_num((string) $q['io']); if ($io === null) { continue; }
        $r = hist_felt_km($io);
        foreach ($places as $p) {
            $k = hist_km((float) $p['lat'], (float) $p['lon'], (float) $q['lat'], (float) $q['lon']);
            if ($k > $r) { continue; }
            $id = $q['annee'] . '|' . $q['zone'];
            if (!isset($best[$id]) || $io > $best[$id]['io_n'] || ($io === $best[$id]['io_n'] && $k < $best[$id]['km'])) {
                $best[$id] = ['year' => (int) $q['annee'], 'month' => $q['mois'] !== null ? (int) $q['mois'] : null, 'day' => $q['jour'] !== null ? (int) $q['jour'] : null, 'zone' => (string) $q['zone'],
                    'io' => (string) $q['io'], 'io_n' => $io, 'mw' => $q['mw'] !== null ? round((float) $q['mw'], 1) : null, 'km' => round($k), 'felt_km' => round($r), 'place' => $p['name'], 'src' => $q['src']];
            }
        }
    }
    $list = array_values($best);
    usort($list, static fn($a, $b) => [$b['io_n'], $a['year']] <=> [$a['io_n'], $b['year']]);
    $list = array_slice($list, 0, 6);
    usort($list, static fn($a, $b) => $a['year'] <=> $b['year']);
    return $list;
}

function hist_floods(PDO $h, array $places, int $from, int $to): array
{
    $codes = []; $deps = []; $names = [];
    foreach ($places as $p) { if ($p['code']) { $codes[$p['code']] = $p['name']; } if ($p['dep']) { $deps['D' . $p['dep']] = $p['dep']; } }
    $out = ['bdhi' => [], 'catnat' => [], 'monde' => []];
    $tables = $h->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    if (in_array('bdhi', $tables, true) && ($codes || $deps)) {
        $keys = array_merge(array_keys($codes), array_keys($deps));
        $marks = implode(',', array_fill(0, count($keys), '?'));
        $s = $h->prepare("SELECT b.id, b.titre, b.annee, b.debut, l.code FROM bdhi b JOIN bdhi_lieu l ON l.id=b.id WHERE l.code IN ($marks) AND b.annee BETWEEN ? AND ? ORDER BY b.annee");
        $s->execute(array_merge($keys, [$from, $to]));
        $byYear = [];
        foreach ($s->fetchAll() as $r) {
            $local = $r['code'][0] !== 'D';
            $y = (int) $r['annee'];
            $cur = $byYear[$y] ?? null;
            // une ligne par année : la fiche de la commune plutôt que celle du département, puis le titre le plus court
            if (!$cur || ($local && !$cur['local']) || ($local === $cur['local'] && mb_strlen($r['titre']) < mb_strlen($cur['title']))) {
                $byYear[$y] = ['year' => $y, 'title' => $r['titre'], 'local' => $local, 'place' => $local ? ($codes[$r['code']] ?? '') : '', 'date' => (string) ($r['debut'] ?? '')];
            }
        }
        $out['bdhi'] = array_values(array_slice($byYear, 0, 8, true));
    }
    if ($codes && $to >= 1982) {
        $marks = implode(',', array_fill(0, count($codes), '?'));
        $s = $h->prepare("SELECT c.code, c.debut, c.fin, c.risque, r.nom FROM catnat c LEFT JOIN catnat_risques r ON r.code=c.risque WHERE c.code IN ($marks) AND substr(c.debut,1,4) BETWEEN ? AND ? ORDER BY c.debut");
        $s->execute(array_merge(array_keys($codes), [(string) max(1982, $from), (string) $to]));
        foreach ($s->fetchAll() as $r) { $out['catnat'][] = ['date' => $r['debut'], 'end' => $r['fin'], 'kind' => $r['risque'], 'label' => (string) $r['nom'], 'place' => $codes[$r['code']] ?? '']; }
    }
    // les crues déjà listées dans « 🌍 Le monde autour » (assets/data/monde-autour.json) pour ces départements, si la BDHI n'a rien cette année-là
    $f = APP_ROOT . '/assets/data/monde-autour.json';
    if ($deps && is_file($f)) {
        $j = json_decode((string) file_get_contents($f), true);
        $have = array_column($out['bdhi'], 'year');
        foreach (($j['events'] ?? []) as $e) {
            $txt = mb_strtolower(($e['title'] ?? '') . ' ' . ($e['desc'] ?? ''));
            if (!preg_match('/\b(crues?|inond\w*|débord\w*)\b/u', $txt)) { continue; }
            $sc = array_map('trim', explode(',', (string) ($e['scope'] ?? '')));
            if (!array_intersect($sc, array_values($deps)) || (int) $e['from'] < $from || (int) $e['from'] > $to || in_array((int) $e['from'], $have, true)) { continue; }
            $out['monde'][] = ['year' => (int) $e['from'], 'title' => (string) $e['title'], 'desc' => (string) ($e['desc'] ?? ''), 'src' => (string) ($e['src'] ?? ''), 'url' => (string) ($e['url'] ?? '')];
        }
    }
    return $out;
}

/* ═════════════════════════ 👶 Les enfants ═════════════════════════ */

function hist_fhmd_codes(string $dep, int $year): array
{
    $dep = strtoupper($dep);
    if (in_array($dep, ['2A', '2B', '20'], true)) { return ['20']; }
    if ($dep === '75') { return $year < 1968 ? ['75', '96'] : ['96', '75']; }
    if (in_array($dep, ['92', '93', '94'], true)) { return $year < 1968 ? ['75', $dep] : [$dep, '75']; }
    if (in_array($dep, ['91', '95'], true)) { return $year < 1968 ? ['78', $dep] : [$dep, '78']; }
    if ($dep === '78') { return $year < 1968 ? ['78', '97'] : ['97', '78']; }
    return preg_match('/^\d{2}$/', $dep) && (int) $dep >= 1 && (int) $dep <= 95 ? [$dep] : [];
}

function hist_fhmd_file(string $code): string { return hist_dir() . "/fhmd/$code.json"; }

/** la table de frdata.org gardée pour un département : [période « 1901-1905 » => q5 (moyenne garçons-filles)] */
function hist_fhmd_table(string $code): ?array
{
    $f = hist_fhmd_file($code);
    $j = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    return is_array($j) && is_array($j['q5'] ?? null) ? $j : null;
}

function hist_children(PDO $pdo, int $id, ?PDO $h): array
{
    $s = $pdo->prepare('SELECT DISTINCT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=? OR f.partner2_id=?');
    $s->execute([$id, $id]);
    $ids = array_map('intval', array_column($s->fetchAll(), 'child_id'));
    $res = ['total' => 0, 'under5' => 0, 'unknown' => 0, 'from' => null, 'to' => null, 'dep' => '', 'compare' => null, 'why' => ''];
    if (!$ids) { return $res; }
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(), 'name');
    $x = (in_array('admin4_code', $pc, true) ? ', pl.admin4_code' : ", '' AS admin4_code") . (in_array('admin2_code', $pc, true) ? ', pl.admin2_code' : ", '' AS admin2_code") . (in_array('subdivision', $pc, true) ? ', pl.subdivision' : ", '' AS subdivision");
    $q = $pdo->prepare("SELECT e.person_id, e.year, e.sort_date, t.gedcom_tag AS tag, pl.name, pl.county, pl.country$x FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id IN ($marks) AND t.gedcom_tag IN ('BIRT','BAPM','CHR','DEAT','BURI') ORDER BY e.id");
    $q->execute($ids);
    $ev = [];
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $e) { $ev[(int) $e['person_id']][] = $e; }
    $st = $pdo->prepare("SELECT id, living_status FROM persons WHERE id IN ($marks)"); $st->execute($ids); $living = array_column($st->fetchAll(PDO::FETCH_ASSOC), 'living_status', 'id');
    $years = []; $deps = [];
    foreach ($ids as $c) {
        $key = hist_key_events($ev[$c] ?? []);
        if (empty($key['birth'])) { continue; }
        $by = hist_year_of($key['birth']); $res['total']++; $years[] = $by;
        if (($d = hist_place_dept($key['birth'])) !== '') { $deps[$d] = ($deps[$d] ?? 0) + 1; }
        if (empty($key['death'])) { if (($living[$c] ?? '') !== 'living') { $res['unknown']++; } continue; }
        $bd = (string) ($key['birth']['sort_date'] ?? ''); $dd = (string) ($key['death']['sort_date'] ?? '');
        if (preg_match('/^\d{4}-\d{2}-\d{2}/', $bd) && preg_match('/^\d{4}-\d{2}-\d{2}/', $dd)) {
            $age = (new DateTimeImmutable(substr($bd, 0, 10)))->diff(new DateTimeImmutable(substr($dd, 0, 10)))->y;
            if ($age < 5) { $res['under5']++; }
        } else {
            $diff = (int) hist_year_of($key['death']) - (int) $by;
            if ($diff <= 4) { $res['under5']++; } elseif ($diff === 5) { $res['unknown']++; } // 5 ans d'écart sans dates complètes : on ne sait pas
        }
    }
    if (!$res['total']) { return $res; }
    sort($years); $res['from'] = $years[0]; $res['to'] = end($years);
    arsort($deps); $res['dep'] = (string) (array_key_first($deps) ?? '');
    $mid = $years[intdiv(count($years) - 1, 2)];
    $res['mid'] = $mid;
    if ($mid < 1901) { $res['why'] = 'before1901'; return $res; }
    if ($res['dep'] === '') { $res['why'] = 'nodept'; return $res; }
    foreach (hist_fhmd_codes($res['dep'], $mid) as $code) {
        $t = hist_fhmd_table($code); if (!$t) { continue; }
        $a = 1901 + intdiv($mid - 1901, 5) * 5; $period = $a . '-' . ($a + 4);
        if (!isset($t['q5'][$period])) { continue; }
        $res['compare'] = ['period' => $period, 'q5' => (float) $t['q5'][$period], 'code' => $code, 'name' => (string) ($t['name'] ?? ''), 'url' => (string) ($t['url'] ?? '')];
        return $res;
    }
    $res['why'] = 'nofhmd';
    return $res;
}

/* ═════════════════════════ GET hist_person ═════════════════════════ */

function hist_person_data(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender, living_status FROM persons WHERE id=?'); $s->execute([$id]); $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $events = hist_person_events($pdo, $id);
    $key = hist_key_events($events);
    $person = ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name']) ?: trim((string) $p['last_name']), 'gender' => (string) $p['gender'],
        'birth' => isset($key['birth']) ? hist_year_of($key['birth']) : null, 'death' => isset($key['death']) ? hist_year_of($key['death']) : null];
    $h = hist_pdo();
    $children = hist_children($pdo, $id, $h);
    if (!$h) { return ['installed' => false, 'person' => $person, 'children' => $children, 'fhmd' => hist_fhmd_status_short()]; }
    $from = $person['birth'] ?? ($person['death'] !== null ? $person['death'] - 60 : null);
    $to = $person['death'] ?? ($person['birth'] !== null ? min((int) date('Y'), $person['birth'] + 80) : null);
    $places = []; $seen = [];
    foreach ($events as $e) {
        if (empty($e['place_id']) || isset($seen[(int) $e['place_id']])) { continue; }
        $seen[(int) $e['place_id']] = 1;
        $c = hist_commune($h, $e);
        $places[] = ['id' => (int) $e['place_id'], 'name' => (string) $e['name'], 'lat' => hist_has_pos($e) ? (float) $e['lat'] : null, 'lon' => hist_has_pos($e) ? (float) $e['lon'] : null,
            'code' => $c['code'] ?? '', 'dep' => hist_place_dept($e)];
        if (count($places) >= 8) { break; }
    }
    $withPos = array_values(array_filter($places, static fn($x) => $x['lat'] !== null));
    return ['installed' => true, 'built' => (string) (hist_meta($h)['built'] ?? ''), 'person' => $person,
        'population' => hist_population($h, $key), 'train' => hist_train($h, $key), 'travel' => hist_travel($h, $key), 'climate' => hist_climate($h, $key),
        'quakes' => $from !== null ? hist_quakes($h, $withPos, $from, (int) $to) : [], 'floods' => $from !== null ? hist_floods($h, $places, $from, (int) $to) : ['bdhi' => [], 'catnat' => [], 'monde' => []],
        'children' => $children, 'fhmd' => hist_fhmd_status_short(), 'rules' => ['census_gap' => HIST_CENSUS_GAP, 'felt_km' => HIST_FELT_KM, 'speeds' => HIST_SPEEDS, 'ghd_max_km' => HIST_GHD_MAX_KM, 'ghd_ref' => (string) (hist_meta($h)['ghd_ref'] ?? '')]];
}

/** GET hist_place&id= → la population et le train d'un lieu (pour la fiche du lieu) */
function hist_place_data(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$id]); $pl = $s->fetch(PDO::FETCH_ASSOC);
    if (!$pl) { throw new RuntimeException('Lieu introuvable.'); }
    $h = hist_pdo(); if (!$h) { return ['installed' => false]; }
    $pl['lat'] = $pl['latitude'] ?? null; $pl['lon'] = $pl['longitude'] ?? null;
    $c = hist_commune($h, $pl);
    $out = ['installed' => true, 'place' => (string) $pl['name'], 'commune' => $c ? ['code' => $c['code'], 'nom' => $c['nom'], 'match' => $c['match'], 'series' => hist_pop_series($h, $c)] : null];
    if (hist_has_pos($pl)) { $out['train'] = hist_train_at($h, (float) $pl['lat'], (float) $pl['lon']); }
    return $out;
}

/* ═════════════════════════ État, sources ═════════════════════════ */

function hist_status_data(): array
{
    $h = hist_pdo(); $p = hist_pack_path();
    $info = ['installed' => (bool) $h, 'removed' => is_file($p . '.removed'), 'dir' => hist_dir()];
    if ($h) {
        $m = hist_meta($h);
        $info += ['size' => (int) filesize($p), 'built' => (string) ($m['built'] ?? ''), 'stats' => json_decode((string) ($m['stats'] ?? '{}'), true) ?: (object) [],
            'sources' => array_column($h->query('SELECT id FROM sources ORDER BY id')->fetchAll(), 'id')];
    }
    return $info + ['fhmd' => hist_fhmd_status_short()];
}

function hist_about_data(): array
{
    $used = [];
    if ($h = hist_pdo()) { foreach ($h->query('SELECT * FROM sources') as $r) { $used[$r['id']] = $r; } }
    $rows = [];
    foreach (HIST_SOURCES_INFO as $id => [$nom, $what, $years, $lic, $mention, $url]) {
        $u = $used[$id] ?? null;
        $rows[] = ['id' => $id, 'nom' => $u['nom'] ?? $nom, 'what' => $what, 'years' => $years, 'licence' => $u['licence'] ?? $lic, 'mention' => $u['mention'] ?? $mention, 'url' => $u['url'] ?? $url,
            'installed' => $u !== null || ($id === 'fhmd' && hist_fhmd_status_short()['count'] > 0), 'n' => (int) ($u['n'] ?? 0)];
    }
    return ['sources' => $rows, 'missing' => ['cassini' => 'Des villages de Cassini aux communes d’aujourd’hui (EHESS) : le dépôt Didómena ne répondait pas lors de la fabrication ; les populations commencent donc en 1876.',
        'sisfrance' => 'SisFrance (BRGM, EDF, IRSN) : pas de licence ouverte, donc pas d’intensité ressentie commune par commune.']];
}

/* ═════════════════════════ 👶 frdata.org (téléchargé chez eux, jamais redistribué) ═════════════════════════ */

/** les départements de la base (lieux en France), avec leur code dans les tables de frdata.org */
function hist_fhmd_wanted(PDO $pdo): array
{
    $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(), 'name');
    $x = (in_array('admin4_code', $pc, true) ? ', admin4_code' : '') . (in_array('admin2_code', $pc, true) ? ', admin2_code' : '') . (in_array('subdivision', $pc, true) ? ', subdivision' : '');
    $codes = [];
    foreach ($pdo->query("SELECT DISTINCT name, county, state, country$x FROM places") as $pl) {
        $d = hist_place_dept($pl); if ($d === '') { continue; }
        foreach (array_unique(array_merge(hist_fhmd_codes($d, 1901), hist_fhmd_codes($d, 2000))) as $c) { $codes[$c] = true; }
    }
    ksort($codes);
    return array_keys($codes);
}

function hist_fhmd_status_short(): array
{
    $have = [];
    foreach (glob(hist_dir() . '/fhmd/*.json') ?: [] as $f) { $have[] = basename($f, '.json'); }
    sort($have);
    return ['count' => count($have), 'codes' => $have];
}

/** GET hist_fhmd_status → ce qui est déjà là et ce qu'il faudrait pour la base */
function hist_fhmd_status(PDO $pdo): array
{
    $s = hist_fhmd_status_short(); $want = hist_fhmd_wanted($pdo);
    return $s + ['wanted' => $want, 'missing' => array_values(array_diff($want, $s['codes']))];
}

function hist_fhmd_get(string $name): string
{
    if (!preg_match('/^(\d{2})([FM])\.txt$/', $name)) { throw new LcndaBadInput('Fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_HIST_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = "$dir/frdata/5x5-NUTS3/$name";
        if (!is_file($f)) { throw new RuntimeException(i18n_t('Table introuvable chez frdata.org.')); }
        return (string) file_get_contents($f);
    }
    return hist_http_get(HIST_FHMD_BASE . $name, null, 2 * 1024 * 1024, 'frdata.org');
}

/** une table 5×5 de frdata.org → [période => q5] (5q0 = 1 − l5 / l0, colonnes « Year;Age;…;lx ») */
function hist_fhmd_parse(string $txt): array
{
    $lines = preg_split('/\r?\n/', trim($txt)); $head = str_getcsv(array_shift($lines) ?? '', ';', '"', '\\');
    $iy = array_search('Year', $head, true); $ia = array_search('Age', $head, true); $il = array_search('lx', $head, true);
    if ($iy === false || $ia === false || $il === false) { throw new RuntimeException(i18n_t('Table de frdata.org illisible (le format a changé ?).')); }
    $l0 = []; $l5 = [];
    foreach ($lines as $l) {
        $c = str_getcsv($l, ';', '"', '\\'); if (count($c) <= $il) { continue; }
        $v = (float) str_replace(',', '.', $c[$il]);
        if ($c[$ia] === '0') { $l0[$c[$iy]] = $v; } elseif ($c[$ia] === '5-9') { $l5[$c[$iy]] = $v; }
    }
    $out = [];
    foreach ($l0 as $p => $v) { if ($v > 0 && isset($l5[$p]) && preg_match('/^\d{4}-\d{4}$/', $p)) { $out[$p] = round(1 - $l5[$p] / $v, 5); } }
    return $out;
}

/** POST hist_fhmd_step {code} → télécharge un département (garçons et filles) chez frdata.org */
function hist_fhmd_step(array $data): array
{
    $code = (string) ($data['code'] ?? '');
    if (!preg_match('/^\d{2}$/', $code)) { throw new LcndaBadInput('Département refusé.'); }
    $m = hist_fhmd_parse(hist_fhmd_get($code . 'M.txt')); $f = hist_fhmd_parse(hist_fhmd_get($code . 'F.txt'));
    $q5 = [];
    foreach ($m as $p => $v) { if (isset($f[$p])) { $q5[$p] = round(($v + $f[$p]) / 2, 5); } }
    if (!$q5) { throw new RuntimeException(i18n_t('Table de frdata.org vide.')); }
    @mkdir(hist_dir() . '/fhmd', 0775, true);
    file_put_contents(hist_fhmd_file($code), json_encode(['code' => $code, 'q5' => $q5, 'boys' => $m, 'girls' => $f, 'fetched' => date('Y-m-d'), 'url' => HIST_FHMD_BASE . $code . '[M|F].txt'], JSON_UNESCAPED_UNICODE));
    return ['code' => $code, 'periods' => count($q5)];
}

/** POST hist_fhmd_remove → efface les tables gardées (« ↶ » les remet : hist_fhmd_restore) */
function hist_fhmd_remove(): array
{
    $dir = hist_dir() . '/fhmd'; $bin = hist_dir() . '/fhmd.removed';
    if (!is_dir($dir)) { return ['removed' => 0]; }
    if (is_dir($bin)) { foreach (glob("$bin/*") ?: [] as $f) { @unlink($f); } @rmdir($bin); }
    $n = count(glob("$dir/*.json") ?: []);
    @rename($dir, $bin);
    return ['removed' => $n];
}

function hist_fhmd_restore(): array
{
    $dir = hist_dir() . '/fhmd'; $bin = hist_dir() . '/fhmd.removed';
    if (!is_dir($bin)) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_dir($dir)) { foreach (glob("$bin/*.json") ?: [] as $f) { @rename($f, $dir . '/' . basename($f)); } @rmdir($bin); }
    else { @rename($bin, $dir); }
    return ['restored' => true];
}

/* ═════════════════════════ ⤓ Installer le pack en un bouton (copie de lib/meteo_dl.php, pour la version « histoire-donnees ») ═════════════════════════ */

function hist_http_get(string $url, ?array $range, int $max, string $what): string
{
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, histoire du lieu)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur {what}.', ['what' => $what])); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Pas encore en ligne sur {what} : réessaie plus tard.', ['what' => $what])); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion à {what} : {err}', ['what' => $what, 'err' => $err]) : i18n_t('{what} répond {code}.', ['what' => $what, 'code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

function hist_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_HIST_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Pas encore en ligne sur {what} : réessaie plus tard.', ['what' => 'GitHub'])); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    return hist_http_get(HIST_DL_BASE . $name, $range, $max, 'GitHub');
}

/** GET hist_dl_info → le pack en ligne (manifeste histoire-manifest.json, gardé une heure) */
function hist_dl_info(): array
{
    $cache = hist_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(hist_dl_get('histoire-manifest.json', null, 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des données en ligne est illisible.')); }
    $p = $m['packs'][HIST_KIND] ?? null; $out = [];
    if (is_array($p) && is_array($p['parts'] ?? null) && $p['parts']) {
        $parts = []; $sum = 0; $ok = true;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { $ok = false; break; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($ok && $sum === (int) ($p['size'] ?? -1) && $sum <= HIST_PACK_MAX) { $out[HIST_KIND] = ['size' => $sum, 'parts' => $parts, 'built' => (string) ($p['built'] ?? '')]; }
    }
    return ['version' => (string) ($m['version'] ?? ''), 'packs' => (object) $out];
}

function hist_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Envoi inconnu.'); }
    $dir = hist_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des données impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST hist_dl_start → {id, size} */
function hist_dl_start(array $data): array
{
    $p = ((array) hist_dl_info()['packs'])[HIST_KIND] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Ce pack n’est pas encore en ligne.')); }
    foreach (glob(hist_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12)); $path = hist_upload_path($id);
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < 2 * $p['size'] + 20 * 1024 * 1024) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque.')); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['kind' => HIST_KIND, 'parts' => $p['parts']]));
    return ['id' => $id, 'size' => $p['size'], 'kind' => HIST_KIND];
}

/** POST hist_dl_step {id} → {received, size, done} : la tranche suivante (reprend où le fichier s'est arrêté) */
function hist_dl_step(array $data): array
{
    $path = hist_upload_path((string) ($data['id'] ?? ''));
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size'));
    if ($have >= $size) { return ['received' => $have, 'size' => $size, 'done' => true]; }
    $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + HIST_DL_STEP - 1);
            $bytes = hist_dl_get($part['name'], [$from, $to], HIST_DL_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
            clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}

function hist_dl_cancel(array $data): array
{
    $path = hist_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

function hist_dl_resume(string $id): array
{
    $path = hist_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta)) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'kind' => $meta['kind'], 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}

/** POST hist_pack_finish {id} → vérifie (en-tête LCHIST1, taille, empreinte, base lisible du bon schéma) puis range le pack */
function hist_pack_finish(array $data): array
{
    $path = hist_upload_path((string) ($data['id'] ?? ''));
    if (!is_file($path)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    try {
        $f = fopen($path, 'rb'); $head = (string) fread($f, HIST_HEADER_SIZE); fclose($f);
        if (!str_starts_with($head, "LCHIST1\n")) { throw new RuntimeException(i18n_t('Ce n’est pas un pack « Histoire du lieu » de LCNDA.')); }
        $hd = json_decode(trim(substr($head, 8)), true);
        if (!is_array($hd) || ($hd['kind'] ?? '') !== HIST_KIND || !preg_match('/^[0-9a-f]{64}$/', (string) ($hd['sha256'] ?? ''))) { throw new RuntimeException(i18n_t('En-tête du pack abîmé.')); }
        clearstatcache(true, $path);
        if (filesize($path) - HIST_HEADER_SIZE !== (int) ($hd['size'] ?? -1)) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        @set_time_limit(0);
        $target = hist_pack_path(); $tmp = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $in = fopen($path, 'rb'); fseek($in, HIST_HEADER_SIZE); $out = fopen($tmp, 'wb'); $ctx = hash_init('sha256');
        while (!feof($in)) { $buf = fread($in, 1 << 20); if ($buf === false || $buf === '') { break; } hash_update($ctx, $buf); fwrite($out, $buf); }
        fclose($in); fclose($out);
        if (!hash_equals((string) $hd['sha256'], hash_final($ctx))) { @unlink($tmp); throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        try {
            $f = fopen($tmp, 'rb'); $magic = (string) fread($f, 16); fclose($f);
            if ($magic !== "SQLite format 3\0") { throw new RuntimeException('pas une base'); }
            $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
            if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $opts[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
            $t = new PDO('sqlite:' . $tmp, null, null, $opts);
            $meta = $t->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            if (($meta['kind'] ?? '') !== HIST_KIND || (int) ($meta['format'] ?? 0) !== 1) { throw new RuntimeException('sorte'); }
            $tables = $t->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
            if (array_diff(['meta', 'sources', 'communes', 'gares', 'ghd', 'ghd_series', 'ghd_dep', 'seismes', 'catnat'], $tables)) { throw new RuntimeException('schéma'); }
            $t = null;
        } catch (Throwable) { @unlink($tmp); throw new RuntimeException(i18n_t('Le pack ne peut pas être lu : rien n’a été installé.')); }
        $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($tmp, $target)) { @unlink($tmp); if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Pack impossible à ranger.')); }
        @unlink($target . '.removed');
        return ['kind' => HIST_KIND, 'communes' => (int) ($hd['communes'] ?? 0), 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST hist_pack_undo → défait la dernière installation (remet le pack d'avant, ou retire le nouveau) */
function hist_pack_undo(): array
{
    $target = hist_pack_path();
    if (is_file($target . '.prev')) { @unlink($target); @rename($target . '.prev', $target); return ['restored' => true]; }
    if (is_file($target)) { @unlink($target); }
    return ['removed' => true];
}

/** POST hist_pack_remove → mis de côté (« ↶ Annuler » : hist_pack_restore) */
function hist_pack_remove(): array
{
    $target = hist_pack_path();
    if (!is_file($target)) { throw new RuntimeException(i18n_t('Le pack n’est pas installé.')); }
    @unlink($target . '.removed');
    if (!@rename($target, $target . '.removed')) { throw new RuntimeException(i18n_t('Pack impossible à retirer.')); }
    return ['ok' => true];
}

function hist_pack_restore(): array
{
    $target = hist_pack_path();
    if (!is_file($target . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($target)) { throw new RuntimeException(i18n_t('Un autre pack a été installé entre-temps.')); }
    @rename($target . '.removed', $target);
    return ['ok' => true];
}

/* ═════════════════════════ Aiguillage (api.php) ═════════════════════════ */

function hist_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'hist_status' => hist_status_data(),
        'hist_about' => hist_about_data(),
        'hist_person' => hist_person_data($pdo, safe_int($q['id'] ?? 0)),
        'hist_place' => hist_place_data($pdo, safe_int($q['id'] ?? 0)),
        'hist_fhmd_status' => hist_fhmd_status($pdo),
        // sans internet (ou rien encore en ligne) : une réponse normale qui le dit, pas une erreur du serveur
        'hist_dl_info' => (static function () { try { return hist_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'packs' => (object) [], 'offline' => true, 'error' => $e->getMessage()]; } })(),
        'hist_dl_resume' => hist_dl_resume((string) ($q['id'] ?? '')),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

function hist_api_post(string $action, array $data): array
{
    return match ($action) {
        'hist_dl_start' => hist_dl_start($data),
        'hist_dl_step' => hist_dl_step($data),
        'hist_dl_cancel' => hist_dl_cancel($data),
        'hist_pack_finish' => hist_pack_finish($data),
        'hist_pack_undo' => hist_pack_undo(),
        'hist_pack_remove' => hist_pack_remove(),
        'hist_pack_restore' => hist_pack_restore(),
        'hist_fhmd_step' => hist_fhmd_step($data),
        'hist_fhmd_remove' => hist_fhmd_remove(),
        'hist_fhmd_restore' => hist_fhmd_restore(),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
