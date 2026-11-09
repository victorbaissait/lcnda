<?php
declare(strict_types=1);

/**
 * ⤓ Exports AVEC LES PHOTOS (Réglages → Export → « ⤓ Vers d'autres logiciels et sites ») :
 *  - GedZip (.gdz, zip) : « gedcom.ged » en GEDCOM 7 + les fichiers des médias dans « media/ » (chemins relatifs) ;
 *    l'archive est faite avec ZipArchive, comme la sauvegarde complète (lib/backup.php) — pas de second fabricant de ZIP ;
 *  - paquet Gramps (.gpkg) : tar.gz avec « data.gramps » (le XML de lib/export_gramps.php, compressé) + « media/… ».
 * Vie privée : comme les autres exports (vivants et fiches confidentielles cachés ou retirés, mode confidentialité) ; un
 * média où figure une personne cachée n'est jamais mis dans le paquet (echanges_media_touching). Les fichiers sont pris
 * seulement dans le dossier des médias (chemin vérifié). « estimate=1 » : la taille et le nombre de fichiers, avant.
 */

const PAQUET_MAX_BYTES = 4 * 1073741824; // 4 Go de médias au plus dans un paquet

/** Les fichiers des médias à mettre dans le paquet : [[nom dans le paquet, chemin], …], taille totale, manquants. */
function paquet_media_files(array $media): array
{
    $root = realpath(MEDIA_DIR);
    $files = []; $bytes = 0; $missing = 0; $seen = [];
    foreach ($media as $m) {
        $fn = trim((string) ($m['filename'] ?? ''));
        if ($fn === '' || preg_match('#^https?://#i', $fn)) { continue; }
        $base = basename(str_replace('\\', '/', $fn));
        if (isset($seen[$base])) { continue; }
        $path = $root ? realpath(MEDIA_DIR . '/' . $base) : false;
        if (!$root || !$path || !str_starts_with($path, $root . DIRECTORY_SEPARATOR) || !is_file($path) || is_link(MEDIA_DIR . '/' . $base)) { $missing++; continue; }
        $seen[$base] = true;
        $size = (int) filesize($path);
        $files[] = ['media/' . $base, $path, $size];
        $bytes += $size;
    }
    return [$files, $bytes, $missing];
}

/** Un en-tête tar (ustar) ; un nom trop long passe par un en-tête GNU « L » (lu aussi par l'import des .gpkg). */
function paquet_tar_header(string $name, int $size, int $mtime, string $type = '0'): string
{
    $h = str_pad(substr($name, 0, 99), 100, "\0") . str_pad('0000644', 7, '0', STR_PAD_LEFT) . "\0" . "0000000\0" . "0000000\0"
        . str_pad(decoct($size), 11, '0', STR_PAD_LEFT) . "\0" . str_pad(decoct($mtime), 11, '0', STR_PAD_LEFT) . "\0" . '        ' . $type
        . str_repeat("\0", 100) . "ustar\0" . '00' . str_pad('lcnda', 32, "\0") . str_pad('lcnda', 32, "\0") . str_repeat("\0", 8) . str_repeat("\0", 8) . str_repeat("\0", 155) . str_repeat("\0", 12);
    $sum = 0; for ($i = 0; $i < 512; $i++) { $sum += ord($h[$i]); }
    return substr_replace($h, str_pad(decoct($sum), 6, '0', STR_PAD_LEFT) . "\0 ", 148, 8);
}

/** Ajoute un fichier (ou un texte) au tar.gz ouvert. */
function paquet_tar_add($gz, string $name, ?string $path, ?string $data = null): void
{
    $size = $path !== null ? (int) filesize($path) : strlen((string) $data);
    $mtime = $path !== null ? (int) filemtime($path) : time();
    if (strlen($name) > 99) { gzwrite($gz, paquet_tar_header('././@LongLink', strlen($name) + 1, $mtime, 'L')); gzwrite($gz, str_pad($name . "\0", (int) ceil((strlen($name) + 1) / 512) * 512, "\0")); }
    gzwrite($gz, paquet_tar_header($name, $size, $mtime));
    if ($path !== null) {
        $in = fopen($path, 'rb');
        if ($in) { while (!feof($in)) { $c = fread($in, 1048576); if ($c === false || $c === '') { break; } gzwrite($gz, $c); } fclose($in); }
    } else { gzwrite($gz, (string) $data); }
    $pad = (512 - $size % 512) % 512;
    if ($pad) { gzwrite($gz, str_repeat("\0", $pad)); }
}

