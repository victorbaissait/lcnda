<?php
declare(strict_types=1);

/**
 * ⛏️🏭⚙️🌊🖼️ Métiers et rivières (assets/js/heritage-metiers-rivieres.js ; données : scripts/metiers-rivieres/*).
 *
 *  · 🏭 Anciens sites industriels — CASIAS (BRGM / Géorisques, Licence Ouverte Etalab 2.0) : assets/data/casias/casias-<dép>.json.gz,
 *    livrés avec l'app (≈ 9 Mo pour la France entière), lus un département à la fois. Nom, activité quand elle est dite, commune,
 *    position. L'inventaire ne donne PAS de dates : on le dit.
 *  · ⛏️ Mines et carrières — Wikidata (CC0) : assets/data/metiers-mines.json.gz (nom, sorte, dates quand elles sont connues).
 *  · ⚙️ Moulins et usines à eau — ROE, Référentiel des obstacles à l'écoulement (OFB, Sandre, Licence Ouverte Etalab 2.0) :
 *    assets/data/roe-moulins.json.gz (seulement les ouvrages dont le nom dit un moulin ou une usine à eau).
 *  · 🌊 Repères de crues — plateforme nationale des repères de crues (Vigicrues, Licence Ouverte) : assets/data/reperes-crues.json.gz.
 *  · 🌊 Les rivières de la commune — Sandre, BD TOPAGE® (WFS services.sandre.eaufrance.fr/geo/topage, Licence Ouverte) : EN LIGNE,
 *    gardé sur l'ordinateur ; les plus hautes eaux à la station de mesure la plus proche — Hub'Eau, API Hydrométrie
 *    (hubeau.eaufrance.fr, hauteur maximale de chaque mois « HIXM », Licence Ouverte) : EN LIGNE, gardé.
 *  · 🖼️ Ton village au musée — POP, plateforme ouverte du patrimoine (ministère de la Culture) : bases Joconde (musées) et Mémoire
 *    (photographies), API api.pop.culture.gouv.fr : EN LIGNE, gardé. Les notices sont sous Licence Ouverte ; les PHOTOS ont chacune
 *    leurs droits (champ COPY) : « ＋ Garder dans les médias » n'est proposé que si la mention dit une licence libre.
 *    (Les objets Palissy sont montrés par lib/lieux_patrimoine.php : pas ici.)
 *  · La table métier → lieu de travail : assets/data/metiers-sites.json (écrite pour l'app).
 * Rien n'est écrit dans la généalogie, sauf « Garder dans les médias » (avec ↶).
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_MR_DIR (un fichier <étape> par appel réseau ; absent = hors ligne).
 */

