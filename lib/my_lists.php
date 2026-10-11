<?php
declare(strict_types=1);

/**
 * 📋 Mes listes (Maintenance → Mes listes, structure n°15) : des listes faites sur mesure.
 *  - ce qu'on liste : des événements (ex. les divorces) ou des personnes ;
 *  - des critères qu'on combine (période, type d'événement, lieu, nom, métier, étiquette, sexe, ancêtres Sosa,
 *    parents inconnus…), tous ensemble (ET) ou l'un ou l'autre (OU) ;
 *  - les colonnes reprises des fiches, et des colonnes à soi (texte, menu déroulant, case à cocher, date, nombre)
 *    remplies ligne par ligne (ex. « à demander au salon », « fait ») ;
 *  - des personnes ajoutées ou retirées à la main.
 *  - ou des lignes écrites soi-même, sans rien venir de la base (« free » : stands d'un salon, courses aux archives…),
 *    avec seulement ses propres colonnes (dont « lien internet » et « personne de la base », facultative).
 * definition_json = {match: all|any, rules: [{field, value, from, to, values}], columns: [...], custom: [{key, label, type, options}]}
 */

const LIST_EVENT_COLUMNS = ['date' => 'Date', 'type' => 'Événement', 'who' => 'Personne(s)', 'place' => 'Lieu', 'description' => 'Description', 'age' => 'Âge', 'sources' => 'Sources'];
const LIST_PERSON_COLUMNS = ['name' => 'Personne', 'birth' => 'Naissance', 'birthplace' => 'Lieu de naissance', 'death' => 'Décès', 'deathplace' => 'Lieu de décès', 'age' => 'Âge au décès', 'occupation' => 'Métier', 'gender' => 'Sexe', 'parents' => 'Parents', 'sosa' => 'Sosa', 'sources' => 'Sources', 'labels' => 'Étiquettes'];
const LIST_CUSTOM_TYPES = ['text', 'select', 'checkbox', 'date', 'number', 'url', 'person'];

function my_lists(PDO $pdo): array
{
    $rows = $pdo->query('SELECT * FROM custom_lists ORDER BY position, id')->fetchAll();
    foreach ($rows as &$r) { $r['definition'] = json_decode((string) $r['definition_json'], true) ?: []; unset($r['definition_json']); }
    unset($r);
    return with_labels($pdo, 'custom_list', $rows);
}

function my_list_clean_definition(array $d, string $source): array
{
    $fields = ['event_type', 'year', 'death_year', 'place', 'any_place', 'last_name', 'first_name', 'occupation', 'gender', 'label', 'sosa', 'no_parents', 'no_source', 'text'];
    $rules = [];
    foreach (is_array($d['rules'] ?? null) ? $d['rules'] : [] as $r) {
        if (!is_array($r) || !in_array($r['field'] ?? '', $fields, true)) { continue; }
        $rules[] = ['field' => $r['field'], 'value' => mb_substr(safe_text($r['value'] ?? ''), 0, 200), 'from' => safe_int($r['from'] ?? 0) ?: null, 'to' => safe_int($r['to'] ?? 0) ?: null,
            'values' => array_values(array_filter(array_map('intval', is_array($r['values'] ?? null) ? $r['values'] : []))), 'not' => !empty($r['not'])];
    }
    if ($source === 'free') { $rules = []; }
    $allowed = $source === 'free' ? [] : array_keys($source === 'events' ? LIST_EVENT_COLUMNS : LIST_PERSON_COLUMNS);
    $columns = $source === 'free' ? [] : (array_values(array_intersect(is_array($d['columns'] ?? null) ? $d['columns'] : [], $allowed)) ?: array_slice($allowed, 0, 4));
    $custom = [];
    foreach (is_array($d['custom'] ?? null) ? $d['custom'] : [] as $c) {
        if (!is_array($c) || !in_array($c['type'] ?? '', LIST_CUSTOM_TYPES, true)) { continue; }
        $custom[] = ['key' => preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($c['key'] ?? ''))) ?: 'c' . bin2hex(random_bytes(3)), 'label' => mb_substr(safe_text($c['label'] ?? ''), 0, 60) ?: 'Colonne',
            'type' => $c['type'], 'options' => array_values(array_filter(array_map(static fn($o) => mb_substr(safe_text($o), 0, 60), is_array($c['options'] ?? null) ? $c['options'] : [])))];
    }
    return ['match' => ($d['match'] ?? '') === 'any' ? 'any' : 'all', 'rules' => $rules, 'columns' => $columns, 'custom' => $custom,
        'sort' => in_array($d['sort'] ?? '', ['date', 'name', 'place'], true) ? $d['sort'] : ($source === 'events' ? 'date' : 'name')];
}

