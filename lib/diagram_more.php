<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 Diagrammes en plus (assets/js/heritage-diagram-more.js) : les chiffres pris dans l'arbre.
 * GET api.php?action=diagram_more&what=…  (lecture seule, tout est borné ; les textes sont échappés dans le navigateur)
 *  - crises    : naissances et décès année par année (ou par 5 ans), toute la base ou un lieu (&place=id) ;
 *  - siblings  : une fratrie (&person=id&mode=siblings) ou les enfants d'une personne (&mode=children), avec mariages et enfants ;
 *  - alive     : naissance, décès, sexe de chaque personne (compact), pour la pyramide « qui vivait en … » ;
 *  - accordion : les ancêtres d'une personne sur N générations et leurs descendants jusqu'à sa génération, lien de parenté ;
 *  - kinship   : le lien de parenté entre chaque paire de personnes choisies (&ids=1,2,3, au plus 24) ;
 *  - cousins   : liens entre des personnes choisies (&ids=…) ou entre les cousins d'une personne (&root=id&gens=N) ;
 *  - surnames  : la transmission des noms dans l'ascendance (où et quand chaque nom entre, variantes, porteurs par génération) ;
 *  - chord     : mariages entre villages (lieux de naissance des deux époux, ou naissance → lieu du mariage).
 * L'ascendance pour l'arbre en frise et le quadrillage des ancêtres vient de diagram_genea (what=fan).
 */

require_once __DIR__ . '/diagram_chiffres.php'; // dchf_date, dchf_age
require_once __DIR__ . '/diagram_genea.php';    // dgn_links, dgn_root, dgn_sosa, dgn_name
require_once __DIR__ . '/diagram_options.php';  // dgo_request, dgo_restrict : options communes de « Depuis l'app »

const DMO_BIRTH = ['BIRT' => 0, 'CHR' => 1, 'BAPM' => 2];
const DMO_DEATH = ['DEAT' => 0, 'BURI' => 1];

/** naissance et décès de chaque personne (le meilleur événement de chaque sorte), avec leur lieu */
function dmo_lives(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $out = [];
    foreach ($pdo->query("SELECT id, first_name, last_name, gender, living_status FROM persons WHERE COALESCE(kind,'')<>'animal'") as $r) {
        $out[(int) $r['id']] = ['id' => (int) $r['id'], 'name' => dgn_name($r), 'last' => trim((string) $r['last_name']), 'g' => (string) $r['gender'], 'living' => $r['living_status'] === 'living',
            'b' => null, 'd' => null, 'bp' => 0, 'dp' => 0, 'br' => 9, 'dr' => 9];
    }
    $q = $pdo->query("SELECT e.person_id, t.gedcom_tag AS tag, e.sort_date, e.year, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL OR e.place_id IS NOT NULL)");
    foreach ($q as $e) {
        $p = (int) $e['person_id']; if (!isset($out[$p])) { continue; }
        $birth = isset(DMO_BIRTH[$e['tag']]); $rank = $birth ? DMO_BIRTH[$e['tag']] : DMO_DEATH[$e['tag']];
        [$k, $rk, $pk] = $birth ? ['b', 'br', 'bp'] : ['d', 'dr', 'dp'];
        $d = dchf_date($e['sort_date'], $e['year']);
        if ($d && ($out[$p][$k] === null || $rank < $out[$p][$rk])) { $out[$p][$k] = $d; $out[$p][$rk] = $rank; if ($e['place_id']) { $out[$p][$pk] = (int) $e['place_id']; } }
        if (!$out[$p][$pk] && $e['place_id']) { $out[$p][$pk] = (int) $e['place_id']; }
    }
    return $cache = $out;
}

/** « 1784-05-07 » (ou « 1784 ») pour l'affichage et le navigateur */
function dmo_iso(?array $d): string
{
    if (!$d) { return ''; }
    return $d[1] > 0 ? sprintf('%04d-%02d%s', $d[0], $d[1], $d[2] > 0 ? sprintf('-%02d', $d[2]) : '') : (string) $d[0];
}

