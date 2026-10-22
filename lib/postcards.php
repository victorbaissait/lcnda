<?php
declare(strict_types=1);

/**
 * 🏞 Cartes postales anciennes (F8 ; écran : assets/js/heritage-postcards.js).
 *
 * Ce qui existait déjà et qu'on garde tel quel : le média (sorte « carte postale » des correspondances, envoi « recto/verso »
 * qui range les deux images dans un même postcard_group), la visionneuse qui passe du recto au verso, la transcription d'un
 * média (atelier 📜, media.transcription). Ce fichier ajoute la fiche de la carte : table postcards (structure n°51,
 * lib/migrations.php) — recto et verso, éditeur, numéro, date d'envoi, cachet, qui l'a écrite et à qui (fiche ou nom libre),
 * adresse, lieu montré, point de vue et direction (angle de vue sur la Carte), notes. Le texte du dos n'est pas recopié :
 * c'est la transcription du média du verso (ou du recto s'il n'y a pas de verso), lue et écrite au même endroit que la
 * visionneuse et l'atelier de transcription.
 *
 *   GET  api.php?action=postcards[&place_id=N]   → {postcards: [...], candidates: [...]} (candidates : médias qui sont des
 *                                                   cartes postales mais n'ont pas encore leur fiche)
 *   POST api.php?action=postcard_write {op: save | delete | restore, …, csrf}
 *
 * Tout ce qui arrive du navigateur est relu (numéros vérifiés en base, textes bornés, angle 0–360, coordonnées valides) ;
 * requêtes préparées ; mode consultation : écritures refusées par kiosk_guard() (api.php).
 */

const POSTCARD_TEXT_MAX = 300;
const POSTCARD_NOTES_MAX = 8000;
const POSTCARD_BACK_MAX = 50000;

/** La table existe déjà depuis la migration n°51 ; ceci la crée aussi pour une base qui ne l'aurait pas encore (sans risque). */
function postcards_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $exists = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='postcards'")->fetchColumn();
    if (!$exists) {
        if (!function_exists('schema_v51')) { require_once __DIR__ . '/migrations.php'; }
        schema_v51($pdo);
    }
    $done = true;
}

function pc_text(mixed $v, int $max = POSTCARD_TEXT_MAX, bool $multiline = false): string
{
    $t = str_replace("\0", '', scalar_text($v));
    $t = $multiline ? preg_replace("/\r\n?/", "\n", $t) : preg_replace('/\s+/u', ' ', $t);
    return mb_substr(trim((string) $t), 0, $max);
}

/** Valeur du menu de choix d'une personne : « 12 », « txt:le curé Lafon » ou vide → [id, texte libre]. */
function pc_person_value(PDO $pdo, mixed $v): array
{
    if (is_array($v)) { $v = $v['id'] ?? ($v['txt'] ?? ''); }
    $s = trim(scalar_text($v ?? ''));
    if ($s === '') { return [null, '']; }
    if (str_starts_with($s, 'txt:')) { return [null, pc_text(substr($s, 4), 160)]; }
    $id = safe_int($s);
    if ($id <= 0) { return [null, pc_text($s, 160)]; }
    $c = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $c->execute([$id]);
    if (!$c->fetchColumn()) { throw new LcndaBadInput('Cette personne n’existe plus dans la base.'); }
    return [$id, ''];
}

function pc_media_exists(PDO $pdo, int $id): bool
{
    if ($id <= 0) { return false; }
    $c = $pdo->prepare('SELECT 1 FROM media WHERE id=?'); $c->execute([$id]);
    return (bool) $c->fetchColumn();
}

function pc_num(mixed $v, float $min, float $max): ?float
{
    if ($v === null || $v === '' || is_array($v)) { return null; }
    $s = str_replace(',', '.', trim(scalar_text($v)));
    if (!is_numeric($s)) { return null; }
    $n = (float) $s;
    if (!is_finite($n) || $n < $min || $n > $max) { return null; }
    return round($n, 6);
}

