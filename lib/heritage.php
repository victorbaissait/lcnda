<?php
declare(strict_types=1);

/**
 * Fiches « patrimoine » (structure n°9, lib/migrations.php) :
 *  - départs (voyages, émigration), enfants placés, armoiries, poilus (unités, journaux de marche) ;
 *  - circuits « sur les traces de mes ancêtres », inventaire des papiers de famille, cartes anciennes posées sur la carte ;
 *  - recherches enregistrées, prénoms de l'INSEE, inventaires après décès ;
 *  - copie de la base hors de cet ordinateur.
 * Les photos de ces fiches passent par family_collection_media (upload.php, collection_type + role).
 */

const HERITAGE_COLLECTION_TYPES = ['family_object', 'family_memory', 'voyage', 'placement', 'coat_of_arms', 'family_paper', 'old_map', 'probate_inventory', 'poilu', 'resistance', 'custom_block_entry', 'village', 'voter', 'custom_list_record', 'atelier_item', 'recueil', 'family_booklet', 'board', 'topic_sheet', 'pet', 'periodical_issue', 'periodical_article', 'press_ad'];
const PLACEMENT_KINDS = ['nourrice' => 'Mis en nourrice', 'abandon' => 'Abandonné', 'hospice' => 'Recueilli par l’hospice', 'assistance' => 'Pupille de l’Assistance publique', 'orphelinat' => 'Orphelinat', 'recueilli' => 'Recueilli par une famille', 'autre' => 'Autre placement'];
const POILU_EVENT_KINDS = ['incorpore' => 'Incorporé', 'blesse' => 'Blessé', 'malade' => 'Malade / évacué', 'gaze' => 'Gazé', 'prisonnier' => 'Fait prisonnier', 'disparu' => 'Disparu', 'tue' => 'Tué', 'cite' => 'Cité / décoré', 'permission' => 'Permission', 'mutation' => 'Changement d’unité', 'autre' => 'Autre'];
const PROBATE_CATEGORIES = ['meubles' => 'Meubles', 'betail' => 'Bétail', 'outils' => 'Outils', 'linge' => 'Linge', 'vetements' => 'Vêtements', 'vaisselle' => 'Vaisselle, cuisine', 'grains' => 'Grains, récoltes, provisions', 'argent' => 'Argent, créances', 'immeubles' => 'Maisons, terres', 'livres' => 'Livres, papiers', 'bijoux' => 'Bijoux', 'dettes' => 'Dettes (à déduire)', 'autre' => 'Autre'];
const FIELD_TRIP_KINDS = ['eglise' => 'Église', 'mairie' => 'Mairie', 'tombe' => 'Tombe / cimetière', 'maison' => 'Maison', 'archives' => 'Archives', 'monument' => 'Monument aux morts', 'autre' => 'Autre'];

/* ─── Outils communs ─────────────────────────────────────────────────── */

function h_long(array $data, string $key, int $max = 8000): string
{
    return trim(mb_substr((string) ($data[$key] ?? ''), 0, $max));
}

function h_year(string $text): ?int
{
    return preg_match('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', $text, $m) ? (int) $m[1] : null;
}

function h_coord(mixed $v, float $limit): ?float
{
    if ($v === null || $v === '' || !is_numeric(str_replace(',', '.', (string) $v))) { return null; }
    $f = (float) str_replace(',', '.', (string) $v);
    return abs($f) <= $limit ? $f : null;
}

function h_json_list(mixed $value): array
{
    if (is_array($value)) { return array_values($value); }
    $decoded = json_decode((string) $value, true);
    return is_array($decoded) ? array_values($decoded) : [];
}

function h_person_exists(PDO $pdo, int $id): void
{
    $stmt = $pdo->prepare('SELECT 1 FROM persons WHERE id=?');
    $stmt->execute([$id]);
    if (!$stmt->fetchColumn()) { throw new RuntimeException('Personne introuvable'); }
}

/** Médias d'une fiche, avec leur rôle (liste de passagers, papiers d'émigration, photo…). */
function heritage_media(PDO $pdo, string $type, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return []; }
    $stmt = $pdo->prepare('SELECT cm.collection_id, cm.role, m.id, m.title, m.filename, m.thumbnail, m.media_type FROM family_collection_media cm JOIN media m ON m.id=cm.media_id
        WHERE cm.collection_type=? AND cm.collection_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY cm.position, cm.id');
    $stmt->execute([$type, ...$ids]);
    $out = [];
    foreach ($stmt->fetchAll() as $m) { $out[(int) $m['collection_id']][] = $m; }
    return $out;
}

function heritage_delete_media_links(PDO $pdo, string $type, int $id): void
{
    $pdo->prepare('DELETE FROM family_collection_media WHERE collection_type=? AND collection_id=?')->execute([$type, $id]);
    $pdo->prepare('DELETE FROM label_links WHERE entity_type=? AND entity_id=?')->execute([$type, $id]); // étiquettes de la fiche
}

/** Rattache un média déjà dans l'application (ex. le scan d'un acte) à une fiche. */
function link_collection_media(PDO $pdo, array $data): array
{
    $type = safe_text($data['collection_type'] ?? '');
    $id = safe_int($data['collection_id'] ?? 0);
    $mediaId = safe_int($data['media_id'] ?? 0);
    if (!in_array($type, HERITAGE_COLLECTION_TYPES, true) || !$id || !$mediaId) { throw new RuntimeException('Lien impossible'); }
    $exists = $pdo->prepare('SELECT 1 FROM media WHERE id=?'); $exists->execute([$mediaId]);
    if (!$exists->fetchColumn()) { throw new RuntimeException('Média introuvable'); }
    $dup = $pdo->prepare('SELECT 1 FROM family_collection_media WHERE collection_type=? AND collection_id=? AND media_id=?');
    $dup->execute([$type, $id, $mediaId]);
    if (!$dup->fetchColumn()) {
        $pdo->prepare('INSERT INTO family_collection_media(collection_type,collection_id,media_id,position,role) VALUES(?,?,?,?,?)')
            ->execute([$type, $id, $mediaId, 999, mb_substr(safe_text($data['role'] ?? ''), 0, 40)]);
    }
    return ['ok' => true];
}

