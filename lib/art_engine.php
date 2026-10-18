<?php
declare(strict_types=1);

/**
 * 🎨 Le moteur générique des fiches « œuvres et réalisations » (interface : assets/js/heritage-artist*.js).
 * Il sert aux catalogues d'artistes et servira aux autres profils (types créés par l'utilisateur, inventions, découvertes,
 * presse, politique, sport…) : AJOUTER UN TYPE = AJOUTER UNE DÉFINITION.
 *
 * Les tables (migration n°47, lib/migrations.php) :
 *  - items          : toutes les fiches (type_key, person_id = la personne à qui elles se rattachent, parent_id pour les chaînes
 *                     album → édition, série → saison → épisode…, titre, date en texte + bornes calculées, place_id, data JSON,
 *                     ordre). Généralisation d'artist_items (les anciennes lignes y sont copiées, mêmes numéros, puis artist_items est supprimée).
 *  - item_types     : les types (clé, nom, pluriel, icône, couleur, famille, domaine, parent_type, builtin|user, version,
 *                     définition JSON). Les types intégrés sont décrits dans le navigateur ; ceux de l'utilisateur sont ici.
 *  - type_fields    : les champs d'un type de l'utilisateur (groupe, ordre, sorte, réglages JSON, visibilité par défaut
 *                     fiche/liste/vignettes/export, filtrable, source_field = « type.champ » repris d'un autre type).
 *  - type_links     : les liens permis entre types, avec leur nom dans les deux sens.
 *  - item_people    : INDEX des personnes citées dans le JSON ({"pid": 12, "role": "accordéon"} ou nom libre {"pname": "…"}),
 *                     avec rôle, zone (principale / secondaire), ordre → « Lié à » sur la fiche de la personne.
 *  - item_links     : INDEX des liens tirés du JSON vers une autre fiche {"iid"}, un lieu {"plid"}, un média {"mid"}, une
 *                     source {"sid"}, une revue {"perid"}, un événement {"evid"}, un animal {"aid"} → lisibles des deux côtés.
 *  - profiles, person_profiles : les profils (l'actuel « Artiste » est le profil « artist » ; sa fiche de profil est un item).
 *  - layout_prefs   : réglages « Champs affichés » et page de profil (global, propre à une personne) + Réglages enregistrés.
 *  - item_rows      : INDEX des lignes répétées du JSON (pistes, étapes de provenance, fontes, setlist…), une ligne par élément.
 * Les lignes répétées restent écrites dans le JSON de la fiche (data) : item_rows en est la copie, refaite à chaque enregistrement.
 *
 * Deux points d'entrée pour api.php : art_api_get() (GET action=art&op=…) et art_api_post() (POST action=art_write).
 */

/** Les types intégrés (leurs champs sont décrits côté navigateur) : clé => [nom, pluriel, icône, famille, parent_type] */
const ART_BUILTIN_TYPES = [
    'release' => ['Disque', 'Disques', '💿', 'music', 'master'], 'master' => ['Album (toutes éditions)', 'Albums', '💽', 'music', ''],
    'track_work' => ['Morceau', 'Morceaux', '🎵', 'music', ''], 'recording' => ['Enregistrement', 'Enregistrements', '🎙', 'music', 'track_work'],
    'copy' => ['Exemplaire', 'Exemplaires', '📦', 'collection', ''], 'concert' => ['Concert', 'Concerts', '📅', 'music', ''],
    'text' => ['Texte', 'Textes', '📜', 'books', ''], 'book' => ['Livre (édition)', 'Livres', '📚', 'books', 'text'],
    'work' => ['Œuvre d’art', 'Œuvres', '🖼', 'art', ''], 'exhibition' => ['Exposition', 'Expositions', '🏛', 'art', ''],
    'film' => ['Film, spectacle', 'Films et spectacles', '🎬', 'film', ''], 'org' => ['Organisation', 'Organisations', '🏷', 'autre', ''],
    'profile' => ['Profil d’artiste', 'Profils', '🎨', 'profile', ''],
];
const ART_BUILTIN_KINDS = ['release', 'master', 'track_work', 'recording', 'copy', 'concert', 'text', 'book', 'work', 'exhibition', 'film', 'org', 'profile'];
/** les clés de lien reconnues dans le JSON → sorte de la cible */
const ART_REF_KEYS = ['iid' => 'item', 'plid' => 'place', 'mid' => 'media', 'sid' => 'source', 'perid' => 'periodical', 'evid' => 'event', 'aid' => 'animal', 'empid' => 'employer'];

function art_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    // la migration n°47 a tout créé : ici seulement une lecture (pas d'écriture pendant une simple lecture : base verrouillée)
    $have = (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('items','item_types','type_fields','type_links','item_people','item_links','item_rows','profiles','person_profiles','layout_prefs')")->fetchColumn();
    if ($have < 10 || art_table_kind($pdo, 'artist_items') === 'table') { art_schema($pdo); }
    $done = true;
}

function art_table_kind(PDO $pdo, string $name): string
{
    $s = $pdo->prepare("SELECT type FROM sqlite_master WHERE name=?"); $s->execute([$name]);
    return (string) ($s->fetchColumn() ?: '');
}

