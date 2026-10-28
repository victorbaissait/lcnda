<?php
declare(strict_types=1);

/**
 * Fusionner l'arbre d'un cousin (GEDCOM reçu) : le fichier est d'abord importé dans une base TEMPORAIRE à part
 * (DATA_DIR/cache/merge/<jeton>.sqlite), comparé à la base, puis l'utilisateur décide fiche par fiche :
 * « même personne : compléter la mienne », « nouvelle personne : l'ajouter », « ignorer ».
 * Rien n'est écrit dans la base avant la confirmation ; une copie de sécurité « -avant-fusion » est faite d'abord.
 */

function merge_dir(): string
{
    $dir = DATA_DIR . '/cache/merge';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Dossier temporaire impossible à créer.'); }
    // Analyses abandonnées depuis plus d'un jour : supprimées
    foreach (glob($dir . '/*.sqlite*') ?: [] as $old) { if (@filemtime($old) < time() - 86400) { @unlink($old); } }
    return $dir;
}

function merge_temp_pdo(string $token): PDO
{
    if (!preg_match('/^[a-f0-9]{24}$/', $token)) { throw new RuntimeException('Analyse introuvable.'); }
    $path = merge_dir() . '/' . $token . '.sqlite';
    if (!is_file($path)) { throw new RuntimeException('Analyse expirée : envoie de nouveau le fichier.'); }
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    return $pdo;
}

function merge_fold(string $s): string
{
    return trim(preg_replace('/[^a-z]+/', ' ', strtolower(ascii_fold($s))));
}

/** Résumé comparable d'une personne : noms repliés, années, lieux, parents, conjoints. */
function merge_person_profiles(PDO $pdo, ?array $onlyIds = null): array
{
    $where = $onlyIds !== null ? ' WHERE p.id IN (' . (implode(',', array_map('intval', $onlyIds)) ?: '0') . ')' : '';
    $people = [];
    foreach ($pdo->query("SELECT p.id, COALESCE(p.first_name,'') AS first_name, COALESCE(p.middle_name,'') AS middle_name, COALESCE(p.last_name,'') AS last_name, p.gender FROM persons p" . $where) as $p) {
        $p['ln'] = merge_fold($p['last_name']); $p['fn'] = merge_fold($p['first_name']); $p['fn1'] = explode(' ', $p['fn'])[0];
        $people[(int) $p['id']] = $p + ['birth' => null, 'death' => null, 'birth_place' => '', 'death_place' => '', 'parents' => [], 'spouses' => [], 'events' => []];
    }
    $ev = $pdo->query("SELECT e.person_id, e.year, e.date_text, COALESCE(e.title,'') AS title, t.gedcom_tag, t.label, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id IS NOT NULL");
    foreach ($ev as $e) {
        $id = (int) $e['person_id']; if (!isset($people[$id])) { continue; }
        $people[$id]['events'][] = ['tag' => $e['gedcom_tag'], 'label' => $e['label'] . (trim($e['title']) !== '' ? ' : ' . trim($e['title']) : ''), 'year' => $e['year'] ? (int) $e['year'] : null, 'date' => $e['date_text'], 'place' => $e['place']];
        if (in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) && $e['year'] && ($people[$id]['birth'] === null || $e['gedcom_tag'] === 'BIRT')) { $people[$id]['birth'] = (int) $e['year']; $people[$id]['birth_place'] = merge_fold($e['place']); }
        if (in_array($e['gedcom_tag'], ['DEAT', 'BURI'], true) && $e['year'] && $people[$id]['death'] === null) { $people[$id]['death'] = (int) $e['year']; $people[$id]['death_place'] = merge_fold($e['place']); }
    }
    foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) {
        $c = (int) $r['child_id']; if (!isset($people[$c])) { continue; }
        foreach (['partner1_id', 'partner2_id'] as $k) { if ($r[$k]) { $people[$c]['parents'][] = (int) $r[$k]; } }
    }
    foreach ($pdo->query('SELECT partner1_id, partner2_id FROM families WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL') as $f) {
        if (isset($people[(int) $f['partner1_id']])) { $people[(int) $f['partner1_id']]['spouses'][] = (int) $f['partner2_id']; }
        if (isset($people[(int) $f['partner2_id']])) { $people[(int) $f['partner2_id']]['spouses'][] = (int) $f['partner1_id']; }
    }
    return $people;
}

