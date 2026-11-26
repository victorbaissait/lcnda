<?php
declare(strict_types=1);
/**
 * 🏛 Lot N — archives et mémoire : installer les packs « tn-… » (rien n'est livré avec l'app ; écran : assets/js/app-lot-n-archives.js).
 *
 * Les packs (tn-<clé>.json.gz, fabriqués par scripts/telech-n/build_archives.py dans .github/workflows/telech-n.yml) sont déposés
 * dans la version « telech-n-donnees » du dépôt GitHub avec telech-n-manifest.json :
 *   {"version": "2026-11", "packs": {"registres": {"name": "tn-registres.json.gz", "size": N, "sha256": "…", "built": "…", "rows": N}, …}}
 * L'app les télécharge sur demande (Réglages → 🗂 Données, ou le bouton ⤓ d'une fiche), par tranches de 16 Mo (HTTP Range),
 * vérifie la taille, l'empreinte, puis le contenu (gzip → JSON avec kind = « tn-<clé> », fields, rows) avant de le ranger dans
 * le dossier des données (SHARED_DATA_DIR/telech-n/), jamais dans la généalogie. L'écran lit ensuite le fichier par tn_file.
 * Sécurité : seulement l'adresse de la version GitHub (et ses redirections, chacune revérifiée : link_safe_resolve), tailles bornées,
 * rien n'est envoyé (ni nom, ni lieu). Mode consultation : rien ne se télécharge (kiosk_guard). Essais : un dossier local à la place
 * de GitHub (GENEALOGY_TEST=1 + LCNDA_TEST_TN_DIR) — tests/test-lot-n-archives.js.
 *
 * GET  tn_status | tn_dl_info | tn_dl_resume&id= | tn_file&key=
 * POST tn_dl_start {key} | tn_dl_step {id} | tn_dl_cancel {id} | tn_dl_finish {id} | tn_pack_undo {key} | tn_pack_remove {key} | tn_pack_restore {key}
 */

const TN_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/telech-n-donnees/';
const TN_DL_STEP = 16 * 1024 * 1024;
const TN_PACK_MAX = 96 * 1024 * 1024;     // un pack fait de 1 Ko à ≈ 10 Mo compressé
const TN_JSON_MAX = 512 * 1024 * 1024;
const TN_KEYS = ['registres', 'inv-communes', 'inv-dep', 'lieux', 'autorites', 'mpf', 'monuments', 'plaques'];

function tn_dir(): string { return SHARED_DATA_DIR . '/telech-n'; }
function tn_key(mixed $k): string
{
    $k = is_string($k) ? $k : '';
    if (!in_array($k, TN_KEYS, true)) { throw new LcndaBadInput(i18n_t('Pack inconnu.')); }
    return $k;
}
function tn_path(string $key): string { return tn_dir() . '/tn-' . tn_key($key) . '.json.gz'; }

