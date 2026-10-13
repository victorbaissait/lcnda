<?php
declare(strict_types=1);

/*
 * 📚 Recueils (structure n°26) : un ensemble de pages photographiées dans l'ordre (registre, liste de prisonniers, cahier…).
 *  - une page (recueil_pages) = une page réelle du document : sa place, son nom (« f° 12 »), sa transcription ;
 *  - une version (recueil_versions) = une campagne de photos (« Photos 2015 », « Photos 2026 ») : les versions coexistent ;
 *  - une image (recueil_images) = une photo d'une version, posée sur une page (ou « à ranger »), en vue entière ou en détail (zoom) ;
 *  - « la meilleure version » n'est pas un tas de fichiers en plus : pour chaque page, l'image retenue (best_image_id),
 *    sinon la vue entière de la version la plus récente ;
 *  - rattachements (recueil_links) : tout le recueil, ou de telle page à telle page, à une fiche, un village, une enquête,
 *    un projet de l'Atelier, une battue.
 * Les photos sont des médias ordinaires (Médias, retouche, rotation…) rattachés au recueil (family_collection_media 'recueil').
 * Écran : assets/js/heritage-recueils.js.
 */

const RECUEIL_LINK_TYPES = ['person' => 'Fiche', 'village' => 'Village', 'investigation' => 'Enquête', 'atelier_project' => 'Projet de l’Atelier', 'battue' => 'Battue'];
const RECUEIL_ROLES = ['page', 'detail'];
const RECUEIL_PERSON_YEARS = "(SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
    (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year";

function recueil_row(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT * FROM recueils WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Recueil introuvable.'); }
    return $r;
}

function recueil_touch(PDO $pdo, int $id): void
{
    $pdo->prepare("UPDATE recueils SET updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$id]);
}

/** Tous les recueils, avec leurs chiffres et la vignette de la première page. */
function recueils_list(PDO $pdo, string $q = ''): array
{
    $rows = $pdo->query('SELECT * FROM recueils ORDER BY title COLLATE NOCASE, id')->fetchAll();
    $count = static fn(string $sql) => array_column($pdo->query($sql)->fetchAll(PDO::FETCH_NUM), 1, 0);
    $pages = $count('SELECT recueil_id, COUNT(*) FROM recueil_pages GROUP BY recueil_id');
    $done = $count("SELECT recueil_id, COUNT(*) FROM recueil_pages WHERE trim(transcription)<>'' GROUP BY recueil_id");
    $versions = $count('SELECT recueil_id, COUNT(*) FROM recueil_versions GROUP BY recueil_id');
    $images = $count('SELECT recueil_id, COUNT(*) FROM recueil_images GROUP BY recueil_id');
    $loose = $count('SELECT recueil_id, COUNT(*) FROM recueil_images WHERE page_id IS NULL GROUP BY recueil_id');
    $links = $count('SELECT recueil_id, COUNT(*) FROM recueil_links GROUP BY recueil_id');
    $q = mb_strtolower(trim($q));
    $out = [];
    foreach ($rows as $r) {
        $id = (int) $r['id'];
        if ($q !== '' && !str_contains(mb_strtolower($r['title'] . ' ' . $r['reference'] . ' ' . $r['place_text'] . ' ' . $r['description']), $q)) { continue; }
        $cover = recueil_cover($pdo, $id);
        $out[] = ['id' => $id, 'title' => $r['title'], 'icon' => $r['icon'], 'reference' => $r['reference'], 'place_text' => $r['place_text'], 'date_text' => $r['date_text'],
            'description' => $r['description'], 'updated_at' => $r['updated_at'], 'cover' => $cover,
            'pages' => (int) ($pages[$id] ?? 0), 'transcribed' => (int) ($done[$id] ?? 0), 'versions' => (int) ($versions[$id] ?? 0),
            'images' => (int) ($images[$id] ?? 0), 'loose' => (int) ($loose[$id] ?? 0), 'links' => (int) ($links[$id] ?? 0)];
    }
    return ['recueils' => $out];
}

/** Vignette : l'image retenue de la première page, sinon la première photo du recueil. */
function recueil_cover(PDO $pdo, int $id): ?array
{
    // Couverture choisie exprès
    try {
        $s = $pdo->prepare('SELECT m.id, m.filename, m.thumbnail FROM recueils r JOIN media m ON m.id=r.cover_media_id WHERE r.id=?'); $s->execute([$id]);
        if ($m = $s->fetch()) { return ['media_id' => (int) $m['id'], 'filename' => (string) $m['filename'], 'thumbnail' => (string) ($m['thumbnail'] ?: $m['filename']), 'chosen' => true]; }
    } catch (Throwable $_) {}
    $s = $pdo->prepare("SELECT m.id, m.filename, m.thumbnail FROM recueil_pages p JOIN recueil_images i ON i.page_id=p.id JOIN media m ON m.id=i.media_id
        WHERE p.recueil_id=? ORDER BY p.position, p.id, (i.id=p.best_image_id) DESC, i.role='page' DESC, i.version_id DESC LIMIT 1");
    $s->execute([$id]);
    $m = $s->fetch();
    if (!$m) { $s = $pdo->prepare('SELECT m.id, m.filename, m.thumbnail FROM recueil_images i JOIN media m ON m.id=i.media_id WHERE i.recueil_id=? ORDER BY i.position, i.id LIMIT 1'); $s->execute([$id]); $m = $s->fetch(); }
    return $m ? ['media_id' => (int) $m['id'], 'filename' => (string) $m['filename'], 'thumbnail' => (string) ($m['thumbnail'] ?: $m['filename'])] : null;
}

function recueil_detail(PDO $pdo, int $id): array
{
    $r = recueil_row($pdo, $id);
    $r['id'] = (int) $r['id'];
    $summary = json_decode((string) $r['summary'], true);
    $r['summary'] = is_array($summary) ? $summary : null;
    $trays = json_decode((string) ($r['trays'] ?? ''), true);
    $r['trays'] = is_array($trays) ? array_values(array_filter($trays, 'is_string')) : [];
    $r['cover'] = recueil_cover($pdo, $id);
    $r['cover_media_id'] = isset($r['cover_media_id']) && $r['cover_media_id'] !== null ? (int) $r['cover_media_id'] : null;
    $s = $pdo->prepare('SELECT * FROM recueil_versions WHERE recueil_id=? ORDER BY position, id'); $s->execute([$id]);
    $versions = array_map(static fn($v) => ['id' => (int) $v['id'], 'name' => $v['name'], 'date_text' => $v['date_text'], 'notes' => $v['notes'], 'position' => (float) $v['position']], $s->fetchAll());
    $s = $pdo->prepare('SELECT * FROM recueil_pages WHERE recueil_id=? ORDER BY position, id'); $s->execute([$id]);
    $pages = [];
    foreach ($s->fetchAll() as $n => $p) {
        $pages[] = ['id' => (int) $p['id'], 'num' => $n + 1, 'label' => $p['label'], 'transcription' => $p['transcription'], 'notes' => $p['notes'], 'best_image_id' => $p['best_image_id'] !== null ? (int) $p['best_image_id'] : null, 'position' => (float) $p['position'],
            'table' => ($t = json_decode((string) ($p['table_json'] ?? ''), true)) && is_array($t) ? $t : null];
    }
    $s = $pdo->prepare('SELECT i.*, m.title AS media_title, m.filename, m.thumbnail, m.media_type, m.date_text AS media_date, m.transcription AS media_transcription
        FROM recueil_images i JOIN media m ON m.id=i.media_id WHERE i.recueil_id=? ORDER BY i.position, i.id');
    $s->execute([$id]);
    $images = array_map(static fn($i) => ['id' => (int) $i['id'], 'version_id' => (int) $i['version_id'], 'page_id' => $i['page_id'] !== null ? (int) $i['page_id'] : null, 'media_id' => (int) $i['media_id'],
        'role' => $i['role'], 'position' => (float) $i['position'], 'note' => $i['note'], 'tray' => (string) ($i['tray'] ?? ''), 'title' => $i['media_title'], 'filename' => $i['filename'], 'thumbnail' => $i['thumbnail'] ?: $i['filename'],
        'media_type' => $i['media_type'], 'media_date' => $i['media_date'], 'media_transcription' => $i['media_transcription']], $s->fetchAll());
    // Image retenue pour chaque page : choisie, sinon la vue entière de la version la plus récente, sinon un détail
    $vpos = []; foreach ($versions as $k => $v) { $vpos[$v['id']] = $k; }
    $byPage = [];
    foreach ($images as $i) { if ($i['page_id']) { $byPage[$i['page_id']][] = $i; } }
    foreach ($pages as &$p) {
        $list = $byPage[$p['id']] ?? [];
        $chosen = null;
        foreach ($list as $i) { if ($i['id'] === $p['best_image_id']) { $chosen = $i['id']; } }
        if (!$chosen && $list) {
            usort($list, static fn($a, $b) => [$a['role'] === 'page' ? 0 : 1, -($vpos[$a['version_id']] ?? 0), $a['position']] <=> [$b['role'] === 'page' ? 0 : 1, -($vpos[$b['version_id']] ?? 0), $b['position']]);
            $chosen = $list[0]['id'];
        }
        $p['shown_image_id'] = $chosen;
        if ($p['best_image_id'] && $p['best_image_id'] !== $chosen) { $p['best_image_id'] = null; } // image retenue retirée depuis
    }
    unset($p);
    return ['recueil' => $r, 'versions' => $versions, 'pages' => $pages, 'images' => $images, 'links' => recueil_links_resolved($pdo, $id, $pages)];
}

function save_recueil(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 200);
    if ($title === '') { throw new RuntimeException('Donne un nom au recueil.'); }
    $vals = [$title, mb_substr(safe_text($data['icon'] ?? '') ?: '📚', 0, 16), mb_substr(safe_text($data['description'] ?? ''), 0, 20000), mb_substr(safe_text($data['reference'] ?? ''), 0, 300),
        mb_substr(safe_text($data['place_text'] ?? ''), 0, 300), mb_substr(safe_text($data['date_text'] ?? ''), 0, 100)];
    if ($id) {
        recueil_row($pdo, $id);
        $pdo->prepare('UPDATE recueils SET title=?, icon=?, description=?, reference=?, place_text=?, date_text=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
    } else {
        $pdo->prepare('INSERT INTO recueils(title, icon, description, reference, place_text, date_text) VALUES(?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
        $name = mb_substr(safe_text($data['first_version'] ?? ''), 0, 120) ?: 'Photos ' . date('Y');
        $pdo->prepare('INSERT INTO recueil_versions(recueil_id, name, position) VALUES(?,?,1)')->execute([$id, $name]);
    }
    if (array_key_exists('cover_media_id', $data)) {
        $cover = safe_int($data['cover_media_id'] ?? 0);
        if ($cover) { $m = $pdo->prepare("SELECT 1 FROM media WHERE id=? AND media_type='image'"); $m->execute([$cover]); if (!$m->fetchColumn()) { throw new RuntimeException('Choisis une image pour la couverture.'); } }
        $pdo->prepare('UPDATE recueils SET cover_media_id=? WHERE id=?')->execute([$cover ?: null, $id]);
    }
    if (array_key_exists('summary', $data)) {
        $sum = is_array($data['summary']) ? $data['summary'] : null;
        $pdo->prepare('UPDATE recueils SET summary=? WHERE id=?')->execute([$sum ? json_encode(recueil_clean_summary($sum), JSON_UNESCAPED_UNICODE) : '', $id]);
    }
    log_change($pdo, 'recueil', $id, 'save', 'Recueil « ' . $title . ' »');
    return ['id' => $id];
}

/** Réglage de la page « Résumé » : liste de blocs {type, on, n, text}. */
function recueil_clean_summary(array $sum): array
{
    $types = ['cover', 'description', 'figures', 'versions', 'missing', 'toc', 'latest', 'links', 'mosaic', 'note', 'progress'];
    $blocks = [];
    foreach (array_slice(is_array($sum['blocks'] ?? null) ? $sum['blocks'] : [], 0, 40) as $b) {
        if (!is_array($b) || !in_array($b['type'] ?? '', $types, true)) { continue; }
        $blocks[] = ['type' => $b['type'], 'on' => !empty($b['on']), 'n' => max(1, min(200, safe_int($b['n'] ?? 12, 12))), 'title' => mb_substr(safe_text($b['title'] ?? ''), 0, 120), 'text' => mb_substr(safe_text($b['text'] ?? ''), 0, 20000), 'wide' => !empty($b['wide'])];
    }
    return ['blocks' => $blocks];
}

/** Supprime le recueil. Les photos restent dans Médias (sauf si on demande aussi de les supprimer). */
function delete_recueil(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $r = recueil_row($pdo, $id);
    $media = $pdo->prepare('SELECT DISTINCT media_id FROM recueil_images WHERE recueil_id=?'); $media->execute([$id]);
    $mediaIds = array_map('intval', $media->fetchAll(PDO::FETCH_COLUMN));
    $pdo->prepare("DELETE FROM family_collection_media WHERE collection_type='recueil' AND collection_id=?")->execute([$id]);
    $pdo->prepare('DELETE FROM recueils WHERE id=?')->execute([$id]);
    $deleted = 0;
    if (!empty($data['delete_media']) && $mediaIds) {
        foreach ($mediaIds as $mid) {
            $used = $pdo->prepare('SELECT (SELECT COUNT(*) FROM media_links WHERE media_id=?) + (SELECT COUNT(*) FROM family_collection_media WHERE media_id=?) + (SELECT COUNT(*) FROM recueil_images WHERE media_id=?)');
            $used->execute([$mid, $mid, $mid]);
            if ((int) $used->fetchColumn() > 0) { continue; } // la photo sert ailleurs : on la garde
            $f = $pdo->prepare('SELECT filename, thumbnail FROM media WHERE id=?'); $f->execute([$mid]); $m = $f->fetch();
            $pdo->prepare('DELETE FROM media WHERE id=?')->execute([$mid]);
            foreach (array_unique(array_filter([(string) ($m['filename'] ?? ''), (string) ($m['thumbnail'] ?? '')])) as $file) { $path = MEDIA_DIR . '/' . basename($file); if (is_file($path)) { @unlink($path); } }
            $deleted++;
        }
    }
    log_change($pdo, 'recueil', $id, 'delete', 'Recueil « ' . $r['title'] . ' » supprimé');
    return ['deleted' => true, 'media_deleted' => $deleted, 'media_kept' => count($mediaIds) - $deleted];
}

function save_recueil_version(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 120);
    if ($name === '') { throw new RuntimeException('Donne un nom à la version (ex. « Photos 2015 »).'); }
    $vals = [$name, mb_substr(safe_text($data['date_text'] ?? ''), 0, 100), mb_substr(safe_text($data['notes'] ?? ''), 0, 5000)];
    if ($id) {
        $s = $pdo->prepare('SELECT recueil_id FROM recueil_versions WHERE id=?'); $s->execute([$id]); $rid = (int) $s->fetchColumn();
        if (!$rid) { throw new RuntimeException('Version introuvable.'); }
        $pdo->prepare('UPDATE recueil_versions SET name=?, date_text=?, notes=? WHERE id=?')->execute([...$vals, $id]);
    } else {
        $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
        $max = $pdo->prepare('SELECT COALESCE(MAX(position),0)+1 FROM recueil_versions WHERE recueil_id=?'); $max->execute([$rid]);
        $pdo->prepare('INSERT INTO recueil_versions(recueil_id, name, date_text, notes, position) VALUES(?,?,?,?,?)')->execute([$rid, ...$vals, (float) $max->fetchColumn()]);
        $id = (int) $pdo->lastInsertId();
    }
    if (isset($data['move'])) { recueil_move($pdo, 'recueil_versions', $id, $rid, safe_int($data['move'])); }
    recueil_touch($pdo, $rid);
    return ['id' => $id];
}

/** Monte (-1) ou descend (+1) une ligne dans l'ordre d'un recueil (versions, pages). */
function recueil_move(PDO $pdo, string $table, int $id, int $rid, int $dir): void
{
    if (!in_array($table, ['recueil_versions', 'recueil_pages'], true) || !$dir) { return; }
    $s = $pdo->prepare("SELECT id FROM $table WHERE recueil_id=? ORDER BY position, id"); $s->execute([$rid]);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    $i = array_search($id, $ids, true);
    $j = $i === false ? false : $i + ($dir < 0 ? -1 : 1);
    if ($i === false || $j < 0 || $j >= count($ids)) { return; }
    [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]];
    $u = $pdo->prepare("UPDATE $table SET position=? WHERE id=?");
    foreach ($ids as $k => $x) { $u->execute([$k + 1, $x]); }
}

/** Supprime une version : ses photos quittent le recueil (elles restent dans Médias). Il reste toujours au moins une version. */
function delete_recueil_version(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT recueil_id FROM recueil_versions WHERE id=?'); $s->execute([$id]); $rid = (int) $s->fetchColumn();
    if (!$rid) { throw new RuntimeException('Version introuvable.'); }
    $n = $pdo->prepare('SELECT COUNT(*) FROM recueil_versions WHERE recueil_id=?'); $n->execute([$rid]);
    if ((int) $n->fetchColumn() <= 1) { throw new RuntimeException('Un recueil garde au moins une version.'); }
    $media = $pdo->prepare('SELECT media_id FROM recueil_images WHERE version_id=?'); $media->execute([$id]);
    $ids = array_map('intval', $media->fetchAll(PDO::FETCH_COLUMN));
    $pdo->prepare('DELETE FROM recueil_images WHERE version_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM recueil_versions WHERE id=?')->execute([$id]);
    recueil_unlink_media($pdo, $rid, $ids);
    recueil_touch($pdo, $rid);
    return ['deleted' => true];
}

/** Retire le lien « photo du recueil » d'un média qui n'est plus dans aucune version du recueil. */
function recueil_unlink_media(PDO $pdo, int $rid, array $mediaIds): void
{
    $still = $pdo->prepare('SELECT 1 FROM recueil_images WHERE recueil_id=? AND media_id=?');
    $del = $pdo->prepare("DELETE FROM family_collection_media WHERE collection_type='recueil' AND collection_id=? AND media_id=?");
    foreach (array_unique($mediaIds) as $mid) { $still->execute([$rid, $mid]); if (!$still->fetchColumn()) { $del->execute([$rid, $mid]); } }
}

/**
 * Pose des photos (déjà envoyées) dans une version :
 *  - 'new_pages'  : chaque photo devient une nouvelle page à la fin ;
 *  - 'fill'       : dans l'ordre, sur les pages qui n'ont pas encore de photo dans cette version (à partir de la page start_page), le reste en nouvelles pages ;
 *  - 'loose'      : « à ranger » (sans page), pour les associer ensuite une par une.
 */
function recueil_add_images(PDO $pdo, array $data): array
{
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $vid = safe_int($data['version_id'] ?? 0);
    if (!$vid && safe_text($data['new_version'] ?? '') !== '') { $vid = save_recueil_version($pdo, ['recueil_id' => $rid, 'name' => $data['new_version'], 'date_text' => $data['new_version_date'] ?? ''])['id']; }
    $v = $pdo->prepare('SELECT 1 FROM recueil_versions WHERE id=? AND recueil_id=?'); $v->execute([$vid, $rid]);
    if (!$v->fetchColumn()) { throw new RuntimeException('Choisis la version où ranger ces photos.'); }
    $mode = in_array($data['mode'] ?? '', ['new_pages', 'fill', 'loose'], true) ? $data['mode'] : 'new_pages';
    $mediaIds = array_values(array_unique(array_filter(array_map('intval', is_array($data['media_ids'] ?? null) ? $data['media_ids'] : []))));
    if (!$mediaIds) { throw new RuntimeException('Aucune photo.'); }
    $exists = $pdo->prepare("SELECT 1 FROM media WHERE id=?");
    $pos = $pdo->prepare('SELECT COALESCE(MAX(position),0) FROM recueil_images WHERE version_id=?'); $pos->execute([$vid]); $ipos = (float) $pos->fetchColumn();
    $pp = $pdo->prepare('SELECT COALESCE(MAX(position),0) FROM recueil_pages WHERE recueil_id=?'); $pp->execute([$rid]); $ppos = (float) $pp->fetchColumn();
    $free = [];
    if ($mode === 'fill') {
        $start = max(1, safe_int($data['start_page'] ?? 1, 1));
        $s = $pdo->prepare('SELECT p.id FROM recueil_pages p WHERE p.recueil_id=? ORDER BY p.position, p.id'); $s->execute([$rid]);
        $all = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        $taken = $pdo->prepare("SELECT 1 FROM recueil_images WHERE page_id=? AND version_id=? AND role='page'");
        foreach (array_slice($all, $start - 1) as $pid) { $taken->execute([$pid, $vid]); if (!$taken->fetchColumn()) { $free[] = $pid; } }
    }
    $insPage = $pdo->prepare('INSERT INTO recueil_pages(recueil_id, position) VALUES(?,?)');
    $insImg = $pdo->prepare("INSERT INTO recueil_images(recueil_id, version_id, page_id, media_id, role, position) VALUES(?,?,?,?, 'page', ?)");
    $link = $pdo->prepare("INSERT INTO family_collection_media(collection_type, collection_id, media_id, position, role) SELECT 'recueil', ?, ?, ?, '' WHERE NOT EXISTS (SELECT 1 FROM family_collection_media WHERE collection_type='recueil' AND collection_id=? AND media_id=?)");
    $added = 0; $newPages = 0;
    foreach ($mediaIds as $mid) {
        $exists->execute([$mid]); if (!$exists->fetchColumn()) { continue; }
        $pageId = null;
        if ($mode === 'fill' && $free) { $pageId = array_shift($free); }
        elseif ($mode !== 'loose') { $insPage->execute([$rid, ++$ppos]); $pageId = (int) $pdo->lastInsertId(); $newPages++; }
        $insImg->execute([$rid, $vid, $pageId, $mid, ++$ipos]);
        $link->execute([$rid, $mid, (int) $ipos, $rid, $mid]);
        $added++;
    }
    recueil_touch($pdo, $rid);
    log_change($pdo, 'recueil', $rid, 'images', $added . ' photo(s) ajoutée(s)');
    return ['added' => $added, 'new_pages' => $newPages, 'version_id' => $vid];
}

function recueil_page_owner(PDO $pdo, int $pageId): int
{
    $s = $pdo->prepare('SELECT recueil_id FROM recueil_pages WHERE id=?'); $s->execute([$pageId]); $rid = (int) $s->fetchColumn();
    if (!$rid) { throw new RuntimeException('Page introuvable.'); }
    return $rid;
}

/** Crée ou modifie une page (nom, transcription, notes, image retenue) ; « move » la monte ou la descend, « after » la place après une autre. */
function save_recueil_page(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if ($id) { $rid = recueil_page_owner($pdo, $id); }
    else {
        $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
        $after = safe_int($data['after'] ?? 0);
        if (!empty($data['at_start'])) { $s = $pdo->prepare('SELECT COALESCE(MIN(position),1)-1 FROM recueil_pages WHERE recueil_id=?'); $s->execute([$rid]); $pos = (float) $s->fetchColumn(); }
        elseif ($after) { $s = $pdo->prepare('SELECT position FROM recueil_pages WHERE id=? AND recueil_id=?'); $s->execute([$after, $rid]); $p = (float) $s->fetchColumn();
            $n = $pdo->prepare('SELECT MIN(position) FROM recueil_pages WHERE recueil_id=? AND position>?'); $n->execute([$rid, $p]); $next = $n->fetchColumn(); $pos = $next !== null && $next !== false ? ($p + (float) $next) / 2 : $p + 1; }
        else { $s = $pdo->prepare('SELECT COALESCE(MAX(position),0)+1 FROM recueil_pages WHERE recueil_id=?'); $s->execute([$rid]); $pos = (float) $s->fetchColumn(); }
        $pdo->prepare('INSERT INTO recueil_pages(recueil_id, position) VALUES(?,?)')->execute([$rid, $pos]);
        $id = (int) $pdo->lastInsertId();
    }
    foreach (['label' => 200, 'transcription' => 200000, 'notes' => 20000] as $k => $max) {
        if (array_key_exists($k, $data)) { $pdo->prepare("UPDATE recueil_pages SET $k=? WHERE id=?")->execute([mb_substr((string) ($data[$k] ?? ''), 0, $max), $id]); }
    }
    if (array_key_exists('table', $data)) {
        $t = is_array($data['table']) ? recueil_clean_table($data['table']) : null;
        $pdo->prepare('UPDATE recueil_pages SET table_json=? WHERE id=?')->execute([$t ? json_encode($t, JSON_UNESCAPED_UNICODE) : '', $id]);
    }
    if (array_key_exists('best_image_id', $data)) {
        $best = safe_int($data['best_image_id']);
        if ($best) { $s = $pdo->prepare('SELECT 1 FROM recueil_images WHERE id=? AND page_id=?'); $s->execute([$best, $id]); if (!$s->fetchColumn()) { throw new RuntimeException('Cette photo n’est pas sur cette page.'); } }
        $pdo->prepare('UPDATE recueil_pages SET best_image_id=? WHERE id=?')->execute([$best ?: null, $id]);
    }
    if (isset($data['move'])) { recueil_move($pdo, 'recueil_pages', $id, $rid, safe_int($data['move'])); }
    if (isset($data['to_index'])) { recueil_page_to_index($pdo, $rid, $id, safe_int($data['to_index'])); }
    recueil_touch($pdo, $rid);
    return ['id' => $id];
}

/** Déplace une page à la place n (1 = première). */
function recueil_page_to_index(PDO $pdo, int $rid, int $id, int $index): void
{
    $s = $pdo->prepare('SELECT id FROM recueil_pages WHERE recueil_id=? ORDER BY position, id'); $s->execute([$rid]);
    $ids = array_values(array_filter(array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)), static fn($x) => $x !== $id));
    array_splice($ids, max(0, min(count($ids), $index - 1)), 0, [$id]);
    $u = $pdo->prepare('UPDATE recueil_pages SET position=? WHERE id=?');
    foreach ($ids as $k => $x) { $u->execute([$k + 1, $x]); }
}

/** Supprime une page : ses photos ne sont pas perdues, elles passent « à ranger ». */
function delete_recueil_page(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0); $rid = recueil_page_owner($pdo, $id);
    $pdo->prepare('UPDATE recueil_images SET page_id=NULL WHERE page_id=?')->execute([$id]);
    // Un rattachement « de telle page à telle page » garde sa plage : il se resserre sur la page qui reste
    // Un rattachement qui ne visait que cette page (une page, une ligne de son tableau) n'a plus d'objet
    $pdo->prepare('DELETE FROM recueil_links WHERE page_from=? AND (page_to=? OR page_to IS NULL)')->execute([$id, $id]);
    $pdo->prepare('UPDATE recueil_links SET page_from=page_to, page_to=NULL WHERE page_from=?')->execute([$id]);
    $pdo->prepare('UPDATE recueil_links SET page_to=NULL WHERE page_to=?')->execute([$id]);
    $pdo->prepare('DELETE FROM recueil_pages WHERE id=?')->execute([$id]);
    recueil_touch($pdo, $rid);
    return ['deleted' => true];
}

