<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 Diagrammes « de famille » (assets/js/heritage-diagram-famille.js) : les chiffres pris dans l'arbre.
 * GET api.php?action=diagram_famille&what=…  (lecture seule, tout est borné ; les textes sont échappés dans le navigateur)
 *  - overlap  : D1 qui a connu qui — les ancêtres et descendants d'une personne, leur génération et le lien vers elle ;
 *  - survival : D2 courbe de survie — âge au décès (ou âge atteint par les vivants), par siècle, sexe, branche ou génération ;
 *  - occflow  : D3 métiers de père en fils — chaînes de 3 à 5 générations (père → fils, ou parents → enfants) ;
 *  - radius   : D4 rayon des mariages — distance et direction entre les lieux de naissance des deux époux ;
 *  - implexe  : D5 ancêtres théoriques, places trouvées et personnes différentes par génération ;
 *  - months   : D6 mois des mariages et des conceptions (naissance − 9 mois), Carême et Avent comptés au jour près ;
 *  - spacing  : D7 espacement des naissances — les enfants de chaque mère sur sa vie ;
 *  - places   : D8 frise des lieux de vie — les lieux de chaque personne, dans l'ordre du temps.
 */

require_once __DIR__ . '/diagram_chiffres.php'; // dchf_date, dchf_age, dchf_century, dchf_marriages
require_once __DIR__ . '/diagram_genea.php';    // dgn_links, dgn_root, dgn_sosa, dgn_name
require_once __DIR__ . '/diagram_more.php';     // dmo_lives, dmo_iso

const DFA_MAX_PEOPLE = 600;

/** h / f / '' */
function dfa_sex(string $g): string
{
    return $g === 'male' ? 'h' : ($g === 'female' ? 'f' : '');
}

/** les ancêtres d'une personne : id → [génération (1 = parents), id de l'enfant vers la personne] (le plus court chemin) */
function dfa_ancestors(PDO $pdo, int $root, int $gens, int $max = 20000): array
{
    $L = dgn_links($pdo); $out = []; $queue = [[$root, 0]]; $seen = [$root => true];
    while ($queue && count($out) < $max) {
        $next = [];
        foreach ($queue as [$p, $g]) {
            if ($g >= $gens) { continue; }
            foreach ([0, 1] as $k) {
                $par = (int) ($L['parents'][$p][$k] ?? 0);
                if (!$par || isset($seen[$par])) { continue; }
                $seen[$par] = true; $out[$par] = [$g + 1, $p]; $next[] = [$par, $g + 1];
            }
        }
        $queue = $next;
    }
    return $out;
}

/** les descendants : id → [génération (1 = enfants), id du parent] */
function dfa_descendants(PDO $pdo, int $root, int $gens, int $max = 20000): array
{
    $L = dgn_links($pdo); $out = []; $queue = [[$root, 0]]; $seen = [$root => true];
    while ($queue && count($out) < $max) {
        $next = [];
        foreach ($queue as [$p, $g]) {
            if ($g >= $gens) { continue; }
            foreach ($L['children'][$p] ?? [] as $c) {
                $c = (int) $c; if (isset($seen[$c])) { continue; }
                $seen[$c] = true; $out[$c] = [$g + 1, $p]; $next[] = [$c, $g + 1];
            }
        }
        $queue = $next;
    }
    return $out;
}

/** les personnes de la portée choisie (null = toute la base) */
function dfa_scope(PDO $pdo, string $scope, int $root): ?array
{
    if ($scope === 'anc') { $r = dgn_root($pdo, $root); return $r ? [$r => true] + array_map(static fn() => true, dfa_ancestors($pdo, $r, 40)) : []; }
    if ($scope === 'desc') { $r = dgn_root($pdo, $root); return $r ? [$r => true] + array_map(static fn() => true, dfa_descendants($pdo, $r, 30)) : []; }
    return null;
}

