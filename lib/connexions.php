<?php
declare(strict_types=1);

/*
 * 🔌 Connexions : 🧺 le panier, 📍 « Mettre dans… », les pistes à plusieurs pièces, les liens courrier / rappel ↔ enquête.
 * Interface : assets/js/heritage-connexions.js (maquette validée docs/design/connexions-besoins.html, étapes 1 et 2) ;
 * les besoins (étapes 3 et 4) : lib/connexions_besoins.php et assets/js/heritage-connexions-besoins.js.
 *
 * Tables (créées à la première demande, dans la base : elles suivent la sauvegarde, la synchro et l'export comme les autres) :
 *  - cx_baskets(id, name)                                  un ou plusieurs paniers (réglage « genealogie-connexions »)
 *  - cx_basket_items(id, basket_id, kind, ref_id, title, value, data_json, origin_json, position)
 *      kind : person, event, source, media, note, place, investigation, act, datum (une info précise : une date, un lieu,
 *      un champ, une phrase), text (un passage), row (une ligne de liste), data (un résultat de « Données »),
 *      set (un ensemble : un tableau avec sa source et ses critères ; data_json = {columns, rows, source, url, criteria, refresh}).
 *  - investigation_item_links(id, investigation_item_id, entity_type, entity_id, label, value, data_json, origin_json)
 *      les pièces d'une piste (plusieurs événements, sources, médias, notes, lieux, infos précises, ensembles…).
 *      Colonnes entity_type / entity_id : l'export « sans les événements confidentiels » les filtre (lib/heritage_tools.php).
 *  - cx_links(id, a_type, a_id, b_type, b_id)              courrier → piste, rappel → enquête ou piste.
 *
 * GET  cx_count | cx_basket&basket_id= | cx_person_investigations&person_id= | cx_links&a_type=&a_id= (ou b_type/b_id)
 *      | cx_item_links&item_id= | cx_notes&q= | cx_used&kind=&ids= (« Déjà utilisé dans… »)
 * POST cx_write {op: basket_add | basket_remove | basket_restore | basket_clear | basket_new | basket_rename | basket_delete
 *      | basket_undelete | inv_receive | inv_receive_undo | link_add | link_remove | item_link_remove | item_link_restore
 *      | reminder_add | to_mylist}
 */

require_once __DIR__ . '/connexions_besoins.php'; // 🧩 les besoins (étapes 3 et 4) et 🗺 « Mettre dans… » une carte

const CX_KINDS = ['person', 'event', 'source', 'media', 'note', 'place', 'investigation', 'act', 'datum', 'text', 'row', 'data', 'set', 'citation', 'digest', 'courrier', 'reminder', 'atelier'];
const CX_LINK_TYPES = ['courrier', 'reminder', 'investigation', 'investigation_item', 'atelier_item', 'note', 'media'];

