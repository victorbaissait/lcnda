<?php
declare(strict_types=1);

/**
 * Aide à la recherche : estimation des dates manquantes et implexe.
 * Lecture seule : rien n'est écrit dans la base.
 */

/** Années des événements d'une personne (comme acteur principal), avec leur balise GEDCOM et leur texte. */
function research_person_events(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare("SELECT e.year, t.gedcom_tag, t.label, COALESCE(e.title,'') AS title, COALESCE(e.description,'') AS description,
            COALESCE(e.extra_info,'') AS extra_info
        FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.year IS NOT NULL AND e.year>0 AND (e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?))");
    $stmt->execute([$id, $id, $id]);
    $rows = $stmt->fetchAll();
    $stmt->closeCursor();
    return $rows;
}

/** Première année d'un type d'événement d'une personne (naissance, baptême, décès…). */
function research_year(array $events, array $tags, string $which = 'min'): ?int
{
    $years = array_map(static fn($e) => (int) $e['year'], array_filter($events, static fn($e) => in_array($e['gedcom_tag'], $tags, true)));
    if (!$years) { return null; }
    return $which === 'max' ? max($years) : min($years);
}

/** « 64 ans », « âgé de 3 mois » : l'âge en années (null si absent ou en mois/jours). */
function research_age_in_text(string $text): ?int
{
    if (!preg_match('/(?:^|\D)(\d{1,3})\s*(?:ans|an)\b/iu', $text, $m)) { return null; }
    $age = (int) $m[1];
    return $age > 0 && $age <= 110 ? $age : null;
}

/** Années utiles des proches : naissances, mariages, décès. */
function research_relatives(PDO $pdo, int $id): array
{
    $years = static function (PDO $pdo, string $idsSql, array $params, array $tags): array {
        $marks = implode(',', array_fill(0, count($tags), '?'));
        $stmt = $pdo->prepare("SELECT p.id, p.gender, (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id
                WHERE e.person_id=p.id AND t.gedcom_tag IN ($marks) AND e.year>0) AS y
            FROM persons p WHERE p.id IN ($idsSql)");
        $stmt->execute([...$tags, ...$params]);
        $rows = $stmt->fetchAll();
        $stmt->closeCursor();
        return $rows;
    };
    $birth = ['BIRT', 'CHR', 'BAPM'];
    $death = ['DEAT', 'BURI', 'CREM'];
    $parentsSql = "SELECT f.partner1_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?
        UNION SELECT f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=?";
    $childrenSql = "SELECT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE f.partner1_id=? OR f.partner2_id=?";
    $siblingsSql = "SELECT fc2.child_id FROM family_children fc1 JOIN family_children fc2 ON fc2.family_id=fc1.family_id WHERE fc1.child_id=? AND fc2.child_id<>?";
    $parentsMarriage = $pdo->prepare("SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE t.gedcom_tag='MARR' AND e.year>0 AND e.family_id IN (SELECT family_id FROM family_children WHERE child_id=?)");
    $parentsMarriage->execute([$id]);
    $pm = $parentsMarriage->fetchColumn();
    $parentsMarriage->closeCursor();
    // Remariage d'un conjoint : la personne était sans doute morte (ou séparée) avant
    $spouseRemarriage = $pdo->prepare("SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id
        JOIN families f2 ON f2.id=e.family_id
        WHERE t.gedcom_tag='MARR' AND e.year>0
          AND f2.id NOT IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)
          AND (f2.partner1_id IN (SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE partner1_id=? OR partner2_id=?)
            OR f2.partner2_id IN (SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE partner1_id=? OR partner2_id=?))
          AND e.year > COALESCE((SELECT max(e2.year) FROM events e2 JOIN event_types t2 ON t2.id=e2.event_type_id
                WHERE t2.gedcom_tag='MARR' AND e2.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)), 0)");
    $spouseRemarriage->execute([$id, $id, $id, $id, $id, $id, $id, $id, $id, $id]);
    $sr = $spouseRemarriage->fetchColumn();
    $spouseRemarriage->closeCursor();
    return [
        'parents_birth' => $years($pdo, $parentsSql, [$id, $id], $birth),
        'parents_death' => $years($pdo, $parentsSql, [$id, $id], $death),
        'children_birth' => $years($pdo, $childrenSql, [$id, $id], $birth),
        'siblings_birth' => $years($pdo, $siblingsSql, [$id, $id], $birth),
        'parents_marriage' => $pm ? (int) $pm : null,
        'spouse_remarriage' => $sr ? (int) $sr : null,
    ];
}