/** Les fiches de cartes postales, avec leurs images, le lieu, les personnes et le texte du dos. */
function postcards_list(PDO $pdo, int $placeId = 0, int $id = 0): array
{
    postcards_ensure($pdo);
    $where = []; $args = [];
    if ($placeId > 0) { $where[] = 'pc.place_id=?'; $args[] = $placeId; }
    if ($id > 0) { $where[] = 'pc.id=?'; $args[] = $id; }
    $name = static fn(string $a) => "trim(replace(COALESCE($a.first_name,'')||' '||COALESCE($a.last_name,''),'  ',' '))";
    $s = $pdo->prepare("SELECT pc.*,
            r.title AS r_title, r.filename AS r_file, r.thumbnail AS r_thumb, r.date_text AS r_date, r.transcription AS r_tr, r.media_type AS r_type,
            v.title AS v_title, v.filename AS v_file, v.thumbnail AS v_thumb, v.transcription AS v_tr,
            pl.name AS pl_name, pl.county AS pl_county, pl.state AS pl_state, pl.country AS pl_country, pl.latitude AS pl_lat, pl.longitude AS pl_lon,
            " . $name('w') . " AS w_name, w.gender AS w_gender, " . $name('d') . " AS d_name, d.gender AS d_gender
        FROM postcards pc JOIN media r ON r.id=pc.media_id LEFT JOIN media v ON v.id=pc.verso_media_id
        LEFT JOIN places pl ON pl.id=pc.place_id LEFT JOIN persons w ON w.id=pc.writer_person_id LEFT JOIN persons d ON d.id=pc.recipient_person_id
        " . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY pc.updated_at DESC, pc.id DESC LIMIT 5000');
    $s->execute($args);
    $out = [];
    foreach ($s->fetchAll() as $r) { $out[] = pc_out($r); }
    return $out;
}

function pc_img(?string $file, ?string $thumb): string
{
    $t = trim((string) $thumb) ?: trim((string) $file);
    return $t !== '' ? 'media/' . rawurlencode($t) : '';
}

function pc_out(array $r): array
{
    $verso = (int) ($r['verso_media_id'] ?? 0);
    $backFromVerso = $verso && trim((string) ($r['v_tr'] ?? '')) !== '';
    $back = $verso ? (string) ($r['v_tr'] ?? '') : (string) ($r['r_tr'] ?? '');
    $year = preg_match('/(?<!\d)(1[5-9]\d\d|20\d\d)(?!\d)/', (string) $r['sent_date'], $m) ? (int) $m[1] : null;
    $lat = $r['view_lat'] !== null ? (float) $r['view_lat'] : ($r['pl_lat'] !== null ? (float) $r['pl_lat'] : null);
    $lon = $r['view_lon'] !== null ? (float) $r['view_lon'] : ($r['pl_lon'] !== null ? (float) $r['pl_lon'] : null);
    return [
        'id' => (int) $r['id'],
        'media_id' => (int) $r['media_id'],
        'title' => trim((string) $r['title']) ?: (trim((string) $r['r_title']) ?: 'Carte postale'),
        'own_title' => (string) $r['title'],
        'recto' => ['id' => (int) $r['media_id'], 'title' => (string) $r['r_title'], 'filename' => (string) $r['r_file'], 'thumb' => pc_img($r['r_file'], $r['r_thumb'])],
        'verso' => $verso ? ['id' => $verso, 'title' => (string) $r['v_title'], 'filename' => (string) $r['v_file'], 'thumb' => pc_img($r['v_file'], $r['v_thumb'])] : null,
        'publisher' => (string) $r['publisher'], 'card_number' => (string) $r['card_number'], 'sent_date' => (string) $r['sent_date'], 'year' => $year,
        'postmark' => (string) $r['postmark'],
        'writer' => $r['writer_person_id'] ? ['id' => (int) $r['writer_person_id'], 'title' => (string) $r['w_name'], 'gender' => (string) $r['w_gender']] : null,
        'writer_text' => (string) $r['writer_text'],
        'recipient' => $r['recipient_person_id'] ? ['id' => (int) $r['recipient_person_id'], 'title' => (string) $r['d_name'], 'gender' => (string) $r['d_gender']] : null,
        'recipient_text' => (string) $r['recipient_text'], 'recipient_address' => (string) $r['recipient_address'],
        'place' => $r['place_id'] ? ['id' => (int) $r['place_id'], 'name' => (string) $r['pl_name'], 'county' => (string) $r['pl_county'], 'state' => (string) $r['pl_state'], 'country' => (string) $r['pl_country'],
            'lat' => $r['pl_lat'] !== null ? (float) $r['pl_lat'] : null, 'lon' => $r['pl_lon'] !== null ? (float) $r['pl_lon'] : null] : null,
        'view_lat' => $r['view_lat'] !== null ? (float) $r['view_lat'] : null, 'view_lon' => $r['view_lon'] !== null ? (float) $r['view_lon'] : null,
        'view_bearing' => $r['view_bearing'] !== null ? (float) $r['view_bearing'] : null,
        'lat' => $lat, 'lon' => $lon,
        'notes' => (string) $r['notes'],
        'back_text' => $back, 'back_on' => $verso ? 'verso' : 'recto', 'back_filled' => trim($back) !== '', 'back_from_verso' => $backFromVerso,
        'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at'],
    ];
}