function cx_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS cx_baskets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS cx_basket_items (id INTEGER PRIMARY KEY AUTOINCREMENT, basket_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'datum', ref_id INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '', value TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '', origin_json TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (basket_id) REFERENCES cx_baskets(id) ON DELETE CASCADE)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cx_basket_items_basket ON cx_basket_items(basket_id, position)');
    // 🧺 paniers nommés (« Mariage MAZAUD 1813 ») : un emoji, une couleur, une ligne d'explication ; chaque élément : « ✓ utilisé » et une note
    $has = static fn(string $t): array => array_column($pdo->query("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    $bc = $has('cx_baskets');
    // 📁 les paniers se rangent dans des dossiers (folder_id ; 0 = tout en haut), les dossiers dans des dossiers (sans fin, jamais de boucle) ;
    //    où va ce panier d'habitude (dests_json). Tout dossier contient au moins un panier quelque part dedans.
    $pdo->exec("CREATE TABLE IF NOT EXISTS cx_folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', parent_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    foreach (['icon' => "TEXT NOT NULL DEFAULT ''", 'color' => "TEXT NOT NULL DEFAULT ''", 'note' => "TEXT NOT NULL DEFAULT ''", 'folder_id' => 'INTEGER NOT NULL DEFAULT 0', 'dests_json' => "TEXT NOT NULL DEFAULT ''"] as $c => $def) { if (!in_array($c, $bc, true)) { try { $pdo->exec("ALTER TABLE cx_baskets ADD COLUMN $c $def"); } catch (Throwable $_) {} } }
    $ic = $has('cx_basket_items');
    foreach (['done' => 'INTEGER NOT NULL DEFAULT 0', 'note' => "TEXT NOT NULL DEFAULT ''"] as $c => $def) { if (!in_array($c, $ic, true)) { try { $pdo->exec("ALTER TABLE cx_basket_items ADD COLUMN $c $def"); } catch (Throwable $_) {} } }
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_item_links (id INTEGER PRIMARY KEY AUTOINCREMENT, investigation_item_id INTEGER NOT NULL, entity_type TEXT NOT NULL DEFAULT 'datum', entity_id INTEGER NOT NULL DEFAULT 0,
        label TEXT NOT NULL DEFAULT '', value TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '', origin_json TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (investigation_item_id) REFERENCES investigation_items(id) ON DELETE CASCADE)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_inv_item_links_item ON investigation_item_links(investigation_item_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS cx_links (id INTEGER PRIMARY KEY AUTOINCREMENT, a_type TEXT NOT NULL, a_id INTEGER NOT NULL, b_type TEXT NOT NULL, b_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(a_type, a_id, b_type, b_id))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cx_links_b ON cx_links(b_type, b_id)');
    $done = true;
}

/** une couleur #rrggbb (ou rien) */
function cx_color(mixed $v): string { $c = is_string($v) ? trim($v) : ''; return preg_match('/^#[0-9a-f]{6}$/i', $c) ? strtolower($c) : ''; }

function cx_str(mixed $v, int $max): string
{
    return mb_substr(trim(is_scalar($v) ? (string) $v : ''), 0, $max);
}

function cx_json(mixed $v, int $max = 400000): string
{
    if (!is_array($v) || !$v) { return ''; }
    $j = (string) json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($j) > $max) { throw new LcndaBadInput('Trop de données d’un coup (' . round(strlen($j) / 1e6, 1) . ' Mo).'); }
    return $j;
}

/** un élément envoyé par la page → une ligne propre */
function cx_clean_item(array $it): array
{
    $kind = in_array($it['kind'] ?? '', CX_KINDS, true) ? (string) $it['kind'] : 'datum';
    $title = cx_str($it['title'] ?? '', 500);
    $value = cx_str($it['value'] ?? '', 20000);
    if ($title === '' && $value === '') { throw new LcndaBadInput('Un élément sans rien dedans.'); }
    $origin = is_array($it['origin'] ?? null) ? array_intersect_key($it['origin'], array_flip(['kind', 'id', 'label', 'url', 'field', 'person_id', 'screen', 'open'])) : [];
    foreach ($origin as $k => $v) { if (is_string($v)) { $origin[$k] = mb_substr($v, 0, $k === 'url' ? 2000 : 300); } elseif (!is_scalar($v) && $k !== 'open') { unset($origin[$k]); } }
    if (isset($origin['url']) && !preg_match('#^https?://#i', (string) $origin['url'])) { unset($origin['url']); }
    return ['kind' => $kind, 'ref_id' => max(0, safe_int($it['ref_id'] ?? 0)), 'title' => $title, 'value' => $value,
        'data_json' => cx_json($it['data'] ?? null), 'origin_json' => cx_json($origin, 8000)];
}

function cx_row_out(array $r): array
{
    $r['id'] = (int) $r['id'];
    $r['ref_id'] = (int) ($r['ref_id'] ?? $r['entity_id'] ?? 0);
    $r['data'] = ($r['data_json'] ?? '') !== '' ? (json_decode((string) $r['data_json'], true) ?: null) : null;
    $r['origin'] = ($r['origin_json'] ?? '') !== '' ? (json_decode((string) $r['origin_json'], true) ?: null) : null;
    unset($r['data_json'], $r['origin_json']);
    return $r;
}

/* ═════════════ 🧺 le panier ═════════════ */

function cx_default_basket(PDO $pdo): int
{
    cx_schema($pdo);
    $id = (int) $pdo->query('SELECT id FROM cx_baskets ORDER BY id LIMIT 1')->fetchColumn();
    if (!$id) { $pdo->exec("INSERT INTO cx_baskets(name) VALUES('Mon panier')"); $id = (int) $pdo->lastInsertId(); }
    return $id;
}

function cx_basket_id(PDO $pdo, mixed $v): int
{
    $id = safe_int($v);
    if ($id) { $s = $pdo->prepare('SELECT id FROM cx_baskets WHERE id=?'); $s->execute([$id]); if ($s->fetchColumn()) { return $id; } }
    return cx_default_basket($pdo);
}

function cx_baskets(PDO $pdo): array
{
    cx_schema($pdo);
    $F = cx_folders($pdo); $fb = []; foreach ($F as $f) { $fb[$f['id']] = $f; }
    $rows = $pdo->query('SELECT b.*, (SELECT count(*) FROM cx_basket_items i WHERE i.basket_id=b.id) AS n, (SELECT count(*) FROM cx_basket_items i WHERE i.basket_id=b.id AND i.done=1) AS d FROM cx_baskets b ORDER BY b.name COLLATE NOCASE, b.id')->fetchAll(PDO::FETCH_ASSOC);
    // l'ordre de l'arbre : les paniers d'en haut, puis ceux de chaque dossier dans l'ordre des dossiers
    $rank = array_flip(array_column($F, 'id'));
    usort($rows, static fn($a, $b) => [isset($rank[(int) $a['folder_id']]) ? $rank[(int) $a['folder_id']] + 1 : 0, mb_strtolower((string) $a['name'])] <=> [isset($rank[(int) $b['folder_id']]) ? $rank[(int) $b['folder_id']] + 1 : 0, mb_strtolower((string) $b['name'])]);
    return array_map(static function (array $b) use ($fb) { $fid = isset($fb[(int) $b['folder_id']]) ? (int) $b['folder_id'] : 0; $path = $fid ? [...$fb[$fid]['path'], (string) $b['name']] : [(string) $b['name']];
        return ['id' => (int) $b['id'], 'name' => (string) $b['name'], 'count' => (int) $b['n'], 'done' => (int) $b['d'], 'icon' => (string) ($b['icon'] ?? ''), 'color' => (string) ($b['color'] ?? ''), 'note' => (string) ($b['note'] ?? ''),
            'updated_at' => (string) $b['updated_at'], 'folder_id' => $fid, 'path' => $path, 'depth' => $fid ? $fb[$fid]['depth'] + 1 : 0, 'dests' => json_decode((string) ($b['dests_json'] ?? ''), true) ?: []]; }, $rows);
}

/** 📁 les dossiers, dans l'ordre de l'arbre : {id, name, icon, color, parent_id, path, depth, baskets (nombre, sous-dossiers compris), total (éléments)} */
function cx_folders(PDO $pdo): array
{
    cx_schema($pdo);
    $rows = $pdo->query('SELECT * FROM cx_folders ORDER BY name COLLATE NOCASE, id')->fetchAll(PDO::FETCH_ASSOC);
    $by = []; foreach ($rows as $r) { $by[(int) $r['id']] = $r; }
    $kids = []; foreach ($rows as $r) { $pp = (int) $r['parent_id']; if ($pp && isset($by[$pp])) { $kids[$pp][] = (int) $r['id']; } }
    $nb = []; $ni = [];
    foreach ($pdo->query('SELECT b.folder_id, count(*) AS nb, (SELECT count(*) FROM cx_basket_items i JOIN cx_baskets b2 ON b2.id=i.basket_id WHERE b2.folder_id=b.folder_id) AS ni FROM cx_baskets b GROUP BY b.folder_id')->fetchAll(PDO::FETCH_ASSOC) as $r) { $nb[(int) $r['folder_id']] = (int) $r['nb']; $ni[(int) $r['folder_id']] = (int) $r['ni']; }
    $order = []; $depth = []; $path = [];
    $walk = static function (int $id, int $d, array $pa) use (&$walk, &$order, &$depth, &$path, $kids, $by): void { if (isset($depth[$id])) { return; } $order[] = $id; $depth[$id] = $d; $path[$id] = [...$pa, (string) $by[$id]['name']]; foreach ($kids[$id] ?? [] as $k) { $walk($k, $d + 1, $path[$id]); } };
    foreach ($rows as $r) { $pp = (int) $r['parent_id']; if (!$pp || !isset($by[$pp])) { $walk((int) $r['id'], 0, []); } }
    foreach ($rows as $r) { if (!isset($depth[(int) $r['id']])) { $walk((int) $r['id'], 0, []); } } // une boucle d'une vieille base : quand même listée
    $sum = static function (int $id, array $m, array $seen = []) use (&$sum, $kids): int { if (isset($seen[$id])) { return 0; } $seen[$id] = 1; $n = $m[$id] ?? 0; foreach ($kids[$id] ?? [] as $k) { $n += $sum($k, $m, $seen); } return $n; };
    return array_map(static fn(int $id) => ['id' => $id, 'name' => (string) $by[$id]['name'], 'icon' => (string) $by[$id]['icon'], 'color' => (string) $by[$id]['color'], 'parent_id' => isset($by[(int) $by[$id]['parent_id']]) ? (int) $by[$id]['parent_id'] : 0,
        'path' => $path[$id], 'depth' => $depth[$id], 'baskets' => $sum($id, $nb), 'total' => $sum($id, $ni), 'updated_at' => (string) $by[$id]['updated_at']], $order);
}

/** un dossier et tous ses sous-dossiers */
function cx_folder_tree_ids(PDO $pdo, int $id): array
{
    $all = $pdo->query('SELECT id, parent_id FROM cx_folders')->fetchAll(PDO::FETCH_ASSOC); $out = [$id]; $grew = true;
    while ($grew) { $grew = false; foreach ($all as $r) { if (in_array((int) $r['parent_id'], $out, true) && !in_array((int) $r['id'], $out, true)) { $out[] = (int) $r['id']; $grew = true; } } }
    return $out;
}

/** ranger dans un dossier : il doit exister ; un dossier jamais dans lui-même ni dans un de ses sous-dossiers (pas de boucle) */
function cx_folder_ok(PDO $pdo, int $folder, int $moving = 0): int
{
    if (!$folder) { return 0; }
    $s = $pdo->prepare('SELECT id FROM cx_folders WHERE id=?'); $s->execute([$folder]); if (!$s->fetchColumn()) { throw new LcndaBadInput('Dossier introuvable.'); }
    if ($moving && in_array($folder, cx_folder_tree_ids($pdo, $moving), true)) { throw new LcndaBadInput('Un dossier ne peut pas aller dans lui-même ni dans un de ses sous-dossiers.'); }
    return $folder;
}

/** les dossiers devenus sans aucun panier dedans (après un déplacement ou une suppression) : à proposer de supprimer */
function cx_folders_emptied(PDO $pdo, array $ids): array
{
    $out = [];
    foreach (cx_folders($pdo) as $f) { if (in_array($f['id'], $ids, true) && $f['baskets'] === 0) { $out[] = ['id' => $f['id'], 'name' => $f['name']]; } }
    return $out;
}

/** les dossiers au-dessus d'un dossier (lui compris) */
function cx_folder_up(PDO $pdo, int $id): array
{
    $out = []; $s = $pdo->prepare('SELECT parent_id FROM cx_folders WHERE id=?');
    while ($id && !in_array($id, $out, true)) { $out[] = $id; $s->execute([$id]); $id = (int) $s->fetchColumn(); }
    return $out;
}

/** où va ce panier d'habitude : [{id, label, ctx}] (12 au plus) */
function cx_dests_json(mixed $v): string
{
    $out = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, 12) as $x) {
        if (!is_array($x) || !preg_match('/^[a-z0-9_]{1,40}$/', (string) ($x['id'] ?? ''))) { continue; }
        $ctx = is_array($x['ctx'] ?? null) ? array_filter($x['ctx'], static fn($y) => is_scalar($y)) : null;
        $out[] = ['id' => (string) $x['id'], 'label' => cx_str($x['label'] ?? '', 160)] + ($ctx ? ['ctx' => array_map(static fn($y) => is_string($y) ? mb_substr($y, 0, 300) : $y, $ctx)] : []);
    }
    return $out ? json_encode($out, JSON_UNESCAPED_UNICODE) : '';
}

