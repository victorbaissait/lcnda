<?php
declare(strict_types=1);

/**
 * 🗂 Données installées : la date des données livrées avec l'app (assets/data/*), et leur mise à jour à la demande.
 *
 *  - Le sommaire assets/data/manifest.json (scripts/donnees-manifest.js) dit, pour chaque pack (un fichier, une famille de
 *    fichiers ou un sous-dossier) : date (version / built), empreinte sha256 et taille de chaque fichier, lignes, licence, source.
 *  - « ↻ Vérifier » (seulement sur un clic, ou une fois par mois si on l'a demandé) lit le même sommaire sur la branche GitHub
 *    où les workflows enregistrent les packs refaits (.github/workflows/donnees-maj.yml) :
 *    https://raw.githubusercontent.com/victorbaissait/lcnda/<branche>/assets/data/manifest.json
 *  - « Mettre à jour » télécharge les fichiers changés (https, ce seul hôte, taille bornée), vérifie leur sha256, les range
 *    dans SHARED_DATA_DIR/donnees-maj/files/ (le dossier de l'app peut être en lecture seule), garde la version d'avant
 *    (↶ Annuler = échange) ; router.php les sert à la place des fichiers livrés (lib/donnees_maj_route.php).
 *  - Listes tirées de Wikidata : « compter sur Wikidata maintenant » (la question du script, réduite à un nombre ;
 *    rien de personnel n'est envoyé ; User-Agent générique de l'app).
 *  - Mode consultation : rien ne se vérifie ni ne se met à jour. Les écritures passent par le jeton CSRF (api.php).
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_DONNEES_BASE (un serveur local à la place de GitHub), LCNDA_TEST_WIKIDATA_URL.
 * tests/test-donnees-maj.js
 */

require_once __DIR__ . '/donnees_maj_route.php';

const DMAJ_RAW = 'https://raw.githubusercontent.com/victorbaissait/lcnda/';
const DMAJ_RAW_HOST = 'raw.githubusercontent.com';
const DMAJ_WIKIDATA = 'https://query.wikidata.org/sparql';
const DMAJ_UA = 'LCNDA/1.0 (genealogy desktop app; https://github.com/victorbaissait/lcnda)';
const DMAJ_MANIFEST_MAX = 4 * 1024 * 1024;
const DMAJ_FILE_MAX = 120 * 1024 * 1024;
const DMAJ_PACK_MAX = 400 * 1024 * 1024;
const DMAJ_DIFF_MAX = 40 * 1024 * 1024;

class DmajOffline extends RuntimeException {}

function dmaj_dir(): string { return dmaj_route_dir(); }
function dmaj_test(): bool { return getenv('GENEALOGY_TEST') === '1'; }
function dmaj_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

function dmaj_ok_id(string $id): bool { return (bool) preg_match('/^[a-z0-9][a-z0-9._-]{0,80}$/i', $id) && !str_contains($id, '..'); }
function dmaj_ok_rel(string $rel): bool { return (bool) preg_match('#^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*){0,3}$#', $rel) && !str_contains($rel, '..') && strlen($rel) <= 200; }
function dmaj_ok_date(string $d): bool { return (bool) preg_match('/^\d{4}-\d\d-\d\d$/', $d); }

/** le sommaire livré avec l'app (ou, s'il manque, un sommaire refait de mémoire : la date du fichier) */
function dmaj_local(): array
{
    static $m = null;
    if ($m !== null) { return $m; }
    $f = APP_ROOT . '/assets/data/manifest.json';
    $raw = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    if (is_array($raw) && is_array($raw['packs'] ?? null)) { return $m = $raw; }
    $packs = [];
    foreach (glob(APP_ROOT . '/assets/data/*.{json,gz,bin}', GLOB_BRACE) ?: [] as $file) {
        $rel = basename($file); if ($rel === 'manifest.json') { continue; }
        $id = preg_replace('/\.(json\.gz|json|bin)$/', '', $rel); $d = date('Y-m-d', (int) filemtime($file));
        $packs[$id] = ['version' => $d, 'built' => $d, 'size' => (int) filesize($file), 'rows' => 0, 'files' => [$rel => ['sha256' => '', 'size' => (int) filesize($file)]]];
    }
    return $m = ['format' => 1, 'branch' => 'main', 'packs' => $packs];
}

