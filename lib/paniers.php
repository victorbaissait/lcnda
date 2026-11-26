<?php
declare(strict_types=1);

/*
 * 🧺 L'onglet « Paniers » (maquette validée docs/design/onglet-paniers.html ; interface assets/js/app-paniers.js et app-paniers-core.js).
 * Même modèle que le panier de « Prendre depuis… » (lib/connexions.php : cx_folders, cx_baskets, cx_basket_items) ; colonnes ajoutées par
 * cx_schema (rejouable) : cx_baskets.query_json (la recherche qui l'a créé), sort_json (« ↕ Ranger », retenu par panier), labels_json
 * (étiquettes de couleur), cover, pinned (★), archived (🗄), due + remind + reminder_id (⏰, dans les Rappels), live_json (🔄 panier vivant),
 * view (☰ Liste · 🗺 Carte · ⏳ Frise) ; cx_basket_items.status (à chercher · à demander · trouvé · vérifié · utilisé · à revoir) ;
 * cx_basket_log (l'historique, avec de quoi faire ↶) ; cx_shares (un panier envoyé à un compte du site familial).
 *
 * POST cx_write {op: pn_meta | pn_status | pn_log | pn_undo | pn_create | pn_dup | pn_to_investigation
 *      | pn_share_build | pn_share_preview | pn_share_import | pn_share_accounts | pn_share_send}
 * Écrire passe par api.php (jeton CSRF, refusé en mode consultation : kiosk_guard).
 * Partager : seulement les données publiques par défaut ; ce qui vient de l'arbre, une case à la fois ; jamais une personne vivante,
 * peut-être vivante ou confidentielle ; jamais les notes, ni les numéros de la base. Récupérer : fichier de 2 Mo au plus, schéma vérifié,
 * aucun HTML ni script (tout est texte), liens http(s) seulement, doublons sautés.
 */

const PN_SHARE_MAX = 2000000;
const PN_SHARE_ITEMS = 2000;
const PN_PUBLIC_KINDS = ['row', 'set', 'data'];
const PN_DATA_KEYS = ['columns', 'row', 'rows', 'source', 'url', 'list', 'icon', 'licence', 'criteria', 'taken', 'y', 'place', 'lat', 'lon', 'km', 'cat'];
const PN_UNDO_OPS = ['basket_restore', 'basket_remove', 'item_set', 'item_order', 'item_unmove', 'pn_meta', 'basket_edit', 'basket_undelete', 'basket_delete', 'basket_move', 'pn_status_set'];

function pn_basket(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM cx_baskets WHERE id=?'); $s->execute([$id]); $b = $s->fetch(PDO::FETCH_ASSOC);
    if (!$b) { throw new LcndaBadInput('Panier introuvable.'); }
    return $b;
}

function pn_log(PDO $pdo, int $basket, string $label, ?array $undo = null): int
{
    if (!$basket || $label === '') { return 0; }
    $u = '';
    if ($undo && in_array((string) ($undo['op'] ?? ''), PN_UNDO_OPS, true)) { $u = (string) json_encode($undo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); if (strlen($u) > 400000) { $u = ''; } }
    $pdo->prepare('INSERT INTO cx_basket_log(basket_id, label, undo_json) VALUES(?,?,?)')->execute([$basket, mb_substr($label, 0, 300), $u]);
    $id = (int) $pdo->lastInsertId();
    $pdo->prepare('DELETE FROM cx_basket_log WHERE basket_id=? AND id NOT IN (SELECT id FROM cx_basket_log WHERE basket_id=? ORDER BY id DESC LIMIT 60)')->execute([$basket, $basket]);
    return $id;
}

/** une étiquette : [nom, #couleur] */
function pn_labels(mixed $v): string
{
    if (!is_array($v)) { return ''; }
    $out = [];
    foreach (array_slice($v, 0, 12) as $x) { if (!is_array($x)) { continue; } $n = cx_str($x[0] ?? $x['name'] ?? '', 40); $c = cx_color($x[1] ?? $x['color'] ?? ''); if ($n !== '') { $out[] = [$n, $c ?: '#777777']; } }
    return $out ? (string) json_encode($out, JSON_UNESCAPED_UNICODE) : '';
}

