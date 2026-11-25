<?php
declare(strict_types=1);

/**
 * ⛰️👥 Sa terre et ses gens (lot 10) — serveur de assets/js/heritage-lot10-terre-gens.js.
 * Les données Wikidata et Wikipédia sont livrées dans l'app (assets/data/l10t-*.json.gz, lues par la page) ; ce fichier sert :
 *  - GET  l10t_person&id=           le contexte d'une fiche : ses lieux (code INSEE, position, pays), ses événements, ses métiers,
 *                                   les lieux de son conjoint ; « online » = false pour une personne vivante ou confidentielle ;
 *  - GET  l10t_place&place_id=|insee=|name=&lat=&lon=   le code INSEE, la position et le pays d'un lieu ;
 *  - GET  l10t_risques&insee=[&fresh=1]   ⛰️ glissements, éboulements, effondrements (BDMvt) et 🕳️ cavités souterraines (BRGM,
 *                                   Géorisques, Licence Ouverte 2.0) d'une commune, EN LIGNE, gardé 90 jours (on n'envoie que le code INSEE) ;
 *  - GET  l10t_nom&last=            👥 où sont nés les porteurs du nom, d'après les décès INSEE déjà importés dans l'app (rien en ligne) ;
 *  - GET  l10t_marche&lat1=&lon1=&lat2=&lon2=   🚶 le temps de marche entre deux lieux, relief compris (altitudes IGN, en ligne, gardé) ;
 *  - GET  l10t_parcelle&insee=&lieudit=   🗺️ le lieu-dit (IGN, BD TOPO) puis la parcelle du cadastre d'aujourd'hui (lib/cadastre.php) ;
 *  - GET  l10t_about ;  POST l10t_cache_clear / l10t_cache_restore {token}.
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_L10T_DIR (un fichier <étape> par appel ; absent = hors ligne).
 */

require_once __DIR__ . '/commune_culture.php'; // cc_find_insee, cc_dep_of_insee, cc_data('communes'), cc_departements

const L10T_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande)';
const L10T_HOSTS = ['www.georisques.gouv.fr', 'data.geopf.fr'];
const L10T_TTL = ['risques' => 90 * 86400, 'marche' => 365 * 86400, 'parcelle' => 90 * 86400];
const L10T_KIND = ['BIRT' => 'birth', 'CHR' => 'bapt', 'BAPM' => 'bapt', 'MARR' => 'marriage', 'MRCI' => 'marriage', 'MRRE' => 'marriage', 'DEAT' => 'death', 'BURI' => 'burial',
    'RESI' => 'resi', 'CENS' => 'resi', 'OCCU' => 'occu', 'EMIG' => 'emig', 'IMMI' => 'immi', 'NATU' => 'natu'];
/** pays reconnus (texte du champ « pays » du lieu) → code */
const L10T_COUNTRY = ['fr' => '/^(fr|fra|france)$/i', 'dz' => '/alg[ée]rie|algeria/i', 'ca' => '/canada|qu[ée]bec|nouvelle[- ]france/i', 'ch' => '/suisse|switzerland|schweiz|svizzera/i',
    'us' => '/[ée]tats[- ]unis|united states|^usa$|^u\.s\.a?\.?$|am[ée]rique/i', 'be' => '/belgique|belgium/i', 'it' => '/italie|italy/i'];

/* ═════════════════════ cache, réseau ═════════════════════ */

