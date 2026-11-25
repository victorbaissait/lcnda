<?php
declare(strict_types=1);

/**
 * ⭐ Parents célèbres : un lien de parenté (ou d'alliance) entre l'arbre et un personnage connu, avec le chemin complet et la
 * source de chaque maillon. Écran : assets/js/heritage-parents-celebres.js (Listes → « ⭐ Parents célèbres », ligne sur la fiche).
 *
 * Principe : on part des fiches de l'arbre déjà reliées à Wikidata (persons.wikidata_id, « Q535 ») — ou proposées par un
 * rapprochement PRUDENT (même nom, même prénom, né(e) à un an près, mort(e) à un an près ; à valider par toi, « ✓ C'est lui »
 * écrit l'identifiant par person_wikidata_set, ↶) — puis on suit les liens familiaux connus dans Wikidata (P22 père, P25 mère,
 * P26 conjoint, P40 enfant, P3373 frère ou sœur), de proche en proche, et l'on garde les personnes très connues (beaucoup
 * d'articles Wikipédia : « sitelinks »). Le nombre de degrés = les liens dans ton arbre + les liens dans Wikidata.
 * WikiTree (API officielle, getConnections = « Connection Finder ») : seulement si tu l'allumes dans Réglages, pour une fiche
 * qui a un identifiant WikiTree (sur la fiche, dans une source, ou donné par Wikidata P2949), et toujours le lien vers la page
 * « Connection Finder » du site, à ouvrir toi-même.
 * Sources et licences : Wikidata — CC0 1.0 (données) ; WikiTree — documentation de l'API (github.com/wikitree/wikitree-api,
 * lue le 25/11/2026) : accès en lecture seule pour des applications qui lisent et affichent, paramètre appId demandé ;
 * ses conditions d'utilisation n'ont pas pu être relues (site injoignable d'ici) : d'où « éteint » par défaut et rien recopié
 * dans l'arbre (seulement gardé en cache pour l'affichage, avec le lien).
 * Vie privée : rien n'est envoyé pour une fiche vivante, confidentielle ou « peut-être vivante » (lib/pistes_auto.php,
 * pst_private_reason) : ni son identifiant Wikidata, ni son nom, ni son identifiant WikiTree.
 * Ces arbres sont collaboratifs : chaque résultat porte « à vérifier ».
 *
 *  GET  celeb_list · celeb_person&id= · celeb_proposals · celeb_about
 *  POST celeb_start {scope} (chercher les célébrités) · celeb_propose_start {scope} (proposer des fiches Wikidata) · celeb_step {id}
 *       celeb_pause / celeb_resume / celeb_stop {id} · celeb_link_ok {person_id, q} · celeb_link_undo {person_id, q, before}
 *       celeb_link_no / celeb_link_unno {person_id, q} · celeb_wikitree_set {person_id, wt} · celeb_wikitree_check {person_id, target}
 *       celeb_cache_clear
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_CELEB_DIR (wd-<Q>.json : une entité ; wds-<NOM>.json : une recherche ;
 * wt-<A>-<B>.json : getConnections) ; un fichier absent = hors ligne. Chaque appel est noté dans calls.log.
 */

require_once __DIR__ . '/pistes_auto.php';

const PC_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const PC_WD_API = 'https://www.wikidata.org/w/api.php';
const PC_WT_API = 'https://api.wikitree.com/api.php';
const PC_APPID = 'LCNDA_genealogie';
const PC_TTL = 60 * 86400;
const PC_FAMOUS = 25;        // au moins 25 articles Wikipédia (toutes langues) : « connu »
const PC_MAX_DEPTH = 8;      // liens suivis dans Wikidata au plus
const PC_MAX_NODES = 2500;   // personnes lues dans Wikidata au plus, par recherche
const PC_BATCH = 25;         // personnes par requête (wbgetentities en accepte 50)
const PC_REL = ['P22' => 'father', 'P25' => 'mother', 'P26' => 'spouse', 'P40' => 'child', 'P3373' => 'sibling'];
/** des célébrités à essayer dans WikiTree (identifiants WikiTree lus dans Wikidata, propriété P2949, le 25/11/2026 ; CC0) */
const PC_WT_FAMOUS = [['Q535', 'Victor Hugo', 'Hugo-215'], ['Q517', 'Napoléon Ier', 'Bonaparte-1'], ['Q7742', 'Louis XIV', 'Bourbon-106'], ['Q936976', 'Henri IV', 'Bourbon-33'],
    ['Q159575', 'Hugues Capet', 'Capet-57'], ['Q3044', 'Charlemagne', 'Carolingian-77'], ['Q7226', 'Jeanne d’Arc', "D'Arc-1"], ['Q687', 'Molière', 'Poquelin-1'], ['Q9068', 'Voltaire', 'Arouet-1'],
    ['Q1290', 'Blaise Pascal', 'Pascal-87'], ['Q529', 'Louis Pasteur', 'Pasteur-13'], ['Q33977', 'Jules Verne', 'Verne-6'], ['Q3816', 'George Sand', 'Dupin-27'], ['Q7186', 'Marie Curie', 'Skłodowska-2'],
    ['Q2042', 'Charles de Gaulle', 'De_Gaulle-14'], ['Q34670', 'Albert Camus', 'Camus-12'], ['Q23', 'George Washington', 'Washington-11'], ['Q5598', 'Rembrandt', 'Van_Rijn-1']];

