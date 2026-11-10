<?php
declare(strict_types=1);

/**
 * 🗓 Ma semaine de recherche (widget du tableau de bord et du Suivi ; il remplace l'ancienne « Liste de travail quotidienne »,
 * même type de widget « daily_research ») : une seule liste pour savoir quoi faire aujourd'hui et cette semaine, rangée par
 * urgence (« cette semaine » = les 7 jours qui viennent ; « fait cette semaine » = depuis lundi). Rien n'est recopié : on relit les rappels (standalone_reminders, investigation_items), le Registre de courriers
 * (courriers), le Planificateur de visites (archive_visit_plans), les pistes d'enquête (investigation_items) et les
 * hypothèses (hypotheses), « Que manque-t-il ? » (research_gaps_data, dont les recensements SocFace si lib/socface.php est
 * là), ce qui est « à vérifier » (foyers SocFace non vérifiés, alertes 🔴 / 🟠 du Contrôle de la base), les demandes
 * d'entraide (help_requests) et, pour « Fait cette semaine », le Journal des recherches (research_journal_data).
 *
 *  - semaine_data()  GET semaine : les lignes (clé, sorte, urgence, titre, ligne grise, date, de quoi l'ouvrir), les nombres ;
 *  - semaine_mark()  POST semaine_mark {op: done | snooze | restore, key, until: tomorrow | nextweek, prev} :
 *      ✓ fait = la vraie action quand elle existe (rappel fait, réponse reçue, visite faite, piste explorée, foyer vérifié
 *      sur l'image, demande résolue), sinon une marque « fait » ; ⏭ reporter = la vraie date (rappel, relance d'un courrier)
 *      ou une marque « reporté jusqu'au … » ; la réponse porte « prev » pour ↶ Annuler (op restore).
 * Les marques sont gardées dans app_settings (clé « lcnda-semaine-marks », jamais envoyée au navigateur) : pas de table de plus.
 */

const SEMAINE_SORTS = ['rappel', 'courrier', 'visite', 'piste', 'manque', 'verifier', 'entraide', 'fait'];
const SEMAINE_MARKS_KEY = 'lcnda-semaine-marks';
const SEMAINE_MAX_PER_SORT = 200;

function semaine_today(): string { return date('Y-m-d'); }
function semaine_monday(): string { return date('Y-m-d', strtotime('monday this week')); }
function semaine_plus(int $days, ?string $from = null): string { return date('Y-m-d', strtotime(($from ?? semaine_today()) . ' ' . ($days >= 0 ? '+' : '') . $days . ' days')); }
function semaine_is_date(string $s): bool { return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) && checkdate((int) substr($s, 5, 2), (int) substr($s, 8, 2), (int) substr($s, 0, 4)); }

function semaine_has_table(PDO $pdo, string $t): bool
{
    $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]);
    return (bool) $s->fetchColumn();
}

/** L'urgence d'une date d'échéance : late (passée), today, week (dans les 7 jours), later (plus tard), '' (trop loin). */
function semaine_urgency(string $date, int $horizon = 7): string
{
    $d = substr($date, 0, 10);
    if (!semaine_is_date($d)) { return 'later'; }
    $today = semaine_today();
    if ($d < $today) { return 'late'; }
    if ($d === $today) { return 'today'; }
    return $d <= semaine_plus($horizon) ? 'week' : 'later';
}

/* ─────────────── les marques (✓ fait, ⏭ reporté) ─────────────── */

function semaine_marks(PDO $pdo): array
{
    try { $raw = $pdo->query("SELECT value FROM app_settings WHERE key='" . SEMAINE_MARKS_KEY . "'")->fetchColumn(); } catch (Throwable $_) { return []; }
    $m = json_decode((string) ($raw ?: ''), true);
    return is_array($m) ? $m : [];
}

function semaine_marks_save(PDO $pdo, array $marks): void
{
    $old = semaine_plus(-400);
    // ménage : les reports échus, les « fait » de plus d'un an
    $marks = array_filter($marks, static fn($m) => is_array($m) && (($m['s'] ?? '') === 'snooze' ? (string) ($m['until'] ?? '') > semaine_plus(-1) : (string) ($m['at'] ?? '') >= $old));
    if (count($marks) > 3000) { uasort($marks, static fn($a, $b) => strcmp((string) ($b['at'] ?? ''), (string) ($a['at'] ?? ''))); $marks = array_slice($marks, 0, 3000, true); }
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')
        ->execute([SEMAINE_MARKS_KEY, json_encode($marks, JSON_UNESCAPED_UNICODE)]);
}

/* ─────────────── les lignes, sorte par sorte ─────────────── */

/** « de Jean », « d’Antoine » */
function semaine_de(string $name): string
{
    return preg_match('/^[aeiouyhàâéèêëîïôöûü]/iu', $name) ? 'd’' . $name : 'de ' . $name;
}

function semaine_person_name(array $r, string $f = 'first_name', string $l = 'last_name'): string
{
    return trim(trim((string) ($r[$f] ?? '')) . ' ' . mb_strtoupper(trim((string) ($r[$l] ?? ''))));
}

