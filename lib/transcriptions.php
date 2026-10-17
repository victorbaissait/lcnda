<?php
declare(strict_types=1);

/**
 * 📜 Transcription d'actes (interface : assets/js/heritage-transcribe.js) : l'image d'un acte (un média de la base),
 * son texte, les zones de l'image reliées à des passages du texte, et ce qui a été repéré (noms, dates, lieux, métiers),
 * relié aux fiches. Table créée à la première utilisation (sans changer le numéro de structure).
 */

const TRANSCRIPTION_KINDS = ['naissance', 'bapteme', 'mariage', 'deces', 'sepulture', 'notarial', 'recensement', 'militaire', 'lettre', 'autre'];

function act_transcriptions_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS act_transcriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'autre',
        media_id INTEGER, date_text TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function act_transcriptions_list(PDO $pdo): array
{
    act_transcriptions_ensure($pdo);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'title' => $r['title'], 'kind' => $r['kind'], 'date_text' => $r['date_text'], 'place' => $r['place'], 'media_id' => (int) $r['media_id'],
        'filename' => (string) ($r['filename'] ?? ''), 'thumb' => (string) ($r['thumb'] ?? ''), 'updated_at' => $r['updated_at'], 'chars' => (int) $r['chars'], 'people' => (int) $r['people']],
        $pdo->query("SELECT t.id, t.title, t.kind, t.date_text, t.place, t.media_id, t.updated_at, length(t.body) AS chars, COALESCE(json_array_length(t.data_json, '$.people'), 0) AS people,
            m.filename, COALESCE(NULLIF(m.thumbnail,''), m.filename) AS thumb FROM act_transcriptions t LEFT JOIN media m ON m.id=t.media_id ORDER BY t.updated_at DESC")->fetchAll());
}

/** les transcriptions d'actes faites sur une image (pour la visionneuse) */
function act_transcriptions_for_media(PDO $pdo, int $mediaId): array
{
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare('SELECT id, title, kind, date_text, place, source, body, data_json, updated_at FROM act_transcriptions WHERE media_id=? ORDER BY updated_at DESC LIMIT 20'); $s->execute([$mediaId]);
    return array_map(static function ($r) { $d = json_decode((string) $r['data_json'], true) ?: []; unset($r['data_json']);
        $r['id'] = (int) $r['id']; $r['people'] = array_values(array_map(static fn($p) => ['name' => (string) ($p['name'] ?? ''), 'role' => (string) ($p['role'] ?? ''), 'person_id' => (int) ($p['person_id'] ?? 0)], array_filter(is_array($d['people'] ?? null) ? $d['people'] : [], 'is_array'))); return $r; }, $s->fetchAll());
}

function act_transcription_get(PDO $pdo, int $id): array
{
    act_transcriptions_ensure($pdo);
    $s = $pdo->prepare('SELECT t.*, m.filename, m.title AS media_title FROM act_transcriptions t LEFT JOIN media m ON m.id=t.media_id WHERE t.id=?');
    $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Transcription introuvable.'); }
    return ['id' => (int) $r['id'], 'title' => $r['title'], 'kind' => $r['kind'], 'media_id' => (int) $r['media_id'], 'filename' => (string) $r['filename'], 'media_title' => (string) $r['media_title'],
        'date_text' => $r['date_text'], 'place' => $r['place'], 'source' => $r['source'], 'body' => $r['body'], 'data' => json_decode((string) $r['data_json'], true) ?: new stdClass(), 'updated_at' => $r['updated_at']];
}

/** les zones, les repérages et les liens : des nombres, des textes courts, des numéros de fiche ; rien d'autre n'est gardé */
function act_transcription_clean_data(PDO $pdo, $data): array
{
    $data = is_array($data) ? $data : [];
    $num = static fn($v) => is_numeric($v) ? round((float) $v, 4) : 0;
    $zones = [];
    foreach (array_slice(is_array($data['zones'] ?? null) ? $data['zones'] : [], 0, 2000) as $z) {
        if (!is_array($z)) { continue; }
        $zones[] = ['id' => mb_substr(preg_replace('/[^\w-]/', '', (string) ($z['id'] ?? '')), 0, 24), 'x' => $num($z['x'] ?? 0), 'y' => $num($z['y'] ?? 0), 'w' => $num($z['w'] ?? 0), 'h' => $num($z['h'] ?? 0),
            's' => max(0, (int) ($z['s'] ?? 0)), 'e' => max(0, (int) ($z['e'] ?? 0)), 'note' => mb_substr(safe_text($z['note'] ?? ''), 0, 300), 'c' => preg_match('/^#[0-9a-f]{6}$/i', (string) ($z['c'] ?? '')) ? $z['c'] : ''];
    }
    $people = [];
    foreach (array_slice(is_array($data['people'] ?? null) ? $data['people'] : [], 0, 200) as $p) {
        if (!is_array($p)) { continue; }
        $pid = safe_int($p['person_id'] ?? 0);
        if ($pid) { $c = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $c->execute([$pid]); if (!$c->fetchColumn()) { $pid = 0; } }
        $people[] = ['name' => mb_substr(safe_text($p['name'] ?? ''), 0, 160), 'role' => mb_substr(safe_text($p['role'] ?? ''), 0, 60), 'person_id' => $pid, 's' => max(0, (int) ($p['s'] ?? 0)), 'e' => max(0, (int) ($p['e'] ?? 0))];
    }
    $view = is_array($data['view'] ?? null) ? $data['view'] : [];
    return ['zones' => $zones, 'people' => $people, 'view' => ['contrast' => $num($view['contrast'] ?? 100), 'bright' => $num($view['bright'] ?? 100), 'invert' => !empty($view['invert']), 'rot' => (int) ($view['rot'] ?? 0) % 360, 'gray' => !empty($view['gray'])]];
}

