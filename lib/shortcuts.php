<?php
declare(strict_types=1);

/**
 * Ce dont les raccourcis clavier ont besoin côté serveur :
 *  - ⌘D : ajouter ou retirer une personne des favoris (colonne persons.is_bookmarked) ;
 *  - ⌘Z hors d'une case de texte : annuler la DERNIÈRE modification du journal, seulement si on peut le faire
 *    proprement (modification d'une fiche ou d'un événement que personne n'a retouchés depuis, ou suppression
 *    restaurable). L'interface affiche d'abord ce qui sera annulé et demande une confirmation.
 */

function set_person_bookmark(PDO $pdo, array $data): array
{
    $id = safe_int($data['person_id'] ?? $data['id'] ?? 0);
    if (!$id || !record_exists($pdo, 'persons', $id)) { throw new RuntimeException('Personne introuvable'); }
    $on = safe_int($data['bookmarked'] ?? 0) ? 1 : 0;
    $pdo->prepare('UPDATE persons SET is_bookmarked=? WHERE id=?')->execute([$on, $id]);
    return ['id' => $id, 'is_bookmarked' => $on];
}

/** Personne de départ (de cujus) = Sosa n°1 : une seule à la fois, enregistrée dans la base (et non plus seulement dans le navigateur). */
function set_start_person(PDO $pdo, array $data): array
{
    $id = safe_int($data['person_id'] ?? $data['id'] ?? 0);
    if (!$id || !record_exists($pdo, 'persons', $id)) { throw new RuntimeException('Personne introuvable'); }
    $pdo->prepare('UPDATE persons SET is_start=CASE WHEN id=? THEN 1 ELSE 0 END WHERE is_start=1 OR id=?')->execute([$id, $id]);
    return ['id' => $id, 'is_start' => 1];
}

/** Colonnes d'une ligne qui comptent pour savoir si elle a changé (les dates de mise à jour n'en font pas partie). */
function undo_comparable(array $row): array
{
    unset($row['updated_at'], $row['created_at']);
    return array_map(static fn($v) => $v === null ? null : (string) $v, $row);
}

/** La dernière modification du journal et ce qu'on peut en faire : ['available'=>bool, 'mode'=>'revert'|'restore', …]. */
function undo_candidate(PDO $pdo): array
{
    $row = $pdo->query("SELECT * FROM change_log WHERE entity_type NOT IN ('meta','app_settings','settings') ORDER BY id DESC LIMIT 1")->fetch();
    if (!$row) { return ['available' => false, 'reason' => 'Le journal des modifications est vide.']; }
    $base = ['id' => (int) $row['id'], 'summary' => (string) $row['summary'], 'created_at' => (string) $row['created_at'], 'entity_type' => (string) $row['entity_type']];
    $before = json_decode((string) ($row['before_json'] ?? ''), true) ?: [];
    $after = json_decode((string) ($row['after_json'] ?? ''), true) ?: [];
    if ($row['action'] === 'delete') {
        if (can_restore_change($pdo, $row, $before)) { return $base + ['available' => true, 'mode' => 'restore']; }
        return $base + ['available' => false, 'reason' => 'Cette suppression ne peut pas être restaurée automatiquement.'];
    }
    $tables = ['person' => 'persons', 'event' => 'events'];
    if ($row['action'] === 'update' && isset($tables[$row['entity_type']]) && !empty($before['id']) && !empty($after['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM ' . $tables[$row['entity_type']] . ' WHERE id=?');
        $stmt->execute([(int) $before['id']]);
        $current = $stmt->fetch();
        if (!$current) { return $base + ['available' => false, 'reason' => 'La fiche n’existe plus.']; }
        $cur = undo_comparable($current); $aft = array_intersect_key(undo_comparable($after), $cur);
        if (array_intersect_key($cur, $aft) != $aft) { return $base + ['available' => false, 'reason' => 'La fiche a été modifiée depuis, autrement.']; }
        return $base + ['available' => true, 'mode' => 'revert'];
    }
    return $base + ['available' => false, 'reason' => 'Ce type de modification ne s’annule pas automatiquement (le journal des modifications en garde la trace).'];
}

function undo_change(PDO $pdo, array $data): array
{
    $candidate = undo_candidate($pdo);
    if (empty($candidate['available']) || (int) $candidate['id'] !== safe_int($data['id'] ?? 0)) {
        throw new RuntimeException('La dernière modification a changé entre-temps : rien n’a été annulé.');
    }
    if ($candidate['mode'] === 'restore') { return ['undone' => $candidate['summary'], 'result' => restore_change($pdo, ['id' => $candidate['id']])]; }
    $row = $pdo->query('SELECT * FROM change_log WHERE id=' . (int) $candidate['id'])->fetch();
    $before = json_decode((string) $row['before_json'], true) ?: [];
    $table = $row['entity_type'] === 'person' ? 'persons' : 'events';
    $id = (int) $before['id'];
    $cols = array_column($pdo->query("PRAGMA table_info({$table})")->fetchAll(), 'name');
    $set = array_values(array_diff(array_intersect(array_keys($before), $cols), ['id', 'created_at', 'updated_at']));
    $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE id=?"); $stmt->execute([$id]); $current = $stmt->fetch();
    if ($set) {
        $pdo->prepare("UPDATE {$table} SET " . implode(',', array_map(static fn($c) => "{$c}=?", $set)) . " WHERE id=?")
            ->execute([...array_map(static fn($c) => $before[$c], $set), $id]);
    }
    $stmt->execute([$id]); $restored = $stmt->fetch();
    if ($table === 'persons') { rebuild_search($pdo, $id); }
    elseif (!empty($restored['person_id'])) { rebuild_search($pdo, (int) $restored['person_id']); }
    log_change($pdo, (string) $row['entity_type'], $id, 'update', 'Annulation : ' . $row['summary'], $current ?: null, $restored ?: null);
    return ['undone' => (string) $row['summary'], 'person_id' => $table === 'persons' ? $id : (int) ($restored['person_id'] ?? 0)];
}
