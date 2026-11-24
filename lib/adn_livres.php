<?php
declare(strict_types=1);

/**
 * 🦴 Les ancêtres très anciens de ta lignée (ADN ancien) et 📚 « Ton ancêtre a peut-être écrit un livre » (data.bnf.fr).
 *
 * 🦴 ADN ancien — rien ne sort de l'ordinateur : l'index (assets/data/adn-ancien.json.gz, fabriqué par
 *    scripts/adn-livres/build-adn-ancien.py depuis l'Allen Ancient DNA Resource, Harvard Dataverse, CC0 1.0) est lu
 *    dans le navigateur (assets/js/heritage-adn-livres.js). Le serveur ne donne que ce que la base sait :
 *    GET adn_ancien&person_id= → les haplogroupes Y et mt des tests ADN de la personne, et pour chaque lignée (père du
 *    père…, mère de la mère…) le lieu le plus ancien connu avec ses coordonnées.
 *
 * 📚 data.bnf.fr (Bibliothèque nationale de France, Licence Ouverte : « utilisation libre et gratuite sous réserve du
 *    maintien de la mention de leur source et de l'indication de leur date de récupération ») — point d'accès SPARQL
 *    https://data.bnf.fr/sparql. Pour une personne MORTE et NON confidentielle seulement, avec prénom, nom et année de
 *    naissance : les auteurs de la BnF du même nom, même premier prénom, nés la même année (± 1), et leurs livres.
 *    À la demande (ouverture de la fiche, bouton, ou la file lente « Chercher mes ancêtres auteurs »), une réponse gardée
 *    90 jours (table adn_livres_cache : même question = aucune requête), au plus une requête par seconde et 20 par minute.
 *    On n'envoie qu'un nom de famille et une année.
 *    GET  adn_livres&op=lookup&person_id=[&fresh=1]   → {eligible, reason, candidates[{ark,url,name,fy,ly,works[],verdict}], fetched_at}
 *    GET  adn_livres&op=ancestors&person_id=          → les ancêtres qu'on peut chercher (morts, non confidentiels, datés)
 *    POST adn_livres_write {op: confirm, person_id, ark} → « ✓ C'est lui » : la notice en source + « Fiches en ligne »
 *         (lib/sources_ouvertes_6.php, so6_import) et ses livres (fiches « Livre », table items) → {batch}
 *    POST adn_livres_write {op: undo, batch}            → ↶ (so6_undo)
 *    POST adn_livres_write {op: mark, person_id, ark, verdict: no|''} → « ✗ Pas lui » gardé (et ↶)
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_BNF_DIR (authors.json, works-<ark>.json : réponses SPARQL) à la place du réseau.
 */

const ADNL_SPARQL = 'https://data.bnf.fr/sparql';
const ADNL_TTL = 90 * 86400;
const ADNL_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const ADNL_MAX_WORKS = 30;
const ADNL_CREDIT = 'Bibliothèque nationale de France, data.bnf.fr — Licence Ouverte';

function adnl_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS adn_livres_cache (qkey TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS adn_livres_marks (person_id INTEGER NOT NULL, ark TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT 'no', batch TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(person_id, ark))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS adn_livres_seen (person_id INTEGER PRIMARY KEY, qkey TEXT NOT NULL, found INTEGER NOT NULL DEFAULT 0, searched_at INTEGER NOT NULL)");
    $done = true;
}

/* ═════════════════════ 🦴 ADN ancien : ce que la base sait ═════════════════════ */

