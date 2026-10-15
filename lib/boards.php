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
    $types = ['shape', 'text', 'note', 'draw', 'line', 'media', 'webimage', 'link', 'tag', 'folder', 'recueil', 'widget', 'screen', 'person', 'weblink', 'table'];
    if (!in_array($it['type'] ?? '', $types, true)) { return null; }
    $num = static fn($v, $min = -1e6, $max = 1e6) => is_numeric($v) ? max($min, min($max, (float) $v)) : 0.0;
    $str = static fn($v, $n = 300) => mb_substr((string) ($v ?? ''), 0, $n);
    $color = static fn($v) => preg_match('/^(#[0-9a-f]{3,8}|transparent|rgba?\([\d.,\s%]+\))$/i', (string) ($v ?? '')) ? (string) $v : '';
    $url = static fn($v) => preg_match('~^https?://~i', (string) ($v ?? '')) ? mb_substr((string) $v, 0, 2000) : '';
    $out = ['id' => preg_replace('/[^a-z0-9_-]/i', '', (string) ($it['id'] ?? '')) ?: bin2hex(random_bytes(5)), 'type' => $it['type'],
        'x' => $num($it['x'] ?? 0), 'y' => $num($it['y'] ?? 0), 'w' => $num($it['w'] ?? 120, 4, 20000), 'h' => $num($it['h'] ?? 80, 4, 20000), 'rot' => $num($it['rot'] ?? 0, -360, 360),
        'z' => (int) $num($it['z'] ?? 0, -1e6, 1e6), 'locked' => !empty($it['locked']), 'group' => preg_replace('/[^a-z0-9_-]/i', '', (string) ($it['group'] ?? ''))];
    foreach (['fill', 'stroke', 'color', 'bg', 'headColor'] as $k) { if (isset($it[$k])) { $out[$k] = $color($it[$k]); } }
    foreach (['sw' => [0, 500], 'fs' => [4, 500], 'opacity' => [0, 1], 'radius' => [0, 400], 'vw' => [0.1, 1e6], 'vh' => [0.1, 1e6], 'hs' => [2, 200], 'hard' => [0, 100], 'bw' => [0, 200]] as $k => [$a, $z]) { if (isset($it[$k])) { $out[$k] = $num($it[$k], $a, $z); } }
    foreach (['shape' => 40, 'text' => 20000, 'title' => 300, 'font' => 80, 'align' => 10, 'brush' => 20, 'dash' => 20, 'target' => 400, 'label' => 200, 'kind' => 40, 'part' => 120, 'note' => 2000, 'headStart' => 12, 'headEnd' => 12, 'path' => 12, 'list' => 10] as $k => $n) { if (isset($it[$k])) { $out[$k] = $str($it[$k], $n); } }
    // sûrs pour le style : alignement connu, police sans caractères spéciaux, pointes connues
    if (isset($out['align']) && !in_array($out['align'], ['left', 'center', 'right', 'justify'], true)) { $out['align'] = 'left'; }
    if (isset($out['font'])) { $out['font'] = trim((string) preg_replace("/[^\\w\\s,'\\-.\\x{C0}-\\x{FF}]/u", '', $out['font'])); }
    foreach (['headStart', 'headEnd'] as $k) { if (isset($out[$k]) && !in_array($out[$k], ['none', 'triangle', 'stealth', 'open', 'double', 'half', 'circle', 'ring', 'dot', 'square', 'square_o', 'diamond', 'diamond_o', 'bar', 'fork', 'tail'], true)) { $out[$k] = 'triangle'; } }
    if (isset($it['layout'])) { $out['layout'] = $str($it['layout'], 40); }
    // tableur : une grille de textes (100 lignes × 30 colonnes au plus), largeurs des colonnes
    if (($it['type'] ?? '') === 'table') {
        $cells = is_array($it['cells'] ?? null) ? $it['cells'] : [['']];
        $out['cells'] = array_values(array_map(static fn($row) => array_values(array_map(static fn($c) => mb_substr(is_scalar($c) ? (string) $c : '', 0, 500), array_slice(is_array($row) ? $row : [], 0, 30))), array_slice($cells, 0, 100)));
        if (!$out['cells']) { $out['cells'] = [['']]; }
        $out['colw'] = array_values(array_map(static fn($w) => $num($w, 30, 800), array_slice(is_array($it['colw'] ?? null) ? $it['colw'] : [], 0, 30)));
        $out['merges'] = [];
        foreach (array_slice(is_array($it['merges'] ?? null) ? $it['merges'] : [], 0, 300) as $m) {
            if (!is_array($m)) { continue; }
            $mr = max(0, (int) ($m['r'] ?? 0)); $mc = max(0, (int) ($m['c'] ?? 0)); $rs = max(1, min(100, (int) ($m['rs'] ?? 1))); $cs = max(1, min(30, (int) ($m['cs'] ?? 1)));
            if ($rs * $cs > 1) { $out['merges'][] = ['r' => $mr, 'c' => $mc, 'rs' => $rs, 'cs' => $cs]; }
        }
        $out['header'] = !empty($it['header']); $out['hcol'] = !empty($it['hcol']); $out['stripes'] = !empty($it['stripes']);
        if (isset($it['hfill'])) { $out['hfill'] = $color($it['hfill']); }
        if (isset($it['cfill']) && is_array($it['cfill'])) { $cf = []; foreach (array_slice($it['cfill'], 0, 400, true) as $k => $v) { if (preg_match('/^\d{1,3}:\d{1,2}$/', (string) $k) && ($c = $color($v)) !== '') { $cf[(string) $k] = $c; } } $out['cfill'] = (object) $cf; }
    }
    foreach (['underline', 'strike', 'eo'] as $k) { if (isset($it[$k])) { $out[$k] = !empty($it[$k]); } }
    if (isset($out['list']) && !in_array($out['list'], ['', 'bullet', 'num', 'roman', 'alpha', 'ALPHA', 'dash', 'check'], true)) { $out['list'] = ''; }
    // forme à soi : un chemin SVG (boîte 100 × 100) ou une image servant de masque
    if (isset($it['svgpath']) && preg_match('/^[MLHVCSQTAZmlhvcsqtaz0-9.,\s-]{1,30000}$/', (string) $it['svgpath'])) { $out['svgpath'] = (string) $it['svgpath']; }
    if (isset($it['mask']) && is_string($it['mask']) && strlen($it['mask']) <= 400000 && preg_match('~^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$~', $it['mask'])) { $out['mask'] = $it['mask']; }
    foreach (['bold', 'italic', 'arrowStart', 'arrowEnd', 'curved', 'preview', 'collapsed'] as $k) { if (isset($it[$k])) { $out[$k] = !empty($it[$k]); } }
    foreach (['media_id', 'board_id', 'recueil_id', 'label_id', 'person_id'] as $k) { if (isset($it[$k])) { $out[$k] = max(0, (int) $it[$k]); } }
    if (isset($it['url'])) { $out['url'] = $url($it['url']); }
    if (isset($it['from'])) { $out['from'] = preg_replace('/[^a-z0-9_-]/i', '', (string) $it['from']); }
    if (isset($it['to'])) { $out['to'] = preg_replace('/[^a-z0-9_-]/i', '', (string) $it['to']); }
    if (isset($it['points']) && is_array($it['points'])) {
        $out['points'] = array_values(array_map(static fn($p) => [round($num($p[0] ?? 0), 1), round($num($p[1] ?? 0), 1)], array_slice(array_filter($it['points'], 'is_array'), 0, 20000)));
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
        $bg = in_array($raw['bg'] ?? '', ['dots', 'grid', 'lines', 'plain', 'paper', 'dark', 'cork', 'custom'], true) ? $raw['bg'] : 'dots';
        $bgColor = preg_match('/^#[0-9a-f]{6}$/i', (string) ($raw['bgColor'] ?? '')) ? (string) $raw['bgColor'] : '';
        $bgPattern = in_array($raw['bgPattern'] ?? '', ['', 'dots', 'grid', 'lines'], true) ? (string) ($raw['bgPattern'] ?? '') : '';
        $json = json_encode(['items' => $items, 'view' => $view, 'bg' => $bg, 'locked' => !empty($raw['locked']), 'links' => array_map(static function ($l) use ($pdo) { $lab = board_link_label($pdo, $l['kind'], $l['id']); if ($lab !== '') { $l['label'] = mb_substr($lab, 0, 200); } return $l; }, board_clean_links($raw['links'] ?? [])), 'bgColor' => $bgColor, 'bgPattern' => $bgPattern], JSON_UNESCAPED_UNICODE);
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

/** Ce à quoi un tableau est associé, en plus de son rangement : des fiches, des enquêtes, des battues, des projets, des recueils… */
const BOARD_LINK_KINDS = ['person' => 'Personne', 'investigation' => 'Enquête', 'battue' => 'Battue', 'atelier_project' => 'Atelier', 'recueil' => 'Recueil', 'place' => 'Lieu', 'family' => 'Famille', 'board' => 'Tableau', 'media' => 'Média', 'label' => 'Étiquette', 'event' => 'Événement', 'pet' => 'Animal'];

/** Le nom d'une chose associée, lu dans la base (le même partout : sert aussi à reconnaître la même base à l'import) */
function board_link_label(PDO $pdo, string $kind, int $id): string
{
    $one = static function (string $sql) use ($pdo, $id): string { try { $s = $pdo->prepare($sql); $s->execute([$id]); return trim((string) ($s->fetchColumn() ?: '')); } catch (Throwable) { return ''; } };
    $name = static fn(string $a) => "trim(replace(COALESCE($a.first_name,'')||' '||COALESCE($a.last_name,''),'  ',' '))";
    switch ($kind) {
        case 'person': return $one('SELECT ' . $name('p') . ' FROM persons p WHERE p.id=?');
        case 'investigation': case 'battue': case 'atelier_project': return board_owner_label($pdo, $kind, $id);
        case 'recueil': return $one('SELECT title FROM recueils WHERE id=?');
        case 'place': return $one("SELECT name || CASE WHEN COALESCE(county,'')<>'' THEN ' (' || county || ')' ELSE '' END FROM places WHERE id=?");
        case 'media': return $one("SELECT COALESCE(NULLIF(title,''), filename) FROM media WHERE id=?");
        case 'label': return $one('SELECT name FROM labels WHERE id=?');
        case 'board': return $one('SELECT title FROM boards WHERE id=?');
        case 'family': return $one('SELECT trim(COALESCE(' . $name('a') . ",'?') || ' et ' || COALESCE(" . $name('b') . ",'?')) FROM families f LEFT JOIN persons a ON a.id=f.partner1_id LEFT JOIN persons b ON b.id=f.partner2_id WHERE f.id=?");
        case 'event': return $one("SELECT trim(t.label || ' ' || COALESCE(e.date_text, e.year, '') || ' — ' || COALESCE(" . $name('p') . ",'')) FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id WHERE e.id=?");
        case 'pet': { $j = $one('SELECT data_json FROM pets WHERE id=?'); return $j !== '' ? pet_title(json_decode($j, true) ?: []) : ''; }
    }
    return '';
}

/** Associations d'un tableau importé : on garde celles qui visent la même chose ici (même numéro, même nom) */
function board_links_check(PDO $pdo, array $data): array
{
    $keep = [];
    foreach (board_clean_links($data['links'] ?? []) as $l) { $lab = board_link_label($pdo, $l['kind'], $l['id']); if ($lab !== '' && $lab === $l['label']) { $keep[] = $l; } }
    return ['links' => $keep];
}

/** Recherche de couples (familles) pour les associer à un tableau */
function board_family_search(PDO $pdo, string $q): array
{
    $q = trim($q); if (mb_strlen($q) < 2) { return []; }
    $name = static fn(string $a) => "trim(replace(COALESCE($a.first_name,'')||' '||COALESCE($a.last_name,''),'  ',' '))";
    $s = $pdo->prepare('SELECT f.id, ' . $name('a') . ' AS a, ' . $name('b') . ' AS b, (SELECT COALESCE(e.date_text, e.year) FROM events e WHERE e.family_id=f.id ORDER BY e.year LIMIT 1) AS d FROM families f LEFT JOIN persons a ON a.id=f.partner1_id LEFT JOIN persons b ON b.id=f.partner2_id
        WHERE ' . $name('a') . ' LIKE ? COLLATE NOCASE OR ' . $name('b') . ' LIKE ? COLLATE NOCASE ORDER BY a LIMIT 15');
    $s->execute(['%' . $q . '%', '%' . $q . '%']);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => trim(($r['a'] ?: '?') . ' et ' . ($r['b'] ?: '?')) . ($r['d'] ? ' (' . $r['d'] . ')' : '')], $s->fetchAll());
}

