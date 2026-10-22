<?php
declare(strict_types=1);

/* LCNDA — 📊 Diagrammes « Chiffres » : les données de l'arbre pour les nouvelles sortes
 * (classement qui évolue, courants empilés, histogramme, boîte à moustaches, haltères, pente, cascade,
 * essaim de points, petites courbes, cartes de chiffres, barre d'objectif). Interface : assets/js/heritage-diagram-chiffres.js.
 * Lecture seule ; une seule action : api.php?action=diagram_numbers&what=…
 */

const DIAGRAM_NUMBERS_WHAT = ['ages_death', 'ages_marriage', 'birth_years', 'couples', 'firstnames', 'occupations', 'births_places', 'births_surnames', 'living', 'counters', 'sosa'];

/** « 1784-05-07 », « 1784-00-00 », 1784 → [année, mois, jour, précis] */
function dchf_date(?string $sort, $year): ?array
{
    $s = trim((string) $sort);
    if ($s !== '' && preg_match('/^(-?\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/', $s, $m)) {
        $y = (int) $m[1]; $mo = isset($m[2]) ? (int) $m[2] : 0; $d = isset($m[3]) ? (int) $m[3] : 0;
        if ($y !== 0) { return [$y, $mo, $d, $mo > 0 && $d > 0]; }
    }
    if ($year !== null && $year !== '' && (int) $year !== 0) { return [(int) $year, 0, 0, false]; }
    return null;
}

/** âge entier entre deux dates (au jour près quand elles sont précises, sinon différence des années) */
function dchf_age(array $a, array $b): ?int
{
    if ($a[3] && $b[3]) {
        $age = $b[0] - $a[0];
        if ($b[1] < $a[1] || ($b[1] === $a[1] && $b[2] < $a[2])) { $age--; }
    } else { $age = $b[0] - $a[0]; }
    return $age >= 0 && $age <= 125 ? $age : null;
}

function dchf_century(int $y): string
{
    $c = intdiv($y - 1, 100) + 1;
    $roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII'];
    return ($roman[$c] ?? (string) $c) . 'e s.';
}

/** les personnes (sans les animaux) avec naissance et décès choisis au mieux ; seulement le groupe et la période choisis
 *  dans « Depuis l'app » (lib/diagram_options.php), sauf $all */
function dchf_people(PDO $pdo, bool $all = false): array
{
    $people = [];
    foreach ($pdo->query("SELECT id, first_name, last_name, gender, COALESCE(occupation,'') AS occupation FROM persons WHERE COALESCE(kind,'')<>'animal'") as $r) {
        $people[(int) $r['id']] = ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . $r['last_name']), 'first' => (string) $r['first_name'], 'last' => (string) $r['last_name'],
            'gender' => (string) $r['gender'], 'occupation' => trim((string) $r['occupation']), 'birth' => null, 'death' => null, 'bRank' => 9, 'dRank' => 9];
    }
    $rank = ['BIRT' => 0, 'CHR' => 1, 'BAPM' => 2, 'DEAT' => 0, 'BURI' => 1];
    $q = $pdo->query("SELECT e.person_id, t.gedcom_tag AS tag, e.sort_date, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL)");
    foreach ($q as $e) {
        $pid = (int) $e['person_id']; if (!isset($people[$pid])) { continue; }
        $d = dchf_date($e['sort_date'], $e['year']); if (!$d) { continue; }
        $isBirth = in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true); $k = $isBirth ? 'birth' : 'death'; $rk = $isBirth ? 'bRank' : 'dRank';
        if ($rank[$e['tag']] < $people[$pid][$rk]) { $people[$pid][$k] = $d; $people[$pid][$rk] = $rank[$e['tag']]; }
    }
    if (!$all && dchf_filtered()) {
        $keep = dgo_restrict($pdo, null);
        $people = array_filter($people, static fn($p) => ($keep === null || isset($keep[$p['id']])) && dgo_year_ok($p['birth'][0] ?? null));
    }
    return $people;
}

/** un groupe de personnes ou une période est-il choisi (« Depuis l'app ») ? */
function dchf_filtered(): bool
{
    return function_exists('dgo_request') && dgo_active(dgo_request());
}

