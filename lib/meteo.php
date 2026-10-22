<?php
declare(strict_types=1);

/**
 * 🌦 Météo d'autrefois (maquette docs/design/meteo.html, M1 à M11 ; écran : assets/js/heritage-meteo.js).
 *
 * Le temps qu'il faisait le jour d'un événement, sans Internet. Les données sont dans des fichiers SQLite À PART
 * (jamais dans la base de la généalogie), fabriqués une fois par scripts/meteo/build-meteo.py :
 *   - le socle   meteo-socle.sqlite   : livré avec l'app (dossier data-meteo/ à côté de l'app, ou LCNDA_METEO_DIR) ;
 *   - les packs  meteo-complet.sqlite, meteo-europe.sqlite : importés une fois (K13) dans SHARED_DATA_DIR/meteo/.
 * Chaque fichier est cherché dans les deux dossiers. Format exact : docs/UI.md, « 🌦 Météo d'autrefois ».
 *
 * Fiabilité (M3) : station à moins de 15 km et moins de 150 m d'écart d'altitude → « Mesuré » ; 15 à 40 km → « Station à N km »
 * (la pluie devient « il a plu dans la région ») ; sinon ERA5 (1940 →) « Estimé (carreau ≈ 30 km) » ; 1836–1939 : 20CR
 * « Reconstitution grossière » ; rien : « Pas de relevé connu près d'ici avant AAAA (première station : X) ».
 * Distance = haversine + 1 km par 10 m d'écart d'altitude (si l'altitude du lieu est connue).
 * L'heure de l'acte (events.event_time, migration 63) est remise en UTC (meteo_local_to_utc) pour prendre la valeur la plus
 * proche ; avant 1940, seulement la journée.
 * Résultats gardés dans DATA_DIR/cache/meteo-cache.sqlite (la clé change quand un fichier de données change).
 */

const METEO_COLS = [1 => 'TN', 2 => 'TX', 3 => 'T', 4 => 'RR', 5 => 'SN', 6 => 'FX', 7 => 'NN', 8 => 'SS', 9 => 'WW', 10 => 'Z'];
const METEO_KINDS = ['complet' => 3, 'europe' => 2, 'socle' => 1]; // ordre de préférence quand une station est dans deux fichiers
const METEO_MEASURED_KM = 15.0;
const METEO_STATION_KM = 40.0;
const METEO_MAX_ALT = 150.0;
const METEO_CACHE_VERSION = 4; // à monter quand le calcul change
const METEO_HEADER_SIZE = 4096;
const METEO_SOURCES_INFO = [
    'meteofrance' => ['Météo-France', 'Stations de France, chaque jour ; heure par heure (synoptiques)', '≈ 1850 / 1878 → 2025 ; heures depuis 1950', 'Socle (≈ 300) · Pack complet (toutes)', 'Licence Ouverte 2.0', 'Source : Météo-France'],
    'meteoswiss' => ['MétéoSuisse', 'Stations de Suisse, chaque jour', '1864 → 2025', 'Socle · Pack complet', 'CC BY 4.0', 'Source: MeteoSwiss'],
    'irm' => ['IRM / KMI', 'Stations de Belgique, chaque jour', '1995 → 2025', 'Socle · Pack complet', 'CC BY 4.0', 'Source : IRM / KMI'],
    'meteolux' => ['MeteoLux', 'Luxembourg-Findel, chaque jour', '1947 → 2025', 'Socle', 'CC0', 'Source : MeteoLux'],
    'dwd' => ['DWD (Deutscher Wetterdienst)', 'Stations d’Allemagne, chaque jour', '≈ 1880 → 2025', 'Pack Europe', 'Datenlizenz Deutschland – Namensnennung 2.0', 'Quelle: Deutscher Wetterdienst'],
    'copdem' => ['Copernicus DEM GLO-90', 'Altitude du sol : grille ≈ 1 km (30″), tirée du modèle à 90 m', '—', 'Socle (France, Belgique, Suisse, Luxembourg) · Pack Europe (en option)', 'Licence Copernicus DEM GLO-90 (libre, redistribution permise avec mention)', 'Altitudes : Copernicus DEM GLO-90 © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni dans le cadre de COPERNICUS par l’Union européenne et l’ESA'],
    'era5' => ['ERA5 (Copernicus)', 'Réanalyse : carreaux ≈ 30 km, 4 heures par jour (socle) ou toutes les heures (packs)', '1940 → 2025', 'Socle · Pack complet · Pack Europe', 'CC BY 4.0', 'Generated using Copernicus Climate Change Service information [2025]'],
    '20cr' => ['20CRv3 (NOAA / DOE)', 'Reconstitution quotidienne, ≈ 100 km', '1836 → 1939', 'Socle', 'CC BY 4.0 — usage libre avec mention', '20th Century Reanalysis V3, NOAA / DOE'],
];

/* ═════════════════════════ Les fichiers ═════════════════════════ */

/** Les dossiers où chercher : celui de l'app (socle livré) puis celui des données (packs importés). */
function meteo_dirs(): array
{
    $app = getenv('LCNDA_METEO_DIR') ?: APP_ROOT . '/data-meteo';
    return array_values(array_unique([rtrim($app, '/'), meteo_pack_dir()]));
}

function meteo_pack_dir(): string { return SHARED_DATA_DIR . '/meteo'; }

/** Les fichiers trouvés : [kind => ['path', 'kind', 'prio', 'size', 'mtime', 'where' => 'app'|'data']] (un seul par sorte : le dossier des données passe devant). */
function meteo_files(): array
{
    static $memo = null;
    if ($memo !== null) { return $memo; }
    $found = [];
    foreach (meteo_dirs() as $i => $dir) {
        foreach (array_keys(METEO_KINDS) as $kind) {
            $p = $dir . '/meteo-' . $kind . '.sqlite';
            if (is_file($p) && filesize($p) > 0) {
                $where = $dir === meteo_pack_dir() ? 'data' : 'app';
                if (!isset($found[$kind]) || $where === 'data') {
                    $found[$kind] = ['path' => $p, 'kind' => $kind, 'prio' => METEO_KINDS[$kind], 'size' => (int) filesize($p), 'mtime' => (int) filemtime($p), 'where' => $where];
                }
            }
        }
    }
    uasort($found, static fn($a, $b) => $b['prio'] <=> $a['prio']);
    return $memo = $found;
}

