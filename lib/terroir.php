<?php
declare(strict_types=1);

/**
 * 🌾 Son terroir — ce que le pays de tes ancêtres produisait, élevait, portait, et où l'on y allait à l'école ; le sens de leur prénom.
 * Écran : assets/js/heritage-terroir.js (style : assets/css/terroir.css). Fabriqué par scripts/terroir/*.
 *
 * Données DANS l'app (assets/data/, petites, lues à la demande) :
 *  - tr-aoc.json.gz      : 🍷 aires géographiques des AOC/AOP, IGP et IG, commune par commune (anciennes communes comprises) et produits
 *                          de chaque aire — INAO, data.gouv.fr, Licence Ouverte ; sorte de produit, image, article : Wikidata (P3895, CC0) ;
 *  - tr-races.json.gz    : 🐄 races locales (vaches, chevaux, moutons, chèvres, porcs, volailles, ânes, chiens) — Wikidata (CC0) ;
 *                          région d'origine des races de France : infobox des articles de Wikipédia (CC BY-SA 4.0) ;
 *  - tr-coiffes.json.gz  : 👒 coiffes et costumes traditionnels par région — Wikimedia Commons (photos : auteur et licence de chacune)
 *                          et Wikidata (noms, régions) ;
 *  - tr-ecoles.json.gz   : 🏫 écoles, collèges, lycées, écoles normales, séminaires, universités d'autrefois — Wikidata (CC0) ;
 *  - tr-prenoms.json.gz  : 🔤 le sens des ~2 000 prénoms les plus donnés en France (Insee, Fichier des prénoms) — étymologie du
 *                          Wiktionnaire (CC BY-SA 4.0, lien vers chaque article).
 * EN LIGNE, à la demande, puis gardé sur l'ordinateur (dossier « cache/terroir ») :
 *  - 🔤 le sens d'un autre prénom, ou d'un nom de famille : Wiktionnaire (fr.wiktionary.org), partie « Étymologie ».
 *    Le prénom ou le nom seul est envoyé — jamais pour une fiche confidentielle ou une personne vivante.
 *
 *  GET tr_place&place_id=|insee=|name=&lat=&lon=   → {commune, aoc, races, coiffes, ecoles} (sans réseau)
 *  GET tr_person&id=                               → {lines…} (sans réseau ; prénom : fichier livré ou réponse gardée)
 *  GET tr_nom&id=[&fresh=1]                        → le sens du prénom et du nom de famille (Wiktionnaire, en ligne, gardé)
 *  GET tr_base_names[&fetch=N]                     → les prénoms de la base et leur sens ; fetch=N : en chercher N de plus en ligne
 *  GET tr_list&kind=aoc|races|coiffes|ecoles|prenoms → {rows} · GET tr_about · GET tr_credit&files= (auteur et licence des images)
 *  POST tr_cache_clear / tr_cache_restore {token}
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_TR_DIR (un fichier <étape>.json par appel ; fichier absent = hors ligne).
 */

require_once __DIR__ . '/commune_culture.php'; // cc_place (code INSEE d'un lieu), cc_credit (auteur et licence des images), cc_departements

