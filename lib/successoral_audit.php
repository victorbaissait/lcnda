<?php
declare(strict_types=1);

/**
 * ⚖️ Successions — ce que l'audit des onglets a ajouté (docs/design/audit-onglets.html, §6). Interface :
 * assets/js/heritage-successoral-audit.js. Routes (par lib/successoral.php, ops « au_… ») :
 *   GET  successoral&op=au_assign                 → {items: [{case_id, task, who}], names: [...]}   (👥 chargé du dossier et des échéances)
 *   GET  successoral&op=au_conflicts&id=N         → {items: [{person_id, name, case_id, number, title, state}]}  (🛡 héritier déjà dans un autre dossier ouvert)
 *   GET  successoral&op=au_piece_media&event_id=N → {items: [{id, title, filename}]}                  (🔎 lire une pièce scannée)
 *   POST successoral_write {op: au_assign, case_id, task ('' = le dossier, 'd:12' = une échéance), who} → {before}
 * Table créée à la demande : succ_assignments (rien en mode consultation : successoral_api_get / _post le refusent déjà).
 */

function succ_audit_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_assignments (case_id INTEGER NOT NULL, task TEXT NOT NULL DEFAULT '', who TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(case_id, task))");
    $done = true;
}

function succ_audit_get(PDO $pdo, string $op, array $g): array
{
    succ_audit_ensure($pdo);
    switch ($op) {
        case 'au_assign': {
            $items = array_map(static fn($r) => ['case_id' => (int) $r['case_id'], 'task' => (string) $r['task'], 'who' => (string) $r['who']],
                $pdo->query("SELECT a.case_id, a.task, a.who FROM succ_assignments a JOIN succ_cases c ON c.id=a.case_id WHERE c.deleted_at IS NULL AND a.who<>'' ORDER BY a.case_id, a.task")->fetchAll(PDO::FETCH_ASSOC));
            $names = array_values(array_unique(array_map(static fn($x) => $x['who'], $items)));
            sort($names, SORT_NATURAL | SORT_FLAG_CASE);
            return ['items' => $items, 'names' => $names];
        }
        case 'au_conflicts': return ['items' => succ_audit_conflicts($pdo, safe_int($g['id'] ?? 0))];
        case 'au_piece_media': {
            $ev = safe_int($g['event_id'] ?? 0); $mid = safe_int($g['media_id'] ?? 0);
            $rows = [];
            if ($mid) { $s = $pdo->prepare("SELECT id, title, filename, media_type FROM media WHERE id=?"); $s->execute([$mid]); $rows = $s->fetchAll(PDO::FETCH_ASSOC); }
            elseif ($ev) {
                $s = $pdo->prepare("SELECT m.id, m.title, m.filename, m.media_type FROM media m WHERE m.id IN (SELECT media_id FROM media_links WHERE entity_type='event' AND entity_id=?)
                    OR m.id=(SELECT confidence_media_id FROM events WHERE id=?) ORDER BY m.id LIMIT 12");
                $s->execute([$ev, $ev]); $rows = $s->fetchAll(PDO::FETCH_ASSOC);
            }
            return ['items' => array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'filename' => (string) $r['filename'], 'media_type' => (string) $r['media_type']], $rows)];
        }
    }
    throw new LcndaBadInput('Demande inconnue.');
}

function succ_audit_post(PDO $pdo, string $op, array $d): array
{
    succ_audit_ensure($pdo);
    if ($op !== 'au_assign') { throw new LcndaBadInput('Demande inconnue.'); }
    $case = safe_int($d['case_id'] ?? 0); succ_row($pdo, $case);
    $task = (string) ($d['task'] ?? '');
    if ($task !== '' && !preg_match('/^d:\d{1,10}$/', $task)) { throw new LcndaBadInput('Tâche inconnue.'); }
    $who = succ_txt($d['who'] ?? '', 80);
    $b = $pdo->prepare('SELECT who FROM succ_assignments WHERE case_id=? AND task=?'); $b->execute([$case, $task]);
    $before = (string) ($b->fetchColumn() ?: '');
    if ($who === '') { $pdo->prepare('DELETE FROM succ_assignments WHERE case_id=? AND task=?')->execute([$case, $task]); }
    else { $pdo->prepare('INSERT INTO succ_assignments(case_id, task, who) VALUES(?,?,?) ON CONFLICT(case_id, task) DO UPDATE SET who=excluded.who, updated_at=CURRENT_TIMESTAMP')->execute([$case, $task, $who]); }
    if ($before !== $who) {
        succ_journal($pdo, $case, 'other', $task === '' ? ($who !== '' ? 'Dossier confié à ' . $who : 'Plus personne n’est chargé du dossier') : ($who !== '' ? 'Échéance confiée à ' . $who : 'Échéance sans chargé'));
    }
    return ['before' => $before, 'who' => $who];
}

/** 🛡 les personnes de ce dossier (rattachées, ou héritières au dernier calcul) qui figurent aussi dans un AUTRE dossier encore ouvert */
function succ_audit_conflicts(PDO $pdo, int $id): array
{
    $c = succ_row($pdo, $id);
    $peopleOf = static function (array $row) use ($pdo): array {
        $ids = [];
        try { $s = $pdo->prepare("SELECT person_id FROM succ_case_persons WHERE case_id=? AND deleted_at IS NULL"); $s->execute([(int) $row['id']]); $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); } catch (Throwable $e) {}
        $snap = json_decode((string) ($row['snapshot_json'] ?? ''), true);
        foreach (is_array($snap['shares'] ?? null) ? array_keys($snap['shares']) : [] as $k) { if (preg_match('/^\d{1,10}$/', (string) $k)) { $ids[] = (int) $k; } }
        return array_values(array_diff(array_unique($ids), [(int) $row['deceased_id']]));
    };
    $mine = $peopleOf($c);
    if (!$mine) { return []; }
    $out = [];
    $others = $pdo->prepare("SELECT * FROM succ_cases WHERE id<>? AND deleted_at IS NULL AND state NOT IN ('clos','archive') ORDER BY id");
    $others->execute([$id]);
    foreach ($others->fetchAll(PDO::FETCH_ASSOC) as $o) {
        foreach (array_intersect($mine, $peopleOf($o)) as $pid) {
            $n = $pdo->prepare("SELECT trim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) FROM persons WHERE id=?"); $n->execute([$pid]);
            $out[] = ['person_id' => (int) $pid, 'name' => (string) ($n->fetchColumn() ?: '#' . $pid), 'case_id' => (int) $o['id'], 'number' => (string) $o['number'], 'title' => (string) $o['title'], 'state' => (string) $o['state']];
        }
    }
    return array_slice($out, 0, 100);
}
