<?php
declare(strict_types=1);

/**
 * 🔍 « Qui est sur cette photo ? » à plusieurs (interface : assets/js/heritage-photo-ask.js).
 *
 * Même chemin que 💬 Questions aux proches (lib/questions_proches.php, dont on reprend le nettoyage des textes, les photos
 * intégrées et l'échappement) : l'app n'est jamais ouverte par le cousin, on passe par des fichiers.
 *  1. depuis une photo (visionneuse), plusieurs photos, ou 👤 Visages : on choisit les visages (ceux qu'a repérés la
 *     reconnaissance des visages, lib/faces.php, et ceux qu'on trace à la main) et les noms à proposer (jamais une fiche
 *     confidentielle ; jamais un vivant sans la case « Proposer aussi des vivants ») ;
 *  2. « ⤓ Télécharger le fichier » fabrique un seul .html autonome (hors ligne, CSP stricte, aucun script ni image de
 *     l'extérieur) qui ne contient QUE : les photos choisies, la place des visages, les noms proposés (texte, sans numéro de
 *     fiche) et le titre / mot d'accueil ;
 *  3. le cousin clique sur un visage, écrit un nom ou le choisit dans la liste, ajoute une note, puis « ⤓ Enregistrer mes
 *     réponses » → un petit .json (identifiant + somme de contrôle de la version envoyée) ;
 *  4. « ⤒ Importer les réponses » (UI.openImportDialog, K13) : lecture stricte (taille, champs, types, pas de HTML), une
 *     proposition par visage avec qui a répondu, la fiche à relier par le menu de choix (« c'est la même personne ? »),
 *     accepter / refuser ; accepté = une identification ordinaire (media_tags, et l'empreinte du visage reliée) ; ↶ Annuler.
 *     Plusieurs cousins : toutes les réponses sont gardées et comparées (accord / désaccord).
 *
 * Table photo_asks (structure n°81, lib/migrations.php).
 * GET  api.php?action=pa_list | pa_get&id= | pa_faces&ids=1,2
 * POST api.php?action=pa_write {op: save | delete | restore | render | analyze | import | undo_import}
 */

require_once __DIR__ . '/questions_proches.php'; // qp_clean, qp_photo_data, qp_h, qp_hn, qp_uid, qp_date_fr, qp_json

const PA_FORMAT = 'lcnda-visages';
const PA_REPLY_FORMAT = 'lcnda-visages-reponses';
const PA_MAX_PHOTOS = 12;
const PA_MAX_FACES = 80;
const PA_MAX_NAMES = 200;
const PA_MAX_FILE = 300 * 1024;
const PA_STATUSES = ['prepared' => 'Préparé', 'sent' => 'Envoyé', 'answered' => 'Répondu'];

function photo_ask_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_asks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL DEFAULT '',
        intro TEXT NOT NULL DEFAULT '',
        media_json TEXT NOT NULL DEFAULT '[]',
        faces_json TEXT NOT NULL DEFAULT '[]',
        names_json TEXT NOT NULL DEFAULT '[]',
        include_living INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'prepared',
        sent_at TEXT NOT NULL DEFAULT '',
        checksums_json TEXT NOT NULL DEFAULT '[]',
        replies_json TEXT NOT NULL DEFAULT '[]',
        imports_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}

function pa_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    photo_ask_schema($pdo); // une base qui n'a pas encore la migration (tests sur une vieille copie) : sans danger, IF NOT EXISTS
    if (function_exists('faces_ensure')) { faces_ensure($pdo); }
    $done = true;
}

/** Les personnes : nom, années, vivante ?, confidentielle ? (un vivant = « vivant » sur la fiche, ou sans décès et né il y a moins de 100 ans ou à une date inconnue). */
function pa_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 500) as $chunk) {
        $s = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, p.gender, COALESCE(p.living_status,'') AS living_status, COALESCE(p.is_private,0) AS is_private, COALESCE(p.kind,'human') AS kind,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.year IS NOT NULL ORDER BY t.gedcom_tag='BIRT' DESC, e.id LIMIT 1) AS byr,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI','CREM') ORDER BY t.gedcom_tag='DEAT' DESC, e.id LIMIT 1) AS dyr,
            (SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI','CREM')) AS dead
            FROM persons p WHERE p.id IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')');
        $s->execute($chunk);
        $now = (int) date('Y');
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $by = $r['byr'] !== null ? (int) $r['byr'] : null;
            $dead = (int) $r['dead'] > 0 || $r['living_status'] === 'deceased';
            $living = $r['living_status'] === 'living' || (!$dead && ($by === null || $by >= $now - 100));
            $name = trim(trim((string) $r['first_name']) . ' ' . trim((string) $r['last_name'])) ?: 'Sans nom';
            $years = ($by || $r['dyr']) ? ' (' . ($by ?: '?') . '–' . ($r['dyr'] ?: ($living ? '' : '?')) . ')' : '';
            $out[(int) $r['id']] = ['id' => (int) $r['id'], 'name' => $name, 'label' => $name . $years, 'gender' => (string) $r['gender'],
                'living' => $living, 'private' => (int) $r['is_private'] === 1, 'animal' => $r['kind'] === 'animal', 'birth_year' => $by, 'death_year' => $r['dyr'] !== null ? (int) $r['dyr'] : null];
        }
    }
    return $out;
}

