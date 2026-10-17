<?php
declare(strict_types=1);

/**
 * 🧬 ADN (onglet « ADN », masqué au départ ; interface : assets/js/heritage-dna.js).
 * Tests (kits) d'une personne, correspondances (matches) avec leurs cM, segments par chromosome, groupes
 * (méthode de Leeds, branches). Rien n'est envoyé ailleurs : ce sont des notes rangées dans la base.
 * Tables créées à la première utilisation (sans changer le numéro de structure).
 */

const DNA_TEST_TYPES = ['autosomal', 'y', 'mt', 'x', 'other'];
const DNA_SIDES = ['', 'paternal', 'maternal', 'both', 'unknown'];
const DNA_STATUSES = ['', 'todo', 'contacted', 'replied', 'no_reply', 'tree_shared', 'placed', 'ignore'];
const DNA_MATCH_KEYS = ['shared_matches', 'surnames', 'places', 'contact', 'tree_url', 'tree_size', 'company_relationship', 'mrca', 'notes', 'stars', 'x_cm', 'birth_year', 'age_range', 'country'];
const DNA_KIT_KEYS = ['ethnicity', 'y_str', 'mt_mutations', 'notes', 'raw_file', 'chip', 'consent', 'manager', 'gedmatch', 'raw_date'];

function dna_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS dna_kits (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER, label TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
        kit_number TEXT NOT NULL DEFAULT '', test_type TEXT NOT NULL DEFAULT 'autosomal', test_date TEXT NOT NULL DEFAULT '', haplo_y TEXT NOT NULL DEFAULT '', haplo_mt TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS dna_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, kit_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', person_id INTEGER,
        shared_cm REAL NOT NULL DEFAULT 0, segments INTEGER NOT NULL DEFAULT 0, longest_cm REAL NOT NULL DEFAULT 0, relationship TEXT NOT NULL DEFAULT '', side TEXT NOT NULL DEFAULT '',
        group_ids TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_dna_matches_kit ON dna_matches(kit_id, shared_cm)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS dna_segments (id INTEGER PRIMARY KEY AUTOINCREMENT, kit_id INTEGER NOT NULL, match_id INTEGER, label TEXT NOT NULL DEFAULT '',
        chromosome TEXT NOT NULL DEFAULT '1', start_pos REAL NOT NULL DEFAULT 0, end_pos REAL NOT NULL DEFAULT 0, cm REAL NOT NULL DEFAULT 0, snps INTEGER NOT NULL DEFAULT 0,
        side TEXT NOT NULL DEFAULT '', ancestor TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '')");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_dna_segments_kit ON dna_segments(kit_id, chromosome)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS dna_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#4e79a7',
        side TEXT NOT NULL DEFAULT '', ancestor TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0)");
    $done = true;
}

function dna_data(array $raw, array $keys): string
{
    $out = [];
    foreach ($keys as $k) {
        if (!array_key_exists($k, $raw)) { continue; }
        $v = $raw[$k];
        if ($k === 'ethnicity') { // [{region, percent}]
            $out[$k] = array_values(array_filter(array_map(static fn($e) => is_array($e) ? ['region' => mb_substr(safe_text($e['region'] ?? ''), 0, 120), 'percent' => max(0, min(100, (float) ($e['percent'] ?? 0)))] : null, array_slice(is_array($v) ? $v : [], 0, 200)), static fn($e) => $e && $e['region'] !== ''));
            continue;
        }
        if ($k === 'shared_matches') {
            $list = is_array($v) ? $v : preg_split('/\s*[;\n]\s*/', (string) $v);
            $list = array_map(static fn($x) => mb_substr(safe_text((string) $x), 0, 160), $list ?: []);
            $out[$k] = array_slice(array_values(array_filter($list, static fn($x) => $x !== '')), 0, 2000); continue;
        }
        $out[$k] = is_scalar($v) ? mb_substr((string) $v, 0, $k === 'notes' || $k === 'y_str' || $k === 'mt_mutations' ? 20000 : 1000) : '';
    }
    return json_encode($out, JSON_UNESCAPED_UNICODE) ?: '{}';
}

function dna_person_ok(PDO $pdo, $id): ?int
{
    $id = safe_int($id ?? 0); if ($id <= 0) { return null; }
    $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$id]);
    return $s->fetchColumn() ? $id : null;
}

