<?php
declare(strict_types=1);

/**
 * ⚖️ Dossiers de preuve et 🛡 solidité des liens (migration 88).
 *
 * Construit sur ce qui existe : les sources et leurs citations (sources, source_links avec la qualité QUAY 0–3 des imports
 * GEDCOM / Gramps / RootsMagic), le Journal des recherches (archive_digest_entries, sorte « digest » du menu de choix),
 * les liens parent-enfant (families, family_children), les numéros Sosa (sosa_positions), les Murs de brique
 * (lib/ou_chercher.php) et « Ma semaine de recherche » (lib/semaine.php). Les « ⚖️ Hypothèses à comparer »
 * (lib/hypothesis_compare.php, plusieurs réponses possibles) et les « Preuves » de la fiche (evidence_records) restent
 * à leur place : un dossier de preuve répond à UNE question (oui / non) et en garde le raisonnement.
 *
 * Un dossier (proof_cases) : sujet (parent, couple, date, lieu, même personne, autre), personne, autre personne, événement,
 * question, conclusion écrite, certitude (proved prouvé · probable · possible · refuted réfuté · tocheck à vérifier).
 * Ses lignes (proof_items) : indices POUR et CONTRE (texte, source ou citation, sorte direct / indirect / négatif,
 * qualité originale / dérivée / auteur), recherches faites (dépouillement du Journal), conflits et leur résolution.
 * Supprimer = mis de côté (deleted_at), « ↶ Annuler » le remet ; ménage après 30 jours.
 *
 * Solidité d'un lien parent → enfant : le dossier « parent » prime (sauf « à vérifier »), puis le choix à la main
 * (link_strength), puis le calcul (règles écrites dans solidite_rules()). Résultat gardé dans DATA_DIR/cache/solidite.json
 * tant que la base ne change pas (même principe que le Contrôle de la base). Rien n'est changé dans la base sans action.
 *
 *  GET  preuve&op=list | case&id= | find&subject=&person_id=&related_id= | person&id= | pairs&ids= | fragiles | summary | rules
 *  POST preuve_write {op: save_case | delete_case | restore_case | save_item | delete_item | restore_item | manual_set | manual_restore}
 *  Menu de choix : sorte « citation » (picker_citations).
 */

const PREUVE_VERSION = 1; // à monter quand une règle de solidité change : le cache est refait
const PREUVE_SUBJECTS = ['parent', 'couple', 'date', 'place', 'identity', 'other'];
const PREUVE_CERTAINTY = ['tocheck', 'proved', 'probable', 'possible', 'refuted'];
const PREUVE_ITEM_KINDS = ['for', 'against', 'research', 'conflict'];
const PREUVE_EVIDENCE = ['', 'direct', 'indirect', 'negative'];
const PREUVE_QUALITY = ['', 'original', 'derived', 'authored'];
const SOLIDITE_LEVELS = ['proved', 'probable', 'supposed', 'unsourced', 'refuted'];
const PREUVE_MAX_ITEMS = 200;

/* ═════════════════════════ Structure ═════════════════════════ */

function preuve_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS proof_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL DEFAULT 'parent',
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        related_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
        question TEXT NOT NULL DEFAULT '',
        conclusion TEXT NOT NULL DEFAULT '',
        certainty TEXT NOT NULL DEFAULT 'tocheck',
        deleted_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_proof_cases_person ON proof_cases(person_id, related_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS proof_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER NOT NULL REFERENCES proof_cases(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'for',
        text TEXT NOT NULL DEFAULT '',
        ref_kind TEXT NOT NULL DEFAULT '',
        ref_id INTEGER NOT NULL DEFAULT 0,
        evidence TEXT NOT NULL DEFAULT '',
        quality TEXT NOT NULL DEFAULT '',
        resolution TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_proof_items_case ON proof_items(case_id, kind)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS link_strength (
        child_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        parent_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        level TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(child_id, parent_id))");
}

function preuve_ready(PDO $pdo): bool
{
    static $ok = null;
    if ($ok === null || $ok === false) { $ok = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='proof_cases'")->fetchColumn(); }
    return $ok;
}

function preuve_need(PDO $pdo): void
{
    if (!preuve_ready($pdo)) { throw new RuntimeException('Les dossiers de preuve ne sont pas encore prêts : relance l’app.'); }
}

/* ═════════════════════════ Petits outils ═════════════════════════ */

function preuve_fold(string $s): string
{
    $f = function_exists('ascii_fold') ? ascii_fold($s) : $s;
    return ' ' . trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower($f))) . ' ';
}

function preuve_text(mixed $v, int $max): string
{
    $t = trim(str_replace("\0", '', scalar_text($v)));
    return mb_substr($t, 0, $max);
}

