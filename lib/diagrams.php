<?php
declare(strict_types=1);

/**
 * 📊 Mes diagrammes (Graphiques → « Mes diagrammes » ; interface : assets/js/heritage-diagrams.js).
 * Un diagramme = un type (hémicycle, fer à cheval, frise des membres d'un groupe, barres, camembert…) et ses données
 * (saisies, collées d'un tableur, importées en CSV, ou prises dans l'app), rangées en JSON.
 * Il se rattache à des personnes, des enquêtes, des parties d'enquête et des projets de l'Atelier, et se montre
 * partout : widget, fiche, fiche d'une personne, enquête, Atelier, mise en page.
 * Tables créées à la première utilisation (sans changer le numéro de structure).
 */

const DIAGRAM_LINK_TYPES = ['person' => 'persons', 'investigation' => 'investigations', 'investigation_item' => 'investigation_items', 'atelier_project' => 'atelier_projects'];
const DIAGRAM_SPEC_MAX = 1500000; // octets de JSON

function diagrams_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS diagrams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT '',
        spec_json TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS diagram_links (diagram_id INTEGER NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, PRIMARY KEY (diagram_id, entity_type, entity_id))");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_diagram_links_e ON diagram_links(entity_type, entity_id)");
    $done = true;
}

function diagram_links_map(PDO $pdo, array $ids): array
{
    if (!$ids) { return []; }
    $in = implode(',', array_map('intval', $ids));
    $rows = $pdo->query("SELECT dl.diagram_id, dl.entity_type, dl.entity_id,
            CASE dl.entity_type WHEN 'person' THEN trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,''))
                WHEN 'investigation' THEN i.title WHEN 'investigation_item' THEN ii.title || ' — ' || COALESCE(i2.title,'')
                WHEN 'atelier_project' THEN ap.title END AS name, ii.investigation_id AS inv
        FROM diagram_links dl LEFT JOIN persons p ON dl.entity_type='person' AND p.id=dl.entity_id
        LEFT JOIN investigations i ON dl.entity_type='investigation' AND i.id=dl.entity_id
        LEFT JOIN investigation_items ii ON dl.entity_type='investigation_item' AND ii.id=dl.entity_id LEFT JOIN investigations i2 ON i2.id=ii.investigation_id
        LEFT JOIN atelier_projects ap ON dl.entity_type='atelier_project' AND ap.id=dl.entity_id
        WHERE dl.diagram_id IN ($in) ORDER BY dl.entity_type, name")->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        if ($r['name'] === null) { continue; } // la fiche, l'enquête ou le projet n'existe plus
        $out[(int) $r['diagram_id']][] = ['type' => $r['entity_type'], 'id' => (int) $r['entity_id'], 'name' => (string) $r['name'], 'inv' => (int) ($r['inv'] ?? 0)];
    }
    return $out;
}

function diagrams_all(PDO $pdo, array $q = []): array
{
    diagrams_ensure($pdo);
    $type = (string) ($q['entity_type'] ?? ''); $eid = safe_int($q['entity_id'] ?? 0);
    if ($type !== '' && array_key_exists($type, DIAGRAM_LINK_TYPES) && $eid > 0) {
        $s = $pdo->prepare('SELECT d.* FROM diagrams d WHERE d.id IN (SELECT diagram_id FROM diagram_links WHERE entity_type=? AND entity_id=?)
            OR (?=\'investigation\' AND d.id IN (SELECT dl.diagram_id FROM diagram_links dl JOIN investigation_items ii ON ii.id=dl.entity_id WHERE dl.entity_type=\'investigation_item\' AND ii.investigation_id=?))
            ORDER BY d.position, d.name COLLATE NOCASE');
        $s->execute([$type, $eid, $type, $eid]);
    } else {
        $s = $pdo->query('SELECT * FROM diagrams ORDER BY position, name COLLATE NOCASE');
    }
    $rows = $s->fetchAll();
    $links = diagram_links_map($pdo, array_map(static fn($r) => (int) $r['id'], $rows));
    $labels = labels_for_entities($pdo, 'diagram', array_map(static fn($r) => (int) $r['id'], $rows));
    return ['diagrams' => array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'kind' => $r['kind'], 'spec' => json_decode((string) $r['spec_json'], true) ?: new stdClass(),
        'updated_at' => $r['updated_at'], 'links' => $links[(int) $r['id']] ?? [], 'labels' => $labels[(int) $r['id']] ?? []], $rows)];
}