/** Médias de l'application dont le titre contient le texte cherché (pour lier un scan existant). */
function heritage_media_search(PDO $pdo, string $q): array
{
    if (mb_strlen($q) < 2) { return []; }
    $stmt = $pdo->prepare("SELECT id, title, filename, thumbnail, media_type, document_reference FROM media
        WHERE title LIKE ? COLLATE NOCASE OR document_reference LIKE ? COLLATE NOCASE OR document_title LIKE ? COLLATE NOCASE ORDER BY id DESC LIMIT 20");
    $stmt->execute(["%{$q}%", "%{$q}%", "%{$q}%"]);
    return $stmt->fetchAll();
}

/** Les photos à retoucher (Listes → Médias → « 🎚️ Retoucher ») : les plus récentes, ou celles qui répondent au filtre */
function heritage_image_pick(PDO $pdo, string $q, string $filter = ''): array
{
    // aussi par personne rattachée (nom, prénom), titre du document, date ; filtre : sans / avec transcription, avec signature repérée
    $cond = match ($filter) { 'notr' => " AND trim(COALESCE(m.transcription,''))=''", 'tr' => " AND trim(COALESCE(m.transcription,''))<>''",
        'sig' => " AND EXISTS(SELECT 1 FROM media_tags t WHERE t.media_id=m.id AND COALESCE(t.tag_type,'person')='signature')", default => '' };
    $like = "%{$q}%";
    $stmt = $pdo->prepare("SELECT m.id, m.title, m.filename, m.thumbnail, m.media_type, m.date_text, COALESCE(m.document_reference,'') AS document_reference, CASE WHEN trim(COALESCE(m.transcription,''))<>'' THEN 1 ELSE 0 END AS has_tr, substr(COALESCE(m.transcription,''), 1, 20000) AS transcription,
            (SELECT group_concat(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')), ', ') FROM (SELECT DISTINCT entity_id FROM media_links WHERE media_id=m.id AND entity_type='person' LIMIT 3) l JOIN persons p ON p.id=l.entity_id) AS people
        FROM media m WHERE lower(m.media_type)='image' AND m.filename<>'' {$cond}
        AND (?='' OR m.title LIKE ? COLLATE NOCASE OR m.document_reference LIKE ? COLLATE NOCASE OR m.document_title LIKE ? COLLATE NOCASE OR m.filename LIKE ? COLLATE NOCASE OR m.date_text LIKE ? COLLATE NOCASE
            OR m.id IN (SELECT ml.media_id FROM media_links ml JOIN persons p ON ml.entity_type='person' AND p.id=ml.entity_id WHERE trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) LIKE ? COLLATE NOCASE OR trim(COALESCE(p.last_name,'')||' '||COALESCE(p.first_name,'')) LIKE ? COLLATE NOCASE))
        ORDER BY m.id DESC LIMIT 160");
    $stmt->execute([$q, $like, $like, $like, $like, $like, $like, $like]);
    return $stmt->fetchAll();
}

/**
 * Coordonnées d'un lieu écrit à la main (« Le Havre », « Québec, Canada », « Buenos Aires (Argentine) ») : lieu de la base
 * d'abord, puis villes du monde livrées avec l'application. Null si rien de sûr.
 */
function heritage_geocode(PDO $pdo, string $text): ?array
{
    $text = trim($text);
    if ($text === '') { return null; }
    $parts = preg_split('/\s*[,(;]\s*/u', $text);
    $name = trim((string) ($parts[0] ?? ''), " )\t");
    $hint = trim(implode(' ', array_slice($parts, 1)), " )\t"); // « Boston, États-Unis », « Saint-Martin (Nord) »…
    if ($name === '') { return null; }
    $cands = [];
    $stmt = $pdo->prepare("SELECT name, county, state, country, latitude, longitude, COALESCE(population,0) AS population FROM places
        WHERE name = ? COLLATE NOCASE AND latitude IS NOT NULL AND longitude IS NOT NULL AND (latitude <> 0 OR longitude <> 0) LIMIT 30");
    try { $stmt->execute([$name]); } catch (Throwable $_) { $stmt = $pdo->prepare("SELECT name, county, state, country, latitude, longitude, 0 AS population FROM places WHERE name = ? COLLATE NOCASE AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 30"); $stmt->execute([$name]); }
    foreach ($stmt->fetchAll() as $r) { $cands[] = ['row' => $r, 'state' => $r['county'] ?: $r['state'], 'base' => 1]; }
    try { $world = world_place_suggestions($name, '', 12); } catch (Throwable $_) { $world = []; }
    foreach ($world as $w) {
        if (world_search_key((string) $w['name']) !== world_search_key($name)) { continue; }
        $cands[] = ['row' => $w, 'state' => $w['state'], 'base' => 0];
    }
    if (!$cands) { return null; }
    $hintKey = world_search_key($hint);
    $score = static function (array $c) use ($hintKey): array {
        $r = $c['row'];
        $match = $hintKey !== '' && (str_contains(world_search_key((string) $r['country'] . ' ' . $c['state'] . ' ' . ($r['county'] ?? '') . ' ' . ($r['state'] ?? '')), $hintKey)) ? 1 : 0;
        return [$match, (int) ($r['population'] ?? 0), $c['base']];
    };
    usort($cands, static fn($a, $b) => $score($b) <=> $score($a));
    $best = $cands[0];
    return ['lat' => (float) $best['row']['latitude'], 'lon' => (float) $best['row']['longitude'], 'label' => implode(', ', array_filter([$best['row']['name'], $best['state'], $best['row']['country']]))];
}

/** Suggestions de lieux (base + villes du monde) avec coordonnées : nom exact d'abord, puis les plus peuplées. */
function heritage_place_search(PDO $pdo, string $q, int $limit = 12): array
{
    if (mb_strlen($q) < 2) { return []; }
    $rows = [];
    $stmt = $pdo->prepare("SELECT name, county, state, country, latitude, longitude, COALESCE(population,0) AS population FROM places
        WHERE name LIKE ? COLLATE NOCASE AND latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY CASE WHEN name LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, COALESCE(population,0) DESC, name COLLATE NOCASE LIMIT " . max(1, min(100, $limit)));
    try {
        $stmt->execute(["%{$q}%", "{$q}%"]);
    } catch (Throwable $_) { // anciennes bases sans colonne population
        $stmt = $pdo->prepare("SELECT name, county, state, country, latitude, longitude, 0 AS population FROM places WHERE name LIKE ? COLLATE NOCASE AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY name COLLATE NOCASE LIMIT " . max(1, min(100, $limit)));
        $stmt->execute(["{$q}%"]);
    }
    foreach ($stmt->fetchAll() as $r) { $rows[] = ['name' => $r['name'], 'sub' => $r['county'] ?: $r['state'], 'country' => $r['country'], 'lat' => $r['latitude'], 'lon' => $r['longitude'], 'pop' => (int) $r['population']]; }
    try {
        foreach (world_place_suggestions($q, '', 12) as $w) { $rows[] = ['name' => $w['name'], 'sub' => $w['state'], 'country' => $w['country'], 'lat' => $w['latitude'], 'lon' => $w['longitude'], 'pop' => (int) $w['population']]; }
    } catch (Throwable $_) {}
    $key = world_search_key($q);
    $rank = static fn($r) => [world_search_key((string) $r['name']) === $key ? 2 : (str_starts_with(world_search_key((string) $r['name']), $key) ? 1 : 0), $r['pop']];
    usort($rows, static fn($a, $b) => $rank($b) <=> $rank($a));
    $out = [];
    foreach ($rows as $r) {
        $label = implode(', ', array_filter([$r['name'], $r['sub'], $r['country']]));
        // Même ville déjà vue (base et répertoire mondial) : une seule ligne
        $dup = world_search_key($r['name'] . ' ' . $r['country']) . round((float) $r['lat'], 1) . round((float) $r['lon'], 1);
        if (isset($out[$dup])) { continue; }
        $out[$dup] = ['label' => $label, 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon']];
    }
    return array_values(array_slice($out, 0, 12));
}

/** Coordonnées envoyées par le formulaire, sinon trouvées à partir du texte du lieu. */
function h_place_coords(PDO $pdo, array $data, string $textKey, string $latKey, string $lonKey): array
{
    $lat = h_coord($data[$latKey] ?? null, 90); $lon = h_coord($data[$lonKey] ?? null, 180);
    if ($lat !== null && $lon !== null) { return [$lat, $lon]; }
    $g = heritage_geocode($pdo, safe_text($data[$textKey] ?? ''));
    return $g ? [$g['lat'], $g['lon']] : [null, null];
}

/* ─── 🚢 Départs : voyages et émigration ─────────────────────────────── */

function voyages_data(PDO $pdo, int $personId = 0): array
{
    $sql = 'SELECT v.*, trim(p.first_name||\' \'||p.last_name) AS person_name, p.gender FROM person_voyages v JOIN persons p ON p.id=v.person_id';
    if ($personId) {
        // Voyage commun : il apparaît aussi sur la fiche de chacun des compagnons
        $stmt = $pdo->prepare($sql . ' WHERE v.person_id=? OR v.id IN (SELECT voyage_id FROM voyage_people WHERE person_id=?) ORDER BY COALESCE(v.departure_year, 9999), v.id');
        $stmt->execute([$personId, $personId]);
    } else {
        $stmt = $pdo->query($sql . ' ORDER BY COALESCE(v.departure_year, 9999), v.id');
    }
    $rows = $stmt->fetchAll();
    $media = heritage_media($pdo, 'voyage', array_column($rows, 'id'));
    $companions = [];
    if ($rows) {
        $ids = array_map(static fn($r) => (int) $r['id'], $rows);
        $cp = $pdo->prepare('SELECT * FROM voyage_people WHERE voyage_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY id');
        $cp->execute($ids);
        $cpRows = $cp->fetchAll();
        $people = collection_people($pdo, array_column($cpRows, 'person_id'));
        foreach ($cpRows as $c) { if (isset($people[(int) $c['person_id']])) { $companions[(int) $c['voyage_id']][] = $c + ['person' => $people[(int) $c['person_id']]]; } }
    }
    foreach ($rows as &$r) {
        $r['media'] = $media[(int) $r['id']] ?? [];
        $r['route'] = h_json_list($r['route_json']);
        $r['companion_people'] = $companions[(int) $r['id']] ?? [];
        unset($r['route_json']);
    }
    unset($r);
    return with_labels($pdo, 'voyage', $rows);
}

function save_voyage(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    h_person_exists($pdo, $personId);
    [$depLat, $depLon] = h_place_coords($pdo, $data, 'departure_port', 'dep_lat', 'dep_lon');
    $byPort = safe_text($data['arrival_port'] ?? '') !== '';
    // Sans port d'arrivée, la destination (champ sans suggestions) est toujours re-cherchée : les coordonnées postées
    // pouvaient venir d'une ancienne destination
    [$destLat, $destLon] = h_place_coords($pdo, $byPort ? $data : array_diff_key($data, ['dest_lat' => 1, 'dest_lon' => 1]), $byPort ? 'arrival_port' : 'destination', 'dest_lat', 'dest_lon');
    $departure = safe_text($data['departure_date'] ?? '');
    $fields = [
        $personId, $departure, h_year($departure), safe_text($data['departure_port'] ?? ''), safe_text($data['ship_name'] ?? ''),
        safe_text($data['destination'] ?? ''), safe_text($data['arrival_date'] ?? ''), safe_text($data['arrival_port'] ?? ''), h_long($data, 'reason', 2000),
        h_long($data, 'companions', 4000), safe_text($data['passenger_list_ref'] ?? ''), safe_text($data['passenger_list_url'] ?? ''), h_long($data, 'passenger_list_text', 20000),
        safe_text($data['naturalization_date'] ?? ''), safe_text($data['naturalization_place'] ?? ''), h_long($data, 'naturalization_text', 20000),
        h_long($data, 'papers_text', 40000), h_long($data, 'notes', 20000), $depLat, $depLon, $destLat, $destLon,
        h_long($data, 'stopovers', 2000), json_encode(voyage_route($pdo, $data, [$depLat, $depLon], [$destLat, $destLon]), JSON_UNESCAPED_UNICODE),
    ];
    $cols = 'person_id,departure_date,departure_year,departure_port,ship_name,destination,arrival_date,arrival_port,reason,companions,passenger_list_ref,passenger_list_url,passenger_list_text,naturalization_date,naturalization_place,naturalization_text,papers_text,notes,dep_lat,dep_lon,dest_lat,dest_lon,stopovers,route_json';
    if ($id) {
        $set = implode(',', array_map(static fn($c) => "{$c}=?", explode(',', $cols)));
        $pdo->prepare("UPDATE person_voyages SET {$set}, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...$fields, $id]);
        log_change($pdo, 'person', $personId, 'update', 'Voyage modifié : ' . ($fields[4] ?: $fields[5] ?: 'départ'));
    } else {
        $pdo->prepare("INSERT INTO person_voyages({$cols}) VALUES(" . implode(',', array_fill(0, count($fields), '?')) . ')')->execute($fields);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'person', $personId, 'update', 'Voyage ajouté : ' . ($fields[4] ?: $fields[5] ?: 'départ'));
        $pdo->prepare('UPDATE persons SET show_voyage_block=1 WHERE id=?')->execute([$personId]);
    }
    // Partis ensemble : chaque compagnon a sa fiche, et sa propre naturalisation à l'arrivée
    if (isset($data['companion_people']) && is_array($data['companion_people'])) {
        $prev = $pdo->prepare('SELECT person_id FROM voyage_people WHERE voyage_id=?'); $prev->execute([$id]);
        $before = array_fill_keys(array_map('intval', $prev->fetchAll(PDO::FETCH_COLUMN)), true);
        $pdo->prepare('DELETE FROM voyage_people WHERE voyage_id=?')->execute([$id]);
        $ins = $pdo->prepare('INSERT OR IGNORE INTO voyage_people(voyage_id, person_id, relation, naturalization_date, naturalization_place, naturalization_text) VALUES(?,?,?,?,?,?)');
        $flag = $pdo->prepare('UPDATE persons SET show_voyage_block=1 WHERE id=?');
        foreach ($data['companion_people'] as $c) {
            $pid = safe_int(is_array($c) ? ($c['person_id'] ?? 0) : 0);
            if (!$pid || $pid === $personId) { continue; }
            $ins->execute([$id, $pid, safe_text($c['relation'] ?? ''), safe_text($c['naturalization_date'] ?? ''), safe_text($c['naturalization_place'] ?? ''), h_long($c, 'naturalization_text', 8000)]);
            if (!isset($before[$pid])) { $flag->execute([$pid]); }
        }
    }
    return ['id' => $id, 'dep' => [$depLat, $depLon], 'dest' => [$destLat, $destLon]];
}

/**
 * Trajet du voyage : port de départ, escales (une par ligne), port d'arrivée, puis destination finale si elle est
 * ailleurs (trajet à terre, dessiné en pointillés).
 */
function voyage_route(PDO $pdo, array $data, array $dep, array $arrival): array
{
    $route = [];
    if ($dep[0] !== null) { $route[] = ['label' => safe_text($data['departure_port'] ?? ''), 'lat' => $dep[0], 'lon' => $dep[1], 'kind' => 'depart']; }
    foreach (preg_split('/\R|;/u', (string) ($data['stopovers'] ?? '')) as $line) {
        $line = trim($line);
        if ($line === '') { continue; }
        if ($g = heritage_geocode($pdo, $line)) { $route[] = ['label' => $line, 'lat' => $g['lat'], 'lon' => $g['lon'], 'kind' => 'escale']; }
    }
    if ($arrival[0] !== null) { $route[] = ['label' => safe_text($data['arrival_port'] ?? '') ?: safe_text($data['destination'] ?? ''), 'lat' => $arrival[0], 'lon' => $arrival[1], 'kind' => 'arrivee']; }
    $dest = safe_text($data['destination'] ?? '');
    if ($dest !== '' && safe_text($data['arrival_port'] ?? '') !== '' && mb_strtolower($dest) !== mb_strtolower(safe_text($data['arrival_port'] ?? ''))) {
        if ($g = heritage_geocode($pdo, $dest)) { $route[] = ['label' => $dest, 'lat' => $g['lat'], 'lon' => $g['lon'], 'kind' => 'destination']; }
    }
    return $route;
}

function delete_voyage(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $row = $pdo->prepare('SELECT person_id FROM person_voyages WHERE id=?'); $row->execute([$id]); $personId = (int) $row->fetchColumn();
    if (!$personId) { throw new RuntimeException('Voyage introuvable'); }
    heritage_delete_media_links($pdo, 'voyage', $id);
    $pdo->prepare('DELETE FROM person_voyages WHERE id=?')->execute([$id]);
    log_change($pdo, 'person', $personId, 'update', 'Voyage supprimé');
    return ['deleted' => $id];
}

/* ─── 👶 Enfants placés ──────────────────────────────────────────────── */

function placements_data(PDO $pdo, int $personId = 0): array
{
    $sql = 'SELECT c.*, trim(p.first_name||\' \'||p.last_name) AS person_name, p.gender, trim(n.first_name||\' \'||n.last_name) AS nurse_person_name
        FROM child_placements c JOIN persons p ON p.id=c.person_id LEFT JOIN persons n ON n.id=c.nurse_person_id';
    if ($personId) {
        $stmt = $pdo->prepare($sql . ' WHERE c.person_id=? ORDER BY COALESCE(c.start_year, 9999), c.id');
        $stmt->execute([$personId]);
    } else {
        $stmt = $pdo->query($sql . ' ORDER BY COALESCE(c.start_year, 9999), c.id');
    }
    $rows = $stmt->fetchAll();
    $media = heritage_media($pdo, 'placement', array_column($rows, 'id'));
    foreach ($rows as &$r) {
        $r['media'] = $media[(int) $r['id']] ?? [];
        $r['kind_label'] = PLACEMENT_KINDS[$r['kind']] ?? $r['kind'];
        $r['duration'] = placement_duration($r);
    }
    unset($r);
    return with_labels($pdo, 'placement', $rows);
}

/** Durée lisible (« 2 ans et 3 mois ») d'après les dates, sinon le texte saisi. */
function placement_duration(array $r): string
{
    if (trim((string) $r['duration_text']) !== '') { return (string) $r['duration_text']; }
    $parse = static function (string $v): ?DateTimeImmutable {
        // Date impossible (« 12/25/1880 », 31 février…) : pas de durée calculée, jamais d'erreur
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { return new DateTimeImmutable($v); }
        if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $v, $m) && checkdate((int) $m[2], (int) $m[1], (int) $m[3])) { return new DateTimeImmutable(sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1])); }
        return null;
    };
    $a = $parse((string) $r['start_date']); $b = $parse((string) $r['end_date']);
    if ($a && $b && $b >= $a) {
        $d = $a->diff($b);
        $parts = [];
        if ($d->y) { $parts[] = $d->y . ' an' . ($d->y > 1 ? 's' : ''); }
        if ($d->m) { $parts[] = $d->m . ' mois'; }
        if (!$d->y && !$d->m) { $parts[] = $d->d . ' jour' . ($d->d > 1 ? 's' : ''); }
        return implode(' et ', $parts);
    }
    if ($r['start_year'] && $r['end_year'] && $r['end_year'] >= $r['start_year']) {
        $n = (int) $r['end_year'] - (int) $r['start_year'];
        return $n ? "environ {$n} an" . ($n > 1 ? 's' : '') : 'moins d’un an';
    }
    return '';
}

function save_placement(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    h_person_exists($pdo, $personId);
    $kind = array_key_exists((string) ($data['kind'] ?? ''), PLACEMENT_KINDS) ? (string) $data['kind'] : 'autre';
    [$lat, $lon] = h_place_coords($pdo, $data, 'place_text', 'lat', 'lon');
    [$oLat, $oLon] = h_place_coords($pdo, $data, 'origin_text', 'origin_lat', 'origin_lon');
    $start = safe_text($data['start_date'] ?? ''); $end = safe_text($data['end_date'] ?? '');
    $fields = [$personId, $kind, safe_text($data['institution'] ?? ''), safe_text($data['matricule'] ?? ''), $start, h_year($start), $end, h_year($end),
        safe_text($data['duration_text'] ?? ''), safe_text($data['origin_text'] ?? ''), $oLat, $oLon, safe_text($data['place_text'] ?? ''), $lat, $lon,
        safe_text($data['nurse_name'] ?? ''), safe_int($data['nurse_person_id'] ?? 0) ?: null, safe_text($data['wage_text'] ?? ''), safe_text($data['outcome'] ?? ''), h_long($data, 'notes', 40000)];
    $cols = 'person_id,kind,institution,matricule,start_date,start_year,end_date,end_year,duration_text,origin_text,origin_lat,origin_lon,place_text,lat,lon,nurse_name,nurse_person_id,wage_text,outcome,notes';
    if ($id) {
        $set = implode(',', array_map(static fn($c) => "{$c}=?", explode(',', $cols)));
        $pdo->prepare("UPDATE child_placements SET {$set}, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...$fields, $id]);
    } else {
        $pdo->prepare("INSERT INTO child_placements({$cols}) VALUES(" . implode(',', array_fill(0, count($fields), '?')) . ')')->execute($fields);
        $id = (int) $pdo->lastInsertId();
        $pdo->prepare('UPDATE persons SET show_placement_block=1 WHERE id=?')->execute([$personId]);
    }
    log_change($pdo, 'person', $personId, 'update', 'Placement d’enfant enregistré : ' . PLACEMENT_KINDS[$kind] . ($fields[12] !== '' ? ' à ' . $fields[12] : ''));
    return ['id' => $id];
}

function delete_placement(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $row = $pdo->prepare('SELECT person_id FROM child_placements WHERE id=?'); $row->execute([$id]); $personId = (int) $row->fetchColumn();
    if (!$personId) { throw new RuntimeException('Placement introuvable'); }
    heritage_delete_media_links($pdo, 'placement', $id);
    $pdo->prepare('DELETE FROM child_placements WHERE id=?')->execute([$id]);
    log_change($pdo, 'person', $personId, 'update', 'Placement d’enfant supprimé');
    return ['deleted' => $id];
}

/* ─── 🛡️ Armoiries ───────────────────────────────────────────────────── */

function coats_of_arms_data(PDO $pdo, int $personId = 0, string $q = ''): array
{
    $where = []; $params = [];
    if ($personId) { $where[] = 'c.id IN (SELECT coat_id FROM coat_of_arms_people WHERE person_id=?)'; $params[] = $personId; }
    if ($q !== '') { $where[] = '(c.title LIKE ? OR c.blazon LIKE ? OR c.motto LIKE ? OR c.id IN (SELECT cp.coat_id FROM coat_of_arms_people cp JOIN persons p ON p.id=cp.person_id WHERE p.last_name LIKE ?))'; array_push($params, "%{$q}%", "%{$q}%", "%{$q}%", "%{$q}%"); }
    $stmt = $pdo->prepare('SELECT c.* FROM coats_of_arms c' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY c.title COLLATE NOCASE, c.id');
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    if (!$rows) { return []; }
    $ids = array_map(static fn($r) => (int) $r['id'], $rows);
    $links = $pdo->prepare('SELECT * FROM coat_of_arms_people WHERE coat_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY id');
    $links->execute($ids);
    $byCoat = []; $personIds = [];
    foreach ($links->fetchAll() as $l) { $byCoat[(int) $l['coat_id']][] = $l; $personIds[] = (int) $l['person_id']; }
    $people = collection_people($pdo, $personIds);
    $media = heritage_media($pdo, 'coat_of_arms', $ids);
    foreach ($rows as &$r) {
        $r['people'] = array_values(array_filter(array_map(static fn($l) => isset($people[(int) $l['person_id']]) ? ['person' => $people[(int) $l['person_id']], 'note' => $l['note']] : null, $byCoat[(int) $r['id']] ?? [])));
        $r['media'] = $media[(int) $r['id']] ?? [];
    }
    unset($r);
    return with_labels($pdo, 'coat_of_arms', $rows);
}

function save_coat_of_arms(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    if ($title === '') { throw new RuntimeException('Donne un nom aux armoiries (ex. « Armes de la famille de Montferrand »).'); }
    $fields = [$title, h_long($data, 'blazon', 4000), safe_text($data['motto'] ?? ''), safe_text($data['title_of_nobility'] ?? ''), h_long($data, 'origin_text', 4000), h_long($data, 'notes', 20000)];
    if ($id) {
        $pdo->prepare('UPDATE coats_of_arms SET title=?,blazon=?,motto=?,title_of_nobility=?,origin_text=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $id]);
        log_change($pdo, 'coat_of_arms', $id, 'update', 'Armoiries modifiées : ' . $title);
    } else {
        $pdo->prepare('INSERT INTO coats_of_arms(title,blazon,motto,title_of_nobility,origin_text,notes) VALUES(?,?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'coat_of_arms', $id, 'create', 'Armoiries ajoutées : ' . $title);
    }
    if (isset($data['people']) && is_array($data['people'])) {
        $prev = $pdo->prepare('SELECT person_id FROM coat_of_arms_people WHERE coat_id=?'); $prev->execute([$id]);
        $before = array_fill_keys(array_map('intval', $prev->fetchAll(PDO::FETCH_COLUMN)), true);
        $pdo->prepare('DELETE FROM coat_of_arms_people WHERE coat_id=?')->execute([$id]);
        $ins = $pdo->prepare('INSERT OR IGNORE INTO coat_of_arms_people(coat_id,person_id,note) VALUES(?,?,?)');
        $flag = $pdo->prepare('UPDATE persons SET show_heraldry_block=1 WHERE id=?');
        foreach ($data['people'] as $p) {
            $pid = safe_int(is_array($p) ? ($p['person_id'] ?? 0) : $p);
            if (!$pid) { continue; }
            $ins->execute([$id, $pid, is_array($p) ? safe_text($p['note'] ?? '') : '']);
            if (!isset($before[$pid])) { $flag->execute([$pid]); } // nouveau porteur : le bloc Blason s'affiche sur sa fiche
        }
    }
    return ['id' => $id];
}

function delete_coat_of_arms(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $row = $pdo->prepare('SELECT title FROM coats_of_arms WHERE id=?'); $row->execute([$id]); $title = $row->fetchColumn();
    if ($title === false) { throw new RuntimeException('Armoiries introuvables'); }
    heritage_delete_media_links($pdo, 'coat_of_arms', $id);
    $pdo->prepare('DELETE FROM coat_of_arms_people WHERE coat_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM coats_of_arms WHERE id=?')->execute([$id]);
    log_change($pdo, 'coat_of_arms', $id, 'delete', 'Armoiries supprimées : ' . $title);
    return ['deleted' => $id];
}

/* ─── 🎖️ Poilus : unités et journaux de marche ───────────────────────── */

function poilu_data(PDO $pdo, int $personId): array
{
    $units = $pdo->prepare('SELECT * FROM poilu_units WHERE person_id=? ORDER BY COALESCE(NULLIF(date_from,\'\'),\'9999\'), position, id');
    $units->execute([$personId]);
    $events = $pdo->prepare('SELECT * FROM poilu_events WHERE person_id=? ORDER BY COALESCE(NULLIF(event_date,\'\'),\'9999\'), id');
    $events->execute([$personId]);
    $eventRows = $events->fetchAll();
    foreach ($eventRows as &$e) { $e['kind_label'] = POILU_EVENT_KINDS[$e['kind']] ?? $e['kind']; }
    unset($e);
    return ['units' => $units->fetchAll(), 'events' => $eventRows, 'labels' => collection_labels($pdo, 'poilu', [$personId])[$personId] ?? []];
}

/** Tous les poilus de la base (case cochée, ou unité saisie), avec leurs unités et leurs événements datés. */
function poilus_overview(PDO $pdo): array
{
    $rows = $pdo->query("SELECT DISTINCT p.id FROM persons p LEFT JOIN poilu_units u ON u.person_id=p.id WHERE p.show_poilu_block=1 OR u.id IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    $people = collection_people($pdo, $rows);
    $out = [];
    foreach ($people as $id => $p) { $out[] = ['person' => $p] + poilu_data($pdo, (int) $id); }
    usort($out, static fn($a, $b) => strcmp((string) $a['person']['last_name'], (string) $b['person']['last_name']));
    return $out;
}

function save_poilu(PDO $pdo, array $data): array
{
    $personId = safe_int($data['person_id'] ?? 0);
    h_person_exists($pdo, $personId);
    $had = (int) $pdo->query('SELECT (SELECT count(*) FROM poilu_units WHERE person_id=' . $personId . ')+(SELECT count(*) FROM poilu_events WHERE person_id=' . $personId . ')')->fetchColumn();
    $date = static fn($v) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? (string) $v : (preg_match('/^\d{4}(-\d{2})?$/', (string) $v) ? (string) $v : '');
    $pdo->prepare('DELETE FROM poilu_units WHERE person_id=?')->execute([$personId]);
    $ins = $pdo->prepare('INSERT INTO poilu_units(person_id,unit_name,date_from,date_to,jmo_cote,jmo_url,note,position) VALUES(?,?,?,?,?,?,?,?)');
    foreach (array_values(is_array($data['units'] ?? null) ? $data['units'] : []) as $i => $u) {
        if (!is_array($u) || safe_text($u['unit_name'] ?? '') === '') { continue; }
        $url = safe_text($u['jmo_url'] ?? '');
        if ($url !== '' && !preg_match('#^https?://#i', $url)) { $url = ''; }
        $ins->execute([$personId, safe_text($u['unit_name']), $date($u['date_from'] ?? ''), $date($u['date_to'] ?? ''), safe_text($u['jmo_cote'] ?? ''), $url, safe_text($u['note'] ?? ''), $i]);
    }
    $pdo->prepare('DELETE FROM poilu_events WHERE person_id=?')->execute([$personId]);
    $ins = $pdo->prepare('INSERT INTO poilu_events(person_id,event_date,kind,place_text,note) VALUES(?,?,?,?,?)');
    foreach (is_array($data['events'] ?? null) ? $data['events'] : [] as $e) {
        if (!is_array($e)) { continue; }
        $d = $date($e['event_date'] ?? '');
        $kind = array_key_exists((string) ($e['kind'] ?? ''), POILU_EVENT_KINDS) ? (string) $e['kind'] : 'autre';
        if ($d === '' && safe_text($e['note'] ?? '') === '' && safe_text($e['place_text'] ?? '') === '') { continue; }
        $ins->execute([$personId, $d, $kind, safe_text($e['place_text'] ?? ''), safe_text($e['note'] ?? '')]);
    }
    $has = (int) $pdo->query('SELECT (SELECT count(*) FROM poilu_units WHERE person_id=' . $personId . ') + (SELECT count(*) FROM poilu_events WHERE person_id=' . $personId . ')')->fetchColumn();
    if (!$had && $has) { $pdo->prepare('UPDATE persons SET show_poilu_block=1 WHERE id=?')->execute([$personId]); }
    log_change($pdo, 'person', $personId, 'update', 'Parcours de poilu (14-18) enregistré');
    return ['ok' => true] + poilu_data($pdo, $personId);
}

/* ─── Données de la fiche personne ───────────────────────────────────── */

function heritage_person_data(PDO $pdo, int $personId): array
{
    $inv = probate_inventories_data($pdo, $personId);
    return [
        'voyages' => voyages_data($pdo, $personId),
        'placements' => placements_data($pdo, $personId),
        'coats_of_arms' => coats_of_arms_data($pdo, $personId),
        'poilu' => poilu_data($pdo, $personId),
        'probate_inventories' => $inv,
        'family_papers' => family_papers_data($pdo, '', $personId),
        'parishes' => person_parishes($pdo, $personId),
        'languages' => function_exists('person_languages_resolved') ? person_languages_resolved($pdo, $personId) : null,
        'event_languages' => function_exists('record_languages_for') ? record_languages_for($pdo, 'event', array_map('intval', $pdo->query('SELECT id FROM events WHERE person_id=' . $personId . ' OR family_id IN (SELECT id FROM families WHERE partner1_id=' . $personId . ' OR partner2_id=' . $personId . ')')->fetchAll(PDO::FETCH_COLUMN))) : [],
        'mentions' => function_exists('person_mentions') ? person_mentions($pdo, $personId) : [],
        'resistance' => function_exists('resistance_data') ? resistance_data($pdo, $personId) : null,
        'voter' => function_exists('voter_data') ? voter_data($pdo, $personId) : null,
        'booklets' => function_exists('booklet_person_mentions') ? booklet_person_mentions($pdo, $personId) : [],
        'artist' => function_exists('artist_items_for') ? artist_items_for($pdo, $personId) : [],
        'pets' => function_exists('pets_for_person') ? pets_for_person($pdo, $personId) : [],
        'animal' => function_exists('pet_of_person') && (string) $pdo->query('SELECT kind FROM persons WHERE id=' . $personId)->fetchColumn() === 'animal' && pet_of_person($pdo, $personId) ? pet_detail($pdo, pet_of_person($pdo, $personId)) : null,
        'boards' => function_exists('boards_linked') ? boards_linked($pdo, 'person', $personId) : [],
        'custom_blocks' => function_exists('custom_blocks_for_person') ? custom_blocks_for_person($pdo, $personId) : [],
        'recueils' => function_exists('recueils_for_entity') ? recueils_for_entity($pdo, 'person', (string) $personId) : [],
        'houses' => function_exists('house_links_lookup') ? house_links_lookup($pdo, $personId, 0) : [], // 🏠 les maisons de famille où elle a vécu (lib/houses.php)
    ];
}

/** Paroisses d'Ancien Régime des lieux où cette personne a des événements : place_id → rattachements. */
function person_parishes(PDO $pdo, int $personId): array
{
    if (!function_exists('parish_map')) { return []; }
    $stmt = $pdo->prepare("SELECT DISTINCT e.place_id FROM events e WHERE e.place_id IS NOT NULL AND (e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))");
    $stmt->execute([$personId, $personId, $personId]);
    $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    if (!$ids) { return []; }
    $map = parish_map($pdo)['by_place'];
    $out = [];
    foreach ($ids as $id) { if (isset($map[$id])) { $out[$id] = $map[$id]; } }
    return $out;
}

/** Widgets du tableau de bord : tous les voyages, placements, armoiries et poilus. */
function heritage_overview(PDO $pdo): array
{
    return [
        'voyages' => voyages_data($pdo),
        'placements' => placements_data($pdo),
        'coats_of_arms' => coats_of_arms_data($pdo),
        'poilus' => poilus_overview($pdo),
        'kinds' => ['placement' => PLACEMENT_KINDS, 'poilu' => POILU_EVENT_KINDS],
    ];
}

/* ─── 🚗 Circuits « sur les traces de mes ancêtres » ─────────────────── */

function h_parents(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?');
    $stmt->execute([$id]);
    $out = [];
    foreach ($stmt->fetchAll() as $f) { foreach ([$f['partner1_id'], $f['partner2_id']] as $p) { if ((int) $p) { $out[] = (int) $p; } } }
    return array_values(array_unique($out));
}

function h_children(PDO $pdo, array $parentIds): array
{
    $parentIds = array_values(array_filter(array_map('intval', $parentIds)));
    if (!$parentIds) { return []; }
    $marks = implode(',', array_fill(0, count($parentIds), '?'));
    $stmt = $pdo->prepare("SELECT DISTINCT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id IN ($marks) OR f.partner2_id IN ($marks)");
    $stmt->execute([...$parentIds, ...$parentIds]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** Une personne et ses ascendants (jusqu'à $generations générations au-dessus). */
function h_ancestors(PDO $pdo, int $id, int $generations = 30): array
{
    $seen = [$id => 1]; $level = [$id];
    for ($g = 0; $g < $generations && $level; $g++) {
        $next = [];
        foreach ($level as $pid) { foreach (h_parents($pdo, $pid) as $parent) { if (!isset($seen[$parent])) { $seen[$parent] = $g + 2; $next[] = $parent; } } }
        $level = $next;
    }
    return $seen;
}

/** Un couple (ou une personne) et tous ses descendants, avec les conjoints des descendants. */
function h_descendants(PDO $pdo, array $rootIds, int $generations = 30, bool $withSpouses = true): array
{
    $keep = array_fill_keys(array_filter(array_map('intval', $rootIds)), true);
    $level = array_keys($keep);
    for ($g = 0; $g < $generations && $level; $g++) {
        $next = [];
        foreach (h_children($pdo, $level) as $child) { if (!isset($keep[$child])) { $keep[$child] = true; $next[] = $child; } }
        $level = $next;
    }
    if ($withSpouses && $keep) {
        $ids = array_keys($keep);
        foreach (array_chunk($ids, 400) as $chunk) {
            $marks = implode(',', array_fill(0, count($chunk), '?'));
            $stmt = $pdo->prepare("SELECT partner1_id, partner2_id FROM families WHERE partner1_id IN ($marks) OR partner2_id IN ($marks)");
            $stmt->execute([...$chunk, ...$chunk]);
            foreach ($stmt->fetchAll() as $f) { foreach ([$f['partner1_id'], $f['partner2_id']] as $p) { if ((int) $p) { $keep[(int) $p] = true; } } }
        }
    }
    return $keep;
}

function h_distance_km(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $r = 6371.0; $dLat = deg2rad($lat2 - $lat1); $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return 2 * $r * asin(min(1, sqrt($a)));
}

function field_trips_data(PDO $pdo, string $status = 'todo'): array
{
    $where = match ($status) { 'done' => "WHERE t.status='done'", 'all' => '', default => "WHERE t.status<>'done'" };
    $rows = $pdo->query("SELECT t.*, (SELECT count(*) FROM field_trip_stops s WHERE s.trip_id=t.id) AS stop_count,
        (SELECT count(*) FROM field_trip_stops s WHERE s.trip_id=t.id AND s.done=1) AS done_count,
        (SELECT max(day) FROM field_trip_stops s WHERE s.trip_id=t.id) AS day_count
        FROM field_trips t {$where}
        ORDER BY CASE WHEN t.status='done' THEN 1 ELSE 0 END, CASE WHEN t.status='done' THEN COALESCE(NULLIF(t.done_at,''), t.date_start) END DESC,
        CASE WHEN t.date_start='' THEN 1 ELSE 0 END, t.date_start, t.id DESC")->fetchAll();
    $counts = $pdo->query("SELECT sum(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, sum(CASE WHEN status<>'done' THEN 1 ELSE 0 END) AS todo FROM field_trips")->fetch();
    foreach ($rows as &$r) { $r['people'] = h_json_list($r['people_json']); unset($r['people_json']); }
    unset($r);
    return ['trips' => with_labels($pdo, 'field_trip', $rows), 'counts' => ['todo' => (int) ($counts['todo'] ?? 0), 'done' => (int) ($counts['done'] ?? 0)], 'kinds' => FIELD_TRIP_KINDS];
}

function field_trip_detail(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('SELECT * FROM field_trips WHERE id=?'); $stmt->execute([$id]);
    $trip = $stmt->fetch();
    if (!$trip) { throw new RuntimeException('Circuit introuvable'); }
    $trip['people'] = h_json_list($trip['people_json']); unset($trip['people_json']);
    $peopleIds = array_map(static fn($p) => (int) (is_array($p) ? ($p['id'] ?? 0) : $p), $trip['people']);
    $trip['people_rows'] = array_values(collection_people($pdo, $peopleIds));
    $stops = $pdo->prepare('SELECT * FROM field_trip_stops WHERE trip_id=? ORDER BY day, position, id'); $stops->execute([$id]);
    $trip['stops'] = array_map(static function ($s) { $s['extra'] = field_trip_stop_extra(json_decode((string) ($s['extra_json'] ?? '{}'), true) ?: []); unset($s['extra_json']); return $s; }, $stops->fetchAll());
    $ids = array_values(array_unique(array_merge(...array_map(static fn($s) => $s['extra']['person_ids'] ?? [], $trip['stops'] ?: [['extra' => []]]))));
    $trip['stop_people'] = $ids ? collection_people($pdo, $ids) : (object) [];
    $trip['kinds'] = FIELD_TRIP_KINDS;
    $trip['labels'] = collection_labels($pdo, 'field_trip', [$id])[$id] ?? [];
    return $trip;
}

function save_field_trip(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    if ($title === '') { throw new RuntimeException('Donne un nom au circuit (ex. « Sur les traces des Dupont en Corrèze »).'); }
    $date = static fn($v) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? (string) $v : '';
    $status = ($data['status'] ?? '') === 'done' ? 'done' : 'todo';
    $people = [];
    foreach (is_array($data['people'] ?? null) ? $data['people'] : [] as $p) {
        $pid = safe_int(is_array($p) ? ($p['id'] ?? 0) : $p);
        if ($pid) { $people[] = ['id' => $pid, 'mode' => in_array($p['mode'] ?? '', ['person', 'ascendants', 'descendants'], true) ? $p['mode'] : 'person', 'generations' => max(1, min(12, safe_int($p['generations'] ?? 4, 4)))]; }
    }
    $fields = [$title, $status, $date($data['date_start'] ?? ''), $date($data['date_end'] ?? ''), safe_text($data['start_place'] ?? ''),
        max(1, min(20, safe_int($data['stops_per_day'] ?? 6, 6))), json_encode($people), h_long($data, 'notes', 20000)];
    if ($id) {
        $prev = $pdo->prepare('SELECT status, done_at FROM field_trips WHERE id=?'); $prev->execute([$id]); $before = $prev->fetch();
        if (!$before) { throw new RuntimeException('Circuit introuvable'); }
        $doneAt = $status === 'done' ? ($before['done_at'] ?: date('Y-m-d')) : '';
        $pdo->prepare('UPDATE field_trips SET title=?,status=?,date_start=?,date_end=?,start_place=?,stops_per_day=?,people_json=?,notes=?,done_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $doneAt, $id]);
        log_change($pdo, 'field_trip', $id, 'update', 'Circuit modifié : ' . $title);
    } else {
        $pdo->prepare('INSERT INTO field_trips(title,status,date_start,date_end,start_place,stops_per_day,people_json,notes,done_at) VALUES(?,?,?,?,?,?,?,?,?)')->execute([...$fields, $status === 'done' ? date('Y-m-d') : '']);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'field_trip', $id, 'create', 'Circuit ajouté : ' . $title);
    }
    if (!empty($data['generate'])) {
        // le circuit (et les étapes ajoutées à la main) est gardé même si l'app ne trouve aucun lieu à proposer
        try { generate_field_trip_stops($pdo, $id); } catch (RuntimeException $e) { return ['id' => $id, 'warning' => $e->getMessage()]; }
    }
    return ['id' => $id];
}

function set_field_trip_status(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $done = ($data['status'] ?? '') === 'done';
    $pdo->prepare('UPDATE field_trips SET status=?, done_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$done ? 'done' : 'todo', $done ? date('Y-m-d') : '', $id]);
    log_change($pdo, 'field_trip', $id, 'update', $done ? 'Circuit fait' : 'Circuit remis à faire');
    return ['id' => $id];
}

function delete_field_trip(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $pdo->prepare('DELETE FROM field_trip_stops WHERE trip_id=?')->execute([$id]);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='field_trip' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM field_trips WHERE id=?')->execute([$id]);
    log_change($pdo, 'field_trip', $id, 'delete', 'Circuit supprimé');
    return ['deleted' => $id];
}

/** Détails d'une étape (logistique, technique, recherche, liste à cocher), nettoyés et bornés. */
const FIELD_TRIP_STOP_TEXT = ['time_from' => 20, 'time_to' => 20, 'duration' => 60, 'transport' => 40, 'access' => 1000, 'contact_name' => 200, 'contact_phone' => 60, 'contact_email' => 200,
    'website' => 500, 'booking' => 1000, 'cost' => 100, 'documents' => 1000, 'equipment' => 2000, 'photo_rules' => 40, 'references' => 4000, 'goals' => 4000, 'findings' => 6000, 'result' => 20];
function field_trip_stop_extra(array $x): array
{
    $out = [];
    foreach (FIELD_TRIP_STOP_TEXT as $k => $max) { $v = trim((string) ($x[$k] ?? '')); if ($v !== '') { $out[$k] = mb_substr($v, 0, $max); } }
    if (isset($out['website']) && !preg_match('#^https?://#i', $out['website'])) { unset($out['website']); }
    if (isset($out['contact_email']) && !filter_var($out['contact_email'], FILTER_VALIDATE_EMAIL)) { unset($out['contact_email']); }
    if (!empty($x['booking_done'])) { $out['booking_done'] = 1; }
    $out['checklist'] = array_values(array_filter(array_map(static fn($c) => is_array($c) ? ['text' => mb_substr(trim((string) ($c['text'] ?? '')), 0, 300), 'done' => !empty($c['done']) ? 1 : 0] : null, array_slice(is_array($x['checklist'] ?? null) ? $x['checklist'] : [], 0, 100)), static fn($c) => $c && $c['text'] !== ''));
    $out['person_ids'] = array_values(array_unique(array_filter(array_map('intval', array_slice(is_array($x['person_ids'] ?? null) ? $x['person_ids'] : [], 0, 40)))));
    return $out;
}

/** Cocher une ligne de la liste d'une étape, depuis le circuit (sans rouvrir la fiche de l'étape). */
function set_field_trip_stop_check(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT extra_json FROM field_trip_stops WHERE id=?'); $s->execute([$id]);
    $raw = $s->fetchColumn();
    if ($raw === false) { throw new RuntimeException('Étape introuvable'); }
    $x = field_trip_stop_extra(json_decode((string) $raw, true) ?: []);
    $i = safe_int($data['index'] ?? -1);
    if (!isset($x['checklist'][$i])) { throw new RuntimeException('Ligne introuvable'); }
    $x['checklist'][$i]['done'] = !empty($data['done']) ? 1 : 0;
    $pdo->prepare('UPDATE field_trip_stops SET extra_json=? WHERE id=?')->execute([json_encode($x, JSON_UNESCAPED_UNICODE), $id]);
    return ['ok' => true];
}

function save_field_trip_stop(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $tripId = safe_int($data['trip_id'] ?? 0);
    $kind = array_key_exists((string) ($data['kind'] ?? ''), FIELD_TRIP_KINDS) ? (string) $data['kind'] : 'autre';
    [$lat, $lon] = h_place_coords($pdo, ['place_text' => trim(safe_text($data['place_text'] ?? '')), 'lat' => $data['lat'] ?? null, 'lon' => $data['lon'] ?? null], 'place_text', 'lat', 'lon');
    $fields = [max(1, safe_int($data['day'] ?? 1, 1)), $kind, safe_text($data['title'] ?? ''), safe_text($data['place_text'] ?? ''), safe_text($data['address'] ?? ''), $lat, $lon,
        h_long($data, 'to_photograph', 4000), safe_text($data['opening_hours'] ?? ''), h_long($data, 'people_text', 2000), h_long($data, 'notes', 4000), !empty($data['done']) ? 1 : 0];
    if ($id) {
        $pdo->prepare('UPDATE field_trip_stops SET day=?,kind=?,title=?,place_text=?,address=?,lat=?,lon=?,to_photograph=?,opening_hours=?,people_text=?,notes=?,done=? WHERE id=?')->execute([...$fields, $id]);
    } else {
        if (!$tripId) { throw new RuntimeException('Circuit manquant'); }
        $pos = $pdo->prepare('SELECT COALESCE(max(position),0)+1 FROM field_trip_stops WHERE trip_id=? AND day=?'); $pos->execute([$tripId, $fields[0]]);
        $pdo->prepare('INSERT INTO field_trip_stops(trip_id,day,kind,title,place_text,address,lat,lon,to_photograph,opening_hours,people_text,notes,done,position) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$tripId, ...$fields, (int) $pos->fetchColumn()]);
        $id = (int) $pdo->lastInsertId();
    }
    if (isset($data['extra']) && is_array($data['extra'])) {
        $x = field_trip_stop_extra($data['extra']);
        $x['person_ids'] = $x['person_ids'] ? array_map('intval', $pdo->query('SELECT id FROM persons WHERE id IN (' . implode(',', $x['person_ids']) . ')')->fetchAll(PDO::FETCH_COLUMN)) : [];
        $pdo->prepare('UPDATE field_trip_stops SET extra_json=? WHERE id=?')->execute([json_encode($x, JSON_UNESCAPED_UNICODE), $id]);
    }
    return ['id' => $id];
}

function set_field_trip_stop_done(PDO $pdo, array $data): array
{
    $pdo->prepare('UPDATE field_trip_stops SET done=? WHERE id=?')->execute([!empty($data['done']) ? 1 : 0, safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

function move_field_trip_stop(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $row = $pdo->prepare('SELECT * FROM field_trip_stops WHERE id=?'); $row->execute([$id]); $stop = $row->fetch();
    if (!$stop) { throw new RuntimeException('Étape introuvable'); }
    $dir = (int) ($data['direction'] ?? 0);
    if (isset($data['day'])) {
        $day = max(1, safe_int($data['day'], 1));
        $pdo->prepare('UPDATE field_trip_stops SET day=?, position=(SELECT COALESCE(max(position),0)+1 FROM field_trip_stops WHERE trip_id=? AND day=?) WHERE id=?')->execute([$day, $stop['trip_id'], $day, $id]);
        return ['id' => $id];
    }
    $list = $pdo->prepare('SELECT id FROM field_trip_stops WHERE trip_id=? AND day=? ORDER BY position, id'); $list->execute([$stop['trip_id'], $stop['day']]);
    $ids = array_map('intval', $list->fetchAll(PDO::FETCH_COLUMN));
    $i = array_search($id, $ids, true); $j = $i + ($dir < 0 ? -1 : 1);
    if ($i !== false && $j >= 0 && $j < count($ids)) { [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]]; }
    $upd = $pdo->prepare('UPDATE field_trip_stops SET position=? WHERE id=?');
    foreach ($ids as $p => $sid) { $upd->execute([$p, $sid]); }
    return ['id' => $id];
}

function delete_field_trip_stop(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM field_trip_stops WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

/**
 * Prépare les étapes d'un circuit à partir des personnes choisies (ou de leurs ascendants / descendants) :
 * églises (baptêmes, mariages religieux, sépultures anciennes), mairies (actes d'état civil), maisons (adresses,
 * domiciles, recensements), tombes (sépultures connues), monuments aux morts, puis les archives départementales
 * des départements traversés. Étapes regroupées par commune, communes mises dans l'ordre (la plus proche à chaque
 * fois), puis réparties jour par jour. Les étapes déjà faites ou ajoutées à la main sont gardées.
 */
function generate_field_trip_stops(PDO $pdo, int $tripId): array
{
    $trip = field_trip_detail($pdo, $tripId);
    $ids = [];
    foreach ($trip['people'] as $p) {
        $pid = (int) ($p['id'] ?? 0); if (!$pid) { continue; }
        $set = match ($p['mode'] ?? 'person') {
            'ascendants' => h_ancestors($pdo, $pid, (int) ($p['generations'] ?? 4)),
            'descendants' => h_descendants($pdo, [$pid], (int) ($p['generations'] ?? 3), false),
            default => [$pid => 1],
        };
        foreach (array_keys($set) as $id) { $ids[(int) $id] = true; }
    }
    if (!$ids) { throw new RuntimeException('Choisis au moins une personne (ou une branche) pour préparer le circuit.'); }
    $people = collection_people($pdo, array_keys($ids));
    $name = static fn(array $p): string => trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? ''));

    $sites = []; // clé => étape
    $add = static function (string $key, array $stop, string $line, string $photo) use (&$sites): void {
        if (!isset($sites[$key])) { $sites[$key] = $stop + ['lines' => [], 'photos' => []]; }
        if ($line !== '' && !in_array($line, $sites[$key]['lines'], true)) { $sites[$key]['lines'][] = $line; }
        if ($photo !== '' && !in_array($photo, $sites[$key]['photos'], true)) { $sites[$key]['photos'][] = $photo; }
    };
    $idList = array_keys($ids);
    $departments = [];
    // communes où la famille a vécu sans lieu plus précis : une étape « commune » si rien d'autre n'y est prévu
    $communes = [];
    $commune = static function (array $base, string $line) use (&$communes): void {
        $k = mb_strtolower($base['place_text'] . '|' . $base['county']);
        if (!isset($communes[$k])) { $communes[$k] = ['kind' => 'autre', 'title' => 'Commune de ' . $base['place_text'], 'address' => ''] + $base + ['lines' => [], 'photos' => ['Le village : panneau d’entrée, église, mairie, place, rues et maisons anciennes, monument aux morts']]; }
        if ($line !== '' && !in_array($line, $communes[$k]['lines'], true) && count($communes[$k]['lines']) < 30) { $communes[$k]['lines'][] = $line; }
    };
    foreach (array_chunk($idList, 300) as $chunk) {
        $marks = implode(',', array_fill(0, count($chunk), '?'));
        $stmt = $pdo->prepare("SELECT e.*, t.gedcom_tag, t.label AS type_label, pl.name AS place_name, pl.county, pl.state, pl.country, pl.latitude, pl.longitude,
                COALESCE(e.person_id, (SELECT f.partner1_id FROM families f WHERE f.id=e.family_id)) AS who1,
                (SELECT f.partner2_id FROM families f WHERE f.id=e.family_id) AS who2
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.place_id IS NOT NULL AND (e.person_id IN ($marks) OR e.family_id IN (SELECT id FROM families WHERE partner1_id IN ($marks) OR partner2_id IN ($marks)))");
        $stmt->execute([...$chunk, ...$chunk, ...$chunk]);
        foreach ($stmt->fetchAll() as $e) {
            $tag = strtoupper((string) $e['gedcom_tag']);
            $year = (int) ($e['year'] ?? 0);
            $place = (string) $e['place_name'];
            if ($place === '') { continue; }
            $whoIds = array_filter([(int) $e['who1'], (int) $e['who2']], static fn($i) => isset($people[$i]));
            $who = implode(' et ', array_map(static fn($i) => $name($people[$i]), $whoIds)) ?: 'la famille';
            $when = trim((string) ($e['date_text'] ?: ($year ?: '')));
            $what = mb_strtolower((string) $e['type_label']) . ' de ' . $who . ($when !== '' ? " ({$when})" : '');
            $lat = $e['precise_lat'] ?? null; $lon = $e['precise_lon'] ?? null;
            $plat = $e['latitude'] !== null ? (float) $e['latitude'] : null; $plon = $e['longitude'] !== null ? (float) $e['longitude'] : null;
            $base = ['place_text' => $place, 'county' => (string) ($e['county'] ?: $e['state']), 'country' => (string) $e['country'], 'lat' => $plat, 'lon' => $plon, 'people' => []];
            if ($e['county'] && in_array(mb_strtolower((string) $e['country']), ['france', ''], true)) { $departments[(string) $e['county']] = true; }
            $address = trim((string) ($e['address'] ?? ''));
            $religious = in_array($tag, ['CHR', 'BAPM', 'MRRE', 'CONF', 'FCOM'], true) || (in_array($tag, ['MARR', 'BURI', 'DEAT', 'BIRT'], true) && $year && $year < 1793);
            if (in_array($tag, ['RESI', 'CENS', 'OCCU', 'PROP'], true) || ($address !== '' && !$religious)) {
                if ($address === '' && $lat === null) { $commune($base, ucfirst($what)); continue; }
                $key = 'maison|' . mb_strtolower($place . '|' . ($address !== '' ? $address : round((float) $lat, 4) . ',' . round((float) $lon, 4)));
                $add($key, ['kind' => 'maison', 'title' => 'Maison' . ($address !== '' ? ' — ' . $address : ''), 'address' => $address] + ['lat' => $lat !== null ? (float) $lat : $plat, 'lon' => $lon !== null ? (float) $lon : $plon] + $base,
                    ucfirst($what), 'La maison' . ($address !== '' ? " ({$address})" : '') . ' : façade, porte, rue, vue d’ensemble');
                continue;
            }
            if ($tag === 'BURI' && (!$year || $year >= 1793)) {
                $add('tombe|' . mb_strtolower($place), ['kind' => 'tombe', 'title' => 'Cimetière de ' . $place, 'address' => ''] + $base,
                    'Tombe de ' . $who . ($when !== '' ? " (inhumé·e {$when})" : ''), 'Chercher la tombe de ' . $who . ' : pierre entière, inscription lisible, emplacement (allée, carré)');
                continue;
            }
            if ($religious) {
                $add('eglise|' . mb_strtolower($place), ['kind' => 'eglise', 'title' => 'Église de ' . $place, 'address' => ''] + $base,
                    ucfirst($what), 'Église : façade, intérieur, fonts baptismaux, plaques et vitraux de donateurs');
                continue;
            }
            if (in_array($tag, ['BIRT', 'MARR', 'DEAT', 'MRCI', 'DIV', 'ADOP', 'MARB', 'ENGA'], true)) {
                $add('mairie|' . mb_strtolower($place), ['kind' => 'mairie', 'title' => 'Mairie de ' . $place, 'address' => ''] + $base,
                    ucfirst($what), 'Mairie : façade (la salle des mariages si possible) ; demander à voir les registres ou une copie intégrale des actes');
                continue;
            }
            $commune($base, ucfirst($what)); // tout autre événement situé (métier, service militaire, départ, événement libre…)
        }
    }
    // Recensements : la maison (adresse ou point précis), sinon la commune
    foreach (array_chunk($idList, 300) as $chunk) {
        $marks = implode(',', array_fill(0, count($chunk), '?'));
        try {
            $stmt = $pdo->prepare("SELECT cm.person_id, cr.year, cr.address, cr.precise_lat, cr.precise_lon, pl.name AS place_name, pl.county, pl.state, pl.country, pl.latitude, pl.longitude
                FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id JOIN places pl ON pl.id=cr.place_id WHERE cm.person_id IN ($marks)");
            $stmt->execute($chunk);
            foreach ($stmt->fetchAll() as $c) {
                $place = (string) $c['place_name']; $p = $people[(int) $c['person_id']] ?? null;
                if ($place === '' || !$p) { continue; }
                $base = ['place_text' => $place, 'county' => (string) ($c['county'] ?: $c['state']), 'country' => (string) $c['country'], 'lat' => $c['latitude'] !== null ? (float) $c['latitude'] : null, 'lon' => $c['longitude'] !== null ? (float) $c['longitude'] : null, 'people' => []];
                if ($c['county'] && in_array(mb_strtolower((string) $c['country']), ['france', ''], true)) { $departments[(string) $c['county']] = true; }
                $line = 'Recensement' . ($c['year'] ? ' de ' . $c['year'] : '') . ' : ' . $name($p);
                $address = trim((string) $c['address']);
                if ($address === '' && $c['precise_lat'] === null) { $commune($base, $line); continue; }
                $key = 'maison|' . mb_strtolower($place . '|' . ($address !== '' ? $address : round((float) $c['precise_lat'], 4) . ',' . round((float) $c['precise_lon'], 4)));
                $add($key, ['kind' => 'maison', 'title' => 'Maison' . ($address !== '' ? ' — ' . $address : ''), 'address' => $address] + ['lat' => $c['precise_lat'] !== null ? (float) $c['precise_lat'] : $base['lat'], 'lon' => $c['precise_lon'] !== null ? (float) $c['precise_lon'] : $base['lon']] + $base,
                    $line, 'La maison' . ($address !== '' ? " ({$address})" : '') . ' : façade, porte, rue, vue d’ensemble');
            }
        } catch (Throwable $_) {}
    }
    // Sépultures connues (fiche Cimetière)
    foreach (array_chunk($idList, 300) as $chunk) {
        $marks = implode(',', array_fill(0, count($chunk), '?'));
        try {
            $stmt = $pdo->prepare("SELECT g.*, gp.person_id FROM graves g JOIN grave_persons gp ON gp.grave_id=g.id WHERE gp.person_id IN ($marks)");
            $stmt->execute($chunk);
            foreach ($stmt->fetchAll() as $g) {
                $p = $people[(int) $g['person_id']] ?? null; if (!$p) { continue; }
                $place = (string) ($g['city'] ?: $g['cemetery_name']);
                $geo = $g['gps_lat'] !== null ? ['lat' => (float) $g['gps_lat'], 'lon' => (float) $g['gps_lon']] : (heritage_geocode($pdo, $place) ?? ['lat' => null, 'lon' => null]);
                $add('grave|' . (int) $g['id'], ['kind' => 'tombe', 'title' => trim(($g['cemetery_name'] ?: 'Cimetière') . ($g['city'] ? ' — ' . $g['city'] : '')), 'address' => (string) $g['address'], 'place_text' => $place, 'county' => '', 'country' => (string) $g['country'], 'lat' => $geo['lat'], 'lon' => $geo['lon'], 'people' => []],
                    'Tombe de ' . $name($p) . ($g['plan_ref'] ? ' — emplacement ' . $g['plan_ref'] : ''), 'Tombe de ' . $name($p) . ($g['plan_ref'] ? ' (' . $g['plan_ref'] . ')' : '') . ' : pierre entière, inscription, état' . ((int) $g['grave_exists'] ? '' : ' — signalée disparue : vérifier sur place'));
            }
        } catch (Throwable $_) {}
    }
    // Poilus morts pour la France : monument aux morts de la commune de naissance
    foreach ($people as $pid => $p) {
        if (($p['mort_pour_la_france'] ?? '') !== 'yes') { continue; }
        $stmt = $pdo->prepare("SELECT pl.name, pl.county, pl.country, pl.latitude, pl.longitude FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','RESI','DEAT') ORDER BY t.gedcom_tag='BIRT' DESC LIMIT 1");
        $stmt->execute([$pid]);
        if ($pl = $stmt->fetch()) {
            $add('monument|' . mb_strtolower((string) $pl['name']), ['kind' => 'monument', 'title' => 'Monument aux morts de ' . $pl['name'], 'address' => '', 'place_text' => (string) $pl['name'], 'county' => (string) $pl['county'], 'country' => (string) $pl['country'], 'lat' => $pl['latitude'] !== null ? (float) $pl['latitude'] : null, 'lon' => $pl['longitude'] !== null ? (float) $pl['longitude'] : null, 'people' => []],
                $name($p) . ', mort pour la France', 'Le nom de ' . $name($p) . ' sur le monument (gros plan) et le monument entier');
        }
    }
    // Archives départementales des départements traversés
    $hours = [];
    try {
        foreach ($pdo->query("SELECT archive_center, address, opening_hours, website_url FROM archive_visit_plans WHERE archive_center<>''") as $a) { $hours[mb_strtolower((string) $a['archive_center'])] = $a; }
    } catch (Throwable $_) {}
    foreach (array_keys($departments) as $dep) {
        $known = null;
        foreach ($hours as $center => $a) { if (str_contains($center, mb_strtolower($dep))) { $known = $a; break; } }
        $geo = $known && $known['address'] ? heritage_geocode($pdo, (string) $known['address']) : null;
        $sites['archives|' . mb_strtolower($dep)] = ['kind' => 'archives', 'title' => 'Archives départementales — ' . $dep, 'address' => (string) ($known['address'] ?? ''), 'place_text' => $dep, 'county' => $dep, 'country' => 'France',
            'lat' => $geo['lat'] ?? null, 'lon' => $geo['lon'] ?? null, 'people' => [],
            'lines' => ['Registres et fonds sur les familles de ce département (notaires, cadastre, recensements, registres matricules)'],
            'photos' => ['Les actes trouvés (photo sans flash si c’est autorisé), la cote de chaque document'],
            'opening_hours' => (string) ($known['opening_hours'] ?? '') ?: 'À vérifier sur le site des archives : souvent fermées le week-end et le lundi ; réservation des documents parfois obligatoire.'];
    }
    // une commune sans église, mairie, tombe ni maison prévue devient une étape à part
    $planned = [];
    foreach ($sites as $st) { if ($st['kind'] !== 'archives') { $planned[mb_strtolower($st['place_text'] . '|' . $st['county'])] = true; } }
    foreach ($communes as $k => $c) { if (!isset($planned[$k])) { $sites['commune|' . $k] = $c; } }
    if (!$sites) {
        throw new RuntimeException(count($ids) === 1 && !array_filter($trip['people'], static fn($p) => ($p['mode'] ?? '') !== 'person')
            ? 'Aucun lieu connu pour cette personne (aucun événement avec un lieu). Choisis « et ses ascendants » ou « et ses descendants », ou ajoute les étapes à la main.'
            : 'Aucun lieu connu pour ces ' . count($ids) . ' personnes : leurs naissances, mariages, décès ou résidences n’ont pas de lieu. Ajoute un lieu à leurs événements, ou les étapes à la main.');
    }

    // Communes : regroupement puis ordre « au plus proche »
    $towns = [];
    foreach ($sites as $s) {
        $tkey = $s['kind'] === 'archives' ? 'archives|' . $s['place_text'] : mb_strtolower($s['place_text'] . '|' . $s['county']);
        $towns[$tkey]['stops'][] = $s;
        if (($towns[$tkey]['lat'] ?? null) === null && $s['lat'] !== null) { $towns[$tkey]['lat'] = (float) $s['lat']; $towns[$tkey]['lon'] = (float) $s['lon']; }
    }
    $order = ['archives' => 0, 'mairie' => 1, 'eglise' => 2, 'tombe' => 3, 'monument' => 4, 'maison' => 5, 'autre' => 6];
    foreach ($towns as &$t) { usort($t['stops'], static fn($a, $b) => ($order[$a['kind']] ?? 9) <=> ($order[$b['kind']] ?? 9)); }
    unset($t);
    $start = heritage_geocode($pdo, (string) $trip['start_place']);
    $located = array_filter($towns, static fn($t) => ($t['lat'] ?? null) !== null);
    $unlocated = array_diff_key($towns, $located);
    $route = [];
    if ($located) {
        if ($start) { $cur = [$start['lat'], $start['lon']]; }
        else { // départ : la commune la plus à l'ouest
            $first = array_key_first($located); foreach ($located as $k => $t) { if ($t['lon'] < $located[$first]['lon']) { $first = $k; } }
            $cur = [$located[$first]['lat'], $located[$first]['lon']];
        }
        while ($located) {
            $best = null; $bestD = INF;
            foreach ($located as $k => $t) { $d = h_distance_km($cur[0], $cur[1], $t['lat'], $t['lon']); if ($d < $bestD) { $bestD = $d; $best = $k; } }
            $route[] = $located[$best]; $cur = [$located[$best]['lat'], $located[$best]['lon']]; unset($located[$best]);
        }
    }
    foreach ($unlocated as $t) { $route[] = $t; }

    // Étapes gardées : celles déjà faites, et celles ajoutées à la main ; seules les étapes préparées par l'app et pas encore faites sont refaites
    $pdo->prepare('DELETE FROM field_trip_stops WHERE trip_id=? AND done=0 AND auto=1')->execute([$tripId]);
    $kept = [];
    $last = ['day' => 1, 'pos' => -1];
    foreach ($pdo->query('SELECT kind, title, day, position FROM field_trip_stops WHERE trip_id=' . (int) $tripId) as $k) {
        $kept[$k['kind'] . '|' . mb_strtolower(trim((string) $k['title']))] = true;
        $last['day'] = max($last['day'], (int) $k['day']); $last['pos'] = max($last['pos'], (int) $k['position']);
    }
    foreach ($route as &$t) { $t['stops'] = array_values(array_filter($t['stops'], static fn($s) => !isset($kept[$s['kind'] . '|' . mb_strtolower(trim((string) $s['title']))]))); }
    unset($t);
    $perDay = max(1, (int) $trip['stops_per_day']);
    $day = $kept ? $last['day'] : 1; $inDay = 0; $pos = $last['pos'] + 1;
    $ins = $pdo->prepare('INSERT INTO field_trip_stops(trip_id,day,position,kind,title,place_text,address,lat,lon,to_photograph,opening_hours,people_text,notes,done,auto) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)');
    $count = 0;
    foreach ($route as $t) {
        $n = count($t['stops']);
        if ($inDay > 0 && $inDay + $n > $perDay) { $day++; $inDay = 0; }
        foreach ($t['stops'] as $s) {
            if ($inDay >= $perDay && $n > $perDay) { $day++; $inDay = 0; }
            $ins->execute([$tripId, $day, $pos++, $s['kind'], $s['title'], $s['place_text'] . ($s['county'] && $s['kind'] !== 'archives' ? ' (' . $s['county'] . ')' : ''), $s['address'] ?? '',
                $s['lat'], $s['lon'], implode("\n", $s['photos']), $s['opening_hours'] ?? '', implode("\n", $s['lines']), '']);
            $inDay++; $count++;
        }
    }
    log_change($pdo, 'field_trip', $tripId, 'update', "Circuit préparé : {$count} étapes sur {$day} jour(s)");
    return ['stops' => $count, 'days' => $day];
}

/* ─── 🗄️ Papiers de famille ──────────────────────────────────────────── */

function family_papers_data(PDO $pdo, string $q = '', int $personId = 0): array
{
    $where = ''; $params = [];
    if ($q !== '') { $where = ' WHERE (title LIKE ? OR kind LIKE ? OR storage_location LIKE ? OR class_number LIKE ? OR holder_text LIKE ? OR description LIKE ?)'; $params = array_fill(0, 6, "%{$q}%"); }
    $stmt = $pdo->prepare('SELECT * FROM family_papers' . $where . ' ORDER BY class_number COLLATE NOCASE, id');
    $stmt->execute($params);
    $rows = [];
    $allPeople = [];
    foreach ($stmt->fetchAll() as $r) {
        $r['people_ids'] = array_values(array_filter(array_map('intval', h_json_list($r['people_json']))));
        unset($r['people_json']);
        if ($personId && !in_array($personId, $r['people_ids'], true)) { continue; }
        $allPeople = [...$allPeople, ...$r['people_ids']];
        $rows[] = $r;
    }
    $people = collection_people($pdo, $allPeople);
    $media = heritage_media($pdo, 'family_paper', array_column($rows, 'id'));
    foreach ($rows as &$r) {
        $r['people'] = array_values(array_filter(array_map(static fn($id) => $people[$id] ?? null, $r['people_ids'])));
        $r['media'] = $media[(int) $r['id']] ?? [];
    }
    unset($r);
    return with_labels($pdo, 'family_paper', $rows);
}

function next_paper_number(PDO $pdo): string
{
    $max = 0;
    foreach ($pdo->query("SELECT class_number FROM family_papers WHERE class_number LIKE 'P-%'")->fetchAll(PDO::FETCH_COLUMN) as $n) {
        if (preg_match('/^P-(\d+)$/', (string) $n, $m)) { $max = max($max, (int) $m[1]); }
    }
    return sprintf('P-%04d', $max + 1);
}

function save_family_paper(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    if ($title === '') { throw new RuntimeException('Donne un titre au document (ex. « Livret de famille Dupont-Martin »).'); }
    $number = safe_text($data['class_number'] ?? '');
    if ($number === '') { $number = next_paper_number($pdo); }
    $dup = $pdo->prepare('SELECT id FROM family_papers WHERE class_number=? COLLATE NOCASE AND id<>?'); $dup->execute([$number, $id]);
    if ($dup->fetchColumn()) { throw new RuntimeException("Le numéro de classement « {$number} » est déjà pris."); }
    $people = array_values(array_unique(array_filter(array_map('intval', is_array($data['people'] ?? null) ? $data['people'] : []))));
    $fields = [$number, $title, safe_text($data['kind'] ?? ''), safe_text($data['date_text'] ?? ''), safe_text($data['storage_location'] ?? ''), safe_text($data['holder_text'] ?? ''),
        safe_text($data['condition_text'] ?? ''), h_long($data, 'description', 20000), json_encode($people)];
    if ($id) {
        $pdo->prepare('UPDATE family_papers SET class_number=?,title=?,kind=?,date_text=?,storage_location=?,holder_text=?,condition_text=?,description=?,people_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $id]);
        log_change($pdo, 'family_paper', $id, 'update', "Papier de famille modifié : {$number} {$title}");
    } else {
        $pdo->prepare('INSERT INTO family_papers(class_number,title,kind,date_text,storage_location,holder_text,condition_text,description,people_json) VALUES(?,?,?,?,?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'family_paper', $id, 'create', "Papier de famille ajouté : {$number} {$title}");
    }
    return ['id' => $id, 'class_number' => $number];
}

function delete_family_paper(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    heritage_delete_media_links($pdo, 'family_paper', $id);
    $pdo->prepare('DELETE FROM family_papers WHERE id=?')->execute([$id]);
    log_change($pdo, 'family_paper', $id, 'delete', 'Papier de famille supprimé');
    return ['deleted' => $id];
}

/* ─── 🗺️ Cartes anciennes posées sur la carte ────────────────────────── */

/** Position sur la carte du monde (Web Mercator, zoom 0, en pixels de 0 à 256). */
function h_mercator(float $lat, float $lon): array
{
    $sin = sin(deg2rad($lat));
    return [($lon + 180) / 360 * 256, (0.5 - log((1 + $sin) / (1 - $sin)) / (4 * M_PI)) * 256];
}

/**
 * Transformation affine image → carte à partir de 3 points (ou plus : moindres carrés).
 * Renvoie [a, b, c, d, e, f] : x = a·u + c·v + e ; y = b·u + d·v + f (même ordre que matrix() en CSS).
 */
function old_map_transform(array $points): ?array
{
    $pts = [];
    foreach ($points as $p) {
        if (!is_array($p) || !is_numeric($p['u'] ?? null) || !is_numeric($p['v'] ?? null) || !is_numeric($p['lat'] ?? null) || !is_numeric($p['lon'] ?? null)) { continue; }
        [$x, $y] = h_mercator((float) $p['lat'], (float) $p['lon']);
        $pts[] = [(float) $p['u'], (float) $p['v'], $x, $y];
    }
    if (count($pts) < 3) { return null; }
    // Équations normales : [Σuu Σuv Σu; Σuv Σvv Σv; Σu Σv n] · [a c e] = [Σux Σvx Σx]
    $s = ['uu' => 0, 'uv' => 0, 'u' => 0, 'vv' => 0, 'v' => 0, 'n' => 0, 'ux' => 0, 'vx' => 0, 'x' => 0, 'uy' => 0, 'vy' => 0, 'y' => 0];
    foreach ($pts as [$u, $v, $x, $y]) {
        $s['uu'] += $u * $u; $s['uv'] += $u * $v; $s['u'] += $u; $s['vv'] += $v * $v; $s['v'] += $v; $s['n'] += 1;
        $s['ux'] += $u * $x; $s['vx'] += $v * $x; $s['x'] += $x; $s['uy'] += $u * $y; $s['vy'] += $v * $y; $s['y'] += $y;
    }
    $m = [[$s['uu'], $s['uv'], $s['u']], [$s['uv'], $s['vv'], $s['v']], [$s['u'], $s['v'], $s['n']]];
    $solve = static function (array $m, array $r): ?array {
        $det = static fn($a) => $a[0][0] * ($a[1][1] * $a[2][2] - $a[1][2] * $a[2][1]) - $a[0][1] * ($a[1][0] * $a[2][2] - $a[1][2] * $a[2][0]) + $a[0][2] * ($a[1][0] * $a[2][1] - $a[1][1] * $a[2][0]);
        $d = $det($m);
        if (abs($d) < 1e-12) { return null; }
        $out = [];
        for ($c = 0; $c < 3; $c++) { $mc = $m; for ($i = 0; $i < 3; $i++) { $mc[$i][$c] = $r[$i]; } $out[] = $det($mc) / $d; }
        return $out;
    };
    $X = $solve($m, [$s['ux'], $s['vx'], $s['x']]);
    $Y = $solve($m, [$s['uy'], $s['vy'], $s['y']]);
    if (!$X || !$Y) { return null; } // 3 points alignés
    return [$X[0], $Y[0], $X[1], $Y[1], $X[2], $Y[2]];
}

function old_maps_data(PDO $pdo): array
{
    $rows = $pdo->query('SELECT o.*, m.filename, m.title AS media_title FROM old_maps o LEFT JOIN media m ON m.id=o.media_id ORDER BY o.title COLLATE NOCASE, o.id')->fetchAll();
    foreach ($rows as &$r) {
        $r['control_points'] = h_json_list($r['control_points']);
        $r['markers'] = h_json_list($r['markers']);
        $t = json_decode((string) $r['transform'], true);
        $r['transform'] = is_array($t) && count($t) === 6 ? array_map('floatval', $t) : null;
    }
    unset($r);
    return with_labels($pdo, 'old_map', $rows);
}

function save_old_map(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = safe_text($data['title'] ?? '');
    if ($title === '') { throw new RuntimeException('Donne un nom à la carte (ex. « Cadastre napoléonien de Saint-Yrieix, 1834 »).'); }
    $points = [];
    foreach (is_array($data['control_points'] ?? null) ? $data['control_points'] : [] as $p) {
        if (!is_array($p)) { continue; }
        $lat = h_coord($p['lat'] ?? null, 85); $lon = h_coord($p['lon'] ?? null, 180);
        if ($lat === null || $lon === null || !is_numeric($p['u'] ?? null) || !is_numeric($p['v'] ?? null)) { continue; }
        $points[] = ['u' => round((float) $p['u'], 2), 'v' => round((float) $p['v'], 2), 'lat' => $lat, 'lon' => $lon, 'label' => mb_substr(safe_text($p['label'] ?? ''), 0, 80)];
    }
    $markers = [];
    foreach (is_array($data['markers'] ?? null) ? $data['markers'] : [] as $mk) {
        if (!is_array($mk) || !is_numeric($mk['u'] ?? null) || !is_numeric($mk['v'] ?? null)) { continue; }
        $markers[] = ['u' => round((float) $mk['u'], 2), 'v' => round((float) $mk['v'], 2), 'label' => mb_substr(safe_text($mk['label'] ?? ''), 0, 120), 'person_id' => safe_int($mk['person_id'] ?? 0) ?: null];
    }
    $transform = old_map_transform($points);
    $fields = [$title, safe_text($data['year_text'] ?? ''), h_long($data, 'notes', 8000), safe_int($data['media_id'] ?? 0) ?: null, max(0, safe_int($data['img_w'] ?? 0)), max(0, safe_int($data['img_h'] ?? 0)),
        json_encode($points), $transform ? json_encode($transform) : '', json_encode($markers), max(5, min(100, safe_int($data['opacity'] ?? 70, 70)))];
    if ($id) {
        $pdo->prepare('UPDATE old_maps SET title=?,year_text=?,notes=?,media_id=COALESCE(?,media_id),img_w=CASE WHEN ?>0 THEN ? ELSE img_w END,img_h=CASE WHEN ?>0 THEN ? ELSE img_h END,control_points=?,transform=?,markers=?,opacity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$fields[0], $fields[1], $fields[2], $fields[3], $fields[4], $fields[4], $fields[5], $fields[5], $fields[6], $fields[7], $fields[8], $fields[9], $id]);
        log_change($pdo, 'old_map', $id, 'update', 'Carte ancienne modifiée : ' . $title);
    } else {
        $pdo->prepare('INSERT INTO old_maps(title,year_text,notes,media_id,img_w,img_h,control_points,transform,markers,opacity) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'old_map', $id, 'create', 'Carte ancienne ajoutée : ' . $title);
    }
    // L'image envoyée par upload.php (collection old_map) devient l'image de la carte
    $img = $pdo->prepare("SELECT media_id FROM family_collection_media WHERE collection_type='old_map' AND collection_id=? ORDER BY id DESC LIMIT 1"); $img->execute([$id]);
    $mediaId = (int) $img->fetchColumn();
    if ($mediaId) { $pdo->prepare('UPDATE old_maps SET media_id=? WHERE id=? AND (media_id IS NULL OR media_id<>?)')->execute([$mediaId, $id, $mediaId]); }
    return ['id' => $id, 'transform' => $transform];
}

function delete_old_map(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    heritage_delete_media_links($pdo, 'old_map', $id);
    $pdo->prepare('DELETE FROM old_maps WHERE id=?')->execute([$id]);
    log_change($pdo, 'old_map', $id, 'delete', 'Carte ancienne supprimée');
    return ['deleted' => $id];
}

/* ─── 🔎 Recherches enregistrées ─────────────────────────────────────── */

const SAVED_SEARCH_EVENTS = ['any' => 'N’importe quel événement', 'birth' => 'Naissance ou baptême', 'BIRT' => 'Naissance', 'CHR' => 'Baptême', 'MARR' => 'Mariage', 'death' => 'Décès ou inhumation', 'DEAT' => 'Décès', 'BURI' => 'Inhumation', 'RESI' => 'Résidence', 'OCCU' => 'Profession'];

function saved_search_criteria(array $c): array
{
    $mode = in_array($c['name_mode'] ?? '', ['contains', 'exact', 'starts'], true) ? $c['name_mode'] : 'exact';
    $event = array_key_exists((string) ($c['event'] ?? ''), SAVED_SEARCH_EVENTS) ? (string) $c['event'] : 'any';
    $year = static fn($v) => is_numeric($v) && (int) $v > 0 && (int) $v < 3000 ? (int) $v : null;
    return [
        'last_name' => safe_text($c['last_name'] ?? ''), 'name_mode' => $mode, 'first_name' => safe_text($c['first_name'] ?? ''),
        'gender' => in_array($c['gender'] ?? '', ['male', 'female', 'unknown'], true) ? $c['gender'] : '',
        'event' => $event, 'place' => safe_text($c['place'] ?? ''), 'year_from' => $year($c['year_from'] ?? null), 'year_to' => $year($c['year_to'] ?? null),
        'occupation' => safe_text($c['occupation'] ?? ''), 'label_id' => safe_int($c['label_id'] ?? 0) ?: null,
        'living' => in_array($c['living'] ?? '', ['living', 'deceased', 'unknown'], true) ? $c['living'] : '',
        'ancestors' => !empty($c['ancestors']) ? 1 : 0,
        'same_birthday' => safe_int($c['same_birthday'] ?? 0) ?: null,
        'relation' => array_key_exists((string) ($c['relation'] ?? ''), SEARCH_RELATIONS) ? (string) $c['relation'] : '',
        'relation_of' => array_key_exists((string) ($c['relation'] ?? ''), SEARCH_RELATIONS) ? (safe_int($c['relation_of'] ?? 0) ?: null) : null,
    ];
}

/** Liens de parenté qu'une recherche peut viser (« les enfants de… ») : [singulier, pluriel]. */
const SEARCH_RELATIONS = ['children' => ['enfant', 'enfants'], 'grandchildren' => ['petit-enfant', 'petits-enfants'], 'great_grandchildren' => ['arrière-petit-enfant', 'arrière-petits-enfants'],
    'descendants' => ['descendant', 'descendants'], 'parents' => ['parent', 'parents'], 'grandparents' => ['grand-parent', 'grands-parents'], 'ancestors_of' => ['ancêtre', 'ancêtres'],
    'siblings' => ['frère ou sœur', 'frères et sœurs'], 'spouses' => ['conjoint', 'conjoints']];

/** Les proches d'une personne pour un lien de parenté (sans elle-même). */
function search_relatives(PDO $pdo, string $relation, int $id): array
{
    $ids = match ($relation) {
        'children' => h_children($pdo, [$id]),
        'grandchildren' => h_children($pdo, h_children($pdo, [$id])),
        'great_grandchildren' => h_children($pdo, h_children($pdo, h_children($pdo, [$id]))),
        'descendants' => array_keys(h_descendants($pdo, [$id], 30, false)),
        'parents' => h_parents($pdo, $id),
        'grandparents' => array_merge(...array_map(static fn($p) => h_parents($pdo, $p), h_parents($pdo, $id) ?: [0])),
        'ancestors_of' => array_keys(h_ancestors($pdo, $id, 40)),
        'siblings' => h_children($pdo, h_parents($pdo, $id)),
        'spouses' => (static function () use ($pdo, $id) {
            $s = $pdo->prepare('SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE partner1_id=? OR partner2_id=?');
            $s->execute([$id, $id, $id]);
            return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        })(),
        default => [],
    };
    return array_values(array_unique(array_filter(array_map('intval', $ids), static fn($x) => $x > 0 && $x !== $id)));
}

/** Identifiants des personnes qui répondent aux critères. */
function run_saved_search(PDO $pdo, array $criteria): array
{
    $c = saved_search_criteria($criteria);
    if ($c['same_birthday'] && function_exists('same_birthday_ids')) { return same_birthday_ids($pdo, (int) $c['same_birthday']); }
    $where = []; $params = [];
    if ($c['last_name'] !== '') {
        $value = match ($c['name_mode']) { 'contains' => '%' . $c['last_name'] . '%', 'starts' => $c['last_name'] . '%', default => $c['last_name'] };
        $where[] = '(p.last_name LIKE ? COLLATE NOCASE OR EXISTS(SELECT 1 FROM name_variants nv WHERE nv.person_id=p.id AND nv.last_name LIKE ? COLLATE NOCASE))';
        array_push($params, $value, $value);
    }
    if ($c['first_name'] !== '') { $where[] = "(' '||p.first_name||' '||COALESCE(p.middle_name,'')||' ') LIKE ? COLLATE NOCASE"; $params[] = '% ' . $c['first_name'] . '%'; }
    if ($c['gender'] !== '') { $where[] = 'p.gender=?'; $params[] = $c['gender']; }
    if ($c['living'] !== '') { $where[] = 'p.living_status=?'; $params[] = $c['living']; }
    if ($c['occupation'] !== '') {
        $where[] = "(p.occupation LIKE ? COLLATE NOCASE OR EXISTS(SELECT 1 FROM events oe JOIN event_types ot ON ot.id=oe.event_type_id WHERE oe.person_id=p.id AND ot.gedcom_tag='OCCU' AND (oe.title LIKE ? COLLATE NOCASE OR oe.description LIKE ? COLLATE NOCASE)))";
        array_push($params, "%{$c['occupation']}%", "%{$c['occupation']}%", "%{$c['occupation']}%");
    }
    if ($c['label_id']) { $where[] = "EXISTS(SELECT 1 FROM label_links ll WHERE ll.entity_type='person' AND ll.entity_id=p.id AND ll.label_id=?)"; $params[] = $c['label_id']; }
    if ($c['place'] !== '' || $c['year_from'] || $c['year_to'] || $c['event'] !== 'any') {
        $tags = match ($c['event']) { 'birth' => ['BIRT', 'CHR', 'BAPM'], 'death' => ['DEAT', 'BURI'], 'any' => [], default => [$c['event']] };
        $cond = ['(e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))'];
        $sub = [];
        if ($tags) { $cond[] = 't.gedcom_tag IN (' . implode(',', array_fill(0, count($tags), '?')) . ')'; array_push($sub, ...$tags); }
        if ($c['place'] !== '') {
            $cond[] = '(pl.name LIKE ? COLLATE NOCASE OR pl.county LIKE ? COLLATE NOCASE OR pl.state LIKE ? COLLATE NOCASE OR pl.country LIKE ? COLLATE NOCASE)';
            array_push($sub, $c['place'] . '%', $c['place'] . '%', $c['place'] . '%', $c['place']);
        }
        if ($c['year_from']) { $cond[] = 'e.year >= ?'; $sub[] = $c['year_from']; }
        if ($c['year_to']) { $cond[] = 'e.year <= ?'; $sub[] = $c['year_to']; }
        $where[] = 'EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE ' . implode(' AND ', $cond) . ')';
        array_push($params, ...$sub);
    }
    $relatives = null;
    if ($c['relation'] !== '' && $c['relation_of']) {
        $relatives = search_relatives($pdo, $c['relation'], (int) $c['relation_of']);
        if (!$relatives) { return []; }
        $where[] = 'p.id IN (' . implode(',', $relatives) . ')';
    }
    if (!$where && !$c['ancestors']) { throw new RuntimeException('Indique au moins un critère.'); }
    if (!$where) { $where[] = '1=1'; }
    if ($relatives !== null) { // les proches : du plus âgé au plus jeune
        $stmt = $pdo->prepare('SELECT p.id FROM persons p WHERE ' . implode(' AND ', $where) . " ORDER BY (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) IS NULL, (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')), p.first_name COLLATE NOCASE");
        $stmt->execute($params);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    $stmt = $pdo->prepare('SELECT p.id FROM persons p WHERE ' . implode(' AND ', $where) . ' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 5000');
    $stmt->execute($params);
    $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    if ($c['ancestors']) { // seulement les ancêtres de la personne de départ de l'arbre
        $start = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn(); // sans personne de départ cochée : la première fiche (comme ailleurs)
        $anc = $start ? h_ancestors($pdo, $start, 40) : [];
        unset($anc[$start]);
        $ids = array_values(array_filter($ids, static fn($id) => isset($anc[$id])));
    }
    return $ids;
}

function saved_search_label(array $c): string
{
    $c = saved_search_criteria($c);
    $parts = [];
    if ($c['first_name'] !== '') { $parts[] = 'prénom ' . $c['first_name']; }
    if ($c['last_name'] !== '') { $parts[] = ($c['name_mode'] === 'contains' ? 'nom contenant ' : ($c['name_mode'] === 'starts' ? 'nom commençant par ' : '')) . $c['last_name']; }
    if ($c['gender'] !== '') { $parts[] = ['male' => 'hommes', 'female' => 'femmes', 'unknown' => 'sexe inconnu'][$c['gender']]; }
    $ev = $c['event'] !== 'any' ? mb_strtolower(SAVED_SEARCH_EVENTS[$c['event']]) : 'un événement';
    if ($c['place'] !== '') { $parts[] = $ev . ' à / dans ' . $c['place']; }
    if ($c['year_from'] && $c['year_to']) { $parts[] = "{$ev} entre {$c['year_from']} et {$c['year_to']}"; }
    elseif ($c['year_from']) { $parts[] = "{$ev} après {$c['year_from']}"; }
    elseif ($c['year_to']) { $parts[] = "{$ev} avant {$c['year_to']}"; }
    if ($c['occupation'] !== '') { $parts[] = 'métier ' . $c['occupation']; }
    if ($c['ancestors']) { $parts[] = 'ancêtres seulement'; }
    if ($c['same_birthday']) { $parts[] = 'né le même jour que la fiche #' . $c['same_birthday']; }
    if ($c['relation'] !== '' && $c['relation_of']) {
        $n = '';
        try { $s = db()->prepare("SELECT trim(first_name||' '||last_name) FROM persons WHERE id=?"); $s->execute([$c['relation_of']]); $n = (string) $s->fetchColumn(); } catch (Throwable $_) {}
        array_unshift($parts, SEARCH_RELATIONS[$c['relation']][1] . ' de ' . ($n !== '' ? $n : 'la fiche #' . $c['relation_of']));
    }
    return implode(' · ', $parts);
}

function saved_searches_data(PDO $pdo): array
{
    $rows = $pdo->query('SELECT * FROM saved_searches ORDER BY name COLLATE NOCASE, id')->fetchAll();
    foreach ($rows as &$r) {
        $r['criteria'] = json_decode((string) $r['criteria'], true) ?: [];
        $seen = array_fill_keys(array_map('intval', h_json_list($r['seen_ids'])), true);
        try {
            $ids = run_saved_search($pdo, $r['criteria']);
            $r['count'] = count($ids);
            $r['new_ids'] = array_values(array_filter($ids, static fn($id) => !isset($seen[$id])));
        } catch (Throwable $e) {
            $r['count'] = 0; $r['new_ids'] = []; $r['error'] = $e->getMessage();
        }
        $r['new_count'] = count($r['new_ids']);
        $r['description'] = saved_search_label($r['criteria']);
        unset($r['seen_ids']);
    }
    unset($r);
    return ['searches' => $rows, 'events' => SAVED_SEARCH_EVENTS];
}

function saved_search_results(PDO $pdo, array $criteria, int $searchId = 0): array
{
    $ids = run_saved_search($pdo, $criteria);
    $seen = [];
    if ($searchId) {
        $s = $pdo->prepare('SELECT seen_ids FROM saved_searches WHERE id=?'); $s->execute([$searchId]);
        $seen = array_fill_keys(array_map('intval', h_json_list($s->fetchColumn() ?: '[]')), true);
    }
    $people = collection_people($pdo, array_slice($ids, 0, 1000));
    $out = [];
    foreach ($ids as $id) { if (isset($people[$id])) { $out[] = $people[$id] + ['is_new' => $searchId && !isset($seen[$id])]; } }
    return ['people' => $out, 'count' => count($ids), 'description' => saved_search_label($criteria)];
}

function save_saved_search(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = safe_text($data['name'] ?? '');
    if ($name === '') { throw new RuntimeException('Donne un nom à la recherche (ex. « Les Dupont du Nord avant 1800 »).'); }
    $criteria = saved_search_criteria(is_array($data['criteria'] ?? null) ? $data['criteria'] : []);
    $ids = run_saved_search($pdo, $criteria);
    if ($id) {
        $pdo->prepare('UPDATE saved_searches SET name=?, criteria=?, seen_ids=?, last_count=?, last_run_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, json_encode($criteria, JSON_UNESCAPED_UNICODE), json_encode($ids), count($ids), $id]);
    } else {
        $pdo->prepare('INSERT INTO saved_searches(name, criteria, seen_ids, last_count, last_run_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)')->execute([$name, json_encode($criteria, JSON_UNESCAPED_UNICODE), json_encode($ids), count($ids)]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['id' => $id, 'count' => count($ids)];
}

/** « Vu » : les fiches qui répondent aujourd'hui ne seront plus signalées comme nouvelles. */
function mark_saved_search_seen(PDO $pdo, array $data): array
{
    $ids = [];
    $rows = $pdo->prepare('SELECT id, criteria FROM saved_searches' . (safe_int($data['id'] ?? 0) ? ' WHERE id=?' : ''));
    $rows->execute(safe_int($data['id'] ?? 0) ? [safe_int($data['id'])] : []);
    $upd = $pdo->prepare('UPDATE saved_searches SET seen_ids=?, last_count=?, last_run_at=CURRENT_TIMESTAMP WHERE id=?');
    foreach ($rows->fetchAll() as $r) {
        try { $ids = run_saved_search($pdo, json_decode((string) $r['criteria'], true) ?: []); } catch (Throwable $_) { $ids = []; }
        $upd->execute([json_encode($ids), count($ids), $r['id']]);
    }
    return ['ok' => true];
}

function delete_saved_search(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM saved_searches WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

/* ─── 📊 Prénoms de l'INSEE ──────────────────────────────────────────── */

function prenom_key(string $name): string
{
    $name = trim(preg_replace('/\s+/u', ' ', $name));
    $first = preg_split('/[\s,]+/u', $name)[0] ?? '';
    return strtoupper(ascii_fold($first));
}

/**
 * Import du fichier national des prénoms de l'INSEE (CSV « sexe;preusuel;annais;nombre », ou ZIP qui le contient).
 * Les colonnes sont reconnues par leur nom ; les prénoms rares et les années inconnues (XXXX) sont ignorés.
 */
function insee_prenoms_import(PDO $pdo, ?array $file): never
{
    @set_time_limit(0);
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { json_response(['error' => upload_failure_message($file, 'Le fichier des prénoms')], 422); }
    $path = (string) $file['tmp_name'];
    $tmpCsv = null;
    $head = (string) file_get_contents($path, false, null, 0, 4);
    if (str_starts_with($head, "PK")) {
        if (!class_exists('ZipArchive')) { json_response(['error' => 'Décompresse d’abord le fichier ZIP, puis importe le fichier CSV.'], 422); }
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) { json_response(['error' => 'ZIP illisible.'], 422); }
        $entry = null;
        for ($i = 0; $i < $zip->numFiles; $i++) { $n = (string) $zip->getNameIndex($i); if (preg_match('/\.(csv|txt)$/i', $n) && stripos($n, 'dep') === false) { $entry = $n; break; } }
        if ($entry === null) { for ($i = 0; $i < $zip->numFiles; $i++) { $n = (string) $zip->getNameIndex($i); if (preg_match('/\.(csv|txt)$/i', $n)) { $entry = $n; break; } } }
        if ($entry === null) { json_response(['error' => 'Aucun fichier CSV dans ce ZIP.'], 422); }
        $tmpCsv = tempnam(sys_get_temp_dir(), 'prenoms');
        file_put_contents($tmpCsv, $zip->getFromName($entry));
        $zip->close();
        $path = $tmpCsv;
    }
    $fh = fopen($path, 'rb');
    $first = (string) fgets($fh);
    $first = preg_replace('/^\xEF\xBB\xBF/', '', $first);
    $sep = substr_count($first, ';') >= substr_count($first, ',') ? ';' : ',';
    $cols = array_map(static fn($c) => strtolower(ascii_fold(trim($c, " \"\r\n"))), explode($sep, $first));
    $find = static function (array $names) use ($cols): ?int { foreach ($cols as $i => $c) { if (in_array($c, $names, true)) { return $i; } } return null; };
    $iSex = $find(['sexe', 'sex']); $iName = $find(['preusuel', 'prenom', 'prenoms', 'firstname']); $iYear = $find(['annais', 'annee', 'periode', 'year']); $iCount = $find(['nombre', 'valeur', 'count', 'nb']);
    if ($iSex === null || $iName === null || $iYear === null || $iCount === null) {
        fclose($fh); if ($tmpCsv) { @unlink($tmpCsv); }
        json_response(['error' => 'Colonnes non reconnues. Il faut le fichier national des prénoms de l’INSEE (colonnes sexe, prénom, année, nombre). Colonnes lues : ' . implode(', ', $cols)], 422);
    }
    $pdo->beginTransaction();
    $pdo->exec('DELETE FROM insee_prenoms');
    $ins = $pdo->prepare('INSERT INTO insee_prenoms(prenom, sexe, annee, nombre) VALUES(?,?,?,?)');
    $agg = []; $rows = 0; $minYear = 9999; $maxYear = 0;
    while (($line = fgets($fh)) !== false) {
        if (!mb_check_encoding($line, 'UTF-8')) { $line = mb_convert_encoding($line, 'UTF-8', 'ISO-8859-1'); }
        $f = str_getcsv(rtrim($line, "\r\n"), $sep);
        $name = (string) ($f[$iName] ?? ''); $year = (string) ($f[$iYear] ?? ''); $count = (int) ($f[$iCount] ?? 0);
        if ($name === '' || $name[0] === '_' || !preg_match('/^\d{4}$/', $year) || $count <= 0) { continue; }
        $sex = (int) ($f[$iSex] ?? 0);
        $key = prenom_key($name);
        if ($key === '') { continue; }
        $k = $key . '|' . $sex . '|' . $year;
        $agg[$k] = ($agg[$k] ?? 0) + $count;
        if (count($agg) > 50000) { foreach ($agg as $kk => $n) { [$p, $s, $y] = explode('|', $kk); $ins->execute([$p, (int) $s, (int) $y, $n]); } $agg = []; }
        $rows++; $minYear = min($minYear, (int) $year); $maxYear = max($maxYear, (int) $year);
    }
    foreach ($agg as $kk => $n) { [$p, $s, $y] = explode('|', $kk); $ins->execute([$p, (int) $s, (int) $y, $n]); }
    fclose($fh); if ($tmpCsv) { @unlink($tmpCsv); }
    if (!$rows) { $pdo->rollBack(); json_response(['error' => 'Aucune ligne utilisable dans ce fichier.'], 422); }
    $pdo->prepare("INSERT OR REPLACE INTO app_settings(key, value, updated_at) VALUES('lcnda-insee-prenoms', ?, CURRENT_TIMESTAMP)")
        ->execute([json_encode(['rows' => $rows, 'from' => $minYear, 'to' => $maxYear, 'file' => (string) ($file['name'] ?? ''), 'imported_at' => date('c')])]);
    $pdo->commit();
    json_response(['ok' => true, 'rows' => $rows, 'from' => $minYear, 'to' => $maxYear]);
}

/**
 * Prénoms de la famille comparés à la France : pour chaque prénom donné au XXᵉ siècle (ou après), année du pic national,
 * rang, et années où la famille l'a donné.
 */
function firstnames_france_data(PDO $pdo, int $minYear = 1900): array
{
    $meta = json_decode((string) ($pdo->query("SELECT value FROM app_settings WHERE key='lcnda-insee-prenoms'")->fetchColumn() ?: ''), true) ?: null;
    $births = $pdo->query("SELECT p.id, p.first_name, p.gender, p.last_name,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.year IS NOT NULL ORDER BY t.gedcom_tag='BIRT' DESC, e.year LIMIT 1) AS year
        FROM persons p WHERE TRIM(COALESCE(p.first_name,''))<>''")->fetchAll();
    $family = [];
    foreach ($births as $b) {
        if (!$b['year'] || (int) $b['year'] < $minYear) { continue; }
        $key = prenom_key((string) $b['first_name']);
        if ($key === '') { continue; }
        $sex = $b['gender'] === 'female' ? 2 : ($b['gender'] === 'male' ? 1 : 0);
        $k = $key . '|' . $sex;
        $family[$k]['key'] = $key; $family[$k]['sex'] = $sex;
        $family[$k]['label'] ??= preg_split('/[\s,]+/u', trim((string) $b['first_name']))[0];
        $family[$k]['people'][] = ['id' => (int) $b['id'], 'name' => trim($b['first_name'] . ' ' . $b['last_name']), 'year' => (int) $b['year']];
    }
    $out = [];
    $series = $pdo->prepare('SELECT annee, sum(nombre) AS n FROM insee_prenoms WHERE prenom=? AND (?=0 OR sexe=?) GROUP BY annee ORDER BY annee');
    foreach ($family as $f) {
        $years = array_column($f['people'], 'year'); sort($years);
        $row = ['name' => $f['label'], 'sex' => $f['sex'], 'family_years' => $years, 'people' => $f['people'], 'peak_year' => null, 'peak_count' => 0, 'total' => 0, 'series' => []];
        if ($meta) {
            $series->execute([$f['key'], $f['sex'], $f['sex']]);
            foreach ($series->fetchAll() as $s) {
                $row['series'][(int) $s['annee']] = (int) $s['n']; $row['total'] += (int) $s['n'];
                if ((int) $s['n'] > $row['peak_count']) { $row['peak_count'] = (int) $s['n']; $row['peak_year'] = (int) $s['annee']; }
            }
            // À l'année où la famille l'a donné : combien de bébés en France ?
            $row['given_counts'] = array_map(static fn($y) => $row['series'][$y] ?? 0, $years);
        }
        $out[] = $row;
    }
    usort($out, static fn($a, $b) => count($b['people']) <=> count($a['people']) ?: strcmp($a['name'], $b['name']));
    return ['meta' => $meta, 'names' => $out, 'min_year' => $minYear];
}

/* ─── 📊 Inventaires après décès ─────────────────────────────────────── */

/** « 12 l 5 s 3 d », « 12 livres 5 sols », « 152,50 » → valeur décimale (livres ou francs). */
function parse_old_amount(string $text): ?float
{
    $t = mb_strtolower(trim(str_replace(["\u{00A0}", ' '], ' ', $text)));
    if ($t === '') { return null; }
    if (preg_match('/^-?\d+(?:[.,]\d+)?$/', str_replace(' ', '', $t))) { return (float) str_replace([' ', ','], ['', '.'], $t); }
    $l = preg_match('/(\d+(?:[.,]\d+)?)\s*(?:l\b|lt\b|livres?|£|f\b|fr\b|francs?)/u', $t, $m) ? (float) str_replace(',', '.', $m[1]) : 0;
    $s = preg_match('/(\d+)\s*(?:s\b|sols?|sous)/u', $t, $m) ? (int) $m[1] : 0;
    $d = preg_match('/(\d+)\s*(?:d\b|deniers?)/u', $t, $m) ? (int) $m[1] : 0;
    $c = preg_match('/(\d+)\s*(?:c\b|cts?|centimes?)/u', $t, $m) ? (int) $m[1] : 0;
    if (!$l && !$s && !$d && !$c) { return null; }
    return $l + $s / 20 + $d / 240 + $c / 100;
}

function probate_inventories_data(PDO $pdo, int $personId = 0): array
{
    $sql = 'SELECT i.*, trim(p.first_name||\' \'||p.last_name) AS person_name, p.gender FROM probate_inventories i JOIN persons p ON p.id=i.person_id';
    if ($personId) { $stmt = $pdo->prepare($sql . ' WHERE i.person_id=? ORDER BY COALESCE(i.year,9999), i.id'); $stmt->execute([$personId]); }
    else { $stmt = $pdo->query($sql . ' ORDER BY COALESCE(i.year,9999), i.id'); }
    $rows = $stmt->fetchAll();
    if (!$rows) { return []; }
    $ids = array_map(static fn($r) => (int) $r['id'], $rows);
    $items = $pdo->prepare('SELECT * FROM probate_items WHERE inventory_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY inventory_id, position, id');
    $items->execute($ids);
    $byInv = [];
    foreach ($items->fetchAll() as $it) { $byInv[(int) $it['inventory_id']][] = $it; }
    $media = heritage_media($pdo, 'probate_inventory', $ids);
    foreach ($rows as &$r) {
        $r['items'] = $byInv[(int) $r['id']] ?? [];
        $r['media'] = $media[(int) $r['id']] ?? [];
        $total = 0.0; $debts = 0.0; $byCat = []; $byRoom = [];
        foreach ($r['items'] as $it) {
            $v = (float) ($it['value'] ?? 0);
            if ($it['category'] === 'dettes') { $debts += $v; continue; }
            $total += $v;
            $byCat[$it['category']] = ($byCat[$it['category']] ?? 0) + $v;
            $room = trim((string) $it['room']) ?: 'Sans pièce';
            $byRoom[$room] = ($byRoom[$room] ?? 0) + $v;
        }
        $r['total'] = round($total, 4); $r['debts'] = round($debts, 4); $r['net'] = round($total - $debts, 4);
        $r['by_category'] = $byCat; $r['by_room'] = $byRoom;
    }
    unset($r);
    return with_labels($pdo, 'probate_inventory', $rows);
}

function save_probate_inventory(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    h_person_exists($pdo, $personId);
    $dateText = safe_text($data['date_text'] ?? '');
    $currency = in_array($data['currency'] ?? '', ['livre', 'franc', 'nf'], true) ? $data['currency'] : 'livre';
    $fields = [$personId, $dateText, h_year($dateText), safe_text($data['notary'] ?? ''), safe_text($data['place_text'] ?? ''), $currency, safe_text($data['reference'] ?? ''), h_long($data, 'notes', 40000)];
    if ($id) {
        $pdo->prepare('UPDATE probate_inventories SET person_id=?,date_text=?,year=?,notary=?,place_text=?,currency=?,reference=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $id]);
    } else {
        $pdo->prepare('INSERT INTO probate_inventories(person_id,date_text,year,notary,place_text,currency,reference,notes) VALUES(?,?,?,?,?,?,?,?)')->execute($fields);
        $id = (int) $pdo->lastInsertId();
    }
    if (isset($data['items']) && is_array($data['items'])) {
        $pdo->prepare('DELETE FROM probate_items WHERE inventory_id=?')->execute([$id]);
        $ins = $pdo->prepare('INSERT INTO probate_items(inventory_id,room,category,description,quantity,value,value_text,position) VALUES(?,?,?,?,?,?,?,?)');
        foreach (array_values($data['items']) as $i => $it) {
            if (!is_array($it)) { continue; }
            $desc = safe_text($it['description'] ?? ''); $valueText = safe_text($it['value_text'] ?? '');
            if ($desc === '' && $valueText === '') { continue; }
            $cat = array_key_exists((string) ($it['category'] ?? ''), PROBATE_CATEGORIES) ? (string) $it['category'] : 'autre';
            $ins->execute([$id, safe_text($it['room'] ?? ''), $cat, $desc, safe_text($it['quantity'] ?? ''), parse_old_amount($valueText), $valueText, $i]);
        }
    }
    log_change($pdo, 'person', $personId, 'update', 'Inventaire après décès enregistré' . ($dateText !== '' ? " ({$dateText})" : ''));
    return ['id' => $id];
}

function delete_probate_inventory(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $row = $pdo->prepare('SELECT person_id FROM probate_inventories WHERE id=?'); $row->execute([$id]); $personId = (int) $row->fetchColumn();
    heritage_delete_media_links($pdo, 'probate_inventory', $id);
    $pdo->prepare('DELETE FROM probate_items WHERE inventory_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM probate_inventories WHERE id=?')->execute([$id]);
    if ($personId) { log_change($pdo, 'person', $personId, 'update', 'Inventaire après décès supprimé'); }
    return ['deleted' => $id];
}

/* ─── 🛟 Copie hors de cet ordinateur ────────────────────────────────── */

function offsite_settings(PDO $pdo): array
{
    $raw = $pdo->query("SELECT value FROM app_settings WHERE key='lcnda-offsite-backup'")->fetchColumn();
    $s = json_decode((string) ($raw ?: ''), true);
    return is_array($s) ? $s + ['dirs' => [], 'warn_days' => 30, 'last' => null] : ['dirs' => [], 'warn_days' => 30, 'last' => null];
}

function offsite_save_settings(PDO $pdo, array $s): void
{
    $pdo->prepare("INSERT OR REPLACE INTO app_settings(key, value, updated_at) VALUES('lcnda-offsite-backup', ?, CURRENT_TIMESTAMP)")->execute([json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
}

function offsite_expand(string $dir): string
{
    $dir = trim($dir);
    $home = getenv('HOME') ?: (getenv('USERPROFILE') ?: '');
    if ($home !== '' && ($dir === '~' || str_starts_with($dir, '~/'))) { $dir = $home . substr($dir, 1); }
    return rtrim($dir, "/\\") ?: $dir;
}

/** Dossier synchronisé avec Internet (iCloud, Dropbox, OneDrive, Google Drive…) d'après son chemin. */
function offsite_is_cloud(string $dir): bool
{
    return (bool) preg_match('#(Mobile Documents|iCloud|Dropbox|OneDrive|Google ?Drive|GoogleDrive|pCloud|Nextcloud|Box Sync|kDrive|Tresorit|MEGA)#i', $dir);
}

/** Même disque que la base ? (un dossier sur le même disque ne protège pas d'un vol ou d'une panne) */
function offsite_same_disk(string $dir): bool
{
    $a = @stat($dir); $b = @stat(DATA_DIR);
    return $a && $b && $a['dev'] === $b['dev'];
}

function offsite_last_file(string $dir): ?array
{
    $best = null;
    foreach (glob($dir . '/genealogie-*.db') ?: [] as $f) {
        $t = @filemtime($f);
        if ($t && (!$best || $t > $best['mtime'])) { $best = ['name' => basename($f), 'mtime' => $t, 'size' => (int) @filesize($f)]; }
    }
    foreach (glob($dir . '/*.lcnda*') ?: [] as $f) {
        $t = @filemtime($f);
        if ($t && (!$best || $t > $best['mtime'])) { $best = ['name' => basename($f), 'mtime' => $t, 'size' => (int) @filesize($f)]; }
    }
    return $best;
}

/** Dossiers proposés : iCloud Drive, Dropbox, OneDrive, Google Drive, disques externes et clés branchés. */
function offsite_suggestions(): array
{
    $home = getenv('HOME') ?: (getenv('USERPROFILE') ?: '');
    $out = [];
    $cands = $home !== '' ? [
        [$home . '/Library/Mobile Documents/com~apple~CloudDocs', 'iCloud Drive'], [$home . '/Dropbox', 'Dropbox'], [$home . '/OneDrive', 'OneDrive'],
        [$home . '/Google Drive', 'Google Drive'], [$home . '/Library/CloudStorage', 'Stockage en ligne (macOS)'], [$home . '/pCloud Drive', 'pCloud'], [$home . '/Nextcloud', 'Nextcloud'],
    ] : [];
    foreach ($cands as [$path, $label]) {
        if ($label === 'Stockage en ligne (macOS)' && is_dir($path)) {
            foreach (glob($path . '/*', GLOB_ONLYDIR) ?: [] as $sub) { $out[] = ['path' => $sub . '/LCNDA', 'label' => basename($sub)]; }
            continue;
        }
        if (is_dir($path)) { $out[] = ['path' => $path . '/LCNDA', 'label' => $label]; }
    }
    foreach (['/Volumes', '/media/' . get_current_user(), '/run/media/' . get_current_user()] as $root) {
        foreach (glob($root . '/*', GLOB_ONLYDIR) ?: [] as $vol) {
            if (in_array(basename($vol), ['Macintosh HD', 'Recovery', 'Preboot', 'VM', 'Data'], true) || is_link($vol)) { continue; }
            $out[] = ['path' => $vol . '/LCNDA', 'label' => 'Disque ou clé : ' . basename($vol)];
        }
    }
    if (DIRECTORY_SEPARATOR === '\\') {
        foreach (range('D', 'Z') as $l) { if (is_dir("{$l}:\\")) { $out[] = ['path' => "{$l}:\\LCNDA", 'label' => "Lecteur {$l}:"]; } }
    }
    return $out;
}

function offsite_status(PDO $pdo): array
{
    $s = offsite_settings($pdo);
    $dirs = [];
    $last = $s['last'] ?? null;
    foreach ($s['dirs'] as $d) {
        $path = offsite_expand((string) ($d['path'] ?? ''));
        $reachable = $path !== '' && is_dir($path);
        $file = $reachable ? offsite_last_file($path) : null;
        if ($file && (!$last || $file['mtime'] > (int) ($last['time'] ?? 0))) { $last = ['time' => $file['mtime'], 'dir' => $path, 'file' => $file['name']]; }
        $dirs[] = ['path' => $path, 'label' => (string) ($d['label'] ?? ''), 'reachable' => $reachable, 'cloud' => offsite_is_cloud($path),
            'same_disk' => $reachable && !offsite_is_cloud($path) && offsite_same_disk($path), 'last_file' => $file];
    }
    $days = $last ? (int) floor((time() - (int) $last['time']) / 86400) : null;
    $warnDays = max(1, (int) ($s['warn_days'] ?? 30));
    return ['dirs' => $dirs, 'last' => $last, 'days' => $days, 'warn_days' => $warnDays,
        'warn' => !$s['dirs'] ? 'none' : ($days === null || $days >= $warnDays ? 'old' : ''), 'suggestions' => offsite_suggestions()];
}

function save_offsite_settings(PDO $pdo, array $data): array
{
    $s = offsite_settings($pdo);
    $dirs = [];
    foreach (is_array($data['dirs'] ?? null) ? $data['dirs'] : [] as $d) {
        $path = offsite_expand(safe_text(is_array($d) ? ($d['path'] ?? '') : $d));
        if ($path === '' || preg_match('/[\x00-\x1f]/', $path)) { continue; }
        $dirs[$path] = ['path' => $path, 'label' => is_array($d) ? safe_text($d['label'] ?? '') : ''];
    }
    $s['dirs'] = array_values($dirs);
    $s['warn_days'] = max(1, min(365, safe_int($data['warn_days'] ?? ($s['warn_days'] ?? 30), 30)));
    offsite_save_settings($pdo, $s);
    return offsite_status($pdo);
}

/** Copie de la base (et des médias en option) dans chaque dossier hors de l'ordinateur branché. */
function offsite_copy_now(PDO $pdo, array $data): never
{
    @set_time_limit(0);
    $s = offsite_settings($pdo);
    $only = offsite_expand(safe_text($data['dir'] ?? ''));
    $withMedia = !empty($data['with_media']);
    $done = []; $errors = [];
    $pdo->exec('PRAGMA wal_checkpoint(FULL)');
    foreach ($s['dirs'] as $d) {
        $dir = offsite_expand((string) $d['path']);
        if ($only !== '' && $dir !== $only) { continue; }
        try {
            if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('dossier introuvable (disque ou clé débranché ?)'); }
            if (!is_writable($dir)) { throw new RuntimeException('dossier non accessible en écriture'); }
            // une généalogie autre que la principale range ses copies (et ses médias) dans son propre sous-dossier :
            // deux généalogies sauvegardées sur la même clé ne s'effacent pas l'une l'autre
            if (defined('GENEALOGY_ID') && GENEALOGY_ID !== '') { $dir .= '/genealogie-' . GENEALOGY_ID; if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('impossible de créer le sous-dossier de cette généalogie'); } }
            $name = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-hors-ordinateur.db';
            $pdo->exec('VACUUM main INTO ' . $pdo->quote($dir . '/' . $name));
            // On garde les 5 dernières copies de ce dossier
            $files = glob($dir . '/genealogie-backup-*-hors-ordinateur.db') ?: [];
            usort($files, static fn($a, $b) => filemtime($b) <=> filemtime($a));
            foreach (array_slice($files, 5) as $old) { @unlink($old); }
            $copied = 0;
            if ($withMedia && is_dir(MEDIA_DIR)) {
                $target = $dir . '/media';
                if (!is_dir($target)) { @mkdir($target, 0775, true); }
                foreach (scandir(MEDIA_DIR) ?: [] as $f) {
                    if ($f === '.' || $f === '..' || !is_file(MEDIA_DIR . '/' . $f)) { continue; }
                    $dest = $target . '/' . $f;
                    if (is_file($dest) && filesize($dest) === filesize(MEDIA_DIR . '/' . $f)) { continue; }
                    if (@copy(MEDIA_DIR . '/' . $f, $dest)) { $copied++; }
                }
            }
            $done[] = ['dir' => $dir, 'file' => $name, 'size' => (int) @filesize($dir . '/' . $name), 'media_copied' => $copied];
            $s['last'] = ['time' => time(), 'dir' => $dir, 'file' => $name];
        } catch (Throwable $e) {
            $errors[] = ['dir' => $dir, 'error' => $e->getMessage()];
        }
    }
    offsite_save_settings($pdo, $s);
    if (!$done && !$errors) { json_response(['error' => 'Aucun dossier hors de l’ordinateur n’est réglé.'], 422); }
    json_response(['ok' => (bool) $done, 'done' => $done, 'errors' => $errors, 'status' => offsite_status($pdo)]);
}
