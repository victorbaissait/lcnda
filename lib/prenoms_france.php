<?php
declare(strict_types=1);

/**
 * LCNDA — 👶 Transmission des prénoms et 📊 Ta famille et l'histoire de France (Graphiques → Statistiques,
 * assets/js/heritage-prenoms-france.js). Tout est calculé à la lecture : rien n'est écrit dans la base sans une action.
 *
 * GET api.php?action=prenoms_transmis[&person=id]
 *   Pour chaque enfant, d'où vient probablement son prénom : parrain, marraine (témoins « parrain » / « marraine » de la
 *   naissance ou du baptême), frère ou sœur mort avant sa naissance (« prénom relevé »), grand-père ou grand-mère
 *   (paternels, maternels), père ou mère, oncle ou tante, saint du jour (lib/saints.php). Chaque piste a sa règle
 *   (« même prénom que son parrain ») et un indice de confiance ; « ce n'est pas ça » et « choisir la personne »
 *   (table name_origin_choices, migration 82) passent devant le calcul.
 *   &person=id : la fiche (petite ligne « Prénom reçu de… ») ; sinon toute la base : lignes, chiffres par époque, prénoms,
 *   avec le groupe de personnes et la période communs des diagrammes (dg_pop, dg_root, dg_from, dg_to : diagram_options.php)
 *   et &name= (un prénom).
 * POST name_origin_set {child, source, verdict: yes|no|clear} : corriger à la main (source 0 = le saint du jour).
 *
 * GET api.php?action=famille_france : les moyennes de la famille à côté des moyennes françaises du fichier livré
 *   assets/data/moyennes-france.json (sourcé : INED, INSEE, Henry, Fleury-Henry, Maggiolo…), avec les personnes comptées.
 *
 * Jamais une personne en vie, probablement en vie (moins de 100 ans, sans décès) ou confidentielle : ni comptée, ni nommée.
 */

require_once __DIR__ . '/diagram_vie.php'; // dmo_lives, dchf_*, dgn_links, dgo_*, dvi_*

const PF_MAX_ROWS = 2000; // lignes envoyées à la page (les prénoms les plus transmis d'abord) ; les chiffres comptent tout
const PF_MAX_IDS = 400;
const PF_KINDS = ['godparent' => 'parrain ou marraine', 'sibling' => 'frère ou sœur mort avant', 'grandparent' => 'grand-parent', 'parent' => 'père ou mère', 'uncle' => 'oncle ou tante', 'saint' => 'saint du jour', 'manual' => 'choisi à la main'];

function pf_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS name_origin_choices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        child_id INTEGER NOT NULL,
        source_id INTEGER NOT NULL DEFAULT 0,
        verdict TEXT NOT NULL CHECK(verdict IN ('yes','no')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(child_id, source_id)
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_name_origin_child ON name_origin_choices(child_id)');
}

/** « Jean-Baptiste » → « jean-baptiste » (sans accents, minuscules) */
function pf_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'ç' => 'c', 'œ' => 'oe', 'æ' => 'ae', 'ñ' => 'n', '’' => "'"]);
    return trim(preg_replace('/[^a-z\'-]+/', ' ', $s) ?? '');
}

/** les prénoms d'une fiche, dans l'ordre (le premier = le prénom usuel) */
function pf_names(string $first, string $middle = ''): array
{
    $out = [];
    foreach (preg_split('/[\s,]+/', pf_fold($first . ' ' . $middle)) ?: [] as $t) {
        $t = trim($t, "-'");
        if (strlen($t) >= 2 && !in_array($t, $out, true)) { $out[] = $t; }
        if (count($out) >= 8) { break; }
    }
    return $out;
}

/** deux prénoms sont-ils le même au masculin et au féminin ? (Jean / Jeanne, Louis / Louise, Julien / Julienne, Pierre / Pierrette…) */
function pf_variant(string $a, string $b): bool
{
    if ($a === $b || $a === '' || $b === '') { return false; }
    foreach ([[$a, $b], [$b, $a]] as [$m, $f]) {
        if ($f === $m . 'e' || $f === $m . 'ne' || $f === $m . 'le' || $f === $m . 'ette' || $f === $m . 'ine' || $f === $m . 'tte') { return true; }
        if (str_ends_with($m, 'e') && ($f === substr($m, 0, -1) . 'ette' || $f === substr($m, 0, -1) . 'ine')) { return true; }
    }
    return false;
}

