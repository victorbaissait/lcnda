<?php
declare(strict_types=1);

/**
 * 📋 Listes en plus (onglet Listes) et actions groupées.
 *  GET  listes_plus&what=
 *       sources | source&id= (📚 lib/sources_gestion.php)
 *       families                 💍 chaque couple : époux, mariage (date, lieu), enfants, séparation, sources
 *       surnames | surname&name= 🔤 chaque nom de famille : porteurs, période, lieux, variantes, groupe ; les personnes d'un nom
 *       notes&q=                 📝 toutes les notes (fiches, événements, couples, sources), cherchées en plein texte
 *  POST listes_plus_write {op, …}
 *       source_create · source_save · source_merge · source_unmerge                       (📚)
 *       label_add · label_remove · lock · lock_restore · mylist_add · mylist_restore
 *       delete_persons · restore_persons · delete_events · restore_events                 (☑ actions groupées, ↶ Annuler)
 *       cell_edit                                                                          (✎ modifier dans la cellule)
 *       visit_delete · visit_restore · visit_item_delete · visit_item_restore               (↶ Annuler au lieu de « Supprimer ? »)
 * Écrans : assets/js/app-sources-liste.js (listes), assets/js/app-selection.js (barre de sélection commune), assets/js/app-listes.js.
 */

require_once __DIR__ . '/sources_gestion.php';

function lp_get(PDO $pdo, array $q): array
{
    return match ((string) ($q['what'] ?? '')) {
        'sources' => srcm_list($pdo),
        'source' => srcm_source($pdo, safe_int($q['id'] ?? 0)),
        'families' => lp_families($pdo),
        'surnames' => lp_surnames($pdo),
        'surname' => lp_surname_people($pdo, (string) ($q['name'] ?? '')),
        'notes' => lp_notes($pdo, (string) ($q['q'] ?? ''), safe_int($q['offset'] ?? 0)),
        default => throw new RuntimeException('Liste inconnue.'),
    };
}

