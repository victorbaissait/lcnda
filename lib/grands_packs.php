<?php
declare(strict_types=1);
/**
 * 📦 Les grands packs des lots K et L : installés à la demande (rien n'est livré avec l'app ; écran : assets/js/app-grands-packs.js).
 *
 * Les packs trop gros pour l'app (les biens protégés par pays tk-patrimoine_<pays>, et tout fichier de plus de 3 Mo, ex.
 * tl-cimetieres, tl-mines) sont déposés par .github/workflows/telech-k.yml et telech-l.yml (scripts/grands-packs.js) dans les
 * versions GitHub « telech-k-donnees » et « telech-l-donnees », avec leur sommaire telech-<lot>-manifest.json :
 *   {"version": "…", "packs": {"tk-patrimoine_gb": {"name": "tk-patrimoine_gb.json.gz", "size": N, "sha256": "…", "built": "…", "rows": N, "licence": "…"}}}
 * L'app les télécharge sur demande (Réglages → 🗂 Données, ou « 📦 Installer (≈ N Mo) » sur la page du lot), par tranches de
 * 16 Mo (HTTP Range), vérifie la taille, l'empreinte (sha256 du sommaire) et le gzip, puis les range dans SHARED_DATA_DIR/grands-packs/.
 * Le routeur les sert ensuite à l'adresse habituelle assets/data/<pack>.json.gz (lib/grands_packs_route.php) : le code des lots
 * les lit comme un fichier livré. Le même chemin que le lot N (lib/sources_n1.php) : reprise, ↶ Annuler, 🗑 Supprimer puis ↶.
 * Sécurité : seulement l'adresse des versions GitHub (et ses redirections, chacune revérifiée), tailles bornées, rien n'est envoyé.
 * Mode consultation : rien ne se télécharge (kiosk_guard pour les écritures ; le sommaire en ligne n'est pas lu).
 * Essais : un dossier local à la place de GitHub (GENEALOGY_TEST=1 + LCNDA_TEST_GP_DIR : les sommaires et les packs, à plat).
 *
 * GET  gp_status | gp_dl_info | gp_dl_resume&id=
 * POST gp_dl_start {id} | gp_dl_step {id} | gp_dl_cancel {id} | gp_dl_finish {id} | gp_pack_undo {id} | gp_pack_remove {id} | gp_pack_restore {id}
 */

require_once __DIR__ . '/grands_packs_route.php';

const GP_LOTS = ['k' => 'telech-k-donnees', 'l' => 'telech-l-donnees'];
const GP_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/';
const GP_DL_STEP = 16 * 1024 * 1024;
const GP_PACK_MAX = 256 * 1024 * 1024;

function gp_lot(string $id): string { return $id[1]; }
function gp_id(mixed $id): string
{
    $id = is_string($id) ? $id : '';
    if (!preg_match(GP_ID_RE, $id)) { throw new LcndaBadInput(i18n_t('Pack inconnu.')); }
    return $id;
}
function gp_path(string $id): string { return gp_dir() . '/' . gp_id($id) . '.json.gz'; }
function gp_shipped(string $id): bool { return is_file(APP_ROOT . '/assets/data/' . $id . '.json.gz'); }
function gp_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

