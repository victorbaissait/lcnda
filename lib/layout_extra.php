<?php
declare(strict_types=1);

/**
 * 📐 Mise en page — données en plus pour l'atelier (assets/js/heritage-layout.js, heritage-layout-facts.js) :
 *  - layout_tree_data   : l'arbre d'une personne (ascendance, descendance), pour l'objet dynamique « Arbre » ;
 *  - layout_source      : une source et ses citations, pour « Citer une source » (note de bas de page) ;
 *  - layout_check_data  : lieux écrits dans un texte → connus de la base ? sinon le plus proche ;
 *  - layout_index_terms : lieux et métiers de la base, pour les index des lieux et des métiers.
 * Lecture seule, requêtes préparées ; une table absente (ancienne base) donne une liste vide.
 */

/** Une personne pour une case de l'arbre */
function layout_tree_person(PDO $pdo, int $id): ?array
{
    static $cache = [];
    if ($id <= 0) { return null; }
    if (array_key_exists($id, $cache)) { return $cache[$id]; }
    $s = $pdo->prepare('SELECT id, first_name, middle_name, last_name, prefix, suffix, gender, is_private, portrait_media_id, COALESCE(occupation,\'\') AS occupation FROM persons WHERE id=?');
    $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { return $cache[$id] = null; }
    $ev = $pdo->prepare("SELECT et.gedcom_tag AS tag, e.date_text, e.year, COALESCE(pl.name,'') AS place FROM events e JOIN event_types et ON et.id=e.event_type_id
        LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? AND et.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY e.sort_date, e.id");
    $ev->execute([$id]);
    $birth = $death = null;
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        if (in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true) && (!$birth || $e['tag'] === 'BIRT' && $birth['tag'] !== 'BIRT')) { $birth = $e; }
        if (in_array($e['tag'], ['DEAT', 'BURI'], true) && (!$death || $e['tag'] === 'DEAT' && $death['tag'] !== 'DEAT')) { $death = $e; }
    }
    $photo = '';
    if ((int) $p['portrait_media_id'] > 0) {
        $m = $pdo->prepare("SELECT filename FROM media WHERE id=? AND media_type='image'"); $m->execute([(int) $p['portrait_media_id']]);
        $photo = (string) ($m->fetchColumn() ?: '');
    }
    if ($photo === '') {
        $m = $pdo->prepare("SELECT m.filename FROM media m JOIN media_links ml ON ml.media_id=m.id WHERE ml.entity_type='person' AND ml.entity_id=? AND m.media_type='image' AND COALESCE(m.filename,'')<>'' ORDER BY m.is_person_photo DESC, ml.position, m.id LIMIT 1");
        $m->execute([$id]);
        $photo = (string) ($m->fetchColumn() ?: '');
    }
    $private = (int) $p['is_private'] === 1;
    $yr = static fn(?array $e) => $e ? ((int) ($e['year'] ?? 0) ?: (preg_match('/\b(\d{4})\b/', (string) $e['date_text'], $mm) ? (int) $mm[1] : 0)) : 0;
    return $cache[$id] = [
        'id' => $id,
        'first' => $private ? '' : trim((string) $p['first_name'] . ' ' . (string) $p['middle_name']),
        'last' => $private ? 'Personne privée' : (string) $p['last_name'],
        'name' => $private ? 'Personne privée' : (full_name($p) ?: 'Personne sans nom'),
        'gender' => in_array($p['gender'], ['male', 'female'], true) ? $p['gender'] : 'unknown',
        'by' => $private ? 0 : $yr($birth), 'bd' => $private || !$birth ? '' : (string) $birth['date_text'], 'bp' => $private || !$birth ? '' : (string) $birth['place'],
        'dy' => $private ? 0 : $yr($death), 'dd' => $private || !$death ? '' : (string) $death['date_text'], 'dp' => $private || !$death ? '' : (string) $death['place'],
        'job' => $private ? '' : (string) $p['occupation'],
        'photo' => $private || !preg_match('/^[A-Za-z0-9._%\-\/]{1,240}$/', $photo) ? '' : $photo,
    ];
}

/** Les parents d'une personne : [père, mère] (ids, 0 si inconnu) */
function layout_tree_parents(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? ORDER BY CASE WHEN fc.relation_to_partner1=\'biological\' THEN 0 ELSE 1 END, fc.id LIMIT 1');
    $s->execute([$id]);
    $f = $s->fetch(PDO::FETCH_NUM);
    if (!$f) { return [0, 0]; }
    $a = (int) $f[0]; $b = (int) $f[1];
    // le père d'abord (partenaire masculin), comme dans un arbre
    $g = $pdo->prepare('SELECT gender FROM persons WHERE id=?');
    $gender = static function (int $x) use ($g): string { if (!$x) { return ''; } $g->execute([$x]); return (string) $g->fetchColumn(); };
    if ($gender($a) === 'female' || ($gender($a) !== 'male' && $gender($b) === 'male')) { [$a, $b] = [$b, $a]; }
    return [$a, $b];
}

