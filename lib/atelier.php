<?php
declare(strict_types=1);

/*
 * 📚 Atelier de recherche (onglet Listes) : des projets d'écriture ou de recherche (thèse, livre, article, exposition…),
 * chacun avec ses dossiers imbriqués sans limite, et ses éléments : références (livres, articles, archives, gravures…),
 * notes, citations, images, personnes (de la base ou non), lieux, dates, liens, tâches, brouillons.
 * Un élément peut être rangé dans plusieurs dossiers. Structure n°24 (tables atelier_*). Écran : assets/js/heritage-research.js.
 */

const ATELIER_KINDS = ['these' => 'Thèse', 'livre' => 'Livre', 'article' => 'Article', 'memoire' => 'Mémoire', 'exposition' => 'Exposition', 'enquete' => 'Enquête', 'autre' => 'Autre'];
const ATELIER_TYPES = ['reference', 'note', 'quote', 'media', 'person', 'place', 'event', 'link', 'task', 'draft'];
const ATELIER_REF_KINDS = ['livre', 'article', 'chapitre', 'these', 'archive', 'image', 'presse', 'web', 'objet', 'autre'];
const ATELIER_READ = ['', 'a_lire', 'en_cours', 'lu', 'exploite'];

function atelier_project_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM atelier_projects WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch();
    if (!$p) { throw new RuntimeException('Projet introuvable.'); }
    return $p;
}

function atelier_projects(PDO $pdo): array
{
    $rows = $pdo->query("SELECT p.*,
            (SELECT count(*) FROM atelier_items i WHERE i.project_id=p.id AND i.trashed=0) AS item_count,
            (SELECT count(*) FROM atelier_folders f WHERE f.project_id=p.id) AS folder_count,
            (SELECT count(*) FROM atelier_items i WHERE i.project_id=p.id AND i.trashed=0 AND i.type='task' AND json_extract(i.data_json,'$.done')<>1) AS open_tasks,
            (SELECT max(i.updated_at) FROM atelier_items i WHERE i.project_id=p.id) AS last_item
        FROM atelier_projects p ORDER BY p.status='archived', p.position, p.id")->fetchAll();
    foreach ($rows as &$r) { $r['words'] = atelier_words($pdo, (int) $r['id']); }
    unset($r);
    return ['projects' => $rows, 'kinds' => ATELIER_KINDS];
}

/** Nombre de mots des brouillons (pour l'avancement vers l'objectif). */
function atelier_words(PDO $pdo, int $projectId): int
{
    $s = $pdo->prepare("SELECT data_json FROM atelier_items WHERE project_id=? AND type='draft' AND trashed=0"); $s->execute([$projectId]);
    $n = 0;
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $json) { $n += atelier_count_words((string) (json_decode((string) $json, true)['text'] ?? '')); }
    return $n;
}

function atelier_count_words(string $text): int
{
    return preg_match_all('/[\p{L}\p{N}]+(?:[’\'-][\p{L}\p{N}]+)*/u', $text);
}

function save_atelier_project(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 200);
    if ($title === '') { throw new RuntimeException('Donne un titre au projet.'); }
    $vals = [$title, mb_substr(safe_text($data['subtitle'] ?? ''), 0, 300), array_key_exists((string) ($data['kind'] ?? ''), ATELIER_KINDS) ? (string) $data['kind'] : 'autre',
        mb_substr(safe_text($data['icon'] ?? ''), 0, 16), preg_match('/^#[0-9a-f]{6}$/i', (string) ($data['color'] ?? '')) ? (string) $data['color'] : '#0066cc',
        h_long($data, 'description', 20000), max(0, min(10000000, safe_int($data['target_words'] ?? 0))), preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($data['deadline'] ?? '')) ? (string) $data['deadline'] : '',
        ($data['status'] ?? '') === 'archived' ? 'archived' : 'active'];
    if ($id) {
        atelier_project_row($pdo, $id);
        $pdo->prepare('UPDATE atelier_projects SET title=?, subtitle=?, kind=?, icon=?, color=?, description=?, target_words=?, deadline=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
    } else {
        $pdo->prepare('INSERT INTO atelier_projects(title, subtitle, kind, icon, color, description, target_words, deadline, status, position) VALUES(?,?,?,?,?,?,?,?,?,(SELECT COALESCE(max(position),0)+1 FROM atelier_projects))')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        // plan de départ (dossiers et sous-dossiers) choisi avec le modèle
        $add = static function (array $tree, ?int $parent) use (&$add, $pdo, $id): void {
            foreach (array_slice($tree, 0, 200) as $pos => $node) {
                $name = mb_substr(safe_text(is_array($node) ? ($node['name'] ?? '') : (string) $node), 0, 200);
                if ($name === '') { continue; }
                $pdo->prepare('INSERT INTO atelier_folders(project_id, parent_id, name, icon, position) VALUES(?,?,?,?,?)')->execute([$id, $parent, $name, is_array($node) ? mb_substr(safe_text($node['icon'] ?? ''), 0, 16) : '', $pos]);
                if (is_array($node) && is_array($node['children'] ?? null)) { $add($node['children'], (int) $pdo->lastInsertId()); }
            }
        };
        if (is_array($data['folders'] ?? null)) { $add($data['folders'], null); }
    }
    log_change($pdo, 'meta', 0, 'update', 'Atelier de recherche : projet « ' . $title . ' »');
    return ['id' => $id];
}