function dna_all(PDO $pdo, array $q = []): array
{
    dna_ensure($pdo);
    $pid = safe_int($q['person_id'] ?? 0);
    $names = "trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,''))";
    $kits = $pdo->query("SELECT k.*, $names AS person_name FROM dna_kits k LEFT JOIN persons p ON p.id=k.person_id ORDER BY k.id")->fetchAll();
    $kits = array_map(static fn($k) => ['id' => (int) $k['id'], 'person_id' => $k['person_id'] !== null ? (int) $k['person_id'] : null, 'person_name' => (string) ($k['person_name'] ?? ''), 'label' => $k['label'], 'company' => $k['company'],
        'kit_number' => $k['kit_number'], 'test_type' => $k['test_type'], 'test_date' => $k['test_date'], 'haplo_y' => $k['haplo_y'], 'haplo_mt' => $k['haplo_mt'], 'data' => json_decode((string) $k['data_json'], true) ?: new stdClass(), 'updated_at' => $k['updated_at']], $kits);
    if ($pid > 0) { // fiche d'une personne : ses tests, et les correspondances rattachées à elle
        $kits = array_values(array_filter($kits, static fn($k) => $k['person_id'] === $pid));
        $s = $pdo->prepare("SELECT m.*, $names AS person_name FROM dna_matches m LEFT JOIN persons p ON p.id=m.person_id WHERE m.person_id=? OR m.kit_id IN (SELECT id FROM dna_kits WHERE person_id=?) ORDER BY m.shared_cm DESC LIMIT 200");
        $s->execute([$pid, $pid]); $matches = $s->fetchAll(); $segments = []; $groups = [];
    } else {
        $matches = $pdo->query("SELECT m.*, $names AS person_name FROM dna_matches m LEFT JOIN persons p ON p.id=m.person_id ORDER BY m.shared_cm DESC")->fetchAll();
        $segments = $pdo->query('SELECT * FROM dna_segments ORDER BY kit_id, chromosome, start_pos')->fetchAll();
        $groups = $pdo->query('SELECT * FROM dna_groups ORDER BY position, id')->fetchAll();
    }
    return ['kits' => $kits,
        'matches' => array_map(static fn($m) => ['id' => (int) $m['id'], 'kit_id' => (int) $m['kit_id'], 'name' => $m['name'], 'person_id' => $m['person_id'] !== null ? (int) $m['person_id'] : null, 'person_name' => (string) ($m['person_name'] ?? ''),
            'shared_cm' => (float) $m['shared_cm'], 'segments' => (int) $m['segments'], 'longest_cm' => (float) $m['longest_cm'], 'relationship' => $m['relationship'], 'side' => $m['side'],
            'groups' => array_values(array_filter(array_map('intval', explode(',', (string) $m['group_ids'])))), 'status' => $m['status'], 'data' => json_decode((string) $m['data_json'], true) ?: new stdClass(), 'updated_at' => $m['updated_at']], $matches),
        'segments' => array_map(static fn($s) => ['id' => (int) $s['id'], 'kit_id' => (int) $s['kit_id'], 'match_id' => $s['match_id'] !== null ? (int) $s['match_id'] : null, 'label' => $s['label'], 'chromosome' => $s['chromosome'],
            'start' => (float) $s['start_pos'], 'end' => (float) $s['end_pos'], 'cm' => (float) $s['cm'], 'snps' => (int) $s['snps'], 'side' => $s['side'], 'ancestor' => $s['ancestor'], 'color' => $s['color']], $segments),
        'groups' => array_map(static fn($g) => ['id' => (int) $g['id'], 'name' => $g['name'], 'color' => $g['color'], 'side' => $g['side'], 'ancestor' => $g['ancestor'], 'notes' => $g['notes']], $groups)];
}

function dna_pick($v, array $list): string { return is_string($v) && in_array($v, $list, true) ? $v : ''; }
function dna_color(string $c): string { return preg_match('/^#[0-9a-f]{6}$/i', $c) ? $c : '#4e79a7'; }
function dna_chromosome(string $c): string { $c = strtoupper(trim(preg_replace('/^chr/i', '', $c))); return preg_match('/^([1-9]|1\d|2[0-2]|X|Y|MT)$/', $c) ? $c : ''; }

