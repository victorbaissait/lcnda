<?php
declare(strict_types=1);

/**
 * 🌍 Où chercher ? → 🇳🇱🇧🇪 Open Archives (openarchieven.nl / openarch.nl) : chercher une personne dans les actes indexés
 * (Pays-Bas, Belgique, une partie de l'Allemagne, Suriname, Indonésie…) SANS quitter la page, puis « ＋ Ajouter comme
 * source » ou « ＋ … et un événement à vérifier » (↶ Annuler). Jamais de fusion automatique : rien n'est écrit sans un clic.
 *
 * L'API (https://api.openarch.nl/1.1/, documentation https://www.openarch.nl/api/docs/) :
 *  - gratuite, sans clé pour records/search.json et records/show.json ;
 *  - règles (FAQ « Can I also use the data of Open Archives via an API », relevée le 24/11/2026) : « Do not make more than
 *    four requests per second and send a recognisable name of your program. Cite the archive as the source. » ;
 *  - licences des données : par jeu de données (le plus souvent CC0 1.0, parfois CC BY-SA 4.0 : llms.txt du site).
 * Ce que l'app fait pour les respecter : une requête seulement quand on clique « 🔎 Chercher » (aucune recherche en tâche de
 * fond, aucune liste parcourue), une réponse gardée 30 jours (table ouc_oa_cache : même question = aucune requête), au plus
 * 3 requêtes par seconde et 30 par minute, un nom de programme reconnaissable (User-Agent), et la source citée partout
 * (« Données : <archive> via Open Archives ») — y compris dans la source ajoutée à la fiche.
 *
 *  - ouc_oa_search()  GET ou_chercher_openarch&id=&y1=&y2=&type=&place=&start=&fresh=
 *  - ouc_oa_record()  GET ou_chercher_openarch_record&archive=&identifier=   (les personnes de l'acte, la référence, le scan)
 *  - ouc_oa_add()     POST ou_chercher_openarch_add {person_id, archive, identifier, pid, mode: source|event} → {batch}
 *  - ouc_oa_undo()    POST ou_chercher_openarch_undo {batch}
 *  - ouc_oa_mark()    POST ou_chercher_openarch_mark {person_id, key, verdict: no|''} (« ✗ Pas lui », ↶)
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_OPENARCH_DIR (search.json, show-<archive>-<identifier>.json) à la place du réseau.
 */

const OUC_OA_API = 'https://api.openarch.nl/1.1/';
const OUC_OA_TTL = 30 * 86400;
const OUC_OA_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const OUC_OA_TYPES = ['' => '', 'birth' => 'Geboorte', 'baptism' => 'Doop', 'marriage' => 'Huwelijk', 'death' => 'Overlijden', 'burial' => 'Begraven'];
/** les rôles où la personne cherchée est LE sujet de l'acte (un événement de sa vie), en néerlandais (A2A) et en français (API lang=fr) */
const OUC_OA_MAIN_ROLES = ['kind', 'dopeling', 'gedoopte', 'bruid', 'bruidegom', 'overledene', 'begravene', 'hoofdpersoon', 'geregistreerde', 'enfant', 'baptisé', 'baptise', 'mariée', 'mariee', 'marié', 'marie', 'défunt', 'defunt', 'personne principale', 'inscrit'];

