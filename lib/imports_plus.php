<?php
declare(strict_types=1);

/**
 * ⤒ Imports et exports « en plus » (Réglages → Import → « ⤒ Relevés, tableaux, références et lieux ») :
 *  1. relevés des cercles généalogiques (Nimègue v2 / v3, CSV des dépouillements) → l'outil de dépouillement existant
 *     (archive_digest_entries : un dépouillement par commune et sorte d'actes ; une ligne de transcription par acte ;
 *     une personne relevée par nom cité, avec son rôle) ; « créer ou relier les fiches » : jamais de doublon silencieux,
 *     chaque personne déjà dans la base est proposée (« c'est la même personne ? ») et c'est toi qui choisis ;
 *  2. tableau de personnes (Excel, LibreOffice, CSV) → fiches, événements et familles ;
 *  3. références RIS et BibTeX ↔ sources de l'app (import et export, accents compris ; l'Atelier de recherche a les siens,
 *     lib/atelier.php, lus par les mêmes fonctions) ;
 *  4. lieux depuis KML / GeoJSON : compléter les coordonnées des lieux existants (rapprochés par le nom et le département,
 *     confirmés ligne par ligne) ou créer les lieux manquants ; les fichiers de lib/echanges.php se relisent sans perte.
 * Les tableaux (CSV, XLSX, ODS) sont lus dans le navigateur par le moteur commun (LCNDA_SHEET) : le serveur reçoit des
 * lignes déjà découpées, qu'il revérifie (tailles bornées, formules refusées). Chaque import rend un jeton « ↶ Annuler ».
 * Écran : assets/js/heritage-imports-plus.js ; calcul commun : assets/js/app-imports-plus-core.js ; test : tests/test-imports-exports-3b.js.
 */

const IP_MAX_ACTS = 20000;
const IP_MAX_PERSONS = 10000;
const IP_MAX_GEO_BYTES = 20 * 1048576;
const IP_MAX_GEO_POINTS = 20000;
const IP_MAX_BIB_BYTES = 20 * 1048576;
const IP_MAX_REFS = 20000;

/** Une case qu'un tableur lirait comme une formule (« =… », « @… », « +CMD| », « -NOM( ») : elle n'entre jamais. */
function ip_is_formula(string $s): bool
{
    return (bool) preg_match('/^\s*[=@]|^\s*[+\-]\s*[A-Za-z(]/', $s);
}

/** Texte reçu → texte propre, borné ; une formule devient vide. */
function ip_txt(mixed $v, int $max = 500): string
{
    if (!is_scalar($v)) { return ''; }
    $s = (string) $v;
    if (!mb_check_encoding($s, 'UTF-8')) { $s = mb_convert_encoding($s, 'UTF-8', 'Windows-1252'); }
    $s = trim(preg_replace('/\s+/u', ' ', preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '') ?? '');
    if (ip_is_formula($s)) { return ''; }
    return mb_substr($s, 0, $max);
}

function ip_fold(string $s): string
{
    return trim(preg_replace('/[^a-z0-9]+/', ' ', gedcom_fold(str_replace(['œ', 'Œ', 'æ', 'Æ'], ['oe', 'oe', 'ae', 'ae'], $s))) ?? '');
}

function ip_event_type(PDO $pdo, string $tag): int
{
    static $cache = [];
    if (!isset($cache[$tag])) {
        $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY is_custom, id LIMIT 1');
        $s->execute([$tag]);
        $cache[$tag] = (int) $s->fetchColumn();
    }
    return $cache[$tag];
}

function ip_year(string $date): ?int
{
    if (trim($date) === '') { return null; }
    [$y] = event_year_and_converted($date, '', 'gregorian');
    return $y !== null && $y > 0 && $y < 2200 ? (int) $y : null;
}

function ip_plural(int $n, string $one, string $many): string { return number_format($n, 0, ',', ' ') . ' ' . ($n > 1 ? $many : $one); }

// ─── Personnes déjà dans la base : « c'est la même personne ? » ────────────────────────────────────────────

/**
 * Index des fiches dont le nom (replié : sans accents ni majuscules) est l'un de ceux cherchés.
 * → [nom replié => [[id, first, last, gender, by, dy], …]]
 */
function ip_people_index(PDO $pdo, array $lastFolds): array
{
    $want = array_fill_keys(array_filter($lastFolds), true);
    if (!$want) { return []; }
    $idx = []; $ids = [];
    foreach ($pdo->query("SELECT id, first_name, last_name, gender FROM persons WHERE COALESCE(kind,'person')<>'animal'") as $r) {
        $f = ip_fold((string) $r['last_name']);
        if ($f === '' || !isset($want[$f])) { continue; }
        $idx[$f][(int) $r['id']] = ['id' => (int) $r['id'], 'first' => (string) $r['first_name'], 'last' => (string) $r['last_name'], 'gender' => (string) $r['gender'], 'by' => null, 'dy' => null];
        $ids[(int) $r['id']] = $f;
    }
    foreach (array_chunk(array_keys($ids), 500) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        $s = $pdo->prepare("SELECT e.person_id, t.gedcom_tag, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($in) AND e.year IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI')");
        $s->execute($chunk);
        foreach ($s as $e) {
            $pid = (int) $e['person_id']; $p = &$idx[$ids[$pid]][$pid]; $y = (int) $e['year'];
            if (in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true)) { $p['by'] = $p['by'] === null ? $y : min($p['by'], $y); }
            else { $p['dy'] = $p['dy'] === null ? $y : max($p['dy'], $y); }
            unset($p);
        }
    }
    return array_map('array_values', $idx);
}

/**
 * Les fiches qui pourraient être cette personne (3 au plus, la plus probable d'abord).
 * $kind : birth (année de naissance), death, marriage (année du mariage), parent (année de l'acte de l'enfant), any.
 */
function ip_candidates(array $index, string $first, string $last, string $sex, ?int $year, string $kind): array
{
    $lf = ip_fold($last); $ff = ip_fold($first);
    if ($lf === '' || $ff === '' || empty($index[$lf])) { return []; }
    $tok = explode(' ', $ff)[0];
    $out = [];
    foreach ($index[$lf] as $p) {
        $pf = ip_fold($p['first']);
        if ($pf === '') { continue; }
        $score = $pf === $ff ? 3 : (explode(' ', $pf)[0] === $tok || str_contains(' ' . $pf . ' ', ' ' . $tok . ' ') ? 2 : 0);
        if (!$score) { continue; }
        if ($sex !== '' && in_array($p['gender'], ['male', 'female'], true) && in_array($sex, ['male', 'female'], true) && $p['gender'] !== $sex) { continue; }
        $by = $p['by']; $dy = $p['dy'];
        if ($year !== null) {
            if ($kind === 'birth' && $by !== null) { $d = abs($by - $year); if ($d > 5) { continue; } $score += $d <= 1 ? 3 : 1; }
            if ($kind === 'death') { if ($dy !== null) { $d = abs($dy - $year); if ($d > 5) { continue; } $score += $d <= 1 ? 3 : 1; } if ($by !== null && $by > $year) { continue; } }
            if ($kind === 'marriage') { if ($by !== null && ($year - $by < 12 || $year - $by > 85)) { continue; } if ($dy !== null && $dy < $year) { continue; } if ($by !== null) { $score++; } }
            if ($kind === 'parent') { if ($by !== null && ($year - $by < 13 || $year - $by > 75)) { continue; } if ($dy !== null && $dy < $year - 1) { continue; } if ($by !== null) { $score++; } }
        }
        $out[] = ['id' => $p['id'], 'title' => trim($p['first'] . ' ' . mb_strtoupper($p['last'])), 'years' => ($by || $dy) ? (($by ?: '?') . '–' . ($dy ?: '')) : '', 'score' => $score];
    }
    usort($out, static fn($a, $b) => $b['score'] <=> $a['score'] ?: $a['id'] <=> $b['id']);
    return array_slice($out, 0, 3);
}