/** Les tables (migration n°47) ; idempotent. L'ancienne table artist_items est recopiée dans items (mêmes numéros) puis supprimée. */
function art_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, type_key TEXT NOT NULL, person_id INTEGER NOT NULL DEFAULT 0,
        parent_id INTEGER, title TEXT NOT NULL DEFAULT '', date_text TEXT NOT NULL DEFAULT '', date_min INTEGER, date_max INTEGER, year INTEGER, place_id INTEGER,
        data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_items_person ON items(person_id, type_key)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_items_type ON items(type_key)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS item_types (key TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '', plural TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '', family TEXT NOT NULL DEFAULT '', domain TEXT NOT NULL DEFAULT '', parent_type TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL DEFAULT 'user',
        version INTEGER NOT NULL DEFAULT 1, def TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS type_fields (id INTEGER PRIMARY KEY AUTOINCREMENT, type_key TEXT NOT NULL, group_key TEXT NOT NULL DEFAULT '', group_label TEXT NOT NULL DEFAULT '',
        ord INTEGER NOT NULL DEFAULT 0, field_key TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', label TEXT NOT NULL DEFAULT '', settings TEXT NOT NULL DEFAULT '{}',
        vis_fiche INTEGER NOT NULL DEFAULT 1, vis_list INTEGER NOT NULL DEFAULT 0, vis_card INTEGER NOT NULL DEFAULT 0, vis_export INTEGER NOT NULL DEFAULT 1,
        filterable INTEGER NOT NULL DEFAULT 0, source_field TEXT NOT NULL DEFAULT '', UNIQUE(type_key, field_key))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS type_links (id INTEGER PRIMARY KEY AUTOINCREMENT, from_type TEXT NOT NULL, to_type TEXT NOT NULL, field_key TEXT NOT NULL DEFAULT '',
        name_fwd TEXT NOT NULL DEFAULT '', name_back TEXT NOT NULL DEFAULT '')");
    $pdo->exec("CREATE TABLE IF NOT EXISTS item_people (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, person_id INTEGER, name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '', zone TEXT NOT NULL DEFAULT 'main', ord INTEGER NOT NULL DEFAULT 0, field TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '{}')");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_item_people_person ON item_people(person_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_item_people_item ON item_people(item_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS item_links (id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_type TEXT NOT NULL DEFAULT 'item', to_id INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT '', precision TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}', ord INTEGER NOT NULL DEFAULT 0)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_item_links_from ON item_links(from_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_item_links_to ON item_links(to_type, to_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS item_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, field TEXT NOT NULL DEFAULT '', ord INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{}')");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_item_rows_item ON item_rows(item_id, field)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS profiles (key TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL DEFAULT 'builtin', def TEXT NOT NULL DEFAULT '{}')");
    $pdo->exec("CREATE TABLE IF NOT EXISTS person_profiles (person_id INTEGER NOT NULL, profile_key TEXT NOT NULL, item_id INTEGER, data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(person_id, profile_key))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS layout_prefs (key TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("INSERT OR IGNORE INTO profiles(key, label, icon, origin) VALUES('artist', 'Artiste', '🎨', 'builtin')");
    $ti = $pdo->prepare('INSERT OR IGNORE INTO item_types(key, label, plural, icon, family, domain, parent_type, origin) VALUES(?,?,?,?,?,?,?,\'builtin\')');
    foreach (ART_BUILTIN_TYPES as $k => [$l, $pl, $ic, $fam, $par]) { $ti->execute([$k, $l, $pl, $ic, $fam, $fam, $par]); }
    // l'ancienne table artist_items (avant la n°47) : ses fiches passent dans items (mêmes numéros), puis elle est supprimée
    if (art_table_kind($pdo, 'artist_items') === 'table') {
        $pdo->exec("INSERT OR IGNORE INTO items(id, type_key, person_id, title, year, date_text, data, sort_order, created_at, updated_at)
            SELECT id, kind, person_id, title, year, '', data, sort_order, created_at, updated_at FROM artist_items");
        $pdo->exec('DROP TABLE artist_items');
        $up = $pdo->prepare('UPDATE items SET date_text=?, date_min=?, date_max=? WHERE id=?');
        foreach ($pdo->query('SELECT id, data FROM items')->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $data = json_decode((string) $r['data'], true) ?: []; $dt = art_date_text($data); [$a, $b] = art_date_bounds($dt);
            $up->execute([$dt, $a, $b, (int) $r['id']]); art_reindex($pdo, (int) $r['id'], $data);
        }
    }
    // le profil « Artiste » des fiches déjà cochées
    $pdo->exec("INSERT OR IGNORE INTO person_profiles(person_id, profile_key) SELECT id, 'artist' FROM persons WHERE COALESCE(is_artist,0)=1");
}

/** un type permis : intégré, ou créé par l'utilisateur (clé « t_… ») */
function art_kind_ok(PDO $pdo, string $kind): bool
{
    if (in_array($kind, ART_BUILTIN_KINDS, true)) { return true; }
    if (function_exists('sciences_kind_ok') && sciences_kind_ok($kind)) { return true; } // 🔬 lib/sciences.php
    if (!preg_match('/^t_[a-z0-9_]{1,40}$/', $kind)) { return false; }
    art_ensure($pdo);
    $s = $pdo->prepare("SELECT 1 FROM item_types WHERE key=? AND origin='user'"); $s->execute([$kind]);
    return (bool) $s->fetchColumn();
}

/* ═════════ Dates : bornes calculées (années) d'une date écrite comme dans un acte ═════════ */

/** « 1958 », « mars 1958 », « vers 1784 » (± 5), « avant 1800 », « après 1900 », « entre 1880 et 1885 », « 1921 – 1938 », « 845 » */
function art_date_bounds(string $t): array
{
    $t = trim(mb_strtolower($t));
    if ($t === '') { return [null, null]; }
    preg_match_all('/(?<![\d\/.:])(\d{3,4})(?![\d.:])/', $t, $m);
    $ys = array_values(array_filter(array_map('intval', $m[1]), static fn($y) => $y >= 100 && $y <= 2100));
    if (!$ys && preg_match('/^(?:an\s+)?(\d{1,2})$/', $t, $mm)) { $ys = [(int) $mm[1]]; }
    if (!$ys) { return [null, null]; }
    $min = min($ys); $max = max($ys);
    if (count($ys) === 1) {
        if (preg_match('/\b(vers|env\.?|environ|circa|c\.)\b/u', $t)) { return [$min - 5, $min + 5]; }
        if (preg_match('/\bavant\b/u', $t)) { return [null, $min]; }
        if (preg_match('/\b(après|apres|depuis)\b/u', $t)) { return [$min, null]; }
    }
    return [$min, $max];
}

/** l'année d'une fiche (premier champ de date rempli) — aussi avant l'an 1000 */
function artist_year(array $d): ?int
{
    foreach (['year', 'date', 'released', 'written', 'dates'] as $k) {
        $v = is_scalar($d[$k] ?? null) ? trim((string) $d[$k]) : '';
        if ($v === '') { continue; }
        if (preg_match('/^(?:an\s+|vers\s+|v\.\s*|c\.\s*)?(\d{1,4})$/iu', $v, $m) && (int) $m[1] > 0 && (int) $m[1] <= 2100) { return (int) $m[1]; }
        if (preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $v, $m)) { return (int) $m[1]; }
        if (preg_match('/(?<![\d\/.:])(\d{3})(?![\d\/.:])/', $v, $m) && (int) $m[1] >= 100) { return (int) $m[1]; }
    }
    return null;
}

function art_date_text(array $d): string
{
    foreach (['date', 'released', 'written', 'dates', 'year'] as $k) { $v = is_scalar($d[$k] ?? null) ? trim((string) $d[$k]) : ''; if ($v !== '') { return mb_substr($v, 0, 120); } }
    return '';
}

/* ═════════ Les index tirés du JSON : personnes citées, liens ═════════ */

/** parcourt le JSON : {"pid"}/{"pname"} → personnes ; {"iid"}, {"plid"}, {"mid"}… → liens ; avec le champ du haut et la ligne */
function art_walk(mixed $node, string $field, array &$people, array &$links, int $depth = 0, ?array $row = null, ?int $rowIdx = null): void
{
    if (!is_array($node) || $depth > 8) { return; }
    $small = static function (?array $n): array {
        $o = [];
        foreach ($n ?? [] as $k => $v) { if (is_int($k) || in_array($k, ['pid', 'pname', 'iid', 'plid', 'mid', 'sid', 'perid', 'evid', 'aid', 'empid'], true)) { continue; } if (is_string($v) || is_int($v) || is_float($v) || is_bool($v)) { $o[$k] = is_string($v) ? mb_substr($v, 0, 200) : $v; } }
        return array_slice($o, 0, 14, true);
    };
    $isList = array_is_list($node);
    if (!$isList) {
        $role = trim((string) ($node['role'] ?? ($row['role'] ?? '')));
        $zone = isset($node['primary']) ? (!empty($node['primary']) ? 'main' : 'secondary') : (string) ($node['zone'] ?? 'main');
        if (isset($node['pid']) && is_numeric($node['pid']) && (int) $node['pid'] > 0) {
            $people[] = ['person_id' => (int) $node['pid'], 'name' => mb_substr((string) ($node['title'] ?? ''), 0, 200), 'role' => mb_substr($role, 0, 120), 'zone' => $zone === 'secondary' ? 'secondary' : 'main', 'field' => $field, 'details' => $small($node)];
        } elseif (isset($node['pname']) && trim((string) $node['pname']) !== '') {
            $people[] = ['person_id' => null, 'name' => mb_substr(trim((string) $node['pname']), 0, 200), 'role' => mb_substr($role, 0, 120), 'zone' => $zone === 'secondary' ? 'secondary' : 'main', 'field' => $field, 'details' => $small($node)];
        }
        foreach (ART_REF_KEYS as $key => $type) {
            if (isset($node[$key]) && is_numeric($node[$key]) && (int) $node[$key] > 0) {
                $data = array_merge($small($node), $row !== null && $row !== $node ? $small($row) : []);
                if ($rowIdx !== null) { $data['row'] = $rowIdx; }
                $prec = (string) ($data['rel'] ?? $data['pos'] ?? $data['page'] ?? $data['catno'] ?? '');
                $links[] = ['to_type' => $type, 'to_id' => (int) $node[$key], 'kind' => $field, 'precision' => mb_substr($prec, 0, 120), 'data' => $data];
            }
        }
    }
    foreach ($node as $k => $v) {
        if (!is_array($v)) { continue; }
        $f = $depth === 0 ? (string) $k : $field;
        if ($isList && !array_is_list($v)) { art_walk($v, $f, $people, $links, $depth + 1, $v, (int) $k); }
        else { art_walk($v, $f, $people, $links, $depth + 1, $row, $rowIdx); }
    }
}

/** refait les deux index d'une fiche */
function art_reindex(PDO $pdo, int $itemId, array $data): void
{
    $people = []; $links = [];
    art_walk($data, '', $people, $links);
    $pdo->prepare('DELETE FROM item_people WHERE item_id=?')->execute([$itemId]);
    $pdo->prepare('DELETE FROM item_links WHERE from_id=?')->execute([$itemId]);
    $ip = $pdo->prepare('INSERT INTO item_people(item_id, person_id, name, role, zone, ord, field, details) VALUES(?,?,?,?,?,?,?,?)');
    $seen = [];
    foreach (array_slice($people, 0, 2000) as $i => $p) {
        $k = ($p['person_id'] ?? 'n:' . $p['name']) . '|' . $p['role'] . '|' . $p['field']; if (isset($seen[$k])) { continue; } $seen[$k] = 1;
        $ip->execute([$itemId, $p['person_id'], $p['name'], $p['role'], $p['zone'], $i, $p['field'], json_encode($p['details'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    }
    // les lignes répétées (pistes, étapes, fontes, setlist…) : copiées dans item_rows pour les chercher et les compter en SQL
    $pdo->prepare('DELETE FROM item_rows WHERE item_id=?')->execute([$itemId]);
    $ir = $pdo->prepare('INSERT INTO item_rows(item_id, field, ord, data) VALUES(?,?,?,?)');
    foreach ($data as $field => $v) {
        if (!is_array($v) || !$v || !array_is_list($v) || !is_array($v[0] ?? null) || array_is_list($v[0]) || $field === 'photos') { continue; }
        foreach (array_slice($v, 0, 1000) as $i => $row) { if (is_array($row)) { $ir->execute([$itemId, (string) $field, $i, json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]); } }
    }
    $il = $pdo->prepare('INSERT INTO item_links(from_id, to_type, to_id, kind, precision, data, ord) VALUES(?,?,?,?,?,?,?)');
    foreach (array_slice($links, 0, 4000) as $i => $l) {
        if ($l['to_type'] === 'item' && $l['to_id'] === $itemId) { continue; }
        $il->execute([$itemId, $l['to_type'], $l['to_id'], $l['kind'], $l['precision'], json_encode($l['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $i]);
    }
}

/** refait tous les index (après une restauration, un import de base…) */
function art_reindex_all(PDO $pdo): int
{
    art_ensure($pdo);
    $n = 0;
    foreach ($pdo->query('SELECT id, data FROM items')->fetchAll() as $r) { art_reindex($pdo, (int) $r['id'], json_decode((string) $r['data'], true) ?: []); $n++; }
    return $n;
}

/* ═════════ Lire ═════════ */

function art_row(array $r): array
{
    return ['id' => (int) $r['id'], 'person_id' => (int) $r['person_id'], 'kind' => (string) $r['type_key'], 'title' => (string) $r['title'],
        'year' => $r['year'] !== null ? (int) $r['year'] : null, 'parent_id' => $r['parent_id'] !== null ? (int) $r['parent_id'] : null,
        'date_min' => $r['date_min'] !== null ? (int) $r['date_min'] : null, 'date_max' => $r['date_max'] !== null ? (int) $r['date_max'] : null,
        'data' => json_decode((string) $r['data'], true) ?: [], 'sort' => (int) $r['sort_order'], 'updated_at' => $r['updated_at'] ?? ''];
}

function art_items_for(PDO $pdo, int $personId): array
{
    art_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM items WHERE person_id=? ORDER BY type_key, sort_order, COALESCE(year, 9999), id');
    $s->execute([$personId]);
    return array_map('art_row', $s->fetchAll(PDO::FETCH_ASSOC));
}

/** le résumé d'une fiche citée (pastille) : titre, type, année, artiste, première image */
function art_summary(array $r): array
{
    $d = json_decode((string) ($r['data'] ?? '{}'), true) ?: [];
    $ph = is_array($d['photos'] ?? null) ? ($d['photos'][0] ?? null) : null;
    return ['id' => (int) $r['id'], 'person_id' => (int) $r['person_id'], 'kind' => (string) $r['type_key'], 'title' => (string) $r['title'], 'year' => $r['year'] !== null ? (int) $r['year'] : null,
        'thumb' => is_array($ph) && !empty($ph['f']) ? 'media/' . rawurlencode((string) $ph['f']) : '', 'person' => (string) ($r['pname'] ?? ''), 'sub' => art_subline($d, (string) $r['type_key'])];
}

function art_subline(array $d, string $kind): string
{
    $pick = static fn(array $keys) => implode(' · ', array_values(array_filter(array_map(static fn($k) => is_scalar($d[$k] ?? null) ? trim((string) $d[$k]) : '', $keys))));
    if (function_exists('sciences_subline') && ($sci = sciences_subline($d, $kind)) !== null) { return mb_substr($sci, 0, 160); } // 🔬
    return mb_substr(match ($kind) {
        'release' => $pick(['format', 'catno']), 'work' => $pick(['catref', 'technique']), 'recording' => $pick(['rkind', 'date', 'dur']),
        'book' => $pick(['isbn']), 'film' => $pick(['jobs', 'role']), 'exhibition' => $pick(['venue', 'dates']), default => $pick(['date', 'note']),
    }, 0, 160);
}

function art_person_name_sql(): string { return "TRIM(COALESCE(p.first_name,'') || ' ' || UPPER(COALESCE(p.last_name,'')))"; }

/** les liens entre fiches d'un lot, dans les deux sens, avec le résumé de l'autre fiche */
function art_links_of(PDO $pdo, array $ids): array
{
    art_ensure($pdo);
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', $chunk);
        $sql = 'SELECT l.id AS lid, l.from_id, l.to_id, l.kind AS lkind, l.precision, l.data AS ldata, i.id, i.person_id, i.type_key, i.title, i.year, i.data, ' . art_person_name_sql() . " AS pname
            FROM item_links l JOIN items i ON i.id = CASE WHEN l.from_id IN ({$in}) THEN l.to_id ELSE l.from_id END
            LEFT JOIN persons p ON p.id=i.person_id WHERE l.to_type='item' AND (l.from_id IN ({$in}) OR l.to_id IN ({$in})) ORDER BY l.from_id, l.ord, l.id";
        foreach ($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $out[(int) $r['lid']] = ['id' => (int) $r['lid'], 'from' => (int) $r['from_id'], 'to' => (int) $r['to_id'], 'type' => (string) $r['lkind'], 'precision' => (string) $r['precision'],
                'data' => json_decode((string) $r['ldata'], true) ?: [], 'other' => art_summary($r)];
        }
    }
    return array_values($out);
}

/** les personnes citées par un lot de fiches (nom, sexe pour les pastilles ; les noms libres aussi) */
function art_people_of(PDO $pdo, array $ids): array
{
    art_ensure($pdo);
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $rows = $pdo->query('SELECT a.item_id, a.person_id, a.name AS fname, a.role, a.zone, a.field, p.gender, ' . art_person_name_sql() . ' AS pname
        FROM item_people a LEFT JOIN persons p ON p.id=a.person_id WHERE a.item_id IN (' . implode(',', $ids) . ') ORDER BY a.item_id, a.ord')->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static fn($r) => ['item_id' => (int) $r['item_id'], 'person_id' => $r['person_id'] !== null ? (int) $r['person_id'] : 0, 'role' => (string) $r['role'], 'zone' => (string) $r['zone'],
        'field' => (string) $r['field'], 'name' => $r['person_id'] !== null && trim((string) $r['pname']) !== '' ? (string) $r['pname'] : (string) $r['fname'], 'gender' => (string) ($r['gender'] ?? 'unknown')], $rows);
}

/** « Lié à » sur la fiche d'une personne : les fiches qui la citent (crédits, propriétaire, dédicace…) */
function art_person_cited(PDO $pdo, int $personId): array
{
    if ($personId <= 0) { return []; }
    try { art_ensure($pdo); } catch (Throwable $e) { return []; }
    $s = $pdo->prepare('SELECT a.role, a.field, i.id, i.person_id, i.type_key, i.title, i.year, i.data, ' . art_person_name_sql() . ' AS pname
        FROM item_people a JOIN items i ON i.id=a.item_id LEFT JOIN persons p ON p.id=i.person_id WHERE a.person_id=? ORDER BY COALESCE(i.year, 9999), i.title LIMIT 500');
    $s->execute([$personId]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $k = (int) $r['id'];
        if (!isset($out[$k])) { $out[$k] = art_summary($r) + ['roles' => [], 'fields' => []]; }
        if ($r['role'] !== '' && !in_array($r['role'], $out[$k]['roles'], true)) { $out[$k]['roles'][] = (string) $r['role']; }
        if (!in_array($r['field'], $out[$k]['fields'], true)) { $out[$k]['fields'][] = (string) $r['field']; }
    }
    return array_values($out);
}

/** les types créés par l'utilisateur (définition JSON + champs de type_fields) */
function art_types_all(PDO $pdo): array
{
    art_ensure($pdo);
    $f = $pdo->query('SELECT * FROM type_fields ORDER BY type_key, ord, id')->fetchAll(PDO::FETCH_ASSOC);
    $byType = [];
    foreach ($f as $r) { $byType[$r['type_key']][] = $r; }
    return array_map(static function ($r) use ($byType) {
        $def = json_decode((string) $r['def'], true) ?: [];
        $def += ['label' => $r['label'], 'many' => $r['plural'], 'icon' => $r['icon'], 'color' => $r['color'], 'domain' => $r['domain'] ?: $r['family'], 'parent_type' => $r['parent_type']];
        if (!empty($byType[$r['key']])) { // les champs de type_fields, rangés en groupes
            $groups = [];
            foreach ($byType[$r['key']] as $x) {
                $g = (string) $x['group_key'] ?: 'main';
                if (!isset($groups[$g])) { $groups[$g] = ['key' => $g, 'label' => (string) $x['group_label'] ?: (string) $r['label'], 'zone' => 'main', 'fields' => []]; }
                $set = json_decode((string) $x['settings'], true) ?: [];
                $groups[$g]['fields'][] = $set + ['key' => (string) $x['field_key'], 'type' => (string) $x['kind'], 'label' => (string) $x['label'], 'star' => (bool) $x['vis_fiche'],
                    'inList' => (bool) $x['vis_list'], 'inCard' => (bool) $x['vis_card'], 'inExport' => (bool) $x['vis_export'], 'filterable' => (bool) $x['filterable'], 'source' => (string) $x['source_field']];
            }
            foreach ($def['groups'] ?? [] as $g0) { if (isset($groups[$g0['key'] ?? ''])) { $groups[$g0['key']] = array_merge($g0, ['fields' => $groups[$g0['key']]['fields']]); } }
            $def['groups'] = array_values($groups);
        }
        return ['key' => (string) $r['key'], 'label' => (string) $r['label'], 'def' => $def];
    }, $pdo->query("SELECT * FROM item_types WHERE origin='user' ORDER BY label COLLATE NOCASE")->fetchAll(PDO::FETCH_ASSOC));
}

function art_setting(PDO $pdo, string $key): ?array
{
    art_ensure($pdo);
    $s = $pdo->prepare('SELECT data FROM layout_prefs WHERE key=?'); $s->execute([$key]);
    $v = $s->fetchColumn();
    return $v === false ? null : (json_decode((string) $v, true) ?: []);
}

/** tout ce qu'il faut pour ouvrir le catalogue d'une personne */
function art_boot(PDO $pdo, int $personId): array
{
    art_ensure($pdo);
    $p = $pdo->prepare('SELECT id, first_name, last_name, gender, is_artist, artist_discipline FROM persons WHERE id=?'); $p->execute([$personId]);
    $person = $p->fetch(PDO::FETCH_ASSOC);
    if (!$person) { throw new RuntimeException('Fiche introuvable.'); }
    $pp = $pdo->prepare('SELECT profile_key, item_id FROM person_profiles WHERE person_id=? ORDER BY sort_order, profile_key'); $pp->execute([$personId]);
    $person['profiles'] = $pp->fetchAll(PDO::FETCH_ASSOC);
    // naissance et décès (année, lieu) pour l'en-tête de la page de l'artiste
    $ev = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.year, e.date_text, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','DEAT') ORDER BY e.id");
    try { $ev->execute([$personId]); foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) { $k = $e['tag'] === 'BIRT' ? 'birth' : 'death'; if (!isset($person[$k])) { $person[$k] = ['year' => $e['year'] !== null ? (int) $e['year'] : null, 'date' => (string) ($e['date_text'] ?? ''), 'place' => (string) ($e['place'] ?? '')]; } } } catch (Throwable $e) {}
    try { $ph = $pdo->prepare("SELECT m.filename FROM media_links l JOIN media m ON m.id=l.media_id WHERE l.entity_type='person' AND l.entity_id=? AND m.media_type='image' AND COALESCE(m.is_person_photo,0)=1 ORDER BY l.position LIMIT 1"); $ph->execute([$personId]); $person['photo'] = (string) ($ph->fetchColumn() ?: ''); } catch (Throwable $e) { $person['photo'] = ''; }
    $items = art_items_for($pdo, $personId);
    $ids = array_column($items, 'id');
    return ['person' => $person, 'items' => $items, 'links' => art_links_of($pdo, $ids), 'people' => art_people_of($pdo, $ids), 'types' => art_types_all($pdo),
        'settings' => ['global' => art_setting($pdo, 'global'), 'person' => art_setting($pdo, 'person:' . $personId), 'presets' => art_setting($pdo, 'presets') ?? []],
        'cited' => art_person_cited($pdo, $personId)];
}

function art_item(PDO $pdo, int $id): array
{
    art_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM items WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Cette fiche n’existe plus.'); }
    return ['item' => art_row($r), 'links' => art_links_of($pdo, [$id]), 'people' => art_people_of($pdo, [$id])];
}

/** plusieurs fiches avec leurs liens (livre du catalogue raisonné : chaque notice suit sa fiche) */
function art_items_by_ids(PDO $pdo, array $ids): array
{
    art_ensure($pdo);
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids)))), 0, 3000);
    if (!$ids) { return ['items' => [], 'links' => [], 'people' => []]; }
    $rows = $pdo->query('SELECT * FROM items WHERE id IN (' . implode(',', $ids) . ')')->fetchAll(PDO::FETCH_ASSOC);
    return ['items' => array_map('art_row', $rows), 'links' => art_links_of($pdo, $ids), 'people' => art_people_of($pdo, $ids)];
}

/* ═════════ Écrire ═════════ */

/** une fiche : type, personne (cochée « Artiste » — ou on la coche si demandé), données JSON ; index refaits */
function art_save_item(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $personId = safe_int($d['person_id'] ?? 0);
    $p = $pdo->prepare('SELECT COALESCE(is_artist,0) FROM persons WHERE id=?'); $p->execute([$personId]); $isArtist = $p->fetchColumn();
    if ($isArtist === false) { throw new RuntimeException('Personne introuvable.'); }
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $personId); }
    $kind = (string) ($d['kind'] ?? ''); if (!art_kind_ok($pdo, $kind)) { throw new RuntimeException('Sorte de fiche inconnue.'); }
    $sciOwn = function_exists('sciences_before_save') && sciences_before_save($pdo, $personId, $kind, $d); // 🔬 profil inventeur / scientifique / explorateur
    if (!$sciOwn && !(int) $isArtist) {
        if (empty($d['make_artist'])) { throw new RuntimeException('Cette fiche n’est pas cochée « Artiste » : coche « Artiste » sur la fiche (Modifier la fiche) avant d’y ranger un élément du catalogue.'); }
        art_make_artist($pdo, $personId, (string) ($d['discipline'] ?? ''));
    }
    $data = artist_clean(is_array($d['data'] ?? null) ? $d['data'] : []);
    $data = is_array($data) ? $data : [];
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen((string) $json) > 3_000_000) { throw new RuntimeException('Élément trop volumineux.'); }
    $title = mb_substr(trim(safe_text($data['title'] ?? '')), 0, 500); if ($title === '') { $title = 'Sans titre'; }
    $year = artist_year($data); $dt = art_date_text($data); [$dmin, $dmax] = art_date_bounds($dt);
    $parent = safe_int($d['parent_id'] ?? 0) ?: null;
    $placeId = null;
    foreach (['place', 'location', 'wplace', 'studio', 'venue_place'] as $k) { if (is_array($data[$k] ?? null) && (int) ($data[$k]['plid'] ?? 0) > 0) { $placeId = (int) $data[$k]['plid']; break; } }
    $id = safe_int($d['id'] ?? 0);
    if (!$id && $kind === 'profile') { // une seule fiche de profil d'artiste par personne
        $pf = $pdo->prepare("SELECT id FROM items WHERE person_id=? AND type_key='profile' ORDER BY id LIMIT 1"); $pf->execute([$personId]); $id = (int) $pf->fetchColumn();
    }
    if ($id) {
        $u = $pdo->prepare('UPDATE items SET title=?, year=?, date_text=?, date_min=?, date_max=?, parent_id=?, place_id=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND person_id=? AND type_key=?');
        $u->execute([$title, $year, $dt, $dmin, $dmax, $parent, $placeId, $json, $id, $personId, $kind]);
        if (!$u->rowCount()) { throw new RuntimeException('Élément introuvable : il a peut-être été supprimé ou rangé chez un autre artiste.'); }
    } else {
        $n = $pdo->prepare('SELECT COALESCE(MAX(sort_order),0)+1 FROM items WHERE person_id=? AND type_key=?'); $n->execute([$personId, $kind]);
        $pdo->prepare('INSERT INTO items(type_key, person_id, parent_id, title, date_text, date_min, date_max, year, place_id, data, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$kind, $personId, $parent, $title, $dt, $dmin, $dmax, $year, $placeId, $json, (int) $n->fetchColumn()]);
        $id = (int) $pdo->lastInsertId();
    }
    art_reindex($pdo, $id, $data);
    if (function_exists('sciences_after_save')) { sciences_after_save($pdo, $personId, $kind, $id); } // 🔬
    if ($kind === 'profile') { $pdo->prepare("INSERT INTO person_profiles(person_id, profile_key, item_id) VALUES(?, 'artist', ?) ON CONFLICT(person_id, profile_key) DO UPDATE SET item_id=excluded.item_id")->execute([$personId, $id]); }
    return ['id' => $id];
}

