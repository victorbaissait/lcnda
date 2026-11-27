<?php
declare(strict_types=1);

/**
 * LCNDA — Lot O (maquette validée docs/design/lot-o.html, idées docs/donnees-idees-lot-o.md, lots O1 et O2) :
 * « 🌳 Ce que dit l'arbre » (Listes → 🌳 Famille) et les phrases ajoutées dans les blocs de la fiche (🌍, ⚖️, 👪).
 * Écran : assets/js/app-lot-o-arbre.js ; calculs purs (dispense, jours chômés…) : assets/js/app-lot-o-core.js.
 * Tout est calculé ici, avec l'arbre de cette base : rien n'est téléchargé. Lecture seule.
 *  GET lot_o_arbre&card=…   une carte (tempsclos, dispense, prenup, gravity, radius, widow, godname, orphans, land, signatures),
 *                           avec le groupe de personnes et la période communs des diagrammes (dg_pop, dg_root, dg_from, dg_to…) ;
 *  GET lot_o_dispense&a=&b= 🔗 deux personnes : le degré pour l'Église (comput germanique) et pour la loi civile, l'ancêtre commun,
 *                           l'affinité (le conjoint d'avant), le coefficient F ;
 *  GET lot_o_person&id=     ce que la fiche dit en une phrase : orphelin, posthume, dispense, quitter la terre, canton (justice de paix) ;
 *  GET lot_o_life&id=       🕰 horloge, 🎂 règle des âges, 📰 bulletin : naissance, décès, mariages, enfants, départ, âge des parents.
 * Tact (décision du 27/11/2026) : une fiche vivante (ou « vivante probable ») ou confidentielle n'est JAMAIS comptée ni nommée
 * (df_hidden_people, la règle de l'export pour partager) ; les noms des conceptions avant mariage seulement sur demande
 * (names=1) et pour des couples nés il y a plus de 100 ans.
 */

require_once __DIR__ . '/diagram_famille.php'; // dfa_*, dchf_*, dgn_*, dmo_*, dgo_*
require_once __DIR__ . '/diagram_vie.php';     // dvi_families, dvi_months, dvi_widow
require_once __DIR__ . '/dates_feter.php';     // df_hidden_people

const LO_CARDS = ['tempsclos', 'dispense', 'prenup', 'gravity', 'radius', 'widow', 'godname', 'orphans', 'land', 'signatures'];
const LO_MAX = 400;

/** vivants (et vivants probables) et fiches confidentielles : id => 'living' | 'private' */
function lo_hidden(PDO $pdo): array
{
    static $h = null;
    return $h ??= df_hidden_people($pdo);
}

/** une fiche qu'on peut compter et nommer */
function lo_ok(PDO $pdo, int $id): bool
{
    return $id > 0 && !isset(lo_hidden($pdo)[$id]);
}

/** le groupe de personnes choisi (dg_*), sans les fiches cachées : fn(id) → bool */
function lo_in(PDO $pdo): callable
{
    $keep = dgo_restrict($pdo, null);
    return static fn(int $id): bool => lo_ok($pdo, $id) && ($keep === null || isset($keep[$id]));
}

function lo_name(PDO $pdo, int $id): string
{
    return lo_ok($pdo, $id) ? (dmo_lives($pdo)[$id]['name'] ?? '') : '';
}

function lo_iso(?array $d): string
{
    return dmo_iso($d);
}

function lo_int(array $q, string $k, int $def, int $min, int $max): int
{
    $v = $q[$k] ?? '';
    if ($v === '' || $v === null) { return $def; }
    if (!is_scalar($v) || !preg_match('/^-?\d{1,6}$/', (string) $v)) { throw new LcndaBadInput('Nombre de mauvaise forme (' . $k . ').'); }
    return max($min, min($max, (int) $v));
}

function lo_enum(array $q, string $k, array $ok, string $def): string
{
    $v = $q[$k] ?? '';
    if (!is_scalar($v) || $v === '') { return $def; }
    if (!in_array((string) $v, $ok, true)) { throw new LcndaBadInput('Réglage inconnu (' . $k . ').'); }
    return (string) $v;
}

/** médiane d'une liste de nombres */
function lo_median(array $v): ?float
{
    if (!$v) { return null; }
    sort($v); $n = count($v);
    return $n % 2 ? (float) $v[intdiv($n, 2)] : ($v[$n / 2 - 1] + $v[$n / 2]) / 2;
}

/* ═════════ 🔗 la parenté : ancêtres avec leur distance (0 = soi), et le chemin ═════════ */
/** id → [distance, l'enfant par lequel on y monte] */
function lo_anc(PDO $pdo, int $id, int $max = 12): array
{
    $L = dgn_links($pdo); $out = [$id => [0, 0]]; $level = [$id];
    for ($g = 1; $g <= $max && $level; $g++) {
        $next = [];
        foreach ($level as $x) {
            foreach ($L['parents'][$x] ?? [] as $p) {
                $p = (int) $p; if (!$p || isset($out[$p])) { continue; }
                $out[$p] = [$g, $x]; $next[] = $p;
                if (count($out) > 20000) { break 3; }
            }
        }
        $level = $next;
    }
    return $out;
}

