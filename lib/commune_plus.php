<?php
declare(strict_types=1);

/**
 * 🪦🖼️⛪📰 Autour du village — quatre recherches EN LIGNE, faites seulement quand on ouvre le bloc, puis gardées sur l'ordinateur
 * (dossier « cache/commune-plus » des données de l'app) : la deuxième fois, et sans Internet, la réponse gardée revient.
 *
 *  1. 🪦 Cimetières autour du village — OpenStreetMap (API Overpass, https://overpass-api.de) : landuse=cemetery et amenity=grave_yard
 *     à moins de ~5 km. Données © les contributeurs d'OpenStreetMap, licence ODbL 1.0 (https://www.openstreetmap.org/copyright).
 *  2. 🖼️ Images anciennes de la commune — Wikimedia Commons (API https://commons.wikimedia.org/w/api.php) : la catégorie Commons de la
 *     commune (Wikidata P373), ses sous-catégories « History of … », « Old postcards of … »… ; seulement les images datées de 1960 ou
 *     avant, ou rangées dans des cartes postales anciennes. Chaque image a sa licence (le plus souvent domaine public ou CC BY-SA) :
 *     auteur et licence affichés pour chacune, et gardés dans la source quand on la range dans les médias.
 *  3. ⛪ Saint patron de l'église — Wikidata (API https://www.wikidata.org/w/api.php, données CC0) : les églises situées dans la commune
 *     (P131), leur saint patron (P417), sa fête (P841), leur date (P571), leur image (P18).
 *     Pas de SPARQL (query.wikidata.org limite fort les appels) : la recherche de Wikidata (haswbstatement) + wbgetentities.
 *  4. 📰 Journaux anciens libres à l'étranger — Chronicling America (Bibliothèque du Congrès, API loc.gov, sans clé ; pages de journaux
 *     américains 1756–1963 sans restriction de droits connue) : le nombre de pages où le nom paraît, et les premières.
 *     Delpher (Pays-Bas) et ANNO (Autriche) : un simple lien de recherche (leur API est sur un autre site et demande une clé pour Delpher).
 *
 * Aucune donnée de la généalogie n'est envoyée, sauf le nom cherché (journaux) et le nom ou la position du lieu.
 *  - GET  cplus_cemeteries&lat=&lon=&name=&place_id=&radius=   · GET cplus_images&…   · GET cplus_church&…   · GET cplus_newspapers&person_id=|name=&y1=&y2=
 *  - GET  cplus_about (les sources et leurs licences)
 *  - POST cplus_keep {file, place_name} → l'image rangée dans les médias, avec une source (auteur, licence, lien) → {batch}
 *  - POST cplus_keep_undo {batch}      · POST cplus_cache_clear (vider ce qui est gardé)
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_CPLUS_DIR (un fichier <étape>.json par appel, image.jpg) à la place du réseau ; fichier absent = hors ligne.
 */

const CPLUS_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const CPLUS_TTL = ['cemeteries' => 90 * 86400, 'images' => 30 * 86400, 'church' => 90 * 86400, 'newspapers' => 30 * 86400, 'commune' => 180 * 86400];
const CPLUS_OSM = ['label' => '© OpenStreetMap contributors', 'licence' => 'ODbL 1.0', 'url' => 'https://www.openstreetmap.org/copyright'];
const CPLUS_CHURCH_TYPES = ['Q16970', 'Q1088552', 'Q2977', 'Q108325', 'Q334383', 'Q163687', 'Q317557', 'Q120560', 'Q56242215', 'Q44613'];

/* ═════════════════════ le cache : un fichier par question ═════════════════════ */

