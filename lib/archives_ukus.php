<?php
declare(strict_types=1);

/**
 * 🌍 Où chercher ? → 🇬🇧🇺🇸 « Archives britanniques et américaines » : chercher le nom d'une personne (morte, pas confidentielle)
 * dans deux catalogues d'archives nationales SANS quitter la page, puis ouvrir la notice (↗) sur leur site. Rien n'est ajouté
 * à la fiche : la page montre des notices de catalogue (titre, cote, dates, service), pas des actes.
 *
 * 🇬🇧 The National Archives (Kew), Discovery API — https://discovery.nationalarchives.gov.uk/API (sans clé).
 *    Conditions : pages « Discovery for developers » et « policy on use of website and catalogue data »
 *    (https://www.nationalarchives.gov.uk/help/discovery-for-developers-about-the-application-programming-interface-api/,
 *    https://www.nationalarchives.gov.uk/terms-and-conditions/policy-on-use-of-website-and-catalogue-data/) : pas pu les ouvrir
 *    d'ici (hôte refusé par l'atelier, 26/11/2026) ; leur résumé public dit : pas d'assistance ni de disponibilité garantie, et
 *    de ne pas garder (cache) le contenu renvoyé par l'API. Le catalogue est annoncé sous Open Government Licence.
 *    → l'app ne GARDE RIEN de leurs réponses (aucune table, aucun fichier) ; une requête par clic seulement, au plus 1 par seconde
 *      et 20 par minute, un nom de programme reconnaissable, la source citée sur chaque ligne et sous la liste.
 * 🇺🇸 National Archives Catalog (NARA), API v2 — https://catalog.archives.gov/api/v2/ ; aide : https://www.archives.gov/research/catalog/help/api
 *    (page pas ouverte d'ici, hôte refusé ; résumé public : une clé par personne, demandée par courriel à Catalog_API@nara.gov,
 *    envoyée dans l'en-tête x-api-key ; 10 000 requêtes par mois ; ne pas publier sa clé ; dire que le produit n'est pas
 *    approuvé par NARA). Les notices du catalogue sont des documents publics américains.
 *    → SANS CLÉ : pas d'appel du tout, l'écran donne seulement le lien de recherche sur leur site (↗). AVEC une clé (facultative,
 *      collée dans « ⚙️ Personnaliser », jamais dans la conversation) : rangée dans SHARED_DATA_DIR/genealogie-nara-cle.json
 *      (droits 600, propre à l'ordinateur, jamais renvoyée au navigateur, jamais dans les sauvegardes de la base), envoyée
 *      seulement à catalog.archives.gov ; réponses gardées 30 jours (table ukus_nara_cache) pour ménager les 10 000 du mois.
 * Ce qui part : le prénom usuel, le nom et une période — jamais pour une fiche vivante (ou peut-être vivante : née il y a moins
 * de 100 ans sans décès connu), jamais pour une fiche confidentielle, et RIEN en mode consultation ni pour un invité du wifi
 * (kiosk_state()['on'], qui couvre les deux).
 *
 *  GET  ukus_state                         → {kiosk, nara_key: bool}
 *  GET  ukus_tna_search  &id=&first=&last=&y1=&y2=&kind=   → {rows, found, sent, search_url, attribution}
 *  GET  ukus_nara_search &id=&first=&last=&y1=&y2=&fresh=  → {rows, found, cached, search_url, attribution} | {need_key, search_url}
 *  POST ukus_nara_key_save {key} · ukus_nara_key_forget {}  (refusés en consultation par kiosk_guard)
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_UKUS_DIR (tna.json, nara.json ; calls.log) à la place du réseau — tests/test-liens-archives.js.
 */

const UKUS_TNA_API = 'https://discovery.nationalarchives.gov.uk/API/search/records';
const UKUS_NARA_API = 'https://catalog.archives.gov/api/v2/records/search';
const UKUS_NARA_TTL = 30 * 86400;
const UKUS_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
/** les sortes de documents de Kew : la série du catalogue (testaments de la Prerogative Court of Canterbury, soldats, naturalisations) */
const UKUS_TNA_KINDS = ['' => '', 'wills' => 'PROB 11', 'soldiers' => 'WO', 'naturalisation' => 'HO'];

function ukus_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec('CREATE TABLE IF NOT EXISTS ukus_nara_cache (qkey TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL)');
    $done = true;
}

function ukus_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