function delete_atelier_project(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    atelier_project_row($pdo, $id);
    foreach ($pdo->query('SELECT id FROM atelier_items WHERE project_id=' . $id)->fetchAll(PDO::FETCH_COLUMN) as $iid) { heritage_delete_media_links($pdo, 'atelier_item', (int) $iid); }
    $pdo->exec('DELETE FROM atelier_item_folders WHERE item_id IN (SELECT id FROM atelier_items WHERE project_id=' . $id . ')');
    $pdo->prepare('DELETE FROM atelier_items WHERE project_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM atelier_folders WHERE project_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM atelier_projects WHERE id=?')->execute([$id]);
    return ['ok' => true];
}

/** Un projet ouvert : ses dossiers, tous ses éléments (corbeille comprise), les personnes et les images liées. */
function atelier_project(PDO $pdo, int $id): array
{
    $p = atelier_project_row($pdo, $id);
    $p['words'] = atelier_words($pdo, $id);
    $folders = $pdo->prepare('SELECT * FROM atelier_folders WHERE project_id=? ORDER BY position, id'); $folders->execute([$id]);
    $items = $pdo->prepare('SELECT * FROM atelier_items WHERE project_id=? ORDER BY id'); $items->execute([$id]);
    $links = $pdo->prepare('SELECT l.item_id, l.folder_id FROM atelier_item_folders l JOIN atelier_items i ON i.id=l.item_id WHERE i.project_id=? ORDER BY l.position, l.item_id'); $links->execute([$id]);
    $byItem = [];
    foreach ($links->fetchAll() as $l) { $byItem[(int) $l['item_id']][] = (int) $l['folder_id']; }
    $rows = $items->fetchAll();
    $ids = array_map(static fn($r) => (int) $r['id'], $rows);
    $media = heritage_media($pdo, 'atelier_item', $ids);
    $pids = [];
    foreach ($rows as &$r) {
        $r['data'] = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']);
        $r['tags'] = json_decode((string) $r['tags_json'], true) ?: []; unset($r['tags_json']);
        $r['folders'] = $byItem[(int) $r['id']] ?? [];
        $r['media'] = $media[(int) $r['id']] ?? [];
        if (!empty($r['data']['person_id'])) { $pids[] = (int) $r['data']['person_id']; }
        foreach ((array) ($r['data']['people'] ?? []) as $pid) { $pids[] = (int) $pid; }
    }
    unset($r);
    return ['project' => $p, 'folders' => $folders->fetchAll(), 'items' => $rows, 'people' => (object) collection_people($pdo, $pids), 'kinds' => ATELIER_KINDS];
}

/* ─── Dossiers ─── */

function atelier_folder_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM atelier_folders WHERE id=?'); $s->execute([$id]);
    $f = $s->fetch();
    if (!$f) { throw new RuntimeException('Dossier introuvable.'); }
    return $f;
}

