<?php
declare(strict_types=1);

/**
 * Sauvegarde complète (base + médias) et ouverture d'une base existante.
 *
 * - export_full_backup() : un .zip avec la base (instantané VACUUM INTO), tous les fichiers de MEDIA_DIR et un
 *   petit fichier de description. Les photos sont stockées sans recompression (rapide, aucune perte).
 * - restore_package_upload() : depuis l'écran d'installation, ouvre un fichier .db/.sqlite exporté par l'application,
 *   ou une sauvegarde complète .zip (base + médias). Appelé AVANT db() : aucune connexion n'est ouverte sur la base
 *   remplacée. Refusé si une généalogie (au moins une personne) est déjà ouverte : on ne remplace jamais des données.
 */

const BACKUP_MARKER = 'lcnda-sauvegarde.json';
const BACKUP_MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'bmp',
    'pdf', 'mp3', 'm4a', 'aac', 'wav', 'aif', 'aiff', 'aifc', 'ogg', 'flac', 'mov', 'mp4', 'm4v', 'webm', 'avi', 'mkv'];

/** Fichiers de médias à sauvegarder (chemin relatif à MEDIA_DIR ⇒ chemin absolu), sans fichiers cachés. */
function backup_media_files(): array
{
    $files = [];
    if (!is_dir(MEDIA_DIR)) { return $files; }
    $base = rtrim(str_replace('\\', '/', MEDIA_DIR), '/') . '/';
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(MEDIA_DIR, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $info) {
        if (!$info->isFile()) { continue; }
        $path = str_replace('\\', '/', $info->getPathname());
        $relative = substr($path, strlen($base));
        if ($relative === '' || preg_match('#(^|/)\.#', $relative)) { continue; }
        $files[$relative] = $info->getPathname();
    }
    ksort($files, SORT_STRING);
    return $files;
}