/** une couverture : un dégradé tout prêt (g1…g8), un emoji, ou une image (data:image/png|jpeg|webp en base64, 300 Ko au plus) */
function pn_cover(mixed $v): string
{
    $c = is_string($v) ? trim($v) : '';
    if ($c === '' || preg_match('/^g[1-8]$/', $c)) { return $c; }
    if (preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $c) && strlen($c) <= 300000) { return $c; }
    if (preg_match('#^media:\d{1,9}$#', $c)) { return $c; }
    throw new LcndaBadInput('Couverture refusée (une image PNG, JPEG ou WebP de 300 Ko au plus).');
}

function pn_small_json(mixed $v, int $max = 20000): string
{
    if ($v === null || $v === '' || $v === []) { return ''; }
    if (!is_array($v)) { return ''; }
    $j = (string) json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($j) > $max) { throw new LcndaBadInput('Trop de réglages pour ce panier.'); }
    return $j;
}

/** ⏰ l'échéance d'un panier → un rappel dans ⏰ Rappels (la veille), mis à jour ou retiré avec elle */
function pn_reminder(PDO $pdo, array $b, string $due, bool $remind): int
{
    $rid = (int) ($b['reminder_id'] ?? 0);
    $has = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='standalone_reminders'")->fetchColumn();
    if (!$has) { return 0; }
    if ($due === '' || !$remind) { if ($rid) { $pdo->prepare('DELETE FROM standalone_reminders WHERE id=?')->execute([$rid]); } return 0; }
    $at = date('Y-m-d', strtotime($due . ' -1 day') ?: time());
    $title = mb_substr('🧺 Panier « ' . $b['name'] . ' » : pour le ' . $due, 0, 300);
    if ($rid) { $s = $pdo->prepare('SELECT id FROM standalone_reminders WHERE id=?'); $s->execute([$rid]); if (!$s->fetchColumn()) { $rid = 0; } }
    if ($rid) { $pdo->prepare("UPDATE standalone_reminders SET title=?, reminder_mode='on', reminder_due_at=? WHERE id=?")->execute([$title, $at, $rid]); return $rid; }
    $pdo->prepare("INSERT INTO standalone_reminders(title, notes, reminder_mode, reminder_due_at) VALUES(?,?,'on',?)")->execute([$title, 'Onglet Paniers', $at]);
    return (int) $pdo->lastInsertId();
}

/** ✎ les réglages d'un panier (recherche, rangement, étiquettes, couverture, ★, 🗄, ⏰, vivant, vue) → l'avant (pour ↶) */
function pn_meta(PDO $pdo, array $d): array
{
    $id = safe_int($d['basket_id'] ?? 0); $b = pn_basket($pdo, $id);
    $cols = ['query_json', 'sort_json', 'labels_json', 'cover', 'pinned', 'archived', 'due', 'remind', 'live_json', 'view'];
    $before = ['basket_id' => $id];
    $set = [];
    foreach (['query' => 'query_json', 'sort' => 'sort_json', 'labels' => 'labels_json', 'cover' => 'cover', 'pinned' => 'pinned', 'archived' => 'archived', 'due' => 'due', 'remind' => 'remind', 'live' => 'live_json', 'view' => 'view'] as $k => $c) {
        if (!array_key_exists($k, $d)) { continue; }
        $v = $d[$k];
        $set[$c] = match ($k) {
            'query', 'live' => pn_small_json($v, $k === 'live' ? 200000 : 20000),
            'sort' => pn_small_json(is_array($v) ? array_intersect_key($v, array_flip(['k', 'then', 'dir', 'closed'])) : null),
            'labels' => pn_labels($v),
            'cover' => pn_cover($v),
            'pinned', 'archived', 'remind' => $v ? 1 : 0,
            'due' => (static function () use ($v) { $x = cx_str($v, 10); if ($x !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $x)) { throw new LcndaBadInput('Date d’échéance incorrecte.'); } return $x; })(),
            'view' => in_array($v, ['liste', 'carte', 'frise'], true) ? (string) $v : '',
        };
        $before[$k] = in_array($c, ['query_json', 'sort_json', 'live_json'], true) ? (json_decode((string) $b[$c], true) ?: null) : ($c === 'labels_json' ? (json_decode((string) $b[$c], true) ?: []) : $b[$c]);
    }
    if (!$set) { return ['before' => $before, 'baskets' => cx_baskets($pdo)]; }
    if (array_key_exists('due', $set) || array_key_exists('remind', $set)) {
        $set['reminder_id'] = pn_reminder($pdo, $b, $set['due'] ?? (string) $b['due'], (bool) ($set['remind'] ?? $b['remind']));
    }
    $sql = implode(', ', array_map(static fn($c) => "$c=?", array_keys($set)));
    $pdo->prepare("UPDATE cx_baskets SET $sql WHERE id=?")->execute([...array_values($set), $id]);
    $label = cx_str($d['log'] ?? '', 200);
    if ($label !== '') { pn_log($pdo, $id, $label, ['op' => 'pn_meta', 'body' => $before]); }
    return ['before' => $before, 'baskets' => cx_baskets($pdo)];
}