/** Créer, renommer, déplacer (dans un autre dossier ou à la racine) ou ranger un dossier ; jamais dans lui-même ni dans un de ses sous-dossiers. */
function save_atelier_folder(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $projectId = $id ? (int) atelier_folder_row($pdo, $id)['project_id'] : (int) atelier_project_row($pdo, safe_int($data['project_id'] ?? 0))['id'];
    $parent = safe_int($data['parent_id'] ?? 0) ?: null;
    if ($parent !== null) {
        $pf = atelier_folder_row($pdo, $parent);
        if ((int) $pf['project_id'] !== $projectId) { throw new RuntimeException('Ce dossier n’est pas dans ce projet.'); }
        for ($cur = $parent, $guard = 0; $cur && $guard < 1000; $guard++) {
            if ($id && $cur === $id) { throw new RuntimeException('Un dossier ne peut pas aller dans lui-même ni dans un de ses sous-dossiers.'); }
            $cur = (int) ($pdo->query('SELECT parent_id FROM atelier_folders WHERE id=' . $cur)->fetchColumn() ?: 0);
        }
    }
    if ($id) {
        $f = atelier_folder_row($pdo, $id);
        $name = array_key_exists('name', $data) ? mb_substr(safe_text($data['name']), 0, 200) : (string) $f['name'];
        if ($name === '') { throw new RuntimeException('Donne un nom au dossier.'); }
        $oldParent = $f['parent_id'] !== null ? (int) $f['parent_id'] : null;
        $parent = array_key_exists('parent_id', $data) ? $parent : $oldParent;
        $pdo->prepare('UPDATE atelier_folders SET name=?, parent_id=?, icon=?, color=?, notes=? WHERE id=?')->execute([$name, $parent,
            array_key_exists('icon', $data) ? mb_substr(safe_text($data['icon']), 0, 16) : $f['icon'],
            array_key_exists('color', $data) ? (preg_match('/^#[0-9a-f]{6}$/i', (string) $data['color']) ? (string) $data['color'] : '') : $f['color'],
            array_key_exists('notes', $data) ? h_long($data, 'notes', 40000) : $f['notes'], $id]);
        // rangé de nouveau seulement s'il change de dossier parent ou qu'on le monte / descend (renommer garde sa place)
        if ($parent !== $oldParent || isset($data['before'])) { atelier_place_folder($pdo, $id, $projectId, $parent, safe_int($data['before'] ?? 0)); }
    } else {
        $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
        if ($name === '') { throw new RuntimeException('Donne un nom au dossier.'); }
        $pos = $pdo->prepare('SELECT COALESCE(max(position),-1)+1 FROM atelier_folders WHERE project_id=? AND parent_id IS ?'); $pos->execute([$projectId, $parent]);
        $pdo->prepare('INSERT INTO atelier_folders(project_id, parent_id, name, icon, position) VALUES(?,?,?,?,?)')->execute([$projectId, $parent, $name, mb_substr(safe_text($data['icon'] ?? ''), 0, 16), (int) $pos->fetchColumn()]);
        $id = (int) $pdo->lastInsertId();
    }
    $pdo->prepare('UPDATE atelier_projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$projectId]);
    return ['id' => $id];
}

/** Range un dossier parmi ses frères : avant $before, sinon à la fin. */
function atelier_place_folder(PDO $pdo, int $id, int $projectId, ?int $parent, int $before): void
{
    $s = $pdo->prepare('SELECT id FROM atelier_folders WHERE project_id=? AND parent_id IS ? AND id<>? ORDER BY position, id'); $s->execute([$projectId, $parent, $id]);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    $at = $before ? array_search($before, $ids, true) : false;
    array_splice($ids, $at === false ? count($ids) : $at, 0, [$id]);
    $upd = $pdo->prepare('UPDATE atelier_folders SET position=? WHERE id=?');
    foreach ($ids as $p => $fid) { $upd->execute([$p, $fid]); }
}

/** Supprime un dossier et ses sous-dossiers ; les éléments restent dans le projet (dans « Non classés » s'ils ne sont plus rangés nulle part). */
function delete_atelier_folder(PDO $pdo, array $data): array
{
    $f = atelier_folder_row($pdo, safe_int($data['id'] ?? 0));
    $all = [(int) $f['id']]; $level = [(int) $f['id']];
    while ($level) {
        $next = array_map('intval', $pdo->query('SELECT id FROM atelier_folders WHERE parent_id IN (' . implode(',', $level) . ')')->fetchAll(PDO::FETCH_COLUMN));
        $all = array_merge($all, $next); $level = $next;
    }
    $in = implode(',', $all);
    $pdo->exec("DELETE FROM atelier_item_folders WHERE folder_id IN ($in)");
    $pdo->exec("DELETE FROM atelier_folders WHERE id IN ($in)");
    return ['deleted' => count($all)];
}

/* ─── Éléments ─── */

function atelier_item_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM atelier_items WHERE id=?'); $s->execute([$id]);
    $i = $s->fetch();
    if (!$i) { throw new RuntimeException('Élément introuvable.'); }
    return $i;
}

