<?php
declare(strict_types=1);

/**
 * 🎨 « Créations et carrières » : les fiches du moteur (table items, lib/art_engine.php, docs/TYPES.md) de TOUTE la base,
 * rangées par grande famille, pour les listes de l'onglet Listes (interface : assets/js/heritage-creations.js).
 *
 * Lecture seule. Une seule route :
 *   GET api.php?action=creations&op=list&family=music&q=…&kinds=track_work,master&person=12&place=7|txt:Tulle
 *       &from=1900&to=1950&img=1&av=1&sort=az|za|recent|old|year|year_desc|person|kind&group=1&offset=0&limit=60
 *   → {family, total, items: [...], counts: {sorte: n}, types: {sorte: {label, plural, icon}}, families: {...}, readonly}
 *
 *  - les familles sont celles du moteur : ART_BUILTIN_TYPES, les 131 types d'œuvres (lib/oeuvres.php, famille de chaque
 *    type), la scène (lib/scene.php), les profils politique et sport (lib/profils.php), sciences (lib/sciences.php), les
 *    blocs (lib/blocs.php) et les types de l'utilisateur (item_types.origin = 'user') ;
 *  - les fiches d'une personne supprimée restent dans la base mais ne s'affichent pas (JOIN persons, comme blocs_rows) ;
 *  - mode consultation : les fiches d'une personne vivante ou confidentielle ne sortent pas, et ces personnes ne sont pas
 *    nommées dans les crédits des autres fiches (mêmes règles que l'export « pour partager ») ;
 *  - tout le filtrage, le tri et la pagination sont en SQL préparé : deux requêtes par page (le compte par sorte et la page).
 */

/** clé => [nom de la liste, icône, familles de lib/oeuvres.php reprises, sortes en plus] */
const CREATIONS_FAMILIES = [
    'all' => ['Tout ce qui a été créé ou vécu', '🎨', [], []],
    'music' => ['Musique', '🎵', ['music'], ['track_work', 'master', 'release', 'recording', 'concert', 'tour']],
    'stage' => ['Scène', '🎭', ['stage'], ['stage_piece']],
    'screen' => ['Image animée', '🎬', ['screen'], ['film', 'series', 'season', 'episode', 'role']],
    'writing' => ['Écrits', '📚', ['writing'], ['text', 'book', 'paper']],
    'visual' => ['Arts visuels', '🖼', ['visual'], ['work', 'exhibition', 'o_affiche']],
    'craft' => ['Design et métiers d’art', '⚒️', ['design'], []],
    'space' => ['Espace et paysage', '🏛', ['space'], []],
    'digital' => ['Numérique et jeux', '💻', ['digital'], []],
    'hobby' => ['Modélisme et loisirs créatifs', '🧩', ['hobby'], []],
    'taste' => ['Saveurs et senteurs', '🍷', ['taste'], []],
    'science' => ['Inventions et découvertes', '💡', [], ['invention', 'discovery', 'paper']],
    'expeditions' => ['Expéditions', '🧭', [], ['expedition']],
    'politic' => ['Parcours politiques', '🏛', [], ['pol_mandate', 'pol_election', 'pol_party', 'pol_text', 'pol_speech', 'pol_affair']],
    'sport' => ['Sport', '🏅', [], ['sp_club', 'sp_result', 'sp_record', 'sp_season']],
    'school' => ['Formation et diplômes', '🎓', [], ['school_step', 'diploma', 'school']],
    'mine' => ['Mes types d’œuvres', '✎', [], []],
];
const CREATIONS_SORTS = ['az', 'za', 'recent', 'old', 'year', 'year_desc', 'person', 'kind'];
const CREATIONS_MAX = 200;

