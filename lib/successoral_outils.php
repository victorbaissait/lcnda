<?php
declare(strict_types=1);

/**
 * ⚖️ Outils du généalogiste successoral (maquette docs/design/onglets-et-successoral-outils.html, B1 à B6).
 * Écrans : assets/js/heritage-successoral-outils.js (⏱ chronomètre, 🔔 échéances, 📋 avant de remettre, 📊 parts en euros) et
 * heritage-successoral.js (🧾 chaîne de filiation dans « 🖨 Pour le notaire », ✉️ courriers en série) ; calculs sans écran :
 * heritage-successoral-outils-core.js ; essais : tests/test-successoral-outils.js.
 *  B1 ⏱ le temps compté va dans 💶 Temps et frais (succ_fees, sorte « time », source « chrono ») : op « chrono_note » (une ligne
 *     par jour, dans la généalogie du dossier, même si c'est une autre que celle ouverte), « chrono_undo » ;
 *  B2 🔔 la cloche lit l'index léger (succ_index, « due_items » : échéances non faites et relances des courriers des dossiers,
 *     jusqu'à 7 jours devant ; jamais un nom d'héritier vivant ni une adresse) ; « due_mark » : ✓ fait / ⏭ reporter, écrit dans
 *     la généalogie du dossier (comme ⇄ Déplacer), avec ↶ Annuler et une ligne au journal du dossier ;
 *  B6 ✉️ modèles de courriers à soi : table succ_templates, dans la généalogie des dossiers (communs à tous ses dossiers) ;
 *     « file_letters » / « unfile_letters » : toute une série rangée (ou retirée) d'un coup, une seule ligne au journal.
 *  B5 📊 l'actif net n'est jamais envoyé ici : rien n'est gardé (ni base, ni journal) ; seule une ligne « Parts en euros imprimées ».
 * Migration 93 : table succ_templates, colonne succ_fees.source.
 * Confidentialité : rien en mode consultation (successoral_api_* le refusent) ; aucun export ne lit ces tables.
 */

const SUCC_TPL_KINDS = ['contact', 'contrat', 'relance', 'autre'];
const SUCC_LETTER_KIND_LABELS = ['contact' => 'premier contact', 'contrat' => 'contrat de révélation', 'relance' => 'relance', 'etranger' => 'héritier à l’étranger', 'acte' => 'demande d’acte'];

/** migration 93 : les modèles de courriers à soi, et d'où vient une ligne de temps (« chrono » = ⏱ chronomètre) */
function succ_outils_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS succ_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'autre',
        body TEXT NOT NULL DEFAULT '', deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    if ((bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='succ_fees'")->fetchColumn()
        && !(bool) $pdo->query("SELECT 1 FROM pragma_table_info('succ_fees') WHERE name='source'")->fetchColumn()) {
        $pdo->exec("ALTER TABLE succ_fees ADD COLUMN source TEXT NOT NULL DEFAULT ''");
    }
}
function succ_outils_ready(PDO $pdo): bool
{
    static $ok = [];
    $k = spl_object_id($pdo);
    if (!empty($ok[$k])) { return true; }
    try {
        $t = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='succ_templates'")->fetchColumn();
        $c = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('succ_fees') WHERE name='source'")->fetchColumn();
    } catch (Throwable $_) { return false; }
    return $ok[$k] = $t && $c;
}
function succ_outils_ensure(PDO $pdo): void { if (!succ_outils_ready($pdo)) { succ_outils_schema($pdo); } }