/**
 * Fourchettes pour une naissance ou un décès manquant, d'après ce que la base sait déjà.
 * Chaque indice donne un « au plus tôt » et/ou un « au plus tard » ; la fourchette est leur intersection.
 */
function date_estimates(PDO $pdo, int $id): array
{
    $person = $pdo->prepare('SELECT id, gender, living_status FROM persons WHERE id=?');
    $person->execute([$id]);
    $p = $person->fetch();
    $person->closeCursor();
    if (!$p) { return []; }
    $events = research_person_events($pdo, $id);
    $birth = research_year($events, ['BIRT', 'CHR', 'BAPM']);
    $death = research_year($events, ['DEAT', 'BURI', 'CREM']);
    $rel = research_relatives($pdo, $id);
    $female = ($p['gender'] ?? '') === 'female';
    $male = ($p['gender'] ?? '') === 'male';
    $result = [];

    if ($birth === null) {
        $hints = [];
        $add = static function (?int $from, ?int $to, string $why, int $weight) use (&$hints): void {
            $hints[] = ['from' => $from, 'to' => $to, 'why' => $why, 'weight' => $weight];
        };
        // Âge déclaré dans un acte (décès, mariage, recensement…) : l'indice le plus précis
        foreach ($events as $e) {
            if (in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true)) { continue; }
            $age = research_age_in_text($e['title'] . ' ' . $e['description'] . ' ' . $e['extra_info']);
            if ($age !== null) {
                $y = (int) $e['year'];
                $add($y - $age - 1, $y - $age, sprintf('%s en %d : %d ans', $e['label'], $y, $age), 3);
            }
        }
        $census = $pdo->prepare("SELECT cm.age_text, cr.year FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id
            WHERE cm.person_id=? AND cr.year>0 AND cm.age_text<>''");
        $census->execute([$id]);
        foreach ($census->fetchAll() as $c) {
            $age = research_age_in_text((string) $c['age_text']) ?? (preg_match('/^\s*(\d{1,3})\s*$/', (string) $c['age_text'], $m) ? (int) $m[1] : null);
            if ($age !== null && $age <= 110) {
                // Les âges des recensements sont souvent arrondis : ± 2 ans
                $add((int) $c['year'] - $age - 2, (int) $c['year'] - $age + 1, sprintf('Recensement de %d : %d ans', (int) $c['year'], $age), 2);
            }
        }
        $census->closeCursor();
        $marriage = research_year($events, ['MARR']);
        if ($marriage) { $add($marriage - 45, $marriage - 15, "Premier mariage connu en {$marriage}", 1); }
        $kids = array_filter(array_map(static fn($r) => $r['y'] ? (int) $r['y'] : null, $rel['children_birth']));
        if ($kids) {
            $first = min($kids); $last = max($kids);
            $add($first - ($female ? 45 : 60), $first - 15, "Premier enfant connu né en {$first}", 1);
            if ($female && $last !== $first) { $add($last - 50, null, "Dernier enfant connu né en {$last}", 1); }
        }
        $sibs = array_filter(array_map(static fn($r) => $r['y'] ? (int) $r['y'] : null, $rel['siblings_birth']));
        if ($sibs) {
            $add(max($sibs) - 25, min($sibs) + 25, count($sibs) > 1 ? sprintf('Frères et sœurs nés entre %d et %d', min($sibs), max($sibs)) : 'Frère ou sœur né(e) en ' . min($sibs), 1);
        }
        foreach ($rel['parents_birth'] as $par) {
            if (!$par['y']) { continue; }
            $y = (int) $par['y'];
            $mother = ($par['gender'] ?? '') === 'female';
            $add($y + 15, $y + ($mother ? 50 : 75), ($mother ? "Mère née en {$y}" : "Père né en {$y}"), 1);
        }
        if ($rel['parents_marriage']) { $add($rel['parents_marriage'] - 2, $rel['parents_marriage'] + 25, "Mariage des parents en {$rel['parents_marriage']}", 1); }
        foreach ($rel['parents_death'] as $par) {
            if (!$par['y']) { continue; }
            $mother = ($par['gender'] ?? '') === 'female';
            $add(null, (int) $par['y'] + ($mother ? 0 : 1), ($mother ? 'Mère décédée' : 'Père décédé') . " en {$par['y']}", 1);
        }
        $firstEvent = $events ? min(array_map(static fn($e) => (int) $e['year'], $events)) : null;
        if ($death) { $add($death - 105, $death, "Décès en {$death}", 0); }
        elseif ($firstEvent) { $add(null, $firstEvent, "Premier événement connu en {$firstEvent}", 0); }
        if ($hints) { $result['birth'] = research_combine($hints); }
    }

    if ($death === null && ($p['living_status'] ?? '') !== 'living') {
        $hints = [];
        $after = array_filter($events, static fn($e) => !in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true));
        $lastOwn = $after ? max(array_map(static fn($e) => (int) $e['year'], $after)) : null;
        if ($lastOwn) { $hints[] = ['from' => $lastOwn, 'to' => null, 'why' => "Dernier événement connu en {$lastOwn}", 'weight' => 1]; }
        $kids = array_filter(array_map(static fn($r) => $r['y'] ? (int) $r['y'] : null, $rel['children_birth']));
        if ($kids) {
            $last = max($kids);
            // Un père peut mourir avant la naissance de son enfant (enfant posthume)
            $hints[] = ['from' => $female ? $last : $last - 1, 'to' => null, 'why' => "Dernier enfant connu né en {$last}", 'weight' => 1];
        }
        if ($rel['spouse_remarriage']) { $hints[] = ['from' => null, 'to' => $rel['spouse_remarriage'], 'why' => "Remariage du conjoint en {$rel['spouse_remarriage']}", 'weight' => 2]; }
        $born = $birth ?? ($result['birth']['from'] ?? null);
        if ($born) { $hints[] = ['from' => null, 'to' => $born + 105, 'why' => $birth ? "Naissance en {$birth}" : 'Naissance estimée', 'weight' => 0]; }
        if ($hints && array_filter($hints, static fn($h) => $h['weight'] > 0)) { $result['death'] = research_combine($hints); }
    }
    return $result;
}

