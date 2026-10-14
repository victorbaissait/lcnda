<?php
declare(strict_types=1);

require_once __DIR__ . '/paths.php';   // APP_ROOT, DATA_DIR, MEDIA_DIR
require_once __DIR__ . '/text.php';    // ascii_fold()
require_once __DIR__ . '/migrations.php'; // migrate_database(), SCHEMA_VERSION
require_once __DIR__ . '/reference.php';
require_once __DIR__ . '/registers.php';
require_once __DIR__ . '/research.php';
require_once __DIR__ . '/saints.php';     // prénom et saint du jour
require_once __DIR__ . '/employers.php';
require_once __DIR__ . '/family_booklets.php'; // livrets de famille
require_once __DIR__ . '/family_book.php'; // livre de famille (parties, formats) // fiches d'employeurs
require_once __DIR__ . '/suggestions.php'; // suggestions de recherche (trous de la lignée Sosa)
require_once __DIR__ . '/collections.php';
require_once __DIR__ . '/heritage.php';
require_once __DIR__ . '/heritage_tools.php';
require_once __DIR__ . '/heritage_links.php'; // question en français, langues, liens @, citations détaillées, entraide // dossier Scans, paroisses, noms cités, voyages impossibles, travail à deux, consultation    // départs, enfants placés, armoiries, poilus, circuits, papiers, cartes anciennes…
require_once __DIR__ . '/heritage_more.php';
require_once __DIR__ . '/village.php';
require_once __DIR__ . '/voters.php';         // cartes d'électeur, dates de vote, droit de vote dans le monde
require_once __DIR__ . '/insee_remote.php';   // décès INSEE : fichiers de data.gouv.fr téléchargés et importés
require_once __DIR__ . '/htr_setup.php';
require_once __DIR__ . '/studio.php';         // retouche des photos (l'original est gardé)
require_once __DIR__ . '/museum.php';         // musée de famille en 3D (pièce d'archives), visite guidée, partage
require_once __DIR__ . '/my_lists.php';        // Mes listes : listes sur mesure (critères, colonnes, colonnes à remplir)       // reconnaissance d'écriture : installation de Kraken et des modèles         // fiche d'un village (familles, métiers, église, population, Cassini)  // actes à demander, contexte historique, coffre cousin, âges, variantes, lieux, tailles, résistants, éditeur de blocs
require_once __DIR__ . '/media_av.php';
require_once __DIR__ . '/recueils.php';
require_once __DIR__ . '/calendars.php';
require_once __DIR__ . '/addr_map.php';         // 🗺️ plan des adresses (BAN locale, anciens noms de rues)
require_once __DIR__ . '/digest_pages.php';     // Listes › Dépouillements : une page à la fois (même source que Recherche)        // listes Audios et Vidéos (durée, rattachements)
require_once __DIR__ . '/atelier.php';         // Atelier de recherche : projets, dossiers imbriqués, références, notes, citations…
require_once __DIR__ . '/offline_map.php';
require_once __DIR__ . '/merge.php';
require_once __DIR__ . '/shortcuts.php';       // fusion de l'arbre d'un cousin // fond de carte sans Internet // objets, mémoire familiale, lieux précis, liens web   // dates estimées, implexe  // « Registres en ligne » des battues
require_once __DIR__ . '/settings.php';   // réglages de l'interface rangés dans la base  // ensure_reference_data() : communes françaises livrées avec l'app

// Aucun avertissement PHP ne doit s'afficher dans une réponse : il s'ajouterait au JSON et l'interface
// afficherait « réponse illisible du serveur ». Les erreurs restent journalisées (visibles dans le Terminal).
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

const DEFAULT_DB_PATH = DATA_DIR . '/genealogy.sqlite';

foreach ([DATA_DIR, MEDIA_DIR, DATA_DIR . '/backups'] as $appDir) {
    if (!is_dir($appDir)) {
        @mkdir($appDir, 0775, true);
    }
}
unset($appDir);

function database_selector_path(): string
{
    return DATA_DIR . '/active_database.txt';
}

function database_path_from_key(string $key): ?string
{
    $key = trim(str_replace('\\', '/', $key));
    if (!preg_match('#^data/(bases/)?[A-Za-z0-9._ -]+\.(sqlite|db)$#i', $key)) {
        return null;
    }
    // Les clés restent « data/… » (c'est ce que voit l'interface) ; le vrai dossier est DATA_DIR.
    $path = DATA_DIR . '/' . substr($key, 5);
    return is_file($path) ? $path : null;
}

function active_database_key(): string
{
    $selector = database_selector_path();
    if (is_file($selector)) {
        $key = trim((string) file_get_contents($selector));
        if ($key !== '' && database_path_from_key($key)) {
            return $key;
        }
    }
    return 'data/genealogy.sqlite';
}

function active_database_path(): string
{
    return database_path_from_key(active_database_key()) ?: DEFAULT_DB_PATH;
}

