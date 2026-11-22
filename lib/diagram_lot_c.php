<?php
declare(strict_types=1);

/**
 * LCNDA — 📊 Diagrammes « lot C » : les données de l'onglet « Depuis l'app » (assets/js/heritage-diagram-lot-c.js,
 * assets/js/heritage-diagram-cartes.js) :
 *  - census   : 🗓️ grille des recensements — une ligne par personne (naissance, décès), une par recensement relevé (statut) ;
 *  - proofs   : la liste des ⚖️ dossiers de preuve et des hypothèses à comparer ; proof&id= / hyp&id= : un dossier, ses lignes ;
 *  - words    : 🌿 arbre de mots — les bouts de transcription qui suivent (ou précèdent) un mot (« fils de », « veuve de »…) ;
 *  - parishes : ⛪ zones des paroisses — une paroisse par église (place_parishes, sinon le lieu lui-même) et ce qu'on y compte ;
 *  - star     : ✳️ carte en étoile — les liens d'un lieu : conjoints venus s'y marier, enfants partis, émigrés.
 * Le groupe de personnes et la période communs (dg_*, lib/diagram_options.php) et les critères « ＋ Critère » (rules, match :
 * moteur de Mes listes) restreignent chaque fois les personnes prises. Rien n'est écrit dans la base.
 *  GET api.php?action=diagram_lot_c&what=census|proofs|proof|hyp|words|parishes|star&…
 */

require_once __DIR__ . '/diagram_options.php';
require_once __DIR__ . '/diagram_appcount.php'; // dac_people, dac_marriages, dac_places, dac_rule_ids

const DLC_STATUS = ['todo', 'found', 'not_found', 'not_born', 'not_in_france', 'not_france', 'left_france', 'dead'];
const DLC_CENSUS_YEARS = [1801, 1806, 1811, 1821, 1826, 1831, 1836, 1841, 1846, 1851, 1856, 1861, 1866, 1872, 1876, 1881, 1886, 1891, 1896, 1901, 1906, 1911, 1921, 1926, 1931, 1936, 1946, 1954, 1962, 1968, 1975, 1982, 1990, 1999];

function diagram_lot_c_data(PDO $pdo, array $q): array
{
    $q = array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $q);
    dgo_request($q); // groupe et période communs : refusés s'ils sont de mauvaise forme
    return match ($q['what'] ?? '') {
        'census' => dlc_census($pdo, $q),
        'proofs' => dlc_proofs($pdo, $q),
        'proof' => dlc_proof($pdo, (int) ($q['id'] ?? 0)),
        'hyp' => dlc_hyp($pdo, (int) ($q['id'] ?? 0)),
        'words' => dlc_words($pdo, $q),
        'parishes' => dlc_parishes($pdo, $q),
        'star' => dlc_star($pdo, $q),
        default => throw new LcndaBadInput('Données inconnues.'),
    };
}

/** les personnes gardées : le groupe commun croisé avec les critères ; null = tout le monde */
function dlc_keep(PDO $pdo, array $q): ?array
{
    $keep = dgo_restrict($pdo, null);
    $raw = trim((string) ($q['rules'] ?? ''));
    if ($raw !== '') {
        if (strlen($raw) > 20000) { dgo_bad('Trop de critères.'); }
        $dec = json_decode($raw, true); if (!is_array($dec)) { dgo_bad('Critères de mauvaise forme.'); }
        if (!function_exists('my_list_clean_definition')) { require_once __DIR__ . '/my_lists.php'; }
        $match = ($q['match'] ?? '') === 'any' ? 'any' : 'all';
        $rules = array_slice(my_list_clean_definition(['rules' => array_slice(array_values($dec), 0, 30), 'match' => $match], 'persons')['rules'], 0, 30);
        if ($rules) { $ids = dac_rule_ids($pdo, $rules, $match); $keep = $keep === null ? $ids : array_intersect_key($keep, $ids); }
    }
    return $keep;
}

function dlc_name(array $p): string
{
    $n = trim($p['first'] . ' ' . mb_strtoupper($p['last']));
    return $n !== '' ? mb_substr($n, 0, 80) : 'Sans nom';
}

