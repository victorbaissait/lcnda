<?php
declare(strict_types=1);

/**
 * 🐾 Animaux de compagnie (Listes → Animaux de compagnie, structure n°39) : une fiche complète pour chaque animal —
 * identité, race, robe, identification (puce, tatouage, livre des origines), éleveur, propriétaires (des fiches de la
 * famille), titres, santé, mesures, histoire, photos — et ses parents (père, mère) : de quoi faire le pedigree d'un
 * animal de race, sa descendance, ses frères et sœurs, et son taux de consanguinité.
 * Le détail est dans pets.data_json ; sire_id et dam_id (les parents dans la base) servent au pedigree ;
 * pet_people dit quelles fiches sont liées à quel animal (propriétaires, éleveur) pour le bloc de la fiche.
 * Un animal peut avoir en plus une vraie fiche, comme une personne (persons.kind = 'animal', pets.person_id) :
 * son nom, son sexe, sa naissance, son décès et ses parents viennent alors de cette fiche (c'est elle qui fait foi),
 * et l'animal entre dans l'arbre, les événements, les photos, les sources… comme n'importe quelle fiche.
 */

const PET_SPECIES = ['chien' => 'Chien', 'chat' => 'Chat', 'cheval' => 'Cheval, poney, âne', 'lapin' => 'Lapin', 'rongeur' => 'Rongeur (cochon d’Inde, hamster…)', 'oiseau' => 'Oiseau',
    'poisson' => 'Poisson', 'reptile' => 'Reptile, tortue', 'ferme' => 'Animal de la ferme (vache, chèvre, mouton…)', 'autre' => 'Autre'];
const PET_TEXT_FIELDS = ['name' => 120, 'registered_name' => 200, 'call_name' => 80, 'species' => 20, 'breed' => 120, 'variety' => 120, 'sex' => 1, 'neutered_date' => 40,
    'color' => 120, 'markings' => 300, 'coat' => 120, 'eyes' => 80, 'height' => 40, 'weight' => 40, 'birth_date' => 40, 'birth_place' => 200, 'death_date' => 40, 'death_place' => 200,
    'death_cause' => 300, 'burial' => 300, 'microchip' => 40, 'tattoo' => 40, 'passport' => 60, 'registry' => 120, 'registration' => 80, 'pedigree_number' => 80, 'ueln' => 40,
    'dna' => 200, 'breeder' => 200, 'affix' => 120, 'breeder_address' => 300, 'litter' => 80, 'sire_name' => 200, 'dam_name' => 200, 'sire_registration' => 80, 'dam_registration' => 80,
    'vet' => 200, 'insurance' => 200, 'food' => 600, 'character' => 2000, 'habits' => 2000, 'allergies' => 600, 'medical' => 4000, 'story' => 20000, 'memories' => 20000, 'notes' => 8000, 'sources' => 4000];
const PET_LIST_FIELDS = [
    'owners' => ['person_id' => 'int', 'name' => 200, 'role' => 40, 'from' => 40, 'to' => 40, 'note' => 300],
    'titles' => ['date' => 40, 'event' => 200, 'place' => 200, 'title' => 200, 'judge' => 120, 'result' => 120],
    'vaccines' => ['date' => 40, 'vaccine' => 200, 'vet' => 200, 'next' => 40],
    'tests' => ['date' => 40, 'test' => 200, 'result' => 200, 'lab' => 200],
    'measures' => ['date' => 40, 'weight' => 40, 'height' => 40, 'note' => 200],
    'events' => ['date' => 40, 'kind' => 60, 'text' => 600, 'place' => 200],
];

