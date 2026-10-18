<?php
declare(strict_types=1);

/**
 * 🎬 Projets de montage vidéo : le montage (pistes, morceaux, textes, sons, couleurs, images clés) est gardé en JSON
 * dans montage_projects (structure n°44) pour être rouvert et continué. Les vidéos, photos et sons du projet sont des
 * médias de la base (media/…) : les fichiers importés de l'ordinateur y sont envoyés avant l'enregistrement du projet.
 */

const MONTAGE_PROJECT_MAX = 4 * 1024 * 1024;

/** Une adresse de média acceptée dans un projet : seulement un fichier de la base */
function montage_src_ok(string $src): bool
{
    return (bool) preg_match('#^media/[A-Za-z0-9._%\-]{1,240}$#', $src);
}

function montage_projects_list(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT id, name, data_json, updated_at FROM montage_projects ORDER BY updated_at DESC, id DESC') as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $thumb = '';
        foreach ($d['sources'] ?? [] as $s) { if (is_array($s) && ($s['kind'] ?? '') === 'image' && montage_src_ok((string) ($s['src'] ?? ''))) { $thumb = (string) $s['src']; break; } }
        $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'updated_at' => $r['updated_at'], 'clips' => count($d['v1'] ?? []) + count($d['v2'] ?? []), 'sources' => count($d['sources'] ?? []), 'thumb' => $thumb, 'duration' => (float) ($d['duration'] ?? 0)];
    }
    return $out;
}

function montage_project_get(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, name, data_json, updated_at FROM montage_projects WHERE id=?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Projet introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'updated_at' => $r['updated_at'], 'project' => json_decode((string) $r['data_json'], true) ?: new stdClass()];
}

function save_montage_project(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(trim(str_replace(["\r", "\n", "\0"], ' ', (string) (is_scalar($data['name'] ?? '') ? $data['name'] : ''))), 0, 160);
    if ($name === '') { throw new RuntimeException('Donne un nom au projet.'); }
    $p = $data['project'] ?? null;
    if (!is_array($p) || !is_array($p['sources'] ?? null) || !is_array($p['v1'] ?? null) || !is_array($p['tracks'] ?? null)) { throw new RuntimeException('Projet illisible.'); }
    if (count($p['sources']) > 500) { throw new RuntimeException('Trop de rushes dans le projet (500 au plus).'); }
    foreach ($p['sources'] as $i => $s) {
        if (!is_array($s) || !montage_src_ok((string) ($s['src'] ?? ''))) { throw new RuntimeException('Un rush du projet n’est pas un média de la base.'); }
        if (!in_array($s['kind'] ?? '', ['video', 'image', 'audio'], true)) { throw new RuntimeException('Rush illisible.'); }
    }
    $p = json_keep_objects($p, ['look', 'tf', 'kf', 'fx', 'afx', 'duck']); // couleurs, cadrage, images clés d'un morceau : des objets, même vides
    $json = json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) { throw new RuntimeException('Projet illisible.'); }
    if (strlen($json) > MONTAGE_PROJECT_MAX) { throw new RuntimeException('Projet trop lourd (4 Mo au plus).'); }
    if ($id) {
        $s = $pdo->prepare('UPDATE montage_projects SET name=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $s->execute([$name, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Projet introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO montage_projects(name, data_json) VALUES(?,?)')->execute([$name, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, ($data['id'] ?? 0) ? 'update' : 'create', 'Projet de montage enregistré : ' . $name);
    return ['id' => $id, 'name' => $name];
}

function delete_montage_project(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT name FROM montage_projects WHERE id=?'); $s->execute([$id]);
    $name = $s->fetchColumn();
    if ($name === false) { throw new RuntimeException('Projet introuvable.'); }
    $pdo->prepare('DELETE FROM montage_projects WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Projet de montage supprimé : ' . $name);
    return ['ok' => true];
}
