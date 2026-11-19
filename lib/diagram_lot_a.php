<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 Diagrammes, lot A (assets/js/heritage-diagram-lot-a.js et les types qu'il complète) : les données de l'arbre.
 * GET api.php?action=diagram_lot_a&what=…  (+ le groupe de personnes, la période et les critères « ＋ Critère » communs :
 * dg_pop, dg_root, dg_gens, dg_label, dg_list, dg_q, dg_ids, dg_from, dg_to, rules, match — lib/diagram_options.php)
 *  - quarters      root, gens (3, 4, 5 → 8, 16, 32 quartiers) : les ancêtres de la génération et leurs armoiries (blasonnement, image) ;
 *  - name_groups   : les groupes de noms (surname_groups) et le nombre de fiches ;
 *  - variants      group | name, events (all, BIRT, MARR, DEAT) : les formes d'un nom, leurs années, le nombre d'actes ;
 *  - familygraph   points (couples | persons), color (surname | century) : toute la famille, un point par couple (ou par personne) ;
 *  - implexe       root : l'ascendance (filiations biologiques seulement) pour les boucles d'implexe et le coefficient ;
 *  - census_list   : les recensements par commune et par année ;  census_pyr place, year[, year2] : les âges et sexes recensés ;
 *  - sets_more     : les ensembles « trouvé dans telle source » ;  upset keys (2 à 8) : chaque combinaison d'ensembles, ses personnes.
 * Lecture seule, requêtes préparées, tout est borné ; une valeur inconnue est refusée (422). En consultation : ni les vivants
 * ni les fiches confidentielles.
 */

require_once __DIR__ . '/diagram_options.php'; // dgo_request, dgo_restrict, dgo_year_ok ; dgn_* (diagram_genea.php)

const DLA_WHAT = ['quarters', 'name_groups', 'variants', 'familygraph', 'implexe', 'census_list', 'census_pyr', 'sets_more', 'upset'];

function dla_bad(string $m): never { throw new LcndaBadInput($m); }
/** un texte calculé ici et montré dans la page : dans la langue choisie (assets/i18n/src/diagrammes-lot-a.tsv) */
function dla_t(string $s, array $v = []): string { return function_exists('i18n_t') ? i18n_t($s, $v) : strtr($s, array_combine(array_map(static fn($k) => '{' . $k . '}', array_keys($v)), array_map('strval', array_values($v))) ?: []); }

function dla_int(array $q, string $k, int $def, int $min, int $max): int
{
    $v = $q[$k] ?? '';
    if ($v === '' || $v === null) { return $def; }
    if (!is_scalar($v) || !preg_match('/^-?\d{1,10}$/', (string) $v)) { dla_bad('Nombre de mauvaise forme (' . $k . ').'); }
    return max($min, min($max, (int) $v));
}

function dla_enum(array $q, string $k, array $ok, string $def): string
{
    $v = $q[$k] ?? $def;
    if (!is_scalar($v)) { dla_bad('Réglage de mauvaise forme (' . $k . ').'); }
    $v = (string) $v; if ($v === '') { return $def; }
    if (!in_array($v, $ok, true)) { dla_bad('Réglage inconnu (' . $k . ').'); }
    return $v;
}

/** les personnes gardées : le groupe commun (dg_*), croisé avec les critères (rules) ; null = tout le monde ; en consultation, sans vivants ni fiches confidentielles */
function dla_people(PDO $pdo, array $q): ?array
{
    $set = dgo_restrict($pdo, null);
    $raw = is_scalar($q['rules'] ?? null) ? trim((string) $q['rules']) : '';
    if ($raw !== '') {
        if (strlen($raw) > 20000) { dla_bad('Trop de critères.'); }
        $dec = json_decode($raw, true); if (!is_array($dec)) { dla_bad('Critères de mauvaise forme.'); }
        require_once __DIR__ . '/diagram_appcount.php';
        if (!function_exists('my_list_clean_definition')) { require_once __DIR__ . '/my_lists.php'; }
        $match = (($q['match'] ?? '') === 'any') ? 'any' : 'all';
        $rules = array_slice(my_list_clean_definition(['rules' => array_slice(array_values($dec), 0, 30), 'match' => $match], 'persons')['rules'], 0, 30);
        if ($rules) { $ids = dac_rule_ids($pdo, $rules, $match); $set = $set === null ? $ids : array_intersect_key($set, $ids); }
    }
    if (dla_kiosk()) {
        $hide = [];
        $hasPriv = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
        foreach ($pdo->query("SELECT id FROM persons WHERE living_status='living'" . ($hasPriv ? ' OR COALESCE(is_private,0)=1' : '')) as $r) { $hide[(int) $r['id']] = true; }
        if ($set === null) { $set = []; foreach ($pdo->query('SELECT id FROM persons') as $r) { $set[(int) $r['id']] = true; } }
        $set = array_diff_key($set, $hide);
    }
    return $set;
}
function dla_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }
function dla_in(?array $set, int $id): bool { return $set === null || isset($set[$id]); }

