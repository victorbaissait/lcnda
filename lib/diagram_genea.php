<?php
/**
 * LCNDA — 📊 Diagrammes « Généalogie » et « Frises » : les chiffres pris dans l'app
 * (assets/js/heritage-diagram-genea.js). GET api.php?action=diagram_genea&what=…
 *  - fan       : l'ascendance (Sosa) d'une personne, 3 à 10 générations, avec ce qui sert à colorer chaque case ;
 *  - desc      : la descendance d'une personne (arbre parent → enfant) pour le soleil des lignées ;
 *  - witness   : témoins, parrains, marraines, déclarants… (paires « A — B — sorte de lien ») ;
 *  - marriages : mariages entre familles (patronymes) ; implexe : un même ancêtre à plusieurs places Sosa ;
 *  - venn_sets / venn : les ensembles possibles (étiquettes, profils, groupes de noms…) et leurs intersections ;
 *  - dates     : événements jour par jour et mois par mois ; lives / events : vies et événements pour la spirale.
 * Tout est en lecture seule, borné (nombre de personnes, de liens, de dates) et rendu en texte brut (échappé côté navigateur).
 */

function dgn_name(array $r): string
{
    $n = trim(trim((string) ($r['first_name'] ?? '')) . ' ' . trim((string) ($r['last_name'] ?? '')));
    return $n !== '' ? mb_substr($n, 0, 120) : 'Sans nom';
}

