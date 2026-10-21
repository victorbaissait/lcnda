<?php
declare(strict_types=1);

/**
 * 💬 Questions aux proches (F9) : un questionnaire « Te souviens-tu de… » à envoyer à un cousin, et ses réponses
 * qui reviennent dans l'app comme témoignages (fiche de la personne) ou comme mémoire familiale.
 *
 * L'app n'accepte que les connexions locales (lib/host_guard.php) : le cousin ne l'ouvre jamais. On passe par des fichiers :
 *  1. l'app fabrique un questionnaire autonome (.html : un seul fichier, hors ligne, aucun script ni image de l'extérieur,
 *     photos intégrées), plus une version imprimable avec des lignes pour écrire à la main ;
 *  2. le cousin le remplit dans son navigateur (gardé au fur et à mesure dans son navigateur) puis « ⤓ Enregistrer mes
 *     réponses » télécharge un petit .json qui porte l'identifiant et la somme de contrôle du questionnaire ;
 *  3. on importe ce .json (UI.openImportDialog) : chaque réponse va en « Témoignage » (family_memories, sorte « testimony »,
 *     reliée à la personne concernée) ou en « Mémoire familiale » (avec sa sorte) ; « D'où ça vient » est rempli tout seul.
 *
 * Tables (structure n°48, lib/migrations.php) : family_questionnaires, questionnaire_templates.
 * Le fichier de réponses vient de l'extérieur : il est lu strictement (taille, champs, types, identifiant connu, somme de
 * contrôle d'une version envoyée) et tout son texte est échappé à l'affichage.
 *
 * GET  api.php?action=qp_list | qp_get&id= | qp_templates
 * POST api.php?action=qp_write {op: save | delete | restore | status | render | analyze | import | undo_import | template_save | template_delete}
 */

const QP_STATUSES = ['prepared' => 'Préparé', 'sent' => 'Envoyé', 'answered' => 'Répondu', 'filed' => 'Rangé'];
const QP_MAX_QUESTIONS = 60;
const QP_MAX_QUESTION = 1000;      // caractères d'une question
const QP_MAX_ANSWER = 20000;       // caractères d'une réponse
const QP_MAX_FILE = 600 * 1024;    // octets du fichier de réponses
const QP_MAX_PHOTO = 4 * 1024 * 1024; // octets d'une photo lue sur le disque
const QP_FORMAT = 'lcnda-reponses';

/** Les modèles de questions, par thème. kind : text (une question), person (sur une personne précise), photo (sur une photo). */
function qp_builtin_themes(): array
{
    return [
        ['key' => 'enfance', 'icon' => '🧒', 'label' => 'Enfance', 'questions' => [
            ['k' => 'enf1', 'text' => 'Où as-tu grandi ? Raconte-moi la maison de ton enfance.'],
            ['k' => 'enf2', 'text' => 'À quoi jouais-tu quand tu étais enfant ? Avec qui ?'],
            ['k' => 'enf3', 'text' => 'Comment allais-tu à l’école ? Te souviens-tu de ton maître ou de ta maîtresse ?'],
            ['k' => 'enf4', 'text' => 'Te souviens-tu de tes grands-parents ? Comment étaient-ils ?'],
            ['k' => 'enf5', 'text' => 'Quel était ton plat préféré quand tu étais petit ou petite ?'],
        ]],
        ['key' => 'maison', 'icon' => '🏡', 'label' => 'Maison et village', 'questions' => [
            ['k' => 'mai1', 'text' => 'Comment était la maison où vivait la famille (les pièces, le jardin, les animaux) ?'],
            ['k' => 'mai2', 'text' => 'Comment s’appelaient les voisins ? Que faisaient-ils ?'],
            ['k' => 'mai3', 'text' => 'Quels commerces et quels artisans y avait-il au village ?'],
            ['k' => 'mai4', 'text' => 'Y avait-il des surnoms pour les familles ou les maisons du village ?'],
            ['k' => 'mai5', 'text' => 'Où allait-on au marché, à la foire, à la messe ?'],
        ]],
        ['key' => 'metiers', 'icon' => '🔨', 'label' => 'Métiers', 'questions' => [
            ['k' => 'met1', 'text' => 'Quel était le métier de ton père et celui de ta mère ?'],
            ['k' => 'met2', 'text' => 'Quel a été ton premier travail ? À quel âge as-tu commencé ?'],
            ['k' => 'met3', 'text' => 'Te souviens-tu des outils ou des gestes d’un métier de la famille ?'],
            ['k' => 'met4', 'text' => 'Quelqu’un de la famille travaillait-il à la ferme, à l’usine, à la mine, au chemin de fer ?'],
        ]],
        ['key' => 'guerre', 'icon' => '🎖️', 'label' => 'Guerre', 'questions' => [
            ['k' => 'gue1', 'text' => 'Que te racontait-on sur la guerre de 1914-1918 ?'],
            ['k' => 'gue2', 'text' => 'Où était la famille pendant la Seconde Guerre mondiale ? Comment vivait-on ?'],
            ['k' => 'gue3', 'text' => 'Quelqu’un de la famille a-t-il été soldat, prisonnier, déporté ou résistant ?'],
            ['k' => 'gue4', 'text' => 'Te souviens-tu de la Libération, ou de ce qu’on en racontait ?'],
        ]],
        ['key' => 'fetes', 'icon' => '🎉', 'label' => 'Fêtes et traditions', 'questions' => [
            ['k' => 'fet1', 'text' => 'Comment fêtait-on Noël dans la famille ?'],
            ['k' => 'fet2', 'text' => 'Te souviens-tu d’un mariage dans la famille ? Comment ça se passait ?'],
            ['k' => 'fet3', 'text' => 'Y avait-il des chansons, des expressions ou des dictons propres à la famille ?'],
            ['k' => 'fet4', 'text' => 'Quelles étaient les fêtes du village ?'],
        ]],
        ['key' => 'recettes', 'icon' => '🍲', 'label' => 'Recettes', 'questions' => [
            ['k' => 'rec1', 'text' => 'Quelle recette de famille aimerais-tu transmettre ? Écris-la comme tu la fais.'],
            ['k' => 'rec2', 'text' => 'Qui faisait la meilleure cuisine de la famille ? Quel était son plat ?'],
            ['k' => 'rec3', 'text' => 'Que mangeait-on les jours de fête ?'],
        ]],
        ['key' => 'photos', 'icon' => '📷', 'label' => 'Photos', 'questions' => [
            ['k' => 'pho1', 'kind' => 'photo', 'text' => 'Qui est sur cette photo ? Où et quand a-t-elle été prise ?'],
            ['k' => 'pho2', 'kind' => 'photo', 'text' => 'Te souviens-tu de ce moment ? Raconte-moi.'],
        ]],
        ['key' => 'personne', 'icon' => '👤', 'label' => 'Une personne précise', 'questions' => [
            ['k' => 'per1', 'kind' => 'person', 'text' => 'Que te rappelles-tu de [Prénom] ?'],
            ['k' => 'per2', 'kind' => 'person', 'text' => 'Comment était [Prénom] : son caractère, sa voix, ses habitudes ?'],
            ['k' => 'per3', 'kind' => 'person', 'text' => 'Sais-tu où [Prénom] a vécu et quel était son métier ?'],
            ['k' => 'per4', 'kind' => 'person', 'text' => 'As-tu une anecdote ou un souvenir drôle avec [Prénom] ?'],
            ['k' => 'per5', 'kind' => 'person', 'text' => 'As-tu des photos, des lettres ou des papiers de [Prénom] ?'],
        ]],
    ];
}

function qp_theme_keys(): array
{
    return [...array_column(qp_builtin_themes(), 'key'), 'mine'];
}