function pet_clean(array $d): array
{
    $out = [];
    foreach (PET_TEXT_FIELDS as $f => $n) { $out[$f] = mb_substr(trim((string) (is_scalar($d[$f] ?? null) ? $d[$f] : '')), 0, $n); }
    $out['species'] = isset(PET_SPECIES[$out['species']]) ? $out['species'] : ($out['species'] === '' ? 'chien' : 'autre');
    $out['sex'] = in_array($out['sex'], ['M', 'F'], true) ? $out['sex'] : '';
    $out['neutered'] = !empty($d['neutered']);
    $out['deceased'] = !empty($d['deceased']) || $out['death_date'] !== '';
    $out['sire_id'] = max(0, (int) ($d['sire_id'] ?? 0));
    $out['dam_id'] = max(0, (int) ($d['dam_id'] ?? 0));
    foreach (PET_LIST_FIELDS as $list => $fields) {
        $rows = [];
        foreach (array_slice(is_array($d[$list] ?? null) ? $d[$list] : [], 0, 200) as $row) {
            if (!is_array($row)) { continue; }
            $r = [];
            foreach ($fields as $f => $n) { $r[$f] = $n === 'int' ? max(0, (int) ($row[$f] ?? 0)) : mb_substr(trim((string) (is_scalar($row[$f] ?? null) ? $row[$f] : '')), 0, $n); }
            if (array_filter($r, static fn($v) => $v !== '' && $v !== 0)) { $rows[] = $r; }
        }
        $out[$list] = $rows;
    }
    return $out;
}

/** Les faits tirés de la fiche complète (nom, sexe, naissance, décès), pour les animaux qui en ont une */
function pet_facts(PDO $pdo, array $personIds): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $personIds))));
    if (!$ids) { return []; }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $s = $pdo->prepare("SELECT id, first_name, middle_name, last_name, gender, living_status FROM persons WHERE id IN ($in)"); $s->execute($ids);
    $out = [];
    foreach ($s->fetchAll() as $r) {
        $out[(int) $r['id']] = ['name' => trim(implode(' ', array_filter([$r['first_name'], $r['middle_name'], $r['last_name']], static fn($v) => trim((string) $v) !== ''))), 'first_name' => (string) $r['first_name'],
            'sex' => $r['gender'] === 'male' ? 'M' : ($r['gender'] === 'female' ? 'F' : ''), 'deceased' => $r['living_status'] === 'deceased'];
    }
    $e = $pdo->prepare("SELECT e.person_id, upper(t.gedcom_tag) AS tag, e.date_text, COALESCE(pl.name, '') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.scope='person' AND e.person_id IN ($in) AND upper(t.gedcom_tag) IN ('BIRT', 'DEAT') ORDER BY e.id"); $e->execute($ids);
    foreach ($e->fetchAll() as $r) {
        $k = $r['tag'] === 'BIRT' ? 'birth' : 'death'; $pid = (int) $r['person_id'];
        if (!isset($out[$pid]) || isset($out[$pid][$k . '_date'])) { continue; }
        $out[$pid][$k . '_date'] = (string) $r['date_text']; $out[$pid][$k . '_place'] = (string) $r['place'];
    }
    return $out;
}

/** La fiche d'animal, avec ce que dit sa fiche complète (qui fait foi) */
function pet_overlay(array $d, ?array $f): array
{
    if (!$f) { return $d; }
    if ($f['name'] !== '') { $d['name'] = $f['name']; }
    if ($f['sex'] !== '') { $d['sex'] = $f['sex']; }
    foreach (['birth_date', 'birth_place', 'death_date', 'death_place'] as $k) { if (($f[$k] ?? '') !== '') { $d[$k] = $f[$k]; } }
    $d['deceased'] = !empty($d['deceased']) || $f['deceased'] || ($d['death_date'] ?? '') !== '';
    return $d;
}

/**
 * Les parents donnés sur les fiches complètes (familles) passent dans le pedigree (appelé seulement pendant une écriture).
 * Un parent qui a une fiche complète suit la famille (ajouté, changé ou retiré) ; un parent qui n'a que sa fiche d'animal reste.
 */
function pets_sync_parents(PDO $pdo): void
{
    try { $pdo->query('SELECT person_id FROM pets LIMIT 1'); } catch (Throwable) { return; }
    foreach (['sire_id' => 'male', 'dam_id' => 'female'] as $col => $g) {
        $pdo->exec("UPDATE pets SET $col = COALESCE((SELECT pp.id FROM family_children fc JOIN families f ON f.id=fc.family_id JOIN persons par ON par.id IN (f.partner1_id, f.partner2_id) JOIN pets pp ON pp.person_id=par.id
            WHERE fc.child_id=pets.person_id AND par.gender='$g' AND pp.id<>pets.id ORDER BY fc.id LIMIT 1),
            CASE WHEN (SELECT s.person_id FROM pets s WHERE s.id=pets.$col) IS NOT NULL THEN NULL ELSE $col END) WHERE person_id IS NOT NULL");
    }
}