/** les mariages : famille, date, les deux conjoints */
function dchf_marriages(PDO $pdo): array
{
    $out = [];
    $q = $pdo->query("SELECT f.id, f.partner1_id, f.partner2_id, e.sort_date, e.year FROM families f JOIN events e ON e.family_id=f.id JOIN event_types t ON t.id=e.event_type_id
        WHERE t.gedcom_tag IN ('MARR','MRCI','MRRE') AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL) ORDER BY t.gedcom_tag='MARR' DESC");
    foreach ($q as $r) {
        $fid = (int) $r['id']; if (isset($out[$fid])) { continue; }
        $d = dchf_date($r['sort_date'], $r['year']); if (!$d) { continue; }
        $out[$fid] = ['id' => $fid, 'p1' => (int) $r['partner1_id'], 'p2' => (int) $r['partner2_id'], 'date' => $d];
    }
    return array_values($out);
}

function dchf_first_given(string $first): string
{
    $t = trim(preg_split('/[\s,]+/u', trim($first))[0] ?? '');
    $t = trim($t, " \t\"'()[]-");
    if (mb_strlen($t) < 2 || !preg_match("/^\\p{L}[\\p{L}'’-]*$/u", $t)) { return ''; } // un vrai prénom : des lettres
    return mb_convert_case(mb_strtolower($t), MB_CASE_TITLE, 'UTF-8');
}

