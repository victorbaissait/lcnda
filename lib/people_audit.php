<?php
declare(strict_types=1);

/**
 * 👤 Onglet Personnes — ce que l'audit des onglets (docs/design/audit-onglets.html, §2) a ajouté côté serveur :
 *  - 🧭 « Ton lien avec cette personne » : le lien de parenté avec la personne de départ (de cujus), pour une fiche
 *    (pa_person_link) ou une liste de fiches (pa_people_links) — « cousin issu de germains, par Marie DURAND » ;
 *  - 🔍 filtres et tris de la colonne (pa_people_filters / pa_people_order) : genre, vivant/décédé, Sosa, branche,
 *    groupe, étiquette, siècle, sans parents, sans source, avec une note de recherche ; trier par nom, naissance, modification ;
 *  - 👪 fiche familiale d'un couple (pa_family_sheet) ;
 *  - ⚡ saisie rapide d'une famille (pa_quick_family, défaite par pa_quick_family_undo) ;
 *  - 🧮 deux naissances / deux décès dans une fiche : « garder celle-ci, l'autre devient une variante » (pa_event_keep) ;
 *  - 🕘 remettre un seul champ d'une ancienne version (pa_restore_field).
 * Les colonnes events.is_private (🔒 événement confidentiel) et events.research_note (📝 note de recherche) viennent de la
 * migration 111 (lib/migrations.php).
 */

/** la personne de départ : celle demandée si elle existe, sinon la fiche marquée « de départ », sinon la première */
function pa_root(PDO $pdo, int $root = 0): int
{
    if ($root > 0) { $s = $pdo->prepare('SELECT id FROM persons WHERE id=?'); $s->execute([$root]); if ($s->fetchColumn()) { return $root; } }
    return (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
}

/** parents de sang ou d'adoption de chaque enfant (pas les beaux-parents ni l'accueil), gardés le temps de la requête */
function pa_parent_map(PDO $pdo): array
{
    static $cache = [];
    $key = spl_object_id($pdo);
    if (isset($cache[$key])) { return $cache[$key]; }
    $map = [];
    foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id, fc.relation_to_partner1 AS r1, fc.relation_to_partner2 AS r2 FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) {
        foreach ([[$r['partner1_id'], $r['r1']], [$r['partner2_id'], $r['r2']]] as [$x, $rel]) {
            if ($x && !in_array((string) $rel, ['step', 'foster'], true)) { $map[(int) $r['child_id']][] = (int) $x; }
        }
    }
    return $cache[$key] = $map;
}

/** ancêtres d'une personne : id => nombre de générations (la personne elle-même = 0) */
function pa_ancestors(PDO $pdo, int $id, int $max = 40): array
{
    $pm = pa_parent_map($pdo);
    $out = [$id => 0]; $queue = [[$id, 0]];
    while ($queue) { [$x, $d] = array_shift($queue); if ($d >= $max) { continue; } foreach ($pm[$x] ?? [] as $p) { if (!isset($out[$p])) { $out[$p] = $d + 1; $queue[] = [$p, $d + 1]; } } }
    return $out;
}

/** le nom du lien de sang (« le cousin issu de germains ») : a = générations de X à l'ancêtre commun, b = de la racine */
function pa_kin_word(int $a, int $b, string $gender, bool $half): string
{
    if (!function_exists('qm_kin_label')) { require_once __DIR__ . '/question_more.php'; }
    return qm_kin_label($a, $b, $gender, $half);
}

/** sans l'article du début (« le cousin germain » → « cousin germain ») */
function pa_no_article(string $s): string
{
    return (string) preg_replace('/^(le |la |l’|l\')/u', '', $s);
}

function pa_person_names(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach ($pdo->query("SELECT id, gender, TRIM(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) AS name FROM persons WHERE id IN (" . implode(',', $ids) . ')') as $r) {
        $out[(int) $r['id']] = ['name' => (string) $r['name'] ?: 'Sans nom', 'gender' => (string) $r['gender']];
    }
    return $out;
}

/**
 * Le lien de sang de $id avec la racine $root : null s'il n'y en a pas.
 * ['label' => 'cousin issu de germains', 'a' =>, 'b' =>, 'via' => ['id', 'name'] | null, 'common' => [ids]]
 * « via » : le parent (ou l'enfant) de la racine par qui passe le lien, quand un seul côté y mène.
 */