/** GET cx_count : le nombre d'éléments (pour la pastille), sans rien créer si la table n'existe pas encore */
function cx_count(PDO $pdo, array $q): array
{
    $has = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cx_basket_items'")->fetchColumn();
    if (!$has) { return ['count' => 0, 'total' => 0, 'baskets' => 0]; }
    $bid = safe_int($q['basket_id'] ?? 0);
    $total = (int) $pdo->query('SELECT count(*) FROM cx_basket_items')->fetchColumn();
    $first = (int) $pdo->query('SELECT id FROM cx_baskets ORDER BY id LIMIT 1')->fetchColumn();
    $s = $pdo->prepare('SELECT count(*) FROM cx_basket_items WHERE basket_id=?'); $s->execute([$bid ?: $first]);
    return ['count' => (int) $s->fetchColumn(), 'total' => $total, 'baskets' => (int) $pdo->query('SELECT count(*) FROM cx_baskets')->fetchColumn()];
}

function cx_basket(PDO $pdo, array $q): array
{
    $bid = cx_basket_id($pdo, $q['basket_id'] ?? 0);
    // all=1 : les éléments de TOUS les paniers (chacun avec son basket_id), pour l'arbre 📁 › 🧺 › éléments
    if ((string) ($q['all'] ?? '') === '1') { $s = $pdo->query('SELECT * FROM cx_basket_items ORDER BY basket_id, position, id'); }
    else { $s = $pdo->prepare('SELECT * FROM cx_basket_items WHERE basket_id=? ORDER BY position, id'); $s->execute([$bid]); }
    return ['basket_id' => $bid, 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo), 'items' => array_map('cx_row_out', $s->fetchAll(PDO::FETCH_ASSOC))];
}