/** Texte d'une ligne : sans caractères de contrôle (sauf retours à la ligne et tabulations), borné. */
function qp_clean(mixed $value, int $max, bool $multiline = true, string $what = ''): string
{
    $s = scalar_text($value, $what);
    if (!mb_check_encoding($s, 'UTF-8')) { throw new LcndaBadInput('Texte illisible' . ($what !== '' ? ' (« ' . $what . ' »)' : '') . '.'); }
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = (string) preg_replace($multiline ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x{202A}-\x{202E}\x{2066}-\x{2069}]/u' : '/[\x00-\x1F\x7F\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', $s);
    $s = trim($s);
    return mb_strlen($s) > $max ? rtrim(mb_substr($s, 0, $max)) : $s;
}

function qp_uid(): string
{
    return bin2hex(random_bytes(16));
}

/** « 21 octobre 2026 » */
function qp_date_fr(string $ymd): string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $ymd, $m)) { return $ymd; }
    $months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    $mo = (int) $m[2];
    if ($mo < 1 || $mo > 12) { return $ymd; }
    return ((int) $m[3] === 1 ? '1er' : (string) (int) $m[3]) . ' ' . $months[$mo - 1] . ' ' . $m[1];
}

/** Une date AAAA-MM-JJ valide, ou '' */
function qp_ymd(mixed $value): string
{
    $s = safe_text($value);
    if ($s === '') { return ''; }
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        throw new LcndaBadInput('Date incorrecte : écris-la comme le calendrier la propose.');
    }
    return $s;
}

function qp_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM family_questionnaires WHERE id=?');
    $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    $s->closeCursor();
    if (!$row) { throw new RuntimeException('Questionnaire introuvable.'); }
    return $row;
}

function qp_json(?string $text): array
{
    if ($text === null || $text === '') { return []; }
    try { $v = json_decode($text, true, 32, JSON_THROW_ON_ERROR); } catch (JsonException) { return []; }
    return is_array($v) ? $v : [];
}

/** Personnes de la base, par numéro : id, prénom, nom, genre, années */
function qp_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    if (!$ids) { return []; }
    $s = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, p.gender, COALESCE(p.kind,'human') AS kind,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
        (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year
        FROM persons p WHERE p.id IN (" . implode(',', array_fill(0, count($ids), '?')) . ')');
    $s->execute($ids);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $p['id'] = (int) $p['id'];
        $p['name'] = trim($p['first_name'] . ' ' . $p['last_name']);
        $out[$p['id']] = $p;
    }
    return $out;
}

function qp_contact(PDO $pdo, int $id): ?array
{
    if ($id <= 0) { return null; }
    $s = $pdo->prepare('SELECT id, person_id, first_name, last_name, relationship, email, city FROM living_contacts WHERE id=?');
    $s->execute([$id]);
    $c = $s->fetch(PDO::FETCH_ASSOC);
    $s->closeCursor();
    if (!$c) { return null; }
    $c['id'] = (int) $c['id'];
    $c['person_id'] = (int) ($c['person_id'] ?? 0);
    $c['name'] = trim($c['first_name'] . ' ' . $c['last_name']) ?: 'Contact sans nom';
    return $c;
}

