<?php
declare(strict_types=1);

/* LCNDA — 📊 Diagrammes « ADN » et « Chiffres » (lot D9 à D15) : les données de l'arbre pour
 *  🔁 le tableau de mobilité (métier du père × métier de l'enfant), 🌹 la rose de Nightingale (mois des naissances,
 *  mariages, décès) et ⚫ l'échelle de points (âges moyens, femmes et hommes).
 *  L'ADN (peinture des chromosomes, règle des cM) lit api.php?action=dna (lib/dna.php) ; les vagues lisent diagram_numbers.
 * Interface : assets/js/heritage-diagram-adn-chiffres.js. Lecture seule : api.php?action=diagram_adn_numbers&what=…
 */

require_once __DIR__ . '/diagram_chiffres.php'; // dchf_people, dchf_marriages, dchf_date, dchf_age, dchf_century

const DIAGRAM_ADN_NUMBERS_WHAT = ['mobility', 'months', 'means'];

/** un métier écrit proprement (« LABOUREUR » → « Laboureur ») ; vide si ce n'est pas un vrai mot */
function dadn_job(string $v): string
{
    $v = trim(preg_replace('/\s+/u', ' ', $v));
    if ($v === '' || mb_strlen($v) > 80 || !preg_match('/\p{L}/u', $v)) { return ''; }
    $v = mb_strtolower($v);
    return mb_strtoupper(mb_substr($v, 0, 1)) . mb_substr($v, 1);
}

/** le métier de chacun : la fiche, sinon le premier événement « Métier » (OCCU) */
function dadn_jobs(PDO $pdo, array $people): array
{
    $out = [];
    foreach ($people as $id => $p) { $j = dadn_job($p['occupation']); if ($j !== '') { $out[$id] = $j; } }
    $q = $pdo->query("SELECT e.person_id, COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),'')) AS val FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag='OCCU' ORDER BY COALESCE(e.sort_date,''), e.id");
    foreach ($q as $r) { $id = (int) $r['person_id']; if (isset($out[$id]) || !isset($people[$id])) { continue; } $j = dadn_job((string) $r['val']); if ($j !== '') { $out[$id] = $j; } }
    return $out;
}