function meteo_pdo(string $path): ?PDO
{
    static $pool = [];
    if (array_key_exists($path, $pool)) { return $pool[$path]; }
    try {
        $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $opts[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $pdo = new PDO('sqlite:' . $path, null, null, $opts);
        $pdo->query('SELECT 1 FROM meta LIMIT 1');
        return $pool[$path] = $pdo;
    } catch (Throwable) {
        return $pool[$path] = null;
    }
}

/** Ce qui change quand un fichier de données change (pour le cache). */
function meteo_signature(): string
{
    $parts = [METEO_CACHE_VERSION];
    foreach (meteo_files() as $f) { $parts[] = $f['kind'] . ':' . $f['size'] . ':' . $f['mtime']; }
    return implode('|', $parts);
}

/* ═════════════════════════ Lire un bloc ═════════════════════════ */

/** gzinflate + en-tête (8 octets + codes des colonnes) + colonnes d'entiers 16 bits écrits en écarts → ['step', 'n', 'cols' => ['TN' => [...]]] */
function meteo_decode(string $blob): ?array
{
    $raw = @gzinflate($blob);
    if ($raw === false || strlen($raw) < 8) { return null; }
    $h = unpack('Cmagic/Cver/Cncols/Cstep/vnrows/vres', $raw);
    if ($h['magic'] !== 0x4D || $h['ver'] !== 1) { return null; }
    $n = $h['nrows']; $nc = $h['ncols'];
    if (strlen($raw) < 8 + $nc + 2 * $n * $nc) { return null; }
    $codes = $nc ? array_values(unpack('C*', substr($raw, 8, $nc))) : [];
    $pos = 8 + $nc; $cols = [];
    foreach ($codes as $code) {
        $vals = $n ? unpack('v*', substr($raw, $pos, 2 * $n)) : [];
        $pos += 2 * $n;
        $prev = 0; $col = [];
        foreach ($vals as $u) {
            if ($u === 0x8000) { $col[] = null; continue; }
            $prev += $u >= 0x8000 ? $u - 0x10000 : $u;
            $col[] = $prev;
        }
        $cols[METEO_COLS[$code] ?? (string) $code] = $col;
    }
    return ['step' => $h['step'], 'n' => $n, 'cols' => $cols];
}

/** un bloc d'une série (lu une fois par requête) */
function meteo_block(string $path, string $table, int $id, int $year): ?array
{
    static $memo = [];
    $k = "$path|$table|$id|$year";
    if (array_key_exists($k, $memo)) { return $memo[$k]; }
    if (count($memo) > 400) { $memo = []; }
    $pdo = meteo_pdo($path);
    if (!$pdo || !in_array($table, ['daily', 'hourly', 'grid_daily', 'grid_hourly'], true)) { return $memo[$k] = null; }
    $key = str_starts_with($table, 'grid') ? 'grid_id' : 'station_id';
    $s = $pdo->prepare("SELECT blob FROM $table WHERE $key=? AND annee=?");
    $s->execute([$id, $year]);
    $b = $s->fetchColumn();
    return $memo[$k] = is_string($b) ? meteo_decode($b) : null;
}

/** les valeurs d'un jour (n° du jour dans l'année, 0 = 1er janvier), en unités lisibles */
function meteo_row(array $block, int $i): ?array
{
    if ($i < 0 || $i >= $block['n']) { return null; }
    $c = $block['cols'];
    $g = static fn(string $k) => isset($c[$k][$i]) ? $c[$k][$i] : null;
    $d = static fn($v, float $f) => $v === null ? null : round($v * $f, 1);
    $row = ['tn' => $d($g('TN'), 0.1), 'tx' => $d($g('TX'), 0.1), 't' => $d($g('T'), 0.1), 'rr' => $d($g('RR'), 0.1), 'sn' => $g('SN'),
        'fx' => $g('FX') === null ? null : (int) round($g('FX') * 0.36), // 0,1 m/s → km/h
        'nn' => $g('NN'), 'ss' => $g('SS'), 'ww' => $g('WW')];
    return array_filter($row, static fn($v) => $v !== null) ?: null;
}

function meteo_doy(int $y, int $m, int $d): int { return (int) (new DateTimeImmutable(sprintf('%04d-%02d-%02d', $y, $m, $d)))->format('z'); }

/* ═════════════════════════ Distances, stations, carreaux ═════════════════════════ */

function meteo_km(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $r = 6371.0; $p = M_PI / 180;
    $a = sin(($lat2 - $lat1) * $p / 2) ** 2 + cos($lat1 * $p) * cos($lat2 * $p) * sin(($lon2 - $lon1) * $p / 2) ** 2;
    return 2 * $r * asin(min(1.0, sqrt($a)));
}

/** Les stations proches qui couvrent l'année, de la plus proche (distance + pénalité d'altitude) à la plus lointaine. */
function meteo_near_stations(float $lat, float $lon, ?float $alt, int $year, float $maxKm = METEO_STATION_KM, bool $anyYear = false): array
{
    $dLat = $maxKm / 111.0; $dLon = $maxKm / max(10.0, 111.0 * cos(deg2rad($lat)));
    $out = [];
    foreach (meteo_files() as $f) {
        $pdo = meteo_pdo($f['path']); if (!$pdo) { continue; }
        $sql = 'SELECT * FROM stations WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?' . ($anyYear ? '' : ' AND (debut IS NULL OR debut<=?) AND (fin IS NULL OR fin>=?)');
        $s = $pdo->prepare($sql);
        $s->execute($anyYear ? [$lat - $dLat, $lat + $dLat, $lon - $dLon, $lon + $dLon] : [$lat - $dLat, $lat + $dLat, $lon - $dLon, $lon + $dLon, $year, $year]);
        foreach ($s->fetchAll() as $st) {
            $key = $st['source'] . '|' . $st['code'];
            if (isset($out[$key])) { continue; } // déjà trouvée dans un fichier plus complet
            $km = meteo_km($lat, $lon, (float) $st['lat'], (float) $st['lon']);
            $dalt = ($alt !== null && $st['alt'] !== null) ? (float) $st['alt'] - $alt : null;
            $eff = $km + ($dalt !== null ? abs($dalt) / 10.0 : 0.0);
            if ($eff > $maxKm && !$anyYear) { continue; }
            $out[$key] = $st + ['file' => $f['path'], 'kind' => $f['kind'], 'km' => $km, 'dalt' => $dalt, 'eff' => $eff];
        }
    }
    $out = array_values($out);
    usort($out, static fn($a, $b) => $a['eff'] <=> $b['eff']);
    return $out;
}

/** Le carreau le plus proche d'une réanalyse (era5 ou 20cr) qui couvre l'année. */
function meteo_near_cell(string $source, float $lat, float $lon, int $year): ?array
{
    $best = null;
    foreach (meteo_files() as $f) {
        $pdo = meteo_pdo($f['path']); if (!$pdo) { continue; }
        $w = $source === '20cr' ? 1.0 : 0.35;
        $s = $pdo->prepare('SELECT * FROM grid WHERE source=? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND (debut IS NULL OR debut<=?) AND (fin IS NULL OR fin>=?)');
        $s->execute([$source, $lat - $w, $lat + $w, $lon - $w * 1.5, $lon + $w * 1.5, $year, $year]);
        foreach ($s->fetchAll() as $c) {
            $km = meteo_km($lat, $lon, (float) $c['lat'], (float) $c['lon']);
            if (!$best || $km < $best['km'] || ($km === $best['km'] && METEO_KINDS[$f['kind']] > METEO_KINDS[$best['kind']])) { $best = $c + ['file' => $f['path'], 'kind' => $f['kind'], 'km' => $km]; }
        }
    }
    return $best;
}

/** La première station connue près d'ici (pour « Pas de relevé connu près d'ici avant 1863 (première station : Toulouse) »). */
function meteo_first_station(float $lat, float $lon): ?array
{
    $first = null;
    foreach (meteo_near_stations($lat, $lon, null, 0, 120.0, true) as $st) {
        if ($st['km'] > 120 || $st['debut'] === null) { continue; }
        if (!$first || (int) $st['debut'] < (int) $first['debut'] || ((int) $st['debut'] === (int) $first['debut'] && $st['km'] < $first['km'])) { $first = $st; }
    }
    return $first ? ['name' => meteo_short_name((string) $first['nom']), 'year' => (int) $first['debut'], 'km' => (int) round($first['km'])] : null;
}

function meteo_short_name(string $n): string { return trim(preg_split('/\s+[–-]\s+/u', $n)[0] ?? $n); }

/* ═════════════════════════ Les altitudes (grille de 30″, Copernicus DEM GLO-90) ═════════════════════════ */

/** un carré de 1° de la grille des altitudes (table « elevation » du socle ou d'un pack) → ['n', 'z' => [...]] ou null */
function meteo_alt_tile(int $la, int $lo): ?array
{
    static $memo = [], $has = [];
    $k = "$la|$lo";
    if (array_key_exists($k, $memo)) { return $memo[$k]; }
    if (count($memo) > 64) { $memo = []; }
    foreach (meteo_files() as $f) {
        $pdo = meteo_pdo($f['path']); if (!$pdo) { continue; }
        $has[$f['path']] ??= (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='elevation'")->fetchColumn();
        if (!$has[$f['path']]) { continue; }
        $s = $pdo->prepare('SELECT n, blob FROM elevation WHERE lat0=? AND lon0=?'); $s->execute([$la, $lo]);
        if ($r = $s->fetch()) { $b = meteo_decode((string) $r['blob']); if ($b && isset($b['cols']['Z'])) { return $memo[$k] = ['n' => (int) $r['n'], 'z' => $b['cols']['Z']]; } }
    }
    return $memo[$k] = null;
}

/** l'altitude du sol en un point (m), par interpolation bilinéaire entre les 4 nœuds de la grille ; null si inconnue (mer, hors de la grille) */
function meteo_altitude(float $lat, float $lon): ?float
{
    $t = meteo_alt_tile((int) floor($lat), (int) floor($lon));
    if (!$t) { return null; }
    $n = $t['n'];
    $gy = $lat * $n; $gx = $lon * $n; $i0 = (int) floor($gy); $j0 = (int) floor($gx); $fy = $gy - $i0; $fx = $gx - $j0;
    $node = static function (int $i, int $j) use ($n): ?int {
        $la = intdiv($i - (($i % $n + $n) % $n), $n); $lo = intdiv($j - (($j % $n + $n) % $n), $n);
        $tt = meteo_alt_tile($la, $lo); if (!$tt || $tt['n'] !== $n) { return null; }
        return $tt['z'][($i - $la * $n) * $n + ($j - $lo * $n)] ?? null;
    };
    $sum = 0.0; $w = 0.0;
    foreach ([[0, 0, (1 - $fy) * (1 - $fx)], [0, 1, (1 - $fy) * $fx], [1, 0, $fy * (1 - $fx)], [1, 1, $fy * $fx]] as [$di, $dj, $wt]) {
        $z = $node($i0 + $di, $j0 + $dj);
        if ($z !== null && $wt > 0) { $sum += $z * $wt; $w += $wt; }
    }
    return $w > 0 ? round($sum / $w, 1) : null;
}

/** GET meteo_place&id= → l'altitude d'un lieu : saisie (ou null = automatique) et celle de la carte du relief */
function meteo_place_data(PDO $pdo, int $id): array
{
    meteo_place_column($pdo);
    $s = $pdo->prepare('SELECT id, name, county, country, latitude, longitude, altitude FROM places WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch();
    if (!$p) { throw new RuntimeException('Lieu introuvable.'); }
    $auto = $p['latitude'] !== null && $p['longitude'] !== null ? meteo_altitude((float) $p['latitude'], (float) $p['longitude']) : null;
    return ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'county' => (string) $p['county'], 'altitude' => $p['altitude'] === null ? null : (float) $p['altitude'],
        'auto' => $auto === null ? null : (int) round($auto), 'has_coords' => $p['latitude'] !== null && $p['longitude'] !== null];
}

function meteo_place_column(PDO $pdo): void
{
    if (!in_array('altitude', array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(), 'name'), true)) { throw new RuntimeException('La base doit d’abord être mise à jour (structure n° 64).'); }
}

/** POST meteo_place_altitude {id, altitude} : altitude saisie à la main (m), ou null = « ↺ Remettre l'altitude de la carte » */
function meteo_place_altitude_save(PDO $pdo, array $data): array
{
    meteo_place_column($pdo);
    $id = (int) ($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$id]); $before = $s->fetch();
    if (!$before) { throw new RuntimeException('Lieu introuvable.'); }
    $v = $data['altitude'] ?? null;
    if ($v === '' || $v === null) { $alt = null; }
    else {
        $v = str_replace([' ', ' ', ','], ['', '', '.'], (string) $v);
        if (!is_numeric($v) || (float) $v < -450 || (float) $v > 8900) { throw new RuntimeException('Altitude impossible : entre −450 et 8 900 m.'); }
        $alt = round((float) $v, 1);
    }
    $pdo->prepare('UPDATE places SET altitude=? WHERE id=?')->execute([$alt, $id]);
    if (function_exists('log_change')) { log_change($pdo, 'place', $id, 'update', $alt === null ? 'Altitude du lieu remise à celle de la carte : ' . $before['name'] : 'Altitude du lieu : ' . $before['name'] . ' (' . $alt . ' m)', $before, ['altitude' => $alt]); }
    return meteo_place_data($pdo, $id);
}