/** Ressemblance entre une personne reçue et une personne de la base (0-100) avec les raisons. */
function merge_score(array $a, array $b, array $aAll, array $bAll): array
{
    $score = 0; $why = []; $against = [];
    // Sans nom de famille (enfant mort-né, fiche « ??? »…) : seules les années et les proches peuvent les rapprocher
    if ($a['ln'] === '' && $b['ln'] === '') { $score += 10; } elseif ($a['ln'] !== '' && $a['ln'] === $b['ln']) { $score += 30; } elseif ($a['ln'] !== '' && $b['ln'] !== '' && levenshtein($a['ln'], $b['ln']) <= 2) { $score += 18; $why[] = 'nom proche'; } else { return ['score' => 0]; }
    if ($a['fn'] === '' && $b['fn'] === '') { /* deux fiches sans prénom : rien de plus */ } elseif ($a['fn'] !== '' && $a['fn'] === $b['fn']) { $score += 25; } elseif ($a['fn1'] !== '' && $a['fn1'] === $b['fn1']) { $score += 15; $why[] = 'même premier prénom'; } else { return ['score' => 0]; }
    if ($a['gender'] && $b['gender'] && $a['gender'] !== 'unknown' && $b['gender'] !== 'unknown' && $a['gender'] !== $b['gender']) { return ['score' => 0]; }
    foreach (['birth' => 'naissance', 'death' => 'décès'] as $k => $label) {
        if ($a[$k] && $b[$k]) {
            $d = abs($a[$k] - $b[$k]);
            if ($d === 0) { $score += 15; $why[] = "même année de {$label}"; } elseif ($d <= 2) { $score += 10; $why[] = "{$label} à {$d} an(s) près"; } elseif ($d <= 5) { $score += 3; } else { $score -= 35; $against[] = "{$label} : {$a[$k]} / {$b[$k]}"; }
        }
    }
    if ($a['birth_place'] !== '' && $a['birth_place'] === $b['birth_place']) { $score += 8; $why[] = 'même lieu de naissance'; }
    $names = static fn(array $ids, array $all) => array_values(array_filter(array_map(static fn($i) => isset($all[$i]) && trim($all[$i]['fn1'] . $all[$i]['ln']) !== '' ? $all[$i]['fn1'] . ' ' . $all[$i]['ln'] : null, $ids)));
    $commonParents = array_intersect($names($a['parents'], $aAll), $names($b['parents'], $bAll));
    if ($commonParents) { $score += 12 * min(2, count($commonParents)); $why[] = 'mêmes parents'; }
    $commonSpouses = array_intersect($names($a['spouses'], $aAll), $names($b['spouses'], $bAll));
    if ($commonSpouses) { $score += 15; $why[] = 'même conjoint'; }
    return ['score' => max(0, min(100, $score)), 'why' => $why, 'against' => $against];
}

