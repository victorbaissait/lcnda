<?php
declare(strict_types=1);
/**
 * LCNDA — lot D « téléchargements » : les recherches EN LIGNE (faites à la demande, gardées sur l'ordinateur) pour
 * assets/js/heritage-telech-d.js. Les données livrées (assets/data/td-*.json.gz) sont lues par la page elle-même.
 *  - GET td_loc {kind: ellis|ship|city, q, from, to}  → 📷 photos de la Bibliothèque du Congrès (API loc.gov, sans clé) : seulement
 *        les notices datées de 1925 au plus tard ET marquées « No known restrictions » (aucune restriction connue) ; la vignette
 *        reste sur loc.gov (lien), rien n'est copié → {ok, items:[{title, date, thumb, url, rights}], search}
 *        Ce qui part : « Ellis Island », un nom de navire ou de ville. Jamais un nom de personne.
 *  - GET td_wiki {insee | title}  → 📖 l'article de Wikipédia de la commune, gardé ENTIER sur l'ordinateur pour le relire hors
 *        ligne (API REST de Wikipédia, CC BY-SA 4.0 : titre, lien, auteurs = historique, licence) → {ok, title, url, history, sections}
 *  - GET td_wikisource {insee, name}  → 📚 textes de Wikisource sur la commune : œuvres dont le SUJET (P921) est la commune
 *        (Wikidata) et qui ont une page sur Wikisource, plus les titres de Wikisource qui la nomment → {ok, items:[{title, url, year, author}]}
 *  - GET td_about · POST td_cache_clear → {token} · POST td_cache_restore {token}
 *  - La traduction hors ligne (Argos Translate) : lib/telech_d_traduction.php (td_tr_*).
 * Sans Internet : la réponse gardée (même ancienne), sinon {ok:false, offline:true}. Rien pour une fiche vivante ou confidentielle
 * (paramètre pid). Essai : tests/test-telech-d.js (GENEALOGY_TEST=1 + LCNDA_TEST_TD_DIR : réponses lues dans ce dossier).
 */

const TD_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande)';
const TD_HOSTS = ['www.loc.gov', 'fr.wikipedia.org', 'fr.wikisource.org', 'query.wikidata.org'];
const TD_TTL = ['loc' => 60 * 86400, 'wiki' => 180 * 86400, 'ws' => 90 * 86400];
const TD_SOURCES = [
    'loc' => ['label' => 'Library of Congress — Prints & Photographs (API loc.gov)', 'licence' => 'Photos marquées « No known restrictions on publication » et datées de 1925 au plus tard ; droits relus sur chaque notice',
        'quote' => 'As a publicly supported institution, we generally do not own the rights to materials in our collections. You should determine for yourself whether or not an item is protected by copyright or in the public domain…',
        'url' => 'https://www.loc.gov/legal/', 'read' => '2026-11-25'],
    'wiki' => ['label' => 'Wikipédia en français (API REST)', 'licence' => 'CC BY-SA 4.0 — les contributeurs de Wikipédia (historique de la page)',
        'url' => 'https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia', 'read' => '2026-11-25'],
    'ws' => ['label' => 'Wikisource en français ; Wikidata (sujet P921)', 'licence' => 'Textes du domaine public (pages : CC BY-SA 4.0) ; Wikidata CC0',
        'url' => 'https://fr.wikisource.org/wiki/Wikisource:Droit_d%E2%80%99auteur', 'read' => '2026-11-25'],
];

