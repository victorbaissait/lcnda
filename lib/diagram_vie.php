<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 Diagrammes D23 à D38 « vie, couples, lieux et recherche » (assets/js/heritage-diagram-vie.js) : les chiffres pris dans la base.
 * GET api.php?action=diagram_vie&what=…  (lecture seule, tout est borné ; les textes sont échappés dans le navigateur)
 *  - infant    : D23 mortalité des enfants — part des enfants morts avant 1 an et avant 5 ans, par tranche d'années de naissance ;
 *  - siblings  : D25 fratries qui survivent — par couple, enfants nés et arrivés à l'âge adulte ;
 *  - seasons   : D26 saisons des naissances et des décès — mois × tranche d'années ;
 *  - widow     : D27 veuvage et remariage — délai entre la mort d'un époux et le remariage ;
 *  - duration  : D28 durée des mariages — de la noce à la mort du premier des deux ;
 *  - parentage : D29 âge du père et de la mère à chaque naissance ;
 *  - prenup    : D30 conceptions avant mariage — premier enfant né moins de 8 mois après la noce (ou avant) ;
 *  - agegap    : D31 écart d'âge entre époux ;
 *  - cradle    : D34 loin du berceau — distance au lieu de référence, génération par génération ;
 *  - sign      : D35 savoir signer — époux, épouses et témoins qui ont signé l'acte (events.signed1/2, event_witnesses.signed) ;
 *  - proof     : D36 ce que tu as prouvé — génération × acte (naissance, mariage, décès) : sourcé, sans source, manquant ;
 *  - registers : D37 registres consultés — par commune, les années vues (dépouillements, actes sourcés).
 * Les D24 (crises), D32 (patronymes), D33 (mariages entre villages) et D38 (témoins et parrains) existaient déjà :
 * lib/diagram_more.php et lib/diagram_genea.php.
 */

require_once __DIR__ . '/diagram_famille.php'; // dfa_scope, dfa_km, dfa_sex + dchf_*, dgn_*, dmo_*, dgo_*

const DVI_MAX_ROWS = 5000;
const DVI_MAX_IDS = 400;

/** une tranche d'années : 1784 → « 1780 » (pas de 10), « 1775 » (25), « XVIIIe s. » (100) */
function dvi_bucket(int $y, int $step): string
{
    if ($step >= 100) { return dchf_century($y); }
    return (string) (intdiv($y - ($y < 0 ? $step - 1 : 0), $step) * $step);
}

/** l'ordre d'une tranche (pour trier « XVIIe s. » avant « XVIIIe s. ») */
function dvi_bucket_rank(int $y, int $step): int
{
    return $step >= 100 ? intdiv($y - 1, 100) : intdiv($y, $step);
}

/** mois entre deux dates [an, mois, jour, précise] : null si l'une n'a pas de mois */
function dvi_months(array $a, array $b): ?float
{
    if ($a[1] <= 0 || $b[1] <= 0) { return null; }
    $m = ($b[0] - $a[0]) * 12 + ($b[1] - $a[1]);
    if ($a[2] > 0 && $b[2] > 0) { $m += ($b[2] - $a[2]) / 30.44; }
    return round($m, 1);
}

/** années (décimales) entre deux dates : au mois près si possible */
function dvi_years(array $a, array $b): float
{
    $m = dvi_months($a, $b);
    return $m !== null ? round($m / 12, 2) : (float) ($b[0] - $a[0]);
}

function dvi_step(string $s): int
{
    $n = (int) $s;
    return in_array($n, [5, 10, 20, 25, 50, 100], true) ? $n : 10;
}

/** les familles : id → [p1, p2, date du mariage ou null, enfants (ids)] */
function dvi_families(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $out = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) { $out[(int) $f['id']] = [(int) $f['partner1_id'], (int) $f['partner2_id'], null, []]; }
    foreach (dchf_marriages($pdo) as $m) { if (isset($out[$m['id']])) { $out[$m['id']][2] = $m['date']; } }
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children ORDER BY position, id') as $c) { $f = (int) $c['family_id']; if (isset($out[$f])) { $out[$f][3][] = (int) $c['child_id']; } }
    return $cache = $out;
}

