<?php
declare(strict_types=1);

/**
 * Objets de famille, mémoire familiale, lieux précis (adresses, fermes, maisons) et entretien des liens web.
 * Structure n°6 (lib/migrations.php).
 */

const MEMORY_KINDS = ['recipe' => 'Recette', 'expression' => 'Expression', 'song' => 'Chanson', 'nickname' => 'Surnom', 'tradition' => 'Tradition', 'story' => 'Histoire', 'testimony' => 'Témoignage', 'sense' => 'Souvenir des sens', 'other' => 'Autre']; // testimony : réponse d'un proche (Questions aux proches), montrée dans « Témoignages / souvenirs » de la fiche

function collection_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $stmt = $pdo->prepare(person_select() . ' WHERE p.id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
        $stmt->execute($chunk);
        foreach ($stmt->fetchAll() as $p) { $out[(int) $p['id']] = $p; }
        $stmt->closeCursor();
    }
    return $out;
}

/** Étiquettes (les mêmes que pour les personnes, lieux…) des objets ou souvenirs. */
function collection_labels(PDO $pdo, string $type, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return []; }
    $stmt = $pdo->prepare('SELECT ll.entity_id, l.id, l.name, l.color, l.description FROM label_links ll JOIN labels l ON l.id=ll.label_id
        WHERE ll.entity_type=? AND ll.entity_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY l.name COLLATE NOCASE');
    $stmt->execute([$type, ...$ids]);
    $out = [];
    foreach ($stmt->fetchAll() as $l) { $eid = (int) $l['entity_id']; unset($l['entity_id']); $out[$eid][] = $l; }
    $stmt->closeCursor();
    return $out;
}

function collection_media(PDO $pdo, string $type, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return []; }
    $stmt = $pdo->prepare('SELECT cm.collection_id, m.id, m.title, m.filename, m.media_type FROM family_collection_media cm JOIN media m ON m.id=cm.media_id
        WHERE cm.collection_type=? AND cm.collection_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY cm.position, cm.id');
    $stmt->execute([$type, ...$ids]);
    $out = [];
    foreach ($stmt->fetchAll() as $m) { $out[(int) $m['collection_id']][] = $m; }
    $stmt->closeCursor();
    return $out;
}

/* ─── Objets de famille ─────────────────────────────────────────────── */