function cplus_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir())), '/') . '/cache/commune-plus';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function cplus_cache_get(string $key): ?array
{
    $f = cplus_cache_dir() . '/' . sha1($key) . '.json';
    if (!is_file($f)) { return null; }
    $j = json_decode((string) @file_get_contents($f), true);
    return is_array($j) && isset($j['data']) ? $j : null;
}
function cplus_cache_put(string $key, array $data): void
{
    $d = cplus_cache_dir(true);
    @file_put_contents($d . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}
/** la réponse gardée si elle est assez récente ; sinon $make() (le réseau) ; si le réseau manque : la vieille réponse, ou « hors ligne » */
function cplus_cached(string $kind, string $key, callable $make, bool $fresh = false): array
{
    $key = $kind . ':' . $key;
    $c = cplus_cache_get($key);
    if ($c && !$fresh && (int) $c['at'] > time() - (CPLUS_TTL[$kind] ?? 30 * 86400)) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    try {
        $data = $make();
    } catch (Throwable $e) {
        if ($c) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    cplus_cache_put($key, $data);
    return $data + ['cached' => false, 'fetched_at' => time()];
}

/* ═════════════════════ le réseau ═════════════════════ */

function cplus_test_dir(): string
{
    $dir = (string) getenv('LCNDA_TEST_CPLUS_DIR');
    return getenv('GENEALOGY_TEST') === '1' && $dir !== '' ? $dir : '';
}
/** GET (ou POST si $post) → corps brut ; $step nomme le fichier d'essai */
function cplus_http(string $step, string $url, ?array $post = null, int $max = 6_000_000, string $accept = 'application/json'): string
{
    if (($dir = cplus_test_dir()) !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . ($post ? ' ' . http_build_query($post) : '') . "\n", FILE_APPEND);
        $f = $dir . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
        if (!is_file($f)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($f);
    }
    // fabriquer les fichiers d'essai (scripts : LCNDA_CPLUS_RECORD_DIR) : une réponse déjà enregistrée est relue, sinon le réseau, lentement
    $rec = PHP_SAPI === 'cli' ? (string) getenv('LCNDA_CPLUS_RECORD_DIR') : '';
    if ($rec !== '') {
        $f = $rec . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
        if (is_file($f)) { return (string) file_get_contents($f); }
        sleep(max(0, (int) getenv('LCNDA_CPLUS_RECORD_WAIT')));
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    if (!in_array($host, ['overpass-api.de', 'commons.wikimedia.org', 'upload.wikimedia.org', 'www.wikidata.org', 'www.loc.gov'], true)) { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false;
    $ch = curl_init($url);
    $opt = [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 45, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => CPLUS_UA, CURLOPT_HTTPHEADER => ['Accept: ' . $accept],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }];
    if ($post !== null) { $opt[CURLOPT_POST] = true; $opt[CURLOPT_POSTFIELDS] = http_build_query($post); }
    curl_setopt_array($ch, $opt + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code === 429 || $code === 503 || $code === 504) { throw new RuntimeException(i18n_t('Le site est très demandé en ce moment : réessaie dans une minute.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    if ($rec !== '') { @file_put_contents($rec . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step), $body); }
    return $body;
}
function cplus_json(string $step, string $url, ?array $post = null): array
{
    $j = json_decode(cplus_http($step, $url, $post), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    if (isset($j['error']['info'])) { throw new RuntimeException(mb_substr((string) $j['error']['info'], 0, 200)); }
    return $j;
}
function cplus_wd(string $step, array $q): array { return cplus_json($step, 'https://www.wikidata.org/w/api.php?' . http_build_query($q + ['format' => 'json', 'formatversion' => '2'])); }
function cplus_commons(string $step, array $q): array { return cplus_json($step, 'https://commons.wikimedia.org/w/api.php?' . http_build_query($q + ['format' => 'json', 'formatversion' => '2'])); }

/* ═════════════════════ le lieu ═════════════════════ */

/** le lieu demandé : place_id (la base) ou name/lat/lon/country/insee envoyés par la page */
function cplus_place(PDO $pdo, array $q): array
{
    $p = ['id' => safe_int($q['place_id'] ?? 0), 'name' => trim(safe_text($q['name'] ?? '')), 'county' => trim(safe_text($q['county'] ?? '')), 'country' => trim(safe_text($q['country'] ?? '')),
        'lat' => is_numeric($q['lat'] ?? null) ? (float) $q['lat'] : null, 'lon' => is_numeric($q['lon'] ?? null) ? (float) $q['lon'] : null,
        'insee' => preg_match('/^(\d[\dAB]\d{3})$/', (string) ($q['insee'] ?? ''), $m) ? $m[1] : '', 'qid' => preg_match('/^Q\d{1,12}$/', (string) ($q['qid'] ?? '')) ? (string) $q['qid'] : ''];
    if ($p['id'] > 0) {
        $s = $pdo->prepare('SELECT name, county, country, latitude, longitude FROM places WHERE id=?'); $s->execute([$p['id']]);
        if ($r = $s->fetch(PDO::FETCH_ASSOC)) {
            $p['name'] = $p['name'] !== '' ? $p['name'] : (string) $r['name'];
            $p['county'] = $p['county'] !== '' ? $p['county'] : (string) $r['county'];
            $p['country'] = $p['country'] !== '' ? $p['country'] : (string) $r['country'];
            if ($p['lat'] === null && $r['latitude'] !== null && $r['latitude'] !== '') { $p['lat'] = (float) $r['latitude']; $p['lon'] = (float) $r['longitude']; }
        }
    }
    // le nom de commune seul : « Saint-Léonard-de-Noblat, Haute-Vienne » → « Saint-Léonard-de-Noblat »
    $p['name'] = trim((string) preg_replace('/\s*[,(].*$/u', '', $p['name']));
    if ($p['lat'] !== null && (abs($p['lat']) > 90 || abs((float) $p['lon']) > 180)) { $p['lat'] = $p['lon'] = null; }
    return $p;
}
function cplus_km(float $a, float $b, float $c, float $d): float
{
    $r = M_PI / 180; $x = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
    return 6371.0 * 2 * atan2(sqrt($x), sqrt(1 - $x));
}
function cplus_fold(string $s): string
{
    $s = mb_strtolower($s);
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', 'ÿ' => 'y']);
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
}

/* ═════════════════════ Wikidata : la commune ═════════════════════ */

/** les valeurs d'une propriété : identifiants d'éléments, textes, ou [temps, précision] */
function cplus_claims(array $e, string $p): array
{
    $out = [];
    foreach ($e['claims'][$p] ?? [] as $c) {
        if (($c['rank'] ?? '') === 'deprecated') { continue; }
        $v = $c['mainsnak']['datavalue']['value'] ?? null;
        if ($v === null) { continue; }
        $out[] = $v;
    }
    return $out;
}
function cplus_label(array $e): string
{
    $l = $e['labels']['fr']['value'] ?? ($e['labels']['fr'] ?? null);
    if (is_array($l)) { $l = $l['value'] ?? ''; }
    if (!is_string($l) || $l === '') { foreach ($e['labels'] ?? [] as $x) { $l = is_array($x) ? (string) ($x['value'] ?? '') : (string) $x; if ($l !== '') { break; } } }
    return (string) $l;
}

/** la commune sur Wikidata : par le code INSEE (P374), sinon par le nom près de la position, sinon par le nom seul → {qid, label, category, lat, lon} */
function cplus_commune(array $p, bool $fresh = false): array
{
    $key = $p['qid'] !== '' ? 'q=' . $p['qid'] : ($p['insee'] !== '' ? 'insee=' . $p['insee'] : cplus_fold($p['name']) . '@' . ($p['lat'] !== null ? round($p['lat'], 2) . ',' . round((float) $p['lon'], 2) : cplus_fold($p['country'])));
    $r = cplus_cached('commune', $key, static function () use ($p) {
        $qid = $p['qid'];
        if ($qid === '' && $p['insee'] !== '') {
            $s = cplus_wd('wd_search_commune.json', ['action' => 'query', 'list' => 'search', 'srsearch' => 'haswbstatement:P374=' . $p['insee'], 'srlimit' => 3, 'srprop' => '']);
            $qid = (string) ($s['query']['search'][0]['title'] ?? '');
        }
        if ($qid === '' && $p['name'] !== '') {
            $near = $p['lat'] !== null ? sprintf(' nearcoord:15km,%.4F,%.4F', $p['lat'], $p['lon']) : '';
            $fr = $p['lat'] === null && ($p['country'] === '' || preg_match('/^(fr|france)$/i', $p['country'])) ? ' haswbstatement:P374' : ' haswbstatement:P625';
            $s = cplus_wd('wd_search_commune.json', ['action' => 'query', 'list' => 'search', 'srsearch' => '"' . str_replace('"', '', $p['name']) . '"' . $fr . $near, 'srlimit' => 5, 'srprop' => 'snippet']);
            $want = cplus_fold($p['name']);
            foreach ($s['query']['search'] ?? [] as $hit) {
                if (cplus_fold(strtok(strip_tags((string) ($hit['snippet'] ?? '')), "\n") ?: '') === $want) { $qid = (string) $hit['title']; break; }
            }
            if ($qid === '') { $qid = (string) ($s['query']['search'][0]['title'] ?? ''); }
        }
        if (!preg_match('/^Q\d+$/', $qid)) { return ['ok' => false, 'none' => true, 'message' => i18n_t('Commune introuvable sur Wikidata.')]; }
        $j = cplus_wd('wd_commune.json', ['action' => 'wbgetentities', 'ids' => $qid, 'props' => 'claims|labels', 'languages' => 'fr|en']);
        $e = $j['entities'][$qid] ?? [];
        $cat = (string) (cplus_claims($e, 'P373')[0] ?? '');
        $co = cplus_claims($e, 'P625')[0] ?? null;
        return ['ok' => true, 'qid' => $qid, 'label' => cplus_label($e), 'category' => $cat, 'lat' => is_array($co) ? (float) $co['latitude'] : null, 'lon' => is_array($co) ? (float) $co['longitude'] : null,
            'url' => 'https://www.wikidata.org/wiki/' . $qid];
    }, $fresh);
    return $r;
}

/* ═════════════════════ 1. 🪦 cimetières (OpenStreetMap) ═════════════════════ */

const CPLUS_RELIGION = ['christian' => 'chrétien', 'jewish' => 'juif', 'muslim' => 'musulman', 'multifaith' => 'toutes religions', 'none' => 'sans religion', 'buddhist' => 'bouddhiste'];
const CPLUS_DENOM = ['catholic' => 'catholique', 'roman_catholic' => 'catholique', 'protestant' => 'protestant', 'reformed' => 'protestant', 'lutheran' => 'protestant (luthérien)', 'evangelical' => 'protestant', 'orthodox' => 'orthodoxe', 'anglican' => 'anglican'];

function cplus_cemeteries(PDO $pdo, array $q): array
{
    $p = cplus_place($pdo, $q);
    if ($p['lat'] === null) { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Le lieu n’a pas de coordonnées : place-le sur la carte pour voir les cimetières autour.')]; }
    $radius = max(1000, min(10000, safe_int($q['radius'] ?? 5000) ?: 5000));
    $lat = round($p['lat'], 4); $lon = round((float) $p['lon'], 4);
    $r = cplus_cached('cemeteries', "{$lat},{$lon},{$radius}", static function () use ($lat, $lon, $radius) {
        $ql = sprintf('[out:json][timeout:25];(nwr["landuse"="cemetery"](around:%1$d,%2$.4F,%3$.4F);nwr["amenity"="grave_yard"](around:%1$d,%2$.4F,%3$.4F););out center tags;', $radius, $lat, $lon);
        $j = cplus_json('overpass.json', 'https://overpass-api.de/api/interpreter', ['data' => $ql]);
        $items = []; $seen = [];
        foreach ($j['elements'] ?? [] as $el) {
            $la = $el['lat'] ?? ($el['center']['lat'] ?? null); $lo = $el['lon'] ?? ($el['center']['lon'] ?? null);
            if ($la === null || $lo === null) { continue; }
            $t = $el['tags'] ?? [];
            $id = ($el['type'] ?? 'node') . '/' . (int) ($el['id'] ?? 0);
            $items[] = ['osm' => $id, 'name' => (string) ($t['name'] ?? ''), 'lat' => (float) $la, 'lon' => (float) $lo,
                'religion' => (string) ($t['religion'] ?? ''), 'denomination' => (string) ($t['denomination'] ?? ''),
                'kind' => ($t['cemetery'] ?? '') === 'war_cemetery' || ($t['historic'] ?? '') === 'memorial' && str_contains(mb_strtolower((string) ($t['name'] ?? '')), 'militaire') ? 'war' : (($t['amenity'] ?? '') === 'grave_yard' ? 'churchyard' : 'cemetery'),
                'wikidata' => (string) ($t['wikidata'] ?? '')];
        }
        // un même cimetière dessiné deux fois (le terrain et l'enclos de l'église) : on garde le premier à moins de 60 m
        foreach ($items as $it) {
            foreach ($seen as $s) { if (cplus_km($s['lat'], $s['lon'], $it['lat'], $it['lon']) < 0.06 && ($s['name'] === $it['name'] || $it['name'] === '')) { continue 2; } }
            $seen[] = $it;
        }
        return ['ok' => true, 'items' => $seen, 'radius' => $radius, 'source' => CPLUS_OSM];
    }, !empty($q['fresh']));
    if (empty($r['ok'])) { return $r; }
    foreach ($r['items'] as &$it) {
        $it['km'] = round(cplus_km($p['lat'], (float) $p['lon'], $it['lat'], $it['lon']), 1);
        $rel = array_filter([CPLUS_DENOM[$it['denomination']] ?? '', CPLUS_DENOM[$it['denomination']] ?? '' ? '' : (CPLUS_RELIGION[$it['religion']] ?? '')]);
        $it['religion_label'] = implode(', ', $rel);
        $it['url'] = 'https://www.openstreetmap.org/' . $it['osm'];
        $it['route'] = 'https://www.openstreetmap.org/directions?route=' . rawurlencode(';' . round($it['lat'], 5) . ',' . round($it['lon'], 5));
    }
    unset($it);
    usort($r['items'], static fn($a, $b) => $a['km'] <=> $b['km']);
    $r['items'] = array_slice($r['items'], 0, 30);
    $r['place'] = ['name' => $p['name'], 'lat' => $p['lat'], 'lon' => $p['lon']];
    return $r;
}

/* ═════════════════════ 2. 🖼️ images anciennes (Wikimedia Commons) ═════════════════════ */

/** l'année d'une date Commons (« 1905 », « circa 1910 », « 12 mai 1903 », « 1900s ») ; 0 si aucune */
function cplus_year(string $s): int
{
    $s = strip_tags($s);
    if (preg_match('/\b(1[5-9]\d\d|20[0-2]\d)\b/', $s, $m)) { return (int) $m[1]; }
    return 0;
}
function cplus_text(string $html, int $max = 300): string
{
    $t = html_entity_decode(strip_tags(str_replace(['<br>', '<br/>', '<br />'], ' ', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return mb_substr(trim((string) preg_replace('/\s+/u', ' ', $t)), 0, $max);
}
const CPLUS_OLD_CAT = '/(old|vintage|historic(al)?)\s+(post\s*cards?|photographs?|maps?|images?)|postcards|cartes?\s+postales|history\s+of|in\s+the\s+(1[5-9]|20)\d\ds|in\s+(1[5-9]\d\d|19[0-5]\d)\b|(1[5-9]|19)th[- ]century|in\s+the\s+past|anciennes?|before\s+19[0-6]\d|19th|18th|17th/i';

function cplus_images(PDO $pdo, array $q): array
{
    $p = cplus_place($pdo, $q);
    if ($p['name'] === '' && $p['insee'] === '' && $p['qid'] === '') { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Choisis une commune.')]; }
    $fresh = !empty($q['fresh']);
    $c = cplus_commune($p, $fresh);
    if (empty($c['ok'])) { return $c; }
    if ($c['category'] === '') { return ['ok' => true, 'items' => [], 'commune' => $c, 'message' => i18n_t('Cette commune n’a pas de catégorie sur Wikimedia Commons.')]; }
    $r = cplus_cached('images', $c['category'], static function () use ($c) {
        $cat = $c['category'];
        $cats = ['Category:' . $cat];
        $subs = cplus_commons('commons_subcats.json', ['action' => 'query', 'list' => 'categorymembers', 'cmtitle' => 'Category:' . $cat, 'cmtype' => 'subcat', 'cmlimit' => 200]);
        $hist = '';
        foreach ($subs['query']['categorymembers'] ?? [] as $m) {
            $t = (string) ($m['title'] ?? '');
            if (preg_match(CPLUS_OLD_CAT, $t)) { $cats[] = $t; if (preg_match('/history of/i', $t)) { $hist = $t; } }
        }
        if ($hist !== '') {
            $hs = cplus_commons('commons_history_subcats.json', ['action' => 'query', 'list' => 'categorymembers', 'cmtitle' => $hist, 'cmtype' => 'subcat', 'cmlimit' => 200]);
            foreach ($hs['query']['categorymembers'] ?? [] as $m) { $t = (string) ($m['title'] ?? ''); if (preg_match(CPLUS_OLD_CAT, $t) && !in_array($t, $cats, true)) { $cats[] = $t; } }
        }
        $cats = array_slice(array_values(array_unique($cats)), 0, 12);
        // incategory:"A|B|C" (un « ou » entre les catégories ; espaces → _)
        $inc = implode('|', array_map(static fn($t) => str_replace([' ', '"', '|'], ['_', '', ''], (string) preg_replace('/^Category:/', '', $t)), $cats));
        $j = cplus_commons('commons_files.json', ['action' => 'query', 'generator' => 'search', 'gsrnamespace' => 6, 'gsrsearch' => 'filetype:bitmap incategory:"' . $inc . '"', 'gsrlimit' => 100,
            'prop' => 'imageinfo', 'iiprop' => 'url|extmetadata', 'iiurlwidth' => 360,
            'iiextmetadatafilter' => 'DateTimeOriginal|DateTime|Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|ImageDescription|ObjectName|Categories|AttributionRequired|Copyrighted']);
        $items = [];
        foreach ($j['query']['pages'] ?? [] as $pg) {
            $ii = $pg['imageinfo'][0] ?? null; if (!$ii) { continue; }
            $md = $ii['extmetadata'] ?? [];
            $v = static fn($k) => (string) ($md[$k]['value'] ?? '');
            $catsOf = (string) $v('Categories');
            $year = cplus_year($v('DateTimeOriginal'));
            $postcard = (bool) preg_match('/postcards?|cartes?[ _]postales?/i', $catsOf);
            if (!($year && $year <= 1960) && !($postcard && !$year)) { continue; }
            $lic = $v('LicenseShortName') ?: $v('UsageTerms');
            if ($lic === '') { continue; } // sans licence lisible : pas montré
            $title = (string) ($pg['title'] ?? '');
            $items[] = ['file' => $title, 'title' => cplus_text($v('ObjectName') ?: (string) preg_replace('/^File:|\.\w+$/', '', $title), 160),
                'desc' => cplus_text($v('ImageDescription'), 240), 'year' => $year, 'date' => cplus_text($v('DateTimeOriginal'), 60), 'postcard' => $postcard,
                'author' => cplus_text($v('Artist'), 160) ?: cplus_text($v('Credit'), 160), 'licence' => cplus_text($lic, 80), 'licence_url' => (string) ($md['LicenseUrl']['value'] ?? ''),
                'thumb' => (string) ($ii['thumburl'] ?? ''), 'full' => (string) ($ii['url'] ?? ''), 'page' => (string) ($ii['descriptionurl'] ?? ('https://commons.wikimedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $title))))];
        }
        usort($items, static fn($a, $b) => ($a['year'] ?: 1960) <=> ($b['year'] ?: 1960) ?: strcmp($a['file'], $b['file']));
        return ['ok' => true, 'items' => array_slice($items, 0, 60), 'categories' => $cats,
            'source' => ['label' => 'Wikimedia Commons', 'licence' => i18n_t('licence propre à chaque image'), 'url' => 'https://commons.wikimedia.org/wiki/Category:' . rawurlencode(str_replace(' ', '_', $cat))]];
    }, $fresh);
    return $r + ['commune' => $c];
}

/* ═════════════════════ 3. ⛪ l'église et son saint patron (Wikidata) ═════════════════════ */

function cplus_roman(int $n): string
{
    $out = ''; foreach ([1000 => 'M', 900 => 'CM', 500 => 'D', 400 => 'CD', 100 => 'C', 90 => 'XC', 50 => 'L', 40 => 'XL', 10 => 'X', 9 => 'IX', 5 => 'V', 4 => 'IV', 1 => 'I'] as $v => $r) { while ($n >= $v) { $out .= $r; $n -= $v; } }
    return $out;
}
/** une date Wikidata → « XIIe s. », « 1123 », « années 1120 » */
function cplus_when(array $t): string
{
    if (!preg_match('/^([+-])0*(\d+)-/', (string) ($t['time'] ?? ''), $m)) { return ''; }
    $y = (int) $m[2]; $neg = $m[1] === '-'; $pr = (int) ($t['precision'] ?? 9);
    if ($neg || $y <= 0) { return ''; }
    if ($pr >= 9) { return (string) $y; }
    if ($pr === 8) { return i18n_t('années {y}', ['y' => (string) (intdiv($y, 10) * 10)]); }
    if ($pr === 7) { $c = intdiv($y - 1, 100) + 1; if ($y % 100 === 0) { $c = intdiv($y, 100); } return cplus_roman($c) . 'e s.'; }
    return '';
}

function cplus_church(PDO $pdo, array $q): array
{
    $p = cplus_place($pdo, $q);
    if ($p['name'] === '' && $p['insee'] === '' && $p['qid'] === '') { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Choisis une commune.')]; }
    $fresh = !empty($q['fresh']);
    $c = cplus_commune($p, $fresh);
    if (empty($c['ok'])) { return $c; }
    $r = cplus_cached('church', $c['qid'], static function () use ($c) {
        $q = $c['qid'];
        $ids = [];
        $s1 = cplus_wd('wd_church_search.json', ['action' => 'query', 'list' => 'search', 'srsearch' => "haswbstatement:P131={$q} haswbstatement:P417", 'srlimit' => 20, 'srprop' => '']);
        foreach ($s1['query']['search'] ?? [] as $h) { $ids[] = (string) $h['title']; }
        $s2 = cplus_wd('wd_church_search2.json', ['action' => 'query', 'list' => 'search', 'srsearch' => "haswbstatement:P131={$q} haswbstatement:" . implode('|', array_map(static fn($t) => "P31={$t}", array_slice(CPLUS_CHURCH_TYPES, 0, 6))), 'srlimit' => 20, 'srprop' => '']);
        foreach ($s2['query']['search'] ?? [] as $h) { $ids[] = (string) $h['title']; }
        $ids = array_slice(array_values(array_unique(array_filter($ids, static fn($x) => preg_match('/^Q\d+$/', $x) && $x !== $q))), 0, 20);
        if (!$ids) { return ['ok' => true, 'churches' => [], 'source' => cplus_wd_source()]; }
        $j = cplus_wd('wd_churches.json', ['action' => 'wbgetentities', 'ids' => implode('|', $ids), 'props' => 'claims|labels', 'languages' => 'fr|en']);
        $churches = []; $saintIds = [];
        foreach ($ids as $id) {
            $e = $j['entities'][$id] ?? null; if (!$e) { continue; }
            $types = array_map(static fn($v) => (string) ($v['id'] ?? ''), cplus_claims($e, 'P31'));
            $label = cplus_label($e);
            $isChurch = (bool) array_intersect($types, CPLUS_CHURCH_TYPES) || preg_match('/^(église|eglise|chapelle|collégiale|cathédrale|basilique|abbatiale|prieuré|temple)\b/iu', $label);
            if (!$isChurch) { continue; }
            $saints = array_values(array_filter(array_map(static fn($v) => (string) ($v['id'] ?? ''), cplus_claims($e, 'P417'))));
            $saintIds = array_merge($saintIds, $saints);
            $inc = cplus_claims($e, 'P571')[0] ?? null;
            $img = (string) (cplus_claims($e, 'P18')[0] ?? '');
            $churches[] = ['qid' => $id, 'label' => $label, 'when' => is_array($inc) ? cplus_when($inc) : '', 'saint_ids' => $saints, 'image' => $img,
                'thumb' => $img !== '' ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' . rawurlencode(str_replace(' ', '_', $img)) . '?width=320' : '',
                'image_page' => $img !== '' ? 'https://commons.wikimedia.org/wiki/File:' . rawurlencode(str_replace(' ', '_', $img)) : '',
                'gone' => (bool) cplus_claims($e, 'P576'), 'url' => 'https://www.wikidata.org/wiki/' . $id];
        }
        $saints = [];
        $saintIds = array_slice(array_values(array_unique($saintIds)), 0, 40);
        if ($saintIds) {
            $sj = cplus_wd('wd_saints.json', ['action' => 'wbgetentities', 'ids' => implode('|', $saintIds), 'props' => 'claims|labels', 'languages' => 'fr|en']);
            $dayIds = [];
            foreach ($saintIds as $sid) {
                $e = $sj['entities'][$sid] ?? null; if (!$e) { continue; }
                $days = array_values(array_filter(array_map(static fn($v) => (string) ($v['id'] ?? ''), cplus_claims($e, 'P841'))));
                $dayIds = array_merge($dayIds, $days);
                $saints[$sid] = ['qid' => $sid, 'label' => cplus_label($e), 'day_ids' => $days, 'url' => 'https://www.wikidata.org/wiki/' . $sid];
            }
            $dayIds = array_slice(array_values(array_unique($dayIds)), 0, 40);
            if ($dayIds) {
                $dj = cplus_wd('wd_days.json', ['action' => 'wbgetentities', 'ids' => implode('|', $dayIds), 'props' => 'labels', 'languages' => 'fr']);
                foreach ($saints as &$s) { $s['feast'] = array_values(array_filter(array_map(static fn($d) => cplus_label($dj['entities'][$d] ?? []), $s['day_ids']))); unset($s['day_ids']); }
                unset($s);
            }
        }
        foreach ($churches as &$ch) { $ch['saints'] = array_values(array_map(static fn($id) => $saints[$id] ?? ['qid' => $id, 'label' => '', 'feast' => []], $ch['saint_ids'])); unset($ch['saint_ids']); }
        unset($ch);
        // d'abord les églises (pas les chapelles), celles qui ont un saint patron, encore debout
        usort($churches, static fn($a, $b) => [(int) $a['gone'], $a['saints'] ? 0 : 1, preg_match('/^(église|eglise|collégiale|cathédrale|basilique)/iu', $a['label']) ? 0 : 1, $a['label']]
            <=> [(int) $b['gone'], $b['saints'] ? 0 : 1, preg_match('/^(église|eglise|collégiale|cathédrale|basilique)/iu', $b['label']) ? 0 : 1, $b['label']]);
        return ['ok' => true, 'churches' => array_slice($churches, 0, 8), 'source' => cplus_wd_source()];
    }, $fresh);
    return $r + ['commune' => $c];
}
function cplus_wd_source(): array { return ['label' => 'Wikidata', 'licence' => 'CC0 1.0', 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing']; }

/* ═════════════════════ 4. 📰 journaux anciens à l'étranger ═════════════════════ */

/** la personne : prénom, nom, années, lieux de vie hors de France */
function cplus_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, is_private FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new LcndaBadInput('Fiche introuvable.'); }
    if ((int) $p['is_private'] === 1) { throw new RuntimeException(i18n_t('Fiche confidentielle : son nom n’est pas envoyé sur Internet.')); }
    $ev = $pdo->prepare("SELECT e.year, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(pl.name,'') AS place, COALESCE(pl.country,'') AS country FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? ORDER BY COALESCE(e.year, 9999)");
    $ev->execute([$pid]);
    $y1 = 0; $y2 = 0; $places = [];
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $y = (int) $e['year'];
        if ($y && in_array($e['tag'], ['BIRT', 'BAPM', 'CHR'], true) && !$y1) { $y1 = $y; }
        if ($y && in_array($e['tag'], ['DEAT', 'BURI'], true)) { $y2 = $y; }
        if ($e['place'] !== '') { $places[] = ['tag' => $e['tag'], 'place' => $e['place'], 'country' => $e['country'], 'year' => $y]; }
    }
    return ['first' => trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'y1' => $y1, 'y2' => $y2, 'places' => $places];
}

function cplus_newspapers(PDO $pdo, array $q): array
{
    $pid = safe_int($q['person_id'] ?? 0);
    $pp = $pid ? cplus_person($pdo, $pid) : ['first' => trim(safe_text($q['first'] ?? '')), 'last' => trim(safe_text($q['last'] ?? ($q['name'] ?? ''))), 'y1' => safe_int($q['y1'] ?? 0), 'y2' => safe_int($q['y2'] ?? 0), 'places' => []];
    $last = trim((string) preg_replace('/\s+/u', ' ', $pp['last']));
    if (mb_strlen($last) < 2) { return ['ok' => false, 'message' => i18n_t('Il faut un nom de famille pour chercher dans les journaux.')]; }
    $from = $pp['y1'] ? max(1756, $pp['y1'] + 10) : 1756; $to = $pp['y2'] ? min(1963, $pp['y2'] + 2) : 1963;
    if ($from > 1963 || $to < 1756 || $from > $to) { return ['ok' => true, 'total' => 0, 'items' => [], 'out_of_range' => true, 'from' => $from, 'to' => $to, 'source' => cplus_loc_source()]; }
    $state = trim(safe_text($q['state'] ?? ''));
    $qtext = '"' . str_replace('"', '', $last) . '"';
    $search = 'https://www.loc.gov/collections/chronicling-america/?' . http_build_query(['q' => $qtext, 'dates' => "{$from}/{$to}"] + ($state !== '' ? ['fa' => 'location_state:' . mb_strtolower($state)] : []));
    $r = cplus_cached('newspapers', $qtext . "|{$from}|{$to}|{$state}", static function () use ($search) {
        $j = cplus_json('loc.json', $search . '&fo=json&c=10&at=results,pagination');
        $items = [];
        foreach ($j['results'] ?? [] as $x) {
            $items[] = ['title' => (string) (($x['partof_title'][0] ?? '') ?: ($x['title'] ?? '')), 'date' => (string) ($x['date'] ?? ''), 'url' => (string) ($x['url'] ?? ($x['id'] ?? '')),
                'place' => trim(implode(', ', array_filter([ucwords((string) ($x['location_city'][0] ?? '')), ucwords((string) ($x['location_state'][0] ?? ''))]))), 'language' => (string) ($x['language'][0] ?? '')];
        }
        return ['ok' => true, 'total' => (int) ($j['pagination']['of'] ?? count($items)), 'items' => $items];
    }, !empty($q['fresh']));
    return $r + ['search_url' => $search, 'from' => $from, 'to' => $to, 'source' => cplus_loc_source()];
}
function cplus_loc_source(): array { return ['label' => 'Chronicling America — Library of Congress', 'licence' => i18n_t('pas de restriction de droits connue'), 'url' => 'https://www.loc.gov/collections/chronicling-america/about-this-collection/rights-and-access/']; }

/* ═════════════════════ ＋ Garder une image dans les médias (↶) ═════════════════════ */

function cplus_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS cplus_keeps (batch TEXT PRIMARY KEY, media_id INTEGER NOT NULL, source_id INTEGER NOT NULL DEFAULT 0, link_id INTEGER NOT NULL DEFAULT 0,
        filename TEXT NOT NULL DEFAULT '', file TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, undone_at TEXT NOT NULL DEFAULT '')");
}

function cplus_keep(PDO $pdo, array $d): array
{
    cplus_schema($pdo);
    $file = trim(safe_text($d['file'] ?? ''));
    if (!preg_match('/^File:[^\/\\\\<>|{}\[\]#]{1,240}$/u', $file)) { throw new LcndaBadInput('Image inconnue.'); }
    $place = mb_substr(trim(safe_text($d['place_name'] ?? '')), 0, 120);
    // la licence et l'auteur relus sur Commons (jamais ceux envoyés par la page)
    $j = cplus_commons('commons_file.json', ['action' => 'query', 'titles' => $file, 'prop' => 'imageinfo', 'iiprop' => 'url|extmetadata|mime', 'iiurlwidth' => 2000,
        'iiextmetadatafilter' => 'DateTimeOriginal|Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|ImageDescription|ObjectName']);
    $pg = $j['query']['pages'][0] ?? null; $ii = $pg['imageinfo'][0] ?? null;
    if (!$ii) { throw new RuntimeException(i18n_t('Image introuvable sur Wikimedia Commons.')); }
    $md = $ii['extmetadata'] ?? []; $v = static fn($k) => (string) ($md[$k]['value'] ?? '');
    $lic = cplus_text($v('LicenseShortName') ?: $v('UsageTerms'), 80);
    if ($lic === '') { throw new RuntimeException(i18n_t('Licence de l’image illisible : elle n’est pas rangée.')); }
    $author = cplus_text($v('Artist'), 200) ?: cplus_text($v('Credit'), 200);
    $page = (string) ($ii['descriptionurl'] ?? ('https://commons.wikimedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $file))));
    $url = (string) ($ii['thumburl'] ?? ($ii['url'] ?? ''));
    if (strtolower((string) parse_url($url, PHP_URL_HOST)) !== 'upload.wikimedia.org' || parse_url($url, PHP_URL_SCHEME) !== 'https') { throw new RuntimeException('Adresse d’image refusée.'); }
    $bin = cplus_http('image.jpg', $url, null, 25_000_000, 'image/*');
    $info = @getimagesizefromstring($bin);
    $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'][$info[2] ?? 0] ?? null;
    if (!$ext) { throw new RuntimeException(i18n_t('Ce n’est pas une image (JPEG, PNG, WebP ou GIF).')); }
    if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (@file_put_contents(MEDIA_DIR . '/' . $name, $bin) === false) { throw new RuntimeException(i18n_t('Impossible d’enregistrer l’image.')); }
    $title = cplus_text($v('ObjectName') ?: (string) preg_replace('/^File:|\.\w+$/', '', $file), 200);
    $date = cplus_text($v('DateTimeOriginal'), 60);
    $attribution = trim(($author !== '' ? $author . ', ' : '') . $title . ($date !== '' ? ' (' . $date . ')' : '') . ' — ' . $lic . ', via Wikimedia Commons — ' . $page);
    $batch = 'cplus-' . bin2hex(random_bytes(6));
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_title, document_url, document_reference) VALUES(?,?,?,?,?,?,?,?,?)')
            ->execute([$title ?: 'Image', mb_substr(trim(($place !== '' ? i18n_t('Image ancienne de {p}', ['p' => $place]) . '. ' : '') . cplus_text($v('ImageDescription'), 300) . "\n" . $attribution), 0, 1000), 'image', $name, $name, $date, 'Wikimedia Commons', $page, $lic]);
        $mid = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([mb_substr('Wikimedia Commons — ' . $title, 0, 400), mb_substr($author, 0, 200), 'Wikimedia Commons', $lic, $page, $attribution . ($v('LicenseUrl') !== '' ? "\n" . $v('LicenseUrl') : '')]);
        $sid = (int) $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mid, $sid]);
        $lid = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO cplus_keeps(batch, media_id, source_id, link_id, filename, file) VALUES(?,?,?,?,?,?)')->execute([$batch, $mid, $sid, $lid, $name, $file]);
        if (function_exists('log_change')) { log_change($pdo, 'media', $mid, 'create', i18n_t('Image ancienne gardée depuis Wikimedia Commons') . ' — ' . $lic); }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        @unlink(MEDIA_DIR . '/' . $name);
        throw $e;
    }
    return ['ok' => true, 'batch' => $batch, 'media_id' => $mid, 'source_id' => $sid, 'licence' => $lic, 'author' => $author];
}

function cplus_keep_undo(PDO $pdo, array $d): array
{
    cplus_schema($pdo);
    $batch = safe_text($d['batch'] ?? '');
    if (!preg_match('/^cplus-[0-9a-f]{12}$/', $batch)) { throw new LcndaBadInput('Ajout inconnu.'); }
    $s = $pdo->prepare("SELECT * FROM cplus_keeps WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException(i18n_t('Déjà annulé, ou introuvable.')); }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM media_links WHERE media_id=?')->execute([(int) $r['media_id']]);
        $pdo->prepare('DELETE FROM media WHERE id=?')->execute([(int) $r['media_id']]);
        $pdo->prepare('DELETE FROM source_links WHERE source_record_id=?')->execute([(int) $r['source_id']]);
        $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([(int) $r['source_id']]);
        $pdo->prepare("UPDATE cplus_keeps SET undone_at=CURRENT_TIMESTAMP WHERE batch=?")->execute([$batch]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if ($r['filename'] !== '' && preg_match('/^[0-9a-f]{32}\.\w+$/', (string) $r['filename'])) { @unlink(MEDIA_DIR . '/' . $r['filename']); }
    return ['ok' => true];
}

/** ce qui est gardé : nombre de réponses et taille ; POST cplus_cache_clear les efface toutes */
function cplus_cache_info(): array
{
    $n = 0; $b = 0;
    foreach (glob(cplus_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); }
    return ['count' => $n, 'bytes' => $b];
}

/** vider : les réponses partent dans un dossier « corbeille » (↶ les remet) ; la corbeille précédente est effacée */
function cplus_cache_clear(): array
{
    $dir = cplus_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $d) { @rmdir($d); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function cplus_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = cplus_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}

function cplus_about(): array
{
    return ['ok' => true, 'cache' => cplus_cache_info(), 'sources' => [
        ['id' => 'osm', 'label' => 'OpenStreetMap (API Overpass)', 'what' => i18n_t('Cimetières autour du village'), 'licence' => 'ODbL 1.0', 'mention' => '© OpenStreetMap contributors', 'url' => 'https://www.openstreetmap.org/copyright'],
        ['id' => 'commons', 'label' => 'Wikimedia Commons', 'what' => i18n_t('Images anciennes de la commune'), 'licence' => i18n_t('propre à chaque image (domaine public, CC BY, CC BY-SA…)'), 'mention' => i18n_t('auteur et licence sous chaque image'), 'url' => 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia'],
        ['id' => 'wikidata', 'label' => 'Wikidata', 'what' => i18n_t('Églises et saints patrons'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing'],
        ['id' => 'loc', 'label' => 'Chronicling America (Library of Congress)', 'what' => i18n_t('Journaux américains 1756–1963'), 'licence' => i18n_t('pas de restriction de droits connue'), 'mention' => 'Library of Congress, Chronicling America', 'url' => 'https://www.loc.gov/collections/chronicling-america/about-this-collection/rights-and-access/'],
        ['id' => 'delpher', 'label' => 'Delpher (KB, Pays-Bas)', 'what' => i18n_t('Journaux néerlandais : lien de recherche seulement'), 'licence' => i18n_t('consultation libre sur le site'), 'mention' => 'Delpher', 'url' => 'https://www.delpher.nl/'],
        ['id' => 'anno', 'label' => 'ANNO (Bibliothèque nationale d’Autriche)', 'what' => i18n_t('Journaux autrichiens : lien de recherche seulement'), 'licence' => i18n_t('consultation libre sur le site'), 'mention' => 'ANNO – AustriaN Newspapers Online', 'url' => 'https://anno.onb.ac.at/'],
    ]];
}

/* ═════════════════════ les points d'entrée (api.php) ═════════════════════ */

function cplus_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'cplus_cemeteries' => cplus_cemeteries($pdo, $q),
        'cplus_images' => cplus_images($pdo, $q),
        'cplus_church' => cplus_church($pdo, $q),
        'cplus_newspapers' => cplus_newspapers($pdo, $q),
        'cplus_about' => cplus_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function cplus_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'cplus_keep' => cplus_keep($pdo, $d),
        'cplus_keep_undo' => cplus_keep_undo($pdo, $d),
        'cplus_cache_clear' => cplus_cache_clear(),
        'cplus_cache_restore' => cplus_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