// ─── 1. Relevés (Nimègue, cercles) ─────────────────────────────────────────────────────────────────────────

const IP_RELEVE_ROLES = ['sujet', 'epoux', 'epouse', 'pere', 'mere', 'pere_epoux', 'mere_epoux', 'pere_epouse', 'mere_epouse', 'parrain', 'marraine', 'temoin', 'conjoint', 'conjointV', 'ex'];
/** Les rôles qu'on peut relier à une fiche (les témoins, parrains et marraines restent des noms relevés). */
const IP_RELEVE_LINKABLE = ['sujet', 'epoux', 'epouse', 'pere', 'mere', 'pere_epoux', 'mere_epoux', 'pere_epouse', 'mere_epouse', 'conjoint'];

/** Les actes reçus du navigateur, revérifiés. */
function ip_releves_acts(mixed $raw): array
{
    if (!is_array($raw)) { throw new LcndaBadInput('Aucun acte reçu.'); }
    if (count($raw) > IP_MAX_ACTS) { throw new LcndaBadInput('Trop d’actes d’un coup (' . IP_MAX_ACTS . ' au plus) : coupe le fichier en plusieurs.'); }
    $acts = [];
    foreach (array_values($raw) as $a) {
        if (!is_array($a)) { continue; }
        $type = in_array($a['type'] ?? '', ['N', 'M', 'D', 'V'], true) ? $a['type'] : 'N';
        $people = [];
        foreach (array_slice(is_array($a['people'] ?? null) ? $a['people'] : [], 0, 30) as $p) {
            if (!is_array($p)) { continue; }
            $role = in_array($p['role'] ?? '', IP_RELEVE_ROLES, true) ? $p['role'] : 'temoin';
            $q = ['role' => $role, 'label' => ip_txt($p['label'] ?? '', 60) ?: $role, 'first' => ip_txt($p['first'] ?? '', 200), 'last' => ip_txt($p['last'] ?? '', 200),
                'sex' => in_array($p['sex'] ?? '', ['male', 'female'], true) ? $p['sex'] : '', 'age' => ip_txt($p['age'] ?? '', 40), 'born' => ip_txt($p['born'] ?? '', 80),
                'origin' => ip_txt($p['origin'] ?? '', 200), 'job' => ip_txt($p['job'] ?? '', 200), 'note' => ip_txt($p['note'] ?? '', 1000)];
            if ($q['first'] === '' && $q['last'] === '') { continue; }
            $people[] = $q;
        }
        $act = ['type' => $type, 'date' => ip_txt($a['date'] ?? '', 80), 'drepub' => ip_txt($a['drepub'] ?? '', 80), 'commune' => ip_txt($a['commune'] ?? '', 200), 'insee' => ip_txt($a['insee'] ?? '', 10),
            'dept' => ip_txt($a['dept'] ?? '', 80), 'cote' => ip_txt($a['cote'] ?? '', 200), 'page' => ip_txt($a['page'] ?? '', 40), 'no' => ip_txt($a['no'] ?? '', 40), 'libre' => ip_txt($a['libre'] ?? '', 200),
            'label' => ip_txt($a['label'] ?? '', 200), 'note' => ip_txt($a['note'] ?? '', 4000), 'people' => $people];
        if (!$people && $act['date'] === '') { continue; }
        $acts[] = $act;
    }
    if (!$acts) { throw new LcndaBadInput('Aucun acte lisible dans ce fichier : vérifie le choix des colonnes.'); }
    return $acts;
}

/** Le nom de l'acte selon l'époque : avant 1793, baptêmes et sépultures ; après, naissances et décès. */
function ip_act_kind(array $a): string
{
    $y = ip_year($a['date']) ?? ip_year($a['drepub']);
    $old = $y !== null && $y < 1793;
    return match ($a['type']) { 'M' => 'Mariage', 'D' => $old ? 'Sépulture' : 'Décès', 'V' => $a['label'] !== '' ? $a['label'] : 'Acte divers', default => $old ? 'Baptême' : 'Naissance' };
}

/** Une ligne lisible pour la transcription du dépouillement. */
function ip_act_text(array $a): string
{
    $head = array_filter([ip_act_kind($a), $a['date'], $a['drepub'] !== '' ? '(' . $a['drepub'] . ')' : '', $a['no'] !== '' ? 'acte ' . $a['no'] : ($a['libre'] !== '' ? $a['libre'] : '')]);
    $who = [];
    foreach ($a['people'] as $p) {
        $n = trim($p['first'] . ' ' . mb_strtoupper($p['last']));
        $bits = array_filter([$p['age'] !== '' ? $p['age'] . (preg_match('/^\d+$/', $p['age']) ? ' ans' : '') : '', $p['job'], $p['origin'] !== '' ? 'de ' . $p['origin'] : '', $p['born'] !== '' ? '° ' . $p['born'] : '', $p['note']]);
        $who[] = mb_strtolower($p['label']) . ' : ' . $n . ($bits ? ' (' . implode(', ', $bits) . ')' : '');
    }
    return implode(' · ', $head) . ($who ? ' — ' . implode(' ; ', $who) : '') . ($a['note'] !== '' ? ' — ' . $a['note'] : '');
}

/** Le dépouillement où va un acte : un par commune et sorte d'actes. */
function ip_releve_group(array $a): string { return ip_fold($a['commune']) . '|' . $a['type']; }

/** Étape 2 : ce qui va entrer, actes déjà là, et pour chaque personne reliable, les fiches proches. */
function releves_check(PDO $pdo, array $d): array
{
    $acts = ip_releves_acts($d['acts'] ?? null);
    $wantLinks = !empty($d['with_links']);
    // déjà importés : même texte d'acte dans un dépouillement de la même commune
    $already = 0;
    $seen = [];
    foreach ($pdo->query('SELECT l.content FROM archive_digest_transcription_lines l') as $r) { $seen[md5((string) $r['content'])] = true; }
    foreach ($acts as $a) { if (isset($seen[md5(ip_act_text($a))])) { $already++; } }
    $people = []; $n = 0;
    foreach ($acts as $a) { foreach ($a['people'] as $p) { $n++; } }
    $truncated = false;
    if ($wantLinks) {
        $folds = [];
        foreach ($acts as $a) { foreach ($a['people'] as $p) { if (in_array($p['role'], IP_RELEVE_LINKABLE, true)) { $folds[] = ip_fold($p['last']); } } }
        $index = ip_people_index($pdo, array_unique($folds));
        foreach ($acts as $ai => $a) {
            $y = ip_year($a['date']) ?? ip_year($a['drepub']);
            foreach ($a['people'] as $pi => $p) {
                if (!in_array($p['role'], IP_RELEVE_LINKABLE, true)) { continue; }
                if (count($people) >= 3000) { $truncated = true; break 2; }
                $kind = match (true) { $p['role'] === 'sujet' && $a['type'] === 'N' => 'birth', $p['role'] === 'sujet' && $a['type'] === 'D' => 'death', in_array($p['role'], ['epoux', 'epouse'], true) => 'marriage', in_array($p['role'], ['pere', 'mere'], true) && $a['type'] === 'N' => 'parent', default => 'any' };
                $people[] = ['a' => $ai, 'p' => $pi, 'candidates' => ip_candidates($index, $p['first'], $p['last'], $p['sex'], $y, $kind)];
            }
        }
    }
    $groups = [];
    foreach ($acts as $a) { $groups[ip_releve_group($a)] = ['commune' => $a['commune'], 'type' => $a['type']]; }
    return ['acts' => count($acts), 'people' => $n, 'already' => $already, 'links' => $people, 'truncated' => $truncated, 'groups' => array_values($groups)];
}