function ouc_oa_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS ouc_oa_cache (qkey TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ouc_oa_marks (person_id INTEGER NOT NULL, rec_key TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT 'no', batch TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(person_id, rec_key))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ouc_oa_searches (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL, query TEXT NOT NULL, found INTEGER NOT NULL DEFAULT 0,
        searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ouc_oa_adds (batch TEXT PRIMARY KEY, person_id INTEGER NOT NULL, rec_key TEXT NOT NULL, ids TEXT NOT NULL DEFAULT '{}', summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, undone_at TEXT NOT NULL DEFAULT '')");
    $done = true;
}

/* ═════════════════════ le réseau : à la demande, lent exprès, mis de côté 30 jours ═════════════════════ */

/** attend son tour : au plus 3 requêtes par seconde, 30 par minute (fichier verrouillé, partagé par les fenêtres de l'app) */
function ouc_oa_throttle(): void
{
    $f = rtrim((string) (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir()), '/') . '/openarch-throttle.json';
    $h = @fopen($f, 'c+'); if (!$h) { return; }
    try {
        flock($h, LOCK_EX);
        $st = json_decode((string) stream_get_contents($h), true); $st = is_array($st) ? $st : [];
        $now = microtime(true);
        $recent = array_values(array_filter(array_map('floatval', $st['t'] ?? []), static fn($t) => $t > $now - 60));
        if (count($recent) >= 30) { throw new RuntimeException(i18n_t('Beaucoup de recherches dans Open Archives en une minute : attends un peu, puis réessaie (le site demande de ne pas aller trop vite).')); }
        $last = $recent ? max($recent) : 0.0;
        if ($now - $last < 0.34) { usleep((int) ((0.34 - ($now - $last)) * 1e6)); $now = microtime(true); }
        $recent[] = $now;
        ftruncate($h, 0); rewind($h); fwrite($h, json_encode(['t' => $recent]));
    } finally { flock($h, LOCK_UN); fclose($h); }
}

/** GET d'une méthode de l'API (JSON décodé) ; le dossier des essais remplace le réseau */
function ouc_oa_fetch(string $method, array $q): array
{
    $dir = (string) getenv('LCNDA_TEST_OPENARCH_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $name = $method === 'records/show.json' ? 'show-' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($q['archive'] ?? '')) . '-' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($q['identifier'] ?? '')) . '.json' : 'search.json';
        $log = $dir . '/calls.log'; @file_put_contents($log, $method . '?' . http_build_query($q) . "\n", FILE_APPEND);
        $f = $dir . '/' . $name;
        if (!is_file($f)) { throw new RuntimeException(i18n_t('Open Archives ne répond pas pour le moment.')); }
        $j = json_decode((string) file_get_contents($f), true);
        return is_array($j) ? $j : [];
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    ouc_oa_throttle();
    $url = OUC_OA_API . $method . '?' . http_build_query($q);
    $body = ''; $too = false; $max = 4 * 1024 * 1024;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => OUC_OA_UA, CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }]
        + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse d’Open Archives.')); }
    if ($code === 429) { throw new RuntimeException(i18n_t('Open Archives demande d’aller moins vite : réessaie dans quelques secondes.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion à Open Archives : {err}', ['err' => $err]) : i18n_t('Open Archives répond {code}.', ['code' => (string) $code])); }
    $j = json_decode($body, true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible d’Open Archives.')); }
    if (!empty($j['error_description'])) { throw new RuntimeException(i18n_t('Open Archives : {err}', ['err' => mb_substr((string) $j['error_description'], 0, 200)])); }
    return $j;
}

/** la même question déjà posée il y a moins de 30 jours : la réponse gardée ; sinon le réseau (et on la garde) */
function ouc_oa_cached(PDO $pdo, string $method, array $q, bool $fresh = false): array
{
    ouc_oa_schema($pdo);
    ksort($q);
    $key = $method . '?' . http_build_query($q);
    if (!$fresh) {
        $s = $pdo->prepare('SELECT body, fetched_at FROM ouc_oa_cache WHERE qkey=?'); $s->execute([$key]); $r = $s->fetch(PDO::FETCH_ASSOC);
        if ($r && (int) $r['fetched_at'] > time() - OUC_OA_TTL) { $j = json_decode((string) $r['body'], true); if (is_array($j)) { return [$j, true, (int) $r['fetched_at']]; } }
    }
    $j = ouc_oa_fetch($method, $q);
    $pdo->prepare('INSERT INTO ouc_oa_cache(qkey, body, fetched_at) VALUES(?,?,?) ON CONFLICT(qkey) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at')
        ->execute([$key, json_encode($j, JSON_UNESCAPED_UNICODE), time()]);
    // le cache ne grossit pas sans fin : les réponses de plus de 30 jours partent
    if (random_int(1, 20) === 1) { $pdo->prepare('DELETE FROM ouc_oa_cache WHERE fetched_at < ?')->execute([time() - OUC_OA_TTL]); }
    return [$j, false, time()];
}

/* ═════════════════════ la personne → la question ═════════════════════ */

/** prénom usuel, nom, années de vie, lieux : ce qu'on envoie (le moins possible : un nom et une période) */
function ouc_oa_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender, living_status, is_private FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $ev = $pdo->prepare("SELECT e.year, COALESCE(t.gedcom_tag,'') AS tag, COALESCE(pl.name,'') AS place FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year, 9999)");
    $ev->execute([$pid, $pid, $pid]);
    $by = null; $dy = null; $years = []; $places = [];
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $y = $e['year'] !== null ? (int) $e['year'] : null;
        if ($y) { $years[] = $y; }
        if ($by === null && $y && in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true)) { $by = $y; }
        if ($dy === null && $y && in_array($e['tag'], ['DEAT', 'BURI', 'CREM'], true)) { $dy = $y; }
        $town = trim(explode(',', (string) $e['place'])[0]);
        if ($town !== '' && !in_array($town, $places, true)) { $places[] = $town; }
    }
    $estimated = false;
    if ($by === null && $years) { $by = min($years) - 25; $estimated = true; }
    $first = trim(preg_split('/[\s,]+/', trim((string) $p['first_name']))[0] ?? '');
    // les proches qu'on peut chercher dans le même acte (« Jan Jansen & Maria Pieters ») : conjoint, père, mère
    $kin = [];
    $nm = static function (?int $id) use ($pdo): string { if (!$id) { return ''; } $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
        return $r ? trim(trim(preg_split('/[\s,]+/', trim((string) $r['first_name']))[0] ?? '') . ' ' . trim((string) $r['last_name'])) : ''; };
    $f = $pdo->prepare('SELECT partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id LIMIT 1'); $f->execute([$pid, $pid]);
    if ($fr = $f->fetch(PDO::FETCH_ASSOC)) { $sp = (int) $fr['partner1_id'] === $pid ? (int) $fr['partner2_id'] : (int) $fr['partner1_id']; if (($n = $nm($sp)) !== '') { $kin['spouse'] = $n; } }
    [$fa, $mo] = function_exists('ouc_parents') ? ouc_parents($pdo, $pid) : [null, null];
    if (($n = $nm($fa ? (int) $fa : null)) !== '') { $kin['father'] = $n; }
    if (($n = $nm($mo ? (int) $mo : null)) !== '') { $kin['mother'] = $n; }
    return ['id' => $pid, 'kin' => $kin, 'first' => $first, 'first_full' => trim((string) $p['first_name']), 'last' => trim((string) $p['last_name']), 'gender' => (string) $p['gender'],
        'living' => (string) $p['living_status'], 'private' => (int) ($p['is_private'] ?? 0) === 1, 'birth_year' => $by, 'death_year' => $dy, 'estimated' => $estimated, 'places' => array_slice($places, 0, 12)];
}

