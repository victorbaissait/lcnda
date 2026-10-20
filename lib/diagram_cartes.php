<?php
declare(strict_types=1);

/**
 * 🗺️ Diagrammes « Cartes » (assets/js/heritage-diagram-cartes.js) : les lieux de l'arbre avec leurs coordonnées.
 * GET api.php?action=diagram_geo&what=…&from=1700&to=1900&ancestors=1
 *  - what = births | deaths | marriages | all          → {places: [{id, name, county, state, country, code, insee, lat, lon, n}]}
 *    (code = département, admin2_code ; insee = commune, admin4_code : INSEE en France, « BE-46030 »… ailleurs)
 *    (une personne compte une fois par lieu : sa naissance, sinon son baptême ; son décès, sinon sa sépulture)
 *  - what = baptisms | burials | residences | census | occupations : baptêmes seuls, sépultures seules, résidences,
 *    recensements (membres des recensements au lieu du recensement, plus les événements « Recensement »), métiers
 *    (événements OCCU qui ont un lieu) ; une personne compte une fois par lieu (et par année pour les recensements)
 *  - what = departures | arrivals : personnes nées ici et mortes ailleurs, comptées au lieu de naissance (années de
 *    naissance), ou nées ailleurs et mortes ici, comptées au lieu de décès (années de décès)
 *  - what = people | surnames : personnes différentes (un événement au moins dans ce lieu), patronymes différents ;
 *    k = leurs numéros (personnes, ou patronymes numérotés), pour ne compter qu'une fois dans une zone qui réunit plusieurs lieux
 *  - what = age_death : âge moyen au décès, par lieu de décès → n = la moyenne (années, à 0,1 près), w = le nombre de
 *    personnes ; {avg: true, unit: 'ans'} dans la réponse (la carte montre une moyenne, pas un nombre)
 *  - what = sourced : événements qui ont au moins une source (citation : source_links) ou un document joint (media_links)
 *  - what = type&type=<id> : n'importe quelle sorte d'événement de la base (une personne, ou une famille, par lieu)
 *  - what = birth_death | birth_marriage | generation → {places: [...], pairs: [[idDépart, idArrivée, nombre]]}
 *    (naissance → décès ; naissance → premier mariage ; lieu de naissance du parent → lieu de naissance de l'enfant)
 *  - ancestors=1 : seulement les ancêtres de la racine Sosa (et elle-même) ; from / to : années de l'événement compté.
 * Le rattachement d'un lieu à sa zone (département, canton, région NUTS, pays) se fait dans le navigateur, d'après les
 * coordonnées et le fond de carte choisi ; sans coordonnées, d'après le département, la région ou le pays du lieu.
 */

const DIAGRAM_GEO_WHAT = ['births', 'deaths', 'marriages', 'all', 'birth_death', 'birth_marriage', 'generation', 'baptisms', 'burials', 'residences', 'census', 'occupations',
    'departures', 'arrivals', 'people', 'surnames', 'age_death', 'sourced', 'type'];

