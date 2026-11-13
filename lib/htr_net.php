<?php
declare(strict_types=1);

/**
 * ✍️ Lecture d'écriture manuscrite (HTR) : téléchargements sûrs et chemins bornés.
 * Utilisé par lib/htr_setup.php (l'app) et par scripts/htr_install.php (l'installation en arrière-plan) ;
 * aucune dépendance (pas de bootstrap), pour pouvoir être testé seul.
 *
 *  - htr_url_allowed()  : seulement HTTPS, seulement les sources prévues (Zenodo pour les modèles,
 *                         GitHub pour le Python tout prêt), aussi à chaque redirection ;
 *  - htr_http_get()     : téléchargement par morceaux, taille bornée, empreintes SHA-256 et MD5 calculées en route ;
 *  - htr_inside()       : un chemin reste dans le dossier prévu (jamais « .. », jamais un lien qui sort) ;
 *  - htr_rmtree()       : efface un dossier sans jamais suivre un lien symbolique, seulement dans le dossier prévu.
 */

const HTR_ALLOWED_HOSTS = [
    'zenodo.org',                           // modèles Kraken (dépôts officiels des auteurs)
    'api.github.com',                       // liste des fichiers du Python tout prêt (python-build-standalone)
    'github.com',                           // ses fichiers…
    'objects.githubusercontent.com',        // … servis par GitHub après une redirection
    'release-assets.githubusercontent.com',
];
const HTR_FREE_LICENSES = ['cc-by-4.0', 'cc-by-sa-4.0', 'cc0-1.0', 'cc-by-3.0', 'apache-2.0', 'mit', 'bsd-3-clause', 'cc-by-nc-4.0', 'cc-by-nc-sa-4.0'];

function htr_url_allowed(string $url): bool
{
    if (strlen($url) > 2000 || preg_match('/[\s\x00-\x1f\\\\]/', $url)) { return false; }
    $p = parse_url($url);
    if (!is_array($p) || strtolower((string) ($p['scheme'] ?? '')) !== 'https') { return false; }
    if (isset($p['user']) || isset($p['pass'])) { return false; }
    if (isset($p['port']) && (int) $p['port'] !== 443) { return false; }
    return in_array(strtolower((string) ($p['host'] ?? '')), HTR_ALLOWED_HOSTS, true);
}

/** La redirection « Location » rendue absolue (relative au lien d'avant). */
function htr_resolve_location(string $base, string $loc): string
{
    if (preg_match('#^https?://#i', $loc)) { return $loc; }
    $p = parse_url($base);
    $root = ($p['scheme'] ?? 'https') . '://' . ($p['host'] ?? '');
    if (str_starts_with($loc, '//')) { return ($p['scheme'] ?? 'https') . ':' . $loc; }
    if (str_starts_with($loc, '/')) { return $root . $loc; }
    $dir = preg_replace('#/[^/]*$#', '/', (string) ($p['path'] ?? '/'));
    return $root . $dir . $loc;
}

/**
 * Télécharge $url (HTTPS, sources prévues seulement, 5 redirections au plus, chacune vérifiée).
 * $dest null : renvoie le contenu ('body') ; sinon l'écrit dans $dest (qui doit déjà être un chemin vérifié).
 * Options : max_bytes (borne), progress(fn(int $done, int $total)), accept (en-tête Accept).
 * Renvoie ['body'?, 'bytes', 'sha256', 'md5', 'url'] ; lève une exception lisible sinon (code « no_network », « source »…).
 */
