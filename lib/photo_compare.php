<?php
declare(strict_types=1);

/**
 * 🔍 Comparer deux photos (F15) : deux portraits côte à côte, en fondu ou en rideau, pour chercher une ressemblance.
 * Le calcul (alignement des yeux, ressemblance des visages) se fait dans le navigateur (assets/js/heritage-photo-compare.js,
 * modèle local de heritage-faces.js) ; ici on range seulement les comparaisons enregistrées, reliées aux deux médias et aux
 * personnes, et on rend les « empreintes » de visages déjà calculées pour ces deux photos (table face_prints, lib/faces.php).
 *
 * Table (structure n°50, lib/migrations.php) : photo_comparisons.
 *
 * GET  api.php?action=photo_comparisons[&media_id=][&person_id=] | photo_comparison&id= | photo_compare_faces&a=&b=
 * POST api.php?action=photo_comparison_write {op: save | delete | rename}
 * « ↶ Annuler » après une suppression : restore_last_delete (entity_type « photo_comparison », api.php).
 */

const PHOTO_CMP_MODES = ['side', 'fade', 'curtain'];
const PHOTO_CMP_MAX_NOTES = 20000;
const PHOTO_CMP_MAX_SETTINGS = 20000;
const PHOTO_CMP_MAX_PEOPLE = 40;

function photo_cmp_table(PDO $pdo): bool
{
    $q = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='photo_comparisons'");
    $q->execute();
    return (bool) $q->fetchColumn();
}

function photo_cmp_media(PDO $pdo, int $id): ?array
{
    if ($id <= 0) { return null; }
    $q = $pdo->prepare('SELECT id, title, filename, thumbnail, media_type, date_text FROM media WHERE id=?');
    $q->execute([$id]);
    $m = $q->fetch(PDO::FETCH_ASSOC);
    return $m ?: null;
}

/** les personnes : une liste de numéros de fiches existantes (doublons, numéros forgés, fiches disparues : retirés) */
function photo_cmp_people(PDO $pdo, mixed $raw): array
{
    if (is_string($raw)) { $raw = trim($raw) === '' ? [] : (str_starts_with(trim($raw), '[') ? json_decode($raw, true) : explode(',', $raw)); }
    if (!is_array($raw)) { throw new LcndaBadInput('Donnée incorrecte (« personnes ») : une liste est attendue.'); }
    $ids = [];
    foreach ($raw as $v) {
        if (is_array($v)) { $v = $v['id'] ?? 0; }
        $id = safe_int($v);
        if ($id > 0 && !in_array($id, $ids, true)) { $ids[] = $id; }
        if (count($ids) >= PHOTO_CMP_MAX_PEOPLE) { break; }
    }
    if (!$ids) { return []; }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $q = $pdo->prepare("SELECT id FROM persons WHERE id IN ($in)");
    $q->execute($ids);
    $ok = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
    return array_values(array_filter($ids, static fn($id) => in_array($id, $ok, true)));
}

/** les réglages de la vue (mode, yeux, filtres…) : un objet JSON borné, rien d'autre */
function photo_cmp_settings(mixed $raw): string
{
    if (is_string($raw)) { $raw = $raw === '' ? [] : json_decode($raw, true); }
    if (!is_array($raw)) { return '{}'; }
    $out = [];
    $num = static fn($v, float $min, float $max, float $def) => is_numeric($v) ? max($min, min($max, (float) $v)) : $def;
    foreach (['a', 'b'] as $side) {
        $eyes = $raw['eyes'][$side] ?? null;
        if (is_array($eyes) && count($eyes) === 2) {
            $pts = [];
            foreach ($eyes as $p) {
                if (!is_array($p) || !isset($p[0], $p[1]) || !is_numeric($p[0]) || !is_numeric($p[1])) { $pts = []; break; }
                $pts[] = [round($num($p[0], 0, 1, 0), 5), round($num($p[1], 0, 1, 0), 5)];
            }
            if ($pts) { $out['eyes'][$side] = $pts; }
        }
    }
    $out['gray'] = !empty($raw['gray']);
    $out['contrast'] = round($num($raw['contrast'] ?? 100, 20, 300, 100));
    $out['bright'] = round($num($raw['bright'] ?? 100, 20, 300, 100));
    $out['mix'] = round($num($raw['mix'] ?? 50, 0, 100, 50));
    $out['sync'] = !array_key_exists('sync', $raw) || !empty($raw['sync']);
    $out['aligned'] = !empty($raw['aligned']);
    $json = json_encode($out, JSON_UNESCAPED_UNICODE);
    return strlen((string) $json) > PHOTO_CMP_MAX_SETTINGS ? '{}' : (string) $json;
}

