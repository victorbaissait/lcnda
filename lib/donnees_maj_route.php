<?php
declare(strict_types=1);

/**
 * 🗂 Données mises à jour (lib/donnees_maj.php) : le routeur (router.php) sert la version téléchargée d'un fichier de
 * assets/data/ à la place de celle livrée avec l'app. Léger : aucune base, aucune séance ; lu à chaque demande de assets/data/.
 *
 * La version téléchargée est rangée dans SHARED_DATA_DIR/donnees-maj/files/<chemin> (le dossier de l'app peut être en lecture
 * seule, ex. l'app de bureau). Elle n'est servie que si le fichier livré est toujours celui d'avant (même taille, même date) :
 * une nouvelle version de l'app, livrée avec des données plus récentes, reprend donc la main toute seule.
 */

function dmaj_route_dir(): string
{
    return SHARED_DATA_DIR . '/donnees-maj';
}

/** le fichier à servir pour assets/data/<rel>, ou null (alors le fichier livré) */
function dmaj_route_file(string $rel): ?string
{
    static $installed = null;
    if (!preg_match('#^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$#', $rel) || str_contains($rel, '..')) {
        return null;
    }
    $dir = dmaj_route_dir();
    if ($installed === null) {
        $f = $dir . '/installed.json';
        $installed = is_file($f) ? (json_decode((string) @file_get_contents($f), true) ?: []) : [];
    }
    $id = $installed['index'][$rel] ?? null;
    $file = is_string($id) ? ($installed['packs'][$id]['files'][$rel] ?? null) : null;
    if (!is_array($file) || empty($file['override'])) {
        return null;
    }
    if (!dmaj_route_shipped_same($rel, $file['shipped'] ?? null)) {
        return null;
    }
    $path = $dir . '/files/' . $rel;
    return is_file($path) ? $path : null;
}

/** le fichier livré est-il toujours celui qu'on a remplacé ? (null = il n'existait pas) */
function dmaj_route_shipped_same(string $rel, mixed $sig): bool
{
    $shipped = APP_ROOT . '/assets/data/' . $rel;
    clearstatcache(true, $shipped);
    if (!is_file($shipped)) {
        return $sig === null;
    }
    return is_array($sig) && (int) ($sig[0] ?? -1) === (int) filesize($shipped) && (int) ($sig[1] ?? -1) === (int) filemtime($shipped);
}

/** router.php : sert la version téléchargée si elle existe ; false = laisser PHP servir le fichier livré */
function dmaj_route_serve(string $path): bool
{
    if (!str_starts_with($path, '/assets/data/') || !is_file(dmaj_route_dir() . '/installed.json')) {
        return false;
    }
    $file = dmaj_route_file(substr($path, strlen('/assets/data/')));
    if ($file === null) {
        return false;
    }
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: ' . ($ext === 'json' ? 'application/json' : 'application/octet-stream'));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-cache');
    header('X-LCNDA-Donnees: maj');
    header('Content-Length: ' . (string) filesize($file));
    readfile($file);
    return true;
}
