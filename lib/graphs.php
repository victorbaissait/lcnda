<?php
declare(strict_types=1);

/**
 * 📈 Mes graphiques (et mes widgets) rangés dans la base : table custom_widgets, une ligne par définition faite dans
 * Réglages → Éditeur de graphiques ou → Éditeur de widgets (interface : assets/js/heritage-widgets.js).
 * Avant, ils vivaient dans le réglage « genealogie-custom-widgets » (une seule valeur JSON) : le navigateur les envoie
 * une seule fois ici au premier chargement (op « import », jamais par-dessus une définition déjà connue ou supprimée).
 * Rangés en lignes, ils se cherchent dans le menu de choix commun (picker_search, sorte « graph », lib/picker.php)
 * et dans la recherche rapide (⌘K).
 *
 *   GET  api.php?action=graphs                       → {graphs: [définitions], info: {uid: {rid, places, …}}, gone: [uid…]}
 *   POST api.php?action=graphs_write {op: 'save'   , defs: [définition…], delete: [uid…], csrf}
 *                                    {op: 'import' , defs: [définition…], csrf}  (seulement les inconnues)
 *                                    {op: 'thumb'  , uid, thumb: 'data:image/png;base64,…', csrf}
 *
 * La table est créée au premier enregistrement (CREATE TABLE IF NOT EXISTS, comme lib/puzzle.php) : pas de nouveau
 * numéro de structure ; une base qui ne l'a pas encore se lit comme « aucun graphique ». Elle suit la sauvegarde
 * complète et la restauration (copie du fichier de la base). Une définition supprimée garde sa ligne (deleted_at,
 * sans son contenu) : un autre navigateur resté à l'ancien réglage ne peut pas la faire revenir.
 * Tout ce qui arrive du navigateur est relu : identifiant, sorte (liste blanche), textes (scalar_text, longueurs),
 * couleur, largeur, profondeur et taille du JSON ; une définition abîmée ou forgée est refusée en entier.
 * Mode consultation : graphs_write est refusé par kiosk_guard() (api.php), comme toute écriture.
 */

const GRAPH_ACTIONS = ['graphs', 'graphs_write'];
const GRAPH_DEF_MAX_BYTES = 2 * 1024 * 1024;  // une définition (un parcours de 300 étapes avec leurs textes tient dedans)
const GRAPH_MAX = 2000;                         // définitions gardées dans une base
const GRAPH_BATCH = 500;                        // définitions reçues en un envoi
const GRAPH_THUMB_MAX = 120_000;                // vignette PNG/JPEG/WebP (data:…) en octets
const GRAPH_KINDS = ['numbers', 'list', 'chart', 'appstat', 'screen', 'diagram', 'text', 'links', 'journey', 'app'];
const GRAPH_WIDTHS = ['12', '6', '4', '3', '8', '9']; // 1, ½, ⅓, ¼, ⅔, ¾ (WIDTHS de heritage-widgets.js)
// clés dont la valeur est un objet côté navigateur (un {} vide reste un objet, pas une liste)
const GRAPH_OBJECT_KEYS = ['valueColors', 'src', 'free', 'definition', 'sort', 'place', 'filters'];
const GRAPH_STYLE_LABELS = ['bars' => 'Barres', 'columns' => 'Colonnes', 'pie' => 'Camembert', 'donut' => 'Anneau', 'line' => 'Courbe',
    'area' => 'Aire', 'tiles' => 'Mosaïque', 'table' => 'Tableau des chiffres'];
const GRAPH_KIND_LABELS = ['chart' => 'Graphique', 'appstat' => 'Graphique', 'numbers' => 'Chiffres', 'list' => 'Liste',
    'screen' => 'Écran de l’app', 'diagram' => 'Diagramme', 'text' => 'Texte', 'links' => 'Raccourcis', 'journey' => 'Parcours', 'app' => 'Widget de l’app habillé'];