/** ↶ refaire l'inverse d'une ligne de l'historique (seulement des opérations du panier : jamais n'importe quoi) */
function pn_undo(PDO $pdo, array $d): array
{
    $s = $pdo->prepare('SELECT * FROM cx_basket_log WHERE id=?'); $s->execute([safe_int($d['log_id'] ?? 0)]); $l = $s->fetch(PDO::FETCH_ASSOC);
    if (!$l || $l['undo_json'] === '') { throw new LcndaBadInput('Rien à défaire pour cette ligne.'); }
    $u = json_decode((string) $l['undo_json'], true);
    $op = (string) ($u['op'] ?? '');
    if (!in_array($op, PN_UNDO_OPS, true)) { throw new LcndaBadInput('Rien à défaire pour cette ligne.'); }
    $body = is_array($u['body'] ?? null) ? $u['body'] : [];
    unset($body['log']);
    $r = cx_api_post($pdo, ['op' => $op] + $body);
    $pdo->prepare('DELETE FROM cx_basket_log WHERE id=?')->execute([(int) $l['id']]);
    pn_log($pdo, (int) $l['basket_id'], '↶ ' . mb_substr((string) $l['label'], 0, 200));
    return ['undone' => (int) $l['id'], 'result' => $r, 'baskets' => cx_baskets($pdo)];
}

/** ⧉ dupliquer : tout le panier, ou seulement les éléments cochés (ids) */
function pn_dup(PDO $pdo, array $d): array
{
    $id = safe_int($d['basket_id'] ?? 0); $b = pn_basket($pdo, $id);
    $ids = array_values(array_filter(array_map('intval', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 5000))));
    $folder = array_key_exists('folder_id', $d) ? cx_folder_ok($pdo, safe_int($d['folder_id'])) : (int) $b['folder_id'];
    $name = cx_str($d['name'] ?? '', 120) ?: ($b['name'] . ' (copie)');
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO cx_baskets(name, icon, color, note, folder_id, dests_json, query_json, sort_json, labels_json, cover, view) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$name, $b['icon'], $b['color'], $b['note'], $folder, $b['dests_json'], $b['query_json'], $b['sort_json'], $b['labels_json'], $b['cover'], $b['view']]);
        $nid = (int) $pdo->lastInsertId();
        $sql = 'INSERT INTO cx_basket_items(basket_id, kind, ref_id, title, value, data_json, origin_json, position, done, note, status) SELECT ?, kind, ref_id, title, value, data_json, origin_json, position, done, note, status FROM cx_basket_items WHERE basket_id=?';
        if ($ids) { $sql .= ' AND id IN (' . implode(',', $ids) . ')'; }
        $pdo->prepare($sql . ' ORDER BY position, id')->execute([$nid, $id]);
        $n = (int) $pdo->query('SELECT count(*) FROM cx_basket_items WHERE basket_id=' . $nid)->fetchColumn();
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    pn_log($pdo, $nid, $ids ? "Créé avec $n éléments cochés de « {$b['name']} »" : "Copie de « {$b['name']} »");
    pn_log($pdo, $id, $ids ? "$n éléments copiés dans « $name »" : "Copié dans « $name »");
    return ['id' => $nid, 'count' => $n, 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo)];
}