/** un fichier d'une version GitHub (ou du dossier des essais) ; $range : [début, fin] en octets */
function gp_dl_get(string $lot, string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!isset(GP_LOTS[$lot]) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_GP_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Ces données ne sont pas encore en ligne : réessaie plus tard.'), 404); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = GP_DL_BASE . GP_LOTS[$lot] . '/' . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, grands packs)',
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

/** GET gp_dl_info → ce qui est en ligne pour les deux lots (sommaires gardés une heure) ; un pack livré avec l'app n'y est pas */
function gp_dl_info(): array
{
    if (gp_kiosk()) { return ['packs' => (object) [], 'offline' => true, 'kiosk' => true]; }
    $out = []; $errors = [];
    foreach (array_keys(GP_LOTS) as $lot) {
        $cache = gp_dir() . '/.envois/manifest-' . $lot . '.json';
        try {
            if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
            else {
                $m = json_decode(gp_dl_get($lot, 'telech-' . $lot . '-manifest.json', null, 1024 * 1024), true);
                if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
            }
        } catch (RuntimeException $e) { $errors[] = $e->getMessage(); continue; }
        if (!is_array($m) || !is_array($m['packs'] ?? null)) { $errors[] = i18n_t('Le sommaire des données est illisible.'); continue; }
        foreach ($m['packs'] as $id => $p) {
            if (!is_string($id) || !preg_match(GP_ID_RE, $id) || gp_lot($id) !== $lot || !is_array($p) || gp_shipped($id)) { continue; }
            $size = (int) ($p['size'] ?? 0);
            if (($p['name'] ?? '') !== $id . '.json.gz' || $size <= 0 || $size > GP_PACK_MAX || !preg_match('/^[0-9a-f]{64}$/', (string) ($p['sha256'] ?? ''))) { continue; }
            $out[$id] = ['lot' => $lot, 'name' => $id . '.json.gz', 'size' => $size, 'sha256' => (string) $p['sha256'], 'built' => (string) ($p['built'] ?? ''), 'rows' => (int) ($p['rows'] ?? 0),
                'licence' => mb_substr((string) ($p['licence'] ?? ''), 0, 200), 'source' => mb_substr((string) ($p['source'] ?? ''), 0, 200)];
        }
    }
    return ['packs' => (object) $out] + ($errors && !$out ? ['offline' => true, 'error' => $errors[0]] : []);
}

function gp_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new LcndaBadInput(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    $dir = gp_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des données impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST gp_dl_start {id: pack} → {id: téléchargement, size} */
function gp_dl_start(array $data): array
{
    $pack = gp_id($data['id'] ?? '');
    if (gp_shipped($pack)) { throw new RuntimeException(i18n_t('Ce pack est déjà livré avec l’app.')); }
    $p = ((array) gp_dl_info()['packs'])[$pack] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Ces données ne sont pas encore en ligne : réessaie plus tard.')); }
    foreach (glob(gp_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12));
    $path = gp_upload_path($id);
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < 2 * $p['size'] + 20 * 1024 * 1024) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque (il faut environ {n} Mo de libres).', ['n' => (string) ceil((2 * $p['size'] + 20 * 1024 * 1024) / 1e6)])); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['pack' => $pack] + $p));
    return ['id' => $id, 'size' => $p['size'], 'pack' => $pack];
}

function gp_dl_meta(string $id): array
{
    $path = gp_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta) || !preg_match(GP_ID_RE, (string) ($meta['pack'] ?? ''))) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    return [$path, $meta];
}