/** Les photos (images seulement) avec leurs visages : repérés (face_prints) et déjà identifiés (media_tags), et les personnes qui y sont reliées. */
function pa_faces(PDO $pdo, array $ids): array
{
    pa_ready($pdo);
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0))), 0, PA_MAX_PHOTOS);
    if (!$ids) { return ['photos' => [], 'people' => []]; }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $s = $pdo->prepare("SELECT id, title, filename, COALESCE(thumbnail,'') AS thumbnail, COALESCE(date_text,'') AS date_text, COALESCE(media_type,'') AS media_type FROM media WHERE id IN ($in)");
    $s->execute($ids);
    $photos = []; $pids = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $m) {
        if (!preg_match('/\.(jpe?g|png|gif|webp)$/i', (string) $m['filename'])) { continue; }
        $photos[(int) $m['id']] = ['id' => (int) $m['id'], 'title' => (string) $m['title'], 'filename' => (string) $m['filename'], 'thumbnail' => (string) $m['thumbnail'], 'date_text' => (string) $m['date_text'], 'faces' => [], 'linked' => []];
    }
    if (!$photos) { return ['photos' => [], 'people' => []]; }
    $in = implode(',', array_fill(0, count($photos), '?'));
    $keys = array_keys($photos);
    $t = $pdo->prepare("SELECT id, media_id, person_id, x, y, w, h FROM media_tags WHERE media_id IN ($in) AND COALESCE(tag_type,'person')='person'");
    $t->execute($keys);
    $tags = [];
    foreach ($t->fetchAll(PDO::FETCH_ASSOC) as $r) { $tags[(int) $r['id']] = $r; $pids[] = (int) $r['person_id']; }
    $f = $pdo->prepare("SELECT id, media_id, x, y, w, h, tag_id, status FROM face_prints WHERE media_id IN ($in) ORDER BY media_id, x");
    $f->execute($keys);
    $usedTags = [];
    foreach ($f->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $tag = $r['tag_id'] !== null ? ($tags[(int) $r['tag_id']] ?? null) : null;
        if ($tag) { $usedTags[(int) $tag['id']] = true; }
        $photos[(int) $r['media_id']]['faces'][] = ['print_id' => (int) $r['id'], 'tag_id' => $tag ? (int) $tag['id'] : 0, 'person_id' => $tag ? (int) $tag['person_id'] : 0,
            'x' => round((float) $r['x'], 2), 'y' => round((float) $r['y'], 2), 'w' => round((float) $r['w'], 2), 'h' => round((float) $r['h'], 2), 'ignored' => $r['status'] === 'ignored'];
    }
    foreach ($tags as $tid => $tag) {
        if (isset($usedTags[$tid])) { continue; }
        $photos[(int) $tag['media_id']]['faces'][] = ['print_id' => 0, 'tag_id' => $tid, 'person_id' => (int) $tag['person_id'],
            'x' => round((float) $tag['x'], 2), 'y' => round((float) $tag['y'], 2), 'w' => round((float) $tag['w'], 2), 'h' => round((float) $tag['h'], 2), 'ignored' => false];
    }
    $l = $pdo->prepare("SELECT ml.media_id, CASE WHEN ml.entity_type='person' THEN ml.entity_id ELSE e.person_id END AS pid
        FROM media_links ml LEFT JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id WHERE ml.media_id IN ($in) AND ml.entity_type IN ('person','event')");
    $l->execute($keys);
    foreach ($l->fetchAll(PDO::FETCH_ASSOC) as $r) { if ($r['pid'] !== null) { $photos[(int) $r['media_id']]['linked'][] = (int) $r['pid']; $pids[] = (int) $r['pid']; } }
    $people = pa_people($pdo, $pids);
    foreach ($photos as &$p) {
        $p['linked'] = array_values(array_unique(array_filter($p['linked'], static fn($id) => isset($people[$id]))));
        foreach ($p['faces'] as &$fc) { $fc['person'] = $fc['person_id'] && isset($people[$fc['person_id']]) ? $people[$fc['person_id']] : null; }
        unset($fc);
    }
    unset($p);
    return ['photos' => array_values(array_map(static fn($id) => $photos[$id], array_values(array_filter($ids, static fn($id) => isset($photos[$id]))))), 'people' => array_values($people)];
}

function pa_row(PDO $pdo, int $id): array
{
    pa_ready($pdo);
    $s = $pdo->prepare('SELECT * FROM photo_asks WHERE id=?');
    $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Demande introuvable.'); }
    return $row;
}

/** Un cadre de visage en % de l'image, remis dans les bornes. */
function pa_box(array $f): array
{
    $x = max(0.0, min(99.0, (float) ($f['x'] ?? 0))); $y = max(0.0, min(99.0, (float) ($f['y'] ?? 0)));
    $w = max(0.5, min(100.0 - $x, (float) ($f['w'] ?? 0))); $h = max(0.5, min(100.0 - $y, (float) ($f['h'] ?? 0)));
    return ['x' => round($x, 2), 'y' => round($y, 2), 'w' => round($w, 2), 'h' => round($h, 2)];
}

/** Ce que la page envoie, remis d'aplomb : photos qui existent, visages dans les bornes, noms autorisés (jamais confidentiels, vivants seulement si coché). */
function pa_input(PDO $pdo, array $data): array
{
    $title = qp_clean($data['title'] ?? '', 200, false, 'titre');
    if ($title === '') { throw new RuntimeException('Donne un titre à la demande.'); }
    $intro = qp_clean($data['intro'] ?? '', 3000, true, 'mot d’accueil');
    $mediaIds = is_array($data['media_ids'] ?? null) ? array_values(array_unique(array_map('intval', $data['media_ids']))) : [];
    if (count($mediaIds) > PA_MAX_PHOTOS) { throw new RuntimeException(PA_MAX_PHOTOS . ' photos au plus dans une demande.'); }
    $known = pa_faces($pdo, $mediaIds);
    $photoIds = array_column($known['photos'], 'id');
    if (!$photoIds) { throw new RuntimeException('Choisis au moins une photo (une image JPEG, PNG, GIF ou WebP).'); }
    $faces = [];
    $list = is_array($data['faces'] ?? null) ? $data['faces'] : [];
    if (count($list) > PA_MAX_FACES) { throw new RuntimeException(PA_MAX_FACES . ' visages au plus dans une demande.'); }
    $prints = []; $tagIds = [];
    foreach ($known['photos'] as $p) { foreach ($p['faces'] as $fc) { if ($fc['print_id']) { $prints[$fc['print_id']] = $p['id']; } if ($fc['tag_id']) { $tagIds[$fc['tag_id']] = $p['id']; } } }
    $n = 0;
    foreach (array_values($list) as $f) {
        if (!is_array($f)) { throw new LcndaBadInput('Visage incorrect.'); }
        $mid = safe_int($f['media_id'] ?? 0);
        if (!in_array($mid, $photoIds, true)) { continue; }
        $print = safe_int($f['print_id'] ?? 0); $tag = safe_int($f['tag_id'] ?? 0);
        if ($print && ($prints[$print] ?? 0) !== $mid) { $print = 0; }
        if ($tag && ($tagIds[$tag] ?? 0) !== $mid) { $tag = 0; }
        $faces[] = ['k' => 'f' . (++$n), 'media_id' => $mid, 'print_id' => $print, 'tag_id' => $tag] + pa_box($f);
    }
    if (!$faces) { throw new RuntimeException('Choisis au moins un visage à faire reconnaître (ou trace-le sur la photo).'); }
    $living = !empty($data['include_living']);
    $nameIds = is_array($data['names'] ?? null) ? array_slice(array_values(array_unique(array_map('intval', $data['names']))), 0, PA_MAX_NAMES) : [];
    $people = pa_people($pdo, $nameIds);
    $names = []; $k = 0; $dropped = ['living' => 0, 'private' => 0];
    foreach ($nameIds as $pid) {
        $p = $people[$pid] ?? null;
        if (!$p || $p['animal']) { continue; }
        if ($p['private']) { $dropped['private']++; continue; }
        if ($p['living'] && !$living) { $dropped['living']++; continue; }
        $names[] = ['k' => 'n' . (++$k), 'person_id' => $pid, 'label' => $p['label']];
    }
    return ['title' => $title, 'intro' => $intro, 'media' => array_values(array_intersect($mediaIds, $photoIds)), 'faces' => $faces, 'names' => $names, 'include_living' => $living ? 1 : 0, 'dropped' => $dropped];
}