/** 🔍 un panier créé par une recherche : son nom, son dossier, sa recherche (gardée), ses éléments (✓) */
function pn_create(PDO $pdo, array $d): array
{
    $folder = cx_folder_ok($pdo, safe_int($d['folder_id'] ?? 0));
    $pdo->prepare('INSERT INTO cx_baskets(name, icon, folder_id, query_json, live_json) VALUES(?,?,?,?,?)')
        ->execute([cx_str($d['name'] ?? '', 120) ?: 'Panier', cx_str($d['icon'] ?? '', 16), $folder, pn_small_json($d['query'] ?? null), pn_small_json($d['live'] ?? null, 200000)]);
    $id = (int) $pdo->lastInsertId();
    $r = ['ids' => [], 'skipped' => 0];
    if (is_array($d['items'] ?? null) && $d['items']) { $r = cx_basket_add($pdo, ['basket_id' => $id, 'items' => $d['items']]); }
    $q = is_array($d['query'] ?? null) ? cx_str($d['query']['text'] ?? '', 200) : '';
    pn_log($pdo, $id, $q !== '' ? "Créé par la recherche « $q » (" . count($r['ids']) . ' éléments)' : 'Panier créé');
    return ['id' => $id, 'ids' => $r['ids'], 'skipped' => $r['skipped'], 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo)];
}

/** 🔎 créer une enquête à partir du panier : une piste par élément (les personnes deviennent des personnes liées) */
function pn_to_investigation(PDO $pdo, array $d): array
{
    $id = safe_int($d['basket_id'] ?? 0); $b = pn_basket($pdo, $id);
    $ids = array_values(array_filter(array_map('intval', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 500))));
    $s = $pdo->prepare('SELECT * FROM cx_basket_items WHERE basket_id=?' . ($ids ? ' AND id IN (' . implode(',', $ids) . ')' : '') . ' ORDER BY position, id LIMIT 500'); $s->execute([$id]);
    $rows = array_map('cx_row_out', $s->fetchAll(PDO::FETCH_ASSOC));
    if (!$rows) { throw new LcndaBadInput('Le panier est vide.'); }
    $pid = 0; foreach ($rows as $r) { if ($r['kind'] === 'person' && $r['ref_id']) { $pid = $r['ref_id']; break; } }
    if ($pid) { $c = $pdo->prepare('SELECT id FROM persons WHERE id=?'); $c->execute([$pid]); $pid = (int) $c->fetchColumn(); }
    if (!$pid) { $pid = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn(); }
    if (!$pid) { throw new LcndaBadInput('Il faut au moins une personne dans l’arbre pour créer une enquête.'); }
    $pdo->prepare("INSERT INTO investigations(person_id, title, question, status) VALUES(?,?,?,'open')")->execute([$pid, cx_str($d['title'] ?? '', 200) ?: $b['name'], 'Créée à partir du panier « ' . $b['name'] . ' »']);
    $inv = (int) $pdo->lastInsertId();
    $items = array_map(static fn($r) => ['kind' => $r['kind'], 'ref_id' => $r['ref_id'], 'title' => $r['title'], 'value' => $r['value'], 'data' => $r['data'], 'origin' => $r['origin']], $rows);
    $out = cx_inv_receive($pdo, ['investigation_id' => $inv, 'mode' => 'each', 'items' => $items]);
    pn_log($pdo, $id, 'Enquête créée : « ' . (cx_str($d['title'] ?? '', 200) ?: $b['name']) . ' »');
    return ['investigation_id' => $inv, 'pistes' => count($out['item_ids'])];
}

/* ═════════════ ⇪ partager / ⇩ récupérer (fichier .lcnda-panier) ═════════════ */

/** du texte, rien d'autre : pas de balise, pas de caractère de contrôle */
function pn_txt(mixed $v, int $max): string
{
    if (!is_scalar($v)) { return ''; }
    $t = (string) $v;
    $t = preg_replace('#<(script|style|iframe|object)\b[^>]*>.*?</\1\s*>#isu', '', $t) ?? '';
    $t = preg_replace('/<[^>]*>/u', '', $t) ?? '';
    $t = str_replace(['<', '>'], ['‹', '›'], $t);
    $t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $t) ?? '';
    if (preg_match('/^\s*(javascript|data|vbscript):/i', $t)) { $t = ''; }
    return mb_substr(trim($t), 0, $max);
}