/* ═════════════════════ la clé NARA : propre à l'ordinateur, jamais montrée ═════════════════════ */

function ukus_key_file(): string { return rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : sys_get_temp_dir()), '/') . '/genealogie-nara-cle.json'; }
function ukus_key_ok(string $k): bool { return (bool) preg_match('/^[A-Za-z0-9._-]{16,200}$/', $k); }
function ukus_nara_key(): string
{
    $f = ukus_key_file();
    $j = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
    $k = is_array($j) && is_string($j['key'] ?? null) ? (string) $j['key'] : '';
    return ukus_key_ok($k) ? $k : '';
}
function ukus_nara_key_save(array $d): array
{
    if (ukus_kiosk()) { throw new RuntimeException(i18n_t('Mode consultation : rien ne peut être modifié.')); }
    $key = trim((string) ($d['key'] ?? ''));
    if (!ukus_key_ok($key)) { throw new LcndaBadInput(i18n_t('Clé illisible : lettres, chiffres, « - _ . », au moins 16 caractères.')); }
    $f = ukus_key_file();
    if (!is_dir(dirname($f))) { @mkdir(dirname($f), 0700, true); }
    if (@file_put_contents($f . '.tmp', json_encode(['key' => $key])) === false || !@rename($f . '.tmp', $f)) { throw new RuntimeException(i18n_t('Écriture impossible dans le dossier des données.')); }
    @chmod($f, 0600);
    return ['ok' => true, 'nara_key' => true];
}
function ukus_nara_key_forget(): array
{
    if (ukus_kiosk()) { throw new RuntimeException(i18n_t('Mode consultation : rien ne peut être modifié.')); }
    @unlink(ukus_key_file());
    return ['ok' => true, 'nara_key' => false];
}

/* ═════════════════════ la personne : ce qu'on a le droit d'envoyer ═════════════════════ */

/** prénom usuel, nom, années ; une exception si la fiche est vivante, peut-être vivante ou confidentielle */
function ukus_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, living_status, is_private FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new LcndaBadInput(i18n_t('Fiche introuvable.')); }
    if ((int) ($p['is_private'] ?? 0) === 1) { throw new LcndaBadInput(i18n_t('Fiche confidentielle : rien n’est envoyé à un site extérieur.')); }
    $ev = $pdo->prepare("SELECT e.year, COALESCE(t.gedcom_tag,'') AS tag FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? ORDER BY COALESCE(e.year, 9999)");
    $ev->execute([$pid]);
    $by = null; $dy = null; $dead = false; $first = null;
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $y = $e['year'] !== null ? (int) $e['year'] : null;
        if ($y && $first === null) { $first = $y; }
        if (in_array($e['tag'], ['DEAT', 'BURI', 'CREM'], true)) { $dead = true; if ($y && $dy === null) { $dy = $y; } }
        if ($y && $by === null && in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true)) { $by = $y; }
    }
    $living = (string) $p['living_status'];
    $old = ($by ?: $first) !== null && (int) ($by ?: $first) <= (int) date('Y') - 100;
    if ($living === 'living' || (!$dead && $living !== 'deceased' && !$old)) {
        throw new LcndaBadInput(i18n_t('Personne vivante (ou peut-être vivante) : rien n’est envoyé à un site extérieur.'));
    }
    return ['id' => $pid, 'first' => trim(preg_split('/[\s,]+/', trim((string) $p['first_name']))[0] ?? ''), 'last' => trim((string) $p['last_name']), 'birth_year' => $by, 'death_year' => $dy];
}

/** la question : ce que la page a changé (prénom, nom, années), dans des bornes sages */
function ukus_query(PDO $pdo, array $g): array
{
    if (ukus_kiosk()) { throw new LcndaBadInput(i18n_t('Mode consultation : aucune recherche n’est envoyée à un site extérieur.')); }
    $p = ukus_person($pdo, safe_int($g['id'] ?? 0));
    $clean = static fn(string $x) => mb_substr(trim(preg_replace('/\s+/u', ' ', preg_replace('/[^\p{L}\p{M}\s\'’-]+/u', ' ', $x) ?? '') ?? ''), 0, 60);
    $last = $clean(array_key_exists('last', $g) && trim((string) $g['last']) !== '' ? safe_text($g['last']) : $p['last']);
    $first = $clean(array_key_exists('first', $g) ? safe_text($g['first']) : $p['first']);
    if ($last === '') { throw new LcndaBadInput(i18n_t('Il faut au moins un nom de famille pour chercher.')); }
    $y1 = safe_int($g['y1'] ?? 0); $y2 = safe_int($g['y2'] ?? 0);
    if (!$y1 && $p['birth_year']) { $y1 = (int) $p['birth_year']; }
    if (!$y2 && $p['birth_year']) { $y2 = (int) ($p['death_year'] ?: $p['birth_year'] + 90); }
    $y1 = $y1 ? max(1000, min(2000, $y1)) : 0; $y2 = $y2 ? max(1000, min(2000, $y2)) : 0;
    if ($y1 && $y2 && $y2 < $y1) { [$y1, $y2] = [$y2, $y1]; }
    return ['person' => $p, 'first' => $first, 'last' => $last, 'name' => trim($first . ' ' . $last), 'y1' => $y1, 'y2' => $y2];
}