/* ═════════════════════════ L'heure de l'acte ═════════════════════════ */

/** Le pays (FR, BE, CH, LU, ou '') d'après le texte du lieu, sinon d'après les coordonnées. */
function meteo_country(string $text, ?float $lat = null, ?float $lon = null): string
{
    $t = mb_strtolower(trim($text));
    if ($t !== '') {
        if (preg_match('/\b(france|fr|fra)\b/u', $t)) { return 'FR'; }
        if (preg_match('/belg|\bbe\b|belgië|belgien/u', $t)) { return 'BE'; }
        if (preg_match('/suisse|switz|schweiz|svizzera|\bch\b/u', $t)) { return 'CH'; }
        if (preg_match('/luxem|\blu\b/u', $t)) { return 'LU'; }
        return 'XX';
    }
    if ($lat === null || $lon === null) { return ''; }
    if ($lat >= 49.44 && $lat <= 50.19 && $lon >= 5.73 && $lon <= 6.53) { return 'LU'; }
    if ($lat >= 45.8 && $lat <= 47.81 && $lon >= 6.0 && $lon <= 10.5 && !($lon < 7.0 && $lat > 47.5)) { return 'CH'; }
    if ($lat >= 50.1 && $lat <= 51.51 && $lon >= 2.55 && $lon <= 6.4 && $lat > 50.75 - ($lon - 2.55) * 0.12) { return 'BE'; }
    if ($lat >= 41.3 && $lat <= 51.1 && $lon >= -5.2 && $lon <= 9.6) { return 'FR'; }
    return 'XX';
}

/** La zone occupée de 1940 (ligne de démarcation, tracé simplifié) : nord et ouest de la ligne. */
function meteo_occupied_zone(float $lat, float $lon): bool
{
    static $poly = [[-1.24, 43.16], [-0.85, 43.6], [-0.5, 43.9], [-0.24, 44.55], [-0.24, 44.92], [0.15, 45.65], [0.67, 46.01], [0.85, 46.6],
        [1.0, 47.13], [2.07, 47.22], [2.5, 46.72], [3.33, 46.57], [4.1, 46.45], [4.85, 46.78], [5.49, 47.1], [6.0, 46.4],
        [9.0, 49.0], [9.0, 52.0], [-6.0, 52.0], [-6.0, 43.3], [-1.8, 43.3]];
    $in = false; $n = count($poly);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        [$xi, $yi] = $poly[$i]; [$xj, $yj] = $poly[$j];
        if ((($yi > $lat) !== ($yj > $lat)) && ($lon < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-9) + $xi)) { $in = !$in; }
    }
    return $in;
}

function meteo_last_sunday(int $y, int $m): string
{
    $d = new DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m));
    $d = $d->modify('last day of this month');
    while ((int) $d->format('w') !== 0) { $d = $d->modify('-1 day'); }
    return $d->format('Y-m-d');
}

/** Heure d'été « Europe » (1976 → aujourd'hui pour la France ; 1977 Belgique, Luxembourg ; 1981 Suisse) */
function meteo_eu_summer(string $date, string $cc): bool
{
    $y = (int) substr($date, 0, 4);
    $from = ['FR' => 1976, 'BE' => 1977, 'LU' => 1977, 'CH' => 1981][$cc] ?? 9999;
    if ($y < $from) { return false; }
    $early = [1976 => ['03-28', '09-26'], 1977 => ['04-03', '09-25'], 1978 => ['04-02', '10-01'], 1979 => ['04-01', '09-30'], 1980 => ['04-06', '09-28']];
    if (isset($early[$y])) { [$a, $b] = $early[$y]; return $date >= "$y-$a" && $date < "$y-$b"; }
    $end = $y >= 1996 ? meteo_last_sunday($y, 10) : meteo_last_sunday($y, 9);
    return $date >= meteo_last_sunday($y, 3) && $date < $end;
}

/** Heure d'été de l'entre-deux-guerres (France, Belgique, Luxembourg : règles principales) */
function meteo_old_summer(string $date): bool
{
    static $t = [1916 => ['06-14', '10-02'], 1917 => ['03-24', '10-08'], 1918 => ['03-09', '10-07'], 1919 => ['03-01', '10-06'], 1920 => ['02-14', '10-24'],
        1921 => ['03-14', '10-26'], 1922 => ['03-25', '10-08'], 1923 => ['05-26', '10-07'], 1924 => ['03-29', '10-05'], 1925 => ['04-04', '10-04'],
        1926 => ['04-17', '10-03'], 1927 => ['04-09', '10-02'], 1928 => ['04-14', '10-07'], 1929 => ['04-20', '10-06'], 1930 => ['04-12', '10-05'],
        1931 => ['04-18', '10-04'], 1932 => ['04-02', '10-02'], 1933 => ['03-25', '10-08'], 1934 => ['04-07', '10-07'], 1935 => ['03-30', '10-06'],
        1936 => ['04-18', '10-04'], 1937 => ['04-03', '10-03'], 1938 => ['03-26', '10-02'], 1939 => ['04-15', '11-19'], 1940 => ['02-25', '12-31']];
    $y = (int) substr($date, 0, 4);
    if (!isset($t[$y])) { return false; }
    return $date >= "$y-{$t[$y][0]}" && $date < "$y-{$t[$y][1]}";
}

/** Heure allemande pendant les occupations (1940–1944) : décalage en minutes */
function meteo_german_1940(string $date): int
{
    if ($date < '1942-11-02') { return 120; } // heure d'été allemande sans interruption de 1940 à novembre 1942
    if ($date < '1943-03-29') { return 60; }
    if ($date < '1943-10-04') { return 120; }
    if ($date < '1944-04-03') { return 60; }
    return 120;
}

/**
 * Décalage (minutes à l'est de l'heure universelle) de l'heure écrite dans un acte, et son nom.
 * France : heure solaire du lieu avant le 15/03/1891, heure de Paris (UTC+0:09:21) jusqu'au 10/03/1911, puis GMT et ses heures
 * d'été, heure allemande en zone occupée (1940–1944), heure légale UTC+1 ensuite (+ été depuis 1976). Belgique, Suisse,
 * Luxembourg : leurs règles principales. Ailleurs : le fuseau de la longitude.
 */