function lp_post(PDO $pdo, array $d): array
{
    return match ((string) ($d['op'] ?? '')) {
        'source_create' => srcm_create($pdo, $d),
        'source_save' => srcm_save($pdo, $d),
        'source_merge' => srcm_merge($pdo, $d),
        'source_unmerge' => srcm_unmerge($pdo, $d),
        'label_add' => lp_label_add($pdo, $d),
        'label_remove' => lp_label_remove($pdo, $d),
        'lock' => lp_lock($pdo, $d),
        'lock_restore' => lp_lock_restore($pdo, $d),
        'mylist_add' => lp_mylist_add($pdo, $d),
        'mylist_restore' => lp_mylist_restore($pdo, $d),
        'delete_persons' => lp_delete_many($pdo, $d, 'person'),
        'delete_events' => lp_delete_many($pdo, $d, 'event'),
        'restore_persons', 'restore_events' => lp_restore_many($pdo, $d),
        'cell_edit' => lp_cell_edit($pdo, $d),
        'visit_delete' => lp_visit_delete($pdo, $d),
        'visit_restore' => lp_visit_restore($pdo, $d),
        'visit_item_delete' => lp_visit_item_delete($pdo, $d),
        'visit_item_restore' => lp_visit_item_restore($pdo, $d),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

function lp_ids(mixed $raw, int $max = 5000): array
{
    $raw = is_array($raw) ? $raw : explode(',', (string) $raw);
    return array_slice(array_values(array_unique(array_filter(array_map('intval', $raw), static fn($x) => $x > 0))), 0, $max);
}

function lp_in(array $ids): string { return implode(',', array_map('intval', $ids ?: [0])); }

/* ───────────── 💍 Familles / couples ───────────── */
function lp_families(PDO $pdo): array
{
    $ev = static fn(string $tags, string $col) => "(SELECT $col FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.family_id=f.id AND t.gedcom_tag IN ($tags) ORDER BY COALESCE(e.year,9999), e.id LIMIT 1)";
    $rows = $pdo->query("SELECT f.id, f.partner1_id, f.partner2_id,
            trim(COALESCE(p1.first_name,'')||' '||COALESCE(p1.last_name,'')) AS partner1, trim(COALESCE(p2.first_name,'')||' '||COALESCE(p2.last_name,'')) AS partner2,
            " . $ev("'MARR'", 'e.date_text') . " AS marriage_date, " . $ev("'MARR'", 'e.year') . " AS marriage_year, " . $ev("'MARR'", 'pl.name') . " AS marriage_place,
            " . $ev("'DIV','DIVF','ANUL'", "COALESCE(NULLIF(e.date_text,''),t.label)") . " AS separation,
            (SELECT count(*) FROM family_children fc WHERE fc.family_id=f.id) AS children,
            (SELECT count(*) FROM source_links sl WHERE (sl.entity_type='family' AND sl.entity_id=f.id) OR (sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE family_id=f.id))) AS sources
        FROM families f LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id
        WHERE f.partner1_id IS NOT NULL OR f.partner2_id IS NOT NULL
        ORDER BY COALESCE(p1.last_name,p2.last_name) COLLATE NOCASE, COALESCE(p1.first_name,p2.first_name) COLLATE NOCASE, f.id LIMIT 20000")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) { foreach (['id', 'partner1_id', 'partner2_id', 'children', 'sources', 'marriage_year'] as $k) { $r[$k] = $r[$k] === null ? null : (int) $r[$k]; } }
    unset($r);
    return ['rows' => $rows];
}

/* ───────────── 🔤 Noms de famille ───────────── */
function lp_fold_name(string $s): string { return function_exists('srcm_fold') ? srcm_fold($s) : mb_strtolower(trim($s)); }

function lp_surnames(PDO $pdo): array
{
    $sql = "SELECT p.id, trim(p.last_name) AS last_name, sg.name AS grp,
        (SELECT min(e.year) FROM events e WHERE e.person_id=p.id AND e.year IS NOT NULL) AS y1,
        (SELECT max(e.year) FROM events e WHERE e.person_id=p.id AND e.year IS NOT NULL) AS y2,
        (SELECT pl.name FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','BAPM','CHR') ORDER BY e.year LIMIT 1) AS place
        FROM persons p LEFT JOIN surname_groups sg ON sg.id=p.surname_group_id WHERE trim(COALESCE(p.last_name,''))<>''" . (srcm_has_col($pdo, 'persons', 'kind') ? " AND COALESCE(p.kind,'human')<>'animal'" : '');
    $by = [];
    foreach ($pdo->query($sql) as $r) {
        $k = lp_fold_name((string) $r['last_name']); if ($k === '') { continue; }
        $g = &$by[$k];
        if (!$g) { $g = ['key' => $k, 'names' => [], 'count' => 0, 'from' => null, 'to' => null, 'places' => [], 'groups' => [], 'ids' => []]; }
        $g['count']++; $g['names'][$r['last_name']] = ($g['names'][$r['last_name']] ?? 0) + 1; $g['ids'][] = (int) $r['id'];
        if ($r['y1'] !== null) { $g['from'] = $g['from'] === null ? (int) $r['y1'] : min($g['from'], (int) $r['y1']); }
        if ($r['y2'] !== null) { $g['to'] = $g['to'] === null ? (int) $r['y2'] : max($g['to'], (int) $r['y2']); }
        if ($r['place']) { $g['places'][$r['place']] = ($g['places'][$r['place']] ?? 0) + 1; }
        if ($r['grp']) { $g['groups'][$r['grp']] = true; }
        unset($g);
    }
    $variants = [];
    if (srcm_table_exists($pdo, 'name_variants')) {
        foreach ($pdo->query("SELECT p.last_name AS main, v.last_name AS v FROM name_variants v JOIN persons p ON p.id=v.person_id WHERE trim(COALESCE(v.last_name,''))<>''") as $v) {
            $k = lp_fold_name((string) $v['main']); if ($k !== '' && lp_fold_name((string) $v['v']) !== $k) { $variants[$k][trim((string) $v['v'])] = true; }
        }
    }
    $rows = [];
    foreach ($by as $k => $g) {
        arsort($g['names']); arsort($g['places']);
        $names = array_keys($g['names']);
        $rows[] = ['key' => $k, 'name' => (string) $names[0], 'spellings' => array_slice($names, 1), 'count' => $g['count'], 'from' => $g['from'], 'to' => $g['to'],
            'places' => array_slice(array_keys($g['places']), 0, 3), 'group' => implode(', ', array_keys($g['groups'])), 'variants' => array_keys($variants[$k] ?? [])];
    }
    usort($rows, static fn($a, $b) => strcoll($a['key'], $b['key']));
    return ['rows' => $rows];
}

/** les personnes d'un nom (toutes les graphies qui se ressemblent) */
function lp_surname_people(PDO $pdo, string $name): array
{
    $k = lp_fold_name($name);
    if ($k === '') { return ['rows' => []]; }
    $out = [];
    $birth = static fn(string $tags) => "(SELECT COALESCE(NULLIF(e.date_text,''),e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ($tags) ORDER BY e.year LIMIT 1)";
    foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, p.living_status, p.is_locked, " . $birth("'BIRT','BAPM','CHR'") . " AS birth_date, " . $birth("'DEAT','BURI'") . " AS death_date FROM persons p WHERE trim(COALESCE(p.last_name,''))<>'' ORDER BY p.first_name COLLATE NOCASE") as $r) {
        if (lp_fold_name((string) $r['last_name']) === $k) { $r['id'] = (int) $r['id']; $out[] = $r; }
    }
    return ['rows' => $out];
}

/* ───────────── 📝 Notes ───────────── */
function lp_notes(PDO $pdo, string $q, int $offset = 0): array
{
    $q = trim($q);
    $where = ''; $p = [];
    if ($q !== '') {
        foreach (preg_split('/\s+/u', $q) ?: [] as $w) { if ($w === '') { continue; } $where .= ($where ? ' AND ' : ' WHERE ') . "(n.title LIKE ? OR n.body LIKE ?)"; $p[] = "%$w%"; $p[] = "%$w%"; }
    }
    $total = $pdo->prepare("SELECT count(*) FROM notes n$where"); $total->execute($p);
    $s = $pdo->prepare("SELECT n.id, n.title, n.body, n.entity_type, n.entity_id, n.updated_at, n.created_at FROM notes n$where ORDER BY COALESCE(n.updated_at,n.created_at) DESC, n.id DESC LIMIT 200 OFFSET " . max(0, $offset));
    $s->execute($p);
    $rows = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $body = (string) $r['body'];
        $at = 0;
        if ($q !== '') { $first = preg_split('/\s+/u', $q)[0]; $pos = mb_stripos($body, $first); if ($pos !== false) { $at = max(0, $pos - 80); } }
        $excerpt = ($at > 0 ? '…' : '') . mb_substr($body, $at, 300) . (mb_strlen($body) > $at + 300 ? '…' : '');
        $target = in_array($r['entity_type'], ['person', 'event', 'family', 'media'], true) ? srcm_link_target($pdo, (string) $r['entity_type'], (int) $r['entity_id']) : ($r['entity_type'] === 'source' ? ['kind' => 'Source', 'label' => (string) ($pdo->query('SELECT title FROM sources WHERE id=' . (int) $r['entity_id'])->fetchColumn() ?: '#' . $r['entity_id']), 'person_id' => 0, 'source_id' => (int) $r['entity_id']] : ['kind' => (string) $r['entity_type'], 'label' => '#' . $r['entity_id'], 'person_id' => 0]);
        $rows[] = ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'excerpt' => $excerpt, 'length' => mb_strlen($body), 'body' => mb_strlen($body) <= 20000 ? $body : null, 'entity_type' => (string) $r['entity_type'], 'entity_id' => (int) $r['entity_id'], 'updated_at' => (string) ($r['updated_at'] ?: $r['created_at'])] + $target;
    }
    return ['rows' => $rows, 'total' => (int) $total->fetchColumn(), 'offset' => $offset];
}