/** nom, sexe, années de naissance et de décès de quelques personnes */
function dla_who(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids)))); $out = [];
    foreach (array_chunk($ids, 400) as $ch) {
        $in = implode(',', $ch);
        foreach ($pdo->query("SELECT id, first_name, last_name, gender, living_status FROM persons WHERE id IN ($in)") as $r) {
            $out[(int) $r['id']] = ['name' => dgn_name($r), 'first' => mb_substr(trim((string) $r['first_name']), 0, 60), 'last' => mb_substr(trim((string) $r['last_name']), 0, 60), 'sex' => $r['gender'] === 'male' ? 'h' : ($r['gender'] === 'female' ? 'f' : ''), 'living' => $r['living_status'] === 'living', 'by' => null, 'dy' => null];
        }
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag AS tag, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($in) AND e.year IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY (t.gedcom_tag IN ('BIRT','DEAT')) DESC, e.id") as $e) {
            $p = (int) $e['person_id']; if (!isset($out[$p])) { continue; }
            $k = in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'by' : 'dy'; $out[$p][$k] ??= (int) $e['year'];
        }
    }
    return $out;
}
function dla_years(array $w): string
{
    if ($w['by'] === null && $w['dy'] === null) { return ''; }
    return ($w['by'] ?? '?') . '–' . ($w['dy'] ?? ($w['living'] ? '' : '?'));
}

