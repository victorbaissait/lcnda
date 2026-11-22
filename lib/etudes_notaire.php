<?php
declare(strict_types=1);

/**
 * A 🏛 Études de notaire (maquette docs/design/complements-existants.html, partie A). Une étude n'est pas une nouvelle sorte de
 * chose : c'est un service d'archives de la sorte « notary » (lib/archive_services.php). Elle gagne :
 *  - ses notaires et clercs (archive_service_people : nom, rôle, fiche facultative, téléphone, depuis, jusqu'à ; un notaire qui
 *    change d'étude est mis « ancien » avec une date de fin, jamais supprimé de ses anciens dossiers) ;
 *  - ses dossiers, lus dans succ_cases.notary_service_id (rien n'est recopié ; notary_text, le nom tapé, reste dans le dossier) ;
 *  - ses courriers (courriers.archive_service_id) et le ⏳ délai de réponse CONSTATÉ : moyenne (ou médiane) entre l'envoi et
 *    courriers.recu_le, à partir de 3 réponses (réglages). Ce n'est ni un délai légal, ni une promesse de l'étude ;
 *  - 🧩 le regroupement des notaires tapés à la main : des propositions (nom de famille sans « Me », « Maître », « SCP »… et la
 *    ville quand elle est écrite), jamais appliquées sans le clic « Appliquer », avec « ↶ Annuler ».
 * Mode consultation : la liste se lit, sans les dossiers ni les courriers successoraux.
 */

const ETUDE_ROLES = ['notary', 'clerk', 'other'];
const ETUDE_UNDO_KEY = 'lcnda-compl-group-undo';

function etude_row(PDO $pdo, int $id): array
{
    $r = archive_service_row($pdo, $id);
    if (!$r || (string) $r['kind'] !== 'notary') { throw new RuntimeException('Étude de notaire introuvable.'); }
    return $r;
}
function etude_people(PDO $pdo, int $sid): array
{
    if (!compl_has($pdo, 'archive_service_people')) { return []; }
    $s = $pdo->prepare('SELECT * FROM archive_service_people WHERE service_id=? AND deleted_at IS NULL ORDER BY CASE role WHEN \'notary\' THEN 0 WHEN \'clerk\' THEN 1 ELSE 2 END, until<>\'\', position, id');
    $s->execute([$sid]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $pid = (int) $r['person_id'];
        $out[] = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'role' => (string) $r['role'], 'person_id' => $pid ?: null, 'phone' => (string) $r['phone'],
            'since' => (string) $r['since'], 'until' => (string) $r['until'], 'note' => (string) $r['note'], 'former' => (string) $r['until'] !== ''];
    }
    return $out;
}

/** ⏳ le délai constaté sur ces courriers : seulement ceux dont la date de réponse est notée (recu_le, ou « réponse reçue le » d'un recommandé). */
function etude_delay(array $rows, array $set): array
{
    $cut = $set['delay_scope'] === '3y' ? date('Y-m-d', strtotime('-3 years')) : '0000-00-00';
    $vals = [];
    foreach ($rows as $r) {
        $env = substr((string) ($r['date_envoi'] ?? ''), 0, 10);
        $rec = substr((string) (($r['recu_le'] ?? '') ?: ($r['reponse_le'] ?? '')), 0, 10);
        if (!compl_date_ok($env) || !compl_date_ok($rec) || $env < $cut) { continue; }
        $days = (int) round((strtotime($rec) - strtotime($env)) / 86400);
        if ($days >= 0) { $vals[] = $days; }
    }
    sort($vals);
    $n = count($vals);
    $enough = $n > 0 && $n >= (int) $set['delay_min'];
    $days = null;
    if ($enough && $set['delay_stat'] !== 'none') {
        $days = $set['delay_stat'] === 'median' ? ($n % 2 ? $vals[intdiv($n, 2)] : (int) round(($vals[$n / 2 - 1] + $vals[$n / 2]) / 2)) : (int) round(array_sum($vals) / $n);
    }
    return ['n' => $n, 'enough' => $enough, 'days' => $days, 'min' => $n ? $vals[0] : null, 'max' => $n ? $vals[$n - 1] : null, 'stat' => $set['delay_stat'], 'min_needed' => (int) $set['delay_min']];
}
/** Un courrier en attente : depuis combien de jours, et la pastille (jaune au-delà de l'habitude, rouge au-delà du double). */
function etude_waiting(array $r, array $delay): ?array
{
    if ((string) $r['statut'] === 'reponse_recue' || (string) ($r['recu_le'] ?? '') !== '' || !compl_date_ok(substr((string) $r['date_envoi'], 0, 10))) { return null; }
    $wait = (int) floor((strtotime(date('Y-m-d')) - strtotime(substr((string) $r['date_envoi'], 0, 10))) / 86400);
    if ($wait < 0) { return null; }
    $level = '';
    if ($delay['days'] !== null && $delay['days'] > 0) { $level = $wait > 2 * $delay['days'] ? 'red' : ($wait > $delay['days'] ? 'yellow' : ''); }
    return ['days' => $wait, 'level' => $level];
}
function etude_courriers(PDO $pdo, int $sid): array
{
    if (!compl_has($pdo, 'courriers', 'archive_service_id')) { return []; }
    $rep = compl_has($pdo, 'courriers', 'reponse_le') ? 'reponse_le' : "'' AS reponse_le";
    $case = compl_has($pdo, 'courriers', 'succ_case_id') ? 'succ_case_id' : 'NULL AS succ_case_id';
    $s = $pdo->prepare("SELECT id, objet, destinataire, date_envoi, statut, recu_le, $rep, $case FROM courriers WHERE archive_service_id=? ORDER BY date_envoi DESC, id DESC");
    $s->execute([$sid]);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}