/**
 * le prénom de l'enfant ressemble-t-il à celui de la piste ? → [retenue sur la confiance, phrase] ou null
 *  - même prénom usuel : rien de retenu ; même prénom au masculin / féminin : −10 ;
 *  - le prénom usuel de la piste est un des autres prénoms de l'enfant : −20 ; l'inverse : −25.
 */
function pf_match(array $child, array $cand): ?array
{
    if (!$child || !$cand) { return null; }
    if ($child[0] === $cand[0]) { return [0, 'même prénom']; }
    if (pf_variant($child[0], $cand[0])) { return [10, 'même prénom (au ' . (strlen($child[0]) > strlen($cand[0]) ? 'féminin' : 'masculin') . ')']; }
    if (in_array($cand[0], array_slice($child, 1), true)) { return [20, 'son prénom en deuxième prénom']; }
    if (in_array($child[0], array_slice($cand, 1), true)) { return [25, 'un de ses autres prénoms']; }
    return null;
}

/** les personnes : prénoms, nom, sexe, naissance, décès, cachée (en vie, probablement en vie ou confidentielle) */
function pf_people(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $lives = dmo_lives($pdo); $now = (int) date('Y');
    $hasPriv = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
    $out = [];
    foreach ($pdo->query("SELECT id, first_name, COALESCE(middle_name,'') AS middle_name, last_name, gender, living_status" . ($hasPriv ? ', COALESCE(is_private,0) AS priv' : ', 0 AS priv') . " FROM persons WHERE COALESCE(kind,'')<>'animal'") as $r) {
        $id = (int) $r['id']; $l = $lives[$id] ?? null; if (!$l) { continue; }
        $hidden = (int) $r['priv'] === 1 || $r['living_status'] === 'living'
            || ($r['living_status'] !== 'deceased' && !$l['d'] && $l['b'] && $l['b'][0] > $now - 100);
        $out[$id] = ['id' => $id, 'first' => trim((string) $r['first_name']), 'names' => pf_names((string) $r['first_name'], (string) $r['middle_name']),
            'name' => $l['name'], 'g' => (string) $r['gender'], 'b' => $l['b'], 'd' => $l['d'], 'hidden' => $hidden, 'dead' => $r['living_status'] === 'deceased' || $l['d'] !== null];
    }
    return $cache = $out;
}

/** parrains et marraines : enfant → [[personne, 'parrain'|'marraine']] (témoins des naissances et baptêmes) */
function pf_godparents(PDO $pdo): array
{
    $out = [];
    $sql = "SELECT ew.person_id AS gp, e.person_id AS gc, LOWER(TRIM(COALESCE(ew.note,''))) AS note FROM event_witnesses ew JOIN events e ON e.id=ew.event_id JOIN event_types t ON t.id=e.event_type_id
            WHERE e.scope='person' AND e.person_id IS NOT NULL AND ew.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND (ew.note LIKE '%parrain%' OR ew.note LIKE '%marraine%') LIMIT 60000";
    foreach ($pdo->query($sql) as $r) {
        $gc = (int) $r['gc']; $gp = (int) $r['gp']; if ($gc === $gp) { continue; }
        $role = str_contains((string) $r['note'], 'marraine') ? 'marraine' : 'parrain';
        foreach ($out[$gc] ?? [] as $x) { if ($x[0] === $gp) { continue 2; } }
        $out[$gc][] = [$gp, $role];
    }
    return $out;
}

/** les corrections à la main : enfant → ['yes' => source|null, 'no' => [source => true]] */
function pf_choices(PDO $pdo): array
{
    pf_schema($pdo);
    $out = [];
    foreach ($pdo->query('SELECT child_id, source_id, verdict FROM name_origin_choices ORDER BY id') as $r) {
        $c = (int) $r['child_id']; $out[$c] ??= ['yes' => null, 'no' => []];
        if ($r['verdict'] === 'yes') { $out[$c]['yes'] = (int) $r['source_id']; } else { $out[$c]['no'][(int) $r['source_id']] = true; }
    }
    return $out;
}

/** une date avant une autre ? (au jour près si possible) */
function pf_before(?array $a, ?array $b): bool
{
    if (!$a || !$b) { return false; }
    if ($a[0] !== $b[0]) { return $a[0] < $b[0]; }
    if (!$a[1] || !$b[1]) { return false; } // même année, mois inconnu : on ne sait pas
    if ($a[1] !== $b[1]) { return $a[1] < $b[1]; }
    return $a[2] && $b[2] && $a[2] < $b[2];
}

