<?php
declare(strict_types=1);
/**
 * 📒 Albums photo (onglet Documents → « 📚 Recueils | 📒 Albums photo ») — le côté serveur.
 * Écran : assets/js/heritage-albums.js (calculs : assets/js/app-albums-core.js). Essais : tests/test-albums.js.
 *
 * Un album, c'est comme un album de famille : des photos dans un ordre choisi, un titre, une couverture, des dates (« 1920–1935 »),
 * une description, et une mise en page (combien de photos par page, une légende sous chacune, « nouvelle page avant celle-ci »).
 * Une photo peut être dans plusieurs albums ; c'est un média ordinaire (rien n'est copié). Différent d'un 📚 recueil
 * (lib/recueils.php : les pages photographiées d'un registre, avec transcription et campagnes de photos).
 *
 * Tables (structure n°115, lib/migrations.php) :
 *  - photo_albums      : titre, description, dates (texte libre, ou calculées d'après les photos), couverture, photos par page, style de page,
 *                        confidentiel (jamais montré en mode consultation ni aux appareils invités)
 *  - photo_album_items : une photo de l'album (média), sa place, sa légende, « nouvelle page avant » ; UNIQUE(album_id, media_id)
 *
 *   GET  api.php?action=albums&op=list | get&id | index (les albums de chaque média) | media&media_id
 *   POST api.php?action=albums_write {op, …, csrf} : create · update · delete · add · remove · restore_items · reorder · item_save
 *
 * Règles : mode consultation et appareils invités → lecture seule ; un album confidentiel n'y est pas montré ; une photo qui montre
 * une personne vivante ou une fiche confidentielle n'y est pas montrée non plus (ni sa légende). Suppression d'un album : ↶ Annuler
 * (undo_keep, sorte photo_album).
 */

const ALBUM_STYLES = ['classique', 'noir', 'kraft'];
const ALBUM_PER_PAGE = [1, 2, 3, 4, 6];

function albums_install(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_albums (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
        date_text TEXT NOT NULL DEFAULT '', date_from INTEGER, date_to INTEGER, cover_media_id INTEGER, per_page INTEGER NOT NULL DEFAULT 4, style TEXT NOT NULL DEFAULT 'classique',
        is_private INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_album_items (id INTEGER PRIMARY KEY AUTOINCREMENT, album_id INTEGER NOT NULL REFERENCES photo_albums(id) ON DELETE CASCADE,
        media_id INTEGER NOT NULL, position REAL NOT NULL DEFAULT 0, caption TEXT NOT NULL DEFAULT '', page_break INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(album_id, media_id))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_pai_album ON photo_album_items(album_id, position)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_pai_media ON photo_album_items(media_id)');
}

function albums_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='photo_album_items'")->fetchColumn()) { albums_install($pdo); }
    $done = true;
}

/** mode consultation : lecture seule */
function albums_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }
/** mode consultation ou appareil invité : rien de confidentiel (albums confidentiels, photos de vivants) */
function albums_ro(): bool { return albums_kiosk() || (function_exists('lan_device') && (bool) lan_device()); }
function albums_text(mixed $v, int $max = 300, bool $multi = false): string
{
    $s = is_scalar($v) ? (string) $v : '';
    $s = $multi ? preg_replace('/[^\P{C}\n\t]/u', '', $s) : preg_replace('/\p{C}+/u', ' ', $s);
    return mb_substr(trim((string) $s), 0, $max);
}
function albums_year(mixed $v): ?int { $n = is_numeric($v) ? (int) $v : 0; return $n >= 1000 && $n <= 2200 ? $n : null; }
function albums_year_of(string $t): ?int { return preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $t, $m) ? (int) $m[1] : null; }

