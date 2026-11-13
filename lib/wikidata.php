<?php
declare(strict_types=1);

/**
 * 🌐 Wikidata sur une fiche (Références externes) :
 *  - persons.wikidata_id (« Q42 », migration 73) : lien ↗ vers wikidata.org ; relu et écrit par GEDCOM (_WIKIDATA, EXID) et GEDCOM-X ;
 *  - « Compléter depuis Wikidata » À LA DEMANDE seulement : le navigateur lit la fiche Wikidata (internet, jamais
 *    automatiquement), montre ce qui serait ajouté, puis envoie ici les seuls éléments cochés (wikidata_apply) ;
 *    tout ce qui a été ajouté se retire d'un coup (wikidata_undo, message H7 « ↶ Annuler »).
 * Rien n'est jamais remplacé : seulement ajouté là où la fiche est vide (naissance, décès, sexe, métier) ; une description
 * et les liens (Wikipédia, Commons) vont dans une note « Wikidata ».
 */

/** POST person_wikidata_set {id, qid} : renseigne (ou vide) l'identifiant Wikidata d'une fiche. */
function person_wikidata_set(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $qid = strtoupper(trim((string) ($d['qid'] ?? '')));
    if (preg_match('#wikidata\.org/(?:wiki|entity)/(Q\d+)#i', (string) ($d['qid'] ?? ''), $m)) { $qid = strtoupper($m[1]); }
    if ($qid !== '' && !preg_match('/^Q\d{1,12}$/', $qid)) { throw new LcndaBadInput('Un identifiant Wikidata commence par Q suivi de chiffres (« Q7186 »).'); }
    if (!$id || !person_exists($pdo, $id)) { throw new LcndaBadInput('Fiche introuvable.'); }
    assert_person_unlocked($pdo, $id);
    $old = $pdo->prepare('SELECT wikidata_id FROM persons WHERE id=?'); $old->execute([$id]); $before = (string) $old->fetchColumn();
    $pdo->prepare('UPDATE persons SET wikidata_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$qid, $id]);
    log_change($pdo, 'person', $id, 'update', $qid !== '' ? 'Identifiant Wikidata : ' . $qid : 'Identifiant Wikidata retiré', ['wikidata_id' => $before], ['wikidata_id' => $qid]);
    return ['id' => $id, 'wikidata_id' => $qid, 'before' => $before];
}

/** Date de Wikidata déjà mise en français par le navigateur (« 14 mars 1879 », « vers 1750 ») : seulement du texte simple. */
function wikidata_clean_text($v, int $max = 300): string
{
    $s = is_scalar($v) ? trim((string) $v) : '';
    $s = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $s) ?? '';
    return mb_substr($s, 0, $max);
}

/**
 * POST wikidata_apply {id, qid, items: [{kind: birth|death|gender|occupation|note, date, place, lat, lon, country, value}]} :
 * ajoute les éléments cochés. Renvoie le jeton de « ↶ Annuler ».
 */
