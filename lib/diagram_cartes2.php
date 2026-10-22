<?php
declare(strict_types=1);

/**
 * LCNDA — 🗺️ Cartes et arbres en plus (assets/js/heritage-diagram-cartes2.js) : les données prises dans l'arbre.
 * GET api.php?action=diagram_cartes2&what=…   (lecture seule, tout est borné ; les textes sont échappés dans le navigateur)
 *  - points  : un point par événement qui a un lieu (&ev=births|deaths|marriages|residences|all|type, &type=<id> pour
 *              « une sorte d'événement », &ancestors=1, &from=, &to=) → {places: {id: [nom, département, région, pays,
 *              lat, lon, n° INSEE]}, events: [[personne, lieu, année, sorte]], people: {id: [prénom, nom, sexe, naissance,
 *              décès, métier]}, kinds: [noms des sortes], truncated} ; un mariage compte pour chacun des deux époux ;
 *  - story   : les événements d'une personne (&person=id), les siens et ceux de ses unions, dans l'ordre → {name, steps} ;
 *  - godnames: parrains et marraines (témoins dont le rôle dit « parrain » ou « marraine ») des naissances et baptêmes,
 *              leur prénom, celui du filleul, leur lien de parenté (grand-parent, oncle ou tante, frère ou sœur) ;
 *  - causes  : les causes de décès relevées (champ « cause » des décès et sépultures), avec les personnes ;
 *  - people  : les personnes derrière un point, une alvéole, une cause (&ids=1,2,3, au plus 500), pour la fenêtre « qui est compté ».
 */

require_once __DIR__ . '/diagram_genea.php'; // dgn_links, dgn_root, dgn_name

const DC2_WHAT = ['points', 'story', 'godnames', 'causes', 'people'];
const DC2_MAX_EVENTS = 12000;

/** les personnes demandées : [id → [prénom, nom, sexe, année de naissance, année de décès, métier]] */
function dc2_people(PDO $pdo, array $ids): array
{
    $out = [];
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    foreach (array_chunk($ids, 500) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT id, first_name, last_name, gender, occupation FROM persons WHERE id IN ($in)") as $r) {
            $out[(int) $r['id']] = [mb_substr(trim((string) $r['first_name']), 0, 80), mb_substr(trim((string) $r['last_name']), 0, 80), (string) $r['gender'], null, null, mb_substr(trim((string) ($r['occupation'] ?? '')), 0, 80)];
        }
        foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id
                WHERE e.person_id IN ($in) AND e.year IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') GROUP BY e.person_id, t.gedcom_tag") as $r) {
            $p = (int) $r['person_id']; if (!isset($out[$p])) { continue; }
            $k = in_array($r['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 3 : 4;
            if ($out[$p][$k] === null || ($r['gedcom_tag'] === 'BIRT' || $r['gedcom_tag'] === 'DEAT')) { $out[$p][$k] = (int) $r['y']; }
        }
    }
    return $out;
}

/** les lieux demandés : [id → [nom, département, région, pays, lat, lon, n° INSEE]] */
function dc2_places(PDO $pdo, array $ids): array
{
    $out = [];
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    foreach (array_chunk($ids, 500) as $chunk) {
        foreach ($pdo->query('SELECT id, name, county, state, country, latitude, longitude, admin4_code FROM places WHERE id IN (' . implode(',', $chunk) . ')') as $r) {
            $lat = is_numeric($r['latitude']) ? round((float) $r['latitude'], 5) : null; $lon = is_numeric($r['longitude']) ? round((float) $r['longitude'], 5) : null;
            if ($lat !== null && (abs($lat) > 90 || ($lat == 0.0 && $lon == 0.0))) { $lat = $lon = null; }
            $out[(int) $r['id']] = [mb_substr(trim((string) $r['name']), 0, 120), mb_substr(trim((string) $r['county']), 0, 80), mb_substr(trim((string) $r['state']), 0, 80), mb_substr(trim((string) $r['country']), 0, 60), $lat, $lon, mb_substr(trim((string) ($r['admin4_code'] ?? '')), 0, 20)];
        }
    }
    return $out;
}

