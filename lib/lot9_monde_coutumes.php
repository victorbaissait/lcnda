<?php
declare(strict_types=1);

/**
 * 🌍 Le monde et les coutumes de son temps (lot 9) — serveur de assets/js/heritage-lot9-monde-coutumes.js.
 * Presque tout est livré dans l'app (assets/data/l9b-*.json.gz, lus par la page) ; ce fichier sert :
 *  - GET  l9b_person&id=            le contexte d'une fiche : ses lieux (code INSEE, position), ses événements, ses métiers,
 *                                   les mots de ses notes utiles (compagnon, nourrice, décoration…), les décès de sa famille ;
 *  - GET  l9b_place&place_id=|insee=|name=&lat=&lon=   le code INSEE et la position d'un lieu ;
 *  - GET  l9b_these&id=[&fresh=1]   🎓 sa thèse (médecine, pharmacie, droit…) : Sudoc (ABES, SRU) — et theses.fr pour 1985 et après ;
 *                                   EN LIGNE, à la demande, gardé 90 jours ; jamais pour une personne vivante ou une fiche confidentielle ;
 *  - GET  l9b_langues&insee=|qid=   🌐 le nom de la commune dans toutes les langues (Wikidata, CC0), EN LIGNE, gardé 180 jours ;
 *  - POST l9b_these_add {person_id, key}  ✓ C'est lui : une source « à vérifier » et un événement « Diplôme » (↶ l9b_these_undo {batch}) ;
 *  - POST l9b_these_mark {person_id, key, verdict: no|''}  ✗ Pas lui (↶) ;  POST l9b_cache_clear / l9b_cache_restore {token}.
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_L9B_DIR (un fichier <étape> par appel ; absent = hors ligne).
 */

require_once __DIR__ . '/commune_culture.php'; // cc_find_insee, cc_dep_of_insee, cc_data('communes'), cc_departements

const L9B_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande)';
const L9B_HOSTS = ['www.sudoc.abes.fr', 'theses.fr', 'www.wikidata.org'];
const L9B_TTL = ['these' => 90 * 86400, 'langues' => 180 * 86400];
/** les métiers qui passaient par une thèse : [sorte, mots repliés] */
const L9B_THESE_JOBS = [
    'medecine' => ['medecin', 'docteur en medecine', 'chirurgien', 'officier de sante', 'docteur medecin', 'medecin major', 'medecin militaire', 'psychiatre', 'medecin de campagne', 'medecin aliéniste'],
    'pharmacie' => ['pharmacien', 'pharmacienne', 'apothicaire', 'docteur en pharmacie'],
    'droit' => ['avocat', 'docteur en droit', 'juriste', 'magistrat', 'juge', 'professeur de droit', 'avoue', 'procureur'],
    'veterinaire' => ['veterinaire', 'medecin veterinaire'],
    'dentaire' => ['chirurgien dentiste', 'dentiste'],
];

/* ═════════════════════ cache, réseau ═════════════════════ */

