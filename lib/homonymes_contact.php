<?php
declare(strict_types=1);

/**
 * B ⚠️ Homonyme avant de contacter un héritier (maquette docs/design/complements-existants.html, partie B).
 * Juste avant un courrier, un appel ou un questionnaire : une autre fiche de la base porte-t-elle le même nom de naissance et le
 * même premier prénom (même pliage que succ_fold_name() : sans accents, tirets, « Jean-Pierre » = « Jean Pierre »), avec une
 * naissance proche (2 ans, réglage) et un lieu compatible (même département ou inconnu, réglage) ? C'est succ_homonyms() élargi
 * à toute la base (réglage : ou seulement les autres dossiers, comme avant). Lecture seule, jamais bloquant.
 *  - « ✕ Ce n'est pas la même personne » : succ_homonym_no (même paire, même effet partout) + une exception « dup:a:b » au
 *    ✅ Contrôle de la base (dismissed_issues), ligne au 🕓 Journal, ↶ Annuler ;
 *  - « ✓ C'est bien lui » : ligne au Journal ; l'alerte revient au prochain contact (réglage : ou plus dans ce dossier).
 * Fiches fusionnées ou supprimées : elles n'existent plus, jamais proposées. Fiche confidentielle : citée par son numéro seulement.
 * Une piste INSEE n'est pas un homonyme de la base : elle reste dans ⚰️ Vérifier les décès. Rien en mode consultation.
 */

function hom_fold(string $s): string { return function_exists('succ_fold_name') ? succ_fold_name($s) : trim((string) preg_replace('/[^a-z]+/', ' ', strtolower(function_exists('ascii_fold') ? ascii_fold($s) : $s))); }
function hom_first(string $first): string { $w = explode(' ', hom_fold($first)); return $w[0] ?? ''; }
/** Le département d'un lieu : « Tulle (19) » → 19 ; sinon le département écrit sur le lieu (county). */
function hom_dept(string $place, string $county = ''): string
{
    if (preg_match('/\((\d{2,3}|2[AB])\)/u', $place, $m)) { return $m[1]; }
    if (preg_match('/,\s*(\d{2,3}|2[AB])\b/u', $place, $m)) { return $m[1]; }
    return compl_fold($county);
}
function hom_commune(string $place): string { return compl_fold((string) preg_replace('/\(.*$|,.*$/u', '', $place)); }

/** Les fiches, avec leur naissance (année, date, lieu), leurs parents, leur adresse (Répertoire des vivants) et leurs dossiers. */
function hom_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, p.living_status, p.is_private, p.created_at,
                (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY t.gedcom_tag<>'BIRT', e.id LIMIT 1) AS by,
                (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY t.gedcom_tag<>'BIRT', e.id LIMIT 1) AS bd,
                (SELECT pl.name FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY t.gedcom_tag<>'BIRT', e.id LIMIT 1) AS bp,
                (SELECT pl.county FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY t.gedcom_tag<>'BIRT', e.id LIMIT 1) AS bc
                FROM persons p WHERE p.id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $out[(int) $p['id']] = ['id' => (int) $p['id'], 'name' => compl_person_name($p), 'first' => (string) $p['first_name'], 'last' => (string) $p['last_name'], 'gender' => (string) $p['gender'],
                'living' => (string) $p['living_status'] === 'living', 'private' => (int) $p['is_private'] === 1, 'added' => substr((string) $p['created_at'], 0, 10),
                'year' => $p['by'] === null ? null : (int) $p['by'], 'birth' => (string) $p['bd'], 'place' => (string) $p['bp'], 'dept' => hom_dept((string) $p['bp'], (string) $p['bc']), 'commune' => hom_commune((string) $p['bp'])];
        }
    }
    return $out;
}
function hom_parents(PDO $pdo, int $pid): string
{
    $s = $pdo->prepare('SELECT p1.first_name AS f1, p1.last_name AS l1, p2.first_name AS f2, p2.last_name AS l2 FROM family_children fc JOIN families f ON f.id=fc.family_id LEFT JOIN persons p1 ON p1.id=f.partner1_id LEFT JOIN persons p2 ON p2.id=f.partner2_id WHERE fc.child_id=? LIMIT 1');
    $s->execute([$pid]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { return ''; }
    return implode(' × ', array_filter([compl_person_name(['first_name' => $r['f1'], 'last_name' => $r['l1']]), compl_person_name(['first_name' => $r['f2'], 'last_name' => $r['l2']])]));
}
function hom_city(PDO $pdo, int $pid): string
{
    try { $s = $pdo->prepare("SELECT city FROM living_contacts WHERE person_id=? AND trim(city)<>'' ORDER BY updated_at DESC, id DESC LIMIT 1"); $s->execute([$pid]); return (string) ($s->fetchColumn() ?: ''); } catch (Throwable $_) { return ''; }
}
function hom_cases_of(PDO $pdo, int $pid): array
{
    if (!compl_has($pdo, 'succ_case_persons')) { return []; }
    $s = $pdo->prepare('SELECT c.id, c.number FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id WHERE cp.person_id=? AND cp.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.number');
    $s->execute([$pid]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'number' => (string) $r['number']], $s->fetchAll(PDO::FETCH_ASSOC));
}
/** Les fiches de même nom de famille (un index sur le nom : rfr_names, et le nom écrit tel quel), puis le pliage exact en PHP. */
function hom_candidates(PDO $pdo, string $last): array
{
    $ids = [];
    $s = $pdo->prepare('SELECT id FROM persons WHERE last_name=? COLLATE NOCASE LIMIT 2000'); $s->execute([$last]);
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) { $ids[(int) $id] = true; }
    $key = hom_fold($last);
    if ($key !== '' && compl_has($pdo, 'rfr_names')) {
        try { $s = $pdo->prepare('SELECT DISTINCT person_id FROM rfr_names WHERE src=0 AND last_keys LIKE ? LIMIT 2000'); $s->execute(['% ' . $key . ' %']); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) { $ids[(int) $id] = true; } } catch (Throwable $_) {}
    }
    return array_keys($ids);
}

