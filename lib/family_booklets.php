<?php
declare(strict_types=1);

/**
 * 📘 Livrets de famille (Listes → Livrets de famille, structure n°35) : la transcription complète d'un livret —
 * délivrance, époux, épouse, leurs parents, le mariage (civil, religieux, contrat), les enfants (naissances, mentions,
 * décès), les décès des époux, divorce et mentions — avec les photos des pages et un recueil.
 * Comme dans un recensement, chaque personne écrite peut être reliée à une fiche : le livret apparaît alors sur la fiche
 * (bloc « Livrets de famille ») et ses dates peuvent être reportées sur les fiches (événements, couple, enfants).
 * Le détail est dans family_booklets.data_json ; family_booklet_people sert d'index (qui est dans quel livret).
 */

const BOOKLET_ROLES = ['husband' => 'Époux', 'wife' => 'Épouse', 'husband_father' => 'Père de l’époux', 'husband_mother' => 'Mère de l’époux',
    'wife_father' => 'Père de l’épouse', 'wife_mother' => 'Mère de l’épouse', 'child' => 'Enfant', 'witness' => 'Témoin / autre'];
const BOOKLET_SLOT_FIELDS = ['written_name', 'sex', 'birth_date', 'birth_place', 'occupation', 'residence', 'death_date', 'death_place', 'marriage_note', 'recognition', 'note'];
const BOOKLET_TOP_FIELDS = ['title', 'commune', 'department', 'country', 'issued', 'number', 'model', 'holder', 'kept_at', 'condition', 'officer',
    'marriage_date', 'marriage_place', 'marriage_officer', 'contract_notary', 'contract_date', 'religious_date', 'religious_parish', 'divorce_date', 'divorce_note',
    'mentions', 'transcription', 'notes', 'sources'];

function booklet_clean_slot(array $s): array
{
    $out = [];
    foreach (BOOKLET_SLOT_FIELDS as $f) { $out[$f] = mb_substr(trim((string) ($s[$f] ?? '')), 0, $f === 'note' ? 2000 : 300); }
    $out['sex'] = in_array($out['sex'], ['M', 'F'], true) ? $out['sex'] : '';
    $out['person_id'] = max(0, (int) ($s['person_id'] ?? 0));
    return $out;
}

function booklet_clean(array $d): array
{
    $out = [];
    foreach (BOOKLET_TOP_FIELDS as $f) { $out[$f] = mb_substr(trim((string) ($d[$f] ?? '')), 0, in_array($f, ['mentions', 'transcription', 'notes', 'sources'], true) ? 40000 : 300); }
    foreach (['husband', 'wife', 'husband_father', 'husband_mother', 'wife_father', 'wife_mother'] as $r) { $out[$r] = booklet_clean_slot(is_array($d[$r] ?? null) ? $d[$r] : []); }
    $out['children'] = array_values(array_filter(array_map(static fn($c) => is_array($c) ? booklet_clean_slot($c) : null, array_slice(is_array($d['children'] ?? null) ? $d['children'] : [], 0, 40)),
        static fn($c) => $c && ($c['written_name'] !== '' || $c['person_id'] || $c['birth_date'] !== '')));
    $out['others'] = array_values(array_filter(array_map(static fn($c) => is_array($c) ? booklet_clean_slot($c) : null, array_slice(is_array($d['others'] ?? null) ? $d['others'] : [], 0, 40)),
        static fn($c) => $c && ($c['written_name'] !== '' || $c['person_id'])));
    $out['design'] = booklet_clean_design(is_array($d['design'] ?? null) ? $d['design'] : []);
    return $out;
}