function photo_cmp_row(PDO $pdo, int $id): ?array
{
    $q = $pdo->prepare('SELECT * FROM photo_comparisons WHERE id=?');
    $q->execute([$id]);
    $r = $q->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

function photo_cmp_out(PDO $pdo, array $r): array
{
    $people = json_decode((string) ($r['people_json'] ?? '[]'), true);
    $people = is_array($people) ? array_values(array_filter(array_map('intval', $people))) : [];
    $names = [];
    if ($people) {
        $in = implode(',', array_fill(0, count($people), '?'));
        $q = $pdo->prepare("SELECT id, first_name, last_name FROM persons WHERE id IN ($in)");
        $q->execute($people);
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $p) { $names[(int) $p['id']] = trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? '')); }
    }
    $settings = json_decode((string) ($r['settings_json'] ?? '{}'), true);
    return [
        'id' => (int) $r['id'], 'title' => (string) $r['title'], 'mode' => (string) $r['mode'], 'notes' => (string) $r['notes'],
        'verdict' => (string) $r['verdict'], 'score' => $r['score'] !== null ? (float) $r['score'] : null,
        'media_a' => photo_cmp_media($pdo, (int) $r['media_a']), 'media_b' => photo_cmp_media($pdo, (int) $r['media_b']),
        'people' => array_map(static fn($id) => ['id' => $id, 'name' => $names[$id] ?? ''], array_values(array_filter($people, static fn($id) => isset($names[$id])))),
        'settings' => is_array($settings) ? $settings : [],
        'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at'],
    ];
}

function photo_cmp_list(PDO $pdo, int $mediaId = 0, int $personId = 0): array
{
    if (!photo_cmp_table($pdo)) { return ['items' => []]; }
    $sql = 'SELECT * FROM photo_comparisons';
    $args = [];
    if ($mediaId > 0) { $sql .= ' WHERE media_a=? OR media_b=?'; $args = [$mediaId, $mediaId]; }
    $sql .= ' ORDER BY updated_at DESC, id DESC LIMIT 500';
    $q = $pdo->prepare($sql);
    $q->execute($args);
    $items = array_map(static fn($r) => photo_cmp_out($pdo, $r), $q->fetchAll(PDO::FETCH_ASSOC));
    if ($personId > 0) { $items = array_values(array_filter($items, static fn($c) => in_array($personId, array_column($c['people'], 'id'), true))); }
    return ['items' => $items];
}

/** les visages déjà trouvés (outil 👤 Visages) sur les deux photos : cadre en %, empreinte (128 nombres en base64), qui c'est */
function photo_cmp_faces(PDO $pdo, int $a, int $b): array
{
    $out = ['a' => [], 'b' => []];
    $q = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='face_prints'");
    $q->execute();
    if (!$q->fetchColumn()) { return $out; }
    $sql = "SELECT f.id, f.x, f.y, f.w, f.h, f.score, f.descriptor, t.person_id FROM face_prints f LEFT JOIN media_tags t ON t.id=f.tag_id WHERE f.media_id=? AND f.status<>'ignored' ORDER BY f.w*f.h DESC LIMIT 40";
    foreach (['a' => $a, 'b' => $b] as $side => $mid) {
        if ($mid <= 0) { continue; }
        $s = $pdo->prepare($sql);
        $s->execute([$mid]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $f) {
            $d = (string) $f['descriptor'];
            if (strlen($d) !== 684 || !preg_match('~^[A-Za-z0-9+/=]+$~', $d)) { $d = ''; } // 128 nombres × 4 octets, en base64
            $out[$side][] = ['id' => (int) $f['id'], 'x' => (float) $f['x'], 'y' => (float) $f['y'], 'w' => (float) $f['w'], 'h' => (float) $f['h'],
                'score' => (float) $f['score'], 'd' => $d, 'person_id' => $f['person_id'] !== null ? (int) $f['person_id'] : null];
        }
    }
    return $out;
}