/* ═════════ D1 🤝 Qui a connu qui ═════════ */
function dfa_overlap(PDO $pdo, int $root, int $up, int $down): array
{
    $root = dgn_root($pdo, $root);
    if (!$root) { return ['root' => 0, 'people' => []]; }
    $up = max(0, min(8, $up)); $down = max(0, min(6, $down));
    $lives = dmo_lives($pdo); $L = dgn_links($pdo);
    $list = [$root => [0, 0]];
    foreach (dfa_ancestors($pdo, $root, $up, DFA_MAX_PEOPLE) as $id => [$g, $link]) { $list[$id] = [-$g, $link]; }
    foreach (dfa_descendants($pdo, $root, $down, DFA_MAX_PEOPLE) as $id => [$g, $link]) { if (!isset($list[$id])) { $list[$id] = [$g, $link]; } }
    $people = [];
    foreach ($list as $id => [$g, $link]) {
        $p = $lives[$id] ?? null; if (!$p) { continue; }
        $people[] = ['id' => $id, 'name' => $p['name'], 'sex' => dfa_sex($L['gender'][$id] ?? ''), 'gen' => $g, 'link' => (int) $link,
            'birth' => dmo_iso($p['b']), 'death' => dmo_iso($p['d']), 'living' => $p['living']];
        if (count($people) >= DFA_MAX_PEOPLE) { break; }
    }
    return ['root' => $root, 'root_name' => $lives[$root]['name'] ?? '', 'people' => $people];
}

/* ═════════ D2 📉 Courbe de survie ═════════ */
function dfa_survival(PDO $pdo, string $by, string $scope, int $root): array
{
    if (!in_array($by, ['century', 'sex', 'branch', 'gen', 'all'], true)) { $by = 'century'; }
    $lives = dmo_lives($pdo); $L = dgn_links($pdo);
    $sosa = [];
    if ($by === 'branch' || $by === 'gen') { $scope = 'anc'; $r = dgn_root($pdo, $root); foreach (dgn_sosa($pdo, $r, 30, 120000) as $s => $id) { if (!isset($sosa[$id])) { $sosa[$id] = $s; } } }
    $keep = $scope === 'anc' && $sosa ? array_map(static fn() => true, $sosa) : dfa_scope($pdo, $scope, $root);
    $now = [(int) date('Y'), (int) date('n'), (int) date('j'), true];
    $rows = []; $unknown = 0;
    foreach ($lives as $id => $p) {
        if ($keep !== null && !isset($keep[$id])) { continue; }
        if (!$p['b']) { continue; }
        if ($p['d']) { $age = dchf_age($p['b'], $p['d']); $dead = 1; }
        elseif ($p['living']) { $age = dchf_age($p['b'], $now); $dead = 0; }
        else { $unknown++; continue; }
        if ($age === null) { continue; }
        $s = $sosa[$id] ?? 0;
        $group = match ($by) {
            'sex' => ['h' => 'Hommes', 'f' => 'Femmes'][dfa_sex($L['gender'][$id] ?? '')] ?? 'Sexe inconnu',
            'branch' => $s <= 1 ? 'Personne de départ' : ((($s >> (strlen(decbin($s)) - 2)) & 1) === 0 ? 'Branche paternelle' : 'Branche maternelle'),
            'gen' => 'Génération ' . ($s ? strlen(decbin($s)) : 1),
            'all' => 'Toute la base',
            default => dchf_century($p['b'][0]),
        };
        if ($by === 'branch' && $s <= 1) { continue; }
        $rows[] = ['group' => $group, 'age' => $age, 'dead' => $dead, 'id' => $id];
        if (count($rows) >= 30000) { break; }
    }
    return ['rows' => $rows, 'unknown' => $unknown, 'by' => $by];
}

/* ═════════ D3 🔀 Métiers de père en fils ═════════ */
/** le métier de chaque personne : la fiche, sinon le premier métier daté (événement « Profession ») */
function dfa_occupations(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $out = []; $clean = static function (string $s): string {
        $s = trim(preg_split('/[,;\/|]/u', $s)[0] ?? ''); $s = preg_replace('/\s+/u', ' ', $s) ?? '';
        if ($s === '') { return ''; }
        $s = mb_strtolower(mb_substr($s, 0, 40)); return mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1);
    };
    $q = $pdo->query("SELECT e.person_id, COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),''),'') AS val FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag='OCCU' ORDER BY COALESCE(NULLIF(e.sort_date,''),'9999'), e.id");
    foreach ($q as $r) { $id = (int) $r['person_id']; if (!isset($out[$id])) { $v = $clean((string) $r['val']); if ($v !== '') { $out[$id] = $v; } } }
    foreach ($pdo->query("SELECT id, COALESCE(occupation,'') AS o FROM persons WHERE TRIM(COALESCE(occupation,''))<>''") as $r) { $v = $clean((string) $r['o']); if ($v !== '') { $out[(int) $r['id']] = $v; } }
    return $cache = $out;
}