/**
 * Change une photo : page (0 = à ranger, -1 = nouvelle page juste après after_page), vue entière ou détail, version, note, place dans la version.
 */
function update_recueil_image(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM recueil_images WHERE id=?'); $s->execute([$id]); $img = $s->fetch();
    if (!$img) { throw new RuntimeException('Photo introuvable.'); }
    $rid = (int) $img['recueil_id'];
    if (array_key_exists('page_id', $data)) {
        $pid = safe_int($data['page_id']);
        // -1 : nouvelle page après after_page (0 : à la fin) ; -2 : nouvelle page au début
        if ($pid === -1 || $pid === -2) { $pid = save_recueil_page($pdo, $pid === -2 ? ['recueil_id' => $rid, 'at_start' => true] : ['recueil_id' => $rid, 'after' => safe_int($data['after_page'] ?? 0)])['id']; }
        elseif ($pid > 0 && recueil_page_owner($pdo, $pid) !== $rid) { throw new RuntimeException('Cette page est dans un autre recueil.'); }
        $pdo->prepare('UPDATE recueil_pages SET best_image_id=NULL WHERE best_image_id=? AND id IS NOT ?')->execute([$id, $pid ?: null]);
        $pdo->prepare('UPDATE recueil_images SET page_id=? WHERE id=?')->execute([$pid ?: null, $id]);
    }
    if (isset($data['role'])) { $pdo->prepare('UPDATE recueil_images SET role=? WHERE id=?')->execute([in_array($data['role'], RECUEIL_ROLES, true) ? $data['role'] : 'page', $id]); }
    if (array_key_exists('tray', $data)) { $pdo->prepare('UPDATE recueil_images SET tray=? WHERE id=?')->execute([mb_substr(safe_text($data['tray']), 0, 120), $id]); }
    if (array_key_exists('note', $data)) { $pdo->prepare('UPDATE recueil_images SET note=? WHERE id=?')->execute([mb_substr(safe_text($data['note']), 0, 2000), $id]); }
    if (isset($data['version_id'])) {
        $v = $pdo->prepare('SELECT 1 FROM recueil_versions WHERE id=? AND recueil_id=?'); $v->execute([safe_int($data['version_id']), $rid]);
        if (!$v->fetchColumn()) { throw new RuntimeException('Version introuvable.'); }
        $pdo->prepare('UPDATE recueil_images SET version_id=? WHERE id=?')->execute([safe_int($data['version_id']), $id]);
    }
    if (isset($data['move'])) {
        $s = $pdo->prepare('SELECT id FROM recueil_images WHERE version_id=? ORDER BY position, id'); $s->execute([(int) ($data['version_id'] ?? $img['version_id'])]);
        $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)); $i = array_search($id, $ids, true); $j = $i === false ? false : $i + (safe_int($data['move']) < 0 ? -1 : 1);
        if ($i !== false && $j >= 0 && $j < count($ids)) { [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]]; $u = $pdo->prepare('UPDATE recueil_images SET position=? WHERE id=?'); foreach ($ids as $k => $x) { $u->execute([$k + 1, $x]); } }
    }
    recueil_touch($pdo, $rid);
    $s = $pdo->prepare('SELECT page_id FROM recueil_images WHERE id=?'); $s->execute([$id]);
    return ['id' => $id, 'page_id' => (int) $s->fetchColumn()];
}

