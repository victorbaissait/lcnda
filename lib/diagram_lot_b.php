<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 Diagrammes « chiffres, vies et démographie » (lot B, assets/js/heritage-diagram-lot-b.js) : les données qu'on
 * ne trouve pas dans l'arbre léger (tresor_tree). Lecture seule, tout est borné.
 * GET api.php?action=diagram_lot_b&what=…  + le groupe de personnes et la période communs (dg_*, lib/diagram_options.php)
 *   + les critères « ＋ Critère » (rules = JSON, match = all | any : les mêmes que Mes listes, lib/my_lists.php) :
 *  - people   : les personnes retenues → {all: vrai si aucun filtre, ids: […], n} (la période porte sur l'année de naissance) ;
 *  - coverage : ✅ « Ce que tu as prouvé », une ligne par ancêtre (root, gens 2 à 10) → {rows: [{sosa, gen, pid, name,
 *               b, m, d (s = sourcé, e = sans source, x = manquant, '' = pas attendu), cens, nota, mili}], root_name} ;
 *  - sectors  : 🔺 diagramme ternaire, les secteurs de métiers (lib/metiers_carte.php) par commune de naissance, décennie
 *               de naissance ou nom de famille (by = place | decade | family, top 3 à 60) → {rows: [{label, year, n, by: {secteur: n}, ids}], sectors} ;
 *  - history  : les bandes historiques (history_events) de from à to → {rows: [{label, from, to, category}]}.
 * Une valeur de mauvaise forme est refusée (422). Les fiches cachées en consultation ne sortent jamais.
 */

require_once __DIR__ . '/diagram_appcount.php'; // dgo_*, dac_rule_ids
require_once __DIR__ . '/metiers_carte.php';     // metiers_jobs_of, metiers_hidden, METIERS_SECTORS

const DLB_MAX_IDS = 20000;

/** les critères « ＋ Critère » de la demande : [règles, all | any] */
function dlb_rules(array $q): array
{
    $raw = dgo_scalar($q, 'rules');
    if ($raw === '') { return [[], 'all']; }
    if (strlen($raw) > 20000) { dgo_bad('Trop de critères.'); }
    $dec = json_decode($raw, true); if (!is_array($dec)) { dgo_bad('Critères de mauvaise forme.'); }
    if (!function_exists('my_list_clean_definition')) { require_once __DIR__ . '/my_lists.php'; }
    $match = dgo_scalar($q, 'match') === 'any' ? 'any' : 'all';
    $rules = array_slice(my_list_clean_definition(['rules' => array_slice(array_values($dec), 0, 30), 'match' => $match], 'persons')['rules'], 0, 30);
    return [$rules, $match];
}

/** l'année de naissance (ou de baptême) de chacun : id → année */
function dlb_births(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query("SELECT e.person_id AS p, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND e.year IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM') GROUP BY e.person_id") as $r) {
        $out[(int) $r['p']] = (int) $r['y'];
    }
    return $out;
}

/** les personnes retenues (groupe ∩ critères ∩ nées dans la période) : id → true ; null = tout le monde */
function dlb_people(PDO $pdo, array $q): ?array
{
    $o = dgo_request();
    $set = dgo_people($pdo, $o);
    [$rules, $match] = dlb_rules($q);
    if ($rules) { $r = dac_rule_ids($pdo, $rules, $match); $set = $set === null ? $r : array_intersect_key($set, $r); }
    if ($o['from'] !== null || $o['to'] !== null) {
        $b = dlb_births($pdo);
        $base = $set ?? array_fill_keys(array_keys($b), true);
        $set = array_filter($base, static fn($v, $id) => dgo_year_ok($b[(int) $id] ?? null), ARRAY_FILTER_USE_BOTH);
    }
    if ($set !== null) { $set = array_map(static fn() => true, $set); }
    return $set;
}

function dlb_table(PDO $pdo, string $t): bool
{
    $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]);
    return (bool) $s->fetchColumn();
}

