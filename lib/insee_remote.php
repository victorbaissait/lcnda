<?php
declare(strict_types=1);

/**
 * Décès INSEE : les fichiers publiés par l'INSEE sur data.gouv.fr (« Fichier des personnes décédées »),
 * téléchargés et importés par l'app, sans passer par le navigateur.
 *  - un fichier par année (deces-2024), puis un par mois pour l'année en cours (deces-2025-m08) ;
 *    quand le fichier de l'année sort, il remplace ceux des mois (importés : retirés de la base après coup) ;
 *  - CSV de préférence ; sinon le .txt en positions fixes est converti en CSV avant l'import habituel.
 */

const INSEE_DATASET_API = 'https://www.data.gouv.fr/api/1/datasets/fichier-des-personnes-decedees/';
const INSEE_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Période d'un fichier d'après son nom : ['year' => 2025, 'month' => 8, 'quarter' => 0] ou null. */
function insee_file_period(string $name): ?array
{
    $n = strtolower($name);
    if (!preg_match('/(?:deces|décès)[-_ ]?((?:19[6-9]|20\d)\d)(?:[-_ ]?(m|t)(\d{1,2}))?/u', $n, $m)) { return null; }
    $year = (int) $m[1];
    $month = ($m[2] ?? '') === 'm' ? (int) $m[3] : 0;
    $quarter = ($m[2] ?? '') === 't' ? (int) $m[3] : 0;
    if ($month > 12 || $quarter > 4) { return null; }
    // order : pour comparer deux fichiers (le fichier de l'année vient après ses mois et ses trimestres)
    return ['year' => $year, 'month' => $month, 'quarter' => $quarter, 'key' => sprintf('%04d-%s%02d', $year, $month ? 'm' : ($quarter ? 't' : 'a'), $month ?: $quarter),
        'order' => $year * 100 + ($month ?: ($quarter ? $quarter * 3 : 13))];
}

function insee_period_label(array $p): string
{
    if ($p['month']) { return 'Décès de ' . INSEE_MONTHS[$p['month'] - 1] . ' ' . $p['year']; }
    if ($p['quarter']) { return 'Décès du ' . $p['quarter'] . ($p['quarter'] === 1 ? 'er' : 'e') . ' trimestre ' . $p['year']; }
    return 'Décès de ' . $p['year'];
}

/**
 * Les fichiers disponibles, du plus récent au plus ancien, avec ce qui est déjà dans la base.
 * « Nouveau » = pas encore importé et plus récent que ce qui l'est déjà (rien n'est « nouveau » tant
 * qu'aucun fichier n'a été importé : on ne pousse pas à charger 50 ans de décès).
 */
function insee_remote_files(PDO $pdo, ?array $resources = null): array
{
    if ($resources === null) {
        $json = wiki_get_json(INSEE_DATASET_API); // même téléchargement JSON que pour Wikipédia
        $resources = $json['resources'] ?? [];
    }
    $imported = [];
    foreach ($pdo->query('SELECT filename, imported_at FROM insee_deces_imports') as $r) {
        $base = strtolower(trim(explode(' / ', (string) $r['filename'])[0]));
        $imported[$base] = (string) $r['imported_at'];
        $p = insee_file_period($base);
        if ($p) { $imported['#' . $p['key']] = (string) $r['imported_at']; } // même période, nom un peu différent
    }
    $byPeriod = [];
    $rank = ['csv' => 3, 'txt' => 2, 'zip' => 1]; // un .zip peut contenir le .txt en positions fixes, que seul le .txt sait lire
    foreach ($resources as $res) {
        $url = (string) ($res['url'] ?? '');
        $name = basename((string) parse_url($url, PHP_URL_PATH));
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset($rank[$ext]) || !preg_match('#^https://([a-z0-9-]+\.)*data\.gouv\.fr/#', $url)) { continue; }
        $p = insee_file_period($name) ?? insee_file_period((string) ($res['title'] ?? ''));
        if (!$p) { continue; }
        $cur = $byPeriod[$p['key']] ?? null;
        if ($cur && $rank[$cur['format']] >= $rank[$ext]) { continue; }
        $byPeriod[$p['key']] = ['key' => $p['key'], 'order' => $p['order'], 'year' => $p['year'], 'month' => $p['month'], 'quarter' => $p['quarter'], 'label' => insee_period_label($p),
            'name' => $name, 'url' => $url, 'format' => $ext, 'size' => (int) ($res['filesize'] ?? 0),
            'published' => substr((string) ($res['last_modified'] ?? $res['created_at'] ?? ''), 0, 10)];
    }
    $years = [];
    foreach ($byPeriod as $f) { if (!$f['month'] && !$f['quarter']) { $years[$f['year']] = true; } }
    $maxImported = 0;
    foreach ($byPeriod as &$f) {
        $f['imported_at'] = $imported[strtolower($f['name'])] ?? $imported['#' . $f['key']] ?? '';
        $f['imported'] = $f['imported_at'] !== '';
        $f['superseded'] = ($f['month'] || $f['quarter']) && isset($years[$f['year']]); // le fichier de l'année les contient
        if ($f['quarter'] && !$f['superseded']) { // un trimestre dont les mois sont publiés (ou importés) ferait doublon avec eux
            foreach (range($f['quarter'] * 3 - 2, $f['quarter'] * 3) as $m) { $mk = sprintf('%04d-m%02d', $f['year'], $m); if (isset($byPeriod[$mk]) || isset($imported['#' . $mk])) { $f['superseded'] = true; } }
        }
        if ($f['imported'] && $f['order'] > $maxImported) { $maxImported = $f['order']; }
    }
    unset($f);
    uasort($byPeriod, static fn($a, $b) => $b['order'] <=> $a['order']);
    $files = array_values($byPeriod);
    foreach ($files as &$f) { $f['new'] = !$f['imported'] && !$f['superseded'] && $maxImported > 0 && $f['order'] > $maxImported; }
    unset($f);
    return ['files' => $files, 'new_count' => count(array_filter($files, static fn($f) => $f['new'])), 'checked_at' => date('c'), 'source' => 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/'];
}

/** Téléchargement d'un fichier data.gouv.fr dans un fichier temporaire. */
function insee_download(string $url): string
{
    if (!preg_match('#^https://([a-z0-9-]+\.)*data\.gouv\.fr/#', $url)) { throw new RuntimeException('Adresse refusée : seuls les fichiers de data.gouv.fr sont téléchargés.'); }
    if (!function_exists('curl_init')) { throw new RuntimeException('Téléchargement impossible : PHP n’a pas l’extension curl.'); }
    $ext = strtolower(pathinfo((string) parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
    $path = tempnam(sys_get_temp_dir(), 'insee-dl-') ?: '';
    if ($path === '') { throw new RuntimeException('Création du fichier temporaire impossible.'); }
    rename($path, $path .= '.' . (in_array($ext, ['csv', 'txt', 'zip'], true) ? $ext : 'csv'));
    $fh = fopen($path, 'wb');
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_FILE => $fh, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 3600,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'LCNDA (logiciel de genealogie)', CURLOPT_FAILONERROR => true] + lcnda_curl_tls());
    $ok = curl_exec($ch);
    $err = curl_error($ch);
    unset($ch);
    fclose($fh);
    if (!$ok || filesize($path) < 100) { @unlink($path); throw new RuntimeException('Téléchargement interrompu' . ($err !== '' ? ' (' . $err . ')' : '') . '. Vérifie la connexion à Internet.'); }
    return $path;
}

