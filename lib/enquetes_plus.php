<?php
declare(strict_types=1);

/**
 * 🕵️ Enquêtes : ce qui s'ajoute aux enquêtes (assets/js/app-enquetes.js).
 * - ✅ conclusion d'une enquête : conclusion écrite, argument de preuve, pistes retenues comme sources (table investigation_extras) ;
 * - ⏱ temps passé : chronomètre par enquête (secondes cumulées + départ en cours) ;
 * - 🚫 recherches négatives : « rien trouvé » avec la cote, les années parcourues, la date (table investigation_negatives),
 *   et l'avertissement « déjà parcouru » avant de refaire le même registre ;
 * - 🧩 pistes en colonnes : changer l'état d'une piste sans toucher au reste ;
 * - ↶ Annuler : un dossier de pièces supprimé, un média retiré d'une piste, une recherche négative supprimée ;
 * - ⧉ dupliquer une enquête (question, personnes, pistes ; pas les pièces) ;
 * - 📎 pièces jointes d'une recherche négative : des images de l'app (table investigation_negative_media : seul le lien,
 *   le média reste dans l'app quand la recherche est supprimée) et un dossier de l'ordinateur (colonne folder_path : le chemin
 *   seulement, rien n'est copié ; ouvert par l'app de bureau, electron/preload.js openFolder).
 * GET api.php?action=enquetes_plus&op=…, POST action=enquetes_plus {op, …}. Tables créées à la première utilisation.
 * Essai : tests/test-audit-enquetes.js
 */

function enqp_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_extras (investigation_id INTEGER PRIMARY KEY, conclusion TEXT NOT NULL DEFAULT '', proof TEXT NOT NULL DEFAULT '',
        kept_item_ids TEXT NOT NULL DEFAULT '', concluded_at TEXT NOT NULL DEFAULT '', seconds INTEGER NOT NULL DEFAULT 0, chrono_started TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_negatives (id INTEGER PRIMARY KEY AUTOINCREMENT, investigation_id INTEGER NOT NULL, repository TEXT NOT NULL DEFAULT '',
        cote TEXT NOT NULL DEFAULT '', year_from INTEGER NOT NULL DEFAULT 0, year_to INTEGER NOT NULL DEFAULT 0, searched_on TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_inv_neg ON investigation_negatives(investigation_id)");
    // 📎 pièces jointes : les images (liens vers la table media) et un dossier de l'ordinateur (le chemin seulement)
    $pdo->exec("CREATE TABLE IF NOT EXISTS investigation_negative_media (negative_id INTEGER NOT NULL, media_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(negative_id, media_id))");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_inv_neg_media ON investigation_negative_media(media_id)");
    $cols = array_column($pdo->query('PRAGMA table_info(investigation_negatives)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('folder_path', $cols, true)) { $pdo->exec("ALTER TABLE investigation_negatives ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''"); }
    $done = true;
}

function enqp_inv_exists(PDO $pdo, int $id): bool
{
    $s = $pdo->prepare('SELECT 1 FROM investigations WHERE id=?'); $s->execute([$id]); return (bool) $s->fetchColumn();
}

function enqp_extras(PDO $pdo, int $id): array
{
    enqp_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM investigation_extras WHERE investigation_id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC) ?: ['investigation_id' => $id, 'conclusion' => '', 'proof' => '', 'kept_item_ids' => '', 'concluded_at' => '', 'seconds' => 0, 'chrono_started' => ''];
    $r['seconds'] = (int) $r['seconds'];
    $r['kept_item_ids'] = array_values(array_filter(array_map('intval', explode(',', (string) $r['kept_item_ids']))));
    $r['running'] = $r['chrono_started'] !== '';
    $r['elapsed'] = $r['seconds'] + ($r['running'] ? max(0, time() - (int) strtotime((string) $r['chrono_started'])) : 0);
    return $r;
}

function enqp_upsert(PDO $pdo, int $id, array $set): void
{
    enqp_ensure($pdo);
    $pdo->prepare('INSERT OR IGNORE INTO investigation_extras(investigation_id) VALUES(?)')->execute([$id]);
    $cols = []; $vals = [];
    foreach ($set as $k => $v) { $cols[] = "$k=?"; $vals[] = $v; }
    $vals[] = $id;
    $pdo->prepare('UPDATE investigation_extras SET ' . implode(',', $cols) . ',updated_at=CURRENT_TIMESTAMP WHERE investigation_id=?')->execute($vals);
}

/** la cote « AD19 - 4 E 272/12 » et « ad 19 4e272/12 » sont la même : lettres et chiffres seulement, en minuscules */
function enqp_cote_key(string $s): string
{
    $s = mb_strtolower(trim($s));
    if (function_exists('iconv')) { $t = @iconv('UTF-8', 'ASCII//TRANSLIT', $s); if ($t !== false) { $s = $t; } }
    return preg_replace('/[^a-z0-9]+/', '', $s) ?? '';
}

function enqp_negatives(PDO $pdo, int $id): array
{
    enqp_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM investigation_negatives WHERE investigation_id=? ORDER BY searched_on DESC, id DESC'); $s->execute([$id]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'investigation_id' => (int) $r['investigation_id'], 'repository' => $r['repository'], 'cote' => $r['cote'],
        'year_from' => (int) $r['year_from'], 'year_to' => (int) $r['year_to'], 'searched_on' => $r['searched_on'], 'note' => $r['note'], 'created_at' => $r['created_at'],
        'folder_path' => (string) ($r['folder_path'] ?? ''), 'media' => enqp_negative_media($pdo, (int) $r['id'])], $s->fetchAll(PDO::FETCH_ASSOC));
}

