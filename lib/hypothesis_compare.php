<?php
declare(strict_types=1);

/**
 * ⚖️ Hypothèses à comparer (F2), sur les hypothèses qui existaient déjà (table hypotheses : Réglages → Hypothèses,
 * fenêtre « Nouvelle hypothèse » de la fiche) : « Jean né à Naves ou à Tulle ? ».
 *  - plusieurs réponses possibles (hypothesis_options : un lieu de la base, une date écrite comme dans un acte, ou un texte) ;
 *  - pour chacune, des preuves pour et contre (hypothesis_proofs) : une source, un média, un dépouillement, une preuve
 *    de la fiche (evidence_records) ou un texte libre, avec un poids (1 faible, 2 moyen, 3 fort) ;
 *  - la conclusion : la réponse retenue met la fiche à jour (lieu ou date de l'événement de l'hypothèse), l'hypothèse
 *    passe « Confirmée » ; « ↶ Annuler » remet tout comme avant (si l'événement n'a pas été changé entre-temps).
 *
 *  GET  hypothesis_compare&id=          → {hypothesis, event, field, options:[{…, proofs, score}], leader}
 *  POST hypothesis_option_save / hypothesis_option_delete, hypothesis_proof_save / hypothesis_proof_delete,
 *       hypothesis_compare_restore {kind: option|proof, id} (« ↶ Annuler » d'une suppression),
 *       hypothesis_conclude {id, option_id}, hypothesis_conclusion_undo {id}.
 * Écran : assets/js/heritage-hypotheses.js (bloc de fiche « ⚖️ Hypothèses », Réglages → Hypothèses, fenêtre « Comparer »).
 */

const HCOMP_REF_KINDS = ['source' => 'sources', 'media' => 'media', 'digest' => 'archive_digest_entries', 'evidence' => 'evidence_records'];
const HCOMP_MAX_OPTIONS = 8;
const HCOMP_MAX_PROOFS = 60;

function hcomp_ready(PDO $pdo): bool
{
    static $ok = null;
    if ($ok === null) { $ok = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hypothesis_options'")->fetchColumn(); }
    return $ok;
}

function hcomp_hypothesis(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM hypotheses WHERE id=?');
    $s->execute([$id]);
    $h = $s->fetch(PDO::FETCH_ASSOC);
    if (!$h) { throw new RuntimeException('Hypothèse introuvable.'); }
    if (!hcomp_ready($pdo)) { throw new RuntimeException('La comparaison des hypothèses n’est pas encore prête : relance l’app.'); }
    return $h;
}

/** Une hypothèse qu'on modifie : la fiche de la personne ne doit pas être verrouillée. */
function hcomp_writable(PDO $pdo, int $id): array
{
    $h = hcomp_hypothesis($pdo, $id);
    if (function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, (int) $h['person_id']); }
    return $h;
}

/** Ce que la conclusion change sur la fiche : 'event_place', 'event_date' ou '' (rien : l'hypothèse est seulement confirmée). */
function hcomp_field(array $h, ?array $event): string
{
    if (!$event) { return ''; }
    return match ((string) $h['type']) { 'place' => 'event_place', 'date' => 'event_date', default => '' };
}

