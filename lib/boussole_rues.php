<?php
declare(strict_types=1);

/**
 * 🧭 La boussole de son époque · 🗞️ Ce jour-là dans le monde · 📍 Les anciens noms des rues
 * Écran : assets/js/heritage-boussole-rues.js (style : assets/css/boussole-rues.css).
 *
 * Le calcul de la boussole (gufm1 + IGRF) et des anciens noms de rues (Paris) se fait dans la page, avec les fichiers livrés
 * assets/data/br-gufm1.json.gz, br-igrf.json.gz, br-paris.json.gz (refaits par scripts/boussole-rues/build-boussole-rues.py).
 * Ici :
 *  - GET br_person&id=        → les événements datés au jour près, les lieux (position, année) et les adresses de la fiche (sans réseau) ;
 *  - GET br_places            → les lieux de la base qui ont une position, avec la première et la dernière année (sans réseau) ;
 *  - GET br_day&date=AAAA-MM-JJ → 🗞️ les événements de ce jour-là (et du mois) d'après Wikipédia en français (en ligne, gardé) :
 *        « Février 1852 » (Événements, lignes du 12 février), « 12 février » (Événements, ligne « 1852 : »), « 1852 en France » ;
 *  - GET br_about · POST br_cache_clear / br_cache_restore {token}.
 * Ce qui part sur Internet : seulement la date (titres de pages Wikipédia), jamais un nom.
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_BR_DIR (un fichier wp_<titre>.json par page) ; fichier absent = hors ligne.
 * Fabriquer ces fichiers à partir des vraies réponses : LCNDA_BR_RECORD_DIR (ligne de commande seulement).
 */

require_once __DIR__ . '/calendars.php';

