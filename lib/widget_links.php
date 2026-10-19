<?php
declare(strict_types=1);

/**
 * 🔗 Widget « Raccourcis » (assets/js/heritage-shortcuts.js) : ce dont il a besoin côté serveur.
 *
 *  1. Des sortes en plus pour le menu de choix unique (lib/picker.php, recherche mélangée) :
 *     sheet (📒 Fiches), atelier (📚 projets de l'Atelier), board (🧩 tableaux), layout (📐 mises en page et livres),
 *     diagram (🏛️ diagrammes), oldmap (🗺️ cartes anciennes), act (📜 transcriptions d'actes).
 *     Même forme d'item que les autres sortes : {kind, id, title, meta, badge, group, icon, thumb?, short}.
 *
 *  2. GET api.php?action=shortcut_info&targets=person:12,list:persons,… → {items: {"person:12": {ok, title, short, thumb, …}}}
 *     Pour chaque tuile : la cible existe-t-elle encore (sinon « introuvable »), son titre, sa vignette, et une petite
 *     info en direct (années d'une personne, nombre d'éléments d'une liste). 120 cibles au plus ; lecture seule ;
 *     requêtes préparées ; une table absente (ancienne base) donne « introuvable » ou pas de nombre, sans erreur.
 */

/** Sortes ajoutées au menu de choix : clé => [fonction, libellé du filtre] */
const WIDGET_LINK_PICKER_KINDS = [
    'sheet' => ['picker_wl_sheets', '📒 Fiches'],
    'atelier' => ['picker_wl_atelier', '📚 Atelier'],
    'board' => ['picker_wl_boards', '🧩 Tableaux'],
    'layout' => ['picker_wl_layouts', '📐 Mises en page'],
    'diagram' => ['picker_wl_diagrams', '🏛️ Diagrammes'],
    'oldmap' => ['picker_wl_oldmaps', '🗺️ Cartes'],
    'act' => ['picker_wl_acts', '📜 Transcriptions'],
];

/** Un texte court sur une ligne (titres venus de la base). */
function wl_line(mixed $v, int $max = 160): string
{
    return mb_substr(trim((string) preg_replace('/\s+/u', ' ', (string) $v)), 0, $max);
}

function picker_wl_sheets(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'topic_sheets')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    // les modèles de fiche (data_json.template) ne sont pas des fiches à ouvrir
    $where = picker_text_where(['t.title', 't.subtitle'], $q, $params) . " AND COALESCE(json_extract(t.data_json, '$.template'), 0) IN (0, '', 'false')";
    [$total, $rows] = picker_page($pdo, 'SELECT t.id, t.title, t.subtitle, t.icon, t.updated_at', "FROM topic_sheets t WHERE {$where}", 't.updated_at DESC, t.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'sheet', 'id' => (int) $r['id'], 'title' => wl_line($r['title']) ?: 'Fiche #' . $r['id'],
        'meta' => implode(' · ', array_filter(['Fiche', wl_line($r['subtitle'])])), 'badge' => '', 'badge_style' => '', 'group' => 'sheet',
        'icon' => wl_line($r['icon'], 16) ?: '📒', 'short' => wl_line($r['subtitle'], 60),
    ], $rows)];
}

function picker_wl_atelier(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'atelier_projects')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['a.title', 'a.subtitle', 'a.description'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT a.id, a.title, a.subtitle, a.icon, a.status, a.kind', "FROM atelier_projects a WHERE {$where}", "CASE a.status WHEN 'active' THEN 0 ELSE 1 END, a.updated_at DESC, a.id DESC", $params, $offset, $limit);
    $kinds = ['these' => 'Thèse', 'livre' => 'Livre', 'article' => 'Article', 'memoire' => 'Mémoire', 'exposition' => 'Exposition', 'enquete' => 'Enquête', 'autre' => 'Autre'];
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'atelier', 'id' => (int) $r['id'], 'title' => wl_line($r['title']) ?: 'Projet #' . $r['id'],
        'meta' => implode(' · ', array_filter(['Atelier', $kinds[(string) $r['kind']] ?? '', wl_line($r['subtitle'])])),
        'badge' => in_array($r['status'], ['done', 'archived'], true) ? 'Terminé' : ($r['status'] === 'paused' ? 'En pause' : ''), 'badge_style' => '', 'group' => 'atelier',
        'icon' => wl_line($r['icon'], 16) ?: '📚', 'short' => $kinds[(string) $r['kind']] ?? '',
    ], $rows)];
}