/* ───────────── ☑ actions groupées ───────────── */
const LP_LABEL_TYPES = ['person', 'event', 'source', 'note', 'family', 'media'];

function lp_label_add(PDO $pdo, array $d): array
{
    $type = (string) ($d['entity_type'] ?? 'person');
    if (!in_array($type, LP_LABEL_TYPES, true)) { throw new RuntimeException('Sorte inconnue.'); }
    $ids = lp_ids($d['ids'] ?? []);
    if (!$ids) { throw new RuntimeException('Rien de coché.'); }
    $labelId = safe_int($d['label_id'] ?? 0); $created = false;
    if (!$labelId) {
        $name = mb_substr(safe_text($d['label_name'] ?? ''), 0, 100);
        if ($name === '') { throw new RuntimeException('Choisis une étiquette ou écris son nom.'); }
        $s = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE'); $s->execute([$name]); $labelId = (int) $s->fetchColumn();
        if (!$labelId) { $pdo->prepare('INSERT INTO labels(name) VALUES(?)')->execute([$name]); $labelId = (int) $pdo->lastInsertId(); $created = true; }
    } else {
        $s = $pdo->prepare('SELECT 1 FROM labels WHERE id=?'); $s->execute([$labelId]); if (!$s->fetchColumn()) { throw new RuntimeException('Étiquette introuvable.'); }
    }
    $skipped = 0; $added = [];
    $ins = $pdo->prepare('INSERT OR IGNORE INTO label_links(label_id, entity_type, entity_id) VALUES(?,?,?)');
    foreach ($ids as $id) {
        if ($type === 'person' && function_exists('person_is_locked') && person_is_locked($pdo, $id)) { $skipped++; continue; }
        $ins->execute([$labelId, $type, $id]); if ($ins->rowCount()) { $added[] = $id; }
    }
    log_change($pdo, 'label', $labelId, 'bulk-link', 'Étiquette posée sur ' . count($added) . ' élément(s)', null, ['entity_type' => $type, 'ids' => $added]);
    return ['label_id' => $labelId, 'created' => $created, 'added' => $added, 'skipped' => $skipped];
}