/** la personne de départ demandée, sinon le de cujus, sinon la première fiche */
function dgn_root(PDO $pdo, int $root): int
{
    if ($root > 0) {
        $s = $pdo->prepare('SELECT id FROM persons WHERE id=?');
        $s->execute([$root]);
        if ($s->fetchColumn()) { return $root; }
    }
    return (int) ($pdo->query('SELECT id FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn() ?: $pdo->query('SELECT min(id) FROM persons')->fetchColumn() ?: 0);
}

/** enfant → [père, mère] et parent → enfants, en une lecture */
function dgn_links(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $gender = [];
    foreach ($pdo->query('SELECT id, gender FROM persons') as $r) { $gender[(int) $r['id']] = (string) $r['gender']; }
    $parents = []; $children = [];
    foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id ORDER BY fc.position, fc.id') as $l) {
        $c = (int) $l['child_id'];
        foreach (['partner1_id', 'partner2_id'] as $col) {
            $p = (int) ($l[$col] ?? 0);
            if (!$p || $p === $c) { continue; }
            $role = ($gender[$p] ?? '') === 'male' ? 0 : (($gender[$p] ?? '') === 'female' ? 1 : ($col === 'partner1_id' ? 0 : 1));
            if (isset($parents[$c][$role])) { $role = 1 - $role; }
            if (isset($parents[$c][$role])) { continue; }
            $parents[$c][$role] = $p;
            if (!in_array($c, $children[$p] ?? [], true)) { $children[$p][] = $c; }
        }
    }
    return $cache = ['parents' => $parents, 'children' => $children, 'gender' => $gender];
}

/** ancêtres : numéro Sosa → personne (le premier numéro rencontré pour chaque personne compte pour « ancêtres ») */
function dgn_sosa(PDO $pdo, int $root, int $gens, int $max = 120000): array
{
    $L = dgn_links($pdo);
    $out = [1 => $root]; $queue = [[1, $root, 1]];
    while ($queue && count($out) < $max) {
        $next = [];
        foreach ($queue as [$s, $p, $g]) {
            if ($g >= $gens) { continue; }
            foreach ([0, 1] as $k) {
                $par = $L['parents'][$p][$k] ?? 0;
                if ($par) { $out[$s * 2 + $k] = $par; $next[] = [$s * 2 + $k, $par, $g + 1]; }
            }
        }
        $queue = $next;
    }
    return $out;
}

/** quelques renseignements sur des personnes : nom, sexe, métier, naissance, décès, lieux, score de recherche */
function dgn_people_info(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    $info = [];
    foreach (array_chunk($ids, 500) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT id, first_name, last_name, gender, living_status, COALESCE(occupation,'') AS occupation FROM persons WHERE id IN ($in)") as $r) {
            $info[(int) $r['id']] = ['id' => (int) $r['id'], 'name' => dgn_name($r), 'last' => mb_substr(trim((string) $r['last_name']), 0, 80), 'gender' => (string) $r['gender'], 'living' => $r['living_status'] === 'living',
                'occupation' => mb_substr(trim((string) $r['occupation']), 0, 80), 'birth' => '', 'birth_year' => null, 'birth_place' => '', 'county' => '', 'state' => '', 'country' => '', 'death' => '', 'death_year' => null, 'death_place' => '', 'marriage' => false, 'sourced' => false];
        }
        $ev = $pdo->query("SELECT e.id, e.person_id, t.gedcom_tag AS tag, COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT), e.date_text, '') AS d, e.year, COALESCE(pl.name,'') AS place, COALESCE(pl.county,'') AS county, COALESCE(pl.state,'') AS state, COALESCE(pl.country,'') AS country
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id IN ($in) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY (t.gedcom_tag IN ('BIRT','DEAT')) DESC, e.id");
        foreach ($ev as $e) {
            $p = (int) $e['person_id']; if (!isset($info[$p])) { continue; }
            $isBirth = in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true);
            $k = $isBirth ? 'birth' : 'death';
            if ($info[$p][$k] === '' && trim((string) $e['d']) !== '') { $info[$p][$k] = mb_substr((string) $e['d'], 0, 40); $info[$p][$k . '_year'] = $e['year'] !== null ? (int) $e['year'] : null; }
            if ($info[$p][$k . '_place'] === '' && trim((string) $e['place']) !== '') {
                $info[$p][$k . '_place'] = mb_substr(trim((string) $e['place']), 0, 80);
                if ($isBirth) { foreach (['county', 'state', 'country'] as $c) { $info[$p][$c] = mb_substr(trim((string) $e[$c]), 0, 80); } }
            }
        }
        foreach ($pdo->query("SELECT DISTINCT f.partner1_id AS a, f.partner2_id AS b FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id
            WHERE t.gedcom_tag='MARR' AND (COALESCE(e.date_text,'')<>'' OR e.year IS NOT NULL) AND (f.partner1_id IN ($in) OR f.partner2_id IN ($in))") as $m) {
            foreach (['a', 'b'] as $c) { $p = (int) $m[$c]; if (isset($info[$p])) { $info[$p]['marriage'] = true; } }
        }
        foreach ($pdo->query("SELECT DISTINCT entity_id FROM source_links WHERE entity_type='person' AND entity_id IN ($in)
            UNION SELECT DISTINCT e.person_id FROM source_links s JOIN events e ON e.id=s.entity_id WHERE s.entity_type='event' AND e.person_id IN ($in)") as $s) {
            $p = (int) $s[0]; if (isset($info[$p])) { $info[$p]['sourced'] = true; }
        }
    }
    foreach ($info as &$p) {
        // taux de recherche : date et lieu de naissance, mariage daté, date et lieu de décès (acquis pour un vivant), au moins une source
        $done = ($p['birth'] !== '') + ($p['birth_place'] !== '') + $p['marriage'] + ($p['living'] || $p['death'] !== '') + ($p['living'] || $p['death_place'] !== '') + $p['sourced'];
        $p['score'] = (int) round(100 * $done / 6);
    }
    return $info;
}

function dgn_fan(PDO $pdo, int $root, int $gens): array
{
    $gens = max(3, min(10, $gens));
    $root = dgn_root($pdo, $root);
    if (!$root) { return ['root' => 0, 'rows' => []]; }
    $map = dgn_sosa($pdo, $root, $gens, 1100);
    $info = dgn_people_info($pdo, array_values($map));
    $rows = [];
    foreach ($map as $s => $pid) { if (isset($info[$pid])) { $rows[] = ['sosa' => (int) $s] + $info[$pid]; } }
    return ['root' => $root, 'root_name' => $info[$root]['name'] ?? '', 'gens' => $gens, 'rows' => $rows];
}

function dgn_desc(PDO $pdo, int $root, int $gens): array
{
    $gens = max(1, min(10, $gens));
    $root = dgn_root($pdo, $root);
    if (!$root) { return ['root' => 0, 'nodes' => []]; }
    $L = dgn_links($pdo);
    $nodes = [[$root, 0, 0]]; $seen = [$root => true]; $queue = [$root]; $g = 0; $truncated = false;
    while ($queue && $g < $gens) {
        $next = [];
        foreach ($queue as $p) {
            foreach ($L['children'][$p] ?? [] as $c) {
                if (isset($seen[$c])) { continue; }
                if (count($nodes) >= 3000) { $truncated = true; break 3; }
                $seen[$c] = true; $nodes[] = [$c, $p, $g + 1]; $next[] = $c;
            }
        }
        $queue = $next; $g++;
    }
    $names = [];
    foreach (array_chunk(array_keys($seen), 500) as $chunk) {
        foreach ($pdo->query('SELECT id, first_name, last_name, gender, (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=persons.id AND t.gedcom_tag IN (\'BIRT\',\'CHR\',\'BAPM\') AND e.year IS NOT NULL ORDER BY e.id LIMIT 1) AS y FROM persons WHERE id IN (' . implode(',', $chunk) . ')') as $r) {
            $names[(int) $r['id']] = ['name' => dgn_name($r), 'gender' => (string) $r['gender'], 'year' => $r['y'] !== null ? (int) $r['y'] : null];
        }
    }
    $out = array_map(static fn($n) => ['id' => $n[0], 'parent' => $n[1], 'gen' => $n[2]] + ($names[$n[0]] ?? ['name' => 'Sans nom', 'gender' => 'unknown', 'year' => null]), $nodes);
    return ['root' => $root, 'nodes' => $out, 'truncated' => $truncated];
}

/** témoins, parrains… : autour d'une personne (1 ou 2 pas) ou dans toute la base */
function dgn_witness(PDO $pdo, int $root, int $depth, bool $all): array
{
    $max = 2500;
    $sql = "SELECT ew.person_id AS w, e.person_id AS p, f.partner1_id AS f1, f.partner2_id AS f2, TRIM(COALESCE(ew.note,'')) AS note, t.label AS ev
        FROM event_witnesses ew JOIN events e ON e.id=ew.event_id JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id";
    $pairs = [];
    $add = static function (array $r) use (&$pairs): void {
        $role = trim((string) $r['note']);
        $low = mb_strtolower($role);
        foreach (['parrain', 'marraine', 'témoin', 'déclarant', 'voisin', 'officier', 'employeur', 'tuteur', 'curé'] as $w) { if (str_contains($low, $w)) { $role = $w; break; } }
        if ($role === '') { $role = 'témoin'; }
        $role = mb_substr($role, 0, 40);
        foreach ([(int) $r['p'], (int) $r['f1'], (int) $r['f2']] as $o) {
            if ($o && $o !== (int) $r['w']) { $k = $r['w'] . '|' . $o . '|' . $role; $pairs[$k] = ($pairs[$k] ?? 0) + 1; }
        }
    };
    if ($all) {
        foreach ($pdo->query($sql . " ORDER BY e.year, ew.id LIMIT $max") as $r) { $add($r); }
    } else {
        $root = dgn_root($pdo, $root);
        $frontier = [$root]; $seen = [$root => true];
        for ($step = 0; $step < max(1, min(2, $depth)) && $frontier; $step++) {
            $next = [];
            foreach (array_chunk($frontier, 400) as $chunk) {
                $in = implode(',', array_map('intval', $chunk));
                foreach ($pdo->query($sql . " WHERE ew.person_id IN ($in) OR e.person_id IN ($in) OR f.partner1_id IN ($in) OR f.partner2_id IN ($in) LIMIT $max") as $r) {
                    $add($r);
                    foreach ([(int) $r['w'], (int) $r['p'], (int) $r['f1'], (int) $r['f2']] as $o) { if ($o && !isset($seen[$o])) { $seen[$o] = true; $next[] = $o; } }
                }
            }
            $frontier = array_slice($next, 0, 600);
            if (count($pairs) >= $max) { break; }
        }
    }
    arsort($pairs);
    $pairs = array_slice($pairs, 0, $max, true);
    $ids = [];
    foreach (array_keys($pairs) as $k) { [$a, $b] = explode('|', $k); $ids[(int) $a] = true; $ids[(int) $b] = true; }
    $names = [];
    foreach (array_chunk(array_keys($ids), 500) as $chunk) {
        foreach ($pdo->query('SELECT id, first_name, last_name FROM persons WHERE id IN (' . implode(',', $chunk) . ')') as $r) { $names[(int) $r['id']] = [dgn_name($r), mb_substr(trim((string) $r['last_name']), 0, 60)]; }
    }
    // deux personnes qui portent le même nom : on les distingue par leur numéro
    $count = array_count_values(array_map(static fn($n) => $n[0], $names));
    $label = static fn(int $id) => isset($names[$id]) ? ($count[$names[$id][0]] > 1 ? $names[$id][0] . ' (n° ' . $id . ')' : $names[$id][0]) : 'n° ' . $id;
    $links = [];
    foreach ($pairs as $k => $n) { [$a, $b, $role] = explode('|', $k, 3); $links[] = ['a' => $label((int) $a), 'b' => $label((int) $b), 'kind' => $role, 'weight' => $n]; }
    $nodes = [];
    foreach (array_keys($ids) as $id) { $nodes[] = ['name' => $label($id), 'group' => $names[$id][1] ?? '']; }
    return ['links' => $links, 'nodes' => $nodes];
}

function dgn_marriages(PDO $pdo): array
{
    $pairs = []; $same = 0;
    $norm = static fn($s) => mb_strtoupper(trim((string) $s));
    foreach ($pdo->query("SELECT p1.last_name AS a, p2.last_name AS b FROM families f JOIN persons p1 ON p1.id=f.partner1_id JOIN persons p2 ON p2.id=f.partner2_id") as $r) {
        $a = $norm($r['a']); $b = $norm($r['b']);
        if ($a === '' || $b === '' || preg_match('/^(\?|X+|INCONNU|N\.?N\.?)$/u', $a) || preg_match('/^(\?|X+|INCONNU|N\.?N\.?)$/u', $b)) { continue; }
        if ($a === $b) { $same++; continue; }
        $k = strcmp($a, $b) < 0 ? "$a|$b" : "$b|$a";
        $pairs[$k] = ($pairs[$k] ?? 0) + 1;
    }
    arsort($pairs);
    $deg = [];
    foreach ($pairs as $k => $n) { [$a, $b] = explode('|', $k); $deg[$a] = ($deg[$a] ?? 0) + $n; $deg[$b] = ($deg[$b] ?? 0) + $n; }
    arsort($deg);
    $keep = array_slice($deg, 0, 60, true);
    $links = [];
    foreach ($pairs as $k => $n) { [$a, $b] = explode('|', $k); if (isset($keep[$a], $keep[$b])) { $links[] = ['a' => mb_substr($a, 0, 60), 'b' => mb_substr($b, 0, 60), 'kind' => 'mariage', 'weight' => $n]; } if (count($links) >= 400) { break; } }
    return ['links' => $links, 'nodes' => array_map(static fn($n) => ['name' => mb_substr($n, 0, 60), 'group' => ''], array_keys($keep)), 'same' => $same];
}

function dgn_implexe(PDO $pdo, int $root): array
{
    $root = dgn_root($pdo, $root);
    if (!$root || !function_exists('implexe_data')) { return ['links' => [], 'nodes' => []]; }
    $d = implexe_data($pdo, $root, 20, 200000);
    $nodes = []; $links = [];
    foreach (array_slice($d['repeated'] ?? [], 0, 30) as $rep) {
        $name = isset($rep['person']) ? dgn_name($rep['person']) : 'n° ' . $rep['id'];
        $prev = null;
        foreach (array_slice($rep['sosas'], 0, 6) as $s) {
            $label = 'Sosa ' . $s . ' · ' . $name;
            $nodes[$s] = ['name' => $label, 'group' => $name, 'sosa' => (int) $s];
            if ($prev !== null) { $links[] = ['a' => $prev, 'b' => $label, 'kind' => 'même personne', 'weight' => 1]; }
            $prev = $label;
        }
    }
    ksort($nodes);
    return ['root' => $root, 'nodes' => array_values($nodes), 'links' => $links, 'rate' => $d['rate'] ?? 0, 'total' => $d['repeated_total'] ?? 0];
}

/** les ensembles possibles pour un diagramme de Venn */
function dgn_venn_sets(PDO $pdo): array
{
    $sets = [['key' => 'sosa', 'label' => 'Mes ancêtres (Sosa)', 'group' => 'Arbre'], ['key' => 'male', 'label' => 'Hommes', 'group' => 'Arbre'], ['key' => 'female', 'label' => 'Femmes', 'group' => 'Arbre'],
        ['key' => 'living', 'label' => 'Vivants', 'group' => 'Arbre'], ['key' => 'photo', 'label' => 'Avec un portrait', 'group' => 'Arbre'], ['key' => 'sourced', 'label' => 'Avec une source', 'group' => 'Arbre']];
    try { foreach ($pdo->query("SELECT p.key, COALESCE(NULLIF(p.label,''), p.key) AS label FROM profiles p WHERE EXISTS (SELECT 1 FROM person_profiles pp WHERE pp.profile_key=p.key) ORDER BY label") as $r) { $sets[] = ['key' => 'profile:' . $r['key'], 'label' => mb_substr((string) $r['label'], 0, 60), 'group' => 'Profils']; } } catch (Throwable $_) {}
    try { foreach ($pdo->query("SELECT g.id, g.name FROM surname_groups g WHERE EXISTS (SELECT 1 FROM persons p WHERE p.surname_group_id=g.id) ORDER BY g.name LIMIT 200") as $r) { $sets[] = ['key' => 'sgroup:' . $r['id'], 'label' => mb_substr((string) $r['name'], 0, 60), 'group' => 'Groupes de noms']; } } catch (Throwable $_) {}
    return ['sets' => $sets];
}

function dgn_venn_ids(PDO $pdo, string $key, int $root): array
{
    $col = static function (PDO $pdo, string $sql, array $args = []): array { $s = $pdo->prepare($sql); $s->execute($args); return array_fill_keys(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)), true); };
    if ($key === 'sosa') { return array_fill_keys(array_values(dgn_sosa($pdo, dgn_root($pdo, $root), 40)), true); }
    if ($key === 'male' || $key === 'female') { return $col($pdo, 'SELECT id FROM persons WHERE gender=?', [$key]); }
    if ($key === 'living') { return $col($pdo, "SELECT id FROM persons WHERE living_status='living'"); }
    if ($key === 'photo') { return $col($pdo, 'SELECT id FROM persons WHERE portrait_media_id IS NOT NULL'); }
    if ($key === 'sourced') { return $col($pdo, "SELECT entity_id FROM source_links WHERE entity_type='person' UNION SELECT e.person_id FROM source_links s JOIN events e ON e.id=s.entity_id WHERE s.entity_type='event' AND e.person_id IS NOT NULL"); }
    if (preg_match('/^label:(\d+)$/', $key, $m)) { return $col($pdo, "SELECT entity_id FROM label_links WHERE label_id=? AND entity_type='person'", [(int) $m[1]]); }
    if (preg_match('/^profile:([a-z0-9_\-]{1,60})$/i', $key, $m)) { try { return $col($pdo, 'SELECT person_id FROM person_profiles WHERE profile_key=?', [$m[1]]); } catch (Throwable $_) { return []; } }
    if (preg_match('/^sgroup:(\d+)$/', $key, $m)) { return $col($pdo, 'SELECT id FROM persons WHERE surname_group_id=?', [(int) $m[1]]); }
    throw new LcndaBadInput('Ensemble inconnu.');
}

