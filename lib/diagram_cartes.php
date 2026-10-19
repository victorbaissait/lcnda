<?php
declare(strict_types=1);

/**
 * 🗺️ Diagrammes « Cartes » (assets/js/heritage-diagram-cartes.js) : les lieux de l'arbre avec leurs coordonnées.
 * GET api.php?action=diagram_geo&what=…&from=1700&to=1900&ancestors=1
 *  - what = births | deaths | marriages | all          → {places: [{id, name, county, state, country, code, insee, lat, lon, n}]}
 *    (code = département, admin2_code ; insee = commune, admin4_code : INSEE en France, « BE-46030 »… ailleurs)
 *    (une personne compte une fois par lieu : sa naissance, sinon son baptême ; son décès, sinon sa sépulture)
 *  - what = birth_death | birth_marriage | generation → {places: [...], pairs: [[idDépart, idArrivée, nombre]]}
 *    (naissance → décès ; naissance → premier mariage ; lieu de naissance du parent → lieu de naissance de l'enfant)
 *  - ancestors=1 : seulement les ancêtres de la racine Sosa (et elle-même) ; from / to : années de l'événement de départ.
 * Le rattachement d'un lieu à sa zone (département, canton, région NUTS, pays) se fait dans le navigateur, d'après les
 * coordonnées et le fond de carte choisi ; sans coordonnées, d'après le département, la région ou le pays du lieu.
 */

const DIAGRAM_GEO_WHAT = ['births', 'deaths', 'marriages', 'all', 'birth_death', 'birth_marriage', 'generation'];