/** Retire une photo du recueil (elle reste dans Médias). */
function remove_recueil_image(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT recueil_id, media_id FROM recueil_images WHERE id=?'); $s->execute([$id]); $img = $s->fetch();
    if (!$img) { throw new RuntimeException('Photo introuvable.'); }
    $pdo->prepare('UPDATE recueil_pages SET best_image_id=NULL WHERE best_image_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM recueil_images WHERE id=?')->execute([$id]);
    recueil_unlink_media($pdo, (int) $img['recueil_id'], [(int) $img['media_id']]);
    recueil_touch($pdo, (int) $img['recueil_id']);
    return ['deleted' => true];
}

/** Nom affiché de ce à quoi un recueil est rattaché. */
function recueil_entity_label(PDO $pdo, string $type, string $key): ?array
{
    try {
        switch ($type) {
            case 'person': $s = $pdo->prepare('SELECT p.first_name, p.last_name, ' . RECUEIL_PERSON_YEARS . ' FROM persons p WHERE p.id=?'); $s->execute([(int) $key]); $p = $s->fetch();
                return $p ? ['label' => trim($p['first_name'] . ' ' . $p['last_name']) ?: 'Personne', 'extra' => ($p['birth_year'] || $p['death_year']) ? '(' . ($p['birth_year'] ?: '?') . '–' . ($p['death_year'] ?: '') . ')' : ''] : null;
            case 'investigation': $s = $pdo->prepare('SELECT title FROM investigations WHERE id=?'); $s->execute([(int) $key]); $t = $s->fetchColumn(); return $t !== false ? ['label' => (string) $t, 'extra' => ''] : null;
            case 'atelier_project': $s = $pdo->prepare('SELECT title FROM atelier_projects WHERE id=?'); $s->execute([(int) $key]); $t = $s->fetchColumn(); return $t !== false ? ['label' => (string) $t, 'extra' => ''] : null;
            case 'battue': $s = $pdo->prepare('SELECT title FROM battues WHERE id=?'); $s->execute([(int) $key]); $t = $s->fetchColumn(); return $t !== false ? ['label' => (string) $t, 'extra' => ''] : null;
            case 'village': return ['label' => '', 'extra' => ''];
        }
    } catch (Throwable $_) {}
    return null;
}

