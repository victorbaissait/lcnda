<?php
declare(strict_types=1);

/**
 * Génère une archive d'installation propre : les données de l'utilisateur,
 * ses médias et les fichiers de développement ne quittent jamais ce dossier.
 */
require __DIR__ . '/lib/bootstrap.php';

if (!class_exists('ZipArchive')) {
    http_response_code(500);
    exit('La création de l’archive ZIP n’est pas disponible sur ce serveur PHP.');
}

$temporary = tempnam(sys_get_temp_dir(), 'lcnda-download-');
if ($temporary === false) {
    http_response_code(500);
    exit('Impossible de préparer le téléchargement.');
}

$zipPath = $temporary . '.zip';
@unlink($temporary);
$zip = new ZipArchive();
if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    @unlink($zipPath);
    http_response_code(500);
    exit('Impossible de créer l’archive ZIP.');
}

$root = realpath(__DIR__);
$excludedDirectories = ['.git', '.agents', '.codex', '.openai', 'media', 'node_modules', 'dist', 'backups'];
$excludedFiles = ['.DS_Store', '.env', '.env.local'];
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::LEAVES_ONLY
);

foreach ($iterator as $file) {
    if (!$file->isFile()) continue;
    $path = $file->getRealPath();
    $relative = ltrim(str_replace('\\', '/', substr($path, strlen($root))), '/');
    $parts = explode('/', $relative);
    if (array_intersect($parts, $excludedDirectories) || in_array(basename($relative), $excludedFiles, true)) continue;
    // data/ : seulement la structure de la base et les communes françaises (les autres pays se téléchargent à la demande),
    // jamais les bases ni les sauvegardes
    if ($parts[0] === 'data' && $relative !== 'data/schema.sql' && !preg_match('#^data/reference/(catalogue\.json|geo-(fr|frontieres)\.sqlite\.gz)$#', $relative)) continue;
    // Dossiers et fichiers cachés (.env.production, .idea…) : jamais dans l'archive, sauf .htaccess qui protège l'installation Apache
    $hidden = array_filter($parts, static fn($p) => str_starts_with($p, '.'));
    if ($hidden && $relative !== '.htaccess') continue;
    $zip->addFile($path, 'LCNDA/' . $relative);
}

$zip->addEmptyDir('LCNDA/data');
$zip->addEmptyDir('LCNDA/media');
$zip->addFromString('LCNDA/INSTALLATION.txt', "LE CARNET NUMÉRIQUE DES ANCÊTRES (LCNDA) — VERSION ALPHA 0.0.1\n\n1. Téléchargez puis décompressez l’archive : vous obtenez le dossier LCNDA.\n2. Installez et lancez un serveur local, tel que MAMP, XAMPP ou WampServer.\n3. Placez le dossier LCNDA dans le dossier web indiqué par cet outil.\n4. Ouvrez dans votre navigateur l’adresse qu’il affiche pour ce dossier. Elle peut par exemple ressembler à http://localhost/LCNDA/ ou http://localhost:8888/LCNDA/. Le nombre 8888 est normal : il dépend simplement de l’outil utilisé.\n5. À la première ouverture, importez un GEDCOM ou créez une première personne.\n\nCette archive ne contient aucune base généalogique ni aucun média personnel.\n");
$zip->close();

$downloadName = 'LCNDA-Le-Carnet-numerique-des-ancetres.zip';
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $downloadName . '"');
header('Content-Length: ' . (string) filesize($zipPath));
header('Cache-Control: no-store, private');
readfile($zipPath);
@unlink($zipPath);
exit;
