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

// Dossiers communs à toutes les généalogies : données géographiques téléchargées, reconnaissance d'écriture (HTR),
// adresses (BAN), tuiles de carte hors ligne… et la généalogie principale elle-même.
if (!defined('SHARED_DATA_DIR')) {
    define('SHARED_DATA_DIR', app_dir_from_env('GENEALOGY_DATA_DIR', APP_ROOT . '/data'));
}
if (!defined('SHARED_MEDIA_DIR')) {
    define('SHARED_MEDIA_DIR', app_dir_from_env('GENEALOGY_MEDIA_DIR', APP_ROOT . '/media'));
}

/**
 * Plusieurs généalogies, complètement séparées (personnes, médias, réglages, sauvegardes) : la principale reste dans
 * les dossiers habituels ; chaque autre a son dossier SHARED_DATA_DIR/genealogies/<id>/ (base, sauvegardes, réglages)
 * avec ses médias dans …/<id>/media. La liste et celle qui est ouverte sont dans SHARED_DATA_DIR/genealogies.json.
 */
function genealogy_id_ok(string $id): bool
{
    return (bool) preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/', $id);
}
function genealogies_registry(): array
{
    $file = SHARED_DATA_DIR . '/genealogies.json';
    $raw = is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
    $out = ['active' => '', 'main_name' => 'Ma généalogie', 'list' => []];
    if (is_array($raw)) {
        foreach ((array) ($raw['list'] ?? []) as $g) {
            if (is_array($g) && genealogy_id_ok((string) ($g['id'] ?? ''))) {
                $out['list'][] = ['id' => (string) $g['id'], 'name' => mb_substr(trim((string) ($g['name'] ?? '')), 0, 80) ?: (string) $g['id'], 'created_at' => (string) ($g['created_at'] ?? '')];
            }
        }
        $name = mb_substr(trim((string) ($raw['main_name'] ?? '')), 0, 80);
        if ($name !== '') { $out['main_name'] = $name; }
        $active = (string) ($raw['active'] ?? '');
        if ($active !== '' && in_array($active, array_column($out['list'], 'id'), true)) { $out['active'] = $active; }
    }
    return $out;
}
function genealogy_dir(string $id): string
{
    return SHARED_DATA_DIR . '/genealogies/' . $id;
}

if (!defined('GENEALOGY_ID')) {
    define('GENEALOGY_ID', defined('DATA_DIR') ? '' : genealogies_registry()['active']);
}
if (!defined('DATA_DIR')) {
    define('DATA_DIR', GENEALOGY_ID !== '' ? genealogy_dir(GENEALOGY_ID) : SHARED_DATA_DIR);
}
if (!defined('MEDIA_DIR')) {
    define('MEDIA_DIR', GENEALOGY_ID !== '' ? genealogy_dir(GENEALOGY_ID) . '/media' : SHARED_MEDIA_DIR);
}

// Réglages d'apparence « par défaut du site » : le fichier est ÉCRIT par l'application,
// il doit donc vivre dans le dossier de données quand l'app est installée (dossier de l'app en lecture seule).
if (!defined('SITE_DEFAULTS_LEGACY_PATH')) {
    define('SITE_DEFAULTS_LEGACY_PATH', APP_ROOT . '/config/site-defaults.json');
}
if (!defined('SITE_DEFAULTS_PATH')) {
    $customData = getenv('GENEALOGY_DATA_DIR');
    define('SITE_DEFAULTS_PATH', ((is_string($customData) && trim($customData) !== '') || GENEALOGY_ID !== '')
        ? DATA_DIR . '/site-defaults.json'
        : SITE_DEFAULTS_LEGACY_PATH);
}