function diagram_numbers(PDO $pdo, array $q): array
{
    $what = (string) ($q['what'] ?? '');
    if (!in_array($what, DIAGRAM_NUMBERS_WHAT, true)) { throw new LcndaBadInput('Donnée inconnue.'); }
    require_once __DIR__ . '/diagram_options.php'; dgo_request($q); // groupe de personnes et période (onglet « Depuis l'app »)
    $gender = in_array($q['gender'] ?? '', ['male', 'female'], true) ? (string) $q['gender'] : '';
    $limit = 6000; // assez pour l'essaim et l'histogramme, sans tout figer
    $gLabel = static fn(string $g) => $g === 'male' ? 'Hommes' : ($g === 'female' ? 'Femmes' : 'Inconnu');

    if ($what === 'ages_death' || $what === 'birth_years') {
        $items = [];
        foreach (dchf_people($pdo) as $p) {
            if ($gender && $p['gender'] !== $gender) { continue; }
            if ($what === 'birth_years') { if (!$p['birth']) { continue; } $items[] = ['id' => $p['id'], 'name' => $p['name'], 'value' => $p['birth'][0], 'group' => $gLabel($p['gender']), 'century' => dchf_century($p['birth'][0])]; continue; }
            if (!$p['birth'] || !$p['death']) { continue; }
            $age = dchf_age($p['birth'], $p['death']); if ($age === null) { continue; }
            $items[] = ['id' => $p['id'], 'name' => $p['name'], 'value' => $age, 'group' => $gLabel($p['gender']), 'century' => dchf_century($p['birth'][0])];
        }
        return ['items' => array_slice($items, 0, $limit), 'total' => count($items)];
    }
    if ($what === 'ages_marriage' || $what === 'couples') {
        $people = dchf_people($pdo); $items = [];
        foreach (dchf_marriages($pdo) as $m) {
            $a = $people[$m['p1']] ?? null; $b = $people[$m['p2']] ?? null;
            if ($a && $b && $a['gender'] === 'female' && $b['gender'] !== 'female') { [$a, $b] = [$b, $a]; }
            if ($what === 'couples') {
                if (!$a || !$b || !$a['birth'] || !$b['birth']) { continue; }
                $x = dchf_age($a['birth'], $m['date']); $y = dchf_age($b['birth'], $m['date']);
                if ($x === null || $y === null || $x < 10 || $y < 10 || $x > 100 || $y > 100) { continue; }
                $items[] = ['label' => $a['name'] . ' et ' . $b['name'], 'year' => $m['date'][0], 'a' => $x, 'b' => $y];
                continue;
            }
            foreach ([$a, $b] as $p) {
                if (!$p || !$p['birth'] || ($gender && $p['gender'] !== $gender)) { continue; }
                $age = dchf_age($p['birth'], $m['date']); if ($age === null || $age < 10 || $age > 100) { continue; }
                $items[] = ['id' => $p['id'], 'name' => $p['name'], 'value' => $age, 'group' => $gLabel($p['gender']), 'century' => dchf_century($m['date'][0])];
            }
        }
        if ($what === 'couples') { usort($items, static fn($x, $y) => $y['year'] <=> $x['year']); }
        return ['items' => array_slice($items, 0, $limit), 'total' => count($items)];
    }
    if ($what === 'firstnames') {
        $count = [];
        foreach (dchf_people($pdo) as $p) {
            if (!$p['birth'] || ($gender && $p['gender'] !== $gender)) { continue; }
            $n = dchf_first_given($p['first']); if ($n === '') { continue; }
            $dec = intdiv($p['birth'][0], 10) * 10; $count[$dec][$n] = ($count[$dec][$n] ?? 0) + 1;
        }
        ksort($count);
        $count = array_filter($count, static fn($c) => array_sum($c) >= 3);
        $count = array_slice($count, -10, null, true);
        $rows = [];
        foreach ($count as $dec => $c) { arsort($c); foreach (array_slice($c, 0, 10, true) as $n => $k) { $rows[] = [$dec . 's', (string) $n, $k]; } }
        return ['rows' => $rows, 'periods' => array_map(static fn($d) => $d . 's', array_keys($count))];
    }
    if ($what === 'occupations' || $what === 'births_places' || $what === 'births_surnames') {
        $step = max(5, min(100, (int) ($q['step'] ?? ($what === 'occupations' ? 25 : 10))));
        $pairs = [];
        if ($what === 'occupations') {
            $people = dchf_people($pdo);
            foreach ($people as $p) { if ($p['occupation'] !== '' && $p['birth']) { $pairs[] = [$p['birth'][0] + 30, $p['occupation']]; } }
            $occ = $pdo->query("SELECT e.person_id, COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),'')) AS val, e.sort_date, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND t.gedcom_tag='OCCU'");
            foreach ($occ as $r) { if (dchf_filtered() && !isset($people[(int) $r['person_id']])) { continue; } $d = dchf_date($r['sort_date'], $r['year']); $v = trim((string) $r['val']); if ($v === '') { continue; } if (!$d && isset($people[(int) $r['person_id']]['birth'])) { $d = [$people[(int) $r['person_id']]['birth'][0] + 30]; } if ($d) { $pairs[] = [$d[0], $v]; } }
        } elseif ($what === 'births_surnames') {
            foreach (dchf_people($pdo) as $p) { if ($p['birth'] && trim($p['last']) !== '') { $pairs[] = [$p['birth'][0], mb_convert_case(mb_strtolower(trim($p['last'])), MB_CASE_TITLE, 'UTF-8')]; } }
        } else {
            $only = dchf_filtered() ? dchf_people($pdo) : null;
            $q2 = $pdo->query("SELECT e.person_id, pl.name, e.sort_date, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND TRIM(COALESCE(pl.name,''))<>''");
            foreach ($q2 as $r) { if ($only !== null && !isset($only[(int) $r['person_id']])) { continue; } $d = dchf_date($r['sort_date'], $r['year']); if ($d) { $pairs[] = [$d[0], trim(explode(',', (string) $r['name'])[0])]; } }
        }
        $tot = [];
        foreach ($pairs as [, $v]) { $k = mb_strtolower($v); $tot[$k] = ($tot[$k] ?? 0) + 1; }
        arsort($tot); $top = array_slice(array_keys($tot), 0, $what === 'births_places' ? 10 : 6);
        $names = []; foreach ($pairs as [, $v]) { $k = mb_strtolower($v); if (in_array($k, $top, true) && !isset($names[$k])) { $names[$k] = mb_strtoupper(mb_substr($v, 0, 1)) . mb_substr($v, 1); } }
        $grid = [];
        foreach ($pairs as [$y, $v]) {
            $k = mb_strtolower($v); $col = in_array($k, $top, true) ? $names[$k] : 'Autres';
            $per = intdiv($y - ($y < 0 ? $step - 1 : 0), $step) * $step;
            $grid[$per][$col] = ($grid[$per][$col] ?? 0) + 1;
        }
        ksort($grid);
        $grid = array_slice($grid, -40, null, true);
        $series = array_values($names); if ($what !== 'births_places' && array_filter($grid, static fn($g) => isset($g['Autres']))) { $series[] = 'Autres'; }
        $rows = [];
        foreach ($grid as $per => $g) { $row = ['label' => (string) $per]; foreach ($series as $j => $s) { $row['s' . $j] = $g[$s] ?? 0; } $rows[] = $row; }
        return ['series' => $series, 'rows' => $rows, 'step' => $step];
    }
    if ($what === 'living') {
        $step = max(10, min(100, (int) ($q['step'] ?? 50)));
        $births = []; $deaths = [];
        foreach (dchf_people($pdo) as $p) {
            if ($p['birth']) { $births[] = $p['birth'][0]; }
            if ($p['death']) { $deaths[] = $p['death'][0]; } elseif ($p['birth'] && $p['birth'][0] < (int) date('Y') - 100) { $deaths[] = $p['birth'][0] + 60; } // décès inconnu, naissance ancienne : on suppose une vie de 60 ans
        }
        if (!$births) { return ['rows' => []]; }
        $from = intdiv(min($births), $step) * $step; $to = (int) date('Y');
        $periods = []; for ($y = $from; $y <= $to && count($periods) < 30; $y += $step) { $periods[] = $y; }
        $rows = [];
        foreach ($periods as $i => $y) {
            $end = $y + $step;
            $nb = count(array_filter($births, static fn($b) => $b >= $y && $b < $end));
            $nd = count(array_filter($deaths, static fn($d) => $d >= $y && $d < $end));
            if (!$nb && !$nd) { continue; }
            $rows[] = ['label' => "Naissances $y-" . min($end - 1, $to), 'value' => $nb, 'type' => ''];
            $rows[] = ['label' => "Décès $y-" . min($end - 1, $to), 'value' => -$nd, 'type' => ''];
            $rows[] = ['label' => 'En ' . min($end, $to), 'value' => '', 'type' => 'subtotal'];
        }
        if ($rows) { $rows[count($rows) - 1]['type'] = 'total'; $rows[count($rows) - 1]['label'] = 'Aujourd’hui'; }
        return ['rows' => array_slice($rows, 0, 90)];
    }
    if ($what === 'counters') {
        $out = [];
        $since = date('Y-m-01', strtotime('-11 months'));
        foreach ([['persons', 'Personnes', "COALESCE(kind,'')<>'animal'"], ['families', 'Familles', '1'], ['events', 'Événements', '1'], ['media', 'Médias', '1'], ['places', 'Lieux', '1'], ['sources', 'Sources', '1']] as [$t, $label, $where]) {
            try { $n = (int) $pdo->query("SELECT count(*) FROM $t WHERE $where")->fetchColumn(); } catch (Throwable $e) { continue; }
            $spark = [];
            try {
                $st = $pdo->prepare("SELECT substr(created_at,1,7) AS m, count(*) AS n FROM $t WHERE $where AND created_at>=? GROUP BY m");
                $st->execute([$since]); $byMonth = [];
                foreach ($st as $r) { $byMonth[$r['m']] = (int) $r['n']; }
                $acc = $n - array_sum($byMonth);
                for ($i = 11; $i >= 0; $i--) { $m = date('Y-m', strtotime("-$i months", strtotime(date('Y-m-15')))); $acc += $byMonth[$m] ?? 0; $spark[] = $acc; }
            } catch (Throwable $e) { $spark = []; }
            $out[] = ['label' => $label, 'value' => $n, 'previous' => $spark ? $spark[max(0, count($spark) - 2)] : '', 'spark' => $spark];
        }
        return ['items' => $out];
    }
    if ($what === 'sosa') {
        $rootId = safe_int($q['root'] ?? 0);
        $root = function_exists('dashboard_sosa_root') ? dashboard_sosa_root($pdo, $rootId) : false;
        if (!$root) { return ['rows' => [], 'root' => '']; }
        $data = sosa_positions($pdo, (int) $root['id'], 120000);
        $per = [];
        foreach (array_keys($data['positions'] ?? []) as $s) { $g = (int) floor(log((float) $s, 2)) + 1; $per[$g] = ($per[$g] ?? 0) + 1; }
        $rows = [];
        for ($g = 2; $g <= 12; $g++) { $exp = 2 ** ($g - 1); $n = $per[$g] ?? 0; if (!$n && $g > 4) { break; } $rows[] = ['label' => "Génération $g", 'found' => $n, 'expected' => $exp, 'value' => round($n * 100 / $exp, 1)]; }
        return ['rows' => $rows, 'root' => trim($root['first_name'] . ' ' . $root['last_name'])];
    }
    return [];
}