function pa_out(PDO $pdo, array $row, bool $full = true): array
{
    $media = qp_json($row['media_json']); $faces = qp_json($row['faces_json']); $names = qp_json($row['names_json']); $replies = qp_json($row['replies_json']);
    $out = ['id' => (int) $row['id'], 'uid' => (string) $row['uid'], 'title' => (string) $row['title'], 'intro' => (string) $row['intro'], 'status' => (string) $row['status'],
        'status_label' => PA_STATUSES[$row['status']] ?? 'Préparé', 'sent_at' => (string) $row['sent_at'], 'include_living' => (int) $row['include_living'] === 1,
        'photo_count' => count($media), 'face_count' => count($faces), 'name_count' => count($names), 'reply_count' => count($replies),
        'replies_from' => array_values(array_unique(array_map(static fn($r) => (string) ($r['from'] ?? ''), $replies))),
        'created_at' => (string) $row['created_at'], 'updated_at' => (string) $row['updated_at'], 'can_undo_import' => (bool) qp_json($row['imports_json'])];
    $first = $media ? (int) $media[0] : 0;
    if ($first) { $s = $pdo->prepare("SELECT filename, COALESCE(thumbnail,'') AS thumbnail, title FROM media WHERE id=?"); $s->execute([$first]); $m = $s->fetch(PDO::FETCH_ASSOC); $out['thumb'] = $m ? ($m['thumbnail'] ?: $m['filename']) : ''; }
    if ($full) {
        $out['media_ids'] = array_map('intval', $media);
        $out['faces'] = $faces;
        $people = pa_people($pdo, array_column($names, 'person_id'));
        $out['names'] = array_map(static fn($n) => $n + ['person' => $people[(int) $n['person_id']] ?? null], $names);
        $out['replies'] = array_map(static fn($r) => ['rid' => $r['rid'] ?? '', 'from' => $r['from'] ?? '', 'date' => $r['date'] ?? '', 'count' => count($r['answers'] ?? [])], $replies);
    }
    return $out;
}