/** nombre de personnes dans chaque zone (exactement ces ensembles-là) */
function dgn_venn(PDO $pdo, array $keys, int $root): array
{
    $keys = array_values(array_unique(array_slice(array_filter(array_map('strval', $keys)), 0, 4)));
    if (count($keys) < 2) { throw new LcndaBadInput('Choisis au moins 2 ensembles.'); }
    $sets = array_map(static fn($k) => dgn_venn_ids($pdo, $k, $root), $keys);
    $mask = [];
    foreach ($sets as $i => $ids) { foreach ($ids as $id => $_) { $mask[$id] = ($mask[$id] ?? 0) | (1 << $i); } }
    $regions = [];
    foreach ($mask as $m) {
        $code = '';
        foreach ([0, 1, 2, 3] as $i) { if ($m & (1 << $i)) { $code .= 'ABCD'[$i]; } }
        $regions[$code] = ($regions[$code] ?? 0) + 1;
    }
    return ['keys' => $keys, 'sizes' => array_map('count', $sets), 'regions' => $regions];
}

/** les personnes concernées : toute la base, ou les ancêtres d'une personne */
function dgn_scope_ids(PDO $pdo, string $scope, int $root): ?array
{
    $ids = $scope === 'ancestors' ? array_values(array_unique(dgn_sosa($pdo, dgn_root($pdo, $root), 40, 60000))) : null;
    if (!function_exists('dgo_restrict')) { return $ids; }
    $set = dgo_restrict($pdo, $ids === null ? null : array_fill_keys($ids, true)); // le groupe de personnes choisi (« Depuis l'app », lib/diagram_options.php)
    return $set === null ? null : array_keys($set);
}