function semaine_fr_date(string $d): string
{
    $d = substr($d, 0, 10);
    if (!semaine_is_date($d)) { return $d; }
    $m = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return (int) substr($d, 8, 2) . ' ' . $m[(int) substr($d, 5, 2) - 1] . ' ' . substr($d, 0, 4);
}

function semaine_days_since(string $d): ?int
{
    $d = substr($d, 0, 10);
    if (!semaine_is_date($d)) { return null; }
    return (int) floor((strtotime(semaine_today()) - strtotime($d)) / 86400);
}

/** 🔔 rappels du jour, en retard et des 7 jours (libres et d'enquête) */
function semaine_rappels(PDO $pdo): array
{
    if (!function_exists('reminder_list_rows')) { return []; }
    $out = [];
    foreach (reminder_list_rows($pdo, '%%', 100000, 0) as $r) {
        if ((int) ($r['reminder_done'] ?? 0) === 1) { continue; }
        $mode = (string) ($r['reminder_mode'] ?? 'on');
        $at = substr((string) ($r['reminder_due_at'] ?? ''), 0, 10);
        if ($mode === 'none' || !semaine_is_date($at)) { continue; }
        $u = semaine_urgency($at);
        if ($u === 'later') { continue; }
        $standalone = ($r['source_type'] ?? '') === 'standalone';
        $label = ['on' => 'À faire le', 'before' => 'Avant le', 'after' => 'Après le'][$mode] ?? 'À faire le';
        $out[] = ['key' => 'rappel:' . ($standalone ? 's' : 'i') . ':' . (int) $r['id'], 'sort' => 'rappel', 'urgency' => $u,
            'title' => trim((string) ($r['item_title'] ?? '')) ?: 'Rappel',
            'detail' => implode(' · ', array_filter([$label . ' ' . semaine_fr_date($at), $standalone ? 'Rappel libre' : 'Enquête « ' . trim((string) ($r['investigation_title'] ?? '')) . ' »', trim((string) ($r['person_name'] ?? ''))])),
            'date' => $at, 'person_id' => (int) ($r['person_id'] ?? 0),
            'open' => $standalone ? ['kind' => 'list', 'list' => 'reminders'] : ['kind' => 'investigation', 'id' => (int) ($r['investigation_id'] ?? 0)],
            'done_label' => 'Fait', 'snooze' => 'date'];
    }
    return $out;
}

/** ✉️ courriers sans réponse : relance dépassée, prévue cette semaine, ou en attente depuis N jours */
function semaine_courriers(PDO $pdo): array
{
    if (!semaine_has_table($pdo, 'courriers')) { return []; }
    $orgs = function_exists('courrier_organismes') ? courrier_organismes() : [];
    $out = [];
    foreach ($pdo->query("SELECT * FROM courriers WHERE COALESCE(fait,0)=0 AND statut<>'reponse_recue' ORDER BY CASE WHEN relance_date='' THEN 1 ELSE 0 END, relance_date, date_envoi LIMIT " . SEMAINE_MAX_PER_SORT) as $c) {
        $rel = (string) $c['relance_date'];
        $u = $rel !== '' ? semaine_urgency($rel) : 'later';
        $since = semaine_days_since((string) $c['date_envoi']);
        $wait = $since === null ? 'Pas encore envoyé' : ($since <= 0 ? 'Envoyé aujourd’hui' : 'Réponse attendue depuis ' . $since . ' jour' . ($since > 1 ? 's' : ''));
        $relTxt = $rel === '' ? '' : ($u === 'late' ? 'relance prévue le ' . semaine_fr_date($rel) . ' : à relancer' : 'relance le ' . semaine_fr_date($rel));
        $out[] = ['key' => 'courrier:' . (int) $c['id'], 'sort' => 'courrier', 'urgency' => $u,
            'title' => trim((string) $c['objet']) . ' — ' . trim((string) $c['destinataire']),
            'detail' => implode(' · ', array_filter([$wait, $relTxt, $orgs[$c['organisme']] ?? ''])), 'date' => $rel ?: substr((string) $c['date_envoi'], 0, 10),
            'days' => $since, 'open' => ['kind' => 'list', 'list' => 'courriers'], 'done_label' => 'Réponse reçue', 'snooze' => 'date'];
    }
    return $out;
}