function diagram_geo_data(PDO $pdo, array $get): array
{
    if (($get['list'] ?? '') === 'types') { // les sortes d'événements (« Une sorte d'événement… »), les plus utilisées d'abord
        return ['types' => array_map(static fn($t) => ['id' => (int) $t['id'], 'label' => (string) $t['label'], 'scope' => (string) $t['scope'], 'icon' => (string) $t['icon'], 'gedcom_tag' => (string) $t['gedcom_tag'], 'usage_count' => (int) $t['n']],
            $pdo->query('SELECT t.id, t.label, t.scope, t.icon, t.gedcom_tag, (SELECT COUNT(*) FROM events e WHERE e.event_type_id=t.id AND e.place_id IS NOT NULL) AS n FROM event_types t WHERE t.is_active=1 ORDER BY n>0 DESC, t.label COLLATE NOCASE')->fetchAll())];
    }
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

    // un événement par personne et par sorte : le premier de la liste de balises (naissance avant baptême…) → [lieu, année, date de tri]
    $firstEvent = static function (array $tags) use ($pdo): array {
        $in = implode(',', array_map(static fn($t) => $pdo->quote($t), $tags));
        $order = 'CASE t.gedcom_tag ' . implode(' ', array_map(static fn($t, $i) => 'WHEN ' . $pdo->quote($t) . " THEN $i", $tags, array_keys($tags))) . ' ELSE 99 END';
        $out = [];
        $sql = "SELECT e.person_id AS pid, e.place_id, e.year, e.sort_date FROM events e JOIN event_types t ON t.id=e.event_type_id
                WHERE e.scope='person' AND e.person_id IS NOT NULL AND e.place_id IS NOT NULL AND t.gedcom_tag IN ($in)
                ORDER BY e.person_id, $order, COALESCE(NULLIF(e.sort_date,''),'9999')";
        foreach ($pdo->query($sql) as $r) { $p = (int) $r['pid']; if (!isset($out[$p])) { $out[$p] = [(int) $r['place_id'], $r['year'] === null ? null : (int) $r['year'], (string) $r['sort_date']]; } }
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
    $partners = null; // famille → ses deux époux (lu une fois, si besoin)
    $partnersOf = static function (int $f) use ($pdo, &$partners): array {
        if ($partners === null) { $partners = []; foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $r) { $partners[(int) $r['id']] = array_values(array_filter([(int) $r['partner1_id'], (int) $r['partner2_id']])); } }
        return $partners[$f] ?? [];
    };
    // les personnes d'un événement : la personne, ou les deux époux d'un événement de famille
    $whoOf = static fn(array $r): array => $r['scope'] === 'person' ? ($r['person_id'] ? [(int) $r['person_id']] : []) : ($r['family_id'] ? $partnersOf((int) $r['family_id']) : []);
    $okWho = static fn(array $who) => $only === null || (bool) array_filter($who, $okPerson);
    // les événements qui ont un lieu (filtre SQL sur la sorte)
    $events = static fn(string $where) => $pdo->query("SELECT e.id, e.scope, e.person_id, e.family_id, e.place_id, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.place_id IS NOT NULL AND ($where)");
    $tags = static fn(array $t) => 't.gedcom_tag IN (' . implode(',', array_map(static fn($x) => $pdo->quote($x), $t)) . ')';

    $counts = []; $pairs = []; $weights = null; $type = null; $keys = null;
    $bump = static function (int $pl, $n = 1) use (&$counts) { $counts[$pl] = ($counts[$pl] ?? 0) + $n; };
    // une personne (ou une famille) compte une fois par lieu ; $perPerson : chaque époux d'un événement de famille compte
    $countOnce = static function (iterable $rows, bool $perPerson) use ($bump, $whoOf, $okWho, $okYear): void {
        $seen = [];
        foreach ($rows as $r) {
            if (!$okYear($r['year'])) { continue; }
            $who = $whoOf($r); if (!$okWho($who)) { continue; }
            $pl = (int) $r['place_id'];
            $keys = $r['scope'] === 'person' ? ['p' . $r['person_id']] : ($perPerson && $who ? array_map(static fn($p) => 'p' . $p, $who) : ['f' . $r['family_id']]);
            foreach ($keys as $k) { $k .= ':' . $pl; if (!isset($seen[$k])) { $seen[$k] = true; $bump($pl); } }
        }
    };

    if (in_array($what, ['births', 'deaths', 'all'], true)) {
        $sets = $what === 'births' ? [['BIRT', 'CHR', 'BAPM']] : ($what === 'deaths' ? [['DEAT', 'BURI', 'CREM']] : [['BIRT', 'CHR', 'BAPM'], ['DEAT', 'BURI', 'CREM']]);
        foreach ($sets as $tg) { foreach ($firstEvent($tg) as $p => [$pl, $y]) { if ($okPerson($p) && $okYear($y)) { $bump($pl); } } }
    }
    if ($what === 'marriages' || $what === 'all') {
        [$fam] = $marriages();
        foreach ($fam as [$pl, $y, $who]) { if ($okYear($y) && ($only === null || array_filter($who, $okPerson))) { $bump($pl); } }
    }
    if ($what === 'baptisms') { $countOnce($events("e.scope='person' AND " . $tags(['CHR', 'BAPM'])), true); }
    if ($what === 'burials') { $countOnce($events("e.scope='person' AND " . $tags(['BURI'])), true); }
    if ($what === 'residences') { $countOnce($events($tags(['RESI']) . " OR t.slug='domicile'"), true); } // « Lieu de résidence » et « Domicile »
    if ($what === 'occupations') { $countOnce($events($tags(['OCCU'])), true); }
    if ($what === 'type') {
        $tid = (int) ($get['type'] ?? 0);
        $type = $tid > 0 ? ($pdo->query('SELECT id, label FROM event_types WHERE id=' . $tid)->fetch() ?: null) : null;
        if ($type) { $countOnce($events('e.event_type_id=' . $tid), false); }
    }
    if ($what === 'census') { // les membres des recensements (au lieu du recensement), et les événements « Recensement »
        $seen = [];
        $add = static function (string $k, int $pl) use (&$seen, $bump) { if (!isset($seen[$k])) { $seen[$k] = true; $bump($pl); } };
        foreach ($pdo->query('SELECT m.id, m.person_id, r.place_id, r.year FROM census_members m JOIN census_records r ON r.id=m.census_id WHERE r.place_id IS NOT NULL') as $r) {
            $p = (int) $r['person_id']; if (!$okYear($r['year']) || ($only !== null && (!$p || !$okPerson($p)))) { continue; }
            $add($p ? "p$p:{$r['place_id']}:{$r['year']}" : 'm' . $r['id'], (int) $r['place_id']);
        }
        foreach ($events($tags(['CENS'])) as $r) {
            if (!$okYear($r['year'])) { continue; }
            foreach ($whoOf($r) as $p) { if ($okPerson($p)) { $add("p$p:{$r['place_id']}:{$r['year']}", (int) $r['place_id']); } }
        }
    }
    if ($what === 'people' || $what === 'surnames') { // personnes (ou patronymes) différentes, avec un événement au moins dans le lieu
        $byPlace = [];
        foreach ($events('1') as $r) { if (!$okYear($r['year'])) { continue; } foreach ($whoOf($r) as $p) { if ($okPerson($p)) { $byPlace[(int) $r['place_id']][$p] = true; } } }
        foreach ($pdo->query('SELECT m.person_id, r.place_id, r.year FROM census_members m JOIN census_records r ON r.id=m.census_id WHERE r.place_id IS NOT NULL AND m.person_id IS NOT NULL') as $r) {
            $p = (int) $r['person_id']; if ($okYear($r['year']) && $okPerson($p)) { $byPlace[(int) $r['place_id']][$p] = true; }
        }
        $names = [];
        if ($what === 'surnames') { foreach ($pdo->query("SELECT id, last_name FROM persons WHERE TRIM(COALESCE(last_name,''))<>''") as $r) { $names[(int) $r['id']] = mb_strtolower(trim((string) $r['last_name'])); } }
        $keys = []; $num = [];
        foreach ($byPlace as $pl => $ps) {
            if ($what === 'people') { $counts[$pl] = count($ps); $keys[$pl] = array_keys($ps); continue; }
            $set = []; foreach (array_keys($ps) as $p) { if (isset($names[$p])) { $set[$num[$names[$p]] ??= count($num) + 1] = true; } }
            if ($set) { $counts[$pl] = count($set); $keys[$pl] = array_keys($set); }
        }
    }
    if ($what === 'sourced') { // les événements avec une source (citation) ou un document joint : chaque acte compte
        $ids = [];
        foreach ($pdo->query("SELECT entity_id FROM source_links WHERE entity_type='event' UNION SELECT entity_id FROM media_links WHERE entity_type='event'") as $r) { $ids[(int) $r['entity_id']] = true; }
        if ($ids) { foreach ($events('1') as $r) { if (isset($ids[(int) $r['id']]) && $okYear($r['year']) && $okWho($whoOf($r))) { $bump((int) $r['place_id']); } } }
    }
    if ($what === 'departures' || $what === 'arrivals' || $what === 'age_death') {
        $births = $firstEvent(['BIRT', 'CHR', 'BAPM']); $deaths = $firstEvent(['DEAT', 'BURI', 'CREM']); $sum = [];
        if ($what === 'age_death') { $weights = []; }
        foreach ($deaths as $p => [$dpl, $dy, $dsd]) {
            if (!$okPerson($p) || !isset($births[$p])) { continue; }
            [$bpl, $by, $bsd] = $births[$p];
            if ($what === 'departures') { if ($bpl !== $dpl && $okYear($by)) { $bump($bpl); } continue; }
            if (!$okYear($dy)) { continue; }
            if ($what === 'arrivals') { if ($bpl !== $dpl) { $bump($dpl); } continue; }
            $age = diagram_geo_age($bsd, $by, $dsd, $dy); if ($age === null) { continue; }
            $sum[$dpl] = ($sum[$dpl] ?? 0) + $age; $weights[$dpl] = ($weights[$dpl] ?? 0) + 1;
        }
        if ($what === 'age_death') { foreach ($weights as $pl => $w) { $counts[$pl] = round($sum[$pl] / $w, 1); } }
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
    if ($weights !== null) { arsort($weights); $counts = array_intersect_key($counts, array_slice($weights, 0, 6000, true)); } // moyennes : les lieux les plus fournis d'abord
    else { arsort($counts); $counts = array_slice($counts, 0, 6000, true); }
    $places = [];
    if ($counts) {
        foreach (array_chunk(array_keys($counts), 500) as $chunk) {
            $in = implode(',', array_map('intval', $chunk));
            foreach ($pdo->query("SELECT id, name, county, state, country, COALESCE(admin2_code,'') AS code, COALESCE(admin4_code,'') AS insee, latitude, longitude FROM places WHERE id IN ($in)") as $r) {
                $id = (int) $r['id'];
                $pl = ['id' => $id, 'name' => (string) $r['name'], 'county' => (string) $r['county'], 'state' => (string) $r['state'], 'country' => (string) $r['country'], 'code' => (string) $r['code'], 'insee' => (string) $r['insee'],
                    'lat' => is_numeric($r['latitude']) && abs((float) $r['latitude']) <= 90 ? round((float) $r['latitude'], 5) : null,
                    'lon' => is_numeric($r['longitude']) && abs((float) $r['longitude']) <= 180 ? round((float) $r['longitude'], 5) : null, 'n' => $counts[$id] ?? 0];
                if ($weights !== null) { $pl['w'] = $weights[$id] ?? 0; }
                if ($keys !== null) { $pl['k'] = $keys[$id] ?? []; }
                $places[] = $pl;
            }
        }
        usort($places, $weights !== null ? static fn($a, $b) => $b['w'] <=> $a['w'] : static fn($a, $b) => $b['n'] <=> $a['n']);
    }
    $out = ['what' => $what, 'places' => $places];
    if ($weights !== null) { $out['avg'] = true; $out['unit'] = 'ans'; }
    if ($keys !== null) { $out['distinct'] = true; }
    if ($what === 'type') { $out['type'] = $type ? ['id' => (int) $type['id'], 'label' => (string) $type['label']] : null; }
    if ($pairs) { $out['pairs'] = array_map(static function ($k, $n) { [$a, $b] = array_map('intval', explode(':', (string) $k)); return [$a, $b, $n]; }, array_keys($pairs), array_values($pairs)); }
    elseif (in_array($what, ['birth_death', 'birth_marriage', 'generation'], true)) { $out['pairs'] = []; }
    return $out;
}

/** l'âge au décès (en années) : d'après les dates complètes si on les a, sinon d'après les années ; null si invraisemblable */
function diagram_geo_age(string $birth, ?int $by, string $death, ?int $dy): ?float
{
    $full = static fn(string $d) => preg_match('/^(-?\d{4})-(\d{2})-(\d{2})/', $d, $m) && (int) $m[2] > 0 && (int) $m[3] > 0 ? [(int) $m[1], (int) $m[2], (int) $m[3]] : null;
    $b = $full($birth); $d = $full($death);
    if ($b && $d) { $age = $d[0] - $b[0] - (($d[1] < $b[1] || ($d[1] === $b[1] && $d[2] < $b[2])) ? 1 : 0); }
    elseif ($by !== null && $dy !== null) { $age = $dy - $by; }
    else { return null; }
    return $age >= 0 && $age <= 120 ? (float) $age : null;
}