function save_my_list(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 80);
    if ($name === '') { throw new RuntimeException('Donne un nom à la liste.'); }
    $source = in_array($data['source'] ?? '', ['events', 'persons', 'free'], true) ? $data['source'] : 'persons';
    $def = my_list_clean_definition(is_array($data['definition'] ?? null) ? $data['definition'] : [], $source);
    if ($source === 'free' && !$def['custom']) { throw new RuntimeException('Ajoute au moins une colonne à remplir.'); }
    $vals = [$name, mb_substr(safe_text($data['icon'] ?? '📋'), 0, 16) ?: '📋', h_long($data, 'description', 2000), $source, json_encode($def, JSON_UNESCAPED_UNICODE)];
    if ($id) { $pdo->prepare('UPDATE custom_lists SET name=?, icon=?, description=?, source=?, definition_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]); }
    else { $pdo->prepare('INSERT INTO custom_lists(name, icon, description, source, definition_json, position) VALUES(?,?,?,?,?,(SELECT COALESCE(max(position),0)+1 FROM custom_lists))')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    return ['id' => $id];
}

function delete_my_list(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $pdo->prepare('DELETE FROM custom_list_rows WHERE list_id=?')->execute([$id]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='custom_list' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM custom_lists WHERE id=?')->execute([$id]);
    return ['ok' => true];
}

/** Une case d'une colonne à soi, ou l'ajout / le retrait d'une ligne à la main. */
function save_my_list_row(PDO $pdo, array $data): array
{
    $listId = safe_int($data['list_id'] ?? 0);
    $key = safe_text($data['row_key'] ?? '');
    $exists = $pdo->prepare('SELECT 1 FROM custom_lists WHERE id=?'); $exists->execute([$listId]);
    if (!$exists->fetchColumn()) { throw new RuntimeException('Liste introuvable.'); }
    if ($key === 'f:new') { // nouvelle ligne écrite à la main
        $n = (int) $pdo->query("SELECT COALESCE(max(CAST(substr(row_key,3) AS INTEGER)),0)+1 FROM custom_list_rows WHERE list_id=" . $listId . " AND row_key LIKE 'f:%'")->fetchColumn();
        $key = 'f:' . $n;
        $pdo->prepare("INSERT INTO custom_list_rows(list_id, row_key, included, data_json) VALUES(?,?,1,'{}')")->execute([$listId, $key]);
        if (!isset($data['field'])) { return ['ok' => true, 'row_key' => $key]; }
    }
    if (!preg_match('/^[pef]:\d+$/', $key)) { throw new RuntimeException('Ligne invalide.'); }
    $s = $pdo->prepare('SELECT * FROM custom_list_rows WHERE list_id=? AND row_key=?'); $s->execute([$listId, $key]);
    $row = $s->fetch() ?: ['included' => 0, 'data_json' => '{}'];
    $values = json_decode((string) $row['data_json'], true) ?: [];
    if (array_key_exists('included', $data)) { $row['included'] = max(-1, min(1, (int) $data['included'])); }
    if (isset($data['field'])) { $values[preg_replace('/[^a-z0-9_]/', '', strtolower((string) $data['field']))] = mb_substr(safe_text($data['value'] ?? ''), 0, 2000); }
    if (str_starts_with($key, 'f:') && (int) $row['included'] === -1) { // ligne écrite à la main supprimée
        $pdo->prepare('DELETE FROM custom_list_rows WHERE list_id=? AND row_key=?')->execute([$listId, $key]);
        return ['ok' => true];
    }
    $pdo->prepare('INSERT OR REPLACE INTO custom_list_rows(list_id, row_key, included, data_json) VALUES(?,?,?,?)')->execute([$listId, $key, (int) $row['included'], json_encode($values, JSON_UNESCAPED_UNICODE)]);
    return ['ok' => true, 'row_key' => $key];
}

/** Les numéros Sosa de la personne de départ (si l'application sait les calculer). */
function my_list_sosas(PDO $pdo): array
{
    if (!function_exists('sosa_positions') || !function_exists('dashboard_sosa_root')) { return []; }
    $root = dashboard_sosa_root($pdo);
    return $root ? (sosa_positions($pdo, (int) $root['id'])['personSosas'] ?? []) : [];
}

/** Calcule les lignes d'une liste. */
function my_list_rows(PDO $pdo, int $listId): array
{
    $s = $pdo->prepare('SELECT * FROM custom_lists WHERE id=?'); $s->execute([$listId]);
    $list = $s->fetch();
    if (!$list) { throw new RuntimeException('Liste introuvable.'); }
    $def = my_list_clean_definition(json_decode((string) $list['definition_json'], true) ?: [], (string) $list['source']);
    if ($list['source'] === 'free') { return my_list_free_rows($pdo, $list, $def); }
    $isEvents = $list['source'] === 'events';
    $sosas = (in_array('sosa', $def['columns'], true) || array_filter($def['rules'], static fn($r) => $r['field'] === 'sosa')) ? my_list_sosas($pdo) : [];
    $conds = []; $params = [];
    // Personnes concernées : celle de l'événement, ou les deux conjoints d'un événement de couple
    $personMatch = static fn(string $sqlOnPerson) => $isEvents
        ? "(EXISTS (SELECT 1 FROM persons x WHERE x.id IN (e.person_id, f.partner1_id, f.partner2_id) AND {$sqlOnPerson}))"
        : "(EXISTS (SELECT 1 FROM persons x WHERE x.id = p.id AND {$sqlOnPerson}))";
    foreach ($def['rules'] as $r) {
        $like = '%' . $r['value'] . '%';
        $c = null;
        switch ($r['field']) {
            case 'event_type':
                if (!$r['values']) { break; }
                $in = implode(',', $r['values']);
                $yr = ($r['from'] ? ' AND ee.year >= ' . (int) $r['from'] : '') . ($r['to'] ? ' AND ee.year <= ' . (int) $r['to'] : '');
                $c = $isEvents ? "(e.event_type_id IN ({$in}))"
                    : "(EXISTS (SELECT 1 FROM events ee LEFT JOIN families ff ON ff.id=ee.family_id WHERE ee.event_type_id IN ({$in}){$yr} AND (ee.person_id=p.id OR ff.partner1_id=p.id OR ff.partner2_id=p.id)))";
                break;
            case 'year':
                $col = $isEvents ? 'e.year' : "(SELECT min(ee.year) FROM events ee JOIN event_types tt ON tt.id=ee.event_type_id WHERE ee.person_id=p.id AND tt.gedcom_tag IN ('BIRT','CHR','BAPM'))";
                $parts = [];
                if ($r['from']) { $parts[] = "{$col} >= " . (int) $r['from']; }
                if ($r['to']) { $parts[] = "{$col} <= " . (int) $r['to']; }
                if ($parts) { $c = '(' . implode(' AND ', $parts) . ')'; }
                break;
            case 'death_year':
                if ($isEvents) { break; }
                $col = "(SELECT min(ee.year) FROM events ee JOIN event_types tt ON tt.id=ee.event_type_id WHERE ee.person_id=p.id AND tt.gedcom_tag IN ('DEAT','BURI'))";
                $parts = [];
                if ($r['from']) { $parts[] = "{$col} >= " . (int) $r['from']; }
                if ($r['to']) { $parts[] = "{$col} <= " . (int) $r['to']; }
                if ($parts) { $c = '(' . implode(' AND ', $parts) . ')'; }
                break;
            case 'place':
                if ($r['value'] === '') { break; }
                $c = $isEvents ? '(pl.name LIKE ? OR pl.county LIKE ? OR pl.state LIKE ? OR pl.country LIKE ?)'
                    : "(EXISTS (SELECT 1 FROM events ee JOIN event_types tt ON tt.id=ee.event_type_id JOIN places pp ON pp.id=ee.place_id WHERE ee.person_id=p.id AND tt.gedcom_tag IN ('BIRT','CHR','BAPM') AND (pp.name LIKE ? OR pp.county LIKE ? OR pp.state LIKE ? OR pp.country LIKE ?)))";
                array_push($params, $like, $like, $like, $like);
                break;
            case 'any_place':
                if ($r['value'] === '') { break; }
                $c = $isEvents ? '(pl.name LIKE ? OR pl.county LIKE ? OR pl.state LIKE ? OR pl.country LIKE ?)'
                    : "(EXISTS (SELECT 1 FROM events ee LEFT JOIN families ff ON ff.id=ee.family_id JOIN places pp ON pp.id=ee.place_id WHERE (ee.person_id=p.id OR ff.partner1_id=p.id OR ff.partner2_id=p.id) AND (pp.name LIKE ? OR pp.county LIKE ? OR pp.state LIKE ? OR pp.country LIKE ?)))";
                array_push($params, $like, $like, $like, $like);
                break;
            case 'last_name': case 'first_name': case 'occupation':
                if ($r['value'] === '') { break; }
                $c = $personMatch("x.{$r['field']} LIKE ?"); $params[] = $like;
                break;
            case 'gender':
                if (!in_array($r['value'], ['male', 'female', 'unknown'], true)) { break; }
                $c = $personMatch('x.gender = ?'); $params[] = $r['value'];
                break;
            case 'label':
                if (!$r['values']) { break; }
                $in = implode(',', $r['values']);
                $c = $isEvents ? "(EXISTS (SELECT 1 FROM label_links ll WHERE ll.label_id IN ({$in}) AND ((ll.entity_type='event' AND ll.entity_id=e.id) OR (ll.entity_type='person' AND ll.entity_id IN (e.person_id, f.partner1_id, f.partner2_id)))))"
                    : "(EXISTS (SELECT 1 FROM label_links ll WHERE ll.label_id IN ({$in}) AND ll.entity_type='person' AND ll.entity_id=p.id))";
                break;
            case 'sosa':
                $ids = array_map('intval', array_keys($sosas)) ?: [0];
                $c = $isEvents ? '(e.person_id IN (' . implode(',', $ids) . ') OR f.partner1_id IN (' . implode(',', $ids) . ') OR f.partner2_id IN (' . implode(',', $ids) . '))' : '(p.id IN (' . implode(',', $ids) . '))';
                break;
            case 'no_parents':
                $c = $personMatch('NOT EXISTS (SELECT 1 FROM family_children fc WHERE fc.child_id = x.id)');
                break;
            case 'no_source':
                $c = $isEvents ? "(NOT EXISTS (SELECT 1 FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id))"
                    : "(NOT EXISTS (SELECT 1 FROM source_links sl WHERE (sl.entity_type='person' AND sl.entity_id=p.id) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=p.id))))";
                break;
            case 'text':
                if ($r['value'] === '') { break; }
                $c = $isEvents ? '(e.description LIKE ? OR e.title LIKE ?)' : '(p.physical_description LIKE ? OR p.occupation LIKE ?)';
                array_push($params, $like, $like);
                break;
        }
        if ($c !== null) { $conds[] = $r['not'] ? "NOT {$c}" : $c; }
    }
    // Ajouts et retraits à la main
    $manual = [];
    $ms = $pdo->prepare('SELECT row_key, included, data_json FROM custom_list_rows WHERE list_id=?'); $ms->execute([$listId]);
    foreach ($ms->fetchAll() as $m) { $manual[$m['row_key']] = ['included' => (int) $m['included'], 'values' => json_decode((string) $m['data_json'], true) ?: []]; }
    $added = array_map(static fn($k) => (int) substr($k, 2), array_keys(array_filter($manual, static fn($m) => $m['included'] === 1)));
    $where = $conds ? '(' . implode($def['match'] === 'any' ? ' OR ' : ' AND ', $conds) . ')' : '1';
    if ($added) { $where = "({$where} OR " . ($isEvents ? 'e.id' : 'p.id') . ' IN (' . implode(',', $added) . '))'; }
    if ($isEvents) {
        $sql = "SELECT e.id, e.year, e.date_text, e.description, e.person_id, e.family_id, t.label AS type_label, pl.name AS place, pl.county,
                f.partner1_id, f.partner2_id, (SELECT count(*) FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id) AS sources
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
            WHERE {$where} ORDER BY " . ($def['sort'] === 'place' ? 'pl.name COLLATE NOCASE, ' : '') . "COALESCE(e.year, 9999), e.id LIMIT 3000";
    } else {
        $sql = "SELECT p.id FROM persons p WHERE {$where} ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 3000";
    }
    $st = $pdo->prepare($sql); $st->execute($params);
    $raw = $st->fetchAll();
    $pids = [];
    foreach ($raw as $r) { foreach ($isEvents ? [$r['person_id'], $r['partner1_id'], $r['partner2_id']] : [$r['id']] as $x) { if ($x) { $pids[] = (int) $x; } } }
    $people = collection_people($pdo, $pids);
    $life = my_list_life($pdo, array_keys($people));
    $out = [];
    foreach ($raw as $r) {
        $key = ($isEvents ? 'e:' : 'p:') . $r['id'];
        if (($manual[$key]['included'] ?? 0) === -1) { continue; }
        $row = ['key' => $key, 'values' => $manual[$key]['values'] ?? [], 'manual' => ($manual[$key]['included'] ?? 0) === 1];
        if ($isEvents) {
            $ps = array_values(array_filter(array_map(static fn($x) => $x ? ($people[(int) $x] ?? null) : null, [$r['person_id'], $r['partner1_id'], $r['partner2_id']])));
            $main = $ps[0] ?? null;
            $row['people'] = $ps;
            $row['cells'] = ['date' => $r['date_text'] ?: (string) ($r['year'] ?? ''), 'type' => $r['type_label'], 'place' => trim(($r['place'] ?? '') . ($r['county'] ? ' (' . $r['county'] . ')' : '')), 'description' => (string) $r['description'],
                'age' => $main && $r['year'] && !empty($life[(int) $main['id']]['by']) ? ((int) $r['year'] - $life[(int) $main['id']]['by']) . ' ans' : '', 'sources' => (int) $r['sources']];
            $row['year'] = $r['year'] ? (int) $r['year'] : null;
        } else {
            $p = $people[(int) $r['id']] ?? null;
            if (!$p) { continue; }
            $l = $life[(int) $p['id']] ?? [];
            $row['people'] = [$p];
            $row['cells'] = ['birth' => $l['birth'] ?? '', 'birthplace' => $l['birthplace'] ?? '', 'death' => $l['death'] ?? '', 'deathplace' => $l['deathplace'] ?? '',
                'age' => !empty($l['by']) && !empty($l['dy']) ? ($l['dy'] - $l['by']) . ' ans' : '', 'occupation' => (string) ($p['occupation'] ?? ''),
                'gender' => ['male' => 'Homme', 'female' => 'Femme'][$p['gender'] ?? ''] ?? '', 'parents' => $l['parents'] ?? '', 'sosa' => isset($sosas[(int) $p['id']]) ? implode(', ', (array) $sosas[(int) $p['id']]) : '',
                'sources' => (int) ($l['sources'] ?? 0), 'labels' => $l['labels'] ?? ''];
            $row['year'] = $l['by'] ?? null;
        }
        $out[] = $row;
    }
    if (!$isEvents && $def['sort'] === 'date') { usort($out, static fn($a, $b) => ($a['year'] ?? 9999) <=> ($b['year'] ?? 9999)); }
    if (!$isEvents && $def['sort'] === 'place') { usort($out, static fn($a, $b) => strcmp((string) $a['cells']['birthplace'], (string) $b['cells']['birthplace'])); }
    $list['definition'] = $def; unset($list['definition_json']);
    $list['labels'] = collection_labels($pdo, 'custom_list', [(int) $list['id']])[(int) $list['id']] ?? [];
    return ['list' => $list, 'rows' => $out, 'columns' => $isEvents ? LIST_EVENT_COLUMNS : LIST_PERSON_COLUMNS, 'truncated' => count($raw) >= 3000];
}

/** Naissance, décès, parents, sources et étiquettes d'un lot de personnes (pour les colonnes). */
function my_list_life(PDO $pdo, array $ids): array
{
    $out = [];
    foreach (array_chunk(array_values(array_unique(array_map('intval', $ids))), 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag, e.date_text, e.year, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id IN ({$in}) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY t.gedcom_tag IN ('BIRT','DEAT') DESC") as $e) {
            $pid = (int) $e['person_id'];
            $k = in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'birth' : 'death';
            if (isset($out[$pid][$k])) { continue; }
            $out[$pid][$k] = $e['date_text'] ?: (string) ($e['year'] ?? '');
            $out[$pid][$k . 'place'] = (string) $e['place'];
            $out[$pid][$k === 'birth' ? 'by' : 'dy'] = $e['year'] ? (int) $e['year'] : null;
        }
        foreach ($pdo->query("SELECT fc.child_id, group_concat(trim(COALESCE(pp.first_name,'')||' '||COALESCE(pp.last_name,'')), ' et ') AS names FROM family_children fc JOIN families f ON f.id=fc.family_id
            JOIN persons pp ON pp.id IN (f.partner1_id, f.partner2_id) WHERE fc.child_id IN ({$in}) GROUP BY fc.child_id") as $r) { $out[(int) $r['child_id']]['parents'] = (string) $r['names']; }
        foreach ($pdo->query("SELECT entity_id, count(*) AS n FROM source_links WHERE entity_type='person' AND entity_id IN ({$in}) GROUP BY entity_id") as $r) { $out[(int) $r['entity_id']]['sources'] = (int) $r['n']; }
        foreach ($pdo->query("SELECT ll.entity_id, group_concat(l.name, ', ') AS names FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type='person' AND ll.entity_id IN ({$in}) GROUP BY ll.entity_id") as $r) { $out[(int) $r['entity_id']]['labels'] = (string) $r['names']; }
    }
    return $out;
}

/** Liste aux lignes écrites à la main : dans l'ordre où elles ont été ajoutées ; les personnes choisies sont reliées à leur fiche. */
function my_list_free_rows(PDO $pdo, array $list, array $def): array
{
    $s = $pdo->prepare("SELECT row_key, data_json FROM custom_list_rows WHERE list_id=? AND row_key LIKE 'f:%' AND included>=0 ORDER BY CAST(substr(row_key,3) AS INTEGER)");
    $s->execute([(int) $list['id']]);
    $rows = [];
    $personCols = array_column(array_filter($def['custom'], static fn($c) => $c['type'] === 'person'), 'key');
    $ids = [];
    foreach ($s->fetchAll() as $r) {
        $values = json_decode((string) $r['data_json'], true) ?: [];
        foreach ($personCols as $k) { if (!empty($values[$k])) { $ids[] = (int) $values[$k]; } }
        $rows[] = ['key' => $r['row_key'], 'values' => $values, 'manual' => true, 'people' => [], 'cells' => []];
    }
    $people = collection_people($pdo, $ids);
    foreach ($rows as &$r) {
        foreach ($personCols as $k) { $id = (int) ($r['values'][$k] ?? 0); $r['linked'][$k] = $id && isset($people[$id]) ? $people[$id] : null; }
    }
    unset($r);
    $list['definition'] = $def; unset($list['definition_json']);
    $list['labels'] = collection_labels($pdo, 'custom_list', [(int) $list['id']])[(int) $list['id']] ?? [];
    return ['list' => $list, 'rows' => $rows, 'columns' => [], 'truncated' => false];
}