/** la période choisie (lib/diagram_options.php) : l'année d'une date « 1784-05-07 » ou « 1784 » */
function dgn_year_ok(string $d): bool
{
    if (!function_exists('dgo_year_ok')) { return true; }
    return dgo_year_ok(preg_match('/^(-?\d{1,4})/', $d, $m) ? (int) $m[1] : null);
}

const DGN_TAGS = ['birth' => ['BIRT'], 'bapt' => ['CHR', 'BAPM'], 'marriage' => ['MARR'], 'death' => ['DEAT'], 'burial' => ['BURI']];

/** événements jour par jour (dates complètes) et mois par mois, par sorte */
function dgn_dates(PDO $pdo, array $types, string $scope, int $root): array
{
    $types = array_values(array_intersect(array_keys(DGN_TAGS), $types)) ?: ['birth'];
    $ids = dgn_scope_ids($pdo, $scope, $root);
    $days = []; $months = []; $noDay = 0; $total = 0;
    foreach ($types as $type) {
        $tags = "'" . implode("','", DGN_TAGS[$type]) . "'";
        $months[$type] = array_fill(0, 12, 0);
        $where = '';
        if ($ids !== null) {
            if (!$ids) { continue; }
            $in = implode(',', array_map('intval', $ids));
            $where = $type === 'marriage' ? " AND (f.partner1_id IN ($in) OR f.partner2_id IN ($in))" : " AND e.person_id IN ($in)";
        }
        $sql = "SELECT substr(e.sort_date,1,10) AS d, count(*) AS n FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
            WHERE t.gedcom_tag IN ($tags) AND COALESCE(e.sort_date,'')<>''$where GROUP BY substr(e.sort_date,1,10) LIMIT 60000";
        foreach ($pdo->query($sql) as $r) {
            if (!dgn_year_ok((string) $r['d'])) { continue; }
            $n = (int) $r['n']; $total += $n;
            if (!preg_match('/^(\d{3,4})-(\d{2})(?:-(\d{2}))?/', (string) $r['d'], $m)) { $noDay += $n; continue; }
            $mo = (int) $m[2]; $da = (int) ($m[3] ?? 0);
            if ($mo >= 1 && $mo <= 12) { $months[$type][$mo - 1] += $n; }
            if ($mo >= 1 && $mo <= 12 && $da >= 1 && $da <= 31) { $days[] = [sprintf('%04d-%02d-%02d', (int) $m[1], $mo, $da), $type, $n]; } else { $noDay += $n; }
        }
    }
    return ['types' => $types, 'days' => array_slice($days, 0, 60000), 'months' => $months, 'no_day' => $noDay, 'total' => $total];
}