function albums_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM photo_albums WHERE id=?'); $s->execute([$id]); $a = $s->fetch(PDO::FETCH_ASSOC);
    if (!$a || (albums_ro() && (int) $a['is_private'] === 1)) { throw new RuntimeException(i18n_t('Album introuvable.')); }
    return $a;
}
function albums_touch(PDO $pdo, int $id): void { $pdo->prepare('UPDATE photo_albums SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]); }

/** media_id => true quand la photo montre (ou est reliée à) une personne vivante ou une fiche confidentielle */
function albums_private_media(PDO $pdo, array $mediaIds): array
{
    $mediaIds = array_values(array_unique(array_filter(array_map('intval', $mediaIds)))); if (!$mediaIds) { return []; }
    if (!function_exists('ep_media_private')) { require_once __DIR__ . '/enquete_photo.php'; }
    return ep_media_private($pdo, $mediaIds);
}

/** les photos d'un album, dans l'ordre (les médias supprimés sont laissés de côté) */
function albums_items(PDO $pdo, int $id): array
{
    $hasPlace = (bool) $pdo->query("SELECT 1 FROM pragma_table_info('media') WHERE name='place_id'")->fetchColumn();
    $s = $pdo->prepare('SELECT i.*, m.title, m.filename, m.thumbnail, m.media_type, m.date_text, m.description' . ($hasPlace ? ', (SELECT name FROM places WHERE id=m.place_id) AS place' : ", '' AS place") . '
        FROM photo_album_items i JOIN media m ON m.id=i.media_id WHERE i.album_id=? ORDER BY i.position, i.id');
    $s->execute([$id]);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}
function albums_item_out(array $r): array
{
    return ['id' => (int) $r['id'], 'media_id' => (int) $r['media_id'], 'position' => (float) $r['position'], 'caption' => (string) $r['caption'], 'page_break' => (int) $r['page_break'],
        'media' => ['id' => (int) $r['media_id'], 'title' => (string) $r['title'], 'filename' => (string) $r['filename'], 'thumbnail' => (string) ($r['thumbnail'] ?: $r['filename']),
            'media_type' => (string) $r['media_type'], 'date_text' => (string) $r['date_text'], 'year' => albums_year_of((string) $r['date_text']), 'place' => (string) ($r['place'] ?? '')]];
}
/** les dates de l'album : celles écrites, sinon la plus ancienne et la plus récente de ses photos */
function albums_range(array $a, array $items): array
{
    $from = $a['date_from'] !== null ? (int) $a['date_from'] : null; $to = $a['date_to'] !== null ? (int) $a['date_to'] : null;
    $ys = array_values(array_filter(array_map(static fn($i) => $i['media']['year'] ?? null, $items)));
    $auto = $ys ? [min($ys), max($ys)] : [null, null];
    $f = $from ?? $auto[0]; $t = $to ?? $auto[1];
    $text = trim((string) $a['date_text']);
    if ($text === '' && $f) { $text = $t && $t !== $f ? "{$f}–{$t}" : (string) $f; }
    return ['from' => $f, 'to' => $t, 'text' => $text, 'auto' => $from === null && $to === null && trim((string) $a['date_text']) === ''];
}
function albums_out(PDO $pdo, array $a, array $items, int $hidden = 0): array
{
    $cover = null; $cid = $a['cover_media_id'] !== null ? (int) $a['cover_media_id'] : 0;
    foreach ($items as $i) { if ($cid && $i['media_id'] === $cid && $i['media']['media_type'] === 'image') { $cover = $i['media']; break; } }
    if (!$cover) { foreach ($items as $i) { if ($i['media']['media_type'] === 'image' && $i['media']['filename'] !== '') { $cover = $i['media']; break; } } }
    return ['id' => (int) $a['id'], 'title' => (string) $a['title'], 'description' => (string) $a['description'], 'date_text' => (string) $a['date_text'],
        'date_from' => $a['date_from'] !== null ? (int) $a['date_from'] : null, 'date_to' => $a['date_to'] !== null ? (int) $a['date_to'] : null,
        'range' => albums_range($a, $items), 'cover_media_id' => $cid ?: null, 'cover' => $cover, 'per_page' => in_array((int) $a['per_page'], ALBUM_PER_PAGE, true) ? (int) $a['per_page'] : 4,
        'style' => in_array($a['style'], ALBUM_STYLES, true) ? $a['style'] : 'classique', 'is_private' => (int) $a['is_private'], 'n' => count($items), 'hidden' => $hidden,
        'created_at' => (string) $a['created_at'], 'updated_at' => (string) $a['updated_at']];
}
/** les photos montrables : en consultation (ou appareil invité), sans les photos de vivants ni de fiches confidentielles */
function albums_visible(PDO $pdo, array $rows): array
{
    $items = array_map('albums_item_out', $rows);
    if (!albums_ro()) { return [$items, 0]; }
    $priv = albums_private_media($pdo, array_column($rows, 'media_id'));
    $keep = array_values(array_filter($items, static fn($i) => empty($priv[$i['media_id']])));
    return [$keep, count($items) - count($keep)];
}

function albums_list(PDO $pdo): array
{
    $rows = $pdo->query('SELECT * FROM photo_albums ORDER BY title COLLATE NOCASE, id')->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $a) {
        if (albums_ro() && (int) $a['is_private'] === 1) { continue; }
        [$items, $hidden] = albums_visible($pdo, albums_items($pdo, (int) $a['id']));
        $out[] = albums_out($pdo, $a, $items, $hidden);
    }
    return ['albums' => $out, 'readonly' => albums_kiosk()];
}
function albums_get(PDO $pdo, int $id): array
{
    $a = albums_row($pdo, $id);
    [$items, $hidden] = albums_visible($pdo, albums_items($pdo, $id));
    return ['album' => albums_out($pdo, $a, $items, $hidden) + ['items' => $items], 'readonly' => albums_kiosk()];
}
/** pour la colonne de Documents : chaque album (titre) et, pour chaque média, ses albums avec sa place */
function albums_index(PDO $pdo): array
{
    $list = albums_list($pdo)['albums']; $ok = array_fill_keys(array_column($list, 'id'), true); $of = [];
    $priv = albums_ro() ? albums_private_media($pdo, $pdo->query('SELECT DISTINCT media_id FROM photo_album_items')->fetchAll(PDO::FETCH_COLUMN)) : [];
    $s = $pdo->query('SELECT album_id, media_id, position, id FROM photo_album_items ORDER BY album_id, position, id');
    $n = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $aid = (int) $r['album_id']; if (!isset($ok[$aid]) || !empty($priv[(int) $r['media_id']])) { continue; }
        $n[$aid] = ($n[$aid] ?? 0) + 1;
        $of[(int) $r['media_id']][] = [$aid, $n[$aid]];
    }
    return ['albums' => array_map(static fn($a) => ['id' => $a['id'], 'title' => $a['title'], 'n' => $a['n'], 'range' => $a['range']['text'], 'cover' => $a['cover']], $list), 'of' => (object) $of, 'readonly' => albums_kiosk()];
}
function albums_for_media(PDO $pdo, int $mediaId): array
{
    $s = $pdo->prepare('SELECT a.id, a.title, a.is_private FROM photo_album_items i JOIN photo_albums a ON a.id=i.album_id WHERE i.media_id=? ORDER BY a.title COLLATE NOCASE');
    $s->execute([$mediaId]);
    return ['albums' => array_values(array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => (string) $r['title']], array_filter($s->fetchAll(PDO::FETCH_ASSOC), static fn($r) => !(albums_ro() && (int) $r['is_private'] === 1))))];
}

