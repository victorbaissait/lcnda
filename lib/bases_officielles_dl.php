<?php
declare(strict_types=1);
/**
 * 🎖️ 🏅 Bases officielles : ⤓ installer un pack en un bouton (copie du chemin de la météo, lib/meteo_dl.php).
 *
 * Les packs bo-mpf.sqlite.gz et bo-leonore.sqlite.gz (fabriqués par scripts/bases-officielles/build-bases.py dans
 * .github/workflows/bases-officielles.yml) sont dans la version « bases-officielles-donnees » du dépôt GitHub, coupés en
 * morceaux s'il le faut, avec bases-officielles-manifest.json :
 *   {"version": "2026-11", "packs": {"mpf": {"size": N, "sha256": "…", "built": "…", "records": N, "parts": [{"name": "bo-mpf.sqlite.gz.000", "size": N}]}, "leonore": {…}}}
 * Téléchargement par tranches de 16 Mo (HTTP Range) dans un dossier d'envoi, reprise même après avoir fermé l'app, puis
 * vérification (taille, empreinte sha256 du .gz, base SQLite lisible du bon schéma) avant de ranger la base décompressée
 * dans le dossier des données. Seulement l'adresse de la version GitHub (et ses redirections, chacune revérifiée) ; rien
 * n'est envoyé. Essais : un dossier local à la place de GitHub (GENEALOGY_TEST=1 + LCNDA_TEST_BO_DIR).
 */

const BO_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/bases-officielles-donnees/';
const BO_DL_STEP = 16 * 1024 * 1024;
const BO_PACK_MAX = 2 * 1024 * 1024 * 1024;