function pf_level(int $score): string
{
    return $score >= 75 ? 'forte' : ($score >= 55 ? 'moyenne' : 'faible');
}

/** le lien d'une personne avec l'enfant (« son grand-père paternel », « sa tante »…), '' si aucun lien proche */
function pf_relation(array $L, int $c, int $x, array $P): string
{
    $f = ($P[$x]['g'] ?? ($L['gender'][$x] ?? '')) === 'female';
    $par = static fn(int $p): array => $L['parents'][$p] ?? [];
    $pc = $par($c);
    if (in_array($x, $pc, true)) { return $f ? 'sa mère' : 'son père'; }
    foreach ([0 => 'paternel', 1 => 'maternel'] as $side => $word) {
        $p = $pc[$side] ?? 0; if (!$p) { continue; }
        if (in_array($x, $par($p), true)) { return $f ? 'sa grand-mère ' . $word . 'le' : 'son grand-père ' . $word; }
        foreach ($par($p) as $gp) { if ($gp && $gp !== $p) { foreach ($L['children'][$gp] ?? [] as $u) { if ($u === $x && $u !== $p) { return ($f ? 'sa tante' : 'son oncle') . ', côté ' . ($side ? 'mère' : 'père'); } } } }
    }
    foreach ($pc as $p) { if (in_array($x, $L['children'][$p] ?? [], true) && $x !== $c) { return $f ? 'sa sœur' : 'son frère'; } }
    return '';
}

/**
 * les pistes d'un enfant, de la plus sûre à la moins sûre : chaque piste = {id, kind, rel, rule, score, level, role?, saint?}
 * (une personne trouvée par deux chemins — parrain et grand-père — n'est qu'une piste, un peu plus sûre)
 */