/** vies (naissance → décès) et événements datés, pour la spirale */
function dgn_lives(PDO $pdo, string $scope, int $root): array
{
    $ids = dgn_scope_ids($pdo, $scope, $root);
    $where = $ids === null ? '' : ($ids ? ' WHERE p.id IN (' . implode(',', array_map('intval', array_slice($ids, 0, 3000))) . ')' : ' WHERE 0');
    $rows = $pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender,
            (SELECT COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT)) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL) ORDER BY t.gedcom_tag='BIRT' DESC LIMIT 1) AS b,
            (SELECT COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT)) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL) ORDER BY t.gedcom_tag='DEAT' DESC LIMIT 1) AS d
        FROM persons p$where LIMIT 3000")->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        if (!$r['b'] && !$r['d']) { continue; }
        if (!dgn_year_ok((string) ($r['b'] ?: $r['d']))) { continue; }
        $out[] = ['name' => dgn_name($r), 'gender' => (string) $r['gender'], 'birth' => str_replace('-00', '', (string) $r['b']), 'death' => str_replace('-00', '', (string) $r['d'])];
        if (count($out) >= 1500) { break; }
    }
    usort($out, static fn($a, $b) => strcmp($a['birth'] ?: $a['death'], $b['birth'] ?: $b['death']));
    return ['people' => $out];
}