/** le lien entre deux personnes : null s'ils ne sont pas parents (dans les $max générations) */
function lo_kin(PDO $pdo, int $a, int $b, int $max = 12): ?array
{
    if ($a === $b || !$a || !$b) { return null; }
    $A = lo_anc($pdo, $a, $max); $B = lo_anc($pdo, $b, $max);
    if (isset($A[$b])) { return ['direct' => true, 'canon' => $A[$b][0], 'civil' => $A[$b][0], 'da' => $A[$b][0], 'db' => 0, 'anc' => $b, 'ancs' => [$b], 'f' => 0.0]; }
    if (isset($B[$a])) { return ['direct' => true, 'canon' => $B[$a][0], 'civil' => $B[$a][0], 'da' => 0, 'db' => $B[$a][0], 'anc' => $a, 'ancs' => [$a], 'f' => 0.0]; }
    $common = array_intersect_key($A, $B);
    if (!$common) { return null; }
    $best = null;
    foreach ($common as $c => $_) {
        $da = $A[$c][0]; $db = $B[$c][0]; $k = [max($da, $db), $da + $db, $c];
        if ($best === null || $k < $best) { $best = $k; }
    }
    // F (Wright) : une contribution (1/2)^(n1+n2+1) par ancêtre commun le plus proche (pas un ancêtre d'un autre ancêtre commun)
    $L = dgn_links($pdo); $isAncOfCommon = [];
    foreach ($common as $c => $_) { foreach ($L['parents'][$c] ?? [] as $p) { $p = (int) $p; if (isset($common[$p])) { $isAncOfCommon[$p] = true; } } }
    $f = 0.0; $near = [];
    foreach ($common as $c => $_) {
        if (isset($isAncOfCommon[$c])) { continue; }
        $near[] = $c; $f += 0.5 ** ($A[$c][0] + $B[$c][0] + 1);
    }
    [$canon, $civil, $anc] = $best;
    $sp = array_values(array_filter($near, static fn($c) => $A[$c][0] === $A[$anc][0] && $B[$c][0] === $B[$anc][0]));
    return ['direct' => false, 'canon' => $canon, 'civil' => $civil, 'da' => $A[$anc][0], 'db' => $B[$anc][0], 'anc' => $anc, 'ancs' => array_slice($sp ?: [$anc], 0, 2), 'f' => $f,
        'pa' => lo_path($A, $anc), 'pb' => lo_path($B, $anc)];
}

/** de l'ancêtre jusqu'à la personne : [ancêtre, enfant, …, personne] */
function lo_path(array $M, int $anc): array
{
    $out = [$anc]; $x = $anc; $guard = 0;
    while (($M[$x][1] ?? 0) && $guard++ < 40) { $x = (int) $M[$x][1]; $out[] = $x; }
    return $out;
}

/** les conjoints d'une personne : [[conjoint, famille, date du mariage ou null]] */
function lo_spouses(PDO $pdo, int $id): array
{
    $out = [];
    foreach (dvi_families($pdo) as $fid => $f) {
        if ($f[0] === $id && $f[1]) { $out[] = [$f[1], $fid, $f[2]]; }
        elseif ($f[1] === $id && $f[0]) { $out[] = [$f[0], $fid, $f[2]]; }
    }
    return $out;
}

/** l'affinité : la nouvelle épouse était-elle parente du conjoint d'avant ? [degré, conjoint d'avant] */
function lo_affinity(PDO $pdo, int $a, int $b, ?array $date, int $max = 6): ?array
{
    $best = null;
    foreach ([[$a, $b], [$b, $a]] as [$x, $y]) {
        foreach (lo_spouses($pdo, $x) as [$s, $fid, $d]) {
            if ($s === $y) { continue; }
            if ($date && $d && [$d[0], $d[1]] > [$date[0], $date[1]]) { continue; } // un mariage d'après ne compte pas
            $k = lo_kin($pdo, $s, $y, $max); if (!$k) { continue; }
            if ($best === null || $k['canon'] < $best['canon']) { $best = ['canon' => $k['canon'], 'civil' => $k['civil'], 'via' => $s, 'who' => $x, 'direct' => $k['direct']]; }
        }
    }
    return $best;
}

/** la date du mariage de a et b (s'ils sont mariés ensemble) */
function lo_marriage(PDO $pdo, int $a, int $b): ?array
{
    foreach (lo_spouses($pdo, $a) as [$s, $fid, $d]) { if ($s === $b) { return $d; } }
    return null;
}

function lo_person_mini(PDO $pdo, int $id): array
{
    $p = dmo_lives($pdo)[$id] ?? null;
    if (!$p || !lo_ok($pdo, $id)) { return ['id' => 0, 'name' => isset(lo_hidden($pdo)[$id]) && lo_hidden($pdo)[$id] === 'private' ? 'Fiche confidentielle' : 'Personne vivante', 'hidden' => true]; }
    return ['id' => $id, 'name' => $p['name'], 'sex' => dfa_sex($p['g']), 'by' => $p['b'][0] ?? null, 'dy' => $p['d'][0] ?? null];
}

function lo_dispense_pair(PDO $pdo, int $a, int $b): array
{
    if ($a <= 0 || $b <= 0) { throw new LcndaBadInput('Choisis deux personnes.'); }
    if ($a === $b) { throw new LcndaBadInput('Choisis deux personnes différentes.'); }
    $lives = dmo_lives($pdo);
    if (!isset($lives[$a]) || !isset($lives[$b])) { throw new LcndaBadInput('Fiche introuvable.'); }
    if (!lo_ok($pdo, $a) || !lo_ok($pdo, $b)) { return ['hidden' => true]; } // jamais pour une famille encore vivante
    $d = lo_marriage($pdo, $a, $b);
    $k = lo_kin($pdo, $a, $b, 14);
    $aff = lo_affinity($pdo, $a, $b, $d);
    $out = ['a' => lo_person_mini($pdo, $a), 'b' => lo_person_mini($pdo, $b), 'married' => $d !== null || in_array($b, array_column(lo_spouses($pdo, $a), 0), true), 'year' => $d[0] ?? null,
        'kin' => null, 'affinity' => null];
    if ($k) {
        $who = static fn(array $ids) => array_map(static fn($x) => lo_person_mini($pdo, (int) $x), $ids);
        $out['kin'] = ['direct' => $k['direct'], 'canon' => $k['canon'], 'civil' => $k['civil'], 'da' => $k['da'], 'db' => $k['db'], 'f' => round($k['f'], 6),
            'anc' => $who($k['ancs']), 'pa' => $who($k['pa'] ?? []), 'pb' => $who($k['pb'] ?? [])];
    }
    if ($aff) { $out['affinity'] = ['canon' => $aff['canon'], 'civil' => $aff['civil'], 'direct' => $aff['direct'], 'via' => lo_person_mini($pdo, $aff['via']), 'who' => lo_person_mini($pdo, $aff['who'])]; }
    if ($out['year'] === null) { $ys = array_filter([$lives[$a]['b'][0] ?? null, $lives[$b]['b'][0] ?? null]); $out['year_guess'] = $ys ? max($ys) + 25 : null; }
    return $out;
}

