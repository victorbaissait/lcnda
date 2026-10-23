<?php
declare(strict_types=1);

/**
 * 🐾 Suivi des animaux (maquette docs/design/animaux-suivi.html, S1 à S19) : pour tout animal (une fiche de « pets »),
 * sauvage ou de la famille — ses marques (bagues, puce, tatouage, collier, balise, photo-identification…), les
 * observations signalées (avec une lecture du code sûre, partielle ou douteuse), les points GPS d'une balise ou d'un
 * collier, sa santé (états, causes, soins, poids), les sites suivis et leurs comptages, et les groupes sociaux
 * (meute, troupe, clan, pod…) avec son rôle et son histoire.
 *
 * GET  api.php?action=suivi&op=overview|animal|gps|site|group|imports
 * POST api.php?action=suivi_write {op: …} (dans handle_write : transaction, mode consultation refusé)
 * Les suppressions sont journalisées (ligne entière dans change_log) : « ↶ Annuler » passe par restore_last_delete.
 * Mode d'emploi technique : docs/UI.md (« 🐾 Suivi des animaux »).
 */

const SUIVI_PROFILES = ['oiseau', 'compagnie', 'cheval', 'ferme', 'poisson', 'marin', 'sauvage', 'primate', 'autre'];
const SUIVI_MARK_KINDS = ['metal', 'color_rings', 'wing_tag', 'gps_tag', 'chip', 'tattoo', 'collar', 'medal', 'gps_collar', 'sire', 'signalement',
    'ear_tag', 'pit', 'scute', 'forearm_ring', 'transmitter', 'photo_id', 'satellite', 'fin_tag', 'vhf_collar', 'ear_notch', 'other'];
const SUIVI_HEALTH_STATES = ['sain', 'blesse', 'malade', 'soins', 'relache', 'mort'];
const SUIVI_RELIABILITY = ['', 'full', 'partial', 'colors', 'doubt', 'metal', 'photo'];
const SUIVI_SOURCES = ['manuel', 'gps', 'piege', 'mer', 'signalement'];
const SUIVI_END_REASONS = ['', 'depart', 'exclu', 'mort', 'transfert', 'role', 'inconnu'];
const SUIVI_START_REASONS = ['entree', 'naissance', 'transfert', 'role', 'fondateur'];

function suivi_schema(PDO $pdo): void
{
    static $done = null;
    if ($done === $pdo) { return; }
    $done = $pdo;
    $pdo->exec("CREATE TABLE IF NOT EXISTS animal_profiles (
        pet_id INTEGER PRIMARY KEY,
        taxon TEXT NOT NULL DEFAULT '', sci_name TEXT NOT NULL DEFAULT '', profile TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'suivi', ringed_date TEXT NOT NULL DEFAULT '', ringed_iso TEXT NOT NULL DEFAULT '',
        ringed_place_id INTEGER, ringer_id INTEGER, ringer_txt TEXT NOT NULL DEFAULT '', program TEXT NOT NULL DEFAULT '',
        age_class TEXT NOT NULL DEFAULT '', home_place_id INTEGER, note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS animal_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'other',
        code TEXT NOT NULL DEFAULT '', code_norm TEXT NOT NULL DEFAULT '', colors_json TEXT NOT NULL DEFAULT '',
        position TEXT NOT NULL DEFAULT '', scheme TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', interval_min INTEGER,
        start_date TEXT NOT NULL DEFAULT '', start_iso TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '', end_iso TEXT NOT NULL DEFAULT '',
        end_reason TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', media_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_animal_marks_pet ON animal_marks(pet_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_animal_marks_code ON animal_marks(code_norm)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS animal_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER, obs_date TEXT NOT NULL DEFAULT '', obs_iso TEXT NOT NULL DEFAULT '', obs_time TEXT NOT NULL DEFAULT '',
        lat REAL, lon REAL, place_id INTEGER, place_text TEXT NOT NULL DEFAULT '', site_id INTEGER, behaviors TEXT NOT NULL DEFAULT '',
        count INTEGER, with_json TEXT NOT NULL DEFAULT '', reading_raw TEXT NOT NULL DEFAULT '', reading_json TEXT NOT NULL DEFAULT '',
        reliability TEXT NOT NULL DEFAULT '', observer_id INTEGER, observer_txt TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manuel', media_id INTEGER, sea_json TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_animal_obs_pet ON animal_observations(pet_id, obs_iso)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_animal_obs_site ON animal_observations(site_id)');
    // points GPS en masse : une ligne compacte par point, jamais deux fois le même instant pour un animal
    $pdo->exec('CREATE TABLE IF NOT EXISTS animal_gps (
        id INTEGER PRIMARY KEY, pet_id INTEGER NOT NULL, t INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, alt REAL, import_id INTEGER,
        UNIQUE(pet_id, t))');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_animal_gps_import ON animal_gps(import_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS animal_gps_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, filename TEXT NOT NULL DEFAULT '', format TEXT NOT NULL DEFAULT '',
        points INTEGER NOT NULL DEFAULT 0, first_t INTEGER, last_t INTEGER, km REAL, nights INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS animal_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, ev_date TEXT NOT NULL DEFAULT '', ev_iso TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '', what_kind TEXT NOT NULL DEFAULT '', what_text TEXT NOT NULL DEFAULT '', cause TEXT NOT NULL DEFAULT '',
        cause_text TEXT NOT NULL DEFAULT '', place_id INTEGER, place_text TEXT NOT NULL DEFAULT '', carer_id INTEGER, carer_txt TEXT NOT NULL DEFAULT '',
        care TEXT NOT NULL DEFAULT '', meds TEXT NOT NULL DEFAULT '', weight_g REAL, media_ids TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL DEFAULT '', outcome_date TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_animal_health_pet ON animal_health(pet_id, ev_iso)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS track_sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT '', place_id INTEGER,
        lat REAL, lon REAL, area_ha REAL, since TEXT NOT NULL DEFAULT '', outline_json TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS track_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, site_id INTEGER NOT NULL, c_date TEXT NOT NULL DEFAULT '', c_iso TEXT NOT NULL DEFAULT '', c_time TEXT NOT NULL DEFAULT '',
        what TEXT NOT NULL DEFAULT '', what_text TEXT NOT NULL DEFAULT '', number INTEGER, unit TEXT NOT NULL DEFAULT '',
        observer_id INTEGER, observer_txt TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_track_counts_site ON track_counts(site_id, c_iso)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS animal_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'groupe', species TEXT NOT NULL DEFAULT '',
        territory TEXT NOT NULL DEFAULT '', site_id INTEGER, place_id INTEGER, note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS animal_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT, pet_id INTEGER NOT NULL, group_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT '',
        start_date TEXT NOT NULL DEFAULT '', start_iso TEXT NOT NULL DEFAULT '', start_reason TEXT NOT NULL DEFAULT 'entree',
        end_date TEXT NOT NULL DEFAULT '', end_iso TEXT NOT NULL DEFAULT '', end_reason TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_animal_members_pet ON animal_memberships(pet_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_animal_members_group ON animal_memberships(group_id)');
    // 📤 Partager / fusionner : un identifiant stable par animal et par ligne, reconnu chez l'autre ; les réceptions (↶ Annuler)
    foreach (SUIVI_UUID_TABLES as $t) {
        $cols = array_column($pdo->query("PRAGMA table_info($t)")->fetchAll(), 'name');
        if ($cols && !in_array('uuid', $cols, true)) { $pdo->exec("ALTER TABLE $t ADD COLUMN uuid TEXT NOT NULL DEFAULT ''"); }
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_{$t}_uuid ON $t(uuid)");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS suivi_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', undo_json TEXT NOT NULL DEFAULT '',
        undone INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    suivi_obs_media_column($pdo);
}

/** Plusieurs médias par observation (migration 66) : colonne media_ids, remplie depuis l'ancien media_id */
function suivi_obs_media_column(PDO $pdo): void
{
    $cols = array_column($pdo->query('PRAGMA table_info(animal_observations)')->fetchAll(), 'name');
    if (!$cols) { if (function_exists('suivi_schema')) { suivi_schema($pdo); } return; }
    if (in_array('media_ids', $cols, true)) { return; }
    $pdo->exec("ALTER TABLE animal_observations ADD COLUMN media_ids TEXT NOT NULL DEFAULT ''");
    $pdo->exec("UPDATE animal_observations SET media_ids = CAST(media_id AS TEXT) WHERE media_id IS NOT NULL AND media_id > 0");
}

/** « 12,40,7 » ou [12, 40, 7] → [12, 40, 7] (entiers positifs, sans doublon, 40 au plus) */
function suivi_media_list(mixed $v): array
{
    $list = is_array($v) ? $v : explode(',', (string) (is_scalar($v) ? $v : ''));
    return array_slice(array_values(array_unique(array_filter(array_map('intval', $list), static fn($x) => $x > 0))), 0, 40);
}
const SUIVI_UUID_TABLES = ['animal_profiles', 'animal_marks', 'animal_observations', 'animal_health', 'track_sites', 'track_counts', 'animal_groups', 'animal_memberships'];

/* ───────────── petites aides ───────────── */

function suivi_txt(mixed $v, int $max): string
{
    return mb_substr(trim(str_replace("\0", '', (string) (is_scalar($v) ? $v : ''))), 0, $max);
}

/** « 12 mai 2025 », « 12/05/2025 », « aujourd'hui », « hier » → « 2025-05-12 » (ou « 2025-05 », « 2025 », '' si rien de lisible) */
function suivi_iso(string $text): string
{
    $t = mb_strtolower(trim($text));
    if ($t === '') { return ''; }
    if (preg_match('/^(aujourd.?hui|auj\.?)/u', $t)) { return date('Y-m-d'); }
    if (str_starts_with($t, 'hier')) { return date('Y-m-d', time() - 86400); }
    if (str_starts_with($t, 'avant-hier')) { return date('Y-m-d', time() - 2 * 86400); }
    $p = function_exists('cal_parse_date') ? cal_parse_date($t) : null;
    if ($p) {
        if ($p[1] && $p[2]) { return sprintf('%04d-%02d-%02d', $p[0], $p[1], $p[2]); }
        if ($p[1]) { return sprintf('%04d-%02d', $p[0], $p[1]); }
        return sprintf('%04d', $p[0]);
    }
    if (preg_match('/\b(1[5-9]\d{2}|20\d{2})\b/', $t, $m)) { return $m[1]; }
    return '';
}

/** « 8 h 40 », « 08:40 », « vers 6 h » → « 08:40 » ; garde le texte s'il n'est pas compris (« matin ») */
function suivi_time(mixed $v): string
{
    $t = suivi_txt($v, 20);
    if ($t === '') { return ''; }
    if (preg_match('/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/u', $t, $m) && (int) $m[1] < 24 && (int) ($m[2] ?? 0) < 60) { return sprintf('%02d:%02d', (int) $m[1], (int) ($m[2] ?? 0)); }
    return $t;
}

function suivi_float(mixed $v, float $min, float $max): ?float
{
    if ($v === null || $v === '' || !is_numeric(str_replace(',', '.', (string) $v))) { return null; }
    $f = (float) str_replace(',', '.', (string) $v);
    return $f >= $min && $f <= $max ? $f : null;
}

/** Un code lu ou gravé, pour comparer : majuscules, sans espaces ni ponctuation */
function suivi_norm(string $code): string
{
    return strtoupper((string) preg_replace('/[^0-9A-Za-z]/', '', $code));
}

/** Une personne choisie au menu de choix : id (fiche) ou « txt:… » (nom sans fiche) → [id|null, texte] */
function suivi_who(mixed $v, mixed $txt = ''): array
{
    if (is_string($v) && str_starts_with($v, 'txt:')) { return [null, suivi_txt(substr($v, 4), 200)]; }
    $id = safe_int($v);
    return [$id > 0 ? $id : null, suivi_txt($txt, 200)];
}

function suivi_pet_exists(PDO $pdo, int $id): bool
{
    if ($id <= 0) { return false; }
    $s = $pdo->prepare('SELECT 1 FROM pets WHERE id=?'); $s->execute([$id]);
    return (bool) $s->fetchColumn();
}

function suivi_need_pet(PDO $pdo, int $id): void
{
    if (!suivi_pet_exists($pdo, $id)) { throw new RuntimeException('Animal introuvable.'); }
}

function suivi_place_ok(PDO $pdo, mixed $v): ?int
{
    $id = safe_int($v);
    if ($id <= 0) { return null; }
    $s = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $s->execute([$id]);
    return $s->fetchColumn() ? $id : null;
}

function suivi_row(PDO $pdo, string $table, int $id): ?array
{
    if (!in_array($table, ['animal_marks', 'animal_observations', 'animal_health', 'track_sites', 'track_counts', 'animal_groups', 'animal_memberships'], true)) { return null; }
    $s = $pdo->prepare("SELECT * FROM {$table} WHERE id=?"); $s->execute([$id]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** Le profil de marques d'un animal : choisi sur la fiche, sinon deviné d'après l'espèce et le nom de l'espèce */
function suivi_guess_profile(string $species, string $taxon, string $breed = ''): string
{
    $t = mb_strtolower($taxon . ' ' . $breed);
    if (preg_match('/chimpanz|gorille|bonobo|orang|macaque|babouin|singe|lémur|lemur|gibbon|capucin|primate/u', $t)) { return 'primate'; }
    if (preg_match('/dauphin|baleine|orque|cachalot|phoque|otarie|marsouin|dugong|lamantin|requin|tortue marine|tortue luth|morse|béluga|beluga|rorqual|globicéphale|raie manta/u', $t)) { return 'marin'; }
    return match ($species) {
        'oiseau' => 'oiseau', 'chien', 'chat', 'lapin', 'rongeur' => 'compagnie', 'cheval' => 'cheval', 'ferme' => 'ferme',
        'poisson', 'reptile' => 'poisson', 'marin' => 'marin', 'sauvage' => (preg_match('/chauve|pipistrelle|murin|noctule/u', $t) ? 'poisson' : 'sauvage'),
        default => preg_match('/loup|renard|cerf|chevreuil|sanglier|ours|lynx|blaireau|hérisson|herisson|loutre|castor|bouquetin|chamois|éléphant|elephant|lion|tigre|zèbre|girafe|chauve/u', $t) ? 'sauvage' : 'autre',
    };
}

/* ───────────── lecture ───────────── */

function suivi_get(PDO $pdo, array $get): array
{
    suivi_schema($pdo);
    $op = (string) ($get['op'] ?? 'overview');
    return match ($op) {
        'overview' => suivi_overview($pdo),
        'animal' => suivi_animal($pdo, safe_int($get['id'] ?? 0)),
        'gps' => suivi_gps($pdo, safe_int($get['pet_id'] ?? 0), safe_int($get['from'] ?? 0), safe_int($get['to'] ?? 0), max(50, min(20000, safe_int($get['max'] ?? 4000)))),
        'site' => suivi_site($pdo, safe_int($get['id'] ?? 0)),
        'group' => suivi_group($pdo, safe_int($get['id'] ?? 0)),
        'share' => (static function () use ($pdo, $get) { if (function_exists('kiosk_state') && kiosk_state()['on']) { throw new RuntimeException('Mode consultation : pas de partage.'); } require_once __DIR__ . '/suivi_share.php'; return suivi_share_build($pdo, $get); })(), // 📤 lib/suivi_share.php
        'imports' => ['items' => $pdo->query('SELECT * FROM animal_gps_imports ORDER BY id DESC LIMIT 200')->fetchAll(PDO::FETCH_ASSOC)],
        default => throw new RuntimeException('Demande inconnue.'),
    };
}

/** Noms des fiches (observateurs, bagueurs, soigneurs) */
function suivi_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $s = $pdo->prepare('SELECT id, first_name, middle_name, last_name, gender FROM persons WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
        $s->execute($chunk);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) { $out[(int) $p['id']] = ['id' => (int) $p['id'], 'name' => full_name($p), 'first_name' => (string) $p['first_name'], 'last_name' => (string) $p['last_name'], 'gender' => (string) $p['gender']]; }
    }
    return $out;
}

function suivi_places(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $s = $pdo->prepare('SELECT id, name, county, country, latitude, longitude FROM places WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
        $s->execute($chunk);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) { $out[(int) $p['id']] = ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'county' => (string) $p['county'], 'country' => (string) $p['country'], 'lat' => $p['latitude'] !== null ? (float) $p['latitude'] : null, 'lon' => $p['longitude'] !== null ? (float) $p['longitude'] : null]; }
    }
    return $out;
}

