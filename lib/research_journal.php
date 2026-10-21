<?php
declare(strict_types=1);

/**
 * 🗓 Journal des recherches : tout ce qui a été cherché, au même endroit, pour ne pas chercher deux fois au même endroit.
 * Rien n'est recopié : on relit les dépouillements (archive_digest_entries, avec leur « résultat » et leurs personnes
 * cherchées archive_digest_sought / relevées archive_digest_people), les cotes des visites faites (archive_visit_items
 * d'une feuille archive_visit_plans avec done_at), les pistes d'enquête (investigation_items), les communes cherchées
 * des battues (battue_search_items) et les demandes (archive_digest_requests).
 *
 *  - research_journal_data()   GET research_journal (&person_id=… pour le bloc « 🔍 Déjà cherché » de la fiche) ;
 *  - research_already_data()   GET research_already : « Déjà dans ton suivi » pendant la saisie (même cote, ou même
 *    service + commune + années qui se recoupent + type d'acte), avec gaps_norm / gaps_overlap de research_gaps.php ;
 *  - save_archive_visit_done() POST : « ✓ Fait le … » d'une feuille de mission (ou l'annuler) ;
 *  - archive_visit_item_make_digest() POST : crée le dépouillement d'une cote consultée et le relie.
 * Écrans : assets/js/heritage-journal.js (Recherche → 🗓 Journal des recherches, Listes → Archives et sources, bloc de fiche).
 */

/** Résultats simples d'une recherche (dépouillement, cote d'une visite). */
function journal_results(): array
{
    return ['found' => 'Trouvé', 'none' => 'Rien trouvé', 'partial' => 'En partie', 'not_consulted' => 'Pas consulté'];
}

/** Un résultat accepté pour un dépouillement ('' = pas encore dit) ; « Pas consulté » ne vaut que pour une visite. */
function journal_result_value(mixed $raw, bool $visit = false): string
{
    $v = safe_text($raw);
    if ($v === 'not_consulted' && !$visit) { return ''; }
    return isset(journal_results()[$v]) ? $v : '';
}

/** Une cote comparable : sans accents, sans espaces ni ponctuation (« 3 E 12/4 » = « 3E12-4 »). */
function journal_cote(string $s): string
{
    return (string) preg_replace('/[^a-z0-9]+/', '', gaps_norm($s));
}

/** Les années d'un texte (« 1823-1832 », « vers 1850 ») : [min, max] ou [null, null]. */
function journal_years(string $text): array
{
    if (!preg_match_all('/\b(1[5-9]\d\d|20\d\d)\b/', $text, $m)) { return [null, null]; }
    $ys = array_map('intval', $m[1]);
    return [min($ys), max($ys)];
}

function journal_has_table(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (!isset($cache[$table])) {
        $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
        $s->execute([$table]);
        $cache[$table] = (bool) $s->fetchColumn();
    }
    return $cache[$table];
}

function journal_has_column(PDO $pdo, string $table, string $col): bool
{
    static $cache = [];
    $k = $table . '.' . $col;
    if (!isset($cache[$k])) {
        $cache[$k] = false;
        try { foreach ($pdo->query('PRAGMA table_info(' . preg_replace('/\W/', '', $table) . ')') as $c) { if ($c['name'] === $col) { $cache[$k] = true; break; } } } catch (Throwable $_) {}
    }
    return $cache[$k];
}

