<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 « Compter dans ma base » : la source sur mesure de l'onglet « Depuis l'app → Graphique » des diagrammes
 * (assets/js/heritage-diagram-options.js). GET api.php?action=diagram_app_count&…
 *  - what    : ce qu'on compte — persons, births, baptisms, marriages, deaths, burials, events, families, places, media ;
 *  - distinct: 1 = chaque personne une seule fois par groupe (pour les événements) ;
 *  - le groupe de personnes et la période : dg_pop, dg_root, dg_gens, dg_label, dg_list, dg_q, dg_ids, dg_from, dg_to (lib/diagram_options.php) ;
 *  - by      : le regroupement (nom, prénom, sexe, métier, génération, commune, département, région, pays, siècle, décennie,
 *              année, mois, âge par 5 ou 10 ans, nombre d'enfants, cause de décès, sorte d'événement, sorte de média, rien) ;
 *  - series  : une série par sexe ou par siècle (colonnes empilées, pyramide, carte de chaleur…) ;
 *  - sort, limit, others : le tri, les N premiers, le reste dans « Autres » ; empty : 1 = montrer « Inconnu » ;
 *  - unit    : count (nombre), pct (part en %), avg (moyenne), median (médiane) — avec value : age_death, age_marriage, kids.
 * → {rows: [{label, value, values?}], series: [noms], total, counted, unit, unit_label}
 * Lecture seule, tout est borné ; une valeur inconnue est refusée (422). Rapide sur 5 000 personnes (quelques lectures, le reste en PHP).
 */

require_once __DIR__ . '/diagram_options.php';
require_once __DIR__ . '/diagram_chiffres.php'; // dchf_date, dchf_age, dchf_century, dchf_first_given

const DAC_WHAT = ['persons', 'births', 'baptisms', 'marriages', 'deaths', 'burials', 'events', 'families', 'places', 'media'];
const DAC_PERSON_BY = ['none', 'last_name', 'first_name', 'sex', 'occupation', 'generation', 'commune', 'county', 'state', 'country', 'century', 'decade', 'year', 'month', 'age5', 'age10', 'kids'];
const DAC_BY = [
    'persons' => DAC_PERSON_BY, 'births' => DAC_PERSON_BY, 'baptisms' => DAC_PERSON_BY, 'burials' => DAC_PERSON_BY,
    'deaths' => [...DAC_PERSON_BY, 'cause'],
    'events' => [...DAC_PERSON_BY, 'type'],
    'marriages' => ['none', 'last_name', 'commune', 'county', 'state', 'country', 'century', 'decade', 'year', 'month', 'kids'],
    'families' => ['none', 'last_name', 'commune', 'county', 'state', 'country', 'century', 'decade', 'year', 'month', 'kids'],
    'places' => ['none', 'county', 'state', 'country'],
    'media' => ['none', 'mtype', 'last_name', 'century', 'decade', 'year'],
];
const DAC_TIME_BY = ['century', 'decade', 'year', 'month', 'age5', 'age10', 'generation', 'kids'];
const DAC_VALUES = ['persons' => ['age_death', 'age_marriage', 'kids'], 'births' => ['age_death', 'age_marriage', 'kids'], 'baptisms' => ['age_death', 'kids'],
    'deaths' => ['age_death', 'kids'], 'burials' => ['age_death'], 'events' => ['age_death'], 'marriages' => ['age_marriage', 'kids'], 'families' => ['age_marriage', 'kids'], 'places' => [], 'media' => []];
const DAC_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAC_MEDIA_TYPES = ['image' => 'Photos', 'document' => 'Documents', 'audio' => 'Sons', 'video' => 'Vidéos'];

/** une valeur dans une liste fermée (vide → la valeur par défaut) */
function dac_enum(array $q, string $k, array $allowed, string $def, string $msg): string
{
    $v = dgo_scalar($q, $k);
    if ($v === '') { return $def; }
    if (!in_array($v, $allowed, true)) { dgo_bad($msg); }
    return $v;
}