function export_full_backup(PDO $pdo): never
{
    @set_time_limit(0);
    $tmpDir = sys_get_temp_dir() . '/lcnda-sauvegarde-' . bin2hex(random_bytes(6));
    if (!mkdir($tmpDir, 0700, true) && !is_dir($tmpDir)) {
        json_response(['error' => 'Impossible de créer le dossier temporaire de la sauvegarde.'], 500);
    }
    $dbCopy = $tmpDir . '/genealogie.db';
    $zipPath = $tmpDir . '/sauvegarde.zip';
    register_shutdown_function(static function () use ($tmpDir, $dbCopy, $zipPath): void {
        foreach ([$dbCopy, $zipPath] as $f) { if (is_file($f)) { @unlink($f); } }
        @rmdir($tmpDir);
    });
    $media = backup_media_files();
    $mediaBytes = 0;
    foreach ($media as $absolute) { $mediaBytes += (int) @filesize($absolute); }
    $dbBytes = (int) @filesize(DB_PATH);
    $free = @disk_free_space($tmpDir);
    if ($free !== false && $free < ($mediaBytes + 2 * $dbBytes) * 1.1) {
        json_response(['error' => 'Pas assez d’espace disque pour préparer la sauvegarde complète (il faut environ '
            . round(($mediaBytes + 2 * $dbBytes) / 1048576) . ' Mo libres).'], 507);
    }
    try {
        $pdo->exec('VACUUM main INTO ' . $pdo->quote($dbCopy));
        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Impossible de créer l’archive.');
        }
        $counts = [];
        foreach (['persons', 'families', 'events', 'media', 'notes', 'sources'] as $table) {
            $counts[$table] = (int) $pdo->query("SELECT count(*) FROM {$table}")->fetchColumn();
        }
        $zip->addFromString(BACKUP_MARKER, json_encode([
            'application' => 'LCNDA — Carnet numérique des ancêtres',
            'created_at' => date(DATE_ATOM),
            'schema_version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn(),
            'counts' => $counts,
            'media_files' => count($media),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $zip->addFromString('LISEZ-MOI.txt', "Sauvegarde complète du Carnet numérique des ancêtres (LCNDA).\n\n"
            . "genealogie.db : la base (personnes, événements, notes, sources…).\nmedia/ : les photos, documents, sons et vidéos.\n\n"
            . "Pour la rouvrir : sur l'écran de démarrage de LCNDA, « Importer un fichier » et choisir ce .zip.\n");
        $zip->addFile($dbCopy, 'genealogie.db');
        foreach ($media as $relative => $absolute) {
            $zip->addFile($absolute, 'media/' . $relative);
            // Les photos et vidéos sont déjà compressées : les stocker telles quelles est bien plus rapide.
            $zip->setCompressionName('media/' . $relative, ZipArchive::CM_STORE);
        }
        if (!$zip->close()) { throw new RuntimeException('Écriture de l’archive impossible.'); }
    } catch (Throwable $e) {
        json_response(['error' => 'Sauvegarde complète impossible : ' . $e->getMessage()], 500);
    }
    clearstatcache(true, $zipPath);
    $size = (int) filesize($zipPath);
    ignore_user_abort(true);
    while (ob_get_level() > 0) { ob_end_clean(); }
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="LCNDA-sauvegarde-complete-' . date('Ymd-His') . '.zip"');
    header('Content-Length: ' . $size);
    header('Cache-Control: no-store');
    readfile($zipPath);
    exit;
}

/** Vrai si le fichier envoyé doit être ouvert comme base (et non importé dans la base actuelle). */
function is_restore_upload(array $file): bool
{
    $ext = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (in_array($ext, ['db', 'sqlite'], true)) { return true; }
    if ($ext !== 'zip') { return false; }
    $zip = new ZipArchive();
    if ($zip->open((string) $file['tmp_name']) !== true) { return false; }
    $hasDb = false; $other = false;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $base = basename((string) $zip->getNameIndex($i));
        if ($base === BACKUP_MARKER) { $zip->close(); return true; }
        if (preg_match('/\.(db|sqlite)$/i', $base)) { $hasDb = true; }
        if (preg_match('/\.(ged|gedcom)$/i', $base) || $base === 'database') { $other = true; }
    }
    $zip->close();
    return $hasDb && !$other;
}

/** Contrôle qu'un fichier est bien une base de l'application, lisible et intacte. Renvoie le nombre de personnes. */
function validate_restore_database(string $path): array
{
    try {
        $check = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $tables = $check->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    } catch (Throwable) {
        throw new RuntimeException('Ce fichier n’est pas une base SQLite lisible.');
    }
    $missing = array_diff(['persons', 'families', 'events', 'event_types', 'places', 'media', 'notes'], $tables);
    if ($missing) {
        throw new RuntimeException('Ce fichier n’est pas une base du Carnet numérique des ancêtres (tables absentes : ' . implode(', ', $missing) . ').');
    }
    $version = (int) $check->query('PRAGMA user_version')->fetchColumn();
    if ($version > SCHEMA_VERSION) {
        throw new RuntimeException('Cette base vient d’une version plus récente de l’application : mets LCNDA à jour pour l’ouvrir.');
    }
    $quick = (string) $check->query('PRAGMA quick_check')->fetchColumn();
    if ($quick !== 'ok') {
        throw new RuntimeException('La base est abîmée (contrôle d’intégrité : ' . mb_substr($quick, 0, 120) . ').');
    }
    $persons = (int) $check->query('SELECT count(*) FROM persons')->fetchColumn();
    if ($persons === 0) { throw new RuntimeException('Cette base ne contient aucune personne.'); }
    $files = [];
    foreach ($check->query("SELECT filename FROM media WHERE trim(COALESCE(filename,''))<>''") as $row) {
        $name = trim((string) $row['filename']);
        if (!preg_match('#^https?://#i', $name)) { $files[] = $name; }
    }
    $check = null;
    return ['persons' => $persons, 'media_files' => $files];
}

function restore_package_upload(array $file): never
{
    @set_time_limit(0);
    if (is_file(DB_PATH)) {
        try {
            $current = new PDO('sqlite:' . DB_PATH, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $hasPeople = (int) $current->query('SELECT count(*) FROM persons')->fetchColumn() > 0;
        } catch (Throwable) {
            $hasPeople = true; // illisible : on ne prend pas le risque de l'écraser
        }
        $current = null;
        if ($hasPeople) {
            json_response(['error' => 'Une généalogie est déjà ouverte : elle ne sera pas remplacée. Ouvre ce fichier sur l’écran de démarrage d’une installation vide.'], 409);
        }
    }
    $dir = dirname(DB_PATH);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        json_response(['error' => 'Impossible de créer le dossier de la base.'], 500);
    }
    $incoming = $dir . '/.ouverture-' . bin2hex(random_bytes(6)) . '.sqlite';
    $stats = ['format' => 'sqlite', 'media_copied' => 0, 'media_already_present' => 0];
    $zip = null;
    try {
        $ext = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
        $mediaEntries = [];
        if ($ext === 'zip') {
            $stats['format'] = 'sauvegarde complète';
            $zip = new ZipArchive();
            if ($zip->open((string) $file['tmp_name']) !== true) { throw new RuntimeException('Impossible d’ouvrir l’archive.'); }
            $dbEntry = null;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = (string) $zip->getNameIndex($i);
                if (str_ends_with($name, '/') || str_contains($name, '..') || str_contains($name, '\\') || preg_match('#^(/|[A-Za-z]:)#', $name) || preg_match('#(^|/)(__MACOSX|\.)#', $name)) { continue; } // chemins absolus (Mac, Windows) refusés
                if ($dbEntry === null && preg_match('/\.(db|sqlite)$/i', $name)) { $dbEntry = $i; continue; }
                if (in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), BACKUP_MEDIA_EXTENSIONS, true)) { $mediaEntries[$i] = $name; }
            }
            if ($dbEntry === null) { throw new RuntimeException('Aucune base (.db) dans cette archive.'); }
            $in = $zip->getStream((string) $zip->getNameIndex($dbEntry));
            $out = fopen($incoming, 'wb');
            if (!$in || !$out || stream_copy_to_stream($in, $out) === false) { throw new RuntimeException('Lecture de la base impossible dans l’archive.'); }
            fclose($in); fclose($out);
        } elseif (!(empty($file['local']) && move_uploaded_file((string) $file['tmp_name'], $incoming)) && !copy((string) $file['tmp_name'], $incoming)) {
            throw new RuntimeException('Impossible d’enregistrer le fichier reçu.');
        }
        $valid = validate_restore_database($incoming);
        $stats['persons'] = $valid['persons'];

        // Médias de la sauvegarde → MEDIA_DIR (jamais d'écrasement d'un fichier déjà présent)
        if ($mediaEntries) {
            if (!is_dir(MEDIA_DIR) && !mkdir(MEDIA_DIR, 0775, true) && !is_dir(MEDIA_DIR)) { throw new RuntimeException('Impossible de créer le dossier des médias.'); }
            foreach ($mediaEntries as $name) {
                $relative = preg_replace('#^(.*/)?media/#', '', $name) ?: basename($name);
                $target = MEDIA_DIR . '/' . $relative;
                if (is_file($target)) { $stats['media_already_present']++; continue; }
                if (!is_dir(dirname($target))) { mkdir(dirname($target), 0775, true); }
                $in = $zip->getStream($name);
                $out = fopen($target . '.part', 'wb');
                if (!$in || !$out || stream_copy_to_stream($in, $out) === false) { throw new RuntimeException('Copie impossible : ' . $relative); }
                fclose($in); fclose($out);
                rename($target . '.part', $target);
                $stats['media_copied']++;
            }
        }
        $missing = 0;
        foreach ($valid['media_files'] as $name) { if (!is_file(MEDIA_DIR . '/' . $name)) { $missing++; } }
        $stats['media'] = count($valid['media_files']);
        $stats['media_missing'] = $missing;

        // Remplace la base vide de l'installation par la base reçue
        foreach ([DB_PATH, DB_PATH . '-wal', DB_PATH . '-shm', DB_PATH . '-journal'] as $old) {
            if (is_file($old) && !unlink($old)) { throw new RuntimeException('Impossible de remplacer la base vide.'); }
        }
        if (!rename($incoming, DB_PATH)) { throw new RuntimeException('Impossible de mettre la base en place.'); }
    } catch (Throwable $e) {
        if (is_file($incoming)) { @unlink($incoming); }
        json_response(['error' => $e->getMessage()], 422);
    } finally {
        if ($zip instanceof ZipArchive) { @$zip->close(); }
    }
    // Ouvre la base : mode WAL remis et structure mise à jour (avec copie de sécurité) si elle est ancienne.
    $pdo = db();
    $stats['schema_version'] = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
    json_response(['ok' => true, 'stats' => $stats, 'existing_persons_before' => 0, 'fusion_needed' => false]);
}

