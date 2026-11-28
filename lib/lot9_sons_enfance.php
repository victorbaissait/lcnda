<?php
declare(strict_types=1);
/**
 * LCNDA — lot 9 « sons et enfance » : les recherches EN LIGNE (faites à la demande, gardées sur l'ordinateur) pour
 * assets/js/heritage-lot9-sons-enfance.js. Les données livrées (assets/data/l9a-*.json.gz) sont lues par la page elle-même.
 *  - GET  l9a_eu   {kind: ww1|photos|sounds, key, name, dept, lat, lon, from, to} → Europeana (API de recherche, avec la clé GRATUITE
 *                  de l'utilisateur, jamais une clé écrite ici) : seulement les notices sous licence ouverte (reusability=open :
 *                  domaine public, CC0, CC BY, CC BY-SA) → {ok, items:[{id, title, year, thumb, page, provider, rights, lic, free, media}]}
 *  - GET  l9a_gbif {kind: birds|flowers, lat, lon, keys} → GBIF : combien d'observations de chaque espèce de la liste à ~10 km
 *                  (jeux de données CC0 et CC BY 4.0 seulement) → {ok, counts:{clé: n}, total, url}
 *  - GET  l9a_xc   {sci, key} → xeno-canto (API v3, avec la clé gratuite de l'utilisateur) : un ou deux chants enregistrés en France
 *                  → {ok, recs:[{id, file, rec, loc, type, lic, url, len}]}
 *  - POST l9a_keep {id, key, place_name} → l'image Europeana rangée dans les médias (licence relue sur la notice) → {batch}
 *  - POST l9a_keep_undo {batch} · POST l9a_cache_clear → {token} · POST l9a_cache_restore {token} · GET l9a_about
 * Sans Internet : la réponse gardée (même ancienne), sinon {ok:false, offline:true}. Essai : tests/test-lot9-sons-enfance.js
 * (GENEALOGY_TEST=1 + LCNDA_TEST_L9A_DIR : les réponses sont lues dans ce dossier, rien ne part sur Internet).
 */

const L9A_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande)';
const L9A_HOSTS = ['api.europeana.eu', 'api.gbif.org', 'xeno-canto.org'];
const L9A_TTL = ['eu' => 30 * 86400, 'gbif' => 90 * 86400, 'xc' => 180 * 86400];