function lp_label_remove(PDO $pdo, array $d): array
{
    $type = (string) ($d['entity_type'] ?? 'person');
    if (!in_array($type, LP_LABEL_TYPES, true)) { throw new RuntimeException('Sorte inconnue.'); }
    $labelId = safe_int($d['label_id'] ?? 0); $ids = lp_ids($d['ids'] ?? []);
    $pdo->prepare('DELETE FROM label_links WHERE label_id=? AND entity_type=? AND entity_id IN (' . lp_in($ids) . ')')->execute([$labelId, $type]);
    if (!empty($d['drop_label'])) { $n = $pdo->prepare('SELECT count(*) FROM label_links WHERE label_id=?'); $n->execute([$labelId]); if (!(int) $n->fetchColumn()) { $pdo->prepare('DELETE FROM labels WHERE id=?')->execute([$labelId]); } }
    return ['removed' => count($ids)];
}

function lp_lock(PDO $pdo, array $d): array
{
    $ids = lp_ids($d['ids'] ?? []); $locked = !empty($d['locked']) ? 1 : 0;
    if (!$ids) { throw new RuntimeException('Rien de coché.'); }
    $before = [];
    foreach ($pdo->query('SELECT id, is_locked FROM persons WHERE id IN (' . lp_in($ids) . ')') as $r) { $before[(string) $r['id']] = (int) $r['is_locked']; }
    $pdo->exec('UPDATE persons SET is_locked=' . $locked . ', updated_at=CURRENT_TIMESTAMP WHERE id IN (' . lp_in(array_keys($before)) . ')');
    log_change($pdo, 'person', null, $locked ? 'bulk-lock' : 'bulk-unlock', ($locked ? 'Verrouillage' : 'Déverrouillage') . ' de ' . count($before) . ' fiche(s) cochée(s)', ['locked' => $before], null);
    return ['before' => $before, 'count' => count($before)];
}

