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
    if ($done !== false) { fix_contour_articles($pdo); return; }
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
    fix_contour_articles($pdo);
}

/**
 * Bases chargées avant le 2026-10-05 (dont celle de Victor) : le fichier des contours avait perdu l'article de ~2 000
 * communes (« Réole »). On reprend le nom de la référence seulement s'il ne diffère que par l'article. Une fois.
 */
function fix_contour_articles(PDO $pdo): void
{
    try {
        if ($pdo->query("SELECT value FROM meta WHERE key='reference_contour_articles'")->fetchColumn() !== false) { return; }
        $ref = reference_database_path();
        if ($ref === null) { return; }
        $pdo->exec('ATTACH DATABASE ' . $pdo->quote($ref) . ' AS ref');
        $pdo->beginTransaction();
        $fixed = $pdo->exec("UPDATE commune_contours SET name = (SELECT r.name FROM ref.commune_contours r WHERE r.insee_code = commune_contours.insee_code)
            WHERE EXISTS (SELECT 1 FROM ref.commune_contours r WHERE r.insee_code = commune_contours.insee_code
                AND r.name IN ('Le ' || commune_contours.name, 'La ' || commune_contours.name, 'Les ' || commune_contours.name, 'L''' || commune_contours.name))");
        $pdo->prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('reference_contour_articles',?)")->execute([(string) $fixed]);
        $pdo->commit();
        if ($fixed) { error_log("[référence] articles rétablis dans {$fixed} noms de communes"); }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('[référence] noms de communes : ' . $e->getMessage());
    } finally {
        try { $pdo->exec('DETACH DATABASE ref'); } catch (Throwable) {}
    }
}

// ── Villes du monde (data/reference/geo-world.sqlite.gz, scripts/build-reference-world.php) ──
// Interrogées à la demande, jamais copiées en bloc dans la base : seul un lieu choisi y entre.

function world_reference(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) { return $pdo; }
    $pdo = null;
    $path = reference_database_path('geo-world');
    if (!$path) { return null; }
    try {
        $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $pdo->exec('PRAGMA busy_timeout = 60000');
        // L'index de recherche n'est pas livré (fichier plus léger) : créé une fois sur cet ordinateur (~10 s).
        if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_world_big'")->fetchColumn()) {
            @set_time_limit(0);
            $pdo->exec('CREATE INDEX IF NOT EXISTS idx_world_search ON world_places(search_key)');
            $pdo->exec('CREATE INDEX IF NOT EXISTS idx_world_big ON world_places(search_key) WHERE population >= 1000');
        }
    } catch (Throwable $e) {
        error_log('[référence] villes du monde indisponibles : ' . $e->getMessage());
        $pdo = null;
    }
    return $pdo;
}

/** Prépare les villes du monde (décompression + index) : appelé au démarrage pour ne pas faire attendre la saisie. */
function prepare_world_reference(): void
{
    if (getenv('GENEALOGY_SKIP_REFERENCE') === '1') { return; }
    world_reference();
}

function world_search_key(string $value): string
{
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(ascii_fold($value))));
}

/**
 * Villes du monde dont le nom commence par $q ; pays facultatif (nom français). Trois passes sur index, rapides
 * même sur 5 millions de lieux : villes de plus de 1 000 habitants, puis nom exact, puis petits lieux.
 */
function world_place_suggestions(string $q, string $country = '', int $limit = 10): array
{
    $world = world_reference();
    $key = world_search_key($q);
    if (!$world || mb_strlen($key) < 2 || $limit <= 0) { return []; }
    $code = '';
    if (trim($country) !== '') {
        $stmt = $world->prepare('SELECT code FROM countries WHERE name = ? COLLATE NOCASE');
        $stmt->execute([trim($country)]);
        $code = (string) $stmt->fetchColumn();
        if ($code === '') { return []; }
    }
    $countryWhere = $code !== '' ? ' AND country_code = ' . $world->quote($code) : '';
    $select = 'SELECT w.geoname_id, w.name, w.search_key, w.state, w.country_code, w.latitude, w.longitude, w.population, c.name AS country FROM world_places w JOIN countries c ON c.code = w.country_code';
    $out = [];
    $add = static function (array $rows) use (&$out, $limit): void { foreach ($rows as $r) { if (count($out) < $limit) { $out[(int) $r['geoname_id']] = $r; } } };
    $passes = [
        "{$select} WHERE w.search_key >= ? AND w.search_key < ? AND w.population >= 1000{$countryWhere} ORDER BY w.population DESC LIMIT 50",
        "{$select} WHERE w.search_key = ?{$countryWhere} ORDER BY w.population DESC LIMIT 50",
        "{$select} WHERE w.geoname_id IN (SELECT geoname_id FROM world_places WHERE search_key >= ? AND search_key < ?{$countryWhere} LIMIT 200) ORDER BY w.population DESC",
    ];
    foreach ($passes as $i => $sql) {
        if (count($out) >= $limit) { break; }
        $stmt = $world->prepare($sql);
        $stmt->execute($i === 1 ? [$key] : [$key, $key . '~']);
        $add($stmt->fetchAll());
    }
    return array_values($out);
}