function pcel_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    pst_schema($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS pcel_cache (qkey TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS pcel_links (person_id INTEGER NOT NULL, kind TEXT NOT NULL, ext_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed', score INTEGER NOT NULL DEFAULT 0,
        why TEXT NOT NULL DEFAULT '[]', label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(person_id, kind, ext_id))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS pcel_found (start_q TEXT NOT NULL, celeb_q TEXT NOT NULL, hops INTEGER NOT NULL, path TEXT NOT NULL DEFAULT '[]', label TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '',
        sitelinks INTEGER NOT NULL DEFAULT 0, wiki_fr TEXT NOT NULL DEFAULT '', wikitree TEXT NOT NULL DEFAULT '', born INTEGER, died INTEGER, computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(start_q, celeb_q))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS pcel_wt_found (person_id INTEGER NOT NULL, target TEXT NOT NULL, wt_from TEXT NOT NULL, length INTEGER, path TEXT NOT NULL DEFAULT '[]', label TEXT NOT NULL DEFAULT '',
        checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(person_id, target))");
    $done = true;
}

/* ═════════════════════ le réseau (à la demande, une requête à la fois, gardé 60 jours) ═════════════════════ */

function pcel_test_dir(): string { $d = (string) getenv('LCNDA_TEST_CELEB_DIR'); return getenv('GENEALOGY_TEST') === '1' && $d !== '' ? $d : ''; }

function pcel_http(string $url): array
{
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    if (!in_array($host, ['www.wikidata.org', 'api.wikitree.com'], true)) { throw new RuntimeException('Adresse refusée.'); }
    for ($try = 0; $try < 2; $try++) {
        $body = ''; $too = false; $retry = 0;
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 12, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => PC_UA, CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$retry) { if (preg_match('/^retry-after:\s*(\d+)/i', $h, $m)) { $retry = (int) $m[1]; } return strlen($h); },
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too) { $body .= $chunk; if (strlen($body) > 8_000_000) { $too = true; return 0; } return strlen($chunk); }]
            + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        unset($ch);
        if ($code === 429 && $try === 0 && $retry > 0 && $retry <= 8) { sleep($retry); continue; } // Retry-After respecté une fois
        break;
    }
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
    if ($code === 429 || $code >= 500) { throw new RuntimeException(i18n_t('Le site est très demandé en ce moment : réessaie dans une minute.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    $j = json_decode($body, true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
    if (isset($j['error']['code']) && $j['error']['code'] === 'maxlag') { throw new RuntimeException(i18n_t('Le site est très demandé en ce moment : réessaie dans une minute.')); }
    return $j;
}

/** la même question gardée 60 jours : [réponse, vient-elle du cache ?] */
function pcel_cached(PDO $pdo, string $key, callable $fetch): array
{
    pcel_schema($pdo);
    $s = $pdo->prepare('SELECT body, fetched_at FROM pcel_cache WHERE qkey=?'); $s->execute([$key]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if ($r && (int) $r['fetched_at'] > time() - PC_TTL) { $j = json_decode((string) $r['body'], true); if (is_array($j)) { return [$j, true]; } }
    $j = $fetch();
    $pdo->prepare('INSERT INTO pcel_cache(qkey, body, fetched_at) VALUES(?,?,?) ON CONFLICT(qkey) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at')->execute([$key, json_encode($j, JSON_UNESCAPED_UNICODE), time()]);
    return [$j, false];
}

/** des personnes de Wikidata (au plus 50) : les entités brutes, par Q */
function pcel_wd_entities(PDO $pdo, array $qs, bool &$net): array
{
    $qs = array_values(array_unique(array_filter($qs, static fn($q) => preg_match('/^Q\d{1,12}$/', (string) $q))));
    if (!$qs) { return []; }
    $out = []; $missing = [];
    // une par une dans le cache (une entité déjà lue ne se redemande pas)
    $s = $pdo->prepare('SELECT body, fetched_at FROM pcel_cache WHERE qkey=?');
    foreach ($qs as $q) { $s->execute(['wd:' . $q]); $r = $s->fetch(PDO::FETCH_ASSOC); $j = $r && (int) $r['fetched_at'] > time() - PC_TTL ? json_decode((string) $r['body'], true) : null; if (is_array($j)) { $out[$q] = $j; } else { $missing[] = $q; } }
    if (!$missing) { return $out; }
    $dir = pcel_test_dir();
    if ($dir !== '') {
        @file_put_contents($dir . '/calls.log', 'wbgetentities ' . implode('|', $missing) . "\n", FILE_APPEND);
        $got = [];
        foreach ($missing as $q) { $f = $dir . '/wd-' . $q . '.json'; if (is_file($f)) { $got[$q] = json_decode((string) file_get_contents($f), true) ?: []; } }
        if (!$got && !is_file($dir . '/online')) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        $j = ['entities' => $got + array_fill_keys(array_diff($missing, array_keys($got)), ['missing' => ''])];
    } else {
        $j = pcel_http(PC_WD_API . '?' . http_build_query(['action' => 'wbgetentities', 'ids' => implode('|', $missing), 'props' => 'labels|descriptions|claims|sitelinks', 'languages' => 'fr|en', 'format' => 'json', 'maxlag' => 5]));
    }
    $net = true;
    $ins = $pdo->prepare('INSERT INTO pcel_cache(qkey, body, fetched_at) VALUES(?,?,?) ON CONFLICT(qkey) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at');
    foreach ((array) ($j['entities'] ?? []) as $q => $e) {
        if (!is_array($e)) { continue; }
        $small = pcel_entity_small($e, (string) $q);
        $ins->execute(['wd:' . $q, json_encode($small, JSON_UNESCAPED_UNICODE), time()]);
        $out[$q] = $small;
    }
    return $out;
}

/** une entité de Wikidata réduite à ce qui sert ici (le cache reste petit) */
function pcel_entity_small(array $e, string $q): array
{
    if (isset($e['missing'])) { return ['q' => $q, 'missing' => true]; }
    $C = (array) ($e['claims'] ?? []);
    $vals = static function (string $p) use ($C): array {
        $out = [];
        foreach ((array) ($C[$p] ?? []) as $c) {
            if (($c['rank'] ?? '') === 'deprecated') { continue; }
            $v = $c['mainsnak']['datavalue']['value'] ?? null;
            if (is_array($v) && isset($v['id'])) { $out[] = (string) $v['id']; } elseif (is_array($v) && isset($v['time'])) { $out[] = (string) $v['time']; } elseif (is_string($v)) { $out[] = $v; }
        }
        return $out;
    };
    $year = static function (array $t): ?int { foreach ($t as $x) { if (preg_match('/^([+-])0*(\d{1,4})-/', $x, $m)) { return ($m[1] === '-' ? -1 : 1) * (int) $m[2]; } } return null; };
    $L = (array) ($e['labels'] ?? []); $D = (array) ($e['descriptions'] ?? []);
    $rel = []; foreach (array_keys(PC_REL) as $p) { $v = $vals($p); if ($v) { $rel[$p] = array_values(array_filter($v, static fn($x) => preg_match('/^Q\d+$/', $x))); } }
    return ['q' => $q, 'label' => (string) (($L['fr']['value'] ?? '') ?: ($L['en']['value'] ?? '') ?: $q), 'desc' => (string) (($D['fr']['value'] ?? '') ?: ($D['en']['value'] ?? '')),
        'sitelinks' => count((array) ($e['sitelinks'] ?? [])), 'wiki_fr' => (string) ($e['sitelinks']['frwiki']['title'] ?? ''), 'human' => in_array('Q5', $vals('P31'), true),
        'born' => $year($vals('P569')), 'died' => $year($vals('P570')), 'gender' => ($vals('P21')[0] ?? '') === 'Q6581072' ? 'female' : (($vals('P21')[0] ?? '') === 'Q6581097' ? 'male' : ''),
        'rel' => $rel, 'wikitree' => (string) ($vals('P2949')[0] ?? '')];
}

/** GET wbsearchentities (un nom ; seulement pour une fiche qui peut sortir) */
function pcel_wd_search(PDO $pdo, string $text, bool &$net): array
{
    $key = 'wds:' . pst_key($text);
    [$j, $cached] = pcel_cached($pdo, $key, static function () use ($text) {
        $dir = pcel_test_dir();
        if ($dir !== '') {
            @file_put_contents($dir . '/calls.log', 'wbsearchentities ' . $text . "\n", FILE_APPEND);
            $f = $dir . '/wds-' . pst_key($text) . '.json';
            if (is_file($f)) { return json_decode((string) file_get_contents($f), true) ?: ['search' => []]; }
            if (!is_file($dir . '/online')) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
            return ['search' => []];
        }
        return pcel_http(PC_WD_API . '?' . http_build_query(['action' => 'wbsearchentities', 'search' => $text, 'language' => 'fr', 'uselang' => 'fr', 'type' => 'item', 'limit' => 7, 'format' => 'json', 'maxlag' => 5]));
    });
    if (!$cached) { $net = true; }
    return array_values(array_filter(array_map(static fn($r) => (string) ($r['id'] ?? ''), (array) ($j['search'] ?? [])), static fn($q) => preg_match('/^Q\d+$/', $q)));
}

/** WikiTree getConnections (A, B) : [longueur, chemin] ; null si pas de chemin */
function pcel_wt_connect(PDO $pdo, string $a, string $b, bool &$net): ?array
{
    $key = 'wt:' . $a . ',' . $b;
    [$j, $cached] = pcel_cached($pdo, $key, static function () use ($a, $b) {
        $dir = pcel_test_dir();
        if ($dir !== '') {
            @file_put_contents($dir . '/calls.log', 'getConnections ' . $a . ',' . $b . "\n", FILE_APPEND);
            $f = $dir . '/wt-' . preg_replace('/[^A-Za-z0-9_-]/', '', $a) . '-' . preg_replace('/[^A-Za-z0-9_-]/', '', $b) . '.json';
            if (!is_file($f)) { if (is_file($dir . '/online')) { return [['status' => '', 'path' => [], 'pathLength' => 0]]; } throw new RuntimeException(i18n_t('Pas de connexion à WikiTree pour le moment.')); }
            return json_decode((string) file_get_contents($f), true) ?: [];
        }
        return pcel_http(PC_WT_API . '?' . http_build_query(['action' => 'getConnections', 'keys' => $a . ',' . $b, 'appId' => PC_APPID, 'relation' => 0, 'fields' => 'Id,Name,FirstName,LastNameAtBirth,BirthDate,DeathDate']));
    });
    if (!$cached) { $net = true; }
    $r = array_is_list($j) ? ($j[0] ?? []) : $j;
    $path = (array) ($r['path'] ?? []);
    if (!$path || !(int) ($r['pathLength'] ?? 0)) { return null; }
    $clean = [];
    foreach ($path as $p) {
        if (!is_array($p)) { continue; }
        $name = (string) ($p['Name'] ?? '');
        $clean[] = ['wt' => preg_match('/^[\p{L}\'_ .-]{1,60}-\d{1,9}$/u', $name) ? $name : '', 'name' => trim((string) ($p['FirstName'] ?? '') . ' ' . (string) ($p['LastNameAtBirth'] ?? '')) ?: ($name ?: '?'),
            'rel' => mb_substr((string) ($p['pathType'] ?? ''), 0, 40), 'hidden' => (int) ($p['Id'] ?? 0) < 0, 'born' => substr((string) ($p['BirthDate'] ?? ''), 0, 4), 'died' => substr((string) ($p['DeathDate'] ?? ''), 0, 4)];
    }
    return ['length' => (int) $r['pathLength'], 'path' => $clean];
}

/* ═════════════════════ l'arbre : les liens d'une fiche à l'autre ═════════════════════ */

/** les liens de l'arbre : id → [[voisin, sorte]] (father, mother, parent, son, daughter, child, spouse) */
function pcel_tree_graph(PDO $pdo): array
{
    static $G = null;
    if ($G !== null) { return $G; }
    $gender = [];
    foreach ($pdo->query('SELECT id, gender FROM persons', PDO::FETCH_NUM) as [$id, $g]) { $gender[(int) $id] = (string) $g; }
    $G = []; $fam = [];
    $rel = static fn(int $id, string $m, string $f, string $u) => ($gender[$id] ?? '') === 'male' ? $m : (($gender[$id] ?? '') === 'female' ? $f : $u);
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families', PDO::FETCH_NUM) as [$fid, $a, $b]) {
        $a = (int) $a; $b = (int) $b; $fam[(int) $fid] = array_values(array_filter([$a, $b]));
        if ($a && $b) { $G[$a][] = [$b, $rel($b, 'husband', 'wife', 'spouse')]; $G[$b][] = [$a, $rel($a, 'husband', 'wife', 'spouse')]; }
    }
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children', PDO::FETCH_NUM) as [$fid, $c]) {
        $c = (int) $c;
        foreach ($fam[(int) $fid] ?? [] as $p) { $G[$c][] = [$p, $rel($p, 'father', 'mother', 'parent')]; $G[$p][] = [$c, $rel($c, 'son', 'daughter', 'child')]; }
    }
    return $G;
}
/** le plus court chemin dans l'arbre, de $from jusqu'aux fiches de $targets : [cible → [[id, sorte du lien qui y mène]…]] */
function pcel_tree_paths(PDO $pdo, int $from, array $targets, int $maxDepth = 40, int $want = 6): array
{
    $G = pcel_tree_graph($pdo);
    $T = array_flip(array_map('intval', $targets));
    $prev = [$from => null]; $queue = [$from]; $found = []; $depth = [$from => 0];
    for ($i = 0; $i < count($queue) && count($found) < $want; $i++) {
        $x = $queue[$i];
        if (isset($T[$x])) { $found[] = $x; }
        if ($depth[$x] >= $maxDepth) { continue; }
        foreach ($G[$x] ?? [] as [$y, $how]) { if (!array_key_exists($y, $prev)) { $prev[$y] = [$x, $how]; $depth[$y] = $depth[$x] + 1; $queue[] = $y; } }
    }
    $out = [];
    foreach ($found as $t) {
        $path = []; $x = $t;
        while ($prev[$x] !== null) { [$p, $how] = $prev[$x]; array_unshift($path, [$x, $how]); $x = $p; }
        $out[$t] = $path;
    }
    return $out;
}

/** les fiches de l'arbre reliées à Wikidata, qui peuvent sortir : [id → Q] */
function pcel_starts(PDO $pdo, ?array $only = null): array
{
    $out = [];
    $s = $pdo->query("SELECT id, wikidata_id FROM persons WHERE COALESCE(wikidata_id,'')<>''");
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $id = (int) $r['id']; $q = strtoupper(trim((string) $r['wikidata_id']));
        if (!preg_match('/^Q\d{1,12}$/', $q) || ($only !== null && !isset($only[$id]))) { continue; }
        if (pst_private_reason(pst_facts($pdo, $id)) !== '') { continue; } // jamais une fiche vivante ou confidentielle
        $out[$id] = $q;
    }
    return $out;
}