function available_database_profiles(): array
{
    $profiles = [];
    foreach ([DATA_DIR, DATA_DIR . '/bases'] as $dir) {
        if (!is_dir($dir)) {
            continue;
        }
        foreach (array_merge(glob($dir . '/*.sqlite') ?: [], glob($dir . '/*.db') ?: []) as $path) {
            if (preg_match('/-(wal|shm|journal)$/', $path)) {
                continue;
            }
            $key = 'data/' . (str_starts_with($path, DATA_DIR . '/bases/') ? 'bases/' : '') . basename($path);
            $profiles[$key] = [
                'key' => $key,
                'name' => basename($path),
                'size' => filesize($path) ?: 0,
                'active' => $key === active_database_key(),
            ];
        }
    }
    ksort($profiles, SORT_NATURAL | SORT_FLAG_CASE);
    return array_values($profiles);
}

define('DB_PATH', active_database_path());

if (PHP_SAPI !== 'cli' && session_status() !== PHP_SESSION_ACTIVE) {
    $sessionDir = getenv('GENEALOGY_SESSION_DIR');
    if (is_string($sessionDir) && $sessionDir !== '') {
        if (!is_dir($sessionDir)) {
            @mkdir($sessionDir, 0775, true);
        }
        if (is_dir($sessionDir)) {
            session_save_path($sessionDir);
        }
    }
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
    session_start();
    // Le jeton CSRF est créé tout de suite, puis la session est refermée : PHP verrouille le fichier
    // de session tant qu'elle est ouverte, ce qui bloquerait toutes les autres requêtes pendant
    // une opération longue (import, restauration…). La lecture de $_SESSION['csrf'] reste possible.
    csrf_token();
    session_write_close();
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
    return $_SESSION['csrf'];
}