/** les lieux qui désignent le même endroit qu'un lieu choisi (même nom, même département) */
function dmo_same_places(PDO $pdo, int $placeId): array
{
    $s = $pdo->prepare('SELECT name, county FROM places WHERE id=?'); $s->execute([$placeId]); $p = $s->fetch();
    if (!$p) { return [[], '']; }
    $s = $pdo->prepare("SELECT id FROM places WHERE lower(trim(name))=lower(trim(?)) AND lower(trim(COALESCE(county,'')))=lower(trim(?))"); $s->execute([(string) $p['name'], (string) ($p['county'] ?? '')]);
    $ids = array_fill_keys(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)), true); $ids[$placeId] = true;
    return [$ids, mb_substr(trim((string) $p['name']), 0, 80)];
}

/* ═════════ 📉 Naissances et décès, année par année ═════════ */
function dmo_crises(PDO $pdo, array $q): array
{
    $step = (int) ($q['step'] ?? 1);
    if (!in_array($step, [1, 5, 10], true)) { $step = 1; }
    $place = (int) ($q['place'] ?? 0);
    [$ids, $pname] = $place > 0 ? dmo_same_places($pdo, $place) : [null, ''];
    $from = is_numeric($q['from'] ?? '') ? (int) $q['from'] : null; $to = is_numeric($q['to'] ?? '') ? (int) $q['to'] : null;
    $b = []; $d = []; $grp = dgo_restrict($pdo, null); // le groupe de personnes choisi (« Depuis l'app »)
    foreach (dmo_lives($pdo) as $p) {
        if ($grp !== null && !isset($grp[$p['id']])) { continue; }
        if ($p['b'] && ($ids === null || isset($ids[$p['bp']]))) { $y = intdiv($p['b'][0], $step) * $step; $b[$y] = ($b[$y] ?? 0) + 1; }
        if ($p['d'] && ($ids === null || isset($ids[$p['dp']]))) { $y = intdiv($p['d'][0], $step) * $step; $d[$y] = ($d[$y] ?? 0) + 1; }
    }
    $years = array_keys($b + $d);
    if (!$years) { return ['rows' => [], 'place' => $pname, 'step' => $step]; }
    $lo = max(min($years), $from ?? -9999); $hi = min(max($years), $to ?? 9999, (int) date('Y'));
    if ($hi - $lo > 600 * $step) { $lo = $hi - 600 * $step; } // au plus 600 points
    $rows = [];
    for ($y = intdiv($lo, $step) * $step; $y <= $hi; $y += $step) { $rows[] = ['year' => (string) $y, 'births' => $b[$y] ?? 0, 'deaths' => $d[$y] ?? 0]; }
    return ['rows' => $rows, 'place' => $pname, 'step' => $step];
}