/** GET ou_chercher_openarch : chercher la personne (nom + période, et au choix le type d'acte et un lieu) */
function ouc_oa_search(PDO $pdo, array $g): array
{
    ouc_oa_schema($pdo);
    $pid = safe_int($g['id'] ?? 0);
    $p = ouc_oa_person($pdo, $pid);
    if ($p['living'] === 'living') { throw new RuntimeException(i18n_t('Personne vivante : rien n’est envoyé à un site extérieur.')); }
    if ($p['private']) { throw new RuntimeException(i18n_t('Fiche confidentielle : rien n’est envoyé à un site extérieur.')); }
    $last = trim(safe_text($g['last'] ?? '')) ?: $p['last'];
    $first = array_key_exists('first', $g) ? trim(safe_text($g['first'])) : $p['first'];
    if ($last === '') { throw new RuntimeException(i18n_t('Il faut au moins un nom de famille pour chercher.')); }
    $y1 = safe_int($g['y1'] ?? 0); $y2 = safe_int($g['y2'] ?? 0);
    if (!$y1 && $p['birth_year']) { $y1 = $p['birth_year'] - 5; }
    if (!$y2 && $p['birth_year']) { $y2 = ($p['death_year'] ?: $p['birth_year'] + 90) + 5; }
    $y1 = $y1 ? max(1400, min(2030, $y1)) : 0; $y2 = $y2 ? max(1400, min(2030, $y2)) : 0;
    if ($y1 && $y2 && $y2 < $y1) { [$y1, $y2] = [$y2, $y1]; }
    // la façon de chercher le nom (les « astuces » du site) : exact (« "Jan Jansen" »), sons voisins (« Jan ~Jansen »), ou large
    $clean = static fn(string $x) => trim(preg_replace('/\s+/u', ' ', preg_replace('/[&"*?~$%>()\-]+/u', ' ', $x) ?? '') ?? '');
    $first = $clean($first); $last = $clean($last);
    $how = in_array((string) ($g['how'] ?? ''), ['exact', 'sound', 'wide'], true) ? (string) $g['how'] : 'exact';
    $name = $how === 'sound' ? trim($first . ' ~' . str_replace(' ', ' ~', $last)) : ($how === 'exact' ? ($first !== '' ? '"' . $first . ' ' . $last . '"' : '>' . str_replace(' ', ' >', $last)) : trim($first . ' ' . $last));
    $with = (string) ($g['with'] ?? '');
    $other = isset($p['kin'][$with]) ? $clean($p['kin'][$with]) : '';
    if ($other !== '') { $name .= ' & "' . $other . '"'; } else { $with = ''; }
    $q = ['name' => trim($name . ($y1 && $y2 ? " $y1-$y2" : ($y1 ? " $y1" : ''))), 'lang' => 'fr', 'number_show' => 100, 'sort' => 4];
    $type = (string) ($g['type'] ?? '');
    if (isset(OUC_OA_TYPES[$type]) && OUC_OA_TYPES[$type] !== '') { $q['eventtype'] = OUC_OA_TYPES[$type]; }
    $place = mb_substr(trim(safe_text($g['place'] ?? '')), 0, 80);
    if ($place !== '') { $q['eventplace'] = $place; }
    $start = max(0, min(900, safe_int($g['start'] ?? 0)));
    if ($start) { $q['start'] = $start; }
    [$j, $cached, $at] = ouc_oa_cached($pdo, 'records/search.json', $q, !empty($g['fresh']));
    $docs = is_array($j['response']['docs'] ?? null) ? $j['response']['docs'] : [];
    $rows = [];
    foreach ($docs as $d) { if (is_array($d) && ($r = ouc_oa_row($d))) { $rows[] = $r; } }
    $found = (int) ($j['response']['number_found'] ?? count($rows));
    $said = $q['name'] . (isset($q['eventtype']) ? ' · ' . i18n_t(['birth' => 'naissances', 'baptism' => 'baptêmes', 'marriage' => 'mariages', 'death' => 'décès', 'burial' => 'inhumations'][$type] ?? $type) : '') . ($place !== '' ? ' · ' . $place : '') . ($start ? ' · +' . $start : '');
    $pdo->prepare('DELETE FROM ouc_oa_searches WHERE person_id=? AND query=?')->execute([$pid, $said]); // la même recherche refaite : une seule ligne, à la date du jour
    $pdo->prepare('INSERT INTO ouc_oa_searches(person_id, query, found) VALUES(?,?,?)')->execute([$pid, $said, $found]);
    return ['person' => $p, 'query' => ['first' => $first, 'last' => $last, 'y1' => $y1, 'y2' => $y2, 'type' => $type, 'place' => $place, 'start' => $start, 'how' => $how, 'with' => $with, 'sent' => $q['name']],
        'found' => $found, 'rows' => $rows, 'cached' => $cached, 'fetched_at' => date('Y-m-d H:i', $at),
        'marks' => ouc_oa_marks($pdo, $pid), 'history' => ouc_oa_history($pdo, $pid),
        'search_url' => 'https://www.openarchieven.nl/search.php?lang=fr&name=' . rawurlencode($q['name']) . ($place !== '' ? '&eventplace=' . rawurlencode($place) : ''),
        'attribution' => i18n_t('Données : les archives citées sur chaque acte, via Open Archives (openarchieven.nl) — données ouvertes, le plus souvent CC0 1.0, parfois CC BY-SA 4.0.')];
}