/** GET layout_tree_data&root_id=&mode=asc|desc|both&gens= */
function layout_tree_data(PDO $pdo, array $q): array
{
    $root = safe_int($q['root_id'] ?? 0);
    $mode = in_array($q['mode'] ?? '', ['asc', 'desc', 'both'], true) ? $q['mode'] : 'asc';
    $gens = max(1, min(10, safe_int($q['gens'] ?? 4) ?: 4));
    $me = layout_tree_person($pdo, $root);
    if (!$me) { json_response(['error' => 'Personne introuvable.'], 404); }
    $out = ['root' => $me, 'mode' => $mode, 'gens' => $gens, 'ancestors' => [], 'descendants' => null];
    if ($mode !== 'desc') {
        // numéros Sosa : 1 la personne, 2n le père, 2n+1 la mère
        $queue = [[1, $root]]; $count = 0;
        while ($queue && $count < 1100) {
            [$n, $id] = array_shift($queue);
            $out['ancestors'][(string) $n] = layout_tree_person($pdo, $id); $count++;
            if ((int) floor(log($n, 2)) + 1 >= $gens) { continue; }
            [$fa, $mo] = layout_tree_parents($pdo, $id);
            if ($fa) { $queue[] = [$n * 2, $fa]; }
            if ($mo) { $queue[] = [$n * 2 + 1, $mo]; }
        }
        unset($out['ancestors']['1']);
    }
    if ($mode !== 'asc') {
        $budget = 400;
        $down = function (int $id, int $g, array $seen) use ($pdo, $gens, &$down, &$budget): array {
            $node = ['p' => layout_tree_person($pdo, $id), 'families' => []];
            if ($g >= $gens || $budget <= 0 || in_array($id, $seen, true)) { return $node; }
            $seen[] = $id;
            $fs = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=? ORDER BY id');
            $fs->execute([$id, $id]);
            foreach ($fs->fetchAll(PDO::FETCH_ASSOC) as $f) {
                $other = (int) $f['partner1_id'] === $id ? (int) $f['partner2_id'] : (int) $f['partner1_id'];
                $ch = $pdo->prepare('SELECT child_id FROM family_children WHERE family_id=? ORDER BY position, id');
                $ch->execute([(int) $f['id']]);
                $kids = [];
                foreach ($ch->fetchAll(PDO::FETCH_COLUMN) as $cid) {
                    if (--$budget < 0) { break; }
                    $kids[] = $down((int) $cid, $g + 1, $seen);
                }
                $node['families'][] = ['spouse' => $other ? layout_tree_person($pdo, $other) : null, 'children' => $kids];
            }
            return $node;
        };
        $out['descendants'] = $down($root, 1, []);
    }
    return $out;
}

/** GET layout_source&id= : la source (dépôt, titre, cote…) et ses citations déjà notées, pour une note de bas de page */
function layout_source(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, title, author, agency, publication, url FROM sources WHERE id=?');
    $s->execute([$id]);
    $src = $s->fetch(PDO::FETCH_ASSOC);
    if (!$src) { json_response(['error' => 'Source introuvable.'], 404); }
    $cites = [];
    try {
        $c = $pdo->prepare("SELECT page, citation_json FROM source_links WHERE source_record_id=? AND (COALESCE(page,'')<>'' OR COALESCE(citation_json,'')<>'') ORDER BY id DESC LIMIT 12");
        $c->execute([$id]);
        foreach ($c->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $j = json_decode((string) $r['citation_json'], true);
            $cites[] = ['page' => (string) $r['page'], 'cote' => is_array($j) ? (string) ($j['cote'] ?? '') : '', 'folio' => is_array($j) ? (string) ($j['folio'] ?? $j['view'] ?? '') : '', 'date' => is_array($j) ? (string) ($j['date'] ?? '') : ''];
        }
    } catch (Throwable) { $cites = []; }
    // la cote est souvent écrite dans « publication » (« cote 3 E 123 »)
    $cote = preg_match('/\bcote\s*[:.]?\s*(.+)$/iu', (string) $src['publication'], $m) ? trim($m[1]) : '';
    return ['source' => ['id' => (int) $src['id'], 'title' => (string) $src['title'], 'author' => (string) $src['author'], 'agency' => (string) $src['agency'],
        'publication' => (string) $src['publication'], 'url' => (string) $src['url'], 'cote' => $cote], 'citations' => $cites];
}