/** plusieurs fiches d'un coup (import d'une discographie, d'une filmographie…) */
function art_save_items(PDO $pdo, array $d): array
{
    $ids = [];
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        foreach (array_slice(is_array($d['items'] ?? null) ? $d['items'] : [], 0, 500) as $it) {
            if (!is_array($it)) { continue; }
            $ids[] = art_save_item($pdo, ['person_id' => $d['person_id'] ?? 0, 'kind' => $it['kind'] ?? '', 'data' => $it['data'] ?? [], 'id' => $it['id'] ?? 0, 'parent_id' => $it['parent_id'] ?? 0, 'make_artist' => $d['make_artist'] ?? 0])['id'];
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    return ['ids' => $ids];
}

/** supprime une fiche ; renvoie la ligne entière pour « ↶ Annuler » (art_restore_item). Les liens vers elle restent dans
 *  l'index des autres fiches : ils reviennent avec elle. */
function art_delete_item(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $id = safe_int($d['id'] ?? 0);
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $pid); }
    $s = $pdo->prepare('SELECT * FROM items WHERE id=? AND person_id=?'); $s->execute([$id, $pid]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Élément introuvable : il a peut-être déjà été supprimé.'); }
    $pdo->prepare('DELETE FROM items WHERE id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM item_people WHERE item_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM item_links WHERE from_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM item_rows WHERE item_id=?')->execute([$id]);
    return ['ok' => true, 'item' => art_row($row) + ['date_text' => (string) $row['date_text'], 'place_id' => $row['place_id']]];
}