/** une ligne de résultat, nettoyée (tout ce qui vient du site est du texte, l'adresse est refaite) */
function ouc_oa_row(array $d): ?array
{
    $arch = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d['archive_code'] ?? '')) ?? '';
    $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($d['identifier'] ?? '')) ?? '';
    if ($arch === '' || $id === '') { return null; }
    $t = static fn($v) => mb_substr(trim(html_entity_decode(strip_tags(is_array($v) ? implode(', ', array_map('strval', array_filter($v, 'is_scalar'))) : (string) $v), ENT_QUOTES | ENT_HTML5, 'UTF-8')), 0, 200);
    $dt = is_array($d['eventdate'] ?? null) ? $d['eventdate'] : [];
    return ['key' => $arch . ':' . $id, 'archive_code' => $arch, 'identifier' => $id, 'pid' => $t($d['pid'] ?? ''),
        'name' => trim(preg_replace('/^#+\s*/', '', $t($d['personname'] ?? '')) ?? ''), 'role' => $t($d['relationtype'] ?? ''), 'role_nl' => $t($d['_relationtype'] ?? ''),
        'type' => $t($d['eventtype'] ?? ''), 'type_nl' => $t($d['_eventtype'] ?? ''), 'year' => (int) ($dt['year'] ?? 0), 'month' => (int) ($dt['month'] ?? 0), 'day' => (int) ($dt['day'] ?? 0),
        'place' => $t($d['eventplace'] ?? ''), 'source' => $t($d['sourcetype'] ?? ''), 'archive' => $t($d['archive'] ?? ($d['archive_org'] ?? $arch)),
        'url' => 'https://www.openarchieven.nl/' . rawurlencode($arch) . ':' . rawurlencode($id) . '/fr'];
}

/** ce qu'on a déjà décidé pour cette personne : « ✗ pas lui », « ✓ ajouté » */
function ouc_oa_marks(PDO $pdo, int $pid): array
{
    ouc_oa_schema($pdo);
    $s = $pdo->prepare('SELECT rec_key, verdict, batch, created_at FROM ouc_oa_marks WHERE person_id=?'); $s->execute([$pid]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(string) $r['rec_key']] = ['verdict' => (string) $r['verdict'], 'batch' => (string) $r['batch'], 'date' => (string) $r['created_at']]; }
    return $out;
}

/** les recherches déjà faites pour elle (✓ déjà cherché) : les 8 dernières */
function ouc_oa_history(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT query, found, searched_at FROM ouc_oa_searches WHERE person_id=? ORDER BY id DESC LIMIT 8'); $s->execute([$pid]);
    return array_map(static fn($r) => ['query' => (string) $r['query'], 'found' => (int) $r['found'], 'date' => (string) $r['searched_at']], $s->fetchAll(PDO::FETCH_ASSOC));
}