function diagram_geo_data(PDO $pdo, array $get): array
{
    $what = (string) ($get['what'] ?? 'births');
    if (!in_array($what, DIAGRAM_GEO_WHAT, true)) { $what = 'births'; }
    $year = static fn($v) => is_numeric($v) && (int) $v >= -3000 && (int) $v <= 3000 ? (int) $v : null;
    $from = $year($get['from'] ?? null); $to = $year($get['to'] ?? null);
    $only = null;
    if (!empty($get['ancestors'])) {
        $only = research_sosa_ancestor_ids($pdo);
        $root = 0;
        try { $root = (int) $pdo->query("SELECT value FROM app_settings WHERE key='genealogie-sosa-root'")->fetchColumn(); } catch (Throwable) {}
        if (!$root) { $root = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn(); }
        if ($root) { $only[$root] = true; }
    }
    $okYear = static fn($y) => ($from === null || ($y !== null && (int) $y >= $from)) && ($to === null || ($y !== null && (int) $y <= $to));
    $okPerson = static fn(int $pid) => $only === null || isset($only[$pid]);

    // un événement par personne et par sorte : le premier de la liste de balises (naissance avant baptême…)
    $firstEvent = static function (array $tags) use ($pdo): array {
        $in = implode(',', array_map(static fn($t) => $pdo->quote($t), $tags));
        $order = 'CASE t.gedcom_tag ' . implode(' ', array_map(static fn($t, $i) => 'WHEN ' . $pdo->quote($t) . " THEN $i", $tags, array_keys($tags))) . ' ELSE 99 END';
        $out = [];
        $sql = "SELECT e.person_id AS pid, e.place_id, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id
                WHERE e.scope='person' AND e.person_id IS NOT NULL AND e.place_id IS NOT NULL AND t.gedcom_tag IN ($in)
                ORDER BY e.person_id, $order, COALESCE(NULLIF(e.sort_date,''),'9999')";
        foreach ($pdo->query($sql) as $r) { $p = (int) $r['pid']; if (!isset($out[$p])) { $out[$p] = [(int) $r['place_id'], $r['year'] === null ? null : (int) $r['year']]; } }
        return $out;
    };
    $marriages = static function () use ($pdo): array { // famille → [lieu, année] (le premier mariage connu), et chaque époux → sa famille la plus ancienne
        $fam = []; $byPerson = [];
        $sql = "SELECT e.family_id, e.place_id, e.year, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id
                WHERE e.scope='family' AND e.place_id IS NOT NULL AND t.gedcom_tag IN ('MARR','MARB','MARC') ORDER BY t.gedcom_tag='MARR' DESC, COALESCE(NULLIF(e.sort_date,''),'9999')";
        foreach ($pdo->query($sql) as $r) {
            $f = (int) $r['family_id']; if (isset($fam[$f])) { continue; }
            $fam[$f] = [(int) $r['place_id'], $r['year'] === null ? null : (int) $r['year'], array_values(array_filter([(int) $r['partner1_id'], (int) $r['partner2_id']]))];
        }
        foreach ($fam as $f => [$pl, $y, $who]) { foreach ($who as $p) { if (!isset($byPerson[$p]) || ($y !== null && ($byPerson[$p][1] === null || $y < $byPerson[$p][1]))) { $byPerson[$p] = [$pl, $y]; } } }
        return [$fam, $byPerson];
    };

    $counts = []; $pairs = [];
    if (in_array($what, ['births', 'deaths', 'all'], true)) {
        $sets = $what === 'births' ? [['BIRT', 'CHR', 'BAPM']] : ($what === 'deaths' ? [['DEAT', 'BURI', 'CREM']] : [['BIRT', 'CHR', 'BAPM'], ['DEAT', 'BURI', 'CREM']]);
        foreach ($sets as $tags) { foreach ($firstEvent($tags) as $p => [$pl, $y]) { if ($okPerson($p) && $okYear($y)) { $counts[$pl] = ($counts[$pl] ?? 0) + 1; } } }
    }
    if ($what === 'marriages' || $what === 'all') {
        [$fam] = $marriages();
        foreach ($fam as [$pl, $y, $who]) { if ($okYear($y) && ($only === null || array_filter($who, $okPerson))) { $counts[$pl] = ($counts[$pl] ?? 0) + 1; } }
    }
    if ($what === 'birth_death' || $what === 'birth_marriage' || $what === 'generation') {
        $births = $firstEvent(['BIRT', 'CHR', 'BAPM']);
        $end = $what === 'birth_death' ? $firstEvent(['DEAT', 'BURI', 'CREM']) : ($what === 'birth_marriage' ? $marriages()[1] : []);
        $add = static function (int $a, int $b) use (&$pairs) { if ($a && $b && $a !== $b) { $k = $a . ':' . $b; $pairs[$k] = ($pairs[$k] ?? 0) + 1; } };
        if ($what === 'generation') {
            $sql = 'SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id';
            foreach ($pdo->query($sql) as $r) {
                $c = (int) $r['child_id']; if (!isset($births[$c]) || !$okPerson($c) || !$okYear($births[$c][1])) { continue; }
                foreach ([(int) $r['partner1_id'], (int) $r['partner2_id']] as $par) { if ($par && isset($births[$par])) { $add($births[$par][0], $births[$c][0]); } }
            }
        } else {
            foreach ($births as $p => [$pl, $y]) { if (isset($end[$p]) && $okPerson($p) && $okYear($y)) { $add($pl, $end[$p][0]); } }
        }
        arsort($pairs); $pairs = array_slice($pairs, 0, 1500, true);
        foreach (array_keys($pairs) as $k) { [$a, $b] = array_map('intval', explode(':', (string) $k)); $counts[$a] = ($counts[$a] ?? 0); $counts[$b] = ($counts[$b] ?? 0); }
    }
    arsort($counts); $counts = array_slice($counts, 0, 6000, true);
    $places = [];
    if ($counts) {
        foreach (array_chunk(array_keys($counts), 500) as $chunk) {
            $in = implode(',', array_map('intval', $chunk));
            foreach ($pdo->query("SELECT id, name, county, state, country, COALESCE(admin2_code,'') AS code, COALESCE(admin4_code,'') AS insee, latitude, longitude FROM places WHERE id IN ($in)") as $r) {
                $id = (int) $r['id'];
                $places[] = ['id' => $id, 'name' => (string) $r['name'], 'county' => (string) $r['county'], 'state' => (string) $r['state'], 'country' => (string) $r['country'], 'code' => (string) $r['code'], 'insee' => (string) $r['insee'],
                    'lat' => is_numeric($r['latitude']) && abs((float) $r['latitude']) <= 90 ? round((float) $r['latitude'], 5) : null,
                    'lon' => is_numeric($r['longitude']) && abs((float) $r['longitude']) <= 180 ? round((float) $r['longitude'], 5) : null, 'n' => $counts[$id] ?? 0];
            }
        }
        usort($places, static fn($a, $b) => $b['n'] <=> $a['n']);
    }
    $out = ['what' => $what, 'places' => $places];
    if ($pairs) { $out['pairs'] = array_map(static function ($k, $n) { [$a, $b] = array_map('intval', explode(':', (string) $k)); return [$a, $b, $n]; }, array_keys($pairs), array_values($pairs)); }
    elseif (in_array($what, ['birth_death', 'birth_marriage', 'generation'], true)) { $out['pairs'] = []; }
    return $out;
}
