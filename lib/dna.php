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
const DNA_MATCH_KEYS = ['shared_matches', 'surnames', 'places', 'contact', 'tree_url', 'tree_size', 'company_relationship', 'mrca', 'notes', 'stars', 'x_cm', 'birth_year', 'age_range', 'country',
    'profile_url', 'company', 'company_id', 'haplo_y', 'haplo_mt', 'sex', 'percent', 'follow_up'];
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
    $undo = dna_snapshot($pdo, 'k', [$id]); // ↶ Annuler : tout ce qui part, remis tel quel par dna_plus_post(op restore)
    $pdo->prepare('DELETE FROM dna_segments WHERE kit_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM dna_matches WHERE kit_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM dna_kits WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'ADN : test supprimé');
    return ['id' => $id, 'undo' => $undo];
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
    // jamais un fichier brut de SNP (« rs12345 », génotypes) : vie privée et loi française
    $snp = 0; foreach (array_slice($rows, 0, 200) as $r) { if (is_array($r) && preg_match('/^(rs|i)\d{3,}$/i', trim((string) ($r['name'] ?? '')))) { $snp++; } }
    if ($rows && $snp >= max(3, (int) (min(200, count($rows)) * 0.5))) { throw new LcndaBadInput('Ce fichier ressemble à un fichier ADN brut (des SNP « rs… ») : il n’est jamais importé, par prudence pour la vie privée et la loi française. Importe plutôt la liste des correspondances ou des segments.'); }
    $groups = dna_group_ids($pdo); $added = 0; $updated = 0; $addedIds = []; $oldRows = []; $groupsAdded = [];
    $find = $pdo->prepare('SELECT * FROM dna_matches WHERE kit_id=? AND name=?');
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        // grappes des fichiers de Genetic Affairs (AutoCluster, AutoTree) : un groupe par grappe, créé s'il n'existe pas (même nom)
        $clusterGroup = static function (string $label) use ($pdo, &$groups, &$groupsAdded): int {
            static $palette = ['#4e79a7', '#e15759', '#59a14f', '#f28e2b', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#bab0ac', '#1f77b4', '#d62728'];
            $s = $pdo->prepare('SELECT id FROM dna_groups WHERE name=?'); $s->execute([$label]);
            if ($id = (int) $s->fetchColumn()) { return $id; }
            if (count($groupsAdded) >= 500) { return 0; }
            $n = (int) $pdo->query('SELECT count(*) FROM dna_groups')->fetchColumn();
            $pdo->prepare('INSERT INTO dna_groups(name, color, notes, position) VALUES(?,?,?,?)')->execute([$label, $palette[$n % count($palette)], 'Créé à l’import d’un fichier de grappes (Genetic Affairs).', $n]);
            $id = (int) $pdo->lastInsertId(); $groups[] = $id; $groupsAdded[] = $id;
            return $id;
        };
        foreach ($rows as $r) {
            if (!is_array($r)) { continue; }
            $name = mb_substr(safe_text($r['name'] ?? ''), 0, 200); if ($name === '') { continue; }
            $cluster = mb_substr(safe_text($r['cluster'] ?? ''), 0, 80);
            $gid = $cluster !== '' ? $clusterGroup($cluster) : 0;
            $find->execute([$kit, $name]); $old = $find->fetch();
            if ($old) {
                if (!isset($oldRows[(int) $old['id']])) { $oldRows[(int) $old['id']] = $old; }
                $data = array_merge(json_decode((string) $old['data_json'], true) ?: [], array_filter(is_array($r['data'] ?? null) ? $r['data'] : [], static fn($v) => $v !== '' && $v !== null && $v !== []));
                $v = dna_match_vals($pdo, ['name' => $name, 'person_id' => $old['person_id'], 'shared_cm' => $r['shared_cm'] ?? 0, 'segments' => $r['segments'] ?? 0, 'longest_cm' => $r['longest_cm'] ?? 0, 'relationship' => $r['relationship'] ?? '',
                    'side' => ($r['side'] ?? '') ?: $old['side'], 'groups' => array_values(array_unique(array_filter([...array_map('intval', explode(',', (string) $old['group_ids'])), $gid]))), 'status' => $old['status'], 'data' => $data], $groups);
                $pdo->prepare('UPDATE dna_matches SET name=?, person_id=?, shared_cm=?, segments=?, longest_cm=?, relationship=?, side=?, group_ids=?, status=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$v, (int) $old['id']]); $updated++;
            } else {
                $v = dna_match_vals($pdo, ['name' => $name] + ($gid ? ['groups' => [$gid]] : []) + $r, $groups);
                $pdo->prepare('INSERT INTO dna_matches(name, person_id, shared_cm, segments, longest_cm, relationship, side, group_ids, status, data_json, kit_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute([...$v, $kit]); $added++;
                $addedIds[] = (int) $pdo->lastInsertId();
            }
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    log_change($pdo, 'meta', 0, 'update', "ADN : $added correspondance(s) importée(s), $updated mise(s) à jour");
    $undo = function_exists('import_receipt_put') ? import_receipt_put('dna', ['matches_added' => $addedIds, 'matches_old' => array_values($oldRows), 'groups_added' => $groupsAdded]) : '';
    return ['added' => $added, 'updated' => $updated, 'groups_added' => count($groupsAdded), 'undo' => $undo];
}

/** plusieurs correspondances d'un coup : groupe, côté, suivi */
function bulk_dna_matches(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $ids = array_values(array_filter(array_map('intval', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 30000)), static fn($i) => $i > 0));
    if (!$ids) { return ['n' => 0]; }
    $in = implode(',', $ids); $n = 0;
    if (!empty($d['delete'])) { $undo = dna_snapshot($pdo, 'm', $ids); $pdo->exec("DELETE FROM dna_segments WHERE match_id IN ($in)"); $n = $pdo->exec("DELETE FROM dna_matches WHERE id IN ($in)"); return ['n' => $n, 'undo' => $undo]; }
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
    $undo = dna_snapshot($pdo, 'm', [$id]);
    $pdo->prepare('DELETE FROM dna_segments WHERE match_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM dna_matches WHERE id=?')->execute([$id]);
    return ['id' => $id, 'undo' => $undo];
}

function save_dna_segments(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $kit = dna_kit_ok($pdo, $d['kit_id'] ?? 0);
    $matches = array_map('intval', ($m = $pdo->prepare('SELECT id FROM dna_matches WHERE kit_id=?')) && $m->execute([$kit]) ? $m->fetchAll(PDO::FETCH_COLUMN) : []);
    $byName = []; $q = $pdo->prepare('SELECT id, name FROM dna_matches WHERE kit_id=?'); $q->execute([$kit]); foreach ($q->fetchAll() as $r) { $byName[mb_strtolower($r['name'])] = (int) $r['id']; }
    $ins = $pdo->prepare('INSERT INTO dna_segments(kit_id, match_id, label, chromosome, start_pos, end_pos, cm, snps, side, ancestor, color) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    $n = 0; $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    $receipt = !empty($d['receipt']); $removed = []; $before = (int) $pdo->query('SELECT COALESCE(MAX(id),0) FROM dna_segments')->fetchColumn();
    try {
        if (!empty($d['replace'])) {
            if ($receipt) { $q = $pdo->prepare('SELECT * FROM dna_segments WHERE kit_id=?'); $q->execute([$kit]); $removed = $q->fetchAll(PDO::FETCH_ASSOC); }
            $pdo->prepare('DELETE FROM dna_segments WHERE kit_id=?')->execute([$kit]);
        }
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
    if ($receipt && function_exists('import_receipt_put')) {
        $after = (int) $pdo->query('SELECT COALESCE(MAX(id),0) FROM dna_segments')->fetchColumn();
        return ['n' => $n, 'undo' => import_receipt_put('dna', ['segments_range' => [$before, $after], 'segments_old' => $removed])];
    }
    return ['n' => $n];
}

/** ↶ Annuler un import ADN : retire les correspondances et segments ajoutés, remet les correspondances mises à jour comme avant. */
function undo_dna_import(PDO $pdo, array $d): array
{
    dna_ensure($pdo);
    $token = (string) ($d['token'] ?? '');
    $r = import_receipt_load($token, 'dna');
    $n = 0;
    $ids = array_values(array_filter(array_map('intval', $r['matches_added'] ?? [])));
    if ($ids) { $in = implode(',', $ids); $pdo->exec("DELETE FROM dna_segments WHERE match_id IN ($in)"); $n += (int) $pdo->exec("DELETE FROM dna_matches WHERE id IN ($in)"); }
    $cols = ['name', 'person_id', 'shared_cm', 'segments', 'longest_cm', 'relationship', 'side', 'group_ids', 'status', 'data_json', 'updated_at'];
    $up = $pdo->prepare('UPDATE dna_matches SET ' . implode(', ', array_map(static fn($c) => "$c=?", $cols)) . ' WHERE id=?');
    foreach ($r['matches_old'] ?? [] as $o) { if (is_array($o) && isset($o['id'])) { $up->execute([...array_map(static fn($c) => $o[$c] ?? null, $cols), (int) $o['id']]); $n++; } }
    if (isset($r['segments_range']) && is_array($r['segments_range'])) { $s = $pdo->prepare('DELETE FROM dna_segments WHERE id > ? AND id <= ?'); $s->execute([(int) $r['segments_range'][0], (int) $r['segments_range'][1]]); $n += $s->rowCount(); }
    $segCols = ['id', 'kit_id', 'match_id', 'label', 'chromosome', 'start_pos', 'end_pos', 'cm', 'snps', 'side', 'ancestor', 'color'];
    $ins = $pdo->prepare('INSERT OR IGNORE INTO dna_segments(' . implode(',', $segCols) . ') VALUES(' . implode(',', array_fill(0, count($segCols), '?')) . ')');
    foreach ($r['segments_old'] ?? [] as $o) { if (is_array($o)) { $ins->execute(array_map(static fn($c) => $o[$c] ?? null, $segCols)); $n++; } }
    $gids = array_values(array_filter(array_map('intval', $r['groups_added'] ?? []))); // groupes créés pour les grappes : retirés de toutes les correspondances
    if ($gids) {
        $up2 = $pdo->prepare('UPDATE dna_matches SET group_ids=? WHERE id=?');
        foreach ($pdo->query('SELECT id, group_ids FROM dna_matches')->fetchAll() as $m) {
            $l = array_values(array_filter(array_map('intval', explode(',', (string) $m['group_ids'])))); $keep = array_values(array_diff($l, $gids));
            if (count($keep) !== count($l)) { $up2->execute([implode(',', $keep), (int) $m['id']]); }
        }
        $pdo->exec('DELETE FROM dna_groups WHERE id IN (' . implode(',', $gids) . ')'); $n += count($gids);
    }
    @unlink(import_receipt_dir() . '/' . $token . '.json');
    log_change($pdo, 'meta', 0, 'update', 'ADN : import annulé');
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
    $undo = dna_snapshot($pdo, 'g', [$id]);
    $up = $pdo->prepare('UPDATE dna_matches SET group_ids=? WHERE id=?');
    foreach ($pdo->query("SELECT id, group_ids FROM dna_matches WHERE ','||group_ids||',' LIKE '%,$id,%'")->fetchAll() as $m) {
        $up->execute([implode(',', array_values(array_diff(array_map('intval', explode(',', (string) $m['group_ids'])), [$id]))), (int) $m['id']]);
    }
    $pdo->prepare('DELETE FROM dna_groups WHERE id=?')->execute([$id]);
    return ['id' => $id, 'undo' => $undo];
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

/**
 * 🔗📍 Pour les groupes automatiques et le placement d'un cousin : l'arbre du testeur (ancêtres par numéro Sosa, avec leurs
 * noms de famille et leurs lieux), et pour chaque correspondance reliée à une fiche, l'ancêtre commun calculé dans l'arbre
 * (le plus proche : génération côté testeur, et nombre de générations côté correspondance).
 */
function dna_tree_data(PDO $pdo, int $kitId, int $maxGen = 8): array
{
    dna_ensure($pdo);
    $maxGen = max(2, min(10, $maxGen));
    $s = $pdo->prepare('SELECT person_id FROM dna_kits WHERE id=?'); $s->execute([$kitId]); $root = (int) $s->fetchColumn();
    if (!$root) { return ['root' => 0, 'ancestors' => [], 'linked' => []]; }
    $positions = array_filter(sosa_positions($pdo, $root, 20000)['positions'] ?? [], static fn($k) => $k < (2 << $maxGen), ARRAY_FILTER_USE_KEY);
    ksort($positions);
    $ids = array_values(array_unique($positions)); $people = [];
    if ($ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $q = $pdo->prepare("SELECT id, first_name, last_name, gender FROM persons WHERE id IN ($marks)"); $q->execute($ids);
        foreach ($q->fetchAll() as $p) { $people[(int) $p['id']] = ['first' => (string) $p['first_name'], 'last' => (string) $p['last_name'], 'gender' => (string) $p['gender'], 'by' => null, 'places' => []]; }
        $q = $pdo->prepare("SELECT e.person_id, e.year, t.gedcom_tag, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id IN ($marks)"); $q->execute($ids);
        foreach ($q->fetchAll() as $e) { $p = &$people[(int) $e['person_id']]; if (in_array($e['gedcom_tag'], ['BIRT', 'BAPM', 'CHR'], true) && $e['year'] !== null && $p['by'] === null) { $p['by'] = (int) $e['year']; }
            $pl = trim(explode(',', (string) $e['place'])[0]); if ($pl !== '' && count($p['places']) < 8 && !in_array($pl, $p['places'], true)) { $p['places'][] = $pl; } unset($p); }
    }
    $ancestors = [];
    foreach ($positions as $sosa => $pid) { if (!isset($people[$pid])) { continue; } $p = $people[$pid]; $ancestors[] = ['sosa' => $sosa, 'id' => $pid, 'name' => trim($p['first'] . ' ' . $p['last']), 'last' => $p['last'], 'gender' => $p['gender'], 'by' => $p['by'], 'places' => $p['places']]; }
    // les correspondances reliées à une fiche : leurs ancêtres (en largeur), le premier qui est aussi un ancêtre du testeur
    $sosaOf = []; foreach ($positions as $sosa => $pid) { if (!isset($sosaOf[$pid]) || $sosa < $sosaOf[$pid]) { $sosaOf[$pid] = $sosa; } }
    $linked = [];
    $s = $pdo->prepare('SELECT id, person_id FROM dna_matches WHERE kit_id=? AND person_id IS NOT NULL'); $s->execute([$kitId]);
    foreach ($s->fetchAll() as $m) {
        $start = (int) $m['person_id']; $queue = [[$start, 0]]; $seen = [$start => true]; $found = [];
        while ($queue && count($seen) < 3000) {
            [$pid, $d] = array_shift($queue);
            if (isset($sosaOf[$pid]) && $pid !== $root) { $found[] = ['sosa' => $sosaOf[$pid], 'gen' => (int) floor(log($sosaOf[$pid], 2)), 'up' => $d]; if (count($found) >= 2) { break; } continue; } // un couple : les deux partenaires
            if ($pid === $root && $d > 0) { continue; }
            if ($d >= 12) { continue; }
            foreach (sosa_parent_ids($pdo, $pid) as $par) { if ($par && !isset($seen[$par])) { $seen[$par] = true; $queue[] = [$par, $d + 1]; } }
        }
        if ($found) { $linked[(int) $m['id']] = $found; }
    }
    $s = $pdo->prepare('SELECT p.first_name, p.last_name FROM persons p WHERE p.id=?'); $s->execute([$root]); $r = $s->fetch();
    $by = null; $q = $pdo->prepare("SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','BAPM','CHR') AND e.year IS NOT NULL LIMIT 1"); $q->execute([$root]); $by = $q->fetchColumn();
    return ['root' => $root, 'root_name' => $r ? trim($r['first_name'] . ' ' . $r['last_name']) : '', 'root_by' => $by !== false ? (int) $by : null, 'ancestors' => $ancestors, 'linked' => $linked ?: new stdClass()];
}

/* ═════════ ↶ Annuler une suppression (test, correspondances, groupe) ═════════
 * dna_snapshot : les lignes qui vont partir ('k' un test et tout ce qui s'y rattache, 'm' des correspondances et leurs segments,
 * 'g' un groupe et les correspondances qui y étaient rangées) ; dna_restore les remet avec les mêmes numéros. */
function dna_snapshot(PDO $pdo, string $kind, array $ids): array
{
    dna_ensure($pdo);
    $ids = array_values(array_filter(array_map('intval', $ids))); if (!$ids) { return []; }
    $in = implode(',', $ids); $snap = ['kits' => [], 'matches' => [], 'segments' => [], 'groups' => [], 'group_links' => []];
    if ($kind === 'k') {
        $snap['kits'] = $pdo->query("SELECT * FROM dna_kits WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC);
        $snap['matches'] = $pdo->query("SELECT * FROM dna_matches WHERE kit_id IN ($in)")->fetchAll(PDO::FETCH_ASSOC);
        $snap['segments'] = $pdo->query("SELECT * FROM dna_segments WHERE kit_id IN ($in)")->fetchAll(PDO::FETCH_ASSOC);
    } elseif ($kind === 'm') {
        $snap['matches'] = $pdo->query("SELECT * FROM dna_matches WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC);
        $snap['segments'] = $pdo->query("SELECT * FROM dna_segments WHERE match_id IN ($in)")->fetchAll(PDO::FETCH_ASSOC);
    } elseif ($kind === 'g') {
        $snap['groups'] = $pdo->query("SELECT * FROM dna_groups WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($ids as $g) { foreach ($pdo->query("SELECT id FROM dna_matches WHERE ','||group_ids||',' LIKE '%,$g,%'")->fetchAll(PDO::FETCH_COLUMN) as $mid) { $snap['group_links'][] = ['match_id' => (int) $mid, 'group_id' => $g]; } }
    }
    return $snap;
}

function dna_restore(PDO $pdo, array $snap): array
{
    dna_ensure($pdo);
    $cols = ['dna_kits' => ['id', 'person_id', 'label', 'company', 'kit_number', 'test_type', 'test_date', 'haplo_y', 'haplo_mt', 'data_json', 'created_at', 'updated_at'],
        'dna_matches' => ['id', 'kit_id', 'name', 'person_id', 'shared_cm', 'segments', 'longest_cm', 'relationship', 'side', 'group_ids', 'status', 'data_json', 'created_at', 'updated_at'],
        'dna_segments' => ['id', 'kit_id', 'match_id', 'label', 'chromosome', 'start_pos', 'end_pos', 'cm', 'snps', 'side', 'ancestor', 'color'],
        'dna_groups' => ['id', 'name', 'color', 'side', 'ancestor', 'notes', 'position']];
    $n = 0; $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        foreach (['kits' => 'dna_kits', 'groups' => 'dna_groups', 'matches' => 'dna_matches', 'segments' => 'dna_segments'] as $k => $t) {
            $c = $cols[$t]; $ins = $pdo->prepare("INSERT OR IGNORE INTO $t(" . implode(',', $c) . ') VALUES(' . implode(',', array_fill(0, count($c), '?')) . ')');
            foreach ((array) ($snap[$k] ?? []) as $row) {
                if (!is_array($row) || safe_int($row['id'] ?? 0) <= 0) { continue; }
                if ($t === 'dna_matches' || $t === 'dna_segments') { $kit = safe_int($row['kit_id'] ?? 0); $ok = $pdo->prepare('SELECT 1 FROM dna_kits WHERE id=?'); $ok->execute([$kit]); if (!$ok->fetchColumn()) { continue; } }
                $vals = array_map(static fn($col) => array_key_exists($col, $row) ? (is_scalar($row[$col]) || $row[$col] === null ? $row[$col] : json_encode($row[$col])) : null, $c);
                if ($t === 'dna_kits' || $t === 'dna_matches') { $i = array_search('person_id', $c, true); $vals[$i] = dna_person_ok($pdo, $vals[$i]); }
                $vals = array_map(static fn($v, $col) => $v === null && !in_array($col, ['person_id', 'match_id'], true) ? '' : $v, $vals, $c);
                $ins->execute($vals); $n += $ins->rowCount();
            }
        }
        $up = $pdo->prepare('UPDATE dna_matches SET group_ids=? WHERE id=?');
        foreach ((array) ($snap['group_links'] ?? []) as $l) {
            $mid = safe_int($l['match_id'] ?? 0); $g = safe_int($l['group_id'] ?? 0); if (!$mid || !$g) { continue; }
            $s = $pdo->prepare('SELECT group_ids FROM dna_matches WHERE id=?'); $s->execute([$mid]); $cur = $s->fetchColumn(); if ($cur === false) { continue; }
            $list = array_values(array_unique([...array_filter(array_map('intval', explode(',', (string) $cur))), $g])); $up->execute([implode(',', $list), $mid]);
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['n' => $n];
}

/* ═════════ 🧩 Phasage visuel, 🔔 relances ═════════ */
function dna_plus_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    dna_ensure($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS dna_phasing (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

/** un projet de phasage : 3 (ou 4) frères et sœurs, et pour chacun, chromosome par chromosome, des morceaux [début, fin] donnés à un grand-parent */
function dna_phasing_clean(array $d): array
{
    $sib = array_slice(array_values(array_filter(array_map(static fn($s) => is_array($s) ? ['kit_id' => safe_int($s['kit_id'] ?? 0), 'name' => mb_substr(safe_text($s['name'] ?? ''), 0, 120)] : null, (array) ($d['siblings'] ?? [])))), 0, 6);
    $gp = ['PGF', 'PGM', 'MGF', 'MGM'];
    $segs = [];
    foreach (array_slice((array) ($d['segments'] ?? []), 0, 5000) as $s) {
        if (!is_array($s)) { continue; }
        $c = dna_chromosome((string) ($s['chr'] ?? '')); $who = safe_int($s['sib'] ?? -1); $side = ($s['side'] ?? '') === 'm' ? 'm' : 'p';
        $a = max(0.0, (float) ($s['start'] ?? 0)); $b = max(0.0, (float) ($s['end'] ?? 0)); $g = in_array($s['gp'] ?? '', $gp, true) ? $s['gp'] : '';
        if ($c === '' || $who < 0 || $who >= count($sib) || $b <= $a) { continue; }
        $segs[] = ['chr' => $c, 'sib' => $who, 'side' => $side, 'start' => round($a, 3), 'end' => round($b, 3), 'gp' => $g];
    }
    $cross = [];
    foreach (array_slice((array) ($d['crossovers'] ?? []), 0, 2000) as $x) {
        if (!is_array($x)) { continue; } $c = dna_chromosome((string) ($x['chr'] ?? '')); $who = safe_int($x['sib'] ?? -1); $pos = (float) ($x['pos'] ?? 0);
        if ($c === '' || $who < 0 || $who >= count($sib) || $pos <= 0) { continue; }
        $cross[] = ['chr' => $c, 'sib' => $who, 'pos' => round($pos, 3), 'side' => ($x['side'] ?? '') === 'm' ? 'm' : (($x['side'] ?? '') === 'p' ? 'p' : '')];
    }
    return ['siblings' => $sib, 'segments' => $segs, 'crossovers' => $cross, 'notes' => mb_substr(safe_text($d['notes'] ?? ''), 0, 20000)];
}

function dna_plus_get(PDO $pdo, array $q): array
{
    dna_plus_ensure($pdo);
    $op = (string) ($q['op'] ?? '');
    if ($op === 'phasing') {
        return ['projects' => array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'data' => json_decode((string) $r['data_json'], true) ?: ['siblings' => [], 'segments' => [], 'crossovers' => []], 'updated_at' => $r['updated_at']],
            $pdo->query('SELECT * FROM dna_phasing ORDER BY id')->fetchAll(PDO::FETCH_ASSOC))];
    }
    if ($op === 'follow_ups') { return ['items' => dna_follow_ups($pdo)]; }
    throw new RuntimeException('Demande inconnue.');
}

/** 🔔 les correspondances à relancer : date de relance notée (data_json.follow_up), suivi pas encore « a répondu » ni « placé » */
function dna_follow_ups(PDO $pdo): array
{
    dna_ensure($pdo);
    $out = [];
    foreach ($pdo->query("SELECT id, name, shared_cm, status, data_json FROM dna_matches WHERE data_json LIKE '%follow_up%'")->fetchAll(PDO::FETCH_ASSOC) as $m) {
        $d = json_decode((string) $m['data_json'], true) ?: []; $due = (string) ($d['follow_up'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $due) || in_array($m['status'], ['replied', 'placed', 'ignore', 'tree_shared'], true)) { continue; }
        $out[] = ['id' => (int) $m['id'], 'name' => $m['name'], 'shared_cm' => (float) $m['shared_cm'], 'status' => $m['status'], 'due' => $due, 'late' => $due <= date('Y-m-d')];
    }
    usort($out, static fn($a, $b) => strcmp($a['due'], $b['due']));
    return $out;
}

/** pour « 🗓 Ma semaine » (lib/semaine.php peut l'appeler comme succ_semaine_items) : les relances de la semaine */
function dna_semaine_items(PDO $pdo): array
{
    $out = [];
    foreach (dna_follow_ups($pdo) as $f) {
        $u = function_exists('semaine_urgency') ? semaine_urgency($f['due']) : ($f['late'] ? 'late' : 'later'); if ($u === 'later') { continue; }
        $out[] = ['key' => 'adn:' . $f['id'], 'sort' => 'rappel', 'urgency' => $u, 'title' => (function_exists('i18n_t') ? i18n_t('Relancer {name} (ADN)', ['name' => $f['name']]) : 'Relancer ' . $f['name'] . ' (ADN)'),
            'detail' => $f['due'], 'date' => $f['due'], 'open' => ['kind' => 'adn', 'id' => $f['id']], 'snooze' => 'mark'];
    }
    return $out;
}

function dna_plus_post(PDO $pdo, array $d): array
{
    dna_plus_ensure($pdo);
    $op = (string) ($d['op'] ?? '');
    if ($op === 'restore') { return dna_restore($pdo, is_array($d['undo'] ?? null) ? $d['undo'] : []); }
    if ($op === 'follow_up') { // 🔔 « Relancer dans N jours » (date vide = plus de relance) ; renvoie l'ancienne date pour ↶
        $id = safe_int($d['id'] ?? 0); $s = $pdo->prepare('SELECT data_json, status FROM dna_matches WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
        if (!$r) { throw new RuntimeException('Correspondance introuvable.'); }
        $data = json_decode((string) $r['data_json'], true) ?: []; $old = (string) ($data['follow_up'] ?? '');
        $due = (string) ($d['date'] ?? ''); if ($due === '' && isset($d['days'])) { $due = date('Y-m-d', strtotime('+' . max(1, min(3650, safe_int($d['days']))) . ' days')); }
        if ($due !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $due)) { throw new RuntimeException('Date de relance invalide.'); }
        if ($due === '') { unset($data['follow_up']); } else { $data['follow_up'] = $due; }
        $status = $r['status'];
        if ($due !== '' && in_array($status, ['', 'todo'], true)) { $status = 'contacted'; } // relancer : c'est qu'on l'a contactée
        if (isset($d['status']) && in_array($d['status'], DNA_STATUSES, true)) { $status = $d['status']; }
        $pdo->prepare('UPDATE dna_matches SET data_json=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode($data, JSON_UNESCAPED_UNICODE) ?: '{}', $status, $id]);
        return ['id' => $id, 'date' => $due, 'old' => $old, 'old_status' => $r['status']];
    }
    if ($op === 'set_shared' || $op === 'import_shared' || $op === 'restore_shared') { return dna_shared_post($pdo, $op, $d); }
    if ($op === 'save_phasing') {
        $id = safe_int($d['id'] ?? 0); $name = mb_substr(safe_text($d['name'] ?? ''), 0, 160) ?: 'Phasage';
        $json = json_encode(dna_phasing_clean(is_array($d['data'] ?? null) ? $d['data'] : []), JSON_UNESCAPED_UNICODE) ?: '{}';
        if ($id) { $pdo->prepare('UPDATE dna_phasing SET name=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $json, $id]); }
        else { $pdo->prepare('INSERT INTO dna_phasing(name, data_json) VALUES(?,?)')->execute([$name, $json]); $id = (int) $pdo->lastInsertId(); }
        return ['id' => $id];
    }
    if ($op === 'delete_phasing') {
        $id = safe_int($d['id'] ?? 0); $s = $pdo->prepare('SELECT * FROM dna_phasing WHERE id=?'); $s->execute([$id]); $row = $s->fetch(PDO::FETCH_ASSOC);
        if (!$row) { throw new RuntimeException('Phasage introuvable.'); }
        $pdo->prepare('DELETE FROM dna_phasing WHERE id=?')->execute([$id]);
        return ['row' => $row];
    }
    if ($op === 'restore_phasing') {
        $r = is_array($d['row'] ?? null) ? $d['row'] : []; $id = safe_int($r['id'] ?? 0); if (!$id) { throw new RuntimeException('Phasage introuvable.'); }
        $pdo->prepare('INSERT OR IGNORE INTO dna_phasing(id, name, data_json, created_at, updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)')->execute([$id, safe_text($r['name'] ?? ''), (string) ($r['data_json'] ?? '{}'), safe_text($r['created_at'] ?? '') ?: date('Y-m-d H:i:s')]);
        return ['id' => $id];
    }
    throw new RuntimeException('Demande inconnue.');
}

/* ═════════ 🧪 Correspondances partagées (« shared matches », ICW) ═════════
 * set_shared {a, b, on} : A et B se correspondent (ou plus) — noté chez les deux ; import_shared {kit_id, pairs: [[A, B], …]} (noms) ;
 * restore_shared {before: {id: [noms]}} : ↶ Annuler. Chaque réponse rend « before » (la liste d'avant de chaque correspondance touchée). */
function dna_shared_post(PDO $pdo, string $op, array $d): array
{
    dna_ensure($pdo);
    $get = $pdo->prepare('SELECT id, kit_id, name, data_json FROM dna_matches WHERE id=?');
    $put = $pdo->prepare('UPDATE dna_matches SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
    $before = [];
    $load = static function (int $id) use ($get) { $get->execute([$id]); $r = $get->fetch(PDO::FETCH_ASSOC); if (!$r) { return null; } $r['data'] = json_decode((string) $r['data_json'], true) ?: []; $r['data']['shared_matches'] = array_values(array_filter(array_map('strval', (array) ($r['data']['shared_matches'] ?? [])), static fn($x) => trim($x) !== '')); return $r; };
    $save = static function (array $r, array $list) use ($put, &$before) { if (!array_key_exists((int) $r['id'], $before)) { $before[(int) $r['id']] = $r['data']['shared_matches']; } $r['data']['shared_matches'] = array_slice(array_values(array_unique($list)), 0, 2000); $put->execute([json_encode($r['data'], JSON_UNESCAPED_UNICODE) ?: '{}', (int) $r['id']]); };
    $has = static fn(array $list, string $name) => in_array(mb_strtolower(trim($name)), array_map(static fn($x) => mb_strtolower(trim((string) $x)), $list), true);
    $without = static fn(array $list, string $name) => array_values(array_filter($list, static fn($x) => mb_strtolower(trim((string) $x)) !== mb_strtolower(trim($name))));
    $link = static function (array $a, array $b, bool $on) use ($save, $has, $without, $load) {
        $a = $load((int) $a['id']); $b = $load((int) $b['id']); if (!$a || !$b) { return; }
        if ($on) { if (!$has($a['data']['shared_matches'], $b['name'])) { $save($a, [...$a['data']['shared_matches'], $b['name']]); } $b = $load((int) $b['id']); if (!$has($b['data']['shared_matches'], $a['name'])) { $save($b, [...$b['data']['shared_matches'], $a['name']]); } }
        else { $save($a, $without($a['data']['shared_matches'], $b['name'])); $b = $load((int) $b['id']); $save($b, $without($b['data']['shared_matches'], $a['name'])); }
    };
    if ($op === 'set_shared') {
        $a = $load(safe_int($d['a'] ?? 0)); $b = $load(safe_int($d['b'] ?? 0));
        if (!$a || !$b || $a['id'] === $b['id']) { throw new RuntimeException('Correspondances introuvables.'); }
        $link($a, $b, !empty($d['on']));
        return ['before' => (object) $before];
    }
    if ($op === 'import_shared') {
        $kit = dna_kit_ok($pdo, $d['kit_id'] ?? 0);
        $s = $pdo->prepare('SELECT id, name FROM dna_matches WHERE kit_id=?'); $s->execute([$kit]); $byName = [];
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $byName[mb_strtolower(trim((string) $r['name']))] = ['id' => (int) $r['id'], 'name' => $r['name']]; }
        $n = 0; $unknown = [];
        foreach (array_slice((array) ($d['pairs'] ?? []), 0, 20000) as $pair) {
            if (!is_array($pair) || count($pair) < 2) { continue; }
            $a = $byName[mb_strtolower(trim((string) $pair[0]))] ?? null; $b = $byName[mb_strtolower(trim((string) $pair[1]))] ?? null;
            if (!$a || !$b) { foreach ([$pair[0], $pair[1]] as $x) { if (!isset($byName[mb_strtolower(trim((string) $x))])) { $unknown[trim((string) $x)] = 1; } } continue; }
            if ($a['id'] === $b['id']) { continue; }
            $link($a, $b, true); $n++;
        }
        return ['n' => $n, 'unknown' => array_slice(array_keys($unknown), 0, 50), 'before' => (object) $before];
    }
    // restore_shared
    foreach ((array) ($d['before'] ?? []) as $id => $list) {
        $r = $load(safe_int($id)); if (!$r) { continue; }
        $r['data']['shared_matches'] = array_values(array_map('strval', (array) $list)); $put->execute([json_encode($r['data'], JSON_UNESCAPED_UNICODE) ?: '{}', (int) $r['id']]);
    }
    return ['ok' => true];
}