function l10t_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir())), '/') . '/cache/lot10-terre-gens';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function l10t_cache_get(string $key, int $ttl): ?array
{
    $f = l10t_cache_dir() . '/' . sha1($key) . '.json';
    if (!is_file($f)) { return null; }
    $j = json_decode((string) @file_get_contents($f), true);
    if (!is_array($j) || !isset($j['data'])) { return null; }
    $j['stale'] = (time() - (int) ($j['at'] ?? 0)) > $ttl;
    return $j;
}
function l10t_cache_put(string $key, array $data): void
{
    $d = l10t_cache_dir(true);
    @file_put_contents($d . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}
function l10t_test_dir(): string
{
    $dir = (string) getenv('LCNDA_TEST_L10T_DIR');
    return getenv('GENEALOGY_TEST') === '1' && $dir !== '' ? $dir : '';
}
/** un appel en ligne (texte brut) ; en essai, la réponse est lue dans LCNDA_TEST_L10T_DIR/<étape> */
function l10t_http(string $step, string $url): string
{
    $step = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
    if (($dir = l10t_test_dir()) !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        if (!is_file($dir . '/' . $step)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($dir . '/' . $step);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), L10T_HOSTS, true)) { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false; $max = 6_000_000;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => L10T_UA, CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }]
        + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code === 429) { throw new RuntimeException(i18n_t('Le service est occupé : réessaie dans une minute.')); }
    if ($code >= 400) { throw new RuntimeException(i18n_t('Le service a répondu par une erreur ({c}).', ['c' => (string) $code])); }
    return $body;
}
/** une réponse gardée, ou lue en ligne (et gardée) ; hors ligne : la vieille réponse si on l'a */
function l10t_cached(string $kind, string $key, bool $fresh, callable $fetch): array
{
    $c = l10t_cache_get($kind . ':' . $key, L10T_TTL[$kind]);
    if ($c && !$fresh && !$c['stale']) { return $c['data'] + ['ok' => true, 'cached' => true, 'fetched_at' => (int) $c['at']]; }
    try {
        $data = $fetch();
        l10t_cache_put($kind . ':' . $key, $data);
        return $data + ['ok' => true, 'cached' => false, 'fetched_at' => time()];
    } catch (Throwable $e) {
        if ($c) { return $c['data'] + ['ok' => true, 'cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
}

function l10t_fold(string $s): string
{
    $s = mb_strtolower($s);
    $s = (string) (class_exists('Normalizer') ? preg_replace('/\p{Mn}+/u', '', (string) Normalizer::normalize($s, Normalizer::FORM_D)) : iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s));
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', str_replace(['’', "'"], ' ', $s)));
}
function l10t_country(string $country, string $county = ''): string
{
    foreach (L10T_COUNTRY as $code => $re) { if ($country !== '' && preg_match($re, $country)) { return $code; } }
    if ($country === '' && preg_match('/qu[ée]bec/i', $county)) { return 'ca'; }
    return '';
}

/* ═════════════════════ la fiche, un lieu ═════════════════════ */

function l10t_place_row(array $e): ?array
{
    if (empty($e['place_id'])) { return null; }
    $insee = preg_match('/^\d[\dAB]\d{3}$/', (string) ($e['insee'] ?? '')) ? (string) $e['insee'] : '';
    $lat = is_numeric($e['lat'] ?? null) ? (float) $e['lat'] : null; $lon = is_numeric($e['lon'] ?? null) ? (float) $e['lon'] : null;
    $full = trim((string) $e['name']);
    $name = trim((string) preg_replace('/\s*[,(].*$/u', '', $full));
    $country = trim((string) ($e['country'] ?? '')); $county = trim((string) ($e['county'] ?? ''));
    $cc = l10t_country($country, $county);
    $fr = $insee !== '' || $cc === 'fr' || ($country === '' && $cc === '');
    // « Chastang, Saint-Donat » : un lieu-dit dans une commune → la commune pour le code INSEE, le lieu-dit à part
    $lieudit = '';
    if ($insee === '' && $fr && preg_match('/^([^,]+),\s*([^,]+)/u', $full, $m)) {
        $i2 = cc_find_insee(trim($m[2]), $county, $lat, $lon, $country);
        if ($i2 !== '' && cc_find_insee(trim($m[1]), $county, null, null, $country) === '') { $insee = $i2; $lieudit = trim($m[1]); $name = trim($m[2]); }
    }
    if ($insee === '' && $fr) { $insee = cc_find_insee($name, $county, $lat, $lon, $country); }
    if ($insee !== '' && $lat === null) { $c = cc_data('communes')['c'][$insee] ?? null; if ($c && $c[1] !== null) { $lat = (float) $c[1]; $lon = (float) $c[2]; } }
    $commune = $insee !== '' ? (string) (cc_data('communes')['c'][$insee][0] ?? $name) : '';
    return ['id' => (int) $e['place_id'], 'name' => $name, 'full' => $full, 'insee' => $insee, 'commune' => $commune, 'lieudit' => $lieudit, 'dep' => $insee !== '' ? cc_dep_of_insee($insee) : '',
        'lat' => $lat, 'lon' => $lon, 'cc' => $insee !== '' ? 'fr' : $cc, 'country' => $country, 'county' => $county];
}

function l10t_person(PDO $pdo, array $q): array
{
    $pid = safe_int($q['id'] ?? ($q['person_id'] ?? 0));
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new LcndaBadInput('Fiche introuvable.'); }
    $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $x = in_array('admin4_code', $pc, true) ? "COALESCE(pl.admin4_code,'')" : "''";
    $sql = "SELECT e.id, e.year, e.sort_date, e.title, e.description, e.family_id, COALESCE(t.gedcom_tag,'') AS tag, pl.id AS place_id,
        COALESCE(pl.name,'') AS name, COALESCE(pl.county,'') AS county, COALESCE(pl.country,'') AS country, $x AS insee, pl.latitude AS lat, pl.longitude AS lon
        FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year, 9999)";
    $collect = static function (int $id) use ($pdo, $sql): array {
        $ev = $pdo->prepare($sql); $ev->execute([$id, $id, $id]);
        $places = []; $events = []; $jobs = [];
        foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
            $tag = strtoupper((string) $e['tag']);
            if ($e['family_id'] && !in_array($tag, ['MARR', 'MRCI', 'MRRE'], true)) { continue; }
            $pl = l10t_place_row($e); $k = null;
            if ($pl) { $k = 'p' . $pl['id']; $places[$k] ??= $pl; }
            $kind = L10T_KIND[$tag] ?? 'other';
            $txt = trim((string) $e['title'] . ' ' . (string) $e['description']);
            if ($kind === 'occu' && $txt !== '') { $jobs[] = mb_substr($txt, 0, 120); }
            $date = preg_match('/^(\d{4})-(\d\d)-(\d\d)/', (string) $e['sort_date'], $m) && $m[2] !== '00' ? $m[1] . '-' . $m[2] . ($m[3] !== '00' ? '-' . $m[3] : '') : '';
            $events[] = ['kind' => $kind, 'tag' => $tag, 'year' => is_numeric($e['year']) ? (int) $e['year'] : null, 'date' => $date, 'place' => $k, 'family' => (int) $e['family_id'] ?: null];
        }
        return [$places, $events, $jobs];
    };
    [$places, $events, $jobs] = $collect($pid);
    foreach (preg_split('/\s*[;,\/]\s*/u', (string) ($p['occupation'] ?? '')) ?: [] as $t) { if (trim((string) $t) !== '') { array_unshift($jobs, trim((string) $t)); } }
    $kiosk = function_exists('kiosk_state') && kiosk_state()['on'];
    $private = (int) ($p['is_private'] ?? 0) === 1;
    $living = (string) ($p['living_status'] ?? '') === 'living';
    // les conjoints : leurs lieux (pour 🚶 « sa femme habitait à 3 h de marche »)
    $spouses = [];
    $st = $pdo->prepare('SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END AS id FROM families WHERE (partner1_id=? OR partner2_id=?)');
    $st->execute([$pid, $pid, $pid]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $sid) {
        $sid = (int) $sid; if (!$sid || $sid === $pid) { continue; }
        $r = $pdo->prepare('SELECT id, first_name, last_name, gender, is_private, living_status FROM persons WHERE id=?'); $r->execute([$sid]); $r = $r->fetch(PDO::FETCH_ASSOC); if (!$r) { continue; }
        $hidden = (int) $r['is_private'] === 1 && $kiosk;
        [$spl, $sev] = $collect($sid);
        $spouses[] = ['id' => $sid, 'first' => $hidden ? '' : trim((string) $r['first_name']), 'gender' => (string) $r['gender'], 'private' => (int) $r['is_private'] === 1, 'living' => (string) $r['living_status'] === 'living',
            'places' => (object) $spl, 'events' => array_values(array_filter($sev, static fn($e) => !$e['family']))];
    }
    return ['ok' => true, 'id' => $pid, 'first' => ($private && $kiosk) ? '' : trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'gender' => (string) ($p['gender'] ?? ''),
        'kind' => (string) ($p['kind'] ?? 'human'), 'living' => $living, 'private' => $private, 'online' => !$living && !$private,
        'places' => (object) $places, 'events' => $events, 'jobs' => array_values(array_unique($jobs)), 'spouses' => $spouses];
}

