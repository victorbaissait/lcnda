<?php
declare(strict_types=1);

/**
 * 🧩 Tableaux (Enquêtes → Tableaux, façon Freeform, structure n°36) : une toile libre où l'on pose formes, notes, textes,
 * traits et flèches, dessins à main levée, images, sons, vidéos, PDF, étiquettes, recueils, fiches et écrans de l'app,
 * widgets, et des dossiers (un dossier est un sous-tableau). Un tableau est libre, ou rangé dans une enquête, une battue
 * ou un projet de l'Atelier, avec un nom de « partie » pour en avoir plusieurs (piste 1, piste 2…).
 * Le contenu est dans boards.data_json ; thumb est une petite image du tableau pour les listes.
 * Résumés des listes « Enquêtes », « Battues », « Projets de l'Atelier » et « Tableaux » (Listes).
 */

const BOARD_OWNERS = ['' => 'Libre', 'investigation' => 'Enquête', 'battue' => 'Battue', 'atelier_project' => 'Atelier'];

function board_owner_label(PDO $pdo, string $type, int $id): string
{
    if ($type === '' || !$id) { return ''; }
    $table = ['investigation' => 'investigations', 'battue' => 'battues', 'atelier_project' => 'atelier_projects'][$type] ?? '';
    if ($table === '') { return ''; }
    try { $s = $pdo->prepare("SELECT title FROM $table WHERE id=?"); $s->execute([$id]); return (string) ($s->fetchColumn() ?: ''); } catch (Throwable) { return ''; }
}

function boards_list(PDO $pdo, array $q): array
{
    $where = ['parent_id IS NULL']; $params = [];
    $owner = (string) ($q['owner_type'] ?? 'all');
    if ($owner === 'free') { $where[] = "owner_type=''"; }
    elseif (isset(BOARD_OWNERS[$owner]) && $owner !== '') { $where[] = 'owner_type=?'; $params[] = $owner; if (safe_int($q['owner_id'] ?? 0)) { $where[] = 'owner_id=?'; $params[] = safe_int($q['owner_id']); } }
    if (in_array($q['status'] ?? '', ['open', 'paused', 'closed'], true)) { $where[] = 'status=?'; $params[] = (string) $q['status']; }
    if (trim((string) ($q['q'] ?? '')) !== '') { $where[] = '(title LIKE ? OR part LIKE ?)'; $params[] = '%' . trim((string) $q['q']) . '%'; $params[] = '%' . trim((string) $q['q']) . '%'; }
    $s = $pdo->prepare('SELECT id, title, icon, color, owner_type, owner_id, part, status, thumb, item_count, created_at, updated_at,
        (SELECT count(*) FROM boards c WHERE c.parent_id=boards.id) AS sub_count FROM boards WHERE ' . implode(' AND ', $where) . ' ORDER BY updated_at DESC, id DESC');
    $s->execute($params);
    $rows = $s->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; $r['owner_id'] = (int) $r['owner_id']; $r['item_count'] = (int) $r['item_count']; $r['owner_label'] = board_owner_label($pdo, (string) $r['owner_type'], (int) $r['owner_id']); $r['owner_kind'] = BOARD_OWNERS[$r['owner_type']] ?? ''; }
    unset($r);
    return $rows;
}