function pa_blood_link(PDO $pdo, int $id, int $root, ?array $rootAnc = null): ?array
{
    if (!$id || !$root) { return null; }
    if ($id === $root) { return ['label' => 'personne de départ', 'a' => 0, 'b' => 0, 'via' => null, 'common' => [$root], 'self' => true]; }
    $ax = pa_ancestors($pdo, $id); $ay = $rootAnc ?? pa_ancestors($pdo, $root);
    $best = null;
    foreach ($ax as $anc => $a) { if (isset($ay[$anc])) { $s = $a + $ay[$anc]; if (!$best || $s < $best['sum']) { $best = ['anc' => $anc, 'a' => $a, 'b' => $ay[$anc], 'sum' => $s]; } } }
    if (!$best) { return null; }
    $commons = array_keys(array_filter($ax, static fn($a, $anc) => isset($ay[$anc]) && $a === $best['a'] && $ay[$anc] === $best['b'], ARRAY_FILTER_USE_BOTH));
    $half = false;
    if (count($commons) === 1 && $best['a'] > 0 && $best['b'] > 0) {
        foreach ($pdo->query('SELECT partner1_id AS x, partner2_id AS y FROM families WHERE partner1_id=' . (int) $commons[0] . ' OR partner2_id=' . (int) $commons[0]) as $c) {
            $sp = (int) $c['x'] === $commons[0] ? (int) $c['y'] : (int) $c['x'];
            if ($sp && !(isset($ax[$sp]) && isset($ay[$sp]))) { $half = true; break; }
        }
    }
    $g = (string) ($pdo->query('SELECT gender FROM persons WHERE id=' . $id)->fetchColumn() ?: 'unknown');
    $label = pa_no_article(pa_kin_word($best['a'], $best['b'], $g, $half));
    // par qui : le parent de la racine du côté de l'ancêtre commun (un seul côté), ou, pour un descendant, l'enfant de la racine
    $via = null;
    if ($best['b'] >= 1) {
        $sides = [];
        foreach (pa_parent_map($pdo)[$root] ?? [] as $p) { $pa = pa_ancestors($pdo, $p); foreach ($commons as $c) { if (isset($pa[$c])) { $sides[$p] = true; break; } } }
        // « par » seulement quand le lien passe par une autre personne : sur la fiche de la mère, pas « mère · par (elle-même) »
        if (count($sides) === 1 && (int) array_key_first($sides) !== $id) { $via = (int) array_key_first($sides); }
    } elseif ($best['a'] >= 2) {
        $pm = pa_parent_map($pdo); $cur = $id; $guard = 0;
        while ($guard++ < 60) { $up = null; foreach ($pm[$cur] ?? [] as $p) { $anc = pa_ancestors($pdo, $p); if (isset($anc[$root])) { $up = $p; break; } } if (!$up || $up === $root) { break; } $cur = $up; }
        if ($cur !== $id && $cur !== $root) { $via = $cur; }
    }
    $names = pa_person_names($pdo, $via ? [$via] : []);
    return ['label' => $label, 'a' => $best['a'], 'b' => $best['b'], 'common' => $commons, 'half' => $half,
        'via' => $via ? ['id' => $via, 'name' => $names[$via]['name'] ?? ''] : null];
}

/** conjoints d'une personne */
function pa_spouses(PDO $pdo, int $id): array
{
    $out = [];
    foreach ($pdo->query('SELECT partner1_id AS x, partner2_id AS y FROM families WHERE partner1_id=' . $id . ' OR partner2_id=' . $id) as $r) {
        $o = (int) $r['x'] === $id ? (int) $r['y'] : (int) $r['x']; if ($o) { $out[] = $o; }
    }
    return array_values(array_unique($out));
}