/* ═════════════════════ le réseau : à la demande, lent exprès ═════════════════════ */

/** au plus 1 requête par seconde et 20 par minute, par site (fichier verrouillé, partagé par les fenêtres de l'app) */
function ukus_throttle(string $site): void
{
    $f = rtrim((string) (defined('DATA_DIR') ? DATA_DIR : sys_get_temp_dir()), '/') . '/ukus-' . preg_replace('/[^a-z]/', '', $site) . '-throttle.json';
    $h = @fopen($f, 'c+'); if (!$h) { return; }
    try {
        flock($h, LOCK_EX);
        $st = json_decode((string) stream_get_contents($h), true); $st = is_array($st) ? $st : [];
        $now = microtime(true);
        $recent = array_values(array_filter(array_map('floatval', $st['t'] ?? []), static fn($t) => $t > $now - 60));
        if (count($recent) >= 20) { throw new RuntimeException(i18n_t('Beaucoup de recherches en une minute : attends un peu, puis réessaie.')); }
        $last = $recent ? max($recent) : 0.0;
        if ($now - $last < 1.0) { usleep((int) ((1.0 - ($now - $last)) * 1e6)); $now = microtime(true); }
        $recent[] = $now;
        ftruncate($h, 0); rewind($h); fwrite($h, json_encode(['t' => $recent]));
    } finally { flock($h, LOCK_UN); fclose($h); }
}

/** GET JSON ; le dossier des essais remplace le réseau (tna.json, nara.json) */
function ukus_fetch(string $site, string $url, array $headers, string $label): array
{
    $dir = (string) getenv('LCNDA_TEST_UKUS_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        @file_put_contents($dir . '/calls.log', $site . ' ' . $url . ' ' . (preg_grep('/^x-api-key:/i', $headers) ? 'key' : 'nokey') . "\n", FILE_APPEND);
        $f = $dir . '/' . $site . '.json';
        if (!is_file($f)) { throw new RuntimeException(i18n_t('{site} ne répond pas pour le moment.', ['site' => $label])); }
        $j = json_decode((string) file_get_contents($f), true);
        return is_array($j) ? $j : [];
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    ukus_throttle($site);
    $body = ''; $too = false; $max = 4 * 1024 * 1024;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => UKUS_UA, CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }]
        + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse de {site}.', ['site' => $label])); }
    if ($code === 429) { throw new RuntimeException(i18n_t('{site} demande d’aller moins vite : réessaie plus tard.', ['site' => $label])); }
    if ($code === 401 || $code === 403) { throw new RuntimeException(i18n_t('{site} refuse la clé (HTTP {code}) : vérifie-la dans « ⚙️ Personnaliser ».', ['site' => $label, 'code' => (string) $code])); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion à {site} : {err}', ['site' => $label, 'err' => $err]) : i18n_t('{site} répond {code}.', ['site' => $label, 'code' => (string) $code])); }
    $j = json_decode($body, true);
    if (!is_array($j)) { throw new RuntimeException(i18n_t('Réponse illisible de {site}.', ['site' => $label])); }
    return $j;
}

/* ═════════════════════ 🇬🇧 The National Archives ═════════════════════ */

function ukus_tna_url(string $name): string { return 'https://discovery.nationalarchives.gov.uk/results/r?_q=' . rawurlencode($name); }