function save_dna_kit(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $type = (dna_pick($d['test_type'] ?? '', DNA_TEST_TYPES) ?: 'autosomal');
    $vals = [dna_person_ok($pdo, $d['person_id'] ?? 0), mb_substr(safe_text($d['label'] ?? ''), 0, 160), mb_substr(safe_text($d['company'] ?? ''), 0, 80), mb_substr(safe_text($d['kit_number'] ?? ''), 0, 80), $type,
        mb_substr(safe_text($d['test_date'] ?? ''), 0, 40), mb_substr(safe_text($d['haplo_y'] ?? ''), 0, 80), mb_substr(safe_text($d['haplo_mt'] ?? ''), 0, 80), dna_data(is_array($d['data'] ?? null) ? $d['data'] : [], DNA_KIT_KEYS)];
    if ($vals[0] === null && $vals[1] === '') { throw new RuntimeException('Choisis la personne testée (ou donne un nom au test).'); }
    if ($id > 0) { $s = $pdo->prepare('UPDATE dna_kits SET person_id=?, label=?, company=?, kit_number=?, test_type=?, test_date=?, haplo_y=?, haplo_mt=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([...$vals, $id]); if (!$s->rowCount()) { throw new RuntimeException('Test introuvable.'); } }
    else { $pdo->prepare('INSERT INTO dna_kits(person_id, label, company, kit_number, test_type, test_date, haplo_y, haplo_mt, data_json) VALUES(?,?,?,?,?,?,?,?,?)')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    log_change($pdo, 'meta', 0, 'update', 'ADN : test enregistré');
    return ['id' => $id];
}

function delete_dna_kit(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $id = safe_int($d['id'] ?? 0); if ($id <= 0) { throw new RuntimeException('Test introuvable.'); }
    $pdo->prepare('DELETE FROM dna_segments WHERE kit_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM dna_matches WHERE kit_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM dna_kits WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'ADN : test supprimé');
    return ['id' => $id];
}

function dna_match_vals(PDO $pdo, array $d, array $groupIds): array
{
    $num = static fn($v, $max) => max(0.0, min($max, (float) str_replace(',', '.', (string) ($v ?? 0))));
    return [mb_substr(safe_text($d['name'] ?? ''), 0, 200), dna_person_ok($pdo, $d['person_id'] ?? 0), $num($d['shared_cm'] ?? 0, 8000), (int) $num($d['segments'] ?? 0, 2000), $num($d['longest_cm'] ?? 0, 400),
        mb_substr(safe_text($d['relationship'] ?? ''), 0, 120), dna_pick($d['side'] ?? '', DNA_SIDES),
        implode(',', array_values(array_intersect(array_map('intval', is_array($d['groups'] ?? null) ? $d['groups'] : []), $groupIds))), dna_pick($d['status'] ?? '', DNA_STATUSES),
        dna_data(is_array($d['data'] ?? null) ? $d['data'] : [], DNA_MATCH_KEYS)];
}
function dna_group_ids(PDO $pdo): array { return array_map('intval', $pdo->query('SELECT id FROM dna_groups')->fetchAll(PDO::FETCH_COLUMN)); }
function dna_kit_ok(PDO $pdo, $id): int
{
    $id = safe_int($id ?? 0); $s = $pdo->prepare('SELECT 1 FROM dna_kits WHERE id=?'); $s->execute([$id]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Choisis d’abord le test (kit) auquel rattacher les correspondances.'); }
    return $id;
}

function save_dna_match(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $id = safe_int($d['id'] ?? 0); $kit = dna_kit_ok($pdo, $d['kit_id'] ?? 0);
    $vals = dna_match_vals($pdo, $d, dna_group_ids($pdo));
    if ($vals[0] === '') { throw new RuntimeException('Donne le nom de la correspondance.'); }
    if ($id > 0) { $s = $pdo->prepare('UPDATE dna_matches SET name=?, person_id=?, shared_cm=?, segments=?, longest_cm=?, relationship=?, side=?, group_ids=?, status=?, data_json=?, kit_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([...$vals, $kit, $id]); if (!$s->rowCount()) { throw new RuntimeException('Correspondance introuvable.'); } }
    else { $pdo->prepare('INSERT INTO dna_matches(name, person_id, shared_cm, segments, longest_cm, relationship, side, group_ids, status, data_json, kit_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute([...$vals, $kit]); $id = (int) $pdo->lastInsertId(); }
    return ['id' => $id];
}

/** import d'un fichier de correspondances : les noms déjà présents (même test) sont mis à jour, sans effacer ce qui a été noté à la main */
function import_dna_matches(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $kit = dna_kit_ok($pdo, $d['kit_id'] ?? 0); $rows = array_slice(is_array($d['rows'] ?? null) ? $d['rows'] : [], 0, 30000);
    $groups = dna_group_ids($pdo); $added = 0; $updated = 0;
    $find = $pdo->prepare('SELECT id, data_json, side, status, group_ids, person_id FROM dna_matches WHERE kit_id=? AND name=?');
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        foreach ($rows as $r) {
            if (!is_array($r)) { continue; }
            $name = mb_substr(safe_text($r['name'] ?? ''), 0, 200); if ($name === '') { continue; }
            $find->execute([$kit, $name]); $old = $find->fetch();
            if ($old) {
                $data = array_merge(json_decode((string) $old['data_json'], true) ?: [], array_filter(is_array($r['data'] ?? null) ? $r['data'] : [], static fn($v) => $v !== '' && $v !== null && $v !== []));
                $v = dna_match_vals($pdo, ['name' => $name, 'person_id' => $old['person_id'], 'shared_cm' => $r['shared_cm'] ?? 0, 'segments' => $r['segments'] ?? 0, 'longest_cm' => $r['longest_cm'] ?? 0, 'relationship' => $r['relationship'] ?? '',
                    'side' => ($r['side'] ?? '') ?: $old['side'], 'groups' => array_map('intval', explode(',', (string) $old['group_ids'])), 'status' => $old['status'], 'data' => $data], $groups);
                $pdo->prepare('UPDATE dna_matches SET name=?, person_id=?, shared_cm=?, segments=?, longest_cm=?, relationship=?, side=?, group_ids=?, status=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$v, (int) $old['id']]); $updated++;
            } else {
                $v = dna_match_vals($pdo, ['name' => $name] + $r, $groups);
                $pdo->prepare('INSERT INTO dna_matches(name, person_id, shared_cm, segments, longest_cm, relationship, side, group_ids, status, data_json, kit_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute([...$v, $kit]); $added++;
            }
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    log_change($pdo, 'meta', 0, 'update', "ADN : $added correspondance(s) importée(s), $updated mise(s) à jour");
    return ['added' => $added, 'updated' => $updated];
}

/** plusieurs correspondances d'un coup : groupe, côté, suivi */
function bulk_dna_matches(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $ids = array_values(array_filter(array_map('intval', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 30000)), static fn($i) => $i > 0));
    if (!$ids) { return ['n' => 0]; }
    $in = implode(',', $ids); $n = 0;
    if (!empty($d['delete'])) { $pdo->exec("DELETE FROM dna_segments WHERE match_id IN ($in)"); $n = $pdo->exec("DELETE FROM dna_matches WHERE id IN ($in)"); return ['n' => $n]; }
    if (array_key_exists('side', $d) && in_array($d['side'], DNA_SIDES, true)) { $s = $pdo->prepare("UPDATE dna_matches SET side=? WHERE id IN ($in)"); $s->execute([$d['side']]); $n = $s->rowCount(); }
    if (array_key_exists('status', $d) && in_array($d['status'], DNA_STATUSES, true)) { $s = $pdo->prepare("UPDATE dna_matches SET status=? WHERE id IN ($in)"); $s->execute([$d['status']]); $n = $s->rowCount(); }
    foreach (['add_group' => true, 'remove_group' => false] as $k => $add) {
        $g = safe_int($d[$k] ?? 0); if ($g <= 0 || !in_array($g, dna_group_ids($pdo), true)) { continue; }
        $up = $pdo->prepare('UPDATE dna_matches SET group_ids=? WHERE id=?');
        foreach ($pdo->query("SELECT id, group_ids FROM dna_matches WHERE id IN ($in)")->fetchAll() as $m) {
            $l = array_values(array_filter(array_map('intval', explode(',', (string) $m['group_ids']))));
            $l = $add ? array_values(array_unique([...$l, $g])) : array_values(array_diff($l, [$g]));
            $up->execute([implode(',', $l), (int) $m['id']]); $n++;
        }
    }
    return ['n' => $n];
}

function delete_dna_match(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $id = safe_int($d['id'] ?? 0); if ($id <= 0) { throw new RuntimeException('Correspondance introuvable.'); }
    $pdo->prepare('DELETE FROM dna_segments WHERE match_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM dna_matches WHERE id=?')->execute([$id]);
    return ['id' => $id];
}

function save_dna_segments(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $kit = dna_kit_ok($pdo, $d['kit_id'] ?? 0);
    $matches = array_map('intval', ($m = $pdo->prepare('SELECT id FROM dna_matches WHERE kit_id=?')) && $m->execute([$kit]) ? $m->fetchAll(PDO::FETCH_COLUMN) : []);
    $byName = []; $q = $pdo->prepare('SELECT id, name FROM dna_matches WHERE kit_id=?'); $q->execute([$kit]); foreach ($q->fetchAll() as $r) { $byName[mb_strtolower($r['name'])] = (int) $r['id']; }
    $ins = $pdo->prepare('INSERT INTO dna_segments(kit_id, match_id, label, chromosome, start_pos, end_pos, cm, snps, side, ancestor, color) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    $n = 0; $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        if (!empty($d['replace'])) { $pdo->prepare('DELETE FROM dna_segments WHERE kit_id=?')->execute([$kit]); }
        foreach (array_slice(is_array($d['rows'] ?? null) ? $d['rows'] : [], 0, 100000) as $r) {
            if (!is_array($r)) { continue; }
            $chr = dna_chromosome((string) ($r['chromosome'] ?? '')); $a = (float) ($r['start'] ?? 0); $b = (float) ($r['end'] ?? 0);
            if ($chr === '' || $b <= $a || $a < 0 || $b > 3e9) { continue; }
            $mid = safe_int($r['match_id'] ?? 0); if (!in_array($mid, $matches, true)) { $mid = $byName[mb_strtolower(safe_text($r['label'] ?? ''))] ?? 0; }
            $ins->execute([$kit, $mid ?: null, mb_substr(safe_text($r['label'] ?? ''), 0, 200), $chr, $a, $b, max(0, min(400, (float) ($r['cm'] ?? 0))), max(0, (int) ($r['snps'] ?? 0)),
                dna_pick($r['side'] ?? '', DNA_SIDES), mb_substr(safe_text($r['ancestor'] ?? ''), 0, 200), ($r['color'] ?? '') !== '' ? dna_color((string) $r['color']) : '']);
            $n++;
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    return ['n' => $n];
}

function delete_dna_segments(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $ids = array_values(array_filter(array_map('intval', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 100000)), static fn($i) => $i > 0));
    if (!$ids) { return ['n' => 0]; }
    return ['n' => $pdo->exec('DELETE FROM dna_segments WHERE id IN (' . implode(',', $ids) . ')')];
}

function save_dna_group(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $vals = [mb_substr(safe_text($d['name'] ?? ''), 0, 120) ?: 'Groupe', dna_color((string) ($d['color'] ?? '')), dna_pick($d['side'] ?? '', DNA_SIDES), mb_substr(safe_text($d['ancestor'] ?? ''), 0, 200), mb_substr(safe_text($d['notes'] ?? ''), 0, 4000)];
    if ($id > 0) { $pdo->prepare('UPDATE dna_groups SET name=?, color=?, side=?, ancestor=?, notes=? WHERE id=?')->execute([...$vals, $id]); }
    else { $pdo->prepare('INSERT INTO dna_groups(name, color, side, ancestor, notes, position) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(position),0)+10 FROM dna_groups))')->execute($vals); $id = (int) $pdo->lastInsertId(); }
    return ['id' => $id];
}

function delete_dna_group(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $id = safe_int($d['id'] ?? 0); if ($id <= 0) { throw new RuntimeException('Groupe introuvable.'); }
    $up = $pdo->prepare('UPDATE dna_matches SET group_ids=? WHERE id=?');
    foreach ($pdo->query("SELECT id, group_ids FROM dna_matches WHERE ','||group_ids||',' LIKE '%,$id,%'")->fetchAll() as $m) {
        $up->execute([implode(',', array_values(array_diff(array_map('intval', explode(',', (string) $m['group_ids'])), [$id]))), (int) $m['id']]);
    }
    $pdo->prepare('DELETE FROM dna_groups WHERE id=?')->execute([$id]);
    return ['id' => $id];
}

/** une personne supprimée (to=0) ou fusionnée : ses tests et correspondances suivent */
function dna_links_person(PDO $pdo, int $from, int $to): void
{
    dna_ensure($pdo);
    $pdo->prepare('UPDATE dna_kits SET person_id=? WHERE person_id=?')->execute([$to > 0 ? $to : null, $from]);
    $pdo->prepare('UPDATE dna_matches SET person_id=? WHERE person_id=?')->execute([$to > 0 ? $to : null, $from]);
}

/** lignées directes depuis une personne : père du père… (ADN-Y), mère de la mère… (ADNmt), et ancêtres possibles de l'ADN-X */
function dna_lines(PDO $pdo, int $pid, int $depth = 10): array
{
    $depth = max(1, min(14, $depth));
    // les parents biologiques d'abord (une adoption ne transmet pas l'ADN)
    $parents = $pdo->prepare("SELECT f.partner1_id, f.partner2_id, p1.gender AS g1, p2.gender AS g2 FROM family_children fc JOIN families f ON f.id=fc.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id
        WHERE fc.child_id=? ORDER BY (fc.relation_to_partner1='biological' AND fc.relation_to_partner2='biological') DESC, fc.id LIMIT 1");
    $info = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, p.gender,
        (SELECT COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT), e.date_text) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY t.gedcom_tag='BIRT' DESC LIMIT 1) AS birth,
        (SELECT COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT), e.date_text) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') ORDER BY t.gedcom_tag='DEAT' DESC LIMIT 1) AS death
        FROM persons p WHERE p.id=?");
    $one = static function (int $id) use ($info): ?array { $info->execute([$id]); $r = $info->fetch(); return $r ? ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . $r['last_name']), 'gender' => $r['gender'], 'birth' => (string) ($r['birth'] ?? ''), 'death' => (string) ($r['death'] ?? '')] : null; };
    $par = static function (int $id) use ($parents): array { $parents->execute([$id]); $r = $parents->fetch(); if (!$r) { return [null, null]; }
        $a = $r['partner1_id'] !== null ? (int) $r['partner1_id'] : null; $b = $r['partner2_id'] !== null ? (int) $r['partner2_id'] : null;
        if ($r['g1'] === 'female' || $r['g2'] === 'male') { [$a, $b] = [$b, $a]; } // [père, mère]
        return [$a, $b]; };
    $me = $one($pid); if (!$me) { throw new RuntimeException('Personne introuvable.'); }
    $line = static function (int $start, int $k) use ($par, $one, $depth): array { $out = []; $cur = $start; $seen = [];
        for ($g = 1; $g <= $depth; $g++) { $p = $par($cur)[$k]; if (!$p || isset($seen[$p])) { break; } $seen[$p] = true; $out[] = ['gen' => $g] + ($one($p) ?? ['id' => $p, 'name' => '?']); $cur = $p; }
        return $out; };
    // ADN-X : un homme le tient de sa mère seule, une femme de ses deux parents ; un père ne transmet que son X (reçu de sa mère)
    $x = []; $queue = [[$pid, 0, $me['gender']]]; $seenX = [];
    while ($queue && count($x) < 400) {
        [$id, $g, $gender] = array_shift($queue); if ($g >= min($depth, 8)) { continue; }
        [$f, $m] = $par($id);
        foreach ([[$f, 'male'], [$m, 'female']] as [$p, $pg]) {
            if (!$p || ($gender === 'male' && $pg === 'male') || isset($seenX[$p . ':' . ($g + 1)])) { continue; }
            $seenX[$p . ':' . ($g + 1)] = true; $o = $one($p); if (!$o) { continue; }
            $x[] = ['gen' => $g + 1] + $o; $queue[] = [$p, $g + 1, $o['gender'] ?: $pg];
        }
    }
    return ['person' => $me, 'y' => $line($pid, 0), 'mt' => $line($pid, 1), 'x' => $x];
}
