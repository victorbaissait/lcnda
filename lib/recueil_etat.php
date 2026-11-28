<?php
declare(strict_types=1);

/*
 * 🗂 État d'un recueil (maquette docs/design/registres-etat-fonds.html, parties 1 à 3).
 * Chaque page dit où elle en est, avec les mots de l'Atelier (⚪ À faire · 🟡 En cours · 🔵 Relue · 🟢 Finie) :
 *  - l'état est CALCULÉ (un acte de l'Atelier sur une photo de la page : son état ; sinon une transcription écrite = en cours),
 *    sauf si on l'a choisi à la main (recueil_pages.state) ;
 *  - la fiabilité de la lecture est DÉDUITE (lignes relues dans l'Atelier, « [?] » et « [illisible] » dans le texte) : jamais à remplir ;
 *  - une page absente a une raison (recueil_pages.absent) ; elle peut rejoindre les Lacunes d'archives (archive_digest_gaps, qui existent) ;
 *  - la lisibilité et « photo à refaire » se notent à la main ;
 *  - le recueil dit comment il est numéroté (paginé, folioté, sans ordre, numérotation des archives) et combien de pages il devrait avoir.
 * Colonnes ajoutées par la migration 106 (et à la première utilisation : rejouable, rien n'est jamais effacé).
 * Écran : assets/js/heritage-recueil-etat.js. Essai : tests/test-recueil-etat.js.
 */

const RECUEIL_STATES = ['todo', 'doing', 'checked', 'done'];
const RECUEIL_ABSENT = ['manquante', 'perdue', 'photo', 'numerisee', 'en_ligne', 'communicable', 'restauration', 'ailleurs', 'blanche', 'autre'];
const RECUEIL_LEGIBILITY = ['bonne', 'difficile', 'partielle', 'illisible'];
const RECUEIL_NUMBERING = ['page', 'folio', 'liasse', 'archives'];
/** la sorte d'une page : ordinaire (''), table ou index, couverture, page de garde, annexe */
const RECUEIL_PAGE_KINDS = ['table', 'couverture', 'garde', 'annexe'];
/** une page absente → la sorte de lacune d'archives qui existe (Recherche › Suivi des registres › Lacunes) */
const RECUEIL_ABSENT_GAP = ['manquante' => 'other', 'perdue' => 'destroyed', 'photo' => 'other', 'numerisee' => 'not_digitized', 'en_ligne' => 'not_online',
    'communicable' => 'unavailable', 'restauration' => 'unavailable', 'ailleurs' => 'other', 'autre' => 'other'];
const RECUEIL_ABSENT_LABEL = ['manquante' => 'Page manquante', 'perdue' => 'Perdue ou détruite', 'photo' => 'Pas encore photographiée', 'numerisee' => 'Pas numérisée',
    'en_ligne' => 'Numérisée, pas en ligne', 'communicable' => 'Non communicable', 'restauration' => 'En restauration', 'ailleurs' => 'Ailleurs', 'blanche' => 'Page blanche', 'autre' => 'Autre'];

function recueil_etat_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    recueil_etat_install($pdo);
    $done = true;
}