/* ═════════ les cartes ═════════ */

/** 💒 mariages datés au jour (Avent et Carême comptés dans le navigateur, avec le calendrier julien avant 1583) */
function lo_tempsclos(PDO $pdo): array
{
    $in = lo_in($pdo); $rows = []; $months = array_fill(0, 12, 0); $n = 0;
    foreach (dchf_marriages($pdo) as $m) {
        $a = $m['p1']; $b = $m['p2']; $d = $m['date'];
        if (($a && !lo_ok($pdo, $a)) || ($b && !lo_ok($pdo, $b)) || !($in($a) || $in($b)) || !dgo_year_ok($d[0])) { continue; }
        if ($d[1] < 1 || $d[1] > 12) { continue; }
        $n++;
        if ($d[3]) { if (count($rows) < 6000) { $rows[] = ['d' => sprintf('%04d-%02d-%02d', $d[0], $d[1], $d[2]), 'a' => lo_name($pdo, $a), 'b' => lo_name($pdo, $b), 'ida' => $a, 'idb' => $b]; } }
        else { $months[$d[1] - 1]++; }
    }
    return ['dated' => $rows, 'months' => $months, 'n' => $n];
}

/** 🔗 tous les couples apparentés (jusqu'au 4ᵉ degré canonique) ou alliés (le conjoint d'avant) */
function lo_dispense_all(PDO $pdo): array
{
    $in = lo_in($pdo); $rows = []; $couples = 0;
    foreach (dvi_families($pdo) as $fid => $f) {
        [$a, $b, $d] = $f; if (!$a || !$b || !lo_ok($pdo, $a) || !lo_ok($pdo, $b) || !($in($a) || $in($b))) { continue; }
        $y = $d[0] ?? null; if ($y !== null && !dgo_year_ok($y)) { continue; }
        $couples++;
        $k = lo_kin($pdo, $a, $b, 4); $aff = $k ? null : lo_affinity($pdo, $a, $b, $d, 4);
        if (($k && $k['canon'] <= 4) || ($aff && $aff['canon'] <= 4)) {
            $rows[] = ['a' => lo_name($pdo, $a), 'b' => lo_name($pdo, $b), 'ida' => $a, 'idb' => $b, 'year' => $y, 'canon' => $k ? $k['canon'] : $aff['canon'], 'civil' => $k ? $k['civil'] : $aff['civil'], 'aff' => $k ? false : true, 'direct' => (bool) ($k['direct'] ?? false)];
            if (count($rows) >= LO_MAX) { break; }
        }
    }
    usort($rows, static fn($x, $y) => [$x['year'] ?? 9999, $x['a']] <=> [$y['year'] ?? 9999, $y['a']]);
    return ['rows' => $rows, 'couples' => $couples];
}

/** l'époque d'une année, pour les parts « avec tact » */
function lo_era(int $y): array
{
    foreach ([[1750, 'avant 1750'], [1800, '1750-1799'], [1850, '1800-1849'], [1900, '1850-1899']] as [$lim, $lab]) { if ($y < $lim) { return [$lim, $lab]; } }
    return [9999, 'après 1900'];
}

/** 🤰 le premier enfant né tôt : des parts par époque ; les couples seulement si names=1, et nés il y a plus de 100 ans */
function lo_prenup(PDO $pdo, int $limit, bool $names): array
{
    $in = lo_in($pdo); $lives = dmo_lives($pdo); $eras = []; $list = []; $now = (int) date('Y');
    foreach (dvi_families($pdo) as $fid => $f) {
        [$a, $b, $d, $kids] = $f; if (!$d || !$kids || !$a || !$b) { continue; }
        if (!lo_ok($pdo, $a) || !lo_ok($pdo, $b) || !($in($a) || $in($b)) || !dgo_year_ok($d[0])) { continue; }
        $first = null; $fc = 0;
        foreach ($kids as $c) { $x = $lives[$c]['b'] ?? null; if ($x && ($first === null || [$x[0], $x[1], $x[2]] < [$first[0], $first[1], $first[2]])) { $first = $x; $fc = $c; } }
        if (!$first || !lo_ok($pdo, $fc)) { continue; } // jamais pour une famille encore vivante
        $m = dvi_months($d, $first); if ($m === null || $m > 120) { continue; }
        [$rank, $lab] = lo_era($d[0]);
        $eras[$rank] ??= ['label' => $lab, 'n' => 0, 'k' => 0];
        $eras[$rank]['n']++;
        if ($m < $limit) {
            $eras[$rank]['k']++;
            $old = static fn(int $p) => ($lives[$p]['b'][0] ?? $now) <= $now - 100;
            if ($names && $old($a) && $old($b) && count($list) < 200) { $list[] = ['a' => lo_name($pdo, $a), 'b' => lo_name($pdo, $b), 'ida' => $a, 'idb' => $b, 'year' => $d[0], 'months' => $m]; }
        }
    }
    ksort($eras);
    return ['eras' => array_values($eras), 'couples' => $names ? $list : null];
}

