<?php
declare(strict_types=1);

/**
 * 🏷️ Qui est qui ? — reconnaissance des visages, en local (interface : assets/js/heritage-faces.js). Le navigateur repère
 * les visages et calcule pour chacun une « empreinte » (128 nombres) ; on ne garde ici que ces empreintes et la place du
 * visage dans la photo, jamais l'image envoyée ailleurs. Les visages déjà identifiés (media_tags) servent de modèles : un
 * nouveau visage proche d'une personne connue lui est proposé, et l'identification validée devient une identification
 * ordinaire (media_tags, « probable »). Table créée à la première utilisation (sans changer le numéro de structure).
 */

function faces_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS face_prints (id INTEGER PRIMARY KEY AUTOINCREMENT, media_id INTEGER NOT NULL, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0,
        w REAL NOT NULL DEFAULT 0, h REAL NOT NULL DEFAULT 0, score REAL NOT NULL DEFAULT 0, descriptor TEXT NOT NULL DEFAULT '', tag_id INTEGER, status TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_face_prints_media ON face_prints(media_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS face_scans (media_id INTEGER PRIMARY KEY, faces INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '', scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

/** recouvrement de deux cadres (en % de l'image) : intersection / union */
function faces_iou(array $a, array $b): float
{
    $x1 = max($a['x'], $b['x']); $y1 = max($a['y'], $b['y']); $x2 = min($a['x'] + $a['w'], $b['x'] + $b['w']); $y2 = min($a['y'] + $a['h'], $b['y'] + $b['h']);
    $i = max(0, $x2 - $x1) * max(0, $y2 - $y1); $u = $a['w'] * $a['h'] + $b['w'] * $b['h'] - $i;
    return $u > 0 ? $i / $u : 0.0;
}

/** l'index : les photos (images) avec leur état d'analyse, les empreintes, et à qui elles appartiennent */
function faces_index(PDO $pdo): array
{
    faces_ensure($pdo);
    $media = $pdo->query("SELECT m.id, m.filename, COALESCE(m.thumbnail,'') AS thumbnail, COALESCE(m.title,'') AS title, s.faces AS scanned_faces
        FROM media m LEFT JOIN face_scans s ON s.media_id=m.id
        WHERE lower(m.filename) GLOB '*.jpg' OR lower(m.filename) GLOB '*.jpeg' OR lower(m.filename) GLOB '*.png' OR lower(m.filename) GLOB '*.webp'
        ORDER BY m.id DESC LIMIT 20000")->fetchAll();
    $prints = $pdo->query("SELECT f.id, f.media_id, f.x, f.y, f.w, f.h, f.score, f.descriptor, f.status, f.tag_id, t.person_id, t.confidence,
            trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS person_name
        FROM face_prints f LEFT JOIN media_tags t ON t.id=f.tag_id LEFT JOIN persons p ON p.id=t.person_id ORDER BY f.media_id, f.x")->fetchAll();
    return ['media' => array_map(static fn($m) => ['id' => (int) $m['id'], 'filename' => $m['filename'], 'thumbnail' => $m['thumbnail'], 'title' => $m['title'], 'scanned' => $m['scanned_faces'] !== null, 'faces' => (int) ($m['scanned_faces'] ?? 0)], $media),
        'prints' => array_map(static fn($f) => ['id' => (int) $f['id'], 'media_id' => (int) $f['media_id'], 'x' => (float) $f['x'], 'y' => (float) $f['y'], 'w' => (float) $f['w'], 'h' => (float) $f['h'], 'score' => (float) $f['score'],
            'd' => $f['descriptor'], 'status' => $f['status'], 'tag_id' => $f['tag_id'] !== null ? (int) $f['tag_id'] : null, 'person_id' => $f['person_id'] !== null ? (int) $f['person_id'] : null,
            'person_name' => (string) ($f['person_name'] ?? ''), 'confidence' => (string) ($f['confidence'] ?? '')], $prints)];
}

/** le résultat de l'analyse d'une photo : ses visages remplacent les précédents ; un visage qui recouvre une identification déjà faite lui est rattaché */
function save_face_scan(PDO $pdo, array $d): array
{
    faces_ensure($pdo);
    $mediaId = safe_int($d['media_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM media WHERE id=?'); $s->execute([$mediaId]); if (!$s->fetchColumn()) { throw new RuntimeException('Photo introuvable.'); }
    $faces = array_slice(is_array($d['faces'] ?? null) ? $d['faces'] : [], 0, 80);
    $tags = $pdo->prepare("SELECT id, x, y, w, h FROM media_tags WHERE media_id=? AND COALESCE(tag_type,'person')='person'"); $tags->execute([$mediaId]); $tags = $tags->fetchAll();
    $old = $pdo->prepare("SELECT x, y, w, h, status FROM face_prints WHERE media_id=? AND status='ignored'"); $old->execute([$mediaId]); $ignored = $old->fetchAll();
    $pdo->prepare('DELETE FROM face_prints WHERE media_id=?')->execute([$mediaId]);
    $ins = $pdo->prepare('INSERT INTO face_prints(media_id, x, y, w, h, score, descriptor, tag_id, status) VALUES(?,?,?,?,?,?,?,?,?)');
    $n = 0; $usedTags = [];
    foreach ($faces as $f) {
        if (!is_array($f)) { continue; }
        $box = ['x' => max(0.0, min(100.0, (float) ($f['x'] ?? 0))), 'y' => max(0.0, min(100.0, (float) ($f['y'] ?? 0))), 'w' => max(0.1, min(100.0, (float) ($f['w'] ?? 0))), 'h' => max(0.1, min(100.0, (float) ($f['h'] ?? 0)))];
        $desc = (string) ($f['d'] ?? '');
        if (!preg_match('#^[A-Za-z0-9+/]{680,684}={0,2}$#', $desc) || strlen(base64_decode($desc, true) ?: '') !== 512) { continue; } // 128 nombres flottants
        $tagId = null; $best = 0.3;
        foreach ($tags as $t) { if (isset($usedTags[(int) $t['id']])) { continue; } $iou = faces_iou($box, ['x' => (float) $t['x'], 'y' => (float) $t['y'], 'w' => (float) $t['w'], 'h' => (float) $t['h']]); if ($iou > $best) { $best = $iou; $tagId = (int) $t['id']; } }
        if ($tagId) { $usedTags[$tagId] = true; }
        $status = '';
        foreach ($ignored as $g) { if (faces_iou($box, ['x' => (float) $g['x'], 'y' => (float) $g['y'], 'w' => (float) $g['w'], 'h' => (float) $g['h']]) > .5) { $status = 'ignored'; break; } }
        $ins->execute([$mediaId, $box['x'], $box['y'], $box['w'], $box['h'], max(0.0, min(1.0, (float) ($f['score'] ?? 0))), $desc, $tagId, $tagId ? '' : $status]);
        $n++;
    }
    $pdo->prepare('INSERT OR REPLACE INTO face_scans(media_id, faces, model, scanned_at) VALUES(?,?,?,CURRENT_TIMESTAMP)')->execute([$mediaId, $n, mb_substr(safe_text($d['model'] ?? ''), 0, 60)]);
    return ['faces' => $n];
}

/** un visage reconnu (ou corrigé) : il devient une identification ordinaire de la photo */
function face_identify(PDO $pdo, array $d): array
{
    faces_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM face_prints WHERE id=?'); $s->execute([$id]); $f = $s->fetch();
    if (!$f) { throw new RuntimeException('Visage introuvable.'); }
    $data = ['media_id' => (int) $f['media_id'], 'person_id' => safe_int($d['person_id'] ?? 0), 'x' => (float) $f['x'], 'y' => (float) $f['y'], 'w' => (float) $f['w'], 'h' => (float) $f['h'],
        'confidence' => in_array($d['confidence'] ?? '', ['certain', 'probable', 'possible'], true) ? $d['confidence'] : 'probable', 'note' => mb_substr(safe_text($d['note'] ?? 'Reconnu par « Qui est qui ? »'), 0, 300), 'tag_type' => 'person'];
    if ($f['tag_id']) { $c = $pdo->prepare('SELECT 1 FROM media_tags WHERE id=?'); $c->execute([(int) $f['tag_id']]); if (!$c->fetchColumn()) { $f['tag_id'] = null; } } // identification effacée depuis
    if ($f['tag_id']) {
        $r = update_media_tag($pdo, ['tag_id' => (int) $f['tag_id']] + $data);
        return ['tag_id' => (int) $f['tag_id'], 'result' => $r];
    }
    $r = save_media_tag($pdo, $data);
    $tagId = (int) ($r['id'] ?? $r['tag']['id'] ?? $pdo->query('SELECT max(id) FROM media_tags')->fetchColumn());
    $pdo->prepare("UPDATE face_prints SET tag_id=?, status='' WHERE id=?")->execute([$tagId, $id]);
    return ['tag_id' => $tagId];
}

function face_ignore(PDO $pdo, array $d): array
{
    faces_ensure($pdo);
    $pdo->prepare("UPDATE face_prints SET status=? WHERE id=? AND tag_id IS NULL")->execute([!empty($d['undo']) ? '' : 'ignored', safe_int($d['id'] ?? 0)]);
    return ['ok' => true];
}

/** tout effacer (les empreintes seulement : les identifications restent) */
function faces_reset(PDO $pdo, array $d): array
{
    faces_ensure($pdo);
    $pdo->exec('DELETE FROM face_prints'); $pdo->exec('DELETE FROM face_scans');
    return ['ok' => true];
}