/* ═════════════════════ la recherche, pas à pas ═════════════════════ */

/** POST celeb_start : remonter les liens de Wikidata depuis les fiches reliées (de l'arbre entier, ou d'une portée) */
function pcel_start(PDO $pdo, array $d): array
{
    pcel_schema($pdo);
    $scope = (string) ($d['scope'] ?? 'all');
    $only = $scope === 'all' ? null : array_flip(pst_scope_ids($pdo, $scope));
    $starts = pcel_starts($pdo, $only);
    if (!$starts) { throw new LcndaBadInput(i18n_t('Aucune fiche de ce choix n’est reliée à Wikidata. Commence par « Proposer des fiches Wikidata », ou ajoute un identifiant Q sur une fiche (Références externes).')); }
    $seen = []; $frontier = [];
    foreach (array_unique(array_values($starts)) as $q) { $seen[$q] = [null, '', 0]; $frontier[] = $q; }
    $depth = max(1, min(PC_MAX_DEPTH, safe_int($d['depth'] ?? 6) ?: 6));
    $job = pst_job_new($pdo, 'celeb', pst_scope_label($pdo, $scope), ['mode' => 'bfs', 'scope' => $scope, 'ids' => array_keys($starts), 'pos' => 0, 'seen' => $seen, 'frontier' => $frontier, 'level' => 0, 'max_depth' => $depth,
        'famous' => max(5, safe_int($d['famous'] ?? PC_FAMOUS) ?: PC_FAMOUS), 'counts' => ['done' => 0, 'found' => 0, 'net' => 0, 'nodes' => count($seen)]]);
    return ['job' => pst_job_out($job)];
}