/* ═════════ 👨‍👩‍👧 Une fratrie ═════════ */
function dmo_siblings(PDO $pdo, int $person, string $mode): array
{
    $lives = dmo_lives($pdo);
    if (!isset($lives[$person])) { throw new LcndaBadInput('Personne introuvable.'); }
    $kids = []; $title = '';
    if ($mode === 'children') {
        $s = $pdo->prepare('SELECT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=? OR f.partner2_id=? ORDER BY fc.position, fc.id');
        $s->execute([$person, $person]); $kids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        $title = 'Les enfants de ' . $lives[$person]['name'];
    } else {
        $s = $pdo->prepare('SELECT family_id FROM family_children WHERE child_id=? ORDER BY id LIMIT 1'); $s->execute([$person]); $fid = (int) $s->fetchColumn();
        if ($fid) { $s = $pdo->prepare('SELECT child_id FROM family_children WHERE family_id=? ORDER BY position, id'); $s->execute([$fid]); $kids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); }
        else { $kids = [$person]; }
        $title = 'La fratrie de ' . $lives[$person]['name'];
    }
    $kids = array_slice(array_values(array_unique($kids)), 0, 40);
    $out = [];
    $fam = $pdo->prepare("SELECT f.id, CASE WHEN f.partner1_id=? THEN f.partner2_id ELSE f.partner1_id END AS spouse,
        (SELECT COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT)) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag IN ('MARR','MARB','MARC') AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL) ORDER BY t.gedcom_tag='MARR' DESC LIMIT 1) AS md
        FROM families f WHERE f.partner1_id=? OR f.partner2_id=?");
    $ch = $pdo->prepare('SELECT child_id FROM family_children WHERE family_id=?');
    foreach ($kids as $k) {
        $p = $lives[$k] ?? null; if (!$p) { continue; }
        $marr = []; $births = [];
        $fam->execute([$k, $k, $k]);
        foreach ($fam->fetchAll() as $f) {
            $md = dchf_date((string) $f['md'], null);
            if ($md) { $marr[] = dmo_iso($md); }
            $ch->execute([(int) $f['id']]);
            foreach ($ch->fetchAll(PDO::FETCH_COLUMN) as $c) { $cb = $lives[(int) $c]['b'] ?? null; if ($cb) { $births[] = dmo_iso($cb); } }
        }
        sort($marr); sort($births);
        $out[] = ['id' => $k, 'name' => $p['name'], 'sex' => $p['g'] === 'male' ? 'h' : ($p['g'] === 'female' ? 'f' : ''), 'birth' => dmo_iso($p['b']), 'death' => dmo_iso($p['d']), 'living' => $p['living'],
            'marriages' => implode(', ', array_slice($marr, 0, 6)), 'children' => implode(', ', array_slice($births, 0, 30))];
    }
    usort($out, static fn($a, $b) => ($a['birth'] ?: '9999') <=> ($b['birth'] ?: '9999'));
    return ['title' => $title, 'people' => $out];
}

/* ═════════ 🔺 Qui vivait en … : [naissance, décès, sexe, vivant] ═════════ */
function dmo_alive(PDO $pdo): array
{
    $people = []; $lo = null; $hi = null; $grp = dgo_restrict($pdo, null);
    foreach (dmo_lives($pdo) as $p) {
        if (!$p['b'] || ($grp !== null && !isset($grp[$p['id']]))) { continue; }
        $by = $p['b'][0]; $dy = $p['d'][0] ?? null;
        if ($dy !== null && $dy < $by) { continue; }
        $people[] = [$by, $dy, $p['g'] === 'male' ? 1 : ($p['g'] === 'female' ? 2 : 0), $p['living'] ? 1 : 0];
        $lo = $lo === null ? $by : min($lo, $by); $hi = $hi === null ? $by : max($hi, $by);
        if (count($people) >= 40000) { break; }
    }
    return ['people' => $people, 'from' => $lo, 'to' => $hi];
}

/* ═════════ Les liens de parenté ═════════ */
/** ancêtres d'une personne : id → nombre de générations (0 = elle-même), jusqu'à $max générations */
function dmo_ancestors(int $id, int $max): array
{
    $L = dgn_links(db());
    $out = [$id => 0]; $level = [$id];
    for ($g = 1; $g <= $max && $level; $g++) {
        $next = [];
        foreach ($level as $x) { foreach ($L['parents'][$x] ?? [] as $p) { if (!isset($out[$p])) { $out[$p] = $g; $next[] = $p; } } }
        $level = $next;
    }
    return $out;
}
/** le plus proche ancêtre commun : [a (de x à lui), b (de y à lui)] ou null */
function dmo_closest(array $ax, array $ay): ?array
{
    $best = null;
    foreach ($ax as $anc => $a) { if (isset($ay[$anc])) { $s = $a + $ay[$anc]; if ($best === null || $s < $best[0] + $best[1]) { $best = [$a, $ay[$anc]]; } } }
    return $best;
}
/** ce que x est pour y (« cousin germain », « grand-père ») sans l'article */
function dmo_label(int $a, int $b, string $gender): string
{
    $t = qm_kin_label($a, $b, $gender, false);
    return preg_replace('/(^|ou )(le |la |l’)/u', '$1', $t) ?? $t;
}
/** un nom de lien dans les deux sens (pour un trait entre deux personnes) */
function dmo_pair_kind(int $a, int $b): string
{
    if ($a > $b) { [$a, $b] = [$b, $a]; }
    if ($a === 0) { return $b === 1 ? 'parent et enfant' : ($b === 2 ? 'grand-parent et petit-enfant' : str_repeat('arrière-', $b - 2) . 'grand-parent'); }
    if ($a === 1 && $b === 1) { return 'frères et sœurs'; }
    if ($a === 1) { return $b === 2 ? 'oncle ou tante et neveu ou nièce' : 'grand-oncle ou grand-tante'; }
    $deg = $a - 1;
    $name = match ($deg) { 1 => 'cousins germains', 2 => 'cousins issus de germains', 3 => 'cousins issus d’issus de germains', default => 'cousins au ' . ($deg + 1) . 'e degré' };
    return $a === $b ? $name : ($deg === 1 && $b - $a === 1 ? 'à la mode de Bretagne' : $name . ' (décalés)');
}
function dmo_ids(string $raw, int $max): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', $raw)), static fn($x) => $x > 0)));
    return array_slice($ids, 0, $max);
}
function dmo_spouses(PDO $pdo, array $ids): array
{
    if (!$ids) { return []; }
    $in = implode(',', array_map('intval', $ids)); $out = [];
    foreach ($pdo->query("SELECT partner1_id AS a, partner2_id AS b FROM families WHERE partner1_id IN ($in) AND partner2_id IN ($in)") as $r) { $out[(int) $r['a'] . '|' . (int) $r['b']] = true; $out[(int) $r['b'] . '|' . (int) $r['a']] = true; }
    return $out;
}

