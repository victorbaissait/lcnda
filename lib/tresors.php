<?php
declare(strict_types=1);

/**
 * ✨ Trésors de famille (écran : assets/js/heritage-tresors*.js) — le stockage commun des nouveautés qui gardent quelque chose
 * et une vue d'ensemble de l'arbre pour les jeux, les calculs et les créations :
 *
 *   GET  api.php?action=tresors[&kind=letter|candle|passport|stamp|sense…][&person_id=N]
 *        → {items: [...]} ; une lettre encore scellée (open_at dans le futur) n'envoie pas son texte, seulement sa date
 *   POST api.php?action=tresor_write {op: save | delete, item: {id?, kind, person_id?, place_id?, title, body, data, open_at}, csrf}
 *   GET  api.php?action=tresor_media&ids=1,2 → {media: [{id, title, media_type, filename, thumbnail}]}
 *   POST api.php?action=tresor_write {op: link_media, media_id, person_id} → le média (un entretien enregistré) rangé sur la fiche
 *   GET  api.php?action=tresor_signatures → {signatures: [{media_id, filename, person_id, x, y, w, h, year}]} (les zones « signature » des médias)
 *   GET  api.php?action=tresor_faces → {faces: [{media_id, filename, person_id, x, y, w, h}]} (les visages identifiés sur les photos)
 *   GET  api.php?action=tresor_tree   → {people: [{id, name, first, last, gender, living, by, bd (AAAA-MM-JJ), bplace, dy, dd,
 *        dplace, occ, portrait, father, mother, start, touched (dernière modification de la fiche), priv (fiche confidentielle)}]
 *        — en mode consultation, sans les vivants ni les fiches confidentielles, families: [{id, a, b, my, md, mplace}], places: {id: {name, lat, lng}},
 *        events: [{p, f, tag, label, y, d, place}]}  (les fiches d'animaux sont laissées de côté)
 *
 * Une seule table, créée à la demande (rien à mettre à jour dans la base) ; tout ce qui arrive est relu et borné ; requêtes préparées.
 */

const TRESOR_KINDS = ['letter', 'candle', 'passport', 'stamp', 'sense', 'hunt', 'gazette', 'share', 'story', 'reminder', 'recipe', 'song', 'interview'];

function tresors_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS tresor_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        person_id INTEGER,
        place_id INTEGER,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}',
        open_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_tresor_kind ON tresor_items(kind, person_id)');
    $done = true;
}

function tresor_clean_data(mixed $v, int $depth = 0): mixed
{
    if ($depth > 6) { return null; }
    if (is_array($v)) { $out = []; $n = 0; foreach ($v as $k => $x) { if (++$n > 400) { break; } $kk = is_int($k) ? $k : mb_substr(preg_replace('/[^\w\-]/u', '', (string) $k), 0, 40); if ($kk === '') { continue; } $out[$kk] = tresor_clean_data($x, $depth + 1); } return $out; }
    if (is_bool($v) || is_int($v) || is_float($v) || $v === null) { return $v; }
    return mb_substr((string) $v, 0, 20000);
}

function tresors_list(PDO $pdo, string $kind, int $personId): array
{
    tresors_ensure($pdo);
    $sql = 'SELECT * FROM tresor_items WHERE 1=1'; $args = [];
    if ($kind !== '') { $sql .= ' AND kind=?'; $args[] = $kind; }
    if ($personId > 0) { $sql .= ' AND person_id=?'; $args[] = $personId; }
    $st = $pdo->prepare($sql . ' ORDER BY COALESCE(NULLIF(open_at,\'\'), created_at) DESC, id DESC LIMIT 2000'); $st->execute($args);
    $today = date('Y-m-d');
    return array_map(static function (array $r) use ($today): array {
        $r['id'] = (int) $r['id']; $r['person_id'] = $r['person_id'] !== null ? (int) $r['person_id'] : null; $r['place_id'] = $r['place_id'] !== null ? (int) $r['place_id'] : null;
        $r['data'] = json_decode((string) $r['data_json'], true) ?: new stdClass(); unset($r['data_json']);
        $r['sealed'] = $r['kind'] === 'letter' && $r['open_at'] !== '' && $r['open_at'] > $today;
        if ($r['sealed']) { $r['body'] = ''; if (is_array($r['data'])) { $r['data'] = array_intersect_key($r['data'], array_flip(['to', 'from', 'occasion', 'media_kind'])); } } // scellée : seulement qui, pour qui, quand
        return $r;
    }, $st->fetchAll(PDO::FETCH_ASSOC));
}