/** 🎯 le centre de la famille, génération après génération (lieux de naissance des ancêtres) */
function lo_gravity(PDO $pdo, int $root): array
{
    $root = dgn_root($pdo, $root); if (!$root) { return ['gens' => []]; }
    $lives = dmo_lives($pdo); $coords = [];
    foreach ($pdo->query('SELECT id, name, latitude, longitude FROM places WHERE latitude IS NOT NULL AND longitude IS NOT NULL') as $r) { $coords[(int) $r['id']] = [(float) $r['latitude'], (float) $r['longitude'], trim(explode(',', (string) $r['name'])[0])]; }
    $by = [];
    foreach (dgn_sosa($pdo, $root, 14, 40000) as $s => $id) {
        if (!lo_ok($pdo, (int) $id)) { continue; }
        $g = strlen(decbin((int) $s)); $bp = $lives[$id]['bp'] ?? 0; if (!$bp || !isset($coords[$bp])) { continue; }
        $by[$g]['pts'][$id] = $coords[$bp]; if ($lives[$id]['b']) { $by[$g]['ys'][] = $lives[$id]['b'][0]; }
    }
    ksort($by); $gens = [];
    foreach ($by as $g => $x) {
        $pts = array_values($x['pts']); $la = array_sum(array_column($pts, 0)) / count($pts); $lo = array_sum(array_column($pts, 1)) / count($pts);
        $near = ''; $bd = INF; foreach ($pts as $p) { $k = dfa_km($la, $lo, $p[0], $p[1])[0]; if ($k < $bd) { $bd = $k; $near = $p[2]; } }
        $gens[] = ['g' => $g, 'n' => count($pts), 'lat' => round($la, 4), 'lon' => round($lo, 4), 'near' => mb_substr($near, 0, 60), 'year' => isset($x['ys']) ? (int) lo_median($x['ys']) : null];
    }
    return ['gens' => $gens];
}

/** 💍 la distance entre les villages de naissance des deux époux */
function lo_radius(PDO $pdo): array
{
    $rows = [];
    foreach (dfa_radius($pdo, '', 0)['rows'] as $r) {
        if (!lo_ok($pdo, (int) $r['ida']) || !lo_ok($pdo, (int) $r['idb']) || $r['year'] === '' || !dgo_year_ok((int) $r['year'])) { continue; }
        $rows[] = ['km' => $r['km'], 'year' => (int) $r['year'], 'a' => $r['a'], 'b' => $r['b'], 'pa' => $r['pa'], 'pb' => $r['pb'], 'ida' => (int) $r['ida'], 'idb' => (int) $r['idb']];
    }
    return ['rows' => $rows];
}

/** 💔 le temps avant de se remarier (hommes, femmes) */
function lo_widow(PDO $pdo): array
{
    $in = lo_in($pdo); $out = ['h' => [], 'f' => []];
    foreach (dvi_widow($pdo, '', 0)['rows'] as $r) { if ($in((int) $r['pid']) && isset($out[$r['sex']])) { $out[$r['sex']][] = (float) $r['months']; } }
    return ['h' => $out['h'], 'f' => $out['f']];
}

/** 🎀 le prénom venait-il du parrain ou de la marraine ? */
function lo_godname(PDO $pdo): array
{
    require_once __DIR__ . '/diagram_cartes2.php';
    $d = diagram_cartes2_data($pdo, ['what' => 'godnames']);
    $fold = static fn(string $s) => lo_fold(dchf_first_given($s));
    $n = 0; $same = 0; $rels = []; $ex = []; $seen = [];
    foreach ($d['rows'] ?? [] as $r) {
        if (!lo_ok($pdo, (int) $r['gp']) || !lo_ok($pdo, (int) $r['gc'])) { continue; }
        $k = (int) $r['gc']; $hit = $fold((string) $r['gpFirst']) !== '' && $fold((string) $r['gpFirst']) === $fold((string) $r['gcFirst']);
        if (!isset($seen[$k])) { $seen[$k] = false; $n++; }
        if ($hit && !$seen[$k]) {
            $seen[$k] = true; $same++; $rel = (string) $r['rel']; $rels[$rel !== '' ? $rel : 'autre'] = ($rels[$rel !== '' ? $rel : 'autre'] ?? 0) + 1;
            if (count($ex) < 5) { $ex[] = ['child' => trim($r['gcFirst'] . ' ' . $r['gcLast']), 'year' => $r['gcYear'], 'gp' => trim($r['gpFirst'] . ' ' . $r['gpLast']), 'role' => $r['role'], 'rel' => $rel, 'idc' => $k]; }
        }
    }
    arsort($rels);
    return ['n' => $n, 'same' => $same, 'rels' => $rels, 'examples' => $ex];
}

function lo_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    return strtr($s, ['é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c']);
}