/** GET l10t_place : le code INSEE, la position et le pays d'un lieu (fiche d'un village, monographie, 🧰 Données) */
function l10t_place(PDO $pdo, array $q): array
{
    $pid = safe_int($q['place_id'] ?? 0);
    $row = ['place_id' => $pid ?: -1, 'name' => safe_text($q['name'] ?? ''), 'county' => safe_text($q['county'] ?? ''), 'country' => safe_text($q['country'] ?? ''),
        'insee' => (string) ($q['insee'] ?? ''), 'lat' => $q['lat'] ?? null, 'lon' => $q['lon'] ?? null];
    if ($pid) {
        $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
        $x = in_array('admin4_code', $pc, true) ? "COALESCE(admin4_code,'')" : "''";
        $s = $pdo->prepare("SELECT name, county, country, latitude, longitude, $x AS insee FROM places WHERE id=?"); $s->execute([$pid]);
        if ($r = $s->fetch(PDO::FETCH_ASSOC)) {
            foreach (['name', 'county', 'country', 'insee'] as $k) { if (trim((string) $row[$k]) === '') { $row[$k] = (string) $r[$k]; } }
            if (!is_numeric($row['lat'])) { $row['lat'] = $r['latitude']; $row['lon'] = $r['longitude']; }
        }
    }
    if ($row['name'] === '' && $row['insee'] === '') { return ['ok' => true, 'place' => null]; }
    $pl = l10t_place_row($row);
    if ($pl && $pl['insee'] === '' && preg_match('/^\d[\dAB]\d{3}$/', (string) $row['insee'])) { $pl['insee'] = (string) $row['insee']; $pl['dep'] = cc_dep_of_insee($pl['insee']); $pl['cc'] = 'fr'; }
    if ($pl && $pl['insee'] !== '') { $c = cc_data('communes')['c'][$pl['insee']] ?? null; if ($c) { $pl['commune'] = (string) $c[0]; if ($pl['lat'] === null && $c[1] !== null) { $pl['lat'] = (float) $c[1]; $pl['lon'] = (float) $c[2]; } } }
    if ($pl) { $pl['id'] = max(0, $pid); }
    return ['ok' => true, 'place' => $pl];
}