/** 🏛 visites d'archives à venir (30 jours) ou passées sans « ✓ Fait le » */
function semaine_visites(PDO $pdo): array
{
    if (!semaine_has_table($pdo, 'archive_visit_plans')) { return []; }
    $hasDone = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('archive_visit_plans') WHERE name='done_at'")->fetchColumn();
    $s = $pdo->prepare("SELECT v.*, (SELECT count(*) FROM archive_visit_items i WHERE i.visit_id=v.id) AS n_items FROM archive_visit_plans v
        WHERE " . ($hasDone ? "COALESCE(v.done_at,'')='' AND " : '') . "v.visit_date<>'' AND substr(v.visit_date,1,10)<=? AND substr(v.visit_date,1,10)>=? ORDER BY v.visit_date LIMIT " . SEMAINE_MAX_PER_SORT);
    $s->execute([semaine_plus(30), semaine_plus(-60)]);
    $out = [];
    foreach ($s->fetchAll() as $v) {
        $d = substr((string) $v['visit_date'], 0, 10);
        $u = semaine_urgency($d);
        $n = (int) $v['n_items'];
        $out[] = ['key' => 'visite:' . (int) $v['id'], 'sort' => 'visite', 'urgency' => $u,
            'title' => (trim((string) $v['title']) ?: 'Visite') . (trim((string) $v['archive_center']) !== '' ? ' — ' . trim((string) $v['archive_center']) : ''),
            'detail' => implode(' · ', array_filter([$u === 'late' ? 'Prévue le ' . semaine_fr_date($d) . ' : note-la comme faite' : 'Le ' . semaine_fr_date($d), $n ? $n . ' cote' . ($n > 1 ? 's' : '') . ' à consulter' : '', trim((string) $v['opening_hours'])])),
            'date' => $d, 'open' => ['kind' => 'list', 'list' => 'archive_visits', 'id' => (int) $v['id']], 'done_label' => 'Visite faite', 'snooze' => 'mark'];
    }
    return $out;
}

/** 🔍 pistes d'enquête à explorer et hypothèses ouvertes */
function semaine_pistes(PDO $pdo): array
{
    $out = [];
    if (semaine_has_table($pdo, 'investigation_items')) {
        $st = ['to_explore_priority' => 'À explorer (prioritaire)', 'to_explore' => 'À explorer', 'promising' => 'Prometteuse'];
        foreach ($pdo->query("SELECT ii.id, ii.title, ii.status, ii.investigation_id, i.title AS inv_title, i.person_id, p.first_name, p.last_name
            FROM investigation_items ii JOIN investigations i ON i.id=ii.investigation_id LEFT JOIN persons p ON p.id=i.person_id
            WHERE ii.status IN ('to_explore_priority','to_explore','promising') AND COALESCE(i.status,'open') NOT IN ('closed','solved','resolved','abandoned')
            ORDER BY CASE ii.status WHEN 'to_explore_priority' THEN 0 WHEN 'promising' THEN 1 ELSE 2 END, ii.id DESC LIMIT " . SEMAINE_MAX_PER_SORT) as $r) {
            $out[] = ['key' => 'piste:' . (int) $r['id'], 'sort' => 'piste', 'urgency' => $r['status'] === 'to_explore_priority' ? 'week' : 'later',
                'title' => trim((string) $r['title']) ?: 'Piste', 'badge' => $st[$r['status']] ?? '',
                'detail' => implode(' · ', array_filter(['Enquête « ' . trim((string) $r['inv_title']) . ' »', semaine_person_name($r)])),
                'person_id' => (int) $r['person_id'], 'open' => ['kind' => 'investigation', 'id' => (int) $r['investigation_id']], 'done_label' => 'Explorée', 'snooze' => 'mark'];
        }
    }
    if (semaine_has_table($pdo, 'hypotheses')) {
        $conf = ['low' => 'confiance faible', 'medium' => 'confiance moyenne', 'high' => 'confiance forte'];
        foreach ($pdo->query("SELECT h.id, h.title, h.statement, h.confidence, h.person_id, p.first_name, p.last_name FROM hypotheses h LEFT JOIN persons p ON p.id=h.person_id
            WHERE h.status='open' ORDER BY h.updated_at DESC, h.id DESC LIMIT " . SEMAINE_MAX_PER_SORT) as $h) {
            $out[] = ['key' => 'hypo:' . (int) $h['id'], 'sort' => 'piste', 'urgency' => 'later', 'title' => 'Hypothèse : ' . (trim((string) $h['title']) ?: 'sans titre'), 'badge' => 'Hypothèse',
                'detail' => implode(' · ', array_filter([semaine_person_name($h), $conf[$h['confidence']] ?? '', mb_substr(trim((string) $h['statement']), 0, 90)])),
                'person_id' => (int) $h['person_id'], 'open' => ['kind' => 'person', 'id' => (int) $h['person_id'], 'view' => 'hypotheses'], 'done_label' => 'Vu', 'snooze' => 'mark'];
        }
    }
    if (function_exists('ouc_semaine_rows')) { foreach (ouc_semaine_rows($pdo) as $r) { $out[] = $r; } } // 🧩 un mur de brique par semaine (lib/ou_chercher.php)
    if (function_exists('preuve_semaine_rows')) { foreach (preuve_semaine_rows($pdo) as $r) { $out[] = $r; } } // 🛡 un lien fragile par semaine (lib/preuve.php)
    return $out;
}

/** 💡 prochaines recherches de « Que manque-t-il ? » (pas celles déjà dans le suivi des dépouillements) */
function semaine_manques(PDO $pdo): array
{
    if (!function_exists('research_gaps_data')) { return []; }
    try { $g = research_gaps_data($pdo, ['gen' => 8]); } catch (Throwable $_) { return []; }
    $out = []; $perSf = [];
    $what = ['birth' => 'Naissance', 'marriage' => 'Mariage', 'death' => 'Décès', 'parents' => 'Parents', 'contract' => 'Contrat de mariage', 'succession' => 'Succession', 'census' => 'Recensements', 'military' => 'Registre matricule'];
    foreach ($g['items'] ?? [] as $it) {
        if (!empty($it['digested'])) { continue; }
        $pid = (int) ($it['person_id'] ?? 0); $kind = (string) ($it['kind'] ?? '');
        $years = $it['from'] && $it['to'] ? ($it['from'] === $it['to'] ? (string) $it['from'] : $it['from'] . '–' . $it['to']) : (string) ($it['from'] ?: $it['to'] ?: '');
        $place = trim((string) ($it['place'] ?? ''));
        $row = ['key' => 'manque:' . $pid . ':' . $kind . ':' . (int) ($it['from'] ?? 0), 'sort' => 'manque', 'urgency' => 'later', 'person_id' => $pid,
            'badge' => $it['sosa'] ? 'Sosa ' . $it['sosa'] : '', 'open' => ['kind' => 'gaps', 'id' => $pid], 'done_label' => 'Cherché', 'snooze' => 'mark'];
        if ($kind === 'socface') {
            if (($perSf[$pid] = ($perSf[$pid] ?? 0) + 1) > 2) { continue; } // deux recensements par ancêtre au plus : la liste reste lisible
            $row['title'] = 'Recensement de ' . $it['from'] . ($place !== '' ? ' à ' . $place : '') . ' : chercher sur SocFace';
            $row['detail'] = implode(' · ', array_filter([(string) $it['name'], (string) ($it['why'] ?? '')]));
            $row['sf'] = $it['sf'] ?? null;
            $row['done_label'] = 'Cherché sur SocFace';
        } else {
            $row['title'] = ($what[$kind] ?? ucfirst((string) ($it['what'] ?? 'Acte'))) . ' ' . semaine_de((string) $it['name']) . ($place !== '' ? ' : chercher à ' . $place : '') . ($years !== '' ? ' (' . $years . ')' : '');
            $arch = is_array($it['archive'] ?? null) ? (string) ($it['archive']['label'] ?? '') : '';
            $where = is_array($it['where'] ?? null) ? implode(', ', array_slice(array_map(static fn($w) => is_array($w) ? (string) ($w['label'] ?? $w['series'] ?? '') : (string) $w, $it['where']), 0, 2)) : '';
            $row['detail'] = implode(' · ', array_filter([$arch, $where, (string) ($it['why'] ?? '')]));
        }
        $out[] = $row;
        if (count($out) >= 120) { break; }
    }
    return $out;
}

/** ⚠️ à vérifier : foyers SocFace pas encore « Vérifié sur l'image », alertes 🔴 / 🟠 du Contrôle de la base */
function semaine_verifier(PDO $pdo): array
{
    $out = [];
    if (function_exists('socface_records')) {
        try {
            foreach (socface_records($pdo, 'cr.verified=0', [], 80) as $r) {
                $chef = ''; foreach ($r['members'] as $m) { if ($m['is_primary'] || $chef === '') { $chef = trim($m['first'] . ' ' . $m['last']); if ($m['is_primary']) { break; } } }
                $n = count($r['members']);
                $out[] = ['key' => 'socface:' . (int) $r['id'], 'sort' => 'verifier', 'urgency' => 'later', 'badge' => 'Lecture SocFace',
                    'title' => 'Recensement de ' . $r['year'] . ($r['place'] !== '' ? ' à ' . $r['place'] : '') . ' : lecture à vérifier sur l’image',
                    'detail' => implode(' · ', array_filter([$chef !== '' ? 'Foyer de ' . $chef : '', $n ? $n . ' personne' . ($n > 1 ? 's' : '') : '', trim((string) $r['cote'])])),
                    'url' => (string) ($r['image_url'] ?: $r['origin_url']), 'open' => ['kind' => 'socface', 'id' => (int) $r['id']], 'done_label' => 'Vérifié sur l’image', 'snooze' => 'mark'];
            }
        } catch (Throwable $_) {}
    }
    if (function_exists('controle_state')) {
        try {
            $st = controle_state($pdo);
            $n = 0;
            foreach ($st['alerts'] as $a) {
                if (!in_array($a['level'], ['red', 'orange'], true)) { continue; }
                $p = (int) ($a['people'][0] ?? 0);
                $out[] = ['key' => 'controle:' . $a['key'], 'sort' => 'verifier', 'urgency' => $a['level'] === 'red' ? 'week' : 'later',
                    'title' => (string) $a['title'], 'badge' => $a['level'] === 'red' ? '🔴 Impossible' : '🟠 À vérifier',
                    'detail' => mb_substr(trim((string) ($a['detail'] ?? '')), 0, 140), 'person_id' => $p,
                    'open' => ['kind' => 'controle', 'level' => $a['level'], 'id' => $p], 'done_label' => 'Vu', 'snooze' => 'mark'];
                if (++$n >= 80) { break; }
            }
        } catch (Throwable $_) {}
    }
    return $out;
}

/** 🤝 demandes d'entraide en cours (une réponse reçue passe devant) */
function semaine_entraide(PDO $pdo): array
{
    if (!semaine_has_table($pdo, 'help_requests')) { return []; }
    $lab = defined('HELP_STATUSES') ? HELP_STATUSES : [];
    $targets = defined('HELP_TARGETS') ? HELP_TARGETS : [];
    $out = [];
    foreach ($pdo->query("SELECT h.*, p.first_name, p.last_name FROM help_requests h LEFT JOIN persons p ON p.id=h.person_id WHERE h.status NOT IN ('solved','abandoned') ORDER BY CASE h.status WHEN 'answered' THEN 0 WHEN 'posted' THEN 1 ELSE 2 END, h.updated_at DESC LIMIT " . SEMAINE_MAX_PER_SORT) as $h) {
        $since = semaine_days_since((string) $h['updated_at']);
        $t = $targets[$h['target']] ?? '';
        $out[] = ['key' => 'entraide:' . (int) $h['id'], 'sort' => 'entraide', 'urgency' => $h['status'] === 'answered' ? 'today' : 'later',
            'title' => mb_substr(trim((string) $h['question']) ?: 'Demande d’entraide', 0, 140), 'badge' => $lab[$h['status']] ?? (string) $h['status'],
            'detail' => implode(' · ', array_filter([semaine_person_name($h), is_array($t) ? (string) ($t['label'] ?? $t[0] ?? '') : (string) $t, trim((string) $h['posted_where']),
                $h['status'] === 'answered' ? 'Une réponse t’attend' : ($h['status'] === 'draft' ? 'Brouillon à publier' : ($since !== null ? 'Publiée il y a ' . $since . ' jour' . ($since > 1 ? 's' : '') : ''))])),
            'person_id' => (int) ($h['person_id'] ?? 0), 'url' => (string) $h['posted_url'], 'open' => ['kind' => 'list', 'list' => 'help_requests'], 'done_label' => 'Résolue', 'snooze' => 'mark'];
    }
    return $out;
}

/** ✓ fait cette semaine (depuis lundi) : Journal des recherches, rappels faits, visites faites, réponses, demandes résolues, ✓ du widget */
function semaine_fait(PDO $pdo, array $marks): array
{
    $mon = semaine_monday(); $out = [];
    $add = static function (array $r) use (&$out) { $out[$r['key']] ??= $r + ['sort' => 'fait', 'urgency' => 'done']; };
    if (function_exists('research_journal_data')) {
        try {
            foreach (research_journal_data($pdo, ['limit' => 400])['rows'] ?? [] as $r) {
                if (substr((string) $r['date'], 0, 10) < $mon) { break; } // rangé du plus récent au plus ancien
                if (in_array($r['kind'], ['digest', 'request'], true) && ($r['result'] ?? '') === '' && !in_array($r['status'] ?? '', ['done', 'received', 'closed'], true)) { continue; } // seulement ce qui a donné un résultat
                $add(['key' => 'fait:' . $r['key'], 'title' => (string) $r['title'], 'detail' => implode(' · ', array_filter([(string) ($r['result_label'] ?? ''), (string) ($r['status_label'] ?? ''), (string) ($r['commune'] ?? '')])),
                    'date' => (string) $r['date'], 'open' => ['kind' => 'journal', 'target' => $r['open'] ?? null]]);
            }
        } catch (Throwable $_) {}
    }
    try {
        foreach ($pdo->query("SELECT id, title, reminder_done_at FROM standalone_reminders WHERE reminder_done=1 AND substr(reminder_done_at,1,10)>='$mon'") as $r) {
            $add(['key' => 'fait:rappel:s:' . (int) $r['id'], 'title' => (string) $r['title'], 'detail' => 'Rappel fait', 'date' => (string) $r['reminder_done_at'], 'open' => ['kind' => 'list', 'list' => 'reminders']]);
        }
        foreach ($pdo->query("SELECT ii.id, ii.title, ii.reminder_done_at, ii.investigation_id FROM investigation_items ii WHERE ii.reminder_done=1 AND substr(ii.reminder_done_at,1,10)>='$mon'") as $r) {
            $add(['key' => 'fait:rappel:i:' . (int) $r['id'], 'title' => (string) $r['title'], 'detail' => 'Rappel fait', 'date' => (string) $r['reminder_done_at'], 'open' => ['kind' => 'investigation', 'id' => (int) $r['investigation_id']]]);
        }
    } catch (Throwable $_) {}
    try {
        if ($pdo->query("SELECT 1 FROM pragma_table_info('archive_visit_plans') WHERE name='done_at'")->fetchColumn()) {
            foreach ($pdo->query("SELECT id, title, archive_center, done_at FROM archive_visit_plans WHERE COALESCE(done_at,'')>='$mon'") as $v) {
                $add(['key' => 'fait:visite:' . (int) $v['id'], 'title' => trim((string) $v['title']) ?: (string) $v['archive_center'], 'detail' => 'Visite faite', 'date' => (string) $v['done_at'], 'open' => ['kind' => 'list', 'list' => 'archive_visits', 'id' => (int) $v['id']]]);
            }
        }
    } catch (Throwable $_) {}
    try {
        foreach ($pdo->query("SELECT id, objet, destinataire, updated_at FROM courriers WHERE statut='reponse_recue' AND substr(updated_at,1,10)>='$mon'") as $c) {
            $add(['key' => 'fait:courrier:' . (int) $c['id'], 'title' => trim((string) $c['objet']) . ' — ' . trim((string) $c['destinataire']), 'detail' => 'Réponse reçue', 'date' => (string) $c['updated_at'], 'open' => ['kind' => 'list', 'list' => 'courriers']]);
        }
    } catch (Throwable $_) {}
    try {
        foreach ($pdo->query("SELECT id, question, updated_at FROM help_requests WHERE status='solved' AND substr(updated_at,1,10)>='$mon'") as $h) {
            $add(['key' => 'fait:entraide:' . (int) $h['id'], 'title' => mb_substr(trim((string) $h['question']) ?: 'Demande d’entraide', 0, 140), 'detail' => 'Demande résolue', 'date' => (string) $h['updated_at'], 'open' => ['kind' => 'list', 'list' => 'help_requests']]);
        }
    } catch (Throwable $_) {}
    foreach ($marks as $key => $m) {
        if (($m['s'] ?? '') !== 'done' || (string) ($m['at'] ?? '') < $mon) { continue; }
        $add(['key' => 'fait:' . $key, 'title' => (string) ($m['t'] ?? $key), 'detail' => (string) ($m['l'] ?? 'Fait'), 'date' => (string) $m['at'], 'open' => is_array($m['o'] ?? null) ? $m['o'] : null, 'mark' => $key]);
    }
    $out = array_values($out);
    usort($out, static fn($a, $b) => strcmp((string) $b['date'], (string) $a['date']));
    return array_slice($out, 0, SEMAINE_MAX_PER_SORT);
}

/** GET semaine */
function semaine_data(PDO $pdo, array $q = []): array
{
    $marks = semaine_marks($pdo);
    $today = semaine_today();
    $items = [];
    $sources = ['rappel' => 'semaine_rappels', 'courrier' => 'semaine_courriers', 'visite' => 'semaine_visites', 'piste' => 'semaine_pistes', 'manque' => 'semaine_manques', 'verifier' => 'semaine_verifier', 'entraide' => 'semaine_entraide'];
    $only = array_values(array_intersect(SEMAINE_SORTS, array_filter(explode(',', (string) ($q['sorts'] ?? '')))));
    $snoozed = 0;
    foreach ($sources as $sort => $fn) {
        if ($only && !in_array($sort, $only, true)) { continue; }
        try { $rows = $fn($pdo); } catch (Throwable $_) { $rows = []; }
        foreach ($rows as $r) {
            $m = $marks[$r['key']] ?? null;
            if ($m && ($m['s'] ?? '') === 'done') { continue; }
            if ($m && ($m['s'] ?? '') === 'snooze' && (string) ($m['until'] ?? '') > $today) { $snoozed++; continue; }
            $items[] = $r;
        }
    }
    $done = !$only || in_array('fait', $only, true) ? semaine_fait($pdo, $marks) : [];
    $rank = ['late' => 0, 'today' => 1, 'week' => 2, 'later' => 3];
    usort($items, static fn($a, $b) => [$rank[$a['urgency']] ?? 9, (string) ($a['date'] ?? '9999')] <=> [$rank[$b['urgency']] ?? 9, (string) ($b['date'] ?? '9999')]);
    $counts = ['late' => 0, 'today' => 0, 'week' => 0, 'later' => 0, 'done' => count($done), 'snoozed' => $snoozed];
    $bySort = array_fill_keys(SEMAINE_SORTS, 0);
    foreach ($items as $it) { $counts[$it['urgency']]++; $bySort[$it['sort']]++; }
    $bySort['fait'] = count($done);
    return ['today' => $today, 'monday' => semaine_monday(), 'items' => $items, 'done' => $done, 'counts' => $counts, 'by_sort' => $bySort, 'sorts' => SEMAINE_SORTS];
}

/* ─────────────── ✓ fait, ⏭ reporter, ↶ Annuler ─────────────── */

/** la clé d'une ligne → [sorte, id ou reste] ; refuse tout ce qui n'a pas la forme attendue */
function semaine_parse_key(string $key): array
{
    if (preg_match('/^rappel:([si]):(\d{1,10})$/', $key, $m)) { return ['rappel', (int) $m[2], $m[1]]; }
    if (preg_match('/^(courrier|visite|piste|hypo|socface|entraide):(\d{1,10})$/', $key, $m)) { return [$m[1], (int) $m[2], '']; }
    if (preg_match('/^manque:\d{1,10}:[a-z]{2,20}:\d{1,4}$/', $key)) { return ['manque', 0, '']; }
    if (preg_match('/^mur:\d{1,10}:\d{6}$/', $key)) { return ['mur', 0, '']; } // 🧩 mur de la semaine : une marque « fait »
    if (preg_match('/^solidite:\d{1,10}:\d{1,10}:\d{6}$/', $key)) { return ['solidite', 0, '']; } // 🛡 lien fragile de la semaine : une marque « fait »
    if (preg_match('/^controle:[\p{L}\p{N}:_.,\- ]{1,160}$/u', $key)) { return ['controle', 0, '']; }
    throw new RuntimeException('Ligne inconnue.');
}

function semaine_snooze_date(string $until): string
{
    return match ($until) { 'tomorrow' => semaine_plus(1), 'nextweek' => date('Y-m-d', strtotime('monday next week')), default => throw new RuntimeException('Report inconnu.') };
}

/** POST semaine_mark */
function semaine_mark(PDO $pdo, array $data): array
{
    $op = (string) ($data['op'] ?? '');
    $key = mb_substr(trim((string) ($data['key'] ?? '')), 0, 200);
    [$sort, $id, $sub] = semaine_parse_key($key);
    $marks = semaine_marks($pdo);
    $prevMark = $marks[$key] ?? null;
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 200);
    $open = is_array($data['open'] ?? null) ? array_intersect_key($data['open'], array_flip(['kind', 'list', 'id', 'level', 'view'])) : null;
    if ($open) { foreach ($open as $k => $v) { $open[$k] = is_int($v) ? $v : mb_substr(safe_text((string) $v), 0, 40); } }
    $today = semaine_today();
    $prev = ['mark' => $prevMark];
    $label = '';

    if ($op === 'restore') {
        $p = is_array($data['prev'] ?? null) ? $data['prev'] : [];
        semaine_restore_real($pdo, $sort, $id, $sub, $p);
        if (is_array($p['mark'] ?? null)) { $marks[$key] = array_intersect_key($p['mark'], array_flip(['s', 'at', 'until', 't', 'l', 'o'])); } else { unset($marks[$key]); }
        semaine_marks_save($pdo, $marks);
        return ['ok' => true, 'key' => $key];
    }
    if ($op === 'done') {
        switch ($sort) {
            case 'rappel':
                $t = $sub === 's' ? 'standalone_reminders' : 'investigation_items';
                $s = $pdo->prepare("SELECT reminder_done, reminder_due_at FROM $t WHERE id=?"); $s->execute([$id]); $r = $s->fetch();
                if (!$r) { throw new RuntimeException('Rappel introuvable.'); }
                set_reminder_done($pdo, ['source_type' => $sub === 's' ? 'standalone' : 'investigation_item', 'id' => $id, 'done' => 1]);
                $prev['done'] = (int) $r['reminder_done']; $label = 'Rappel fait';
                break;
            case 'courrier':
                $s = $pdo->prepare('SELECT statut, relance_date FROM courriers WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
                if (!$r) { throw new RuntimeException('Courrier introuvable.'); }
                $pdo->prepare("UPDATE courriers SET statut='reponse_recue', relance_date='', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$id]);
                if (function_exists('log_change')) { log_change($pdo, 'courrier', $id, 'update', 'Courrier : réponse reçue', $r, ['statut' => 'reponse_recue']); }
                $prev += ['statut' => (string) $r['statut'], 'relance_date' => (string) $r['relance_date']]; $label = 'Réponse reçue';
                break;
            case 'visite':
                $r = archive_visit_plan_row($pdo, $id);
                if (!$r) { throw new RuntimeException('Feuille de mission introuvable.'); }
                save_archive_visit_done($pdo, ['visit_id' => $id, 'done_at' => $today]);
                $prev['done_at'] = (string) ($r['done_at'] ?? ''); $label = 'Visite faite';
                break;
            case 'piste':
                $s = $pdo->prepare('SELECT status, investigation_id, title FROM investigation_items WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
                if (!$r) { throw new RuntimeException('Piste introuvable.'); }
                $pdo->prepare("UPDATE investigation_items SET status='explored' WHERE id=?")->execute([$id]);
                $pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $r['investigation_id']]);
                if (function_exists('log_change')) { log_change($pdo, 'investigation_item', $id, 'update', 'Piste explorée : ' . $r['title'], $r, ['status' => 'explored']); }
                $prev['status'] = (string) $r['status']; $label = 'Piste explorée';
                break;
            case 'socface':
                if (!function_exists('socface_verify')) { throw new RuntimeException('Les recensements SocFace ne sont pas installés.'); }
                $r = socface_verify($pdo, ['census_id' => $id, 'verified' => 1]);
                $prev['verified'] = (int) ($r['before'] ?? 0); $label = 'Vérifié sur l’image';
                break;
            case 'entraide':
                $s = $pdo->prepare('SELECT status FROM help_requests WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
                if (!$r) { throw new RuntimeException('Demande introuvable.'); }
                $pdo->prepare("UPDATE help_requests SET status='solved', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$id]);
                $prev['status'] = (string) $r['status']; $label = 'Demande résolue';
                break;
            default: // hypothèse, recherche proposée, contrôle : une marque « fait »
                $marks[$key] = ['s' => 'done', 'at' => $today, 't' => $title ?: $key, 'l' => ['hypo' => 'Hypothèse revue', 'manque' => 'Recherche faite', 'controle' => 'Alerte revue', 'mur' => 'Piste du mur faite', 'solidite' => 'Lien vérifié'][$sort] ?? 'Fait', 'o' => $open];
                semaine_marks_save($pdo, $marks);
                return ['ok' => true, 'key' => $key, 'prev' => $prev, 'label' => $marks[$key]['l']];
        }
        unset($marks[$key]); // une ancienne marque n'a plus lieu d'être
        semaine_marks_save($pdo, $marks);
        return ['ok' => true, 'key' => $key, 'prev' => $prev, 'label' => $label];
    }
    if ($op === 'snooze') {
        $to = semaine_snooze_date((string) ($data['until'] ?? ''));
        if ($sort === 'rappel') {
            $t = $sub === 's' ? 'standalone_reminders' : 'investigation_items';
            $s = $pdo->prepare("SELECT reminder_due_at FROM $t WHERE id=?"); $s->execute([$id]); $r = $s->fetch();
            if (!$r) { throw new RuntimeException('Rappel introuvable.'); }
            $old = (string) $r['reminder_due_at'];
            $pdo->prepare("UPDATE $t SET reminder_due_at=? WHERE id=?")->execute([$to . substr($old, 10), $id]);
            if (function_exists('log_change')) { log_change($pdo, $sub === 's' ? 'standalone_reminder' : 'investigation_item', $id, 'update', 'Rappel reporté au ' . $to, ['reminder_due_at' => $old], ['reminder_due_at' => $to]); }
            $prev['due'] = $old;
        } elseif ($sort === 'courrier') {
            $s = $pdo->prepare('SELECT relance_date FROM courriers WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
            if (!$r) { throw new RuntimeException('Courrier introuvable.'); }
            $pdo->prepare('UPDATE courriers SET relance_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$to, $id]);
            $prev['relance_date'] = (string) $r['relance_date'];
        } else {
            $marks[$key] = ['s' => 'snooze', 'at' => $today, 'until' => $to, 't' => $title ?: $key];
        }
        if (in_array($sort, ['rappel', 'courrier'], true)) { unset($marks[$key]); }
        semaine_marks_save($pdo, $marks);
        return ['ok' => true, 'key' => $key, 'prev' => $prev, 'until' => $to];
    }
    throw new RuntimeException('Action inconnue.');
}

/** ↶ Annuler : remet l'état d'avant (valeurs vérifiées une à une) */
function semaine_restore_real(PDO $pdo, string $sort, int $id, string $sub, array $p): void
{
    $date = static fn($v) => is_string($v) && ($v === '' || preg_match('/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/', $v)) ? $v : null;
    switch ($sort) {
        case 'rappel':
            $t = $sub === 's' ? 'standalone_reminders' : 'investigation_items';
            if (array_key_exists('done', $p) && (int) $p['done'] === 0) { set_reminder_done($pdo, ['source_type' => $sub === 's' ? 'standalone' : 'investigation_item', 'id' => $id, 'done' => 0]); }
            if (array_key_exists('due', $p) && ($d = $date($p['due'])) !== null && $d !== '') { $pdo->prepare("UPDATE $t SET reminder_due_at=? WHERE id=?")->execute([$d, $id]); }
            break;
        case 'courrier':
            $st = (string) ($p['statut'] ?? '');
            if ($st !== '' && function_exists('courrier_statuts') && array_key_exists($st, courrier_statuts())) { $pdo->prepare('UPDATE courriers SET statut=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$st, $id]); }
            if (array_key_exists('relance_date', $p) && ($d = $date($p['relance_date'])) !== null) { $pdo->prepare('UPDATE courriers SET relance_date=? WHERE id=?')->execute([$d, $id]); }
            break;
        case 'visite':
            if (array_key_exists('done_at', $p) && ($d = $date($p['done_at'])) !== null) { save_archive_visit_done($pdo, ['visit_id' => $id, 'done_at' => substr($d, 0, 10)]); }
            break;
        case 'piste':
            $st = (string) ($p['status'] ?? '');
            if (in_array($st, ['promising', 'explored', 'to_explore_priority', 'to_explore', 'closed'], true)) { $pdo->prepare('UPDATE investigation_items SET status=? WHERE id=?')->execute([$st, $id]); }
            break;
        case 'socface':
            if (array_key_exists('verified', $p) && function_exists('socface_verify')) { socface_verify($pdo, ['census_id' => $id, 'verified' => (int) $p['verified'] ? 1 : 0]); }
            break;
        case 'entraide':
            $st = (string) ($p['status'] ?? '');
            if (defined('HELP_STATUSES') && array_key_exists($st, HELP_STATUSES)) { $pdo->prepare('UPDATE help_requests SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$st, $id]); }
            break;
    }
}