/** 🔢 la matrice : cells[i][j] = ce que j est pour i */
function dmo_kinship(PDO $pdo, array $ids): array
{
    $lives = dmo_lives($pdo);
    $ids = array_values(array_filter($ids, static fn($id) => isset($lives[$id])));
    if (count($ids) < 2) { throw new LcndaBadInput('Choisis au moins deux personnes.'); }
    $anc = []; foreach ($ids as $id) { $anc[$id] = dmo_ancestors($id, 14); }
    $sp = dmo_spouses($pdo, $ids); $cells = [];
    foreach ($ids as $i => $x) {
        foreach ($ids as $j => $y) {
            if ($i === $j) { continue; }
            $k = dmo_closest($anc[$y], $anc[$x]);
            if ($k) { $cells[] = ['a' => $i, 'b' => $j, 'label' => dmo_label($k[0], $k[1], $lives[$y]['g']), 'degree' => $k[0] + $k[1]]; }
            elseif (isset($sp[$x . '|' . $y])) { $cells[] = ['a' => $i, 'b' => $j, 'label' => $lives[$y]['g'] === 'female' ? 'épouse' : ($lives[$y]['g'] === 'male' ? 'époux' : 'conjoint'), 'degree' => 0]; }
        }
    }
    return ['people' => array_map(static fn($id) => ['id' => $id, 'name' => $lives[$id]['name'], 'years' => trim(($lives[$id]['b'][0] ?? '') . '–' . ($lives[$id]['d'][0] ?? ''), '–')], $ids), 'cells' => $cells];
}

/** les cousins (même génération) d'une personne, jusqu'à l'ancêtre commun de N générations */
function dmo_same_gen(int $root, int $gens, int $max): array
{
    $L = dgn_links(db());
    $out = [$root => true]; $level = [$root]; $tops = [];
    for ($g = 1; $g <= $gens && $level; $g++) { $next = []; foreach ($level as $x) { foreach ($L['parents'][$x] ?? [] as $p) { $next[$p] = true; } } $level = array_keys($next); $tops[$g] = $level; }
    for ($g = 1; $g <= $gens; $g++) {
        foreach ($tops[$g] ?? [] as $t) {
            $lv = [$t];
            for ($k = 0; $k < $g && $lv; $k++) { $n = []; foreach ($lv as $x) { foreach ($L['children'][$x] ?? [] as $c) { $n[$c] = true; } } $lv = array_keys($n); }
            foreach ($lv as $c) { $out[$c] = true; if (count($out) >= $max) { break 3; } }
        }
    }
    return array_keys($out);
}