/** le lieu (avec coordonnées) d'une personne : naissance ou baptême d'abord, sinon son plus ancien événement placé */
function adnl_place_of(PDO $pdo, int $pid): ?array
{
    $s = $pdo->prepare("SELECT pl.name, pl.county, pl.country, pl.latitude AS lat, pl.longitude AS lon, e.year, t.gedcom_tag AS tag FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? AND pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL AND NOT (pl.latitude=0 AND pl.longitude=0)
        ORDER BY (t.gedcom_tag IN ('BIRT','CHR','BAPM')) DESC, COALESCE(e.year, 9999), e.id LIMIT 1");
    $s->execute([$pid]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ? ['name' => (string) $r['name'], 'county' => (string) $r['county'], 'country' => (string) $r['country'], 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'year' => $r['year'] !== null ? (int) $r['year'] : null] : null;
}

/** GET adn_ancien : haplogroupes de ses tests, et le plus ancien lieu connu de chaque lignée */
function adn_ancien_person(PDO $pdo, int $pid): array
{
    if (function_exists('dna_ensure')) { dna_ensure($pdo); }
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender, COALESCE(is_start,0) AS is_start FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Personne introuvable.'); }
    $k = $pdo->prepare("SELECT haplo_y, haplo_mt, company FROM dna_kits WHERE person_id=? ORDER BY id"); $k->execute([$pid]);
    $y = ''; $mt = ''; $yKit = ''; $mtKit = '';
    foreach ($k->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $hy = trim((string) $r['haplo_y']); $hm = trim((string) $r['haplo_mt']);
        if ($hy !== '' && strlen($hy) > strlen($y)) { $y = $hy; $yKit = (string) $r['company']; } // le plus précis
        if ($hm !== '' && strlen($hm) > strlen($mt)) { $mt = $hm; $mtKit = (string) $r['company']; }
    }
    $out = ['person' => ['id' => (int) $p['id'], 'name' => trim($p['first_name'] . ' ' . $p['last_name']), 'first' => (string) $p['first_name'], 'gender' => (string) $p['gender'], 'is_start' => (int) $p['is_start'] === 1], 'y' => null, 'mt' => null];
    if ($y === '' && $mt === '') { return $out; }
    $lines = function_exists('dna_lines') ? dna_lines($pdo, $pid, 14) : ['y' => [], 'mt' => []];
    $origin = static function (array $line) use ($pdo, $pid, $p): ?array {
        // du plus lointain ancêtre vers la personne : le premier qui a un lieu placé
        $chain = array_reverse($line);
        $chain[] = ['gen' => 0, 'id' => $pid, 'name' => trim($p['first_name'] . ' ' . $p['last_name'])];
        foreach ($chain as $a) {
            $pl = adnl_place_of($pdo, (int) $a['id']);
            if ($pl) { return $pl + ['who' => ['id' => (int) $a['id'], 'name' => (string) ($a['name'] ?? ''), 'gen' => (int) $a['gen']]]; }
        }
        return null;
    };
    if ($y !== '') { $out['y'] = ['hap' => $y, 'kit' => $yKit, 'origin' => $origin($lines['y'] ?? []), 'depth' => count($lines['y'] ?? [])]; }
    if ($mt !== '') { $out['mt'] = ['hap' => $mt, 'kit' => $mtKit, 'origin' => $origin($lines['mt'] ?? []), 'depth' => count($lines['mt'] ?? [])]; }
    return $out;
}

/* ═════════════════════ 📚 data.bnf.fr ═════════════════════ */

/** on ne cherche jamais un vivant ni une fiche confidentielle ; il faut prénom, nom et année de naissance */
function adnl_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Personne introuvable.'); }
    $e = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') AND e.year IS NOT NULL ORDER BY e.id");
    $e->execute([$pid]);
    $by = 0; $dy = 0; $byChr = 0;
    foreach ($e->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $t = (string) $r['tag']; $yr = (int) $r['year'];
        if ($t === 'BIRT' && !$by) { $by = $yr; } elseif (($t === 'CHR' || $t === 'BAPM') && !$byChr) { $byChr = $yr; } elseif (($t === 'DEAT' || $t === 'BURI') && !$dy) { $dy = $yr; }
    }
    $by = $by ?: $byChr;
    $first = trim(preg_split('/\s+/u', trim((string) $p['first_name']))[0] ?? '');
    $last = trim((string) $p['last_name']);
    $why = '';
    if ((int) ($p['is_private'] ?? 0) === 1) { $why = 'private'; }
    elseif (($p['kind'] ?? 'person') === 'animal') { $why = 'animal'; }
    elseif ((string) $p['living_status'] === 'living') { $why = 'living'; }
    elseif ((string) $p['living_status'] !== 'deceased' && !$dy && !($by && $by <= (int) date('Y') - 110)) { $why = 'living'; } // peut-être vivant : jamais
    elseif ($first === '' || $last === '' || !$by) { $why = 'incomplete'; }
    return ['id' => (int) $p['id'], 'first' => $first, 'last' => $last, 'birth' => $by, 'death' => $dy, 'why' => $why, 'locked' => (int) ($p['is_locked'] ?? 0) === 1];
}

function adnl_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $t = class_exists('Normalizer') ? Normalizer::normalize($s, Normalizer::FORM_D) : $s;
    if (is_string($t)) { $s = preg_replace('/\p{Mn}+/u', '', $t) ?? $s; }
    return trim(preg_replace('/[^a-z0-9\-]+/u', ' ', str_replace(['’', "'"], ' ', $s)) ?? '');
}