/** Étape 1 : importer le fichier dans une base temporaire et proposer une décision pour chaque personne. */
function merge_gedcom_analyse(PDO $main, ?array $file): never
{
    @set_time_limit(0);
    if (!$file || ($file['error'] ?? 1) !== UPLOAD_ERR_OK) { json_response(['error' => 'Fichier non reçu.'], 422); }
    $ext = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!in_array($ext, ['ged', 'gedcom'], true)) { json_response(['error' => 'Choisis un fichier GEDCOM (.ged).'], 422); }
    $token = bin2hex(random_bytes(12));
    $path = merge_dir() . '/' . $token . '.sqlite';
    $tmp = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $schemaPath = APP_ROOT . '/data/schema.sql';
    $tmp->exec('PRAGMA foreign_keys = OFF');
    $tmp->exec(is_file($schemaPath) ? (string) file_get_contents($schemaPath) : default_schema_sql());
    $tmp->exec('PRAGMA foreign_keys = ON');
    migrate_database($tmp, $path);
    try { $stats = import_gedcom_into_db($tmp, (string) $file['tmp_name'], null); }
    catch (Throwable $e) { $tmp = null; @unlink($path); json_response(['error' => 'Fichier GEDCOM illisible : ' . $e->getMessage()], 422); }
    $incoming = merge_person_profiles($tmp);
    $mine = merge_person_profiles($main);
    $byName = [];
    foreach ($mine as $id => $p) { $byName[substr($p['ln'], 0, 3)][] = $id; }
    $rows = [];
    foreach ($incoming as $id => $p) {
        $cands = [];
        foreach ($byName[substr($p['ln'], 0, 3)] ?? [] as $mid) {
            $s = merge_score($p, $mine[$mid], $incoming, $mine);
            if ($s['score'] >= 40) { $cands[] = ['id' => $mid, 'score' => $s['score'], 'why' => $s['why'], 'against' => $s['against']]; }
        }
        usort($cands, static fn($x, $y) => $y['score'] <=> $x['score']);
        $cands = array_slice($cands, 0, 3);
        $best = $cands[0] ?? null;
        $proposal = $best && $best['score'] >= 65 && (!isset($cands[1]) || $cands[1]['score'] < $best['score'] - 5) ? 'same' : ($best ? 'check' : 'new');
        $missing = [];
        if ($best) {
            // Même règle que la fusion : naissance, baptême, décès… une seule fois ; les autres (profession, résidence…) par année
            $single = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CREM'];
            $have = [];
            foreach ($mine[$best['id']]['events'] as $e) { $have[$e['tag'] . (in_array($e['tag'], $single, true) ? '' : ':' . (int) $e['year'])] = true; }
            foreach ($p['events'] as $e) { if ($e['tag'] !== '' && !isset($have[$e['tag'] . (in_array($e['tag'], $single, true) ? '' : ':' . (int) $e['year'])])) { $missing[] = trim($e['label'] . ' ' . ($e['date'] ?: '') . ($e['place'] ? ', ' . $e['place'] : '')); } }
        }
        $rows[] = ['id' => $id, 'person' => merge_public_profile($p), 'proposal' => $proposal, 'candidates' => array_map(static fn($c) => $c + ['person' => merge_public_profile($mine[$c['id']])], $cands), 'missing' => $missing];
    }
    usort($rows, static fn($a, $b) => [['check' => 0, 'same' => 1, 'new' => 2][$a['proposal']], $a['person']['last_name'], $a['person']['first_name']] <=> [['check' => 0, 'same' => 1, 'new' => 2][$b['proposal']], $b['person']['last_name'], $b['person']['first_name']]);
    $counts = array_count_values(array_column($rows, 'proposal'));
    json_response(['token' => $token, 'file' => (string) $file['name'], 'stats' => $stats, 'rows' => $rows,
        'counts' => ['same' => $counts['same'] ?? 0, 'check' => $counts['check'] ?? 0, 'new' => $counts['new'] ?? 0]]);
}

function merge_public_profile(array $p): array
{
    return ['first_name' => trim($p['first_name'] . ' ' . $p['middle_name']), 'last_name' => $p['last_name'], 'gender' => $p['gender'], 'birth' => $p['birth'], 'death' => $p['death'],
        'events' => array_slice(array_map(static fn($e) => trim($e['label'] . ' ' . ($e['date'] ?: ($e['year'] ?: '')) . ($e['place'] ? ', ' . $e['place'] : '')), $p['events']), 0, 8)];
}

