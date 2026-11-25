<?php
declare(strict_types=1);
/**
 * LCNDA — lot 10 « objets et traces » : les recherches EN LIGNE (à la demande, gardées sur l'ordinateur) pour
 * assets/js/heritage-lot10-objets-traces.js. Les données livrées (assets/data/l10-*.json.gz) sont lues par la page elle-même.
 *  - GET l10_cloches {id | insee} → 🔔 les cloches de la commune : la liste vient du pack « Patrimoine » déjà installé
 *        (lib/lieux_patrimoine.php, base Palissy, Licence Ouverte) ; le texte des inscriptions (INSC, PINS), l'historique et les
 *        personnes citées sont relus sur POP (api.pop.culture.gouv.fr/notices/palissy/<REF>, Licence Ouverte Etalab 2.0) ;
 *        + les personnes de la base qui ont vécu dans la commune et dont le NOM est dans le texte (comparaison faite ici,
 *        aucun nom ne part sur Internet) → {ok, installed, dep, insee, commune, bells:[…], people:[…]}
 *  - GET l10_musee {id | insee | name} → 🧺 les objets (outils, costumes, ex-voto…) faits, utilisés ou collectés dans la commune,
 *        base Joconde de POP (notices Licence Ouverte ; l'image seulement quand ses droits sont libres, sinon la notice et le lien)
 *  - GET l10_herbier {id | lat, lon, name, from, to} → 🌿 spécimens d'herbier cueillis dans la commune (GBIF, jeux CC0 et CC BY 4.0
 *        seulement ; la licence de chaque jeu est gardée)
 *  - GET l10_plaques {id | insee, lat, lon} → 🪧 plaques et stèles de la commune (OpenStreetMap par l'API Overpass, ODbL)
 *  - GET l10_about · POST l10_cache_clear → {token} · POST l10_cache_restore {token}
 * Ce qui part sur Internet : le code INSEE, la position ou le nom de la COMMUNE, les références POP. Jamais un nom de personne.
 * Sans Internet : la réponse gardée (même ancienne), sinon {ok:false, offline:true}.
 * Essai : tests/test-lot10-objets-traces.js (GENEALOGY_TEST=1 + LCNDA_TEST_L10_DIR : réponses lues dans ce dossier).
 */

const L10_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande)';
const L10_HOSTS = ['api.pop.culture.gouv.fr', 'api.gbif.org', 'overpass-api.de'];
const L10_TTL = ['pop' => 180 * 86400, 'joconde' => 60 * 86400, 'gbif' => 90 * 86400, 'osm' => 30 * 86400, 'gbifds' => 365 * 86400];
const L10_SOURCES = [
    'palissy' => ['label' => 'Ministère de la Culture — base Palissy (POP)', 'licence' => 'Licence Ouverte Etalab 2.0', 'url' => 'https://pop.culture.gouv.fr/mentions-legales', 'read' => '2026-11-25'],
    'joconde' => ['label' => 'Ministère de la Culture — base Joconde, collections des musées de France (POP)', 'licence' => 'Notices : Licence Ouverte Etalab 2.0 ; images : droits de chaque musée', 'url' => 'https://pop.culture.gouv.fr/mentions-legales', 'read' => '2026-11-25'],
    'gbif' => ['label' => 'GBIF.org — spécimens d’herbier', 'licence' => 'CC0 1.0 ou CC BY 4.0 (licence du jeu de données, gardée pour chaque spécimen)', 'url' => 'https://www.gbif.org/terms', 'read' => '2026-11-25'],
    'osm' => ['label' => 'OpenStreetMap (API Overpass)', 'licence' => 'ODbL 1.0 — © les contributeurs d’OpenStreetMap', 'url' => 'https://www.openstreetmap.org/copyright', 'read' => '2026-11-25'],
];