/** 🧭 le lien d'une fiche avec la personne de départ (sang, puis alliance) */
function pa_person_link(PDO $pdo, int $id, int $root = 0): array
{
    $root = pa_root($pdo, $root);
    if (!$id || !$root) { return ['root_id' => $root, 'link' => null]; }
    $names = pa_person_names($pdo, [$root]);
    $base = ['root_id' => $root, 'root_name' => $names[$root]['name'] ?? ''];
    $rootAnc = pa_ancestors($pdo, $root);
    $blood = pa_blood_link($pdo, $id, $root, $rootAnc);
    if ($blood) { return $base + ['link' => $blood + ['kind' => !empty($blood['self']) ? 'self' : 'blood']]; }
    // par alliance : le conjoint d'un parent de sang (« conjoint de : cousin germain »)
    foreach (pa_spouses($pdo, $id) as $sp) {
        $l = pa_blood_link($pdo, $sp, $root, $rootAnc);
        if ($l) { $n = pa_person_names($pdo, [$sp]); return $base + ['link' => ['kind' => 'spouse_of', 'label' => !empty($l['self']) ? 'conjoint(e) de la personne de départ' : 'conjoint(e) de : ' . $l['label'], 'through' => ['id' => $sp, 'name' => $n[$sp]['name'] ?? ''], 'via' => $l['via'] ?? null]]; }
    }
    // côté du conjoint de la personne de départ (« belle-famille »)
    foreach (pa_spouses($pdo, $root) as $sp) {
        $l = pa_blood_link($pdo, $id, $sp);
        if ($l && empty($l['self'])) { $n = pa_person_names($pdo, [$sp]); return $base + ['link' => ['kind' => 'in_law', 'label' => $l['label'] . ' (belle-famille)', 'through' => ['id' => $sp, 'name' => $n[$sp]['name'] ?? ''], 'via' => null]]; }
    }
    return $base + ['link' => null];
}

/** 🧭 les liens de plusieurs fiches d'un coup (colonne, arbres) : id => texte court, ou absent */
function pa_people_links(PDO $pdo, array $ids, int $root = 0): array
{
    $root = pa_root($pdo, $root);
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids)))), 0, 400);
    if (!$root || !$ids) { return ['root_id' => $root, 'links' => (object) []]; }
    $rootAnc = pa_ancestors($pdo, $root);
    $out = [];
    foreach ($ids as $id) {
        $l = pa_blood_link($pdo, $id, $root, $rootAnc);
        if ($l) { $out[$id] = !empty($l['self']) ? 'personne de départ' : $l['label']; continue; }
        foreach (pa_spouses($pdo, $id) as $sp) { $l2 = pa_blood_link($pdo, $sp, $root, $rootAnc); if ($l2) { $out[$id] = !empty($l2['self']) ? 'conjoint(e) de la personne de départ' : 'conjoint(e) de : ' . $l2['label']; break; } }
    }
    return ['root_id' => $root, 'links' => (object) $out];
}

/* ─── 🔍 Filtres et tri de la colonne Personnes ─── */

/** les deux côtés des ancêtres de la racine : ['all' => ids, 'father' => ids, 'mother' => ids] */
function pa_root_sides(PDO $pdo, int $root): array
{
    $all = array_keys(pa_ancestors($pdo, $root));
    $father = []; $mother = [];
    if (function_exists('sosa_parent_ids')) {
        [$f, $m] = sosa_parent_ids($pdo, $root);
        if ($f) { $father = array_keys(pa_ancestors($pdo, (int) $f)); }
        if ($m) { $mother = array_keys(pa_ancestors($pdo, (int) $m)); }
    }
    return ['all' => $all, 'father' => $father, 'mother' => $mother];
}

const PA_BIRTH_YEAR_SQL = "(SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1)";

