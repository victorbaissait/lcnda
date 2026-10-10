<?php
declare(strict_types=1);

/**
 * Migrations numérotées de la base SQLite.
 *
 * Le numéro de structure est rangé dans la base elle-même (PRAGMA user_version). À l'ouverture :
 *  - base à jour : rien à faire (une seule lecture, aucune vérification de colonnes à chaque requête) ;
 *  - base plus ancienne : un seul processus à la fois (verrou), copie de sécurité complète (VACUUM INTO)
 *    dans backups/, puis chaque migration manquante dans l'ordre, et le numéro est mis à jour après chacune ;
 *  - base plus récente que l'application : refus (ne jamais toucher une base qu'on ne connaît pas).
 *
 * POUR CHANGER LA STRUCTURE : ajouter une fonction schema_vN() et l'inscrire dans migration_steps(),
 * puis augmenter SCHEMA_VERSION. Ne jamais modifier une migration déjà publiée. Ne plus ajouter de
 * « try { ALTER TABLE … } catch » dans api.php ou upload.php.
 */

const SCHEMA_VERSION = 10;

/** @return array<int, callable(PDO): void> numéro de structure => migration qui y mène */
function migration_steps(): array
{
    return [
        1 => 'schema_v1',
        2 => 'schema_v2',
        3 => 'schema_v3',
        4 => 'schema_v4',
        5 => 'schema_v5',
        6 => 'schema_v6',
        7 => 'schema_v7',
        8 => 'schema_v8',
        9 => 'schema_v9',
        10 => 'schema_v10',
    ];
}