/**
 * Application de bureau : fichier choisi dans la fenêtre système, lu sur place (jamais modifié). Seul le processus
 * principal connaît GENEALOGY_LOCAL_SECRET ; la page web ne peut donc pas désigner elle-même un chemin.
 * Renvoie un tableau au format de $_FILES, marqué « local ».
 */
function local_import_file(array $payload): array
{
    $secret = (string) getenv('GENEALOGY_LOCAL_SECRET');
    $given = (string) ($_SERVER['HTTP_X_CARNET_LOCAL'] ?? '');
    if ($secret === '' || !hash_equals($secret, $given)) {
        json_response(['error' => 'Import par chemin réservé à l’application de bureau.'], 403);
    }
    $path = (string) ($payload['path'] ?? '');
    $real = $path !== '' ? realpath($path) : false;
    if ($real === false || !is_readable($real)) {
        json_response(['error' => 'Fichier introuvable ou illisible.'], 422);
    }
    $name = basename($real);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (is_dir($real)) {
        if (is_heredis_path($real)) {
            $name = pathinfo($name, PATHINFO_FILENAME) . '.hmw'; // dossier Hérédis, même sans l'extension
        } elseif ($ext !== 'mftpkg' || !is_file($real . '/database')) {
            json_response(['error' => 'Ce dossier n’est ni un paquet MacFamilyTree (.mftpkg), ni un fichier Hérédis (.hmw).'], 422);
        }
    } elseif (!in_array($ext, ['ged', 'gedcom', 'mftpkg', 'zip', 'gdz', 'db', 'sqlite', 'heredis'], true)) {
        json_response(['error' => "Format non pris en charge : .{$ext}"], 422);
    }
    return ['name' => $name, 'tmp_name' => $real, 'error' => UPLOAD_ERR_OK, 'size' => is_file($real) ? (int) filesize($real) : 0, 'local' => true];
}