function dac_bool(array $q, string $k, bool $def): bool
{
    $v = dgo_scalar($q, $k);
    if ($v === '') { return $def; }
    if (!in_array($v, ['0', '1', 'true', 'false'], true)) { dgo_bad('Réglage « ' . $k . ' » de mauvaise forme.'); }
    return $v === '1' || $v === 'true';
}

/** tous les réglages, vérifiés */
function dac_clean(array $q): array
{
    $what = dac_enum($q, 'what', DAC_WHAT, 'persons', 'Je ne sais pas compter cela.');
    $by = dac_enum($q, 'by', DAC_BY[$what], $what === 'places' ? 'county' : ($what === 'media' ? 'mtype' : 'last_name'), 'Ce regroupement ne va pas avec ce qu’on compte.');
    $series = dac_enum($q, 'series', ['', 'sex', 'century'], '', 'Séries inconnues.');
    if ($series === 'sex' && in_array($what, ['places', 'media', 'marriages', 'families'], true)) { dgo_bad('Une série par sexe ne va pas avec ce qu’on compte.'); }
    if ($series !== '' && $series === ($by === 'sex' ? 'sex' : ($by === 'century' ? 'century' : ''))) { $series = ''; }
    $unit = dac_enum($q, 'unit', ['count', 'pct', 'avg', 'median'], 'count', 'Unité inconnue.');
    $value = dac_enum($q, 'value', ['age_death', 'age_marriage', 'kids'], '', 'Valeur inconnue.');
    if (in_array($unit, ['avg', 'median'], true)) {
        if (!DAC_VALUES[$what]) { dgo_bad('Pas de moyenne possible pour ce qu’on compte.'); }
        if ($value === '') { $value = DAC_VALUES[$what][0]; }
        if (!in_array($value, DAC_VALUES[$what], true)) { dgo_bad('Cette valeur ne va pas avec ce qu’on compte.'); }
    } else { $value = ''; }
    $limit = dgo_scalar($q, 'limit');
    if ($limit !== '' && !preg_match('/^\d{1,4}$/', $limit)) { dgo_bad('Nombre de valeurs de mauvaise forme.'); }
    $limit = $limit === '' ? (in_array($by, DAC_TIME_BY, true) ? 0 : 15) : min(200, (int) $limit);
    return ['what' => $what, 'by' => $by, 'series' => $series, 'unit' => $unit, 'value' => $value, 'limit' => $limit,
        'sort' => dac_enum($q, 'sort', ['', 'big', 'small', 'az', 'za', 'natural'], '', 'Tri inconnu.'),
        'others' => dac_bool($q, 'others', true), 'empty' => dac_bool($q, 'empty', false), 'distinct' => dac_bool($q, 'distinct', false),
        'opts' => dgo_clean($q)];
}

/** les personnes (sans les animaux) : nom, prénom, sexe, métier, meilleure naissance et meilleur décès avec leur lieu, enfants, premier mariage */
function dac_people(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $out = [];
    $hasKind = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='kind'")->fetchColumn();
    foreach ($pdo->query('SELECT id, first_name, last_name, gender, COALESCE(occupation,\'\') AS occupation FROM persons' . ($hasKind ? " WHERE COALESCE(kind,'')<>'animal'" : '')) as $r) {
        $out[(int) $r['id']] = ['first' => (string) $r['first_name'], 'last' => trim((string) $r['last_name']), 'g' => (string) $r['gender'], 'occ' => (string) $r['occupation'],
            'b' => null, 'bp' => 0, 'br' => 9, 'd' => null, 'dp' => 0, 'dr' => 9, 'cause' => '', 'kids' => 0, 'm' => null];
    }
    $rank = ['BIRT' => 0, 'CHR' => 1, 'BAPM' => 2, 'DEAT' => 0, 'BURI' => 1];
    foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag AS tag, e.sort_date, e.year, e.place_id, COALESCE(e.cause,'') AS cause FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI')") as $e) {
        $p = (int) $e['person_id']; if (!isset($out[$p])) { continue; }
        $birth = in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true); [$k, $rk, $pk] = $birth ? ['b', 'br', 'bp'] : ['d', 'dr', 'dp'];
        $d = dchf_date($e['sort_date'], $e['year']);
        if ($rank[$e['tag']] < $out[$p][$rk] && ($d || !$out[$p][$k])) { if ($d) { $out[$p][$k] = $d; } $out[$p][$rk] = $rank[$e['tag']]; if ($e['place_id']) { $out[$p][$pk] = (int) $e['place_id']; } }
        if (!$out[$p][$pk] && $e['place_id']) { $out[$p][$pk] = (int) $e['place_id']; }
        if (!$birth && $e['tag'] === 'DEAT' && trim($e['cause']) !== '') { $out[$p]['cause'] = trim($e['cause']); }
    }
    foreach (dac_occupations($pdo) as $id => $v) { if (isset($out[$id])) { $out[$id]['occ'] = $v; } }
    foreach ($pdo->query('SELECT f.partner1_id, f.partner2_id, count(DISTINCT fc.child_id) AS n FROM families f JOIN family_children fc ON fc.family_id=f.id GROUP BY f.id') as $r) {
        foreach ([(int) $r['partner1_id'], (int) $r['partner2_id']] as $p) { if ($p && isset($out[$p])) { $out[$p]['kids'] += (int) $r['n']; } }
    }
    foreach (dac_marriages($pdo) as $m) { foreach ([$m['p1'], $m['p2']] as $p) { if ($p && isset($out[$p]) && $m['d'] && (!$out[$p]['m'] || $m['d'][0] < $out[$p]['m'][0])) { $out[$p]['m'] = $m['d']; } } }
    return $cache = $out;
}