function wikidata_apply(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $qid = strtoupper(trim((string) ($d['qid'] ?? '')));
    if (!preg_match('/^Q\d{1,12}$/', $qid)) { throw new LcndaBadInput('Identifiant Wikidata incorrect.'); }
    if (!$id || !person_exists($pdo, $id)) { throw new LcndaBadInput('Fiche introuvable.'); }
    assert_person_unlocked($pdo, $id);
    $items = is_array($d['items'] ?? null) ? array_slice($d['items'], 0, 30) : [];
    if (!$items) { throw new LcndaBadInput('Coche au moins une chose à ajouter.'); }
    $p = $pdo->prepare('SELECT gender, occupation, wikidata_id FROM persons WHERE id=?'); $p->execute([$id]); $before = $p->fetch(PDO::FETCH_ASSOC) ?: [];
    $placesBefore = (int) $pdo->query('SELECT COALESCE(MAX(id),0) FROM places')->fetchColumn();
    $done = ['events' => [], 'notes' => [], 'person' => $before, 'places_from' => $placesBefore];
    $added = [];
    $own = !$pdo->inTransaction(); // l'action d'écriture est déjà dans une transaction (api.php)
    if ($own) { $pdo->beginTransaction(); }
    try {
        foreach ($items as $it) {
            if (!is_array($it)) { continue; }
            $kind = (string) ($it['kind'] ?? '');
            if ($kind === 'birth' || $kind === 'death') {
                $tag = $kind === 'birth' ? 'BIRT' : 'DEAT';
                $has = $pdo->prepare("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag=? AND (trim(COALESCE(e.date_text,''))<>'' OR e.place_id IS NOT NULL) LIMIT 1");
                $has->execute([$id, $tag]);
                if ($has->fetchColumn()) { continue; } // jamais remplacé
                $t = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? AND scope='person' ORDER BY id LIMIT 1"); $t->execute([$tag]);
                $typeId = (int) $t->fetchColumn();
                if (!$typeId) { continue; }
                $placeId = null;
                $pname = wikidata_clean_text($it['place'] ?? '', 120);
                if ($pname !== '') {
                    $placeId = find_or_create_place($pdo, $pname, wikidata_clean_text($it['country'] ?? '', 80));
                    $lat = is_numeric($it['lat'] ?? null) ? (float) $it['lat'] : null; $lon = is_numeric($it['lon'] ?? null) ? (float) $it['lon'] : null;
                    if ($placeId && $lat !== null && $lon !== null && abs($lat) <= 90 && abs($lon) <= 180) { $pdo->prepare('UPDATE places SET latitude=?, longitude=? WHERE id=? AND latitude IS NULL')->execute([$lat, $lon, $placeId]); }
                }
                $r = add_event($pdo, ['person_id' => $id, 'event_type_id' => $typeId, 'date_text' => wikidata_clean_text($it['date'] ?? '', 60), 'place_id' => $placeId ?: '', 'confidence_origin' => 'Wikidata ' . $qid]);
                $done['events'][] = (int) $r['id'];
                if (!isset($srcId)) { // la source « Wikidata » (créée une fois)
                    $q = $pdo->prepare("SELECT id FROM sources WHERE title='Wikidata' AND url LIKE '%wikidata.org%' ORDER BY id LIMIT 1"); $q->execute();
                    $srcId = (int) $q->fetchColumn();
                    if (!$srcId) { $pdo->prepare("INSERT INTO sources(title, url, text) VALUES('Wikidata', 'https://www.wikidata.org', 'Base de connaissances libre (Wikimédia)')")->execute(); $srcId = (int) $pdo->lastInsertId(); $done['source_created'] = $srcId; }
                }
                $pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES('event', ?, ?, ?, '', ?)")->execute([(int) $r['id'], $srcId, $qid, 'https://www.wikidata.org/wiki/' . $qid]);
                $added[] = $kind === 'birth' ? 'naissance' : 'décès';
            } elseif ($kind === 'gender') {
                $g = (string) ($it['value'] ?? '');
                if (!in_array($g, ['male', 'female'], true) || !in_array((string) ($before['gender'] ?? 'unknown'), ['', 'unknown'], true)) { continue; }
                $pdo->prepare('UPDATE persons SET gender=? WHERE id=?')->execute([$g, $id]);
                $added[] = 'sexe';
            } elseif ($kind === 'occupation') {
                $v = wikidata_clean_text($it['value'] ?? '', 200);
                if ($v === '' || trim((string) ($before['occupation'] ?? '')) !== '') { continue; }
                $pdo->prepare('UPDATE persons SET occupation=? WHERE id=?')->execute([$v, $id]);
                $added[] = 'métier';
            } elseif ($kind === 'note') {
                $v = wikidata_clean_text($it['value'] ?? '', 4000);
                if ($v === '') { continue; }
                $pdo->prepare('INSERT INTO notes(entity_type, entity_id, title, body) VALUES(?,?,?,?)')->execute(['person', $id, 'Wikidata ' . $qid, $v]);
                $done['notes'][] = (int) $pdo->lastInsertId();
                $added[] = 'note';
            }
        }
        $done['places_to'] = (int) $pdo->query('SELECT COALESCE(MAX(id),0) FROM places')->fetchColumn();
        if (trim((string) ($before['wikidata_id'] ?? '')) === '') { $pdo->prepare('UPDATE persons SET wikidata_id=? WHERE id=?')->execute([$qid, $id]); }
        $pdo->prepare('UPDATE persons SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    if (!$added) { return ['added' => [], 'undo' => '']; }
    log_change($pdo, 'person', $id, 'update', 'Complété depuis Wikidata (' . $qid . ') : ' . implode(', ', $added));
    $token = import_receipt_put('wikidata', ['person_id' => $id] + $done);
    return ['added' => $added, 'undo' => $token];
}

/** POST wikidata_undo {token} : retire ce que « Compléter depuis Wikidata » a ajouté. */
function wikidata_undo(PDO $pdo, array $d): array
{
    $token = (string) ($d['token'] ?? '');
    $r = import_receipt_load($token, 'wikidata');
    $id = (int) ($r['person_id'] ?? 0);
    foreach (array_map('intval', (array) ($r['events'] ?? [])) as $eid) {
        $pdo->prepare("DELETE FROM source_links WHERE entity_type='event' AND entity_id=?")->execute([$eid]);
        $pdo->prepare('DELETE FROM events WHERE id=? AND person_id=?')->execute([$eid, $id]);
    }
    if ((int) ($r['source_created'] ?? 0)) { $pdo->prepare('DELETE FROM sources WHERE id=? AND id NOT IN (SELECT source_record_id FROM source_links)')->execute([(int) $r['source_created']]); }
    foreach (array_map('intval', (array) ($r['notes'] ?? [])) as $nid) { $pdo->prepare("DELETE FROM notes WHERE id=? AND entity_type='person' AND entity_id=?")->execute([$nid, $id]); }
    $b = (array) ($r['person'] ?? []);
    $pdo->prepare('UPDATE persons SET gender=?, occupation=?, wikidata_id=? WHERE id=?')->execute([(string) ($b['gender'] ?? 'unknown'), (string) ($b['occupation'] ?? ''), (string) ($b['wikidata_id'] ?? ''), $id]);
    // les lieux créés pour l'occasion et que plus rien n'utilise
    $from = (int) ($r['places_from'] ?? 0); $to = (int) ($r['places_to'] ?? 0);
    if ($to > $from) { $pdo->prepare('DELETE FROM places WHERE id > ? AND id <= ? AND id NOT IN (SELECT place_id FROM events WHERE place_id IS NOT NULL)')->execute([$from, $to]); }
    @unlink(import_receipt_dir() . '/' . $token . '.json');
    log_change($pdo, 'person', $id, 'update', 'Ajouts de Wikidata annulés');
    return ['ok' => true, 'person_id' => $id];
}