function meteo_offset(string $date, float $lat, float $lon, string $cc, string $placeName = ''): array
{
    $solar = [round($lon * 4, 2), 'heure solaire' . ($placeName !== '' ? ' de ' . $placeName : ' du lieu')];
    switch ($cc) {
        case 'FR':
            if ($date < '1891-03-15') { return $solar; }
            if ($date < '1911-03-11') { return [9 + 21 / 60, 'heure de Paris']; }
            if ($date < '1940-06-14') { return meteo_old_summer($date) ? [60, 'heure d’été (UTC+1)'] : [0, 'heure légale (UTC)']; }
            if ($date < '1944-08-25') {
                if ($date >= '1942-11-02' || meteo_occupied_zone($lat, $lon)) { $o = meteo_german_1940($date); return [$o, 'heure allemande (UTC+' . ($o / 60) . ')']; }
                return [in_array(substr($date, 0, 4), ['1941', '1942'], true) && $date >= substr($date, 0, 4) . '-05-05' && $date < substr($date, 0, 4) . '-10-06' ? 120 : 60, 'heure de la zone libre'];
            }
            if ($date < '1944-10-08') { return [120, 'heure de la Libération (UTC+2)']; }
            if ($date < '1945-04-02') { return [60, 'heure légale (UTC+1)']; }
            if ($date < '1945-09-16') { return [120, 'heure d’été (UTC+2)']; }
            return meteo_eu_summer($date, 'FR') ? [120, 'heure d’été (UTC+2)'] : [60, 'heure légale (UTC+1)'];
        case 'BE':
            if ($date < '1880-01-01') { return $solar; }
            if ($date < '1892-05-01') { return [17.5, 'heure de Bruxelles']; }
            if ($date < '1914-11-08') { return [0, 'heure légale (UTC)']; }
            if ($date < '1918-11-11') { return (meteo_old_summer($date) ? [120, 'heure allemande d’été (UTC+2)'] : [60, 'heure allemande (UTC+1)']); }
            if ($date < '1940-05-20') { return meteo_old_summer($date) ? [60, 'heure d’été (UTC+1)'] : [0, 'heure légale (UTC)']; }
            if ($date < '1944-09-03') { $o = meteo_german_1940(max($date, '1940-06-14')); return [$o, 'heure allemande (UTC+' . ($o / 60) . ')']; }
            if (($date >= '1945-04-02' && $date < '1945-09-16') || ($date >= '1946-05-19' && $date < '1946-10-07')) { return [120, 'heure d’été (UTC+2)']; }
            return meteo_eu_summer($date, 'BE') ? [120, 'heure d’été (UTC+2)'] : [60, 'heure légale (UTC+1)'];
        case 'LU':
            if ($date < '1904-06-01') { return $solar; }
            if ($date < '1918-11-25') { return meteo_old_summer($date) ? [120, 'heure d’été (UTC+2)'] : [60, 'heure légale (UTC+1)']; }
            if ($date < '1940-05-14') { return meteo_old_summer($date) ? [60, 'heure d’été (UTC+1)'] : [0, 'heure légale (UTC)']; }
            if ($date < '1944-09-18') { $o = meteo_german_1940(max($date, '1940-06-14')); return [$o, 'heure allemande (UTC+' . ($o / 60) . ')']; }
            if (($date >= '1945-04-02' && $date < '1945-09-16') || ($date >= '1946-05-19' && $date < '1946-10-07')) { return [120, 'heure d’été (UTC+2)']; }
            return meteo_eu_summer($date, 'LU') ? [120, 'heure d’été (UTC+2)'] : [60, 'heure légale (UTC+1)'];
        case 'CH':
            if ($date < '1853-07-16') { return $solar; }
            if ($date < '1894-06-01') { return [29 + 46 / 60, 'heure de Berne']; }
            if (($date >= '1941-05-05' && $date < '1941-10-06') || ($date >= '1942-05-04' && $date < '1942-10-05')) { return [120, 'heure d’été (UTC+2)']; }
            return meteo_eu_summer($date, 'CH') ? [120, 'heure d’été (UTC+2)'] : [60, 'heure légale (UTC+1)'];
    }
    if ($date < '1900-01-01') { return $solar; }
    $z = (int) round($lon / 15);
    return [$z * 60, 'fuseau UTC' . ($z >= 0 ? '+' : '−') . abs($z) . ' (sans heure d’été)'];
}

/** « 14:30 » ou « 3 heures du matin » → minutes depuis minuit (ou null) */
function meteo_parse_time(string $t): ?int
{
    $s = mb_strtolower(trim($t));
    if ($s === '') { return null; }
    $s = preg_replace('/^(à|a|vers|le)\s+/u', '', $s);
    if (preg_match('/^midi/u', $s)) { $s = '12 h' . (str_contains($s, 'demi') ? ' 30' : (str_contains($s, 'quart') ? ' 15' : '')); }
    if (preg_match('/^minuit/u', $s)) { $s = '0 h' . (str_contains($s, 'demi') ? ' 30' : (str_contains($s, 'quart') ? ' 15' : '')); }
    $pm = (bool) preg_match('/(apr[eè]s-midi|du soir|pm)\s*$/u', $s);
    $s = preg_replace('/\s*(heures?|hr)\b/u', ' h', $s);
    if (!preg_match('/^(\d{1,2})\s*(?:h|:|\.)?\s*(\d{2})?/u', $s, $m)) { return null; }
    $h = (int) $m[1]; $mi = isset($m[2]) && $m[2] !== '' ? (int) $m[2] : 0;
    if (preg_match('/et demie?/u', $s)) { $mi = 30; } elseif (preg_match('/et quart/u', $s)) { $mi = 15; }
    if ($pm && $h < 12) { $h += 12; }
    if ($h > 24 || $mi > 59) { return null; }
    return ($h % 24) * 60 + $mi;
}

function meteo_hm(float $hours): string
{
    $m = (int) round($hours * 60); $m = (($m % 1440) + 1440) % 1440;
    return intdiv($m, 60) . ' h' . ($m % 60 ? ' ' . str_pad((string) ($m % 60), 2, '0', STR_PAD_LEFT) : '');
}

/** L'heure de l'acte (heure locale de l'époque) → ['date' => jour UTC, 'hour' => heure UTC décimale, 'zone', 'label', 'offset'] */
function meteo_local_to_utc(string $date, string $time, float $lat, float $lon, string $cc, string $placeName = ''): ?array
{
    $min = meteo_parse_time($time);
    if ($min === null) { return null; }
    [$off, $zone] = meteo_offset($date, $lat, $lon, $cc, $placeName);
    $utcMin = $min - $off;
    $day = new DateTimeImmutable($date);
    while ($utcMin < 0) { $utcMin += 1440; $day = $day->modify('-1 day'); }
    while ($utcMin >= 1440) { $utcMin -= 1440; $day = $day->modify('+1 day'); }
    $hour = $utcMin / 60;
    return ['date' => $day->format('Y-m-d'), 'hour' => round($hour, 3), 'zone' => $zone, 'offset' => $off,
        'label' => meteo_hm($min / 60) . ', ' . $zone . ' ≈ ' . meteo_hm($hour) . ' UTC'];
}

/* ═════════════════════════ Le temps d'un jour ═════════════════════════ */

/** les mentions des sources utilisées */
function meteo_source_rows(array $ids): array
{
    $out = []; $ids = array_values(array_unique(array_filter($ids)));
    foreach ($ids as $id) {
        $row = null;
        foreach (meteo_files() as $f) {
            $pdo = meteo_pdo($f['path']); if (!$pdo) { continue; }
            $s = $pdo->prepare('SELECT id, nom, licence, mention, url FROM sources WHERE id=?'); $s->execute([$id]);
            if ($r = $s->fetch()) { $row = $r; break; }
        }
        $info = METEO_SOURCES_INFO[$id] ?? null;
        $out[] = $row ?: ['id' => $id, 'nom' => $info[0] ?? $id, 'licence' => $info[4] ?? '', 'mention' => $info[5] ?? $id, 'url' => ''];
    }
    return $out;
}

/** la normale « 30 ans autour » d'une série, pour un mois : période finissant sur la dizaine (1926 → 1901–1930) */
function meteo_normal(string $path, string $sorte, int $ref, int $year, int $month): ?array
{
    $pdo = meteo_pdo($path); if (!$pdo) { return null; }
    $target = min(2020, max(1870, (int) (ceil($year / 10) * 10)));
    $s = $pdo->prepare('SELECT debut, fin, blob FROM normals WHERE sorte=? AND ref_id=? ORDER BY ABS(fin-?) LIMIT 1');
    $s->execute([$sorte, $ref, $target]);
    $r = $s->fetch();
    if (!$r) { return null; }
    $b = meteo_decode((string) $r['blob']);
    if (!$b) { return null; }
    $row = meteo_row($b, $month - 1);
    if (!$row || !isset($row['tn'], $row['tx'])) { return null; }
    return ['period' => $r['debut'] . '–' . $r['fin'], 'tn' => $row['tn'], 'tx' => $row['tx'], 'rr' => $row['rr'] ?? null];
}

/**
 * Le temps d'un jour en un point. $date = « AAAA-MM-JJ » (jour de l'acte), $time = heure écrite (« 06:30 ») ou null.
 * $opt : country (texte), place (nom), detail (true : jours autour, heures, normale), alt (altitude du lieu).
 */