/** Médias qui sont des cartes postales (envoi recto/verso, ou correspondance « Carte postale ») sans fiche : à compléter. */
function postcards_candidates(PDO $pdo): array
{
    postcards_ensure($pdo);
    $cols = array_column($pdo->query('PRAGMA table_info(media)')->fetchAll(), 'name');
    if (!in_array('postcard_group', $cols, true) || !in_array('correspondence_type', $cols, true)) { return []; }
    $rows = $pdo->query("SELECT m.id, m.title, m.filename, m.thumbnail, m.date_text, m.postcard_group, m.postcard_side,
            (SELECT v.id FROM media v WHERE m.postcard_group<>'' AND v.postcard_group=m.postcard_group AND v.postcard_side='verso' AND v.id<>m.id ORDER BY v.id LIMIT 1) AS verso_id
        FROM media m
        WHERE m.media_type='image' AND (m.postcard_side='recto' OR (m.correspondence_type='carte_postale' AND m.postcard_side<>'verso'))
          AND m.id NOT IN (SELECT media_id FROM postcards) AND m.id NOT IN (SELECT verso_media_id FROM postcards WHERE verso_media_id IS NOT NULL)
        ORDER BY m.id DESC LIMIT 500")->fetchAll();
    $v = $pdo->prepare('SELECT id, title, filename, thumbnail FROM media WHERE id=?');
    return array_map(static function ($r) use ($v) {
        $verso = null;
        if ((int) $r['verso_id']) { $v->execute([(int) $r['verso_id']]); $x = $v->fetch(); if ($x) { $verso = ['id' => (int) $x['id'], 'title' => (string) $x['title'], 'filename' => (string) $x['filename'], 'thumb' => pc_img($x['filename'], $x['thumbnail'])]; } }
        return ['media_id' => (int) $r['id'], 'title' => trim((string) $r['title']) ?: 'Carte postale', 'date_text' => (string) $r['date_text'],
            'recto' => ['id' => (int) $r['id'], 'title' => (string) $r['title'], 'filename' => (string) $r['filename'], 'thumb' => pc_img($r['filename'], $r['thumbnail'])], 'verso' => $verso];
    }, $rows);
}

function postcard_row(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT * FROM postcards WHERE id=?'); $s->execute([$id]);
    return $s->fetch() ?: null;
}

function postcard_save(PDO $pdo, array $d): array
{
    postcards_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $old = $id ? postcard_row($pdo, $id) : null;
    if ($id && !$old) { throw new RuntimeException('Carte postale introuvable.'); }
    $recto = safe_int($d['media_id'] ?? 0);
    if (!pc_media_exists($pdo, $recto)) { throw new LcndaBadInput('Choisis l’image du recto.'); }
    $verso = safe_int($d['verso_media_id'] ?? 0);
    if ($verso && !pc_media_exists($pdo, $verso)) { throw new LcndaBadInput('L’image du verso n’existe plus.'); }
    if ($verso === $recto) { throw new LcndaBadInput('Le recto et le verso doivent être deux images différentes.'); }
    $dup = $pdo->prepare('SELECT id FROM postcards WHERE (media_id=? OR verso_media_id=?) AND id<>?');
    $dup->execute([$recto, $recto, $id]);
    if ($dup->fetchColumn()) { throw new LcndaBadInput('Cette image a déjà sa fiche de carte postale.'); }
    if ($verso) { $dup->execute([$verso, $verso, $id]); if ($dup->fetchColumn()) { throw new LcndaBadInput('Le verso choisi appartient déjà à une autre carte postale.'); } }
    $placeId = safe_int($d['place_id'] ?? 0);
    if ($placeId) { $c = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $c->execute([$placeId]); if (!$c->fetchColumn()) { throw new LcndaBadInput('Ce lieu n’existe plus dans la base.'); } }
    [$writerId, $writerText] = pc_person_value($pdo, $d['writer'] ?? '');
    [$recipId, $recipText] = pc_person_value($pdo, $d['recipient'] ?? '');
    $lat = pc_num($d['view_lat'] ?? null, -90, 90); $lon = pc_num($d['view_lon'] ?? null, -180, 180);
    if ($lat === null || $lon === null) { $lat = $lon = null; }
    $bearing = pc_num($d['view_bearing'] ?? null, 0, 360);
    if ($bearing !== null) { $bearing = fmod($bearing, 360.0); }
    $vals = [$recto, $verso ?: null, pc_text($d['title'] ?? ''), pc_text($d['publisher'] ?? ''), pc_text($d['card_number'] ?? '', 80), pc_text($d['sent_date'] ?? '', 120),
        pc_text($d['postmark'] ?? ''), $writerId, $writerText, $recipId, $recipText, pc_text($d['recipient_address'] ?? '', 600, true), $placeId ?: null, $lat, $lon, $bearing,
        pc_text($d['notes'] ?? '', POSTCARD_NOTES_MAX, true)];
    $cols = 'media_id, verso_media_id, title, publisher, card_number, sent_date, postmark, writer_person_id, writer_text, recipient_person_id, recipient_text, recipient_address, place_id, view_lat, view_lon, view_bearing, notes';
    if ($old) {
        $set = implode(', ', array_map(static fn($c) => trim($c) . '=?', explode(',', $cols)));
        $pdo->prepare("UPDATE postcards SET $set, updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([...$vals, $id]);
    } else {
        $pdo->prepare("INSERT INTO postcards($cols) VALUES(" . implode(',', array_fill(0, 17, '?')) . ')')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    // le texte du dos : la transcription du média du verso (ou du recto, sans verso) — le même texte que la visionneuse
    if (array_key_exists('back_text', $d)) {
        $back = mb_substr(str_replace("\0", '', preg_replace("/\r\n?/", "\n", scalar_text($d['back_text'] ?? ''))), 0, POSTCARD_BACK_MAX);
        $target = $verso ?: $recto;
        $cur = $pdo->prepare('SELECT COALESCE(transcription, \'\') FROM media WHERE id=?'); $cur->execute([$target]);
        if ((string) $cur->fetchColumn() !== $back) { $pdo->prepare('UPDATE media SET transcription=? WHERE id=?')->execute([$back, $target]); }
    }
    // le recto et le verso restent rangés ensemble (visionneuse : « Recto / Verso »), et la carte est une correspondance
    $mcols = array_column($pdo->query('PRAGMA table_info(media)')->fetchAll(), 'name');
    if (in_array('postcard_group', $mcols, true)) {
        $g = $pdo->prepare('SELECT postcard_group FROM media WHERE id=?'); $g->execute([$recto]); $group = (string) $g->fetchColumn();
        if ($verso) {
            if ($group === '') { $group = 'pc-' . bin2hex(random_bytes(6)); }
            $pdo->prepare("UPDATE media SET postcard_group=?, postcard_side='recto' WHERE id=?")->execute([$group, $recto]);
            $pdo->prepare("UPDATE media SET postcard_group=?, postcard_side='verso' WHERE id=?")->execute([$group, $verso]);
        }
    }
    if (in_array('correspondence_type', $mcols, true)) {
        $pdo->prepare("UPDATE media SET correspondence_type='carte_postale' WHERE id=? AND COALESCE(correspondence_type,'')=''")->execute([$recto]);
    }
    // qui l'a écrite et à qui : la carte apparaît dans leur fiche (bloc Correspondance), sans rien retirer de ce qui y était
    $link = $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) SELECT ?, 'person', ?, 0 WHERE NOT EXISTS (SELECT 1 FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=?)");
    foreach (array_filter([$writerId, $recipId]) as $pid) { $link->execute([$recto, $pid, $recto, $pid]); }
    $after = postcard_row($pdo, $id);
    log_change($pdo, 'postcard', $id, $old ? 'update' : 'create', ($old ? 'Carte postale modifiée : ' : 'Carte postale ajoutée : ') . (pc_text($d['title'] ?? '') ?: 'n° ' . $id), $old, $after);
    return ['ok' => true, 'postcard' => postcards_list($pdo, 0, $id)[0] ?? null];
}

/** Supprime la fiche de la carte (les images restent dans les Médias) ; rend la ligne pour « ↶ Annuler ». */
function postcard_delete(PDO $pdo, array $d): array
{
    postcards_ensure($pdo);
    $row = postcard_row($pdo, safe_int($d['id'] ?? 0));
    if (!$row) { throw new RuntimeException('Carte postale introuvable.'); }
    $pdo->prepare('DELETE FROM postcards WHERE id=?')->execute([(int) $row['id']]);
    log_change($pdo, 'postcard', (int) $row['id'], 'delete', 'Carte postale retirée : ' . ($row['title'] ?: 'n° ' . $row['id']), $row, null);
    return ['ok' => true, 'snapshot' => $row];
}

function postcard_restore(PDO $pdo, array $d): array
{
    postcards_ensure($pdo);
    $s = is_array($d['snapshot'] ?? null) ? $d['snapshot'] : [];
    $id = safe_int($s['id'] ?? 0);
    if ($id <= 0 || postcard_row($pdo, $id)) { throw new LcndaBadInput('Rien à remettre.'); }
    $recto = safe_int($s['media_id'] ?? 0);
    if (!pc_media_exists($pdo, $recto)) { throw new RuntimeException('L’image du recto a été supprimée entre-temps : la carte ne peut pas revenir.'); }
    $verso = safe_int($s['verso_media_id'] ?? 0); if (!pc_media_exists($pdo, $verso)) { $verso = 0; }
    $exists = static function (string $table, int $v) use ($pdo): ?int { if ($v <= 0) { return null; } $c = $pdo->prepare("SELECT 1 FROM $table WHERE id=?"); $c->execute([$v]); return $c->fetchColumn() ? $v : null; };
    $pdo->prepare('INSERT INTO postcards(id, media_id, verso_media_id, title, publisher, card_number, sent_date, postmark, writer_person_id, writer_text, recipient_person_id, recipient_text, recipient_address, place_id, view_lat, view_lon, view_bearing, notes, created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id, $recto, $verso ?: null, pc_text($s['title'] ?? ''), pc_text($s['publisher'] ?? ''), pc_text($s['card_number'] ?? '', 80), pc_text($s['sent_date'] ?? '', 120),
        pc_text($s['postmark'] ?? ''), $exists('persons', safe_int($s['writer_person_id'] ?? 0)), pc_text($s['writer_text'] ?? '', 160), $exists('persons', safe_int($s['recipient_person_id'] ?? 0)), pc_text($s['recipient_text'] ?? '', 160),
        pc_text($s['recipient_address'] ?? '', 600, true), $exists('places', safe_int($s['place_id'] ?? 0)), pc_num($s['view_lat'] ?? null, -90, 90), pc_num($s['view_lon'] ?? null, -180, 180), pc_num($s['view_bearing'] ?? null, 0, 360),
        pc_text($s['notes'] ?? '', POSTCARD_NOTES_MAX, true), preg_match('/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/', (string) ($s['created_at'] ?? '')) ? (string) $s['created_at'] : date('Y-m-d H:i:s')]);
    log_change($pdo, 'postcard', $id, 'create', 'Carte postale remise : ' . (pc_text($s['title'] ?? '') ?: 'n° ' . $id));
    return ['ok' => true, 'postcard' => postcards_list($pdo, 0, $id)[0] ?? null];
}

/** Aiguillage depuis api.php (après verify_csrf et kiosk_guard). */
function postcards_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite && $action === 'postcards') {
            $place = safe_int($_GET['place_id'] ?? 0);
            json_response(['postcards' => postcards_list($pdo, $place), 'candidates' => $place ? [] : postcards_candidates($pdo)]);
        }
        if ($isWrite && $action === 'postcard_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'save' => postcard_save($pdo, $payload),
                    'delete' => postcard_delete($pdo, $payload),
                    'restore' => postcard_restore($pdo, $payload),
                    default => throw new LcndaBadInput('Opération inconnue sur les cartes postales.'),
                };
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue sur les cartes postales.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