/** [conditions SQL sur « p », paramètres] d'après la requête (gender, life, sosa, branch, group, label, century, noparents, nosource, research) */
function pa_people_filters(PDO $pdo, array $q): array
{
    $w = []; $params = [];
    $g = (string) ($q['gender'] ?? '');
    if (in_array($g, ['male', 'female'], true)) { $w[] = 'p.gender=:pa_g'; $params[':pa_g'] = $g; }
    elseif ($g === 'unknown') { $w[] = "(p.gender IS NULL OR p.gender NOT IN ('male','female'))"; }
    $life = (string) ($q['life'] ?? '');
    if (in_array($life, ['living', 'deceased', 'unknown'], true)) { $w[] = 'p.living_status=:pa_l'; $params[':pa_l'] = $life; }
    $sosa = (string) ($q['sosa'] ?? ''); $branch = (string) ($q['branch'] ?? '');
    if (in_array($sosa, ['in', 'out'], true) || in_array($branch, ['father', 'mother'], true)) {
        $root = pa_root($pdo, (int) ($q['root'] ?? 0));
        $sides = $root ? pa_root_sides($pdo, $root) : ['all' => [], 'father' => [], 'mother' => []];
        $list = static fn(array $ids) => $ids ? implode(',', array_map('intval', $ids)) : '0';
        if ($sosa === 'in') { $w[] = 'p.id IN (' . $list($sides['all']) . ')'; }
        if ($sosa === 'out') { $w[] = 'p.id NOT IN (' . $list($sides['all']) . ')'; }
        if ($branch === 'father') { $w[] = 'p.id IN (' . $list($sides['father']) . ')'; }
        if ($branch === 'mother') { $w[] = 'p.id IN (' . $list($sides['mother']) . ')'; }
    }
    $grp = (int) ($q['sgroup'] ?? 0);
    if ($grp > 0) { $w[] = 'p.surname_group_id=:pa_sg'; $params[':pa_sg'] = $grp; }
    $label = (int) ($q['label'] ?? 0);
    if ($label > 0) { $w[] = "EXISTS(SELECT 1 FROM label_links ll WHERE ll.entity_type='person' AND ll.entity_id=p.id AND ll.label_id=:pa_lb)"; $params[':pa_lb'] = $label; }
    $c = (int) ($q['century'] ?? 0);
    if ($c >= 10 && $c <= 21) { $w[] = PA_BIRTH_YEAR_SQL . ' BETWEEN :pa_c1 AND :pa_c2'; $params[':pa_c1'] = ($c - 1) * 100; $params[':pa_c2'] = ($c - 1) * 100 + 99; }
    elseif (($q['century'] ?? '') === 'none') { $w[] = PA_BIRTH_YEAR_SQL . ' IS NULL'; }
    if (!empty($q['noparents']) && $q['noparents'] !== '0') { $w[] = 'NOT EXISTS(SELECT 1 FROM family_children fc WHERE fc.child_id=p.id)'; }
    if (!empty($q['nosource']) && $q['nosource'] !== '0') {
        $w[] = "NOT EXISTS(SELECT 1 FROM source_links sl WHERE sl.entity_type='person' AND sl.entity_id=p.id)"
            . " AND NOT EXISTS(SELECT 1 FROM source_links sl JOIN events e ON e.id=sl.entity_id WHERE sl.entity_type='event' AND (e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)))";
    }
    if (!empty($q['research']) && $q['research'] !== '0' && pa_has_column($pdo, 'events', 'research_note')) {
        $w[] = "EXISTS(SELECT 1 FROM events e WHERE (e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id)) AND trim(COALESCE(e.research_note,''))<>'')";
    }
    return [$w, $params];
}

/** l'ordre SQL d'un tri choisi (name : comme avant) ; null = l'ordre habituel */
function pa_people_order(string $sort): ?string
{
    $name = fold_sort_sql('p.last_name') . ',' . fold_sort_sql('p.first_name') . ',p.id';
    return match ($sort) {
        'birth' => PA_BIRTH_YEAR_SQL . ' IS NULL, ' . PA_BIRTH_YEAR_SQL . ', ' . $name,
        'birth_desc' => PA_BIRTH_YEAR_SQL . ' IS NULL, ' . PA_BIRTH_YEAR_SQL . ' DESC, ' . $name,
        'modified' => 'p.updated_at DESC, p.id DESC',
        'created' => 'p.id DESC',
        default => null,
    };
}

/** trie des lignes déjà lues (recherche par nom : la pertinence d'abord, sauf si un tri est choisi) */
function pa_sort_rows(array $rows, string $sort): array
{
    if (!in_array($sort, ['birth', 'birth_desc', 'modified', 'created'], true)) { return $rows; }
    usort($rows, static function ($a, $b) use ($sort) {
        if ($sort === 'modified') { return strcmp((string) ($b['updated_at'] ?? ''), (string) ($a['updated_at'] ?? '')) ?: ((int) $b['id'] <=> (int) $a['id']); }
        if ($sort === 'created') { return (int) $b['id'] <=> (int) $a['id']; }
        $ya = $a['birth_year'] ?? null; $yb = $b['birth_year'] ?? null;
        if ($ya === null || $yb === null) { return ($ya === null) <=> ($yb === null); }
        return $sort === 'birth' ? ((int) $ya <=> (int) $yb) : ((int) $yb <=> (int) $ya);
    });
    return $rows;
}

function pa_has_column(PDO $pdo, string $table, string $col): bool
{
    static $cols = [];
    $k = spl_object_id($pdo) . ':' . $table;
    if (!isset($cols[$k])) { $cols[$k] = array_column($pdo->query("PRAGMA table_info({$table})")->fetchAll(PDO::FETCH_ASSOC), 'name'); }
    return in_array($col, $cols[$k], true);
}