/** ✅ une ligne par ancêtre : naissance, mariage, décès (sourcé, sans source, manquant), recensements, actes notariés, faits militaires */
function dlb_coverage(PDO $pdo, int $root, int $gens): array
{
    $root = dgn_root($pdo, $root); $gens = max(2, min(10, $gens));
    if (!$root) { return ['rows' => [], 'root_name' => '']; }
    $hidden = metiers_hidden($pdo);
    $sourced = [];
    foreach ($pdo->query("SELECT DISTINCT entity_id FROM source_links WHERE entity_type='event'") as $r) { $sourced[(int) $r['entity_id']] = true; }
    $ev = []; $kind = ['BIRT' => 'b', 'CHR' => 'b', 'BAPM' => 'b', 'DEAT' => 'd', 'BURI' => 'd'];
    foreach ($pdo->query("SELECT e.id, e.person_id, t.gedcom_tag AS tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI')") as $e) {
        $p = (int) $e['person_id']; $k = $kind[$e['tag']]; $ev[$p][$k] = max($ev[$p][$k] ?? 0, isset($sourced[(int) $e['id']]) ? 2 : 1);
    }
    foreach ($pdo->query("SELECT e.id, f.partner1_id, f.partner2_id FROM events e JOIN families f ON f.id=e.family_id JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('MARR','MARB','MARC')") as $e) {
        $v = isset($sourced[(int) $e['id']]) ? 2 : 1;
        foreach (['partner1_id', 'partner2_id'] as $c) { $p = (int) $e[$c]; if ($p) { $ev[$p]['m'] = max($ev[$p]['m'] ?? 0, $v); } }
    }
    $count = static function (string $sql) use ($pdo): array { $o = []; foreach ($pdo->query($sql) as $r) { $o[(int) $r['p']] = (int) $r['n']; } return $o; };
    $cens = $count('SELECT person_id AS p, COUNT(*) AS n FROM census_members WHERE person_id IS NOT NULL GROUP BY person_id');
    $nota = dlb_table($pdo, 'succession_people') ? $count('SELECT person_id AS p, COUNT(DISTINCT act_id) AS n FROM succession_people WHERE person_id IS NOT NULL GROUP BY person_id') : [];
    $mili = dlb_table($pdo, 'poilu_events') ? $count('SELECT person_id AS p, COUNT(*) AS n FROM poilu_events GROUP BY person_id') : [];
    foreach ($count("SELECT e.person_id AS p, COUNT(*) AS n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND (t.gedcom_tag IN ('_MILT','_MILI','MILI') OR LOWER(t.label) LIKE '%milit%' OR LOWER(t.label) LIKE '%matricul%') GROUP BY e.person_id") as $p => $n) { $mili[$p] = ($mili[$p] ?? 0) + $n; }
    $sosa = dgn_sosa($pdo, $root, $gens, 4000);
    $info = [];
    foreach (array_chunk(array_values(array_unique(array_map('intval', $sosa))), 400) as $chunk) {
        foreach ($pdo->query('SELECT id, first_name, last_name, living_status FROM persons WHERE id IN (' . implode(',', $chunk) . ')') as $p) {
            $info[(int) $p['id']] = [trim(preg_replace('/\s+/', ' ', $p['first_name'] . ' ' . $p['last_name']) ?? ''), $p['living_status'] === 'living'];
        }
    }
    $rows = [];
    foreach ($sosa as $s => $id) {
        $id = (int) $id; if (isset($hidden[$id]) || !isset($info[$id])) { continue; }
        $g = strlen(decbin((int) $s)); $o = ['sosa' => (int) $s, 'gen' => $g, 'pid' => $id, 'name' => $info[$id][0]];
        foreach (['b', 'm', 'd'] as $k) {
            if (($k === 'm' && $g === 1) || ($k === 'd' && $info[$id][1])) { $o[$k] = ''; continue; }
            $o[$k] = ['x', 'e', 's'][$ev[$id][$k] ?? 0];
        }
        $o['cens'] = $cens[$id] ?? 0; $o['nota'] = $nota[$id] ?? 0; $o['mili'] = $mili[$id] ?? 0;
        $rows[] = $o;
    }
    usort($rows, static fn($a, $b) => $a['sosa'] <=> $b['sosa']);
    return ['rows' => $rows, 'root_name' => $info[$root][0] ?? ''];
}