/* ═════════════════════ ⛰️ 🕳️ Géorisques : mouvements de terrain, cavités ═════════════════════ */

const L10T_GR = 'https://www.georisques.gouv.fr/api/v1/';
function l10t_risques(array $q): array
{
    $insee = (string) ($q['insee'] ?? '');
    if (!preg_match('/^\d[\dAB]\d{3}$/', $insee)) { throw new LcndaBadInput('Code INSEE attendu.'); }
    $fresh = !empty($q['fresh']);
    $urlM = L10T_GR . 'mvt?' . http_build_query(['code_insee' => $insee, 'page_size' => 500]);
    $urlC = L10T_GR . 'cavites?' . http_build_query(['code_insee' => $insee, 'page_size' => 500]);
    return l10t_cached('risques', $insee, $fresh, static function () use ($insee, $urlM, $urlC) {
        $m = json_decode(l10t_http('mvt-' . $insee, $urlM), true);
        usleep(l10t_test_dir() === '' ? 400000 : 0); // poli : une demande à la fois
        $c = json_decode(l10t_http('cav-' . $insee, $urlC), true);
        if (!is_array($m) || !is_array($c)) { throw new RuntimeException(i18n_t('Réponse de Géorisques illisible.')); }
        $mvt = [];
        foreach ($m['data'] ?? [] as $r) {
            $d = (string) ($r['date_debut'] ?? '');
            $mvt[] = ['id' => (string) ($r['identifiant'] ?? ''), 'type' => (string) ($r['type'] ?? ''), 'date' => preg_match('/^\d{4}(-\d\d-\d\d)?/', $d) ? $d : '', 'y' => preg_match('/^(\d{4})/', $d, $mm) ? (int) $mm[1] : null,
                'prec' => (string) ($r['precision_date'] ?? ''), 'lieu' => trim((string) ($r['lieu'] ?? '')), 'fiab' => (string) ($r['fiabilite'] ?? ''), 'note' => trim((string) ($r['commentaire_mvt'] ?? '')),
                'lat' => is_numeric($r['latitude'] ?? null) ? (float) $r['latitude'] : null, 'lon' => is_numeric($r['longitude'] ?? null) ? (float) $r['longitude'] : null];
        }
        usort($mvt, static fn($a, $b) => [$a['y'] === null, $a['date']] <=> [$b['y'] === null, $b['date']]);
        $cav = [];
        foreach ($c['data'] ?? [] as $r) {
            $cav[] = ['id' => (string) ($r['identifiant'] ?? ''), 'type' => (string) ($r['type'] ?? ''), 'nom' => trim((string) ($r['nom'] ?? '')),
                'lat' => is_numeric($r['latitude'] ?? null) ? (float) $r['latitude'] : null, 'lon' => is_numeric($r['longitude'] ?? null) ? (float) $r['longitude'] : null];
        }
        return ['insee' => $insee, 'mvt' => $mvt, 'mvt_total' => (int) ($m['results'] ?? count($mvt)), 'cav' => $cav, 'cav_total' => (int) ($c['results'] ?? count($cav)), 'url_mvt' => $urlM, 'url_cav' => $urlC];
    });
}