/** 🕯 orphelins jeunes et enfants posthumes : un chiffre par époque ; les posthumes nommés pour « ▸ plus » */
function lo_orphans(PDO $pdo, int $age): array
{
    $in = lo_in($pdo); $lives = dmo_lives($pdo); $L = dgn_links($pdo); $eras = []; $post = []; $remar = [0, 0]; $war = 0; $total = 0;
    foreach ($lives as $id => $p) {
        if (!$p['b'] || !$in($id) || !dgo_year_ok($p['b'][0])) { continue; }
        $fa = (int) ($L['parents'][$id][0] ?? 0); $mo = (int) ($L['parents'][$id][1] ?? 0);
        if (!$fa && !$mo) { continue; }
        $fd = $fa ? ($lives[$fa]['d'] ?? null) : null; $md = $mo ? ($lives[$mo]['d'] ?? null) : null;
        if (!$fd && !$md) { continue; } // sans décès connu des parents, on ne sait pas : pas compté
        [$rank, $lab] = lo_era($p['b'][0]);
        $eras[$rank] ??= ['label' => $lab, 'n' => 0, 'k' => 0, 'war' => 0];
        $eras[$rank]['n']++; $total++;
        $ages = [];
        foreach ([[$fd, $fa, $mo], [$md, $mo, $fa]] as [$dd, $who, $other]) { if ($dd) { $ages[] = [dvi_years($p['b'], $dd), $dd, $who, $other]; } }
        usort($ages, static fn($x, $y) => $x[0] <=> $y[0]);
        $first = $ages[0];
        if ($fd) { $m = dvi_months($fd, $p['b']); if ($m !== null && $m >= 0 && $m <= 10 && lo_ok($pdo, $fa)) { $post[] = ['name' => $p['name'], 'id' => $id, 'year' => $p['b'][0], 'months' => $m, 'father_year' => $fd[0]]; } }
        if ($first[0] >= -0.9 && $first[0] < $age) {
            $eras[$rank]['k']++;
            if ($first[2] === $fa && $fd && $fd[0] >= 1914 && $fd[0] <= 1918) { $eras[$rank]['war']++; $war++; }
            // le parent qui restait s'est-il remarié ?
            $other = (int) $first[3];
            if ($other && lo_ok($pdo, $other)) {
                $remar[1]++;
                foreach (lo_spouses($pdo, $other) as [$s, $fid, $dm]) { if ($s !== $first[2] && $dm && [$dm[0], $dm[1]] >= [$first[1][0], $first[1][1]]) { $remar[0]++; break; } }
            }
        }
    }
    ksort($eras);
    return ['eras' => array_values($eras), 'posthumous' => array_slice($post, 0, 100), 'nposthumous' => count($post), 'remarried' => $remar[0], 'remar_of' => $remar[1], 'war' => $war, 'total' => $total];
}

/** 🌾 la famille d'un métier : terre, artisans et commerce, ouvriers et transports, autres ('' = inconnu) */
function lo_job_group(string $job): string
{
    if (trim($job) === '') { return ''; }
    static $memo = [];
    if (isset($memo[$job])) { return $memo[$job]; }
    require_once __DIR__ . '/metiers_anciens.php';
    $f = function_exists('trade_fold') ? trade_fold($job) : mb_strtolower($job);
    if (preg_match('/\b(ouvri|usine|manoeuvr|cheminot|chemin de fer|mineur|employe des chemins|mecanicien|chauffeur|conducteur|facteur)/u', $f)) { return $memo[$job] = 'ouvriers'; }
    if (preg_match('/\b(cultivat|laboureu|agricult|journali|fermier|metayer|vigneron|berger|paysan|meunier|bouvier|domestique de ferme|proprietaire cultivateur)/u', $f)) { return $memo[$job] = 'terre'; }
    $key = trade_match($job); $dom = $key ? (trades_dict()['by'][$key]['domain'] ?? '') : '';
    return $memo[$job] = match ($dom) { 'T', 'F' => 'terre', 'M', 'X', 'C', 'B', 'A', 'V', 'L' => 'artisans', 'P', 'R', 'E' => 'ouvriers', '' => 'autres', default => 'autres' };
}

/** une lignée : 'm' de père en fils (Sosa 1, 2, 4…), 'f' de mère en fille (1, 3, 7…), 'mm' la lignée du nom de la mère (3, 6, 12…) */
function lo_line(PDO $pdo, int $root, string $kind, int $max = 20): array
{
    $L = dgn_links($pdo); $out = []; $x = $root; $g = 1;
    if ($kind === 'mm') { $x = (int) ($L['parents'][$root][1] ?? 0); $g = 2; $kind = 'm'; }
    while ($x && $g <= $max) { $out[] = [$x, $g]; $x = (int) ($L['parents'][$x][$kind === 'f' ? 1 : 0] ?? 0); $g++; }
    return $out;
}

const LO_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

function lo_land(PDO $pdo, int $root, string $by): array
{
    $root = dgn_root($pdo, $root); if (!$root) { return ['lines' => [], 'gens' => []]; }
    $lives = dmo_lives($pdo); $jobs = dfa_occupations($pdo);
    $grp = static fn(int $id) => lo_ok($pdo, $id) ? lo_job_group($jobs[$id] ?? '') : '';
    // les barres : les ancêtres de chaque génération par famille de métiers
    $gens = [];
    foreach (dgn_sosa($pdo, $root, 10, 4000) as $s => $id) {
        $id = (int) $id; if (!lo_ok($pdo, $id)) { continue; }
        $g = strlen(decbin((int) $s));
        if ($by === 'pat' && $s > 1 && ($s >> ($g - 2)) !== 2) { continue; }
        if ($by === 'mat' && $s > 1 && ($s >> ($g - 2)) !== 3) { continue; }
        $k = $grp($id); if ($k === '') { continue; }
        $gens[$g] ??= ['g' => $g, 'roman' => LO_ROMAN[$g] ?? (string) $g, 'terre' => 0, 'artisans' => 0, 'ouvriers' => 0, 'autres' => 0, 'ys' => []];
        $gens[$g][$k]++; if ($lives[$id]['b'] ?? null) { $gens[$g]['ys'][] = $lives[$id]['b'][0]; }
    }
    krsort($gens);
    $gens = array_values(array_map(static function ($x) { $x['year'] = $x['ys'] ? (int) lo_median($x['ys']) : null; unset($x['ys']); return $x; }, $gens));
    // les phrases : la lignée du nom, et celle du nom de la mère
    $lines = [];
    foreach (['m', 'mm'] as $kind) {
        $line = array_reverse(lo_line($pdo, $root, $kind, 14)); // du plus ancien au plus jeune
        if (count($line) < 2) { continue; }
        $last = ''; $left = null; $lastLand = null; $known = 0;
        foreach ($line as [$id, $g]) {
            $k = $grp($id); if ($k === '') { continue; } $known++;
            if ($k === 'terre') { $lastLand = ['g' => $g, 'year' => $lives[$id]['b'][0] ?? null]; $left = null; }
            elseif ($last === 'terre' && $left === null) { $left = ['id' => $id, 'name' => $lives[$id]['name'], 'job' => mb_substr($jobs[$id] ?? '', 0, 40), 'g' => $g, 'roman' => LO_ROMAN[$g] ?? (string) $g, 'year' => isset($lives[$id]['b'][0]) ? $lives[$id]['b'][0] + 25 : null]; }
            $last = $k;
        }
        $surname = ''; foreach ($line as [$id]) { if (lo_ok($pdo, $id) && ($lives[$id]['last'] ?? '') !== '') { $surname = $lives[$id]['last']; } }
        if ($known < 2) { continue; }
        $lines[] = ['kind' => $kind, 'surname' => mb_substr($surname, 0, 60), 'left' => $left, 'still' => $last === 'terre', 'lastLand' => $lastLand, 'known' => $known];
    }
    return ['lines' => $lines, 'gens' => $gens];
}