function tresor_save(PDO $pdo, array $item): array
{
    tresors_ensure($pdo);
    $kind = (string) ($item['kind'] ?? ''); if (!in_array($kind, TRESOR_KINDS, true)) { throw new LcndaBadInput('Sorte inconnue.'); }
    $id = (int) ($item['id'] ?? 0);
    $pid = (int) ($item['person_id'] ?? 0); if ($pid > 0) { $ok = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $ok->execute([$pid]); if (!$ok->fetchColumn()) { $pid = 0; } }
    $plid = (int) ($item['place_id'] ?? 0); if ($plid > 0) { $ok = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $ok->execute([$plid]); if (!$ok->fetchColumn()) { $plid = 0; } }
    $title = mb_substr(trim((string) ($item['title'] ?? '')), 0, 300);
    $body = mb_substr((string) ($item['body'] ?? ''), 0, 200000);
    $open = (string) ($item['open_at'] ?? ''); if ($open !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $open)) { $open = ''; }
    $data = json_encode(tresor_clean_data(is_array($item['data'] ?? null) ? $item['data'] : []), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    if ($id > 0) {
        $old = $pdo->prepare('SELECT kind, open_at, body, data_json FROM tresor_items WHERE id=?'); $old->execute([$id]); $o = $old->fetch(PDO::FETCH_ASSOC);
        if (!$o) { throw new LcndaBadInput('Élément introuvable.'); }
        if ($o['kind'] === 'letter' && $o['open_at'] > date('Y-m-d')) {
            // une lettre scellée ne se relit pas en douce : ni texte renvoyé (donc pas écrasé par du vide), ni changement de sorte,
            // ni date avancée (on peut la repousser, ou la supprimer) ; ses pièces jointes et ses réglages cachés restent
            $kind = 'letter';
            if ($body === '') { $body = (string) $o['body']; }
            if ($open === '' || $open < $o['open_at']) { $open = (string) $o['open_at']; }
            $oldData = json_decode((string) $o['data_json'], true) ?: []; $newData = json_decode($data, true) ?: [];
            foreach (['media', 'for_person', 'age', 'when'] as $k) { if (empty($newData[$k]) && isset($oldData[$k])) { $newData[$k] = $oldData[$k]; } }
            $data = json_encode(array_replace($oldData, $newData), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: $data;
        }
        $pdo->prepare('UPDATE tresor_items SET kind=?, person_id=?, place_id=?, title=?, body=?, data_json=?, open_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$kind, $pid ?: null, $plid ?: null, $title, $body, $data, $open, $id]);
    } else {
        $pdo->prepare('INSERT INTO tresor_items(kind, person_id, place_id, title, body, data_json, open_at) VALUES(?,?,?,?,?,?,?)')->execute([$kind, $pid ?: null, $plid ?: null, $title, $body, $data, $open]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

/** Une vue d'ensemble légère de l'arbre (personnes, couples, lieux, événements datés) */
function tresor_tree(PDO $pdo): array
{
    $hasKind = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='kind'")->fetchColumn();
    $hasOcc = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='occupation'")->fetchColumn();
    $hasPriv = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('persons') WHERE name='is_private'")->fetchColumn();
    // mode consultation (la famille regarde) : ni les vivants ni les fiches confidentielles, comme ailleurs dans l'application
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    $cond = []; if ($hasKind) { $cond[] = "COALESCE(p.kind,'human')<>'animal'"; }
    if ($kiosk) { $cond[] = "COALESCE(p.living_status,'')<>'living'"; if ($hasPriv) { $cond[] = 'COALESCE(p.is_private,0)=0'; } }
    $people = []; $where = $cond ? 'WHERE ' . implode(' AND ', $cond) : '';
    foreach ($pdo->query('SELECT p.id, p.first_name, p.middle_name, p.last_name, p.gender, p.living_status, p.is_start, p.updated_at, ' . ($hasPriv ? 'COALESCE(p.is_private,0) AS priv, ' : '0 AS priv, ') . ($hasOcc ? 'p.occupation' : "'' AS occupation") . ",
            (SELECT COALESCE(NULLIF(m.thumbnail,''),m.filename) FROM media m WHERE m.id=p.portrait_media_id) AS portrait FROM persons p $where") as $r) {
        $id = (int) $r['id'];
        $people[$id] = ['id' => $id, 'first' => trim((string) $r['first_name']), 'last' => trim((string) $r['last_name']), 'name' => trim(preg_replace('/\s+/', ' ', $r['first_name'] . ' ' . $r['middle_name'] . ' ' . $r['last_name'])),
            'gender' => $r['gender'], 'living' => $r['living_status'] === 'living', 'start' => (int) $r['is_start'] === 1, 'occ' => trim((string) $r['occupation']), 'portrait' => $r['portrait'] ?: null, 'touched' => substr((string) $r['updated_at'], 0, 10), 'priv' => (int) $r['priv'] === 1,
            'by' => null, 'bd' => null, 'bplace' => null, 'dy' => null, 'dd' => null, 'dplace' => null, 'father' => null, 'mother' => null];
    }
    $places = [];
    foreach ($pdo->query('SELECT id, name, latitude, longitude FROM places') as $r) { $places[(int) $r['id']] = ['name' => (string) $r['name'], 'lat' => $r['latitude'] !== null ? (float) $r['latitude'] : null, 'lng' => $r['longitude'] !== null ? (float) $r['longitude'] : null]; }
    $families = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $r) { $families[(int) $r['id']] = ['id' => (int) $r['id'], 'a' => $r['partner1_id'] !== null ? (int) $r['partner1_id'] : null, 'b' => $r['partner2_id'] !== null ? (int) $r['partner2_id'] : null, 'my' => null, 'md' => null, 'mplace' => null, 'children' => []]; }
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children ORDER BY position, id') as $r) {
        $f = $families[(int) $r['family_id']] ?? null; $c = (int) $r['child_id']; if (!$f || !isset($people[$c])) { continue; }
        $families[(int) $r['family_id']]['children'][] = $c;
        foreach ([$f['a'], $f['b']] as $par) { if ($par && isset($people[$par])) { $people[$c][$people[$par]['gender'] === 'female' ? 'mother' : 'father'] ??= $par; } }
    }
    $events = [];
    $q = $pdo->query("SELECT e.person_id, e.family_id, e.year, e.sort_date, e.place_id, e.title, e.description, t.gedcom_tag, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id ORDER BY COALESCE(e.sort_date,''), e.year, e.id");
    foreach ($q as $e) {
        $d = null; if (preg_match('/^(\d{3,4})-(\d{2})-(\d{2})/', (string) $e['sort_date'], $m) && (int) $m[2] > 0 && (int) $m[3] > 0) { $d = sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3]); }
        $y = $e['year'] !== null ? (int) $e['year'] : ($d ? (int) substr($d, 0, 4) : null);
        $pid = $e['person_id'] !== null ? (int) $e['person_id'] : null; $fid = $e['family_id'] !== null ? (int) $e['family_id'] : null; $pl = $e['place_id'] !== null ? (int) $e['place_id'] : null; $tag = (string) $e['gedcom_tag'];
        if ($pid && !isset($people[$pid])) { continue; }
        $events[] = ['p' => $pid, 'f' => $fid, 'tag' => $tag, 'label' => (string) $e['label'], 'y' => $y, 'd' => $d, 'place' => $pl, 'what' => mb_substr(trim((string) ($e['title'] ?: $e['description'])), 0, 120)];
        if ($pid && $tag === 'BIRT' && $people[$pid]['by'] === null) { $people[$pid]['by'] = $y; $people[$pid]['bd'] = $d; $people[$pid]['bplace'] = $pl; }
        if ($pid && in_array($tag, ['CHR', 'BAPM'], true) && $people[$pid]['by'] === null) { $people[$pid]['by'] = $y; $people[$pid]['bplace'] ??= $pl; }
        if ($pid && $tag === 'DEAT' && $people[$pid]['dy'] === null) { $people[$pid]['dy'] = $y; $people[$pid]['dd'] = $d; $people[$pid]['dplace'] = $pl; }
        if ($pid && $tag === 'OCCU' && $people[$pid]['occ'] === '' && $e['title'] . $e['description'] !== '') { $people[$pid]['occ'] = mb_substr(trim((string) ($e['title'] ?: $e['description'])), 0, 80); }
        if ($fid && isset($families[$fid]) && in_array($tag, ['MARR', 'MRCI', 'MRRE'], true) && $families[$fid]['my'] === null) { $families[$fid]['my'] = $y; $families[$fid]['md'] = $d; $families[$fid]['mplace'] = $pl; }
    }
    // 🔗 partage : la règle de l'export « Pour partager » (vivants déclarés ou probables, fiches confidentielles), calculée ici
    // pour que le navigateur n'ait pas à deviner (un enfant sans date d'une personne née en 1950 est aussi retiré)
    if (function_exists('person_select')) {
        require_once __DIR__ . '/gedcom.php';
        try { foreach (gedcom_share_hidden($pdo, $pdo->query(person_select())->fetchAll(), $pdo->query('SELECT * FROM families')->fetchAll()) as $hid => $_) { if (isset($people[(int) $hid])) { $people[(int) $hid]['sh'] = true; } } }
        catch (Throwable $e) { foreach ($people as $id => $_) { $people[$id]['sh'] = true; } } // dans le doute, rien ne part
    }
    return ['people' => array_values($people), 'families' => array_values($families), 'places' => (object) $places, 'events' => $events];
}

/* ─── 🥘 🎶 👃 Recettes, chansons et souvenirs des sens : rangés dans la Mémoire familiale (une seule liste, pas de doublon) ───
 * Les pages des Trésors gardent leurs champs (ingrédients, air, sens…) : ils vont dans family_memories.data_json ; le texte lisible
 * partout (content, origin_text, notes) est écrit aussi, pour la liste « Mémoire familiale ». Les anciens éléments des Trésors y sont
 * déplacés une fois, sans rien perdre (médias, personne). Les identifiants sont « m12 » : jamais confondus avec ceux des Trésors. */
const TRESOR_MEM_KINDS = ['recipe', 'song', 'sense'];

function tresor_mem_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    $has = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('family_memories') WHERE name='data_json'")->fetchColumn();
    if (!$has) { $pdo->exec("ALTER TABLE family_memories ADD COLUMN data_json TEXT NOT NULL DEFAULT '{}'"); }
    $done = true;
}

/** le texte lisible dans la Mémoire familiale, à partir des champs des Trésors */
function tresor_mem_text(string $kind, string $body, array $d): array
{
    $from = is_string($d['from'] ?? null) && !ctype_digit((string) $d['from']) ? trim((string) $d['from']) : '';
    if ($kind === 'recipe') {
        $ing = trim((string) ($d['ingredients'] ?? ''));
        $content = ($ing !== '' ? "Ingrédients :\n" . $ing . "\n\n" : '') . ($body !== '' ? ($ing !== '' ? "Préparation :\n" : '') . $body : '');
        $origin = trim(($from !== '' ? 'La recette de ' . $from : '') . (($d['serves'] ?? '') !== '' ? ($from !== '' ? ', ' : '') . (string) $d['serves'] : ''));
    } elseif ($kind === 'song') {
        $content = $body; $origin = trim(($from !== '' ? 'Chantée par ' . $from : '') . (($d['tune'] ?? '') !== '' ? ($from !== '' ? ', ' : '') . 'sur l’air de « ' . $d['tune'] . ' »' : ''));
    } else {
        $content = $body; $origin = implode(' · ', array_filter([$from !== '' ? 'ça rappelle ' . $from : '', (string) ($d['place'] ?? ''), (string) ($d['when'] ?? '')], static fn($x) => $x !== ''));
    }
    return [$content, mb_substr($origin, 0, 300), mb_substr((string) ($d['story'] ?? ''), 0, 4000)];
}

/** une ligne de la Mémoire familiale → un élément comme ceux des Trésors */
function tresor_mem_item(PDO $pdo, array $m): array
{
    $d = json_decode((string) ($m['data_json'] ?? '{}'), true); if (!is_array($d)) { $d = []; }
    $content = (string) $m['content'];
    $same = isset($d['_content']) && $d['_content'] === $content; // modifiée ailleurs (Mémoire familiale) : le texte complet devient le corps
    $body = $same ? (string) ($d['_body'] ?? '') : $content;
    if (!$same) { unset($d['ingredients']); }
    unset($d['_content'], $d['_body']);
    $pp = $pdo->prepare("SELECT person_id FROM family_memory_people WHERE memory_id=? ORDER BY CASE role WHEN 'transmitted' THEN 0 ELSE 1 END, id LIMIT 1"); $pp->execute([(int) $m['id']]); $pid = $pp->fetchColumn(); $pp->closeCursor();
    if ($pid && !isset($d['from'])) { $d['from'] = (string) $pid; }
    $md = $pdo->prepare("SELECT media_id FROM family_collection_media WHERE collection_type='family_memory' AND collection_id=? ORDER BY id"); $md->execute([(int) $m['id']]);
    $d['media'] = array_map('intval', $md->fetchAll(PDO::FETCH_COLUMN));
    if (!$same && $m['notes'] !== '' && !isset($d['story'])) { $d['story'] = (string) $m['notes']; }
    return ['id' => 'm' . (int) $m['id'], 'mid' => (int) $m['id'], 'mem' => true, 'kind' => (string) $m['kind'], 'person_id' => $pid ? (int) $pid : null, 'place_id' => null, 'title' => (string) $m['title'], 'body' => $body,
        'data' => $d ?: new stdClass(), 'open_at' => '', 'sealed' => false, 'created_at' => (string) $m['created_at'], 'updated_at' => (string) $m['updated_at']];
}

/** enregistrer (créer ou modifier) dans la Mémoire familiale ; item comme ceux des Trésors (id « m12 » pour modifier) */
function tresor_mem_save(PDO $pdo, array $item): array
{
    tresor_mem_ensure($pdo);
    $kind = (string) ($item['kind'] ?? ''); if (!in_array($kind, TRESOR_MEM_KINDS, true)) { throw new LcndaBadInput('Sorte inconnue.'); }
    $mid = preg_match('/^m(\d+)$/', (string) ($item['id'] ?? ''), $mm) ? (int) $mm[1] : 0;
    if ($mid) { $k = $pdo->prepare('SELECT kind FROM family_memories WHERE id=?'); $k->execute([$mid]); $old = $k->fetchColumn(); if ($old === false) { throw new LcndaBadInput('Élément introuvable.'); } }
    $d = tresor_clean_data(is_array($item['data'] ?? null) ? $item['data'] : []); if (!is_array($d)) { $d = []; }
    $body = mb_substr(trim((string) ($item['body'] ?? '')), 0, 20000);
    [$content, $origin, $notes] = tresor_mem_text($kind, $body, $d);
    $media = array_values(array_unique(array_filter(array_map('intval', is_array($d['media'] ?? null) ? $d['media'] : []))));
    $from = (string) ($d['from'] ?? ''); $people = ctype_digit($from) && (int) $from > 0 ? [['person_id' => (int) $from, 'role' => 'transmitted']] : [];
    unset($d['media']); $d['_content'] = $content; $d['_body'] = $body;
    $pdo->beginTransaction();
    try {
        $r = save_family_memory($pdo, ['id' => $mid, 'kind' => $kind, 'title' => (string) ($item['title'] ?? ''), 'content' => $content, 'origin_text' => $origin, 'notes' => $notes, 'people' => $people]);
        $id = (int) $r['id'];
        $pdo->prepare('UPDATE family_memories SET data_json=? WHERE id=?')->execute([json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}', $id]);
        $pdo->prepare("DELETE FROM family_collection_media WHERE collection_type='family_memory' AND collection_id=?")->execute([$id]);
        $ok = $pdo->prepare('SELECT 1 FROM media WHERE id=?'); $ins = $pdo->prepare("INSERT INTO family_collection_media(collection_type, collection_id, media_id) VALUES('family_memory', ?, ?)");
        foreach (array_slice($media, 0, 40) as $m) { $ok->execute([$m]); if ($ok->fetchColumn()) { $ins->execute([$id, $m]); } $ok->closeCursor(); }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e instanceof RuntimeException ? new LcndaBadInput($e->getMessage()) : $e; }
    return ['id' => 'm' . $id];
}

/** les anciens éléments des Trésors (recettes, chansons, souvenirs des sens) passent dans la Mémoire familiale, une fois */
function tresor_mem_migrate(PDO $pdo): int
{
    tresors_ensure($pdo); tresor_mem_ensure($pdo);
    $st = $pdo->query("SELECT * FROM tresor_items WHERE kind IN ('recipe','song','sense') ORDER BY id"); $rows = $st->fetchAll(PDO::FETCH_ASSOC); $st->closeCursor();
    $n = 0;
    foreach ($rows as $r) {
        $d = json_decode((string) $r['data_json'], true); if (!is_array($d)) { $d = []; }
        if (!isset($d['from']) && $r['person_id'] !== null) { $d['from'] = (string) $r['person_id']; }
        tresor_mem_save($pdo, ['kind' => $r['kind'], 'title' => (string) $r['title'] !== '' ? (string) $r['title'] : 'Sans titre', 'body' => (string) $r['body'], 'data' => $d]);
        $pdo->prepare('DELETE FROM tresor_items WHERE id=?')->execute([(int) $r['id']]); $n++;
    }
    return $n;
}

function tresor_mem_list(PDO $pdo, string $kind, int $personId = 0): array
{
    tresor_mem_migrate($pdo);
    $sql = 'SELECT * FROM family_memories WHERE kind' . ($kind !== '' ? '=?' : " IN ('recipe','song','sense')"); $args = $kind !== '' ? [$kind] : [];
    if ($personId > 0) { $sql .= ' AND id IN (SELECT memory_id FROM family_memory_people WHERE person_id=?)'; $args[] = $personId; }
    $st = $pdo->prepare($sql . ' ORDER BY updated_at DESC, id DESC LIMIT 2000'); $st->execute($args);
    return array_map(static fn(array $m) => tresor_mem_item($pdo, $m), $st->fetchAll(PDO::FETCH_ASSOC));
}

function tresors_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'tresors') {
            $kind = (string) ($_GET['kind'] ?? ''); if ($kind !== '' && !in_array($kind, TRESOR_KINDS, true)) { $kind = '-'; }
            json_response(['items' => tresors_list($pdo, $kind, safe_int($_GET['person_id'] ?? 0))]);
        }
        if (!$isWrite && $action === 'tresor_tree') { json_response(tresor_tree($pdo)); }
        if (!$isWrite && $action === 'tresor_media') { // les médias joints (lettres, souvenirs) : nom de fichier et sorte, pour les lire sur place
            $ids = array_slice(array_values(array_filter(array_map('intval', explode(',', (string) ($_GET['ids'] ?? ''))))), 0, 200); if (!$ids) { json_response(['media' => []]); }
            $st = $pdo->prepare('SELECT id, title, media_type, filename, thumbnail FROM media WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'); $st->execute($ids);
            json_response(['media' => $st->fetchAll(PDO::FETCH_ASSOC)]);
        }
        if (!$isWrite && $action === 'tresor_signatures') { // le mur des signatures : chaque zone marquée « signature » sur un document
            $hasType = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media_tags') WHERE name='tag_type'")->fetchColumn();
            if (!$hasType) { json_response(['signatures' => []]); }
            $out = [];
            foreach ($pdo->query("SELECT t.media_id, t.person_id, t.x, t.y, t.w, t.h, m.filename, m.date_text, m.title FROM media_tags t JOIN media m ON m.id=t.media_id WHERE t.tag_type='signature' AND m.media_type='image' ORDER BY t.id LIMIT 3000") as $r) {
                $out[] = ['media_id' => (int) $r['media_id'], 'person_id' => (int) $r['person_id'], 'x' => (float) $r['x'], 'y' => (float) $r['y'], 'w' => (float) $r['w'], 'h' => (float) $r['h'],
                    'filename' => (string) $r['filename'], 'title' => (string) $r['title'], 'year' => preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) $r['date_text'] . ' ' . $r['title'], $m) ? (int) $m[1] : null];
            }
            json_response(['signatures' => $out]);
        }
        if (!$isWrite && $action === 'tresor_faces') { // le visage de la lignée, la mosaïque : les visages encadrés dans la visionneuse
            $hasType = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media_tags') WHERE name='tag_type'")->fetchColumn();
            $out = [];
            foreach ($pdo->query('SELECT t.media_id, t.person_id, t.x, t.y, t.w, t.h, m.filename FROM media_tags t JOIN media m ON m.id=t.media_id WHERE m.media_type=\'image\' AND t.w>0 AND t.h>0' . ($hasType ? " AND COALESCE(t.tag_type,'person')<>'signature'" : '') . ' ORDER BY t.id LIMIT 5000') as $r) {
                $out[] = ['media_id' => (int) $r['media_id'], 'person_id' => (int) $r['person_id'], 'x' => (float) $r['x'], 'y' => (float) $r['y'], 'w' => (float) $r['w'], 'h' => (float) $r['h'], 'filename' => (string) $r['filename']];
            }
            json_response(['faces' => $out]);
        }
        if (!$isWrite && $action === 'tresor_memories') {
            $kind = (string) ($_GET['kind'] ?? ''); if ($kind !== '' && !in_array($kind, TRESOR_MEM_KINDS, true)) { $kind = 'recipe'; }
            json_response(['items' => tresor_mem_list($pdo, $kind, safe_int($_GET['person_id'] ?? 0))]);
        }
        if ($isWrite && $action === 'tresor_memory_write') {
            $op = (string) ($payload['op'] ?? '');
            if ($op === 'save') { json_response(tresor_mem_save($pdo, is_array($payload['item'] ?? null) ? $payload['item'] : [])); }
            if ($op === 'delete') { $mid = preg_match('/^m(\d+)$/', (string) ($payload['id'] ?? ''), $mm) ? (int) $mm[1] : 0; $k = $pdo->prepare('SELECT kind FROM family_memories WHERE id=?'); $k->execute([$mid]);
                if (!in_array($k->fetchColumn(), TRESOR_MEM_KINDS, true)) { throw new LcndaBadInput('Élément introuvable.'); } delete_family_memory($pdo, ['id' => $mid]); json_response(['ok' => true]); }
            throw new LcndaBadInput('Opération inconnue.');
        }
        if ($isWrite && $action === 'tresor_write') {
            $op = (string) ($payload['op'] ?? '');
            if ($op === 'save') { json_response(tresor_save($pdo, is_array($payload['item'] ?? null) ? $payload['item'] : [])); }
            if ($op === 'link_media') { // un média tout juste enregistré (entretien, veillée) rangé dans les médias de la fiche
                $mid = (int) ($payload['media_id'] ?? 0); $pid = (int) ($payload['person_id'] ?? 0);
                $ok = $pdo->prepare('SELECT (SELECT 1 FROM media WHERE id=?) AND (SELECT 1 FROM persons WHERE id=?)'); $ok->execute([$mid, $pid]);
                if (!$ok->fetchColumn()) { throw new LcndaBadInput('Média ou fiche introuvable.'); }
                $has = $pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=?"); $has->execute([$mid, $pid]);
                if (!$has->fetchColumn()) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, (SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?))")->execute([$mid, $pid, $pid]); }
                json_response(['ok' => true]);
            }
            if ($op === 'delete') { tresors_ensure($pdo); $pdo->prepare('DELETE FROM tresor_items WHERE id=?')->execute([(int) ($payload['id'] ?? 0)]); json_response(['ok' => true]); }
            throw new LcndaBadInput('Opération inconnue.');
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 400);
    }
}
