<?php
declare(strict_types=1);

/**
 * 🔍 Menu de choix unique (assets/js/app-picker.js, docs/PICKER.md) : une seule recherche pour choisir
 * une personne, un lieu, une source, un média, une enquête, une battue, une étiquette, une maison, une revue,
 * un employeur ou un recensement — ou plusieurs sortes à la fois (recherche mélangée).
 *
 * GET api.php?action=picker_search&kind=person|place|…|person,place&q=…&offset=0&limit=30&animals=1
 * → {groups:[{kind,key,label,total,items:[…]}], more, next_offset}
 *
 * Toutes les requêtes sont préparées ; q n'est jamais collé dans le SQL.
 */

const PICKER_KINDS = ['person', 'place', 'source', 'media', 'investigation', 'battue', 'label', 'house', 'periodical', 'employer', 'census'];
const PICKER_LABELS = [
    'person' => '👤 Personnes', 'place' => '📍 Lieux', 'source' => '📚 Sources', 'media' => '🖼 Médias',
    'investigation' => '🔍 Enquêtes', 'battue' => '🧭 Battues', 'label' => '🏷 Étiquettes', 'house' => '🏠 Maisons',
    'periodical' => '📰 Revues', 'employer' => '🏭 Employeurs', 'census' => '📋 Recensements',
];
// pays tapés en abrégé après un nom de lieu (« springfield usa »)
const PICKER_COUNTRY_ALIASES = [
    'usa' => 'US', 'us' => 'US', 'eu' => 'US', 'etats unis' => 'US', 'amerique' => 'US', 'uk' => 'GB', 'gb' => 'GB',
    'angleterre' => 'GB', 'ecosse' => 'GB', 'pays de galles' => 'GB', 'grande bretagne' => 'GB', 'hollande' => 'NL',
    'rfa' => 'DE', 'urss' => 'RU', 'russie' => 'RU',
];

/** Texte replié pour comparer sans accents ni tirets : « Saint-Martin-la-Méanne » → « saint martin la meanne ». */
function picker_fold(?string $value): string
{
    static $cache = [];
    $value = (string) $value;
    if ($value === '') { return ''; }
    if (isset($cache[$value])) { return $cache[$value]; }
    if (count($cache) > 50000) { $cache = []; }
    $fold = function_exists('world_search_key') ? world_search_key($value)
        : trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(function_exists('ascii_fold') ? ascii_fold($value) : $value)));
    return $cache[$value] = $fold;
}

/** Fonction SQL picker_fold(x), branchée une fois sur la connexion. */
function picker_register(PDO $pdo): void
{
    static $done = null;
    if ($done === $pdo) { return; }
    $pdo->sqliteCreateFunction('picker_fold', static fn($v): string => picker_fold($v === null ? '' : (string) $v), 1, defined('PDO::SQLITE_DETERMINISTIC') ? PDO::SQLITE_DETERMINISTIC : 0);
    $done = $pdo;
}

function picker_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (!array_key_exists($table, $cache)) {
        $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
        $s->execute([$table]);
        $cache[$table] = (bool) $s->fetchColumn();
    }
    return $cache[$table];
}