function recueil_links_resolved(PDO $pdo, int $rid, array $pages): array
{
    $num = []; foreach ($pages as $p) { $num[$p['id']] = $p['num']; }
    $s = $pdo->prepare('SELECT * FROM recueil_links WHERE recueil_id=? ORDER BY entity_type, id'); $s->execute([$rid]);
    $out = [];
    foreach ($s->fetchAll() as $l) {
        $e = recueil_entity_label($pdo, $l['entity_type'], $l['entity_key']);
        if ($e === null) { continue; } // fiche, enquête… supprimée depuis
        $out[] = ['id' => (int) $l['id'], 'entity_type' => $l['entity_type'], 'entity_key' => $l['entity_key'], 'type_label' => RECUEIL_LINK_TYPES[$l['entity_type']] ?? $l['entity_type'],
            'label' => $e['label'] ?: $l['label'], 'extra' => $e['extra'], 'note' => $l['note'],
            'page_from' => $l['page_from'] !== null ? (int) $l['page_from'] : null, 'page_to' => $l['page_to'] !== null ? (int) $l['page_to'] : null, 'folder_id' => isset($l['folder_id']) && $l['folder_id'] !== null ? (int) $l['folder_id'] : null,
            'from_num' => $l['page_from'] !== null ? ($num[(int) $l['page_from']] ?? null) : null, 'to_num' => $l['page_to'] !== null ? ($num[(int) $l['page_to']] ?? null) : null];
    }
    return $out;
}