/** L'apparence d'un livret (couleurs, polices, disposition, parties) : seulement des valeurs sûres pour le CSS */
function booklet_clean_design(array $g): array
{
    $out = [];
    foreach (['cover', 'cover_ink', 'page', 'ink', 'rule', 'title', 'accent'] as $k) { if (preg_match('/^#[0-9a-f]{6}$/i', (string) ($g[$k] ?? ''))) { $out[$k] = strtolower((string) $g[$k]); } }
    foreach (['font', 'title_font'] as $k) { $f = trim((string) ($g[$k] ?? '')); if ($f !== '' && preg_match('/^[\p{L}\p{N} ,\'"\-_.]{1,160}$/u', $f)) { $out[$k] = $f; } }
    if (is_numeric($g['size'] ?? null)) { $out['size'] = max(11, min(24, (int) $g['size'])); }
    if (is_numeric($g['title_size'] ?? null)) { $out['title_size'] = max(12, min(40, (int) $g['title_size'])); }
    foreach (['layout' => ['2', '1'], 'frame' => ['double', 'single', 'none', 'thick'], 'corners' => ['square', 'round'], 'shadow' => ['yes', 'no'], 'preset' => ['bleu', 'vert', 'bordeaux', 'ancien', 'sobre', 'mine']] as $k => $allowed) {
        if (in_array((string) ($g[$k] ?? ''), $allowed, true)) { $out[$k] = (string) $g[$k]; }
    }
    $secs = ['cover', 'marriage', 'couple', 'children', 'others', 'mentions', 'transcription', 'notes', 'pages'];
    if (is_array($g['order'] ?? null)) { $out['order'] = array_values(array_unique(array_filter($g['order'], static fn($x) => in_array($x, $secs, true)))); }
    if (is_array($g['hidden'] ?? null)) { $out['hidden'] = array_values(array_unique(array_filter($g['hidden'], static fn($x) => in_array($x, $secs, true)))); }
    return $out;
}

/** Les personnes d'un livret : [rôle, numéro, case] (pour l'index et les fiches) */
function booklet_slots(array $d): array
{
    $out = [];
    foreach (['husband', 'wife', 'husband_father', 'husband_mother', 'wife_father', 'wife_mother'] as $r) { if (($d[$r]['written_name'] ?? '') !== '' || ($d[$r]['person_id'] ?? 0)) { $out[] = [$r, 0, $d[$r]]; } }
    foreach ($d['children'] ?? [] as $i => $c) { $out[] = ['child', $i, $c]; }
    foreach ($d['others'] ?? [] as $i => $c) { $out[] = ['witness', $i, $c]; }
    return $out;
}

function booklet_title(array $d): string
{
    if (($d['title'] ?? '') !== '') { return $d['title']; }
    $n = static fn($s) => trim((string) ($s['written_name'] ?? ''));
    $couple = implode(' et ', array_filter([$n($d['husband'] ?? []), $n($d['wife'] ?? [])]));
    return $couple !== '' ? 'Livret de ' . $couple : 'Livret de famille';
}

function booklets_list(PDO $pdo, string $q = ''): array
{
    $rows = $pdo->query('SELECT * FROM family_booklets ORDER BY updated_at DESC, id DESC')->fetchAll();
    $media = heritage_media($pdo, 'family_booklet', array_column($rows, 'id'));
    $out = [];
    $needle = mb_strtolower(trim($q));
    foreach ($rows as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $title = booklet_title($d);
        $hay = mb_strtolower($title . ' ' . implode(' ', array_map(static fn($s) => $s[2]['written_name'] ?? '', booklet_slots($d))) . ' ' . ($d['commune'] ?? ''));
        if ($needle !== '' && !str_contains($hay, $needle)) { continue; }
        $out[] = ['id' => (int) $r['id'], 'title' => $title, 'commune' => $d['commune'] ?? '', 'issued' => $d['issued'] ?? '', 'marriage_date' => $d['marriage_date'] ?? '',
            'children' => count($d['children'] ?? []), 'linked' => count(array_filter(booklet_slots($d), static fn($s) => ($s[2]['person_id'] ?? 0) > 0)),
            'people' => count(booklet_slots($d)), 'media' => array_slice($media[(int) $r['id']] ?? [], 0, 3), 'media_count' => count($media[(int) $r['id']] ?? []), 'updated_at' => $r['updated_at']];
    }
    return $out;
}