/** POST celeb_propose_start : chercher dans Wikidata des fiches qui pourraient être les tiennes (ancêtres nés avant 1900, à valider) */
function pcel_propose_start(PDO $pdo, array $d): array
{
    pcel_schema($pdo);
    $scope = (string) ($d['scope'] ?? 'sosa');
    $before = max(1000, min(1950, safe_int($d['before'] ?? 1900) ?: 1900));
    $ids = [];
    $has = $pdo->prepare("SELECT COALESCE(wikidata_id,'') FROM persons WHERE id=?");
    $dec = $pdo->prepare("SELECT count(*) FROM pcel_links WHERE person_id=? AND kind='wikidata' AND status IN ('no','ok','proposed')");
    foreach (pst_scope_ids($pdo, $scope) as $id) {
        $f = pst_facts($pdo, $id);
        if (pst_private_reason($f) !== '' || $f['birth'] === null || $f['estimated'] || $f['birth'] >= $before || trim($f['last']) === '' || trim($f['first']) === '') { continue; }
        $has->execute([$id]); if (trim((string) $has->fetchColumn()) !== '') { continue; }
        $dec->execute([$id]); if ((int) $dec->fetchColumn()) { continue; }
        $ids[] = $id;
    }
    if (!$ids) { throw new LcndaBadInput(i18n_t('Personne à proposer dans ce choix : il faut des fiches de personnes décédées, nées avant {y}, avec une année de naissance, et pas encore reliées.', ['y' => $before])); }
    $job = pst_job_new($pdo, 'celeb', i18n_t('Propositions Wikidata — {s}', ['s' => pst_scope_label($pdo, $scope)]), ['mode' => 'propose', 'scope' => $scope, 'ids' => $ids, 'pos' => 0, 'sub' => null,
        'counts' => ['done' => 0, 'found' => 0, 'net' => 0]]);
    return ['job' => pst_job_out($job)];
}

/** POST celeb_step {id} */
function pcel_step(PDO $pdo, array $d): array
{
    pcel_schema($pdo);
    $job = pst_job_get($pdo, safe_int($d['id'] ?? 0), 'celeb');
    if (!$job) { throw new LcndaBadInput(i18n_t('Recherche introuvable.')); }
    if ($job['status'] !== 'running') { return ['job' => pst_job_out($job), 'wait_ms' => 0]; }
    $net = false; $job['message'] = '';
    try {
        if (($job['state']['mode'] ?? '') === 'propose') { pcel_step_propose($pdo, $job, $net); } else { pcel_step_bfs($pdo, $job, $net); }
    } catch (RuntimeException $e) {
        $job['state']['counts']['errors'] = ($job['state']['counts']['errors'] ?? 0) + 1;
        $job['message'] = $e->getMessage();
        if ($job['state']['counts']['errors'] >= 3) { $job['status'] = 'paused'; }
        pst_job_save($pdo, $job);
        return ['job' => pst_job_out($job), 'wait_ms' => 20000];
    }
    pst_job_save($pdo, $job);
    return ['job' => pst_job_out($job), 'wait_ms' => $job['status'] === 'running' ? ($net ? 1000 : 0) : 0];
}

/** un pas de la remontée : les personnes du niveau courant (25 par requête), puis le niveau suivant */
function pcel_step_bfs(PDO $pdo, array &$job, bool &$net): void
{
    $st = &$job['state'];
    $deadline = microtime(true) + 2.0;
    while (microtime(true) < $deadline) {
        if (!$st['frontier']) {
            $next = [];
            foreach ($st['seen'] as $q => [$p, $prop, $lvl]) { if ($lvl === $st['level'] + 1) { $next[] = $q; } }
            $st['level']++;
            if (!$next || $st['level'] > $st['max_depth']) { $job['status'] = 'done'; break; }
            $st['frontier'] = $next;
        }
        if ($net) { break; }
        $batch = array_splice($st['frontier'], 0, PC_BATCH);
        $E = pcel_wd_entities($pdo, $batch, $net);
        if ($net) { $st['counts']['net']++; }
        foreach ($batch as $q) {
            $e = $E[$q] ?? null;
            if (!$e || !empty($e['missing'])) { continue; }
            $st['counts']['done']++;
            [$p, , $lvl] = $st['seen'][$q];
            if ($e['sitelinks'] >= $st['famous'] && $e['human']) { pcel_found_save($pdo, $st['seen'], $q, $e, $E); $st['counts']['found']++; }
            if ($lvl >= $st['max_depth'] || count($st['seen']) >= PC_MAX_NODES) { continue; }
            foreach ($e['rel'] as $prop => $list) {
                foreach ($list as $y) { if (!isset($st['seen'][$y]) && count($st['seen']) < PC_MAX_NODES) { $st['seen'][$y] = [$q, $prop, $lvl + 1]; } }
            }
        }
        $st['counts']['nodes'] = count($st['seen']);
    }
    unset($st);
}

