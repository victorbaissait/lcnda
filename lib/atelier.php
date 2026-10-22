<?php
declare(strict_types=1);

/*
 * 📚 Atelier de recherche (onglet Listes) : des projets d'écriture ou de recherche (thèse, livre, article, exposition…),
 * chacun avec ses dossiers imbriqués sans limite, et ses éléments : références (livres, articles, archives, gravures…),
 * notes, citations, images, personnes (de la base ou non), lieux, dates, liens, tâches, brouillons.
 * Un élément peut être rangé dans plusieurs dossiers. Structure n°24 (tables atelier_*). Écran : assets/js/heritage-research.js.
 */

const ATELIER_KINDS = ['these' => 'Thèse', 'livre' => 'Livre', 'article' => 'Article', 'memoire' => 'Mémoire', 'exposition' => 'Exposition', 'enquete' => 'Enquête', 'autre' => 'Autre'];
const ATELIER_TYPES = ['reference', 'note', 'quote', 'media', 'person', 'place', 'event', 'link', 'task', 'draft', 'custom', 'app'];
/** « Venant du logiciel » : ce que l'élément montre (une fiche, un bloc d'une fiche, la fiche d'un village, une liste, un recueil…). */
const ATELIER_APP_KINDS = ['person', 'person_block', 'village', 'list', 'recueil', 'investigation', 'battue', 'media', 'atelier_project', 'workbook']; // workbook : 🧮 un classeur du tableur
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
        FROM atelier_projects p ORDER BY p.status IN ('archived','done'), p.status='paused', p.position, p.id")->fetchAll();
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
        in_array($data['status'] ?? '', ['active', 'paused', 'done'], true) ? (string) $data['status'] : (($data['status'] ?? '') === 'archived' ? 'done' : 'active')];
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
        foreach ((array) ($r['data']['pkeys'] ?? []) as $k) { foreach ((array) ($r['data']['values'][$k] ?? []) as $pid) { $pids[] = (int) $pid; } }
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
        case 'custom': // sorte d'élément créée dans Maintenance → Atelier : ses champs sont décrits là, les valeurs arrivent ici
            $vals = [];
            $pkeys = array_values(array_filter(array_map(static fn($k) => preg_replace('/[^a-z0-9_]/', '', strtolower((string) $k)), array_slice(is_array($in['pkeys'] ?? null) ? $in['pkeys'] : [], 0, 40))));
            foreach (array_slice(is_array($in['values'] ?? null) ? $in['values'] : [], 0, 80, true) as $k => $v) {
                $k = preg_replace('/[^a-z0-9_]/', '', strtolower((string) $k));
                if ($k === '') { continue; }
                if (in_array($k, $pkeys, true)) { $vals[$k] = is_array($v) ? array_values(array_filter(array_map($person, array_slice($v, 0, 50)))) : $person($v); continue; }
                if (is_array($v)) { $vals[$k] = $place($v); continue; }
                $vals[$k] = is_bool($v) ? ($v ? 1 : 0) : (is_int($v) || is_float($v) ? $v : mb_substr(trim((string) $v), 0, 40000));
            }
            $out += ['ctype' => preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($in['ctype'] ?? ''))) ?: 'perso', 'values' => $vals, 'pkeys' => $pkeys];
            break;
        case 'app': $out += ['kind' => in_array($in['kind'] ?? '', ATELIER_APP_KINDS, true) ? (string) $in['kind'] : 'person', 'key' => $t('key', 200), 'sub' => $t('sub', 200), 'label' => $t('label', 300), 'extra' => $t('extra', 300),
            'page_from' => max(0, safe_int($in['page_from'] ?? 0)), 'page_to' => max(0, safe_int($in['page_to'] ?? 0))]; break;
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
            'custom' => (string) (array_values(array_filter($clean['values'], static fn($v) => is_string($v) && trim($v) !== ''))[0] ?? ''),
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

/**
 * Import : dans un projet (dans le dossier ouvert), ou comme nouveau projet. Formats : Zotero RDF (avec ses collections
 * et sous-collections devenues dossiers, ses notes), CSL JSON (Zotero, Mendeley…), EndNote XML, BibTeX (.bib), RIS (.ris).
 */
