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

function reference_archive_path(string $name = 'geo-fr'): string
{
    return APP_ROOT . '/data/reference/' . $name . '.sqlite.gz';
}

/** Fichier de référence décompressé (une fois, dans DATA_DIR/cache), ou null s'il n'est pas livré. */
function reference_database_path(string $name = 'geo-fr'): ?string
{
    $archive = reference_archive_path($name);
    if (!is_file($archive)) { return null; }
    $dir = DATA_DIR . '/cache';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { return null; }
    $target = $dir . '/reference-' . $name . '-' . substr(sha1((string) filesize($archive) . ':' . filemtime($archive)), 0, 12) . '.sqlite';
    if (is_file($target)) { return $target; }
    $partial = $target . '.' . bin2hex(random_bytes(4)) . '.part';
    $in = gzopen($archive, 'rb');
    $out = fopen($partial, 'wb');
    if (!$in || !$out) { return null; }
    while (!gzeof($in)) { fwrite($out, (string) gzread($in, 1 << 20)); }
    gzclose($in);
    fclose($out);
    if (!@rename($partial, $target)) { @unlink($partial); }
    foreach (glob($dir . '/reference-' . $name . '-*.sqlite') ?: [] as $old) { if ($old !== $target) { @unlink($old); } }
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

// ── Villes du monde (data/reference/geo-world.sqlite.gz, scripts/build-reference-world.php) ──
// Interrogées à la demande, jamais copiées en bloc dans la base : seul un lieu choisi y entre.

function world_reference(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) { return $pdo; }
    $path = reference_database_path('geo-world');
    try {
        $pdo = $path ? new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]) : null;
    } catch (Throwable) {
        $pdo = null;
    }
    return $pdo;
}

function world_search_key(string $value): string
{
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(ascii_fold($value))));
}

/** Villes du monde dont le nom (ou un mot du nom) commence par $q ; pays facultatif (nom français). */
function world_place_suggestions(string $q, string $country = '', int $limit = 10): array
{
    $world = world_reference();
    $key = world_search_key($q);
    if (!$world || mb_strlen($key) < 2 || $limit <= 0) { return []; }
    $params = [$key . '%', '% ' . $key . '%'];
    $where = '(search_key LIKE ? OR search_key LIKE ?)';
    if (trim($country) !== '') { $where .= ' AND country = ? COLLATE NOCASE'; $params[] = trim($country); }
    $stmt = $world->prepare("SELECT geoname_id, name, state, country, latitude, longitude, population FROM world_places WHERE {$where}
        ORDER BY (search_key LIKE ?) DESC, population DESC LIMIT " . (int) $limit);
    $stmt->execute([...$params, $key . '%']);
    return $stmt->fetchAll();
}

function world_place(int $geonameId): ?array
{
    $world = world_reference();
    if (!$world || $geonameId <= 0) { return null; }
    $stmt = $world->prepare('SELECT * FROM world_places WHERE geoname_id=?');
    $stmt->execute([$geonameId]);
    return $stmt->fetch() ?: null;
}

/** Ville du monde portant exactement ce nom dans ce pays (la plus peuplée), pour compléter un lieu tapé à la main. */
function world_place_exact(string $name, string $country): ?array
{
    $world = world_reference();
    $key = world_search_key($name);
    if (!$world || $key === '' || trim($country) === '') { return null; }
    $stmt = $world->prepare('SELECT * FROM world_places WHERE (search_key = ? OR search_key LIKE ?) AND country = ? COLLATE NOCASE ORDER BY population DESC LIMIT 1');
    $stmt->execute([$key . ' ' . $key, $key . ' %', trim($country)]);
    $row = $stmt->fetch();
    // search_key = « nom nom_ascii » : le nom doit correspondre en entier, pas seulement au début
    if ($row && world_search_key((string) $row['name']) !== $key) { return null; }
    return $row ?: null;
}

/** Lieu de la base pour une ville du monde : réutilise celui qui a déjà ce geoname_id, sinon le crée. */
function place_from_world(PDO $pdo, array $w): int
{
    $find = $pdo->prepare('SELECT id FROM places WHERE geoname_id=?');
    $find->execute([(int) $w['geoname_id']]);
    if ($id = $find->fetchColumn()) { return (int) $id; }
    // Même ville déjà saisie à la main (sans coordonnées) : on la complète au lieu d'en créer une deuxième.
    $same = $pdo->prepare('SELECT id FROM places WHERE geoname_id IS NULL AND name=? COLLATE NOCASE AND country=? COLLATE NOCASE ORDER BY id LIMIT 1');
    $same->execute([(string) $w['name'], (string) $w['country']]);
    if ($id = $same->fetchColumn()) {
        $pdo->prepare("UPDATE places SET geoname_id=?, state=CASE WHEN trim(COALESCE(state,''))='' THEN ? ELSE state END,
            latitude=COALESCE(latitude,?), longitude=COALESCE(longitude,?), population=? WHERE id=?")
            ->execute([(int) $w['geoname_id'], (string) $w['state'], $w['latitude'], $w['longitude'], (int) $w['population'], (int) $id]);
        return (int) $id;
    }
    $pdo->prepare('INSERT INTO places(geoname_id,name,state,country,latitude,longitude,population,feature_code) VALUES(?,?,?,?,?,?,?,?)')
        ->execute([(int) $w['geoname_id'], (string) $w['name'], (string) $w['state'], (string) $w['country'], $w['latitude'], $w['longitude'], (int) $w['population'], (string) ($w['feature_code'] ?? '')]);
    return (int) $pdo->lastInsertId();
}