const MR_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const MR_TTL = ['rivers' => 180 * 86400, 'stations' => 90 * 86400, 'hixm' => 30 * 86400, 'pop' => 30 * 86400];
const MR_HOSTS = ['services.sandre.eaufrance.fr', 'hubeau.eaufrance.fr', 'api.pop.culture.gouv.fr', 'iiif.prd.cloud.culture.fr'];
const MR_NEAR_KM = 5.0;      // un lieu de travail possible : à 5 km au plus d'un lieu de sa vie
const MR_PLACE_KM = 2.0;     // la commune sans code INSEE : 2 km autour de sa position
const MR_IIIF = 'https://iiif.prd.cloud.culture.fr/iiif/3/';
const MR_SOURCES = [
    'casias' => ['label' => 'CASIAS — Carte des anciens sites industriels et activités de service (BRGM, Géorisques)', 'licence' => 'Licence Ouverte Etalab 2.0', 'mention' => 'Géorisques, BRGM — CASIAS', 'url' => 'https://www.georisques.gouv.fr/donnees/bases-de-donnees/inventaire-historique-de-sites-industriels-et-activites-de-service'],
    'wikidata' => ['label' => 'Wikidata — mines et carrières de France', 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing'],
    'roe' => ['label' => 'ROE — Référentiel des obstacles à l’écoulement (OFB), Sandre', 'licence' => 'Licence Ouverte Etalab 2.0', 'mention' => 'OFB, Sandre — ROE', 'url' => 'https://www.sandre.eaufrance.fr/'],
    'reperes' => ['label' => 'Plateforme nationale des repères de crues (Vigicrues)', 'licence' => 'Licence Ouverte Etalab 2.0', 'mention' => 'Repères de crues — ministère de la Transition écologique', 'url' => 'https://www.reperesdecrues.developpement-durable.gouv.fr/'],
    'topage' => ['label' => 'BD TOPAGE® — cours d’eau (Sandre, IGN, OFB)', 'licence' => 'Licence Ouverte Etalab 2.0', 'mention' => 'Sandre — BD TOPAGE®', 'url' => 'https://www.sandre.eaufrance.fr/'],
    'hubeau' => ['label' => 'Hub’Eau — API Hydrométrie (hauteurs d’eau des stations, Hydroportail)', 'licence' => 'Licence Ouverte Etalab 2.0', 'mention' => 'Hub’Eau, Hydroportail — ministère de la Transition écologique', 'url' => 'https://hubeau.eaufrance.fr/page/api-hydrometrie'],
    'pop' => ['label' => 'POP, plateforme ouverte du patrimoine — Joconde (musées) et Mémoire (photographies)', 'licence' => 'Licence Ouverte Etalab 2.0 (notices) ; photos : droits propres à chacune', 'mention' => 'Ministère de la Culture, POP', 'url' => 'https://pop.culture.gouv.fr/'],
    'metiers' => ['label' => 'Table « métier → lieu de travail » (écrite pour l’app)', 'licence' => 'CC0 1.0', 'mention' => 'LCNDA', 'url' => ''],
];

/* ═════════════════════ outils ═════════════════════ */

function mr_fold(string $s): string
{
    $s = mb_strtolower($s, 'UTF-8');
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'œ' => 'oe', 'æ' => 'ae', 'ñ' => 'n']);
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
}
/** le mot (ou les mots) $w au début d'un mot de $text (deux textes déjà « pliés ») */
function mr_has(string $text, string $w): bool { return $w !== '' && preg_match('/(^| )' . preg_quote($w, '/') . '/', $text) === 1; }
function mr_km(float $a, float $b, float $c, float $d): float
{
    $r = M_PI / 180; $x = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
    return 6371 * 2 * asin(min(1.0, sqrt($x)));
}
function mr_nice(string $s): string
{
    $s = trim((string) preg_replace('/\s+/u', ' ', $s), " .,;-\"");
    if ($s !== '' && mb_strtoupper($s, 'UTF-8') === $s && preg_match('/\p{L}{3}/u', $s)) { $s = mb_strtolower($s, 'UTF-8'); }
    return $s === '' ? '' : mb_strtoupper(mb_substr($s, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($s, 1, null, 'UTF-8');
}
function mr_data_dir(): string
{
    $d = (string) getenv('LCNDA_TEST_MR_DATA');
    return getenv('GENEALOGY_TEST') === '1' && $d !== '' ? $d : APP_ROOT . '/assets/data';
}
/** un fichier .json.gz (ou .json) de assets/data, lu une fois par appel */
function mr_load(string $rel): ?array
{
    static $memo = [];
    if (array_key_exists($rel, $memo)) { return $memo[$rel]; }
    if (!preg_match('#^[a-z0-9/_-]+\.json(\.gz)?$#', $rel)) { return $memo[$rel] = null; }
    $f = mr_data_dir() . '/' . $rel;
    if (!is_file($f)) { return $memo[$rel] = null; }
    $raw = (string) file_get_contents($f);
    if (str_ends_with($rel, '.gz')) { $raw = (string) @gzdecode($raw); }
    $j = json_decode($raw, true);
    return $memo[$rel] = is_array($j) ? $j : null;
}
function mr_trades(): array { return mr_load('metiers-sites.json') ?? ['trades' => [], 'river_jobs' => []]; }

/* ═════════════════════ le cache des réponses en ligne ═════════════════════ */

function mr_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : sys_get_temp_dir()), '/') . '/cache/metiers-rivieres';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function mr_cached(string $kind, string $key, callable $make): array
{
    $f = mr_cache_dir() . '/' . sha1($kind . ':' . $key) . '.json';
    $c = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
    if (is_array($c) && isset($c['data']) && (int) $c['at'] > time() - (MR_TTL[$kind] ?? 30 * 86400)) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    try { $data = $make(); }
    catch (Throwable $e) {
        if (is_array($c) && isset($c['data'])) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    mr_cache_dir(true);
    @file_put_contents($f, json_encode(['key' => $kind . ':' . $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $data + ['cached' => false, 'fetched_at' => time()];
}
function mr_http(string $step, string $url, int $max = 8_000_000, string $accept = 'application/json'): string
{
    $dir = (string) getenv('LCNDA_TEST_MR_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        $f = $dir . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
        if (!is_file($f)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($f);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), MR_HOSTS, true) || parse_url($url, PHP_URL_SCHEME) !== 'https') { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 45, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => MR_UA, CURLOPT_HTTPHEADER => ['Accept: ' . $accept],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    // fabriquer les fichiers d'essai (scripts seulement) : LCNDA_MR_RECORD_DIR
    if (PHP_SAPI === 'cli' && ($rec = (string) getenv('LCNDA_MR_RECORD_DIR')) !== '') { @file_put_contents($rec . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step), $body); }
    return $body;
}
/** une adresse de l'API de POP : les listes s'écrivent « bases[]=… » (pas « bases[0]=… ») */
function mr_pop_url(string $path, array $q): string { return 'https://api.pop.culture.gouv.fr' . $path . '?' . preg_replace('/%5B\d+%5D/', '%5B%5D', http_build_query($q)); }
function mr_json(string $step, string $url): array
{
    $j = json_decode(mr_http($step, $url), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    return $j;
}

/* ═════════════════════ les lieux ═════════════════════ */

function mr_place_row(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}
function mr_has_pos(array $p): bool { return is_numeric($p['lat'] ?? null) && is_numeric($p['lon'] ?? null) && !((float) $p['lat'] == 0.0 && (float) $p['lon'] == 0.0); }
/** un lieu de la base, ou envoyé par la page : {id, name, insee, lat, lon, country} */
function mr_place(PDO $pdo, array $q): array
{
    $p = ['id' => safe_int($q['place_id'] ?? 0), 'name' => trim(safe_text($q['name'] ?? '')), 'insee' => strtoupper(trim(safe_text($q['insee'] ?? ''))),
        'lat' => is_numeric($q['lat'] ?? null) ? (float) $q['lat'] : null, 'lon' => is_numeric($q['lon'] ?? null) ? (float) $q['lon'] : null, 'country' => trim(safe_text($q['country'] ?? '')), 'county' => ''];
    if ($p['id'] > 0 && ($r = mr_place_row($pdo, $p['id']))) {
        $p['name'] = $p['name'] !== '' ? $p['name'] : (string) $r['name'];
        $p['insee'] = $p['insee'] !== '' ? $p['insee'] : strtoupper(trim((string) ($r['admin4_code'] ?? '')));
        $p['country'] = $p['country'] !== '' ? $p['country'] : (string) ($r['country'] ?? '');
        $p['county'] = (string) ($r['county'] ?? '');
        if ($p['lat'] === null && is_numeric($r['latitude'] ?? null) && is_numeric($r['longitude'] ?? null)) { $p['lat'] = (float) $r['latitude']; $p['lon'] = (float) $r['longitude']; }
    }
    if (!preg_match('/^(\d{5}|2[AB]\d{3})$/', $p['insee'])) { $p['insee'] = ''; }
    if ($p['lat'] !== null && (abs($p['lat']) > 90 || abs((float) $p['lon']) > 180 || ($p['lat'] == 0.0 && $p['lon'] == 0.0))) { $p['lat'] = $p['lon'] = null; }
    $p['name'] = trim((string) preg_replace('/\s*[,(].*$/u', '', $p['name']));
    return $p;
}
function mr_in_france(array $p): bool
{
    $c = mr_fold((string) ($p['country'] ?? ''));
    return $c === '' || in_array($c, ['france', 'fr', 'fra'], true);
}
/** les départements à lire autour d'un point : son code INSEE, et ceux des moulins et repères à moins de 15 km (pour les bords) */
function mr_deps_near(array $p): array
{
    $deps = [];
    if ($p['insee'] !== '') { $deps[mr_dep_of($p['insee'])] = 1; }
    if (mr_has_pos($p)) {
        foreach ([mr_load('roe-moulins.json.gz'), mr_load('reperes-crues.json.gz')] as $set) {
            foreach ($set['rows'] ?? [] as $r) {
                if (abs($r[0] - $p['lat']) > 0.14 || abs($r[1] - $p['lon']) > 0.2 || (string) $r[2] === '') { continue; }
                if (mr_km((float) $p['lat'], (float) $p['lon'], (float) $r[0], (float) $r[1]) <= 15) { $deps[mr_dep_of((string) $r[2])] = 1; }
            }
        }
    }
    unset($deps['']);
    return array_map('strval', array_keys($deps));
}
function mr_dep_of(string $insee): string { return preg_match('/^(97\d|2[AB]|\d{2})/', strtoupper($insee), $m) ? $m[1] : ''; }

/* ═════════════════════ les sites autour d'un point ═════════════════════ */

/** CASIAS d'un département : [[lat, lon, insee, commune, nom, activité, adresse, ssp]] */
function mr_casias(string $dep): array { return preg_match('/^(\d{2,3}|2[AB])$/', $dep) ? (mr_load("casias/casias-$dep.json.gz")['rows'] ?? []) : []; }
function mr_casias_item(array $r, ?array $from = null): array
{
    $name = mr_nice((string) $r[4]); $act = mr_nice((string) $r[5]);
    return ['src' => 'casias', 'name' => $name !== '' ? $name : $act, 'activity' => $act !== '' && mr_fold($act) !== mr_fold($name) ? $act : '', 'commune' => mr_nice((string) $r[3]), 'insee' => (string) $r[2],
        'address' => mr_nice((string) $r[6]), 'lat' => $r[0], 'lon' => $r[1], 'start' => null, 'end' => null,
        'km' => $from && $r[0] !== null ? round(mr_km($from['lat'], $from['lon'], (float) $r[0], (float) $r[1]), 2) : null,
        'url' => (string) $r[7] !== '' ? 'https://fiches-risques.brgm.fr/georisques/casias/' . rawurlencode((string) $r[7]) : ''];
}
function mr_mine_item(array $r, ?array $from = null): array
{
    return ['src' => 'wikidata', 'name' => (string) $r[3], 'kind' => (string) $r[4], 'insee' => (string) $r[2], 'lat' => $r[0], 'lon' => $r[1], 'start' => $r[5], 'end' => $r[6],
        'km' => $from ? round(mr_km($from['lat'], $from['lon'], (float) $r[0], (float) $r[1]), 2) : null, 'url' => 'https://www.wikidata.org/wiki/' . $r[7]];
}
function mr_mill_item(array $r, ?array $from = null): array
{
    return ['src' => 'roe', 'name' => mr_nice((string) $r[3]), 'river' => (string) $r[4], 'state' => (int) $r[5], 'drop_m' => $r[6], 'insee' => (string) $r[2], 'lat' => $r[0], 'lon' => $r[1], 'start' => null, 'end' => null,
        'km' => $from ? round(mr_km($from['lat'], $from['lon'], (float) $r[0], (float) $r[1]), 2) : null, 'roe' => (string) $r[7]];
}
/** les lignes d'un jeu à moins de $km d'un point (ou dans la commune $insee) */
function mr_rows_near(array $rows, array $p, float $km, bool $sameInsee = true): array
{
    $out = []; $pos = mr_has_pos($p); $dLat = $km / 111.0; $dLon = $km / (111.0 * max(0.2, cos(deg2rad((float) ($p['lat'] ?? 45)))));
    foreach ($rows as $r) {
        if ($sameInsee && $p['insee'] !== '' && (string) $r[2] === $p['insee']) { $out[] = $r; continue; }
        if (!$pos || $r[0] === null || abs($r[0] - $p['lat']) > $dLat || abs($r[1] - $p['lon']) > $dLon) { continue; }
        if (mr_km((float) $p['lat'], (float) $p['lon'], (float) $r[0], (float) $r[1]) <= $km) { $out[] = $r; }
    }
    return $out;
}

/* ═════════════════════ 🏭 la commune : activités anciennes, mines, moulins, repères ═════════════════════ */

/** GET mr_place&place_id=|insee=&lat=&lon=&name= → ce que la commune a dans les données livrées (rien en ligne) */
function mr_place_data(PDO $pdo, array $q): array
{
    $p = mr_place($pdo, $q);
    if (!mr_in_france($p) || ($p['insee'] === '' && !mr_has_pos($p))) { return ['ok' => false, 'noplace' => true, 'place' => $p]; }
    $km = MR_PLACE_KM; $sel = static fn(array $rows) => mr_rows_near($rows, $p, $km, true);
    $from = mr_has_pos($p) ? $p : null;
    $sites = [];
    foreach (mr_deps_near($p) as $dep) {
        foreach (mr_casias($dep) as $r) {
            if ($p['insee'] !== '' ? (string) $r[2] === $p['insee'] : ($r[0] !== null && $from && mr_km($p['lat'], $p['lon'], (float) $r[0], (float) $r[1]) <= $km)) { $sites[] = mr_casias_item($r, $from); }
        }
    }
    // les mots les plus fréquents (« tannerie », « usine à gaz »…) : ce qui se faisait ici
    $tally = [];
    foreach (mr_trades()['trades'] as $t) {
        $n = 0; foreach ($sites as $s) { $f = mr_fold($s['name'] . ' ' . $s['activity']); foreach ($t['sites'] as $w) { if (mr_has($f, mr_fold($w))) { $n++; break; } } }
        if ($n) { $tally[] = ['id' => $t['id'], 'label' => $t['label'], 'count' => $n]; }
    }
    usort($tally, static fn($a, $b) => $b['count'] <=> $a['count']);
    usort($sites, static fn($a, $b) => strcmp(mr_fold($a['name']), mr_fold($b['name'])));
    $mines = array_map(static fn($r) => mr_mine_item($r, $from), $sel(mr_load('metiers-mines.json.gz')['rows'] ?? []));
    $mills = array_map(static fn($r) => mr_mill_item($r, $from), $sel(mr_load('roe-moulins.json.gz')['rows'] ?? []));
    usort($mills, static fn($a, $b) => ($a['km'] ?? 0) <=> ($b['km'] ?? 0));
    $reperes = array_map(static fn($r) => mr_repere_item($r, $from), $sel(mr_load('reperes-crues.json.gz')['rows'] ?? []));
    usort($reperes, static fn($a, $b) => [$b['max'], $a['year']] <=> [$a['max'], $b['year']]);
    return ['ok' => true, 'place' => $p, 'sites' => ['count' => count($sites), 'tally' => array_slice($tally, 0, 8), 'items' => array_slice($sites, 0, 400)],
        'mines' => $mines, 'mills' => array_slice($mills, 0, 60), 'mills_count' => count($mills), 'reperes' => array_slice($reperes, 0, 40), 'reperes_count' => count($reperes),
        'rule' => $p['insee'] !== '' ? 'insee' : 'radius', 'radius_km' => $km, 'sources' => mr_src(['casias', 'wikidata', 'roe', 'reperes'])];
}
function mr_src(array $keys): array { return array_map(static fn($k) => ['id' => $k] + MR_SOURCES[$k], $keys); }

/* ═════════════════════ ⛏️ la personne : son métier, près de chez lui ═════════════════════ */

function mr_person_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$id]); $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException(i18n_t('Fiche introuvable.')); }
    return $p;
}
function mr_person_events(PDO $pdo, int $id): array
{
    $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $x = in_array('admin4_code', $pc, true) ? ', pl.admin4_code' : ", '' AS admin4_code";
    $s = $pdo->prepare("SELECT e.id, e.year, e.sort_date, e.date_text, e.title, e.description, t.gedcom_tag AS tag, t.slug, pl.id AS place_id, pl.name, pl.country, pl.latitude AS lat, pl.longitude AS lon$x
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        WHERE e.person_id=? OR (e.scope='family' AND (f.partner1_id=? OR f.partner2_id=?)) ORDER BY e.year, e.id");
    $s->execute([$id, $id, $id]);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}
function mr_year(array $e): ?int
{
    if (is_numeric($e['year'] ?? null) && (int) $e['year'] > 0) { return (int) $e['year']; }
    return preg_match('/^(\d{4})/', (string) ($e['sort_date'] ?? ''), $m) ? (int) $m[1] : null;
}
/** la vie : {id, first, gender, birth, death, jobs:[{text, year}], places:[{id, name, insee, lat, lon, country}]} */
function mr_life(PDO $pdo, int $id): array
{
    $p = mr_person_row($pdo, $id); $events = mr_person_events($pdo, $id);
    $pick = static function (array $tags) use ($events): ?int { foreach ($tags as $t) { foreach ($events as $e) { if (strtoupper((string) $e['tag']) === $t && ($y = mr_year($e)) !== null) { return $y; } } } return null; };
    $jobs = []; $seen = [];
    $add = static function (string $t, ?int $y) use (&$jobs, &$seen) { $t = trim($t); $k = mr_fold($t); if ($k === '' || isset($seen[$k])) { return; } $seen[$k] = 1; $jobs[] = ['text' => $t, 'year' => $y]; };
    foreach (preg_split('/\s*[;,\/]\s*|\s+et\s+/u', (string) ($p['occupation'] ?? '')) ?: [] as $t) { $add($t, null); }
    foreach ($events as $e) {
        if (strtoupper((string) $e['tag']) === 'OCCU' || in_array(mr_fold((string) ($e['slug'] ?? '')), ['occupation', 'profession', 'metier'], true)) {
            $add((string) ($e['title'] ?: $e['description']), mr_year($e));
        }
    }
    $places = []; $seenP = [];
    foreach ($events as $e) {
        if (empty($e['place_id']) || isset($seenP[(int) $e['place_id']])) { continue; }
        $seenP[(int) $e['place_id']] = 1;
        $pl = ['id' => (int) $e['place_id'], 'name' => trim((string) preg_replace('/\s*[,(].*$/u', '', (string) $e['name'])), 'insee' => strtoupper(trim((string) ($e['admin4_code'] ?? ''))),
            'lat' => is_numeric($e['lat']) ? (float) $e['lat'] : null, 'lon' => is_numeric($e['lon']) ? (float) $e['lon'] : null, 'country' => (string) ($e['country'] ?? ''), 'year' => mr_year($e)];
        if (!preg_match('/^(\d{5}|2[AB]\d{3})$/', $pl['insee'])) { $pl['insee'] = ''; }
        if (!mr_has_pos($pl)) { $pl['lat'] = $pl['lon'] = null; }
        if (mr_in_france($pl) && ($pl['lat'] !== null || $pl['insee'] !== '')) { $places[] = $pl; }
        if (count($places) >= 10) { break; }
    }
    $birth = $pick(['BIRT', 'BAPM', 'CHR']); $death = $pick(['DEAT', 'BURI']);
    return ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name']) ?: trim((string) $p['last_name']), 'gender' => (string) $p['gender'], 'birth' => $birth, 'death' => $death,
        'living' => (string) ($p['living_status'] ?? '') === 'living', 'jobs' => $jobs, 'places' => $places];
}
/** les sortes de lieux de travail qui vont avec un métier écrit (« Maître tanneur » → tannerie) */
function mr_job_trades(string $job): array
{
    $f = mr_fold($job); $out = [];
    foreach (mr_trades()['trades'] as $t) { foreach ($t['jobs'] as $w) { $w = mr_fold($w); if ($w !== '' && preg_match('/(^| )' . preg_quote($w, '/') . '( |$|s )/', $f . ' ')) { $out[] = $t; break; } } }
    return $out;
}
/** le site et la vie se croisent-ils ? true, false, ou null si le site n'a pas de dates */
function mr_dates_ok(array $site, ?int $birth, ?int $death): ?bool
{
    if ($site['start'] === null && $site['end'] === null) { return null; }
    $from = $birth !== null ? $birth + 12 : ($death !== null ? $death - 50 : null); $to = $death ?? ($birth !== null ? $birth + 70 : null);
    if ($from === null) { return null; }
    if ($site['start'] !== null && $site['start'] > $to) { return false; }
    if ($site['end'] !== null && $site['end'] < $from) { return false; }
    return true;
}
/** GET mr_person&id= → les lieux de travail possibles de ses métiers, près de ses lieux */
function mr_person_data(PDO $pdo, int $id): array
{
    $L = mr_life($pdo, $id);
    $out = ['ok' => true, 'person' => array_diff_key($L, ['places' => 1]), 'matches' => [], 'radius_km' => MR_NEAR_KM];
    if (!$L['jobs'] || !$L['places']) { return $out; }
    $wanted = [];
    foreach ($L['jobs'] as $j) { foreach (mr_job_trades($j['text']) as $t) { $wanted[$t['id']] ??= ['trade' => $t, 'job' => $j['text']]; } }
    if (!$wanted) { return $out; }
    $deps = []; foreach ($L['places'] as $pl) { foreach (mr_deps_near($pl) as $d) { $deps[$d] = 1; } }
    $casias = []; foreach (array_keys($deps) as $d) { foreach (mr_casias((string) $d) as $r) { $casias[] = $r; } }
    $mines = mr_load('metiers-mines.json.gz')['rows'] ?? []; $mills = mr_load('roe-moulins.json.gz')['rows'] ?? [];
    foreach ($wanted as $tid => $w) {
        $t = $w['trade']; $found = [];
        $keys = array_map('mr_fold', $t['sites']); $roeKeys = array_map('mr_fold', $t['roe'] ?? []);
        foreach ($L['places'] as $pl) {
            // placé sur la carte : 5 km autour ; sinon, seulement sa commune (code INSEE), sans distance
            $pos = mr_has_pos($pl); $at = $pos ? $pl : null; $tag = ['near' => $pl['name'], 'near_id' => $pl['id']];
            foreach (mr_rows_near($casias, $pl, MR_NEAR_KM, !$pos) as $r) {
                $f = mr_fold($r[4] . ' ' . $r[5]); foreach ($keys as $k) { if (mr_has($f, $k)) { $found[] = mr_casias_item($r, $at) + $tag; break; } }
            }
            foreach (mr_rows_near($mines, $pl, MR_NEAR_KM, !$pos) as $r) { if (in_array($r[4], $t['mines'] ?? [], true)) { $found[] = mr_mine_item($r, $at) + $tag; } }
            if ($roeKeys) { foreach (mr_rows_near($mills, $pl, MR_NEAR_KM, !$pos) as $r) { $f = mr_fold((string) $r[3]); foreach ($roeKeys as $k) { if (mr_has($f, $k)) { $found[] = mr_mill_item($r, $at) + $tag; break; } } } }
        }
        // un site une fois (le lieu de sa vie le plus proche), dates incompatibles écartées, le plus proche d'abord
        $best = [];
        foreach ($found as $s) {
            $ok = mr_dates_ok($s, $L['birth'], $L['death']); if ($ok === false) { continue; }
            $k = $s['src'] . '|' . ($s['url'] ?? '') . '|' . ($s['roe'] ?? '') . '|' . $s['name'] . '|' . $s['lat'];
            if (!isset($best[$k]) || ($s['km'] ?? 99) < ($best[$k]['km'] ?? 99)) { $best[$k] = $s + ['dates' => $ok === true ? 'ok' : 'unknown']; }
        }
        $list = array_values($best); usort($list, static fn($a, $b) => ($a['km'] ?? 99) <=> ($b['km'] ?? 99));
        if ($list) { $out['matches'][] = ['trade' => $tid, 'label' => $t['label'], 'job' => $w['job'], 'count' => count($list), 'sites' => array_slice($list, 0, 8)]; }
    }
    $out['sources'] = mr_src(['casias', 'wikidata', 'roe', 'metiers']);
    return $out;
}

