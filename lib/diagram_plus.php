<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 Douze diagrammes de plus (assets/js/heritage-diagram-plus.js, calculs : assets/js/app-diagram-plus-core.js) :
 * les données prises dans l'arbre. GET api.php?action=diagram_plus&what=…  (lecture seule, tout est borné ; les textes sont
 * échappés dans le navigateur).
 *  - kinpath     : 🔗 chemin de parenté — les ancêtres des deux personnes (et de leurs conjoints), leurs liens ; le chemin
 *                  lui-même est calculé dans le navigateur (LCNDA_DIAGPLUS.kinPath, testé dans Node) ;
 *  - ancplaces   : 🎯 centre de gravité et 🌈 carte des générations — le lieu de naissance de chaque ancêtre (numéro Sosa) ;
 *  - completeness: 🧩 complétude — places trouvées et personnes différentes par génération, numéros connus (éventail) ;
 *  - ahnentafel  : 📜 tableau d'ascendance — une ligne par numéro Sosa ;
 *  - wheel       : 🎡 roue de l'année — anniversaires (naissance, mariage, décès) au jour près, fêtes des prénoms ;
 *  - periods     : 📊 ↔️ naissances, décès, âge moyen au décès par période ; surnames : 🏔 naissances par nom et par période ;
 *  - alive       : 📶 combien étaient en vie chaque année ; parallel : 🧵 âges au mariage, au premier enfant, au décès, enfants.
 * Confidentialité : une fiche confidentielle n'est jamais nommée (« Fiche confidentielle », sans lien) ; avec share=1
 * (« pour partager ») ou en mode consultation 🔒, un vivant devient « Personne vivante » (règle de l'export pour partager,
 * df_hidden_people / gedcom_share_hidden).
 */

require_once __DIR__ . '/diagram_chiffres.php'; // dchf_date, dchf_marriages
require_once __DIR__ . '/diagram_genea.php';    // dgn_links, dgn_root, dgn_sosa, dgn_name, dgn_people_info
require_once __DIR__ . '/diagram_more.php';     // dmo_lives, dmo_iso
require_once __DIR__ . '/diagram_options.php';  // dgo_request, dgo_restrict
require_once __DIR__ . '/dates_feter.php';      // df_hidden_people, df_first_name

const DPL_WHAT = ['kinpath', 'ancplaces', 'completeness', 'ahnentafel', 'wheel', 'periods', 'surnames', 'alive', 'parallel'];

/** vivants et fiches confidentielles : id => 'living' | 'private' ; et faut-il cacher les vivants ? */
function dpl_privacy(PDO $pdo, bool $share): array
{
    static $hidden = null;
    $hidden ??= df_hidden_people($pdo);
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    return [$hidden, $share || $kiosk];
}

/** le nom montré et le numéro de fiche (0 = pas de lien) */
function dpl_who(int $id, array $lives, array $priv): array
{
    [$hidden, $maskLiving] = $priv;
    $h = $hidden[$id] ?? '';
    if ($h === 'private') { return ['Fiche confidentielle', 0, true]; }
    if ($h === 'living' && $maskLiving) { return ['Personne vivante', 0, true]; }
    return [$lives[$id]['name'] ?? 'Sans nom', $id, false];
}

function dpl_years(array $p): string
{
    $b = $p['b'][0] ?? null; $d = $p['d'][0] ?? null;
    return $b || $d ? trim(($b ?: '?') . '–' . ($d ?: ($p['living'] ? '' : '?')), '–') : '';
}

/** les ancêtres d'une personne (ids), au plus $max */
function dpl_anc(array $L, int $id, int $gens = 40, int $max = 6000): array
{
    $out = [$id => true]; $level = [$id];
    for ($g = 0; $g < $gens && $level && count($out) < $max; $g++) {
        $next = [];
        foreach ($level as $x) { foreach ($L['parents'][$x] ?? [] as $p) { $p = (int) $p; if ($p && !isset($out[$p])) { $out[$p] = true; $next[] = $p; } } }
        $level = $next;
    }
    return $out;
}