/** Les parents (fiches complètes) d'un animal : il quitte ses familles et rejoint celle de son père et de sa mère (ses frères et sœurs ne bougent pas) */
function pet_set_parents(PDO $pdo, int $child, int $sire, int $dam): void
{
    $s = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?'); $s->execute([$child]);
    $cur = []; foreach ($s->fetchAll() as $f) { foreach ([$f['partner1_id'], $f['partner2_id']] as $x) { if ((int) $x) { $cur[] = (int) $x; } } }
    $want = array_values(array_filter([$sire, $dam])); $a = array_unique($cur); sort($a); $b = $want; sort($b);
    if ($a === $b) { return; }
    $old = $pdo->prepare('SELECT family_id FROM family_children WHERE child_id=?'); $old->execute([$child]); $oldFams = array_map('intval', $old->fetchAll(PDO::FETCH_COLUMN));
    $pdo->prepare('DELETE FROM family_children WHERE child_id=?')->execute([$child]);
    // une famille sans enfant et sans couple complet ne sert plus
    foreach ($oldFams as $fid) { $pdo->prepare('DELETE FROM families WHERE id=? AND (partner1_id IS NULL OR partner2_id IS NULL) AND NOT EXISTS (SELECT 1 FROM family_children WHERE family_id=?)')->execute([$fid, $fid]); }
    if (!$want) { return; }
    $f = $pdo->prepare('SELECT id FROM families WHERE (partner1_id IS ? AND partner2_id IS ?) OR (partner1_id IS ? AND partner2_id IS ?) ORDER BY id LIMIT 1');
    $f->execute([$sire ?: null, $dam ?: null, $dam ?: null, $sire ?: null]);
    $fid = (int) $f->fetchColumn();
    if (!$fid) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?, ?)')->execute([$sire ?: null, $dam ?: null]); $fid = (int) $pdo->lastInsertId(); }
    $pdo->prepare("INSERT INTO family_children(family_id, child_id, relation_to_partner1, relation_to_partner2, position) VALUES(?, ?, 'biological', 'biological', (SELECT COALESCE(max(position), 0) + 1 FROM family_children WHERE family_id=?))")->execute([$fid, $child, $fid]);
}

/** La fiche complète d'un animal est supprimée : sa fiche d'animal garde son nom, son sexe, ses dates */
function pet_detach_person(PDO $pdo, int $personId): void
{
    try { $s = $pdo->prepare('SELECT id, data_json FROM pets WHERE person_id=?'); $s->execute([$personId]); } catch (Throwable) { return; }
    $facts = pet_facts($pdo, [$personId]);
    foreach ($s->fetchAll() as $r) {
        $d = pet_overlay(json_decode((string) $r['data_json'], true) ?: [], $facts[$personId] ?? null);
        $pdo->prepare('UPDATE pets SET person_id=NULL, data_json=? WHERE id=?')->execute([json_encode($d, JSON_UNESCAPED_UNICODE), (int) $r['id']]);
    }
}

