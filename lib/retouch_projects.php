<?php
declare(strict_types=1);

/**
 * 🎚️ Projets de retouche : le travail en cours de la Retouche (corrections, réglages, filtres, recadrage, calques,
 * groupes, calques de réglage, masques et sélections) gardé en JSON dans retouch_projects (structure n°45), pour
 * rouvrir la photo et continuer. Les masques sont des images PNG intégrées ; la photo de départ est un média de la base.
 */

const RETOUCH_PROJECT_MAX = 40 * 1024 * 1024;

function retouch_project_name($v): string
{
    return mb_substr(trim(str_replace(["\r", "\n", "\0"], ' ', (string) (is_scalar($v) ? $v : ''))), 0, 160);
}

function retouch_projects_list(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT p.id, p.name, p.media_id, p.source, p.thumb, p.updated_at, m.title AS media_title FROM retouch_projects p LEFT JOIN media m ON m.id = p.media_id ORDER BY p.updated_at DESC, p.id DESC') as $r) {
        $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'media_id' => (int) $r['media_id'], 'source' => $r['source'], 'thumb' => $r['thumb'], 'updated_at' => $r['updated_at'], 'media_title' => (string) ($r['media_title'] ?? ''), 'exists' => $r['source'] !== '' && is_file(MEDIA_DIR . '/' . basename((string) $r['source']))];
    }
    return $out;
}

function retouch_project_get(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT p.*, m.title AS media_title FROM retouch_projects p LEFT JOIN media m ON m.id = p.media_id WHERE p.id=?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Projet introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'media_id' => (int) $r['media_id'], 'source' => $r['source'], 'media_title' => (string) ($r['media_title'] ?? ''), 'updated_at' => $r['updated_at'], 'project' => json_decode((string) $r['data_json'], true) ?: new stdClass()];
}

function save_retouch_project(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = retouch_project_name($data['name'] ?? '');
    if ($name === '') { throw new RuntimeException('Donne un nom au projet.'); }
    $media = safe_int($data['media_id'] ?? 0);
    $source = (string) ($data['source'] ?? '');
    if (!preg_match('/^[A-Za-z0-9._-]{1,200}$/', $source) || !is_file(MEDIA_DIR . '/' . $source)) { throw new RuntimeException('La photo de départ n’est plus dans les médias.'); }
    $thumb = (string) ($data['thumb'] ?? '');
    if ($thumb !== '' && (strlen($thumb) > 400000 || !preg_match('#^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$#', $thumb))) { $thumb = ''; }
    $p = $data['project'] ?? null;
    if (!is_array($p) || !is_array($p['st'] ?? null) || !is_array($p['layers'] ?? null)) { throw new RuntimeException('Projet illisible.'); }
    foreach ((array) ($p['masks'] ?? []) as $k => $m) {
        if (!preg_match('/^k\d{1,6}$/', (string) $k) || !is_string($m) || !preg_match('#^data:image/png;base64,[A-Za-z0-9+/=]+$#', $m)) { throw new RuntimeException('Masque illisible dans le projet.'); }
    }
    $json = json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) { throw new RuntimeException('Projet illisible.'); }
    if (strlen($json) > RETOUCH_PROJECT_MAX) { throw new RuntimeException('Projet trop lourd (40 Mo au plus) : retire des sélections ou des masques.'); }
    if ($id) {
        $s = $pdo->prepare('UPDATE retouch_projects SET name=?, media_id=?, source=?, thumb=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $s->execute([$name, $media, $source, $thumb, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Projet introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO retouch_projects(name, media_id, source, thumb, data_json) VALUES(?,?,?,?,?)')->execute([$name, $media, $source, $thumb, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, ($data['id'] ?? 0) ? 'update' : 'create', 'Projet de retouche enregistré : ' . $name);
    return ['id' => $id, 'name' => $name];
}

function rename_retouch_project(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0); $name = retouch_project_name($data['name'] ?? '');
    if ($name === '') { throw new RuntimeException('Donne un nom au projet.'); }
    $s = $pdo->prepare('UPDATE retouch_projects SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $id]);
    if (!$s->rowCount()) { throw new RuntimeException('Projet introuvable.'); }
    return ['id' => $id, 'name' => $name];
}

function delete_retouch_project(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT name FROM retouch_projects WHERE id=?'); $s->execute([$id]);
    $name = $s->fetchColumn();
    if ($name === false) { throw new RuntimeException('Projet introuvable.'); }
    $pdo->prepare('DELETE FROM retouch_projects WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Projet de retouche supprimé : ' . $name);
    return ['ok' => true];
}