function diagram_adn_numbers(PDO $pdo, array $q): array
{
    $what = (string) ($q['what'] ?? '');
    if (!in_array($what, DIAGRAM_ADN_NUMBERS_WHAT, true)) { throw new LcndaBadInput('Donnée inconnue.'); }

    if ($what === 'mobility') { // 🔁 métier du père → métier de l'enfant
        $who = in_array($q['who'] ?? '', ['sons', 'daughters', 'children'], true) ? (string) $q['who'] : 'sons';
        $people = dchf_people($pdo); $jobs = dadn_jobs($pdo, $people);
        $fam = [];
        foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) {
            $a = (int) $f['partner1_id']; $b = (int) $f['partner2_id'];
            $father = ($people[$a]['gender'] ?? '') === 'male' ? $a : (($people[$b]['gender'] ?? '') === 'male' ? $b : (($people[$a]['gender'] ?? '') === 'female' ? 0 : $a));
            if ($father) { $fam[(int) $f['id']] = $father; }
        }
        $cells = []; $kids = 0; $withFather = 0; $seen = [];
        foreach ($pdo->query("SELECT family_id, child_id FROM family_children WHERE COALESCE(relation_to_partner1,'biological') NOT IN ('adopted','foster','step') ORDER BY id") as $r) {
            $c = (int) $r['child_id']; if (!isset($people[$c]) || isset($seen[$c])) { continue; }
            $g = $people[$c]['gender'];
            if (($who === 'sons' && $g !== 'male') || ($who === 'daughters' && $g !== 'female')) { continue; }
            $seen[$c] = 1; $kids++;
            $f = $fam[(int) $r['family_id']] ?? 0; if (!$f || !isset($jobs[$f]) || !isset($jobs[$c])) { continue; }
            $withFather++;
            $k = mb_strtolower($jobs[$f]) . "\x1f" . mb_strtolower($jobs[$c]);
            if (!isset($cells[$k])) { $cells[$k] = ['from' => $jobs[$f], 'to' => $jobs[$c], 'count' => 0, 'pids' => []]; }
            $cells[$k]['count']++;
            if (count($cells[$k]['pids']) < 60) { $cells[$k]['pids'][] = $c; }
        }
        usort($cells, static fn($x, $y) => $y['count'] <=> $x['count']);
        return ['rows' => array_slice(array_values($cells), 0, 2000), 'children' => $kids, 'pairs' => $withFather, 'who' => $who];
    }

    if ($what === 'months') { // 🌹 mois des naissances, mariages, décès (dates au mois près seulement)
        $by = in_array($q['by'] ?? '', ['type', 'century'], true) ? (string) $q['by'] : 'type';
        $type = in_array($q['type'] ?? '', ['births', 'marriages', 'deaths', 'conceptions'], true) ? (string) $q['type'] : 'births';
        $people = dchf_people($pdo); $grid = []; $total = 0;
        $add = static function (string $s, int $m) use (&$grid, &$total) { if ($m < 1 || $m > 12) { return; } $grid[$s][$m] = ($grid[$s][$m] ?? 0) + 1; $total++; };
        $births = static function () use ($people) { foreach ($people as $p) { if ($p['birth'] && $p['birth'][1] > 0) { yield $p['birth']; } } };
        $deaths = static function () use ($people) { foreach ($people as $p) { if ($p['death'] && $p['death'][1] > 0) { yield $p['death']; } } };
        $marrs = static function () use ($pdo) { foreach (dchf_marriages($pdo) as $m) { if ($m['date'][1] > 0) { yield $m['date']; } } };
        $concep = static function () use ($births) { foreach ($births() as $d) { $m = $d[1] - 9; $y = $d[0]; if ($m < 1) { $m += 12; $y--; } yield [$y, $m, 0, false]; } };
        if ($by === 'type') {
            foreach ($births() as $d) { $add('Naissances', $d[1]); }
            foreach ($marrs() as $d) { $add('Mariages', $d[1]); }
            foreach ($deaths() as $d) { $add('Décès', $d[1]); }
        } else {
            $src = ['births' => $births, 'marriages' => $marrs, 'deaths' => $deaths, 'conceptions' => $concep][$type];
            foreach ($src() as $d) { $add(dchf_century($d[0]), $d[1]); }
            $roman = static function (string $s): int { $r = ['I' => 1, 'V' => 5, 'X' => 10, 'L' => 50, 'C' => 100]; $t = 0; $c = preg_replace('/[^IVXLC]/', '', $s); for ($i = 0; $i < strlen($c); $i++) { $v = $r[$c[$i]]; $nx = $r[$c[$i + 1] ?? ''] ?? 0; $t += $v < $nx ? -$v : $v; } return $t; };
            uksort($grid, static fn($a, $b) => $roman((string) $a) <=> $roman((string) $b));
            $grid = array_slice($grid, -8, null, true);
        }
        $series = array_keys($grid);
        $names = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
        $rows = [];
        for ($m = 1; $m <= 12; $m++) { $row = ['label' => $names[$m - 1]]; foreach ($series as $j => $s) { $row['s' . $j] = $grid[$s][$m] ?? 0; } $rows[] = $row; }
        return ['series' => array_map('strval', $series), 'rows' => $total ? $rows : [], 'total' => $total];
    }

    // ⚫ âges moyens, femmes et hommes, par lieu de naissance, nom de famille ou siècle
    $by = in_array($q['by'] ?? '', ['death_place', 'death_surname', 'death_century', 'marriage_century'], true) ? (string) $q['by'] : 'death_century';
    $people = dchf_people($pdo); $acc = [];
    $put = static function (string $k, string $g, int $age) use (&$acc) { if ($k === '' || !in_array($g, ['female', 'male'], true)) { return; } $acc[$k][$g][] = $age; };
    if ($by === 'marriage_century') {
        foreach (dchf_marriages($pdo) as $m) { foreach ([$m['p1'], $m['p2']] as $pid) { $p = $people[$pid] ?? null; if (!$p || !$p['birth']) { continue; } $a = dchf_age($p['birth'], $m['date']); if ($a !== null && $a >= 12) { $put(dchf_century($m['date'][0]), $p['gender'], $a); } } }
    } else {
        $place = [];
        if ($by === 'death_place') {
            $q2 = $pdo->query("SELECT e.person_id, pl.name FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND TRIM(COALESCE(pl.name,''))<>'' ORDER BY t.gedcom_tag='BIRT' DESC");
            foreach ($q2 as $r) { $id = (int) $r['person_id']; if (!isset($place[$id])) { $place[$id] = trim(explode(',', (string) $r['name'])[0]); } }
        }
        foreach ($people as $id => $p) {
            if (!$p['birth'] || !$p['death']) { continue; } $a = dchf_age($p['birth'], $p['death']); if ($a === null) { continue; }
            $k = $by === 'death_place' ? ($place[$id] ?? '') : ($by === 'death_surname' ? mb_convert_case(mb_strtolower(trim($p['last'])), MB_CASE_TITLE, 'UTF-8') : dchf_century($p['birth'][0]));
            $put($k, $p['gender'], $a);
        }
    }
    $rows = [];
    foreach ($acc as $k => $g) {
        $f = $g['female'] ?? []; $m = $g['male'] ?? []; $n = count($f) + count($m); if ($n < 2) { continue; }
        $rows[] = ['label' => (string) $k, 's0' => $f ? round(array_sum($f) / count($f), 1) : '', 's1' => $m ? round(array_sum($m) / count($m), 1) : '', 'n' => $n, 'nf' => count($f), 'nm' => count($m)];
    }
    if ($by === 'death_century' || $by === 'marriage_century') {
        $roman = static function (string $s): int { $r = ['I' => 1, 'V' => 5, 'X' => 10, 'L' => 50, 'C' => 100]; $t = 0; $c = preg_replace('/[^IVXLC]/', '', $s); for ($i = 0; $i < strlen($c); $i++) { $v = $r[$c[$i]]; $nx = $r[$c[$i + 1] ?? ''] ?? 0; $t += $v < $nx ? -$v : $v; } return $t; };
        usort($rows, static fn($x, $y) => $roman($x['label']) <=> $roman($y['label']));
    } else { usort($rows, static fn($x, $y) => $y['n'] <=> $x['n']); $rows = array_slice($rows, 0, 20); }
    return ['series' => ['Femmes', 'Hommes'], 'rows' => $rows, 'by' => $by];
}