function hcomp_event(PDO $pdo, int $eventId): ?array
{
    if (!$eventId) { return null; }
    $s = $pdo->prepare('SELECT e.id, e.date_text, e.date_calendar, e.year, e.date_converted, e.place_id, e.person_id, e.family_id, t.label AS type_label, pl.name AS place_name, pl.county AS place_county
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id=?');
    $s->execute([$eventId]);
    $e = $s->fetch(PDO::FETCH_ASSOC);
    return $e ?: null;
}

function hcomp_option(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT o.*, pl.name AS place_name, pl.county AS place_county FROM hypothesis_options o LEFT JOIN places pl ON pl.id=o.place_id WHERE o.id=?');
    $s->execute([$id]);
    $o = $s->fetch(PDO::FETCH_ASSOC);
    return $o ?: null;
}

/** Le titre d'une preuve reliée (source, média, dépouillement, preuve) : relu à chaque fois (un titre changé suit). */
function hcomp_ref_info(PDO $pdo, string $kind, int $id): ?array
{
    if (!$id || !isset(HCOMP_REF_KINDS[$kind])) { return null; }
    try {
        switch ($kind) {
            case 'source':
                $s = $pdo->prepare('SELECT id, title, agency, author FROM sources WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
                return $r ? ['title' => (string) ($r['title'] ?: 'Source sans titre'), 'meta' => cite_join_safe([$r['agency'], $r['author']]), 'icon' => '📚'] : null;
            case 'media':
                $s = $pdo->prepare('SELECT id, title, filename, thumbnail, media_type, date_text, document_reference FROM media WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
                return $r ? ['title' => (string) ($r['title'] ?: $r['filename']), 'meta' => cite_join_safe([$r['date_text'], $r['document_reference']]), 'icon' => '🖼', 'thumb' => ($r['thumbnail'] ?: $r['filename']) && ($r['media_type'] ?? '') === 'image' ? 'media/' . rawurlencode((string) ($r['thumbnail'] ?: $r['filename'])) : ''] : null;
            case 'digest':
                $s = $pdo->prepare('SELECT a.*, p.name AS place_name FROM archive_digest_entries a LEFT JOIN places p ON p.id=a.place_id WHERE a.id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
                if (!$r) { return null; }
                $types = function_exists('archive_digest_record_types') ? archive_digest_record_types() : [];
                $commune = trim((string) ($r['place_name'] ?: $r['city_name']));
                return ['title' => function_exists('journal_digest_title') ? journal_digest_title($r, $types, $commune) : ('Dépouillement #' . $id), 'meta' => cite_join_safe([$r['archive_service'], $r['archive_reference']]), 'icon' => '📜'];
            case 'evidence':
                $s = $pdo->prepare('SELECT id, title, quality FROM evidence_records WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
                return $r ? ['title' => (string) $r['title'], 'meta' => 'Preuve de la fiche', 'icon' => '✅'] : null;
        }
    } catch (Throwable $_) {}
    return null;
}

function cite_join_safe(array $parts): string { return implode(' · ', array_values(array_filter(array_map(static fn($p) => trim((string) $p), $parts), static fn($p) => $p !== ''))); }

/** La valeur que la réponse donnerait à la fiche (texte lisible). */
function hcomp_option_value(array $o, string $field): string
{
    if ($field === 'event_place') { return trim((string) ($o['place_name'] ?? '')); }
    if ($field === 'event_date') { return trim((string) $o['value_text']); }
    return '';
}

/** GET hypothesis_compare&id= */
function hypothesis_compare_data(PDO $pdo, int $id): array
{
    $h = hcomp_hypothesis($pdo, $id);
    $event = hcomp_event($pdo, (int) $h['event_id']);
    $field = hcomp_field($h, $event);
    $p = $pdo->prepare('SELECT id, first_name, last_name, gender, is_locked FROM persons WHERE id=?');
    $p->execute([(int) $h['person_id']]);
    $person = $p->fetch(PDO::FETCH_ASSOC) ?: ['id' => (int) $h['person_id'], 'first_name' => '', 'last_name' => '', 'gender' => '', 'is_locked' => 0];
    $o = $pdo->prepare('SELECT o.*, pl.name AS place_name, pl.county AS place_county FROM hypothesis_options o LEFT JOIN places pl ON pl.id=o.place_id WHERE o.hypothesis_id=? ORDER BY o.sort_order, o.id');
    $o->execute([$id]);
    $options = $o->fetchAll(PDO::FETCH_ASSOC);
    $pr = $pdo->prepare('SELECT * FROM hypothesis_proofs WHERE hypothesis_id=? ORDER BY stance, weight DESC, id');
    $pr->execute([$id]);
    $byOption = [];
    foreach ($pr->fetchAll(PDO::FETCH_ASSOC) as $proof) {
        $info = $proof['ref_kind'] !== '' ? hcomp_ref_info($pdo, (string) $proof['ref_kind'], (int) $proof['ref_id']) : null;
        $byOption[(int) $proof['option_id']][] = ['id' => (int) $proof['id'], 'option_id' => (int) $proof['option_id'], 'stance' => (string) $proof['stance'], 'weight' => (int) $proof['weight'],
            'ref_kind' => (string) $proof['ref_kind'], 'ref_id' => (int) $proof['ref_id'], 'title' => $info['title'] ?? (trim((string) $proof['ref_text']) ?: ($proof['ref_kind'] !== '' ? 'Élément supprimé' : 'Preuve')),
            'meta' => $info['meta'] ?? ($proof['ref_kind'] !== '' && !$info ? 'n’existe plus dans la base' : 'Texte libre'), 'icon' => $info['icon'] ?? '✎', 'thumb' => $info['thumb'] ?? '',
            'missing' => $proof['ref_kind'] !== '' && !$info, 'note' => (string) $proof['note']];
    }
    $out = [];
    $best = null; $bestScore = null; $tie = false;
    foreach ($options as $opt) {
        $proofs = $byOption[(int) $opt['id']] ?? [];
        $for = array_sum(array_map(static fn($x) => $x['stance'] === 'for' ? $x['weight'] : 0, $proofs));
        $against = array_sum(array_map(static fn($x) => $x['stance'] === 'against' ? $x['weight'] : 0, $proofs));
        $score = $for - $against;
        $out[] = ['id' => (int) $opt['id'], 'label' => (string) $opt['label'], 'value_text' => (string) $opt['value_text'], 'place_id' => $opt['place_id'] !== null ? (int) $opt['place_id'] : null,
            'place_name' => (string) ($opt['place_name'] ?? ''), 'place_county' => (string) ($opt['place_county'] ?? ''), 'value' => hcomp_option_value($opt, $field),
            'proofs' => $proofs, 'for' => $for, 'against' => $against, 'score' => $score, 'chosen' => (int) $h['chosen_option_id'] === (int) $opt['id']];
        if ($proofs) {
            if ($bestScore === null || $score > $bestScore) { $best = (int) $opt['id']; $bestScore = $score; $tie = false; }
            elseif ($score === $bestScore) { $tie = true; }
        }
    }
    $current = $field === 'event_place' ? trim((string) ($event['place_name'] ?? '')) : ($field === 'event_date' ? trim((string) ($event['date_text'] ?? '')) : '');
    return [
        'hypothesis' => ['id' => (int) $h['id'], 'person_id' => (int) $h['person_id'], 'title' => (string) $h['title'], 'statement' => (string) $h['statement'], 'type' => (string) $h['type'],
            'status' => (string) $h['status'], 'confidence' => (string) $h['confidence'], 'event_id' => $event ? (int) $event['id'] : 0,
            'chosen_option_id' => (int) $h['chosen_option_id'], 'concluded_at' => (string) $h['concluded_at'], 'can_undo' => (string) $h['conclusion_json'] !== '', 'updated_at' => (string) $h['updated_at']],
        'person' => ['id' => (int) $person['id'], 'title' => trim($person['first_name'] . ' ' . mb_strtoupper((string) $person['last_name'])), 'gender' => (string) $person['gender'], 'locked' => (int) $person['is_locked'] === 1],
        'event' => $event ? ['id' => (int) $event['id'], 'type_label' => (string) $event['type_label'], 'date_text' => (string) $event['date_text'], 'place_name' => (string) ($event['place_name'] ?? ''), 'place_id' => $event['place_id'] !== null ? (int) $event['place_id'] : null] : null,
        'field' => $field, 'field_label' => ['event_place' => 'le lieu de l’événement', 'event_date' => 'la date de l’événement'][$field] ?? '', 'current' => $current,
        'options' => $out, 'leader' => $tie ? 0 : (int) $best,
    ];
}

/** POST hypothesis_option_save {hypothesis_id, id?, label, value_text, place_id} */
function hypothesis_option_save(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $opt = $id ? hcomp_option($pdo, $id) : null;
    if ($id && !$opt) { throw new RuntimeException('Réponse introuvable.'); }
    $hid = $opt ? (int) $opt['hypothesis_id'] : safe_int($data['hypothesis_id'] ?? 0);
    $h = hcomp_writable($pdo, $hid);
    $label = mb_substr(safe_text($data['label'] ?? ''), 0, 200);
    $value = mb_substr(safe_text($data['value_text'] ?? ''), 0, 120);
    $placeRaw = $data['place_id'] ?? '';
    $placeId = safe_int(is_string($placeRaw) ? trim($placeRaw) : $placeRaw) ?: null;
    if ($placeId && !record_exists($pdo, 'places', $placeId)) { throw new RuntimeException('Lieu introuvable : choisis-le dans la liste.'); }
    if ($label === '' && $placeId) { $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([$placeId]); $label = (string) $s->fetchColumn(); }
    if ($label === '' && $value !== '') { $label = $value; }
    if ($label === '') { throw new RuntimeException('Donne un nom à cette réponse (ex. « Naves »).'); }
    if ($opt) {
        $pdo->prepare('UPDATE hypothesis_options SET label=?, value_text=?, place_id=? WHERE id=?')->execute([$label, $value, $placeId, $id]);
    } else {
        $n = $pdo->prepare('SELECT count(*), COALESCE(max(sort_order),0) FROM hypothesis_options WHERE hypothesis_id=?'); $n->execute([$hid]); [$count, $max] = $n->fetch(PDO::FETCH_NUM);
        if ((int) $count >= HCOMP_MAX_OPTIONS) { throw new RuntimeException('Huit réponses au plus : retires-en une avant d’en ajouter.'); }
        $pdo->prepare('INSERT INTO hypothesis_options(hypothesis_id, label, value_text, place_id, sort_order) VALUES(?,?,?,?,?)')->execute([$hid, $label, $value, $placeId, (int) $max + 1]);
        $id = (int) $pdo->lastInsertId();
    }
    $pdo->prepare('UPDATE hypotheses SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$hid]);
    log_change($pdo, 'hypothesis', $hid, 'update', ($opt ? 'Réponse modifiée' : 'Réponse ajoutée') . ' : « ' . $label . ' » (hypothèse « ' . $h['title'] . ' »)', $opt, null);
    return hcomp_option($pdo, $id) ?? ['id' => $id];
}

/** POST hypothesis_option_delete {id} : la réponse et ses preuves (gardées dans le journal pour « ↶ Annuler »). */
function hypothesis_option_delete(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $opt = hcomp_option($pdo, $id);
    if (!$opt) { throw new RuntimeException('Réponse introuvable.'); }
    $h = hcomp_writable($pdo, (int) $opt['hypothesis_id']);
    if ((int) $h['chosen_option_id'] === $id && (string) $h['conclusion_json'] !== '') { throw new RuntimeException('C’est la réponse retenue : reviens d’abord sur la conclusion (↶).'); }
    $p = $pdo->prepare('SELECT * FROM hypothesis_proofs WHERE option_id=?'); $p->execute([$id]);
    $row = array_intersect_key($opt, array_flip(['id', 'hypothesis_id', 'label', 'value_text', 'place_id', 'sort_order', 'created_at']));
    $row['_proofs'] = $p->fetchAll(PDO::FETCH_ASSOC);
    $pdo->prepare('DELETE FROM hypothesis_proofs WHERE option_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM hypothesis_options WHERE id=?')->execute([$id]);
    log_change($pdo, 'hypothesis_option', $id, 'delete', 'Réponse retirée : « ' . $opt['label'] . ' »', $row, null);
    return ['id' => $id];
}

/** Ce qu'une preuve relie : [kind, id, text] (référence à un élément existant, ou un texte libre). */
function hcomp_ref_from(PDO $pdo, array $data): array
{
    $kind = safe_text($data['ref_kind'] ?? '');
    $raw = $data['ref_id'] ?? '';
    $text = mb_substr(safe_text($data['ref_text'] ?? ''), 0, 500);
    if (is_string($raw) && str_starts_with($raw, 'txt:')) { $text = mb_substr(trim(substr($raw, 4)), 0, 500); $kind = ''; }
    if ($kind === '') {
        if ($text === '') { throw new RuntimeException('Choisis une source, un média ou un dépouillement, ou écris la preuve.'); }
        return ['', 0, $text];
    }
    if (!isset(HCOMP_REF_KINDS[$kind])) { throw new RuntimeException('Sorte de preuve inconnue.'); }
    $id = safe_int($raw);
    $chk = $pdo->prepare('SELECT 1 FROM ' . HCOMP_REF_KINDS[$kind] . ' WHERE id=?'); // table tirée de HCOMP_REF_KINDS seulement
    if ($id) { $chk->execute([$id]); }
    if (!$id || !$chk->fetchColumn()) { throw new RuntimeException('Cet élément n’existe pas (ou plus) dans la base.'); }
    return [$kind, $id, ''];
}

/** POST hypothesis_proof_save {id?, hypothesis_id, option_id, stance, weight, ref_kind, ref_id | ref_text, note} */
function hypothesis_proof_save(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $old = null;
    if ($id) { $s = $pdo->prepare('SELECT * FROM hypothesis_proofs WHERE id=?'); $s->execute([$id]); $old = $s->fetch(PDO::FETCH_ASSOC); if (!$old) { throw new RuntimeException('Preuve introuvable.'); } }
    $optId = $old ? (int) $old['option_id'] : safe_int($data['option_id'] ?? 0);
    $opt = hcomp_option($pdo, $optId);
    if (!$opt) { throw new RuntimeException('Réponse introuvable.'); }
    $h = hcomp_writable($pdo, (int) $opt['hypothesis_id']);
    $stance = array_key_exists('stance', $data) ? (safe_text($data['stance']) === 'against' ? 'against' : 'for') : ($old['stance'] ?? 'for');
    $weight = array_key_exists('weight', $data) ? max(1, min(3, safe_int($data['weight'], 2))) : (int) ($old['weight'] ?? 2);
    $note = array_key_exists('note', $data) ? mb_substr(safe_text($data['note']), 0, 2000) : (string) ($old['note'] ?? '');
    if ($old) {
        $pdo->prepare('UPDATE hypothesis_proofs SET stance=?, weight=?, note=? WHERE id=?')->execute([$stance, $weight, $note, $id]);
    } else {
        $n = $pdo->prepare('SELECT count(*) FROM hypothesis_proofs WHERE hypothesis_id=?'); $n->execute([(int) $h['id']]);
        if ((int) $n->fetchColumn() >= HCOMP_MAX_PROOFS) { throw new RuntimeException('Soixante preuves au plus pour une hypothèse.'); }
        [$kind, $refId, $text] = hcomp_ref_from($pdo, $data);
        $dup = $pdo->prepare('SELECT id FROM hypothesis_proofs WHERE option_id=? AND stance=? AND ref_kind=? AND ref_id=? AND ref_text=?'); $dup->execute([$optId, $stance, $kind, $refId, $text]);
        if ($dup->fetchColumn()) { throw new RuntimeException('Cette preuve est déjà dans la colonne.'); }
        $pdo->prepare('INSERT INTO hypothesis_proofs(hypothesis_id, option_id, stance, weight, ref_kind, ref_id, ref_text, note) VALUES(?,?,?,?,?,?,?,?)')
            ->execute([(int) $h['id'], $optId, $stance, $weight, $kind, $refId, $text, $note]);
        $id = (int) $pdo->lastInsertId();
    }
    $pdo->prepare('UPDATE hypotheses SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $h['id']]);
    log_change($pdo, 'hypothesis', (int) $h['id'], 'update', ($old ? 'Preuve modifiée' : 'Preuve ajoutée') . ' (« ' . $opt['label'] . ' »)', $old ?: null, null);
    $s = $pdo->prepare('SELECT * FROM hypothesis_proofs WHERE id=?'); $s->execute([$id]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: ['id' => $id];
}

function hypothesis_proof_delete(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM hypothesis_proofs WHERE id=?'); $s->execute([$id]);
    $old = $s->fetch(PDO::FETCH_ASSOC);
    if (!$old) { throw new RuntimeException('Preuve introuvable.'); }
    hcomp_writable($pdo, (int) $old['hypothesis_id']);
    $pdo->prepare('DELETE FROM hypothesis_proofs WHERE id=?')->execute([$id]);
    log_change($pdo, 'hypothesis_proof', $id, 'delete', 'Preuve retirée', $old, null);
    return ['id' => $id];
}

/** Remet une ligne gardée dans le journal (colonnes de la table seulement). */
function hcomp_insert_row(PDO $pdo, string $table, array $row): void
{
    $cols = [];
    foreach ($pdo->query('PRAGMA table_info(' . $table . ')') as $c) { if (array_key_exists($c['name'], $row)) { $cols[] = $c['name']; } }
    if (!$cols) { return; }
    $pdo->prepare('INSERT INTO ' . $table . '(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_map(static fn($k) => $row[$k], $cols));
}

/** POST hypothesis_compare_restore {kind: option|proof, id} : « ↶ Annuler » d'une réponse ou d'une preuve retirée. */
function hypothesis_compare_restore(PDO $pdo, array $data): array
{
    $kind = safe_text($data['kind'] ?? '') === 'proof' ? 'proof' : 'option';
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare("SELECT before_json FROM change_log WHERE action='delete' AND entity_type=? AND entity_id=? ORDER BY id DESC LIMIT 1");
    $s->execute(['hypothesis_' . $kind, $id]);
    $row = json_decode((string) $s->fetchColumn(), true);
    if (!is_array($row) || (int) ($row['id'] ?? 0) !== $id) { throw new RuntimeException('Cette suppression n’a pas été trouvée dans le journal.'); }
    $h = hcomp_writable($pdo, (int) $row['hypothesis_id']);
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        if ($kind === 'option') {
            if (hcomp_option($pdo, $id)) { throw new RuntimeException('Cette réponse existe déjà.'); }
            $proofs = is_array($row['_proofs'] ?? null) ? $row['_proofs'] : [];
            unset($row['_proofs']);
            if ($row['place_id'] !== null && !record_exists($pdo, 'places', (int) $row['place_id'])) { $row['place_id'] = null; }
            hcomp_insert_row($pdo, 'hypothesis_options', $row);
            foreach ($proofs as $p) { if (is_array($p) && (int) ($p['option_id'] ?? 0) === $id) { hcomp_insert_row($pdo, 'hypothesis_proofs', $p); } }
        } else {
            $e = $pdo->prepare('SELECT 1 FROM hypothesis_proofs WHERE id=?'); $e->execute([$id]);
            if ($e->fetchColumn()) { throw new RuntimeException('Cette preuve existe déjà.'); }
            if (!hcomp_option($pdo, (int) $row['option_id'])) { throw new RuntimeException('La réponse de cette preuve a été retirée.'); }
            hcomp_insert_row($pdo, 'hypothesis_proofs', $row);
        }
        log_change($pdo, 'hypothesis', (int) $h['id'], 'restore', ($kind === 'option' ? 'Réponse' : 'Preuve') . ' remise', null, null);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['id' => $id, 'kind' => $kind];
}

/** POST hypothesis_conclude {id, option_id} : la réponse retenue met la fiche à jour ; tout est gardé pour « ↶ Annuler ». */
function hypothesis_conclude(PDO $pdo, array $data): array
{
    $h = hcomp_writable($pdo, safe_int($data['id'] ?? 0));
    $opt = hcomp_option($pdo, safe_int($data['option_id'] ?? 0));
    if (!$opt || (int) $opt['hypothesis_id'] !== (int) $h['id']) { throw new RuntimeException('Choisis une des réponses de cette hypothèse.'); }
    if ((string) $h['conclusion_json'] !== '') { throw new RuntimeException('Cette hypothèse est déjà conclue : reviens d’abord sur la conclusion (↶).'); }
    $event = hcomp_event($pdo, (int) $h['event_id']);
    $field = hcomp_field($h, $event);
    $backup = ['option_id' => (int) $opt['id'], 'status' => (string) $h['status'], 'confidence' => (string) $h['confidence'], 'chosen_option_id' => $h['chosen_option_id'] !== null ? (int) $h['chosen_option_id'] : null, 'field' => $field];
    $changed = '';
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        if ($field !== '') {
            if (function_exists('assert_event_unlocked')) { assert_event_unlocked($pdo, (int) $event['id']); }
            $s = $pdo->prepare('SELECT * FROM events WHERE id=?'); $s->execute([(int) $event['id']]); $before = $s->fetch(PDO::FETCH_ASSOC);
            $backup['event'] = ['id' => (int) $event['id'], 'place_id' => $before['place_id'] !== null ? (int) $before['place_id'] : null, 'date_text' => (string) $before['date_text'], 'year' => $before['year'], 'date_converted' => (string) $before['date_converted']];
            if ($field === 'event_place') {
                if (!$opt['place_id']) { throw new RuntimeException('Cette réponse n’a pas de lieu : choisis le lieu (📍) avant de la retenir.'); }
                $pdo->prepare('UPDATE events SET place_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $opt['place_id'], (int) $event['id']]);
                $backup['set'] = ['place_id' => (int) $opt['place_id']];
                $changed = 'Lieu : ' . $opt['place_name'];
            } else {
                $date = trim((string) $opt['value_text']);
                if ($date === '') { throw new RuntimeException('Cette réponse n’a pas de date : écris-la avant de la retenir.'); }
                $cal = in_array((string) $before['date_calendar'], ['gregorian', 'julian', 'republican', 'islamic', 'hebrew'], true) ? (string) $before['date_calendar'] : 'gregorian';
                [$year, $conv] = function_exists('event_year_and_converted') ? event_year_and_converted($date, '', $cal) : [preg_match('/\b(\d{4})\b/', $date, $m) ? (int) $m[1] : null, ''];
                $pdo->prepare('UPDATE events SET date_text=?, year=?, date_converted=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$date, $year, $conv, (int) $event['id']]);
                $backup['set'] = ['date_text' => $date];
                $changed = 'Date : ' . $date;
            }
            $s->execute([(int) $event['id']]);
            log_change($pdo, 'event', (int) $event['id'], 'update', 'Hypothèse conclue (« ' . $h['title'] . ' ») — ' . $changed, $before, $s->fetch(PDO::FETCH_ASSOC));
        }
        $pdo->prepare("UPDATE hypotheses SET status='confirmed', confidence='high', chosen_option_id=?, concluded_at=CURRENT_TIMESTAMP, conclusion_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([(int) $opt['id'], json_encode($backup, JSON_UNESCAPED_UNICODE), (int) $h['id']]);
        log_change($pdo, 'hypothesis', (int) $h['id'], 'update', 'Conclusion : « ' . $opt['label'] . ' » retenue', $h, null);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['id' => (int) $h['id'], 'option_id' => (int) $opt['id'], 'label' => (string) $opt['label'], 'field' => $field, 'changed' => $changed, 'person_id' => (int) $h['person_id']];
}

/** POST hypothesis_conclusion_undo {id} : la fiche et l'hypothèse comme avant la conclusion. */
function hypothesis_conclusion_undo(PDO $pdo, array $data): array
{
    $h = hcomp_writable($pdo, safe_int($data['id'] ?? 0));
    $b = json_decode((string) $h['conclusion_json'], true);
    if (!is_array($b)) { throw new RuntimeException('Il n’y a pas de conclusion à défaire.'); }
    $own = !$pdo->inTransaction(); if ($own) { $pdo->beginTransaction(); }
    try {
        if (!empty($b['event']['id']) && is_array($b['set'] ?? null)) {
            $eid = (int) $b['event']['id'];
            $s = $pdo->prepare('SELECT * FROM events WHERE id=?'); $s->execute([$eid]); $now = $s->fetch(PDO::FETCH_ASSOC);
            if ($now) {
                if (function_exists('assert_event_unlocked')) { assert_event_unlocked($pdo, $eid); }
                $same = isset($b['set']['place_id']) ? (int) $now['place_id'] === (int) $b['set']['place_id'] : (string) $now['date_text'] === (string) ($b['set']['date_text'] ?? '');
                if (!$same) { throw new RuntimeException('L’événement a été modifié depuis la conclusion : remets-le à la main si besoin.'); }
                if (isset($b['set']['place_id'])) { $pdo->prepare('UPDATE events SET place_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$b['event']['place_id'], $eid]); }
                else { $pdo->prepare('UPDATE events SET date_text=?, year=?, date_converted=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(string) $b['event']['date_text'], $b['event']['year'], (string) $b['event']['date_converted'], $eid]); }
                $s->execute([$eid]);
                log_change($pdo, 'event', $eid, 'update', 'Conclusion annulée (« ' . $h['title'] . ' »)', $now, $s->fetch(PDO::FETCH_ASSOC));
            }
        }
        $status = in_array($b['status'] ?? '', ['open', 'confirmed', 'rejected'], true) ? $b['status'] : 'open';
        $conf = in_array($b['confidence'] ?? '', ['low', 'medium', 'high'], true) ? $b['confidence'] : 'medium';
        $pdo->prepare("UPDATE hypotheses SET status=?, confidence=?, chosen_option_id=?, concluded_at='', conclusion_json='', updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([$status, $conf, $b['chosen_option_id'] ?? null, (int) $h['id']]);
        log_change($pdo, 'hypothesis', (int) $h['id'], 'update', 'Conclusion annulée', $h, null);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['id' => (int) $h['id'], 'person_id' => (int) $h['person_id']];
}

/** Résumé pour une liste (Réglages → Hypothèses, bloc de fiche) : réponses, nombre de preuves, celle qui mène. */
function hypotheses_compare_summaries(PDO $pdo, array $ids): array
{
    if (!$ids || !hcomp_ready($pdo)) { return []; }
    $ids = array_values(array_unique(array_map('intval', $ids)));
    $in = implode(',', $ids);
    $out = [];
    foreach ($pdo->query("SELECT o.id, o.hypothesis_id, o.label,
            COALESCE((SELECT sum(CASE WHEN p.stance='for' THEN p.weight ELSE -p.weight END) FROM hypothesis_proofs p WHERE p.option_id=o.id),0) AS score,
            (SELECT count(*) FROM hypothesis_proofs p WHERE p.option_id=o.id) AS n
        FROM hypothesis_options o WHERE o.hypothesis_id IN ({$in}) ORDER BY o.sort_order, o.id") as $r) {
        $out[(int) $r['hypothesis_id']][] = ['id' => (int) $r['id'], 'label' => (string) $r['label'], 'score' => (int) $r['score'], 'proofs' => (int) $r['n']];
    }
    return $out;
}

/** Structure n°50 (avec les services d'archives) : réponses et preuves des hypothèses, conclusion. */
function hypothesis_compare_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS hypothesis_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hypothesis_id INTEGER NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT '',
        value_text TEXT NOT NULL DEFAULT '',
        place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_hypothesis_options_h ON hypothesis_options(hypothesis_id, sort_order)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS hypothesis_proofs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hypothesis_id INTEGER NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
        option_id INTEGER NOT NULL REFERENCES hypothesis_options(id) ON DELETE CASCADE,
        stance TEXT NOT NULL DEFAULT 'for' CHECK(stance IN ('for','against')),
        weight INTEGER NOT NULL DEFAULT 2 CHECK(weight BETWEEN 1 AND 3),
        ref_kind TEXT NOT NULL DEFAULT '',
        ref_id INTEGER NOT NULL DEFAULT 0,
        ref_text TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_hypothesis_proofs_o ON hypothesis_proofs(option_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_hypothesis_proofs_h ON hypothesis_proofs(hypothesis_id)');
    $has = static function (string $c) use ($pdo): bool { foreach ($pdo->query('PRAGMA table_info(hypotheses)') as $r) { if ($r['name'] === $c) { return true; } } return false; };
    if (!$has('chosen_option_id')) { $pdo->exec('ALTER TABLE hypotheses ADD COLUMN chosen_option_id INTEGER'); }
    if (!$has('concluded_at')) { $pdo->exec("ALTER TABLE hypotheses ADD COLUMN concluded_at TEXT NOT NULL DEFAULT ''"); }
    if (!$has('conclusion_json')) { $pdo->exec("ALTER TABLE hypotheses ADD COLUMN conclusion_json TEXT NOT NULL DEFAULT ''"); }
}
