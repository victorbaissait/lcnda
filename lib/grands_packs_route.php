<?php
declare(strict_types=1);

/**
 * 📦 Les grands packs (lib/grands_packs.php) : le routeur (router.php) sert assets/data/<pack>.json.gz depuis le dossier des
 * données quand le pack a été installé à la demande et que l'app ne le livre pas. Léger : aucune base, aucune séance.
 * Le fichier livré, s'il existe, garde toujours la main (une nouvelle version de l'app le reprend).
 */

const GP_ID_RE = '/^t[kl]-[a-z]+(_[a-z]{2,5})?$/';

function gp_dir(): string
{
    return SHARED_DATA_DIR . '/grands-packs';
}

/** le fichier installé pour assets/data/<rel>, ou null */
function gp_route_file(string $rel): ?string
{
    if (!preg_match('#^(t[kl]-[a-z]+(?:_[a-z]{2,5})?)\.json\.gz$#', $rel, $m)) { return null; }
    if (is_file(APP_ROOT . '/assets/data/' . $rel)) { return null; }
    $f = gp_dir() . '/' . $m[1] . '.json.gz';
    return is_file($f) ? $f : null;
}

/** router.php : true si le pack installé a été servi */
function gp_route_serve(string $path): bool
{
    if (!str_starts_with($path, '/assets/data/t')) { return false; }
    $file = gp_route_file(substr($path, strlen('/assets/data/')));
    if ($file === null) { return false; }
    header('Content-Type: application/octet-stream');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-cache');
    header('X-LCNDA-Donnees: grand-pack');
    header('Content-Length: ' . (string) filesize($file));
    readfile($file);
    return true;
}