function save_diagram(PDO $pdo, array $data): array
{
    diagrams_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($name === '') { $name = 'Mon diagramme'; }
    $kind = preg_replace('/[^a-z0-9_]/', '', (string) ($data['kind'] ?? '')) ?: 'columns';
    $spec = is_array($data['spec'] ?? null) ? $data['spec'] : [];
    $json = json_encode($spec, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > DIAGRAM_SPEC_MAX) { throw new RuntimeException('Diagramme trop gros (plus de 1,5 Mo de données).'); }
    if ($id > 0) {
        $s = $pdo->prepare('UPDATE diagrams SET name=?, kind=?, spec_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $kind, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Diagramme introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO diagrams(name, kind, spec_json, position) VALUES(?,?,?,(SELECT COALESCE(MAX(position),0)+10 FROM diagrams))')->execute([$name, $kind, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    if (array_key_exists('links', $data)) { diagram_set_links($pdo, $id, is_array($data['links']) ? $data['links'] : []); }
    if (is_array($data['add_link'] ?? null)) { diagram_add_link($pdo, $id, $data['add_link']); }
    if (array_key_exists('label_ids', $data) && function_exists('set_label_links')) { set_label_links($pdo, ['entity_type' => 'diagram', 'entity_id' => $id, 'label_ids' => is_array($data['label_ids']) ? $data['label_ids'] : []]); }
    log_change($pdo, 'meta', 0, 'update', 'Diagramme enregistré : ' . $name);
    return ['id' => $id];
}

function diagram_add_link(PDO $pdo, int $id, array $l): void
{
    $type = (string) ($l['type'] ?? ''); $eid = safe_int($l['id'] ?? 0);
    if (!array_key_exists($type, DIAGRAM_LINK_TYPES) || $eid <= 0) { return; }
    $t = DIAGRAM_LINK_TYPES[$type];
    $s = $pdo->prepare("SELECT 1 FROM $t WHERE id=?"); $s->execute([$eid]);
    if ($s->fetchColumn()) { $pdo->prepare('INSERT OR IGNORE INTO diagram_links(diagram_id, entity_type, entity_id) VALUES(?,?,?)')->execute([$id, $type, $eid]); }
}

function link_diagram(PDO $pdo, array $data): array
{
    diagrams_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM diagrams WHERE id=?'); $s->execute([$id]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Diagramme introuvable.'); }
    diagram_add_link($pdo, $id, ['type' => $data['type'] ?? '', 'id' => $data['entity_id'] ?? 0]);
    return ['id' => $id];
}

function diagram_set_links(PDO $pdo, int $id, array $links): void
{
    $pdo->prepare('DELETE FROM diagram_links WHERE diagram_id=?')->execute([$id]);
    foreach (array_slice($links, 0, 300) as $l) { if (is_array($l)) { diagram_add_link($pdo, $id, $l); } }
}

function delete_diagram(PDO $pdo, array $data): array
{
    diagrams_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    if ($id <= 0) { throw new RuntimeException('Diagramme introuvable.'); }
    if (array_key_exists('unlink', $data)) { // retirer seulement le lien avec une fiche, une enquête…
        $l = is_array($data['unlink']) ? $data['unlink'] : [];
        $pdo->prepare('DELETE FROM diagram_links WHERE diagram_id=? AND entity_type=? AND entity_id=?')->execute([$id, (string) ($l['type'] ?? ''), safe_int($l['id'] ?? 0)]);
        return ['id' => $id];
    }
    $pdo->prepare('DELETE FROM diagram_links WHERE diagram_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM diagrams WHERE id=?')->execute([$id]);
    if (function_exists('set_label_links')) { set_label_links($pdo, ['entity_type' => 'diagram', 'entity_id' => $id, 'label_ids' => []]); }
    log_change($pdo, 'meta', 0, 'delete', 'Diagramme supprimé');
    return ['id' => $id];
}

function reorder_diagrams(PDO $pdo, array $data): array
{
    diagrams_ensure($pdo);
    $s = $pdo->prepare('UPDATE diagrams SET position=? WHERE id=?');
    foreach (array_slice(is_array($data['ids'] ?? null) ? $data['ids'] : [], 0, 2000) as $i => $id) { $s->execute([($i + 1) * 10, safe_int($id)]); }
    return ['ok' => true];
}

/** Une personne supprimée (to=0) ou fusionnée dans une autre : ses liens suivent */
function diagram_links_person(PDO $pdo, int $from, int $to): void
{
    diagrams_ensure($pdo);
    if ($to > 0) { $pdo->prepare("UPDATE OR IGNORE diagram_links SET entity_id=? WHERE entity_type='person' AND entity_id=?")->execute([$to, $from]); }
    $pdo->prepare("DELETE FROM diagram_links WHERE entity_type='person' AND entity_id=?")->execute([$from]);
}

/** Des personnes pour une frise : naissance, décès (années décimales si la date est précise), sexe */
function diagram_people(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', array_slice($ids, 0, 500)))));
    if (!$ids) { return ['people' => []]; }
    $in = implode(',', $ids);
    $rows = $pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender,
            (SELECT COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT), e.date_text) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL OR COALESCE(e.date_text,'')<>'') ORDER BY t.gedcom_tag='BIRT' DESC, e.sort_date LIMIT 1) AS birth,
            (SELECT COALESCE(NULLIF(e.sort_date,''), CAST(e.year AS TEXT), e.date_text) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI') AND (COALESCE(e.sort_date,'')<>'' OR e.year IS NOT NULL OR COALESCE(e.date_text,'')<>'') ORDER BY t.gedcom_tag='DEAT' DESC, e.sort_date LIMIT 1) AS death
        FROM persons p WHERE p.id IN ($in)")->fetchAll();
    $order = array_flip($ids);
    usort($rows, static fn($a, $b) => $order[(int) $a['id']] <=> $order[(int) $b['id']]);
    return ['people' => array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . $r['last_name']), 'gender' => (string) $r['gender'],
        'birth' => (string) ($r['birth'] ?? ''), 'death' => (string) ($r['death'] ?? '')], $rows)];
}