/** lit une adresse de la version GitHub (ou le dossier des essais) ; $range : [début, fin] en octets */
function tn_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_TN_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Ces données ne sont pas encore en ligne : réessaie plus tard.'), 404); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = TN_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, donnees archives)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur des données.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Ces données ne sont pas encore en ligne : réessaie plus tard.'), 404); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion au serveur des données : {err}', ['err' => $err]) : i18n_t('Le serveur des données répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/** GET tn_dl_info → ce qui est en ligne (le sommaire, gardé une heure) */
function tn_dl_info(): array
{
    $cache = tn_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(tn_dl_get('telech-n-manifest.json', null, 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des données est illisible.')); }
    $out = [];
    foreach ($m['packs'] as $key => $p) {
        if (!in_array($key, TN_KEYS, true) || !is_array($p)) { continue; }
        $name = (string) ($p['name'] ?? ''); $size = (int) ($p['size'] ?? 0);
        if ($name !== 'tn-' . $key . '.json.gz' || $size <= 0 || $size > TN_PACK_MAX || !preg_match('/^[0-9a-f]{64}$/', (string) ($p['sha256'] ?? ''))) { continue; }
        $out[$key] = ['name' => $name, 'size' => $size, 'sha256' => (string) $p['sha256'], 'built' => (string) ($p['built'] ?? ''), 'rows' => (int) ($p['rows'] ?? 0), 'licence' => (string) ($p['licence'] ?? '')];
    }
    return ['version' => (string) ($m['version'] ?? ''), 'packs' => (object) $out];
}

function tn_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new LcndaBadInput(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    $dir = tn_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des données impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST tn_dl_start {key} → {id, size} */
function tn_dl_start(array $data): array
{
    $key = tn_key($data['key'] ?? '');
    $p = ((array) tn_dl_info()['packs'])[$key] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Ces données ne sont pas encore en ligne : réessaie plus tard.')); }
    foreach (glob(tn_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12));
    $path = tn_upload_path($id);
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < 3 * $p['size'] + 20 * 1024 * 1024) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque (il faut environ {n} Mo de libres).', ['n' => (string) ceil((3 * $p['size'] + 20 * 1024 * 1024) / 1e6)])); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['key' => $key] + $p));
    return ['id' => $id, 'size' => $p['size'], 'key' => $key];
}

function tn_dl_meta(string $id): array
{
    $path = tn_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta) || !in_array($meta['key'] ?? '', TN_KEYS, true)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    return [$path, $meta];
}

/** POST tn_dl_step {id} → {received, size, done} : la tranche suivante (reprend où le fichier s'est arrêté) */
function tn_dl_step(array $data): array
{
    [$path, $meta] = tn_dl_meta((string) ($data['id'] ?? ''));
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = (int) filesize($path); $size = (int) $meta['size'];
    if ($have >= $size) { return ['received' => $have, 'size' => $size, 'done' => true]; }
    $to = min($size - 1, $have + TN_DL_STEP - 1);
    $bytes = tn_dl_get((string) $meta['name'], [$have, $to], TN_DL_STEP + 1024);
    if (strlen($bytes) !== $to - $have + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
    $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
    clearstatcache(true, $path);
    return ['received' => (int) filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
}

/** GET tn_dl_resume&id= → où en est un téléchargement interrompu */
function tn_dl_resume(string $id): array
{
    try { [$path, $meta] = tn_dl_meta($id); } catch (Throwable) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'key' => $meta['key'], 'received' => (int) filesize($path), 'size' => (int) $meta['size']];
}

function tn_dl_cancel(array $data): array
{
    $path = tn_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

/** le contenu d'un pack : gzip → JSON {kind: tn-<clé>, fields: [...], rows: [[...]]} ; null si ce n'en est pas un */
function tn_read_pack(string $file, string $key): ?array
{
    $in = @gzopen($file, 'rb'); if (!$in) { return null; }
    $s = ''; $n = 0;
    while (!gzeof($in)) { $buf = gzread($in, 1 << 20); if ($buf === false) { gzclose($in); return null; } $n += strlen($buf); if ($n > TN_JSON_MAX) { gzclose($in); return null; } $s .= $buf; }
    gzclose($in);
    try { $d = json_decode($s, true, 64, JSON_THROW_ON_ERROR); } catch (Throwable) { return null; }
    if (!is_array($d) || ($d['kind'] ?? '') !== 'tn-' . $key || !is_array($d['fields'] ?? null) || !is_array($d['rows'] ?? null)) { return null; }
    return $d;
}

/** POST tn_dl_finish {id} → vérifie (taille, empreinte, contenu) puis range le pack (l'ancien gardé pour ↶) */
function tn_dl_finish(array $data): array
{
    [$path, $meta] = tn_dl_meta((string) ($data['id'] ?? ''));
    $key = (string) $meta['key'];
    try {
        clearstatcache(true, $path);
        if ((int) filesize($path) !== (int) $meta['size']) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        if (!hash_equals((string) $meta['sha256'], (string) hash_file('sha256', $path))) { throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        $d = tn_read_pack($path, $key);
        if (!$d) { throw new RuntimeException(i18n_t('Le fichier téléchargé ne peut pas être lu : rien n’a été installé.')); }
        $target = tn_path($key);
        $info = ['key' => $key, 'built' => (string) ($d['built'] ?? $meta['built'] ?? ''), 'rows' => count($d['rows']), 'size' => (int) $meta['size'],
            'licence' => (string) ($d['licence'] ?? ''), 'url' => (string) ($d['url'] ?? ''), 'what' => (string) ($d['what'] ?? '')];
        $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); @copy($target . '.meta', $target . '.prev.meta'); }
        if (!@rename($path, $target)) { if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Pack impossible à ranger.')); }
        file_put_contents($target . '.meta', json_encode($info, JSON_UNESCAPED_UNICODE));
        @unlink($target . '.removed'); @unlink($target . '.removed.meta');
        return $info + ['had_prev' => $hadPrev];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST tn_pack_undo {key} → défait la dernière installation (remet le pack d'avant, ou retire le nouveau) */
function tn_pack_undo(array $data): array
{
    $t = tn_path(tn_key($data['key'] ?? ''));
    if (is_file($t . '.prev')) { @unlink($t); @rename($t . '.prev', $t); @rename($t . '.prev.meta', $t . '.meta'); return ['restored' => true]; }
    @unlink($t); @unlink($t . '.meta');
    return ['removed' => true];
}

/** POST tn_pack_remove {key} → mis de côté (« ↶ Annuler » : tn_pack_restore) */
function tn_pack_remove(array $data): array
{
    $t = tn_path(tn_key($data['key'] ?? ''));
    if (!is_file($t)) { throw new RuntimeException(i18n_t('Ce pack n’est pas installé.')); }
    @unlink($t . '.removed'); @unlink($t . '.removed.meta');
    if (!@rename($t, $t . '.removed')) { throw new RuntimeException(i18n_t('Pack impossible à retirer.')); }
    @rename($t . '.meta', $t . '.removed.meta');
    return ['ok' => true];
}

function tn_pack_restore(array $data): array
{
    $t = tn_path(tn_key($data['key'] ?? ''));
    if (!is_file($t . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($t)) { throw new RuntimeException(i18n_t('Un autre pack a été installé entre-temps.')); }
    @rename($t . '.removed', $t); @rename($t . '.removed.meta', $t . '.meta');
    return ['ok' => true];
}

/** GET tn_status → {packs: {clé: {built, rows, size, licence, url}}, removed: [clés]} */
function tn_status(): array
{
    $packs = []; $removed = [];
    foreach (TN_KEYS as $k) {
        $t = tn_path($k);
        if (is_file($t)) {
            $m = json_decode((string) @file_get_contents($t . '.meta'), true);
            $packs[$k] = (is_array($m) ? $m : []) + ['key' => $k, 'built' => '', 'rows' => 0, 'size' => (int) filesize($t)];
        } elseif (is_file($t . '.removed')) { $removed[] = $k; }
    }
    return ['packs' => (object) $packs, 'removed' => $removed, 'keys' => TN_KEYS];
}

/** GET tn_file&key= → le pack tel quel (gzip) ; 404 s'il n'est pas installé */
function tn_file(string $key): never
{
    $t = tn_path(tn_key($key));
    if (!is_file($t)) { json_response(['error' => i18n_t('Ce pack n’est pas installé.'), 'missing' => true], 404); }
    header('Content-Type: application/gzip');
    header('Content-Length: ' . (string) filesize($t));
    header('Cache-Control: private, max-age=60');
    header('X-Content-Type-Options: nosniff');
    readfile($t);
    exit;
}

/** la route (api.php, avant les grands match) : lecture et téléchargement, rien n'est écrit dans la généalogie */
function tn_dispatch(string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action === 'tn_file') { tn_file((string) ($_GET['key'] ?? '')); }
            json_response(match ($action) {
                'tn_status' => tn_status(),
                // sans internet (ou rien encore en ligne) : une réponse normale qui le dit
                'tn_dl_info' => (static function () { try { return tn_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'packs' => (object) [], 'offline' => true, 'error' => $e->getMessage()]; } })(),
                'tn_dl_resume' => tn_dl_resume((string) ($_GET['id'] ?? '')),
                default => throw new RuntimeException('Action inconnue.'),
            });
        }
        json_response(match ($action) {
            'tn_dl_start' => tn_dl_start($payload),
            'tn_dl_step' => tn_dl_step($payload),
            'tn_dl_cancel' => tn_dl_cancel($payload),
            'tn_dl_finish' => tn_dl_finish($payload),
            'tn_pack_undo' => tn_pack_undo($payload),
            'tn_pack_remove' => tn_pack_remove($payload),
            'tn_pack_restore' => tn_pack_restore($payload),
            default => throw new RuntimeException('Action inconnue.'),
        });
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => $e->getMessage()], $e->getCode() === 404 ? 404 : 422); }
}