function picker_wl_boards(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'boards')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['b.title', 'b.part'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT b.id, b.title, b.icon, b.part, b.thumb, b.item_count', "FROM boards b WHERE {$where}", 'b.updated_at DESC, b.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'board', 'id' => (int) $r['id'], 'title' => wl_line($r['title']) ?: 'Tableau #' . $r['id'],
        'meta' => implode(' · ', array_filter(['Tableau', wl_line($r['part']), picker_plural((int) $r['item_count'], 'objet')])), 'badge' => '', 'badge_style' => '', 'group' => 'board',
        'icon' => wl_line($r['icon'], 16) ?: '🧩', 'thumb' => str_starts_with((string) $r['thumb'], 'data:image/') && strlen((string) $r['thumb']) < 400000 ? (string) $r['thumb'] : '', 'short' => '',
    ], $rows)];
}

function picker_wl_layouts(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'layout_documents')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['d.name'], $q, $params);
    [$total, $rows] = picker_page($pdo, "SELECT d.id, d.name, d.is_design, COALESCE(json_array_length(d.data_json, '$.pages'), 0) AS pages", "FROM layout_documents d WHERE {$where}", 'd.updated_at DESC, d.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'layout', 'id' => (int) $r['id'], 'title' => wl_line($r['name']) ?: 'Sans titre',
        'meta' => implode(' · ', array_filter([(int) $r['is_design'] ? 'Design (mise en page)' : 'Livre (mise en page)', (int) $r['pages'] ? picker_plural((int) $r['pages'], 'page') : ''])),
        'badge' => '', 'badge_style' => '', 'group' => 'layout', 'icon' => (int) $r['is_design'] ? '🎨' : '📖', 'short' => (int) $r['pages'] ? picker_plural((int) $r['pages'], 'page') : '',
    ], $rows)];
}

function picker_wl_diagrams(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'diagrams')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['d.name', 'd.kind'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT d.id, d.name, d.kind', "FROM diagrams d WHERE {$where}", 'd.position, d.updated_at DESC, d.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static fn($r) => [
        'kind' => 'diagram', 'id' => (int) $r['id'], 'title' => wl_line($r['name']) ?: 'Diagramme #' . $r['id'],
        'meta' => 'Diagramme', 'badge' => '', 'badge_style' => '', 'group' => 'diagram', 'icon' => '🏛️', 'short' => '', 'diagram_kind' => wl_line($r['kind'], 40),
    ], $rows)];
}

function picker_wl_oldmaps(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'old_maps')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['o.title', 'o.year_text', 'o.notes'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT o.id, o.title, o.year_text, m.filename, m.thumbnail', "FROM old_maps o LEFT JOIN media m ON m.id=o.media_id WHERE {$where}", 'o.updated_at DESC, o.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static function ($r) {
        $img = trim((string) $r['thumbnail']) ?: trim((string) $r['filename']);
        return ['kind' => 'oldmap', 'id' => (int) $r['id'], 'title' => wl_line($r['title']) ?: 'Carte #' . $r['id'],
            'meta' => implode(' · ', array_filter(['Carte ancienne', wl_line($r['year_text'], 40)])), 'badge' => '', 'badge_style' => '', 'group' => 'oldmap', 'icon' => '🗺️',
            'thumb' => $img !== '' ? 'media/' . rawurlencode($img) : '', 'short' => wl_line($r['year_text'], 40)];
    }, $rows)];
}