/**
 * Fichier INSEE en positions fixes (.txt) → CSV lisible par l'import habituel. Une ligne fait 176 caractères :
 * nom*prénoms/ (80), sexe (1), date de naissance (8), code du lieu de naissance (5), commune (30), pays (30),
 * date de décès (8), code du lieu de décès (5), numéro d'acte (9). Rend le chemin du CSV, ou '' si le fichier
 * est déjà un CSV.
 */
function insee_fixed_width_to_csv(string $path): string
{
    $in = fopen($path, 'rb');
    $first = (string) fgets($in);
    if (substr_count($first, ';') >= 5 || substr_count($first, ',') >= 5) { fclose($in); return ''; }
    rewind($in);
    $outPath = $path . '.csv';
    $out = fopen($outPath, 'wb');
    fwrite($out, "nomprenom;sexe;datenaiss;lieunaiss;commnaiss;paysnaiss;datedeces;lieudeces;actedeces\n");
    $widths = [80, 1, 8, 5, 30, 30, 8, 5, 9];
    while (($line = fgets($in)) !== false) {
        $line = rtrim($line, "\r\n");
        if (trim($line) === '') { continue; }
        if (!mb_check_encoding($line, 'UTF-8')) { $line = mb_convert_encoding($line, 'UTF-8', 'ISO-8859-1'); }
        // positions en octets (fichier sans accents) ou en caractères (accents en UTF-8)
        $byChars = strlen($line) > 176 && mb_strlen($line) <= 176;
        $cells = []; $pos = 0;
        foreach ($widths as $w) { $cells[] = trim($byChars ? mb_substr($line, $pos, $w) : substr($line, $pos, $w)); $pos += $w; }
        fputcsv($out, $cells, ';', '"', '');
    }
    fclose($in); fclose($out);
    return $outPath;
}

/**
 * Télécharge un fichier de data.gouv.fr et l'importe comme un fichier choisi à la main (même contrôle des doublons).
 * Après le fichier d'une année, les fichiers mensuels de cette année déjà importés sont retirés (sinon en double).
 */