/** Où ouvrir une famille ou un événement : la fiche de la personne */
function board_link_person(PDO $pdo, string $kind, int $id): int
{
    try {
        if ($kind === 'family') { $s = $pdo->prepare('SELECT COALESCE(partner1_id, partner2_id) FROM families WHERE id=?'); $s->execute([$id]); return (int) $s->fetchColumn(); }
        if ($kind === 'event') { $s = $pdo->prepare('SELECT COALESCE(e.person_id, f.partner1_id, f.partner2_id) FROM events e LEFT JOIN families f ON f.id=e.family_id WHERE e.id=?'); $s->execute([$id]); return (int) $s->fetchColumn(); }
    } catch (Throwable) {}
    return 0;
}
function board_clean_links($links): array
{
    $out = []; $seen = [];
    foreach (array_slice(is_array($links) ? $links : [], 0, 60) as $l) {
        if (!is_array($l) || !isset(BOARD_LINK_KINDS[$l['kind'] ?? '']) || !safe_int($l['id'] ?? 0)) { continue; }
        $key = $l['kind'] . ':' . safe_int($l['id']) . ':' . mb_substr(trim((string) ($l['part'] ?? '')), 0, 120);
        if (isset($seen[$key])) { continue; }
        $seen[$key] = true;
        $out[] = ['kind' => (string) $l['kind'], 'id' => safe_int($l['id']), 'label' => mb_substr(safe_text($l['label'] ?? ''), 0, 200), 'part' => mb_substr(safe_text($l['part'] ?? ''), 0, 120), 'key' => mb_substr(safe_text($l['key'] ?? ''), 0, 160)];
    }
    return $out;
}