function pf_candidates(PDO $pdo, int $c, array $P, array $L, array $G): array
{
    $me = $P[$c] ?? null; if (!$me || !$me['names']) { return []; }
    $out = [];
    $add = static function (int $x, string $kind, string $rel, string $why, int $base) use (&$out, $P, $me): void {
        $p = $P[$x] ?? null; if (!$p || $p['hidden'] || $x === $me['id']) { return; }
        $m = pf_match($me['names'], $p['names']); if (!$m) { return; }
        $score = max(10, min(99, $base - $m[0]));
        $rule = $m[1] === 'même prénom' ? "même prénom que $why" : ($m[1] . ' : ' . $why);
        if (isset($out[$x])) { // déjà une piste : les deux chemins se renforcent
            $o = &$out[$x]; $o['score'] = min(99, max($o['score'], $score) + 5); $o['rule'] .= ', ' . $rel; $o['also'][] = $kind; unset($o);
            return;
        }
        $out[$x] = ['id' => $x, 'name' => $p['name'], 'year' => $p['b'] ? $p['b'][0] : null, 'g' => $p['g'], 'kind' => $kind, 'rel' => $rel, 'rule' => $rule, 'score' => $score, 'also' => []];
    };
    $pc = $L['parents'][$c] ?? [];
    // parrain, marraine
    foreach ($G[$c] ?? [] as [$gp, $role]) {
        $rel = pf_relation($L, $c, $gp, $P);
        $add($gp, 'godparent', ($role === 'marraine' ? 'sa marraine' : 'son parrain') . ($rel ? " ($rel)" : ''), $role === 'marraine' ? 'sa marraine' : 'son parrain', 88);
    }
    // frère ou sœur mort avant sa naissance : « prénom relevé »
    $sibs = [];
    foreach ($pc as $p) { foreach ($L['children'][$p] ?? [] as $s) { if ($s !== $c) { $sibs[$s] = true; } } }
    foreach (array_keys($sibs) as $s) {
        $sp = $P[$s] ?? null; if (!$sp || !$sp['d'] || !pf_before($sp['d'], $me['b'])) { continue; }
        $w = ($sp['g'] === 'female' ? 'sa sœur' : 'son frère');
        $add($s, 'sibling', "$w, mort" . ($sp['g'] === 'female' ? 'e' : '') . ' en ' . $sp['d'][0] . ' avant sa naissance (prénom relevé)', $w . ' mort' . ($sp['g'] === 'female' ? 'e' : '') . ' avant sa naissance', 86);
    }
    // grands-parents
    foreach ([0 => 'paternel', 1 => 'maternel'] as $side => $word) {
        $p = $pc[$side] ?? 0; if (!$p) { continue; }
        foreach ($L['parents'][$p] ?? [] as $k => $gp) {
            if (!$gp) { continue; }
            $f = ($P[$gp]['g'] ?? '') === 'female' || ($k === 1 && ($P[$gp]['g'] ?? '') !== 'male');
            $rel = $f ? "sa grand-mère {$word}le" : "son grand-père $word";
            $add($gp, 'grandparent', $rel, $rel, 66);
        }
    }
    // père, mère
    foreach ($pc as $k => $p) { if ($p) { $rel = ($P[$p]['g'] ?? '') === 'female' || ($k === 1 && ($P[$p]['g'] ?? '') !== 'male') ? 'sa mère' : 'son père'; $add($p, 'parent', $rel, $rel, 60); } }
    // oncles et tantes (frères et sœurs du père, de la mère)
    foreach ([0 => 'père', 1 => 'mère'] as $side => $word) {
        $p = $pc[$side] ?? 0; if (!$p) { continue; }
        $seen = [];
        foreach ($L['parents'][$p] ?? [] as $gp) { foreach ($L['children'][$gp] ?? [] as $u) {
            if ($u === $p || isset($seen[$u])) { continue; } $seen[$u] = true;
            $rel = (($P[$u]['g'] ?? '') === 'female' ? 'sa tante' : 'son oncle') . ", côté $word";
            $add($u, 'uncle', $rel, $rel, 52);
        } }
    }
    $list = array_values($out);
    // saint du jour de la naissance (calendrier des almanachs, lib/saints.php)
    if ($me['b'] && $me['b'][1] > 0 && $me['b'][2] > 0 && function_exists('saint_matching')) {
        $first = (string) (preg_split('/[\s,]+/u', $me['first'])[0] ?? '');
        if ($first !== '' && ($saint = saint_matching($first, (int) $me['b'][1], (int) $me['b'][2]))) {
            $list[] = ['id' => 0, 'name' => $saint, 'year' => null, 'g' => '', 'kind' => 'saint', 'rel' => 'le saint du jour de sa naissance', 'rule' => 'né' . ($me['g'] === 'female' ? 'e' : '') . ' le jour de la fête de ' . $saint, 'score' => 38, 'also' => [], 'saint' => $saint];
        }
    }
    usort($list, static fn($a, $b) => $b['score'] <=> $a['score'] ?: (['godparent' => 0, 'sibling' => 1, 'grandparent' => 2, 'parent' => 3, 'uncle' => 4, 'saint' => 5][$a['kind']] <=> ['godparent' => 0, 'sibling' => 1, 'grandparent' => 2, 'parent' => 3, 'uncle' => 4, 'saint' => 5][$b['kind']]));
    foreach ($list as &$x) { $x['level'] = pf_level($x['score']); } unset($x);
    return $list;
}

/** l'origine retenue d'un enfant (corrections à la main comprises) : [origine|null, autres pistes, pistes écartées] */
function pf_resolve(PDO $pdo, int $c, array $P, array $L, array $G, array $CH): array
{
    $cands = pf_candidates($pdo, $c, $P, $L, $G);
    $ch = $CH[$c] ?? ['yes' => null, 'no' => []];
    $rejected = []; $keep = [];
    foreach ($cands as $x) { if (isset($ch['no'][$x['id']])) { $rejected[] = $x; } else { $keep[] = $x; } }
    if ($ch['yes'] !== null) {
        foreach ($keep as $i => $x) {
            if ($x['id'] === $ch['yes']) { $x['score'] = 100; $x['level'] = 'forte'; $x['manual'] = 'confirmed'; array_splice($keep, $i, 1); return [$x, $keep, $rejected]; }
        }
        $s = $P[$ch['yes']] ?? null;
        if ($s && !$s['hidden']) {
            $rel = pf_relation($L, $c, $s['id'], $P);
            return [['id' => $s['id'], 'name' => $s['name'], 'year' => $s['b'] ? $s['b'][0] : null, 'g' => $s['g'], 'kind' => 'manual', 'rel' => $rel ?: 'choisi à la main', 'rule' => 'choisi à la main', 'score' => 100, 'level' => 'forte', 'also' => [], 'manual' => 'chosen'], $keep, $rejected];
        }
    }
    $first = array_shift($keep);
    return [$first, $keep, $rejected];
}