/* ═════════ 🛡 Tableau de quartiers : les ancêtres d'une génération et leurs armoiries ═════════ */
function dla_quarters(PDO $pdo, array $q): array
{
    $root = dgn_root($pdo, dla_int($q, 'root', 0, 0, PHP_INT_MAX)); if (!$root) { return ['rows' => [], 'root_name' => '']; }
    $g = dla_int($q, 'gens', 4, 3, 5); // 3 → 8 quartiers (arrière-grands-parents), 4 → 16, 5 → 32
    $map = dgn_sosa($pdo, $root, $g + 1, 200); $keep = dla_people($pdo, $q);
    $want = array_filter($map, static fn($pid, $s) => $s === 1 || ($s >= 2 ** $g && $s < 2 ** ($g + 1)), ARRAY_FILTER_USE_BOTH);
    $who = dla_who($pdo, array_values($want));
    $coats = []; $coatIds = [];
    if ($want) {
        try {
            $in = implode(',', array_map('intval', array_values($want)));
            foreach ($pdo->query("SELECT cp.person_id, c.id, c.title, c.blazon, c.motto FROM coat_of_arms_people cp JOIN coats_of_arms c ON c.id=cp.coat_id WHERE cp.person_id IN ($in) ORDER BY cp.id") as $r) {
                $p = (int) $r['person_id']; if (isset($coats[$p])) { continue; }
                $coats[$p] = ['id' => (int) $r['id'], 'title' => mb_substr(trim((string) $r['title']), 0, 120), 'blazon' => mb_substr(trim((string) $r['blazon']), 0, 400), 'motto' => mb_substr(trim((string) $r['motto']), 0, 120), 'img' => ''];
                $coatIds[(int) $r['id']] = true;
            }
            if ($coatIds) {
                $ids = array_keys($coatIds);
                $s = $pdo->prepare("SELECT cm.collection_id, m.filename, m.thumbnail, m.media_type FROM family_collection_media cm JOIN media m ON m.id=cm.media_id WHERE cm.collection_type='coat_of_arms' AND cm.collection_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY cm.position, cm.id');
                $s->execute($ids); $img = [];
                foreach ($s->fetchAll() as $m) { $f = (string) ($m['thumbnail'] ?: $m['filename']); if (!isset($img[(int) $m['collection_id']]) && dla_safe_file($f) && preg_match('/\.(png|jpe?g|gif|webp|svg)$/i', $f)) { $img[(int) $m['collection_id']] = $f; } }
                foreach ($coats as $p => $c) { $coats[$p]['img'] = $img[$c['id']] ?? ''; }
            }
        } catch (Throwable $_) { $coats = []; } // base sans les tables des armoiries
    }
    $rows = [];
    for ($s = 2 ** $g; $s < 2 ** ($g + 1); $s++) {
        $pid = (int) ($want[$s] ?? 0); $w = $pid && dla_in($keep, $pid) ? ($who[$pid] ?? null) : null; $c = $w ? ($coats[$pid] ?? null) : null;
        $rows[] = ['sosa' => $s, 'name' => $w['name'] ?? '', 'dates' => $w ? dla_years($w) : '', 'coat' => $c['title'] ?? '', 'blazon' => $c['blazon'] ?? '', 'img' => $c && $c['img'] !== '' ? 'media/' . $c['img'] : '', 'pid' => $w ? $pid : 0];
    }
    $rw = $who[$root] ?? ['name' => dla_t('Sans nom')];
    return ['rows' => $rows, 'root_name' => $rw['name'], 'root_coat' => $coats[$root]['title'] ?? '', 'found' => count(array_filter($rows, static fn($r) => $r['name'] !== '')), 'with_coat' => count(array_filter($rows, static fn($r) => $r['coat'] !== ''))];
}
function dla_safe_file(string $f): bool { return $f !== '' && strlen($f) < 240 && !str_contains($f, '..') && preg_match('#^[\w\-. /]+$#u', $f) === 1 && $f[0] !== '/'; }

/* ═════════ 🌿 Arbre des variantes d'un nom ═════════ */
function dla_name_groups(PDO $pdo): array
{
    $out = [];
    try { foreach ($pdo->query('SELECT g.id, g.name, (SELECT count(*) FROM persons p WHERE p.surname_group_id=g.id) AS n FROM surname_groups g ORDER BY g.name COLLATE NOCASE LIMIT 400') as $r) { if ((int) $r['n'] > 0) { $out[] = ['id' => (int) $r['id'], 'name' => mb_substr((string) $r['name'], 0, 80), 'n' => (int) $r['n']]; } } } catch (Throwable $_) {}
    $top = [];
    foreach ($pdo->query("SELECT trim(last_name) AS l, count(*) AS n FROM persons WHERE trim(COALESCE(last_name,''))<>'' GROUP BY lower(trim(last_name)) ORDER BY n DESC LIMIT 40") as $r) { $top[] = ['name' => mb_substr((string) $r['l'], 0, 80), 'n' => (int) $r['n']]; }
    return ['groups' => $out, 'names' => $top];
}
function dla_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $t = class_exists('Normalizer') ? (string) Normalizer::normalize($s, Normalizer::FORM_D) : $s;
    return (string) preg_replace('/\p{Mn}+/u', '', $t);
}
function dla_variants(PDO $pdo, array $q): array
{
    $gid = dla_int($q, 'group', 0, 0, PHP_INT_MAX);
    $name = is_scalar($q['name'] ?? null) ? trim((string) $q['name']) : '';
    if (mb_strlen($name) > 80) { dla_bad('Nom trop long (80 lettres au plus).'); }
    $ev = dla_enum($q, 'events', ['all', 'BIRT', 'MARR', 'DEAT'], 'all');
    $keep = dla_people($pdo, $q); $opt = dgo_request();
    $people = [];
    if ($gid) { $s = $pdo->prepare('SELECT id, last_name FROM persons WHERE surname_group_id=?'); $s->execute([$gid]); foreach ($s->fetchAll() as $r) { $people[(int) $r['id']] = trim((string) $r['last_name']); } }
    elseif ($name !== '') {
        $f = dla_fold($name);
        foreach ($pdo->query("SELECT p.id, p.last_name, p.surname_group_id FROM persons p WHERE trim(COALESCE(p.last_name,''))<>''") as $r) { if (dla_fold((string) $r['last_name']) === $f) { $people[(int) $r['id']] = trim((string) $r['last_name']); if ($r['surname_group_id'] && !$gid) { $gid = (int) $r['surname_group_id']; } } }
        foreach ($pdo->query("SELECT person_id, last_name FROM name_variants WHERE trim(COALESCE(last_name,''))<>''") as $r) { if (dla_fold((string) $r['last_name']) === $f && !isset($people[(int) $r['person_id']])) { $people[(int) $r['person_id']] = ''; } }
        if ($gid) { $s = $pdo->prepare('SELECT id, last_name FROM persons WHERE surname_group_id=?'); $s->execute([$gid]); foreach ($s->fetchAll() as $r) { $people[(int) $r['id']] ??= trim((string) $r['last_name']); } }
        foreach ($people as $id => $l) { if ($l === '') { $s = $pdo->prepare('SELECT last_name FROM persons WHERE id=?'); $s->execute([$id]); $people[$id] = trim((string) $s->fetchColumn()); } }
    } else { dla_bad('Choisis un groupe de noms ou écris un nom.'); }
    $people = array_filter($people, static fn($l, $id) => dla_in($keep, (int) $id) && $l !== '', ARRAY_FILTER_USE_BOTH);
    $forms = []; // clé repliée → {form, from, to, count, persons, sources}
    $add = static function (string $form, ?int $y, int $acts, string $src = '') use (&$forms): void {
        $form = mb_substr(trim($form), 0, 80); if ($form === '') { return; }
        $k = dla_fold($form); $f = $forms[$k] ?? ['form' => $form, 'from' => null, 'to' => null, 'count' => 0, 'sources' => []];
        if ($y !== null && $y > -3000 && $y < 2200) { $f['from'] = $f['from'] === null ? $y : min($f['from'], $y); $f['to'] = $f['to'] === null ? $y : max($f['to'], $y); }
        $f['count'] += $acts; if ($src !== '' && count($f['sources']) < 3 && !in_array($src, $f['sources'], true)) { $f['sources'][] = mb_substr($src, 0, 80); }
        $forms[$k] = $f;
    };
    if ($people) {
        foreach (array_chunk(array_keys($people), 400) as $ch) {
            $in = implode(',', array_map('intval', $ch));
            $tags = $ev === 'all' ? '' : ($ev === 'BIRT' ? " AND t.gedcom_tag IN ('BIRT','CHR','BAPM')" : ($ev === 'DEAT' ? " AND t.gedcom_tag IN ('DEAT','BURI')" : " AND t.gedcom_tag='MARR'"));
            // les actes de chaque personne, sous la forme de son nom (les mariages : par les époux)
            foreach ($pdo->query("SELECT COALESCE(e.person_id, CASE WHEN f.partner1_id IN ($in) THEN f.partner1_id ELSE f.partner2_id END) AS pid, e.year, (SELECT count(*) FROM source_links s WHERE s.entity_type='event' AND s.entity_id=e.id) AS ns
                FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
                WHERE (e.person_id IN ($in) OR f.partner1_id IN ($in) OR f.partner2_id IN ($in))$tags") as $r) {
                $pid = (int) $r['pid']; if (!isset($people[$pid])) { continue; } $y = $r['year'] !== null ? (int) $r['year'] : null;
                if (($opt['from'] !== null || $opt['to'] !== null) && !dgo_year_ok($y)) { continue; }
                $add($people[$pid], $y, max(1, (int) $r['ns']));
            }
            foreach ($pdo->query("SELECT nv.person_id, nv.last_name, nv.from_year, nv.to_year, nv.date_text, COALESCE(nv.source_note,'') AS note, COALESCE(s.title,'') AS src FROM name_variants nv LEFT JOIN sources s ON s.id=nv.source_id WHERE nv.person_id IN ($in) AND trim(COALESCE(nv.last_name,''))<>''") as $r) {
                $y1 = $r['from_year'] !== null ? (int) $r['from_year'] : (preg_match('/\b(\d{3,4})\b/', (string) $r['date_text'], $m) ? (int) $m[1] : null); $y2 = $r['to_year'] !== null ? (int) $r['to_year'] : null;
                if (($opt['from'] !== null || $opt['to'] !== null) && !dgo_year_ok($y1 ?? $y2)) { continue; }
                $src = trim((string) $r['src']) ?: trim((string) $r['note']);
                $add((string) $r['last_name'], $y1, 1, $src); if ($y2 !== null) { $add((string) $r['last_name'], $y2, 0); }
            }
        }
        foreach ($people as $l) { $k = dla_fold($l); if (!isset($forms[$k])) { $add($l, null, 0); } } // une forme portée sans acte daté
    }
    $groupName = '';
    if ($gid) { $s = $pdo->prepare('SELECT name FROM surname_groups WHERE id=?'); $s->execute([$gid]); $groupName = (string) ($s->fetchColumn() ?: ''); }
    $rows = array_values(array_map(static fn($f) => ['form' => $f['form'], 'from' => $f['from'] === null ? '' : (string) $f['from'], 'to' => $f['to'] === null ? '' : (string) $f['to'], 'count' => $f['count'], 'parent' => '', 'source' => implode(' ; ', $f['sources'])], $forms));
    usort($rows, static fn($a, $b) => ((int) ($a['from'] ?: 9999)) <=> ((int) ($b['from'] ?: 9999)) ?: strcmp($a['form'], $b['form']));
    return ['rows' => array_slice($rows, 0, 120), 'group' => $groupName ?: $name, 'people' => count($people)];
}

/* ═════════ 🕸 Toute la famille, un point par couple ═════════ */
function dla_familygraph(PDO $pdo, array $q): array
{
    $points = dla_enum($q, 'points', ['couples', 'persons'], 'couples');
    $by = dla_enum($q, 'color', ['surname', 'century'], 'surname');
    $keep = dla_people($pdo, $q);
    $fam = []; $partnerOf = [];
    foreach ($pdo->query('SELECT id, partner1_id AS a, partner2_id AS b FROM families') as $r) {
        $a = (int) $r['a']; $b = (int) $r['b'];
        if (!(($a && dla_in($keep, $a)) || ($b && dla_in($keep, $b)))) { continue; }
        $fam[(int) $r['id']] = ['a' => $a, 'b' => $b, 'kids' => [], 'y' => null];
        foreach ([$a, $b] as $p) { if ($p) { $partnerOf[$p][] = (int) $r['id']; } }
    }
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children ORDER BY position, id') as $r) { $f = (int) $r['family_id']; if (isset($fam[$f]) && dla_in($keep, (int) $r['child_id'])) { $fam[$f]['kids'][] = (int) $r['child_id']; } }
    foreach ($pdo->query("SELECT e.family_id, min(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id IS NOT NULL AND e.year IS NOT NULL AND t.gedcom_tag IN ('MARR','MARB','MARC','ENGA') GROUP BY e.family_id") as $r) { if (isset($fam[(int) $r['family_id']])) { $fam[(int) $r['family_id']]['y'] = (int) $r['y']; } }
    $ids = []; foreach ($fam as $f) { foreach ([$f['a'], $f['b'], ...$f['kids']] as $p) { if ($p) { $ids[$p] = true; } } }
    $who = dla_who($pdo, array_keys($ids));
    $century = static function (?int $y): string { if ($y === null) { return dla_t('Date inconnue'); } return dla_t('{n}e siècle', ['n' => (int) ceil($y / 100)]); };
    $nodes = []; $links = []; $seen = [];
    if ($points === 'couples') {
        $label = static function (array $f) use ($who): string { $n = array_values(array_filter([$f['a'] ? ($who[$f['a']]['name'] ?? '') : '', $f['b'] ? ($who[$f['b']]['name'] ?? '') : ''])); return $n ? implode(' × ', $n) : dla_t('Couple'); };
        $nameOf = [];
        foreach ($fam as $id => $f) {
            $base = $label($f); $n = $base; $k = 2; while (isset($seen[mb_strtolower($n)])) { $n = $base . ' (' . $k++ . ')'; } $seen[mb_strtolower($n)] = true; $nameOf[$id] = $n;
            $first = $who[$f['a']] ?? $who[$f['b']] ?? null; $sexA = $who[$f['a']]['sex'] ?? '';
            $sur = ($sexA === 'f' ? ($who[$f['b']]['last'] ?? '') : '') ?: ($who[$f['a']]['last'] ?? '') ?: ($who[$f['b']]['last'] ?? '');
            $y = $f['y'] ?? (isset($first['by']) && $first['by'] ? $first['by'] + 25 : null);
            $nodes[] = ['name' => $n, 'group' => $by === 'surname' ? ($sur !== '' ? mb_strtoupper($sur) : dla_t('Nom inconnu')) : $century($y)];
            if (count($nodes) >= 800) { break; }
        }
        foreach ($fam as $id => $f) { if (!isset($nameOf[$id])) { continue; }
            foreach ($f['kids'] as $c) { foreach ($partnerOf[$c] ?? [] as $g) { if ($g === $id || !isset($nameOf[$g])) { continue; }
                $links[] = ['a' => $nameOf[$id], 'b' => $nameOf[$g], 'kind' => $who[$c]['name'] ?? '']; if (count($links) >= 3000) { break 3; } } } }
    } else {
        $nm = []; foreach (array_keys($ids) as $p) { if (!isset($who[$p])) { continue; } $base = $who[$p]['name']; $n = $base; $k = 2; while (isset($seen[mb_strtolower($n)])) { $n = $base . ' (' . $k++ . ')'; } $seen[mb_strtolower($n)] = true; $nm[$p] = $n;
            $nodes[] = ['name' => $n, 'group' => $by === 'surname' ? (($who[$p]['last'] ?? '') !== '' ? mb_strtoupper($who[$p]['last']) : dla_t('Nom inconnu')) : $century($who[$p]['by'])]; if (count($nodes) >= 800) { break; } }
        foreach ($fam as $f) {
            if ($f['a'] && $f['b'] && isset($nm[$f['a']], $nm[$f['b']])) { $links[] = ['a' => $nm[$f['a']], 'b' => $nm[$f['b']], 'kind' => dla_t('époux')]; }
            foreach ($f['kids'] as $c) { foreach ([$f['a'], $f['b']] as $p) { if ($p && isset($nm[$p], $nm[$c])) { $links[] = ['a' => $nm[$p], 'b' => $nm[$c], 'kind' => dla_t('enfant')]; } } }
            if (count($links) >= 3000) { break; }
        }
    }
    return ['nodes' => $nodes, 'links' => array_slice($links, 0, 3000), 'couples' => count($fam)];
}

/* ═════════ 🔁 Boucles d'implexe : l'ascendance biologique ═════════ */
function dla_implexe(PDO $pdo, array $q): array
{
    $root = dgn_root($pdo, dla_int($q, 'root', 0, 0, PHP_INT_MAX)); if (!$root) { dla_bad('Choisis une personne.'); }
    $gender = []; foreach ($pdo->query('SELECT id, gender FROM persons') as $r) { $gender[(int) $r['id']] = (string) $r['gender']; }
    $par = [];
    // filiations biologiques seulement (une adoption ou un enfant du conjoint ne compte pas dans le calcul)
    foreach ($pdo->query("SELECT fc.child_id, f.partner1_id, f.partner2_id, COALESCE(fc.relation_to_partner1,'biological') AS r1, COALESCE(fc.relation_to_partner2,'biological') AS r2 FROM family_children fc JOIN families f ON f.id=fc.family_id") as $l) {
        $c = (int) $l['child_id'];
        foreach ([['partner1_id', 'r1'], ['partner2_id', 'r2']] as [$col, $rk]) {
            $p = (int) ($l[$col] ?? 0); if (!$p || $p === $c || !in_array(strtolower((string) $l[$rk]), ['biological', 'birth', ''], true)) { continue; }
            if (count($par[$c] ?? []) < 2 && !in_array($p, $par[$c] ?? [], true)) { $par[$c][] = $p; }
        }
    }
    $set = [$root => true]; $queue = [$root]; $head = 0;
    while ($head < count($queue) && count($set) < 6000) { $x = $queue[$head++]; foreach ($par[$x] ?? [] as $p) { if (!isset($set[$p])) { $set[$p] = true; $queue[] = $p; } } }
    $who = dla_who($pdo, array_keys($set)); $hide = dla_kiosk() ? dla_people($pdo, []) : null; $nodes = [];
    foreach (array_keys($set) as $id) {
        if (!isset($who[$id])) { continue; }
        $masked = $hide !== null && !isset($hide[$id]);
        $nodes[$id] = ['n' => $masked ? dla_t('Personne cachée') : $who[$id]['name'], 's' => ($gender[$id] ?? '') === 'male' ? 'h' : (($gender[$id] ?? '') === 'female' ? 'f' : ''), 'y' => $masked ? '' : dla_years($who[$id]), 'p' => array_values(array_filter($par[$id] ?? [], static fn($p) => isset($set[$p])))];
    }
    return ['root' => $root, 'root_name' => $nodes[$root]['n'] ?? '', 'nodes' => $nodes];
}

/* ═════════ 🔺 Recensements : par commune et par année ; les âges et sexes recensés ═════════ */
function dla_census_list(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query("SELECT cr.place_id, COALESCE(pl.name, NULLIF(trim(cr.address),''), 'Lieu inconnu') AS place, cr.year, count(cm.id) AS n FROM census_records cr LEFT JOIN places pl ON pl.id=cr.place_id LEFT JOIN census_members cm ON cm.census_id=cr.id
        GROUP BY COALESCE(cr.place_id, -1), CASE WHEN cr.place_id IS NULL THEN lower(trim(COALESCE(cr.address,''))) ELSE '' END, cr.year HAVING n>0 ORDER BY place COLLATE NOCASE, cr.year LIMIT 2000") as $r) {
        $out[] = ['place_id' => $r['place_id'] !== null ? (int) $r['place_id'] : 0, 'place' => mb_substr((string) $r['place'], 0, 100), 'year' => (int) $r['year'], 'n' => (int) $r['n']];
    }
    return ['items' => $out];
}
/** l'âge écrit dans un recensement (« 34 », « 34 ans », « 6 mois », « 1 an 1/2 ») → années ; null si illisible */
function dla_age(string $t): ?float
{
    $t = mb_strtolower(trim($t)); if ($t === '') { return null; }
    if (preg_match('/^(\d{1,3})(?:[.,](\d))?\s*(an|ans|a)?\b/u', $t, $m) && !preg_match('/^\d+\s*(mois|m\b|j|jours|sem)/u', $t)) { $v = (float) $m[1] + (isset($m[2]) && $m[2] !== '' ? (int) $m[2] / 10 : 0); return $v <= 120 ? $v : null; }
    if (preg_match('/^(\d{1,2})\s*(mois|m\b)/u', $t, $m)) { return (int) $m[1] / 12; }
    if (preg_match('/^(\d{1,3})\s*(j|jours|sem)/u', $t)) { return 0.0; }
    return null;
}
function dla_sex_word(string $role, string $status, string $name): string
{
    $t = mb_strtolower($role . ' ' . $status);
    if (preg_match('/\b(épouse|epouse|femme|fille|veuve|mère|mere|belle-mère|servante|domestique femme|nièce|niece|petite-fille|sœur|soeur|bonne|cuisinière|ouvrière)\b/u', $t)) { return 'f'; }
    if (preg_match('/\b(époux|epoux|mari|fils|veuf|père|pere|beau-père|domestique homme|neveu|petit-fils|frère|frere|garçon|ouvrier|chef)\b/u', $t)) { return 'h'; }
    return '';
}
function dla_census_pyr(PDO $pdo, array $q): array
{
    $place = dla_int($q, 'place', 0, 0, PHP_INT_MAX); $years = array_values(array_unique(array_filter([dla_int($q, 'year', 0, 0, 2200), dla_int($q, 'year2', 0, 0, 2200)])));
    if (!$years) { dla_bad('Choisis un recensement (commune et année).'); }
    $keep = dla_people($pdo, $q); $grp = dgo_request()['pop'] !== '' || (is_scalar($q['rules'] ?? null) && trim((string) $q['rules']) !== '');
    $rows = []; $skipped = 0;
    $s = $pdo->prepare("SELECT cr.year, cm.display_name, cm.age_text, cm.household_position, cm.personal_status, cm.person_id, p.gender, p.first_name, p.last_name FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id LEFT JOIN persons p ON p.id=cm.person_id
        WHERE cr.year=? AND " . ($place ? 'cr.place_id=?' : 'cr.place_id IS NULL') . ' ORDER BY cr.id, cm.id LIMIT 20000');
    foreach ($years as $y) {
        $s->execute($place ? [$y, $place] : [$y]);
        foreach ($s->fetchAll() as $m) {
            $age = dla_age((string) $m['age_text']); if ($age === null) { $skipped++; continue; }
            $pid = (int) ($m['person_id'] ?? 0); $sex = $m['gender'] === 'male' ? 'h' : ($m['gender'] === 'female' ? 'f' : dla_sex_word((string) $m['household_position'], (string) $m['personal_status'], (string) $m['display_name']));
            $name = trim((string) $m['display_name']) ?: ($pid ? dgn_name($m) : '');
            if (dla_kiosk() && $pid && !dla_in($keep, $pid)) { $name = ''; }
            $fam = $pid > 0 && ($grp ? dla_in($keep, $pid) : true);
            $rows[] = ['name' => mb_substr($name, 0, 100), 'sex' => $sex, 'age' => (string) round($age, 1), 'census' => (string) $y, 'family' => $fam ? 'oui' : ''];
        }
    }
    $pn = ''; if ($place) { $p = $pdo->prepare('SELECT name FROM places WHERE id=?'); $p->execute([$place]); $pn = (string) ($p->fetchColumn() ?: ''); }
    return ['rows' => $rows, 'place' => $pn, 'years' => $years, 'skipped' => $skipped];
}

/* ═════════ ⭕ Croisement des sources : les ensembles en plus, les combinaisons (2 à 8 ensembles) ═════════ */
function dla_sets_more(PDO $pdo): array
{
    $sets = [['key' => 'census', 'label' => dla_t('Trouvé dans un recensement'), 'group' => dla_t('Sources')], ['key' => 'notary', 'label' => dla_t('Trouvé chez le notaire (successions, inventaires)'), 'group' => dla_t('Sources')],
        ['key' => 'military', 'label' => dla_t('Trouvé dans les sources militaires (poilus)'), 'group' => dla_t('Sources')], ['key' => 'anysource', 'label' => dla_t('Avec au moins une source'), 'group' => dla_t('Sources')]];
    try { foreach ($pdo->query("SELECT s.id, COALESCE(NULLIF(trim(s.title),''), 'Source ' || s.id) AS t, (SELECT count(DISTINCT COALESCE(e.person_id, l.entity_id)) FROM source_links l LEFT JOIN events e ON l.entity_type='event' AND e.id=l.entity_id WHERE l.source_record_id=s.id) AS n FROM sources s ORDER BY n DESC LIMIT 30") as $r) {
        if ((int) $r['n'] > 0) { $sets[] = ['key' => 'source:' . (int) $r['id'], 'label' => mb_substr((string) $r['t'], 0, 70), 'group' => dla_t('Une source précise')]; } } } catch (Throwable $_) {}
    return ['sets' => $sets];
}
function dla_set_ids(PDO $pdo, string $key, int $root): array
{
    $col = static function (string $sql, array $a = []) use ($pdo): array { try { $s = $pdo->prepare($sql); $s->execute($a); return array_fill_keys(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)), true); } catch (Throwable $_) { return []; } };
    $ev = "SELECT e.person_id FROM source_links s JOIN events e ON e.id=s.entity_id WHERE s.entity_type='event' AND e.person_id IS NOT NULL";
    return match (true) {
        $key === 'census' => $col('SELECT DISTINCT person_id FROM census_members WHERE person_id IS NOT NULL'),
        $key === 'notary' => $col('SELECT person_id FROM succession_people WHERE person_id IS NOT NULL') + $col('SELECT person_id FROM probate_inventories WHERE person_id IS NOT NULL'),
        $key === 'military' => $col('SELECT person_id FROM poilu_units') + $col('SELECT person_id FROM poilu_events'),
        $key === 'anysource' => $col("SELECT entity_id FROM source_links WHERE entity_type='person' UNION $ev"),
        (bool) preg_match('/^source:(\d{1,10})$/', $key, $m) => $col("SELECT entity_id FROM source_links WHERE entity_type='person' AND source_record_id=? UNION SELECT e.person_id FROM source_links s JOIN events e ON e.id=s.entity_id WHERE s.entity_type='event' AND e.person_id IS NOT NULL AND s.source_record_id=?", [(int) $m[1], (int) $m[1]]),
        default => dgn_venn_ids($pdo, $key, $root),
    };
}
function dla_upset(PDO $pdo, array $q): array
{
    $raw = is_scalar($q['keys'] ?? null) ? (string) $q['keys'] : '';
    if (strlen($raw) > 2000) { dla_bad('Trop d’ensembles.'); }
    $keys = array_values(array_unique(array_slice(array_filter(array_map('trim', explode(',', $raw))), 0, 8)));
    if (count($keys) < 2) { dla_bad('Choisis au moins 2 ensembles.'); }
    foreach ($keys as $k) { if (!preg_match('/^[a-z]+(:[a-z0-9_\-]{1,60})?$/i', $k)) { dla_bad('Ensemble inconnu.'); } }
    $root = dla_int($q, 'root', 0, 0, PHP_INT_MAX); $keep = dla_people($pdo, $q);
    $sets = array_map(static fn($k) => dla_set_ids($pdo, $k, $root), $keys);
    $mask = [];
    foreach ($sets as $i => $ids) { foreach ($ids as $id => $_) { if ($id > 0 && dla_in($keep, $id)) { $mask[$id] = ($mask[$id] ?? 0) | (1 << $i); } } }
    $regions = []; $ids = [];
    foreach ($mask as $id => $m) { $code = ''; for ($i = 0; $i < count($keys); $i++) { if ($m & (1 << $i)) { $code .= 'ABCDEFGH'[$i]; } } $regions[$code] = ($regions[$code] ?? 0) + 1; if (count($ids[$code] ?? []) < 400) { $ids[$code][] = $id; } }
    return ['keys' => $keys, 'sizes' => array_map(static fn($s) => count(array_filter(array_keys($s), static fn($id) => $id > 0 && dla_in($keep, $id))), $sets), 'regions' => $regions, 'ids' => array_map(static fn($l) => implode(',', $l), $ids)];
}

function diagram_lot_a_data(PDO $pdo, array $q): array
{
    $q = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $q);
    $what = (string) ($q['what'] ?? '');
    if (!in_array($what, DLA_WHAT, true)) { dla_bad('Données inconnues.'); }
    dgo_request($q); // groupe de personnes et période communs (onglet « Depuis l'app »)
    return match ($what) {
        'quarters' => dla_quarters($pdo, $q),
        'name_groups' => dla_name_groups($pdo),
        'variants' => dla_variants($pdo, $q),
        'familygraph' => dla_familygraph($pdo, $q),
        'implexe' => dla_implexe($pdo, $q),
        'census_list' => dla_census_list($pdo),
        'census_pyr' => dla_census_pyr($pdo, $q),
        'sets_more' => dla_sets_more($pdo),
        'upset' => dla_upset($pdo, $q),
    };
}