/** Rattache tout le recueil (sans pages) ou de la page « de » à la page « à ». */
function save_recueil_link(PDO $pdo, array $data): array
{
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $type = (string) ($data['entity_type'] ?? '');
    if (!isset(RECUEIL_LINK_TYPES[$type])) { throw new RuntimeException('Rattachement inconnu.'); }
    $key = mb_substr(safe_text($data['entity_key'] ?? ''), 0, 200);
    if ($key === '' || recueil_entity_label($pdo, $type, $key) === null) { throw new RuntimeException('Choisis à quoi rattacher le recueil.'); }
    $from = safe_int($data['page_from'] ?? 0); $to = safe_int($data['page_to'] ?? 0);
    foreach ([$from, $to] as $p) { if ($p && recueil_page_owner($pdo, $p) !== $rid) { throw new RuntimeException('Page d’un autre recueil.'); } }
    if ($from && !$to) { $to = $from; }
    if ($to && !$from) { $from = $to; }
    if ($from && $to) { // dans le bon sens
        $pos = $pdo->prepare('SELECT position FROM recueil_pages WHERE id=?');
        $pos->execute([$from]); $a = (float) $pos->fetchColumn(); $pos->execute([$to]); $b = (float) $pos->fetchColumn();
        if ($a > $b) { [$from, $to] = [$to, $from]; }
    }
    $label = mb_substr(safe_text($data['label'] ?? ''), 0, 200);
    $note = mb_substr(safe_text($data['note'] ?? ''), 0, 2000);
    $id = safe_int($data['id'] ?? 0);
    $folder = isset($data['folder_id']) && $data['folder_id'] !== '' && $data['folder_id'] !== null ? safe_int($data['folder_id']) : null; // NULL : partout
    if ($id) { $pdo->prepare('UPDATE recueil_links SET entity_type=?, entity_key=?, page_from=?, page_to=?, label=?, note=?' . (array_key_exists('folder_id', $data) ? ', folder_id=?' : '') . ' WHERE id=? AND recueil_id=?')
        ->execute(array_merge([$type, $key, $from ?: null, $to ?: null, $label, $note], array_key_exists('folder_id', $data) ? [$folder] : [], [$id, $rid])); }
    else { $pdo->prepare('INSERT INTO recueil_links(recueil_id, entity_type, entity_key, page_from, page_to, label, note, folder_id) VALUES(?,?,?,?,?,?,?,?)')->execute([$rid, $type, $key, $from ?: null, $to ?: null, $label, $note, $folder]); $id = (int) $pdo->lastInsertId(); }
    recueil_touch($pdo, $rid);
    return ['id' => $id];
}