/* ═════════════════════ un acte : ses personnes ═════════════════════ */

const OUC_OA_ROLE_FR = ['kind' => 'Enfant', 'dopeling' => 'Baptisé(e)', 'gedoopte' => 'Baptisé(e)', 'vader' => 'Père', 'moeder' => 'Mère', 'bruid' => 'Mariée', 'bruidegom' => 'Marié',
    'vader van de bruid' => 'Père de la mariée', 'moeder van de bruid' => 'Mère de la mariée', 'vader van de bruidegom' => 'Père du marié', 'moeder van de bruidegom' => 'Mère du marié',
    'overledene' => 'Défunt(e)', 'begravene' => 'Inhumé(e)', 'getuige' => 'Témoin', 'aangever' => 'Déclarant', 'hoofdpersoon' => 'Personne principale', 'geregistreerde' => 'Inscrit(e)',
    'echtgenoot' => 'Époux', 'echtgenote' => 'Épouse', 'partner' => 'Conjoint(e)', 'vermeld' => 'Cité(e)', 'peter' => 'Parrain', 'meter' => 'Marraine', 'doopgetuige' => 'Parrain ou marraine',
    'eerdere echtgenote' => 'Épouse précédente', 'eerdere echtgenoot' => 'Époux précédent', 'eerdere echtgenote van de bruidegom' => 'Épouse précédente du marié', 'eerdere echtgenoot van de bruid' => 'Époux précédent de la mariée'];
const OUC_OA_EVENT_FR = ['geboorte' => 'Naissance', 'doop' => 'Baptême', 'huwelijk' => 'Mariage', 'ondertrouw' => 'Publication de mariage', 'overlijden' => 'Décès', 'begraven' => 'Inhumation',
    'begrafenis' => 'Inhumation', 'registratie' => 'Inscription', 'inschrijving' => 'Inscription', 'echtscheiding' => 'Divorce', 'militie' => 'Milice', 'bevolkingsregister' => 'Registre de la population'];
/** l'événement GEDCOM d'un type d'acte (néerlandais ou français) */
function ouc_oa_tag(string $type): string
{
    $f = mb_strtolower(trim($type));
    $map = ['geboorte' => 'BIRT', 'naissance' => 'BIRT', 'birth' => 'BIRT', 'doop' => 'BAPM', 'baptême' => 'BAPM', 'bapteme' => 'BAPM', 'baptism' => 'BAPM',
        'huwelijk' => 'MARR', 'mariage' => 'MARR', 'marriage' => 'MARR', 'overlijden' => 'DEAT', 'décès' => 'DEAT', 'deces' => 'DEAT', 'death' => 'DEAT',
        'begraven' => 'BURI', 'begrafenis' => 'BURI', 'inhumation' => 'BURI', 'burial' => 'BURI', 'registratie' => 'RESI', 'inschrijving' => 'RESI', 'inscription' => 'RESI'];
    return $map[$f] ?? '';
}
/** une date A2A {Year, Month, Day} → « 4 septembre 1781 » */
function ouc_oa_date(mixed $d): array
{
    if (!is_array($d)) { return ['text' => '', 'year' => 0]; }
    $y = (int) ($d['Year'] ?? $d['year'] ?? 0); $m = (int) ($d['Month'] ?? $d['month'] ?? 0); $day = (int) ($d['Day'] ?? $d['day'] ?? 0);
    $mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return ['text' => $y ? trim(($day ? $day . ' ' : '') . ($m >= 1 && $m <= 12 ? $mois[$m - 1] . ' ' : '') . $y) : '', 'year' => $y];
}
/** une liste A2A peut être un objet seul */
function ouc_oa_list(mixed $v): array { return is_array($v) ? (array_is_list($v) ? $v : [$v]) : []; }

/** GET ou_chercher_openarch_record : l'acte, lu et rangé (gardé 30 jours lui aussi) */
function ouc_oa_record(PDO $pdo, array $g): array
{
    $arch = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($g['archive'] ?? '')) ?? '';
    $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($g['identifier'] ?? '')) ?? '';
    if ($arch === '' || $id === '') { throw new LcndaBadInput('Acte inconnu.'); }
    [$j] = ouc_oa_cached($pdo, 'records/show.json', ['archive' => $arch, 'identifier' => $id, 'lang' => 'fr']);
    return ouc_oa_parse_record($j, $arch, $id);
}

