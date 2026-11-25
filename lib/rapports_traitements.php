<?php
declare(strict_types=1);

/**
 * 📊 Mes rapports et 🧰 Traitements en lot (maquette validée : docs/design/rapports-scripts.html).
 *
 * 📊 Mes rapports — lire seulement. Les critères et les colonnes sont ceux de « Mes listes » (my_list_rows_for, lib/my_lists.php) ;
 *    ce fichier ajoute quelques colonnes de rapport (génération, siècle, titres des sources, ce qui manque…), le point de départ
 *    (une recherche enregistrée ou une de « Mes listes ») et la vie privée : vivants et fiches 🔒 retirés comme dans les exports
 *    « Pour partager » (gedcom_share_hidden, mode confidentialité des Réglages). Le tri, les groupes, les totaux et la mise en page
 *    sont faits par la page (assets/js/heritage-rapports.js), l'impression et le PDF par UI.openPrintDialog.
 * 🧰 Traitements en lot — écrire prudemment. Des gestes connus (lieux, dates « vers », noms en majuscules, nettoyage, étiquette),
 *    seuls ou enchaînés en « recette ». Aperçu = le traitement est vraiment fait dans une transaction puis défait (ROLLBACK) :
 *    chaque étape voit le résultat des précédentes, et ce qui est montré est exactement ce qui sera écrit. Appliquer = une copie
 *    de la base d'abord (VACUUM INTO, dossier des sauvegardes), puis les mêmes gestes, sauf les lignes décochées ; tout est noté
 *    dans le journal (log_change) et gardé dans ro_undo (kind « batch ») : « ↶ Annuler » remet exactement l'ancien texte,
 *    seulement là où rien n'a changé depuis (ro_set_if), les lieux fusionnés reviennent.
 * 📄 Fichier .lcnda-rapport : des réglages en JSON, jamais du code. À l'import tout est vérifié : clés connues seulement, textes
 *    courts, aucun HTML ni « javascript: », types d'événements et étiquettes désignés par leur nom ; la vie privée reste la tienne.
 *
 * Routes « rt_* » (api.php appelle rt_dispatch()). Essai : tests/test-rapports-traitements.js
 */

require_once __DIR__ . '/recherche_outils.php';

const RT_KINDS = ['report', 'recipe'];
const RT_FILE_TYPE = 'lcnda-rapport';
const RT_MAX_FILE = 200000;
/** Colonnes ajoutées par les rapports aux colonnes de « Mes listes » */
const RT_PERSON_EXTRA = ['generation' => 'Génération', 'century' => 'Siècle de naissance', 'source_titles' => 'Sources (titres)', 'missing' => 'Ce qui manque', 'birth_year' => 'Année de naissance', 'death_year' => 'Année de décès', 'id' => 'N° de fiche'];
const RT_EVENT_EXTRA = ['year' => 'Année', 'century' => 'Siècle', 'commune' => 'Commune', 'county' => 'Département', 'id' => 'N° de l’événement'];
const RT_OPS = ['place_abbrev', 'place_text', 'place_county', 'place_split', 'place_merge', 'dates_vers', 'names_case', 'clean', 'label'];