function td_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : sys_get_temp_dir()), '/') . '/cache/telech-d';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function td_cached(string $kind, string $key, callable $make): array
{
    $f = td_cache_dir() . '/' . sha1($kind . ':' . $key) . '.json';
    $c = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
    if (is_array($c) && isset($c['data']) && (int) $c['at'] > time() - (TD_TTL[$kind] ?? 30 * 86400)) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    // 👁 mode consultation et appareils invités : seulement ce qui est déjà gardé, rien ne part sur Internet depuis un visiteur
    if (function_exists('kiosk_state') && !empty(kiosk_state()['on'])) {
        return is_array($c) && isset($c['data']) ? $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']] : ['ok' => false, 'offline' => true, 'kiosk' => true, 'message' => i18n_t('Mode consultation : rien n’est cherché sur Internet.')];
    }
    try { $data = $make(); }
    catch (Throwable $e) {
        if (is_array($c) && isset($c['data'])) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    if (($data['ok'] ?? false) === true) {
        td_cache_dir(true);
        @file_put_contents($f, json_encode(['key' => $kind . ':' . $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    }
    return $data + ['cached' => false, 'fetched_at' => time()];
}
/** une adresse https d'un des sites permis (une requête à la fois) ; en essai : le fichier du dossier LCNDA_TEST_TD_DIR nommé par $step */
function td_http(string $step, string $url, string $accept = 'application/json', int $max = 4_000_000): string
{
    $dir = (string) getenv('LCNDA_TEST_TD_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        $f = $dir . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
        if (!is_file($f)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($f);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), TD_HOSTS, true) || parse_url($url, PHP_URL_SCHEME) !== 'https') { throw new RuntimeException('Adresse refusée.'); }
    static $last = [];
    $host = (string) parse_url($url, PHP_URL_HOST);
    $gap = str_ends_with($host, 'wikidata.org') || str_ends_with($host, 'wikipedia.org') || str_ends_with($host, 'wikisource.org') ? 1.0 : 0.5;
    if (isset($last[$host]) && ($w = $gap - (microtime(true) - $last[$host])) > 0) { usleep((int) ($w * 1e6)); }
    $body = ''; $too = false; $retry = 0;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 60, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => TD_UA, CURLOPT_HTTPHEADER => ['Accept: ' . $accept],
        CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$retry) { if (preg_match('/^Retry-After:\s*(\d+)/i', $h, $m)) { $retry = (int) $m[1]; } return strlen($h); },
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }]
        + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    $last[$host] = microtime(true);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code === 429 || $code === 503 || $code === 504) { throw new RuntimeException(i18n_t('Le site est occupé : réessaie dans {n} secondes.', ['n' => (string) max(30, min(600, $retry))])); }
    if ($code === 404) { throw new RuntimeException(i18n_t('Page introuvable.'), 404); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    return $body;
}
function td_json(string $step, string $url, string $accept = 'application/json'): array
{
    $j = json_decode(td_http($step, $url, $accept), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    return $j;
}
function td_str($v): string { return is_array($v) ? implode(' ; ', array_map('strval', array_filter($v, 'is_scalar'))) : trim((string) ($v ?? '')); }
function td_private(PDO $pdo, array $q): bool
{
    $pid = safe_int($q['pid'] ?? 0);
    if ($pid <= 0) { return false; }
    try {
        $s = $pdo->prepare('SELECT living_status, is_private FROM persons WHERE id=?'); $s->execute([$pid]); $r = $s->fetch(PDO::FETCH_ASSOC);
        return !$r || $r['living_status'] === 'living' || !empty($r['is_private']);
    } catch (Throwable) { return true; }
}
function td_insee(array $q): string { $i = strtoupper(trim((string) ($q['insee'] ?? ''))); return preg_match('/^(\d{2}|2A|2B)\d{3}$/', $i) ? $i : ''; }
function td_sparql(string $step, string $query): array
{
    $j = td_json($step, 'https://query.wikidata.org/sparql?' . http_build_query(['query' => $query, 'format' => 'json']), 'application/sparql-results+json');
    return $j['results']['bindings'] ?? [];
}

/* ═════════════════════ 📷 Bibliothèque du Congrès (photos avant 1925, sans restriction connue) ═════════════════════ */
function td_loc_free(string $rights): bool
{
    $r = strtolower($rights);
    return (bool) preg_match('/no known restrictions/', $r) && !preg_match('/restricted|permission required|rights status not evaluated/', $r);
}
function td_loc(PDO $pdo, array $q): array
{
    if (td_private($pdo, $q)) { return ['ok' => true, 'items' => [], 'private' => true]; }
    $kind = (string) ($q['kind'] ?? 'ellis');
    if (!in_array($kind, ['ellis', 'ship', 'city'], true)) { throw new LcndaBadInput('Sorte inconnue.'); }
    $text = trim(mb_substr(preg_replace('/[^\p{L}\p{N} \'.-]+/u', ' ', (string) ($q['q'] ?? '')), 0, 60));
    $query = match ($kind) { 'ellis' => 'Ellis Island immigrants', 'ship' => $text !== '' ? "{$text} steamship" : '', 'city' => $text !== '' ? "{$text} immigrants" : '' };
    if ($query === '') { throw new LcndaBadInput('Il manque le nom du navire ou de la ville.'); }
    $from = max(1850, min(1925, safe_int($q['from'] ?? 1880) ?: 1880)); $to = max($from, min(1925, safe_int($q['to'] ?? 1925) ?: 1925));
    $search = 'https://www.loc.gov/photos/?' . http_build_query(['q' => $query, 'dates' => "{$from}/{$to}"]);
    return td_cached('loc', "{$kind}|{$query}|{$from}|{$to}", static function () use ($query, $from, $to, $search) {
        $j = td_json('loc-' . substr(sha1($query . $from . $to), 0, 10) . '.json', 'https://www.loc.gov/photos/?' . http_build_query(['q' => $query, 'dates' => "{$from}/{$to}", 'fo' => 'json', 'c' => 40, 'at' => 'results,pagination']));
        $items = [];
        foreach ($j['results'] ?? [] as $r) {
            $rights = td_str($r['rights_advisory'] ?? ($r['item']['rights_advisory'] ?? ''));
            $y = preg_match('/\b(1[89]\d\d)\b/', (string) ($r['date'] ?? ''), $m) ? (int) $m[1] : null;
            if (!td_loc_free($rights) || $y === null || $y > 1925) { continue; }
            $thumb = (string) (($r['image_url'] ?? [])[0] ?? '');
            $url = preg_replace('#^http://#', 'https://', (string) ($r['id'] ?? ($r['url'] ?? '')));
            if (!str_starts_with($url, 'https://www.loc.gov/')) { continue; }
            $items[] = ['title' => mb_substr(td_str($r['title'] ?? ''), 0, 200), 'date' => $y, 'thumb' => str_starts_with($thumb, 'https://tile.loc.gov/') ? preg_replace('/#.*$/', '', $thumb) : '',
                'url' => $url, 'rights' => mb_substr($rights, 0, 120)];
            if (count($items) >= 12) { break; }
        }
        return ['ok' => true, 'items' => $items, 'search' => $search, 'total' => (int) ($j['pagination']['total'] ?? count($items))];
    }) + ['search' => $search];
}

/* ═════════════════════ 📖 l'article de Wikipédia de la commune, gardé entier ═════════════════════ */
function td_wiki_title(array $q): string
{
    $t = trim((string) ($q['title'] ?? ''));
    if ($t !== '') { return mb_substr(str_replace('_', ' ', $t), 0, 200); }
    $insee = td_insee($q);
    if ($insee === '') { throw new LcndaBadInput('Il manque le code INSEE de la commune.'); }
    $b = td_sparql('wd-com-' . $insee . '.json', 'SELECT ?a WHERE { ?c wdt:P374 "' . $insee . '" . ?a schema:about ?c ; schema:isPartOf <https://fr.wikipedia.org/> . } LIMIT 1');
    $u = (string) ($b[0]['a']['value'] ?? '');
    if ($u === '') { throw new RuntimeException(i18n_t('Pas d’article de Wikipédia trouvé pour cette commune.'), 404); }
    return str_replace('_', ' ', rawurldecode(substr($u, strrpos($u, '/wiki/') + 6)));
}
/** HTML Parsoid → sections de texte simple (titres h2/h3 et paragraphes ; ni tableaux, ni notes, ni infobox) */
function td_wiki_sections(string $html): array
{
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8"?>' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    $x = new DOMXPath($doc);
    foreach ($x->query('//table|//style|//script|//sup[contains(@class,"reference")]|//*[contains(@class,"infobox")]|//*[contains(@class,"bandeau")]|//*[contains(@class,"navbox")]|//figure|//*[contains(@class,"mw-references-wrap")]') as $n) { $n->parentNode?->removeChild($n); }
    $out = [['h' => '', 'text' => '']]; $total = 0;
    foreach ($x->query('//h2|//h3|//p|//li[not(ancestor::nav)]') as $n) {
        $t = trim(preg_replace('/\s+/u', ' ', $n->textContent) ?? '');
        if ($t === '') { continue; }
        if ($n->nodeName === 'h2' || $n->nodeName === 'h3') {
            if (preg_match('/^(Notes et références|Références|Voir aussi|Liens externes|Bibliographie|Articles connexes)$/u', $t)) { $out[] = ['h' => '__stop', 'text' => '']; continue; }
            $out[] = ['h' => $t, 'lvl' => $n->nodeName === 'h3' ? 3 : 2, 'text' => ''];
            continue;
        }
        $k = count($out) - 1;
        if ($out[$k]['h'] === '__stop' || $total > 150_000) { continue; }
        $out[$k]['text'] .= ($out[$k]['text'] !== '' ? "\n" : '') . ($n->nodeName === 'li' ? '• ' : '') . $t;
        $total += strlen($t);
    }
    return array_values(array_filter($out, static fn($s) => $s['h'] !== '__stop' && $s['text'] !== ''));
}
function td_wiki(PDO $pdo, array $q): array
{
    $key = trim((string) ($q['title'] ?? '')) !== '' ? 't:' . $q['title'] : 'i:' . td_insee($q);
    return td_cached('wiki', $key, static function () use ($q) {
        $title = td_wiki_title($q);
        $enc = rawurlencode(str_replace(' ', '_', $title));
        $html = td_http('wp-' . substr(sha1($title), 0, 10) . '.html', 'https://fr.wikipedia.org/api/rest_v1/page/html/' . $enc, 'text/html', 6_000_000);
        $sections = td_wiki_sections($html);
        if (!$sections) { throw new RuntimeException(i18n_t('Article vide.')); }
        $rev = preg_match('#<html[^>]*about="[^"]*/revision/(\d+)"#', $html, $m) ? (int) $m[1] : 0;
        return ['ok' => true, 'title' => $title, 'url' => 'https://fr.wikipedia.org/wiki/' . $enc, 'revid' => $rev,
            'history' => 'https://fr.wikipedia.org/w/index.php?title=' . $enc . '&action=history', 'sections' => $sections,
            'licence' => 'CC BY-SA 4.0', 'licence_url' => 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr', 'authors' => i18n_t('les contributeurs de Wikipédia')];
    });
}

/* ═════════════════════ 📚 Wikisource : les textes qui parlent de la commune ═════════════════════ */
function td_wikisource(PDO $pdo, array $q): array
{
    $insee = td_insee($q); $name = trim(mb_substr((string) ($q['name'] ?? ''), 0, 80));
    if ($insee === '' && $name === '') { throw new LcndaBadInput('Il manque la commune.'); }
    return td_cached('ws', $insee . '|' . $name, static function () use ($insee, $name) {
        $items = []; $seen = [];
        if ($insee !== '') {
            $b = td_sparql('wd-ws-' . $insee . '.json', 'SELECT ?w ?wl ?ws ?d ?al WHERE { ?c wdt:P374 "' . $insee . '" . { ?w wdt:P921 ?c } UNION { ?w wdt:P840 ?c } '
                . '?ws schema:about ?w ; schema:isPartOf <https://fr.wikisource.org/> . OPTIONAL { ?w wdt:P577 ?d } OPTIONAL { ?w wdt:P50 ?a . ?a rdfs:label ?al FILTER(LANG(?al)="fr") } '
                . '?w rdfs:label ?wl FILTER(LANG(?wl)="fr") } LIMIT 60');
            foreach ($b as $r) {
                $u = (string) ($r['ws']['value'] ?? ''); if (!str_starts_with($u, 'https://fr.wikisource.org/wiki/') || isset($seen[$u])) { continue; } // seulement une page de Wikisource (une réponse piégée ne pose pas d'autre lien)
                $seen[$u] = 1;
                $items[] = ['title' => mb_substr((string) ($r['wl']['value'] ?? ''), 0, 300), 'url' => $u, 'year' => preg_match('/^\+?(\d{4})/', (string) ($r['d']['value'] ?? ''), $m) ? (int) $m[1] : null,
                    'author' => mb_substr((string) ($r['al']['value'] ?? ''), 0, 200), 'how' => 'wikidata', 'wd' => preg_match('#^https?://www\.wikidata\.org/entity/Q\d+$#', (string) ($r['w']['value'] ?? '')) ? (string) $r['w']['value'] : ''];
            }
        }
        if ($name !== '' && mb_strlen($name) >= 3) {
            $j = td_json('ws-' . substr(sha1($name), 0, 10) . '.json', 'https://fr.wikisource.org/w/api.php?' . http_build_query(['action' => 'query', 'list' => 'search', 'srsearch' => 'intitle:"' . $name . '"',
                'srnamespace' => 0, 'srlimit' => 20, 'srprop' => '', 'format' => 'json', 'formatversion' => 2]));
            foreach ($j['query']['search'] ?? [] as $r) {
                $t = (string) ($r['title'] ?? ''); if ($t === '' || str_contains($t, '/')) { continue; } // les sous-pages (chapitres) : non
                $u = 'https://fr.wikisource.org/wiki/' . rawurlencode(str_replace(' ', '_', $t));
                if (isset($seen[$u])) { continue; }
                $seen[$u] = 1;
                $items[] = ['title' => $t, 'url' => $u, 'year' => preg_match('/\((1[5-9]\d\d)\)/', $t, $m) ? (int) $m[1] : null, 'author' => '', 'how' => 'titre'];
            }
        }
        return ['ok' => true, 'items' => $items, 'search' => 'https://fr.wikisource.org/w/index.php?' . http_build_query(['search' => $name, 'ns0' => 1])];
    });
}

/* ═════════════════════ réponses gardées ═════════════════════ */
function td_cache_count(): int { return count(glob(td_cache_dir() . '/*.json') ?: []); }
function td_cache_clear(): array
{
    $dir = td_cache_dir(true); $token = bin2hex(random_bytes(8)); $trash = $dir . '/.trash/' . $token; @mkdir($trash, 0775, true); $n = 0;
    foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $trash . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function td_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{16}$/', $token)) { throw new LcndaBadInput('Jeton inconnu.'); }
    $dir = td_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}
/** les articles de Wikipédia gardés (pour « 📖 Wikipédia hors ligne » dans Réglages) */
function td_wiki_list(): array
{
    $out = [];
    foreach (glob(td_cache_dir() . '/*.json') ?: [] as $f) {
        $c = json_decode((string) @file_get_contents($f), true);
        if (!is_array($c) || !str_starts_with((string) ($c['key'] ?? ''), 'wiki:') || empty($c['data']['ok'])) { continue; }
        $out[] = ['title' => (string) $c['data']['title'], 'url' => (string) $c['data']['url'], 'at' => (int) $c['at'], 'size' => (int) filesize($f)];
    }
    usort($out, static fn($a, $b) => strcmp($a['title'], $b['title']));
    return $out;
}
function td_about(): array
{
    return ['ok' => true, 'sources' => TD_SOURCES, 'cache' => ['count' => td_cache_count()], 'wiki' => td_wiki_list()];
}

function td_api_get(PDO $pdo, string $action, array $q): array
{
    if (str_starts_with($action, 'td_tr_')) { require_once __DIR__ . '/telech_d_traduction.php'; return tdtr_api_get($action, $q); }
    return match ($action) {
        'td_loc' => td_loc($pdo, $q),
        'td_wiki' => td_wiki($pdo, $q),
        'td_wikisource' => td_wikisource($pdo, $q),
        'td_about' => td_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function td_api_post(PDO $pdo, string $action, array $d): array
{
    if (str_starts_with($action, 'td_tr_')) { require_once __DIR__ . '/telech_d_traduction.php'; return tdtr_api_post($action, $d); }
    return match ($action) {
        'td_cache_clear' => td_cache_clear(),
        'td_cache_restore' => td_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