/** Intersection des indices ; en cas de contradiction, garde les indices les plus sûrs. */
function research_combine(array $hints): array
{
    usort($hints, static fn($a, $b) => $b['weight'] <=> $a['weight']);
    $from = null; $to = null; $used = []; $conflicts = [];
    foreach ($hints as $h) {
        $f = $h['from'] === null ? $from : ($from === null ? $h['from'] : max($from, $h['from']));
        $t = $h['to'] === null ? $to : ($to === null ? $h['to'] : min($to, $h['to']));
        if ($f !== null && $t !== null && $f > $t) { $conflicts[] = $h['why']; continue; }
        [$from, $to] = [$f, $t];
        $used[] = $h;
    }
    // Raisons affichées : celles qui fixent les bornes d'abord, puis les autres indices compatibles
    $binding = []; $others = [];
    foreach ($used as $h) {
        if (($h['from'] !== null && $h['from'] === $from) || ($h['to'] !== null && $h['to'] === $to)) { $binding[] = $h['why']; } else { $others[] = $h['why']; }
    }
    $label = match (true) {
        $from !== null && $to !== null && $from === $to => "en {$from}",
        $from !== null && $to !== null => "entre {$from} et {$to}",
        $from !== null => "après {$from}",
        $to !== null => "avant {$to}",
        default => '',
    };
    return ['from' => $from, 'to' => $to, 'label' => $label, 'reasons' => array_values(array_unique($binding)), 'other_reasons' => array_values(array_unique($others)), 'conflicts' => $conflicts];
}

/**
 * Implexe : ancêtres qui occupent plusieurs places (numéros Sosa) dans l'ascendance d'une personne.
 * Seules les filiations biologiques comptent (un enfant adopté n'hérite pas des ancêtres de ses parents adoptifs).
 * Par génération : places connues, personnes différentes, taux d'implexe = 1 − personnes / places.
 */