/* ═════════════════════ 🌊 les rivières, les repères de crues, les hautes eaux ═════════════════════ */

function mr_repere_item(array $r, ?array $from = null): array
{
    return ['lat' => $r[0], 'lon' => $r[1], 'insee' => (string) $r[2], 'commune' => (string) $r[3], 'river' => (string) $r[4], 'year' => (int) $r[5], 'month' => (int) $r[6], 'day' => (int) $r[7],
        'max' => (int) $r[8], 'alt' => $r[9], 'desc' => (string) $r[10], 'url' => 'https://www.reperesdecrues.developpement-durable.gouv.fr/repere/' . (int) $r[11],
        'km' => $from ? round(mr_km($from['lat'], $from['lon'], (float) $r[0], (float) $r[1]), 2) : null];
}
/** les cours d'eau nommés à moins de 1,5 km du point (BD TOPAGE, en ligne, gardé) : [{name, km, len_km}] */
function mr_rivers_at(float $lat, float $lon): array
{
    $key = sprintf('%.3f,%.3f', $lat, $lon);
    return mr_cached('rivers', $key, static function () use ($lat, $lon) {
        $d = 0.02; $bbox = sprintf('%.5f,%.5f,%.5f,%.5f,urn:ogc:def:crs:EPSG::4326', $lat - $d, $lon - $d * 1.4, $lat + $d, $lon + $d * 1.4);
        $j = mr_json('topage.json', 'https://services.sandre.eaufrance.fr/geo/topage?' . http_build_query(['SERVICE' => 'WFS', 'VERSION' => '2.0.0', 'REQUEST' => 'GetFeature', 'TYPENAMES' => 'sa:CoursEau',
            'OUTPUTFORMAT' => 'application/json; subtype=geojson', 'SRSNAME' => 'EPSG:4326', 'BBOX' => $bbox, 'PROPERTYNAME' => 'CdOH,TopoOH', 'COUNT' => 60]));
        $by = [];
        foreach ($j['features'] ?? [] as $f) {
            $name = trim((string) ($f['properties']['TopoOH'] ?? '')); if ($name === '') { continue; }
            $lines = ($f['geometry']['type'] ?? '') === 'MultiLineString' ? ($f['geometry']['coordinates'] ?? []) : [($f['geometry']['coordinates'] ?? [])];
            $near = INF; $len = 0.0;
            foreach ($lines as $line) {
                $prev = null;
                foreach ($line as $c) {
                    if (!is_array($c) || count($c) < 2) { continue; }
                    $near = min($near, mr_km($lat, $lon, (float) $c[1], (float) $c[0]));
                    if ($prev) { $len += mr_km((float) $prev[1], (float) $prev[0], (float) $c[1], (float) $c[0]); }
                    $prev = $c;
                }
            }
            if ($near > 1.5) { continue; }
            $k = mr_fold($name);
            if (!isset($by[$k]) || $near < $by[$k]['km']) { $by[$k] = ['name' => $name, 'km' => round($near, 2), 'len_km' => round(max($len, $by[$k]['len_km'] ?? 0), 1)]; }
        }
        $list = array_values($by);
        usort($list, static fn($a, $b) => $b['len_km'] <=> $a['len_km']); // la plus grande rivière d'abord
        return ['ok' => true, 'rivers' => array_slice($list, 0, 5)];
    });
}
/** les stations de mesure à moins de 12 km (Hub'Eau) */
function mr_stations_at(float $lat, float $lon): array
{
    return mr_cached('stations', sprintf('%.2f,%.2f', $lat, $lon), static function () use ($lat, $lon) {
        $j = mr_json('stations.json', 'https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?' . http_build_query(['latitude' => round($lat, 4), 'longitude' => round($lon, 4), 'distance' => 12,
            'fields' => 'code_station,libelle_station,libelle_cours_eau,date_ouverture_station,longitude_station,latitude_station', 'size' => 30]));
        $out = [];
        foreach ($j['data'] ?? [] as $s) {
            if (!is_numeric($s['latitude_station'] ?? null)) { continue; }
            $out[] = ['code' => (string) $s['code_station'], 'name' => (string) $s['libelle_station'], 'river' => (string) ($s['libelle_cours_eau'] ?? ''),
                'opened' => (int) substr((string) ($s['date_ouverture_station'] ?? ''), 0, 4) ?: null, 'km' => round(mr_km($lat, $lon, (float) $s['latitude_station'], (float) $s['longitude_station']), 1)];
        }
        usort($out, static fn($a, $b) => $a['km'] <=> $b['km']);
        return ['ok' => true, 'stations' => array_slice($out, 0, 6)];
    });
}
/** la hauteur maximale de chaque mois d'une station (Hub'Eau HIXM, en mm) : {"1960-10": 5330, …} */
function mr_hixm(string $code): array
{
    if (!preg_match('/^[A-Z0-9]{8,12}$/', $code)) { return ['ok' => false, 'months' => []]; }
    return mr_cached('hixm', $code, static function () use ($code) {
        $j = mr_json('hixm-' . $code . '.json', 'https://hubeau.eaufrance.fr/api/v2/hydrometrie/obs_elab?' . http_build_query(['code_entite' => $code, 'grandeur_hydro_elab' => 'HIXM', 'size' => 2000,
            'fields' => 'date_obs_elab,resultat_obs_elab']));
        $m = [];
        foreach ($j['data'] ?? [] as $x) { if (is_numeric($x['resultat_obs_elab'] ?? null)) { $m[substr((string) $x['date_obs_elab'], 0, 7)] = (int) round((float) $x['resultat_obs_elab']); } }
        ksort($m);
        return ['ok' => true, 'months' => $m];
    });
}
/** les plus hautes eaux d'une station entre deux années : {station, top:[{ym, h_m}], record:{ym, h_m}, first, last} */
function mr_high_waters(array $st, int $from, int $to): ?array
{
    $h = mr_hixm($st['code']); if (empty($h['months'])) { return !empty($h['offline']) ? ['offline' => true] : null; }
    $all = $h['months']; arsort($all); $rec = array_key_first($all);
    $life = array_filter($all, static fn($v, $k) => (int) substr($k, 0, 4) >= $from && (int) substr($k, 0, 4) <= $to, ARRAY_FILTER_USE_BOTH);
    if (!$life) { return null; }
    $top = []; $years = [];
    foreach ($life as $ym => $v) { $y = substr($ym, 0, 4); if (isset($years[$y])) { continue; } $years[$y] = 1; $top[] = ['ym' => $ym, 'h_m' => round($v / 1000, 2)]; if (count($top) >= 3) { break; } }
    $ks = array_keys($h['months']);
    return ['station' => $st, 'top' => $top, 'record' => ['ym' => $rec, 'h_m' => round($all[$rec] / 1000, 2)], 'first' => (int) substr($ks[0], 0, 4), 'last' => (int) substr(end($ks), 0, 4)];
}
/** une station sur la rivière (si elle est connue), la plus proche, qui a des mesures */
function mr_pick_station(array $stations, array $rivers): ?array
{
    $score = static function (array $st) use ($rivers): float {
        $txt = mr_fold($st['river'] . ' ' . $st['name']); $best = 0.0;
        foreach ($rivers as $r) { $n = mr_fold((string) preg_replace("/^(la |le |les |l')/iu", '', $r['name'])); if ($n !== '' && mr_has($txt, $n)) { $best = max($best, (float) $r['len_km']); } }
        return $best;
    };
    usort($stations, static fn($a, $b) => [$score($b), $a['km']] <=> [$score($a), $b['km']]);
    return $stations[0] ?? null;
}
/** GET mr_rivers&id= (une personne) | &place_id=… (un lieu) → rivières, repères de crues, hautes eaux, métiers de la rivière */
function mr_rivers_data(PDO $pdo, array $q): array
{
    $pid = safe_int($q['id'] ?? 0);
    if ($pid > 0) {
        $L = mr_life($pdo, $pid);
        $places = array_values(array_filter($L['places'], 'mr_has_pos'));
        $from = $L['birth'] ?? ($L['death'] !== null ? $L['death'] - 60 : null); $to = $L['death'] ?? ($L['birth'] !== null ? min((int) date('Y'), $L['birth'] + 80) : null);
    } else {
        $p = mr_place($pdo, $q); $places = mr_has_pos($p) && mr_in_france($p) ? [$p] : []; $L = null;
        $from = is_numeric($q['from'] ?? null) ? (int) $q['from'] : null; $to = is_numeric($q['to'] ?? null) ? (int) $q['to'] : null;
    }
    $out = ['ok' => true, 'places' => [], 'reperes' => [], 'gauges' => [], 'river_jobs' => [], 'offline' => false, 'person' => $L ? array_diff_key($L, ['places' => 1]) : null];
    if (!$places) { return $out; }
    $rep = mr_load('reperes-crues.json.gz')['rows'] ?? [];
    $seenSt = [];
    foreach (array_slice($places, 0, $pid > 0 ? 4 : 1) as $pl) {
        $rv = mr_rivers_at((float) $pl['lat'], (float) $pl['lon']);
        if (!($rv['ok'] ?? false)) { $out['offline'] = $out['offline'] || !empty($rv['offline']); }
        $rivers = $rv['rivers'] ?? [];
        $out['places'][] = ['id' => $pl['id'], 'name' => $pl['name'], 'rivers' => $rivers, 'stale' => !empty($rv['stale'])];
        // les repères : à moins de 5 km ; de son vivant d'abord, puis les plus hautes crues connues
        foreach (mr_rows_near($rep, $pl, MR_NEAR_KM, false) as $r) {
            $it = mr_repere_item($r, $pl) + ['near' => $pl['name']];
            $it['in_life'] = $from !== null && $to !== null && $it['year'] >= $from && $it['year'] <= $to;
            $out['reperes'][] = $it;
        }
        if ($from !== null && $to !== null && $to >= 1850) {
            $st = mr_stations_at((float) $pl['lat'], (float) $pl['lon']);
            if (!($st['ok'] ?? false)) { $out['offline'] = $out['offline'] || !empty($st['offline']); continue; }
            $best = mr_pick_station($st['stations'] ?? [], $rivers);
            if ($best && !isset($seenSt[$best['code']])) {
                $seenSt[$best['code']] = 1;
                $hw = mr_high_waters($best, $from, $to);
                if ($hw && empty($hw['offline'])) { $out['gauges'][] = $hw + ['near' => $pl['name']]; } elseif ($hw) { $out['offline'] = true; }
            }
        }
    }
    // un repère une fois, le plus proche ; de son vivant d'abord, puis la plus haute crue, puis la plus ancienne
    $u = []; foreach ($out['reperes'] as $r) { $k = $r['url']; if (!isset($u[$k]) || $r['km'] < $u[$k]['km']) { $u[$k] = $r; } }
    $list = array_values($u);
    usort($list, static fn($a, $b) => [(int) $b['in_life'], $b['max'], $a['km']] <=> [(int) $a['in_life'], $a['max'], $b['km']]);
    $out['reperes_count'] = count($list); $out['reperes'] = array_slice($list, 0, 12);
    // métiers de la rivière
    if ($L) {
        $main = null; foreach ($out['places'] as $p) { if ($p['rivers']) { $main = $p; break; } }
        foreach ($L['jobs'] as $j) {
            $f = mr_fold($j['text']);
            foreach (mr_trades()['river_jobs'] as $rj) {
                foreach ($rj['jobs'] as $w) { $w = mr_fold($w); if ($w !== '' && preg_match('/(^| )' . preg_quote($w, '/') . '( |$)/', $f)) { $out['river_jobs'][] = ['id' => $rj['id'], 'job' => $j['text'], 'line' => $rj['line'], 'river' => $main['rivers'][0]['name'] ?? '', 'place' => $main['name'] ?? '']; break 2; } }
            }
        }
    }
    $out['span'] = [$from, $to];
    $out['sources'] = mr_src(['topage', 'reperes', 'hubeau']);
    return $out;
}

