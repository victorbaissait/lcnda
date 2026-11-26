<?php
declare(strict_types=1);
/**
 * 🌦 Météo d'autrefois : installer un pack en UN bouton (rien de météo n'est livré avec l'app).
 * Les packs (.lcmeteo, fabriqués par scripts/meteo/build-meteo.py dans .github/workflows/meteo.yml) sont déposés dans la
 * version « meteo-donnees » du dépôt GitHub, coupés en morceaux de 1,9 Go au plus, avec meteo-manifest.json :
 *   {"version": "2025-11", "packs": {"socle": {"size": N, "sha256": "…", "parts": [{"name": "meteo-socle.lcmeteo.000", "size": N}]}, …}}
 * L'app lit le manifeste, puis télécharge le pack par tranches (16 Mo par appel, HTTP Range) dans le même dossier d'envoi
 * que l'import (meteo_pack_begin) : la fenêtre rappelle « meteo_dl_step » jusqu'au bout (barre d'avancée, pause, reprise
 * même après avoir fermé l'app), puis meteo_pack_finish vérifie l'en-tête, la taille et l'empreinte avant de ranger le pack.
 * Sécurité : seulement l'adresse de la version GitHub (et ses redirections, chacune revérifiée : link_safe_resolve), tailles
 * bornées, rien n'est envoyé. Essais : un dossier local à la place de GitHub (GENEALOGY_TEST=1 + LCNDA_TEST_METEO_DIR).
 */

const METEO_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/meteo-donnees/';
const METEO_DL_STEP = 16 * 1024 * 1024;

/** lit une adresse de la version météo (ou le dossier des essais) ; $range : [début, fin] en octets */
function meteo_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier météo refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_METEO_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Fichier introuvable sur le serveur des données météo.')); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = METEO_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, donnees meteo)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur des données météo.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Les données météo ne sont pas encore en ligne : réessaie plus tard, ou importe un fichier.'), 404); } // 404 : pas encore publié (≠ site injoignable)
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion au serveur des données météo : {err}', ['err' => $err]) : i18n_t('Le serveur des données météo répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/** GET meteo_dl_info → ce qui est en ligne (le manifeste, gardé une heure) */
function meteo_dl_info(): array
{
    $cache = meteo_pack_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(meteo_dl_get('meteo-manifest.json', null, 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des données météo est illisible.')); }
    $out = [];
    foreach ($m['packs'] as $kind => $p) {
        if (!isset(METEO_KINDS[$kind]) || !is_array($p['parts'] ?? null) || !$p['parts']) { continue; }
        $parts = []; $sum = 0;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { continue 2; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($sum !== (int) ($p['size'] ?? -1) || $sum > METEO_PACK_MAX) { continue; }
        $out[$kind] = ['size' => $sum, 'parts' => $parts, 'built' => (string) ($p['built'] ?? '')];
    }
    return ['version' => (string) ($m['version'] ?? ''), 'packs' => (object) $out];
}

/** POST meteo_dl_start {kind} → {id, size} (le fichier se remplit dans le dossier d'envoi de l'import) */
function meteo_dl_start(array $data): array
{
    $kind = (string) ($data['kind'] ?? '');
    $info = meteo_dl_info(); $p = ((array) $info['packs'])[$kind] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Ce pack n’est pas encore en ligne.')); }
    $r = meteo_pack_begin(['size' => $p['size']]);
    file_put_contents(substr(meteo_upload_path($r['id']), 0, -5) . '.dl', json_encode(['kind' => $kind, 'parts' => $p['parts']]));
    return ['id' => $r['id'], 'size' => $p['size'], 'kind' => $kind];
}

/** POST meteo_dl_step {id} → {received, size, done} : la tranche suivante (reprend où le fichier s'est arrêté) */
function meteo_dl_step(array $data): array
{
    $path = meteo_upload_path((string) ($data['id'] ?? ''));
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size'));
    if ($have >= $size) { return ['received' => $have, 'size' => $size, 'done' => true]; }
    // le morceau où l'on en est, et la place dans ce morceau
    $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + METEO_DL_STEP - 1);
            $bytes = meteo_dl_get($part['name'], [$from, $to], METEO_DL_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
            clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}

/** POST meteo_dl_cancel {id} → l'envoi en cours est effacé */
function meteo_dl_cancel(array $data): array
{
    $path = meteo_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.size', substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

/** GET meteo_dl_resume&id= → où en est un téléchargement interrompu */
function meteo_dl_resume(string $id): array
{
    $path = meteo_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta)) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'kind' => $meta['kind'], 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}