function suivi_mark_out(array $m): array
{
    return ['id' => (int) $m['id'], 'pet_id' => (int) $m['pet_id'], 'kind' => (string) $m['kind'], 'code' => (string) $m['code'], 'colors' => json_decode((string) $m['colors_json'], true) ?: null,
        'position' => (string) $m['position'], 'scheme' => (string) $m['scheme'], 'model' => (string) $m['model'], 'interval_min' => $m['interval_min'] !== null ? (int) $m['interval_min'] : null,
        'start_date' => (string) $m['start_date'], 'start_iso' => (string) $m['start_iso'], 'end_date' => (string) $m['end_date'], 'end_iso' => (string) $m['end_iso'], 'end_reason' => (string) $m['end_reason'],
        'note' => (string) $m['note'], 'media_id' => $m['media_id'] !== null ? (int) $m['media_id'] : null, 'updated_at' => (string) $m['updated_at']];
}

function suivi_obs_out(array $o, array $places = [], array $people = []): array
{
    $pl = $o['place_id'] ? ($places[(int) $o['place_id']] ?? null) : null;
    $lat = $o['lat'] !== null ? (float) $o['lat'] : ($pl['lat'] ?? null); $lon = $o['lon'] !== null ? (float) $o['lon'] : ($pl['lon'] ?? null);
    return ['id' => (int) $o['id'], 'pet_id' => $o['pet_id'] !== null ? (int) $o['pet_id'] : null, 'date' => (string) $o['obs_date'], 'iso' => (string) $o['obs_iso'], 'time' => (string) $o['obs_time'],
        'lat' => $lat, 'lon' => $lon, 'place_id' => $o['place_id'] ? (int) $o['place_id'] : null, 'place' => $pl['name'] ?? '', 'place_text' => (string) $o['place_text'], 'site_id' => $o['site_id'] ? (int) $o['site_id'] : null,
        'behaviors' => array_values(array_filter(explode(',', (string) $o['behaviors']))), 'count' => $o['count'] !== null ? (int) $o['count'] : null, 'with' => json_decode((string) $o['with_json'], true) ?: [],
        'reading' => (string) $o['reading_raw'], 'reading_detail' => json_decode((string) $o['reading_json'], true) ?: null, 'reliability' => (string) $o['reliability'],
        'observer_id' => $o['observer_id'] ? (int) $o['observer_id'] : null, 'observer' => $o['observer_id'] ? ($people[(int) $o['observer_id']]['name'] ?? '') : (string) $o['observer_txt'],
        'note' => (string) $o['note'], 'source' => (string) $o['source'], 'media_ids' => $mids = (suivi_media_list($o['media_ids'] ?? '') ?: ($o['media_id'] ? [(int) $o['media_id']] : [])), 'media_id' => $mids[0] ?? null, 'sea' => suivi_clean_sea(json_decode((string) $o['sea_json'], true)) ?: null, 'updated_at' => (string) $o['updated_at']];
}