/** Les tableaux associés à une chose (rangés dedans, ou associés depuis le tableau) — pour la fiche d'une personne, d'une enquête… */
function boards_linked(PDO $pdo, string $kind, int $id): array
{
    if (!isset(BOARD_LINK_KINDS[$kind]) || !$id) { return []; }
    $out = [];
    // pré-tri en SQL (le contenu d'un tableau peut être lourd) : rangé dedans, ou le lien écrit tel quel dans le contenu
    $s = $pdo->prepare('SELECT id, parent_id, title, icon, owner_type, owner_id, part, status, thumb, item_count, updated_at, data_json FROM boards
        WHERE (parent_id IS NULL AND owner_type=? AND owner_id=?) OR data_json LIKE ? ORDER BY updated_at DESC');
    $s->execute([$kind, $id, '%"kind":"' . $kind . '","id":' . $id . ',%']);
    foreach ($s->fetchAll() as $r) {
        $parts = [];
        if ($r['parent_id'] === null && $r['owner_type'] === $kind && (int) $r['owner_id'] === $id) { $parts[] = (string) $r['part']; }
        if (str_contains((string) $r['data_json'], '"links"')) {
            foreach ((json_decode((string) $r['data_json'], true)['links'] ?? []) as $l) { if (($l['kind'] ?? '') === $kind && (int) ($l['id'] ?? 0) === $id) { $parts[] = (string) ($l['part'] ?? ''); } }
        }
        if (!$parts) { continue; }
        unset($r['data_json'], $r['parent_id']);
        $r['id'] = (int) $r['id']; $r['item_count'] = (int) $r['item_count']; $r['parts'] = array_values(array_unique(array_filter($parts)));
        $r['owner_label'] = board_owner_label($pdo, (string) $r['owner_type'], (int) $r['owner_id']);
        $out[] = $r;
    }
    return $out;
}

/* ── Instantanés ── */
function board_snapshots(PDO $pdo, int $boardId): array
{
    $s = $pdo->prepare('SELECT id, board_id, label, thumb, item_count, created_at FROM board_snapshots WHERE board_id=? ORDER BY id DESC'); $s->execute([$boardId]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'board_id' => (int) $r['board_id'], 'label' => (string) $r['label'], 'thumb' => (string) $r['thumb'], 'item_count' => (int) $r['item_count'], 'created_at' => (string) $r['created_at']], $s->fetchAll());
}
function board_snapshot_detail(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM board_snapshots WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Instantané introuvable.'); }
    return ['id' => (int) $r['id'], 'board_id' => (int) $r['board_id'], 'label' => (string) $r['label'], 'created_at' => (string) $r['created_at'], 'data' => json_decode((string) $r['data_json'], true) ?: ['items' => []]];
}
function save_board_snapshot(PDO $pdo, array $data): array
{
    $id = safe_int($data['board_id'] ?? 0);
    $s = $pdo->prepare('SELECT data_json, thumb, item_count FROM boards WHERE id=?'); $s->execute([$id]); $b = $s->fetch();
    if (!$b) { throw new RuntimeException('Tableau introuvable.'); }
    $label = mb_substr(safe_text($data['label'] ?? ''), 0, 160) ?: 'Instantané du ' . date('d/m/Y H:i');
    $pdo->prepare('INSERT INTO board_snapshots(board_id, label, data_json, thumb, item_count) VALUES(?,?,?,?,?)')->execute([$id, $label, (string) $b['data_json'], (string) $b['thumb'], (int) $b['item_count']]);
    return ['id' => (int) $pdo->lastInsertId(), 'label' => $label];
}
function restore_board_snapshot(PDO $pdo, array $data): array
{
    $snap = board_snapshot_detail($pdo, safe_int($data['id'] ?? 0));
    // on garde l'état actuel avant de revenir en arrière : rien ne se perd
    save_board_snapshot($pdo, ['board_id' => $snap['board_id'], 'label' => 'Avant le retour à « ' . $snap['label'] . ' »']);
    $s = $pdo->prepare('SELECT data_json, thumb, item_count FROM board_snapshots WHERE id=?'); $s->execute([$snap['id']]); $r = $s->fetch();
    $pdo->prepare('UPDATE boards SET data_json=?, thumb=?, item_count=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(string) $r['data_json'], (string) $r['thumb'], (int) $r['item_count'], $snap['board_id']]);
    return ['id' => $snap['board_id']];
}
function delete_board_snapshot(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM board_snapshots WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['deleted' => true];
}
/** Un nouveau tableau à partir d'un tableau (ou d'un de ses instantanés) : même contenu, même rangement, autre nom */
function copy_board(PDO $pdo, array $data): array
{
    $s = $pdo->prepare('SELECT * FROM boards WHERE id=?'); $s->execute([safe_int($data['id'] ?? 0)]); $b = $s->fetch();
    if (!$b) { throw new RuntimeException('Tableau introuvable.'); }
    $json = (string) $b['data_json']; $thumb = (string) $b['thumb']; $count = (int) $b['item_count'];
    if (safe_int($data['snapshot_id'] ?? 0)) {
        $q = $pdo->prepare('SELECT data_json, thumb, item_count FROM board_snapshots WHERE id=? AND board_id=?'); $q->execute([safe_int($data['snapshot_id']), (int) $b['id']]);
        $r = $q->fetch(); if (!$r) { throw new RuntimeException('Instantané introuvable.'); }
        [$json, $thumb, $count] = [(string) $r['data_json'], (string) $r['thumb'], (int) $r['item_count']];
    }
    $keep = !array_key_exists('keep_owner', $data) || !empty($data['keep_owner']);
    $d = json_decode($json, true) ?: []; $d['locked'] = false; if (!$keep) { $d['links'] = []; } $json = json_encode($d, JSON_UNESCAPED_UNICODE);
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 160) ?: ($b['title'] . ' (copie)');
    $pdo->prepare('INSERT INTO boards(title, icon, color, owner_type, owner_id, part, status, data_json, thumb, item_count) VALUES(?,?,?,?,?,?,?,?,?,?)')
        ->execute([$title, (string) $b['icon'], (string) $b['color'], $keep ? (string) $b['owner_type'] : '', $keep ? (int) $b['owner_id'] : 0, $keep ? (string) $b['part'] : '', 'open', $json, $thumb, $count]);
    $id = (int) $pdo->lastInsertId();
    log_change($pdo, 'meta', 0, 'create', 'Tableau copié : ' . $title);
    return ['id' => $id, 'title' => $title, 'links' => isset($json) ? (json_decode($json, true)['links'] ?? []) : null];
}

function delete_board(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    // le tableau et ses dossiers (sous-tableaux), à toutes les profondeurs
    $ids = [$id];
    for ($i = 0; $i < count($ids) && $i < 500; $i++) { $s = $pdo->prepare('SELECT id FROM boards WHERE parent_id=?'); $s->execute([$ids[$i]]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $c) { $ids[] = (int) $c; } }
    $in = implode(',', array_map('intval', $ids));
    $pdo->exec("DELETE FROM boards WHERE id IN ($in)");
    $pdo->exec("DELETE FROM board_snapshots WHERE board_id IN ($in)");
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
