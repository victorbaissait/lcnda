<?php
declare(strict_types=1);

/**
 * 📒 Fiches (onglet « Fiches », masqué au départ) : une page sur un sujet — « La Pologne avant les guerres
 * napoléoniennes », un métier, un lieu… — faite de blocs rangés sur une grille : texte, images et documents,
 * personnes, frise de dates, citation, liens, intertitre, et tout ce que l'app sait montrer (écrans, listes,
 * Mes listes, widgets et graphiques à soi). Table topic_sheets (structure n°42) ; les images sont des médias
 * rattachés à la fiche (family_collection_media, type « topic_sheet », rôle = le bloc).
 * Audit des onglets (§13) : 🕘 versions (topic_sheet_versions, créée à la demande : l'état d'avant chaque enregistrement,
 * au plus une toutes les 2 minutes, 60 par fiche ; « ↺ Revenir » garde l'état actuel d'abord) ; suppression d'une fiche ou
 * d'un modèle gardée pour « ↶ Annuler » (undelete) ; bloc 🤖 « Les personnes de la base qui… » (auto, tenu à jour) ;
 * ↩ « Cité dans » (cited_in : notes, enquêtes, lieux, autres fiches qui nomment la fiche) ; texte des blocs pour chercher.
 */

const TOPIC_BLOCK_TYPES = ['text', 'images', 'people', 'dates', 'quote', 'links', 'divider', 'screen', 'widget', 'diagram', 'photomap', 'auto']; // photomap : 📸 carte de photos (lib/photomaps.php)
const TOPIC_WIDTHS = ['3', '4', '6', '8', '9', '12'];

function topic_text($v, int $max): string
{
    return mb_substr(trim(str_replace("\r", '', (string) (is_scalar($v) ? $v : ''))), 0, $max);
}