function board_detail(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM boards WHERE id=?'); $s->execute([$id]);
    $b = $s->fetch();
    if (!$b) { throw new RuntimeException('Tableau introuvable.'); }
    $data = json_decode((string) $b['data_json'], true) ?: ['items' => []];
    // médias posés sur le tableau : leurs fichiers et leur sorte
    $mids = [];
    foreach ($data['items'] ?? [] as $it) { if (!empty($it['media_id'])) { $mids[] = (int) $it['media_id']; } }
    $media = [];
    if ($mids) {
        $in = implode(',', array_map('intval', array_unique($mids)));
        foreach ($pdo->query("SELECT id, title, filename, thumbnail, media_type FROM media WHERE id IN ($in)") as $m) { $media[(int) $m['id']] = $m; }
    }
    // chemin : du tableau principal jusqu'à ce dossier
    $path = []; $cur = $b;
    for ($i = 0; $i < 20 && $cur && $cur['parent_id']; $i++) {
        $p = $pdo->prepare('SELECT id, title, parent_id FROM boards WHERE id=?'); $p->execute([(int) $cur['parent_id']]); $cur = $p->fetch();
        if ($cur) { array_unshift($path, ['id' => (int) $cur['id'], 'title' => (string) $cur['title']]); }
    }
    return ['id' => (int) $b['id'], 'title' => (string) $b['title'], 'icon' => (string) $b['icon'], 'color' => (string) $b['color'], 'owner_type' => (string) $b['owner_type'],
        'owner_id' => (int) $b['owner_id'], 'owner_label' => board_owner_label($pdo, (string) $b['owner_type'], (int) $b['owner_id']), 'part' => (string) $b['part'], 'status' => (string) ($b['status'] ?? 'open'),
        'parent_id' => $b['parent_id'] !== null ? (int) $b['parent_id'] : null, 'path' => $path, 'data' => $data, 'media' => $media, 'updated_at' => $b['updated_at']];
}

/** Garde ce qui est sûr dans un élément du tableau (les textes restent des textes, les adresses web sont vérifiées) */
function board_clean_item(array $it): ?array
{
    $types = ['shape', 'text', 'note', 'draw', 'line', 'media', 'webimage', 'link', 'tag', 'folder', 'recueil', 'widget', 'screen', 'person', 'weblink'];
    if (!in_array($it['type'] ?? '', $types, true)) { return null; }
    $num = static fn($v, $min = -1e6, $max = 1e6) => is_numeric($v) ? max($min, min($max, (float) $v)) : 0.0;
    $str = static fn($v, $n = 300) => mb_substr((string) ($v ?? ''), 0, $n);
    $color = static fn($v) => preg_match('/^(#[0-9a-f]{3,8}|transparent|rgba?\([\d.,\s%]+\))$/i', (string) ($v ?? '')) ? (string) $v : '';
    $url = static fn($v) => preg_match('~^https?://~i', (string) ($v ?? '')) ? mb_substr((string) $v, 0, 2000) : '';
    $out = ['id' => preg_replace('/[^a-z0-9_-]/i', '', (string) ($it['id'] ?? '')) ?: bin2hex(random_bytes(5)), 'type' => $it['type'],
        'x' => $num($it['x'] ?? 0), 'y' => $num($it['y'] ?? 0), 'w' => $num($it['w'] ?? 120, 4, 20000), 'h' => $num($it['h'] ?? 80, 4, 20000), 'rot' => $num($it['rot'] ?? 0, -360, 360),
        'z' => (int) $num($it['z'] ?? 0, -1e6, 1e6), 'locked' => !empty($it['locked']), 'group' => preg_replace('/[^a-z0-9_-]/i', '', (string) ($it['group'] ?? ''))];
    foreach (['fill', 'stroke', 'color', 'bg'] as $k) { if (isset($it[$k])) { $out[$k] = $color($it[$k]); } }
    foreach (['sw' => [0, 60], 'fs' => [6, 400], 'opacity' => [0, 1], 'radius' => [0, 400], 'vw' => [0.1, 1e6], 'vh' => [0.1, 1e6]] as $k => [$a, $z]) { if (isset($it[$k])) { $out[$k] = $num($it[$k], $a, $z); } }
    foreach (['shape' => 40, 'text' => 20000, 'title' => 300, 'font' => 80, 'align' => 10, 'brush' => 20, 'dash' => 20, 'target' => 400, 'label' => 200, 'kind' => 40, 'part' => 120, 'note' => 2000] as $k => $n) { if (isset($it[$k])) { $out[$k] = $str($it[$k], $n); } }
    foreach (['bold', 'italic', 'arrowStart', 'arrowEnd', 'curved', 'preview', 'collapsed'] as $k) { if (isset($it[$k])) { $out[$k] = !empty($it[$k]); } }
    foreach (['media_id', 'board_id', 'recueil_id', 'label_id', 'person_id'] as $k) { if (isset($it[$k])) { $out[$k] = max(0, (int) $it[$k]); } }
    if (isset($it['url'])) { $out['url'] = $url($it['url']); }
    if (isset($it['from'])) { $out['from'] = preg_replace('/[^a-z0-9_-]/i', '', (string) $it['from']); }
    if (isset($it['to'])) { $out['to'] = preg_replace('/[^a-z0-9_-]/i', '', (string) $it['to']); }
    if (isset($it['points']) && is_array($it['points'])) {
        $out['points'] = array_values(array_map(static fn($p) => [round($num($p[0] ?? 0), 1), round($num($p[1] ?? 0), 1)], array_slice(array_filter($it['points'], 'is_array'), 0, 5000)));
    }
    return $out;
}