/** Objets (tous, ou ceux d'une personne : détenteur actuel ou maillon d'une transmission). */
function family_objects_data(PDO $pdo, int $personId = 0, string $q = ''): array
{
    $where = []; $params = [];
    if ($personId) {
        $where[] = '(o.holder_person_id=? OR o.id IN (SELECT object_id FROM family_object_transfers WHERE from_person_id=? OR to_person_id=?))';
        array_push($params, $personId, $personId, $personId);
    }
    if ($q !== '') { $where[] = "(o.title LIKE ? OR o.kind LIKE ? OR o.description LIKE ? OR o.holder_text LIKE ? OR o.id IN (SELECT ll.entity_id FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type='family_object' AND l.name LIKE ?))"; array_push($params, "%{$q}%", "%{$q}%", "%{$q}%", "%{$q}%", "%{$q}%"); }
    $stmt = $pdo->prepare('SELECT o.* FROM family_objects o' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY o.title COLLATE NOCASE, o.id');
    $stmt->execute($params);
    $objects = $stmt->fetchAll();
    $stmt->closeCursor();
    if (!$objects) { return []; }
    $ids = array_map(static fn($o) => (int) $o['id'], $objects);
    $tr = $pdo->prepare('SELECT * FROM family_object_transfers WHERE object_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY object_id, COALESCE(year, 99999), position, id');
    $tr->execute($ids);
    $transfers = [];
    $personIds = [];
    foreach ($tr->fetchAll() as $t) { $transfers[(int) $t['object_id']][] = $t; $personIds[] = $t['from_person_id']; $personIds[] = $t['to_person_id']; }
    $tr->closeCursor();
    foreach ($objects as $o) { $personIds[] = $o['holder_person_id']; }
    $people = collection_people($pdo, $personIds);
    $media = collection_media($pdo, 'family_object', $ids);
    $labels = collection_labels($pdo, 'family_object', $ids);
    foreach ($objects as &$o) {
        $o['labels'] = $labels[(int) $o['id']] ?? [];
        $o['transfers'] = array_map(static function ($t) use ($people) {
            $t['from_person'] = $people[(int) $t['from_person_id']] ?? null;
            $t['to_person'] = $people[(int) $t['to_person_id']] ?? null;
            return $t;
        }, $transfers[(int) $o['id']] ?? []);
        $o['holder_person'] = $people[(int) $o['holder_person_id']] ?? null;
        $o['media'] = $media[(int) $o['id']] ?? [];
    }
    unset($o);
    return $objects;
}

function save_family_object(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    if ($title === '') { throw new RuntimeException('Donne un nom à l’objet (ex. « Horloge comtoise »).'); }
    $fields = [$title, safe_text($data['kind'] ?? ''), safe_text($data['description'] ?? ''), safe_text($data['origin_text'] ?? ''),
        safe_int($data['holder_person_id'] ?? 0) ?: null, safe_text($data['holder_text'] ?? ''), safe_text($data['location_text'] ?? ''), safe_text($data['notes'] ?? '')];
    if ($id) {
        $pdo->prepare('UPDATE family_objects SET title=?,kind=?,description=?,origin_text=?,holder_person_id=?,holder_text=?,location_text=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $id]);
        log_change($pdo, 'family_object', $id, 'update', 'Objet de famille modifié : ' . $title);
    } else {
        $pdo->prepare('INSERT INTO family_objects(title,kind,description,origin_text,holder_person_id,holder_text,location_text,notes) VALUES(?,?,?,?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'family_object', $id, 'create', 'Objet de famille ajouté : ' . $title);
    }
    // Transmission : la liste envoyée remplace l'ancienne
    if (isset($data['transfers']) && is_array($data['transfers'])) {
        $pdo->prepare('DELETE FROM family_object_transfers WHERE object_id=?')->execute([$id]);
        $ins = $pdo->prepare('INSERT INTO family_object_transfers(object_id,from_person_id,from_text,to_person_id,to_text,date_text,year,note,position) VALUES(?,?,?,?,?,?,?,?,?)');
        foreach (array_values($data['transfers']) as $i => $t) {
            if (!is_array($t)) { continue; }
            $from = safe_int($t['from_person_id'] ?? 0) ?: null; $to = safe_int($t['to_person_id'] ?? 0) ?: null;
            $fromText = safe_text($t['from_text'] ?? ''); $toText = safe_text($t['to_text'] ?? ''); $date = safe_text($t['date_text'] ?? '');
            if (!$from && !$to && $fromText === '' && $toText === '') { continue; }
            $year = preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $date, $m) ? (int) $m[1] : null;
            $ins->execute([$id, $from, $fromText, $to, $toText, $date, $year, safe_text($t['note'] ?? ''), $i]);
        }
    }
    return ['id' => $id];
}

function delete_family_object(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $row = $pdo->prepare('SELECT title FROM family_objects WHERE id=?'); $row->execute([$id]); $title = $row->fetchColumn(); $row->closeCursor();
    if ($title === false) { throw new RuntimeException('Objet introuvable'); }
    $pdo->prepare("DELETE FROM family_collection_media WHERE collection_type='family_object' AND collection_id=?")->execute([$id]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='family_object' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM family_objects WHERE id=?')->execute([$id]);
    log_change($pdo, 'family_object', $id, 'delete', 'Objet de famille supprimé : ' . $title);
    return ['deleted' => $id];
}

/* ─── Mémoire familiale ─────────────────────────────────────────────── */

function family_memories_data(PDO $pdo, int $personId = 0, string $q = '', string $kind = ''): array
{
    $where = []; $params = [];
    if ($personId) { $where[] = 'm.id IN (SELECT memory_id FROM family_memory_people WHERE person_id=?)'; $params[] = $personId; }
    if ($q !== '') { $where[] = "(m.title LIKE ? OR m.content LIKE ? OR m.origin_text LIKE ? OR m.id IN (SELECT ll.entity_id FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type='family_memory' AND l.name LIKE ?))"; array_push($params, "%{$q}%", "%{$q}%", "%{$q}%", "%{$q}%"); }
    if ($kind !== '' && isset(MEMORY_KINDS[$kind])) { $where[] = 'm.kind=?'; $params[] = $kind; }
    $stmt = $pdo->prepare('SELECT m.* FROM family_memories m' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY m.kind, m.title COLLATE NOCASE, m.id');
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $stmt->closeCursor();
    if (!$rows) { return []; }
    $ids = array_map(static fn($r) => (int) $r['id'], $rows);
    $lp = $pdo->prepare('SELECT * FROM family_memory_people WHERE memory_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY id');
    $lp->execute($ids);
    $links = []; $pids = [];
    foreach ($lp->fetchAll() as $l) { $links[(int) $l['memory_id']][] = $l; $pids[] = $l['person_id']; }
    $lp->closeCursor();
    $people = collection_people($pdo, $pids);
    $media = collection_media($pdo, 'family_memory', $ids);
    $labels = collection_labels($pdo, 'family_memory', $ids);
    foreach ($rows as &$r) {
        $r['labels'] = $labels[(int) $r['id']] ?? [];
        $r['kind_label'] = MEMORY_KINDS[$r['kind']] ?? 'Autre';
        $r['people'] = array_values(array_filter(array_map(static fn($l) => isset($people[(int) $l['person_id']]) ? ['role' => $l['role'], 'person' => $people[(int) $l['person_id']]] : null, $links[(int) $r['id']] ?? [])));
        $r['media'] = $media[(int) $r['id']] ?? [];
    }
    unset($r);
    return $rows;
}

function save_family_memory(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    if ($title === '') { throw new RuntimeException('Donne un titre (ex. « La tarte aux pommes de mémé »).'); }
    $kind = safe_text($data['kind'] ?? 'other');
    if (!isset(MEMORY_KINDS[$kind])) { $kind = 'other'; }
    $content = trim((string) ($data['content'] ?? ''));
    $fields = [$kind, $title, $content, safe_text($data['origin_text'] ?? ''), safe_text($data['notes'] ?? '')];
    if ($id) {
        $pdo->prepare('UPDATE family_memories SET kind=?,title=?,content=?,origin_text=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $id]);
        log_change($pdo, 'family_memory', $id, 'update', 'Mémoire familiale modifiée : ' . $title);
    } else {
        $pdo->prepare('INSERT INTO family_memories(kind,title,content,origin_text,notes) VALUES(?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'family_memory', $id, 'create', 'Mémoire familiale ajoutée : ' . $title);
    }
    if (isset($data['people']) && is_array($data['people'])) {
        $pdo->prepare('DELETE FROM family_memory_people WHERE memory_id=?')->execute([$id]);
        $ins = $pdo->prepare('INSERT OR IGNORE INTO family_memory_people(memory_id,person_id,role) VALUES(?,?,?)');
        foreach ($data['people'] as $p) {
            $pid = safe_int(is_array($p) ? ($p['person_id'] ?? 0) : $p);
            $role = is_array($p) && in_array($p['role'] ?? '', ['transmitted', 'received', 'about'], true) ? $p['role'] : 'transmitted';
            if ($pid) { $ins->execute([$id, $pid, $role]); }
        }
    }
    return ['id' => $id];
}

function delete_family_memory(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $row = $pdo->prepare('SELECT title FROM family_memories WHERE id=?'); $row->execute([$id]); $title = $row->fetchColumn(); $row->closeCursor();
    if ($title === false) { throw new RuntimeException('Souvenir introuvable'); }
    $pdo->prepare("DELETE FROM family_collection_media WHERE collection_type='family_memory' AND collection_id=?")->execute([$id]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='family_memory' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM family_memories WHERE id=?')->execute([$id]);
    log_change($pdo, 'family_memory', $id, 'delete', 'Mémoire familiale supprimée : ' . $title);
    return ['deleted' => $id];
}

function remove_collection_media(PDO $pdo, array $data): array
{
    $type = safe_text($data['collection_type'] ?? '');
    if (!in_array($type, HERITAGE_COLLECTION_TYPES, true)) { throw new RuntimeException('Type inconnu'); }
    $pdo->prepare('DELETE FROM family_collection_media WHERE collection_type=? AND collection_id=? AND media_id=?')
        ->execute([$type, safe_int($data['collection_id'] ?? 0), safe_int($data['media_id'] ?? 0)]);
    return ['ok' => true];
}

/* ─── Lieux précis : adresse + commune, ou points GPS proches ─────────── */

/** « 5, Rue de la Gare » et « 5 rue de la gare » donnent la même clé. */
function precise_address_key(string $address): string
{
    $s = strtolower(ascii_fold($address));
    $s = preg_replace(['/\bst\b/', '/\bste\b/', '/\bav\b\.?/', '/\bbd\b\.?/', '/\br\b\.?(?=\s)/', '/\bpl\b\.?/'], ['saint', 'sainte', 'avenue', 'boulevard', 'rue', 'place'], $s);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $s));
}

function precise_distance_m(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $r = 6371000; $p1 = deg2rad($lat1); $p2 = deg2rad($lat2);
    $a = sin(($p2 - $p1) / 2) ** 2 + cos($p1) * cos($p2) * sin(deg2rad($lon2 - $lon1) / 2) ** 2;
    return 2 * $r * asin(min(1, sqrt($a)));
}

/**
 * Regroupe les événements et recensements qui ont une adresse ou un point GPS précis :
 * même commune + même adresse (écriture repliée), ou points à moins de $radius mètres.
 */
function precise_place_groups(PDO $pdo, int $radius = 30): array
{
    $items = [];
    foreach ($pdo->query("SELECT e.id, e.place_id, COALESCE(e.address,'') AS address, e.precise_lat, e.precise_lon, e.year, pl.name AS place_name, pl.latitude, pl.longitude
        FROM events e LEFT JOIN places pl ON pl.id=e.place_id
        WHERE TRIM(COALESCE(e.address,''))<>'' OR (e.precise_lat IS NOT NULL AND e.precise_lon IS NOT NULL)") as $r) {
        $items[] = ['k' => 'e' . $r['id'], 'type' => 'event', 'id' => (int) $r['id'], 'place_id' => (int) $r['place_id'], 'place_name' => (string) $r['place_name'], 'address' => trim((string) $r['address']),
            'lat' => $r['precise_lat'] !== null ? (float) $r['precise_lat'] : null, 'lon' => $r['precise_lon'] !== null ? (float) $r['precise_lon'] : null, 'year' => (int) $r['year'],
            'place_lat' => $r['latitude'] !== null ? (float) $r['latitude'] : null, 'place_lon' => $r['longitude'] !== null ? (float) $r['longitude'] : null];
    }
    foreach ($pdo->query("SELECT c.id, c.place_id, COALESCE(c.address,'') AS address, c.year, pl.name AS place_name, pl.latitude, pl.longitude FROM census_records c LEFT JOIN places pl ON pl.id=c.place_id
        WHERE TRIM(COALESCE(c.address,''))<>''") as $r) {
        $items[] = ['k' => 'c' . $r['id'], 'type' => 'census', 'id' => (int) $r['id'], 'place_id' => (int) $r['place_id'], 'place_name' => (string) $r['place_name'], 'address' => trim((string) $r['address']),
            'lat' => null, 'lon' => null, 'year' => (int) $r['year'], 'place_lat' => $r['latitude'] !== null ? (float) $r['latitude'] : null, 'place_lon' => $r['longitude'] !== null ? (float) $r['longitude'] : null];
    }
    // Union-find : même adresse dans la même commune ; points GPS proches
    $parent = range(0, count($items) - 1);
    $find = static function (int $i) use (&$parent): int { while ($parent[$i] !== $i) { $parent[$i] = $parent[$parent[$i]]; $i = $parent[$i]; } return $i; };
    $union = static function (int $a, int $b) use (&$parent, $find): void { $ra = $find($a); $rb = $find($b); if ($ra !== $rb) { $parent[max($ra, $rb)] = min($ra, $rb); } };
    $byAddress = [];
    foreach ($items as $i => $it) {
        if ($it['address'] === '') { continue; }
        $key = $it['place_id'] . '|' . precise_address_key($it['address']);
        if (isset($byAddress[$key])) { $union($i, $byAddress[$key]); } else { $byAddress[$key] = $i; }
    }
    // Grille de ~100 m pour ne comparer que les points voisins
    $grid = [];
    foreach ($items as $i => $it) { if ($it['lat'] !== null) { $grid[(int) floor($it['lat'] * 1000) . ':' . (int) floor($it['lon'] * 1000)][] = $i; } }
    foreach ($items as $i => $it) {
        if ($it['lat'] === null) { continue; }
        $gy = (int) floor($it['lat'] * 1000); $gx = (int) floor($it['lon'] * 1000);
        for ($dy = -1; $dy <= 1; $dy++) { for ($dx = -1; $dx <= 1; $dx++) {
            foreach ($grid[($gy + $dy) . ':' . ($gx + $dx)] ?? [] as $j) {
                if ($j > $i && precise_distance_m($it['lat'], $it['lon'], $items[$j]['lat'], $items[$j]['lon']) <= $radius) { $union($i, $j); }
            }
        } }
    }
    $groups = [];
    foreach ($items as $i => $it) { $groups[$find($i)][] = $it; }
    $out = [];
    foreach ($groups as $members) {
        $addresses = array_count_values(array_filter(array_map(static fn($m) => $m['address'], $members)));
        arsort($addresses);
        $address = (string) (array_key_first($addresses) ?? '');
        $places = array_count_values(array_filter(array_map(static fn($m) => $m['place_name'], $members)));
        arsort($places);
        $place = (string) (array_key_first($places) ?? '');
        $gps = array_values(array_filter($members, static fn($m) => $m['lat'] !== null));
        $lat = $gps ? array_sum(array_column($gps, 'lat')) / count($gps) : ($members[0]['place_lat'] ?? null);
        $lon = $gps ? array_sum(array_column($gps, 'lon')) / count($gps) : ($members[0]['place_lon'] ?? null);
        $years = array_filter(array_column($members, 'year'));
        $keys = array_column($members, 'k'); sort($keys);
        $out[] = ['key' => $keys[0], 'address' => $address, 'place' => $place, 'place_ids' => array_values(array_unique(array_filter(array_column($members, 'place_id')))), 'label' => $address !== '' ? $address : 'Point GPS précis',
            'lat' => $lat, 'lon' => $lon, 'gps_only' => $address === '', 'events' => count(array_filter($members, static fn($m) => $m['type'] === 'event')),
            'census' => count(array_filter($members, static fn($m) => $m['type'] === 'census')), 'from' => $years ? min($years) : null, 'to' => $years ? max($years) : null,
            'members' => array_map(static fn($m) => ['type' => $m['type'], 'id' => $m['id']], $members)];
    }
    usort($out, static fn($a, $b) => [$a['place'], $a['label']] <=> [$b['place'], $b['label']]);
    return $out;
}

function precise_places_list(PDO $pdo, string $q = '', int $radius = 30): array
{
    $rows = precise_place_groups($pdo, $radius);
    if ($q !== '') {
        $needle = strtolower(ascii_fold($q));
        $rows = array_values(array_filter($rows, static fn($r) => str_contains(strtolower(ascii_fold($r['address'] . ' ' . $r['place'])), $needle)));
    }
    foreach ($rows as &$r) { unset($r['members']); }
    unset($r);
    return $rows;
}

/** Un lieu précis en un coup d'œil : tous les événements, les recensements, les habitants successifs, les médias. */
function precise_place_detail(PDO $pdo, string $key, int $radius = 30): array
{
    $group = null;
    foreach (precise_place_groups($pdo, $radius) as $g) { if ($g['key'] === $key) { $group = $g; break; } }
    if (!$group) { throw new RuntimeException('Lieu introuvable (les adresses ont peut-être changé).'); }
    $eventIds = array_column(array_filter($group['members'], static fn($m) => $m['type'] === 'event'), 'id');
    $censusIds = array_column(array_filter($group['members'], static fn($m) => $m['type'] === 'census'), 'id');
    $events = [];
    if ($eventIds) {
        $stmt = $pdo->prepare("SELECT e.id, e.date_text, e.year, COALESCE(e.address,'') AS address, e.title, e.description, e.person_id, e.family_id, e.precise_lat, e.precise_lon,
                t.label AS type_label, t.gedcom_tag, t.icon, t.color, f.partner1_id, f.partner2_id
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id
            WHERE e.id IN (" . implode(',', array_fill(0, count($eventIds), '?')) . ') ORDER BY COALESCE(e.year, 99999), e.id');
        $stmt->execute($eventIds);
        $events = $stmt->fetchAll();
        $stmt->closeCursor();
    }
    $census = [];
    if ($censusIds) {
        $stmt = $pdo->prepare('SELECT c.id, c.year, c.date_text, c.address FROM census_records c WHERE c.id IN (' . implode(',', array_fill(0, count($censusIds), '?')) . ') ORDER BY c.year, c.id');
        $stmt->execute($censusIds);
        $census = $stmt->fetchAll();
        $stmt->closeCursor();
        $mem = $pdo->prepare('SELECT census_id, person_id, display_name, age_text, occupation, household_position FROM census_members WHERE census_id IN (' . implode(',', array_fill(0, count($censusIds), '?')) . ') ORDER BY census_id, id');
        $mem->execute($censusIds);
        $members = [];
        foreach ($mem->fetchAll() as $m) { $members[(int) $m['census_id']][] = $m; }
        $mem->closeCursor();
        foreach ($census as &$c) { $c['members'] = $members[(int) $c['id']] ?? []; }
        unset($c);
    }
    $pids = [];
    foreach ($events as $e) { array_push($pids, $e['person_id'], $e['partner1_id'], $e['partner2_id']); }
    foreach ($census as $c) { foreach ($c['members'] as $m) { $pids[] = $m['person_id']; } }
    $people = collection_people($pdo, $pids);
    foreach ($events as &$e) {
        $e['people'] = array_values(array_filter([$people[(int) $e['person_id']] ?? null, $people[(int) $e['partner1_id']] ?? null, $people[(int) $e['partner2_id']] ?? null]));
    }
    unset($e);
    foreach ($census as &$c) { foreach ($c['members'] as &$m) { $m['person'] = $people[(int) $m['person_id']] ?? null; } unset($m); }
    unset($c);
    // Habitants successifs : par nom de famille, de la première à la dernière année où on les trouve ici
    $occ = [];
    $addPerson = static function (?array $p, ?int $year, string $fallback = '') use (&$occ): void {
        $name = $p ? trim((string) ($p['last_name'] ?? '')) : '';
        if ($name === '' && $fallback !== '') { $parts = preg_split('/\s+/u', trim($fallback)); $name = (string) end($parts); }
        if ($name === '') { return; }
        $key = mb_strtolower(ascii_fold($name));
        $occ[$key] ??= ['family' => mb_convert_case(mb_strtolower($name), MB_CASE_TITLE), 'from' => null, 'to' => null, 'people' => []];
        if ($year) { $occ[$key]['from'] = $occ[$key]['from'] === null ? $year : min($occ[$key]['from'], $year); $occ[$key]['to'] = $occ[$key]['to'] === null ? $year : max($occ[$key]['to'], $year); }
        if ($p) { $occ[$key]['people'][(int) $p['id']] = $p; }
    };
    foreach ($events as $e) { foreach ($e['people'] as $p) { $addPerson($p, $e['year'] ? (int) $e['year'] : null); } }
    foreach ($census as $c) { foreach ($c['members'] as $m) { $addPerson($m['person'], $c['year'] ? (int) $c['year'] : null, (string) $m['display_name']); } }
    $occupants = array_values(array_map(static function ($o) { $o['people'] = array_values($o['people']); return $o; }, $occ));
    usort($occupants, static fn($a, $b) => [$a['from'] ?? 99999, $a['family']] <=> [$b['from'] ?? 99999, $b['family']]);
    // Médias des événements et recensements de ce lieu
    $media = [];
    if ($eventIds || $censusIds) {
        $conds = []; $params = [];
        if ($eventIds) { $conds[] = "(ml.entity_type='event' AND ml.entity_id IN (" . implode(',', array_fill(0, count($eventIds), '?')) . '))'; array_push($params, ...$eventIds); }
        if ($censusIds) { $conds[] = "(ml.entity_type='census' AND ml.entity_id IN (" . implode(',', array_fill(0, count($censusIds), '?')) . '))'; array_push($params, ...$censusIds); }
        $stmt = $pdo->prepare('SELECT DISTINCT m.id, m.title, m.filename, m.media_type FROM media_links ml JOIN media m ON m.id=ml.media_id WHERE ' . implode(' OR ', $conds) . ' ORDER BY m.id');
        $stmt->execute($params);
        $media = $stmt->fetchAll();
        $stmt->closeCursor();
    }
    unset($group['members']);
    return ['place' => $group, 'events' => $events, 'census' => $census, 'occupants' => $occupants, 'media' => $media, 'radius' => $radius];
}

/* ─── Entretien : liens web ─────────────────────────────────────────── */

/** Sous Windows, PHP n'a pas de liste de certificats : on utilise celle du système (sinon tout site https paraît en défaut). */
function lcnda_curl_tls(): array
{
    return PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA') ? [CURLOPT_SSL_OPTIONS => CURLSSLOPT_NATIVE_CA] : [];
}

/** Toutes les adresses web enregistrées, avec leur origine (table, fiche) et le dernier contrôle. */
function link_inventory(PDO $pdo): array
{
    $sources = [
        ['person_online_sheets', 'url', "SELECT s.id, s.url AS value, s.person_id, COALESCE(s.label,'') AS label FROM person_online_sheets s WHERE s.url LIKE 'http%'", 'Fiche en ligne'],
        ['sources', 'url', "SELECT s.id, s.url AS value, NULL AS person_id, COALESCE(s.title,'') AS label FROM sources s WHERE s.url LIKE 'http%'", 'Source'],
        ['media', 'document_url', "SELECT m.id, m.document_url AS value, NULL AS person_id, COALESCE(m.title,'') AS label FROM media m WHERE m.document_url LIKE 'http%'", 'Média'],
    ];
    // Autres tables qui ont une colonne d'adresse web
    foreach (['investigation_items' => 'Enquête', 'battue_search_items' => 'Battue', 'archive_digest_entries' => 'Dépouillement', 'archive_visit_plans' => 'Visite aux archives'] as $table => $label) {
        try { $cols = $pdo->query("PRAGMA table_info({$table})")->fetchAll(); } catch (Throwable) { continue; }
        foreach ($cols as $c) {
            $col = (string) $c['name'];
            if (preg_match('/url/i', $col)) {
                $titleCol = in_array('title', array_column($cols, 'name'), true) ? "COALESCE(title,'')" : "''";
                $sources[] = [$table, $col, "SELECT id, {$col} AS value, NULL AS person_id, {$titleCol} AS label FROM {$table} WHERE {$col} LIKE 'http%'", $label];
            }
        }
    }
    $urls = [];
    foreach ($sources as [$table, $col, $sql, $label]) {
        try { $rows = $pdo->query($sql)->fetchAll(); } catch (Throwable) { continue; }
        foreach ($rows as $r) {
            $u = trim((string) $r['value']);
            if (!preg_match('#^https?://#i', $u)) { continue; }
            $urls[$u]['url'] = $u;
            $urls[$u]['uses'][] = ['table' => $table, 'column' => $col, 'id' => (int) $r['id'], 'person_id' => (int) ($r['person_id'] ?? 0), 'what' => $label, 'label' => (string) $r['label']];
        }
    }
    try {
        foreach ($pdo->query("SELECT id, title, links FROM genealogy_fairs WHERE links LIKE '%http%'") as $r) {
            if (!preg_match_all('#https?://[^\s<>"]+#i', (string) $r['links'], $m)) { continue; }
            foreach (array_unique($m[0]) as $u) {
                $u = rtrim($u, '.,;)');
                $urls[$u]['url'] = $u;
                $urls[$u]['uses'][] = ['table' => 'genealogy_fairs', 'column' => 'links', 'id' => (int) $r['id'], 'person_id' => 0, 'what' => 'Salon', 'label' => (string) $r['title'], 'contains' => true];
            }
        }
    } catch (Throwable) { /* base sans la structure n°7 */ }
    $checks = [];
    foreach ($pdo->query('SELECT * FROM link_checks') as $c) { $checks[$c['url']] = $c; }
    foreach ($urls as $u => &$row) { $row['check'] = $checks[$u] ?? null; }
    unset($row);
    return array_values($urls);
}

/**
 * Adresse vérifiable sans risque : http(s), et le nom pointe vers une adresse publique (pas 127.0.0.1, ni le réseau
 * de la maison 192.168…, ni 169.254…) — sinon un lien piégé (GEDCOM reçu d'un cousin…) ferait interroger le réseau local.
 * Renvoie l'entrée CURLOPT_RESOLVE « nom:port:ip » qui fige l'adresse vérifiée (« » pour une adresse en chiffres), ou null si elle est refusée.
 */
function link_safe_resolve(string $url): ?string
{
    $parts = parse_url($url);
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    $host = strtolower(trim((string) ($parts['host'] ?? ''), '[]'));
    if (!in_array($scheme, ['http', 'https'], true) || $host === '' || isset($parts['user']) || isset($parts['pass'])) return null;
    $port = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
    $public = 'link_ip_public';
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return $public($host) ? '' : null;            // adresse écrite en chiffres : rien à figer
    } else {
        if ($host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local') || !str_contains($host, '.')) return null;
        $ips = gethostbynamel($host) ?: [];
        foreach ((@dns_get_record($host, DNS_AAAA) ?: []) as $rec) { if (!empty($rec['ipv6'])) $ips[] = $rec['ipv6']; }
        if (!$ips) return null;
        foreach ($ips as $ip) { if (!$public($ip)) return null; }   // un seul enregistrement local suffit à refuser
    }
    $ip = $ips[0];
    return $host . ':' . $port . ':' . (str_contains($ip, ':') ? '[' . $ip . ']' : $ip);
}

/**
 * Adresse IP publique ? Les adresses IPv6 qui cachent une IPv4 (::ffff:127.0.0.1, ::127.0.0.1, 64:ff9b::…, 2002:…)
 * sont ramenées à cette IPv4 avant le test ; réseau partagé des opérateurs (100.64/10), adresses IPv6 locales
 * (fc00::/7, fe80::/10) refusés aussi.
 */
function link_ip_public(string $ip): bool
{
    $bin = @inet_pton($ip);
    if ($bin === false) { return false; }
    if (strlen($bin) === 16) {
        $embedded = null;
        if (str_starts_with($bin, str_repeat("\0", 10) . "\xff\xff") || str_starts_with($bin, str_repeat("\0", 12))) { $embedded = substr($bin, 12, 4); } // ::ffff:a.b.c.d, ::a.b.c.d
        elseif (str_starts_with($bin, "\x00\x64\xff\x9b" . str_repeat("\0", 8))) { $embedded = substr($bin, 12, 4); } // 64:ff9b::/96 (NAT64)
        elseif (str_starts_with($bin, "\x20\x02")) { $embedded = substr($bin, 2, 4); } // 2002::/16 (6to4)
        if ($embedded !== null) { return $embedded !== "\0\0\0\0" && link_ip_public((string) inet_ntop($embedded)); }
        if ((ord($bin[0]) & 0xfe) === 0xfc || (ord($bin[0]) === 0xfe && (ord($bin[1]) & 0xc0) === 0x80)) { return false; } // fc00::/7, fe80::/10
    } elseif (ord($bin[0]) === 100 && (ord($bin[1]) & 0xc0) === 64) {
        return false; // 100.64.0.0/10
    }
    return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}

/** Options cURL communes à la vérification des liens (sans suivre les redirections : on les suit à la main, en revérifiant chaque saut). */
function link_curl_options(string $resolve, bool $verify = true): array
{
    return ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + [CURLOPT_RANGE => '0-2047', CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', // jamais par un proxy : l'adresse vérifiée est bien celle qu'on joint
        CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 20, CURLOPT_SSL_VERIFYPEER => $verify, CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, verification de liens genealogiques)', CURLOPT_HTTPHEADER => ['Accept: text/html,*/*;q=0.8', 'Accept-Language: fr,en;q=0.8']]
        + ($verify ? lcnda_curl_tls() : []);
}

/** Suit les redirections (6 au plus) d'une réponse déjà reçue, en revérifiant chaque nouvelle adresse. */
function link_follow_redirects(int $code, string $url, string $location, bool $verify = true): array
{
    $hops = 0; $error = '';
    while (in_array($code, [301, 302, 303, 307, 308], true) && $location !== '' && $hops < 6) {
        $next = link_absolute_url($url, $location);
        $resolve = link_safe_resolve($next);
        if ($resolve === null) { return [0, $url, 'Redirection vers une adresse locale refusée']; }
        $ch = curl_init($next);
        curl_setopt_array($ch, link_curl_options($resolve, $verify));
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $location = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: '');
        $error = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        $url = $next; $hops++;
    }
    return [$code, $url, $error];
}

/** Adresse absolue d'une redirection « Location: /chemin » ou « //site/chemin ». */
function link_absolute_url(string $base, string $location): string
{
    if (preg_match('#^https?://#i', $location)) return $location;
    $b = parse_url($base);
    $origin = ($b['scheme'] ?? 'https') . '://' . ($b['host'] ?? '') . (isset($b['port']) ? ':' . $b['port'] : '');
    if (str_starts_with($location, '//')) return ($b['scheme'] ?? 'https') . ':' . $location;
    if (str_starts_with($location, '/')) return $origin . $location;
    $path = (string) ($b['path'] ?? '/');
    return $origin . substr($path, 0, (int) strrpos($path, '/') + 1) . $location;
}

/**
 * Contrôle de quelques adresses (20 au plus par appel, en parallèle) : suit les redirections ; si la page ne répond
 * plus, cherche une copie sur Internet Archive (archive.org). Ne modifie aucun lien : le résultat est seulement noté.
 * Les adresses locales (127.0.0.1, réseau de la maison…) ne sont jamais interrogées.
 */
function check_links(PDO $pdo, array $data): array
{
    $urls = array_slice(array_values(array_unique(array_filter(array_map('strval', (array) ($data['urls'] ?? [])), static fn($u) => (bool) preg_match('#^https?://#i', $u)))), 0, 20);
    if (!$urls || !function_exists('curl_multi_init')) { return ['checked' => []]; }
    $mh = curl_multi_init(); $handles = []; $refused = [];
    foreach ($urls as $u) {
        $resolve = link_safe_resolve($u);
        if ($resolve === null) { $refused[$u] = true; continue; }
        $ch = curl_init($u);
        curl_setopt_array($ch, link_curl_options($resolve));
        curl_multi_add_handle($mh, $ch);
        $handles[$u] = $ch;
    }
    // Résultat de chaque adresse (en parallèle, curl_errno() ne le donne pas : on lit les messages du lot)
    $results = [];
    if ($handles) {
        do {
            $status = curl_multi_exec($mh, $running);
            while ($info = curl_multi_info_read($mh)) { $results[spl_object_id($info['handle'])] = (int) $info['result']; }
            if ($running) { curl_multi_select($mh, 1.0); }
        } while ($running && $status === CURLM_OK);
        while ($info = curl_multi_info_read($mh)) { $results[spl_object_id($info['handle'])] = (int) $info['result']; }
    }
    $out = [];
    $save = $pdo->prepare('INSERT INTO link_checks(url,status,final_url,archive_url,error,checked_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(url) DO UPDATE SET status=excluded.status, final_url=excluded.final_url, archive_url=excluded.archive_url, error=excluded.error, checked_at=CURRENT_TIMESTAMP');
    foreach ($urls as $u) {
        if (isset($refused[$u])) {
            $error = 'Adresse locale ou introuvable : non vérifiée';
            $save->execute([$u, null, '', '', $error]);
            $out[] = ['url' => $u, 'status' => 0, 'ok' => false, 'doubtful' => true, 'final_url' => '', 'archive_url' => '', 'error' => $error];
            continue;
        }
        $ch = $handles[$u];
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $location = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: '');
        $errno = $results[spl_object_id($ch)] ?? curl_errno($ch);
        $error = $errno ? curl_strerror($errno) : '';
        curl_multi_remove_handle($mh, $ch);
        $final = $u;
        if ($location !== '') {
            [$code, $final, $hopError] = link_follow_redirects($code, $u, $location);
            if ($hopError !== '') $error = $hopError;
        }
        // Certificat du site incomplet (les navigateurs le complètent, pas curl) : on regarde seulement si la page répond
        if (!$code && in_array($errno, [60, 77], true) && ($resolve = link_safe_resolve($u)) !== null) {
            $retry = curl_init($u);
            curl_setopt_array($retry, [CURLOPT_NOBODY => true] + link_curl_options($resolve, false));
            curl_exec($retry);
            $code = (int) curl_getinfo($retry, CURLINFO_RESPONSE_CODE);
            $location = (string) (curl_getinfo($retry, CURLINFO_REDIRECT_URL) ?: '');
            unset($retry); // curl_close() : sans effet depuis PHP 8, obsolète en 8.5
            $final = $u;
            if ($location !== '') { [$code, $final] = link_follow_redirects($code, $u, $location, false); }
            $error = $code ? 'Certificat du site incomplet (la page répond)' : $error;
        }
        $ok = ($code >= 200 && $code < 400) || $code === 416; // 416 : la page existe (plage refusée)
        // 401/403/429 : le site refuse les robots ou demande un compte ; la page existe sans doute
        $doubtful = in_array($code, [401, 403, 405, 429], true);
        $archive = '';
        if (!$ok && !$doubtful) { $archive = link_archive_copy($u); }
        $finalUrl = $ok && $final !== '' && link_really_moved($u, $final) ? $final : '';
        $save->execute([$u, $code ?: null, $finalUrl, $archive, $error, ]);
        $out[] = ['url' => $u, 'status' => $code, 'ok' => $ok, 'doubtful' => $doubtful, 'final_url' => $finalUrl, 'archive_url' => $archive, 'error' => $error];
    }
    curl_multi_close($mh);
    return ['checked' => $out];
}

/**
 * Une redirection est un vrai déménagement si le site change, ou si une page précise renvoie ailleurs sur le même site.
 * Une page d'accueil qui renvoie vers sa version française (« /fr/… ») ne compte pas.
 */
function link_really_moved(string $from, string $to): bool
{
    $a = parse_url($from); $b = parse_url($to);
    $host = static fn($p) => preg_replace('/^www\./', '', strtolower((string) ($p['host'] ?? '')));
    if ($host($a) !== $host($b)) { return true; }
    $pa = rtrim((string) ($a['path'] ?? '/'), '/'); $pb = rtrim((string) ($b['path'] ?? '/'), '/');
    if ($pa === '' ) { return false; }
    return $pa !== $pb && !str_ends_with($pb, $pa);
}

/** Copie la plus proche sur Internet Archive (adresse « web.archive.org/web/… »), ou chaîne vide. */
function link_archive_copy(string $url): string
{
    $ch = curl_init('https://archive.org/wayback/available?url=' . rawurlencode($url));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_USERAGENT => 'LCNDA (verification de liens)'] + lcnda_curl_tls());
    $body = curl_exec($ch);
    unset($ch);
    $data = is_string($body) ? json_decode($body, true) : null;
    $snap = $data['archived_snapshots']['closest'] ?? null;
    return is_array($snap) && !empty($snap['available']) && preg_match('#^https?://web\.archive\.org/#', (string) ($snap['url'] ?? '')) ? (string) $snap['url'] : '';
}

/** Remplace une adresse par une autre partout où elle est enregistrée (après accord dans l'interface). */
function replace_link(PDO $pdo, array $data): array
{
    $old = trim((string) ($data['old'] ?? '')); $new = trim((string) ($data['new'] ?? ''));
    if (!preg_match('#^https?://#i', $old) || !preg_match('#^https?://#i', $new)) { throw new RuntimeException('Adresse invalide'); }
    $count = 0;
    foreach (link_inventory($pdo) as $row) {
        if ($row['url'] !== $old) { continue; }
        foreach ($row['uses'] as $use) {
            if (!preg_match('/^[a-z_]+$/', $use['table']) || !preg_match('/^[a-z_]+$/', $use['column'])) { continue; }
            if (!empty($use['contains'])) {
                $stmt = $pdo->prepare("UPDATE {$use['table']} SET {$use['column']}=replace({$use['column']},?,?) WHERE id=?");
                $stmt->execute([$old, $new, $use['id']]);
            } else {
                $stmt = $pdo->prepare("UPDATE {$use['table']} SET {$use['column']}=? WHERE id=? AND {$use['column']}=?");
                $stmt->execute([$new, $use['id'], $old]);
            }
            $count += $stmt->rowCount();
        }
    }
    $pdo->prepare('DELETE FROM link_checks WHERE url=?')->execute([$old]);
    log_change($pdo, 'link', null, 'update', "Lien remplacé ({$count}) : {$old} → {$new}");
    return ['replaced' => $count];
}

/* ─── Salons et événements de généalogie ─────────────────────────────── */

function genealogy_fairs_data(PDO $pdo): array
{
    $rows = $pdo->query("SELECT * FROM genealogy_fairs ORDER BY CASE WHEN COALESCE(NULLIF(date_end,''), date_start) >= date('now') OR date_start='' THEN 0 ELSE 1 END,
        CASE WHEN COALESCE(NULLIF(date_end,''), date_start) >= date('now') OR date_start='' THEN date_start END ASC, date_start DESC, id DESC")->fetchAll();
    foreach ($rows as &$r) {
        $r['link_list'] = array_values(array_filter(array_map(static function ($line) {
            $line = trim($line);
            if (!preg_match('#(https?://\S+)#i', $line, $m)) { return null; }
            $label = trim(str_replace($m[1], '', $line), " \t-–:|");
            return ['url' => $m[1], 'label' => $label];
        }, preg_split('/\R/u', (string) $r['links']))));
    }
    unset($r);
    return $rows;
}

function save_genealogy_fair(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    if ($title === '') { throw new RuntimeException('Donne un nom (ex. « Salon de généalogie de Paris »).'); }
    $date = static fn($v) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? (string) $v : '';
    $long = static fn($k) => trim(mb_substr((string) ($data[$k] ?? ''), 0, 8000));
    $start = $date($data['date_start'] ?? ''); $end = $date($data['date_end'] ?? '');
    if ($end !== '' && $start !== '' && $end < $start) { [$start, $end] = [$end, $start]; }
    $fields = [$title, safe_text($data['kind'] ?? ''), $start, $end, safe_text($data['hours_text'] ?? ''), safe_text($data['place_text'] ?? ''), safe_text($data['address'] ?? ''),
        $long('access_text'), $long('prepare_text'), $long('stands_text'), $long('links'), safe_text($data['price_text'] ?? ''), $long('notes'), !empty($data['attended']) ? 1 : 0];
    if ($id) {
        $pdo->prepare('UPDATE genealogy_fairs SET title=?,kind=?,date_start=?,date_end=?,hours_text=?,place_text=?,address=?,access_text=?,prepare_text=?,stands_text=?,links=?,price_text=?,notes=?,attended=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $id]);
        log_change($pdo, 'genealogy_fair', $id, 'update', 'Salon modifié : ' . $title);
    } else {
        $pdo->prepare('INSERT INTO genealogy_fairs(title,kind,date_start,date_end,hours_text,place_text,address,access_text,prepare_text,stands_text,links,price_text,notes,attended) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'genealogy_fair', $id, 'create', 'Salon ajouté : ' . $title);
    }
    // Rappel (dans la liste des Rappels et en notification) quelques jours avant
    $row = $pdo->prepare('SELECT reminder_id FROM genealogy_fairs WHERE id=?'); $row->execute([$id]); $reminderId = (int) $row->fetchColumn(); $row->closeCursor();
    $days = max(0, min(60, safe_int($data['remind_days'] ?? 0)));
    if (!empty($data['remind']) && $start !== '') {
        $due = date('Y-m-d', strtotime($start . ' -' . $days . ' days'));
        $text = 'Salon : ' . $title . ($fields[5] !== '' ? ' (' . $fields[5] . ')' : '');
        $exists = $reminderId ? (int) $pdo->query('SELECT count(*) FROM standalone_reminders WHERE id=' . $reminderId)->fetchColumn() : 0;
        if ($exists) {
            $pdo->prepare("UPDATE standalone_reminders SET title=?, reminder_due_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$text, $due, $reminderId]);
        } else {
            $pdo->prepare("INSERT INTO standalone_reminders(title,notes,reminder_mode,reminder_due_at,reminder_category) VALUES(?,?,'on',?,'Salons')")->execute([$text, 'Voir Listes → Salons et événements.', $due]);
            $pdo->prepare('UPDATE genealogy_fairs SET reminder_id=? WHERE id=?')->execute([(int) $pdo->lastInsertId(), $id]);
        }
    } elseif (empty($data['remind']) && $reminderId) {
        $pdo->prepare('DELETE FROM standalone_reminders WHERE id=? AND reminder_done=0')->execute([$reminderId]);
        $pdo->prepare('UPDATE genealogy_fairs SET reminder_id=NULL WHERE id=?')->execute([$id]);
    }
    return ['id' => $id];
}

function delete_genealogy_fair(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $row = $pdo->prepare('SELECT title, reminder_id FROM genealogy_fairs WHERE id=?'); $row->execute([$id]); $fair = $row->fetch(); $row->closeCursor();
    if (!$fair) { throw new RuntimeException('Salon introuvable'); }
    if ($fair['reminder_id']) { $pdo->prepare('DELETE FROM standalone_reminders WHERE id=? AND reminder_done=0')->execute([(int) $fair['reminder_id']]); }
    $pdo->prepare('DELETE FROM genealogy_fairs WHERE id=?')->execute([$id]);
    log_change($pdo, 'genealogy_fair', $id, 'delete', 'Salon supprimé : ' . $fair['title']);
    return ['deleted' => $id];
}