function dfa_occflow(PDO $pdo, string $chain, int $gens, string $scope, int $root): array
{
    $gens = max(2, min(5, $gens)); $male = $chain !== 'parent';
    $L = dgn_links($pdo); $occ = dfa_occupations($pdo); $keep = dfa_scope($pdo, $scope, $root);
    $agg = []; $paths = 0;
    $starts = $keep !== null ? array_keys($keep) : array_keys($L['gender']);
    foreach ($starts as $x) {
        if ($male && ($L['gender'][$x] ?? '') !== 'male') { continue; }
        // toutes les chaînes qui remontent de x sur $gens générations (au plus 16 par personne)
        $chains = [[$x]];
        for ($g = 1; $g < $gens; $g++) {
            $next = [];
            foreach ($chains as $c) {
                $top = end($c);
                foreach ($male ? [0] : [0, 1] as $k) { $par = (int) ($L['parents'][$top][$k] ?? 0); if ($par && ($keep === null || isset($keep[$par]))) { $next[] = [...$c, $par]; } }
            }
            $chains = $next; if (!$chains) { break; }
        }
        foreach ($chains as $c) {
            if (count($c) < $gens) { continue; }
            $jobs = array_map(static fn($id) => $occ[$id] ?? '', array_reverse($c)); // du plus ancien au plus jeune
            if (count(array_filter($jobs, static fn($j) => $j !== '')) < 2) { continue; }
            $k = implode("\0", $jobs); $agg[$k] = ($agg[$k] ?? 0) + 1;
            if (++$paths >= 60000) { break 2; }
        }
    }
    arsort($agg);
    $rows = [];
    foreach (array_slice($agg, 0, 3000, true) as $k => $n) { $jobs = explode("\0", (string) $k); $r = ['value' => $n]; foreach ($jobs as $i => $j) { $r['g' . ($i + 1)] = $j; } $rows[] = $r; }
    return ['rows' => $rows, 'gens' => $gens, 'paths' => $paths, 'chain' => $male ? 'male' : 'parent', 'with_job' => count($occ)];
}

/* ═════════ D4 💍 Rayon des mariages ═════════ */
function dfa_km(float $la1, float $lo1, float $la2, float $lo2): array
{
    $r = M_PI / 180; $dla = ($la2 - $la1) * $r; $dlo = ($lo2 - $lo1) * $r;
    $a = sin($dla / 2) ** 2 + cos($la1 * $r) * cos($la2 * $r) * sin($dlo / 2) ** 2;
    $km = 6371 * 2 * atan2(sqrt($a), sqrt(max(0, 1 - $a)));
    $y = sin($dlo) * cos($la2 * $r); $x = cos($la1 * $r) * sin($la2 * $r) - sin($la1 * $r) * cos($la2 * $r) * cos($dlo);
    $b = fmod(rad2deg(atan2($y, $x)) + 360, 360);
    return [round($km, 1), (int) round($b)];
}

