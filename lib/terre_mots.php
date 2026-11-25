<?php
declare(strict_types=1);

/**
 * 🪨🏚️🍎☀️🗣️🏷️💬📏🐺🔍🎉🌟👥 Terre et mots du village — le sol, les noms, les mots, les fêtes et les histoires du pays d'une
 * personne ou d'une commune. Écran : assets/js/heritage-terre-mots.js (style : assets/css/terre-mots.css).
 *
 * Données DANS l'app (assets/data/tm-*.json.gz, refaites par scripts/terre-mots/) :
 *  - tm-sol       🪨 la roche sous la commune (carte géologique BRGM 1/1 000 000 via EGDI/OneGeology, CC BY 4.0) et l'altitude
 *                    de son centre (IGN, Licence Ouverte 2.0) ; tm-roches : une phrase de Wikipédia (CC BY-SA 4.0) par roche ;
 *  - tm-noms      🗣️ le nom en langue régionale et 🏷️ le nom des habitants (Wikidata, CC0) ;
 *  - tm-disparus  🏚️ villages abandonnés, détruits, engloutis, anciennes communes réunies (Wikidata) ;
 *  - tm-fruits    🍎 variétés fruitières venues d'un lieu de France (Wikidata) ; tm-cadrans ☀️ cadrans solaires (Wikidata) ;
 *  - tm-legendes  🐺, tm-affaires 🔍, tm-fetes 🎉 (Wikidata) ; tm-ciel 🌟 astéroïdes nommés (NASA/JPL) et cultivars nommés d'après ;
 *  - tm-mots      💬 mots du français régional (Wiktionnaire, CC BY-SA 4.0) ; tm-mesures 📏 mesures de pays (Wikipédia).
 * EN LIGNE, à la demande, gardé (dossier « cache/terre-mots ») : 👥 homonymes célèbres (Wikidata, prénom + nom, jamais pour une fiche
 * confidentielle ou une personne vivante) ; 🌟 la citation d'un astéroïde qui porte son nom (JPL).
 *  - GET tm_place&place_id=|insee=|name=&lat=&lon=  · GET tm_person&id=  · GET tm_homonymes&id=  · GET tm_asteroid&num=
 *  - GET tm_list&kind=…  · GET tm_about  · POST tm_cache_clear / tm_cache_restore {token}
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_TM_DIR (un fichier <étape>.json par appel ; absent = hors ligne).
 */

require_once __DIR__ . '/commune_culture.php';

const TM_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const TM_HOSTS = ['query.wikidata.org', 'ssd-api.jpl.nasa.gov'];
const TM_TTL = ['homonymes' => 180 * 86400, 'asteroid' => 365 * 86400];
const TM_FAMILIES = [
    'granite' => ['granite', 'du granite'], 'volcan' => ['roche volcanique', 'de la roche volcanique (basalte, trachyte…)'], 'gabbro' => ['roche sombre (gabbro, serpentine…)', 'de la roche sombre (gabbro, serpentine…)'],
    'gneiss' => ['gneiss', 'du gneiss'], 'schiste' => ['schiste', 'du schiste'], 'marbre' => ['marbre', 'du marbre'], 'quartzite' => ['quartzite', 'du quartzite'],
    'calcaire' => ['calcaire', 'du calcaire'], 'dolomie' => ['dolomie', 'de la dolomie'], 'craie' => ['craie', 'de la craie'], 'gres' => ['grès', 'du grès'],
    'conglomerat' => ['poudingue (conglomérat)', 'du poudingue (galets soudés)'], 'argile' => ['argile et marne', 'de l’argile ou de la marne'], 'limon' => ['limon', 'du limon'],
    'sable' => ['sables, graviers et alluvions', 'des sables, graviers et alluvions'], 'tourbe' => ['tourbe', 'de la tourbe'], 'gypse' => ['gypse', 'du gypse'],
];

/* ═════════════════════ données, cache, réseau ═════════════════════ */