/** migration 106 : les colonnes (rejouable) */
function recueil_etat_install(PDO $pdo): void
{
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='recueil_pages'")->fetchColumn()) { return; }
    $have = static fn(string $t) => array_column($pdo->query("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    $p = $have('recueil_pages');
    foreach (['state' => "TEXT NOT NULL DEFAULT ''", 'absent' => "TEXT NOT NULL DEFAULT ''", 'absent_note' => "TEXT NOT NULL DEFAULT ''", 'absent_until' => "TEXT NOT NULL DEFAULT ''",
        'legibility' => "TEXT NOT NULL DEFAULT ''", 'redo' => 'INTEGER NOT NULL DEFAULT 0', 'gap_id' => 'INTEGER', 'assignee' => "TEXT NOT NULL DEFAULT ''", 'language' => "TEXT NOT NULL DEFAULT ''", 'page_kind' => "TEXT NOT NULL DEFAULT ''"] as $c => $def) { // language, page_kind : 🔤 langue de la page, 📇 table / index // assignee : 👥 confiée à (migration 109)
        if (!in_array($c, $p, true)) { $pdo->exec("ALTER TABLE recueil_pages ADD COLUMN $c $def"); }
    }
    $r = $have('recueils');
    foreach (['numbering' => "TEXT NOT NULL DEFAULT ''", 'expected_pages' => 'INTEGER NOT NULL DEFAULT 0', 'goal_date' => "TEXT NOT NULL DEFAULT ''"] as $c => $def) { // goal_date : 📈 objectif (migration 109)
        if (!in_array($c, $r, true)) { $pdo->exec("ALTER TABLE recueils ADD COLUMN $c $def"); }
    }
}

/** l'empreinte d'une ligne, la même que l'Atelier (FNV-1a, base 36 ; heritage-transcribe-relecture.js lineKey) */
function recueil_line_key(string $s): string
{
    $h = 0x811c9dc5;
    foreach (mb_str_split(trim((string) preg_replace('/\s+/u', ' ', $s))) as $ch) { $h ^= mb_ord($ch); $h = ($h * 0x01000193) & 0xFFFFFFFF; }
    return base_convert((string) $h, 10, 36);
}

/** les lignes d'un texte qui comptent (pas les repères « — page 2 — ») */
function recueil_text_lines(string $text): array
{
    return array_values(array_filter(explode("\n", $text), static fn($l) => trim($l) !== '' && !preg_match('/^—[ \t]*[\p{L}.]+[ \t]+\d+[^\n—]*—[ \t]*$/u', $l)));
}

/** « [?] » et « [illisible] » : les mots peu sûrs laissés dans le texte */
function recueil_doubt_marks(string $text): int
{
    return preg_match_all('/\[\?\]|\[illisible\]/u', $text);
}

/**
 * Ajoute à chaque page de recueil_detail() : son état (choisi ou calculé), la fiabilité, l'acte de l'Atelier s'il y en a un,
 * l'absence, la lisibilité, « photo à refaire » ; et au recueil : numérotation, pages attendues, compteurs.
 */
function recueil_etat_decorate(PDO $pdo, array $detail): array
{
    recueil_etat_ensure($pdo);
    $rid = (int) $detail['recueil']['id'];
    $s = $pdo->prepare('SELECT numbering, expected_pages, goal_date FROM recueils WHERE id=?'); $s->execute([$rid]); $r = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    $detail['recueil']['goal_date'] = (string) ($r['goal_date'] ?? '');
    $detail['recueil']['numbering'] = in_array($r['numbering'] ?? '', RECUEIL_NUMBERING, true) ? $r['numbering'] : '';
    $detail['recueil']['expected_pages'] = (int) ($r['expected_pages'] ?? 0);
    $rows = [];
    $s = $pdo->prepare('SELECT id, state, absent, absent_note, absent_until, legibility, redo, gap_id, assignee, language, page_kind FROM recueil_pages WHERE recueil_id=?'); $s->execute([$rid]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $x) { $rows[(int) $x['id']] = $x; }
    // les photos « page » de chaque page, et les autres pages de leur document (📑) : l'acte de l'Atelier peut être sur l'une d'elles
    $mediaOf = []; $set = [];
    foreach ($detail['images'] as $i) { if ($i['page_id'] && $i['role'] === 'page') { $mediaOf[$i['page_id']][] = (int) $i['media_id']; } }
    $acts = [];
    if ($mediaOf && function_exists('act_transcriptions_ensure')) {
        act_transcriptions_ensure($pdo);
        $all = array_values(array_unique(array_merge(...array_values($mediaOf))));
        // média → les médias de son ensemble de pages ($set)
        if (function_exists('media_page_set_of')) { foreach ($all as $m) { $ids = media_page_ids($pdo, media_page_set_of($pdo, $m)); $set[$m] = $ids ?: [$m]; } }
        $want = array_values(array_unique(array_merge($all, ...array_values($set ?: [[]]))));
        if ($want) {
            $q = $pdo->query('SELECT id, media_id, body, data_json FROM act_transcriptions WHERE media_id IN (' . implode(',', array_map('intval', $want)) . ') ORDER BY id');
            foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $a) { $acts[(int) $a['media_id']] ??= $a; }
        }
    }
    $count = ['todo' => 0, 'doing' => 0, 'checked' => 0, 'done' => 0, 'absent' => 0, 'blank' => 0, 'redo' => 0, 'review' => 0, 'doubt' => 0, 'photos' => 0];
    foreach ($detail['pages'] as &$p) {
        $x = $rows[$p['id']] ?? [];
        $act = null;
        foreach ($mediaOf[$p['id']] ?? [] as $m) { foreach ($set[$m] ?? [$m] as $mm) { if (isset($acts[$mm])) { $act = $acts[$mm]; break 2; } } }
        $text = (string) $p['transcription']; $auto = trim($text) !== '' ? 'doing' : 'todo'; $info = null;
        if ($act) {
            $d = json_decode((string) $act['data_json'], true) ?: [];
            $body = (string) $act['body']; $lines = recueil_text_lines($body);
            $keys = array_flip(array_map('strval', is_array($d['reviewed'] ?? null) ? $d['reviewed'] : []));
            $rev = count(array_filter($lines, static fn($l) => isset($keys[recueil_line_key($l)])));
            $st = in_array($d['status'] ?? '', RECUEIL_STATES, true) ? $d['status'] : (trim($body) === '' ? 'todo' : 'doing');
            $auto = $st; $text = $body;
            $info = ['id' => (int) $act['id'], 'status' => $st, 'lines' => count($lines), 'reviewed' => $rev, 'doubt' => recueil_doubt_marks($body)];
        }
        $state = in_array($x['state'] ?? '', RECUEIL_STATES, true) ? $x['state'] : $auto;
        $absent = in_array($x['absent'] ?? '', RECUEIL_ABSENT, true) ? $x['absent'] : '';
        $legi = in_array($x['legibility'] ?? '', RECUEIL_LEGIBILITY, true) ? $x['legibility'] : '';
        $doubt = $info ? $info['doubt'] : recueil_doubt_marks($text);
        // la fiabilité : illisible (dit à la main) › doute (mots peu sûrs) › à relire › sûre (tout relu, ou relue / finie sans mot peu sûr)
        $rel = '';
        if (!$absent && trim($text) !== '') {
            if ($legi === 'illisible') { $rel = 'illegible'; }
            elseif ($doubt) { $rel = 'doubt'; }
            elseif ($info ? ($info['lines'] && $info['reviewed'] >= $info['lines']) || in_array($state, ['checked', 'done'], true) : in_array($state, ['checked', 'done'], true)) { $rel = 'sure'; }
            else { $rel = 'review'; }
        }
        $p += ['state' => $state, 'state_auto' => $auto, 'state_set' => ($x['state'] ?? '') !== '', 'act' => $info, 'reliability' => $rel, 'doubt' => $doubt,
            'absent' => $absent, 'absent_note' => (string) ($x['absent_note'] ?? ''), 'absent_until' => (string) ($x['absent_until'] ?? ''),
            'legibility' => $legi, 'redo' => (int) ($x['redo'] ?? 0), 'gap_id' => isset($x['gap_id']) ? (int) $x['gap_id'] : 0, 'has_photo' => !empty($mediaOf[$p['id']]), 'assignee' => (string) ($x['assignee'] ?? ''),
            'language' => (string) ($x['language'] ?? ''), 'page_kind' => in_array($x['page_kind'] ?? '', RECUEIL_PAGE_KINDS, true) ? $x['page_kind'] : ''];
        if ($absent === 'blanche') { $count['blank']++; }
        elseif ($absent) { $count['absent']++; }
        else { $count[$state]++; if ($rel === 'review') { $count['review']++; } if ($rel === 'doubt') { $count['doubt']++; } }
        if ($p['redo']) { $count['redo']++; }
        if ($p['has_photo']) { $count['photos']++; }
    }
    unset($p);
    $detail['etat'] = $count;
    if (function_exists('recueil_progress_record')) { recueil_progress_record($pdo, $rid, $count); } // 📈 un point par jour (lib/recueil_plus.php)
    return $detail;
}

/** la page doit être dans ce recueil */
function recueil_etat_pages(PDO $pdo, int $rid, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { throw new RuntimeException('Choisis au moins une page.'); }
    if (count($ids) > 5000) { throw new RuntimeException('Trop de pages d’un coup.'); }
    $s = $pdo->prepare('SELECT id FROM recueil_pages WHERE recueil_id=? AND id IN (' . implode(',', $ids) . ')'); $s->execute([$rid]);
    $ok = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    if (count($ok) !== count($ids)) { throw new RuntimeException('Une de ces pages n’est pas dans ce recueil.'); }
    return $ids;
}

/** les valeurs propres d'un changement : seulement les champs donnés, vérifiés */
function recueil_etat_clean(array $f): array
{
    $out = [];
    if (array_key_exists('state', $f)) { $out['state'] = in_array($f['state'], RECUEIL_STATES, true) ? $f['state'] : ''; }
    if (array_key_exists('absent', $f)) { $out['absent'] = in_array($f['absent'], RECUEIL_ABSENT, true) ? $f['absent'] : ''; }
    if (array_key_exists('absent_note', $f)) { $out['absent_note'] = mb_substr(safe_text((string) ($f['absent_note'] ?? '')), 0, 500); }
    if (array_key_exists('absent_until', $f)) { $y = (string) ($f['absent_until'] ?? ''); $out['absent_until'] = preg_match('/^\d{4}$/', $y) ? $y : ''; }
    if (array_key_exists('legibility', $f)) { $out['legibility'] = in_array($f['legibility'], RECUEIL_LEGIBILITY, true) ? $f['legibility'] : ''; }
    if (array_key_exists('redo', $f)) { $out['redo'] = !empty($f['redo']) ? 1 : 0; }
    if (array_key_exists('assignee', $f)) { $out['assignee'] = mb_substr(safe_text((string) ($f['assignee'] ?? '')), 0, 80); }
    if (array_key_exists('language', $f)) { $out['language'] = mb_substr(safe_text((string) ($f['language'] ?? '')), 0, 60); }
    if (array_key_exists('page_kind', $f)) { $out['page_kind'] = in_array($f['page_kind'] ?? '', RECUEIL_PAGE_KINDS, true) ? $f['page_kind'] : ''; }
    return $out;
}

/**
 * Change l'état de plusieurs pages d'un coup : {recueil_id, page_ids, fields: {state|absent|absent_note|absent_until|legibility|redo}, gap: bool}.
 * gap : les pages absentes rejoignent une lacune d'archives (une seule pour le lot). Renvoie l'avant (pour ↶ Annuler) et la lacune créée.
 */
function recueil_pages_set(PDO $pdo, array $data): array
{
    recueil_etat_ensure($pdo);
    $rid = safe_int($data['recueil_id'] ?? 0); $r = recueil_row($pdo, $rid);
    $ids = recueil_etat_pages($pdo, $rid, is_array($data['page_ids'] ?? null) ? $data['page_ids'] : []);
    $f = recueil_etat_clean(is_array($data['fields'] ?? null) ? $data['fields'] : []);
    if (!$f) { throw new RuntimeException('Rien à changer.'); }
    $before = $pdo->query('SELECT id, state, absent, absent_note, absent_until, legibility, redo, gap_id, assignee, language, page_kind FROM recueil_pages WHERE id IN (' . implode(',', $ids) . ')')->fetchAll(PDO::FETCH_ASSOC);
    $gapId = 0;
    if (!empty($data['gap']) && !empty($f['absent']) && $f['absent'] !== 'blanche') {
        $nums = recueil_etat_nums($pdo, $rid, $ids);
        $title = sprintf('%s : %s (%s)', $r['title'], $nums, RECUEIL_ABSENT_LABEL[$f['absent']] ?? '');
        $pdo->prepare("INSERT INTO archive_digest_gaps(archive_digest_id, gap_type, period_text, title, notes, url, status) VALUES(NULL, ?, ?, ?, ?, '', 'open')")
            ->execute([RECUEIL_ABSENT_GAP[$f['absent']] ?? 'other', (string) $r['date_text'], mb_substr($title, 0, 300), trim(($r['reference'] ? 'Cote : ' . $r['reference'] . "\n" : '') . ($f['absent_note'] ?? ''))]);
        $gapId = (int) $pdo->lastInsertId();
        log_change($pdo, 'archive_digest_gap', $gapId, 'create', 'Lacune d’archive ajoutée : ' . $title, null, null);
    }
    $set = implode(', ', array_map(static fn($k) => "$k=?", array_keys($f))) . ($gapId ? ', gap_id=?' : '');
    $u = $pdo->prepare("UPDATE recueil_pages SET $set WHERE id=?");
    foreach ($ids as $id) { $u->execute([...array_values($f), ...($gapId ? [$gapId] : []), $id]); }
    // plus absente : son lien vers la lacune part (la lacune reste dans la liste des lacunes)
    if (array_key_exists('absent', $f) && $f['absent'] === '') { $pdo->exec('UPDATE recueil_pages SET gap_id=NULL WHERE id IN (' . implode(',', $ids) . ')'); }
    recueil_touch($pdo, $rid);
    log_change($pdo, 'recueil', $rid, 'etat', count($ids) . ' page(s) : ' . implode(', ', array_keys($f)));
    return ['changed' => count($ids), 'before' => $before, 'gap_id' => $gapId];
}

/** ↶ Annuler recueil_pages_set : remet chaque page comme avant ; la lacune créée par ce changement est retirée */
function recueil_pages_restore(PDO $pdo, array $data): array
{
    recueil_etat_ensure($pdo);
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $rows = is_array($data['before'] ?? null) ? $data['before'] : [];
    $ids = recueil_etat_pages($pdo, $rid, array_column($rows, 'id'));
    $u = $pdo->prepare('UPDATE recueil_pages SET state=?, absent=?, absent_note=?, absent_until=?, legibility=?, redo=?, gap_id=?, assignee=?, language=?, page_kind=? WHERE id=? AND recueil_id=?');
    foreach ($rows as $x) {
        $c = recueil_etat_clean($x + ['state' => '', 'absent' => '', 'absent_note' => '', 'absent_until' => '', 'legibility' => '', 'redo' => 0, 'assignee' => '', 'language' => '', 'page_kind' => '']);
        $u->execute([$c['state'], $c['absent'], $c['absent_note'], $c['absent_until'], $c['legibility'], $c['redo'], safe_int($x['gap_id'] ?? 0) ?: null, $c['assignee'], $c['language'], $c['page_kind'], (int) $x['id'], $rid]);
    }
    $gap = safe_int($data['gap_id'] ?? 0);
    if ($gap) {
        $still = $pdo->prepare('SELECT COUNT(*) FROM recueil_pages WHERE gap_id=?'); $still->execute([$gap]);
        if (!(int) $still->fetchColumn()) { $pdo->prepare('DELETE FROM archive_digest_gaps WHERE id=?')->execute([$gap]); }
    }
    recueil_touch($pdo, $rid);
    return ['restored' => count($ids)];
}

/** « p. 31-32 », « p. 3, 7, 9-11 » : les numéros des pages (leur place dans le recueil) */
function recueil_etat_nums(PDO $pdo, int $rid, array $ids): string
{
    $s = $pdo->prepare('SELECT id FROM recueil_pages WHERE recueil_id=? ORDER BY position, id'); $s->execute([$rid]);
    $pos = array_flip(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)));
    $n = array_map(static fn($id) => ($pos[$id] ?? 0) + 1, $ids); sort($n);
    $parts = []; $a = $b = null;
    foreach ($n as $x) { if ($a === null) { $a = $b = $x; } elseif ($x === $b + 1) { $b = $x; } else { $parts[] = $a === $b ? "$a" : "$a-$b"; $a = $b = $x; } }
    if ($a !== null) { $parts[] = $a === $b ? "$a" : "$a-$b"; }
    return 'p. ' . implode(', ', $parts);
}