/** garde une célébrité trouvée, avec le chemin depuis la fiche de départ (chaque maillon : la propriété et l'élément Wikidata) */
function pcel_found_save(PDO $pdo, array $seen, string $q, array $e, array $E): void
{
    $chain = []; $x = $q; $guard = 0;
    while ($seen[$x][0] !== null && $guard++ < 40) { [$p, $prop] = $seen[$x]; array_unshift($chain, ['from' => $p, 'to' => $x, 'prop' => $prop]); $x = $p; }
    $start = $x;
    // les noms des maillons (déjà lus : dans le cache)
    $lbl = $pdo->prepare('SELECT body FROM pcel_cache WHERE qkey=?');
    foreach ($chain as &$h) {
        $lbl->execute(['wd:' . $h['to']]); $b = json_decode((string) $lbl->fetchColumn(), true) ?: [];
        $h['label'] = (string) ($b['label'] ?? $h['to']); $h['gender'] = (string) ($b['gender'] ?? ''); $h['born'] = $b['born'] ?? null; $h['died'] = $b['died'] ?? null;
    }
    unset($h);
    $pdo->prepare('INSERT INTO pcel_found(start_q, celeb_q, hops, path, label, descr, sitelinks, wiki_fr, wikitree, born, died) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(start_q, celeb_q) DO UPDATE SET hops=excluded.hops, path=excluded.path, label=excluded.label, descr=excluded.descr, sitelinks=excluded.sitelinks, wiki_fr=excluded.wiki_fr, wikitree=excluded.wikitree,
        born=excluded.born, died=excluded.died, computed_at=CURRENT_TIMESTAMP WHERE excluded.hops <= pcel_found.hops')
        ->execute([$start, $q, count($chain), json_encode($chain, JSON_UNESCAPED_UNICODE), $e['label'], mb_substr($e['desc'], 0, 300), $e['sitelinks'], $e['wiki_fr'], $e['wikitree'], $e['born'], $e['died']]);
}

/** un pas des propositions : une personne = une recherche par nom, puis la lecture des candidats (deux requêtes au plus) */
function pcel_step_propose(PDO $pdo, array &$job, bool &$net): void
{
    $st = &$job['state'];
    $deadline = microtime(true) + 2.0; $n = count($st['ids']);
    while ((int) $st['pos'] < $n && microtime(true) < $deadline) {
        $pid = (int) $st['ids'][$st['pos']];
        $f = pst_facts($pdo, $pid);
        if (pst_private_reason($f) !== '') { $st['pos']++; $st['sub'] = null; continue; }
        if (($st['sub']['pid'] ?? 0) !== $pid) { $st['sub'] = ['pid' => $pid, 'cands' => null]; }
        if ($st['sub']['cands'] === null) {
            if ($net) { break; }
            $first = trim(preg_split('/[\s,]+/', trim($f['first']))[0] ?? '');
            $st['sub']['cands'] = pcel_wd_search($pdo, trim($first . ' ' . $f['last']), $net);
            if ($net) { $st['counts']['net']++; }
        }
        if ($st['sub']['cands']) {
            $was = $net; $net2 = false;
            if ($net) { // déjà une requête : seulement si tout est dans le cache
                $s = $pdo->prepare('SELECT count(*) FROM pcel_cache WHERE qkey IN (' . implode(',', array_fill(0, count($st['sub']['cands']), '?')) . ')');
                $s->execute(array_map(static fn($q) => 'wd:' . $q, $st['sub']['cands']));
                if ((int) $s->fetchColumn() < count($st['sub']['cands'])) { break; }
            }
            $E = pcel_wd_entities($pdo, $st['sub']['cands'], $net2);
            if ($net2) { $net = true; $st['counts']['net']++; }
            foreach ($E as $q => $e) {
                $m = pcel_match($f, $e);
                if (!$m) { continue; }
                $pdo->prepare("INSERT INTO pcel_links(person_id, kind, ext_id, status, score, why, label) VALUES(?,'wikidata',?,'proposed',?,?,?) ON CONFLICT(person_id, kind, ext_id) DO NOTHING")
                    ->execute([$pid, $q, $m['score'], json_encode($m['why'], JSON_UNESCAPED_UNICODE), mb_substr($e['label'] . ($e['desc'] !== '' ? ' — ' . $e['desc'] : ''), 0, 300)]);
                $st['counts']['found']++;
            }
            unset($was);
        }
        $st['pos']++; $st['sub'] = null; $st['counts']['done']++;
    }
    if ((int) $st['pos'] >= $n) { $job['status'] = 'done'; }
    unset($st);
}

/** le rapprochement prudent : un humain, même nom, même prénom, né(e) à un an près ; mort(e) à un an près si les deux le disent */
function pcel_match(array $f, array $e): ?array
{
    if (!empty($e['missing']) || !$e['human'] || $e['born'] === null || $f['birth'] === null) { return null; }
    $d = abs($e['born'] - $f['birth']);
    if ($d > 1) { return null; }
    if ($f['death'] !== null && $e['died'] !== null && abs($e['died'] - $f['death']) > 1) { return null; }
    if ($f['gender'] !== '' && $f['gender'] !== 'unknown' && $e['gender'] !== '' && $e['gender'] !== $f['gender']) { return null; }
    $words = pst_words($e['label']); $last = pst_words($f['last']); $first = pst_words($f['first']);
    if (!$last || !array_intersect($last, $words) || !$first || !in_array($first[0], $words, true)) { return null; }
    $why = [pst_check('ok', i18n_t('même nom et même prénom ({l})', ['l' => $e['label']])), pst_check('ok', $d === 0 ? i18n_t('né(e) la même année ({y})', ['y' => $e['born']]) : i18n_t('né(e) à un an près ({y} ; sa fiche : {z})', ['y' => $e['born'], 'z' => $f['birth']]))];
    $score = 60 + ($d === 0 ? 20 : 10);
    if ($f['death'] !== null && $e['died'] !== null) { $score += 15; $why[] = pst_check('ok', i18n_t('mort(e) en {y}', ['y' => $e['died']])); }
    elseif ($e['died'] !== null) { $why[] = pst_check('q', i18n_t('mort(e) en {y} (sa fiche n’a pas de décès)', ['y' => $e['died']])); }
    if ($e['desc'] !== '') { $why[] = pst_check('q', i18n_t('Wikidata dit : « {d} »', ['d' => $e['desc']])); }
    return ['score' => min(100, $score), 'why' => $why];
}

/* ═════════════════════ ce que voit l'écran ═════════════════════ */

function pcel_person_name(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender FROM persons WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    return ['id' => $id, 'name' => trim(($r['first_name'] ?? '') . ' ' . mb_strtoupper((string) ($r['last_name'] ?? ''))) ?: '#' . $id, 'gender' => (string) ($r['gender'] ?? '')];
}
/** les célébrités trouvées depuis les fiches reliées : start Q → [lignes] */
function pcel_found_by_start(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT * FROM pcel_found ORDER BY hops, sitelinks DESC')->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $r['path'] = json_decode((string) $r['path'], true) ?: [];
        $out[(string) $r['start_q']][] = $r;
    }
    return $out;
}
/** une célébrité vue depuis une fiche : le chemin dans l'arbre, puis dans Wikidata */
function pcel_result(PDO $pdo, array $treePath, int $from, int $startId, string $startQ, array $c): array
{
    $tree = [];
    foreach ($treePath as [$id, $how]) { $tree[] = pcel_person_name($pdo, $id) + ['rel' => $how]; }
    $wd = array_map(static fn($h) => ['q' => $h['to'], 'label' => $h['label'], 'rel' => PC_REL[$h['prop']] ?? $h['prop'], 'prop' => $h['prop'], 'gender' => $h['gender'] ?? '',
        'born' => $h['born'] ?? null, 'died' => $h['died'] ?? null, 'url' => 'https://www.wikidata.org/wiki/' . $h['to'], 'prop_url' => 'https://www.wikidata.org/wiki/Property:' . $h['prop'],
        'from_url' => 'https://www.wikidata.org/wiki/' . $h['from'] . '#' . $h['prop']], $c['path']);
    $spouse = (bool) array_filter($tree, static fn($t) => in_array($t['rel'], ['husband', 'wife', 'spouse'], true)) || (bool) array_filter($wd, static fn($h) => $h['prop'] === 'P26');
    return ['q' => (string) $c['celeb_q'], 'label' => (string) $c['label'], 'desc' => (string) $c['descr'], 'sitelinks' => (int) $c['sitelinks'], 'born' => $c['born'] !== null ? (int) $c['born'] : null, 'died' => $c['died'] !== null ? (int) $c['died'] : null,
        'url' => 'https://www.wikidata.org/wiki/' . $c['celeb_q'], 'wiki_url' => $c['wiki_fr'] !== '' ? 'https://fr.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', (string) $c['wiki_fr'])) : '',
        'wikitree' => (string) $c['wikitree'], 'degrees' => count($tree) + count($wd), 'tree_hops' => count($tree), 'wd_hops' => count($wd), 'by_marriage' => $spouse,
        'from' => pcel_person_name($pdo, $from), 'via' => pcel_person_name($pdo, $startId) + ['q' => $startQ, 'url' => 'https://www.wikidata.org/wiki/' . $startQ], 'tree' => $tree, 'wikidata' => $wd,
        'computed' => (string) $c['computed_at']];
}