function atelier_clean_data(PDO $pdo, string $type, array $in, int $projectId): array
{
    $t = static fn(string $k, int $max = 500) => mb_substr(safe_text(is_scalar($in[$k] ?? null) ? (string) $in[$k] : ''), 0, $max);
    $long = static fn(string $k, int $max = 200000) => mb_substr(trim(is_scalar($in[$k] ?? null) ? (string) $in[$k] : ''), 0, $max);
    $date = static fn(string $k) => mb_substr(safe_text(is_scalar($in[$k] ?? null) ? (string) $in[$k] : ''), 0, 60);
    $url = static function (string $k) use ($in): string { $u = safe_text(is_scalar($in[$k] ?? null) ? (string) $in[$k] : ''); return preg_match('#^https?://#i', $u) ? mb_substr($u, 0, 2000) : ''; };
    $out = ['notes' => $long('notes', 100000)];
    // éléments liés (« voir aussi »), du même projet seulement
    $rel = array_values(array_unique(array_filter(array_map('intval', array_slice(is_array($in['related'] ?? null) ? $in['related'] : [], 0, 200)))));
    if ($rel) { $s = $pdo->prepare('SELECT id FROM atelier_items WHERE project_id=? AND id IN (' . implode(',', array_fill(0, count($rel), '?')) . ')'); $s->execute([$projectId, ...$rel]); $ok = array_flip(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN))); $rel = array_values(array_filter($rel, static fn($i) => isset($ok[$i]))); }
    $out['related'] = $rel;
    $person = static function (mixed $v) use ($pdo): ?int { $id = safe_int(is_scalar($v) ? $v : 0); if (!$id) { return null; } $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$id]); return $s->fetchColumn() ? $id : null; };
    $place = static function (mixed $v) use ($pdo): array {
        $p = is_array($v) ? ['text' => mb_substr(safe_text($v['text'] ?? ''), 0, 300), 'lat' => h_coord($v['lat'] ?? null, 90), 'lon' => h_coord($v['lon'] ?? null, 180)] : ['text' => mb_substr(safe_text(is_scalar($v) ? (string) $v : ''), 0, 300), 'lat' => null, 'lon' => null];
        if ($p['lat'] === null || $p['lon'] === null) { $p['lat'] = $p['lon'] = null; if ($p['text'] !== '' && ($g = heritage_geocode($pdo, $p['text']))) { $p['lat'] = $g['lat']; $p['lon'] = $g['lon']; } }
        return $p;
    };
    switch ($type) {
        case 'reference':
            $creators = [];
            foreach (array_slice(is_array($in['creators'] ?? null) ? $in['creators'] : [], 0, 60) as $c) {
                if (!is_array($c)) { continue; }
                $last = mb_substr(safe_text($c['last'] ?? ''), 0, 120); $first = mb_substr(safe_text($c['first'] ?? ''), 0, 120);
                if ($last === '' && $first === '') { continue; }
                $creators[] = ['last' => $last, 'first' => $first, 'role' => in_array($c['role'] ?? '', ['auteur', 'dir', 'trad', 'graveur', 'editeur', 'illustrateur', 'photographe', 'autre'], true) ? $c['role'] : 'auteur'];
            }
            $out += ['kind' => in_array($in['kind'] ?? '', ATELIER_REF_KINDS, true) ? (string) $in['kind'] : 'livre', 'creators' => $creators, 'year' => $t('year', 20), 'date' => $date('date'),
                'container' => $t('container'), 'publisher' => $t('publisher'), 'place' => $t('place'), 'edition' => $t('edition', 60), 'volume' => $t('volume', 60), 'issue' => $t('issue', 60), 'pages' => $t('pages', 60),
                'isbn' => $t('isbn', 40), 'doi' => $t('doi', 200), 'url' => $url('url'), 'accessed' => $date('accessed'), 'archive' => $t('archive'), 'call_number' => $t('call_number', 200),
                'technique' => $t('technique', 200), 'dimensions' => $t('dimensions', 120), 'language' => $t('language', 60), 'abstract' => $long('abstract', 20000),
                'read' => in_array((string) ($in['read'] ?? ''), ATELIER_READ, true) ? (string) ($in['read'] ?? '') : ''];
            break;
        case 'quote': $out += ['text' => $long('text', 40000), 'source_id' => safe_int($in['source_id'] ?? 0) ?: null, 'page' => $t('page', 60), 'lang' => $t('lang', 60), 'translation' => $long('translation', 40000)];
            if ($out['source_id']) { $s = $pdo->prepare("SELECT 1 FROM atelier_items WHERE id=? AND project_id=? AND type='reference'"); $s->execute([$out['source_id'], $projectId]); if (!$s->fetchColumn()) { $out['source_id'] = null; } }
            break;
        case 'media': $out += ['date' => $date('date'), 'creator' => $t('creator'), 'technique' => $t('technique', 200), 'dimensions' => $t('dimensions', 120), 'holder' => $t('holder'), 'call_number' => $t('call_number', 200), 'credit' => $t('credit'), 'caption' => $long('caption', 4000), 'url' => $url('url')]; break;
        case 'person': $out += ['person_id' => $person($in['person_id'] ?? null), 'name' => $t('name', 200), 'role' => $t('role', 200), 'dates' => $t('dates', 120), 'places' => $t('places', 300)]; break;
        case 'place': $out += ['place' => $place($in['place'] ?? null), 'kind' => $t('kind', 120)]; break;
        case 'event': $out += ['date' => $date('date'), 'end' => $date('end'), 'place' => $place($in['place'] ?? null), 'people' => array_values(array_filter(array_map($person, array_slice(is_array($in['people'] ?? null) ? $in['people'] : [], 0, 50))))]; break;
        case 'link': $out += ['url' => $url('url'), 'site' => $t('site'), 'accessed' => $date('accessed')]; break;
        case 'task': $out += ['due' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($in['due'] ?? '')) ? (string) $in['due'] : '', 'done' => !empty($in['done']) ? 1 : 0, 'priority' => in_array($in['priority'] ?? '', ['haute', 'normale', 'basse'], true) ? $in['priority'] : 'normale']; break;
        case 'draft': $out += ['text' => $long('text', 2000000), 'target' => max(0, min(1000000, safe_int($in['target'] ?? 0))), 'stage' => in_array($in['stage'] ?? '', ['idee', 'plan', 'premier_jet', 'relu', 'fini'], true) ? $in['stage'] : 'idee']; break;
        case 'note': default: $out += ['text' => $long('text', 200000)];
    }
    return $out;
}