/** ce que proposent les filtres : groupes de noms et étiquettes de personnes */
function pa_filter_choices(PDO $pdo): array
{
    $groups = $pdo->query('SELECT g.id, g.name, count(p.id) AS n FROM surname_groups g JOIN persons p ON p.surname_group_id=g.id GROUP BY g.id ORDER BY g.name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC);
    $labels = $pdo->query("SELECT l.id, l.name, l.color, count(ll.id) AS n FROM labels l JOIN label_links ll ON ll.label_id=l.id AND ll.entity_type='person' GROUP BY l.id ORDER BY l.name COLLATE NOCASE")->fetchAll(PDO::FETCH_ASSOC);
    return ['groups' => $groups, 'labels' => $labels];
}

/* ─── 👪 Fiche familiale (couple + enfants) ─── */

function pa_events_of(PDO $pdo, string $col, int $id, bool $kiosk): array
{
    $priv = pa_has_column($pdo, 'events', 'is_private') ? 'e.is_private' : '0';
    $st = $pdo->prepare("SELECT e.id, e.date_text, e.year, t.label AS type_label, t.gedcom_tag, {$priv} AS is_private, pl.name AS place_name, pl.county, pl.country
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.{$col}=? ORDER BY COALESCE(e.year,9999), e.id");
    $st->execute([$id]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    return array_values(array_filter($rows, static fn($r) => !$kiosk || !(int) $r['is_private']));
}

function pa_sheet_person(PDO $pdo, ?int $id, bool $kiosk): ?array
{
    if (!$id) { return null; }
    $st = $pdo->prepare('SELECT id, first_name, last_name, gender, living_status, occupation, is_private FROM persons WHERE id=?'); $st->execute([$id]);
    $p = $st->fetch(PDO::FETCH_ASSOC); if (!$p) { return null; }
    if ($kiosk && (int) $p['is_private']) { return ['id' => (int) $p['id'], 'name' => 'Fiche confidentielle', 'private' => true, 'events' => [], 'spouses' => []]; }
    $evs = pa_events_of($pdo, 'person_id', $id, $kiosk);
    $pick = static function (array $tags) use ($evs) { foreach ($evs as $e) { if (in_array($e['gedcom_tag'], $tags, true)) { return $e; } } return null; };
    $src = $pdo->prepare("SELECT DISTINCT s.id, s.title FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE (sl.entity_type='person' AND sl.entity_id=?) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=?)) ORDER BY s.title LIMIT 12");
    try { $src->execute([$id, $id]); $sources = $src->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $_) { $sources = []; }
    return ['id' => (int) $p['id'], 'name' => trim($p['first_name'] . ' ' . $p['last_name']) ?: 'Sans nom', 'gender' => $p['gender'], 'living_status' => $p['living_status'], 'occupation' => (string) $p['occupation'],
        'birth' => $pick(['BIRT']), 'baptism' => $pick(['CHR', 'BAPM']), 'death' => $pick(['DEAT']), 'burial' => $pick(['BURI']), 'sources' => $sources];
}

/** les unions d'une personne, chacune avec ses deux partenaires, ses événements de couple et ses enfants (et leurs conjoints) */
function pa_family_sheet(PDO $pdo, int $personId): array
{
    $kiosk = function_exists('kiosk_state') && kiosk_state()['on'];
    $fams = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id');
    $fams->execute([$personId, $personId]);
    $out = [];
    foreach ($fams->fetchAll(PDO::FETCH_ASSOC) as $f) {
        $fid = (int) $f['id'];
        $kids = $pdo->prepare('SELECT child_id FROM family_children WHERE family_id=? ORDER BY position, child_id'); $kids->execute([$fid]);
        $children = [];
        foreach ($kids->fetchAll(PDO::FETCH_COLUMN) as $cid) {
            $c = pa_sheet_person($pdo, (int) $cid, $kiosk); if (!$c) { continue; }
            $c['spouses'] = array_values(array_filter(array_map(static fn($s) => ($x = pa_person_names($pdo, [$s])[$s] ?? null) ? ['id' => $s, 'name' => $x['name']] : null, pa_spouses($pdo, (int) $cid))));
            $children[] = $c;
        }
        usort($children, static fn($a, $b) => ((int) ($a['birth']['year'] ?? 9999)) <=> ((int) ($b['birth']['year'] ?? 9999)));
        $fsrc = $pdo->prepare("SELECT DISTINCT s.id, s.title FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE (sl.entity_type='family' AND sl.entity_id=?) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE family_id=?)) ORDER BY s.title LIMIT 12");
        try { $fsrc->execute([$fid, $fid]); $fs = $fsrc->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $_) { $fs = []; }
        $out[] = ['id' => $fid, 'partner1' => pa_sheet_person($pdo, (int) $f['partner1_id'] ?: null, $kiosk), 'partner2' => pa_sheet_person($pdo, (int) $f['partner2_id'] ?: null, $kiosk),
            'events' => pa_events_of($pdo, 'family_id', $fid, $kiosk), 'children' => $children, 'sources' => $fs];
    }
    return ['person_id' => $personId, 'families' => $out];
}

/* ─── ⚡ Saisie rapide d'une famille ─── */

function pa_type_id(PDO $pdo, string $tag): int
{
    $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$tag]);
    return (int) $s->fetchColumn();
}

/** une personne de la saisie : {id} (relier) ou {first_name, last_name, gender} (créer) ; null si vide */
function pa_qf_person(PDO $pdo, $p, string $gender, array &$created): ?int
{
    if (!is_array($p)) { return null; }
    $id = (int) ($p['id'] ?? 0);
    if ($id > 0) { if (!person_exists($pdo, $id)) { throw new RuntimeException('Une des fiches choisies n’existe plus.'); } return $id; }
    $first = safe_text($p['first_name'] ?? ''); $last = safe_text($p['last_name'] ?? '');
    if ($first === '' && $last === '') { return null; }
    $g = in_array($p['gender'] ?? '', ['male', 'female', 'unknown'], true) ? (string) $p['gender'] : $gender;
    $row = save_person($pdo, ['first_name' => $first, 'last_name' => $last, 'gender' => $g, 'living_status' => in_array($p['living_status'] ?? '', ['living', 'deceased'], true) ? $p['living_status'] : 'unknown']);
    $created[] = (int) $row['id'];
    return (int) $row['id'];
}

function pa_qf_event(PDO $pdo, string $tag, array $where, string $date, string $place, array &$events): void
{
    $date = safe_text($date); $place = safe_text($place);
    if ($date === '' && $place === '') { return; }
    $type = pa_type_id($pdo, $tag); if (!$type) { return; }
    $r = add_event($pdo, $where + ['event_type_id' => $type, 'date_text' => $date, 'place_name' => $place]);
    $events[] = (int) ($r['id'] ?? 0);
}

/**
 * {father, mother, marriage: {date, place}, children: [{id | first_name, last_name, gender, birth_date, birth_place}]}
 * → tout dans la même écriture ; ce qui a été fait est rendu pour « ↶ Annuler » (pa_quick_family_undo).
 */
function pa_quick_family(PDO $pdo, array $data): array
{
    $created = []; $events = []; $links = [];
    $father = pa_qf_person($pdo, $data['father'] ?? null, 'male', $created);
    $mother = pa_qf_person($pdo, $data['mother'] ?? null, 'female', $created);
    if (!$father && !$mother) { throw new RuntimeException('Indique au moins le père ou la mère.'); }
    if ($father && $mother && $father === $mother) { throw new RuntimeException('Le père et la mère sont la même fiche.'); }
    $fatherLast = $father ? (string) $pdo->query('SELECT last_name FROM persons WHERE id=' . $father)->fetchColumn() : '';
    if ($father && $mother) {
        if (!couple_family_id($pdo, $father, $mother)) { add_relation($pdo, ['person_id' => $father, 'related_id' => $mother, 'relation_type' => 'spouse']); $links[] = [$father, $mother, 'spouse']; }
        $fid = couple_family_id($pdo, $father, $mother);
        $m = is_array($data['marriage'] ?? null) ? $data['marriage'] : [];
        if ($fid) { pa_qf_event($pdo, 'MARR', ['event_scope' => 'family', 'family_id' => $fid], (string) ($m['date'] ?? ''), (string) ($m['place'] ?? ''), $events); }
    }
    $kids = is_array($data['children'] ?? null) ? array_slice($data['children'], 0, 30) : [];
    $childIds = [];
    foreach ($kids as $k) {
        if (!is_array($k)) { continue; }
        if (empty($k['id']) && trim((string) ($k['last_name'] ?? '')) === '' && trim((string) ($k['first_name'] ?? '')) !== '') { $k['last_name'] = $fatherLast; }
        $cid = pa_qf_person($pdo, $k, 'unknown', $created); if (!$cid) { continue; }
        if ($cid === $father || $cid === $mother) { throw new RuntimeException('Un enfant ne peut pas être aussi le père ou la mère.'); }
        foreach (array_filter([$father, $mother]) as $par) {
            if (in_array($par, child_parent_ids($pdo, $cid), true)) { continue; }
            add_relation($pdo, ['person_id' => $cid, 'related_id' => $par, 'relation_type' => 'parent']); $links[] = [$cid, $par, 'parent'];
        }
        pa_qf_event($pdo, 'BIRT', ['event_scope' => 'person', 'person_id' => $cid], (string) ($k['birth_date'] ?? ''), (string) ($k['birth_place'] ?? ''), $events);
        $childIds[] = $cid;
    }
    log_change($pdo, 'person', $father ?: $mother, 'quick-family', 'Saisie rapide d’une famille (' . count($childIds) . ' enfant' . (count($childIds) > 1 ? 's' : '') . ')', null, ['created' => $created, 'events' => $events, 'links' => $links]);
    return ['father' => $father, 'mother' => $mother, 'children' => $childIds, 'created' => $created, 'events' => array_values(array_filter($events)), 'links' => $links];
}

/** défait une saisie rapide : événements ajoutés, liens ajoutés, fiches créées (dans cet ordre) */
function pa_quick_family_undo(PDO $pdo, array $data): array
{
    $created = array_map('intval', (array) ($data['created'] ?? []));
    foreach (array_map('intval', (array) ($data['events'] ?? [])) as $eid) { if ($eid && record_exists($pdo, 'events', $eid)) { delete_event($pdo, ['id' => $eid]); } }
    foreach (array_reverse((array) ($data['links'] ?? [])) as $l) {
        if (!is_array($l) || count($l) < 3) { continue; }
        [$a, $b, $t] = [(int) $l[0], (int) $l[1], (string) $l[2]];
        if (in_array($a, $created, true) || in_array($b, $created, true)) { continue; } // la fiche créée part avec ses liens
        try { remove_relation($pdo, ['person_id' => $a, 'related_id' => $b, 'relation_type' => $t]); } catch (Throwable $_) {}
    }
    foreach (array_reverse($created) as $pid) { if ($pid && person_exists($pdo, $pid)) { delete_person($pdo, ['id' => $pid]); } }
    return ['undone' => true, 'removed' => count($created)];
}

/* ─── 🧮 Deux naissances (ou deux décès) dans une même fiche ─── */

function pa_event_row(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT e.*, t.gedcom_tag, t.label AS type_label, pl.name AS place_name FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id=?');
    $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC); return $r ?: null;
}