/** GET celeb_person&id= : les célébrités les plus proches de cette fiche (3 au plus), et ce que WikiTree a trouvé */
function pcel_person(PDO $pdo, int $id): array
{
    pcel_schema($pdo);
    if (!person_exists($pdo, $id)) { throw new LcndaBadInput(i18n_t('Fiche introuvable.')); }
    $by = pcel_found_by_start($pdo);
    $starts = array_filter(pcel_starts($pdo), static fn($q) => isset($by[$q]));
    $out = [];
    if ($starts) {
        foreach (pcel_tree_paths($pdo, $id, array_keys($starts), 40, 8) as $sid => $tp) {
            foreach ($by[$starts[$sid]] as $c) { $out[] = pcel_result($pdo, $tp, $id, $sid, $starts[$sid], $c); }
        }
    }
    usort($out, static fn($a, $b) => [$a['degrees'], -$a['sitelinks']] <=> [$b['degrees'], -$b['sitelinks']]);
    $seen = []; $best = [];
    foreach ($out as $r) { if (isset($seen[$r['q']])) { continue; } $seen[$r['q']] = 1; $best[] = $r; if (count($best) >= 3) { break; } }
    $f = pst_facts($pdo, $id);
    return ['person_id' => $id, 'results' => $best, 'wikitree' => pcel_wt_results($pdo, $id), 'wikitree_ids' => pcel_wt_ids($pdo, $id), 'can_send' => pst_private_reason($f) === '',
        'wikidata_id' => (string) $pdo->query('SELECT COALESCE(wikidata_id,\'\') FROM persons WHERE id=' . $id)->fetchColumn()];
}

/** GET celeb_list : toutes les célébrités trouvées, vues depuis la personne de départ (degrés), et les fiches reliées */
function pcel_list(PDO $pdo): array
{
    pcel_schema($pdo);
    $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    $by = pcel_found_by_start($pdo);
    $allStarts = pcel_starts($pdo);
    $starts = array_filter($allStarts, static fn($q) => isset($by[$q]));
    $paths = $root && $starts ? pcel_tree_paths($pdo, $root, array_keys($starts), 60, 100000) : [];
    $rows = [];
    foreach ($starts as $sid => $q) {
        $tp = $paths[$sid] ?? null;
        foreach ($by[$q] as $c) {
            $r = pcel_result($pdo, $tp ?? [], $root, $sid, $q, $c);
            if ($tp === null) { $r['degrees'] = null; $r['not_linked'] = true; } // fiche reliée à Wikidata, mais pas à la personne de départ
            $rows[] = $r;
        }
    }
    usort($rows, static fn($a, $b) => [$a['degrees'] ?? 999, -$a['sitelinks']] <=> [$b['degrees'] ?? 999, -$b['sitelinks']]);
    $seen = []; $uniq = [];
    foreach ($rows as $r) { if (isset($seen[$r['q']])) { continue; } $seen[$r['q']] = 1; $uniq[] = $r; }
    $linked = array_map(static fn($id, $q) => pcel_person_name($pdo, (int) $id) + ['q' => $q, 'url' => 'https://www.wikidata.org/wiki/' . $q, 'found' => count($by[$q] ?? [])], array_keys($allStarts), array_values($allStarts));
    return ['root' => $root ? pcel_person_name($pdo, $root) : null, 'rows' => $uniq, 'linked' => $linked, 'job' => pst_job_out(pst_job_last($pdo, 'celeb')), 'proposals' => pcel_proposals($pdo)['rows']];
}