function diagram_cartes2_data(PDO $pdo, array $get): array
{
    $what = (string) ($get['what'] ?? '');
    if (!in_array($what, DC2_WHAT, true)) { throw new InvalidArgumentException('Demande inconnue.'); }
    $year = static fn($v) => is_scalar($v) && is_numeric($v) && (int) $v >= -3000 && (int) $v <= 3000 ? (int) $v : null;
    $from = $year($get['from'] ?? null); $to = $year($get['to'] ?? null);
    $okYear = static fn($y) => ($from === null || ($y !== null && (int) $y >= $from)) && ($to === null || ($y !== null && (int) $y <= $to));
    $only = null;
    if (!empty($get['ancestors']) && function_exists('research_sosa_ancestor_ids')) {
        $only = research_sosa_ancestor_ids($pdo);
        $root = 0;
        try { $root = (int) $pdo->query("SELECT value FROM app_settings WHERE key='genealogie-sosa-root'")->fetchColumn(); } catch (Throwable) {}
        if (!$root) { $root = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn(); }
        if ($root) { $only[$root] = true; }
    }
    if ($what !== 'people' && $what !== 'story') { require_once __DIR__ . '/diagram_options.php'; dgo_request($get); $only = dgo_restrict($pdo, $only); } // le groupe de personnes choisi (« Depuis l'app »)
    $okPerson = static fn(int $p) => $p > 0 && ($only === null || isset($only[$p]));

    if ($what === 'people') { // les personnes derrière un point, une alvéole, une cause (au plus 500)
        $ids = array_slice(array_map('intval', explode(',', (string) (is_scalar($get['ids'] ?? '') ? $get['ids'] ?? '' : ''))), 0, 500);
        return ['people' => array_values(array_map(static fn($id, $p) => ['id' => $id, 'first_name' => $p[0], 'last_name' => $p[1], 'gender' => $p[2], 'birth_year' => $p[3], 'death_year' => $p[4], 'occupation' => $p[5]], array_keys($P = dc2_people($pdo, $ids)), $P))];
    }

    if ($what === 'points') {
        $ev = (string) ($get['ev'] ?? 'births');
        $sets = ['births' => ['BIRT', 'CHR', 'BAPM'], 'deaths' => ['DEAT', 'BURI', 'CREM'], 'marriages' => ['MARR', 'MARB', 'MARC'], 'residences' => ['RESI', 'CENS']];
        $names = ['BIRT' => 'Naissance', 'CHR' => 'Baptême', 'BAPM' => 'Baptême', 'DEAT' => 'Décès', 'BURI' => 'Sépulture', 'CREM' => 'Crémation', 'MARR' => 'Mariage', 'MARB' => 'Mariage', 'MARC' => 'Mariage', 'RESI' => 'Résidence', 'CENS' => 'Recensement'];
        if ($ev === 'type') {
            $tid = (int) ($get['type'] ?? 0);
            $where = 'e.event_type_id=' . $tid;
        } else {
            $tags = $ev === 'all' ? array_merge($sets['births'], $sets['marriages'], $sets['deaths']) : ($sets[$ev] ?? $sets['births']);
            $where = 't.gedcom_tag IN (' . implode(',', array_map(static fn($t) => $pdo->quote($t), $tags)) . ')';
            if ($ev === 'residences') { $where = "($where OR t.slug='domicile')"; }
        }
        $sql = "SELECT e.scope, e.person_id, f.partner1_id, f.partner2_id, e.place_id, e.year, t.gedcom_tag, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id
                LEFT JOIN families f ON f.id=e.family_id WHERE e.place_id IS NOT NULL AND $where ORDER BY COALESCE(NULLIF(e.sort_date,''),'9999'), e.id";
        $events = []; $kinds = []; $kindIdx = []; $seenBirth = []; $truncated = false; $pids = []; $plids = [];
        foreach ($pdo->query($sql) as $r) {
            if (!$okYear($r['year'])) { continue; }
            $who = $r['scope'] === 'person' ? [(int) $r['person_id']] : [(int) $r['partner1_id'], (int) $r['partner2_id']];
            $tag = (string) $r['gedcom_tag'];
            $kind = $names[$tag] ?? mb_substr(trim((string) $r['label']), 0, 60);
            if ($kind === '') { $kind = 'Événement'; }
            // la naissance, sinon le baptême : une seule fois par personne (de même pour le décès et la sépulture)
            $once = in_array($tag, ['BIRT', 'CHR', 'BAPM'], true) ? 'b' : (in_array($tag, ['DEAT', 'BURI', 'CREM'], true) ? 'd' : '');
            if (!isset($kindIdx[$kind])) { $kindIdx[$kind] = count($kinds); $kinds[] = $kind; }
            foreach ($who as $p) {
                if (!$okPerson($p)) { continue; }
                if ($once !== '') { if (isset($seenBirth[$once . $p])) { continue; } $seenBirth[$once . $p] = true; }
                if (count($events) >= DC2_MAX_EVENTS) { $truncated = true; break 2; }
                $events[] = [$p, (int) $r['place_id'], $r['year'] === null ? null : (int) $r['year'], $kindIdx[$kind]];
                $pids[$p] = true; $plids[(int) $r['place_id']] = true;
            }
        }
        return ['events' => $events, 'kinds' => $kinds, 'places' => (object) dc2_places($pdo, array_keys($plids)), 'people' => (object) dc2_people($pdo, array_keys($pids)), 'truncated' => $truncated];
    }

    if ($what === 'story') {
        $pid = dgn_root($pdo, (int) ($get['person'] ?? 0));
        $s = $pdo->prepare('SELECT id, first_name, last_name, gender FROM persons WHERE id=?'); $s->execute([$pid]); $me = $s->fetch();
        if (!$me) { return ['name' => '', 'steps' => []]; }
        $fams = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=?'); $fams->execute([$pid, $pid]);
        $partner = [];
        foreach ($fams->fetchAll() as $f) { $partner[(int) $f['id']] = (int) $f['partner1_id'] === $pid ? (int) $f['partner2_id'] : (int) $f['partner1_id']; }
        $famIn = $partner ? implode(',', array_map('intval', array_keys($partner))) : '0';
        $q = $pdo->prepare("SELECT e.id, e.scope, e.family_id, e.date_text, e.year, e.sort_date, e.place_id, e.title, e.precise_lat, e.precise_lon, t.label, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE (e.scope='person' AND e.person_id=?) OR (e.scope='family' AND e.family_id IN ($famIn)) ORDER BY COALESCE(NULLIF(e.sort_date,''), printf('%04d', COALESCE(e.year, 9999))), e.id LIMIT 400");
        $q->execute([$pid]); $rows = $q->fetchAll();
        $places = dc2_places($pdo, array_column($rows, 'place_id'));
        $spouses = dc2_people($pdo, array_values($partner));
        $steps = [];
        foreach ($rows as $r) {
            $pl = $r['place_id'] ? ($places[(int) $r['place_id']] ?? null) : null;
            $lat = is_numeric($r['precise_lat']) ? (float) $r['precise_lat'] : ($pl[4] ?? null); $lon = is_numeric($r['precise_lon']) ? (float) $r['precise_lon'] : ($pl[5] ?? null);
            $with = $r['scope'] === 'family' && ($sp = $spouses[$partner[(int) $r['family_id']] ?? 0] ?? null) ? trim($sp[0] . ' ' . $sp[1]) : '';
            $steps[] = ['date' => mb_substr(trim((string) ($r['date_text'] ?: ($r['year'] ?? ''))), 0, 60), 'year' => $r['year'] === null ? null : (int) $r['year'], 'kind' => mb_substr((string) $r['label'], 0, 60), 'tag' => (string) $r['gedcom_tag'],
                'title' => mb_substr(trim((string) $r['title']), 0, 120), 'with' => mb_substr($with, 0, 120), 'place' => $pl ? $pl[0] : '', 'county' => $pl ? $pl[1] : '', 'country' => $pl ? $pl[3] : '', 'insee' => $pl ? $pl[6] : '', 'lat' => $lat, 'lon' => $lon];
        }
        return ['id' => $pid, 'name' => dgn_name($me), 'gender' => (string) $me['gender'], 'steps' => $steps];
    }

    if ($what === 'godnames') {
        $L = dgn_links($pdo);
        $sql = "SELECT ew.person_id AS gp, e.person_id AS gc, TRIM(COALESCE(ew.note,'')) AS note, e.year FROM event_witnesses ew JOIN events e ON e.id=ew.event_id JOIN event_types t ON t.id=e.event_type_id
                WHERE e.scope='person' AND e.person_id IS NOT NULL AND ew.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY e.year, ew.id LIMIT 6000";
        $pairs = []; $ids = [];
        foreach ($pdo->query($sql) as $r) {
            $low = mb_strtolower((string) $r['note']);
            $role = str_contains($low, 'marraine') ? 'marraine' : (str_contains($low, 'parrain') ? 'parrain' : '');
            if ($role === '') { continue; }
            $gp = (int) $r['gp']; $gc = (int) $r['gc'];
            if ($gp === $gc || !($okPerson($gc) || $okPerson($gp)) || !$okYear($r['year'])) { continue; }
            $k = "$gp|$gc"; if (isset($pairs[$k])) { continue; }
            $pairs[$k] = [$gp, $gc, $role]; $ids[$gp] = true; $ids[$gc] = true;
            if (count($pairs) >= 3000) { break; }
        }
        $P = dc2_people($pdo, array_keys($ids));
        $parents = $L['parents'];
        $par = static fn(int $p): array => array_values(array_filter($parents[$p] ?? []));
        $rel = static function (int $gp, int $gc) use ($par, $L): string {
            $g = ($L['gender'][$gp] ?? '') === 'female';
            $ps = $par($gc);
            if (in_array($gp, $ps, true)) { return $g ? 'mère' : 'père'; }
            foreach ($ps as $p) { if (in_array($gp, $par($p), true)) { return $g ? 'grand-mère' : 'grand-père'; } }
            $mine = $par($gp);
            if ($mine && array_intersect($mine, $ps)) { return $g ? 'sœur' : 'frère'; }
            foreach ($ps as $p) { $pp = $par($p); if ($pp && $mine && array_intersect($pp, $mine)) { return $g ? 'tante' : 'oncle'; } }
            foreach ($ps as $p) { foreach ($par($p) as $pp) { if (in_array($gp, $par($pp), true)) { return $g ? 'arrière-grand-mère' : 'arrière-grand-père'; } } }
            return '';
        };
        $rows = [];
        foreach ($pairs as [$gp, $gc, $role]) {
            $a = $P[$gp] ?? null; $b = $P[$gc] ?? null; if (!$a || !$b) { continue; }
            $rows[] = ['gp' => $gp, 'gc' => $gc, 'role' => $role, 'gpFirst' => $a[0], 'gpLast' => $a[1], 'gpYear' => $a[3], 'gpG' => $a[2], 'gcFirst' => $b[0], 'gcLast' => $b[1], 'gcYear' => $b[3], 'gcG' => $b[2], 'rel' => $rel($gp, $gc)];
        }
        return ['rows' => $rows, 'truncated' => count($pairs) >= 3000];
    }

    // causes de décès : la cause écrite sur le décès (ou la sépulture), une fois par personne
    $sql = "SELECT e.person_id, TRIM(e.cause) AS cause, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.scope='person' AND e.person_id IS NOT NULL AND t.gedcom_tag IN ('DEAT','BURI') AND TRIM(COALESCE(e.cause,''))<>'' ORDER BY t.gedcom_tag='DEAT' DESC, e.id";
    $byCause = []; $seen = [];
    foreach ($pdo->query($sql) as $r) {
        $p = (int) $r['person_id']; if (isset($seen[$p]) || !$okPerson($p) || !$okYear($r['year'])) { continue; }
        $seen[$p] = true;
        $c = mb_substr(preg_replace('/\s+/u', ' ', (string) $r['cause']), 0, 80);
        $k = mb_strtolower($c);
        if (!isset($byCause[$k])) { $byCause[$k] = ['label' => $c, 'ids' => []]; }
        if (count($byCause[$k]['ids']) < 2000) { $byCause[$k]['ids'][] = $p; }
        if (count($seen) >= 20000) { break; }
    }
    uasort($byCause, static fn($a, $b) => count($b['ids']) <=> count($a['ids']));
    $byCause = array_slice($byCause, 0, 300);
    $ids = []; foreach ($byCause as $c) { foreach ($c['ids'] as $p) { $ids[$p] = true; } }
    return ['rows' => array_values(array_map(static fn($c) => ['label' => $c['label'], 'n' => count($c['ids']), 'ids' => $c['ids']], $byCause)), 'people' => (object) dc2_people($pdo, array_keys($ids))];
}