/** garder « keep », « drop » devient une autre version dans « Date alternative » de keep (puis drop est supprimé, restaurable) */
function pa_event_keep(PDO $pdo, array $data): array
{
    $keep = pa_event_row($pdo, safe_int($data['keep_id'] ?? 0)); $drop = pa_event_row($pdo, safe_int($data['drop_id'] ?? 0));
    if (!$keep || !$drop || (int) $keep['id'] === (int) $drop['id']) { throw new RuntimeException('Événements introuvables.'); }
    if ($keep['gedcom_tag'] !== $drop['gedcom_tag'] || (int) $keep['person_id'] !== (int) $drop['person_id']) { throw new RuntimeException('Ces deux événements ne sont pas le même fait de la même fiche.'); }
    assert_person_unlocked($pdo, (int) $keep['person_id']);
    $other = trim(implode(' à ', array_filter([trim((string) $drop['date_text']), trim((string) ($drop['place_name'] ?? ''))])));
    $note = 'Autre version : ' . ($other !== '' ? $other : 'sans date ni lieu') . ($drop['description'] ? ' (' . mb_substr(trim((string) $drop['description']), 0, 120) . ')' : '');
    $before = (string) $keep['date_alternative'];
    $alt = mb_substr(trim($before !== '' ? $before . ' ; ' . $note : $note), 0, 480);
    $pdo->prepare('UPDATE events SET date_alternative=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$alt, (int) $keep['id']]);
    // les sources de l'autre version restent avec le fait gardé
    $pdo->prepare("INSERT INTO source_links(source_id, entity_type, entity_id, source_record_id, page, quality, note) SELECT source_id, 'event', ?, source_record_id, page, quality, note FROM source_links WHERE entity_type='event' AND entity_id=?")->execute([(int) $keep['id'], (int) $drop['id']]);
    log_change($pdo, 'event', (int) $keep['id'], 'update', 'Autre version gardée dans « ' . $keep['type_label'] . ' »', ['id' => (int) $keep['id'], 'date_alternative' => $before], ['id' => (int) $keep['id'], 'date_alternative' => $alt]);
    delete_event($pdo, ['id' => (int) $drop['id']]);
    return ['keep_id' => (int) $keep['id'], 'drop_id' => (int) $drop['id'], 'before_alt' => $before, 'alt' => $alt];
}

/** ↶ : l'autre version revient (restore_last_delete côté client) ; ici, la « Date alternative » d'avant et les sources copiées */
function pa_event_keep_undo(PDO $pdo, array $data): array
{
    $keep = pa_event_row($pdo, safe_int($data['keep_id'] ?? 0)); if (!$keep) { throw new RuntimeException('Événement introuvable.'); }
    $pdo->prepare('UPDATE events SET date_alternative=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([safe_text($data['before_alt'] ?? ''), (int) $keep['id']]);
    $drop = safe_int($data['drop_id'] ?? 0);
    if ($drop && record_exists($pdo, 'events', $drop)) {
        $pdo->prepare("DELETE FROM source_links WHERE entity_type='event' AND entity_id=? AND id IN (SELECT a.id FROM source_links a JOIN source_links b ON b.entity_type='event' AND b.entity_id=? AND b.source_record_id=a.source_record_id AND COALESCE(b.page,'')=COALESCE(a.page,'') WHERE a.entity_type='event' AND a.entity_id=?)")
            ->execute([(int) $keep['id'], $drop, (int) $keep['id']]);
    }
    return ['keep_id' => (int) $keep['id']];
}

/* ─── 🕘 Remettre un seul champ d'une ancienne version ─── */

const PA_RESTORABLE = [
    'person' => ['persons', ['first_name', 'middle_name', 'last_name', 'prefix', 'suffix', 'gender', 'living_status', 'occupation', 'height_text', 'physical_description', 'eye_color', 'skin_color', 'nationality', 'ethnicity', 'reference_number', 'verify_status', 'surname_group_id', 'is_private', 'outside_genealogy', 'spouse_status', 'children_status', 'mort_pour_la_france']],
    'event' => ['events', ['date_text', 'date_alternative', 'title', 'description', 'address', 'extra_info', 'former_place_name', 'former_country', 'first_name', 'last_name', 'place_id', 'event_type_id', 'date_calendar', 'fact_confidence', 'is_private', 'research_note']],
];

function pa_restore_field(PDO $pdo, array $data): array
{
    $type = (string) ($data['entity_type'] ?? ''); $id = safe_int($data['id'] ?? 0); $field = (string) ($data['field'] ?? '');
    if (!isset(PA_RESTORABLE[$type]) || !$id || !in_array($field, PA_RESTORABLE[$type][1], true)) { throw new RuntimeException('Ce champ ne peut pas être remis.'); }
    [$table] = PA_RESTORABLE[$type];
    if (!pa_has_column($pdo, $table, $field)) { throw new RuntimeException('Ce champ n’existe plus.'); }
    $s = $pdo->prepare("SELECT * FROM {$table} WHERE id=?"); $s->execute([$id]); $before = $s->fetch(PDO::FETCH_ASSOC);
    if (!$before) { throw new RuntimeException('Introuvable : la fiche a peut-être été supprimée.'); }
    if ($type === 'person') { assert_person_unlocked($pdo, $id); } elseif (!empty($before['person_id'])) { assert_person_unlocked($pdo, (int) $before['person_id']); }
    $value = $data['value'] ?? null;
    $value = $value === null ? null : (is_scalar($value) ? (string) $value : null);
    if (in_array($field, ['surname_group_id', 'place_id', 'event_type_id', 'is_private', 'outside_genealogy'], true)) { $value = $value === null || $value === '' ? null : (string) (int) $value; }
    if ($field === 'event_type_id' && !$value) { throw new RuntimeException('Le type ne peut pas être vide.'); }
    $pdo->prepare("UPDATE {$table} SET {$field}=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$value, $id]);
    $s->execute([$id]); $after = $s->fetch(PDO::FETCH_ASSOC);
    if ($type === 'person' && function_exists('rebuild_search')) { rebuild_search($pdo, $id); }
    log_change($pdo, $type, $id, 'update', 'Champ remis d’une ancienne version : ' . $field, $before, $after);
    return ['id' => $id, 'field' => $field, 'old' => $before[$field], 'value' => $after[$field]];
}