/**
 * Pose des pages absentes à leur place (un trou de numérotation : « f° 16 r°, f° 16 v°… » après une page) :
 * {recueil_id, after (page), labels[], absent, absent_note, gap}. Renvoie les pages créées (↶ Annuler : delete_recueil_page).
 */
function recueil_insert_absent(PDO $pdo, array $data): array
{
    recueil_etat_ensure($pdo);
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $labels = array_values(array_filter(array_map(static fn($l) => mb_substr(safe_text((string) $l), 0, 200), is_array($data['labels'] ?? null) ? $data['labels'] : []), static fn($l) => $l !== ''));
    if (!$labels || count($labels) > 400) { throw new RuntimeException('Donne le nom des pages à poser (400 au plus).'); }
    $after = safe_int($data['after'] ?? 0); $ids = [];
    foreach ($labels as $l) { $id = save_recueil_page($pdo, ['recueil_id' => $rid, 'after' => $after, 'label' => $l] + ($after ? [] : ['at_start' => 1]))['id']; $ids[] = $id; $after = $id; }
    $absent = in_array($data['absent'] ?? '', RECUEIL_ABSENT, true) ? $data['absent'] : 'manquante';
    $r = recueil_pages_set($pdo, ['recueil_id' => $rid, 'page_ids' => $ids, 'fields' => ['absent' => $absent, 'absent_note' => $data['absent_note'] ?? ''], 'gap' => !empty($data['gap'])]);
    return ['page_ids' => $ids, 'gap_id' => $r['gap_id']];
}