function atelier_import(PDO $pdo, array $data): array
{
    $text = (string) ($data['text'] ?? '');
    if (strlen($text) > 50000000) { throw new RuntimeException('Fichier trop gros.'); }
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
    if (str_contains(substr($text, 0, 200), 'lcnda-atelier-projet')) { $doc = json_decode($text, true); if (is_array($doc) && ($doc['type'] ?? '') === 'lcnda-atelier-projet') { return atelier_import_full($pdo, $doc, $data); } }
    $parsed = atelier_parse_any($text);
    if (!$parsed['refs'] && !$parsed['notes'] && !$parsed['collections']) { throw new RuntimeException('Rien de reconnu : le fichier doit être un export Zotero RDF (.rdf), CSL JSON (.json), EndNote XML (.xml), BibTeX (.bib) ou RIS (.ris).'); }
    $newProject = is_array($data['new_project'] ?? null) ? $data['new_project'] : null;
    if ($newProject) {
        $projectId = save_atelier_project($pdo, ['title' => ($newProject['title'] ?? '') ?: ($parsed['title'] ?: 'Projet importé'), 'kind' => $newProject['kind'] ?? 'autre', 'icon' => $newProject['icon'] ?? '', 'description' => $newProject['description'] ?? ''])['id'];
        $folder = 0;
        // une seule collection de départ : elle devient le projet, ses sous-collections les dossiers
        if (!empty($parsed['root'])) {
            $root = $parsed['root'];
            foreach ($parsed['collections'] as $k => &$c) { if ($c['parent'] === $root) { $c['parent'] = null; } }
            unset($c);
            unset($parsed['collections'][$root]); // ce qui était directement dedans va dans « Non classés »
        }
    } else {
        $projectId = (int) atelier_project_row($pdo, safe_int($data['project_id'] ?? 0))['id'];
        $folder = safe_int($data['folder_id'] ?? 0);
        if ($folder && (int) atelier_folder_row($pdo, $folder)['project_id'] !== $projectId) { $folder = 0; }
    }
    // api.php enregistre tout dans une seule transaction : une erreur annule l'import entier
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        // collections → dossiers (parents d'abord)
        $folderOf = []; $pending = $parsed['collections']; $guard = 0;
        while ($pending && $guard++ < 50) {
            foreach ($pending as $key => $c) {
                $parent = $c['parent'] ?? null;
                if ($parent !== null && !isset($folderOf[$parent]) && isset($parsed['collections'][$parent])) { continue; }
                $parentId = $parent !== null && isset($folderOf[$parent]) ? $folderOf[$parent] : $folder;
                $folderOf[$key] = save_atelier_folder($pdo, ['project_id' => $projectId, 'parent_id' => $parentId, 'name' => mb_substr($c['name'] ?: 'Collection', 0, 200)])['id'];
                unset($pending[$key]);
            }
        }
        $inFolders = [];
        foreach ($parsed['collections'] as $key => $c) { foreach ($c['items'] as $ik) { $inFolders[$ik][] = $folderOf[$key] ?? null; } }
        $foldersFor = static fn(?string $k): array => array_values(array_filter($k !== null && isset($inFolders[$k]) ? $inFolders[$k] : [])) ?: ($folder ? [$folder] : []);
        $n = 0; $notes = 0; $links = 0;
        foreach (array_slice($parsed['refs'], 0, 20000) as $r) {
            $key = $r['_key'] ?? null; $attached = $r['_notes'] ?? []; $atts = $r['_links'] ?? [];
            $title = $r['title'] ?: 'Sans titre';
            $tags = $r['tags'] ?? [];
            unset($r['title'], $r['tags'], $r['_key'], $r['_notes'], $r['_links']);
            $fids = $foldersFor($key);
            $id = save_atelier_item($pdo, ['project_id' => $projectId, 'type' => 'reference', 'title' => $title, 'data' => $r, 'tags' => $tags, 'folder_ids' => $fids])['id'];
            $n++;
            foreach ($attached as $nt) { if (trim($nt) === '') { continue; } save_atelier_item($pdo, ['project_id' => $projectId, 'type' => 'note', 'title' => atelier_note_title($nt), 'data' => ['text' => $nt, 'related' => [$id]], 'tags' => [], 'folder_ids' => $fids]); $notes++; }
            foreach ($atts as $a) { if (!preg_match('#^https?://#i', $a['url'] ?? '')) { continue; } save_atelier_item($pdo, ['project_id' => $projectId, 'type' => 'link', 'title' => $a['title'] ?: $a['url'], 'data' => ['url' => $a['url'], 'related' => [$id]], 'folder_ids' => $fids]); $links++; }
        }
        foreach ($parsed['notes'] as $key => $nt) { // notes seules
            if (trim($nt) === '') { continue; }
            save_atelier_item($pdo, ['project_id' => $projectId, 'type' => 'note', 'title' => atelier_note_title($nt), 'data' => ['text' => $nt], 'folder_ids' => $foldersFor((string) $key)]); $notes++;
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); if ($newProject) { delete_atelier_project($pdo, ['id' => $projectId]); } } throw $e; }
    return ['count' => $n, 'notes' => $notes, 'links' => $links, 'folders' => count($folderOf), 'files_skipped' => $parsed['files'] ?? 0, 'format' => $parsed['format'], 'project_id' => $projectId];
}