function qp_media(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    if (!$ids) { return []; }
    $s = $pdo->prepare('SELECT id, title, filename, thumbnail, media_type, date_text FROM media WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $s->execute($ids);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) { $m['id'] = (int) $m['id']; $out[$m['id']] = $m; }
    return $out;
}

/** Le prénom à qui l'on dit « Bonjour » : celui du contact, ou le premier mot du nom libre. */
function qp_greeting_name(array $row, ?array $contact): string
{
    if ($contact) { return trim((string) $contact['first_name']) ?: $contact['name']; }
    $t = trim((string) $row['recipient_text']);
    if ($t === '') { return ''; }
    return (string) preg_split('/\s+/u', $t)[0];
}

/** Les questions envoyées par la page, remises d'aplomb (ids, sortes, bornes, personnes et photos qui existent). */
function qp_normalize_questions(PDO $pdo, mixed $list): array
{
    if (!is_array($list)) { throw new LcndaBadInput('Liste de questions incorrecte.'); }
    if (count($list) > QP_MAX_QUESTIONS) { throw new RuntimeException(QP_MAX_QUESTIONS . ' questions au plus dans un questionnaire.'); }
    $out = []; $seen = [];
    foreach (array_values($list) as $i => $q) {
        if (!is_array($q)) { throw new LcndaBadInput('Question incorrecte.'); }
        $text = qp_clean($q['text'] ?? '', QP_MAX_QUESTION, true, 'question');
        if ($text === '') { continue; }
        $id = is_string($q['id'] ?? null) && preg_match('/^[a-z0-9]{1,16}$/', $q['id']) && !isset($seen[$q['id']]) ? $q['id'] : '';
        if ($id === '') { do { $id = 'q' . bin2hex(random_bytes(3)); } while (isset($seen[$id])); }
        $seen[$id] = true;
        $kind = in_array($q['kind'] ?? 'text', ['text', 'person', 'photo'], true) ? ($q['kind'] ?? 'text') : 'text';
        $theme = in_array($q['theme'] ?? '', qp_theme_keys(), true) ? $q['theme'] : '';
        $out[] = ['id' => $id, 'text' => $text, 'kind' => $kind, 'theme' => $theme,
            'person_id' => max(0, safe_int($q['person_id'] ?? 0)), 'media_id' => max(0, safe_int($q['media_id'] ?? 0))];
    }
    $people = qp_people($pdo, array_column($out, 'person_id'));
    $media = qp_media($pdo, array_column($out, 'media_id'));
    foreach ($out as &$q) {
        if ($q['person_id'] && !isset($people[$q['person_id']])) { $q['person_id'] = 0; }
        if ($q['media_id'] && !isset($media[$q['media_id']])) { $q['media_id'] = 0; }
    }
    unset($q);
    return $out;
}

/** [Prénom] remplacé par le prénom de la personne de la question (ou de la personne du questionnaire). */
function qp_question_text(array $q, array $people, int $fallbackPerson = 0): string
{
    $pid = (int) ($q['person_id'] ?? 0) ?: $fallbackPerson;
    $p = $people[$pid] ?? null;
    $first = $p ? (trim((string) $p['first_name']) ?: $p['name']) : '';
    return str_replace(['[Prénom]', '[prénom]', '[Prenom]'], $first !== '' ? $first : 'cette personne', (string) $q['text']);
}

/** Questionnaire complet pour la page : destinataire, personne, questions avec leur personne et leur photo. */
function qp_out(PDO $pdo, array $row, bool $full = true): array
{
    $questions = qp_json($row['questions_json']);
    $contact = qp_contact($pdo, (int) $row['contact_id']);
    $pids = [...array_column($questions, 'person_id'), (int) $row['person_id']];
    $people = qp_people($pdo, $pids);
    $media = $full ? qp_media($pdo, array_column($questions, 'media_id')) : [];
    $answers = qp_json($row['answers_json']);
    $imports = qp_json($row['imports_json']);
    $remind = (string) $row['remind_at'];
    $out = [
        'id' => (int) $row['id'], 'uid' => (string) $row['uid'], 'title' => (string) $row['title'], 'intro' => (string) $row['intro'],
        'status' => (string) $row['status'], 'status_label' => QP_STATUSES[$row['status']] ?? 'Préparé',
        'contact_id' => (int) $row['contact_id'], 'contact' => $contact, 'recipient_text' => (string) $row['recipient_text'],
        'recipient_name' => $contact ? $contact['name'] : (string) $row['recipient_text'], 'greeting' => qp_greeting_name($row, $contact),
        'person_id' => (int) $row['person_id'], 'person' => $people[(int) $row['person_id']] ?? null,
        'question_count' => count($questions), 'answer_count' => count(array_filter($answers, static fn($a) => is_array($a) && trim((string) ($a['answer'] ?? '')) !== '')),
        'sent_at' => (string) $row['sent_at'], 'remind_at' => $remind, 'answered_at' => (string) $row['answered_at'],
        'to_remind' => $row['status'] === 'sent' && $remind !== '' && $remind <= date('Y-m-d'),
        'notes' => (string) $row['notes'], 'created_at' => (string) $row['created_at'], 'updated_at' => (string) $row['updated_at'],
    ];
    if ($full) {
        $out['questions'] = array_map(static function ($q) use ($people, $media, $row) {
            $q['shown'] = qp_question_text($q, $people, (int) $row['person_id']);
            $q['person'] = $people[(int) ($q['person_id'] ?? 0)] ?? null;
            $m = $media[(int) ($q['media_id'] ?? 0)] ?? null;
            $q['media'] = $m ? ['id' => $m['id'], 'title' => (string) $m['title'], 'filename' => (string) $m['filename'], 'thumbnail' => (string) $m['thumbnail'], 'date_text' => (string) $m['date_text']] : null;
            return $q;
        }, $questions);
        $out['answers'] = $answers;
        $out['answered_by'] = (string) $row['answered_by'];
        $memIds = [];
        foreach ($imports as $imp) { foreach (($imp['memory_ids'] ?? []) as $mid) { $memIds[] = (int) $mid; } }
        $out['memories'] = [];
        if ($memIds) {
            $s = $pdo->prepare('SELECT id, kind, title FROM family_memories WHERE id IN (' . implode(',', array_fill(0, count($memIds), '?')) . ') ORDER BY id');
            $s->execute($memIds);
            $out['memories'] = array_map(static fn($m) => ['id' => (int) $m['id'], 'kind' => (string) $m['kind'], 'kind_label' => MEMORY_KINDS[$m['kind']] ?? 'Autre', 'title' => (string) $m['title']], $s->fetchAll(PDO::FETCH_ASSOC));
        }
        $out['can_undo_import'] = (bool) $imports;
    }
    return $out;
}

function qp_list(PDO $pdo, int $contactId = 0, int $personId = 0): array
{
    $where = []; $params = [];
    if ($contactId > 0) { $where[] = 'contact_id=?'; $params[] = $contactId; }
    if ($personId > 0) { $where[] = 'person_id=?'; $params[] = $personId; }
    $s = $pdo->prepare('SELECT * FROM family_questionnaires' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY updated_at DESC, id DESC');
    $s->execute($params);
    $rows = array_map(static fn($r) => qp_out($pdo, $r, false), $s->fetchAll(PDO::FETCH_ASSOC));
    $counts = array_fill_keys(array_keys(QP_STATUSES), 0);
    foreach ($rows as $r) { if (isset($counts[$r['status']])) { $counts[$r['status']]++; } }
    return ['questionnaires' => $rows, 'counts' => $counts, 'statuses' => QP_STATUSES];
}

function qp_templates(PDO $pdo): array
{
    $mine = $pdo->query('SELECT id, theme, kind, text FROM questionnaire_templates ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $themes = qp_builtin_themes();
    foreach ($themes as &$t) { foreach ($t['questions'] as &$q) { $q['kind'] = $q['kind'] ?? 'text'; $q['theme'] = $t['key']; } unset($q); }
    unset($t);
    $themes[] = ['key' => 'mine', 'icon' => '✎', 'label' => 'Mes questions', 'questions' => array_map(static fn($m) => ['k' => 't' . $m['id'], 'id' => (int) $m['id'], 'kind' => $m['kind'], 'text' => $m['text'], 'theme' => 'mine', 'mine' => true, 'from' => $m['theme']], $mine)];
    return ['themes' => $themes];
}

/** Ce que la page envoie (titre, mot d'accueil, destinataire, personne, questions), remis d'aplomb. */
function qp_input(PDO $pdo, array $data, bool $needTitle = true): array
{
    $title = qp_clean($data['title'] ?? '', 200, false, 'titre');
    if ($title === '' && $needTitle) { throw new RuntimeException('Donne un titre au questionnaire.'); }
    $intro = qp_clean($data['intro'] ?? '', 4000, true, 'mot d’accueil');
    $recipient = $data['recipient'] ?? '';
    $contactId = 0; $recipientText = '';
    if (is_int($recipient) || (is_string($recipient) && ctype_digit($recipient) && $recipient !== '')) {
        $contactId = (int) $recipient;
        if (!qp_contact($pdo, $contactId)) { throw new RuntimeException('Ce contact n’est plus dans le Répertoire des vivants.'); }
    } else {
        $recipientText = qp_clean(preg_replace('/^txt:/', '', scalar_text($recipient, 'destinataire')), 160, false, 'destinataire');
    }
    $personId = max(0, safe_int($data['person_id'] ?? 0));
    if ($personId && !qp_people($pdo, [$personId])) { $personId = 0; }
    $questions = qp_normalize_questions($pdo, $data['questions'] ?? []);
    $notes = qp_clean($data['notes'] ?? '', 4000, true, 'notes');
    return ['title' => $title, 'intro' => $intro, 'contact_id' => $contactId, 'recipient_text' => $recipientText, 'person_id' => $personId,
        'questions_json' => json_encode($questions, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), 'notes' => $notes];
}

function qp_save(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $v = qp_input($pdo, $data);
    $vals = [$v['title'], $v['intro'], $v['contact_id'] ?: null, $v['recipient_text'], $v['person_id'] ?: null, $v['questions_json'], $v['notes']];
    if ($id) {
        $before = qp_row($pdo, $id);
        $pdo->prepare('UPDATE family_questionnaires SET title=?, intro=?, contact_id=?, recipient_text=?, person_id=?, questions_json=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([...$vals, $id]);
        log_change($pdo, 'family_questionnaire', $id, 'update', 'Questionnaire modifié : ' . $v['title'], ['title' => $before['title']], ['title' => $v['title']]);
    } else {
        $pdo->prepare("INSERT INTO family_questionnaires(title, intro, contact_id, recipient_text, person_id, questions_json, notes, uid, status) VALUES(?,?,?,?,?,?,?,?,'prepared')")
            ->execute([...$vals, qp_uid()]);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'family_questionnaire', $id, 'create', 'Questionnaire préparé : ' . $v['title']);
    }
    $q = qp_out($pdo, qp_row($pdo, $id));
    $q['email'] = qp_email_text($q);
    return ['ok' => true, 'questionnaire' => $q];
}

/** L'aperçu de ce qui est à l'écran (sans rien enregistrer). */
function qp_preview(PDO $pdo, array $data): array
{
    $v = qp_input($pdo, $data, false);
    $id = safe_int($data['id'] ?? 0);
    $base = $id ? qp_row($pdo, $id) : ['id' => 0, 'uid' => str_repeat('0', 32), 'status' => 'prepared', 'sent_at' => '', 'remind_at' => '', 'answered_at' => '', 'answered_by' => '',
        'answers_json' => '{}', 'imports_json' => '[]', 'checksums_json' => '[]', 'created_at' => '', 'updated_at' => ''];
    $row = array_merge($base, $v, ['title' => $v['title'] !== '' ? $v['title'] : 'Questionnaire']);
    $r = qp_html($pdo, $row, in_array($data['mode'] ?? 'preview', ['preview', 'print'], true) ? ($data['mode'] ?? 'preview') : 'preview');
    $q = qp_out($pdo, $row, false);
    return ['ok' => true, 'html' => $r['html'], 'email' => qp_email_text($q), 'greeting' => $q['greeting']];
}

function qp_delete(PDO $pdo, array $data): array
{
    $row = qp_row($pdo, safe_int($data['id'] ?? 0));
    $pdo->prepare('DELETE FROM family_questionnaires WHERE id=?')->execute([(int) $row['id']]);
    log_change($pdo, 'family_questionnaire', (int) $row['id'], 'delete', 'Questionnaire supprimé : ' . $row['title'], $row, null);
    return ['ok' => true, 'deleted' => (int) $row['id']];
}

/** ↶ Annuler une suppression : la ligne est relue dans le journal (pas dans ce qu'envoie la page). */
function qp_restore(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare("SELECT before_json FROM change_log WHERE entity_type='family_questionnaire' AND entity_id=? AND action='delete' ORDER BY id DESC LIMIT 1");
    $s->execute([$id]);
    $row = qp_json((string) $s->fetchColumn());
    if (!$row || (int) ($row['id'] ?? 0) !== $id) { throw new RuntimeException('Rien à remettre.'); }
    $exists = $pdo->prepare('SELECT count(*) FROM family_questionnaires WHERE id=? OR uid=?');
    $exists->execute([$id, (string) $row['uid']]);
    if ((int) $exists->fetchColumn()) { return ['ok' => true, 'restored' => $id]; }
    $cols = ['id', 'uid', 'title', 'intro', 'contact_id', 'recipient_text', 'person_id', 'questions_json', 'status', 'sent_at', 'remind_at', 'answered_at', 'answered_by', 'answers_json', 'imports_json', 'checksums_json', 'notes', 'created_at', 'updated_at'];
    $pdo->prepare('INSERT INTO family_questionnaires(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')
        ->execute(array_map(static fn($c) => $row[$c] ?? null, $cols));
    log_change($pdo, 'family_questionnaire', $id, 'create', 'Questionnaire remis : ' . $row['title']);
    return ['ok' => true, 'restored' => $id];
}

/** État : préparé → envoyé (date d'envoi, relance) → répondu → rangé. */
function qp_status(PDO $pdo, array $data): array
{
    $row = qp_row($pdo, safe_int($data['id'] ?? 0));
    $status = safe_text($data['status'] ?? $row['status']);
    if (!isset(QP_STATUSES[$status])) { throw new LcndaBadInput('État inconnu.'); }
    $sent = array_key_exists('sent_at', $data) ? qp_ymd($data['sent_at']) : (string) $row['sent_at'];
    $remind = array_key_exists('remind_at', $data) ? qp_ymd($data['remind_at']) : (string) $row['remind_at'];
    if ($status === 'sent' && $sent === '') { $sent = date('Y-m-d'); }
    if ($status === 'sent' && $remind === '' && !array_key_exists('remind_at', $data)) { $remind = date('Y-m-d', strtotime($sent . ' +21 days') ?: time()); }
    if ($status === 'prepared') { $sent = ''; $remind = ''; }
    $pdo->prepare('UPDATE family_questionnaires SET status=?, sent_at=?, remind_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$status, $sent, $remind, (int) $row['id']]);
    log_change($pdo, 'family_questionnaire', (int) $row['id'], 'update', 'Questionnaire « ' . $row['title'] . ' » : ' . QP_STATUSES[$status], ['status' => $row['status'], 'sent_at' => $row['sent_at'], 'remind_at' => $row['remind_at']], ['status' => $status, 'sent_at' => $sent, 'remind_at' => $remind]);
    return ['ok' => true, 'questionnaire' => qp_out($pdo, qp_row($pdo, (int) $row['id']))];
}

/* ─── Le questionnaire envoyé : un seul fichier .html ───────────────────────── */

/** Somme de contrôle d'une version du questionnaire (ce que le cousin a reçu : identifiant, titre, questions). */
function qp_checksum(array $row, array $questions): string
{
    $canon = json_encode(['uid' => (string) $row['uid'], 'title' => (string) $row['title'], 'questions' => array_map(static fn($q) => [(string) $q['id'], (string) $q['shown']], $questions)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return substr(hash('sha256', (string) $canon), 0, 32);
}

/** Une photo de la base, intégrée au fichier (data:), réduite si GD est là. null si absente, trop grande ou pas une image. */
function qp_photo_data(array $media): ?string
{
    $file = basename((string) ($media['filename'] ?? ''));
    if ($file === '' || $file === '.' || $file === '..') { return null; }
    $path = MEDIA_DIR . '/' . $file;
    $real = realpath($path); $root = realpath(MEDIA_DIR);
    if (!$real || !$root || !str_starts_with($real, $root . DIRECTORY_SEPARATOR) || !is_file($real)) { return null; }
    $size = filesize($real);
    if ($size === false || $size <= 0 || $size > QP_MAX_PHOTO * 4) { return null; }
    $info = @getimagesize($real);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) { return null; }
    [$w, $h] = $info;
    $max = 1100;
    if (function_exists('imagecreatefromstring') && ($w > $max || $h > $max || $size > 450 * 1024)) {
        $src = @imagecreatefromstring((string) file_get_contents($real));
        if ($src) {
            $k = min(1, $max / max(1, $w, $h));
            $nw = max(1, (int) round($w * $k)); $nh = max(1, (int) round($h * $k));
            $dst = imagecreatetruecolor($nw, $nh);
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
            ob_start(); imagejpeg($dst, null, 82); $jpg = (string) ob_get_clean();
            imagedestroy($src); imagedestroy($dst);
            if ($jpg !== '') { return 'data:image/jpeg;base64,' . base64_encode($jpg); }
        }
    }
    if ($size > QP_MAX_PHOTO) { return null; }
    $mime = image_type_to_mime_type($info[2]);
    return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($real));
}

function qp_h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

function qp_hn(string $s): string
{
    return nl2br(qp_h($s), false);
}

/**
 * Le questionnaire en un seul fichier HTML. $mode : file (à envoyer), preview (aperçu dans l'app : boutons inactifs),
 * print (à imprimer : des lignes pour écrire à la main, sans script).
 */
function qp_html(PDO $pdo, array $row, string $mode = 'file', array $answers = []): array
{
    $q = qp_out($pdo, $row);
    $questions = $q['questions'];
    $checksum = qp_checksum($row, $questions);
    $greet = $q['greeting'];
    $title = $q['title'];
    $photos = [];
    $blocks = '';
    foreach ($questions as $i => $qq) {
        $n = $i + 1;
        $img = '';
        if ($qq['media']) {
            $data = $photos[$qq['media']['id']] ??= qp_photo_data($qq['media']);
            if ($data) { $img = '<figure class="qp-ph"><img src="' . qp_h($data) . '" alt="' . qp_h($qq['media']['title'] ?: 'Photo') . '">' . ($qq['media']['title'] !== '' && !preg_match('/\.(jpe?g|png|gif|webp|heic|tiff?)$/i', $qq['media']['title']) ? '<figcaption>' . qp_h($qq['media']['title']) . '</figcaption>' : '') . '</figure>'; }
            else { $img = '<p class="qp-noph">(La photo « ' . qp_h($qq['media']['title'] ?: 'photo') . ' » n’a pas pu être jointe : demande-la-moi.)</p>'; }
        }
        $who = $qq['person'] ? '<p class="qp-who">👤 ' . qp_h($qq['person']['name']) . ($qq['person']['birth_year'] || $qq['person']['death_year'] ? ' <span>(' . qp_h(trim(($qq['person']['birth_year'] ?: '?') . ' – ' . ($qq['person']['death_year'] ?: ''), ' –')) . ')</span>' : '') . '</p>' : '';
        $prev = (string) ($answers[$qq['id']] ?? '');
        $field = $mode === 'print'
            ? ($prev !== '' ? '<div class="qp-written">' . qp_hn($prev) . '</div>' : '<div class="qp-lines" aria-hidden="true"></div>')
            : '<textarea id="a-' . qp_h($qq['id']) . '" data-q="' . qp_h($qq['id']) . '" rows="7" placeholder="Écris ta réponse ici…"' . ($mode === 'preview' ? '' : '') . '>' . qp_h($prev) . '</textarea>';
        $blocks .= '<section class="qp-q"><h2><span class="qp-n">' . $n . '</span><label for="a-' . qp_h($qq['id']) . '">' . qp_hn($qq['shown']) . '</label></h2>' . $who . $img . $field . '</section>';
    }
    if (!$questions) { $blocks = '<p class="qp-empty">Pas encore de question.</p>'; }
    $data = ['format' => QP_FORMAT, 'questionnaire' => $q['uid'], 'checksum' => $checksum, 'title' => $title, 'from' => $q['recipient_name'],
        'questions' => array_map(static fn($x) => ['id' => $x['id'], 'question' => $x['shown']], $questions)];
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    $hello = $greet !== '' ? 'Bonjour ' . $greet . ',' : 'Bonjour,';
    $intro = $q['intro'] !== '' ? '<div class="qp-intro">' . qp_hn($q['intro']) . '</div>' : '';
    $howto = $mode === 'print'
        ? '<p class="qp-how">Écris tes réponses sur les lignes, au stylo. Tu peux continuer au dos des feuilles. Ensuite, renvoie-moi les feuilles (ou une photo de chaque page).</p>'
        : '<div class="qp-how"><b>Comment faire :</b><ol><li>Écris tes réponses dans les cases. Pas besoin de tout remplir : réponds à ce que tu veux.</li><li>Tout est gardé sur cet ordinateur au fur et à mesure : tu peux fermer et revenir plus tard.</li><li>Quand tu as fini, clique sur <b>« ⤓ Enregistrer mes réponses »</b>, puis envoie-moi le fichier qui se télécharge, en pièce jointe d’un e-mail.</li></ol></div>';
    $css = qp_css();
    $script = $mode === 'print' ? '' : '<script id="qp-data" type="application/json">' . $json . '</script><script>' . qp_js($mode === 'preview') . '</script>';
    $tools = $mode === 'print' ? '' : '<div class="qp-me"><label for="qp-from">Ton nom</label><input id="qp-from" type="text" value="' . qp_h($q['recipient_name']) . '" autocomplete="name"></div>'
        . '<div class="qp-bar"><button type="button" class="qp-btn qp-main" id="qp-save">⤓ Enregistrer mes réponses</button><button type="button" class="qp-btn" id="qp-print">🖨 Imprimer</button><span id="qp-state" class="qp-state" role="status" aria-live="polite"></span></div>';
    $banner = $mode === 'preview' ? '<p class="qp-banner">Aperçu : c’est ce que verra ' . qp_h($greet !== '' ? $greet : 'ton destinataire') . '. Les boutons marchent dans le vrai fichier.</p>' : '';
    $html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'">'
        . '<meta name="referrer" content="no-referrer"><title>' . qp_h($title) . '</title><style>' . $css . '</style></head><body class="qp-' . $mode . '">' . $banner
        . '<main class="qp"><header class="qp-head"><p class="qp-hello">' . qp_h($hello) . '</p><h1>' . qp_h($title) . '</h1>' . $intro . $howto . '</header>'
        . '<form id="qp-form">' . $blocks . $tools . '</form>'
        . '<footer class="qp-foot">Merci beaucoup pour tes souvenirs !</footer></main>' . $script . '</body></html>';
    $name = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower(function_exists('ascii_fold') ? ascii_fold($title) : $title)), '-') ?: 'questionnaire';
    return ['html' => $html, 'checksum' => $checksum, 'filename' => 'questionnaire-' . substr($name, 0, 60) . '.html', 'photos' => count(array_filter($photos)), 'missing_photos' => count($photos) - count(array_filter($photos))];
}

function qp_css(): string
{
    return <<<'CSS'
:root{color-scheme:light dark;--ink:#1d1d1f;--paper:#fdfcf8;--card:#fff;--line:#cfcac0;--muted:#5f5b55;--blue:#0a5bd8;--btn:#0a5bd8;--blue-soft:#e8f0ff;--ok:#1f7a3a}
@media (prefers-color-scheme:dark){:root{--ink:#f2f0ec;--paper:#1b1a18;--card:#262522;--line:#57534c;--muted:#bdb7ad;--blue:#6aa8ff;--btn:#2563c9;--blue-soft:#1d2a40;--ok:#6fd08c}}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;background:var(--paper);color:var(--ink);font:20px/1.55 Georgia,"Times New Roman",serif}
.qp{max-width:860px;margin:0 auto;padding:28px 18px 60px}.qp-head h1{font:700 1.9rem/1.2 Arial,Helvetica,sans-serif;margin:.2rem 0 1rem}
.qp-hello{font-size:1.3rem;margin:0}.qp-intro{font-size:1.1rem;margin:0 0 1rem}.qp-how{background:var(--blue-soft);border:2px solid var(--blue);border-radius:12px;padding:14px 18px;margin:0 0 1.6rem;font-size:1rem}
.qp-how ol{margin:.4rem 0 0;padding-left:1.3rem}.qp-q{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:18px;margin:0 0 1.4rem;break-inside:avoid}
.qp-q h2{display:flex;gap:.7rem;align-items:flex-start;font:700 1.25rem/1.35 Arial,Helvetica,sans-serif;margin:0 0 .7rem}.qp-n{flex:0 0 auto;display:inline-grid;place-items:center;width:2.1rem;height:2.1rem;border-radius:50%;background:var(--btn);color:#fff;font-size:1.05rem}
.qp-who{margin:-.2rem 0 .6rem;color:var(--muted);font-size:1rem}.qp-ph{margin:0 0 .8rem;text-align:center}.qp-ph img{max-width:100%;max-height:520px;border-radius:8px;border:1px solid var(--line)}.qp-ph figcaption{font-size:.9rem;color:var(--muted)}
.qp-noph{color:var(--muted);font-style:italic}textarea{width:100%;min-height:9.5rem;resize:vertical;font:inherit;font-size:1.1rem;line-height:1.5;color:var(--ink);background:var(--paper);border:2px solid var(--line);border-radius:10px;padding:12px 14px}
textarea:focus,input:focus{outline:3px solid var(--blue);outline-offset:2px;border-color:var(--blue)}.qp-me{display:grid;gap:.3rem;margin:0 0 1.2rem;font:700 1.05rem Arial,Helvetica,sans-serif}
.qp-me input{font:inherit;font-weight:400;font-size:1.1rem;padding:12px 14px;border:2px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink)}
.qp-bar{position:sticky;bottom:0;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 0;background:var(--paper)}
.qp-btn{font:700 1.15rem Arial,Helvetica,sans-serif;min-height:58px;padding:0 24px;border-radius:12px;border:2px solid var(--ink);background:var(--card);color:var(--ink);cursor:pointer}.qp-main{background:var(--btn);border-color:var(--btn);color:#fff}
.qp-btn:disabled{opacity:.45;cursor:not-allowed}.qp-state{font:1rem Arial,Helvetica,sans-serif;color:var(--ok)}.qp-state.is-warn{color:#b26b00}.qp-foot{margin-top:2rem;text-align:center;color:var(--muted)}
.qp-banner{margin:0;padding:10px 16px;background:#fff6d6;color:#5a4300;font:600 16px Arial,Helvetica,sans-serif;text-align:center;border-bottom:2px solid #e8c547}
.qp-lines{height:12.5rem;background:repeating-linear-gradient(to bottom,transparent 0,transparent 2.45rem,#9a958c 2.45rem,#9a958c 2.5rem)}.qp-written{white-space:normal;border-left:3px solid var(--line);padding-left:12px}
.qp-empty{color:var(--muted)}
@media (max-width:560px){body{font-size:18px}.qp{padding:18px 12px 40px}.qp-head h1{font-size:1.5rem}.qp-btn{flex:1 1 100%}}
@media print{:root{--ink:#000;--paper:#fff;--card:#fff;--line:#999;--muted:#444;--blue:#000;--blue-soft:#fff}body{font-size:13pt}.qp{max-width:none;padding:0}.qp-bar,.qp-me,.qp-banner{display:none!important}
.qp-q{border:1px solid #999;padding:10pt}.qp-n{background:#000}textarea{border:0;padding:0;min-height:0;height:auto;overflow:visible;resize:none;background:none}textarea:placeholder-shown{display:block;height:11rem;color:transparent;background:repeating-linear-gradient(to bottom,transparent 0,transparent 2.45rem,#888 2.45rem,#888 2.5rem)}
.qp-how{border:1px solid #999}}
CSS;
}

/** Le script du fichier envoyé (aucune ressource extérieure ; tout texte posé par textContent / value). */
function qp_js(bool $preview): string
{
    $pv = $preview ? 'true' : 'false';
    return <<<JS
(function(){'use strict';var PREVIEW={$pv};var D;try{D=JSON.parse(document.getElementById('qp-data').textContent);}catch(e){return;}
var KEY='lcnda-qp-'+D.questionnaire,form=document.getElementById('qp-form'),state=document.getElementById('qp-state'),from=document.getElementById('qp-from');
var boxes=[].slice.call(form.querySelectorAll('textarea[data-q]'));
function store(){try{return window.localStorage;}catch(e){return null;}}
function say(t,warn){if(!state)return;state.textContent=t;state.className='qp-state'+(warn?' is-warn':'');}
function hm(d){return d.getHours()+' h '+String(d.getMinutes()).padStart(2,'0');}
function collect(){var o={from:from?from.value:'',answers:{}};boxes.forEach(function(b){o.answers[b.getAttribute('data-q')]=b.value;});return o;}
function load(){var s=store();if(!s)return;try{var o=JSON.parse(s.getItem(KEY)||'null');if(!o||typeof o!=='object')return;if(from&&typeof o.from==='string')from.value=o.from.slice(0,120);
boxes.forEach(function(b){var v=o.answers&&o.answers[b.getAttribute('data-q')];if(typeof v==='string'&&!b.value)b.value=v.slice(0,20000);});say('✓ Tes réponses d’avant sont revenues.');}catch(e){}}
var t=0;function keep(){clearTimeout(t);t=setTimeout(function(){var s=store();if(!s){say('⚠️ Ce navigateur ne garde pas les réponses : enregistre-les avant de fermer.',true);return;}
try{s.setItem(KEY,JSON.stringify(collect()));say('✓ Gardé sur cet ordinateur à '+hm(new Date()));}catch(e){say('⚠️ Impossible de garder les réponses ici : enregistre-les avant de fermer.',true);}},400);}
function fnv(str){var h=0x811c9dc5;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;}return ('0000000'+h.toString(16)).slice(-8);}
function save(){if(PREVIEW){say('Aperçu : dans le vrai fichier, ce bouton télécharge les réponses.');return;}
var answers=boxes.map(function(b){var id=b.getAttribute('data-q');var q=D.questions.filter(function(x){return x.id===id;})[0];return {id:id,question:q?q.question:'',answer:b.value.trim()};}).filter(function(a){return a.answer!=='';});
if(!answers.length){say('⚠️ Écris au moins une réponse avant d’enregistrer.',true);return;}
var out={format:D.format,version:1,questionnaire:D.questionnaire,checksum:D.checksum,title:D.title,from:(from&&from.value.trim())||D.from||'',saved_at:new Date().toISOString(),answers:answers};
out.sum=fnv(JSON.stringify(answers));
var blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);
var n=(D.title||'questionnaire').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase().slice(0,50)||'questionnaire';
a.download='reponses-'+n+'.json';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);
say('✓ Fichier « '+a.download+' » enregistré : envoie-le-moi en pièce jointe d’un e-mail. Merci !');}
form.addEventListener('input',keep);form.addEventListener('submit',function(e){e.preventDefault();});document.getElementById('qp-save').addEventListener('click',save);
document.getElementById('qp-print').addEventListener('click',function(){if(PREVIEW){say('Aperçu : dans le vrai fichier, ce bouton imprime le questionnaire.');return;}window.print();});
load();})();
JS;
}

function qp_render(PDO $pdo, array $data): array
{
    $row = qp_row($pdo, safe_int($data['id'] ?? 0));
    $mode = in_array($data['mode'] ?? 'file', ['file', 'preview', 'print'], true) ? ($data['mode'] ?? 'file') : 'file';
    $r = qp_html($pdo, $row, $mode);
    if ($mode === 'file') {
        // la version envoyée est retenue : ses réponses seront reconnues même si le questionnaire change ensuite
        $sums = qp_json($row['checksums_json']);
        if (!in_array($r['checksum'], $sums, true)) {
            $sums[] = $r['checksum'];
            $sums = array_slice($sums, -30);
            $pdo->prepare('UPDATE family_questionnaires SET checksums_json=? WHERE id=?')->execute([json_encode($sums), (int) $row['id']]);
        }
    }
    return ['ok' => true] + $r;
}

/** Le texte de l'e-mail à envoyer avec le fichier. */
function qp_email_text(array $q): string
{
    $hello = $q['greeting'] !== '' ? 'Bonjour ' . $q['greeting'] . ',' : 'Bonjour,';
    return $hello . "\n\n"
        . "Je fais l’histoire de notre famille et j’aimerais beaucoup avoir tes souvenirs. Je t’envoie un petit questionnaire « " . $q['title'] . " » en pièce jointe.\n\n"
        . "1. Ouvre le fichier joint (double-clic) : il s’ouvre dans ton navigateur, sans Internet.\n"
        . "2. Écris tes réponses dans les cases. Tout est gardé au fur et à mesure.\n"
        . "3. Clique sur « Enregistrer mes réponses » et renvoie-moi le fichier qui s’est téléchargé, en répondant à cet e-mail.\n\n"
        . "Tu peux aussi l’imprimer et me répondre sur papier, ou simplement me répondre ici, par e-mail.\n\n"
        . "Merci beaucoup !";
}

/* ─── Le retour des réponses ───────────────────────────────────────────────── */

/**
 * Lit strictement un fichier de réponses (ou une réponse collée). Rend le questionnaire et les réponses propres.
 * $paste : {questionnaire_id, from, date, answers:[{id, answer}]} — réponse reçue par e-mail, collée dans l'app.
 */
function qp_read_answers(PDO $pdo, array $data): array
{
    if (isset($data['paste'])) {
        $p = $data['paste'];
        if (!is_array($p)) { throw new LcndaBadInput('Réponse collée incorrecte.'); }
        $row = qp_row($pdo, safe_int($p['questionnaire_id'] ?? 0));
        $from = qp_clean($p['from'] ?? '', 120, false, 'auteur');
        $date = qp_ymd($p['date'] ?? '') ?: date('Y-m-d');
        $list = $p['answers'] ?? null;
        $pasted = true;
    } else {
        $raw = $data['file'] ?? null;
        if (!is_string($raw)) { throw new LcndaBadInput('Fichier de réponses manquant.'); }
        if (strlen($raw) > QP_MAX_FILE) { throw new RuntimeException('Ce fichier est trop gros pour un fichier de réponses (' . (int) (QP_MAX_FILE / 1024) . ' Ko au plus).'); }
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
        try { $j = json_decode((string) $raw, true, 8, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING); }
        catch (JsonException) { throw new RuntimeException('Ce fichier n’est pas un fichier de réponses (il est illisible).'); }
        if (!is_array($j) || array_is_list($j) || ($j['format'] ?? null) !== QP_FORMAT) { throw new RuntimeException('Ce fichier n’est pas un fichier de réponses de « Questions aux proches ».'); }
        $allowed = ['format', 'version', 'questionnaire', 'checksum', 'title', 'from', 'saved_at', 'answers', 'sum'];
        if ($extra = array_diff(array_keys($j), $allowed)) { throw new RuntimeException('Fichier de réponses refusé : il contient des données inattendues (« ' . qp_clean((string) reset($extra), 40, false) . ' »).'); }
        if (($j['version'] ?? null) !== 1) { throw new RuntimeException('Version de fichier de réponses inconnue.'); }
        foreach (['questionnaire', 'checksum'] as $k) { if (!is_string($j[$k] ?? null)) { throw new RuntimeException('Fichier de réponses incomplet : « ' . $k . ' » manque.'); } }
        if (!preg_match('/^[a-f0-9]{32}$/', $j['questionnaire']) || !preg_match('/^[a-f0-9]{32}$/', $j['checksum'])) { throw new RuntimeException('Fichier de réponses refusé : identifiant incorrect.'); }
        $s = $pdo->prepare('SELECT * FROM family_questionnaires WHERE uid=?');
        $s->execute([$j['questionnaire']]);
        $row = $s->fetch(PDO::FETCH_ASSOC);
        if (!$row) { throw new RuntimeException('Ce fichier répond à un questionnaire qui n’est pas dans cette généalogie.'); }
        if (!in_array($j['checksum'], qp_json($row['checksums_json']), true)) { throw new RuntimeException('Fichier de réponses refusé : il ne correspond à aucune version envoyée de ce questionnaire (somme de contrôle).'); }
        foreach (['title', 'from', 'saved_at', 'sum'] as $k) { if (isset($j[$k]) && !is_string($j[$k])) { throw new LcndaBadInput('Fichier de réponses refusé : « ' . $k . ' » doit être un texte.'); } }
        $from = qp_clean($j['from'] ?? '', 120, false, 'auteur');
        $date = preg_match('/^(\d{4}-\d{2}-\d{2})/', (string) ($j['saved_at'] ?? ''), $m) && checkdate((int) substr($m[1], 5, 2), (int) substr($m[1], 8, 2), (int) substr($m[1], 0, 4)) && $m[1] <= date('Y-m-d', time() + 86400) ? $m[1] : date('Y-m-d');
        $list = $j['answers'] ?? null;
        $pasted = false;
    }
    if (!is_array($list) || !array_is_list($list)) { throw new RuntimeException('Fichier de réponses refusé : la liste des réponses manque.'); }
    if (count($list) > QP_MAX_QUESTIONS + 1) { throw new RuntimeException('Trop de réponses dans ce fichier.'); }
    $questions = qp_out($pdo, $row)['questions'];
    $byId = [];
    foreach ($questions as $q) { $byId[$q['id']] = $q; }
    $answers = []; $unknown = 0; $seen = [];
    foreach ($list as $a) {
        if (!is_array($a) || array_is_list($a) && $a) { throw new LcndaBadInput('Fichier de réponses refusé : une réponse est mal formée.'); }
        if ($extra = array_diff(array_keys($a), ['id', 'question', 'answer'])) { throw new RuntimeException('Fichier de réponses refusé : une réponse contient des données inattendues.'); }
        $id = $a['id'] ?? null;
        if (!is_string($id) || !preg_match('/^[a-z0-9]{1,16}$/', $id)) { throw new RuntimeException('Fichier de réponses refusé : numéro de question incorrect.'); }
        if (isset($a['question']) && !is_string($a['question'])) { throw new LcndaBadInput('Fichier de réponses refusé : une question doit être un texte.'); }
        $text = qp_clean($a['answer'] ?? '', QP_MAX_ANSWER, true, 'réponse');
        if ($text === '' || isset($seen[$id])) { continue; }
        $seen[$id] = true;
        if ($id === 'free' && $pasted) { $answers[] = ['id' => 'free', 'question' => 'Réponse reçue par e-mail', 'answer' => $text, 'person_id' => 0, 'media_id' => 0, 'kind' => 'text']; continue; }
        if (!isset($byId[$id])) { $unknown++; continue; } // question retirée depuis l'envoi
        $q = $byId[$id];
        $answers[] = ['id' => $id, 'question' => $q['shown'], 'answer' => $text, 'person_id' => (int) $q['person_id'], 'media_id' => (int) $q['media_id'], 'kind' => $q['kind'], 'theme' => $q['theme'] ?? ''];
    }
    return ['row' => $row, 'from' => $from, 'date' => $date, 'answers' => $answers, 'unknown' => $unknown, 'pasted' => $pasted];
}

/** Où va une réponse, d'office : la personne de la question (ou du questionnaire) → Témoignage ; une recette → Mémoire familiale. */
function qp_suggest(array $a, array $row): array
{
    $pid = (int) $a['person_id'] ?: (int) $row['person_id'];
    $kind = match ($a['theme'] ?? '') { 'recettes' => 'recipe', 'fetes' => 'tradition', default => 'story' };
    if (in_array($a['theme'] ?? '', ['recettes', 'fetes'], true) || !$pid) { return ['dest' => 'memory', 'kind' => $kind, 'person_id' => $pid]; }
    return ['dest' => 'testimony', 'kind' => $kind, 'person_id' => $pid];
}

function qp_analyze(PDO $pdo, array $data): array
{
    $r = qp_read_answers($pdo, $data);
    $q = qp_out($pdo, $r['row'], false);
    $people = qp_people($pdo, [...array_column($r['answers'], 'person_id'), (int) $r['row']['person_id']]);
    $answers = array_map(static function ($a) use ($r, $people) {
        $s = qp_suggest($a, $r['row']);
        $a['suggest'] = $s;
        $a['person'] = $people[$s['person_id']] ?? null;
        return $a;
    }, $r['answers']);
    return ['ok' => true, 'questionnaire' => ['id' => $q['id'], 'title' => $q['title'], 'recipient_name' => $q['recipient_name'], 'status' => $q['status']],
        'from' => $r['from'] ?: $q['recipient_name'], 'date' => $r['date'], 'date_label' => qp_date_fr($r['date']), 'answers' => $answers, 'unknown' => $r['unknown'],
        'pasted' => $r['pasted'], 'kinds' => array_diff_key(MEMORY_KINDS, ['testimony' => 1])];
}

/** « D'où ça vient » : l'auteur et la date, tout seuls. */
function qp_origin(string $from, string $title, string $date, bool $pasted): string
{
    return trim(($from !== '' ? $from : 'Un proche') . ($pasted ? ', réponse reçue par e-mail' : ', réponse au questionnaire') . ' « ' . $title . ' », le ' . qp_date_fr($date));
}

function qp_import(PDO $pdo, array $data): array
{
    $r = qp_read_answers($pdo, $data);
    $row = $r['row'];
    if (!$r['answers']) { throw new RuntimeException('Aucune réponse à importer dans ce fichier.'); }
    $choices = $data['choices'] ?? [];
    if (!is_array($choices)) { throw new LcndaBadInput('Choix incorrects.'); }
    $byId = [];
    foreach ($choices as $c) {
        if (!is_array($c) || !is_string($c['id'] ?? null)) { throw new LcndaBadInput('Choix incorrect.'); }
        $byId[$c['id']] = $c;
    }
    $contact = qp_contact($pdo, (int) $row['contact_id']);
    $from = $r['from'] !== '' ? $r['from'] : ($contact['name'] ?? (string) $row['recipient_text']);
    $origin = qp_origin($from, (string) $row['title'], $r['date'], $r['pasted']);
    $created = []; $counts = ['testimony' => 0, 'memory' => 0, 'skip' => 0];
    $prevAnswers = qp_json($row['answers_json']);
    $answersOut = $prevAnswers;
    $ins = $pdo->prepare('INSERT OR IGNORE INTO family_memory_people(memory_id, person_id, role) VALUES(?,?,?)');
    $media = $pdo->prepare("INSERT INTO family_collection_media(collection_type, collection_id, media_id, position) VALUES('family_memory',?,?,0)");
    foreach ($r['answers'] as $a) {
        $c = $byId[$a['id']] ?? qp_suggest($a, $row);
        $dest = in_array($c['dest'] ?? '', ['testimony', 'memory', 'skip'], true) ? $c['dest'] : 'skip';
        $answersOut[$a['id']] = ['question' => $a['question'], 'answer' => $a['answer']];
        if ($dest === 'skip') { $counts['skip']++; continue; }
        $pid = max(0, safe_int($c['person_id'] ?? 0));
        if ($pid && !qp_people($pdo, [$pid])) { $pid = 0; }
        if ($dest === 'testimony' && !$pid) { throw new RuntimeException('Choisis la personne concernée pour le témoignage « ' . mb_substr($a['question'], 0, 60) . ' ».'); }
        $kind = $dest === 'testimony' ? 'testimony' : (is_string($c['kind'] ?? null) && isset(MEMORY_KINDS[$c['kind']]) && $c['kind'] !== 'testimony' ? $c['kind'] : 'story');
        $title = mb_strlen($a['question']) > 160 ? rtrim(mb_substr($a['question'], 0, 157)) . '…' : $a['question'];
        $pdo->prepare('INSERT INTO family_memories(kind, title, content, origin_text, notes) VALUES(?,?,?,?,?)')
            ->execute([$kind, $title, $a['answer'], $origin, 'Questionnaire « ' . $row['title'] . ' »']);
        $mid = (int) $pdo->lastInsertId();
        if ($pid) { $ins->execute([$mid, $pid, 'about']); }
        if ($contact && $contact['person_id'] && $contact['person_id'] !== $pid && qp_people($pdo, [$contact['person_id']])) { $ins->execute([$mid, $contact['person_id'], 'transmitted']); }
        if ($a['media_id'] && qp_media($pdo, [$a['media_id']])) { $media->execute([$mid, $a['media_id']]); }
        log_change($pdo, 'family_memory', $mid, 'create', ($dest === 'testimony' ? 'Témoignage ajouté : ' : 'Mémoire familiale ajoutée : ') . $title);
        $created[] = $mid;
        $counts[$dest]++;
    }
    $imports = qp_json($row['imports_json']);
    $imports[] = ['at' => date('c'), 'memory_ids' => $created, 'prev_status' => $row['status'], 'prev_answers' => $prevAnswers, 'prev_by' => $row['answered_by'], 'prev_at' => $row['answered_at']];
    $imports = array_slice($imports, -20);
    $pdo->prepare("UPDATE family_questionnaires SET status=CASE WHEN status='filed' THEN 'filed' ELSE 'answered' END, answered_at=?, answered_by=?, answers_json=?, imports_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        ->execute([$r['date'], $from, json_encode($answersOut, JSON_UNESCAPED_UNICODE), json_encode($imports, JSON_UNESCAPED_UNICODE), (int) $row['id']]);
    log_change($pdo, 'family_questionnaire', (int) $row['id'], 'update', 'Réponses importées : ' . $row['title']);
    return ['ok' => true, 'id' => (int) $row['id'], 'created' => $created, 'counts' => $counts, 'from' => $from];
}

/** ↶ Annuler le dernier import : les souvenirs créés sont retirés, l'état d'avant revient. */
function qp_undo_import(PDO $pdo, array $data): array
{
    $row = qp_row($pdo, safe_int($data['id'] ?? 0));
    $imports = qp_json($row['imports_json']);
    $last = array_pop($imports);
    if (!$last) { throw new RuntimeException('Rien à annuler.'); }
    $removed = 0;
    foreach (($last['memory_ids'] ?? []) as $mid) {
        $mid = (int) $mid;
        $chk = $pdo->prepare('SELECT count(*) FROM family_memories WHERE id=?'); $chk->execute([$mid]);
        if (!(int) $chk->fetchColumn()) { continue; }
        delete_family_memory($pdo, ['id' => $mid]);
        $removed++;
    }
    $prev = in_array($last['prev_status'] ?? '', array_keys(QP_STATUSES), true) ? $last['prev_status'] : 'sent';
    $pdo->prepare('UPDATE family_questionnaires SET status=?, answers_json=?, answered_by=?, answered_at=?, imports_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        ->execute([$prev, json_encode($last['prev_answers'] ?? [], JSON_UNESCAPED_UNICODE), (string) ($last['prev_by'] ?? ''), (string) ($last['prev_at'] ?? ''), json_encode($imports, JSON_UNESCAPED_UNICODE), (int) $row['id']]);
    log_change($pdo, 'family_questionnaire', (int) $row['id'], 'update', 'Import des réponses annulé : ' . $row['title']);
    return ['ok' => true, 'removed' => $removed];
}

function qp_template_save(PDO $pdo, array $data): array
{
    $text = qp_clean($data['text'] ?? '', QP_MAX_QUESTION, true, 'question');
    if ($text === '') { throw new RuntimeException('Écris la question.'); }
    $kind = in_array($data['kind'] ?? 'text', ['text', 'person', 'photo'], true) ? ($data['kind'] ?? 'text') : 'text';
    $theme = in_array($data['theme'] ?? 'mine', qp_theme_keys(), true) ? $data['theme'] : 'mine';
    $id = safe_int($data['id'] ?? 0);
    if ($id) { $pdo->prepare('UPDATE questionnaire_templates SET text=?, kind=?, theme=? WHERE id=?')->execute([$text, $kind, $theme, $id]); }
    else {
        $n = (int) $pdo->query('SELECT count(*) FROM questionnaire_templates')->fetchColumn();
        if ($n >= 500) { throw new RuntimeException('500 questions à toi au plus.'); }
        $pdo->prepare('INSERT INTO questionnaire_templates(text, kind, theme) VALUES(?,?,?)')->execute([$text, $kind, $theme]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['ok' => true, 'id' => $id] + qp_templates($pdo);
}

function qp_template_delete(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM questionnaire_templates WHERE id=?'); $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Question introuvable.'); }
    $pdo->prepare('DELETE FROM questionnaire_templates WHERE id=?')->execute([$id]);
    return ['ok' => true, 'removed' => ['id' => (int) $row['id'], 'text' => $row['text'], 'kind' => $row['kind'], 'theme' => $row['theme']]] + qp_templates($pdo);
}

function qp_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action === 'qp_list') { json_response(qp_list($pdo, safe_int($_GET['contact_id'] ?? 0), safe_int($_GET['person_id'] ?? 0))); }
            if ($action === 'qp_get') {
                $q = qp_out($pdo, qp_row($pdo, safe_int($_GET['id'] ?? 0)));
                $q['email'] = qp_email_text($q);
                json_response(['questionnaire' => $q, 'statuses' => QP_STATUSES]);
            }
            if ($action === 'qp_templates') { json_response(qp_templates($pdo)); }
        }
        if ($isWrite && $action === 'qp_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            if ($op === 'analyze') { json_response(qp_analyze($pdo, $payload)); } // lecture seule
            if ($op === 'preview') { json_response(qp_preview($pdo, $payload)); } // lecture seule
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'save' => qp_save($pdo, $payload),
                    'delete' => qp_delete($pdo, $payload),
                    'restore' => qp_restore($pdo, $payload),
                    'status' => qp_status($pdo, $payload),
                    'render' => qp_render($pdo, $payload),
                    'import' => qp_import($pdo, $payload),
                    'undo_import' => qp_undo_import($pdo, $payload),
                    'template_save' => qp_template_save($pdo, $payload),
                    'template_delete' => qp_template_delete($pdo, $payload),
                    default => throw new LcndaBadInput('Opération inconnue sur les questionnaires.'),
                };
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue sur les questionnaires.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