/** conjoints : id => [ids] */
function dpl_spouses(PDO $pdo): array
{
    static $sp = null;
    if ($sp !== null) { return $sp; }
    $sp = [];
    foreach ($pdo->query('SELECT partner1_id AS a, partner2_id AS b FROM families WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL') as $r) {
        $a = (int) $r['a']; $b = (int) $r['b']; if (!$a || !$b || $a === $b) { continue; }
        $sp[$a][$b] = true; $sp[$b][$a] = true;
    }
    return $sp;
}

/* ═════════ 🔗 Chemin de parenté ═════════ */
function dpl_kinpath(PDO $pdo, int $a, int $b, bool $alliances, bool $share): array
{
    $lives = dmo_lives($pdo);
    if (!isset($lives[$a]) || !isset($lives[$b])) { throw new LcndaBadInput('Choisis deux personnes.'); }
    $L = dgn_links($pdo); $SP = dpl_spouses($pdo); $priv = dpl_privacy($pdo, $share);
    $set = dpl_anc($L, $a) + dpl_anc($L, $b);
    if ($alliances) { // les conjoints des deux personnes (et leurs ancêtres) : beaux-parents, cousins du conjoint…
        foreach ([$a, $b] as $x) { foreach (array_keys($SP[$x] ?? []) as $s) { $set += dpl_anc($L, (int) $s, 40, 3000); } }
        foreach (array_keys($set) as $x) { foreach (array_keys($SP[$x] ?? []) as $s) { $set[(int) $s] = true; } } // l'épouse de l'oncle…
    }
    $common = array_intersect_key(dpl_anc($L, $a), dpl_anc($L, $b));
    $found = (bool) $common; $via = 'blood';
    if (!$found && $alliances) { // pas d'ancêtre commun : un chemin quelconque (parents, enfants, conjoints), puis ses ancêtres
        $prev = [$a => 0]; $queue = [$a]; $head = 0; $n = 0;
        while ($head < count($queue) && $n++ < 300000) {
            $x = $queue[$head++]; if ($x === $b) { break; }
            $next = array_merge(array_map('intval', $L['parents'][$x] ?? []), array_map('intval', $L['children'][$x] ?? []), array_map('intval', array_keys($SP[$x] ?? [])));
            foreach ($next as $y) { if ($y && !isset($prev[$y])) { $prev[$y] = $x; $queue[] = $y; } }
        }
        if (isset($prev[$b])) { $found = true; $via = 'any'; for ($x = $b; $x; $x = $prev[$x]) { $set[$x] = true; if (count($set) < 14000) { foreach (array_keys(dpl_anc($L, $x, 6, 200)) as $y) { $set[$y] = true; } } } }
    }
    if (count($set) > 15000) { $set = array_slice($set, 0, 15000, true); $set[$a] = true; $set[$b] = true; }
    $nodes = [];
    foreach (array_keys($set) as $id) {
        if (!isset($lives[$id])) { continue; }
        [$name, $pid, $masked] = dpl_who($id, $lives, $priv);
        $nodes[$id] = ['n' => $name, 'pid' => $pid, 's' => $lives[$id]['g'] === 'male' ? 'h' : ($lives[$id]['g'] === 'female' ? 'f' : ''), 'y' => $masked ? '' : dpl_years($lives[$id]),
            'p' => array_values(array_filter(array_map('intval', $L['parents'][$id] ?? []), static fn($p) => isset($set[$p]))),
            'sp' => array_values(array_filter(array_map('intval', array_keys($SP[$id] ?? [])), static fn($s) => isset($set[$s])))];
    }
    return ['a' => $a, 'b' => $b, 'found' => $found, 'via' => $via, 'nodes' => $nodes, 'name_a' => $nodes[$a]['n'] ?? '', 'name_b' => $nodes[$b]['n'] ?? ''];
}