function art_reorder_items(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $pid = safe_int($d['person_id'] ?? 0);
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $pid); }
    $ids = array_map('safe_int', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 2000));
    if (!$ids) { return ['ok' => true]; }
    $c = $pdo->prepare('SELECT count(*) FROM items WHERE person_id=? AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'); $c->execute([$pid, ...$ids]);
    if ((int) $c->fetchColumn() !== count(array_unique($ids))) { throw new RuntimeException('Rangement impossible : un des éléments n’existe plus (recharge le catalogue).'); }
    $s = $pdo->prepare('UPDATE items SET sort_order=? WHERE id=? AND person_id=?');
    foreach ($ids as $i => $id) { $s->execute([$i + 1, $id, $pid]); }
    return ['ok' => true];
}

/** remettre une fiche supprimée (« ↶ Annuler ») : même numéro, mêmes liens */
function art_restore_item(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $it = is_array($d['item'] ?? null) ? $d['item'] : [];
    $id = safe_int($it['id'] ?? 0); $pid = safe_int($it['person_id'] ?? 0); $kind = (string) ($it['kind'] ?? '');
    if ($id <= 0 || $pid <= 0 || !art_kind_ok($pdo, $kind)) { throw new RuntimeException('Rien à remettre.'); }
    $e = $pdo->prepare('SELECT 1 FROM items WHERE id=?'); $e->execute([$id]);
    if ($e->fetchColumn()) { return ['id' => $id, 'already' => true]; }
    $p = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $p->execute([$pid]);
    if (!$p->fetchColumn()) { throw new RuntimeException('La fiche de la personne n’existe plus : impossible de remettre cet élément.'); }
    $data = artist_clean(is_array($it['data'] ?? null) ? $it['data'] : []); $data = is_array($data) ? $data : [];
    $dt = art_date_text($data); [$dmin, $dmax] = art_date_bounds($dt);
    $pdo->prepare('INSERT INTO items(id, type_key, person_id, parent_id, title, date_text, date_min, date_max, year, place_id, data, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id, $kind, $pid,
        safe_int($it['parent_id'] ?? 0) ?: null, mb_substr((string) ($it['title'] ?? ''), 0, 500) ?: 'Sans titre', $dt, $dmin, $dmax, artist_year($data), safe_int($it['place_id'] ?? 0) ?: null,
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), safe_int($it['sort'] ?? 0)]);
    art_reindex($pdo, $id, $data);
    return ['id' => $id];
}