const TR_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const TR_HOSTS = ['fr.wiktionary.org'];
const TR_TTL = 180 * 86400;
const TR_WIKT = ['label' => 'Wiktionnaire', 'licence' => 'CC BY-SA 4.0', 'licence_url' => 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr'];
const TR_INAO = ['label' => 'INAO — Institut national de l’origine et de la qualité', 'licence' => 'Licence Ouverte (Etalab)', 'url' => 'https://www.data.gouv.fr/datasets/aires-geographiques-des-aoc-aop'];
const TR_SPECIES = ['bovin' => ['🐄', 'La vache de son pays', 'la', 'Vaches'], 'cheval' => ['🐴', 'Le cheval de son pays', 'le', 'Chevaux'], 'mouton' => ['🐑', 'La brebis de son pays', 'la', 'Moutons'],
    'chevre' => ['🐐', 'La chèvre de son pays', 'la', 'Chèvres'], 'porc' => ['🐖', 'Le cochon de son pays', 'le', 'Porcs'], 'poule' => ['🐓', 'La poule de son pays', 'la', 'Poules'],
    'oie' => ['🪿', 'L’oie de son pays', 'l’', 'Oies'], 'canard' => ['🦆', 'Le canard de son pays', 'le', 'Canards'], 'dindon' => ['🦃', 'Le dindon de son pays', 'le', 'Dindons'],
    'ane' => ['🫏', 'L’âne de son pays', 'l’', 'Ânes'], 'chien' => ['🐕', 'Le chien de son pays', 'le', 'Chiens']];
const TR_COUNTRIES = ['FR' => 'France', 'BE' => 'Belgique', 'CH' => 'Suisse', 'LU' => 'Luxembourg', 'IT' => 'Italie', 'ES' => 'Espagne', 'PT' => 'Portugal', 'DE' => 'Allemagne', 'AT' => 'Autriche',
    'NL' => 'Pays-Bas', 'GB' => 'Royaume-Uni', 'IE' => 'Irlande', 'PL' => 'Pologne', 'CZ' => 'Tchéquie', 'SK' => 'Slovaquie', 'HU' => 'Hongrie', 'RO' => 'Roumanie', 'BG' => 'Bulgarie', 'GR' => 'Grèce',
    'DK' => 'Danemark', 'SE' => 'Suède', 'NO' => 'Norvège', 'FI' => 'Finlande', 'SI' => 'Slovénie', 'HR' => 'Croatie', 'RS' => 'Serbie', 'BA' => 'Bosnie-Herzégovine', 'AL' => 'Albanie', 'UA' => 'Ukraine',
    'RU' => 'Russie', 'LV' => 'Lettonie', 'LT' => 'Lituanie', 'EE' => 'Estonie', 'BY' => 'Biélorussie', 'MD' => 'Moldavie', 'LI' => 'Liechtenstein', 'MC' => 'Monaco', 'AD' => 'Andorre', 'MT' => 'Malte',
    'CY' => 'Chypre', 'CA' => 'Canada', 'US' => 'États-Unis', 'DZ' => 'Algérie', 'MA' => 'Maroc', 'TN' => 'Tunisie', 'TR' => 'Turquie', 'IS' => 'Islande', 'MK' => 'Macédoine du Nord', 'ME' => 'Monténégro'];
/** les métiers (mots repliés, sans accents) → ce qu'on montre : sorte de produit AOC, espèce d'animal, écoles */
const TR_JOBS = [
    'vin' => ['vigneron', 'viticulteur', 'vinificateur', 'tonnelier', 'caviste', 'maitre de chai', 'vendangeur', 'negociant en vins', 'marchand de vin', 'vignes', 'vigne', 'cultivateur vigneron', 'courtier en vins'],
    'fromage' => ['fromager', 'fruitier', 'laitier', 'cremier', 'affineur', 'buronnier', 'vacher fromager'],
    'spiritueux' => ['distillateur', 'bouilleur', 'liquoriste'],
    'viande' => ['boucher', 'charcutier', 'volailler', 'salaisonnier', 'tripier'],
    'cidre' => ['cidrier'],
    'olive' => ['oleiculteur', 'mouliniste'],
    'miel' => ['apiculteur'],
];
const TR_FARM = [
    'mouton' => ['berger', 'bergere', 'patre', 'moutonnier', 'tondeur'], 'chevre' => ['chevrier', 'chevriere'], 'porc' => ['porcher', 'porchere'],
    'bovin' => ['vacher', 'vachere', 'bouvier', 'bouviere', 'buronnier', 'marchand de bestiaux', 'nourrisseur', 'herbager', 'emboucheur'],
    'cheval' => ['palefrenier', 'charretier', 'marechal ferrant', 'marechal', 'maquignon', 'voiturier', 'cocher', 'roulier', 'haras', 'eleveur de chevaux', 'postillon', 'muletier'],
    'poule' => ['volailler', 'coquetier', 'aviculteur'],
    '' => ['laboureur', 'cultivateur', 'agriculteur', 'fermier', 'fermiere', 'metayer', 'eleveur', 'menager', 'paysan', 'paysanne', 'journalier', 'journaliere', 'colon', 'bordier', 'closier',
        'proprietaire cultivateur', 'cultivatrice', 'agricultrice', 'domestique de ferme', 'valet de ferme', 'servante de ferme', 'granger', 'brassier', 'manouvrier', 'laboureuse'],
];
const TR_SCHOOL_JOBS = ['instituteur', 'institutrice', 'maitre d ecole', 'maitresse d ecole', 'regent', 'professeur', 'enseignant', 'enseignante', 'eleve', 'etudiant', 'etudiante', 'seminariste',
    'normalien', 'normalienne', 'ecolier', 'ecoliere', 'lyceen', 'lyceenne', 'collegien', 'pensionnaire', 'directeur d ecole', 'directrice d ecole', 'surveillant', 'proviseur', 'principal de college',
    'precepteur', 'recteur d academie', 'docteur en', 'licencie', 'bachelier', 'maitre de pension', 'sous maitre', 'religieuse enseignante', 'frere des ecoles'];

/* ═════════════════════ le cache (un fichier par question) et le réseau ═════════════════════ */

function tr_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir())), '/') . '/cache/terroir';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function tr_cache_get(string $key): ?array
{
    $f = tr_cache_dir() . '/' . sha1($key) . '.json';
    if (!is_file($f)) { return null; }
    $j = json_decode((string) @file_get_contents($f), true);
    return is_array($j) && isset($j['data']) ? $j : null;
}
function tr_cache_put(string $key, array $data): void
{
    $d = tr_cache_dir(true);
    @file_put_contents($d . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}
function tr_test_dir(): string
{
    $dir = (string) getenv('LCNDA_TEST_TR_DIR');
    return getenv('GENEALOGY_TEST') === '1' && $dir !== '' ? $dir : '';
}
/** un appel au Wiktionnaire (GET ou POST) ; en essai, la réponse est lue dans LCNDA_TEST_TR_DIR/<étape> */
function tr_http(string $step, string $url, ?array $post = null): array
{
    $step = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
    if (($dir = tr_test_dir()) !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        if (!is_file($dir . '/' . $step)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        $body = (string) file_get_contents($dir . '/' . $step);
    } else {
        $rec = PHP_SAPI === 'cli' ? (string) getenv('LCNDA_TR_RECORD_DIR') : '';
        if ($rec !== '' && is_file($rec . '/' . $step)) { $body = (string) file_get_contents($rec . '/' . $step); }
        else {
            if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
            if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), TR_HOSTS, true)) { throw new RuntimeException('Adresse refusée.'); }
            $body = ''; $too = false; $max = 6_000_000;
            $ch = curl_init($url);
            $opt = [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 45, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_USERAGENT => TR_UA, CURLOPT_HTTPHEADER => ['Accept: application/json'],
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
            if ($rec !== '') { @file_put_contents($rec . '/' . $step, $body); }
        }
    }
    $j = json_decode($body, true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    if (isset($j['error']['info'])) { throw new RuntimeException(mb_substr((string) $j['error']['info'], 0, 200)); }
    return $j;
}

/* ═════════════════════ les données livrées ═════════════════════ */

function tr_data_file(string $name): string { return APP_ROOT . '/assets/data/tr-' . $name . '.json.gz'; }
function tr_data(string $name): ?array
{
    static $memo = [];
    if (array_key_exists($name, $memo)) { return $memo[$name]; }
    $f = tr_data_file($name);
    $j = is_file($f) ? json_decode((string) @gzdecode((string) file_get_contents($f)), true) : null;
    return $memo[$name] = is_array($j) ? $j : null;
}
function tr_fold(string $s): string { return cc_fold($s); }
function tr_thumb(string $file, int $w = 240): string { return cc_thumb($file, $w); }
function tr_file_page(string $file): string { return cc_file_page($file); }
function tr_wd(string $q): string { return $q !== '' ? 'https://www.wikidata.org/wiki/' . $q : ''; }
function tr_wp(string $t): string { return $t !== '' ? 'https://fr.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $t)) : ''; }
function tr_country_code(string $country): string
{
    $f = tr_fold($country);
    if ($f === '' || in_array($f, ['fr', 'fra', 'france'], true)) { return 'FR'; }
    foreach (TR_COUNTRIES as $code => $name) { if (tr_fold($name) === $f || strtolower($code) === $f) { return $code; } }
    $alias = ['belgium' => 'BE', 'switzerland' => 'CH', 'schweiz' => 'CH', 'italy' => 'IT', 'italia' => 'IT', 'spain' => 'ES', 'espana' => 'ES', 'germany' => 'DE', 'deutschland' => 'DE',
        'england' => 'GB', 'angleterre' => 'GB', 'ecosse' => 'GB', 'pays de galles' => 'GB', 'united kingdom' => 'GB', 'netherlands' => 'NL', 'hollande' => 'NL', 'nederland' => 'NL',
        'poland' => 'PL', 'polska' => 'PL', 'portugal' => 'PT', 'austria' => 'AT', 'osterreich' => 'AT', 'usa' => 'US', 'etats unis d amerique' => 'US', 'quebec' => 'CA', 'canada' => 'CA'];
    return $alias[$f] ?? '';
}

/* ═════════════════════ 🍷 produits AOC / AOP / IGP ═════════════════════ */

function tr_inao_search(string $name): string { return 'https://www.inao.gouv.fr/rechercher-un-produit?' . http_build_query(['search_api_fulltext' => $name]); }
function tr_aoc_row(array $D, int $i): array
{
    [$ida, $name, $sign, $cat, $q, $wp, $img, $prods, $np] = $D['areas'][$i] + [0, '', '', 'autre', '', '', '', [], 0];
    $c = $D['cats'][$cat] ?? ['🏷️', 'Autre produit'];
    return ['ida' => (int) $ida, 'name' => (string) $name, 'sign' => (string) $sign, 'cat' => (string) $cat, 'icon' => $c[0], 'cat_label' => $c[1], 'products' => $prods, 'products_count' => (int) $np,
        'url' => tr_inao_search((string) $name), 'qid' => (string) $q, 'wd' => tr_wd((string) $q), 'wp' => tr_wp((string) $wp), 'image' => (string) $img, 'thumb' => $img !== '' ? tr_thumb((string) $img, 160) : '',
        'image_page' => $img !== '' ? tr_file_page((string) $img) : ''];
}
/** les aires d'une commune, rangées : vins d'abord… (ordre des sortes du fichier), AOC avant IGP */
function tr_aoc_for(string $insee): array
{
    $D = tr_data('aoc'); if (!$D || $insee === '' || empty($D['c'][$insee])) { return []; }
    $order = array_flip(array_keys($D['cats']));
    $out = array_map(static fn($i) => tr_aoc_row($D, (int) $i), $D['c'][$insee]);
    usort($out, static fn($a, $b) => [$order[$a['cat']] ?? 99, $a['sign'] === 'AOC' ? 0 : 1, tr_fold($a['name'])] <=> [$order[$b['cat']] ?? 99, $b['sign'] === 'AOC' ? 0 : 1, tr_fold($b['name'])]);
    return $out;
}

/* ═════════════════════ 🐄 races, 👒 coiffes : par département, région, ou centre d'une province ═════════════════════ */

const TR_NEAR_KM = 70.0;
/** rang d'une ligne pour un lieu : 0 commune, 1 département, 2 région, 3 province (centre à moins de 70 km) ; null si elle n'y va pas */
function tr_rank_place(array $r, string $insee, string $dep, ?float $lat, ?float $lon): ?int
{
    if ($insee !== '' && ($r['insee'] ?? '') === $insee) { return 0; }
    if ($dep !== '' && in_array($dep, $r['deps'] ?? [], true)) { return ($r['lvl'] ?? '') === 'region' ? 2 : 1; }
    if ($lat !== null && $lon !== null && empty($r['deps']) && isset($r['lat']) && cplus_km($lat, $lon, (float) $r['lat'], (float) $r['lon']) <= TR_NEAR_KM) { return 3; }
    return null;
}
function tr_race_row(array $r): array
{
    $sp = TR_SPECIES[$r['sp']] ?? ['🐾', '', 'la', ''];
    $img = (string) ($r['img'] ?? '');
    $deps = array_values(array_map(static fn($d) => (string) (cc_departements()[$d] ?? $d), $r['deps'] ?? []));
    return ['qid' => $r['q'], 'name' => $r['n'], 'species' => $r['sp'], 'icon' => $sp[0], 'species_label' => $sp[3], 'desc' => (string) ($r['d'] ?? ''), 'origin' => (string) ($r['o'] ?? ''),
        'countries' => $r['c'], 'country_names' => implode(', ', array_map(static fn($c) => TR_COUNTRIES[$c] ?? $c, $r['c'])), 'deps' => $r['deps'] ?? [], 'dep_names' => implode(', ', $deps), 'level' => (string) ($r['lvl'] ?? ''),
        'lat' => $r['lat'] ?? null, 'lon' => $r['lon'] ?? null, 'image' => $img, 'thumb' => $img !== '' ? tr_thumb($img, 200) : '', 'image_page' => $img !== '' ? tr_file_page($img) : '',
        'url' => tr_wd($r['q']), 'wp' => tr_wp((string) ($r['wp'] ?? ''))];
}
const TR_SP_ORDER = ['bovin', 'cheval', 'mouton', 'chevre', 'porc', 'poule', 'oie', 'canard', 'dindon', 'ane', 'chien'];
/** les races d'un lieu : en France, par sa région d'origine ; ailleurs, celles du pays (sans région) */
function tr_races_for(string $insee, string $dep, ?float $lat, ?float $lon, string $country = 'FR', int $max = 40): array
{
    $D = tr_data('races'); if (!$D) { return []; }
    $out = [];
    foreach ($D['rows'] as $r) {
        if ($country === 'FR') { $rank = tr_rank_place($r, $insee, $dep, $lat, $lon); if ($rank === null) { continue; } }
        elseif ($country !== '' && in_array($country, $r['c'], true)) { $rank = 4; }
        else { continue; }
        $out[] = tr_race_row($r) + ['rank' => $rank];
    }
    $o = array_flip(TR_SP_ORDER);
    usort($out, static fn($a, $b) => [$o[$a['species']] ?? 99, $a['rank'], $a['image'] === '' ? 1 : 0, tr_fold($a['name'])] <=> [$o[$b['species']] ?? 99, $b['rank'], $b['image'] === '' ? 1 : 0, tr_fold($b['name'])]);
    return array_slice($out, 0, $max);
}
function tr_coiffes_for(string $insee, string $dep, ?float $lat, ?float $lon): array
{
    $D = tr_data('coiffes'); if (!$D) { return []; }
    $out = [];
    foreach ($D['rows'] as $r) {
        $rank = tr_rank_place($r, $insee, $dep, $lat, $lon); if ($rank === null) { continue; }
        $out[] = tr_coiffe_row($r) + ['rank' => $rank];
    }
    usort($out, static fn($a, $b) => [$a['rank'], count($b['items'])] <=> [$b['rank'], count($a['items'])]);
    return $out;
}
function tr_photo(array $p): array
{
    return ['file' => $p['f'], 'thumb' => tr_thumb((string) $p['f'], 220), 'page' => tr_file_page((string) $p['f']), 'author' => (string) ($p['a'] ?? ''), 'licence' => (string) ($p['l'] ?? ''), 'licence_url' => (string) ($p['u'] ?? ''), 'date' => (string) ($p['d'] ?? '')];
}
function tr_coiffe_row(array $r): array
{
    $items = array_map(static fn($it) => ['name' => $it['n'], 'qid' => (string) ($it['q'] ?? ''), 'url' => tr_wd((string) ($it['q'] ?? '')), 'desc' => (string) ($it['d'] ?? ''),
        'category' => 'https://commons.wikimedia.org/wiki/Category:' . rawurlencode(str_replace(' ', '_', (string) $it['cat'])),
        'photo' => !empty($it['img']) && !empty($it['cr']) ? tr_photo(['f' => $it['img']] + $it['cr']) : null], $r['items'] ?? []);
    $deps = array_values(array_map(static fn($d) => (string) (cc_departements()[$d] ?? $d), $r['deps'] ?? []));
    return ['region' => $r['r'], 'qid' => (string) ($r['q'] ?? ''), 'url' => tr_wd((string) ($r['q'] ?? '')), 'category' => 'https://commons.wikimedia.org/wiki/Category:' . rawurlencode(str_replace(' ', '_', (string) $r['cat'])),
        'level' => (string) ($r['lvl'] ?? ''), 'deps' => $r['deps'] ?? [], 'dep_names' => implode(', ', $deps), 'lat' => $r['lat'] ?? null, 'lon' => $r['lon'] ?? null,
        'items' => $items, 'photos' => array_map('tr_photo', $r['photos'] ?? [])];
}

/* ═════════════════════ 🏫 écoles d'autrefois ═════════════════════ */

function tr_school_row(array $r): array
{
    $D = tr_data('ecoles'); $c = cc_data('communes')['c'][$r['i']] ?? null; $img = (string) ($r['img'] ?? '');
    return ['qid' => $r['q'], 'name' => $r['n'], 'kind' => $r['k'], 'kind_label' => (string) ($D['kinds'][$r['k']] ?? ''), 'type' => (string) ($r['t'] ?? ''), 'insee' => $r['i'], 'commune' => $c ? (string) $c[0] : '',
        'dep' => cc_dep_of_insee((string) $r['i']), 'dep_name' => (string) (cc_departements()[cc_dep_of_insee((string) $r['i'])] ?? ''), 'lat' => $c[1] ?? null, 'lon' => $c[2] ?? null,
        'founded' => isset($r['y']) ? (int) $r['y'] : null, 'closed' => isset($r['e']) ? (int) $r['e'] : null,
        'feminine' => (bool) preg_match('/^(ecole|universite|faculte|institution|maison|abbaye|academie|cite|pension)\b/', tr_fold((string) $r['n'])),
        'image' => $img, 'thumb' => $img !== '' ? tr_thumb($img, 200) : '', 'image_page' => $img !== '' ? tr_file_page($img) : '', 'url' => tr_wd($r['q']), 'wp' => tr_wp((string) ($r['wp'] ?? ''))];
}
function tr_schools_for(string $insee): array
{
    $D = tr_data('ecoles'); if (!$D || $insee === '') { return []; }
    $out = [];
    foreach ($D['rows'] as $r) { if ($r['i'] === $insee) { $out[] = tr_school_row($r); } }
    usort($out, static fn($a, $b) => [$a['founded'] ?? 9999, tr_fold($a['name'])] <=> [$b['founded'] ?? 9999, tr_fold($b['name'])]);
    return $out;
}

/* ═════════════════════ 🔤 le sens d'un prénom, d'un nom (Wiktionnaire) ═════════════════════ */

/** « JEAN-BAPTISTE » → « Jean-Baptiste » ; « marie thérèse » → « Marie Thérèse » */
function tr_title(string $s): string
{
    $s = trim((string) preg_replace('/\s+/u', ' ', $s));
    return (string) preg_replace_callback('/(^|[\s\-’\'])(\p{L})/u', static fn($m) => $m[1] . mb_strtoupper($m[2]), mb_strtolower($s));
}
function tr_wikt_url(string $title): string { return 'https://fr.wiktionary.org/wiki/' . rawurlencode(str_replace(' ', '_', $title)); }
function tr_wikt_history(string $title): string { return 'https://fr.wiktionary.org/w/index.php?title=' . rawurlencode(str_replace(' ', '_', $title)) . '&action=history'; }
/** la partie « Étymologie » (en français) d'un article, pour un prénom ou un nom de famille ; null si l'article n'en a pas pour ce sens */
function tr_wikt_extract(string $wt, string $kind): ?string
{
    if (!preg_match('/==\s*\{\{langue\|fr\}\}\s*==(.*?)(?=\n==\s*\{\{langue\||\z)/s', $wt, $m)) { return null; }
    $fr = $m[1];
    $need = $kind === 'nom' ? '/\{\{S\|nom de famille\|fr/u' : '/\{\{S\|prénom\|fr/u';
    if (!preg_match($need, $fr)) { return null; }
    if (!preg_match('/===\s*\{\{S\|étymologie\}\}\s*===(.*?)(?=\n===|\z)/su', $fr, $e)) { return null; }
    $lines = array_values(array_filter(array_map('trim', explode("\n", $e[1])), static fn($l) => str_starts_with($l, ':') && !str_starts_with($l, ':*') && !str_starts_with($l, '::')));
    $lines = array_map(static fn($l) => trim(substr($l, 1)), $lines);
    $marked = array_values(array_filter($lines, static fn($l) => (bool) preg_match("/^''\\(.*?\\)''/u", $l)));
    if ($marked) {
        $want = $kind === 'nom' ? '/nom de famille/iu' : '/prénom/iu';
        $hit = array_values(array_filter($marked, static fn($l) => preg_match("/^''\\((.*?)\\)''/u", $l, $mm) && preg_match($want, $mm[1])));
        if (!$hit) { return null; }
        $lines = [(string) preg_replace("/^''\\(.*?\\)''\\s*/u", '', $hit[0])];
    }
    $t = implode("\n\n", array_slice($lines, 0, 3));
    $t = (string) preg_replace('/\{\{(ébauche-étym|siècle|date|réf|référence nécessaire|refnec|ébauche)[^{}]*\}\}/u', '', $t);
    $t = (string) preg_replace('/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/su', '', $t);
    $probe = (string) preg_replace('/\{\{[^{}]*\}\}|[\[\]\'.,;:()«»\s]/u', '', $t);
    if (mb_strlen($probe) < 4 && !preg_match('/\{\{(étyl|étylp|composé de|lien|polytonique|w)\|/u', $t)) { return null; }
    return trim($t);
}
/** HTML rendu → texte simple */
function tr_html_text(string $html): string
{
    $html = (string) preg_replace('/<(style|script)[^>]*>.*?<\/\1>/si', '', $html);
    $html = (string) preg_replace('/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>.*?<\/sup>/si', '', $html);
    $t = html_entity_decode(strip_tags((string) preg_replace('/<br\s*\/?>|<\/p>|<\/dd>|<\/li>/i', ' ', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = trim((string) preg_replace('/\s+/u', ' ', $t));
    $t = (string) preg_replace('/\s+([,.;)])/u', '$1', $t);
    $t = (string) preg_replace('/\(\s*\)/u', '', $t);
    return trim((string) preg_replace('/\s{2,}/u', ' ', $t), " \t:");
}
/** cherche en ligne le sens de plusieurs mots d'un coup (2 appels pour 40 mots) ; met chaque réponse dans le cache */
function tr_wikt_fetch(array $titles, string $kind): array
{
    $titles = array_values(array_unique(array_filter(array_map('trim', $titles), static fn($t) => $t !== '' && mb_strlen($t) <= 60 && !preg_match('/[|#<>\[\]{}]/u', $t))));
    $titles = array_slice($titles, 0, 40);
    if (!$titles) { return []; }
    $h = substr(sha1($kind . '|' . implode('|', $titles)), 0, 10);
    $j = tr_http('wikt_rev_' . $h . '.json', 'https://fr.wiktionary.org/w/api.php?' . http_build_query(['action' => 'query', 'prop' => 'revisions', 'rvprop' => 'content', 'rvslots' => 'main',
        'titles' => implode('|', $titles), 'format' => 'json', 'formatversion' => '2']));
    $norm = [];
    foreach ($j['query']['normalized'] ?? [] as $n) { $norm[(string) $n['to']] = (string) $n['from']; }
    $snip = []; $found = [];
    foreach ($j['query']['pages'] ?? [] as $pg) {
        $t = (string) ($pg['title'] ?? ''); $asked = $norm[$t] ?? $t;
        $wt = (string) ($pg['revisions'][0]['slots']['main']['content'] ?? ($pg['revisions'][0]['content'] ?? ''));
        $found[$asked] = $t;
        if ($wt !== '' && ($x = tr_wikt_extract($wt, $kind)) !== null) { $snip[$asked] = ['title' => $t, 'wt' => $x]; }
    }
    $out = [];
    if ($snip) {
        $keys = array_keys($snip); $text = '';
        foreach ($keys as $i => $k) { $text .= "\n\nTRSEP{$i}TRSEP\n\n" . $snip[$k]['wt']; }
        $p = tr_http('wikt_parse_' . $h . '.json', 'https://fr.wiktionary.org/w/api.php', ['action' => 'parse', 'text' => $text, 'contentmodel' => 'wikitext', 'prop' => 'text', 'title' => 'Prénom',
            'disablelimitreport' => 1, 'disableeditsection' => 1, 'format' => 'json', 'formatversion' => '2']);
        $html = (string) ($p['parse']['text'] ?? '');
        $parts = preg_split('/TRSEP(\d+)TRSEP/', $html, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];
        for ($i = 1; $i + 1 < count($parts); $i += 2) {
            $k = $keys[(int) $parts[$i]] ?? null; if ($k === null) { continue; }
            $txt = tr_html_text($parts[$i + 1]);
            if (mb_strlen($txt) >= 6) { $out[$k] = ['ok' => true, 'title' => $snip[$k]['title'], 'text' => mb_substr($txt, 0, 1500)]; }
        }
    }
    foreach ($titles as $t) {
        $r = $out[$t] ?? ['ok' => true, 'none' => true, 'title' => $found[$t] ?? $t];
        tr_cache_put('wikt:' . $kind . ':' . $t, $r);
        $out[$t] = $r;
    }
    return $out;
}
/** le fichier livré (prénoms courants) : titre exact, sinon même mot sans les accents */
function tr_prenom_offline(string $first): ?array
{
    $D = tr_data('prenoms'); if (!$D) { return null; }
    static $fold = null;
    if ($fold === null) { $fold = []; foreach ($D['n'] as $k => $v) { $fold[tr_fold($k)] ??= $k; } foreach ($D['none'] ?? [] as $k) { $fold[tr_fold($k)] ??= $k; } }
    $k = isset($D['n'][$first]) ? $first : ($fold[tr_fold($first)] ?? null);
    if ($k === null) { return null; }
    if (isset($D['n'][$k])) { return ['ok' => true, 'title' => $k, 'text' => (string) $D['n'][$k], 'offline' => true]; }
    return ['ok' => true, 'none' => true, 'title' => $k, 'offline' => true];
}
/** le sens d'un prénom (ou d'un nom) : fichier livré, puis réponse gardée, puis (si $online) le Wiktionnaire */
function tr_meaning(string $word, string $kind, bool $online, bool $fresh = false): ?array
{
    $word = tr_title($word); if ($word === '') { return null; }
    if ($kind === 'prenom' && !$fresh && ($o = tr_prenom_offline($word)) !== null) { return tr_meaning_out($o, $kind); }
    $c = tr_cache_get('wikt:' . $kind . ':' . $word);
    if ($c && !$fresh && (int) $c['at'] > time() - TR_TTL) { return tr_meaning_out($c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']], $kind); }
    if (!$online) { return $c ? tr_meaning_out($c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']], $kind) : null; }
    try { $r = tr_wikt_fetch([$word], $kind)[$word] ?? null; }
    catch (Throwable $e) { return $c ? tr_meaning_out($c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']], $kind) : ['ok' => false, 'offline' => true, 'message' => $e->getMessage()]; }
    return $r ? tr_meaning_out($r + ['cached' => false, 'fetched_at' => time()], $kind) : null;
}
function tr_meaning_out(array $r, string $kind): array
{
    if (empty($r['ok']) || !empty($r['none'])) { return $r + ['kind' => $kind]; }
    $t = (string) $r['title'];
    return $r + ['kind' => $kind, 'url' => tr_wikt_url($t) . ($kind === 'nom' ? '#Nom_de_famille' : '#Prénom'), 'history_url' => tr_wikt_history($t), 'source' => TR_WIKT];
}

/* ═════════════════════ la page d'un lieu (sans réseau) ═════════════════════ */

function tr_place_info(PDO $pdo, array $q): array
{
    $p = cc_place($pdo, $q);
    $country = tr_country_code($p['country'] ?? '');
    if ($country === 'FR' && $p['insee'] === '' && $p['dep'] === '' && $p['lat'] === null) { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Lieu introuvable : il faut une commune de France.')]; }
    if ($country === '') { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Pays inconnu.')]; }
    $fr = $country === 'FR';
    return ['ok' => true, 'commune' => ['insee' => $p['insee'], 'name' => $p['commune'], 'dep' => $p['dep'], 'dep_name' => (string) (cc_departements()[$p['dep']] ?? ''), 'lat' => $p['lat'], 'lon' => $p['lon'], 'country' => $country, 'country_name' => TR_COUNTRIES[$country] ?? ''],
        'aoc' => $fr ? tr_aoc_for($p['insee']) : [], 'races' => tr_races_for($p['insee'], $p['dep'], $p['lat'], $p['lon'], $country),
        'coiffes' => $fr ? tr_coiffes_for($p['insee'], $p['dep'], $p['lat'], $p['lon']) : [], 'ecoles' => $fr ? tr_schools_for($p['insee']) : []];
}

/* ═════════════════════ la fiche d'une personne ═════════════════════ */

function tr_person_data(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new LcndaBadInput('Fiche introuvable.'); }
    $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $x = in_array('admin4_code', $pc, true) ? "COALESCE(pl.admin4_code,'')" : "''";
    $ev = $pdo->prepare("SELECT e.year, e.title, e.description, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(t.slug,'') AS slug, pl.id AS place_id, COALESCE(pl.name,'') AS name, COALESCE(pl.county,'') AS county,
        COALESCE(pl.country,'') AS country, $x AS insee, pl.latitude AS lat, pl.longitude AS lon FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? ORDER BY COALESCE(e.year, 9999)");
    $ev->execute([$pid]);
    $places = []; $jobs = []; $edu = false;
    $addJob = static function (string $t, ?int $y, ?string $k) use (&$jobs) { $t = trim($t); if ($t === '' || mb_strlen($t) > 120) { return; } foreach ($jobs as $j) { if (tr_fold($j['text']) === tr_fold($t)) { return; } } $jobs[] = ['text' => $t, 'year' => $y, 'place' => $k]; };
    foreach (preg_split('/\s*[;,\/]\s*|\s+et\s+/u', (string) ($p['occupation'] ?? '')) ?: [] as $t) { $addJob((string) $t, null, null); }
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $tag = strtoupper((string) $e['tag']); $k = null;
        if (!empty($e['place_id'])) {
            $insee = preg_match('/^\d[\dAB]\d{3}$/', (string) $e['insee']) ? (string) $e['insee'] : '';
            $lat = is_numeric($e['lat']) ? (float) $e['lat'] : null; $lon = is_numeric($e['lon']) ? (float) $e['lon'] : null;
            $name = trim((string) preg_replace('/\s*[,(].*$/u', '', (string) $e['name']));
            $country = tr_country_code((string) $e['country']);
            if ($country === 'FR' && $insee === '') { $insee = cc_find_insee($name, (string) $e['county'], $lat, $lon, (string) $e['country']); }
            $dep = $insee !== '' ? cc_dep_of_insee($insee) : ($country === 'FR' ? cc_dep_of_name((string) $e['county']) : '');
            if ($insee === '' && $lat === null && $country === 'FR') { $country = $dep !== '' ? 'FR' : ''; }
            if ($insee !== '') { $c = cc_data('communes')['c'][$insee] ?? null; if ($lat === null && $c && $c[1] !== null) { $lat = (float) $c[1]; $lon = (float) $c[2]; } }
            if ($country !== '') {
                $k = $insee !== '' ? $insee : 'p' . (int) $e['place_id'];
                if (!isset($places[$k])) { $places[$k] = ['key' => $k, 'id' => (int) $e['place_id'], 'insee' => $insee, 'dep' => $dep, 'name' => $name, 'lat' => $lat, 'lon' => $lon, 'country' => $country, 'tags' => [], 'year' => is_numeric($e['year']) ? (int) $e['year'] : null]; }
                $places[$k]['tags'][] = $tag;
            }
        }
        if ($tag === 'OCCU' || in_array(tr_fold((string) $e['slug']), ['occupation', 'profession', 'metier'], true)) { $addJob((string) ($e['title'] ?: $e['description']), is_numeric($e['year']) ? (int) $e['year'] : null, $k); }
        if (in_array($tag, ['EDUC', 'GRAD'], true)) { $edu = true; if ($k !== null) { $places[$k]['edu'] = true; } }
    }
    return ['id' => $pid, 'first' => trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'gender' => (string) ($p['gender'] ?? ''), 'kind' => (string) ($p['kind'] ?? 'human'),
        'private' => (int) ($p['is_private'] ?? 0) === 1 || (string) ($p['living_status'] ?? '') === 'living', 'jobs' => $jobs, 'edu' => $edu, 'places' => array_values($places)];
}
/** un métier écrit → ce qu'il touche : ['aoc' => [sortes], 'farm' => espèce ('' = toutes), 'school' => bool] */
function tr_job_topics(string $job): array
{
    $f = ' ' . tr_fold($job) . ' '; $out = ['aoc' => [], 'farm' => null, 'school' => false];
    $has = static fn(string $w) => (bool) preg_match('/ ' . preg_quote($w, '/') . '(s|e|es|x)? /', $f);
    foreach (TR_JOBS as $cat => $words) { foreach ($words as $w) { if ($has($w)) { $out['aoc'][] = $cat; break; } } }
    foreach (TR_FARM as $sp => $words) { foreach ($words as $w) { if ($has($w)) { $out['farm'] ??= $sp; break; } } }
    if ($out['farm'] === null && preg_match('/ (eleveur|eleveuse) (de |d )?(vaches|bovins|boeufs|veaux)/', $f)) { $out['farm'] = 'bovin'; }
    foreach (TR_SCHOOL_JOBS as $w) { if ($has($w)) { $out['school'] = true; break; } }
    return $out;
}
function tr_capfirst(string $s): string { return mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1); }

function tr_person(PDO $pdo, array $q): array
{
    $P = tr_person_data($pdo, safe_int($q['id'] ?? ($q['person_id'] ?? 0)));
    $out = ['ok' => true, 'id' => $P['id'], 'first' => $P['first'], 'last' => $P['last'], 'gender' => $P['gender'], 'private' => $P['private'], 'jobs' => $P['jobs']];
    if ($P['kind'] === 'animal') { return $out + ['animal' => true]; }
    $home = null;
    foreach ($P['places'] as $pl) { if (array_intersect($pl['tags'], ['BIRT', 'BAPM', 'CHR'])) { $home = $pl; break; } }
    $home = $home ?: ($P['places'][0] ?? null);
    $out['home'] = $home ? ['name' => $home['name'], 'insee' => $home['insee'], 'dep' => $home['dep'], 'dep_name' => (string) (cc_departements()[$home['dep']] ?? ''), 'country' => $home['country']] : null;
    $topics = array_map(static fn($j) => $j + ['topics' => tr_job_topics($j['text'])], $P['jobs']);
    // 🍷 son métier et les produits de sa commune (la commune du métier, sinon celles de sa vie)
    $aoc = [];
    foreach ($topics as $j) {
        if (!$j['topics']['aoc']) { continue; }
        $cands = $j['place'] !== null ? array_values(array_filter($P['places'], static fn($pl) => $pl['key'] === $j['place'])) : [];
        $cands = array_merge($cands, $P['places']);
        foreach ($cands as $pl) {
            if ($pl['insee'] === '') { continue; }
            $areas = array_values(array_filter(tr_aoc_for($pl['insee']), static fn($a) => in_array($a['cat'], $j['topics']['aoc'], true)));
            if ($areas) { $aoc[] = ['job' => tr_capfirst($j['text']), 'place' => $pl['name'], 'insee' => $pl['insee'], 'areas' => array_slice($areas, 0, 12), 'count' => count($areas)]; break; }
        }
        if ($aoc) { break; }
    }
    if ($aoc) { $out['aoc'] = $aoc[0]; }
    // 🐄 les animaux de son pays : pour qui travaillait la terre ou les bêtes
    $farm = null; $farmJob = '';
    foreach ($topics as $j) { if ($j['topics']['farm'] !== null) { $farm = $j['topics']['farm']; $farmJob = $j['text']; break; } }
    if ($farm !== null) {
        $pl = null;
        foreach ($topics as $j) { if ($j['text'] === $farmJob && $j['place'] !== null) { foreach ($P['places'] as $x) { if ($x['key'] === $j['place']) { $pl = $x; } } } }
        $pl = $pl ?: $home;
        if ($pl) {
            $races = tr_races_for($pl['insee'], $pl['dep'], $pl['lat'], $pl['lon'], $pl['country']);
            if ($farm !== '') { $pref = array_values(array_filter($races, static fn($r) => $r['species'] === $farm)); $races = array_merge($pref, array_values(array_filter($races, static fn($r) => $r['species'] !== $farm))); }
            $races = array_values(array_filter($races, static fn($r) => $r['species'] !== 'chien'));
            if ($races) { $out['races'] = ['job' => tr_capfirst($farmJob), 'place' => $pl['name'], 'dep_name' => (string) (cc_departements()[$pl['dep']] ?? ''), 'country' => $pl['country'], 'items' => array_slice($races, 0, 10), 'species' => $farm]; }
        }
    }
    // 👒 la coiffe et le costume de son pays : là où il ou elle est né(e)
    if ($home && $home['country'] === 'FR') {
        $c = tr_coiffes_for($home['insee'], $home['dep'], $home['lat'], $home['lon']);
        if ($c) { $out['coiffes'] = ['place' => $home['name'], 'items' => array_slice($c, 0, 2)]; }
    }
    // 🏫 ses écoles : pour un élève, un étudiant, un maître… ou une fiche avec une scolarité (EDUC, GRAD)
    $school = $P['edu'] || array_filter($topics, static fn($j) => $j['topics']['school']);
    if ($school) {
        $sc = []; $ordered = array_merge(array_values(array_filter($P['places'], static fn($pl) => !empty($pl['edu']))), $P['places']);
        $seen = [];
        foreach ($ordered as $pl) {
            if ($pl['insee'] === '' || isset($seen[$pl['insee']])) { continue; }
            $seen[$pl['insee']] = 1;
            foreach (tr_schools_for($pl['insee']) as $s) { $sc[] = $s + ['place' => $pl['name']]; }
            if (count($sc) >= 12) { break; }
        }
        $job = ''; foreach ($topics as $j) { if ($j['topics']['school']) { $job = tr_capfirst($j['text']); break; } }
        if ($sc) { $out['ecoles'] = ['job' => $job, 'edu' => $P['edu'], 'items' => array_slice($sc, 0, 12)]; }
    }
    // 🔤 le sens de son prénom (fichier livré ou réponse gardée ; en ligne : tr_nom)
    $out['prenom'] = tr_first_meaning($P['first'], false);
    if (($nm = $P['last'] !== '' ? tr_meaning($P['last'], 'nom', false) : null) && !empty($nm['text'])) { $out['nom'] = $nm; }
    $out['places'] = array_map(static fn($pl) => array_intersect_key($pl, array_flip(['name', 'insee', 'dep', 'country'])), $P['places']);
    return $out;
}
/** le premier prénom (« Jean Marie » → « Jean »), et le prénom composé entier s'il a un article (« Jean-Baptiste ») */
function tr_first_meaning(string $first, bool $online): ?array
{
    $first = trim($first); if ($first === '') { return null; }
    $words = preg_split('/\s+/u', $first) ?: [];
    $cands = array_values(array_unique(array_filter([$words[0] ?? '', count($words) > 1 ? implode('-', array_slice($words, 0, 2)) : ''])));
    if (str_contains($words[0] ?? '', '-')) { $cands[] = explode('-', $words[0])[0]; }
    $last = null;
    foreach ($cands as $w) {
        $r = tr_meaning($w, 'prenom', $online);
        if ($r && !empty($r['text'])) { return $r; }
        $last = $last ?? $r;
    }
    return $last;
}
/** GET tr_nom&id= : en ligne (Wiktionnaire), jamais pour une fiche confidentielle ou une personne vivante */
function tr_nom(PDO $pdo, array $q): array
{
    $P = tr_person_data($pdo, safe_int($q['id'] ?? 0));
    if ($P['private']) { return ['ok' => true, 'private' => true, 'prenom' => tr_first_meaning($P['first'], false), 'nom' => $P['last'] !== '' ? tr_meaning($P['last'], 'nom', false) : null]; }
    $fresh = !empty($q['fresh']);
    $pr = $fresh ? tr_meaning(explode(' ', $P['first'])[0] ?? '', 'prenom', true, true) : tr_first_meaning($P['first'], true);
    return ['ok' => true, 'prenom' => $pr, 'nom' => $P['last'] !== '' ? tr_meaning($P['last'], 'nom', true, $fresh) : null];
}
/** les prénoms de la base (premier prénom, sans les fiches confidentielles ni les vivants) et leur sens ; fetch=N : N de plus en ligne */
function tr_base_names(PDO $pdo, array $q): array
{
    $rows = $pdo->query("SELECT first_name AS f, COUNT(*) AS n FROM persons WHERE COALESCE(is_private,0)=0 AND COALESCE(living_status,'')<>'living' AND COALESCE(kind,'human')<>'animal' AND TRIM(COALESCE(first_name,''))<>'' GROUP BY first_name")->fetchAll(PDO::FETCH_ASSOC);
    $count = [];
    foreach ($rows as $r) { $w = tr_title(preg_split('/\s+/u', trim((string) $r['f']))[0] ?? ''); if ($w !== '' && mb_strlen($w) >= 2 && !preg_match('/[\d?]/', $w)) { $count[$w] = ($count[$w] ?? 0) + (int) $r['n']; } }
    arsort($count);
    $want = max(0, min(40, safe_int($q['fetch'] ?? 0)));
    $missing = [];
    foreach ($count as $w => $n) { if (tr_meaning($w, 'prenom', false) === null) { $missing[] = $w; } }
    $err = '';
    if ($want > 0 && $missing) {
        try { tr_wikt_fetch(array_slice($missing, 0, $want), 'prenom'); }
        catch (Throwable $e) { $err = $e->getMessage(); }
    }
    $out = []; $left = 0;
    foreach ($count as $w => $n) {
        $m = tr_meaning($w, 'prenom', false);
        if ($m === null) { $left++; continue; }
        $out[] = ['name' => $w, 'people' => $n, 'text' => (string) ($m['text'] ?? ''), 'none' => !empty($m['none']), 'offline' => !empty($m['offline']), 'title' => (string) ($m['title'] ?? $w),
            'url' => !empty($m['text']) ? (string) $m['url'] : tr_wikt_url((string) ($m['title'] ?? $w))];
    }
    return ['ok' => $err === '', 'message' => $err, 'names' => $out, 'total' => count($count), 'left' => $left, 'found' => count(array_filter($out, static fn($r) => $r['text'] !== ''))];
}

/* ═════════════════════ Listes ═════════════════════ */

function tr_list(PDO $pdo, array $q): array
{
    $kind = (string) ($q['kind'] ?? '');
    if ($kind === 'aoc') {
        $D = tr_data('aoc'); if (!$D) { return ['ok' => true, 'rows' => []]; }
        $deps = []; $n = [];
        foreach ($D['c'] as $insee => $idx) { $d = cc_dep_of_insee((string) $insee); foreach ($idx as $i) { $deps[$i][$d] = 1; $n[$i] = ($n[$i] ?? 0) + 1; } }
        $rows = [];
        foreach ($D['areas'] as $i => $a) {
            $r = tr_aoc_row($D, $i);
            $dn = array_map(static fn($d) => (string) (cc_departements()[$d] ?? $d), array_keys($deps[$i] ?? []));
            sort($dn);
            $rows[] = ['name' => $r['name'], 'sign' => $r['sign'], 'cat_label' => i18n_t($r['cat_label']), 'icon' => $r['icon'], 'communes' => $n[$i] ?? 0, 'dep_names' => implode(', ', $dn),
                'products' => implode(' · ', $r['products']), 'url' => $r['url'], 'wd' => $r['wd'], 'wp' => $r['wp']];
        }
        return ['ok' => true, 'rows' => $rows];
    }
    if ($kind === 'races') {
        $D = tr_data('races'); if (!$D) { return ['ok' => true, 'rows' => []]; }
        return ['ok' => true, 'rows' => array_map(static function ($r) { $x = tr_race_row($r); $x['species_label'] = i18n_t($x['species_label']); unset($x['deps'], $x['countries']); return $x; }, $D['rows'])];
    }
    if ($kind === 'coiffes') {
        $D = tr_data('coiffes'); if (!$D) { return ['ok' => true, 'rows' => []]; }
        $rows = [];
        foreach ($D['rows'] as $r) {
            $x = tr_coiffe_row($r);
            foreach ($x['items'] as $it) { $rows[] = ['name' => $it['name'], 'region' => $x['region'], 'dep_names' => $x['dep_names'], 'desc' => $it['desc'], 'photo' => $it['photo']['page'] ?? '', 'photo_credit' => $it['photo'] ? trim($it['photo']['author'] . ' · ' . $it['photo']['licence'], ' ·') : '', 'url' => $it['url'], 'category' => $it['category'], 'lat' => $x['lat'], 'lon' => $x['lon']]; }
            foreach ($x['photos'] as $ph) { $rows[] = ['name' => i18n_t('Photo : {f}', ['f' => preg_replace('/\.\w+$/', '', $ph['file'])]), 'region' => $x['region'], 'dep_names' => $x['dep_names'], 'desc' => $ph['date'], 'photo' => $ph['page'], 'photo_credit' => trim($ph['author'] . ' · ' . $ph['licence'], ' ·'), 'url' => $x['url'], 'category' => $x['category'], 'lat' => $x['lat'], 'lon' => $x['lon']]; }
        }
        return ['ok' => true, 'rows' => $rows];
    }
    if ($kind === 'ecoles') {
        $D = tr_data('ecoles'); if (!$D) { return ['ok' => true, 'rows' => []]; }
        return ['ok' => true, 'rows' => array_map(static function ($r) { $x = tr_school_row($r); $x['kind_label'] = i18n_t($x['kind_label']); return $x; }, $D['rows'])];
    }
    if ($kind === 'prenoms') {
        $D = tr_data('prenoms'); $rows = [];
        foreach ($D['n'] ?? [] as $k => $v) { $rows[$k] = ['name' => $k, 'text' => $v, 'where' => i18n_t('dans l’app'), 'url' => tr_wikt_url($k) . '#Prénom']; }
        foreach (glob(tr_cache_dir() . '/*.json') ?: [] as $f) {
            $j = json_decode((string) @file_get_contents($f), true);
            if (!is_array($j) || !preg_match('/^wikt:(prenom|nom):(.+)$/u', (string) ($j['key'] ?? ''), $m) || empty($j['data']['text'])) { continue; }
            $t = (string) $j['data']['title'];
            $rows[$m[1] . ':' . $t] = ['name' => $t, 'text' => (string) $j['data']['text'], 'where' => $m[1] === 'nom' ? i18n_t('nom de famille, gardé') : i18n_t('prénom, gardé'), 'url' => tr_wikt_url($t) . ($m[1] === 'nom' ? '#Nom_de_famille' : '#Prénom')];
        }
        return ['ok' => true, 'rows' => array_values($rows)];
    }
    throw new LcndaBadInput('Liste inconnue.');
}

/* ═════════════════════ réglages : gardé sur l'ordinateur, à propos ═════════════════════ */

function tr_cache_info(): array
{
    $n = 0; $b = 0;
    foreach (glob(tr_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); }
    return ['count' => $n, 'bytes' => $b];
}
function tr_cache_clear(): array
{
    $dir = tr_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $d) { @rmdir($d); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function tr_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = tr_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}
function tr_about(): array
{
    $size = static function (string $n) { $f = tr_data_file($n); return is_file($f) ? (int) filesize($f) : 0; };
    $a = tr_data('aoc'); $r = tr_data('races'); $c = tr_data('coiffes'); $e = tr_data('ecoles'); $p = tr_data('prenoms');
    return ['ok' => true, 'cache' => tr_cache_info(), 'has' => ['aoc' => $a !== null, 'races' => $r !== null, 'coiffes' => $c !== null, 'ecoles' => $e !== null, 'prenoms' => $p !== null], 'sources' => [
        ['id' => 'aoc', 'label' => TR_INAO['label'], 'what' => i18n_t('Aires des AOC/AOP, IGP et IG, commune par commune, et leurs produits'), 'licence' => TR_INAO['licence'], 'mention' => 'INAO, data.gouv.fr', 'url' => TR_INAO['url'], 'count' => $a ? count($a['areas']) : 0, 'bytes' => $size('aoc'), 'built' => $a['built'] ?? ''],
        ['id' => 'races', 'label' => i18n_t('Wikidata et Wikipédia (infobox « origine »)'), 'what' => i18n_t('Races locales d’animaux de ferme et de chiens, pays et région d’origine'), 'licence' => 'CC0 1.0 ; CC BY-SA 4.0', 'mention' => i18n_t('Wikidata ; les contributeurs de Wikipédia'), 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing', 'count' => $r ? count($r['rows']) : 0, 'bytes' => $size('races'), 'built' => $r['built'] ?? ''],
        ['id' => 'coiffes', 'label' => i18n_t('Wikimedia Commons et Wikidata'), 'what' => i18n_t('Coiffes et costumes traditionnels des régions, avec photos'), 'licence' => i18n_t('licence propre à chaque photo'), 'mention' => i18n_t('auteur et licence sous chaque photo'), 'url' => 'https://commons.wikimedia.org/wiki/Category:Traditional_clothing_of_France', 'count' => $c ? count($c['rows']) : 0, 'bytes' => $size('coiffes'), 'built' => $c['built'] ?? ''],
        ['id' => 'ecoles', 'label' => 'Wikidata', 'what' => i18n_t('Écoles, collèges, lycées, écoles normales, séminaires et universités d’autrefois'), 'licence' => 'CC0 1.0', 'mention' => 'Wikidata', 'url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing', 'count' => $e ? count($e['rows']) : 0, 'bytes' => $size('ecoles'), 'built' => $e['built'] ?? ''],
        ['id' => 'prenoms', 'label' => i18n_t('Wiktionnaire (prénoms les plus donnés en France, liste Insee)'), 'what' => i18n_t('Le sens et l’origine des prénoms'), 'licence' => 'CC BY-SA 4.0', 'mention' => i18n_t('les contributeurs du Wiktionnaire, lien vers chaque article'), 'url' => 'https://fr.wiktionary.org/wiki/Wiktionnaire:Licence', 'count' => $p ? count($p['n']) : 0, 'bytes' => $size('prenoms'), 'built' => $p['built'] ?? ''],
        ['id' => 'wiktionnaire', 'label' => i18n_t('Wiktionnaire, en ligne'), 'what' => i18n_t('Le sens des autres prénoms et des noms de famille'), 'licence' => 'CC BY-SA 4.0', 'mention' => i18n_t('les contributeurs du Wiktionnaire, lien vers chaque article'), 'url' => 'https://fr.wiktionary.org/', 'online' => true],
    ]];
}

/* ═════════════════════ les points d'entrée (api.php) ═════════════════════ */

function tr_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'tr_place' => tr_place_info($pdo, $q),
        'tr_person' => tr_person($pdo, $q),
        'tr_nom' => tr_nom($pdo, $q),
        'tr_base_names' => tr_base_names($pdo, $q),
        'tr_list' => tr_list($pdo, $q),
        'tr_credit' => cc_credit($q),
        'tr_about' => tr_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function tr_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'tr_cache_clear' => tr_cache_clear(),
        'tr_cache_restore' => tr_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