function dgn_events(PDO $pdo, array $types, string $scope, int $root): array
{
    $types = array_values(array_intersect(array_keys(DGN_TAGS), $types)) ?: ['birth'];
    $ids = dgn_scope_ids($pdo, $scope, $root);
    $label = ['birth' => 'Naissance', 'bapt' => 'Baptême', 'marriage' => 'Mariage', 'death' => 'Décès', 'burial' => 'Sépulture'];
    $out = [];
    foreach ($types as $type) {
        $tags = "'" . implode("','", DGN_TAGS[$type]) . "'";
        $where = '';
        if ($ids !== null) { if (!$ids) { continue; } $in = implode(',', array_map('intval', array_slice($ids, 0, 3000))); $where = $type === 'marriage' ? " AND (f.partner1_id IN ($in) OR f.partner2_id IN ($in))" : " AND e.person_id IN ($in)"; }
        $sql = "SELECT COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT)) AS d, p.first_name, p.last_name, a.first_name AS a1, a.last_name AS a2, b.first_name AS b1, b.last_name AS b2
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families f ON f.id=e.family_id LEFT JOIN persons a ON a.id=f.partner1_id LEFT JOIN persons b ON b.id=f.partner2_id
            WHERE t.gedcom_tag IN ($tags) AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL)$where ORDER BY e.sort_date LIMIT 1500";
        foreach ($pdo->query($sql) as $r) {
            if (!dgn_year_ok((string) $r['d'])) { continue; }
            $who = $type === 'marriage' ? trim(dgn_name(['first_name' => $r['a1'], 'last_name' => $r['a2']]) . ' et ' . dgn_name(['first_name' => $r['b1'], 'last_name' => $r['b2']])) : dgn_name($r);
            $out[] = ['date' => str_replace('-00', '', (string) $r['d']), 'label' => $label[$type] . ' de ' . $who, 'kind' => $label[$type]];
        }
    }
    usort($out, static fn($a, $b) => strcmp($a['date'], $b['date']));
    return ['events' => array_slice($out, 0, 1500)];
}