function preuve_person(PDO $pdo, int $id): ?array
{
    if ($id <= 0) { return null; }
    $s = $pdo->prepare("SELECT id, first_name, last_name, gender, is_private,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=persons.id AND t.slug IN ('birth','baptism') ORDER BY t.slug='baptism', e.id LIMIT 1) AS by_,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=persons.id AND t.slug IN ('death','burial') ORDER BY t.slug='burial', e.id LIMIT 1) AS dy_
        FROM persons WHERE id=?");
    $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { return null; }
    $name = trim(trim((string) $r['first_name']) . ' ' . mb_strtoupper(trim((string) $r['last_name'])));
    $years = ($r['by_'] || $r['dy_']) ? (($r['by_'] ?: '?') . '–' . ($r['dy_'] ?: '')) : '';
    return ['id' => (int) $r['id'], 'name' => $name !== '' ? $name : 'Sans nom', 'first_name' => (string) $r['first_name'], 'last_name' => (string) $r['last_name'],
        'gender' => (string) $r['gender'], 'years' => $years];
}

/** « le fils » / « la fille » / « l’enfant » selon le genre */
function preuve_child_word(string $gender): string
{
    return $gender === 'male' ? 'le fils' : ($gender === 'female' ? 'la fille' : 'l’enfant');
}

/** « de Pierre » / « d’Anne » */
function preuve_de(string $name): string
{
    return preg_match('/^[aeiouyhàâéèêëîïôöûü]/iu', $name) ? 'd’' . $name : 'de ' . $name;
}

/** La question proposée d'office : « Jean MARTIN est-il bien le fils de Pierre MARTIN ? » */
function preuve_default_question(PDO $pdo, string $subject, int $pid, int $rid, int $eid): string
{
    $p = preuve_person($pdo, $pid); $r = preuve_person($pdo, $rid);
    $pn = $p['name'] ?? 'Cette personne';
    $il = ($p['gender'] ?? '') === 'female' ? 'elle' : 'il';
    $ev = null;
    if ($eid) { $s = $pdo->prepare('SELECT t.label, e.date_text, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id=?'); $s->execute([$eid]); $ev = $s->fetch(PDO::FETCH_ASSOC) ?: null; }
    return match ($subject) {
        'parent' => $r ? "{$pn} est-{$il} bien " . preuve_child_word($p['gender'] ?? '') . ' ' . preuve_de($r['name']) . ' ?' : 'Qui sont les parents ' . preuve_de($pn) . ' ?',
        'couple' => $r ? "{$pn} et {$r['name']} formaient-ils bien un couple ?" : "Avec qui {$pn} était-{$il} en couple ?",
        'date' => $ev ? "La date de " . mb_strtolower((string) $ev['label']) . " de {$pn} (" . ($ev['date_text'] ?: 'sans date') . ') est-elle juste ?' : "Cette date est-elle juste pour {$pn} ?",
        'place' => $ev ? "Le lieu de " . mb_strtolower((string) $ev['label']) . " de {$pn} (" . ($ev['place'] ?: 'sans lieu') . ') est-il juste ?' : "Ce lieu est-il juste pour {$pn} ?",
        'identity' => $r ? "{$pn} et {$r['name']} sont-ils la même personne ?" : "{$pn} est-{$il} bien la personne de cet acte ?",
        default => "Ce fait sur {$pn} est-il juste ?",
    };
}

/* ═════════════════════════ Lecture des dossiers ═════════════════════════ */

function preuve_case_row(PDO $pdo, int $id, bool $withDeleted = false): array
{
    preuve_need($pdo);
    $s = $pdo->prepare('SELECT * FROM proof_cases WHERE id=?' . ($withDeleted ? '' : " AND deleted_at=''"));
    $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Dossier de preuve introuvable.'); }
    return $r;
}

/** Une ligne d'un dossier, avec ce qu'il faut pour l'afficher (titre de la source ou de la citation, du dépouillement). */
function preuve_item_view(PDO $pdo, array $r): array
{
    $ref = null;
    $kind = (string) $r['ref_kind']; $rid = (int) $r['ref_id'];
    if ($rid > 0 && $kind === 'source') {
        $s = $pdo->prepare('SELECT id, title, author, agency FROM sources WHERE id=?'); $s->execute([$rid]);
        if ($x = $s->fetch(PDO::FETCH_ASSOC)) { $ref = ['kind' => 'source', 'id' => (int) $x['id'], 'title' => trim((string) $x['title']) ?: 'Source sans titre', 'meta' => trim(implode(' · ', array_filter([(string) $x['author'], (string) $x['agency']])))]; }
    } elseif ($rid > 0 && $kind === 'citation') {
        $c = picker_citations($pdo, '', 0, 1, [$rid]);
        if ($c['items']) { $it = $c['items'][0]; $ref = ['kind' => 'citation', 'id' => $rid, 'title' => $it['title'], 'meta' => $it['meta'], 'quay' => $it['quay'] ?? '']; }
    } elseif ($rid > 0 && $kind === 'digest' && preuve_table($pdo, 'archive_digest_entries') && function_exists('picker_digests')) {
        $keep = picker_ids(); picker_ids([$rid]); // le même titre que dans le menu de choix et le Journal des recherches
        try { $d = picker_digests($pdo, '', 0, 1); } finally { picker_ids($keep); }
        if ($d['items']) { $it = $d['items'][0]; $ref = ['kind' => 'digest', 'id' => $rid, 'title' => $it['title'], 'meta' => $it['meta'], 'result' => $it['badge']]; }
    }
    return ['id' => (int) $r['id'], 'kind' => (string) $r['kind'], 'text' => (string) $r['text'], 'ref_kind' => $ref ? $kind : '', 'ref_id' => $ref ? $rid : 0, 'ref' => $ref,
        'evidence' => (string) $r['evidence'], 'quality' => (string) $r['quality'], 'resolution' => (string) $r['resolution'], 'position' => (int) $r['position'],
        'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at']];
}

function preuve_table(PDO $pdo, string $t): bool
{
    static $memo = [];
    if (!isset($memo[$t])) { $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]); $memo[$t] = (bool) $s->fetchColumn(); }
    return $memo[$t];
}

function preuve_case_view(PDO $pdo, array $c, bool $items = true): array
{
    $out = ['id' => (int) $c['id'], 'subject' => (string) $c['subject'], 'person_id' => (int) $c['person_id'], 'related_id' => (int) ($c['related_id'] ?? 0),
        'event_id' => (int) ($c['event_id'] ?? 0), 'question' => (string) $c['question'], 'conclusion' => (string) $c['conclusion'], 'certainty' => (string) $c['certainty'],
        'created_at' => (string) $c['created_at'], 'updated_at' => (string) $c['updated_at'],
        'person' => preuve_person($pdo, (int) $c['person_id']), 'related' => preuve_person($pdo, (int) ($c['related_id'] ?? 0))];
    if ($out['event_id']) {
        $s = $pdo->prepare('SELECT e.id, t.label, e.date_text, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id=?');
        $s->execute([$out['event_id']]);
        $out['event'] = $s->fetch(PDO::FETCH_ASSOC) ?: null;
    }
    if ($items) {
        $s = $pdo->prepare("SELECT * FROM proof_items WHERE case_id=? AND deleted_at='' ORDER BY position, id");
        $s->execute([(int) $c['id']]);
        $out['items'] = array_map(static fn($r) => preuve_item_view($pdo, $r), $s->fetchAll(PDO::FETCH_ASSOC));
    }
    return $out;
}

function preuve_list(PDO $pdo): array
{
    if (!preuve_ready($pdo)) { return ['items' => [], 'counts' => ['all' => 0]]; }
    $rows = $pdo->query("SELECT c.*,
            (SELECT count(*) FROM proof_items i WHERE i.case_id=c.id AND i.deleted_at='' AND i.kind='for') AS n_for,
            (SELECT count(*) FROM proof_items i WHERE i.case_id=c.id AND i.deleted_at='' AND i.kind='against') AS n_against,
            (SELECT count(*) FROM proof_items i WHERE i.case_id=c.id AND i.deleted_at='' AND i.kind='research') AS n_research,
            (SELECT count(*) FROM proof_items i WHERE i.case_id=c.id AND i.deleted_at='' AND i.kind='conflict') AS n_conflict,
            (SELECT count(*) FROM proof_items i WHERE i.case_id=c.id AND i.deleted_at='' AND i.kind='conflict' AND trim(i.resolution)='') AS n_open
        FROM proof_cases c WHERE c.deleted_at='' ORDER BY c.updated_at DESC, c.id DESC LIMIT 2000")->fetchAll(PDO::FETCH_ASSOC);
    $counts = ['all' => count($rows)];
    $items = [];
    foreach ($rows as $r) {
        $v = preuve_case_view($pdo, $r, false);
        foreach (['n_for', 'n_against', 'n_research', 'n_conflict', 'n_open'] as $k) { $v[$k] = (int) $r[$k]; }
        $counts[$v['certainty']] = ($counts[$v['certainty']] ?? 0) + 1;
        $counts['s_' . $v['subject']] = ($counts['s_' . $v['subject']] ?? 0) + 1;
        $items[] = $v;
    }
    return ['items' => $items, 'counts' => $counts];
}

/** Le dossier déjà ouvert pour la même question (pour ne pas en créer deux). */
function preuve_find(PDO $pdo, array $g): array
{
    if (!preuve_ready($pdo)) { return ['case' => null, 'question' => '']; }
    $subject = in_array(($g['subject'] ?? ''), PREUVE_SUBJECTS, true) ? (string) $g['subject'] : 'parent';
    $pid = safe_int($g['person_id'] ?? 0); $rid = safe_int($g['related_id'] ?? 0); $eid = safe_int($g['event_id'] ?? 0);
    // CAST : une valeur liée arrive en texte, et COALESCE(…) n'a pas d'affinité (« 4 » ≠ 4)
    $s = $pdo->prepare("SELECT * FROM proof_cases WHERE deleted_at='' AND subject=? AND ((person_id=CAST(? AS INTEGER) AND COALESCE(related_id,0)=CAST(? AS INTEGER) AND COALESCE(event_id,0)=CAST(? AS INTEGER))" . ($subject === 'couple' || $subject === 'identity' ? ' OR (person_id=CAST(? AS INTEGER) AND COALESCE(related_id,0)=CAST(? AS INTEGER))' : '') . ') ORDER BY updated_at DESC LIMIT 1');
    $s->execute($subject === 'couple' || $subject === 'identity' ? [$subject, $pid, $rid, $eid, $rid, $pid] : [$subject, $pid, $rid, $eid]);
    $c = $s->fetch(PDO::FETCH_ASSOC);
    return ['case' => $c ? preuve_case_view($pdo, $c) : null, 'question' => preuve_default_question($pdo, $subject, $pid, $rid, $eid)];
}

function preuve_person_cases(PDO $pdo, int $pid): array
{
    if (!preuve_ready($pdo) || !$pid) { return []; }
    $s = $pdo->prepare("SELECT * FROM proof_cases WHERE deleted_at='' AND (person_id=? OR related_id=?) ORDER BY updated_at DESC LIMIT 100");
    $s->execute([$pid, $pid]);
    return array_map(static fn($c) => preuve_case_view($pdo, $c, false), $s->fetchAll(PDO::FETCH_ASSOC));
}

/* ═════════════════════════ Écriture des dossiers ═════════════════════════ */

function preuve_unlocked(PDO $pdo, int $pid): void
{
    if ($pid && function_exists('assert_person_unlocked')) { assert_person_unlocked($pdo, $pid); }
}

function preuve_person_exists(PDO $pdo, int $id): bool
{
    $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$id]);
    return (bool) $s->fetchColumn();
}