/** ✍️ la chaîne des signatures, une par génération : l'acte de mariage (a signé ou non) et la signature encadrée sur un document */
function lo_signatures(PDO $pdo, int $root, string $kind): array
{
    $root = dgn_root($pdo, $root); if (!$root) { return ['chain' => []]; }
    $lives = dmo_lives($pdo);
    $cols = array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(), 'name');
    $hasSign = in_array('signed1', $cols, true);
    $hasTags = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media_tags') WHERE name='tag_type'")->fetchColumn();
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo) : '';
    $chain = [];
    foreach (array_reverse(lo_line($pdo, $root, $kind === 'f' ? 'f' : 'm', 16)) as [$id, $g]) {
        if (!lo_ok($pdo, $id)) { continue; } // une fiche vivante ou confidentielle n'est jamais montrée
        $row = ['id' => $id, 'name' => $lives[$id]['name'], 'g' => $g, 'year' => null, 'signed' => null, 'sig' => null];
        if ($hasSign) {
            $s = $pdo->prepare("SELECT e.year, e.sort_date, e.signed1, e.signed2, f.partner1_id FROM events e JOIN families f ON f.id=e.family_id JOIN event_types t ON t.id=e.event_type_id
                WHERE t.gedcom_tag IN ('MARR','MRCI','MRRE') AND (f.partner1_id=? OR f.partner2_id=?) ORDER BY COALESCE(NULLIF(e.sort_date,''), printf('%04d', COALESCE(e.year, 9999))) LIMIT 1");
            $s->execute([$id, $id]);
            if ($e = $s->fetch()) {
                $d = dchf_date($e['sort_date'], $e['year']); $row['year'] = $d[0] ?? null;
                $v = (int) $e['partner1_id'] === $id ? $e['signed1'] : $e['signed2'];
                $row['signed'] = $v === null ? null : (int) $v;
            }
        }
        if ($hasTags) {
            $s = $pdo->prepare("SELECT t.media_id, t.x, t.y, t.w, t.h, m.filename, m.date_text, m.title FROM media_tags t JOIN media m ON m.id=t.media_id WHERE t.tag_type='signature' AND t.person_id=? AND m.media_type='image'$sealed ORDER BY t.id LIMIT 1");
            $s->execute([$id]);
            if ($t = $s->fetch()) {
                $row['sig'] = ['media_id' => (int) $t['media_id'], 'filename' => (string) $t['filename'], 'x' => (float) $t['x'], 'y' => (float) $t['y'], 'w' => (float) $t['w'], 'h' => (float) $t['h']];
                if ($row['year'] === null && preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) $t['date_text'] . ' ' . $t['title'], $m)) { $row['year'] = (int) $m[1]; }
                if ($row['signed'] === null) { $row['signed'] = 1; }
            }
        }
        $chain[] = $row;
    }
    return ['chain' => $chain];
}

/* ═════════ 👤 la fiche : une phrase dans les blocs qui existent ═════════ */
/** le canton d'aujourd'hui d'une commune (assets/data/communes-decoupage.json.gz, INSEE COG 2025, Licence Ouverte) */
function lo_canton(string $insee): ?array
{
    static $D = null;
    if ($insee === '') { return null; }
    if ($D === null) {
        $f = APP_ROOT . '/assets/data/communes-decoupage.json.gz';
        $D = is_file($f) ? (json_decode((string) gzdecode((string) file_get_contents($f)), true) ?: []) : [];
    }
    $code = $D['succ'][$insee] ?? $insee; $c = $D['c'][$code] ?? null;
    if (!$c || ($c[1] ?? '') === '') { return null; }
    return ['canton' => (string) ($D['can'][$c[1]] ?? ''), 'dep' => str_starts_with($code, '97') ? substr($code, 0, 3) : substr($code, 0, 2), 'source' => (string) ($D['attr'] ?? 'INSEE'), 'url' => (string) ($D['url'] ?? '')];
}