function rt_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    ro_ensure($pdo);
    $pdo->exec("CREATE TABLE IF NOT EXISTS rt_saved (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'report', name TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', def_json TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function rt_dispatch(PDO $pdo, string $action, bool $isWrite, array $data): never
{
    rt_ensure($pdo);
    try {
        if (!$isWrite) {
            $q = $_GET;
            $def = static fn() => is_array($x = json_decode((string) ($q['def'] ?? '{}'), true)) ? $x : [];
            json_response(match ($action) {
                'rt_meta' => rt_meta($pdo),
                'rt_report_rows' => rt_report_rows($pdo, $def()),
                'rt_saved_get' => rt_saved_get($pdo, safe_int($q['id'] ?? 0)),
                'rt_export' => rt_export($pdo, safe_int($q['id'] ?? 0)),
                'rt_batch_preview' => rt_batch_preview($pdo, $def()),
                default => throw new RuntimeException('Action inconnue'),
            });
        }
        if ($action === 'rt_batch_apply') { json_response(['ok' => true, 'result' => rt_batch_apply($pdo, $data)]); } // copie de la base hors transaction, puis sa propre transaction
        $pdo->beginTransaction();
        try {
            $result = match ($action) {
                'rt_saved_save' => rt_saved_save($pdo, $data),
                'rt_saved_delete' => rt_saved_delete($pdo, $data),
                'rt_saved_restore' => rt_saved_restore($pdo, $data),
                'rt_import' => rt_import($pdo, $data),
                'rt_undo' => rt_undo($pdo, $data),
                'rt_redo' => rt_redo($pdo, $data),
                default => throw new RuntimeException('Action d’écriture inconnue'),
            };
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
        json_response(['ok' => true, 'result' => $result]);
    } catch (Throwable $e) {
        json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422);
    }
}

/** Ce que l'écran doit connaître : colonnes, types d'événements, étiquettes, recherches et listes enregistrées, mes rapports et recettes. */
function rt_meta(PDO $pdo): array
{
    $cols = function_exists('my_list_columns') ? my_list_columns() : [];
    $saved = [];
    foreach ($pdo->query('SELECT id, kind, name, icon, description, def_json, updated_at FROM rt_saved ORDER BY updated_at DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $r['id'] = (int) $r['id']; $r['definition'] = json_decode((string) $r['def_json'], true) ?: []; unset($r['def_json']); $saved[] = $r;
    }
    return [
        'columns' => ['persons' => ($cols['persons'] ?? []) + RT_PERSON_EXTRA, 'events' => ($cols['events'] ?? []) + RT_EVENT_EXTRA],
        'event_types' => $pdo->query('SELECT id, label, gedcom_tag FROM event_types ORDER BY label COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC),
        'labels' => $pdo->query('SELECT id, name, color FROM labels ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC),
        'searches' => ro_table_exists($pdo, 'saved_searches') ? $pdo->query('SELECT id, name FROM saved_searches ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC) : [],
        'lists' => $pdo->query("SELECT id, name, icon, source FROM custom_lists WHERE source IN ('persons','events') ORDER BY position, id")->fetchAll(PDO::FETCH_ASSOC),
        'saved' => $saved,
        'privacy_mode' => function_exists('export_privacy_enabled') && export_privacy_enabled(),
    ];
}

/* ═════════════ 📊 Les lignes d'un rapport ═════════════ */

/** Les réglages d'un rapport, nettoyés (les critères passent par my_list_clean_definition). */
function rt_report_clean(array $d): array
{
    $source = ($d['source'] ?? '') === 'events' ? 'events' : 'persons';
    $all = array_keys(($source === 'events' ? LIST_EVENT_COLUMNS + RT_EVENT_EXTRA : LIST_PERSON_COLUMNS + RT_PERSON_EXTRA));
    $col = static fn($v) => in_array((string) $v, $all, true) ? (string) $v : '';
    $txt = static fn($v, int $n = 200) => mb_substr(trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', is_scalar($v) ? (string) $v : '') ?? ''), 0, $n);
    $listDef = my_list_clean_definition(['match' => $d['match'] ?? 'all', 'rules' => $d['rules'] ?? [], 'columns' => array_keys($source === 'events' ? LIST_EVENT_COLUMNS : LIST_PERSON_COLUMNS)], $source);
    $sort = [];
    foreach (array_slice(is_array($d['sort'] ?? null) ? $d['sort'] : [], 0, 3) as $s) { if (is_array($s) && $col($s['col'] ?? '') !== '') { $sort[] = ['col' => (string) $s['col'], 'dir' => ($s['dir'] ?? '') === 'desc' ? 'desc' : 'asc']; } }
    $g = is_array($d['group'] ?? null) ? $d['group'] : [];
    $agg = is_array($g['agg'] ?? null) ? $g['agg'] : [];
    $l = is_array($d['layout'] ?? null) ? $d['layout'] : [];
    $p = is_array($d['privacy'] ?? null) ? $d['privacy'] : [];
    $st = is_array($d['start'] ?? null) ? $d['start'] : [];
    return [
        'source' => $source, 'match' => $listDef['match'], 'rules' => $listDef['rules'],
        'start' => ['search' => safe_int($st['search'] ?? 0), 'list' => safe_int($st['list'] ?? 0)],
        'columns' => array_values(array_unique(array_filter(array_map($col, is_array($d['columns'] ?? null) ? $d['columns'] : [])))) ?: ($source === 'events' ? ['date', 'type', 'who', 'place'] : ['name', 'birth', 'death']),
        'sort' => $sort,
        'group' => ['col' => $col($g['col'] ?? ''), 'page_break' => !empty($g['page_break']), 'subtotal' => !isset($g['subtotal']) || !empty($g['subtotal']), 'total' => !isset($g['total']) || !empty($g['total']),
            'agg' => ['col' => $col($agg['col'] ?? ''), 'fn' => in_array($agg['fn'] ?? '', ['avg', 'median', 'sum', 'min', 'max'], true) ? $agg['fn'] : 'avg']],
        'layout' => ['title' => $txt($l['title'] ?? '', 160), 'subtitle' => $txt($l['subtitle'] ?? '', 300), 'header' => $txt($l['header'] ?? '', 200), 'footer' => $txt($l['footer'] ?? '', 200),
            'orientation' => ($l['orientation'] ?? '') === 'landscape' ? 'landscape' : 'portrait', 'paper' => in_array($l['paper'] ?? '', ['A4', 'A5', 'A3'], true) ? $l['paper'] : 'A4',
            'font' => ($l['font'] ?? '') === 'plain' ? 'plain' : 'book', 'color_nosource' => !empty($l['color_nosource']), 'date' => !isset($l['date']) || !empty($l['date']), 'numbers' => !empty($l['numbers'])],
        'privacy' => ['keep_living' => !empty($p['keep_living'])],
    ];
}

/** Les personnes cachées (vivants, probablement vivants, fiches 🔒, décès trop récents du mode confidentialité) : id => raison */
function rt_hidden(PDO $pdo): array
{
    if (function_exists('tresor_share_hidden_all') || is_file(__DIR__ . '/tresors.php')) {
        require_once __DIR__ . '/tresors.php';
        return tresor_share_hidden_all($pdo);
    }
    if (!function_exists('gedcom_share_hidden')) { require_once __DIR__ . '/gedcom.php'; }
    return gedcom_share_hidden($pdo, $pdo->query(person_select())->fetchAll(), $pdo->query('SELECT * FROM families')->fetchAll());
}

/** Les fiches d'un point de départ (recherche enregistrée, une de « Mes listes ») ; null = pas de point de départ */
function rt_start_ids(PDO $pdo, array $start): ?array
{
    $ids = null;
    if ($start['search'] && function_exists('run_saved_search')) {
        $q = $pdo->prepare('SELECT criteria FROM saved_searches WHERE id=?'); $q->execute([$start['search']]);
        $c = $q->fetchColumn();
        if ($c === false) { throw new LcndaBadInput('Cette recherche enregistrée n’existe plus.'); }
        $ids = array_map('intval', run_saved_search($pdo, json_decode((string) $c, true) ?: []));
    }
    if ($start['list']) {
        $rows = my_list_rows($pdo, $start['list'])['rows'] ?? [];
        $l = [];
        foreach ($rows as $r) { foreach ($r['people'] ?? [] as $p) { $l[] = (int) $p['id']; } }
        $ids = $ids === null ? array_values(array_unique($l)) : array_values(array_intersect($ids, $l));
    }
    return $ids;
}

/** Les lignes du rapport : celles de « Mes listes » + les colonnes de rapport, sans les fiches à cacher. */
function rt_report_rows(PDO $pdo, array $raw): array
{
    $d = rt_report_clean($raw);
    $isEvents = $d['source'] === 'events';
    $t0 = microtime(true);
    $res = my_list_rows_for($pdo, ['id' => 0, 'name' => '', 'icon' => '', 'description' => '', 'source' => $d['source'],
        'definition_json' => json_encode(['match' => $d['match'], 'rules' => $d['rules'], 'columns' => array_keys($isEvents ? LIST_EVENT_COLUMNS : LIST_PERSON_COLUMNS), 'sort' => $isEvents ? 'date' : 'name'])]);
    $rows = $res['rows'] ?? [];
    $start = rt_start_ids($pdo, $d['start']);
    if ($start !== null) { $set = array_flip($start); $rows = array_values(array_filter($rows, static fn($r) => (bool) array_filter($r['people'] ?? [], static fn($p) => isset($set[(int) $p['id']])))); }
    // 🔒 vie privée : comme l'export « Pour partager » ; « garder les vivants » seulement pour soi, jamais en mode confidentialité
    $privacyMode = function_exists('export_privacy_enabled') && export_privacy_enabled();
    $keep = $d['privacy']['keep_living'] && !$privacyMode;
    $removed = ['living' => 0, 'private' => 0];
    if (!$keep) {
        $hidden = rt_hidden($pdo);
        $rows = array_values(array_filter($rows, static function ($r) use ($hidden, &$removed) {
            foreach ($r['people'] ?? [] as $p) { $why = $hidden[(int) $p['id']] ?? null; if ($why) { $removed[$why === 'private' ? 'private' : 'living']++; return false; } }
            return true;
        }));
    }
    // les colonnes de rapport
    $pids = [];
    foreach ($rows as $r) { foreach ($r['people'] ?? [] as $p) { $pids[] = (int) $p['id']; } }
    $pids = array_values(array_unique($pids));
    $need = array_flip(array_merge($d['columns'], array_column($d['sort'], 'col'), [$d['group']['col'], $d['group']['agg']['col']]));
    $titles = isset($need['source_titles']) && !$isEvents ? rt_source_titles($pdo, $pids) : [];
    $sosas = isset($need['generation']) && !$isEvents ? my_list_sosas($pdo) : [];
    $life = !$isEvents ? my_list_life($pdo, $pids) : [];
    $extra = [];
    if ($isEvents && $rows) {
        $eids = array_map(static fn($r) => (int) substr((string) $r['key'], 2), $rows);
        foreach (array_chunk($eids, 400) as $ch) {
            foreach ($pdo->query('SELECT e.id, e.year, pl.name, pl.county FROM events e LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id IN (' . implode(',', $ch) . ')') as $e) { $extra[(int) $e['id']] = $e; }
        }
    }
    $century = static function (?int $y): string { if (!$y) { return ''; } $c = intdiv($y - 1, 100) + 1; return rt_roman($c) . 'e siècle'; };
    $out = [];
    foreach ($rows as $r) {
        $people = array_map(static fn($p) => ['id' => (int) $p['id'], 'name' => trim(((string) ($p['first_name'] ?? '')) . ' ' . ((string) ($p['last_name'] ?? '')))], $r['people'] ?? []);
        $cells = $r['cells'] ?? [];
        $cells['name'] = $people[0]['name'] ?? '';
        $cells['who'] = implode(' & ', array_column($people, 'name'));
        $year = $r['year'] ?? null;
        if ($isEvents) {
            $id = (int) substr((string) $r['key'], 2); $e = $extra[$id] ?? [];
            $cells['id'] = (string) $id; $cells['year'] = $e['year'] ?? '' ? (string) $e['year'] : ''; $cells['century'] = $century(isset($e['year']) ? (int) $e['year'] : null);
            $cells['commune'] = (string) ($e['name'] ?? ''); $cells['county'] = (string) ($e['county'] ?? '');
        } else {
            $pid = $people[0]['id'] ?? 0; $l = $life[$pid] ?? [];
            $cells['id'] = (string) $pid;
            $cells['birth_year'] = !empty($l['by']) ? (string) $l['by'] : ''; $cells['death_year'] = !empty($l['dy']) ? (string) $l['dy'] : '';
            $cells['century'] = $century(!empty($l['by']) ? (int) $l['by'] : null);
            $nums = isset($sosas[$pid]) ? array_map('intval', (array) $sosas[$pid]) : [];
            $cells['generation'] = $nums ? (string) ((int) floor(log((float) min($nums), 2)) + 1) : '';
            if (isset($need['source_titles'])) { $cells['source_titles'] = implode(' · ', $titles[$pid] ?? []); }
            $miss = [];
            if (($l['birth'] ?? '') === '') { $miss[] = 'naissance'; }
            if (($l['death'] ?? '') === '') { $miss[] = 'décès'; }
            if (($cells['parents'] ?? '') === '') { $miss[] = 'parents'; }
            if (!(int) ($cells['sources'] ?? 0) && empty($titles[$pid])) { $miss[] = 'sources'; }
            $cells['missing'] = implode(', ', $miss);
        }
        $out[] = ['key' => (string) $r['key'], 'people' => $people, 'year' => $year, 'cells' => array_map(static fn($v) => is_scalar($v) || $v === null ? (string) ($v ?? '') : '', $cells)];
    }
    return ['source' => $d['source'], 'definition' => $d, 'rows' => $out, 'removed' => $removed, 'kept_living' => $keep, 'privacy_mode' => $privacyMode,
        'truncated' => !empty($res['truncated']), 'ms' => (int) round((microtime(true) - $t0) * 1000),
        'columns' => $isEvents ? LIST_EVENT_COLUMNS + RT_EVENT_EXTRA : LIST_PERSON_COLUMNS + RT_PERSON_EXTRA];
}

function rt_roman(int $n): string
{
    $map = ['M' => 1000, 'CM' => 900, 'D' => 500, 'CD' => 400, 'C' => 100, 'XC' => 90, 'L' => 50, 'XL' => 40, 'X' => 10, 'IX' => 9, 'V' => 5, 'IV' => 4, 'I' => 1];
    $s = ''; foreach ($map as $r => $v) { while ($n >= $v) { $s .= $r; $n -= $v; } }
    return $s;
}

/** Les titres des sources d'une personne (sa fiche et ses événements) */
function rt_source_titles(PDO $pdo, array $pids): array
{
    $out = [];
    foreach (array_chunk($pids, 400) as $ch) {
        $in = implode(',', array_map('intval', $ch));
        $sql = "SELECT DISTINCT x.pid, s.title FROM (
                SELECT sl.entity_id AS pid, sl.source_record_id AS sid FROM source_links sl WHERE sl.entity_type='person' AND sl.entity_id IN ({$in})
                UNION SELECT e.person_id, sl.source_record_id FROM source_links sl JOIN events e ON e.id=sl.entity_id WHERE sl.entity_type='event' AND e.person_id IN ({$in})
            ) x JOIN sources s ON s.id=x.sid WHERE trim(COALESCE(s.title,''))<>'' ORDER BY s.title COLLATE NOCASE";
        try { foreach ($pdo->query($sql) as $r) { $out[(int) $r['pid']][] = (string) $r['title']; } } catch (Throwable $_) {}
    }
    return $out;
}

/* ═════════════ 💾 Mes rapports et mes recettes enregistrés ═════════════ */

function rt_saved_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM rt_saved WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new LcndaBadInput('Ce rapport n’existe plus.'); }
    return $r;
}

function rt_saved_get(PDO $pdo, int $id): array
{
    $r = rt_saved_row($pdo, $id);
    return ['id' => (int) $r['id'], 'kind' => $r['kind'], 'name' => $r['name'], 'icon' => $r['icon'], 'description' => $r['description'], 'definition' => json_decode((string) $r['def_json'], true) ?: []];
}

function rt_clean_saved(array $data): array
{
    $kind = in_array($data['kind'] ?? '', RT_KINDS, true) ? (string) $data['kind'] : 'report';
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 120);
    if ($name === '') { throw new LcndaBadInput($kind === 'recipe' ? 'Donne un nom à la recette.' : 'Donne un nom au rapport.'); }
    $def = is_array($data['definition'] ?? null) ? $data['definition'] : [];
    $def = $kind === 'recipe' ? rt_recipe_clean($def) : rt_report_clean($def);
    if ($kind === 'recipe' && !$def['steps']) { throw new LcndaBadInput('Ajoute au moins une étape à la recette.'); }
    $icon = mb_substr(safe_text($data['icon'] ?? ''), 0, 8);
    return [$kind, $name, $icon !== '' ? $icon : ($kind === 'recipe' ? '🧰' : '📊'), mb_substr(safe_text($data['description'] ?? ''), 0, 600), $def];
}

function rt_saved_save(PDO $pdo, array $data): array
{
    [$kind, $name, $icon, $desc, $def] = rt_clean_saved($data);
    $id = safe_int($data['id'] ?? 0);
    $json = json_encode($def, JSON_UNESCAPED_UNICODE);
    if ($id) {
        rt_saved_row($pdo, $id);
        $pdo->prepare('UPDATE rt_saved SET kind=?, name=?, icon=?, description=?, def_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$kind, $name, $icon, $desc, $json, $id]);
    } else {
        $pdo->prepare('INSERT INTO rt_saved(kind, name, icon, description, def_json) VALUES(?,?,?,?,?)')->execute([$kind, $name, $icon, $desc, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'rt_saved', $id, 'update', ($kind === 'recipe' ? 'Recette enregistrée : ' : 'Rapport enregistré : ') . $name, null, ['kind' => $kind]);
    return ['id' => $id];
}

function rt_saved_delete(PDO $pdo, array $data): array
{
    $r = rt_saved_row($pdo, safe_int($data['id'] ?? 0));
    $pdo->prepare('DELETE FROM rt_saved WHERE id=?')->execute([(int) $r['id']]);
    log_change($pdo, 'rt_saved', (int) $r['id'], 'delete', ($r['kind'] === 'recipe' ? 'Recette supprimée : ' : 'Rapport supprimé : ') . $r['name'], $r, null);
    return ['row' => $r];
}

/** ↶ après une suppression : la ligne revient telle quelle */
function rt_saved_restore(PDO $pdo, array $data): array
{
    $r = is_array($data['row'] ?? null) ? $data['row'] : [];
    $id = safe_int($r['id'] ?? 0);
    if (!$id) { throw new LcndaBadInput('Rien à remettre.'); }
    $ex = $pdo->prepare('SELECT 1 FROM rt_saved WHERE id=?'); $ex->execute([$id]);
    if ($ex->fetchColumn()) { return ['already' => true]; }
    [$kind, $name, $icon, $desc, $def] = rt_clean_saved(['kind' => $r['kind'] ?? '', 'name' => $r['name'] ?? '', 'icon' => $r['icon'] ?? '', 'description' => $r['description'] ?? '', 'definition' => json_decode((string) ($r['def_json'] ?? '{}'), true) ?: []]);
    $pdo->prepare('INSERT INTO rt_saved(id, kind, name, icon, description, def_json, created_at) VALUES(?,?,?,?,?,?,?)')->execute([$id, $kind, $name, $icon, $desc, json_encode($def, JSON_UNESCAPED_UNICODE), (string) ($r['created_at'] ?? date('Y-m-d H:i:s'))]);
    log_change($pdo, 'rt_saved', $id, 'restore', 'Remis : ' . $name, null, null);
    return ['id' => $id];
}

/* ═════════════ 📄 Le fichier .lcnda-rapport ═════════════ */

/** Les critères pour un fichier : types d'événements et étiquettes par leur nom (leurs numéros changent d'une base à l'autre) */
function rt_rules_to_names(PDO $pdo, array $rules): array
{
    $types = []; foreach ($pdo->query('SELECT id, label, gedcom_tag FROM event_types') as $t) { $types[(int) $t['id']] = ['tag' => (string) $t['gedcom_tag'], 'label' => (string) $t['label']]; }
    $labels = []; foreach ($pdo->query('SELECT id, name, color FROM labels') as $l) { $labels[(int) $l['id']] = ['name' => (string) $l['name'], 'color' => (string) $l['color']]; }
    foreach ($rules as &$r) {
        if (in_array($r['field'], ['event_type', 'age_at', 'event_count'], true)) { $r['values'] = array_values(array_filter(array_map(static fn($v) => $types[(int) $v] ?? null, $r['values']))); }
        elseif ($r['field'] === 'label') { $r['values'] = array_values(array_filter(array_map(static fn($v) => $labels[(int) $v] ?? null, $r['values']))); }
    }
    unset($r);
    return $rules;
}

function rt_rules_from_names(PDO $pdo, array $rules, array &$missing): array
{
    $byTag = []; $byLabel = [];
    foreach ($pdo->query('SELECT id, label, gedcom_tag FROM event_types') as $t) { if ((string) $t['gedcom_tag'] !== '') { $byTag[(string) $t['gedcom_tag']] ??= (int) $t['id']; } $byLabel[mb_strtolower((string) $t['label'])] = (int) $t['id']; }
    foreach ($rules as $i => $r) {
        if (!is_array($r)) { continue; }
        $f = (string) ($r['field'] ?? '');
        $ids = [];
        foreach (is_array($r['values'] ?? null) ? $r['values'] : [] as $v) {
            if (in_array($f, ['event_type', 'age_at', 'event_count'], true) && is_array($v)) {
                $id = $byLabel[mb_strtolower((string) ($v['label'] ?? ''))] ?? ($byTag[(string) ($v['tag'] ?? '')] ?? 0);
                if ($id) { $ids[] = $id; } else { $missing[] = 'type d’événement « ' . mb_substr((string) ($v['label'] ?? '?'), 0, 60) . ' »'; }
            } elseif ($f === 'label' && is_array($v)) {
                $q = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE'); $q->execute([mb_substr(safe_text($v['name'] ?? ''), 0, 80)]);
                $id = (int) $q->fetchColumn();
                if ($id) { $ids[] = $id; } else { $missing[] = 'étiquette « ' . mb_substr((string) ($v['name'] ?? '?'), 0, 60) . ' »'; }
            } elseif (is_int($v) && $f === 'birth_month') { $ids[] = $v; }
        }
        $rules[$i]['values'] = $ids;
    }
    return $rules;
}

function rt_export(PDO $pdo, int $id): array
{
    $r = rt_saved_get($pdo, $id);
    $def = $r['definition'];
    if ($r['kind'] === 'recipe') { $def = rt_recipe_clean($def); $def['who']['rules'] = rt_rules_to_names($pdo, $def['who']['rules']); $def['who']['list'] = 0; $def['who']['search'] = 0; }
    else { $def = rt_report_clean($def); $def['rules'] = rt_rules_to_names($pdo, $def['rules']); $def['start'] = ['search' => 0, 'list' => 0]; $def['privacy'] = ['keep_living' => false]; }
    return ['type' => RT_FILE_TYPE, 'version' => 1, 'kind' => $r['kind'], 'name' => $r['name'], 'icon' => $r['icon'], 'description' => $r['description'], 'definition' => $def];
}

/**
 * Vérifie un fichier reçu : clés connues seulement (à chaque niveau), pas de HTML ni d'adresse « javascript: » dans les textes,
 * des textes courts, une profondeur bornée. Un fichier piégé est refusé en entier, rien n'est écrit.
 */
function rt_validate_file(mixed $pkg): array
{
    if (!is_array($pkg) || ($pkg['type'] ?? '') !== RT_FILE_TYPE) { throw new LcndaBadInput('Ce fichier n’est pas un rapport LCNDA (.lcnda-rapport).'); }
    if ((int) ($pkg['version'] ?? 0) !== 1) { throw new LcndaBadInput('Ce rapport vient d’une version de LCNDA que celle-ci ne connaît pas.'); }
    $allowed = [
        '' => ['type', 'version', 'kind', 'name', 'icon', 'description', 'definition'],
        'definition' => ['source', 'match', 'rules', 'start', 'columns', 'sort', 'group', 'layout', 'privacy', 'steps', 'who'],
        'rule' => ['field', 'value', 'from', 'to', 'values', 'not', 'date_from', 'date_to', 'km'],
        'value' => ['tag', 'label', 'name', 'color'],
        'start' => ['search', 'list'], 'sort' => ['col', 'dir'], 'group' => ['col', 'page_break', 'subtotal', 'total', 'agg'], 'agg' => ['col', 'fn'],
        'layout' => ['title', 'subtitle', 'header', 'footer', 'orientation', 'paper', 'font', 'color_nosource', 'date', 'numbers'], 'privacy' => ['keep_living'],
        'step' => ['op', 'params'], 'params' => ['find', 'replace', 'word', 'case', 'mode', 'value', 'contains', 'country', 'field', 'spaces', 'punct', 'empty', 'before_after', 'name', 'fields'],
        'who' => ['mode', 'match', 'rules', 'list', 'search'],
    ];
    $bad = static function (string $why): never { throw new LcndaBadInput('Fichier refusé : ' . $why . ' Un rapport ne contient que des réglages, jamais de code.'); };
    $walk = static function ($v, string $ctx, int $depth) use (&$walk, $allowed, $bad): void {
        if ($depth > 8) { $bad('trop d’imbrications.'); }
        if (is_string($v)) {
            if (mb_strlen($v) > 2000) { $bad('un texte est trop long.'); }
            if (preg_match('/<\s*\/?\s*[a-z!?]|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|\bon[a-z]+\s*=|\{\{|<%|\beval\s*\(|\bfunction\s*\(|=>/iu', $v)) { $bad('il contient du HTML ou du code (« ' . mb_substr($v, 0, 40) . ' »).'); }
            return;
        }
        if (is_int($v) || is_float($v) || is_bool($v) || $v === null) { return; }
        if (!is_array($v)) { $bad('valeur inconnue.'); }
        if (count($v) > 500) { $bad('trop d’éléments.'); }
        $isList = array_is_list($v);
        $childCtx = ['rules' => 'rule', 'values' => 'value', 'sort' => 'sort', 'steps' => 'step', 'columns' => 'col', 'fields' => 'col'][$ctx] ?? null;
        foreach ($v as $k => $x) {
            if ($isList && $childCtx !== null) { $walk($x, $childCtx, $depth + 1); continue; }
            if ($isList && in_array($ctx, ['col', 'value'], true)) { $walk($x, $ctx, $depth + 1); continue; }
            $keys = $allowed[$ctx] ?? null;
            if ($keys === null || !in_array((string) $k, $keys, true)) { $bad('réglage inconnu « ' . mb_substr((string) $k, 0, 40) . ' ».'); }
            $walk($x, in_array((string) $k, ['definition', 'start', 'group', 'agg', 'layout', 'privacy', 'params', 'who'], true) ? (string) $k : (in_array((string) $k, ['rules', 'values', 'sort', 'steps', 'columns', 'fields'], true) ? (string) $k : 'leaf'), $depth + 1);
        }
    };
    // les listes : 'rules' → chaque élément est une règle, 'values' → des valeurs, etc. ; une feuille n'a pas de clés
    $allowed['leaf'] = [];
    $allowed['rules'] = []; $allowed['values'] = []; $allowed['sort'] = []; $allowed['steps'] = []; $allowed['columns'] = []; $allowed['fields'] = [];
    $walk($pkg, '', 0);
    if (!in_array($pkg['kind'] ?? '', RT_KINDS, true)) { $bad('sorte inconnue.'); }
    if (!is_array($pkg['definition'] ?? null)) { $bad('réglages absents.'); }
    return $pkg;
}

function rt_import(PDO $pdo, array $data): array
{
    $text = (string) ($data['json'] ?? '');
    if (strlen($text) > RT_MAX_FILE) { throw new LcndaBadInput('Fichier trop gros pour un rapport (200 Ko au plus).'); }
    $pkg = rt_validate_file(json_decode($text, true));
    $def = $pkg['definition'];
    $missing = [];
    if ($pkg['kind'] === 'recipe') {
        $who = is_array($def['who'] ?? null) ? $def['who'] : [];
        $who['rules'] = rt_rules_from_names($pdo, is_array($who['rules'] ?? null) ? $who['rules'] : [], $missing);
        $who['list'] = 0; $who['search'] = 0; // propres à la base d'origine
        $def['who'] = $who;
    } else {
        $def['rules'] = rt_rules_from_names($pdo, is_array($def['rules'] ?? null) ? $def['rules'] : [], $missing);
        $def['start'] = ['search' => 0, 'list' => 0];
        $def['privacy'] = ['keep_living' => false]; // un rapport reçu suit tes règles de vie privée
    }
    if ($missing) {
        // un critère sans aucune valeur connue ici montrerait autre chose que prévu : on refuse plutôt
        throw new LcndaBadInput('Ce rapport utilise ' . implode(', ', array_unique($missing)) . ', absent de ta base. Crée-le d’abord, puis importe le fichier de nouveau.');
    }
    $saved = rt_saved_save($pdo, ['kind' => $pkg['kind'], 'name' => $pkg['name'] ?? 'Rapport reçu', 'icon' => $pkg['icon'] ?? '', 'description' => $pkg['description'] ?? '', 'definition' => $def]);
    return ['id' => $saved['id'], 'kind' => $pkg['kind']];
}

/* ═════════════ 🧰 Traitements en lot ═════════════ */

function rt_bool(array $p, string $k, bool $d): bool { return array_key_exists($k, $p) ? (!empty($p[$k]) && $p[$k] !== '0' && $p[$k] !== 'false') : $d; }

/** Une étape : son geste et ses réglages, nettoyés */
function rt_step_clean(array $s): ?array
{
    $op = (string) ($s['op'] ?? '');
    if (!in_array($op, RT_OPS, true)) { return null; }
    $p = is_array($s['params'] ?? null) ? $s['params'] : [];
    $t = static fn($k, $n = 120) => mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', '', is_scalar($p[$k] ?? null) ? (string) $p[$k] : '') ?? ''), 0, $n);
    $c = match ($op) {
        'place_abbrev' => ['find' => $t('find', 40), 'replace' => $t('replace', 80)],
        'place_text' => ['find' => $t('find', 120), 'replace' => $t('replace', 120), 'word' => rt_bool($p, 'word', true), 'case' => rt_bool($p, 'case', false)],
        'place_county' => ['mode' => ($p['mode'] ?? '') === 'value' ? 'value' : 'auto', 'value' => $t('value', 80), 'contains' => $t('contains', 80), 'country' => $t('country', 60)],
        'place_split', 'place_merge' => [],
        'dates_vers' => ['before_after' => rt_bool($p, 'before_after', true)],
        'names_case' => ['field' => ($p['field'] ?? '') === 'first_name' ? 'first_name' : 'last_name', 'mode' => ($p['mode'] ?? '') === 'title' ? 'title' : 'upper'],
        'clean' => ['spaces' => rt_bool($p, 'spaces', true), 'punct' => rt_bool($p, 'punct', true), 'empty' => rt_bool($p, 'empty', true)],
        'label' => ['name' => $t('name', 80)],
    };
    if (in_array($op, ['place_abbrev', 'place_text'], true) && $c['find'] === '') { throw new LcndaBadInput('Tape le texte à remplacer dans les lieux.'); }
    if ($op === 'place_county' && $c['mode'] === 'value' && $c['value'] === '') { throw new LcndaBadInput('Écris le département à mettre.'); }
    if ($op === 'label' && $c['name'] === '') { throw new LcndaBadInput('Écris le nom de l’étiquette.'); }
    return ['op' => $op, 'params' => $c];
}

function rt_recipe_clean(array $d): array
{
    $steps = [];
    foreach (array_slice(is_array($d['steps'] ?? null) ? $d['steps'] : [], 0, 20) as $s) { if (is_array($s) && ($c = rt_step_clean($s))) { $steps[] = $c; } }
    $w = is_array($d['who'] ?? null) ? $d['who'] : [];
    $mode = in_array($w['mode'] ?? '', ['all', 'rules', 'list', 'search'], true) ? $w['mode'] : 'all';
    $ld = my_list_clean_definition(['match' => $w['match'] ?? 'all', 'rules' => $w['rules'] ?? [], 'columns' => ['name']], 'persons');
    return ['steps' => $steps, 'who' => ['mode' => $mode, 'match' => $ld['match'], 'rules' => $ld['rules'], 'list' => safe_int($w['list'] ?? 0), 'search' => safe_int($w['search'] ?? 0)]];
}

/** Les personnes concernées (null = tout le monde) */
function rt_who_ids(PDO $pdo, array $who): ?array
{
    return match ($who['mode']) {
        'rules' => my_list_rows_for($pdo, ['id' => 0, 'source' => 'persons', 'definition_json' => json_encode(['match' => $who['match'], 'rules' => $who['rules']]), 'ids_only' => true])['ids'],
        'list' => rt_start_ids($pdo, ['search' => 0, 'list' => $who['list']]) ?? [],
        'search' => rt_start_ids($pdo, ['search' => $who['search'], 'list' => 0]) ?? [],
        default => null,
    };
}

/** Pour le SQL : « AND col IN (…) » (null = pas de limite) */
function rt_in(?array $ids, string $col): string
{
    if ($ids === null) { return ''; }
    return ' AND ' . $col . ' IN (' . (implode(',', array_map('intval', $ids)) ?: '0') . ')';
}

/** Les lieux de ces personnes (leurs événements, ceux de leurs couples) */
function rt_places_sql(?array $ids): string
{
    if ($ids === null) { return 'SELECT id FROM places'; }
    $in = implode(',', array_map('intval', $ids)) ?: '0';
    return "SELECT e.place_id FROM events e LEFT JOIN families f ON f.id=e.family_id WHERE e.place_id IS NOT NULL AND (e.person_id IN ({$in}) OR f.partner1_id IN ({$in}) OR f.partner2_id IN ({$in}))";
}

const RT_LOCK_EVENT = "COALESCE((SELECT max(COALESCE(px.is_locked,0)) FROM persons px WHERE px.id IN (x.person_id, (SELECT partner1_id FROM families WHERE id=x.family_id), (SELECT partner2_id FROM families WHERE id=x.family_id))),0)";

/** « St » → « Saint » (mot entier, point facultatif ; « St Martial » → « Saint-Martial ») */
function rt_abbrev(string $v, string $find, string $replace): string
{
    $f = preg_quote(rtrim($find, '.'), '/');
    $out = preg_replace_callback('/(?<![\p{L}\p{N}])' . $f . '\.?(?![\p{L}\p{N}])(\s+(?=\p{L}))?/u', static fn($m) => $replace . (isset($m[1]) && $m[1] !== '' ? '-' : ''), $v);
    return $out ?? $v;
}

const RT_PARTICLES = ['de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'van', 'von', 'der', 'den', 'di', 'da', 'del', 'et'];
/** « jean-pierre » → « Jean-Pierre » ; pour un nom : « de LA FONTAINE » → « de La Fontaine » (particules en minuscules, sauf au début) */
function rt_title_case(string $v, bool $isName): string
{
    $parts = preg_split("/([\\s\\-'’]+)/u", mb_strtolower($v), -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$v];
    $out = ''; $first = true;
    foreach ($parts as $p) {
        if ($p === '' || preg_match("/^[\\s\\-'’]+$/u", $p)) { $out .= $p; continue; }
        $out .= ($isName && !$first && in_array($p, RT_PARTICLES, true)) ? $p : mb_strtoupper(mb_substr($p, 0, 1)) . mb_substr($p, 1);
        $first = false;
    }
    return $out;
}

/** « env. 1784 », « ca 1784 », « ~1784 », « ABT 1784 » → « vers 1784 » ; « bef. », « av. » → « avant » ; « aft. », « ap. » → « après » */
function rt_date_vers(string $v, bool $beforeAfter): string
{
    $s = trim($v);
    $rest = '(?=.*\d)\s*(.+)$';
    if (preg_match('/^(?:env(?:iron)?\.?|ca\.?|c\.|circa|cca\.?|~|≈|abt\.?|about|approx(?:\.|imativement)?|est\.?|vers)' . $rest . '/iu', $s, $m)) { return 'vers ' . trim($m[1]); }
    if ($beforeAfter) {
        if (preg_match('/^(?:av\.?|avant|bef\.?|before)(?=[\s.\d])' . $rest . '/iu', $s, $m)) { return 'avant ' . trim($m[1]); }
        if (preg_match('/^(?:ap\.?|après|apres|aft\.?|after)(?=[\s.\d])' . $rest . '/iu', $s, $m)) { return 'après ' . trim($m[1]); }
        if (preg_match('/^(?:bet\.?|between|entre)\s+(.+?)\s+(?:and|et|&)\s+(.+)$/iu', $s, $m) && preg_match('/\d/', $m[1]) && preg_match('/\d/', $m[2])) { return 'entre ' . trim($m[1]) . ' et ' . trim($m[2]); }
    }
    return $v;
}

/** 🧽 doubles espaces, ponctuation en double, champs « vides » (seulement des espaces ou de la ponctuation) */
function rt_clean_text(string $v, array $p): string
{
    $s = $v;
    if ($p['spaces']) { $s = preg_replace('/[ \t]{2,}/u', ' ', $s) ?? $s; $s = preg_replace('/^[ \t\r\n]+|[ \t\r\n]+$/u', '', $s) ?? $s; }
    if ($p['punct']) {
        $s = preg_replace('/\s+([,;])/u', '$1', $s) ?? $s;               // « Naves , Corrèze » → « Naves, Corrèze »
        $s = preg_replace('/([,;:])\1+/u', '$1', $s) ?? $s;               // « ,, » → « , »
        $s = preg_replace('/(?<!\.)\.\.(?!\.)/u', '.', $s) ?? $s;         // « .. » → « . » (« … » et « ... » restent)
        $s = preg_replace('/,(?=[\p{L}])/u', ', ', $s) ?? $s;             // « Naves,Corrèze » → « Naves, Corrèze »
        $s = preg_replace('/^[\s,;]+|[\s,;]+$/u', '', $s) ?? $s;          // virgules au début ou à la fin
    }
    if ($p['empty'] && $s !== '' && preg_match('/^[\s,.;:\-_\/]+$/u', $s)) { $s = ''; }
    return $s;
}

/** Un geste → la liste des changements prévus (chacun : clé, cases [t, c, id, avant, après], lignes à fusionner…) */
function rt_step_candidates(PDO $pdo, array $step, ?array $ids): array
{
    $p = $step['params'];
    $out = [];
    $cell = static fn(string $t, string $c, int $id, string $before, string $after) => ['t' => $t, 'c' => $c, 'id' => $id, 'before' => $before, 'after' => $after];
    $placeScope = 'id IN (' . rt_places_sql($ids) . ')';
    switch ($step['op']) {
        case 'place_abbrev':
        case 'place_text':
            $rx = $step['op'] === 'place_text' ? ro_replace_regex($p['find'], $p['case'], $p['word']) : null;
            foreach ($pdo->query("SELECT id, name, county, country FROM places WHERE trim(COALESCE(name,''))<>'' AND {$placeScope} ORDER BY name COLLATE NOCASE, id")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $after = $rx ? (preg_replace_callback($rx, static fn() => $p['replace'], (string) $r['name']) ?? $r['name']) : rt_abbrev((string) $r['name'], $p['find'], $p['replace']);
                if ($after === $r['name']) { continue; }
                $out[] = ['key' => 'places:name:' . $r['id'], 'what' => 'place', 'place' => $r, 'cells' => [$cell('places', 'name', (int) $r['id'], (string) $r['name'], $after)], 'merge_name' => $after];
            }
            break;
        case 'place_county':
            $where = "trim(COALESCE(county,''))='' AND trim(COALESCE(name,''))<>'' AND {$placeScope}";
            $params = [];
            if ($p['mode'] === 'value' && $p['contains'] !== '') { $where .= ' AND name LIKE ?'; $params[] = '%' . $p['contains'] . '%'; }
            $st = $pdo->prepare("SELECT id, name, county, country FROM places WHERE {$where} ORDER BY name COLLATE NOCASE, id"); $st->execute($params);
            $known = [];
            if ($p['mode'] === 'auto') {
                foreach ($pdo->query("SELECT lower(trim(name)) AS n, trim(county) AS c FROM places WHERE trim(COALESCE(county,''))<>'' GROUP BY lower(trim(name)), lower(trim(county))") as $k) { $known[$k['n']][] = $k['c']; }
            }
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $val = $p['mode'] === 'value' ? $p['value'] : null;
                $note = '';
                if ($val === null) {
                    $opts = $known[mb_strtolower(trim((string) $r['name']))] ?? [];
                    if (count($opts) !== 1) { continue; } // inconnu, ou plusieurs départements possibles : on ne devine pas
                    $val = $opts[0]; $note = 'd’après un autre lieu du même nom';
                }
                $cells = [$cell('places', 'county', (int) $r['id'], (string) $r['county'], $val)];
                if ($p['country'] !== '' && trim((string) $r['country']) === '') { $cells[] = $cell('places', 'country', (int) $r['id'], (string) $r['country'], $p['country']); }
                $out[] = ['key' => 'places:county:' . $r['id'], 'what' => 'place', 'place' => $r, 'cells' => $cells, 'note' => $note];
            }
            break;
        case 'place_split':
            foreach ($pdo->query("SELECT id, name, county, state, country FROM places WHERE name LIKE '%,%' AND trim(COALESCE(county,''))='' AND {$placeScope} ORDER BY name COLLATE NOCASE, id")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $parts = array_values(array_filter(array_map('trim', explode(',', (string) $r['name'])), static fn($x) => $x !== ''));
                if (count($parts) < 2 || count($parts) > 4) { continue; }
                $countries = ['france', 'belgique', 'suisse', 'italie', 'espagne', 'allemagne', 'luxembourg', 'canada', 'algérie', 'algerie', 'pays-bas', 'portugal', 'royaume-uni', 'états-unis', 'etats-unis'];
                $isCountry = static fn($x) => in_array(mb_strtolower($x), $countries, true);
                $name = $parts[0]; $county = ''; $state = ''; $country = '';
                if (count($parts) === 2) { if ($isCountry($parts[1])) { $country = $parts[1]; } else { $county = $parts[1]; } }
                elseif (count($parts) === 3) { $county = $parts[1]; $country = $parts[2]; }
                else { $county = $parts[1]; $state = $parts[2]; $country = $parts[3]; }
                $cells = [$cell('places', 'name', (int) $r['id'], (string) $r['name'], $name)];
                if ($county !== '') { $cells[] = $cell('places', 'county', (int) $r['id'], (string) $r['county'], $county); }
                if ($state !== '' && trim((string) $r['state']) === '') { $cells[] = $cell('places', 'state', (int) $r['id'], (string) $r['state'], $state); }
                if ($country !== '' && trim((string) $r['country']) === '') { $cells[] = $cell('places', 'country', (int) $r['id'], (string) $r['country'], $country); }
                $out[] = ['key' => 'places:split:' . $r['id'], 'what' => 'place', 'place' => $r, 'cells' => $cells, 'show_after' => trim($name . ($county ? ' · ' . $county : '') . ($state ? ' · ' . $state : '') . ($country ? ' · ' . $country : '')), 'merge_name' => $name, 'merge_county' => $county];
            }
            break;
        case 'place_merge':
            $norm = static fn($s) => preg_replace('/[\s\-’\']+/u', ' ', mb_strtolower(trim((string) $s)));
            $groups = [];
            foreach ($pdo->query('SELECT p.id, p.name, p.county, p.country, p.latitude, p.longitude, (SELECT count(*) FROM events e WHERE e.place_id=p.id) AS n FROM places p WHERE trim(COALESCE(p.name,\'\'))<>\'\' ORDER BY p.id')->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $groups[$norm($r['name']) . '|' . $norm($r['county'])][] = $r;
            }
            $scope = null;
            if ($ids !== null) { $scope = array_flip(array_map('intval', $pdo->query(rt_places_sql($ids))->fetchAll(PDO::FETCH_COLUMN))); }
            foreach ($groups as $g) {
                if (count($g) < 2) { continue; }
                usort($g, static fn($a, $b) => ((int) $b['n'] <=> (int) $a['n']) ?: ((int) $a['id'] <=> (int) $b['id']));
                $target = $g[0];
                foreach (array_slice($g, 1) as $r) {
                    if ($scope !== null && !isset($scope[(int) $r['id']])) { continue; }
                    $ca = $norm($r['country']); $cb = $norm($target['country']);
                    if ($ca !== '' && $cb !== '' && $ca !== $cb) { continue; }
                    if ($r['latitude'] !== null && $target['latitude'] !== null && rt_km((float) $r['latitude'], (float) $r['longitude'], (float) $target['latitude'], (float) $target['longitude']) > 10) { continue; } // deux villages du même nom
                    $out[] = ['key' => 'places:merge:' . $r['id'], 'what' => 'place', 'place' => $r, 'cells' => [], 'merge_into' => (int) $target['id'],
                        'show_after' => (string) $target['name'] . ($target['county'] ? ' (' . $target['county'] . ')' : '') . ' · n° ' . $target['id']];
                }
            }
            break;
        case 'dates_vers':
            $lock = RT_LOCK_EVENT;
            $scope = $ids === null ? '' : ' AND (x.person_id IN (' . (implode(',', array_map('intval', $ids)) ?: '0') . ') OR x.family_id IN (SELECT id FROM families WHERE partner1_id IN (' . (implode(',', array_map('intval', $ids)) ?: '0') . ') OR partner2_id IN (' . (implode(',', array_map('intval', $ids)) ?: '0') . ')))';
            foreach ($pdo->query("SELECT x.id, x.date_text, {$lock} AS locked, et.label AS type, trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS who, p.id AS person_id
                FROM events x JOIN event_types et ON et.id=x.event_type_id LEFT JOIN families f ON f.id=x.family_id LEFT JOIN persons p ON p.id=COALESCE(x.person_id, f.partner1_id)
                WHERE trim(COALESCE(x.date_text,''))<>''{$scope} ORDER BY x.id")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $after = rt_date_vers((string) $r['date_text'], $p['before_after']);
                if ($after === $r['date_text']) { continue; }
                $out[] = ['key' => 'events:date_text:' . $r['id'], 'what' => 'event', 'who' => $r['who'] . ' · ' . $r['type'], 'person_id' => $r['person_id'] ? (int) $r['person_id'] : null, 'locked' => (int) $r['locked'] > 0,
                    'cells' => [$cell('events', 'date_text', (int) $r['id'], (string) $r['date_text'], $after)]];
            }
            break;
        case 'names_case':
            $cols = $p['field'] === 'first_name' ? ['first_name', 'middle_name'] : ['last_name'];
            foreach ($pdo->query("SELECT id, first_name, middle_name, last_name, COALESCE(is_locked,0) AS locked FROM persons WHERE 1" . rt_in($ids, 'id') . ' ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE, id')->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $cells = [];
                foreach ($cols as $c) {
                    $v = (string) ($r[$c] ?? '');
                    if (trim($v) === '') { continue; }
                    $after = $p['mode'] === 'upper' ? mb_strtoupper($v) : rt_title_case($v, $c === 'last_name');
                    if ($after !== $v) { $cells[] = $cell('persons', $c, (int) $r['id'], $v, $after); }
                }
                if ($cells) { $out[] = ['key' => 'persons:' . $p['field'] . ':' . $r['id'], 'what' => 'person', 'who' => trim($r['first_name'] . ' ' . $r['last_name']), 'person_id' => (int) $r['id'], 'locked' => (int) $r['locked'] > 0, 'cells' => $cells]; }
            }
            break;
        case 'clean':
            $targets = [['persons', ['first_name', 'middle_name', 'last_name', 'occupation']], ['events', ['date_text', 'title', 'description']], ['places', ['name', 'county', 'state', 'country']]];
            foreach ($targets as [$t, $cols]) {
                $cols = array_values(array_filter($cols, static fn($c) => ro_has_table_col($pdo, $t, $c)));
                $sel = implode(', ', array_map(static fn($c) => 'x.' . $c, $cols));
                $sql = match ($t) {
                    'persons' => "SELECT x.id, {$sel}, COALESCE(x.is_locked,0) AS locked, trim(COALESCE(x.first_name,'')||' '||COALESCE(x.last_name,'')) AS who, x.id AS person_id FROM persons x WHERE 1" . rt_in($ids, 'x.id'),
                    'events' => "SELECT x.id, {$sel}, " . RT_LOCK_EVENT . " AS locked, trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) || ' · ' || et.label AS who, p.id AS person_id FROM events x JOIN event_types et ON et.id=x.event_type_id LEFT JOIN families f ON f.id=x.family_id LEFT JOIN persons p ON p.id=COALESCE(x.person_id, f.partner1_id) WHERE 1"
                        . ($ids === null ? '' : ' AND (x.person_id IN (' . (implode(',', array_map('intval', $ids)) ?: '0') . ') OR f.partner1_id IN (' . (implode(',', array_map('intval', $ids)) ?: '0') . ') OR f.partner2_id IN (' . (implode(',', array_map('intval', $ids)) ?: '0') . '))'),
                    'places' => "SELECT x.id, {$sel}, 0 AS locked, 'lieu' AS who, NULL AS person_id FROM places x WHERE x.id IN (" . rt_places_sql($ids) . ')',
                };
                foreach ($pdo->query($sql . ' ORDER BY x.id')->fetchAll(PDO::FETCH_ASSOC) as $r) {
                    $cells = [];
                    foreach ($cols as $c) {
                        $v = $r[$c]; if ($v === null || $v === '') { continue; }
                        $after = rt_clean_text((string) $v, $p);
                        if ($after !== (string) $v) { $cells[] = $cell($t, $c, (int) $r['id'], (string) $v, $after); }
                    }
                    if ($cells) { $out[] = ['key' => $t . ':clean:' . $r['id'], 'what' => rtrim($t, 's'), 'who' => $t === 'places' ? 'lieu' : (string) $r['who'], 'person_id' => $r['person_id'] !== null ? (int) $r['person_id'] : null, 'locked' => (int) $r['locked'] > 0, 'cells' => $cells]; }
                }
            }
            break;
        case 'label':
            $lq = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE'); $lq->execute([$p['name']]);
            $lid = (int) $lq->fetchColumn();
            foreach ($pdo->query("SELECT p.id, trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS who FROM persons p WHERE COALESCE(p.kind,'human')<>'animal'" . rt_in($ids, 'p.id')
                . ($lid ? " AND NOT EXISTS (SELECT 1 FROM label_links ll WHERE ll.label_id={$lid} AND ll.entity_type='person' AND ll.entity_id=p.id)" : '') . ' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE, p.id')->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $out[] = ['key' => 'persons:label:' . $r['id'], 'what' => 'person', 'who' => (string) $r['who'], 'person_id' => (int) $r['id'], 'cells' => [], 'label' => $p['name'], 'show_before' => '—', 'show_after' => '🏷 ' . $p['name']];
            }
            break;
    }
    return $out;
}

function rt_km(float $la1, float $lo1, float $la2, float $lo2): float
{
    $a = sin(deg2rad($la2 - $la1) / 2) ** 2 + cos(deg2rad($la1)) * cos(deg2rad($la2)) * sin(deg2rad($lo2 - $lo1) / 2) ** 2;
    return 6371 * 2 * asin(min(1, sqrt($a)));
}

/** Un autre lieu qui porte déjà ce nom (même département, même pays, ou l'un des deux vide) : on fusionnera au lieu de doubler */
function rt_place_twin(PDO $pdo, int $id, string $name, string $county, string $country): int
{
    $s = $pdo->prepare("SELECT id FROM places WHERE id<>? AND lower(trim(name))=lower(trim(?)) AND (lower(trim(COALESCE(county,'')))=lower(trim(?)) OR trim(COALESCE(county,''))='' OR trim(?)='')
        AND (lower(trim(COALESCE(country,'')))=lower(trim(?)) OR trim(COALESCE(country,''))='' OR trim(?)='') ORDER BY (SELECT count(*) FROM events e WHERE e.place_id=places.id) DESC, id LIMIT 1");
    $s->execute([$id, $name, $county, $county, $country, $country]);
    return (int) $s->fetchColumn();
}

/** Les lignes d'un lieu (événements, recensements…) passent à un autre lieu ; le lieu vide est supprimé. Tout est gardé pour ↶. */
function rt_place_merge(PDO $pdo, int $from, int $to, array &$undo): int
{
    $n = 0;
    foreach (ro_place_tables($pdo) as $t) {
        foreach ($pdo->query("SELECT id FROM {$t} WHERE place_id=" . $from)->fetchAll(PDO::FETCH_COLUMN) as $rid) { $undo['changes'][] = ['t' => $t, 'c' => 'place_id', 'id' => (int) $rid, 'before' => $from, 'after' => $to]; $n++; }
        $pdo->exec("UPDATE {$t} SET place_id=" . $to . ' WHERE place_id=' . $from);
    }
    $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$from]);
    if ($row = $s->fetch(PDO::FETCH_ASSOC)) { $undo['deleted_places'][] = $row; $pdo->prepare('DELETE FROM places WHERE id=?')->execute([$from]); }
    return $n;
}

/**
 * Fait les étapes pour de vrai (dans la transaction ouverte par l'appelant) : $skip = clés décochées.
 * Rend les lignes de l'aperçu (toutes, avec ce qui a été fait) et ce qu'il faut pour ↶.
 */
function rt_run(PDO $pdo, array $recipe, array $skip): array
{
    $ids = rt_who_ids($pdo, $recipe['who']);
    $rows = []; $undo = ['changes' => [], 'deleted_places' => [], 'label_links' => [], 'created_labels' => []];
    $stats = ['changes' => 0, 'merges' => 0, 'locked' => 0, 'skipped' => 0, 'labels' => 0];
    foreach ($recipe['steps'] as $i => $step) {
        $labelId = 0;
        foreach (rt_step_candidates($pdo, $step, $ids) as $c) {
            $key = $i . ':' . $c['key'];
            $note = $c['note'] ?? '';
            $mergeInto = (int) ($c['merge_into'] ?? 0);
            if (!$mergeInto && isset($c['merge_name']) && ($c['what'] ?? '') === 'place') {
                $pl = $c['place'];
                $twin = rt_place_twin($pdo, (int) $pl['id'], (string) $c['merge_name'], (string) ($c['merge_county'] ?? $pl['county'] ?? ''), (string) ($pl['country'] ?? ''));
                if ($twin) { $mergeInto = $twin; $note = 'fusion'; }
            }
            $row = ['key' => $key, 'step' => $i, 'op' => $step['op'], 'what' => $c['what'] ?? '', 'who' => $c['who'] ?? '', 'person_id' => $c['person_id'] ?? null, 'locked' => !empty($c['locked']),
                'before' => $c['show_before'] ?? implode(' · ', array_map(static fn($x) => $x['before'] === '' ? '(vide)' : $x['before'], $c['cells'])) ?: (string) ($c['place']['name'] ?? ''),
                'after' => $c['show_after'] ?? implode(' · ', array_map(static fn($x) => $x['after'] === '' ? '(vide)' : $x['after'], $c['cells'])),
                'note' => $note, 'merge_into' => $mergeInto ?: null, 'events' => isset($c['place']) ? (int) $pdo->query('SELECT count(*) FROM events WHERE place_id=' . (int) $c['place']['id'])->fetchColumn() : null];
            if ($mergeInto && !isset($c['show_after'])) { $tw = $pdo->query('SELECT name, county FROM places WHERE id=' . $mergeInto)->fetch(PDO::FETCH_ASSOC); if ($tw) { $row['after'] = $tw['name'] . ($tw['county'] ? ' (' . $tw['county'] . ')' : '') . ' · n° ' . $mergeInto; } }
            if ($row['locked']) { $stats['locked']++; $row['done'] = false; $rows[] = $row; continue; }
            if (isset($skip[$key])) { $stats['skipped']++; $row['done'] = false; $rows[] = $row; continue; }
            if ($mergeInto) {
                rt_place_merge($pdo, (int) $c['place']['id'], $mergeInto, $undo); $stats['merges']++;
            } elseif (isset($c['label'])) {
                if (!$labelId) {
                    $lq = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE'); $lq->execute([$c['label']]); $labelId = (int) $lq->fetchColumn();
                    if (!$labelId) { $pdo->prepare('INSERT INTO labels(name, color) VALUES(?, ?)')->execute([$c['label'], '#6929c4']); $labelId = (int) $pdo->lastInsertId(); $undo['created_labels'][] = $labelId; }
                }
                $ins = $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'person', ?)"); $ins->execute([$labelId, (int) $c['person_id']]);
                if ($ins->rowCount()) { $undo['label_links'][] = [$labelId, (int) $c['person_id']]; $stats['labels']++; }
            } else {
                foreach ($c['cells'] as $x) {
                    $pdo->prepare('UPDATE ' . ro_ident($x['t']) . ' SET ' . ro_ident($x['c']) . '=? WHERE id=?')->execute([$x['after'], $x['id']]);
                    if (in_array($x['t'], ['persons', 'events'], true)) { $pdo->prepare('UPDATE ' . $x['t'] . ' SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$x['id']]); }
                    $undo['changes'][] = $x;
                }
            }
            $stats['changes']++;
            $row['done'] = true;
            $rows[] = $row;
        }
    }
    return ['rows' => $rows, 'undo' => $undo, 'stats' => $stats];
}

/** 👁 Aperçu : les étapes sont faites puis défaites (ROLLBACK) ; rien n'est gardé. */
function rt_batch_preview(PDO $pdo, array $raw): array
{
    $recipe = rt_recipe_clean($raw);
    if (!$recipe['steps']) { throw new LcndaBadInput('Choisis un traitement.'); }
    $pdo->beginTransaction();
    try { $r = rt_run($pdo, $recipe, []); }
    finally { if ($pdo->inTransaction()) { $pdo->rollBack(); } }
    $rows = $r['rows'];
    return ['rows' => array_slice($rows, 0, 3000), 'total' => count($rows), 'shown' => min(3000, count($rows)), 'stats' => $r['stats'], 'steps' => count($recipe['steps']),
        'places' => count(array_unique(array_map(static fn($x) => $x['key'], array_filter($rows, static fn($x) => $x['what'] === 'place'))))];
}

/** Une copie de la base juste avant (dossier des sauvegardes, jamais retirée par la rotation des sauvegardes automatiques) */
function rt_backup(PDO $pdo): string
{
    $dir = DATA_DIR . '/backups';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier des sauvegardes : rien n’a été changé.'); }
    $name = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-avant-traitement.db';
    $pdo->exec('VACUUM main INTO ' . $pdo->quote($dir . '/' . $name));
    $mine = glob($dir . '/genealogie-backup-*-avant-traitement.db') ?: [];
    rsort($mine);
    foreach (array_slice($mine, 10) as $old) { @unlink($old); } // les 10 dernières copies « avant traitement » sont gardées
    return $name;
}

/** ✓ Appliquer : copie de la base, puis les étapes (sauf les lignes décochées), journal, ↶ */
function rt_batch_apply(PDO $pdo, array $data): array
{
    $recipe = rt_recipe_clean(is_array($data['def'] ?? null) ? $data['def'] : []);
    if (!$recipe['steps']) { throw new LcndaBadInput('Choisis un traitement.'); }
    $skip = array_flip(array_map('strval', array_filter(is_array($data['skip'] ?? null) ? $data['skip'] : [], 'is_scalar')));
    $backup = rt_backup($pdo);
    $pdo->beginTransaction();
    try {
        $r = rt_run($pdo, $recipe, $skip);
        $s = $r['stats'];
        $undoId = 0;
        if ($s['changes']) {
            $names = ['place_abbrev' => 'abréviations des lieux', 'place_text' => 'remplacer dans les lieux', 'place_county' => 'départements', 'place_split' => 'lieux découpés', 'place_merge' => 'lieux en double',
                'dates_vers' => 'dates « vers »', 'names_case' => 'majuscules des noms', 'clean' => 'nettoyage', 'label' => 'étiquette'];
            $summary = sprintf('Traitement en lot : %s (%d)', implode(' + ', array_map(static fn($st) => $names[$st['op']] ?? $st['op'], $recipe['steps'])), $s['changes']);
            $undoId = ro_undo_save($pdo, 'batch', $summary, $r['undo'] + ['backup' => $backup]);
            log_change($pdo, 'batch', $undoId, 'update', $summary,
                ['changes' => array_map(static fn($c) => [$c['t'], $c['c'], $c['id'], $c['before']], array_slice($r['undo']['changes'], 0, 500))],
                ['changes' => array_map(static fn($c) => [$c['t'], $c['c'], $c['id'], $c['after']], array_slice($r['undo']['changes'], 0, 500)), 'merges' => $s['merges'], 'labels' => $s['labels'], 'backup' => $backup]);
        }
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['count' => $s['changes'], 'merges' => $s['merges'], 'labels' => $s['labels'], 'locked' => $s['locked'], 'skipped' => $s['skipped'], 'undo_id' => $undoId, 'backup' => $backup];
}

/** ↶ Tout annuler : les lieux fusionnés reviennent, puis chaque case reprend son ancien texte (seulement si rien n'a changé depuis) */
function rt_undo(PDO $pdo, array $data): array
{
    $row = ro_undo_row($pdo, safe_int($data['id'] ?? 0));
    if ($row['kind'] !== 'batch') { throw new LcndaBadInput('Rien à annuler ici.'); }
    if ((int) $row['undone'] === 1) { return ['already' => true]; }
    $p = $row['payload']; $n = 0; $kept = 0;
    foreach ($p['deleted_places'] ?? [] as $snap) { $ex = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $ex->execute([(int) $snap['id']]); if (!$ex->fetchColumn()) { insert_snapshot_row($pdo, 'places', $snap); } }
    foreach (array_reverse($p['changes'] ?? []) as $c) { $done = ro_set_if($pdo, (string) $c['t'], (string) $c['c'], (int) $c['id'], $c['after'], $c['before']); $n += $done; if (!$done) { $kept++; } }
    $del = $pdo->prepare("DELETE FROM label_links WHERE label_id=? AND entity_type='person' AND entity_id=?");
    foreach ($p['label_links'] ?? [] as [$lid, $pid]) { $del->execute([(int) $lid, (int) $pid]); $n += $del->rowCount(); }
    foreach ($p['created_labels'] ?? [] as $lid) { $c = $pdo->prepare('SELECT count(*) FROM label_links WHERE label_id=?'); $c->execute([(int) $lid]); if (!(int) $c->fetchColumn()) { $pdo->prepare('DELETE FROM labels WHERE id=?')->execute([(int) $lid]); } }
    $pdo->prepare('UPDATE ro_undo SET undone=1 WHERE id=?')->execute([(int) $row['id']]);
    log_change($pdo, 'ro_undo', (int) $row['id'], 'restore', 'Annulé : ' . $row['summary'], null, ['count' => $n, 'kept' => $kept]);
    return ['undone' => $n, 'kept' => $kept];
}

/** ↷ Rétablir : les mêmes changements, de nouveau (seulement là où rien n'a changé depuis) */
function rt_redo(PDO $pdo, array $data): array
{
    $row = ro_undo_row($pdo, safe_int($data['id'] ?? 0));
    if ($row['kind'] !== 'batch') { throw new LcndaBadInput('Rien à rétablir ici.'); }
    if ((int) $row['undone'] !== 1) { return ['already' => true]; }
    $p = $row['payload']; $n = 0;
    foreach ($p['changes'] ?? [] as $c) { $n += ro_set_if($pdo, (string) $c['t'], (string) $c['c'], (int) $c['id'], $c['before'], $c['after']); }
    foreach ($p['deleted_places'] ?? [] as $snap) { $pdo->prepare('DELETE FROM places WHERE id=? AND NOT EXISTS (SELECT 1 FROM events WHERE place_id=?)')->execute([(int) $snap['id'], (int) $snap['id']]); }
    foreach ($p['created_labels'] ?? [] as $lid) { /* l'étiquette revient avec ses liens */ }
    $ins = $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id, entity_type, entity_id) VALUES(?, 'person', ?)");
    foreach ($p['label_links'] ?? [] as [$lid, $pid]) {
        $ex = $pdo->prepare('SELECT 1 FROM labels WHERE id=?'); $ex->execute([(int) $lid]);
        if ($ex->fetchColumn()) { $ins->execute([(int) $lid, (int) $pid]); $n += $ins->rowCount(); }
    }
    $pdo->prepare('UPDATE ro_undo SET undone=0 WHERE id=?')->execute([(int) $row['id']]);
    log_change($pdo, 'ro_undo', (int) $row['id'], 'update', 'Rétabli : ' . $row['summary'], null, ['count' => $n]);
    return ['redone' => $n];
}