function save_board(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $owner = (string) ($data['owner_type'] ?? '');
    if (!isset(BOARD_OWNERS[$owner])) { $owner = ''; }
    $ownerId = $owner !== '' ? safe_int($data['owner_id'] ?? 0) : 0;
    if ($owner !== '' && !$ownerId) { $owner = ''; }
    $parent = safe_int($data['parent_id'] ?? 0) ?: null;
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 160) ?: 'Tableau sans titre';
    $icon = mb_substr(safe_text($data['icon'] ?? '🧩'), 0, 8) ?: '🧩';
    $color = preg_match('/^#[0-9a-f]{6}$/i', (string) ($data['color'] ?? '')) ? (string) $data['color'] : '#0066cc';
    $part = mb_substr(safe_text($data['part'] ?? ''), 0, 120);
    $thumb = (string) ($data['thumb'] ?? '');
    if ($thumb !== '' && (!preg_match('~^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$~', $thumb) || strlen($thumb) > 400000)) { $thumb = ''; }
    $fields = ['title' => $title, 'icon' => $icon, 'color' => $color, 'owner_type' => $owner, 'owner_id' => $ownerId, 'part' => $part];
    if (in_array($data['status'] ?? '', ['open', 'paused', 'closed'], true)) { $fields['status'] = (string) $data['status']; }
    if (array_key_exists('data', $data)) {
        $raw = is_array($data['data']) ? $data['data'] : (json_decode((string) $data['data'], true) ?: []);
        $items = array_values(array_filter(array_map(static fn($it) => is_array($it) ? board_clean_item($it) : null, array_slice($raw['items'] ?? [], 0, 3000))));
        $view = is_array($raw['view'] ?? null) ? ['x' => (float) ($raw['view']['x'] ?? 0), 'y' => (float) ($raw['view']['y'] ?? 0), 'k' => max(0.05, min(8, (float) ($raw['view']['k'] ?? 1)))] : ['x' => 0, 'y' => 0, 'k' => 1];
        $bg = in_array($raw['bg'] ?? '', ['dots', 'grid', 'lines', 'plain', 'paper', 'dark', 'cork'], true) ? $raw['bg'] : 'dots';
        $json = json_encode(['items' => $items, 'view' => $view, 'bg' => $bg], JSON_UNESCAPED_UNICODE);
        if (strlen($json) > 20 * 1024 * 1024) { throw new RuntimeException('Tableau trop lourd : retire quelques dessins.'); }
        $fields['data_json'] = $json; $fields['item_count'] = count($items);
        if ($thumb !== '') { $fields['thumb'] = $thumb; }
    }
    if ($id) {
        $set = implode(', ', array_map(static fn($k) => "$k=?", array_keys($fields)));
        $s = $pdo->prepare("UPDATE boards SET $set, updated_at=CURRENT_TIMESTAMP WHERE id=?"); $s->execute([...array_values($fields), $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Tableau introuvable.'); }
    } else {
        $fields['parent_id'] = $parent; $fields['data_json'] ??= '{"items":[],"view":{"x":0,"y":0,"k":1},"bg":"dots"}';
        if ($parent) { // un dossier : même rangement que son tableau
            $p = $pdo->prepare('SELECT owner_type, owner_id FROM boards WHERE id=?'); $p->execute([$parent]); $pr = $p->fetch();
            if (!$pr) { throw new RuntimeException('Tableau parent introuvable.'); }
            $fields['owner_type'] = $pr['owner_type']; $fields['owner_id'] = (int) $pr['owner_id'];
        }
        $cols = array_keys($fields);
        $pdo->prepare('INSERT INTO boards(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($fields));
        $id = (int) $pdo->lastInsertId();
    }
    return ['id' => $id, 'title' => $title];
}

function delete_board(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    // le tableau et ses dossiers (sous-tableaux), à toutes les profondeurs
    $ids = [$id];
    for ($i = 0; $i < count($ids) && $i < 500; $i++) { $s = $pdo->prepare('SELECT id FROM boards WHERE parent_id=?'); $s->execute([$ids[$i]]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $c) { $ids[] = (int) $c; } }
    $in = implode(',', array_map('intval', $ids));
    $pdo->exec("DELETE FROM boards WHERE id IN ($in)");
    foreach ($ids as $b) { heritage_delete_media_links($pdo, 'board', $b); }
    log_change($pdo, 'meta', 0, 'delete', 'Tableau supprimé (' . count($ids) . ')');
    return ['deleted' => count($ids)];
}

/** Listes « Enquêtes », « Battues », « Projets de l'Atelier » : une ligne par élément, avec ses chiffres et ses tableaux */
function research_lists_overview(PDO $pdo, string $kind): array
{
    $boards = [];
    foreach ($pdo->query("SELECT owner_type, owner_id, count(*) AS n FROM boards WHERE owner_type<>'' AND parent_id IS NULL GROUP BY owner_type, owner_id") as $r) { $boards[$r['owner_type'] . ':' . $r['owner_id']] = (int) $r['n']; }
    $rows = [];
    $q = static function (PDO $pdo, string $sql): array { try { return $pdo->query($sql)->fetchAll(); } catch (Throwable) { return []; } };
    if ($kind === 'investigations') {
        foreach ($q($pdo, "SELECT i.id, i.title, i.status, i.question, i.created_at, i.updated_at, trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS person, p.id AS person_id,
                (SELECT count(*) FROM investigation_items x WHERE x.investigation_id=i.id) AS items,
                (SELECT count(*) FROM investigation_items x WHERE x.investigation_id=i.id AND x.status='promising') AS promising,
                (SELECT count(*) FROM investigation_media m WHERE m.investigation_id=i.id) AS media
            FROM investigations i LEFT JOIN persons p ON p.id=i.person_id ORDER BY i.updated_at DESC") as $r) {
            $rows[] = $r + ['boards' => $boards['investigation:' . $r['id']] ?? 0];
        }
    } elseif ($kind === 'battues') {
        foreach ($q($pdo, "SELECT b.id, b.title, b.status, b.target_type, b.target_text, b.max_level, b.created_at, b.updated_at,
                (SELECT count(*) FROM battue_search_items s WHERE s.battue_id=b.id) AS searches,
                (SELECT count(*) FROM battue_commune_statuses c WHERE c.battue_id=b.id AND c.status='done') AS done,
                (SELECT count(*) FROM battue_commune_statuses c WHERE c.battue_id=b.id) AS communes
            FROM battues b ORDER BY b.updated_at DESC") as $r) {
            $rows[] = $r + ['boards' => $boards['battue:' . $r['id']] ?? 0];
        }
    } elseif ($kind === 'atelier') {
        foreach ($q($pdo, "SELECT a.id, a.title, a.subtitle, a.kind, a.icon, a.status, a.deadline, a.target_words, a.created_at, a.updated_at,
                (SELECT count(*) FROM atelier_items x WHERE x.project_id=a.id AND x.trashed=0) AS items,
                (SELECT count(*) FROM atelier_folders f WHERE f.project_id=a.id) AS folders
            FROM atelier_projects a ORDER BY a.updated_at DESC") as $r) {
            $rows[] = $r + ['boards' => $boards['atelier_project:' . $r['id']] ?? 0];
        }
    }
    return $rows;
}

/** Fichier, titre et sorte de quelques médias (ceux qu'on vient de poser sur un tableau) */
function media_brief(PDO $pdo, string $ids): array
{
    $list = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', $ids))))), 0, 200);
    if (!$list) { return ['media' => []]; }
    $out = [];
    foreach ($pdo->query('SELECT id, title, filename, thumbnail, media_type FROM media WHERE id IN (' . implode(',', $list) . ')') as $m) { $out[(int) $m['id']] = $m; }
    return ['media' => $out];
}
