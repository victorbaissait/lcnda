<?php
declare(strict_types=1);

/**
 * 🎚️ Studio son (maquette « Studio son » validée) : ce qui se garde dans la base autour d'un son.
 *  - audio_regions : marqueurs 🚩 et zones nommées d'un son (temps en secondes), pour UN fichier précis (media.filename
 *    ou une de ses versions) : les temps d'une version coupée ne valent pas pour l'original ;
 *  - audio_region_links : un passage relié à des fiches (personne, événement), avec un rôle facultatif ;
 *    la fiche d'une personne montre le bloc « 🎧 On l'entend » (clic = écouter juste ce passage) ;
 *  - audio_transcripts : la transcription faite à la main, avec l'heure de chaque ligne (cherchable : colonne text).
 * Le rack d'effets, l'historique et le multipiste vont dans le projet son (audio_projects.data_json, lib/audio_projects.php).
 */

const AUDIO_REGION_KINDS = ['zone', 'marker'];
const AUDIO_LINK_TYPES = ['person', 'event'];

function audio_studio_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS audio_regions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        filename TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'zone',
        name TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#d6336c',
        start_s REAL NOT NULL DEFAULT 0,
        end_s REAL NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_audio_regions_media ON audio_regions(media_id, filename)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS audio_region_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        region_id INTEGER NOT NULL REFERENCES audio_regions(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT ''
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_audio_region_links_entity ON audio_region_links(entity_type, entity_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_audio_region_links_region ON audio_region_links(region_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS audio_transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        filename TEXT NOT NULL DEFAULT '',
        lines_json TEXT NOT NULL DEFAULT '[]',
        text TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(media_id, filename)
    )");
    $cols = array_column($pdo->query('PRAGMA table_info(audio_projects)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if ($cols && !in_array('data_json', $cols, true)) { $pdo->exec("ALTER TABLE audio_projects ADD COLUMN data_json TEXT NOT NULL DEFAULT '{}'"); }
}

function audio_studio_ready(PDO $pdo): bool
{
    static $ok = null;
    if ($ok === null) { $ok = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='audio_regions'")->fetchColumn(); }
    return $ok;
}

/** Le fichier doit être celui du son ou une de ses versions (jamais un chemin libre) */
function audio_studio_file(PDO $pdo, int $mediaId, string $file): string
{
    $s = $pdo->prepare("SELECT filename, media_type FROM media WHERE id=?"); $s->execute([$mediaId]);
    $m = $s->fetch();
    if (!$m) { throw new RuntimeException('Son introuvable.'); }
    if (!in_array((string) $m['media_type'], ['audio', 'video'], true)) { throw new RuntimeException('Ce média n’est pas un son.'); }
    $file = basename($file);
    if ($file === '' || $file === (string) $m['filename']) { return (string) $m['filename']; }
    $v = $pdo->prepare('SELECT 1 FROM media_versions WHERE media_id=? AND filename=?'); $v->execute([$mediaId, $file]);
    if (!$v->fetchColumn()) { throw new RuntimeException('Ce fichier n’est pas une version de ce son.'); }
    return $file;
}

function audio_studio_text($v, int $max): string
{
    return mb_substr(trim(str_replace("\0", '', (string) (is_scalar($v) ? $v : ''))), 0, $max);
}

/** Titre lisible d'une fiche reliée */
function audio_link_title(PDO $pdo, string $type, int $id): ?array
{
    if ($type === 'person') {
        $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]);
        $p = $s->fetch(); if (!$p) { return null; }
        return ['title' => trim($p['first_name'] . ' ' . mb_strtoupper((string) $p['last_name'])), 'meta' => ''];
    }
    $s = $pdo->prepare('SELECT e.title, e.year, e.date_text, t.label FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id WHERE e.id=?'); $s->execute([$id]);
    $e = $s->fetch(); if (!$e) { return null; }
    return ['title' => trim((string) ($e['title'] ?: $e['label'] ?: 'Événement')), 'meta' => (string) ($e['date_text'] ?: $e['year'] ?: '')];
}

function audio_regions_get(PDO $pdo, int $mediaId, string $file): array
{
    if (!audio_studio_ready($pdo)) { return ['regions' => [], 'filename' => '']; }
    $file = audio_studio_file($pdo, $mediaId, $file);
    $s = $pdo->prepare('SELECT * FROM audio_regions WHERE media_id=? AND filename=? ORDER BY start_s, position, id'); $s->execute([$mediaId, $file]);
    $out = [];
    $l = $pdo->prepare('SELECT entity_type, entity_id, role FROM audio_region_links WHERE region_id=? ORDER BY id');
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $l->execute([(int) $r['id']]); $links = [];
        foreach ($l->fetchAll(PDO::FETCH_ASSOC) as $k) {
            $t = audio_link_title($pdo, (string) $k['entity_type'], (int) $k['entity_id']);
            if ($t) { $links[] = ['type' => $k['entity_type'], 'id' => (int) $k['entity_id'], 'role' => $k['role'], 'title' => $t['title'], 'meta' => $t['meta']]; }
        }
        $out[] = ['id' => (int) $r['id'], 'kind' => $r['kind'], 'name' => $r['name'], 'color' => $r['color'], 'start' => (float) $r['start_s'], 'end' => (float) $r['end_s'], 'note' => $r['note'], 'links' => $links];
    }
    return ['regions' => $out, 'filename' => $file];
}

/** Remplace les marqueurs et zones d'un fichier : {media_id, filename, regions: [{kind, name, color, start, end, note, links: [{type, id, role}]}]} */
function audio_regions_save(PDO $pdo, array $data): array
{
    $mediaId = safe_int($data['media_id'] ?? 0);
    $file = audio_studio_file($pdo, $mediaId, (string) ($data['filename'] ?? ''));
    $list = $data['regions'] ?? [];
    if (!is_array($list)) { throw new RuntimeException('Zones illisibles.'); }
    if (count($list) > 500) { throw new RuntimeException('Trop de zones (500 au plus).'); }
    $own = !$pdo->inTransaction(); // les actions POST de api.php ouvrent déjà une transaction
    if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('DELETE FROM audio_regions WHERE media_id=? AND filename=?')->execute([$mediaId, $file]);
        $ins = $pdo->prepare('INSERT INTO audio_regions(media_id, filename, kind, name, color, start_s, end_s, note, position) VALUES(?,?,?,?,?,?,?,?,?)');
        $lnk = $pdo->prepare('INSERT INTO audio_region_links(region_id, entity_type, entity_id, role) VALUES(?,?,?,?)');
        $exists = ['person' => $pdo->prepare('SELECT 1 FROM persons WHERE id=?'), 'event' => $pdo->prepare('SELECT 1 FROM events WHERE id=?')];
        foreach (array_values($list) as $i => $r) {
            if (!is_array($r)) { continue; }
            $kind = in_array($r['kind'] ?? '', AUDIO_REGION_KINDS, true) ? (string) $r['kind'] : 'zone';
            $a = max(0.0, min(86400.0, (float) ($r['start'] ?? 0)));
            $b = $kind === 'marker' ? $a : max($a, min(86400.0, (float) ($r['end'] ?? $a)));
            $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($r['color'] ?? '')) ? (string) $r['color'] : '#d6336c';
            $name = audio_studio_text($r['name'] ?? '', 160) ?: ($kind === 'marker' ? 'Marqueur' : 'Zone');
            $ins->execute([$mediaId, $file, $kind, $name, $color, $a, $b, audio_studio_text($r['note'] ?? '', 2000), $i]);
            $rid = (int) $pdo->lastInsertId();
            foreach (array_slice(is_array($r['links'] ?? null) ? $r['links'] : [], 0, 20) as $k) {
                $type = (string) ($k['type'] ?? ''); $id = safe_int($k['id'] ?? 0);
                if (!in_array($type, AUDIO_LINK_TYPES, true) || $id <= 0) { continue; }
                $exists[$type]->execute([$id]); if (!$exists[$type]->fetchColumn()) { continue; }
                $lnk->execute([$rid, $type, $id, audio_studio_text($k['role'] ?? '', 60)]);
            }
        }
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) {
        if ($own && $pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    log_change($pdo, 'media', $mediaId, 'update', 'Zones et marqueurs du son enregistrés (' . count($list) . ')');
    return audio_regions_get($pdo, $mediaId, $file);
}

/** « 🎧 On l'entend » : les passages reliés à une personne (ou à un de ses événements) */
function audio_regions_for_person(PDO $pdo, int $personId): array
{
    if (!audio_studio_ready($pdo) || $personId <= 0) { return []; }
    $s = $pdo->prepare("SELECT r.id, r.kind, r.name, r.color, r.start_s, r.end_s, r.filename, r.media_id, m.title AS media_title, l.role, l.entity_type
        FROM audio_region_links l JOIN audio_regions r ON r.id=l.region_id JOIN media m ON m.id=r.media_id
        WHERE (r.filename = m.filename OR NOT EXISTS (SELECT 1 FROM audio_regions r2 WHERE r2.media_id = r.media_id AND r2.filename = m.filename)) -- la version montrée d'abord (les zones sont recopiées sur chaque nouvelle version)
          AND ((l.entity_type='person' AND l.entity_id=?) OR (l.entity_type='event' AND l.entity_id IN (SELECT id FROM events WHERE person_id=? OR family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))))
        ORDER BY m.title COLLATE NOCASE, r.start_s LIMIT 300");
    $s->execute([$personId, $personId, $personId, $personId]);
    $seen = []; $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (isset($seen[$r['id']])) { continue; } $seen[$r['id']] = true;
        $out[] = ['id' => (int) $r['id'], 'kind' => $r['kind'], 'name' => $r['name'], 'color' => $r['color'], 'start' => (float) $r['start_s'], 'end' => (float) $r['end_s'], 'filename' => $r['filename'], 'media_id' => (int) $r['media_id'],
            'media_title' => (string) $r['media_title'], 'role' => $r['entity_type'] === 'event' ? ($r['role'] ?: 'événement') : (string) $r['role'], 'exists' => is_file(MEDIA_DIR . '/' . basename((string) $r['filename']))];
    }
    return $out;
}