function etude_cases(PDO $pdo, int $sid): array
{
    if (!compl_has($pdo, 'succ_cases', 'notary_service_id')) { return []; }
    $s = $pdo->prepare('SELECT id, number, title, state, notary_ref, notary_people_id, updated_at FROM succ_cases WHERE notary_service_id=? AND deleted_at IS NULL ORDER BY CASE WHEN state IN (\'clos\',\'archive\') THEN 1 ELSE 0 END, number DESC');
    $s->execute([$sid]);
    $people = [];
    foreach (etude_people($pdo, $sid) as $p) { $people[$p['id']] = $p['name']; }
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'number' => (string) $r['number'], 'title' => (string) $r['title'], 'state' => (string) $r['state'],
        'notary_ref' => (string) $r['notary_ref'], 'notary' => $people[(int) $r['notary_people_id']] ?? '', 'closed' => in_array((string) $r['state'], ['clos', 'archive'], true)], $s->fetchAll(PDO::FETCH_ASSOC));
}

/** GET compl&op=etudes : la liste des études (colonnes Notaires · Dossiers · Courriers · Répond en), et les notaires tapés sans fiche. */
function etudes_list(PDO $pdo): array
{
    $set = compl_settings($pdo);
    $kiosk = compl_kiosk();
    $out = [];
    if (archive_services_ready($pdo)) {
        foreach ($pdo->query("SELECT * FROM archive_services WHERE kind='notary' ORDER BY name COLLATE NOCASE, id")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $sid = (int) $r['id'];
            $row = archive_service_public($r) + ['people' => etude_people($pdo, $sid)];
            if (!$kiosk) {
                $cases = etude_cases($pdo, $sid);
                $cour = etude_courriers($pdo, $sid);
                $delay = etude_delay($cour, $set);
                $wait = array_values(array_filter(array_map(static fn($c) => etude_waiting($c, $delay), $cour)));
                $row += ['cases_open' => count(array_filter($cases, static fn($c) => !$c['closed'])), 'cases_closed' => count(array_filter($cases, static fn($c) => $c['closed'])),
                    'courriers' => count($cour), 'waiting' => count($wait), 'waiting_max' => $wait ? max(array_column($wait, 'days')) : 0, 'delay' => $delay];
            }
            $out[] = $row;
        }
    }
    return ['etudes' => $out, 'typed' => $kiosk ? [] : etudes_typed($pdo), 'settings' => $set, 'kiosk' => $kiosk];
}

/** Les notaires tapés à la main dans les dossiers, qui n'ont pas encore de fiche d'étude. */
function etudes_typed(PDO $pdo): array
{
    if (!compl_has($pdo, 'succ_cases', 'notary_service_id')) { return []; }
    $by = [];
    foreach ($pdo->query("SELECT id, number, notary_text, death_place_text FROM succ_cases WHERE deleted_at IS NULL AND notary_service_id IS NULL AND trim(notary_text)<>'' ORDER BY number")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $t = trim((string) $r['notary_text']);
        $by[$t] ??= ['text' => $t, 'cases' => []];
        $by[$t]['cases'][] = ['id' => (int) $r['id'], 'number' => (string) $r['number'], 'place' => (string) $r['death_place_text']];
    }
    return array_values($by);
}

