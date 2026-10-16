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
    foreach ($pdo->query('SELECT p.id, p.name, p.media_id, p.source, p.work_file, p.duration, p.updated_at, m.title AS media_title FROM audio_projects p LEFT JOIN media m ON m.id = p.media_id ORDER BY p.updated_at DESC, p.id DESC') as $r) {
        $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'media_id' => (int) $r['media_id'], 'source' => $r['source'], 'duration' => (float) $r['duration'], 'updated_at' => $r['updated_at'], 'media_title' => (string) ($r['media_title'] ?? ''), 'exists' => $r['work_file'] !== '' && is_file(MEDIA_DIR . '/' . basename((string) $r['work_file']))];
    }
    return $out;
}

function audio_project_get(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT p.*, m.title AS media_title FROM audio_projects p LEFT JOIN media m ON m.id = p.media_id WHERE p.id=?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Projet introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'media_id' => (int) $r['media_id'], 'source' => $r['source'], 'work_file' => $r['work_file'], 'duration' => (float) $r['duration'], 'media_title' => (string) ($r['media_title'] ?? ''), 'updated_at' => $r['updated_at']];
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
        $work = retouch_store_upload($file, 'audio');
        $dur = max(0.0, min(86400.0, (float) ($post['duration'] ?? 0)));
        if ($old) {
            $pdo->prepare('UPDATE audio_projects SET name=?, work_file=?, duration=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $work, $dur, $id]);
            if ($old['work_file'] !== '' && $old['work_file'] !== $work && !retouch_file_used($pdo, (string) $old['work_file'])) { @unlink(MEDIA_DIR . '/' . basename((string) $old['work_file'])); }
        } else {
            $pdo->prepare('INSERT INTO audio_projects(name, media_id, source, work_file, duration) VALUES(?,?,?,?,?)')->execute([$name, safe_int($post['media_id'] ?? 0), $source, $work, $dur]);
            $id = (int) $pdo->lastInsertId();
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