function delete_recueil_link(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM recueil_links WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['deleted' => true];
}

/** Les recueils rattachés à une fiche, un village, une enquête, un projet… avec les pages concernées (vignettes). */
function recueils_for_entity(PDO $pdo, string $type, string $key): array
{
    if (!isset(RECUEIL_LINK_TYPES[$type]) || $key === '') { return []; }
    try {
        $s = $pdo->prepare('SELECT l.*, r.title, r.icon, r.reference FROM recueil_links l JOIN recueils r ON r.id=l.recueil_id WHERE l.entity_type=? AND l.entity_key=? ORDER BY r.title COLLATE NOCASE, l.id');
        $s->execute([$type, $key]);
        $rows = $s->fetchAll();
    } catch (Throwable $_) { return []; }
    $out = [];
    foreach ($rows as $l) {
        $rid = (int) $l['recueil_id'];
        $d = recueil_detail($pdo, $rid);
        $pages = $d['pages'];
        $fromN = $toN = null;
        foreach ($pages as $p) { if ($p['id'] === (int) $l['page_from']) { $fromN = $p['num']; } if ($p['id'] === (int) $l['page_to']) { $toN = $p['num']; } }
        $sel = $fromN ? array_values(array_filter($pages, static fn($p) => $p['num'] >= $fromN && $p['num'] <= ($toN ?: $fromN))) : $pages;
        $img = []; foreach ($d['images'] as $i) { $img[$i['id']] = $i; }
        $thumbs = [];
        foreach (array_slice($sel, 0, 8) as $p) { $i = $img[$p['shown_image_id']] ?? null; $thumbs[] = ['page_id' => $p['id'], 'num' => $p['num'], 'label' => $p['label'], 'thumbnail' => $i['thumbnail'] ?? '', 'filename' => $i['filename'] ?? ''] ; }
        $out[] = ['link_id' => (int) $l['id'], 'recueil_id' => $rid, 'title' => $l['title'], 'icon' => $l['icon'], 'reference' => $l['reference'], 'note' => $l['note'],
            'from_num' => $fromN, 'to_num' => $toN, 'pages' => count($sel), 'total_pages' => count($pages), 'folder_id' => isset($l['folder_id']) && $l['folder_id'] !== null ? (int) $l['folder_id'] : null,
            'transcribed' => count(array_filter($sel, static fn($p) => trim($p['transcription']) !== '')), 'thumbs' => $thumbs];
    }
    return $out;
}

/** Recherche pour le rattachement : fiches, enquêtes, projets, battues, villages. */
function recueil_search_entities(PDO $pdo, string $type, string $q): array
{
    $q = trim($q); $like = '%' . $q . '%'; $out = [];
    try {
        if ($type === 'person') {
            $s = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, " . RECUEIL_PERSON_YEARS . " FROM persons p WHERE (p.first_name || ' ' || p.last_name) LIKE ? OR (p.last_name || ' ' || p.first_name) LIKE ? ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 30");
            $s->execute([$like, $like]);
            foreach ($s as $p) { $out[] = ['key' => (string) $p['id'], 'label' => trim($p['first_name'] . ' ' . $p['last_name']), 'extra' => ($p['birth_year'] || $p['death_year']) ? ($p['birth_year'] ?: '?') . '–' . ($p['death_year'] ?: '') : '']; }
        } elseif ($type === 'investigation' || $type === 'atelier_project' || $type === 'battue') {
            $table = ['investigation' => 'investigations', 'atelier_project' => 'atelier_projects', 'battue' => 'battues'][$type];
            $s = $pdo->prepare("SELECT id, title FROM $table WHERE title LIKE ? ORDER BY title COLLATE NOCASE LIMIT 30"); $s->execute([$like]);
            foreach ($s as $r) { $out[] = ['key' => (string) $r['id'], 'label' => (string) $r['title'], 'extra' => '']; }
        } elseif ($type === 'village' && function_exists('villages_list')) {
            foreach (array_slice(villages_list($pdo, $q), 0, 30) as $v) { $out[] = ['key' => (string) $v['key'], 'label' => (string) $v['name'], 'extra' => trim((string) ($v['county'] ?? ''))]; }
        }
    } catch (Throwable $_) {}
    return ['results' => $out];
}

/** Place d'un recueil rattaché à une enquête : un dossier (0 = racine), ou partout (vide). */
function move_recueil_link(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $folder = isset($data['folder_id']) && $data['folder_id'] !== '' && $data['folder_id'] !== null ? safe_int($data['folder_id']) : null;
    $pdo->prepare('UPDATE recueil_links SET folder_id=? WHERE id=?')->execute([$folder, $id]);
    return ['id' => $id, 'folder_id' => $folder];
}

/** Les dossiers de « À ranger » (premier tri des photos) : noms dans l'ordre. Un dossier retiré rend ses photos « sans dossier ». */
function save_recueil_trays(PDO $pdo, array $data): array
{
    $rid = safe_int($data['recueil_id'] ?? 0); recueil_row($pdo, $rid);
    $names = [];
    foreach (array_slice(is_array($data['trays'] ?? null) ? $data['trays'] : [], 0, 200) as $n) { $n = mb_substr(safe_text(is_scalar($n) ? (string) $n : ''), 0, 120); if ($n !== '' && !in_array($n, $names, true)) { $names[] = $n; } }
    $pdo->prepare('UPDATE recueils SET trays=? WHERE id=?')->execute([json_encode($names, JSON_UNESCAPED_UNICODE), $rid]);
    if (is_array($data['rename'] ?? null) && isset($data['rename']['from'], $data['rename']['to'])) {
        $pdo->prepare('UPDATE recueil_images SET tray=? WHERE recueil_id=? AND tray=?')->execute([mb_substr(safe_text($data['rename']['to']), 0, 120), $rid, safe_text($data['rename']['from'])]);
    }
    if ($names) { $in = implode(',', array_fill(0, count($names), '?')); $pdo->prepare("UPDATE recueil_images SET tray='' WHERE recueil_id=? AND tray<>'' AND tray NOT IN ($in)")->execute([$rid, ...$names]); }
    else { $pdo->prepare("UPDATE recueil_images SET tray='' WHERE recueil_id=?")->execute([$rid]); }
    recueil_touch($pdo, $rid);
    return ['trays' => $names];
}

/**
 * Où rattacher une image d'un recueil (« juste cette image ») : pour une fiche, ses médias ou un de ses blocs
 * (résistance, carte d'électeur, voyages, placements, armoiries, papiers, inventaires, blocs créés) ; pour une enquête,
 * la racine ou un dossier ; pour un projet de l'Atelier, la racine ou un dossier ; pour une battue, une de ses recherches.
 */
