<?php
declare(strict_types=1);

/**
 * 🏡 Pays et mémoire — la partie EN LIGNE (assets/js/heritage-pays-memoire.js ; le reste se lit dans le navigateur, assets/data/pm-*).
 *
 *  · 🎞️ Films d'archives libres de sa ville, à la demande, gardés 30 jours sur l'ordinateur :
 *     – Wikimedia Commons (API commons.wikimedia.org/w/api.php) : vidéos dont le titre dit la commune, ou rangées dans
 *       « Category:Videos of <commune> » / « Category:Films of <commune> » ; on garde celles datées de 1970 au plus tard
 *       (date du fichier ou année dans le titre) ; licence et auteur lus fichier par fichier (Commons n'a que des fichiers libres) ;
 *     – Internet Archive (archive.org/advancedsearch.php, mediatype:movies, année ≤ 1970) : seulement les films marqués domaine
 *       public (Public Domain Mark, CC0), sous licence libre (CC BY, CC BY-SA), ou des collections de films du gouvernement des
 *       États-Unis (FedFlix, usgovfilms, wwIIarchive : domaine public). Les autres ne sont pas montrés.
 *  · Ce qui part sur Internet : le nom de la commune. Jamais de nom de personne.
 *  · Rien n'est écrit dans la généalogie. 🗑 « Effacer les réponses gardées » se rattrape (↶).
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_PM_DIR (un fichier <étape> par appel réseau ; absent = hors ligne).
 */

const PM_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const PM_TTL = 30 * 86400;
const PM_HOSTS = ['commons.wikimedia.org', 'archive.org'];
const PM_MAX_YEAR = 1970;
const PM_IA_FREE_COLL = ['fedflix', 'usgovfilms', 'wwiiarchive', 'prelinger'];
const PM_SOURCES = [
    'commons' => ['label' => 'Wikimedia Commons — vidéos', 'licence' => 'licence libre de chaque fichier (écrite sous le film)', 'mention' => 'Wikimedia Commons', 'url' => 'https://commons.wikimedia.org/'],
    'archive' => ['label' => 'Internet Archive — films (mediatype « movies »)', 'licence' => 'domaine public ou licence libre (écrite sous le film)', 'mention' => 'Internet Archive', 'url' => 'https://archive.org/details/movies'],
];