function meteo_day(float $lat, float $lon, ?float $alt, string $date, ?string $time = null, array $opt = []): array
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { return ['ok' => false, 'reliability' => 'none', 'why' => 'date']; }
    $y = (int) $m[1]; $mo = (int) $m[2]; $d = (int) $m[3];
    $files = meteo_files();
    if (!$files) { return ['ok' => false, 'reliability' => 'none', 'why' => 'nodata']; }
    $detail = !empty($opt['detail']);
    $placeName = (string) ($opt['place'] ?? '');
    $cc = meteo_country((string) ($opt['country'] ?? ''), $lat, $lon);
    $res = ['ok' => true, 'date' => $date, 'lat' => $lat, 'lon' => $lon];
    // l'altitude du lieu : saisie sur la fiche du lieu > grille des altitudes (carte du relief) > rien (pas de pénalité)
    if ($alt !== null) { $res['alt'] = ['m' => (int) round($alt), 'from' => 'saisie']; }
    elseif (($ga = meteo_altitude($lat, $lon)) !== null) { $alt = $ga; $res['alt'] = ['m' => (int) round($ga), 'from' => 'carte']; }
    $utc = $time ? meteo_local_to_utc($date, $time, $lat, $lon, $cc, $placeName) : null;
    if ($utc) { $res['time'] = $utc + ['local' => $time]; }
    $i = meteo_doy($y, $mo, $d);
    $sources = [];

    // 1. une station (proche, qui a mesuré ce jour-là)
    $pick = null;
    foreach (meteo_near_stations($lat, $lon, $alt, $y) as $st) {
        $b = meteo_block($st['file'], 'daily', (int) $st['id'], $y);
        $row = $b ? meteo_row($b, $i) : null;
        if ($row && (isset($row['tn']) || isset($row['tx']))) { $pick = ['st' => $st, 'row' => $row]; break; }
    }
    $series = null; // [file, table, id, sorte] de la série qui donne la journée
    if ($pick) {
        $st = $pick['st'];
        $measured = $st['eff'] < METEO_MEASURED_KM && ($st['dalt'] === null || abs($st['dalt']) < METEO_MAX_ALT);
        $res += ['reliability' => $measured ? 'measured' : 'station', 'day' => $pick['row'],
            'station' => ['name' => (string) $st['nom'], 'short' => meteo_short_name((string) $st['nom']), 'km' => round($st['km'], 1), 'dalt' => $st['dalt'] === null ? null : (int) round($st['dalt']), 'alt' => $st['alt'] === null ? null : (int) round((float) $st['alt']), 'country' => $st['pays'], 'source' => $st['source'], 'lat' => (float) $st['lat'], 'lon' => (float) $st['lon']]];
        if (!$measured) { $res['regional_rain'] = true; }
        $sources[] = $st['source'];
        $series = [$st['file'], 'daily', (int) $st['id'], 'station'];
    } elseif ($y >= 1940 && ($cell = meteo_near_cell('era5', $lat, $lon, $y))) {
        $b = meteo_block($cell['file'], 'grid_daily', (int) $cell['id'], $y);
        if ($b && ($row = meteo_row($b, $i))) {
            $res += ['reliability' => 'estimated', 'day' => $row];
            $res['cell'] = ['source' => 'era5', 'lat' => (float) $cell['lat'], 'lon' => (float) $cell['lon'], 'km' => round($cell['km'], 1)];
            $sources[] = 'era5'; $series = [$cell['file'], 'grid_daily', (int) $cell['id'], 'grid'];
        }
    } elseif ($y >= 1836 && $y < 1940 && ($cell = meteo_near_cell('20cr', $lat, $lon, $y))) {
        $b = meteo_block($cell['file'], 'grid_daily', (int) $cell['id'], $y);
        if ($b && ($row = meteo_row($b, $i))) {
            $res += ['reliability' => 'coarse', 'day' => $row];
            $res['cell'] = ['source' => '20cr', 'lat' => (float) $cell['lat'], 'lon' => (float) $cell['lon'], 'km' => round($cell['km'], 1)];
            $sources[] = '20cr'; $series = [$cell['file'], 'grid_daily', (int) $cell['id'], 'grid'];
        }
    }
    if (!$series) {
        $res['ok'] = false; $res['reliability'] = 'none'; $res['why'] = 'far';
        $res['first'] = meteo_first_station($lat, $lon);
        return $res;
    }

    // 2. les heures (1940 →) : la station si elle a l'heure par heure (pack complet), sinon le carreau ERA5 (4 par jour)
    $hours = []; $hoursSource = null;
    if ($y >= 1940) {
        if ($pick && $pick['st']['heures_debut'] !== null && (int) $pick['st']['heures_debut'] <= $y && ($hb = meteo_block($pick['st']['file'], 'hourly', (int) $pick['st']['id'], $y))) {
            $hours = meteo_hours_of_day($hb, $i); $hoursSource = 'station ' . meteo_short_name((string) $pick['st']['nom']);
        }
        if (!$hours && ($cell = meteo_near_cell('era5', $lat, $lon, $y)) && ($hb = meteo_block($cell['file'], 'grid_hourly', (int) $cell['id'], $y))) {
            $hours = meteo_hours_of_day($hb, $i); $hoursSource = 'ERA5, carreau ≈ 30 km';
            if ($hours) { $sources[] = 'era5'; }
        }
    }
    if ($hours) {
        $four = array_values(array_filter($hours, static fn($h) => in_array($h['h'], [0, 6, 12, 18], true)));
        $res['hours'] = count($four) === 4 ? $four : array_slice($hours, 0, 4);
        $res['hours_source'] = $hoursSource;
    }
    // le moment de l'acte : la valeur la plus proche (le jour de l'heure universelle peut être la veille)
    if ($utc) {
        $moment = null;
        if ($hours) {
            $all = $utc['date'] === $date ? $hours : (($hb2 = meteo_hours_block_for($pick, $lat, $lon, $utc['date'])) ? $hb2 : $hours);
            foreach ($all as $h) { if ($moment === null || abs($h['h'] - $utc['hour']) < abs($moment['h'] - $utc['hour'])) { $moment = $h; } }
            if ($moment && isset($moment['t'])) { $res['moment'] = ['h' => $moment['h'], 't' => $moment['t'], 'kind' => 'hour', 'label' => meteo_hm($moment['h']) . ' UTC']; }
        } else {
            // avant 1940 (ou sans heures) : la journée seulement — la nuit, on prend le minimum ; le jour, le maximum
            $local = meteo_parse_time((string) $time) / 60;
            $night = $local < 9 || $local >= 21;
            $t = $night ? ($res['day']['tn'] ?? null) : ($res['day']['tx'] ?? null);
            if ($t !== null) { $res['moment'] = ['t' => $t, 'kind' => $night ? 'night' : 'day']; }
        }
    }

    // 3. la normale (30 ans autour) et l'écart
    $norm = meteo_normal($series[0], $series[3], $series[2], $y, $mo);
    if ($norm) {
        $day = $res['day'];
        if (isset($day['tn'], $day['tx'])) { $norm['anomaly'] = round((($day['tn'] + $day['tx']) / 2) - (($norm['tn'] + $norm['tx']) / 2), 1); }
        $norm['month'] = $mo;
        $res['normal'] = $norm;
    }

    // 4. les jours autour (détail) : 3 avant, 3 après
    if ($detail) {
        $around = [];
        $base = new DateTimeImmutable($date);
        for ($k = -3; $k <= 3; $k++) {
            $dd = $base->modify(($k >= 0 ? '+' : '') . $k . ' day');
            $yy = (int) $dd->format('Y');
            $bb = meteo_block($series[0], $series[1], $series[2], $yy);
            $row = $bb ? meteo_row($bb, (int) $dd->format('z')) : null;
            $around[] = ['date' => $dd->format('Y-m-d'), 'day' => $row, 'on' => $k === 0];
        }
        $res['around'] = $around;
    }
    $res['sources'] = meteo_source_rows($sources);
    return $res;
}

/** les heures d'un jour d'un bloc horaire → [['h' => 0, 't' => …, 'rr' => …, 'fx' => …, 'nn' => …], …] (heures UTC) */
function meteo_hours_of_day(array $block, int $dayIndex): array
{
    $step = max(1, (int) $block['step']); $per = intdiv(24, $step);
    $out = [];
    for ($k = 0; $k < $per; $k++) {
        $row = meteo_row($block, $dayIndex * $per + $k);
        if ($row) { $out[] = ['h' => $k * $step] + $row; }
    }
    return $out;
}

/** les heures d'un autre jour (quand l'heure universelle tombe la veille ou le lendemain) */
function meteo_hours_block_for(?array $pick, float $lat, float $lon, string $date): array
{
    $y = (int) substr($date, 0, 4); $i = (int) (new DateTimeImmutable($date))->format('z');
    if ($pick && $pick['st']['heures_debut'] !== null && ($hb = meteo_block($pick['st']['file'], 'hourly', (int) $pick['st']['id'], $y))) {
        $h = meteo_hours_of_day($hb, $i); if ($h) { return $h; }
    }
    if (($cell = meteo_near_cell('era5', $lat, $lon, $y)) && ($hb = meteo_block($cell['file'], 'grid_hourly', (int) $cell['id'], $y))) { return meteo_hours_of_day($hb, $i); }
    return [];
}

/* ═════════════════════════ Les événements de la base ═════════════════════════ */

/** le jour exact d'un événement (grégorien), ou null si la date n'est pas sûre au jour près */
function meteo_event_date(array $e): ?string
{
    $text = (string) (($e['date_calendar'] ?? 'gregorian') !== 'gregorian' && trim((string) ($e['date_converted'] ?? '')) !== '' ? $e['date_converted'] : ($e['date_text'] ?? ''));
    $p = cal_parse_date($text);
    if (!$p || $p[2] === null || $p[1] === null || $p[3]) { return null; }
    if (!empty($e['date_uncertain'])) { return null; }
    return sprintf('%04d-%02d-%02d', $p[0], $p[1], $p[2]);
}

function meteo_event_rows(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $ids = array_slice($ids, 0, 400);
    $cols = array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(), 'name');
    $extra = (in_array('event_time', $cols, true) ? ', e.event_time' : ", '' AS event_time") . (in_array('date_uncertain', $cols, true) ? ', e.date_uncertain' : ', 0 AS date_uncertain')
        . (in_array('precise_lat', $cols, true) ? ', e.precise_lat, e.precise_lon' : ', NULL AS precise_lat, NULL AS precise_lon');
    $alt = in_array('altitude', array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(), 'name'), true) ? ', pl.altitude AS alt' : ', NULL AS alt';
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $s = $pdo->prepare("SELECT e.id, e.person_id, e.family_id, e.place_id, e.date_text, e.date_calendar, e.date_converted, e.year, t.gedcom_tag AS tag, t.label AS type_label,
            pl.name AS place_name, pl.county, pl.country, pl.latitude AS lat, pl.longitude AS lon$alt $extra
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id IN ($marks)");
    $s->execute($ids);
    return $s->fetchAll();
}