function dfa_radius(PDO $pdo, string $scope, int $root): array
{
    $lives = dmo_lives($pdo); $keep = dfa_scope($pdo, $scope, $root);
    $mar = []; foreach (dchf_marriages($pdo) as $m) { $mar[$m['id']] = $m['date']; }
    $fams = $pdo->query('SELECT id, partner1_id AS a, partner2_id AS b FROM families WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL')->fetchAll();
    $need = [];
    foreach ($fams as $f) { foreach (['a', 'b'] as $c) { $bp = $lives[(int) $f[$c]]['bp'] ?? 0; if ($bp) { $need[$bp] = true; } } }
    $pl = [];
    foreach (array_chunk(array_keys($need), 500) as $chunk) {
        foreach ($pdo->query('SELECT id, name, county, latitude AS la, longitude AS lo FROM places WHERE id IN (' . implode(',', $chunk) . ')') as $p) {
            $pl[(int) $p['id']] = ['n' => mb_substr(trim(explode(',', (string) $p['name'])[0]), 0, 60), 'c' => mb_substr(trim((string) $p['county']), 0, 40), 'la' => $p['la'] !== null ? (float) $p['la'] : null, 'lo' => $p['lo'] !== null ? (float) $p['lo'] : null];
        }
    }
    $rows = []; $missing = 0;
    foreach ($fams as $f) {
        $a = (int) $f['a']; $b = (int) $f['b'];
        if ($keep !== null && !isset($keep[$a]) && !isset($keep[$b])) { continue; }
        // le mari d'abord quand on le sait (la direction se lit depuis son village)
        if (($lives[$a]['g'] ?? '') === 'female' && ($lives[$b]['g'] ?? '') === 'male') { [$a, $b] = [$b, $a]; }
        $pa = $pl[$lives[$a]['bp'] ?? 0] ?? null; $pb = $pl[$lives[$b]['bp'] ?? 0] ?? null;
        if (!$pa || !$pb || $pa['la'] === null || $pb['la'] === null) { $missing++; continue; }
        [$km, $bear] = dfa_km($pa['la'], $pa['lo'], $pb['la'], $pb['lo']);
        $d = $mar[(int) $f['id']] ?? null; $year = $d ? $d[0] : null; $approx = false;
        if (!$year) { $ys = array_filter([$lives[$a]['b'][0] ?? null, $lives[$b]['b'][0] ?? null]); if ($ys) { $year = max($ys) + 25; $approx = true; } }
        $rows[] = ['a' => $lives[$a]['name'] ?? '', 'b' => $lives[$b]['name'] ?? '', 'pa' => $pa['n'], 'pb' => $pb['n'], 'km' => $km, 'bearing' => $bear, 'year' => $year ? (string) $year : '', 'approx' => $approx, 'ida' => $a, 'idb' => $b];
        if (count($rows) >= 8000) { break; }
    }
    return ['rows' => $rows, 'missing' => $missing];
}

/* ═════════ D5 🧮 Implexe ═════════ */
function dfa_implexe(PDO $pdo, int $root, int $gens): array
{
    $root = dgn_root($pdo, $root);
    if (!$root || !function_exists('implexe_data')) { return ['root' => 0, 'rows' => []]; }
    $gens = max(3, min(25, $gens));
    $d = implexe_data($pdo, $root, $gens, 250000);
    $rep = [];
    foreach ($d['repeated'] ?? [] as $r) { foreach ($r['generations'] ?? [] as $g) { if (count($rep[$g] ?? []) < 200) { $rep[$g][] = (int) $r['id']; } } }
    $rows = [];
    foreach ($d['generations'] ?? [] as $g) {
        $n = (int) $g['generation']; if ($n > $gens) { break; }
        $rows[] = ['gen' => $n, 'theo' => $g['theoretical'] !== null ? (string) $g['theoretical'] : '', 'found' => (int) $g['slots'], 'distinct' => (int) $g['people'], 'ids' => implode(',', $rep[$n] ?? [])];
    }
    $lives = dmo_lives($pdo);
    return ['root' => $root, 'root_name' => $lives[$root]['name'] ?? '', 'rows' => $rows, 'truncated' => !empty($d['truncated'])];
}