function cx_basket_add(PDO $pdo, array $d): array
{
    $bid = cx_basket_id($pdo, $d['basket_id'] ?? 0);
    $items = array_slice(is_array($d['items'] ?? null) ? $d['items'] : [], 0, 500);
    if (!$items) { throw new LcndaBadInput('Rien à mettre au panier.'); }
    $pos = (int) $pdo->query('SELECT COALESCE(max(position),0) FROM cx_basket_items WHERE basket_id=' . $bid)->fetchColumn();
    $ins = $pdo->prepare('INSERT INTO cx_basket_items(basket_id, kind, ref_id, title, value, data_json, origin_json, position) VALUES(?,?,?,?,?,?,?,?)');
    $same = $pdo->prepare('SELECT id FROM cx_basket_items WHERE basket_id=? AND kind=? AND ref_id=? AND title=? AND value=? LIMIT 1');
    $ids = []; $skipped = 0;
    $pdo->beginTransaction();
    try {
        foreach ($items as $it) {
            if (!is_array($it)) { continue; }
            $c = cx_clean_item($it);
            $same->execute([$bid, $c['kind'], $c['ref_id'], $c['title'], $c['value']]);
            if ($same->fetchColumn()) { $skipped++; continue; } // déjà dedans : pas deux fois
            $ins->execute([$bid, $c['kind'], $c['ref_id'], $c['title'], $c['value'], $c['data_json'], $c['origin_json'], ++$pos]);
            $ids[] = (int) $pdo->lastInsertId();
        }
        $pdo->prepare('UPDATE cx_baskets SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$bid]);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    return ['ids' => $ids, 'skipped' => $skipped, 'basket_id' => $bid] + cx_count($pdo, ['basket_id' => $bid]);
}

/** retirer (une ou plusieurs lignes, ou tout le panier) : les lignes retirées reviennent pour « ↶ Annuler » */
function cx_basket_remove(PDO $pdo, array $d, bool $all = false): array
{
    cx_schema($pdo);
    if ($all) {
        $bid = cx_basket_id($pdo, $d['basket_id'] ?? 0);
        $s = $pdo->prepare('SELECT * FROM cx_basket_items WHERE basket_id=?'); $s->execute([$bid]);
    } else {
        $ids = array_values(array_filter(array_map('intval', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 1000))));
        if (!$ids) { return ['removed' => []]; }
        $s = $pdo->prepare('SELECT * FROM cx_basket_items WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'); $s->execute($ids);
    }
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    if ($rows) { $pdo->exec('DELETE FROM cx_basket_items WHERE id IN (' . implode(',', array_map(static fn($r) => (int) $r['id'], $rows)) . ')'); }
    return ['removed' => $rows] + cx_count($pdo, ['basket_id' => $rows[0]['basket_id'] ?? 0]);
}

function cx_basket_restore(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO cx_basket_items(id, basket_id, kind, ref_id, title, value, data_json, origin_json, position, created_at, done, note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    $n = 0;
    foreach (array_slice(is_array($d['rows'] ?? null) ? $d['rows'] : [], 0, 1000) as $r) {
        if (!is_array($r)) { continue; }
        $bid = cx_basket_id($pdo, $r['basket_id'] ?? 0);
        $c = cx_clean_item(['kind' => $r['kind'] ?? '', 'title' => $r['title'] ?? '', 'value' => $r['value'] ?? '', 'ref_id' => $r['ref_id'] ?? 0,
            'data' => json_decode((string) ($r['data_json'] ?? ''), true), 'origin' => json_decode((string) ($r['origin_json'] ?? ''), true)]);
        $ins->execute([safe_int($r['id'] ?? 0) ?: null, $bid, $c['kind'], $c['ref_id'], $c['title'], $c['value'], $c['data_json'], $c['origin_json'], safe_int($r['position'] ?? 0), cx_str($r['created_at'] ?? date('Y-m-d H:i:s'), 30), !empty($r['done']) ? 1 : 0, cx_str($r['note'] ?? '', 2000)]);
        $n += $ins->rowCount();
    }
    return ['restored' => $n] + cx_count($pdo, []);
}

/* ═════════════ 🕵️ les enquêtes d'une personne, les pièces d'une piste ═════════════ */

/** GET cx_person_investigations : toutes les enquêtes où la personne apparaît (principale ou secondaire), avec leurs pistes */
function cx_person_investigations(PDO $pdo, array $q): array
{
    $pid = safe_int($q['person_id'] ?? 0);
    $hasIp = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='investigation_persons'")->fetchColumn();
    if ($pid) {
        $sql = "SELECT i.id, i.title, COALESCE(i.status,'open') AS status, i.updated_at, i.person_id, CASE WHEN i.person_id=? THEN 'main' ELSE COALESCE(ip.role,'secondary') END AS role
            FROM investigations i " . ($hasIp ? 'LEFT JOIN investigation_persons ip ON ip.investigation_id=i.id AND ip.person_id=?' : 'LEFT JOIN (SELECT NULL AS role) ip ON 1') . '
            WHERE i.person_id=?' . ($hasIp ? ' OR ip.person_id IS NOT NULL' : '') . ' GROUP BY i.id ORDER BY COALESCE(i.status,\'open\')<>\'open\', i.updated_at DESC, i.id DESC LIMIT 100';
        $s = $pdo->prepare($sql); $s->execute($hasIp ? [$pid, $pid, $pid] : [$pid, $pid]);
    } else {
        $s = $pdo->query("SELECT i.id, i.title, COALESCE(i.status,'open') AS status, i.updated_at, i.person_id, 'main' AS role FROM investigations i ORDER BY COALESCE(i.status,'open')<>'open', i.updated_at DESC, i.id DESC LIMIT 60");
    }
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $it = $pdo->prepare('SELECT id, title, status FROM investigation_items WHERE investigation_id=? ORDER BY CASE status WHEN \'to_explore_priority\' THEN 0 WHEN \'to_explore\' THEN 1 WHEN \'promising\' THEN 2 ELSE 3 END, id DESC LIMIT 80');
    foreach ($rows as &$r) { $r['id'] = (int) $r['id']; $it->execute([$r['id']]); $r['items'] = $it->fetchAll(PDO::FETCH_ASSOC); }
    unset($r);
    return ['investigations' => $rows];
}

function cx_item_links(PDO $pdo, int $itemId): array
{
    cx_schema($pdo);
    $s = $pdo->prepare('SELECT * FROM investigation_item_links WHERE investigation_item_id=? ORDER BY id'); $s->execute([$itemId]);
    return array_map('cx_row_out', $s->fetchAll(PDO::FETCH_ASSOC));
}

/** toutes les pièces des pistes d'une enquête, rangées par piste (pour investigation_detail) */
function cx_investigation_links(PDO $pdo, int $investigationId): array
{
    cx_schema($pdo);
    $s = $pdo->prepare('SELECT l.* FROM investigation_item_links l JOIN investigation_items ii ON ii.id=l.investigation_item_id WHERE ii.investigation_id=? ORDER BY l.id'); $s->execute([$investigationId]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['investigation_item_id']][] = cx_row_out($r); }
    return $out;
}

function cx_event_label(PDO $pdo, int $eventId): string
{
    if (function_exists('investigation_event_label')) { $l = investigation_event_label($pdo, $eventId); if ($l !== '') { return $l; } }
    $s = $pdo->prepare('SELECT t.label, e.date_text, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.id=?'); $s->execute([$eventId]);
    $e = $s->fetch(PDO::FETCH_ASSOC);
    return $e ? trim($e['label'] . ' — ' . ($e['date_text'] ?: ($e['year'] ?: 'date inconnue'))) : '';
}

/** une pièce de plus sur une piste (sans doublon) → id ou 0 si déjà là */
function cx_add_item_link(PDO $pdo, int $itemId, array $c): int
{
    cx_schema($pdo);
    $s = $pdo->prepare('SELECT id FROM investigation_item_links WHERE investigation_item_id=? AND entity_type=? AND entity_id=? AND label=? AND value=?');
    $s->execute([$itemId, $c['kind'], $c['ref_id'], $c['title'], $c['value']]);
    if ($s->fetchColumn()) { return 0; }
    $pdo->prepare('INSERT INTO investigation_item_links(investigation_item_id, entity_type, entity_id, label, value, data_json, origin_json) VALUES(?,?,?,?,?,?,?)')
        ->execute([$itemId, $c['kind'], $c['ref_id'], $c['title'], $c['value'], $c['data_json'], $c['origin_json']]);
    return (int) $pdo->lastInsertId();
}

/** « Relier un événement » à une piste qui en a déjà un : le nouveau s'ajoute (au lieu de remplacer) → id du lien, 0 si déjà là */
function cx_add_event_to_item(PDO $pdo, int $itemId, int $eventId): int
{
    $s = $pdo->prepare('SELECT linked_event_id FROM investigation_items WHERE id=?'); $s->execute([$itemId]);
    if ((int) $s->fetchColumn() === $eventId) { return 0; }
    return cx_add_item_link($pdo, $itemId, ['kind' => 'event', 'ref_id' => $eventId, 'title' => cx_event_label($pdo, $eventId), 'value' => '', 'data_json' => '', 'origin_json' => '']);
}

/**
 * POST inv_receive {investigation_id, item_id, mode: 'one' | 'each', title, items} : ranger des éléments dans une enquête.
 *  item_id > 0 : sur cette piste ; sinon une nouvelle piste (mode 'one' : une pour tout, 'each' : une par élément).
 *  Un média : aussi dans les pièces de l'enquête, rattaché à la piste ; une personne : aussi « personne liée » (secondaire).
 * → {item_ids créées, link_ids, media_link_ids, person_link_ids} pour « ↶ Annuler » (inv_receive_undo).
 */
function cx_inv_receive(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $inv = safe_int($d['investigation_id'] ?? 0);
    $s = $pdo->prepare('SELECT id, person_id, title FROM investigations WHERE id=?'); $s->execute([$inv]); $invRow = $s->fetch(PDO::FETCH_ASSOC);
    if (!$invRow) { throw new LcndaBadInput('Enquête introuvable.'); }
    $itemId = safe_int($d['item_id'] ?? 0);
    if ($itemId) { $s = $pdo->prepare('SELECT id FROM investigation_items WHERE id=? AND investigation_id=?'); $s->execute([$itemId, $inv]); if (!$s->fetchColumn()) { throw new LcndaBadInput('Piste introuvable dans cette enquête.'); } }
    $items = array_values(array_filter(array_slice(is_array($d['items'] ?? null) ? $d['items'] : [], 0, 500), 'is_array'));
    if (!$items) { throw new LcndaBadInput('Rien à ranger.'); }
    $mode = ($d['mode'] ?? '') === 'each' ? 'each' : 'one';
    $out = ['item_ids' => [], 'link_ids' => [], 'media_link_ids' => [], 'media_item_links' => [], 'person_link_ids' => [], 'investigation_id' => $inv];
    $newItem = static function (string $title, string $kind = 'lead') use ($pdo, $inv, &$out): int {
        $pdo->prepare("INSERT INTO investigation_items(investigation_id, kind, title, status) VALUES(?,?,?,'to_explore')")->execute([$inv, $kind, mb_substr($title, 0, 200) ?: 'Pièces prises']);
        $id = (int) $pdo->lastInsertId(); $out['item_ids'][] = $id; return $id;
    };
    $pdo->beginTransaction();
    try {
        if (!$itemId && $mode === 'one') { $itemId = $newItem(cx_str($d['title'] ?? '', 200) ?: (count($items) > 1 ? count($items) . ' pièces prises' : (string) ($items[0]['title'] ?? 'Pièce prise'))); }
        foreach ($items as $raw) {
            $c = cx_clean_item($raw);
            $target = $itemId ?: $newItem($c['title'] ?: mb_substr($c['value'], 0, 120), match ($c['kind']) { 'source' => 'source', 'note', 'text', 'datum' => 'note', 'event' => 'event', 'media' => 'document', default => 'lead' });
            if ($c['kind'] === 'event' && $c['ref_id']) {
                $s = $pdo->prepare('SELECT linked_event_id FROM investigation_items WHERE id=?'); $s->execute([$target]);
                if (!(int) $s->fetchColumn()) { // la piste n'a pas encore d'événement : il devient le sien (comme « Relier un événement »)
                    $pdo->prepare('UPDATE investigation_items SET linked_event_id=?, linked_event_label=? WHERE id=?')->execute([$c['ref_id'], cx_event_label($pdo, $c['ref_id']), $target]);
                    $out['event_set'][] = $target; continue;
                }
            }
            if ($c['kind'] === 'media' && $c['ref_id']) {
                $s = $pdo->prepare('SELECT id FROM investigation_media WHERE investigation_id=? AND media_id=?'); $s->execute([$inv, $c['ref_id']]);
                $lid = (int) $s->fetchColumn();
                if (!$lid) { $pdo->prepare("INSERT INTO investigation_media(investigation_id, media_id, verdict) VALUES(?,?,'interesting')")->execute([$inv, $c['ref_id']]); $lid = (int) $pdo->lastInsertId(); $out['media_link_ids'][] = $lid; }
                $pdo->prepare('INSERT OR IGNORE INTO investigation_media_items(investigation_media_id, investigation_item_id) VALUES(?,?)')->execute([$lid, $target]);
                $out['media_item_links'][] = [$lid, $target];
                continue;
            }
            if ($c['kind'] === 'person' && $c['ref_id'] && (int) $invRow['person_id'] !== $c['ref_id']) {
                try {
                    $s = $pdo->prepare('SELECT id FROM investigation_persons WHERE investigation_id=? AND person_id=?'); $s->execute([$inv, $c['ref_id']]);
                    if (!$s->fetchColumn()) { $pdo->prepare("INSERT INTO investigation_persons(investigation_id, person_id, role) VALUES(?,?,'secondary')")->execute([$inv, $c['ref_id']]); $out['person_link_ids'][] = (int) $pdo->lastInsertId(); }
                } catch (Throwable $_) {}
            }
            $lid = cx_add_item_link($pdo, $target, $c);
            if ($lid) { $out['link_ids'][] = $lid; }
        }
        $pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$inv]);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    log_change($pdo, 'investigation', $inv, 'update', 'Pièces rangées dans l’enquête « ' . $invRow['title'] . ' » (' . count($items) . ')', null, $out);
    $out['item_id'] = $itemId;
    return $out;
}

function cx_inv_receive_undo(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $ints = static fn($k) => array_values(array_filter(array_map('intval', is_array($d[$k] ?? null) ? $d[$k] : [])));
    $in = static fn(array $ids) => implode(',', $ids ?: [0]);
    $pdo->beginTransaction();
    try {
        $pdo->exec('DELETE FROM investigation_item_links WHERE id IN (' . $in($ints('link_ids')) . ')');
        foreach (is_array($d['media_item_links'] ?? null) ? $d['media_item_links'] : [] as $p) { if (is_array($p) && count($p) === 2) { $pdo->prepare('DELETE FROM investigation_media_items WHERE investigation_media_id=? AND investigation_item_id=?')->execute([(int) $p[0], (int) $p[1]]); } }
        $pdo->exec('DELETE FROM investigation_media WHERE id IN (' . $in($ints('media_link_ids')) . ')');
        try { $pdo->exec('DELETE FROM investigation_persons WHERE id IN (' . $in($ints('person_link_ids')) . ')'); } catch (Throwable $_) {}
        $pdo->exec("UPDATE investigation_items SET linked_event_id=0, linked_event_label='' WHERE id IN (" . $in($ints('event_set')) . ')');
        $pdo->exec('DELETE FROM investigation_items WHERE id IN (' . $in($ints('item_ids')) . ')');
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    return ['ok' => true];
}

function cx_item_link_remove(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $ids = array_values(array_filter(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : [$d['id'] ?? 0])));
    if (!$ids) { return ['removed' => []]; }
    $s = $pdo->prepare('SELECT * FROM investigation_item_links WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')'); $s->execute($ids);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $pdo->exec('DELETE FROM investigation_item_links WHERE id IN (' . implode(',', $ids) . ')');
    return ['removed' => $rows];
}

function cx_item_link_restore(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO investigation_item_links(id, investigation_item_id, entity_type, entity_id, label, value, data_json, origin_json, created_at) VALUES(?,?,?,?,?,?,?,?,?)');
    foreach (is_array($d['rows'] ?? null) ? $d['rows'] : [] as $r) {
        if (!is_array($r)) { continue; }
        $ins->execute([safe_int($r['id'] ?? 0) ?: null, safe_int($r['investigation_item_id'] ?? 0), in_array($r['entity_type'] ?? '', CX_KINDS, true) ? $r['entity_type'] : 'datum', safe_int($r['entity_id'] ?? 0),
            cx_str($r['label'] ?? '', 500), cx_str($r['value'] ?? '', 20000), (string) ($r['data_json'] ?? ''), (string) ($r['origin_json'] ?? ''), cx_str($r['created_at'] ?? date('Y-m-d H:i:s'), 30)]);
    }
    return ['ok' => true];
}

/* ═════════════ 🔗 liens courrier / rappel ↔ enquête, piste ═════════════ */

function cx_links(PDO $pdo, array $q): array
{
    cx_schema($pdo);
    $where = []; $args = [];
    foreach (['a', 'b'] as $s) { if (($q[$s . '_type'] ?? '') !== '') { $where[] = "{$s}_type=? AND {$s}_id=?"; $args[] = (string) $q[$s . '_type']; $args[] = safe_int($q[$s . '_id'] ?? 0); } }
    if (!$where) { return ['links' => []]; }
    $s = $pdo->prepare('SELECT * FROM cx_links WHERE ' . implode(' AND ', $where) . ' ORDER BY id'); $s->execute($args);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) { // le nom de ce qui est relié (une piste, une enquête), pour l'afficher
        foreach (['a', 'b'] as $side) {
            $t = $r[$side . '_type']; $id = (int) $r[$side . '_id'];
            $r[$side . '_label'] = match ($t) {
                'investigation_item' => (string) ($pdo->query('SELECT ii.title || \' — \' || i.title FROM investigation_items ii JOIN investigations i ON i.id=ii.investigation_id WHERE ii.id=' . $id)->fetchColumn() ?: ''),
                'investigation' => (string) ($pdo->query('SELECT title FROM investigations WHERE id=' . $id)->fetchColumn() ?: ''),
                'courrier' => (string) ($pdo->query('SELECT destinataire || \' — \' || objet FROM courriers WHERE id=' . $id)->fetchColumn() ?: ''),
                'reminder' => (string) ($pdo->query('SELECT title FROM standalone_reminders WHERE id=' . $id)->fetchColumn() ?: ''),
                default => '',
            };
        }
        if (($r['b_type'] ?? '') === 'investigation_item') { $r['investigation_id'] = (int) $pdo->query('SELECT investigation_id FROM investigation_items WHERE id=' . (int) $r['b_id'])->fetchColumn(); }
    }
    unset($r);
    return ['links' => $rows];
}