/** ↶ Annuler recueil_insert_absent : les pages posées partent, et la lacune créée avec elles */
function recueil_remove_inserted(PDO $pdo, array $data): array
{
    recueil_etat_ensure($pdo);
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $ids = recueil_etat_pages($pdo, $rid, is_array($data['page_ids'] ?? null) ? $data['page_ids'] : []);
    $has = $pdo->prepare('SELECT COUNT(*) FROM recueil_images WHERE page_id=?');
    foreach ($ids as $id) { $has->execute([$id]); if ((int) $has->fetchColumn()) { throw new RuntimeException('Une de ces pages a déjà une photo : retire-la à la main.'); } }
    foreach ($ids as $id) { delete_recueil_page($pdo, ['id' => $id]); }
    $gap = safe_int($data['gap_id'] ?? 0);
    if ($gap) { $still = $pdo->prepare('SELECT COUNT(*) FROM recueil_pages WHERE gap_id=?'); $still->execute([$gap]); if (!(int) $still->fetchColumn()) { $pdo->prepare('DELETE FROM archive_digest_gaps WHERE id=?')->execute([$gap]); } }
    return ['removed' => count($ids)];
}

/** la numérotation du recueil et le nombre de pages attendues (fiche du recueil) */
function recueil_etat_save_meta(PDO $pdo, int $rid, array $data): void
{
    recueil_etat_ensure($pdo);
    if (array_key_exists('numbering', $data)) { $pdo->prepare('UPDATE recueils SET numbering=? WHERE id=?')->execute([in_array($data['numbering'], RECUEIL_NUMBERING, true) ? $data['numbering'] : '', $rid]); }
    if (array_key_exists('goal_date', $data)) { $g = (string) ($data['goal_date'] ?? ''); $pdo->prepare('UPDATE recueils SET goal_date=? WHERE id=?')->execute([preg_match('/^\d{4}-\d{2}-\d{2}$/', $g) ? $g : '', $rid]); }
    if (array_key_exists('expected_pages', $data)) { $pdo->prepare('UPDATE recueils SET expected_pages=? WHERE id=?')->execute([max(0, min(100000, safe_int($data['expected_pages'] ?? 0))), $rid]); }
}

/** 📋 ce qui reste à faire, pour le tableau de bord et la vue des fonds : par recueil */
function recueil_etat_todo(PDO $pdo, int $rid): array
{
    $d = recueil_detail($pdo, $rid); // déjà avec l'état (recueil_etat_decorate)
    return ['recueil_id' => $rid, 'title' => $d['recueil']['title'], 'etat' => $d['etat'], 'pages' => count($d['pages']), 'expected' => $d['recueil']['expected_pages']];
}