/** cocher « Artiste » sur une fiche (proposé quand on range un premier élément) ; le profil « artist » suit */
function art_make_artist(PDO $pdo, int $personId, string $discipline = ''): array
{
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $personId); }
    $u = $pdo->prepare("UPDATE persons SET is_artist=1, artist_discipline=CASE WHEN COALESCE(artist_discipline,'')='' THEN ? ELSE artist_discipline END WHERE id=?");
    $u->execute([mb_substr($discipline, 0, 40), $personId]);
    if (!$u->rowCount()) { throw new RuntimeException('Fiche introuvable.'); }
    $pdo->prepare("INSERT OR IGNORE INTO person_profiles(person_id, profile_key) VALUES(?, 'artist')")->execute([$personId]);
    return ['ok' => true];
}

/** cocher / décocher un profil sur une fiche (artiste, politique, sportif…) ; le profil « artist » suit aussi persons.is_artist */
function art_set_profile(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $key = (string) ($d['profile'] ?? '');
    if (!preg_match('/^[a-z][a-z0-9_]{1,40}$/', $key)) { throw new RuntimeException('Profil inconnu.'); }
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $pid); }
    $e = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $e->execute([$pid]); if (!$e->fetchColumn()) { throw new RuntimeException('Fiche introuvable.'); }
    $pdo->prepare('INSERT OR IGNORE INTO profiles(key, label, icon, origin) VALUES(?,?,?,?)')->execute([$key, mb_substr((string) ($d['label'] ?? $key), 0, 80), mb_substr((string) ($d['icon'] ?? ''), 0, 16), 'builtin']);
    if (!empty($d['on'])) { $pdo->prepare('INSERT OR IGNORE INTO person_profiles(person_id, profile_key) VALUES(?,?)')->execute([$pid, $key]); }
    else { $pdo->prepare('DELETE FROM person_profiles WHERE person_id=? AND profile_key=?')->execute([$pid, $key]); }
    if ($key === 'artist') { $pdo->prepare('UPDATE persons SET is_artist=? WHERE id=?')->execute([!empty($d['on']) ? 1 : 0, $pid]); }
    return ['ok' => true];
}

