<?php
declare(strict_types=1);

/**
 * LCNDA — 🗺️ Cartes en plus (vague 1) : assets/js/heritage-cartes-plus.js (la Carte) et heritage-diagram-cartes-plus.js
 * (Graphiques → Cartes). Mode d'emploi : docs/UI.md (« 🗺️ Cartes en plus »).
 *
 * 1. 🏛 Frontières anciennes — communes disparues ou fusionnées : l'historique officiel des communes de l'INSEE (Code officiel
 *    géographique, Licence Ouverte 2.0) : « événements survenus aux communes depuis 1943 » et « communes depuis 1943 ».
 *    Téléchargés UNE fois sur demande (Réglages → Cartes : frontières anciennes), rangés dans SHARED_DATA_DIR/frontieres
 *    (commun à toutes les généalogies, comme les packs météo), puis tout est hors ligne. Empreinte : celle publiée par
 *    data.gouv.fr quand elle existe, sinon la nôtre (sha256) gardée dans manifest.json ; en-têtes des fichiers vérifiés.
 *    Les noms d'avant (communes disparues, anciens noms) s'ajoutent aux autres noms des communes d'aujourd'hui (places.
 *    alternate_names) pour que le menu de choix des lieux les trouve (« anc. « … » ») ; retirés avec les fichiers.
 *    Les provinces d'Ancien Régime et les départements de 1790 sont dessinés dans le navigateur d'après les départements
 *    livrés (approximation affichée comme telle) : aucune source libre et officielle de leurs contours n'a été trouvée.
 *    GET  frontieres_status, frontieres_remote (adresses et tailles annoncées), frontieres_communes (&w&s&e&n, &code)
 *    POST frontieres_download, frontieres_remove, frontieres_restore, frontieres_apply
 * 2. Les données des cartes de Graphiques (lecture seule ; jamais un vivant ni une fiche confidentielle) :
 *    GET cartes_plus&what=surnames|surname|heat|dna|research
 * Essais : LCNDA_FRONTIERES_DIR (dossier), LCNDA_FRONTIERES_SOURCES (JSON {mvt: {url}, com: {url}} : file://… autorisé).
 */

const CP_FRONT_VERSION = 1;
const CP_FRONT_MAX_BYTES = 60 * 1024 * 1024; // un fichier de l'INSEE fait quelques Mo : au-delà, ce n'est pas lui
const CP_FRONT_DATASET = 'https://www.data.gouv.fr/api/1/datasets/code-officiel-geographique-cog/';
/** les deux fichiers : clé => [nom, colonnes obligatoires, mots du titre sur data.gouv.fr, adresses de secours] */
function cp_front_files(): array
{
    return [
        'mvt' => ['label' => 'Événements survenus aux communes depuis 1943 (INSEE)', 'cols' => ['MOD', 'DATE_EFF', 'TYPECOM_AV', 'COM_AV', 'LIBELLE_AV', 'TYPECOM_AP', 'COM_AP', 'LIBELLE_AP'],
            'match' => ['/v_mvt_commune/i', '/(é|e)v(é|e)nements.*communes.*1943/iu'],
            'fallback' => ['https://www.insee.fr/fr/statistiques/fichier/8377162/v_mvt_commune_2025.csv', 'https://www.insee.fr/fr/statistiques/fichier/7766585/v_mvt_commune_2024.csv']],
        'com' => ['label' => 'Communes depuis 1943 (INSEE)', 'cols' => ['COM', 'LIBELLE', 'DATE_DEBUT', 'DATE_FIN'],
            'match' => ['/v_commune_depuis_1943/i', '/communes.*depuis.*1943/iu'],
            'fallback' => ['https://www.insee.fr/fr/statistiques/fichier/8377162/v_commune_depuis_1943_2025.csv', 'https://www.insee.fr/fr/statistiques/fichier/7766585/v_commune_depuis_1943_2024.csv']],
    ];
}

/** 📦 les fichiers de l'INSEE livrés avec l'app (data/reference/frontieres, Licence Ouverte 2.0) : installés tout seuls, sans Internet */
function cp_front_bundled(): ?array
{
    $d = APP_ROOT . '/data/reference/frontieres';
    $sums = @file($d . '/SHA256SUMS', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$sums) { return null; }
    $out = [];
    foreach ($sums as $l) {
        if (preg_match('/^([0-9a-f]{64})\s+\*?(mvt|com)\.csv$/', trim($l), $m) && is_file($d . '/' . $m[2] . '.csv')) {
            $out[$m[2]] = ['url' => 'file://' . $d . '/' . $m[2] . '.csv', 'size' => (int) filesize($d . '/' . $m[2] . '.csv'), 'checksum' => ['type' => 'sha256', 'value' => $m[1]], 'from' => 'LCNDA (fichiers livrés avec l’app)'];
        }
    }
    return isset($out['mvt'], $out['com']) ? $out : null;
}

function cp_front_dir(): string
{
    $d = (string) (getenv('LCNDA_FRONTIERES_DIR') ?: SHARED_DATA_DIR . '/frontieres');
    return rtrim($d, '/\\');
}

function cp_front_manifest(): array
{
    $raw = @file_get_contents(cp_front_dir() . '/manifest.json');
    $m = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($m) && is_array($m['files'] ?? null) ? $m : ['files' => []];
}

function cp_front_installed(): bool
{
    $m = cp_front_manifest();
    return isset($m['files']['mvt'], $m['files']['com']) && is_file(cp_front_dir() . '/communes-anciennes.json');
}

/** les communes anciennes déjà calculées (fichier partagé), gardées en mémoire pour la requête */
function cp_front_records(): array
{
    static $memo = null;
    if ($memo !== null) { return $memo; }
    $raw = @file_get_contents(cp_front_dir() . '/communes-anciennes.json');
    $d = is_string($raw) ? json_decode($raw, true) : null;
    return $memo = is_array($d) && is_array($d['records'] ?? null) ? $d : ['records' => [], 'version' => 0];
}