function cx_link_add(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $at = (string) ($d['a_type'] ?? ''); $bt = (string) ($d['b_type'] ?? '');
    if (!in_array($at, CX_LINK_TYPES, true) || !in_array($bt, CX_LINK_TYPES, true)) { throw new LcndaBadInput('Sorte de lien inconnue.'); }
    $a = safe_int($d['a_id'] ?? 0); $b = safe_int($d['b_id'] ?? 0);
    if (!$a || !$b) { throw new LcndaBadInput('Lien incomplet.'); }
    $pdo->prepare('INSERT OR IGNORE INTO cx_links(a_type, a_id, b_type, b_id) VALUES(?,?,?,?)')->execute([$at, $a, $bt, $b]);
    $s = $pdo->prepare('SELECT id FROM cx_links WHERE a_type=? AND a_id=? AND b_type=? AND b_id=?'); $s->execute([$at, $a, $bt, $b]);
    return ['id' => (int) $s->fetchColumn()];
}

function cx_link_remove(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $s = $pdo->prepare('SELECT * FROM cx_links WHERE id=?'); $s->execute([safe_int($d['id'] ?? 0)]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if ($row) { $pdo->prepare('DELETE FROM cx_links WHERE id=?')->execute([(int) $row['id']]); }
    return ['removed' => $row ?: null];
}

/** ⏰ un rappel rattaché à une enquête ou une piste (Mettre dans… → Une tâche / un rappel) */
function cx_reminder_add(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $title = cx_str($d['title'] ?? '', 300);
    if ($title === '') { throw new LcndaBadInput('Le rappel n’a pas de titre.'); }
    $due = cx_str($d['due'] ?? '', 10);
    if ($due !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $due)) { throw new LcndaBadInput('Date du rappel incorrecte.'); }
    $pdo->prepare("INSERT INTO standalone_reminders(title, notes, reminder_mode, reminder_due_at) VALUES(?,?,'on',?)")->execute([$title, cx_str($d['notes'] ?? '', 20000), $due ?: date('Y-m-d', strtotime('+7 days'))]);
    $rid = (int) $pdo->lastInsertId(); $link = 0;
    foreach (['investigation_item', 'investigation'] as $t) {
        $b = safe_int($d[$t . '_id'] ?? 0);
        if ($b) { $link = cx_link_add($pdo, ['a_type' => 'reminder', 'a_id' => $rid, 'b_type' => $t, 'b_id' => $b])['id']; break; }
    }
    return ['reminder_id' => $rid, 'link_id' => $link];
}

/* ═════════════ 📝 chercher dans les notes (onglet « Notes » de « Prendre depuis… ») ═════════════ */
function cx_notes(PDO $pdo, array $q): array
{
    $text = cx_str($q['q'] ?? '', 120);
    $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $text) . '%';
    $s = $pdo->prepare("SELECT n.id, n.title, substr(n.body,1,600) AS body, n.entity_type, n.entity_id,
            CASE WHEN n.entity_type='person' THEN trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) ELSE '' END AS person_name
        FROM notes n LEFT JOIN persons p ON n.entity_type='person' AND p.id=n.entity_id
        WHERE (? = '' OR n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\') ORDER BY n.id DESC LIMIT 40");
    try { $s->execute([$text, $like, $like]); return ['items' => $s->fetchAll(PDO::FETCH_ASSOC)]; } catch (Throwable $_) { return ['items' => []]; }
}

/* ═════════════ ★ Garder comme liste (Mes listes : les fiches du panier) ═════════════ */
function cx_to_mylist(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $bid = cx_basket_id($pdo, $d['basket_id'] ?? 0);
    $s = $pdo->prepare("SELECT DISTINCT ref_id FROM cx_basket_items WHERE basket_id=? AND kind='person' AND ref_id>0 ORDER BY position, id"); $s->execute([$bid]);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    return ['person_ids' => $ids];
}

/* ═════════════ 📂 De l'extérieur : un FICHIER de données à une adresse donnée par l'utilisateur ═════════════
 * Téléchargé seulement après son clic, une fois, sans suivre de lien dans la page (pas de « scraping ») ; adresse publique
 * seulement (link_safe_resolve : ni 127.0.0.1 ni le réseau de la maison), 10 Mo au plus, une page web (HTML) est refusée.
 * Essai sans réseau : GENEALOGY_TEST=1 + LCNDA_TEST_CX_DIR (le fichier du même nom que la fin de l'adresse). */