function l10_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : sys_get_temp_dir()), '/') . '/cache/lot10-objets-traces';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function l10_cached(string $kind, string $key, callable $make): array
{
    $f = l10_cache_dir() . '/' . sha1($kind . ':' . $key) . '.json';
    $c = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
    if (is_array($c) && isset($c['data']) && (int) $c['at'] > time() - (L10_TTL[$kind] ?? 30 * 86400)) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    try { $data = $make(); }
    catch (Throwable $e) {
        if (is_array($c) && isset($c['data'])) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    if (($data['ok'] ?? false) === true) {
        l10_cache_dir(true);
        @file_put_contents($f, json_encode(['key' => $kind . ':' . $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    }
    return $data + ['cached' => false, 'fetched_at' => time()];
}
/** une adresse https d'un des sites permis (une requête à la fois) ; en essai : le fichier du dossier LCNDA_TEST_L10_DIR nommé par $step */
function l10_http(string $step, string $url, ?string $post = null, int $max = 6_000_000): string
{
    $dir = (string) getenv('LCNDA_TEST_L10_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . ($post !== null ? ' ' . $post : '') . "\n", FILE_APPEND);
        $f = $dir . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
        if (!is_file($f)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($f);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), L10_HOSTS, true) || parse_url($url, PHP_URL_SCHEME) !== 'https') { throw new RuntimeException('Adresse refusée.'); }
    static $last = [];
    $host = (string) parse_url($url, PHP_URL_HOST);
    $gap = $host === 'overpass-api.de' ? 2.0 : 0.4; // poli : une pause entre deux appels au même site
    if (isset($last[$host]) && ($w = $gap - (microtime(true) - $last[$host])) > 0) { usleep((int) ($w * 1e6)); }
    $body = ''; $too = false; $retry = 0;
    $ch = curl_init($url);
    $opts = [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 60, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => L10_UA, CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$retry) { if (preg_match('/^Retry-After:\s*(\d+)/i', $h, $m)) { $retry = (int) $m[1]; } return strlen($h); },
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }];
    if ($post !== null) { $opts[CURLOPT_POST] = true; $opts[CURLOPT_POSTFIELDS] = $post; }
    curl_setopt_array($ch, $opts + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    $last[$host] = microtime(true);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code === 429 || $code === 503 || $code === 504) { throw new RuntimeException(i18n_t('Le site est occupé : réessaie dans {n} secondes.', ['n' => (string) max(30, min(600, $retry))])); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    return $body;
}
function l10_json(string $step, string $url, ?string $post = null): array
{
    $j = json_decode(l10_http($step, $url, $post), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    return $j;
}
function l10_fold(string $s): string
{
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o',
        'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'œ' => 'oe', 'æ' => 'ae', 'ñ' => 'n']);
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
}
function l10_str($v): string { return is_array($v) ? implode(' ; ', array_map('strval', array_filter($v, 'is_scalar'))) : trim((string) ($v ?? '')); }
function l10_km(float $a, float $b, float $c, float $d): float { $r = M_PI / 180; $x = ($d - $b) * $r * cos(($a + $c) / 2 * $r); $y = ($c - $a) * $r; return 6371 * sqrt($x * $x + $y * $y); }

/** la commune demandée : {id, name, insee, dep, lat, lon} (le lieu de la base, ou le code INSEE / la position donnés) */
function l10_place(PDO $pdo, array $q): array
{
    $id = safe_int($q['id'] ?? 0); $pl = null;
    if ($id > 0) { $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$id]); $pl = $s->fetch(PDO::FETCH_ASSOC) ?: null; }
    $insee = strtoupper(trim((string) ($q['insee'] ?? '')));
    if (!preg_match('/^(\d{2}|2A|2B)\d{3}$/', $insee)) { $insee = ''; }
    $name = trim(safe_text($q['name'] ?? ''));
    $lat = is_numeric($q['lat'] ?? null) ? (float) $q['lat'] : null; $lon = is_numeric($q['lon'] ?? null) ? (float) $q['lon'] : null;
    if ($pl) {
        if ($name === '') { $name = trim(explode(',', (string) $pl['name'])[0]); }
        if ($lat === null && is_numeric($pl['latitude'] ?? null) && is_numeric($pl['longitude'] ?? null) && !((float) $pl['latitude'] == 0.0 && (float) $pl['longitude'] == 0.0)) { $lat = (float) $pl['latitude']; $lon = (float) $pl['longitude']; }
        if ($insee === '') {
            if (!function_exists('lp_place_commune')) { require_once __DIR__ . '/lieux_patrimoine.php'; }
            try { $w = lp_place_commune($pdo, $pl); $insee = (string) ($w['insee'] ?? ''); } catch (Throwable) {}
            if ($insee === '' && preg_match('/^(\d{2}|2A|2B)\d{3}$/', strtoupper((string) ($pl['admin4_code'] ?? '')))) { $insee = strtoupper((string) $pl['admin4_code']); }
        }
        $country = l10_fold((string) ($pl['country'] ?? ''));
        if ($country !== '' && !in_array($country, ['france', 'fr'], true) && $insee === '') { return ['id' => $id, 'name' => $name, 'insee' => '', 'dep' => '', 'lat' => $lat, 'lon' => $lon, 'abroad' => true]; }
    }
    $dep = $insee === '' ? '' : (str_starts_with($insee, '97') ? substr($insee, 0, 3) : substr($insee, 0, 2));
    return ['id' => $id, 'name' => mb_substr($name, 0, 120), 'insee' => $insee, 'dep' => $dep, 'lat' => $lat, 'lon' => $lon, 'abroad' => false];
}

/** les personnes de la base qui ont un événement dans la commune (même code INSEE, même nom ou à moins de 3 km) */
function l10_people_here(PDO $pdo, array $p): array
{
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    $cols = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $a4 = in_array('admin4_code', $cols, true) ? 'pl.admin4_code' : "''";
    $rows = $pdo->query("SELECT p.id, p.first_name, p.last_name, p.is_private, e.year, pl.name AS pname, pl.latitude AS lat, pl.longitude AS lon, $a4 AS insee
        FROM events e JOIN persons p ON p.id=e.person_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id IS NOT NULL")->fetchAll(PDO::FETCH_ASSOC);
    $key = l10_fold($p['name'] ?? ''); $out = [];
    foreach ($rows as $r) {
        if ($kiosk && !empty($r['is_private'])) { continue; }
        $here = ($p['insee'] !== '' && strtoupper((string) $r['insee']) === $p['insee'])
            || ($key !== '' && l10_fold(explode(',', (string) $r['pname'])[0]) === $key)
            || ($p['lat'] !== null && is_numeric($r['lat']) && is_numeric($r['lon']) && !((float) $r['lat'] == 0.0) && l10_km((float) $p['lat'], (float) $p['lon'], (float) $r['lat'], (float) $r['lon']) < 3);
        if (!$here) { continue; }
        $id = (int) $r['id'];
        $o = $out[$id] ?? ['id' => $id, 'first' => trim((string) $r['first_name']), 'last' => trim((string) $r['last_name']), 'from' => null, 'to' => null];
        if (is_numeric($r['year'])) { $y = (int) $r['year']; $o['from'] = $o['from'] === null ? $y : min($o['from'], $y); $o['to'] = $o['to'] === null ? $y : max($o['to'], $y); }
        $out[$id] = $o;
    }
    return array_values(array_filter($out, static fn($o) => mb_strlen(l10_fold($o['last'])) >= 3));
}
/** les personnes dont le nom de famille est écrit dans le texte ; « full » quand le prénom y est aussi (homonymes possibles : à vérifier) */
function l10_names_in(string $text, array $people, ?int $year = null): array
{
    $t = ' ' . l10_fold($text) . ' '; $hits = [];
    foreach ($people as $o) {
        $last = l10_fold($o['last']);
        if ($last === '' || !str_contains($t, ' ' . $last . ' ')) { continue; }
        $first = l10_fold(explode(' ', trim($o['first']))[0] ?? '');
        $full = $first !== '' && mb_strlen($first) >= 3 && (bool) preg_match('/ ' . preg_quote($first, '/') . ' (?:[a-z]+ ){0,3}' . preg_quote($last, '/') . ' | ' . preg_quote($last, '/') . ' (?:[a-z]+ ){0,2}' . preg_quote($first, '/') . ' /', $t);
        // de son vivant : l'objet est daté dans les années de la personne dans la base (à 25 ans près : on ne connaît souvent qu'une partie de sa vie)
        $era = $year === null || $o['from'] === null ? null : ($year >= $o['from'] - 25 && $year <= ($o['to'] ?? $o['from']) + 25);
        $hits[] = ['id' => $o['id'], 'first' => $o['first'], 'last' => $o['last'], 'full' => $full, 'era' => $era, 'from' => $o['from'], 'to' => $o['to']];
    }
    usort($hits, static fn($a, $b) => ($b['full'] <=> $a['full']) ?: (($b['era'] ?? false) <=> ($a['era'] ?? false)));
    return array_slice($hits, 0, 12);
}

/* ═════════════════════ 🔔 les cloches (Palissy) ═════════════════════ */

function l10_pop_notice(string $ref): array
{
    if (!preg_match('/^PM[0-9A-Z]{6,12}$/', $ref)) { throw new LcndaBadInput('Référence inconnue.'); }
    return l10_cached('pop', $ref, static function () use ($ref) {
        $j = l10_json('pop-' . $ref . '.json', 'https://api.pop.culture.gouv.fr/notices/palissy/' . rawurlencode($ref));
        $g = static fn(string $k) => l10_str($j[$k] ?? '');
        return ['ok' => true, 'ref' => $ref, 'title' => mb_substr($g('TICO') ?: $g('TITR'), 0, 200), 'deno' => $g('DENO'), 'insc' => mb_substr($g('INSC'), 0, 300), 'pins' => mb_substr($g('PINS'), 0, 2000),
            'hist' => mb_substr($g('HIST'), 0, 1500), 'desc' => mb_substr($g('DESC'), 0, 800), 'pers' => mb_substr($g('PERS'), 0, 400), 'autr' => mb_substr($g('AUTR'), 0, 300),
            'date' => mb_substr($g('DATE'), 0, 80), 'scle' => mb_substr($g('SCLE'), 0, 80), 'edif' => mb_substr($g('EDIF'), 0, 160), 'com' => mb_substr($g('COM'), 0, 80), 'dpro' => mb_substr($g('DPRO'), 0, 160)];
    });
}
function l10_year_of(string ...$texts): ?int
{
    foreach ($texts as $t) { if (preg_match('/\b(1[0-9]{3})\b/', $t, $m)) { return (int) $m[1]; } }
    return null;
}
/** GET l10_cloches */
function l10_cloches(PDO $pdo, array $q): array
{
    if (!function_exists('lp_place_data')) { require_once __DIR__ . '/lieux_patrimoine.php'; }
    $p = l10_place($pdo, $q);
    if ($p['insee'] === '') { return ['ok' => false, 'noplace' => true, 'abroad' => $p['abroad']]; }
    $lp = lp_place_data($pdo, ['id' => $p['id'], 'insee' => $p['insee']]);
    $pat = $lp['patrimoine'] ?? ['installed' => false];
    $out = ['ok' => true, 'installed' => !empty($pat['installed']), 'dep' => $p['dep'], 'dep_name' => (string) ($lp['dep_name'] ?? ''), 'insee' => $p['insee'], 'commune' => (string) ($lp['commune'] ?? $p['name']), 'bells' => [], 'source' => L10_SOURCES['palissy']];
    if (empty($pat['installed'])) { return $out; }
    $list = array_values(array_filter($pat['list'] ?? [], static fn($r) => ($r['base'] ?? '') === 'palissy' && preg_match('/cloche/i', ($r['deno'] ?? '') . ' ' . ($r['nom'] ?? ''))));
    $people = $list ? l10_people_here($pdo, $p) : [];
    $offline = false;
    foreach (array_slice($list, 0, 15) as $r) {
        $n = l10_pop_notice((string) $r['ref']);
        if (!($n['ok'] ?? false)) { $offline = true; $n = []; }
        $text = implode(' ; ', array_filter([$n['pins'] ?? '', $n['hist'] ?? '', $n['pers'] ?? '', $n['desc'] ?? '', (string) ($r['resume'] ?? '')]));
        $year = l10_year_of((string) ($n['date'] ?? ''), (string) ($r['dates'] ?? ''), (string) ($n['pins'] ?? ''));
        $out['bells'][] = ['ref' => (string) $r['ref'], 'title' => (string) (($n['title'] ?? '') ?: $r['nom']), 'year' => $year, 'dates' => (string) (($n['date'] ?? '') ?: $r['dates']), 'siecle' => (string) (($n['scle'] ?? '') ?: $r['siecle']),
            'edifice' => (string) (($n['edif'] ?? '') ?: $r['edifice']), 'insc' => (string) ($n['insc'] ?? ''), 'pins' => (string) ($n['pins'] ?? ''), 'hist' => (string) (($n['hist'] ?? '') ?: $r['resume']),
            'pers' => (string) ($n['pers'] ?? ''), 'autr' => (string) ($n['autr'] ?? ''), 'protection' => (string) $r['protection'], 'read' => isset($n['ref']),
            'url' => 'https://pop.culture.gouv.fr/notice/palissy/' . rawurlencode((string) $r['ref']), 'names' => l10_names_in($text, $people, $year)];
    }
    if ($offline) { $out['partial'] = true; }
    return $out;
}

/* ═════════════════════ 🧺 les objets de la commune dans les musées (Joconde) ═════════════════════ */

/** même règle que « Ton village au musée » (lib/metiers_rivieres.php) : libre seulement si la notice le dit, jamais « tous droits réservés » */
function l10_pop_free(string $copy): bool
{
    $c = mb_strtolower($copy, 'UTF-8');
    if (preg_match('/tous droits r[ée]serv|\bnc\b|non commercial/u', $c)) { return false; }
    return preg_match('/licence ouverte|etalab|cc[- ]?by|cc0|creative commons|domaine public|public domain/u', $c) === 1;
}
/** GET l10_musee */
function l10_musee(PDO $pdo, array $q): array
{
    $p = l10_place($pdo, $q);
    if ($p['name'] === '' || mb_strlen($p['name']) < 3 || $p['abroad']) { return ['ok' => false, 'noplace' => true]; }
    return l10_cached('joconde', $p['insee'] . '|' . l10_fold($p['name']), static function () use ($p) {
        $url = 'https://api.pop.culture.gouv.fr/search/simple?' . preg_replace('/%5B\d+%5D/', '%5B%5D', http_build_query(['bases' => ['joconde'], 'text' => '"' . $p['name'] . '"', 'size' => 100]));
        $j = l10_json('joconde.json', $url);
        // la commune doit être nommée comme lieu de création, d'utilisation, de collecte… (LIEUX, PLIEUX, GEOHI), avec sa majuscule
        $re = '/(^|[^\p{L}])(' . preg_quote($p['name'], '/') . '|' . preg_quote(mb_strtoupper($p['name'], 'UTF-8'), '/') . ')([^\p{L}]|$)/u';
        // ce qui est déjà montré par « 🖼️ Ton village au musée » (métiers et rivières) : photos, cartes postales, tableaux, dessins, gravures
        $skip = '/^(photographie|peinture|dessin|estampe|beaux-arts|enluminure|sculpture|carte postale|tableau|affiche)$/u';
        $items = [];
        foreach ($j['hits'] ?? [] as $h) {
            $s = $h['_source'] ?? [];
            $ref = (string) ($s['REF'] ?? ''); if (!preg_match('/^[A-Za-z0-9_-]{4,40}$/', $ref)) { continue; }
            $where = l10_str($s['LIEUX'] ?? '') . ' ; ' . l10_str($s['PLIEUX'] ?? '') . ' ; ' . l10_str($s['GEOHI'] ?? '');
            if (!preg_match($re, $where)) { continue; }
            $dom = array_map('strval', (array) ($s['DOMN'] ?? [])); $deno = array_map('strval', (array) ($s['DENO'] ?? []));
            if (array_filter(array_merge($dom, $deno), static fn($d) => preg_match($skip, mb_strtolower(trim($d))))) { continue; }
            $role = preg_match('/' . preg_quote($p['name'], '/') . '[^;]*\(([^)]+)\)/u', $where, $m) ? $m[1] : '';
            $copy = trim(l10_str($s['COPY'] ?? ''));
            $img = l10_str($s['IMG'] ?? ''); $img = explode(' ; ', $img)[0];
            $free = $copy !== '' && l10_pop_free($copy);
            $title = trim(l10_str($s['TICO'] ?? '')) ?: trim(l10_str($s['TITR'] ?? '')) ?: implode(', ', $deno);
            $items[] = ['ref' => $ref, 'title' => mb_substr($title !== '' ? $title : $ref, 0, 200), 'deno' => mb_substr(implode(', ', $deno), 0, 120), 'domain' => mb_substr(implode(', ', $dom), 0, 160),
                'role' => mb_substr($role, 0, 80), 'when' => mb_substr(l10_str($s['MILL'] ?? '') ?: l10_str($s['PERI'] ?? ''), 0, 80), 'year' => l10_year_of(l10_str($s['MILL'] ?? ''), l10_str($s['PERI'] ?? '')),
                'museum' => mb_substr(l10_str($s['LOCA'] ?? ''), 0, 160), 'util' => mb_substr(l10_str($s['UTIL'] ?? ''), 0, 160), 'copy' => mb_substr($copy, 0, 240), 'free' => $free,
                'thumb' => $free && preg_match('#^[A-Za-z0-9_./-]+\.(jpe?g|png)$#i', $img) ? 'https://iiif.prd.cloud.culture.fr/iiif/3/' . rawurlencode($img) . '/full/300,/0/default.jpg' : '',
                'url' => 'https://pop.culture.gouv.fr/notice/joconde/' . rawurlencode($ref)];
        }
        return ['ok' => true, 'items' => array_slice($items, 0, 40), 'total' => (int) ($j['total'] ?? 0),
            'search' => 'https://pop.culture.gouv.fr/search/list?base=' . rawurlencode('["Collections des musées de France (Joconde)"]') . '&mainSearch=' . rawurlencode('"' . $p['name'] . '"'), 'source' => L10_SOURCES['joconde']];
    }) + ['place' => $p];
}

/* ═════════════════════ 🌿 les plantes cueillies dans la commune (herbiers, GBIF) ═════════════════════ */

/** GET l10_herbier */
function l10_herbier(PDO $pdo, array $q): array
{
    $p = l10_place($pdo, $q);
    if ($p['name'] === '' && $p['lat'] === null) { return ['ok' => false, 'noplace' => true]; }
    $from = max(1700, min(2025, safe_int($q['from'] ?? 1750) ?: 1750)); $to = max($from, min(2025, safe_int($q['to'] ?? 1950) ?: 1950));
    return l10_cached('gbif', l10_fold($p['name']) . '|' . ($p['lat'] !== null ? round($p['lat'], 2) . '|' . round($p['lon'], 2) : '') . "|$from|$to", static function () use ($p, $from, $to) {
        $base = ['basisOfRecord' => 'PRESERVED_SPECIMEN', 'kingdomKey' => 6, 'year' => "$from,$to", 'limit' => 100];
        $lic = 'license=CC0_1_0&license=CC_BY_4_0';
        $found = [];
        // 1) le nom de la commune dans la notice (localité écrite sur l'étiquette) ; 2) les spécimens placés à ~3 km
        if ($p['name'] !== '' && mb_strlen($p['name']) >= 3) {
            $j = l10_json('gbif-q.json', 'https://api.gbif.org/v1/occurrence/search?' . http_build_query($base + ['q' => $p['name'], 'country' => 'FR']) . '&' . $lic);
            $key = l10_fold($p['name']);
            foreach ($j['results'] ?? [] as $r) {
                $where = ' ' . l10_fold(implode(' ', array_map('strval', [$r['locality'] ?? '', $r['verbatimLocality'] ?? '', $r['municipality'] ?? '', $r['county'] ?? '']))) . ' ';
                if ($key !== '' && str_contains($where, ' ' . $key . ' ')) { $found[(string) $r['key']] = $r; }
            }
        }
        if ($p['lat'] !== null) {
            $d = 0.03;
            $j = l10_json('gbif-geo.json', 'https://api.gbif.org/v1/occurrence/search?' . http_build_query($base + ['decimalLatitude' => sprintf('%.4f,%.4f', $p['lat'] - $d, $p['lat'] + $d), 'decimalLongitude' => sprintf('%.4f,%.4f', $p['lon'] - $d * 1.5, $p['lon'] + $d * 1.5)]) . '&' . $lic);
            foreach ($j['results'] ?? [] as $r) { $found[(string) $r['key']] = $r; }
        }
        $items = [];
        foreach ($found as $k => $r) {
            $licU = (string) ($r['license'] ?? '');
            $licN = str_contains($licU, 'zero') ? 'CC0 1.0' : (preg_match('~licenses/by/4\.0~', $licU) ? 'CC BY 4.0' : '');
            if ($licN === '') { continue; } // seulement CC0 et CC BY
            $img = '';
            foreach ($r['media'] ?? [] as $m) { if (($m['type'] ?? '') === 'StillImage' && preg_match('~^https://~', (string) ($m['identifier'] ?? ''))) { $img = (string) $m['identifier']; break; } }
            $items[] = ['key' => $k, 'sci' => mb_substr((string) ($r['scientificName'] ?? ''), 0, 160), 'species' => mb_substr((string) ($r['species'] ?? ''), 0, 120), 'family' => (string) ($r['family'] ?? ''),
                'year' => isset($r['year']) ? (int) $r['year'] : null, 'date' => mb_substr((string) ($r['eventDate'] ?? ''), 0, 30), 'who' => mb_substr((string) ($r['recordedBy'] ?? ''), 0, 160),
                'where' => mb_substr((string) ($r['locality'] ?? $r['verbatimLocality'] ?? ''), 0, 200), 'inst' => mb_substr((string) ($r['institutionCode'] ?? ''), 0, 40),
                'dataset' => (string) ($r['datasetKey'] ?? ''), 'dsname' => mb_substr((string) ($r['datasetName'] ?? ''), 0, 160), 'lic' => $licN, 'licurl' => $licU, 'img' => $img,
                'url' => 'https://www.gbif.org/occurrence/' . rawurlencode($k), 'dsurl' => 'https://www.gbif.org/dataset/' . rawurlencode((string) ($r['datasetKey'] ?? ''))];
        }
        usort($items, static fn($a, $b) => ($a['year'] ?? 9999) <=> ($b['year'] ?? 9999));
        return ['ok' => true, 'items' => array_slice($items, 0, 80), 'search' => 'https://www.gbif.org/occurrence/search?basis_of_record=PRESERVED_SPECIMEN&taxon_key=6&q=' . rawurlencode($p['name']), 'source' => L10_SOURCES['gbif']];
    }) + ['place' => $p];
}

/* ═════════════════════ 🪧 les plaques et stèles (OpenStreetMap) ═════════════════════ */

/** GET l10_plaques */
function l10_plaques(PDO $pdo, array $q): array
{
    $p = l10_place($pdo, $q);
    if ($p['insee'] === '' && $p['lat'] === null) { return ['ok' => false, 'noplace' => true]; }
    $res = l10_cached('osm', $p['insee'] !== '' ? 'insee:' . $p['insee'] : sprintf('%.3f,%.3f', $p['lat'], $p['lon']), static function () use ($p) {
        $area = $p['insee'] !== '' ? 'area["ref:INSEE"="' . $p['insee'] . '"]["boundary"="administrative"]->.a;' : '';
        $flt = $area !== '' ? '(area.a)' : sprintf('(around:2500,%.5f,%.5f)', $p['lat'], $p['lon']);
        $ql = '[out:json][timeout:25];' . $area . '(nwr["historic"="memorial"]' . $flt . ';nwr["memorial"~"^(plaque|stele|stone|obelisk|blue_plaque)$"]' . $flt . ';);out tags center 300;';
        $j = l10_json('overpass.json', 'https://overpass-api.de/api/interpreter', http_build_query(['data' => $ql]));
        $items = [];
        foreach ($j['elements'] ?? [] as $e) {
            $t = $e['tags'] ?? []; $kind = (string) ($t['memorial'] ?? $t['memorial:type'] ?? '');
            // les monuments aux morts sont dans « 🪦 Le monument aux morts » ; les calvaires, ailleurs
            if (in_array($kind, ['war_memorial', 'cross', 'wayside_cross', 'ghost_bike', 'statue'], true)) { continue; }
            $lat = $e['lat'] ?? $e['center']['lat'] ?? null; $lon = $e['lon'] ?? $e['center']['lon'] ?? null;
            $type = (string) ($e['type'] ?? 'node'); $id = (int) ($e['id'] ?? 0); if ($id <= 0 || !in_array($type, ['node', 'way', 'relation'], true)) { continue; }
            $items[] = ['osm' => "$type/$id", 'kind' => $kind !== '' ? $kind : 'memorial', 'name' => mb_substr((string) ($t['name'] ?? ''), 0, 200), 'insc' => mb_substr((string) ($t['inscription'] ?? $t['inscription:fr'] ?? ''), 0, 1200),
                'subject' => mb_substr((string) ($t['subject'] ?? $t['memorial:subject'] ?? ''), 0, 160), 'date' => mb_substr((string) ($t['start_date'] ?? $t['inscription:date'] ?? ''), 0, 40),
                'wd' => preg_match('/^Q\d+$/', (string) ($t['subject:wikidata'] ?? '')) ? (string) $t['subject:wikidata'] : '', 'lat' => is_numeric($lat) ? (float) $lat : null, 'lon' => is_numeric($lon) ? (float) $lon : null,
                'url' => "https://www.openstreetmap.org/$type/$id"];
        }
        return ['ok' => true, 'items' => $items, 'source' => L10_SOURCES['osm']];
    });
    if (!($res['ok'] ?? false)) { return $res + ['place' => $p]; }
    $people = $res['items'] ? l10_people_here($pdo, $p) : [];
    foreach ($res['items'] as &$it) { $it['names'] = l10_names_in($it['name'] . ' ; ' . $it['insc'] . ' ; ' . $it['subject'], $people, l10_year_of($it['date'])); }
    unset($it);
    return $res + ['place' => $p];
}

/* ═════════════════════ le cache ═════════════════════ */

function l10_about(): array { $n = 0; $b = 0; foreach (glob(l10_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); } return ['ok' => true, 'cache' => ['count' => $n, 'bytes' => $b], 'sources' => L10_SOURCES]; }
function l10_cache_clear(): array
{
    $dir = l10_cache_dir(true); $token = bin2hex(random_bytes(8)); $trash = $dir . '/.trash/' . $token; @mkdir($trash, 0775, true); $n = 0;
    foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $trash . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function l10_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{16}$/', $token)) { throw new LcndaBadInput('Jeton inconnu.'); }
    $dir = l10_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}

function l10_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'l10_cloches' => l10_cloches($pdo, $q),
        'l10_musee' => l10_musee($pdo, $q),
        'l10_herbier' => l10_herbier($pdo, $q),
        'l10_plaques' => l10_plaques($pdo, $q),
        'l10_about' => l10_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function l10_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'l10_cache_clear' => l10_cache_clear(),
        'l10_cache_restore' => l10_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