function save_atelier_item(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $old = $id ? atelier_item_row($pdo, $id) : null;
    $projectId = $old ? (int) $old['project_id'] : (int) atelier_project_row($pdo, safe_int($data['project_id'] ?? 0))['id'];
    $type = $old ? (string) $old['type'] : (in_array($data['type'] ?? '', ATELIER_TYPES, true) ? (string) $data['type'] : 'note');
    $clean = atelier_clean_data($pdo, $type, is_array($data['data'] ?? null) ? $data['data'] : [], $projectId);
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 500);
    if ($title === '') { // un titre tiré du contenu, pour que rien ne soit « sans titre »
        $title = match ($type) {
            'quote' => '« ' . mb_substr(preg_replace('/\s+/u', ' ', (string) $clean['text']), 0, 80) . (mb_strlen((string) $clean['text']) > 80 ? '…' : '') . ' »',
            'note', 'draft' => mb_substr(preg_replace('/\s+/u', ' ', (string) $clean['text']), 0, 80),
            'person' => (string) $clean['name'],
            'place' => (string) $clean['place']['text'],
            'link' => (string) $clean['url'],
            default => '',
        };
        if ($type === 'person' && $title === '' && $clean['person_id']) { $p = collection_people($pdo, [$clean['person_id']])[$clean['person_id']] ?? null; $title = $p ? trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? '')) : ''; }
        if (trim($title, ' «»') === '') { throw new RuntimeException('Donne un titre à cet élément.'); }
    }
    $tags = array_values(array_unique(array_filter(array_map(static fn($t) => mb_substr(trim(safe_text(is_scalar($t) ? (string) $t : '')), 0, 60), array_slice(is_array($data['tags'] ?? null) ? $data['tags'] : [], 0, 60)), static fn($t) => $t !== '')));
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE);
    if ($old) {
        $pdo->prepare('UPDATE atelier_items SET title=?, data_json=?, tags_json=?, starred=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$title, $json, json_encode($tags, JSON_UNESCAPED_UNICODE), array_key_exists('starred', $data) ? (!empty($data['starred']) ? 1 : 0) : (int) $old['starred'], $id]);
    } else {
        $pdo->prepare('INSERT INTO atelier_items(project_id, type, title, data_json, tags_json, starred) VALUES(?,?,?,?,?,?)')->execute([$projectId, $type, $title, $json, json_encode($tags, JSON_UNESCAPED_UNICODE), !empty($data['starred']) ? 1 : 0]);
        $id = (int) $pdo->lastInsertId();
    }
    if (is_array($data['folder_ids'] ?? null)) { atelier_set_item_folders($pdo, $id, $projectId, $data['folder_ids']); }
    $pdo->prepare('UPDATE atelier_projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$projectId]);
    return ['id' => $id, 'title' => $title];
}

function atelier_set_item_folders(PDO $pdo, int $itemId, int $projectId, array $folderIds): void
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $folderIds))));
    $ok = [];
    if ($ids) { $s = $pdo->prepare('SELECT id FROM atelier_folders WHERE project_id=? AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'); $s->execute([$projectId, ...$ids]); $ok = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); }
    $pdo->prepare('DELETE FROM atelier_item_folders WHERE item_id=?')->execute([$itemId]);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO atelier_item_folders(item_id, folder_id, position) VALUES(?,?,(SELECT COALESCE(max(position),0)+1 FROM atelier_item_folders WHERE folder_id=?))');
    foreach ($ok as $fid) { $ins->execute([$itemId, $fid, $fid]); }
}

/**
 * Ranger plusieurs éléments d'un coup (glisser-déposer, sélection) : add = ajouter au dossier, move = l'ôter du dossier $from et le mettre dans $folder,
 * remove = l'ôter du dossier ; trash / restore / delete = corbeille ; star / unstar ; tag / untag.
 */
