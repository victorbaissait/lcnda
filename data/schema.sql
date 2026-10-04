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
    date_calendar TEXT NOT NULL DEFAULT 'gregorian',
    date_converted TEXT NOT NULL DEFAULT '',
    date_alternative TEXT NOT NULL DEFAULT '',
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
    postcard_group TEXT NOT NULL DEFAULT '',
    postcard_side TEXT NOT NULL DEFAULT '',
    is_person_photo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER UNIQUE,
    media_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('person','family','event','source','census')),
    entity_id INTEGER NOT NULL,
    position REAL NOT NULL DEFAULT 0,
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS investigation_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investigation_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    verdict TEXT NOT NULL DEFAULT 'interesting',
    reason TEXT DEFAULT '',
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