function verify_csrf(array $data): void
{
    $token = (string) ($data['csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
    if (!hash_equals(csrf_token(), $token)) {
        json_response(['error' => 'Session expirée. Recharge la page.'], 419);
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!is_file(DB_PATH)) {
        throw new RuntimeException('La base locale n\'a pas encore été importée.');
    }

    $pdo = new PDO('sqlite:' . DB_PATH, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    // Une écriture qui trouve la base occupée attend jusqu'à 30 s (au lieu d'échouer) : utile quand plusieurs
    // processus PHP travaillent en même temps (relais) pendant une opération longue.
    $pdo->exec('PRAGMA busy_timeout = 30000');
    // Mode WAL : une écriture ne bloque pas les lectures. Une base restaurée depuis une sauvegarde ou un
    // export (VACUUM INTO) arrive sans ce mode : on le remet. Sans gravité si c'est impossible à cet instant.
    try {
        if (strtolower((string) $pdo->query('PRAGMA journal_mode')->fetchColumn()) !== 'wal') {
            $pdo->query('PRAGMA journal_mode = WAL')->closeCursor();
        }
    } catch (Throwable $_) {
    }
    migrate_database($pdo, DB_PATH);
    // Communes françaises (contours, voisinages, GeoNames) : chargées une fois si la base ne les a pas.
    ensure_reference_data($pdo, DB_PATH);
    return $pdo;
}

/**
 * Crée le fichier SQLite et applique le schéma de base si la base n'existe pas encore.
 * Utilisée par l'écran d'installation (créer une première personne / importer un fichier)
 * pour permettre un premier usage sans passer par scripts/import.php.
 */
function init_empty_database(): void
{
    if (is_file(DB_PATH)) {
        return;
    }
    $dir = dirname(DB_PATH);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("Impossible de créer le dossier de la base : {$dir}");
    }
    $schemaPath = APP_ROOT . '/data/schema.sql';
    $schemaSql = is_file($schemaPath) ? (string) file_get_contents($schemaPath) : default_schema_sql();
    $pdo = new PDO('sqlite:' . DB_PATH, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = OFF');
    $pdo->exec($schemaSql);
    $pdo->exec('PRAGMA foreign_keys = ON');
}

/**
 * Copie de secours du schéma SQL, utilisée si data/schema.sql est absent du disque
 * (par ex. après un nettoyage manuel du dossier data/) afin que l'initialisation de la
 * base depuis l'écran d'installation ne dépende plus de la présence de ce fichier.
 */
function default_schema_sql(): string
{
    return <<<'SQL'
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS surname_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    unique_id TEXT,
    gedcom_id TEXT,
    first_name TEXT DEFAULT '',
    middle_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    prefix TEXT DEFAULT '',
    suffix TEXT DEFAULT '',
    gender TEXT NOT NULL DEFAULT 'unknown' CHECK(gender IN ('male','female','nonbinary','unknown')),
    living_status TEXT NOT NULL DEFAULT 'unknown' CHECK(living_status IN ('living','deceased','unknown')),
    is_private INTEGER NOT NULL DEFAULT 0,
    is_bookmarked INTEGER NOT NULL DEFAULT 0,
    is_start INTEGER NOT NULL DEFAULT 0,
    portrait_media_id INTEGER,
    spouse_status TEXT NOT NULL DEFAULT 'unknown',
    children_status TEXT NOT NULL DEFAULT 'unknown',
    is_locked INTEGER NOT NULL DEFAULT 0,
    surname_group_id INTEGER,
    reference_number TEXT DEFAULT '',
    familysearch_id TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (surname_group_id) REFERENCES surname_groups(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_persons_names ON persons(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_persons_group ON persons(surname_group_id);

CREATE TABLE IF NOT EXISTS name_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    source_id INTEGER,
    type TEXT NOT NULL DEFAULT 'variant',
    first_name TEXT DEFAULT '',
    middle_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    prefix TEXT DEFAULT '',
    suffix TEXT DEFAULT '',
    from_year INTEGER,
    to_year INTEGER,
    date_text TEXT DEFAULT '',
    source_note TEXT DEFAULT '',
    source_media_id INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (source_media_id) REFERENCES media(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    partner1_id INTEGER,
    partner2_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (partner1_id) REFERENCES persons(id) ON DELETE SET NULL,
    FOREIGN KEY (partner2_id) REFERENCES persons(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS family_children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    family_id INTEGER NOT NULL,
    child_id INTEGER NOT NULL,
    relation_to_partner1 TEXT NOT NULL DEFAULT 'biological',
    relation_to_partner2 TEXT NOT NULL DEFAULT 'biological',
    position REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (child_id) REFERENCES persons(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_children_family ON family_children(family_id);
CREATE INDEX IF NOT EXISTS idx_children_person ON family_children(child_id);

CREATE TABLE IF NOT EXISTS event_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    scope TEXT NOT NULL CHECK(scope IN ('person','family')),
    slug TEXT NOT NULL,
    label TEXT NOT NULL,
    gedcom_tag TEXT DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'diamond',
    color TEXT NOT NULL DEFAULT '#0066cc',
    is_custom INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(scope, slug)
);

CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    name TEXT DEFAULT '',
    county TEXT DEFAULT '',
    state TEXT DEFAULT '',
    country TEXT DEFAULT '',
    alternate_names TEXT DEFAULT '',
    latitude REAL,
    longitude REAL,
    description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    scope TEXT NOT NULL CHECK(scope IN ('person','family')),
    person_id INTEGER,
    family_id INTEGER,
    event_type_id INTEGER NOT NULL,
    date_text TEXT DEFAULT '',
    year INTEGER,
    sort_date TEXT,
    place_id INTEGER,
    address TEXT DEFAULT '',
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    cause TEXT DEFAULT '',
    agency TEXT DEFAULT '',
    fact_confidence TEXT NOT NULL DEFAULT 'unknown',
    confidence_origin TEXT DEFAULT '',
    confidence_media_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (event_type_id) REFERENCES event_types(id),
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id, year);
CREATE INDEX IF NOT EXISTS idx_events_family ON events(family_id, year);
CREATE INDEX IF NOT EXISTS idx_events_place ON events(place_id);
CREATE INDEX IF NOT EXISTS idx_events_type_place ON events(event_type_id, place_id);

CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    source_type TEXT NOT NULL DEFAULT 'internet',
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    media_type TEXT NOT NULL DEFAULT 'image',
    filename TEXT DEFAULT '',
    thumbnail TEXT DEFAULT '',
    transcription TEXT DEFAULT '',
    date_text TEXT DEFAULT '',
    document_reference TEXT DEFAULT '',
    document_title TEXT DEFAULT '',
    document_url TEXT DEFAULT '',
    document_pages TEXT DEFAULT '',
    is_person_photo INTEGER NOT NULL DEFAULT 0,
    correspondence_reply_to_media_id INTEGER NOT NULL DEFAULT 0,
    media_subject_type TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    media_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('person','family','event','source','census','military','battue_item')),
    entity_id INTEGER NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    collection_key TEXT NOT NULL DEFAULT '',
    collection_label TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_links_entity ON media_links(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS census_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    date_text TEXT DEFAULT '',
    is_special INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'todo',
    address TEXT DEFAULT '',
    place_id INTEGER,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS census_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    census_id INTEGER NOT NULL,
    person_id INTEGER,
    display_name TEXT DEFAULT '',
    age_text TEXT DEFAULT '',
    birth_place TEXT DEFAULT '',
    occupation TEXT DEFAULT '',
    employer TEXT DEFAULT '',
    nationality TEXT DEFAULT '',
    household_position TEXT DEFAULT '',
    personal_status TEXT DEFAULT '',
    extra_info TEXT DEFAULT '',
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(census_id) REFERENCES census_records(id) ON DELETE CASCADE,
    FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_census_records_year ON census_records(year);
CREATE INDEX IF NOT EXISTS idx_census_members_person ON census_members(person_id,census_id);

CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#0066cc',
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS label_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(label_id) REFERENCES labels(id) ON DELETE CASCADE,
    UNIQUE(label_id,entity_type,entity_id)
);

CREATE INDEX IF NOT EXISTS idx_label_links_entity ON label_links(entity_type,entity_id);
CREATE INDEX IF NOT EXISTS idx_label_links_label ON label_links(label_id);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    title TEXT DEFAULT '',
    body TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    title TEXT DEFAULT '',
    author TEXT DEFAULT '',
    agency TEXT DEFAULT '',
    publication TEXT DEFAULT '',
    url TEXT DEFAULT '',
    text TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS source_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    source_record_id INTEGER NOT NULL,
    page TEXT DEFAULT '',
    quality TEXT DEFAULT '',
    note TEXT DEFAULT '',
    FOREIGN KEY (source_record_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_dictionary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'autre',
    definition TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personal_dictionary_term ON personal_dictionary_entries(term COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS saved_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dismissed_issues (
    issue_key TEXT PRIMARY KEY,
    reason TEXT DEFAULT '',
    dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investigations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    question TEXT DEFAULT '',
    known_facts TEXT DEFAULT '',
    documents TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS investigation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investigation_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'lead',
    title TEXT NOT NULL,
    url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'explored',
    reminder_due_at TEXT NOT NULL DEFAULT '',
    reminder_mode TEXT NOT NULL DEFAULT 'none',
    reminder_done INTEGER NOT NULL DEFAULT 0,
    reminder_done_at TEXT NOT NULL DEFAULT '',
    linked_event_id INTEGER NOT NULL DEFAULT 0,
    linked_event_label TEXT NOT NULL DEFAULT '',
    archive_digest_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS standalone_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    reminder_mode TEXT NOT NULL DEFAULT 'on' CHECK(reminder_mode IN ('on','before','after')),
    reminder_due_at TEXT NOT NULL DEFAULT '',
    reminder_done INTEGER NOT NULL DEFAULT 0,
    reminder_done_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS living_contacts (
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
);

CREATE TABLE IF NOT EXISTS investigation_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investigation_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    verdict TEXT NOT NULL DEFAULT 'interesting',
    reason TEXT DEFAULT '',
    folder_id INTEGER,
    FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
    UNIQUE(investigation_id, media_id)
);

CREATE TABLE IF NOT EXISTS investigation_media_items (
    investigation_media_id INTEGER NOT NULL,
    investigation_item_id INTEGER NOT NULL,
    PRIMARY KEY (investigation_media_id, investigation_item_id),
    FOREIGN KEY (investigation_media_id) REFERENCES investigation_media(id) ON DELETE CASCADE,
    FOREIGN KEY (investigation_item_id) REFERENCES investigation_items(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS person_search USING fts5(
    person_id UNINDEXED,
    first_name,
    last_name,
    variants,
    surname_group,
    tokenize='unicode61 remove_diacritics 2'
);
SQL;
}

function ensure_schema(PDO $pdo): void
{
    $personColumns = $pdo->query('PRAGMA table_info(persons)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('portrait_media_id', $personColumns, true)) {
        $pdo->exec('ALTER TABLE persons ADD COLUMN portrait_media_id INTEGER');
    }
    if (!in_array('spouse_status', $personColumns, true)) {
        $pdo->exec("ALTER TABLE persons ADD COLUMN spouse_status TEXT NOT NULL DEFAULT 'unknown'");
    }
    if (!in_array('children_status', $personColumns, true)) {
        $pdo->exec("ALTER TABLE persons ADD COLUMN children_status TEXT NOT NULL DEFAULT 'unknown'");
    }
    foreach ([
        'occupation' => "TEXT DEFAULT ''",
        'height_text' => "TEXT DEFAULT ''",
        'physical_description' => "TEXT DEFAULT ''",
        'eye_color' => "TEXT DEFAULT ''",
        'skin_color' => "TEXT DEFAULT ''",
        'nationality' => "TEXT DEFAULT ''",
        'ethnicity' => "TEXT DEFAULT ''",
        'verify_status' => "TEXT NOT NULL DEFAULT 'normal'",
        'is_locked' => "INTEGER NOT NULL DEFAULT 0",
    ] as $column => $definition) {
        if (!in_array($column, $personColumns, true)) {
            $pdo->exec("ALTER TABLE persons ADD COLUMN {$column} {$definition}");
        }
    }
    $mediaColumns = $pdo->query('PRAGMA table_info(media)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('transcription', $mediaColumns, true)) {
        $pdo->exec("ALTER TABLE media ADD COLUMN transcription TEXT DEFAULT ''");
    }
    foreach ([
        'document_reference' => "TEXT DEFAULT ''",
        'document_title' => "TEXT DEFAULT ''",
        'document_url' => "TEXT DEFAULT ''",
        'document_pages' => "TEXT DEFAULT ''",
        'is_person_photo' => "INTEGER NOT NULL DEFAULT 0",
    ] as $column => $definition) {
        if (!in_array($column, $mediaColumns, true)) {
            $pdo->exec("ALTER TABLE media ADD COLUMN {$column} {$definition}");
        }
    }
    $sourceColumns = $pdo->query('PRAGMA table_info(sources)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('source_type', $sourceColumns, true)) {
        $pdo->exec("ALTER TABLE sources ADD COLUMN source_type TEXT NOT NULL DEFAULT 'internet'");
    }
    $placeColumns = $pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_COLUMN, 1);
    foreach ([
        'geoname_id' => 'INTEGER',
        'subdivision' => "TEXT DEFAULT ''",
        'admin1_code' => "TEXT DEFAULT ''",
        'admin2_code' => "TEXT DEFAULT ''",
        'admin3_code' => "TEXT DEFAULT ''",
        'admin4_code' => "TEXT DEFAULT ''",
        'feature_code' => "TEXT DEFAULT ''",
        'population' => 'INTEGER DEFAULT 0',
    ] as $column => $definition) {
        if (!in_array($column, $placeColumns, true)) {
            $pdo->exec("ALTER TABLE places ADD COLUMN {$column} {$definition}");
        }
    }
    $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_places_geoname_id ON places(geoname_id) WHERE geoname_id IS NOT NULL');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_places_fr_lookup ON places(country,name,subdivision)');
    $variantColumns = $pdo->query('PRAGMA table_info(name_variants)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('date_text', $variantColumns, true)) {
        $pdo->exec("ALTER TABLE name_variants ADD COLUMN date_text TEXT DEFAULT ''");
    }
    if (!in_array('source_media_id', $variantColumns, true)) {
        $pdo->exec('ALTER TABLE name_variants ADD COLUMN source_media_id INTEGER');
    }
    $mediaLinksSql = (string) $pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='media_links'")->fetchColumn();
    if ($mediaLinksSql !== '' && str_contains($mediaLinksSql, "CHECK(entity_type IN ('person','family','event','source'))")) {
        $pdo->exec('PRAGMA foreign_keys = OFF');
        $pdo->exec('ALTER TABLE media_links RENAME TO media_links_old');
        $pdo->exec("CREATE TABLE media_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER UNIQUE,
            media_id INTEGER NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('person','family','event','source','census','military','battue_item')),
            entity_id INTEGER NOT NULL,
            position REAL NOT NULL DEFAULT 0,
            collection_key TEXT NOT NULL DEFAULT '',
            collection_label TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        )");
        $pdo->exec('INSERT INTO media_links(id,source_id,media_id,entity_type,entity_id,position) SELECT id,source_id,media_id,entity_type,entity_id,position FROM media_links_old');
        $pdo->exec('DROP TABLE media_links_old');
        $pdo->exec('PRAGMA foreign_keys = ON');
    }
    $mediaLinksSql = (string) $pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='media_links'")->fetchColumn();
    if ($mediaLinksSql !== '' && !str_contains($mediaLinksSql, "'battue_item'")) {
        $cols = array_column($pdo->query('PRAGMA table_info(media_links)')->fetchAll(PDO::FETCH_ASSOC), 'name');
        $pdo->exec('PRAGMA foreign_keys = OFF');
        $pdo->exec('ALTER TABLE media_links RENAME TO media_links_old');
        $pdo->exec("CREATE TABLE media_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER UNIQUE,
            media_id INTEGER NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('person','family','event','source','census','military','battue_item')),
            entity_id INTEGER NOT NULL,
            position REAL NOT NULL DEFAULT 0,
            collection_key TEXT NOT NULL DEFAULT '',
            collection_label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            media_tag_id INTEGER,
            FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        )");
        $copy = array_values(array_filter(['id','source_id','media_id','entity_type','entity_id','position','created_at','media_tag_id'], static fn($col) => in_array($col, $cols, true)));
        $colList = implode(',', $copy);
        $pdo->exec("INSERT INTO media_links($colList) SELECT $colList FROM media_links_old");
        $pdo->exec('DROP TABLE media_links_old');
        $pdo->exec('PRAGMA foreign_keys = ON');
    }
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_events_type_place ON events(event_type_id, place_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_media_links_entity ON media_links(entity_type, entity_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL, title TEXT NOT NULL,
        question TEXT DEFAULT '', known_facts TEXT DEFAULT '', documents TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, investigation_id INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'lead', title TEXT NOT NULL, url TEXT DEFAULT '', notes TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'explored', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(investigation_id) REFERENCES investigations(id) ON DELETE CASCADE)");
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN reminder_due_at TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN reminder_mode TEXT NOT NULL DEFAULT 'none'"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN reminder_done INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN reminder_done_at TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN linked_event_id INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN linked_event_label TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE investigation_items ADD COLUMN archive_digest_id INTEGER"); } catch (Throwable $_) {}
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT, investigation_id INTEGER NOT NULL, media_id INTEGER NOT NULL,
        verdict TEXT NOT NULL DEFAULT 'interesting', reason TEXT DEFAULT '',
        FOREIGN KEY(investigation_id) REFERENCES investigations(id) ON DELETE CASCADE,
        FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
        UNIQUE(investigation_id,media_id))");
    try { $pdo->exec("ALTER TABLE investigation_media ADD COLUMN folder_id INTEGER"); } catch (Throwable $_) {}
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_media_items (
        investigation_media_id INTEGER NOT NULL, investigation_item_id INTEGER NOT NULL,
        PRIMARY KEY(investigation_media_id,investigation_item_id),
        FOREIGN KEY(investigation_media_id) REFERENCES investigation_media(id) ON DELETE CASCADE,
        FOREIGN KEY(investigation_item_id) REFERENCES investigation_items(id) ON DELETE CASCADE)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS commune_contours (
        insee_code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        geometry_json TEXT NOT NULL,
        min_lon REAL,
        min_lat REAL,
        max_lon REAL,
        max_lat REAL,
        centroid_lon REAL,
        centroid_lat REAL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS commune_neighbors (
        insee_code TEXT NOT NULL,
        neighbor_insee_code TEXT NOT NULL,
        PRIMARY KEY(insee_code, neighbor_insee_code),
        FOREIGN KEY(insee_code) REFERENCES commune_contours(insee_code) ON DELETE CASCADE,
        FOREIGN KEY(neighbor_insee_code) REFERENCES commune_contours(insee_code) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS battues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT 'naissance',
        target_text TEXT DEFAULT '',
        start_insee_code TEXT NOT NULL,
        max_level INTEGER NOT NULL DEFAULT 2,
        status TEXT NOT NULL DEFAULT 'open',
        notes TEXT DEFAULT '',
        page_number TEXT DEFAULT '',
        household_key TEXT DEFAULT '',
        address TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(start_insee_code) REFERENCES commune_contours(insee_code) ON DELETE RESTRICT
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS battue_commune_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battue_id INTEGER NOT NULL,
        insee_code TEXT NOT NULL,
        name TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(battue_id) REFERENCES battues(id) ON DELETE CASCADE,
        FOREIGN KEY(insee_code) REFERENCES commune_contours(insee_code) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS battue_search_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battue_id INTEGER NOT NULL,
        insee_code TEXT NOT NULL,
        alias_id INTEGER,
        record_type TEXT NOT NULL DEFAULT 'naissance',
        period TEXT DEFAULT '',
        register TEXT DEFAULT '',
        archive_digest_id INTEGER,
        title TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        note TEXT DEFAULT '',
        url TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(battue_id) REFERENCES battues(id) ON DELETE CASCADE,
        FOREIGN KEY(insee_code) REFERENCES commune_contours(insee_code) ON DELETE CASCADE,
        FOREIGN KEY(alias_id) REFERENCES battue_commune_aliases(id) ON DELETE SET NULL,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE SET NULL
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS battue_commune_statuses (
        battue_id INTEGER NOT NULL,
        insee_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_started',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(battue_id, insee_code),
        FOREIGN KEY(battue_id) REFERENCES battues(id) ON DELETE CASCADE,
        FOREIGN KEY(insee_code) REFERENCES commune_contours(insee_code) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS battue_persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        battue_id INTEGER NOT NULL,
        person_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'primary' CHECK(role IN ('primary','secondary')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(battue_id, person_id),
        FOREIGN KEY(battue_id) REFERENCES battues(id) ON DELETE CASCADE,
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE
    )");
    try { $pdo->exec("ALTER TABLE battue_search_items ADD COLUMN register TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE battue_search_items ADD COLUMN archive_digest_id INTEGER"); } catch (Throwable $_) {}
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_commune_contours_name ON commune_contours(name)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_commune_neighbors_neighbor ON commune_neighbors(neighbor_insee_code)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_battues_start ON battues(start_insee_code)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_battue_aliases_commune ON battue_commune_aliases(battue_id,insee_code)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_battue_items_commune ON battue_search_items(battue_id,insee_code)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_battue_items_archive_digest ON battue_search_items(archive_digest_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_battue_commune_statuses_status ON battue_commune_statuses(battue_id,status)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_battue_persons_person ON battue_persons(person_id,battue_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_investigations_person ON investigations(person_id,status)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_digest_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place_id INTEGER,
        city_name TEXT DEFAULT '',
        city_alias TEXT DEFAULT '',
        department TEXT DEFAULT '',
        region TEXT DEFAULT '',
        archive_service TEXT DEFAULT '',
        archive_reference TEXT DEFAULT '',
        archive_url TEXT DEFAULT '',
        year_text TEXT DEFAULT '',
        record_type TEXT NOT NULL DEFAULT 'autre',
        template_key TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        searched TEXT DEFAULT '',
        found TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        address TEXT DEFAULT '',
        household_number TEXT DEFAULT '',
        is_exhaustive INTEGER NOT NULL DEFAULT 0,
        exhaustive_note TEXT DEFAULT '',
        act_number TEXT DEFAULT '',
        page_number TEXT DEFAULT '',
        page_total INTEGER,
        pages_checked TEXT DEFAULT '',
        pages_without_info TEXT DEFAULT '',
        pages_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE SET NULL
    )");
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN address TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN household_number TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN is_exhaustive INTEGER NOT NULL DEFAULT 0"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN exhaustive_note TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN act_number TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN page_number TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN page_total INTEGER"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN pages_checked TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN pages_without_info TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN pages_json TEXT NOT NULL DEFAULT '[]'"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN archive_url TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_entries ADD COLUMN template_key TEXT DEFAULT ''"); } catch (Throwable $_) {}
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_place ON archive_digest_entries(place_id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_city ON archive_digest_entries(city_name)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_status ON archive_digest_entries(status)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_type ON archive_digest_entries(record_type)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_digest_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_digest_id INTEGER NOT NULL,
        media_id INTEGER NOT NULL,
        page_number TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(archive_digest_id, media_id),
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE CASCADE,
        FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
    )");
    try { $pdo->exec("ALTER TABLE archive_digest_media ADD COLUMN page_number TEXT DEFAULT ''"); } catch (Throwable $_) {}
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_media_entry ON archive_digest_media(archive_digest_id)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_digest_gaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_digest_id INTEGER,
        gap_type TEXT NOT NULL DEFAULT 'missing_period',
        period_text TEXT DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        notes TEXT DEFAULT '',
        url TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_gaps_entry ON archive_digest_gaps(archive_digest_id,status)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_digest_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_digest_id INTEGER,
        request_type TEXT NOT NULL DEFAULT 'order',
        status TEXT NOT NULL DEFAULT 'todo',
        title TEXT NOT NULL DEFAULT '',
        archive_service TEXT DEFAULT '',
        archive_reference TEXT DEFAULT '',
        due_at TEXT DEFAULT '',
        url TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE SET NULL
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_requests_status ON archive_digest_requests(status,due_at)");
    // Préparation des visites : une feuille de mission peut reprendre les cotes
    // déjà suivies dans archive_digest_entries, tout en acceptant des cotes libres.
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_visit_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        visit_date TEXT NOT NULL DEFAULT '',
        archive_center TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        website_url TEXT NOT NULL DEFAULT '',
        info_url TEXT NOT NULL DEFAULT '',
        opening_hours TEXT NOT NULL DEFAULT '',
        closure_notice TEXT NOT NULL DEFAULT '',
        room_notes TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    try { $pdo->exec("ALTER TABLE archive_visit_plans ADD COLUMN website_url TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_visit_plans ADD COLUMN info_url TEXT NOT NULL DEFAULT ''"); } catch (Throwable $_) {}
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_visit_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visit_id INTEGER NOT NULL,
        archive_digest_id INTEGER,
        archive_service TEXT NOT NULL DEFAULT '',
        archive_reference TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        place_label TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        checked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(visit_id) REFERENCES archive_visit_plans(id) ON DELETE CASCADE,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE SET NULL
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_visit_items_visit ON archive_visit_items(visit_id,checked,id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_visit_items_digest ON archive_visit_items(archive_digest_id)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_visit_investigations (
        visit_id INTEGER NOT NULL,
        investigation_id INTEGER NOT NULL,
        PRIMARY KEY(visit_id,investigation_id),
        FOREIGN KEY(visit_id) REFERENCES archive_visit_plans(id) ON DELETE CASCADE,
        FOREIGN KEY(investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_visit_battues (
        visit_id INTEGER NOT NULL,
        battue_id INTEGER NOT NULL,
        PRIMARY KEY(visit_id,battue_id),
        FOREIGN KEY(visit_id) REFERENCES archive_visit_plans(id) ON DELETE CASCADE,
        FOREIGN KEY(battue_id) REFERENCES battues(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_visit_investigations_investigation ON archive_visit_investigations(investigation_id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_visit_battues_battue ON archive_visit_battues(battue_id)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_digest_transcription_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_digest_id INTEGER NOT NULL,
        media_id INTEGER,
        page_number TEXT DEFAULT '',
        line_number INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL DEFAULT '',
        zone_json TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE CASCADE,
        FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE SET NULL
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_transcription_lines_entry ON archive_digest_transcription_lines(archive_digest_id,page_number,line_number,id)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_digest_transcription_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_digest_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        lines_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_transcription_versions_entry ON archive_digest_transcription_versions(archive_digest_id,created_at DESC)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_digest_people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_digest_id INTEGER NOT NULL,
        person_id INTEGER,
        first_name TEXT DEFAULT '',
        last_name TEXT DEFAULT '',
        age_text TEXT DEFAULT '',
        birth_place TEXT DEFAULT '',
        occupation TEXT DEFAULT '',
        employer TEXT DEFAULT '',
        nationality TEXT DEFAULT '',
        household_position TEXT DEFAULT '',
        personal_status TEXT DEFAULT '',
        extra_info TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        page_number TEXT DEFAULT '',
        household_key TEXT DEFAULT '',
        address TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE CASCADE,
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE SET NULL
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_people_entry ON archive_digest_people(archive_digest_id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_archive_digest_people_person ON archive_digest_people(person_id)");
    try { $pdo->exec("ALTER TABLE archive_digest_people ADD COLUMN page_number TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_people ADD COLUMN household_key TEXT DEFAULT ''"); } catch (Throwable $_) {}
    try { $pdo->exec("ALTER TABLE archive_digest_people ADD COLUMN address TEXT DEFAULT ''"); } catch (Throwable $_) {}
    $pdo->exec("CREATE TABLE IF NOT EXISTS battue_item_archive_digests (
        battue_item_id INTEGER NOT NULL,
        archive_digest_id INTEGER NOT NULL,
        PRIMARY KEY(battue_item_id, archive_digest_id),
        FOREIGN KEY(battue_item_id) REFERENCES battue_search_items(id) ON DELETE CASCADE,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_item_archive_digests (
        investigation_item_id INTEGER NOT NULL,
        archive_digest_id INTEGER NOT NULL,
        PRIMARY KEY(investigation_item_id, archive_digest_id),
        FOREIGN KEY(investigation_item_id) REFERENCES investigation_items(id) ON DELETE CASCADE,
        FOREIGN KEY(archive_digest_id) REFERENCES archive_digest_entries(id) ON DELETE CASCADE
    )");
    $pdo->exec("INSERT OR IGNORE INTO battue_item_archive_digests(battue_item_id,archive_digest_id) SELECT id,archive_digest_id FROM battue_search_items WHERE archive_digest_id IS NOT NULL AND archive_digest_id > 0");
    $pdo->exec("INSERT OR IGNORE INTO investigation_item_archive_digests(investigation_item_id,archive_digest_id) SELECT id,archive_digest_id FROM investigation_items WHERE archive_digest_id IS NOT NULL AND archive_digest_id > 0");
    $pdo->exec("UPDATE investigations SET status='open' WHERE status='promising'");
    $pdo->exec("CREATE TABLE IF NOT EXISTS hypotheses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        related_person_id INTEGER,
        event_id INTEGER,
        type TEXT NOT NULL DEFAULT 'identity',
        title TEXT NOT NULL,
        statement TEXT DEFAULT '',
        confidence TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE,
        FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE SET NULL,
        FOREIGN KEY(related_person_id) REFERENCES persons(id) ON DELETE SET NULL)");
    $hypothesisColumns = $pdo->query('PRAGMA table_info(hypotheses)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('event_id', $hypothesisColumns, true)) {
        $pdo->exec('ALTER TABLE hypotheses ADD COLUMN event_id INTEGER');
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS evidence_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        event_id INTEGER,
        source_id INTEGER,
        title TEXT NOT NULL,
        subject TEXT DEFAULT '',
        quality TEXT NOT NULL DEFAULT 'unsourced',
        confidence TEXT NOT NULL DEFAULT 'medium',
        note TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE,
        FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE SET NULL,
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE SET NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS research_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT DEFAULT '',
        result TEXT DEFAULT '',
        next_step TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_hypotheses_person ON hypotheses(person_id,status)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_evidence_person ON evidence_records(person_id,quality)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_research_journal_person ON research_journal(person_id,updated_at)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        root_person_id INTEGER,
        color TEXT DEFAULT '#0066cc',
        description TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(root_person_id) REFERENCES persons(id) ON DELETE SET NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS branch_people (
        branch_id INTEGER NOT NULL,
        person_id INTEGER NOT NULL,
        role TEXT DEFAULT '',
        PRIMARY KEY(branch_id,person_id),
        FOREIGN KEY(branch_id) REFERENCES branches(id) ON DELETE CASCADE,
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE CASCADE)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS census_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        date_text TEXT DEFAULT '',
        is_special INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'todo',
        address TEXT DEFAULT '',
        place_id INTEGER,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE SET NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS census_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        census_id INTEGER NOT NULL,
        person_id INTEGER,
        display_name TEXT DEFAULT '',
        age_text TEXT DEFAULT '',
        birth_place TEXT DEFAULT '',
        occupation TEXT DEFAULT '',
        employer TEXT DEFAULT '',
        nationality TEXT DEFAULT '',
        household_position TEXT DEFAULT '',
        personal_status TEXT DEFAULT '',
        extra_info TEXT DEFAULT '',
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(census_id) REFERENCES census_records(id) ON DELETE CASCADE,
        FOREIGN KEY(person_id) REFERENCES persons(id) ON DELETE SET NULL)");
    $censusRecordColumns=$pdo->query('PRAGMA table_info(census_records)')->fetchAll(PDO::FETCH_COLUMN,1);
    if(!in_array('is_special',$censusRecordColumns,true))$pdo->exec('ALTER TABLE census_records ADD COLUMN is_special INTEGER NOT NULL DEFAULT 0');
    $censusMemberColumns=$pdo->query('PRAGMA table_info(census_members)')->fetchAll(PDO::FETCH_COLUMN,1);
    foreach([
        'birth_place'=>"TEXT DEFAULT ''",
        'employer'=>"TEXT DEFAULT ''",
    ] as $column=>$definition){
        if(!in_array($column,$censusMemberColumns,true))$pdo->exec("ALTER TABLE census_members ADD COLUMN {$column} {$definition}");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#0066cc',
        description TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS label_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(label_id) REFERENCES labels(id) ON DELETE CASCADE,
        UNIQUE(label_id,entity_type,entity_id))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_census_records_year ON census_records(year)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_census_members_person ON census_members(person_id,census_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_label_links_entity ON label_links(entity_type,entity_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_label_links_label ON label_links(label_id)');
}

function json_response(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function request_json(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return $_POST;
    }
    $data = json_decode($raw, true);
    // Les envois de fichiers utilisent multipart/form-data : php://input contient alors
    // le flux binaire, qui n'est pas du JSON, tandis que PHP a déjà rempli $_POST/$_FILES.
    // Revenir à $_POST évite de perdre le jeton CSRF et les paramètres de l'import.
    return is_array($data) ? $data : $_POST;
}

function full_name(array $person): string
{
    return trim(implode(' ', array_filter([
        $person['prefix'] ?? '',
        $person['first_name'] ?? '',
        $person['middle_name'] ?? '',
        $person['last_name'] ?? '',
        $person['suffix'] ?? '',
    ])));
}

function log_change(PDO $pdo, string $entityType, ?int $entityId, string $action, string $summary, ?array $before = null, ?array $after = null): void
{
    $stmt = $pdo->prepare('INSERT INTO change_log(entity_type, entity_id, action, summary, before_json, after_json) VALUES(?,?,?,?,?,?)');
    $stmt->execute([
        $entityType,
        $entityId,
        $action,
        $summary,
        $before ? json_encode($before, JSON_UNESCAPED_UNICODE) : null,
        $after ? json_encode($after, JSON_UNESCAPED_UNICODE) : null,
    ]);
}

function safe_int(mixed $value, int $fallback = 0): int
{
    return is_numeric($value) ? (int) $value : $fallback;
}

function safe_text(mixed $value): string
{
    return trim((string) ($value ?? ''));
}