function save_act_transcription(PDO $pdo, array $data): array
{
    act_transcriptions_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $mediaId = safe_int($data['media_id'] ?? 0);
    if ($mediaId) { $c = $pdo->prepare('SELECT 1 FROM media WHERE id=?'); $c->execute([$mediaId]); if (!$c->fetchColumn()) { throw new RuntimeException('Image de l’acte introuvable.'); } }
    $kind = in_array($data['kind'] ?? '', TRANSCRIPTION_KINDS, true) ? $data['kind'] : 'autre';
    $title = mb_substr(safe_text($data['title'] ?? ''), 0, 200) ?: 'Acte sans titre';
    $body = mb_substr(str_replace("\0", '', (string) (is_scalar($data['body'] ?? '') ? $data['body'] : '')), 0, 200000);
    $json = json_encode(act_transcription_clean_data($pdo, $data['data'] ?? []), JSON_UNESCAPED_UNICODE);
    $vals = [$title, $kind, $mediaId ?: null, mb_substr(safe_text($data['date_text'] ?? ''), 0, 120), mb_substr(safe_text($data['place'] ?? ''), 0, 160), mb_substr(safe_text($data['source'] ?? ''), 0, 300), $body, $json];
    if ($id) {
        $s = $pdo->prepare('UPDATE act_transcriptions SET title=?, kind=?, media_id=?, date_text=?, place=?, source=?, body=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $s->execute([...$vals, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Transcription introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO act_transcriptions(title, kind, media_id, date_text, place, source, body, data_json) VALUES(?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    // en option : le texte va aussi dans la transcription du média (visionneuse, recherche)
    if ($mediaId && !empty($data['to_media'])) { $pdo->prepare('UPDATE media SET transcription=? WHERE id=?')->execute([$body, $mediaId]); }
    log_change($pdo, 'meta', 0, 'update', 'Transcription d’acte enregistrée : ' . $title);
    return ['id' => $id];
}

function delete_act_transcription(PDO $pdo, array $data): array
{
    act_transcriptions_ensure($pdo);
    $pdo->prepare('DELETE FROM act_transcriptions WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

function rename_act_transcription(PDO $pdo, array $data): array
{
    act_transcriptions_ensure($pdo);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($name === '') { throw new RuntimeException('Nom manquant.'); }
    $pdo->prepare('UPDATE act_transcriptions SET title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

/** pour chaque nom repéré : les fiches de la base qui lui ressemblent (nom de famille et prénom) */
function act_transcription_match_people(PDO $pdo, array $names): array
{
    $out = [];
    foreach (array_slice($names, 0, 60) as $name) {
        $name = trim(safe_text($name)); if (mb_strlen($name) < 3) { $out[] = []; continue; }
        $words = array_values(array_filter(preg_split('/[\s,\-]+/u', $name) ?: [], static fn($w) => mb_strlen($w) >= 2));
        if (!$words) { $out[] = []; continue; }
        $last = end($words); $first = $words[0];
        $s = $pdo->prepare("SELECT p.id, p.first_name, p.last_name,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' LIMIT 1) AS birth_year,
            (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' LIMIT 1) AS death_year
            FROM persons p WHERE p.last_name LIKE ? COLLATE NOCASE " . (count($words) > 1 ? 'AND p.first_name LIKE ? COLLATE NOCASE' : '') . ' LIMIT 6');
        $s->execute(count($words) > 1 ? ['%' . $last . '%', '%' . $first . '%'] : ['%' . $last . '%']);
        $out[] = array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . $r['last_name']), 'years' => trim(($r['birth_year'] ?: '?') . '–' . ($r['death_year'] ?: ''), '–')], $s->fetchAll());
    }
    return $out;
}