/** le mari et la femme d'une famille (selon le sexe, sinon l'ordre) */
function dvi_couple(array $f, array $lives): array
{
    [$a, $b] = [$f[0], $f[1]];
    $ga = $lives[$a]['g'] ?? ''; $gb = $lives[$b]['g'] ?? '';
    if ($ga === 'female' || $gb === 'male') { return [$b, $a]; }
    return [$a, $b];
}

function dvi_ids(array $ids): string
{
    return implode(',', array_slice(array_values(array_unique(array_filter($ids))), 0, DVI_MAX_IDS));
}

function dvi_keep(?array $keep, int $id): bool
{
    return $keep === null || isset($keep[$id]);
}

/* ═════════ D23 👶 Mortalité des enfants ═════════ */
function dvi_infant(PDO $pdo, int $step, string $scope, int $root): array
{
    $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo);
    $b = []; $unknown = 0;
    foreach ($lives as $id => $p) {
        if (!$p['b'] || !dvi_keep($keep, $id) || !dgo_year_ok($p['b'][0])) { continue; }
        if (!$p['d'] && !$p['living']) { $unknown++; continue; } // décès inconnu : on ne sait pas s'il est mort enfant
        $age = $p['d'] ? dvi_years($p['b'], $p['d']) : 99.0;
        $k = dvi_bucket($p['b'][0], $step);
        $b[$k] ??= ['label' => $k, 'rank' => dvi_bucket_rank($p['b'][0], $step), 'n' => 0, 'd1' => 0, 'd5' => 0, 'ids1' => [], 'ids5' => []];
        $b[$k]['n']++;
        if ($age < 1) { $b[$k]['d1']++; $b[$k]['ids1'][] = $id; }
        if ($age < 5) { $b[$k]['d5']++; $b[$k]['ids5'][] = $id; }
    }
    usort($b, static fn($x, $y) => $x['rank'] <=> $y['rank']);
    $rows = array_map(static fn($r) => ['label' => $r['label'], 'n' => $r['n'], 'd1' => $r['d1'], 'd5' => $r['d5'], 'ids1' => dvi_ids($r['ids1']), 'ids5' => dvi_ids($r['ids5'])], $b);
    return ['rows' => array_values($rows), 'unknown' => $unknown];
}

/* ═════════ D25 👨‍👩‍👧 Fratries qui survivent ═════════ */
function dvi_siblings(PDO $pdo, int $adult, int $top, string $scope, int $root): array
{
    $adult = max(10, min(25, $adult)); $top = max(3, min(60, $top));
    $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo); $rows = [];
    foreach (dvi_families($pdo) as $fid => $f) {
        $kids = $f[3]; if (!$kids) { continue; }
        [$h, $w] = dvi_couple($f, $lives);
        if ($keep !== null && !isset($keep[$h]) && !isset($keep[$w])) { continue; }
        $yr = $f[2][0] ?? null; foreach ($kids as $c) { if (!$yr && ($lives[$c]['b'] ?? null)) { $yr = $lives[$c]['b'][0]; } }
        if (!dgo_year_ok($yr)) { continue; }
        $adultIds = []; $youngIds = []; $unk = 0;
        foreach ($kids as $c) {
            $p = $lives[$c] ?? null; if (!$p) { continue; }
            if ($p['b'] && $p['d']) {
                if (dvi_years($p['b'], $p['d']) >= $adult) { $adultIds[] = $c; } else { $youngIds[] = $c; }
            } elseif ($p['living']) { $adultIds[] = $c; } // en vie aujourd'hui : compté comme arrivé (ou en route) à l'âge adulte
            else { $unk++; }
        }
        $name = trim(($lives[$h]['name'] ?? '?') . ' & ' . ($lives[$w]['name'] ?? '?'));
        $rows[] = ['couple' => $name, 'year' => $yr ? (string) $yr : '', 'born' => count($kids), 'adult' => count($adultIds), 'young' => count($youngIds), 'unknown' => $unk,
            'ids_adult' => dvi_ids($adultIds), 'ids_young' => dvi_ids($youngIds), 'pids' => dvi_ids([$h, $w])];
    }
    usort($rows, static fn($a, $b) => $b['born'] <=> $a['born'] ?: $b['young'] <=> $a['young']);
    return ['rows' => array_slice($rows, 0, $top), 'couples' => count($rows)];
}

