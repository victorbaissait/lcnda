<?php
declare(strict_types=1);

/**
 * 🎧 Projets audio : le son en cours de travail dans « Modifier le son » (coupé, nettoyé, assemblé…) est gardé
 * comme un fichier de travail (FLAC ou WAV, sans perte) dans media/, à part des Médias, avec le son de départ ;
 * on le rouvre pour continuer, puis on l'enregistre comme version, copie ou nouveau son quand il est prêt.
 */

function audio_project_name($v): string
{
    return mb_substr(trim(str_replace(["\r", "\n", "\0"], ' ', (string) (is_scalar($v) ? $v : ''))), 0, 160);
}

function audio_projects_list(PDO $pdo): array
{
    $out = [];
    $data = audio_project_has_data($pdo) ? ', p.data_json' : ", '{}' AS data_json";
    foreach ($pdo->query('SELECT p.id, p.name, p.media_id, p.source, p.work_file, p.duration, p.updated_at, m.title AS media_title' . $data . ' FROM audio_projects p LEFT JOIN media m ON m.id = p.media_id ORDER BY p.updated_at DESC, p.id DESC') as $r) {
        $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'media_id' => (int) $r['media_id'], 'source' => $r['source'], 'duration' => (float) $r['duration'], 'updated_at' => $r['updated_at'], 'media_title' => (string) ($r['media_title'] ?? ''), 'exists' => $r['work_file'] !== '' && is_file(MEDIA_DIR . '/' . basename((string) $r['work_file'])), 'summary' => audio_project_summary((string) $r['data_json'])];
    }
    return $out;
}

function audio_project_get(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT p.*, m.title AS media_title FROM audio_projects p LEFT JOIN media m ON m.id = p.media_id WHERE p.id=?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Projet introuvable.'); }
    $data = json_decode((string) ($r['data_json'] ?? '{}'), true);
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'media_id' => (int) $r['media_id'], 'source' => $r['source'], 'work_file' => $r['work_file'], 'duration' => (float) $r['duration'], 'media_title' => (string) ($r['media_title'] ?? ''), 'updated_at' => $r['updated_at'], 'data' => is_array($data) ? $data : new stdClass()];
}

/** Envoi multipart : file (le son de travail), id (0 = nouveau), name, media_id, source, duration */
function save_audio_project(PDO $pdo, ?array $file, array $post): never
{
    try {
        $id = safe_int($post['id'] ?? 0);
        $name = audio_project_name($post['name'] ?? '');
        if ($name === '') { throw new RuntimeException('Donne un nom au projet.'); }
        $source = (string) ($post['source'] ?? '');
        if ($source !== '' && !preg_match('/^[A-Za-z0-9._-]{1,200}$/', $source)) { $source = ''; }
        $old = $id ? audio_project_get($pdo, $id) : null;
        $data = audio_project_clean_data($pdo, $post['data'] ?? null);
        $work = retouch_store_upload($file, 'audio');
        $dur = max(0.0, min(86400.0, (float) ($post['duration'] ?? 0)));
        if ($old) {
            $pdo->prepare('UPDATE audio_projects SET name=?, work_file=?, duration=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $work, $dur, $id]);
            if ($data !== null) { $pdo->prepare('UPDATE audio_projects SET data_json=? WHERE id=?')->execute([$data, $id]); }
            if ($old['work_file'] !== '' && $old['work_file'] !== $work && !retouch_file_used($pdo, (string) $old['work_file'])) { @unlink(MEDIA_DIR . '/' . basename((string) $old['work_file'])); }
        } else {
            $pdo->prepare('INSERT INTO audio_projects(name, media_id, source, work_file, duration) VALUES(?,?,?,?,?)')->execute([$name, safe_int($post['media_id'] ?? 0), $source, $work, $dur]);
            $id = (int) $pdo->lastInsertId();
            if ($data !== null) { $pdo->prepare('UPDATE audio_projects SET data_json=? WHERE id=?')->execute([$data, $id]); }
        }
        log_change($pdo, 'meta', 0, $old ? 'update' : 'create', 'Projet audio enregistré : ' . $name);
        json_response(['ok' => true, 'result' => ['id' => $id, 'name' => $name, 'work_file' => $work]]);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}

function rename_audio_project(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0); $name = audio_project_name($data['name'] ?? '');
    if ($name === '') { throw new RuntimeException('Donne un nom au projet.'); }
    $s = $pdo->prepare('UPDATE audio_projects SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $id]);
    if (!$s->rowCount()) { throw new RuntimeException('Projet introuvable.'); }
    return ['id' => $id, 'name' => $name];
}

function delete_audio_project(PDO $pdo, array $data): array
{
    $p = audio_project_get($pdo, safe_int($data['id'] ?? 0));
    $pdo->prepare('DELETE FROM audio_projects WHERE id=?')->execute([$p['id']]);
    if ($p['work_file'] !== '' && !retouch_file_used($pdo, (string) $p['work_file'])) { @unlink(MEDIA_DIR . '/' . basename((string) $p['work_file'])); }
    log_change($pdo, 'meta', 0, 'delete', 'Projet audio supprimé : ' . $p['name']);
    return ['ok' => true];
}

function audio_project_has_data(PDO $pdo): bool
{
    static $ok = null;
    if ($ok === null) { $ok = in_array('data_json', array_column($pdo->query('PRAGMA table_info(audio_projects)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true); }
    return $ok;
}

/** Le reste du projet (🎚️ Studio son) : rack d'effets, zones, historique (noms des étapes), multipiste, mode, Son rapide.
 *  JSON objet, 4 Mo au plus ; null = rien envoyé (on garde l'ancien). */
function audio_project_clean_data(PDO $pdo, $raw): ?string
{
    if ($raw === null || $raw === '' || !audio_project_has_data($pdo)) { return null; }
    if (!is_string($raw) || strlen($raw) > 4 * 1024 * 1024) { throw new RuntimeException('Projet trop gros (4 Mo au plus pour les réglages).'); }
    $d = json_decode($raw, true);
    if (!is_array($d) || array_is_list($d) && $d !== []) { throw new RuntimeException('Réglages du projet illisibles.'); }
    $keep = array_intersect_key($d, array_flip(['v', 'mode', 'rack', 'regions', 'history', 'quick', 'multi', 'transcript', 'view']));
    return json_encode($keep, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
}

/** « Studio · 3 pistes · 4 zones » ou « Son rapide » */
function audio_project_summary(string $json): string
{
    $d = json_decode($json, true); if (!is_array($d) || !$d) { return ''; }
    $parts = [($d['mode'] ?? '') === 'quick' ? 'Son rapide' : 'Studio'];
    $tr = is_array($d['multi']['tracks'] ?? null) ? count($d['multi']['tracks']) : 0;
    if ($tr) { $parts[] = $tr . ' piste' . ($tr > 1 ? 's' : ''); }
    $z = is_array($d['regions'] ?? null) ? count($d['regions']) : 0;
    if ($z) { $parts[] = $z . ' zone' . ($z > 1 ? 's' : ''); }
    $fx = is_array($d['rack'] ?? null) ? count($d['rack']) : 0;
    if ($fx) { $parts[] = $fx . ' effet' . ($fx > 1 ? 's' : ''); }
    return implode(' · ', $parts);
}