function pn_url(mixed $v): string
{
    $u = is_string($v) ? trim($v) : '';
    return preg_match('#^https?://[^\s<>"]+$#i', $u) && strlen($u) <= 2000 ? $u : '';
}

/** les données d'un élément partagé : seulement les clés connues, du texte et des nombres */
function pn_clean_data(mixed $d): ?array
{
    if (!is_array($d)) { return null; }
    $out = [];
    foreach (PN_DATA_KEYS as $k) {
        if (!array_key_exists($k, $d)) { continue; }
        $v = $d[$k];
        if ($k === 'url') { $u = pn_url($v); if ($u !== '') { $out[$k] = $u; } continue; }
        if (in_array($k, ['y', 'lat', 'lon', 'km'], true)) { if (is_numeric($v)) { $out[$k] = (float) $v; } continue; }
        if ($k === 'columns' || $k === 'row') { if (is_array($v)) { $out[$k] = array_map(static fn($x) => pn_txt($x, 500), array_slice(array_values($v), 0, 60)); } continue; }
        if ($k === 'rows') { if (is_array($v)) { $out[$k] = array_map(static fn($r) => is_array($r) ? array_map(static fn($x) => pn_txt($x, 500), array_slice(array_values($r), 0, 60)) : [], array_slice(array_values($v), 0, 5000)); } continue; }
        $out[$k] = pn_txt($v, 400);
    }
    return $out ?: null;
}

/** d'où vient un élément : l'arbre (personnel) ou une liste, le monde, un calcul (public) */
function pn_is_personal(array $r): bool
{
    if (in_array($r['kind'], PN_PUBLIC_KINDS, true)) { return false; }
    $ok = (string) ($r['origin']['kind'] ?? '');
    if (in_array($r['kind'], ['datum', 'place', 'text'], true) && in_array($ok, ['list', 'world', 'data', 'calc', 'outside', 'web'], true)) { return false; }
    return true;
}

/** une personne vivante, peut-être vivante (née il y a moins de 100 ans, sans décès) ou confidentielle → jamais partagée */
function pn_person_blocked(PDO $pdo, int $pid): bool
{
    if (!$pid) { return false; }
    static $cache = [];
    if (isset($cache[$pid])) { return $cache[$pid]; }
    $s = $pdo->prepare('SELECT living_status, is_private FROM persons WHERE id=?'); $s->execute([$pid]); $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { return $cache[$pid] = false; }
    if ((int) $p['is_private'] === 1 || $p['living_status'] === 'living') { return $cache[$pid] = true; }
    if ($p['living_status'] === 'deceased') { return $cache[$pid] = false; }
    $e = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI')"); $e->execute([$pid]);
    $by = 0; $dead = false;
    foreach ($e->fetchAll(PDO::FETCH_ASSOC) as $x) { if (in_array($x['tag'], ['DEAT', 'BURI'], true)) { $dead = true; } elseif ((int) $x['year'] && !$by) { $by = (int) $x['year']; } }
    return $cache[$pid] = !$dead && (!$by || $by > (int) date('Y') - 100);
}

function pn_item_blocked(PDO $pdo, array $r): bool
{
    $pid = 0;
    if ($r['kind'] === 'person') { $pid = (int) $r['ref_id']; }
    elseif ($r['kind'] === 'event' && $r['ref_id']) {
        $s = $pdo->prepare('SELECT person_id' . (pn_has_col($pdo, 'events', 'is_private') ? ', is_private' : ', 0 AS is_private') . ' FROM events WHERE id=?'); $s->execute([(int) $r['ref_id']]); $e = $s->fetch(PDO::FETCH_ASSOC);
        if ($e && (int) $e['is_private'] === 1) { return true; }
        $pid = (int) ($e['person_id'] ?? 0);
    }
    $pid = $pid ?: (int) ($r['origin']['person_id'] ?? 0);
    return pn_person_blocked($pdo, $pid);
}