/* ═════════ 🎯 🌈 Lieux de naissance des ancêtres ═════════ */
function dpl_ancplaces(PDO $pdo, int $root, int $gens, bool $share): array
{
    $root = dgn_root($pdo, $root); if (!$root) { return ['root' => 0, 'rows' => [], 'missing' => 0]; }
    $gens = max(2, min(16, $gens));
    $lives = dmo_lives($pdo); $priv = dpl_privacy($pdo, $share);
    $map = dgn_sosa($pdo, $root, $gens, 40000); $need = [];
    foreach ($map as $pid) { $bp = $lives[$pid]['bp'] ?? 0; if ($bp) { $need[$bp] = true; } }
    $pl = [];
    foreach (array_chunk(array_keys($need), 500) as $chunk) {
        foreach ($pdo->query('SELECT id, name, latitude AS la, longitude AS lo FROM places WHERE id IN (' . implode(',', $chunk) . ')') as $p) {
            if ($p['la'] === null || $p['lo'] === null || ((float) $p['la'] === 0.0 && (float) $p['lo'] === 0.0)) { continue; }
            $pl[(int) $p['id']] = [mb_substr(trim(explode(',', (string) $p['name'])[0]), 0, 60), round((float) $p['la'], 4), round((float) $p['lo'], 4)];
        }
    }
    $rows = []; $missing = 0;
    foreach ($map as $sosa => $pid) {
        if (($priv[0][$pid] ?? '') === 'private') { continue; }
        $p = $pl[$lives[$pid]['bp'] ?? 0] ?? null; if (!$p) { $missing++; continue; }
        [$name, $id] = dpl_who((int) $pid, $lives, $priv);
        $rows[] = ['sosa' => (int) $sosa, 'gen' => (int) floor(log((float) $sosa, 2)) + 1, 'name' => $name, 'pid' => $id, 'place' => $p[0], 'lat' => $p[1], 'lon' => $p[2], 'year' => $lives[$pid]['b'][0] ?? null];
        if (count($rows) >= 20000) { break; }
    }
    return ['root' => $root, 'root_name' => dpl_who($root, $lives, $priv)[0], 'rows' => $rows, 'missing' => $missing];
}

/* ═════════ 🧩 Complétude ═════════ */
function dpl_completeness(PDO $pdo, int $root, int $gens): array
{
    $root = dgn_root($pdo, $root); if (!$root) { return ['root' => 0, 'rows' => [], 'known' => []]; }
    $gens = max(2, min(30, $gens));
    $map = dgn_sosa($pdo, $root, $gens, 300000);
    $found = []; $distinct = []; $ids = [];
    foreach ($map as $s => $pid) {
        $g = (int) floor(log((float) $s, 2)) + 1; if ($g > $gens) { continue; }
        $found[$g] = ($found[$g] ?? 0) + 1; $distinct[$g][$pid] = true;
        if (count($ids[$g] ?? []) < 300) { $ids[$g][] = (int) $pid; }
    }
    $rows = [];
    for ($g = 1; $g <= $gens; $g++) {
        $rows[] = ['gen' => $g, 'theo' => $g <= 53 ? (string) (2 ** ($g - 1)) : '', 'found' => $found[$g] ?? 0, 'distinct' => count($distinct[$g] ?? []), 'ids' => implode(',', array_unique($ids[$g] ?? []))];
    }
    $known = array_values(array_filter(array_map('intval', array_keys($map)), static fn($s) => $s < 1024));
    $lives = dmo_lives($pdo);
    return ['root' => $root, 'root_name' => dpl_who($root, $lives, dpl_privacy($pdo, false))[0], 'rows' => $rows, 'known' => $known, 'truncated' => count($map) >= 300000];
}

