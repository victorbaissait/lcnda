<?php
declare(strict_types=1);

/**
 * Emplacements des fichiers de l'application — sans aucun effet de bord (pas de session, pas de base),
 * pour pouvoir être chargé aussi par router.php à chaque requête.
 *
 * Par défaut : comportement historique (data/ et media/ dans le dossier de l'application).
 * L'application de bureau les redirige vers le dossier de l'utilisateur avec les variables
 * d'environnement GENEALOGY_DATA_DIR (bases, sauvegardes, réglages) et GENEALOGY_MEDIA_DIR (médias).
 */
if (!defined('APP_ROOT')) {
    define('APP_ROOT', __DIR__ . '/..');
}

function app_dir_from_env(string $variable, string $default): string
{
    $value = getenv($variable);
    if (!is_string($value) || trim($value) === '') {
        return $default;
    }
    $value = trim($value);
    if (DIRECTORY_SEPARATOR === '\\') {
        $value = str_replace('\\', '/', $value);
    }
    $value = rtrim($value, '/');
    return $value !== '' ? $value : $default;
}

if (!defined('DATA_DIR')) {
    define('DATA_DIR', app_dir_from_env('GENEALOGY_DATA_DIR', APP_ROOT . '/data'));
}
if (!defined('MEDIA_DIR')) {
    define('MEDIA_DIR', app_dir_from_env('GENEALOGY_MEDIA_DIR', APP_ROOT . '/media'));
}

// Réglages d'apparence « par défaut du site » : le fichier est ÉCRIT par l'application,
// il doit donc vivre dans le dossier de données quand l'app est installée (dossier de l'app en lecture seule).
if (!defined('SITE_DEFAULTS_LEGACY_PATH')) {
    define('SITE_DEFAULTS_LEGACY_PATH', APP_ROOT . '/config/site-defaults.json');
}
if (!defined('SITE_DEFAULTS_PATH')) {
    $customData = getenv('GENEALOGY_DATA_DIR');
    define('SITE_DEFAULTS_PATH', (is_string($customData) && trim($customData) !== '')
        ? DATA_DIR . '/site-defaults.json'
        : SITE_DEFAULTS_LEGACY_PATH);
}