function booklet_detail(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM family_booklets WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Livret introuvable.'); }
    $d = booklet_clean(json_decode((string) $r['data_json'], true) ?: []);
    $ids = array_values(array_unique(array_filter(array_map(static fn($x) => (int) ($x[2]['person_id'] ?? 0), booklet_slots($d)))));
    $people = $ids ? collection_people($pdo, $ids) : [];
    $brief = static fn($p) => $p ? ['id' => (int) $p['id'], 'name' => full_name($p), 'birth' => (string) (($p['birth_date'] ?? '') ?: ($p['birth_year'] ?? '')), 'death' => (string) (($p['death_date'] ?? '') ?: ($p['death_year'] ?? '')), 'gender' => (string) $p['gender']] : null;
    return ['id' => $id, 'title' => booklet_title($d), 'data' => $d, 'people' => array_map($brief, $people), 'media' => heritage_media($pdo, 'family_booklet', [$id])[$id] ?? [],
        'labels' => function_exists('collection_labels') ? (collection_labels($pdo, 'family_booklet', [$id])[$id] ?? []) : [], 'roles' => BOOKLET_ROLES, 'updated_at' => $r['updated_at']];
}

function save_booklet(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $d = booklet_clean(is_array($data['data'] ?? null) ? $data['data'] : $data);
    foreach (booklet_slots($d) as [, , $slot]) { if ($slot['person_id']) { h_person_exists($pdo, $slot['person_id']); } }
    $json = json_encode($d, JSON_UNESCAPED_UNICODE);
    if ($id) {
        $s = $pdo->prepare('UPDATE family_booklets SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Livret introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO family_booklets(data_json) VALUES(?)')->execute([$json]); $id = (int) $pdo->lastInsertId();
    }
    // index : qui est dans ce livret
    $pdo->prepare('DELETE FROM family_booklet_people WHERE booklet_id=?')->execute([$id]);
    $ins = $pdo->prepare('INSERT INTO family_booklet_people(booklet_id, role, position, person_id, written_name) VALUES(?,?,?,?,?)');
    foreach (booklet_slots($d) as [$role, $pos, $slot]) { $ins->execute([$id, $role, $pos, $slot['person_id'] ?: null, $slot['written_name']]); }
    log_change($pdo, 'meta', 0, $data['id'] ?? 0 ? 'update' : 'create', 'Livret de famille enregistré : ' . booklet_title($d));
    return ['id' => $id, 'title' => booklet_title($d)];
}

function delete_booklet(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    heritage_delete_media_links($pdo, 'family_booklet', $id);
    $pdo->prepare('DELETE FROM family_booklet_people WHERE booklet_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM family_booklets WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Livret de famille supprimé (n°' . $id . ')');
    return ['ok' => true];
}

/** Pour la fiche : les livrets où la personne figure, avec son rôle et ce qui y est écrit sur elle */
function booklet_person_mentions(PDO $pdo, int $personId): array
{
    if ($personId <= 0) { return []; }
    try {
        $s = $pdo->prepare('SELECT bp.booklet_id, bp.role, bp.position, b.data_json FROM family_booklet_people bp JOIN family_booklets b ON b.id=bp.booklet_id WHERE bp.person_id=? ORDER BY b.id');
        $s->execute([$personId]);
    } catch (Throwable) { return []; }
    $out = [];
    foreach ($s->fetchAll() as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $slot = $r['role'] === 'child' ? ($d['children'][(int) $r['position']] ?? []) : ($r['role'] === 'witness' ? ($d['others'][(int) $r['position']] ?? []) : ($d[$r['role']] ?? []));
        $out[] = ['id' => (int) $r['booklet_id'], 'title' => booklet_title($d), 'role' => $r['role'], 'role_label' => BOOKLET_ROLES[$r['role']] ?? $r['role'], 'commune' => $d['commune'] ?? '',
            'issued' => $d['issued'] ?? '', 'slot' => $slot, 'marriage' => in_array($r['role'], ['husband', 'wife'], true) ? trim(($d['marriage_date'] ?? '') . (($d['marriage_place'] ?? '') !== '' ? ' à ' . $d['marriage_place'] : '')) : '',
            'media' => array_slice(heritage_media($pdo, 'family_booklet', [(int) $r['booklet_id']])[(int) $r['booklet_id']] ?? [], 0, 2)];
    }
    return $out;
}