function cx_fetch_url(array $d): array
{
    $url = cx_str($d['url'] ?? '', 2000);
    if (!preg_match('#^https?://#i', $url)) { throw new LcndaBadInput('Donne une adresse qui commence par https://'); }
    $max = 10 * 1024 * 1024;
    $name = basename((string) parse_url($url, PHP_URL_PATH)) ?: 'donnees';
    $dir = (string) getenv('LCNDA_TEST_CX_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
        if (!is_file($f)) { throw new RuntimeException('Pas de réponse de cette adresse.'); }
        $body = (string) file_get_contents($f); $type = str_ends_with($name, '.json') ? 'application/json' : 'text/csv';
    } else {
        if (!function_exists('link_safe_resolve')) { require_once __DIR__ . '/collections.php'; }
        if (!function_exists('curl_init')) { throw new RuntimeException('Téléchargement impossible : PHP n’a pas l’extension curl.'); }
        $body = ''; $type = '';
        for ($hop = 0; ; $hop++) {
            if ($hop > 5) { throw new RuntimeException('Trop de redirections.'); }
            $resolve = link_safe_resolve($url);
            if ($resolve === null) { throw new LcndaBadInput('Adresse refusée : seulement une adresse publique en http ou https.'); }
            $body = ''; $too = false;
            $ch = curl_init($url);
            curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 60,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, fichier de donnees)',
                CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
            curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
            unset($ch);
            if ($too) { throw new LcndaBadInput('Fichier trop gros (plus de 10 Mo).'); }
            if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = function_exists('link_absolute_url') ? link_absolute_url($url, $loc) : $loc; continue; }
            if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? 'Pas de connexion : ' . $err : 'Le serveur répond ' . $code . '.'); }
            break;
        }
    }
    $head = strtolower(ltrim(substr($body, 0, 300)));
    if (str_contains(strtolower($type), 'text/html') || str_starts_with($head, '<!doctype html') || str_starts_with($head, '<html')) {
        throw new LcndaBadInput('C’est une page web, pas un fichier de données : donne l’adresse du fichier lui-même (.csv, .json…).');
    }
    if (preg_match('/[\x00-\x08\x0E-\x1F]/', substr($body, 0, 2000)) && !str_starts_with($body, "PK")) { throw new LcndaBadInput('Ce fichier n’est pas un tableau lisible (CSV, TSV, JSON, XLSX, ODS).'); }
    return ['name' => $name, 'url' => $url, 'type' => $type, 'base64' => base64_encode($body), 'size' => strlen($body), 'at' => date('Y-m-d')];
}

/* ═════════════ « Déjà utilisé dans… » (fenêtre « Prendre depuis… ») : les enquêtes où ces éléments sont déjà rangés ═════════════
 * GET cx_used&kind=event&ids=1,2 → {used: {id: [{investigation_id, title, item_title}]}} ; cx_used&kind=labels&investigation_id= → {labels: ['sorte|titre|valeur' (200 car.)]} ; un événement : la piste qui le relie ;
 * un média : les pièces de l'enquête ; le reste : les pièces des pistes (investigation_item_links). 200 numéros au plus. */
function cx_used(PDO $pdo, array $q): array
{
    cx_schema($pdo);
    $kind = (string) preg_replace('/[^a-z_]/', '', strtolower(cx_str($q['kind'] ?? '', 30)));
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', (string) ($q['ids'] ?? ''))), static fn(int $i): bool => $i > 0))), 0, 200);
    $out = [];
    // une enquête : ce qui est déjà dans ses pistes, par titre et valeur (les lignes de liste, les infos précises n'ont pas de numéro)
    $inv = safe_int($q['investigation_id'] ?? 0);
    if ($inv && $kind === 'labels') {
        $s = $pdo->prepare('SELECT l.entity_type, l.label, l.value FROM investigation_item_links l JOIN investigation_items i ON i.id=l.investigation_item_id WHERE i.investigation_id=? ORDER BY l.id DESC LIMIT 5000'); $s->execute([$inv]);
        return ['labels' => array_map(static fn($r) => $r['entity_type'] . '|' . mb_substr((string) $r['label'], 0, 200) . '|' . mb_substr((string) $r['value'], 0, 200), $s->fetchAll(PDO::FETCH_ASSOC))];
    }
    if ($kind === '' || !$ids) { return ['used' => (object) []]; }
    $in = implode(',', $ids);
    $sqls = ["SELECT l.entity_id AS id, v.id AS investigation_id, v.title, i.title AS item_title FROM investigation_item_links l JOIN investigation_items i ON i.id=l.investigation_item_id JOIN investigations v ON v.id=i.investigation_id WHERE l.entity_type=" . $pdo->quote($kind) . " AND l.entity_id IN ({$in})"];
    if ($kind === 'event') { $sqls[] = "SELECT i.linked_event_id AS id, v.id AS investigation_id, v.title, i.title AS item_title FROM investigation_items i JOIN investigations v ON v.id=i.investigation_id WHERE i.linked_event_id IN ({$in})"; }
    if ($kind === 'media') { $sqls[] = "SELECT m.media_id AS id, v.id AS investigation_id, v.title, '' AS item_title FROM investigation_media m JOIN investigations v ON v.id=m.investigation_id WHERE m.media_id IN ({$in})"; }
    foreach ($sqls as $sql) {
        try { $rows = $pdo->query($sql . ' LIMIT 1000')->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $_) { continue; } // une ancienne base : colonne absente
        foreach ($rows as $r) {
            $k = (int) $r['id']; $iv = (int) $r['investigation_id'];
            if (in_array($iv, array_column($out[$k] ?? [], 'investigation_id'), true)) { continue; }
            $out[$k][] = ['investigation_id' => $iv, 'title' => (string) $r['title'], 'item_title' => (string) $r['item_title']];
        }
    }
    return ['used' => (object) $out];
}

/* ═════════════ aiguillage ═════════════ */
function cx_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'cx_count' => cx_count($pdo, $q),
        'cx_basket' => cx_basket($pdo, $q),
        'cx_person_investigations' => cx_person_investigations($pdo, $q),
        'cx_links' => cx_links($pdo, $q),
        'cx_item_links' => ['links' => cx_item_links($pdo, safe_int($q['item_id'] ?? 0))],
        'cx_notes' => cx_notes($pdo, $q),
        'cx_used' => cx_used($pdo, $q),
        default => cxn_api_get($pdo, $action, $q) ?? throw new LcndaBadInput('Action inconnue.'), // 🧩 les besoins (lib/connexions_besoins.php)
    };
}