function diagram_genea_data(PDO $pdo, array $q): array
{
    $q = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $q); // ?types[]=… forgé : un texte vide, pas « Array »
    $what = $q['what'] ?? '';
    $root = (int) ($q['root'] ?? 0);
    $gens = (int) ($q['gens'] ?? 5);
    $scope = ($q['scope'] ?? 'all') === 'ancestors' ? 'ancestors' : 'all';
    $types = array_slice(explode(',', $q['types'] ?? 'birth'), 0, 5);
    if (in_array($what, ['dates', 'lives', 'events'], true)) { require_once __DIR__ . '/diagram_options.php'; dgo_request($q); } // groupe de personnes et période (onglet « Depuis l'app »)
    return match ($what) {
        'fan' => dgn_fan($pdo, $root, $gens),
        'desc' => dgn_desc($pdo, $root, $gens),
        'witness' => dgn_witness($pdo, $root, (int) ($q['depth'] ?? 1), ($q['all'] ?? '') === '1'),
        'marriages' => dgn_marriages($pdo),
        'implexe' => dgn_implexe($pdo, $root),
        'venn_sets' => dgn_venn_sets($pdo),
        'venn' => dgn_venn($pdo, explode(',', (string) ($q['keys'] ?? '')), $root),
        'dates' => dgn_dates($pdo, $types, $scope, $root),
        'lives' => dgn_lives($pdo, $scope, $root),
        'events' => dgn_events($pdo, $types, $scope, $root),
        default => throw new LcndaBadInput('Données inconnues.'),
    };
}
