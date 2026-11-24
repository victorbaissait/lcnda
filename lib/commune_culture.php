<?php
declare(strict_types=1);

/**
 * 🎬📜🛡️🏷️🍲 Le village dans la culture — ce que la commune (et le nom de famille) a laissé dans les livres, les films, l'héraldique,
 * les noms de rues et la cuisine. Écran : assets/js/heritage-commune-culture.js (style : assets/css/commune-culture.css).
 *
 * Données DANS l'app (assets/data/, refaites par scripts/commune-culture/build-commune-culture.py) :
 *  - cc-communes.json.gz   : les communes (code INSEE → nom, position) — Wikidata (CC0), pour reconnaître un lieu sans code INSEE ;
 *  - cc-oeuvres.json.gz    : 🎬 films tournés dans la commune (P915 lieu de tournage) et 📖🎵🎨 œuvres qui s'y passent (P840 lieu de
 *                            l'action) ou qui en parlent (P921 sujet) — Wikidata (CC0) ;
 *  - cc-armoiries.json.gz  : 🛡️ armoiries des communes : image (Wikidata P94 → Wikimedia Commons, auteur et licence de chaque fichier)
 *                            et blasonnement (pages « Armorial des communes de … » de Wikipédia en français, CC BY-SA 4.0) ;
 *  - cc-plats.json.gz      : 🍲 plats et produits d'une région (Wikidata : lieu de création P1071, cuisine régionale P361) — CC0.
 * EN LIGNE, à la demande, puis gardé sur l'ordinateur (dossier « cache/commune-culture ») :
 *  - 📜 origine du nom et histoire : sections « Toponymie » et « Histoire » de l'article Wikipédia de la commune (CC BY-SA 4.0) ;
 *    la commune sur Wikidata : comme « Autour du village » (lib/commune_plus.php, cplus_commune), puis son article (sitelinks frwiki) ;
 *  - 🏷️ rues à son nom : Base Adresse Nationale (api-adresse.data.gouv.fr, Licence Ouverte 2.0) — le nom de famille seul est envoyé.
 * 🛡️ « Un blason à son nom ? » (Rietstap, Armorial général, 1884) : pas de transcription libre lisible par une machine trouvée (voir
 *    cc_about) ; la partie reste éteinte tant que assets/data/cc-rietstap.json.gz n'existe pas.
 *
 *  - GET cc_place&place_id=|insee=|name=&lat=&lon=   → {commune, arms, works, dishes} (sans réseau)
 *  - GET cc_wiki&…                                   → {toponymie, histoire, article, source} (en ligne, gardé)
 *  - GET cc_person&id=                               → {lines…} (sans réseau) · GET cc_rues&id=|name=&first= (en ligne, gardé)
 *  - GET cc_list&kind=oeuvres|armoiries|plats|rietstap → {rows} · GET cc_about
 *  - POST cc_cache_clear / cc_cache_restore {token}
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_CC_DIR (un fichier <étape>.json par appel) ; fichier absent = hors ligne.
 * Fabriquer ces fichiers à partir des vraies réponses : LCNDA_CC_RECORD_DIR (ligne de commande seulement).
 */

require_once __DIR__ . '/commune_plus.php';