/** le temps d'un événement de la base (avec cache) */
function meteo_for_event(array $e, bool $detail = false): array
{
    $lat = $e['precise_lat'] !== null && $e['precise_lat'] !== '' ? (float) $e['precise_lat'] : ($e['lat'] !== null && $e['lat'] !== '' ? (float) $e['lat'] : null);
    $lon = $e['precise_lon'] !== null && $e['precise_lon'] !== '' ? (float) $e['precise_lon'] : ($e['lon'] !== null && $e['lon'] !== '' ? (float) $e['lon'] : null);
    $base = ['event_id' => (int) $e['id'], 'tag' => (string) $e['tag'], 'type' => (string) $e['type_label'], 'place' => (string) ($e['place_name'] ?? ''), 'place_id' => (int) ($e['place_id'] ?? 0)];
    $date = meteo_event_date($e);
    if (!$date) { return $base + ['ok' => false, 'reliability' => 'none', 'why' => 'date']; }
    if ($lat === null || $lon === null || ($lat == 0.0 && $lon == 0.0)) { return $base + ['ok' => false, 'reliability' => 'none', 'why' => 'place', 'date' => $date]; }
    $time = trim((string) ($e['event_time'] ?? '')) ?: null;
    $alt = isset($e['alt']) && is_numeric($e['alt']) ? (float) $e['alt'] : null;
    $key = md5(meteo_signature() . "|$lat|$lon|$alt|$date|$time|" . ($detail ? 1 : 0) . '|' . ($e['country'] ?? ''));
    $hit = meteo_cache_get($key);
    if ($hit !== null) { return $base + $hit; }
    $r = meteo_day($lat, $lon, $alt, $date, $time, ['detail' => $detail, 'place' => (string) ($e['place_name'] ?? ''), 'country' => (string) ($e['country'] ?? '')]);
    meteo_cache_set($key, $r);
    return $base + $r;
}

function meteo_cache_pdo(): ?PDO
{
    static $c = false;
    if ($c !== false) { return $c; }
    try {
        $dir = DATA_DIR . '/cache';
        if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
        $c = new PDO('sqlite:' . $dir . '/meteo-cache.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $c->exec('PRAGMA journal_mode=WAL'); $c->exec('PRAGMA busy_timeout=2000');
        $c->exec('CREATE TABLE IF NOT EXISTS cache(k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)');
    } catch (Throwable) { $c = null; }
    return $c;
}

function meteo_cache_get(string $k): ?array
{
    $c = meteo_cache_pdo(); if (!$c) { return null; }
    try { $s = $c->prepare('SELECT v FROM cache WHERE k=?'); $s->execute([$k]); $v = $s->fetchColumn(); return is_string($v) ? (json_decode($v, true) ?: null) : null; } catch (Throwable) { return null; }
}

function meteo_cache_set(string $k, array $v): void
{
    $c = meteo_cache_pdo(); if (!$c) { return; }
    try { $c->prepare('INSERT OR REPLACE INTO cache(k, v, at) VALUES(?,?,?)')->execute([$k, json_encode($v, JSON_UNESCAPED_UNICODE), time()]); } catch (Throwable) {}
}

/* ═════════════════════════ Réponses de l'API ═════════════════════════ */

/** GET meteo_events&ids=1,2,3 → le résumé de chaque événement (pastilles M1) */
function meteo_events_data(PDO $pdo, string $ids): array
{
    $out = [];
    if (!meteo_files()) { return ['installed' => false, 'events' => (object) []]; }
    foreach (meteo_event_rows($pdo, explode(',', $ids)) as $e) { $out[(string) $e['id']] = meteo_for_event($e); }
    return ['installed' => true, 'events' => (object) $out];
}

/** GET meteo_event&id= → le détail d'un jour (M2) */
function meteo_event_data(PDO $pdo, int $id): array
{
    $rows = meteo_event_rows($pdo, [$id]);
    if (!$rows) { throw new RuntimeException('Événement introuvable.'); }
    $e = $rows[0];
    $r = meteo_for_event($e, true);
    $who = '';
    if ($e['person_id']) { $s = $pdo->prepare("SELECT trim(first_name||' '||upper(last_name)) FROM persons WHERE id=?"); $s->execute([(int) $e['person_id']]); $who = (string) $s->fetchColumn(); }
    elseif ($e['family_id']) {
        $s = $pdo->prepare("SELECT trim(COALESCE(a.first_name,'')||' '||upper(COALESCE(a.last_name,''))), trim(COALESCE(b.first_name,'')||' '||upper(COALESCE(b.last_name,''))) FROM families f LEFT JOIN persons a ON a.id=f.partner1_id LEFT JOIN persons b ON b.id=f.partner2_id WHERE f.id=?");
        $s->execute([(int) $e['family_id']]); $w = $s->fetch(PDO::FETCH_NUM); $who = $w ? implode(' et ', array_filter($w)) : '';
    }
    return ['installed' => (bool) meteo_files(), 'result' => $r + ['who' => $who, 'person_id' => (int) ($e['person_id'] ?? 0), 'family_id' => (int) ($e['family_id'] ?? 0), 'time_text' => (string) ($e['event_time'] ?? '')]];
}

/** GET meteo_point&lat&lon&date&time&country → le détail en un point (essais, carte) */
function meteo_point_data(array $q): array
{
    $lat = (float) ($q['lat'] ?? 0); $lon = (float) ($q['lon'] ?? 0);
    if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) { throw new RuntimeException('Coordonnées impossibles.'); }
    $alt = isset($q['alt']) && is_numeric($q['alt']) ? (float) $q['alt'] : null;
    $time = trim((string) ($q['time'] ?? '')) ?: null;
    return ['installed' => (bool) meteo_files(), 'result' => meteo_day($lat, $lon, $alt, (string) ($q['date'] ?? ''), $time, ['detail' => ($q['detail'] ?? '1') === '1', 'country' => (string) ($q['country'] ?? ''), 'place' => mb_substr((string) ($q['place'] ?? ''), 0, 80)])];
}