/** les écritures du nom à demander : telle quelle, « Mazaud », avec ses particules en minuscules */
function adnl_name_variants(string $last): array
{
    $last = trim(preg_replace('/\s+/u', ' ', $last) ?? '');
    if ($last === '' || !preg_match('/^[\p{L}\s\'’\-\.]{1,60}$/u', $last)) { return []; }
    $title = mb_convert_case(mb_strtolower($last), MB_CASE_TITLE);
    $parts = preg_split('/(\s+)/u', $title, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$title];
    $low = implode('', array_map(static fn($w) => in_array(mb_strtolower($w), ['de', 'du', 'des', 'la', 'le', 'les', 'van', 'von', 'der', 'den', 'di', 'da', 'del', 'della'], true) ? mb_strtolower($w) : $w, $parts));
    $v = array_values(array_unique([$last, $title, $low]));
    if (preg_match('/^(?:d[’\']|de\s+|du\s+|des\s+)(.+)$/iu', $low, $m)) { $v[] = mb_convert_case($m[1], MB_CASE_TITLE); } // « de La Fontaine » est rangé « La Fontaine »
    return array_slice(array_values(array_unique($v)), 0, 5);
}

/** attend son tour : au plus une requête par seconde, 20 par minute (fichier verrouillé, partagé par les fenêtres de l'app) */
function adnl_throttle(): void
{
    $f = rtrim((string) (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir()), '/') . '/bnf-throttle.json';
    $h = @fopen($f, 'c+'); if (!$h) { return; }
    try {
        flock($h, LOCK_EX);
        $st = json_decode((string) stream_get_contents($h), true); $st = is_array($st) ? $st : [];
        $now = microtime(true);
        $recent = array_values(array_filter(array_map('floatval', $st['t'] ?? []), static fn($t) => $t > $now - 60));
        if (count($recent) >= 20) { throw new RuntimeException(i18n_t('Beaucoup de recherches à la BnF en une minute : attends un peu, puis réessaie (on ne va pas trop vite chez eux).')); }
        $last = $recent ? max($recent) : 0.0;
        if ($now - $last < 1.0) { usleep((int) ((1.0 - ($now - $last)) * 1e6)); $now = microtime(true); }
        $recent[] = $now;
        ftruncate($h, 0); rewind($h); fwrite($h, json_encode(['t' => $recent]));
    } finally { flock($h, LOCK_UN); fclose($h); }
}

/** une requête SPARQL → les lignes (« bindings » aplatis) ; le dossier des essais remplace le réseau */
function adnl_sparql(string $query, string $testName): array
{
    $dir = (string) getenv('LCNDA_TEST_BNF_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $testName . "\t" . preg_replace('/\s+/', ' ', $query) . "\n", FILE_APPEND);
        $f = $dir . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '', $testName);
        $j = is_file($f) ? json_decode((string) file_get_contents($f), true) : ['results' => ['bindings' => []]];
        if (!is_array($j)) { throw new RuntimeException(i18n_t('La BnF ne répond pas pour le moment.')); }
    } else {
        if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
        adnl_throttle();
        $body = ''; $too = false; $max = 3 * 1024 * 1024;
        $ch = curl_init(ADNL_SPARQL . '?' . http_build_query(['query' => $query]));
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => ADNL_UA, CURLOPT_HTTPHEADER => ['Accept: application/sparql-results+json'],
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }]
            + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse de la BnF.')); }
        if ($code === 429 || $code === 503) { throw new RuntimeException(i18n_t('La BnF demande d’aller moins vite : réessaie dans quelques minutes.')); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion à la BnF : {err}', ['err' => $err]) : i18n_t('La BnF répond {code}.', ['code' => (string) $code])); }
        $j = json_decode($body, true);
        if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible de la BnF.')); }
    }
    $rows = [];
    foreach ((array) ($j['results']['bindings'] ?? []) as $b) {
        if (!is_array($b)) { continue; }
        $rows[] = array_map(static fn($v) => is_array($v) ? (string) ($v['value'] ?? '') : '', $b);
    }
    return $rows;
}