function dlc_int(array $q, string $k, int $def, int $min, int $max): int
{
    $v = trim((string) ($q[$k] ?? ''));
    if ($v === '') { return $def; }
    if (!preg_match('/^-?\d{1,6}$/', $v)) { dgo_bad('Nombre de mauvaise forme (' . $k . ').'); }
    return max($min, min($max, (int) $v));
}

/* ═════════ 🗓️ La grille des recensements ═════════ */
function dlc_census(PDO $pdo, array $q): array
{
    $o = dgo_request();
    $y1 = dlc_int($q, 'from', 1836, 1700, 2100); $y2 = dlc_int($q, 'to', 1936, 1700, 2100); if ($y2 < $y1) { [$y1, $y2] = [$y2, $y1]; }
    $max = dlc_int($q, 'max', 60, 1, 400);
    $P = dac_people($pdo); $keep = dlc_keep($pdo, $q);
    // l'ordre : les ancêtres par numéro Sosa (groupe « mes ancêtres », ou rien de choisi), sinon par naissance
    $order = [];
    if ($keep === null || $o['pop'] === 'anc') {
        $root = dgn_root($pdo, $o['root']);
        foreach (dgn_sosa($pdo, $root, $o['gens'] ?: 12, 20000) as $s => $id) { if (!isset($order[$id])) { $order[$id] = $s; } }
        if ($keep === null) { $keep = array_map(static fn() => true, $order); }
    }
    $by = static fn(int $id) => $P[$id]['b'][0] ?? null; $dy = static fn(int $id) => $P[$id]['d'][0] ?? null;
    $ids = array_values(array_filter(array_keys($keep), static function (int $id) use ($P, $by, $dy, $y1, $y2) {
        if (!isset($P[$id])) { return false; }
        $b = $by($id); $d = $dy($id);
        if ($b !== null && $b > $y2) { return false; } // née après le dernier recensement
        if ($d !== null && $d < $y1) { return false; } // morte avant le premier
        if ($b === null && $d === null) { return false; } // sans aucune date : on ne sait pas la placer
        return true;
    }));
    usort($ids, static fn($a, $b) => [$order[$a] ?? PHP_INT_MAX, $by($a) ?? 9999, $a] <=> [$order[$b] ?? PHP_INT_MAX, $by($b) ?? 9999, $b]);
    $total = count($ids); $ids = array_slice($ids, 0, $max);
    $rows = []; $recs = [];
    if ($ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $s = $pdo->prepare("SELECT cm.person_id, cr.id, cr.year, cr.status, cr.is_special, COALESCE(pl.name,'') AS place FROM census_records cr JOIN census_members cm ON cm.census_id=cr.id
            LEFT JOIN places pl ON pl.id=cr.place_id WHERE cm.person_id IN ($marks) AND cr.year BETWEEN ? AND ? ORDER BY cr.is_special, cr.id");
        $s->execute([...$ids, $y1, $y2]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $k = (int) $r['person_id'] . ':' . (int) $r['year'];
            if (isset($recs[$k])) { continue; } // le recensement officiel d'abord (un spécial la même année : gardé s'il est seul)
            $recs[$k] = $r;
        }
    }
    foreach ($ids as $id) {
        $p = $P[$id]; $name = dlc_name($p);
        $rows[] = ['person' => $name, 'born' => $by($id) !== null ? (string) $by($id) : '', 'died' => $dy($id) !== null ? (string) $dy($id) : '', 'year' => '', 'status' => '', 'note' => isset($order[$id]) ? 'Sosa ' . $order[$id] : '', 'pid' => $id];
        foreach ($recs as $k => $r) {
            if ((int) explode(':', $k)[0] !== $id) { continue; }
            $st = in_array($r['status'], DLC_STATUS, true) ? $r['status'] : 'todo';
            $rows[] = ['person' => $name, 'born' => '', 'died' => '', 'year' => (string) (int) $r['year'], 'status' => $st, 'note' => mb_substr((string) $r['place'], 0, 60), 'pid' => $id, 'cid' => (int) $r['id']];
        }
    }
    return ['rows' => $rows, 'people' => count($ids), 'total' => $total, 'from' => $y1, 'to' => $y2, 'years' => array_values(array_filter(DLC_CENSUS_YEARS, static fn($y) => $y >= $y1 && $y <= $y2))];
}

/* ═════════ ⚖️ Les dossiers de preuve et les hypothèses ═════════ */
function dlc_proofs(PDO $pdo, array $q): array
{
    if (!function_exists('preuve_list')) { require_once __DIR__ . '/preuve.php'; }
    $keep = dlc_keep($pdo, $q);
    $in = static fn(int $pid) => $keep === null || isset($keep[$pid]);
    $cases = [];
    foreach (preuve_list($pdo)['items'] as $c) {
        if (!$in((int) $c['person_id'])) { continue; }
        $cases[] = ['id' => (int) $c['id'], 'question' => mb_substr((string) $c['question'], 0, 200), 'certainty' => (string) $c['certainty'], 'person' => (string) ($c['person']['name'] ?? $c['person']['title'] ?? ''),
            'n' => (int) $c['n_for'] + (int) $c['n_against'] + (int) $c['n_research'] + (int) $c['n_conflict']];
    }
    $hyps = [];
    if ((bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hypotheses'")->fetchColumn()) {
        foreach ($pdo->query("SELECT h.id, h.title, h.person_id, h.status, trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS name FROM hypotheses h LEFT JOIN persons p ON p.id=h.person_id ORDER BY h.updated_at DESC, h.id DESC LIMIT 1000") as $h) {
            if (!$in((int) $h['person_id'])) { continue; }
            $hyps[] = ['id' => (int) $h['id'], 'title' => mb_substr((string) $h['title'], 0, 200), 'person' => (string) $h['name'], 'status' => (string) $h['status']];
        }
    }
    return ['cases' => $cases, 'hypotheses' => $hyps];
}

function dlc_proof(PDO $pdo, int $id): array
{
    if (!function_exists('preuve_case_view')) { require_once __DIR__ . '/preuve.php'; }
    $c = preuve_case_view($pdo, preuve_case_row($pdo, $id));
    $rows = [];
    foreach ($c['items'] as $it) {
        $src = $it['ref'] ? trim($it['ref']['title'] . ($it['ref']['meta'] ? ' · ' . $it['ref']['meta'] : '')) : '';
        $w = ['original' => 3, 'derived' => 2, 'authored' => 1][$it['quality']] ?? ($it['evidence'] === 'direct' ? 3 : 2);
        $rows[] = ['part' => $it['kind'], 'text' => mb_substr($it['text'], 0, 400), 'source' => mb_substr($src, 0, 200), 'weight' => in_array($it['kind'], ['for', 'against'], true) ? $w : '', 'answer' => '', 'note' => mb_substr($it['resolution'], 0, 300)];
    }
    $who = trim((string) ($c['person']['name'] ?? $c['person']['title'] ?? ''));
    return ['rows' => $rows, 'question' => $c['question'], 'conclusion' => $c['conclusion'], 'certainty' => $c['certainty'], 'person' => $who];
}

function dlc_hyp(PDO $pdo, int $id): array
{
    if (!function_exists('hypothesis_compare_data')) { require_once __DIR__ . '/hypothesis_compare.php'; }
    $d = hypothesis_compare_data($pdo, $id);
    $rows = []; $chosen = '';
    foreach ($d['options'] as $op) {
        $label = mb_substr(trim($op['label'] !== '' ? $op['label'] : ($op['value'] ?: $op['value_text'])) ?: 'Réponse', 0, 80);
        if ($op['chosen']) { $chosen = $label; }
        $rows[] = ['part' => 'answer', 'text' => $label, 'source' => '', 'weight' => '', 'answer' => $label, 'note' => ''];
        foreach ($op['proofs'] as $p) {
            $rows[] = ['part' => $p['stance'] === 'against' ? 'against' : 'for', 'text' => mb_substr($p['note'] !== '' ? $p['note'] : $p['title'], 0, 400), 'source' => mb_substr($p['note'] !== '' ? $p['title'] : ($p['ref_kind'] !== '' ? (string) $p['meta'] : ''), 0, 200),
                'weight' => (int) $p['weight'], 'answer' => $label, 'note' => ''];
        }
    }
    $h = $d['hypothesis'];
    return ['rows' => $rows, 'question' => trim($h['title'] . ($h['statement'] !== '' ? ' — ' . $h['statement'] : '')), 'conclusion' => $chosen,
        'certainty' => $chosen !== '' ? 'probable' : 'tocheck', 'person' => (string) $d['person']['title']];
}

/* ═════════ 🌿 L'arbre de mots des actes ═════════ */
/** un mot sans accents ni capitales (pour comparer) */
function dlc_fold(string $s): string
{
    $s = mb_strtolower($s);
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'û' => 'u', 'ù' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'œ' => 'oe', 'æ' => 'ae', '’' => "'"]);
    return $s;
}

