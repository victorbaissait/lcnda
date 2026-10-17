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
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'thumb' => $r['thumb'], 'updated_at' => $r['updated_at'], 'objects' => (int) $r['n'], 'kind' => (string) ($r['kind'] ?? '')],
        $pdo->query("SELECT id, name, thumb, updated_at, COALESCE(json_array_length(doc_json, '$.objs'), 0) AS n, COALESCE(json_extract(doc_json, '$.kind'), '') AS kind FROM vector_docs ORDER BY updated_at DESC")->fetchAll());
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

/**
 * 🗺️ Mode Plan : les lieux de la base (et les adresses précises des événements) qui tombent dans un cadre (n, s, w, e en degrés),
 * pour les poser sur un plan situé.
 */
function vector_map_places(PDO $pdo, float $n, float $s, float $w, float $e): array
{
    if (!($n > $s) || !($e > $w) || $n > 90 || $s < -90 || ($e - $w) > 30) { throw new RuntimeException('Cadre de carte invalide.'); }
    $places = [];
    $st = $pdo->prepare("SELECT pl.id, pl.name, pl.county, pl.country, pl.latitude AS lat, pl.longitude AS lon, (SELECT count(*) FROM events e WHERE e.place_id=pl.id) AS n
        FROM places pl WHERE pl.latitude BETWEEN ? AND ? AND pl.longitude BETWEEN ? AND ? ORDER BY n DESC, pl.name LIMIT 300");
    $st->execute([$s, $n, $w, $e]);
    $seen = [];
    foreach ($st->fetchAll() as $r) {
        $key = mb_strtolower(trim((string) $r['name'])) . '|' . round((float) $r['lat'], 2) . '|' . round((float) $r['lon'], 2); // le même lieu saisi plusieurs fois : une seule fois sur le plan
        if (isset($seen[$key])) { continue; }
        $seen[$key] = true;
        $places[] = ['id' => (int) $r['id'], 'label' => (string) $r['name'], 'detail' => trim(implode(', ', array_filter([(string) $r['county'], ((int) $r['n']) ? $r['n'] . ' événement(s)' : '']))), 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon']];
    }
    $addresses = [];
    $st = $pdo->prepare("SELECT e.id, e.address, e.year, e.precise_lat AS lat, e.precise_lon AS lon, t.label AS type, p.id AS person_id, trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) AS person
        FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id
        WHERE e.precise_lat BETWEEN ? AND ? AND e.precise_lon BETWEEN ? AND ? ORDER BY e.year LIMIT 300");
    $st->execute([$s, $n, $w, $e]);
    $seen = [];
    foreach ($st->fetchAll() as $r) {
        $label = trim((string) $r['address']) ?: trim((string) $r['person']);
        $key = mb_strtolower($label) . '|' . round((float) $r['lat'], 4) . '|' . round((float) $r['lon'], 4);
        if (isset($seen[$key])) { continue; }
        $seen[$key] = true;
        $addresses[] = ['id' => (int) $r['id'], 'label' => mb_substr($label ?: 'Adresse', 0, 80), 'detail' => trim(implode(' · ', array_filter([(string) $r['person'], (string) $r['type'], $r['year'] ? (string) $r['year'] : '']))),
            'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'year' => $r['year'] ? (int) $r['year'] : null, 'person_id' => (int) $r['person_id'], 'person' => (string) $r['person'],
            'note' => trim(implode(' ', array_filter([(string) $r['type'], (string) $r['person'], $r['year'] ? '(' . $r['year'] . ')' : ''])))];
    }
    return ['places' => $places, 'addresses' => $addresses];
}
