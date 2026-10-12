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