/* ═════════════════════ 🖼️ Ton village au musée (POP) ═════════════════════ */

function mr_pop_free(string $copy): bool
{
    $c = mb_strtolower($copy, 'UTF-8');
    if (preg_match('/tous droits r[ée]serv/u', $c)) { return false; }
    return preg_match('/licence ouverte|etalab|cc[- ]?by|cc0|creative commons|domaine public|public domain/u', $c) === 1;
}
function mr_pop_item(array $s, string $base): ?array
{
    $img = $s['IMG'] ?? ''; if (is_array($img)) { $img = (string) ($img[0] ?? ''); }
    if ($img === '' || !preg_match('#^[A-Za-z0-9_./-]+\.(jpe?g|png|tiff?)$#i', $img)) { return null; }
    $ref = (string) ($s['REF'] ?? ''); if (!preg_match('/^[A-Za-z0-9_-]{4,40}$/', $ref)) { return null; }
    $title = trim((string) ($s['TICO'] ?? '')) ?: trim((string) ($s['TITR'] ?? '')) ?: trim((string) ($s['LEG'] ?? '')) ?: trim(implode(', ', (array) ($s['DENO'] ?? [])));
    $authors = implode(', ', array_filter(array_map('strval', (array) ($s['AUTR'] ?? $s['AUTP'] ?? []))));
    $when = $base === 'memoire' ? trim((string) ($s['DATPV'] ?? $s['DATOR'] ?? '')) : trim(implode(', ', array_map('strval', (array) ($s['MILL'] ?? $s['PERI'] ?? []))));
    $where = $base === 'joconde' ? trim((string) ($s['LOCA'] ?? '')) : trim((string) ($s['EDIF'] ?? ''));
    $copy = trim((string) ($s['COPY'] ?? ''));
    return ['base' => $base, 'ref' => $ref, 'title' => mb_substr($title !== '' ? $title : $ref, 0, 200), 'author' => mb_substr($authors, 0, 160), 'when' => mb_substr($when, 0, 60), 'where' => mb_substr($where, 0, 160),
        'kind' => $base === 'joconde' ? 'musée' : 'photo', 'copy' => mb_substr($copy, 0, 240), 'free' => mr_pop_free($copy),
        'thumb' => MR_IIIF . rawurlencode($img) . '/full/300,/0/default.jpg', 'page' => 'https://pop.culture.gouv.fr/notice/' . $base . '/' . rawurlencode($ref)];
}
/** GET mr_pop&place_id=… → photos (Mémoire, par code INSEE) et objets de musée (Joconde, la commune nommée dans le sujet ou le lieu) */
function mr_pop_data(PDO $pdo, array $q): array
{
    $p = mr_place($pdo, $q);
    if (!mr_in_france($p) || ($p['insee'] === '' && $p['name'] === '')) { return ['ok' => false, 'noplace' => true]; }
    return mr_cached('pop', $p['insee'] . '|' . mr_fold($p['name']), static function () use ($p) {
        $items = [];
        if ($p['insee'] !== '') {
            $j = mr_json('pop-memoire.json', mr_pop_url('/search/simple', ['bases' => ['memoire'], 'facets' => ['INSEE' => [$p['insee']]], 'size' => 24, 'filters' => ['hasImage' => 'true']]));
            foreach ($j['hits'] ?? [] as $h) { if ($it = mr_pop_item($h['_source'] ?? [], 'memoire')) { $items[] = $it; } }
            $memTotal = (int) ($j['total'] ?? 0);
        }
        if ($p['name'] !== '' && mb_strlen($p['name']) >= 3) {
            $j = mr_json('pop-joconde.json', mr_pop_url('/search/simple', ['bases' => ['joconde'], 'text' => '"' . $p['name'] . '"', 'size' => 40, 'filters' => ['hasImage' => 'true']]));
            // la commune doit être NOMMÉE (avec sa majuscule) dans le sujet, le titre ou le lieu de création : pas le « tulle » du tissu
            $re = '/(^|[^\p{L}])' . preg_quote($p['name'], '/') . '([^\p{L}]|$)/u'; $dep = $p['insee'] !== '' ? mr_dep_of($p['insee']) : '';
            foreach ($j['hits'] ?? [] as $h) {
                $s = $h['_source'] ?? [];
                $txt = implode(' ; ', array_map(static fn($k) => is_array($s[$k] ?? null) ? implode(' ; ', array_map('strval', $s[$k])) : (string) ($s[$k] ?? ''), ['REPR', 'TITR', 'LIEUX', 'PLIEUX', 'GEOHI', 'PREP', 'HIST']));
                if (!preg_match($re, $txt)) { continue; }
                if ($it = mr_pop_item($s, 'joconde')) { $items[] = $it; }
                if (count($items) >= 40) { break; }
            }
        }
        return ['ok' => true, 'items' => $items, 'memoire_total' => $memTotal ?? 0, 'search' => 'https://pop.culture.gouv.fr/search/list?mainSearch=' . rawurlencode('"' . $p['name'] . '"'), 'source' => MR_SOURCES['pop']];
    }) + ['place' => $p];
}