function lp_lock_restore(PDO $pdo, array $d): array
{
    $n = 0;
    foreach (is_array($d['before'] ?? null) ? $d['before'] : [] as $id => $v) { $pdo->prepare('UPDATE persons SET is_locked=? WHERE id=?')->execute([(int) $v ? 1 : 0, (int) $id]); $n++; }
    return ['count' => $n];
}

function lp_mylist_add(PDO $pdo, array $d): array
{
    $list = safe_int($d['list_id'] ?? 0); $ids = lp_ids($d['ids'] ?? []);
    $s = $pdo->prepare('SELECT source FROM custom_lists WHERE id=?'); $s->execute([$list]); $src = $s->fetchColumn();
    if ($src === false) { throw new RuntimeException('Liste introuvable.'); }
    if ($src !== 'persons') { throw new RuntimeException('Cette liste ne contient pas des personnes.'); }
    $before = [];
    $get = $pdo->prepare('SELECT included, data_json FROM custom_list_rows WHERE list_id=? AND row_key=?');
    $put = $pdo->prepare('INSERT OR REPLACE INTO custom_list_rows(list_id, row_key, included, data_json) VALUES(?,?,1,?)');
    foreach ($ids as $id) {
        $k = 'p:' . $id; $get->execute([$list, $k]); $r = $get->fetch(PDO::FETCH_ASSOC);
        $before[$k] = $r ? (int) $r['included'] : null;
        $put->execute([$list, $k, $r ? (string) $r['data_json'] : '{}']);
    }
    return ['before' => $before, 'count' => count($ids)];
}

function lp_mylist_restore(PDO $pdo, array $d): array
{
    $list = safe_int($d['list_id'] ?? 0);
    foreach (is_array($d['before'] ?? null) ? $d['before'] : [] as $k => $was) {
        if (!preg_match('/^p:\d+$/', (string) $k)) { continue; }
        if ($was === null) { $pdo->prepare('DELETE FROM custom_list_rows WHERE list_id=? AND row_key=?')->execute([$list, $k]); }
        else { $pdo->prepare('UPDATE custom_list_rows SET included=? WHERE list_id=? AND row_key=?')->execute([(int) $was, $list, $k]); }
    }
    return ['ok' => true];
}

/** 🗑 plusieurs fiches ou événements d'un coup ; chaque suppression garde son instantané dans le journal (↶ Annuler) */
function lp_delete_many(PDO $pdo, array $d, string $type): array
{
    $ids = lp_ids($d['ids'] ?? [], 2000);
    if (!$ids) { throw new RuntimeException('Rien de coché.'); }
    $done = []; $skipped = [];
    foreach ($ids as $id) {
        try {
            $pdo->exec('SAVEPOINT lp_del');
            if ($type === 'person') { delete_person($pdo, ['id' => $id]); } else { delete_event($pdo, ['id' => $id]); }
            $c = $pdo->prepare("SELECT max(id) FROM change_log WHERE entity_type=? AND entity_id=? AND action='delete'"); $c->execute([$type, $id]);
            $done[] = ['id' => $id, 'change_id' => (int) $c->fetchColumn()];
            $pdo->exec('RELEASE lp_del');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK TO lp_del'); $pdo->exec('RELEASE lp_del');
            $skipped[] = ['id' => $id, 'why' => $e->getMessage()];
        }
    }
    return ['deleted' => $done, 'skipped' => $skipped];
}