/** POST gp_dl_step {id} → {received, size, done} : la tranche suivante */
function gp_dl_step(array $data): array
{
    [$path, $meta] = gp_dl_meta((string) ($data['id'] ?? ''));
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = (int) filesize($path); $size = (int) $meta['size'];
    if ($have >= $size) { return ['received' => $have, 'size' => $size, 'done' => true]; }
    $to = min($size - 1, $have + GP_DL_STEP - 1);
    $bytes = gp_dl_get(gp_lot((string) $meta['pack']), (string) $meta['name'], [$have, $to], GP_DL_STEP + 1024);
    if (strlen($bytes) !== $to - $have + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
    $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
    clearstatcache(true, $path);
    return ['received' => (int) filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
}

function gp_dl_resume(string $id): array
{
    try { [$path, $meta] = gp_dl_meta($id); } catch (Throwable) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'pack' => $meta['pack'], 'received' => (int) filesize($path), 'size' => (int) $meta['size']];
}

function gp_dl_cancel(array $data): array
{
    $path = gp_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

/** le gzip se lit jusqu'au bout (contrôle du gzip) et c'est un objet JSON qui a des lignes ; sans tout garder en mémoire */
function gp_check_pack(string $file): bool
{
    $in = @gzopen($file, 'rb'); if (!$in) { return false; }
    $head = ''; $rows = false; $tail = '';
    while (!gzeof($in)) {
        $buf = gzread($in, 1 << 20); if ($buf === false) { gzclose($in); return false; }
        if (strlen($head) < 64) { $head .= substr($buf, 0, 64); }
        if (!$rows && str_contains($tail . $buf, '"rows"')) { $rows = true; }
        $tail = substr($buf, -8);
    }
    gzclose($in);
    return str_starts_with(ltrim($head), '{') && $rows;
}

/** POST gp_dl_finish {id} → vérifie (taille, empreinte, gzip) puis range le pack (l'ancien gardé pour ↶) */
function gp_dl_finish(array $data): array
{
    [$path, $meta] = gp_dl_meta((string) ($data['id'] ?? ''));
    $pack = (string) $meta['pack'];
    try {
        clearstatcache(true, $path);
        if ((int) filesize($path) !== (int) $meta['size']) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        if (!hash_equals((string) $meta['sha256'], (string) hash_file('sha256', $path))) { throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        if (!gp_check_pack($path)) { throw new RuntimeException(i18n_t('Le fichier téléchargé ne peut pas être lu : rien n’a été installé.')); }
        $target = gp_path($pack);
        $info = ['pack' => $pack, 'built' => (string) ($meta['built'] ?? ''), 'rows' => (int) ($meta['rows'] ?? 0), 'size' => (int) $meta['size'], 'licence' => (string) ($meta['licence'] ?? ''), 'source' => (string) ($meta['source'] ?? '')];
        $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); @copy($target . '.meta', $target . '.prev.meta'); }
        if (!@rename($path, $target)) { if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Pack impossible à ranger.')); }
        file_put_contents($target . '.meta', json_encode($info, JSON_UNESCAPED_UNICODE));
        @unlink($target . '.removed'); @unlink($target . '.removed.meta');
        return $info + ['had_prev' => $hadPrev];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST gp_pack_undo {id} → défait la dernière installation */
function gp_pack_undo(array $data): array
{
    $t = gp_path((string) ($data['id'] ?? ''));
    if (is_file($t . '.prev')) { @unlink($t); @rename($t . '.prev', $t); @rename($t . '.prev.meta', $t . '.meta'); return ['restored' => true]; }
    @unlink($t); @unlink($t . '.meta');
    return ['removed' => true];
}

/** POST gp_pack_remove {id} → mis de côté (« ↶ Annuler » : gp_pack_restore) */
function gp_pack_remove(array $data): array
{
    $t = gp_path((string) ($data['id'] ?? ''));
    if (!is_file($t)) { throw new RuntimeException(i18n_t('Ce pack n’est pas installé.')); }
    @unlink($t . '.removed'); @unlink($t . '.removed.meta');
    if (!@rename($t, $t . '.removed')) { throw new RuntimeException(i18n_t('Pack impossible à retirer.')); }
    @rename($t . '.meta', $t . '.removed.meta');
    return ['ok' => true];
}

function gp_pack_restore(array $data): array
{
    $t = gp_path((string) ($data['id'] ?? ''));
    if (!is_file($t . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($t)) { throw new RuntimeException(i18n_t('Un autre pack a été installé entre-temps.')); }
    @rename($t . '.removed', $t); @rename($t . '.removed.meta', $t . '.meta');
    return ['ok' => true];
}

/** GET gp_status → {packs: {pack: {built, rows, size, licence}}, removed: [packs]} */
function gp_status(): array
{
    $packs = []; $removed = [];
    foreach (glob(gp_dir() . '/t*.json.gz*') ?: [] as $f) {
        $b = basename($f);
        if (preg_match('/^(t[kl]-[a-z]+(?:_[a-z]{2,5})?)\.json\.gz$/', $b, $m)) {
            $meta = json_decode((string) @file_get_contents($f . '.meta'), true);
            $packs[$m[1]] = (is_array($meta) ? $meta : []) + ['pack' => $m[1], 'built' => '', 'rows' => 0, 'size' => (int) filesize($f), 'shipped' => gp_shipped($m[1])];
        } elseif (preg_match('/^(t[kl]-[a-z]+(?:_[a-z]{2,5})?)\.json\.gz\.removed$/', $b, $m)) { $removed[] = $m[1]; }
    }
    ksort($packs);
    return ['packs' => (object) $packs, 'removed' => $removed];
}

/** la route (api.php) : lecture et téléchargement, rien n'est écrit dans la généalogie */
function gp_dispatch(string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            json_response(match ($action) {
                'gp_status' => gp_status(),
                'gp_dl_info' => (static function () { try { return gp_dl_info(); } catch (RuntimeException $e) { return ['packs' => (object) [], 'offline' => true, 'error' => $e->getMessage()]; } })(),
                'gp_dl_resume' => gp_dl_resume((string) ($_GET['id'] ?? '')),
                default => throw new RuntimeException('Action inconnue.'),
            });
        }
        json_response(match ($action) {
            'gp_dl_start' => gp_dl_start($payload),
            'gp_dl_step' => gp_dl_step($payload),
            'gp_dl_cancel' => gp_dl_cancel($payload),
            'gp_dl_finish' => gp_dl_finish($payload),
            'gp_pack_undo' => gp_pack_undo($payload),
            'gp_pack_remove' => gp_pack_remove($payload),
            'gp_pack_restore' => gp_pack_restore($payload),
            default => throw new RuntimeException('Action inconnue.'),
        });
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => $e->getMessage()], $e->getCode() === 404 ? 404 : 422); }
}
