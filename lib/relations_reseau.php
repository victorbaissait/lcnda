<?php
declare(strict_types=1);

/**
 * LCNDA — 🤝 Son réseau : les relations hors famille enregistrées pour elles-mêmes (idée de Family Historian 8 ; étude du
 * « réseau », le « FAN club » : amis, associés, voisins). Une relation relie deux fiches, ou une fiche et un nom libre, avec
 * une sorte (ami, voisin, associé, collègue, maître / domestique, employeur / employé, tuteur / pupille, parrain / filleul
 * hors acte, nourrice / nourrisson, maître d'apprentissage / apprenti, compagnon d'armes, liens affectifs du génogramme :
 * très proches, conflit, distance, rupture ; ou « autre » avec un mot libre), des dates, un lieu, une note et des sources
 * (source_links, entity_type = 'relation').
 *
 * Une relation est gardée UNE fois : person_id → other_id, rel_type = le rôle de l'autre pour la personne (« Pierre est son
 * employeur ») ; l'autre fiche la montre à l'envers (« Jean est son employé »), toute seule.
 *
 * GEDCOM (lib/gedcom.php) : 5.5.1 « 1 ASSO @I2@ / 2 RELA Employeur » ; 7 « 1 ASSO @I2@ / 2 ROLE FRIEND|NGHBR|OTHER
 * (3 PHRASE …, « Parrain ou marraine (hors acte) » pour ne pas devenir témoin du baptême) », un nom libre « 1 ASSO @VOID@ / 2 PHRASE Jean MARTIN » (en 5.5.1 : une note) ; dates et lieu dans la NOTE
 * (« Dates : … », « Lieu : … »), relues à l'import ; sources en SOUR. Jamais une personne vivante ou confidentielle cachée
 * par l'export (ni la relation, ni ses sources).
 *
 * API : GET reseau_person (&id), reseau_list, reseau_among (&ids=1,2,3), reseau_settings ;
 *       POST reseau_save, reseau_delete, reseau_restore, reseau_settings_save.
 * Écran : assets/js/heritage-reseau.js ; essai : tests/test-relations-reseau.js
 */

const RS_SETTING = 'genealogie-reseau';

/** sorte => [rôle de l'autre (homme, femme, sans sexe), sorte inverse, icône, groupe, rôle GEDCOM 7] */
function rs_types(): array
{
    return [
        'ami' => [['Ami', 'Amie', 'Ami ou amie'], 'ami', '🤝', 'Amitié et voisinage', 'FRIEND'],
        'voisin' => [['Voisin', 'Voisine', 'Voisin ou voisine'], 'voisin', '🏘️', 'Amitié et voisinage', 'NGHBR'],
        'associe' => [['Associé', 'Associée', 'Associé ou associée'], 'associe', '🤝', 'Travail', 'OTHER'],
        'collegue' => [['Collègue', 'Collègue', 'Collègue'], 'collegue', '🧰', 'Travail', 'OTHER'],
        'employeur' => [['Employeur', 'Employeuse', 'Employeur'], 'employe', '🏭', 'Travail', 'OTHER'],
        'employe' => [['Employé', 'Employée', 'Employé ou employée'], 'employeur', '🏭', 'Travail', 'OTHER'],
        'maitre' => [['Maître', 'Maîtresse', 'Maître ou maîtresse'], 'domestique', '🏠', 'Travail', 'OTHER'],
        'domestique' => [['Domestique', 'Domestique', 'Domestique'], 'maitre', '🏠', 'Travail', 'OTHER'],
        'maitre_apprentissage' => [['Maître d’apprentissage', 'Maîtresse d’apprentissage', 'Maître d’apprentissage'], 'apprenti', '🔨', 'Travail', 'OTHER'],
        'apprenti' => [['Apprenti', 'Apprentie', 'Apprenti ou apprentie'], 'maitre_apprentissage', '🔨', 'Travail', 'OTHER'],
        'compagnon_armes' => [['Compagnon d’armes', 'Compagne d’armes', 'Compagnon d’armes'], 'compagnon_armes', '🎖️', 'Travail', 'OTHER'],
        'tuteur' => [['Tuteur', 'Tutrice', 'Tuteur ou tutrice'], 'pupille', '⚖️', 'Protection', 'OTHER'],
        'pupille' => [['Pupille', 'Pupille', 'Pupille'], 'tuteur', '⚖️', 'Protection', 'OTHER'],
        'parrain' => [['Parrain', 'Marraine', 'Parrain ou marraine'], 'filleul', '🕊️', 'Protection', 'OTHER'], // GODP serait relu comme témoin du baptême
        'filleul' => [['Filleul', 'Filleule', 'Filleul ou filleule'], 'parrain', '🕊️', 'Protection', 'OTHER'],
        'nourrice' => [['Nourricier', 'Nourrice', 'Nourrice'], 'nourrisson', '🍼', 'Protection', 'OTHER'],
        'nourrisson' => [['Nourrisson', 'Nourrissonne', 'Nourrisson'], 'nourrice', '🍼', 'Protection', 'OTHER'],
        'proche' => [['Très proche', 'Très proche', 'Très proche'], 'proche', '💚', 'Liens affectifs', 'OTHER'],
        'conflit' => [['En conflit', 'En conflit', 'En conflit'], 'conflit', '⚡', 'Liens affectifs', 'OTHER'],
        'distance' => [['Éloigné', 'Éloignée', 'Lien distant'], 'distance', '〰️', 'Liens affectifs', 'OTHER'],
        'rupture' => [['Brouillé', 'Brouillée', 'Rupture'], 'rupture', '✂️', 'Liens affectifs', 'OTHER'],
        'autre' => [['Relation', 'Relation', 'Relation'], 'autre', '🔗', 'Autre', 'OTHER'],
    ];
}