function dmaj_installed(): array
{
    $f = dmaj_dir() . '/installed.json';
    $raw = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    return is_array($raw) ? $raw + ['packs' => [], 'index' => []] : ['packs' => [], 'index' => []];
}

function dmaj_installed_save(array $inst): void
{
    $inst['index'] = [];
    foreach ($inst['packs'] as $id => $p) { foreach (array_keys($p['files'] ?? []) as $rel) { $inst['index'][$rel] = $id; } }
    if (!$inst['packs']) { $inst['packs'] = (object) []; $inst['index'] = (object) []; }
    @mkdir(dmaj_dir(), 0775, true);
    $tmp = dmaj_dir() . '/installed.json.tmp';
    file_put_contents($tmp, json_encode($inst, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    rename($tmp, dmaj_dir() . '/installed.json');
}

function dmaj_shipped_sig(string $rel): ?array
{
    $f = APP_ROOT . '/assets/data/' . $rel;
    clearstatcache(true, $f);
    return is_file($f) ? [(int) filesize($f), (int) filemtime($f)] : null;
}

/** la version en place d'un pack : celle téléchargée (si elle est toujours servie), sinon celle livrée */
function dmaj_current(string $id): ?array
{
    $ship = dmaj_local()['packs'][$id] ?? null;
    $inst = dmaj_installed()['packs'][$id] ?? null;
    if (is_array($inst)) {
        $active = true;
        foreach ($inst['files'] as $rel => $f) {
            if (!empty($f['override']) && (!dmaj_route_shipped_same($rel, $f['shipped'] ?? null) || !is_file(dmaj_dir() . '/files/' . $rel))) { $active = false; break; }
            if (empty($f['override']) && !dmaj_route_shipped_same($rel, $f['shipped'] ?? null)) { $active = false; break; }
        }
        if ($active) { return $inst + ['state' => 'updated']; }
    }
    if (!is_array($ship)) { return null; }
    // le fichier livré n'est plus celui du sommaire (copie de travail) : sa date sur le disque
    $files = $ship['files'] ?? [];
    foreach ($files as $rel => $f) {
        $sig = dmaj_shipped_sig($rel);
        if (!$sig || $sig[0] !== (int) ($f['size'] ?? -1)) { $d = $sig ? date('Y-m-d', $sig[1]) : ''; $ship['version'] = $ship['built'] = $d ?: (string) ($ship['version'] ?? ''); $ship['changed'] = true; break; }
    }
    if (empty($ship['version'])) {
        $t = 0; foreach (array_keys($files) as $rel) { $t = max($t, (int) (dmaj_shipped_sig($rel)[1] ?? 0)); }
        if ($t) { $ship['version'] = $ship['built'] = date('Y-m-d', $t); }
    }
    return $ship + ['state' => 'shipped'];
}

/** un fichier de ce pack ? (déjà connu, ou rangé comme les autres : même sous-dossier, même famille de noms) */
function dmaj_rel_belongs(string $id, string $rel, array $known): bool
{
    if (!dmaj_ok_rel($rel)) { return false; }
    if (isset($known[$rel])) { return true; }
    $name = preg_replace('/\.(json\.gz|json|bin)$/', '', $rel);
    if ($name === $rel) { return false; }
    if (str_contains($rel, '/')) { return str_starts_with($rel, $id . '/'); }
    return $name === $id || str_starts_with($name, $id . '-');
}

/* ═════════════ le réseau : https seulement, l'hôte GitHub configuré ou Wikidata ═════════════ */

function dmaj_base(): string
{
    $t = (string) getenv('LCNDA_TEST_DONNEES_BASE');
    if (dmaj_test() && $t !== '') { return rtrim($t, '/') . '/'; }
    $branch = (string) (dmaj_local()['branch'] ?? 'main');
    if (!preg_match('#^[A-Za-z0-9._/-]{1,100}$#', $branch) || str_contains($branch, '..')) { $branch = 'main'; }
    return DMAJ_RAW . $branch . '/';
}

function dmaj_url_ok(string $url): bool
{
    $t = (string) getenv('LCNDA_TEST_DONNEES_BASE'); $w = (string) getenv('LCNDA_TEST_WIKIDATA_URL');
    if (dmaj_test() && (($t !== '' && str_starts_with($url, rtrim($t, '/') . '/')) || ($w !== '' && $url === $w))) { return true; }
    $p = parse_url($url);
    return ($p['scheme'] ?? '') === 'https' && in_array(strtolower((string) ($p['host'] ?? '')), [DMAJ_RAW_HOST, 'query.wikidata.org'], true) && !isset($p['user']) && !isset($p['port']);
}

/** GET (ou POST de formulaire) borné ; DmajOffline si le réseau ne répond pas */
function dmaj_http(string $url, int $max, ?array $post = null, array $headers = []): string
{
    if (!dmaj_url_ok($url)) { throw new RuntimeException(i18n_t('Adresse refusée : seulement GitHub ou Wikidata, en https.')); }
    if (!function_exists('curl_init')) { throw new DmajOffline(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $resolve = '';
    if (!(dmaj_test() && str_starts_with($url, 'http://'))) {
        $r = function_exists('link_safe_resolve') ? link_safe_resolve($url) : '';
        if ($r === null) { throw new DmajOffline(i18n_t('Pas de connexion à Internet (ou le réseau bloque ce site) : rien n’a changé.')); }
        $resolve = (string) $r;
    }
    $body = ''; $too = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($post !== null ? [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($post)] : []) + [
        CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 300,
        CURLOPT_PROTOCOLS => dmaj_test() ? (CURLPROTO_HTTPS | CURLPROTO_HTTP) : CURLPROTO_HTTPS, CURLOPT_USERAGENT => DMAJ_UA, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*',
        CURLOPT_WRITEFUNCTION => static function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_errno($ch);
    unset($ch);
    if ($too) { throw new RuntimeException(i18n_t('Fichier plus gros que prévu : refusé, rien n’a changé.')); }
    if ($code === 0 || ($err && $code === 0)) { throw new DmajOffline(i18n_t('Pas de connexion à Internet (ou le réseau bloque ce site) : rien n’a changé.')); }
    if ($code === 404) { throw new RuntimeException(i18n_t('Pas trouvé en ligne : réessaie plus tard.')); }
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le serveur répond {code} : réessaie plus tard.', ['code' => (string) $code])); }
    return $body;
}

/** le sommaire en ligne (gardé 10 minutes) */
function dmaj_remote(bool $fresh = false): array
{
    $cache = dmaj_dir() . '/remote-manifest.json';
    if (!$fresh && !dmaj_test() && is_file($cache) && filemtime($cache) > time() - 600) {
        $m = json_decode((string) file_get_contents($cache), true);
    } else {
        $m = json_decode(dmaj_http(dmaj_base() . 'assets/data/manifest.json', DMAJ_MANIFEST_MAX), true);
        if (is_array($m)) { @mkdir(dmaj_dir(), 0775, true); @file_put_contents($cache, json_encode($m, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des données en ligne est illisible.')); }
    return $m;
}

/** l'entrée en ligne d'un pack, vérifiée (null si mal décrite) */
function dmaj_remote_entry(string $id, array $remote, array $known): ?array
{
    $p = $remote['packs'][$id] ?? null;
    if (!is_array($p) || !is_array($p['files'] ?? null) || !$p['files'] || !dmaj_ok_date((string) ($p['version'] ?? ''))) { return null; }
    $files = []; $sum = 0;
    foreach ($p['files'] as $rel => $f) {
        $rel = (string) $rel;
        if (!is_array($f) || !dmaj_rel_belongs($id, $rel, $known) || !preg_match('/^[0-9a-f]{64}$/', (string) ($f['sha256'] ?? '')) || (int) ($f['size'] ?? 0) <= 0 || (int) $f['size'] > DMAJ_FILE_MAX) { return null; }
        $files[$rel] = ['sha256' => (string) $f['sha256'], 'size' => (int) $f['size']]; $sum += (int) $f['size'];
    }
    if ($sum > DMAJ_PACK_MAX) { return null; }
    $s = static fn($v, $n = 200) => mb_substr(is_string($v) ? $v : '', 0, $n);
    return ['version' => (string) $p['version'], 'built' => dmaj_ok_date((string) ($p['built'] ?? '')) ? (string) $p['built'] : (string) $p['version'], 'files' => $files, 'size' => $sum,
        'rows' => max(0, (int) ($p['rows'] ?? 0)), 'licence' => $s($p['licence'] ?? '', 120), 'source' => $s($p['source'] ?? ''), 'title' => $s($p['title'] ?? '', 160),
        'url' => is_string($p['url'] ?? null) && str_starts_with($p['url'], 'https://') ? $s($p['url'], 300) : ''];
}

/** ce qui changerait : les fichiers à télécharger (empreinte différente de celle en place) */
function dmaj_compare(string $id, array $cur, ?array $rem): array
{
    if (!$rem) { return ['newer' => false, 'download' => 0, 'files' => []]; }
    $need = [];
    foreach ($rem['files'] as $rel => $f) {
        $have = $cur['files'][$rel]['sha256'] ?? '';
        if ($have !== $f['sha256']) { $need[$rel] = $f; }
    }
    $newer = $need && strcmp($rem['version'], (string) ($cur['version'] ?? '')) >= 0;
    return ['newer' => (bool) $newer, 'download' => array_sum(array_column($need, 'size')), 'files' => $need];
}

/* ═════════════ les routes ═════════════ */

/** GET donnees_maj_status → les packs livrés / mis à jour, la place sur le disque */
function dmaj_status(): array
{
    $out = []; $index = [];
    foreach (array_keys(dmaj_local()['packs']) as $id) {
        $c = dmaj_current((string) $id); if (!$c) { continue; }
        $bk = is_file(dmaj_dir() . '/backup/' . $id . '/state.json');
        $out[] = ['id' => (string) $id, 'title' => (string) ($c['title'] ?? ''), 'version' => (string) ($c['version'] ?? ''), 'built' => (string) ($c['built'] ?? ''), 'size' => (int) ($c['size'] ?? 0),
            'rows' => (int) ($c['rows'] ?? 0), 'licence' => (string) ($c['licence'] ?? ''), 'source' => (string) ($c['source'] ?? ''), 'url' => (string) ($c['url'] ?? ''),
            'files' => count($c['files'] ?? []), 'state' => $c['state'], 'installed_at' => (string) ($c['installed_at'] ?? ''), 'can_undo' => $bk,
            'wikidata' => !empty(dmaj_local()['packs'][$id]['wikidata_count']), 'script' => (string) (dmaj_local()['packs'][$id]['script'] ?? '')];
        foreach (array_keys($c['files'] ?? []) as $rel) { $index[$rel] = (string) $id; }
    }
    $free = @disk_free_space(SHARED_DATA_DIR);
    return ['packs' => $out, 'index' => (object) $index, 'branch' => (string) (dmaj_local()['branch'] ?? 'main'), 'kiosk' => dmaj_kiosk(),
        'free' => $free === false ? null : (int) $free, 'data_dir_size' => dmaj_dir_size()];
}

/** la place prise par les données téléchargées (packs mis à jour + dossiers des packs installés) */
function dmaj_dir_size(): int
{
    $n = 0;
    foreach (['donnees-maj', 'meteo', 'gov', 'histoire', 'prenoms', 'elections', 'bases-officielles', 'brevets-annuaires', 'lieux-patrimoine'] as $d) {
        $p = SHARED_DATA_DIR . '/' . $d; if (!is_dir($p)) { continue; }
        try { foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($p, FilesystemIterator::SKIP_DOTS)) as $f) { if ($f->isFile()) { $n += $f->getSize(); } } } catch (Throwable) {}
    }
    return $n;
}

/** GET donnees_maj_check {packs: "a,b" | ""} → pour chaque pack : en place, en ligne, plus récent ? */
function dmaj_check(array $q): array
{
    $want = array_values(array_filter(array_map('trim', explode(',', (string) ($q['packs'] ?? ''))), 'strlen'));
    $local = dmaj_local()['packs'];
    if (!$want) { $want = array_map('strval', array_keys($local)); }
    $remote = dmaj_remote(!empty($q['fresh']));
    $out = [];
    foreach (array_slice($want, 0, 400) as $id) {
        if (!dmaj_ok_id($id) || !isset($local[$id])) { continue; }   // seulement les packs connus de l'app
        $cur = dmaj_current($id); if (!$cur) { continue; }
        $rem = dmaj_remote_entry($id, $remote, ($local[$id]['files'] ?? []) + ($cur['files'] ?? []));
        $cmp = dmaj_compare($id, $cur, $rem);
        $out[$id] = ['current' => ['version' => (string) ($cur['version'] ?? ''), 'rows' => (int) ($cur['rows'] ?? 0), 'size' => (int) ($cur['size'] ?? 0), 'state' => $cur['state']],
            'remote' => $rem ? array_diff_key($rem, ['files' => 1]) : null, 'newer' => $cmp['newer'], 'download' => $cmp['download'], 'files' => count($cmp['files'])];
    }
    return ['packs' => (object) $out, 'checked_at' => date('c'), 'source' => dmaj_test() ? 'test' : DMAJ_RAW_HOST];
}

/** les lignes d'un fichier JSON (gz ou non) : rows[], ou le plus grand tableau / objet */
function dmaj_rows_of(string $file): ?array
{
    if (!is_file($file) || filesize($file) > DMAJ_DIFF_MAX) { return null; }
    $b = (string) file_get_contents($file);
    if (str_starts_with($b, "\x1f\x8b")) { $b = @gzdecode($b, DMAJ_DIFF_MAX * 4); if ($b === false) { return null; } }
    $j = json_decode($b, true);
    if (!is_array($j)) { return null; }
    if (array_is_list($j)) { return ['rows' => $j, 'fields' => []]; }
    if (is_array($j['rows'] ?? null)) { return ['rows' => $j['rows'], 'fields' => is_array($j['fields'] ?? null) ? $j['fields'] : (is_array($j['cols'] ?? null) ? $j['cols'] : [])]; }
    $best = []; foreach ($j as $v) { if (is_array($v) && count($v) > count($best)) { $best = $v; } }
    return ['rows' => $best, 'fields' => []];
}

/** ce qui a changé dans un fichier : +N / −N lignes, et les années des lignes ajoutées */
function dmaj_diff(?string $old, string $new): array
{
    $a = $old ? dmaj_rows_of($old) : null; $b = dmaj_rows_of($new);
    if (!$b) { return []; }
    $key = static fn($r) => is_array($r) ? json_encode($r, JSON_UNESCAPED_UNICODE) : (string) $r;
    $seen = []; foreach (($a['rows'] ?? []) as $k => $r) { $seen[$key(is_int($k) ? $r : [$k, $r])] = true; }
    $added = []; $now = [];
    foreach ($b['rows'] as $k => $r) { $kk = $key(is_int($k) ? $r : [$k, $r]); $now[$kk] = true; if (!isset($seen[$kk])) { $added[] = $r; } }
    $removed = 0; foreach (array_keys($seen) as $kk) { if (!isset($now[$kk])) { $removed++; } }
    $years = [];
    $yi = false; foreach (['y', 'year', 'annee', 'an'] as $f) { $i = array_search($f, $b['fields'], true); if ($i !== false) { $yi = $i; break; } }
    foreach (array_slice($added, 0, 5000) as $r) {
        $y = null;
        if ($yi !== false && is_array($r) && isset($r[$yi]) && is_numeric($r[$yi])) { $y = (int) $r[$yi]; }
        elseif (is_array($r)) { foreach (['y', 'year', 'annee'] as $f) { if (isset($r[$f]) && is_numeric($r[$f])) { $y = (int) $r[$f]; break; } } }
        if ($y !== null && $y > 0 && $y < 3000) { $years[$y] = true; }
    }
    ksort($years);
    return ['added' => count($added), 'removed' => $removed, 'years' => array_slice(array_keys($years), -6)];
}

function dmaj_rm_tree(string $dir): void
{
    if (!is_dir($dir)) { return; }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) { $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname()); }
    @rmdir($dir);
}

function dmaj_move(string $from, string $to): void
{
    @mkdir(dirname($to), 0775, true);
    if (!@rename($from, $to)) { throw new RuntimeException(i18n_t('Impossible de ranger le fichier : rien n’a changé.')); }
}

/** POST donnees_maj_apply {pack} → télécharge, vérifie, remplace ; garde l'ancienne version (↶) */
function dmaj_apply(array $data): array
{
    $id = (string) ($data['pack'] ?? '');
    $local = dmaj_local()['packs'];
    if (!dmaj_ok_id($id) || !isset($local[$id])) { throw new LcndaBadInput('Pack inconnu.'); }
    $cur = dmaj_current($id); if (!$cur) { throw new LcndaBadInput('Pack inconnu.'); }
    $rem = dmaj_remote_entry($id, dmaj_remote(), ($local[$id]['files'] ?? []) + ($cur['files'] ?? []));
    if (!$rem) { throw new RuntimeException(i18n_t('Ce pack n’est pas décrit en ligne (ou mal décrit) : rien n’a changé.')); }
    $cmp = dmaj_compare($id, $cur, $rem);
    if (!$cmp['newer']) { return ['ok' => true, 'already' => true, 'version' => $cur['version'] ?? '']; }
    $free = @disk_free_space(SHARED_DATA_DIR);
    if ($free !== false && $free < 2 * $cmp['download'] + 20 * 1024 * 1024) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque.')); }
    @set_time_limit(0);
    $dir = dmaj_dir(); $stage = $dir . '/tmp/' . bin2hex(random_bytes(8));
    @mkdir($stage, 0775, true);
    try {
        // 1. tout télécharger et vérifier avant de toucher à quoi que ce soit
        foreach ($cmp['files'] as $rel => $f) {
            $bytes = dmaj_http(dmaj_base() . 'assets/data/' . str_replace('%2F', '/', rawurlencode($rel)), $f['size'] + 1);
            if (strlen($bytes) !== $f['size'] || !hash_equals($f['sha256'], hash('sha256', $bytes))) {
                throw new RuntimeException(i18n_t('Le fichier téléchargé est abîmé (empreinte sha256 différente) : refusé, rien n’a changé.'));
            }
            @mkdir(dirname($stage . '/' . $rel), 0775, true);
            file_put_contents($stage . '/' . $rel, $bytes);
        }
        // 2. ce qui a changé (avant le remplacement)
        $diff = ['added' => 0, 'removed' => 0, 'years' => []];
        foreach (array_keys($cmp['files']) as $rel) {
            $old = is_file($dir . '/files/' . $rel) && !empty($cur['files'][$rel]['override']) ? $dir . '/files/' . $rel : (is_file(APP_ROOT . '/assets/data/' . $rel) ? APP_ROOT . '/assets/data/' . $rel : null);
            $d = dmaj_diff($old, $stage . '/' . $rel);
            $diff['added'] += $d['added'] ?? 0; $diff['removed'] += $d['removed'] ?? 0; $diff['years'] = array_values(array_unique(array_merge($diff['years'], $d['years'] ?? [])));
        }
        sort($diff['years']);
        // 3. la version d'avant, gardée (une seule : la dernière)
        $inst = dmaj_installed();
        $bk = $dir . '/backup/' . $id; dmaj_rm_tree($bk); @mkdir($bk . '/files', 0775, true);
        $prev = $inst['packs'][$id] ?? null;
        foreach (($prev['files'] ?? []) as $rel => $f) { if (!empty($f['override']) && is_file($dir . '/files/' . $rel)) { dmaj_move($dir . '/files/' . $rel, $bk . '/files/' . $rel); } }
        file_put_contents($bk . '/state.json', json_encode(['entry' => $prev, 'at' => date('c')], JSON_UNESCAPED_UNICODE));
        // 4. ranger la nouvelle (renommer : sur le même disque, d'un coup)
        $files = [];
        foreach ($rem['files'] as $rel => $f) {
            $sig = dmaj_shipped_sig($rel);
            if (isset($cmp['files'][$rel])) { dmaj_move($stage . '/' . $rel, $dir . '/files/' . $rel); $files[$rel] = $f + ['override' => true, 'shipped' => $sig]; }
            elseif (!empty($prev['files'][$rel]['override']) && is_file($bk . '/files/' . $rel)) { @mkdir(dirname($dir . '/files/' . $rel), 0775, true); copy($bk . '/files/' . $rel, $dir . '/files/' . $rel); $files[$rel] = $f + ['override' => true, 'shipped' => $sig]; }
            else { $files[$rel] = $f + ['override' => false, 'shipped' => $sig]; }
        }
        $inst['packs'][$id] = array_diff_key($rem, ['files' => 1]) + ['files' => $files, 'installed_at' => date('c'), 'from' => $cur['version'] ?? '', 'from_rows' => (int) ($cur['rows'] ?? 0)];
        dmaj_installed_save($inst);
    } finally {
        dmaj_rm_tree($stage);
    }
    return ['ok' => true, 'pack' => $id, 'before' => ['version' => (string) ($cur['version'] ?? ''), 'rows' => (int) ($cur['rows'] ?? 0)], 'after' => ['version' => $rem['version'], 'rows' => $rem['rows']],
        'downloaded' => $cmp['download'], 'diff' => $diff];
}

/** POST donnees_maj_undo {pack} → échange la version en place et celle gardée (une 2e fois : rétablit) */
function dmaj_undo(array $data): array
{
    $id = (string) ($data['pack'] ?? '');
    if (!dmaj_ok_id($id) || !isset(dmaj_local()['packs'][$id])) { throw new LcndaBadInput('Pack inconnu.'); }
    $dir = dmaj_dir(); $bk = $dir . '/backup/' . $id;
    $state = is_file($bk . '/state.json') ? json_decode((string) file_get_contents($bk . '/state.json'), true) : null;
    if (!is_array($state)) { throw new RuntimeException(i18n_t('Pas de version d’avant à remettre.')); }
    $inst = dmaj_installed(); $now = $inst['packs'][$id] ?? null;
    $swap = $dir . '/tmp/swap-' . bin2hex(random_bytes(6)); @mkdir($swap . '/files', 0775, true);
    foreach (($now['files'] ?? []) as $rel => $f) { if (!empty($f['override']) && is_file($dir . '/files/' . $rel)) { dmaj_move($dir . '/files/' . $rel, $swap . '/files/' . $rel); } }
    $back = $state['entry'] ?? null;
    foreach (($back['files'] ?? []) as $rel => $f) { if (!empty($f['override']) && is_file($bk . '/files/' . $rel)) { dmaj_move($bk . '/files/' . $rel, $dir . '/files/' . $rel); } }
    dmaj_rm_tree($bk); @mkdir(dirname($bk), 0775, true); rename($swap, $bk);
    file_put_contents($bk . '/state.json', json_encode(['entry' => $now, 'at' => date('c')], JSON_UNESCAPED_UNICODE));
    if (is_array($back)) { $inst['packs'][$id] = $back; } else { unset($inst['packs'][$id]); }
    dmaj_installed_save($inst);
    $c = dmaj_current($id);
    return ['ok' => true, 'pack' => $id, 'version' => (string) ($c['version'] ?? ''), 'rows' => (int) ($c['rows'] ?? 0), 'state' => $c['state'] ?? 'shipped'];
}

/** GET donnees_maj_wikidata {pack} → combien Wikidata en compte aujourd'hui (la question du sommaire livré, jamais une autre) */
function dmaj_wikidata(array $q): array
{
    $id = (string) ($q['pack'] ?? '');
    $sparql = (string) (dmaj_local()['packs'][$id]['wikidata_count'] ?? '');
    if (!dmaj_ok_id($id) || $sparql === '') { throw new LcndaBadInput('Cette liste ne se recompte pas sur Wikidata.'); }
    $t = (string) getenv('LCNDA_TEST_WIKIDATA_URL');
    $url = dmaj_test() && $t !== '' ? $t : DMAJ_WIKIDATA;
    $j = json_decode(dmaj_http($url, 1024 * 1024, ['query' => $sparql, 'format' => 'json'], ['Accept: application/sparql-results+json']), true);
    $n = $j['results']['bindings'][0]['n']['value'] ?? null;
    if (!is_numeric($n)) { throw new RuntimeException(i18n_t('Réponse de Wikidata illisible.')); }
    $c = dmaj_current($id);
    return ['pack' => $id, 'count' => (int) $n, 'rows' => (int) ($c['rows'] ?? 0), 'at' => date('c')];
}

/** api.php : toutes les routes donnees_maj_* (après le jeton CSRF et le garde du mode consultation) */
function donnees_maj_api(string $action, bool $isWrite, array $payload): never
{
    try {
        if ($action !== 'donnees_maj_status' && dmaj_kiosk()) {
            json_response(['error' => 'Mode consultation : les données ne se vérifient pas et ne se mettent pas à jour.', 'kiosk' => true], 423);
        }
        $r = match (true) {
            !$isWrite && $action === 'donnees_maj_status' => dmaj_status(),
            !$isWrite && $action === 'donnees_maj_check' => dmaj_check($_GET),
            !$isWrite && $action === 'donnees_maj_wikidata' => dmaj_wikidata($_GET),
            $isWrite && $action === 'donnees_maj_apply' => dmaj_apply($payload),
            $isWrite && $action === 'donnees_maj_undo' => dmaj_undo($payload),
            default => throw new LcndaBadInput('Action inconnue.'),
        };
        json_response($r);
    } catch (DmajOffline $e) {
        json_response(['error' => $e->getMessage(), 'offline' => true], 503);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}