/** 📎 les images jointes à une recherche négative (seulement celles encore dans l'app), dans l'ordre choisi */
function enqp_negative_media(PDO $pdo, int $nid): array
{
    $s = $pdo->prepare('SELECT m.* FROM investigation_negative_media l JOIN media m ON m.id=l.media_id WHERE l.negative_id=? ORDER BY l.position, l.media_id'); $s->execute([$nid]);
    return array_map(static fn($m) => ['id' => (int) $m['id']] + $m, $s->fetchAll(PDO::FETCH_ASSOC));
}

/** 📎 remplace les images jointes (des médias de l'app qui existent ; au plus 200) */
function enqp_set_negative_media(PDO $pdo, int $nid, array $ids): void
{
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', $ids), static fn($x) => $x > 0))), 0, 200);
    $pdo->prepare('DELETE FROM investigation_negative_media WHERE negative_id=?')->execute([$nid]);
    $ok = $pdo->prepare('SELECT 1 FROM media WHERE id=?');
    $ins = $pdo->prepare('INSERT OR IGNORE INTO investigation_negative_media(negative_id, media_id, position) VALUES(?,?,?)');
    foreach ($ids as $i => $mid) { $ok->execute([$mid]); if ($ok->fetchColumn()) { $ins->execute([$nid, $mid, $i]); } }
}

/** 📁 le chemin d'un dossier de l'ordinateur (texte seulement : l'app de bureau vérifie que c'est bien un dossier avant de l'ouvrir) */
function enqp_folder_path($v): string
{
    $p = trim(str_replace(["\0", "\r", "\n"], '', (string) $v));
    return mb_substr($p, 0, 1000);
}

/** ⚠️ déjà parcouru ? même cote (lettres et chiffres) et des années qui se recouvrent, dans n'importe quelle enquête */
function enqp_check_negative(PDO $pdo, array $q): array
{
    enqp_ensure($pdo);
    $key = enqp_cote_key((string) ($q['cote'] ?? ''));
    if ($key === '') { return ['matches' => []]; }
    $from = safe_int($q['year_from'] ?? 0); $to = safe_int($q['year_to'] ?? 0); if ($to && $from > $to) { [$from, $to] = [$to, $from]; }
    $except = safe_int($q['except'] ?? 0);
    $rows = $pdo->query("SELECT n.*, i.title AS investigation_title FROM investigation_negatives n LEFT JOIN investigations i ON i.id=n.investigation_id ORDER BY n.searched_on DESC, n.id DESC")->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        if ((int) $r['id'] === $except || enqp_cote_key((string) $r['cote']) !== $key) { continue; }
        $a = (int) $r['year_from']; $b = (int) $r['year_to'] ?: $a;
        $overlap = !$from || !$a || (max($from, $a) <= min($to ?: $from, $b ?: $a));
        if (!$overlap) { continue; }
        $out[] = ['id' => (int) $r['id'], 'investigation_id' => (int) $r['investigation_id'], 'investigation_title' => (string) ($r['investigation_title'] ?? ''), 'repository' => $r['repository'], 'cote' => $r['cote'],
            'year_from' => $a, 'year_to' => (int) $r['year_to'], 'searched_on' => $r['searched_on']];
    }
    return ['matches' => $out];
}