function rs_label(string $type, string $gender, string $free = ''): string
{
    if ($type === 'autre' && trim($free) !== '') { return trim($free); }
    $t = rs_types()[$type] ?? rs_types()['autre'];
    return $t[0][$gender === 'male' ? 0 : ($gender === 'female' ? 1 : 2)];
}

function rs_inverse(string $type): string { return rs_types()[$type][1] ?? 'autre'; }

function rs_fold(string $s): string
{
    $s = function_exists('ascii_fold') ? ascii_fold($s) : (string) (@iconv('UTF-8', 'ASCII//TRANSLIT', $s) ?: $s);
    return trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower($s)));
}

/** un rôle écrit dans un GEDCOM (RELA, ROLE, PHRASE ; français ou anglais) → [sorte, mot libre] */
function rs_type_from_role(string $role): array
{
    $k = rs_fold($role);
    $map = ['friend' => 'ami', 'frie' => 'ami', 'ami' => 'ami', 'amie' => 'ami', 'ami ou amie' => 'ami', 'neighbor' => 'voisin', 'neighbour' => 'voisin', 'nghbr' => 'voisin', 'ngbr' => 'voisin', 'voisin' => 'voisin', 'voisine' => 'voisin',
        'associe' => 'associe', 'associee' => 'associe', 'business partner' => 'associe', 'partner in business' => 'associe', 'colleague' => 'collegue', 'collegue' => 'collegue', 'coworker' => 'collegue',
        'employer' => 'employeur', 'empl' => 'employeur', 'employeur' => 'employeur', 'employeuse' => 'employeur', 'patron' => 'employeur', 'employee' => 'employe', 'employe' => 'employe', 'employee ou employee' => 'employe',
        'master' => 'maitre', 'maitre' => 'maitre', 'maitresse' => 'maitre', 'servant' => 'domestique', 'domestique' => 'domestique', 'servante' => 'domestique',
        'apprentice' => 'apprenti', 'apprenti' => 'apprenti', 'apprentie' => 'apprenti', 'maitre d apprentissage' => 'maitre_apprentissage',
        'comrade' => 'compagnon_armes', 'brother in arms' => 'compagnon_armes', 'compagnon d armes' => 'compagnon_armes',
        'guardian' => 'tuteur', 'tuteur' => 'tuteur', 'tutrice' => 'tuteur', 'ward' => 'pupille', 'pupille' => 'pupille',
        'godfather' => 'parrain', 'godmother' => 'parrain', 'godparent' => 'parrain', 'godp' => 'parrain', 'parrain' => 'parrain', 'marraine' => 'parrain', 'parrain ou marraine' => 'parrain', 'parrain hors acte' => 'parrain', 'marraine hors acte' => 'parrain', 'parrain ou marraine hors acte' => 'parrain',
        'godchild' => 'filleul', 'godson' => 'filleul', 'goddaughter' => 'filleul', 'filleul' => 'filleul', 'filleule' => 'filleul',
        'nurse' => 'nourrice', 'wet nurse' => 'nourrice', 'nourrice' => 'nourrice', 'nourricier' => 'nourrice', 'nursling' => 'nourrisson', 'nourrisson' => 'nourrisson',
        'tres proche' => 'proche', 'close' => 'proche', 'en conflit' => 'conflit', 'conflict' => 'conflit', 'eloigne' => 'distance', 'eloignee' => 'distance', 'lien distant' => 'distance', 'distant' => 'distance',
        'brouille' => 'rupture', 'brouillee' => 'rupture', 'rupture' => 'rupture', 'cutoff' => 'rupture'];
    if (isset($map[$k])) { return [$map[$k], '']; }
    return ['autre', in_array($k, ['', 'other', 'relation', 'unknown', 'present'], true) ? '' : trim($role)];
}