function recueil_media_targets(PDO $pdo, string $type, string $key): array
{
    $out = []; $add = static function (string $v, string $l) use (&$out): void { $out[] = ['value' => $v, 'label' => $l]; };
    $id = (int) $key;
    $yr = static fn(...$v) => trim(implode(' ', array_filter(array_map(static fn($x) => trim((string) $x), $v))));
    try {
        if ($type === 'person') {
            $add("person:$id", '🖼️ Médias de la fiche');
            $add("collection:resistance:$id", '🎖️ Bloc « Résistance »');
            $add("collection:voter:$id", '🗳️ Bloc « Cartes d’électeur »');
            foreach (voyages_data($pdo, $id) as $v) { $add('collection:voyage:' . $v['id'], '🚢 Voyage : ' . ($yr($v['departure_port'] ? 'de ' . $v['departure_port'] : '', $v['destination'] ? 'vers ' . $v['destination'] : '', $v['departure_year'] ? '(' . $v['departure_year'] . ')' : '') ?: 'n° ' . $v['id'])); }
            foreach (placements_data($pdo, $id) as $v) { $add('collection:placement:' . $v['id'], '🧒 Placement : ' . ($yr($v['institution'] ?? '', $v['place_text'] ?? '', ($v['start_year'] ?? '') ? '(' . $v['start_year'] . ')' : '') ?: 'n° ' . $v['id'])); }
            foreach (coats_of_arms_data($pdo, $id) as $v) { $add('collection:coat_of_arms:' . $v['id'], '🛡️ Armoiries : ' . ($v['title'] ?: 'n° ' . $v['id'])); }
            foreach (family_papers_data($pdo, '', $id) as $v) { $add('collection:family_paper:' . $v['id'], '📜 Papier de famille : ' . ($yr($v['class_number'] ?? '', $v['title'] ?? '') ?: 'n° ' . $v['id'])); }
            foreach (probate_inventories_data($pdo, $id) as $v) { $add('collection:probate_inventory:' . $v['id'], '⚖️ Inventaire après décès : ' . ($yr($v['date_text'] ?? '', $v['notary'] ? 'chez ' . $v['notary'] : '') ?: 'n° ' . $v['id'])); }
            if (function_exists('custom_blocks_for_person')) {
                foreach (custom_blocks_for_person($pdo, $id) as $b) {
                    foreach ($b['entries'] ?? [] as $k => $e) {
                        $first = ''; foreach ($e['data'] ?? [] as $val) { if (is_scalar($val) && trim((string) $val) !== '') { $first = mb_substr(trim((string) $val), 0, 60); break; } }
                        $add('collection:custom_block_entry:' . $e['id'], ($b['icon'] ?? '🧩') . ' Bloc « ' . ($b['name'] ?? 'Bloc') . ' » : ' . ($first ?: 'entrée ' . ($k + 1)));
                    }
                }
            }
        } elseif ($type === 'investigation') {
            $add("investigation:$id:0", '📂 Racine de l’enquête');
            $s = $pdo->prepare('SELECT id, name FROM investigation_media_folders WHERE investigation_id=? ORDER BY name COLLATE NOCASE'); $s->execute([$id]);
            foreach ($s as $f) { $add("investigation:$id:" . $f['id'], '📁 ' . $f['name']); }
        } elseif ($type === 'atelier_project') {
            $add("atelier:$id:0", '📂 Racine du projet');
            $s = $pdo->prepare('SELECT id, name FROM atelier_folders WHERE project_id=? ORDER BY position, id'); $s->execute([$id]);
            foreach ($s as $f) { $add("atelier:$id:" . $f['id'], '📁 ' . $f['name']); }
        } elseif ($type === 'battue') {
            $s = $pdo->prepare('SELECT i.id, i.record_type, i.period, i.title, c.name FROM battue_search_items i LEFT JOIN commune_contours c ON c.insee_code=i.insee_code WHERE i.battue_id=? ORDER BY c.name COLLATE NOCASE, i.id'); $s->execute([$id]);
            foreach ($s as $i) { $add('battue_item:' . $i['id'], '🔎 ' . ($yr($i['name'] ?? '', $i['record_type'] ?? '', $i['period'] ?? '', $i['title'] ? '— ' . $i['title'] : '') ?: 'Recherche n° ' . $i['id'])); }
        } elseif ($type === 'village') {
            $add('village:' . $key, '🏘️ Photos de la fiche du village');
        }
    } catch (Throwable $_) {}
    return ['targets' => $out];
}

/** Rattache une image (un média) d'un recueil à une cible de recueil_media_targets. */
function recueil_link_media(PDO $pdo, array $data): array
{
    $mid = safe_int($data['media_id'] ?? 0);
    $m = $pdo->prepare('SELECT id, title FROM media WHERE id=?'); $m->execute([$mid]); $media = $m->fetch();
    if (!$media) { throw new RuntimeException('Image introuvable.'); }
    $parts = explode(':', (string) ($data['target'] ?? ''));
    $kind = $parts[0] ?? '';
    $already = false;
    switch ($kind) {
        case 'person':
            $pid = (int) ($parts[1] ?? 0);
            if (!recueil_entity_label($pdo, 'person', (string) $pid)) { throw new RuntimeException('Fiche introuvable.'); }
            $e = $pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=?"); $e->execute([$mid, $pid]);
            if ($e->fetchColumn()) { $already = true; break; }
            $pos = $pdo->prepare("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?"); $pos->execute([$pid]);
            $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$mid, $pid, (int) $pos->fetchColumn()]);
            break;
        case 'collection':
            $ctype = (string) ($parts[1] ?? ''); $cid = (int) ($parts[2] ?? 0);
            if (!in_array($ctype, ['resistance', 'voter', 'voyage', 'placement', 'coat_of_arms', 'family_paper', 'probate_inventory', 'custom_block_entry'], true) || !$cid) { throw new RuntimeException('Bloc inconnu.'); }
            $e = $pdo->prepare('SELECT 1 FROM family_collection_media WHERE collection_type=? AND collection_id=? AND media_id=?'); $e->execute([$ctype, $cid, $mid]);
            if ($e->fetchColumn()) { $already = true; break; }
            link_collection_media($pdo, ['collection_type' => $ctype, 'collection_id' => $cid, 'media_id' => $mid]);
            if (in_array($ctype, ['resistance', 'voter'], true)) { // le bloc de la fiche s'affiche dès qu'il a une photo
                $flag = $ctype === 'resistance' ? 'show_resistance_block' : 'show_voter_block';
                try { $pdo->prepare("UPDATE persons SET $flag=1 WHERE id=?")->execute([$cid]); } catch (Throwable $_) {}
            }
            break;
        case 'investigation':
            $iid = (int) ($parts[1] ?? 0); $fid = (int) ($parts[2] ?? 0);
            $e = $pdo->prepare('SELECT 1 FROM investigation_media WHERE investigation_id=? AND media_id=?'); $e->execute([$iid, $mid]);
            if ($e->fetchColumn()) { $already = true; break; }
            link_investigation_media($pdo, ['investigation_id' => $iid, 'media_ids' => [$mid], 'folder_id' => $fid, 'verdict' => 'interesting', 'reason' => mb_substr(safe_text($data['note'] ?? ''), 0, 500)]);
            break;
        case 'battue_item':
            $bid = (int) ($parts[1] ?? 0);
            $e = $pdo->prepare('SELECT 1 FROM battue_search_items WHERE id=?'); $e->execute([$bid]); if (!$e->fetchColumn()) { throw new RuntimeException('Recherche de battue introuvable.'); }
            $e = $pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='battue_item' AND entity_id=?"); $e->execute([$mid, $bid]);
            if ($e->fetchColumn()) { $already = true; break; }
            $pos = $pdo->prepare("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='battue_item' AND entity_id=?"); $pos->execute([$bid]);
            $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'battue_item', ?, ?)")->execute([$mid, $bid, (int) $pos->fetchColumn()]);
            break;
        case 'atelier':
            $pid = (int) ($parts[1] ?? 0); $fid = (int) ($parts[2] ?? 0);
            $item = save_atelier_item($pdo, ['project_id' => $pid, 'type' => 'media', 'title' => mb_substr(safe_text($data['title'] ?? '') ?: ((string) $media['title'] ?: 'Image d’un recueil'), 0, 300),
                'data' => ['caption' => mb_substr(safe_text($data['note'] ?? ''), 0, 4000)], 'folder_ids' => $fid ? [$fid] : []]);
            link_collection_media($pdo, ['collection_type' => 'atelier_item', 'collection_id' => (int) $item['id'], 'media_id' => $mid]);
            break;
        case 'village':
            $key = implode(':', array_slice($parts, 1));
            if (!function_exists('village_profile') || $key === '' || !village_place_ids($pdo, $key)) { throw new RuntimeException('Village introuvable.'); }
            $vp = (int) village_profile($pdo, $key)['id'];
            if (!$vp) { $pdo->prepare('INSERT INTO village_profiles(place_key, name, updated_at) VALUES(?,?,CURRENT_TIMESTAMP)')->execute([$key, mb_substr(safe_text($data['label'] ?? ''), 0, 200)]); $vp = (int) $pdo->lastInsertId(); }
            $e = $pdo->prepare("SELECT 1 FROM family_collection_media WHERE collection_type='village' AND collection_id=? AND media_id=?"); $e->execute([$vp, $mid]);
            if ($e->fetchColumn()) { $already = true; break; }
            link_collection_media($pdo, ['collection_type' => 'village', 'collection_id' => $vp, 'media_id' => $mid]);
            break;
        default: throw new RuntimeException('Choisis où rattacher l’image.');
    }
    if (!$already) { log_change($pdo, 'media', $mid, 'link-media', 'Image d’un recueil rattachée : ' . $kind); }
    return ['ok' => true, 'already' => $already];
}