/* ═════════ D26 🗓 Saisons des naissances et des décès ═════════ */
function dvi_seasons(PDO $pdo, int $step, string $scope, int $root): array
{
    $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo); $b = [];
    $add = static function (array $d, string $k, int $id) use (&$b, $step) {
        if ($d[1] < 1 || $d[1] > 12 || !dgo_year_ok($d[0])) { return; }
        $key = dvi_bucket($d[0], $step);
        $b[$key] ??= ['label' => $key, 'rank' => dvi_bucket_rank($d[0], $step), 'b' => array_fill(0, 12, 0), 'd' => array_fill(0, 12, 0), 'ib' => array_fill(0, 12, []), 'id' => array_fill(0, 12, [])];
        $b[$key][$k][$d[1] - 1]++; if (count($b[$key]['i' . $k][$d[1] - 1]) < 200) { $b[$key]['i' . $k][$d[1] - 1][] = $id; }
    };
    foreach ($lives as $id => $p) {
        if (!dvi_keep($keep, $id)) { continue; }
        if ($p['b']) { $add($p['b'], 'b', $id); }
        if ($p['d']) { $add($p['d'], 'd', $id); }
    }
    usort($b, static fn($x, $y) => $x['rank'] <=> $y['rank']);
    return ['rows' => array_map(static fn($r) => ['label' => $r['label'], 'b' => $r['b'], 'd' => $r['d'], 'ib' => array_map('dvi_ids', $r['ib']), 'id' => array_map('dvi_ids', $r['id'])], $b)];
}

/* ═════════ D27 💔 Veuvage et remariage ═════════ */
function dvi_widow(PDO $pdo, string $scope, int $root): array
{
    $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo); $byPerson = [];
    foreach (dvi_families($pdo) as $fid => $f) {
        if (!$f[2]) { continue; }
        foreach ([[$f[0], $f[1]], [$f[1], $f[0]]] as [$p, $s]) { if ($p && $s) { $byPerson[$p][] = [$f[2], $s]; } }
    }
    $rows = [];
    foreach ($byPerson as $p => $list) {
        if (count($list) < 2 || !dvi_keep($keep, $p) || !isset($lives[$p])) { continue; }
        usort($list, static fn($a, $b) => [$a[0][0], $a[0][1], $a[0][2]] <=> [$b[0][0], $b[0][1], $b[0][2]]);
        for ($i = 1; $i < count($list); $i++) {
            $prev = $lives[$list[$i - 1][1]] ?? null; if (!$prev || !$prev['d']) { continue; }
            $m = $list[$i][0]; if ([$m[0], $m[1]] < [$prev['d'][0], $prev['d'][1]]) { continue; } // remarié avant le décès connu : on ne compte pas
            if (!dgo_year_ok($prev['d'][0])) { continue; }
            $months = dvi_months($prev['d'], $m) ?? (float) (($m[0] - $prev['d'][0]) * 12);
            $rows[] = ['name' => $lives[$p]['name'], 'sex' => dfa_sex($lives[$p]['g']), 'months' => max(0, $months), 'year' => (string) $prev['d'][0], 'spouse' => $prev['name'], 'pid' => $p];
            if (count($rows) >= DVI_MAX_ROWS) { break 2; }
        }
    }
    return ['rows' => $rows];
}

/* ═════════ D28 ⏳ Durée des mariages ═════════ */
function dvi_duration(PDO $pdo, string $scope, int $root): array
{
    $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo); $rows = []; $open = 0;
    foreach (dvi_families($pdo) as $fid => $f) {
        if (!$f[2] || !$f[0] || !$f[1]) { continue; }
        if ($keep !== null && !isset($keep[$f[0]]) && !isset($keep[$f[1]])) { continue; }
        if (!dgo_year_ok($f[2][0])) { continue; }
        $ends = array_filter([$lives[$f[0]]['d'] ?? null, $lives[$f[1]]['d'] ?? null]);
        if (!$ends) { $open++; continue; }
        usort($ends, static fn($a, $b) => [$a[0], $a[1], $a[2]] <=> [$b[0], $b[1], $b[2]]);
        $y = dvi_years($f[2], $ends[0]); if ($y < 0 || $y > 90) { continue; }
        [$h, $w] = dvi_couple($f, $lives);
        $rows[] = ['couple' => trim(($lives[$h]['name'] ?? '?') . ' & ' . ($lives[$w]['name'] ?? '?')), 'year' => (string) $f[2][0], 'years' => $y, 'pids' => dvi_ids([$h, $w])];
        if (count($rows) >= DVI_MAX_ROWS) { break; }
    }
    return ['rows' => $rows, 'open' => $open];
}