function rs_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS person_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        other_id INTEGER REFERENCES persons(id) ON DELETE CASCADE,
        other_name TEXT NOT NULL DEFAULT '',
        rel_type TEXT NOT NULL DEFAULT 'autre',
        rel_label TEXT NOT NULL DEFAULT '',
        date_from TEXT NOT NULL DEFAULT '',
        date_to TEXT NOT NULL DEFAULT '',
        year_from INTEGER,
        year_to INTEGER,
        place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_person_relations_person ON person_relations(person_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_person_relations_other ON person_relations(other_id)');
    $done = true;
}

function rs_settings(PDO $pdo): array
{
    $def = ['fiche' => true, 'listes' => true, 'diagramme' => true, 'genogramme' => true];
    $s = function_exists('ht_setting') ? ht_setting($pdo, RS_SETTING, $def) : $def;
    return array_map(static fn($v) => $v !== false, array_intersect_key($s + $def, $def));
}

function rs_year(string $date): ?int { return preg_match('/\b(\d{3,4})\b/', $date, $m) ? (int) $m[1] : null; }

/** les fiches d'un coup : nom, sexe, années */
function rs_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 500) as $chunk) {
        $st = $pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, COALESCE(p.living_status,'') AS living_status,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.year IS NOT NULL ORDER BY t.gedcom_tag='BIRT' DESC, e.id LIMIT 1) AS by,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') AND e.year IS NOT NULL ORDER BY t.gedcom_tag='DEAT' DESC, e.id LIMIT 1) AS dy
            FROM persons p WHERE p.id IN (" . implode(',', $chunk) . ')');
        foreach ($st as $r) {
            $name = trim((string) $r['first_name'] . ' ' . mb_strtoupper((string) $r['last_name']));
            $out[(int) $r['id']] = ['id' => (int) $r['id'], 'name' => $name !== '' ? $name : 'Personne sans nom', 'gender' => (string) $r['gender'], 'by' => $r['by'] !== null ? (int) $r['by'] : null, 'dy' => $r['dy'] !== null ? (int) $r['dy'] : null, 'living' => (string) $r['living_status']];
        }
    }
    return $out;
}

function rs_sources(PDO $pdo, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return []; }
    $out = [];
    foreach ($pdo->query("SELECT sl.id AS link_id, sl.entity_id, sl.page, sl.note, s.id, s.title, s.url FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE sl.entity_type='relation' AND sl.entity_id IN (" . implode(',', $ids) . ') ORDER BY sl.id') as $r) {
        $out[(int) $r['entity_id']][] = ['link_id' => (int) $r['link_id'], 'id' => (int) $r['id'], 'title' => (string) $r['title'], 'url' => (string) $r['url'], 'page' => (string) $r['page'], 'note' => (string) $r['note']];
    }
    return $out;
}