/** GET compl&op=homonym_check&case_id=&person_ids=&where=letter|call|questionnaire|serial */
function homonym_check(PDO $pdo, int $caseId, array $personIds, string $where): array
{
    if (compl_kiosk()) { throw new RuntimeException('Mode consultation : les dossiers de succession ne se montrent pas.'); }
    $set = compl_settings($pdo);
    $s = $pdo->prepare('SELECT id, options_json FROM succ_cases WHERE id=? AND deleted_at IS NULL'); $s->execute([$caseId]);
    $case = $s->fetch(PDO::FETCH_ASSOC); if (!$case) { throw new RuntimeException('Dossier introuvable.'); }
    if ($set['hom_when'] === 'never' || !$personIds) { return ['items' => [], 'settings' => $set]; }
    $opts = json_decode((string) $case['options_json'], true); $okPairs = is_array($opts['homonym_ok'] ?? null) ? $opts['homonym_ok'] : [];
    $inCase = [];
    if (compl_has($pdo, 'succ_case_persons')) { $q = $pdo->prepare('SELECT person_id FROM succ_case_persons WHERE case_id=? AND deleted_at IS NULL'); $q->execute([$caseId]); foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $x) { $inCase[(int) $x] = true; } }
    $no = [];
    if (compl_has($pdo, 'succ_homonym_no')) { foreach ($pdo->query('SELECT a, b FROM succ_homonym_no') as $r) { $no[(int) $r['a'] . ':' . (int) $r['b']] = true; } }
    $otherCases = [];
    if ($set['hom_scope'] === 'cases' && compl_has($pdo, 'succ_case_persons')) {
        $q = $pdo->prepare('SELECT DISTINCT cp.person_id FROM succ_case_persons cp JOIN succ_cases c ON c.id=cp.case_id WHERE cp.case_id<>? AND cp.deleted_at IS NULL AND c.deleted_at IS NULL'); $q->execute([$caseId]);
        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $x) { $otherCases[(int) $x] = true; }
    }
    $me = hom_people($pdo, $personIds);
    $items = [];
    foreach ($personIds as $pid) {
        $m = $me[$pid] ?? null; if (!$m || hom_fold($m['last']) === '' || hom_first($m['first']) === '') { continue; }
        if ($set['hom_when'] === 'first' && hom_already_contacted($pdo, $caseId, $pid)) { continue; }
        $cand = array_values(array_filter(hom_candidates($pdo, $m['last']), static fn($o) => $o !== $pid && !isset($inCase[$o]) && !isset($no[min($pid, $o) . ':' . max($pid, $o)]) && ($set['hom_scope'] !== 'cases' || isset($otherCases[$o]))));
        if ($set['hom_after_ok'] === 'case' && is_array($okPairs[(string) $pid] ?? null)) { $cand = array_values(array_diff($cand, array_map('intval', $okPairs[(string) $pid]))); }
        if (!$cand) { continue; }
        $others = [];
        foreach (hom_people($pdo, $cand) as $o) {
            if (hom_fold($o['last']) !== hom_fold($m['last']) || hom_first($o['first']) !== hom_first($m['first'])) { continue; }
            $dy = $m['year'] !== null && $o['year'] !== null ? abs($m['year'] - $o['year']) : null;
            if ($dy !== null && $dy > (int) $set['hom_years']) { continue; }
            if ($set['hom_place'] === 'dept' && $m['dept'] !== '' && $o['dept'] !== '' && $m['dept'] !== $o['dept']) { continue; }
            if ($set['hom_place'] === 'commune' && $m['commune'] !== '' && $o['commune'] !== '' && $m['commune'] !== $o['commune']) { continue; }
            $others[] = ['id' => $o['id'], 'private' => $o['private'], 'unknown_date' => $dy === null, 'dy' => $dy, 'gender' => $o['private'] ? '' : $o['gender'],
                'name' => $o['private'] ? '' : $o['name'], 'year' => $o['private'] ? null : $o['year'], 'birth' => $o['private'] ? '' : $o['birth'], 'place' => $o['private'] ? '' : $o['place'],
                'same_dept' => $m['dept'] !== '' && $m['dept'] === $o['dept'], 'same_commune' => $m['commune'] !== '' && $m['commune'] === $o['commune'],
                'parents' => $o['private'] ? '' : hom_parents($pdo, $o['id']), 'city' => $o['private'] ? '' : hom_city($pdo, $o['id']), 'cases' => hom_cases_of($pdo, $o['id']), 'added' => $o['private'] ? '' : $o['added'],
                '_score' => ($dy ?? 3) * 2 + ($m['commune'] !== '' && $m['commune'] === $o['commune'] ? 0 : 1)];
        }
        if (!$others) { continue; }
        usort($others, static fn($a, $b) => $a['_score'] <=> $b['_score'] ?: $a['id'] <=> $b['id']);
        foreach ($others as &$o) { unset($o['_score']); } unset($o);
        $items[] = ['person' => ['id' => $m['id'], 'name' => $m['name'], 'gender' => $m['gender'], 'year' => $m['year'], 'birth' => $m['birth'], 'place' => $m['place'], 'parents' => hom_parents($pdo, $m['id']), 'city' => hom_city($pdo, $m['id'])], 'others' => $others];
    }
    return ['items' => $items, 'settings' => $set, 'where' => $where];
}
function hom_already_contacted(PDO $pdo, int $caseId, int $pid): bool
{
    try { $s = $pdo->prepare("SELECT 1 FROM courriers WHERE succ_case_id=? AND person_id=? AND COALESCE(succ_kind,'')<>'acte' LIMIT 1"); $s->execute([$caseId, $pid]); if ($s->fetchColumn()) { return true; } } catch (Throwable $_) {}
    try { $s = $pdo->prepare('SELECT 1 FROM succ_calls WHERE case_id=? AND person_id=? AND deleted_at IS NULL LIMIT 1'); $s->execute([$caseId, $pid]); if ($s->fetchColumn()) { return true; } } catch (Throwable $_) {}
    return false;
}
function hom_case(PDO $pdo, int $caseId): array
{
    $s = $pdo->prepare('SELECT * FROM succ_cases WHERE id=? AND deleted_at IS NULL'); $s->execute([$caseId]);
    $c = $s->fetch(PDO::FETCH_ASSOC); if (!$c) { throw new RuntimeException('Dossier introuvable.'); }
    return $c;
}
function hom_pair(PDO $pdo, array $d): array
{
    $a = safe_int($d['person_id'] ?? $d['a'] ?? 0); $b = safe_int($d['other_id'] ?? $d['b'] ?? 0);
    if ($a <= 0 || $b <= 0 || $a === $b) { throw new LcndaBadInput('Fiches inconnues.'); }
    $s = $pdo->prepare('SELECT count(*) FROM persons WHERE id IN (?,?)'); $s->execute([$a, $b]);
    if ((int) $s->fetchColumn() !== 2) { throw new LcndaBadInput('Fiches inconnues.'); }
    return [$a, $b];
}
/** « ✓ C'est bien lui que je contacte » : ligne au Journal (et, réglage, plus d'alerte pour eux deux dans ce dossier). */
function homonym_ok(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); $c = hom_case($pdo, $cid);
    [$a, $b] = hom_pair($pdo, $d);
    if (compl_settings($pdo)['hom_after_ok'] === 'case') {
        $o = json_decode((string) $c['options_json'], true); $o = is_array($o) ? $o : [];
        $list = is_array($o['homonym_ok'][(string) $a] ?? null) ? $o['homonym_ok'][(string) $a] : [];
        if (!in_array($b, $list, true)) { $list[] = $b; }
        $o['homonym_ok'][(string) $a] = array_slice($list, -50);
        $pdo->prepare('UPDATE succ_cases SET options_json=? WHERE id=?')->execute([json_encode($o, JSON_UNESCAPED_UNICODE), $cid]);
    }
    if (function_exists('succ_journal')) { succ_journal($pdo, $cid, 'note', 'Homonyme vu avant le contact (fiche n° ' . $b . '), destinataire confirmé'); }
    return ['ok' => true];
}
/** « ✕ Ce n'est pas la même personne » : retenu partout (succ_homonym_no), donné au Contrôle comme exception du doublon. */
function homonym_no(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); hom_case($pdo, $cid);
    [$a, $b] = hom_pair($pdo, $d);
    $lo = min($a, $b); $hi = max($a, $b);
    $s = $pdo->prepare('SELECT 1 FROM succ_homonym_no WHERE a=? AND b=?'); $s->execute([$lo, $hi]); $had = (bool) $s->fetchColumn();
    $pdo->prepare('INSERT OR IGNORE INTO succ_homonym_no(a, b) VALUES(?,?)')->execute([$lo, $hi]);
    $dis = false;
    if (compl_has($pdo, 'dismissed_issues')) {
        $s = $pdo->prepare('SELECT 1 FROM dismissed_issues WHERE issue_key=?'); $s->execute(["dup:$lo:$hi"]);
        if (!$s->fetchColumn()) {
            $cols = compl_has($pdo, 'dismissed_issues', 'kind') ? '(issue_key, reason, kind, people)' : '(issue_key, reason)';
            $vals = compl_has($pdo, 'dismissed_issues', 'kind') ? ["dup:$lo:$hi", 'Pas la même personne (homonyme vu avant un contact)', 'doublons', "$lo,$hi"] : ["dup:$lo:$hi", 'Pas la même personne (homonyme vu avant un contact)'];
            $pdo->prepare("INSERT INTO dismissed_issues $cols VALUES(" . implode(',', array_fill(0, count($vals), '?')) . ')')->execute($vals);
            $dis = true;
        }
    }
    if (function_exists('succ_journal')) { succ_journal($pdo, $cid, 'note', 'Homonyme : les fiches n° ' . $a . ' et n° ' . $b . ' sont deux personnes (retenu)'); }
    return ['a' => $lo, 'b' => $hi, 'had' => $had, 'dismissed' => $dis];
}
function homonym_no_undo(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); hom_case($pdo, $cid);
    [$a, $b] = hom_pair($pdo, $d);
    $lo = min($a, $b); $hi = max($a, $b);
    if (empty($d['had'])) { $pdo->prepare('DELETE FROM succ_homonym_no WHERE a=? AND b=?')->execute([$lo, $hi]); }
    if (!empty($d['dismissed']) && compl_has($pdo, 'dismissed_issues')) { $pdo->prepare('DELETE FROM dismissed_issues WHERE issue_key=?')->execute(["dup:$lo:$hi"]); }
    if (function_exists('succ_journal')) { succ_journal($pdo, $cid, 'note', '↶ Homonyme : « pas la même personne » annulé (fiches n° ' . $a . ' et n° ' . $b . ')'); }
    return ['ok' => true];
}