/* ═════════ B2. 🔔 Les échéances d'un dossier, pour l'index léger ═════════ */
/** échéances non faites et relances de courriers jusqu'à 7 jours devant : date, texte, sorte (jamais un nom d'héritier ni une adresse) */
function succ_due_items(PDO $pdo, int $caseId): array
{
    $until = date('Y-m-d', strtotime('+7 days'));
    $out = [];
    $s = $pdo->prepare("SELECT id, due, label, kind FROM succ_deadlines WHERE case_id=? AND deleted_at IS NULL AND done=0 AND due<>'' AND due<=? ORDER BY due, id LIMIT 60");
    $s->execute([$caseId, $until]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $d) { $out[] = ['kind' => 'deadline', 'id' => (int) $d['id'], 'due' => (string) $d['due'], 'label' => (string) $d['label'], 'sort' => (string) $d['kind']]; }
    try {
        $c = $pdo->prepare("SELECT id, relance_date, succ_kind FROM courriers WHERE succ_case_id=? AND relance_date<>'' AND relance_date IS NOT NULL AND relance_date<=?
            AND COALESCE(reponse,'') IN ('','none') AND COALESCE(signe_le,'')='' AND statut<>'reponse_recue' ORDER BY relance_date, id LIMIT 60");
        $c->execute([$caseId, $until]);
        foreach ($c->fetchAll(PDO::FETCH_ASSOC) as $k) { $out[] = ['kind' => 'relance', 'id' => (int) $k['id'], 'due' => (string) $k['relance_date'], 'label' => 'Relance courrier n° ' . (int) $k['id'] . ' — ' . (SUCC_LETTER_KIND_LABELS[(string) $k['succ_kind']] ?? 'courrier'), 'sort' => (string) $k['succ_kind']]; }
    } catch (Throwable $_) {}
    if (function_exists('succ_p2_due_items')) { $out = array_merge($out, succ_p2_due_items($pdo, $caseId, $until)); } // 🗓 📮 💶 📅 (successoral_plus2.php)
    return $out;
}

/** la base d'une généalogie pour y écrire : celle ouverte, ou une autre (comme ⇄ Déplacer) */
function succ_outils_base(PDO $pdo, string $gid): PDO
{
    if ($gid === '' || $gid === succ_gid()) { return $pdo; }
    if (!isset(succ_genealogies()[$gid])) { throw new LcndaBadInput('Généalogie introuvable.'); }
    $to = succ_open_rw($gid);
    successoral_schema($to); succ_outils_ensure($to);
    return $to;
}
function succ_outils_in(PDO $base, callable $fn): array
{
    $own = !$base->inTransaction();
    if ($own) { $base->beginTransaction(); }
    try { $r = $fn($base); if ($own) { $base->commit(); } return $r; }
    catch (Throwable $e) { if ($own && $base->inTransaction()) { $base->rollBack(); } throw $e; }
}

/** ✓ fait, ⏭ reporter, ↶ annuler une échéance ou une relance, dans la généalogie du dossier */
function succ_due_mark(PDO $pdo, array $d): array
{
    $gid = (string) ($d['gid'] ?? succ_gid());
    $kind = ($d['kind'] ?? '') === 'relance' ? 'relance' : 'deadline';
    $act = in_array($d['act'] ?? '', ['done', 'snooze', 'undo'], true) ? (string) $d['act'] : 'done';
    $id = safe_int($d['id'] ?? 0);
    $base = succ_outils_base($pdo, $gid);
    return succ_outils_in($base, static function (PDO $b) use ($kind, $act, $id, $d): array {
        if ($kind === 'deadline') {
            $s = $b->prepare('SELECT id, case_id, due, label, done FROM succ_deadlines WHERE id=? AND deleted_at IS NULL'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
            if (!$r) { throw new LcndaBadInput('Échéance introuvable.'); }
            $prev = ['due' => (string) $r['due'], 'done' => (int) $r['done']];
            if ($act === 'undo') {
                $p = is_array($d['prev'] ?? null) ? $d['prev'] : [];
                $due = succ_txt($p['due'] ?? $r['due'], 10); if (!succ_date_ok($due)) { $due = (string) $r['due']; }
                $b->prepare('UPDATE succ_deadlines SET due=?, done=? WHERE id=?')->execute([$due, !empty($p['done']) ? 1 : 0, $id]);
                succ_journal($b, (int) $r['case_id'], 'deadline', 'Échéance remise comme avant : ' . $r['label']);
            } elseif ($act === 'done') {
                $b->prepare('UPDATE succ_deadlines SET done=1 WHERE id=?')->execute([$id]);
                succ_journal($b, (int) $r['case_id'], 'deadline', 'Échéance faite : ' . $r['label']);
            } else {
                $to = succ_txt($d['to'] ?? '', 10); if (!succ_date_ok($to)) { throw new LcndaBadInput('Date incorrecte.'); }
                $b->prepare('UPDATE succ_deadlines SET due=? WHERE id=?')->execute([$to, $id]);
                succ_journal($b, (int) $r['case_id'], 'deadline', 'Échéance reportée au ' . $to . ' : ' . $r['label']);
            }
            succ_touch($b, (int) $r['case_id']);
            return ['kind' => $kind, 'id' => $id, 'prev' => $prev];
        }
        $s = $b->prepare('SELECT id, succ_case_id, relance_date, statut FROM courriers WHERE id=? AND succ_case_id IS NOT NULL'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
        if (!$r) { throw new LcndaBadInput('Courrier introuvable.'); }
        $prev = ['relance_date' => (string) $r['relance_date']];
        if ($act === 'undo') {
            $p = is_array($d['prev'] ?? null) ? $d['prev'] : [];
            $to = succ_txt($p['relance_date'] ?? '', 10); if ($to !== '' && !succ_date_ok($to)) { $to = (string) $r['relance_date']; }
            $b->prepare('UPDATE courriers SET relance_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$to, $id]);
            succ_journal($b, (int) $r['succ_case_id'], 'courrier', 'Relance du courrier n° ' . $id . ' remise comme avant');
        } elseif ($act === 'done') {
            $b->prepare("UPDATE courriers SET relance_date='', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$id]);
            succ_journal($b, (int) $r['succ_case_id'], 'courrier', 'Relance faite : courrier n° ' . $id);
        } else {
            $to = succ_txt($d['to'] ?? '', 10); if (!succ_date_ok($to)) { throw new LcndaBadInput('Date incorrecte.'); }
            $b->prepare('UPDATE courriers SET relance_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$to, $id]);
            succ_journal($b, (int) $r['succ_case_id'], 'courrier', 'Relance du courrier n° ' . $id . ' reportée au ' . $to);
        }
        succ_touch($b, (int) $r['succ_case_id']);
        return ['kind' => $kind, 'id' => $id, 'prev' => $prev];
    });
}

/* ═════════ B1. ⏱ Le temps compté par le chronomètre ═════════ */
/** une ligne de temps par jour (découpée à minuit côté navigateur), dans la généalogie du dossier */
function succ_chrono_note(PDO $pdo, array $d): array
{
    $gid = (string) ($d['gid'] ?? succ_gid());
    $cid = safe_int($d['case_id'] ?? 0);
    $days = array_slice(is_array($d['days'] ?? null) ? $d['days'] : [], 0, 31);
    $label = succ_txt($d['label'] ?? '', 300);
    $clean = [];
    foreach ($days as $x) {
        $day = succ_txt(is_array($x) ? ($x['day'] ?? '') : '', 10); $min = max(0, min(1440, safe_int(is_array($x) ? ($x['minutes'] ?? 0) : 0)));
        if (!succ_date_ok($day)) { throw new LcndaBadInput('Date incorrecte.'); }
        if ($min > 0) { $clean[] = [$day, $min]; }
    }
    if (!$clean) { throw new LcndaBadInput('Combien de temps ?'); }
    $base = succ_outils_base($pdo, $gid);
    return succ_outils_in($base, static function (PDO $b) use ($cid, $clean, $label): array {
        $c = succ_row($b, $cid);
        if (in_array((string) $c['state'], ['clos', 'archive'], true)) { throw new LcndaBadInput('Ce dossier est clos : rien ne s’y note.'); }
        $ids = [];
        foreach ($clean as [$day, $min]) {
            $b->prepare("INSERT INTO succ_fees(case_id, kind, day, label, minutes, source) VALUES(?, 'time', ?, ?, ?, 'chrono')")->execute([$cid, $day, $label, $min]);
            $ids[] = (int) $b->lastInsertId();
            succ_journal($b, $cid, 'fee', '⏱ Temps compté par le chronomètre : ' . intdiv($min, 60) . ' h ' . str_pad((string) ($min % 60), 2, '0', STR_PAD_LEFT) . ' (' . $day . ')' . ($label !== '' ? ' — ' . $label : ''));
        }
        succ_touch($b, $cid);
        return ['ids' => $ids, 'case_id' => $cid];
    });
}
function succ_chrono_undo(PDO $pdo, array $d): array
{
    $gid = (string) ($d['gid'] ?? succ_gid());
    $cid = safe_int($d['case_id'] ?? 0);
    $ids = array_slice(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : []), 0, 31);
    $base = succ_outils_base($pdo, $gid);
    return succ_outils_in($base, static function (PDO $b) use ($cid, $ids): array {
        succ_row($b, $cid);
        foreach ($ids as $id) { $b->prepare('UPDATE succ_fees SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND case_id=?')->execute([$id, $cid]); }
        return ['ok' => true];
    });
}

/* ═════════ B6. ✉️ Les modèles de courriers à soi et les courriers en série ═════════ */
function succ_tpl_list(PDO $pdo): array
{
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'kind' => (string) $r['kind'], 'body' => (string) $r['body'], 'updated_at' => (string) $r['updated_at']],
        $pdo->query('SELECT id, name, kind, body, updated_at FROM succ_templates WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id')->fetchAll(PDO::FETCH_ASSOC));
}
function succ_tpl_save(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $name = succ_txt($d['name'] ?? '', 120); if ($name === '') { throw new LcndaBadInput('Donne un nom au modèle.'); }
    $body = succ_txt($d['body'] ?? '', 20000, true); if ($body === '') { throw new LcndaBadInput('La lettre est vide.'); }
    $kind = in_array($d['kind'] ?? '', SUCC_TPL_KINDS, true) ? (string) $d['kind'] : 'autre';
    $prev = null;
    if ($id) {
        $s = $pdo->prepare('SELECT name, kind, body FROM succ_templates WHERE id=? AND deleted_at IS NULL'); $s->execute([$id]); $prev = $s->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$prev) { throw new LcndaBadInput('Modèle introuvable.'); }
        $pdo->prepare('UPDATE succ_templates SET name=?, kind=?, body=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $kind, $body, $id]);
    } else {
        $pdo->prepare('INSERT INTO succ_templates(name, kind, body) VALUES(?,?,?)')->execute([$name, $kind, $body]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['id' => $id, 'prev' => $prev];
}
function succ_tpl_delete(PDO $pdo, array $d, bool $restore = false): array
{
    $id = safe_int($d['id'] ?? 0);
    $pdo->prepare('UPDATE succ_templates SET deleted_at=' . ($restore ? 'NULL' : 'CURRENT_TIMESTAMP') . ' WHERE id=?')->execute([$id]);
    return ['id' => $id];
}
/** toute une série de lettres rangée d'un coup dans le Registre de courriers ; une ligne au journal pour la série */
function succ_file_letters(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    $letters = is_array($d['letters'] ?? null) ? $d['letters'] : [];
    if (!$letters) { throw new LcndaBadInput('Coche au moins un héritier.'); }
    if (count($letters) > 60) { throw new LcndaBadInput('Trop de lettres d’un coup (60 au plus).'); }
    $kind = in_array($d['kind'] ?? '', ['contact', 'contrat', 'relance'], true) ? (string) $d['kind'] : 'contact';
    $ids = [];
    foreach ($letters as $l) {
        if (!is_array($l)) { continue; }
        $r = succ_file_letter($pdo, ['case_id' => $cid, 'person_id' => $l['person_id'] ?? 0, 'kind' => $kind, 'letter' => $l['letter'] ?? '', 'objet' => $d['objet'] ?? '', 'date_envoi' => $d['date_envoi'] ?? date('Y-m-d'),
            'relance_jours' => $d['relance_jours'] ?? 30, 'recipient_address' => $l['recipient_address'] ?? '', 'recipient_email' => $l['recipient_email'] ?? '', 'quiet' => 1]);
        $ids[] = (int) $r['courrier_id'];
    }
    if (empty($d['quiet'])) {
        succ_journal($pdo, $cid, 'courrier', 'Courriers en série : ' . (SUCC_LETTER_KIND_LABELS[$kind] ?? $kind) . ' à ' . count($ids) . ' héritier(s) (n° ' . min($ids) . (count($ids) > 1 ? ' à ' . max($ids) : '') . ')');
    }
    return ['ids' => $ids];
}
function succ_unfile_letters(PDO $pdo, array $d): array
{
    $cid = safe_int($d['case_id'] ?? 0); succ_row($pdo, $cid);
    $ids = array_slice(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : []), 0, 2000);
    $n = 0;
    foreach ($ids as $kid) {
        $s = $pdo->prepare("SELECT id FROM courriers WHERE id=? AND succ_case_id=? AND succ_kind IN ('contact','contrat','relance','etranger')"); $s->execute([$kid, $cid]);
        if (!$s->fetchColumn()) { continue; }
        $pdo->prepare('DELETE FROM courriers WHERE id=?')->execute([$kid]); $n++;
    }
    if ($n) { succ_journal($pdo, $cid, 'courrier', 'Courriers en série annulés : ' . $n . ' retiré(s) du registre (n° ' . min($ids) . ($n > 1 ? ' à ' . max($ids) : '') . ')'); }
    return ['removed' => $n];
}

/* ═════════ API ═════════ */
function succ_outils_get(PDO $pdo, string $op, array $g): ?array
{
    return match ($op) {
        'tpl_list' => ['items' => succ_tpl_list($pdo)],
        // 🔔 « Ajouter mes rappels » : les ⏰ Rappels de la généalogie ouverte (hors dossiers), comme 🗓 Ma semaine (lib/semaine.php)
        'rappels' => ['items' => function_exists('semaine_rappels') ? array_values(array_map(static fn($x) => ['key' => (string) $x['key'], 'id' => (string) $x['key'], 'due' => (string) $x['date'], 'label' => (string) $x['title']],
            array_filter(semaine_rappels($pdo), static fn($x) => str_starts_with((string) ($x['key'] ?? ''), 'rappel:')))) : []],
        default => null,
    };
}
function succ_outils_post(PDO $pdo, string $op, array $d): ?array
{
    return match ($op) {
        'due_mark' => succ_due_mark($pdo, $d),
        'chrono_note' => succ_chrono_note($pdo, $d),
        'chrono_undo' => succ_chrono_undo($pdo, $d),
        'tpl_save' => succ_tpl_save($pdo, $d),
        'tpl_delete' => succ_tpl_delete($pdo, $d),
        'tpl_restore' => succ_tpl_delete($pdo, $d, true),
        'file_letters' => succ_file_letters($pdo, $d),
        'unfile_letters' => succ_unfile_letters($pdo, $d),
        default => null,
    };
}