/** une relation vue depuis la fiche $viewer (sens et mot justes), prête pour l'écran */
function rs_view(array $r, int $viewer, array $people, array $places, array $sources): array
{
    $out = (int) $r['person_id'] === $viewer;
    $otherId = $out ? (int) ($r['other_id'] ?? 0) : (int) $r['person_id'];
    $type = $out ? (string) $r['rel_type'] : rs_inverse((string) $r['rel_type']);
    $other = $otherId ? ($people[$otherId] ?? null) : null;
    $label = rs_label($type, $other['gender'] ?? '', $out ? (string) $r['rel_label'] : ((string) $r['rel_type'] === 'autre' ? (string) $r['rel_label'] : ''));
    $t = rs_types()[$type] ?? rs_types()['autre'];
    return ['id' => (int) $r['id'], 'dir' => $out ? 'out' : 'in', 'type' => $type, 'stored_type' => (string) $r['rel_type'], 'label' => $label, 'icon' => $t[2], 'group' => $t[3],
        'other' => $other, 'other_name' => $other ? $other['name'] : (string) $r['other_name'], 'free' => !$otherId,
        'date_from' => (string) $r['date_from'], 'date_to' => (string) $r['date_to'], 'year_from' => $r['year_from'] !== null ? (int) $r['year_from'] : null, 'year_to' => $r['year_to'] !== null ? (int) $r['year_to'] : null,
        'place' => $r['place_id'] ? ($places[(int) $r['place_id']] ?? null) : null, 'note' => (string) $r['note'], 'sources' => $sources[(int) $r['id']] ?? [],
        'person_id' => (int) $r['person_id'], 'other_id' => $r['other_id'] !== null ? (int) $r['other_id'] : null, 'rel_label' => (string) $r['rel_label']];
}

function rs_places(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach ($pdo->query('SELECT id, name, county, country, latitude, longitude FROM places WHERE id IN (' . implode(',', $ids) . ')') as $p) { $out[(int) $p['id']] = ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'county' => (string) $p['county'], 'lat' => $p['latitude'] !== null ? (float) $p['latitude'] : null, 'lon' => $p['longitude'] !== null ? (float) $p['longitude'] : null]; }
    return $out;
}

/** GET reseau_person : les relations d'une fiche (les siennes et celles des autres vers elle) */
function rs_person(PDO $pdo, int $id): array
{
    rs_schema($pdo);
    $st = $pdo->prepare('SELECT * FROM person_relations WHERE person_id=? OR other_id=? ORDER BY COALESCE(year_from, year_to, 9999), id');
    $st->execute([$id, $id]); $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $people = rs_people($pdo, array_merge([$id], array_column($rows, 'person_id'), array_column($rows, 'other_id')));
    $rows = array_values(array_filter($rows, static fn($r) => isset($people[(int) $r['person_id']]) && ($r['other_id'] === null || isset($people[(int) $r['other_id']])))); // fiche supprimée depuis
    $places = rs_places($pdo, array_column($rows, 'place_id'));
    $sources = rs_sources($pdo, array_column($rows, 'id'));
    return ['person' => $people[$id] ?? null, 'relations' => array_map(static fn($r) => rs_view($r, $id, $people, $places, $sources), $rows), 'types' => rs_type_list(), 'settings' => rs_settings($pdo)];
}

function rs_type_list(): array
{
    $out = [];
    foreach (rs_types() as $k => $t) { $out[] = ['key' => $k, 'label' => $t[0][2], 'm' => $t[0][0], 'f' => $t[0][1], 'inverse' => $t[1], 'icon' => $t[2], 'group' => $t[3]]; }
    return $out;
}