function atelier_items_action(PDO $pdo, array $data): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', array_slice(is_array($data['ids'] ?? null) ? $data['ids'] : [], 0, 5000)))));
    if (!$ids) { return ['count' => 0]; }
    $projectId = (int) atelier_project_row($pdo, safe_int($data['project_id'] ?? 0))['id'];
    $s = $pdo->prepare('SELECT id FROM atelier_items WHERE project_id=? AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'); $s->execute([$projectId, ...$ids]);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    $in = $ids ? implode(',', $ids) : '0';
    $folder = safe_int($data['folder_id'] ?? 0);
    if ($folder && (int) atelier_folder_row($pdo, $folder)['project_id'] !== $projectId) { throw new RuntimeException('Ce dossier n’est pas dans ce projet.'); }
    $action = (string) ($data['action'] ?? '');
    switch ($action) {
        case 'move': $from = safe_int($data['from'] ?? 0);
            if ($from && (int) atelier_folder_row($pdo, $from)['project_id'] === $projectId) {
                $froms = [$from];
                if (!empty($data['from_deep'])) { for ($level = [$from]; $level; ) { $level = array_map('intval', $pdo->query('SELECT id FROM atelier_folders WHERE parent_id IN (' . implode(',', $level) . ')')->fetchAll(PDO::FETCH_COLUMN)); $froms = array_merge($froms, $level); } }
                $froms = array_diff($froms, [$folder]);
                if ($froms) { $pdo->exec('DELETE FROM atelier_item_folders WHERE folder_id IN (' . implode(',', $froms) . ") AND item_id IN ($in)"); }
            }
            // fallthrough
        case 'add': if (!$folder) { break; }
            $ins = $pdo->prepare('INSERT OR IGNORE INTO atelier_item_folders(item_id, folder_id, position) VALUES(?,?,(SELECT COALESCE(max(position),0)+1 FROM atelier_item_folders WHERE folder_id=?))');
            foreach ($ids as $id) { $ins->execute([$id, $folder, $folder]); }
            $pdo->exec("UPDATE atelier_items SET trashed=0 WHERE id IN ($in)");
            break;
        case 'unfile': $pdo->exec("DELETE FROM atelier_item_folders WHERE item_id IN ($in)"); break;
        case 'remove': if ($folder) { $pdo->prepare("DELETE FROM atelier_item_folders WHERE folder_id=? AND item_id IN ($in)")->execute([$folder]); } break;
        case 'trash': $pdo->exec("UPDATE atelier_items SET trashed=1, updated_at=CURRENT_TIMESTAMP WHERE id IN ($in)"); break;
        case 'restore': $pdo->exec("UPDATE atelier_items SET trashed=0, updated_at=CURRENT_TIMESTAMP WHERE id IN ($in)"); break;
        case 'star': case 'unstar': $pdo->exec('UPDATE atelier_items SET starred=' . ($action === 'star' ? 1 : 0) . " WHERE id IN ($in)"); break;
        case 'tag': case 'untag':
            $tag = mb_substr(trim(safe_text($data['tag'] ?? '')), 0, 60);
            if ($tag === '') { break; }
            $upd = $pdo->prepare('UPDATE atelier_items SET tags_json=? WHERE id=?');
            foreach ($pdo->query("SELECT id, tags_json FROM atelier_items WHERE id IN ($in)") as $r) {
                $tags = json_decode((string) $r['tags_json'], true) ?: [];
                $tags = $action === 'tag' ? array_values(array_unique([...$tags, $tag])) : array_values(array_filter($tags, static fn($t) => $t !== $tag));
                $upd->execute([json_encode($tags, JSON_UNESCAPED_UNICODE), (int) $r['id']]);
            }
            break;
        case 'delete': // seulement depuis la corbeille
            $gone = array_map('intval', $pdo->query("SELECT id FROM atelier_items WHERE trashed=1 AND id IN ($in)")->fetchAll(PDO::FETCH_COLUMN));
            foreach ($gone as $id) { heritage_delete_media_links($pdo, 'atelier_item', $id); }
            if ($gone) { $g = implode(',', $gone); $pdo->exec("DELETE FROM atelier_item_folders WHERE item_id IN ($g)"); $pdo->exec("DELETE FROM atelier_items WHERE id IN ($g)"); }
            return ['count' => count($gone)];
        default: throw new RuntimeException('Action inconnue.');
    }
    $pdo->prepare('UPDATE atelier_projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$projectId]);
    return ['count' => count($ids)];
}

/** Renommer une étiquette partout dans le projet (ou la supprimer si le nouveau nom est vide). */
function atelier_rename_tag(PDO $pdo, array $data): array
{
    $projectId = (int) atelier_project_row($pdo, safe_int($data['project_id'] ?? 0))['id'];
    $from = (string) ($data['from'] ?? ''); $to = mb_substr(trim(safe_text($data['to'] ?? '')), 0, 60);
    $upd = $pdo->prepare('UPDATE atelier_items SET tags_json=? WHERE id=?'); $n = 0;
    $s = $pdo->prepare('SELECT id, tags_json FROM atelier_items WHERE project_id=?'); $s->execute([$projectId]);
    foreach ($s->fetchAll() as $r) {
        $tags = json_decode((string) $r['tags_json'], true) ?: [];
        if (!in_array($from, $tags, true)) { continue; }
        $tags = array_values(array_unique(array_filter(array_map(static fn($t) => $t === $from ? $to : $t, $tags), static fn($t) => $t !== '')));
        $upd->execute([json_encode($tags, JSON_UNESCAPED_UNICODE), (int) $r['id']]); $n++;
    }
    return ['count' => $n];
}

/* ─── Import de références (.bib, .ris), depuis n'importe quel gestionnaire de bibliographie ─── */