/** les adresses : celles d'un essai, sinon celles que publie data.gouv.fr (avec taille et empreinte), sinon les adresses de secours */
function cp_front_sources(bool $network = true): array
{
    $env = getenv('LCNDA_FRONTIERES_SOURCES');
    if ($env) {
        $j = json_decode((string) $env, true);
        if (is_array($j)) {
            $out = [];
            foreach (cp_front_files() as $k => $f) { if (!empty($j[$k]['url'])) { $out[$k] = ['url' => (string) $j[$k]['url'], 'size' => isset($j[$k]['size']) ? (int) $j[$k]['size'] : null, 'checksum' => $j[$k]['checksum'] ?? null, 'from' => 'essai']; } }
            return $out;
        }
    }
    if ($b = cp_front_bundled()) { return $b; } // livrés avec l'app : rien à télécharger
    $out = [];
    if ($network) {
        $res = cp_http_get(CP_FRONT_DATASET, 3 * 1024 * 1024, 20);
        $d = $res['ok'] ? json_decode($res['body'], true) : null;
        foreach (is_array($d['resources'] ?? null) ? $d['resources'] : [] as $r) {
            $title = (string) ($r['title'] ?? ''); $url = (string) ($r['url'] ?? '');
            if (!preg_match('~^https://~', $url) || !preg_match('/csv/i', (string) ($r['format'] ?? '') . $url)) { continue; }
            foreach (cp_front_files() as $k => $f) {
                if (isset($out[$k])) { continue; }
                foreach ($f['match'] as $re) {
                    if (preg_match($re, $title) || preg_match($re, basename(parse_url($url, PHP_URL_PATH) ?: ''))) {
                        $sum = is_array($r['checksum'] ?? null) && preg_match('/^(sha1|sha256|md5)$/', (string) ($r['checksum']['type'] ?? '')) ? ['type' => (string) $r['checksum']['type'], 'value' => strtolower((string) $r['checksum']['value'])] : null;
                        $out[$k] = ['url' => $url, 'size' => isset($r['filesize']) && is_numeric($r['filesize']) ? (int) $r['filesize'] : null, 'checksum' => $sum, 'from' => 'data.gouv.fr', 'title' => $title];
                        break;
                    }
                }
            }
        }
    }
    foreach (cp_front_files() as $k => $f) { $out[$k] ??= ['url' => $f['fallback'][0], 'size' => null, 'checksum' => null, 'from' => 'insee.fr', 'alternates' => array_slice($f['fallback'], 1)]; }
    return $out;
}