/** « %…% » pour LIKE, avec % et _ tapés pris à la lettre (ESCAPE '\'). */
function picker_like(string $q, bool $start = false): string
{
    $q = strtr($q, ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']);
    return ($start ? '' : '%') . $q . '%';
}

/** Motif LIKE large pour un texte replié : les lettres qui peuvent porter un accent deviennent « _ », les espaces « % ». */
function picker_loose_like(string $folded): string
{
    $p = str_replace(['oe', 'ae'], ' ', $folded);
    $p = (string) preg_replace('/[aeiouycn]/', '_', $p);
    $p = (string) preg_replace('/\s+/', '%', $p);
    return '%' . $p . '%';
}

function picker_plural(int $n, string $one, ?string $many = null): string
{
    return $n . ' ' . ($n > 1 ? ($many ?? $one . 's') : $one);
}

function picker_number(int $n): string
{
    return number_format($n, 0, ',', "\u{202F}");
}

/** Point d'entrée : une sorte (avec ses groupes) ou plusieurs (un groupe par sorte, avec le nombre trouvé). */
function picker_search(PDO $pdo, array $get): array
{
    picker_register($pdo);
    $kinds = array_values(array_unique(array_filter(array_map('trim', explode(',', strtolower((string) ($get['kind'] ?? 'person')))),
        static fn(string $k): bool => in_array($k, PICKER_KINDS, true))));
    if (!$kinds) { $kinds = ['person']; }
    $q = trim((string) preg_replace('/\s+/u', ' ', mb_substr((string) ($get['q'] ?? ''), 0, 120)));
    $offset = max(0, (int) ($get['offset'] ?? 0));
    $limit = max(1, min(100, (int) ($get['limit'] ?? 30)));
    $opts = ['animals' => (string) ($get['animals'] ?? '1') !== '0', 'mixed' => count($kinds) > 1,
        'person_id' => max(0, (int) ($get['person_id'] ?? 0)), 'media_type' => in_array($get['media_type'] ?? '', ['image', 'audio', 'video', 'document'], true) ? $get['media_type'] : '',
        // fenêtre « Choisir une image » (openMediaPicker) : sortes permises, une sorte, portraits, récentes, transcription / signature
        'media_types' => array_values(array_intersect(explode(',', strtolower((string) ($get['media_types'] ?? ''))), ['image', 'audio', 'video', 'document'])),
        'media_sort' => in_array($get['media_sort'] ?? '', ['photo', 'document', 'audio', 'video'], true) ? $get['media_sort'] : '',
        'portraits' => (string) ($get['portraits'] ?? '') === '1', 'recent' => (string) ($get['recent'] ?? '') === '1',
        'recent_ids' => array_slice(array_map('intval', explode(',', (string) ($get['recent_ids'] ?? ''))), 0, 60),
        'media_flag' => in_array($get['media_flag'] ?? '', ['notr', 'tr', 'sig'], true) ? $get['media_flag'] : '',
        'with_text' => (string) ($get['with_text'] ?? '') === '1']; // avec la transcription (relecture d'un média choisi)
    // near=lat,lon : les lieux les plus proches d'un point cliqué sur la carte
    if (in_array('place', $kinds, true) && preg_match('/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/', (string) ($get['near'] ?? ''), $m)) {
        return ['groups' => picker_places_near($pdo, (float) $m[1], (float) $m[2], min($limit, 30)), 'more' => false, 'next_offset' => 0];
    }
    // ids=3,7 : relire des fiches déjà choisies (pickerSet avec de simples numéros)
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', (string) ($get['ids'] ?? ''))), static fn(int $i): bool => $i > 0))), 0, 100);
    if ($ids) {
        picker_ids($ids);
        $out = [];
        foreach ($kinds as $kind) { foreach (picker_kind($pdo, $kind, '', 0, 100, $opts)['groups'] as $g) { $out[] = $g; } }
        picker_ids([]);
        return ['groups' => $out, 'more' => false, 'next_offset' => 0];
    }

    if (count($kinds) === 1) {
        $r = picker_kind($pdo, $kinds[0], $q, $offset, $limit, $opts);
        $out = ['groups' => $r['groups'], 'more' => $r['more'], 'next_offset' => $offset + $limit];
        // counts=1 (médias) : le nombre trouvé pour chaque filtre de la fenêtre « Choisir une image »
        if ($kinds[0] === 'media' && (string) ($get['counts'] ?? '') === '1') {
            try { $out['counts'] = picker_media_counts($pdo, $q, $opts); } catch (Throwable $e) { error_log('[picker] media counts : ' . $e->getMessage()); }
        }
        return $out;
    }
    // recherche mélangée : la même tranche dans chaque sorte
    $groups = [];
    $more = false;
    foreach ($kinds as $kind) {
        $r = picker_kind($pdo, $kind, $q, $offset, $limit, $opts);
        $more = $more || $r['more'];
        $items = [];
        $total = 0;
        foreach ($r['groups'] as $g) { $items = [...$items, ...$g['items']]; $total += (int) ($g['total'] ?? 0); }
        $groups[] = ['kind' => $kind, 'key' => $kind, 'label' => PICKER_LABELS[$kind], 'total' => $total, 'items' => $items];
    }
    return ['groups' => $groups, 'more' => $more, 'next_offset' => $offset + $limit];
}

/** Numéros demandés (ids=…) pendant une relecture ; vide sinon. */
function picker_ids(?array $set = null): array
{
    static $ids = [];
    if ($set !== null) { $ids = array_map('intval', $set); }
    return $ids;
}

/** Une sorte : ['groups' => [...], 'more' => bool]. Une table absente (ancienne base) donne une liste vide. */
function picker_kind(PDO $pdo, string $kind, string $q, int $offset, int $limit, array $opts): array
{
    $empty = ['groups' => [['kind' => $kind, 'key' => $kind, 'label' => PICKER_LABELS[$kind] ?? $kind, 'total' => 0, 'items' => []]], 'more' => false];
    try {
        if ($kind === 'place') { return picker_places($pdo, $q, $offset, $limit, $opts); }
        $r = match ($kind) {
            'person' => picker_persons($pdo, $q, $offset, $limit, $opts),
            'source' => picker_sources($pdo, $q, $offset, $limit),
            'media' => picker_media($pdo, $q, $offset, $limit, $opts),
            'investigation' => picker_investigations($pdo, $q, $offset, $limit),
            'battue' => picker_battues($pdo, $q, $offset, $limit),
            'label' => picker_labels($pdo, $q, $offset, $limit),
            'house' => picker_houses($pdo, $q, $offset, $limit),
            'periodical' => picker_periodicals($pdo, $q, $offset, $limit),
            'employer' => picker_employers($pdo, $q, $offset, $limit),
            'census' => picker_census($pdo, $q, $offset, $limit),
        };
        return ['groups' => [['kind' => $kind, 'key' => $kind, 'label' => PICKER_LABELS[$kind], 'total' => $r['total'], 'items' => $r['items']]],
            'more' => $offset + $limit < $r['total']];
    } catch (Throwable $e) {
        error_log('[picker] ' . $kind . ' : ' . $e->getMessage());
        return $empty;
    }
}

/** Compte puis lit une tranche : $from = « FROM … WHERE … », $params liés aux deux requêtes. */
function picker_page(PDO $pdo, string $select, string $from, string $order, array $params, int $offset, int $limit): array
{
    $c = $pdo->prepare($sql = 'SELECT count(*) ' . $from);
    $c->execute(picker_params($sql, $params));
    $total = (int) $c->fetchColumn();
    if ($total <= $offset) { return [$total, []]; }
    $s = $pdo->prepare($sql = $select . ' ' . $from . ' ORDER BY ' . $order . ' LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset);
    $s->execute(picker_params($sql, $params));
    return [$total, $s->fetchAll(PDO::FETCH_ASSOC)];
}

/** Seulement les paramètres nommés présents dans la requête (SQLite refuse les autres). */
function picker_params(string $sql, array $params): array
{
    return array_filter($params, static fn($k): bool => (bool) preg_match('/' . preg_quote((string) $k, '/') . '(?![A-Za-z0-9_])/', $sql), ARRAY_FILTER_USE_KEY);
}

/** Condition « le texte contient q » sur plusieurs colonnes, avec ou sans accents. */
function picker_text_where(array $columns, string $q, array &$params, string $prefix = 'q'): string
{
    if ($ids = picker_ids()) { return strtok($columns[0], '.') . '.id IN (' . implode(',', $ids) . ')'; } // entiers déjà vérifiés
    if ($q === '') { return '1'; }
    $params[":{$prefix}l"] = picker_like($q);
    $params[":{$prefix}f"] = '%' . picker_fold($q) . '%';
    $parts = [];
    foreach ($columns as $col) {
        $parts[] = "COALESCE({$col},'') LIKE :{$prefix}l ESCAPE '\\' COLLATE NOCASE";
        $parts[] = "picker_fold({$col}) LIKE :{$prefix}f";
    }
    return '(' . implode(' OR ', $parts) . ')';
}

// ─── 👤 Personnes ───────────────────────────────────────────────────────────

function picker_persons(PDO $pdo, string $q, int $offset, int $limit, array $opts): array
{
    $params = [];
    $where = [];
    if (!$opts['animals']) { $where[] = "COALESCE(p.kind,'human')<>'animal'"; }
    $birth = "(SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1)";
    $death = "(SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1)";
    // « #45 » : la fiche n° 45
    if ($ids = picker_ids()) {
        $where[] = 'p.id IN (' . implode(',', $ids) . ')';
        $q = '';
    } elseif (preg_match('/^#\s*(\d+)$/', $q, $m)) {
        $where[] = 'p.id = :pid';
        $params[':pid'] = (int) $m[1];
        $q = '';
    } elseif ($q === '') {
        return ['total' => 0, 'items' => []];
    }
    $tokens = array_slice(preg_split('/\s+/u', $q, -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, 6);
    $hasVariants = picker_table_exists($pdo, 'name_variants');
    foreach ($tokens as $i => $token) {
        $k = ":t{$i}";
        $f = ":f{$i}";
        $params[$k] = picker_like($token);
        $params[$f] = '%' . picker_fold($token) . '%';
        $variant = $hasVariants ? " OR EXISTS(SELECT 1 FROM name_variants nv WHERE nv.person_id=p.id AND (nv.first_name LIKE {$k} ESCAPE '\\' COLLATE NOCASE OR nv.middle_name LIKE {$k} ESCAPE '\\' COLLATE NOCASE OR nv.last_name LIKE {$k} ESCAPE '\\' COLLATE NOCASE OR picker_fold(COALESCE(nv.first_name,'')||' '||COALESCE(nv.last_name,'')) LIKE {$f}))" : '';
        $where[] = "(p.first_name LIKE {$k} ESCAPE '\\' COLLATE NOCASE OR p.middle_name LIKE {$k} ESCAPE '\\' COLLATE NOCASE OR p.last_name LIKE {$k} ESCAPE '\\' COLLATE NOCASE"
            . " OR picker_fold(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,'')) LIKE {$f}"
            . " OR EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND e.place_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','DEAT') AND picker_fold((SELECT pl.name FROM places pl WHERE pl.id=e.place_id)) LIKE {$f})"
            . $variant . ')';
    }
    $start = '';
    if ($q !== '') {
        $params[':st'] = picker_like($q, true);
        $start = "CASE WHEN p.last_name LIKE :st ESCAPE '\\' COLLATE NOCASE THEN 0 WHEN p.first_name LIKE :st ESCAPE '\\' COLLATE NOCASE OR trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) LIKE :st ESCAPE '\\' COLLATE NOCASE THEN 1 ELSE 2 END, ";
    }
    $from = 'FROM persons p' . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
    $select = "SELECT p.id, p.first_name, p.middle_name, p.last_name, p.gender, COALESCE(p.kind,'human') AS kind,
        (SELECT COALESCE(NULLIF(m.thumbnail,''), m.filename) FROM media m WHERE m.id=p.portrait_media_id AND m.media_type='image') AS portrait,
        {$birth} AS birth_id, {$death} AS death_id";
    [$total, $rows] = picker_page($pdo, $select, $from, $start . 'p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE, p.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => picker_person_items($pdo, $rows)];
}

/** Lignes de persons → items (naissance, décès, indice pour les homonymes). Sert aussi pour relire une valeur. */
function picker_person_items(PDO $pdo, array $rows): array
{
    if (!$rows) { return []; }
    $eventIds = array_values(array_filter(array_merge(array_column($rows, 'birth_id'), array_column($rows, 'death_id'))));
    $events = [];
    if ($eventIds) {
        $s = $pdo->prepare('SELECT e.id, e.date_text, e.year, pl.name AS place FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id IN (' . implode(',', array_fill(0, count($eventIds), '?')) . ')');
        $s->execute(array_map('intval', $eventIds));
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) { $events[(int) $e['id']] = $e; }
    }
    // homonymes : même prénom et même nom ailleurs dans la base
    $keys = [];
    foreach ($rows as $r) { $keys[mb_strtolower(trim((string) $r['first_name']) . '|' . trim((string) $r['last_name']))] = true; }
    $dupes = [];
    $s = $pdo->prepare("SELECT lower(trim(COALESCE(first_name,''))||'|'||trim(COALESCE(last_name,''))) AS k, count(*) AS n FROM persons
        WHERE lower(trim(COALESCE(first_name,''))||'|'||trim(COALESCE(last_name,''))) IN (" . implode(',', array_fill(0, count($keys), '?')) . ') GROUP BY k HAVING n > 1');
    $s->execute(array_keys($keys));
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $d) { $dupes[$d['k']] = true; }
    $items = [];
    foreach ($rows as $r) {
        $id = (int) $r['id'];
        $first = trim(((string) $r['first_name']) . ' ' . ((string) ($r['middle_name'] ?? '')));
        $last = trim((string) $r['last_name']);
        $title = trim($first . ' ' . mb_strtoupper($last)) ?: 'Personne sans nom';
        $b = $events[(int) $r['birth_id']] ?? null;
        $d = $events[(int) $r['death_id']] ?? null;
        $meta = [];
        if ($b && (trim((string) $b['date_text']) !== '' || trim((string) $b['place']) !== '')) { $meta[] = trim('° ' . trim((string) $b['date_text']) . ' ' . trim((string) $b['place'])); }
        if ($d && (trim((string) $d['date_text']) !== '' || trim((string) $d['place']) !== '')) { $meta[] = trim('† ' . trim((string) $d['date_text']) . ' ' . trim((string) $d['place'])); }
        $gender = in_array($r['gender'], ['male', 'female'], true) ? $r['gender'] : 'unknown';
        $key = mb_strtolower(trim((string) $r['first_name']) . '|' . $last);
        if (isset($dupes[$key]) && ($hint = picker_person_hint($pdo, $id, $gender)) !== '') { $meta[] = $hint; }
        $by = $b['year'] ?? null;
        $dy = $d['year'] ?? null;
        $short = $by && $dy ? $by . ' – ' . $dy : ($by ? (string) $by : ($dy ? '† ' . $dy : ''));
        $animal = ($r['kind'] ?? 'human') === 'animal';
        $initials = $animal ? '🐾' : (mb_strtoupper(mb_substr(trim((string) $r['first_name']), 0, 1) . mb_substr($last, 0, 1)) ?: '?');
        $items[] = [
            'kind' => $animal ? 'animal' : 'person', 'id' => $id, 'title' => $title, 'meta' => implode(' · ', $meta),
            'badge' => '', 'badge_style' => '', 'group' => 'person', 'initials' => $initials, 'gender' => $gender,
            'thumb' => $r['portrait'] ? 'media/' . rawurlencode((string) $r['portrait']) : '', 'short' => $short,
        ];
    }
    return $items;
}

/** « fils de Jean », « fille de Pierre MARTIN », « épouse de Pierre PEYRE ». */
function picker_person_hint(PDO $pdo, int $id, string $gender): string
{
    $name = static fn(array $p, bool $full): string => trim(((string) $p['first_name']) . ($full ? ' ' . mb_strtoupper((string) $p['last_name']) : ''));
    $s = $pdo->prepare('SELECT a.first_name, a.last_name, a.gender FROM family_children fc JOIN families f ON f.id=fc.family_id
        JOIN persons a ON a.id IN (f.partner1_id, f.partner2_id) WHERE fc.child_id=? ORDER BY CASE a.gender WHEN \'male\' THEN 0 ELSE 1 END LIMIT 1');
    $s->execute([$id]);
    if ($p = $s->fetch(PDO::FETCH_ASSOC)) {
        return ($gender === 'male' ? 'fils de ' : ($gender === 'female' ? 'fille de ' : 'enfant de ')) . $name($p, false);
    }
    $s = $pdo->prepare('SELECT a.first_name, a.last_name FROM families f JOIN persons a ON a.id = CASE WHEN f.partner1_id=? THEN f.partner2_id ELSE f.partner1_id END
        WHERE (f.partner1_id=? OR f.partner2_id=?) ORDER BY f.id LIMIT 1');
    $s->execute([$id, $id, $id]);
    if ($p = $s->fetch(PDO::FETCH_ASSOC)) {
        return ($gender === 'female' ? 'épouse de ' : ($gender === 'male' ? 'époux de ' : 'conjoint de ')) . $name($p, true);
    }
    return '#' . $id;
}

// ─── 📍 Lieux : « Dans ta généalogie », « Communes de France », « Villes du monde » ───

/** Dans ta base = lieu saisi ou adopté, ou commune utilisée (événement, recensement) ; une commune livrée avec l'app n'y entre qu'une fois utilisée. */
function picker_place_used_sql(PDO $pdo, string $a = 'pl'): string
{
    $census = picker_table_exists($pdo, 'census_records') ? " OR EXISTS(SELECT 1 FROM census_records c WHERE c.place_id={$a}.id)" : '';
    return "({$a}.geoname_id IS NULL OR NOT ({$a}.country='France' OR COALESCE({$a}.admin2_code,'')<>'' OR COALESCE({$a}.admin4_code,'')<>'') OR EXISTS(SELECT 1 FROM events e WHERE e.place_id={$a}.id){$census})";
}

/**
 * Communes livrées pas encore utilisées : la référence contient aussi des hameaux qui portent le nom de la commune
 * (13 « Tulle ») — une seule ligne par nom et par commune, et rien de ce qui est déjà « dans ta base ».
 */
function picker_place_fr_sql(PDO $pdo, string $where): array
{
    $usedU = picker_place_used_sql($pdo, 'u');
    $from = "FROM places pl WHERE {$where} AND NOT " . picker_place_used_sql($pdo) . "
        AND NOT EXISTS(SELECT 1 FROM places u WHERE u.name = pl.name COLLATE NOCASE AND u.id <> pl.id AND COALESCE(u.admin4_code,'') = COALESCE(pl.admin4_code,'') AND COALESCE(pl.admin4_code,'') <> '' AND {$usedU})
        GROUP BY lower(pl.name), CASE WHEN COALESCE(pl.admin4_code,'') <> '' THEN pl.admin4_code ELSE pl.id END";
    return [$from, 'max(COALESCE(pl.population,0))'];
}

/** Filtres tapés après le nom (« 32 », « gers », « occitanie », « usa ») : conditions SQL sur places. */
function picker_place_filters(array $words, array &$params, array $codes): string
{
    $out = [];
    foreach ($words as $i => $w) {
        $f = ":pf{$i}";
        $params[$f] = $w . '%';
        $params[$f . 'w'] = '% ' . $w . '%';
        $parts = [];
        foreach (['pl.county', 'pl.state', 'pl.country', 'pl.subdivision'] as $col) {
            $parts[] = "picker_fold({$col}) LIKE {$f}";
            $parts[] = "picker_fold({$col}) LIKE {$f}w";
        }
        if (preg_match('/^(\d{1,3}|2a|2b)$/', $w)) {
            $params[$f . 'd'] = strlen($w) === 1 ? '0' . $w : strtoupper($w);
            $parts[] = "pl.admin2_code = {$f}d";
        }
        if (!empty($codes[$w])) {
            $names = $codes[$w];
            foreach ($names as $j => $n) { $params[$f . 'c' . $j] = $n; }
            $parts[] = 'pl.country IN (' . implode(',', array_map(static fn($j) => $f . 'c' . $j, array_keys($names))) . ') COLLATE NOCASE';
        }
        $out[] = '(' . implode(' OR ', $parts) . ')';
    }
    return $out ? ' AND ' . implode(' AND ', $out) : '';
}

/** Pays de la référence mondiale : code => nom français (vide si elle manque). */
function picker_world_countries(): array
{
    static $list = null;
    if ($list !== null) { return $list; }
    $list = [];
    $world = function_exists('world_reference') ? world_reference() : null;
    if ($world) {
        try { foreach ($world->query('SELECT code, name FROM countries') as $r) { $list[(string) $r['code']] = (string) $r['name']; } } catch (Throwable) {}
    }
    return $list;
}

/** Mot tapé → pays possibles (codes ISO) : « usa », « us », « allemagne », « royaume »… */
function picker_country_codes(string $word): array
{
    $codes = [];
    if (isset(PICKER_COUNTRY_ALIASES[$word])) { $codes[] = PICKER_COUNTRY_ALIASES[$word]; }
    foreach (picker_world_countries() as $code => $name) {
        $fold = picker_fold($name);
        if (strtolower($code) === $word || ($word !== '' && strlen($word) >= 3 && (str_starts_with($fold, $word) || str_contains($fold, ' ' . $word)))) { $codes[] = $code; }
    }
    return array_values(array_unique($codes));
}

function picker_places(PDO $pdo, string $q, int $offset, int $limit, array $opts): array
{
    $mixed = !empty($opts['mixed']);
    $folded = picker_fold($q);
    $groups = [
        'base' => ['kind' => 'place', 'key' => 'base', 'label' => 'Dans ta généalogie', 'total' => 0, 'items' => []],
        'fr' => ['kind' => 'place', 'key' => 'fr', 'label' => 'Communes de France (pas encore dans ta base)', 'total' => 0, 'items' => []],
        'world' => ['kind' => 'place', 'key' => 'world', 'label' => 'Villes du monde', 'total' => null, 'items' => []],
    ];
    if ($ids = picker_ids()) {
        $census = picker_table_exists($pdo, 'census_records') ? '+(SELECT count(*) FROM census_records c WHERE c.place_id=pl.id)' : '';
        $rows = $pdo->query('SELECT pl.*, ((SELECT count(*) FROM events e WHERE e.place_id=pl.id)' . $census . ') AS n_events FROM places pl WHERE pl.id IN (' . implode(',', $ids) . ')')->fetchAll(PDO::FETCH_ASSOC);
        $groups['base']['items'] = array_map(static fn($r) => picker_place_item($r, 'base'), $rows);
        $groups['base']['total'] = count($rows);
        return ['groups' => [$groups['base']], 'more' => false];
    }
    if (mb_strlen($folded) < 1) { return ['groups' => $mixed ? [$groups['base']] : array_values($groups), 'more' => false]; }
    $words = explode(' ', $folded);
    // découpage nom / précisions : « saint martin 32 » → nom « saint martin », filtre « 32 » ; on garde le premier qui trouve
    $chosen = null;
    $first = null;
    for ($k = count($words); $k >= 1; $k--) {
        $name = implode(' ', array_slice($words, 0, $k));
        if ($k < count($words) && mb_strlen($name) < 2) { break; }
        $split = picker_place_split($pdo, $name, array_slice($words, $k), $mixed);
        $first ??= $split;
        if ($split['base'] + $split['fr'] + $split['world'] > 0) { $chosen = $split; break; }
    }
    $chosen ??= $first;
    $groups['base']['total'] = $chosen['base'];
    $groups['fr']['total'] = $chosen['fr'];
    $groups['world']['total'] = $chosen['world_rows'] !== null ? count($chosen['world_rows']) : null;
    // une seule pagination sur les trois groupes mis bout à bout
    $pos = $offset;
    $left = $limit;
    foreach (['base', 'fr', 'world'] as $seg) {
        if ($mixed && $seg !== 'base') { break; }
        if ($left <= 0) { break; }
        if ($seg === 'world' && $chosen['world_rows'] === null) { $chosen['world_rows'] = picker_world_rows($pdo, $chosen['name'], $chosen['rest']); $groups['world']['total'] = count($chosen['world_rows']); }
        $total = (int) $groups[$seg]['total'];
        if ($pos >= $total) { $pos -= $total; continue; }
        $take = min($left, $total - $pos);
        $groups[$seg]['items'] = $seg === 'world'
            ? array_map('picker_world_item', array_slice($chosen['world_rows'], $pos, $take))
            : picker_place_rows($pdo, $chosen, $seg, $pos, $take);
        $left -= $take;
        $pos = 0;
    }
    $all = (int) $groups['base']['total'] + ($mixed ? 0 : (int) $groups['fr']['total']);
    $more = $offset + $limit < $all;
    if (!$mixed && !$more) {
        if ($chosen['world_rows'] === null) { $chosen['world_rows'] = picker_world_rows($pdo, $chosen['name'], $chosen['rest']); $groups['world']['total'] = count($chosen['world_rows']); }
        $more = $offset + $limit < $all + count($chosen['world_rows']);
    }
    picker_place_dedupe_titles($groups);
    return ['groups' => $mixed ? [$groups['base']] : array_values($groups), 'more' => $more];
}

/** Compte les lieux de la base et les communes pour un découpage donné (les villes du monde sont lues plus tard, au besoin). */
function picker_place_split(PDO $pdo, string $name, array $rest, bool $mixed): array
{
    $codes = [];
    foreach ($rest as $w) {
        $names = [];
        foreach (picker_country_codes($w) as $code) { $names[] = picker_world_countries()[$code] ?? ''; }
        $codes[$w] = array_values(array_filter($names));
    }
    $params = [':nf' => '%' . $name . '%', ':pre' => picker_loose_like($name)];
    // tri grossier et rapide (LIKE natif) avant la comparaison exacte sans accents
    $where = "((pl.name LIKE :pre AND picker_fold(pl.name) LIKE :nf) OR (pl.alternate_names LIKE :pre AND picker_fold(pl.alternate_names) LIKE :nf))";
    $where .= picker_place_filters($rest, $params, $codes);
    $used = picker_place_used_sql($pdo);
    $count = function (string $cond) use ($pdo, $where, $params): int {
        $s = $pdo->prepare($sql = "SELECT count(*) FROM places pl WHERE {$where} AND {$cond}");
        $s->execute(picker_params($sql, $params));
        return (int) $s->fetchColumn();
    };
    $base = $count($used);
    $fr = 0;
    if (!$mixed) {
        [$frFrom] = picker_place_fr_sql($pdo, $where);
        $s = $pdo->prepare($sql = "SELECT count(*) FROM (SELECT 1 {$frFrom})");
        $s->execute(picker_params($sql, $params));
        $fr = (int) $s->fetchColumn();
    }
    $split = ['name' => $name, 'rest' => $rest, 'where' => $where, 'params' => $params, 'used' => $used, 'base' => $base, 'fr' => $fr, 'world' => 0, 'world_rows' => null];
    if (!$mixed && $base + $fr === 0) {
        $split['world_rows'] = picker_world_rows($pdo, $name, $rest);
        $split['world'] = count($split['world_rows']);
    }
    return $split;
}

function picker_place_rows(PDO $pdo, array $split, string $seg, int $offset, int $limit): array
{
    $params = $split['params'] + [':nx' => $split['name'], ':np' => $split['name'] . '%', ':nw' => '% ' . $split['name'] . '%'];
    $census = picker_table_exists($pdo, 'census_records') ? '+(SELECT count(*) FROM census_records c WHERE c.place_id=pl.id)' : '';
    // pour les communes : max(population) choisit la ligne la plus peuplée de chaque groupe (colonnes « nues » de SQLite)
    [$from, $pop] = $seg === 'base' ? ["FROM places pl WHERE {$split['where']} AND {$split['used']}", 'COALESCE(pl.population,0)'] : picker_place_fr_sql($pdo, $split['where']);
    $sql = "SELECT pl.id, pl.name, pl.county, pl.state, pl.country, pl.subdivision, pl.admin2_code, pl.admin4_code, pl.latitude, pl.longitude, {$pop} AS population, pl.alternate_names, pl.geoname_id,
        ((SELECT count(*) FROM events e WHERE e.place_id=pl.id){$census}) AS n_events,
        CASE WHEN picker_fold(pl.name)=:nx THEN 0 WHEN picker_fold(pl.name) LIKE :np THEN 1 WHEN picker_fold(pl.name) LIKE :nw THEN 2 WHEN picker_fold(pl.name) LIKE :nf THEN 3 ELSE 4 END AS rank
        {$from}
        ORDER BY rank, " . ($seg === 'base' ? 'n_events DESC, ' : '') . "population DESC, pl.name COLLATE NOCASE, pl.id LIMIT " . (int) $limit . ' OFFSET ' . (int) $offset;
    $s = $pdo->prepare($sql);
    $s->execute(picker_params($sql, $params));
    return array_map(static fn(array $r): array => picker_place_item($r, $seg, $split['name']), $s->fetchAll(PDO::FETCH_ASSOC));
}

/** Ligne de places → item. */
function picker_place_item(array $r, string $group, string $typed = ''): array
{
    $dept = trim((string) $r['county']);
    $num = trim((string) ($r['admin2_code'] ?? ''));
    $country = trim((string) $r['country']);
    $meta = [];
    if ($dept !== '') { $meta[] = $dept . ($num !== '' && $country === 'France' ? " ({$num})" : ''); }
    if (trim((string) $r['state']) !== '') { $meta[] = trim((string) $r['state']); }
    if ($country !== '' && !($group === 'fr' && $country === 'France')) { $meta[] = $country; } // « Communes de France » : pas besoin de le redire
    if ($group !== 'base' && (int) ($r['population'] ?? 0) > 0) { $meta[] = picker_number((int) $r['population']) . ' hab.'; }
    if (($old = picker_old_name((string) $r['name'], (string) ($r['alternate_names'] ?? ''), $typed)) !== '') { $meta[] = 'anc. « ' . $old . ' »'; }
    $n = (int) ($r['n_events'] ?? 0);
    $state = trim((string) $r['state']);
    $short = $dept !== '' ? $dept . ($num !== '' && $country === 'France' ? " ({$num})" : '') : implode(', ', array_filter([$state, $country !== 'France' ? $country : '']));
    return [
        'kind' => 'place', 'id' => (int) $r['id'], 'title' => (string) $r['name'], 'name' => (string) $r['name'], 'meta' => implode(' · ', $meta),
        'badge' => $group === 'base' ? ($n ? picker_plural($n, 'événement') : '') : 'Commune', 'badge_style' => $group === 'base' ? 'blue' : '',
        'group' => $group, 'icon' => '📍', 'short' => $short, 'county' => $dept, 'state_name' => $state, 'dept_code' => $country === 'France' ? $num : '',
        'dept' => $country === 'France' ? $num : '', 'country' => $country, 'insee' => $country === 'France' ? trim((string) ($r['admin4_code'] ?? '')) : '',
        'lat' => isset($r['latitude']) && $r['latitude'] !== null && $r['latitude'] !== '' ? (float) $r['latitude'] : null,
        'lon' => isset($r['longitude']) && $r['longitude'] !== null && $r['longitude'] !== '' ? (float) $r['longitude'] : null,
        'place_name' => implode(', ', array_filter([trim((string) $r['name']), $dept, $country], static fn($v) => $v !== '')),
    ] + (isset($r['distance_km']) ? ['distance_km' => round((float) $r['distance_km'], 1)] : []);
}

/** Autre nom du lieu, montré seulement quand c'est grâce à lui qu'on l'a trouvé (« Saint-Martial » tapé → anc. « Saint-Martial ») :
 *  une simple forme courte du nom n'apprend rien et encombrait la ligne. */
function picker_old_name(string $name, string $alternates, string $typed): string
{
    if (trim($alternates) === '' || $typed === '') { return ''; }
    $nameFold = picker_fold($name);
    if (str_contains($nameFold, $typed)) { return ''; }
    foreach (array_slice(explode(',', $alternates), 0, 40) as $alt) {
        $alt = trim($alt);
        if ($alt === '' || !preg_match('/^[\p{Latin}\s\'’\-.]+$/u', $alt)) { continue; }
        $fold = picker_fold($alt);
        if ($fold !== '' && $fold !== $nameFold && str_contains($fold, $typed)) { return $alt; }
    }
    return '';
}

/** Homonymes dans la même liste : « Saint-Martin (Gers) ». */
function picker_place_dedupe_titles(array &$groups): void
{
    $seen = [];
    foreach ($groups as $g) { foreach ($g['items'] as $it) { $k = mb_strtolower($it['title']); $seen[$k] = ($seen[$k] ?? 0) + 1; } }
    foreach ($groups as &$g) {
        foreach ($g['items'] as &$it) {
            $paren = $it['county'] ?? '' ?: ($it['state_name'] ?? '');
            if (($seen[mb_strtolower($it['title'])] ?? 0) > 1 && $paren !== '') { $it['title'] .= ' (' . $paren . ')'; }
        }
        unset($it);
    }
    unset($g);
}

/** Villes du monde (hors France, déjà livrée) qui commencent par le nom, filtrées par pays ou région ; 300 au plus. */
function picker_world_rows(PDO $pdo, string $name, array $rest): array
{
    $world = function_exists('world_reference') ? world_reference() : null;
    if (!$world || mb_strlen($name) < 2) { return []; }
    $where = "w.search_key >= ? AND w.search_key < ? AND w.country_code <> 'FR'";
    $params = [$name, $name . '~'];
    foreach ($rest as $w) {
        $codes = picker_country_codes($w);
        $part = ['lower(w.state) LIKE ?', 'lower(w.state) LIKE ?'];
        $params[] = $w . '%';
        $params[] = '% ' . $w . '%';
        if ($codes) { $part[] = 'w.country_code IN (' . implode(',', array_fill(0, count($codes), '?')) . ')'; array_push($params, ...$codes); }
        $where .= ' AND (' . implode(' OR ', $part) . ')';
    }
    try {
        $s = $world->prepare("SELECT w.geoname_id, w.name, w.search_key, w.state, w.country_code, w.population, w.latitude, w.longitude, c.name AS country
            FROM world_places w JOIN countries c ON c.code = w.country_code WHERE {$where}
            ORDER BY CASE WHEN w.search_key = ? THEN 0 ELSE 1 END, w.population DESC LIMIT 300");
        $s->execute([...$params, $name]);
        $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[picker] villes du monde : ' . $e->getMessage());
        return [];
    }
    // déjà entrées dans la base : elles sont dans le premier groupe
    $ids = array_map(static fn($r) => (int) $r['geoname_id'], $rows);
    $known = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $k = $pdo->prepare('SELECT geoname_id FROM places WHERE geoname_id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
        $k->execute($chunk);
        foreach ($k->fetchAll(PDO::FETCH_COLUMN) as $g) { $known[(int) $g] = true; }
    }
    return array_values(array_filter($rows, static fn($r) => !isset($known[(int) $r['geoname_id']])));
}

function picker_world_item(array $r): array
{
    $meta = array_values(array_filter([trim((string) $r['state']), trim((string) $r['country'])]));
    if ((int) $r['population'] > 0) { $meta[] = picker_number((int) $r['population']) . ' hab.'; }
    return [
        'kind' => 'place', 'id' => null, 'ref' => (int) $r['geoname_id'], 'title' => (string) $r['name'], 'name' => (string) $r['name'], 'meta' => implode(' · ', $meta),
        'badge' => (string) $r['country'], 'badge_style' => '', 'group' => 'world', 'icon' => '📍',
        'short' => trim((string) $r['state']) !== '' ? trim((string) $r['state']) . ', ' . $r['country'] : (string) $r['country'],
        'county' => '', 'state_name' => trim((string) $r['state']), 'dept' => '', 'insee' => '', 'country' => (string) $r['country'],
        'lat' => isset($r['latitude']) ? (float) $r['latitude'] : null, 'lon' => isset($r['longitude']) ? (float) $r['longitude'] : null,
        'place_name' => implode(', ', array_filter([(string) $r['name'], trim((string) $r['state']), (string) $r['country']], static fn($v) => $v !== '')),
    ];
}

/** Lieux les plus proches d'un point (« 🗺 Choisir sur la carte ») : ceux de ta base, puis les communes livrées. */
function picker_places_near(PDO $pdo, float $lat, float $lon, int $limit): array
{
    $groups = [];
    $cos = max(0.05, cos(deg2rad($lat)));
    foreach (['base' => 'Dans ta généalogie', 'fr' => 'Communes (pas encore dans ta base)'] as $seg => $label) {
        $items = [];
        foreach ([0.15, 0.5, 2.0] as $box) { // on élargit la zone tant qu'on ne trouve rien
            $used = picker_place_used_sql($pdo);
            $census = picker_table_exists($pdo, 'census_records') ? '+(SELECT count(*) FROM census_records c WHERE c.place_id=pl.id)' : '';
            $s = $pdo->prepare("SELECT pl.*, ((SELECT count(*) FROM events e WHERE e.place_id=pl.id){$census}) AS n_events,
                ((pl.latitude-:lat)*(pl.latitude-:lat) + ((pl.longitude-:lon)*:cos)*((pl.longitude-:lon)*:cos)) AS d2
                FROM places pl WHERE pl.latitude BETWEEN :la1 AND :la2 AND pl.longitude BETWEEN :lo1 AND :lo2 AND " . ($seg === 'base' ? $used : "NOT {$used}") . "
                ORDER BY d2, COALESCE(pl.population,0) DESC LIMIT " . ($seg === 'base' ? 8 : $limit * 3));
            $s->execute([':lat' => $lat, ':lon' => $lon, ':cos' => $cos, ':la1' => $lat - $box, ':la2' => $lat + $box, ':lo1' => $lon - $box / $cos, ':lo2' => $lon + $box / $cos]);
            $rows = $s->fetchAll(PDO::FETCH_ASSOC);
            if ($rows) {
                $seen = $seg === 'fr' ? ($baseKeys ?? []) : [];
                foreach ($rows as $r) {
                    $k = mb_strtolower((string) $r['name']) . '|' . ($r['admin4_code'] ?: $r['id']); // un seul hameau homonyme par commune
                    if ($seg === 'fr' && isset($seen[$k])) { continue; }
                    $seen[$k] = true;
                    $r['distance_km'] = sqrt((float) $r['d2']) * 111.2;
                    $it = picker_place_item($r, $seg);
                    $it['meta'] = trim($it['meta'] . ' · à ' . number_format($it['distance_km'], 1, ',', ' ') . ' km', ' ·');
                    $items[] = $it;
                    if (count($items) >= ($seg === 'base' ? 8 : $limit)) { break; }
                }
                break;
            }
        }
        if ($seg === 'base') { $baseKeys = []; foreach ($items as $it) { $baseKeys[mb_strtolower($it['name']) . '|' . ($it['insee'] ?: $it['id'])] = true; } }
        $groups[] = ['kind' => 'place', 'key' => $seg, 'label' => $label, 'total' => count($items), 'items' => $items];
    }
    return $groups;
}

/**
 * POST picker_place_adopt {geoname_id} : la ville du monde choisie entre dans places.
 * {name, country?} (sans geoname_id) : « ＋ Créer le lieu « … » » quand l'outil n'a rien prévu d'autre.
 */
function picker_place_adopt(PDO $pdo, array $data): array
{
    picker_register($pdo);
    $geo = (int) ($data['geoname_id'] ?? 0);
    $name = trim(mb_substr((string) ($data['name'] ?? ''), 0, 200));
    if ($geo <= 0 && $name !== '') {
        $lat = is_numeric($data['lat'] ?? null) && abs((float) $data['lat']) <= 90 ? (float) $data['lat'] : null;
        $lon = is_numeric($data['lon'] ?? null) && abs((float) $data['lon']) <= 180 ? (float) $data['lon'] : null;
        $pdo->prepare('INSERT INTO places(name,country,latitude,longitude) VALUES(?,?,?,?)')->execute([$name, trim(mb_substr((string) ($data['country'] ?? ''), 0, 100)), $lat, $lon]);
        $id = (int) $pdo->lastInsertId();
        if (function_exists('log_change')) { log_change($pdo, 'place', $id, 'create', 'Lieu créé : ' . $name); }
    } else {
        $w = $geo > 0 && function_exists('world_place') ? world_place($geo) : null;
        if (!$w) { throw new RuntimeException('Ville introuvable dans la liste des villes du monde.'); }
        $id = place_from_world($pdo, $w);
    }
    $s = $pdo->prepare('SELECT pl.*, (SELECT count(*) FROM events e WHERE e.place_id=pl.id) AS n_events FROM places pl WHERE pl.id=?');
    $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    return ['id' => $id, 'item' => $row ? picker_place_item($row, 'base') : null];
}

// ─── Tout le reste ───────────────────────────────────────────────────────────

function picker_sources(PDO $pdo, string $q, int $offset, int $limit): array
{
    $params = [];
    $where = picker_text_where(['s.title', 's.author', 's.agency', 's.publication'], $q, $params);
    $links = picker_table_exists($pdo, 'source_links') ? '(SELECT count(*) FROM source_links sl WHERE sl.source_record_id=s.id)' : '0';
    [$total, $rows] = picker_page($pdo, "SELECT s.id, s.title, s.author, s.agency, s.publication, {$links} AS n", "FROM sources s WHERE {$where}", 's.title COLLATE NOCASE, s.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'source', 'id' => (int) $r['id'], 'title' => trim((string) $r['title']) ?: 'Source sans titre',
        'meta' => implode(' · ', array_filter(['Source', trim((string) $r['author']), trim((string) $r['agency']), trim((string) $r['publication'])])),
        'badge' => picker_plural((int) $r['n'], 'citation'), 'badge_style' => '', 'group' => 'source', 'icon' => '📚', 'short' => trim((string) $r['agency']),
    ], $rows)];
}

/** Colonnes de la table media (les anciennes bases n'ont pas toutes les colonnes ajoutées plus tard). */
function picker_media_cols(PDO $pdo): array
{
    static $cols = null;
    if ($cols === null) { $cols = array_flip(array_column($pdo->query('PRAGMA table_info(media)')->fetchAll(PDO::FETCH_ASSOC), 'name')); }
    return $cols;
}

/** Colonne de media si elle existe, sinon une valeur par défaut (SQL). */
function picker_media_col(PDO $pdo, string $col, string $default = "''"): string
{
    return isset(picker_media_cols($pdo)[$col]) ? "m.{$col}" : $default;
}

/** Sorte d'un média pour la fenêtre de choix : photo, document (acte, papier, carte…), audio, vidéo (SQL). */
function picker_media_sort_sql(PDO $pdo): string
{
    $links = picker_table_exists($pdo, 'media_links') ? " OR EXISTS(SELECT 1 FROM media_links sl WHERE sl.media_id=m.id AND sl.entity_type='source')" : '';
    $subject = picker_media_col($pdo, 'media_subject_type');
    $corr = picker_media_col($pdo, 'correspondence_type');
    return "CASE WHEN lower(m.media_type)='audio' THEN 'audio' WHEN lower(m.media_type)='video' THEN 'video'
        WHEN lower(m.media_type) IN ('document','pdf') OR trim(COALESCE(m.document_title,''))<>'' OR trim(COALESCE(m.document_url,''))<>''
            OR COALESCE({$subject},'') IN ('voter_card','id_card','driving_permit') OR trim(COALESCE({$corr},''))<>''
            OR picker_fold(m.title) LIKE 'acte %' OR picker_fold(m.title) LIKE 'registre%' OR picker_fold(m.title) LIKE 'contrat %'{$links} THEN 'document' ELSE 'photo' END";
}

/**
 * Filtres de la fenêtre « Choisir une image » (openMediaPicker) : sortes permises (media_types=image,audio), une sorte
 * (media_sort=photo|document|audio|video), portraits, récentes (+ recent_ids), transcription / signature (media_flag).
 * Renvoie la condition SQL (sans la sorte quand $withSort est faux : pour les compteurs).
 */
function picker_media_filters(PDO $pdo, array $opts, array &$params, bool $withSort = true): string
{
    $where = '';
    $links = picker_table_exists($pdo, 'media_links');
    if (!empty($opts['person_id']) && $links) { $where .= " AND EXISTS(SELECT 1 FROM media_links pl2 WHERE pl2.media_id=m.id AND pl2.entity_type='person' AND pl2.entity_id=:pid)"; $params[':pid'] = (int) $opts['person_id']; }
    if (!empty($opts['media_type'])) {
        if ($opts['media_type'] === 'document') { $where .= " AND m.media_type IN ('document','pdf')"; }
        else { $where .= ' AND m.media_type = :mt'; $params[':mt'] = $opts['media_type']; }
    }
    $types = $opts['media_types'] ?? [];
    if ($types) {
        $list = [];
        foreach ($types as $t) { $list = [...$list, ...($t === 'document' ? ['document', 'pdf'] : [$t])]; }
        $in = [];
        foreach (array_values(array_unique($list)) as $i => $t) { $in[] = ":mts{$i}"; $params[":mts{$i}"] = $t; }
        $where .= ' AND lower(m.media_type) IN (' . implode(',', $in) . ") AND trim(COALESCE(m.filename,''))<>''";
    }
    $flag = $opts['media_flag'] ?? '';
    if ($flag === 'notr') { $where .= " AND trim(COALESCE(m.transcription,''))=''"; }
    elseif ($flag === 'tr') { $where .= " AND trim(COALESCE(m.transcription,''))<>''"; }
    elseif ($flag === 'sig') {
        $where .= picker_table_exists($pdo, 'media_tags') ? " AND EXISTS(SELECT 1 FROM media_tags t WHERE t.media_id=m.id AND COALESCE(t.tag_type,'person')='signature')" : ' AND 0';
    }
    if (!$withSort) { return $where; }
    if (!empty($opts['media_sort'])) { $where .= ' AND (' . picker_media_sort_sql($pdo) . ') = :msort'; $params[':msort'] = $opts['media_sort']; }
    if (!empty($opts['portraits'])) { $where .= ' AND ' . picker_media_portrait_sql(); }
    if (!empty($opts['recent'])) { $where .= ' AND ' . picker_media_recent_sql($opts['recent_ids'] ?? []); }
    return $where;
}

/** Portrait : coché « photo de la personne », ou choisi comme portrait d'une fiche. */
function picker_media_portrait_sql(): string
{
    return "(COALESCE(m.is_person_photo,0)=1 OR EXISTS(SELECT 1 FROM persons pp WHERE pp.portrait_media_id=m.id))";
}

/** Récentes : les 40 derniers médias ajoutés, et ceux choisis dernièrement dans la fenêtre (ids entiers déjà vérifiés). */
function picker_media_recent_sql(array $ids): string
{
    $ids = array_slice(array_values(array_filter(array_map('intval', $ids), static fn(int $i): bool => $i > 0)), 0, 60);
    return '(m.id IN (SELECT id FROM media ORDER BY id DESC LIMIT 40)' . ($ids ? ' OR m.id IN (' . implode(',', $ids) . ')' : '') . ')';
}

/** Compteurs des filtres de la fenêtre (pour la recherche en cours, sans la sorte choisie). */
function picker_media_counts(PDO $pdo, string $q, array $opts): array
{
    picker_register($pdo);
    $params = [];
    $where = picker_text_where(picker_media_text_columns($pdo), $q, $params) . picker_media_filters($pdo, $opts, $params, false);
    $sql = 'SELECT count(*) AS total, sum(s=\'photo\') AS photo, sum(s=\'document\') AS document, sum(s=\'audio\') AS audio, sum(s=\'video\') AS video, sum(pt) AS portraits, sum(rc) AS recent FROM (SELECT '
        . picker_media_sort_sql($pdo) . ' AS s, ' . picker_media_portrait_sql() . ' AS pt, ' . picker_media_recent_sql($opts['recent_ids'] ?? []) . " AS rc FROM media m WHERE {$where})";
    $s = $pdo->prepare($sql);
    $s->execute(picker_params($sql, $params));
    $r = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    return array_map(static fn($v): int => (int) $v, ['all' => $r['total'] ?? 0, 'photo' => $r['photo'] ?? 0, 'document' => $r['document'] ?? 0,
        'audio' => $r['audio'] ?? 0, 'video' => $r['video'] ?? 0, 'portraits' => $r['portraits'] ?? 0, 'recent' => $r['recent'] ?? 0]);
}

/** Où chercher le texte tapé : titre, fichier, description, document et cote, date, personnes, lieu et année des événements liés. */
function picker_media_text_columns(PDO $pdo): array
{
    $links = picker_table_exists($pdo, 'media_links');
    $names = $links ? "(SELECT group_concat(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''),' ; ') FROM media_links ml JOIN persons p ON p.id=ml.entity_id WHERE ml.media_id=m.id AND ml.entity_type='person')" : "''";
    $places = $links ? "(SELECT group_concat(COALESCE(pl.name,'')||' '||COALESCE(e.year,''),' ; ') FROM media_links ml JOIN events e ON e.id=ml.entity_id LEFT JOIN places pl ON pl.id=e.place_id WHERE ml.media_id=m.id AND ml.entity_type='event')" : "''";
    return ['m.title', 'm.filename', 'm.description', 'm.document_title', 'm.document_reference', 'm.date_text', $names, $places];
}

/** Étiquette de sorte posée sur la vignette (PHOTO, ACTE, CARTE…). */
function picker_media_tag(array $r): string
{
    $type = strtolower((string) $r['media_type']);
    if ($type === 'audio') { return 'SON'; }
    if ($type === 'video') { return 'VIDÉO'; }
    if ($type === 'pdf') { return 'PDF'; }
    if ($type === 'document') { return 'DOC'; }
    $subject = (string) ($r['subject'] ?? '');
    if (in_array($subject, ['voter_card', 'id_card'], true)) { return 'CARTE'; }
    if ($subject === 'driving_permit') { return 'PERMIS'; }
    if ($subject === 'grave_photo') { return 'TOMBE'; }
    if ($subject === 'war_memorial_photo') { return 'MONUMENT'; }
    if (trim((string) ($r['postcard'] ?? '')) !== '') { return 'CARTE'; }
    if (trim((string) ($r['corr'] ?? '')) !== '') { return 'LETTRE'; }
    if ((int) ($r['portrait'] ?? 0)) { return 'PORTRAIT'; }
    if (($r['sort'] ?? '') === 'document') { return 'ACTE'; }
    return 'PHOTO';
}

function picker_media(PDO $pdo, string $q, int $offset, int $limit, array $opts = []): array
{
    $params = [];
    $links = picker_table_exists($pdo, 'media_links');
    // aussi la cote (document_reference), la date, le nom des personnes rattachées, le lieu et l'année des événements liés
    $where = picker_text_where(picker_media_text_columns($pdo), $q, $params) . picker_media_filters($pdo, $opts, $params);
    $people = $links ? "(SELECT count(*) FROM media_links ml WHERE ml.media_id=m.id AND ml.entity_type='person')" : '0';
    $pids = $links ? "(SELECT group_concat(entity_id) FROM (SELECT DISTINCT entity_id FROM media_links WHERE media_id=m.id AND entity_type='person' ORDER BY position, id LIMIT 8))" : "''";
    $ev = $links ? "(SELECT %s FROM media_links ml JOIN events e ON e.id=ml.entity_id LEFT JOIN places pl ON pl.id=e.place_id WHERE ml.media_id=m.id AND ml.entity_type='event' ORDER BY e.year IS NULL, e.year LIMIT 1)" : "''";
    $select = "SELECT m.id, m.title, m.filename, m.thumbnail, m.media_type, m.date_text, m.document_reference, m.created_at, {$people} AS n, {$pids} AS pids,
        " . sprintf($ev, 'COALESCE(pl.name,\'\')') . ' AS place, ' . sprintf($ev, 'e.year') . ' AS ev_year, ' . picker_media_sort_sql($pdo) . ' AS sort, ' . picker_media_portrait_sql() . " AS portrait,
        CASE WHEN trim(COALESCE(m.transcription,''))<>'' THEN 1 ELSE 0 END AS has_tr, " . picker_media_col($pdo, 'duration_seconds', 'NULL') . ' AS duration, '
        . picker_media_col($pdo, 'media_subject_type') . ' AS subject, ' . picker_media_col($pdo, 'postcard_group') . ' AS postcard, ' . picker_media_col($pdo, 'correspondence_type') . ' AS corr'
        . (!empty($opts['with_text']) ? ", substr(COALESCE(m.transcription,''), 1, 20000) AS transcription, m.description" : '');
    [$total, $rows] = picker_page($pdo, $select, "FROM media m WHERE {$where}", 'm.id DESC', $params, $offset, $limit);
    $types = ['image' => 'Photo', 'document' => 'Document', 'audio' => 'Audio', 'video' => 'Vidéo', 'pdf' => 'PDF'];
    $icons = ['audio' => '🎧', 'video' => '🎬', 'document' => '📄', 'pdf' => '📄'];
    return ['total' => $total, 'items' => array_map(static function ($r) use ($types, $icons) {
        $type = (string) $r['media_type'];
        $thumb = $type === 'image' ? (trim((string) $r['thumbnail']) ?: trim((string) $r['filename'])) : trim((string) $r['thumbnail']);
        $n = (int) $r['n'];
        $date = trim((string) $r['date_text']);
        $year = preg_match('/(?<!\d)(\d{4})(?!\d)/', $date, $m) ? $m[1] : (string) ($r['ev_year'] ?? '');
        return [
            'kind' => 'media', 'id' => (int) $r['id'], 'title' => trim((string) $r['title']) ?: (string) $r['filename'] ?: 'Média #' . $r['id'],
            'meta' => implode(' · ', array_filter([$types[$type] ?? ucfirst($type), $date, trim((string) $r['document_reference']), $n ? picker_plural($n, 'personne') : ''])),
            'badge' => 'Média', 'badge_style' => '', 'group' => 'media', 'icon' => $icons[$type] ?? '🖼',
            'thumb' => $thumb !== '' ? 'media/' . rawurlencode($thumb) : '', 'short' => $date ?: $year,
            'filename' => (string) $r['filename'], 'thumbnail' => trim((string) $r['thumbnail']), 'media_type' => $type,
            // pour la fenêtre « Choisir une image » (openMediaPicker)
            'sort' => (string) $r['sort'], 'tag' => picker_media_tag($r), 'year' => $year, 'date_text' => $date, 'place' => (string) ($r['place'] ?? ''),
            'cote' => trim((string) $r['document_reference']), 'duration' => $r['duration'] !== null && (float) $r['duration'] > 0 ? round((float) $r['duration'], 1) : null,
            'portrait' => (int) $r['portrait'], 'has_tr' => (int) $r['has_tr'], 'people_ids' => array_values(array_filter(array_map('intval', explode(',', (string) $r['pids'])))),
            'people_count' => $n, 'created_at' => (string) $r['created_at'],
        ] + (array_key_exists('transcription', $r) ? ['transcription' => (string) $r['transcription'], 'description' => (string) $r['description']] : []);
    }, $rows)];
}

function picker_investigations(PDO $pdo, string $q, int $offset, int $limit): array
{
    $params = [];
    $where = picker_text_where(['i.title', 'i.question', "p.first_name||' '||p.last_name"], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT i.id, i.title, i.status, i.person_id, p.first_name, p.last_name',
        "FROM investigations i LEFT JOIN persons p ON p.id=i.person_id WHERE {$where}", "CASE i.status WHEN 'open' THEN 0 ELSE 1 END, i.updated_at DESC, i.id DESC", $params, $offset, $limit);
    $status = ['open' => 'En cours', 'paused' => 'En pause', 'closed' => 'Terminée'];
    return ['total' => $total, 'items' => array_map(static function ($r) use ($status) {
        $who = trim(((string) $r['first_name']) . ' ' . mb_strtoupper((string) $r['last_name']));
        $st = $status[$r['status']] ?? (string) $r['status'];
        return ['kind' => 'investigation', 'id' => (int) $r['id'], 'title' => (string) $r['title'],
            'meta' => implode(' · ', array_filter(['Enquête', $who, mb_strtolower($st)])), 'badge' => $st, 'badge_style' => $r['status'] === 'open' ? 'blue' : '',
            'group' => 'investigation', 'icon' => '🔍', 'short' => $who, 'person_id' => (int) $r['person_id']];
    }, $rows)];
}

function picker_battues(PDO $pdo, string $q, int $offset, int $limit): array
{
    $params = [];
    $where = picker_text_where(['b.title', 'b.target_text', 'b.notes'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT b.id, b.title, b.target_text, b.status', "FROM battues b WHERE {$where}", "CASE b.status WHEN 'open' THEN 0 ELSE 1 END, b.updated_at DESC, b.id DESC", $params, $offset, $limit);
    $status = ['open' => 'En cours', 'closed' => 'Terminée', 'paused' => 'En pause', 'found' => 'Trouvé'];
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'battue', 'id' => (int) $r['id'], 'title' => (string) $r['title'],
        'meta' => implode(' · ', array_filter(['Battue', trim((string) $r['target_text']), mb_strtolower($status[$r['status']] ?? (string) $r['status'])])),
        'badge' => $status[$r['status']] ?? '', 'badge_style' => $r['status'] === 'open' ? 'blue' : '', 'group' => 'battue', 'icon' => '🧭', 'short' => trim((string) $r['target_text']),
    ], $rows)];
}

function picker_labels(PDO $pdo, string $q, int $offset, int $limit): array
{
    $params = [];
    $where = picker_text_where(['l.name', 'l.description'], $q, $params);
    $n = picker_table_exists($pdo, 'label_links') ? '(SELECT count(*) FROM label_links ll WHERE ll.label_id=l.id)' : '0';
    [$total, $rows] = picker_page($pdo, "SELECT l.id, l.name, l.color, {$n} AS n", "FROM labels l WHERE {$where}", 'l.name COLLATE NOCASE', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'label', 'id' => (int) $r['id'], 'title' => (string) $r['name'], 'meta' => 'Étiquette · ' . picker_plural((int) $r['n'], 'fiche'),
        'badge' => '', 'badge_style' => '', 'group' => 'label', 'color' => preg_match('/^#[0-9a-f]{3,8}$/i', (string) $r['color']) ? (string) $r['color'] : '#0066cc', 'short' => '',
    ], $rows)];
}

function picker_houses(PDO $pdo, string $q, int $offset, int $limit): array
{
    $params = [];
    $where = picker_text_where(['h.name', 'h.place_text', 'h.period'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT h.id, h.name, h.place_text, h.period, h.thumb', "FROM houses h WHERE {$where}", 'h.updated_at DESC, h.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'house', 'id' => (int) $r['id'], 'title' => trim((string) $r['name']) ?: 'Maison #' . $r['id'],
        'meta' => implode(' · ', array_filter(['Maison', trim((string) $r['place_text']), trim((string) $r['period'])])),
        'badge' => '', 'badge_style' => '', 'group' => 'house', 'icon' => '🏠',
        'thumb' => str_starts_with((string) $r['thumb'], 'data:image/') ? (string) $r['thumb'] : '', 'short' => trim((string) $r['place_text']),
    ], $rows)];
}

function picker_periodicals(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'periodicals')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['r.title', 'r.publisher', 'r.kind'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT r.id, r.title, r.kind, r.publisher', "FROM periodicals r WHERE {$where}", 'r.title COLLATE NOCASE, r.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'periodical', 'id' => (int) $r['id'], 'title' => trim((string) $r['title']) ?: 'Revue #' . $r['id'],
        'meta' => implode(' · ', array_filter(['Revue', trim((string) $r['kind']), trim((string) $r['publisher'])])),
        'badge' => '', 'badge_style' => '', 'group' => 'periodical', 'icon' => '📰', 'short' => trim((string) $r['publisher']),
    ], $rows)];
}

