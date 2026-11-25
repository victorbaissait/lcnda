<?php
declare(strict_types=1);

/**
 * 🖼️ Voir son village comme il le voyait (lot 10). Écran : assets/js/heritage-lot10-voir-village.js (style : assets/css/lot10-voir-village.css).
 * RIEN n'est livré avec l'app : tout est demandé EN LIGNE, à la demande, pour un lieu, et gardé (dossier « cache/voir-village ») :
 *  - 🖼️ tableaux qui représentent la commune : base Joconde (collections des musées de France) via l'API de POP (api.pop.culture.gouv.fr).
 *       Les notices sont des informations publiques réutilisables (POP : « Sauf mention explicite de propriété intellectuelle détenue
 *       par des tiers, les contenus de ce site sont proposés sous licence etalab-2.0 ») ; les IMAGES ont des droits de tiers (CGU de POP,
 *       § 5 : « leur réutilisation est soumise à l'autorisation préalable de leurs auteurs ») → l'app ne montre que la notice et le lien.
 *  - 📷 photos anciennes datées 1850–1950 : base Mémoire (Médiathèque du patrimoine et de la photographie), même API, même règle.
 *  - 🏔 ce qu'on voyait depuis chez lui : sommets (Wikidata, CC0) et clochers (Wikidata, CC0) ; relief : altimétrie de la Géoplateforme
 *       (RGE ALTI®, IGN, Licence Ouverte 2.0) ; la ligne de vue est calculée ici (courbure de la Terre et réfraction comprises).
 *  - 🌳 les forêts de 1850 : couche « Forêts anciennes » de l'IGN (BD Forêts anciennes = BD CARTO® État-major × BD Forêt® V2,
 *       Licence Ouverte 2.0) ; neuf tuiles autour du lieu, lues pixel par pixel (forêt ancienne / disparue / récente).
 *  - 🏠 les maisons de son temps encore debout : BD TOPO® (IGN, Licence Ouverte 2.0), couche « batiment », champ date_d_apparition.
 *       (La BDNB du CSTB est aussi en Licence Ouverte 2.0, mais son API api.bdnb.io n'a pas pu être lue pendant la fabrication.)
 *  Les photos aériennes de 1950 et le relief LiDAR HD ne passent pas par ici : l'écran affiche les tuiles WMTS de la Géoplateforme.
 * Rien n'est demandé pour une fiche confidentielle ou une personne vivante (paramètre pid).
 *  - GET l10v_pop&kind=tableaux|photos&place_id=|name=&insee=&lat=&lon=[&pid=]  · GET l10v_vue&lat=&lon=[&pid=]
 *  - GET l10v_forets&lat=&lon=[&pid=]  · GET l10v_maisons&lat=&lon=[&r=][&pid=]  (vue et maisons : cached_only=1 → seulement si déjà gardé)  · GET l10v_list&kind=…  · GET l10v_about
 *  - POST l10v_cache_clear / l10v_cache_restore {token}
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_L10V_DIR (un fichier <étape> par appel ; absent = hors ligne).
 * Enregistrer de vraies réponses pour les essais : LCNDA_L10V_RECORD=<dossier> (chaque réponse y est écrite sous son nom d'étape).
 */

require_once __DIR__ . '/commune_plus.php';
require_once __DIR__ . '/commune_culture.php';

const L10V_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const L10V_HOSTS = ['api.pop.culture.gouv.fr', 'data.geopf.fr', 'query.wikidata.org'];
const L10V_TTL = ['pop' => 30 * 86400, 'vue' => 365 * 86400, 'forets' => 365 * 86400, 'maisons' => 180 * 86400];
const L10V_POP = 'https://api.pop.culture.gouv.fr/search';
const L10V_ALTI = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const L10V_WFS = 'https://data.geopf.fr/wfs/ows';
const L10V_WMTS = 'https://data.geopf.fr/wmts';
const L10V_SPARQL = 'https://query.wikidata.org/sparql';
/** couleurs de la légende de la couche IGNF_FORETS-ANCIENNES (data.geopf.fr/annexes/ressources/legendes/IGNF_FORETS-ANCIENNES-legend.png) */
const L10V_FOREST_COLORS = ['ancienne' => [69, 141, 79], 'disparue' => [255, 89, 236], 'recente' => [116, 244, 104]];

/* ═════════════════════ cache et réseau ═════════════════════ */