function adnl_lit(string $s): string { return '"' . str_replace(['\\', '"', "\n", "\r"], ['\\\\', '\\"', ' ', ' '], $s) . '"'; }
function adnl_ark(string $uri): string { return preg_match('~ark:/12148/(c[a-z0-9]{6,14})~', $uri, $m) ? $m[1] : ''; }

/** les auteurs du même nom, même premier prénom, nés la même année (± 1), avec leurs livres */
function adnl_fetch(string $last, string $first, int $year): array
{
    $vals = implode(' ', array_map('adnl_lit', adnl_name_variants($last)));
    if ($vals === '') { return []; }
    $q = 'PREFIX foaf: <http://xmlns.com/foaf/0.1/> PREFIX bnf-onto: <http://data.bnf.fr/ontology/bnf-onto/>
SELECT DISTINCT ?p ?fn ?gn ?fy ?ly WHERE { VALUES ?fn { ' . $vals . ' } ?p foaf:familyName ?fn ; foaf:givenName ?gn ; bnf-onto:firstYear ?fy .
FILTER(?fy >= ' . ($year - 1) . ' && ?fy <= ' . ($year + 1) . ') OPTIONAL { ?p bnf-onto:lastYear ?ly } } LIMIT 40';
    $want = adnl_fold($first);
    $out = [];
    foreach (adnl_sparql($q, 'authors.json') as $r) {
        $ark = adnl_ark($r['p'] ?? ''); if ($ark === '' || isset($out[$ark])) { continue; }
        $gn = trim((string) ($r['gn'] ?? ''));
        $g1 = preg_split('/\s+/u', adnl_fold($gn))[0] ?? '';
        if ($g1 === '' || $g1 !== preg_split('/\s+/u', $want)[0]) { continue; } // même premier prénom (« Jean-Baptiste » ≠ « Jean »)
        $fy = (int) ($r['fy'] ?? 0); if (abs($fy - $year) > 1) { continue; }
        $out[$ark] = ['ark' => $ark, 'url' => 'https://data.bnf.fr/ark:/12148/' . $ark, 'given' => $gn, 'family' => (string) ($r['fn'] ?? $last), 'name' => trim($gn . ' ' . ($r['fn'] ?? $last)),
            'fy' => $fy, 'ly' => (int) ($r['ly'] ?? 0) ?: null, 'works' => [], 'works_more' => false];
        if (count($out) >= 3) { break; }
    }
    foreach ($out as $ark => &$c) {
        $wq = 'PREFIX dcterms: <http://purl.org/dc/terms/> PREFIX marcrel: <http://id.loc.gov/vocabulary/relators/> PREFIX rdam: <http://rdaregistry.info/Elements/m/#>
SELECT DISTINCT ?m ?t ?d WHERE { ?e marcrel:aut <http://data.bnf.fr/ark:/12148/' . $ark . '#about> . ?m rdam:P30139 ?e ; dcterms:title ?t . OPTIONAL { ?m dcterms:date ?d } } ORDER BY ?d LIMIT ' . (ADNL_MAX_WORKS * 2);
        $seen = [];
        foreach (adnl_sparql($wq, 'works-' . $ark . '.json') as $w) {
            $t = trim(preg_replace('/\s+/u', ' ', (string) ($w['t'] ?? '')) ?? ''); if ($t === '') { continue; }
            $key = mb_substr(adnl_fold(preg_replace('/[,.;:\/].*$/u', '', $t) ?? $t), 0, 60);
            if (isset($seen[$key])) { continue; } $seen[$key] = true;
            $y = preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) ($w['d'] ?? ''), $m) ? (int) $m[1] : null;
            $mark = adnl_ark((string) ($w['m'] ?? ''));
            $c['works'][] = ['t' => mb_substr($t, 0, 300), 'y' => $y, 'url' => $mark !== '' ? 'https://catalogue.bnf.fr/ark:/12148/' . $mark : ''];
        }
        if (count($c['works']) > ADNL_MAX_WORKS) { $c['works'] = array_slice($c['works'], 0, ADNL_MAX_WORKS); $c['works_more'] = true; }
        usort($c['works'], static fn($a, $b) => ($a['y'] ?? 9999) <=> ($b['y'] ?? 9999));
    }
    unset($c);
    return array_values(array_filter($out, static fn($c) => $c['works'])); // un auteur sans livre trouvé : rien à proposer
}