/** une piste pour la page (sans les champs internes) */
function pf_out(?array $x): ?array
{
    if (!$x) { return null; }
    return ['id' => $x['id'], 'name' => $x['name'], 'year' => $x['year'], 'gender' => $x['g'], 'kind' => $x['kind'], 'rel' => $x['rel'], 'rule' => $x['rule'], 'score' => $x['score'], 'level' => $x['level'], 'manual' => $x['manual'] ?? '', 'also' => $x['also']];
}

/** GET prenoms_transmis */
function prenoms_transmis(PDO $pdo, array $get): array
{
    $get = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $get);
    $P = pf_people($pdo); $L = dgn_links($pdo); $G = pf_godparents($pdo); $CH = pf_choices($pdo);
    $kinds = PF_KINDS;
    // une fiche
    if (isset($get['person']) && $get['person'] !== '') {
        if (!preg_match('/^\d{1,10}$/', $get['person'])) { throw new LcndaBadInput('Numéro de fiche de mauvaise forme.'); }
        $c = (int) $get['person']; $me = $P[$c] ?? null;
        if (!$me || $me['hidden']) { return ['person' => $c, 'origin' => null, 'others' => [], 'rejected' => [], 'hidden' => (bool) ($me['hidden'] ?? false), 'kinds' => $kinds]; }
        [$o, $others, $rej] = pf_resolve($pdo, $c, $P, $L, $G, $CH);
        return ['person' => $c, 'first' => $me['names'][0] ?? '', 'origin' => pf_out($o), 'others' => array_map('pf_out', array_slice($others, 0, 8)), 'rejected' => array_map('pf_out', $rej), 'kinds' => $kinds,
            'godparents' => count($G[$c] ?? [])];
    }
    // toute la base (ou le groupe choisi)
    dgo_request($get);
    $keep = dgo_restrict($pdo, null);
    $name = pf_fold(mb_substr(trim($get['name'] ?? ''), 0, 40));
    $step = dvi_step($get['step'] ?? '50');
    $rows = []; $periods = []; $names = []; $total = 0; $byKind = array_fill_keys(array_keys($kinds), 0); $none = 0; $withGp = 0; $namedGp = 0;
    foreach ($P as $c => $me) {
        if ($me['hidden'] || !$me['names'] || !dvi_keep($keep, $c)) { continue; }
        $y = $me['b'] ? $me['b'][0] : null;
        if (!dgo_year_ok($y)) { continue; }
        if (!($L['parents'][$c] ?? null) && !isset($G[$c]) && !isset($CH[$c])) { continue; } // ni parents, ni parrain : rien à chercher
        [$o] = pf_resolve($pdo, $c, $P, $L, $G, $CH);
        if ($name !== '' && $me['names'][0] !== $name && !pf_variant($name, $me['names'][0])) { continue; } // un prénom (et sa forme au masculin / féminin)
        $total++;
        $hasGp = isset($G[$c]); if ($hasGp) { $withGp++; }
        $isGp = $o && ($o['kind'] === 'godparent' || in_array('godparent', $o['also'], true));
        if ($isGp) { $namedGp++; }
        if ($y !== null) {
            $k = dvi_bucket($y, $step);
            $periods[$k] ??= ['label' => $k, 'rank' => dvi_bucket_rank($y, $step), 'total' => 0, 'with_godparents' => 0, 'named_godparent' => 0, 'none' => 0] + array_fill_keys(array_keys($kinds), 0);
            $periods[$k]['total']++; if ($hasGp) { $periods[$k]['with_godparents']++; } if ($isGp) { $periods[$k]['named_godparent']++; }
            if ($o) { $periods[$k][$o['kind']]++; } else { $periods[$k]['none']++; }
        }
        if (!$o) { $none++; continue; }
        $byKind[$o['kind']]++;
        $fn = dchf_first_given($me['first']) ?: mb_convert_case($me['names'][0], MB_CASE_TITLE, 'UTF-8');
        $names[$fn] = ($names[$fn] ?? 0) + 1;
        if (count($rows) < 60000) {
            $rows[] = ['child' => $c, 'child_name' => $me['name'], 'first' => $fn, 'gender' => $me['g'], 'year' => $y, 'source' => $o['id'], 'source_name' => $o['name'], 'source_year' => $o['year'],
                'kind' => $o['kind'], 'rel' => $o['rel'], 'rule' => $o['rule'], 'score' => $o['score'], 'level' => $o['level'], 'manual' => $o['manual'] ?? ''];
        }
    }
    usort($periods, static fn($a, $b) => $a['rank'] <=> $b['rank']);
    arsort($names);
    $rank = array_flip(array_keys($names));
    usort($rows, static fn($a, $b) => ($rank[$a['first']] ?? 1e9) <=> ($rank[$b['first']] ?? 1e9) ?: ($a['year'] ?? 9999) <=> ($b['year'] ?? 9999));
    $truncated = count($rows) > PF_MAX_ROWS; $rows = array_slice($rows, 0, PF_MAX_ROWS);
    return ['total' => $total, 'found' => $total - $none, 'none' => $none, 'by_kind' => $byKind, 'with_godparents' => $withGp, 'named_godparent' => $namedGp,
        'periods' => array_map(static fn($p) => array_diff_key($p, ['rank' => 1]), array_values($periods)), 'names' => array_slice($names, 0, 300, true), 'rows' => $rows, 'kinds' => $kinds, 'truncated' => $truncated, 'max_rows' => PF_MAX_ROWS];
}