/* ═════════════════════ 👥 la carte du nom (décès INSEE importés) ═════════════════════ */

function l10t_nom(PDO $pdo, array $q): array
{
    $last = trim((string) ($q['last'] ?? ''));
    $key = strtoupper(trim((string) preg_replace('/\s+/', ' ', l10t_fold($last))));
    if ($key === '' || mb_strlen($key) < 2) { throw new LcndaBadInput('Nom de famille attendu.'); }
    $has = (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='insee_deces'")->fetchColumn();
    if (!$has) { return ['ok' => true, 'name' => $key, 'total' => 0, 'base' => 0]; }
    $base = (int) $pdo->query('SELECT count(*) FROM (SELECT 1 FROM insee_deces LIMIT 1)')->fetchColumn();
    if (!$base) { return ['ok' => true, 'name' => $key, 'total' => 0, 'base' => 0]; }
    try { $range = $pdo->query('SELECT MIN(min_annee_deces), MAX(max_annee_deces) FROM insee_deces_imports')->fetch(PDO::FETCH_NUM) ?: [null, null]; } catch (Throwable $_) { $range = [null, null]; }
    $variants = array_values(array_unique([$key, str_replace(' ', '-', $key), str_replace('-', ' ', $key)]));
    $in = implode(',', array_fill(0, count($variants), '?'));
    $s = $pdo->prepare("SELECT code_lieu_naissance AS c, pays_naissance AS p, annee_naissance AS y FROM insee_deces WHERE nom IN ($in)");
    $s->execute($variants);
    $dep = []; $abroad = []; $dec = []; $total = 0; $ymin = null; $ymax = null;
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $total++;
        $c = strtoupper(trim((string) $r['c']));
        if (preg_match('/^99/', $c) || ($c === '' && trim((string) $r['p']) !== '')) { $pays = trim((string) $r['p']) ?: '?'; $abroad[$pays] = ($abroad[$pays] ?? 0) + 1; }
        elseif (preg_match('/^(\d[\dAB])/', $c)) { $d = str_starts_with($c, '97') ? substr($c, 0, 3) : substr($c, 0, 2); $dep[$d] = ($dep[$d] ?? 0) + 1; }
        if (is_numeric($r['y']) && (int) $r['y'] > 1800) { $y = (int) $r['y']; $k = intdiv($y, 10) * 10; $dec[$k] = ($dec[$k] ?? 0) + 1; $ymin = min($ymin ?? $y, $y); $ymax = max($ymax ?? $y, $y); }
    }
    arsort($dep); arsort($abroad); ksort($dec);
    $names = cc_departements();
    // le centre de chaque département (moyenne de ses communes) pour la petite carte
    static $centre = null;
    if ($centre === null) {
        $centre = []; $acc = [];
        foreach ((cc_data('communes')['c'] ?? []) as $insee => $c) { if ($c[1] === null) { continue; } $d = cc_dep_of_insee((string) $insee); $acc[$d][0] = ($acc[$d][0] ?? 0) + $c[1]; $acc[$d][1] = ($acc[$d][1] ?? 0) + $c[2]; $acc[$d][2] = ($acc[$d][2] ?? 0) + 1; }
        foreach ($acc as $d => [$la, $lo, $n]) { $centre[$d] = [round($la / $n, 3), round($lo / $n, 3)]; }
    }
    $deps = [];
    foreach ($dep as $d => $n) { $deps[] = ['dep' => (string) $d, 'name' => (string) ($names[$d] ?? $d), 'n' => $n, 'lat' => $centre[$d][0] ?? null, 'lon' => $centre[$d][1] ?? null]; }
    $ab = []; foreach (array_slice($abroad, 0, 12, true) as $pays => $n) { $ab[] = ['country' => (string) $pays, 'n' => $n]; }
    $dc = []; foreach ($dec as $k => $n) { $dc[] = ['decade' => $k, 'n' => $n]; }
    return ['ok' => true, 'name' => $key, 'total' => $total, 'base' => 1, 'deps' => $deps, 'abroad' => $ab, 'abroad_total' => array_sum($abroad), 'decades' => $dc,
        'born' => [$ymin, $ymax], 'deaths' => [$range[0] !== null ? (int) $range[0] : null, $range[1] !== null ? (int) $range[1] : null]];
}