/** GET compl&op=etude&id= : la fiche d'une étude (le service d'archives et ses rubriques : notaires, dossiers, courriers, délai). */
function etude_sheet(PDO $pdo, int $id): array
{
    $r = etude_row($pdo, $id);
    $set = compl_settings($pdo);
    $out = ['etude' => archive_service_public($r), 'people' => etude_people($pdo, $id), 'kiosk' => compl_kiosk(), 'settings' => $set];
    if (!compl_kiosk()) {
        $cases = etude_cases($pdo, $id);
        $cour = etude_courriers($pdo, $id);
        $delay = etude_delay($cour, $set);
        $names = [];
        foreach ($cases as $c) { $names[$c['id']] = $c['number']; }
        $out['cases'] = $cases;
        $out['delay'] = $delay;
        $out['courriers'] = array_map(static function ($c) use ($delay, $names, $pdo) {
            $cid = (int) $c['succ_case_id'];
            if ($cid && !isset($names[$cid])) { $s = $pdo->prepare('SELECT number FROM succ_cases WHERE id=?'); $s->execute([$cid]); $names[$cid] = (string) $s->fetchColumn(); }
            $rec = (string) ($c['recu_le'] ?: $c['reponse_le']);
            $d = compl_date_ok(substr((string) $c['date_envoi'], 0, 10)) && compl_date_ok(substr($rec, 0, 10)) ? (int) round((strtotime(substr($rec, 0, 10)) - strtotime(substr((string) $c['date_envoi'], 0, 10))) / 86400) : null;
            return ['id' => (int) $c['id'], 'objet' => (string) $c['objet'], 'date_envoi' => (string) $c['date_envoi'], 'statut' => (string) $c['statut'], 'recu_le' => $rec,
                'days' => $d, 'case_number' => $cid ? ($names[$cid] ?? '') : '', 'waiting' => etude_waiting($c, $delay)];
        }, $cour);
        // 📜 « Qui a vu quoi » : seulement si la fiche montre des dossiers
        if ($cases && function_exists('access_log_add')) { access_log_add($pdo, 'case_open', 'service', $id, function_exists('access_log_label') ? access_log_label((string) $r['name'], 80) : mb_substr((string) $r['name'], 0, 80), 'etude'); }
    }
    return $out;
}

/** ✎ un notaire, un clerc (rôle, fiche facultative, téléphone, depuis, jusqu'à). */
function etude_person_save(PDO $pdo, array $d): array
{
    $sid = safe_int($d['service_id'] ?? 0);
    etude_row($pdo, $sid);
    $id = safe_int($d['id'] ?? 0);
    $name = compl_txt($d['name'] ?? '', 160);
    $pid = safe_int($d['person_id'] ?? 0);
    if ($pid) { $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$pid]); $p = $s->fetch(PDO::FETCH_ASSOC); if (!$p) { throw new LcndaBadInput('Fiche introuvable.'); } if ($name === '') { $name = compl_person_name($p); } }
    if ($name === '') { throw new LcndaBadInput('Donne le nom du notaire ou du clerc.'); }
    $role = in_array($d['role'] ?? '', ETUDE_ROLES, true) ? $d['role'] : 'notary';
    $vals = ['name' => $name, 'role' => $role, 'person_id' => $pid ?: null, 'phone' => compl_txt($d['phone'] ?? '', 60), 'note' => compl_txt($d['note'] ?? '', 500)];
    foreach (['since', 'until'] as $k) { $v = compl_txt($d[$k] ?? '', 10); if ($v !== '' && !compl_date_ok($v)) { throw new LcndaBadInput('Date incorrecte.'); } $vals[$k] = $v; }
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM archive_service_people WHERE id=? AND service_id=? AND deleted_at IS NULL'); $s->execute([$id, $sid]);
        $old = $s->fetch(PDO::FETCH_ASSOC); if (!$old) { throw new RuntimeException('Notaire introuvable.'); }
        $pdo->prepare('UPDATE archive_service_people SET ' . implode(',', array_map(static fn($k) => "$k=?", array_keys($vals))) . ', updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...array_values($vals), $id]);
        return ['id' => $id, 'prev' => array_intersect_key($old, $vals)];
    }
    $pdo->prepare('INSERT INTO archive_service_people(service_id,' . implode(',', array_keys($vals)) . ') VALUES(?' . str_repeat(',?', count($vals)) . ')')->execute([$sid, ...array_values($vals)]);
    return ['id' => (int) $pdo->lastInsertId(), 'created' => true];
}
/** 🗑 retirer un notaire de la fiche (gardé : « ↶ Annuler » le remet) ; ses anciens dossiers gardent son nom. */
function etude_person_delete(PDO $pdo, array $d, bool $restore): array
{
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM archive_service_people WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC); if (!$r) { throw new RuntimeException('Notaire introuvable.'); }
    $pdo->prepare('UPDATE archive_service_people SET deleted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$restore ? null : date('Y-m-d H:i:s'), $id]);
    return ['id' => $id, 'name' => (string) $r['name']];
}