function atelier_note_title(string $t): string
{
    $t = trim(preg_replace('/\s+/u', ' ', $t) ?? '');
    return mb_strlen($t) > 80 ? mb_substr($t, 0, 80) . '…' : ($t ?: 'Note');
}

/** HTML d'une note (Zotero) → texte simple avec ses retours à la ligne. */
function atelier_html_text(string $html): string
{
    $html = preg_replace('#<(br|/p|/div|/li|/h\d)[^>]*>#i', "\n", $html) ?? $html;
    $html = preg_replace('#<li[^>]*>#i', '• ', $html) ?? $html;
    return trim(preg_replace("/\n{3,}/", "\n\n", html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
}

function atelier_parse_any(string $text): array
{
    $t = ltrim($text);
    $empty = ['refs' => [], 'notes' => [], 'collections' => [], 'title' => '', 'format' => '', 'files' => 0];
    if (str_starts_with($t, '<') && str_contains($t, 'rdf:RDF')) { return ['format' => 'Zotero RDF'] + atelier_parse_zotero_rdf($text) + $empty; }
    if (str_starts_with($t, '<') && preg_match('/<records?\b/i', $t)) { return ['format' => 'EndNote XML', 'refs' => atelier_parse_endnote($text)] + $empty; }
    if (str_starts_with($t, '[') || str_starts_with($t, '{')) { return ['format' => 'CSL JSON', 'refs' => atelier_parse_csl($text)] + $empty; }
    if (preg_match('/^\s*TY\s{2}-/m', $text)) { return ['format' => 'RIS', 'refs' => atelier_parse_ris($text)] + $empty; }
    return ['format' => 'BibTeX', 'refs' => atelier_parse_bibtex($text)] + $empty;
}

const ATELIER_ZOTERO_KINDS = ['book' => 'livre', 'bookSection' => 'chapitre', 'journalArticle' => 'article', 'magazineArticle' => 'article', 'newspaperArticle' => 'presse', 'thesis' => 'these',
    'manuscript' => 'archive', 'letter' => 'archive', 'document' => 'autre', 'webpage' => 'web', 'blogPost' => 'web', 'forumPost' => 'web', 'artwork' => 'image', 'map' => 'image', 'conferencePaper' => 'chapitre',
    'encyclopediaArticle' => 'chapitre', 'dictionaryEntry' => 'chapitre', 'report' => 'livre', 'film' => 'objet', 'interview' => 'archive', 'case' => 'archive', 'statute' => 'archive', 'patent' => 'archive'];

function atelier_parse_zotero_rdf(string $xml): array
{
    $doc = new DOMDocument();
    if (!@$doc->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) { throw new RuntimeException('Fichier Zotero RDF illisible.'); }
    $xp = new DOMXPath($doc);
    foreach (['rdf' => 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'z' => 'http://www.zotero.org/namespaces/export#', 'dc' => 'http://purl.org/dc/elements/1.1/', 'dcterms' => 'http://purl.org/dc/terms/',
        'bib' => 'http://purl.org/net/biblio#', 'foaf' => 'http://xmlns.com/foaf/0.1/', 'vcard' => 'http://nwalsh.com/rdf/vCard#', 'prism' => 'http://prismstandard.org/namespaces/1.2/basic/', 'link' => 'http://purl.org/rss/1.0/modules/link/'] as $p => $u) { $xp->registerNamespace($p, $u); }
    $RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    $str = static fn(string $q, DOMNode $n): string => trim(preg_replace('/\s+/u', ' ', (string) $xp->evaluate("string($q)", $n)) ?? '');
    $root = $doc->documentElement;
    $nodes = []; $memos = []; $atts = []; $collections = []; $containers = []; $referenced = [];
    foreach ($root->childNodes as $n) {
        if (!$n instanceof DOMElement) { continue; }
        $about = $n->getAttributeNS($RDF, 'about');
        $type = $str('z:itemType', $n);
        if ($n->localName === 'Collection') {
            $parts = []; foreach ($xp->query('dcterms:hasPart', $n) as $h) { $parts[] = $h->getAttributeNS($RDF, 'resource'); }
            $collections[$about] = ['name' => $str('dc:title', $n), 'parts' => $parts];
        } elseif ($n->localName === 'Memo' || $type === 'note') { $memos[$about] = atelier_html_text((string) $xp->evaluate('string(rdf:value)', $n));
        } elseif ($n->localName === 'Attachment' || $type === 'attachment') { $atts[$about] = ['title' => $str('dc:title', $n), 'url' => $str('dc:identifier/dcterms:URI/rdf:value', $n), 'file' => $xp->query('rdf:resource', $n)->length > 0];
        } elseif ($type !== '') { $nodes[$about] = $n;
        } else { $t = $str('dc:title', $n); if ($t !== '' && $about !== '') { $containers[$about] = $n; } }
    }
    $refs = [];
    foreach ($nodes as $about => $n) {
        $type = $str('z:itemType', $n);
        $creators = [];
        foreach ($n->childNodes as $c) {
            if (!$c instanceof DOMElement) { continue; }
            $role = ['authors' => 'auteur', 'editors' => 'dir', 'seriesEditors' => 'dir', 'translators' => 'trad', 'artists' => 'graveur', 'cartographers' => 'auteur', 'contributors' => 'autre', 'bookAuthors' => 'dir', 'interviewers' => 'autre', 'directors' => 'auteur'][$c->localName] ?? null;
            if (!$role) { continue; }
            foreach ($xp->query('.//foaf:Person', $c) as $pe) { $last = $str('foaf:surname', $pe); $first = $str('foaf:givenName', $pe); if ($last === '' && $first === '') { $last = $str('foaf:name', $pe); } $creators[] = ['last' => $last, 'first' => $first, 'role' => $role]; }
        }
        $part = $xp->query('dcterms:isPartOf/*', $n)->item(0);
        if (!$part) { $res = $xp->query('dcterms:isPartOf', $n)->item(0); $r = $res instanceof DOMElement ? $res->getAttributeNS($RDF, 'resource') : ''; $part = $r !== '' ? ($containers[$r] ?? null) : null; }
        $ids = []; foreach ($xp->query('dc:identifier', $n) as $idn) { $ids[] = trim($idn->textContent); }
        if ($part) { foreach ($xp->query('dc:identifier', $part) as $idn) { $ids[] = trim($idn->textContent); } }
        $idOf = static function (string $prefix) use ($ids): string { foreach ($ids as $v) { if (stripos($v, $prefix . ' ') === 0) { return trim(substr($v, strlen($prefix))); } } return ''; };
        $tags = []; foreach ($xp->query('dc:subject', $n) as $sn) { if ($xp->query('dcterms:LCC|dcterms:DDC|dcterms:UDC', $sn)->length) { continue; } $v = trim($sn->textContent); if ($v !== '') { $tags[] = $v; } }
        $notes = []; foreach ($xp->query('dcterms:isReferencedBy', $n) as $rb) { $k = $rb->getAttributeNS($RDF, 'resource'); if (isset($memos[$k])) { $notes[] = $memos[$k]; $referenced[$k] = true; } }
        $links = []; $files = 0; foreach ($xp->query('link:link', $n) as $ln) { $a = $atts[$ln->getAttributeNS($RDF, 'resource')] ?? null; if (!$a) { continue; } if ($a['url'] !== '') { $links[] = $a; } elseif ($a['file']) { $files++; } }
        $extra = $str('dc:description', $n);
        $refs[] = ['_key' => $about, '_notes' => $notes, '_links' => $links, 'title' => $str('dc:title', $n), 'kind' => ATELIER_ZOTERO_KINDS[$type] ?? 'autre', 'creators' => $creators,
            'date' => $str('dc:date', $n), 'year' => preg_match('/\d{4}/', $str('dc:date', $n), $ym) ? $ym[0] : '',
            'container' => $part ? $str('dc:title', $part) : '', 'publisher' => $str('dc:publisher//foaf:name', $n), 'place' => $str('dc:publisher//vcard:locality', $n),
            'volume' => $str('prism:volume', $n) ?: ($part ? $str('prism:volume', $part) : ''), 'issue' => $str('prism:number', $n) ?: ($part ? $str('prism:number', $part) : ''),
            'pages' => str_replace('-', '–', $str('bib:pages', $n)) ?: $str('z:numPages', $n), 'edition' => $str('prism:edition', $n), 'isbn' => $idOf('ISBN'), 'doi' => $idOf('DOI'),
            'url' => $str('dc:identifier/dcterms:URI/rdf:value', $n), 'accessed' => $str('dcterms:dateSubmitted', $n), 'archive' => $str('z:archive', $n), 'call_number' => $str('dc:coverage', $n) ?: $str('dc:subject/dcterms:LCC/rdf:value', $n),
            'language' => $str('z:language', $n), 'abstract' => $str('dcterms:abstract', $n), 'technique' => $str('z:medium', $n), 'dimensions' => $str('z:artworkSize', $n),
            'notes' => $extra, 'tags' => array_values(array_unique($tags))];
        $atts['__files'] = ($atts['__files'] ?? 0) + $files;
    }
    // collections : parent = la collection qui la contient ; éléments = ce qui n'est pas une collection
    $out = []; $parentOf = [];
    foreach ($collections as $k => $c) { foreach ($c['parts'] as $p) { if (isset($collections[$p])) { $parentOf[$p] = $k; } } }
    foreach ($collections as $k => $c) { $out[$k] = ['name' => $c['name'], 'parent' => $parentOf[$k] ?? null, 'items' => array_values(array_filter($c['parts'], static fn($p) => !isset($collections[$p])))]; }
    $loose = array_diff_key($memos, $referenced);
    $roots = array_keys(array_filter($out, static fn($c) => $c['parent'] === null));
    return ['refs' => $refs, 'notes' => $loose, 'collections' => $out, 'files' => $atts['__files'] ?? 0, 'title' => count($roots) === 1 ? (string) $out[$roots[0]]['name'] : '', 'root' => count($roots) === 1 ? $roots[0] : null];
}

const ATELIER_CSL_KINDS = ['book' => 'livre', 'chapter' => 'chapitre', 'article-journal' => 'article', 'article-magazine' => 'article', 'article-newspaper' => 'presse', 'thesis' => 'these', 'manuscript' => 'archive',
    'webpage' => 'web', 'post-weblog' => 'web', 'post' => 'web', 'graphic' => 'image', 'map' => 'image', 'paper-conference' => 'chapitre', 'entry-encyclopedia' => 'chapitre', 'entry-dictionary' => 'chapitre', 'report' => 'livre', 'article' => 'article', 'personal_communication' => 'archive'];

function atelier_parse_csl(string $text): array
{
    $j = json_decode($text, true);
    if (!is_array($j)) { throw new RuntimeException('Fichier JSON illisible.'); }
    if (isset($j['items']) && is_array($j['items'])) { $j = $j['items']; }
    if (!array_is_list($j)) { $j = [$j]; }
    $refs = [];
    foreach ($j as $it) {
        if (!is_array($it) || !isset($it['title'])) { continue; }
        $s = static fn(string $k): string => is_scalar($it[$k] ?? null) ? trim((string) $it[$k]) : '';
        $creators = [];
        foreach (['author' => 'auteur', 'editor' => 'dir', 'container-author' => 'dir', 'translator' => 'trad', 'illustrator' => 'illustrateur'] as $k => $role) {
            foreach (is_array($it[$k] ?? null) ? $it[$k] : [] as $c) { if (is_array($c)) { $creators[] = ['last' => (string) ($c['family'] ?? $c['literal'] ?? ''), 'first' => (string) ($c['given'] ?? ''), 'role' => $role]; } }
        }
        $date = static function ($d): string { if (!is_array($d)) { return ''; } $p = $d['date-parts'][0] ?? null; if (is_array($p) && $p) { return implode('-', array_map(static fn($x) => str_pad((string) $x, 2, '0', STR_PAD_LEFT), $p)); } return (string) ($d['raw'] ?? $d['literal'] ?? ''); };
        $issued = $date($it['issued'] ?? null);
        $refs[] = ['title' => $s('title'), 'kind' => ATELIER_CSL_KINDS[$s('type')] ?? 'autre', 'creators' => $creators, 'date' => $issued, 'year' => preg_match('/\d{4}/', $issued, $m) ? $m[0] : '',
            'container' => $s('container-title'), 'publisher' => $s('publisher'), 'place' => $s('publisher-place'), 'volume' => $s('volume'), 'issue' => $s('issue'), 'pages' => str_replace('-', '–', $s('page')),
            'edition' => $s('edition'), 'isbn' => $s('ISBN'), 'doi' => $s('DOI'), 'url' => $s('URL'), 'accessed' => $date($it['accessed'] ?? null), 'archive' => $s('archive'), 'call_number' => $s('archive_location') ?: $s('call-number'),
            'language' => $s('language'), 'abstract' => $s('abstract'), 'notes' => $s('note'), 'technique' => $s('medium'), 'dimensions' => $s('dimensions'),
            'tags' => $s('keyword') !== '' ? array_map('trim', preg_split('/[,;]/', $s('keyword'))) : []];
    }
    return $refs;
}

const ATELIER_ENDNOTE_KINDS = ['Book' => 'livre', 'Edited Book' => 'livre', 'Book Section' => 'chapitre', 'Journal Article' => 'article', 'Magazine Article' => 'article', 'Newspaper Article' => 'presse', 'Thesis' => 'these',
    'Manuscript' => 'archive', 'Unpublished Work' => 'archive', 'Web Page' => 'web', 'Artwork' => 'image', 'Map' => 'image', 'Conference Paper' => 'chapitre', 'Conference Proceedings' => 'livre', 'Report' => 'livre'];

function atelier_parse_endnote(string $xml): array
{
    $doc = new DOMDocument();
    if (!@$doc->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) { throw new RuntimeException('Fichier EndNote XML illisible.'); }
    $xp = new DOMXPath($doc);
    $str = static fn(string $q, DOMNode $n): string => trim(preg_replace('/\s+/u', ' ', (string) $xp->evaluate("string($q)", $n)) ?? '');
    $refs = [];
    foreach ($xp->query('//record') as $r) {
        $creators = [];
        foreach (['contributors/authors/author' => 'auteur', 'contributors/secondary-authors/author' => 'dir', 'contributors/translated-authors/author' => 'trad', 'contributors/tertiary-authors/author' => 'dir'] as $q => $role) {
            foreach ($xp->query($q, $r) as $a) { $creators[] = atelier_split_name(trim($a->textContent)) + ['role' => $role]; }
        }
        $kw = []; foreach ($xp->query('keywords/keyword', $r) as $k) { $v = trim($k->textContent); if ($v !== '') { $kw[] = $v; } }
        $type = $xp->query('ref-type', $r)->item(0);
        $kind = $type instanceof DOMElement ? (ATELIER_ENDNOTE_KINDS[$type->getAttribute('name')] ?? 'autre') : 'autre';
        $year = $str('dates/year', $r);
        $refs[] = ['title' => $str('titles/title', $r), 'kind' => $kind, 'creators' => $creators, 'year' => $year, 'date' => $str('dates/pub-dates/date', $r) ?: $year,
            'container' => $str('titles/secondary-title', $r) ?: $str('periodical/full-title', $r), 'publisher' => $str('publisher', $r), 'place' => $str('pub-location', $r),
            'volume' => $str('volume', $r), 'issue' => $str('number', $r), 'pages' => str_replace('-', '–', $str('pages', $r)), 'edition' => $str('edition', $r), 'isbn' => $str('isbn', $r),
            'doi' => $str('electronic-resource-num', $r), 'url' => $str('urls/related-urls/url', $r), 'archive' => $str('archive-location', $r) ?: $str('remote-database-provider', $r), 'call_number' => $str('call-num', $r),
            'language' => $str('language', $r), 'abstract' => $str('abstract', $r), 'notes' => $str('notes', $r), 'tags' => $kw];
    }
    return $refs;
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

/**
 * Projet complet exporté par l'Atelier (« 💾 Projet complet ») : dossiers imbriqués, éléments, étiquettes, favoris,
 * liens entre éléments et citations reliées à leur référence (les numéros sont refaits). Les fichiers joints ne
 * voyagent pas dans ce fichier. Nouveau projet, ou dans un projet existant (dans le dossier choisi).
 */
function atelier_import_full(PDO $pdo, array $doc, array $data): array
{
    $proj = is_array($doc['project'] ?? null) ? $doc['project'] : [];
    $folders = array_slice(is_array($doc['folders'] ?? null) ? $doc['folders'] : [], 0, 5000);
    $items = array_slice(is_array($doc['items'] ?? null) ? $doc['items'] : [], 0, 20000);
    $newProject = is_array($data['new_project'] ?? null) ? $data['new_project'] : null;
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    $projectId = 0;
    try {
        if ($newProject) {
            $projectId = save_atelier_project($pdo, ['title' => ($newProject['title'] ?? '') ?: ($proj['title'] ?? 'Projet importé'), 'subtitle' => $proj['subtitle'] ?? '', 'kind' => $newProject['kind'] ?? ($proj['kind'] ?? 'autre'),
                'icon' => ($newProject['icon'] ?? '') ?: ($proj['icon'] ?? ''), 'color' => $proj['color'] ?? '', 'description' => ($newProject['description'] ?? '') ?: ($proj['description'] ?? ''),
                'target_words' => $proj['target_words'] ?? 0, 'deadline' => $proj['deadline'] ?? ''])['id'];
            $base = 0;
        } else {
            $projectId = (int) atelier_project_row($pdo, safe_int($data['project_id'] ?? 0))['id'];
            $base = safe_int($data['folder_id'] ?? 0);
            if ($base && (int) atelier_folder_row($pdo, $base)['project_id'] !== $projectId) { $base = 0; }
        }
        // dossiers (parents d'abord)
        $map = []; $pending = []; foreach ($folders as $f) { if (is_array($f) && isset($f['id'])) { $pending[(int) $f['id']] = $f; } }
        $guard = 0;
        while ($pending && $guard++ < 60) {
            foreach ($pending as $old => $f) {
                $parent = (int) ($f['parent_id'] ?? 0);
                if ($parent && isset($pending[$parent]) && !isset($map[$parent])) { continue; }
                $map[$old] = save_atelier_folder($pdo, ['project_id' => $projectId, 'parent_id' => $parent && isset($map[$parent]) ? $map[$parent] : $base, 'name' => mb_substr((string) ($f['name'] ?? 'Dossier'), 0, 200) ?: 'Dossier',
                    'icon' => $f['icon'] ?? ''])['id'];
                if (trim((string) ($f['notes'] ?? '')) !== '') { save_atelier_folder($pdo, ['id' => $map[$old], 'notes' => (string) $f['notes']]); }
                unset($pending[$old]);
            }
        }
        // éléments : d'abord sans liens (les numéros changent), puis les liens refaits
        $imap = []; $later = [];
        foreach ($items as $it) {
            if (!is_array($it) || !in_array($it['type'] ?? '', ATELIER_TYPES, true)) { continue; }
            $d = is_array($it['data'] ?? null) ? $it['data'] : [];
            $rel = $d['related'] ?? []; $src = $d['source_id'] ?? null; unset($d['related'], $d['source_id']);
            $fids = array_values(array_filter(array_map(static fn($f) => $map[(int) $f] ?? null, is_array($it['folders'] ?? null) ? $it['folders'] : []))) ?: ($base ? [$base] : []);
            $nid = save_atelier_item($pdo, ['project_id' => $projectId, 'type' => $it['type'], 'title' => (string) ($it['title'] ?? ''), 'data' => $d, 'tags' => $it['tags'] ?? [], 'starred' => !empty($it['starred']), 'folder_ids' => $fids])['id'];
            $imap[(int) ($it['id'] ?? 0)] = $nid;
            if ($rel || $src) { $later[] = [$nid, $it, $d, $rel, $src]; }
        }
        foreach ($later as [$nid, $it, $d, $rel, $src]) {
            $d['related'] = array_values(array_filter(array_map(static fn($r) => $imap[(int) $r] ?? null, is_array($rel) ? $rel : [])));
            if ($src) { $d['source_id'] = $imap[(int) $src] ?? null; }
            save_atelier_item($pdo, ['id' => $nid, 'title' => (string) ($it['title'] ?? ''), 'data' => $d, 'tags' => $it['tags'] ?? [], 'starred' => !empty($it['starred'])]);
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    return ['count' => count($imap), 'notes' => 0, 'links' => 0, 'folders' => count($map), 'files_skipped' => 0, 'format' => 'Projet de l’Atelier', 'project_id' => $projectId];
}