/** une lecture HTTP bornée (ou file:// pour les essais) */
function cp_http_get(string $url, int $max, int $timeout = 60, ?string $toFile = null, bool $head = false): array
{
    if (str_starts_with($url, 'file://')) {
        $p = substr($url, 7);
        if (!is_file($p)) { return ['ok' => false, 'error' => 'Fichier d’essai introuvable.']; }
        $size = filesize($p);
        if ($head) { return ['ok' => true, 'size' => $size]; }
        if ($size > $max) { return ['ok' => false, 'error' => 'Fichier trop gros.']; }
        if ($toFile !== null) { return @copy($p, $toFile) ? ['ok' => true, 'size' => $size] : ['ok' => false, 'error' => 'Copie impossible.']; }
        return ['ok' => true, 'body' => (string) file_get_contents($p), 'size' => $size];
    }
    if (!preg_match('~^https://~', $url)) { return ['ok' => false, 'error' => 'Adresse refusée.']; }
    if (!function_exists('curl_init')) { return ['ok' => false, 'error' => 'Téléchargement impossible : PHP n’a pas l’extension curl.']; }
    $ch = curl_init($url);
    $got = 0; $body = ''; $out = $toFile !== null ? @fopen($toFile, 'wb') : null;
    if ($toFile !== null && !$out) { return ['ok' => false, 'error' => 'Fichier impossible à écrire.']; }
    curl_setopt_array($ch, [CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_FAILONERROR => true, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => 'LCNDA', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_NOBODY => $head,
        CURLOPT_WRITEFUNCTION => static function ($c, $chunk) use (&$got, &$body, $out, $max) { $got += strlen($chunk); if ($got > $max) { return 0; } if ($out) { fwrite($out, $chunk); } else { $body .= $chunk; } return strlen($chunk); }]
        + (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA') ? [CURLOPT_SSL_OPTIONS => CURLSSLOPT_NATIVE_CA] : []));
    $ok = curl_exec($ch);
    $err = curl_error($ch);
    $len = (int) curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
    curl_close($ch);
    if ($out) { fclose($out); }
    if ($got > $max) { return ['ok' => false, 'error' => 'Fichier trop gros : ce n’est pas celui attendu.']; }
    if (!$ok) { return ['ok' => false, 'error' => 'Téléchargement impossible : ' . ($err ?: 'pas de réponse')]; }
    return ['ok' => true, 'body' => $body, 'size' => $head ? ($len > 0 ? $len : null) : $got];
}

function cp_front_status(PDO $pdo): array
{
    if (!cp_front_installed() && !getenv('LCNDA_FRONTIERES_SOURCES') && cp_front_bundled() && !(glob(cp_front_dir() . '/.trash-*') ?: [])) {
        try { cp_front_download($pdo, false); } catch (Throwable $_) {} // 📦 livrés avec l'app : prêts sans rien faire
    }
    $m = cp_front_manifest(); $rec = cp_front_installed() ? cp_front_records() : ['records' => []];
    $files = [];
    foreach (cp_front_files() as $k => $f) {
        $x = $m['files'][$k] ?? null;
        $files[] = ['key' => $k, 'label' => $f['label'], 'installed' => (bool) $x, 'size' => $x ? (int) $x['size'] : null, 'sha256' => $x ? (string) $x['sha256'] : '',
            'checked' => $x ? (string) ($x['checked'] ?? '') : '', 'url' => $x ? (string) $x['url'] : '', 'date' => $x ? (string) ($x['date'] ?? '') : ''];
    }
    $gone = 0; $renamed = 0;
    foreach ($rec['records'] as $r) { if (($r['k'] ?? '') === 'rename') { $renamed++; } else { $gone++; } }
    $applied = '';
    try { $applied = (string) ($pdo->query("SELECT value FROM meta WHERE key='frontieres_alt_version'")->fetchColumn() ?: ''); } catch (Throwable $_) {}
    $built = (string) ($rec['hash'] ?? '');
    $trash = glob(cp_front_dir() . '/.trash-*') ?: [];
    return ['installed' => cp_front_installed(), 'files' => $files, 'gone' => $gone, 'renamed' => $renamed, 'located' => (int) ($rec['located'] ?? 0),
        'apply_needed' => cp_front_installed() && $applied !== $built, 'date' => (string) ($m['date'] ?? ''), 'licence' => 'Licence Ouverte 2.0 (Etalab) — source : INSEE, Code officiel géographique',
        'can_restore' => (bool) $trash, 'dir_label' => 'dossier des données partagées / frontieres'];
}

/** les adresses et les tailles annoncées (avant de télécharger) : « ⤓ Télécharger les frontières anciennes (N Mo) » */
function cp_front_remote(): array
{
    $src = cp_front_sources(true); $out = []; $total = 0; $known = true;
    foreach ($src as $k => $s) {
        $size = $s['size'];
        if ($size === null) { $h = cp_http_get($s['url'], CP_FRONT_MAX_BYTES, 15, null, true); $size = $h['ok'] ? ($h['size'] ?? null) : null; }
        if ($size === null) { $known = false; } else { $total += $size; }
        $out[] = ['key' => $k, 'label' => cp_front_files()[$k]['label'], 'url' => $s['url'], 'size' => $size, 'from' => $s['from'], 'checksum' => $s['checksum'] ? $s['checksum']['type'] : ''];
    }
    return ['files' => $out, 'total' => $known ? $total : null];
}

/** lit l'en-tête d'un CSV de l'INSEE (virgule ou point-virgule, BOM toléré) */
function cp_csv_open(string $path, array $need): array
{
    $h = @fopen($path, 'rb'); if (!$h) { throw new RuntimeException('Fichier illisible.'); }
    $line = (string) fgets($h);
    $line = preg_replace('/^\xEF\xBB\xBF/', '', $line);
    $sep = substr_count($line, ';') > substr_count($line, ',') ? ';' : ',';
    $head = array_map(static fn($x) => strtoupper(trim((string) $x, " \"\r\n")), str_getcsv($line, $sep, '"', ''));
    foreach ($need as $c) { if (!in_array($c, $head, true)) { fclose($h); throw new RuntimeException('Ce fichier n’a pas les colonnes attendues (' . $c . ' manque) : rien n’a été installé.'); } }
    return [$h, $sep, array_flip($head)];
}

function cp_fold(string $s): string { return function_exists('picker_fold') ? picker_fold($s) : strtolower(trim($s)); }

/** sens des codes « MOD » de l'INSEE */
function cp_mod_label(int $mod): string
{
    return [10 => 'changement de nom', 20 => 'création', 21 => 'rétablissement', 30 => 'suppression', 31 => 'fusion simple', 32 => 'création de commune nouvelle', 33 => 'fusion-association',
        34 => 'fusion-association devenue fusion simple', 35 => 'suppression de commune déléguée', 41 => 'changement de code (département)', 50 => 'changement de code (chef-lieu)', 70 => 'commune associée devenue déléguée'][$mod] ?? 'changement';
}

/**
 * Calcule les communes anciennes à partir des deux fichiers : une ligne par commune disparue (fusionnée, absorbée, supprimée)
 * ou renommée, avec sa date, sa commune d'aujourd'hui (en suivant les fusions suivantes) et une position.
 */
function cp_front_build(PDO $pdo, string $mvtPath, string $comPath): array
{
    // les communes d'aujourd'hui : code => nom (lignes sans date de fin)
    [$h, $sep, $ix] = cp_csv_open($comPath, cp_front_files()['com']['cols']);
    $now = [];
    while (($r = fgetcsv($h, 0, $sep, '"', '')) !== false) {
        if (count($r) < count($ix)) { continue; }
        if (isset($ix['TYPECOM']) && ($r[$ix['TYPECOM']] ?? 'COM') !== 'COM') { continue; }
        if (trim((string) $r[$ix['DATE_FIN']]) === '') { $now[(string) $r[$ix['COM']]] = (string) $r[$ix['LIBELLE']]; }
    }
    fclose($h);
    // les événements
    [$h, $sep, $ix] = cp_csv_open($mvtPath, cp_front_files()['mvt']['cols']);
    $ev = [];
    while (($r = fgetcsv($h, 0, $sep, '"', '')) !== false) {
        if (count($r) < count($ix)) { continue; }
        $g = static fn($k) => trim((string) ($r[$ix[$k]] ?? ''));
        $ev[] = ['mod' => (int) $g('MOD'), 'date' => substr($g('DATE_EFF'), 0, 10), 'tav' => $g('TYPECOM_AV'), 'cav' => $g('COM_AV'), 'lav' => $g('LIBELLE_AV'), 'tap' => $g('TYPECOM_AP'), 'cap' => $g('COM_AP'), 'lap' => $g('LIBELLE_AP')];
        if (count($ev) > 400000) { break; }
    }
    fclose($h);
    usort($ev, static fn($a, $b) => strcmp($a['date'], $b['date']));
    // une commune qui disparaît : ses lignes d'un même jour, la commune d'arrivée (TYPECOM_AP = COM)
    $rec = []; $restored = [];
    foreach ($ev as $e) {
        if ($e['tav'] !== 'COM' || !preg_match('/^\d[\dAB]\d{3}$/', $e['cav'])) { continue; }
        if ($e['mod'] === 21 && $e['tap'] === 'COM') { $restored[$e['cap']][] = $e['date']; continue; }
        $key = $e['cav'] . '|' . $e['date'] . '|' . $e['lav'];
        if ($e['mod'] === 10 && $e['tap'] === 'COM' && $e['lap'] !== '' && cp_fold($e['lap']) !== cp_fold($e['lav'])) {
            $rec[$key] = ['c' => $e['cav'], 'n' => $e['lav'], 'd' => $e['date'], 'k' => 'rename', 'm' => 10, 'tc' => $e['cap'], 'tn' => $e['lap']]; continue;
        }
        if (!in_array($e['mod'], [30, 31, 32, 33, 34], true)) { continue; }
        $cur = $rec[$key] ?? ['c' => $e['cav'], 'n' => $e['lav'], 'd' => $e['date'], 'k' => 'gone', 'm' => $e['mod'], 'tc' => '', 'tn' => '', 'as' => ''];
        if ($e['tap'] === 'COM') {
            if ($e['cap'] === $e['cav'] && cp_fold($e['lap']) === cp_fold($e['lav'])) { continue; } // le chef-lieu garde son nom : il ne disparaît pas
            if ($cur['tc'] === '') { $cur['tc'] = $e['cap']; $cur['tn'] = $e['lap']; }
        } elseif (in_array($e['tap'], ['COMD', 'COMA'], true) && $e['cap'] === $e['cav']) {
            $cur['as'] = $e['tap'] === 'COMD' ? 'déléguée' : 'associée';
        }
        $rec[$key] = $cur;
    }
    $rec = array_values(array_filter($rec, static fn($r) => $r['tc'] !== ''));
    // la commune d'aujourd'hui : on suit les fusions suivantes
    $byCode = [];
    foreach ($rec as $i => $r) { if ($r['k'] === 'gone') { $byCode[$r['c']][] = $i; } }
    foreach ($rec as &$r) {
        $code = $r['tc']; $date = $r['d']; $hops = 0;
        while ($hops++ < 12) {
            $next = null;
            foreach ($byCode[$code] ?? [] as $j) { if (strcmp($rec[$j]['d'], $date) > 0 && ($next === null || strcmp($rec[$j]['d'], $rec[$next]['d']) < 0)) { $next = $j; } }
            if ($next === null) { break; }
            $code = $rec[$next]['tc']; $date = $rec[$next]['d'];
        }
        $r['nc'] = $code; $r['nn'] = $now[$code] ?? $r['tn'];
        foreach ($restored[$r['c']] ?? [] as $d) { if (strcmp($d, $r['d']) > 0) { $r['back'] = $d; break; } }
    }
    unset($r);
    // une position : la commune ancienne gardée comme lieu-dit (même nom, même commune d'aujourd'hui), son ancien contour, sinon le centre de la commune d'aujourd'hui
    $byName = []; $codePos = [];
    try {
        foreach ($pdo->query("SELECT name, admin4_code, admin2_code, latitude, longitude FROM places WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND COALESCE(admin4_code,'')<>'' AND COALESCE(country,'France') IN ('France','') ORDER BY COALESCE(population,0) DESC") as $p) {
            $codePos[(string) $p['admin4_code']] ??= [(float) $p['latitude'], (float) $p['longitude']]; // la commune elle-même (la plus peuplée de ses lignes)
            $byName[cp_fold((string) $p['name']) . '|' . $p['admin4_code']] ??= [(float) $p['latitude'], (float) $p['longitude']];
            $byName[cp_fold((string) $p['name']) . '|d' . $p['admin2_code']] ??= [(float) $p['latitude'], (float) $p['longitude']];
        }
    } catch (Throwable $_) {}
    $centre = [];
    try { foreach ($pdo->query('SELECT insee_code, centroid_lat, centroid_lon FROM commune_contours WHERE centroid_lat IS NOT NULL') as $c) { $centre[(string) $c['insee_code']] = [(float) $c['centroid_lat'], (float) $c['centroid_lon']]; } } catch (Throwable $_) {}
    $located = 0;
    foreach ($rec as &$r) {
        $f = cp_fold($r['n']); $dep = substr($r['c'], 0, 2);
        $pos = $byName[$f . '|' . $r['nc']] ?? $byName[$f . '|' . $r['tc']] ?? ($r['c'] !== $r['nc'] ? ($centre[$r['c']] ?? null) : null) ?? $byName[$f . '|d' . $dep] ?? null;
        $r['approx'] = 0;
        if (!$pos && ($c = $centre[$r['nc']] ?? $codePos[$r['nc']] ?? null)) { $pos = $c; $r['approx'] = 1; }
        if ($pos) { $r['lat'] = round($pos[0], 5); $r['lon'] = round($pos[1], 5); if (!$r['approx']) { $located++; } }
    }
    unset($r);
    return ['version' => CP_FRONT_VERSION, 'records' => $rec, 'located' => $located, 'hash' => substr(hash('sha256', (string) json_encode($rec)), 0, 16)];
}

/** les noms d'avant dans les autres noms des communes d'aujourd'hui (menu de choix des lieux), une fois par généalogie */
function cp_front_apply(PDO $pdo, bool $remove = false): array
{
    $added = [];
    try { $added = json_decode((string) ($pdo->query("SELECT value FROM meta WHERE key='frontieres_alt'")->fetchColumn() ?: '{}'), true) ?: []; } catch (Throwable $_) { return ['added' => 0]; }
    $pdo->beginTransaction();
    try {
        // d'abord, retirer ce qui avait été ajouté (on repart propre)
        $get = $pdo->prepare('SELECT alternate_names FROM places WHERE id=?'); $set = $pdo->prepare('UPDATE places SET alternate_names=? WHERE id=?');
        foreach ($added as $pid => $names) {
            $get->execute([(int) $pid]); $alt = $get->fetchColumn(); if ($alt === false) { continue; }
            $drop = array_flip(array_map('cp_fold', (array) $names));
            $keep = array_values(array_filter(array_map('trim', explode(',', (string) $alt)), static fn($x) => $x !== '' && !isset($drop[cp_fold($x)])));
            $set->execute([implode(',', $keep), (int) $pid]);
        }
        $added = []; $n = 0; $hash = '';
        if (!$remove && cp_front_installed()) {
            $d = cp_front_records(); $hash = (string) ($d['hash'] ?? '');
            $best = $pdo->prepare("SELECT id, name, alternate_names FROM places WHERE admin4_code=? AND COALESCE(country,'France') IN ('France','')
                ORDER BY feature_code IN ('ADM4','PPLA','PPLA2','PPLA3','PPLA4','PPLC') DESC, COALESCE(population,0) DESC, id LIMIT 1");
            $cache = [];
            foreach ($d['records'] as $r) {
                $code = (string) ($r['nc'] ?? ''); $old = trim((string) $r['n']);
                if ($code === '' || $old === '' || str_contains($old, ',')) { continue; }
                if (!array_key_exists($code, $cache)) { $best->execute([$code]); $cache[$code] = $best->fetch() ?: null; $best->closeCursor(); }
                $p = $cache[$code]; if (!$p || cp_fold((string) $p['name']) === cp_fold($old)) { continue; }
                $pid = (int) $p['id'];
                $have = array_values(array_filter(array_map('trim', explode(',', (string) ($cache[$code]['alternate_names'] ?? '')))));
                if (in_array(cp_fold($old), array_map('cp_fold', $have), true)) { continue; }
                $have[] = $old; $cache[$code]['alternate_names'] = implode(',', $have);
                $set->execute([$cache[$code]['alternate_names'], $pid]);
                $added[$pid][] = $old; $n++;
            }
        }
        $pdo->prepare("INSERT INTO meta(key,value) VALUES('frontieres_alt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")->execute([json_encode($added, JSON_UNESCAPED_UNICODE)]);
        $pdo->prepare("INSERT INTO meta(key,value) VALUES('frontieres_alt_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")->execute([$hash]);
        $pdo->commit();
        return ['added' => $n];
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
}

function cp_front_download(PDO $pdo, bool $apply = true): array
{
    @set_time_limit(0);
    $dir = cp_front_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Dossier des frontières impossible à créer.'); }
    $src = cp_front_sources(true); $got = []; $tmp = [];
    try {
        foreach (cp_front_files() as $k => $f) {
            $s = $src[$k]; $urls = array_merge([$s['url']], $s['alternates'] ?? []); $res = null; $part = $dir . '/' . $k . '.' . bin2hex(random_bytes(4)) . '.part'; $tmp[] = $part;
            foreach ($urls as $u) { $res = cp_http_get($u, CP_FRONT_MAX_BYTES, 600, $part); if ($res['ok']) { $s['url'] = $u; break; } }
            if (!$res['ok']) { throw new RuntimeException($f['label'] . ' : ' . $res['error']); }
            $size = (int) filesize($part);
            if ($s['size'] !== null && $s['size'] > 0 && $size !== (int) $s['size']) { throw new RuntimeException($f['label'] . ' : taille différente de celle annoncée (fichier abîmé) : rien n’a été installé.'); }
            $checked = 'en-têtes';
            if ($s['checksum']) {
                if (!hash_equals($s['checksum']['value'], (string) hash_file($s['checksum']['type'], $part))) { throw new RuntimeException($f['label'] . ' : empreinte différente de celle publiée (fichier abîmé) : rien n’a été installé.'); }
                $checked = $s['checksum']['type'] . ' publiée par ' . $s['from'];
            }
            [$h] = cp_csv_open($part, $f['cols']); fclose($h); // les colonnes attendues
            $got[$k] = ['part' => $part, 'size' => $size, 'sha256' => hash_file('sha256', $part), 'url' => $s['url'], 'checked' => $checked];
        }
        $build = cp_front_build($pdo, $got['mvt']['part'], $got['com']['part']);
        if (!$build['records']) { throw new RuntimeException('Aucune commune ancienne lue dans ces fichiers : rien n’a été installé.'); }
        $m = ['version' => CP_FRONT_VERSION, 'date' => gmdate('c'), 'files' => []];
        foreach ($got as $k => $x) {
            if (!@rename($x['part'], $dir . '/' . $k . '.csv')) { throw new RuntimeException('Fichier impossible à ranger.'); }
            $m['files'][$k] = ['name' => $k . '.csv', 'size' => $x['size'], 'sha256' => $x['sha256'], 'url' => $x['url'], 'checked' => $x['checked'], 'date' => gmdate('c')];
        }
        file_put_contents($dir . '/communes-anciennes.json', json_encode($build, JSON_UNESCAPED_UNICODE));
        file_put_contents($dir . '/manifest.json', json_encode($m, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    } finally { foreach ($tmp as $p) { if (is_file($p)) { @unlink($p); } } }
    $a = $apply ? cp_front_apply($pdo) : ['added' => 0];
    return ['ok' => true, 'files' => array_map(static fn($x) => ['size' => $x['size'], 'sha256' => $x['sha256'], 'checked' => $x['checked']], $got), 'gone' => count(array_filter($build['records'], static fn($r) => $r['k'] === 'gone')), 'names' => $a['added']];
}

/** retirer : les fichiers vont de côté (« ↶ Annuler » les remet), les noms ajoutés sont retirés de cette généalogie */
function cp_front_remove(PDO $pdo): array
{
    $dir = cp_front_dir(); if (!cp_front_installed()) { return ['ok' => true, 'removed' => false]; }
    foreach (glob($dir . '/.trash-*') ?: [] as $old) { array_map('unlink', glob($old . '/*') ?: []); @rmdir($old); }
    $trash = $dir . '/.trash-' . date('YmdHis');
    @mkdir($trash, 0775, true);
    foreach (['mvt.csv', 'com.csv', 'communes-anciennes.json', 'manifest.json'] as $f) { if (is_file("$dir/$f")) { @rename("$dir/$f", "$trash/$f"); } }
    cp_front_apply($pdo, true);
    return ['ok' => true, 'removed' => true];
}

function cp_front_restore(PDO $pdo): array
{
    $dir = cp_front_dir(); $all = glob($dir . '/.trash-*') ?: []; rsort($all);
    if (!$all) { throw new RuntimeException('Rien à remettre.'); }
    foreach (glob($all[0] . '/*') ?: [] as $f) { @rename($f, $dir . '/' . basename($f)); }
    @rmdir($all[0]);
    $a = cp_front_apply($pdo);
    return ['ok' => true, 'names' => $a['added']];
}

/** les communes anciennes d'un cadre de la carte (au plus 1500), ou une seule avec son histoire */
function cp_front_communes(array $q): array
{
    if (!cp_front_installed()) { return ['installed' => false, 'items' => []]; }
    $d = cp_front_records();
    $code = preg_match('/^\d[\dAB]\d{3}$/', (string) ($q['code'] ?? '')) ? (string) $q['code'] : '';
    if ($code !== '') { // une commune : toute son histoire, et ce qui est arrivé à sa commune d'arrivée
        $items = array_values(array_filter($d['records'], static fn($r) => $r['c'] === $code || $r['tc'] === $code || ($r['nc'] ?? '') === $code));
        return ['installed' => true, 'items' => array_slice($items, 0, 60)];
    }
    $w = (float) ($q['w'] ?? -6); $s = (float) ($q['s'] ?? 41); $e = (float) ($q['e'] ?? 10); $n = (float) ($q['n'] ?? 52);
    $withRenames = !empty($q['renames']);
    $items = []; $total = 0;
    foreach ($d['records'] as $r) {
        if (!isset($r['lat']) || (!$withRenames && $r['k'] === 'rename')) { continue; }
        if ($r['lat'] < $s || $r['lat'] > $n || $r['lon'] < $w || $r['lon'] > $e) { continue; }
        $total++; if (count($items) < 1500) { $items[] = $r; }
    }
    return ['installed' => true, 'items' => $items, 'total' => $total];
}

function cp_front_api_post(PDO $pdo, string $action): array
{
    return match ($action) {
        'frontieres_download' => cp_front_download($pdo),
        'frontieres_remove' => cp_front_remove($pdo),
        'frontieres_restore' => cp_front_restore($pdo),
        'frontieres_apply' => cp_front_apply($pdo),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

/* ═════════ Les données des cartes de Graphiques ═════════ */

/** les fiches qu'on ne montre jamais sur ces cartes : vivants et confidentielles */
function cp_hidden(PDO $pdo): array
{
    static $memo = null;
    if ($memo !== null) { return $memo; }
    $all = function_exists('person_select_rows') ? person_select_rows($pdo) : $pdo->query(person_select())->fetchAll();
    $fam = $pdo->query('SELECT * FROM families')->fetchAll();
    return $memo = function_exists('gedcom_share_hidden') ? gedcom_share_hidden($pdo, $all, $fam) : [];
}

/** les lieux qui servent : id => [nom, n° du département, lat, lon] (sans position : le centre de la commune) */
function cp_places(PDO $pdo, array $ids): array
{
    $out = []; $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $cc = null;
    foreach (array_chunk($ids, 500) as $chunk) {
        foreach ($pdo->query('SELECT id, name, county, country, admin2_code, admin4_code, latitude, longitude FROM places WHERE id IN (' . implode(',', $chunk) . ')') as $p) {
            $lat = is_numeric($p['latitude']) ? (float) $p['latitude'] : null; $lon = is_numeric($p['longitude']) ? (float) $p['longitude'] : null;
            if (($lat === null || $lon === null || ($lat == 0.0 && $lon == 0.0)) && (string) $p['admin4_code'] !== '') {
                $cc ??= $pdo->prepare('SELECT centroid_lat, centroid_lon FROM commune_contours WHERE insee_code=?');
                try { $cc->execute([(string) $p['admin4_code']]); $c = $cc->fetch(); if ($c) { $lat = (float) $c['centroid_lat']; $lon = (float) $c['centroid_lon']; } } catch (Throwable $_) {}
            }
            if ($lat === null || $lon === null || abs($lat) > 90 || ($lat == 0.0 && $lon == 0.0)) { continue; }
            $dep = (string) ($p['admin2_code'] ?: (preg_match('/^(\d[\dAB])\d{3}$/', (string) $p['admin4_code'], $m) ? $m[1] : ''));
            $out[(int) $p['id']] = [mb_substr(trim((string) $p['name']), 0, 100), mb_substr($dep, 0, 3), round($lat, 5), round($lon, 5), mb_substr(trim((string) $p['county']), 0, 60)];
        }
    }
    return $out;
}

const CP_EV_GROUPS = ['births' => ['BIRT', 'CHR', 'BAPM'], 'deaths' => ['DEAT', 'BURI', 'CREM'], 'marriages' => ['MARR'], 'residences' => ['RESI', 'CENS']];

/** les événements situés et datés des fiches montrables : [[personne, lieu, année, sorte]] */
function cp_events(PDO $pdo, string $ev, ?array $persons = null, int $max = 20000): array
{
    $tags = CP_EV_GROUPS[$ev] ?? array_merge(...array_values(CP_EV_GROUPS));
    $in = implode(',', array_map(static fn($t) => $pdo->quote($t), $tags));
    $hidden = cp_hidden($pdo);
    $filter = $persons !== null ? (' AND x.pid IN (' . (implode(',', array_map('intval', $persons ?: [0]))) . ')') : '';
    $sql = "SELECT x.pid, x.place_id, x.year, x.tag FROM (
        SELECT e.person_id AS pid, e.place_id, e.year, t.gedcom_tag AS tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL
        UNION ALL SELECT f.partner1_id, e.place_id, e.year, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL AND f.partner1_id IS NOT NULL
        UNION ALL SELECT f.partner2_id, e.place_id, e.year, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL AND f.partner2_id IS NOT NULL
    ) x WHERE 1=1{$filter} LIMIT " . ($max * 3);
    $out = [];
    foreach ($pdo->query($sql) as $r) {
        $pid = (int) $r['pid']; if (isset($hidden[$pid])) { continue; }
        $out[] = [$pid, (int) $r['place_id'], $r['year'] !== null && (int) $r['year'] > 0 ? (int) $r['year'] : null, (string) $r['tag']];
        if (count($out) >= $max) { break; }
    }
    return $out;
}

function cp_people(PDO $pdo, array $ids): array
{
    $out = []; $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    foreach (array_chunk($ids, 500) as $chunk) {
        foreach ($pdo->query('SELECT id, first_name, last_name FROM persons WHERE id IN (' . implode(',', $chunk) . ')') as $p) { $out[(int) $p['id']] = trim(trim((string) $p['first_name']) . ' ' . mb_strtoupper(trim((string) $p['last_name']))); }
    }
    return $out;
}

/** les noms de famille : [{n, c}] les plus fréquents (fiches montrables qui ont au moins un lieu) */
function cp_surnames(PDO $pdo): array
{
    $hidden = cp_hidden($pdo); $count = []; $label = [];
    $hasKind = in_array('kind', array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(), 'name'), true);
    foreach ($pdo->query("SELECT p.id, p.last_name FROM persons p WHERE COALESCE(p.last_name,'')<>''" . ($hasKind ? " AND COALESCE(p.kind,'human')<>'animal'" : '')) as $p) {
        if (isset($hidden[(int) $p['id']])) { continue; }
        $k = cp_fold((string) $p['last_name']); if ($k === '') { continue; }
        $count[$k] = ($count[$k] ?? 0) + 1; $label[$k] ??= mb_strtoupper(trim((string) $p['last_name']));
    }
    arsort($count);
    $out = []; foreach (array_slice($count, 0, 600, true) as $k => $n) { $out[] = ['n' => $label[$k], 'c' => $n]; }
    return $out;
}

function cp_data(PDO $pdo, array $q): array
{
    $what = (string) ($q['what'] ?? '');
    $ev = preg_match('/^(births|deaths|marriages|residences|all)$/', (string) ($q['ev'] ?? '')) ? (string) $q['ev'] : 'all';
    if ($what === 'surnames') { return ['surnames' => cp_surnames($pdo)]; }
    if ($what === 'surname') { // 🔤 un nom (et ses variantes du même groupe de noms)
        $name = trim(mb_substr((string) ($q['name'] ?? ''), 0, 80)); $k = cp_fold($name);
        if ($k === '') { throw new RuntimeException('Choisis un nom de famille.'); }
        $ids = []; $groups = [];
        foreach ($pdo->query('SELECT p.id, p.last_name, p.surname_group_id FROM persons p WHERE COALESCE(p.last_name,\'\')<>\'\'') as $p) {
            if (cp_fold((string) $p['last_name']) === $k) { $ids[] = (int) $p['id']; if ($p['surname_group_id']) { $groups[(int) $p['surname_group_id']] = true; } }
        }
        $variants = [];
        if (!empty($q['variants']) && $groups) {
            foreach ($pdo->query('SELECT id, last_name FROM persons WHERE surname_group_id IN (' . implode(',', array_keys($groups)) . ')') as $p) { if (!in_array((int) $p['id'], $ids, true)) { $ids[] = (int) $p['id']; $variants[mb_strtoupper((string) $p['last_name'])] = true; } }
        }
        $events = cp_events($pdo, $ev, $ids);
        return ['name' => mb_strtoupper($name), 'variants' => array_keys($variants), 'events' => $events, 'places' => cp_places($pdo, array_column($events, 1)), 'people' => cp_people($pdo, array_column($events, 0))];
    }
    if ($what === 'heat') { // 🔥 chaleur dans le temps
        $events = array_values(array_filter(cp_events($pdo, $ev), static fn($e) => $e[2] !== null));
        return ['events' => $events, 'places' => cp_places($pdo, array_column($events, 1)), 'people' => cp_people($pdo, array_column($events, 0))];
    }
    if ($what === 'dna') { return cp_dna($pdo, $q); }
    if ($what === 'research') { return cp_research($pdo); }
    throw new RuntimeException('Demande inconnue.');
}

/** 🧬 les lieux des ancêtres communs avec les correspondances ADN (reliées à une fiche de l'arbre) */
function cp_dna(PDO $pdo, array $q): array
{
    dna_ensure($pdo);
    $kits = $pdo->query("SELECT id, COALESCE(NULLIF(label,''), NULLIF(company,''), 'Test n° ' || id) AS name, person_id FROM dna_kits ORDER BY id")->fetchAll();
    $kitId = safe_int($q['kit'] ?? 0) ?: (int) ($kits[0]['id'] ?? 0);
    $groups = [];
    foreach ($pdo->query('SELECT id, name, color FROM dna_groups ORDER BY position, id') as $g) { $groups[(int) $g['id']] = ['name' => (string) $g['name'], 'color' => dna_color((string) $g['color'])]; }
    if (!$kitId) { return ['kits' => [], 'matches' => [], 'groups' => $groups, 'places' => []]; }
    $tree = dna_tree_data($pdo, $kitId, 10);
    $bySosa = []; foreach ($tree['ancestors'] as $a) { $bySosa[(int) $a['sosa']] = $a; }
    $hidden = cp_hidden($pdo);
    $names = !empty($q['names']);
    $matches = []; $ancIds = [];
    $st = $pdo->prepare('SELECT id, name, shared_cm, group_ids, side FROM dna_matches WHERE id=?');
    foreach ((array) $tree['linked'] as $mid => $found) {
        $st->execute([(int) $mid]); $m = $st->fetch(); if (!$m) { continue; }
        $anc = [];
        foreach ($found as $f) { $a = $bySosa[(int) $f['sosa']] ?? null; if ($a && !isset($hidden[(int) $a['id']])) { $anc[] = ['id' => (int) $a['id'], 'name' => (string) $a['name'], 'sosa' => (int) $f['sosa'], 'gen' => (int) $f['gen']]; $ancIds[] = (int) $a['id']; } }
        if (!$anc) { continue; }
        $gids = array_values(array_filter(array_map('intval', preg_split('/[^0-9]+/', (string) $m['group_ids']) ?: []), static fn($g) => isset($groups[$g])));
        $matches[] = ['id' => (int) $m['id'], 'name' => $names ? mb_substr((string) $m['name'], 0, 80) : 'Correspondance n° ' . (int) $m['id'], 'cm' => round((float) $m['shared_cm'], 1), 'group' => $gids[0] ?? 0, 'side' => (string) $m['side'], 'anc' => $anc];
    }
    $events = $ancIds ? cp_events($pdo, 'all', $ancIds) : [];
    $placesOf = [];
    foreach ($events as [$pid, $plc, $y, $tag]) { $placesOf[$pid][] = [$plc, $y, $tag]; }
    return ['kit' => $kitId, 'kits' => array_map(static fn($k) => ['id' => (int) $k['id'], 'name' => (string) $k['name']], $kits), 'groups' => $groups, 'matches' => $matches,
        'anc_places' => $placesOf, 'places' => cp_places($pdo, array_column($events, 1))];
}

/** l'état de ce qui a été cherché : seen (vu), partial (en partie, à revoir), todo (prévu, pas fait), missing (à chercher, rien de prévu) */
function cp_rtype(string $t): string
{
    return match (true) {
        in_array($t, ['naissance', 'bapteme', 'birth'], true) => 'naissance', in_array($t, ['mariage', 'marriage', 'parents', 'contract'], true) => 'mariage',
        in_array($t, ['deces', 'sepulture', 'death', 'succession'], true) => 'deces', in_array($t, ['recensement', 'census'], true) => 'recensement',
        in_array($t, ['table_decennale', 'tables_decennales'], true) => 'tables', default => 'autre',
    };
}

/** 🔎 carte de tes recherches : une ligne par commune, avec ce qui a été vu et ce qui manque */
function cp_research(PDO $pdo): array
{
    $communes = []; // clé => {name, lat, lon, items}
    $add = static function (string $key, string $name, ?float $lat, ?float $lon, array $item) use (&$communes) {
        if ($lat === null || $lon === null) { return; }
        $communes[$key] ??= ['key' => $key, 'name' => $name, 'lat' => round($lat, 5), 'lon' => round($lon, 5), 'items' => []];
        if (count($communes[$key]['items']) < 80) { $communes[$key]['items'][] = $item; }
    };
    $years = static fn(string $t): array => function_exists('journal_years') ? journal_years($t) : (preg_match_all('/\b(1[0-9]{3}|20[0-9]{2})\b/', $t, $m) ? [(int) min($m[1]), (int) max($m[1])] : [null, null]);
    $pl = cp_places($pdo, array_merge(
        $pdo->query('SELECT place_id FROM archive_digest_entries WHERE place_id IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN) ?: []
    ));
    $types = function_exists('archive_digest_record_types') ? archive_digest_record_types() : [];
    // 📜 dépouillements
    foreach ($pdo->query('SELECT * FROM archive_digest_entries') as $a) {
        $p = $pl[(int) $a['place_id']] ?? null;
        $res = (string) ($a['result'] ?? ''); $st = (string) $a['status'];
        $state = in_array($st, ['done'], true) || in_array($res, ['found', 'none'], true) || (int) ($a['is_exhaustive'] ?? 0) ? 'seen' : (in_array($st, ['review', 'doubt'], true) || $res === 'partial' ? 'partial' : 'todo');
        [$y0, $y1] = array_pad(array_values($years((string) $a['year_text'])), 2, null);
        $add($p ? 'p' . $a['place_id'] : 'n' . cp_fold((string) $a['city_name']), $p[0] ?? (string) $a['city_name'], $p[2] ?? null, $p[3] ?? null,
            ['src' => 'Dépouillement', 'type' => cp_rtype((string) $a['record_type']), 'label' => $types[$a['record_type']] ?? (string) $a['record_type'], 'from' => $y0, 'to' => $y1, 'state' => $state,
             'what' => mb_substr(trim((string) ($a['archive_reference'] ?: $a['archive_service'])), 0, 120), 'open' => ['digest', (int) $a['id']]]);
    }
    // 🔍 battues : communes cherchées
    $centre = static function (string $insee) use ($pdo): ?array { static $s = null; $s ??= $pdo->prepare('SELECT name, centroid_lat, centroid_lon FROM commune_contours WHERE insee_code=?'); $s->execute([$insee]); $r = $s->fetch(); $s->closeCursor(); return $r ? [(string) $r['name'], (float) $r['centroid_lat'], (float) $r['centroid_lon']] : null; };
    $stLabels = function_exists('battue_search_statuses') ? battue_search_statuses() : [];
    try {
        foreach ($pdo->query('SELECT i.*, b.title AS battue FROM battue_search_items i JOIN battues b ON b.id=i.battue_id') as $i) {
            $c = $centre((string) $i['insee_code']); if (!$c) { continue; }
            $s = (string) $i['status'];
            $state = in_array($s, ['found', 'not_found', 'homonym_rejected', 'nonexistent'], true) ? 'seen' : ($s === 'todo' ? 'todo' : 'partial');
            [$y0, $y1] = array_pad(array_values($years((string) $i['period'])), 2, null);
            $add('c' . $i['insee_code'], $c[0], $c[1], $c[2], ['src' => 'Battue « ' . mb_substr((string) $i['battue'], 0, 60) . ' »', 'type' => cp_rtype((string) $i['record_type']), 'label' => (string) ($stLabels[$s] ?? $s), 'from' => $y0, 'to' => $y1, 'state' => $state,
                'what' => mb_substr(trim((string) ($i['title'] ?: $i['register'])), 0, 120), 'open' => ['battue', (int) $i['battue_id']]]);
        }
        foreach ($pdo->query('SELECT s.*, b.title AS battue FROM battue_commune_statuses s JOIN battues b ON b.id=s.battue_id') as $i) {
            $c = $centre((string) $i['insee_code']); if (!$c) { continue; }
            $state = $i['status'] === 'done' ? 'seen' : 'partial';
            $add('c' . $i['insee_code'], $c[0], $c[1], $c[2], ['src' => 'Battue « ' . mb_substr((string) $i['battue'], 0, 60) . ' »', 'type' => 'autre', 'label' => (function_exists('battue_commune_statuses') ? battue_commune_statuses()[$i['status']] ?? '' : '') ?: (string) $i['status'], 'from' => null, 'to' => null, 'state' => $state, 'what' => 'Commune fouillée', 'open' => ['battue', (int) $i['battue_id']]]);
        }
    } catch (Throwable $_) {}
    // 🕳 trous : les actes qui manquent aux ancêtres (« Que manque-t-il ? »), sans les vivants ni les fiches confidentielles
    $hidden = cp_hidden($pdo);
    try {
        $gaps = research_gaps_data($pdo, ['gen' => 8]);
        $gpl = cp_places($pdo, array_column($gaps['items'], 'place_id'));
        foreach ($gaps['items'] as $g) {
            $p = $gpl[(int) ($g['place_id'] ?? 0)] ?? null; if (!$p) { continue; }
            $seen = array_filter($g['digested'] ?? [], static fn($d) => ($d['status'] ?? '') === 'done' || in_array($d['result'] ?? '', ['found', 'none'], true));
            $state = $seen ? 'seen' : (($g['digested'] ?? []) ? 'partial' : 'missing');
            if ($state === 'seen') { continue; } // déjà compté par son dépouillement
            $who = isset($hidden[(int) $g['person_id']]) ? '' : (string) $g['name'];
            $add('p' . $g['place_id'], $p[0], $p[2], $p[3], ['src' => 'À chercher', 'type' => cp_rtype((string) $g['kind']), 'label' => (string) $g['what'], 'from' => $g['from'], 'to' => $g['to'], 'state' => $state,
                'what' => $who !== '' ? $who . ($g['why'] ? ' — ' . $g['why'] : '') : 'un ancêtre', 'pid' => $who !== '' ? (int) $g['person_id'] : 0]);
        }
    } catch (Throwable $_) {}
    return ['communes' => array_values($communes)];
}