function enqp_get(PDO $pdo, array $q): array
{
    enqp_ensure($pdo);
    $op = (string) ($q['op'] ?? '');
    if ($op === 'detail') { $id = safe_int($q['id'] ?? 0); return ['extras' => enqp_extras($pdo, $id), 'negatives' => enqp_negatives($pdo, $id)]; }
    if ($op === 'check_negative') { return enqp_check_negative($pdo, $q); }
    if ($op === 'times') { // le temps passé de chaque enquête (la liste)
        $out = [];
        foreach ($pdo->query('SELECT investigation_id FROM investigation_extras')->fetchAll(PDO::FETCH_COLUMN) as $id) { $e = enqp_extras($pdo, (int) $id); $out[(int) $id] = ['elapsed' => $e['elapsed'], 'running' => $e['running'], 'concluded' => $e['conclusion'] !== '']; }
        return ['times' => (object) $out];
    }
    throw new RuntimeException('Demande inconnue.');
}

function enqp_post(PDO $pdo, array $d): array
{
    enqp_ensure($pdo);
    $op = (string) ($d['op'] ?? '');
    $id = safe_int($d['investigation_id'] ?? 0);
    $needInv = static function () use ($pdo, $id) { if (!$id || !enqp_inv_exists($pdo, $id)) { throw new RuntimeException('Enquête introuvable.'); } };
    switch ($op) {
        case 'save_conclusion': {
            $needInv();
            $before = enqp_extras($pdo, $id);
            $kept = array_values(array_unique(array_filter(array_map('intval', is_array($d['kept_item_ids'] ?? null) ? $d['kept_item_ids'] : explode(',', (string) ($d['kept_item_ids'] ?? '')))))) ;
            $conclusion = mb_substr(safe_text($d['conclusion'] ?? ''), 0, 20000);
            enqp_upsert($pdo, $id, ['conclusion' => $conclusion, 'proof' => mb_substr(safe_text($d['proof'] ?? ''), 0, 40000), 'kept_item_ids' => implode(',', $kept),
                'concluded_at' => $conclusion !== '' ? ($before['concluded_at'] ?: date('Y-m-d H:i:s')) : '']);
            $status = null;
            if (!empty($d['close'])) {
                $s = $pdo->prepare('SELECT status FROM investigations WHERE id=?'); $s->execute([$id]); $status = (string) $s->fetchColumn();
                $pdo->prepare("UPDATE investigations SET status='closed', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$id]);
            }
            if (function_exists('log_change')) { log_change($pdo, 'investigation', $id, 'update', 'Conclusion de l’enquête', ['conclusion' => $before['conclusion']], ['conclusion' => $conclusion]); }
            return ['extras' => enqp_extras($pdo, $id), 'before' => ['conclusion' => $before['conclusion'], 'proof' => $before['proof'], 'kept_item_ids' => $before['kept_item_ids'], 'concluded_at' => $before['concluded_at'], 'status' => $status]];
        }
        case 'restore_conclusion': { // ↶ Annuler : la conclusion d'avant (et l'état d'avant la clôture)
            $needInv();
            $b = is_array($d['before'] ?? null) ? $d['before'] : [];
            enqp_upsert($pdo, $id, ['conclusion' => safe_text($b['conclusion'] ?? ''), 'proof' => safe_text($b['proof'] ?? ''), 'kept_item_ids' => implode(',', array_map('intval', (array) ($b['kept_item_ids'] ?? []))), 'concluded_at' => safe_text($b['concluded_at'] ?? '')]);
            $st = (string) ($b['status'] ?? '');
            if (in_array($st, ['open', 'paused', 'closed'], true)) { $pdo->prepare('UPDATE investigations SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$st, $id]); }
            return ['extras' => enqp_extras($pdo, $id)];
        }
        case 'chrono': { // ⏱ start | stop | reset | set (secondes)
            $needInv();
            $e = enqp_extras($pdo, $id); $what = (string) ($d['what'] ?? '');
            if ($what === 'start' && !$e['running']) { enqp_upsert($pdo, $id, ['chrono_started' => date('Y-m-d H:i:s')]); }
            elseif ($what === 'stop' && $e['running']) { enqp_upsert($pdo, $id, ['seconds' => $e['elapsed'], 'chrono_started' => '']); }
            elseif ($what === 'reset') { enqp_upsert($pdo, $id, ['seconds' => 0, 'chrono_started' => '']); }
            elseif ($what === 'set') { enqp_upsert($pdo, $id, ['seconds' => max(0, min(10_000_000, safe_int($d['seconds'] ?? 0))), 'chrono_started' => $e['running'] ? date('Y-m-d H:i:s') : '']); }
            return ['extras' => enqp_extras($pdo, $id), 'before' => ['seconds' => $e['elapsed']]];
        }
        case 'save_negative': {
            $needInv();
            $nid = safe_int($d['id'] ?? 0);
            $cote = mb_substr(safe_text($d['cote'] ?? ''), 0, 300); $repo = mb_substr(safe_text($d['repository'] ?? ''), 0, 300);
            if ($cote === '' && $repo === '') { throw new RuntimeException('Donne au moins la cote ou le fonds parcouru.'); }
            $from = safe_int($d['year_from'] ?? 0); $to = safe_int($d['year_to'] ?? 0); if ($to && $from > $to) { [$from, $to] = [$to, $from]; }
            $on = safe_text($d['searched_on'] ?? ''); if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $on)) { $on = date('Y-m-d'); }
            $vals = [$repo, $cote, $from, $to, $on, mb_substr(safe_text($d['note'] ?? ''), 0, 4000)];
            if ($nid) {
                $c = $pdo->prepare('SELECT 1 FROM investigation_negatives WHERE id=? AND investigation_id=?'); $c->execute([$nid, $id]);
                if (!$c->fetchColumn()) { throw new RuntimeException('Recherche introuvable.'); }
                $vals[] = $nid; $vals[] = $id; $pdo->prepare('UPDATE investigation_negatives SET repository=?, cote=?, year_from=?, year_to=?, searched_on=?, note=? WHERE id=? AND investigation_id=?')->execute($vals);
            }
            else { $pdo->prepare('INSERT INTO investigation_negatives(repository, cote, year_from, year_to, searched_on, note, investigation_id) VALUES(?,?,?,?,?,?,?)')->execute([...$vals, $id]); $nid = (int) $pdo->lastInsertId(); }
            // 📎 pièces jointes : seulement si la fenêtre les envoie (une ancienne fenêtre ne les efface pas)
            if (array_key_exists('media_ids', $d)) { enqp_set_negative_media($pdo, $nid, is_array($d['media_ids']) ? $d['media_ids'] : explode(',', (string) $d['media_ids'])); }
            if (array_key_exists('folder_path', $d)) { $pdo->prepare('UPDATE investigation_negatives SET folder_path=? WHERE id=?')->execute([enqp_folder_path($d['folder_path']), $nid]); }
            $pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$id]);
            return ['id' => $nid];
        }
        case 'delete_negative': {
            $nid = safe_int($d['id'] ?? 0);
            $s = $pdo->prepare('SELECT * FROM investigation_negatives WHERE id=?'); $s->execute([$nid]); $row = $s->fetch(PDO::FETCH_ASSOC);
            if (!$row) { throw new RuntimeException('Recherche introuvable.'); }
            $m = $pdo->prepare('SELECT media_id FROM investigation_negative_media WHERE negative_id=? ORDER BY position, media_id'); $m->execute([$nid]);
            $row['media_ids'] = array_map('intval', $m->fetchAll(PDO::FETCH_COLUMN)); // 📎 pour ↶ : les médias restent dans l'app, seul le lien part
            $pdo->prepare('DELETE FROM investigation_negative_media WHERE negative_id=?')->execute([$nid]);
            $pdo->prepare('DELETE FROM investigation_negatives WHERE id=?')->execute([$nid]);
            return ['row' => $row];
        }
        case 'restore_negative': {
            $r = is_array($d['row'] ?? null) ? $d['row'] : [];
            $nid = safe_int($r['id'] ?? 0); $inv = safe_int($r['investigation_id'] ?? 0);
            if (!$nid || !enqp_inv_exists($pdo, $inv)) { throw new RuntimeException('L’enquête de cette recherche n’existe plus.'); }
            $pdo->prepare('INSERT OR IGNORE INTO investigation_negatives(id, investigation_id, repository, cote, year_from, year_to, searched_on, note, created_at) VALUES(?,?,?,?,?,?,?,?,?)')
                ->execute([$nid, $inv, safe_text($r['repository'] ?? ''), safe_text($r['cote'] ?? ''), safe_int($r['year_from'] ?? 0), safe_int($r['year_to'] ?? 0), safe_text($r['searched_on'] ?? ''), safe_text($r['note'] ?? ''), safe_text($r['created_at'] ?? '') ?: date('Y-m-d H:i:s')]);
            // 📎 ses pièces jointes reviennent aussi (le dossier et les images encore dans l'app)
            $pdo->prepare('UPDATE investigation_negatives SET folder_path=? WHERE id=?')->execute([enqp_folder_path($r['folder_path'] ?? ''), $nid]);
            if (is_array($r['media_ids'] ?? null) && $r['media_ids']) { enqp_set_negative_media($pdo, $nid, $r['media_ids']); }
            return ['id' => $nid];
        }
        case 'item_status': { // 🧩 une piste glissée dans une autre colonne : seul son état change
            $iid = safe_int($d['item_id'] ?? 0); $st = (string) ($d['status'] ?? '');
            if (!in_array($st, ['promising', 'explored', 'to_explore_priority', 'to_explore', 'closed'], true)) { throw new RuntimeException('État inconnu.'); }
            $s = $pdo->prepare('SELECT * FROM investigation_items WHERE id=?'); $s->execute([$iid]); $old = $s->fetch(PDO::FETCH_ASSOC);
            if (!$old) { throw new RuntimeException('Piste introuvable.'); }
            $pdo->prepare('UPDATE investigation_items SET status=? WHERE id=?')->execute([$st, $iid]);
            $pdo->prepare('UPDATE investigations SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([(int) $old['investigation_id']]);
            if (function_exists('log_change')) { log_change($pdo, 'investigation_item', $iid, 'update', 'Piste : ' . $old['title'], ['status' => $old['status']], ['status' => $st]); }
            return ['id' => $iid, 'old' => (string) $old['status']];
        }
        case 'restore_folder': { // ↶ un dossier de pièces supprimé : le même dossier, ses médias et sous-dossiers y reviennent
            $f = is_array($d['folder'] ?? null) ? $d['folder'] : [];
            $fid = safe_int($f['id'] ?? 0); $inv = safe_int($f['investigation_id'] ?? 0); $parent = safe_int($f['parent_id'] ?? 0) ?: null;
            if (!$fid || !enqp_inv_exists($pdo, $inv)) { throw new RuntimeException('L’enquête de ce dossier n’existe plus.'); }
            if ($parent) { $c = $pdo->prepare('SELECT 1 FROM investigation_media_folders WHERE id=? AND investigation_id=?'); $c->execute([$parent, $inv]); if (!$c->fetchColumn()) { $parent = null; } }
            $pdo->prepare('INSERT OR IGNORE INTO investigation_media_folders(id, investigation_id, parent_id, name) VALUES(?,?,?,?)')->execute([$fid, $inv, $parent, safe_text($f['name'] ?? 'Dossier') ?: 'Dossier']);
            $m = $pdo->prepare('UPDATE investigation_media SET folder_id=? WHERE id=? AND investigation_id=?');
            foreach ((array) ($d['media_links'] ?? []) as $l) { $m->execute([$fid, safe_int($l), $inv]); }
            $c = $pdo->prepare('UPDATE investigation_media_folders SET parent_id=? WHERE id=? AND investigation_id=?');
            foreach ((array) ($d['children'] ?? []) as $k) { if (safe_int($k) !== $fid) { $c->execute([$fid, safe_int($k), $inv]); } }
            return ['id' => $fid];
        }
        case 'relink_media_item': { // ↶ un média retiré d'une piste
            $lid = safe_int($d['link_id'] ?? 0); $iid = safe_int($d['item_id'] ?? 0);
            if (!$lid || !$iid) { throw new RuntimeException('Paramètres manquants'); }
            $pdo->prepare('INSERT OR IGNORE INTO investigation_media_items(investigation_media_id, investigation_item_id) VALUES(?,?)')->execute([$lid, $iid]);
            return ['ok' => true];
        }
        case 'duplicate': { // ⧉ question, personnes, pistes (sans les pièces ni le temps)
            $needInv();
            $s = $pdo->prepare('SELECT * FROM investigations WHERE id=?'); $s->execute([$id]); $inv = $s->fetch(PDO::FETCH_ASSOC);
            $title = mb_substr(safe_text($d['title'] ?? '') ?: ($inv['title'] . ' (copie)'), 0, 300);
            $pdo->prepare("INSERT INTO investigations(person_id, title, question, known_facts, documents, status) VALUES(?,?,?,?,?,'open')")->execute([(int) $inv['person_id'], $title, (string) $inv['question'], (string) $inv['known_facts'], (string) $inv['documents']]);
            $new = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT OR IGNORE INTO investigation_persons(investigation_id, person_id, role) SELECT ?, person_id, role FROM investigation_persons WHERE investigation_id=?')->execute([$new, $id]);
            $pdo->prepare("INSERT INTO investigation_items(investigation_id, kind, title, url, notes, status) SELECT ?, kind, title, url, notes, status FROM investigation_items WHERE investigation_id=? ORDER BY id")->execute([$new, $id]);
            if (function_exists('log_change')) { log_change($pdo, 'investigation', $new, 'create', 'Enquête « ' . $title . ' » (copie)'); }
            return ['id' => $new];
        }
    }
    throw new RuntimeException('Demande inconnue.');
}
