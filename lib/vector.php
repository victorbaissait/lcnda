<?php
declare(strict_types=1);

/**
 * ✒️ Dessin vectoriel (façon Illustrator ; interface : assets/js/heritage-vector.js) : formes, plume, textes, blasons,
 * Pathfinder, vectorisation d'images. Un dessin = un document JSON (les objets) et une vignette PNG.
 * Table créée à la première utilisation (sans changer le numéro de structure).
 */

const VECTOR_DOC_MAX = 8000000; // octets de JSON (les images importées y sont en base64)

function vector_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS vector_docs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', doc_json TEXT NOT NULL DEFAULT '{}',
        thumb TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function vector_docs_list(PDO $pdo): array
{
    vector_ensure($pdo);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'thumb' => $r['thumb'], 'updated_at' => $r['updated_at'], 'objects' => (int) $r['n']],
        $pdo->query("SELECT id, name, thumb, updated_at, COALESCE(json_array_length(doc_json, '$.objs'), 0) AS n FROM vector_docs ORDER BY updated_at DESC")->fetchAll());
}

function vector_doc_get(PDO $pdo, int $id): array
{
    vector_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM vector_docs WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Dessin introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'doc' => json_decode((string) $r['doc_json'], true) ?: new stdClass(), 'updated_at' => $r['updated_at']];
}

function save_vector_doc(PDO $pdo, array $data): array
{
    vector_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200) ?: 'Mon dessin';
    $json = json_encode(is_array($data['doc'] ?? null) ? $data['doc'] : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > VECTOR_DOC_MAX) { throw new RuntimeException('Dessin trop lourd (plus de 8 Mo) : retire des images importées.'); }
    $thumb = (string) ($data['thumb'] ?? '');
    if (strlen($thumb) > 400000 || !preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $thumb)) { $thumb = ''; }
    if ($id > 0) {
        $s = $pdo->prepare('UPDATE vector_docs SET name=?, doc_json=?, thumb=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $json, $thumb, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Dessin introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO vector_docs(name, doc_json, thumb) VALUES(?,?,?)')->execute([$name, $json, $thumb]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, 'update', 'Dessin enregistré : ' . $name);
    return ['id' => $id];
}

function rename_vector_doc(PDO $pdo, array $data): array
{
    vector_ensure($pdo);
    $id = safe_int($data['id'] ?? 0); $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($id <= 0 || $name === '') { throw new RuntimeException('Nom manquant.'); }
    $pdo->prepare('UPDATE vector_docs SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $id]);
    return ['id' => $id];
}

function delete_vector_doc(PDO $pdo, array $data): array
{
    vector_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    if ($id <= 0) { throw new RuntimeException('Dessin introuvable.'); }
    $pdo->prepare('DELETE FROM vector_docs WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Dessin supprimé');
    return ['id' => $id];
}