/** 🕸 graphe des cousinages : les personnes et leurs liens ; « closest » garde les liens les plus proches (et relie le tout) */
function dmo_cousins(PDO $pdo, array $ids, int $root, int $gens, string $links): array
{
    $lives = dmo_lives($pdo);
    $gens = max(1, min(6, $gens));
    if (!$ids) { $root = dgn_root($pdo, $root); if (!$root) { return ['nodes' => [], 'links' => []]; } $ids = dmo_same_gen($root, $gens, 40); }
    $ids = array_values(array_filter($ids, static fn($id) => isset($lives[$id])));
    $anc = []; foreach ($ids as $id) { $anc[$id] = dmo_ancestors($id, $gens + 6); }
    $pairs = [];
    foreach ($ids as $i => $x) { for ($j = $i + 1; $j < count($ids); $j++) { $y = $ids[$j]; $k = dmo_closest($anc[$x], $anc[$y]); if ($k && ($links === 'all' || max($k) <= $gens)) { $pairs[] = [$i, $j, $k[0] + $k[1], dmo_pair_kind($k[0], $k[1])]; } } }
    usort($pairs, static fn($p, $q) => $p[2] <=> $q[2]);
    if ($links !== 'all') { // les plus proches de chacun, plus de quoi relier les groupes entre eux
        $near = []; foreach ($pairs as [$i, $j, $d]) { $near[$i] = min($near[$i] ?? 99, $d); $near[$j] = min($near[$j] ?? 99, $d); }
        $par = range(0, max(0, count($ids) - 1)); $find = static function (int $x) use (&$par): int { while ($par[$x] !== $x) { $par[$x] = $par[$par[$x]]; $x = $par[$x]; } return $x; };
        $keep = [];
        foreach ($pairs as $p) { [$i, $j, $d] = $p; $ri = $find($i); $rj = $find($j); if ($ri !== $rj || $d <= $near[$i] || $d <= $near[$j]) { $keep[] = $p; if ($ri !== $rj) { $par[$ri] = $rj; } } }
        $pairs = $keep;
    }
    $pairs = array_slice($pairs, 0, 1500);
    $count = array_count_values(array_map(static fn($id) => $lives[$id]['name'], $ids));
    $label = static fn(int $id) => $count[$lives[$id]['name']] > 1 ? $lives[$id]['name'] . ' (' . ($lives[$id]['b'][0] ?? 'n° ' . $id) . ')' : $lives[$id]['name'];
    $nodes = array_map(static fn($id) => ['id' => $id, 'name' => $label($id), 'group' => mb_substr($lives[$id]['last'], 0, 60), 'root' => $id === $root], $ids);
    return ['nodes' => $nodes, 'links' => array_map(static fn($p) => ['a' => $nodes[$p[0]]['name'], 'b' => $nodes[$p[1]]['name'], 'kind' => $p[3], 'degree' => $p[2]], $pairs), 'root' => $root];
}

