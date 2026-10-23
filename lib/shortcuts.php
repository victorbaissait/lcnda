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
    // les lignes « satellites » écrites juste après une modification (étiquettes, témoins d'un événement) ne cachent pas
    // la vraie modification : ⌘Z regarde celle d'avant si elle date du même moment
    $rows = $pdo->query("SELECT * FROM change_log WHERE entity_type NOT IN ('meta','app_settings','settings') ORDER BY id DESC LIMIT 12")->fetchAll();
    $satellite = static fn($r) => ($r['action'] ?? '') === 'labels' || (($r['action'] ?? '') === 'update' && str_starts_with((string) ($r['summary'] ?? ''), 'Mise à jour des témoins'));
    $row = $rows[0] ?? false;
    for ($i = 0; $row && $satellite($row) && isset($rows[$i + 1]); $i++) {
        $next = $rows[$i + 1];
        if (abs(strtotime((string) $row['created_at']) - strtotime((string) $next['created_at'])) > 60) { break; }
        $row = $next;
    }
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
    // 🔒 verrouillage / déverrouillage d'une fiche : on remet l'état d'avant
    if (in_array($row['action'], ['lock', 'unlock'], true) && $row['entity_type'] === 'person' && !empty($after['id'])) {
        $stmt = $pdo->prepare('SELECT is_locked FROM persons WHERE id=?'); $stmt->execute([(int) $after['id']]); $now = $stmt->fetchColumn();
        if ($now === false) { return $base + ['available' => false, 'reason' => 'La fiche n’existe plus.']; }
        if ((int) $now !== (int) ($after['is_locked'] ?? 0)) { return $base + ['available' => false, 'reason' => 'Le verrou de la fiche a déjà changé depuis : rien à annuler.']; }
        return $base + ['available' => true, 'mode' => 'lock'];
    }
    // 👪 un lien de parenté ajouté : on le retire (seulement s'il n'emporte rien avec lui, comme « Retirer le lien »)
    if ($row['action'] === 'add-relation' && !empty($after['related_id']) && !empty($after['person_id'])) {
        if (!record_exists($pdo, 'persons', (int) $after['person_id']) || !record_exists($pdo, 'persons', (int) $after['related_id'])) { return $base + ['available' => false, 'reason' => 'Une des deux fiches n’existe plus.']; }
        return $base + ['available' => true, 'mode' => 'unrelate'];
    }
    // ＋ une fiche tout juste créée, sans rien d'autre depuis : on la retire (elle reste restaurable, « ↷ Rétablir »)
    if ($row['action'] === 'create' && $row['entity_type'] === 'person' && (int) $row['entity_id'] > 0) {
        $id = (int) $row['entity_id'];
        $stmt = $pdo->prepare('SELECT * FROM persons WHERE id=?'); $stmt->execute([$id]); $current = $stmt->fetch();
        if (!$current) { return $base + ['available' => false, 'reason' => 'La fiche n’existe plus.']; }
        $cur = undo_comparable($current); $aft = array_intersect_key(undo_comparable($after), $cur);
        unset($cur['is_bookmarked'], $aft['is_bookmarked'], $cur['is_start'], $aft['is_start']);
        if (array_intersect_key($cur, $aft) != $aft) { return $base + ['available' => false, 'reason' => 'La fiche a été modifiée depuis sa création : pour la retirer, ouvre-la et choisis « Supprimer la fiche ».']; }
        $snap = function_exists('person_delete_snapshot') ? person_delete_snapshot($pdo, $id) : ['rows' => ['?'], 'nulls' => [], 'links' => []];
        $attached = array_filter(array_merge(array_values($snap['rows'] ?? []), array_values($snap['nulls'] ?? []), array_values($snap['links'] ?? [])), static fn($v) => !empty($v));
        if ($attached) { return $base + ['available' => false, 'reason' => 'Des éléments ont été ajoutés à cette fiche depuis sa création (événements, liens, notes, médias…) : pour la retirer, ouvre-la et choisis « Supprimer la fiche ».']; }
        return $base + ['available' => true, 'mode' => 'uncreate'];
    }
    return $base + ['available' => false, 'reason' => 'Celle-ci ne s’annule pas d’un coup de ⌘Z : défais-la à la main (Réglages → Journal des modifications montre ce qui a changé).'];
}

function undo_change(PDO $pdo, array $data): array
{
    $candidate = undo_candidate($pdo);
    if (empty($candidate['available']) || (int) $candidate['id'] !== safe_int($data['id'] ?? 0)) {
        throw new RuntimeException('La dernière modification a changé entre-temps : rien n’a été annulé.');
    }
    if ($candidate['mode'] === 'restore') { return ['undone' => $candidate['summary'], 'result' => restore_change($pdo, ['id' => $candidate['id']])]; }
    if (in_array($candidate['mode'], ['lock', 'unlock', 'unrelate', 'uncreate'], true)) {
        $row = $pdo->query('SELECT * FROM change_log WHERE id=' . (int) $candidate['id'])->fetch();
        $before = json_decode((string) ($row['before_json'] ?? ''), true) ?: [];
        $after = json_decode((string) ($row['after_json'] ?? ''), true) ?: [];
        if ($candidate['mode'] === 'lock') {
            $id = (int) $after['id'];
            set_person_lock($pdo, ['id' => $id, 'locked' => (int) ($before['is_locked'] ?? 0)]);
            return ['undone' => (string) $row['summary'], 'person_id' => $id, 'redo' => ['action' => 'set_person_lock', 'body' => ['id' => $id, 'locked' => (int) ($after['is_locked'] ?? 0)]]];
        }
        if ($candidate['mode'] === 'unrelate') {
            $rel = ['person_id' => (int) $after['person_id'], 'related_id' => (int) $after['related_id'], 'relation_type' => (string) ($after['relation_type'] ?? '')];
            remove_relation($pdo, $rel);
            return ['undone' => (string) $row['summary'], 'person_id' => $rel['person_id'], 'redo' => ['action' => 'add_relation', 'body' => $rel]];
        }
        $id = (int) $row['entity_id'];
        delete_person($pdo, ['id' => $id]);
        return ['undone' => (string) $row['summary'], 'person_id' => 0, 'deleted_person_id' => $id, 'redo' => ['action' => 'undo_last']];
    }
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