const BR_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const BR_TTL = 180 * 86400;
const BR_TTL_MISSING = 30 * 86400;
const BR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const BR_WP_LICENCE = ['label' => 'CC BY-SA 4.0', 'url' => 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr'];

/* ═════════════════════ le cache : un fichier par page ═════════════════════ */

function br_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir())), '/') . '/cache/boussole-rues';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function br_cached(string $key, callable $make, bool $fresh = false): array
{
    $f = br_cache_dir() . '/' . sha1($key) . '.json';
    $c = null;
    if (is_file($f)) { $j = json_decode((string) @file_get_contents($f), true); if (is_array($j) && isset($j['data'])) { $c = $j; } }
    $ttl = !empty($c['data']['missing']) ? BR_TTL_MISSING : BR_TTL;
    if ($c && !$fresh && (int) $c['at'] > time() - $ttl) { return $c['data'] + ['cached' => true, 'fetched_at' => (int) $c['at']]; }
    try {
        $data = $make();
    } catch (Throwable $e) {
        if ($c) { return $c['data'] + ['cached' => true, 'stale' => true, 'fetched_at' => (int) $c['at']]; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
    @file_put_contents(br_cache_dir(true) . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $data + ['cached' => false, 'fetched_at' => time()];
}

/* ═════════════════════ le réseau (Wikipédia en français seulement) ═════════════════════ */

function br_step(string $title): string { return 'wp_' . substr((string) preg_replace('/[^a-z0-9]+/', '_', strtolower((string) iconv('UTF-8', 'ASCII//TRANSLIT', $title))), 0, 60) . '.json'; }
function br_http(string $step, string $url): string
{
    $dir = getenv('GENEALOGY_TEST') === '1' ? (string) getenv('LCNDA_TEST_BR_DIR') : '';
    if ($dir !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        if (!is_file($dir . '/' . $step)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($dir . '/' . $step);
    }
    $rec = PHP_SAPI === 'cli' ? (string) getenv('LCNDA_BR_RECORD_DIR') : '';
    if ($rec !== '' && is_file($rec . '/' . $step)) { return (string) file_get_contents($rec . '/' . $step); }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (strtolower((string) parse_url($url, PHP_URL_HOST)) !== 'fr.wikipedia.org') { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false; $max = 6_000_000;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => BR_UA, CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_ENCODING => '',
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

function br_wp_api(string $step, array $q): array
{
    $j = json_decode(br_http($step, 'https://fr.wikipedia.org/w/api.php?' . http_build_query($q + ['redirects' => 1, 'format' => 'json', 'formatversion' => 2])), true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    return $j;
}
/** la partie « Événements » d'une page de Wikipédia (et, pour une page de jour, seulement le siècle de l'année) :
 *  {ok, title, revid, items: [{sec, sa, sub, a, md 'MM-JJ'|null, y|null, t, subs[]}]} — deux petites demandes : le sommaire, puis la partie */
function br_wp_events(string $title, ?int $century = null, bool $fresh = false): array
{
    return br_cached('events:' . $title . ':' . ($century ?? ''), static function () use ($title, $century) {
        $j = br_wp_api(br_step($title . ' sections'), ['action' => 'parse', 'page' => $title, 'prop' => 'sections|revid']);
        if (($j['error']['code'] ?? '') === 'missingtitle') { return ['ok' => false, 'missing' => true, 'title' => $title]; }
        if (isset($j['error']['info'])) { throw new RuntimeException(mb_substr((string) $j['error']['info'], 0, 200)); }
        $page = (string) ($j['parse']['title'] ?? $title); $revid = (int) ($j['parse']['revid'] ?? 0);
        $secs = $j['parse']['sections'] ?? [];
        $inEv = false; $ev = null; $pick = null;
        foreach ($secs as $x) {
            $line = trim(str_replace("\u{a0}", ' ', html_entity_decode(strip_tags((string) ($x['line'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
            $lvl = (int) ($x['toclevel'] ?? 9);
            if ($lvl === 1) { if ($inEv) { break; } $inEv = (bool) preg_match('/^(É|E)v(é|e)nements?\b/u', $line); if ($inEv) { $ev = $x; } continue; }
            if ($inEv && $century !== null && $lvl === 2 && preg_match('/^([IVXL]+)\s*(e|er|ᵉ)?\s*siècle/u', $line, $m) && br_roman((string) $m[1]) === $century) { $pick = $x; break; }
        }
        $sec = $century !== null ? $pick : ($ev ?: null);
        if (!$sec) { return ['ok' => true, 'title' => $page, 'revid' => $revid, 'items' => []]; }
        $t = br_wp_api(br_step($title . ' s' . (int) $sec['index']), ['action' => 'parse', 'page' => $page, 'prop' => 'text', 'section' => (int) $sec['index'], 'disableeditsection' => 1, 'disabletoc' => 1]);
        $items = br_wp_items((string) ($t['parse']['text'] ?? ''));
        foreach ($items as &$it) { if ($it['sec'] === '' || $century !== null) { $it['sec'] = 'Événements'; } if ($it['a'] === '') { $it['a'] = (string) ($sec['anchor'] ?? ''); } }
        unset($it);
        return ['ok' => true, 'title' => $page, 'revid' => $revid, 'items' => $items];
    }, $fresh);
}
function br_roman(string $r): int
{
    $v = ['I' => 1, 'V' => 5, 'X' => 10, 'L' => 50, 'C' => 100]; $n = 0; $r = strtoupper($r);
    for ($i = 0, $l = strlen($r); $i < $l; $i++) { $a = $v[$r[$i]] ?? 0; $b = $v[$r[$i + 1] ?? ''] ?? 0; $n += $a < $b ? -$a : $a; }
    return $n;
}

/** les lignes des listes, rangées sous leurs titres (h2 = grande partie, h3/h4 = sous-partie) */
function br_wp_items(string $html): array
{
    $html = (string) preg_replace('#<(style|sup|figure|table)\b[^>]*>.*?</\1>#is', '', $html);
    $html = (string) preg_replace('#<div[^>]*class="[^"]*(mw-references-wrap|reflist|thumb|bandeau)[^"]*"[^>]*>.*?</div>#is', '', $html);
    $html = (string) preg_replace('#<!--.*?-->#s', '', $html);
    if (trim($html) === '') { return []; }
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8"?><div id="br-root">' . $html . '</div>', LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    $root = $doc->getElementById('br-root');
    if (!$root) { return []; }
    $out = []; $sec = ''; $sub = ''; $secAnchor = ''; $subAnchor = '';
    $clean = static fn(string $s): string => trim((string) preg_replace(['/[\x{a0}\x{202f}\x{2009}]/u', '/\[\s*(\d+|[a-z]|réf\.? nécessaire|Quoi \?|Lequel \?|Par qui \?|Où \?)\s*\]/u', '/\s+/u', '/\s+([,.])/u'], [' ', '', ' ', '$1'], html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    $walk = static function (DOMNode $n) use (&$walk, &$out, &$sec, &$sub, &$secAnchor, &$subAnchor, $clean): void {
        foreach (iterator_to_array($n->childNodes) as $c) {
            if (!$c instanceof DOMElement) { continue; }
            $tag = strtolower($c->tagName);
            if (preg_match('/^h([2-5])$/', $tag, $m)) {
                $txt = $clean($c->textContent); $id = (string) $c->getAttribute('id');
                if ($m[1] === '2') { $sec = $txt; $secAnchor = $id; $sub = ''; $subAnchor = ''; } else { $sub = $txt; $subAnchor = $id; }
                continue;
            }
            if ($tag === 'ul' || $tag === 'ol') {
                foreach (iterator_to_array($c->childNodes) as $li) {
                    if (!$li instanceof DOMElement || strtolower($li->tagName) !== 'li') { continue; }
                    $own = ''; $subs = []; $md = null;
                    foreach (iterator_to_array($li->childNodes) as $k) {
                        if ($k instanceof DOMElement && in_array(strtolower($k->tagName), ['ul', 'ol'], true)) {
                            foreach ($k->getElementsByTagName('li') as $sl) { $t = $clean($sl->textContent); if ($t !== '') { $subs[] = mb_substr($t, 0, 400); } }
                            continue;
                        }
                        if ($md === null && $k instanceof DOMElement && strtolower($k->tagName) === 'time' && trim($own) === '' && preg_match('/^(\d{2})-(\d{2})$/', (string) $k->getAttribute('datetime'))) { $md = (string) $k->getAttribute('datetime'); }
                        $own .= $k->textContent;
                    }
                    $t = $clean($own);
                    if ($t === '' && !$subs) { continue; }
                    $y = null;
                    if (preg_match('/^(\d{3,4})\s*[:,]\s*/u', $t, $ym)) { $y = (int) $ym[1]; }
                    $out[] = ['sec' => $sec, 'sa' => $secAnchor, 'sub' => $sub, 'a' => $subAnchor !== '' ? $subAnchor : $secAnchor, 'md' => $md, 'y' => $y, 't' => mb_substr($t, 0, 600), 'subs' => array_slice($subs, 0, 12)];
                }
                continue;
            }
            if ($tag === 'div' || $tag === 'section') { $walk($c); }
        }
    };
    $walk($root);
    return $out;
}

function br_wp_url(string $title, string $anchor = ''): string
{
    return 'https://fr.wikipedia.org/wiki/' . str_replace('%2F', '/', rawurlencode(str_replace(' ', '_', $title))) . ($anchor !== '' ? '#' . rawurlencode($anchor) : '');
}
/** « 12 février : victoire de … » → « victoire de … » (la date est déjà dite) */
function br_strip_date(string $t, int $y): string
{
    $m = implode('|', BR_MONTHS);
    $t = (string) preg_replace('/^(\d{1,2}(er)?\s+(' . $m . ')(\s+\d{3,4})?(\s*(-|et|au)\s*\d{1,2}(er)?\s+(' . $m . '))?)\s*(,\s*[^:]{1,40})?\s*:\s*/iu', '$9 : ', $t);
    $t = (string) preg_replace('/^\s*,\s*([^:]{1,40})\s*:\s*/u', '$1 : ', $t);
    $t = (string) preg_replace('/^\s*:\s*/u', '', $t);
    $t = (string) preg_replace('/^' . $y . '\s*[:,]\s*/u', '', $t);
    return trim((string) preg_replace('/\s+/u', ' ', $t));
}
function br_item(array $it, array $page, int $y, string $from): array
{
    $t = br_strip_date((string) $it['t'], $y);
    if ($t === '' && $it['subs']) { $t = array_shift($it['subs']); }
    return ['t' => (string) mb_strtoupper(mb_substr($t, 0, 1)) . mb_substr($t, 1), 'subs' => $it['subs'], 'page' => $page['title'], 'url' => br_wp_url($page['title'], (string) $it['a']),
        'section' => (string) ($it['sub'] !== '' ? $it['sub'] : $it['sec']), 'from' => $from];
}

/** 🗞️ ce jour-là : {ok, date, label, day[], month[], sources[]} */
function br_day(array $q): array
{
    $date = (string) ($q['date'] ?? '');
    if (!preg_match('/^(\d{3,4})-(\d{2})-(\d{2})$/', $date, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { throw new LcndaBadInput(i18n_t('Date à écrire ainsi : 1852-02-12.')); }
    [$y, $mo, $d] = [(int) $m[1], (int) $m[2], (int) $m[3]];
    if ($y < 1000 || $y > (int) date('Y')) { throw new LcndaBadInput(i18n_t('Une année entre 1000 et aujourd’hui.')); }
    $fresh = !empty($q['fresh']);
    $md = sprintf('%02d-%02d', $mo, $d);
    $month = BR_MONTHS[$mo - 1];
    $titles = ['month' => mb_strtoupper(mb_substr($month, 0, 1)) . mb_substr($month, 1) . ' ' . $y, 'day' => ($d === 1 ? '1er' : (string) $d) . ' ' . $month, 'france' => $y . ' en France'];
    $day = []; $monthItems = []; $sources = []; $offline = false; $seen = [];
    $add = static function (array &$list, array $item) use (&$seen) {
        $k = mb_strtolower(mb_substr((string) preg_replace('/\W+/u', '', $item['t']), 0, 60));
        if ($k === '' || isset($seen[$k])) { return; }
        $seen[$k] = true; $list[] = $item;
    };
    foreach ($titles as $kind => $title) {
        $p = br_wp_events($title, $kind === 'day' ? intdiv($y - 1, 100) + 1 : null, $fresh);
        if (!empty($p['offline'])) { $offline = true; continue; }
        if (empty($p['ok'])) { continue; }
        $used = false;
        foreach ($p['items'] as $it) {
            if (!preg_match('/^(É|E)v(é|e)nements?/u', (string) $it['sec'])) { continue; }
            if ($kind === 'day' && $it['y'] === $y) { $add($day, br_item($it, $p, $y, $kind)); $used = true; }
            elseif ($kind !== 'day' && $it['md'] === $md) { $add($day, br_item($it, $p, $y, $kind)); $used = true; }
            elseif ($kind === 'month' && ($it['md'] === null || str_starts_with((string) $it['md'], sprintf('%02d-', $mo)))) { $monthItems[] = br_item($it, $p, $y, $kind) + ['md' => $it['md']]; $used = true; }
        }
        if ($used || $kind === 'month') {
            $sources[] = ['kind' => $kind, 'title' => $p['title'], 'url' => br_wp_url($p['title']), 'revid' => $p['revid'], 'history_url' => 'https://fr.wikipedia.org/w/index.php?title=' . rawurlencode(str_replace(' ', '_', $p['title'])) . '&action=history',
                'fetched_at' => $p['fetched_at'] ?? null, 'cached' => !empty($p['cached']), 'stale' => !empty($p['stale'])];
        }
    }
    if (!$day && !$monthItems && $offline) { return ['ok' => false, 'offline' => true, 'date' => $date, 'message' => i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')]; }
    $label = ($d === 1 ? '1er' : (string) $d) . ' ' . $month . ' ' . $y;
    return ['ok' => true, 'date' => $date, 'label' => $label, 'month_label' => $month . ' ' . $y, 'day' => array_slice($day, 0, 12), 'month' => array_slice($monthItems, 0, 12), 'sources' => $sources, 'partial' => $offline,
        'licence' => BR_WP_LICENCE['label'], 'licence_url' => BR_WP_LICENCE['url']];
}

/* ═════════════════════ la fiche : dates, lieux, adresses (sans réseau) ═════════════════════ */

function br_cols(PDO $pdo, string $table): array
{
    static $memo = [];
    return $memo[$table] ??= array_column($pdo->query('PRAGMA table_info(' . $table . ')')->fetchAll(PDO::FETCH_ASSOC), 'name');
}
function br_person(PDO $pdo, array $q): array
{
    $id = (int) ($q['id'] ?? 0);
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender, is_private, living_status FROM persons WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new LcndaBadInput('Fiche introuvable.'); }
    $ec = br_cols($pdo, 'events'); $pc = br_cols($pdo, 'places');
    $extra = (in_array('date_calendar', $ec, true) ? ', e.date_calendar, e.date_converted' : ", 'gregorian' AS date_calendar, '' AS date_converted")
        . (in_array('date_uncertain', $ec, true) ? ', e.date_uncertain' : ', 0 AS date_uncertain')
        . (in_array('precise_lat', $ec, true) ? ', e.precise_lat, e.precise_lon' : ', NULL AS precise_lat, NULL AS precise_lon')
        . (in_array('admin4_code', $pc, true) ? ", COALESCE(pl.admin4_code,'') AS insee" : ", '' AS insee");
    $st = $pdo->prepare("SELECT e.id, e.year, e.date_text, COALESCE(e.address,'') AS address, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(t.label,'') AS type_label, e.place_id,
            COALESCE(pl.name,'') AS place_name, COALESCE(pl.county,'') AS county, COALESCE(pl.country,'') AS country, pl.latitude AS lat, pl.longitude AS lon $extra
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? OR (e.family_id IS NOT NULL AND (f.partner1_id=? OR f.partner2_id=?)) ORDER BY COALESCE(e.year, 9999), e.id");
    $st->execute([$id, $id, $id]);
    $events = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $text = (string) (($e['date_calendar'] ?? 'gregorian') !== 'gregorian' && trim((string) ($e['date_converted'] ?? '')) !== '' ? $e['date_converted'] : $e['date_text']);
        $pd = cal_parse_date($text);
        $exact = $pd && $pd[1] !== null && $pd[2] !== null && !$pd[3] && empty($e['date_uncertain']);
        $lat = is_numeric($e['precise_lat']) ? (float) $e['precise_lat'] : (is_numeric($e['lat']) ? (float) $e['lat'] : null);
        $lon = is_numeric($e['precise_lon']) ? (float) $e['precise_lon'] : (is_numeric($e['lon']) ? (float) $e['lon'] : null);
        if ($lat !== null && $lon !== null && $lat == 0.0 && $lon == 0.0) { $lat = $lon = null; }
        $events[] = ['event_id' => (int) $e['id'], 'tag' => (string) $e['tag'], 'type' => (string) $e['type_label'], 'year' => $e['year'] !== null ? (int) $e['year'] : ($pd[0] ?? null),
            'date' => $exact ? sprintf('%04d-%02d-%02d', $pd[0], $pd[1], $pd[2]) : null, 'date_text' => (string) $e['date_text'], 'address' => trim((string) $e['address']),
            'place_id' => (int) ($e['place_id'] ?? 0), 'place' => (string) $e['place_name'], 'county' => (string) $e['county'], 'country' => (string) $e['country'], 'insee' => (string) $e['insee'], 'lat' => $lat, 'lon' => $lon];
    }
    return ['ok' => true, 'id' => $id, 'gender' => (string) $p['gender'], 'private' => (int) $p['is_private'] === 1, 'living' => (string) $p['living_status'] === 'living', 'events' => $events];
}
/** les lieux qui ont une position (pour choisir un lieu dans « 🧭 Boussole » du convertisseur) */
function br_places(PDO $pdo): array
{
    $rows = $pdo->query("SELECT pl.id, pl.name, COALESCE(pl.county,'') AS county, COALESCE(pl.country,'') AS country, pl.latitude AS lat, pl.longitude AS lon, MIN(e.year) AS y0, MAX(e.year) AS y1, COUNT(e.id) AS n
        FROM places pl LEFT JOIN events e ON e.place_id=pl.id WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND NOT (pl.latitude=0 AND pl.longitude=0)
        GROUP BY pl.id ORDER BY n DESC, pl.name LIMIT 3000")->fetchAll(PDO::FETCH_ASSOC);
    return ['ok' => true, 'places' => array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'county' => (string) $r['county'], 'country' => (string) $r['country'],
        'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'y0' => $r['y0'] !== null ? (int) $r['y0'] : null, 'y1' => $r['y1'] !== null ? (int) $r['y1'] : null, 'n' => (int) $r['n']], $rows)];
}

/* ═════════════════════ réglages : gardé sur l'ordinateur ═════════════════════ */

function br_cache_info(): array
{
    $n = 0; $b = 0;
    foreach (glob(br_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) @filesize($f); }
    return ['count' => $n, 'bytes' => $b];
}
function br_cache_clear(): array
{
    $dir = br_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $d) { @rmdir($d); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function br_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = br_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}
function br_about(): array
{
    $size = static fn(string $n) => is_file(APP_ROOT . '/assets/data/br-' . $n . '.json.gz') ? (int) filesize(APP_ROOT . '/assets/data/br-' . $n . '.json.gz') : 0;
    return ['ok' => true, 'cache' => br_cache_info(), 'sizes' => ['gufm1' => $size('gufm1'), 'igrf' => $size('igrf'), 'paris' => $size('paris')]];
}

/* ═════════════════════ les points d'entrée (api.php) ═════════════════════ */

function br_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'br_person' => br_person($pdo, $q),
        'br_places' => br_places($pdo),
        'br_day' => br_day($q),
        'br_about' => br_about(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function br_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'br_cache_clear' => br_cache_clear(),
        'br_cache_restore' => br_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