function lo_person(PDO $pdo, int $id): array
{
    $lives = dmo_lives($pdo); $p = $lives[$id] ?? null;
    if (!$p || !lo_ok($pdo, $id)) { return ['ok' => false]; } // rien pour une fiche vivante ou confidentielle
    $L = dgn_links($pdo); $out = ['ok' => true, 'id' => $id, 'sex' => dfa_sex($p['g']), 'birth' => lo_iso($p['b']), 'death' => lo_iso($p['d']), 'by' => $p['b'][0] ?? null];
    // 👪 orphelin, posthume
    $fa = (int) ($L['parents'][$id][0] ?? 0); $mo = (int) ($L['parents'][$id][1] ?? 0);
    $par = [];
    foreach ([['father', $fa], ['mother', $mo]] as [$k, $x]) {
        $d = $x && lo_ok($pdo, $x) ? ($lives[$x]['d'] ?? null) : null; if (!$d || !$p['b']) { continue; }
        $months = dvi_months($d, $p['b']); $age = dvi_years($p['b'], $d);
        if ($k === 'father' && $months !== null && $months >= 0 && $months <= 10) { $par[] = ['who' => $k, 'posthumous' => true, 'months' => $months, 'year' => $d[0]]; continue; }
        if ($age >= 0 && $age < 21) { $par[] = ['who' => $k, 'age' => (int) floor($age), 'year' => $d[0]]; }
    }
    usort($par, static fn($a, $b) => ($a['age'] ?? -1) <=> ($b['age'] ?? -1));
    $out['parents'] = $par;
    if ($par) {
        require_once __DIR__ . '/commune_culture.php'; // cc_find_insee, cc_dep_of_insee
        $s = $pdo->prepare("SELECT pl.name, COALESCE(pl.county,'') AS county, COALESCE(pl.country,'') AS country, pl.latitude AS lat, pl.longitude AS lon FROM places pl WHERE pl.id=?");
        $s->execute([(int) ($p['bp'] ?? 0)]);
        if (($pl = $s->fetch()) && function_exists('cc_find_insee')) {
            $insee = cc_find_insee((string) $pl['name'], (string) $pl['county'], $pl['lat'] !== null ? (float) $pl['lat'] : null, $pl['lon'] !== null ? (float) $pl['lon'] : null, (string) $pl['country']);
            $c = lo_canton($insee); if ($c) { $out['canton'] = $c + ['place' => mb_substr(trim(explode(',', (string) $pl['name'])[0]), 0, 60)]; }
        }
    }
    // ⚖️ dispense : ses mariages
    $mar = [];
    foreach (lo_spouses($pdo, $id) as [$s, $fid, $d]) {
        if (!lo_ok($pdo, $s)) { continue; }
        $k = lo_kin($pdo, $id, $s, 8); $aff = $k ? null : lo_affinity($pdo, $id, $s, $d, 6);
        if (!$k && !$aff) { continue; }
        $mar[] = ['spouse' => lo_person_mini($pdo, $s), 'year' => $d[0] ?? null, 'canon' => $k ? $k['canon'] : $aff['canon'], 'civil' => $k ? $k['civil'] : $aff['civil'], 'aff' => !$k, 'direct' => (bool) ($k['direct'] ?? false)];
    }
    $out['marriages'] = $mar;
    $out['dates'] = array_values(array_filter([['kind' => 'birth', 'd' => $p['b'] && $p['b'][3] ? lo_iso($p['b']) : ''], ['kind' => 'death', 'd' => $p['d'] && $p['d'][3] ? lo_iso($p['d']) : '']], static fn($x) => $x['d'] !== ''));
    foreach (lo_spouses($pdo, $id) as [$s, $fid, $d]) { if ($d && $d[3]) { $out['dates'][] = ['kind' => 'marriage', 'd' => lo_iso($d)]; } }
    // 🌍 quitter la terre : le premier de sa lignée du nom à faire un autre métier
    $jobs = dfa_occupations($pdo); $mine = lo_job_group($jobs[$id] ?? ''); $theirs = $fa && lo_ok($pdo, $fa) ? lo_job_group($jobs[$fa] ?? '') : '';
    if ($mine !== '' && $mine !== 'terre' && $theirs === 'terre') { $out['land'] = ['job' => mb_substr($jobs[$id], 0, 40), 'father_job' => mb_substr($jobs[$fa], 0, 40), 'father' => $lives[$fa]['name']]; }
    return $out;
}

/* ═════════ 🕰 🎂 📰 une vie (lot O1 suite et O4) : les dates d'une fiche, sans rien sur les vivants ═════════ */
function lo_place(PDO $pdo, int $pid): ?array
{
    if (!$pid) { return null; }
    $s = $pdo->prepare("SELECT id, name, COALESCE(county,'') AS county, COALESCE(country,'') AS country, latitude AS lat, longitude AS lon FROM places WHERE id=?"); $s->execute([$pid]);
    $r = $s->fetch(); if (!$r) { return null; }
    return ['id' => (int) $r['id'], 'name' => mb_substr(trim(explode(',', (string) $r['name'])[0]), 0, 80), 'county' => mb_substr((string) $r['county'], 0, 60), 'country' => mb_substr((string) $r['country'], 0, 40),
        'lat' => $r['lat'] !== null ? (float) $r['lat'] : null, 'lon' => $r['lon'] !== null ? (float) $r['lon'] : null];
}

