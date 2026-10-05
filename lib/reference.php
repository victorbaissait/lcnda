<?php
declare(strict_types=1);

/**
 * Données de référence livrées avec LCNDA (data/reference/geo-fr.sqlite.gz, fabriqué par
 * scripts/build-reference.php depuis les sources publiques) : contours et voisinages des communes françaises
 * (battues, cartes) et ~81 000 communes / lieux-dits GeoNames (suggestions de lieux, coordonnées).
 *
 * Chargées UNE fois dans chaque base qui ne les a pas encore (base neuve, importée, ou ancienne base). Une base
 * qui a déjà des contours ou des lieux GeoNames n'est jamais modifiée : on ne réintroduit rien que l'utilisateur
 * aurait supprimé. Marque : meta.reference_geo_fr. GENEALOGY_SKIP_REFERENCE=1 désactive (tests rapides).
 */

function reference_archive_path(): string
{
    return APP_ROOT . '/data/reference/geo-fr.sqlite.gz';
}

/** Fichier de référence décompressé (une fois, dans DATA_DIR/cache), ou null s'il n'est pas livré. */
function reference_database_path(): ?string
{
    $archive = reference_archive_path();
    if (!is_file($archive)) { return null; }
    $dir = DATA_DIR . '/cache';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { return null; }
    $target = $dir . '/reference-geo-fr-' . substr(sha1((string) filesize($archive) . ':' . filemtime($archive)), 0, 12) . '.sqlite';
    if (is_file($target)) { return $target; }
    $partial = $target . '.' . bin2hex(random_bytes(4)) . '.part';
    $in = gzopen($archive, 'rb');
    $out = fopen($partial, 'wb');
    if (!$in || !$out) { return null; }
    while (!gzeof($in)) { fwrite($out, (string) gzread($in, 1 << 20)); }
    gzclose($in);
    fclose($out);
    if (!@rename($partial, $target)) { @unlink($partial); }
    foreach (glob($dir . '/reference-geo-fr-*.sqlite') ?: [] as $old) { if ($old !== $target) { @unlink($old); } }
    return is_file($target) ? $target : null;
}

function ensure_reference_data(PDO $pdo, string $dbPath): void
{
    if (getenv('GENEALOGY_SKIP_REFERENCE') === '1') { return; }
    try {
        $done = $pdo->query("SELECT value FROM meta WHERE key='reference_geo_fr'")->fetchColumn();
    } catch (Throwable) {
        return; // base sans table meta (ancienne structure en cours de migration) : on réessaiera
    }
    if ($done !== false) { return; }
    $ref = reference_database_path();
    if ($ref === null) { return; }

    // Un seul PHP charge à la fois (les autres attendent puis voient la marque).
    $lock = fopen($dbPath . '.reference-lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) { return; }
    try {
        if ($pdo->query("SELECT value FROM meta WHERE key='reference_geo_fr'")->fetchColumn() !== false) { return; }
        @set_time_limit(0);
        $started = microtime(true);
        $pdo->exec('ATTACH DATABASE ' . $pdo->quote($ref) . ' AS ref'); // lu seulement
        $version = (string) $pdo->query("SELECT value FROM ref.reference_info WHERE key='version'")->fetchColumn();
        $loaded = [];
        $pdo->beginTransaction();
        if ((int) $pdo->query('SELECT count(*) FROM commune_contours')->fetchColumn() === 0) {
            $pdo->exec('INSERT INTO commune_contours(insee_code,name,geometry_json,min_lon,min_lat,max_lon,max_lat,centroid_lon,centroid_lat,updated_at)
                SELECT insee_code,name,geometry_json,min_lon,min_lat,max_lon,max_lat,centroid_lon,centroid_lat,CURRENT_TIMESTAMP FROM ref.commune_contours');
            $loaded[] = 'contours';
        }
        if ((int) $pdo->query('SELECT count(*) FROM commune_neighbors')->fetchColumn() === 0) {
            $pdo->exec('INSERT OR IGNORE INTO commune_neighbors(insee_code,neighbor_insee_code) SELECT insee_code,neighbor_insee_code FROM ref.commune_neighbors');
            $loaded[] = 'voisinages';
        }
        if ((int) $pdo->query('SELECT count(*) FROM places WHERE geoname_id IS NOT NULL')->fetchColumn() === 0) {
            $pdo->exec('INSERT OR IGNORE INTO places(geoname_id,name,subdivision,county,state,country,alternate_names,latitude,longitude,admin1_code,admin2_code,admin3_code,admin4_code,feature_code,population)
                SELECT geoname_id,name,subdivision,county,state,country,alternate_names,latitude,longitude,admin1_code,admin2_code,admin3_code,admin4_code,feature_code,population FROM ref.geo_places');
            $loaded[] = 'communes GeoNames';
        }
        $pdo->prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('reference_geo_fr',?)")->execute([$version . ($loaded ? ' (' . implode(', ', $loaded) . ')' : ' (déjà présentes)')]);
        $pdo->commit();
        if ($loaded) {
            error_log(sprintf('[référence] %s : %s chargés en %.1f s', basename($dbPath), implode(', ', $loaded), microtime(true) - $started));
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('[référence] chargement impossible : ' . $e->getMessage());
    } finally {
        try { $pdo->exec('DETACH DATABASE ref'); } catch (Throwable) {}
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