/**
 * Étape 3 : les relevés entrent dans les dépouillements (nouveaux, ou celui choisi : digest_id), avec leurs personnes ;
 * links : {"a:p": {"mode": "link", "id": N} | {"mode": "create"}} — rien d'autre n'est créé ni relié.
 */
function releves_import(PDO $pdo, array $d): array
{
    $acts = ip_releves_acts($d['acts'] ?? null);
    $links = is_array($d['links'] ?? null) ? $d['links'] : [];
    $label = ip_txt($d['label'] ?? '', 120) ?: 'relevés';
    $format = ip_txt($d['format'] ?? '', 40);
    $target = safe_int($d['digest_id'] ?? 0);
    if ($target && !archive_digest_row($pdo, $target)) { throw new LcndaBadInput('Dépouillement introuvable.'); }
    $before = import_receipt_begin($pdo);
    $maxOf = static fn(string $t): int => (int) $pdo->query("SELECT COALESCE(MAX(id),0) FROM $t")->fetchColumn();
    $lines0 = $maxOf('archive_digest_transcription_lines'); $people0 = $maxOf('archive_digest_people');
    $newDigests = [];
    // les dépouillements : un par commune et sorte d'actes (ou celui choisi)
    $digestOf = [];
    if (!$target) {
        $byGroup = [];
        foreach ($acts as $a) { $byGroup[ip_releve_group($a)][] = $a; }
        foreach ($byGroup as $key => $list) {
            $a0 = $list[0];
            $years = array_values(array_filter(array_map(static fn($a) => ip_year($a['date']) ?? ip_year($a['drepub']), $list)));
            $cotes = array_values(array_unique(array_filter(array_map(static fn($a) => $a['cote'], $list))));
            $old = $years && min($years) < 1793;
            $type = match ($a0['type']) { 'M' => 'mariage', 'D' => 'deces', 'V' => 'autre', default => $old ? 'bapteme' : 'naissance' };
            $placeId = null;
            if ($a0['commune'] !== '') {
                $s = $pdo->prepare('SELECT id FROM places WHERE name=? COLLATE NOCASE ORDER BY (county=? COLLATE NOCASE) DESC, (latitude IS NOT NULL) DESC, id LIMIT 1');
                $s->execute([$a0['commune'], $a0['dept']]);
                $placeId = (int) $s->fetchColumn() ?: null;
            }
            $id = save_archive_digest($pdo, ['place_id' => $placeId, 'city_name' => $a0['commune'], 'department' => $a0['dept'], 'archive_reference' => implode(', ', array_slice($cotes, 0, 6)),
                'year_text' => $years ? (min($years) === max($years) ? (string) min($years) : min($years) . '–' . max($years)) : '', 'record_type' => $type, 'status' => 'done', 'is_exhaustive' => 0,
                'notes' => 'Relevé importé (' . ($format ?: 'tableau') . ') depuis « ' . $label . ' » le ' . date('d/m/Y') . ' : ' . ip_plural(count($list), 'acte', 'actes') . '.'])['id'];
            $digestOf[$key] = $id; $newDigests[] = $id;
        }
    }
    $lineNo = [];
    $insLine = $pdo->prepare('INSERT INTO archive_digest_transcription_lines(archive_digest_id, page_number, line_number, content) VALUES(?,?,?,?)');
    $insPerson = $pdo->prepare('INSERT INTO archive_digest_people(archive_digest_id, person_id, first_name, last_name, age_text, birth_place, occupation, household_position, extra_info, notes, page_number, household_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    $created = 0; $linked = 0; $eventsAdded = 0; $families = 0;
    $groupIds = [];
    foreach ($acts as $ai => $a) {
        $digest = $target ?: $digestOf[ip_releve_group($a)];
        if (!isset($lineNo[$digest])) { $s = $pdo->prepare('SELECT COALESCE(MAX(line_number),0) FROM archive_digest_transcription_lines WHERE archive_digest_id=?'); $s->execute([$digest]); $lineNo[$digest] = (int) $s->fetchColumn(); }
        $insLine->execute([$digest, $a['page'], ++$lineNo[$digest], ip_act_text($a)]);
        $kind = ip_act_kind($a);
        $actKey = $a['no'] !== '' ? 'Acte ' . $a['no'] : ($a['date'] !== '' ? 'Acte du ' . $a['date'] : 'Acte ' . ($ai + 1));
        $extra = trim($kind . ($a['date'] !== '' ? ' du ' . $a['date'] : '') . ($a['commune'] !== '' ? ' · ' . $a['commune'] : ''));
        // les fiches reliées ou créées pour cet acte
        $ids = [];
        foreach ($a['people'] as $pi => $p) {
            $l = $links["$ai:$pi"] ?? null;
            if (!is_array($l) || !in_array($p['role'], IP_RELEVE_LINKABLE, true)) { continue; }
            if (($l['mode'] ?? '') === 'link' && ($pid = safe_int($l['id'] ?? 0)) && person_exists($pdo, $pid)) { $ids[$pi] = $pid; $linked++; }
            elseif (($l['mode'] ?? '') === 'create' && ($g = ip_txt($l['g'] ?? '', 300)) !== '' && isset($groupIds[$g])) { $ids[$pi] = $groupIds[$g]; } // la même personne citée dans plusieurs actes : une seule fiche
            elseif (($l['mode'] ?? '') === 'create') {
                $sex = $p['sex'] ?: (in_array($p['role'], ['pere', 'pere_epoux', 'pere_epouse', 'epoux'], true) ? 'male' : (in_array($p['role'], ['mere', 'mere_epoux', 'mere_epouse', 'epouse'], true) ? 'female' : 'unknown'));
                $row = save_person($pdo, ['first_name' => $p['first'], 'last_name' => $p['last'], 'gender' => $sex, 'occupation' => $p['job']]);
                $ids[$pi] = (int) $row['id']; $created++;
                if (($g = ip_txt($l['g'] ?? '', 300)) !== '') { $groupIds[$g] = $ids[$pi]; }
                // l'événement de l'acte, seulement sur une fiche créée ici (une fiche existante n'est jamais changée en silence)
                $tag = match (true) { $p['role'] === 'sujet' && $a['type'] === 'N' => $kind === 'Baptême' ? 'CHR' : 'BIRT', $p['role'] === 'sujet' && $a['type'] === 'D' => $kind === 'Sépulture' ? 'BURI' : 'DEAT', default => '' };
                if ($tag !== '' && ($type = ip_event_type($pdo, $tag))) {
                    add_event($pdo, ['person_id' => $ids[$pi], 'event_type_id' => $type, 'date_text' => $a['date'] !== '' ? $a['date'] : $a['drepub'], 'place_name' => $a['commune'], 'description' => 'D’après le relevé : ' . $label . ($a['cote'] !== '' ? ' (' . $a['cote'] . ')' : '')]);
                    $eventsAdded++;
                }
            }
        }
        // liens de famille entre les fiches de l'acte (seulement celles que tu as reliées ou créées)
        $roleId = []; foreach ($ids as $pi => $id) { $roleId[$a['people'][$pi]['role']] = $id; }
        $child = static fn(?int $parent, ?int $kid) => ($parent && $kid && $parent !== $kid) ? add_parent_child($pdo, $parent, $kid) : null;
        if (isset($roleId['sujet'])) { $child($roleId['pere'] ?? null, $roleId['sujet']); $child($roleId['mere'] ?? null, $roleId['sujet']); }
        if (isset($roleId['epoux'])) { $child($roleId['pere_epoux'] ?? null, $roleId['epoux']); $child($roleId['mere_epoux'] ?? null, $roleId['epoux']); }
        if (isset($roleId['epouse'])) { $child($roleId['pere_epouse'] ?? null, $roleId['epouse']); $child($roleId['mere_epouse'] ?? null, $roleId['epouse']); }
        if ($a['type'] === 'M' && isset($roleId['epoux'], $roleId['epouse']) && $roleId['epoux'] !== $roleId['epouse']) {
            $fid = couple_family_id($pdo, $roleId['epoux'], $roleId['epouse']);
            if (!$fid) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$roleId['epoux'], $roleId['epouse']]); $fid = (int) $pdo->lastInsertId(); $families++; }
            $has = $pdo->prepare("SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=? AND t.gedcom_tag='MARR' LIMIT 1"); $has->execute([$fid]);
            if (!$has->fetchColumn() && ($type = ip_event_type($pdo, 'MARR'))) {
                add_event($pdo, ['event_scope' => 'family', 'family_id' => $fid, 'event_type_id' => $type, 'date_text' => $a['date'] !== '' ? $a['date'] : $a['drepub'], 'place_name' => $a['commune'], 'description' => 'D’après le relevé : ' . $label . ($a['cote'] !== '' ? ' (' . $a['cote'] . ')' : '')]);
                $eventsAdded++;
            }
        }
        foreach ($a['people'] as $pi => $p) {
            $insPerson->execute([$digest, $ids[$pi] ?? null, $p['first'], $p['last'], $p['age'], $p['origin'], $p['job'], $p['label'], $extra . ($p['born'] !== '' ? ' · né(e) ' . $p['born'] : ''), $p['note'], $a['page'], $actKey]);
        }
    }
    $range = static fn(string $t, int $from): array => [$from, (int) $pdo->query("SELECT COALESCE(MAX(id),0) FROM $t")->fetchColumn()];
    $undo = import_receipt_save($pdo, 'tree', $before, ['label' => $label, 'releves' => ['digests' => $newDigests, 'lines' => $range('archive_digest_transcription_lines', $lines0), 'people' => $range('archive_digest_people', $people0)]]);
    log_change($pdo, 'archive_digest', $target ?: ($newDigests[0] ?? 0), 'create', 'Relevés importés depuis « ' . $label . ' » : ' . ip_plural(count($acts), 'acte', 'actes'));
    $people = 0; foreach ($acts as $a) { $people += count($a['people']); }
    return ['acts' => count($acts), 'people' => $people, 'created' => $created, 'linked' => $linked, 'events' => $eventsAdded, 'families' => $families, 'digests' => $target ? [$target] : $newDigests, 'undo' => $undo];
}