/* ═════════ D29 👴 Âge des parents à chaque naissance ═════════ */
function dvi_parentage(PDO $pdo, string $scope, int $root): array
{
    $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo); $L = dgn_links($pdo); $rows = [];
    foreach ($lives as $id => $p) {
        if (!$p['b'] || !dvi_keep($keep, $id) || !dgo_year_ok($p['b'][0])) { continue; }
        $fa = $L['parents'][$id][0] ?? 0; $mo = $L['parents'][$id][1] ?? 0;
        $fb = $fa ? ($lives[$fa]['b'] ?? null) : null; $mb = $mo ? ($lives[$mo]['b'] ?? null) : null;
        if (!$fb && !$mb) { continue; }
        $af = $fb ? dvi_years($fb, $p['b']) : null; $am = $mb ? dvi_years($mb, $p['b']) : null;
        if (($af !== null && ($af < 10 || $af > 90)) || ($am !== null && ($am < 10 || $am > 65))) { continue; } // dates qui ne tiennent pas
        $rows[] = ['child' => $p['name'], 'year' => (string) $p['b'][0], 'fa' => $af === null ? '' : (string) $af, 'ma' => $am === null ? '' : (string) $am, 'cid' => $id];
        if (count($rows) >= DVI_MAX_ROWS) { break; }
    }
    return ['rows' => $rows];
}

/* ═════════ D30 🤰 Conceptions avant mariage ═════════ */
function dvi_prenup(PDO $pdo, int $limit, int $step, string $scope, int $root): array
{
    $limit = max(5, min(9, $limit)); $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo); $b = []; $skipped = 0;
    foreach (dvi_families($pdo) as $fid => $f) {
        if (!$f[2] || !$f[3]) { continue; }
        if ($keep !== null && !isset($keep[$f[0]]) && !isset($keep[$f[1]])) { continue; }
        if (!dgo_year_ok($f[2][0])) { continue; }
        $first = null; $fc = 0;
        foreach ($f[3] as $c) { $d = $lives[$c]['b'] ?? null; if ($d && ($first === null || [$d[0], $d[1], $d[2]] < [$first[0], $first[1], $first[2]])) { $first = $d; $fc = $c; } }
        if (!$first) { continue; }
        $m = dvi_months($f[2], $first); if ($m === null) { $skipped++; continue; }
        if ($m > 120) { continue; } // premier enfant connu 10 ans après : on ne sait pas s'il était le premier
        $k = dvi_bucket($f[2][0], $step);
        $b[$k] ??= ['label' => $k, 'rank' => dvi_bucket_rank($f[2][0], $step), 'n' => 0, 'before' => 0, 'early' => 0, 'ib' => [], 'ie' => []];
        $b[$k]['n']++;
        if ($m < 0) { $b[$k]['before']++; $b[$k]['ib'][] = $fc; }
        elseif ($m < $limit) { $b[$k]['early']++; $b[$k]['ie'][] = $fc; }
    }
    usort($b, static fn($x, $y) => $x['rank'] <=> $y['rank']);
    return ['rows' => array_map(static fn($r) => ['label' => $r['label'], 'n' => $r['n'], 'before' => $r['before'], 'early' => $r['early'], 'ids_before' => dvi_ids($r['ib']), 'ids_early' => dvi_ids($r['ie'])], $b), 'skipped' => $skipped];
}

/* ═════════ D31 💑 Écart d'âge entre époux ═════════ */
function dvi_agegap(PDO $pdo, string $scope, int $root): array
{
    $keep = dfa_scope($pdo, $scope, $root); $lives = dmo_lives($pdo); $rows = [];
    foreach (dvi_families($pdo) as $fid => $f) {
        if (!$f[0] || !$f[1]) { continue; }
        if ($keep !== null && !isset($keep[$f[0]]) && !isset($keep[$f[1]])) { continue; }
        [$h, $w] = dvi_couple($f, $lives);
        if (($lives[$h]['g'] ?? '') !== 'male' || ($lives[$w]['g'] ?? '') !== 'female') { continue; }
        $hb = $lives[$h]['b'] ?? null; $wb = $lives[$w]['b'] ?? null; if (!$hb || !$wb) { continue; }
        $yr = $f[2][0] ?? max($hb[0], $wb[0]) + 20; if (!dgo_year_ok($yr)) { continue; }
        $gap = dvi_years($hb, $wb); if (abs($gap) > 50) { continue; }
        $rows[] = ['couple' => $lives[$h]['name'] . ' & ' . $lives[$w]['name'], 'gap' => $gap, 'year' => (string) $yr, 'pids' => dvi_ids([$h, $w])];
        if (count($rows) >= DVI_MAX_ROWS) { break; }
    }
    return ['rows' => $rows];
}