function l10v_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir())), '/') . '/cache/voir-village';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
/** la réponse gardée (encore fraîche), sinon $make() gardée ; $only : seulement ce qui est déjà gardé (rien ne part sur Internet) */
function l10v_cached(string $kind, string $key, callable $make, bool $fresh = false, bool $only = false): array
{
    $key = $kind . ':' . $key;
    $f = l10v_cache_dir() . '/' . sha1($key) . '.json';
    $c = null;
    if (is_file($f)) { $j = json_decode((string) @file_get_contents($f), true); if (is_array($j) && isset($j['data'])) { $c = $j; } }
    if ($c && ($only || (!$fresh && (int) $c['at'] > time() - (L10V_TTL[$kind] ?? 30 * 86400)))) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    if ($only) { return ['ok' => true, 'notcached' => true]; }
    try { $data = $make(); }
    catch (Throwable $e) {
        if ($c) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    @file_put_contents(l10v_cache_dir(true) . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'kind' => $kind, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $data + ['cached' => false, 'fetched_at' => time()];
}
/**
 * une adresse https d'un des sites permis → JSON (ou les octets si $raw) ; $post = corps JSON (POST).
 * Poli : une demande à la fois, 0,3 s entre deux, Retry-After respecté (une fois, ≤ 10 s) sur un 429.
 * En essai : le fichier <étape> du dossier LCNDA_TEST_L10V_DIR.
 */
function l10v_http(string $step, string $url, ?array $post = null, bool $raw = false): mixed
{
    $step = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
    $dir = (string) getenv('LCNDA_TEST_L10V_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . ($post !== null ? ' POST' : '') . "\n", FILE_APPEND);
        if (!is_file($dir . '/' . $step)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        $b = (string) file_get_contents($dir . '/' . $step);
        if ($raw) { return $b; }
        $j = json_decode($b, true);
        return is_array($j) ? $j : [];
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), L10V_HOSTS, true) || !str_starts_with($url, 'https://')) { throw new RuntimeException('Adresse refusée.'); }
    static $last = 0.0;
    for ($try = 0; $try < 2; $try++) {
        $wait = 0.3 - (microtime(true) - $last); if ($wait > 0) { usleep((int) ($wait * 1e6)); }
        $body = ''; $too = false; $retry = 0;
        $ch = curl_init($url);
        $opt = [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 60, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => L10V_UA, CURLOPT_HTTPHEADER => array_merge(['Accept: application/json, application/sparql-results+json, image/png, */*'], $post !== null ? ['Content-Type: application/json'] : []),
            CURLOPT_HEADERFUNCTION => static function ($c, $h) use (&$retry) { if (preg_match('/^retry-after:\s*(\d+)/i', $h, $m)) { $retry = (int) $m[1]; } return strlen($h); },
            CURLOPT_WRITEFUNCTION => static function ($c, $chunk) use (&$body, &$too) { $body .= $chunk; if (strlen($body) > 8_000_000) { $too = true; return 0; } return strlen($chunk); }];
        if ($post !== null) { $opt[CURLOPT_POST] = true; $opt[CURLOPT_POSTFIELDS] = json_encode($post, JSON_UNESCAPED_SLASHES); }
        curl_setopt_array($ch, $opt + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        unset($ch);
        $last = microtime(true);
        if ($code === 429 && $try === 0 && $retry > 0 && $retry <= 10) { sleep($retry); continue; }
        break;
    }
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
    if ($code === 429 || $code >= 500) { throw new RuntimeException(i18n_t('Le site est très demandé en ce moment : réessaie dans une minute.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    $rec = (string) getenv('LCNDA_L10V_RECORD');
    if ($rec !== '' && is_dir($rec)) { @file_put_contents($rec . '/' . $step, $body); }
    if ($raw) { return $body; }
    $j = json_decode($body, true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    return $j;
}

/* ═════════════════════ petits outils ═════════════════════ */

/** la fiche est-elle confidentielle (ou la personne vivante) ? → rien ne part sur Internet */
function l10v_private(PDO $pdo, array $q): bool
{
    $pid = safe_int($q['pid'] ?? 0);
    if ($pid <= 0) { return false; }
    try { return (bool) cc_person_data($pdo, $pid)['private']; } catch (Throwable $_) { return true; }
}
const L10V_PRIVATE = ['ok' => false, 'private' => true];
function l10v_private_msg(): array { return L10V_PRIVATE + ['message' => i18n_t('Fiche confidentielle ou personne vivante : rien n’est envoyé sur Internet.')]; }
/** un point (lat, lon) lisible, en France métropolitaine et Corse, ou null */
function l10v_point(array $q): ?array
{
    $lat = is_numeric($q['lat'] ?? null) ? (float) $q['lat'] : null; $lon = is_numeric($q['lon'] ?? null) ? (float) $q['lon'] : null;
    if ($lat === null || $lon === null || ($lat == 0.0 && $lon == 0.0)) { return null; }
    if ($lat < 41.2 || $lat > 51.2 || $lon < -5.3 || $lon > 9.7) { return null; }
    return [round($lat, 5), round($lon, 5)];
}
function l10v_km(float $a, float $b, float $c, float $d): float { return cplus_km($a, $b, $c, $d); }
function l10v_bearing(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $p1 = deg2rad($lat1); $p2 = deg2rad($lat2); $dl = deg2rad($lon2 - $lon1);
    $y = sin($dl) * cos($p2); $x = cos($p1) * sin($p2) - sin($p1) * cos($p2) * cos($dl);
    return fmod(rad2deg(atan2($y, $x)) + 360.0, 360.0);
}
/** le point à $d mètres dans la direction $brg (degrés) */
function l10v_dest(float $lat, float $lon, float $brg, float $d): array
{
    $R = 6371000.0; $dr = $d / $R; $b = deg2rad($brg); $p1 = deg2rad($lat); $l1 = deg2rad($lon);
    $p2 = asin(sin($p1) * cos($dr) + cos($p1) * sin($dr) * cos($b));
    $l2 = $l1 + atan2(sin($b) * sin($dr) * cos($p1), cos($dr) - sin($p1) * sin($p2));
    return [rad2deg($p2), rad2deg($l2)];
}
const L10V_DIRS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
function l10v_dir(float $b): string { return L10V_DIRS[((int) round($b / 45)) % 8]; }
/** « 1873-1875 », « 1859 vers », « 2e moitié 19e siècle », « 1908-1910 », « [1970-1990] », « 1923.05 », « 1919 (avant) » → [de, à] ou null */
function l10v_period(string $t): ?array
{
    $t = trim($t);
    if ($t === '') { return null; }
    if (preg_match_all('/(?<!\d)(1[0-9]{3}|20[0-2][0-9])(?!\d)/', $t, $m) && $m[1]) {
        $ys = array_map('intval', $m[1]);
        $a = min($ys); $z = max($ys);
        if ($z - $a > 60) { $z = $a; }
        if (preg_match('/avant/u', $t) && count($ys) === 1) { return [$a - 10, $a]; }
        return [$a, $z];
    }
    if (preg_match('/(\d{1,2})e\s+si[eè]cle/u', $t, $m)) {
        $c = (int) $m[1]; $a = ($c - 1) * 100; $z = $a + 99;
        if (preg_match('/1e?r?\s+quart/u', $t)) { $z = $a + 24; } elseif (preg_match('/2e\s+quart/u', $t)) { $a += 25; $z = $a + 24; }
        elseif (preg_match('/3e\s+quart/u', $t)) { $a += 50; $z = $a + 24; } elseif (preg_match('/4e\s+quart/u', $t)) { $a += 75; $z = $a + 24; }
        elseif (preg_match('/1e?r?e?\s+moiti/u', $t)) { $z = $a + 49; } elseif (preg_match('/2e\s+moiti/u', $t)) { $a += 50; }
        return [$a, $z];
    }
    return null;
}
/** le nom de la commune est-il dans ce texte (mot entier, accents et casse ignorés) ? */
function l10v_names(string $text, string $name): bool
{
    $n = cc_fold($name); if (mb_strlen($n) < 3) { return false; }
    return (bool) preg_match('/(^| )' . preg_quote($n, '/') . '( |$)/', cc_fold($text));
}
function l10v_flat(mixed $v): string { return is_array($v) ? implode(' ; ', array_map(static fn($x) => is_scalar($x) ? (string) $x : '', $v)) : (is_scalar($v) ? (string) $v : ''); }
function l10v_notice_url(string $base, string $ref): string { return 'https://pop.culture.gouv.fr/notice/' . rawurlencode($base) . '/' . rawurlencode($ref); }
function l10v_search_url(string $name): string { return 'https://pop.culture.gouv.fr/recherche?q=' . rawurlencode($name); }
/** le lieu demandé : nom de commune, INSEE, département, position */
function l10v_place(PDO $pdo, array $q): array
{
    $p = cc_place($pdo, $q);
    return ['id' => (int) $p['id'], 'name' => (string) ($p['commune'] ?: $p['name']), 'insee' => (string) $p['insee'], 'dep' => (string) $p['dep'], 'country' => (string) $p['country'],
        'lat' => $p['lat'], 'lon' => $p['lon']];
}

/* ═════════════════════ 🖼️ 📷 POP : Joconde et Mémoire ═════════════════════ */

function l10v_pop(PDO $pdo, array $q): array
{
    if (l10v_private($pdo, $q)) { return l10v_private_msg(); }
    $kind = ($q['kind'] ?? '') === 'photos' ? 'photos' : 'tableaux';
    $P = l10v_place($pdo, $q);
    if ($P['country'] !== '' && !preg_match('/^(fr|fra|france)$/i', trim($P['country']))) { return ['ok' => true, 'kind' => $kind, 'place' => $P, 'items' => [], 'abroad' => true]; }
    if (mb_strlen(cc_fold($P['name'])) < 3) { return ['ok' => true, 'kind' => $kind, 'place' => $P, 'items' => []]; }
    $fresh = !empty($q['fresh']);
    $r = l10v_cached('pop', $kind . ':' . cc_fold($P['name']) . ':' . $P['insee'], static fn() => $kind === 'photos' ? l10v_photos($P) : l10v_tableaux($P), $fresh);
    return $r + ['place' => $P];
}
/** les peintures de Joconde dont le titre, le sujet représenté ou le lieu de création nomment la commune */
function l10v_tableaux(array $P): array
{
    $name = $P['name'];
    $url = L10V_POP . '/simple?' . 'bases%5B%5D=joconde&text=' . rawurlencode($name) . '&size=100&facets%5Bed_domaine%5D%5B%5D=peinture';
    $j = l10v_http('pop-joconde.json', $url);
    $items = [];
    foreach (($j['hits'] ?? []) as $h) {
        $s = $h['_source'] ?? []; $ref = (string) ($s['REF'] ?? ''); if ($ref === '') { continue; }
        $title = trim((string) ($s['TITR'] ?? '')); $repr = l10v_flat($s['REPR'] ?? ''); $lieux = l10v_flat($s['LIEUX'] ?? ''); $prep = l10v_flat($s['PREP'] ?? '');
        $why = l10v_names($title, $name) ? 'titre' : (l10v_names($repr . ' ' . $prep, $name) ? 'sujet' : (l10v_names($lieux, $name) ? 'lieu' : ''));
        if ($why === '') { continue; } // la commune n'est que celle du musée : écarté
        // un autre département nommé dans « lieux » : sans doute une commune du même nom ailleurs
        if ($P['dep'] !== '' && $lieux !== '' && preg_match('/\(D[ée]partement\)/u', $lieux) && ($dn = (string) (cc_departements()[$P['dep']] ?? '')) !== '' && !l10v_names($lieux, $dn)) { continue; }
        $mill = l10v_flat($s['MILL'] ?? ''); $peri = l10v_flat($s['PERI'] ?? '');
        $pd = l10v_period($mill) ?? l10v_period($peri);
        $authors = array_values(array_filter(array_map(static fn($a) => trim((string) preg_replace('/\s*\((peintre|d\'après|attribué à)\)\s*/u', ' ', (string) $a)), (array) ($s['AUTR'] ?? []))));
        $items[] = ['ref' => $ref, 'title' => $title !== '' ? $title : i18n_t('Sans titre'), 'authors' => $authors, 'date' => $mill !== '' ? $mill : $peri, 'from' => $pd[0] ?? null, 'to' => $pd[1] ?? null,
            'repr' => mb_substr($repr, 0, 240), 'where' => (string) ($s['LOCA'] ?? ''), 'why' => $why, 'created_here' => (bool) preg_match('/lieu de cr[ée]ation/u', $lieux) && l10v_names($lieux, $name),
            'kind' => l10v_flat($s['DENO'] ?? '') ?: i18n_t('peinture'), 'url' => l10v_notice_url('joconde', $ref)];
    }
    usort($items, static fn($a, $b) => [$a['from'] ?? 9999, $a['title']] <=> [$b['from'] ?? 9999, $b['title']]);
    return ['ok' => true, 'kind' => 'tableaux', 'items' => $items, 'total' => (int) ($j['total'] ?? 0), 'search' => l10v_search_url($name),
        'source' => ['label' => i18n_t('Base Joconde (collections des musées de France), sur POP'), 'licence' => i18n_t('Notices : Licence Ouverte 2.0 (Etalab) ; images : droits des musées, non reprises'), 'url' => 'https://pop.culture.gouv.fr/donnees-ouvertes']];
}
/** les photos de Mémoire prises dans la commune entre 1850 et 1950 (par la date de prise de vue) */
function l10v_photos(array $P): array
{
    $name = $P['name'];
    $f = l10v_http('pop-memoire-dates.json', L10V_POP . '/facets?bases%5B%5D=memoire&text=' . rawurlencode($name) . '&fields%5B%5D=DATPV&size=500&facets%5Bed_commune%5D%5B%5D=' . rawurlencode($name));
    $keys = [];
    foreach (($f['aggregations']['DATPV.keyword']['buckets'] ?? []) as $b) {
        $pd = l10v_period((string) ($b['key'] ?? '')); if (!$pd || $pd[0] < 1840 || $pd[0] > 1950 || $pd[1] > 1960) { continue; }
        $keys[] = ['k' => (string) $b['key'], 'n' => (int) ($b['doc_count'] ?? 0), 'y' => $pd[0]];
    }
    $total = array_sum(array_column($keys, 'n'));
    $base = ['ok' => true, 'kind' => 'photos', 'total' => $total, 'search' => l10v_search_url($name),
        'source' => ['label' => i18n_t('Base Mémoire (Médiathèque du patrimoine et de la photographie), sur POP'), 'licence' => i18n_t('Notices : Licence Ouverte 2.0 (Etalab) ; photos : droits réservés, non reprises'), 'url' => 'https://pop.culture.gouv.fr/donnees-ouvertes']];
    if (!$keys) { return $base + ['items' => []]; }
    usort($keys, static fn($a, $b) => $a['y'] <=> $b['y']);
    // l'API de POP n'accepte pas plus de 20 valeurs par filtre : 20 dates par demande, 3 demandes au plus
    $hits = [];
    foreach (array_slice(array_chunk($keys, 20), 0, 3) as $i => $chunk) {
        $url = L10V_POP . '/simple?bases%5B%5D=memoire&text=' . rawurlencode($name) . '&size=50&facets%5Bed_commune%5D%5B%5D=' . rawurlencode($name)
            . implode('', array_map(static fn($k) => '&facets%5BDATPV%5D%5B%5D=' . rawurlencode($k['k']), $chunk));
        $j = l10v_http('pop-memoire-' . $i . '.json', $url);
        array_push($hits, ...($j['hits'] ?? []));
    }
    $items = []; $seen = [];
    foreach ($hits as $h) {
        $s = $h['_source'] ?? []; $ref = (string) ($s['REF'] ?? ''); if ($ref === '' || isset($seen[$ref])) { continue; } $seen[$ref] = 1;
        $ins = array_map('strval', (array) ($s['INSEE'] ?? []));
        if ($P['insee'] !== '' && $ins && !in_array($P['insee'], $ins, true)) { continue; } // une commune du même nom ailleurs
        $pd = l10v_period((string) ($s['DATPV'] ?? '')); if (!$pd || $pd[0] < 1840 || $pd[0] > 1950 || $pd[1] > 1960) { continue; }
        $title = trim((string) ($s['LEG'] ?? '')) ?: trim((string) ($s['TICO'] ?? '')) ?: trim(l10v_flat($s['EDIF'] ?? '')) ?: i18n_t('Sans légende');
        $items[] = ['ref' => $ref, 'title' => mb_substr($title, 0, 200), 'date' => (string) $s['DATPV'], 'from' => $pd[0], 'to' => $pd[1], 'authors' => array_values(array_map('strval', (array) ($s['AUTP'] ?? []))),
            'what' => mb_substr(trim(l10v_flat($s['EDIF'] ?? '') ?: l10v_flat($s['ADRS'] ?? '')), 0, 120), 'copy' => (string) ($s['COPY'] ?? ''), 'type' => (string) ($s['TYPDOC'] ?? ''), 'url' => l10v_notice_url('memoire', $ref)];
    }
    usort($items, static fn($a, $b) => [$a['from'], $a['title']] <=> [$b['from'], $b['title']]);
    return $base + ['items' => $items];
}

/* ═════════════════════ 🏔 ce qu'il voyait depuis chez lui ═════════════════════ */

/** les altitudes (RGE ALTI®) d'une liste de points [[lat, lon]…] ; par paquets de 1 500 ; -99999 → null */
function l10v_alti(array $pts): array
{
    $out = [];
    foreach (array_chunk($pts, 1500) as $i => $chunk) {
        $j = l10v_http('alti-' . $i . '.json', L10V_ALTI, ['lon' => implode('|', array_map(static fn($p) => sprintf('%.5f', $p[1]), $chunk)), 'lat' => implode('|', array_map(static fn($p) => sprintf('%.5f', $p[0]), $chunk)),
            'resource' => 'ign_rge_alti_wld', 'zonly' => 'true', 'delimiter' => '|']);
        $z = $j['elevations'] ?? [];
        foreach ($chunk as $k => $_) { $v = $z[$k] ?? null; $v = is_array($v) ? ($v['z'] ?? null) : $v; $out[] = is_numeric($v) && (float) $v > -1000 ? (float) $v : null; }
    }
    return $out;
}
function l10v_sparql(string $step, string $q): array
{
    $j = l10v_http($step, L10V_SPARQL . '?format=json&query=' . rawurlencode($q));
    return $j['results']['bindings'] ?? [];
}
function l10v_wd_point(string $wkt): ?array { return preg_match('/Point\(([-\d.eE]+) ([-\d.eE]+)\)/', $wkt, $m) ? [(float) $m[2], (float) $m[1]] : null; }
/** la chute apparente d'un point à $d mètres (courbure de la Terre, réfraction k = 0,13) */
function l10v_drop(float $d): float { return $d * $d / (2 * 6371000.0) * (1 - 0.13); }
/**
 * la ligne de vue : profil = altitudes des points entre l'observateur (exclu) et la cible (dernier) ;
 * visible si aucun point du profil ne monte plus haut (en angle) que le sommet de la cible.
 */
function l10v_visible(float $z0, array $dists, array $zs, float $targetTop): array
{
    $n = count($dists); $D = $dists[$n - 1];
    $eye = $z0 + 1.7;
    $tAng = ($targetTop - l10v_drop($D) - $eye) / $D;
    $maxAng = -INF;
    for ($i = 0; $i < $n - 1; $i++) {
        if ($zs[$i] === null || $dists[$i] < 60) { continue; }
        $a = ($zs[$i] - l10v_drop($dists[$i]) - $eye) / $dists[$i];
        if ($a > $maxAng) { $maxAng = $a; }
    }
    return ['visible' => $maxAng <= $tAng + 0.0004, 'angle' => rad2deg(atan($tAng)), 'margin' => $maxAng === -INF ? null : rad2deg(atan($tAng) - atan($maxAng))];
}
function l10v_vue(PDO $pdo, array $q): array
{
    if (l10v_private($pdo, $q)) { return l10v_private_msg(); }
    $pt = l10v_point($q);
    if (!$pt) { return ['ok' => true, 'items' => [], 'nopoint' => true]; }
    $key = sprintf('%.3f,%.3f', $pt[0], $pt[1]);
    return l10v_cached('vue', $key, static fn() => l10v_vue_calc($pt[0], $pt[1]), !empty($q['fresh']), !empty($q['cached_only'])) + ['lat' => $pt[0], 'lon' => $pt[1]];
}
function l10v_vue_calc(float $lat, float $lon): array
{
    $c = sprintf('Point(%.5f %.5f)', $lon, $lat);
    $peaks = l10v_sparql('wd-sommets.json', 'SELECT ?item ?itemLabel ?coord ?elev WHERE { SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "' . $c . '"^^geo:wktLiteral . bd:serviceParam wikibase:radius "60" . }'
        . ' ?item wdt:P31 ?c . VALUES ?c { wd:Q8502 wd:Q207326 wd:Q54050 } ?item wdt:P2044 ?elev . SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } } LIMIT 3000');
    $towers = l10v_sparql('wd-clochers.json', 'SELECT ?item ?itemLabel ?coord WHERE { SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "' . $c . '"^^geo:wktLiteral . bd:serviceParam wikibase:radius "12" . }'
        . ' ?item wdt:P31 ?c . VALUES ?c { wd:Q16970 wd:Q2977 wd:Q108325 wd:Q160742 wd:Q120560 wd:Q44613 } SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } } LIMIT 400');
    $cands = []; $seen = [];
    foreach ([['pic', $peaks], ['clocher', $towers]] as [$kind, $rows]) {
        foreach ($rows as $r) {
            $qid = (string) preg_replace('~^.*/~', '', (string) ($r['item']['value'] ?? '')); $p = l10v_wd_point((string) ($r['coord']['value'] ?? ''));
            if (!preg_match('/^Q\d+$/', $qid) || !$p || isset($seen[$qid])) { continue; }
            $label = (string) ($r['itemLabel']['value'] ?? ''); if ($label === '' || $label === $qid) { continue; }
            $d = l10v_km($lat, $lon, $p[0], $p[1]) * 1000; if ($d < 400) { continue; }
            $seen[$qid] = 1;
            $cands[] = ['q' => $qid, 'name' => $label, 'kind' => $kind, 'lat' => $p[0], 'lon' => $p[1], 'd' => $d, 'elev' => is_numeric($r['elev']['value'] ?? null) ? (float) $r['elev']['value'] : null];
        }
    }
    $z0 = l10v_alti([[$lat, $lon]])[0] ?? null;
    if ($z0 === null) { return ['ok' => true, 'items' => [], 'tested' => 0, 'z0' => null]; }
    // les candidats : les 45 sommets qui montent le plus haut dans le ciel (angle brut), les 30 clochers les plus proches
    $pk = array_values(array_filter($cands, static fn($x) => $x['kind'] === 'pic'));
    usort($pk, static fn($a, $b) => (($b['elev'] - l10v_drop($b['d']) - $z0) / $b['d']) <=> (($a['elev'] - l10v_drop($a['d']) - $z0) / $a['d']));
    $pk = array_slice(array_values(array_filter($pk, static fn($x) => ($x['elev'] - l10v_drop($x['d']) - $z0) / $x['d'] > -0.02)), 0, 45);
    $tw = array_values(array_filter($cands, static fn($x) => $x['kind'] === 'clocher'));
    usort($tw, static fn($a, $b) => $a['d'] <=> $b['d']);
    $tw = array_slice($tw, 0, 30);
    $list = array_merge($pk, $tw);
    if (!$list) { return ['ok' => true, 'items' => [], 'tested' => 0, 'z0' => $z0]; }
    $pts = []; $idx = [];
    foreach ($list as $i => $x) {
        $n = (int) max(12, min(70, round($x['d'] / 800)));
        $brg = l10v_bearing($lat, $lon, $x['lat'], $x['lon']);
        $ds = [];
        for ($k = 1; $k <= $n; $k++) { $dd = $x['d'] * $k / $n; $ds[] = $dd; $pts[] = $k === $n ? [$x['lat'], $x['lon']] : l10v_dest($lat, $lon, $brg, $dd); }
        $idx[$i] = [count($pts) - $n, $ds, $brg];
    }
    $zs = l10v_alti($pts);
    $items = [];
    foreach ($list as $i => $x) {
        [$start, $ds, $brg] = $idx[$i];
        $prof = array_slice($zs, $start, count($ds));
        $ground = $prof[count($prof) - 1];
        $top = $x['kind'] === 'pic' ? max((float) $x['elev'], (float) ($ground ?? $x['elev'])) : (($ground ?? null) === null ? null : $ground + 25.0);
        if ($top === null) { continue; }
        $v = l10v_visible($z0, $ds, $prof, $top);
        if (!$v['visible']) { continue; }
        $items[] = ['q' => $x['q'], 'name' => $x['name'], 'kind' => $x['kind'], 'km' => round($x['d'] / 1000, 1), 'dir' => l10v_dir($brg), 'bearing' => (int) round($brg),
            'elev' => $x['kind'] === 'pic' ? (int) round((float) $x['elev']) : ($ground !== null ? (int) round($ground) : null), 'angle' => round($v['angle'], 2),
            'lat' => round($x['lat'], 5), 'lon' => round($x['lon'], 5), 'url' => 'https://www.wikidata.org/wiki/' . $x['q']];
    }
    usort($items, static fn($a, $b) => [$a['kind'] === 'pic' ? 0 : 1, -$a['angle']] <=> [$b['kind'] === 'pic' ? 0 : 1, -$b['angle']]);
    return ['ok' => true, 'items' => $items, 'tested' => count($list), 'z0' => round($z0), 'radius' => ['pic' => 60, 'clocher' => 12],
        'source' => ['label' => i18n_t('Wikidata (sommets, églises) ; IGN, Géoplateforme (altimétrie RGE ALTI®)'), 'licence' => 'CC0 1.0 ; Licence Ouverte 2.0', 'url' => 'https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie']];
}

/* ═════════════════════ 🌳 les forêts de 1850 ═════════════════════ */

function l10v_tile_of(float $lat, float $lon, int $z): array
{
    $n = 2 ** $z; $x = ($lon + 180) / 360 * $n; $y = (1 - log(tan(deg2rad($lat)) + 1 / cos(deg2rad($lat))) / M_PI) / 2 * $n;
    return [$x, $y];
}
function l10v_wmts_url(string $layer, int $z, int $x, int $y, string $fmt = 'image/png', string $style = 'normal'): string
{
    return L10V_WMTS . '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' . rawurlencode($layer) . '&STYLE=' . rawurlencode($style) . '&TILEMATRIXSET=PM&TILEMATRIX=' . $z . '&TILECOL=' . $x . '&TILEROW=' . $y . '&FORMAT=' . rawurlencode($fmt);
}
/** la sorte d'un pixel (r, g, b, alpha GD 0–127) : 'ancienne' | 'disparue' | 'recente' | '' */
function l10v_forest_class(int $r, int $g, int $b, int $alpha): string
{
    if ($alpha > 63) { return ''; } // presque transparent
    $best = ''; $bd = 40 * 40 * 3;
    foreach (L10V_FOREST_COLORS as $k => [$cr, $cg, $cb]) { $d = ($r - $cr) ** 2 + ($g - $cg) ** 2 + ($b - $cb) ** 2; if ($d < $bd) { $bd = $d; $best = $k; } }
    return $best;
}
function l10v_forets(PDO $pdo, array $q): array
{
    if (l10v_private($pdo, $q)) { return l10v_private_msg(); }
    $pt = l10v_point($q);
    if (!$pt) { return ['ok' => true, 'nopoint' => true]; }
    if (!function_exists('imagecreatefromstring')) { return ['ok' => false, 'message' => i18n_t('PHP n’a pas l’extension gd : impossible de lire la carte des forêts.')]; }
    $key = sprintf('%.4f,%.4f', $pt[0], $pt[1]);
    return l10v_cached('forets', $key, static fn() => l10v_forets_calc($pt[0], $pt[1]), !empty($q['fresh'])) + ['lat' => $pt[0], 'lon' => $pt[1]];
}
function l10v_forets_calc(float $lat, float $lon): array
{
    $z = 15; [$fx, $fy] = l10v_tile_of($lat, $lon, $z);
    $tx = (int) floor($fx); $ty = (int) floor($fy); $px = ($fx - $tx) * 256; $py = ($fy - $ty) * 256;
    $mpp = 156543.03392 * cos(deg2rad($lat)) / (2 ** $z); // mètres par pixel
    $R = 1200.0; $rp = $R / $mpp;
    $cnt = ['ancienne' => [0, 0, 0], 'disparue' => [0, 0, 0], 'recente' => [0, 0, 0]]; // < 300 m, < 600 m, < 1 200 m
    $near = ['ancienne' => null, 'disparue' => null, 'recente' => null];
    $dirs = ['disparue' => [0, 0], 'ancienne' => [0, 0]];
    $span = (int) ceil(($rp + 256) / 256);
    $seen = 0; $step = 2;
    for ($dx = -$span; $dx <= $span; $dx++) {
        for ($dy = -$span; $dy <= $span; $dy++) {
            $X = $tx + $dx; $Y = $ty + $dy;
            // la tuile touche-t-elle le cercle ?
            $cx = max($dx * 256, min($px, $dx * 256 + 256)); $cy = max($dy * 256, min($py, $dy * 256 + 256));
            if (hypot($cx - $px, $cy - $py) > $rp) { continue; }
            $bin = l10v_http("tuile-$X-$Y.png", l10v_wmts_url('IGNF_FORETS-ANCIENNES', $z, $X, $Y), null, true);
            $im = @imagecreatefromstring((string) $bin); if (!$im) { continue; }
            $seen++;
            $W = imagesx($im); $H = imagesy($im);
            for ($y = 0; $y < $H; $y += $step) {
                for ($x = 0; $x < $W; $x += $step) {
                    $ddx = $dx * 256 + $x - $px; $ddy = $dy * 256 + $y - $py; $dp = hypot($ddx, $ddy); if ($dp > $rp) { continue; }
                    $c = imagecolorat($im, $x, $y);
                    if (!imageistruecolor($im)) { $c = imagecolorsforindex($im, $c); $k = l10v_forest_class($c['red'], $c['green'], $c['blue'], $c['alpha']); }
                    else { $k = l10v_forest_class(($c >> 16) & 255, ($c >> 8) & 255, $c & 255, ($c >> 24) & 127); }
                    if ($k === '') { continue; }
                    $dm = $dp * $mpp;
                    if ($dm <= 300) { $cnt[$k][0]++; } if ($dm <= 600) { $cnt[$k][1]++; } $cnt[$k][2]++;
                    if ($near[$k] === null || $dm < $near[$k]) { $near[$k] = $dm; }
                    if (isset($dirs[$k])) { $dirs[$k][0] += $ddx; $dirs[$k][1] += $ddy; }
                }
            }
            imagedestroy($im);
        }
    }
    $ha = ($mpp * $step) ** 2 / 10000; // hectares par pixel compté
    $area = []; foreach ($cnt as $k => $v) { $area[$k] = array_map(static fn($n) => round($n * $ha, 1), $v); }
    $dirOf = static function (array $v): ?string { if (abs($v[0]) + abs($v[1]) < 1) { return null; } return l10v_dir(fmod(rad2deg(atan2($v[0], -$v[1])) + 360, 360)); };
    $old1850 = $area['ancienne'][2] + $area['disparue'][2]; $now = $area['ancienne'][2] + $area['recente'][2];
    return ['ok' => true, 'tiles' => $seen, 'radius' => [300, 600, 1200], 'ha' => $area, 'near' => array_map(static fn($v) => $v === null ? null : (int) round($v), $near),
        'dir' => ['disparue' => $dirOf($dirs['disparue']), 'ancienne' => $dirOf($dirs['ancienne'])], 'bois1850' => round($old1850, 1), 'bois_now' => round($now, 1),
        'lisiere' => $near['disparue'] !== null && $near['disparue'] <= 300,
        'source' => ['label' => i18n_t('IGN, BD Forêts anciennes (BD CARTO® État-major × BD Forêt® V2)'), 'licence' => 'Licence Ouverte 2.0', 'url' => 'https://www.data.gouv.fr/datasets/bd-forets-anciennes']];
}

/* ═════════════════════ 🏠 les maisons de son temps encore debout ═════════════════════ */

function l10v_maisons(PDO $pdo, array $q): array
{
    if (l10v_private($pdo, $q)) { return l10v_private_msg(); }
    $pt = l10v_point($q);
    if (!$pt) { return ['ok' => true, 'items' => [], 'nopoint' => true]; }
    $r = max(100, min(600, safe_int($q['r'] ?? 300) ?: 300));
    $key = sprintf('%.4f,%.4f,%d', $pt[0], $pt[1], $r);
    return l10v_cached('maisons', $key, static fn() => l10v_maisons_calc($pt[0], $pt[1], $r), !empty($q['fresh']), !empty($q['cached_only'])) + ['lat' => $pt[0], 'lon' => $pt[1]];
}
function l10v_centroid(array $geom): ?array
{
    $ring = $geom['coordinates'][0][0] ?? ($geom['coordinates'][0] ?? null);
    if (!is_array($ring) || !$ring || !is_array($ring[0])) { return null; }
    $x = 0.0; $y = 0.0; $n = 0; foreach ($ring as $p) { if (is_array($p) && isset($p[0], $p[1])) { $x += (float) $p[0]; $y += (float) $p[1]; $n++; } }
    return $n ? [$y / $n, $x / $n] : null;
}
function l10v_maisons_calc(float $lat, float $lon, int $r): array
{
    $dLat = $r / 111320; $dLon = $r / (111320 * cos(deg2rad($lat)));
    $url = L10V_WFS . '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:batiment&OUTPUTFORMAT=application/json&SRSNAME=CRS:84&COUNT=2000'
        . '&PROPERTYNAME=cleabs,nature,usage_1,date_d_apparition,nombre_de_logements,hauteur,identifiants_rnb,geometrie'
        . '&BBOX=' . sprintf('%.6f,%.6f,%.6f,%.6f,CRS:84', $lon - $dLon, $lat - $dLat, $lon + $dLon, $lat + $dLat);
    $j = l10v_http('wfs-batiments.json', $url);
    $all = 0; $dated = 0; $items = []; $by = ['avant 1800' => 0, '1800–1849' => 0, '1850–1899' => 0, '1900–1949' => 0, 'après 1950' => 0];
    foreach (($j['features'] ?? []) as $f) {
        $p = $f['properties'] ?? []; $c = l10v_centroid($f['geometry'] ?? []); if (!$c) { continue; }
        $km = l10v_km($lat, $lon, $c[0], $c[1]); if ($km * 1000 > $r) { continue; }
        $all++;
        $y = preg_match('/^(\d{4})/', (string) ($p['date_d_apparition'] ?? ''), $m) ? (int) $m[1] : null;
        if ($y === null || $y < 1000) { continue; }
        $dated++;
        $by[$y < 1800 ? 'avant 1800' : ($y < 1850 ? '1800–1849' : ($y < 1900 ? '1850–1899' : ($y < 1950 ? '1900–1949' : 'après 1950')))]++;
        if ($y >= 1950) { continue; }
        $rnb = trim(explode('/', (string) ($p['identifiants_rnb'] ?? ''))[0]);
        $items[] = ['id' => (string) ($p['cleabs'] ?? ''), 'year' => $y, 'nature' => (string) ($p['nature'] ?? ''), 'usage' => (string) ($p['usage_1'] ?? ''), 'logements' => is_numeric($p['nombre_de_logements'] ?? null) ? (int) $p['nombre_de_logements'] : null,
            'm' => (int) round($km * 1000), 'lat' => round($c[0], 6), 'lon' => round($c[1], 6), 'rnb' => preg_match('/^[A-Z0-9]{12}$/', $rnb) ? $rnb : '',
            'map' => 'https://www.geoportail.gouv.fr/carte?c=' . round($c[1], 6) . ',' . round($c[0], 6) . '&z=19&permalink=yes'];
    }
    usort($items, static fn($a, $b) => [$a['year'], $a['m']] <=> [$b['year'], $b['m']]);
    return ['ok' => true, 'r' => $r, 'all' => $all, 'dated' => $dated, 'by' => $by, 'items' => array_slice($items, 0, 300), 'more' => max(0, count($items) - 300),
        'source' => ['label' => i18n_t('IGN, BD TOPO® (bâtiments ; date d’apparition, souvent tirée des fichiers fonciers)'), 'licence' => 'Licence Ouverte 2.0', 'url' => 'https://www.data.gouv.fr/datasets/bd-topo-r']];
}

/* ═════════════════════ 📋 listes (ce qui est déjà gardé), à propos, cache ═════════════════════ */

function l10v_list(array $q): array
{
    $kind = (string) ($q['kind'] ?? '');
    if (!in_array($kind, ['tableaux', 'photos', 'vue', 'maisons', 'forets'], true)) { throw new LcndaBadInput('Inconnu.'); }
    $rows = [];
    foreach (glob(l10v_cache_dir() . '/*.json') ?: [] as $f) {
        $j = json_decode((string) @file_get_contents($f), true); if (!is_array($j) || !isset($j['data'], $j['key'])) { continue; }
        $k = (string) $j['key']; $d = $j['data'];
        if (in_array($kind, ['tableaux', 'photos'], true)) {
            if (!str_starts_with($k, 'pop:' . $kind . ':')) { continue; }
            $commune = ''; $insee = (string) (explode(':', $k)[3] ?? '');
            if ($insee !== '') { $commune = (string) ((cc_data('communes')['c'][$insee][0] ?? '')); }
            foreach (($d['items'] ?? []) as $it) { $rows[] = $it + ['commune' => $commune !== '' ? $commune : (string) (explode(':', $k)[2] ?? ''), 'insee' => $insee]; }
        } elseif ($kind === 'vue' && str_starts_with($k, 'vue:')) {
            [$la, $lo] = array_map('floatval', explode(',', substr($k, 4)));
            foreach (($d['items'] ?? []) as $it) { $rows[] = $it + ['from_lat' => $la, 'from_lon' => $lo]; }
        } elseif ($kind === 'maisons' && str_starts_with($k, 'maisons:')) {
            foreach (($d['items'] ?? []) as $it) { $rows[] = $it; }
        } elseif ($kind === 'forets' && str_starts_with($k, 'forets:')) {
            [$la, $lo] = array_map('floatval', explode(',', substr($k, 7)));
            $rows[] = ['lat' => $la, 'lon' => $lo, 'ancienne' => $d['ha']['ancienne'][2] ?? 0, 'disparue' => $d['ha']['disparue'][2] ?? 0, 'recente' => $d['ha']['recente'][2] ?? 0, 'lisiere' => !empty($d['lisiere']), 'near_disparue' => $d['near']['disparue'] ?? null];
        }
    }
    return ['ok' => true, 'kind' => $kind, 'rows' => $rows];
}
function l10v_cache_info(): array { $n = 0; $b = 0; foreach (glob(l10v_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); } return ['count' => $n, 'bytes' => $b]; }
function l10v_cache_clear(): array
{
    $dir = l10v_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $d) { @rmdir($d); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function l10v_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = l10v_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}
/** les sources, leur licence telle qu'elle a été lue (page et date), ce qui n'a pas été repris et pourquoi */
function l10v_about(): array
{
    $read = '2026-11-25';
    return ['ok' => true, 'cache' => l10v_cache_info(), 'read' => $read, 'sources' => [
        ['id' => 'tableaux', 'label' => i18n_t('Base Joconde — collections des musées de France (POP, ministère de la Culture)'), 'what' => i18n_t('Les peintures dont le titre, le sujet ou le lieu de création nomment la commune'),
            'licence' => i18n_t('Notices : Licence Ouverte 2.0 (Etalab). Images : NON reprises (droits des musées et des photographes)'), 'url' => 'https://pop.culture.gouv.fr/donnees-ouvertes',
            'quote' => 'Les images diffusées par POP constituent des données sur lesquelles des tiers peuvent détenir des droits de propriété intellectuelle. Dans ce cas, leur réutilisation est soumise à l‘autorisation préalable de leurs auteurs ou de leurs ayants droits.',
            'quote_url' => 'https://pop.culture.gouv.fr/conditions-generales-utilisation', 'online' => true],
        ['id' => 'photos', 'label' => i18n_t('Base Mémoire — Médiathèque du patrimoine et de la photographie (POP)'), 'what' => i18n_t('Les photos de la commune datées de 1850 à 1950'),
            'licence' => i18n_t('Notices : Licence Ouverte 2.0 (Etalab). Photos : NON reprises (« © … tous droits réservés » sur chaque notice)'), 'url' => 'https://pop.culture.gouv.fr/donnees-ouvertes',
            'quote' => 'Sauf mention explicite de propriété intellectuelle détenue par des tiers, les contenus de ce site sont proposés sous licence etalab-2.0', 'quote_url' => 'https://pop.culture.gouv.fr/mentions-legales', 'online' => true],
        ['id' => 'avion', 'label' => i18n_t('IGN, BD ORTHO® Historique (photographies aériennes 1950-1965), flux WMTS de la Géoplateforme'), 'what' => i18n_t('Le village vu d’avion vers 1950, à côté de la photo d’aujourd’hui (rien n’est copié : l’écran affiche les tuiles)'),
            'licence' => 'Licence Ouverte 2.0', 'url' => 'https://www.data.gouv.fr/datasets/bd-ortho-r-historique'],
        ['id' => 'vue', 'label' => i18n_t('Wikidata (sommets, églises) ; IGN RGE ALTI® (altimétrie de la Géoplateforme)'), 'what' => i18n_t('Les sommets et clochers visibles depuis chez lui, calculés avec le relief'),
            'licence' => 'CC0 1.0 ; Licence Ouverte 2.0', 'url' => 'https://www.data.gouv.fr/datasets/rge-alti-r', 'online' => true],
        ['id' => 'lidar', 'label' => i18n_t('IGN, MNT LiDAR HD (ombrage), flux WMTS de la Géoplateforme'), 'what' => i18n_t('Les traces cachées autour du hameau (anciens chemins, talus, mottes, charbonnières…)'),
            'licence' => 'Licence Ouverte 2.0', 'url' => 'https://www.data.gouv.fr/datasets/mnt-lidar-hd'],
        ['id' => 'forets', 'label' => i18n_t('IGN, BD Forêts anciennes (BD CARTO® État-major × BD Forêt® V2)'), 'what' => i18n_t('Les bois de 1850 autour de chez lui : encore là, disparus, ou nouveaux'),
            'licence' => 'Licence Ouverte 2.0', 'url' => 'https://www.data.gouv.fr/datasets/bd-forets-anciennes', 'online' => true],
        ['id' => 'maisons', 'label' => i18n_t('IGN, BD TOPO® (bâtiments)'), 'what' => i18n_t('Les maisons de son hameau qui existent encore, avec leur année'),
            'licence' => 'Licence Ouverte 2.0', 'url' => 'https://www.data.gouv.fr/datasets/bd-topo-r', 'online' => true],
        ['id' => 'voisins', 'label' => i18n_t('Cartes anciennes des pays voisins (Ferraris, Siegfried, Pays-Bas, Luxembourg)'), 'what' => i18n_t('Seulement des liens vers les sites officiels'),
            'licence' => i18n_t('Pas reprises : licence pas assez ouverte ou pas lisible pendant la fabrication (voir ci-dessous)'), 'url' => 'https://www.vlaanderen.be/datavindplaats/catalogus/ferrariskaart-kabinetskaart-der-oostenrijkse-nederlanden-en-het-prinsbisdom-luik-1771-1778'],
    ]];
}

function l10v_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'l10v_pop' => l10v_pop($pdo, $q),
        'l10v_vue' => l10v_vue($pdo, $q),
        'l10v_forets' => l10v_forets($pdo, $q),
        'l10v_maisons' => l10v_maisons($pdo, $q),
        'l10v_list' => l10v_list($q),
        'l10v_about' => l10v_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function l10v_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'l10v_cache_clear' => l10v_cache_clear(),
        'l10v_cache_restore' => l10v_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