/** les mots d'un texte (lettres, chiffres, apostrophes, traits d'union) et les points qui coupent une phrase */
function dlc_tokens(string $s): array
{
    preg_match_all("/[\\p{L}\\p{N}][\\p{L}\\p{N}'’\\-]*|[.;:!?]/u", $s, $m);
    return $m[0] ?? [];
}

function dlc_words(PDO $pdo, array $q): array
{
    $o = dgo_request();
    $root = trim(mb_substr((string) ($q['root'] ?? ''), 0, 60));
    $rt = array_map('dlc_fold', array_values(array_filter(dlc_tokens($root), static fn($t) => !preg_match('/^[.;:!?]$/', $t))));
    if (!$rt) { dgo_bad('Écris le mot de départ (par exemple « fils de »).'); }
    $before = ($q['dir'] ?? '') === 'before'; $depth = dlc_int($q, 'depth', 5, 1, 8);
    $place = dlc_fold(trim(mb_substr((string) ($q['place'] ?? ''), 0, 60)));
    $kinds = array_values(array_filter(explode(',', (string) ($q['kinds'] ?? '')), static fn($k) => preg_match('/^[a-z]{2,20}$/', $k) === 1));
    $keep = dlc_keep($pdo, $q);
    // les médias de chaque personne (directement, ou par un de ses événements), pour le groupe de personnes
    $mediaOk = null;
    if ($keep !== null) {
        $mediaOk = [];
        foreach ($pdo->query("SELECT ml.media_id, ml.entity_type, ml.entity_id, e.person_id, f.partner1_id, f.partner2_id FROM media_links ml LEFT JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id
            LEFT JOIN families f ON f.id = CASE WHEN ml.entity_type='family' THEN ml.entity_id ELSE e.family_id END") as $r) {
            $who = $r['entity_type'] === 'person' ? [(int) $r['entity_id']] : [(int) $r['person_id'], (int) $r['partner1_id'], (int) $r['partner2_id']];
            foreach ($who as $pid) { if ($pid && isset($keep[$pid])) { $mediaOk[(int) $r['media_id']] = true; } }
        }
    }
    $docs = []; // [texte, lieu, année, titre, sorte]
    foreach ($pdo->query("SELECT id, COALESCE(title,'') AS title, COALESCE(transcription,'') AS body, COALESCE(date_text,'') AS d FROM media WHERE TRIM(COALESCE(transcription,''))<>'' LIMIT 20000") as $m) {
        if ($mediaOk !== null && !isset($mediaOk[(int) $m['id']])) { continue; }
        if ($kinds && !in_array('media', $kinds, true)) { continue; }
        $docs[] = [(string) $m['body'], '', dlc_year((string) $m['d']), (string) $m['title'], 'media'];
    }
    if ((bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='act_transcriptions'")->fetchColumn()) {
        foreach ($pdo->query("SELECT id, title, kind, media_id, date_text, place, body FROM act_transcriptions WHERE TRIM(body)<>'' LIMIT 20000") as $t) {
            if ($mediaOk !== null && !isset($mediaOk[(int) $t['media_id']])) { continue; }
            if ($kinds && !in_array((string) $t['kind'], $kinds, true)) { continue; }
            $docs[] = [(string) $t['body'], (string) $t['place'], dlc_year((string) $t['date_text']), (string) $t['title'], (string) $t['kind']];
        }
    }
    $rows = []; $acts = 0; $n = count($rt);
    foreach ($docs as [$body, $pl, $yr, $title, $kind]) {
        if ($place !== '' && !str_contains(dlc_fold($pl . ' ' . $title . ' ' . mb_substr($body, 0, 400)), $place)) { continue; }
        if (($o['from'] !== null || $o['to'] !== null) && ($yr === null || ($o['from'] !== null && $yr < $o['from']) || ($o['to'] !== null && $yr > $o['to']))) { continue; }
        $tok = dlc_tokens(mb_substr($body, 0, 200000)); $f = array_map('dlc_fold', $tok); $hit = false;
        for ($i = 0, $L = count($tok); $i + $n <= $L && count($rows) < 4000; $i++) {
            if (array_slice($f, $i, $n) !== $rt) { continue; }
            $hit = true;
            if ($before) { $a = $i; while ($a > 0 && $i - $a < $depth && !preg_match('/^[.;:!?]$/', $tok[$a - 1])) { $a--; } $words = array_slice($tok, $a, $i - $a + $n); }
            else { $b = $i + $n; while ($b < $L && $b - $i - $n < $depth && !preg_match('/^[.;:!?]$/', $tok[$b])) { $b++; } $words = array_slice($tok, $i, $b - $i); }
            $rows[] = ['text' => mb_substr(implode(' ', $words), 0, 300), 'place' => mb_substr($pl, 0, 60), 'year' => $yr === null ? '' : (string) $yr, 'source' => mb_substr($title, 0, 80)];
        }
        if ($hit) { $acts++; }
    }
    return ['rows' => $rows, 'acts' => $acts, 'docs' => count($docs)];
}

function dlc_year(string $s): ?int
{
    return preg_match('/(?<!\d)(\d{4})(?!\d)/', $s, $m) ? (int) $m[1] : null;
}

/* ═════════ ⛪ Les zones des paroisses ═════════ */
const DLC_TAGS = ['births' => ['BIRT', 'CHR', 'BAPM'], 'baptisms' => ['CHR', 'BAPM'], 'deaths' => ['DEAT', 'BURI'], 'burials' => ['BURI'], 'marriages' => ['MARR', 'MRCI', 'MRRE', 'MARB', 'MARC'],
    'all' => ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'MARR', 'MRCI', 'MRRE', 'MARB', 'MARC']];

function dlc_parishes(PDO $pdo, array $q): array
{
    $o = dgo_request();
    $what = (string) ($q['what2'] ?? $q['count'] ?? 'births');
    if (!in_array($what, ['births', 'baptisms', 'deaths', 'burials', 'marriages', 'all', 'people', 'sourced', 'events'], true)) { $what = 'all'; }
    $from = $o['from'] ?? (isset($q['from']) && preg_match('/^-?\d{1,4}$/', (string) $q['from']) ? (int) $q['from'] : null);
    $to = $o['to'] ?? (isset($q['to']) && preg_match('/^-?\d{1,4}$/', (string) $q['to']) ? (int) $q['to'] : null);
    $keep = dlc_keep($pdo, $q);
    if (($q['ancestors'] ?? '') === '1') { $anc = array_fill_keys(array_values(dgn_sosa($pdo, dgn_root($pdo, 0), 30, 120000)), true); $keep = $keep === null ? $anc : array_intersect_key($keep, $anc); }
    $own = ($q['own'] ?? '1') !== '0';
    // les lieux et leur paroisse
    $pl = [];
    foreach ($pdo->query('SELECT id, COALESCE(name,\'\') AS name, COALESCE(county,\'\') AS county, latitude, longitude FROM places') as $r) {
        $pl[(int) $r['id']] = ['name' => trim((string) $r['name']), 'county' => trim((string) $r['county']), 'lat' => $r['latitude'] !== null ? (float) $r['latitude'] : null, 'lon' => $r['longitude'] !== null ? (float) $r['longitude'] : null];
    }
    $par = []; // lieu → [nom de la paroisse, lieu de l'église]
    if ((bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='place_parishes'")->fetchColumn()) {
        foreach ($pdo->query("SELECT place_id, parish_name, parish_place_id FROM place_parishes WHERE place_id IS NOT NULL AND TRIM(parish_name)<>'' ORDER BY id") as $r) {
            $par[(int) $r['place_id']] ??= [mb_substr(trim((string) $r['parish_name']), 0, 80), (int) $r['parish_place_id']];
        }
    }
    $sites = [];
    $siteOf = static function (int $placeId) use ($pl, $par, $own): ?string {
        if (isset($par[$placeId])) { [$name, $church] = $par[$placeId]; $at = $pl[$church] ?? null; if ($at && $at['lat'] !== null) { return 'l:' . $church; } $at = $pl[$placeId] ?? null; return $at && $at['lat'] !== null ? 'p:' . dlc_fold($name) . '|' . $placeId : null; } // l'église : une seule zone, quels que soient les lieux qui en dépendent
        if (!$own) { return null; }
        $p = $pl[$placeId] ?? null; return $p && $p['lat'] !== null && $p['name'] !== '' ? 'l:' . $placeId : null;
    };
    $add = static function (int $placeId, array $people) use (&$sites, $siteOf, $pl, $par, $keep, $what) {
        if (!$placeId) { return; }
        if ($keep !== null && !array_filter($people, static fn($p) => $p && isset($keep[$p]))) { return; }
        $k = $siteOf($placeId); if ($k === null) { return; }
        if (!isset($sites[$k])) {
            $at = $pl[(int) substr($k, 2)] ?? $pl[$placeId]; if (str_starts_with($k, 'p:')) { $at = $pl[$placeId]; }
            $sites[$k] = ['name' => $at['name'], 'county' => $at['county'], 'lat' => $at['lat'], 'lon' => $at['lon'], 'n' => 0, 'who' => [], 'places' => [], 'pname' => ''];
        }
        if (isset($par[$placeId]) && $sites[$k]['pname'] === '') { $sites[$k]['pname'] = $par[$placeId][0]; } // le nom de la paroisse l'emporte sur celui du lieu de l'église
        $sites[$k]['n']++; foreach ($people as $p) { if ($p) { $sites[$k]['who'][$p] = true; } }
        $nm = $pl[$placeId]['name'] ?? ''; if ($nm !== '' && count($sites[$k]['places']) < 12) { $sites[$k]['places'][$nm] = true; }
    };
    $tags = DLC_TAGS[$what] ?? DLC_TAGS['all'];
    $sourced = [];
    if ($what === 'sourced') { foreach ($pdo->query("SELECT DISTINCT entity_id FROM source_links WHERE entity_type='event'") as $r) { $sourced[(int) $r['entity_id']] = true; } foreach ($pdo->query("SELECT DISTINCT ml.entity_id FROM media_links ml WHERE ml.entity_type='event'") as $r) { $sourced[(int) $r['entity_id']] = true; } }
    $sql = "SELECT e.id, e.person_id, e.family_id, e.year, e.place_id, t.gedcom_tag AS tag, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id WHERE e.place_id IS NOT NULL";
    foreach ($pdo->query($sql) as $e) {
        if (!in_array($what, ['people', 'sourced', 'events'], true) && !in_array($e['tag'], $tags, true)) { continue; }
        if ($what === 'sourced' && !isset($sourced[(int) $e['id']])) { continue; }
        $y = $e['year'] !== null ? (int) $e['year'] : null;
        if (($from !== null || $to !== null) && ($y === null || ($from !== null && $y < $from) || ($to !== null && $y > $to))) { continue; }
        $add((int) $e['place_id'], $e['person_id'] ? [(int) $e['person_id']] : [(int) $e['partner1_id'], (int) $e['partner2_id']]);
    }
    $out = [];
    foreach ($sites as $s) {
        $n = $what === 'people' ? count($s['who']) : $s['n'];
        if ($n <= 0) { continue; }
        $out[] = ['name' => $s['pname'] !== '' ? $s['pname'] : $s['name'], 'county' => $s['county'], 'lat' => round((float) $s['lat'], 5), 'lon' => round((float) $s['lon'], 5), 'n' => $n, 'places' => array_keys($s['places'])];
    }
    usort($out, static fn($a, $b) => $b['n'] <=> $a['n'] ?: strcmp($a['name'], $b['name']));
    return ['sites' => array_slice($out, 0, 1500), 'what' => $what, 'mapped' => count($par)];
}

/* ═════════ ✳️ La carte en étoile : tous les liens d'un lieu ═════════ */
function dlc_star(PDO $pdo, array $q): array
{
    $hub = (int) ($q['place'] ?? 0);
    $s = $pdo->prepare('SELECT id, name, county, country, latitude, longitude FROM places WHERE id=?'); $s->execute([$hub]);
    $H = $s->fetch(PDO::FETCH_ASSOC); if (!$H) { dgo_bad('Choisis d’abord le village.'); }
    $links = array_values(array_intersect(explode(',', (string) ($q['links'] ?? 'in,out,emig')), ['in', 'out', 'emig'])); if (!$links) { $links = ['in', 'out', 'emig']; }
    $o = dgo_request();
    $keep = dlc_keep($pdo, $q);
    $P = dac_people($pdo); $M = dac_marriages($pdo);
    $places = [];
    foreach ($pdo->query('SELECT id, COALESCE(name,\'\') AS name, COALESCE(county,\'\') AS county, COALESCE(country,\'\') AS country, latitude, longitude FROM places') as $r) { $places[(int) $r['id']] = $r; }
    // le même village peut avoir plusieurs fiches de lieu (même nom, même département) : toutes comptent
    $same = static fn(int $id) => $id === $hub || (isset($places[$id]) && dlc_fold(trim((string) $places[$id]['name'])) === dlc_fold(trim((string) $H['name'])) && dlc_fold((string) $places[$id]['county']) === dlc_fold((string) $H['county']));
    $marr = []; foreach ($M as $m) { foreach ([$m['p1'], $m['p2']] as $p) { if ($p && $m['pl'] && (!isset($marr[$p]) || ($m['d'] && $marr[$p][1] && $m['d'][0] < $marr[$p][1][0]))) { $marr[$p] = [$m['pl'], $m['d']]; } } }
    $inYear = static fn(?array $d) => ($o['from'] === null && $o['to'] === null) || ($d && ($o['from'] === null || $d[0] >= $o['from']) && ($o['to'] === null || $d[0] <= $o['to']));
    $agg = [];
    $put = static function (string $kind, int $a, int $b) use (&$agg) { $k = $kind . ':' . $a . '>' . $b; $agg[$k] ??= ['kind' => $kind, 'a' => $a, 'b' => $b, 'n' => 0]; $agg[$k]['n']++; };
    foreach ($P as $id => $p) {
        if ($keep !== null && !isset($keep[$id])) { continue; }
        $bp = (int) $p['bp']; $dp = (int) $p['dp']; $mp = (int) ($marr[$id][0] ?? 0);
        if (in_array('in', $links, true) && $mp && $same($mp) && $bp && !$same($bp) && $inYear($marr[$id][1] ?? null)) { $put('in', $bp, $hub); }
        if ($bp && $same($bp) && $inYear($p['b'])) {
            $end = $dp && !$same($dp) ? $dp : ($mp && !$same($mp) ? $mp : 0);
            if (!$end) { continue; }
            $abroad = dlc_fold((string) ($places[$end]['country'] ?? '')) !== '' && dlc_fold((string) ($places[$end]['country'] ?? '')) !== dlc_fold((string) ($H['country'] ?: 'France'));
            if ($abroad && in_array('emig', $links, true)) { $put('emig', $hub, $end); }
            elseif (in_array('out', $links, true) && (!$abroad || !in_array('emig', $links, true))) { $put('out', $hub, $end); }
        }
    }
    $ids = []; foreach ($agg as $f) { $ids[$f['a']] = true; $ids[$f['b']] = true; }
    $pl = [];
    foreach (array_keys($ids) as $id) { $r = $places[$id] ?? null; if (!$r) { continue; } $pl[] = ['id' => $id, 'name' => trim((string) $r['name']) ?: 'Lieu sans nom', 'county' => (string) $r['county'], 'country' => (string) $r['country'], 'lat' => $r['latitude'] !== null ? (float) $r['latitude'] : null, 'lon' => $r['longitude'] !== null ? (float) $r['longitude'] : null]; }
    $flows = array_values($agg); usort($flows, static fn($a, $b) => $b['n'] <=> $a['n']);
    return ['hub' => ['id' => $hub, 'name' => trim((string) $H['name'])], 'flows' => array_slice($flows, 0, 500), 'places' => $pl];
}