/* ═════════ D34 🧭 Loin du berceau ═════════ */
function dvi_cradle(PDO $pdo, int $root, int $gens, string $ref, int $place): array
{
    $root = dgn_root($pdo, $root); $gens = max(2, min(14, $gens));
    if (!$root) { return ['rows' => [], 'ref' => '']; }
    $lives = dmo_lives($pdo); $coords = [];
    foreach ($pdo->query('SELECT id, name, latitude, longitude FROM places WHERE latitude IS NOT NULL AND longitude IS NOT NULL') as $r) { $coords[(int) $r['id']] = [(float) $r['latitude'], (float) $r['longitude'], (string) $r['name']]; }
    $byGen = [];
    foreach (dgn_sosa($pdo, $root, $gens, 20000) as $s => $id) {
        $g = strlen(decbin($s)); $bp = $lives[$id]['bp'] ?? 0;
        if ($bp && isset($coords[$bp])) { $byGen[$g][$id] = $coords[$bp]; }
    }
    $refPt = null; $refName = '';
    if ($ref === 'place' && $place && isset($coords[$place])) { $refPt = $coords[$place]; }
    elseif ($ref === 'oldest' && $byGen) {
        $g = max(array_keys($byGen)); $pts = array_values($byGen[$g]); $lat = 0; $lon = 0;
        foreach ($pts as $p) { $lat += $p[0]; $lon += $p[1]; }
        $refPt = [$lat / count($pts), $lon / count($pts), 'le centre des lieux de naissance de la génération ' . $g];
    } else { $refPt = $byGen[1][$root] ?? null; }
    if (!$refPt) { return ['rows' => [], 'ref' => '', 'missing' => true]; }
    $refName = $refPt[2];
    $rows = [];
    ksort($byGen);
    foreach ($byGen as $g => $list) {
        $km = []; foreach ($list as $id => $p) { $km[$id] = dfa_km($refPt[0], $refPt[1], $p[0], $p[1])[0]; }
        $vals = array_values($km); sort($vals); $n = count($vals);
        $far = $km; arsort($far);
        $rows[] = ['gen' => $g, 'n' => $n, 'avg' => round(array_sum($vals) / max(1, $n), 1), 'median' => $vals[intdiv($n, 2)] ?? 0, 'max' => $vals[$n - 1] ?? 0, 'ids' => dvi_ids(array_keys($far))];
    }
    return ['rows' => $rows, 'ref' => $refName, 'root_name' => $lives[$root]['name'] ?? ''];
}

/* ═════════ D35 ✍️ Savoir signer ═════════ */
function dvi_sign(PDO $pdo, int $step): array
{
    $b = [];
    $add = static function (int $y, string $k, int $v) use (&$b, $step) {
        if (!dgo_year_ok($y)) { return; }
        $key = dvi_bucket($y, $step);
        $b[$key] ??= ['label' => $key, 'rank' => dvi_bucket_rank($y, $step), 'h1' => 0, 'h0' => 0, 'f1' => 0, 'f0' => 0, 'w1' => 0, 'w0' => 0];
        $b[$key][$k . $v]++;
    };
    $cols = array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(), 'name');
    if (!in_array('signed1', $cols, true)) { return ['rows' => [], 'none' => true]; }
    $lives = dmo_lives($pdo);
    $q = $pdo->query("SELECT e.id, e.scope, e.person_id, e.year, e.sort_date, e.signed1, e.signed2, f.partner1_id, f.partner2_id FROM events e LEFT JOIN families f ON f.id=e.family_id
        WHERE (e.signed1 IS NOT NULL OR e.signed2 IS NOT NULL)");
    foreach ($q as $e) {
        $d = dchf_date($e['sort_date'], $e['year']); if (!$d) { continue; }
        if ($e['scope'] === 'family') {
            $p1 = (int) $e['partner1_id']; $female1 = ($lives[$p1]['g'] ?? '') === 'female';
            if ($e['signed1'] !== null) { $add($d[0], $female1 ? 'f' : 'h', (int) $e['signed1']); }
            if ($e['signed2'] !== null) { $add($d[0], $female1 ? 'h' : 'f', (int) $e['signed2']); }
        } elseif ($e['signed1'] !== null) { $add($d[0], ($lives[(int) $e['person_id']]['g'] ?? '') === 'female' ? 'f' : 'h', (int) $e['signed1']); }
    }
    foreach ($pdo->query('SELECT e.year, e.sort_date, ew.signed FROM event_witnesses ew JOIN events e ON e.id=ew.event_id WHERE ew.signed IS NOT NULL') as $w) {
        $d = dchf_date($w['sort_date'], $w['year']); if ($d) { $add($d[0], 'w', (int) $w['signed']); }
    }
    usort($b, static fn($x, $y) => $x['rank'] <=> $y['rank']);
    return ['rows' => array_map(static fn($r) => array_diff_key($r, ['rank' => 1]), $b)];
}