/* ═════════ 📜 Tableau d'ascendance ═════════ */
function dpl_ahnentafel(PDO $pdo, int $root, int $gens, bool $share): array
{
    $root = dgn_root($pdo, $root); if (!$root) { return ['root' => 0, 'rows' => []]; }
    $gens = max(1, min(12, $gens));
    $map = dgn_sosa($pdo, $root, $gens, 4096);
    $info = dgn_people_info($pdo, array_values(array_unique($map)));
    $lives = dmo_lives($pdo); $priv = dpl_privacy($pdo, $share);
    // les mariages (date, lieu) de chaque couple
    $mar = [];
    $q = $pdo->query("SELECT f.partner1_id AS a, f.partner2_id AS b, COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT), '') AS d, COALESCE(pl.name,'') AS place FROM families f
        JOIN events e ON e.family_id=f.id JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE t.gedcom_tag IN ('MARR','MRCI','MRRE') ORDER BY t.gedcom_tag='MARR' DESC, e.id");
    foreach ($q as $m) { $k = min((int) $m['a'], (int) $m['b']) . '|' . max((int) $m['a'], (int) $m['b']); if (!isset($mar[$k]) || ($mar[$k][0] === '' && $m['d'] !== '')) { $mar[$k] = [mb_substr((string) $m['d'], 0, 20), mb_substr(trim(explode(',', (string) $m['place'])[0]), 0, 80)]; } }
    $first = []; $rows = [];
    ksort($map);
    foreach ($map as $s => $pid) {
        $s = (int) $s; $pid = (int) $pid; $i = $info[$pid] ?? null; if (!$i) { continue; }
        [$name, $id, $masked] = dpl_who($pid, $lives, $priv);
        $again = $first[$pid] ?? 0; $first[$pid] ??= $s;
        $m = ['', ''];
        if ($s > 1) { $other = $map[$s % 2 ? $s - 1 : $s + 1] ?? 0; if ($other) { $k = min($pid, (int) $other) . '|' . max($pid, (int) $other); $m = $mar[$k] ?? ['', '']; } }
        $rows[] = ['sosa' => $s, 'gen' => (int) floor(log((float) $s, 2)) + 1, 'name' => $name, 'pid' => $id, 'sex' => $i['gender'] === 'male' ? 'h' : ($i['gender'] === 'female' ? 'f' : ''),
            'birth' => $masked ? '' : $i['birth'], 'bplace' => $masked ? '' : $i['birth_place'], 'death' => $masked ? '' : $i['death'], 'dplace' => $masked ? '' : $i['death_place'],
            'marriage' => $masked ? '' : $m[0], 'mplace' => $masked ? '' : $m[1], 'job' => $masked ? '' : $i['occupation'], 'again' => $again ? (string) $again : ''];
    }
    return ['root' => $root, 'root_name' => dpl_who($root, $lives, $priv)[0], 'rows' => $rows, 'truncated' => count($map) >= 4096];
}

/* ═════════ 🎡 Roue de l'année ═════════ */
function dpl_wheel(PDO $pdo, string $who, array $kinds, int $root, bool $share): array
{
    require_once __DIR__ . '/calendars.php';
    require_once __DIR__ . '/saints.php';
    $lives = dmo_lives($pdo); $priv = dpl_privacy($pdo, $share); [$hidden] = $priv;
    $keep = null;
    if ($who === 'anc') { $r = dgn_root($pdo, $root); $keep = $r ? array_fill_keys(array_map('intval', array_values(dgn_sosa($pdo, $r, 14, 20000))), true) : []; }
    $keep = dgo_restrict($pdo, $keep);
    $rows = [];
    $TAG = ['birth' => 'BIRT', 'union' => 'MARR', 'death' => 'DEAT'];
    $tags = array_values(array_map(static fn($k) => $TAG[$k], array_intersect($kinds, array_keys($TAG))));
    if ($tags) {
        foreach (genea_calendar_events($pdo, [], null, $tags)['events'] as $e) {
            if ($e['approx'] || !$e['m'] || !$e['d'] || !$e['who']) { continue; }
            $tag = $e['tag']; $kind = $tag === 'BIRT' ? 'birth' : ($tag === 'MARR' ? 'union' : 'death');
            $ids = array_map(static fn($w) => (int) $w['id'], $e['who']);
            if (array_filter($ids, static fn($id) => ($hidden[$id] ?? '') === 'private' || !isset($lives[$id]))) { continue; } // jamais une fiche confidentielle (ni un animal)
            $living = (bool) array_filter($ids, static fn($id) => ($hidden[$id] ?? '') === 'living');
            if ($who === 'living' && (!$living || $kind === 'death')) { continue; }
            if ($keep !== null && !array_filter($ids, static fn($id) => isset($keep[$id]))) { continue; }
            $names = array_map(static fn($id) => dpl_who($id, $lives, $priv), $ids);
            $masked = (bool) array_filter($names, static fn($n) => $n[2]);
            $rows[] = ['date' => sprintf('%02d-%02d', $e['m'], $e['d']), 'kind' => $kind, 'label' => implode(' et ', array_map(static fn($n) => $n[0], $names)), 'year' => $masked ? '' : (string) $e['y'],
                'pid' => count($ids) === 1 ? $names[0][1] : 0, 'ids' => implode(',', array_filter(array_map(static fn($n) => $n[1], $names)))];
            if (count($rows) >= 2500) { break; }
        }
    }
    if (in_array('fete', $kinds, true)) { // la fête du prénom des personnes en vie (ou des ancêtres choisis)
        $n = 0;
        foreach ($pdo->query("SELECT id, first_name FROM persons WHERE COALESCE(kind,'')<>'animal'") as $p) {
            $id = (int) $p['id']; if (($hidden[$id] ?? '') === 'private' || !isset($lives[$id])) { continue; }
            if ($keep !== null ? !isset($keep[$id]) : ($hidden[$id] ?? '') !== 'living') { continue; }
            $days = saint_days_for_name((string) $p['first_name']); if (!$days) { continue; }
            [$md, $saint] = $days[0];
            [$name, $pid] = dpl_who($id, $lives, $priv);
            if ($name === 'Personne vivante') { $name = df_first_name((string) $p['first_name']); } // une fête se souhaite au prénom
            $rows[] = ['date' => $md, 'kind' => 'fete', 'label' => $name . ' (saint ' . $saint . ')', 'year' => '', 'pid' => $pid, 'ids' => $pid ? (string) $pid : ''];
            if (++$n >= 400) { break; }
        }
    }
    return ['rows' => $rows];
}

/* ═════════ Chiffres par période ═════════ */
/** les personnes comptées (le groupe choisi dans « Depuis l'app ») */
function dpl_people(PDO $pdo, string $scope, int $root): array
{
    $lives = dmo_lives($pdo); $keep = null;
    if ($scope === 'anc') { $r = dgn_root($pdo, $root); $keep = $r ? array_fill_keys(array_map('intval', array_values(dgn_sosa($pdo, $r, 30, 60000))), true) : []; }
    $keep = dgo_restrict($pdo, $keep);
    $hidden = dpl_privacy($pdo, false)[0];
    return array_filter($lives, static fn($p) => ($hidden[$p['id']] ?? '') !== 'private' && ($keep === null || isset($keep[$p['id']])));
}
function dpl_bucket(int $y, int $step): int { return (int) (floor($y / $step) * $step); }

function dpl_periods(PDO $pdo, string $scope, int $root, int $step): array
{
    $step = in_array($step, [5, 10, 20, 25, 50, 100], true) ? $step : 10;
    $B = [];
    $add = static function (int $y, string $k, int $id) use (&$B, $step): void {
        $b = dpl_bucket($y, $step);
        $B[$b] ??= ['births' => 0, 'births_h' => 0, 'births_f' => 0, 'deaths' => 0, 'deaths_h' => 0, 'deaths_f' => 0, 'ages' => [], 'ids' => [], 'dids' => []];
        $B[$b][$k]++;
        if ($k === 'births' && count($B[$b]['ids']) < 300) { $B[$b]['ids'][] = $id; }
        if ($k === 'deaths' && count($B[$b]['dids']) < 300) { $B[$b]['dids'][] = $id; }
    };
    foreach (dpl_people($pdo, $scope, $root) as $p) {
        $sx = $p['g'] === 'male' ? '_h' : ($p['g'] === 'female' ? '_f' : '');
        if ($p['b']) { $add($p['b'][0], 'births', $p['id']); if ($sx) { $add($p['b'][0], 'births' . $sx, $p['id']); } }
        if ($p['d']) {
            $add($p['d'][0], 'deaths', $p['id']); if ($sx) { $add($p['d'][0], 'deaths' . $sx, $p['id']); }
            if ($p['b']) { $age = dchf_age($p['b'], $p['d']); if ($age !== null) { $B[dpl_bucket($p['d'][0], $step)]['ages'][] = $age; } }
        }
    }
    ksort($B);
    $rows = [];
    foreach ($B as $y => $v) {
        if ($y < -3000 || $y > 3000) { continue; }
        $rows[] = ['label' => $step >= 100 ? (string) $y : $y . '–' . ($y + $step - 1), 'from' => $y, 'births' => $v['births'], 'births_h' => $v['births_h'], 'births_f' => $v['births_f'], 'deaths' => $v['deaths'], 'deaths_h' => $v['deaths_h'], 'deaths_f' => $v['deaths_f'],
            'age' => $v['ages'] ? round(array_sum($v['ages']) / count($v['ages']), 1) : null, 'ids' => implode(',', $v['ids']), 'dids' => implode(',', $v['dids'])];
    }
    if (count($rows) > 400) { $rows = array_slice($rows, -400); }
    return ['step' => $step, 'rows' => $rows];
}

function dpl_surnames(PDO $pdo, string $scope, int $root, int $step, int $top): array
{
    $step = in_array($step, [10, 20, 25, 50, 100], true) ? $step : 25; $top = max(2, min(15, $top));
    $count = []; $cell = []; $min = null; $max = null;
    foreach (dpl_people($pdo, $scope, $root) as $p) {
        $n = trim($p['last']); if ($n === '' || !$p['b']) { continue; }
        $k = mb_strtoupper(mb_substr($n, 0, 60)); $b = dpl_bucket($p['b'][0], $step);
        $count[$k] = ($count[$k] ?? 0) + 1; $cell[$k][$b] = ($cell[$k][$b] ?? 0) + 1;
        $min = $min === null ? $b : min($min, $b); $max = $max === null ? $b : max($max, $b);
    }
    arsort($count); $names = array_slice(array_keys($count), 0, $top);
    if ($min === null || !$names) { return ['labels' => [], 'series' => []]; }
    if (($max - $min) / $step > 200) { $min = $max - 200 * $step; }
    $labels = []; for ($y = $min; $y <= $max; $y += $step) { $labels[] = (string) $y; }
    $series = array_map(static fn($k) => ['name' => mb_convert_case(mb_strtolower($k), MB_CASE_TITLE), 'values' => array_map(static fn($l) => $cell[$k][(int) $l] ?? 0, $labels)], $names);
    return ['step' => $step, 'labels' => $labels, 'series' => $series];
}

function dpl_alive(PDO $pdo, string $scope, int $root, ?int $from, ?int $to): array
{
    $now = (int) date('Y'); $diff = []; $lo = null; $hi = null; $n = 0;
    foreach (dpl_people($pdo, $scope, $root) as $p) {
        if (!$p['b']) { continue; }
        $b = $p['b'][0]; $d = $p['d'][0] ?? null;
        if ($d === null) { $d = $p['living'] || $b > $now - 100 ? $now : $b + 60; } // décès inconnu d'une naissance ancienne : 60 ans après (comme « Les vivants de l'arbre »)
        $d = max($b, min($d, $now)); $n++;
        $diff[$b] = ($diff[$b] ?? 0) + 1; $diff[$d + 1] = ($diff[$d + 1] ?? 0) - 1;
        $lo = $lo === null ? $b : min($lo, $b); $hi = $hi === null ? $d : max($hi, $d);
    }
    if ($lo === null) { return ['rows' => [], 'people' => 0]; }
    $from ??= $lo; $to ??= min($now, $hi); if ($to < $from) { [$from, $to] = [$to, $from]; } if ($to - $from > 3000) { $from = $to - 3000; }
    ksort($diff); $cur = 0; $rows = [];
    foreach ($diff as $y => $v) { if ($y > $from) { break; } $cur += $v; }
    for ($y = $from; $y <= $to; $y++) { if ($y > $from) { $cur += $diff[$y] ?? 0; } $rows[] = ['year' => $y, 'n' => $cur]; }
    return ['rows' => $rows, 'people' => $n];
}

function dpl_parallel(PDO $pdo, string $scope, int $root, int $max): array
{
    $max = max(10, min(600, $max));
    $L = dgn_links($pdo); $first = [];
    foreach (dchf_marriages($pdo) as $m) { foreach ([$m['p1'], $m['p2']] as $id) { if ($id && (!isset($first[$id]) || $m['date'][0] < $first[$id][0])) { $first[$id] = $m['date']; } } }
    $people = dpl_people($pdo, $scope, $root); $lives = dmo_lives($pdo); $priv = dpl_privacy($pdo, false); $rows = [];
    foreach ($people as $id => $p) {
        if (!$p['b'] || ($priv[0][$id] ?? '') === 'living') { continue; } // des vies finies : pas de vivant
        $kids = array_values(array_filter(array_map('intval', $L['children'][$id] ?? []), static fn($c) => isset($lives[$c])));
        $kb = array_filter(array_map(static fn($c) => $lives[$c]['b'] ?? null, $kids));
        usort($kb, static fn($x, $y) => $x[0] <=> $y[0]);
        $vals = ['marr' => isset($first[$id]) ? dchf_age($p['b'], $first[$id]) : null, 'child' => $kb ? dchf_age($p['b'], $kb[0]) : null, 'kids' => $kids ? count($kids) : null, 'death' => $p['d'] ? dchf_age($p['b'], $p['d']) : null];
        if (count(array_filter($vals, static fn($v) => $v !== null)) < 3) { continue; }
        $c = intdiv($p['b'][0] - 1, 100) + 1;
        $rows[] = ['label' => $p['name'], 'group' => dchf_century($p['b'][0]), 'sort' => $c] + array_map(static fn($v) => $v === null ? '' : (string) $v, $vals) + ['pid' => $id];
    }
    usort($rows, static fn($x, $y) => $x['sort'] <=> $y['sort']);
    if (count($rows) > $max) { $keep = []; $stepK = count($rows) / $max; for ($i = 0; $i < $max; $i++) { $keep[] = $rows[(int) floor($i * $stepK)]; } $rows = $keep; } // un échantillon régulier
    return ['rows' => array_map(static function ($r) { unset($r['sort']); return $r; }, $rows)];
}

function diagram_plus_data(PDO $pdo, array $q): array
{
    $q = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $q);
    $what = (string) ($q['what'] ?? '');
    if (!in_array($what, DPL_WHAT, true)) { throw new LcndaBadInput('Données inconnues.'); }
    dgo_request($q); // groupe de personnes et période communs (onglet « Depuis l'app »)
    $root = max(0, (int) ($q['root'] ?? 0)); $share = ($q['share'] ?? '') === '1'; $scope = ($q['scope'] ?? '') === 'anc' ? 'anc' : '';
    $year = static fn(string $k) => preg_match('/^-?\d{1,4}$/', $q[$k] ?? '') ? (int) $q[$k] : null;
    return match ($what) {
        'kinpath' => dpl_kinpath($pdo, max(0, (int) ($q['a'] ?? 0)), max(0, (int) ($q['b'] ?? 0)), ($q['alliances'] ?? '1') !== '0', $share),
        'ancplaces' => dpl_ancplaces($pdo, $root, (int) ($q['gens'] ?? 8), $share),
        'completeness' => dpl_completeness($pdo, $root, (int) ($q['gens'] ?? 10)),
        'ahnentafel' => dpl_ahnentafel($pdo, $root, (int) ($q['gens'] ?? 5), $share),
        'wheel' => dpl_wheel($pdo, in_array($q['who'] ?? '', ['living', 'all', 'anc'], true) ? $q['who'] : 'living', array_values(array_intersect(explode(',', $q['kinds'] ?? 'birth,union,death,fete'), ['birth', 'union', 'death', 'fete'])), $root, $share),
        'periods' => dpl_periods($pdo, $scope, $root, (int) ($q['step'] ?? 10)),
        'surnames' => dpl_surnames($pdo, $scope, $root, (int) ($q['step'] ?? 25), (int) ($q['top'] ?? 6)),
        'alive' => dpl_alive($pdo, $scope, $root, $year('from'), $year('to')),
        'parallel' => dpl_parallel($pdo, $scope, $root, (int) ($q['max'] ?? 200)),
    };
}