/** une notice de Discovery → une ligne (les champs absents restent vides : la forme de la réponse peut changer) */
function ukus_tna_row(array $r): ?array
{
    $id = (string) ($r['id'] ?? $r['Id'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{1,80}$/', $id)) { return null; }
    $held = $r['heldBy'] ?? $r['HeldBy'] ?? [];
    $held = is_array($held) ? implode(', ', array_map(static fn($x) => is_array($x) ? (string) ($x['xReferenceName'] ?? $x['name'] ?? '') : (string) $x, $held)) : (string) $held;
    $txt = static fn($v) => mb_substr(trim(strip_tags(html_entity_decode((string) $v, ENT_QUOTES | ENT_HTML5, 'UTF-8'))), 0, 400);
    return ['id' => $id, 'title' => $txt($r['title'] ?? $r['Title'] ?? ''), 'description' => $txt($r['description'] ?? $r['Description'] ?? ''), 'reference' => $txt($r['reference'] ?? $r['Reference'] ?? ''),
        'dates' => $txt($r['coveringDates'] ?? $r['CoveringDates'] ?? ''), 'held_by' => $txt($held), 'url' => 'https://discovery.nationalarchives.gov.uk/details/r/' . rawurlencode($id)];
}

/** GET ukus_tna_search : rien n'est gardé (leur page pour les développeurs demande de ne pas garder le contenu) */
function ukus_tna_search(PDO $pdo, array $g): array
{
    $q = ukus_query($pdo, $g);
    $kind = (string) ($g['kind'] ?? '');
    if (!isset(UKUS_TNA_KINDS[$kind])) { $kind = ''; }
    $params = ['sps.searchQuery' => '"' . $q['name'] . '"', 'sps.resultsPageSize' => 30, 'sps.sortByOption' => 'RELEVANCE'];
    if ($q['y1']) { $params['sps.dateFrom'] = sprintf('%04d-01-01', $q['y1']); }
    if ($q['y2']) { $params['sps.dateTo'] = sprintf('%04d-12-31', $q['y2']); }
    if (UKUS_TNA_KINDS[$kind] !== '') { $params['sps.recordSeries'] = UKUS_TNA_KINDS[$kind]; }
    $j = ukus_fetch('tna', UKUS_TNA_API . '?' . http_build_query($params), [], 'The National Archives');
    $list = $j['records'] ?? $j['Records'] ?? [];
    $rows = [];
    foreach (is_array($list) ? $list : [] as $r) { if (is_array($r) && ($x = ukus_tna_row($r))) { $rows[] = $x; } }
    return ['rows' => $rows, 'found' => (int) ($j['count'] ?? $j['Count'] ?? count($rows)), 'sent' => $params['sps.searchQuery'] . ($q['y1'] ? " {$q['y1']}-{$q['y2']}" : ''), 'kind' => $kind,
        'search_url' => ukus_tna_url($q['name']), 'cached' => false,
        'attribution' => i18n_t('Données : The National Archives (Kew), catalogue Discovery — Open Government Licence. Réponse non gardée.')];
}

/* ═════════════════════ 🇺🇸 NARA ═════════════════════ */

function ukus_nara_url(string $name): string { return 'https://catalog.archives.gov/search?q=' . rawurlencode('"' . $name . '"'); }

function ukus_nara_row(array $hit): ?array
{
    $rec = $hit['_source']['record'] ?? $hit['record'] ?? $hit;
    if (!is_array($rec)) { return null; }
    $na = (string) ($rec['naId'] ?? $hit['_id'] ?? '');
    if (!preg_match('/^\d{1,15}$/', $na)) { return null; }
    $txt = static fn($v) => mb_substr(trim(strip_tags((string) $v)), 0, 400);
    $date = '';
    foreach (['productionDates', 'inclusiveDates', 'coverageDates'] as $k) {
        $d = $rec[$k] ?? null;
        if (is_array($d)) { $d = isset($d[0]) && is_array($d[0]) ? $d[0] : $d; $date = trim(($d['logicalDate'] ?? $d['inclusiveStartDate']['logicalDate'] ?? $d['year'] ?? '') . (isset($d['inclusiveEndDate']['logicalDate']) ? ' – ' . $d['inclusiveEndDate']['logicalDate'] : '')); }
        if ($date !== '') { break; }
    }
    $series = '';
    foreach (is_array($rec['ancestors'] ?? null) ? $rec['ancestors'] : [] as $a) { if (is_array($a) && ($a['levelOfDescription'] ?? '') === 'series') { $series = (string) ($a['title'] ?? ''); } }
    return ['id' => $na, 'title' => $txt($rec['title'] ?? ''), 'description' => $txt($rec['scopeAndContentNote'] ?? ''), 'reference' => $txt($series), 'dates' => $txt(substr($date, 0, 40)),
        'held_by' => $txt(is_array($rec['physicalOccurrences'][0]['referenceUnits'][0] ?? null) ? ($rec['physicalOccurrences'][0]['referenceUnits'][0]['name'] ?? '') : ''), 'url' => 'https://catalog.archives.gov/id/' . $na];
}

/** GET ukus_nara_search : sans clé, pas d'appel (seulement le lien) ; avec la clé, réponse gardée 30 jours */
function ukus_nara_search(PDO $pdo, array $g): array
{
    $q = ukus_query($pdo, $g);
    $link = ukus_nara_url($q['name']);
    $att = i18n_t('Données : National Archives Catalog (NARA, États-Unis). Ce produit utilise l’API du catalogue sans être approuvé par NARA.');
    $key = ukus_nara_key();
    if ($key === '') { return ['need_key' => true, 'rows' => [], 'found' => 0, 'search_url' => $link, 'attribution' => $att]; }
    ukus_schema($pdo);
    $params = ['q' => '"' . $q['name'] . '"', 'limit' => 25, 'page' => 1];
    if ($q['y1'] && $q['y2']) { $params['startDate'] = sprintf('%04d', $q['y1']); $params['endDate'] = sprintf('%04d', $q['y2']); }
    ksort($params);
    $qkey = http_build_query($params);
    $j = null; $cached = false; $at = time();
    if (empty($g['fresh'])) {
        $s = $pdo->prepare('SELECT body, fetched_at FROM ukus_nara_cache WHERE qkey=?'); $s->execute([$qkey]); $r = $s->fetch(PDO::FETCH_ASSOC);
        if ($r && (int) $r['fetched_at'] > time() - UKUS_NARA_TTL) { $j = json_decode((string) $r['body'], true); $cached = is_array($j); $at = (int) $r['fetched_at']; }
    }
    if (!is_array($j)) {
        $j = ukus_fetch('nara', UKUS_NARA_API . '?' . $qkey, ['x-api-key: ' . $key], 'NARA');
        $pdo->prepare('INSERT INTO ukus_nara_cache(qkey, body, fetched_at) VALUES(?,?,?) ON CONFLICT(qkey) DO UPDATE SET body=excluded.body, fetched_at=excluded.fetched_at')
            ->execute([$qkey, json_encode($j, JSON_UNESCAPED_UNICODE), time()]);
        if (random_int(1, 20) === 1) { $pdo->prepare('DELETE FROM ukus_nara_cache WHERE fetched_at < ?')->execute([time() - UKUS_NARA_TTL]); }
        $at = time();
    }
    $hits = $j['body']['hits']['hits'] ?? $j['hits']['hits'] ?? [];
    $total = $j['body']['hits']['total'] ?? $j['hits']['total'] ?? null;
    $rows = [];
    foreach (is_array($hits) ? $hits : [] as $h) { if (is_array($h) && ($x = ukus_nara_row($h))) { $rows[] = $x; } }
    return ['rows' => $rows, 'found' => (int) (is_array($total) ? ($total['value'] ?? count($rows)) : ($total ?? count($rows))), 'sent' => $params['q'] . ($q['y1'] && $q['y2'] ? " {$q['y1']}-{$q['y2']}" : ''),
        'cached' => $cached, 'fetched_at' => date('Y-m-d H:i', $at), 'search_url' => $link, 'attribution' => $att];
}

/* ═════════════════════ les routes (api.php : préfixe « ukus_ », avant les grands match) ═════════════════════ */

function ukus_dispatch(PDO $pdo, string $action, bool $isWrite, array $data): never
{
    try {
        if (!$isWrite) {
            json_response(match ($action) {
                'ukus_state' => ['kiosk' => ukus_kiosk(), 'nara_key' => ukus_nara_key() !== ''],
                'ukus_tna_search' => ukus_tna_search($pdo, $_GET),
                'ukus_nara_search' => ukus_nara_search($pdo, $_GET),
                default => throw new RuntimeException('Action inconnue'),
            });
        }
        json_response(['ok' => true, 'result' => match ($action) {
            'ukus_nara_key_save' => ukus_nara_key_save($data),
            'ukus_nara_key_forget' => ukus_nara_key_forget(),
            default => throw new RuntimeException('Action inconnue'),
        }]);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], $e->getMessage() === 'Action inconnue' ? 400 : 502);
    }
}