function cx_api_post(PDO $pdo, array $d): array
{
    cx_schema($pdo);
    $op = (string) ($d['op'] ?? '');
    return match ($op) {
        'basket_add' => cx_basket_add($pdo, $d),
        'basket_remove' => cx_basket_remove($pdo, $d),
        'basket_clear' => cx_basket_remove($pdo, $d, true),
        'basket_restore' => cx_basket_restore($pdo, $d),
        'basket_new' => (static function () use ($pdo, $d) { cx_schema($pdo); $pdo->prepare('INSERT INTO cx_baskets(name, icon, color, note, folder_id, dests_json) VALUES(?,?,?,?,?,?)')->execute([cx_str($d['name'] ?? '', 120) ?: 'Panier', cx_str($d['icon'] ?? '', 16), cx_color($d['color'] ?? ''), cx_str($d['note'] ?? '', 300), cx_folder_ok($pdo, safe_int($d['folder_id'] ?? 0)), cx_dests_json($d['dests'] ?? null)]); return ['id' => (int) $pdo->lastInsertId(), 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo)]; })(),
        // ✎ nom, emoji, couleur, une ligne ; → l'avant (pour ↶)
        'basket_edit' => (static function () use ($pdo, $d) { cx_schema($pdo); $id = cx_basket_id($pdo, $d['basket_id'] ?? 0); $s = $pdo->prepare('SELECT name, icon, color, note, folder_id, dests_json FROM cx_baskets WHERE id=?'); $s->execute([$id]); $before = $s->fetch(PDO::FETCH_ASSOC);
            $before['dests'] = json_decode((string) $before['dests_json'], true) ?: []; unset($before['dests_json']);
            $parent = array_key_exists('folder_id', $d) ? cx_folder_ok($pdo, safe_int($d['folder_id'])) : (int) $before['folder_id'];
            $dests = array_key_exists('dests', $d) ? cx_dests_json($d['dests']) : json_encode($before['dests'] ?: null);
            $pdo->prepare('UPDATE cx_baskets SET name=?, icon=?, color=?, note=?, folder_id=?, dests_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([cx_str($d['name'] ?? '', 120) ?: 'Panier', cx_str($d['icon'] ?? '', 16), cx_color($d['color'] ?? ''), cx_str($d['note'] ?? '', 300), $parent, $dests === 'null' ? '' : $dests, $id]);
            return ['basket_id' => $id, 'before' => $before, 'baskets' => cx_baskets($pdo), 'emptied' => cx_folders_emptied($pdo, cx_folder_up($pdo, (int) $before['folder_id']))]; })(),
        // ⧉ dupliquer : un nouveau panier avec les mêmes éléments
        'basket_duplicate' => (static function () use ($pdo, $d) { cx_schema($pdo); $id = cx_basket_id($pdo, $d['basket_id'] ?? 0); $s = $pdo->prepare('SELECT * FROM cx_baskets WHERE id=?'); $s->execute([$id]); $b = $s->fetch(PDO::FETCH_ASSOC);
            $pdo->prepare('INSERT INTO cx_baskets(name, icon, color, note, folder_id, dests_json) VALUES(?,?,?,?,?,?)')->execute([cx_str($d['name'] ?? '', 120) ?: ($b['name'] . ' (copie)'), $b['icon'] ?? '', $b['color'] ?? '', $b['note'] ?? '', (int) ($b['folder_id'] ?? 0), (string) ($b['dests_json'] ?? '')]); $nid = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT INTO cx_basket_items(basket_id, kind, ref_id, title, value, data_json, origin_json, position, done, note) SELECT ?, kind, ref_id, title, value, data_json, origin_json, position, done, note FROM cx_basket_items WHERE basket_id=?')->execute([$nid, $id]);
            return ['id' => $nid, 'baskets' => cx_baskets($pdo)]; })(),
        // ✓ utilisé / une note sur un élément → l'avant (pour ↶)
        'item_set' => (static function () use ($pdo, $d) { cx_schema($pdo); $id = safe_int($d['id'] ?? 0); $s = $pdo->prepare('SELECT id, basket_id, done, note FROM cx_basket_items WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
            if (!$r) { throw new LcndaBadInput('Élément introuvable.'); }
            if (array_key_exists('done', $d)) { $pdo->prepare('UPDATE cx_basket_items SET done=? WHERE id=?')->execute([$d['done'] ? 1 : 0, $id]); }
            if (array_key_exists('note', $d)) { $pdo->prepare('UPDATE cx_basket_items SET note=? WHERE id=?')->execute([cx_str($d['note'], 2000), $id]); }
            $pdo->prepare('UPDATE cx_baskets SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $r['basket_id']]);
            return ['before' => ['id' => $id, 'done' => (int) $r['done'], 'note' => (string) $r['note']]]; })(),
        // ⇅ l'ordre (glisser) : les numéros dans l'ordre voulu → l'ordre d'avant (pour ↶)
        'item_order' => (static function () use ($pdo, $d) { cx_schema($pdo); $bid = cx_basket_id($pdo, $d['basket_id'] ?? 0); $s = $pdo->prepare('SELECT id FROM cx_basket_items WHERE basket_id=? ORDER BY position, id'); $s->execute([$bid]); $before = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
            $ids = array_values(array_intersect(array_map('intval', is_array($d['ids'] ?? null) ? $d['ids'] : []), $before)); $ids = [...$ids, ...array_diff($before, $ids)];
            $u = $pdo->prepare('UPDATE cx_basket_items SET position=? WHERE id=? AND basket_id=?'); foreach ($ids as $i => $id) { $u->execute([$i + 1, $id, $bid]); }
            return ['before' => $before]; })(),
        'basket_rename' => (static function () use ($pdo, $d) { $pdo->prepare('UPDATE cx_baskets SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([cx_str($d['name'] ?? '', 120) ?: 'Panier', safe_int($d['basket_id'] ?? 0)]); return ['baskets' => cx_baskets($pdo)]; })(),
        // 📁 un panier dans un dossier (0 : tout en haut) → l'avant (pour ↶) et les dossiers devenus vides (à proposer de supprimer)
        'basket_move' => (static function () use ($pdo, $d) { cx_schema($pdo); $id = safe_int($d['basket_id'] ?? 0); $s = $pdo->prepare('SELECT folder_id FROM cx_baskets WHERE id=?'); $s->execute([$id]); $before = $s->fetchColumn();
            if ($before === false) { throw new LcndaBadInput('Panier introuvable.'); }
            $pdo->prepare('UPDATE cx_baskets SET folder_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([cx_folder_ok($pdo, safe_int($d['folder_id'] ?? 0)), $id]);
            return ['before' => ['basket_id' => $id, 'folder_id' => (int) $before], 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo), 'emptied' => cx_folders_emptied($pdo, cx_folder_up($pdo, (int) $before))]; })(),
        // 📁 un nouveau dossier, avec son premier panier « Nouveau panier » (un dossier n'est jamais sans panier)
        'folder_new' => (static function () use ($pdo, $d) { cx_schema($pdo);
            $pdo->prepare('INSERT INTO cx_folders(name, icon, color, parent_id) VALUES(?,?,?,?)')->execute([cx_str($d['name'] ?? '', 120) ?: 'Dossier', cx_str($d['icon'] ?? '', 16), cx_color($d['color'] ?? ''), cx_folder_ok($pdo, safe_int($d['parent_id'] ?? 0))]); $fid = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT INTO cx_baskets(name, folder_id) VALUES(?,?)')->execute([cx_str($d['basket_name'] ?? '', 120) ?: 'Nouveau panier', $fid]);
            return ['id' => $fid, 'basket_id' => (int) $pdo->lastInsertId(), 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo)]; })(),
        'folder_edit' => (static function () use ($pdo, $d) { cx_schema($pdo); $id = safe_int($d['folder_id'] ?? 0); $s = $pdo->prepare('SELECT name, icon, color FROM cx_folders WHERE id=?'); $s->execute([$id]); $before = $s->fetch(PDO::FETCH_ASSOC);
            if (!$before) { throw new LcndaBadInput('Dossier introuvable.'); }
            $pdo->prepare('UPDATE cx_folders SET name=?, icon=?, color=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([cx_str($d['name'] ?? '', 120) ?: 'Dossier', cx_str($d['icon'] ?? '', 16), cx_color($d['color'] ?? ''), $id]);
            return ['before' => ['folder_id' => $id] + $before, 'folders' => cx_folders($pdo)]; })(),
        // 📁 un dossier dans un autre (0 : tout en haut) ; jamais de boucle
        'folder_move' => (static function () use ($pdo, $d) { cx_schema($pdo); $id = safe_int($d['folder_id'] ?? 0); $s = $pdo->prepare('SELECT parent_id FROM cx_folders WHERE id=?'); $s->execute([$id]); $before = $s->fetchColumn();
            if ($before === false) { throw new LcndaBadInput('Dossier introuvable.'); }
            $pdo->prepare('UPDATE cx_folders SET parent_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([cx_folder_ok($pdo, safe_int($d['parent_id'] ?? 0), $id), $id]);
            return ['before' => ['folder_id' => $id, 'parent_id' => (int) $before], 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo), 'emptied' => cx_folders_emptied($pdo, cx_folder_up($pdo, (int) $before))]; })(),
        // 🗑 un dossier : mode 'up' (ses paniers et sous-dossiers remontent d'un niveau) ou 'all' (tout ce qu'il contient est supprimé) → tout pour ↶
        'folder_delete' => (static function () use ($pdo, $d) { cx_schema($pdo); $id = safe_int($d['folder_id'] ?? 0);
            $s = $pdo->prepare('SELECT * FROM cx_folders WHERE id=?'); $s->execute([$id]); $f = $s->fetch(PDO::FETCH_ASSOC); if (!$f) { throw new LcndaBadInput('Dossier introuvable.'); }
            $all = ($d['mode'] ?? '') === 'all'; $fids = $all ? cx_folder_tree_ids($pdo, $id) : [$id]; $in = implode(',', $fids);
            $folders = $pdo->query("SELECT * FROM cx_folders WHERE id IN ($in)")->fetchAll(PDO::FETCH_ASSOC);
            $bks = $all ? $pdo->query("SELECT * FROM cx_baskets WHERE folder_id IN ($in)")->fetchAll(PDO::FETCH_ASSOC) : [];
            if ($bks && (int) $pdo->query('SELECT count(*) FROM cx_baskets')->fetchColumn() - count($bks) < 1) { throw new LcndaBadInput('Il reste au moins un panier.'); }
            $rows = $bks ? $pdo->query('SELECT * FROM cx_basket_items WHERE basket_id IN (' . implode(',', array_map(static fn($b) => (int) $b['id'], $bks)) . ')')->fetchAll(PDO::FETCH_ASSOC) : [];
            $upB = $all ? [] : array_map('intval', $pdo->query("SELECT id FROM cx_baskets WHERE folder_id=$id")->fetchAll(PDO::FETCH_COLUMN));
            $upF = $all ? [] : array_map('intval', $pdo->query("SELECT id FROM cx_folders WHERE parent_id=$id")->fetchAll(PDO::FETCH_COLUMN));
            if ($upB) { $pdo->exec('UPDATE cx_baskets SET folder_id=' . (int) $f['parent_id'] . ' WHERE id IN (' . implode(',', $upB) . ')'); }
            if ($upF) { $pdo->exec('UPDATE cx_folders SET parent_id=' . (int) $f['parent_id'] . ' WHERE id IN (' . implode(',', $upF) . ')'); }
            if ($bks) { $bin = implode(',', array_map(static fn($b) => (int) $b['id'], $bks)); $pdo->exec("DELETE FROM cx_basket_items WHERE basket_id IN ($bin)"); $pdo->exec("DELETE FROM cx_baskets WHERE id IN ($bin)"); }
            $pdo->exec("DELETE FROM cx_folders WHERE id IN ($in)");
            return ['folder' => $f, 'folders_removed' => $folders, 'baskets_removed' => $bks, 'rows' => $rows, 'up_baskets' => $upB, 'up_folders' => $upF, 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo)]; })(),
        'folder_undelete' => (static function () use ($pdo, $d) { cx_schema($pdo);
            $fi = $pdo->prepare('INSERT OR IGNORE INTO cx_folders(id, name, icon, color, parent_id) VALUES(?,?,?,?,?)');
            foreach (array_slice(is_array($d['folders_removed'] ?? null) ? $d['folders_removed'] : [], 0, 500) as $x) { if (is_array($x)) { $fi->execute([safe_int($x['id'] ?? 0) ?: null, cx_str($x['name'] ?? '', 120) ?: 'Dossier', cx_str($x['icon'] ?? '', 16), cx_color($x['color'] ?? ''), safe_int($x['parent_id'] ?? 0)]); } }
            $bi = $pdo->prepare('INSERT OR IGNORE INTO cx_baskets(id, name, icon, color, note, folder_id, dests_json) VALUES(?,?,?,?,?,?,?)');
            foreach (array_slice(is_array($d['baskets_removed'] ?? null) ? $d['baskets_removed'] : [], 0, 500) as $x) { if (is_array($x)) { $bi->execute([safe_int($x['id'] ?? 0) ?: null, cx_str($x['name'] ?? '', 120) ?: 'Panier', cx_str($x['icon'] ?? '', 16), cx_color($x['color'] ?? ''), cx_str($x['note'] ?? '', 300), safe_int($x['folder_id'] ?? 0), cx_dests_json(json_decode((string) ($x['dests_json'] ?? ''), true))]); } }
            $fid = safe_int($d['folder']['id'] ?? 0);
            $ub = array_values(array_filter(array_map('intval', is_array($d['up_baskets'] ?? null) ? $d['up_baskets'] : []))); if ($ub && $fid) { $pdo->exec("UPDATE cx_baskets SET folder_id=$fid WHERE id IN (" . implode(',', $ub) . ')'); }
            $uf = array_values(array_filter(array_map('intval', is_array($d['up_folders'] ?? null) ? $d['up_folders'] : []))); if ($uf && $fid) { $pdo->exec("UPDATE cx_folders SET parent_id=$fid WHERE id IN (" . implode(',', $uf) . ')'); }
            return cx_basket_restore($pdo, ['rows' => $d['rows'] ?? []]) + ['baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo)]; })(),
        // des éléments vers un autre panier → l'avant (pour ↶)
        'item_move' => (static function () use ($pdo, $d) { cx_schema($pdo); $to = cx_basket_id($pdo, $d['basket_id'] ?? 0);
            $ids = array_values(array_filter(array_map('intval', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 1000)))); if (!$ids) { return ['before' => []]; }
            $s = $pdo->prepare('SELECT id, basket_id FROM cx_basket_items WHERE id IN (' . implode(',', $ids) . ')'); $s->execute(); $before = $s->fetchAll(PDO::FETCH_ASSOC);
            $pos = (int) $pdo->query('SELECT COALESCE(max(position),0) FROM cx_basket_items WHERE basket_id=' . $to)->fetchColumn();
            $u = $pdo->prepare('UPDATE cx_basket_items SET basket_id=?, position=? WHERE id=?'); foreach ($ids as $id) { $u->execute([$to, ++$pos, $id]); }
            if (!empty($d['restore'])) { $u2 = $pdo->prepare('UPDATE cx_basket_items SET basket_id=? WHERE id=?'); foreach (is_array($d['restore']) ? $d['restore'] : [] as $r) { if (is_array($r)) { $u2->execute([safe_int($r['basket_id'] ?? 0), safe_int($r['id'] ?? 0)]); } } }
            $pdo->prepare('UPDATE cx_baskets SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$to]);
            return ['before' => array_map(static fn($r) => ['id' => (int) $r['id'], 'basket_id' => (int) $r['basket_id']], $before), 'baskets' => cx_baskets($pdo)]; })(),
        'item_unmove' => (static function () use ($pdo, $d) { cx_schema($pdo); $u = $pdo->prepare('UPDATE cx_basket_items SET basket_id=? WHERE id=?'); foreach (array_slice(is_array($d['before'] ?? null) ? $d['before'] : [], 0, 1000) as $r) { if (is_array($r)) { $u->execute([safe_int($r['basket_id'] ?? 0), safe_int($r['id'] ?? 0)]); } } return ['baskets' => cx_baskets($pdo)]; })(),
        // 🗑 supprimer un panier → tout pour ↶ ; les dossiers devenus sans panier (à proposer de supprimer)
        'basket_delete' => (static function () use ($pdo, $d) {
            cx_schema($pdo);
            $id = safe_int($d['basket_id'] ?? 0);
            $s = $pdo->prepare('SELECT * FROM cx_baskets WHERE id=?'); $s->execute([$id]); $b = $s->fetch(PDO::FETCH_ASSOC);
            if (!$b) { throw new LcndaBadInput('Panier introuvable.'); }
            if ((int) $pdo->query('SELECT count(*) FROM cx_baskets')->fetchColumn() < 2) { throw new LcndaBadInput('Il reste au moins un panier.'); }
            $s = $pdo->prepare('SELECT * FROM cx_basket_items WHERE basket_id=?'); $s->execute([$id]); $rows = $s->fetchAll(PDO::FETCH_ASSOC);
            $pdo->prepare('DELETE FROM cx_basket_items WHERE basket_id=?')->execute([$id]); $pdo->prepare('DELETE FROM cx_baskets WHERE id=?')->execute([$id]);
            return ['basket' => $b, 'rows' => $rows, 'baskets' => cx_baskets($pdo), 'emptied' => cx_folders_emptied($pdo, cx_folder_up($pdo, (int) ($b['folder_id'] ?? 0)))];
        })(),
        'basket_undelete' => (static function () use ($pdo, $d) {
            $b = is_array($d['basket'] ?? null) ? $d['basket'] : [];
            cx_schema($pdo); $pdo->prepare('INSERT OR IGNORE INTO cx_baskets(id, name, icon, color, note, folder_id, dests_json) VALUES(?,?,?,?,?,?,?)')->execute([safe_int($b['id'] ?? 0) ?: null, cx_str($b['name'] ?? '', 120) ?: 'Panier', cx_str($b['icon'] ?? '', 16), cx_color($b['color'] ?? ''), cx_str($b['note'] ?? '', 300), safe_int($b['folder_id'] ?? 0), cx_dests_json(json_decode((string) ($b['dests_json'] ?? ''), true))]);
            return cx_basket_restore($pdo, ['rows' => $d['rows'] ?? []]) + ['baskets' => cx_baskets($pdo)];
        })(),
        'inv_receive' => cx_inv_receive($pdo, $d),
        'inv_receive_undo' => cx_inv_receive_undo($pdo, $d),
        'item_link_remove' => cx_item_link_remove($pdo, $d),
        'item_link_restore' => cx_item_link_restore($pdo, $d),
        'link_add' => cx_link_add($pdo, $d),
        'link_remove' => cx_link_remove($pdo, $d),
        'reminder_add' => cx_reminder_add($pdo, $d),
        'to_mylist' => cx_to_mylist($pdo, $d),
        'fetch_url' => cx_fetch_url($d),
        default => cxn_api_post($pdo, $op, $d) ?? throw new LcndaBadInput('Opération inconnue.'), // 🧩 les besoins, 🗺 la carte (lib/connexions_besoins.php)
    };
}