/** Un bloc remis d'aplomb (ce qui n'est pas prévu est laissé de côté) */
function topic_clean_block($b): ?array
{
    if (!is_array($b) || !in_array($b['type'] ?? '', TOPIC_BLOCK_TYPES, true)) { return null; }
    $id = (string) ($b['id'] ?? '');
    if (!preg_match('/^b_[a-z0-9]{3,24}$/', $id)) { $id = 'b_' . bin2hex(random_bytes(5)); }
    $color = (string) ($b['color'] ?? '');
    $out = ['id' => $id, 'type' => $b['type'], 'title' => topic_text($b['title'] ?? '', 200),
        'width' => in_array((string) ($b['width'] ?? ''), TOPIC_WIDTHS, true) ? (string) $b['width'] : '12',
        'color' => preg_match('/^#[0-9a-f]{6}$/i', $color) ? $color : ''];
    switch ($b['type']) {
        case 'text': $out['text'] = topic_text($b['text'] ?? '', 60000); break;
        case 'quote': $out['text'] = topic_text($b['text'] ?? '', 8000); $out['source'] = topic_text($b['source'] ?? '', 400); break;
        case 'images': $out['layout'] = in_array($b['layout'] ?? '', ['grid', 'large', 'strip'], true) ? $b['layout'] : 'grid'; $out['caption'] = topic_text($b['caption'] ?? '', 1000); break;
        case 'people':
            $out['ids'] = array_values(array_unique(array_filter(array_map('intval', array_slice(is_array($b['ids'] ?? null) ? $b['ids'] : [], 0, 300)))));
            $out['note'] = topic_text($b['note'] ?? '', 2000); break;
        case 'dates':
            $rows = [];
            foreach (array_slice(is_array($b['rows'] ?? null) ? $b['rows'] : [], 0, 400) as $r) {
                if (!is_array($r)) { continue; }
                $d = topic_text($r['date'] ?? '', 60); $t = topic_text($r['text'] ?? '', 1000);
                if ($d !== '' || $t !== '') { $rows[] = ['date' => $d, 'text' => $t]; }
            }
            $out['rows'] = $rows; break;
        case 'links':
            $rows = [];
            foreach (array_slice(is_array($b['rows'] ?? null) ? $b['rows'] : [], 0, 200) as $r) {
                if (!is_array($r)) { continue; }
                $u = topic_text($r['url'] ?? '', 1500);
                if ($u !== '' && !preg_match('#^https?://#i', $u)) { continue; } // seulement des adresses web
                $l = topic_text($r['label'] ?? '', 200);
                if ($u !== '' || $l !== '') { $rows[] = ['label' => $l, 'url' => $u, 'note' => topic_text($r['note'] ?? '', 500)]; }
            }
            $out['rows'] = $rows; break;
        case 'photomap': // 📸 une carte de photos (ou toutes : mapId vide), sa période, le filtre photos / vidéos
            $c = is_array($b['config'] ?? null) ? $b['config'] : [];
            $out['config'] = ['mapId' => max(0, (int) ($c['mapId'] ?? 0)) ?: null, 'mapName' => topic_text($c['mapName'] ?? '', 160),
                'type' => in_array($c['type'] ?? '', ['all', 'image', 'video'], true) ? $c['type'] : 'all', 'period' => topic_text($c['period'] ?? '', 120),
                'height' => max(220, min(1200, (int) ($c['height'] ?? 380))), 'track' => !empty($c['track'])];
            break;
        case 'screen':
            $t = topic_text($b['target'] ?? '', 200);
            $out['target'] = preg_match('/^[a-z_]+:[A-Za-z0-9_:.\-]{1,160}$/', $t) ? $t : 'module:carte';
            $out['height'] = max(240, min(2000, (int) ($b['height'] ?? 560)));
            $out['sidebar'] = !empty($b['sidebar']);
            $out['personName'] = topic_text($b['personName'] ?? '', 200);
            foreach (['layout'] as $k) { if (isset($b[$k]) && is_array($b[$k])) { $j = json_encode($b[$k]); if ($j !== false && strlen($j) < 4000) { $out[$k] = $b[$k]; } } }
            break;
        case 'diagram':
            $out['diagram'] = max(0, (int) ($b['diagram'] ?? 0)); break;
        case 'auto': // 🤖 « Les personnes de la base qui… » : métier, lieu, période ; la liste est recalculée à chaque ouverture
            $out['occupation'] = topic_text($b['occupation'] ?? '', 120); $out['place'] = topic_text($b['place'] ?? '', 120);
            $out['from'] = max(0, min(2999, (int) ($b['from'] ?? 0))); $out['to'] = max(0, min(2999, (int) ($b['to'] ?? 0)));
            $out['limit'] = max(5, min(300, (int) ($b['limit'] ?? 60))); $out['note'] = topic_text($b['note'] ?? '', 2000); break;
        case 'widget':
            $w = (string) ($b['widget'] ?? '');
            $out['widget'] = preg_match('/^cw_[a-z0-9]{4,24}$/', $w) ? $w : ''; break;
    }
    return $out;
}

function topic_sheets_list(PDO $pdo): array
{
    $rows = array_values(array_filter($pdo->query('SELECT id, title, subtitle, icon, color, data_json, updated_at FROM topic_sheets ORDER BY title COLLATE NOCASE, id')->fetchAll(),
        static fn($r) => empty((json_decode((string) $r['data_json'], true) ?: [])['template'])));
    $media = heritage_media($pdo, 'topic_sheet', array_column($rows, 'id'));
    $labels = function_exists('collection_labels') ? collection_labels($pdo, 'topic_sheet', array_column($rows, 'id')) : []; // Listes › Fiches thématiques : Filtrer › Étiquette (H10)
    return array_map(static function ($r) use ($media, $labels) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $blocks = is_array($d['blocks'] ?? null) ? $d['blocks'] : [];
        $pids = [];
        foreach ($blocks as $b) { if (is_array($b) && ($b['type'] ?? '') === 'people' && is_array($b['ids'] ?? null)) { $pids = array_merge($pids, array_map('intval', $b['ids'])); } }
        return ['id' => (int) $r['id'], 'title' => $r['title'], 'subtitle' => $r['subtitle'], 'icon' => $r['icon'], 'color' => $r['color'],
            'blocks' => count($blocks), 'cover' => topic_sheet_cover($media[(int) $r['id']] ?? []), 'labels' => $labels[(int) $r['id']] ?? [], 'updated_at' => $r['updated_at'],
            'text' => mb_substr(topic_plain_text($blocks), 0, 20000), 'people_ids' => array_values(array_unique(array_filter($pids)))]; // 🔍 chercher dans le contenu ; 📒 sur la fiche d'une personne
    }, $rows);
}