/** GET meteo_time&date&time&lat&lon&country&place → « ✓ Compris : 3 h, heure solaire de Lectoure ≈ 2 h 57 UTC » (M9) */
function meteo_time_data(array $q, ?PDO $pdo = null): array
{
    $date = (string) ($q['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $p = cal_parse_date($date);
        if (!$p || $p[1] === null || $p[2] === null) { return ['ok' => false]; }
        $date = sprintf('%04d-%02d-%02d', $p[0], $p[1], $p[2]);
    }
    $lat = (float) ($q['lat'] ?? 46.5); $lon = (float) ($q['lon'] ?? 2.3); $country = (string) ($q['country'] ?? ''); $place = mb_substr((string) ($q['place'] ?? ''), 0, 80);
    if ($pdo && safe_int($q['place_id'] ?? 0)) { // le lieu choisi dans la fenêtre de l'événement
        $s = $pdo->prepare('SELECT name, country, latitude, longitude FROM places WHERE id=?'); $s->execute([safe_int($q['place_id'])]);
        if ($pl = $s->fetch()) { $place = (string) $pl['name']; $country = (string) $pl['country']; if ($pl['latitude'] !== null && $pl['longitude'] !== null) { $lat = (float) $pl['latitude']; $lon = (float) $pl['longitude']; } }
    }
    $r = meteo_local_to_utc($date, (string) ($q['time'] ?? ''), $lat, $lon, meteo_country($country, $lat, $lon), $place);
    return $r ? ['ok' => true] + $r + ['before1940' => (int) substr($date, 0, 4) < 1940] : ['ok' => false];
}

/** GET meteo_person&id= → le bloc « 🌦 Météo de sa vie » (M4) : les événements de la personne (et de ses couples), et les phrases curieuses */
function meteo_person_data(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, first_name, gender FROM persons WHERE id=?'); $s->execute([$id]); $p = $s->fetch();
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    if (!meteo_files()) { return ['installed' => false, 'events' => [], 'curious' => []]; }
    $s = $pdo->prepare('SELECT e.id FROM events e LEFT JOIN families f ON f.id=e.family_id WHERE e.person_id=? OR f.partner1_id=? OR f.partner2_id=?');
    $s->execute([$id, $id, $id]);
    $rows = meteo_event_rows($pdo, array_column($s->fetchAll(), 'id'));
    $events = [];
    foreach ($rows as $e) {
        $r = meteo_for_event($e);
        if (($r['why'] ?? '') === 'date') { continue; }
        $events[] = $r;
    }
    usort($events, static fn($a, $b) => strcmp((string) ($a['date'] ?? ''), (string) ($b['date'] ?? '')));
    // les phrases curieuses : seulement des données « Mesuré » ou « Station à … km »
    $curious = [];
    foreach ($events as $r) {
        if (!in_array($r['reliability'] ?? '', ['measured', 'station'], true) || empty($r['station'])) { continue; }
        foreach (meteo_curiosities($r) as $c) { $curious[] = $c + ['tag' => $r['tag'], 'event_id' => $r['event_id']]; }
    }
    return ['installed' => true, 'gender' => (string) $p['gender'], 'events' => $events, 'curious' => array_slice($curious, 0, 4)];
}

/** « Né pendant la semaine la plus froide de l'hiver 1900–1901 à Agen », « Marié le jour le plus pluvieux d'octobre 1926 à Auch » */
function meteo_curiosities(array $r): array
{
    $out = [];
    $st = meteo_near_stations((float) $r['lat'], (float) $r['lon'], null, (int) substr($r['date'], 0, 4));
    $st = array_values(array_filter($st, static fn($x) => (string) $x['nom'] === (string) $r['station']['name']))[0] ?? null;
    if (!$st) { return []; }
    $date = new DateTimeImmutable($r['date']); $y = (int) $date->format('Y'); $mo = (int) $date->format('n');
    $series = static function (string $from, string $to) use ($st): array {
        $vals = []; $d = new DateTimeImmutable($from); $end = new DateTimeImmutable($to);
        while ($d <= $end) {
            $b = meteo_block($st['file'], 'daily', (int) $st['id'], (int) $d->format('Y'));
            $vals[$d->format('Y-m-d')] = $b ? meteo_row($b, (int) $d->format('z')) : null;
            $d = $d->modify('+1 day');
        }
        return $vals;
    };
    $town = meteo_short_name((string) $st['nom']);
    $day = $r['day'] ?? [];
    // froid : hiver (décembre à février)
    if (in_array($mo, [12, 1, 2], true) && isset($day['tn'])) {
        $wy = $mo === 12 ? $y : $y - 1;
        $vals = $series("$wy-12-01", ($wy + 1) . '-02-28');
        $tns = array_filter(array_map(static fn($v) => $v['tn'] ?? null, $vals), static fn($v) => $v !== null);
        if (count($tns) > 60) {
            if ($day['tn'] <= min($tns)) { $out[] = ['kind' => 'coldest_day', 'season' => "{$wy}–" . ($wy + 1), 'town' => $town]; }
            else {
                $keys = array_keys($tns); $best = null; $bestK = 0;
                for ($k = 0; $k + 7 <= count($keys); $k++) { $w = array_sum(array_slice($tns, $k, 7)) / 7; if ($best === null || $w < $best) { $best = $w; $bestK = $k; } }
                $week = array_slice($keys, $bestK, 7);
                if (in_array($r['date'], $week, true)) { $out[] = ['kind' => 'coldest_week', 'season' => "{$wy}–" . ($wy + 1), 'town' => $town]; }
            }
        }
    }
    // chaleur : été (juin à août)
    if (in_array($mo, [6, 7, 8], true) && isset($day['tx'])) {
        $vals = $series("$y-06-01", "$y-08-31");
        $txs = array_filter(array_map(static fn($v) => $v['tx'] ?? null, $vals), static fn($v) => $v !== null);
        if (count($txs) > 60 && $day['tx'] >= max($txs)) { $out[] = ['kind' => 'hottest_day', 'season' => (string) $y, 'town' => $town]; }
    }
    // pluie : le jour le plus pluvieux du mois
    if (($day['rr'] ?? 0) >= 5) {
        $last = (int) $date->format('t');
        $vals = $series(sprintf('%04d-%02d-01', $y, $mo), sprintf('%04d-%02d-%02d', $y, $mo, $last));
        $rrs = array_filter(array_map(static fn($v) => $v['rr'] ?? null, $vals), static fn($v) => $v !== null);
        if (count($rrs) > 20 && $day['rr'] >= max($rrs)) { $out[] = ['kind' => 'rainiest_day', 'month' => $mo, 'year' => $y, 'town' => $town]; }
    }
    return $out;
}

/** GET meteo_today&date=MM-JJ → widget « Il y a 100 ans, aujourd'hui… » (M7) : un anniversaire rond qui a une météo « Mesuré » ou « Station à … km » ; jamais un vivant ni une fiche confidentielle */
function meteo_today_data(PDO $pdo, array $q): array
{
    if (!meteo_files()) { return ['installed' => false, 'pick' => null]; }
    $today = new DateTimeImmutable('today');
    $md = preg_match('/^(\d{2})-(\d{2})$/', (string) ($q['date'] ?? ''), $m) ? $m[1] . '-' . $m[2] : $today->format('m-d');
    $year = isset($q['year']) && preg_match('/^\d{4}$/', (string) $q['year']) ? (int) $q['year'] : (int) $today->format('Y');
    if (!function_exists('df_hidden_people')) { require_once __DIR__ . '/dates_feter.php'; }
    $hidden = df_hidden_people($pdo);
    [$mm, $dd] = array_map('intval', explode('-', $md));
    $cands = [];
    $rows = $pdo->query("SELECT e.id, e.date_text, e.date_calendar, e.date_converted, e.person_id, e.family_id, f.partner1_id, f.partner2_id, t.gedcom_tag AS tag
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
        WHERE t.gedcom_tag IN ('BIRT','CHR','BAPM','MARR','DEAT','BURI') AND e.year IS NOT NULL")->fetchAll();
    foreach ($rows as $e) {
        $p = cal_parse_date((string) (($e['date_calendar'] ?? 'gregorian') !== 'gregorian' && $e['date_converted'] ? $e['date_converted'] : $e['date_text']));
        if (!$p || $p[1] !== $mm || $p[2] !== $dd || $p[3]) { continue; }
        $ago = $year - $p[0];
        if ($ago <= 0 || !($ago % 10 === 0 || $ago % 25 === 0)) { continue; }
        $people = array_filter([(int) $e['person_id'], (int) $e['partner1_id'], (int) $e['partner2_id']]);
        if (!$people || array_filter($people, static fn($id) => isset($hidden[$id]))) { continue; }
        $cands[] = ['id' => (int) $e['id'], 'ago' => $ago, 'people' => array_values($people)];
    }
    usort($cands, static fn($a, $b) => (($b['ago'] % 100 === 0) <=> ($a['ago'] % 100 === 0)) ?: (($b['ago'] % 50 === 0) <=> ($a['ago'] % 50 === 0)) ?: $a['ago'] <=> $b['ago']);
    $byId = []; foreach (meteo_event_rows($pdo, array_column(array_slice($cands, 0, 40), 'id')) as $r) { $byId[(int) $r['id']] = $r; }
    $list = [];
    foreach (array_slice($cands, 0, 40) as $c) {
        if (!isset($byId[$c['id']])) { continue; }
        $r = meteo_for_event($byId[$c['id']]);
        if (!in_array($r['reliability'] ?? '', ['measured', 'station'], true)) { continue; }
        $names = [];
        $s = $pdo->prepare('SELECT id, first_name, last_name, gender FROM persons WHERE id=?');
        foreach ($c['people'] as $pid) { $s->execute([$pid]); if ($pp = $s->fetch()) { $names[] = ['id' => (int) $pp['id'], 'first' => preg_split('/\s+/u', trim((string) $pp['first_name']))[0] ?? '', 'last' => (string) $pp['last_name'], 'gender' => (string) $pp['gender']]; } }
        $list[] = $r + ['ago' => $c['ago'], 'people' => $names];
        if (count($list) >= 6) { break; }
    }
    return ['installed' => true, 'date' => $md, 'pick' => $list[0] ?? null, 'list' => $list];
}

/** GET meteo_status → les fichiers installés (M5), et GET meteo_about → les sources (M10) */
function meteo_status_data(): array
{
    $files = [];
    foreach (meteo_files() as $f) {
        $pdo = meteo_pdo($f['path']);
        $info = ['kind' => $f['kind'], 'size' => $f['size'], 'where' => $f['where'], 'removable' => $f['where'] === 'data', 'ok' => (bool) $pdo];
        if ($pdo) {
            try {
                $meta = $pdo->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
                $st = $pdo->query('SELECT COUNT(*) n, MIN(debut) a, MAX(fin) b, MIN(heures_debut) h FROM stations')->fetch();
                $gr = $pdo->query("SELECT COUNT(*) n, MIN(debut) a, MAX(fin) b, MIN(heures_debut) h FROM grid")->fetch();
                $info += ['title' => $meta['title'] ?? '', 'built' => $meta['built'] ?? '', 'countries' => $meta['countries'] ?? '', 'fixture' => !empty($meta['fixture']),
                    'stations' => (int) $st['n'], 'cells' => (int) $gr['n'], 'from' => min(array_filter([(int) $st['a'], (int) $gr['a']]) ?: [0]), 'to' => max((int) $st['b'], (int) $gr['b']),
                    'hours_from' => min(array_filter([(int) $st['h'], (int) $gr['h']]) ?: [0])];
                $info['relief'] = (int) ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='elevation'")->fetchColumn() ? $pdo->query('SELECT COUNT(*) FROM elevation')->fetchColumn() : 0);
            } catch (Throwable) { $info['ok'] = false; }
        }
        $files[$f['kind']] = $info;
    }
    $prev = [];
    foreach (array_keys(METEO_KINDS) as $k) { if (is_file(meteo_pack_dir() . "/meteo-$k.sqlite.removed")) { $prev[] = $k; } }
    return ['installed' => (bool) $files, 'files' => (object) $files, 'removed' => $prev, 'pack_dir' => meteo_pack_dir(), 'app_dir' => meteo_dirs()[0]];
}

function meteo_about_data(): array
{
    $used = [];
    foreach (meteo_files() as $f) {
        $pdo = meteo_pdo($f['path']); if (!$pdo) { continue; }
        foreach ($pdo->query('SELECT id, nom, licence, mention, url, mise_a_jour FROM sources') as $r) { $used[$r['id']] ??= $r + ['in' => []]; $used[$r['id']]['in'][] = $f['kind']; }
    }
    $rows = [];
    foreach (METEO_SOURCES_INFO as $id => [$nom, $what, $years, $in, $lic, $mention]) {
        $u = $used[$id] ?? null;
        $rows[] = ['id' => $id, 'nom' => $nom, 'what' => $what, 'years' => $years, 'in' => $in, 'licence' => $u['licence'] ?? $lic, 'mention' => $u['mention'] ?? $mention, 'url' => $u['url'] ?? '', 'installed' => $u ? $u['in'] : []];
    }
    $rows[] = ['id' => 'normals', 'nom' => 'Normales', 'what' => 'Moyennes sur 30 ans par station et par mois', 'years' => '1901–1930 → 1991–2020', 'in' => 'Socle', 'licence' => 'Calculées par l’app depuis les sources ci-dessus', 'mention' => '', 'url' => '', 'installed' => []];
    return ['sources' => $rows];
}

/* ═════════════════════════ Importer un pack (K13), le retirer ═════════════════════════ */

function meteo_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Envoi inconnu.'); }
    $dir = meteo_pack_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Dossier des données météo impossible à créer.'); }
    return $dir . '/' . $id . '.part';
}

/** POST meteo_pack_begin {size} → {id} */
function meteo_pack_begin(array $data): array
{
    $size = (int) ($data['size'] ?? 0);
    if ($size <= METEO_HEADER_SIZE) { throw new RuntimeException('Ce fichier est trop petit pour être un pack météo.'); }
    $id = bin2hex(random_bytes(12));
    // les envois abandonnés depuis plus d'un jour sont effacés
    foreach (glob(meteo_pack_dir() . '/.envois/*.part') ?: [] as $old) { if (filemtime($old) < time() - 86400) { @unlink($old); } }
    file_put_contents(meteo_upload_path($id), '');
    return ['id' => $id];
}

/** POST meteo_pack_chunk&id=&offset= (corps = les octets) → {received} */
function meteo_pack_chunk(array $q): array
{
    $path = meteo_upload_path((string) ($q['id'] ?? ''));
    if (!is_file($path)) { throw new RuntimeException('Envoi inconnu ou expiré : recommence l’import.'); }
    clearstatcache(true, $path);
    $offset = (int) ($q['offset'] ?? -1);
    if ($offset !== filesize($path)) { throw new RuntimeException('Morceau du fichier hors de place : recommence l’import.'); }
    $in = fopen('php://input', 'rb'); $out = fopen($path, 'ab');
    $n = stream_copy_to_stream($in, $out, 64 * 1024 * 1024);
    fclose($in); fclose($out);
    return ['received' => $offset + (int) $n];
}

/** lit l'en-tête d'un .lcmeteo (4096 octets : « LCMETEO1 » + JSON) */
function meteo_pack_header(string $path): array
{
    $f = fopen($path, 'rb'); $head = (string) fread($f, METEO_HEADER_SIZE); fclose($f);
    if (!str_starts_with($head, "LCMETEO1\n")) { throw new RuntimeException('Ce n’est pas un pack météo de LCNDA (fichier .lcmeteo).'); }
    $json = json_decode(trim(substr($head, 9)), true);
    if (!is_array($json) || !isset(METEO_KINDS[$json['kind'] ?? '']) || !preg_match('/^[0-9a-f]{64}$/', (string) ($json['sha256'] ?? ''))) { throw new RuntimeException('En-tête du pack abîmé.'); }
    return $json;
}

/** POST meteo_pack_finish {id} → vérifie (en-tête, taille, empreinte, base lisible) puis range le pack */
function meteo_pack_finish(array $data): array
{
    $path = meteo_upload_path((string) ($data['id'] ?? ''));
    if (!is_file($path)) { throw new RuntimeException('Envoi inconnu ou expiré : recommence l’import.'); }
    try {
        $h = meteo_pack_header($path);
        clearstatcache(true, $path);
        if (filesize($path) - METEO_HEADER_SIZE !== (int) ($h['size'] ?? -1)) { throw new RuntimeException('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.'); }
        @set_time_limit(0);
        $kind = (string) $h['kind'];
        $target = meteo_pack_dir() . "/meteo-$kind.sqlite";
        $tmp = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $in = fopen($path, 'rb'); fseek($in, METEO_HEADER_SIZE); $out = fopen($tmp, 'wb'); $ctx = hash_init('sha256');
        while (!feof($in)) { $buf = fread($in, 1 << 20); if ($buf === false || $buf === '') { break; } hash_update($ctx, $buf); fwrite($out, $buf); }
        fclose($in); fclose($out);
        if (!hash_equals((string) $h['sha256'], hash_final($ctx))) { @unlink($tmp); throw new RuntimeException('Le fichier est abîmé (empreinte différente) : rien n’a été installé.'); }
        try {
            $t = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $meta = $t->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            if (($meta['kind'] ?? '') !== $kind || (int) ($meta['format'] ?? 0) !== 1) { throw new RuntimeException('sorte'); }
            $t = null;
        } catch (Throwable) { @unlink($tmp); throw new RuntimeException('Le pack ne peut pas être lu : rien n’a été installé.'); }
        $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($tmp, $target)) { @unlink($tmp); if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException('Pack impossible à ranger.'); }
        @unlink($target . '.removed');
        return ['kind' => $kind, 'stations' => (int) ($h['stations'] ?? 0), 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); }
}