/* ═════════ D6 📅 Mois des mariages et des conceptions ═════════ */
/** Pâques (calendrier grégorien) : [mois, jour] */
function dfa_easter(int $y): array
{
    $a = $y % 19; $b = intdiv($y, 100); $c = $y % 100; $d = intdiv($b, 4); $e = $b % 4; $f = intdiv($b + 8, 25); $g = intdiv($b - $f + 1, 3);
    $h = (19 * $a + $b - $d - $g + 15) % 30; $i = intdiv($c, 4); $k = $c % 4; $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7; $m = intdiv($a + 11 * $h + 22 * $l, 451);
    $month = intdiv($h + $l - 7 * $m + 114, 31); $day = (($h + $l - 7 * $m + 114) % 31) + 1;
    return [$month, $day];
}
/** 'lent' (mercredi des Cendres → samedi saint), 'advent' (1er dimanche de l'Avent → 24 décembre) ou '' */
function dfa_season(array $d): string
{
    [$y, $m, $day] = $d; if (!$d[3] || $y < 1583 || $y > 2200) { return ''; }
    $t = gmmktime(12, 0, 0, $m, $day, $y);
    [$em, $ed] = dfa_easter($y); $easter = gmmktime(12, 0, 0, $em, $ed, $y);
    if ($t >= $easter - 46 * 86400 && $t < $easter) { return 'lent'; }
    $xmas = gmmktime(12, 0, 0, 12, 25, $y); $w = (int) gmdate('w', $xmas); $advent = $xmas - (($w === 0 ? 7 : $w) + 21) * 86400;
    if ($t >= $advent && $t < $xmas) { return 'advent'; }
    return '';
}

function dfa_months(PDO $pdo, string $scope, int $root, ?int $from, ?int $to): array
{
    $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo);
    $M = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    $marr = array_fill(1, 12, 0); $conc = array_fill(1, 12, 0); $ids0 = array_fill(1, 12, []); $ids1 = array_fill(1, 12, []);
    $st = ['marriages' => 0, 'lent' => 0, 'advent' => 0, 'precise_m' => 0, 'conceptions' => 0, 'lent_c' => 0, 'precise_c' => 0];
    $in = static fn(int $y) => ($from === null || $y >= $from) && ($to === null || $y <= $to);
    foreach (dchf_marriages($pdo) as $m) {
        $d = $m['date']; if ($d[1] < 1 || $d[1] > 12 || !$in($d[0])) { continue; }
        if ($keep !== null && !isset($keep[$m['p1']]) && !isset($keep[$m['p2']])) { continue; }
        $marr[$d[1]]++; $st['marriages']++; if (count($ids0[$d[1]]) < 300) { $ids0[$d[1]][] = $m['p1'] ?: $m['p2']; }
        if ($d[3]) { $st['precise_m']++; $s = dfa_season($d); if ($s) { $st[$s]++; } }
    }
    foreach ($lives as $id => $p) {
        $b = $p['b']; if (!$b || $b[1] < 1 || $b[1] > 12) { continue; }
        if ($keep !== null && !isset($keep[$id])) { continue; }
        if ($b[3]) { $t = gmmktime(12, 0, 0, $b[1], $b[2], $b[0]) - 266 * 86400; $c = [(int) gmdate('Y', $t), (int) gmdate('n', $t), (int) gmdate('j', $t), true]; }
        else { $c = [$b[1] > 9 ? $b[0] : $b[0] - 1, (($b[1] + 2) % 12) + 1, 0, false]; }
        if (!$in($c[0])) { continue; }
        $conc[$c[1]]++; $st['conceptions']++; if (count($ids1[$c[1]]) < 300) { $ids1[$c[1]][] = $id; }
        if ($c[3]) { $st['precise_c']++; if (dfa_season($c) === 'lent') { $st['lent_c']++; } }
    }
    $rows = [];
    for ($i = 1; $i <= 12; $i++) { $rows[] = ['label' => $M[$i - 1], 's0' => $marr[$i], 's1' => $conc[$i], 'ids0' => implode(',', $ids0[$i]), 'ids1' => implode(',', $ids1[$i])]; }
    return ['rows' => $rows, 'stats' => $st];
}