/** POST name_origin_set {child, source, verdict: yes|no|clear} → l'état d'avant, pour « ↶ Annuler » */
function name_origin_set(PDO $pdo, array $d): array
{
    pf_schema($pdo);
    $id = static function ($v, string $what): int {
        if (is_int($v)) { $v = (string) $v; }
        if (!is_string($v) || !preg_match('/^\d{1,10}$/', $v)) { throw new LcndaBadInput("Numéro de mauvaise forme ($what)."); }
        return (int) $v;
    };
    $child = $id($d['child'] ?? '', 'enfant'); $source = $id($d['source'] ?? '0', 'personne');
    $verdict = is_string($d['verdict'] ?? null) ? $d['verdict'] : '';
    if (!in_array($verdict, ['yes', 'no', 'clear', 'reset'], true)) { throw new LcndaBadInput('Choix inconnu.'); }
    $s = $pdo->prepare("SELECT id FROM persons WHERE id=? AND COALESCE(kind,'')<>'animal'"); $s->execute([$child]);
    if (!$s->fetchColumn()) { throw new LcndaBadInput('Cette fiche n’existe pas.'); }
    if ($source) { $s->execute([$source]); if (!$s->fetchColumn()) { throw new LcndaBadInput('La personne choisie n’existe pas.'); } }
    if ($source === $child) { throw new LcndaBadInput('Choisis une autre personne que l’enfant.'); }
    if ($verdict === 'yes' && !$source) { throw new LcndaBadInput('Choisis la personne dont il tient son prénom.'); }
    $before = $pdo->prepare('SELECT source_id, verdict FROM name_origin_choices WHERE child_id=? ORDER BY id'); $before->execute([$child]);
    $prev = array_map(static fn($r) => ['source' => (int) $r['source_id'], 'verdict' => $r['verdict']], $before->fetchAll());
    $own = !$pdo->inTransaction(); // l'API ouvre déjà une transaction pour chaque écriture
    if ($own) { $pdo->beginTransaction(); }
    try {
        if ($verdict === 'reset') { // ↶ Annuler : remettre l'état d'avant tel quel
            $pdo->prepare('DELETE FROM name_origin_choices WHERE child_id=?')->execute([$child]);
            $rows = is_array($d['rows'] ?? null) ? array_slice($d['rows'], 0, 50) : [];
            $ins = $pdo->prepare('INSERT OR IGNORE INTO name_origin_choices(child_id, source_id, verdict) VALUES(?,?,?)');
            foreach ($rows as $r) {
                if (!is_array($r) || !in_array($r['verdict'] ?? '', ['yes', 'no'], true)) { continue; }
                $ins->execute([$child, $id($r['source'] ?? '0', 'personne'), $r['verdict']]);
            }
        } elseif ($verdict === 'clear') {
            $pdo->prepare('DELETE FROM name_origin_choices WHERE child_id=? AND (source_id=? OR ?=0)')->execute([$child, $source, $source]);
        } else {
            if ($verdict === 'yes') { $pdo->prepare("DELETE FROM name_origin_choices WHERE child_id=? AND verdict='yes'")->execute([$child]); }
            $pdo->prepare('DELETE FROM name_origin_choices WHERE child_id=? AND source_id=?')->execute([$child, $source]);
            $pdo->prepare('INSERT INTO name_origin_choices(child_id, source_id, verdict) VALUES(?,?,?)')->execute([$child, $source, $verdict]);
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    return ['ok' => true, 'child' => $child, 'before' => $prev];
}

/* ═════════ 📊 Ta famille et l'histoire de France ═════════ */

function pf_reference(): array
{
    static $ref = null;
    if ($ref !== null) { return $ref; }
    $f = APP_ROOT . '/assets/data/moyennes-france.json';
    $doc = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    return $ref = $doc + ['sources' => [], 'indicators' => [], 'note' => ''];
}

/** une moyenne arrondie, ou null s'il n'y a rien */
function pf_avg(array $v, int $d = 1): ?float
{
    return $v ? round(array_sum($v) / count($v), $d) : null;
}

/** GET famille_france : les moyennes de la famille à côté des repères français */
function famille_france(PDO $pdo, array $get): array
{
    $get = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $get);
    dgo_request($get);
    $keep = dgo_restrict($pdo, null);
    $o = dgo_request();
    $P = pf_people($pdo);
    $ok = static fn(int $id): bool => isset($P[$id]) && !$P[$id]['hidden'] && dvi_keep($keep, $id);
    $ref = pf_reference();
    $fams = dvi_families($pdo);
    // premier mariage de chaque personne ; signatures au mariage
    $firstMarr = [];
    foreach ($fams as $fid => $f) {
        if (!$f[2]) { continue; }
        foreach ([$f[0], $f[1]] as $p) { if ($p && (!isset($firstMarr[$p]) || $f[2] < $firstMarr[$p])) { $firstMarr[$p] = $f[2]; } }
    }
    $signs = [];
    $cols = array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(), 'name');
    if (in_array('signed1', $cols, true)) {
        $q = $pdo->query("SELECT e.family_id, e.sort_date, e.year, e.signed1, e.signed2 FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.scope='family' AND t.gedcom_tag IN ('MARR','MRCI','MRRE') AND (e.signed1 IS NOT NULL OR e.signed2 IS NOT NULL)");
        foreach ($q as $e) {
            $f = $fams[(int) $e['family_id']] ?? null; $d = dchf_date($e['sort_date'], $e['year']); if (!$f || !$d) { continue; }
            foreach ([[$f[0], $e['signed1']], [$f[1], $e['signed2']]] as [$p, $v]) { if ($p && $v !== null) { $signs[] = [$p, $d[0], (int) $v]; } }
        }
    }
    // métiers reconnus (fiche, événements « Profession », recensements) → la terre ou non
    $farm = [];
    if (function_exists('trade_occupations')) {
        $D = trades_dict();
        foreach (trade_occupations($pdo) as $text => $who) {
            $k = trade_match((string) $text); if (!$k) { continue; }
            $isFarm = in_array($D['by'][$k]['domain'] ?? '', ['T', 'F'], true);
            foreach (array_keys($who) as $p) { if (!isset($farm[$p]) || $isFarm) { $farm[$p] = $isFarm; } }
        }
    }
    $sex = static fn(int $p): string => ($P[$p]['g'] ?? '') === 'female' ? 'f' : (($P[$p]['g'] ?? '') === 'male' ? 'h' : '');
    $ids = static fn(array $l): array => array_slice(array_values(array_unique($l)), 0, PF_MAX_IDS);
    $out = [];
    foreach ($ref['indicators'] as $ind) {
        $rows = [];
        foreach ($ind['rows'] as $r) {
            $from = (int) $r['from']; $to = (int) $r['to'];
            if (($o['from'] !== null && $to < $o['from']) || ($o['to'] !== null && $from > $o['to'])) { continue; } // hors de la période choisie
            $in = static fn(?int $y): bool => $y !== null && $y >= $from && $y <= $to;
            $vals = ['h' => [], 'f' => [], 'all' => []]; $who = ['h' => [], 'f' => [], 'all' => []]; $extra = [];
            switch ($ind['key']) {
                case 'age_marriage':
                    foreach ($firstMarr as $p => $m) {
                        if (!$ok($p) || !$in($m[0]) || !$P[$p]['b']) { continue; }
                        $age = dvi_years($P[$p]['b'], $m); if ($age < 12 || $age > 80) { continue; }
                        $s = $sex($p); if ($s === '') { continue; }
                        $vals[$s][] = $age; $who[$s][] = $p;
                    }
                    break;
                case 'children':
                    foreach ($fams as $f) {
                        $kids = array_values(array_filter($f[3], $ok)); if (!$kids) { continue; }
                        $y = $f[2] ? $f[2][0] : null;
                        if ($y === null) { $ys = array_filter(array_map(static fn($k) => $P[$k]['b'][0] ?? null, $kids)); $y = $ys ? min($ys) - 1 : null; }
                        if (!$in($y) || (!$ok($f[0]) && !$ok($f[1]))) { continue; }
                        $vals['all'][] = count($f[3]); array_push($who['all'], ...$kids);
                        foreach ([$f[0], $f[1]] as $p) { if ($p && $ok($p)) { $who['all'][] = $p; } }
                    }
                    break;
                case 'infant':
                    $dead = 0; $n = 0;
                    foreach ($P as $p => $x) {
                        if (!$ok($p) || !$x['b'] || !$in($x['b'][0])) { continue; }
                        if (!$x['d']) { continue; } // décès inconnu : on ne sait pas s'il est mort bébé
                        $n++;
                        if (dvi_years($x['b'], $x['d']) < 1) { $dead++; $who['all'][] = $p; }
                    }
                    if ($n) { $vals['all'] = [round(1000 * $dead / $n)]; $extra = ['n' => $n, 'dead' => $dead]; }
                    break;
                case 'life':
                    foreach ($P as $p => $x) {
                        if (!$ok($p) || !$x['b'] || !$x['d'] || !$in($x['b'][0])) { continue; }
                        $age = dvi_years($x['b'], $x['d']); if ($age < 0 || $age > 115) { continue; }
                        $vals['all'][] = $age; $who['all'][] = $p;
                        $s = $sex($p); if ($s !== '') { $vals[$s][] = $age; $who[$s][] = $p; }
                    }
                    break;
                case 'sign':
                    $cnt = ['h' => [0, 0], 'f' => [0, 0]];
                    foreach ($signs as [$p, $y, $v]) {
                        if (!$ok($p) || !$in($y)) { continue; }
                        $s = $sex($p); if ($s === '') { continue; }
                        $cnt[$s][1]++; if ($v) { $cnt[$s][0]++; } $who[$s][] = $p;
                    }
                    foreach (['h', 'f'] as $s) { if ($cnt[$s][1]) { $vals[$s] = [round(100 * $cnt[$s][0] / $cnt[$s][1])]; $extra['n_' . $s] = $cnt[$s][1]; } }
                    break;
                case 'farm':
                    $yes = 0; $n = 0;
                    foreach ($farm as $p => $isFarm) {
                        if (!$ok($p) || !$P[$p]['b'] || !$in($P[$p]['b'][0])) { continue; }
                        $n++; if ($isFarm) { $yes++; $who['all'][] = $p; }
                    }
                    if ($n) { $vals['all'] = [round(100 * $yes / $n)]; $extra = ['n' => $n]; }
                    break;
            }
            $fam = []; $count = [];
            foreach (['h', 'f', 'all'] as $s) {
                $isRate = in_array($ind['key'], ['infant', 'sign', 'farm'], true);
                $fam[$s] = $vals[$s] ? ($isRate ? $vals[$s][0] : pf_avg($vals[$s])) : null;
                $count[$s] = $isRate ? ($extra['n_' . $s] ?? ($s === 'all' ? ($extra['n'] ?? 0) : 0)) : count($vals[$s]);
            }
            $rows[] = ['label' => (string) $r['label'], 'from' => $from, 'to' => $to, 'who_text' => (string) ($r['who'] ?? ''), 'source' => (string) $r['source'],
                'france' => ['h' => $r['h'] ?? null, 'f' => $r['f'] ?? null, 'all' => $r['all'] ?? null], 'family' => $fam, 'n' => $count,
                'ids' => ['h' => $ids($who['h']), 'f' => $ids($who['f']), 'all' => $ids($who['all'])], 'extra' => (object) $extra];
        }
        $out[] = ['key' => $ind['key'], 'icon' => $ind['icon'] ?? '', 'label' => $ind['label'], 'unit' => $ind['unit'], 'sexes' => (bool) $ind['sexes'], 'family_text' => $ind['family'] ?? '', 'rows' => $rows];
    }
    return ['indicators' => $out, 'sources' => $ref['sources'], 'note' => $ref['note'], 'title' => $ref['title'] ?? ''];
}
