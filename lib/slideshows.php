<?php
declare(strict_types=1);

/**
 * 🎞️ Diaporamas et récits (interface : assets/js/heritage-slideshow.js) : des diapositives (photos, titres, cartes animées
 * d'un trajet), une musique, des voix enregistrées. Un diaporama = un document JSON ; les photos et les sons restent dans
 * les médias. Table créée à la première utilisation (sans changer le numéro de structure).
 */

const SLIDESHOW_MAX = 2000000;

function slideshows_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS slideshows (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function slideshows_list(PDO $pdo): array
{
    slideshows_ensure($pdo);
    $out = [];
    foreach ($pdo->query('SELECT id, name, data_json, updated_at FROM slideshows ORDER BY updated_at DESC')->fetchAll() as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $slides = is_array($d['slides'] ?? null) ? $d['slides'] : [];
        $cover = '';
        foreach ($slides as $s) { if (($s['type'] ?? '') === 'photo' && !empty($s['filename'])) { $cover = (string) $s['filename']; break; } }
        $dur = 0.0; foreach ($slides as $s) { $dur += is_numeric($s['dur'] ?? null) ? (float) $s['dur'] : 5; }
        $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'updated_at' => $r['updated_at'], 'slides' => count($slides), 'duration' => round($dur), 'cover' => $cover];
    }
    return $out;
}

function slideshow_get(PDO $pdo, int $id): array
{
    slideshows_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM slideshows WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Diaporama introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'show' => json_decode((string) $r['data_json'], true) ?: new stdClass(), 'updated_at' => $r['updated_at']];
}

function save_slideshow(PDO $pdo, array $data): array
{
    slideshows_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200) ?: 'Mon diaporama';
    $show = is_array($data['show'] ?? null) ? $data['show'] : [];
    // les fichiers cités doivent être des médias de la base (rien d'autre n'est lu)
    $okFile = static fn($f) => is_string($f) && $f !== '' && preg_match('#^[A-Za-z0-9._%\-/]{1,240}$#', $f) && !str_contains($f, '..');
    foreach (['music'] as $k) { if (isset($show[$k]['filename']) && !$okFile($show[$k]['filename'])) { unset($show[$k]); } }
    $slides = [];
    foreach (array_slice(is_array($show['slides'] ?? null) ? $show['slides'] : [], 0, 400) as $s) {
        if (!is_array($s) || !in_array($s['type'] ?? '', ['photo', 'title', 'map'], true)) { continue; }
        if (isset($s['filename']) && !$okFile($s['filename'])) { unset($s['filename']); }
        if (isset($s['voice']['filename']) && !$okFile($s['voice']['filename'])) { unset($s['voice']); }
        $slides[] = $s;
    }
    $show['slides'] = $slides;
    $json = json_encode($show, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > SLIDESHOW_MAX) { throw new RuntimeException('Diaporama trop lourd.'); }
    if ($id) {
        $s = $pdo->prepare('UPDATE slideshows SET name=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Diaporama introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO slideshows(name, data_json) VALUES(?,?)')->execute([$name, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, 'update', 'Diaporama enregistré : ' . $name);
    return ['id' => $id];
}

function delete_slideshow(PDO $pdo, array $data): array
{
    slideshows_ensure($pdo);
    $pdo->prepare('DELETE FROM slideshows WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

function rename_slideshow(PDO $pdo, array $data): array
{
    slideshows_ensure($pdo);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($name === '') { throw new RuntimeException('Nom manquant.'); }
    $pdo->prepare('UPDATE slideshows SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}