/** un type créé par l'utilisateur : item_types + ses champs dans type_fields (+ liens permis dans type_links) */
function art_save_type(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $label = mb_substr(trim((string) ($d['label'] ?? '')), 0, 80);
    if ($label === '') { throw new RuntimeException('Donne un nom à cette sorte de fiche.'); }
    $key = (string) ($d['key'] ?? '');
    if ($key === '') {
        $base = trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower((string) (iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $label) ?: 'sorte'))), '_') ?: 'sorte';
        $key = 't_' . substr($base, 0, 30); $n = 2;
        $s = $pdo->prepare('SELECT 1 FROM item_types WHERE key=?');
        while (true) { $s->execute([$key]); if (!$s->fetchColumn()) { break; } $key = 't_' . substr($base, 0, 30) . '_' . $n++; }
    } elseif (!preg_match('/^t_[a-z0-9_]{1,40}$/', $key)) { throw new RuntimeException('Sorte inconnue.'); }
    $def = artist_clean(is_array($d['def'] ?? null) ? $d['def'] : []); $def = is_array($def) ? $def : [];
    $groups = is_array($def['groups'] ?? null) ? $def['groups'] : [];
    $meta = $def; $meta['groups'] = array_map(static fn($g) => array_diff_key(is_array($g) ? $g : [], ['fields' => 1]), $groups);
    $json = json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen((string) $json) > 400_000) { throw new RuntimeException('Cette sorte a trop de réglages.'); }
    $s = static fn($k, $max = 80) => mb_substr(trim((string) ($def[$k] ?? '')), 0, $max);
    $pdo->prepare("INSERT INTO item_types(key, label, plural, icon, color, family, domain, parent_type, origin, def) VALUES(?,?,?,?,?,?,?,?, 'user', ?)
        ON CONFLICT(key) DO UPDATE SET label=excluded.label, plural=excluded.plural, icon=excluded.icon, color=excluded.color, family=excluded.family, domain=excluded.domain,
        parent_type=excluded.parent_type, def=excluded.def, version=version+1, updated_at=CURRENT_TIMESTAMP")
        ->execute([$key, $label, $s('many') ?: $label . 's', $s('icon', 16) ?: '✦', $s('color', 20), $s('family', 40) ?: $s('domain', 40), $s('domain', 40), $s('parent_type', 44), $json]);
    $pdo->prepare('DELETE FROM type_fields WHERE type_key=?')->execute([$key]);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO type_fields(type_key, group_key, group_label, ord, field_key, kind, label, settings, vis_fiche, vis_list, vis_card, vis_export, filterable, source_field) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $ord = 0;
    foreach ($groups as $g) {
        if (!is_array($g)) { continue; }
        foreach (is_array($g['fields'] ?? null) ? $g['fields'] : [] as $f) {
            if (!is_array($f) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,39}$/', (string) ($f['key'] ?? ''))) { continue; }
            $set = array_diff_key($f, array_flip(['key', 'type', 'label', 'star', 'inList', 'inCard', 'inExport', 'filterable', 'source']));
            $ins->execute([$key, mb_substr((string) ($g['key'] ?? 'main'), 0, 40), mb_substr((string) ($g['label'] ?? ''), 0, 80), $ord++, (string) $f['key'], mb_substr((string) ($f['type'] ?? 'text'), 0, 20),
                mb_substr((string) ($f['label'] ?? ''), 0, 120), json_encode($set, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), !empty($f['star']) ? 1 : 0, !empty($f['inList']) ? 1 : 0, !empty($f['inCard']) ? 1 : 0,
                ($f['inExport'] ?? true) ? 1 : 0, !empty($f['filterable']) ? 1 : 0, mb_substr((string) ($f['source'] ?? ''), 0, 90)]);
            if (($f['type'] ?? '') === 'item') {
                foreach (is_array($f['kinds'] ?? null) ? $f['kinds'] : [] as $to) { $pdo->prepare('INSERT INTO type_links(from_type, to_type, field_key, name_fwd, name_back) VALUES(?,?,?,?,?)')->execute([$key, (string) $to, (string) $f['key'], mb_substr((string) ($f['label'] ?? ''), 0, 80), mb_substr((string) ($f['back'] ?? ''), 0, 80)]); }
            }
        }
    }
    return ['key' => $key];
}