/** 🔺 les secteurs de métiers des personnes retenues, par commune de naissance, décennie ou nom de famille */
function dlb_sectors(PDO $pdo, array $q, string $by, int $top): array
{
    $set = dlb_people($pdo, $q); $hidden = metiers_hidden($pdo); $top = max(3, min(60, $top));
    $people = [];
    $sql = "SELECT p.id, p.last_name, (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) AS y,
        (SELECT pl.name FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY COALESCE(e.sort_date,''), e.id LIMIT 1) AS place
        FROM persons p WHERE COALESCE(p.kind,'human')<>'animal'";
    try { $st = $pdo->query($sql); } catch (Throwable) { $st = $pdo->query(str_replace(" WHERE COALESCE(p.kind,'human')<>'animal'", '', $sql)); }
    foreach ($st as $r) {
        $id = (int) $r['id']; if (($set !== null && !isset($set[$id])) || isset($hidden[$id])) { continue; }
        $people[$id] = ['last' => trim((string) $r['last_name']), 'y' => $r['y'] !== null ? (int) $r['y'] : null, 'place' => trim(explode(',', (string) $r['place'])[0])];
        if (count($people) >= DLB_MAX_IDS) { break; }
    }
    $jobs = metiers_jobs_of($pdo, array_keys($people));
    $groups = [];
    foreach ($people as $id => $p) {
        $sector = $jobs[$id][0]['sector'] ?? ''; if ($sector === '') { continue; }
        $key = match ($by) { 'decade' => $p['y'] === null ? '' : (string) (intdiv($p['y'], 10) * 10), 'family' => mb_strtoupper($p['last']), default => $p['place'] };
        if ($key === '') { continue; }
        $g = &$groups[$key];
        $g ??= ['label' => $key, 'year' => $by === 'decade' ? (int) $key : null, 'n' => 0, 'by' => [], 'ids' => []];
        $g['n']++; $g['by'][$sector] = ($g['by'][$sector] ?? 0) + 1; if (count($g['ids']) < 400) { $g['ids'][] = $id; }
        unset($g);
    }
    $rows = array_values($groups);
    if ($by === 'decade') { usort($rows, static fn($a, $b) => $a['year'] <=> $b['year']); $rows = array_slice($rows, -$top); }
    else { usort($rows, static fn($a, $b) => $b['n'] <=> $a['n'] ?: strcmp($a['label'], $b['label'])); $rows = array_slice($rows, 0, $top); }
    foreach ($rows as &$r) { $r['ids'] = implode(',', $r['ids']); $r['by'] = (object) $r['by']; }
    unset($r);
    return ['rows' => $rows, 'sectors' => METIERS_SECTORS, 'people' => count($people), 'with_job' => array_sum(array_map(static fn($r) => $r['n'], $rows))];
}

/** les bandes historiques (guerres, épidémies…) entre deux années */
function dlb_history(PDO $pdo, ?int $from, ?int $to): array
{
    if (!dlb_table($pdo, 'history_events')) { return ['rows' => []]; }
    $s = $pdo->prepare('SELECT from_year, to_year, title, category FROM history_events WHERE to_year >= ? AND from_year <= ? ORDER BY from_year LIMIT 60');
    $s->execute([$from ?? -3000, $to ?? 2200]);
    return ['rows' => array_map(static fn($r) => ['label' => mb_substr((string) $r['title'], 0, 80), 'from' => (int) $r['from_year'], 'to' => (int) $r['to_year'], 'category' => (string) $r['category']], $s->fetchAll(PDO::FETCH_ASSOC))];
}

function diagram_lot_b_data(PDO $pdo, array $q): array
{
    foreach ($q as $k => $v) { if (is_array($v) || is_object($v)) { dgo_bad('Réglage « ' . $k . ' » de mauvaise forme.'); } }
    $o = dgo_request($q);
    $int = static function (string $k, int $def) use ($q): int { $v = trim((string) ($q[$k] ?? '')); if ($v === '') { return $def; } if (!preg_match('/^-?\d{1,9}$/', $v)) { dgo_bad('Nombre de mauvaise forme.'); } return (int) $v; };
    return match ((string) ($q['what'] ?? '')) {
        'people' => (static function () use ($pdo, $q) { $set = dlb_people($pdo, $q); $ids = $set === null ? [] : array_slice(array_keys($set), 0, DLB_MAX_IDS); return ['all' => $set === null, 'ids' => $ids, 'n' => $set === null ? null : count($set)]; })(),
        'coverage' => dlb_coverage($pdo, $int('root', 0), $int('gens', 5)),
        'sectors' => dlb_sectors($pdo, $q, in_array($q['by'] ?? '', ['place', 'decade', 'family'], true) ? (string) $q['by'] : 'place', $int('top', 12)),
        'history' => dlb_history($pdo, $o['from'], $o['to']),
        default => throw new LcndaBadInput('Données inconnues.'),
    };
}