/** le texte d'une fiche, sans mise en forme (🔍 chercher dans les fiches, aperçu des 🕘 versions, export Markdown) */
function topic_plain_text(array $blocks): string
{
    $out = [];
    foreach ($blocks as $b) {
        if (!is_array($b)) { continue; }
        if (($b['title'] ?? '') !== '') { $out[] = (string) $b['title']; }
        foreach (['text', 'source', 'caption', 'note'] as $k) { if (is_string($b[$k] ?? null) && $b[$k] !== '') { $out[] = $b[$k]; } }
        foreach (is_array($b['rows'] ?? null) ? $b['rows'] : [] as $r) { if (is_array($r)) { $out[] = trim(implode(' ', array_filter(array_map(static fn($v) => is_scalar($v) ? (string) $v : '', $r)))); } }
        if (($b['type'] ?? '') === 'auto') { $out[] = trim(implode(' ', array_filter([(string) ($b['occupation'] ?? ''), (string) ($b['place'] ?? '')]))); }
    }
    return trim(implode("\n", array_filter($out, static fn($t) => trim((string) $t) !== '')));
}

/* ─── 🕘 Versions et ↶ suppression gardée ─── */
function topic_versions_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS topic_sheet_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, sheet_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '',
        subtitle TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}', reason TEXT NOT NULL DEFAULT '',
        extra_json TEXT NOT NULL DEFAULT '', saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_topic_versions_sheet ON topic_sheet_versions(sheet_id, id)');
    $done = true;
}
/** garde l'état actuel d'une fiche ($force : même si la dernière version a moins de 2 minutes) → id de la version, ou 0 */
function topic_snapshot(PDO $pdo, int $id, string $reason = 'auto', bool $force = false, array $extra = []): int
{
    topic_versions_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM topic_sheets WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { return 0; }
    if (!$force) {
        $l = $pdo->prepare("SELECT data_json, title, (julianday('now') - julianday(saved_at)) * 1440 AS mins FROM topic_sheet_versions WHERE sheet_id=? AND reason<>'deleted' ORDER BY id DESC LIMIT 1"); $l->execute([$id]);
        $last = $l->fetch(PDO::FETCH_ASSOC);
        if ($last && ((float) $last['mins'] < 2 || ((string) $last['data_json'] === (string) $r['data_json'] && (string) $last['title'] === (string) $r['title']))) { return 0; }
    }
    $pdo->prepare('INSERT INTO topic_sheet_versions(sheet_id, title, subtitle, icon, color, data_json, reason, extra_json) VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$id, (string) $r['title'], (string) $r['subtitle'], (string) $r['icon'], (string) $r['color'], (string) $r['data_json'], mb_substr($reason, 0, 80), $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : '']);
    $vid = (int) $pdo->lastInsertId();
    // 60 versions par fiche au plus (les suppressions gardées ne comptent pas)
    $pdo->prepare("DELETE FROM topic_sheet_versions WHERE sheet_id=? AND reason<>'deleted' AND id NOT IN (SELECT id FROM topic_sheet_versions WHERE sheet_id=? AND reason<>'deleted' ORDER BY id DESC LIMIT 60)")->execute([$id, $id]);
    return $vid;
}
function topic_versions_list(PDO $pdo, int $id): array
{
    try {
        topic_versions_ensure($pdo);
        $s = $pdo->prepare("SELECT id, title, data_json, reason, saved_at FROM topic_sheet_versions WHERE sheet_id=? AND reason<>'deleted' ORDER BY id DESC LIMIT 60"); $s->execute([$id]);
        return array_map(static function ($v) { $d = json_decode((string) $v['data_json'], true) ?: []; return ['id' => (int) $v['id'], 'title' => (string) $v['title'], 'reason' => (string) $v['reason'], 'saved_at' => (string) $v['saved_at'], 'blocks' => count($d['blocks'] ?? [])]; }, $s->fetchAll(PDO::FETCH_ASSOC));
    } catch (Throwable $e) { return []; }
}

/** 🤖 les personnes de la base qui… (métier, lieu d'un événement, période) */
function topic_auto_people(PDO $pdo, array $b): array
{
    $where = ["COALESCE(p.kind,'person')<>'animal'"]; $args = [];
    if (($b['occupation'] ?? '') !== '') {
        $like = '%' . $b['occupation'] . '%';
        $where[] = "(p.occupation LIKE ? OR EXISTS (SELECT 1 FROM events eo JOIN event_types t2 ON t2.id=eo.event_type_id WHERE eo.person_id=p.id AND t2.gedcom_tag='OCCU' AND (COALESCE(eo.description,'') LIKE ? OR COALESCE(eo.title,'') LIKE ?)))";
        array_push($args, $like, $like, $like);
    }
    $evWhere = []; $evArgs = [];
    if (($b['place'] ?? '') !== '') { $evWhere[] = 'pl.name LIKE ?'; $evArgs[] = '%' . $b['place'] . '%'; }
    if (!empty($b['from'])) { $evWhere[] = 'e.year >= ?'; $evArgs[] = (int) $b['from']; }
    if (!empty($b['to'])) { $evWhere[] = 'e.year <= ?'; $evArgs[] = (int) $b['to']; }
    if ($evWhere) { $where[] = 'EXISTS (SELECT 1 FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=p.id AND ' . implode(' AND ', $evWhere) . ')'; $args = array_merge($args, $evArgs); }
    if (count($where) < 2) { return []; } // rien de choisi : pas toute la base
    // mode consultation : ni vivants ni fiches confidentielles (mêmes règles que l'onglet Documents)
    $hide = '';
    if (function_exists('kiosk_state') && !empty(kiosk_state()['on'])) { if (!function_exists('onglets_hidden_people_sql')) { require_once __DIR__ . '/onglets.php'; } $hide = onglets_hidden_people_sql($pdo, 'p'); }
    try {
        $s = $pdo->prepare('SELECT p.id FROM persons p WHERE ' . implode(' AND ', $where) . $hide . ' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT ' . (int) ($b['limit'] ?? 60));
        $s->execute($args);
        return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    } catch (Throwable $e) { return []; }
}

/** ↩ « Cité dans » : ce qui nomme cette fiche (son titre, ou « fiche:N ») — notes, enquêtes, lieux, autres fiches */
function topic_cited_in(PDO $pdo, int $id, string $title): array
{
    $out = []; $t = trim($title);
    if (mb_strlen($t) < 4) { return []; }
    $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $t) . '%'; $ref = '%fiche:' . $id . '%';
    $esc = " ESCAPE '\\'";
    $q = static function (string $sql, array $args) use ($pdo): array { try { $s = $pdo->prepare($sql); $s->execute($args); return $s->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $e) { return []; } };
    $hide = '';
    if (function_exists('kiosk_state') && !empty(kiosk_state()['on'])) { if (!function_exists('onglets_hidden_people_sql')) { require_once __DIR__ . '/onglets.php'; } $hide = onglets_hidden_people_sql($pdo, 'p'); }
    foreach ($q("SELECT n.entity_type, n.entity_id, n.title FROM notes n WHERE (n.body LIKE ?{$esc} OR n.title LIKE ?{$esc} OR n.body LIKE ?) LIMIT 60", [$like, $like, $ref]) as $r) {
        if ($r['entity_type'] === 'person') {
            $p = $q("SELECT p.id, trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS n FROM persons p WHERE p.id=?{$hide}", [(int) $r['entity_id']])[0] ?? null;
            if ($p) { $out[] = ['kind' => 'person', 'id' => (int) $p['id'], 'label' => '👤 ' . ($p['n'] ?: 'Sans nom'), 'via' => 'note']; }
        } elseif ($r['entity_type'] === 'place') {
            $p = $q('SELECT id, name FROM places WHERE id=?', [(int) $r['entity_id']])[0] ?? null;
            if ($p) { $out[] = ['kind' => 'place', 'id' => (int) $p['id'], 'label' => '📍 ' . $p['name'], 'via' => 'note']; }
        }
    }
    foreach ($q("SELECT id, name FROM places WHERE description LIKE ?{$esc} OR description LIKE ? LIMIT 30", [$like, $ref]) as $r) { $out[] = ['kind' => 'place', 'id' => (int) $r['id'], 'label' => '📍 ' . $r['name'], 'via' => 'description']; }
    foreach ($q("SELECT id, title FROM investigations WHERE title LIKE ?{$esc} OR question LIKE ?{$esc} OR known_facts LIKE ?{$esc} OR documents LIKE ?{$esc} OR known_facts LIKE ? LIMIT 30", [$like, $like, $like, $like, $ref]) as $r) { $out[] = ['kind' => 'investigation', 'id' => (int) $r['id'], 'label' => '🔍 ' . $r['title'], 'via' => 'enquête']; }
    foreach ($q("SELECT id, title, icon FROM topic_sheets WHERE id<>? AND (data_json LIKE ?{$esc} OR data_json LIKE ?) LIMIT 30", [$id, $like, $ref]) as $r) { $out[] = ['kind' => 'sheet', 'id' => (int) $r['id'], 'label' => ($r['icon'] ?: '📒') . ' ' . $r['title'], 'via' => 'fiche']; }
    $seen = []; $uniq = [];
    foreach ($out as $o) { $k = $o['kind'] . ':' . $o['id']; if (isset($seen[$k])) { continue; } $seen[$k] = true; $uniq[] = $o; }
    return array_slice($uniq, 0, 80);
}