function mr_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS mr_keeps (batch TEXT PRIMARY KEY, media_id INTEGER NOT NULL, source_id INTEGER NOT NULL DEFAULT 0, filename TEXT NOT NULL DEFAULT '',
        ref TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, undone_at TEXT NOT NULL DEFAULT '')");
}
/** POST mr_pop_keep {base, ref, place_name} → l'image dans les médias (seulement sous licence libre, relue sur POP) */
function mr_pop_keep(PDO $pdo, array $d): array
{
    mr_schema($pdo);
    $base = (string) ($d['base'] ?? ''); $ref = (string) ($d['ref'] ?? '');
    if (!in_array($base, ['memoire', 'joconde'], true) || !preg_match('/^[A-Za-z0-9_-]{4,40}$/', $ref)) { throw new LcndaBadInput('Notice inconnue.'); }
    $s = mr_json('pop-notice.json', 'https://api.pop.culture.gouv.fr/notices/' . $base . '/' . rawurlencode($ref));
    $it = mr_pop_item($s, $base);
    if (!$it) { throw new RuntimeException(i18n_t('Cette notice n’a pas d’image.')); }
    if (!$it['free']) { throw new RuntimeException(i18n_t('Cette image n’est pas sous licence libre : elle reste sur POP (le lien suffit).')); }
    $img = $s['IMG'] ?? ''; if (is_array($img)) { $img = (string) ($img[0] ?? ''); }
    $bin = mr_http('pop-image.jpg', MR_IIIF . rawurlencode($img) . '/full/!2000,2000/0/default.jpg', 25_000_000, 'image/*');
    $info = @getimagesizefromstring($bin);
    $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png'][$info[2] ?? 0] ?? null;
    if (!$ext) { throw new RuntimeException(i18n_t('Ce n’est pas une image (JPEG ou PNG).')); }
    if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (@file_put_contents(MEDIA_DIR . '/' . $name, $bin) === false) { throw new RuntimeException(i18n_t('Impossible d’enregistrer l’image.')); }
    $place = mb_substr(trim(safe_text($d['place_name'] ?? '')), 0, 120);
    $attribution = trim(($it['author'] !== '' ? $it['author'] . ', ' : '') . $it['title'] . ($it['when'] !== '' ? ' (' . $it['when'] . ')' : '') . ' — ' . $it['copy'] . ' — POP, ministère de la Culture — ' . $it['page']);
    $batch = 'mr-' . bin2hex(random_bytes(6));
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_title, document_url, document_reference) VALUES(?,?,?,?,?,?,?,?,?)')
            ->execute([$it['title'], mb_substr(($place !== '' ? i18n_t('{p} au musée', ['p' => $place]) . ".\n" : '') . $attribution, 0, 1000), 'image', $name, $name, $it['when'], 'POP — ' . ($base === 'memoire' ? 'Mémoire' : 'Joconde'), $it['page'], $it['copy']]);
        $mid = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([mb_substr('POP — ' . $it['title'], 0, 400), mb_substr($it['author'], 0, 200), 'Ministère de la Culture, POP', mb_substr($it['copy'], 0, 200), $it['page'], $attribution]);
        $sid = (int) $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mid, $sid]);
        $pdo->prepare('INSERT INTO mr_keeps(batch, media_id, source_id, filename, ref) VALUES(?,?,?,?,?)')->execute([$batch, $mid, $sid, $name, $base . '/' . $ref]);
        if (function_exists('log_change')) { log_change($pdo, 'media', $mid, 'create', i18n_t('Image gardée depuis POP') . ' — ' . $it['copy']); }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        @unlink(MEDIA_DIR . '/' . $name);
        throw $e;
    }
    return ['ok' => true, 'batch' => $batch, 'media_id' => $mid, 'licence' => $it['copy']];
}
function mr_pop_keep_undo(PDO $pdo, array $d): array
{
    mr_schema($pdo);
    $batch = (string) ($d['batch'] ?? '');
    if (!preg_match('/^mr-[0-9a-f]{12}$/', $batch)) { throw new LcndaBadInput('Ajout inconnu.'); }
    $s = $pdo->prepare("SELECT * FROM mr_keeps WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException(i18n_t('Déjà annulé, ou introuvable.')); }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM media_links WHERE media_id=?')->execute([(int) $r['media_id']]);
        $pdo->prepare('DELETE FROM media WHERE id=?')->execute([(int) $r['media_id']]);
        $pdo->prepare('DELETE FROM source_links WHERE source_record_id=?')->execute([(int) $r['source_id']]);
        $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([(int) $r['source_id']]);
        $pdo->prepare('UPDATE mr_keeps SET undone_at=CURRENT_TIMESTAMP WHERE batch=?')->execute([$batch]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if (preg_match('/^[0-9a-f]{32}\.\w+$/', (string) $r['filename'])) { @unlink(MEDIA_DIR . '/' . $r['filename']); }
    return ['ok' => true];
}

/* ═════════════════════ Réglages : ce qui est gardé, les sources ═════════════════════ */

function mr_cache_info(): array { $n = 0; $b = 0; foreach (glob(mr_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); } return ['count' => $n, 'bytes' => $b]; }
function mr_cache_clear(): array
{
    $dir = mr_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $x) { @rmdir($x); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function mr_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = mr_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}
function mr_about(): array
{
    $count = static fn(string $f) => count(mr_load($f)['rows'] ?? []);
    $casias = 0; $deps = 0; foreach (glob(mr_data_dir() . '/casias/casias-*.json.gz') ?: [] as $f) { $deps++; $casias += count(mr_load('casias/' . basename($f))['rows'] ?? []); }
    $what = ['casias' => i18n_t('Anciens sites industriels et activités de service (nom, activité, commune ; pas de dates)'), 'wikidata' => i18n_t('Mines et carrières, avec leurs dates quand elles sont connues'),
        'roe' => i18n_t('Moulins et usines à eau : nom, rivière, commune'), 'reperes' => i18n_t('Repères de crues : date, lieu, rivière, photo'), 'topage' => i18n_t('Les rivières qui passent dans la commune (en ligne)'),
        'hubeau' => i18n_t('Les plus hautes eaux de chaque mois aux stations de mesure (en ligne)'), 'pop' => i18n_t('Photos et objets de musée de la commune (en ligne)'), 'metiers' => i18n_t('Quel métier travaillait où')];
    $n = ['casias' => $casias, 'wikidata' => $count('metiers-mines.json.gz'), 'roe' => $count('roe-moulins.json.gz'), 'reperes' => $count('reperes-crues.json.gz')];
    $rows = [];
    foreach (MR_SOURCES as $k => $s) { $rows[] = ['id' => $k, 'what' => $what[$k], 'count' => $n[$k] ?? null, 'online' => in_array($k, ['topage', 'hubeau', 'pop'], true)] + $s; }
    return ['ok' => true, 'sources' => $rows, 'casias_deps' => $deps, 'cache' => mr_cache_info(),
        'built' => ['roe' => (string) (mr_load('roe-moulins.json.gz')['built'] ?? ''), 'reperes' => (string) (mr_load('reperes-crues.json.gz')['built'] ?? '')]];
}

/* ═════════════════════ les points d'entrée (api.php) ═════════════════════ */

function mr_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'mr_person' => mr_person_data($pdo, safe_int($q['id'] ?? 0)),
        'mr_place' => mr_place_data($pdo, $q),
        'mr_rivers' => mr_rivers_data($pdo, $q),
        'mr_pop' => mr_pop_data($pdo, $q),
        'mr_about' => mr_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function mr_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'mr_pop_keep' => mr_pop_keep($pdo, $d),
        'mr_pop_keep_undo' => mr_pop_keep_undo($pdo, $d),
        'mr_cache_clear' => mr_cache_clear(),
        'mr_cache_restore' => mr_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