/* ═════════════════════ 🚶 le temps de marche, relief compris ═════════════════════ */

const L10T_DETOUR = 1.3; // les chemins font environ 1,3 fois la ligne droite (même règle que « Le lieu à son époque »)
function l10t_km(float $a, float $b, float $c, float $d): float
{
    $r = M_PI / 180; $x = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
    return 6371 * 2 * atan2(sqrt($x), sqrt(1 - $x));
}
/** règle de Tobler : vitesse (km/h) = 6 × exp(−3,5 × |pente + 0,05|) ; le profil est celui de la ligne droite, allongé de L10T_DETOUR */
function l10t_walk(array $pts): array
{
    $h = 0.0; $km = 0.0; $up = 0.0; $down = 0.0; $zmax = null; $zmin = null;
    for ($i = 1, $n = count($pts); $i < $n; $i++) {
        [$la0, $lo0, $z0] = $pts[$i - 1]; [$la1, $lo1, $z1] = $pts[$i];
        $d = l10t_km($la0, $lo0, $la1, $lo1) * L10T_DETOUR; if ($d <= 0) { continue; }
        $dz = $z1 - $z0; $slope = $dz / ($d * 1000);
        $v = 6 * exp(-3.5 * abs($slope + 0.05));
        $h += $d / max(0.5, $v); $km += $d;
        if ($dz > 0) { $up += $dz; } else { $down -= $dz; }
        $zmax = max($zmax ?? $z1, $z1, $z0); $zmin = min($zmin ?? $z1, $z1, $z0);
    }
    $flat = $km / 5; // sur le plat, à 5 km/h (Tobler sur un chemin plat)
    return ['hours' => round($h, 2), 'km' => round($km, 1), 'up' => (int) round($up), 'down' => (int) round($down), 'zmin' => $zmin !== null ? (int) round($zmin) : null, 'zmax' => $zmax !== null ? (int) round($zmax) : null, 'flat_hours' => round($flat, 2)];
}
function l10t_marche(array $q): array
{
    $c = [];
    foreach (['lat1', 'lon1', 'lat2', 'lon2'] as $k) { if (!is_numeric($q[$k] ?? null)) { throw new LcndaBadInput('Deux lieux placés sur la carte sont nécessaires.'); } $c[$k] = round((float) $q[$k], 4); }
    $direct = l10t_km($c['lat1'], $c['lon1'], $c['lat2'], $c['lon2']);
    if ($direct > 60) { return ['ok' => true, 'too_far' => true, 'direct_km' => round($direct, 1)]; }
    if ($direct < 0.3) { return ['ok' => true, 'too_close' => true, 'direct_km' => round($direct, 2)]; }
    $n = (int) max(10, min(200, round($direct * 4))); // un point tous les 250 m environ
    $url = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?' . http_build_query(['lon' => $c['lon1'] . '|' . $c['lon2'], 'lat' => $c['lat1'] . '|' . $c['lat2'],
        'resource' => 'ign_rge_alti_wld', 'profile_mode' => 'simple', 'sampling' => $n, 'zonly' => 'false']);
    $r = l10t_cached('marche', implode(',', $c), !empty($q['fresh']), static function () use ($url) {
        $j = json_decode(l10t_http('alti', $url), true);
        $pts = [];
        foreach ($j['elevations'] ?? [] as $e) { if (is_numeric($e['z'] ?? null) && (float) $e['z'] > -100) { $pts[] = [(float) $e['lat'], (float) $e['lon'], (float) $e['z']]; } }
        if (count($pts) < 2) { throw new RuntimeException(i18n_t('Pas d’altitude pour ces lieux (hors de France ?).')); }
        return ['profile' => array_map(static fn($p) => (int) round($p[2]), $pts), 'walk' => l10t_walk($pts), 'url' => $url];
    });
    return $r + ['direct_km' => round($direct, 1), 'detour' => L10T_DETOUR];
}