/* ═════════ 🪗 Arbre en accordéon ═════════ */
function dmo_accordion(PDO $pdo, int $root, int $up): array
{
    $up = max(1, min(5, $up));
    $root = dgn_root($pdo, $root);
    if (!$root) { return ['nodes' => []]; }
    $L = dgn_links($pdo); $lives = dmo_lives($pdo);
    $ar = dmo_ancestors($root, $up);
    // les sommets : les ancêtres les plus hauts de chaque ligne (N générations, ou plus bas quand la ligne s'arrête)
    $tops = [];
    foreach ($ar as $id => $d) { if ($d > 0 && ($d === $up || !($L['parents'][$id] ?? []))) { $tops[$id] = $d; } }
    if (!$tops) { $tops = [$root => 0]; }
    // un couple d'ancêtres = un seul sommet (le mari, ou la personne seule), son conjoint écrit à côté
    $spouseOf = [];
    foreach ($tops as $id => $d) { foreach ($tops as $id2 => $d2) { if ($id < $id2 && $d === $d2 && array_intersect($L['children'][$id] ?? [], $L['children'][$id2] ?? [])) { $spouseOf[$id] = $id2; $spouseOf[$id2] = $id; } } }
    $roots = [];
    foreach ($tops as $id => $d) { $s = $spouseOf[$id] ?? 0; if ($s && (($lives[$id]['g'] ?? '') === 'female' || (($lives[$s]['g'] ?? '') !== 'female' && $s < $id))) { continue; } $roots[] = $id; }
    usort($roots, static fn($a, $b) => $tops[$b] <=> $tops[$a] ?: $a <=> $b);
    $nodes = []; $seen = []; $max = 1500; $truncated = false;
    $years = static fn(int $id) => trim(($lives[$id]['b'][0] ?? '?') . '–' . ($lives[$id]['d'][0] ?? ($lives[$id]['living'] ?? false ? '' : '?')), '–');
    $kinOf = static function (int $id) use ($ar, $root, $lives, $up): array {
        if ($id === $root) { return ['moi (personne de départ)', 0]; }
        $k = dmo_closest(dmo_ancestors($id, $up + 1), $ar);
        return $k ? [dmo_label($k[0], $k[1], $lives[$id]['g'] ?? ''), $k[0] + $k[1]] : ['', 99];
    };
    $walk = static function (int $id, string $parentKey, int $gen) use (&$walk, &$nodes, &$seen, &$truncated, $max, $L, $lives, $spouseOf, $years, $kinOf, $ar): void {
        if (count($nodes) >= $max) { $truncated = true; return; }
        if (isset($seen[$id])) { return; } // déjà dans l'arbre (enfant d'un autre couple d'ancêtres, implexe) : une seule fois
        $key = 'p' . $id; $again = false; $seen[$id] = true;
        $sp = $spouseOf[$id] ?? 0;
        [$kin, $deg] = $kinOf($id);
        $nodes[] = ['key' => $again ? $key . '-' . count($nodes) : $key, 'id' => $id, 'name' => ($lives[$id]['name'] ?? 'Sans nom') . ($sp ? ' × ' . ($lives[$sp]['name'] ?? '') : ''), 'parent' => $parentKey, 'gen' => $gen,
            'years' => $years($id), 'sex' => ($lives[$id]['g'] ?? '') === 'male' ? 'h' : (($lives[$id]['g'] ?? '') === 'female' ? 'f' : ''), 'kin' => $again ? $kin . ' (déjà plus haut)' : $kin, 'degree' => $deg, 'anc' => isset($ar[$id])];
        if ($again || $gen <= 0) { return; }
        $kids = array_values(array_unique(array_merge($L['children'][$id] ?? [], $sp ? ($L['children'][$sp] ?? []) : [])));
        usort($kids, static fn($a, $b) => dmo_iso($lives[$a]['b'] ?? null) <=> dmo_iso($lives[$b]['b'] ?? null));
        $me = end($nodes)['key'];
        foreach ($kids as $c) { $walk($c, $me, $gen - 1); }
    };
    foreach ($roots as $r) { $walk($r, '', $tops[$r]); }
    return ['root' => $root, 'root_name' => $lives[$root]['name'] ?? '', 'nodes' => $nodes, 'truncated' => $truncated];
}