function preuve_save_case(PDO $pdo, array $d): array
{
    preuve_need($pdo);
    $id = safe_int($d['id'] ?? 0);
    $old = $id ? preuve_case_row($pdo, $id) : null;
    $subject = in_array(($d['subject'] ?? ($old['subject'] ?? '')), PREUVE_SUBJECTS, true) ? (string) ($d['subject'] ?? $old['subject']) : 'parent';
    $pid = safe_int($d['person_id'] ?? ($old['person_id'] ?? 0));
    if (!$pid || !preuve_person_exists($pdo, $pid)) { throw new LcndaBadInput('Choisis la personne du dossier.'); }
    $rid = safe_int($d['related_id'] ?? ($old['related_id'] ?? 0));
    if ($rid && (!preuve_person_exists($pdo, $rid) || $rid === $pid)) { throw new LcndaBadInput('Choisis une autre personne.'); }
    if (in_array($subject, ['parent', 'couple', 'identity'], true) && !$rid) { throw new LcndaBadInput($subject === 'parent' ? 'Choisis le parent.' : ($subject === 'couple' ? 'Choisis le conjoint.' : 'Choisis l’autre fiche.')); }
    $eid = safe_int($d['event_id'] ?? ($old['event_id'] ?? 0));
    if ($eid) {
        $s = $pdo->prepare('SELECT 1 FROM events WHERE id=? AND (person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))');
        $s->execute([$eid, $pid, $pid, $pid]);
        if (!$s->fetchColumn()) { throw new LcndaBadInput('Cet événement n’est pas sur la fiche de cette personne.'); }
    }
    $question = array_key_exists('question', $d) ? preuve_text($d['question'], 500) : (string) ($old['question'] ?? '');
    if ($question === '') { $question = preuve_default_question($pdo, $subject, $pid, $rid, $eid); }
    $conclusion = array_key_exists('conclusion', $d) ? preuve_text($d['conclusion'], 20000) : (string) ($old['conclusion'] ?? '');
    $certainty = in_array(($d['certainty'] ?? ($old['certainty'] ?? 'tocheck')), PREUVE_CERTAINTY, true) ? (string) ($d['certainty'] ?? $old['certainty'] ?? 'tocheck') : 'tocheck';
    preuve_unlocked($pdo, $pid);
    if ($old && (int) $old['person_id'] !== $pid) { preuve_unlocked($pdo, (int) $old['person_id']); }
    if ($old) {
        $pdo->prepare('UPDATE proof_cases SET subject=?, person_id=?, related_id=?, event_id=?, question=?, conclusion=?, certainty=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$subject, $pid, $rid ?: null, $eid ?: null, $question, $conclusion, $certainty, $id]);
    } else {
        $pdo->prepare('INSERT INTO proof_cases(subject, person_id, related_id, event_id, question, conclusion, certainty) VALUES(?,?,?,?,?,?,?)')
            ->execute([$subject, $pid, $rid ?: null, $eid ?: null, $question, $conclusion, $certainty]);
        $id = (int) $pdo->lastInsertId();
    }
    if (function_exists('log_change')) { log_change($pdo, 'person', $pid, $old ? 'proof-update' : 'proof-create', ($old ? 'Dossier de preuve modifié : ' : 'Dossier de preuve créé : ') . $question); }
    $prev = $old ? ['question' => (string) $old['question'], 'conclusion' => (string) $old['conclusion'], 'certainty' => (string) $old['certainty']] : null;
    return ['case' => preuve_case_view($pdo, preuve_case_row($pdo, $id)), 'prev' => $prev, 'created' => !$old];
}

function preuve_delete_case(PDO $pdo, array $d, bool $restore = false): array
{
    $c = preuve_case_row($pdo, safe_int($d['id'] ?? 0), true);
    preuve_unlocked($pdo, (int) $c['person_id']);
    if ($restore) {
        $pdo->prepare("UPDATE proof_cases SET deleted_at='', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([(int) $c['id']]);
    } else {
        if ((string) $c['deleted_at'] !== '') { throw new RuntimeException('Ce dossier est déjà supprimé.'); }
        $pdo->prepare('UPDATE proof_cases SET deleted_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $c['id']]);
        // ménage : les dossiers mis de côté depuis plus de 30 jours partent pour de bon
        $pdo->exec("DELETE FROM proof_cases WHERE deleted_at<>'' AND deleted_at < datetime('now','-30 days')");
        $pdo->exec("DELETE FROM proof_items WHERE deleted_at<>'' AND deleted_at < datetime('now','-30 days')");
    }
    return ['ok' => true, 'id' => (int) $c['id'], 'question' => (string) $c['question']];
}

function preuve_ref_ok(PDO $pdo, string $kind, int $id): bool
{
    if (!$id) { return true; }
    return match ($kind) {
        'source' => (bool) $pdo->query('SELECT 1 FROM sources WHERE id=' . $id)->fetchColumn(),
        'citation' => (bool) $pdo->query('SELECT 1 FROM source_links WHERE id=' . $id)->fetchColumn(),
        'digest' => preuve_table($pdo, 'archive_digest_entries') && (bool) $pdo->query('SELECT 1 FROM archive_digest_entries WHERE id=' . $id)->fetchColumn(),
        default => false,
    };
}

function preuve_save_item(PDO $pdo, array $d): array
{
    preuve_need($pdo);
    $id = safe_int($d['id'] ?? 0);
    $old = null;
    if ($id) { $s = $pdo->prepare("SELECT * FROM proof_items WHERE id=? AND deleted_at=''"); $s->execute([$id]); $old = $s->fetch(PDO::FETCH_ASSOC) ?: null; if (!$old) { throw new RuntimeException('Ligne du dossier introuvable.'); } }
    $caseId = $old ? (int) $old['case_id'] : safe_int($d['case_id'] ?? 0);
    $c = preuve_case_row($pdo, $caseId);
    preuve_unlocked($pdo, (int) $c['person_id']);
    $kind = in_array(($d['kind'] ?? ($old['kind'] ?? 'for')), PREUVE_ITEM_KINDS, true) ? (string) ($d['kind'] ?? $old['kind']) : 'for';
    $text = array_key_exists('text', $d) ? preuve_text($d['text'], 4000) : (string) ($old['text'] ?? '');
    $refKind = array_key_exists('ref_kind', $d) ? preuve_text($d['ref_kind'], 20) : (string) ($old['ref_kind'] ?? '');
    $refId = array_key_exists('ref_id', $d) ? safe_int($d['ref_id']) : (int) ($old['ref_id'] ?? 0);
    if (!in_array($refKind, ['', 'source', 'citation', 'digest'], true) || ($refKind === '' && $refId) || ($refKind !== '' && !$refId)) { $refKind = ''; $refId = 0; }
    if (!preuve_ref_ok($pdo, $refKind, $refId)) { throw new LcndaBadInput('La source ou la citation choisie n’existe plus.'); }
    $evidence = in_array(($d['evidence'] ?? ($old['evidence'] ?? '')), PREUVE_EVIDENCE, true) ? (string) ($d['evidence'] ?? $old['evidence'] ?? '') : '';
    $quality = in_array(($d['quality'] ?? ($old['quality'] ?? '')), PREUVE_QUALITY, true) ? (string) ($d['quality'] ?? $old['quality'] ?? '') : '';
    $resolution = array_key_exists('resolution', $d) ? preuve_text($d['resolution'], 4000) : (string) ($old['resolution'] ?? '');
    if ($text === '' && !$refId) { throw new LcndaBadInput($kind === 'research' ? 'Écris ce qui a été cherché, ou choisis un dépouillement du Journal.' : ($kind === 'conflict' ? 'Écris le désaccord entre les sources.' : 'Écris l’indice, ou choisis sa source.')); }
    if (!in_array($kind, ['for', 'against'], true)) { $evidence = ''; $quality = $kind === 'research' ? '' : $quality; }
    if ($kind !== 'conflict') { $resolution = ''; }
    if ($old) {
        $pdo->prepare('UPDATE proof_items SET kind=?, text=?, ref_kind=?, ref_id=?, evidence=?, quality=?, resolution=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$kind, $text, $refKind, $refId, $evidence, $quality, $resolution, $id]);
    } else {
        $n = (int) $pdo->query("SELECT count(*) FROM proof_items WHERE deleted_at='' AND case_id=" . (int) $c['id'])->fetchColumn();
        if ($n >= PREUVE_MAX_ITEMS) { throw new RuntimeException('Ce dossier a déjà ' . PREUVE_MAX_ITEMS . ' lignes : ouvre-en un autre.'); }
        $pos = (int) $pdo->query('SELECT COALESCE(max(position),0)+1 FROM proof_items WHERE case_id=' . (int) $c['id'])->fetchColumn();
        $pdo->prepare('INSERT INTO proof_items(case_id, kind, text, ref_kind, ref_id, evidence, quality, resolution, position) VALUES(?,?,?,?,?,?,?,?,?)')
            ->execute([(int) $c['id'], $kind, $text, $refKind, $refId, $evidence, $quality, $resolution, $pos]);
        $id = (int) $pdo->lastInsertId();
    }
    $pdo->prepare('UPDATE proof_cases SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $c['id']]);
    $s = $pdo->prepare('SELECT * FROM proof_items WHERE id=?'); $s->execute([$id]);
    $prev = $old ? array_intersect_key($old, array_flip(['kind', 'text', 'ref_kind', 'ref_id', 'evidence', 'quality', 'resolution'])) : null;
    return ['item' => preuve_item_view($pdo, $s->fetch(PDO::FETCH_ASSOC)), 'prev' => $prev, 'created' => !$old];
}

function preuve_delete_item(PDO $pdo, array $d, bool $restore = false): array
{
    preuve_need($pdo);
    $s = $pdo->prepare('SELECT * FROM proof_items WHERE id=?'); $s->execute([safe_int($d['id'] ?? 0)]);
    $it = $s->fetch(PDO::FETCH_ASSOC);
    if (!$it) { throw new RuntimeException('Ligne du dossier introuvable.'); }
    $c = preuve_case_row($pdo, (int) $it['case_id'], $restore);
    preuve_unlocked($pdo, (int) $c['person_id']);
    $pdo->prepare('UPDATE proof_items SET deleted_at=' . ($restore ? "''" : 'CURRENT_TIMESTAMP') . ' WHERE id=?')->execute([(int) $it['id']]);
    $pdo->prepare('UPDATE proof_cases SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $c['id']]);
    return ['ok' => true, 'id' => (int) $it['id'], 'case_id' => (int) $c['id']];
}

/* ═════════════════════════ 🛡 Solidité des liens ═════════════════════════ */

/** Les règles, en mots simples (montrées dans la fenêtre « Pourquoi ? » et la FAQ). */
function solidite_rules(): array
{
    return [
        ['proved', 'Prouvé', 'Un dossier de preuve conclut « prouvé » ; ou un acte de naissance, de baptême ou de mariage de l’enfant est cité et il nomme le parent (le parent a la même source sur sa fiche, ou son nom est écrit dans la citation), sans mauvaise note de qualité.'],
        ['probable', 'Probable', 'Une source nomme le parent ailleurs que sur l’acte de naissance (fiche de l’enfant, famille) ; ou l’acte de naissance est cité mais rien ne montre qu’il nomme ce parent ; ou la citation est notée « source secondaire » (qualité 2).'],
        ['supposed', 'Supposé', 'Des sources existent sur l’enfant mais aucune ne parle de ce lien ; ou la citation est notée peu sûre (qualité 0 ou 1) ; ou la date de naissance est marquée « doute » ; ou un dossier conclut « possible ».'],
        ['unsourced', 'Sans source', 'Aucune source citée sur la naissance, le baptême, la fiche de l’enfant ni la famille.'],
        ['refuted', 'Réfuté', 'Un dossier de preuve conclut que ce lien est faux : la fiche n’est pas changée, à toi de corriger.'],
    ];
}

/** Signature de ce qui sert au calcul : si elle ne bouge pas, le résultat gardé est encore bon. */
function solidite_signature(PDO $pdo): string
{
    $row = $pdo->query("SELECT
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(max(updated_at),'') FROM persons),
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(max(updated_at),'') FROM events),
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(total(COALESCE(partner1_id,0)*3+COALESCE(partner2_id,0)),0) FROM families),
        (SELECT count(*)||'.'||COALESCE(total(family_id*7+child_id),0) FROM family_children),
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(total((COALESCE(unicode(quality),0)+length(page)*3+length(note)*7+source_record_id+entity_id)*(id%97+1)),0) FROM source_links),
        (SELECT COALESCE(max(id),0) FROM change_log),
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(total(length(title)),0) FROM sources),
        (SELECT count(*)||'.'||COALESCE(max(id),0)||'.'||COALESCE(total(media_id+entity_id),0) FROM media_links)")->fetch(PDO::FETCH_NUM);
    $own = preuve_ready($pdo) ? $pdo->query("SELECT
        (SELECT count(*)||'.'||COALESCE(max(updated_at),'')||'.'||COALESCE(max(deleted_at),'')||'.'||COALESCE(total(id*instr('|tocheck|proved|probable|possible|refuted|', '|'||certainty||'|')*(CASE WHEN deleted_at='' THEN 1 ELSE 7 END)+COALESCE(related_id,0)*13+person_id*17+instr('|parent|couple|date|place|identity|other|', '|'||subject||'|')),0) FROM proof_cases),
        (SELECT count(*)||'.'||COALESCE(max(updated_at),'')||'.'||COALESCE(total(child_id*instr('|proved|probable|supposed|unsourced|', '|'||level||'|')+parent_id*3),0) FROM link_strength)")->fetch(PDO::FETCH_NUM) : [];
    return md5(json_encode([$row, $own, PREUVE_VERSION]));
}

function solidite_cache_file(): string { return DATA_DIR . '/cache/solidite.json'; }

/** Tous les liens parent → enfant de la base, avec leur niveau : {links: {"enfant:parent": [niveau, code, réf, dossier]}} */
function solidite_run(PDO $pdo, bool $fresh = false): array
{
    static $memo = null;
    $sig = solidite_signature($pdo);
    if (!$fresh && $memo && ($memo['sig'] ?? '') === $sig) { return $memo; }
    $file = solidite_cache_file();
    if (!$fresh && is_file($file)) {
        $c = json_decode((string) @file_get_contents($file), true);
        if (is_array($c) && ($c['sig'] ?? '') === $sig) { return $memo = $c; }
    }
    $t0 = microtime(true);
    if (function_exists('memory_at_least')) { memory_at_least(1024); }
    @set_time_limit(300);
    $res = solidite_compute($pdo);
    $res['sig'] = $sig;
    $res['ms'] = (int) round((microtime(true) - $t0) * 1000);
    $dir = dirname($file);
    if (is_dir($dir) || @mkdir($dir, 0775, true)) {
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) !== false) { @rename($tmp, $file); } else { @unlink($tmp); }
    }
    return $memo = $res;
}

/** Le calcul, en quelques lectures de la base (jamais une requête par lien). */
function solidite_compute(PDO $pdo): array
{
    // les noms repliés de tout le monde (prénom usuel = le premier mot du prénom)
    $names = [];
    foreach ($pdo->query('SELECT id, first_name, last_name FROM persons') as $r) {
        $first = trim(strtok(trim(preuve_fold((string) $r['first_name'])), ' ') ?: '');
        $last = trim(preuve_fold((string) $r['last_name']));
        $names[(int) $r['id']] = [$first, $last];
    }
    // les liens
    $links = [];
    foreach ($pdo->query('SELECT fc.child_id, fc.family_id, f.partner1_id, f.partner2_id, fc.relation_to_partner1 AS r1, fc.relation_to_partner2 AS r2 FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) {
        foreach ([[(int) $r['partner1_id'], (string) $r['r1']], [(int) $r['partner2_id'], (string) $r['r2']]] as [$p, $rel]) {
            if ($p > 0 && (int) $r['child_id'] > 0 && $p !== (int) $r['child_id']) { $links[(int) $r['child_id'] . ':' . $p] = [(int) $r['child_id'], $p, (int) $r['family_id'], $rel]; }
        }
    }
    if (!$links) { return ['links' => [], 'counts' => array_fill_keys(SOLIDITE_LEVELS, 0)]; }
    // événements utiles : naissance / baptême de chaque personne, mariages de chaque famille, et à qui appartient chaque événement
    $evOwner = []; $keyEv = []; $doubt = [];
    foreach ($pdo->query("SELECT e.id, e.person_id, e.family_id, t.slug, e.fact_confidence FROM events e JOIN event_types t ON t.id=e.event_type_id") as $r) {
        $eid = (int) $r['id'];
        if ($r['person_id']) { $evOwner[$eid] = ['p', (int) $r['person_id']]; }
        elseif ($r['family_id']) { $evOwner[$eid] = ['f', (int) $r['family_id']]; }
        $slug = (string) $r['slug'];
        if ($r['person_id'] && in_array($slug, ['birth', 'baptism', 'christening'], true)) {
            $keyEv[$eid] = $slug === 'birth' ? 'birth' : 'baptism';
            if ((string) $r['fact_confidence'] === 'doubt') { $doubt[(int) $r['person_id']] = true; }
        } elseif ($r['family_id'] && $slug === 'marriage') { $keyEv[$eid] = 'marriage'; }
    }
    $famPartners = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $r) { $famPartners[(int) $r['id']] = [(int) $r['partner1_id'], (int) $r['partner2_id']]; }
    // les familles dont chacun est un des deux partenaires (ses mariages)
    $famsOf = [];
    foreach ($famPartners as $fid => [$a, $b]) { if ($a) { $famsOf[$a][] = $fid; } if ($b) { $famsOf[$b][] = $fid; } }
    // les titres des sources
    $srcTitle = [];
    foreach ($pdo->query('SELECT id, title FROM sources') as $r) { $srcTitle[(int) $r['id']] = (string) $r['title']; }
    // les citations, rangées par chose citée ; les sources citées pour chaque personne (fiche, événements, familles)
    $cits = []; $personSrc = [];
    foreach ($pdo->query("SELECT id, entity_type, entity_id, source_record_id, quality, page, note, " . (preuve_has_col($pdo, 'source_links', 'citation_json') ? 'citation_json' : "'' AS citation_json") . " FROM source_links WHERE entity_type IN ('person','event','family')") as $r) {
        $t = (string) $r['entity_type']; $eid = (int) $r['entity_id']; $src = (int) $r['source_record_id'];
        $q = trim((string) $r['quality']);
        $c = ['id' => (int) $r['id'], 'src' => $src, 'q' => preg_match('/^[0-3]$/', $q) ? (int) $q : null,
            'txt' => preuve_fold(($srcTitle[$src] ?? '') . ' ' . $r['page'] . ' ' . $r['note'] . ' ' . $r['citation_json'])];
        $cits[$t . ':' . $eid][] = $c;
        $owners = [];
        if ($t === 'person') { $owners[] = $eid; }
        elseif ($t === 'event' && isset($evOwner[$eid])) { [$ok, $oid] = $evOwner[$eid]; if ($ok === 'p') { $owners[] = $oid; } else { $owners = array_merge($owners, array_filter($famPartners[$oid] ?? [])); } }
        elseif ($t === 'family') { $owners = array_merge($owners, array_filter($famPartners[$eid] ?? [])); }
        foreach ($owners as $o) { $personSrc[$o][$src] = true; }
    }
    // les médias rattachés à chaque personne (fiche et événements) : un acte en image posé sur l'enfant et sur le parent
    $evMedia = []; $personMedia = [];
    foreach ($pdo->query("SELECT media_id, entity_type, entity_id FROM media_links WHERE entity_type IN ('person','event')") as $r) {
        $m = (int) $r['media_id']; $eid = (int) $r['entity_id'];
        if ($r['entity_type'] === 'person') { $personMedia[$eid][$m] = true; }
        else {
            $evMedia[$eid][$m] = true;
            if (isset($evOwner[$eid])) { [$ok, $oid] = $evOwner[$eid]; foreach ($ok === 'p' ? [$oid] : array_filter($famPartners[$oid] ?? []) as $o) { $personMedia[$o][$m] = true; } }
        }
    }
    // les événements clés de chaque enfant
    $childKey = [];
    foreach ($keyEv as $eid => $kind) {
        if ($kind === 'marriage') { foreach (array_filter($famPartners[$evOwner[$eid][1]] ?? []) as $o) { $childKey[$o][] = [$eid, 'marriage']; } }
        elseif (isset($evOwner[$eid])) { $childKey[$evOwner[$eid][1]][] = [$eid, $kind]; }
    }
    // dossiers « parent » et choix à la main
    $cases = []; $manual = [];
    if (preuve_ready($pdo)) {
        foreach ($pdo->query("SELECT id, person_id, related_id, certainty FROM proof_cases WHERE deleted_at='' AND subject='parent' AND related_id IS NOT NULL AND certainty<>'tocheck' ORDER BY updated_at, id") as $r) { $cases[(int) $r['person_id'] . ':' . (int) $r['related_id']] = [(int) $r['id'], (string) $r['certainty']]; }
        foreach ($pdo->query('SELECT child_id, parent_id, level FROM link_strength') as $r) { if (in_array($r['level'], SOLIDITE_LEVELS, true)) { $manual[(int) $r['child_id'] . ':' . (int) $r['parent_id']] = (string) $r['level']; } }
    }
    $names_parent = static function (array $c, int $p) use ($names, $personSrc): bool {
        if (isset($personSrc[$p][$c['src']])) { return true; }
        [$first, $last] = $names[$p] ?? ['', ''];
        if ($last === '' || strlen($last) < 2) { return false; }
        if (!str_contains($c['txt'], ' ' . $last . ' ')) { return false; }
        return $first === '' || strlen($first) < 2 || str_contains($c['txt'], ' ' . $first . ' ');
    };
    $out = []; $counts = array_fill_keys(SOLIDITE_LEVELS, 0);
    foreach ($links as $key => [$c, $p, $fid, $rel]) {
        if (isset($cases[$key])) {
            [$caseId, $cert] = $cases[$key];
            $lvl = ['proved' => 'proved', 'probable' => 'probable', 'possible' => 'supposed', 'refuted' => 'refuted'][$cert] ?? 'supposed';
            $out[$key] = [$lvl, 'case', 0, $caseId];
            $counts[$lvl]++;
            continue;
        }
        if (isset($manual[$key])) { $out[$key] = [$manual[$key], 'manual', 0, 0]; $counts[$manual[$key]]++; continue; }
        $best = ['unsourced', 'none', 0];
        $rank = ['unsourced' => 0, 'supposed' => 1, 'probable' => 2, 'proved' => 3];
        $take = static function (string $lvl, string $code, int $cid) use (&$best, $rank): void { if ($rank[$lvl] > $rank[$best[0]]) { $best = [$lvl, $code, $cid]; } };
        // 1. les actes de l'enfant : naissance, baptême, mariage
        foreach ($childKey[$c] ?? [] as [$eid, $kind]) {
            $sharedMedia = $evMedia[$eid] ?? [];
            $mediaHit = $sharedMedia && array_intersect_key($sharedMedia, $personMedia[$p] ?? []);
            foreach ($cits['event:' . $eid] ?? [] as $ct) {
                $named = $names_parent($ct, $p) || $mediaHit;
                if ($named) {
                    if ($ct['q'] === null || $ct['q'] === 3) { $take('proved', $kind . '_named', $ct['id']); }
                    elseif ($ct['q'] === 2) { $take('probable', $kind . '_named_q2', $ct['id']); }
                    else { $take('supposed', 'low_quality', $ct['id']); }
                } else {
                    if ($ct['q'] === null || $ct['q'] >= 2) { $take($kind === 'marriage' ? 'supposed' : 'probable', $kind . '_cited', $ct['id']); }
                    else { $take('supposed', 'low_quality', $ct['id']); }
                }
            }
        }
        // 2. la fiche de l'enfant, la famille (le couple des parents)
        foreach (array_merge($cits['person:' . $c] ?? [], $cits['family:' . $fid] ?? []) as $ct) {
            if ($names_parent($ct, $p)) { $take($ct['q'] !== null && $ct['q'] <= 1 ? 'supposed' : 'probable', 'person_named', $ct['id']); }
            else { $take('supposed', 'person_cited', $ct['id']); }
        }
        // 3. une source sur un autre événement de l'enfant (décès, recensement…) : il y a des sources, sans parler du lien
        if ($best[0] === 'unsourced' && !empty($personSrc[$c])) { $take('supposed', 'other_cited', 0); }
        // une naissance marquée « doute » : au mieux « supposé »
        if (!empty($doubt[$c]) && $rank[$best[0]] > $rank['supposed']) { $best = ['supposed', 'doubt', $best[2]]; }
        $out[$key] = [$best[0], $best[1], $best[2], 0];
        $counts[$best[0]]++;
        if ($rel !== '' && $rel !== 'biological') { $out[$key][] = $rel; }
    }
    return ['links' => $out, 'counts' => $counts];
}

function preuve_has_col(PDO $pdo, string $table, string $col): bool
{
    static $memo = [];
    $k = $table . '.' . $col;
    if (!isset($memo[$k])) { $memo[$k] = in_array($col, array_column($pdo->query("PRAGMA table_info({$table})")->fetchAll(PDO::FETCH_ASSOC), 'name'), true); }
    return $memo[$k];
}

const SOLIDITE_LABELS = ['proved' => 'Prouvé', 'probable' => 'Probable', 'supposed' => 'Supposé', 'unsourced' => 'Sans source', 'refuted' => 'Réfuté'];

/** La phrase du « pourquoi » d'un lien, avec les vrais noms. */
function solidite_why(PDO $pdo, array $v, ?array $child, ?array $parent): string
{
    [$lvl, $code, $ref, $case] = $v + [null, null, 0, 0];
    $pn = $parent['name'] ?? 'le parent';
    $parentWord = ($parent['gender'] ?? '') === 'male' ? 'le père' : (($parent['gender'] ?? '') === 'female' ? 'la mère' : 'le parent');
    $src = '';
    if ($ref) {
        $s = $pdo->prepare('SELECT s.title, sl.page FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE sl.id=?'); $s->execute([(int) $ref]);
        if ($r = $s->fetch(PDO::FETCH_ASSOC)) { $src = ' (« ' . (trim((string) $r['title']) ?: 'source sans titre') . (trim((string) $r['page']) !== '' ? ', ' . trim((string) $r['page']) : '') . ' »)'; }
    }
    $case = (int) $case;
    if ($code === 'case' && $case) {
        $s = $pdo->prepare('SELECT question FROM proof_cases WHERE id=?'); $s->execute([$case]);
        return 'Dossier de preuve : « ' . (string) $s->fetchColumn() . ' » — conclusion : ' . mb_strtolower(['proved' => 'Prouvé', 'probable' => 'Probable', 'supposed' => 'Possible', 'refuted' => 'Réfuté'][$lvl] ?? '') . '.';
    }
    return match ($code) {
        'manual' => 'Choisi à la main.',
        'birth_named' => "Acte de naissance cité, qui nomme {$parentWord} {$pn}{$src}.",
        'baptism_named' => "Acte de baptême cité, qui nomme {$parentWord} {$pn}{$src}.",
        'marriage_named' => "Acte de mariage de l’enfant cité, qui nomme {$parentWord} {$pn}{$src}.",
        'birth_named_q2', 'baptism_named_q2', 'marriage_named_q2' => "Un acte nomme {$pn}, mais la citation est notée « source secondaire »{$src}.",
        'birth_cited', 'baptism_cited' => "L’acte de " . ($code === 'birth_cited' ? 'naissance' : 'baptême') . " est cité{$src}, mais rien ne montre qu’il nomme {$pn} : ajoute la même source sur sa fiche, ou écris son nom dans la citation.",
        'marriage_cited' => "Seul l’acte de mariage de l’enfant est cité{$src}, sans montrer qu’il nomme {$pn}.",
        'low_quality' => "La seule citation est notée peu sûre (qualité 0 ou 1){$src}.",
        'person_named' => "Une source nomme {$pn} sur la fiche de l’enfant ou de la famille{$src}, mais pas l’acte de naissance.",
        'person_cited' => "Des sources sur la fiche de l’enfant{$src}, mais aucune ne parle de ce lien.",
        'other_cited' => 'Des sources existent sur d’autres événements de l’enfant, mais aucune ne parle de ce lien.',
        'doubt' => 'La date de naissance de l’enfant est marquée « doute ».',
        default => 'Aucune source citée sur la naissance, le baptême, la fiche de l’enfant ni la famille.',
    };
}

/** Le niveau d'un lien, prêt à montrer. */
function solidite_view(PDO $pdo, array $all, int $child, int $parent, bool $why = true): ?array
{
    $v = $all['links'][$child . ':' . $parent] ?? null;
    if (!$v) { return null; }
    $out = ['child_id' => $child, 'parent_id' => $parent, 'level' => $v[0], 'label' => SOLIDITE_LABELS[$v[0]] ?? $v[0], 'code' => $v[1], 'case_id' => (int) ($v[3] ?? 0), 'manual' => $v[1] === 'manual', 'relation' => (string) ($v[4] ?? '')];
    if ($why) { $out['why'] = solidite_why($pdo, $v, preuve_person($pdo, $child), preuve_person($pdo, $parent)); }
    return $out;
}

/** La fiche : le niveau de chaque parent (et le calcul sans le dossier, pour comparer). */
function solidite_person(PDO $pdo, int $pid): array
{
    $all = solidite_run($pdo);
    $parents = [];
    $s = $pdo->prepare('SELECT DISTINCT f.partner1_id AS a, f.partner2_id AS b FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?');
    $s->execute([$pid]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { foreach ([(int) $r['a'], (int) $r['b']] as $p) { if ($p && ($v = solidite_view($pdo, $all, $pid, $p))) { $parents[] = $v + ['parent' => preuve_person($pdo, $p)]; } } }
    $manual = [];
    if (preuve_ready($pdo)) { $m = $pdo->prepare('SELECT parent_id, level, note FROM link_strength WHERE child_id=?'); $m->execute([$pid]); foreach ($m as $r) { $manual[(int) $r['parent_id']] = ['level' => (string) $r['level'], 'note' => (string) $r['note']]; } }
    return ['person_id' => $pid, 'parents' => $parents, 'manual' => (object) $manual, 'cases' => preuve_person_cases($pdo, $pid), 'labels' => SOLIDITE_LABELS];
}

/** L'arbre : le niveau de chaque lien entre les personnes montrées. */
function solidite_pairs(PDO $pdo, string $ids): array
{
    $list = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', $ids))))), 0, 5000);
    $all = solidite_run($pdo);
    $set = array_flip($list); $out = [];
    foreach ($all['links'] as $key => $v) {
        [$c, $p] = array_map('intval', explode(':', $key));
        if (isset($set[$c]) && isset($set[$p])) { $out[$key] = [$v[0], $v[1] === 'case' ? (int) $v[3] : 0]; }
    }
    return ['links' => (object) $out, 'labels' => SOLIDITE_LABELS];
}

/** 🛡 Branches fragiles : ancêtres Sosa dont le lien avec leur enfant de la lignée est supposé, sans source ou réfuté. */
function solidite_fragiles(PDO $pdo, array $q = []): array
{
    $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    $pos = $root && function_exists('sosa_positions') ? sosa_positions($pdo, $root, 20000) : ['positions' => []];
    $all = solidite_run($pdo);
    $items = []; $counts = array_fill_keys(SOLIDITE_LEVELS, 0); $total = 0; $people = [];
    $want = ['supposed', 'unsourced', 'refuted'];
    foreach ($pos['positions'] ?? [] as $sosa => $pid) {
        $sosa = (int) $sosa; if ($sosa < 2) { continue; }
        $child = (int) ($pos['positions'][intdiv($sosa, 2)] ?? 0); if (!$child) { continue; }
        $v = $all['links'][$child . ':' . (int) $pid] ?? null; if (!$v) { continue; }
        $total++; $counts[$v[0]]++;
        if (!in_array($v[0], $want, true)) { continue; }
        $items[] = ['sosa' => $sosa, 'generation' => (int) floor(log($sosa, 2)) + 1, 'parent_id' => (int) $pid, 'child_id' => $child, 'level' => $v[0], 'code' => $v[1], 'case_id' => $v[1] === 'case' ? (int) $v[3] : 0, 'ref' => (int) $v[2]];
    }
    usort($items, static fn($a, $b) => [$a['generation'], $a['sosa']] <=> [$b['generation'], $b['sosa']]);
    $items = array_slice($items, 0, 3000);
    foreach ($items as &$it) {
        $people[$it['parent_id']] ??= preuve_person($pdo, $it['parent_id']);
        $people[$it['child_id']] ??= preuve_person($pdo, $it['child_id']);
        $it['parent'] = $people[$it['parent_id']]; $it['child'] = $people[$it['child_id']];
        $it['label'] = SOLIDITE_LABELS[$it['level']];
        $it['why'] = solidite_why($pdo, [$it['level'], $it['code'], $it['ref'], $it['case_id']], $it['child'], $it['parent']);
    }
    unset($it);
    return ['root_id' => $root, 'items' => $items, 'counts' => $counts, 'total' => $total, 'labels' => SOLIDITE_LABELS];
}

function solidite_summary(PDO $pdo): array
{
    $f = solidite_fragiles($pdo);
    return ['counts' => $f['counts'], 'total' => $f['total'], 'fragile' => count($f['items']), 'top' => array_slice($f['items'], 0, 8), 'cases' => preuve_ready($pdo) ? (int) $pdo->query("SELECT count(*) FROM proof_cases WHERE deleted_at=''")->fetchColumn() : 0];
}

/** Le choix à la main (ou rien : le calcul reprend). Rend l'état d'avant pour « ↶ Annuler ». */
function solidite_manual_set(PDO $pdo, array $d, bool $restore = false): array
{
    preuve_need($pdo);
    $c = safe_int($d['child_id'] ?? 0); $p = safe_int($d['parent_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? AND (f.partner1_id=? OR f.partner2_id=?)');
    $s->execute([$c, $p, $p]);
    if (!$c || !$p || !$s->fetchColumn()) { throw new LcndaBadInput('Ce lien parent-enfant n’existe pas.'); }
    preuve_unlocked($pdo, $c);
    $o = $pdo->prepare('SELECT level, note FROM link_strength WHERE child_id=? AND parent_id=?'); $o->execute([$c, $p]);
    $prev = $o->fetch(PDO::FETCH_ASSOC) ?: null;
    $src = $restore ? ($d['prev'] ?? null) : $d;
    $level = is_array($src) ? (string) ($src['level'] ?? '') : '';
    if ($level !== '' && !in_array($level, ['proved', 'probable', 'supposed', 'unsourced'], true)) { throw new LcndaBadInput('Niveau inconnu.'); }
    if ($level === '') { $pdo->prepare('DELETE FROM link_strength WHERE child_id=? AND parent_id=?')->execute([$c, $p]); }
    else {
        $note = is_array($src) ? preuve_text($src['note'] ?? '', 1000) : '';
        $pdo->prepare('INSERT INTO link_strength(child_id, parent_id, level, note, updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(child_id, parent_id) DO UPDATE SET level=excluded.level, note=excluded.note, updated_at=CURRENT_TIMESTAMP')->execute([$c, $p, $level, $note]);
    }
    $all = solidite_run($pdo, true);
    return ['ok' => true, 'prev' => $prev, 'link' => solidite_view($pdo, $all, $c, $p)];
}

/** 🗓 Ma semaine de recherche : un lien fragile par semaine (le plus proche de toi). */
function preuve_semaine_rows(PDO $pdo): array
{
    try { $f = solidite_fragiles($pdo); } catch (Throwable $_) { return []; }
    $pool = array_slice($f['items'], 0, 8);
    if (!$pool) { return []; }
    $week = (int) date('oW');
    $w = $pool[$week % count($pool)];
    $cw = preuve_child_word((string) ($w['child']['gender'] ?? ''));
    return [['key' => 'solidite:' . (int) $w['child_id'] . ':' . (int) $w['parent_id'] . ':' . $week, 'sort' => 'piste', 'urgency' => 'week', 'badge' => '🛡 Lien à consolider',
        'title' => 'Lien à consolider : ' . ($w['child']['name'] ?? '') . ', ' . $cw . ' ' . preuve_de((string) ($w['parent']['name'] ?? '')),
        'detail' => implode(' · ', array_filter(['Sosa ' . $w['sosa'], 'génération ' . $w['generation'], SOLIDITE_LABELS[$w['level']], 'cherche l’acte de naissance ou de baptême qui le nomme'])),
        'person_id' => (int) $w['child_id'], 'open' => ['kind' => 'list', 'list' => 'fragile_branches', 'id' => (int) $w['child_id']], 'done_label' => 'Lien vérifié', 'snooze' => 'mark']];
}

/* ═════════════════════════ Menu de choix : la sorte « citation » ═════════════════════════ */

/** Les citations (source_links) : titre de la source, « page », et ce qui est cité (personne, événement, famille). */
function picker_citations(PDO $pdo, string $q, int $offset, int $limit, ?array $only = null): array
{
    $params = [];
    if ($only !== null) { $where = 'sl.id IN (' . (implode(',', array_map('intval', $only)) ?: '0') . ')'; }
    elseif (function_exists('picker_ids') && ($ids = picker_ids())) { $where = 'sl.id IN (' . implode(',', $ids) . ')'; }
    elseif ($q === '') { $where = '1'; }
    else {
        $params[':ql'] = function_exists('picker_like') ? picker_like($q) : '%' . $q . '%';
        $params[':qf'] = '%' . (function_exists('picker_fold') ? picker_fold($q) : $q) . '%';
        $parts = [];
        foreach (['s.title', 'sl.page', 'sl.note', 'p.first_name', 'p.last_name', 'ep.last_name', 'f1.last_name', 'f2.last_name'] as $col) {
            $parts[] = "COALESCE({$col},'') LIKE :ql ESCAPE '\\' COLLATE NOCASE";
            if (function_exists('picker_fold')) { $parts[] = "picker_fold({$col}) LIKE :qf"; }
        }
        $where = '(' . implode(' OR ', $parts) . ')';
    }
    $from = "FROM source_links sl JOIN sources s ON s.id=sl.source_record_id
        LEFT JOIN persons p ON sl.entity_type='person' AND p.id=sl.entity_id
        LEFT JOIN events e ON sl.entity_type='event' AND e.id=sl.entity_id LEFT JOIN event_types t ON t.id=e.event_type_id
        LEFT JOIN persons ep ON ep.id=e.person_id
        LEFT JOIN families fa ON fa.id=COALESCE(CASE WHEN sl.entity_type='family' THEN sl.entity_id END, e.family_id)
        LEFT JOIN persons f1 ON f1.id=fa.partner1_id LEFT JOIN persons f2 ON f2.id=fa.partner2_id
        WHERE sl.entity_type IN ('person','event','family') AND {$where}";
    $select = "SELECT sl.id, sl.page, sl.quality, sl.entity_type, s.title, t.label AS ev_label, e.date_text,
        trim(COALESCE(p.first_name,'')||' '||upper(COALESCE(p.last_name,''))) AS p_name, trim(COALESCE(ep.first_name,'')||' '||upper(COALESCE(ep.last_name,''))) AS ep_name,
        trim(COALESCE(f1.first_name,'')||' '||upper(COALESCE(f1.last_name,''))) AS f1_name, trim(COALESCE(f2.first_name,'')||' '||upper(COALESCE(f2.last_name,''))) AS f2_name";
    $c = $pdo->prepare("SELECT count(*) {$from}"); $c->execute($params); $total = (int) $c->fetchColumn();
    $s = $pdo->prepare("{$select} {$from} ORDER BY s.title COLLATE NOCASE, sl.id LIMIT " . max(1, min(200, $limit)) . ' OFFSET ' . max(0, $offset));
    $s->execute($params);
    $quay = ['0' => 'peu sûre', '1' => 'douteuse', '2' => 'secondaire', '3' => 'directe'];
    $items = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $who = $r['entity_type'] === 'person' ? $r['p_name'] : ($r['ep_name'] !== '' ? $r['ep_name'] : trim($r['f1_name'] . ($r['f2_name'] !== '' ? ' et ' . $r['f2_name'] : '')));
        $on = $r['entity_type'] === 'person' ? 'fiche de ' . $who : ($r['entity_type'] === 'family' ? 'famille ' . $who : mb_strtolower((string) ($r['ev_label'] ?: 'événement')) . ' de ' . $who . ($r['date_text'] ? ' (' . $r['date_text'] . ')' : ''));
        $q2 = trim((string) $r['quality']);
        $items[] = ['kind' => 'citation', 'id' => (int) $r['id'], 'title' => (trim((string) $r['title']) ?: 'Source sans titre') . (trim((string) $r['page']) !== '' ? ' — ' . trim((string) $r['page']) : ''),
            'meta' => 'Citée sur : ' . $on, 'badge' => isset($quay[$q2]) ? 'Qualité ' . $q2 : '', 'badge_style' => '', 'group' => 'citation', 'icon' => '🔖', 'short' => $who, 'quay' => $q2];
    }
    return ['total' => $total, 'items' => $items];
}

/* ═════════════════════════ Les entrées de l'API ═════════════════════════ */

function preuve_api_get(PDO $pdo, array $g): array
{
    $op = scalar_text($g['op'] ?? 'list', 'op');
    return match ($op) {
        'list' => preuve_list($pdo),
        'case' => (static function () use ($pdo, $g) { $c = preuve_case_view($pdo, preuve_case_row($pdo, safe_int($g['id'] ?? 0))); $c['link'] = $c['subject'] === 'parent' && $c['related_id'] ? solidite_view($pdo, solidite_run($pdo), $c['person_id'], $c['related_id']) : null; return $c; })(),
        'find' => preuve_find($pdo, $g),
        'person' => solidite_person($pdo, safe_int($g['id'] ?? 0)),
        'pairs' => solidite_pairs($pdo, scalar_text($g['ids'] ?? '', 'ids')),
        'link' => (static function () use ($pdo, $g) { $c = safe_int($g['child_id'] ?? 0); $p = safe_int($g['parent_id'] ?? 0); return ['link' => solidite_view($pdo, solidite_run($pdo), $c, $p), 'child' => preuve_person($pdo, $c), 'parent' => preuve_person($pdo, $p)]; })(),
        'fragiles' => solidite_fragiles($pdo, $g),
        'summary' => solidite_summary($pdo),
        'rules' => ['rules' => solidite_rules()],
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}

function preuve_api_post(PDO $pdo, array $d): array
{
    $op = scalar_text($d['op'] ?? '', 'op');
    return match ($op) {
        'save_case' => preuve_save_case($pdo, $d),
        'delete_case' => preuve_delete_case($pdo, $d),
        'restore_case' => preuve_delete_case($pdo, $d, true),
        'save_item' => preuve_save_item($pdo, $d),
        'delete_item' => preuve_delete_item($pdo, $d),
        'restore_item' => preuve_delete_item($pdo, $d, true),
        'manual_set' => solidite_manual_set($pdo, $d),
        'manual_restore' => solidite_manual_set($pdo, $d, true),
        default => throw new LcndaBadInput('Demande inconnue.'),
    };
}