function htr_http_get(string $url, ?string $dest = null, array $opt = []): array
{
    $max = (int) ($opt['max_bytes'] ?? 50 * 1024 * 1024);
    for ($hop = 0; $hop <= 5; $hop++) {
        if (!htr_url_allowed($url)) {
            throw new RuntimeException('Adresse de téléchargement refusée (ce n’est pas une source prévue) : ' . mb_substr($url, 0, 120), 403);
        }
        $ctx = stream_context_create([
            'http' => ['follow_location' => 0, 'ignore_errors' => true, 'timeout' => 60, 'protocol_version' => 1.1,
                'header' => "User-Agent: LCNDA-HTR/1.0\r\nAccept: " . ($opt['accept'] ?? '*/*') . "\r\nConnection: close\r\n"],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $http_response_header = [];
        $in = @fopen($url, 'rb', false, $ctx);
        $headers = function_exists('http_get_last_response_headers') ? (http_get_last_response_headers() ?: $http_response_header) : $http_response_header;
        if (!$in) {
            throw new RuntimeException('Pas de réponse de ' . (parse_url($url, PHP_URL_HOST) ?: 'la source') . ' : vérifie la connexion à Internet.', 503);
        }
        $status = 0; $location = ''; $length = -1;
        foreach ((array) $headers as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', (string) $h, $m)) { $status = (int) $m[1]; $location = ''; $length = -1; }
            elseif (stripos((string) $h, 'Location:') === 0) { $location = trim(substr((string) $h, 9)); }
            elseif (stripos((string) $h, 'Content-Length:') === 0) { $length = (int) trim(substr((string) $h, 15)); }
        }
        if ($status >= 300 && $status < 400 && $location !== '') {
            fclose($in);
            $url = htr_resolve_location($url, $location);
            continue;
        }
        if ($status !== 200) {
            fclose($in);
            throw new RuntimeException('La source a répondu « ' . $status . ' » pour ' . (parse_url($url, PHP_URL_HOST) ?: '?') . '.', 502);
        }
        if ($length > $max) { fclose($in); throw new RuntimeException('Fichier plus gros que prévu : refusé.', 413); }
        $out = $dest !== null ? @fopen($dest, 'wb') : null;
        if ($dest !== null && !$out) { fclose($in); throw new RuntimeException('Écriture impossible dans le dossier des données.', 500); }
        $sha = hash_init('sha256'); $md5 = hash_init('md5'); $done = 0; $body = ''; $last = 0.0;
        while (!feof($in)) {
            $chunk = fread($in, 65536);
            if ($chunk === false) { break; }
            if ($chunk === '') { continue; }
            $done += strlen($chunk);
            if ($done > $max) { fclose($in); if ($out) { fclose($out); @unlink((string) $dest); } throw new RuntimeException('Fichier plus gros que prévu : refusé.', 413); }
            hash_update($sha, $chunk); hash_update($md5, $chunk);
            if ($out) { fwrite($out, $chunk); } else { $body .= $chunk; }
            if (isset($opt['progress']) && microtime(true) - $last > 0.5) { $last = microtime(true); ($opt['progress'])($done, max($length, 0)); }
        }
        fclose($in);
        if ($out) { fclose($out); }
        if ($length >= 0 && $done !== $length) { if ($dest !== null) { @unlink($dest); } throw new RuntimeException('Téléchargement interrompu : réessaie.', 503); }
        if (isset($opt['progress'])) { ($opt['progress'])($done, max($length, $done)); }
        $r = ['bytes' => $done, 'sha256' => hash_final($sha), 'md5' => hash_final($md5), 'url' => $url];
        if ($dest === null) { $r['body'] = $body; }
        return $r;
    }
    throw new RuntimeException('Trop de redirections.', 508);
}

/** L'empreinte attendue ('sha256:…', 'md5:…' ou 64 caractères hexadécimaux = SHA-256) correspond-elle au fichier téléchargé ? */
function htr_hash_matches(array $got, string $expected): bool
{
    $expected = strtolower(trim($expected));
    if (preg_match('/^(sha256:)?([a-f0-9]{64})$/', $expected, $m)) { return hash_equals($m[2], (string) ($got['sha256'] ?? '')); }
    if (preg_match('/^md5:([a-f0-9]{32})$/', $expected, $m)) { return hash_equals($m[1], (string) ($got['md5'] ?? '')); }
    return false;
}

/** Un chemin (existant ou à créer) est-il bien DANS $base ? Refuse « .. », les liens qui sortent et les noms bizarres. */
function htr_inside(string $base, string $path): bool
{
    $b = realpath($base);
    if ($b === false || $path === '' || str_contains($path, "\0")) { return false; }
    $norm = str_replace('\\', '/', $path);
    if (preg_match('#(^|/)\.\.(/|$)#', $norm)) { return false; }
    $sep = DIRECTORY_SEPARATOR; $b = rtrim($b, $sep);
    $within = static fn(string $r): bool => str_starts_with($r . $sep, $b . $sep);
    if (is_link($path)) { return false; }
    if (file_exists($path)) { $r = realpath($path); return $r !== false && $r !== $b && $within($r); }
    $parent = realpath(dirname($path));
    return $parent !== false && ($parent === $b || $within($parent)) && basename($norm) !== '' && basename($norm) !== '.';
}

/** Efface $dir (qui doit être dans $base) sans jamais suivre un lien symbolique. Renvoie le nombre d'octets libérés. */
function htr_rmtree(string $dir, string $base): int
{
    if (!is_dir($dir) || is_link($dir)) { if (is_link($dir) && htr_inside($base, dirname($dir) . '/x')) { @unlink($dir); } return 0; }
    $b = realpath($base); $d = realpath($dir);
    if ($b === false || $d === false || $d === $b || !str_starts_with($d . DIRECTORY_SEPARATOR, $b . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Dossier hors des données de la reconnaissance d’écriture : rien n’est effacé.');
    }
    $freed = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) {
        $p = $f->getPathname();
        if (is_link($p)) { @unlink($p) || @rmdir($p); continue; }
        if ($f->isDir()) { @rmdir($p); continue; }
        $freed += (int) @filesize($p);
        @unlink($p);
    }
    @rmdir($d);
    return $freed;
}

/** Nom de fichier de modèle acceptable (rien qui ressemble à un chemin). */
function htr_model_name_ok(string $name): bool
{
    return (bool) preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.mlmodel$/', $name);
}

/** Le Python tout prêt (python-build-standalone) qui convient à cet ordinateur, ou null. */
function htr_python_triple(string $os = PHP_OS_FAMILY, string $arch = ''): ?string
{
    $arch = strtolower($arch !== '' ? $arch : php_uname('m'));
    $x64 = in_array($arch, ['x86_64', 'amd64', 'x64'], true);
    $arm = in_array($arch, ['arm64', 'aarch64'], true);
    return match ($os) {
        'Darwin' => $arm ? 'aarch64-apple-darwin' : ($x64 ? 'x86_64-apple-darwin' : null),
        'Windows' => $x64 ? 'x86_64-pc-windows-msvc' : null,
        'Linux' => $arm ? 'aarch64-unknown-linux-gnu' : ($x64 ? 'x86_64-unknown-linux-gnu' : null),
        default => null,
    };
}

/** Le bon fichier dans la liste d'une version de python-build-standalone (Python 3.11, « install_only »). */
function htr_python_asset(array $assets, string $triple): ?array
{
    $rx = '/^cpython-3\.11\.\d+\+\d{8}-' . preg_quote($triple, '/') . '(-shared)?-install_only\.tar\.gz$/';
    foreach ($assets as $a) {
        if (is_array($a) && preg_match($rx, (string) ($a['name'] ?? ''))) { return $a; }
    }
    return null;
}