/** POST meteo_pack_undo {kind} → défait le dernier import (remet le pack d'avant, ou retire le nouveau) */
function meteo_pack_undo(array $data): array
{
    $kind = (string) ($data['kind'] ?? '');
    if (!isset(METEO_KINDS[$kind])) { throw new RuntimeException('Sorte de pack inconnue.'); }
    $target = meteo_pack_dir() . "/meteo-$kind.sqlite";
    if (is_file($target . '.prev')) { @unlink($target); @rename($target . '.prev', $target); return ['restored' => true]; }
    if (is_file($target)) { @unlink($target); }
    return ['removed' => true];
}

/** POST meteo_pack_remove {kind} → mis de côté (« ↶ Annuler » : meteo_pack_restore) ; le socle livré avec l'app n'est jamais touché */
function meteo_pack_remove(array $data): array
{
    $kind = (string) ($data['kind'] ?? '');
    if (!isset(METEO_KINDS[$kind])) { throw new RuntimeException('Sorte de pack inconnue.'); }
    $target = meteo_pack_dir() . "/meteo-$kind.sqlite";
    if (!is_file($target)) { throw new RuntimeException('Ce pack n’est pas dans le dossier des données (le socle livré avec l’app ne se supprime pas).'); }
    @unlink($target . '.removed');
    if (!@rename($target, $target . '.removed')) { throw new RuntimeException('Pack impossible à retirer.'); }
    return ['kind' => $kind];
}

function meteo_pack_restore(array $data): array
{
    $kind = (string) ($data['kind'] ?? '');
    if (!isset(METEO_KINDS[$kind])) { throw new RuntimeException('Sorte de pack inconnue.'); }
    $target = meteo_pack_dir() . "/meteo-$kind.sqlite";
    if (!is_file($target . '.removed')) { throw new RuntimeException('Rien à remettre.'); }
    if (is_file($target)) { throw new RuntimeException('Un autre pack de cette sorte a été importé entre-temps.'); }
    @rename($target . '.removed', $target);
    return ['kind' => $kind];
}

/** Aiguillage des actions météo (api.php) */
function meteo_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'meteo_status' => meteo_status_data(),
        'meteo_about' => meteo_about_data(),
        'meteo_events' => meteo_events_data($pdo, (string) ($q['ids'] ?? '')),
        'meteo_event' => meteo_event_data($pdo, safe_int($q['id'] ?? 0)),
        'meteo_person' => meteo_person_data($pdo, safe_int($q['id'] ?? 0)),
        'meteo_point' => meteo_point_data($q),
        'meteo_time' => meteo_time_data($q, $pdo),
        'meteo_today' => meteo_today_data($pdo, $q),
        'meteo_place' => meteo_place_data($pdo, safe_int($q['id'] ?? 0)),
        'meteo_altitude' => ['m' => meteo_altitude((float) ($q['lat'] ?? 0), (float) ($q['lon'] ?? 0))],
        default => throw new RuntimeException('Action météo inconnue.'),
    };
}

function meteo_api_post(string $action, array $data, array $q): array
{
    return match ($action) {
        'meteo_pack_begin' => meteo_pack_begin($data),
        'meteo_pack_chunk' => meteo_pack_chunk($q),
        'meteo_pack_finish' => meteo_pack_finish($data),
        'meteo_pack_undo' => meteo_pack_undo($data),
        'meteo_pack_remove' => meteo_pack_remove($data),
        'meteo_pack_restore' => meteo_pack_restore($data),
        default => throw new RuntimeException('Action météo inconnue.'),
    };
}
