<?php
declare(strict_types=1);

/**
 * 🌒 La Lune et les éclipses : les lieux datés de chaque personne, pour savoir quelles éclipses la famille a pu voir.
 * Lecture seule (GET lune_family) ; tous les calculs d'astronomie sont faits dans le navigateur (assets/js/app-lune-core.js,
 * affiché par assets/js/heritage-lune.js : Listes → Histoire → « 🌒 Éclipses vues par la famille »).
 * Réponse : {people: [{id, name, first, living, events: [[date_text, sort_date, année, lat, lon, lieu, pays, balise], …]}]}
 * Seulement les événements avec un lieu placé sur la carte ; pas les animaux ; en mode consultation, pas les événements 🔒.
 * Essai : tests/test-lune.js
 */

function lune_family(PDO $pdo): array
{
    $cols = array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $pcols = array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $lat = in_array('precise_lat', $cols, true) ? 'COALESCE(e.precise_lat, pl.latitude)' : 'pl.latitude';
    $lon = in_array('precise_lon', $cols, true) ? 'COALESCE(e.precise_lon, pl.longitude)' : 'pl.longitude';
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    $priv = $kiosk && in_array('is_private', $cols, true) ? ' AND COALESCE(e.is_private, 0)=0' : '';
    $sql = "SELECT x.pid, e.date_text, e.sort_date, e.year, $lat AS lat, $lon AS lon, pl.name AS place, pl.country, t.gedcom_tag AS tag
        FROM (SELECT id AS eid, person_id AS pid FROM events WHERE person_id IS NOT NULL
              UNION ALL SELECT e.id, f.partner1_id FROM events e JOIN families f ON f.id=e.family_id WHERE f.partner1_id IS NOT NULL
              UNION ALL SELECT e.id, f.partner2_id FROM events e JOIN families f ON f.id=e.family_id WHERE f.partner2_id IS NOT NULL) x
        JOIN events e ON e.id=x.eid JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
        WHERE $lat IS NOT NULL AND $lon IS NOT NULL$priv";
    $ev = [];
    foreach ($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $ev[(int) $r['pid']][] = [(string) $r['date_text'], (string) ($r['sort_date'] ?? ''), $r['year'] !== null ? (int) $r['year'] : null,
            round((float) $r['lat'], 4), round((float) $r['lon'], 4), (string) $r['place'], (string) ($r['country'] ?? ''), (string) $r['tag']];
    }
    if (!$ev) { return ['people' => []]; }
    $animal = in_array('kind', $pcols, true) ? " AND COALESCE(kind, 'human')<>'animal'" : '';
    $people = [];
    $q = $pdo->query('SELECT id, first_name, last_name, living_status FROM persons WHERE id IN (' . implode(',', array_map('intval', array_keys($ev))) . ")$animal");
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $id = (int) $p['id'];
        $people[] = ['id' => $id, 'first' => trim((string) $p['first_name']), 'name' => trim($p['first_name'] . ' ' . $p['last_name']),
            'living' => $p['living_status'] === 'living', 'events' => $ev[$id]];
    }
    return ['people' => $people];
}