function world_place(int $geonameId): ?array
{
    $world = world_reference();
    if (!$world || $geonameId <= 0) { return null; }
    $stmt = $world->prepare('SELECT w.*, c.name AS country FROM world_places w JOIN countries c ON c.code = w.country_code WHERE w.geoname_id=?');
    $stmt->execute([$geonameId]);
    return $stmt->fetch() ?: null;
}

/** Ville du monde portant exactement ce nom dans ce pays (la plus peuplée), pour compléter un lieu tapé à la main. */
function world_place_exact(string $name, string $country): ?array
{
    $world = world_reference();
    $key = world_search_key($name);
    if (!$world || $key === '' || trim($country) === '') { return null; }
    $stmt = $world->prepare('SELECT w.*, c.name AS country FROM world_places w JOIN countries c ON c.code = w.country_code WHERE w.search_key = ? AND c.name = ? COLLATE NOCASE ORDER BY w.population DESC LIMIT 1');
    $stmt->execute([$key, trim($country)]);
    return $stmt->fetch() ?: null;
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

// ── Pays voisins activables pour les battues (data/reference/geo-<pays>.sqlite.gz, scripts/build-reference-europe.php) ──
// Codes préfixés (« BE-57081 ») ; la France garde ses codes INSEE. Chaque base choisit ses pays (meta.reference_countries).

/** Pays livrés avec l'application (hors France, toujours présente) : code => nom. */
function reference_countries_available(): array
{
    $out = [];
    foreach (glob(APP_ROOT . '/data/reference/geo-??.sqlite.gz') ?: [] as $file) {
        $cc = strtoupper(substr(basename($file), 4, 2));
        if ($cc === 'FR') { continue; }
        $out[$cc] = ['BE' => 'Belgique', 'CH' => 'Suisse', 'LI' => 'Liechtenstein', 'LU' => 'Luxembourg'][$cc] ?? $cc;
    }
    asort($out);
    return $out;
}

function reference_countries_active(PDO $pdo): array
{
    try { $v = $pdo->query("SELECT value FROM meta WHERE key='reference_countries'")->fetchColumn(); } catch (Throwable) { return []; }
    $list = $v ? json_decode((string) $v, true) : [];
    return is_array($list) ? array_values(array_filter($list, 'is_string')) : [];
}

/** Nom du pays d'une commune d'après son code (sans préfixe = France). */
function commune_country_name(string $code): string
{
    return preg_match('/^([A-Z]{2})-/', $code, $m) ? (reference_countries_available()[$m[1]] ?? $m[1]) : 'France';
}

/** Ajoute les communes, voisinages, lieux d'un pays, puis les voisinages avec les pays déjà présents. */
function enable_reference_country(PDO $pdo, string $cc): array
{
    $cc = strtoupper($cc);
    if (!isset(reference_countries_available()[$cc])) { throw new RuntimeException('Pays non disponible.'); }
    $ref = reference_database_path('geo-' . strtolower($cc));
    $borders = reference_database_path('geo-frontieres');
    if ($ref === null) { throw new RuntimeException('Données de ce pays introuvables.'); }
    @set_time_limit(0);
    $pdo->exec('ATTACH DATABASE ' . $pdo->quote($ref) . ' AS refc');
    if ($borders) { $pdo->exec('ATTACH DATABASE ' . $pdo->quote($borders) . ' AS refb'); }
    try {
        $pdo->beginTransaction();
        $contours = $pdo->exec('INSERT OR IGNORE INTO commune_contours(insee_code,name,geometry_json,min_lon,min_lat,max_lon,max_lat,centroid_lon,centroid_lat,updated_at)
            SELECT insee_code,name,geometry_json,min_lon,min_lat,max_lon,max_lat,centroid_lon,centroid_lat,CURRENT_TIMESTAMP FROM refc.commune_contours');
        $pdo->exec('INSERT OR IGNORE INTO commune_neighbors(insee_code,neighbor_insee_code) SELECT insee_code,neighbor_insee_code FROM refc.commune_neighbors');
        // Lieux : seulement ceux qui n'existent pas déjà (même identifiant GeoNames)
        $places = $pdo->exec('INSERT OR IGNORE INTO places(geoname_id,name,subdivision,county,state,country,alternate_names,latitude,longitude,admin4_code,feature_code,population)
            SELECT geoname_id,name,subdivision,county,state,country,alternate_names,latitude,longitude,admin4_code,feature_code,population FROM refc.geo_places g
            WHERE g.geoname_id IS NULL OR NOT EXISTS (SELECT 1 FROM places p WHERE p.geoname_id=g.geoname_id)');
        $across = 0;
        if ($borders) {
            $across = $pdo->exec('INSERT OR IGNORE INTO commune_neighbors(insee_code,neighbor_insee_code)
                SELECT b.insee_code,b.neighbor_insee_code FROM refb.border_neighbors b
                WHERE EXISTS (SELECT 1 FROM commune_contours c WHERE c.insee_code=b.insee_code)
                  AND EXISTS (SELECT 1 FROM commune_contours c WHERE c.insee_code=b.neighbor_insee_code)');
        }
        $active = array_values(array_unique([...reference_countries_active($pdo), $cc]));
        sort($active);
        $pdo->prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('reference_countries',?)")->execute([json_encode($active)]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    } finally {
        try { $pdo->exec('DETACH DATABASE refc'); } catch (Throwable) {}
        if ($borders) { try { $pdo->exec('DETACH DATABASE refb'); } catch (Throwable) {} }
    }
    return ['country' => $cc, 'communes' => (int) $contours, 'places' => (int) $places, 'border_links' => (int) $across];
}

/**
 * Retire un pays. REFUSÉ si une battue (ou toute autre donnée) utilise une de ses communes : les annotations de battue
 * seraient sinon effacées en cascade. Les lieux cités par un événement ou un recensement sont gardés.
 */
function disable_reference_country(PDO $pdo, string $cc): array
{
    $cc = strtoupper($cc);
    if (!preg_match('/^[A-Z]{2}$/', $cc) || $cc === 'FR') { throw new RuntimeException('La France ne peut pas être retirée.'); }
    $prefix = $cc . '-%';
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('commune_contours','commune_neighbors')")->fetchAll(PDO::FETCH_COLUMN) as $table) {
        foreach ($pdo->query('PRAGMA table_info("' . str_replace('"', '""', $table) . '")') as $col) {
            if (!preg_match('/insee_code$/', (string) $col['name'])) { continue; }
            $stmt = $pdo->prepare('SELECT count(*) FROM "' . str_replace('"', '""', $table) . '" WHERE "' . $col['name'] . '" LIKE ?');
            $stmt->execute([$prefix]);
            if ((int) $stmt->fetchColumn() > 0) {
                throw new RuntimeException('Des battues utilisent des communes de ce pays : retire-les d’abord de ces battues (rien n’a été supprimé).');
            }
        }
    }
    // Fichier du pays rattaché AVANT la transaction (SQLite refuse ATTACH pendant une transaction)
    $ref = reference_database_path('geo-' . strtolower($cc));
    $fromFile = '';
    if ($ref !== null) { $pdo->exec('ATTACH DATABASE ' . $pdo->quote($ref) . ' AS refc'); $fromFile = ' OR geoname_id IN (SELECT geoname_id FROM refc.geo_places WHERE geoname_id IS NOT NULL)'; }
    try {
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM commune_neighbors WHERE insee_code LIKE ? OR neighbor_insee_code LIKE ?')->execute([$prefix, $prefix]);
    $deleted = $pdo->prepare('DELETE FROM commune_contours WHERE insee_code LIKE ?');
    $deleted->execute([$prefix]);
    // Lieux du pays : gardés dès qu'une donnée les utilise (toute colonne « place_id », dans n'importe quelle table)
    $usedBy = [];
    foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name<>'places'")->fetchAll(PDO::FETCH_COLUMN) as $table) {
        foreach ($pdo->query('PRAGMA table_info("' . str_replace('"', '""', $table) . '")') as $col) {
            if (preg_match('/(^|_)place_id$/', (string) $col['name'])) {
                $usedBy[] = 'NOT EXISTS (SELECT 1 FROM "' . str_replace('"', '""', $table) . '" u WHERE u."' . $col['name'] . '"=places.id)';
            }
        }
    }
    // Lieux venus du fichier de ce pays (par leur code de commune, ou par leur identifiant GeoNames)
    $pdo->prepare('DELETE FROM places WHERE (admin4_code LIKE ?' . $fromFile . ')' . ($usedBy ? ' AND ' . implode(' AND ', $usedBy) : ''))->execute([$prefix]);
    $active = array_values(array_diff(reference_countries_active($pdo), [$cc]));
    $pdo->prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('reference_countries',?)")->execute([json_encode($active)]);
    $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    } finally {
        if ($ref !== null) { try { $pdo->exec('DETACH DATABASE refc'); } catch (Throwable) {} }
    }
    return ['country' => $cc, 'communes' => $deleted->rowCount()];
}