function picker_wl_acts(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'act_transcriptions')) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = picker_text_where(['t.title', 't.place', 't.date_text', 't.source'], $q, $params);
    [$total, $rows] = picker_page($pdo, 'SELECT t.id, t.title, t.date_text, t.place, m.filename, m.thumbnail', "FROM act_transcriptions t LEFT JOIN media m ON m.id=t.media_id WHERE {$where}", 't.updated_at DESC, t.id DESC', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static function ($r) {
        $img = trim((string) $r['thumbnail']) ?: trim((string) $r['filename']);
        return ['kind' => 'act', 'id' => (int) $r['id'], 'title' => wl_line($r['title']) ?: 'Transcription #' . $r['id'],
            'meta' => implode(' · ', array_filter(['Transcription d’acte', wl_line($r['date_text'], 40), wl_line($r['place'], 80)])), 'badge' => '', 'badge_style' => '', 'group' => 'act', 'icon' => '📜',
            'thumb' => $img !== '' ? 'media/' . rawurlencode($img) : '', 'short' => wl_line($r['date_text'], 40)];
    }, $rows)];
}

/** Listes de l'app et leur nombre d'éléments : type de liste => [table, condition SQL fixe (sans valeur tapée)] */
function widget_links_list_counts(): array
{
    return [
        'persons' => ['persons', "COALESCE(kind,'human')<>'animal'"], 'pets' => ['persons', "kind='animal'"], 'events' => ['events', ''], 'places' => ['places', ''],
        'media' => ['media', ''], 'audios' => ['media', "media_type='audio'"], 'videos' => ['media', "media_type='video'"], 'labels' => ['labels', ''],
        'employers' => ['employer_records', ''], 'census' => ['census_records', ''], 'reminders' => ['standalone_reminders', ''], 'courriers' => ['courriers', ''],
        'living_contacts' => ['living_contacts', ''], 'family_objects' => ['family_objects', ''], 'family_memories' => ['family_memories', ''], 'fairs' => ['genealogy_fairs', ''],
        'closed_branches' => ['closed_branches', ''], 'field_trips' => ['field_trips', ''], 'family_papers' => ['family_papers', ''], 'coats_of_arms' => ['coats_of_arms', ''],
        'old_maps' => ['old_maps', ''], 'probate' => ['probate_inventories', ''], 'cited_names' => ['cited_names', ''], 'help_requests' => ['help_requests', ''],
        'voter_cards' => ['voter_cards', ''], 'family_booklets' => ['family_booklets', ''], 'investigations_list' => ['investigations', ''], 'battues_list' => ['battues', ''],
        'atelier_list' => ['atelier_projects', ''], 'boards_list' => ['boards', ''], 'topic_sheets_list' => ['topic_sheets', "COALESCE(json_extract(data_json, '$.template'), 0) IN (0, '', 'false')"],
        'layout_books' => ['layout_documents', ''], 'houses' => ['houses', ''], 'periodicals' => ['periodicals', ''], 'press_ads' => ['press_ads', ''],
        'recueils' => ['recueils', ''], 'graphs_list' => ['custom_widgets', 'deleted_at IS NULL'], 'research_budget' => ['research_budget', ''],
    ];
}

/** Nombre d'éléments d'une liste de l'app, ou null si on ne sait pas le dire. */
function widget_links_list_count(PDO $pdo, string $type): ?int
{
    $map = widget_links_list_counts();
    if (!isset($map[$type])) { return null; }
    [$table, $cond] = $map[$type];
    if (!picker_table_exists($pdo, $table)) { return null; }
    try { return (int) $pdo->query('SELECT count(*) FROM ' . $table . ($cond !== '' ? ' WHERE ' . $cond : ''))->fetchColumn(); }
    catch (Throwable $e) { return null; }
}