const CC_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const CC_TTL = ['wiki' => 180 * 86400, 'article' => 180 * 86400, 'rues' => 90 * 86400];
const CC_HOSTS = ['fr.wikipedia.org', 'www.wikidata.org', 'api-adresse.data.gouv.fr'];
const CC_WP_LICENCE = ['label' => 'CC BY-SA 4.0', 'url' => 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr'];
const CC_BAN = ['label' => 'Base Adresse Nationale (BAN)', 'licence' => 'Licence Ouverte 2.0 (Etalab)', 'url' => 'https://adresse.data.gouv.fr/'];
const CC_WD = ['label' => 'Wikidata', 'licence' => 'CC0 1.0', 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing'];

/* ═════════════════════ le cache : un fichier par question (comme lib/commune_plus.php) ═════════════════════ */

function cc_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir())), '/') . '/cache/commune-culture';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function cc_cached(string $kind, string $key, callable $make, bool $fresh = false): array
{
    $key = $kind . ':' . $key;
    $f = cc_cache_dir() . '/' . sha1($key) . '.json';
    $c = null;
    if (is_file($f)) { $j = json_decode((string) @file_get_contents($f), true); if (is_array($j) && isset($j['data'])) { $c = $j; } }
    if ($c && !$fresh && (int) $c['at'] > time() - (CC_TTL[$kind] ?? 30 * 86400)) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    try {
        $data = $make();
    } catch (Throwable $e) {
        if ($c) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    $d = cc_cache_dir(true);
    @file_put_contents($d . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $data + ['cached' => false, 'fetched_at' => time()];
}

/* ═════════════════════ le réseau ═════════════════════ */

function cc_test_dir(): string
{
    $dir = (string) getenv('LCNDA_TEST_CC_DIR');
    return getenv('GENEALOGY_TEST') === '1' && $dir !== '' ? $dir : '';
}
function cc_http(string $step, string $url): string
{
    $step = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
    if (($dir = cc_test_dir()) !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        if (!is_file($dir . '/' . $step)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($dir . '/' . $step);
    }
    $rec = PHP_SAPI === 'cli' ? (string) getenv('LCNDA_CC_RECORD_DIR') : '';
    if ($rec !== '' && is_file($rec . '/' . $step)) { return (string) file_get_contents($rec . '/' . $step); }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), CC_HOSTS, true)) { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false; $max = 4_000_000;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => CC_UA, CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }]
        + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code === 429 || $code === 503 || $code === 504) { throw new RuntimeException(i18n_t('Le site est très demandé en ce moment : réessaie dans une minute.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    if ($rec !== '') { @file_put_contents($rec . '/' . $step, $body); }
    return $body;
}
function cc_json(string $step, string $url): array
{
    $j = json_decode(cc_http($step, $url), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    if (isset($j['error']['info'])) { throw new RuntimeException(mb_substr((string) $j['error']['info'], 0, 200)); }
    return $j;
}
function cc_wp(string $step, array $q): array { return cc_json($step, 'https://fr.wikipedia.org/w/api.php?' . http_build_query($q + ['format' => 'json', 'formatversion' => '2'])); }

/* ═════════════════════ les données livrées ═════════════════════ */

function cc_data_file(string $name): string { return APP_ROOT . '/assets/data/cc-' . $name . '.json.gz'; }
/** un fichier assets/data/cc-<nom>.json.gz (lu une fois par demande) ; null s'il manque */
function cc_data(string $name): ?array
{
    static $memo = [];
    if (array_key_exists($name, $memo)) { return $memo[$name]; }
    $f = cc_data_file($name);
    $j = is_file($f) ? json_decode((string) @gzdecode((string) file_get_contents($f)), true) : null;
    return $memo[$name] = is_array($j) ? $j : null;
}
function cc_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    if (class_exists('Normalizer')) { $s = (string) Normalizer::normalize($s, Normalizer::FORM_D); $s = (string) preg_replace('/\p{Mn}+/u', '', $s); }
    else { $s = cplus_fold($s); }
    $s = str_replace(['œ', 'æ', '’', "'"], ['oe', 'ae', ' ', ' '], $s);
    $s = (string) preg_replace('/\b(st|ste)\b/', 'saint', $s); // « St-Léonard » = « Saint-Léonard »
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
}
/** les départements (code → nom), tirés du découpage INSEE déjà livré avec l'app */
function cc_departements(): array
{
    static $d = null;
    if ($d !== null) { return $d; }
    $f = APP_ROOT . '/assets/data/communes-decoupage.json.gz';
    $j = is_file($f) ? json_decode((string) @gzdecode((string) file_get_contents($f)), true) : null;
    return $d = is_array($j['dep'] ?? null) ? $j['dep'] : [];
}
function cc_dep_of_insee(string $insee): string { return $insee === '' ? '' : (str_starts_with($insee, '97') ? substr($insee, 0, 3) : substr($insee, 0, 2)); }
function cc_dep_of_name(string $county): string
{
    $f = cc_fold($county); if ($f === '') { return ''; }
    if (preg_match('/^(\d[\dab]|97\d)$/', $f)) { return strtoupper($f); }
    foreach (cc_departements() as $code => $name) { if (cc_fold((string) $name) === $f) { return (string) $code; } }
    return '';
}

/** le lieu : la ligne de la base (ou ce que la page envoie), complétée par son code INSEE quand on le reconnaît */
function cc_place(PDO $pdo, array $q): array
{
    $p = cplus_place($pdo, $q);
    if ($p['insee'] === '' && $p['id'] > 0) {
        $s = $pdo->prepare('SELECT admin4_code FROM places WHERE id=?'); $s->execute([$p['id']]);
        $c = (string) $s->fetchColumn();
        if (preg_match('/^\d[\dAB]\d{3}$/', $c)) { $p['insee'] = $c; }
    }
    if ($p['insee'] === '') { $p['insee'] = cc_find_insee($p['name'], $p['county'], $p['lat'], $p['lon'], $p['country']); }
    $p['dep'] = $p['insee'] !== '' ? cc_dep_of_insee($p['insee']) : cc_dep_of_name($p['county']);
    $c = $p['insee'] !== '' ? (cc_data('communes')['c'][$p['insee']] ?? null) : null;
    $p['commune'] = $c ? (string) $c[0] : $p['name'];
    if ($p['lat'] === null && $c && $c[1] !== null) { $p['lat'] = (float) $c[1]; $p['lon'] = (float) $c[2]; }
    return $p;
}
/** le code INSEE d'un lieu sans code : par son nom (et son département), sinon la commune la plus proche (moins de 3 km) */
function cc_find_insee(string $name, string $county, ?float $lat, ?float $lon, string $country = ''): string
{
    if ($country !== '' && !preg_match('/^(fr|fra|france)$/i', trim($country))) { return ''; }
    $C = cc_data('communes'); if (!$C) { return ''; }
    $want = cc_fold($name); $dep = cc_dep_of_name($county); $hits = [];
    if ($want !== '') {
        foreach ($C['c'] as $insee => $r) { if (cc_fold((string) $r[0]) === $want) { $hits[] = (string) $insee; } }
        if ($dep !== '') { $in = array_values(array_filter($hits, static fn($i) => cc_dep_of_insee($i) === $dep)); if ($in) { $hits = $in; } }
    }
    if (count($hits) > 1 && $lat !== null) {
        usort($hits, static fn($a, $b) => cplus_km($lat, (float) $lon, (float) ($C['c'][$a][1] ?? 0), (float) ($C['c'][$a][2] ?? 0)) <=> cplus_km($lat, (float) $lon, (float) ($C['c'][$b][1] ?? 0), (float) ($C['c'][$b][2] ?? 0)));
    }
    if (count($hits) === 1 || (count($hits) > 1 && ($dep !== '' || $lat !== null))) { return $hits[0]; }
    if ($lat !== null && $lon !== null) {
        $best = ''; $bk = 3.0;
        foreach ($C['c'] as $insee => $r) {
            if ($r[1] === null || abs((float) $r[1] - $lat) > 0.05 || abs((float) $r[2] - $lon) > 0.07) { continue; }
            $k = cplus_km($lat, $lon, (float) $r[1], (float) $r[2]); if ($k < $bk) { $bk = $k; $best = (string) $insee; }
        }
        return $best;
    }
    return '';
}

/* ═════════════════════ 🎬📖 le village dans les œuvres ═════════════════════ */

const CC_KINDS = ['film' => ['🎬', 'Film'], 'tv' => ['📺', 'Série ou téléfilm'], 'livre' => ['📖', 'Livre'], 'musique' => ['🎵', 'Chanson ou musique'], 'art' => ['🎨', 'Tableau ou image'], 'jeu' => ['🎮', 'Jeu'], 'autre' => ['✨', 'Autre œuvre']];
const CC_RELS = ['tourne' => 'tourné ici', 'cadre' => 'l’histoire se passe ici', 'sujet' => 'parle de la commune'];

/** les œuvres d'une commune : la ligne complète de chaque œuvre (les plus anciennes d'abord, les films tournés en tête) */
function cc_works(string $insee): array
{
    $D = cc_data('oeuvres'); if (!$D || $insee === '') { return []; }
    $out = [];
    foreach ($D['rows'] as $r) { if (($r['insee'] ?? '') === $insee) { $out[] = cc_work_row($r, $D); } }
    usort($out, static fn($a, $b) => [$a['rel'] === 'tourne' ? 0 : ($a['rel'] === 'cadre' ? 1 : 2), $a['year'] ?: 9999, $a['title']] <=> [$b['rel'] === 'tourne' ? 0 : ($b['rel'] === 'cadre' ? 1 : 2), $b['year'] ?: 9999, $b['title']]);
    return $out;
}
function cc_work_row(array $r, array $D): array
{
    $img = (string) ($r['img'] ?? '');
    $c = cc_data('communes')['c'][$r['insee']] ?? null;
    return ['qid' => $r['q'], 'title' => $r['t'], 'kind' => $r['k'], 'kind_label' => CC_KINDS[$r['k']][1] ?? '', 'icon' => CC_KINDS[$r['k']][0] ?? '✨', 'rel' => $r['rel'], 'rel_label' => CC_RELS[$r['rel']] ?? '',
        'year' => (int) ($r['y'] ?? 0), 'by' => (string) ($r['by'] ?? ''), 'where' => (string) ($r['loc'] ?? ''), 'insee' => (string) $r['insee'], 'commune' => $c ? (string) $c[0] : '',
        'dep' => cc_dep_of_insee((string) $r['insee']), 'lat' => $c[1] ?? null, 'lon' => $c[2] ?? null,
        'image' => $img, 'thumb' => $img !== '' ? cc_thumb($img, 240) : '', 'url' => 'https://www.wikidata.org/wiki/' . $r['q'], 'wp' => (string) ($r['wp'] ?? '')];
}
function cc_thumb(string $file, int $w): string { return 'https://commons.wikimedia.org/wiki/Special:FilePath/' . rawurlencode(str_replace(' ', '_', $file)) . '?width=' . $w; }
function cc_file_page(string $file): string { return 'https://commons.wikimedia.org/wiki/File:' . rawurlencode(str_replace(' ', '_', $file)); }

/* ═════════════════════ 🛡️ armoiries de la commune ═════════════════════ */

function cc_arms(string $insee): ?array
{
    $D = cc_data('armoiries'); if (!$D || $insee === '' || !isset($D['c'][$insee])) { return null; }
    return cc_arms_row($insee, $D['c'][$insee], $D);
}
/** une commune de l'armorial : [nom, fichier, blasonnement, page Wikipédia de l'armorial] ; le fichier → [auteur, licence, url licence] */
function cc_arms_row(string $insee, array $r, array $D): array
{
    $file = (string) ($r[1] ?? ''); $cr = $file !== '' ? ($D['files'][$file] ?? null) : null;
    $page = (string) ($r[3] ?? ''); $c = cc_data('communes')['c'][$insee] ?? null;
    return ['insee' => $insee, 'commune' => (string) $r[0], 'dep' => cc_dep_of_insee($insee), 'dep_name' => (string) (cc_departements()[cc_dep_of_insee($insee)] ?? ''),
        'image' => $file, 'thumb' => $file !== '' ? cc_thumb($file, 200) : '', 'image_page' => $file !== '' ? cc_file_page($file) : '',
        'author' => (string) ($cr[0] ?? ''), 'licence' => (string) ($cr[1] ?? ''), 'licence_url' => (string) ($cr[2] ?? ''),
        'blazon' => (string) ($r[2] ?? ''), 'blazon_page' => $page, 'blazon_url' => $page !== '' ? 'https://fr.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $page)) : '',
        'lat' => $c[1] ?? null, 'lon' => $c[2] ?? null];
}

/* ═════════════════════ 🍲 le plat de sa région ═════════════════════ */

/** les plats liés au lieu : la commune elle-même, puis son département, puis sa région ou sa province ; au plus $max */
function cc_dishes(string $insee, string $dep, ?float $lat = null, ?float $lon = null, int $max = 6): array
{
    $D = cc_data('plats'); if (!$D || ($insee === '' && $dep === '' && $lat === null)) { return []; }
    $out = [];
    foreach ($D['rows'] as $r) {
        $rank = null;
        if ($insee !== '' && ($r['insee'] ?? '') === $insee) { $rank = 0; }
        elseif ($dep !== '' && in_array($dep, $r['deps'] ?? [], true)) { $rank = ['commune' => 1, 'dep' => 1, 'region' => 2, 'province' => 2][$r['lvl']] ?? 3; }
        elseif ($lat !== null && empty($r['deps']) && isset($r['lat']) && cplus_km($lat, (float) $lon, (float) $r['lat'], (float) $r['lon']) <= 60) { $rank = 3; }
        if ($rank === null) { continue; }
        $out[] = cc_dish_row($r) + ['rank' => $rank];
    }
    usort($out, static fn($a, $b) => [$a['rank'], $a['image'] === '' ? 1 : 0, $a['name']] <=> [$b['rank'], $b['image'] === '' ? 1 : 0, $b['name']]);
    return array_slice($out, 0, $max);
}
function cc_dish_row(array $r): array
{
    $img = (string) ($r['img'] ?? '');
    return ['qid' => $r['q'], 'name' => $r['n'], 'desc' => (string) ($r['d'] ?? ''), 'origin' => (string) ($r['o'] ?? ''), 'level' => (string) $r['lvl'], 'cuisine' => (string) ($r['cu'] ?? ''),
        'deps' => $r['deps'] ?? [], 'insee' => (string) ($r['insee'] ?? ''), 'lat' => $r['lat'] ?? null, 'lon' => $r['lon'] ?? null,
        'image' => $img, 'thumb' => $img !== '' ? cc_thumb($img, 240) : '', 'url' => 'https://www.wikidata.org/wiki/' . $r['q'], 'wp' => (string) ($r['wp'] ?? '')];
}

/* ═════════════════════ la page d'un lieu (sans réseau) ═════════════════════ */

function cc_place_info(PDO $pdo, array $q): array
{
    $p = cc_place($pdo, $q);
    if ($p['insee'] === '' && $p['dep'] === '' && $p['lat'] === null) { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Lieu introuvable : il faut une commune de France.')]; }
    return ['ok' => true, 'commune' => ['insee' => $p['insee'], 'name' => $p['commune'], 'dep' => $p['dep'], 'dep_name' => (string) (cc_departements()[$p['dep']] ?? ''), 'lat' => $p['lat'], 'lon' => $p['lon']],
        'arms' => cc_arms($p['insee']), 'works' => cc_works($p['insee']), 'dishes' => cc_dishes($p['insee'], $p['dep'], $p['lat'], $p['lon']),
        'rietstap' => cc_data('rietstap') !== null, 'sources' => cc_sources_short()];
}
function cc_sources_short(): array
{
    $o = cc_data('oeuvres'); $a = cc_data('armoiries'); $d = cc_data('plats');
    return ['works' => ['label' => 'Wikidata', 'licence' => 'CC0 1.0', 'url' => 'https://www.wikidata.org/', 'date' => (string) ($o['built'] ?? '')],
        'arms' => ['label' => i18n_t('Wikidata (image) et Wikipédia, « Armorial des communes » (blasonnement)'), 'licence' => i18n_t('images : licence propre à chaque fichier ; textes : CC BY-SA 4.0'), 'url' => 'https://fr.wikipedia.org/wiki/Armorial_des_communes_de_France', 'date' => (string) ($a['built'] ?? '')],
        'dishes' => ['label' => 'Wikidata', 'licence' => 'CC0 1.0', 'url' => 'https://www.wikidata.org/', 'date' => (string) ($d['built'] ?? '')]];
}

/* ═════════════════════ 📜 origine du nom et histoire (Wikipédia, en ligne) ═════════════════════ */

/** l'article Wikipédia (fr) de la commune : par Wikidata (sitelinks), la commune trouvée comme « Autour du village » */
function cc_article(array $p, bool $fresh = false): array
{
    $c = cplus_commune($p, $fresh);
    if (empty($c['ok'])) { return $c; }
    $r = cc_cached('article', $c['qid'], static function () use ($c) {
        $j = cplus_wd('wd_sitelinks.json', ['action' => 'wbgetentities', 'ids' => $c['qid'], 'props' => 'sitelinks', 'sitefilter' => 'frwiki']);
        $t = (string) ($j['entities'][$c['qid']]['sitelinks']['frwiki']['title'] ?? '');
        return $t === '' ? ['ok' => false, 'none' => true, 'message' => i18n_t('Pas d’article Wikipédia en français pour cette commune.')] : ['ok' => true, 'title' => $t];
    }, $fresh);
    return $r + ['commune' => $c];
}
/** le texte lisible d'un morceau d'article : paragraphes et listes, sans notes, tableaux, images ni modèles cachés */
function cc_plain(string $html): array
{
    $html = (string) preg_replace('#<(table|figure|style|script|sup)\b[^>]*>.*?</\1>#is', '', $html);
    $html = (string) preg_replace('#<(ol|ul)\b[^>]*class="[^"]*(references|gallery)[^"]*"[^>]*>.*?</\1>#is', '', $html);
    $html = (string) preg_replace('#<li\b[^>]*class="[^"]*gallerybox[^"]*".*?</li>#is', '', $html);
    $html = (string) preg_replace('#<span class="mw-editsection">.*?</span></span>#is', '', $html);
    $out = [];
    if (preg_match_all('#<(h[3-5]|p|li|dd)\b[^>]*>(.*?)</\1>#is', $html, $m, PREG_SET_ORDER)) {
        foreach ($m as $x) {
            $t = html_entity_decode(strip_tags($x[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $t = trim((string) preg_replace(['/\[\s*(\d+|[a-z]|réf\.? nécessaire|Quoi \?|Lequel \?|Par qui \?)\s*\]/u', '/\s+/u'], ['', ' '], $t));
            if ($t === '' || mb_strlen($t) < 3) { continue; }
            $out[] = ['t' => str_starts_with(strtolower($x[1]), 'h') ? 'h' : 'p', 'x' => $t];
        }
    }
    return $out;
}
function cc_cut(array $paras, int $max): array
{
    $out = []; $n = 0;
    foreach ($paras as $p) {
        if ($p['t'] === 'h' && $n >= $max * 0.6) { break; }
        $len = mb_strlen($p['x']);
        if ($n + $len > $max) {
            if ($p['t'] === 'p' && $n < $max * 0.5) { $cut = mb_substr($p['x'], 0, $max - $n); $dot = mb_strrpos($cut, '. '); $out[] = ['t' => 'p', 'x' => ($dot > 80 ? mb_substr($cut, 0, $dot + 1) : rtrim($cut) . '…')]; }
            break;
        }
        $out[] = $p; $n += $len;
    }
    return $out;
}

function cc_wiki(PDO $pdo, array $q): array
{
    $p = cc_place($pdo, $q);
    if ($p['name'] === '' && $p['insee'] === '' && $p['qid'] === '') { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Choisis une commune.')]; }
    $fresh = !empty($q['fresh']);
    $a = cc_article($p, $fresh);
    if (empty($a['ok'])) { return $a; }
    $title = $a['title'];
    $r = cc_cached('wiki', $title, static function () use ($title) {
        $s = cc_wp('wp_sections.json', ['action' => 'parse', 'page' => $title, 'prop' => 'sections|revid', 'redirects' => 1]);
        $secs = $s['parse']['sections'] ?? []; $revid = (int) ($s['parse']['revid'] ?? 0); $page = (string) ($s['parse']['title'] ?? $title);
        $find = static function (string $re) use ($secs) {
            foreach ($secs as $x) { if ((int) ($x['toclevel'] ?? 9) <= 2 && preg_match($re, trim(strip_tags((string) ($x['line'] ?? ''))))) { return $x; } }
            return null;
        };
        $out = ['ok' => true, 'title' => $page, 'revid' => $revid, 'url' => 'https://fr.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $page)),
            'history_url' => 'https://fr.wikipedia.org/w/index.php?title=' . rawurlencode(str_replace(' ', '_', $page)) . '&action=history'];
        foreach (['toponymie' => '/^(toponymie|étymologie|origine du nom|nom de la commune)/iu', 'histoire' => '/^histoire\b/iu'] as $k => $re) {
            $sec = $find($re); if (!$sec) { continue; }
            $t = cc_wp('wp_' . $k . '.json', ['action' => 'parse', 'page' => $page, 'prop' => 'text', 'section' => (int) $sec['index'], 'disableeditsection' => 1, 'disabletoc' => 1]);
            $paras = cc_plain((string) ($t['parse']['text'] ?? ''));
            if (!$paras) { continue; }
            // les sous-titres (« Préhistoire », « Moyen Âge »…) : pour « ▸ plus »
            $out[$k] = ['heading' => trim(strip_tags((string) $sec['line'])), 'anchor' => (string) ($sec['anchor'] ?? ''), 'lead' => cc_cut(array_values(array_filter($paras, static fn($x) => $x['t'] === 'p')), $k === 'toponymie' ? 700 : 600),
                'more' => cc_cut($paras, 4000), 'chars' => array_sum(array_map(static fn($x) => mb_strlen($x['x']), $paras)),
                'url' => 'https://fr.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $page)) . '#' . rawurlencode((string) ($sec['anchor'] ?? ''))];
        }
        if (!isset($out['toponymie']) && !isset($out['histoire'])) { return ['ok' => true, 'empty' => true, 'title' => $page, 'url' => $out['url']]; }
        return $out;
    }, $fresh);
    return $r + ['source' => ['label' => i18n_t('Wikipédia, article « {t} »', ['t' => $title]), 'licence' => CC_WP_LICENCE['label'], 'licence_url' => CC_WP_LICENCE['url'],
        'authors' => i18n_t('les contributeurs de Wikipédia'), 'url' => 'https://fr.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $title))], 'commune' => $a['commune']];
}

/* ═════════════════════ 🏷️ rues à son nom (Base Adresse Nationale, en ligne) ═════════════════════ */

/** les voies et lieux-dits de France dont le nom contient le nom de famille (mot entier) ; avec le prénom : « Rue Jean Mazaud » */
function cc_rues_search(string $last, string $first = '', bool $fresh = false): array
{
    $last = trim((string) preg_replace('/\s+/u', ' ', $last)); $first = trim((string) preg_replace('/\s+/u', ' ', $first));
    if (mb_strlen($last) < 3) { return ['ok' => false, 'message' => i18n_t('Il faut un nom de famille d’au moins 3 lettres.')]; }
    $key = cc_fold($last) . '|' . cc_fold($first);
    return cc_cached('rues', $key, static function () use ($last, $first) {
        $q = trim(($first !== '' ? $first . ' ' : '') . $last);
        $step = 'ban_' . substr(sha1(cc_fold($q)), 0, 10) . '.json';
        $j = cc_json($step, 'https://api-adresse.data.gouv.fr/search/?' . http_build_query(['q' => $q, 'type' => 'street', 'limit' => 50, 'autocomplete' => 0]));
        $L = cc_fold($last); $F = $first !== '' ? cc_fold(explode(' ', $first)[0]) : '';
        $items = []; $seen = [];
        foreach ($j['features'] ?? [] as $f) {
            $pr = $f['properties'] ?? []; $name = (string) ($pr['name'] ?? ''); $n = ' ' . cc_fold($name) . ' ';
            if (!str_contains($n, ' ' . $L . ' ')) { continue; }
            if ($F !== '' && !str_contains($n, ' ' . $F . ' ')) { continue; }
            $k = cc_fold($name) . '|' . ($pr['citycode'] ?? '');
            if (isset($seen[$k])) { continue; } $seen[$k] = true;
            $co = $f['geometry']['coordinates'] ?? [null, null];
            $kind = preg_match('/^(rue|avenue|boulevard|place|impasse|allée|allee|chemin|route|square|quai|cours|passage|sentier|voie|ruelle|esplanade|rond[- ]point|cité|cite|résidence|residence|parc|promenade|square|carrefour|traverse|montée|montee)\b/iu', $name) ? 'voie' : 'lieu';
            $items[] = ['name' => $name, 'city' => (string) ($pr['city'] ?? ''), 'insee' => (string) ($pr['citycode'] ?? ''), 'postcode' => (string) ($pr['postcode'] ?? ''), 'context' => (string) ($pr['context'] ?? ''),
                'kind' => $kind, 'lat' => isset($co[1]) ? (float) $co[1] : null, 'lon' => isset($co[0]) ? (float) $co[0] : null, 'first' => $F !== '' && str_contains($n, ' ' . $F . ' '),
                'map' => isset($co[1]) ? sprintf('https://www.openstreetmap.org/?mlat=%.5F&mlon=%.5F#map=16/%.5F/%.5F', $co[1], $co[0], $co[1], $co[0]) : ''];
        }
        usort($items, static fn($a, $b) => [$a['kind'] === 'voie' ? 0 : 1, $a['city']] <=> [$b['kind'] === 'voie' ? 0 : 1, $b['city']]);
        return ['ok' => true, 'items' => $items, 'capped' => count($j['features'] ?? []) >= 50, 'query' => $q, 'source' => CC_BAN];
    }, $fresh);
}
function cc_rues(PDO $pdo, array $q): array
{
    $fresh = !empty($q['fresh']);
    $pid = safe_int($q['id'] ?? ($q['person_id'] ?? 0));
    if ($pid) {
        $P = cc_person_data($pdo, $pid);
        if ($P['private']) { return ['ok' => false, 'private' => true, 'message' => i18n_t('Fiche confidentielle : son nom n’est pas envoyé sur Internet.')]; }
        $r = cc_rues_search($P['last'], '', $fresh);
        if (empty($r['ok'])) { return $r; }
        // « une rue porte peut-être le nom de ton ancêtre » : prénom + nom dans une commune de sa vie
        $mine = [];
        if ($P['first'] !== '') {
            $rf = cc_rues_search($P['last'], $P['first'], $fresh);
            foreach ($rf['items'] ?? [] as $it) { if ($it['first'] && in_array($it['insee'], $P['insees'], true)) { $mine[] = $it; } }
        }
        foreach ($r['items'] as &$it) { $it['his'] = in_array($it['insee'], $P['insees'], true); }
        unset($it);
        return $r + ['name' => $P['last'], 'first' => $P['first'], 'ancestor' => $mine];
    }
    return cc_rues_search(trim(safe_text($q['name'] ?? ($q['last'] ?? ''))), trim(safe_text($q['first'] ?? '')), $fresh);
}

/* ═════════════════════ la fiche d'une personne (sans réseau, sauf les rues) ═════════════════════ */

function cc_person_data(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, is_private, living_status FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new LcndaBadInput('Fiche introuvable.'); }
    $ev = $pdo->prepare("SELECT e.year, COALESCE(t.gedcom_tag,'') AS tag, pl.id AS place_id, COALESCE(pl.name,'') AS name, COALESCE(pl.county,'') AS county, COALESCE(pl.country,'') AS country,
        COALESCE(pl.admin4_code,'') AS insee, pl.latitude AS lat, pl.longitude AS lon FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? ORDER BY COALESCE(e.year, 9999)");
    $ev->execute([$pid]);
    $places = []; $insees = [];
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $insee = preg_match('/^\d[\dAB]\d{3}$/', (string) $e['insee']) ? (string) $e['insee'] : '';
        $lat = is_numeric($e['lat']) ? (float) $e['lat'] : null; $lon = is_numeric($e['lon']) ? (float) $e['lon'] : null;
        $name = trim((string) preg_replace('/\s*[,(].*$/u', '', (string) $e['name']));
        if ($insee === '') { $insee = cc_find_insee($name, (string) $e['county'], $lat, $lon, (string) $e['country']); }
        $dep = $insee !== '' ? cc_dep_of_insee($insee) : cc_dep_of_name((string) $e['county']);
        if ($insee === '' && $dep === '') { continue; }
        $k = $insee !== '' ? $insee : 'd' . $dep;
        if (!isset($places[$k])) { $places[$k] = ['insee' => $insee, 'dep' => $dep, 'name' => $name, 'lat' => $lat, 'lon' => $lon, 'tags' => [], 'year' => (int) $e['year']]; }
        $places[$k]['tags'][] = (string) $e['tag'];
        if ($insee !== '') { $insees[] = $insee; }
    }
    return ['id' => $pid, 'first' => trim(explode(' ', trim((string) $p['first_name']))[0] ?? ''), 'last' => trim((string) $p['last_name']), 'places' => array_values($places),
        'insees' => array_values(array_unique($insees)), 'private' => (int) $p['is_private'] === 1 || (string) $p['living_status'] === 'living'];
}

function cc_person(PDO $pdo, array $q): array
{
    $P = cc_person_data($pdo, safe_int($q['id'] ?? ($q['person_id'] ?? 0)));
    $out = ['ok' => true, 'id' => $P['id'], 'first' => $P['first'], 'last' => $P['last'], 'private' => $P['private']];
    // 🍲 le plat de sa région : là où il est né (sinon le premier lieu connu)
    $home = null;
    foreach ($P['places'] as $pl) { if (array_intersect($pl['tags'], ['BIRT', 'BAPM', 'CHR'])) { $home = $pl; break; } }
    $home = $home ?: ($P['places'][0] ?? null);
    if ($home) {
        $d = cc_dishes($home['insee'], $home['dep'], $home['lat'], $home['lon'], 4);
        if ($d) { $out['dishes'] = ['place' => $home['name'], 'dep' => $home['dep'], 'dep_name' => (string) (cc_departements()[$home['dep']] ?? ''), 'items' => $d]; }
    }
    // 🎬 ses villages dans les œuvres
    $works = [];
    foreach ($P['places'] as $pl) { if ($pl['insee'] !== '') { foreach (cc_works($pl['insee']) as $w) { $works[$w['qid'] . '|' . $pl['insee']] = $w + ['place' => $pl['name']]; } } }
    if ($works) { $out['works'] = array_values($works); }
    // 🛡️ les armoiries de ses communes
    $arms = [];
    foreach ($P['places'] as $pl) { if ($pl['insee'] !== '' && ($a = cc_arms($pl['insee']))) { $arms[$pl['insee']] = $a; } }
    if ($arms) { $out['arms'] = array_values($arms); }
    // 🛡️ un blason à son nom (Rietstap) — seulement si la transcription est livrée
    if (($R = cc_rietstap_lookup($P['last'])) !== null && $R) { $out['rietstap'] = $R; }
    $out['places'] = $P['places'];
    return $out;
}

/* ═════════════════════ 🛡️ Rietstap (seulement si une transcription libre est livrée) ═════════════════════ */

/** null = pas de données livrées ; [] = rien pour ce nom */
function cc_rietstap_lookup(string $last): ?array
{
    $D = cc_data('rietstap'); if ($D === null) { return null; }
    $k = cc_fold($last); if ($k === '') { return []; }
    return array_values(array_map(static fn($r) => ['name' => $r[0], 'where' => (string) ($r[1] ?? ''), 'blazon' => (string) ($r[2] ?? ''), 'page' => (string) ($r[3] ?? '')], $D['n'][$k] ?? []));
}

/* ═════════════════════ 🧰 les listes (Listes → Données) ═════════════════════ */

function cc_list(PDO $pdo, array $q): array
{
    $kind = (string) ($q['kind'] ?? '');
    if ($kind === 'oeuvres') {
        $D = cc_data('oeuvres'); if (!$D) { return ['ok' => true, 'rows' => []]; }
        return ['ok' => true, 'rows' => array_map(static fn($r) => cc_work_row($r, $D), $D['rows']), 'built' => (string) ($D['built'] ?? '')];
    }
    if ($kind === 'armoiries') {
        $D = cc_data('armoiries'); if (!$D) { return ['ok' => true, 'rows' => []]; }
        $rows = []; foreach ($D['c'] as $insee => $r) { $rows[] = cc_arms_row((string) $insee, $r, $D); }
        return ['ok' => true, 'rows' => $rows, 'built' => (string) ($D['built'] ?? '')];
    }
    if ($kind === 'plats') {
        $D = cc_data('plats'); if (!$D) { return ['ok' => true, 'rows' => []]; }
        $dn = cc_departements();
        return ['ok' => true, 'rows' => array_map(static fn($r) => cc_dish_row($r) + ['dep_names' => implode(', ', array_map(static fn($d) => (string) ($dn[$d] ?? $d), $r['deps'] ?? []))], $D['rows']), 'built' => (string) ($D['built'] ?? '')];
    }
    if ($kind === 'rues') {
        // les noms de famille les plus portés de la généalogie (jamais ceux des fiches confidentielles ou des vivants seuls)
        $rows = [];
        $names = $pdo->query("SELECT last_name, COUNT(*) n FROM persons WHERE TRIM(COALESCE(last_name,''))<>'' AND COALESCE(is_private,0)=0 AND COALESCE(living_status,'')<>'living' GROUP BY UPPER(last_name) ORDER BY n DESC LIMIT " . max(1, min(30, safe_int($q['n'] ?? 12) ?: 12)))->fetchAll(PDO::FETCH_ASSOC);
        $off = false;
        foreach ($names as $r) {
            $x = cc_rues_search((string) $r['last_name']);
            if (!empty($x['offline'])) { $off = true; continue; }
            foreach ($x['items'] ?? [] as $it) { $rows[] = $it + ['surname' => mb_strtoupper((string) $r['last_name']), 'kind_label' => $it['kind'] === 'voie' ? i18n_t('rue') : i18n_t('lieu-dit')]; }
        }
        return ['ok' => true, 'rows' => $rows, 'offline' => $off];
    }
    if ($kind === 'rietstap') {
        if (cc_data('rietstap') === null) { return ['ok' => true, 'rows' => [], 'missing' => true]; }
        $rows = [];
        foreach ($pdo->query("SELECT last_name, COUNT(*) n FROM persons WHERE TRIM(COALESCE(last_name,''))<>'' GROUP BY last_name ORDER BY n DESC LIMIT 400") as $r) {
            foreach (cc_rietstap_lookup((string) $r['last_name']) ?? [] as $x) { $rows[] = $x + ['surname' => (string) $r['last_name'], 'people' => (int) $r['n']]; }
        }
        return ['ok' => true, 'rows' => $rows];
    }
    throw new LcndaBadInput('Liste inconnue.');
}

/* ═════════════════════ réglages : gardé sur l'ordinateur, à propos ═════════════════════ */

function cc_cache_info(): array
{
    $n = 0; $b = 0;
    foreach (glob(cc_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); }
    return ['count' => $n, 'bytes' => $b];
}
function cc_cache_clear(): array
{
    $dir = cc_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $d) { @rmdir($d); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function cc_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = cc_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}
function cc_about(): array
{
    $size = static function (string $n) { $f = cc_data_file($n); return is_file($f) ? (int) filesize($f) : 0; };
    $count = static function (string $n, string $k) { $d = cc_data($n); return $d ? count($d[$k] ?? []) : 0; };
    return ['ok' => true, 'cache' => cc_cache_info(), 'sources' => [
        ['id' => 'oeuvres', 'label' => 'Wikidata', 'what' => i18n_t('Films tournés dans la commune, œuvres qui s’y passent ou qui en parlent'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing', 'count' => $count('oeuvres', 'rows'), 'bytes' => $size('oeuvres')],
        ['id' => 'armoiries', 'label' => i18n_t('Wikidata et Wikimedia Commons'), 'what' => i18n_t('Armoiries des communes (images)'), 'licence' => i18n_t('licence propre à chaque image (souvent CC BY-SA)'), 'mention' => i18n_t('auteur et licence sous chaque image'), 'url' => 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia', 'count' => $count('armoiries', 'c'), 'bytes' => $size('armoiries')],
        ['id' => 'armorial', 'label' => i18n_t('Wikipédia (français), pages « Armorial des communes de … »'), 'what' => i18n_t('Blasonnement des armoiries'), 'licence' => 'CC BY-SA 4.0', 'mention' => i18n_t('les contributeurs de Wikipédia'), 'url' => 'https://fr.wikipedia.org/wiki/Armorial_des_communes_de_France'],
        ['id' => 'plats', 'label' => 'Wikidata', 'what' => i18n_t('Plats et produits d’une région'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing', 'count' => $count('plats', 'rows'), 'bytes' => $size('plats')],
        ['id' => 'communes', 'label' => 'Wikidata', 'what' => i18n_t('Communes de France (code INSEE, position)'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing', 'count' => $count('communes', 'c'), 'bytes' => $size('communes')],
        ['id' => 'wikipedia', 'label' => i18n_t('Wikipédia (français), en ligne'), 'what' => i18n_t('Origine du nom et histoire de la commune'), 'licence' => 'CC BY-SA 4.0', 'mention' => i18n_t('les contributeurs de Wikipédia, lien vers l’article'), 'url' => 'https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia', 'online' => true],
        ['id' => 'ban', 'label' => i18n_t('Base Adresse Nationale, en ligne'), 'what' => i18n_t('Rues et lieux-dits qui portent un nom de famille'), 'licence' => 'Licence Ouverte 2.0', 'mention' => 'Base Adresse Nationale (BAN)', 'url' => 'https://adresse.data.gouv.fr/', 'online' => true],
    ], 'rietstap' => cc_data('rietstap') !== null,
        'rietstap_note' => i18n_t('L’Armorial général de Rietstap (1884-1887) est dans le domaine public, mais aucune transcription libre lisible par l’ordinateur n’a été trouvée (seulement des images des pages) : cette partie n’est pas encore là.')];
}

/* ═════════════════════ les points d'entrée (api.php) ═════════════════════ */

function cc_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'cc_place' => cc_place_info($pdo, $q),
        'cc_wiki' => cc_wiki($pdo, $q),
        'cc_person' => cc_person($pdo, $q),
        'cc_rues' => cc_rues($pdo, $q),
        'cc_list' => cc_list($pdo, $q),
        'cc_about' => cc_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function cc_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'cc_cache_clear' => cc_cache_clear(),
        'cc_cache_restore' => cc_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