/** Ce que le livret apporterait aux fiches reliées (seulement ce qui manque : rien n'est écrasé) */
function booklet_proposals(PDO $pdo, int $id): array
{
    $d = booklet_detail($pdo, $id)['data'];
    $tag = static function (PDO $pdo, string $t): int { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
    $has = static function (PDO $pdo, int $pid, array $tags): bool {
        $s = $pdo->prepare('SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag IN (' . implode(',', array_fill(0, count($tags), '?')) . ") AND (trim(COALESCE(e.date_text,''))<>'' OR e.year IS NOT NULL) LIMIT 1");
        $s->execute([$pid, ...$tags]); return (bool) $s->fetchColumn();
    };
    $out = [];
    $add = static function (string $key, string $label, string $what) use (&$out) { $out[] = ['key' => $key, 'label' => $label, 'what' => $what]; };
    $name = static fn(array $s) => $s['written_name'] !== '' ? $s['written_name'] : 'la personne';
    $slots = array_merge(array_map(static fn($r) => [$r, $d[$r]], ['husband', 'wife', 'husband_father', 'husband_mother', 'wife_father', 'wife_mother']), array_map(static fn($c, $i) => ['child:' . $i, $c], $d['children'], array_keys($d['children'])));
    foreach ($slots as [$k, $s]) {
        $pid = (int) ($s['person_id'] ?? 0); if (!$pid) { continue; }
        if (($s['birth_date'] !== '' || $s['birth_place'] !== '') && !$has($pdo, $pid, ['BIRT', 'CHR', 'BAPM'])) { $add("$k:birth", 'Naissance de ' . $name($s), trim($s['birth_date'] . ($s['birth_place'] !== '' ? ' à ' . $s['birth_place'] : ''))); }
        if (($s['death_date'] !== '' || $s['death_place'] !== '') && !$has($pdo, $pid, ['DEAT', 'BURI'])) { $add("$k:death", 'Décès de ' . $name($s), trim($s['death_date'] . ($s['death_place'] !== '' ? ' à ' . $s['death_place'] : ''))); }
        if ($s['occupation'] !== '') { $p = $pdo->prepare('SELECT occupation FROM persons WHERE id=?'); $p->execute([$pid]); if (trim((string) $p->fetchColumn()) === '') { $add("$k:occupation", 'Métier de ' . $name($s), $s['occupation']); } }
    }
    $h = (int) $d['husband']['person_id']; $w = (int) $d['wife']['person_id'];
    if ($h || $w) {
        $fam = booklet_family($pdo, $h, $w, false);
        if (($d['marriage_date'] !== '' || $d['marriage_place'] !== '')) {
            $hasM = false;
            if ($fam) { $s = $pdo->prepare("SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=? AND t.gedcom_tag='MARR' LIMIT 1"); $s->execute([$fam]); $hasM = (bool) $s->fetchColumn(); }
            if (!$hasM && $h && $w) { $add('marriage', 'Mariage du couple', trim($d['marriage_date'] . ($d['marriage_place'] !== '' ? ' à ' . $d['marriage_place'] : ''))); }
        }
        foreach ($d['children'] as $i => $c) {
            $cid = (int) $c['person_id']; if (!$cid || !$h || !$w) { continue; }
            $s = $pdo->prepare('SELECT 1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? AND ((f.partner1_id=? AND f.partner2_id=?) OR (f.partner1_id=? AND f.partner2_id=?))');
            $s->execute([$cid, $h, $w, $w, $h]);
            if (!$s->fetchColumn()) { $add("child:$i:parents", ($c['written_name'] ?: 'Enfant') . ' : enfant du couple', 'relier aux parents'); }
        }
    }
    return ['items' => $out];
}

/** Le couple (époux, épouse) dans families ; créé si demandé */
function booklet_family(PDO $pdo, int $h, int $w, bool $create): int
{
    if (!$h && !$w) { return 0; }
    $s = $pdo->prepare('SELECT id FROM families WHERE (partner1_id IS ? AND partner2_id IS ?) OR (partner1_id IS ? AND partner2_id IS ?) ORDER BY id LIMIT 1');
    $s->execute([$h ?: null, $w ?: null, $w ?: null, $h ?: null]);
    $id = (int) $s->fetchColumn();
    if (!$id && $create) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$h ?: null, $w ?: null]); $id = (int) $pdo->lastInsertId(); }
    return $id;
}