const GRAPH_APP_STATS = ['surnames' => 'Noms', 'firstnames' => 'Prénoms', 'birth_places' => 'Lieux de naissance', 'marriage_places' => 'Lieux de mariage',
    'death_places' => 'Lieux de décès', 'birth_countries' => 'Pays de naissance', 'death_countries' => 'Pays de décès', 'sex_distribution' => 'Sexes',
    'birth_years' => 'Années de naissance', 'death_years' => 'Années de décès', 'age_at_death' => 'Âge au décès', 'death_causes' => 'Causes de décès',
    'children_per_family' => 'Enfants par famille'];

function graphs_ensure(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS custom_widgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL DEFAULT 'chart',
        name TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT '',
        in_stats INTEGER NOT NULL DEFAULT 0,
        is_graph INTEGER NOT NULL DEFAULT 0,
        draw_label TEXT NOT NULL DEFAULT '',
        data_label TEXT NOT NULL DEFAULT '',
        search_text TEXT NOT NULL DEFAULT '',
        def_json TEXT NOT NULL DEFAULT '{}',
        thumb TEXT NOT NULL DEFAULT '',
        thumb_at TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_custom_widgets_live ON custom_widgets(deleted_at, position)');
}

function graphs_table_exists(PDO $pdo): bool
{
    return (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='custom_widgets'")->fetchColumn();
}

function graph_uid(mixed $v): string
{
    $uid = is_string($v) ? $v : '';
    if (!preg_match('/^cw_[a-z0-9]{4,24}$/', $uid)) { throw new LcndaBadInput('Graphique inconnu (identifiant invalide).'); }
    return $uid;
}

function graph_text(mixed $v, int $max, string $what): string
{
    return mb_substr(trim(str_replace(["\r\n", "\0"], ["\n", ''], scalar_text($v, $what))), 0, $max);
}

/** Profondeur d'un tableau PHP (refus au-delà de $max : JSON forgé en poupées russes). */
function graph_depth_ok(mixed $v, int $max, int $d = 0): bool
{
    if (!is_array($v)) { return true; }
    if ($d >= $max) { return false; }
    foreach ($v as $x) { if (!graph_depth_ok($x, $max, $d + 1)) { return false; } }
    return true;
}

/** Une sorte qui se dessine (graphique de l'éditeur ou graphique de l'app redessiné) : posable partout comme diagramme. */
function graph_is_drawable(string $kind): bool { return in_array($kind, ['chart', 'appstat'], true); }
/** Ce que la liste « Graphiques et diagrammes » appelle un graphique (ext.myStatDefs dans heritage-widgets.js). */
function graph_is_graph(string $kind, bool $inStats): bool { return $kind !== 'app' && ($inStats || graph_is_drawable($kind)); }

/**
 * Une définition reçue, relue : → [uid, kind, name, icon, inStats, json, draw_label, data_label, search_text].
 * Les champs du haut sont remis au propre ; le reste (critères, chiffres, colonnes…) est gardé tel quel (le navigateur
 * l'affiche toujours échappé et le relit avec cleanDef) mais borné en taille et en profondeur.
 */
function graph_clean_def(mixed $d): array
{
    if (!is_array($d) || ($d && array_is_list($d))) { throw new LcndaBadInput('Graphique illisible.'); }
    if (count($d) > 80) { throw new LcndaBadInput('Graphique illisible (trop de champs).'); }
    foreach (array_keys($d) as $k) {
        if (!is_string($k) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,40}$/', $k)) { throw new LcndaBadInput('Graphique illisible (champ inconnu).'); }
    }
    if (!graph_depth_ok($d, 12)) { throw new LcndaBadInput('Graphique illisible (trop imbriqué).'); }
    $uid = graph_uid($d['id'] ?? null);
    $kind = scalar_text($d['kind'] ?? '', 'kind');
    if (!in_array($kind, GRAPH_KINDS, true)) { throw new LcndaBadInput('Sorte de graphique inconnue.'); }
    $d['id'] = $uid;
    $d['kind'] = $kind;
    $d['name'] = graph_text($d['name'] ?? '', 80, 'name');
    $d['icon'] = graph_text($d['icon'] ?? '', 16, 'icon');
    $d['note'] = graph_text($d['note'] ?? '', 1000, 'note');
    if (array_key_exists('caption', $d)) { $d['caption'] = graph_text($d['caption'], 400, 'caption'); }
    if (array_key_exists('text', $d)) { $d['text'] = graph_text($d['text'], 5000, 'text'); }
    if (array_key_exists('style', $d)) {
        $st = scalar_text($d['style'], 'style');
        $d['style'] = (isset(GRAPH_STYLE_LABELS[$st]) || preg_match('/^dg:[a-z0-9_]{2,30}(:[a-z0-9_]{1,30})?$/', $st)) ? $st : 'bars';
    }
    $color = scalar_text($d['color'] ?? '', 'color');
    $d['color'] = preg_match('/^#[0-9a-f]{6}$/i', $color) ? $color : '';
    $width = scalar_text($d['width'] ?? '6', 'width');
    $d['width'] = in_array($width, GRAPH_WIDTHS, true) ? $width : '6';
    $d['inStats'] = !empty($d['inStats']) && $kind !== 'app';
    if (isset($d['parts']) && (!is_array($d['parts']) || count($d['parts']) > 8)) { throw new LcndaBadInput('Graphique illisible (parties).'); }
    // le petit résumé du menu de choix, envoyé par l'éditeur (« Hémicycle » pour un dessin de diagramme) : un simple texte
    $hint = is_array($d['_hint'] ?? null) ? $d['_hint'] : [];
    unset($d['_hint']);
    $json = json_encode(json_keep_objects($d, GRAPH_OBJECT_KEYS), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false || strlen($json) > GRAPH_DEF_MAX_BYTES) { throw new LcndaBadInput('Graphique trop gros pour être enregistré (2 Mo au plus).'); }
    $style = (string) ($d['style'] ?? '');
    $draw = GRAPH_STYLE_LABELS[$style] ?? '';
    if ($draw === '' && str_starts_with($style, 'dg:')) { $draw = graph_text($hint['draw'] ?? '', 60, 'draw') ?: 'Diagramme'; }
    $src = is_array($d['src'] ?? null) ? $d['src'] : [];
    if ($kind === 'appstat') {
        $data = '🔄 Statistique de l’app : ' . (GRAPH_APP_STATS[(string) ($d['statType'] ?? '')] ?? 'autre');
    } elseif ($kind === 'chart' && ($src['source'] ?? '') === 'manual') {
        $data = '✍️ Mes chiffres';
    } elseif (in_array($kind, ['chart', 'list', 'numbers'], true)) {
        $data = '🔄 Données de l’app';
    } else {
        $data = '';
    }
    $search = mb_substr(implode(' ', array_filter([$d['name'], $d['note'], (string) ($d['caption'] ?? ''), GRAPH_KIND_LABELS[$kind] ?? '', $draw, $data])), 0, 2000);
    return [$uid, $kind, $d['name'], $d['icon'], $d['inStats'], $json, $draw, $data, $search];
}

/** Enregistre (crée ou remplace) une définition relue. $onlyNew : ne touche jamais une ligne existante (reprise). */
function graph_store(PDO $pdo, array $c, bool $onlyNew = false): bool
{
    [$uid, $kind, $name, $icon, $inStats, $json, $draw, $data, $search] = $c;
    $s = $pdo->prepare('SELECT id, deleted_at FROM custom_widgets WHERE uid=?'); $s->execute([$uid]);
    $old = $s->fetch(PDO::FETCH_ASSOC);
    if ($old && $onlyNew) { return false; }
    $vals = [$kind, $name, $icon, $inStats ? 1 : 0, graph_is_graph($kind, $inStats) ? 1 : 0, $draw, $data, $search, $json];
    if ($old) {
        $pdo->prepare('UPDATE custom_widgets SET kind=?, name=?, icon=?, in_stats=?, is_graph=?, draw_label=?, data_label=?, search_text=?, def_json=?, deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE uid=?')->execute([...$vals, $uid]);
        return true;
    }
    if ((int) $pdo->query('SELECT count(*) FROM custom_widgets WHERE deleted_at IS NULL')->fetchColumn() >= GRAPH_MAX) {
        throw new RuntimeException('Les ' . GRAPH_MAX . ' graphiques et widgets sont gardés : supprime-en un pour en créer un autre.');
    }
    $pdo->prepare('INSERT INTO custom_widgets(kind, name, icon, in_stats, is_graph, draw_label, data_label, search_text, def_json, uid, position) VALUES(?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),0)+10 FROM custom_widgets))')->execute([...$vals, $uid]);
    return true;
}

function graph_defs_in(mixed $v): array
{
    if ($v === null) { return []; }
    if (!is_array($v) || !array_is_list($v)) { throw new LcndaBadInput('Liste de graphiques illisible.'); }
    if (count($v) > GRAPH_BATCH) { throw new LcndaBadInput('Trop de graphiques en un envoi (' . GRAPH_BATCH . ' au plus).'); }
    return $v;
}

function graphs_save(PDO $pdo, array $data): array
{
    graphs_ensure($pdo);
    $clean = array_map('graph_clean_def', graph_defs_in($data['defs'] ?? null)); // tout est relu avant d'écrire quoi que ce soit
    $del = graph_defs_in($data['delete'] ?? null);
    $del = array_values(array_unique(array_map('graph_uid', $del)));
    foreach ($clean as $c) { graph_store($pdo, $c); }
    if ($del) {
        $s = $pdo->prepare("UPDATE custom_widgets SET deleted_at=CURRENT_TIMESTAMP, def_json='{}', thumb='', search_text='', updated_at=CURRENT_TIMESTAMP WHERE uid=? AND deleted_at IS NULL");
        // un graphique encore seulement dans un navigateur (pas encore repris) : sa ligne « supprimée » l'empêche de revenir
        $t = $pdo->prepare("INSERT OR IGNORE INTO custom_widgets(uid, def_json, deleted_at) VALUES(?, '{}', CURRENT_TIMESTAMP)");
        foreach ($del as $uid) { $s->execute([$uid]); $t->execute([$uid]); }
    }
    if ($clean || $del) { log_change($pdo, 'meta', 0, 'update', 'Graphiques enregistrés : ' . implode(', ', array_map(static fn($c) => $c[2] ?: $c[0], array_slice($clean, 0, 5))) . ($del ? ' (' . count($del) . ' supprimé' . (count($del) > 1 ? 's' : '') . ')' : '')); }
    return ['ok' => true, 'saved' => array_map(static fn($c) => $c[0], $clean), 'deleted' => $del] + graphs_list($pdo);
}

/** Reprise des graphiques d'un navigateur : seules les définitions inconnues entrent (jamais une supprimée ou plus récente). */
function graphs_import(PDO $pdo, array $data): array
{
    graphs_ensure($pdo);
    $in = graph_defs_in($data['defs'] ?? null);
    $imported = 0; $refused = 0;
    foreach ($in as $d) {
        try { $c = graph_clean_def($d); } catch (LcndaBadInput) { $refused++; continue; } // une ancienne définition abîmée ne bloque pas les autres
        if (graph_store($pdo, $c, true)) { $imported++; }
    }
    if ($imported) { log_change($pdo, 'meta', 0, 'update', 'Graphiques repris du navigateur : ' . $imported); }
    return ['ok' => true, 'imported' => $imported, 'refused' => $refused] + graphs_list($pdo);
}

function graphs_thumb(PDO $pdo, array $data): array
{
    $uid = graph_uid($data['uid'] ?? null);
    $t = scalar_text($data['thumb'] ?? '', 'thumb');
    if ($t !== '') {
        if (strlen($t) > GRAPH_THUMB_MAX || !preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$#', $t, $m)) { throw new LcndaBadInput('Vignette refusée.'); }
        $bin = base64_decode($m[2], true);
        $size = $bin === false ? false : @getimagesizefromstring($bin);
        if (!$size || $size[0] < 8 || $size[1] < 8 || $size[0] > 640 || $size[1] > 640 || !in_array($size['mime'] ?? '', ['image/png', 'image/jpeg', 'image/webp'], true)) { throw new LcndaBadInput('Vignette refusée.'); }
    }
    if (!graphs_table_exists($pdo)) { throw new RuntimeException('Graphique introuvable.'); }
    $s = $pdo->prepare('UPDATE custom_widgets SET thumb=?, thumb_at=CURRENT_TIMESTAMP WHERE uid=? AND deleted_at IS NULL'); $s->execute([$t, $uid]);
    if (!$s->rowCount()) { throw new RuntimeException('Graphique introuvable.'); }
    return ['ok' => true, 'uid' => $uid];
}

/**
 * Où chaque graphique est posé : « Graphiques → Mes graphiques », le tableau de bord, un onglet à soi, une Fiche, et
 * chaque fiche, enquête ou projet de l'Atelier où son diagramme « qui suit » est rattaché. → [uid => ['n' => …, 'where' => [...]]]
 */
function graphs_places(PDO $pdo, array $rows): array
{
    $uids = array_map(static fn($r) => (string) $r['uid'], $rows);
    if (!$uids) { return []; }
    $out = [];
    foreach ($rows as $r) { $out[(string) $r['uid']] = ['n' => 0, 'where' => []]; if ((int) $r['in_stats']) { $out[(string) $r['uid']]['n']++; $out[(string) $r['uid']]['where'][] = 'Graphiques → Mes graphiques'; } }
    $add = static function (string $uid, string $where, int $n = 1) use (&$out): void { if ($n > 0 && isset($out[$uid])) { $out[$uid]['n'] += $n; $out[$uid]['where'][] = $where; } };
    $boards = [];
    try {
        foreach ($pdo->query("SELECT key, value FROM app_settings WHERE key IN ('genealogie-dashboard-blocks','genealogie-custom-tabs')") as $s) { $boards[(string) $s['key']] = (string) $s['value']; }
    } catch (Throwable) {}
    foreach ($uids as $uid) {
        $needle = '"' . $uid . '"';
        if (str_contains($boards['genealogie-dashboard-blocks'] ?? '', $needle)) { $add($uid, 'tableau de bord'); }
        if (str_contains($boards['genealogie-custom-tabs'] ?? '', $needle)) { $add($uid, 'onglet à toi'); }
    }
    try {
        $sheets = $pdo->query("SELECT data_json FROM topic_sheets WHERE data_json LIKE '%\"cw\\_%' ESCAPE '\\'")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($uids as $uid) {
            $n = 0;
            foreach ($sheets as $j) { if (str_contains((string) $j, '"' . $uid . '"')) { $n++; } }
            $add($uid, $n > 1 ? $n . ' Fiches' : 'une Fiche', $n);
        }
    } catch (Throwable) {}
    try {
        $has = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='diagram_links'")->fetchColumn();
        if ($has) {
            $s = $pdo->query("SELECT d.spec_json, (SELECT count(*) FROM diagram_links l WHERE l.diagram_id=d.id) AS n FROM diagrams d WHERE d.spec_json LIKE '%\"follow\":true%'");
            foreach ($s as $d) {
                $spec = json_decode((string) $d['spec_json'], true);
                $key = is_array($spec) ? (string) ($spec['live']['key'] ?? '') : '';
                if (str_starts_with($key, 'my:')) { $add(substr($key, 3), 'fiches, enquêtes ou Atelier', (int) $d['n']); }
            }
        }
    } catch (Throwable) {}
    return $out;
}

/** Les définitions (dans leur ordre), leurs infos de rangement et les identifiants supprimés. */
function graphs_list(PDO $pdo): array
{
    if (!graphs_table_exists($pdo)) { return ['graphs' => [], 'info' => new stdClass(), 'gone' => [], 'stored' => false]; }
    $rows = $pdo->query('SELECT id, uid, kind, in_stats, def_json, created_at, updated_at, thumb_at, (thumb<>\'\') AS has_thumb FROM custom_widgets WHERE deleted_at IS NULL ORDER BY position, id')->fetchAll(PDO::FETCH_ASSOC);
    $places = graphs_places($pdo, $rows);
    $defs = []; $info = [];
    foreach ($rows as $r) {
        $d = json_decode((string) $r['def_json'], true);
        if (!is_array($d)) { continue; }
        // le JSON rangé garde ses {} : on le renvoie tel quel (json_decode en tableau les changerait en [])
        $defs[] = json_decode((string) $r['def_json']);
        $info[(string) $r['uid']] = ['rid' => (int) $r['id'], 'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at'],
            'thumb_ok' => (bool) $r['has_thumb'] && $r['thumb_at'] !== null && (string) $r['thumb_at'] >= (string) $r['updated_at'],
            'places' => $places[(string) $r['uid']]['n'] ?? 0, 'where' => $places[(string) $r['uid']]['where'] ?? []];
    }
    $gone = $pdo->query('SELECT uid FROM custom_widgets WHERE deleted_at IS NOT NULL ORDER BY id DESC LIMIT 5000')->fetchAll(PDO::FETCH_COLUMN);
    return ['graphs' => $defs, 'info' => $info ?: new stdClass(), 'gone' => array_map('strval', $gone), 'stored' => true];
}

/** Pour index.php : la liste injectée dans la page (sans vignettes), lue avant le démarrage de l'interface. */
function graphs_for_page(): ?array
{
    try { return graphs_list(db()); } catch (Throwable) { return null; }
}

/** 🔍 Menu de choix (picker_search, sorte « graph ») : les graphiques, avec la ligne grise et la vignette. */
function picker_graphs(PDO $pdo, string $q, int $offset, int $limit, array $opts): array
{
    if (!graphs_table_exists($pdo)) { return ['total' => 0, 'items' => []]; }
    $params = [];
    $where = ['g.deleted_at IS NULL'];
    $kinds = array_values(array_intersect(explode(',', (string) ($opts['graph_kinds'] ?? '')), GRAPH_KINDS));
    if ($kinds) {
        $in = [];
        foreach ($kinds as $i => $k) { $in[] = ":gk{$i}"; $params[":gk{$i}"] = $k; }
        $where[] = 'g.kind IN (' . implode(',', $in) . ')';
    } else {
        $where[] = 'g.is_graph=1';
    }
    $where[] = picker_text_where(['g.name', 'g.search_text'], $q, $params);
    $from = 'FROM custom_widgets g WHERE ' . implode(' AND ', $where);
    $params[':qs'] = picker_like($q, true);
    [$total, $rows] = picker_page($pdo, 'SELECT g.id, g.uid, g.kind, g.name, g.icon, g.in_stats, g.draw_label, g.data_label, g.thumb', $from,
        ($q !== '' ? "CASE WHEN g.name LIKE :qs ESCAPE '\\' COLLATE NOCASE THEN 0 ELSE 1 END, " : '') . 'g.updated_at DESC, g.id DESC', $params, $offset, $limit);
    $places = graphs_places($pdo, $rows);
    return ['total' => $total, 'items' => array_map(static function ($r) use ($places) {
        $n = $places[(string) $r['uid']]['n'] ?? 0;
        $what = GRAPH_KIND_LABELS[(string) $r['kind']] ?? 'Graphique';
        $meta = implode(' · ', array_filter([trim($what . ((string) $r['draw_label'] !== '' ? ' · ' . $r['draw_label'] : '')), (string) $r['data_label'],
            $n ? 'posé à ' . picker_plural($n, 'endroit') : 'posé nulle part']));
        return ['kind' => 'graph', 'id' => (int) $r['id'], 'uid' => (string) $r['uid'], 'title' => trim((string) $r['name']) ?: 'Mon graphique',
            'meta' => $meta, 'badge' => $n ? '📌 ' . $n : '', 'badge_style' => $n ? 'blue' : '', 'group' => 'graph', 'icon' => trim((string) $r['icon']) ?: '📈',
            'thumb' => preg_match('#^data:image/(png|jpeg|webp);base64,#', (string) $r['thumb']) ? (string) $r['thumb'] : '', 'short' => (string) $r['draw_label'],
            'graph_kind' => (string) $r['kind'], 'places' => $n];
    }, $rows)];
}

/** Aiguillage depuis api.php (après verify_csrf et kiosk_guard). */
function graphs_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'graphs') { json_response(graphs_list($pdo)); }
        if ($isWrite && $action === 'graphs_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'save' => graphs_save($pdo, $payload),
                    'import' => graphs_import($pdo, $payload),
                    'thumb' => graphs_thumb($pdo, $payload),
                    default => throw new LcndaBadInput('Opération inconnue sur les graphiques.'),
                };
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue sur les graphiques.'], 400);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