/** le métier de chaque personne : le premier événement « Profession », sinon la fiche */
function dac_occupations(PDO $pdo): array
{
    $clean = static function (string $s): string {
        $s = trim(preg_split('/[,;\/|]/u', $s)[0] ?? ''); $s = preg_replace('/\s+/u', ' ', $s) ?? '';
        if ($s === '') { return ''; }
        $s = mb_strtolower(mb_substr($s, 0, 40)); return mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1);
    };
    $out = [];
    foreach ($pdo->query("SELECT id, COALESCE(occupation,'') AS o FROM persons WHERE TRIM(COALESCE(occupation,''))<>''") as $r) { $v = $clean((string) $r['o']); if ($v !== '') { $out[(int) $r['id']] = $v; } }
    foreach ($pdo->query("SELECT e.person_id, COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),''),'') AS val FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag='OCCU' ORDER BY COALESCE(NULLIF(e.sort_date,''),'9999'), e.id") as $r) {
        $id = (int) $r['person_id']; if (!isset($out[$id])) { $v = $clean((string) $r['val']); if ($v !== '') { $out[$id] = $v; } }
    }
    return $out;
}

/** les familles : les deux conjoints, la date et le lieu du premier mariage, le nombre d'enfants */
function dac_marriages(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $out = [];
    foreach ($pdo->query('SELECT f.id, f.partner1_id, f.partner2_id, (SELECT count(DISTINCT fc.child_id) FROM family_children fc WHERE fc.family_id=f.id) AS kids FROM families f') as $r) {
        $out[(int) $r['id']] = ['id' => (int) $r['id'], 'p1' => (int) $r['partner1_id'], 'p2' => (int) $r['partner2_id'], 'kids' => (int) $r['kids'], 'd' => null, 'pl' => 0, 'has' => false];
    }
    foreach ($pdo->query("SELECT e.family_id, e.sort_date, e.year, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.family_id IS NOT NULL AND t.gedcom_tag IN ('MARR','MRCI','MRRE','MARB','MARC') ORDER BY t.gedcom_tag='MARR' DESC, COALESCE(NULLIF(e.sort_date,''),'9999')") as $r) {
        $f = (int) $r['family_id']; if (!isset($out[$f]) || $out[$f]['has']) { continue; }
        $out[$f]['has'] = true; $out[$f]['d'] = dchf_date($r['sort_date'], $r['year']); $out[$f]['pl'] = (int) $r['place_id'];
    }
    return $cache = $out;
}