function l9a_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : sys_get_temp_dir()), '/') . '/cache/lot9-sons-enfance';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function l9a_cached(string $kind, string $key, callable $make): array
{
    $f = l9a_cache_dir() . '/' . sha1($kind . ':' . $key) . '.json';
    $c = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
    if (is_array($c) && isset($c['data']) && (int) $c['at'] > time() - (L9A_TTL[$kind] ?? 30 * 86400)) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    try { $data = $make(); }
    catch (Throwable $e) {
        if (is_array($c) && isset($c['data'])) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    if (($data['ok'] ?? false) === true) {
        l9a_cache_dir(true);
        @file_put_contents($f, json_encode(['key' => $kind . ':' . $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    }
    return $data + ['cached' => false, 'fetched_at' => time()];
}
/** une adresse https d'un des sites permis ; en essai : le fichier du dossier LCNDA_TEST_L9A_DIR (nommé par $step) */
function l9a_http(string $step, string $url, int $max = 8_000_000, string $accept = 'application/json'): string
{
    $dir = (string) getenv('LCNDA_TEST_L9A_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . preg_replace('/(wskey|key)=[^&]+/', '$1=***', $url) . "\n", FILE_APPEND);
        $f = $dir . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
        if (!is_file($f)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($f);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), L9A_HOSTS, true) || parse_url($url, PHP_URL_SCHEME) !== 'https') { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 45, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => L9A_UA, CURLOPT_HTTPHEADER => ['Accept: ' . $accept],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code === 401 || $code === 403) { throw new L9aKeyError(i18n_t('La clé n’est pas acceptée par le site : vérifie-la dans Réglages.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    return $body;
}
final class L9aKeyError extends RuntimeException {}
function l9a_json(string $step, string $url): array
{
    $j = json_decode(l9a_http($step, $url), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    return $j;
}
function l9a_key(array $q, string $name = 'key'): string
{
    $k = trim((string) ($q[$name] ?? ''));
    return preg_match('/^[A-Za-z0-9_-]{4,80}$/', $k) ? $k : '';
}
function l9a_first($v): string { return is_array($v) ? (string) ($v[0] ?? '') : (string) ($v ?? ''); }
/** le nom court d'une licence (adresse de la notice) */
function l9a_lic(string $u): string
{
    if (preg_match('~publicdomain/mark~i', $u)) { return 'Domaine public'; }
    if (preg_match('~publicdomain/zero~i', $u)) { return 'CC0'; }
    if (preg_match('~licenses/(by(?:-sa|-nc|-nd|-nc-sa|-nc-nd)?)/([\d.]+)~i', $u, $m)) { return 'CC ' . strtoupper($m[1]) . ' ' . $m[2]; }
    if (preg_match('~rightsstatements\.org/vocab/([A-Za-z-]+)~', $u, $m)) { return $m[1]; }
    return $u;
}
function l9a_free(string $u): bool { return (bool) preg_match('~^https?://creativecommons\.org/(publicdomain/(mark|zero)/1\.0|licenses/by(-sa)?/[\d.]+)~i', $u); }

/* ═════════════════════ Europeana ═════════════════════ */

/** une notice de la réponse de recherche → ce que la page montre */
function l9a_eu_item(array $it): ?array
{
    $rights = l9a_first($it['rights'] ?? '');
    $id = (string) ($it['id'] ?? '');
    if ($id === '' || !preg_match('~^/[A-Za-z0-9_./-]+$~', $id)) { return null; }
    $title = trim(l9a_first($it['title'] ?? ($it['dcTitleLangAware']['def'] ?? '')));
    $year = (int) preg_replace('/\D.*$/', '', l9a_first($it['year'] ?? ''));
    $media = l9a_first($it['edmIsShownBy'] ?? '');
    return ['id' => $id, 'title' => mb_substr($title !== '' ? $title : i18n_t('Sans titre'), 0, 200), 'year' => $year ?: null,
        'thumb' => l9a_first($it['edmPreview'] ?? ''), 'page' => 'https://www.europeana.eu/item' . $id, 'provider' => mb_substr(l9a_first($it['dataProvider'] ?? ''), 0, 160),
        'creator' => mb_substr((string) implode(', ', array_filter(array_map('strval', array_slice((array) ($it['dcCreator'] ?? []), 0, 2)), static fn($c) => !str_starts_with($c, 'http'))), 0, 160),
        'rights' => $rights, 'lic' => l9a_lic($rights), 'free' => l9a_free($rights), 'type' => (string) ($it['type'] ?? ''),
        'media' => preg_match('~^https://.+\.(mp3|ogg|oga|wav|m4a)(\?.*)?$~i', $media) ? $media : '',
        'lat' => is_numeric(l9a_first($it['edmPlaceLatitude'] ?? '')) ? (float) l9a_first($it['edmPlaceLatitude']) : null,
        'lon' => is_numeric(l9a_first($it['edmPlaceLongitude'] ?? '')) ? (float) l9a_first($it['edmPlaceLongitude']) : null];
}
function l9a_eu_url(array $params, string $key): string
{
    $q = [];
    foreach ($params as $k => $v) { foreach ((array) $v as $x) { $q[] = rawurlencode($k) . '=' . rawurlencode((string) $x); } }
    return 'https://api.europeana.eu/record/v2/search.json?wskey=' . rawurlencode($key) . '&' . implode('&', $q);
}
/** GET l9a_eu */
function l9a_eu(array $q): array
{
    $key = l9a_key($q);
    if ($key === '') { return ['ok' => false, 'nokey' => true, 'message' => i18n_t('Il faut ta clé Europeana (gratuite) : Réglages → « 🔊 Sons et enfance ».')]; }
    $kind = (string) ($q['kind'] ?? '');
    if (!in_array($kind, ['ww1', 'photos', 'sounds'], true)) { throw new LcndaBadInput('Sorte inconnue.'); }
    $name = trim(safe_text($q['name'] ?? '')); $dept = trim(safe_text($q['dept'] ?? ''));
    $from = max(1800, min(2000, safe_int($q['from'] ?? 1850) ?: 1850)); $to = max($from, min(2000, safe_int($q['to'] ?? 1960) ?: 1960));
    $lat = is_numeric($q['lat'] ?? null) ? (float) $q['lat'] : null; $lon = is_numeric($q['lon'] ?? null) ? (float) $q['lon'] : null;
    if ($kind !== 'sounds' && mb_strlen($name) < 2 && $lat === null) { return ['ok' => false, 'noplace' => true]; }
    $p = ['rows' => 24, 'profile' => 'standard', 'reusability' => 'open', 'qf' => ['YEAR:[' . $from . ' TO ' . $to . ']']];
    if ($kind === 'ww1') { $p['theme'] = 'ww1'; }
    if ($kind === 'photos') { $p['qf'][] = 'TYPE:IMAGE'; }
    if ($kind === 'sounds') { $p['qf'][] = 'TYPE:SOUND'; $p['qf'][] = 'LANGUAGE:fr'; }
    if ($kind === 'sounds') { $p['query'] = '*'; }
    elseif ($name !== '') {
        // le nom de la commune (entre guillemets) ; avec le département quand il est connu, pour écarter les homonymes lointains
        $p['query'] = '"' . str_replace('"', '', $name) . '"' . ($dept !== '' ? ' AND ("' . str_replace('"', '', $dept) . '" OR "' . str_replace('"', '', $name) . '")' : '');
    } else { $p['query'] = '*'; }
    if ($kind !== 'sounds' && $lat !== null && $lon !== null && $name === '') {
        $p['qf'][] = 'pl_wgs84_pos_lat:[' . ($lat - 0.1) . ' TO ' . ($lat + 0.1) . ']'; $p['qf'][] = 'pl_wgs84_pos_long:[' . ($lon - 0.14) . ' TO ' . ($lon + 0.14) . ']';
    }
    $cacheKey = json_encode([$kind, mb_strtolower($name), mb_strtolower($dept), $from, $to, $name === '' ? [$lat, $lon] : null]);
    return l9a_cached('eu', (string) $cacheKey, static function () use ($p, $key, $kind) {
        try { $j = l9a_json('eu-' . $kind . '.json', l9a_eu_url($p, $key)); }
        catch (L9aKeyError $e) { return ['ok' => false, 'badkey' => true, 'message' => $e->getMessage()]; }
        if (($j['success'] ?? true) === false) { return ['ok' => false, 'badkey' => stripos((string) ($j['error'] ?? ''), 'key') !== false, 'message' => (string) ($j['error'] ?? i18n_t('Réponse illisible du site.'))]; }
        $items = [];
        foreach ($j['items'] ?? [] as $it) { if (is_array($it) && ($x = l9a_eu_item($it)) && $x['free']) { $items[] = $x; } }
        return ['ok' => true, 'items' => $items, 'total' => (int) ($j['totalResults'] ?? count($items)),
            'search' => 'https://www.europeana.eu/fr/search?' . http_build_query(['query' => $p['query'], 'reusability' => 'open', 'qf' => $p['qf']] + (isset($p['theme']) ? ['collection' => $p['theme']] : []))];
    });
}

/* ═════════════════════ GBIF ═════════════════════ */

/** GET l9a_gbif : les observations des espèces de la liste à ~10 km (CC0 et CC BY 4.0 seulement) */
function l9a_gbif(array $q): array
{
    $kind = (string) ($q['kind'] ?? '');
    if (!in_array($kind, ['birds', 'flowers'], true)) { throw new LcndaBadInput('Sorte inconnue.'); }
    if (!is_numeric($q['lat'] ?? null) || !is_numeric($q['lon'] ?? null)) { return ['ok' => false, 'noplace' => true]; }
    $lat = round((float) $q['lat'], 2); $lon = round((float) $q['lon'], 2);
    $keys = array_values(array_unique(array_filter(array_map('intval', explode(',', (string) ($q['keys'] ?? ''))), static fn($k) => $k > 0)));
    if (!$keys || count($keys) > 120) { throw new LcndaBadInput('Espèces inconnues.'); }
    sort($keys);
    $dLat = 0.09; $dLon = round(0.09 / max(0.2, cos(deg2rad($lat))), 3); // ~10 km
    $box = ['decimalLatitude' => ($lat - $dLat) . ',' . ($lat + $dLat), 'decimalLongitude' => ($lon - $dLon) . ',' . ($lon + $dLon)];
    return l9a_cached('gbif', $kind . '|' . $lat . '|' . $lon . '|' . sha1(implode(',', $keys)), static function () use ($keys, $box, $kind) {
        $qs = http_build_query($box + ['facet' => 'speciesKey', 'facetLimit' => 200, 'limit' => 0, 'occurrenceStatus' => 'PRESENT', 'hasGeospatialIssue' => 'false']);
        foreach ($keys as $k) { $qs .= '&taxonKey=' . $k; }
        $qs .= '&license=CC0_1_0&license=CC_BY_4_0';
        $j = l9a_json('gbif-' . $kind . '.json', 'https://api.gbif.org/v1/occurrence/search?' . $qs);
        $counts = [];
        foreach ($j['facets'][0]['counts'] ?? [] as $c) { $counts[(string) (int) $c['name']] = (int) $c['count']; }
        $web = 'https://www.gbif.org/occurrence/search?' . http_build_query($box + ['occurrence_status' => 'present']) . '&' . implode('&', array_map(static fn($k) => 'taxon_key=' . $k, $keys)) . '&license=CC0_1_0&license=CC_BY_4_0';
        return ['ok' => true, 'counts' => $counts, 'total' => (int) ($j['count'] ?? 0), 'url' => $web];
    });
}

/* ═════════════════════ xeno-canto ═════════════════════ */

/** GET l9a_xc : un ou deux chants de l'espèce, enregistrés en France si possible (qualité A ou B) */
function l9a_xc(array $q): array
{
    $key = l9a_key($q);
    if ($key === '') { return ['ok' => false, 'nokey' => true, 'message' => i18n_t('Il faut ta clé xeno-canto (gratuite) : Réglages → « 🔊 Sons et enfance ».')]; }
    $sci = trim(safe_text($q['sci'] ?? ''));
    if (!preg_match('/^[A-Z][a-z]+ [a-z-]+$/', $sci)) { throw new LcndaBadInput('Espèce inconnue.'); }
    return l9a_cached('xc', $sci, static function () use ($sci, $key) {
        $recs = [];
        foreach (['sp:"' . $sci . '" cnt:France q:A', 'sp:"' . $sci . '" q:A'] as $i => $query) {
            try { $j = l9a_json('xc-' . $i . '.json', 'https://xeno-canto.org/api/3/recordings?' . http_build_query(['query' => $query, 'key' => $key, 'per_page' => 50])); }
            catch (L9aKeyError $e) { return ['ok' => false, 'badkey' => true, 'message' => $e->getMessage()]; }
            if (isset($j['error'])) { return ['ok' => false, 'badkey' => stripos((string) ($j['message'] ?? ''), 'key') !== false, 'message' => (string) ($j['message'] ?? $j['error'])]; }
            $list = $j['recordings'] ?? [];
            usort($list, static fn($a, $b) => (int) (stripos((string) ($b['type'] ?? ''), 'song') !== false) <=> (int) (stripos((string) ($a['type'] ?? ''), 'song') !== false));
            foreach ($list as $r) {
                $file = (string) ($r['file'] ?? ''); $lic = (string) ($r['lic'] ?? '');
                if ($file === '' || $lic === '') { continue; }
                if (str_starts_with($file, '//')) { $file = 'https:' . $file; }
                if (str_starts_with($lic, '//')) { $lic = 'https:' . $lic; }
                if (!preg_match('~^https://xeno-canto\.org/~', $file) || !preg_match('~^https://creativecommons\.org/~', $lic)) { continue; }
                $recs[] = ['id' => (string) ($r['id'] ?? ''), 'file' => $file, 'rec' => mb_substr((string) ($r['rec'] ?? ''), 0, 120), 'loc' => mb_substr((string) ($r['loc'] ?? ''), 0, 160), 'cnt' => (string) ($r['cnt'] ?? ''),
                    'type' => mb_substr((string) ($r['type'] ?? ''), 0, 60), 'lic' => $lic, 'licname' => l9a_lic($lic), 'url' => 'https://xeno-canto.org/' . rawurlencode((string) ($r['id'] ?? '')), 'len' => (string) ($r['length'] ?? ''), 'date' => (string) ($r['date'] ?? '')];
                if (count($recs) >= 2) { break 2; }
            }
            if ($recs) { break; }
        }
        return ['ok' => true, 'recs' => $recs];
    });
}

/* ═════════════════════ « ＋ Garder dans les médias » (image Europeana sous licence ouverte) ═════════════════════ */

function l9a_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS l9a_keeps (batch TEXT PRIMARY KEY, media_id INTEGER NOT NULL, source_id INTEGER NOT NULL DEFAULT 0, filename TEXT NOT NULL DEFAULT '',
        ref TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, undone_at TEXT NOT NULL DEFAULT '')");
}
/** POST l9a_keep {id, key, place_name} : la notice est relue sur Europeana ; seulement sous licence ouverte */
function l9a_keep(PDO $pdo, array $d): array
{
    l9a_schema($pdo);
    $id = (string) ($d['id'] ?? ''); $key = l9a_key($d);
    if (!preg_match('~^/[A-Za-z0-9_-]{1,40}/[A-Za-z0-9_.-]{1,200}$~', $id)) { throw new LcndaBadInput('Notice inconnue.'); }
    if ($key === '') { throw new LcndaBadInput(i18n_t('Il faut ta clé Europeana (gratuite) : Réglages → « 🔊 Sons et enfance ».')); }
    $j = l9a_json('eu-record.json', 'https://api.europeana.eu/record/v2' . $id . '.json?wskey=' . rawurlencode($key));
    $o = $j['object'] ?? [];
    $agg = $o['aggregations'][0] ?? []; $proxy = $o['proxies'][0] ?? [];
    $rights = l9a_first($agg['edmRights']['def'] ?? '');
    if (!l9a_free($rights)) { throw new RuntimeException(i18n_t('Cette image n’est pas sous licence libre : elle reste sur Europeana (le lien suffit).')); }
    $title = trim(l9a_first($o['title'] ?? ($proxy['dcTitle']['def'] ?? ''))) ?: i18n_t('Sans titre');
    $provider = l9a_first($agg['edmDataProvider']['def'] ?? '');
    $creator = l9a_first($proxy['dcCreator']['def'] ?? ''); if (str_starts_with($creator, 'http')) { $creator = ''; }
    $year = l9a_first($o['year'] ?? '');
    $page = 'https://www.europeana.eu/item' . $id;
    // l'image passe par le service de vignettes d'Europeana (le même site) : 400 px
    $prev = (string) ($o['europeanaAggregation']['edmPreview'] ?? '');
    $src = l9a_first($agg['edmIsShownBy'] ?? '') ?: l9a_first($agg['edmObject'] ?? '');
    $url = preg_match('~^https://api\.europeana\.eu/thumbnail/~', $prev) ? $prev : ($src !== '' ? 'https://api.europeana.eu/thumbnail/v3/400/' . md5($src) : '');
    if ($url === '') { throw new RuntimeException(i18n_t('Cette notice n’a pas d’image.')); }
    $bin = l9a_http('eu-image.jpg', $url, 15_000_000, 'image/*');
    $info = @getimagesizefromstring($bin);
    $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'][$info[2] ?? 0] ?? null;
    if (!$ext) { throw new RuntimeException(i18n_t('Ce n’est pas une image (JPEG ou PNG).')); }
    if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (@file_put_contents(MEDIA_DIR . '/' . $name, $bin) === false) { throw new RuntimeException(i18n_t('Impossible d’enregistrer l’image.')); }
    $place = mb_substr(trim(safe_text($d['place_name'] ?? '')), 0, 120);
    $lic = l9a_lic($rights);
    $attribution = trim(($creator !== '' ? $creator . ', ' : '') . $title . ($year !== '' ? ' (' . $year . ')' : '') . ' — ' . ($provider !== '' ? $provider . ' — ' : '') . 'Europeana — ' . $lic . ' — ' . $page);
    $batch = 'l9a-' . bin2hex(random_bytes(6));
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_title, document_url, document_reference) VALUES(?,?,?,?,?,?,?,?,?)')
            ->execute([mb_substr($title, 0, 300), mb_substr(($place !== '' ? $place . ".\n" : '') . $attribution, 0, 1000), 'image', $name, $name, $year, 'Europeana' . ($provider !== '' ? ' — ' . $provider : ''), $page, $lic]);
        $mid = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([mb_substr('Europeana — ' . $title, 0, 400), mb_substr($creator, 0, 200), mb_substr($provider !== '' ? $provider : 'Europeana', 0, 200), $lic, $page, $attribution]);
        $sid = (int) $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mid, $sid]);
        $pdo->prepare('INSERT INTO l9a_keeps(batch, media_id, source_id, filename, ref) VALUES(?,?,?,?,?)')->execute([$batch, $mid, $sid, $name, $id]);
        if (function_exists('log_change')) { log_change($pdo, 'media', $mid, 'create', i18n_t('Image gardée depuis Europeana') . ' — ' . $lic); }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        @unlink(MEDIA_DIR . '/' . $name);
        throw $e;
    }
    return ['ok' => true, 'batch' => $batch, 'media_id' => $mid, 'licence' => $lic];
}
function l9a_keep_undo(PDO $pdo, array $d): array
{
    l9a_schema($pdo);
    $batch = (string) ($d['batch'] ?? '');
    if (!preg_match('/^l9a-[0-9a-f]{12}$/', $batch)) { throw new LcndaBadInput('Ajout inconnu.'); }
    $s = $pdo->prepare("SELECT * FROM l9a_keeps WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException(i18n_t('Déjà annulé, ou introuvable.')); }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM media_links WHERE media_id=?')->execute([(int) $r['media_id']]);
        $pdo->prepare('DELETE FROM media WHERE id=?')->execute([(int) $r['media_id']]);
        $pdo->prepare('DELETE FROM source_links WHERE source_record_id=?')->execute([(int) $r['source_id']]);
        $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([(int) $r['source_id']]);
        $pdo->prepare('UPDATE l9a_keeps SET undone_at=CURRENT_TIMESTAMP WHERE batch=?')->execute([$batch]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if (preg_match('/^[0-9a-f]{32}\.\w+$/', (string) $r['filename'])) { @unlink(MEDIA_DIR . '/' . $r['filename']); }
    return ['ok' => true];
}

/* ═════════════════════ ce qui est gardé ═════════════════════ */

function l9a_about(): array { $n = 0; $b = 0; foreach (glob(l9a_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); } return ['ok' => true, 'cache' => ['count' => $n, 'bytes' => $b]]; }
function l9a_cache_clear(): array
{
    $dir = l9a_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $x) { @rmdir($x); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function l9a_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = l9a_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}

/* ═════════════════════ les points d'entrée (api.php) ═════════════════════ */

function l9a_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'l9a_eu' => l9a_eu($q),
        'l9a_gbif' => l9a_gbif($q),
        'l9a_xc' => l9a_xc($q),
        'l9a_about' => l9a_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function l9a_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'l9a_keep' => l9a_keep($pdo, $d),
        'l9a_keep_undo' => l9a_keep_undo($pdo, $d),
        'l9a_cache_clear' => l9a_cache_clear(),
        'l9a_cache_restore' => l9a_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