/** Clé de comparaison d'un nom de lieu : sans accents, minuscules, tirets et apostrophes en espaces, « saint » abrégé */
function layout_place_key(string $s): string
{
    $k = picker_fold($s);
    $k = (string) preg_replace('/\b(st)\b/', 'saint', $k);
    $k = (string) preg_replace('/\b(ste)\b/', 'sainte', $k);
    return trim((string) preg_replace('/\s+/', ' ', $k));
}

/** GET layout_check_data&places=Tulle|Tull|… : chaque lieu, connu de la base ? sinon le plus proche (au plus 60 noms) */
function layout_check_data(PDO $pdo, array $q): array
{
    $names = array_slice(array_values(array_unique(array_filter(array_map(static fn($x) => trim(mb_substr((string) $x, 0, 80)), explode('|', (string) ($q['places'] ?? '')))))), 0, 60);
    if (!$names) { return ['places' => new stdClass()]; }
    // les lieux de la base ; ceux qui servent à des événements passent devant pour les propositions
    $used = [];
    foreach ($pdo->query('SELECT DISTINCT place_id FROM events WHERE place_id IS NOT NULL') as $r) { $used[(int) $r['place_id']] = true; }
    $index = []; $byKey = [];
    foreach ($pdo->query("SELECT id, name, county, country, COALESCE(alternate_names,'') AS alt, COALESCE(population,0) AS pop FROM places WHERE COALESCE(name,'')<>''") as $r) {
        $label = trim((string) $r['name']) . ($r['county'] !== '' ? ' (' . $r['county'] . ')' : '');
        $row = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'label' => $label, 'used' => isset($used[(int) $r['id']]), 'pop' => (int) $r['pop']];
        $keys = [layout_place_key((string) $r['name'])];
        foreach (preg_split('/[,;|]/', (string) $r['alt']) ?: [] as $a) { if (trim($a) !== '') { $keys[] = layout_place_key($a); } }
        foreach ($keys as $k) {
            if ($k === '') { continue; }
            if (!isset($byKey[$k]) || ($row['used'] && !$byKey[$k]['used'])) { $byKey[$k] = $row; }
            $index[substr($k, 0, 1)][] = [$k, $row];
        }
    }
    $out = [];
    foreach ($names as $n) {
        $k = layout_place_key($n);
        if ($k === '') { continue; }
        if (isset($byKey[$k])) { $out[$n] = ['known' => true, 'id' => $byKey[$k]['id']]; continue; }
        // le plus proche : même première lettre, longueur voisine, distance d'édition la plus petite (au plus 1 lettre sur 3)
        $best = null; $bestD = 99;
        foreach ($index[substr($k, 0, 1)] ?? [] as [$kk, $row]) {
            if (abs(strlen($kk) - strlen($k)) > 3) { continue; }
            $d = levenshtein($k, $kk);
            if ($d < $bestD || ($d === $bestD && $best && (($row['used'] && !$best['used']) || ($row['used'] === $best['used'] && $row['pop'] > $best['pop'])))) { $bestD = $d; $best = $row; }
        }
        $out[$n] = ['known' => false, 'near' => $best && $bestD <= max(1, (int) round(strlen($k) / 3)) ? ['id' => $best['id'], 'name' => $best['name'], 'label' => $best['label']] : null];
    }
    return ['places' => $out ?: new stdClass()];
}

/** GET layout_index_terms : les lieux des événements et les métiers (fiche ou événement « profession »), pour les index */
function layout_index_terms(PDO $pdo): array
{
    $places = [];
    foreach ($pdo->query("SELECT DISTINCT pl.name FROM events e JOIN places pl ON pl.id=e.place_id WHERE COALESCE(pl.name,'')<>'' LIMIT 5000") as $r) { $places[] = (string) $r['name']; }
    $jobs = [];
    foreach ($pdo->query("SELECT DISTINCT trim(occupation) AS o FROM persons WHERE trim(COALESCE(occupation,''))<>'' LIMIT 5000") as $r) { $jobs[] = (string) $r['o']; }
    try {
        foreach ($pdo->query("SELECT DISTINCT trim(CASE WHEN COALESCE(e.title,'')<>'' THEN e.title ELSE e.description END) AS o FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE (t.gedcom_tag='OCCU' OR LOWER(t.label) LIKE '%profes%' OR LOWER(t.label) LIKE '%m%tier%') LIMIT 5000") as $r) { if (trim((string) $r['o']) !== '') { $jobs[] = trim((string) $r['o']); } }
    } catch (Throwable) {}
    // un métier « laboureur, propriétaire » compte pour deux
    $split = [];
    foreach ($jobs as $j) { foreach (preg_split('/\s*[,;\/]\s*|\s+et\s+/u', $j) ?: [] as $x) { $x = trim($x, " .\t"); if (mb_strlen($x) >= 3 && mb_strlen($x) <= 60) { $split[mb_strtolower($x)] = $x; } } }
    return ['places' => array_values(array_unique($places)), 'jobs' => array_values($split)];
}