/** Étape 2 : appliquer les décisions. */
function merge_gedcom_apply(PDO $main, array $data): never
{
    @set_time_limit(0);
    $token = (string) ($data['token'] ?? '');
    $tmp = merge_temp_pdo($token);
    $decisions = is_array($data['decisions'] ?? null) ? $data['decisions'] : [];
    $origin = trim(mb_substr((string) ($data['origin'] ?? ''), 0, 80)) ?: 'Arbre reçu';
    // Copie de sécurité d'abord (jamais supprimée par la rotation des sauvegardes)
    $dir = DATA_DIR . '/backups';
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException('Impossible de créer le dossier de sauvegarde.'); }
    $backup = 'genealogie-backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '-avant-fusion.db';
    $main->exec('VACUUM main INTO ' . $main->quote($dir . '/' . $backup));
    $map = []; $sameTargets = []; $touched = []; $newIds = []; $stats = ['added' => 0, 'completed' => 0, 'ignored' => 0, 'events' => 0, 'families' => 0, 'children_links' => 0, 'notes' => 0];
    $main->beginTransaction();
    try {
        // Étiquette pour retrouver ce qui vient de cet arbre
        $labelName = mb_substr('Fusion : ' . $origin, 0, 80);
        $main->prepare('INSERT OR IGNORE INTO labels(name,color,description) VALUES(?,?,?)')->execute([$labelName, '#7a5af5', 'Personnes ajoutées ou complétées par la fusion du ' . date('d/m/Y')]);
        $labelId = (int) $main->query('SELECT id FROM labels WHERE name=' . $main->quote($labelName))->fetchColumn();
        $tag = $main->prepare("INSERT OR IGNORE INTO label_links(label_id,entity_type,entity_id) VALUES(?,'person',?)");
        $personCols = array_column($main->query('PRAGMA table_info(persons)')->fetchAll(), 'name');
        $copyCols = array_values(array_intersect(['first_name', 'middle_name', 'last_name', 'prefix', 'suffix', 'gender', 'living_status', 'occupation', 'nationality', 'physical_description'], $personCols, array_column($tmp->query('PRAGMA table_info(persons)')->fetchAll(), 'name')));
        foreach ($tmp->query('SELECT * FROM persons') as $p) {
            $id = (int) $p['id'];
            $d = $decisions[$id] ?? $decisions[(string) $id] ?? ['action' => 'ignore'];
            $action = (string) ($d['action'] ?? 'ignore');
            if ($action === 'same' && ($target = safe_int($d['target'] ?? 0)) && (int) $main->query('SELECT count(*) FROM persons WHERE id=' . $target)->fetchColumn()) {
                $map[$id] = $target; $sameTargets[$target] = true;
                // Champs vides de ma fiche remplis par ceux de l'arbre reçu
                $mineRow = $main->query('SELECT * FROM persons WHERE id=' . $target)->fetch();
                foreach (['occupation', 'middle_name', 'nationality'] as $c) {
                    if (in_array($c, $copyCols, true) && trim((string) ($mineRow[$c] ?? '')) === '' && trim((string) ($p[$c] ?? '')) !== '') {
                        $main->prepare("UPDATE persons SET {$c}=? WHERE id=?")->execute([mb_substr((string) $p[$c], 0, 200), $target]); $touched[$target] = true;
                    }
                }
            } elseif ($action === 'new') {
                // un arbre reçu ne fait pas entrer de nom de 20 000 lettres : 200 au plus, comme la saisie (assert_person_name_lengths)
                $vals = array_map(static fn($c) => in_array($c, ['first_name', 'middle_name', 'last_name', 'prefix', 'suffix', 'occupation', 'nationality'], true) && is_string($p[$c] ?? null) ? mb_substr($p[$c], 0, 200) : ($p[$c] ?? null), $copyCols);
                $main->prepare('INSERT INTO persons(' . implode(',', $copyCols) . ') VALUES(' . implode(',', array_fill(0, count($copyCols), '?')) . ')')->execute($vals);
                $map[$id] = (int) $main->lastInsertId(); $stats['added']++; $newIds[] = $map[$id];
            } else { $stats['ignored']++; }
        }
        // Événements de personne
        $typeCache = [];
        $typeId = static function (PDO $tmp, PDO $main, int $tmpType) use (&$typeCache): int {
            if (isset($typeCache[$tmpType])) { return $typeCache[$tmpType]; }
            $t = $tmp->query('SELECT * FROM event_types WHERE id=' . $tmpType)->fetch();
            // Même règle que l'import GEDCOM : type de même balise, sinon de même libellé, sinon créé
            static $gedCache = [];
            return $typeCache[$tmpType] = gedcom_event_type_id($main, $gedCache, (string) $t['scope'], (string) $t['gedcom_tag'], (string) $t['label']);
        };
        $placeCache = [];
        $placeId = static function (PDO $tmp, PDO $main, ?int $tmpPlace) use (&$placeCache): ?int {
            if (!$tmpPlace) { return null; }
            if (array_key_exists($tmpPlace, $placeCache)) { return $placeCache[$tmpPlace]; }
            $pl = $tmp->query('SELECT * FROM places WHERE id=' . $tmpPlace)->fetch();
            if (!$pl) { return $placeCache[$tmpPlace] = null; }
            $stmt = $main->prepare("SELECT id FROM places WHERE name=? COLLATE NOCASE AND COALESCE(county,'')=COALESCE(?,'') AND COALESCE(country,'')=COALESCE(?,'') LIMIT 1");
            $stmt->execute([$pl['name'], $pl['county'], $pl['country']]);
            $id = (int) $stmt->fetchColumn();
            if (!$id) {
                $main->prepare('INSERT INTO places(name,county,state,country,latitude,longitude,subdivision) VALUES(?,?,?,?,?,?,?)')
                    ->execute([$pl['name'], $pl['county'], $pl['state'], $pl['country'], $pl['latitude'], $pl['longitude'], $pl['subdivision'] ?? '']);
                $id = (int) $main->lastInsertId();
            }
            return $placeCache[$tmpPlace] = $id;
        };
        $insEvent = $main->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id,address,title,description,cause) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        $single = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CREM'];
        $hasEvent = static function (PDO $main, string $col, int $id, int $type, ?int $year, string $tagName) use ($single): bool {
            $sql = "SELECT count(*) FROM events WHERE {$col}=? AND event_type_id=?" . (in_array($tagName, $single, true) ? '' : ' AND COALESCE(year,0)=CAST(? AS INTEGER)');
            $stmt = $main->prepare($sql); $stmt->execute(in_array($tagName, $single, true) ? [$id, $type] : [$id, $type, (int) $year]);
            return (int) $stmt->fetchColumn() > 0;
        };
        foreach ($tmp->query("SELECT e.*, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.scope='person' AND e.person_id IS NOT NULL") as $e) {
            $pid = $map[(int) $e['person_id']] ?? null; if (!$pid) { continue; }
            $type = $typeId($tmp, $main, (int) $e['event_type_id']);
            if ($hasEvent($main, 'person_id', $pid, $type, $e['year'] ? (int) $e['year'] : null, (string) $e['gedcom_tag'])) { continue; }
            $touched[$pid] = true;
            $insEvent->execute(['person', $pid, null, $type, $e['date_text'], $e['year'], $placeId($tmp, $main, $e['place_id'] ? (int) $e['place_id'] : null), $e['address'] ?? '', $e['title'] ?? '', $e['description'] ?? '', $e['cause'] ?? '']);
            $stats['events']++;
        }
        // Familles : couples et enfants
        $findFamily = $main->prepare('SELECT id FROM families WHERE (partner1_id IS ? AND partner2_id IS ?) OR (partner1_id IS ? AND partner2_id IS ?) LIMIT 1');
        $famMap = [];
        foreach ($tmp->query('SELECT * FROM families') as $f) {
            $a = $f['partner1_id'] ? ($map[(int) $f['partner1_id']] ?? null) : null;
            $b = $f['partner2_id'] ? ($map[(int) $f['partner2_id']] ?? null) : null;
            $kids = array_values(array_filter(array_map(static fn($c) => $map[(int) $c] ?? null, $tmp->query('SELECT child_id FROM family_children WHERE family_id=' . (int) $f['id'])->fetchAll(PDO::FETCH_COLUMN))));
            if (!$a && !$b) { continue; }
            if ((!$a || !$b) && !$kids) { continue; }
            if (!$a || !$b) {
                // Un seul parent connu : les enfants déjà rattachés chez moi à une famille de ce parent n'apportent rien
                $one = $a ?: $b;
                $known = $main->prepare('SELECT count(*) FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? AND (f.partner1_id=? OR f.partner2_id=?)');
                $kids = array_values(array_filter($kids, static function ($k) use ($known, $one) { $known->execute([$k, $one, $one]); return !(int) $known->fetchColumn(); }));
                if (!$kids) { continue; }
            }
            $findFamily->execute([$a, $b, $b, $a]);
            $fid = (int) $findFamily->fetchColumn();
            if (!$fid && (!$a || !$b)) {
                // Parent seul : rattacher les enfants à une famille existante de ce parent qui les contient déjà, sinon en créer une
                $one = $a ?: $b;
                $s = $main->prepare('SELECT id FROM families WHERE (partner1_id=? AND partner2_id IS NULL) OR (partner2_id=? AND partner1_id IS NULL) LIMIT 1'); $s->execute([$one, $one]); $fid = (int) $s->fetchColumn();
            }
            if (!$fid) { $main->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]); $fid = (int) $main->lastInsertId(); $stats['families']++; if ($a) { $touched[$a] = true; } if ($b) { $touched[$b] = true; } }
            $famMap[(int) $f['id']] = $fid;
            foreach ($kids as $k) {
                $exists = $main->prepare('SELECT count(*) FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? AND (f.id=? OR ((f.partner1_id IS ? OR f.partner1_id IS ?) AND (f.partner2_id IS ? OR f.partner2_id IS ?)))');
                $exists->execute([$k, $fid, $a, $b, $a, $b]);
                if ((int) $exists->fetchColumn()) { continue; }
                // Déjà deux parents ailleurs : on ne crée pas un troisième jeu de parents
                $parents = $main->prepare('SELECT count(*) FROM family_children WHERE child_id=?'); $parents->execute([$k]);
                if ((int) $parents->fetchColumn() > 0 && $a && $b) { continue; }
                $main->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$fid, $k]);
                $stats['children_links']++; $touched[$k] = true;
            }
        }
        foreach ($tmp->query("SELECT e.*, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.scope='family' AND e.family_id IS NOT NULL") as $e) {
            $fid = $famMap[(int) $e['family_id']] ?? null; if (!$fid) { continue; }
            $type = $typeId($tmp, $main, (int) $e['event_type_id']);
            if ($hasEvent($main, 'family_id', $fid, $type, $e['year'] ? (int) $e['year'] : null, (string) $e['gedcom_tag'])) { continue; }
            foreach ($main->query('SELECT partner1_id, partner2_id FROM families WHERE id=' . (int) $fid)->fetch(PDO::FETCH_NUM) ?: [] as $partner) { if ($partner) { $touched[(int) $partner] = true; } }
            $insEvent->execute(['family', null, $fid, $type, $e['date_text'], $e['year'], $placeId($tmp, $main, $e['place_id'] ? (int) $e['place_id'] : null), $e['address'] ?? '', $e['title'] ?? '', $e['description'] ?? '', $e['cause'] ?? '']);
            $stats['events']++;
        }
        // Notes des personnes
        $noteCols = array_column($main->query('PRAGMA table_info(notes)')->fetchAll(), 'name');
        if (in_array('entity_type', $noteCols, true)) {
            foreach ($tmp->query("SELECT * FROM notes WHERE entity_type='person'") as $n) {
                $pid = $map[(int) $n['entity_id']] ?? null; if (!$pid) { continue; }
                $body = trim((string) ($n['body'] ?? ''));
                if ($body === '') { continue; }
                $col = 'body';
                // Même note déjà présente (aux espaces et retours à la ligne près, ou déjà ajoutée par une fusion précédente)
                $norm = static fn(string $t) => trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/\n\n\([^()\n]{1,80}\)\s*$/u', '', $t)));
                $dup = $main->prepare("SELECT {$col} FROM notes WHERE entity_type='person' AND entity_id=?"); $dup->execute([$pid]);
                $known = array_map($norm, $dup->fetchAll(PDO::FETCH_COLUMN));
                if (in_array($norm($body), $known, true)) { continue; }
                $main->prepare("INSERT INTO notes(entity_type,entity_id,{$col}) VALUES('person',?,?)")->execute([$pid, $body . "\n\n(" . $origin . ')']);
                $stats['notes']++; $touched[$pid] = true;
            }
        }
        // « Complétée » = fiche existante à laquelle quelque chose a vraiment été ajouté ; seules celles-là et les nouvelles
        // reçoivent l'étiquette de la fusion (sinon une réimport à l'identique étiquetterait toute la base)
        foreach (array_keys($touched) as $pid) {
            if (isset($sameTargets[$pid])) { $stats['completed']++; }
            if (isset($sameTargets[$pid]) || in_array($pid, $newIds, true)) { $tag->execute([$labelId, $pid]); }
            if (function_exists('rebuild_search')) { rebuild_search($main, (int) $pid); }
        }
        foreach ($newIds as $pid) { if (!isset($touched[$pid])) { $tag->execute([$labelId, $pid]); if (function_exists('rebuild_search')) { rebuild_search($main, (int) $pid); } } }
        $stats['unchanged'] = count($sameTargets) - $stats['completed'];
        log_change($main, 'meta', 0, 'update', "Fusion de l'arbre « {$origin} » : {$stats['added']} ajoutée(s), {$stats['completed']} complétée(s), {$stats['events']} événement(s)", null, $stats + ['backup' => $backup]);
        $main->commit();
    } catch (Throwable $e) {
        if ($main->inTransaction()) { $main->rollBack(); }
        json_response(['error' => 'Fusion annulée, rien n’a été modifié : ' . $e->getMessage()], 500);
    }
    $tmp = null;
    foreach (['', '-wal', '-shm', '.migration-lock'] as $suffix) { @unlink(merge_dir() . '/' . $token . '.sqlite' . $suffix); }
    json_response(['ok' => true, 'stats' => $stats, 'backup' => $backup, 'label' => $labelName]);
}