function photo_cmp_save(PDO $pdo, array $d): array
{
    if (!photo_cmp_table($pdo)) { throw new RuntimeException('La base n’est pas encore à jour : relance l’app.'); }
    $id = safe_int($d['id'] ?? 0);
    $a = safe_int($d['media_a'] ?? 0);
    $b = safe_int($d['media_b'] ?? 0);
    if (!photo_cmp_media($pdo, $a) || !photo_cmp_media($pdo, $b)) { throw new LcndaBadInput('Choisis deux photos de tes médias.'); }
    if ($a === $b) { throw new LcndaBadInput('Choisis deux photos différentes.'); }
    $mode = scalar_text($d['mode'] ?? 'side', 'mode');
    if (!in_array($mode, PHOTO_CMP_MODES, true)) { $mode = 'side'; }
    $notes = mb_substr(safe_text($d['notes'] ?? ''), 0, PHOTO_CMP_MAX_NOTES);
    $title = mb_substr(safe_text($d['title'] ?? ''), 0, 300);
    $verdict = mb_substr(safe_text($d['verdict'] ?? ''), 0, 500);
    $score = isset($d['score']) && is_numeric($d['score']) ? max(0.0, min(100.0, round((float) $d['score'], 1))) : null;
    $people = photo_cmp_people($pdo, $d['people'] ?? []);
    if ($title === '') {
        $ma = photo_cmp_media($pdo, $a); $mb = photo_cmp_media($pdo, $b);
        $title = mb_substr(trim(($ma['title'] ?: 'Photo A') . ' ↔ ' . ($mb['title'] ?: 'Photo B')), 0, 300);
    }
    $values = [$title, $a, $b, json_encode($people), $notes, $mode, photo_cmp_settings($d['settings'] ?? []), $score, $verdict];
    if ($id) {
        $before = photo_cmp_row($pdo, $id);
        if (!$before) { throw new RuntimeException('Comparaison introuvable.'); }
        $pdo->prepare('UPDATE photo_comparisons SET title=?, media_a=?, media_b=?, people_json=?, notes=?, mode=?, settings_json=?, score=?, verdict=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$values, $id]);
        log_change($pdo, 'photo_comparison', $id, 'update', 'Comparaison de photos modifiée : ' . $title, $before, null);
    } else {
        $pdo->prepare('INSERT INTO photo_comparisons(title, media_a, media_b, people_json, notes, mode, settings_json, score, verdict) VALUES(?,?,?,?,?,?,?,?,?)')->execute($values);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'photo_comparison', $id, 'create', 'Comparaison de photos enregistrée : ' . $title, null, null);
    }
    return ['comparison' => photo_cmp_out($pdo, photo_cmp_row($pdo, $id))];
}

function photo_cmp_rename(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $before = photo_cmp_row($pdo, $id);
    if (!$before) { throw new RuntimeException('Comparaison introuvable.'); }
    $title = mb_substr(safe_text($d['title'] ?? ($d['name'] ?? '')), 0, 300);
    if ($title === '') { throw new LcndaBadInput('Donne un nom à la comparaison.'); }
    $pdo->prepare('UPDATE photo_comparisons SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$title, $id]);
    log_change($pdo, 'photo_comparison', $id, 'update', 'Comparaison de photos renommée : ' . $title, $before, null);
    return ['id' => $id];
}

function photo_cmp_delete(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $before = photo_cmp_row($pdo, $id);
    if (!$before) { throw new RuntimeException('Comparaison introuvable.'); }
    $pdo->prepare('DELETE FROM photo_comparisons WHERE id=?')->execute([$id]);
    log_change($pdo, 'photo_comparison', $id, 'delete', 'Comparaison de photos supprimée : ' . $before['title'], $before, null); // ligne entière : « ↶ Annuler »
    return ['id' => $id];
}

function photo_cmp_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action === 'photo_comparisons') { json_response(photo_cmp_list($pdo, safe_int($_GET['media_id'] ?? 0), safe_int($_GET['person_id'] ?? 0))); }
            if ($action === 'photo_comparison') {
                $r = photo_cmp_table($pdo) ? photo_cmp_row($pdo, safe_int($_GET['id'] ?? 0)) : null;
                if (!$r) { json_response(['error' => 'Comparaison introuvable.'], 404); }
                json_response(['comparison' => photo_cmp_out($pdo, $r)]);
            }
            if ($action === 'photo_compare_faces') { json_response(photo_cmp_faces($pdo, safe_int($_GET['a'] ?? 0), safe_int($_GET['b'] ?? 0))); }
        }
        if ($isWrite && $action === 'photo_comparison_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'save' => photo_cmp_save($pdo, $payload),
                    'rename' => photo_cmp_rename($pdo, $payload),
                    'delete' => photo_cmp_delete($pdo, $payload),
                    default => throw new LcndaBadInput('Opération inconnue sur les comparaisons de photos.'),
                };
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response(['ok' => true] + $out);
        }
        json_response(['error' => 'Action inconnue sur les comparaisons de photos.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