function pm_fold(string $s): string
{
    $s = mb_strtolower($s, 'UTF-8');
    $t = class_exists('Normalizer') ? (string) Normalizer::normalize($s, Normalizer::FORM_D) : $s;
    $t = (string) preg_replace('/\p{Mn}+/u', '', $t);
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $t));
}
function pm_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : sys_get_temp_dir()), '/') . '/cache/pays-memoire';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function pm_cached(string $key, callable $make): array
{
    $f = pm_cache_dir() . '/' . sha1($key) . '.json';
    $c = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
    if (is_array($c) && isset($c['data']) && (int) $c['at'] > time() - PM_TTL) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    try { $data = $make(); }
    catch (Throwable $e) {
        if (is_array($c) && isset($c['data'])) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    pm_cache_dir(true);
    @file_put_contents($f, json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $data + ['cached' => false, 'fetched_at' => time()];
}
function pm_http(string $step, string $url, int $max = 4_000_000): string
{
    $dir = (string) getenv('LCNDA_TEST_PM_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        $f = $dir . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
        if (!is_file($f)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($f);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), PM_HOSTS, true) || parse_url($url, PHP_URL_SCHEME) !== 'https') { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => PM_UA, CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    if (PHP_SAPI === 'cli' && ($rec = (string) getenv('LCNDA_PM_RECORD_DIR')) !== '') { @file_put_contents($rec . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step), $body); }
    return $body;
}
function pm_json(string $step, string $url): array
{
    $j = json_decode(pm_http($step, $url), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    return $j;
}
function pm_strip(string $html): string { return trim((string) preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'))); }
/** l'année d'un film : la date du fichier, sinon une année (1880–1970) écrite dans le titre */
function pm_film_year(string $date, string $title): ?int
{
    if (preg_match('/\b(18[89]\d|19\d\d|20\d\d)\b/', $date, $m)) { return (int) $m[1]; }
    if (preg_match('/\b(18[89]\d|19[0-6]\d|1970)\b/', $title, $m)) { return (int) $m[1]; }
    return null;
}
/** le nom de la commune est-il dans ce texte (mots entiers, sans accents) ? */
function pm_names_in(string $name, string $text): bool
{
    $n = pm_fold($name); $t = ' ' . pm_fold($text) . ' ';
    return $n !== '' && str_contains($t, ' ' . $n . ' ');
}

/* ═════════════════════ 🎞️ Wikimedia Commons ═════════════════════ */
function pm_commons(string $name): array
{
    $cat = str_replace(' ', '_', $name);
    $out = [];
    // 1. le titre dit la commune ; 2. les mêmes, marqués « domaine public » (P6216 = Q19652) : les vieux films passent devant ; 3. les catégories
    foreach ([['commons-search.json', 'filetype:video intitle:"' . $name . '"'], ['commons-pd.json', 'filetype:video intitle:"' . $name . '" haswbstatement:P6216=Q19652'], ['commons-cat.json', 'filetype:video incategory:"Videos_of_' . $cat . '"|"Films_of_' . $cat . '"']] as [$step, $q]) {
        $u = 'https://commons.wikimedia.org/w/api.php?' . http_build_query(['action' => 'query', 'format' => 'json', 'generator' => 'search', 'gsrnamespace' => 6, 'gsrlimit' => 40, 'gsrsearch' => $q,
            'prop' => 'imageinfo', 'iiprop' => 'url|extmetadata|mediatype', 'iiurlwidth' => 320, 'iiextmetadatafilter' => 'DateTimeOriginal|LicenseShortName|Artist|ImageDescription|ObjectName']);
        $j = pm_json($step, $u);
        foreach (($j['query']['pages'] ?? []) as $p) {
            $ii = $p['imageinfo'][0] ?? []; $m = $ii['extmetadata'] ?? [];
            $g = static fn(string $k): string => pm_strip((string) ($m[$k]['value'] ?? ''));
            $title = (string) preg_replace('/^File:|\.(webm|ogv|ogg|mpg|mpeg|mp4)$/i', '', (string) ($p['title'] ?? ''));
            if ($step !== 'commons-cat.json' && !pm_names_in($name, $title)) { continue; }
            $y = pm_film_year($g('DateTimeOriginal'), $title . ' ' . $g('ObjectName'));
            if ($y === null || $y > PM_MAX_YEAR) { continue; }
            $lic = $g('LicenseShortName');
            if ($lic === '') { continue; }
            $key = 'commons:' . ($p['title'] ?? '');
            $out[$key] = ['src' => 'commons', 'title' => str_replace('_', ' ', $title), 'year' => $y, 'licence' => $lic, 'by' => mb_substr($g('Artist'), 0, 120),
                'page' => (string) ($ii['descriptionurl'] ?? ''), 'video' => (string) ($ii['url'] ?? ''), 'thumb' => (string) ($ii['thumburl'] ?? ''), 'desc' => mb_substr($g('ImageDescription'), 0, 240)];
        }
    }
    return array_values($out);
}

/* ═════════════════════ 🎞️ Internet Archive ═════════════════════ */
function pm_ia_free(array $d): string
{
    $lic = strtolower((string) ($d['licenseurl'] ?? ''));
    if (str_contains($lic, 'publicdomain/mark')) { return 'Domaine public (Public Domain Mark)'; }
    if (str_contains($lic, 'publicdomain/zero')) { return 'CC0 1.0'; }
    if (preg_match('#licenses/(by|by-sa)/(\d\.\d)#', $lic, $m)) { return 'CC ' . strtoupper($m[1]) . ' ' . $m[2]; }
    if ($lic === '') {
        $coll = array_map('strtolower', (array) ($d['collection'] ?? []));
        if (array_intersect($coll, PM_IA_FREE_COLL)) { return 'Domaine public (film du gouvernement des États-Unis ou collection Prelinger)'; }
    }
    return '';
}
function pm_archive(string $name): array
{
    $q = 'mediatype:movies AND (title:("' . str_replace('"', '', $name) . '") OR subject:("' . str_replace('"', '', $name) . '")) AND year:[1880 TO ' . PM_MAX_YEAR . ']';
    $u = 'https://archive.org/advancedsearch.php?' . http_build_query(['q' => $q, 'fl' => ['identifier', 'title', 'year', 'date', 'licenseurl', 'collection', 'creator'], 'rows' => 50, 'output' => 'json']);
    $u = (string) preg_replace('/fl%5B\d+%5D/', 'fl%5B%5D', $u);
    $j = pm_json('archive.json', $u);
    $out = [];
    foreach (($j['response']['docs'] ?? []) as $d) {
        $id = (string) ($d['identifier'] ?? ''); $title = is_array($d['title'] ?? null) ? (string) $d['title'][0] : (string) ($d['title'] ?? '');
        if ($id === '' || !preg_match('/^[A-Za-z0-9._-]+$/', $id) || !pm_names_in($name, $title . ' ' . implode(' ', (array) ($d['subject'] ?? [])))) { continue; }
        $lic = pm_ia_free($d); if ($lic === '') { continue; }
        $y = is_numeric($d['year'] ?? null) ? (int) $d['year'] : pm_film_year((string) ($d['date'] ?? ''), $title);
        if ($y === null || $y > PM_MAX_YEAR) { continue; }
        $out[] = ['src' => 'archive', 'title' => $title, 'year' => $y, 'licence' => $lic, 'by' => mb_substr(is_array($d['creator'] ?? null) ? implode(', ', $d['creator']) : (string) ($d['creator'] ?? ''), 0, 120),
            'page' => 'https://archive.org/details/' . $id, 'embed' => 'https://archive.org/embed/' . $id, 'thumb' => 'https://archive.org/services/img/' . $id, 'id' => $id];
    }
    return $out;
}

/** GET pm_films&name=…&insee=… → {ok, place, items:[{src, title, year, licence, by, page, video|embed, thumb}], sources} */
function pm_films(array $q): array
{
    $name = trim((string) preg_replace('/\s*[,(].*$/u', '', safe_text($q['name'] ?? '')));
    if ($name === '' || mb_strlen($name) > 80) { return ['ok' => false, 'message' => i18n_t('Choisis une commune.')]; }
    $insee = strtoupper(trim(safe_text($q['insee'] ?? '')));
    if (!preg_match('/^(\d{5}|2[AB]\d{3})$/', $insee)) { $insee = ''; }
    $r = pm_cached('films:' . pm_fold($name), static function () use ($name) {
        $errors = []; $items = [];
        foreach (['commons' => 'pm_commons', 'archive' => 'pm_archive'] as $k => $fn) {
            try { $items = array_merge($items, $fn($name)); } catch (Throwable $e) { $errors[$k] = $e->getMessage(); }
        }
        if (count($errors) === 2) { throw new RuntimeException(reset($errors)); }
        usort($items, static fn($a, $b) => [$a['year'], $a['title']] <=> [$b['year'], $b['title']]);
        return ['ok' => true, 'name' => $name, 'items' => array_slice($items, 0, 30), 'partial' => array_keys($errors)];
    });
    return $r + ['place' => ['name' => $name, 'insee' => $insee], 'sources' => array_values(array_map(static fn($k) => ['id' => $k] + PM_SOURCES[$k], array_keys(PM_SOURCES)))];
}
/** GET pm_list_films&query={q, near, years, …} → les films déjà gardés sur l'ordinateur (toutes communes), pour Listes */
function pm_list_films(array $in): array
{
    $q = is_string($in['query'] ?? null) ? (json_decode((string) $in['query'], true) ?: []) : [];
    $text = pm_fold((string) ($q['q'] ?? ''));
    $rows = [];
    foreach (glob(pm_cache_dir() . '/*.json') ?: [] as $f) {
        $c = json_decode((string) @file_get_contents($f), true);
        if (!is_array($c) || !str_starts_with((string) ($c['key'] ?? ''), 'films:')) { continue; }
        foreach ($c['data']['items'] ?? [] as $it) {
            $row = ['titre' => $it['title'], 'annee' => $it['year'], 'commune' => $c['data']['name'] ?? '', 'source' => $it['src'] === 'commons' ? 'Wikimedia Commons' : 'Internet Archive', 'licence' => $it['licence'], 'auteur' => $it['by'] ?? '', 'url' => $it['page']];
            if ($text !== '' && !str_contains(pm_fold(implode(' ', $row)), $text)) { continue; }
            $yrs = $q['years'] ?? null;
            if (is_array($yrs) && ((isset($yrs['from']) && is_numeric($yrs['from']) && $row['annee'] < (int) $yrs['from']) || (isset($yrs['to']) && is_numeric($yrs['to']) && $row['annee'] > (int) $yrs['to']))) { continue; }
            $ok = true;
            foreach ((array) ($q['filters'] ?? []) as $flt) {
                $k = (string) ($flt['key'] ?? ''); $v = pm_fold((string) ($flt['value'] ?? ''));
                if ($k !== '' && array_key_exists($k, $row) && $v !== '' && !str_contains(pm_fold((string) $row[$k]), $v)) { $ok = false; break; }
            }
            if ($ok) { $rows[] = $row; }
        }
    }
    $sort = (string) ($q['sort'] ?? 'annee'); $dir = ($q['dir'] ?? 'asc') === 'desc' ? -1 : 1;
    usort($rows, static fn($a, $b) => $dir * (($a[$sort] ?? '') <=> ($b[$sort] ?? '')));
    $total = count($rows);
    $off = max(0, (int) ($q['offset'] ?? 0)); $lim = max(1, min(500, (int) ($q['limit'] ?? 200)));
    return ['rows' => array_slice($rows, $off, $lim), 'total' => $total, 'message' => $total ? '' : i18n_t('Les films s’ajoutent ici quand tu ouvres la fiche d’une commune (ils viennent d’Internet).')];
}

/* ═════════════════════ réponses gardées ═════════════════════ */
function pm_cache_info(): array { $n = 0; $b = 0; foreach (glob(pm_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); } return ['count' => $n, 'bytes' => $b]; }
function pm_cache_clear(): array
{
    $dir = pm_cache_dir(); $token = bin2hex(random_bytes(8)); $trash = $dir . '/.trash-' . $token; $n = 0;
    foreach (glob($dir . '/*.json') ?: [] as $f) { if (!is_dir($trash)) { @mkdir($trash, 0775, true); } if (@rename($f, $trash . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function pm_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{16}$/', $token)) { throw new LcndaBadInput(i18n_t('Rien à remettre.')); }
    $trash = pm_cache_dir() . '/.trash-' . $token; $n = 0;
    foreach (glob($trash . '/*.json') ?: [] as $f) { if (@rename($f, pm_cache_dir() . '/' . basename($f))) { $n++; } }
    @rmdir($trash);
    return ['ok' => true, 'restored' => $n];
}
function pm_about(): array
{
    return ['sources' => array_values(array_map(static fn($k) => ['id' => $k] + PM_SOURCES[$k], array_keys(PM_SOURCES))), 'cache' => pm_cache_info()];
}

function pm_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'pm_films' => pm_films($q),
        'pm_list_films' => pm_list_films($q),
        'pm_about' => pm_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function pm_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'pm_cache_clear' => pm_cache_clear(),
        'pm_cache_restore' => pm_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