/** lot_o_life&id= : naissance, décès, mariages, enfants (pas les vivants), départs, et l'âge des parents et grands-parents à sa naissance */
function lo_life(PDO $pdo, int $id): array
{
    $lives = dmo_lives($pdo); $p = $lives[$id] ?? null;
    if (!$p || !lo_ok($pdo, $id)) { return ['ok' => false]; } // rien pour une fiche vivante ou confidentielle
    $L = dgn_links($pdo);
    $out = ['ok' => true, 'id' => $id, 'name' => $p['name'], 'first' => trim(explode(' ', $p['name'])[0] ?? ''), 'sex' => dfa_sex($p['g']), 'birth' => lo_iso($p['b']), 'death' => lo_iso($p['d']),
        'bplace' => lo_place($pdo, (int) ($p['bp'] ?? 0)), 'dplace' => lo_place($pdo, (int) ($p['dp'] ?? 0)), 'events' => [], 'family' => []];
    $ev = [];
    foreach (lo_spouses($pdo, $id) as [$s, $fid, $d]) {
        if (!$d) { continue; }
        $ev[] = ['kind' => 'marriage', 'd' => lo_iso($d), 'who' => lo_ok($pdo, $s) ? ($lives[$s]['name'] ?? '') : ''];
    }
    $kids = [];
    foreach ($L['children'][$id] ?? [] as $c) { $c = (int) $c; if (lo_ok($pdo, $c) && ($lives[$c]['b'] ?? null)) { $kids[] = [$lives[$c]['b'], $c]; } }
    usort($kids, static fn($a, $b) => [$a[0][0], $a[0][1], $a[0][2]] <=> [$b[0][0], $b[0][1], $b[0][2]]);
    foreach ($kids as $i => [$d, $c]) { $ev[] = ['kind' => 'child', 'd' => lo_iso($d), 'n' => $i + 1, 'who' => $lives[$c]['name'] ?? '']; }
    // un départ : le premier événement daté dans une autre commune que celle de sa naissance (domicile, recensement, métier, mariage)
    $home = $out['bplace']['name'] ?? '';
    if ($home !== '') {
        $q = $pdo->prepare("SELECT e.sort_date, e.year, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND e.place_id IS NOT NULL AND t.gedcom_tag IN ('RESI','CENS','OCCU','EMIG','IMMI') ORDER BY COALESCE(NULLIF(e.sort_date,''), printf('%04d', COALESCE(e.year, 9999))) LIMIT 20");
        $q->execute([$id]);
        foreach ($q as $r) {
            $pl = lo_place($pdo, (int) $r['place_id']); $d = dchf_date($r['sort_date'], $r['year']);
            if ($pl && $d && mb_strtolower($pl['name']) !== mb_strtolower($home)) { $ev[] = ['kind' => 'move', 'd' => lo_iso($d), 'place' => $pl['name']]; break; }
        }
    }
    usort($ev, static fn($a, $b) => strcmp($a['d'], $b['d']));
    $out['events'] = array_slice($ev, 0, 40);
    // 🎂 dans la famille, à sa naissance : père, mère, grands-pères, grands-mères (seulement les fiches qu'on peut nommer)
    if ($p['b']) {
        foreach ([[0, 'father'], [1, 'mother']] as [$k, $role]) {
            $x = (int) ($L['parents'][$id][$k] ?? 0); if (!$x || !lo_ok($pdo, $x)) { continue; }
            $xb = $lives[$x]['b'] ?? null; if ($xb) { $out['family'][] = ['role' => $role, 'name' => $lives[$x]['name'], 'age' => (int) floor(dvi_years($xb, $p['b'])), 'alive' => !($lives[$x]['d'] ?? null) || [$lives[$x]['d'][0], $lives[$x]['d'][1]] >= [$p['b'][0], $p['b'][1]]]; }
            foreach ([[0, 'gf'], [1, 'gm']] as [$kk, $r2]) {
                $g = (int) ($L['parents'][$x][$kk] ?? 0); if (!$g || !lo_ok($pdo, $g)) { continue; }
                $gb = $lives[$g]['b'] ?? null; $gd = $lives[$g]['d'] ?? null;
                if ($gb && (!$gd || [$gd[0], $gd[1]] >= [$p['b'][0], $p['b'][1]])) { $out['family'][] = ['role' => $r2 . ($k ? '_m' : '_p'), 'name' => $lives[$g]['name'], 'age' => (int) floor(dvi_years($gb, $p['b'])), 'alive' => true]; }
            }
        }
    }
    return $out;
}

function lot_o_arbre(PDO $pdo, array $q): array
{
    $q = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $q);
    dgo_request($q); // le groupe de personnes et la période, comme les diagrammes (refusés s'ils sont de mauvaise forme)
    $card = lo_enum($q, 'card', LO_CARDS, '');
    if ($card === '') { throw new LcndaBadInput('Carte inconnue.'); }
    $root = lo_int($q, 'root', 0, 0, PHP_INT_MAX);
    return ['card' => $card] + match ($card) {
        'tempsclos' => lo_tempsclos($pdo),
        'dispense' => lo_dispense_all($pdo),
        'prenup' => lo_prenup($pdo, lo_int($q, 'limit', 8, 5, 9), ($q['names'] ?? '') === '1'),
        'gravity' => lo_gravity($pdo, $root),
        'radius' => lo_radius($pdo),
        'widow' => lo_widow($pdo),
        'godname' => lo_godname($pdo),
        'orphans' => lo_orphans($pdo, lo_int($q, 'age', 10, 1, 21)),
        'land' => lo_land($pdo, $root, lo_enum($q, 'by', ['name', 'pat', 'mat', 'all'], 'name')),
        'signatures' => lo_signatures($pdo, $root, lo_enum($q, 'line', ['m', 'f'], 'm')),
    };
}

function lot_o_dispatch(PDO $pdo, string $action, bool $isWrite, array $data): never
{
    try {
        if ($isWrite) { throw new RuntimeException('Action inconnue'); }
        json_response(match ($action) {
            'lot_o_arbre' => lot_o_arbre($pdo, $_GET),
            'lot_o_dispense' => lo_dispense_pair($pdo, safe_int($_GET['a'] ?? 0), safe_int($_GET['b'] ?? 0)),
            'lot_o_person' => lo_person($pdo, safe_int($_GET['id'] ?? 0)),
            'lot_o_life' => lo_life($pdo, safe_int($_GET['id'] ?? 0)),
            default => throw new RuntimeException('Action inconnue'),
        });
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], $e->getMessage() === 'Action inconnue' ? 400 : 500);
    }
}