/** Nom affiché d'une personne (Prénom NOM). */
function journal_person_title(array $p): string
{
    $t = trim(trim((string) ($p['first_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) ($p['last_name'] ?? ''))));
    return $t !== '' ? $t : 'Personne #' . (int) ($p['id'] ?? 0);
}

/** Titre d'un dépouillement : « Naissance · Tulle · 1823-1832 » ; sans type précis : la commune et la cote. */
function journal_digest_title(array $a, array $types, string $commune): string
{
    $type = (string) ($a['record_type'] ?? '');
    $label = $type !== '' && $type !== 'autre' ? ($types[$type] ?? ucfirst($type)) : '';
    $ref = trim((string) ($a['archive_reference'] ?? ''));
    $t = implode(' · ', array_filter([$label, $commune, trim((string) ($a['year_text'] ?? ''))]));
    if ($label === '' && $ref !== '') { $t = implode(' · ', array_filter(['Cote ' . $ref, $commune, trim((string) ($a['year_text'] ?? ''))])); }
    return $t !== '' ? $t : 'Dépouillement #' . (int) ($a['id'] ?? 0);
}

/** Les personnes cherchées et relevées de chaque dépouillement : [digest_id => [[id, title, gender, role], …]]. */
function journal_digest_people(PDO $pdo): array
{
    $out = [];
    if (journal_has_table($pdo, 'archive_digest_sought')) {
        foreach ($pdo->query("SELECT s.archive_digest_id AS d, p.id, p.first_name, p.last_name, p.gender FROM archive_digest_sought s JOIN persons p ON p.id=s.person_id ORDER BY s.rowid") as $r) {
            $out[(int) $r['d']][(int) $r['id']] = ['id' => (int) $r['id'], 'title' => journal_person_title($r), 'gender' => (string) $r['gender'], 'role' => 'sought'];
        }
    }
    foreach ($pdo->query("SELECT DISTINCT adp.archive_digest_id AS d, p.id, p.first_name, p.last_name, p.gender FROM archive_digest_people adp JOIN persons p ON p.id=adp.person_id") as $r) {
        $out[(int) $r['d']][(int) $r['id']] ??= ['id' => (int) $r['id'], 'title' => journal_person_title($r), 'gender' => (string) $r['gender'], 'role' => 'found'];
    }
    return array_map('array_values', $out);
}

/**
 * Le journal : une ligne par chose cherchée, du plus récent au plus ancien.
 * Ligne : {key, kind, id, title, cote, service, commune, years, record_type, record_label, result, result_label,
 *          status, status_label, date, date_label, note, people:[{id,title,gender,role}], open:{…}}
 */
function research_journal_data(PDO $pdo, array $q = []): array
{
    $personId = max(0, safe_int($q['person_id'] ?? 0));
    $limit = max(1, min(3000, safe_int($q['limit'] ?? 2000) ?: 2000));
    $results = journal_results();
    $types = function_exists('archive_digest_record_types') ? archive_digest_record_types() : [];
    $statuses = function_exists('archive_digest_statuses') ? archive_digest_statuses() : [];
    $rows = [];
    $digestPeople = journal_digest_people($pdo);
    $hasResult = journal_has_column($pdo, 'archive_digest_entries', 'result');

    // 📜 dépouillements
    $digests = [];
    foreach ($pdo->query("SELECT a.*, p.name AS place_name, p.county FROM archive_digest_entries a LEFT JOIN places p ON p.id=a.place_id") as $a) {
        $id = (int) $a['id'];
        $digests[$id] = $a;
        $result = $hasResult ? (string) ($a['result'] ?? '') : '';
        $commune = trim((string) ($a['place_name'] ?: $a['city_name'] ?: $a['city_alias']));
        $rows[] = [
            'key' => 'digest:' . $id, 'kind' => 'digest', 'id' => $id,
            'title' => journal_digest_title($a, $types, $commune),
            'cote' => trim((string) $a['archive_reference']), 'service' => trim((string) $a['archive_service']), 'commune' => $commune,
            'years' => trim((string) $a['year_text']), 'record_type' => (string) $a['record_type'], 'record_label' => $types[$a['record_type']] ?? '',
            'result' => $result, 'result_label' => $results[$result] ?? '',
            'status' => (string) $a['status'], 'status_label' => $statuses[$a['status']] ?? (string) $a['status'],
            'date' => (string) ($a['updated_at'] ?: $a['created_at']), 'date_label' => 'Modifié',
            'note' => trim((string) ($a['found'] !== '' ? $a['found'] : $a['searched'])),
            'exhaustive' => (int) ($a['is_exhaustive'] ?? 0),
            'people' => $digestPeople[$id] ?? [], 'open' => ['kind' => 'digest', 'id' => $id],
        ];
    }

    // 🗄️ cotes des visites faites
    if (journal_has_column($pdo, 'archive_visit_plans', 'done_at')) {
        $linkedPeople = [];
        foreach ([['archive_visit_investigations', 'investigation_id', "SELECT i.person_id AS pid FROM investigations i WHERE i.id=? UNION SELECT ip.person_id FROM investigation_persons ip WHERE ip.investigation_id=?"],
                  ['archive_visit_battues', 'battue_id', "SELECT bp.person_id AS pid FROM battue_persons bp WHERE bp.battue_id=?"]] as [$table, $col, $sql]) {
            if (!journal_has_table($pdo, $table)) { continue; }
            try {
                $who = $pdo->prepare($sql);
                $n = substr_count($sql, '?');
                foreach ($pdo->query("SELECT visit_id, {$col} AS x FROM {$table}") as $l) {
                    $who->execute(array_fill(0, $n, (int) $l['x']));
                    foreach ($who->fetchAll(PDO::FETCH_COLUMN) as $pid) { if ((int) $pid) { $linkedPeople[(int) $l['visit_id']][(int) $pid] = true; } }
                }
            } catch (Throwable $_) {}
        }
        $names = [];
        $nameOf = static function (int $pid) use ($pdo, &$names) {
            if (!isset($names[$pid])) { $s = $pdo->prepare('SELECT id, first_name, last_name, gender FROM persons WHERE id=?'); $s->execute([$pid]); $p = $s->fetch(); $names[$pid] = $p ? ['id' => $pid, 'title' => journal_person_title($p), 'gender' => (string) $p['gender'], 'role' => 'sought'] : null; }
            return $names[$pid];
        };
        $resCol = journal_has_column($pdo, 'archive_visit_items', 'result') ? 'i.result, i.result_note' : "'' AS result, '' AS result_note";
        foreach ($pdo->query("SELECT i.id, i.visit_id, i.archive_digest_id, i.archive_service, i.archive_reference, i.title, i.place_label, i.notes, i.checked, {$resCol},
                v.title AS visit_title, v.archive_center, v.done_at, v.visit_date
            FROM archive_visit_items i JOIN archive_visit_plans v ON v.id=i.visit_id WHERE COALESCE(v.done_at,'')<>''") as $i) {
            $did = (int) ($i['archive_digest_id'] ?? 0);
            $people = $did ? ($digestPeople[$did] ?? []) : [];
            $seen = array_column($people, 'id');
            foreach (array_keys($linkedPeople[(int) $i['visit_id']] ?? []) as $pid) { if (!in_array($pid, $seen, true) && ($p = $nameOf($pid))) { $people[] = $p; } }
            $d = $did ? ($digests[$did] ?? null) : null;
            $result = (string) $i['result'];
            $rows[] = [
                'key' => 'visit:' . (int) $i['id'], 'kind' => 'visit', 'id' => (int) $i['id'],
                'title' => trim((string) $i['title']) !== '' ? trim((string) $i['title']) : ('Cote ' . $i['archive_reference']),
                'cote' => trim((string) $i['archive_reference']), 'service' => trim((string) ($i['archive_service'] ?: $i['archive_center'])),
                'commune' => trim((string) ($i['place_label'] ?: ($d ? ($d['place_name'] ?: $d['city_name']) : ''))),
                'years' => $d ? trim((string) $d['year_text']) : '', 'record_type' => $d ? (string) $d['record_type'] : '', 'record_label' => $d ? ($types[$d['record_type']] ?? '') : '',
                'result' => $result, 'result_label' => $results[$result] ?? '',
                'status' => (int) $i['checked'] ? 'checked' : '', 'status_label' => trim((string) ($i['visit_title'] ?: $i['archive_center'])),
                'date' => (string) $i['done_at'], 'date_label' => 'Fait',
                'note' => trim((string) ($i['result_note'] !== '' ? $i['result_note'] : $i['notes'])),
                'people' => $people, 'open' => ['kind' => 'visit', 'id' => (int) $i['visit_id'], 'item' => (int) $i['id'], 'digest' => $did],
            ];
        }
    }

    // 🔍 pistes d'enquête (déjà explorées : pas celles « à explorer »)
    if (journal_has_table($pdo, 'investigation_items')) {
        $leadStatus = ['promising' => 'Prometteuse', 'explored' => 'Explorée', 'closed' => 'Close'];
        $invPeople = [];
        try {
            foreach ($pdo->query("SELECT i.id AS inv, p.id, p.first_name, p.last_name, p.gender FROM investigations i JOIN persons p ON p.id=i.person_id") as $r) { $invPeople[(int) $r['inv']][(int) $r['id']] = ['id' => (int) $r['id'], 'title' => journal_person_title($r), 'gender' => (string) $r['gender'], 'role' => 'sought']; }
            if (journal_has_table($pdo, 'investigation_persons')) {
                foreach ($pdo->query("SELECT ip.investigation_id AS inv, p.id, p.first_name, p.last_name, p.gender FROM investigation_persons ip JOIN persons p ON p.id=ip.person_id") as $r) { $invPeople[(int) $r['inv']][(int) $r['id']] ??= ['id' => (int) $r['id'], 'title' => journal_person_title($r), 'gender' => (string) $r['gender'], 'role' => 'sought']; }
            }
        } catch (Throwable $_) {}
        foreach ($pdo->query("SELECT ii.id, ii.investigation_id, ii.title, ii.notes, ii.status, ii.kind, ii.created_at, ii.archive_digest_id, inv.title AS inv_title
            FROM investigation_items ii JOIN investigations inv ON inv.id=ii.investigation_id WHERE ii.status NOT IN ('to_explore','to_explore_priority')") as $l) {
            $did = (int) ($l['archive_digest_id'] ?? 0); $d = $did ? ($digests[$did] ?? null) : null;
            $rows[] = [
                'key' => 'lead:' . (int) $l['id'], 'kind' => 'lead', 'id' => (int) $l['id'],
                'title' => trim((string) $l['title']) ?: 'Piste', 'cote' => $d ? trim((string) $d['archive_reference']) : '', 'service' => $d ? trim((string) $d['archive_service']) : '',
                'commune' => $d ? trim((string) ($d['place_name'] ?: $d['city_name'])) : '', 'years' => $d ? trim((string) $d['year_text']) : '',
                'record_type' => $d ? (string) $d['record_type'] : '', 'record_label' => $d ? ($types[$d['record_type']] ?? '') : '',
                'result' => $l['status'] === 'promising' ? 'partial' : '', 'result_label' => $l['status'] === 'promising' ? $results['partial'] : '',
                'status' => (string) $l['status'], 'status_label' => '« ' . trim((string) $l['inv_title']) . ' » · ' . ($leadStatus[$l['status']] ?? $l['status']),
                'date' => (string) $l['created_at'], 'date_label' => 'Ajoutée', 'note' => trim((string) $l['notes']),
                'people' => array_values($invPeople[(int) $l['investigation_id']] ?? []), 'open' => ['kind' => 'investigation', 'id' => (int) $l['investigation_id']],
            ];
        }
    }

    // 🧭 battues : les communes déjà cherchées
    if (journal_has_table($pdo, 'battue_search_items')) {
        $bStatus = function_exists('battue_search_statuses') ? battue_search_statuses() : [];
        $bTypes = function_exists('battue_target_types') ? battue_target_types() : [];
        $bRes = ['found' => 'found', 'not_found' => 'none', 'homonym_rejected' => 'none', 'nonexistent' => 'none', 'missing' => 'none', 'not_online' => 'none',
            'homonym_verify' => 'partial', 'doubt_review' => 'partial', 'incomplete' => 'partial'];
        $bPeople = [];
        try { foreach ($pdo->query("SELECT bp.battue_id AS b, p.id, p.first_name, p.last_name, p.gender FROM battue_persons bp JOIN persons p ON p.id=bp.person_id") as $r) { $bPeople[(int) $r['b']][] = ['id' => (int) $r['id'], 'title' => journal_person_title($r), 'gender' => (string) $r['gender'], 'role' => 'sought']; } } catch (Throwable $_) {}
        try {
            foreach ($pdo->query("SELECT si.*, b.title AS battue_title, c.name AS commune FROM battue_search_items si JOIN battues b ON b.id=si.battue_id LEFT JOIN commune_contours c ON c.insee_code=si.insee_code WHERE si.status<>'todo'") as $s) {
                $res = $bRes[$s['status']] ?? '';
                $rows[] = [
                    'key' => 'battue:' . (int) $s['id'], 'kind' => 'battue', 'id' => (int) $s['id'],
                    'title' => implode(' · ', array_filter([$bTypes[$s['record_type']] ?? '', trim((string) $s['commune']), trim((string) $s['period'])])) ?: 'Commune cherchée',
                    'cote' => trim((string) ($s['register'] ?? '')), 'service' => '', 'commune' => trim((string) $s['commune']), 'years' => trim((string) $s['period']),
                    'record_type' => (string) $s['record_type'], 'record_label' => $bTypes[$s['record_type']] ?? '',
                    'result' => $res, 'result_label' => $results[$res] ?? '',
                    'status' => (string) $s['status'], 'status_label' => '« ' . trim((string) $s['battue_title']) . ' » · ' . ($bStatus[$s['status']] ?? $s['status']),
                    'date' => (string) ($s['updated_at'] ?: $s['created_at']), 'date_label' => 'Modifié', 'note' => trim((string) $s['note']),
                    'people' => $bPeople[(int) $s['battue_id']] ?? [], 'open' => ['kind' => 'battue', 'id' => (int) $s['battue_id']],
                ];
            }
        } catch (Throwable $_) {}
    }

    // 📮 demandes (acte à commander, à consulter en salle…)
    if (journal_has_table($pdo, 'archive_digest_requests')) {
        $rTypes = function_exists('archive_digest_request_types') ? archive_digest_request_types() : [];
        $rStatus = function_exists('archive_digest_request_statuses') ? archive_digest_request_statuses() : [];
        foreach ($pdo->query("SELECT * FROM archive_digest_requests") as $r) {
            $did = (int) ($r['archive_digest_id'] ?? 0); $d = $did ? ($digests[$did] ?? null) : null;
            $rows[] = [
                'key' => 'request:' . (int) $r['id'], 'kind' => 'request', 'id' => (int) $r['id'],
                'title' => trim((string) $r['title']) ?: ($rTypes[$r['request_type']] ?? 'Demande'),
                'cote' => trim((string) ($r['archive_reference'] ?: ($d['archive_reference'] ?? ''))), 'service' => trim((string) ($r['archive_service'] ?: ($d['archive_service'] ?? ''))),
                'commune' => $d ? trim((string) ($d['place_name'] ?: $d['city_name'])) : '', 'years' => $d ? trim((string) $d['year_text']) : '',
                'record_type' => $d ? (string) $d['record_type'] : '', 'record_label' => $d ? ($types[$d['record_type']] ?? '') : '',
                'result' => $r['status'] === 'received' ? 'found' : '', 'result_label' => $r['status'] === 'received' ? $results['found'] : '',
                'status' => (string) $r['status'], 'status_label' => ($rTypes[$r['request_type']] ?? 'Demande') . ' · ' . ($rStatus[$r['status']] ?? $r['status']),
                'date' => (string) ($r['updated_at'] ?: $r['created_at']), 'date_label' => 'Modifié', 'note' => trim((string) $r['notes']),
                'people' => $did ? ($digestPeople[$did] ?? []) : [], 'open' => ['kind' => 'request', 'id' => (int) $r['id'], 'digest' => $did],
            ];
        }
    }

    if ($personId) { $rows = array_values(array_filter($rows, static fn($r) => in_array($personId, array_column($r['people'], 'id'), true))); }
    usort($rows, static fn($a, $b) => [$b['date'], $b['key']] <=> [$a['date'], $a['key']]);
    $total = count($rows);
    return ['rows' => array_slice($rows, 0, $limit), 'total' => $total, 'results' => $results,
        'kinds' => ['digest' => '📜 Dépouillements', 'visit' => '🗄️ Visites faites', 'lead' => '🔍 Pistes d’enquête', 'battue' => '🧭 Battues', 'request' => '📮 Demandes']];
}

/**
 * « Déjà dans ton suivi » : ce qui ressemble à ce qu'on est en train de saisir.
 * Même cote (même service si les deux sont donnés), ou même service + même commune + même type d'acte + années qui se recoupent.
 * $c : reference, service, city, place_id, year_text, record_type, exclude_kind (digest|visit|request), exclude_id.
 */
function research_already_data(PDO $pdo, array $c): array
{
    $cote = journal_cote(mb_substr(safe_text($c['reference'] ?? ''), 0, 200));
    $service = gaps_norm(mb_substr(safe_text($c['service'] ?? ''), 0, 200));
    $cityRaw = mb_substr(safe_text($c['city'] ?? ''), 0, 200);
    $city = gaps_norm($cityRaw);
    $placeId = max(0, safe_int($c['place_id'] ?? 0));
    $type = safe_text($c['record_type'] ?? '');
    [$from, $to] = journal_years(mb_substr(safe_text($c['year_text'] ?? ''), 0, 120));
    $exKind = safe_text($c['exclude_kind'] ?? ''); $exId = max(0, safe_int($c['exclude_id'] ?? 0));
    $linked = max(0, safe_int($c['linked_digest'] ?? 0)); // le dépouillement déjà relié à la cote ou à la demande : ce n'est pas un doublon
    if ($cote === '' && ($service === '' || ($city === '' && !$placeId))) { return ['matches' => []]; }
    $sameService = static fn(string $other): bool => $service === '' || trim($other) === '' || gaps_norm($other) === $service;
    $data = research_journal_data($pdo, ['limit' => 3000]);
    $matches = [];
    $digestRows = [];
    try { foreach ($pdo->query('SELECT id, place_id, city_name, record_type, year_text, archive_service, archive_reference FROM archive_digest_entries') as $r) { $digestRows[(int) $r['id']] = $r; } } catch (Throwable $_) {}
    foreach ($data['rows'] as $row) {
        if (!in_array($row['kind'], ['digest', 'visit', 'request'], true)) { continue; }
        if ($row['kind'] === $exKind && (int) $row['id'] === $exId) { continue; }
        if ($linked && $row['kind'] === 'digest' && (int) $row['id'] === $linked) { continue; }
        $why = '';
        if ($cote !== '' && $row['cote'] !== '' && journal_cote($row['cote']) === $cote && $sameService($row['service'])) { $why = 'cote'; }
        elseif ($row['kind'] === 'digest' && $service !== '' && $type !== '' && ($d = $digestRows[(int) $row['id']] ?? null)
            && gaps_norm((string) $d['archive_service']) === $service && gaps_digest_match($d, $type, $placeId, $cityRaw, $from, $to)) { $why = 'same'; }
        if ($why === '') { continue; }
        $matches[] = ['kind' => $row['kind'], 'id' => $row['id'], 'title' => $row['title'], 'cote' => $row['cote'], 'service' => $row['service'],
            'result' => $row['result'], 'result_label' => $row['result_label'], 'status_label' => $row['status_label'], 'date' => $row['date'], 'date_label' => $row['date_label'],
            'why' => $why, 'open' => $row['open']];
        if (count($matches) >= 8) { break; }
    }
    return ['matches' => $matches];
}

/** « ✓ Fait le … » d'une feuille de mission ; done_at vide = pas encore faite. */
function save_archive_visit_done(PDO $pdo, array $data): array
{
    $id = safe_int($data['visit_id'] ?? 0);
    $old = function_exists('archive_visit_plan_row') ? archive_visit_plan_row($pdo, $id) : null;
    if (!$old) { throw new RuntimeException('Feuille de mission introuvable.'); }
    $done = safe_text($data['done_at'] ?? '');
    if ($done !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $done)) { throw new RuntimeException('Date de visite invalide.'); }
    if ($done !== '') { [$y, $m, $d] = array_map('intval', explode('-', $done)); if (!checkdate($m, $d, $y) || $y < 1900 || $y > 2200) { throw new RuntimeException('Date de visite invalide.'); } }
    $pdo->prepare('UPDATE archive_visit_plans SET done_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$done, $id]);
    log_change($pdo, 'archive_visit_plan', $id, 'update', $done !== '' ? 'Visite faite le ' . $done . ' : ' . $old['title'] : 'Visite remise « à faire » : ' . $old['title'], $old, null);
    return ['id' => $id, 'done_at' => $done];
}

/** Crée le dépouillement d'une cote de visite (cote, service, commune, résultat, note) et le relie à la cote. */
function archive_visit_item_make_digest(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT i.*, v.archive_center, v.done_at FROM archive_visit_items i JOIN archive_visit_plans v ON v.id=i.visit_id WHERE i.id=?');
    $s->execute([$id]);
    $item = $s->fetch();
    if (!$item) { throw new RuntimeException('Cote de visite introuvable.'); }
    if ((int) ($item['archive_digest_id'] ?? 0)) { return ['id' => (int) $item['archive_digest_id'], 'existing' => true]; }
    $result = journal_result_value($item['result'] ?? '');
    $digest = save_archive_digest($pdo, [
        'city_name' => (string) $item['place_label'], 'archive_service' => (string) ($item['archive_service'] ?: $item['archive_center']),
        'archive_reference' => (string) $item['archive_reference'], 'record_type' => 'autre', 'status' => in_array($result, ['found', 'none'], true) ? 'done' : 'todo',
        'searched' => (string) $item['title'], 'found' => (string) ($item['result_note'] ?? ''), 'notes' => (string) $item['notes'], 'result' => $result,
    ]);
    $pdo->prepare('UPDATE archive_visit_items SET archive_digest_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$digest['id'], $id]);
    return ['id' => (int) $digest['id'], 'existing' => false];
}

/** Les personnes cherchées d'un dépouillement (ids valides seulement), remplacées d'un coup. */
function archive_digest_set_sought(PDO $pdo, int $digestId, mixed $raw): array
{
    $list = is_array($raw) ? $raw : explode(',', scalar_text($raw));
    $ids = array_slice(array_values(array_unique(array_filter(array_map(static fn($v) => safe_int(is_string($v) ? trim($v) : $v), $list), static fn(int $v): bool => $v > 0))), 0, 200);
    $check = $pdo->prepare('SELECT 1 FROM persons WHERE id=?');
    $ids = array_values(array_filter($ids, static function (int $pid) use ($check) { $check->execute([$pid]); return (bool) $check->fetchColumn(); }));
    $pdo->prepare('DELETE FROM archive_digest_sought WHERE archive_digest_id=?')->execute([$digestId]);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO archive_digest_sought(archive_digest_id, person_id) VALUES(?,?)');
    foreach ($ids as $pid) { $ins->execute([$digestId, $pid]); }
    return $ids;
}
