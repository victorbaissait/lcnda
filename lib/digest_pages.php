<?php
declare(strict_types=1);

/*
 * 📜 Dépouillements en pages (Listes › Dépouillements ; écran : assets/js/heritage-depouillements.js).
 * Même source que Recherche › Dépouillement d'archive : archive_digest_entries.pages_json (les pages), archive_digest_media.page_number
 * (les photos d'une page), archive_digest_people.page_number / household_key (les personnes et leurs foyers), archive_digest_transcription_lines.
 * Ici, une seule page à la fois : la créer, la modifier, changer son numéro (photos, personnes et lignes suivent) ou la supprimer.
 */

const DIGEST_PAGE_STATUSES = ['checked', 'empty', 'review', 'todo', 'found', 'incomplete'];
const DIGEST_PAGE_CONTENTS = ['acts', 'empty', 'cover', 'review', 'other'];

function save_archive_digest_page(PDO $pdo, array $data): array
{
    $entryId = safe_int($data['archive_digest_id'] ?? 0);
    $s = $pdo->prepare('SELECT pages_json FROM archive_digest_entries WHERE id=?'); $s->execute([$entryId]);
    $json = $s->fetchColumn();
    if ($json === false) { throw new RuntimeException('Dépouillement introuvable.'); }
    $pages = json_decode((string) $json, true);
    if (!is_array($pages)) { $pages = []; }
    $old = mb_substr(safe_text((string) ($data['old_number'] ?? $data['number'] ?? '')), 0, 40);
    $number = mb_substr(safe_text((string) ($data['number'] ?? '')), 0, 40);
    $idx = null;
    foreach ($pages as $i => $p) { if (is_array($p) && (string) ($p['number'] ?? '') === $old) { $idx = $i; break; } }
    $moveLinks = static function (string $from, string $to) use ($pdo, $entryId): void {
        foreach (['archive_digest_media', 'archive_digest_people', 'archive_digest_transcription_lines'] as $t) {
            $pdo->prepare("UPDATE $t SET page_number=? WHERE archive_digest_id=? AND page_number=?")->execute([$to, $entryId, $from]);
        }
    };
    if (!empty($data['delete'])) {
        if ($idx !== null) { array_splice($pages, $idx, 1); }
        // ses photos passent « à ranger » ; les personnes et les lignes gardent leur numéro de page, sauf si on le demande
        $pdo->prepare("UPDATE archive_digest_media SET page_number='' WHERE archive_digest_id=? AND page_number=?")->execute([$entryId, $old]);
        if (!empty($data['clear_people'])) { $moveLinks($old, ''); }
        if (!empty($data['delete_content'])) { // la page part avec ses personnes relevées et ses lignes (une trace de chaque personne dans l'Historique)
            $b = $pdo->prepare('SELECT * FROM archive_digest_people WHERE archive_digest_id=? AND page_number=?'); $b->execute([$entryId, $old]);
            foreach ($b->fetchAll() as $row) { log_change($pdo, 'archive_digest', $entryId, 'delete-member', 'Page ' . $old . ' supprimée : ' . trim($row['first_name'] . ' ' . $row['last_name']), $row, null); }
            $pdo->prepare('DELETE FROM archive_digest_people WHERE archive_digest_id=? AND page_number=?')->execute([$entryId, $old]);
            $pdo->prepare('DELETE FROM archive_digest_transcription_lines WHERE archive_digest_id=? AND page_number=?')->execute([$entryId, $old]);
        }
    } else {
        if ($number === '') { throw new RuntimeException('Indique le numéro de la page (ou de la vue).'); }
        if ($number !== $old) {
            foreach ($pages as $p) { if (is_array($p) && (string) ($p['number'] ?? '') === $number) { throw new RuntimeException('La page ' . $number . ' existe déjà.'); } }
        }
        $cur = $idx !== null && is_array($pages[$idx]) ? $pages[$idx] : ['number' => $number, 'status' => 'todo', 'content_type' => 'acts', 'act_from' => '', 'act_to' => '', 'note' => ''];
        $status = (string) ($data['status'] ?? $cur['status'] ?? 'todo');
        $content = (string) ($data['content_type'] ?? $cur['content_type'] ?? 'acts');
        $page = [
            'number' => $number,
            'status' => in_array($status, DIGEST_PAGE_STATUSES, true) ? $status : 'checked',
            'content_type' => in_array($content, DIGEST_PAGE_CONTENTS, true) ? $content : 'acts',
            'act_from' => mb_substr(safe_text((string) ($data['act_from'] ?? $cur['act_from'] ?? '')), 0, 40),
            'act_to' => mb_substr(safe_text((string) ($data['act_to'] ?? $cur['act_to'] ?? '')), 0, 40),
            'note' => mb_substr(safe_text((string) ($data['note'] ?? $cur['note'] ?? '')), 0, 4000),
        ];
        if ($idx !== null) { $pages[$idx] = $page; } else { $pages[] = $page; }
        if ($old !== '' && $number !== $old) { $moveLinks($old, $number); }
        // rangées dans l'ordre des numéros (1, 2, 10, 10 bis…)
        usort($pages, static fn($a, $b) => strnatcasecmp((string) ($a['number'] ?? ''), (string) ($b['number'] ?? '')));
    }
    $pdo->prepare('UPDATE archive_digest_entries SET pages_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode(array_values($pages), JSON_UNESCAPED_UNICODE), $entryId]);
    if (!empty($data['delete'])) { log_change($pdo, 'archive_digest', $entryId, 'delete-page', 'Page ' . $old . ' supprimée du dépouillement', ['page' => $old, 'pages_json' => $json], null); }
    elseif ($old !== '' && $number !== $old) { log_change($pdo, 'archive_digest', $entryId, 'update-page', 'Page ' . $old . ' renumérotée ' . $number, ['page' => $old], ['page' => $number]); }
    return ['pages' => array_values($pages)];
}

/** Combien de vues fait le scan en ligne (page_total) et combien de pages fait le document (doc_pages) ; vide = on ne sait pas. */
function save_archive_digest_counts(PDO $pdo, array $data): array
{
    $id = safe_int($data['archive_digest_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM archive_digest_entries WHERE id=?'); $s->execute([$id]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Dépouillement introuvable.'); }
    $n = static fn($k) => isset($data[$k]) && trim((string) $data[$k]) !== '' ? max(0, min(100000, safe_int($data[$k]))) : null;
    $pdo->prepare('UPDATE archive_digest_entries SET page_total=?, doc_pages=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$n('page_total'), $n('doc_pages'), $id]);
    return ['page_total' => $n('page_total'), 'doc_pages' => $n('doc_pages')];
}

/** Foyer d'une page : le renuméroter (toutes ses personnes suivent), lui donner une adresse, ou le supprimer avec ses personnes. */
function save_archive_digest_household(PDO $pdo, array $data): array
{
    $id = safe_int($data['archive_digest_id'] ?? 0);
    $page = safe_text((string) ($data['page_number'] ?? ''));
    $uid = mb_substr(safe_text((string) ($data['household_uid'] ?? '')), 0, 80);
    if ($uid === '') { throw new RuntimeException('Foyer inconnu.'); }
    // Les personnes du foyer : celles qui portent son identité, et celles qui n'en ont pas encore (import, saisie ancienne)
    // reconnues comme l'écran : même numéro, ou sans numéro la même adresse. Elles reçoivent l'identité au passage.
    $q = $pdo->prepare('SELECT id, household_uid, household_key, address FROM archive_digest_people WHERE archive_digest_id=? AND page_number=?'); $q->execute([$id, $page]);
    $ids = [];
    foreach ($q->fetchAll() as $row) {
        $u = (string) $row['household_uid'];
        if ($u === '') { $k = trim((string) $row['household_key']); $u = $k !== '' ? 'k:' . $k : 'a:' . mb_strtolower(trim((string) $row['address'])); }
        if ($u === $uid) { $ids[] = (int) $row['id']; }
    }
    if (!$ids) { return ['updated' => 0, 'deleted' => 0]; }
    $in = implode(',', $ids);
    $pdo->exec("UPDATE archive_digest_people SET household_uid=" . $pdo->quote($uid) . " WHERE id IN ($in) AND household_uid=''");
    $where = "id IN ($in)";
    $args = [];
    if (!empty($data['delete'])) {
        // une trace par personne retirée (Historique : on peut retrouver ce qui a été effacé)
        $b = $pdo->prepare("SELECT * FROM archive_digest_people WHERE $where"); $b->execute($args);
        foreach ($b->fetchAll() as $row) { log_change($pdo, 'archive_digest', $id, 'delete-member', 'Foyer ' . (trim((string) $row['household_key']) !== '' ? $row['household_key'] : 'sans numéro') . ' supprimé (page ' . $page . ') : ' . trim($row['first_name'] . ' ' . $row['last_name']), $row, null); }
        $s = $pdo->prepare("DELETE FROM archive_digest_people WHERE $where"); $s->execute($args);
        return ['deleted' => $s->rowCount()];
    }
    $n = 0;
    // le numéro et l'adresse sont ceux du foyer : toutes ses personnes les partagent
    foreach (['new_key' => ['household_key', 40], 'address' => ['address', 300]] as $k => [$col, $max]) {
        if (!array_key_exists($k, $data)) { continue; }
        $s = $pdo->prepare("UPDATE archive_digest_people SET $col=?, updated_at=CURRENT_TIMESTAMP WHERE $where"); $s->execute([mb_substr(safe_text((string) $data[$k]), 0, $max), ...$args]); $n = max($n, $s->rowCount());
    }
    return ['updated' => $n];
}