function audio_transcript_get(PDO $pdo, int $mediaId, string $file): array
{
    if (!audio_studio_ready($pdo)) { return ['lines' => []]; }
    $file = audio_studio_file($pdo, $mediaId, $file);
    $s = $pdo->prepare('SELECT lines_json, updated_at FROM audio_transcripts WHERE media_id=? AND filename=?'); $s->execute([$mediaId, $file]);
    $r = $s->fetch();
    $lines = $r ? json_decode((string) $r['lines_json'], true) : [];
    return ['lines' => is_array($lines) ? $lines : [], 'updated_at' => $r['updated_at'] ?? null, 'filename' => $file];
}

/** {media_id, filename, lines: [{t, who, text}]} */
function audio_transcript_save(PDO $pdo, array $data): array
{
    $mediaId = safe_int($data['media_id'] ?? 0);
    $file = audio_studio_file($pdo, $mediaId, (string) ($data['filename'] ?? ''));
    $raw = $data['lines'] ?? [];
    if (!is_array($raw)) { throw new RuntimeException('Transcription illisible.'); }
    if (count($raw) > 5000) { throw new RuntimeException('Transcription trop longue (5 000 lignes au plus).'); }
    $lines = [];
    foreach ($raw as $l) {
        if (!is_array($l)) { continue; }
        $text = audio_studio_text($l['text'] ?? '', 4000); $who = audio_studio_text($l['who'] ?? '', 80);
        if ($text === '' && $who === '') { continue; }
        $lines[] = ['t' => round(max(0.0, min(86400.0, (float) ($l['t'] ?? 0))), 2), 'who' => $who, 'text' => $text];
    }
    usort($lines, static fn($a, $b) => $a['t'] <=> $b['t']);
    $plain = implode("\n", array_map(static fn($l) => ($l['who'] !== '' ? $l['who'] . ' : ' : '') . $l['text'], $lines));
    $pdo->prepare('INSERT INTO audio_transcripts(media_id, filename, lines_json, text, updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(media_id, filename) DO UPDATE SET lines_json=excluded.lines_json, text=excluded.text, updated_at=CURRENT_TIMESTAMP')
        ->execute([$mediaId, $file, json_encode($lines, JSON_UNESCAPED_UNICODE), $plain]);
    log_change($pdo, 'media', $mediaId, 'update', 'Transcription du son enregistrée (' . count($lines) . ' lignes)');
    return ['lines' => $lines, 'filename' => $file];
}

/** Recherche dans les transcriptions des sons : [{media_id, title, filename, t, text}] */
function audio_transcript_search(PDO $pdo, string $q): array
{
    $q = trim($q);
    if (!audio_studio_ready($pdo) || mb_strlen($q) < 2) { return []; }
    $s = $pdo->prepare("SELECT t.media_id, t.filename, t.lines_json, m.title FROM audio_transcripts t JOIN media m ON m.id=t.media_id WHERE t.text LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 50");
    $s->execute(['%' . addcslashes($q, '%_\\') . '%']);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        foreach (json_decode((string) $r['lines_json'], true) ?: [] as $l) {
            if (mb_stripos(($l['who'] ?? '') . ' ' . ($l['text'] ?? ''), $q) !== false) { $out[] = ['media_id' => (int) $r['media_id'], 'title' => $r['title'], 'filename' => $r['filename'], 't' => (float) ($l['t'] ?? 0), 'text' => mb_substr((string) ($l['text'] ?? ''), 0, 240), 'who' => (string) ($l['who'] ?? '')]; }
            if (count($out) >= 100) { break 2; }
        }
    }
    return $out;
}