function art_delete_type(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $key = (string) ($d['key'] ?? '');
    $c = $pdo->prepare('SELECT count(*) FROM items WHERE type_key=?'); $c->execute([$key]);
    if ((int) $c->fetchColumn() > 0) { throw new RuntimeException('Des fiches de cette sorte existent encore : supprime-les d’abord.'); }
    $s = $pdo->prepare("DELETE FROM item_types WHERE key=? AND origin='user'"); $s->execute([$key]);
    if (!$s->rowCount()) { throw new RuntimeException('Sorte introuvable.'); }
    $pdo->prepare('DELETE FROM type_fields WHERE type_key=?')->execute([$key]);
    $pdo->prepare('DELETE FROM type_links WHERE from_type=?')->execute([$key]);
    return ['ok' => true];
}

/** réglages : « global », « person:12 » (propre à une personne), « presets » (Réglages enregistrés sous un nom) */
function art_save_settings(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    $key = (string) ($d['key'] ?? '');
    if (!preg_match('/^(global|presets|person:\d{1,10})$/', $key)) { throw new RuntimeException('Réglage inconnu.'); }
    if (($d['data'] ?? null) === null) { $pdo->prepare('DELETE FROM layout_prefs WHERE key=?')->execute([$key]); return ['ok' => true, 'deleted' => true]; }
    $data = artist_clean(is_array($d['data']) ? $d['data'] : []);
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen((string) $json) > 1_500_000) { throw new RuntimeException('Réglages trop volumineux.'); }
    $pdo->prepare('INSERT INTO layout_prefs(key, data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated_at=CURRENT_TIMESTAMP')->execute([$key, $json]);
    return ['ok' => true];
}