/** L'étude d'un dossier pour le tableau des dossiers : {id, name, notary} ou null (une autre généalogie sans la colonne : null). */
function etude_case_office(PDO $pdo, int $cid): ?array
{
    if (!compl_has($pdo, 'succ_cases', 'notary_service_id') || !compl_has($pdo, 'archive_service_people')) { return null; }
    $s = $pdo->prepare('SELECT a.id, a.name, (SELECT p.name FROM archive_service_people p WHERE p.id=c.notary_people_id) AS notary FROM succ_cases c JOIN archive_services a ON a.id=c.notary_service_id WHERE c.id=?');
    $s->execute([$cid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ? ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'notary' => (string) ($r['notary'] ?? '')] : null;
}
/** L'étude choisie dans un dossier (pour 📁 Dossier) : l'étude, ses notaires, le notaire chargé. */
function etude_case_info(PDO $pdo, int $caseId): array
{
    if (compl_kiosk()) { throw new RuntimeException('Mode consultation : les dossiers de succession ne se montrent pas.'); }
    $s = $pdo->prepare('SELECT id, number, notary_text, notary_service_id, notary_people_id FROM succ_cases WHERE id=? AND deleted_at IS NULL'); $s->execute([$caseId]);
    $c = $s->fetch(PDO::FETCH_ASSOC); if (!$c) { throw new RuntimeException('Dossier introuvable.'); }
    $sid = (int) $c['notary_service_id'];
    $svc = $sid ? archive_service_row($pdo, $sid) : null;
    return ['case_id' => (int) $c['id'], 'text' => (string) $c['notary_text'], 'etude' => $svc ? archive_service_picker_item($svc) : null,
        'people' => $svc ? etude_people($pdo, $sid) : [], 'people_id' => (int) $c['notary_people_id'] ?: null, 'settings' => compl_settings($pdo)];
}

/** 📁 Dossier → « Étude de notaire » : l'étude (ou un nom gardé en texte) et le notaire chargé ; ligne au 🕓 Journal ; rend l'état d'avant (↶). */
function etude_case_set(PDO $pdo, array $d): array
{
    if (!compl_has($pdo, 'succ_cases', 'notary_service_id')) { throw new RuntimeException('Ces outils ne sont pas encore prêts : relance l’app.'); }
    $cid = safe_int($d['case_id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM succ_cases WHERE id=? AND deleted_at IS NULL'); $s->execute([$cid]);
    $c = $s->fetch(PDO::FETCH_ASSOC); if (!$c) { throw new RuntimeException('Dossier introuvable.'); }
    if ((string) $c['state'] === 'archive') { throw new LcndaBadInput('Ce dossier est archivé : rouvre-le d’abord.'); }
    $prev = ['service_id' => (int) $c['notary_service_id'] ?: 0, 'people_id' => (int) $c['notary_people_id'] ?: 0, 'text' => (string) $c['notary_text']];
    $sid = safe_int($d['service_id'] ?? 0);
    $people = safe_int($d['people_id'] ?? 0);
    $text = array_key_exists('text', $d) ? compl_txt($d['text'], 200) : (string) $c['notary_text'];
    $svc = null;
    if ($sid) { $svc = etude_row($pdo, $sid); }
    if (!$sid || compl_settings($pdo)['notary_pick'] === 'office') { $people = 0; }
    if ($people) { $p = $pdo->prepare('SELECT name FROM archive_service_people WHERE id=? AND service_id=? AND deleted_at IS NULL'); $p->execute([$people, $sid]); $pname = $p->fetchColumn(); if ($pname === false) { throw new LcndaBadInput('Ce notaire n’est pas de cette étude.'); } }
    $pdo->prepare('UPDATE succ_cases SET notary_service_id=?, notary_people_id=?, notary_text=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$sid ?: null, $people ?: null, $text, $cid]);
    if (function_exists('succ_journal')) {
        $who = $svc ? (string) $svc['name'] . (!empty($pname) ? ' (' . $pname . ')' : '') : ($text !== '' ? '« ' . $text . ' » (' . 'nom gardé en texte' . ')' : '—');
        succ_journal($pdo, $cid, 'edit', (!empty($d['undo']) ? '↶ ' : '') . '🏛 Notaire du dossier : ' . $who);
    }
    return ['case_id' => $cid, 'prev' => $prev, 'etude' => $svc ? archive_service_picker_item($svc) : null];
}

/** ＋ Courrier à l'étude (Registre de courriers, organisme « notaire », relié à l'étude et, si choisi, à un dossier). */
function etude_courrier_save(PDO $pdo, array $d): array
{
    $sid = safe_int($d['service_id'] ?? 0); $svc = etude_row($pdo, $sid);
    $objet = compl_txt($d['objet'] ?? '', 300); if ($objet === '') { throw new LcndaBadInput('L’objet du courrier est obligatoire.'); }
    $env = compl_txt($d['date_envoi'] ?? '', 10); if ($env !== '' && !compl_date_ok($env)) { throw new LcndaBadInput('Date incorrecte.'); }
    $cid = safe_int($d['case_id'] ?? 0);
    if ($cid) { $s = $pdo->prepare('SELECT id FROM succ_cases WHERE id=? AND deleted_at IS NULL AND notary_service_id=?'); $s->execute([$cid, $sid]); if (!$s->fetchColumn()) { throw new LcndaBadInput('Ce dossier n’est pas relié à cette étude.'); } }
    $r = save_courrier($pdo, ['organisme' => 'notaire', 'destinataire' => (string) $svc['name'], 'objet' => $objet, 'date_envoi' => $env, 'statut' => 'en_attente', 'relance_delai_jours' => safe_int($d['relance'] ?? 30)]);
    $id = (int) $r['id'];
    $pdo->prepare('UPDATE courriers SET archive_service_id=? WHERE id=?')->execute([$sid, $id]);
    if ($cid && compl_has($pdo, 'courriers', 'succ_case_id')) {
        $pdo->prepare("UPDATE courriers SET succ_case_id=?, succ_kind='notaire' WHERE id=?")->execute([$cid, $id]);
        if (function_exists('succ_journal')) { succ_journal($pdo, $cid, 'courrier', '📮 Courrier à l’étude : ' . $objet); }
    }
    return ['id' => $id];
}
/** ✓ Réponse reçue (date du jour, modifiable) ou la date corrigée ; vide = remis « en attente ». Rend l'état d'avant (↶). */
function etude_courrier_recu(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT id, statut, recu_le, relance_date FROM courriers WHERE id=?'); $s->execute([$id]);
    $old = $s->fetch(PDO::FETCH_ASSOC); if (!$old) { throw new RuntimeException('Courrier introuvable.'); }
    $day = array_key_exists('recu_le', $d) ? compl_txt($d['recu_le'], 10) : date('Y-m-d');
    if ($day !== '' && !compl_date_ok($day)) { throw new LcndaBadInput('Date incorrecte.'); }
    if (!empty($d['undo']) && is_array($d['prev'] ?? null)) {
        $st = in_array($d['prev']['statut'] ?? '', ['envoye', 'en_attente', 'reponse_recue'], true) ? $d['prev']['statut'] : 'en_attente';
        $pdo->prepare('UPDATE courriers SET statut=?, recu_le=?, relance_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$st, compl_date_ok((string) ($d['prev']['recu_le'] ?? '')) ? $d['prev']['recu_le'] : '', compl_txt($d['prev']['relance_date'] ?? '', 10), $id]);
        return ['id' => $id];
    }
    if ($day === '') { $pdo->prepare("UPDATE courriers SET statut='en_attente', recu_le='', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$id]); }
    else { $pdo->prepare("UPDATE courriers SET statut='reponse_recue', recu_le=?, relance_date='', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$day, $id]); }
    log_change($pdo, 'courrier', $id, 'update', $day === '' ? 'Courrier : en attente' : 'Courrier : réponse reçue le ' . $day, $old, null);
    return ['id' => $id, 'prev' => $old, 'recu_le' => $day];
}

/* ═════════ 🗑 une étude supprimée : ses dossiers gardent son nom en texte (appelé par delete_archive_service / restore_archive_service) ═════════ */
function etude_on_delete(PDO $pdo, int $id, array $old): array
{
    $links = [];
    if ((string) ($old['kind'] ?? '') !== 'notary') { return $links; }
    if (compl_has($pdo, 'succ_cases', 'notary_service_id')) {
        $s = $pdo->prepare('SELECT id, notary_text, notary_people_id FROM succ_cases WHERE notary_service_id=?'); $s->execute([$id]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $links['succ_cases'][] = [(int) $c['id'], (string) $c['notary_text'], (int) $c['notary_people_id']];
            $pdo->prepare('UPDATE succ_cases SET notary_service_id=NULL, notary_people_id=NULL, notary_text=CASE WHEN trim(notary_text)=\'\' THEN ? ELSE notary_text END WHERE id=?')->execute([(string) $old['name'], (int) $c['id']]);
        }
    }
    if (compl_has($pdo, 'courriers', 'archive_service_id')) {
        $s = $pdo->prepare('SELECT id FROM courriers WHERE archive_service_id=?'); $s->execute([$id]);
        $links['courriers'] = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        $pdo->prepare('UPDATE courriers SET archive_service_id=NULL WHERE archive_service_id=?')->execute([$id]);
    }
    return $links;
}
function etude_on_restore(PDO $pdo, int $id, array $links): void
{
    foreach (array_slice(is_array($links['succ_cases'] ?? null) ? $links['succ_cases'] : [], 0, 5000) as $c) {
        if (!is_array($c) || count($c) < 2) { continue; }
        $pdo->prepare('UPDATE succ_cases SET notary_service_id=?, notary_people_id=?, notary_text=? WHERE id=? AND notary_service_id IS NULL')->execute([$id, ((int) ($c[2] ?? 0)) ?: null, (string) $c[1], (int) $c[0]]);
    }
    foreach (array_slice(is_array($links['courriers'] ?? null) ? $links['courriers'] : [], 0, 5000) as $k) {
        $pdo->prepare('UPDATE courriers SET archive_service_id=? WHERE id=? AND archive_service_id IS NULL')->execute([$id, (int) $k]);
    }
}

/* ═════════ 🧩 Regrouper les notaires tapés à la main (proposé, jamais automatique) ═════════ */
const ETUDE_STOP = ['me', 'mes', 'maitre', 'maitres', 'm', 'mm', 'mme', 'mlle', 'mr', 'scp', 'selarl', 'sas', 'sarl', 'snc', 'office', 'officenotarial', 'notarial', 'notariale',
    'etude', 'etudes', 'notaire', 'notaires', 'et', 'associe', 'associes', 'associees', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'cabinet', 'monsieur', 'madame', 'chez', 'a', 'au', 'aux'];
/** Les mots d'un nom tapé, sans titres ni petits mots ni initiales : « Maître Vialle, Tulle » → name [vialle], city tulle, initial ''. */
function etude_tokens(string $text): array
{
    $parts = preg_split('/\s*[,;\/]\s*/u', $text, 2) ?: [$text];
    $city = isset($parts[1]) ? compl_fold((string) preg_replace('/\(.*\)/u', '', $parts[1])) : '';
    $initial = preg_match('/(?:^|\s)(\p{Lu})\.(?:\s|$)/u', $parts[0], $m) ? compl_fold($m[1]) : '';
    $words = array_values(array_filter(explode(' ', compl_fold((string) $parts[0])), static fn($w) => strlen($w) >= 2 && !in_array($w, ETUDE_STOP, true)));
    return ['name' => $words, 'city' => $city, 'initial' => $initial];
}
/** Les noms de famille d'une étude : les mots en capitales de son nom et de ses notaires (« Étude VIALLE et associés » → vialle), sinon le dernier mot. */
function etude_family(array $svc, array $people): array
{
    $out = [];
    foreach ([(string) $svc['name'], (string) $svc['short_name'], ...array_map(static fn($p) => (string) $p['name'], $people)] as $n) {
        if (trim($n) === '') { continue; }
        $up = [];
        foreach (preg_split('/[\s,\-–]+/u', $n) ?: [] as $w) { if (mb_strlen($w) >= 2 && preg_match('/^\p{Lu}[\p{Lu}\'’]+$/u', $w)) { $up[] = compl_fold($w); } }
        if (!$up) { $ws = array_values(array_filter(explode(' ', compl_fold($n)), static fn($w) => strlen($w) >= 2 && !in_array($w, ETUDE_STOP, true))); if ($ws) { $up[] = end($ws); } }
        foreach ($up as $w) { if ($w !== '' && !in_array($w, ETUDE_STOP, true)) { $out[$w] = true; } }
    }
    return array_keys($out);
}
function etude_city_of(string $place): string { return compl_fold((string) preg_replace('/\(.*$|,.*$/u', '', $place)); }

/** GET compl&op=etudes_group : les propositions, rien n'est changé. */
function etudes_group_proposals(PDO $pdo): array
{
    if (compl_kiosk()) { throw new RuntimeException('Mode consultation : les dossiers de succession ne se montrent pas.'); }
    $set = compl_settings($pdo);
    $etudes = [];
    if (archive_services_ready($pdo)) {
        foreach ($pdo->query("SELECT * FROM archive_services WHERE kind='notary' ORDER BY name COLLATE NOCASE, id")->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $people = etude_people($pdo, (int) $r['id']);
            $notaries = array_values(array_filter($people, static fn($p) => $p['role'] === 'notary')); // un clerc ne donne pas son nom à l'étude
            $etudes[] = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'city' => compl_fold((string) $r['city']), 'family' => etude_family($r, $notaries),
                'initials' => array_values(array_unique(array_filter(array_map(static function ($p) { $w = explode(' ', compl_fold((string) preg_replace('/^(m(e|aitre)|mme|m)\.?\s+/iu', '', $p['name']))); return $w[0] !== '' ? $w[0][0] : ''; }, array_filter($people, static fn($p) => $p['role'] === 'notary')))))];
        }
    }
    $groups = []; $none = [];
    foreach (etudes_typed($pdo) as $t) {
        $tok = etude_tokens($t['text']);
        $matches = [];
        foreach ($etudes as $e) {
            if (!array_intersect($tok['name'], $e['family'])) { continue; }
            if ($tok['city'] !== '' && $e['city'] !== '' && $tok['city'] !== $e['city']) { continue; } // deux études du même nom dans deux villes ne sont jamais réunies
            $matches[] = $e;
        }
        $deadCity = etude_city_of((string) ($t['cases'][0]['place'] ?? ''));
        $cityOk = static fn($e) => $e['city'] !== '' && ($tok['city'] !== '' ? $tok['city'] === $e['city'] : $deadCity === $e['city']);
        if (count($matches) > 1) { $sameCity = array_values(array_filter($matches, $cityOk)); if ($sameCity) { $matches = $sameCity; } }
        if (!$matches) { $none[] = $t + ['key' => implode(' ', $tok['name'])]; continue; }
        $e = $matches[0];
        $unique = count($matches) === 1;
        $initialOk = $tok['initial'] !== '' && in_array($tok['initial'], $e['initials'], true);
        $why = [];
        $common = array_values(array_intersect($tok['name'], $e['family']));
        $why[] = ['k' => 'name', 'v' => mb_strtoupper($common[0] ?? '')];
        if ($cityOk($e)) { $why[] = ['k' => $tok['city'] !== '' ? 'city' : 'dead_city']; }
        if ($initialOk) { $why[] = ['k' => 'initial', 'v' => mb_strtoupper($tok['initial']) . '.']; }
        if ($unique && !$cityOk($e)) { $why[] = ['k' => 'unique']; }
        $checked = $set['group_check'] === 'agree' && $unique && ($cityOk($e) || $initialOk);
        $groups[$e['id']] ??= ['etude' => ['id' => $e['id'], 'name' => $e['name']], 'texts' => []];
        $groups[$e['id']]['texts'][] = ['text' => $t['text'], 'cases' => array_map(static fn($c) => ['id' => $c['id'], 'number' => $c['number']], $t['cases']), 'why' => $why, 'checked' => $checked, 'ambiguous' => !$unique];
    }
    // les sans proposition, réunis par le même nom
    $byKey = [];
    foreach ($none as $n) { $k = $n['key'] !== '' ? $n['key'] : compl_fold($n['text']); $byKey[$k] ??= ['texts' => []]; $byKey[$k]['texts'][] = ['text' => $n['text'], 'cases' => array_map(static fn($c) => ['id' => $c['id'], 'number' => $c['number']], $n['cases'])]; }
    // 📮 les courriers dont l'organisme ou le destinataire ressemble à une étude (décochés : pour le délai constaté)
    $courriers = [];
    if (compl_has($pdo, 'courriers', 'archive_service_id') && $etudes) {
        foreach ($pdo->query("SELECT id, organisme, destinataire, objet, date_envoi FROM courriers WHERE archive_service_id IS NULL ORDER BY date_envoi DESC, id DESC LIMIT 2000")->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $tok = etude_tokens((string) $c['destinataire']);
            if (!$tok['name']) { continue; }
            foreach ($etudes as $e) {
                if (!array_intersect($tok['name'], $e['family']) || ((string) $c['organisme'] !== 'notaire' && !preg_match('/\b(me|ma[iî]tre|notaire|[ée]tude|scp|office)\b/iu', (string) $c['destinataire']))) { continue; }
                if ($tok['city'] !== '' && $e['city'] !== '' && $tok['city'] !== $e['city']) { continue; }
                $courriers[] = ['id' => (int) $c['id'], 'destinataire' => (string) $c['destinataire'], 'objet' => (string) $c['objet'], 'date_envoi' => (string) $c['date_envoi'], 'etude' => ['id' => $e['id'], 'name' => $e['name']]];
                break;
            }
            if (count($courriers) >= 300) { break; }
        }
    }
    $nTexts = count(etudes_typed($pdo));
    return ['groups' => array_values($groups), 'none' => array_values($byKey), 'courriers' => $courriers, 'typed' => $nTexts, 'settings' => $set];
}

/** « Appliquer » : relie les dossiers cochés à leur étude (le nom tapé est gardé), crée les études demandées ; ↶ Annuler défait tout. */
function etudes_group_apply(PDO $pdo, array $d): array
{
    if (!compl_has($pdo, 'succ_cases', 'notary_service_id')) { throw new RuntimeException('Ces outils ne sont pas encore prêts : relance l’app.'); }
    $undo = ['at' => date('c'), 'cases' => [], 'courriers' => [], 'created' => []];
    $link = static function (int $cid, int $sid, string $name) use ($pdo, &$undo): bool {
        $s = $pdo->prepare('SELECT notary_service_id FROM succ_cases WHERE id=? AND deleted_at IS NULL'); $s->execute([$cid]);
        $cur = $s->fetch(PDO::FETCH_ASSOC);
        if (!$cur || $cur['notary_service_id'] !== null) { return false; }
        $pdo->prepare('UPDATE succ_cases SET notary_service_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$sid, $cid]);
        $undo['cases'][] = $cid;
        if (function_exists('succ_journal')) { succ_journal($pdo, $cid, 'edit', '🏛 Relié à l’étude « ' . $name . ' » (le nom tapé est gardé)'); }
        return true;
    };
    $nCases = 0;
    foreach (array_slice(is_array($d['links'] ?? null) ? $d['links'] : [], 0, 200) as $l) {
        if (!is_array($l)) { continue; }
        $svc = etude_row($pdo, safe_int($l['service_id'] ?? 0));
        foreach (compl_ids($l['case_ids'] ?? []) as $cid) { if ($link($cid, (int) $svc['id'], (string) $svc['name'])) { $nCases++; } }
    }
    foreach (array_slice(is_array($d['create'] ?? null) ? $d['create'] : [], 0, 100) as $c) {
        if (!is_array($c)) { continue; }
        $text = compl_txt($c['text'] ?? '', 200); if ($text === '') { continue; }
        $tok = etude_tokens($text);
        $svc = save_archive_service($pdo, ['name' => $text, 'kind' => 'notary', 'city' => $tok['city'] !== '' ? mb_convert_case(trim((string) (preg_split('/\s*[,;\/]\s*/u', $text, 2)[1] ?? '')), MB_CASE_TITLE) : '']);
        $undo['created'][] = (int) $svc['id'];
        foreach (compl_ids($c['case_ids'] ?? []) as $cid) { if ($link($cid, (int) $svc['id'], (string) $svc['name'])) { $nCases++; } }
    }
    foreach (array_slice(is_array($d['courriers'] ?? null) ? $d['courriers'] : [], 0, 500) as $k) {
        if (!is_array($k)) { continue; }
        $sid = (int) etude_row($pdo, safe_int($k['service_id'] ?? 0))['id'];
        $id = safe_int($k['id'] ?? 0);
        $s = $pdo->prepare('UPDATE courriers SET archive_service_id=? WHERE id=? AND archive_service_id IS NULL'); $s->execute([$sid, $id]);
        if ($s->rowCount()) { $undo['courriers'][] = $id; }
    }
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')->execute([ETUDE_UNDO_KEY, json_encode($undo)]);
    return ['cases' => $nCases, 'created' => count($undo['created']), 'courriers' => count($undo['courriers'])];
}
function etudes_group_undo(PDO $pdo): array
{
    $u = json_decode((string) ($pdo->query("SELECT value FROM app_settings WHERE key='" . ETUDE_UNDO_KEY . "'")->fetchColumn() ?: ''), true);
    if (!is_array($u)) { throw new RuntimeException('Rien à annuler.'); }
    foreach (compl_ids($u['cases'] ?? [], 5000) as $cid) {
        $pdo->prepare('UPDATE succ_cases SET notary_service_id=NULL, notary_people_id=NULL WHERE id=?')->execute([$cid]);
        if (function_exists('succ_journal')) { succ_journal($pdo, $cid, 'edit', '↶ Regroupement des notaires annulé'); }
    }
    foreach (compl_ids($u['courriers'] ?? [], 5000) as $k) { $pdo->prepare('UPDATE courriers SET archive_service_id=NULL WHERE id=?')->execute([$k]); }
    foreach (compl_ids($u['created'] ?? [], 500) as $sid) {
        $n = $pdo->prepare('SELECT (SELECT count(*) FROM succ_cases WHERE notary_service_id=?) + (SELECT count(*) FROM courriers WHERE archive_service_id=?)'); $n->execute([$sid, $sid]);
        if ((int) $n->fetchColumn() === 0) { $pdo->prepare("DELETE FROM archive_services WHERE id=? AND kind='notary'")->execute([$sid]); $pdo->prepare('DELETE FROM archive_service_people WHERE service_id=?')->execute([$sid]); }
    }
    $pdo->prepare('DELETE FROM app_settings WHERE key=?')->execute([ETUDE_UNDO_KEY]);
    return ['ok' => true];
}

/** 🔍 Menu de choix, sorte « archive_service » limitée aux études (filtre as_kind=notary) : les études, puis les noms déjà tapés (réglage). */
function etudes_picker(PDO $pdo, string $q, int $offset, int $limit): array
{
    $params = [];
    $where = picker_text_where(['a.name', 'a.short_name', 'a.aliases', 'a.city'], $q, $params);
    $n = compl_has($pdo, 'succ_cases', 'notary_service_id') ? "(SELECT count(*) FROM succ_cases c WHERE c.notary_service_id=a.id AND c.deleted_at IS NULL AND c.state NOT IN ('clos','archive'))" : '0';
    [$total, $rows] = picker_page($pdo, "SELECT a.*, {$n} AS n", "FROM archive_services a WHERE a.kind='notary' AND {$where}", 'a.name COLLATE NOCASE, a.id', $params, $offset, $limit);
    $items = array_map(static function ($r) {
        $it = archive_service_picker_item($r);
        $it['meta'] = implode(' · ', array_filter([trim((string) $r['city']), (int) $r['n'] ? i18n_t((int) $r['n'] > 1 ? '{n} dossiers en cours' : '{n} dossier en cours', ['n' => (int) $r['n']]) : '']));
        $it['icon'] = '⚖️'; $it['badge'] = '';
        return $it;
    }, $rows);
    $groups = [['kind' => 'archive_service', 'key' => 'etudes', 'label' => i18n_t('Études de notaire'), 'total' => $total, 'items' => $items]];
    if ($offset === 0 && !picker_ids() && compl_settings($pdo)['picker_typed'] === 'with' && !compl_kiosk()) {
        $f = compl_fold($q); $typed = [];
        foreach (etudes_typed($pdo) as $t) {
            if ($f !== '' && !str_contains(compl_fold($t['text']), $f)) { continue; }
            $typed[] = ['kind' => 'archive_service', 'id' => null, 'free' => true, 'title' => $t['text'], 'icon' => '✍️', 'group' => 'typed',
                'meta' => i18n_t('{cases} · pas encore de fiche', ['cases' => implode(', ', array_map(static fn($c) => $c['number'], array_slice($t['cases'], 0, 3)))])];
            if (count($typed) >= 8) { break; }
        }
        if ($typed) { $groups[] = ['kind' => 'archive_service', 'key' => 'typed', 'label' => i18n_t('Déjà tapé dans d’autres dossiers'), 'total' => count($typed), 'items' => $typed]; }
    }
    return ['groups' => $groups, 'more' => $offset + $limit < $total];
}