/** Reporte sur les fiches ce qui a été coché (proposals) : naissances, décès, métiers, mariage, liens parents-enfants */
function apply_booklet(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $keys = array_values(array_filter(array_map('strval', is_array($data['keys'] ?? null) ? $data['keys'] : [])));
    $d = booklet_detail($pdo, $id)['data'];
    $allowed = array_column(booklet_proposals($pdo, $id)['items'], 'key');
    $tag = static function (PDO $pdo, string $t): int { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
    $year = static fn(string $t) => preg_match('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', $t, $m) ? (int) $m[1] : null;
    $note = 'D’après le livret de famille : ' . booklet_title($d);
    $slotOf = static fn(string $k) => str_starts_with($k, 'child:') ? ($d['children'][(int) explode(':', $k)[1]] ?? null) : ($d[$k] ?? null);
    $done = 0;
    foreach ($keys as $key) {
        if (!in_array($key, $allowed, true)) { continue; }
        $parts = explode(':', $key);
        if ($key === 'marriage') {
            $fam = booklet_family($pdo, (int) $d['husband']['person_id'], (int) $d['wife']['person_id'], true);
            $pdo->prepare("INSERT INTO events(scope, family_id, event_type_id, date_text, year, place_id, description) VALUES('family',?,?,?,?,?,?)")
                ->execute([$fam, $tag($pdo, 'MARR'), $d['marriage_date'], $year($d['marriage_date']), function_exists('find_or_create_place') ? find_or_create_place($pdo, $d['marriage_place']) : null, $note]);
            $done++; continue;
        }
        if ($parts[0] === 'child' && ($parts[2] ?? '') === 'parents') {
            $c = $d['children'][(int) $parts[1]] ?? null; if (!$c) { continue; }
            $fam = booklet_family($pdo, (int) $d['husband']['person_id'], (int) $d['wife']['person_id'], true);
            $pdo->prepare('INSERT OR IGNORE INTO family_children(family_id, child_id, position) VALUES(?,?,(SELECT COALESCE(max(position),0)+1 FROM family_children WHERE family_id=?))')->execute([$fam, (int) $c['person_id'], $fam]);
            $done++; continue;
        }
        $what = array_pop($parts); $slot = $slotOf(implode(':', $parts)); if (!$slot || !$slot['person_id']) { continue; }
        $pid = (int) $slot['person_id'];
        if ($what === 'occupation') { $pdo->prepare("UPDATE persons SET occupation=? WHERE id=? AND trim(COALESCE(occupation,''))=''")->execute([$slot['occupation'], $pid]); $done++; continue; }
        [$date, $place, $t] = $what === 'birth' ? [$slot['birth_date'], $slot['birth_place'], 'BIRT'] : [$slot['death_date'], $slot['death_place'], 'DEAT'];
        $pdo->prepare("INSERT INTO events(scope, person_id, event_type_id, date_text, year, place_id, description) VALUES('person',?,?,?,?,?,?)")
            ->execute([$pid, $tag($pdo, $t), $date, $year($date), function_exists('find_or_create_place') ? find_or_create_place($pdo, $place) : null, $note]);
        if ($what === 'death') { $pdo->prepare("UPDATE persons SET living_status='deceased' WHERE id=?")->execute([$pid]); }
        $done++;
    }
    if ($done) { log_change($pdo, 'meta', 0, 'update', "Livret de famille reporté sur les fiches ({$done})"); }
    return ['done' => $done];
}

/** Enregistre seulement l'apparence d'un livret (fenêtre « 🎨 Apparence ») */
function save_booklet_design(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT data_json FROM family_booklets WHERE id=?'); $s->execute([$id]);
    $j = $s->fetchColumn();
    if ($j === false) { throw new RuntimeException('Livret introuvable.'); }
    $d = json_decode((string) $j, true) ?: [];
    $d['design'] = booklet_clean_design(is_array($data['design'] ?? null) ? $data['design'] : []);
    $pdo->prepare('UPDATE family_booklets SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($d, JSON_UNESCAPED_UNICODE), $id]);
    return ['id' => $id, 'design' => $d['design']];
}