/** fusion de deux fiches de personnes : les pastilles (JSON), les fiches, le profil et les réglages passent sur la fiche gardée */
function art_merge_person(PDO $pdo, int $source, int $target): void
{
    try { art_ensure($pdo); } catch (Throwable $e) { return; }
    $s = $pdo->prepare('SELECT DISTINCT item_id FROM item_people WHERE person_id=?'); $s->execute([$source]);
    $fix = static function (mixed $n) use (&$fix, $source, $target): mixed {
        if (!is_array($n)) { return $n; }
        foreach ($n as $k => $v) { if ($k === 'pid' && (int) $v === $source) { $n[$k] = $target; } elseif (is_array($v)) { $n[$k] = $fix($v); } }
        return $n;
    };
    $get = $pdo->prepare('SELECT data FROM items WHERE id=?'); $put = $pdo->prepare('UPDATE items SET data=? WHERE id=?');
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $get->execute([(int) $id]); $data = $fix(json_decode((string) $get->fetchColumn(), true) ?: []);
        $put->execute([json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (int) $id]);
        art_reindex($pdo, (int) $id, $data);
    }
    $pdo->prepare('UPDATE items SET person_id=? WHERE person_id=?')->execute([$target, $source]);
    $pdo->prepare('UPDATE OR IGNORE person_profiles SET person_id=? WHERE person_id=?')->execute([$target, $source]);
    $pdo->prepare('DELETE FROM person_profiles WHERE person_id=?')->execute([$source]);
    $pdo->prepare('UPDATE OR IGNORE layout_prefs SET key=? WHERE key=?')->execute(['person:' . $target, 'person:' . $source]);
}

/* ═════════ Le menu de choix (lib/picker.php, sorte « artwork ») ═════════ */

/** les fiches : titre, type, année ; options art_kind (« release,master ») et art_person (la personne) */
function picker_art_items(PDO $pdo, string $q, int $offset, int $limit, array $opts = []): array
{
    art_ensure($pdo);
    $where = ['1=1']; $params = [];
    $kinds = array_values(array_filter(explode(',', (string) ($opts['art_kind'] ?? '')), static fn($k) => (bool) preg_match('/^[a-z0-9_]{1,44}$/', $k)));
    if ($kinds) { $where[] = 'i.type_key IN (' . implode(',', array_fill(0, count($kinds), '?')) . ')'; array_push($params, ...$kinds); }
    else { $where[] = "i.type_key<>'profile' AND substr(i.type_key, 1, 8)<>'profile_'"; }
    if (!empty($opts['art_person'])) { $where[] = 'i.person_id=?'; $params[] = (int) $opts['art_person']; }
    $ids = function_exists('picker_ids') ? picker_ids() : [];
    if ($ids) { $where[] = 'i.id IN (' . implode(',', array_map('intval', $ids)) . ')'; }
    elseif ($q !== '') {
        if (preg_match('/^#(\d+)$/', $q, $m)) { $where[] = 'i.id=?'; $params[] = (int) $m[1]; }
        else { foreach (array_slice(preg_split('/\s+/u', $q) ?: [], 0, 6) as $w) { $where[] = '(i.title LIKE ? OR i.data LIKE ? OR CAST(i.year AS TEXT)=?)'; $params[] = '%' . $w . '%'; $params[] = '%' . $w . '%'; $params[] = $w; } }
    }
    $w = implode(' AND ', $where);
    $c = $pdo->prepare("SELECT count(*) FROM items i WHERE {$w}"); $c->execute($params); $total = (int) $c->fetchColumn();
    $s = $pdo->prepare('SELECT i.*, t.label AS tlabel, t.icon AS ticon, ' . art_person_name_sql() . " AS pname FROM items i LEFT JOIN item_types t ON t.key=i.type_key LEFT JOIN persons p ON p.id=i.person_id WHERE {$w}
        ORDER BY CASE WHEN i.title LIKE ? THEN 0 ELSE 1 END, i.title COLLATE NOCASE, i.id LIMIT " . (int) $limit . ' OFFSET ' . (int) $offset);
    $s->execute([...$params, $q . '%']);
    $items = array_map(static function ($r) {
        $sum = art_summary($r); $lab = (string) ($r['tlabel'] ?? '') ?: 'Fiche';
        return ['kind' => 'artwork', 'id' => (int) $r['id'], 'title' => (string) $r['title'], 'art_kind' => (string) $r['type_key'],
            'meta' => implode(' · ', array_filter([$lab, $sum['year'] ? (string) $sum['year'] : '', $sum['sub'], (string) ($r['pname'] ?? '')])),
            'badge' => $lab, 'badge_style' => '', 'group' => 'artwork', 'icon' => (string) ($r['ticon'] ?? '') ?: '✦', 'thumb' => $sum['thumb'], 'short' => $sum['year'] ? (string) $sum['year'] : ''];
    }, $s->fetchAll(PDO::FETCH_ASSOC));
    return ['total' => $total, 'items' => $items];
}

/* ═════════ Points d'entrée (api.php) ═════════ */

function art_api_get(PDO $pdo, array $g): array
{
    return match ((string) ($g['op'] ?? '')) {
        'boot' => art_boot($pdo, safe_int($g['person_id'] ?? 0)),
        'item' => art_item($pdo, safe_int($g['id'] ?? 0)),
        'items' => art_items_by_ids($pdo, explode(',', (string) ($g['ids'] ?? ''))),
        'cited' => ['items' => art_person_cited($pdo, safe_int($g['person_id'] ?? 0))],
        'types' => ['types' => art_types_all($pdo)],
        default => throw new RuntimeException('Demande inconnue.'),
    };
}

function art_api_post(PDO $pdo, array $d): array
{
    art_ensure($pdo);
    return match ((string) ($d['op'] ?? '')) {
        'save_item' => art_save_item($pdo, $d),
        'save_items' => art_save_items($pdo, $d),
        'delete_item' => art_delete_item($pdo, $d),
        'restore_item' => art_restore_item($pdo, $d),
        'reorder' => art_reorder_items($pdo, $d),
        'make_artist' => art_make_artist($pdo, safe_int($d['person_id'] ?? 0), (string) ($d['discipline'] ?? '')),
        'set_profile' => art_set_profile($pdo, $d),
        'save_type' => art_save_type($pdo, $d),
        'delete_type' => art_delete_type($pdo, $d),
        'save_settings' => art_save_settings($pdo, $d),
        'reindex' => ['count' => art_reindex_all($pdo)],
        default => throw new RuntimeException('Demande inconnue.'),
    };
}