/** GET adn_livres&op=lookup */
function adnl_lookup(PDO $pdo, int $pid, bool $fresh = false, bool $cachedOnly = false): array
{
    adnl_schema($pdo);
    $p = adnl_person($pdo, $pid);
    $base = ['person' => ['id' => $p['id'], 'first' => $p['first'], 'last' => $p['last'], 'birth' => $p['birth'], 'locked' => $p['locked']], 'eligible' => $p['why'] === '', 'reason' => $p['why'],
        'candidates' => [], 'fetched_at' => null, 'cached' => false, 'searched' => false, 'credit' => ADNL_CREDIT, 'licence_url' => 'https://data.bnf.fr/fr/licence'];
    if ($p['why'] !== '') { return $base; }
    $key = 'a1|' . adnl_fold($p['last']) . '|' . adnl_fold($p['first']) . '|' . $p['birth'];
    $s = $pdo->prepare('SELECT body, fetched_at FROM adn_livres_cache WHERE qkey=?'); $s->execute([$key]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if ($r && !$fresh && (int) $r['fetched_at'] > time() - ADNL_TTL) {
        $cands = json_decode((string) $r['body'], true) ?: []; $at = (int) $r['fetched_at']; $base['cached'] = true;
    } elseif ($cachedOnly) {
        return $base;
    } else {
        $cands = adnl_fetch($p['last'], $p['first'], $p['birth']); $at = time();
        $pdo->prepare('INSERT INTO adn_livres_cache(qkey, body, fetched_at) VALUES(?,?,?) ON CONFLICT(qkey) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at')
            ->execute([$key, json_encode($cands, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $at]);
        if (random_int(1, 20) === 1) { $pdo->prepare('DELETE FROM adn_livres_cache WHERE fetched_at < ?')->execute([time() - ADNL_TTL]); }
    }
    $pdo->prepare('INSERT INTO adn_livres_seen(person_id, qkey, found, searched_at) VALUES(?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET qkey=excluded.qkey, found=excluded.found, searched_at=excluded.searched_at')
        ->execute([$pid, $key, count($cands), $at]);
    $m = $pdo->prepare('SELECT ark, verdict, batch FROM adn_livres_marks WHERE person_id=?'); $m->execute([$pid]);
    $marks = []; foreach ($m->fetchAll(PDO::FETCH_ASSOC) as $x) { $marks[$x['ark']] = $x; }
    foreach ($cands as &$c) { $c['verdict'] = $marks[$c['ark']]['verdict'] ?? ''; $c['batch'] = $marks[$c['ark']]['batch'] ?? ''; }
    unset($c);
    return ['candidates' => $cands, 'fetched_at' => date('Y-m-d', $at), 'searched' => true] + $base;
}

/** GET adn_livres&op=ancestors : ses ancêtres qu'on peut chercher (12 générations, 600 au plus), déjà cherchés ou non */
function adnl_ancestors(PDO $pdo, int $pid): array
{
    adnl_schema($pdo);
    $par = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?');
    $gen = [$pid => 0]; $level = [$pid];
    for ($g = 1; $g <= 12 && $level && count($gen) < 600; $g++) {
        $next = [];
        foreach ($level as $id) { $par->execute([$id]); foreach ($par->fetchAll(PDO::FETCH_NUM) as $r) { foreach ($r as $x) { $x = (int) $x; if ($x && !isset($gen[$x])) { $gen[$x] = $g; $next[] = $x; } } } }
        $level = $next;
    }
    $seen = $pdo->query('SELECT person_id, found, searched_at FROM adn_livres_seen')->fetchAll(PDO::FETCH_ASSOC);
    $seenBy = []; foreach ($seen as $x) { $seenBy[(int) $x['person_id']] = $x; }
    $out = []; $skipped = 0;
    foreach ($gen as $id => $g) {
        $p = adnl_person($pdo, $id);
        if ($p['why'] !== '') { $skipped++; continue; }
        $sx = $seenBy[$id] ?? null; $fresh = $sx && (int) $sx['searched_at'] > time() - ADNL_TTL;
        $out[] = ['id' => $id, 'gen' => $g, 'name' => trim($p['first'] . ' ' . $p['last']), 'birth' => $p['birth'], 'searched' => $fresh, 'found' => $fresh ? (int) $sx['found'] : 0];
    }
    return ['people' => $out, 'skipped' => $skipped];
}

/** POST confirm : « ✓ C'est lui » — la notice (source + « Fiches en ligne », so6_import) et ses livres (fiches « Livre ») */
function adnl_confirm(PDO $pdo, array $d): array
{
    adnl_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $ark = (string) ($d['ark'] ?? '');
    if (!preg_match('/^c[a-z0-9]{6,14}$/', $ark)) { throw new LcndaBadInput('Notice inconnue.'); }
    $res = adnl_lookup($pdo, $pid, false, true); // seulement ce que la BnF a vraiment répondu (jamais ce qu'envoie la page)
    $c = null; foreach ($res['candidates'] as $x) { if ($x['ark'] === $ark) { $c = $x; } }
    if (!$res['eligible'] || !$c) { throw new RuntimeException(i18n_t('Cette notice n’est plus dans la réponse gardée : cherche à nouveau.')); }
    if (!function_exists('so6_import')) { require_once __DIR__ . '/sources_ouvertes_6.php'; }
    $life = $c['fy'] . ($c['ly'] ? '–' . $c['ly'] : '');
    $lines = array_map(static fn($w) => '- ' . $w['t'] . ($w['y'] ? ' (' . $w['y'] . ')' : '') . ($w['url'] !== '' ? ' — ' . $w['url'] : ''), $c['works']);
    $text = "Notice d’auteur de la Bibliothèque nationale de France : {$c['name']} ({$life}).\n\nSes livres à la BnF" . ($c['works_more'] ? ' (les ' . count($c['works']) . ' premiers)' : '') . " :\n" . implode("\n", $lines)
        . "\n\nSource : " . ADNL_CREDIT . ' (https://data.bnf.fr/fr/licence), données récupérées le ' . $res['fetched_at'] . '.';
    $r = so6_import($pdo, null, ['kind' => 'auteur', 'site' => 'databnf', 'person_id' => $pid, 'url' => $c['url'], 'sheet' => 1, 'text' => $text,
        'source_title' => 'Notice d’auteur BnF — ' . $c['name'] . ' (' . $life . ')', 'fields' => ['first' => $c['given'], 'last' => $c['family'], 'ark' => $ark, 'birth_date' => (string) $c['fy'], 'death_date' => (string) ($c['ly'] ?? '')]]);
    $batch = (string) $r['batch'];
    $items = [];
    $pdo->beginTransaction();
    try {
        if (function_exists('art_ensure')) { try { art_ensure($pdo); } catch (Throwable $_) {} }
        $n = $pdo->prepare("SELECT COALESCE(MAX(sort_order),0)+1 FROM items WHERE person_id=? AND type_key='book'"); $n->execute([$pid]); $ord = (int) $n->fetchColumn();
        $has = $pdo->prepare("SELECT count(*) FROM items WHERE person_id=? AND type_key='book' AND lower(title)=lower(?)");
        foreach ($c['works'] as $w) {
            $has->execute([$pid, $w['t']]); if ((int) $has->fetchColumn()) { continue; }
            $data = ['title' => $w['t'], 'date' => $w['y'] ? (string) $w['y'] : '', 'url' => $w['url'], 'notes' => 'D’après la notice BnF ' . $c['url'] . ' — ' . ADNL_CREDIT . ', récupéré le ' . $res['fetched_at'] . ' (à vérifier).', 'bnf_ark' => $ark];
            $pdo->prepare('INSERT INTO items(type_key, person_id, parent_id, title, date_text, date_min, date_max, year, place_id, data, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
                ->execute(['book', $pid, null, mb_substr($w['t'], 0, 500), $data['date'], $w['y'], $w['y'], $w['y'], null, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $ord++]);
            $id = (int) $pdo->lastInsertId(); $items[] = $id;
            if (function_exists('art_reindex')) { try { art_reindex($pdo, $id, $data); } catch (Throwable $_) {} }
        }
        $s = $pdo->prepare('SELECT ids, summary FROM so_imports WHERE batch=?'); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
        $ids = json_decode((string) ($row['ids'] ?? '{}'), true) ?: []; $ids['items'] = $items;
        $summary = (string) ($row['summary'] ?? '') . ($items ? ', ' . count($items) . ' livre' . (count($items) > 1 ? 's' : '') . ' ajouté' . (count($items) > 1 ? 's' : '') : '');
        $pdo->prepare('UPDATE so_imports SET ids=?, summary=? WHERE batch=?')->execute([json_encode($ids), $summary, $batch]);
        $pdo->prepare("INSERT INTO adn_livres_marks(person_id, ark, verdict, batch) VALUES(?,?,'yes',?) ON CONFLICT(person_id, ark) DO UPDATE SET verdict='yes', batch=excluded.batch")->execute([$pid, $ark, $batch]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        try { so6_undo($pdo, ['batch' => $batch]); } catch (Throwable $_) {}
        throw $e;
    }
    return ['batch' => $batch, 'source_id' => $r['source_id'], 'books' => count($items), 'summary' => $summary];
}

function adnl_undo(PDO $pdo, array $d): array
{
    adnl_schema($pdo);
    $batch = (string) ($d['batch'] ?? '');
    if (!preg_match('/^so6-[0-9a-f]{12}$/', $batch)) { throw new LcndaBadInput('Ajout inconnu.'); }
    $s = $pdo->prepare('SELECT count(*) FROM adn_livres_marks WHERE batch=?'); $s->execute([$batch]);
    if (!(int) $s->fetchColumn()) { throw new LcndaBadInput('Ajout inconnu.'); }
    if (!function_exists('so6_undo')) { require_once __DIR__ . '/sources_ouvertes_6.php'; }
    $r = so6_undo($pdo, ['batch' => $batch]);
    $pdo->prepare('DELETE FROM adn_livres_marks WHERE batch=?')->execute([$batch]);
    return $r;
}

/** POST mark : « ✗ Pas lui » (verdict no), ou l'oublier (verdict '') */
function adnl_mark(PDO $pdo, array $d): array
{
    adnl_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $ark = (string) ($d['ark'] ?? ''); $v = (string) ($d['verdict'] ?? '');
    if (!$pid || !preg_match('/^c[a-z0-9]{6,14}$/', $ark) || !in_array($v, ['no', ''], true)) { throw new LcndaBadInput('Demande incomplète.'); }
    if ($v === '') { $pdo->prepare("DELETE FROM adn_livres_marks WHERE person_id=? AND ark=? AND verdict='no'")->execute([$pid, $ark]); }
    else { $pdo->prepare("INSERT INTO adn_livres_marks(person_id, ark, verdict) VALUES(?,?,'no') ON CONFLICT(person_id, ark) DO UPDATE SET verdict='no', batch=''")->execute([$pid, $ark]); }
    return ['person_id' => $pid, 'ark' => $ark, 'verdict' => $v];
}

/** le point d'entrée (api.php) */
const ADNL_ACTIONS = ['adn_ancien', 'adn_livres', 'adn_livres_write'];
function adn_livres_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if ($action === 'adn_ancien' && !$isWrite) { json_response(adn_ancien_person($pdo, safe_int($_GET['person_id'] ?? 0))); }
        if ($action === 'adn_livres' && !$isWrite) {
            $pid = safe_int($_GET['person_id'] ?? 0);
            json_response(match ((string) ($_GET['op'] ?? 'lookup')) {
                'ancestors' => adnl_ancestors($pdo, $pid),
                'cached' => adnl_lookup($pdo, $pid, false, true),
                default => adnl_lookup($pdo, $pid, ($_GET['fresh'] ?? '') === '1'),
            });
        }
        if ($action === 'adn_livres_write' && $isWrite) {
            json_response(['ok' => true, 'result' => match ((string) ($payload['op'] ?? '')) {
                'confirm' => adnl_confirm($pdo, $payload), 'undo' => adnl_undo($pdo, $payload), 'mark' => adnl_mark($pdo, $payload),
                default => throw new LcndaBadInput('Demande inconnue.') }]);
        }
        json_response(['error' => 'Demande inconnue.'], 400);
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422); }
}