function pn_has_col(PDO $pdo, string $t, string $c): bool
{
    static $m = [];
    $k = "$t.$c";
    if (!isset($m[$k])) { $m[$k] = in_array($c, array_column($pdo->query("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_ASSOC), 'name'), true); }
    return $m[$k];
}

/** les éléments d'un panier, triés pour le partage : public · personnel (à cocher) · bloqué (vivant, confidentiel) */
function pn_share_rows(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM cx_basket_items WHERE basket_id=? ORDER BY position, id'); $s->execute([$id]);
    return array_map(static function ($r) use ($pdo) { $r = cx_row_out($r); $r['personal'] = pn_is_personal($r); $r['blocked'] = $r['personal'] && pn_item_blocked($pdo, $r); return $r; }, $s->fetchAll(PDO::FETCH_ASSOC));
}

/** ⇪ le fichier .lcnda-panier : le public, et seulement les éléments personnels cochés un à un (include), jamais les bloqués ni les notes */
function pn_share_build(PDO $pdo, array $d): array
{
    $id = safe_int($d['basket_id'] ?? 0); $b = pn_basket($pdo, $id);
    $inc = array_flip(array_map('intval', is_array($d['include'] ?? null) ? $d['include'] : []));
    $rows = pn_share_rows($pdo, $id);
    if (!empty($d['list'])) { return ['rows' => array_map(static fn($r) => ['id' => $r['id'], 'kind' => $r['kind'], 'title' => $r['title'], 'value' => mb_substr((string) $r['value'], 0, 200), 'personal' => $r['personal'], 'blocked' => $r['blocked'], 'source' => (string) ($r['origin']['label'] ?? '')], $rows)]; }
    $items = []; $n = ['public' => 0, 'personal' => 0, 'left' => 0, 'blocked' => 0];
    foreach ($rows as $r) {
        if ($r['blocked']) { $n['blocked']++; continue; }
        if ($r['personal'] && !isset($inc[$r['id']])) { $n['left']++; continue; }
        $n[$r['personal'] ? 'personal' : 'public']++;
        $o = is_array($r['origin']) ? $r['origin'] : [];
        $items[] = array_filter(['kind' => $r['personal'] ? 'datum' : $r['kind'], 'title' => pn_txt($r['title'], 500), 'value' => pn_txt($r['value'], 4000),
            'data' => pn_clean_data($r['data']), 'source' => pn_txt($o['label'] ?? '', 300), 'url' => pn_url($o['url'] ?? ''),
            'status' => in_array($r['status'] ?? '', PN_STATUSES, true) ? $r['status'] : ''], static fn($v) => $v !== '' && $v !== null);
    }
    $file = ['format' => 'lcnda-panier', 'version' => 1, 'name' => pn_txt($b['name'], 120), 'icon' => pn_txt($b['icon'], 16), 'made' => date('Y-m-d'), 'items' => $items];
    return ['share' => $file, 'counts' => $n, 'fname' => (preg_replace('/[^\p{L}\p{N}]+/u', '-', (string) $b['name']) ?: 'panier') . '.lcnda-panier'];
}

/** ⇩ lire un fichier .lcnda-panier : taille, schéma, tout en texte → {name, icon, items} (lève une erreur claire sinon) */
function pn_share_read(mixed $body): array
{
    $raw = is_string($body) ? $body : (is_array($body) ? (string) json_encode($body) : '');
    if ($raw === '' || strlen($raw) > PN_SHARE_MAX) { throw new LcndaBadInput('Fichier refusé : vide ou trop gros (2 Mo au plus).'); }
    $j = json_decode($raw, true, 32);
    if (!is_array($j) || ($j['format'] ?? '') !== 'lcnda-panier' || !is_int($j['version'] ?? null) || $j['version'] < 1 || $j['version'] > 1 || !is_array($j['items'] ?? null)) {
        throw new LcndaBadInput('Ce fichier n’est pas un panier LCNDA (.lcnda-panier).');
    }
    if (count($j['items']) > PN_SHARE_ITEMS) { throw new LcndaBadInput('Trop d’éléments dans ce panier (2 000 au plus).'); }
    $items = [];
    foreach ($j['items'] as $it) {
        if (!is_array($it)) { continue; }
        $kind = in_array($it['kind'] ?? '', ['row', 'set', 'data', 'datum', 'place', 'text'], true) ? (string) $it['kind'] : 'datum';
        $title = pn_txt($it['title'] ?? '', 500); $value = pn_txt($it['value'] ?? '', 4000);
        if ($title === '' && $value === '') { continue; }
        $url = pn_url($it['url'] ?? '');
        $items[] = ['kind' => $kind, 'ref_id' => 0, 'title' => $title, 'value' => $value, 'data' => pn_clean_data($it['data'] ?? null),
            'origin' => array_filter(['kind' => 'shared', 'label' => pn_txt($it['source'] ?? '', 300) ?: 'Panier partagé', 'url' => $url]),
            'status' => in_array($it['status'] ?? '', PN_STATUSES, true) ? (string) $it['status'] : ''];
    }
    return ['name' => pn_txt($j['name'] ?? '', 120) ?: 'Panier récupéré', 'icon' => pn_txt($j['icon'] ?? '', 16), 'made' => pn_txt($j['made'] ?? '', 10), 'items' => $items];
}

/** l'aperçu : chaque élément, et s'il est déjà dans le panier choisi (ou dans un autre) */
function pn_share_preview(PDO $pdo, array $d): array
{
    $f = pn_share_read($d['body'] ?? '');
    $have = [];
    foreach ($pdo->query('SELECT i.title, i.value, b.name FROM cx_basket_items i JOIN cx_baskets b ON b.id=i.basket_id')->fetchAll(PDO::FETCH_ASSOC) as $r) { $have[mb_strtolower($r['title'] . '|' . $r['value'])] = $r['name']; }
    foreach ($f['items'] as &$it) { $it['dup'] = $have[mb_strtolower($it['title'] . '|' . $it['value'])] ?? ''; }
    unset($it);
    return $f;
}

/** ⇩ récupérer : les éléments gardés (✓) dans un nouveau panier (dossier au choix) ou un panier existant ; doublons sautés */
function pn_share_import(PDO $pdo, array $d): array
{
    $f = pn_share_read($d['body'] ?? '');
    $keep = is_array($d['keep'] ?? null) ? array_flip(array_map('intval', $d['keep'])) : null;
    $items = array_values(array_filter($f['items'], static fn($it, $i) => $keep === null || isset($keep[$i]), ARRAY_FILTER_USE_BOTH));
    $bid = safe_int($d['basket_id'] ?? 0); $new = false;
    if ($bid) { pn_basket($pdo, $bid); }
    else {
        $pdo->prepare('INSERT INTO cx_baskets(name, icon, folder_id) VALUES(?,?,?)')->execute([cx_str($d['name'] ?? '', 120) ?: $f['name'], $f['icon'], cx_folder_ok($pdo, safe_int($d['folder_id'] ?? 0))]);
        $bid = (int) $pdo->lastInsertId(); $new = true;
    }
    // doublons : déjà dans ce panier (titre + valeur), même venus d'ailleurs
    $s = $pdo->prepare('SELECT lower(title) || \'|\' || lower(value) FROM cx_basket_items WHERE basket_id=?'); $s->execute([$bid]);
    $seen = array_flip($s->fetchAll(PDO::FETCH_COLUMN)); $add = []; $skipped = 0;
    foreach ($items as $it) { $k = mb_strtolower($it['title']) . '|' . mb_strtolower($it['value']); if (isset($seen[$k])) { $skipped++; continue; } $seen[$k] = 1; $add[] = $it; }
    $r = $add ? cx_basket_add($pdo, ['basket_id' => $bid, 'items' => $add]) : ['ids' => [], 'skipped' => 0];
    if ($r['ids']) { $u = $pdo->prepare('UPDATE cx_basket_items SET status=? WHERE id=?'); foreach ($r['ids'] as $i => $iid) { $st = (string) ($add[$i]['status'] ?? ''); if ($st !== '') { $u->execute([$st, $iid]); } } }
    pn_log($pdo, $bid, 'Récupéré depuis un fichier .lcnda-panier (' . count($r['ids']) . ' éléments, ' . ($skipped + $r['skipped']) . ' déjà dedans)', $new ? null : ['op' => 'basket_remove', 'body' => ['ids' => $r['ids']]]);
    return ['basket_id' => $bid, 'new' => $new, 'ids' => $r['ids'], 'skipped' => $skipped + $r['skipped'], 'baskets' => cx_baskets($pdo), 'folders' => cx_folders($pdo)];
}

/** les comptes du site familial (seulement s'il en existe) */
function pn_share_accounts(PDO $pdo): array
{
    $has = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fc_accounts'")->fetchColumn();
    if (!$has) { return ['accounts' => []]; }
    return ['accounts' => array_map(static fn($a) => ['id' => (int) $a['id'], 'name' => (string) $a['name']], $pdo->query('SELECT id, name FROM fc_accounts WHERE removed_ts=0 ORDER BY name COLLATE NOCASE LIMIT 200')->fetchAll(PDO::FETCH_ASSOC))];
}

/** ✉ envoyer à un compte du site familial : le même fichier (public, personnel coché, jamais les vivants), rangé pour ce compte */
function pn_share_send(PDO $pdo, array $d): array
{
    $acc = safe_int($d['account_id'] ?? 0);
    if (!in_array($acc, array_column(pn_share_accounts($pdo)['accounts'], 'id'), true)) { throw new LcndaBadInput('Compte du site familial introuvable.'); }
    $f = pn_share_build($pdo, $d);
    $pdo->prepare('INSERT INTO cx_shares(account_id, name, body) VALUES(?,?,?)')->execute([$acc, $f['share']['name'], (string) json_encode($f['share'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    pn_log($pdo, safe_int($d['basket_id'] ?? 0), 'Envoyé à un compte du site familial');
    return ['share_id' => (int) $pdo->lastInsertId(), 'counts' => $f['counts']];
}

function pn_api_post(PDO $pdo, string $op, array $d): array
{
    cx_schema($pdo);
    return match ($op) {
        'pn_meta' => pn_meta($pdo, $d),
        'pn_status' => (static function () use ($pdo, $d) { // un statut pour plusieurs éléments (cochés) → l'avant
            $sv = in_array($d['status'] ?? '', PN_STATUSES, true) ? (string) $d['status'] : 'trouve';
            $ids = array_values(array_filter(array_map('intval', array_slice(is_array($d['ids'] ?? null) ? $d['ids'] : [], 0, 5000)))); if (!$ids) { return ['before' => []]; }
            $rows = $pdo->query('SELECT id, basket_id, status, done FROM cx_basket_items WHERE id IN (' . implode(',', $ids) . ')')->fetchAll(PDO::FETCH_ASSOC);
            $pdo->exec("UPDATE cx_basket_items SET status=" . $pdo->quote($sv) . ', done=' . ($sv === 'utilise' ? 1 : 0) . ' WHERE id IN (' . implode(',', $ids) . ')');
            return ['before' => array_map(static fn($r) => ['id' => (int) $r['id'], 'status' => $r['status'] !== '' ? $r['status'] : ((int) $r['done'] ? 'utilise' : 'trouve')], $rows)]; })(),
        'pn_status_set' => (static function () use ($pdo, $d) { $u = $pdo->prepare('UPDATE cx_basket_items SET status=?, done=? WHERE id=?'); $n = 0;
            foreach (array_slice(is_array($d['rows'] ?? null) ? $d['rows'] : [], 0, 5000) as $r) { if (!is_array($r)) { continue; } $sv = in_array($r['status'] ?? '', PN_STATUSES, true) ? (string) $r['status'] : 'trouve'; $u->execute([$sv, $sv === 'utilise' ? 1 : 0, safe_int($r['id'] ?? 0)]); $n++; }
            return ['n' => $n]; })(),
        'pn_log' => ['id' => pn_log($pdo, safe_int($d['basket_id'] ?? 0), cx_str($d['label'] ?? '', 300), is_array($d['undo'] ?? null) ? $d['undo'] : null)],
        'pn_undo' => pn_undo($pdo, $d),
        'pn_create' => pn_create($pdo, $d),
        'pn_dup' => pn_dup($pdo, $d),
        'pn_to_investigation' => pn_to_investigation($pdo, $d),
        'pn_share_build' => pn_share_build($pdo, $d),
        'pn_share_preview' => pn_share_preview($pdo, $d),
        'pn_share_import' => pn_share_import($pdo, $d),
        'pn_share_accounts' => pn_share_accounts($pdo),
        'pn_share_send' => pn_share_send($pdo, $d),
        default => throw new LcndaBadInput('Opération inconnue.'),
    };
}