function suivi_health_out(array $h, array $places = [], array $people = []): array
{
    return ['id' => (int) $h['id'], 'pet_id' => (int) $h['pet_id'], 'date' => (string) $h['ev_date'], 'iso' => (string) $h['ev_iso'], 'state' => (string) $h['state'], 'what_kind' => (string) $h['what_kind'],
        'what_text' => (string) $h['what_text'], 'cause' => (string) $h['cause'], 'cause_text' => (string) $h['cause_text'], 'place_id' => $h['place_id'] ? (int) $h['place_id'] : null,
        'place' => $h['place_id'] ? ($places[(int) $h['place_id']]['name'] ?? '') : (string) $h['place_text'], 'carer_id' => $h['carer_id'] ? (int) $h['carer_id'] : null,
        'carer' => $h['carer_id'] ? ($people[(int) $h['carer_id']]['name'] ?? '') : (string) $h['carer_txt'], 'care' => (string) $h['care'], 'meds' => (string) $h['meds'],
        'weight_g' => $h['weight_g'] !== null ? (float) $h['weight_g'] : null, 'media_ids' => array_values(array_filter(array_map('intval', explode(',', (string) $h['media_ids'])))),
        'outcome' => (string) $h['outcome'], 'outcome_date' => (string) $h['outcome_date'], 'note' => (string) $h['note'], 'updated_at' => (string) $h['updated_at']];
}