/** Vignette d'une fiche : l'image de couverture choisie (⚙️ La fiche), sinon sa première image */
function topic_sheet_cover(array $media): ?array
{
    foreach ($media as $m) { if (($m['role'] ?? '') === 'cover') { return $m; } }
    foreach ($media as $m) { if (($m['media_type'] ?? '') === 'image') { return $m; } }
    return $media[0] ?? null;
}

/** ⭐ Les modèles de fiche (des fiches marquées « template », rangées à part) : leurs blocs servent à créer des fiches construites pareil */
function topic_sheet_templates(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT id, title, subtitle, icon, color, data_json, updated_at FROM topic_sheets ORDER BY title COLLATE NOCASE, id') as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        if (empty($d['template'])) { continue; }
        $out[] = ['id' => (int) $r['id'], 'title' => $r['title'], 'subtitle' => $r['subtitle'], 'icon' => $r['icon'], 'color' => $r['color'],
            'blocks' => array_values(array_filter(array_map('topic_clean_block', is_array($d['blocks'] ?? null) ? $d['blocks'] : []))), 'updated_at' => $r['updated_at']];
    }
    return $out;
}

function topic_sheet_detail(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM topic_sheets WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Fiche introuvable.'); }
    // 🕘 &version=N : le contenu d'une version gardée (aperçu de la fenêtre « Versions »)
    $vid = safe_int($_GET['version'] ?? 0);
    if ($vid) {
        topic_versions_ensure($pdo);
        $v = $pdo->prepare('SELECT * FROM topic_sheet_versions WHERE id=? AND sheet_id=?'); $v->execute([$vid, $id]); $vr = $v->fetch(PDO::FETCH_ASSOC);
        if (!$vr) { throw new RuntimeException('Version introuvable.'); }
        $vd = json_decode((string) $vr['data_json'], true) ?: [];
        $vb = array_values(array_filter(array_map('topic_clean_block', is_array($vd['blocks'] ?? null) ? $vd['blocks'] : [])));
        return ['id' => $id, 'version' => $vid, 'title' => $vr['title'], 'subtitle' => $vr['subtitle'], 'blocks' => $vb, 'text' => topic_plain_text($vb), 'saved_at' => $vr['saved_at']];
    }
    $d = json_decode((string) $r['data_json'], true) ?: [];
    $blocks = array_values(array_filter(array_map('topic_clean_block', is_array($d['blocks'] ?? null) ? $d['blocks'] : [])));
    // 🤖 les blocs « Les personnes de la base qui… » : recalculés à chaque ouverture
    foreach ($blocks as &$b) { if ($b['type'] === 'auto') { $b['ids'] = topic_auto_people($pdo, $b); } }
    unset($b);
    // les personnes des blocs « Personnes » : nom, dates, portrait
    $ids = [];
    foreach ($blocks as $b) { if ($b['type'] === 'people' || $b['type'] === 'auto') { $ids = array_merge($ids, $b['ids']); } }
    $people = [];
    if ($ids) {
        $in = implode(',', array_map('intval', array_unique($ids)));
        foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, p.occupation,
                (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) AS birth_year,
                (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI')) AS death_year
            FROM persons p WHERE p.id IN ($in)") as $p) { $people[(int) $p['id']] = $p; }
    }
    return ['id' => (int) $r['id'], 'title' => $r['title'], 'subtitle' => $r['subtitle'], 'icon' => $r['icon'], 'color' => $r['color'],
        'template' => !empty($d['template']), 'blocks' => $blocks, 'people' => $people, 'media' => heritage_media($pdo, 'topic_sheet', [$id])[$id] ?? [],
        'labels' => function_exists('collection_labels') ? (collection_labels($pdo, 'topic_sheet', [$id])[$id] ?? []) : [], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'],
        'cited_in' => topic_cited_in($pdo, $id, (string) $r['title']), 'versions' => count(topic_versions_list($pdo, $id))];
}

function save_topic_sheet(PDO $pdo, array $data): array
{
    // 🕘 Versions : la liste, garder l'état actuel, revenir à une version ; ↶ remettre une fiche supprimée
    if (!empty($data['undelete'])) { return topic_undelete($pdo, safe_int($data['undelete'])); }
    if (!empty($data['versions_of'])) { return ['versions' => topic_versions_list($pdo, safe_int($data['versions_of']))]; }
    if (!empty($data['keep_version'])) { $vid = topic_snapshot($pdo, safe_int($data['id'] ?? 0), mb_substr(topic_text($data['label'] ?? 'gardée', 80), 0, 80) ?: 'gardée', true); return ['version' => $vid]; }
    if (!empty($data['restore_version'])) {
        $sid = safe_int($data['id'] ?? 0); $vid = safe_int($data['restore_version']);
        topic_versions_ensure($pdo);
        $v = $pdo->prepare("SELECT * FROM topic_sheet_versions WHERE id=? AND sheet_id=? AND reason<>'deleted'"); $v->execute([$vid, $sid]); $vr = $v->fetch(PDO::FETCH_ASSOC);
        if (!$vr) { throw new RuntimeException('Version introuvable.'); }
        $snap = topic_snapshot($pdo, $sid, 'avant retour', true);
        $pdo->prepare('UPDATE topic_sheets SET title=?, subtitle=?, icon=?, color=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$vr['title'], $vr['subtitle'], $vr['icon'], $vr['color'], $vr['data_json'], $sid]);
        log_change($pdo, 'meta', 0, 'update', 'Fiche remise à une version précédente : ' . $vr['title']);
        return ['id' => $sid, 'snapshot' => $snap];
    }
    $id = safe_int($data['id'] ?? 0);
    $title = topic_text($data['title'] ?? '', 200);
    if ($title === '') { throw new RuntimeException('Donne un titre à la fiche.'); }
    $icon = topic_text($data['icon'] ?? '📒', 16) ?: '📒';
    $color = preg_match('/^#[0-9a-f]{6}$/i', (string) ($data['color'] ?? '')) ? (string) $data['color'] : '';
    $blocks = array_values(array_filter(array_map('topic_clean_block', array_slice(is_array($data['blocks'] ?? null) ? $data['blocks'] : [], 0, 300))));
    $template = !empty($data['template']);
    if ($id) { // une fiche garde ce qu'elle est (fiche ou modèle)
        $s = $pdo->prepare('SELECT data_json FROM topic_sheets WHERE id=?'); $s->execute([$id]);
        $template = !empty((json_decode((string) $s->fetchColumn(), true) ?: [])['template']);
    }
    $json = json_encode(['blocks' => $blocks] + ($template ? ['template' => true] : []), JSON_UNESCAPED_UNICODE);
    $subtitle = topic_text($data['subtitle'] ?? '', 600);
    if ($id) {
        topic_snapshot($pdo, $id); // 🕘 l'état d'avant (une version toutes les 2 minutes au plus)
        $s = $pdo->prepare('UPDATE topic_sheets SET title=?, subtitle=?, icon=?, color=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $s->execute([$title, $subtitle, $icon, $color, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Fiche introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO topic_sheets(title, subtitle, icon, color, data_json) VALUES(?,?,?,?,?)')->execute([$title, $subtitle, $icon, $color, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    // les images des blocs supprimés ne restent pas rattachées à la fiche
    $keep = array_column(array_filter($blocks, static fn($b) => $b['type'] === 'images'), 'id');
    $del = $pdo->prepare("DELETE FROM family_collection_media WHERE collection_type='topic_sheet' AND collection_id=? AND role<>'' AND role LIKE 'b\\_%' ESCAPE '\\'" . ($keep ? ' AND role NOT IN (' . implode(',', array_fill(0, count($keep), '?')) . ')' : ''));
    $del->execute([$id, ...$keep]);
    log_change($pdo, 'meta', 0, ($data['id'] ?? 0) ? 'update' : 'create', ($template ? 'Modèle de fiche enregistré : ' : 'Fiche enregistrée : ') . $title);
    return ['id' => $id, 'title' => $title];
}

function delete_topic_sheet(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT title FROM topic_sheets WHERE id=?'); $s->execute([$id]);
    $title = $s->fetchColumn();
    if ($title === false) { throw new RuntimeException('Fiche introuvable.'); }
    // ↶ Annuler : la fiche, ses images et ses étiquettes sont gardées (topic_sheet_versions, raison « deleted »)
    $keep = ['media' => [], 'labels' => []];
    try { $m = $pdo->prepare("SELECT * FROM family_collection_media WHERE collection_type='topic_sheet' AND collection_id=?"); $m->execute([$id]); $keep['media'] = $m->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $e) {}
    try { $l = $pdo->prepare("SELECT label_id FROM label_links WHERE entity_type='topic_sheet' AND entity_id=?"); $l->execute([$id]); $keep['labels'] = array_map('intval', $l->fetchAll(PDO::FETCH_COLUMN)); } catch (Throwable $e) {}
    $row = $pdo->prepare('SELECT created_at FROM topic_sheets WHERE id=?'); $row->execute([$id]); $keep['created_at'] = (string) $row->fetchColumn();
    topic_snapshot($pdo, $id, 'deleted', true, $keep);
    heritage_delete_media_links($pdo, 'topic_sheet', $id);
    $pdo->prepare("DELETE FROM label_links WHERE entity_type='topic_sheet' AND entity_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM topic_sheets WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Fiche supprimée : ' . $title);
    return ['ok' => true];
}

/** ↶ remettre une fiche (ou un modèle) supprimée : même numéro, mêmes images et étiquettes */
function topic_undelete(PDO $pdo, int $id): array
{
    topic_versions_ensure($pdo);
    $e = $pdo->prepare('SELECT 1 FROM topic_sheets WHERE id=?'); $e->execute([$id]);
    if ($e->fetchColumn()) { return ['id' => $id, 'already' => true]; }
    $v = $pdo->prepare("SELECT * FROM topic_sheet_versions WHERE sheet_id=? AND reason='deleted' ORDER BY id DESC LIMIT 1"); $v->execute([$id]); $vr = $v->fetch(PDO::FETCH_ASSOC);
    if (!$vr) { throw new RuntimeException('Cette fiche ne peut plus être remise.'); }
    $x = json_decode((string) $vr['extra_json'], true) ?: [];
    $pdo->prepare('INSERT INTO topic_sheets(id, title, subtitle, icon, color, data_json, created_at) VALUES(?,?,?,?,?,?,COALESCE(NULLIF(?,\'\'),CURRENT_TIMESTAMP))')
        ->execute([$id, $vr['title'], $vr['subtitle'], $vr['icon'], $vr['color'], $vr['data_json'], (string) ($x['created_at'] ?? '')]);
    foreach (is_array($x['media'] ?? null) ? $x['media'] : [] as $m) {
        if (!is_array($m)) { continue; }
        $cols = array_values(array_filter(array_keys($m), static fn($k) => preg_match('/^[a-z_]{1,40}$/', (string) $k) && $k !== 'id'));
        try { $pdo->prepare('INSERT INTO family_collection_media(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_map(static fn($k) => $m[$k], $cols)); } catch (Throwable $e2) {}
    }
    foreach (is_array($x['labels'] ?? null) ? $x['labels'] : [] as $lid) { try { $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'topic_sheet', ?)")->execute([(int) $lid, $id]); } catch (Throwable $e3) {} }
    $pdo->prepare('DELETE FROM topic_sheet_versions WHERE id=?')->execute([(int) $vr['id']]);
    log_change($pdo, 'meta', 0, 'create', 'Fiche remise : ' . $vr['title']);
    return ['id' => $id, 'title' => $vr['title']];
}