function bo_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_BO_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Les bases officielles ne sont pas encore en ligne : réessaie plus tard.')); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = BO_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, bases officielles)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur des bases officielles.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Les bases officielles ne sont pas encore en ligne : réessaie plus tard.')); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion au serveur des bases officielles : {err}', ['err' => $err]) : i18n_t('Le serveur des bases officielles répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/** GET bo_dl_info → les packs en ligne (manifeste gardé une heure) */
function bo_dl_info(): array
{
    $cache = bo_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(bo_dl_get('bases-officielles-manifest.json', null, 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des bases officielles est illisible.')); }
    $out = [];
    foreach (BO_KINDS as $kind => $_) {
        $p = $m['packs'][$kind] ?? null;
        if (!is_array($p) || !is_array($p['parts'] ?? null) || !$p['parts'] || !preg_match('/^[0-9a-f]{64}$/', (string) ($p['sha256'] ?? ''))) { continue; }
        $parts = []; $sum = 0;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { continue 2; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($sum !== (int) ($p['size'] ?? -1) || $sum > BO_PACK_MAX) { continue; }
        $out[$kind] = ['size' => $sum, 'sha256' => (string) $p['sha256'], 'parts' => $parts, 'built' => (string) ($p['built'] ?? ''), 'records' => (int) ($p['records'] ?? 0), 'sqlite_size' => (int) ($p['sqlite_size'] ?? 0)];
    }
    return ['version' => (string) ($m['version'] ?? ''), 'packs' => (object) $out];
}

function bo_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Envoi inconnu.'); }
    $dir = bo_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des bases officielles impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST bo_dl_start {kind} → {id, size} */
function bo_dl_start(array $data): array
{
    $kind = bo_kind($data['kind'] ?? '');
    $p = ((array) bo_dl_info()['packs'])[$kind] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Cette base n’est pas encore en ligne : réessaie plus tard.')); }
    foreach (glob(bo_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12));
    $path = bo_upload_path($id);
    $need = $p['size'] + max($p['sqlite_size'], 4 * $p['size']) + 50 * 1024 * 1024;
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < $need) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque (il faut environ {n} Mo de libres).', ['n' => (string) ceil($need / 1e6)])); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['kind' => $kind, 'parts' => $p['parts'], 'sha256' => $p['sha256'], 'size' => $p['size']]));
    return ['id' => $id, 'size' => $p['size'], 'kind' => $kind];
}

function bo_dl_meta(string $id): array
{
    $path = bo_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta) || !is_array($meta['parts'] ?? null)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    return [$path, $meta];
}

/** POST bo_dl_step {id} → {received, size, done} : la tranche suivante (reprend où le fichier s'est arrêté) */
function bo_dl_step(array $data): array
{
    [$path, $meta] = bo_dl_meta((string) ($data['id'] ?? ''));
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size'));
    $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + BO_DL_STEP - 1);
            $bytes = bo_dl_get($part['name'], [$from, $to], BO_DL_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
            clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}

/** GET bo_dl_resume&id= → où en est un téléchargement interrompu */
function bo_dl_resume(string $id): array
{
    try { [$path, $meta] = bo_dl_meta($id); } catch (Throwable) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'kind' => (string) ($meta['kind'] ?? ''), 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}

function bo_dl_cancel(array $data): array
{
    $path = bo_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

/** POST bo_dl_finish {id} → vérifie (taille, empreinte), décompresse, vérifie la base (sorte, schéma) puis la range */
function bo_dl_finish(array $data): array
{
    [$path, $meta] = bo_dl_meta((string) ($data['id'] ?? ''));
    $kind = bo_kind($meta['kind'] ?? '');
    $target = bo_path($kind);
    $tmp = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
    try {
        clearstatcache(true, $path);
        if (filesize($path) !== (int) $meta['size']) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        @set_time_limit(0);
        if (!hash_equals((string) $meta['sha256'], (string) hash_file('sha256', $path))) { throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        try {
            $in = gzopen($path, 'rb'); $out = fopen($tmp, 'wb'); $n = 0;
            if (!$in || !$out) { throw new RuntimeException('ouverture'); }
            while (!gzeof($in)) { $buf = gzread($in, 1 << 20); if ($buf === false) { throw new RuntimeException('lecture'); } $n += strlen($buf); if ($n > BO_PACK_MAX) { throw new RuntimeException('trop gros'); } fwrite($out, $buf); }
            gzclose($in); fclose($out);
            $f = fopen($tmp, 'rb'); $magic = (string) fread($f, 16); fclose($f);
            if ($magic !== "SQLite format 3\0") { throw new RuntimeException('pas une base'); }
            $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
            if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
            $t = new PDO('sqlite:' . $tmp, null, null, $o);
            $m = $t->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            if (($m['kind'] ?? '') !== $kind || (int) ($m['format'] ?? 0) !== 1) { throw new RuntimeException('sorte'); }
            $tables = $t->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
            if (array_diff(['meta', 'sources', 'records', 'names'], $tables)) { throw new RuntimeException('schéma'); }
            $count = (int) ($m['count'] ?? 0); $t = null;
        } catch (Throwable) { @unlink($tmp); throw new RuntimeException(i18n_t('La base téléchargée ne peut pas être lue : rien n’a été installé.')); }
        $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($tmp, $target)) { @unlink($tmp); if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Base impossible à ranger.')); }
        @unlink($target . '.removed');
        return ['kind' => $kind, 'records' => $count, 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST bo_pack_undo {kind} → défait la dernière installation (remet la base d'avant, ou retire la nouvelle) */
function bo_pack_undo(array $data): array
{
    $t = bo_path(bo_kind($data['kind'] ?? ''));
    if (is_file($t . '.prev')) { @unlink($t); @rename($t . '.prev', $t); return ['restored' => true]; }
    @unlink($t);
    return ['removed' => true];
}

/** POST bo_pack_remove {kind} → mise de côté (« ↶ Annuler » : bo_pack_restore) */
function bo_pack_remove(array $data): array
{
    $t = bo_path(bo_kind($data['kind'] ?? ''));
    if (!is_file($t)) { throw new RuntimeException(i18n_t('Cette base n’est pas installée.')); }
    @unlink($t . '.removed');
    if (!@rename($t, $t . '.removed')) { throw new RuntimeException(i18n_t('Base impossible à retirer.')); }
    return ['ok' => true];
}

function bo_pack_restore(array $data): array
{
    $t = bo_path(bo_kind($data['kind'] ?? ''));
    if (!is_file($t . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($t)) { throw new RuntimeException(i18n_t('Une autre base a été installée entre-temps.')); }
    @rename($t . '.removed', $t);
    return ['ok' => true];
}