/** Ce à quoi une image est déjà rattachée (pour l'afficher sous l'image dans la page du recueil). */
function recueil_media_owners(PDO $pdo, int $mediaId): array
{
    if (!function_exists('media_av_list')) { return ['owners' => []]; }
    $out = [];
    try {
        $s = $pdo->prepare("SELECT ml.entity_type, ml.entity_id FROM media_links ml WHERE ml.media_id=?"); $s->execute([$mediaId]);
        foreach ($s as $l) {
            if ($l['entity_type'] === 'person') { $e = recueil_entity_label($pdo, 'person', (string) $l['entity_id']); if ($e) { $out[] = ['label' => 'Fiche', 'name' => $e['label'], 'person_id' => (int) $l['entity_id']]; } }
            elseif ($l['entity_type'] === 'battue_item') { $b = $pdo->prepare('SELECT b.title FROM battue_search_items i JOIN battues b ON b.id=i.battue_id WHERE i.id=?'); $b->execute([(int) $l['entity_id']]); $t = $b->fetchColumn(); if ($t !== false) { $out[] = ['label' => 'Battue', 'name' => (string) $t]; } }
        }
        $s = $pdo->prepare('SELECT i.id, i.title FROM investigation_media m JOIN investigations i ON i.id=m.investigation_id WHERE m.media_id=?'); $s->execute([$mediaId]);
        foreach ($s as $r) { $out[] = ['label' => 'Enquête', 'name' => (string) $r['title'], 'investigation_id' => (int) $r['id']]; }
        $s = $pdo->prepare("SELECT collection_type, collection_id FROM family_collection_media WHERE media_id=? AND collection_type<>'recueil'"); $s->execute([$mediaId]);
        foreach ($s as $r) {
            $name = in_array($r['collection_type'], ['resistance', 'voter'], true) ? (recueil_entity_label($pdo, 'person', (string) $r['collection_id'])['label'] ?? '') : '';
            if ($r['collection_type'] === 'atelier_item') { $a = $pdo->prepare('SELECT p.title FROM atelier_items i JOIN atelier_projects p ON p.id=i.project_id WHERE i.id=?'); $a->execute([(int) $r['collection_id']]); $name = (string) ($a->fetchColumn() ?: ''); }
            $out[] = ['label' => MEDIA_AV_COLLECTIONS[$r['collection_type']] ?? 'Bloc', 'name' => $name];
        }
        $seen = []; $out = array_values(array_filter($out, static function ($o) use (&$seen) { $k = $o['label'] . '|' . $o['name']; if (isset($seen[$k])) { return false; } return $seen[$k] = true; }));
    } catch (Throwable $_) {}
    return ['owners' => $out];
}

/**
 * Tableur d'une page : {locked, cols:[{id, name}], rows:[{id, c:{colId: texte}, person:{id, name, link}}], merges:[{r, c, rs, cs}]}.
 * Les identifiants de lignes et de colonnes restent les mêmes quand on les déplace ; une fusion part d'une cellule (r, c) sur rs lignes et cs colonnes.
 */
function recueil_clean_table(array $t): ?array
{
    $id = static fn($v) => mb_substr(preg_replace('/[^A-Za-z0-9_-]/', '', (string) $v), 0, 24);
    $cols = []; $colIds = [];
    foreach (array_slice(is_array($t['cols'] ?? null) ? $t['cols'] : [], 0, 80) as $c) {
        if (!is_array($c) || ($cid = $id($c['id'] ?? '')) === '' || isset($colIds[$cid])) { continue; }
        $colIds[$cid] = true; $cols[] = ['id' => $cid, 'name' => mb_substr(safe_text((string) ($c['name'] ?? '')), 0, 200)];
    }
    if (!$cols) { return null; }
    $rows = []; $rowIds = [];
    foreach (array_slice(is_array($t['rows'] ?? null) ? $t['rows'] : [], 0, 5000) as $r) {
        if (!is_array($r) || ($rid = $id($r['id'] ?? '')) === '' || isset($rowIds[$rid])) { continue; }
        $rowIds[$rid] = true;
        $cells = [];
        foreach (is_array($r['c'] ?? null) ? $r['c'] : [] as $k => $v) { if (isset($colIds[$k]) && is_scalar($v) && (string) $v !== '') { $cells[$k] = mb_substr(str_replace("\r", '', (string) $v), 0, 4000); } }
        $row = ['id' => $rid, 'c' => (object) $cells];
        if (is_array($r['person'] ?? null) && safe_int($r['person']['id'] ?? 0)) { $row['person'] = ['id' => safe_int($r['person']['id']), 'name' => mb_substr(safe_text((string) ($r['person']['name'] ?? '')), 0, 200), 'link' => safe_int($r['person']['link'] ?? 0)]; }
        $rows[] = $row;
    }
    $merges = [];
    foreach (array_slice(is_array($t['merges'] ?? null) ? $t['merges'] : [], 0, 2000) as $m) {
        if (!is_array($m)) { continue; }
        $r = $id($m['r'] ?? ''); $c = $id($m['c'] ?? ''); $rs = max(1, min(5000, safe_int($m['rs'] ?? 1, 1))); $cs = max(1, min(80, safe_int($m['cs'] ?? 1, 1)));
        if (isset($rowIds[$r], $colIds[$c]) && ($rs > 1 || $cs > 1)) { $merges[] = ['r' => $r, 'c' => $c, 'rs' => $rs, 'cs' => $cs]; }
    }
    return ['v' => 1, 'locked' => !empty($t['locked']), 'cols' => $cols, 'rows' => $rows, 'merges' => $merges];
}