/* ═════════ D7 👶 Espacement des naissances ═════════ */
function dfa_spacing(PDO $pdo, string $mode, int $mother, int $root, int $top): array
{
    $L = dgn_links($pdo); $lives = dmo_lives($pdo); $top = max(1, min(60, $top));
    $firstMarr = []; foreach (dchf_marriages($pdo) as $m) { foreach ([$m['p1'], $m['p2']] as $p) { if ($p && (!isset($firstMarr[$p]) || $m['date'] < $firstMarr[$p])) { $firstMarr[$p] = $m['date']; } } }
    $isMother = static fn(int $id) => ($L['gender'][$id] ?? '') !== 'male' && count($L['children'][$id] ?? []) > 0;
    if ($mode === 'one') { $mothers = $mother > 0 && isset($lives[$mother]) ? [$mother] : []; }
    elseif ($mode === 'anc') {
        $r = dgn_root($pdo, $root); $mothers = [];
        foreach (dfa_ancestors($pdo, $r, 30) as $id => [$g]) { if (($L['gender'][$id] ?? '') === 'female' && $isMother($id)) { $mothers[$id] = $g * 100000 + $id; } }
        asort($mothers); $mothers = array_slice(array_keys($mothers), 0, $top);
    } else {
        $cnt = [];
        foreach ($L['children'] as $id => $kids) { if (($L['gender'][$id] ?? '') === 'female' && count($kids) >= 2 && isset($lives[$id])) { $cnt[$id] = count($kids); } }
        arsort($cnt); $mothers = array_slice(array_keys($cnt), 0, $top);
    }
    $rows = [];
    foreach ($mothers as $mid) {
        $m = $lives[$mid] ?? null; if (!$m) { continue; }
        foreach ($L['children'][$mid] ?? [] as $cid) {
            $c = $lives[(int) $cid] ?? null; if (!$c) { continue; }
            $rows[] = ['mother' => $m['name'], 'mid' => $mid, 'mbirth' => dmo_iso($m['b']), 'mdeath' => dmo_iso($m['d']), 'marriage' => dmo_iso($firstMarr[$mid] ?? null),
                'child' => $c['name'], 'cid' => (int) $cid, 'sex' => dfa_sex($L['gender'][(int) $cid] ?? ''), 'birth' => dmo_iso($c['b']), 'death' => dmo_iso($c['d'])];
        }
        if (count($rows) >= 3000) { break; }
    }
    return ['rows' => $rows, 'mothers' => count($mothers)];
}

/* ═════════ D8 🏘️ Frise des lieux de vie ═════════ */
const DFA_TAGS = ['BIRT' => 'naissance', 'CHR' => 'baptême', 'BAPM' => 'baptême', 'MARR' => 'mariage', 'RESI' => 'domicile', 'CENS' => 'recensement', 'OCCU' => 'métier', 'EMIG' => 'départ',
    'IMMI' => 'arrivée', 'MILI' => 'armée', 'EDUC' => 'études', 'GRAD' => 'diplôme', 'RETI' => 'retraite', 'DEAT' => 'décès', 'BURI' => 'sépulture', 'NATU' => 'naturalisation', 'EVEN' => 'événement'];