/** Faire (ou mettre à jour) la fiche complète d'un animal : nom, sexe, vie, naissance, décès, parents qui ont une fiche */
function pet_sync_person(PDO $pdo, int $petId, array $d, bool $create = false): int
{
    $s = $pdo->prepare('SELECT person_id FROM pets WHERE id=?'); $s->execute([$petId]);
    $pid = (int) $s->fetchColumn();
    if ($pid && !person_exists($pdo, $pid)) { $pid = 0; }
    if (!$pid && !$create) { return 0; }
    $name = trim((string) ($d['name'] ?? '')) ?: trim((string) ($d['call_name'] ?? '')) ?: trim((string) ($d['registered_name'] ?? '')) ?: 'Animal sans nom';
    $gender = ($d['sex'] ?? '') === 'M' ? 'male' : (($d['sex'] ?? '') === 'F' ? 'female' : 'unknown');
    if (!$pid) {
        $pdo->prepare("INSERT INTO persons(first_name, last_name, gender, living_status, kind) VALUES(?, '', ?, ?, 'animal')")->execute([$name, $gender, !empty($d['deceased']) ? 'deceased' : 'unknown']);
        $pid = (int) $pdo->lastInsertId();
        $pdo->prepare('UPDATE pets SET person_id=? WHERE id=?')->execute([$pid, $petId]);
        log_change($pdo, 'person', $pid, 'create', 'Fiche complète de l’animal : ' . $name);
    } else {
        // le nom écrit dans la fiche d'animal est le nom complet : on garde le nom de famille (l'affixe) de la fiche
        $p = $pdo->prepare('SELECT first_name, middle_name, last_name FROM persons WHERE id=?'); $p->execute([$pid]); $cur = $p->fetch() ?: [];
        $tail = trim(implode(' ', array_filter([$cur['middle_name'] ?? '', $cur['last_name'] ?? ''], static fn($v) => trim((string) $v) !== '')));
        $first = $tail !== '' && str_ends_with($name, ' ' . $tail) ? trim(mb_substr($name, 0, mb_strlen($name) - mb_strlen($tail) - 1)) : $name;
        $pdo->prepare("UPDATE persons SET first_name=?, gender=?, living_status=CASE WHEN ? THEN 'deceased' ELSE living_status END, kind='animal', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$first ?: $name, $gender, !empty($d['deceased']) ? 1 : 0, $pid]);
    }
    // naissance et décès : un événement de la fiche (créé, ou mis à jour s'il change)
    foreach (['BIRT' => 'birth', 'DEAT' => 'death'] as $tag => $k) {
        $date = trim((string) ($d[$k . '_date'] ?? '')); $place = trim((string) ($d[$k . '_place'] ?? ''));
        if ($date === '' && $place === '') { continue; }
        $t = $pdo->prepare("SELECT id FROM event_types WHERE scope='person' AND upper(gedcom_tag)=? ORDER BY is_custom, id LIMIT 1"); $t->execute([$tag]); $tid = (int) $t->fetchColumn();
        if (!$tid) { continue; }
        preg_match('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', $date, $m); $year = isset($m[1]) ? (int) $m[1] : null;
        $placeId = $place !== '' ? find_or_create_place($pdo, $place) : null;
        $e = $pdo->prepare("SELECT e.id, e.date_text, e.place_id FROM events e WHERE e.scope='person' AND e.person_id=? AND e.event_type_id IN (SELECT id FROM event_types WHERE scope='person' AND upper(gedcom_tag)=?) ORDER BY e.id LIMIT 1"); $e->execute([$pid, $tag]);
        if ($ev = $e->fetch()) {
            if ((string) $ev['date_text'] !== $date || ((int) $ev['place_id'] !== (int) $placeId && $placeId)) { $pdo->prepare('UPDATE events SET date_text=?, year=?, place_id=COALESCE(?, place_id), updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$date, $year, $placeId, (int) $ev['id']]); }
        } else {
            $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, place_id) VALUES('person', ?, ?, ?, ?, ?)")->execute([$pid, $tid, $date, $year, $placeId]);
        }
    }
    // parents qui ont une fiche complète : la famille de l'animal (un parent sans fiche complète reste seulement dans le pedigree)
    $pp = static function (int $petId) use ($pdo): int { if (!$petId) { return 0; } $q = $pdo->prepare('SELECT person_id FROM pets WHERE id=?'); $q->execute([$petId]); $x = (int) $q->fetchColumn(); return $x && person_exists($pdo, $x) ? $x : 0; };
    pet_set_parents($pdo, $pid, $pp((int) ($d['sire_id'] ?? 0)), $pp((int) ($d['dam_id'] ?? 0)));
    return $pid;
}

/** « Faire aussi une fiche complète » : l'animal devient une fiche comme une personne ; ses petits et parents qui en ont une y sont reliés */
function pet_make_person(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $r = pet_row($pdo, $id); if (!$r) { throw new RuntimeException('Animal introuvable.'); }
    $pid = pet_sync_person($pdo, $id, ['sire_id' => $r['sire_id'], 'dam_id' => $r['dam_id']] + $r['d'], true);
    // ses petits qui ont déjà une fiche complète : reliés à lui
    $k = $pdo->prepare('SELECT id, sire_id, dam_id, data_json FROM pets WHERE (sire_id=? OR dam_id=?) AND person_id IS NOT NULL'); $k->execute([$id, $id]);
    foreach ($k->fetchAll() as $kid) { pet_sync_person($pdo, (int) $kid['id'], ['sire_id' => (int) $kid['sire_id'], 'dam_id' => (int) $kid['dam_id']] + (json_decode((string) $kid['data_json'], true) ?: [])); }
    return ['person_id' => $pid];
}

/** La fiche d'animal d'une fiche complète (créée si besoin, pour un animal fait depuis « Nouvelle personne ») */
function pet_of_person(PDO $pdo, int $personId, bool $create = false): int
{
    try { $s = $pdo->prepare('SELECT id FROM pets WHERE person_id=? ORDER BY id LIMIT 1'); $s->execute([$personId]); } catch (Throwable) { return 0; }
    $id = (int) $s->fetchColumn();
    if ($id || !$create) { return $id; }
    $pdo->prepare('INSERT INTO pets(data_json, person_id) VALUES(?, ?)')->execute([json_encode(pet_clean([]), JSON_UNESCAPED_UNICODE), $personId]);
    return (int) $pdo->lastInsertId();
}

function pet_title(array $d): string
{
    $n = trim((string) ($d['name'] ?? '')) ?: trim((string) ($d['call_name'] ?? '')) ?: trim((string) ($d['registered_name'] ?? ''));
    return $n !== '' ? $n : 'Animal sans nom';
}

/** Les animaux, pour la liste et les choix (père, mère) */
function pets_list(PDO $pdo, array $q = []): array
{
    $rows = $pdo->query('SELECT id, sire_id, dam_id, data_json, updated_at, person_id FROM pets ORDER BY updated_at DESC, id DESC')->fetchAll();
    $facts = pet_facts($pdo, array_column($rows, 'person_id'));
    $media = heritage_media($pdo, 'pet', array_column($rows, 'id'));
    $needle = mb_strtolower(trim((string) ($q['q'] ?? '')));
    $species = (string) ($q['species'] ?? '');
    $owner = safe_int($q['person_id'] ?? 0);
    $people = [];
    foreach ($pdo->query('SELECT pet_id, person_id FROM pet_people') as $r) { $people[(int) $r['pet_id']][] = (int) $r['person_id']; }
    $kids = [];
    foreach ($rows as $r) { foreach (['sire_id', 'dam_id'] as $k) { if ((int) $r[$k]) { $kids[(int) $r[$k]] = ($kids[(int) $r[$k]] ?? 0) + 1; } } }
    $out = [];
    foreach ($rows as $r) {
        $d = pet_overlay(json_decode((string) $r['data_json'], true) ?: [], $facts[(int) $r['person_id']] ?? null);
        if ($species !== '' && ($d['species'] ?? '') !== $species) { continue; }
        if ($owner && !in_array($owner, $people[(int) $r['id']] ?? [], true)) { continue; }
        $hay = mb_strtolower(implode(' ', [pet_title($d), $d['registered_name'] ?? '', $d['breed'] ?? '', $d['color'] ?? '', $d['microchip'] ?? '', $d['registration'] ?? '', $d['breeder'] ?? '', $d['affix'] ?? '', implode(' ', array_column($d['owners'] ?? [], 'name'))]));
        if ($needle !== '' && !str_contains($hay, $needle)) { continue; }
        $id = (int) $r['id'];
        $out[] = ['id' => $id, 'title' => pet_title($d), 'registered_name' => $d['registered_name'] ?? '', 'species' => $d['species'] ?? '', 'species_label' => PET_SPECIES[$d['species'] ?? ''] ?? '',
            'breed' => $d['breed'] ?? '', 'sex' => $d['sex'] ?? '', 'color' => $d['color'] ?? '', 'birth_date' => $d['birth_date'] ?? '', 'death_date' => $d['death_date'] ?? '', 'deceased' => !empty($d['deceased']),
            'owners' => array_values(array_filter(array_map(static fn($o) => $o['name'] ?? '', $d['owners'] ?? []))), 'sire_id' => (int) $r['sire_id'], 'dam_id' => (int) $r['dam_id'],
            'offspring' => $kids[$id] ?? 0, 'titles' => count($d['titles'] ?? []), 'person_id' => isset($facts[(int) $r['person_id']]) ? (int) $r['person_id'] : 0, 'media' => array_slice($media[$id] ?? [], 0, 1), 'media_count' => count($media[$id] ?? []), 'updated_at' => $r['updated_at']];
    }
    return $out;
}

function pet_row(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT id, sire_id, dam_id, data_json, person_id FROM pets WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { return null; }
    $pid = (int) $r['person_id'];
    $f = $pid ? (pet_facts($pdo, [$pid])[$pid] ?? null) : null;
    $d = pet_overlay(json_decode((string) $r['data_json'], true) ?: [], $f);
    return ['id' => (int) $r['id'], 'sire_id' => (int) $r['sire_id'], 'dam_id' => (int) $r['dam_id'], 'd' => $d, 'person_id' => $f ? $pid : 0];
}

/** Un animal en bref (pour le pedigree, les parents, les petits) */
function pet_brief(?array $r, array $media = []): ?array
{
    if (!$r) { return null; }
    $d = $r['d'];
    return ['id' => $r['id'], 'title' => pet_title($d), 'registered_name' => $d['registered_name'] ?? '', 'sex' => $d['sex'] ?? '', 'breed' => $d['breed'] ?? '', 'color' => $d['color'] ?? '',
        'birth_date' => $d['birth_date'] ?? '', 'death_date' => $d['death_date'] ?? '', 'registration' => $d['registration'] ?? '', 'titles' => array_values(array_filter(array_map(static fn($t) => $t['title'] ?? '', $d['titles'] ?? []))),
        'sire_id' => $r['sire_id'], 'dam_id' => $r['dam_id'], 'person_id' => $r['person_id'] ?? 0, 'sire_name' => $d['sire_name'] ?? '', 'dam_name' => $d['dam_name'] ?? '', 'photo' => $media[$r['id']][0] ?? null];
}

/** Les ancêtres d'un animal sur n générations : id → bref (pour le pedigree et la consanguinité) */
function pet_ancestors(PDO $pdo, int $id, int $gens): array
{
    $all = []; $front = [$id];
    for ($g = 0; $g <= $gens && $front; $g++) {
        $next = [];
        foreach ($front as $pid) {
            if (isset($all[$pid])) { continue; }
            $r = pet_row($pdo, $pid); if (!$r) { continue; }
            $all[$pid] = $r;
            if ($g < $gens) { foreach (['sire_id', 'dam_id'] as $k) { if ($r[$k] && !isset($all[$r[$k]])) { $next[] = $r[$k]; } } }
        }
        $front = $next;
    }
    $media = heritage_media($pdo, 'pet', array_keys($all));
    return array_map(static fn($r) => pet_brief($r, $media), $all);
}

function pet_detail(PDO $pdo, int $id): array
{
    $r = pet_row($pdo, $id);
    if (!$r) { throw new RuntimeException('Animal introuvable.'); }
    $d = pet_clean($r['d']);
    // petits (et l'autre parent de chaque portée), frères et sœurs
    $s = $pdo->prepare('SELECT id FROM pets WHERE sire_id=? OR dam_id=? ORDER BY id'); $s->execute([$id, $id]);
    $kids = array_values(array_filter(array_map(static fn($k) => pet_row($pdo, (int) $k), $s->fetchAll(PDO::FETCH_COLUMN))));
    $sibs = [];
    if ($r['sire_id'] || $r['dam_id']) {
        $s = $pdo->prepare('SELECT id FROM pets WHERE id<>? AND ((sire_id>0 AND sire_id=?) OR (dam_id>0 AND dam_id=?)) ORDER BY id'); $s->execute([$id, $r['sire_id'], $r['dam_id']]);
        $sibs = array_values(array_filter(array_map(static fn($k) => pet_row($pdo, (int) $k), $s->fetchAll(PDO::FETCH_COLUMN))));
    }
    $others = [];
    foreach ($kids as $k) { foreach (['sire_id', 'dam_id'] as $p) { if ($k[$p] && $k[$p] !== $id) { $others[$k[$p]] = true; } } }
    $otherRows = array_filter(array_map(static fn($oid) => pet_row($pdo, (int) $oid), array_keys($others)));
    $media = heritage_media($pdo, 'pet', array_merge([$id], array_column($kids, 'id'), array_column($sibs, 'id'), array_keys($others)));
    $ownerIds = array_values(array_unique(array_filter(array_column($d['owners'], 'person_id'))));
    $people = $ownerIds ? collection_people($pdo, $ownerIds) : [];
    return ['id' => $id, 'title' => pet_title($d), 'data' => $d, 'person_id' => $r['person_id'], 'species' => PET_SPECIES, 'ancestors' => pet_ancestors($pdo, $id, 5),
        'offspring' => array_map(static fn($k) => pet_brief($k, $media), $kids), 'siblings' => array_map(static fn($k) => pet_brief($k, $media), $sibs),
        'mates' => array_values(array_map(static fn($o) => pet_brief($o, $media), $otherRows)),
        'people' => array_map(static fn($p) => ['id' => (int) $p['id'], 'name' => full_name($p)], $people), 'media' => $media[$id] ?? [],
        'labels' => function_exists('collection_labels') ? (collection_labels($pdo, 'pet', [$id])[$id] ?? []) : [],
        'boards' => function_exists('boards_linked') ? boards_linked($pdo, 'pet', $id) : []];
}

/** Un animal ne peut pas être son propre ancêtre (ni le père être une femelle, ni la mère un mâle) */
function pet_check_parents(PDO $pdo, int $id, int $sire, int $dam): void
{
    foreach (['sire' => $sire, 'dam' => $dam] as $role => $pid) {
        if (!$pid) { continue; }
        $p = pet_row($pdo, $pid);
        if (!$p) { throw new RuntimeException(($role === 'sire' ? 'Le père' : 'La mère') . ' choisi(e) n’existe plus.'); }
        $sex = $p['d']['sex'] ?? '';
        if ($role === 'sire' && $sex === 'F') { throw new RuntimeException('« ' . pet_title($p['d']) . ' » est une femelle : elle ne peut pas être le père.'); }
        if ($role === 'dam' && $sex === 'M') { throw new RuntimeException('« ' . pet_title($p['d']) . ' » est un mâle : il ne peut pas être la mère.'); }
        if ($id && ($pid === $id || isset(pet_ancestors($pdo, $pid, 30)[$id]))) { throw new RuntimeException('Boucle dans le pedigree : un animal ne peut pas être son propre ancêtre.'); }
    }
    if ($sire && $sire === $dam) { throw new RuntimeException('Le père et la mère sont le même animal.'); }
}

function save_pet(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $d = pet_clean(is_array($data['data'] ?? null) ? $data['data'] : $data);
    pet_check_parents($pdo, $id, $d['sire_id'], $d['dam_id']);
    foreach ($d['owners'] as $o) { if ($o['person_id']) { h_person_exists($pdo, $o['person_id']); } }
    $json = json_encode($d, JSON_UNESCAPED_UNICODE);
    if ($id) {
        $s = $pdo->prepare('UPDATE pets SET data_json=?, sire_id=?, dam_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$json, $d['sire_id'] ?: null, $d['dam_id'] ?: null, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Animal introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO pets(data_json, sire_id, dam_id) VALUES(?,?,?)')->execute([$json, $d['sire_id'] ?: null, $d['dam_id'] ?: null]);
        $id = (int) $pdo->lastInsertId();
    }
    pet_sync_person($pdo, $id, $d, !empty($data['make_person']));
    $pdo->prepare('DELETE FROM pet_people WHERE pet_id=?')->execute([$id]);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO pet_people(pet_id, person_id, role) VALUES(?,?,?)');
    foreach ($d['owners'] as $o) { if ($o['person_id']) { $ins->execute([$id, $o['person_id'], $o['role'] ?: 'propriétaire']); } }
    log_change($pdo, 'meta', 0, ($data['id'] ?? 0) ? 'update' : 'create', 'Animal enregistré : ' . pet_title($d));
    $q = $pdo->prepare('SELECT person_id FROM pets WHERE id=?'); $q->execute([$id]);
    return ['id' => $id, 'title' => pet_title($d), 'person_id' => (int) $q->fetchColumn()];
}

function delete_pet(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    // ses petits gardent leur fiche ; ils perdent seulement ce parent (son nom reste écrit)
    $r = pet_row($pdo, $id);
    if ($r) {
        $name = pet_title($r['d']);
        foreach (['sire_id' => 'sire_name', 'dam_id' => 'dam_name'] as $col => $nameField) {
            $s = $pdo->prepare("SELECT id, data_json FROM pets WHERE $col=?"); $s->execute([$id]);
            foreach ($s->fetchAll() as $k) {
                $kd = json_decode((string) $k['data_json'], true) ?: []; $kd[$col] = 0; if (($kd[$nameField] ?? '') === '') { $kd[$nameField] = $name; }
                $pdo->prepare("UPDATE pets SET $col=NULL, data_json=? WHERE id=?")->execute([json_encode($kd, JSON_UNESCAPED_UNICODE), (int) $k['id']]);
            }
        }
    }
    heritage_delete_media_links($pdo, 'pet', $id);
    $pdo->prepare('DELETE FROM pet_people WHERE pet_id=?')->execute([$id]);
    // sa fiche complète aussi, si on le demande (sinon elle reste, comme une fiche sans fiche d'animal)
    $pid = (int) ($r['person_id'] ?? 0);
    $pdo->prepare('DELETE FROM pets WHERE id=?')->execute([$id]);
    if ($pid && !empty($data['with_person']) && person_exists($pdo, $pid)) { delete_person($pdo, ['id' => $pid]); }
    log_change($pdo, 'meta', 0, 'delete', 'Animal supprimé (n°' . $id . ')');
    return ['ok' => true];
}

/** Pour l'arbre (en option) : les animaux de chaque maître */
function pets_by_owner(PDO $pdo, array $personIds): array
{
    $ids = array_values(array_filter(array_map('intval', $personIds)));
    if (!$ids) { return []; }
    try { $s = $pdo->prepare('SELECT pp.person_id AS owner, pp.role, p.id, p.data_json, p.person_id FROM pet_people pp JOIN pets p ON p.id=pp.pet_id WHERE pp.person_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY p.id'); $s->execute($ids); }
    catch (Throwable) { return []; }
    $rows = $s->fetchAll(); $facts = pet_facts($pdo, array_column($rows, 'person_id')); $out = [];
    foreach ($rows as $r) {
        $d = pet_overlay(json_decode((string) $r['data_json'], true) ?: [], $facts[(int) $r['person_id']] ?? null);
        $out[(int) $r['owner']][] = ['id' => (int) $r['id'], 'title' => pet_title($d), 'species' => $d['species'] ?? '', 'role' => (string) $r['role'], 'person_id' => isset($facts[(int) $r['person_id']]) ? (int) $r['person_id'] : 0];
    }
    return $out;
}

/** Pour la fiche d'une personne : ses animaux (propriétaire, éleveur…) */
function pets_for_person(PDO $pdo, int $personId): array
{
    if ($personId <= 0) { return []; }
    try { $s = $pdo->prepare('SELECT pp.role, p.id, p.sire_id, p.dam_id, p.data_json FROM pet_people pp JOIN pets p ON p.id=pp.pet_id WHERE pp.person_id=? ORDER BY p.id'); $s->execute([$personId]); }
    catch (Throwable) { return []; }
    $rows = $s->fetchAll();
    $media = heritage_media($pdo, 'pet', array_map(static fn($r) => (int) $r['id'], $rows));
    $out = [];
    foreach ($rows as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $own = array_values(array_filter($d['owners'] ?? [], static fn($o) => (int) ($o['person_id'] ?? 0) === $personId))[0] ?? [];
        $out[] = ['id' => (int) $r['id'], 'title' => pet_title($d), 'species' => PET_SPECIES[$d['species'] ?? ''] ?? '', 'breed' => $d['breed'] ?? '', 'sex' => $d['sex'] ?? '', 'birth_date' => $d['birth_date'] ?? '',
            'death_date' => $d['death_date'] ?? '', 'role' => (string) $r['role'], 'from' => $own['from'] ?? '', 'to' => $own['to'] ?? '', 'photo' => $media[(int) $r['id']][0] ?? null];
    }
    return $out;
}