/** GET reseau_list : toutes les relations (Listes) — une ligne par relation, les deux noms */
function rs_list(PDO $pdo): array
{
    rs_schema($pdo);
    $rows = $pdo->query('SELECT * FROM person_relations ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $people = rs_people($pdo, array_merge(array_column($rows, 'person_id'), array_column($rows, 'other_id')));
    $rows = array_values(array_filter($rows, static fn($r) => isset($people[(int) $r['person_id']]) && ($r['other_id'] === null || isset($people[(int) $r['other_id']]))));
    $places = rs_places($pdo, array_column($rows, 'place_id'));
    $sources = rs_sources($pdo, array_column($rows, 'id'));
    $out = [];
    foreach ($rows as $r) {
        $v = rs_view($r, (int) $r['person_id'], $people, $places, $sources);
        $a = $people[(int) $r['person_id']] ?? null;
        $out[] = ['id' => (int) $r['id'], 'person_id' => (int) $r['person_id'], 'person' => $a['name'] ?? '?', 'other_id' => $v['other_id'], 'other' => $v['other_name'], 'role' => $v['label'],
            'role_back' => rs_label(rs_inverse((string) $r['rel_type']), $a['gender'] ?? '', (string) $r['rel_type'] === 'autre' ? (string) $r['rel_label'] : ''),
            'type' => (string) $r['rel_type'], 'group' => $v['group'], 'icon' => $v['icon'], 'date_from' => $v['date_from'], 'date_to' => $v['date_to'], 'year_from' => $v['year_from'], 'year_to' => $v['year_to'],
            'place' => $v['place']['name'] ?? '', 'lat' => $v['place']['lat'] ?? null, 'lon' => $v['place']['lon'] ?? null, 'note' => $v['note'],
            'source' => implode(' ; ', array_map(static fn($s) => trim($s['title'] . ($s['page'] !== '' ? ', ' . $s['page'] : '')), $v['sources'])), 'source_url' => $v['sources'][0]['url'] ?? ''];
    }
    return ['rows' => $out, 'types' => rs_type_list()];
}

/** GET reseau_among : les relations entre des fiches données (génogramme : liens affectifs) */
function rs_among(PDO $pdo, string $ids): array
{
    rs_schema($pdo);
    $list = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', $ids))))), 0, 2000);
    if (count($list) < 2) { return ['links' => []]; }
    $in = implode(',', $list);
    $out = [];
    foreach ($pdo->query("SELECT id, person_id, other_id, rel_type, rel_label FROM person_relations WHERE other_id IS NOT NULL AND person_id IN ($in) AND other_id IN ($in)") as $r) {
        $out[] = ['id' => (int) $r['id'], 'a' => (int) $r['person_id'], 'b' => (int) $r['other_id'], 'type' => (string) $r['rel_type'], 'label' => rs_label((string) $r['rel_type'], '', (string) $r['rel_label'])];
    }
    return ['links' => $out];
}

/** les relations d'une fiche pour le diagramme « Réseau social » (api.php, graph_network_data) */
function rs_for_network(PDO $pdo, int $id): array
{
    if (!rs_settings($pdo)['diagramme']) { return []; }
    $d = rs_person($pdo, $id);
    return array_values(array_filter($d['relations'], static fn($r) => $r['other'] !== null));
}

function rs_row(PDO $pdo, int $id): ?array
{
    $st = $pdo->prepare('SELECT * FROM person_relations WHERE id=?'); $st->execute([$id]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    if (!$r) { return null; }
    $l = $pdo->prepare("SELECT source_record_id, page, quality, note FROM source_links WHERE entity_type='relation' AND entity_id=? ORDER BY id"); $l->execute([$id]);
    $r['sources'] = $l->fetchAll(PDO::FETCH_ASSOC);
    return $r;
}

/** POST reseau_save : ajouter ou changer une relation ; rend la relation d'avant (↶ Annuler) */
function rs_save(PDO $pdo, array $d): array
{
    rs_schema($pdo);
    $id = (int) ($d['id'] ?? 0);
    $pid = (int) ($d['person_id'] ?? 0);
    $other = $d['other_id'] ?? null;
    $otherName = trim(mb_substr((string) ($d['other_name'] ?? ''), 0, 200));
    if (is_string($other) && str_starts_with($other, 'txt:')) { $otherName = trim(mb_substr(substr($other, 4), 0, 200)); $other = null; }
    $other = $other !== null && $other !== '' ? (int) $other : null;
    if (!$pid || !$pdo->query('SELECT 1 FROM persons WHERE id=' . $pid)->fetchColumn()) { throw new RuntimeException('Choisis la fiche de départ.'); }
    if ($other) {
        if ($other === $pid) { throw new RuntimeException('Une personne ne peut pas être en relation avec elle-même.'); }
        if (!$pdo->query('SELECT 1 FROM persons WHERE id=' . $other)->fetchColumn()) { throw new RuntimeException('Fiche introuvable.'); }
        $otherName = '';
    } elseif ($otherName === '') { throw new RuntimeException('Choisis une fiche ou écris un nom.'); }
    $type = (string) ($d['rel_type'] ?? 'autre');
    if (!isset(rs_types()[$type])) { $type = 'autre'; }
    $label = $type === 'autre' ? trim(mb_substr((string) ($d['rel_label'] ?? ''), 0, 80)) : '';
    $from = trim(mb_substr((string) ($d['date_from'] ?? ''), 0, 60)); $to = trim(mb_substr((string) ($d['date_to'] ?? ''), 0, 60));
    $place = (int) ($d['place_id'] ?? 0) ?: null;
    if ($place && !$pdo->query('SELECT 1 FROM places WHERE id=' . $place)->fetchColumn()) { $place = null; }
    $note = trim(mb_substr((string) ($d['note'] ?? ''), 0, 4000));
    $before = $id ? rs_row($pdo, $id) : null;
    if ($id && !$before) { throw new RuntimeException('Relation introuvable.'); }
    $vals = [$pid, $other, $otherName, $type, $label, $from, $to, rs_year($from), rs_year($to), $place, $note];
    if ($id) {
        $pdo->prepare('UPDATE person_relations SET person_id=?, other_id=?, other_name=?, rel_type=?, rel_label=?, date_from=?, date_to=?, year_from=?, year_to=?, place_id=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
    } else {
        $pdo->prepare('INSERT INTO person_relations(person_id, other_id, other_name, rel_type, rel_label, date_from, date_to, year_from, year_to, place_id, note) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    // la source : une seule citation tenue par la fenêtre (les autres, venues d'un import, restent)
    if (array_key_exists('source_id', $d)) {
        $sid = (int) ($d['source_id'] ?? 0); $page = trim(mb_substr((string) ($d['source_page'] ?? ''), 0, 400));
        $first = $pdo->prepare("SELECT id FROM source_links WHERE entity_type='relation' AND entity_id=? ORDER BY id LIMIT 1"); $first->execute([$id]); $lid = (int) $first->fetchColumn();
        if ($sid && $pdo->query('SELECT 1 FROM sources WHERE id=' . $sid)->fetchColumn()) {
            if ($lid) { $pdo->prepare('UPDATE source_links SET source_record_id=?, page=? WHERE id=?')->execute([$sid, $page, $lid]); }
            else { $pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page) VALUES('relation',?,?,?)")->execute([$id, $sid, $page]); }
        } elseif ($lid) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$lid]); }
    }
    $after = rs_row($pdo, $id);
    if (function_exists('log_change')) { log_change($pdo, 'person', $pid, $before ? 'update' : 'create', ($before ? 'Relation changée : ' : 'Relation ajoutée : ') . rs_label($type, '', $label) . ' — ' . ($other ? '#' . $other : $otherName), $before, $after); }
    return ['id' => $id, 'before' => $before, 'row' => $after];
}

/** POST reseau_delete : rend la relation entière (sources comprises) pour « ↶ Annuler » */
function rs_delete(PDO $pdo, array $d): array
{
    rs_schema($pdo);
    $id = (int) ($d['id'] ?? 0);
    $row = rs_row($pdo, $id);
    if (!$row) { throw new RuntimeException('Relation introuvable.'); }
    $pdo->prepare("DELETE FROM source_links WHERE entity_type='relation' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM person_relations WHERE id=?')->execute([$id]);
    if (function_exists('log_change')) { log_change($pdo, 'person', (int) $row['person_id'], 'delete', 'Relation retirée : ' . rs_label((string) $row['rel_type'], '', (string) $row['rel_label']), $row, null); }
    return ['row' => $row];
}

/** POST reseau_restore : remettre une relation retirée (même numéro) ou celle d'avant un changement */
function rs_restore(PDO $pdo, array $d): array
{
    rs_schema($pdo);
    $row = $d['row'] ?? null;
    if (is_string($row)) { $row = json_decode($row, true); }
    if (!is_array($row) || !(int) ($row['id'] ?? 0)) { throw new RuntimeException('Rien à remettre.'); }
    $id = (int) $row['id'];
    $cols = ['person_id', 'other_id', 'other_name', 'rel_type', 'rel_label', 'date_from', 'date_to', 'year_from', 'year_to', 'place_id', 'note', 'created_at'];
    $vals = array_map(static fn($c) => $row[$c] ?? null, $cols);
    foreach (['other_name', 'rel_label', 'date_from', 'date_to', 'note'] as $c) { $vals[array_search($c, $cols, true)] = (string) ($row[$c] ?? ''); }
    $vals[array_search('created_at', $cols, true)] = (string) ($row['created_at'] ?? date('Y-m-d H:i:s'));
    $pdo->prepare('DELETE FROM person_relations WHERE id=?')->execute([$id]);
    $pdo->prepare('INSERT INTO person_relations(id, ' . implode(', ', $cols) . ') VALUES(?' . str_repeat(',?', count($cols)) . ')')->execute([$id, ...$vals]);
    $pdo->prepare("DELETE FROM source_links WHERE entity_type='relation' AND entity_id=?")->execute([$id]);
    $ins = $pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES('relation',?,?,?,?,?)");
    foreach ((array) ($row['sources'] ?? []) as $s) { if ((int) ($s['source_record_id'] ?? 0)) { $ins->execute([$id, (int) $s['source_record_id'], (string) ($s['page'] ?? ''), (string) ($s['quality'] ?? ''), (string) ($s['note'] ?? '')]); } }
    if (function_exists('log_change')) { log_change($pdo, 'person', (int) $row['person_id'], 'update', 'Relation remise (↶ Annuler)', null, $row); }
    return ['id' => $id];
}

/* ─── GEDCOM ─────────────────────────────────────────────────────────── */

/** la note écrite dans l'ASSO (dates, lieu, note), relue à l'import */
function rs_gedcom_note(array $r, string $placeName): string
{
    $lines = [];
    $from = trim((string) $r['date_from']); $to = trim((string) $r['date_to']);
    if ($from !== '' || $to !== '') { $lines[] = 'Dates : ' . ($from !== '' && $to !== '' ? 'de ' . $from . ' à ' . $to : ($from !== '' ? 'depuis ' . $from : 'jusqu’à ' . $to)); }
    if ($placeName !== '') { $lines[] = 'Lieu : ' . $placeName; }
    if (trim((string) $r['note']) !== '') { $lines[] = trim((string) $r['note']); }
    return implode("\n", $lines);
}

function rs_gedcom_parse_note(string $text): array
{
    $out = ['date_from' => '', 'date_to' => '', 'place' => '', 'note' => []];
    foreach (preg_split('/\R/u', trim($text)) as $l) {
        if (preg_match('/^Dates\s*:\s*(?:de\s+(.+?)\s+à\s+(.+)|depuis\s+(.+)|jusqu’à\s+(.+)|jusqu\'à\s+(.+))$/u', trim($l), $m)) {
            $out['date_from'] = trim($m[1] ?: ($m[3] ?? '')); $out['date_to'] = trim(($m[2] ?? '') ?: (($m[4] ?? '') ?: ($m[5] ?? '')));
        } elseif (preg_match('/^Lieu\s*:\s*(.+)$/u', trim($l), $m)) { $out['place'] = trim($m[1]); }
        else { $out['note'][] = $l; }
    }
    $out['note'] = trim(implode("\n", $out['note']));
    return $out;
}

/** une relation lue dans un GEDCOM (ASSO de la fiche sans événement) ; null si elle existe déjà (aller-retour, ou écrite des deux côtés) */
function rs_import_asso(PDO $pdo, int $pid, ?int $otherId, string $otherName, string $role, string $noteText): ?int
{
    rs_schema($pdo);
    [$type, $label] = rs_type_from_role($role);
    $n = rs_gedcom_parse_note($noteText);
    if ($otherId) {
        $dup = $pdo->prepare('SELECT 1 FROM person_relations WHERE (person_id=? AND other_id=? AND rel_type=?) OR (person_id=? AND other_id=? AND rel_type=?) LIMIT 1');
        $dup->execute([$pid, $otherId, $type, $otherId, $pid, rs_inverse($type)]);
        if ($dup->fetchColumn()) { return null; }
    }
    $place = null;
    if ($n['place'] !== '') {
        $st = $pdo->prepare('SELECT id FROM places WHERE name=? COLLATE NOCASE ORDER BY COALESCE(population,0) DESC, id LIMIT 1'); $st->execute([explode(',', $n['place'])[0]]);
        $place = (int) $st->fetchColumn() ?: null;
        if (!$place) { $n['note'] = trim('Lieu : ' . $n['place'] . "\n" . $n['note']); }
    }
    $pdo->prepare('INSERT INTO person_relations(person_id, other_id, other_name, rel_type, rel_label, date_from, date_to, year_from, year_to, place_id, note) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$pid, $otherId, $otherId ? '' : mb_substr($otherName, 0, 200), $type, mb_substr($label, 0, 80), $n['date_from'], $n['date_to'], rs_year($n['date_from']), rs_year($n['date_to']), $place, $n['note']]);
    return (int) $pdo->lastInsertId();
}

/**
 * Pour l'export : les relations à écrire sous chaque fiche, et les relations à garder secrètes (une des deux fiches cachée
 * ou absente du fichier ; un nom libre en mode « pour partager »). $visible, $hidden : tableaux id => true.
 */
function rs_export_rows(PDO $pdo, array $visible, array $hidden, bool $share): array
{
    try { rs_schema($pdo); } catch (Throwable $_) { return [[], []]; }
    $by = []; $secret = [];
    $places = [];
    try { foreach ($pdo->query('SELECT pr.*, pl.name AS place_name, pl.county AS place_county FROM person_relations pr LEFT JOIN places pl ON pl.id=pr.place_id ORDER BY pr.id') as $r) {
        $a = (int) $r['person_id']; $b = $r['other_id'] !== null ? (int) $r['other_id'] : 0;
        $ok = isset($visible[$a]) && !isset($hidden[$a]) && ($b ? isset($visible[$b]) && !isset($hidden[$b]) : !$share && trim((string) $r['other_name']) !== '');
        if (!$ok) { $secret[(int) $r['id']] = true; continue; }
        $by[$a][] = $r;
    } } catch (Throwable $_) { return [[], []]; }
    return [$by, $secret];
}

/* ─── API ────────────────────────────────────────────────────────────── */

function rs_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'reseau_person' => rs_person($pdo, (int) ($q['id'] ?? 0)),
        'reseau_list' => rs_list($pdo),
        'reseau_among' => rs_among($pdo, (string) ($q['ids'] ?? '')),
        'reseau_settings' => ['settings' => rs_settings($pdo), 'types' => rs_type_list()],
        default => throw new RuntimeException('Action inconnue.'),
    };
}

function rs_api_post(PDO $pdo, string $action, array $d): array
{
    if ($action === 'reseau_save') { return rs_save($pdo, $d); }
    if ($action === 'reseau_delete') { return rs_delete($pdo, $d); }
    if ($action === 'reseau_restore') { return rs_restore($pdo, $d); }
    if ($action === 'reseau_settings_save') {
        $before = rs_settings($pdo); $new = $before;
        foreach (array_keys($before) as $k) { if (array_key_exists($k, $d)) { $new[$k] = !in_array($d[$k], [false, 0, '0', 'false', ''], true); } }
        ht_save_setting($pdo, RS_SETTING, $new);
        return ['before' => $before, 'settings' => rs_settings($pdo)];
    }
    throw new RuntimeException('Action inconnue.');
}