function lp_restore_many(PDO $pdo, array $d): array
{
    $n = 0;
    foreach (array_reverse(lp_ids($d['change_ids'] ?? [], 2000)) as $cid) {
        $s = $pdo->prepare("SELECT * FROM change_log WHERE id=? AND action='delete'"); $s->execute([$cid]); $ch = $s->fetch(PDO::FETCH_ASSOC);
        if (!$ch) { continue; }
        $before = json_decode((string) ($ch['before_json'] ?? ''), true) ?: [];
        $type = (string) $ch['entity_type'];
        $table = $type === 'person' ? 'persons' : 'events';
        $ex = $pdo->prepare("SELECT 1 FROM $table WHERE id=?"); $ex->execute([(int) $ch['entity_id']]);
        if ($ex->fetchColumn()) { continue; } // déjà revenu
        if ($type === 'person') { restore_deleted_person($pdo, $ch, $before); $n++; }
        elseif ($type === 'event') { restore_deleted_event($pdo, $ch, $before); $n++; }
    }
    return ['restored' => $n];
}

/** ✎ modifier dans la cellule : la date ou le lieu d'un événement, le métier d'une fiche */
function lp_cell_edit(PDO $pdo, array $d): array
{
    $entity = (string) ($d['entity'] ?? ''); $id = safe_int($d['id'] ?? 0); $field = (string) ($d['field'] ?? '');
    $value = mb_substr(trim(safe_text($d['value'] ?? '')), 0, 500);
    if ($entity === 'event') {
        $s = $pdo->prepare('SELECT e.*, pl.name AS place_name FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id=?'); $s->execute([$id]); $before = $s->fetch(PDO::FETCH_ASSOC);
        if (!$before) { throw new RuntimeException('Événement introuvable.'); }
        if (function_exists('assert_event_unlocked')) { assert_event_unlocked($pdo, $id); }
        if ($field === 'date_text') {
            $cal = (string) ($before['date_calendar'] ?? 'gregorian') ?: 'gregorian';
            [$year, $conv] = function_exists('event_year_and_converted') ? event_year_and_converted($value, '', $cal) : [preg_match('/\b(\d{4})\b/', $value, $m) ? (int) $m[1] : null, ''];
            $sets = 'date_text=?, year=?' . (srcm_has_col($pdo, 'events', 'date_converted') ? ', date_converted=?' : '');
            $pdo->prepare("UPDATE events SET $sets, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute(srcm_has_col($pdo, 'events', 'date_converted') ? [$value, $year, $conv, $id] : [$value, $year, $id]);
            $old = (string) $before['date_text'];
        } elseif ($field === 'place') {
            $pid = $value === '' ? null : (function_exists('find_or_create_place') ? find_or_create_place($pdo, $value) : null);
            $pdo->prepare('UPDATE events SET place_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$pid, $id]);
            $old = (string) ($before['place_name'] ?? '');
        } else { throw new RuntimeException('Cette case ne se modifie pas ici.'); }
        unset($before['place_name']);
        $s2 = $pdo->prepare('SELECT * FROM events WHERE id=?'); $s2->execute([$id]);
        log_change($pdo, 'event', $id, 'update', 'Modification de l’événement #' . $id . ' (dans la liste)', $before, $s2->fetch(PDO::FETCH_ASSOC) ?: null);
        if ($before['person_id'] && function_exists('rebuild_search')) { rebuild_search($pdo, (int) $before['person_id']); }
        return ['old' => $old, 'value' => $value];
    }
    if ($entity === 'person' && $field === 'occupation') {
        if (function_exists('person_is_locked') && person_is_locked($pdo, $id)) { throw new RuntimeException('Cette fiche est verrouillée.'); }
        $s = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $s->execute([$id]); $before = $s->fetch(PDO::FETCH_ASSOC);
        if (!$before) { throw new RuntimeException('Fiche introuvable.'); }
        $pdo->prepare('UPDATE persons SET occupation=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$value, $id]);
        log_change($pdo, 'person', $id, 'update', 'Métier modifié dans la liste', ['occupation' => $before['occupation'] ?? ''], ['occupation' => $value]);
        return ['old' => (string) ($before['occupation'] ?? ''), 'value' => $value];
    }
    throw new RuntimeException('Cette case ne se modifie pas ici.');
}

/* ───────────── 🗄 visites d'archives : supprimer tout de suite, ↶ Annuler ───────────── */
function lp_visit_delete(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $one = static function (string $sql, array $p) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchAll(PDO::FETCH_ASSOC); };
    $plan = $one('SELECT * FROM archive_visit_plans WHERE id=?', [$id]);
    if (!$plan) { throw new RuntimeException('Feuille de mission introuvable.'); }
    $snap = ['plan' => $plan[0], 'items' => $one('SELECT * FROM archive_visit_items WHERE visit_id=?', [$id]),
        'investigations' => $one('SELECT * FROM archive_visit_investigations WHERE visit_id=?', [$id]), 'battues' => $one('SELECT * FROM archive_visit_battues WHERE visit_id=?', [$id]),
        'labels' => $one("SELECT * FROM label_links WHERE entity_type='archive_visit' AND entity_id=?", [$id])];
    delete_archive_visit_plan($pdo, ['id' => $id]);
    log_change($pdo, 'archive_visit_plan', $id, 'snapshot', 'Feuille de mission supprimée (de quoi la remettre)', $snap, null);
    return ['id' => $id, 'change_id' => (int) $pdo->query("SELECT max(id) FROM change_log WHERE entity_type='archive_visit_plan' AND action='snapshot'")->fetchColumn()];
}

function lp_visit_restore(PDO $pdo, array $d): array
{
    $s = $pdo->prepare("SELECT before_json FROM change_log WHERE id=? AND entity_type='archive_visit_plan' AND action='snapshot'"); $s->execute([safe_int($d['change_id'] ?? 0)]);
    $snap = json_decode((string) $s->fetchColumn(), true);
    if (!$snap || empty($snap['plan']['id'])) { throw new RuntimeException('Rien à remettre.'); }
    $ex = $pdo->prepare('SELECT 1 FROM archive_visit_plans WHERE id=?'); $ex->execute([(int) $snap['plan']['id']]);
    if ($ex->fetchColumn()) { return ['already' => true]; }
    insert_snapshot_row($pdo, 'archive_visit_plans', $snap['plan']);
    foreach (['items' => 'archive_visit_items', 'investigations' => 'archive_visit_investigations', 'battues' => 'archive_visit_battues', 'labels' => 'label_links'] as $k => $t) {
        foreach ($snap[$k] ?? [] as $row) { if (is_array($row) && $row) { insert_snapshot_row($pdo, $t, $row, true); } }
    }
    log_change($pdo, 'archive_visit_plan', (int) $snap['plan']['id'], 'restore', 'Suppression annulée : ' . ($snap['plan']['title'] ?? ''), null, null);
    return ['id' => (int) $snap['plan']['id']];
}

function lp_visit_item_delete(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM archive_visit_items WHERE id=?'); $s->execute([$id]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Cote de visite introuvable.'); }
    delete_archive_visit_item($pdo, ['id' => $id]);
    log_change($pdo, 'archive_visit_item', $id, 'snapshot', 'Cote retirée de la visite', $row, null);
    return ['id' => $id, 'change_id' => (int) $pdo->query("SELECT max(id) FROM change_log WHERE entity_type='archive_visit_item' AND action='snapshot'")->fetchColumn()];
}

function lp_visit_item_restore(PDO $pdo, array $d): array
{
    $s = $pdo->prepare("SELECT before_json FROM change_log WHERE id=? AND entity_type='archive_visit_item' AND action='snapshot'"); $s->execute([safe_int($d['change_id'] ?? 0)]);
    $row = json_decode((string) $s->fetchColumn(), true);
    if (!$row || empty($row['id'])) { throw new RuntimeException('Rien à remettre.'); }
    $ex = $pdo->prepare('SELECT 1 FROM archive_visit_plans WHERE id=?'); $ex->execute([(int) $row['visit_id']]);
    if (!$ex->fetchColumn()) { throw new RuntimeException('La feuille de mission n’existe plus.'); }
    insert_snapshot_row($pdo, 'archive_visit_items', $row, true);
    return ['id' => (int) $row['id']];
}