/**
 * Ce que montrent les tuiles : GET targets=kind:id,… (sortes du menu de choix) et list:type.
 * → ['items' => ["person:12" => ['ok' => true, 'title' => …, 'short' => …, 'thumb' => …], "list:persons" => ['ok' => true, 'count' => 42], …]]
 */
function widget_links_info(PDO $pdo, array $get): array
{
    picker_register($pdo);
    $raw = array_slice(array_values(array_unique(array_filter(array_map('trim', explode(',', substr(scalar_text($get['targets'] ?? '', 'targets'), 0, 8000)))))), 0, 120);
    $out = [];
    $byKind = [];
    foreach ($raw as $t) {
        if (preg_match('/^list:([a-z0-9_]{1,40})$/', $t, $m)) {
            $n = widget_links_list_count($pdo, $m[1]);
            $out[$t] = ['ok' => true] + ($n === null ? [] : ['count' => $n]);
            continue;
        }
        if (preg_match('/^([a-z]{2,16}):(\d{1,10})$/', $t, $m) && in_array($m[1], PICKER_KINDS, true) && $m[1] !== 'graph') {
            $byKind[$m[1]][] = (int) $m[2];
        }
    }
    foreach ($byKind as $kind => $ids) {
        $ids = array_values(array_unique(array_filter($ids, static fn(int $i): bool => $i > 0)));
        if (!$ids) { continue; }
        foreach ($ids as $id) { $out[$kind . ':' . $id] = ['ok' => false]; }
        foreach (array_chunk($ids, 100) as $chunk) { // une page du menu de choix = 100 au plus : sinon les suivantes passeraient pour « introuvables »
        picker_ids($chunk);
        try {
            $r = picker_kind($pdo, $kind, '', 0, 100, ['animals' => true, 'mixed' => false, 'person_id' => 0, 'media_type' => '', 'media_types' => [], 'media_sort' => '',
                'portraits' => false, 'recent' => false, 'recent_ids' => [], 'media_flag' => '', 'with_text' => false, 'art_kind' => '', 'art_person' => 0, 'graph_kinds' => '']);
            foreach ($r['groups'] as $g) {
                foreach ($g['items'] as $it) {
                    if (empty($it['id']) || !in_array((int) $it['id'], $chunk, true)) { continue; }
                    $key = $kind . ':' . (int) $it['id'];
                    $out[$key] = ['ok' => true, 'title' => (string) ($it['title'] ?? ''), 'short' => (string) ($it['short'] ?? ''), 'thumb' => (string) ($it['thumb'] ?? ''),
                        'icon' => (string) ($it['icon'] ?? ''), 'color' => (string) ($it['color'] ?? ''), 'kind' => (string) ($it['kind'] ?? $kind)]
                        + array_intersect_key($it, array_flip(['gender', 'initials', 'name', 'county', 'lat', 'lon', 'country', 'key', 'uid', 'art_kind', 'media_type', 'filename', 'person_id']));
                }
            }
        } catch (Throwable $e) {
            error_log('[shortcut_info] ' . $kind . ' : ' . $e->getMessage());
        } finally {
            picker_ids([]);
        }
        }
        // une source : la première fiche qui la cite (une source n'a pas d'écran à elle)
        if ($kind === 'source') {
            foreach ($ids as $id) {
                if (empty($out['source:' . $id]['ok'])) { continue; }
                try {
                    $s = $pdo->prepare("SELECT CASE WHEN l.entity_type='person' THEN l.entity_id ELSE e.person_id END FROM source_links l LEFT JOIN events e ON l.entity_type='event' AND e.id=l.entity_id
                        WHERE l.source_record_id=? AND (l.entity_type='person' OR e.person_id IS NOT NULL) ORDER BY l.id LIMIT 1");
                    $s->execute([$id]);
                    $pid = (int) $s->fetchColumn();
                    if ($pid > 0) { $out['source:' . $id]['open_person'] = $pid; }
                } catch (Throwable $e) { /* ancienne base : pas de fiche à ouvrir */ }
            }
        }
    }
    return ['items' => $out];
}