function picker_employers(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'employer_records')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['r.name'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT r.id, r.key, r.name, r.data_json', "FROM employer_records r WHERE {$where}", 'r.name COLLATE NOCASE, r.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static function ($r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $extra = array_filter([is_string($d['sector'] ?? null) ? $d['sector'] : '', is_string($d['place'] ?? null) ? $d['place'] : (is_string($d['city'] ?? null) ? $d['city'] : '')]);
        return ['kind' => 'employer', 'id' => (int) $r['id'], 'title' => trim((string) $r['name']) ?: (string) $r['key'], 'meta' => implode(' · ', ['Employeur', ...$extra]),
            'badge' => '', 'badge_style' => '', 'group' => 'employer', 'icon' => '🏭', 'short' => '', 'key' => (string) $r['key']];
    }, $rows)];
}

function picker_census(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'census_records')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    // aussi les membres du foyer : nom relevé (first_name, display_name) et fiche liée
    $members = picker_table_exists($pdo, 'census_members') ? "(SELECT group_concat(COALESCE(cm.first_name,'')||' '||COALESCE(cm.display_name,'')||' '||COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,''),' ; ') FROM census_members cm LEFT JOIN persons p ON p.id=cm.person_id WHERE cm.census_id=c.id)" : "''";
    $where = picker_text_where(['c.address', 'pl.name', "'recensement '||c.year", 'c.notes', $members], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT c.id, c.year, c.address, c.date_text, pl.name AS place, pl.county',
        "FROM census_records c LEFT JOIN places pl ON pl.id=c.place_id WHERE {$where}", 'c.year DESC, pl.name COLLATE NOCASE, c.id', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'census', 'id' => (int) $r['id'], 'title' => 'Recensement ' . $r['year'] . (trim((string) $r['place']) !== '' ? ' · ' . trim((string) $r['place']) : ''),
        'meta' => implode(' · ', array_filter(['Recensement', trim((string) $r['place']), trim((string) $r['address'])])),
        'badge' => (string) $r['year'], 'badge_style' => '', 'group' => 'census', 'icon' => '📋', 'short' => trim((string) $r['place']),
    ], $rows)];
}