function dfa_places(PDO $pdo, array $ids, int $root, int $gens, string $mode): array
{
    $lives = dmo_lives($pdo); $L = dgn_links($pdo); $ids = array_values(array_filter($ids, static fn($i) => $i > 0));
    if (!$ids) {
        $r = dgn_root($pdo, $root);
        if ($mode === 'family') { $ids = [$r]; foreach ($L['children'][$r] ?? [] as $c) { $ids[] = (int) $c; } foreach ($L['parents'][$r] ?? [] as $p) { array_unshift($ids, (int) $p); } }
        else { $ids = [$r]; foreach (dfa_ancestors($pdo, $r, max(1, min(6, $gens)), 126) as $id => $x) { $ids[] = $id; } }
    }
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => isset($lives[$i])))); $ids = array_slice($ids, 0, 80);
    if (!$ids) { return ['rows' => [], 'people' => 0]; }
    $in = implode(',', $ids);
    $ev = [];
    $q = $pdo->query("SELECT e.person_id AS pid, t.gedcom_tag AS tag, t.label, e.sort_date, e.year, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($in) AND e.place_id IS NOT NULL");
    foreach ($q as $e) { $ev[(int) $e['pid']][] = $e; }
    $q = $pdo->query("SELECT f.partner1_id AS a, f.partner2_id AS b, t.gedcom_tag AS tag, t.label, e.sort_date, e.year, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id
        WHERE e.place_id IS NOT NULL AND (f.partner1_id IN ($in) OR f.partner2_id IN ($in))");
    foreach ($q as $e) { foreach (['a', 'b'] as $c) { $p = (int) $e[$c]; if (in_array($p, $ids, true)) { $ev[$p][] = $e; } } }
    $need = []; foreach ($ev as $list) { foreach ($list as $e) { $need[(int) $e['place_id']] = true; } }
    $pl = [];
    foreach (array_chunk(array_keys($need), 500) as $chunk) {
        foreach ($pdo->query('SELECT id, name, county, country FROM places WHERE id IN (' . implode(',', $chunk) . ')') as $p) {
            $pl[(int) $p['id']] = ['n' => mb_substr(trim(explode(',', (string) $p['name'])[0]), 0, 60), 'c' => mb_substr(trim((string) $p['county']), 0, 50), 'k' => mb_substr(trim((string) $p['country']), 0, 50)];
        }
    }
    $rows = []; $nowIso = date('Y-m-d');
    foreach ($ids as $pid) {
        $p = $lives[$pid]; $list = [];
        foreach ($ev[$pid] ?? [] as $e) {
            $d = dchf_date($e['sort_date'], $e['year']); $place = $pl[(int) $e['place_id']] ?? null;
            if (!$place || $place['n'] === '') { continue; }
            if (!$d) { if ($e['tag'] === 'BIRT' && $p['b']) { $d = $p['b']; } elseif ($e['tag'] === 'DEAT' && $p['d']) { $d = $p['d']; } else { continue; } }
            $what = DFA_TAGS[$e['tag']] ?? mb_strtolower(mb_substr(trim((string) $e['label']), 0, 30));
            $list[] = [$d, $place, $what];
        }
        usort($list, static fn($x, $y) => [$x[0][0], $x[0][1], $x[0][2]] <=> [$y[0][0], $y[0][1], $y[0][2]]);
        $end = $p['d'] ? dmo_iso($p['d']) : ($p['living'] ? $nowIso : '');
        $seg = null;
        foreach ($list as [$d, $place, $what]) {
            $key = $place['n'] . '|' . $place['c'];
            if ($seg && $seg['key'] === $key) { if (!in_array($what, $seg['w'], true)) { $seg['w'][] = $what; } continue; }
            if ($seg) { $seg['end'] = dmo_iso($d); $rows[] = $seg; }
            $seg = ['key' => $key, 'person' => $p['name'], 'pid' => $pid, 'place' => $place['n'], 'county' => $place['c'], 'country' => $place['k'], 'start' => dmo_iso($d), 'end' => '', 'w' => [$what]];
        }
        if ($seg) { $seg['end'] = $end !== '' && $end >= $seg['start'] ? $end : ''; $rows[] = $seg; }
    }
    $rows = array_map(static function ($s) { $s['what'] = implode(', ', array_slice($s['w'], 0, 6)); unset($s['w'], $s['key']); return $s; }, $rows);
    return ['rows' => array_slice($rows, 0, 2000), 'people' => count($ids)];
}

function diagram_famille_data(PDO $pdo, array $q): array
{
    $q = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $q);
    $root = (int) ($q['root'] ?? 0);
    $year = static fn(string $k) => preg_match('/^-?\d{1,4}$/', $q[$k] ?? '') ? (int) $q[$k] : null;
    return match ($q['what'] ?? '') {
        'overlap' => dfa_overlap($pdo, $root, (int) ($q['up'] ?? 3), (int) ($q['down'] ?? 3)),
        'survival' => dfa_survival($pdo, $q['by'] ?? 'century', $q['scope'] ?? '', $root),
        'occflow' => dfa_occflow($pdo, $q['chain'] ?? 'male', (int) ($q['gens'] ?? 4), $q['scope'] ?? '', $root),
        'radius' => dfa_radius($pdo, $q['scope'] ?? '', $root),
        'implexe' => dfa_implexe($pdo, $root, (int) ($q['gens'] ?? 12)),
        'months' => dfa_months($pdo, $q['scope'] ?? '', $root, $year('from'), $year('to')),
        'spacing' => dfa_spacing($pdo, $q['mode'] ?? 'all', (int) ($q['mother'] ?? 0), $root, (int) ($q['top'] ?? 12)),
        'places' => dfa_places($pdo, array_slice(array_map('intval', explode(',', $q['ids'] ?? '')), 0, 80), $root, (int) ($q['gens'] ?? 3), ($q['mode'] ?? '') === 'family' ? 'family' : 'anc'),
        default => throw new LcndaBadInput('Données inconnues.'),
    };
}