/* ═════════ 🌳 Arbre des patronymes ═════════ */
/** une clé de nom : sans accents, sans lettres doublées, quelques terminaisons muettes (Martin = Martins = Marttin) */
function dmo_name_key(string $s): string
{
    $t = strtoupper(function_exists('ascii_fold') ? ascii_fold($s) : $s);
    $t = preg_replace('/[^A-Z]/', '', $t) ?? '';
    $t = preg_replace('/^(DE|DU|LE|LA|DES)(?=[A-Z]{3})/', '', $t) ?? $t;
    $t = strtr($t, ['Y' => 'I', 'PH' => 'F', 'CK' => 'K', 'QU' => 'K']);
    $t = preg_replace('/(.)\1+/', '$1', $t) ?? $t;
    $t = preg_replace('/(S|X|Z|T|D|E)+$/', '', $t) ?? $t;
    return $t !== '' ? $t : strtoupper(trim($s));
}
function dmo_surnames(PDO $pdo, int $root, int $gens): array
{
    $gens = max(2, min(14, $gens));
    $root = dgn_root($pdo, $root);
    if (!$root) { return ['rows' => []]; }
    $map = dgn_sosa($pdo, $root, $gens, 20000);
    $lives = dmo_lives($pdo);
    $groups = [];
    try { foreach ($pdo->query('SELECT p.id, g.name FROM persons p JOIN surname_groups g ON g.id=p.surname_group_id WHERE p.surname_group_id IS NOT NULL') as $r) { $groups[(int) $r['id']] = (string) $r['name']; } } catch (Throwable) {}
    $placeName = [];
    $keyOf = static function (int $pid) use ($lives, $groups): string { $l = trim($lives[$pid]['last'] ?? ''); if ($l === '') { return ''; } return isset($groups[$pid]) ? 'G:' . mb_strtoupper($groups[$pid]) : 'N:' . dmo_name_key($l); };
    $nodes = []; // clé → infos
    ksort($map);
    foreach ($map as $s => $pid) {
        $k = $keyOf($pid); if ($k === '') { continue; }
        $g = (int) floor(log((float) $s, 2)) + 1;
        $n = &$nodes[$k];
        if ($n === null) { $n = ['key' => $k, 'spell' => [], 'per' => [], 'entry' => null, 'parent' => '', 'group' => $groups[$pid] ?? '']; }
        $l = trim($lives[$pid]['last']); $n['spell'][$l] = ($n['spell'][$l] ?? 0) + 1;
        $n['per'][$g] = ($n['per'][$g] ?? 0) + 1;
        // le nom entre dans l'arbre par la personne de départ ou par une femme (n° Sosa impair) dont l'enfant ne le porte pas
        $child = $s > 1 ? ($map[intdiv($s, 2)] ?? 0) : 0;
        $enters = $s === 1 || ($child && $keyOf($child) !== $k) || ($s % 2 === 0 && !$child);
        if ($enters && ($n['entry'] === null || $s < $n['entry']['s'])) {
            $bp = $lives[$pid]['bp'] ?? 0;
            if ($bp && !isset($placeName[$bp])) { $st = $pdo->prepare('SELECT name FROM places WHERE id=?'); $st->execute([$bp]); $placeName[$bp] = trim(explode(',', (string) $st->fetchColumn())[0]); }
            $n['entry'] = ['s' => $s, 'g' => $g, 'pid' => $pid, 'who' => $lives[$pid]['name'], 'year' => $lives[$pid]['b'][0] ?? null, 'place' => $bp ? $placeName[$bp] : ''];
            $n['parent'] = $child ? $keyOf($child) : '';
        }
        unset($n);
    }
    $label = static function (array $n): string { if ($n['group'] !== '') { return mb_strtoupper($n['group']); } arsort($n['spell']); return mb_strtoupper((string) array_key_first($n['spell'])); };
    $rows = [];
    foreach ($nodes as $k => $n) {
        if (!$n['entry']) { $n['entry'] = ['s' => 0, 'g' => min(array_keys($n['per'])), 'who' => '', 'year' => null, 'place' => '']; }
        $per = []; for ($g = 1; $g <= $gens; $g++) { $per[] = $n['per'][$g] ?? 0; }
        while ($per && end($per) === 0) { array_pop($per); }
        $variants = array_keys($n['spell']); usort($variants, static fn($a, $b) => $n['spell'][$b] <=> $n['spell'][$a]);
        $rows[] = ['name' => $label($n), 'parent' => $n['parent'] !== '' && isset($nodes[$n['parent']]) && $n['parent'] !== $k ? $label($nodes[$n['parent']]) : '', 'gen' => $n['entry']['g'],
            'year' => $n['entry']['year'] !== null ? (string) $n['entry']['year'] : '', 'place' => mb_substr((string) $n['entry']['place'], 0, 60), 'who' => mb_substr((string) $n['entry']['who'], 0, 80),
            'counts' => implode(',', $per), 'variants' => implode(', ', array_slice(array_map(static fn($v) => mb_substr($v, 0, 40), $variants), 0, 8))];
    }
    usort($rows, static fn($a, $b) => $a['gen'] <=> $b['gen'] ?: strcmp($a['name'], $b['name']));
    return ['root' => $root, 'root_name' => $lives[$root]['name'] ?? '', 'gens' => $gens, 'rows' => array_slice($rows, 0, 600)];
}