function l9b_cache_dir(bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir())), '/') . '/cache/lot9';
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function l9b_cache_get(string $key, int $ttl): ?array
{
    $f = l9b_cache_dir() . '/' . sha1($key) . '.json';
    if (!is_file($f)) { return null; }
    $j = json_decode((string) @file_get_contents($f), true);
    if (!is_array($j) || !isset($j['data'])) { return null; }
    $j['stale'] = (time() - (int) ($j['at'] ?? 0)) > $ttl;
    return $j;
}
function l9b_cache_put(string $key, array $data): void
{
    $d = l9b_cache_dir(true);
    @file_put_contents($d . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}
function l9b_test_dir(): string
{
    $dir = (string) getenv('LCNDA_TEST_L9B_DIR');
    return getenv('GENEALOGY_TEST') === '1' && $dir !== '' ? $dir : '';
}
/** un appel en ligne (texte brut) ; en essai, la réponse est lue dans LCNDA_TEST_L9B_DIR/<étape> */
function l9b_http(string $step, string $url, string $accept = 'application/json'): string
{
    $step = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
    if (($dir = l9b_test_dir()) !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        if (!is_file($dir . '/' . $step)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($dir . '/' . $step);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (!in_array(strtolower((string) parse_url($url, PHP_URL_HOST)), L9B_HOSTS, true)) { throw new RuntimeException('Adresse refusée.'); }
    $body = ''; $too = false; $max = 4_000_000;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => L9B_UA, CURLOPT_HTTPHEADER => ['Accept: ' . $accept],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }]
        + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.') . ($err !== '' ? " ({$err})" : '')); }
    if ($code === 429 || $code === 503 || $code === 504) { throw new RuntimeException(i18n_t('Le site est très demandé en ce moment : réessaie dans une minute.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    return $body;
}
function l9b_fold(string $s): string
{
    $s = mb_strtolower($s);
    $s = (string) (class_exists('Normalizer') ? preg_replace('/\p{Mn}+/u', '', (string) Normalizer::normalize($s, Normalizer::FORM_D)) : iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s));
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', str_replace(['’', "'"], ' ', $s)));
}

/* ═════════════════════ la fiche : son contexte ═════════════════════ */

const L9B_KIND = ['BIRT' => 'birth', 'CHR' => 'bapt', 'BAPM' => 'bapt', 'MARR' => 'marriage', 'MRCI' => 'marriage', 'MRRE' => 'marriage', 'DEAT' => 'death', 'BURI' => 'burial',
    'RESI' => 'resi', 'CENS' => 'resi', 'OCCU' => 'occu', '_MILT' => 'mili', 'GRAD' => 'grad', '_DEG' => 'grad', 'EDUC' => 'educ'];

function l9b_place_row(array $e): ?array
{
    if (empty($e['place_id'])) { return null; }
    $insee = preg_match('/^\d[\dAB]\d{3}$/', (string) ($e['insee'] ?? '')) ? (string) $e['insee'] : '';
    $lat = is_numeric($e['lat'] ?? null) ? (float) $e['lat'] : null; $lon = is_numeric($e['lon'] ?? null) ? (float) $e['lon'] : null;
    $name = trim((string) preg_replace('/\s*[,(].*$/u', '', (string) $e['name']));
    $country = trim((string) ($e['country'] ?? ''));
    $fr = $insee !== '' || $country === '' || preg_match('/^(fr|fra|france)$/i', $country);
    if ($insee === '' && $fr) { $insee = cc_find_insee($name, (string) ($e['county'] ?? ''), $lat, $lon, $country); }
    if ($insee !== '' && $lat === null) { $c = cc_data('communes')['c'][$insee] ?? null; if ($c && $c[1] !== null) { $lat = (float) $c[1]; $lon = (float) $c[2]; } }
    return ['id' => (int) $e['place_id'], 'name' => $name, 'insee' => $insee, 'dep' => $insee !== '' ? cc_dep_of_insee($insee) : '', 'lat' => $lat, 'lon' => $lon, 'country' => $insee !== '' ? 'FR' : $country];
}

function l9b_person(PDO $pdo, array $q): array
{
    $pid = safe_int($q['id'] ?? ($q['person_id'] ?? 0));
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new LcndaBadInput('Fiche introuvable.'); }
    $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $x = in_array('admin4_code', $pc, true) ? "COALESCE(pl.admin4_code,'')" : "''";
    $ev = $pdo->prepare("SELECT e.id, e.year, e.sort_date, e.date_text, e.title, e.description, e.family_id, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(t.label,'') AS label, pl.id AS place_id,
        COALESCE(pl.name,'') AS name, COALESCE(pl.county,'') AS county, COALESCE(pl.country,'') AS country, $x AS insee, pl.latitude AS lat, pl.longitude AS lon
        FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year, 9999)");
    $ev->execute([$pid, $pid, $pid]);
    $places = []; $events = []; $jobs = []; $texts = [];
    foreach (preg_split('/\s*[;,\/]\s*/u', (string) ($p['occupation'] ?? '')) ?: [] as $t) { if (trim((string) $t) !== '') { $jobs[] = ['text' => trim((string) $t), 'year' => null]; } }
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $tag = strtoupper((string) $e['tag']);
        if ($e['family_id'] && !in_array($tag, ['MARR', 'MRCI', 'MRRE', 'DIV', 'ENGA', 'MARB', 'MARC'], true)) { continue; }
        $pl = l9b_place_row($e); $k = null;
        if ($pl) { $k = $pl['insee'] !== '' ? $pl['insee'] : 'p' . $pl['id']; $places[$k] ??= $pl; }
        $date = preg_match('/^(\d{4})-(\d\d)-(\d\d)/', (string) $e['sort_date'], $m) && $m[2] !== '00' ? $m[1] . '-' . $m[2] . ($m[3] !== '00' ? '-' . $m[3] : '') : '';
        $kind = L9B_KIND[$tag] ?? 'other';
        $txt = trim((string) $e['title'] . ' ' . (string) $e['description']);
        if ($kind === 'occu' && $txt !== '') { $jobs[] = ['text' => mb_substr($txt, 0, 120), 'year' => is_numeric($e['year']) ? (int) $e['year'] : null]; }
        if ($txt !== '' || $kind === 'other') { $texts[] = mb_substr(trim((string) $e['label'] . ' : ' . $txt), 0, 600); }
        $events[] = ['id' => (int) $e['id'], 'kind' => $kind, 'tag' => $tag, 'label' => (string) $e['label'], 'year' => is_numeric($e['year']) ? (int) $e['year'] : null, 'date' => $date, 'place' => $k, 'text' => mb_substr($txt, 0, 300)];
    }
    $n = $pdo->prepare("SELECT title, body FROM notes WHERE entity_type='person' AND entity_id=?"); $n->execute([$pid]);
    foreach ($n->fetchAll(PDO::FETCH_ASSOC) as $r) { $texts[] = mb_substr(trim((string) $r['title'] . ' ' . strip_tags((string) $r['body'])), 0, 4000); }
    try { $v = $pdo->prepare("SELECT first_name, last_name, type FROM name_variants WHERE person_id=?"); $v->execute([$pid]); foreach ($v->fetchAll(PDO::FETCH_ASSOC) as $r) { $texts[] = 'nom : ' . trim($r['first_name'] . ' ' . $r['last_name']) . ' (' . $r['type'] . ')'; } } catch (Throwable $_) {}
    // la famille proche : parents, conjoints, enfants (leurs années de naissance et de décès, pour 🕯️ le deuil et 👶 les nourrices)
    $fam = [];
    $rel = static function (string $sql, array $args, string $role) use ($pdo, &$fam, $pid) {
        $st = $pdo->prepare($sql); $st->execute($args);
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $id = (int) $id; if (!$id || $id === $pid) { continue; }
            $q = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, p.gender, p.is_private, p.living_status,
                (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS byear,
                (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS dyear,
                (SELECT e.sort_date FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS dd
                FROM persons p WHERE p.id=?");
            $q->execute([$id]); $r = $q->fetch(PDO::FETCH_ASSOC); if (!$r) { continue; }
            $hidden = (int) $r['is_private'] === 1 && kiosk_state()['on'];
            $fam[] = ['id' => $id, 'role' => $role, 'first' => $hidden ? '' : trim((string) $r['first_name']), 'gender' => (string) $r['gender'], 'by' => $r['byear'] !== null ? (int) $r['byear'] : null, 'dy' => $r['dyear'] !== null ? (int) $r['dyear'] : null,
                'dd' => preg_match('/^\d{4}-\d\d-\d\d/', (string) $r['dd']) ? substr((string) $r['dd'], 0, 10) : ''];
        }
    };
    $rel('SELECT f.partner1_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? UNION SELECT f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?', [$pid, $pid], 'parent');
    $rel('SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE partner1_id=? OR partner2_id=?', [$pid, $pid, $pid], 'spouse');
    $rel('SELECT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=? OR f.partner2_id=?', [$pid, $pid], 'child');
    $rel('SELECT fc2.child_id FROM family_children fc1 JOIN family_children fc2 ON fc2.family_id=fc1.family_id WHERE fc1.child_id=?', [$pid], 'sibling');
    $living = (string) ($p['living_status'] ?? '') === 'living';
    return ['ok' => true, 'id' => $pid, 'first' => trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'gender' => (string) ($p['gender'] ?? ''), 'kind' => (string) ($p['kind'] ?? 'human'),
        'living' => $living, 'private' => (int) ($p['is_private'] ?? 0) === 1, 'places' => (object) $places, 'events' => $events, 'jobs' => $jobs, 'texts' => $texts, 'family' => $fam];
}

/** GET l9b_place : le code INSEE et la position d'un lieu (fiche d'un village, monographie, 🧰 Données) */
function l9b_place(PDO $pdo, array $q): array
{
    $pid = safe_int($q['place_id'] ?? 0);
    $row = ['place_id' => $pid ?: null, 'name' => safe_text($q['name'] ?? ''), 'county' => safe_text($q['county'] ?? ''), 'country' => safe_text($q['country'] ?? ''),
        'insee' => (string) ($q['insee'] ?? ''), 'lat' => $q['lat'] ?? null, 'lon' => $q['lon'] ?? null];
    if ($pid) {
        $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
        $x = in_array('admin4_code', $pc, true) ? "COALESCE(admin4_code,'')" : "''";
        $s = $pdo->prepare("SELECT name, county, country, latitude, longitude, $x AS insee FROM places WHERE id=?"); $s->execute([$pid]);
        if ($r = $s->fetch(PDO::FETCH_ASSOC)) {
            foreach (['name', 'county', 'country', 'insee'] as $k) { if (trim((string) $row[$k]) === '') { $row[$k] = (string) $r[$k]; } }
            if (!is_numeric($row['lat'])) { $row['lat'] = $r['latitude']; $row['lon'] = $r['longitude']; }
        }
    }
    if ($row['name'] === '' && $row['insee'] === '') { return ['ok' => true, 'place' => null]; }
    $pl = l9b_place_row(['place_id' => $pid ?: -1] + $row);
    if ($pl && $pl['insee'] === '' && preg_match('/^\d[\dAB]\d{3}$/', (string) $row['insee'])) { $pl['insee'] = (string) $row['insee']; $pl['dep'] = cc_dep_of_insee($pl['insee']); }
    if ($pl && $pl['insee'] !== '') { $c = cc_data('communes')['c'][$pl['insee']] ?? null; if ($c) { $pl['commune'] = (string) $c[0]; } $pl['dep_name'] = (string) (cc_departements()[$pl['dep']] ?? ''); }
    if ($pl) { $pl['id'] = max(0, $pid); }
    return ['ok' => true, 'place' => $pl];
}

/* ═════════════════════ 🎓 sa thèse ═════════════════════ */

function l9b_these_kind(array $jobs): string
{
    foreach ($jobs as $j) {
        $f = ' ' . l9b_fold((string) $j['text']) . ' ';
        foreach (L9B_THESE_JOBS as $k => $words) { foreach ($words as $w) { if (str_contains($f, ' ' . l9b_fold($w) . ' ') || str_contains($f, ' ' . l9b_fold($w) . 's ')) { return $k; } } }
    }
    return '';
}
/** les notices Sudoc (UNIMARC, SRU) → [{key, title, kind, discipline, city, year, author, dates, url}] */
function l9b_sudoc_parse(string $xml): array
{
    $out = [];
    foreach (array_slice(explode('<srw:record>', $xml), 1) as $rec) {
        $ppn = preg_match('#<controlfield tag="001">([0-9X]{8,10})</controlfield>#', $rec, $m) ? $m[1] : '';
        if ($ppn === '') { continue; }
        $f = [];
        if (preg_match_all('#<datafield tag="(\d{3})"[^>]*>(.*?)</datafield>#s', $rec, $mm, PREG_SET_ORDER)) {
            foreach ($mm as $d) {
                $subs = [];
                if (preg_match_all('#<subfield code="(.)">(.*?)</subfield>#s', $d[2], $ss, PREG_SET_ORDER)) { foreach ($ss as $s) { $subs[$s[1]][] = html_entity_decode(trim($s[2]), ENT_QUOTES | ENT_XML1, 'UTF-8'); } }
                $f[$d[1]][] = $subs;
            }
        }
        $t = $f['328'][0] ?? null; if (!$t || isset($t['z'])) { continue; } // « Reproduction de » : la notice d'origine suffit
        $a = $f['700'][0] ?? [];
        $out[] = ['key' => 'sudoc:' . $ppn, 'source' => 'Sudoc', 'title' => trim((string) ($f['200'][0]['a'][0] ?? '')), 'subtitle' => trim((string) ($f['200'][0]['e'][0] ?? '')),
            'kind' => trim((string) ($t['b'][0] ?? '')), 'discipline' => trim((string) ($t['c'][0] ?? '')), 'city' => trim((string) ($t['e'][0] ?? '')), 'year' => (int) ($t['d'][0] ?? 0),
            'last' => trim((string) ($a['a'][0] ?? '')), 'first' => trim((string) ($a['b'][0] ?? '')), 'dates' => trim((string) ($a['f'][0] ?? '')), 'url' => 'https://www.sudoc.fr/' . $ppn];
    }
    return $out;
}
/** theses.fr (API publique, thèses de doctorat soutenues depuis 1985) → même forme */
function l9b_thesesfr_parse(string $json): array
{
    $j = json_decode($json, true); $out = [];
    foreach ((array) ($j['theses'] ?? []) as $t) {
        $id = (string) ($t['id'] ?? ''); if (!preg_match('/^[A-Za-z0-9]{6,20}$/', $id)) { continue; }
        $au = $t['auteurs'][0] ?? [];
        $etab = $t['etabSoutenanceN'] ?? ($t['etablissements'][0]['nom'] ?? '');
        $out[] = ['key' => 'thesesfr:' . $id, 'source' => 'theses.fr', 'title' => trim((string) ($t['titrePrincipal'] ?? '')), 'subtitle' => '', 'kind' => i18n_t('Thèse de doctorat'),
            'discipline' => trim((string) ($t['discipline'] ?? '')), 'city' => trim((string) $etab), 'year' => (int) substr((string) ($t['dateSoutenance'] ?? ''), -4),
            'last' => trim((string) ($au['nom'] ?? '')), 'first' => trim((string) ($au['prenom'] ?? '')), 'dates' => '', 'url' => 'https://theses.fr/' . $id];
    }
    return $out;
}
function l9b_these_person(PDO $pdo, int $pid): array
{
    $P = l9b_person($pdo, ['id' => $pid]);
    $by = null; $dy = null;
    foreach ($P['events'] as $e) { if (in_array($e['kind'], ['birth', 'bapt'], true) && $e['year'] && $by === null) { $by = $e['year']; } if (in_array($e['kind'], ['death', 'burial'], true) && $e['year'] && $dy === null) { $dy = $e['year']; } }
    return $P + ['by' => $by, 'dy' => $dy, 'these_kind' => l9b_these_kind($P['jobs'])];
}
/** est-ce que la notice peut être la sienne ? (même nom, prénom compatible, âge plausible à la soutenance) */
function l9b_these_match(array $r, array $P): bool
{
    if (l9b_fold($r['last']) !== l9b_fold($P['last'])) { return false; }
    $f1 = l9b_fold($P['first']); $f2 = l9b_fold($r['first']);
    if ($f2 !== '' && $f1 !== '') {
        $a = explode(' ', $f1); $b = explode(' ', $f2);
        $ok = false;
        foreach ($b as $w) { foreach ($a as $v) { if ($w === $v || (strlen($w) === 1 && $w[0] === $v[0])) { $ok = true; } } }
        if (!$ok) { return false; }
    }
    if ($P['by'] && $r['year'] && ($r['year'] < $P['by'] + 19 || $r['year'] > $P['by'] + 60)) { return false; }
    if ($P['by'] && preg_match('/^(\d{4})/', $r['dates'], $m) && abs((int) $m[1] - $P['by']) > 2) { return false; }
    return true;
}
function l9b_these(PDO $pdo, array $q): array
{
    $pid = safe_int($q['id'] ?? 0);
    $P = l9b_these_person($pdo, $pid);
    if ($P['these_kind'] === '') { return ['ok' => true, 'kind' => '', 'items' => []]; }
    if ($P['living'] || $P['private'] || ($P['dy'] === null && (!$P['by'] || $P['by'] > (int) date('Y') - 110))) { return ['ok' => true, 'kind' => $P['these_kind'], 'items' => [], 'private' => true]; }
    if ($P['last'] === '') { return ['ok' => true, 'kind' => $P['these_kind'], 'items' => []]; }
    $key = 'these|' . l9b_fold($P['last']) . '|' . l9b_fold($P['first']);
    $c = l9b_cache_get($key, L9B_TTL['these']);
    $items = null; $err = ''; $fetched = $c['at'] ?? null;
    if ($c && !$c['stale'] && empty($q['fresh'])) { $items = $c['data']; }
    else {
        try {
            $first = explode(' ', trim($P['first']))[0] ?? '';
            $cql = 'aut=' . trim($P['last'] . ' ' . $first) . ' and tdo=y';
            $xml = l9b_http('sudoc', 'https://www.sudoc.abes.fr/cbs/sru/?' . http_build_query(['operation' => 'searchRetrieve', 'version' => '1.1', 'recordSchema' => 'unimarc', 'maximumRecords' => '30', 'query' => $cql]), 'application/xml');
            $items = l9b_sudoc_parse($xml);
            if (!$P['dy'] || $P['dy'] >= 1985 || ($P['by'] && $P['by'] >= 1950)) {
                try { $items = array_merge($items, l9b_thesesfr_parse(l9b_http('thesesfr', 'https://theses.fr/api/v1/theses/recherche/?' . http_build_query(['q' => trim($P['first'] . ' ' . $P['last']), 'debut' => 0, 'nombre' => 20])))); } catch (Throwable $_) {}
            }
            l9b_cache_put($key, $items); $fetched = time();
        } catch (Throwable $e) {
            $err = $e->getMessage();
            if ($c) { $items = $c['data']; }
        }
    }
    if ($items === null) { return ['ok' => false, 'kind' => $P['these_kind'], 'message' => $err, 'offline' => true]; }
    $marks = l9b_marks($pdo, $pid);
    $seen = []; $out = [];
    foreach ($items as $r) {
        if (!l9b_these_match($r, $P)) { continue; }
        $sig = l9b_fold($r['title']) . '|' . $r['year']; if (isset($seen[$sig])) { continue; } $seen[$sig] = true;
        $m = $marks[$r['key']] ?? null;
        $out[] = $r + ['verdict' => $m['verdict'] ?? '', 'batch' => $m['batch'] ?? ''];
    }
    usort($out, static fn($a, $b) => ($a['verdict'] === 'no') <=> ($b['verdict'] === 'no') ?: $a['year'] <=> $b['year']);
    return ['ok' => true, 'kind' => $P['these_kind'], 'items' => array_slice($out, 0, 6), 'fetched_at' => $fetched, 'cached' => $c !== null && $items === ($c['data'] ?? null), 'message' => $err];
}

/* ─────── ✓ C'est lui · ✗ Pas lui ─────── */

function l9b_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS l9b_marks (person_id INTEGER NOT NULL, rec_key TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT '', batch TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(person_id, rec_key))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS l9b_adds (batch TEXT PRIMARY KEY, person_id INTEGER NOT NULL, rec_key TEXT NOT NULL, ids TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', undone_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
}
function l9b_marks(PDO $pdo, int $pid): array
{
    try { l9b_schema($pdo); } catch (Throwable $_) { return []; }
    $s = $pdo->prepare('SELECT rec_key, verdict, batch FROM l9b_marks WHERE person_id=?'); $s->execute([$pid]);
    $out = []; foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(string) $r['rec_key']] = $r; }
    return $out;
}
function l9b_key_ok(string $key): bool { return (bool) preg_match('/^(sudoc:[0-9X]{8,10}|thesesfr:[A-Za-z0-9]{6,20})$/', $key); }
function l9b_these_add(PDO $pdo, array $d): array
{
    l9b_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException('Fiche introuvable.'); }
    assert_person_unlocked($pdo, $pid);
    $key = (string) ($d['key'] ?? ''); if (!l9b_key_ok($key)) { throw new LcndaBadInput('Notice inconnue.'); }
    // la notice est relue dans les réponses gardées : rien de ce que la page envoie n'est recopié
    $r = null;
    foreach ((l9b_these($pdo, ['id' => $pid])['items'] ?? []) as $x) { if ($x['key'] === $key) { $r = $x; } }
    if (!$r) { throw new RuntimeException(i18n_t('Cette thèse n’est plus dans les réponses : cherche à nouveau.')); }
    $P = l9b_these_person($pdo, $pid);
    $what = trim(($r['kind'] ?: i18n_t('Thèse')) . ($r['discipline'] !== '' ? ' (' . $r['discipline'] . ')' : '') . ($r['city'] !== '' ? ', ' . $r['city'] : '') . ($r['year'] ? ', ' . $r['year'] : ''));
    $text = implode("\n\n", array_filter([
        i18n_t('Trouvé avec « 🎓 Sa thèse » le {date}. À VÉRIFIER : est-ce bien {name} ?', ['date' => date('d/m/Y'), 'name' => trim($P['first'] . ' ' . mb_strtoupper($P['last']))]),
        '« ' . $r['title'] . ' »' . ($r['subtitle'] !== '' ? ' — ' . $r['subtitle'] : ''),
        i18n_t('Auteur dans la notice : {a}', ['a' => trim($r['first'] . ' ' . $r['last'] . ($r['dates'] !== '' ? ' (' . $r['dates'] . ')' : ''))]),
        $what,
        i18n_t('Notice : {url} ({src})', ['url' => $r['url'], 'src' => $r['source'] === 'Sudoc' ? 'Sudoc, ABES' : 'theses.fr, ABES']),
    ]));
    $ids = ['sources' => [], 'source_links' => [], 'events' => []];
    $batch = 'l9b-' . bin2hex(random_bytes(6));
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([mb_substr($what . ' — « ' . $r['title'] . ' »', 0, 240), trim($r['first'] . ' ' . $r['last']), $r['city'], $r['source'] === 'Sudoc' ? 'Sudoc (ABES)' : 'theses.fr (ABES)', $r['url'], $text]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $link->execute(['person', $pid, $sid, '', '', i18n_t('À vérifier (thèse)')]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        $type = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag='GRAD' AND scope='person' ORDER BY id LIMIT 1"); $type->execute(); $typeId = (int) $type->fetchColumn();
        if ($typeId) {
            $e = add_event($pdo, ['person_id' => $pid, 'event_type_id' => $typeId, 'date_text' => $r['year'] ? (string) $r['year'] : '', 'place_name' => preg_match('/^[\p{L} \'’-]{2,40}$/u', $r['city']) ? $r['city'] : '', 'country' => '',
                'description' => mb_substr($what . ' : « ' . $r['title'] . ' »', 0, 500), 'fact_confidence' => 'doubt', 'confidence_origin' => $r['source'],
                'research_note' => i18n_t('À vérifier : trouvé dans {s}, pas encore confronté à la thèse elle-même.', ['s' => $r['source']])]);
            $eid = (int) ($e['id'] ?? 0);
            if ($eid) { $ids['events'][] = $eid; $link->execute(['event', $eid, $sid, '', '', i18n_t('À vérifier (thèse)')]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        }
        $pdo->prepare('INSERT INTO l9b_adds(batch, person_id, rec_key, ids, summary) VALUES(?,?,?,?,?)')->execute([$batch, $pid, $key, json_encode($ids), $what]);
        $pdo->prepare("INSERT INTO l9b_marks(person_id, rec_key, verdict, batch) VALUES(?,?,'added',?) ON CONFLICT(person_id, rec_key) DO UPDATE SET verdict='added', batch=excluded.batch, created_at=CURRENT_TIMESTAMP")->execute([$pid, $key, $batch]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Thèse : source et diplôme ajoutés (à vérifier) — ' . $what); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['ok' => true, 'batch' => $batch, 'source_id' => $ids['sources'][0], 'event_ids' => $ids['events'], 'what' => $what];
}
function l9b_these_undo(PDO $pdo, array $d): array
{
    l9b_schema($pdo);
    $batch = mb_substr(safe_text($d['batch'] ?? ''), 0, 40);
    $s = $pdo->prepare("SELECT * FROM l9b_adds WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException(i18n_t('Cet ajout est déjà annulé, ou introuvable.')); }
    $pid = (int) $row['person_id']; $ids = json_decode((string) $row['ids'], true) ?: [];
    assert_person_unlocked($pdo, $pid);
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        foreach (array_map('intval', $ids['source_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['events'] ?? []) as $id) {
            foreach (['media_links', 'source_links', 'notes'] as $t) { try { $pdo->prepare("DELETE FROM $t WHERE entity_type='event' AND entity_id=?")->execute([$id]); } catch (Throwable $_) {} }
            $pdo->prepare('DELETE FROM events WHERE id=? AND person_id=?')->execute([$id, $pid]);
        }
        foreach (array_map('intval', $ids['sources'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$id]);
            if (!(int) $n->fetchColumn()) { $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$id]); }
        }
        $pdo->prepare("UPDATE l9b_adds SET undone_at=CURRENT_TIMESTAMP WHERE batch=?")->execute([$batch]);
        $pdo->prepare("DELETE FROM l9b_marks WHERE person_id=? AND rec_key=? AND batch=?")->execute([$pid, (string) $row['rec_key'], $batch]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Thèse : ajout annulé — ' . (string) $row['summary']); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['ok' => true, 'person_id' => $pid];
}
function l9b_these_mark(PDO $pdo, array $d): array
{
    l9b_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException('Fiche introuvable.'); }
    $key = (string) ($d['key'] ?? ''); if (!l9b_key_ok($key)) { throw new LcndaBadInput('Notice inconnue.'); }
    $prev = l9b_marks($pdo, $pid)[$key] ?? null;
    if ($prev && $prev['verdict'] === 'added') { throw new RuntimeException(i18n_t('Cette thèse est déjà ajoutée à sa fiche : annule l’ajout d’abord.')); }
    $v = (string) ($d['verdict'] ?? '');
    if ($v === 'no') { $pdo->prepare("INSERT INTO l9b_marks(person_id, rec_key, verdict) VALUES(?,?,'no') ON CONFLICT(person_id, rec_key) DO UPDATE SET verdict='no', created_at=CURRENT_TIMESTAMP")->execute([$pid, $key]); }
    elseif ($v === '') { $pdo->prepare('DELETE FROM l9b_marks WHERE person_id=? AND rec_key=?')->execute([$pid, $key]); }
    else { throw new LcndaBadInput('Choix inconnu.'); }
    return ['ok' => true, 'prev' => $prev ? $prev['verdict'] : ''];
}

/* ═════════════════════ 🌐 le nom de la commune dans toutes les langues ═════════════════════ */

function l9b_langues(PDO $pdo, array $q): array
{
    $qid = preg_match('/^Q\d{1,12}$/', (string) ($q['qid'] ?? '')) ? (string) $q['qid'] : '';
    $insee = preg_match('/^\d[\dAB]\d{3}$/', (string) ($q['insee'] ?? '')) ? (string) $q['insee'] : '';
    if ($qid === '' && $insee === '') { return ['ok' => true, 'labels' => []]; }
    $key = 'langues|' . ($qid ?: $insee);
    $c = l9b_cache_get($key, L9B_TTL['langues']);
    if ($c && !$c['stale'] && empty($q['fresh'])) { return ['ok' => true, 'cached' => true, 'fetched_at' => $c['at']] + $c['data']; }
    try {
        if ($qid === '') {
            $j = json_decode(l9b_http('wd_search', 'https://www.wikidata.org/w/api.php?' . http_build_query(['action' => 'query', 'list' => 'search', 'srsearch' => 'haswbstatement:P374=' . $insee, 'srlimit' => 3, 'format' => 'json'])), true);
            $qid = (string) ($j['query']['search'][0]['title'] ?? '');
            if (!preg_match('/^Q\d+$/', $qid)) { $data = ['qid' => '', 'labels' => []]; l9b_cache_put($key, $data); return ['ok' => true] + $data; }
        }
        $j = json_decode(l9b_http('wd_labels', 'https://www.wikidata.org/w/api.php?' . http_build_query(['action' => 'wbgetentities', 'ids' => $qid, 'props' => 'labels|sitelinks', 'format' => 'json'])), true);
        $ent = $j['entities'][$qid] ?? null;
        if (!is_array($ent)) { throw new RuntimeException(i18n_t('Réponse illisible du site.')); }
        $labels = [];
        foreach ((array) ($ent['labels'] ?? []) as $lang => $l) { if (is_string($l['value'] ?? null) && preg_match('/^[a-z]{2,3}(-[a-z0-9-]+)?$/i', (string) $lang)) { $labels[(string) $lang] = mb_substr((string) $l['value'], 0, 120); } }
        $wiki = [];
        foreach ((array) ($ent['sitelinks'] ?? []) as $site => $s) { if (preg_match('/^([a-z_]{2,12})wiki$/', (string) $site, $m) && $m[1] !== 'commons' && $m[1] !== 'species') { $wiki[str_replace('_', '-', $m[1])] = (string) ($s['title'] ?? ''); } }
        $data = ['qid' => $qid, 'labels' => $labels, 'wiki' => $wiki];
        l9b_cache_put($key, $data);
        return ['ok' => true, 'fetched_at' => time()] + $data;
    } catch (Throwable $e) {
        if ($c) { return ['ok' => true, 'cached' => true, 'offline' => true, 'fetched_at' => $c['at']] + $c['data']; }
        return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()];
    }
}

/* ═════════════════════ réglages ═════════════════════ */

function l9b_cache_info(): array
{
    $n = 0; $b = 0; foreach (glob(l9b_cache_dir() . '/*.json') ?: [] as $f) { $n++; $b += (int) filesize($f); }
    return ['count' => $n, 'bytes' => $b];
}
function l9b_cache_clear(): array
{
    $dir = l9b_cache_dir(true); $trash = $dir . '/.trash';
    foreach (glob($trash . '/*/*.json') ?: [] as $f) { @unlink($f); }
    foreach (glob($trash . '/*', GLOB_ONLYDIR) ?: [] as $d) { @rmdir($d); }
    $token = bin2hex(random_bytes(6)); $to = $trash . '/' . $token; @mkdir($to, 0775, true);
    $n = 0; foreach (glob($dir . '/*.json') ?: [] as $f) { if (@rename($f, $to . '/' . basename($f))) { $n++; } }
    return ['ok' => true, 'removed' => $n, 'token' => $token];
}
function l9b_cache_restore(array $d): array
{
    $token = (string) ($d['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{12}$/', $token)) { throw new LcndaBadInput('Inconnu.'); }
    $dir = l9b_cache_dir(true); $from = $dir . '/.trash/' . $token; $n = 0;
    foreach (glob($from . '/*.json') ?: [] as $f) { if (@rename($f, $dir . '/' . basename($f))) { $n++; } }
    @rmdir($from);
    return ['ok' => true, 'restored' => $n];
}

function l9b_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'l9b_person' => l9b_person($pdo, $q),
        'l9b_place' => l9b_place($pdo, $q),
        'l9b_these' => l9b_these($pdo, $q),
        'l9b_langues' => l9b_langues($pdo, $q),
        'l9b_about' => ['ok' => true, 'cache' => l9b_cache_info()],
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function l9b_api_post(PDO $pdo, string $action, array $d): array
{
    return match ($action) {
        'l9b_these_add' => l9b_these_add($pdo, $d),
        'l9b_these_undo' => l9b_these_undo($pdo, $d),
        'l9b_these_mark' => l9b_these_mark($pdo, $d),
        'l9b_cache_clear' => l9b_cache_clear(),
        'l9b_cache_restore' => l9b_cache_restore($d),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