/** GET action=export_plus&format=gedzip|gpkg (&estimate=1 : seulement la taille, en JSON). */
function export_paquet(PDO $pdo, string $kind): never
{
    if (function_exists('memory_at_least')) { memory_at_least(1024); }
    $estimate = ($_GET['estimate'] ?? '') === '1';
    $tmp = []; // fichiers temporaires à retirer
    $cleanup = static function () use (&$tmp): void { foreach ($tmp as $f) { @unlink($f); } };
    register_shutdown_function($cleanup);
    try {
        if ($kind === 'gedzip') {
            $gedPath = tempnam(sys_get_temp_dir(), 'lcgz'); $tmp[] = $gedPath;
            $fh = fopen($gedPath, 'wb');
            // le partage (vivants cachés) est le réglage par défaut de ce paquet, comme le GEDCOM-X
            if (!isset($_GET['share'])) { $_GET['share'] = '1'; }
            $sink = ['stream' => $fh, 'version' => '7', 'media_prefix' => 'media/'];
            export_gedcom($pdo, $sink);
            fclose($fh);
            $media = $sink['media'] ?? []; $private = (int) ($sink['media_private'] ?? 0); $persons = (int) ($sink['persons'] ?? 0);
            $mainSize = (int) filesize($gedPath);
        } else {
            require_once __DIR__ . '/export_gramps.php';
            $cap = ['media_prefix' => 'media/'];
            export_gramps($pdo, $cap);
            // les médias laissés de côté parce qu'une personne cachée y figure (compte pour la fenêtre)
            $private = 0;
            $hidden = [];
            if (echanges_share(true)) { $all = $pdo->query(person_select() . ' ORDER BY p.id')->fetchAll(); $hidden = gedcom_share_hidden($pdo, $all, $pdo->query('SELECT * FROM families')->fetchAll()); }
            if ($hidden) { $private = count(array_diff_key(echanges_media_touching($pdo, $hidden), $cap['media'])); }
            $xmlGz = gzencode((string) $cap['xml'], 9);
            $media = $cap['media']; $persons = (int) $cap['persons'];
            $mainSize = strlen((string) $xmlGz);
        }
        [$files, $bytes, $missing] = paquet_media_files($media);
        if ($estimate) {
            json_response(['ok' => true, 'format' => $kind, 'persons' => $persons, 'media' => count($files), 'bytes' => $bytes + $mainSize, 'media_bytes' => $bytes,
                'missing' => $missing, 'private' => $private, 'too_big' => $bytes > PAQUET_MAX_BYTES]);
        }
        if ($bytes > PAQUET_MAX_BYTES) { json_response(['error' => 'Les médias font plus de 4 Go : le paquet serait trop gros. Fais plutôt une branche (une personne et ses ancêtres), ou une sauvegarde complète.'], 422); }
        $free = @disk_free_space(sys_get_temp_dir());
        if ($free !== false && $bytes + $mainSize > $free - 268435456) { json_response(['error' => 'Pas assez de place libre sur l’ordinateur pour fabriquer ce paquet.'], 422); }
        @set_time_limit(0);
        $stamp = date('Ymd-His');
        if ($kind === 'gedzip') {
            $zipPath = tempnam(sys_get_temp_dir(), 'lczip'); $tmp[] = $zipPath;
            $zip = new ZipArchive();
            if ($zip->open($zipPath, ZipArchive::OVERWRITE) !== true) { throw new RuntimeException('Le paquet GedZip n’a pas pu être fabriqué.'); }
            $zip->addFile($gedPath, 'gedcom.ged');
            foreach ($files as [$name, $path]) {
                $zip->addFile($path, $name);
                if (preg_match('/\.(jpe?g|png|gif|webp|heic|mp3|m4a|mp4|mov|webm|ogg)$/i', $name)) { $zip->setCompressionName($name, ZipArchive::CM_STORE); } // déjà compressés
            }
            if (!$zip->close()) { throw new RuntimeException('Le paquet GedZip n’a pas pu être écrit.'); }
            $out = $zipPath; $filename = 'genealogie-' . $stamp . '.gdz'; $mime = 'application/zip';
        } else {
            $tarPath = tempnam(sys_get_temp_dir(), 'lcgpkg'); $tmp[] = $tarPath;
            $gz = gzopen($tarPath, 'wb6');
            if (!$gz) { throw new RuntimeException('Le paquet Gramps n’a pas pu être fabriqué.'); }
            paquet_tar_add($gz, 'data.gramps', null, (string) $xmlGz);
            foreach ($files as [$name, $path]) { paquet_tar_add($gz, $name, $path); }
            gzwrite($gz, str_repeat("\0", 1024));
            gzclose($gz);
            $out = $tarPath; $filename = 'genealogie-' . $stamp . '.gpkg'; $mime = 'application/x-gramps-package';
        }
        while (ob_get_level() > 0) { ob_end_clean(); }
        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        header('Access-Control-Expose-Headers: X-LCNDA-Count, X-LCNDA-Media');
        header('X-LCNDA-Count: ' . $persons);
        header('X-LCNDA-Media: ' . count($files));
        header('Content-Length: ' . filesize($out));
        readfile($out);
    } finally {
        $cleanup();
    }
    exit;
}