/* ═════════════════════ 🗺️ la parcelle d'un lieu-dit ═════════════════════ */

function l10t_parcelle(PDO $pdo, array $q): array
{
    $insee = (string) ($q['insee'] ?? ''); $ld = trim((string) preg_replace('/\s+/', ' ', (string) ($q['lieudit'] ?? '')));
    if (!preg_match('/^\d[\dAB]\d{3}$/', $insee)) { throw new LcndaBadInput('Choisis d’abord une commune de France.'); }
    if (mb_strlen($ld) < 2 || mb_strlen($ld) > 80) { throw new LcndaBadInput('Écris le nom du lieu-dit (ex. « La Combe »).'); }
    $url = 'https://data.geopf.fr/geocodage/search?' . http_build_query(['q' => $ld, 'index' => 'poi', 'citycode' => $insee, 'limit' => 5]);
    $geo = l10t_cached('parcelle', $insee . ':' . l10t_fold($ld), !empty($q['fresh']), static function () use ($url, $insee) {
        $j = json_decode(l10t_http('geo', $url), true);
        $out = [];
        foreach ($j['features'] ?? [] as $f) {
            $p = $f['properties'] ?? []; $co = $f['geometry']['coordinates'] ?? null;
            if (!is_array($co) || !in_array($insee, (array) ($p['citycode'] ?? []), true)) { continue; }
            $out[] = ['name' => (string) ($p['toponym'] ?? ($p['name'][0] ?? '')), 'cat' => implode(', ', (array) ($p['category'] ?? [])), 'lat' => (float) $co[1], 'lon' => (float) $co[0], 'score' => (float) ($p['score'] ?? 0)];
        }
        return ['places' => $out, 'url' => $url];
    });
    if (!($geo['ok'] ?? false)) { return $geo; }
    if (!$geo['places']) { return $geo + ['parcels' => []]; }
    $best = $geo['places'][0];
    require_once __DIR__ . '/cadastre.php';
    try { $cad = cadastre_lookup($pdo, ['mode' => 'point', 'lat' => $best['lat'], 'lon' => $best['lon']]); }
    catch (Throwable $e) { return $geo + ['parcels' => [], 'cadastre_error' => $e->getMessage()]; }
    $parcels = array_slice($cad['parcels'] ?? [], 0, 3);
    return $geo + ['parcels' => $parcels, 'attribution' => $cad['attribution'] ?? '', 'cadastre_source' => $cad['source'] ?? ''];
}

/* ═════════════════════ réglages ═════════════════════ */

function l10t_cache_info(): array
{
    $n = 0; $b = 0; foreach (glob(l10t_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); }
    return ['count' => $n, 'bytes' => $b];
}
function l10t_cache_clear(): array
{
    $dir = l10t_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $d) { @rmdir($d); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function l10t_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = l10t_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}
function l10t_insee_info(PDO $pdo): array
{
    try {
        if (!(int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='insee_deces'")->fetchColumn()) { return ['rows' => 0]; }
        $n = (int) $pdo->query('SELECT count(*) FROM insee_deces')->fetchColumn();
        $r = $pdo->query('SELECT MIN(annee_deces), MAX(annee_deces) FROM insee_deces WHERE annee_deces > 1900')->fetch(PDO::FETCH_NUM) ?: [null, null];
        return ['rows' => $n, 'from' => $r[0] !== null ? (int) $r[0] : null, 'to' => $r[1] !== null ? (int) $r[1] : null];
    } catch (Throwable $_) { return ['rows' => 0]; }
}

function l10t_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'l10t_person' => l10t_person($pdo, $q),
        'l10t_place' => l10t_place($pdo, $q),
        'l10t_risques' => l10t_risques($q),
        'l10t_nom' => l10t_nom($pdo, $q),
        'l10t_marche' => l10t_marche($q),
        'l10t_parcelle' => l10t_parcelle($pdo, $q),
        'l10t_about' => ['ok' => true, 'cache' => l10t_cache_info(), 'insee' => l10t_insee_info($pdo)],
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function l10t_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'l10t_cache_clear' => l10t_cache_clear(),
        'l10t_cache_restore' => l10t_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