/* ═════════ D36 ✅ Ce que tu as prouvé ═════════ */
function dvi_proof(PDO $pdo, int $root, int $gens): array
{
    $root = dgn_root($pdo, $root); $gens = max(2, min(12, $gens));
    if (!$root) { return ['rows' => []]; }
    $lives = dmo_lives($pdo);
    $sourced = [];
    foreach ($pdo->query("SELECT DISTINCT entity_id FROM source_links WHERE entity_type='event'") as $r) { $sourced[(int) $r['entity_id']] = true; }
    $ev = []; // personne → acte → 2 sourcé / 1 sans source
    $kind = ['BIRT' => 'b', 'CHR' => 'b', 'BAPM' => 'b', 'DEAT' => 'd', 'BURI' => 'd'];
    foreach ($pdo->query("SELECT e.id, e.person_id, t.gedcom_tag AS tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI')") as $e) {
        $p = (int) $e['person_id']; $k = $kind[$e['tag']]; $v = isset($sourced[(int) $e['id']]) ? 2 : 1;
        $ev[$p][$k] = max($ev[$p][$k] ?? 0, $v);
    }
    foreach ($pdo->query("SELECT e.id, f.partner1_id, f.partner2_id FROM events e JOIN families f ON f.id=e.family_id JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('MARR','MARB','MARC')") as $e) {
        $v = isset($sourced[(int) $e['id']]) ? 2 : 1;
        foreach (['partner1_id', 'partner2_id'] as $c) { $p = (int) $e[$c]; if ($p) { $ev[$p]['m'] = max($ev[$p]['m'] ?? 0, $v); } }
    }
    $rows = [];
    foreach (dgn_sosa($pdo, $root, $gens, 20000) as $s => $id) {
        $g = strlen(decbin($s));
        $rows[$g] ??= ['gen' => $g, 'expected' => 2 ** ($g - 1), 'found' => 0];
        $rows[$g]['found']++;
        foreach (['b', 'm', 'd'] as $k) {
            if ($k === 'm' && $g === 1) { continue; } // la personne de départ n'est pas forcément mariée
            if ($k === 'd' && ($lives[$id]['living'] ?? false)) { continue; } // en vie : pas d'acte de décès attendu
            $v = $ev[$id][$k] ?? 0; $tag = [2 => 's', 1 => 'e', 0 => 'x'][$v];
            $rows[$g][$k . $tag] = ($rows[$g][$k . $tag] ?? 0) + 1;
            $rows[$g]['i' . $k . $tag][] = $id;
        }
    }
    ksort($rows);
    $out = [];
    foreach ($rows as $r) {
        $o = ['gen' => $r['gen'], 'expected' => $r['expected'], 'found' => $r['found']];
        foreach (['b', 'm', 'd'] as $k) { foreach (['s', 'e', 'x'] as $t) { $o[$k . $t] = $r[$k . $t] ?? 0; $o['i' . $k . $t] = dvi_ids($r['i' . $k . $t] ?? []); } }
        $out[] = $o;
    }
    return ['rows' => $out, 'root_name' => $lives[$root]['name'] ?? ''];
}

