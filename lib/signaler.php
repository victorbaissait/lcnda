<?php
declare(strict_types=1);

/**
 * 🐞 « Signaler un problème » (assets/js/app-signaler.js) : ce que le serveur sait de lui-même, en NOMBRES seulement.
 * Version de l'app (package.json s'il est là), PHP, SQLite, système (famille seulement), structure de la base, nombre
 * de fiches, d'événements, de lieux, de médias… et taille de la base. Jamais un nom, une date, un lieu ni un chemin.
 * Lecture seule (GET report_info).
 */
function report_info(PDO $pdo): array
{
    $count = static function (string $sql) use ($pdo): ?int {
        try { return (int) $pdo->query($sql)->fetchColumn(); } catch (Throwable) { return null; }
    };
    $version = '';
    $pkg = defined('APP_ROOT') ? APP_ROOT . '/package.json' : '';
    if ($pkg !== '' && is_file($pkg)) {
        $j = json_decode((string) @file_get_contents($pkg), true);
        if (is_array($j) && is_string($j['version'] ?? null) && preg_match('/^\d{1,5}(\.\d{1,5}){0,2}(-[0-9A-Za-z.-]{1,40})?$/', $j['version'])) $version = $j['version'];
    }
    $sqlite = '';
    try { $sqlite = (string) $pdo->query('SELECT sqlite_version()')->fetchColumn(); } catch (Throwable) {}
    $schema = $count('PRAGMA user_version');
    $dbBytes = defined('DB_PATH') && is_file(DB_PATH) ? (int) @filesize(DB_PATH) : 0;
    $counts = [
        'persons' => $count("SELECT COUNT(*) FROM persons WHERE COALESCE(kind,'human') <> 'animal'") ?? $count('SELECT COUNT(*) FROM persons'),
        'animals' => $count("SELECT COUNT(*) FROM persons WHERE kind = 'animal'"),
        'families' => $count('SELECT COUNT(*) FROM families'),
        'events' => $count('SELECT COUNT(*) FROM events'),
        'places' => $count('SELECT COUNT(*) FROM places'),
        'media' => $count('SELECT COUNT(*) FROM media'),
        'sources' => $count('SELECT COUNT(*) FROM sources'),
        'notes' => $count('SELECT COUNT(*) FROM notes'),
    ];
    return [
        'version' => $version,
        'php' => PHP_VERSION,
        'sqlite' => preg_match('/^[\d.]{1,20}$/', $sqlite) ? $sqlite : '',
        'os' => PHP_OS_FAMILY,
        'schema' => $schema,
        'db_bytes' => $dbBytes,
        'counts' => array_filter($counts, static fn($v) => $v !== null),
    ];
}