function implexe_data(PDO $pdo, int $rootId, int $maxGen = 40, int $maxSlots = 300000): array
{
    $gender = [];
    foreach ($pdo->query('SELECT id, gender FROM persons') as $row) { $gender[(int) $row['id']] = (string) $row['gender']; }
    $parents = [];
    $links = $pdo->query("SELECT fc.child_id, f.partner1_id, f.partner2_id,
            COALESCE(fc.relation_to_partner1,'biological') AS r1, COALESCE(fc.relation_to_partner2,'biological') AS r2
        FROM family_children fc JOIN families f ON f.id=fc.family_id ORDER BY fc.id");
    foreach ($links as $l) {
        $child = (int) $l['child_id'];
        foreach ([['partner1_id', 'r1'], ['partner2_id', 'r2']] as [$col, $rel]) {
            $pid = (int) ($l[$col] ?? 0);
            if (!$pid || !in_array($l[$rel], ['biological', ''], true)) { continue; }
            // Père = homme (sinon partenaire 1), mère = femme (sinon partenaire 2) ; une seule mère et un seul père
            $role = ($gender[$pid] ?? '') === 'male' ? 'father' : (($gender[$pid] ?? '') === 'female' ? 'mother' : ($col === 'partner1_id' ? 'father' : 'mother'));
            if (!isset($parents[$child][$role])) { $parents[$child][$role] = $pid; }
        }
    }
    $links->closeCursor();
    $occ = [];       // personne → numéros Sosa
    $bySosa = [];    // numéro Sosa → personne
    $gens = [];      // génération → [places, personnes]
    $queue = [[1, $rootId, 1]];
    $slots = 0; $truncated = false;
    while ($queue) {
        $next = [];
        foreach ($queue as [$sosa, $pid, $gen]) {
            $occ[$pid][] = $sosa;
            $bySosa[$sosa] = $pid;
            $gens[$gen]['slots'] = ($gens[$gen]['slots'] ?? 0) + 1;
            $gens[$gen]['people'][$pid] = true;
            if (++$slots >= $maxSlots) { $truncated = true; break 2; }
            if ($gen >= $maxGen) { continue; }
            if (isset($parents[$pid]['father'])) { $next[] = [$sosa * 2, $parents[$pid]['father'], $gen + 1]; }
            if (isset($parents[$pid]['mother'])) { $next[] = [$sosa * 2 + 1, $parents[$pid]['mother'], $gen + 1]; }
        }
        $queue = $next;
    }
    $generations = [];
    $cumSlots = 0; $cumPeople = [];
    foreach ($gens as $g => $row) {
        $people = count($row['people']);
        $cumSlots += $row['slots'];
        $cumPeople += $row['people'];
        $generations[] = [
            'generation' => $g, 'theoretical' => $g <= 62 ? 2 ** ($g - 1) : null, 'slots' => $row['slots'], 'people' => $people,
            'rate' => $row['slots'] ? round(100 * (1 - $people / $row['slots']), 1) : 0,
            'cumulative_rate' => $cumSlots ? round(100 * (1 - count($cumPeople) / $cumSlots), 1) : 0,
        ];
    }
    // Ancêtres répétés ; « point d'entrée » = l'une de ses places a un enfant moins répété que lui (le couple commun le plus proche)
    $repeated = [];
    foreach ($occ as $pid => $list) {
        if (count($list) < 2) { continue; }
        sort($list);
        $entry = false;
        foreach ($list as $s) {
            $childSosa = intdiv($s, 2);
            if (isset($bySosa[$childSosa]) && count($occ[$bySosa[$childSosa]]) < count($list)) { $entry = true; break; }
        }
        $repeated[$pid] = ['id' => $pid, 'count' => count($list), 'sosas' => array_slice($list, 0, 12),
            'generations' => array_values(array_unique(array_map(static fn($s) => strlen(decbin($s)), $list))), 'entry' => $entry];
    }
    if ($repeated) {
        foreach (array_chunk(array_keys($repeated), 400) as $chunk) {
            $stmt = $pdo->prepare(person_select() . ' WHERE p.id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
            $stmt->execute($chunk);
            foreach ($stmt->fetchAll() as $p) { $repeated[(int) $p['id']]['person'] = $p; }
            $stmt->closeCursor();
        }
    }
    $repeated = array_values($repeated);
    usort($repeated, static fn($a, $b) => [$b['entry'], $b['count'], $a['sosas'][0]] <=> [$a['entry'], $a['count'], $b['sosas'][0]]);
    $all = array_sum(array_column($generations, 'slots'));
    return ['root_id' => $rootId, 'generations' => $generations, 'repeated' => array_slice($repeated, 0, 500), 'repeated_total' => count($repeated),
        'slots' => $all, 'people' => count($occ), 'rate' => $all ? round(100 * (1 - count($occ) / $all), 1) : 0, 'truncated' => $truncated, 'max_generations' => $maxGen];
}

/**
 * Recherche rapide (⌘K / Ctrl+K) : personnes, battues, enquêtes et lieux cités, en une requête courte.
 * Chaque mot tapé doit se trouver quelque part (« battue halluin » : le mot « battue » choisit le type).
 */
function quick_search_data(PDO $pdo, string $q): array
{
    $words = preg_split('/\s+/u', trim($q), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $kinds = ['battue' => 'battues', 'battues' => 'battues', 'enquete' => 'investigations', 'enquête' => 'investigations', 'enquetes' => 'investigations', 'enquêtes' => 'investigations', 'lieu' => 'places', 'lieux' => 'places', 'personne' => 'persons'];
    $only = null;
    $words = array_values(array_filter($words, static function ($w) use ($kinds, &$only) {
        $k = mb_strtolower($w);
        if (isset($kinds[$k]) && $only === null) { $only = $kinds[$k]; return false; }
        return true;
    }));
    $words = array_slice($words, 0, 5);
    $out = ['persons' => [], 'battues' => [], 'investigations' => [], 'places' => []];
    if (!$words && $only === null) { return $out; }
    $like = static function (array $cols) use ($words): array {
        $where = []; $params = [];
        foreach ($words as $i => $w) {
            $where[] = '(' . implode(' OR ', array_map(static fn($c) => "{$c} LIKE :w{$i} COLLATE NOCASE", $cols)) . ')';
            $params[":w{$i}"] = '%' . $w . '%';
        }
        return [$where ? implode(' AND ', $where) : '1', $params];
    };
    $run = static function (string $sql, array $params) use ($pdo): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $stmt->closeCursor();
        return $rows;
    };
    if ($only === null || $only === 'persons') {
        if ($words) {
            [$w, $p] = $like(["trim(COALESCE(p.first_name,'')||' '||COALESCE(p.middle_name,'')||' '||COALESCE(p.last_name,''))", 'p.last_name', 'p.first_name']);
            $out['persons'] = $run(person_select() . " WHERE {$w} ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 8", $p);
        }
    }
    if ($only === null || $only === 'battues') {
        [$w, $p] = $like(['b.title', 'c.name']);
        $out['battues'] = $run("SELECT b.id, b.title, c.name AS start_name FROM battues b LEFT JOIN commune_contours c ON c.insee_code=b.start_insee_code
            WHERE {$w} ORDER BY b.updated_at DESC LIMIT 6", $p);
    }
    if ($only === null || $only === 'investigations') {
        [$w, $p] = $like(['i.title', 'i.question']);
        $out['investigations'] = $run("SELECT i.id, i.title, i.status FROM investigations i WHERE {$w} ORDER BY i.updated_at DESC LIMIT 6", $p);
    }
    if (($only === null && $words) || $only === 'places') {
        [$w, $p] = $like(['pl.name']);
        // Seulement les lieux cités (pas les ~80 000 lieux du répertoire)
        $out['places'] = $run("SELECT pl.id, pl.name, pl.county, pl.country, (SELECT count(*) FROM events e WHERE e.place_id=pl.id) AS uses FROM places pl
            WHERE {$w} AND EXISTS (SELECT 1 FROM events e WHERE e.place_id=pl.id) ORDER BY uses DESC LIMIT 6", $p);
    }
    return $out;
}

/** Ancêtres de la racine Sosa (choisie dans Listes → SOSA, sinon la personne de départ). */
function research_sosa_ancestor_ids(PDO $pdo): array
{
    $root = 0;
    try { $root = (int) $pdo->query("SELECT value FROM app_settings WHERE key='genealogie-sosa-root'")->fetchColumn(); } catch (Throwable) {}
    if (!$root) { $root = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 LIMIT 1')->fetchColumn(); }
    if (!$root) { return []; }
    $parents = [];
    foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) {
        foreach (['partner1_id', 'partner2_id'] as $c) { if ($r[$c]) { $parents[(int) $r['child_id']][] = (int) $r[$c]; } }
    }
    $seen = [$root => true]; $queue = [$root];
    while ($queue) { $p = array_pop($queue); foreach ($parents[$p] ?? [] as $a) { if (!isset($seen[$a])) { $seen[$a] = true; $queue[] = $a; } } }
    unset($seen[$root]);
    return $seen;
}

/**
 * Bilan de recherche (widget « Motivation ») : ce qui a été fait ce mois-ci et cette année, d'après le journal des
 * modifications. Les imports en bloc (GEDCOM, MacFamilyTree…) ne comptent pas comme « fiches créées » : c'est le travail
 * fait à la main qui est montré.
 */
function research_progress_data(PDO $pdo): array
{
    $sosa = research_sosa_ancestor_ids($pdo);
    $period = static function (string $from, string $to) use ($pdo, $sosa): array {
        $count = static function (string $where, array $params = []) use ($pdo, $from, $to): int {
            $stmt = $pdo->prepare("SELECT count(*) FROM change_log WHERE created_at>=? AND created_at<? AND {$where}");
            $stmt->execute([$from, $to, ...$params]);
            $n = (int) $stmt->fetchColumn(); $stmt->closeCursor(); return $n;
        };
        $created = $pdo->prepare("SELECT DISTINCT entity_id FROM change_log WHERE entity_type='person' AND action='create' AND created_at>=? AND created_at<?");
        $created->execute([$from, $to]);
        $createdIds = array_map('intval', $created->fetchAll(PDO::FETCH_COLUMN));
        $created->closeCursor();
        $upload = $pdo->prepare("SELECT summary FROM change_log WHERE action='upload' AND created_at>=? AND created_at<?");
        $upload->execute([$from, $to]);
        $media = 0; foreach ($upload->fetchAll(PDO::FETCH_COLUMN) as $s) { $media += preg_match('/(\d+)/', (string) $s, $m) ? (int) $m[1] : 1; }
        $upload->closeCursor();
        $edited = $pdo->prepare("SELECT count(DISTINCT entity_id) FROM change_log WHERE entity_type='person' AND action NOT IN ('create','delete','lock','unlock') AND created_at>=? AND created_at<?");
        $edited->execute([$from, $to]); $editedPeople = (int) $edited->fetchColumn(); $edited->closeCursor();
        $days = $pdo->prepare('SELECT count(DISTINCT substr(created_at,1,10)) FROM change_log WHERE created_at>=? AND created_at<?');
        $days->execute([$from, $to]); $workDays = (int) $days->fetchColumn(); $days->closeCursor();
        $closed = static function (string $table) use ($pdo, $from, $to): int {
            try { $s = $pdo->prepare("SELECT count(*) FROM {$table} WHERE status='closed' AND updated_at>=? AND updated_at<?"); $s->execute([$from, $to]); return (int) $s->fetchColumn(); } catch (Throwable) { return 0; }
        };
        return [
            'persons_created' => count($createdIds),
            'persons_edited' => $editedPeople,
            'sosa_new' => count(array_filter($createdIds, static fn($id) => isset($sosa[$id]))),
            'events_created' => $count("entity_type='event' AND action='create'"),
            'sources_created' => $count("entity_type='source' AND action='create'"),
            'census_created' => $count("entity_type='census' AND action='create'"),
            'media_added' => $media,
            'battues_closed' => $closed('battues'),
            'investigations_closed' => $closed('investigations'),
            'changes' => $count('1'),
            'work_days' => $workDays,
        ];
    };
    $now = new DateTimeImmutable('now');
    $monthStart = $now->format('Y-m-01');
    $nextMonth = $now->modify('first day of next month')->format('Y-m-01');
    $yearStart = $now->format('Y-01-01');
    $nextYear = ((int) $now->format('Y') + 1) . '-01-01';
    // Activité des 12 derniers mois (nombre de modifications par mois)
    $months = [];
    for ($i = 11; $i >= 0; $i--) {
        $start = $now->modify("first day of -{$i} month")->format('Y-m-01');
        $end = (new DateTimeImmutable($start))->modify('first day of next month')->format('Y-m-01');
        $s = $pdo->prepare("SELECT count(*), count(DISTINCT CASE WHEN entity_type='person' AND action='create' THEN entity_id END) FROM change_log WHERE created_at>=? AND created_at<?");
        $s->execute([$start, $end]); [$changes, $persons] = $s->fetch(PDO::FETCH_NUM); $s->closeCursor();
        $months[] = ['month' => substr($start, 0, 7), 'changes' => (int) $changes, 'persons' => (int) $persons];
    }
    $prevStart = $now->modify('first day of last month')->format('Y-m-01');
    return ['month' => $period($monthStart, $nextMonth), 'previous_month' => $period($prevStart, $monthStart), 'year' => $period($yearStart, $nextYear),
        'months' => $months, 'month_label' => $now->format('Y-m'), 'year_label' => $now->format('Y')];
}
