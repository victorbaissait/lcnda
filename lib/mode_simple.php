<?php
declare(strict_types=1);

/**
 * 🧓 Mode simple (mode grand-parent) : les données, en lecture seule (GET mode_simple_data).
 *
 * Une seule lecture au moment d'ouvrir le mode (assets/js/app-mode-simple.js) : les personnes (prénom, nom, sexe,
 * vivante ou non, naissance, baptême, décès, métier, portrait), les unions (mariage et enfants dans l'ordre) et les
 * images (photos et documents, personnes rattachées et zones des visages). Rien n'est écrit, aucune table n'est créée.
 *
 * Vivants : « vivante » déclarée, ou probablement vivante (ni décès ni inhumation, née il y a moins de 100 ans), comme
 * pour l'export « pour partager » (gedcom_share_hidden). Les fiches confidentielles (is_private) sont signalées : le mode
 * les montre comme des vivants cachés.
 */

/** [année, mois|null, jour|null, environ] lue dans une date écrite comme dans un acte (cal_parse_date, lib/calendars.php) */
function ms_date(?string $text, $year = null): ?array
{
    $t = trim((string) $text);
    $d = $t !== '' && function_exists('cal_parse_date') ? cal_parse_date($t) : null;
    if ($d) { return ['y' => (int) $d[0], 'm' => $d[1] ? (int) $d[1] : 0, 'd' => $d[2] ? (int) $d[2] : 0, 'about' => (bool) $d[3]]; }
    if ($year !== null && (int) $year > 0) { return ['y' => (int) $year, 'm' => 0, 'd' => 0, 'about' => $t !== '' && !preg_match('/\b\d{4}\b/', $t)]; }
    return null;
}

/** un nom de lieu court : la commune (et le pays s'il n'est pas la France) */
function ms_place(?string $name, ?string $country): string
{
    $n = trim((string) $name); $c = trim((string) $country);
    if ($n === '') { return ''; }
    return $c !== '' && !preg_match('/^(france|fr)$/i', $c) && mb_strtolower($c) !== mb_strtolower($n) ? $n . ' (' . $c . ')' : $n;
}

function ms_media_src(?string $filename, ?string $thumb): array
{
    $f = trim((string) $filename); $t = trim((string) $thumb);
    return ['src' => $f !== '' ? 'media/' . rawurlencode($f) : '', 'thumb' => $t !== '' ? 'media/' . rawurlencode($t) : ($f !== '' ? 'media/' . rawurlencode($f) : '')];
}