function creations_readonly(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

/** les sortes de chaque famille (null pour « all » = toutes, sauf les fiches de profil) */
function creations_families(PDO $pdo): array
{
    $oe = function_exists('oeuvres_types') ? oeuvres_types() : [];
    $user = []; // les types de l'utilisateur : dans « Mes types », et aussi dans la famille où il les a rangés
    try { foreach ($pdo->query("SELECT key, family FROM item_types WHERE origin='user'")->fetchAll(PDO::FETCH_ASSOC) as $r) { $user[(string) $r['key']] = (string) $r['family']; } } catch (Throwable $e) {}
    $out = [];
    foreach (CREATIONS_FAMILIES as $key => [$label, $icon, $oeFams, $extra]) {
        if ($key === 'all') { $out[$key] = ['label' => $label, 'icon' => $icon, 'kinds' => null]; continue; }
        $kinds = $extra;
        foreach ($oe as $k => $t) {
            if (str_starts_with($k, 'profile_')) { continue; }
            if (in_array($t[3] ?? '', $oeFams, true) || ($key === 'craft' && in_array('artisan', (array) ($t[5] ?? []), true))) { $kinds[] = $k; }
        }
        foreach ($user as $k => $fam) { if ($key === 'mine' || ($fam !== '' && in_array($fam, $oeFams, true))) { $kinds[] = $k; } }
        $out[$key] = ['label' => $label, 'icon' => $icon, 'kinds' => array_values(array_unique($kinds))];
    }
    return $out;
}

/** « 1900 », « vers 1900 » → 1900 ; sinon null */
function creations_year(mixed $v): ?int
{
    $s = trim(scalar_text($v ?? '', 'année'));
    return preg_match('/(-?\d{1,4})/', $s, $m) ? max(-9999, min(9999, (int) $m[1])) : null;
}

/** un mot pour LIKE (les % et _ tapés restent des lettres) */
function creations_like(string $w): string { return '%' . strtr($w, ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%'; }

/** les valeurs simples d'une fiche, à plat (« label » → « Polydor », dims → « 65 × 81 ») : pour les colonnes et les vignettes */
function creations_flat(array $d): array
{
    $o = [];
    foreach ($d as $k => $v) {
        if (count($o) >= 48 || !is_string($k) || in_array($k, ['photos', 'notes', 'synopsis', 'summary', 'lyrics', 'lyrics_all', 'story', 'anecdote'], true)) { continue; }
        $t = '';
        if (is_string($v) || is_int($v) || is_float($v)) { $t = trim((string) $v); }
        elseif (is_bool($v)) { $t = $v ? 'oui' : ''; }
        elseif (is_array($v) && !array_is_list($v)) {
            $t = trim(scalar_text(is_scalar($v['title'] ?? null) ? $v['title'] : (is_scalar($v['txt'] ?? null) ? $v['txt'] : (is_scalar($v['pname'] ?? null) ? $v['pname'] : '')), $k));
            if ($t === '' && (isset($v['h']) || isset($v['w']))) {
                $t = implode(' × ', array_filter(array_map(static fn($x) => is_scalar($v[$x] ?? null) ? trim((string) $v[$x]) : '', ['h', 'w', 'd']), static fn($x) => $x !== ''));
                if ($t !== '' && is_scalar($v['u'] ?? null) && trim((string) $v['u']) !== '') { $t .= ' ' . trim((string) $v['u']); }
            }
        } elseif (is_array($v) && $v && is_array($v[0] ?? null)) { // une liste de personnes ou de fiches : les premiers noms
            $names = [];
            foreach (array_slice($v, 0, 4) as $x) { if (is_array($x)) { $n = $x['title'] ?? $x['pname'] ?? $x['txt'] ?? ''; if (is_scalar($n) && trim((string) $n) !== '') { $names[] = trim((string) $n); } } }
            $t = implode(', ', $names);
        }
        if ($t !== '') { $o[$k] = mb_substr($t, 0, 140); }
    }
    return $o;
}

/** la liste d'une famille : filtres, tri, page */
function creations_list(PDO $pdo, array $g): array
{
    art_ensure($pdo);
    $families = creations_families($pdo);
    $famKey = scalar_text($g['family'] ?? 'all', 'family');
    if (!isset($families[$famKey])) { throw new RuntimeException('Liste inconnue.'); }
    $fam = $families[$famKey];
    $ro = creations_readonly();
    $limit = max(1, min(CREATIONS_MAX, safe_int($g['limit'] ?? 60, 60)));
    $offset = max(0, min(1_000_000, safe_int($g['offset'] ?? 0)));
    $sort = scalar_text($g['sort'] ?? 'az', 'sort'); if (!in_array($sort, CREATIONS_SORTS, true)) { $sort = 'az'; }
    $group = !empty($g['group']) && $g['group'] !== '0';
    $base = ['meta' => ['family' => $famKey, 'label' => $fam['label'], 'icon' => $fam['icon']], 'families' => creations_family_meta($families), 'readonly' => $ro];

    $where = []; $params = [];
    if ($fam['kinds'] === null) { $where[] = "i.type_key<>'profile' AND substr(i.type_key, 1, 8)<>'profile_'"; }
    elseif (!$fam['kinds']) { return $base + ['total' => 0, 'items' => [], 'counts' => new stdClass(), 'types' => new stdClass()]; }
    else { $where[] = 'i.type_key IN (' . implode(',', array_fill(0, count($fam['kinds']), '?')) . ')'; array_push($params, ...$fam['kinds']); }
    // mode consultation : rien d'une personne vivante ou confidentielle
    if ($ro) { $where[] = "COALESCE(p.living_status,'')<>'living' AND COALESCE(p.is_private,0)=0"; }
    // 🔍 titre, personne, lieu, année, champs texte (jusqu'à 6 mots, tous présents)
    $q = trim(mb_substr(scalar_text($g['q'] ?? '', 'q'), 0, 200));
    if ($q !== '') {
        if (preg_match('/^#(\d+)$/', $q, $m)) { $where[] = 'i.id=?'; $params[] = (int) $m[1]; }
        else {
            foreach (array_slice(preg_split('/\s+/u', $q) ?: [], 0, 6) as $w) {
                if ($w === '') { continue; }
                $l = creations_like($w);
                $where[] = "(i.title LIKE ? ESCAPE '\\' OR i.data LIKE ? ESCAPE '\\' OR i.date_text LIKE ? ESCAPE '\\' OR CAST(i.year AS TEXT)=? OR " . art_person_name_sql() . " LIKE ? ESCAPE '\\' OR COALESCE(pl.name,'') LIKE ? ESCAPE '\\')";
                array_push($params, $l, $l, $l, $w, $l, $l);
            }
        }
    }
    // 👤 la personne : à qui se rattache la fiche, ou citée dedans (crédits, jury, camarade…)
    $person = safe_int($g['person'] ?? 0);
    if ($person > 0) { $where[] = '(i.person_id=? OR EXISTS (SELECT 1 FROM item_people a WHERE a.item_id=i.id AND a.person_id=?))'; array_push($params, $person, $person); }
    // 📍 le lieu : choisi dans la base (lieu de la fiche ou lieu cité), ou texte libre
    $place = trim(scalar_text($g['place'] ?? '', 'place'));
    if (preg_match('/^\d+$/', $place) && (int) $place > 0) { $where[] = "(i.place_id=? OR EXISTS (SELECT 1 FROM item_links l WHERE l.from_id=i.id AND l.to_type='place' AND l.to_id=?))"; array_push($params, (int) $place, (int) $place); }
    elseif (str_starts_with($place, 'txt:') && trim(substr($place, 4)) !== '') { $l = creations_like(trim(mb_substr(substr($place, 4), 0, 120))); $where[] = "(COALESCE(pl.name,'') LIKE ? ESCAPE '\\' OR i.data LIKE ? ESCAPE '\\')"; array_push($params, $l, $l); }
    // 📅 la période : la fiche touche ces années (« vers 1784 » = 1779–1789)
    $from = creations_year($g['from'] ?? null); $to = creations_year($g['to'] ?? null);
    if ($from !== null && $to !== null && $from > $to) { [$from, $to] = [$to, $from]; }
    if ($from !== null) { $where[] = 'COALESCE(i.date_max, i.date_min, i.year) >= CAST(? AS INTEGER)'; $params[] = $from; }
    if ($to !== null) { $where[] = 'COALESCE(i.date_min, i.date_max, i.year) <= CAST(? AS INTEGER)'; $params[] = $to; }
    // 🖼 avec image ; 🎞 avec un son ou une vidéo de la base
    if (!empty($g['img']) && $g['img'] !== '0') { $where[] = "(i.data LIKE '%\"photos\":[{%' OR i.data LIKE '%\"cover\":{%')"; }
    if (!empty($g['av']) && $g['av'] !== '0') { $where[] = "EXISTS (SELECT 1 FROM item_links l JOIN media m ON m.id=l.to_id WHERE l.from_id=i.id AND l.to_type='media' AND m.media_type IN ('audio','video'))"; }
    $from_sql = 'FROM items i JOIN persons p ON p.id=i.person_id LEFT JOIN places pl ON pl.id=i.place_id';
    $w = $where ? implode(' AND ', $where) : '1=1';

    // le compte par sorte (sans le filtre « Sorte » : le menu montre combien il y en a de chaque)
    $c = $pdo->prepare("SELECT i.type_key, count(*) {$from_sql} WHERE {$w} GROUP BY i.type_key");
    $c->execute($params);
    $counts = array_map('intval', $c->fetchAll(PDO::FETCH_KEY_PAIR));
    $kinds = array_values(array_filter(explode(',', scalar_text($g['kinds'] ?? '', 'kinds')), static fn($k) => (bool) preg_match('/^[a-z][a-z0-9_]{0,43}$/', $k)));
    $kinds = array_values(array_unique(array_slice($kinds, 0, 200)));
    $w2 = $w; $p2 = $params;
    if ($kinds) { $w2 .= ' AND i.type_key IN (' . implode(',', array_fill(0, count($kinds), '?')) . ')'; array_push($p2, ...$kinds); }
    $total = $kinds ? array_sum(array_intersect_key($counts, array_flip($kinds))) : array_sum($counts);
    $types = creations_types($pdo, array_keys($counts));

    $kindLabel = 'COALESCE(NULLIF(t.plural,\'\'), NULLIF(t.label,\'\'), i.type_key) COLLATE NOCASE';
    $ttl = 'i.title COLLATE NOCASE';
    $order = match ($sort) {
        'za' => "{$ttl} DESC, i.id DESC",
        'recent' => 'i.updated_at DESC, i.id DESC',
        'old' => 'i.updated_at ASC, i.id ASC',
        'year' => "COALESCE(i.date_min, i.year, i.date_max) IS NULL, COALESCE(i.date_min, i.year, i.date_max), {$ttl}, i.id",
        'year_desc' => "COALESCE(i.date_max, i.year, i.date_min) IS NULL, COALESCE(i.date_max, i.year, i.date_min) DESC, {$ttl}, i.id",
        'person' => "UPPER(COALESCE(p.last_name,'')), UPPER(COALESCE(p.first_name,'')), p.id, {$ttl}, i.id",
        'kind' => "{$kindLabel}, {$ttl}, i.id",
        default => "{$ttl}, i.id",
    };
    if ($group && $sort !== 'kind') { $order = "{$kindLabel}, i.type_key, {$order}"; }
    $s = $pdo->prepare('SELECT i.id, i.type_key, i.person_id, i.title, i.year, i.date_text, i.date_min, i.date_max, i.place_id, i.data, i.updated_at, i.parent_id, '
        . art_person_name_sql() . " AS owner, p.gender AS owner_gender, COALESCE(pl.name,'') AS place_name
        {$from_sql} LEFT JOIN item_types t ON t.key=i.type_key WHERE {$w2} ORDER BY {$order} LIMIT {$limit} OFFSET {$offset}");
    $s->execute($p2);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $ids = array_map(static fn($r) => (int) $r['id'], $rows);
    $people = creations_people($pdo, $ids, $ro);
    $av = [];
    if ($ids) {
        $in = implode(',', $ids);
        foreach ($pdo->query("SELECT DISTINCT l.from_id, m.media_type FROM item_links l JOIN media m ON m.id=l.to_id WHERE l.to_type='media' AND l.from_id IN ({$in}) AND m.media_type IN ('audio','video')")->fetchAll(PDO::FETCH_ASSOC) as $r) { $av[(int) $r['from_id']][] = (string) $r['media_type']; }
    }
    $items = array_map(static function (array $r) use ($people, $av) {
        $d = json_decode((string) $r['data'], true); $d = is_array($d) ? $d : [];
        $ph = null;
        foreach (is_array($d['photos'] ?? null) ? $d['photos'] : [] as $x) { if (is_array($x) && (!empty($x['f']) || preg_match('#^https://#', (string) ($x['u'] ?? '')))) { $ph = $x; break; } }
        $thumb = $ph ? (!empty($ph['f']) ? 'media/' . rawurlencode((string) $ph['f']) : (string) $ph['u']) : '';
        $id = (int) $r['id'];
        return ['id' => $id, 'kind' => (string) $r['type_key'], 'title' => (string) $r['title'], 'person_id' => (int) $r['person_id'], 'owner' => trim((string) $r['owner']),
            'owner_gender' => (string) ($r['owner_gender'] ?? ''), 'year' => $r['year'] !== null ? (int) $r['year'] : null, 'date_text' => (string) $r['date_text'],
            'date_min' => $r['date_min'] !== null ? (int) $r['date_min'] : null, 'date_max' => $r['date_max'] !== null ? (int) $r['date_max'] : null,
            'place_id' => $r['place_id'] !== null ? (int) $r['place_id'] : null, 'place' => (string) $r['place_name'], 'parent_id' => $r['parent_id'] !== null ? (int) $r['parent_id'] : null,
            'thumb' => $thumb, 'av' => array_values(array_unique($av[$id] ?? [])), 'people' => $people[$id] ?? [], 'f' => creations_flat($d),
            'sub' => function_exists('art_subline') ? art_subline($d, (string) $r['type_key']) : '', 'updated_at' => (string) ($r['updated_at'] ?? '')];
    }, $rows);
    return $base + ['total' => $total, 'offset' => $offset, 'limit' => $limit, 'items' => $items, 'counts' => $counts ?: new stdClass(), 'types' => $types ?: new stdClass()];
}

/** nom, pluriel, icône des sortes (item_types, puis les registres du serveur) */
function creations_types(PDO $pdo, array $kinds): array
{
    $kinds = array_values(array_filter(array_map('strval', $kinds)));
    if (!$kinds) { return []; }
    $out = [];
    $known = ART_BUILTIN_TYPES + (function_exists('art_extra_types') ? art_extra_types() : []) + (defined('SCI_TYPES') ? SCI_TYPES : []);
    foreach ($kinds as $k) { if (isset($known[$k])) { $out[$k] = ['label' => (string) $known[$k][0], 'plural' => (string) ($known[$k][1] ?? $known[$k][0]), 'icon' => (string) ($known[$k][2] ?? '✦')]; } }
    if (defined('BLOCS_TYPES')) { foreach ($kinds as $k) { if (isset(BLOCS_TYPES[$k])) { $out[$k] = ['label' => BLOCS_TYPES[$k][0], 'plural' => BLOCS_TYPES[$k][1], 'icon' => BLOCS_TYPES[$k][2]]; } } }
    $s = $pdo->prepare('SELECT key, label, plural, icon FROM item_types WHERE key IN (' . implode(',', array_fill(0, count($kinds), '?')) . ')');
    $s->execute($kinds);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (isset($out[$r['key']]) && $r['label'] === '') { continue; }
        $out[(string) $r['key']] = ['label' => (string) ($r['label'] ?: $r['key']), 'plural' => (string) ($r['plural'] ?: $r['label'] ?: $r['key']), 'icon' => (string) ($r['icon'] ?: '✦')] + ($out[$r['key']] ?? []);
    }
    return $out;
}

/** les personnes citées par les fiches d'une page (au plus 8 par fiche) ; en consultation, sans les vivants ni les confidentielles */
function creations_people(PDO $pdo, array $ids, bool $ro): array
{
    if (!$ids) { return []; }
    $rows = $pdo->query('SELECT a.item_id, a.person_id, a.name AS fname, a.role, a.zone, p.id AS alive, p.gender, p.living_status, COALESCE(p.is_private,0) AS priv, ' . art_person_name_sql() . ' AS pname
        FROM item_people a LEFT JOIN persons p ON p.id=a.person_id WHERE a.item_id IN (' . implode(',', array_map('intval', $ids)) . ') ORDER BY a.item_id, a.ord')->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $iid = (int) $r['item_id'];
        if (count($out[$iid] ?? []) >= 8) { continue; }
        $alive = $r['alive'] !== null;
        if ($ro && $alive && ((string) $r['living_status'] === 'living' || (int) $r['priv'] === 1)) { continue; }
        $name = $alive && trim((string) $r['pname']) !== '' ? trim((string) $r['pname']) : trim((string) $r['fname']);
        if ($name === '') { continue; }
        $out[$iid][] = ['pid' => $alive ? (int) $r['person_id'] : 0, 'name' => mb_substr($name, 0, 120), 'role' => mb_substr((string) $r['role'], 0, 60), 'zone' => (string) $r['zone'], 'gender' => (string) ($r['gender'] ?? '')];
    }
    return $out;
}

/** les familles pour le navigateur : nom, icône, sortes */
function creations_family_meta(array $families): array
{
    $o = [];
    foreach ($families as $k => $f) { $o[$k] = ['label' => $f['label'], 'icon' => $f['icon'], 'kinds' => $f['kinds']]; }
    return $o;
}

/** combien de fiches dans chaque famille (la liste générale montre les autres listes avec leur nombre) */
function creations_summary(PDO $pdo): array
{
    art_ensure($pdo);
    $ro = creations_readonly();
    $s = $pdo->query("SELECT i.type_key, count(*) FROM items i JOIN persons p ON p.id=i.person_id WHERE i.type_key<>'profile' AND substr(i.type_key, 1, 8)<>'profile_'"
        . ($ro ? " AND COALESCE(p.living_status,'')<>'living' AND COALESCE(p.is_private,0)=0" : '') . ' GROUP BY i.type_key');
    $byKind = array_map('intval', $s->fetchAll(PDO::FETCH_KEY_PAIR));
    $out = [];
    foreach (creations_families($pdo) as $k => $f) { $out[$k] = $f['kinds'] === null ? array_sum($byKind) : array_sum(array_intersect_key($byKind, array_flip($f['kinds']))); }
    return ['families' => $out, 'kinds' => $byKind ?: new stdClass(), 'readonly' => $ro];
}

function creations_api_get(PDO $pdo, array $g): array
{
    return match (scalar_text($g['op'] ?? 'list', 'op')) {
        'list' => creations_list($pdo, $g),
        'summary' => creations_summary($pdo),
        default => throw new RuntimeException('Demande inconnue.'),
    };
}