/** ↶ Annuler un import de relevés : ses lignes, ses personnes relevées, ses dépouillements créés, puis les fiches créées. */
function releves_undo(PDO $pdo, array $d): array
{
    $token = (string) ($d['token'] ?? '');
    $r = import_receipt_load($token, 'tree');
    $rel = is_array($r['releves'] ?? null) ? $r['releves'] : null;
    if (!$rel) { throw new LcndaBadInput('Annulation impossible : ce n’est pas un import de relevés.'); }
    $n = 0;
    foreach (['archive_digest_people' => 'people', 'archive_digest_transcription_lines' => 'lines'] as $t => $k) {
        [$a, $b] = array_map('intval', $rel[$k] ?? [0, 0]);
        if ($b > $a) { $n += (int) $pdo->exec("DELETE FROM $t WHERE id > $a AND id <= $b"); }
    }
    foreach (array_map('intval', $rel['digests'] ?? []) as $id) {
        $left = $pdo->prepare('SELECT (SELECT count(*) FROM archive_digest_people WHERE archive_digest_id=?) + (SELECT count(*) FROM archive_digest_transcription_lines WHERE archive_digest_id=?) + (SELECT count(*) FROM archive_digest_media WHERE archive_digest_id=?)');
        $left->execute([$id, $id, $id]);
        if (!(int) $left->fetchColumn() && archive_digest_row($pdo, $id)) { delete_archive_digest($pdo, ['id' => $id]); $n++; }
    }
    $tree = import_undo($pdo, ['token' => $token]);
    return ['removed' => $n + (int) ($tree['removed'] ?? 0)];
}

// ─── 2. Tableau de personnes → fiches et familles ─────────────────────────────────────────────────────────

/** Le plan reçu du navigateur (app-imports-plus-core.js : buildPeoplePlan), revérifié. */
function ip_people_plan(array $d): array
{
    $persons = [];
    foreach (array_slice(is_array($d['persons'] ?? null) ? $d['persons'] : [], 0, IP_MAX_PERSONS + 1) as $p) {
        if (!is_array($p) || !preg_match('/^r\d{1,7}$/', (string) ($p['k'] ?? ''))) { continue; }
        $first = ip_txt($p['first'] ?? '', 200); $last = ip_txt($p['last'] ?? '', 200);
        if ($first === '' && $last === '') { continue; }
        $events = [];
        foreach (['BIRT', 'CHR', 'DEAT', 'BURI'] as $tag) {
            $e = $p['events'][$tag] ?? null;
            if (is_array($e)) { $date = ip_txt($e['date'] ?? '', 120); $place = ip_txt($e['place'] ?? '', 200); if ($date !== '' || $place !== '') { $events[$tag] = ['date' => $date, 'place' => $place]; } }
        }
        $persons[(string) $p['k']] = ['k' => (string) $p['k'], 'first' => $first, 'last' => $last, 'sex' => in_array($p['sex'] ?? '', ['male', 'female'], true) ? $p['sex'] : 'unknown',
            'occupation' => ip_txt($p['occupation'] ?? '', 200), 'note' => ip_txt($p['note'] ?? '', 8000), 'events' => $events];
    }
    if (count($persons) > IP_MAX_PERSONS) { throw new LcndaBadInput('Trop de lignes d’un coup (' . IP_MAX_PERSONS . ' personnes au plus) : coupe le tableau en plusieurs.'); }
    if (!$persons) { throw new LcndaBadInput('Aucune personne dans ce tableau : choisis au moins la colonne du nom ou du prénom.'); }
    $families = [];
    foreach (array_slice(is_array($d['families'] ?? null) ? $d['families'] : [], 0, IP_MAX_PERSONS * 2) as $f) {
        if (!is_array($f)) { continue; }
        $a = isset($persons[(string) ($f['a'] ?? '')]) ? (string) $f['a'] : null; $b = isset($persons[(string) ($f['b'] ?? '')]) ? (string) $f['b'] : null;
        $kids = array_values(array_unique(array_filter(array_map('strval', is_array($f['children'] ?? null) ? $f['children'] : []), static fn($k) => isset($persons[$k]) && $k !== $a && $k !== $b)));
        if (!($a && $b) && !$kids) { continue; }
        $families[] = ['a' => $a, 'b' => $b, 'children' => $kids, 'date' => ip_txt($f['date'] ?? '', 120), 'place' => ip_txt($f['place'] ?? '', 200)];
    }
    return [$persons, $families];
}