/** Tout ce qu'il faut aux blocs, au Recensement et aux chiffres, en une fois */
function suivi_overview(PDO $pdo): array
{
    $pets = function_exists('pets_list') ? pets_list($pdo, []) : [];
    $profiles = [];
    foreach ($pdo->query('SELECT * FROM animal_profiles') as $r) { $profiles[(int) $r['pet_id']] = $r; }
    $marks = [];
    foreach ($pdo->query('SELECT * FROM animal_marks ORDER BY start_iso, id') as $m) { $marks[(int) $m['pet_id']][] = suivi_mark_out($m); }
    $obsRows = $pdo->query('SELECT * FROM animal_observations ORDER BY obs_iso DESC, obs_time DESC, id DESC LIMIT 5000')->fetchAll(PDO::FETCH_ASSOC);
    $healthRows = $pdo->query('SELECT * FROM animal_health ORDER BY ev_iso, id LIMIT 5000')->fetchAll(PDO::FETCH_ASSOC);
    $places = suivi_places($pdo, array_merge(array_column($obsRows, 'place_id'), array_column($healthRows, 'place_id'), array_column($profiles, 'ringed_place_id'), array_column($profiles, 'home_place_id')));
    $people = suivi_people($pdo, array_merge(array_column($obsRows, 'observer_id'), array_column($healthRows, 'carer_id'), array_column($profiles, 'ringer_id')));
    $obs = array_map(static fn($o) => suivi_obs_out($o, $places, $people), $obsRows);
    $health = array_map(static fn($h) => suivi_health_out($h, $places, $people), $healthRows);
    $gps = [];
    foreach ($pdo->query('SELECT pet_id, count(*) AS n, min(t) AS t0, max(t) AS t1 FROM animal_gps GROUP BY pet_id') as $g) { $gps[(int) $g['pet_id']] = ['n' => (int) $g['n'], 't0' => (int) $g['t0'], 't1' => (int) $g['t1']]; }
    $lastGps = [];
    foreach ($gps as $pid => $g) {
        $s = $pdo->prepare('SELECT lat, lon FROM animal_gps WHERE pet_id=? AND t=?'); $s->execute([$pid, $g['t1']]);
        if ($p = $s->fetch()) { $lastGps[$pid] = ['lat' => (float) $p['lat'], 'lon' => (float) $p['lon']]; }
    }
    $members = $pdo->query('SELECT * FROM animal_memberships ORDER BY start_iso, id')->fetchAll(PDO::FETCH_ASSOC);
    $groups = $pdo->query('SELECT * FROM animal_groups ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC);
    $sites = $pdo->query('SELECT * FROM track_sites ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC);
    $counts = $pdo->query('SELECT * FROM track_counts ORDER BY c_iso, id LIMIT 5000')->fetchAll(PDO::FETCH_ASSOC);
    $cPeople = suivi_people($pdo, array_column($counts, 'observer_id'));
    $sPlaces = suivi_places($pdo, array_merge(array_column($sites, 'place_id'), array_column($groups, 'place_id')));
    $tracked = [];
    foreach ($obs as $o) { if ($o['pet_id']) { $tracked[$o['pet_id']] = true; } }
    foreach (array_merge(array_keys($profiles), array_keys($marks), array_keys($gps), array_column($health, 'pet_id'), array_map('intval', array_column($members, 'pet_id'))) as $pid) { $tracked[(int) $pid] = true; }
    $animals = [];
    foreach ($pets as $p) {
        $id = (int) $p['id']; $pr = $profiles[$id] ?? null;
        $mine = array_values(array_filter($obs, static fn($o) => $o['pet_id'] === $id));
        $last = $mine[0] ?? null;
        $h = array_values(array_filter($health, static fn($x) => $x['pet_id'] === $id));
        $hLast = $h ? $h[count($h) - 1] : null;
        $animals[] = ['id' => $id, 'title' => $p['title'], 'species' => $p['species'], 'sex' => $p['sex'], 'deceased' => $p['deceased'], 'breed' => $p['breed'], 'color' => $p['color'],
            'media' => $p['media'][0] ?? null, 'tracked' => isset($tracked[$id]), 'taxon' => (string) ($pr['taxon'] ?? ''), 'sci_name' => (string) ($pr['sci_name'] ?? ''),
            'profile' => (string) ($pr['profile'] ?? '') ?: suivi_guess_profile((string) $p['species'], (string) ($pr['taxon'] ?? ''), (string) $p['breed']), 'status' => (string) ($pr['status'] ?? ''),
            'ringed_date' => (string) ($pr['ringed_date'] ?? ''), 'home' => $pr && $pr['home_place_id'] ? ($places[(int) $pr['home_place_id']] ?? null) : null,
            'marks' => $marks[$id] ?? [], 'obs_count' => count($mine), 'sites' => count(array_unique(array_filter(array_map(static fn($o) => $o['site_id'] ?: ($o['place_id'] ? 'p' . $o['place_id'] : null), $mine)))),
            'last_obs' => $last, 'gps' => $gps[$id] ?? null, 'gps_last' => $lastGps[$id] ?? null, 'health' => $hLast, 'health_count' => count($h),
            'weights' => array_values(array_filter(array_map(static fn($x) => $x['weight_g'] !== null ? ['iso' => $x['iso'], 'g' => $x['weight_g']] : null, $h))),
            'groups' => array_values(array_map(static fn($m) => ['group_id' => (int) $m['group_id'], 'role' => (string) $m['role']], array_filter($members, static fn($m) => (int) $m['pet_id'] === $id && $m['end_iso'] === '' && $m['end_date'] === '')))];
    }
    return ['animals' => $animals, 'observations' => $obs, 'health' => $health,
        'sites' => array_map(static fn($s) => suivi_site_out($s, $sPlaces), $sites),
        'counts' => array_map(static fn($c) => ['id' => (int) $c['id'], 'site_id' => (int) $c['site_id'], 'date' => (string) $c['c_date'], 'iso' => (string) $c['c_iso'], 'time' => (string) $c['c_time'], 'what' => (string) $c['what'], 'what_text' => (string) $c['what_text'], 'number' => $c['number'] !== null ? (int) $c['number'] : null, 'unit' => (string) $c['unit'], 'observer_id' => $c['observer_id'] ? (int) $c['observer_id'] : null, 'observer' => $c['observer_id'] ? ($cPeople[(int) $c['observer_id']]['name'] ?? '') : (string) $c['observer_txt'], 'note' => (string) $c['note']], $counts),
        'groups' => array_map(static fn($g) => suivi_group_out($g, $sPlaces), $groups),
        'members' => array_map('suivi_member_out', $members),
        'people' => (object) $people, 'meteo' => is_file(__DIR__ . '/meteo.php')];
}

function suivi_site_out(array $s, array $places = []): array
{
    $pl = $s['place_id'] ? ($places[(int) $s['place_id']] ?? null) : null;
    return ['id' => (int) $s['id'], 'name' => (string) $s['name'], 'kind' => (string) $s['kind'], 'place_id' => $s['place_id'] ? (int) $s['place_id'] : null, 'place' => $pl,
        'lat' => $s['lat'] !== null ? (float) $s['lat'] : ($pl['lat'] ?? null), 'lon' => $s['lon'] !== null ? (float) $s['lon'] : ($pl['lon'] ?? null), 'area_ha' => $s['area_ha'] !== null ? (float) $s['area_ha'] : null,
        'since' => (string) $s['since'], 'outline' => suivi_clean_outline(json_decode((string) $s['outline_json'], true)), 'note' => (string) $s['note'], 'updated_at' => (string) $s['updated_at']];
}

function suivi_group_out(array $g, array $places = []): array
{
    return ['id' => (int) $g['id'], 'name' => (string) $g['name'], 'kind' => (string) $g['kind'], 'species' => (string) $g['species'], 'territory' => (string) $g['territory'],
        'site_id' => $g['site_id'] ? (int) $g['site_id'] : null, 'place_id' => $g['place_id'] ? (int) $g['place_id'] : null, 'place' => $g['place_id'] ? ($places[(int) $g['place_id']] ?? null) : null,
        'note' => (string) $g['note'], 'updated_at' => (string) $g['updated_at']];
}

function suivi_member_out(array $m): array
{
    return ['id' => (int) $m['id'], 'pet_id' => (int) $m['pet_id'], 'group_id' => (int) $m['group_id'], 'role' => (string) $m['role'], 'start_date' => (string) $m['start_date'], 'start_iso' => (string) $m['start_iso'],
        'start_reason' => (string) $m['start_reason'], 'end_date' => (string) $m['end_date'], 'end_iso' => (string) $m['end_iso'], 'end_reason' => (string) $m['end_reason'], 'note' => (string) $m['note']];
}

/** La fiche de suivi d'un animal : profil, marques, observations, santé, groupes, trajets */
function suivi_animal(PDO $pdo, int $id): array
{
    suivi_need_pet($pdo, $id);
    $pet = function_exists('pet_row') ? pet_row($pdo, $id) : null;
    $s = $pdo->prepare('SELECT * FROM animal_profiles WHERE pet_id=?'); $s->execute([$id]); $pr = $s->fetch(PDO::FETCH_ASSOC) ?: null;
    $s = $pdo->prepare('SELECT * FROM animal_marks WHERE pet_id=? ORDER BY start_iso, id'); $s->execute([$id]); $marks = array_map('suivi_mark_out', $s->fetchAll(PDO::FETCH_ASSOC));
    $s = $pdo->prepare('SELECT * FROM animal_observations WHERE pet_id=? OR with_json LIKE ? ORDER BY obs_iso DESC, obs_time DESC, id DESC'); $s->execute([$id, '%' . $id . '%']); $obsRows = $s->fetchAll(PDO::FETCH_ASSOC); // with_json = « [3,5] » (sans guillemets) : le tri exact est juste dessous
    $obsRows = array_values(array_filter($obsRows, static fn($o) => (int) $o['pet_id'] === $id || in_array($id, array_map('intval', json_decode((string) $o['with_json'], true) ?: []), true)));
    $s = $pdo->prepare('SELECT * FROM animal_health WHERE pet_id=? ORDER BY ev_iso, id'); $s->execute([$id]); $hRows = $s->fetchAll(PDO::FETCH_ASSOC);
    $s = $pdo->prepare('SELECT m.*, g.name AS group_name, g.kind AS group_kind FROM animal_memberships m LEFT JOIN animal_groups g ON g.id=m.group_id WHERE m.pet_id=? ORDER BY m.start_iso, m.id'); $s->execute([$id]);
    $members = array_map(static fn($m) => suivi_member_out($m) + ['group_name' => (string) ($m['group_name'] ?? ''), 'group_kind' => (string) ($m['group_kind'] ?? '')], $s->fetchAll(PDO::FETCH_ASSOC));
    $s = $pdo->prepare('SELECT * FROM animal_gps_imports WHERE pet_id=? ORDER BY first_t'); $s->execute([$id]); $imports = $s->fetchAll(PDO::FETCH_ASSOC);
    $s = $pdo->prepare('SELECT count(*) AS n, min(t) AS t0, max(t) AS t1 FROM animal_gps WHERE pet_id=?'); $s->execute([$id]); $g = $s->fetch(PDO::FETCH_ASSOC);
    $places = suivi_places($pdo, array_merge(array_column($obsRows, 'place_id'), array_column($hRows, 'place_id'), [$pr['ringed_place_id'] ?? 0, $pr['home_place_id'] ?? 0]));
    $people = suivi_people($pdo, array_merge(array_column($obsRows, 'observer_id'), array_column($hRows, 'carer_id'), [$pr['ringer_id'] ?? 0]));
    $d = $pet['d'] ?? [];
    $profile = $pr ? ['taxon' => (string) $pr['taxon'], 'sci_name' => (string) $pr['sci_name'], 'profile' => (string) $pr['profile'], 'status' => (string) $pr['status'], 'ringed_date' => (string) $pr['ringed_date'],
        'ringed_place_id' => $pr['ringed_place_id'] ? (int) $pr['ringed_place_id'] : null, 'ringed_place' => $pr['ringed_place_id'] ? ($places[(int) $pr['ringed_place_id']] ?? null) : null,
        'ringer_id' => $pr['ringer_id'] ? (int) $pr['ringer_id'] : null, 'ringer' => $pr['ringer_id'] ? ($people[(int) $pr['ringer_id']]['name'] ?? '') : (string) $pr['ringer_txt'], 'program' => (string) $pr['program'],
        'age_class' => (string) $pr['age_class'], 'home_place_id' => $pr['home_place_id'] ? (int) $pr['home_place_id'] : null, 'home' => $pr['home_place_id'] ? ($places[(int) $pr['home_place_id']] ?? null) : null, 'note' => (string) $pr['note']] : null;
    return ['id' => $id, 'title' => function_exists('pet_title') ? pet_title($d) : 'Animal', 'species' => (string) ($d['species'] ?? ''), 'breed' => (string) ($d['breed'] ?? ''), 'sex' => (string) ($d['sex'] ?? ''),
        'deceased' => !empty($d['deceased']), 'birth_date' => (string) ($d['birth_date'] ?? ''), 'microchip' => (string) ($d['microchip'] ?? ''), 'tattoo' => (string) ($d['tattoo'] ?? ''), 'ueln' => (string) ($d['ueln'] ?? ''),
        'owners' => array_values(array_map(static fn($o) => ['person_id' => (int) ($o['person_id'] ?? 0), 'name' => (string) ($o['name'] ?? '')], $d['owners'] ?? [])),
        'profile' => $profile, 'guess' => suivi_guess_profile((string) ($d['species'] ?? ''), (string) ($pr['taxon'] ?? ''), (string) ($d['breed'] ?? '')),
        'marks' => $marks, 'observations' => array_map(static fn($o) => suivi_obs_out($o, $places, $people), $obsRows), 'health' => array_map(static fn($h) => suivi_health_out($h, $places, $people), $hRows),
        'members' => $members, 'imports' => array_map(static fn($i) => ['id' => (int) $i['id'], 'filename' => (string) $i['filename'], 'format' => (string) $i['format'], 'points' => (int) $i['points'], 'first_t' => (int) $i['first_t'], 'last_t' => (int) $i['last_t'], 'km' => $i['km'] !== null ? (float) $i['km'] : null, 'nights' => (int) $i['nights'], 'created_at' => (string) $i['created_at']], $imports),
        'gps' => ['n' => (int) ($g['n'] ?? 0), 't0' => $g['t0'] !== null ? (int) $g['t0'] : null, 't1' => $g['t1'] !== null ? (int) $g['t1'] : null]];
}

/** Les points GPS d'un animal entre deux instants (au plus « max », pris régulièrement si trop nombreux) */
function suivi_gps(PDO $pdo, int $petId, int $from, int $to, int $max): array
{
    suivi_need_pet($pdo, $petId);
    $to = $to ?: PHP_INT_MAX;
    $c = $pdo->prepare('SELECT count(*) FROM animal_gps WHERE pet_id=? AND t BETWEEN ? AND ?'); $c->execute([$petId, $from, $to]); $n = (int) $c->fetchColumn();
    $step = max(1, (int) ceil($n / $max));
    $s = $pdo->prepare('SELECT t, lat, lon FROM animal_gps WHERE pet_id=? AND t BETWEEN ? AND ? ORDER BY t'); $s->execute([$petId, $from, $to]);
    $pts = []; $i = 0;
    while ($r = $s->fetch(PDO::FETCH_NUM)) { if ($i++ % $step === 0) { $pts[] = [(int) $r[0], round((float) $r[1], 6), round((float) $r[2], 6)]; } }
    return ['pet_id' => $petId, 'total' => $n, 'step' => $step, 'points' => $pts];
}

function suivi_site(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM track_sites WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Site introuvable.'); }
    $places = suivi_places($pdo, [$r['place_id']]);
    $c = $pdo->prepare('SELECT * FROM track_counts WHERE site_id=? ORDER BY c_iso DESC, id DESC'); $c->execute([$id]); $counts = $c->fetchAll(PDO::FETCH_ASSOC);
    $people = suivi_people($pdo, array_column($counts, 'observer_id'));
    $o = $pdo->prepare('SELECT pet_id, count(*) AS n FROM animal_observations WHERE site_id=? GROUP BY pet_id ORDER BY n DESC'); $o->execute([$id]);
    $seen = $o->fetchAll(PDO::FETCH_ASSOC);
    return ['site' => suivi_site_out($r, $places), 'counts' => array_map(static fn($x) => ['id' => (int) $x['id'], 'date' => (string) $x['c_date'], 'iso' => (string) $x['c_iso'], 'time' => (string) $x['c_time'], 'what' => (string) $x['what'], 'what_text' => (string) $x['what_text'], 'number' => $x['number'] !== null ? (int) $x['number'] : null, 'unit' => (string) $x['unit'], 'observer_id' => $x['observer_id'] ? (int) $x['observer_id'] : null, 'observer' => $x['observer_id'] ? ($people[(int) $x['observer_id']]['name'] ?? '') : (string) $x['observer_txt'], 'note' => (string) $x['note']], $counts),
        'seen' => array_map(static fn($x) => ['pet_id' => $x['pet_id'] !== null ? (int) $x['pet_id'] : null, 'n' => (int) $x['n']], $seen)];
}

function suivi_group(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM animal_groups WHERE id=?'); $s->execute([$id]); $g = $s->fetch(PDO::FETCH_ASSOC);
    if (!$g) { throw new RuntimeException('Groupe introuvable.'); }
    $m = $pdo->prepare('SELECT * FROM animal_memberships WHERE group_id=? ORDER BY start_iso, id'); $m->execute([$id]);
    return ['group' => suivi_group_out($g, suivi_places($pdo, [$g['place_id']])), 'members' => array_map('suivi_member_out', $m->fetchAll(PDO::FETCH_ASSOC))];
}

/* ───────────── écriture ───────────── */

function suivi_write(PDO $pdo, array $data): array
{
    suivi_schema($pdo);
    $op = (string) ($data['op'] ?? '');
    return match ($op) {
        'save_profile' => suivi_save_profile($pdo, $data),
        'create_animal' => suivi_create_animal($pdo, $data),
        'save_mark' => suivi_save_mark($pdo, $data),
        'save_obs' => suivi_save_obs($pdo, $data),
        'save_health' => suivi_save_health($pdo, $data),
        'save_site' => suivi_save_site($pdo, $data),
        'save_count' => suivi_save_count($pdo, $data),
        'save_group' => suivi_save_group($pdo, $data),
        'save_member' => suivi_save_member($pdo, $data),
        'delete' => suivi_delete($pdo, $data),
        'gps_import' => suivi_gps_import($pdo, $data),
        'gps_undo' => suivi_gps_undo($pdo, $data),
        'share_analyze', 'share_apply', 'share_undo' => (static function () use ($pdo, $data, $op) { require_once __DIR__ . '/suivi_share.php'; return suivi_share_write($pdo, $op, $data); })(), // 📤 recevoir, fusionner
        default => throw new RuntimeException('Action inconnue.'),
    };
}

/** Le profil de suivi (espèce exacte, profil de marques, baguage, programme, maison) */
function suivi_save_profile(PDO $pdo, array $d): array
{
    $id = safe_int($d['pet_id'] ?? 0); suivi_need_pet($pdo, $id);
    $profile = in_array($d['profile'] ?? '', SUIVI_PROFILES, true) ? $d['profile'] : '';
    [$ringer, $ringerTxt] = suivi_who($d['ringer'] ?? ($d['ringer_id'] ?? ''), $d['ringer_txt'] ?? '');
    $vals = [suivi_txt($d['taxon'] ?? '', 120), suivi_txt($d['sci_name'] ?? '', 120), $profile, in_array($d['status'] ?? 'suivi', ['suivi', 'pause', 'fini', 'perdu'], true) ? ($d['status'] ?? 'suivi') : 'suivi',
        suivi_txt($d['ringed_date'] ?? '', 60), suivi_iso(suivi_txt($d['ringed_date'] ?? '', 60)), suivi_place_ok($pdo, $d['ringed_place_id'] ?? 0), $ringer, $ringerTxt,
        suivi_txt($d['program'] ?? '', 200), in_array($d['age_class'] ?? '', ['', 'poussin', 'jeune', 'adulte', 'inconnu'], true) ? ($d['age_class'] ?? '') : '', suivi_place_ok($pdo, $d['home_place_id'] ?? 0), suivi_txt($d['note'] ?? '', 4000)];
    $pdo->prepare('INSERT INTO animal_profiles(pet_id, taxon, sci_name, profile, status, ringed_date, ringed_iso, ringed_place_id, ringer_id, ringer_txt, program, age_class, home_place_id, note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(pet_id) DO UPDATE SET taxon=excluded.taxon, sci_name=excluded.sci_name, profile=excluded.profile, status=excluded.status, ringed_date=excluded.ringed_date, ringed_iso=excluded.ringed_iso,
        ringed_place_id=excluded.ringed_place_id, ringer_id=excluded.ringer_id, ringer_txt=excluded.ringer_txt, program=excluded.program, age_class=excluded.age_class, home_place_id=excluded.home_place_id, note=excluded.note, updated_at=CURRENT_TIMESTAMP')
        ->execute([$id, ...$vals]);
    log_change($pdo, 'animal_profile', $id, 'update', 'Suivi de l’animal enregistré (n°' . $id . ')');
    return ['pet_id' => $id];
}

/** Un nouvel animal suivi (fiche d'animal + profil) : « ＋ Créer la fiche d'un nouvel animal » de l'observation */
function suivi_create_animal(PDO $pdo, array $d): array
{
    $name = suivi_txt($d['name'] ?? '', 120);
    $species = (string) ($d['species'] ?? 'autre');
    $r = save_pet($pdo, ['data' => ['name' => $name, 'species' => $species, 'sex' => in_array($d['sex'] ?? '', ['M', 'F'], true) ? $d['sex'] : '']]);
    $pdo->prepare("INSERT OR IGNORE INTO animal_profiles(pet_id, taxon, profile, status) VALUES(?,?,?, 'suivi')")
        ->execute([(int) $r['id'], suivi_txt($d['taxon'] ?? '', 120), in_array($d['profile'] ?? '', SUIVI_PROFILES, true) ? $d['profile'] : '']);
    return ['id' => (int) $r['id'], 'title' => $r['title']];
}

/** Couleurs des bagues : {L:[haut, bas], R:[haut, bas]}, chaque bague {color:#hex, name, code, code_color, metal} ou null */
function suivi_clean_colors(mixed $v): string
{
    if (!is_array($v)) { return ''; }
    $ring = static function ($r) {
        if (!is_array($r)) { return null; }
        $c = is_string($r['color'] ?? null) && preg_match('/^#[0-9a-fA-F]{6}$/', $r['color']) ? strtolower($r['color']) : '';
        $out = ['color' => $c, 'name' => suivi_txt($r['name'] ?? '', 30), 'code' => suivi_txt($r['code'] ?? '', 12), 'code_color' => is_string($r['code_color'] ?? null) && preg_match('/^#[0-9a-fA-F]{6}$/', $r['code_color']) ? strtolower($r['code_color']) : '', 'metal' => !empty($r['metal'])];
        return $out['color'] !== '' || $out['metal'] ? $out : null;
    };
    $out = [];
    foreach (['L', 'R'] as $leg) { $out[$leg] = [$ring($v[$leg][0] ?? null), $ring($v[$leg][1] ?? null)]; }
    if (isset($v['single']) && is_array($v['single'])) { $out['single'] = $ring($v['single']); } // collier, marque d'aile, boucle : une couleur
    return json_encode($out, JSON_UNESCAPED_UNICODE);
}

function suivi_save_mark(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $pet = safe_int($d['pet_id'] ?? 0); suivi_need_pet($pdo, $pet);
    $kind = in_array($d['kind'] ?? '', SUIVI_MARK_KINDS, true) ? $d['kind'] : 'other';
    $code = suivi_txt($d['code'] ?? '', 80);
    if ($kind === 'chip' && $code !== '' && !preg_match('/^[0-9 ]{6,20}$/', $code)) { throw new RuntimeException('Un numéro de puce n’a que des chiffres (15 en général).'); }
    $start = suivi_txt($d['start_date'] ?? '', 60); $end = suivi_txt($d['end_date'] ?? '', 60);
    $interval = $d['interval_min'] ?? null; $interval = $interval === null || $interval === '' ? null : max(0, min(100000, (int) $interval));
    $vals = [$pet, $kind, $code, suivi_norm($code), suivi_clean_colors($d['colors'] ?? null), suivi_txt($d['position'] ?? '', 120), suivi_txt($d['scheme'] ?? '', 120), suivi_txt($d['model'] ?? '', 120), $interval,
        $start, suivi_iso($start), $end, suivi_iso($end), suivi_txt($d['end_reason'] ?? '', 200), suivi_txt($d['note'] ?? '', 2000), safe_int($d['media_id'] ?? 0) ?: null];
    if ($id) {
        $before = suivi_row($pdo, 'animal_marks', $id); if (!$before) { throw new RuntimeException('Marque introuvable.'); }
        $pdo->prepare('UPDATE animal_marks SET pet_id=?, kind=?, code=?, code_norm=?, colors_json=?, position=?, scheme=?, model=?, interval_min=?, start_date=?, start_iso=?, end_date=?, end_iso=?, end_reason=?, note=?, media_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'animal_mark', $id, 'update', 'Marque modifiée (' . $kind . ' ' . $code . ')', $before);
    } else {
        $pdo->prepare('INSERT INTO animal_marks(pet_id, kind, code, code_norm, colors_json, position, scheme, model, interval_min, start_date, start_iso, end_date, end_iso, end_reason, note, media_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'animal_mark', $id, 'create', 'Marque ajoutée (' . $kind . ' ' . $code . ')');
    }
    $pdo->prepare("INSERT OR IGNORE INTO animal_profiles(pet_id, status) VALUES(?, 'suivi')")->execute([$pet]);
    return ['id' => $id];
}

/** Lecture du code : brute (« 7? », « 7[K|X] ») + possibilités par caractère ; couleurs vues sur les pattes */
function suivi_clean_reading(mixed $v): string
{
    if (!is_array($v)) { return ''; }
    $chars = [];
    foreach (array_slice(is_array($v['chars'] ?? null) ? $v['chars'] : [], 0, 30) as $c) {
        if ($c === null) { $chars[] = null; continue; }
        if (!is_array($c)) { continue; }
        $chars[] = array_values(array_slice(array_unique(array_filter(array_map(static fn($x) => strtoupper(mb_substr((string) (is_scalar($x) ? $x : ''), 0, 1)), $c), static fn($x) => $x !== '' && preg_match('/^[0-9A-Z]$/', $x))), 0, 10));
    }
    $colors = [];
    foreach (['L', 'R'] as $leg) {
        foreach ([0, 1] as $i) {
            $x = $v['colors'][$leg][$i] ?? null;
            $colors[$leg][$i] = is_string($x) && preg_match('/^(#[0-9a-f]{6}|\?|none|metal|[a-z_]{2,20})$/i', $x) ? $x : null;
        }
    }
    return json_encode(['chars' => $chars, 'colors' => $colors, 'number' => suivi_txt($v['number'] ?? '', 40)], JSON_UNESCAPED_UNICODE);
}

function suivi_save_obs(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $pet = safe_int($d['pet_id'] ?? 0); if ($pet && !suivi_pet_exists($pdo, $pet)) { throw new RuntimeException('Animal introuvable.'); }
    $date = suivi_txt($d['date'] ?? '', 60);
    if ($date === '') { throw new RuntimeException('Dis quand tu l’as vu.'); }
    $with = array_values(array_slice(array_unique(array_filter(array_map('intval', is_array($d['with'] ?? null) ? $d['with'] : explode(',', (string) ($d['with'] ?? ''))), static fn($x) => $x > 0 && $x !== $pet)), 0, 50));
    $with = array_values(array_filter($with, static fn($x) => suivi_pet_exists($pdo, $x)));
    $beh = implode(',', array_slice(array_unique(array_filter(array_map(static fn($x) => suivi_txt($x, 40), is_array($d['behaviors'] ?? null) ? $d['behaviors'] : explode(',', (string) ($d['behaviors'] ?? ''))))), 0, 12));
    [$obsId, $obsTxt] = suivi_who($d['observer'] ?? ($d['observer_id'] ?? ''), $d['observer_txt'] ?? '');
    $site = safe_int($d['site_id'] ?? 0); if ($site) { $s = $pdo->prepare('SELECT 1 FROM track_sites WHERE id=?'); $s->execute([$site]); if (!$s->fetchColumn()) { $site = 0; } }
    $count = $d['count'] ?? null; $count = $count === null || $count === '' ? null : max(0, min(10000000, (int) $count));
    $sea = suivi_clean_sea($d['sea'] ?? null);
    // plusieurs photos, sons ou vidéos (media_ids) ; l'ancien envoi à un seul média (media_id) est encore compris
    $mids = array_key_exists('media_ids', $d) ? suivi_media_list($d['media_ids']) : suivi_media_list($d['media_id'] ?? '');
    $vals = [$pet ?: null, $date, suivi_iso($date), suivi_time($d['time'] ?? ''), suivi_float($d['lat'] ?? null, -90, 90), suivi_float($d['lon'] ?? null, -180, 180), suivi_place_ok($pdo, $d['place_id'] ?? 0),
        suivi_txt($d['place_text'] ?? '', 200), $site ?: null, $beh, $count, $with ? json_encode($with) : '', suivi_txt($d['reading'] ?? '', 80), suivi_clean_reading($d['reading_detail'] ?? null),
        in_array($d['reliability'] ?? '', SUIVI_RELIABILITY, true) ? (string) ($d['reliability'] ?? '') : '', $obsId, $obsTxt, suivi_txt($d['note'] ?? '', 4000),
        in_array($d['source'] ?? 'manuel', SUIVI_SOURCES, true) ? ($d['source'] ?? 'manuel') : 'manuel', $mids[0] ?? null, implode(',', $mids), $sea ? json_encode($sea, JSON_UNESCAPED_UNICODE) : ''];
    if ($id) {
        $before = suivi_row($pdo, 'animal_observations', $id); if (!$before) { throw new RuntimeException('Observation introuvable.'); }
        $pdo->prepare('UPDATE animal_observations SET pet_id=?, obs_date=?, obs_iso=?, obs_time=?, lat=?, lon=?, place_id=?, place_text=?, site_id=?, behaviors=?, count=?, with_json=?, reading_raw=?, reading_json=?, reliability=?, observer_id=?, observer_txt=?, note=?, source=?, media_id=?, media_ids=?, sea_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'animal_obs', $id, 'update', 'Observation modifiée (' . $date . ')', $before);
    } else {
        $pdo->prepare('INSERT INTO animal_observations(pet_id, obs_date, obs_iso, obs_time, lat, lon, place_id, place_text, site_id, behaviors, count, with_json, reading_raw, reading_json, reliability, observer_id, observer_txt, note, source, media_id, media_ids, sea_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'animal_obs', $id, 'create', 'Observation ajoutée (' . $date . ')');
    }
    if ($pet) { $pdo->prepare("INSERT OR IGNORE INTO animal_profiles(pet_id, status) VALUES(?, 'suivi')")->execute([$pet]); }
    return ['id' => $id];
}

function suivi_save_health(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $pet = safe_int($d['pet_id'] ?? 0); suivi_need_pet($pdo, $pet);
    $date = suivi_txt($d['date'] ?? '', 60);
    if ($date === '') { throw new RuntimeException('Donne la date de l’événement.'); }
    $state = in_array($d['state'] ?? '', SUIVI_HEALTH_STATES, true) ? $d['state'] : '';
    [$carer, $carerTxt] = suivi_who($d['carer'] ?? ($d['carer_id'] ?? ''), $d['carer_txt'] ?? '');
    $media = implode(',', array_slice(array_unique(array_filter(array_map('intval', is_array($d['media_ids'] ?? null) ? $d['media_ids'] : explode(',', (string) ($d['media_ids'] ?? ''))))), 0, 40));
    $outcome = in_array($d['outcome'] ?? '', ['', 'relache', 'mort'], true) ? ($d['outcome'] ?? '') : '';
    $vals = [$pet, $date, suivi_iso($date), $state, suivi_txt($d['what_kind'] ?? '', 40), suivi_txt($d['what_text'] ?? '', 600), suivi_txt($d['cause'] ?? '', 40), suivi_txt($d['cause_text'] ?? '', 600),
        suivi_place_ok($pdo, $d['place_id'] ?? 0), suivi_txt($d['place_text'] ?? '', 200), $carer, $carerTxt, suivi_txt($d['care'] ?? '', 2000), suivi_txt($d['meds'] ?? '', 2000),
        suivi_float($d['weight_g'] ?? null, 0, 20000000), $media, $outcome, suivi_txt($d['outcome_date'] ?? '', 60), suivi_txt($d['note'] ?? '', 4000)];
    if ($id) {
        $before = suivi_row($pdo, 'animal_health', $id); if (!$before) { throw new RuntimeException('Événement introuvable.'); }
        $pdo->prepare('UPDATE animal_health SET pet_id=?, ev_date=?, ev_iso=?, state=?, what_kind=?, what_text=?, cause=?, cause_text=?, place_id=?, place_text=?, carer_id=?, carer_txt=?, care=?, meds=?, weight_g=?, media_ids=?, outcome=?, outcome_date=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'animal_health', $id, 'update', 'Événement de santé modifié (' . $date . ')', $before);
    } else {
        $pdo->prepare('INSERT INTO animal_health(pet_id, ev_date, ev_iso, state, what_kind, what_text, cause, cause_text, place_id, place_text, carer_id, carer_txt, care, meds, weight_g, media_ids, outcome, outcome_date, note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'animal_health', $id, 'create', 'Événement de santé ajouté (' . $date . ')');
    }
    $pdo->prepare("INSERT OR IGNORE INTO animal_profiles(pet_id, status) VALUES(?, 'suivi')")->execute([$pet]);
    return ['id' => $id];
}

/** Le contour d'un site : au plus 400 points [lat, lon] lisibles (le reste est jeté : une carte ne doit jamais tomber sur un point abîmé) */
function suivi_clean_outline(mixed $v): array
{
    $outline = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, 400) as $p) {
        if (!is_array($p)) { continue; }
        $la = suivi_float($p[0] ?? null, -90, 90); $lo = suivi_float($p[1] ?? null, -180, 180);
        if ($la !== null && $lo !== null) { $outline[] = [round($la, 6), round($lo, 6)]; }
    }
    return $outline;
}

/** Les mesures en mer d'une observation : seulement profondeur, taille du groupe, surface, caméra */
function suivi_clean_sea(mixed $v): array
{
    $sea = [];
    if (!is_array($v)) { return $sea; }
    foreach (['depth_m' => [0, 12000], 'group_size' => [0, 100000]] as $k => [$a, $b]) { $f = suivi_float(is_scalar($v[$k] ?? null) ? $v[$k] : null, $a, $b); if ($f !== null) { $sea[$k] = $f; } }
    foreach (['surface', 'camera'] as $k) { if (($t = suivi_txt($v[$k] ?? '', 120)) !== '') { $sea[$k] = $t; } }
    return $sea;
}

function suivi_save_site(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $name = suivi_txt($d['name'] ?? '', 160);
    if ($name === '') { throw new RuntimeException('Donne un nom au site.'); }
    $outline = suivi_clean_outline($d['outline'] ?? null);
    $vals = [$name, suivi_txt($d['kind'] ?? '', 60), suivi_place_ok($pdo, $d['place_id'] ?? 0), suivi_float($d['lat'] ?? null, -90, 90), suivi_float($d['lon'] ?? null, -180, 180),
        suivi_float($d['area_ha'] ?? null, 0, 1e9), suivi_txt($d['since'] ?? '', 60), $outline ? json_encode($outline) : '', suivi_txt($d['note'] ?? '', 4000)];
    if ($id) {
        $before = suivi_row($pdo, 'track_sites', $id); if (!$before) { throw new RuntimeException('Site introuvable.'); }
        $pdo->prepare('UPDATE track_sites SET name=?, kind=?, place_id=?, lat=?, lon=?, area_ha=?, since=?, outline_json=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'track_site', $id, 'update', 'Site de suivi modifié : ' . $name, $before);
    } else {
        $pdo->prepare('INSERT INTO track_sites(name, kind, place_id, lat, lon, area_ha, since, outline_json, note) VALUES(?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'track_site', $id, 'create', 'Site de suivi créé : ' . $name);
    }
    return ['id' => $id, 'title' => $name];
}

function suivi_save_count(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $site = safe_int($d['site_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM track_sites WHERE id=?'); $s->execute([$site]); if (!$s->fetchColumn()) { throw new RuntimeException('Site introuvable.'); }
    $date = suivi_txt($d['date'] ?? '', 60); if ($date === '') { throw new RuntimeException('Donne la date du comptage.'); }
    [$obs, $obsTxt] = suivi_who($d['observer'] ?? ($d['observer_id'] ?? ''), $d['observer_txt'] ?? '');
    $n = $d['number'] ?? null; $n = $n === null || $n === '' ? null : max(0, min(100000000, (int) $n));
    $vals = [$site, $date, suivi_iso($date), suivi_time($d['time'] ?? ''), suivi_txt($d['what'] ?? '', 40), suivi_txt($d['what_text'] ?? '', 200), $n, suivi_txt($d['unit'] ?? '', 40), $obs, $obsTxt, suivi_txt($d['note'] ?? '', 2000)];
    if ($id) {
        $before = suivi_row($pdo, 'track_counts', $id); if (!$before) { throw new RuntimeException('Comptage introuvable.'); }
        $pdo->prepare('UPDATE track_counts SET site_id=?, c_date=?, c_iso=?, c_time=?, what=?, what_text=?, number=?, unit=?, observer_id=?, observer_txt=?, note=? WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'track_count', $id, 'update', 'Comptage modifié (' . $date . ')', $before);
    } else {
        $pdo->prepare('INSERT INTO track_counts(site_id, c_date, c_iso, c_time, what, what_text, number, unit, observer_id, observer_txt, note) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'track_count', $id, 'create', 'Comptage ajouté (' . $date . ')');
    }
    return ['id' => $id];
}

function suivi_save_group(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $name = suivi_txt($d['name'] ?? '', 160);
    if ($name === '') { throw new RuntimeException('Donne un nom au groupe.'); }
    $site = safe_int($d['site_id'] ?? 0); if ($site) { $s = $pdo->prepare('SELECT 1 FROM track_sites WHERE id=?'); $s->execute([$site]); if (!$s->fetchColumn()) { $site = 0; } }
    $vals = [$name, suivi_txt($d['kind'] ?? 'groupe', 40) ?: 'groupe', suivi_txt($d['species'] ?? '', 120), suivi_txt($d['territory'] ?? '', 300), $site ?: null, suivi_place_ok($pdo, $d['place_id'] ?? 0), suivi_txt($d['note'] ?? '', 4000)];
    if ($id) {
        $before = suivi_row($pdo, 'animal_groups', $id); if (!$before) { throw new RuntimeException('Groupe introuvable.'); }
        $pdo->prepare('UPDATE animal_groups SET name=?, kind=?, species=?, territory=?, site_id=?, place_id=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'animal_group', $id, 'update', 'Groupe modifié : ' . $name, $before);
    } else {
        $pdo->prepare('INSERT INTO animal_groups(name, kind, species, territory, site_id, place_id, note) VALUES(?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'animal_group', $id, 'create', 'Groupe créé : ' . $name);
    }
    return ['id' => $id, 'title' => $name];
}

/**
 * Une ligne de l'histoire sociale : entrée (ou naissance) dans un groupe avec un rôle, puis sortie (départ, exclusion,
 * mort, passage dans un autre groupe, changement de rôle). « transfer_to » : la sortie crée l'entrée dans l'autre groupe ;
 * « new_role » : la sortie « role » crée la ligne suivante dans le même groupe.
 */
function suivi_save_member(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $pet = safe_int($d['pet_id'] ?? 0); suivi_need_pet($pdo, $pet);
    $group = safe_int($d['group_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM animal_groups WHERE id=?'); $s->execute([$group]); if (!$s->fetchColumn()) { throw new RuntimeException('Groupe introuvable.'); }
    $start = suivi_txt($d['start_date'] ?? '', 60); $end = suivi_txt($d['end_date'] ?? '', 60);
    $endReason = in_array($d['end_reason'] ?? '', SUIVI_END_REASONS, true) ? ($d['end_reason'] ?? '') : '';
    if ($endReason !== '' && $end === '') { $end = '?'; }
    $vals = [$pet, $group, suivi_txt($d['role'] ?? '', 60), $start, suivi_iso($start), in_array($d['start_reason'] ?? 'entree', SUIVI_START_REASONS, true) ? ($d['start_reason'] ?? 'entree') : 'entree',
        $end, suivi_iso($end), $endReason, suivi_txt($d['note'] ?? '', 2000)];
    if ($id) {
        $before = suivi_row($pdo, 'animal_memberships', $id); if (!$before) { throw new RuntimeException('Appartenance introuvable.'); }
        $pdo->prepare('UPDATE animal_memberships SET pet_id=?, group_id=?, role=?, start_date=?, start_iso=?, start_reason=?, end_date=?, end_iso=?, end_reason=?, note=? WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'animal_member', $id, 'update', 'Appartenance à un groupe modifiée', $before);
    } else {
        $pdo->prepare('INSERT INTO animal_memberships(pet_id, group_id, role, start_date, start_iso, start_reason, end_date, end_iso, end_reason, note) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'animal_member', $id, 'create', 'Entrée dans un groupe');
    }
    $next = 0;
    if ($endReason === 'transfert' && ($to = safe_int($d['transfer_to'] ?? 0))) {
        $next = suivi_save_member($pdo, ['pet_id' => $pet, 'group_id' => $to, 'role' => $d['new_role'] ?? '', 'start_date' => $end === '?' ? '' : $end, 'start_reason' => 'transfert'])['id'];
    } elseif ($endReason === 'role' && suivi_txt($d['new_role'] ?? '', 60) !== '') {
        $next = suivi_save_member($pdo, ['pet_id' => $pet, 'group_id' => $group, 'role' => $d['new_role'], 'start_date' => $end === '?' ? '' : $end, 'start_reason' => 'role'])['id'];
    }
    $pdo->prepare("INSERT OR IGNORE INTO animal_profiles(pet_id, status) VALUES(?, 'suivi')")->execute([$pet]);
    return ['id' => $id, 'next_id' => $next];
}

/** Supprimer : la ligne entière (et ses lignes liées) gardée au journal, « ↶ Annuler » la remet (restore_last_delete) */
function suivi_delete(PDO $pdo, array $d): array
{
    $map = ['animal_mark' => 'animal_marks', 'animal_obs' => 'animal_observations', 'animal_health' => 'animal_health', 'track_site' => 'track_sites',
        'track_count' => 'track_counts', 'animal_group' => 'animal_groups', 'animal_member' => 'animal_memberships'];
    $type = (string) ($d['type'] ?? ''); $id = safe_int($d['id'] ?? 0);
    if (!isset($map[$type])) { throw new RuntimeException('Rien à supprimer.'); }
    $row = suivi_row($pdo, $map[$type], $id);
    if (!$row) { throw new RuntimeException('Déjà supprimé.'); }
    $children = [];
    if ($type === 'track_site') {
        $s = $pdo->prepare('SELECT * FROM track_counts WHERE site_id=?'); $s->execute([$id]); $children['track_counts'] = $s->fetchAll(PDO::FETCH_ASSOC);
        $pdo->prepare('DELETE FROM track_counts WHERE site_id=?')->execute([$id]);
        // les observations gardent le numéro du site (AUTOINCREMENT : jamais repris) : « ↶ Annuler » les relie de nouveau
    }
    if ($type === 'animal_group') {
        $s = $pdo->prepare('SELECT * FROM animal_memberships WHERE group_id=?'); $s->execute([$id]); $children['animal_memberships'] = $s->fetchAll(PDO::FETCH_ASSOC);
        $pdo->prepare('DELETE FROM animal_memberships WHERE group_id=?')->execute([$id]);
    }
    $pdo->prepare("DELETE FROM {$map[$type]} WHERE id=?")->execute([$id]);
    $labels = ['animal_mark' => 'Marque supprimée', 'animal_obs' => 'Observation supprimée', 'animal_health' => 'Événement de santé supprimé', 'track_site' => 'Site de suivi supprimé',
        'track_count' => 'Comptage supprimé', 'animal_group' => 'Groupe supprimé', 'animal_member' => 'Ligne de l’histoire du groupe supprimée'];
    log_change($pdo, $type, $id, 'delete', $labels[$type] . ' (n°' . $id . ')', $row + ($children ? ['_children' => $children] : []));
    return ['type' => $type, 'id' => $id];
}

/** Une fiche d'animal supprimée : ses données de suivi partent ; ses observations restent, sans animal (signalées) */
function suivi_forget_pet(PDO $pdo, int $id): void
{
    try { $pdo->query('SELECT 1 FROM animal_profiles LIMIT 1'); } catch (Throwable) { return; }
    foreach (['animal_profiles', 'animal_marks', 'animal_health', 'animal_memberships', 'animal_gps', 'animal_gps_imports'] as $t) { $pdo->prepare("DELETE FROM {$t} WHERE pet_id=?")->execute([$id]); }
    $pdo->prepare('UPDATE animal_observations SET pet_id=NULL WHERE pet_id=?')->execute([$id]);
}

/**
 * Import GPS (fenêtre K13) : le navigateur lit le fichier (GPX, KML, CSV Movebank, colliers…) et envoie les points par
 * paquets de 5 000 au plus : [[t (s), lat, lon, alt?], …]. Premier paquet sans import_id : l'import est créé.
 * Un point déjà là (même animal, même instant) est sauté.
 */
function suivi_gps_import(PDO $pdo, array $d): array
{
    $pet = safe_int($d['pet_id'] ?? 0); suivi_need_pet($pdo, $pet);
    $pts = is_array($d['points'] ?? null) ? $d['points'] : [];
    if (count($pts) > 5000) { throw new RuntimeException('Trop de points d’un coup (5 000 au plus par envoi).'); }
    $imp = safe_int($d['import_id'] ?? 0);
    if ($imp) {
        $s = $pdo->prepare('SELECT pet_id FROM animal_gps_imports WHERE id=?'); $s->execute([$imp]);
        if ((int) $s->fetchColumn() !== $pet) { throw new RuntimeException('Import introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO animal_gps_imports(pet_id, filename, format) VALUES(?,?,?)')->execute([$pet, suivi_txt($d['filename'] ?? '', 200), suivi_txt($d['format'] ?? '', 40)]);
        $imp = (int) $pdo->lastInsertId();
        log_change($pdo, 'animal_gps', $imp, 'create', 'Trajet GPS importé (' . suivi_txt($d['filename'] ?? '', 120) . ')');
    }
    $ins = $pdo->prepare('INSERT OR IGNORE INTO animal_gps(pet_id, t, lat, lon, alt, import_id) VALUES(?,?,?,?,?,?)');
    $added = 0; $skipped = 0;
    foreach ($pts as $p) {
        if (!is_array($p)) { $skipped++; continue; }
        $t = safe_int($p[0] ?? 0); $la = suivi_float($p[1] ?? null, -90, 90); $lo = suivi_float($p[2] ?? null, -180, 180);
        if ($t < -2208988800 || $t > 4102444800 || $la === null || $lo === null) { $skipped++; continue; }
        $ins->execute([$pet, $t, $la, $lo, suivi_float($p[3] ?? null, -500, 10000), $imp]);
        if ($ins->rowCount()) { $added++; } else { $skipped++; }
    }
    $s = $pdo->prepare('SELECT count(*), min(t), max(t) FROM animal_gps WHERE import_id=?'); $s->execute([$imp]); [$n, $t0, $t1] = $s->fetch(PDO::FETCH_NUM);
    $pdo->prepare('UPDATE animal_gps_imports SET points=?, first_t=?, last_t=?, km=COALESCE(?, km), nights=COALESCE(?, nights) WHERE id=?')
        ->execute([(int) $n, $t0, $t1, suivi_float($d['km'] ?? null, 0, 1e7), isset($d['nights']) ? max(0, min(100000, (int) $d['nights'])) : null, $imp]);
    $pdo->prepare("INSERT OR IGNORE INTO animal_profiles(pet_id, status) VALUES(?, 'suivi')")->execute([$pet]);
    return ['import_id' => $imp, 'added' => $added, 'skipped' => $skipped, 'points' => (int) $n];
}

/** « ↶ Annuler » d'un import GPS : ses points et l'import partent */
function suivi_gps_undo(PDO $pdo, array $d): array
{
    $imp = safe_int($d['import_id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM animal_gps_imports WHERE id=?'); $s->execute([$imp]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Import introuvable.'); }
    $c = $pdo->prepare('DELETE FROM animal_gps WHERE import_id=?'); $c->execute([$imp]);
    $pdo->prepare('DELETE FROM animal_gps_imports WHERE id=?')->execute([$imp]);
    log_change($pdo, 'animal_gps', $imp, 'delete', 'Trajet GPS retiré (' . $row['filename'] . ', ' . $c->rowCount() . ' points)');
    return ['removed' => $c->rowCount()];
}

/* ───────────── menu de choix : 🐾 animaux, 🏞 sites, 👥 groupes ───────────── */

function picker_pets(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'pets')) { return ['total' => 0, 'items' => []]; }
    $hasProf = picker_table_exists($pdo, 'animal_profiles'); $hasMarks = picker_table_exists($pdo, 'animal_marks');
    $rows = $pdo->query('SELECT p.id, p.data_json, p.person_id' . ($hasProf ? ', ap.taxon' : ", '' AS taxon") . ' FROM pets p' . ($hasProf ? ' LEFT JOIN animal_profiles ap ON ap.pet_id=p.id' : '') . ' ORDER BY p.updated_at DESC, p.id DESC')->fetchAll(PDO::FETCH_ASSOC);
    $codes = [];
    if ($hasMarks) {
        foreach ($pdo->query("SELECT pet_id, code, colors_json FROM animal_marks WHERE end_iso='' AND end_date=''") as $m) {
            $c = [(string) $m['code']];
            $col = json_decode((string) $m['colors_json'], true);
            if (is_array($col)) { foreach (['L', 'R'] as $l) { foreach ([0, 1] as $i) { if (!empty($col[$l][$i]['code'])) { $c[] = (string) $col[$l][$i]['code']; } } } }
            $codes[(int) $m['pet_id']] = trim(($codes[(int) $m['pet_id']] ?? '') . ' ' . implode(' ', array_filter($c)));
        }
    }
    $facts = function_exists('pet_facts') ? pet_facts($pdo, array_column($rows, 'person_id')) : [];
    $ids = picker_ids(); $needle = picker_fold($q); $items = [];
    $icons = ['chien' => '🐕', 'chat' => '🐈', 'cheval' => '🐎', 'lapin' => '🐇', 'rongeur' => '🐹', 'oiseau' => '🐦', 'poisson' => '🐟', 'reptile' => '🐢', 'ferme' => '🐄', 'sauvage' => '🦊', 'marin' => '🐬'];
    foreach ($rows as $r) {
        $id = (int) $r['id'];
        if ($ids && !in_array($id, $ids, true)) { continue; }
        $d = function_exists('pet_overlay') ? pet_overlay(json_decode((string) $r['data_json'], true) ?: [], $facts[(int) $r['person_id']] ?? null) : (json_decode((string) $r['data_json'], true) ?: []);
        $title = function_exists('pet_title') ? pet_title($d) : (string) ($d['name'] ?? 'Animal');
        $code = $codes[$id] ?? '';
        $hay = picker_fold(implode(' ', [$title, $r['taxon'], $d['breed'] ?? '', $d['microchip'] ?? '', $d['tattoo'] ?? '', $code]));
        if (!$ids && $needle !== '' && !str_contains($hay, $needle) && !str_contains(suivi_norm($hay), suivi_norm($q))) { continue; }
        $sp = (string) ($d['species'] ?? '');
        $items[] = ['kind' => 'pet', 'id' => $id, 'title' => $title, 'meta' => implode(' · ', array_filter([trim((string) $r['taxon']) ?: (PET_SPECIES[$sp] ?? ''), $code !== '' ? '« ' . trim($code) . ' »' : '', !empty($d['deceased']) ? '†' : ''])),
            'badge' => '', 'badge_style' => '', 'group' => 'pet', 'icon' => $icons[$sp] ?? '🐾', 'short' => trim((string) $r['taxon']) ?: (PET_SPECIES[$sp] ?? ''), 'species' => $sp];
    }
    return ['total' => count($items), 'items' => array_slice($items, $offset, $limit)];
}

function picker_tsites(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'track_sites')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['s.name', 's.kind', 's.note'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT s.id, s.name, s.kind, s.since', "FROM track_sites s WHERE {$where}", 's.name COLLATE NOCASE, s.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => ['kind' => 'tsite', 'id' => (int) $r['id'], 'title' => (string) $r['name'] ?: 'Site #' . $r['id'],
        'meta' => implode(' · ', array_filter(['Site de suivi', (string) $r['kind'], $r['since'] ? 'depuis ' . $r['since'] : ''])), 'badge' => '', 'badge_style' => '', 'group' => 'tsite', 'icon' => '🏞', 'short' => (string) $r['kind']], $rows)];
}

function picker_agroups(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'animal_groups')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['g.name', 'g.kind', 'g.species', 'g.territory'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT g.id, g.name, g.kind, g.species, (SELECT count(*) FROM animal_memberships m WHERE m.group_id=g.id AND m.end_date=\'\') AS n', "FROM animal_groups g WHERE {$where}", 'g.name COLLATE NOCASE, g.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => ['kind' => 'agroup', 'id' => (int) $r['id'], 'title' => (string) $r['name'] ?: 'Groupe #' . $r['id'],
        'meta' => implode(' · ', array_filter([ucfirst((string) $r['kind']), (string) $r['species'], (int) $r['n'] . ' membre' . ((int) $r['n'] > 1 ? 's' : '')])), 'badge' => '', 'badge_style' => '', 'group' => 'agroup', 'icon' => '👥', 'short' => (string) $r['kind']], $rows)];
}
