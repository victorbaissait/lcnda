<?php
declare(strict_types=1);

/**
 * 🧪 Fabrique la base d'exemple (famille imaginaire, lib/exemple.php) dans un dossier à part, pour la vérifier ou la
 * regarder sans passer par l'app. Le dossier ne doit pas contenir de base.
 *
 *     php scripts/exemple-base.php /un/dossier/vide
 *
 * Résultat : /un/dossier/vide/genealogy.sqlite et ses images dans /un/dossier/vide/media.
 */

$dir = $argv[1] ?? '';
if ($dir === '') {
    fwrite(STDERR, "Usage : php scripts/exemple-base.php /un/dossier/vide\n");
    exit(1);
}
if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
    fwrite(STDERR, "Dossier impossible à créer : $dir\n");
    exit(1);
}
$dir = realpath($dir);
if (is_file($dir . '/genealogy.sqlite')) {
    fwrite(STDERR, "Ce dossier contient déjà une base : rien n'est fait.\n");
    exit(1);
}
putenv('GENEALOGY_DATA_DIR=' . $dir);
putenv('GENEALOGY_MEDIA_DIR=' . $dir . '/media');
putenv('GENEALOGY_SKIP_REFERENCE=1');
define('DATA_DIR', $dir);       // jamais la généalogie ouverte dans l'app
define('MEDIA_DIR', $dir . '/media');
define('GENEALOGY_ID', '');
require __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/exemple.php';

init_empty_database();
$stats = exemple_build(db(), MEDIA_DIR);
echo json_encode(['base' => DB_PATH] + $stats, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