/* ═════════ 🎻 Mariages entre villages ═════════ */
function dmo_chord(PDO $pdo, string $mode, int $top): array
{
    $top = max(3, min(30, $top));
    $lives = dmo_lives($pdo);
    $names = [];
    foreach ($pdo->query("SELECT id, name FROM places") as $r) { $n = trim(explode(',', (string) $r['name'])[0]); if ($n !== '') { $names[(int) $r['id']] = mb_substr($n, 0, 60); } }
    $sql = "SELECT f.id, f.partner1_id AS a, f.partner2_id AS b, (SELECT e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag IN ('MARR','MARB','MARC') AND e.place_id IS NOT NULL ORDER BY t.gedcom_tag='MARR' DESC LIMIT 1) AS mp FROM families f";
    $pairs = []; $count = []; $grp = dgo_restrict($pdo, null);
    foreach ($pdo->query($sql) as $f) {
        if ($grp !== null && !isset($grp[(int) $f['a']]) && !isset($grp[(int) $f['b']])) { continue; } // un des deux époux dans le groupe choisi
        $pa = $names[$lives[(int) $f['a']]['bp'] ?? 0] ?? ''; $pb = $names[$lives[(int) $f['b']]['bp'] ?? 0] ?? ''; $pm = $names[(int) $f['mp']] ?? '';
        $list = $mode === 'marriage' ? [[$pa, $pm], [$pb, $pm]] : [[$pa, $pb]];
        foreach ($list as [$x, $y]) {
            if ($x === '' || $y === '') { continue; }
            if ($mode !== 'marriage' && strcmp($x, $y) > 0) { [$x, $y] = [$y, $x]; }
            $pairs[$x . "\0" . $y] = ($pairs[$x . "\0" . $y] ?? 0) + 1; $count[$x] = ($count[$x] ?? 0) + 1; $count[$y] = ($count[$y] ?? 0) + 1;
        }
    }
    arsort($count); $keep = array_slice($count, 0, $top, true);
    $agg = [];
    foreach ($pairs as $k => $n) { [$x, $y] = explode("\0", $k); $x = isset($keep[$x]) ? $x : 'Autres'; $y = isset($keep[$y]) ? $y : 'Autres'; $agg[$x . "\0" . $y] = ($agg[$x . "\0" . $y] ?? 0) + $n; }
    arsort($agg);
    $rows = []; foreach ($agg as $k => $n) { [$x, $y] = explode("\0", $k); $rows[] = ['from' => $x, 'to' => $y, 'value' => $n]; }
    return ['rows' => array_slice($rows, 0, 900), 'places' => count($count)];
}

function diagram_more_data(PDO $pdo, array $q): array
{
    $q = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $q);
    $what = $q['what'] ?? '';
    dgo_request($q); // groupe de personnes et période communs (onglet « Depuis l'app »)
    return match ($what) {
        'crises' => dmo_crises($pdo, $q),
        'siblings' => dmo_siblings($pdo, (int) ($q['person'] ?? 0), ($q['mode'] ?? '') === 'children' ? 'children' : 'siblings'),
        'alive' => dmo_alive($pdo),
        'accordion' => dmo_accordion($pdo, (int) ($q['root'] ?? 0), (int) ($q['up'] ?? 2)),
        'kinship' => dmo_kinship($pdo, dmo_ids($q['ids'] ?? '', 24)),
        'cousins' => dmo_cousins($pdo, dmo_ids($q['ids'] ?? '', 60), (int) ($q['root'] ?? 0), (int) ($q['gens'] ?? 3), ($q['links'] ?? '') === 'all' ? 'all' : 'closest'),
        'surnames' => dmo_surnames($pdo, (int) ($q['root'] ?? 0), (int) ($q['gens'] ?? 8)),
        'chord' => dmo_chord($pdo, ($q['mode'] ?? '') === 'marriage' ? 'marriage' : 'spouses', (int) ($q['top'] ?? 10)),
        default => throw new LcndaBadInput('Données inconnues.'),
    };
}