function ouc_oa_parse_record(array $j, string $arch, string $id): array
{
    $t = static fn($v) => mb_substr(trim(html_entity_decode(strip_tags(is_scalar($v) ? (string) $v : ''), ENT_QUOTES | ENT_HTML5, 'UTF-8')), 0, 300);
    $roles = [];
    foreach (ouc_oa_list($j['RelationEP'] ?? null) as $r) { if (is_array($r)) { $roles[(string) ($r['PersonKeyRef'] ?? '')] = $t($r['RelationType'] ?? ''); } }
    $persons = [];
    foreach (ouc_oa_list($j['Person'] ?? null) as $p) {
        if (!is_array($p)) { continue; }
        $pid = $t($p['@pid'] ?? '');
        $n = is_array($p['PersonName'] ?? null) ? $p['PersonName'] : [];
        $name = trim(implode(' ', array_filter([$t($n['PersonNameFirstName'] ?? ''), $t($n['PersonNamePatronym'] ?? ''), $t($n['PersonNamePrefixLastName'] ?? ''), $t($n['PersonNameLastName'] ?? '')])));
        if ($name === '') { $name = $t($n['PersonNameLiteral'] ?? ''); }
        $role = $roles[$pid] ?? '';
        $b = ouc_oa_date($p['BirthDate'] ?? null);
        $age = is_array($p['Age'] ?? null) ? (int) ($p['Age']['PersonAgeLiteral'] ?? $p['Age']['PersonAgeYears'] ?? 0) : 0;
        $persons[] = ['pid' => $pid, 'name' => $name, 'first' => $t($n['PersonNameFirstName'] ?? ''), 'last' => trim($t($n['PersonNamePrefixLastName'] ?? '') . ' ' . $t($n['PersonNameLastName'] ?? '')),
            'role' => OUC_OA_ROLE_FR[mb_strtolower($role)] ?? $role, 'role_raw' => $role, 'main' => in_array(mb_strtolower($role), OUC_OA_MAIN_ROLES, true),
            'birth' => $b['text'], 'birth_place' => $t(is_array($p['BirthPlace'] ?? null) ? ($p['BirthPlace']['Place'] ?? '') : ''), 'age' => $age ?: null,
            'profession' => $t(is_array($p['Profession'] ?? null) ? implode(', ', array_filter($p['Profession'], 'is_scalar')) : ($p['Profession'] ?? '')),
            'residence' => $t(is_array($p['Residence'] ?? null) ? ($p['Residence']['Place'] ?? '') : '')];
    }
    $ev = ouc_oa_list($j['Event'] ?? null)[0] ?? [];
    $ev = is_array($ev) ? $ev : [];
    $etype = $t($ev['EventType'] ?? '');
    $edate = ouc_oa_date($ev['EventDate'] ?? null);
    $eplace = $t(is_array($ev['EventPlace'] ?? null) ? ($ev['EventPlace']['Place'] ?? '') : '');
    $src = is_array($j['Source'] ?? null) ? $j['Source'] : [];
    $ref = is_array($src['SourceReference'] ?? null) ? $src['SourceReference'] : [];
    if ($eplace === '') { $eplace = $t(is_array($src['SourcePlace'] ?? null) ? ($src['SourcePlace']['Place'] ?? '') : ''); }
    if (!$edate['year']) { $edate = ouc_oa_date($src['SourceDate'] ?? null); }
    $scan = '';
    foreach (ouc_oa_list(is_array($src['SourceAvailableScans'] ?? null) ? ($src['SourceAvailableScans']['Scan'] ?? null) : null) as $s) { if (is_array($s)) { $u = (string) ($s['UriViewer'] ?? $s['Uri'] ?? ''); if (preg_match('#^https?://#i', $u)) { $scan = mb_substr($u, 0, 500); break; } } }
    $refText = implode(', ', array_filter([$t($ref['InstitutionName'] ?? ''), $t($ref['Archive'] ?? '') !== '' ? 'archive ' . $t($ref['Archive']) : '', $t($ref['Collection'] ?? ''), $t($ref['Book'] ?? ''),
        $t($ref['Folio'] ?? '') !== '' ? 'folio ' . $t($ref['Folio']) : '', $t($ref['RegistryNumber'] ?? '') !== '' ? 'n° ' . $t($ref['RegistryNumber']) : '', $t($ref['DocumentNumber'] ?? '') !== '' ? 'acte ' . $t($ref['DocumentNumber']) : '']));
    return ['key' => "$arch:$id", 'archive_code' => $arch, 'identifier' => $id, 'url' => 'https://www.openarchieven.nl/' . rawurlencode($arch) . ':' . rawurlencode($id) . '/fr',
        'event' => ['type' => OUC_OA_EVENT_FR[mb_strtolower($etype)] ?? $etype, 'type_raw' => $etype, 'tag' => ouc_oa_tag($etype), 'date' => $edate['text'], 'year' => $edate['year'], 'place' => $eplace],
        'source' => ['type' => $t($src['SourceType'] ?? ''), 'institution' => $t($ref['InstitutionName'] ?? ''), 'reference' => $refText, 'scan' => $scan], 'persons' => $persons];
}