/** GET celeb_proposals : les fiches Wikidata proposées (à valider) */
function pcel_proposals(PDO $pdo): array
{
    pcel_schema($pdo);
    $s = $pdo->query("SELECT l.*, p.first_name, p.last_name, p.gender FROM pcel_links l JOIN persons p ON p.id=l.person_id WHERE l.kind='wikidata' AND l.status='proposed' ORDER BY l.score DESC, l.person_id");
    return ['rows' => array_map(static fn($r) => ['person_id' => (int) $r['person_id'], 'person' => trim($r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name'])), 'q' => (string) $r['ext_id'],
        'url' => 'https://www.wikidata.org/wiki/' . $r['ext_id'], 'score' => (int) $r['score'], 'why' => json_decode((string) $r['why'], true) ?: [], 'label' => (string) $r['label']], $s->fetchAll(PDO::FETCH_ASSOC))];
}

/* ═════════════════════ ✓ C'est lui / ✗ Pas lui (identifiant Wikidata) ═════════════════════ */

function pcel_link_ok(PDO $pdo, array $d): array
{
    pcel_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $q = strtoupper(trim((string) ($d['q'] ?? '')));
    if (!preg_match('/^Q\d{1,12}$/', $q)) { throw new LcndaBadInput('Identifiant Wikidata incorrect.'); }
    $r = person_wikidata_set($pdo, ['id' => $pid, 'qid' => $q]);
    $pdo->prepare("INSERT INTO pcel_links(person_id, kind, ext_id, status) VALUES(?,'wikidata',?,'ok') ON CONFLICT(person_id, kind, ext_id) DO UPDATE SET status='ok'")->execute([$pid, $q]);
    return ['ok' => true, 'person_id' => $pid, 'q' => $q, 'before' => $r['before']];
}
function pcel_link_undo(PDO $pdo, array $d): array
{
    pcel_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $q = strtoupper(trim((string) ($d['q'] ?? '')));
    $before = strtoupper(trim((string) ($d['before'] ?? '')));
    person_wikidata_set($pdo, ['id' => $pid, 'qid' => preg_match('/^Q\d{1,12}$/', $before) ? $before : '']);
    $pdo->prepare("UPDATE pcel_links SET status='proposed' WHERE person_id=? AND kind='wikidata' AND ext_id=?")->execute([$pid, $q]);
    return ['ok' => true];
}
function pcel_link_no(PDO $pdo, array $d, bool $no): array
{
    pcel_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $q = strtoupper(trim((string) ($d['q'] ?? '')));
    if (!preg_match('/^Q\d{1,12}$/', $q) || !person_exists($pdo, $pid)) { throw new LcndaBadInput('Proposition inconnue.'); }
    $pdo->prepare("INSERT INTO pcel_links(person_id, kind, ext_id, status) VALUES(?,'wikidata',?,?) ON CONFLICT(person_id, kind, ext_id) DO UPDATE SET status=excluded.status")->execute([$pid, $q, $no ? 'no' : 'proposed']);
    return ['ok' => true];
}

/* ═════════════════════ 🌲 WikiTree ═════════════════════ */

/** les identifiants WikiTree connus d'une fiche : donnés à la main, dans une source (lien wikitree.com/wiki/…), ou par Wikidata (P2949) */
function pcel_wt_ids(PDO $pdo, int $pid): array
{
    $out = [];
    $s = $pdo->prepare("SELECT ext_id FROM pcel_links WHERE person_id=? AND kind='wikitree' AND status='ok'"); $s->execute([$pid]);
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $w) { $out[(string) $w] = 'fiche'; }
    try {
        $s = $pdo->prepare("SELECT s.url, s.text FROM sources s JOIN source_links sl ON sl.source_record_id=s.id WHERE sl.entity_type='person' AND sl.entity_id=? AND (s.url LIKE '%wikitree.com/wiki/%' OR s.text LIKE '%wikitree.com/wiki/%')");
        $s->execute([$pid]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if (preg_match('#wikitree\.com/wiki/([\p{L}\'_.%-]{1,60}-\d{1,9})#u', $r['url'] . ' ' . $r['text'], $m)) { $out[str_replace(' ', '_', rawurldecode($m[1]))] ??= 'source'; } }
    } catch (Throwable $_) {}
    $q = (string) $pdo->query('SELECT COALESCE(wikidata_id,\'\') FROM persons WHERE id=' . $pid)->fetchColumn();
    if ($q !== '') { $c = $pdo->prepare('SELECT body FROM pcel_cache WHERE qkey=?'); $c->execute(['wd:' . strtoupper($q)]); $b = json_decode((string) $c->fetchColumn(), true); if (!empty($b['wikitree'])) { $out[(string) $b['wikitree']] ??= 'wikidata'; } }
    return array_map(static fn($w, $from) => ['wt' => $w, 'from' => $from, 'url' => 'https://www.wikitree.com/wiki/' . rawurlencode($w)], array_keys($out), array_values($out));
}
function pcel_wt_results(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT * FROM pcel_wt_found WHERE person_id=? ORDER BY length IS NULL, length'); $s->execute([$pid]);
    return array_map(static fn($r) => ['target' => (string) $r['target'], 'label' => (string) $r['label'], 'from' => (string) $r['wt_from'], 'length' => $r['length'] !== null ? (int) $r['length'] : null,
        'path' => json_decode((string) $r['path'], true) ?: [], 'checked' => (string) $r['checked_at'], 'finder_url' => pcel_wt_finder((string) $r['wt_from'], (string) $r['target'])], $s->fetchAll(PDO::FETCH_ASSOC));
}
/** la page « Connection Finder » du site (à ouvrir soi-même) */
function pcel_wt_finder(string $a, string $b): string
{
    return 'https://www.wikitree.com/index.php?title=Special:Connection&action=connect&person1Name=' . rawurlencode($a) . '&person2Name=' . rawurlencode($b);
}
function pcel_wt_set(PDO $pdo, array $d): array
{
    pcel_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    $w = trim((string) ($d['wt'] ?? ''));
    if (preg_match('#wikitree\.com/wiki/([^/?\#\s]+)#u', $w, $m)) { $w = rawurldecode($m[1]); }
    $w = str_replace(' ', '_', $w);
    if (!person_exists($pdo, $pid)) { throw new LcndaBadInput(i18n_t('Fiche introuvable.')); }
    $prev = array_values(array_filter(pcel_wt_ids($pdo, $pid), static fn($x) => $x['from'] === 'fiche'))[0]['wt'] ?? '';
    $pdo->prepare("DELETE FROM pcel_links WHERE person_id=? AND kind='wikitree'")->execute([$pid]);
    if ($w !== '') {
        if (!preg_match('/^[\p{L}\'_.-]{1,60}-\d{1,9}$/u', $w)) { throw new LcndaBadInput(i18n_t('Un identifiant WikiTree ressemble à « Hugo-215 » (le nom, un tiret, un numéro).')); }
        $pdo->prepare("INSERT INTO pcel_links(person_id, kind, ext_id, status) VALUES(?,'wikitree',?,'ok')")->execute([$pid, $w]);
    }
    return ['ok' => true, 'wt' => $w, 'before' => $prev];
}
/** POST celeb_wikitree_check {person_id, target} : une célébrité à la fois (une requête), seulement si WikiTree est allumé dans Réglages */
function pcel_wt_check(PDO $pdo, array $d): array
{
    pcel_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (pst_private_reason(pst_facts($pdo, $pid)) !== '') { throw new LcndaBadInput(i18n_t('Personne vivante ou fiche confidentielle : rien n’est envoyé à un site extérieur.')); }
    $ids = pcel_wt_ids($pdo, $pid);
    if (!$ids) { throw new LcndaBadInput(i18n_t('Cette fiche n’a pas d’identifiant WikiTree.')); }
    $targets = pcel_wt_targets($pdo);
    $t = (string) ($d['target'] ?? '');
    $label = '';
    foreach ($targets as $x) { if ($x['wt'] === $t) { $label = $x['label']; } }
    if ($label === '') { throw new LcndaBadInput(i18n_t('Célébrité inconnue.')); }
    $net = false;
    $r = pcel_wt_connect($pdo, $ids[0]['wt'], $t, $net);
    $pdo->prepare('INSERT INTO pcel_wt_found(person_id, target, wt_from, length, path, label) VALUES(?,?,?,?,?,?) ON CONFLICT(person_id, target) DO UPDATE SET wt_from=excluded.wt_from, length=excluded.length, path=excluded.path, label=excluded.label, checked_at=CURRENT_TIMESTAMP')
        ->execute([$pid, $t, $ids[0]['wt'], $r['length'] ?? null, json_encode($r['path'] ?? [], JSON_UNESCAPED_UNICODE), $label]);
    return ['ok' => true, 'net' => $net, 'result' => $r, 'finder_url' => pcel_wt_finder($ids[0]['wt'], $t)];
}
/** les célébrités à essayer dans WikiTree : la courte liste (Wikidata P2949) et celles trouvées par Wikidata qui ont un identifiant WikiTree */
function pcel_wt_targets(PDO $pdo): array
{
    $out = [];
    foreach (PC_WT_FAMOUS as [$q, $l, $w]) { $out[$w] = ['wt' => $w, 'label' => $l, 'q' => $q, 'url' => 'https://www.wikidata.org/wiki/' . $q]; }
    try { foreach ($pdo->query("SELECT celeb_q, label, wikitree FROM pcel_found WHERE wikitree<>'' ORDER BY sitelinks DESC LIMIT 20") as $r) { $out[(string) $r['wikitree']] ??= ['wt' => (string) $r['wikitree'], 'label' => (string) $r['label'], 'q' => (string) $r['celeb_q'], 'url' => 'https://www.wikidata.org/wiki/' . $r['celeb_q']]; } } catch (Throwable $_) {}
    return array_values($out);
}