function atelier_import(PDO $pdo, array $data): array
{
    $projectId = (int) atelier_project_row($pdo, safe_int($data['project_id'] ?? 0))['id'];
    $folder = safe_int($data['folder_id'] ?? 0);
    $text = (string) ($data['text'] ?? '');
    if (strlen($text) > 20000000) { throw new RuntimeException('Fichier trop gros.'); }
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
    $refs = preg_match('/^\s*TY\s{2}-/m', $text) ? atelier_parse_ris($text) : atelier_parse_bibtex($text);
    if (!$refs) { throw new RuntimeException('Aucune référence reconnue : le fichier doit être au format BibTeX (.bib) ou RIS (.ris).'); }
    $n = 0;
    foreach (array_slice($refs, 0, 5000) as $r) {
        $title = $r['title'] ?: 'Sans titre';
        unset($r['title']);
        $tags = $r['tags'] ?? []; unset($r['tags']);
        save_atelier_item($pdo, ['project_id' => $projectId, 'type' => 'reference', 'title' => $title, 'data' => $r, 'tags' => $tags, 'folder_ids' => $folder ? [$folder] : []]);
        $n++;
    }
    return ['count' => $n];
}

function atelier_split_name(string $n): array
{
    $n = trim($n);
    if (str_contains($n, ',')) { [$last, $first] = array_map('trim', explode(',', $n, 2)); return ['last' => $last, 'first' => $first]; }
    $parts = preg_split('/\s+/u', $n);
    $last = array_pop($parts);
    return ['last' => (string) $last, 'first' => implode(' ', $parts)];
}

/** Texte BibTeX → texte normal : accents LaTeX ({\'e}, \`a, \c{c}…), caractères protégés, commandes de mise en forme. */
function atelier_unlatex(string $v): string
{
    $acc = ["'" => "\u{0301}", '`' => "\u{0300}", '^' => "\u{0302}", '"' => "\u{0308}", '~' => "\u{0303}", 'c' => "\u{0327}", '=' => "\u{0304}", '.' => "\u{0307}", 'u' => "\u{0306}", 'v' => "\u{030C}", 'H' => "\u{030B}", 'k' => "\u{0328}", 'r' => "\u{030A}"];
    $v = preg_replace_callback('/\\\\([\'`^"~=.]|[cuvHkr](?=[\s{]))\s*\{?\s*\\\\?([A-Za-z])\}?/', static fn($m) => class_exists('Normalizer') ? (\Normalizer::normalize($m[2] . $acc[$m[1]], \Normalizer::FORM_C) ?: $m[2]) : $m[2] . $acc[$m[1]], $v) ?? $v;
    $v = strtr($v, ['\\oe ' => 'œ', '\\OE ' => 'Œ', '\\ae ' => 'æ', '\\oe' => 'œ', '\\OE' => 'Œ', '\\ae' => 'æ', '\\AE' => 'Æ', '\\ss' => 'ß', '\\o ' => 'ø', '\\&' => '&', '\\%' => '%', '\\_' => '_', '\\#' => '#', '\\$' => '$', '---' => '—', '--' => '–', '~' => ' ', '\\,' => ' ']);
    $v = preg_replace('/\\\\(?:textit|emph|textbf|textsc|textrm|textsuperscript|mkbibquote|enquote)\s*/', '', $v) ?? $v;
    return trim(preg_replace('/\s+/u', ' ', str_replace(['{', '}'], '', $v)) ?? '');
}

