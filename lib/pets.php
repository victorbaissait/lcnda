<?php
declare(strict_types=1);

/**
 * 🐾 Animaux de compagnie (Listes → Animaux de compagnie, structure n°39) : une fiche complète pour chaque animal —
 * identité, race, robe, identification (puce, tatouage, livre des origines), éleveur, propriétaires (des fiches de la
 * famille), titres, santé, mesures, histoire, photos — et ses parents (père, mère) : de quoi faire le pedigree d'un
 * animal de race, sa descendance, ses frères et sœurs, et son taux de consanguinité.
 * Le détail est dans pets.data_json ; sire_id et dam_id (les parents dans la base) servent au pedigree ;
 * pet_people dit quelles fiches sont liées à quel animal (propriétaires, éleveur) pour le bloc de la fiche.
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

function pet_title(array $d): string
{
    $n = trim((string) ($d['name'] ?? '')) ?: trim((string) ($d['call_name'] ?? '')) ?: trim((string) ($d['registered_name'] ?? ''));
    return $n !== '' ? $n : 'Animal sans nom';
}

/** Les animaux, pour la liste et les choix (père, mère) */
function pets_list(PDO $pdo, array $q = []): array
{
    $rows = $pdo->query('SELECT id, sire_id, dam_id, data_json, updated_at FROM pets ORDER BY updated_at DESC, id DESC')->fetchAll();
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
        $d = json_decode((string) $r['data_json'], true) ?: [];
        if ($species !== '' && ($d['species'] ?? '') !== $species) { continue; }
        if ($owner && !in_array($owner, $people[(int) $r['id']] ?? [], true)) { continue; }
        $hay = mb_strtolower(implode(' ', [pet_title($d), $d['registered_name'] ?? '', $d['breed'] ?? '', $d['color'] ?? '', $d['microchip'] ?? '', $d['registration'] ?? '', $d['breeder'] ?? '', $d['affix'] ?? '', implode(' ', array_column($d['owners'] ?? [], 'name'))]));
        if ($needle !== '' && !str_contains($hay, $needle)) { continue; }
        $id = (int) $r['id'];
        $out[] = ['id' => $id, 'title' => pet_title($d), 'registered_name' => $d['registered_name'] ?? '', 'species' => $d['species'] ?? '', 'species_label' => PET_SPECIES[$d['species'] ?? ''] ?? '',
            'breed' => $d['breed'] ?? '', 'sex' => $d['sex'] ?? '', 'color' => $d['color'] ?? '', 'birth_date' => $d['birth_date'] ?? '', 'death_date' => $d['death_date'] ?? '', 'deceased' => !empty($d['deceased']),
            'owners' => array_values(array_filter(array_map(static fn($o) => $o['name'] ?? '', $d['owners'] ?? []))), 'sire_id' => (int) $r['sire_id'], 'dam_id' => (int) $r['dam_id'],
            'offspring' => $kids[$id] ?? 0, 'titles' => count($d['titles'] ?? []), 'media' => array_slice($media[$id] ?? [], 0, 1), 'media_count' => count($media[$id] ?? []), 'updated_at' => $r['updated_at']];
    }
    return $out;
}

function pet_row(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT id, sire_id, dam_id, data_json FROM pets WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { return null; }
    $d = json_decode((string) $r['data_json'], true) ?: [];
    return ['id' => (int) $r['id'], 'sire_id' => (int) $r['sire_id'], 'dam_id' => (int) $r['dam_id'], 'd' => $d];
}

/** Un animal en bref (pour le pedigree, les parents, les petits) */
function pet_brief(?array $r, array $media = []): ?array
{
    if (!$r) { return null; }
    $d = $r['d'];
    return ['id' => $r['id'], 'title' => pet_title($d), 'registered_name' => $d['registered_name'] ?? '', 'sex' => $d['sex'] ?? '', 'breed' => $d['breed'] ?? '', 'color' => $d['color'] ?? '',
        'birth_date' => $d['birth_date'] ?? '', 'death_date' => $d['death_date'] ?? '', 'registration' => $d['registration'] ?? '', 'titles' => array_values(array_filter(array_map(static fn($t) => $t['title'] ?? '', $d['titles'] ?? []))),
        'sire_id' => $r['sire_id'], 'dam_id' => $r['dam_id'], 'sire_name' => $d['sire_name'] ?? '', 'dam_name' => $d['dam_name'] ?? '', 'photo' => $media[$r['id']][0] ?? null];
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
    $kids = [];
    $s = $pdo->prepare('SELECT id, sire_id, dam_id, data_json FROM pets WHERE sire_id=? OR dam_id=? ORDER BY id'); $s->execute([$id, $id]);
    foreach ($s->fetchAll() as $k) { $kids[] = ['id' => (int) $k['id'], 'sire_id' => (int) $k['sire_id'], 'dam_id' => (int) $k['dam_id'], 'd' => json_decode((string) $k['data_json'], true) ?: []]; }
    $sibs = [];
    if ($r['sire_id'] || $r['dam_id']) {
        $s = $pdo->prepare('SELECT id, sire_id, dam_id, data_json FROM pets WHERE id<>? AND ((sire_id>0 AND sire_id=?) OR (dam_id>0 AND dam_id=?)) ORDER BY id'); $s->execute([$id, $r['sire_id'], $r['dam_id']]);
        foreach ($s->fetchAll() as $k) { $sibs[] = ['id' => (int) $k['id'], 'sire_id' => (int) $k['sire_id'], 'dam_id' => (int) $k['dam_id'], 'd' => json_decode((string) $k['data_json'], true) ?: []]; }
    }
    $others = [];
    foreach ($kids as $k) { foreach (['sire_id', 'dam_id'] as $p) { if ($k[$p] && $k[$p] !== $id) { $others[$k[$p]] = true; } } }
    $otherRows = array_filter(array_map(static fn($oid) => pet_row($pdo, (int) $oid), array_keys($others)));
    $media = heritage_media($pdo, 'pet', array_merge([$id], array_column($kids, 'id'), array_column($sibs, 'id'), array_keys($others)));
    $ownerIds = array_values(array_unique(array_filter(array_column($d['owners'], 'person_id'))));
    $people = $ownerIds ? collection_people($pdo, $ownerIds) : [];
    return ['id' => $id, 'title' => pet_title($d), 'data' => $d, 'species' => PET_SPECIES, 'ancestors' => pet_ancestors($pdo, $id, 5),
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
    $pdo->prepare('DELETE FROM pet_people WHERE pet_id=?')->execute([$id]);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO pet_people(pet_id, person_id, role) VALUES(?,?,?)');
    foreach ($d['owners'] as $o) { if ($o['person_id']) { $ins->execute([$id, $o['person_id'], $o['role'] ?: 'propriétaire']); } }
    log_change($pdo, 'meta', 0, ($data['id'] ?? 0) ? 'update' : 'create', 'Animal enregistré : ' . pet_title($d));
    return ['id' => $id, 'title' => pet_title($d)];
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
    $pdo->prepare('DELETE FROM pets WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Animal supprimé (n°' . $id . ')');
    return ['ok' => true];
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