/* ═════════════════════ à propos, aiguillage ═════════════════════ */

function pcel_about(PDO $pdo): array
{
    pcel_schema($pdo);
    return ['sources' => [
        ['label' => 'Wikidata', 'url' => 'https://www.wikidata.org/', 'licence' => 'CC0 1.0', 'licence_url' => 'https://www.wikidata.org/wiki/Wikidata:Licensing', 'online' => true,
            'what' => i18n_t('Les liens de famille connus (père P22, mère P25, conjoint P26, enfant P40, frère ou sœur P3373) et le nombre d’articles Wikipédia'),
            'rules' => i18n_t('Requêtes une à une, nom de programme reconnaissable, pause si le site le demande (Retry-After, maxlag) ; réponses gardées 60 jours.')],
        ['label' => 'WikiTree', 'url' => 'https://www.wikitree.com/', 'licence' => i18n_t('conditions du site (non relues : site injoignable le 25/11/2026)'), 'licence_url' => 'https://www.wikitree.com/wiki/Help:Terms_of_Service', 'online' => true,
            'what' => i18n_t('Connection Finder (getConnections) entre une fiche WikiTree et une célébrité'),
            'rules' => i18n_t('Documentation de l’API (github.com/wikitree/wikitree-api, lue le 25/11/2026) : lecture seule, pour des applications qui lisent et affichent ; un identifiant d’application (appId) est demandé. Éteint par défaut ; rien n’est recopié dans l’arbre.')]],
        'cache' => (int) $pdo->query('SELECT count(*) FROM pcel_cache')->fetchColumn(), 'targets' => pcel_wt_targets($pdo), 'job' => pst_job_out(pst_job_last($pdo, 'celeb'))];
}
function pcel_cache_clear(PDO $pdo): array
{
    pcel_schema($pdo);
    $n = (int) $pdo->exec('DELETE FROM pcel_cache');
    return ['removed' => $n];
}

function pcel_api_get(PDO $pdo, string $action, array $q): array
{
    pcel_schema($pdo);
    return match ($action) {
        'celeb_list' => pcel_list($pdo),
        'celeb_person' => pcel_person($pdo, safe_int($q['id'] ?? 0)),
        'celeb_proposals' => pcel_proposals($pdo),
        'celeb_about' => pcel_about($pdo),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function pcel_api_post(PDO $pdo, string $action, array $d): array
{
    pcel_schema($pdo);
    return match ($action) {
        'celeb_start' => pcel_start($pdo, $d),
        'celeb_propose_start' => pcel_propose_start($pdo, $d),
        'celeb_step' => pcel_step($pdo, $d),
        'celeb_pause' => (static function () use ($pdo, $d) { $j = pst_job_get($pdo, safe_int($d['id'] ?? 0), 'celeb'); if (!$j) { throw new LcndaBadInput('?'); } if ($j['status'] === 'running') { $j['status'] = 'paused'; pst_job_save($pdo, $j); } return ['job' => pst_job_out($j)]; })(),
        'celeb_resume' => (static function () use ($pdo, $d) { $j = pst_job_get($pdo, safe_int($d['id'] ?? 0), 'celeb'); if (!$j) { throw new LcndaBadInput('?'); } if ($j['status'] === 'paused') { $j['status'] = 'running'; $j['state']['counts']['errors'] = 0; $j['message'] = ''; pst_job_save($pdo, $j); } return ['job' => pst_job_out($j)]; })(),
        'celeb_stop' => (static function () use ($pdo, $d) { $j = pst_job_get($pdo, safe_int($d['id'] ?? 0), 'celeb'); if (!$j) { throw new LcndaBadInput('?'); } if ($j['status'] !== 'done') { $j['status'] = 'stopped'; pst_job_save($pdo, $j); } return ['job' => pst_job_out($j)]; })(),
        'celeb_link_ok' => pcel_link_ok($pdo, $d),
        'celeb_link_undo' => pcel_link_undo($pdo, $d),
        'celeb_link_no' => pcel_link_no($pdo, $d, true),
        'celeb_link_unno' => pcel_link_no($pdo, $d, false),
        'celeb_wikitree_set' => pcel_wt_set($pdo, $d),
        'celeb_wikitree_check' => pcel_wt_check($pdo, $d),
        'celeb_cache_clear' => pcel_cache_clear($pdo),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
