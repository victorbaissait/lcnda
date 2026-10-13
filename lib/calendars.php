<?php
declare(strict_types=1);

/*
 * 📅 Calendriers (onglet Listes ; écran : assets/js/heritage-calendars.js)
 *  - « Calendrier de la famille » : les événements des fiches (naissances, mariages, décès…), placés au jour, au mois ou à
 *    l'année selon ce que dit la date ; le grégorien sert de repère, les autres calendriers sont calculés par l'écran.
 *  - « Mon agenda » : ce que j'ai prévu (salons, visites d'archives, rappels, courriers, circuits, tâches de l'Atelier…),
 *    rassemblé depuis les listes ; une création est rangée dans la bonne liste.
 */

const CAL_MONTHS = ['janvier' => 1, 'janv' => 1, 'fevrier' => 2, 'février' => 2, 'fevr' => 2, 'févr' => 2, 'mars' => 3, 'avril' => 4, 'avr' => 4, 'mai' => 5, 'juin' => 6,
    'juillet' => 7, 'juil' => 7, 'aout' => 8, 'août' => 8, 'septembre' => 9, 'sept' => 9, 'octobre' => 10, 'oct' => 10, 'novembre' => 11, 'nov' => 11, 'decembre' => 12, 'décembre' => 12, 'dec' => 12, 'déc' => 12,
    'jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6, 'jul' => 7, 'aug' => 8, 'sep' => 9];

/**
 * Lit une date de fiche : [année, mois|null, jour|null, approximative]. Comprend « 3 juillet 1832 », « 1er mars 1790 », « 03/07/1832 »,
 * « 1832-07-03 », « juillet 1832 », « 07/1832 », « 1832 », « vers 1850 », « ABT 1850 », « 3 JUL 1832 » (GEDCOM).
 */
function cal_parse_date(string $text): ?array
{
    $t = mb_strtolower(trim($text));
    if ($t === '') { return null; }
    $approx = (bool) preg_match('/\b(vers|env\.?|environ|abt|about|est|cal|circa|ca\.?|avant|apr[eè]s|bef|aft|entre|bet|probablement|\?)\b|~|\?/u', $t);
    $t = trim(preg_replace('/^(le|vers|env\.?|environ|abt|about|est|cal|circa|ca\.?|avant|après|apres|bef|aft|entre|bet|probablement|from|de|du)\s+/u', '', $t));
    if (preg_match('/(\d{4})-(\d{2})-(\d{2})/', $t, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) { return [(int) $m[1], (int) $m[2], (int) $m[3], $approx]; }
    if (preg_match('#(\d{1,2})[/.](\d{1,2})[/.](\d{4})#', $t, $m) && checkdate((int) $m[2], (int) $m[1], (int) $m[3])) { return [(int) $m[3], (int) $m[2], (int) $m[1], $approx]; }
    if (preg_match('/(\d{1,2})(?:er|e|ème)?\s+([a-zéûè]+)\.?\s+(\d{3,4})/u', $t, $m)) {
        $mo = CAL_MONTHS[$m[2]] ?? null;
        if ($mo && checkdate($mo, (int) $m[1], (int) $m[3])) { return [(int) $m[3], $mo, (int) $m[1], $approx]; }
    }
    if (preg_match('/\b([a-zéûè]+)\.?\s+(\d{3,4})\b/u', $t, $m) && isset(CAL_MONTHS[$m[1]])) { return [(int) $m[2], CAL_MONTHS[$m[1]], null, $approx]; }
    if (preg_match('#\b(\d{1,2})/(\d{4})\b#', $t, $m) && (int) $m[1] >= 1 && (int) $m[1] <= 12) { return [(int) $m[2], (int) $m[1], null, $approx]; }
    if (preg_match('/\b(\d{3,4})\b/', $t, $m)) { return [(int) $m[1], null, null, $approx]; }
    return null;
}

/** Les événements des fiches, avec leur date lue (au jour, au mois ou à l'année). */
function genea_calendar_events(PDO $pdo, array $q = []): array
{
    $person = safe_int($q['person_id'] ?? 0);
    $where = 'WHERE 1=1'; // les événements sans date sont comptés à part
    $args = [];
    if ($person) {
        $where .= ' AND (e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))';
        array_push($args, $person, $person, $person);
    }
    $s = $pdo->prepare("SELECT e.id, e.person_id, e.family_id, e.date_text, e.date_calendar, e.date_converted, e.year, e.title,
            t.label AS type_label, t.gedcom_tag AS tag, t.color AS type_color, pl.name AS place,
            f.partner1_id, f.partner2_id
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        $where ORDER BY e.year, e.id");
    $s->execute($args);
    $rows = $s->fetchAll();
    $ids = [];
    foreach ($rows as $r) { foreach (['person_id', 'partner1_id', 'partner2_id'] as $k) { if ($r[$k]) { $ids[(int) $r[$k]] = true; } } }
    $names = [];
    if ($ids) {
        foreach ($pdo->query('SELECT id, first_name, last_name, gender FROM persons WHERE id IN (' . implode(',', array_keys($ids)) . ')') as $p) {
            $names[(int) $p['id']] = ['name' => trim($p['first_name'] . ' ' . $p['last_name']) ?: 'Sans nom', 'gender' => $p['gender']];
        }
    }
    $out = []; $undated = 0;
    foreach ($rows as $r) {
        // Une date d'un autre calendrier (julien, républicain…) a souvent sa conversion grégorienne : c'est elle qui place l'événement
        $d = ($r['date_calendar'] ?? 'gregorian') !== 'gregorian' && trim((string) $r['date_converted']) !== '' ? cal_parse_date((string) $r['date_converted']) : null;
        $d ??= cal_parse_date((string) $r['date_text']);
        if (!$d && $r['year']) { $d = [(int) $r['year'], null, null, true]; }
        if (!$d || $d[0] < 1 || $d[0] > 9999) { $undated++; continue; }
        $who = [];
        foreach (['person_id', 'partner1_id', 'partner2_id'] as $k) { $pid = (int) ($r[$k] ?? 0); if ($pid && isset($names[$pid])) { $who[] = ['id' => $pid, 'name' => $names[$pid]['name'], 'gender' => $names[$pid]['gender']]; } }
        $tag = strtoupper((string) $r['tag']);
        $out[] = ['id' => (int) $r['id'], 'y' => $d[0], 'm' => $d[1], 'd' => $d[2], 'approx' => $d[3], 'text' => (string) $r['date_text'], 'calendar' => (string) $r['date_calendar'],
            'type' => (string) $r['type_label'], 'tag' => $tag, 'color' => (string) $r['type_color'], 'group' => cal_event_group($tag, (string) $r['type_label']),
            'title' => (string) $r['title'], 'place' => (string) ($r['place'] ?? ''), 'who' => $who];
    }
    return ['events' => $out, 'undated' => $undated];
}

/** Grandes familles d'événements, pour filtrer et colorer. */
function cal_event_group(string $tag, string $label): string
{
    $l = mb_strtolower($label);
    return match (true) {
        in_array($tag, ['BIRT', 'BAPM', 'CHR'], true) || str_contains($l, 'naiss') || str_contains($l, 'bapt') => 'birth',
        in_array($tag, ['MARR', 'MARB', 'MARC', 'ENGA', 'DIV'], true) || str_contains($l, 'mari') || str_contains($l, 'fianç') || str_contains($l, 'divorc') => 'union',
        in_array($tag, ['DEAT', 'BURI', 'CREM'], true) || str_contains($l, 'décès') || str_contains($l, 'deces') || str_contains($l, 'inhum') || str_contains($l, 'sépult') => 'death',
        default => 'other',
    };
}

/** Date AAAA-MM-JJ valable, sinon ''. */
function cal_iso(?string $v): string
{
    $v = substr(trim((string) $v), 0, 10);
    return preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? $v : '';
}

/**
 * 🗓️ Mon agenda : tout ce que j'ai prévu, rassemblé depuis les listes. Chaque entrée : {src, id, title, start, end, sub, done, ref}.
 * Une table absente (vieille base) est simplement passée.
 */
function my_agenda(PDO $pdo): array
{
    $out = [];
    $add = static function (array $e) use (&$out): void { if ($e['start'] !== '') { $e['end'] = $e['end'] !== '' && $e['end'] > $e['start'] ? $e['end'] : ''; $out[] = $e; } };
    $safe = static function (callable $fn): void { try { $fn(); } catch (Throwable $_) {} };
    $safe(function () use ($pdo, $add) { foreach ($pdo->query('SELECT id, title, date_start, date_end, place_text, hours_text, attended FROM genealogy_fairs') as $r) {
        $add(['src' => 'fair', 'id' => (int) $r['id'], 'title' => (string) $r['title'], 'start' => cal_iso($r['date_start']), 'end' => cal_iso($r['date_end']), 'sub' => trim($r['place_text'] . ($r['hours_text'] ? ' · ' . $r['hours_text'] : '')), 'done' => (bool) $r['attended']]); } });
    $safe(function () use ($pdo, $add) { foreach ($pdo->query('SELECT id, title, archive_center, visit_date, address FROM archive_visit_plans') as $r) {
        $add(['src' => 'archive_visit', 'id' => (int) $r['id'], 'title' => (string) ($r['title'] ?: 'Visite — ' . $r['archive_center']), 'start' => cal_iso($r['visit_date']), 'end' => '', 'sub' => (string) $r['archive_center'], 'done' => cal_iso($r['visit_date']) !== '' && cal_iso($r['visit_date']) < date('Y-m-d')]); } });
    $safe(function () use ($pdo, $add) { foreach ($pdo->query('SELECT id, title, reminder_due_at, reminder_category, reminder_done FROM standalone_reminders') as $r) {
        $add(['src' => 'reminder', 'id' => (int) $r['id'], 'title' => (string) $r['title'], 'start' => cal_iso($r['reminder_due_at']), 'end' => '', 'sub' => (string) $r['reminder_category'], 'done' => (bool) $r['reminder_done']]); } });
    $safe(function () use ($pdo, $add) { foreach ($pdo->query('SELECT id, objet, destinataire, organisme, date_envoi, relance_date, statut FROM courriers') as $r) {
        $who = trim($r['destinataire'] . ($r['organisme'] ? ' (' . $r['organisme'] . ')' : ''));
        $add(['src' => 'courrier', 'id' => (int) $r['id'], 'title' => '✉️ ' . $r['objet'], 'start' => cal_iso($r['date_envoi']), 'end' => '', 'sub' => 'envoyé à ' . $who, 'done' => true]);
        if ($r['statut'] !== 'reponse_recue') { $add(['src' => 'courrier_relance', 'id' => (int) $r['id'], 'title' => 'Relancer : ' . $r['objet'], 'start' => cal_iso($r['relance_date']), 'end' => '', 'sub' => $who, 'done' => false]); } } });
    $safe(function () use ($pdo, $add) { foreach ($pdo->query('SELECT id, title, date_start, date_end, start_place, status FROM field_trips') as $r) {
        $add(['src' => 'field_trip', 'id' => (int) $r['id'], 'title' => (string) $r['title'], 'start' => cal_iso($r['date_start']), 'end' => cal_iso($r['date_end']), 'sub' => (string) $r['start_place'], 'done' => $r['status'] === 'done']); } });
    $safe(function () use ($pdo, $add) { foreach ($pdo->query('SELECT id, title, renewal_date, vendor FROM research_budget') as $r) {
        $add(['src' => 'budget', 'id' => (int) $r['id'], 'title' => 'Renouveler : ' . $r['title'], 'start' => cal_iso($r['renewal_date']), 'end' => '', 'sub' => (string) $r['vendor'], 'done' => false]); } });
    $safe(function () use ($pdo, $add) { foreach ($pdo->query("SELECT i.id, i.title, i.data_json, i.project_id, p.title AS project FROM atelier_items i JOIN atelier_projects p ON p.id=i.project_id WHERE i.type='task' AND i.trashed=0") as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $add(['src' => 'atelier_task', 'id' => (int) $r['id'], 'title' => (string) $r['title'], 'start' => cal_iso($d['due'] ?? ''), 'end' => '', 'sub' => (string) $r['project'], 'done' => !empty($d['done']), 'ref' => (int) $r['project_id']]); } });
    $safe(function () use ($pdo, $add) { foreach ($pdo->query("SELECT i.id, i.title, i.reminder_due_at, i.reminder_done, i.investigation_id, v.title AS inv FROM investigation_items i JOIN investigations v ON v.id=i.investigation_id WHERE i.reminder_mode<>'none'") as $r) {
        $add(['src' => 'investigation', 'id' => (int) $r['id'], 'title' => (string) $r['title'], 'start' => cal_iso($r['reminder_due_at']), 'end' => '', 'sub' => (string) $r['inv'], 'done' => (bool) $r['reminder_done'], 'ref' => (int) $r['investigation_id']]); } });
    usort($out, static fn($a, $b) => [$a['start'], $a['title']] <=> [$b['start'], $b['title']]);
    $projects = [];
    $safe(function () use ($pdo, &$projects) { $projects = $pdo->query('SELECT id, title FROM atelier_projects ORDER BY title COLLATE NOCASE')->fetchAll(); });
    return ['items' => $out, 'today' => date('Y-m-d'), 'atelier_projects' => array_map(static fn($p) => ['id' => (int) $p['id'], 'title' => (string) $p['title']], $projects)];
}