function pa_list(PDO $pdo): array
{
    pa_ready($pdo);
    $rows = $pdo->query('SELECT * FROM photo_asks ORDER BY updated_at DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC);
    return ['asks' => array_map(static fn($r) => pa_out($pdo, $r, false), $rows), 'statuses' => PA_STATUSES];
}

function pa_save(PDO $pdo, array $data): array
{
    pa_ready($pdo);
    $id = safe_int($data['id'] ?? 0);
    $v = pa_input($pdo, $data);
    $vals = [$v['title'], $v['intro'], json_encode($v['media']), json_encode($v['faces'], JSON_UNESCAPED_UNICODE), json_encode($v['names'], JSON_UNESCAPED_UNICODE), $v['include_living']];
    if ($id) {
        $before = pa_row($pdo, $id);
        $pdo->prepare('UPDATE photo_asks SET title=?, intro=?, media_json=?, faces_json=?, names_json=?, include_living=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'photo_ask', $id, 'update', 'Demande « Qui est sur cette photo ? » modifiée : ' . $v['title'], ['title' => $before['title']], ['title' => $v['title']]);
    } else {
        $pdo->prepare("INSERT INTO photo_asks(title, intro, media_json, faces_json, names_json, include_living, uid, status) VALUES(?,?,?,?,?,?,?,'prepared')")->execute([...$vals, qp_uid()]);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'photo_ask', $id, 'create', 'Demande « Qui est sur cette photo ? » préparée : ' . $v['title']);
    }
    return ['ok' => true, 'ask' => pa_out($pdo, pa_row($pdo, $id)), 'dropped' => $v['dropped']];
}

function pa_delete(PDO $pdo, array $data): array
{
    $row = pa_row($pdo, safe_int($data['id'] ?? 0));
    $pdo->prepare('DELETE FROM photo_asks WHERE id=?')->execute([(int) $row['id']]);
    log_change($pdo, 'photo_ask', (int) $row['id'], 'delete', 'Demande « Qui est sur cette photo ? » supprimée : ' . $row['title'], $row, null);
    return ['ok' => true, 'deleted' => (int) $row['id']];
}

/** ↶ Annuler une suppression : relue dans le journal, pas dans ce qu'envoie la page. */
function pa_restore(PDO $pdo, array $data): array
{
    pa_ready($pdo);
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare("SELECT before_json FROM change_log WHERE entity_type='photo_ask' AND entity_id=? AND action='delete' ORDER BY id DESC LIMIT 1");
    $s->execute([$id]);
    $row = qp_json((string) $s->fetchColumn());
    if (!$row || (int) ($row['id'] ?? 0) !== $id) { throw new RuntimeException('Rien à remettre.'); }
    $c = $pdo->prepare('SELECT count(*) FROM photo_asks WHERE id=? OR uid=?'); $c->execute([$id, (string) $row['uid']]);
    if ((int) $c->fetchColumn()) { return ['ok' => true, 'restored' => $id]; }
    $cols = ['id', 'uid', 'title', 'intro', 'media_json', 'faces_json', 'names_json', 'include_living', 'status', 'sent_at', 'checksums_json', 'replies_json', 'imports_json', 'created_at', 'updated_at'];
    $pdo->prepare('INSERT INTO photo_asks(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_map(static fn($c) => $row[$c] ?? null, $cols));
    log_change($pdo, 'photo_ask', $id, 'create', 'Demande remise : ' . $row['title']);
    return ['ok' => true, 'restored' => $id];
}

/** Somme de contrôle de la version envoyée : identifiant, titre, visages, noms proposés. */
function pa_checksum(array $row): string
{
    $faces = array_map(static fn($f) => [$f['k'], $f['media_id'], $f['x'], $f['y'], $f['w'], $f['h']], qp_json($row['faces_json']));
    $names = array_map(static fn($n) => [$n['k'], $n['label']], qp_json($row['names_json']));
    return substr(hash('sha256', (string) json_encode(['uid' => (string) $row['uid'], 'title' => (string) $row['title'], 'faces' => $faces, 'names' => $names], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)), 0, 32);
}

/** Le fichier .html envoyé au cousin. $mode : file (à envoyer) ou preview (aperçu dans l'app : boutons inactifs). */
function pa_html(PDO $pdo, array $row, string $mode = 'file'): array
{
    $faces = qp_json($row['faces_json']); $names = qp_json($row['names_json']); $media = array_map('intval', qp_json($row['media_json']));
    $checksum = pa_checksum($row);
    $photos = []; $missing = 0; $blocks = ''; $pn = 0;
    $m = $media ? $pdo->query('SELECT id, title, filename, date_text FROM media WHERE id IN (' . implode(',', $media) . ')')->fetchAll(PDO::FETCH_ASSOC) : [];
    $byId = []; foreach ($m as $x) { $byId[(int) $x['id']] = $x; }
    $num = 0; $faceNum = [];
    foreach ($media as $mid) {
        $mm = $byId[$mid] ?? null; if (!$mm) { continue; }
        $mine = array_values(array_filter($faces, static fn($f) => (int) $f['media_id'] === $mid));
        if (!$mine) { continue; }
        $pn++;
        $data = qp_photo_data($mm);
        if (!$data) { $missing++; }
        $boxes = ''; $cards = '';
        foreach ($mine as $f) {
            $num++; $faceNum[$f['k']] = $num; $k = qp_h((string) $f['k']);
            $boxes .= '<button type="button" class="pa-box" data-face="' . $k . '" style="left:' . (float) $f['x'] . '%;top:' . (float) $f['y'] . '%;width:' . (float) $f['w'] . '%;height:' . (float) $f['h'] . '%" aria-label="Visage ' . $num . '"><span>' . $num . '</span></button>';
            $cards .= '<div class="pa-card" id="c-' . $k . '" data-card="' . $k . '"><h3><span class="pa-n">' . $num . '</span>Visage ' . $num . '</h3>'
                . '<label for="n-' . $k . '">Qui est-ce ?</label><input id="n-' . $k . '" type="text" list="pa-names" maxlength="120" autocomplete="off" data-name="' . $k . '" placeholder="Écris un nom, ou choisis dans la liste">'
                . '<label for="o-' . $k . '">Une note (facultatif)</label><textarea id="o-' . $k . '" rows="2" maxlength="1000" data-note="' . $k . '" placeholder="Ex. : c’est à son mariage, vers 1925"></textarea></div>';
        }
        $title = trim((string) $mm['title']);
        $cap = $title !== '' && !preg_match('/\.(jpe?g|png|gif|webp)$/i', $title) ? $title : 'Photo ' . $pn;
        $img = $data ? '<img src="' . qp_h($data) . '" alt="' . qp_h($cap) . '">' : '<p class="pa-noph">(Cette photo n’a pas pu être jointe : demande-la-moi.)</p>';
        $blocks .= '<section class="pa-photo"><h2>' . qp_h($cap) . ($mm['date_text'] ? ' <small>' . qp_h((string) $mm['date_text']) . '</small>' : '') . '</h2>'
            . '<div class="pa-fig"><div class="pa-wrap">' . $img . $boxes . '</div></div><div class="pa-cards">' . $cards . '</div></section>';
        $photos[] = $mid;
    }
    $list = '<datalist id="pa-names">' . implode('', array_map(static fn($n) => '<option value="' . qp_h((string) $n['label']) . '"></option>', $names)) . '</datalist>';
    $json = json_encode(['format' => PA_FORMAT, 'ask' => (string) $row['uid'], 'checksum' => $checksum, 'title' => (string) $row['title'],
        'faces' => array_map(static fn($f) => (string) $f['k'], $faces), 'names' => array_map(static fn($n) => ['k' => (string) $n['k'], 'label' => (string) $n['label']], $names)],
        JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    $preview = $mode === 'preview';
    $intro = trim((string) $row['intro']) !== '' ? '<div class="pa-intro">' . qp_hn((string) $row['intro']) . '</div>' : '';
    $howto = '<div class="pa-how"><b>Comment faire :</b><ol><li>Clique sur un visage (le cadre numéroté) sur la photo.</li><li>Écris le nom de la personne, ou choisis-le dans la liste qui s’ouvre. Tu peux ajouter une note. Si tu ne sais pas, laisse vide.</li><li>Tout est gardé sur cet ordinateur au fur et à mesure.</li><li>Quand tu as fini, clique sur <b>« ⤓ Enregistrer mes réponses »</b> et envoie-moi le fichier téléchargé, en pièce jointe d’un e-mail.</li></ol></div>';
    $html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'; connect-src \'none\'">'
        . '<meta name="referrer" content="no-referrer"><title>' . qp_h((string) $row['title']) . '</title><style>' . pa_css() . '</style></head><body class="pa-' . ($preview ? 'preview' : 'file') . '">'
        . ($preview ? '<p class="pa-banner">Aperçu : c’est ce que verra ton cousin. Les boutons marchent dans le vrai fichier.</p>' : '')
        . '<main class="pa"><header><p class="pa-hello">Bonjour,</p><h1>' . qp_h((string) $row['title']) . '</h1>' . $intro . $howto . '</header>'
        . '<form id="pa-form" autocomplete="off">' . $blocks . $list
        . '<div class="pa-me"><label for="pa-from">Ton nom</label><input id="pa-from" type="text" maxlength="120" autocomplete="name" placeholder="Pour que je sache qui a répondu"></div>'
        . '<div class="pa-bar"><button type="button" class="pa-btn pa-main" id="pa-save">⤓ Enregistrer mes réponses</button><span id="pa-state" class="pa-state" role="status" aria-live="polite"></span></div></form>'
        . '<footer class="pa-foot">Merci beaucoup !</footer></main><script id="pa-data" type="application/json">' . $json . '</script><script>' . pa_js($preview) . '</script></body></html>';
    $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower(function_exists('ascii_fold') ? ascii_fold((string) $row['title']) : (string) $row['title'])), '-') ?: 'photos';
    return ['html' => $html, 'checksum' => $checksum, 'filename' => 'qui-est-sur-la-photo-' . substr($slug, 0, 50) . '.html', 'photos' => count($photos), 'missing_photos' => $missing, 'faces' => $num];
}

function pa_css(): string
{
    return <<<'CSS'
:root{color-scheme:light dark;--ink:#1d1d1f;--paper:#fdfcf8;--card:#fff;--line:#cfcac0;--muted:#5f5b55;--blue:#0a5bd8;--btn:#0a5bd8;--soft:#e8f0ff;--ok:#1f7a3a;--hit:#ffcc00}
@media (prefers-color-scheme:dark){:root{--ink:#f2f0ec;--paper:#1b1a18;--card:#262522;--line:#57534c;--muted:#bdb7ad;--blue:#6aa8ff;--btn:#2563c9;--soft:#1d2a40;--ok:#6fd08c}}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;background:var(--paper);color:var(--ink);font:19px/1.55 Georgia,"Times New Roman",serif}
.pa{max-width:1000px;margin:0 auto;padding:26px 16px 60px}h1{font:700 1.8rem/1.2 Arial,Helvetica,sans-serif;margin:.2rem 0 1rem}.pa-hello{font-size:1.25rem;margin:0}
.pa-intro{margin:0 0 1rem}.pa-how{background:var(--soft);border:2px solid var(--blue);border-radius:12px;padding:12px 18px;margin:0 0 1.5rem;font-size:1rem}.pa-how ol{margin:.4rem 0 0;padding-left:1.3rem}
.pa-photo{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:16px;margin:0 0 1.5rem}.pa-photo h2{font:700 1.2rem Arial,Helvetica,sans-serif;margin:0 0 .7rem}.pa-photo h2 small{font-weight:400;color:var(--muted)}
.pa-fig{text-align:center}.pa-wrap{position:relative;display:inline-block;max-width:100%}.pa-wrap img{display:block;max-width:100%;max-height:75vh;border-radius:6px}
.pa-box{position:absolute;padding:0;border:3px solid var(--hit);border-radius:6px;background:transparent;cursor:pointer;box-shadow:0 0 0 1px #000}.pa-box span{position:absolute;left:-3px;top:-1.7em;min-width:1.6em;padding:0 .3em;border-radius:6px;background:var(--hit);color:#000;font:700 .85rem/1.5 Arial,sans-serif}
.pa-box.is-done{border-color:#2fbf5b}.pa-box.is-done span{background:#2fbf5b;color:#fff}.pa-box.is-on{outline:4px solid var(--blue);outline-offset:2px}
.pa-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:14px}.pa-card{border:2px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--paper)}
.pa-card.is-on{border-color:var(--blue);box-shadow:0 0 0 3px var(--soft)}.pa-card h3{display:flex;gap:.5rem;align-items:center;margin:0 0 .4rem;font:700 1.05rem Arial,sans-serif}
.pa-n{display:inline-grid;place-items:center;width:1.8rem;height:1.8rem;border-radius:50%;background:var(--btn);color:#fff;font-size:.95rem}
label{display:block;font:600 .95rem Arial,sans-serif;margin:.4rem 0 .2rem}input,textarea{width:100%;font:inherit;font-size:1.05rem;color:var(--ink);background:var(--card);border:2px solid var(--line);border-radius:10px;padding:10px 12px}
textarea{resize:vertical}input:focus,textarea:focus,button:focus-visible{outline:3px solid var(--blue);outline-offset:2px}.pa-me{margin:1rem 0}
.pa-bar{position:sticky;bottom:0;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 0;background:var(--paper)}
.pa-btn{font:700 1.15rem Arial,sans-serif;min-height:58px;padding:0 24px;border-radius:12px;border:2px solid var(--ink);background:var(--card);color:var(--ink);cursor:pointer}.pa-main{background:var(--btn);border-color:var(--btn);color:#fff}
.pa-state{font:1rem Arial,sans-serif;color:var(--ok)}.pa-state.is-warn{color:#b26b00}.pa-foot{margin-top:2rem;text-align:center;color:var(--muted)}.pa-noph{color:var(--muted);font-style:italic}
.pa-banner{margin:0;padding:10px 16px;background:#fff6d6;color:#5a4300;font:600 16px Arial,sans-serif;text-align:center;border-bottom:2px solid #e8c547}
@media (max-width:560px){body{font-size:17px}.pa{padding:16px 10px 40px}h1{font-size:1.45rem}.pa-btn{flex:1 1 100%}}
CSS;
}

/** Le script du fichier envoyé : aucune ressource extérieure, tout texte posé par value / textContent. */
function pa_js(bool $preview): string
{
    $pv = $preview ? 'true' : 'false';
    return <<<JS
(function(){'use strict';var PREVIEW={$pv};var D;try{D=JSON.parse(document.getElementById('pa-data').textContent);}catch(e){return;}
var KEY='lcnda-pa-'+D.ask,form=document.getElementById('pa-form'),state=document.getElementById('pa-state'),from=document.getElementById('pa-from');
var LABELS={};D.names.forEach(function(n){LABELS[n.label]=n.k;});
function store(){try{return window.localStorage;}catch(e){return null;}}
function say(t,warn){state.textContent=t;state.className='pa-state'+(warn?' is-warn':'');}
function q(sel){return [].slice.call(form.querySelectorAll(sel));}
function mark(){q('[data-name]').forEach(function(i){var k=i.getAttribute('data-name');var b=form.querySelector('.pa-box[data-face="'+k+'"]');if(b)b.classList.toggle('is-done',!!i.value.trim());});}
function collect(){var o={from:from.value,a:{}};q('[data-name]').forEach(function(i){var k=i.getAttribute('data-name');var n=form.querySelector('[data-note="'+k+'"]');o.a[k]={name:i.value,note:n?n.value:''};});return o;}
function load(){var s=store();if(!s)return;try{var o=JSON.parse(s.getItem(KEY)||'null');if(!o||typeof o!=='object')return;if(typeof o.from==='string')from.value=o.from.slice(0,120);
q('[data-name]').forEach(function(i){var k=i.getAttribute('data-name');var v=o.a&&o.a[k];if(!v||typeof v!=='object')return;if(typeof v.name==='string')i.value=v.name.slice(0,120);var n=form.querySelector('[data-note="'+k+'"]');if(n&&typeof v.note==='string')n.value=v.note.slice(0,1000);});
mark();say('✓ Tes réponses d’avant sont revenues.');}catch(e){}}
var t=0;function keep(){mark();clearTimeout(t);t=setTimeout(function(){var s=store();if(!s){say('⚠️ Ce navigateur ne garde pas les réponses : enregistre-les avant de fermer.',true);return;}
try{s.setItem(KEY,JSON.stringify(collect()));var d=new Date();say('✓ Gardé sur cet ordinateur à '+d.getHours()+' h '+String(d.getMinutes()).padStart(2,'0'));}catch(e){say('⚠️ Impossible de garder les réponses ici : enregistre-les avant de fermer.',true);}},400);}
function focusFace(k){q('.pa-box').forEach(function(b){b.classList.toggle('is-on',b.getAttribute('data-face')===k);});q('.pa-card').forEach(function(c){c.classList.toggle('is-on',c.getAttribute('data-card')===k);});
var i=form.querySelector('[data-name="'+k+'"]');if(i){i.focus();i.scrollIntoView({block:'center',behavior:'smooth'});}}
form.addEventListener('click',function(e){var b=e.target.closest('.pa-box');if(b){e.preventDefault();focusFace(b.getAttribute('data-face'));}});
form.addEventListener('focusin',function(e){var c=e.target.closest('.pa-card');if(c){var k=c.getAttribute('data-card');q('.pa-box').forEach(function(b){b.classList.toggle('is-on',b.getAttribute('data-face')===k);});q('.pa-card').forEach(function(x){x.classList.toggle('is-on',x===c);});}});
function fnv(str){var h=0x811c9dc5;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0;}return ('0000000'+h.toString(16)).slice(-8);}
function clean(s,max){return String(s||'').replace(/[<>]/g,'').replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/g,'').trim().slice(0,max);}
function save(){if(PREVIEW){say('Aperçu : dans le vrai fichier, ce bouton télécharge les réponses.');return;}
var answers=[];q('[data-name]').forEach(function(i){var k=i.getAttribute('data-name');var n=form.querySelector('[data-note="'+k+'"]');var name=clean(i.value,120),note=clean(n?n.value:'',1000);
if(!name&&!note)return;answers.push({face:k,name:name,pick:LABELS[name]||'',note:note});});
if(!answers.length){say('⚠️ Écris au moins un nom (ou une note) avant d’enregistrer.',true);return;}
var out={format:'lcnda-visages-reponses',version:1,ask:D.ask,checksum:D.checksum,title:D.title,from:clean(from.value,120),saved_at:new Date().toISOString(),answers:answers};out.sum=fnv(JSON.stringify(answers));
var blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='reponses-visages.json';document.body.appendChild(a);a.click();
setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);say('✓ Fichier « reponses-visages.json » enregistré : envoie-le-moi en pièce jointe d’un e-mail. Merci !');}
form.addEventListener('input',keep);form.addEventListener('submit',function(e){e.preventDefault();});document.getElementById('pa-save').addEventListener('click',save);load();mark();})();
JS;
}

function pa_render(PDO $pdo, array $data): array
{
    $row = pa_row($pdo, safe_int($data['id'] ?? 0));
    $mode = ($data['mode'] ?? 'file') === 'preview' ? 'preview' : 'file';
    $r = pa_html($pdo, $row, $mode);
    if ($mode === 'file') {
        $sums = qp_json($row['checksums_json']);
        if (!in_array($r['checksum'], $sums, true)) { $sums[] = $r['checksum']; $sums = array_slice($sums, -30); }
        $pdo->prepare("UPDATE photo_asks SET checksums_json=?, status=CASE WHEN status='prepared' THEN 'sent' ELSE status END, sent_at=CASE WHEN sent_at='' THEN ? ELSE sent_at END, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([json_encode($sums), date('Y-m-d'), (int) $row['id']]);
    }
    return ['ok' => true] + $r;
}

/* ─── Le retour des réponses ─────────────────────────────────────────────── */

function pa_fold(string $s): string
{
    return trim((string) preg_replace('/\s+/', ' ', mb_strtolower(function_exists('ascii_fold') ? ascii_fold($s) : $s)));
}

/** Un texte venu du fichier : pas de HTML (refusé), caractères de contrôle retirés, borné. */
function pa_text(mixed $v, int $max, string $what): string
{
    if ($v === null) { return ''; }
    if (!is_string($v)) { throw new LcndaBadInput('Fichier de réponses refusé : « ' . $what . ' » doit être un texte.'); }
    if (preg_match('/<\s*[a-z!\/?]|[<>]/i', $v)) { throw new RuntimeException('Fichier de réponses refusé : il contient du HTML (« ' . $what . ' »).'); }
    return qp_clean($v, $max, $what === 'note', $what);
}

/** Lit strictement un fichier de réponses. */
function pa_read(PDO $pdo, array $data): array
{
    pa_ready($pdo);
    $raw = $data['file'] ?? null;
    if (!is_string($raw)) { throw new LcndaBadInput('Fichier de réponses manquant.'); }
    if (strlen($raw) > PA_MAX_FILE) { throw new RuntimeException('Ce fichier est trop gros pour un fichier de réponses (' . (int) (PA_MAX_FILE / 1024) . ' Ko au plus).'); }
    $raw = (string) preg_replace('/^\xEF\xBB\xBF/', '', $raw);
    try { $j = json_decode($raw, true, 6, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING); }
    catch (JsonException) { throw new RuntimeException('Ce fichier n’est pas un fichier de réponses (il est illisible).'); }
    if (!is_array($j) || array_is_list($j) || ($j['format'] ?? null) !== PA_REPLY_FORMAT) { throw new RuntimeException('Ce fichier n’est pas un fichier de réponses de « Qui est sur cette photo ? ».'); }
    if ($extra = array_diff(array_keys($j), ['format', 'version', 'ask', 'checksum', 'title', 'from', 'saved_at', 'answers', 'sum'])) {
        throw new RuntimeException('Fichier de réponses refusé : il contient des données inattendues (« ' . qp_clean((string) reset($extra), 40, false) . ' »).');
    }
    if (($j['version'] ?? null) !== 1) { throw new RuntimeException('Version de fichier de réponses inconnue.'); }
    foreach (['ask', 'checksum'] as $k) { if (!is_string($j[$k] ?? null) || !preg_match('/^[a-f0-9]{32}$/', $j[$k])) { throw new RuntimeException('Fichier de réponses refusé : identifiant incorrect.'); } }
    $s = $pdo->prepare('SELECT * FROM photo_asks WHERE uid=?'); $s->execute([$j['ask']]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Ce fichier répond à une demande qui n’est pas dans cette généalogie.'); }
    if (!in_array($j['checksum'], qp_json($row['checksums_json']), true)) { throw new RuntimeException('Fichier de réponses refusé : il ne correspond à aucune version envoyée de cette demande (somme de contrôle).'); }
    foreach (['title', 'saved_at', 'sum'] as $k) { if (isset($j[$k]) && !is_string($j[$k])) { throw new LcndaBadInput('Fichier de réponses refusé : « ' . $k . ' » doit être un texte.'); } }
    $from = pa_text($j['from'] ?? '', 120, 'nom');
    $date = preg_match('/^(\d{4})-(\d{2})-(\d{2})/', (string) ($j['saved_at'] ?? ''), $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1]) && "$m[1]-$m[2]-$m[3]" <= date('Y-m-d', time() + 86400) ? "$m[1]-$m[2]-$m[3]" : date('Y-m-d');
    $list = $j['answers'] ?? null;
    if (!is_array($list) || !array_is_list($list)) { throw new RuntimeException('Fichier de réponses refusé : la liste des réponses manque.'); }
    $faces = []; foreach (qp_json($row['faces_json']) as $f) { $faces[(string) $f['k']] = $f; }
    $names = []; foreach (qp_json($row['names_json']) as $n) { $names[(string) $n['k']] = $n; }
    if (count($list) > count($faces)) { throw new RuntimeException('Fichier de réponses refusé : plus de réponses que de visages.'); }
    $answers = []; $seen = [];
    foreach ($list as $a) {
        if (!is_array($a) || array_is_list($a)) { throw new LcndaBadInput('Fichier de réponses refusé : une réponse est mal formée.'); }
        if (array_diff(array_keys($a), ['face', 'name', 'pick', 'note'])) { throw new RuntimeException('Fichier de réponses refusé : une réponse contient des données inattendues.'); }
        $k = $a['face'] ?? null;
        if (!is_string($k) || !preg_match('/^f\d{1,3}$/', $k) || !isset($faces[$k])) { throw new RuntimeException('Fichier de réponses refusé : visage inconnu.'); }
        if (isset($seen[$k])) { throw new RuntimeException('Fichier de réponses refusé : deux réponses pour le même visage.'); }
        $seen[$k] = true;
        $pick = $a['pick'] ?? '';
        if (!is_string($pick) || ($pick !== '' && (!preg_match('/^n\d{1,4}$/', $pick) || !isset($names[$pick])))) { throw new RuntimeException('Fichier de réponses refusé : nom proposé inconnu.'); }
        $name = pa_text($a['name'] ?? '', 120, 'nom');
        $note = pa_text($a['note'] ?? '', 1000, 'note');
        if ($pick !== '' && $name === '') { $name = (string) $names[$pick]['label']; }
        if ($name === '' && $note === '') { continue; }
        $answers[] = ['face' => $k, 'name' => $name, 'pick' => $pick, 'note' => $note];
    }
    $rid = substr(hash('sha256', $from . '|' . json_encode($answers, JSON_UNESCAPED_UNICODE)), 0, 16);
    return ['row' => $row, 'from' => $from, 'date' => $date, 'answers' => $answers, 'rid' => $rid, 'faces' => $faces, 'names' => $names];
}

/** Clé pour comparer deux réponses : le nom proposé choisi, sinon le nom tapé sans accents ni majuscules. */
function pa_answer_key(array $a): string
{
    return $a['pick'] !== '' ? 'n:' . $a['pick'] : ($a['name'] !== '' ? 't:' . pa_fold((string) preg_replace('/\s*\(.*\)\s*$/', '', $a['name'])) : '');
}

/** Les fiches qui pourraient être ce nom tapé (« c'est la même personne ? ») : nom et prénom, sans accents. */
function pa_candidates(PDO $pdo, string $name): array
{
    $clean = pa_fold((string) preg_replace('/\s*\(.*\)\s*$/', '', $name));
    $words = array_values(array_filter(explode(' ', $clean), static fn($w) => mb_strlen($w) >= 2));
    if (!$words) { return []; }
    $words = array_slice($words, 0, 4);
    // les accents : SQLite ne les replie pas ; on cherche large sur le dernier mot puis on filtre en PHP
    $s = $pdo->prepare("SELECT id, first_name, middle_name, last_name FROM persons WHERE COALESCE(kind,'human')<>'animal' AND lower(COALESCE(last_name,'')||' '||COALESCE(first_name,'')) LIKE ? LIMIT 400");
    $s->execute(['%' . mb_substr(end($words), 0, 3) . '%']);
    $ids = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $full = pa_fold(trim($r['first_name'] . ' ' . ($r['middle_name'] ?? '') . ' ' . $r['last_name']));
        $ok = true; foreach ($words as $w) { if (!str_contains($full, $w)) { $ok = false; break; } }
        if ($ok) { $ids[] = (int) $r['id']; }
        if (count($ids) >= 6) { break; }
    }
    return array_values(pa_people($pdo, $ids));
}

function pa_analyze(PDO $pdo, array $data): array
{
    $r = pa_read($pdo, $data);
    $row = $r['row'];
    $replies = qp_json($row['replies_json']);
    $already = in_array($r['rid'], array_column($replies, 'rid'), true);
    $names = $r['names'];
    $people = pa_people($pdo, array_column($names, 'person_id'));
    $known = pa_faces($pdo, qp_json($row['media_json']));
    $tagPerson = []; $printPerson = []; $photoTitle = [];
    foreach ($known['photos'] as $p) { $photoTitle[$p['id']] = $p['title']; foreach ($p['faces'] as $fc) { if ($fc['tag_id']) { $tagPerson[$fc['tag_id']] = $fc['person']; if ($fc['print_id']) { $printPerson[$fc['print_id']] = $fc['person']; } } } }
    $num = []; $i = 0; foreach ($r['faces'] as $k => $_) { $num[$k] = ++$i; }
    $out = [];
    foreach ($r['answers'] as $a) {
        $f = $r['faces'][$a['face']];
        $person = $a['pick'] !== '' ? ($people[(int) ($names[$a['pick']]['person_id'] ?? 0)] ?? null) : null;
        $cands = $person ? [$person] : pa_candidates($pdo, $a['name']);
        // les autres cousins, pour ce visage
        $others = [];
        foreach ($replies as $rep) {
            if (($rep['rid'] ?? '') === $r['rid']) { continue; }
            foreach (($rep['answers'] ?? []) as $o) { if (($o['face'] ?? '') === $a['face']) { $others[] = ['from' => (string) ($rep['from'] ?? ''), 'name' => (string) ($o['name'] ?? ''), 'note' => (string) ($o['note'] ?? ''), 'key' => pa_answer_key($o)]; } }
        }
        $key = pa_answer_key($a);
        $agree = array_values(array_filter($others, static fn($o) => $o['key'] !== '' && $o['key'] === $key));
        $disagree = array_values(array_filter($others, static fn($o) => $o['key'] !== '' && $o['key'] !== $key));
        $current = $f['tag_id'] ? ($tagPerson[(int) $f['tag_id']] ?? null) : ($f['print_id'] ? ($printPerson[(int) $f['print_id']] ?? null) : null);
        $out[] = ['face' => $a['face'], 'num' => $num[$a['face']] ?? 0, 'media_id' => (int) $f['media_id'], 'photo' => (string) ($photoTitle[(int) $f['media_id']] ?? ''), 'box' => pa_box($f),
            'name' => $a['name'], 'note' => $a['note'], 'picked' => $a['pick'] !== '', 'person' => $person, 'candidates' => $cands,
            'current' => $current, 'agree' => array_map(static fn($o) => ['from' => $o['from'], 'name' => $o['name'], 'note' => $o['note']], $agree),
            'disagree' => array_map(static fn($o) => ['from' => $o['from'], 'name' => $o['name'], 'note' => $o['note']], $disagree),
            'state' => $disagree ? 'disagree' : ($agree ? 'agree' : 'alone'),
            'suggest' => $current && $person && $current['id'] === $person['id'] ? 'confirm' : (count($cands) === 1 && ($person || pa_fold($cands[0]['name']) === pa_fold((string) preg_replace('/\s*\(.*\)\s*$/', '', $a['name']))) ? 'accept' : 'later')];
    }
    return ['ok' => true, 'ask' => ['id' => (int) $row['id'], 'title' => (string) $row['title']], 'from' => $r['from'], 'date' => $r['date'], 'date_label' => qp_date_fr($r['date']),
        'answers' => $out, 'already' => $already, 'replies_before' => count($replies)];
}

function pa_import(PDO $pdo, array $data): array
{
    $r = pa_read($pdo, $data);
    $row = $r['row'];
    $replies = qp_json($row['replies_json']);
    if (in_array($r['rid'], array_column($replies, 'rid'), true)) { throw new RuntimeException('Ces réponses ont déjà été importées.'); }
    if (!$r['answers']) { throw new RuntimeException('Aucune réponse à importer dans ce fichier.'); }
    $choices = is_array($data['choices'] ?? null) ? $data['choices'] : [];
    $byFace = [];
    foreach ($choices as $c) {
        if (!is_array($c) || !is_string($c['face'] ?? null)) { throw new LcndaBadInput('Choix incorrect.'); }
        $byFace[$c['face']] = $c;
    }
    $from = $r['from'] !== '' ? $r['from'] : 'Un cousin';
    // accord : un autre cousin a donné la même réponse pour ce visage → « probable », sinon « possible »
    $created = []; $updated = []; $counts = ['accept' => 0, 'refuse' => 0, 'later' => 0];
    foreach ($r['answers'] as $a) {
        $c = $byFace[$a['face']] ?? ['action' => 'later'];
        $action = in_array($c['action'] ?? '', ['accept', 'refuse', 'later'], true) ? $c['action'] : 'later';
        if ($action !== 'accept') { $counts[$action]++; continue; }
        $pid = safe_int($c['person_id'] ?? 0);
        if (!$pid || !pa_people($pdo, [$pid])) { throw new RuntimeException('Choisis la fiche de la personne pour le visage ' . substr($a['face'], 1) . ' (ou « Plus tard »).'); }
        $agree = 0;
        foreach ($replies as $rep) { foreach (($rep['answers'] ?? []) as $o) { if (($o['face'] ?? '') === $a['face'] && pa_answer_key($o) === pa_answer_key($a)) { $agree++; } } }
        $conf = $agree > 0 ? 'probable' : 'possible';
        $note = mb_substr('Selon ' . $from . ($agree ? ' (et ' . $agree . ' autre' . ($agree > 1 ? 's' : '') . ')' : '') . ', « Qui est sur cette photo ? » du ' . qp_date_fr($r['date']) . ($a['note'] !== '' ? ' : ' . $a['note'] : ''), 0, 300);
        $f = $r['faces'][$a['face']];
        $tagId = (int) ($f['tag_id'] ?? 0);
        if (!$tagId && (int) ($f['print_id'] ?? 0)) { $s = $pdo->prepare('SELECT tag_id FROM face_prints WHERE id=? AND media_id=?'); $s->execute([(int) $f['print_id'], (int) $f['media_id']]); $tagId = (int) $s->fetchColumn(); } // nommé depuis l'envoi
        $tag = null;
        if ($tagId) { $s = $pdo->prepare('SELECT * FROM media_tags WHERE id=?'); $s->execute([$tagId]); $tag = $s->fetch(PDO::FETCH_ASSOC) ?: null; }
        if ($tag) {
            update_media_tag($pdo, ['tag_id' => $tagId, 'person_id' => $pid, 'confidence' => (int) $tag['person_id'] === $pid ? ($tag['confidence'] ?: $conf) : $conf, 'note' => $note, 'tag_type' => 'person']);
            $updated[] = ['tag_id' => $tagId, 'person_id' => (int) $tag['person_id'], 'confidence' => (string) $tag['confidence'], 'note' => (string) $tag['note']];
        } else {
            $printId = (int) ($f['print_id'] ?? 0);
            $printOk = false;
            if ($printId) { $s = $pdo->prepare('SELECT tag_id FROM face_prints WHERE id=? AND media_id=?'); $s->execute([$printId, (int) $f['media_id']]); $pr = $s->fetch(PDO::FETCH_ASSOC); $printOk = $pr && $pr['tag_id'] === null; }
            if ($printOk && function_exists('face_identify')) { $res = face_identify($pdo, ['id' => $printId, 'person_id' => $pid, 'confidence' => $conf, 'note' => $note]); $newTag = (int) $res['tag_id']; }
            else { $res = save_media_tag($pdo, ['media_id' => (int) $f['media_id'], 'person_id' => $pid, 'confidence' => $conf, 'note' => $note, 'tag_type' => 'person'] + pa_box($f)); $newTag = (int) ($res['id'] ?? $pdo->query('SELECT max(id) FROM media_tags')->fetchColumn()); }
            $created[] = $newTag;
        }
        $counts['accept']++;
    }
    $replies[] = ['rid' => $r['rid'], 'from' => $from, 'date' => $r['date'], 'answers' => $r['answers']];
    $imports = qp_json($row['imports_json']);
    $imports[] = ['at' => date('c'), 'rid' => $r['rid'], 'created' => $created, 'updated' => $updated, 'prev_status' => $row['status']];
    $pdo->prepare("UPDATE photo_asks SET replies_json=?, imports_json=?, status='answered', updated_at=CURRENT_TIMESTAMP WHERE id=?")
        ->execute([json_encode(array_slice($replies, -50), JSON_UNESCAPED_UNICODE), json_encode(array_slice($imports, -20), JSON_UNESCAPED_UNICODE), (int) $row['id']]);
    log_change($pdo, 'photo_ask', (int) $row['id'], 'update', 'Réponses de ' . $from . ' importées : ' . $row['title']);
    return ['ok' => true, 'id' => (int) $row['id'], 'from' => $from, 'counts' => $counts, 'created' => $created, 'updated' => count($updated)];
}

/** ↶ Annuler le dernier import : identifications créées retirées, modifiées remises, réponses oubliées. */
function pa_undo_import(PDO $pdo, array $data): array
{
    $row = pa_row($pdo, safe_int($data['id'] ?? 0));
    $imports = qp_json($row['imports_json']);
    $last = array_pop($imports);
    if (!$last) { throw new RuntimeException('Rien à annuler.'); }
    $removed = 0;
    foreach (($last['created'] ?? []) as $tid) {
        $tid = (int) $tid;
        $c = $pdo->prepare('SELECT 1 FROM media_tags WHERE id=?'); $c->execute([$tid]);
        if (!$c->fetchColumn()) { continue; }
        delete_media_tag($pdo, ['tag_id' => $tid]);
        $pdo->prepare('UPDATE face_prints SET tag_id=NULL WHERE tag_id=?')->execute([$tid]);
        $removed++;
    }
    foreach (($last['updated'] ?? []) as $u) {
        $c = $pdo->prepare('SELECT 1 FROM media_tags WHERE id=?'); $c->execute([(int) $u['tag_id']]);
        if ($c->fetchColumn() && (int) $u['person_id']) { update_media_tag($pdo, ['tag_id' => (int) $u['tag_id'], 'person_id' => (int) $u['person_id'], 'confidence' => (string) $u['confidence'], 'note' => (string) $u['note'], 'tag_type' => 'person']); }
    }
    $replies = array_values(array_filter(qp_json($row['replies_json']), static fn($rep) => ($rep['rid'] ?? '') !== ($last['rid'] ?? '')));
    $prev = isset(PA_STATUSES[$last['prev_status'] ?? '']) ? $last['prev_status'] : 'sent';
    $pdo->prepare('UPDATE photo_asks SET replies_json=?, imports_json=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        ->execute([json_encode($replies, JSON_UNESCAPED_UNICODE), json_encode($imports, JSON_UNESCAPED_UNICODE), $prev, (int) $row['id']]);
    log_change($pdo, 'photo_ask', (int) $row['id'], 'update', 'Import des réponses annulé : ' . $row['title']);
    return ['ok' => true, 'removed' => $removed];
}

function pa_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        pa_ready($pdo);
        if (!$isWrite) {
            if ($action === 'pa_list') { json_response(pa_list($pdo)); }
            if ($action === 'pa_get') { json_response(['ask' => pa_out($pdo, pa_row($pdo, safe_int($_GET['id'] ?? 0))), 'statuses' => PA_STATUSES]); }
            if ($action === 'pa_faces') { json_response(pa_faces($pdo, array_map('intval', explode(',', (string) ($_GET['ids'] ?? ''))))); }
        }
        if ($isWrite && $action === 'pa_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            if ($op === 'analyze') { json_response(pa_analyze($pdo, $payload)); } // lecture seule
            if ($op === 'preview') { json_response(['ok' => true] + pa_html($pdo, pa_row($pdo, safe_int($payload['id'] ?? 0)), 'preview')); }
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'save' => pa_save($pdo, $payload),
                    'delete' => pa_delete($pdo, $payload),
                    'restore' => pa_restore($pdo, $payload),
                    'render' => pa_render($pdo, $payload),
                    'import' => pa_import($pdo, $payload),
                    'undo_import' => pa_undo_import($pdo, $payload),
                    default => throw new LcndaBadInput('Opération inconnue.'),
                };
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