function insee_remote_import(PDO $pdo, array $data): never
{
    @set_time_limit(0);
    $url = (string) ($data['url'] ?? '');
    $name = basename((string) parse_url($url, PHP_URL_PATH));
    $period = insee_file_period($name);
    if (!$period) { json_response(['error' => 'Ce fichier n’est pas un fichier des décès de l’INSEE.'], 422); }
    try {
        $path = insee_download($url);
        $csv = str_ends_with($path, '.txt') ? insee_fixed_width_to_csv($path) : '';
    } catch (Throwable $e) {
        json_response(['error' => $e->getMessage()], 502);
    }
    $before = (int) $pdo->query('SELECT COALESCE(max(id),0) FROM insee_deces_imports')->fetchColumn();
    $file = $csv !== '' ? $csv : $path;
    register_shutdown_function(static function () use ($pdo, $path, $csv, $before, $period): void {
        @unlink($path); if ($csv !== '') { @unlink($csv); }
        if ($period['month'] || $period['quarter']) { return; }
        $done = $pdo->prepare('SELECT 1 FROM insee_deces_imports WHERE id > ? AND inserted_count > 0'); $done->execute([$before]);
        if (!$done->fetchColumn()) { return; }
        // le fichier de l'année remplace ceux des mois et des trimestres de la même année
        foreach ($pdo->query('SELECT id, filename FROM insee_deces_imports WHERE id <= ' . $before)->fetchAll() as $old) {
            $p = insee_file_period(strtolower(explode(' / ', (string) $old['filename'])[0]));
            if (!$p || $p['year'] !== $period['year'] || (!$p['month'] && !$p['quarter'])) { continue; }
            try {
                $del = $pdo->prepare('DELETE FROM insee_deces WHERE source_import_id=?'); $del->execute([(int) $old['id']]);
                // imports d'avant le lien source_import_id : leurs lignes sont repérées par le nom du fichier
                if ($del->rowCount() === 0) { $pdo->prepare('DELETE FROM insee_deces WHERE source_file=? AND source_import_id IS NULL')->execute([(string) $old['filename']]); }
                $pdo->prepare('DELETE FROM insee_deces_imports WHERE id=?')->execute([(int) $old['id']]);
            } catch (Throwable $e) { error_log('[insee] ' . $old['filename'] . ' non retiré : ' . $e->getMessage()); }
        }
    });
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_POST['force'] = !empty($data['force']) ? '1' : '0';
    $_FILES['file'] = ['name' => $name, 'tmp_name' => $file, 'error' => UPLOAD_ERR_OK, 'size' => (int) filesize($file), 'type' => 'text/csv'];
    insee_deces_import($pdo);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ⤓ Tout installer (1970 → aujourd'hui) et mises à jour : UN bouton, en arrière-plan, avec reprise.
 * La page rappelle « insee_maj_step » tant qu'il reste du travail ; chaque appel fait au plus ~8 secondes de travail
 * (MAMP coupe une requête au bout de 30 s) : télécharger un morceau du fichier (HTTP Range, la suite reprend où on s'est
 * arrêté), puis lire et ranger quelques milliers de lignes, puis — pour le fichier d'une année — retirer les fichiers des
 * mois (et des trimestres) de cette année qu'il remplace. L'avancée (fichier, octets reçus, ligne lue) est notée dans la
 * base, dans la même transaction que les lignes : rien n'est rangé deux fois, même si l'app est fermée en plein milieu.
 *  - ordre : les années de 1970 à aujourd'hui ; pour l'année en cours, les mois (un trimestre seulement si ses mois manquent) ;
 *  - ce qui est déjà installé est sauté ; un fichier abîmé (taille ou empreinte sha1 de data.gouv.fr) est retéléchargé ;
 *  - mises à jour : les nouveaux mois, puis le fichier de l'année quand il sort (les mois sont alors retirés).
 * Essais sans Internet : GENEALOGY_TEST=1 + LCNDA_TEST_INSEE_DIR (un dossier avec dataset.json et les fichiers).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const INSEE_MAJ_LINE_BYTES = 200;   // une ligne du fichier ≈ 200 octets (deces-2024.txt : 130 Mo pour ~650 000 décès)
const INSEE_MAJ_ROW_BYTES = 330;    // une ligne rangée dans la base, index compris (mesuré : voir tests/test-insee-maj.js)

function insee_maj_test_dir(): string
{
    $d = (string) getenv('LCNDA_TEST_INSEE_DIR');
    return getenv('GENEALOGY_TEST') === '1' && $d !== '' && is_dir($d) ? $d : '';
}

function insee_maj_dir(bool $create = false): string
{
    $d = DATA_DIR . '/insee-maj';
    if ($create && !is_dir($d) && !@mkdir($d, 0775, true) && !is_dir($d)) { throw new RuntimeException(i18n_t('Impossible de créer le dossier de téléchargement des décès INSEE.')); }
    return $d;
}

function insee_maj_budget(): float
{
    $t = (float) (insee_maj_test_dir() !== '' ? (getenv('LCNDA_TEST_INSEE_SECONDS') ?: 8) : 8);
    return max(0.05, $t);
}

/* ─── réglages et travail en cours, gardés dans la base (une petite table, créée à la première écriture) ─── */

function insee_maj_kv_get(PDO $pdo, string $k): mixed
{
    try { $s = $pdo->prepare('SELECT v FROM insee_maj_kv WHERE k=?'); $s->execute([$k]); $v = $s->fetchColumn(); }
    catch (Throwable $_) { return null; } // pas encore de table : rien d'installé par ce moyen
    return $v === false ? null : json_decode((string) $v, true);
}

function insee_maj_kv_set(PDO $pdo, string $k, mixed $v): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS insee_maj_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    if ($v === null) { $pdo->prepare('DELETE FROM insee_maj_kv WHERE k=?')->execute([$k]); return; }
    $pdo->prepare('INSERT INTO insee_maj_kv(k,v,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at')
        ->execute([$k, json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
}

/* ─── la liste des fichiers sur data.gouv.fr ─── */

function insee_maj_url_ok(string $url): bool
{
    return (bool) preg_match('#^https://([a-z0-9-]+\.)*data\.gouv\.fr/#', $url);
}

/**
 * Lecture d'une adresse de data.gouv.fr (redirections suivies une à une, chacune revérifiée).
 * $sink reçoit les morceaux ; il rend false pour arrêter (temps écoulé). Rend [code HTTP, erreur].
 */
function insee_maj_http(string $url, callable $sink, ?int $from = null, int $timeout = 60): array
{
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    for ($hop = 0; $hop < 6; $hop++) {
        if (!insee_maj_url_ok($url)) { throw new RuntimeException(i18n_t('Adresse refusée : seuls les fichiers de data.gouv.fr sont téléchargés.')); }
        $ch = curl_init($url);
        $redirect = false;
        curl_setopt_array($ch, ($from !== null && $from > 0 ? [CURLOPT_RANGE => $from . '-'] : []) + [
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => $timeout,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'LCNDA (logiciel de genealogie)',
            CURLOPT_HEADERFUNCTION => static function ($c, $h) use (&$redirect) { if (preg_match('#^HTTP/\S+\s+(30[12378])#', $h)) { $redirect = true; } return strlen($h); },
            CURLOPT_WRITEFUNCTION => static function ($c, $chunk) use (&$redirect, $sink) {
                if ($redirect) { return strlen($chunk); } // corps d'une redirection : ignoré
                $code = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
                if ($code >= 400) { return strlen($chunk); }
                return $sink($chunk, $code) === false ? 0 : strlen($chunk);
            }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: '');
        $errno = curl_errno($ch); $err = $errno ? curl_strerror($errno) : '';
        unset($ch);
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = $loc; continue; }
        if ($errno === CURLE_WRITE_ERROR) { $err = ''; } // arrêté par nous (temps écoulé) : ce qui est reçu est gardé
        return [$code, $err];
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/**
 * Les « ressources » du jeu de données (la liste vient de data.gouv.fr ; gardée dans le dossier des téléchargements
 * pour l'afficher hors ligne). $refresh : la relire en ligne ; $mayWrite : false en mode consultation (rien n'est écrit).
 */
function insee_maj_listing(bool $refresh, bool $mayWrite): ?array
{
    $test = insee_maj_test_dir();
    $cache = insee_maj_dir() . '/liste.json';
    if (!$refresh) {
        if ($test !== '' && !is_file($cache)) { $refresh = true; }
        else {
            $c = is_file($cache) ? json_decode((string) file_get_contents($cache), true) : null;
            return is_array($c) && is_array($c['resources'] ?? null) ? $c : null;
        }
    }
    if ($test !== '') {
        if (getenv('LCNDA_TEST_INSEE_OFFLINE') === '1') { throw new RuntimeException(i18n_t('Pas de connexion à data.gouv.fr : réessaie plus tard.')); }
        $json = json_decode((string) @file_get_contents($test . '/dataset.json'), true);
    } else {
        $body = '';
        [$code, $err] = insee_maj_http(INSEE_DATASET_API, static function ($chunk) use (&$body) { $body .= $chunk; return strlen($body) < 8 * 1024 * 1024; }, null, 40);
        if ($code !== 200) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion à data.gouv.fr : {err}', ['err' => $err]) : i18n_t('data.gouv.fr répond {code} : réessaie plus tard.', ['code' => (string) $code])); }
        $json = json_decode($body, true);
    }
    if (!is_array($json) || !is_array($json['resources'] ?? null)) { throw new RuntimeException(i18n_t('La liste des fichiers des décès sur data.gouv.fr est illisible.')); }
    $out = ['resources' => array_values(array_map(static fn($r) => [
        'url' => (string) ($r['url'] ?? ''), 'title' => (string) ($r['title'] ?? ''), 'filesize' => (int) ($r['filesize'] ?? 0),
        'last_modified' => (string) ($r['last_modified'] ?? $r['created_at'] ?? ''),
        'checksum' => is_array($r['checksum'] ?? null) && ($r['checksum']['type'] ?? '') === 'sha1' ? (string) ($r['checksum']['value'] ?? '') : '',
    ], array_filter($json['resources'], 'is_array'))), 'checked_at' => date('c')];
    if ($mayWrite) { try { insee_maj_dir(true); @file_put_contents($cache, json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)); } catch (Throwable $_) {} }
    return $out;
}

/** Une version par période (CSV > TXT > ZIP, comme insee_remote_files), rangée par année : [année => [clé => fichier]] */
function insee_maj_catalog(array $resources): array
{
    $rank = ['csv' => 3, 'txt' => 2, 'zip' => 1];
    $by = [];
    foreach ($resources as $res) {
        $url = (string) ($res['url'] ?? '');
        $name = basename((string) parse_url($url, PHP_URL_PATH));
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset($rank[$ext]) || !insee_maj_url_ok($url)) { continue; }
        $p = insee_file_period($name) ?? insee_file_period((string) ($res['title'] ?? ''));
        if (!$p || $p['year'] < 1970) { continue; }
        $cur = $by[$p['year']][$p['key']] ?? null;
        if ($cur && $rank[$cur['format']] >= $rank[$ext]) { continue; }
        $by[$p['year']][$p['key']] = ['key' => $p['key'], 'order' => $p['order'], 'year' => $p['year'], 'month' => $p['month'], 'quarter' => $p['quarter'],
            'label' => insee_period_label($p), 'name' => $name, 'url' => $url, 'format' => $ext, 'size' => (int) ($res['filesize'] ?? 0),
            'sha1' => (string) ($res['checksum'] ?? ''), 'published' => substr((string) ($res['last_modified'] ?? ''), 0, 10)];
    }
    ksort($by);
    foreach ($by as &$files) { uasort($files, static fn($a, $b) => $a['order'] <=> $b['order']); }
    unset($files);
    return $by;
}

/**
 * Ce qui est installé, par année (d'après le journal des imports) : [année => [full, months, quarters, rows, ids, imported_at]].
 * Les fichiers sans période reconnue (importés à la main) sont rangés sous la clé 0. $skipId : l'import en cours.
 */
function insee_maj_installed(PDO $pdo, int $skipId = 0): array
{
    $out = [];
    foreach ($pdo->query('SELECT id, filename, inserted_count, imported_at FROM insee_deces_imports ORDER BY id') as $r) {
        if ((int) $r['id'] === $skipId) { continue; }
        $p = insee_file_period(strtolower(trim(explode(' / ', (string) $r['filename'])[0])));
        $y = $p ? $p['year'] : 0;
        $o = &$out[$y];
        $o ??= ['year' => $y, 'full' => false, 'months' => [], 'quarters' => [], 'rows' => 0, 'ids' => [], 'imported_at' => ''];
        if ($p && !$p['month'] && !$p['quarter']) { $o['full'] = true; }
        if ($p && $p['month']) { $o['months'][$p['month']] = true; }
        if ($p && $p['quarter']) { $o['quarters'][$p['quarter']] = true; }
        $o['rows'] += (int) $r['inserted_count'];
        $o['ids'][] = (int) $r['id'];
        $o['imported_at'] = max($o['imported_at'], (string) $r['imported_at']);
        unset($o);
    }
    ksort($out);
    return $out;
}

/**
 * Les fichiers à installer pour ces années, dans le bon ordre. Une année publiée en entier : son fichier (les mois déjà là
 * seront retirés après). Sinon (l'année en cours) : les mois qui manquent ; un trimestre seulement si aucun de ses mois
 * n'existe (sinon il ferait doublon avec eux). $keys : seulement ces périodes.
 */
function insee_maj_plan(array $catalog, array $installed, ?array $years, ?array $keys = null): array
{
    $plan = [];
    foreach ($catalog as $y => $files) {
        if ($years !== null && !in_array((int) $y, $years, true)) { continue; }
        $inst = $installed[$y] ?? null;
        if ($inst && $inst['full']) { continue; }
        $yearly = null; $months = [];
        foreach ($files as $f) { if (!$f['month'] && !$f['quarter']) { $yearly = $f; } if ($f['month']) { $months[$f['month']] = true; } }
        $todo = [];
        if ($yearly) { $todo[] = $yearly + ['replaces' => (bool) ($inst && ($inst['months'] || $inst['quarters']))]; }
        else {
            foreach ($files as $f) {
                if ($f['month'] && empty($inst['months'][$f['month']])) {
                    $q = intdiv($f['month'] - 1, 3) + 1;
                    if (empty($inst['quarters'][$q])) { $todo[] = $f + ['replaces' => false]; }
                }
                if ($f['quarter'] && empty($inst['quarters'][$f['quarter']])) {
                    $mine = range($f['quarter'] * 3 - 2, $f['quarter'] * 3);
                    $covered = false;
                    foreach ($mine as $m) { if (!empty($months[$m]) || !empty($inst['months'][$m])) { $covered = true; } }
                    if (!$covered) { $todo[] = $f + ['replaces' => false]; }
                }
            }
        }
        foreach ($todo as $f) { if ($keys === null || in_array($f['key'], $keys, true)) { $plan[] = $f; } }
    }
    return $plan;
}

/**
 * Les mises à jour : rien tant qu'on ne suit pas les décès récents (installé « tout », ou l'an dernier / cette année).
 * Alors : le fichier de l'année pour les années installées par mois, et tout ce qui est plus récent que le plus récent installé.
 */
function insee_maj_updates(PDO $pdo, array $catalog, array $installed): array
{
    $scope = insee_maj_kv_get($pdo, 'scope');
    $removed = array_map('intval', (array) (insee_maj_kv_get($pdo, 'removed') ?? []));
    $instYears = array_filter(array_keys($installed));
    if (!$instYears) { return []; }
    $maxY = max($instYears);
    $following = $scope === 'all' || $maxY >= (int) date('Y') - 1 || (is_array($scope) && max(array_map('intval', $scope) ?: [0]) >= (int) date('Y') - 1);
    if (!$following) { return []; }
    $years = [];
    foreach (array_keys($catalog) as $y) {
        if (in_array((int) $y, $removed, true)) { continue; }
        $inst = $installed[$y] ?? null;
        if ($y >= $maxY || ($inst && !$inst['full'] && ($inst['months'] || $inst['quarters']))) { $years[] = (int) $y; }
    }
    return insee_maj_plan($catalog, $installed, $years);
}

/* ─── le travail en cours ─── */

function insee_maj_item_path(array $item): string
{
    return insee_maj_dir() . '/' . preg_replace('/[^A-Za-z0-9._-]/', '_', (string) $item['name']);
}

/** L'avancée, pour la barre : fichiers faits / total, Mo reçus / à recevoir, travail fait (téléchargé + rangé) / total */
function insee_maj_progress(?array $job): ?array
{
    if (!$job) { return null; }
    $items = $job['items'] ?? [];
    $done = 0; $work = 0; $workDone = 0; $mb = 0; $mbDone = 0;
    foreach ($items as $i => $it) {
        $size = max(1, (int) $it['size']);
        $work += 2 * $size; $mb += (int) $it['size'];
        if (in_array($it['state'], ['done', 'skipped'], true)) { $done++; $workDone += 2 * $size; $mbDone += (int) $it['size']; continue; }
        if ($i === (int) ($job['idx'] ?? 0)) {
            $ph = (string) ($job['phase'] ?? 'download');
            $recv = min($size, (int) ($job['received'] ?? 0));
            $workDone += $ph === 'download' ? $recv : ($ph === 'import' ? $size + min($size, (int) ($job['offset'] ?? 0)) : 2 * $size);
            $mbDone += $ph === 'download' ? $recv : (int) $it['size'];
        }
    }
    $cur = $items[(int) ($job['idx'] ?? 0)] ?? null;
    return ['status' => (string) $job['status'], 'total' => count($items), 'done' => $done, 'work_total' => $work, 'work_done' => $workDone,
        'bytes_total' => $mb, 'bytes_done' => $mbDone, 'error' => (string) ($job['error'] ?? ''), 'rows' => (int) ($job['rows_total'] ?? 0),
        'current' => $cur ? ['label' => $cur['label'], 'phase' => (string) ($job['phase'] ?? 'download'), 'size' => (int) $cur['size'], 'replaces' => !empty($cur['replaces'])] : null,
        'items' => array_map(static fn($it) => ['key' => $it['key'], 'label' => $it['label'], 'state' => $it['state'], 'size' => (int) $it['size']], $items)];
}

/** GET insee_maj_status [check=1 : relire la liste sur data.gouv.fr] → ce qui est installé, le travail en cours, ce qui est en ligne */
function insee_maj_status(PDO $pdo, array $q): array
{
    $kiosk = function_exists('kiosk_state') && kiosk_state()['on'];
    $job = insee_maj_kv_get($pdo, 'job');
    $installed = insee_maj_installed($pdo, (int) ($job['import_id'] ?? 0));
    $years = []; $rows = 0; $last = '';
    foreach ($installed as $y => $i) {
        $rows += $i['rows']; $last = max($last, $i['imported_at']);
        $months = array_keys($i['months']); sort($months);
        $quarters = array_keys($i['quarters']); sort($quarters);
        $years[] = ['year' => $y, 'full' => $i['full'], 'months' => $months, 'quarters' => $quarters, 'rows' => $i['rows'], 'bytes' => $i['rows'] * INSEE_MAJ_ROW_BYTES, 'imported_at' => $i['imported_at']];
    }
    $listingError = '';
    $listing = null;
    try { $listing = insee_maj_listing(!empty($q['check']), !$kiosk); }
    catch (Throwable $e) { $listingError = $e->getMessage(); try { $listing = insee_maj_listing(false, false); } catch (Throwable $_) {} }
    $online = null;
    if ($listing) {
        $catalog = insee_maj_catalog($listing['resources']);
        $avail = [];
        foreach ($catalog as $y => $files) {
            $plan = insee_maj_plan([$y => $files], [], null); // l'année entière, comme si rien n'était installé
            $size = array_sum(array_map(static fn($f) => $f['size'], $plan));
            $todo = insee_maj_plan([$y => $files], $installed, null);
            $avail[] = ['year' => (int) $y, 'size' => $size, 'bytes' => (int) round($size / INSEE_MAJ_LINE_BYTES * INSEE_MAJ_ROW_BYTES), 'rows' => (int) round($size / INSEE_MAJ_LINE_BYTES),
                'complete' => (bool) array_filter($files, static fn($f) => !$f['month'] && !$f['quarter']),
                'months' => array_values(array_map(static fn($f) => $f['month'], array_filter($files, static fn($f) => $f['month']))),
                'todo_size' => array_sum(array_map(static fn($f) => $f['size'], $todo)), 'todo' => count($todo)];
        }
        $updates = insee_maj_updates($pdo, $catalog, $installed);
        $all = insee_maj_plan($catalog, $installed, null);
        $online = ['checked_at' => (string) $listing['checked_at'], 'years' => $avail,
            'updates' => array_map(static fn($f) => ['key' => $f['key'], 'label' => $f['label'], 'size' => $f['size'], 'replaces' => $f['replaces']], $updates),
            'missing' => count($all), 'missing_size' => array_sum(array_map(static fn($f) => $f['size'], $all)),
            'files' => array_values(array_merge(...array_values(array_map('array_values', $catalog)) ?: [[]]))];
    }
    $free = @disk_free_space(is_dir(insee_maj_dir()) ? insee_maj_dir() : DATA_DIR);
    return ['installed' => ['years' => $years, 'rows' => $rows, 'bytes' => $rows * INSEE_MAJ_ROW_BYTES, 'last_update' => $last],
        'job' => insee_maj_progress($job), 'online' => $online, 'online_error' => $listingError, 'free_bytes' => $free === false ? null : (int) $free,
        'scope' => insee_maj_kv_get($pdo, 'scope'), 'kiosk' => $kiosk, 'row_bytes' => INSEE_MAJ_ROW_BYTES, 'line_bytes' => INSEE_MAJ_LINE_BYTES,
        'source' => 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/'];
}

/** Un verrou : une seule fenêtre de l'app fait avancer le travail à la fois */
function insee_maj_lock(): mixed
{
    $fh = fopen(insee_maj_dir(true) . '/.verrou', 'c');
    if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) { return null; }
    return $fh;
}

/**
 * POST insee_maj_start {years: 'all' | [1970, …] | 'updates', keys?: [périodes]} → le travail commence (ou s'ajoute à celui
 * qui est en cours). Refusé s'il n'y a pas assez de place sur le disque (la place qu'il faut est dite).
 */
function insee_maj_start(PDO $pdo, array $data): array
{
    $mode = $data['years'] ?? 'all';
    try { $listing = insee_maj_listing(true, true); }
    catch (Throwable $e) { $listing = insee_maj_listing(false, true); if (!$listing) { throw $e; } } // hors ligne : la liste gardée
    $catalog = insee_maj_catalog($listing['resources']);
    $job = insee_maj_kv_get($pdo, 'job');
    $installed = insee_maj_installed($pdo, (int) ($job['import_id'] ?? 0));
    $keys = is_array($data['keys'] ?? null) ? array_values(array_filter(array_map('strval', $data['keys']))) : null;
    if ($mode === 'updates') { $plan = insee_maj_updates($pdo, $catalog, $installed); }
    else {
        $years = $mode === 'all' ? null : array_values(array_unique(array_map('intval', (array) $mode)));
        $plan = insee_maj_plan($catalog, $installed, $years, $keys);
        // ce que la personne a choisi : suivi des mises à jour, années retirées remises
        if ($keys === null) {
            $scope = insee_maj_kv_get($pdo, 'scope');
            insee_maj_kv_set($pdo, 'scope', $years === null || $scope === 'all' ? 'all' : array_values(array_unique(array_merge(is_array($scope) ? array_map('intval', $scope) : [], $years))));
            $removed = array_map('intval', (array) (insee_maj_kv_get($pdo, 'removed') ?? []));
            insee_maj_kv_set($pdo, 'removed', $years === null ? null : array_values(array_diff($removed, $years)));
        }
    }
    $active = $job && in_array($job['status'], ['running', 'paused', 'error'], true);
    $have = $active ? array_column($job['items'], 'key') : [];
    $new = array_values(array_filter($plan, static fn($f) => !in_array($f['key'], $have, true)));
    if (!$new && !$active) { return ['ok' => true, 'nothing' => true, 'job' => null]; }
    // la place : les lignes rangées dans la base + le plus gros fichier téléchargé à la fois
    $need = 0; $biggest = 0;
    foreach ($new as $f) { $need += (int) round($f['size'] / INSEE_MAJ_LINE_BYTES * INSEE_MAJ_ROW_BYTES); $biggest = max($biggest, $f['size']); }
    $need += $biggest;
    $free = @disk_free_space(insee_maj_dir(true));
    if ($free !== false && $need > $free && empty($data['ignore_space'])) {
        throw new RuntimeException(i18n_t('Pas assez de place sur le disque : il faut environ {need}, il reste {free}. Choisis moins d’années (« Seulement certaines années… ») ou libère de la place.',
            ['need' => insee_maj_human((int) $need), 'free' => insee_maj_human((int) $free)]));
    }
    $items = array_map(static fn($f) => ['key' => $f['key'], 'label' => $f['label'], 'name' => $f['name'], 'url' => $f['url'], 'format' => $f['format'],
        'size' => (int) $f['size'], 'sha1' => $f['sha1'], 'year' => $f['year'], 'month' => $f['month'], 'quarter' => $f['quarter'], 'replaces' => (bool) $f['replaces'], 'state' => 'todo'], $new);
    if ($active) { $job['items'] = array_merge($job['items'], $items); $job['status'] = 'running'; $job['error'] = ''; }
    else { $job = ['status' => 'running', 'created_at' => date('c'), 'items' => $items, 'idx' => 0, 'phase' => 'download', 'received' => 0, 'offset' => 0,
        'import_id' => 0, 'rows' => 0, 'rows_total' => 0, 'tries' => 0, 'error' => '', 'kind' => $mode === 'updates' ? 'updates' : 'install']; }
    insee_maj_kv_set($pdo, 'job', $job);
    return ['ok' => true, 'added' => count($items), 'need_bytes' => $need, 'job' => insee_maj_progress($job)];
}

function insee_maj_human(int $bytes): string
{
    return $bytes >= 1073741824 ? str_replace('.', ',', (string) round($bytes / 1073741824, 1)) . ' Go' : max(1, (int) round($bytes / 1048576)) . ' Mo';
}

/** POST insee_maj_pause / insee_maj_resume */
function insee_maj_set_status(PDO $pdo, string $status): array
{
    $job = insee_maj_kv_get($pdo, 'job');
    if (!$job) { return ['ok' => true, 'job' => null]; }
    if (in_array($job['status'], ['running', 'paused', 'error'], true)) { $job['status'] = $status; if ($status === 'running') { $job['error'] = ''; $job['tries'] = 0; } insee_maj_kv_set($pdo, 'job', $job); }
    return ['ok' => true, 'job' => insee_maj_progress($job)];
}

/** POST insee_maj_cancel → abandonne ; ce qui était à moitié rangé est retiré (par lots : rappeler tant que completed=false) */
function insee_maj_cancel(PDO $pdo): array
{
    $job = insee_maj_kv_get($pdo, 'job');
    if (!$job) { return ['ok' => true, 'completed' => true]; }
    $lock = insee_maj_lock();
    if (!$lock) { $job['status'] = 'paused'; insee_maj_kv_set($pdo, 'job', $job); return ['ok' => true, 'completed' => false, 'busy' => true]; }
    $job['status'] = 'paused'; insee_maj_kv_set($pdo, 'job', $job);
    $id = ($job['phase'] ?? '') === 'import' ? (int) ($job['import_id'] ?? 0) : 0; // un fichier fini (phase « cleanup ») reste installé
    if ($id) {
        $pdo->prepare('DELETE FROM insee_deces WHERE id IN (SELECT id FROM insee_deces WHERE source_import_id=? LIMIT 20000)')->execute([$id]);
        $left = $pdo->prepare('SELECT 1 FROM insee_deces WHERE source_import_id=? LIMIT 1'); $left->execute([$id]);
        if ($left->fetchColumn()) { return ['ok' => true, 'completed' => false]; }
        $pdo->prepare('DELETE FROM insee_deces_imports WHERE id=?')->execute([$id]);
    }
    foreach (glob(insee_maj_dir() . '/*') ?: [] as $f) { if (basename($f) !== 'liste.json' && is_file($f) && basename($f) !== '.verrou') { @unlink($f); } }
    insee_maj_kv_set($pdo, 'job', null);
    return ['ok' => true, 'completed' => true];
}

/**
 * POST insee_maj_step → avance le travail pendant ~8 secondes au plus, puis rend l'avancée.
 * {busy: true} si une autre fenêtre est déjà dessus ; {wait: secondes} après une coupure de connexion.
 */
function insee_maj_step(PDO $pdo): array
{
    @set_time_limit(120);
    $job = insee_maj_kv_get($pdo, 'job');
    if (!$job || $job['status'] !== 'running') { return ['ok' => true, 'job' => insee_maj_progress($job)]; }
    $lock = insee_maj_lock();
    if (!$lock) { return ['ok' => true, 'busy' => true, 'job' => insee_maj_progress($job)]; }
    $deadline = microtime(true) + insee_maj_budget();
    $wait = 0;
    try {
        do { // au moins un petit pas à chaque appel
            $item = $job['items'][$job['idx']] ?? null;
            if (!$item) { $job['status'] = 'done'; $job['finished_at'] = date('c'); break; }
            if ($job['phase'] === 'download') { $wait = insee_maj_do_download($pdo, $job, $deadline); if ($wait) { break; } }
            elseif ($job['phase'] === 'import') { insee_maj_do_import($pdo, $job, $deadline); }
            elseif ($job['phase'] === 'cleanup') { insee_maj_do_cleanup($pdo, $job, $deadline); }
        } while (microtime(true) < $deadline && $job['status'] === 'running');
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        $job = insee_maj_kv_get($pdo, 'job') ?? $job; // l'avancée sûre est celle de la base
        $job['status'] = 'error'; $job['error'] = $e->getMessage();
    }
    if ($job['status'] === 'done') {
        foreach (glob(insee_maj_dir() . '/*') ?: [] as $f) { if (is_file($f) && !in_array(basename($f), ['liste.json', '.verrou'], true)) { @unlink($f); } }
        $summary = ['finished_at' => date('c'), 'rows' => (int) $job['rows_total'], 'files' => count(array_filter($job['items'], static fn($i) => $i['state'] === 'done')), 'kind' => $job['kind'] ?? 'install',
            'labels' => array_values(array_map(static fn($i) => $i['label'], array_filter($job['items'], static fn($i) => $i['state'] === 'done')))];
        insee_maj_kv_set($pdo, 'last_run', $summary);
        insee_maj_kv_set($pdo, 'job', null);
        return ['ok' => true, 'finished' => $summary, 'job' => insee_maj_progress($job)];
    }
    insee_maj_kv_set($pdo, 'job', $job);
    return ['ok' => true, 'wait' => $wait, 'job' => insee_maj_progress($job)];
}

/** fichier suivant */
function insee_maj_next(array &$job, string $state): void
{
    $item = $job['items'][$job['idx']];
    @unlink(insee_maj_item_path($item)); @unlink(insee_maj_item_path($item) . '.part'); @unlink(insee_maj_item_path($item) . '.lu');
    $job['items'][$job['idx']]['state'] = $state;
    $job['items'][$job['idx']]['rows'] = (int) ($job['rows'] ?? 0);
    $job['idx']++;
    $job['phase'] = 'download'; $job['received'] = 0; $job['offset'] = 0; $job['import_id'] = 0; $job['rows'] = 0; $job['tries'] = 0; $job['fmt'] = null;
}

/** Télécharge la suite du fichier en cours. Rend un nombre de secondes à attendre (connexion coupée) ou 0. */
function insee_maj_do_download(PDO $pdo, array &$job, float $deadline): int
{
    $item = $job['items'][$job['idx']];
    if ((int) $job['received'] === 0) { // déjà là ? (installé entre-temps, ou remplacé par le fichier de l'année)
        $inst = insee_maj_installed($pdo)[$item['year']] ?? null;
        $p = insee_file_period($item['name']);
        $there = $inst && ($inst['full'] || ($p && $p['month'] && !empty($inst['months'][$p['month']])) || ($p && $p['quarter'] && !empty($inst['quarters'][$p['quarter']])));
        if ($there) { insee_maj_next($job, 'skipped'); return 0; }
    }
    $path = insee_maj_item_path($item);
    $part = $path . '.part';
    $have = is_file($part) ? (int) filesize($part) : 0; // le début déjà reçu (écrit dans l'ordre : toujours bon à garder)
    $size = (int) $item['size'];
    $complete = $size > 0 && $have >= $size;
    if (!$complete) {
        $test = insee_maj_test_dir();
        if ($test !== '') { // essais : le fichier vient d'un dossier local, par morceaux
            if (getenv('LCNDA_TEST_INSEE_OFFLINE') === '1') { $job['error'] = i18n_t('Pas de connexion : on réessaie dans un moment.'); return 5; }
            $src = $test . '/' . basename($item['name']);
            if (!is_file($src)) { throw new RuntimeException(i18n_t('Fichier introuvable sur data.gouv.fr : {name}', ['name' => $item['name']])); }
            $chunk = max(1, (int) (getenv('LCNDA_TEST_INSEE_CHUNK') ?: 1 << 24));
            $in = fopen($src, 'rb'); fseek($in, $have); $buf = (string) fread($in, $chunk); fclose($in);
            file_put_contents($part, $buf, FILE_APPEND);
            $have += strlen($buf);
            $complete = $buf === '' || $have >= ($size ?: filesize($src));
        } else {
            $out = fopen($part, 'ab');
            $got = 0;
            [$code, $err] = insee_maj_http($item['url'], static function ($chunk, $code) use ($out, &$got, &$have, $deadline, $part) {
                if ($code === 200 && $have > 0 && $got === 0) { ftruncate($out, 0); $have = 0; } // le serveur renvoie tout depuis le début
                fwrite($out, $chunk); $got += strlen($chunk); $have += strlen($chunk);
                return microtime(true) < $deadline;
            }, $have, 60);
            fclose($out);
            clearstatcache(true, $part);
            $have = (int) filesize($part);
            if ($code === 416) { $complete = true; }
            elseif ($code !== 200 && $code !== 206) {
                if ($code === 404 || $code === 410) { throw new RuntimeException(i18n_t('Ce fichier n’est plus sur data.gouv.fr ({name}) : vérifie la liste, puis recommence.', ['name' => $item['name']])); }
                $job['received'] = $have; $job['tries'] = (int) ($job['tries'] ?? 0) + 1;
                $job['error'] = $err !== '' ? i18n_t('Connexion coupée ({err}) : on réessaie dans un moment.', ['err' => $err]) : i18n_t('data.gouv.fr répond {code} : on réessaie dans un moment.', ['code' => (string) $code]);
                return min(300, 10 * (2 ** min(5, $job['tries'] - 1)));
            } elseif ($err !== '' && $got === 0) {
                $job['received'] = $have; $job['tries'] = (int) ($job['tries'] ?? 0) + 1;
                $job['error'] = i18n_t('Connexion coupée ({err}) : on réessaie dans un moment.', ['err' => $err]);
                return min(300, 10 * (2 ** min(5, $job['tries'] - 1)));
            } else { $complete = $size > 0 ? $have >= $size : ($err === '' && microtime(true) < $deadline); }
        }
    }
    $job['received'] = $have; $job['error'] = '';
    if (!$complete) { return 0; }
    // vérifié : la taille, et l'empreinte quand data.gouv.fr la donne ; un fichier abîmé est retéléchargé (deux fois au plus)
    $bad = ($size > 0 && $have !== $size) || ($item['sha1'] !== '' && strtolower((string) sha1_file($part)) !== strtolower($item['sha1']));
    if ($bad) {
        @unlink($part); $job['received'] = 0; $job['bad'] = (int) ($job['bad'] ?? 0) + 1;
        if ($job['bad'] > 2) { $job['bad'] = 0; throw new RuntimeException(i18n_t('Le fichier « {name} » arrive abîmé à chaque fois : réessaie plus tard.', ['name' => $item['name']])); }
        return 0;
    }
    $job['bad'] = 0;
    rename($part, $path);
    if ($item['format'] === 'zip') { // le .txt ou le .csv qu'il contient
        if (!class_exists('ZipArchive')) { throw new RuntimeException(i18n_t("Import ZIP impossible : l'extension PHP ZipArchive n'est pas disponible.")); }
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) { throw new RuntimeException(i18n_t('Archive ZIP illisible')); }
        $entry = '';
        for ($i = 0; $i < $zip->numFiles; $i++) { $n = (string) $zip->getNameIndex($i); if (preg_match('/\.(csv|txt)$/i', $n)) { $entry = $n; break; } }
        if ($entry === '') { $zip->close(); throw new RuntimeException(i18n_t('Aucun fichier .csv ou .txt trouvé dans le ZIP')); }
        $in = $zip->getStream($entry); $out = fopen($path . '.lu', 'wb'); stream_copy_to_stream($in, $out); fclose($in); fclose($out); $zip->close();
        @unlink($path); rename($path . '.lu', $path);
    }
    $job['phase'] = 'import'; $job['offset'] = 0; $job['import_id'] = 0; $job['rows'] = 0; $job['fmt'] = null;
    return 0;
}

/** Une ligne du fichier → les 9 champs du fichier des décès (positions fixes, ou CSV ; $map : colonnes du CSV) */
function insee_maj_cells(string $line, array $fmt): array
{
    if ($fmt['type'] === 'fixed') {
        if (!mb_check_encoding($line, 'UTF-8')) { $line = mb_convert_encoding($line, 'UTF-8', 'ISO-8859-1'); }
        $byChars = strlen($line) > 176 && mb_strlen($line) <= 176;
        $cells = []; $pos = 0;
        foreach ([80, 1, 8, 5, 30, 30, 8, 5, 9] as $w) { $cells[] = trim($byChars ? mb_substr($line, $pos, $w) : substr($line, $pos, $w)); $pos += $w; }
        return ['nomprenom' => $cells[0], 'sexe' => $cells[1], 'datenaiss' => $cells[2], 'lieunaiss' => $cells[3], 'commnaiss' => $cells[4], 'paysnaiss' => $cells[5],
            'datedeces' => $cells[6], 'lieudeces' => $cells[7], 'commdeces' => '', 'actedeces' => $cells[8]];
    }
    if (!mb_check_encoding($line, 'UTF-8')) { $line = mb_convert_encoding($line, 'UTF-8', 'ISO-8859-1'); }
    $row = str_getcsv($line, $fmt['sep'], '"', '');
    $out = [];
    foreach ($fmt['map'] as $field => $i) { $out[$field] = trim((string) ($row[$i] ?? '')); }
    return $out + ['commdeces' => ''];
}

/** Range des lignes du fichier en cours, par paquets de 2 000, l'avancée notée avec chaque paquet. */
function insee_maj_do_import(PDO $pdo, array &$job, float $deadline): void
{
    $item = $job['items'][$job['idx']];
    $path = insee_maj_item_path($item);
    if (!is_file($path)) { $job['phase'] = 'download'; $job['received'] = 0; return; } // fichier perdu : retéléchargé
    $fh = fopen($path, 'rb');
    if (empty($job['fmt'])) {
        $first = (string) fgets($fh);
        $first = preg_replace('/^\xEF\xBB\xBF/', '', $first) ?? $first;
        $semi = substr_count($first, ';'); $comma = substr_count($first, ',');
        if ($semi >= 5 || $comma >= 5) {
            $sep = $semi >= $comma ? ';' : ',';
            $head = array_map(static fn($h) => preg_replace('/[^a-z]/', '', strtolower((string) $h)), str_getcsv(trim($first), $sep, '"', ''));
            $names = ['nomprenom', 'sexe', 'datenaiss', 'lieunaiss', 'commnaiss', 'paysnaiss', 'datedeces', 'lieudeces', 'commdeces', 'actedeces'];
            if (in_array('nomprenom', $head, true)) { $map = []; foreach ($names as $n) { $i = array_search($n, $head, true); if ($i !== false) { $map[$n] = $i; } } $start = strlen($first); }
            else { $map = count($head) >= 10 ? array_flip($names) : array_flip(array_values(array_diff($names, ['commdeces']))); $start = 0; }
            $job['fmt'] = ['type' => 'csv', 'sep' => $sep, 'map' => $map];
        } else { $job['fmt'] = ['type' => 'fixed']; $start = 0; }
        $job['offset'] = $start;
    }
    if (!$job['import_id']) {
        $pdo->beginTransaction();
        $pdo->prepare("INSERT INTO insee_deces_imports(filename,row_count,inserted_count,max_annee_deces,min_annee_deces,file_hash) VALUES (?,0,0,NULL,NULL,'')")->execute([$item['name']]);
        $job['import_id'] = (int) $pdo->lastInsertId(); $job['rows'] = 0; $job['miny'] = null; $job['maxy'] = null;
        insee_maj_kv_set($pdo, 'job', $job);
        $pdo->commit();
    }
    $insert = $pdo->prepare('INSERT INTO insee_deces
        (nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces,source_file,source_import_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $year = static function (string $d): ?int { $g = preg_replace('/\D/', '', $d) ?? ''; if (strlen($g) >= 4) { $y = (int) substr($g, 0, 4); if ($y >= 1700 && $y <= 2200) { return $y; } } return null; };
    $batch = max(1, (int) (insee_maj_test_dir() !== '' ? (getenv('LCNDA_TEST_INSEE_LINES') ?: 2000) : 2000));
    fseek($fh, (int) $job['offset']);
    $eof = false;
    do {
        $pdo->beginTransaction();
        for ($n = 0; $n < $batch; $n++) {
            $line = fgets($fh);
            if ($line === false) { $eof = true; break; }
            $line = rtrim($line, "\r\n");
            if (trim($line) === '') { continue; }
            $c = insee_maj_cells($line, $job['fmt']);
            // comme l'import à la main : NOM*PRÉNOMS/ séparés, le premier prénom à part
            $raw = rtrim(trim($c['nomprenom'] ?? ''), '/');
            $parts = explode('*', $raw, 2);
            $nom = trim($parts[0] ?? ''); $prenoms = trim($parts[1] ?? '');
            $list = array_values(array_filter(array_map('trim', preg_split('/[\/,]+/', $prenoms) ?: [])));
            $sx = $c['sexe'] ?? '';
            $sexe = $sx === '1' ? 'M' : ($sx === '2' ? 'F' : strtoupper(substr($sx, 0, 1)));
            $yn = $year($c['datenaiss'] ?? ''); $yd = $year($c['datedeces'] ?? '');
            if ($yd !== null) { $job['maxy'] = max($job['maxy'] ?? $yd, $yd); $job['miny'] = min($job['miny'] ?? $yd, $yd); }
            $insert->execute([$nom, $list[0] ?? $prenoms, $prenoms, $sexe, $c['datenaiss'] ?? '', $yn, $c['lieunaiss'] ?? '', $c['commnaiss'] ?? '', $c['paysnaiss'] ?? '',
                $c['datedeces'] ?? '', $yd, $c['lieudeces'] ?? '', $c['commdeces'] ?? '', $c['actedeces'] ?? '', $item['name'], $job['import_id']]);
            $job['rows']++;
        }
        $job['offset'] = $eof ? (int) filesize($path) : (int) ftell($fh);
        if ($eof) { // fini : le journal de l'import complété, avec l'empreinte du fichier (le même fichier choisi à la main sera reconnu)
            $pdo->prepare('UPDATE insee_deces_imports SET row_count=?, inserted_count=?, max_annee_deces=?, min_annee_deces=?, file_hash=?, imported_at=CURRENT_TIMESTAMP WHERE id=?')
                ->execute([$job['rows'], $job['rows'], $job['maxy'], $job['miny'], (string) hash_file('sha256', $path), $job['import_id']]);
            $job['rows_total'] = (int) ($job['rows_total'] ?? 0) + $job['rows'];
            if (!empty($item['replaces']) || (!$item['month'] && !$item['quarter'])) { $job['phase'] = 'cleanup'; }
            else { insee_maj_next($job, 'done'); }
        }
        insee_maj_kv_set($pdo, 'job', $job);
        $pdo->commit();
    } while (!$eof && microtime(true) < $deadline);
    fclose($fh);
}

/** Après le fichier d'une année : les mois et trimestres de cette année (déjà dans le fichier de l'année) sont retirés, par lots. */
function insee_maj_do_cleanup(PDO $pdo, array &$job, float $deadline): void
{
    $item = $job['items'][$job['idx']];
    $old = [];
    foreach ($pdo->query('SELECT id, filename FROM insee_deces_imports') as $r) {
        if ((int) $r['id'] === (int) $job['import_id']) { continue; }
        $p = insee_file_period(strtolower(trim(explode(' / ', (string) $r['filename'])[0])));
        if ($p && $p['year'] === (int) $item['year'] && ($p['month'] || $p['quarter'])) { $old[(int) $r['id']] = (string) $r['filename']; }
    }
    $first = true;
    while ($old && ($first || microtime(true) < $deadline)) {
        $first = false;
        $id = array_key_first($old);
        $del = $pdo->prepare('DELETE FROM insee_deces WHERE id IN (SELECT id FROM insee_deces WHERE source_import_id=? LIMIT 20000)'); $del->execute([$id]);
        if ($del->rowCount() > 0) { continue; }
        $leg = $pdo->prepare('DELETE FROM insee_deces WHERE id IN (SELECT id FROM insee_deces WHERE source_file=? AND source_import_id IS NULL LIMIT 20000)'); $leg->execute([$old[$id]]);
        if ($leg->rowCount() > 0) { continue; }
        $pdo->prepare('DELETE FROM insee_deces_imports WHERE id=?')->execute([$id]);
        unset($old[$id]);
    }
    if (!$old) { insee_maj_next($job, 'done'); }
}

/**
 * POST insee_maj_remove_year {year} → retire une année (par lots : rappeler tant que completed=false).
 * year=0 : les fichiers importés à la main dont la période n'est pas reconnue.
 */
function insee_maj_remove_year(PDO $pdo, array $data): array
{
    @set_time_limit(120);
    $year = (int) ($data['year'] ?? -1);
    if ($year < 0) { throw new LcndaBadInput('Année manquante.'); }
    $job = insee_maj_kv_get($pdo, 'job');
    if ($job && $job['status'] === 'running') { throw new RuntimeException(i18n_t('Une installation est en cours : mets-la en pause avant de retirer une année.')); }
    $inst = insee_maj_installed($pdo, (int) ($job['import_id'] ?? 0))[$year] ?? null;
    if (!$inst) { return ['ok' => true, 'completed' => true, 'deleted_rows' => 0]; }
    $deadline = microtime(true) + insee_maj_budget();
    $deleted = 0;
    $names = $pdo->prepare('SELECT filename FROM insee_deces_imports WHERE id=?');
    foreach ($inst['ids'] as $id) {
        while (microtime(true) < $deadline) {
            $del = $pdo->prepare('DELETE FROM insee_deces WHERE id IN (SELECT id FROM insee_deces WHERE source_import_id=? LIMIT 20000)'); $del->execute([$id]);
            $n = $del->rowCount();
            if (!$n) { $names->execute([$id]); $leg = $pdo->prepare('DELETE FROM insee_deces WHERE id IN (SELECT id FROM insee_deces WHERE source_file=? AND source_import_id IS NULL LIMIT 20000)'); $leg->execute([(string) $names->fetchColumn()]); $n = $leg->rowCount(); }
            $deleted += $n;
            if (!$n) { $pdo->prepare('DELETE FROM insee_deces_imports WHERE id=?')->execute([$id]); break; }
        }
        if (microtime(true) >= $deadline) { return ['ok' => true, 'completed' => false, 'deleted_rows' => $deleted]; }
    }
    if ($year > 0) { // retirée exprès : les mises à jour ne la remettent pas
        $removed = array_map('intval', (array) (insee_maj_kv_get($pdo, 'removed') ?? []));
        insee_maj_kv_set($pdo, 'removed', array_values(array_unique([...$removed, $year])));
        $scope = insee_maj_kv_get($pdo, 'scope');
        if (is_array($scope)) { insee_maj_kv_set($pdo, 'scope', array_values(array_diff(array_map('intval', $scope), [$year]))); }
    }
    return ['ok' => true, 'completed' => true, 'deleted_rows' => $deleted, 'rows' => $inst['rows']];
}

/** Les écritures (api.php) */
function insee_maj_post(PDO $pdo, string $action, array $data): array
{
    return match ($action) {
        'insee_maj_start' => insee_maj_start($pdo, $data),
        'insee_maj_step' => insee_maj_step($pdo),
        'insee_maj_pause' => insee_maj_set_status($pdo, 'paused'),
        'insee_maj_resume' => insee_maj_set_status($pdo, 'running'),
        'insee_maj_cancel' => insee_maj_cancel($pdo),
        'insee_maj_remove_year' => insee_maj_remove_year($pdo, $data),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