function tm_data_file(string $name): string { return APP_ROOT . '/assets/data/tm-' . $name . '.json.gz'; }
function tm_data(string $name): ?array
{
    static $memo = [];
    if (array_key_exists($name, $memo)) { return $memo[$name]; }
    $f = tm_data_file($name);
    $j = is_file($f) ? json_decode((string) @gzdecode((string) file_get_contents($f)), true) : null;
    return $memo[$name] = is_array($j) ? $j : null;
}
/** les lignes d'un fichier « keys + rows » en tableaux associatifs (gardées en mémoire) */
function tm_rows(string $name, string $rk = 'rows', string $kk = 'keys'): array
{
    static $memo = [];
    $id = "$name/$rk";
    if (isset($memo[$id])) { return $memo[$id]; }
    $D = tm_data($name); if (!$D) { return $memo[$id] = []; }
    $K = $D[$kk] ?? [];
    return $memo[$id] = array_map(static fn($r) => array_combine($K, $r), $D[$rk] ?? []);
}
function tm_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir())), '/') . '/cache/terre-mots';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function tm_cached(string $kind, string $key, callable $make, bool $fresh = false): array
{
    $key = $kind . ':' . $key;
    $f = tm_cache_dir() . '/' . sha1($key) . '.json';
    $c = null;
    if (is_file($f)) { $j = json_decode((string) @file_get_contents($f), true); if (is_array($j) && isset($j['data'])) { $c = $j; } }
    if ($c && !$fresh && (int) $c['at'] > time() - (TM_TTL[$kind] ?? 30 * 86400)) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    try { $data = $make(); }
    catch (Throwable $e) {
        if ($c) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    @file_put_contents(tm_cache_dir(true) . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $data + ['cached' => false, 'fetched_at' => time()];
}
function tm_http(string $step, string $url): array
{
    $step = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
    $dir = (string) getenv('LCNDA_TEST_TM_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        if (!is_file($dir . '/' . $step)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        $j = json_decode((string) file_get_contents($dir . '/' . $step), true);
        return is_array($j) ? $j : [];
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), TM_HOSTS, true)) { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => TM_UA, CURLOPT_HTTPHEADER => ['Accept: application/json, application/sparql-results+json'],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too) { $body .= $chunk; if (strlen($body) > 3_000_000) { $too = true; return 0; } return strlen($chunk); }]
        + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
    if ($code === 429 || $code >= 500) { throw new RuntimeException(i18n_t('Le site est très demandé en ce moment : réessaie dans une minute.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    $j = json_decode($body, true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    return $j;
}

/* ═════════════════════ petits outils ═════════════════════ */

const TM_WD = ['label' => 'Wikidata', 'licence' => 'CC0 1.0', 'url' => 'https://www.wikidata.org/'];
function tm_wd(string $q): string { return 'https://www.wikidata.org/wiki/' . $q; }
function tm_wp(string $t): string { return $t === '' ? '' : 'https://fr.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $t)); }
function tm_centre(string $insee): array { $c = $insee !== '' ? (cc_data('communes')['c'][$insee] ?? null) : null; return $c ? [(float) $c[1], (float) $c[2], (string) $c[0]] : [null, null, '']; }
function tm_commune_name(string $insee): string { return tm_centre($insee)[2]; }
function tm_dep_name(string $dep): string { return (string) (cc_departements()[$dep] ?? ''); }
/** une ligne de Wikidata, prête à afficher : lien, image, commune */
function tm_item(array $r): array
{
    $insee = (string) ($r['insee'] ?? '');
    $img = (string) ($r['img'] ?? '');
    return $r + ['url' => tm_wd((string) $r['q']), 'wp_url' => tm_wp((string) ($r['wp'] ?? '')), 'commune' => tm_commune_name($insee), 'dep' => (string) (($r['dep'] ?? '') ?: cc_dep_of_insee($insee)),
        'dep_name' => tm_dep_name((string) (($r['dep'] ?? '') ?: cc_dep_of_insee($insee))), 'thumb' => $img !== '' ? cc_thumb($img, 240) : '', 'image_page' => $img !== '' ? cc_file_page($img) : ''];
}

/* ═════════════════════ 🪨 le sol et le relief ═════════════════════ */

function tm_sol(string $insee): ?array
{
    $D = tm_data('sol'); $r = $D['c'][$insee] ?? null;
    if (!$D || !$r) { return null; }
    $F = $D['families'];
    $fam = $r[0] !== null ? (string) $F[$r[0]] : ''; $fam2 = $r[1] !== null ? (string) $F[$r[1]] : '';
    $R = [];
    foreach (tm_rows('roches') as $x) { $R[$x['fam']] = $x; }
    $txt = $fam !== '' ? ($R[$fam] ?? null) : null;
    $A = $D['attr'];
    return ['insee' => $insee, 'commune' => tm_commune_name($insee), 'rock' => $fam, 'rock_label' => TM_FAMILIES[$fam][0] ?? '', 'rock_phrase' => TM_FAMILIES[$fam][1] ?? '',
        'rock2' => $fam2, 'rock2_label' => TM_FAMILIES[$fam2][0] ?? '', 'alt' => $r[2],
        'text' => $txt ? ['sentence' => $txt['sentence'], 'title' => $txt['page'], 'url' => tm_wp((string) $txt['page'])] : null,
        'source' => ['rock' => $A['rock'], 'rock_licence' => $A['rock_licence'], 'rock_url' => $A['rock_url'], 'alt' => $A['alt'], 'alt_licence' => $A['alt_licence'], 'alt_url' => $A['alt_url'],
            'map' => 'https://infoterre.brgm.fr/', 'geoportail' => ($c = tm_centre($insee))[0] !== null ? 'https://www.geoportail.gouv.fr/carte?c=' . $c[1] . ',' . $c[0] . '&z=13&permalink=yes' : '']];
}

/* ═════════════════════ 🗣️ nom régional, 🏷️ gentilé ═════════════════════ */

function tm_noms(string $insee): ?array
{
    $D = tm_data('noms'); $r = $D['c'][$insee] ?? null;
    if (!$r) { return null; }
    $L = $D['langs'] ?? [];
    $names = []; foreach (($r['n'] ?? []) as $l => $v) { $names[] = ['lang' => $l, 'lang_label' => (string) ($L[$l] ?? $l), 'name' => (string) $v]; }
    $g = array_map(static fn($x) => ['name' => (string) $x[0], 'gender' => (string) $x[1]], $r['g'] ?? []);
    usort($g, static fn($a, $b) => [$a['gender'] === 'f' ? 1 : 0] <=> [$b['gender'] === 'f' ? 1 : 0]);
    return ['insee' => $insee, 'commune' => tm_commune_name($insee), 'regional' => $names, 'gentiles' => $g, 'url' => isset($r['q']) ? tm_wd((string) $r['q']) : ''];
}

/* ═════════════════════ 🏚️ disparus, ☀️ cadrans, 🍎 fruits, 🎉 fêtes (par commune) ═════════════════════ */

function tm_in_commune(string $name, string $insee): array
{
    if ($insee === '') { return []; }
    $out = [];
    foreach (tm_rows($name) as $r) { if (($r['insee'] ?? '') === $insee) { $out[] = tm_item($r); } }
    return $out;
}
function tm_disparus(string $insee): array
{
    $rows = tm_in_commune('disparus', $insee);
    usort($rows, static fn($a, $b) => [$a['k'] === 'reunie' ? 1 : 0, $a['e'] ?? 9999, $a['n']] <=> [$b['k'] === 'reunie' ? 1 : 0, $b['e'] ?? 9999, $b['n']]);
    return $rows;
}
/** la commune elle-même a disparu (réunie à une autre, abandonnée) : la ligne dont le code INSEE propre est celui-ci, ou du même nom */
function tm_vanished(string $insee, string $name): ?array
{
    $f = cc_fold($name);
    foreach (tm_rows('disparus') as $r) {
        if (($insee !== '' && ($r['own'] ?? '') === $insee && ($r['k'] !== 'reunie' || ($r['insee'] ?? '') !== $insee)) || ($f !== '' && cc_fold((string) $r['n']) === $f && ($insee === '' || ($r['insee'] ?? '') === $insee))) { return tm_item($r); }
    }
    return null;
}
function tm_fruits(string $insee, string $dep): array
{
    $out = [];
    foreach (tm_rows('fruits') as $r) {
        $rank = ($insee !== '' && ($r['insee'] ?? '') === $insee) ? 0 : (($dep !== '' && ($r['dep'] ?? '') === $dep) ? 1 : null);
        if ($rank !== null) { $out[] = tm_item($r) + ['rank' => $rank]; }
    }
    usort($out, static fn($a, $b) => [$a['rank'], $a['img'] ? 0 : 1, $a['n']] <=> [$b['rank'], $b['img'] ? 0 : 1, $b['n']]);
    return $out;
}
/** légendes ou affaires autour d'un point (km), triées par distance */
function tm_near(string $name, ?float $lat, ?float $lon, float $km, string $insee = ''): array
{
    if ($lat === null && $insee === '') { return []; }
    $out = [];
    foreach (tm_rows($name) as $r) {
        $d = null;
        if ($insee !== '' && ($r['insee'] ?? '') === $insee) { $d = 0.0; }
        elseif ($lat !== null && isset($r['lat'])) { $d = cplus_km($lat, (float) $lon, (float) $r['lat'], (float) $r['lon']); }
        if ($d !== null && $d <= $km) { $out[] = tm_item($r) + ['km' => round($d, 1)]; }
    }
    usort($out, static fn($a, $b) => [$a['km'], $a['s'] ?? 9999] <=> [$b['km'], $b['s'] ?? 9999]);
    return $out;
}

/* ═════════════════════ 💬 mots du coin, 📏 mesures ═════════════════════ */

/** la catégorie de mots la plus précise pour un département (ou un pays : BE, CH, LU) */
function tm_mots(string $dep, int $max = 6): ?array
{
    $D = tm_data('mots'); if (!$D || $dep === '') { return null; }
    $best = null;
    foreach ($D['cats'] as $c) { if (in_array($dep, $c['where'], true) && ($best === null || count($c['where']) < count($best['where']))) { $best = $c; } }
    if (!$best) { return null; }
    $words = array_map(static fn($w) => ['word' => (string) $w[0], 'pos' => (string) $w[1], 'def' => (string) $w[2], 'url' => 'https://fr.wiktionary.org/wiki/' . rawurlencode(str_replace(' ', '_', (string) $w[0]))], $best['words']);
    // toujours les mêmes mots pour un même département, mais pas toujours les premiers de l'alphabet
    $seed = crc32($dep); usort($words, static fn($a, $b) => crc32($a['word'] . $seed) <=> crc32($b['word'] . $seed));
    $region = (string) preg_replace('/^français (de la |de l’|de |du |des |d’)/u', '', (string) $best['cat']);
    return ['cat' => $best['cat'], 'region' => $region, 'cat_url' => 'https://fr.wiktionary.org/wiki/' . rawurlencode('Catégorie:' . str_replace(' ', '_', (string) $best['cat'])), 'count' => count($words),
        'words' => array_slice($words, 0, $max), 'all' => $words, 'source' => ['label' => 'Wiktionnaire', 'licence' => 'CC BY-SA 4.0', 'url' => 'https://fr.wiktionary.org/']];
}
function tm_mesures(string $dep = ''): array
{
    $out = [];
    foreach (tm_rows('mesures') as $r) {
        if ($dep !== '' && !in_array($dep, $r['deps'], true)) { continue; }
        $out[] = $r + ['url' => tm_wp((string) $r['page']), 'dep_names' => implode(', ', array_map(static fn($d) => $d === 'BE' ? 'Belgique' : tm_dep_name((string) $d), $r['deps']))];
    }
    return $out;
}

/* ═════════════════════ 🌟 dans le ciel et les jardins ═════════════════════ */

function tm_ast_url(string $num): string { return 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=' . rawurlencode($num); }
function tm_ciel_place(string $insee, string $dep): array
{
    $D = tm_data('ciel'); if (!$D) { return ['asteroids' => [], 'cultivars' => []]; }
    $ast = [];
    foreach ($D['places'] as $p) { if (($p['kind'] === 'c' && $p['code'] === $insee) || ($p['kind'] === 'd' && $p['code'] === $dep && $insee === '')) { $ast[] = $p + ['url' => tm_ast_url((string) $p['num'])]; } }
    $cv = [];
    foreach (tm_rows('ciel', 'cultivars', 'cvkeys') as $r) { if ($insee !== '' && ($r['insee'] ?? '') === $insee) { $cv[] = $r + ['url' => tm_wd((string) $r['q']), 'wp_url' => tm_wp((string) ($r['wp'] ?? ''))]; } }
    return ['asteroids' => $ast, 'cultivars' => $cv];
}
/** un astéroïde au nom de famille (même nom ne veut pas dire même personne) */
function tm_ast_name(string $last): array
{
    $D = tm_data('ciel'); $f = cc_fold($last);
    if (!$D || mb_strlen($f) < 3) { return []; }
    $out = [];
    foreach ($D['names'] as [$num, $name]) { if (cc_fold((string) $name) === $f) { $out[] = ['num' => (string) $num, 'name' => (string) $name, 'url' => tm_ast_url((string) $num)]; } }
    return $out;
}
function tm_cv_named(string $first, string $last): array
{
    $f = cc_fold(trim($first . ' ' . $last)); if ($first === '' || mb_strlen($f) < 5) { return []; }
    $out = [];
    foreach (tm_rows('ciel', 'cultivars', 'cvkeys') as $r) { if (cc_fold((string) $r['after']) === $f) { $out[] = $r + ['url' => tm_wd((string) $r['q']), 'after_url' => tm_wd((string) $r['aq'])]; } }
    return $out;
}

/* ═════════════════════ la page d'un lieu ═════════════════════ */

function tm_place_info(PDO $pdo, array $q): array
{
    $p = cc_place($pdo, $q);
    if ($p['insee'] === '' && $p['dep'] === '' && $p['lat'] === null) { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Lieu introuvable : il faut une commune de France.')]; }
    $insee = $p['insee']; $dep = $p['dep'];
    [$la, $lo] = $insee !== '' ? tm_centre($insee) : [$p['lat'], $p['lon']];
    $la = $la ?? $p['lat']; $lo = $lo ?? $p['lon'];
    return ['ok' => true, 'commune' => ['insee' => $insee, 'name' => $p['commune'], 'dep' => $dep, 'dep_name' => tm_dep_name($dep), 'lat' => $la, 'lon' => $lo],
        'sol' => $insee !== '' ? tm_sol($insee) : null, 'noms' => $insee !== '' ? tm_noms($insee) : null,
        'disparus' => tm_disparus($insee), 'vanished' => tm_vanished($insee, ''), 'cadrans' => tm_in_commune('cadrans', $insee),
        'fruits' => array_slice(tm_fruits($insee, $dep), 0, 30), 'fetes' => tm_near('fetes', null, null, 0, $insee),
        'legendes' => array_slice(tm_near('legendes', $la, $lo, 25, $insee), 0, 20), 'affaires' => array_slice(tm_near('affaires', $la, $lo, 10, $insee), 0, 20),
        'ciel' => tm_ciel_place($insee, $dep), 'mots' => tm_mots($dep), 'mesures' => tm_mesures($dep), 'sources' => tm_sources_short()];
}
function tm_sources_short(): array
{
    $b = static fn($n) => (string) (tm_data($n)['built'] ?? '');
    return ['wikidata' => TM_WD + ['date' => $b('noms')], 'wiktionnaire' => ['label' => 'Wiktionnaire', 'licence' => 'CC BY-SA 4.0', 'url' => 'https://fr.wiktionary.org/', 'date' => $b('mots')],
        'jpl' => ['label' => 'NASA/JPL Small-Body Database', 'licence' => i18n_t('données publiques de la NASA'), 'url' => 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html', 'date' => $b('ciel')],
        'mesures' => ['label' => i18n_t('Wikipédia (articles des mesures)'), 'licence' => 'CC BY-SA 4.0', 'url' => 'https://fr.wikipedia.org/wiki/Anciennes_unit%C3%A9s_de_mesure_fran%C3%A7aises']];
}

/* ═════════════════════ la fiche d'une personne ═════════════════════ */

function tm_person_years(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare("SELECT COALESCE(t.gedcom_tag,'') tag, e.year, COALESCE(e.title,'') title, COALESCE(e.description,'') descr FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=?");
    $s->execute([$pid]);
    $b = null; $d = null; $occ = []; $min = null; $max = null;
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $y = (int) $e['year'];
        if ($y > 0) { $min = $min === null ? $y : min($min, $y); $max = $max === null ? $y : max($max, $y); }
        if ($y > 0 && in_array($e['tag'], ['BIRT', 'BAPM', 'CHR'], true)) { $b = $b === null ? $y : min($b, $y); }
        if ($y > 0 && in_array($e['tag'], ['DEAT', 'BURI', 'CREM'], true)) { $d = $d === null ? $y : max($d, $y); }
        if ($e['tag'] === 'OCCU') { $occ[] = trim($e['title'] . ' ' . $e['descr']); }
    }
    $from = $b ?? $min; $to = $d ?? ($from !== null ? min($from + 80, (int) date('Y')) : $max);
    return ['birth' => $b, 'death' => $d, 'from' => $from, 'to' => $to, 'occupations' => array_values(array_filter($occ))];
}
function tm_person(PDO $pdo, array $q): array
{
    $pid = safe_int($q['id'] ?? ($q['person_id'] ?? 0));
    $P = cc_person_data($pdo, $pid);
    $Y = tm_person_years($pdo, $pid);
    $out = ['ok' => true, 'id' => $pid, 'first' => $P['first'], 'last' => $P['last'], 'private' => $P['private'], 'years' => $Y];
    $home = null;
    foreach ($P['places'] as $pl) { if (array_intersect($pl['tags'], ['BIRT', 'BAPM', 'CHR'])) { $home = $pl; break; } }
    $home = $home ?: ($P['places'][0] ?? null);
    $places = array_map(static function ($pl) { if ($pl['lat'] === null && $pl['insee'] !== '') { [$pl['lat'], $pl['lon']] = tm_centre($pl['insee']); } return $pl; }, $P['places']);
    if ($home) {
        if ($home['insee'] !== '' && ($s = tm_sol($home['insee']))) { $out['sol'] = $s + ['place' => $home['name']]; }
        if ($home['insee'] !== '' && ($n = tm_noms($home['insee']))) { $out['noms'] = $n + ['place' => $home['name']]; }
        if (($m = tm_mots($home['dep'], 3))) { unset($m['all']); $out['mots'] = $m + ['place' => $home['name']]; }
        // 🍎 les fruits de sa région : pour ceux qui travaillaient la terre des jardins et des vergers
        $garden = (bool) preg_grep('/jardin|arbori|pépini|pepini|maraîch|maraich|horticult|vigneron|verger|fruiti|cultivat|laboureur|agricult/iu', $Y['occupations']);
        if ($garden && ($f = tm_fruits($home['insee'], $home['dep']))) { $out['fruits'] = ['place' => $home['name'], 'dep_name' => tm_dep_name($home['dep']), 'job' => $Y['occupations'][0] ?? '', 'items' => array_slice($f, 0, 8)]; }
    }
    // 🏚️ une commune de sa vie qui n'existe plus
    $van = [];
    foreach ($places as $pl) { if (($v = tm_vanished($pl['insee'], $pl['name']))) { $van[$v['q']] = $v + ['place' => $pl['name']]; } }
    if ($van) { $out['disparus'] = array_values($van); }
    // 🎉 les fêtes de ses communes
    $fe = [];
    foreach ($places as $pl) { foreach (tm_near('fetes', null, null, 0, $pl['insee']) as $f) { $fe[$f['q']] = $f + ['place' => $pl['name']]; } }
    if ($fe) { $out['fetes'] = array_values($fe); }
    // 🐺 légendes et 🔍 affaires de son vivant, près de chez lui (jamais rattachées à lui ni à son nom)
    if ($Y['from'] !== null) {
        foreach (['legendes' => 30.0, 'affaires' => 15.0] as $k => $dist) {
            $got = [];
            foreach ($places as $pl) {
                if ($pl['lat'] === null) { continue; }
                foreach (tm_near($k, (float) $pl['lat'], (float) $pl['lon'], $dist, $pl['insee']) as $r) {
                    $s = $r['s'] ?? null; $e = $r['e'] ?? $s;
                    if ($s === null || $s > $Y['to'] || $e < $Y['from'] + ($k === 'affaires' ? 5 : 0)) { continue; }
                    if (!isset($got[$r['q']]) || $got[$r['q']]['km'] > $r['km']) { $got[$r['q']] = $r + ['place' => $pl['name'], 'age' => max(0, (int) $s - (int) $Y['from'])]; }
                }
            }
            if ($got) { $v = array_values($got); usort($v, static fn($a, $b) => [$a['km'], $a['s']] <=> [$b['km'], $b['s']]); $out[$k] = array_slice($v, 0, 6); }
        }
    }
    // 🌟 son nom dans le ciel et les jardins
    $ciel = [];
    if (($a = tm_ast_name($P['last']))) { $ciel['surname'] = $a; }
    if ($home && $home['insee'] !== '') { $cp = tm_ciel_place($home['insee'], $home['dep']); if ($cp['asteroids']) { $ciel['village'] = $cp['asteroids']; } if ($cp['cultivars']) { $ciel['village_cv'] = $cp['cultivars']; } }
    if (($c = tm_cv_named($P['first'], $P['last']))) { $ciel['namesake_cv'] = $c; }
    if ($ciel) { $out['ciel'] = $ciel; }
    $out['home'] = $home; $out['online_ok'] = !$P['private'] && $P['last'] !== '' && $P['first'] !== '';
    return $out;
}

/* ═════════════════════ 👥 homonymes célèbres (Wikidata, en ligne, gardé) ═════════════════════ */

function tm_homonymes(PDO $pdo, array $q): array
{
    $pid = safe_int($q['id'] ?? 0);
    $P = cc_person_data($pdo, $pid);
    if ($P['private']) { return ['ok' => false, 'private' => true, 'message' => i18n_t('Fiche confidentielle ou personne vivante : rien n’est envoyé sur Internet.')]; }
    $first = $P['first']; $last = $P['last'];
    if ($first === '' || mb_strlen($last) < 2) { return ['ok' => true, 'items' => []]; }
    $full = $first . ' ' . $last;
    $r = tm_cached('homonymes', cc_fold($full), static function () use ($full) {
        $sparql = 'SELECT ?p ?pLabel ?pDescription ?b ?d WHERE { SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch"; mwapi:search ' . json_encode($full, JSON_UNESCAPED_UNICODE)
            . '; mwapi:language "fr"; mwapi:limit "30". ?p wikibase:apiOutputItem mwapi:item. } ?p wdt:P31 wd:Q5 . OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d } SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }';
        $j = tm_http('homonymes_' . substr(sha1(cc_fold($full)), 0, 10) . '.json', 'https://query.wikidata.org/sparql?' . http_build_query(['query' => $sparql, 'format' => 'json']));
        $items = [];
        foreach ($j['results']['bindings'] ?? [] as $b) {
            $label = (string) ($b['pLabel']['value'] ?? '');
            if (cc_fold($label) !== cc_fold($full)) { continue; } // le même prénom et le même nom, rien de plus
            $id = basename((string) $b['p']['value']);
            $y = static fn($k) => isset($b[$k]['value']) && preg_match('/^(-?\d{1,4})-/', (string) $b[$k]['value'], $m) ? (int) $m[1] : null;
            $items[$id] = ['qid' => $id, 'label' => $label, 'desc' => (string) ($b['pDescription']['value'] ?? ''), 'birth' => $y('b'), 'death' => $y('d'), 'url' => tm_wd($id)];
        }
        $items = array_values($items);
        usort($items, static fn($a, $b) => [$a['birth'] ?? 9999] <=> [$b['birth'] ?? 9999]);
        return ['ok' => true, 'items' => array_slice($items, 0, 12)];
    }, !empty($q['fresh']));
    return $r + ['name' => $full, 'source' => TM_WD];
}

/** la citation de nommage d'un astéroïde (JPL, en ligne, gardé) */
function tm_asteroid(array $q): array
{
    $num = (string) preg_replace('/[^0-9]/', '', (string) ($q['num'] ?? ''));
    if ($num === '') { throw new LcndaBadInput('Numéro manquant.'); }
    foreach ((tm_data('ciel')['places'] ?? []) as $p) { if ((string) $p['num'] === $num) { return ['ok' => true, 'num' => $num, 'name' => $p['name'], 'citation' => $p['cit'], 'who' => $p['who'], 'date' => $p['date'], 'url' => tm_ast_url($num)]; } }
    return tm_cached('asteroid', $num, static function () use ($num) {
        $j = tm_http('jpl_' . $num . '.json', 'https://ssd-api.jpl.nasa.gov/sbdb.api?' . http_build_query(['sstr' => $num, 'discovery' => 1]));
        $d = $j['discovery'] ?? [];
        return ['ok' => true, 'num' => $num, 'name' => (string) ($d['name'] ?? ($j['object']['shortname'] ?? '')), 'citation' => (string) ($d['citation'] ?? ''), 'who' => (string) ($d['who'] ?? ''), 'date' => (string) ($d['date'] ?? ''), 'url' => tm_ast_url($num)];
    }) + ['source' => ['label' => 'NASA/JPL Small-Body Database', 'licence' => i18n_t('données publiques de la NASA'), 'url' => tm_ast_url($num)]];
}

/* ═════════════════════ 🧰 les listes ═════════════════════ */

function tm_list(PDO $pdo, array $q): array
{
    $kind = (string) ($q['kind'] ?? '');
    $dep = static fn($i) => cc_dep_of_insee((string) $i);
    $geo = static function (array $r) { if (!isset($r['lat']) && ($r['insee'] ?? '') !== '') { [$r['lat'], $r['lon']] = tm_centre((string) $r['insee']); } return $r; };
    $rows = match ($kind) {
        'disparus', 'cadrans', 'fruits', 'legendes', 'affaires', 'fetes' => array_map(static fn($r) => $geo(tm_item($r)), tm_rows($kind)),
        'sol' => (static function () {
            $D = tm_data('sol'); $out = [];
            foreach (($D['c'] ?? []) as $i => $r) { [$la, $lo, $n] = tm_centre((string) $i); $f = $r[0] !== null ? (string) $D['families'][$r[0]] : ''; $out[] = ['insee' => (string) $i, 'commune' => $n, 'dep_name' => tm_dep_name(cc_dep_of_insee((string) $i)), 'rock' => TM_FAMILIES[$f][0] ?? '', 'alt' => $r[2], 'lat' => $la, 'lon' => $lo]; }
            return $out; })(),
        'noms' => (static function () {
            $D = tm_data('noms'); $out = [];
            foreach (($D['c'] ?? []) as $i => $r) {
                [$la, $lo, $n] = tm_centre((string) $i);
                $g = implode(', ', array_map(static fn($x) => (string) $x[0], $r['g'] ?? []));
                foreach (($r['n'] ?? []) as $l => $v) { $out[] = ['insee' => (string) $i, 'commune' => $n, 'name' => (string) $v, 'lang' => (string) ($D['langs'][$l] ?? $l), 'gentile' => $g, 'dep_name' => tm_dep_name(cc_dep_of_insee((string) $i)), 'url' => isset($r['q']) ? tm_wd((string) $r['q']) : '', 'lat' => $la, 'lon' => $lo]; }
                if (empty($r['n']) && $g !== '') { $out[] = ['insee' => (string) $i, 'commune' => $n, 'name' => '', 'lang' => '', 'gentile' => $g, 'dep_name' => tm_dep_name(cc_dep_of_insee((string) $i)), 'url' => isset($r['q']) ? tm_wd((string) $r['q']) : '', 'lat' => $la, 'lon' => $lo]; }
            }
            return $out; })(),
        'mots' => (static function () {
            $out = [];
            foreach ((tm_data('mots')['cats'] ?? []) as $c) {
                $reg = (string) preg_replace('/^français (de la |de l’|de |du |des |d’)/u', '', (string) $c['cat']);
                foreach ($c['words'] as $w) { $out[] = ['word' => (string) $w[0], 'pos' => (string) $w[1], 'def' => (string) $w[2], 'region' => $reg, 'url' => 'https://fr.wiktionary.org/wiki/' . rawurlencode(str_replace(' ', '_', (string) $w[0]))]; }
            }
            return $out; })(),
        'mesures' => tm_mesures(),
        'asteroides' => array_map(static fn($p) => $p + ['url' => tm_ast_url((string) $p['num']), 'place' => $p['kind'] === 'c' ? tm_commune_name((string) $p['code']) : tm_dep_name((string) $p['code'])], tm_data('ciel')['places'] ?? []),
        'cultivars' => array_map(static fn($r) => $geo($r + ['url' => tm_wd((string) $r['q']), 'commune' => tm_commune_name((string) ($r['insee'] ?? ''))]), tm_rows('ciel', 'cultivars', 'cvkeys')),
        default => throw new LcndaBadInput('Liste inconnue.'),
    };
    return ['ok' => true, 'rows' => $rows];
}

/* ═════════════════════ réglages ═════════════════════ */

function tm_cache_info(): array { $n = 0; $b = 0; foreach (glob(tm_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); } return ['count' => $n, 'bytes' => $b]; }
function tm_cache_clear(): array
{
    $dir = tm_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $d) { @rmdir($d); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function tm_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = tm_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}
function tm_about(): array
{
    $size = static fn(string $n) => is_file(tm_data_file($n)) ? (int) filesize(tm_data_file($n)) : 0;
    $cnt = static fn(string $n, string $k = 'rows') => count(tm_data($n)[$k] ?? []);
    $wd = 'https://www.wikidata.org/wiki/Wikidata:Licensing';
    return ['ok' => true, 'cache' => tm_cache_info(), 'sources' => [
        ['id' => 'sol', 'label' => i18n_t('Carte géologique BRGM 1/1 000 000, via EGDI / OneGeology (GEOZS, Zenodo)'), 'what' => i18n_t('La roche sous chaque commune'), 'licence' => 'CC BY 4.0', 'mention' => 'BRGM, EGDI / OneGeology, GEOZS', 'url' => 'https://doi.org/10.5281/zenodo.12607973', 'count' => $cnt('sol', 'c'), 'bytes' => $size('sol')],
        ['id' => 'alt', 'label' => i18n_t('IGN, Géoplateforme (altimétrie RGE ALTI®)'), 'what' => i18n_t('L’altitude du centre de chaque commune'), 'licence' => 'Licence Ouverte 2.0', 'mention' => 'IGN', 'url' => 'https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie'],
        ['id' => 'roches', 'label' => i18n_t('Wikipédia (français)'), 'what' => i18n_t('Une phrase sur chaque roche'), 'licence' => 'CC BY-SA 4.0', 'mention' => i18n_t('les contributeurs de Wikipédia'), 'url' => 'https://fr.wikipedia.org/', 'count' => $cnt('roches'), 'bytes' => $size('roches')],
        ['id' => 'noms', 'label' => 'Wikidata', 'what' => i18n_t('Nom des habitants, nom du village en langue régionale'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => $wd, 'count' => $cnt('noms', 'c'), 'bytes' => $size('noms')],
        ['id' => 'disparus', 'label' => 'Wikidata', 'what' => i18n_t('Villages disparus, détruits, engloutis ; anciennes communes'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => $wd, 'count' => $cnt('disparus'), 'bytes' => $size('disparus')],
        ['id' => 'fruits', 'label' => 'Wikidata', 'what' => i18n_t('Variétés de fruits et de légumes d’un lieu'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => $wd, 'count' => $cnt('fruits'), 'bytes' => $size('fruits')],
        ['id' => 'cadrans', 'label' => i18n_t('Wikidata et Wikimedia Commons'), 'what' => i18n_t('Cadrans solaires (devise, image)'), 'licence' => i18n_t('CC0 1.0 ; images : licence de chaque fichier'), 'mention' => 'Wikidata', 'url' => $wd, 'count' => $cnt('cadrans'), 'bytes' => $size('cadrans')],
        ['id' => 'legendes', 'label' => 'Wikidata', 'what' => i18n_t('Légendes et créatures du folklore'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => $wd, 'count' => $cnt('legendes'), 'bytes' => $size('legendes')],
        ['id' => 'affaires', 'label' => 'Wikidata', 'what' => i18n_t('Grandes affaires criminelles (lieu, date)'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => $wd, 'count' => $cnt('affaires'), 'bytes' => $size('affaires')],
        ['id' => 'fetes', 'label' => 'Wikidata', 'what' => i18n_t('Fêtes, carnavals, pardons, pèlerinages'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => $wd, 'count' => $cnt('fetes'), 'bytes' => $size('fetes')],
        ['id' => 'ciel', 'label' => 'NASA/JPL Small-Body Database', 'what' => i18n_t('Astéroïdes nommés (et citations du Minor Planet Center) ; cultivars nommés d’après un lieu ou une personne (Wikidata)'), 'licence' => i18n_t('données publiques de la NASA ; CC0 1.0'), 'mention' => 'NASA/JPL-Caltech, Minor Planet Center', 'url' => 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html', 'count' => $cnt('ciel', 'names'), 'bytes' => $size('ciel')],
        ['id' => 'mots', 'label' => 'Wiktionnaire', 'what' => i18n_t('Mots du français régional et leur définition'), 'licence' => 'CC BY-SA 4.0', 'mention' => i18n_t('les contributeurs du Wiktionnaire'), 'url' => 'https://fr.wiktionary.org/', 'count' => array_sum(array_map(static fn($c) => count($c['words']), tm_data('mots')['cats'] ?? [])), 'bytes' => $size('mots')],
        ['id' => 'mesures', 'label' => i18n_t('Wikipédia (articles des mesures)'), 'what' => i18n_t('Mesures de pays sourcées (peu nombreuses)'), 'licence' => 'CC BY-SA 4.0', 'mention' => i18n_t('les contributeurs de Wikipédia'), 'url' => 'https://fr.wikipedia.org/wiki/Arpent', 'count' => $cnt('mesures'), 'bytes' => $size('mesures')],
        ['id' => 'homonymes', 'label' => i18n_t('Wikidata, en ligne'), 'what' => i18n_t('Homonymes célèbres (même prénom et même nom)'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => $wd, 'online' => true],
    ]];
}

/* ═════════════════════ les points d'entrée (api.php) ═════════════════════ */

function tm_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'tm_place' => tm_place_info($pdo, $q),
        'tm_person' => tm_person($pdo, $q),
        'tm_homonymes' => tm_homonymes($pdo, $q),
        'tm_asteroid' => tm_asteroid($q),
        'tm_list' => tm_list($pdo, $q),
        'tm_about' => tm_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function tm_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'tm_cache_clear' => tm_cache_clear(),
        'tm_cache_restore' => tm_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