/* ═════════ écrire ═════════ */

function albums_media_ids(PDO $pdo, mixed $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', is_array($ids) ? $ids : []))));
    if (count($ids) > 2000) { throw new LcndaBadInput(i18n_t('Trop de photos d’un coup (2000 au plus).')); }
    if (!$ids) { return []; }
    $in = implode(',', $ids); $have = array_map('intval', $pdo->query("SELECT id FROM media WHERE id IN ($in)")->fetchAll(PDO::FETCH_COLUMN));
    return array_values(array_filter($ids, static fn($i) => in_array($i, $have, true)));
}
/** ajoute les photos à la fin de l'album (celles déjà dedans restent où elles sont) → [item_id…] ajoutés */
function albums_add_media(PDO $pdo, int $id, array $mediaIds): array
{
    $max = (float) ($pdo->query('SELECT COALESCE(MAX(position),0) FROM photo_album_items WHERE album_id=' . $id)->fetchColumn());
    $ins = $pdo->prepare('INSERT OR IGNORE INTO photo_album_items(album_id, media_id, position) VALUES(?,?,?)'); $added = [];
    foreach ($mediaIds as $mid) { $ins->execute([$id, $mid, ++$max]); if ($ins->rowCount()) { $added[] = (int) $pdo->lastInsertId(); } }
    return $added;
}
function albums_fields(array $d, array $cur = []): array
{
    $f = [];
    if (array_key_exists('title', $d)) { $f['title'] = albums_text($d['title'], 160) ?: (string) ($cur['title'] ?? '') ?: i18n_t('Album photo'); }
    if (array_key_exists('description', $d)) { $f['description'] = albums_text($d['description'], 4000, true); }
    if (array_key_exists('date_text', $d)) { $f['date_text'] = albums_text($d['date_text'], 80); }
    if (array_key_exists('date_from', $d)) { $f['date_from'] = albums_year($d['date_from']); }
    if (array_key_exists('date_to', $d)) { $f['date_to'] = albums_year($d['date_to']); }
    if (isset($f['date_from'], $f['date_to']) && $f['date_from'] > $f['date_to']) { [$f['date_from'], $f['date_to']] = [$f['date_to'], $f['date_from']]; }
    if (array_key_exists('per_page', $d)) { $f['per_page'] = in_array((int) $d['per_page'], ALBUM_PER_PAGE, true) ? (int) $d['per_page'] : 4; }
    if (array_key_exists('style', $d)) { $f['style'] = in_array($d['style'], ALBUM_STYLES, true) ? (string) $d['style'] : 'classique'; }
    if (array_key_exists('is_private', $d)) { $f['is_private'] = empty($d['is_private']) ? 0 : 1; }
    if (array_key_exists('cover_media_id', $d)) { $f['cover_media_id'] = safe_int($d['cover_media_id']) ?: null; }
    return $f;
}
function albums_create(PDO $pdo, array $d): array
{
    $ids = albums_media_ids($pdo, $d['media_ids'] ?? []);
    $f = albums_fields($d + ['title' => '']);
    $cols = array_keys($f);
    $pdo->prepare('INSERT INTO photo_albums(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($f));
    $id = (int) $pdo->lastInsertId();
    albums_add_media($pdo, $id, $ids);
    log_change($pdo, 'photo_album', $id, 'create', 'Album photo créé : ' . $f['title']);
    return ['id' => $id] + albums_get($pdo, $id);
}
function albums_update(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $a = albums_row($pdo, $id); $f = albums_fields($d, $a);
    if (!$f) { return ['ok' => true]; }
    $before = array_intersect_key($a, $f);
    $pdo->prepare('UPDATE photo_albums SET ' . implode(',', array_map(static fn($c) => "$c=?", array_keys($f))) . ', updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...array_values($f), $id]);
    log_change($pdo, 'photo_album', $id, 'update', 'Album photo modifié : ' . ($f['title'] ?? $a['title']), $before, $f);
    return ['ok' => true, 'before' => $before];
}
function albums_delete(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); $a = albums_row($pdo, $id);
    undo_keep($pdo, 'photo_album', $id, 'Album photo supprimé : ' . $a['title'], [['photo_albums', 'id=?', [$id]], ['photo_album_items', 'album_id=?', [$id]]]);
    $pdo->prepare('DELETE FROM photo_album_items WHERE album_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM photo_albums WHERE id=?')->execute([$id]);
    return ['ok' => true, 'id' => $id];
}
function albums_add(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); albums_row($pdo, $id);
    $added = albums_add_media($pdo, $id, albums_media_ids($pdo, $d['media_ids'] ?? []));
    albums_touch($pdo, $id);
    return ['ok' => true, 'added' => $added, 'n' => count($added)];
}
/** retire des photos de l'album (les médias restent) ; renvoie les lignes pour « ↶ Annuler » (restore_items) */
function albums_remove(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); albums_row($pdo, $id);
    $ids = array_values(array_filter(array_map('intval', is_array($d['item_ids'] ?? null) ? $d['item_ids'] : [])));
    if (!$ids) { return ['ok' => true, 'rows' => []]; }
    $in = implode(',', $ids);
    $rows = $pdo->query("SELECT * FROM photo_album_items WHERE album_id=$id AND id IN ($in)")->fetchAll(PDO::FETCH_ASSOC);
    $pdo->exec("DELETE FROM photo_album_items WHERE album_id=$id AND id IN ($in)");
    albums_touch($pdo, $id);
    return ['ok' => true, 'rows' => $rows];
}
function albums_restore_items(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); albums_row($pdo, $id); $n = 0;
    $ins = $pdo->prepare('INSERT OR IGNORE INTO photo_album_items(id, album_id, media_id, position, caption, page_break, added_at) VALUES(?,?,?,?,?,?,?)');
    foreach (is_array($d['rows'] ?? null) ? array_slice($d['rows'], 0, 2000) : [] as $r) {
        if (!is_array($r) || (int) ($r['album_id'] ?? 0) !== $id) { continue; }
        $mid = albums_media_ids($pdo, [$r['media_id'] ?? 0]); if (!$mid) { continue; }
        $ins->execute([safe_int($r['id'] ?? 0) ?: null, $id, $mid[0], (float) ($r['position'] ?? 0), albums_text($r['caption'] ?? '', 600, true), empty($r['page_break']) ? 0 : 1, albums_text($r['added_at'] ?? '', 30) ?: date('Y-m-d H:i:s')]);
        $n += $ins->rowCount();
    }
    albums_touch($pdo, $id);
    return ['ok' => true, 'n' => $n];
}
/** l'ordre des photos : item_ids dans l'ordre voulu (celles oubliées vont à la fin) ; renvoie l'ordre d'avant (↶ Annuler) */
function albums_reorder(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0); albums_row($pdo, $id);
    $want = array_values(array_unique(array_filter(array_map('intval', is_array($d['item_ids'] ?? null) ? $d['item_ids'] : []))));
    $s = $pdo->prepare('SELECT id FROM photo_album_items WHERE album_id=? ORDER BY position, id'); $s->execute([$id]);
    $before = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    $order = array_merge(array_values(array_intersect($want, $before)), array_values(array_diff($before, $want)));
    $u = $pdo->prepare('UPDATE photo_album_items SET position=? WHERE id=? AND album_id=?');
    foreach ($order as $k => $iid) { $u->execute([$k + 1, $iid, $id]); }
    albums_touch($pdo, $id);
    return ['ok' => true, 'before' => $before, 'order' => $order];
}
function albums_item_save(PDO $pdo, array $d): array
{
    $iid = safe_int($d['item_id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM photo_album_items WHERE id=?'); $s->execute([$iid]); $it = $s->fetch(PDO::FETCH_ASSOC);
    if (!$it) { throw new RuntimeException(i18n_t('Photo introuvable dans l’album.')); }
    albums_row($pdo, (int) $it['album_id']);
    $set = []; $args = [];
    if (array_key_exists('caption', $d)) { $set[] = 'caption=?'; $args[] = albums_text($d['caption'], 600, true); }
    if (array_key_exists('page_break', $d)) { $set[] = 'page_break=?'; $args[] = empty($d['page_break']) ? 0 : 1; }
    if ($set) { $pdo->prepare('UPDATE photo_album_items SET ' . implode(',', $set) . ' WHERE id=?')->execute([...$args, $iid]); albums_touch($pdo, (int) $it['album_id']); }
    return ['ok' => true, 'before' => ['caption' => (string) $it['caption'], 'page_break' => (int) $it['page_break']]];
}

/* ═════════ aiguillage ═════════ */

function albums_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        albums_ready($pdo);
        if (!$isWrite && $action === 'albums') {
            json_response(match ((string) ($_GET['op'] ?? 'list')) {
                'list' => albums_list($pdo),
                'get' => albums_get($pdo, safe_int($_GET['id'] ?? 0)),
                'index' => albums_index($pdo),
                'media' => albums_for_media($pdo, safe_int($_GET['media_id'] ?? 0)),
                default => throw new LcndaBadInput('Opération inconnue.'),
            });
        }
        if ($isWrite && $action === 'albums_write') {
            if (albums_kiosk()) { throw new LcndaBadInput(i18n_t('Mode consultation : rien ne peut être modifié.')); }
            // le verrou d'écriture tout de suite (api.php begin_write_transaction) : deux envois en même temps s'attendent au lieu d'échouer
            $own = !$pdo->inTransaction(); if ($own) { if (function_exists('begin_write_transaction')) { begin_write_transaction($pdo); } else { $pdo->beginTransaction(); } }
            try {
                $res = match ((string) ($payload['op'] ?? '')) {
                    'create' => albums_create($pdo, $payload),
                    'update' => albums_update($pdo, $payload),
                    'delete' => albums_delete($pdo, $payload),
                    'add' => albums_add($pdo, $payload),
                    'remove' => albums_remove($pdo, $payload),
                    'restore_items' => albums_restore_items($pdo, $payload),
                    'reorder' => albums_reorder($pdo, $payload),
                    'item_save' => albums_item_save($pdo, $payload),
                    'log_export' => (static function () use ($pdo, $payload) { if (function_exists('access_log_add')) { access_log_add($pdo, ($payload['kind'] ?? '') === 'print' ? 'print' : 'export', 'photo_album', safe_int($payload['id'] ?? 0) ?: null, '', 'album'); } return ['ok' => true]; })(),
                    default => throw new LcndaBadInput('Opération inconnue.'),
                };
                if ($own) { $pdo->commit(); }
            } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
            json_response($res);
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    } catch (Throwable $e) {
        error_log('LCNDA albums : ' . $e->getMessage());
        json_response(['error' => i18n_t('Les albums photo ne sont pas disponibles ici.')], 422);
    }
}
