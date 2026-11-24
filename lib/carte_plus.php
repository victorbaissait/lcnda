<?php
declare(strict_types=1);
/* LCNDA — 🗺 Carte et 📊 Graphiques : petites demandes en lecture seule (appelées par cartes_perso&op=map_…, lib/cartes_perso.php).
 *  map_scope    : les personnes gardées par les filtres de lignée (le moteur de « Mes cartes » : mcp_person_scope) ; nosource=1 : les fiches sans aucune source ;
 *  map_gravity  : le centre de gravité des naissances des ancêtres (Sosa), une génération par point ;
 *  map_unplaced : combien de lieux utilisés n'ont pas de position (le compteur de la barre de la Carte) ;
 *  map_place    : la position d'un lieu (« Aller à un lieu »). */

function carte_plus_op(PDO $pdo, string $op): array
{
    return match ($op) {
        'map_scope' => carte_plus_scope($pdo, (string) ($_GET['f'] ?? '')),
        'map_gravity' => carte_plus_gravity($pdo),
        'map_unplaced' => carte_plus_unplaced($pdo),
        'map_place' => carte_plus_place($pdo, safe_int($_GET['id'] ?? 0)),
        default => throw new RuntimeException('Demande de carte inconnue.'),
    };
}

/** f : {persons:[id], rel, gens, sosa, sosaGens, side, branch, labels:[id], gender, nosource} → {ids:[…], all:false} ; sans filtre : {all:true} */
function carte_plus_scope(PDO $pdo, string $json): array
{
    $f = $json !== '' ? json_decode($json, true, 16, JSON_THROW_ON_ERROR) : [];
    $f = is_array($f) ? $f : [];
    $layer = mcp_clean_layer(['kind' => 'births', 'f' => $f], 0);
    $scope = mcp_person_scope($pdo, $layer['f']);
    if (!empty($f['nosource']) && mcp_has_table($pdo, 'source_links')) {
        $hasEv = mcp_has_col($pdo, 'events', 'source_id');
        $sql = "SELECT p.id FROM persons p WHERE NOT EXISTS (SELECT 1 FROM source_links sl WHERE sl.entity_type='person' AND sl.entity_id=p.id)
            AND NOT EXISTS (SELECT 1 FROM events e JOIN source_links sl ON sl.entity_type='event' AND sl.entity_id=e.id WHERE e.person_id=p.id)"
            . ($hasEv ? ' AND NOT EXISTS (SELECT 1 FROM events e WHERE e.person_id=p.id AND COALESCE(e.source_id,0)>0)' : '');
        $set = array_fill_keys(array_map('intval', $pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN)), true);
        $scope = $scope === null ? $set : array_intersect_key($scope, $set);
    }
    if ($scope === null) { return ['all' => true, 'ids' => [], 'n' => 0]; }
    $ids = array_map('intval', array_keys($scope));
    sort($ids);
    return ['all' => false, 'ids' => $ids, 'n' => count($ids)];
}

/** un point par génération : la moyenne des lieux de naissance (ou baptême) des ancêtres de la personne de départ */
function carte_plus_gravity(PDO $pdo): array
{
    $sosa = mcp_sosa($pdo, 30);
    if (!$sosa) { return ['generations' => [], 'note' => 'Choisis d’abord la personne de départ (Sosa 1).']; }
    $ids = array_keys($sosa);
    $acc = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', array_map('intval', $chunk));
        $rows = $pdo->query("SELECT e.person_id, e.year, COALESCE(e.precise_lat, pl.latitude) AS lat, COALESCE(e.precise_lon, pl.longitude) AS lon, t.gedcom_tag AS tag
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id IN ($in) AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY CASE t.gedcom_tag WHEN 'BIRT' THEN 0 ELSE 1 END")->fetchAll();
        $seen = [];
        foreach ($rows as $r) {
            $pid = (int) $r['person_id'];
            if (isset($seen[$pid]) || !mcp_ok_coord($r['lat'], $r['lon'])) { continue; }
            $seen[$pid] = true;
            $gen = (int) floor(log((float) $sosa[$pid], 2)) + 1;
            $a = $acc[$gen] ?? ['lat' => 0.0, 'lon' => 0.0, 'n' => 0, 'y0' => null, 'y1' => null];
            $a['lat'] += (float) $r['lat']; $a['lon'] += (float) $r['lon']; $a['n']++;
            $y = $r['year'] !== null ? (int) $r['year'] : null;
            if ($y) { $a['y0'] = $a['y0'] === null ? $y : min($a['y0'], $y); $a['y1'] = $a['y1'] === null ? $y : max($a['y1'], $y); }
            $acc[$gen] = $a;
        }
    }
    ksort($acc);
    $out = [];
    foreach ($acc as $g => $a) { $out[] = ['gen' => $g, 'lat' => round($a['lat'] / $a['n'], 5), 'lon' => round($a['lon'] / $a['n'], 5), 'n' => $a['n'], 'y0' => $a['y0'], 'y1' => $a['y1']]; }
    return ['generations' => $out, 'note' => $out ? '' : 'Aucune naissance d’ancêtre n’a de lieu placé sur la carte.'];
}

/** les lieux rattachés à au moins un événement, sans position utilisable */
function carte_plus_unplaced(PDO $pdo): array
{
    $n = (int) $pdo->query("SELECT count(*) FROM places pl WHERE EXISTS (SELECT 1 FROM events e WHERE e.place_id=pl.id)
        AND (pl.latitude IS NULL OR pl.longitude IS NULL OR (pl.latitude=0 AND pl.longitude=0))")->fetchColumn();
    $ev = (int) $pdo->query("SELECT count(*) FROM events e JOIN places pl ON pl.id=e.place_id
        WHERE pl.latitude IS NULL OR pl.longitude IS NULL OR (pl.latitude=0 AND pl.longitude=0)")->fetchColumn();
    return ['places' => $n, 'events' => $ev];
}

function carte_plus_place(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, name, county, country, latitude, longitude FROM places WHERE id=?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Lieu introuvable.'); }
    $ok = mcp_ok_coord($r['latitude'], $r['longitude']);
    return ['place' => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'county' => (string) ($r['county'] ?? ''), 'country' => (string) ($r['country'] ?? ''),
        'lat' => $ok ? (float) $r['latitude'] : null, 'lon' => $ok ? (float) $r['longitude'] : null]];
}
