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

const SCHEMA_VERSION = 2;

/** @return array<int, callable(PDO): void> numéro de structure => migration qui y mène */
function migration_steps(): array
{
    return [
        1 => 'schema_v1',
        2 => 'schema_v2',
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
