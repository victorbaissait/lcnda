<?php
declare(strict_types=1);

/**
 * Routeur du serveur PHP intégré :  php -S 127.0.0.1:8080 -t . router.php
 *
 *  - sert /media/... depuis MEDIA_DIR (même s'il est hors du dossier de l'app), avec lecture
 *    partielle (Range, indispensable pour avancer dans une vidéo ou un audio) et cache ETag ;
 *  - interdit l'accès web aux dossiers et fichiers sensibles (bases SQLite, code, config…) ;
 *  - laisse PHP servir normalement le reste (index.php, api.php, upload.php, assets/…).
 */
require_once __DIR__ . '/lib/paths.php';

function router_deny(int $status = 404): bool
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $status === 404 ? 'Introuvable' : 'Refusé';
    return true;
}

function router_serve_media(string $relative): bool
{
    $root = realpath(MEDIA_DIR);
    $file = $root !== false ? realpath($root . '/' . $relative) : false;
    if ($root === false || $file === false || !is_file($file) || !str_starts_with($file, $root . DIRECTORY_SEPARATOR)) {
        return router_deny(404);
    }

    $types = [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp',
        'gif' => 'image/gif', 'tif' => 'image/tiff', 'tiff' => 'image/tiff', 'bmp' => 'image/bmp', 'heic' => 'image/heic',
        'pdf' => 'application/pdf',
        'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg',
        'aif' => 'audio/aiff', 'aiff' => 'audio/aiff', 'aifc' => 'audio/aiff',
        'mp4' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm',
    ];
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    // Type inconnu (ex. svg) : téléchargement brut, jamais interprété par le navigateur.
    $type = $types[$ext] ?? 'application/octet-stream';

    clearstatcache(true, $file);
    $size = (int) filesize($file);
    $mtime = (int) filemtime($file);
    $etag = '"' . dechex($mtime) . '-' . dechex($size) . '"';

    header('Content-Type: ' . $type);
    header('X-Content-Type-Options: nosniff');
    header('Accept-Ranges: bytes');
    // Les images peuvent être pivotées « sur place » : on fait revalider à chaque fois (304 si inchangé).
    header('Cache-Control: private, no-cache');
    header('ETag: ' . $etag);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');

    $ifNoneMatch = trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
    if ($ifNoneMatch !== '' && $ifNoneMatch === $etag) {
        http_response_code(304);
        return true;
    }

    $start = 0;
    $end = max(0, $size - 1);
    $status = 200;
    $range = trim((string) ($_SERVER['HTTP_RANGE'] ?? ''));
    if ($size > 0 && $range !== '' && preg_match('/^bytes=(\d*)-(\d*)$/', $range, $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $start = max(0, $size - (int) $m[2]);
        } else {
            $start = (int) $m[1];
            if ($m[2] !== '') {
                $end = min((int) $m[2], $size - 1);
            }
        }
        if ($start >= $size || $start > $end) {
            http_response_code(416);
            header('Content-Range: bytes */' . $size);
            return true;
        }
        $status = 206;
        header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
    }

    http_response_code($status);
    $length = $size > 0 ? $end - $start + 1 : 0;
    header('Content-Length: ' . $length);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD' || $length === 0) {
        return true;
    }

    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    $handle = fopen($file, 'rb');
    if ($handle === false) {
        return true;
    }
    fseek($handle, $start);
    $remaining = $length;
    while ($remaining > 0 && !feof($handle) && !connection_aborted()) {
        $chunk = fread($handle, min(65536, $remaining));
        if ($chunk === false || $chunk === '') {
            break;
        }
        echo $chunk;
        $remaining -= strlen($chunk);
    }
    fclose($handle);
    return true;
}

$path = rawurldecode((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));
if ($path === '' || str_contains($path, "\0") || str_contains($path, '..') || str_contains($path, '\\')) {
    return router_deny(400);
}

// Application de bureau : Electron fournit un secret (variable d'environnement) et l'ajoute à chaque requête
// de sa fenêtre. Sans lui, aucune page, aucune API, aucun média n'est servi : un autre programme ou une
// page web ouverte dans un navigateur ne peut pas interroger la base locale.
$appSecret = getenv('GENEALOGY_APP_SECRET');
if (is_string($appSecret) && $appSecret !== '') {
    $givenSecret = (string) ($_SERVER['HTTP_X_CARNET_SECRET'] ?? '');
    if (!hash_equals($appSecret, $givenSecret)) {
        return router_deny(403);
    }
}
if ($path === '/__health') {
    header('Content-Type: text/plain; charset=utf-8');
    echo 'ok';
    return true;
}

if (str_starts_with($path, '/media/')) {
    return router_serve_media(substr($path, 7));
}

$segments = array_values(array_filter(explode('/', $path), static fn($s) => $s !== ''));
$first = $segments[0] ?? '';
$blocked = ['data', 'lib', 'config', 'scripts', 'models', 'tests', 'vendor', 'node_modules', 'backups', 'media', 'electron', 'build', 'dist'];
foreach ($segments as $segment) {
    if (str_starts_with($segment, '.')) {
        return router_deny(404);
    }
}
if (in_array(strtolower($first), $blocked, true)) {
    return router_deny(404);
}

$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
if ($ext === '') {
    return false; // « / » → index.php
}
if ($ext === 'php') {
    return count($segments) === 1 ? false : router_deny(404); // seuls les scripts à la racine sont des pages
}
$anywhere = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'woff', 'woff2', 'ttf', 'otf'];
$assetsOnly = ['json', 'geojson', 'wasm', 'map', 'mjs', 'webmanifest', 'bin']; // bin : carte terre / mer des trajets en bateau
if (in_array($ext, $anywhere, true) || (in_array($ext, $assetsOnly, true) && $first === 'assets')) {
    return false; // fichier statique servi par PHP (404 automatique s'il n'existe pas)
}
return router_deny(404);