/* ═════════════════════ ＋ Ajouter comme source / événement à vérifier ; ✗ Pas lui ═════════════════════ */

/** POST ou_chercher_openarch_add : une source (lien, référence, personnes de l'acte), et au choix un événement « à vérifier » */
function ouc_oa_add(PDO $pdo, array $d): array
{
    ouc_oa_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException('Fiche introuvable.'); }
    assert_person_unlocked($pdo, $pid);
    $mode = (string) ($d['mode'] ?? 'source') === 'event' ? 'event' : 'source';
    $rec = ouc_oa_record($pdo, ['archive' => $d['archive'] ?? '', 'identifier' => $d['identifier'] ?? '']); // relu ici : rien de ce que la page envoie n'est recopié
    $who = null; $rpid = mb_substr(safe_text($d['pid'] ?? ''), 0, 80);
    foreach ($rec['persons'] as $p) { if ($rpid !== '' && preg_replace('/\D/', '', $p['pid']) === preg_replace('/\D/', '', $rpid)) { $who = $p; break; } }
    $P = ouc_oa_person($pdo, $pid);
    $name = trim($P['first_full'] . ' ' . mb_strtoupper($P['last']));
    $ev = $rec['event'];
    $what = trim(($ev['type'] ?: 'Acte') . ($who ? ' — ' . $who['name'] . ($who['role'] ? ' (' . $who['role'] . ')' : '') : '') . ($ev['date'] ? ', ' . $ev['date'] : '') . ($ev['place'] ? ', ' . $ev['place'] : ''));
    $archive = $rec['source']['institution'] ?: $rec['archive_code'];
    $lines = [i18n_t('Trouvé dans Open Archives avec « 🌍 Où chercher ? » le {date}. À VÉRIFIER : est-ce bien {name} ?', ['date' => date('d/m/Y'), 'name' => $name])];
    if ($rec['source']['reference'] !== '') { $lines[] = i18n_t('Référence : {ref}', ['ref' => $rec['source']['reference']]); }
    if ($rec['persons']) { $lines[] = i18n_t('Personnes de l’acte :') . "\n" . implode("\n", array_map(static fn($p) => '- ' . $p['name'] . ($p['role'] ? ' — ' . $p['role'] : '') . ($p['birth'] ? ', ' . i18n_t('né(e) {d}', ['d' => $p['birth']]) : '') . ($p['age'] ? ', ' . $p['age'] . ' ans' : '') . ($p['profession'] ? ', ' . $p['profession'] : ''), array_slice($rec['persons'], 0, 30))); }
    if ($rec['source']['scan'] !== '') { $lines[] = i18n_t('Image de l’acte : {url}', ['url' => $rec['source']['scan']]); }
    $lines[] = i18n_t('Données : {archive}, via Open Archives (openarchieven.nl).', ['archive' => $archive]);
    $ids = ['sources' => [], 'source_links' => [], 'events' => []];
    $notes = [];
    $batch = 'oa-' . bin2hex(random_bytes(6));
    $own = !$pdo->inTransaction(); // api.php ouvre déjà une transaction pour chaque écriture
    if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([mb_substr('Open Archives — ' . $what, 0, 240), '', mb_substr($archive, 0, 200), 'Open Archives (openarchieven.nl)', $rec['url'], implode("\n\n", $lines)]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $link->execute(['person', $pid, $sid, mb_substr($rec['source']['reference'], 0, 120), '', i18n_t('À vérifier (Open Archives)')]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        if ($mode === 'event') {
            $tag = $ev['tag'];
            if (!$who || !$who['main']) { $notes[] = i18n_t('la personne n’est pas le sujet de cet acte : seule la source est ajoutée'); }
            elseif ($tag === '' || $tag === 'MARR') { $notes[] = $tag === 'MARR' ? i18n_t('un mariage se range dans son union : seule la source est ajoutée') : i18n_t('type d’acte inconnu : seule la source est ajoutée'); }
            else {
                $has = $pdo->prepare('SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag=?'); $has->execute([$pid, $tag]);
                if ($tag !== 'RESI' && (int) $has->fetchColumn()) { $notes[] = i18n_t('sa fiche a déjà cet événement : gardé tel quel, seule la source est ajoutée'); }
                else {
                    $type = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? AND scope='person' ORDER BY id LIMIT 1"); $type->execute([$tag]); $typeId = (int) $type->fetchColumn();
                    if ($typeId) {
                        $e = add_event($pdo, ['person_id' => $pid, 'event_type_id' => $typeId, 'date_text' => $ev['date'] !== '' ? $ev['date'] : ($ev['year'] ? (string) $ev['year'] : ''), 'place_name' => $ev['place'], 'country' => '',
                            'description' => mb_substr(i18n_t('D’après {what} (Open Archives) — à vérifier', ['what' => $rec['source']['type'] ?: 'un acte']), 0, 500), 'fact_confidence' => 'doubt',
                            'confidence_origin' => 'Open Archives — ' . $archive, 'research_note' => i18n_t('À vérifier : trouvé dans Open Archives, pas encore confronté à l’acte original.')]);
                        $eid = (int) ($e['id'] ?? 0);
                        if ($eid) { $ids['events'][] = $eid; $link->execute(['event', $eid, $sid, mb_substr($rec['source']['reference'], 0, 120), '', i18n_t('À vérifier (Open Archives)')]); $ids['source_links'][] = (int) $pdo->lastInsertId(); $notes[] = i18n_t('événement ajouté, marqué « doute »'); }
                    }
                }
            }
        }
        $pdo->prepare('INSERT INTO ouc_oa_adds(batch, person_id, rec_key, ids, summary) VALUES(?,?,?,?,?)')->execute([$batch, $pid, $rec['key'], json_encode($ids), $what]);
        $prev = ouc_oa_marks($pdo, $pid)[$rec['key']] ?? null;
        $pdo->prepare("INSERT INTO ouc_oa_marks(person_id, rec_key, verdict, batch) VALUES(?,?,'added',?) ON CONFLICT(person_id, rec_key) DO UPDATE SET verdict='added', batch=excluded.batch, created_at=CURRENT_TIMESTAMP")
            ->execute([$pid, $rec['key'], $batch]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Open Archives : source ajoutée (à vérifier) — ' . $what); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['batch' => $batch, 'source_id' => $ids['sources'][0], 'event_ids' => $ids['events'], 'notes' => $notes, 'what' => $what, 'prev_mark' => $prev];
}

/** POST ou_chercher_openarch_undo : retire la source, ses liens et l'événement ajoutés (s'ils sont encore là) */
function ouc_oa_undo(PDO $pdo, array $d): array
{
    ouc_oa_schema($pdo);
    $batch = mb_substr(safe_text($d['batch'] ?? ''), 0, 40);
    $s = $pdo->prepare("SELECT * FROM ouc_oa_adds WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException(i18n_t('Cet ajout est déjà annulé, ou introuvable.')); }
    $pid = (int) $row['person_id']; $ids = json_decode((string) $row['ids'], true) ?: [];
    assert_person_unlocked($pdo, $pid);
    $own = !$pdo->inTransaction(); // api.php ouvre déjà une transaction pour chaque écriture
    if ($own) { $pdo->beginTransaction(); }
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
        $pdo->prepare("UPDATE ouc_oa_adds SET undone_at=CURRENT_TIMESTAMP WHERE batch=?")->execute([$batch]);
        $pdo->prepare("DELETE FROM ouc_oa_marks WHERE person_id=? AND rec_key=? AND batch=?")->execute([$pid, (string) $row['rec_key'], $batch]);
        if (function_exists('log_change')) { log_change($pdo, 'person', $pid, 'update', 'Open Archives : ajout annulé — ' . (string) $row['summary']); }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['ok' => true, 'person_id' => $pid];
}

/** POST ou_chercher_openarch_mark : « ✗ Pas lui » (verdict no) ou l'enlever (verdict '') ; rend l'état d'avant pour ↶ */
function ouc_oa_mark(PDO $pdo, array $d): array
{
    ouc_oa_schema($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException('Fiche introuvable.'); }
    $key = (string) ($d['key'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{1,40}:[A-Za-z0-9_-]{1,80}$/', $key)) { throw new LcndaBadInput('Acte inconnu.'); }
    $verdict = (string) ($d['verdict'] ?? '');
    $prev = ouc_oa_marks($pdo, $pid)[$key] ?? null;
    if ($prev && $prev['verdict'] === 'added') { throw new RuntimeException(i18n_t('Cet acte est déjà ajouté à sa fiche : annule l’ajout d’abord.')); }
    if ($verdict === 'no') { $pdo->prepare("INSERT INTO ouc_oa_marks(person_id, rec_key, verdict) VALUES(?,?,'no') ON CONFLICT(person_id, rec_key) DO UPDATE SET verdict='no', created_at=CURRENT_TIMESTAMP")->execute([$pid, $key]); }
    elseif ($verdict === '') { $pdo->prepare('DELETE FROM ouc_oa_marks WHERE person_id=? AND rec_key=?')->execute([$pid, $key]); }
    else { throw new LcndaBadInput('Choix inconnu.'); }
    return ['ok' => true, 'prev' => $prev ? $prev['verdict'] : ''];
}