function atelier_parse_bibtex(string $text): array
{
    $out = [];
    $kinds = ['book' => 'livre', 'article' => 'article', 'incollection' => 'chapitre', 'inbook' => 'chapitre', 'inproceedings' => 'chapitre', 'conference' => 'chapitre', 'proceedings' => 'livre', 'collection' => 'livre', 'phdthesis' => 'these', 'mastersthesis' => 'these', 'thesis' => 'these', 'online' => 'web', 'misc' => 'autre', 'manuscript' => 'archive', 'artwork' => 'image', 'image' => 'image', 'periodical' => 'presse'];
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    $len = strlen($text); $at = 0;
    while (preg_match('/@(\w+)\s*[{(]/u', $text, $m, PREG_OFFSET_CAPTURE, $at)) {
        $open = $m[0][1] + strlen($m[0][0]);
        $depth = 1; $i = $open;
        while ($i < $len && $depth > 0) { $c = $text[$i]; if ($c === '{' || $c === '(') { $depth++; } elseif ($c === '}' || $c === ')') { $depth--; } $i++; }
        $at = $i;
        $type = strtolower($m[1][0]);
        if (in_array($type, ['comment', 'preamble', 'string'], true)) { continue; }
        $inner = substr($text, $open, $i - $open - 1);
        $comma = strpos($inner, ',');
        if ($comma === false) { continue; }
        $body = substr($inner, $comma + 1);
        $f = [];
        $pos = 0; $blen = strlen($body);
        while (preg_match('/\G\s*,?\s*([\w-]+)\s*=\s*/u', $body, $fm, 0, $pos)) {
            $pos += strlen($fm[0]); $name = strtolower($fm[1]); $val = '';
            if ($pos < $blen && $body[$pos] === '{') { $d = 0; $j = $pos; do { if ($body[$j] === '{') { $d++; } elseif ($body[$j] === '}') { $d--; } $j++; } while ($j < $blen && $d > 0); $val = substr($body, $pos + 1, $j - $pos - 2); $pos = $j; }
            elseif ($pos < $blen && $body[$pos] === '"') { $j = $pos + 1; while ($j < $blen && ($body[$j] !== '"' || $body[$j - 1] === '\\')) { $j++; } $val = substr($body, $pos + 1, $j - $pos - 1); $pos = $j + 1; }
            else { preg_match('/\G[^,]*/', $body, $vm, 0, $pos); $val = $vm[0]; $pos += strlen($vm[0]); }
            $f[$name] = atelier_unlatex($val);
        }
        $creators = [];
        foreach (['author' => 'auteur', 'editor' => 'dir', 'translator' => 'trad'] as $key => $role) {
            if (!empty($f[$key])) { foreach (preg_split('/\s+and\s+/i', $f[$key]) as $n) { if (trim($n) !== '') { $creators[] = atelier_split_name($n) + ['role' => $role]; } } }
        }
        $out[] = ['title' => $f['title'] ?? '', 'kind' => $kinds[$type] ?? 'autre', 'creators' => $creators, 'year' => $f['year'] ?? substr($f['date'] ?? '', 0, 4), 'date' => $f['date'] ?? '',
            'container' => $f['journal'] ?? $f['journaltitle'] ?? $f['booktitle'] ?? '', 'publisher' => $f['publisher'] ?? $f['school'] ?? $f['institution'] ?? '', 'place' => $f['address'] ?? $f['location'] ?? '',
            'volume' => $f['volume'] ?? '', 'issue' => $f['number'] ?? $f['issue'] ?? '', 'pages' => $f['pages'] ?? '', 'isbn' => $f['isbn'] ?? '', 'doi' => $f['doi'] ?? '', 'url' => $f['url'] ?? '',
            'edition' => $f['edition'] ?? '', 'language' => $f['language'] ?? $f['langid'] ?? '', 'abstract' => $f['abstract'] ?? '', 'notes' => $f['note'] ?? $f['annote'] ?? '',
            'tags' => !empty($f['keywords']) ? array_map('trim', preg_split('/[,;]/', $f['keywords'])) : []];
    }
    return $out;
}

function atelier_parse_ris(string $text): array
{
    $kinds = ['BOOK' => 'livre', 'JOUR' => 'article', 'MGZN' => 'article', 'CHAP' => 'chapitre', 'THES' => 'these', 'ELEC' => 'web', 'WEB' => 'web', 'NEWS' => 'presse', 'ART' => 'image', 'MANSCPT' => 'archive', 'UNPB' => 'archive', 'MAP' => 'image'];
    $out = []; $cur = null;
    foreach (preg_split('/\r\n|\r|\n/', $text) as $line) {
        if (!preg_match('/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/', $line, $m)) { continue; }
        [$tag, $val] = [$m[1], trim($m[2])];
        if ($tag === 'TY') { $cur = ['title' => '', 'kind' => $kinds[$val] ?? 'autre', 'creators' => [], 'tags' => [], 'notes' => '']; continue; }
        if ($cur === null) { continue; }
        if ($tag === 'ER') { $out[] = $cur; $cur = null; continue; }
        match ($tag) {
            'TI', 'T1' => $cur['title'] = $val,
            'AU', 'A1' => $cur['creators'][] = atelier_split_name($val) + ['role' => 'auteur'],
            'A4' => $cur['creators'][] = atelier_split_name($val) + ['role' => 'trad'],
            'A3' => $cur['creators'][] = atelier_split_name($val) + ['role' => 'editeur'],
            'ED', 'A2' => $cur['creators'][] = atelier_split_name($val) + ['role' => 'dir'],
            'PY', 'Y1', 'DA' => $cur['year'] = ($cur['year'] ?? '') ?: substr($val, 0, 4),
            'T2', 'JO', 'JF', 'BT' => $cur['container'] = ($cur['container'] ?? '') ?: $val,
            'PB' => $cur['publisher'] = $val, 'CY' => $cur['place'] = $val, 'VL' => $cur['volume'] = $val, 'IS' => $cur['issue'] = $val,
            'SP' => $cur['pages'] = $val . ($cur['pages'] ?? ''), 'EP' => $cur['pages'] = ($cur['pages'] ?? '') . '–' . $val,
            'SN' => $cur['isbn'] = $val, 'DO' => $cur['doi'] = $val, 'UR' => $cur['url'] = $val, 'AB' => $cur['abstract'] = $val, 'LA' => $cur['language'] = $val,
            'KW' => $cur['tags'][] = $val, 'N1' => $cur['notes'] = trim($cur['notes'] . "\n" . $val), 'AN', 'CN' => $cur['call_number'] = $val, 'AV' => $cur['archive'] = $val,
            default => null,
        };
    }
    return $out;
}