function migrate_database(PDO $pdo, string $dbPath): void
{
    $version = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
    if ($version === SCHEMA_VERSION) {
        return;
    }
    if ($version > SCHEMA_VERSION) {
        throw new RuntimeException(
            "Cette base a été créée ou mise à jour par une version plus récente de l'application "
            . "(structure n°{$version} ; cette version connaît jusqu'au n°" . SCHEMA_VERSION . "). "
            . "Mets l'application à jour avant de l'ouvrir. La base n'a pas été modifiée."
        );
    }

    // Un seul processus PHP fait la migration ; les autres attendent ici, puis trouvent la base à jour.
    $lockPath = $dbPath . '.migration-lock';
    $lock = @fopen($lockPath, 'c');
    if ($lock === false) {
        throw new RuntimeException('Impossible de créer le verrou de mise à jour de la base : ' . $lockPath);
    }
    flock($lock, LOCK_EX);
    try {
        $version = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
        if ($version >= SCHEMA_VERSION) {
            return;
        }
        // La mise à jour doit aller au bout même si la fenêtre se ferme ou recharge pendant ce temps.
        ignore_user_abort(true);
        @set_time_limit(3600);
        $started = microtime(true);
        $backup = migration_backup($pdo, $dbPath, $version);
        foreach (migration_steps() as $target => $step) {
            if ($target <= $version) {
                continue;
            }
            try {
                $step($pdo);
            } catch (Throwable $e) {
                throw new RuntimeException(
                    "La mise à jour de la base (structure n°{$target}) a échoué : " . $e->getMessage()
                    . ($backup ? " — Copie de sécurité faite juste avant : backups/" . basename($backup) : ''),
                    0,
                    $e
                );
            }
            $pdo->exec('PRAGMA user_version = ' . (int) $target);
            $pdo->prepare('INSERT OR REPLACE INTO app_migrations(name) VALUES(?)')->execute(['schema_v' . $target]);
            $version = $target;
        }
        error_log(sprintf(
            '[migration] %s : structure n°%d en %.1f s%s',
            basename($dbPath), $version, microtime(true) - $started,
            $backup ? ' (copie de sécurité : ' . basename($backup) . ')' : ''
        ));
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/**
 * Copie complète et cohérente de la base avant migration. Rien n'est copié pour une base neuve ou vide.
 * Nom en « genealogie-backup-…-migration-… » : visible dans la liste des sauvegardes, jamais supprimée
 * par la rotation automatique.
 */
function migration_backup(PDO $pdo, string $dbPath, int $fromVersion): ?string
{
    $hasPersons = (bool) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='persons'")->fetchColumn();
    if (!$hasPersons || (int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn() === 0) {
        return null;
    }
    $dir = DATA_DIR . '/backups';
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("Impossible de créer le dossier de sauvegarde : {$dir}");
    }
    $size = (int) @filesize($dbPath) + (int) @filesize($dbPath . '-wal');
    $free = @disk_free_space($dir);
    if ($free !== false && $free < $size * 1.1 + 200 * 1024 * 1024) {
        throw new RuntimeException(
            'Pas assez de place sur le disque pour la copie de sécurité faite avant la mise à jour de la base '
            . '(il faut environ ' . round($size / 1024 ** 3, 1) . ' Go libres). La base n’a pas été modifiée.'
        );
    }
    $name = sprintf(
        'genealogie-backup-%s-%s-migration-v%d-v%d.db',
        date('Ymd-His'), bin2hex(random_bytes(2)), $fromVersion, SCHEMA_VERSION
    );
    $target = $dir . '/' . $name;
    $pdo->exec('VACUUM main INTO ' . $pdo->quote($target));
    return $target;
}

/**
 * Structure n°1 : tout ce qui était vérifié à chaque requête jusqu'ici (ensure_schema dans bootstrap.php,
 * le bloc du début d'api.php, les colonnes ajoutées dans upload.php). Ces étapes vérifient elles-mêmes ce qui
 * existe déjà : elles amènent n'importe quelle ancienne base au même point.
 *
 * Elles sont répétées jusqu'à ce que la structure ne change plus : sur une base ancienne, un passage reconstruit
 * media_links après y avoir ajouté collection_key/collection_label, qui ne revenaient qu'à la requête suivante
 * (constaté sur la base de juin 2026 : 2 passages nécessaires).
 */
function schema_v1(PDO $pdo): void
{
    $fingerprint = static fn(): string => md5(implode("\n", $pdo->query(
        "SELECT type || ' ' || name || ' ' || coalesce(sql, '') FROM sqlite_master ORDER BY type, name"
    )->fetchAll(PDO::FETCH_COLUMN)));
    for ($pass = 1; $pass <= 5; $pass++) {
        $before = $fingerprint();
        ensure_schema($pdo);
        schema_v1_api_part($pdo);
        if ($fingerprint() === $before) {
            return;
        }
    }
    throw new RuntimeException('la structure de la base ne se stabilise pas après 5 passages');
}

/**
 * Structure n°2 : index sur les deux conjoints d'une famille. Sans eux, la date de mariage de chaque personne
 * listée (person_select) parcourait toutes les familles, deux fois. Tableau de bord mesuré : 606 → 264 ms.
 */
function schema_v2(PDO $pdo): void
{
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_families_partner1 ON families(partner1_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_families_partner2 ON families(partner2_id)');
}

/**
 * Structure n°3 (2026-10-05) : catalogue complet des types d'événements, pour qu'une base neuve (ou importée
 * d'Hérédis, d'un GEDCOM…) propose les mêmes types que la généalogie de référence de Victor. On AJOUTE seulement
 * les types absents (même portée et même balise, ou même libellé) : rien n'est supprimé, désactivé ou réactivé,
 * aucun événement n'est touché. Les libellés restés en anglais (anciens imports MacFamilyTree) sont traduits.
 */
function event_type_catalog(): array
{
    // [portée, slug, libellé, balise, icône, couleur]
    return [
        ['person', 'naissance', 'Naissance', 'BIRT', 'star', '#00cc8f'],
        ['person', 'bapteme', 'Baptême', 'CHR', 'churchBuilding', '#00ccb4'],
        ['person', 'deces', 'Décès', 'DEAT', 'cross', '#111111'],
        ['person', 'inhumation', 'Inhumation', 'BURI', 'grave', '#111111'],
        ['person', 'incineration', 'Incinération', 'CREM', 'diamond', '#0066cc'],
        ['person', 'obseques', 'Obsèques', 'FUNE', 'diamond', '#0066cc'],
        ['person', 'profession', 'Profession', 'OCCU', 'tool', '#0066cc'],
        ['person', 'lieu-de-residence', 'Lieu de résidence', 'RESI', 'house', '#cc4700'],
        ['person', 'domicile', 'Domicile', '', 'house', '#cc8100'],
        ['person', 'recensement', 'Recensement', 'CENS', 'diamond', '#0066cc'],
        ['person', 'adoption', 'Adoption', 'ADOP', 'diamond', '#0066cc'],
        ['person', 'reconnaissance', 'Reconnaissance', '', 'flower', '#00b4cc'],
        ['person', 'jugement-de-naissance', 'Jugement de naissance', '', 'diamondX', '#00aacc'],
        ['person', 'premiere-communion', 'Première communion', 'FCOM', 'diamond', '#0066cc'],
        ['person', 'confirmation', 'Confirmation', 'CONF', 'diamond', '#0066cc'],
        ['person', 'bar-mitzvah', 'Bar Mitzvah', 'BARM', 'diamond', '#0066cc'],
        ['person', 'bas-mitzvah', 'Bas Mitzvah', 'BASM', 'diamond', '#0066cc'],
        ['person', 'circoncision', 'Circoncision', 'CIRC', 'diamond', '#0066cc'],
        ['person', 'ordination', 'Ordination', 'ORDN', 'diamond', '#0066cc'],
        ['person', 'religion', 'Religion', 'RELI', 'diamond', '#0066cc'],
        ['person', 'excommunication', 'Excommunication', 'EXCO', 'diamond', '#0066cc'],
        ['person', 'formation', 'Formation', 'EDUC', 'diamond', '#0066cc'],
        ['person', 'apprentissage', 'Apprentissage', 'APPR', 'diamond', '#0066cc'],
        ['person', 'diplome', 'Diplôme', 'GRAD', 'diamond', '#0066cc'],
        ['person', 'retraite', 'Retraite', 'RETI', 'diamond', '#0066cc'],
        ['person', 'service-militaire', 'Service militaire', 'MISE', 'diamond', '#0066cc'],
        ['person', 'incorporation-militaire', 'Incorporation militaire', 'MIIN', 'diamond', '#0066cc'],
        ['person', 'liberation-militaire', 'Libération du service militaire', 'MIDE', 'diamond', '#0066cc'],
        ['person', 'recompense-militaire', 'Récompense militaire', 'MIAW', 'diamond', '#0066cc'],
        ['person', 'prisonnier-de-guerre', 'Prisonnier de guerre', '', 'chains', '#a000cc'],
        ['person', 'mission', 'Mission', 'MISS', 'diamond', '#0066cc'],
        ['person', 'emigration', 'Émigration', 'EMIG', 'diamond', '#0066cc'],
        ['person', 'immigration', 'Immigration', 'IMMI', 'diamond', '#0066cc'],
        ['person', 'naturalisation', 'Naturalisation', 'NATU', 'diamond', '#0066cc'],
        ['person', 'nationalite', 'Nationalité', 'NATI', 'diamond', '#0066cc'],
        ['person', 'titre-de-noblesse', 'Titre de noblesse', 'NOBI', 'diamond', '#0066cc'],
        ['person', 'surnom', 'Surnom', 'NICK', 'diamond', '#0066cc'],
        ['person', 'maladie', 'Maladie', 'ILL', 'diamond', '#0066cc'],
        ['person', 'fausse-couche', 'Fausse-couche', 'MISC', 'diamond', '#0066cc'],
        ['person', 'testament', 'Testament', 'WILL', 'diamond', '#0066cc'],
        ['person', 'acte', 'Acte', 'DEED', 'circle', '#0066cc'],
        ['person', 'transaction-fonciere', 'Transaction foncière', 'LATR', 'diamond', '#0066cc'],
        ['family', 'mariage', 'Mariage', 'MARR', 'rings', '#7a47db'],
        ['family', 'mariage-civil', 'Mariage civil', 'MRCI', 'diamond', '#0066cc'],
        ['family', 'mariage-religieux', 'Mariage religieux', 'MRRE', 'diamond', '#0066cc'],
        ['family', 'licence-de-mariage', 'Licence de mariage', 'MARL', 'diamond', '#0066cc'],
        ['family', 'publication-des-bans', 'Publication des bans', 'MARB', 'diamond', '#0066cc'],
        ['family', 'contrat-de-mariage', 'Contrat de mariage', 'MARC', 'diamond', '#0066cc'],
        ['family', 'accord-de-mariage', 'Accord de mariage', 'MARS', 'diamond', '#0066cc'],
        ['family', 'fiancailles', 'Fiançailles', 'ENGA', 'diamond', '#0066cc'],
        ['family', 'union-libre', 'Union libre', '_PRS', 'diamond', '#0066cc'],
        ['family', 'separation', 'Séparation', '_SEP', 'diamond', '#0066cc'],
        ['family', 'divorce', 'Divorce', 'DIV', 'diamond', '#cc0014'],
        ['family', 'recensement-famille', 'Recensement', 'CENS', 'diamond', '#0066cc'],
        ['family', 'autre-evenement', 'Autre événement', 'EVEN', 'diamond', '#0066cc'],
    ];
}

function schema_v3(PDO $pdo): void
{
    // Libellés anglais laissés par d'anciens imports → français (seulement le libellé exact, rien d'autre)
    $english = [
        ['family', 'Contract', 'Contrat de mariage'], ['family', 'Partnership', 'Union libre'], ['family', 'Separation', 'Séparation'],
        ['family', 'Settlement', 'Accord de mariage'], ['person', 'Apprenticeship', 'Apprentissage'],
        ['person', 'Land Transaction', 'Transaction foncière'], ['person', 'Military Discharge', 'Libération du service militaire'],
        ['person', 'Military Induction', 'Incorporation militaire'], ['person', 'Récompense Militaire', 'Récompense militaire'],
        ['person', 'surnom', 'Surnom'], ['person', 'Jugement de Naissance', 'Jugement de naissance'],
    ];
    $exists = $pdo->prepare('SELECT count(*) FROM event_types WHERE scope=? AND label=?');
    $rename = $pdo->prepare('UPDATE event_types SET label=? WHERE scope=? AND label=?');
    foreach ($english as [$scope, $from, $to]) {
        $exists->execute([$scope, $to]);
        if ((int) $exists->fetchColumn() === 0) { $rename->execute([$to, $scope, $from]); }
    }

    $known = [];
    foreach ($pdo->query('SELECT scope, label, gedcom_tag, slug FROM event_types') as $t) {
        $known[$t['scope'] . '|label|' . ascii_fold(mb_strtolower(trim((string) $t['label'])))] = true;
        if (trim((string) $t['gedcom_tag']) !== '' && $t['gedcom_tag'] !== 'EVEN') { $known[$t['scope'] . '|tag|' . strtoupper((string) $t['gedcom_tag'])] = true; }
        $known['slug|' . $t['slug']] = true;
    }
    $insert = $pdo->prepare("INSERT INTO event_types(scope,slug,label,gedcom_tag,icon,color,is_custom,is_active,is_artistic,custom_fields) VALUES(?,?,?,?,?,?,0,1,0,'')");
    foreach (event_type_catalog() as [$scope, $slug, $label, $tag, $icon, $color]) {
        if (isset($known[$scope . '|label|' . ascii_fold(mb_strtolower($label))])) { continue; }
        if ($tag !== '' && $tag !== 'EVEN' && isset($known[$scope . '|tag|' . $tag])) { continue; }
        $finalSlug = isset($known['slug|' . $slug]) ? $slug . '-' . bin2hex(random_bytes(3)) : $slug;
        $insert->execute([$scope, $finalSlug, $label, $tag, $icon, $color]);
        $known[$scope . '|label|' . ascii_fold(mb_strtolower($label))] = true;
        $known['slug|' . $finalSlug] = true;
    }
}

/**
 * Structure n°4 (2026-10-05) : réglages de l'interface (menus, apparence, tableau de bord, archives enregistrées,
 * liens externes… : clés « genealogie-* » du navigateur) rangés aussi dans la base, pour qu'ils suivent la
 * sauvegarde complète et un autre ordinateur. Voir save_settings (api.php) et le début d'assets/js/app.js.
 */
function schema_v4(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
}

/**
 * Structure n°5 (2026-10-07) : index pour les ~81 000 communes livrées avec l'app.
 *  - places(admin4_code) : recherche de la commune de départ d'une battue (176 s pour « ar » → 0,02 s) ;
 *  - places(name COLLATE NOCASE) : recherche de lieux mal lisibles, qui vérifie pour chaque commune qu'aucun lieu du
 *    même nom n'existe (21 s pour « sa » → 0,09 s) ;
 *  - census_records(place_id) : recensements d'un lieu.
 */
function schema_v5(PDO $pdo): void
{
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_places_admin4 ON places(admin4_code)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_places_name_nocase ON places(name COLLATE NOCASE)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_census_records_place ON census_records(place_id)');
}

/**
 * Structure n°6 (2026-10-08) : objets de famille (et leur transmission), mémoire familiale (recettes, expressions,
 * chansons, surnoms, traditions) avec leurs personnes, photos de ces deux collections, contrôle des liens web.
 */
function schema_v6(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS family_objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        origin_text TEXT NOT NULL DEFAULT '',
        holder_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        holder_text TEXT NOT NULL DEFAULT '',
        location_text TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS family_object_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        object_id INTEGER NOT NULL REFERENCES family_objects(id) ON DELETE CASCADE,
        from_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        from_text TEXT NOT NULL DEFAULT '',
        to_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        to_text TEXT NOT NULL DEFAULT '',
        date_text TEXT NOT NULL DEFAULT '',
        year INTEGER,
        note TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_object_transfers_object ON family_object_transfers(object_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS family_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'other',
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        origin_text TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS family_memory_people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id INTEGER NOT NULL REFERENCES family_memories(id) ON DELETE CASCADE,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'transmitted',
        UNIQUE(memory_id, person_id, role)
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_memory_people_person ON family_memory_people(person_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS family_collection_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_type TEXT NOT NULL CHECK(collection_type IN ('family_object','family_memory')),
        collection_id INTEGER NOT NULL,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_collection_media ON family_collection_media(collection_type, collection_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS link_checks (
        url TEXT PRIMARY KEY,
        status INTEGER,
        final_url TEXT NOT NULL DEFAULT '',
        archive_url TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}

/** Structure n°7 (2026-10-08) : salons et événements de généalogie (forums, congrès, journées portes ouvertes…). */
function schema_v7(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS genealogy_fairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT '',
        date_start TEXT NOT NULL DEFAULT '',
        date_end TEXT NOT NULL DEFAULT '',
        hours_text TEXT NOT NULL DEFAULT '',
        place_text TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        access_text TEXT NOT NULL DEFAULT '',
        prepare_text TEXT NOT NULL DEFAULT '',
        stands_text TEXT NOT NULL DEFAULT '',
        links TEXT NOT NULL DEFAULT '',
        price_text TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        attended INTEGER NOT NULL DEFAULT 0,
        reminder_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_genealogy_fairs_date ON genealogy_fairs(date_start)');
}

/**
 * Structure n°8 (2026-10-09) : branches fermées. Une ascendance (plus d'ancêtres à trouver) ou une descendance (lignée
 * éteinte) déclarée fermée depuis une personne ou un couple, avec un degré de certitude et la raison.
 */
function schema_v8(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS closed_branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        partner_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        direction TEXT NOT NULL CHECK(direction IN ('ascendance','descendance')),
        certainty TEXT NOT NULL DEFAULT 'likely',
        reason TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(person_id, direction)
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_closed_branches_partner ON closed_branches(partner_id)');
}

/**
 * Structure n°9 (2026-10-10) : départs (voyages, émigration), enfants placés, armoiries, poilus (unités et journaux de
 * marche), circuits « sur les traces de mes ancêtres », inventaire des papiers de famille, cartes anciennes posées sur la
 * carte, recherches enregistrées, prénoms de l'INSEE, inventaires après décès. Les photos de ces fiches vont dans
 * family_collection_media, recréée sans la liste fermée des types (et avec un rôle : liste de passagers, papiers…).
 */
function schema_v9(PDO $pdo): void
{
    foreach (['show_voyage_block', 'show_placement_block', 'show_heraldry_block', 'show_poilu_block'] as $col) {
        $has = (int) $pdo->query("SELECT count(*) FROM pragma_table_info('persons') WHERE name=" . $pdo->quote($col))->fetchColumn();
        if (!$has) { $pdo->exec("ALTER TABLE persons ADD COLUMN {$col} INTEGER NOT NULL DEFAULT 0"); }
    }

    $pdo->exec("CREATE TABLE family_collection_media_v9 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_type TEXT NOT NULL,
        collection_id INTEGER NOT NULL,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT ''
    )");
    $pdo->exec('INSERT INTO family_collection_media_v9(id,collection_type,collection_id,media_id,position) SELECT id,collection_type,collection_id,media_id,position FROM family_collection_media');
    $pdo->exec('DROP TABLE family_collection_media');
    $pdo->exec('ALTER TABLE family_collection_media_v9 RENAME TO family_collection_media');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_collection_media ON family_collection_media(collection_type, collection_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_collection_media_media ON family_collection_media(media_id)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS person_voyages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        departure_date TEXT NOT NULL DEFAULT '',
        departure_year INTEGER,
        departure_port TEXT NOT NULL DEFAULT '',
        ship_name TEXT NOT NULL DEFAULT '',
        destination TEXT NOT NULL DEFAULT '',
        arrival_date TEXT NOT NULL DEFAULT '',
        arrival_port TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        companions TEXT NOT NULL DEFAULT '',
        passenger_list_ref TEXT NOT NULL DEFAULT '',
        passenger_list_url TEXT NOT NULL DEFAULT '',
        passenger_list_text TEXT NOT NULL DEFAULT '',
        naturalization_date TEXT NOT NULL DEFAULT '',
        naturalization_place TEXT NOT NULL DEFAULT '',
        naturalization_text TEXT NOT NULL DEFAULT '',
        papers_text TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        stopovers TEXT NOT NULL DEFAULT '',
        dep_lat REAL, dep_lon REAL, dest_lat REAL, dest_lon REAL,
        route_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_person_voyages_person ON person_voyages(person_id)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS child_placements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'nourrice',
        institution TEXT NOT NULL DEFAULT '',
        matricule TEXT NOT NULL DEFAULT '',
        start_date TEXT NOT NULL DEFAULT '',
        start_year INTEGER,
        end_date TEXT NOT NULL DEFAULT '',
        end_year INTEGER,
        duration_text TEXT NOT NULL DEFAULT '',
        origin_text TEXT NOT NULL DEFAULT '',
        origin_lat REAL, origin_lon REAL,
        place_text TEXT NOT NULL DEFAULT '',
        lat REAL, lon REAL,
        nurse_name TEXT NOT NULL DEFAULT '',
        nurse_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        wage_text TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_child_placements_person ON child_placements(person_id)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS coats_of_arms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        blazon TEXT NOT NULL DEFAULT '',
        motto TEXT NOT NULL DEFAULT '',
        title_of_nobility TEXT NOT NULL DEFAULT '',
        origin_text TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS coat_of_arms_people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coat_id INTEGER NOT NULL REFERENCES coats_of_arms(id) ON DELETE CASCADE,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        note TEXT NOT NULL DEFAULT '',
        UNIQUE(coat_id, person_id)
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_coat_people_person ON coat_of_arms_people(person_id)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS poilu_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        unit_name TEXT NOT NULL DEFAULT '',
        date_from TEXT NOT NULL DEFAULT '',
        date_to TEXT NOT NULL DEFAULT '',
        jmo_cote TEXT NOT NULL DEFAULT '',
        jmo_url TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_poilu_units_person ON poilu_units(person_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS poilu_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        event_date TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'autre',
        place_text TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT ''
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_poilu_events_person ON poilu_events(person_id)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS field_trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        date_start TEXT NOT NULL DEFAULT '',
        date_end TEXT NOT NULL DEFAULT '',
        start_place TEXT NOT NULL DEFAULT '',
        stops_per_day INTEGER NOT NULL DEFAULT 6,
        people_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        done_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS field_trip_stops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL REFERENCES field_trips(id) ON DELETE CASCADE,
        day INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'autre',
        title TEXT NOT NULL DEFAULT '',
        place_text TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        lat REAL, lon REAL,
        to_photograph TEXT NOT NULL DEFAULT '',
        opening_hours TEXT NOT NULL DEFAULT '',
        people_text TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        done INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_field_trip_stops_trip ON field_trip_stops(trip_id, day, position)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS family_papers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_number TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT '',
        date_text TEXT NOT NULL DEFAULT '',
        storage_location TEXT NOT NULL DEFAULT '',
        holder_text TEXT NOT NULL DEFAULT '',
        condition_text TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        people_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS old_maps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        year_text TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
        img_w INTEGER NOT NULL DEFAULT 0,
        img_h INTEGER NOT NULL DEFAULT 0,
        control_points TEXT NOT NULL DEFAULT '[]',
        transform TEXT NOT NULL DEFAULT '',
        markers TEXT NOT NULL DEFAULT '[]',
        opacity INTEGER NOT NULL DEFAULT 70,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS saved_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        criteria TEXT NOT NULL DEFAULT '{}',
        seen_ids TEXT NOT NULL DEFAULT '[]',
        last_count INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS insee_prenoms (
        prenom TEXT NOT NULL,
        sexe INTEGER NOT NULL,
        annee INTEGER NOT NULL,
        nombre INTEGER NOT NULL
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_insee_prenoms_prenom ON insee_prenoms(prenom, annee)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS probate_inventories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        date_text TEXT NOT NULL DEFAULT '',
        year INTEGER,
        notary TEXT NOT NULL DEFAULT '',
        place_text TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'livre',
        reference TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_probate_inventories_person ON probate_inventories(person_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS probate_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inventory_id INTEGER NOT NULL REFERENCES probate_inventories(id) ON DELETE CASCADE,
        room TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'autre',
        description TEXT NOT NULL DEFAULT '',
        quantity TEXT NOT NULL DEFAULT '',
        value REAL,
        value_text TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_probate_items_inventory ON probate_items(inventory_id, position)');
}

/**
 * Structure n°10 (2026-10-11) : paroisses d'Ancien Régime (rattachement d'un lieu à la paroisse d'à côté), index des noms
 * cités dans les transcriptions (le « cercle » autour des ancêtres), dossier « Scans » surveillé, travail à deux
 * (identifiants communs uid sur les fiches, photo de ce qui a déjà été envoyé, journal des paquets).
 */
function schema_v10(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS place_parishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
        place_text TEXT NOT NULL DEFAULT '',
        parish_name TEXT NOT NULL DEFAULT '',
        parish_place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
        until_year INTEGER NOT NULL DEFAULT 1790,
        from_year INTEGER,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_place_parishes_place ON place_parishes(place_id)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS cited_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        name_key TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        occupation TEXT NOT NULL DEFAULT '',
        place_text TEXT NOT NULL DEFAULT '',
        year INTEGER,
        date_text TEXT NOT NULL DEFAULT '',
        media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
        event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
        person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        snippet TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cited_names_key ON cited_names(name_key)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cited_names_media ON cited_names(media_id)');

    $pdo->exec("CREATE TABLE IF NOT EXISTS scan_inbox_files (
        hash TEXT PRIMARY KEY,
        filename TEXT NOT NULL DEFAULT '',
        media_id INTEGER,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    foreach (['persons', 'families', 'family_children', 'events', 'places', 'notes'] as $table) {
        $has = (int) $pdo->query("SELECT count(*) FROM pragma_table_info('{$table}') WHERE name='uid'")->fetchColumn();
        if (!$has) { $pdo->exec("ALTER TABLE {$table} ADD COLUMN uid TEXT"); }
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_{$table}_uid ON {$table}(uid)");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS sync_snapshot (
        tbl TEXT NOT NULL,
        uid TEXT NOT NULL,
        hash TEXT NOT NULL,
        row_json TEXT NOT NULL,
        PRIMARY KEY (tbl, uid)
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS sync_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        direction TEXT NOT NULL,
        package_uid TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        change_count INTEGER NOT NULL DEFAULT 0,
        accepted_count INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}

/** Bloc déplacé tel quel depuis le début d'api.php (il y tournait à chaque requête). */
function schema_v1_api_part(PDO $pdo): void
{
    // Ensure event_witnesses table exists (additive migration)
    $pdo->exec("CREATE TABLE IF NOT EXISTS event_witnesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        person_id INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    // Additive migration : fichier des personnes décédées de l'INSEE (import CSV + recherche dédiée)
    $pdo->exec("CREATE TABLE IF NOT EXISTS insee_deces (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        nom                 TEXT NOT NULL DEFAULT '',
        prenom              TEXT NOT NULL DEFAULT '',
        prenoms             TEXT NOT NULL DEFAULT '',
        sexe                TEXT NOT NULL DEFAULT '',
        date_naissance      TEXT NOT NULL DEFAULT '',
        annee_naissance     INTEGER,
        code_lieu_naissance TEXT NOT NULL DEFAULT '',
        commune_naissance   TEXT NOT NULL DEFAULT '',
        pays_naissance      TEXT NOT NULL DEFAULT '',
        date_deces          TEXT NOT NULL DEFAULT '',
        annee_deces         INTEGER,
        code_lieu_deces     TEXT NOT NULL DEFAULT '',
        commune_deces       TEXT NOT NULL DEFAULT '',
        numero_acte_deces   TEXT NOT NULL DEFAULT '',
        source_file         TEXT NOT NULL DEFAULT '',
        source_import_id    INTEGER,
        created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_nom ON insee_deces(nom)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_prenom ON insee_deces(prenom)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_annee_naissance ON insee_deces(annee_naissance)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_annee_deces ON insee_deces(annee_deces)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_code_naissance ON insee_deces(code_lieu_naissance)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_code_deces ON insee_deces(code_lieu_deces)");
    // Journal des imports CSV successifs : permet d'afficher le nombre total de personnes dans la base
    // et jusqu'à quelle année/mois les données sont à jour.
    $pdo->exec("CREATE TABLE IF NOT EXISTS insee_deces_imports (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        filename         TEXT NOT NULL DEFAULT '',
        row_count        INTEGER NOT NULL DEFAULT 0,
        inserted_count   INTEGER NOT NULL DEFAULT 0,
        max_annee_deces  INTEGER,
        imported_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    // Additive migration : empreinte du fichier importé (protection anti double-import) et année
    // de décès la plus ancienne couverte par cet import, pour pouvoir afficher la plage complète
    // (de quand à quand) des données présentes en base.
    try { $pdo->exec("ALTER TABLE insee_deces_imports ADD COLUMN file_hash TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE insee_deces_imports ADD COLUMN min_annee_deces INTEGER"); } catch (Throwable $_) {}
    $inseeColumns = array_column($pdo->query("PRAGMA table_info(insee_deces)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('source_import_id', $inseeColumns, true)) {
        $pdo->exec("ALTER TABLE insee_deces ADD COLUMN source_import_id INTEGER");
    }
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_imports_hash ON insee_deces_imports(file_hash)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_source_file ON insee_deces(source_file)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_insee_deces_source_import ON insee_deces(source_import_id)");

    // Additive migration: ancien nom/pays du lieu sur les événements
    try { $pdo->exec("ALTER TABLE events ADD COLUMN date_calendar TEXT NOT NULL DEFAULT 'gregorian'"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE events ADD COLUMN date_converted TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE events ADD COLUMN date_alternative TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE events ADD COLUMN former_place_name TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE events ADD COLUMN former_country TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive migration: informations complémentaires (distinctes de la description et de l'adresse)
    try { $pdo->exec("ALTER TABLE events ADD COLUMN extra_info TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive migration: coordonnées GPS précises sur l'événement (rue, hameau…)
    try { $pdo->exec("ALTER TABLE events ADD COLUMN precise_lat REAL"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE events ADD COLUMN precise_lon REAL"); } catch (Throwable $_) {}
    // Additive migration: prénom et nom relevés dans l'acte (variante nominale pour l'événement)
    try { $pdo->exec("ALTER TABLE events ADD COLUMN first_name TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE events ADD COLUMN last_name TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive migration: prénom relevé séparé dans les membres de recensement
    try { $pdo->exec("ALTER TABLE census_members ADD COLUMN first_name TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive migration: hors généalogie (individu utile pour une enquête mais pas dans ma lignée)
    try { $pdo->exec("ALTER TABLE persons ADD COLUMN outside_genealogy INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    // Additive migration: bloc militaire (activé par défaut chez les hommes, optionnel chez les femmes)
    try { $pdo->exec("ALTER TABLE persons ADD COLUMN show_military_block INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE persons ADD COLUMN military_data TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive migration: artiste (photographie, peinture, littérature, cinéma, sculpture, théâtre, poésie, vidéo, arts plastiques, danse, scène)
    try { $pdo->exec("ALTER TABLE persons ADD COLUMN is_artist INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE persons ADD COLUMN artist_discipline TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE persons ADD COLUMN artist_events_display TEXT NOT NULL DEFAULT 'events'"); } catch (Throwable $_) {}
    // Additive migration: is_artistic sur event_types (flag pour les types liés à une pratique artistique)
    try { $pdo->exec("ALTER TABLE event_types ADD COLUMN is_artistic INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    // Additive migration: liste des champs spécifiques à une œuvre pour ce type d'événement (JSON, ex: ["Dimensions","Technique"])
    try { $pdo->exec("ALTER TABLE event_types ADD COLUMN custom_fields TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive migration: valeurs saisies pour les champs spécifiques d'une œuvre, sur l'événement (JSON, ex: {"Dimensions":"60x80cm"})
    try { $pdo->exec("ALTER TABLE events ADD COLUMN work_fields TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Niveau de confiance et justification sur le fait lui-même, indépendamment du média.
    try { $pdo->exec("ALTER TABLE events ADD COLUMN fact_confidence TEXT NOT NULL DEFAULT 'unknown'"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE events ADD COLUMN confidence_origin TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE events ADD COLUMN confidence_media_id INTEGER"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE media ADD COLUMN postcard_group TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE media ADD COLUMN postcard_side TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Un ensemble est rattaché à un contexte (événement ou fiche), jamais au média seul :
    // le même fichier peut donc être rangé différemment ailleurs dans la généalogie.
    try { $pdo->exec("ALTER TABLE media_links ADD COLUMN collection_key TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE media_links ADD COLUMN collection_label TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Migration unique des anciens lots d'images déjà associés à un même événement.
    // Elle ne touche ni aux fichiers ni aux autres rattachements éventuels du média.
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $legacyEventCollectionsApplied = $pdo->prepare("SELECT 1 FROM app_migrations WHERE name=?");
    $legacyEventCollectionsApplied->execute(['event_media_collections_v1']);
    if (!$legacyEventCollectionsApplied->fetchColumn()) {
        $legacyEvents = $pdo->query("SELECT entity_id FROM media_links WHERE entity_type='event' AND collection_key='' GROUP BY entity_id HAVING count(*) > 1")->fetchAll(PDO::FETCH_COLUMN);
        $assignLegacyCollection = $pdo->prepare("UPDATE media_links SET collection_key=?, collection_label=? WHERE entity_type='event' AND entity_id=? AND collection_key=''");
        $pdo->beginTransaction();
        try {
            foreach ($legacyEvents as $legacyEventId) {
                $assignLegacyCollection->execute(['event-'.(int)$legacyEventId.'-legacy', 'Documents de l’événement', (int)$legacyEventId]);
            }
            $pdo->prepare("INSERT INTO app_migrations(name) VALUES(?)")->execute(['event_media_collections_v1']);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }
    // Additive migration: bloc "Correspondance" (lettres, cartes postales, télégrammes…) sur la fiche personne.
    // Un média devient une correspondance dès que correspondence_type n'est pas vide ; correspondent_name
    // sert à classer les correspondances par personne (expéditeur/destinataire), sans imposer de lien avec
    // une fiche généalogique. Le rattachement à un événement (ex: 1re Guerre mondiale) réutilise le mécanisme
    // générique media_links existant (entity_type='event'), déjà exposé dans la visionneuse de médias.
    try { $pdo->exec("ALTER TABLE media ADD COLUMN correspondence_type TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE media ADD COLUMN correspondent_name TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive migration: liste JSON des destinataires/expéditeurs d'une correspondance (plusieurs personnes possibles),
    // ex: [{"id":12,"name":"Jean Dupont"},{"id":0,"name":"Nom libre non retrouvé dans l'arbre"}]. correspondent_name
    // reste alimenté (liste des noms séparés par des virgules) pour compatibilité et tri existants.
    try { $pdo->exec("ALTER TABLE media ADD COLUMN correspondent_json TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE media ADD COLUMN correspondence_reply_to_media_id INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE media ADD COLUMN media_subject_type TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive migration: calendrier utilisé pour la date du média (grégorien par défaut), comme pour les événements
    try { $pdo->exec("ALTER TABLE media ADD COLUMN date_calendar TEXT NOT NULL DEFAULT 'gregorian'"); } catch (Throwable $_) {}
    // Additive migration: identification de personnes sur les médias (zones rectangulaires)
    $pdo->exec("CREATE TABLE IF NOT EXISTS media_tags (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id   INTEGER NOT NULL,
        person_id  INTEGER NOT NULL,
        x          REAL    NOT NULL DEFAULT 0,
        y          REAL    NOT NULL DEFAULT 0,
        w          REAL    NOT NULL DEFAULT 0,
        h          REAL    NOT NULL DEFAULT 0,
        confidence TEXT    NOT NULL DEFAULT 'certain' CHECK(confidence IN ('certain','probable','possible','uncertain')),
        note       TEXT    NOT NULL DEFAULT '',
        created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    try { $pdo->exec("ALTER TABLE media_tags ADD COLUMN tag_type TEXT NOT NULL DEFAULT 'person'"); } catch (Throwable $_) {}
    // Additive migration: dossiers (et sous-dossiers) pour ranger les médias évalués d'une enquête
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_media_folders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        investigation_id INTEGER NOT NULL,
        parent_id       INTEGER,
        name            TEXT    NOT NULL DEFAULT 'Dossier',
        created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    // Table des personnes liées à une enquête (principales ou secondaires)
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_persons (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        investigation_id INTEGER NOT NULL,
        person_id       INTEGER NOT NULL,
        role            TEXT    NOT NULL DEFAULT 'secondary' CHECK(role IN ('primary','secondary')),
        created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(investigation_id, person_id)
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS battue_persons (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        battue_id       INTEGER NOT NULL,
        person_id       INTEGER NOT NULL,
        role            TEXT    NOT NULL DEFAULT 'primary' CHECK(role IN ('primary','secondary')),
        created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(battue_id, person_id)
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_battues (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        investigation_id  INTEGER NOT NULL,
        battue_id         INTEGER NOT NULL,
        created_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(investigation_id, battue_id)
    )");
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN reminder_due_at TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN reminder_mode TEXT NOT NULL DEFAULT 'none'"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN reminder_done INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN reminder_done_at TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN linked_event_id INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN linked_event_label TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN archive_digest_id INTEGER"); } catch (Throwable $_) {}
    $pdo->exec("CREATE TABLE IF NOT EXISTS standalone_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        reminder_mode TEXT NOT NULL DEFAULT 'on' CHECK(reminder_mode IN ('on','before','after')),
        reminder_due_at TEXT NOT NULL DEFAULT '',
        reminder_done INTEGER NOT NULL DEFAULT 0,
        reminder_done_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    try { $pdo->exec("ALTER TABLE standalone_reminders ADD COLUMN reminder_category TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    // Additive: fiches en ligne rattachées à une personne (ex. Geneanet, Filae…) avec vérification
    // champ par champ (exact / inexact / incomplet / approximatif / inconnu) + commentaire libre.
    $pdo->exec("CREATE TABLE IF NOT EXISTS person_online_sheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        site TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        checks_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS research_budget (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'autre',
        amount REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'EUR',
        expense_date TEXT NOT NULL DEFAULT '',
        renewal_date TEXT NOT NULL DEFAULT '',
        vendor TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS courriers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organisme TEXT NOT NULL DEFAULT 'mairie',
        destinataire TEXT NOT NULL DEFAULT '',
        objet TEXT NOT NULL DEFAULT '',
        date_envoi TEXT NOT NULL DEFAULT '',
        statut TEXT NOT NULL DEFAULT 'envoye',
        relance_delai_jours INTEGER NOT NULL DEFAULT 30,
        relance_date TEXT NOT NULL DEFAULT '',
        fait INTEGER NOT NULL DEFAULT 0,
        fait_type TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    // Carnet d'adresses autonome : les vivants n'ont pas à être créés dans l'arbre
    // pour organiser une réunion familiale ou conserver un contact.
    $pdo->exec("CREATE TABLE IF NOT EXISTS living_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        relationship TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        phone_mobile TEXT NOT NULL DEFAULT '',
        phone_landline TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        postal_code TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT 'France',
        attendance_status TEXT NOT NULL DEFAULT 'unknown',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    try { $pdo->exec("ALTER TABLE living_contacts ADD COLUMN person_id INTEGER"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE living_contacts ADD COLUMN phone_mobile TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE living_contacts ADD COLUMN phone_landline TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    $pdo->exec("UPDATE living_contacts SET phone_mobile=phone WHERE phone_mobile='' AND phone<>''");
    // Détails structurés du bordereau de commande de copies, conservés avec le courrier.
    try { $pdo->exec("ALTER TABLE courriers ADD COLUMN copy_order_json TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE battue_search_items ADD COLUMN register TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE battue_search_items ADD COLUMN archive_digest_id INTEGER"); } catch (Throwable $_) {}
    // Additive migration: classement d'un média évalué dans un dossier (NULL = à la racine de l'enquête)
    try { $pdo->exec("ALTER TABLE investigation_media ADD COLUMN folder_id INTEGER"); } catch (Throwable $_) {}
    // Additive migration: colonne traçant les liens media_links créés automatiquement par une identification
    try { $pdo->exec("ALTER TABLE media_links ADD COLUMN media_tag_id INTEGER"); } catch (Throwable $_) {}
    // Additive migration: étendre la contrainte CHECK de media_links pour accepter entity_type='military'.
    // SQLite ne supporte pas ALTER TABLE … MODIFY CONSTRAINT, on recrée donc la table si la contrainte est encore restrictive.
    // On utilise les méthodes PDO (pas BEGIN/COMMIT en SQL brut) pour éviter toute transaction imbriquée.
    try {
        $mlDdl = $pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='media_links'")->fetchColumn();
        if ($mlDdl !== false && str_contains((string)$mlDdl, "'census'") && !str_contains((string)$mlDdl, "'military'")) {
            $pdo->exec("PRAGMA foreign_keys=OFF");
            $pdo->beginTransaction();
            $pdo->exec("CREATE TABLE IF NOT EXISTS media_links_new (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER,
                media_id  INTEGER NOT NULL,
                entity_type TEXT NOT NULL CHECK(entity_type IN ('person','family','event','source','census','military','battue_item')),
                entity_id INTEGER NOT NULL,
                position  INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )");
            $mlCols = array_column($pdo->query("PRAGMA table_info(media_links)")->fetchAll(PDO::FETCH_ASSOC), 'name');
            if (in_array('created_at', $mlCols, true)) {
                $pdo->exec("INSERT INTO media_links_new SELECT id,source_id,media_id,entity_type,entity_id,position,created_at FROM media_links");
            } else {
                $pdo->exec("INSERT INTO media_links_new(id,source_id,media_id,entity_type,entity_id,position) SELECT id,source_id,media_id,entity_type,entity_id,position FROM media_links");
            }
            $pdo->exec("DROP TABLE media_links");
            $pdo->exec("ALTER TABLE media_links_new RENAME TO media_links");
            $pdo->commit();
            $pdo->exec("PRAGMA foreign_keys=ON");
        }
    } catch (Throwable $_) { if ($pdo->inTransaction()) $pdo->rollBack(); }
    try {
        $mlDdl = $pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='media_links'")->fetchColumn();
        if ($mlDdl !== false && !str_contains((string)$mlDdl, "'battue_item'")) {
            $pdo->exec("PRAGMA foreign_keys=OFF");
            $pdo->beginTransaction();
            $mlCols = array_column($pdo->query("PRAGMA table_info(media_links)")->fetchAll(PDO::FETCH_ASSOC), 'name');
            $pdo->exec("CREATE TABLE media_links_new (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER,
                media_id  INTEGER NOT NULL,
                entity_type TEXT NOT NULL CHECK(entity_type IN ('person','family','event','source','census','military','battue_item')),
                entity_id INTEGER NOT NULL,
                position  INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                media_tag_id INTEGER
            )");
            $copy = array_values(array_filter(['id','source_id','media_id','entity_type','entity_id','position','created_at','media_tag_id'], static fn($col) => in_array($col, $mlCols, true)));
            $colList = implode(',', $copy);
            $pdo->exec("INSERT INTO media_links_new($colList) SELECT $colList FROM media_links");
            $pdo->exec("DROP TABLE media_links");
            $pdo->exec("ALTER TABLE media_links_new RENAME TO media_links");
            $pdo->commit();
            $pdo->exec("PRAGMA foreign_keys=ON");
        }
    } catch (Throwable $_) { if ($pdo->inTransaction()) $pdo->rollBack(); }
    // Additive migration: module Cimetière — une sépulture peut accueillir plusieurs personnes
    // (tombe familiale), et reste consultable même si elle n'existe plus (grave_exists=0).
    $pdo->exec("CREATE TABLE IF NOT EXISTS graves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cemetery_name TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        plan_ref TEXT NOT NULL DEFAULT '',
        gps_lat REAL,
        gps_lon REAL,
        condition_state TEXT NOT NULL DEFAULT 'inconnu' CHECK(condition_state IN ('bon','moyen','mauvais','a_restaurer','disparu','inconnu')),
        grave_exists INTEGER NOT NULL DEFAULT 1,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS grave_persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grave_id INTEGER NOT NULL,
        person_id INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(grave_id, person_id)
    )");
    // Dictionnaire personnel : vocabulaire de recherche propre à chaque généalogie.
    $pdo->exec("CREATE TABLE IF NOT EXISTS personal_dictionary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'autre',
        definition TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_personal_dictionary_term ON personal_dictionary_entries(term COLLATE NOCASE)");
    // Additive migration: étendre la contrainte CHECK de media_links pour accepter entity_type='grave'
    // (photos datées de la sépulture). Même procédure de recréation de table que pour 'military'/'battue_item'.
    try {
        $mlDdl = $pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='media_links'")->fetchColumn();
        if ($mlDdl !== false && !str_contains((string)$mlDdl, "'grave'")) {
            $pdo->exec("PRAGMA foreign_keys=OFF");
            $pdo->beginTransaction();
            $mlCols = array_column($pdo->query("PRAGMA table_info(media_links)")->fetchAll(PDO::FETCH_ASSOC), 'name');
            $pdo->exec("CREATE TABLE media_links_new (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER,
                media_id  INTEGER NOT NULL,
                entity_type TEXT NOT NULL CHECK(entity_type IN ('person','family','event','source','census','military','battue_item','grave')),
                entity_id INTEGER NOT NULL,
                position  INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                media_tag_id INTEGER
            )");
            $copy = array_values(array_filter(['id','source_id','media_id','entity_type','entity_id','position','created_at','media_tag_id'], static fn($col) => in_array($col, $mlCols, true)));
            $colList = implode(',', $copy);
            $pdo->exec("INSERT INTO media_links_new($colList) SELECT $colList FROM media_links");
            $pdo->exec("DROP TABLE media_links");
            $pdo->exec("ALTER TABLE media_links_new RENAME TO media_links");
            $pdo->commit();
            $pdo->exec("PRAGMA foreign_keys=ON");
        }
    } catch (Throwable $_) { if ($pdo->inTransaction()) $pdo->rollBack(); }

    // Seed des types d'événements généalogiques de base : évite une base neuve vide si la DB est supprimée.
    $defaultEventTypes = [
        ['person','birth','Naissance','BIRT','star','#00c896'],
        ['person','baptism','Baptême','CHR','water','#00a6c8'],
        ['family','marriage','Mariage','MARR','rings','#7c3aed'],
        ['family','divorce','Divorce','DIV','split','#c2410c'],
        ['person','death','Décès','DEAT','cross','#111111'],
        ['person','burial','Inhumation','BURI','cross','#3f3f46'],
        ['person','residence','Lieu de résidence','RESI','home','#2f80ed'],
        ['person','occupation','Profession','OCCU','briefcase','#1f8a70'],
        ['person','census','Recensement','CENS','list','#6b7280'],
        ['person','nationality','Nationalité','NATI','flag','#b45309'],
        ['person','mission','Mission','EVEN','diamond','#0066cc'],
    ];
    $defaultCheck = $pdo->prepare("SELECT id FROM event_types WHERE scope=? AND (slug=? OR label=? COLLATE NOCASE) LIMIT 1");
    $defaultInsert = $pdo->prepare("INSERT INTO event_types(scope,slug,label,gedcom_tag,icon,color,is_custom,is_active,is_artistic,custom_fields) VALUES(?,?,?,?,?,?,0,1,0,'')");
    foreach ($defaultEventTypes as [$scope, $slug, $label, $gedcom, $icon, $color]) {
        $defaultCheck->execute([$scope, $slug, $label]);
        if (!$defaultCheck->fetchColumn()) {
            $defaultInsert->execute([$scope, $slug, $label, $gedcom, $icon, $color]);
        }
    }

    // Insertion des types d'événements artistiques prédéfinis (une seule fois, idempotent par slug)
    // Chaque type correspond à une nature d'œuvre précise : les champs ne s'appliquent qu'à ce type
    // (ex. "Dimensions" pour une peinture/sculpture, "Durée" pour un film/vidéo, jamais l'inverse).
    $artisticTypes = [
        ['photographe',   'Photographie (œuvre)',        'camera',    '#5c3d99', ['Sujet','Technique','Format','Dimensions','Lieu de conservation']],
        ['peinture',      'Peinture (œuvre)',             'art',       '#8b4513', ['Technique','Dimensions','Matière','Lieu de conservation','Numéro de catalogue']],
        ['livre',         'Livre (publication)',          'pen',       '#1a5276', ['Éditeur','Nombre de pages','Genre','ISBN']],
        ['film',          'Film (réalisation)',           'movie',     '#1b4f72', ['Genre','Durée (minutes)','Producteur','Prix / récompenses']],
        ['sculpture',     'Sculpture (œuvre)',            'chisel',    '#7e5109', ['Matière','Dimensions','Lieu de conservation','Technique','Numéro de catalogue']],
        ['theatre',       'Théâtre (pièce)',              'mask',      '#922b21', ['Genre','Mise en scène','Lieu de création','Nombre de représentations']],
        ['poeme',         'Poème (publication)',          'pen',       '#4a235a', ['Recueil','Éditeur','Forme poétique','Nombre de vers']],
        ['video',         'Vidéo (œuvre)',                'play',      '#0b5345', ['Durée (minutes)','Format','Diffusion','Plateforme']],
        ['plastique',     'Arts plastiques (œuvre)',      'shape',     '#154360', ['Technique','Matériaux','Dimensions','Lieu d\'exposition','Numéro de catalogue']],
        ['danse',         'Danse (spectacle)',            'music',     '#880e4f', ['Compagnie','Chorégraphe','Lieu','Nombre de représentations']],
        ['scene',         'Scène / spectacle (rôle)',     'star',      '#4e342e', ['Titre du spectacle','Rôle','Metteur en scène','Lieu','Durée']],
    ];
    $stmtCheck = $pdo->prepare("SELECT id,custom_fields FROM event_types WHERE slug LIKE ? LIMIT 1");
    $stmtIns   = $pdo->prepare("INSERT INTO event_types(scope,slug,label,icon,color,is_custom,is_active,is_artistic,custom_fields) VALUES('person',?,?,?,?,1,1,1,?)");
    $stmtFillFields = $pdo->prepare("UPDATE event_types SET custom_fields=? WHERE id=?");
    foreach ($artisticTypes as [$slugBase, $label, $icon, $color, $customFields]) {
        $slugPattern = 'artistic-' . $slugBase . '%';
        $stmtCheck->execute([$slugPattern]);
        $existing = $stmtCheck->fetch();
        if (!$existing) {
            $slug = 'artistic-' . $slugBase . '-' . bin2hex(random_bytes(3));
            $stmtIns->execute([$slug, $label, $icon, $color, json_encode($customFields, JSON_UNESCAPED_UNICODE)]);
        } elseif (trim((string)($existing['custom_fields'] ?? '')) === '') {
            // Types déjà créés avant l'ajout de la colonne custom_fields : on complète une seule fois.
            $stmtFillFields->execute([json_encode($customFields, JSON_UNESCAPED_UNICODE), $existing['id']]);
        }
    }
    // Libère les curseurs des requêtes préparées ci-dessus : tant qu'une requête SQLite reste « en cours »
    // sur la connexion, VACUUM INTO / wal_checkpoint (sauvegarde, export, clone…) échouent avec
    // « database table is locked ».
    foreach ([$legacyEventCollectionsApplied ?? null, $defaultCheck ?? null, $defaultInsert ?? null, $stmtCheck, $stmtIns, $stmtFillFields] as $releasedStatement) {
        if ($releasedStatement instanceof PDOStatement) {
            $releasedStatement->closeCursor();
        }
    }
    unset($releasedStatement);
}