function mode_simple_data(PDO $pdo): array
{
    $now = (int) date('Y');
    $persons = [];
    $cols = array_flip(array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(PDO::FETCH_ASSOC), 'name'));
    $kind = isset($cols['kind']) ? "COALESCE(p.kind,'')" : "''";
    $rows = $pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, p.living_status, COALESCE(p.is_private,0) AS is_private, p.portrait_media_id,
            COALESCE(p.occupation,'') AS occupation, COALESCE(p.is_start,0) AS is_start, {$kind} AS kind,
            m.filename AS pf, m.thumbnail AS pt
        FROM persons p LEFT JOIN media m ON m.id=p.portrait_media_id ORDER BY p.id")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) {
        if ($r['kind'] === 'animal') { continue; }
        $src = ms_media_src($r['pf'], $r['pt']);
        $g = (string) $r['gender'];
        $persons[(int) $r['id']] = [
            'id' => (int) $r['id'], 'first' => trim((string) $r['first_name']), 'last' => trim((string) $r['last_name']),
            'g' => $g === 'male' ? 'm' : ($g === 'female' ? 'f' : 'u'), 'status' => (string) $r['living_status'],
            'priv' => (int) $r['is_private'] ? 1 : 0, 'start' => (int) $r['is_start'] ? 1 : 0,
            'job' => trim((string) $r['occupation']), 'photo' => $r['portrait_media_id'] ? $src['thumb'] : '',
            'birth' => null, 'bapt' => null, 'death' => null, 'burial' => null,
        ];
    }
    // naissance, baptême, décès, inhumation, métier : le premier de chaque sorte (BIRT et DEAT d'abord)
    $ev = $pdo->query("SELECT e.person_id, e.date_text, e.year, e.title, e.description, t.gedcom_tag AS tag, pl.name AS place, pl.country
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI','CREM','OCCU') ORDER BY e.person_id, COALESCE(e.year, 9999), e.id");
    foreach ($ev as $e) {
        $id = (int) $e['person_id']; if (!isset($persons[$id])) { continue; }
        $slot = match ($e['tag']) { 'BIRT' => 'birth', 'CHR', 'BAPM' => 'bapt', 'DEAT' => 'death', 'BURI', 'CREM' => 'burial', default => 'job' };
        if ($slot === 'job') {
            if ($persons[$id]['job'] === '') { $persons[$id]['job'] = trim((string) ($e['title'] ?: $e['description'])); }
            continue;
        }
        if ($persons[$id][$slot] !== null) { continue; }
        $persons[$id][$slot] = ['date' => ms_date($e['date_text'], $e['year']), 'place' => ms_place($e['place'], $e['country'])];
        if ($slot === 'death' || $slot === 'burial') { $persons[$id]['dead'] = 1; }
    }
    foreach ($persons as &$p) {
        $by = $p['birth']['date']['y'] ?? $p['bapt']['date']['y'] ?? null;
        $dead = !empty($p['dead']) || $p['status'] === 'deceased';
        $p['living'] = !$dead && ($p['status'] === 'living' || ($by !== null && $by >= $now - 100)) ? 1 : 0;
        if ($p['death'] === null && $p['burial'] !== null) { $p['death'] = $p['burial']; }
        unset($p['dead'], $p['burial'], $p['status']);
        $p['job'] = mb_substr($p['job'], 0, 80);
    }
    unset($p);

    // unions : les deux conjoints, le mariage, les enfants dans l'ordre de la fiche
    $families = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families ORDER BY id') as $f) {
        $a = (int) $f['partner1_id']; $b = (int) $f['partner2_id'];
        $families[(int) $f['id']] = ['id' => (int) $f['id'], 'a' => isset($persons[$a]) ? $a : 0, 'b' => isset($persons[$b]) ? $b : 0, 'marr' => null, 'c' => []];
    }
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children ORDER BY family_id, COALESCE(position, 0), id') as $c) {
        $fid = (int) $c['family_id']; $cid = (int) $c['child_id'];
        if (isset($families[$fid], $persons[$cid])) { $families[$fid]['c'][] = $cid; }
    }
    $marr = $pdo->query("SELECT e.family_id, e.date_text, e.year, pl.name AS place, pl.country FROM events e JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN places pl ON pl.id=e.place_id WHERE e.family_id IS NOT NULL AND t.gedcom_tag IN ('MARR','MARC','MARB') ORDER BY CASE t.gedcom_tag WHEN 'MARR' THEN 0 ELSE 1 END, COALESCE(e.year, 9999), e.id");
    foreach ($marr as $m) {
        $fid = (int) $m['family_id'];
        if (isset($families[$fid]) && $families[$fid]['marr'] === null) { $families[$fid]['marr'] = ['date' => ms_date($m['date_text'], $m['year']), 'place' => ms_place($m['place'], $m['country'])]; }
    }
    $families = array_values(array_filter($families, static fn($f) => $f['a'] || $f['b']));

    // images : photos et documents, avec les personnes rattachées et les zones des visages
    if (function_exists('picker_register')) { picker_register($pdo); }
    $sort = function_exists('picker_media_sort_sql') && function_exists('picker_register') ? picker_media_sort_sql($pdo) : "'photo'";
    $media = [];
    $mrows = $pdo->query("SELECT m.id, m.title, m.filename, m.thumbnail, m.date_text, m.description, {$sort} AS sort,
            (SELECT pl.name FROM media_links ml JOIN events e ON e.id=ml.entity_id LEFT JOIN places pl ON pl.id=e.place_id WHERE ml.media_id=m.id AND ml.entity_type='event' AND pl.name IS NOT NULL ORDER BY e.year IS NULL, e.year LIMIT 1) AS place,
            (SELECT e.year FROM media_links ml JOIN events e ON e.id=ml.entity_id WHERE ml.media_id=m.id AND ml.entity_type='event' AND e.year IS NOT NULL ORDER BY e.year LIMIT 1) AS ev_year
        FROM media m WHERE lower(COALESCE(m.media_type,''))='image' AND trim(COALESCE(m.filename,''))<>'' ORDER BY m.id")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($mrows as $r) {
        $src = ms_media_src($r['filename'], $r['thumbnail']);
        $media[(int) $r['id']] = ['id' => (int) $r['id'], 'title' => trim((string) $r['title']), 'date' => ms_date($r['date_text'], $r['ev_year']),
            'place' => trim((string) $r['place']), 'doc' => $r['sort'] === 'document' ? 1 : 0, 'src' => $src['src'], 'thumb' => $src['thumb'],
            'desc' => mb_substr(trim((string) $r['description']), 0, 400), 'people' => [], 'faces' => []];
    }
    foreach ($pdo->query("SELECT media_id, entity_id FROM media_links WHERE entity_type='person' ORDER BY media_id, COALESCE(position, 0), id") as $l) {
        $mid = (int) $l['media_id']; $pid = (int) $l['entity_id'];
        if (isset($media[$mid], $persons[$pid]) && !in_array($pid, $media[$mid]['people'], true)) { $media[$mid]['people'][] = $pid; }
    }
    $tagCols = array_flip(array_column($pdo->query('PRAGMA table_info(media_tags)')->fetchAll(PDO::FETCH_ASSOC), 'name'));
    if ($tagCols) {
        $tt = isset($tagCols['tag_type']) ? "COALESCE(tag_type,'person')='person'" : '1=1';
        foreach ($pdo->query("SELECT media_id, person_id, x, y, w, h FROM media_tags WHERE {$tt} AND person_id IS NOT NULL ORDER BY media_id, x, id") as $t) {
            $mid = (int) $t['media_id']; $pid = (int) $t['person_id'];
            if (!isset($media[$mid], $persons[$pid])) { continue; }
            $media[$mid]['faces'][] = ['p' => $pid, 'x' => round((float) $t['x'], 2), 'y' => round((float) $t['y'], 2), 'w' => round((float) $t['w'], 2), 'h' => round((float) $t['h'], 2)];
            if (!in_array($pid, $media[$mid]['people'], true)) { $media[$mid]['people'][] = $pid; }
        }
    }
    // un portrait de fiche sans autre lien reste une photo de la personne
    foreach ($rows as $r) {
        $pid = (int) $r['id']; $mid = (int) $r['portrait_media_id'];
        if ($mid && isset($media[$mid], $persons[$pid]) && !in_array($pid, $media[$mid]['people'], true)) { $media[$mid]['people'][] = $pid; }
    }
    // films et sons (les gros boutons « 🎬 Un film » et « 🎵 Un son ») : seulement leur titre, leur fichier et les personnes rattachées
    $av = [];
    foreach ($pdo->query("SELECT id, title, filename, media_type, date_text FROM media WHERE lower(COALESCE(media_type,'')) IN ('video','audio') AND trim(COALESCE(filename,''))<>'' ORDER BY id") as $r) {
        $src = ms_media_src($r['filename'], null);
        $av[(int) $r['id']] = ['id' => (int) $r['id'], 'title' => trim((string) $r['title']), 'type' => strtolower((string) $r['media_type']), 'src' => $src['src'], 'date' => ms_date($r['date_text']), 'people' => []];
    }
    if ($av) {
        foreach ($pdo->query("SELECT media_id, entity_id FROM media_links WHERE entity_type='person' ORDER BY media_id, id") as $l) {
            $mid = (int) $l['media_id']; $pid = (int) $l['entity_id'];
            if (isset($av[$mid], $persons[$pid]) && !in_array($pid, $av[$mid]['people'], true)) { $av[$mid]['people'][] = $pid; }
        }
    }
    $start = 0;
    foreach ($persons as $p) { if ($p['start']) { $start = $p['id']; break; } }
    return ['persons' => array_values($persons), 'families' => $families, 'media' => array_values($media), 'av' => array_values($av), 'start' => $start, 'today' => date('Y-m-d')];
}