/** Étape 2 : pour chaque ligne, les fiches de la base qui pourraient être la même personne. */
function people_table_check(PDO $pdo, array $d): array
{
    [$persons, $families] = ip_people_plan($d);
    $index = ip_people_index($pdo, array_unique(array_map(static fn($p) => ip_fold($p['last']), $persons)));
    $out = [];
    foreach ($persons as $k => $p) {
        $y = ip_year($p['events']['BIRT']['date'] ?? $p['events']['CHR']['date'] ?? '');
        $c = ip_candidates($index, $p['first'], $p['last'], $p['sex'], $y, $y !== null ? 'birth' : 'any');
        if ($c) { $out[$k] = $c; }
    }
    $events = 0; foreach ($persons as $p) { $events += count($p['events']); }
    $couples = count(array_filter($families, static fn($f) => $f['a'] && $f['b']));
    return ['persons' => count($persons), 'families' => count($families), 'couples' => $couples, 'events' => $events, 'candidates' => $out];
}

/** Étape 3 : les fiches, leurs événements et les familles ; same : {k: id} pour « c'est la même personne » (rien n'est créé pour elle). */
function people_table_import(PDO $pdo, array $d): array
{
    [$persons, $families] = ip_people_plan($d);
    $same = is_array($d['same'] ?? null) ? $d['same'] : [];
    $label = ip_txt($d['label'] ?? '', 120) ?: 'tableau';
    $before = import_receipt_begin($pdo);
    $map = []; $created = 0; $linked = 0; $events = 0; $fams = 0; $skipped = [];
    foreach ($persons as $k => $p) {
        $sid = safe_int($same[$k] ?? 0);
        if ($sid && person_exists($pdo, $sid)) { $map[$k] = $sid; $linked++; continue; }
        $row = save_person($pdo, ['first_name' => $p['first'], 'last_name' => $p['last'], 'gender' => $p['sex'], 'occupation' => $p['occupation']]);
        $map[$k] = (int) $row['id']; $created++;
        foreach ($p['events'] as $tag => $e) {
            if (!($type = ip_event_type($pdo, $tag))) { continue; }
            add_event($pdo, ['person_id' => $map[$k], 'event_type_id' => $type, 'date_text' => $e['date'], 'place_name' => $e['place']]); $events++;
        }
        if ($p['note'] !== '') { $pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body, created_at, updated_at) VALUES('person', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")->execute([$map[$k], 'Note du tableau', $p['note']]); }
    }
    foreach ($families as $f) {
        $a = $f['a'] ? $map[$f['a']] : 0; $b = $f['b'] ? $map[$f['b']] : 0;
        if ($a && $b) {
            $fid = couple_family_id($pdo, $a, $b);
            if (!$fid) { $pdo->prepare('INSERT INTO families(partner1_id, partner2_id) VALUES(?,?)')->execute([$a, $b]); $fid = (int) $pdo->lastInsertId(); $fams++; }
            if (($f['date'] !== '' || $f['place'] !== '') && ($type = ip_event_type($pdo, 'MARR'))) {
                $has = $pdo->prepare("SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=? AND t.gedcom_tag='MARR' LIMIT 1"); $has->execute([$fid]);
                if (!$has->fetchColumn()) { add_event($pdo, ['event_scope' => 'family', 'family_id' => $fid, 'event_type_id' => $type, 'date_text' => $f['date'], 'place_name' => $f['place']]); $events++; }
            }
            foreach ($f['children'] as $ck) {
                $c = $map[$ck];
                $cur = child_parent_ids($pdo, $c);
                if ($cur && array_diff($cur, [$a, $b])) { $skipped[] = 'la fiche n°' . $c . ' a déjà d’autres parents : lien vers ses parents du tableau non fait'; continue; }
                ensure_child_link($pdo, $fid, $c);
            }
        } else {
            $parent = $a ?: $b;
            foreach ($f['children'] as $ck) {
                $c = $map[$ck]; $cur = child_parent_ids($pdo, $c);
                if (count($cur) >= 2 && !in_array($parent, $cur, true)) { $skipped[] = 'la fiche n°' . $c . ' a déjà deux parents : lien non fait'; continue; }
                add_parent_child($pdo, $parent, $c);
            }
        }
    }
    if (function_exists('gedimport_rebuild_search')) { gedimport_rebuild_search($pdo); }
    $undo = import_receipt_save($pdo, 'tree', $before, ['label' => $label]);
    log_change($pdo, 'meta', 0, 'create', 'Tableau « ' . $label . ' » importé : ' . ip_plural($created, 'fiche créée', 'fiches créées') . ', ' . ip_plural($fams, 'famille', 'familles'));
    return ['created' => $created, 'linked' => $linked, 'events' => $events, 'families' => $fams, 'skipped' => array_slice($skipped, 0, 50), 'undo' => $undo];
}

// ─── 3. Sources ↔ RIS et BibTeX ────────────────────────────────────────────────────────────────────────────

const IP_SOURCE_RIS = ['internet' => 'ELEC', 'book' => 'BOOK', 'archive' => 'MANSCPT', 'testimony' => 'PCOMM', 'other' => 'GEN'];
const IP_SOURCE_BIB = ['internet' => 'online', 'book' => 'book', 'archive' => 'unpublished', 'testimony' => 'misc', 'other' => 'misc'];

/** Les auteurs d'une source (« Jean Dupont ; Marie Durand », « Archives de la Corrèze ») → liste. */
function ip_authors(string $a): array
{
    return array_values(array_filter(array_map('trim', preg_split('/\s*;\s*|\s+et\s+(?=[A-ZÀ-Ý])/u', $a) ?: [])));
}

function ip_bib_escape(string $v, bool $url = false): string
{
    $v = str_replace(['{', '}'], '', preg_replace('/[\x00-\x1F]+/u', ' ', $v) ?? '');
    return $url ? $v : preg_replace('/([&%#_$])/', '\\\\$1', $v) ?? $v;
}

/** Toutes les sources de l'app en RIS ou en BibTeX (UTF-8 : les accents restent des accents). */
function sources_export_text(PDO $pdo, string $format): array
{
    $rows = $pdo->query('SELECT * FROM sources ORDER BY id')->fetchAll();
    if (!$rows) { throw new LcndaBadInput('Aucune source à exporter.'); }
    $out = []; $used = [];
    foreach ($rows as $s) {
        $type = in_array($s['source_type'] ?? '', array_keys(IP_SOURCE_RIS), true) ? $s['source_type'] : 'other';
        $title = (string) $s['title']; $pub = trim((string) $s['publication']);
        $year = preg_match('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', $pub, $m) ? $m[1] : '';
        $authors = ip_authors((string) $s['author']);
        if ($format === 'ris') {
            $L = [['TY', IP_SOURCE_RIS[$type]], ['TI', $title]];
            foreach ($authors as $a) { $L[] = ['AU', $a]; }
            foreach ([['PY', $year], ['DA', $pub], ['PB', (string) $s['agency']], ['UR', (string) $s['url']], ['CN', (string) ($s['archive_cote'] ?? '')], ['N1', (string) $s['text']], ['ID', 'lcnda-source-' . $s['id']]] as [$k, $v]) {
                if (trim($v) !== '') { $L[] = [$k, $v]; }
            }
            $L[] = ['ER', ''];
            $out[] = implode("\r\n", array_map(static fn($x) => $x[0] . '  - ' . str_replace(["\r\n", "\r", "\n"], ' ', $x[1]), $L));
        } else {
            $words = preg_split('/\s+/u', trim($authors[0] ?? $title)) ?: ['source'];
            $key = (strtolower(preg_replace('/[^A-Za-z0-9]/', '', ascii_fold((string) end($words))) ?? '') ?: 'source') . $year;
            $base = $key; for ($i = 0; isset($used[$key]); $i++) { $key = $base . ($i < 26 ? chr(97 + $i) : $i); } $used[$key] = true;
            $f = ['title' => $title, 'author' => implode(' and ', array_map(static fn($a) => count(preg_split('/\s+/', $a)) > 3 ? '{' . $a . '}' : $a, $authors)),
                'publisher' => (string) $s['agency'], 'year' => $year, 'date' => $pub !== $year ? $pub : '', 'url' => (string) $s['url'], 'callnumber' => (string) ($s['archive_cote'] ?? ''), 'note' => (string) $s['text'],
                'sourcetype' => in_array($type, ['testimony', 'other', 'archive'], true) ? $type : ''];
            $lines = [];
            foreach ($f as $k => $v) { if (trim($v) !== '') { $lines[] = '  ' . $k . ' = {' . ($k === 'author' ? (preg_replace('/([&%#_$])/', '\\\\$1', $v) ?? $v) : ip_bib_escape($v, $k === 'url')) . '}'; } }
            $out[] = '@' . IP_SOURCE_BIB[$type] . '{' . $key . ",\n" . implode(",\n", $lines) . "\n}";
        }
    }
    return ['text' => implode($format === 'ris' ? "\r\n\r\n" : "\n\n", $out) . ($format === 'ris' ? "\r\n" : "\n"), 'count' => count($rows)];
}

function sources_export(PDO $pdo): never
{
    $format = ($_GET['format'] ?? '') === 'bib' ? 'bib' : 'ris';
    $r = sources_export_text($pdo, $format);
    echanges_send('sources-' . date('Ymd-His') . '.' . $format, $format === 'ris' ? 'application/x-research-info-systems; charset=utf-8' : 'application/x-bibtex; charset=utf-8', $r['text'], ['X-LCNDA-Count' => (string) $r['count']]);
}

/** Texte RIS / BibTeX → lignes de la table sources (lu par les fonctions de l'Atelier de recherche). */
function ip_refs_to_sources(string $text): array
{
    if (strlen($text) > IP_MAX_BIB_BYTES) { throw new LcndaBadInput('Fichier trop gros (20 Mo au plus).'); }
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
    if (!mb_check_encoding($text, 'UTF-8')) { $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1252'); }
    if (preg_match('/^\s*TY\s{2}-/m', $text)) { $format = 'RIS'; $refs = atelier_parse_ris($text); }
    elseif (preg_match('/@\w+\s*[{(]/', $text)) { $format = 'BibTeX'; $refs = atelier_parse_bibtex($text); }
    else { throw new LcndaBadInput('Ce fichier n’est ni du RIS (.ris) ni du BibTeX (.bib).'); }
    if (count($refs) > IP_MAX_REFS) { throw new LcndaBadInput('Trop de références d’un coup (' . IP_MAX_REFS . ' au plus).'); }
    $rows = [];
    foreach ($refs as $r) {
        $raw = strtoupper((string) ($r['_ty'] ?? '')); $st = strtolower((string) ($r['_st'] ?? ''));
        $type = in_array($st, ['testimony', 'other', 'archive', 'internet', 'book'], true) ? $st
            : ($raw === 'PCOMM' ? 'testimony' : (in_array(strtolower((string) ($r['_bt'] ?? '')), ['unpublished', 'manuscript'], true) ? 'archive' : match ($r['kind'] ?? 'autre') { 'livre', 'chapitre', 'these', 'article', 'presse' => 'book', 'archive' => 'archive', 'web' => 'internet', default => 'other' }));
        $authors = [];
        foreach ($r['creators'] ?? [] as $c) { if (in_array($c['role'] ?? 'auteur', ['auteur', 'dir'], true)) { $authors[] = trim(($c['first'] ?? '') . ' ' . ($c['last'] ?? '')); } }
        $agency = (string) (($r['publisher'] ?? '') ?: ($r['archive'] ?? '') ?: ($r['container'] ?? ''));
        $text2 = trim(implode("\n", array_filter([(string) ($r['notes'] ?? ''), (string) ($r['abstract'] ?? '')])));
        $row = ['source_type' => $type, 'title' => ip_txt($r['title'] ?? '', 500) ?: 'Sans titre', 'author' => ip_txt(implode(' ; ', array_filter($authors)), 500), 'agency' => ip_txt($agency, 500),
            'publication' => ip_txt(($r['date'] ?? '') ?: ($r['year'] ?? ''), 200), 'url' => preg_match('#^https?://#i', (string) ($r['url'] ?? '')) ? ip_txt($r['url'], 2000) : '',
            'text' => mb_substr(ip_is_formula($text2) ? '' : $text2, 0, 20000), 'archive_cote' => ip_txt($r['call_number'] ?? '', 200)];
        if (ip_txt($r['title'] ?? '', 500) === '' && $row['author'] === '') { continue; } // ni titre ni auteur (ou seulement des formules) : rien à garder
        $rows[] = $row;
    }
    return [$format, $rows];
}

function ip_source_key(array $r): string { return ip_fold($r['title']) . '|' . ip_fold($r['author']); }

/** Étape 2 (mode check) ou 3 (mode run) : références → sources ; une source déjà là (même titre, même auteur) n'est pas reprise. */
function sources_refs_import(PDO $pdo, array $d): array
{
    [$format, $rows] = ip_refs_to_sources((string) ($d['text'] ?? ''));
    if (!$rows) { throw new LcndaBadInput('Aucune référence reconnue dans ce fichier.'); }
    $have = [];
    foreach ($pdo->query('SELECT title, author FROM sources') as $s) { $have[ip_source_key(['title' => (string) $s['title'], 'author' => (string) $s['author']])] = true; }
    $new = []; $dupes = 0;
    foreach ($rows as $r) { $k = ip_source_key($r); if (isset($have[$k])) { $dupes++; continue; } $have[$k] = true; $new[] = $r; }
    if (($d['mode'] ?? 'check') !== 'run') {
        $labels = ['internet' => 'Site internet', 'book' => 'Livre', 'archive' => 'Archive', 'testimony' => 'Témoignage', 'other' => 'Autre'];
        return ['format' => $format, 'count' => count($rows), 'new' => count($new), 'dupes' => $dupes, 'preview' => array_map(static fn($r) => ['title' => $r['title'], 'author' => $r['author'], 'type' => $labels[$r['source_type']], 'publication' => $r['publication']], array_slice($new, 0, 40))];
    }
    $before = import_receipt_begin($pdo);
    $ins = $pdo->prepare('INSERT INTO sources(source_type, title, author, agency, publication, url, text, archive_cote) VALUES(?,?,?,?,?,?,?,?)');
    foreach ($new as $r) { $ins->execute([$r['source_type'], $r['title'], $r['author'], $r['agency'], $r['publication'], $r['url'], $r['text'], $r['archive_cote']]); }
    $undo = $new ? import_receipt_save($pdo, 'tree', $before, ['label' => 'références ' . $format]) : '';
    if ($new) { log_change($pdo, 'meta', 0, 'create', 'Références ' . $format . ' importées : ' . ip_plural(count($new), 'source', 'sources')); }
    return ['format' => $format, 'count' => count($new), 'dupes' => $dupes, 'undo' => $undo];
}

// ─── 4. Lieux depuis KML / GeoJSON ─────────────────────────────────────────────────────────────────────────

/** Fichier KML ou GeoJSON → points {name, county, state, country, lat, lon, hint} (doublons retirés : un même lieu rangé dans plusieurs dossiers). */
function ip_geo_parse(string $text): array
{
    if (strlen($text) > IP_MAX_GEO_BYTES) { throw new LcndaBadInput('Fichier trop gros (20 Mo au plus).'); }
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
    $t = ltrim($text);
    $points = []; $ignored = 0; $invalid = 0;
    $add = static function (array $p) use (&$points, &$invalid): void {
        $lat = $p['lat']; $lon = $p['lon'];
        if (!is_finite($lat) || !is_finite($lon) || abs($lat) > 90 || abs($lon) > 180 || ($lat == 0.0 && $lon == 0.0)) { $invalid++; return; }
        $p['name'] = ip_txt($p['name'], 200); if ($p['name'] === '') { $invalid++; return; }
        foreach (['county', 'state', 'country'] as $k) { $p[$k] = ip_txt($p[$k] ?? '', 120); }
        $key = ip_fold($p['name']) . '|' . round($lat, 5) . '|' . round($lon, 5);
        if (isset($points[$key])) { return; }
        if (count($points) >= IP_MAX_GEO_POINTS) { throw new LcndaBadInput('Trop de lieux d’un coup (' . IP_MAX_GEO_POINTS . ' au plus).'); }
        $points[$key] = $p;
    };
    if ($t !== '' && ($t[0] === '{' || $t[0] === '[')) {
        $format = 'GeoJSON';
        try { $j = json_decode($t, true, 64, JSON_THROW_ON_ERROR); } catch (JsonException) { throw new LcndaBadInput('Fichier GeoJSON abîmé : il ne peut pas être lu.'); }
        $features = match (true) { ($j['type'] ?? '') === 'FeatureCollection' => is_array($j['features'] ?? null) ? $j['features'] : [], ($j['type'] ?? '') === 'Feature' => [$j], array_is_list((array) $j) => (array) $j, default => [] };
        if (!$features) { throw new LcndaBadInput('Aucun point dans ce GeoJSON.'); }
        foreach ($features as $f) {
            if (!is_array($f)) { $ignored++; continue; }
            $g = $f['geometry'] ?? null; $pr = is_array($f['properties'] ?? null) ? $f['properties'] : [];
            if (!is_array($g) || ($g['type'] ?? '') !== 'Point' || !is_array($g['coordinates'] ?? null) || count($g['coordinates']) < 2) { $ignored++; continue; }
            $pick = static function (array $keys) use ($pr): string { foreach ($keys as $k) { foreach ($pr as $pk => $v) { if (is_scalar($v) && strcasecmp((string) $pk, $k) === 0 && trim((string) $v) !== '') { return (string) $v; } } } return ''; };
            $add(['name' => $pick(['name', 'nom', 'title', 'titre', 'label', 'commune', 'ville']), 'county' => $pick(['county', 'departement', 'département', 'dept', 'department', 'dep']), 'state' => $pick(['region', 'région', 'state']),
                'country' => $pick(['country', 'pays']), 'lat' => (float) $g['coordinates'][1], 'lon' => (float) $g['coordinates'][0], 'hint' => preg_match('/^P(\d+)$/', (string) ($f['id'] ?? ''), $m) ? (int) $m[1] : 0]);
        }
    } elseif ($t !== '' && $t[0] === '<') {
        $format = 'KML';
        if (preg_match('/<!DOCTYPE|<!ENTITY/i', $t)) { throw new LcndaBadInput('Fichier refusé : il contient des déclarations XML (DOCTYPE ou ENTITY) qu’un fichier KML n’utilise pas.'); }
        $doc = new DOMDocument();
        if (!@$doc->loadXML($t, LIBXML_NONET | LIBXML_COMPACT)) { throw new LcndaBadInput('Fichier KML abîmé : il ne peut pas être lu.'); }
        if (strtolower($doc->documentElement?->localName ?? '') !== 'kml') { throw new LcndaBadInput('Ce fichier XML n’est pas un KML (Google Earth).'); }
        foreach ($doc->getElementsByTagNameNS('*', 'Placemark') as $pm) {
            $child = static function (DOMElement $el, string $name): ?DOMElement { foreach ($el->childNodes as $c) { if ($c instanceof DOMElement && $c->localName === $name) { return $c; } } return null; };
            $coords = null;
            foreach ($pm->getElementsByTagNameNS('*', 'Point') as $pt) { $c = $child($pt, 'coordinates'); if ($c) { $coords = trim($c->textContent); break; } }
            if ($coords === null) { $ignored++; continue; }
            $xy = array_map('trim', explode(',', preg_split('/\s+/', $coords)[0] ?? ''));
            if (count($xy) < 2 || !is_numeric($xy[0]) || !is_numeric($xy[1])) { $invalid++; continue; }
            $name = trim((string) $child($pm, 'name')?->textContent);
            $ext = [];
            foreach ($pm->getElementsByTagNameNS('*', 'Data') as $dd) { $v = $child($dd, 'value'); $ext[ip_fold($dd->getAttribute('name'))] = trim((string) $v?->textContent); }
            foreach ($pm->getElementsByTagNameNS('*', 'SimpleData') as $sd) { $ext[ip_fold($sd->getAttribute('name'))] = trim($sd->textContent); }
            $p = ['name' => $name ?: ($ext['name'] ?? $ext['nom'] ?? ''), 'county' => $ext['county'] ?? $ext['departement'] ?? $ext['dept'] ?? '', 'state' => $ext['region'] ?? $ext['state'] ?? '', 'country' => $ext['country'] ?? $ext['pays'] ?? '',
                'lat' => (float) $xy[1], 'lon' => (float) $xy[0], 'hint' => 0];
            // description de lib/echanges.php : 1re ligne « Commune, Département, Région, Pays »
            $desc = trim((string) $child($pm, 'description')?->textContent);
            if ($desc !== '' && $p['county'] === '' && $p['state'] === '' && $p['country'] === '') {
                $parts = array_map('trim', explode(',', strtok($desc, "\n") ?: ''));
                $at = array_search(ip_fold($p['name']), array_map('ip_fold', $parts), true);
                if ($at !== false) {
                    $after = array_slice($parts, $at + 1);
                    if (count($after) >= 3) { [$p['county'], $p['state'], $p['country']] = array_slice($after, -3); }
                    elseif (count($after) === 2) { [$p['county'], $p['country']] = $after; }
                    elseif (count($after) === 1) { $p['country'] = $after[0]; }
                }
            }
            $add($p);
        }
    } else {
        throw new LcndaBadInput('Ce fichier n’est ni un KML (Google Earth) ni un GeoJSON.');
    }
    if (!$points) { throw new LcndaBadInput('Aucun lieu avec des coordonnées dans ce fichier.'); }
    return ['format' => $format, 'points' => array_values($points), 'ignored' => $ignored, 'invalid' => $invalid];
}

function ip_km(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $r = M_PI / 180; $a = sin(($lat2 - $lat1) * $r / 2) ** 2 + cos($lat1 * $r) * cos($lat2 * $r) * sin(($lon2 - $lon1) * $r / 2) ** 2;
    return 12742 * asin(min(1, sqrt($a)));
}

/**
 * Étape 2 : chaque point du fichier rapproché des lieux de la base (même nom ; le département et le pays départagent) :
 * same (déjà ces coordonnées), add (le lieu n'a pas de coordonnées : à compléter), differ (autres coordonnées : à remplacer
 * si tu le coches), choose (plusieurs lieux de ce nom : à choisir), create (pas dans la base : à créer).
 */
function places_geo_analyse(PDO $pdo, array $d): array
{
    $parsed = ip_geo_parse((string) ($d['text'] ?? ''));
    $want = [];
    foreach ($parsed['points'] as $p) { $want[ip_fold($p['name'])] = true; }
    $byName = [];
    foreach ($pdo->query('SELECT id, name, subdivision, county, state, country, latitude, longitude FROM places') as $pl) {
        foreach (array_unique([ip_fold((string) $pl['name']), ip_fold((string) $pl['subdivision'])]) as $f) { if ($f !== '' && isset($want[$f])) { $byName[$f][] = $pl; } }
    }
    $used = [];
    foreach ($pdo->query('SELECT DISTINCT place_id FROM events WHERE place_id IS NOT NULL') as $u) { $used[(int) $u['place_id']] = true; }
    $out = []; $counts = ['same' => 0, 'add' => 0, 'differ' => 0, 'choose' => 0, 'create' => 0];
    foreach ($parsed['points'] as $i => $p) {
        $cands = $byName[ip_fold($p['name'])] ?? [];
        $narrow = static function (array $list, string $key, string $val): array { if ($val === '') { return $list; } $f = ip_fold($val); $ok = array_values(array_filter($list, static fn($c) => ip_fold((string) $c[$key]) === $f)); return $ok ?: $list; };
        if ($p['hint'] && ($h = array_values(array_filter($cands, static fn($c) => (int) $c['id'] === $p['hint'])))) { $cands = $h; }
        $cands = $narrow($narrow($narrow($cands, 'county', $p['county']), 'country', $p['country']), 'state', $p['state']);
        // plusieurs lieux du même nom : ceux de ta généalogie (cités par un événement) d'abord
        if (count($cands) > 1) { $inTree = array_values(array_filter($cands, static fn($c) => isset($used[(int) $c['id']]))); if ($inTree) { $cands = $inTree; } }
        $row = ['i' => $i] + $p + ['candidates' => array_map(static fn($c) => ['id' => (int) $c['id'], 'title' => place_label($c), 'lat' => $c['latitude'] !== null ? (float) $c['latitude'] : null, 'lon' => $c['longitude'] !== null ? (float) $c['longitude'] : null,
            'km' => $c['latitude'] !== null && $c['longitude'] !== null ? round(ip_km((float) $c['latitude'], (float) $c['longitude'], $p['lat'], $p['lon']), 2) : null], array_slice($cands, 0, 8))];
        if (!$cands) { $row['kind'] = 'create'; }
        elseif (count($cands) > 1) {
            // plusieurs lieux de ce nom : celui qui a déjà ces coordonnées (à 200 m près) est le bon
            $near = array_values(array_filter($row['candidates'], static fn($c) => $c['km'] !== null && $c['km'] < 0.2));
            if (count($near) === 1) { $row['kind'] = 'same'; $row['place_id'] = $near[0]['id']; } else { $row['kind'] = 'choose'; }
        } else {
            $c = $row['candidates'][0]; $row['place_id'] = $c['id'];
            $row['kind'] = $c['km'] === null ? 'add' : ($c['km'] < 0.2 ? 'same' : 'differ');
        }
        $counts[$row['kind']]++;
        $out[] = $row;
    }
    return ['format' => $parsed['format'], 'points' => $out, 'counts' => $counts, 'ignored' => $parsed['ignored'], 'invalid' => $parsed['invalid']];
}

/** Étape 3 : les lignes cochées ; update = coordonnées d'un lieu de la base, create = nouveau lieu. */
function places_geo_apply(PDO $pdo, array $d): array
{
    $items = is_array($d['items'] ?? null) ? $d['items'] : [];
    if (count($items) > IP_MAX_GEO_POINTS) { throw new LcndaBadInput('Trop de lieux d’un coup.'); }
    $before = []; $created = []; $updated = 0;
    $get = $pdo->prepare('SELECT id, latitude, longitude FROM places WHERE id=?');
    $upd = $pdo->prepare('UPDATE places SET latitude=?, longitude=? WHERE id=?');
    $ins = $pdo->prepare('INSERT INTO places(name, county, state, country, latitude, longitude) VALUES(?,?,?,?,?,?)');
    foreach ($items as $it) {
        if (!is_array($it)) { continue; }
        $lat = (float) ($it['lat'] ?? 0); $lon = (float) ($it['lon'] ?? 0);
        if (!is_finite($lat) || !is_finite($lon) || abs($lat) > 90 || abs($lon) > 180) { continue; }
        $lat = round($lat, 7); $lon = round($lon, 7);
        if (($it['action'] ?? '') === 'update') {
            $id = safe_int($it['place_id'] ?? 0); $get->execute([$id]); $old = $get->fetch();
            if (!$old || isset($before[$id])) { continue; }
            $before[$id] = [$id, $old['latitude'] !== null ? (float) $old['latitude'] : null, $old['longitude'] !== null ? (float) $old['longitude'] : null];
            $upd->execute([$lat, $lon, $id]); $updated++;
        } elseif (($it['action'] ?? '') === 'create') {
            $name = ip_txt($it['name'] ?? '', 200); if ($name === '') { continue; }
            $ins->execute([$name, ip_txt($it['county'] ?? '', 120), ip_txt($it['state'] ?? '', 120), ip_txt($it['country'] ?? '', 120), $lat, $lon]);
            $created[] = (int) $pdo->lastInsertId();
        }
    }
    if (!$updated && !$created) { throw new LcndaBadInput('Aucune ligne cochée : rien à faire.'); }
    $undo = import_receipt_put('geo', ['before' => array_values($before), 'created' => $created]);
    log_change($pdo, 'meta', 0, 'update', 'Coordonnées des lieux importées : ' . ip_plural($updated, 'lieu complété', 'lieux complétés') . ', ' . ip_plural(count($created), 'lieu créé', 'lieux créés'));
    return ['updated' => $updated, 'created' => count($created), 'undo' => $undo];
}

function places_geo_undo(PDO $pdo, array $d): array
{
    $token = (string) ($d['token'] ?? '');
    $r = import_receipt_load($token, 'geo');
    $upd = $pdo->prepare('UPDATE places SET latitude=?, longitude=? WHERE id=?');
    foreach ($r['before'] ?? [] as $b) { if (is_array($b) && count($b) === 3) { $upd->execute([$b[1], $b[2], (int) $b[0]]); } }
    $del = $pdo->prepare('DELETE FROM places WHERE id=? AND id NOT IN (SELECT place_id FROM events WHERE place_id IS NOT NULL)');
    $n = 0; foreach ($r['created'] ?? [] as $id) { $del->execute([(int) $id]); $n += $del->rowCount(); }
    @unlink(import_receipt_dir() . '/' . $token . '.json');
    log_change($pdo, 'meta', 0, 'update', 'Import des coordonnées des lieux annulé');
    return ['restored' => count($r['before'] ?? []), 'removed' => $n];
}