/* ═════════ D37 📚 Registres consultés ═════════ */
function dvi_registers(PDO $pdo, int $top): array
{
    $top = max(3, min(40, $top)); $places = []; $spans = [];
    foreach ($pdo->query('SELECT id, name FROM places') as $r) { $places[(int) $r['id']] = trim((string) $r['name']); }
    $tables = array_column($pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(), 'name');
    $add = static function (string $place, int $from, int $to, string $kind) use (&$spans) {
        $place = trim($place); if ($place === '' || $from < 1000 || $to > 2100 || $to < $from || $to - $from > 300) { return; }
        $spans[$place][] = [$from, $to, $kind];
    };
    if (in_array('archive_digest_entries', $tables, true)) {
        $cols = array_column($pdo->query('PRAGMA table_info(archive_digest_entries)')->fetchAll(), 'name');
        $res = in_array('result', $cols, true) ? 'result' : "''";
        foreach ($pdo->query("SELECT place_id, city_name, year_text, status, $res AS result FROM archive_digest_entries") as $d) {
            if (!preg_match_all('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) $d['year_text'], $m)) { continue; }
            $ys = array_map('intval', $m[1]); $name = ($places[(int) $d['place_id']] ?? '') !== '' ? $places[(int) $d['place_id']] : (string) $d['city_name'];
            $kind = $d['result'] === 'none' ? 'none' : ($d['status'] === 'todo' ? 'todo' : 'seen');
            $add($name, min($ys), max($ys), $kind);
        }
    }
    $sourced = [];
    foreach ($pdo->query("SELECT DISTINCT entity_id FROM source_links WHERE entity_type='event'") as $r) { $sourced[(int) $r['entity_id']] = true; }
    if ($sourced) {
        foreach ($pdo->query('SELECT id, year, sort_date, place_id FROM events WHERE place_id IS NOT NULL') as $e) {
            if (!isset($sourced[(int) $e['id']])) { continue; }
            $d = dchf_date($e['sort_date'], $e['year']); if (!$d) { continue; }
            $add($places[(int) $e['place_id']] ?? '', $d[0], $d[0], 'act');
        }
    }
    uasort($spans, static fn($a, $b) => count($b) <=> count($a));
    $rows = [];
    foreach (array_slice($spans, 0, $top, true) as $place => $list) {
        foreach ($list as [$f, $t, $k]) { $rows[] = ['place' => (string) $place, 'from' => (string) $f, 'to' => (string) $t, 'kind' => $k]; if (count($rows) >= DVI_MAX_ROWS) { break 2; } }
    }
    return ['rows' => $rows, 'places' => min($top, count($spans))];
}

function diagram_vie_data(PDO $pdo, array $q): array
{
    $q = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $q);
    dgo_request($q); // groupe de personnes et période communs (onglet « Depuis l'app ») : refusés s'ils sont de mauvaise forme
    $root = (int) ($q['root'] ?? 0); $scope = in_array($q['scope'] ?? '', ['', 'anc', 'desc'], true) ? (string) ($q['scope'] ?? '') : '';
    $step = dvi_step($q['step'] ?? '10');
    return match ($q['what'] ?? '') {
        'infant' => dvi_infant($pdo, $step, $scope, $root),
        'siblings' => dvi_siblings($pdo, (int) ($q['adult'] ?? 15), (int) ($q['top'] ?? 20), $scope, $root),
        'seasons' => dvi_seasons($pdo, $step, $scope, $root),
        'widow' => dvi_widow($pdo, $scope, $root),
        'duration' => dvi_duration($pdo, $scope, $root),
        'parentage' => dvi_parentage($pdo, $scope, $root),
        'prenup' => dvi_prenup($pdo, (int) ($q['limit'] ?? 8), $step, $scope, $root),
        'agegap' => dvi_agegap($pdo, $scope, $root),
        'cradle' => dvi_cradle($pdo, $root, (int) ($q['gens'] ?? 8), in_array($q['ref'] ?? '', ['root', 'oldest', 'place'], true) ? (string) $q['ref'] : 'root', (int) ($q['place'] ?? 0)),
        'sign' => dvi_sign($pdo, $step),
        'proof' => dvi_proof($pdo, $root, (int) ($q['gens'] ?? 6)),
        'registers' => dvi_registers($pdo, (int) ($q['top'] ?? 12)),
        default => throw new LcndaBadInput('Données inconnues.'),
    };
}