/** les lieux : nom, département, région, pays */
function dac_places(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $out = [];
    foreach ($pdo->query("SELECT id, COALESCE(name,'') AS name, COALESCE(county,'') AS county, COALESCE(state,'') AS state, COALESCE(country,'') AS country FROM places") as $r) {
        $out[(int) $r['id']] = ['commune' => mb_substr(trim((string) $r['name']), 0, 80), 'county' => mb_substr(trim((string) $r['county']), 0, 80), 'state' => mb_substr(trim((string) $r['state']), 0, 80), 'country' => mb_substr(trim((string) $r['country']), 0, 80)];
    }
    return $cache = $out;
}

/** le nom d'une génération (1 = la personne de départ) */
function dac_gen_label(int $g, bool $up): string
{
    if ($up) { return match ($g) { 1 => '1 · la personne', 2 => '2 · parents', 3 => '3 · grands-parents', 4 => '4 · arrière-grands-parents', default => $g . ' · ' . str_repeat('arrière-', $g - 3) . 'grands-parents' }; }
    return match ($g) { 1 => '1 · la personne', 2 => '2 · enfants', 3 => '3 · petits-enfants', default => $g . ' · ' . str_repeat('arrière-', $g - 3) . 'petits-enfants' };
}

/** le compte */
function diagram_app_count(PDO $pdo, array $q): array
{
    $t0 = microtime(true);
    $c = dac_clean($q); $o = $c['opts']; $what = $c['what']; $by = $c['by'];
    $keep = dgo_people($pdo, $o);
    // la génération : celle du groupe (ancêtres, descendants, branche), sinon celle des ancêtres de la personne de départ
    $gens = null; $up = $o['pop'] !== 'desc';
    if ($by === 'generation') { $gens = in_array($o['pop'], ['anc', 'desc', 'pat', 'mat'], true) ? $keep : dgo_walk($pdo, dgn_root($pdo, $o['root']), 0, true); }
    $P = dac_people($pdo); $PL = dac_places($pdo);
    $inPop = static fn(int $p) => $p > 0 && isset($P[$p]) && ($keep === null || isset($keep[$p]));
    $inYear = static fn(?array $d) => ($o['from'] === null && $o['to'] === null) || ($d && ($o['from'] === null || $d[0] >= $o['from']) && ($o['to'] === null || $d[0] <= $o['to']));

    // chaque chose comptée : [personnes, date, lieu, personne qui donne nom/sexe/métier, extra]
    $items = [];
    $add = static function (array $who, ?array $d, int $pl, int $ref, array $x = []) use (&$items) { $items[] = ['who' => $who, 'd' => $d, 'pl' => $pl, 'ref' => $ref, 'x' => $x]; };
    if ($what === 'persons' || $what === 'births' || $what === 'deaths') {
        foreach ($P as $id => $p) {
            if (!$inPop($id)) { continue; }
            if ($what === 'deaths') { if (!$p['d'] && !$p['dp'] && $p['dr'] === 9) { continue; } if (!$inYear($p['d'])) { continue; } $add([$id], $p['d'], $p['dp'], $id); continue; }
            if ($what === 'births' && !$p['b'] && !$p['bp'] && $p['br'] === 9) { continue; }
            if (!$inYear($p['b'])) { continue; }
            $add([$id], $p['b'], $p['bp'], $id);
        }
    } elseif (in_array($what, ['baptisms', 'burials', 'events'], true)) {
        $where = $what === 'baptisms' ? "t.gedcom_tag IN ('CHR','BAPM')" : ($what === 'burials' ? "t.gedcom_tag='BURI'" : '1');
        $F = dac_marriages($pdo);
        foreach ($pdo->query("SELECT e.person_id, e.family_id, e.sort_date, e.year, e.place_id, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE $where") as $e) {
            $who = $e['person_id'] ? [(int) $e['person_id']] : (isset($F[(int) $e['family_id']]) ? array_values(array_filter([$F[(int) $e['family_id']]['p1'], $F[(int) $e['family_id']]['p2']])) : []);
            $who = array_values(array_filter($who, $inPop)); if (!$who) { continue; }
            $d = dchf_date($e['sort_date'], $e['year']); if (!$inYear($d)) { continue; }
            $add($who, $d, (int) $e['place_id'], $who[0], ['type' => mb_substr(trim((string) $e['label']), 0, 60)]);
        }
    } elseif ($what === 'marriages' || $what === 'families') {
        foreach (dac_marriages($pdo) as $f) {
            if ($what === 'marriages' && !$f['has']) { continue; }
            $who = array_values(array_filter([$f['p1'], $f['p2']], $inPop)); if (!$who) { continue; }
            if (!$inYear($f['d'])) { continue; }
            $husband = $f['p1'] && ($P[$f['p1']]['g'] ?? '') !== 'female' ? $f['p1'] : ($f['p2'] ?: $f['p1']);
            $add($who, $f['d'], $f['pl'], $husband, ['kids' => $f['kids'], 'fam' => $f]);
        }
    } elseif ($what === 'places') {
        $used = [];
        foreach ($pdo->query('SELECT e.place_id, e.person_id, f.partner1_id, f.partner2_id, e.sort_date, e.year FROM events e LEFT JOIN families f ON f.id=e.family_id WHERE e.place_id IS NOT NULL') as $e) {
            $pl = (int) $e['place_id']; if (isset($used[$pl]) || !isset($PL[$pl])) { continue; }
            $who = array_filter([(int) $e['person_id'], (int) $e['partner1_id'], (int) $e['partner2_id']], $inPop); if ($keep !== null && !$who) { continue; }
            if (!$inYear(dchf_date($e['sort_date'], $e['year']))) { continue; }
            $used[$pl] = true; $add(array_values($who), null, $pl, 0);
        }
    } elseif ($what === 'media') {
        $links = [];
        foreach ($pdo->query("SELECT media_id, entity_id FROM media_links WHERE entity_type='person' ORDER BY position") as $l) { $links[(int) $l['media_id']][] = (int) $l['entity_id']; }
        foreach ($pdo->query("SELECT id, media_type, COALESCE(date_text,'') AS dt FROM media") as $m) {
            $who = array_values(array_filter($links[(int) $m['id']] ?? [], $inPop)); if ($keep !== null && !$who) { continue; }
            $d = preg_match('/(?<!\d)(\d{3,4})(?!\d)/', (string) $m['dt'], $mm) ? [(int) $mm[1], 0, 0, false] : null;
            if (!$inYear($d)) { continue; }
            $add($who, $d, 0, $who[0] ?? 0, ['mtype' => DAC_MEDIA_TYPES[(string) $m['media_type']] ?? 'Autres médias']);
        }
    }

    // la valeur d'une chose pour un regroupement
    $sexL = static fn(string $g) => ['male' => 'Hommes', 'female' => 'Femmes'][$g] ?? '';
    $ageOf = static function (array $it) use ($P, $what): ?int {
        $p = $P[$it['ref']] ?? null; if (!$p || !$p['b']) { return null; }
        if (in_array($what, ['marriages', 'families'], true)) { return $it['d'] ? dchf_age($p['b'], $it['d']) : null; }
        return $p['d'] ? dchf_age($p['b'], $p['d']) : null;
    };
    $keyOf = static function (array $it, string $how) use ($P, $PL, $gens, $up, $sexL, $ageOf): string {
        $p = $P[$it['ref']] ?? null; $d = $it['d']; $pl = $PL[$it['pl']] ?? null;
        switch ($how) {
            case 'none': return 'Tout';
            case 'last_name': return $p ? mb_strtoupper(mb_substr($p['last'], 0, 60)) : '';
            case 'first_name': return $p ? dchf_first_given($p['first']) : '';
            case 'sex': return $p ? $sexL($p['g']) : '';
            case 'occupation': return $p ? $p['occ'] : '';
            case 'generation': $g = $gens[$it['ref']] ?? null; return is_int($g) ? dac_gen_label($g, $up) : '';
            case 'commune': case 'county': case 'state': case 'country': return $pl ? $pl[$how] : '';
            case 'century': return $d ? dchf_century($d[0]) : '';
            case 'decade': return $d ? (intdiv($d[0], 10) * 10) . '–' . (intdiv($d[0], 10) * 10 + 9) : '';
            case 'year': return $d ? (string) $d[0] : '';
            case 'month': return $d && $d[1] >= 1 && $d[1] <= 12 ? DAC_MONTHS[$d[1] - 1] : '';
            case 'age5': case 'age10': $a = $ageOf($it); if ($a === null) { return ''; } $s = $how === 'age5' ? 5 : 10; $b = intdiv($a, $s) * $s; return $b . '–' . ($b + $s - 1) . ' ans';
            case 'kids': $k = $it['x']['kids'] ?? ($p['kids'] ?? null); return $k === null ? '' : ($k >= 10 ? '10 et plus' : (string) $k);
            case 'cause': return $p ? mb_substr($p['cause'], 0, 60) : '';
            case 'type': return (string) ($it['x']['type'] ?? '');
            case 'mtype': return (string) ($it['x']['mtype'] ?? '');
        }
        return '';
    };
    // l'ordre naturel des regroupements dans le temps
    $orderOf = static function (string $how, string $k): float {
        if ($k === '') { return INF; }
        if ($how === 'month') { $i = array_search($k, DAC_MONTHS, true); return $i === false ? 99 : $i; }
        if ($how === 'century') { $r = ['I' => 1, 'V' => 5, 'X' => 10]; $s = preg_replace('/e s\.$/', '', $k); $n = 0; $prev = 0; foreach (array_reverse(str_split($s)) as $ch) { $v = $r[$ch] ?? 0; $n += $v < $prev ? -$v : $v; $prev = max($prev, $v); } return $n ?: (float) $k; }
        if (preg_match('/^-?\d+/', $k, $m)) { return (float) $m[0]; }
        return 0;
    };
    $valOf = static function (array $it) use ($P, $c, $what, $ageOf): ?float {
        if ($c['value'] === 'kids') { return (float) ($it['x']['kids'] ?? ($P[$it['ref']]['kids'] ?? 0)); }
        if ($c['value'] === 'age_marriage') {
            if (in_array($what, ['marriages', 'families'], true)) { $a = $ageOf($it); return $a === null ? null : (float) $a; }
            $p = $P[$it['ref']] ?? null; if (!$p || !$p['b'] || !$p['m']) { return null; } $a = dchf_age($p['b'], $p['m']); return $a === null ? null : (float) $a;
        }
        $p = $P[$it['ref']] ?? null; if (!$p || !$p['b'] || !$p['d']) { return null; } $a = dchf_age($p['b'], $p['d']); return $a === null ? null : (float) $a;
    };

    // regrouper : groupe → série → [nombre, valeurs, personnes vues]
    $groups = []; $seriesTot = []; $counted = 0; $avg = in_array($c['unit'], ['avg', 'median'], true);
    foreach ($items as $it) {
        $k = $keyOf($it, $by);
        if ($k === '' && !$c['empty']) { continue; }
        $s = $c['series'] === '' ? '' : $keyOf($it, $c['series']);
        if ($c['series'] !== '' && $s === '') { $s = 'Inconnu'; }
        $v = $avg ? $valOf($it) : null; if ($avg && $v === null) { continue; }
        $g = &$groups[$k][$s];
        if ($g === null) { $g = ['n' => 0, 'v' => [], 'seen' => []]; }
        if ($c['distinct'] && in_array($what, ['baptisms', 'burials', 'events'], true)) { $pid = $it['who'][0] ?? 0; if (isset($g['seen'][$pid])) { unset($g); continue; } $g['seen'][$pid] = true; }
        $g['n']++; if ($avg) { $g['v'][] = $v; }
        unset($g);
        $seriesTot[$s] = ($seriesTot[$s] ?? 0) + 1; $counted++;
    }
    // les séries : les 12 plus grandes (par siècle : dans l'ordre du temps)
    $seriesNames = array_keys($seriesTot);
    if ($c['series'] !== '') {
        usort($seriesNames, static fn($a, $b) => $c['series'] === 'century' ? $orderOf('century', $a) <=> $orderOf('century', $b) : ($seriesTot[$b] <=> $seriesTot[$a] ?: strcmp($a, $b)));
        $seriesNames = array_slice($seriesNames, 0, 12);
    } else { $seriesNames = ['']; }
    $sum = static fn(array $byS) => array_sum(array_map(static fn($x) => $x['n'], $byS));
    $rows = [];
    foreach ($groups as $k => $byS) { $rows[] = ['k' => (string) $k, 'n' => $sum($byS), 's' => $byS]; }
    // le tri
    $time = in_array($by, DAC_TIME_BY, true);
    $sort = $c['sort'] === '' ? ($time ? 'natural' : 'big') : $c['sort'];
    $metric = static function (array $r) use ($avg, $c): float { if (!$avg) { return $r['n']; } $all = []; foreach ($r['s'] as $x) { array_push($all, ...$x['v']); } return dac_stat($all, $c['unit']); };
    usort($rows, static function ($a, $b) use ($sort, $by, $orderOf, $metric) {
        if ($a['k'] === '' xor $b['k'] === '') { return $a['k'] === '' ? 1 : -1; } // « Inconnu » à la fin
        return match ($sort) {
            'natural' => $orderOf($by, $a['k']) <=> $orderOf($by, $b['k']) ?: strcmp($a['k'], $b['k']),
            'small' => $metric($a) <=> $metric($b) ?: strcmp($a['k'], $b['k']),
            'az' => strcmp(dac_fold($a['k']), dac_fold($b['k'])),
            'za' => strcmp(dac_fold($b['k']), dac_fold($a['k'])),
            default => $metric($b) <=> $metric($a) ?: strcmp($a['k'], $b['k']),
        };
    });
    // les N premiers, le reste dans « Autres »
    $rest = [];
    if ($c['limit'] > 0 && count($rows) > $c['limit']) { $rest = array_slice($rows, $c['limit']); $rows = array_slice($rows, 0, $c['limit']); }
    $rows = array_slice($rows, 0, 200);
    if ($rest && $c['others']) {
        $o2 = ['k' => 'Autres', 'n' => 0, 's' => [], 'other' => true];
        foreach ($rest as $r) { $o2['n'] += $r['n']; foreach ($r['s'] as $s => $x) { $o2['s'][$s] ??= ['n' => 0, 'v' => []]; $o2['s'][$s]['n'] += $x['n']; array_push($o2['s'][$s]['v'], ...$x['v']); } }
        $rows[] = $o2;
    }
    // l'unité
    $total = $counted;
    $num = static function (array $x) use ($c, $total): float {
        return match ($c['unit']) { 'pct' => $total ? round($x['n'] / $total * 100, 1) : 0.0, 'avg', 'median' => round(dac_stat($x['v'], $c['unit']), 1), default => (float) $x['n'] };
    };
    $out = [];
    foreach ($rows as $r) {
        $label = $r['k'] === '' ? 'Inconnu' : $r['k'];
        if ($c['series'] === '') { $x = $r['s'][''] ?? ['n' => 0, 'v' => []]; $out[] = ['label' => $label, 'value' => $num($x)]; continue; }
        $vals = array_map(static fn($s) => isset($r['s'][$s]) ? $num($r['s'][$s]) : 0.0, $seriesNames);
        $all = ['n' => $r['n'], 'v' => []]; foreach ($r['s'] as $x) { array_push($all['v'], ...$x['v']); }
        $out[] = ['label' => $label, 'value' => $num($all), 'values' => $vals];
    }
    $unitLabel = match ($c['unit']) { 'pct' => '%', 'avg', 'median' => $c['value'] === 'kids' ? 'enfants' : 'ans', default => '' };
    return ['rows' => $out, 'series' => $c['series'] === '' ? [] : array_values($seriesNames), 'total' => $total, 'counted' => $counted,
        'unit' => $c['unit'], 'unit_label' => $unitLabel, 'what' => $what, 'by' => $by, 'ms' => (int) round((microtime(true) - $t0) * 1000)];
}

/** pour ranger de A à Z sans tenir compte des accents ni des capitales */
function dac_fold(string $s): string
{
    return strtr(mb_strtolower($s), ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'œ' => 'oe', 'æ' => 'ae']);
}

/** moyenne ou médiane */
function dac_stat(array $v, string $unit): float
{
    if (!$v) { return 0.0; }
    if ($unit === 'median') { sort($v); $n = count($v); return $n % 2 ? (float) $v[intdiv($n, 2)] : ($v[$n / 2 - 1] + $v[$n / 2]) / 2; }
    return array_sum($v) / count($v);
}
