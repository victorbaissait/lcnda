<?php
declare(strict_types=1);

/**
 * Import d'un fichier Hérédis natif (Hérédis 2019 et suivants, Mac et PC).
 *
 * Un fichier Hérédis est une base SQLite (« Nom.heredis »), rangée sur Mac dans un dossier « Nom.hmw » avec ses
 * médias (« Media/#<n°>/fichier ») et des sauvegardes (.bak, .bm27…). On l'ouvre en LECTURE SEULE (immutable :
 * rien n'est écrit ni créé à côté de l'original). Les codes des types d'événements viennent des libellés
 * d'Hérédis (HNLOC_EVENT_TYPE_<n>). Ce qui n'a pas d'équivalent exact est gardé sous un libellé lisible.
 */

/** Types d'événements Hérédis : code => [portée, balise GEDCOM (ou ''), libellé]. */
function heredis_event_types(): array
{
    $p = 'person'; $f = 'family';
    return [
        0 => [$p, 'BAPL', ''], 1 => [$p, '', 'Autre baptême'], 2 => [$p, 'BARM', ''], 3 => [$p, 'BASM', ''],
        4 => [$p, 'BIRT', ''], 5 => [$p, 'BLES', ''], 6 => [$p, 'BURI', ''], 7 => [$p, 'CENS', ''], 8 => [$p, 'BAPM', ''],
        9 => [$p, '', 'Baptême adulte'], 10 => [$p, 'CONF', ''], 11 => [$p, 'CONL', ''], 12 => [$p, 'DEAT', ''],
        13 => [$p, 'EMIG', ''], 14 => [$p, 'ENDL', ''], 15 => [$p, '', 'Événement'], 16 => [$p, 'GRAD', ''],
        17 => [$p, 'IMMI', ''], 18 => [$p, 'NATU', ''], 19 => [$p, 'ORDN', ''], 20 => [$p, 'PROB', ''],
        21 => [$p, 'RETI', ''], 22 => [$p, 'SLGC', ''], 23 => [$p, 'OCCU', ''], 24 => [$p, '', 'Acquisition'],
        25 => [$p, '', 'Décoration'], 26 => [$p, '', 'En vie'], 27 => [$p, '', 'Service militaire'],
        28 => [$p, '', 'Vente d’un bien'], 29 => [$p, '', 'Voyage'], 30 => [$p, '', 'Domicile'], 31 => [$p, 'WILL', ''],
        32 => [$p, 'FCOM', ''], 33 => [$p, 'TITL', ''], 34 => [$p, 'ADOP', ''], 35 => [$p, 'CREM', ''],
        36 => [$p, '', 'Emploi'], 38 => [$p, '', 'Événement après décès'], 39 => [$p, '', 'Réunion de famille'],
        40 => [$p, '', 'Acte notarié'], 41 => [$p, '', 'Succession'],
        54 => [$f, 'DIV', ''], 55 => [$f, 'DIVF', ''], 56 => [$f, 'ENGA', ''], 57 => [$f, '', 'Événement du couple'],
        58 => [$f, 'MARB', ''], 59 => [$f, 'MARC', ''], 60 => [$f, '', 'Certificat de publication des bans'],
        61 => [$f, 'MARR', ''], 62 => [$f, '', 'Constitution de rente entre époux'], 63 => [$f, 'SLGS', ''],
        64 => [$f, '', 'Domicile du couple'], 65 => [$f, '', 'Séparation'], 66 => [$f, '', 'Adoption'],
        67 => [$f, 'ANUL', ''], 68 => [$f, '', 'Mariage religieux'], 69 => [$f, '', 'Autre union officielle'],
        70 => [$f, '', 'Acte notarié'],
        86 => [$p, 'CAST', ''], 87 => [$p, 'DSCR', ''], 88 => [$p, 'EDUC', ''], 89 => [$p, '', 'Santé'],
        90 => [$p, 'IDNO', ''], 91 => [$p, '', 'Nom religieux'], 92 => [$p, 'NATI', ''],
        93 => [$p, '', 'Référence extérieure'], 94 => [$p, '', 'Lieu d’origine'], 95 => [$p, 'PROP', ''],
        96 => [$p, 'RELI', ''], 97 => [$p, 'RESI', ''], 98 => [$p, 'SSN', ''], 99 => [$p, '', 'Rubrique générique'],
    ];
}

/** Trouve la base d'un fichier Hérédis : le fichier .heredis lui-même, ou celui rangé dans un dossier .hmw. */
function heredis_locate(string $path): array
{
    if (is_file($path)) { return [$path, dirname($path)]; }
    if (!is_dir($path)) { throw new RuntimeException('Fichier Hérédis introuvable.'); }
    $candidates = heredis_list_dir(rtrim($path, '/\\'), 'heredis');
    if (!$candidates) { throw new RuntimeException('Aucun fichier .heredis dans ce dossier Hérédis.'); }
    usort($candidates, static fn($a, $b) => filemtime($b) <=> filemtime($a));
    return [$candidates[0], $path];
}

/** Vrai si ce dossier (ou ce fichier) est un fichier Hérédis. */
/** Fichiers d'un dossier (sans glob : un nom de dossier avec [ ] * ? casserait le motif), filtrés par extension. */
function heredis_list_dir(string $dir, string $ext = ''): array
{
    $out = [];
    foreach (@scandir($dir) ?: [] as $f) {
        if ($f === '.' || $f === '..' || !is_file($dir . '/' . $f)) { continue; }
        if ($ext === '' || strtolower(pathinfo($f, PATHINFO_EXTENSION)) === $ext) { $out[] = $dir . '/' . $f; }
    }
    sort($out);
    return $out;
}

function is_heredis_path(string $path): bool
{
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if (is_dir($path)) { return $ext === 'hmw' || (bool) heredis_list_dir(rtrim($path, '/\\'), 'heredis'); }
    return $ext === 'heredis';
}

function heredis_import_into_db(PDO $pdo, string $path): array
{
    [$dbFile, $packageDir] = heredis_locate($path);
    try {
        $src = new PDO('sqlite:file:' . rawurlencode($dbFile) . '?mode=ro&immutable=1', null, null,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $tables = $src->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    } catch (Throwable) {
        throw new RuntimeException('Ce fichier n’est pas un fichier Hérédis lisible (Hérédis 2019 ou plus récent).');
    }
    foreach (['Individus', 'Unions', 'Evenements', 'Lieux', 'Notes'] as $t) {
        if (!in_array($t, $tables, true)) { throw new RuntimeException('Fichier Hérédis non reconnu (table « ' . $t . ' » absente). Les fichiers Hérédis antérieurs à 2019 doivent être exportés en GEDCOM.'); }
    }
    $has = static fn(string $t): bool => in_array($t, $tables, true);
    $rows = static fn(string $sql): array => $src->query($sql)->fetchAll();
    $txt = static fn($v): string => trim((string) ($v ?? ''));

    $stats = ['format' => 'heredis', 'persons' => 0, 'families' => 0, 'events' => 0, 'notes' => 0, 'sources' => 0,
        'citations' => 0, 'media' => 0, 'media_missing' => 0, 'tasks' => 0, 'labels' => 0, 'witnesses' => 0];

    // Notes : texte simple (sinon RTF converti)
    $notes = [];
    foreach ($rows('SELECT CodeID, Note, NoteRTF FROM Notes') as $n) {
        $body = $txt($n['Note']);
        if ($body === '' && $txt($n['NoteRTF']) !== '') { $body = gedcom_rtf_to_text((string) $n['NoteRTF']); }
        $notes[(int) $n['CodeID']] = $body;
    }
    $note = static fn($id): string => $id ? ($notes[(int) $id] ?? '') : '';
    $insertNote = $pdo->prepare('INSERT INTO notes(entity_type,entity_id,title,body) VALUES(?,?,?,?)');
    $addNote = static function (string $type, int $id, string $body, string $title = '') use ($insertNote, &$stats): void {
        if (trim($body) === '') { return; }
        $insertNote->execute([$type, $id, $title, $body]);
        $stats['notes']++;
    };

    // Lieux (+ subdivisions : un lieu LCNDA par subdivision, comme l'import GEDCOM)
    $places = [];
    foreach ($rows('SELECT * FROM Lieux') as $l) { $places[(int) $l['CodeID']] = $l; }
    $subdivisions = [];
    if ($has('Subdivisions')) { foreach ($rows('SELECT * FROM Subdivisions') as $s) { $subdivisions[(int) $s['CodeID']] = $s; } }
    $placeIds = [];
    $coord = static fn($v): ?float => ($v === null || abs((float) $v) > 1000) ? null : (float) $v;
    $findPlace = $pdo->prepare("SELECT id FROM places WHERE name=? COLLATE NOCASE AND coalesce(county,'')=? AND coalesce(state,'')=? AND coalesce(country,'')=? AND coalesce(subdivision,'')=? LIMIT 1");
    $insertPlace = $pdo->prepare('INSERT INTO places(name,county,state,country,subdivision,latitude,longitude,description) VALUES(?,?,?,?,?,?,?,?)');
    $placeId = static function (?int $lieu, ?int $sub) use (&$placeIds, $places, $subdivisions, $coord, $findPlace, $insertPlace, $pdo, $txt, $note): ?int {
        if (!$lieu || !isset($places[$lieu])) { return null; }
        $key = $lieu . ':' . (int) $sub;
        if (isset($placeIds[$key])) { return $placeIds[$key]; }
        $l = $places[$lieu];
        $s = $sub ? ($subdivisions[$sub] ?? null) : null;
        $name = $txt($l['Ville']) ?: ($txt($l['CodeLieu']) ?: 'Lieu sans nom');
        $parts = [$name, $txt($l['Departement']), $txt($l['Region']), $txt($l['Pays']), $s ? $txt($s['Titre']) : ''];
        $findPlace->execute($parts);
        $id = $findPlace->fetchColumn();
        if (!$id) {
            $lat = $s && $coord($s['Latitude']) !== null ? $coord($s['Latitude']) : $coord($l['Latitude']);
            $lon = $s && $coord($s['Longitude']) !== null ? $coord($s['Longitude']) : $coord($l['Longitude']);
            $insertPlace->execute([...$parts, $lat, $lon, $note($l['XrefNote'] ?? null)]);
            $id = (int) $pdo->lastInsertId();
        }
        return $placeIds[$key] = (int) $id;
    };

    // Personnes
    $groupCache = [];
    $personMap = [];
    $insertPerson = $pdo->prepare('INSERT INTO persons(source_id,unique_id,first_name,last_name,prefix,suffix,gender,living_status,is_private,surname_group_id,reference_number) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    $insertVariant = $pdo->prepare('INSERT INTO name_variants(person_id,type,first_name,last_name,prefix,suffix,source_note,position) VALUES(?,?,?,?,?,?,?,?)');
    $individus = $rows('SELECT * FROM Individus ORDER BY CodeID');
    foreach ($individus as $i) {
        $last = $txt($i['Noms']);
        $gender = match ((int) $i['Sexe']) { 109, 77 => 'male', 102, 70 => 'female', default => 'unknown' }; // codes ASCII « m » / « f »
        $insertPerson->execute([null, 'heredis-' . $i['CodeID'], $txt($i['Prenoms']), $last, $txt($i['Prefixe']), $txt($i['Suffixe']),
            $gender, 'unknown', (int) $i['Confidentiel'], gedimport_group_id($pdo, $groupCache, $last), $txt($i['Numero'])]);
        $pid = (int) $pdo->lastInsertId();
        $personMap[(int) $i['CodeID']] = $pid;
        $stats['persons']++;
        if ($txt($i['Surnom']) !== '') { $insertVariant->execute([$pid, 'nickname', $txt($i['Surnom']), '', '', '', '', 0]); }
        $addNote('person', $pid, $note($i['XrefNote']));
        $addNote('person', $pid, $note($i['XrefNoteRecherche'] ?? null), 'Notes de recherche');
    }
    // Autres noms (nom d'usage, de religion…)
    if ($has('AlternateNames')) {
        $altNames = [];
        if ($has('LiensAlternateNameNom')) {
            foreach ($rows('SELECT l.XrefAlternateName a, n.Nom FROM LiensAlternateNameNom l JOIN Noms n ON n.CodeID=l.XrefNom ORDER BY l.Ordre') as $r) { $altNames[(int) $r['a']][] = $txt($r['Nom']); }
        }
        $position = 1;
        foreach ($rows('SELECT * FROM AlternateNames') as $a) {
            $pid = $personMap[(int) $a['XrefIndividu']] ?? null;
            if (!$pid) { continue; }
            $insertVariant->execute([$pid, 'variant', $txt($a['Prenoms']), implode(' ', $altNames[(int) $a['CodeID']] ?? []), $txt($a['Prefixe']), $txt($a['Suffixe']), $txt($a['TypeString']), $position++]);
            if ($txt($a['Surnom']) !== '') { $insertVariant->execute([$pid, 'nickname', $txt($a['Surnom']), '', '', '', '', $position++]); }
        }
    }
    // Personne de départ (de cujus)
    if ($has('NumerosSosa')) {
        $deCujus = (int) ($src->query('SELECT XrefDeCujus FROM NumerosSosa LIMIT 1')->fetchColumn() ?: 0);
        if (isset($personMap[$deCujus])) { $pdo->prepare('UPDATE persons SET is_start=CASE WHEN id=? THEN 1 ELSE 0 END')->execute([$personMap[$deCujus]]); }
    }

    // Unions et enfants
    $familyMap = [];
    $insertFamily = $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)');
    foreach ($rows('SELECT * FROM Unions ORDER BY CodeID') as $u) {
        $insertFamily->execute([$personMap[(int) $u['XrefEpoux']] ?? null, $personMap[(int) $u['XrefEpouse']] ?? null]);
        $fid = (int) $pdo->lastInsertId();
        $familyMap[(int) $u['CodeID']] = $fid;
        $stats['families']++;
        $addNote('family', $fid, $note($u['XrefNote']));
    }
    $order = [];
    if ($has('OrdreEnfants')) { foreach ($rows('SELECT XrefIndividu, Ordre FROM OrdreEnfants') as $o) { $order[(int) $o['XrefIndividu']] = (float) $o['Ordre']; } }
    $relation = static fn($v): string => match ((int) $v) { 1 => 'adopted', default => 'biological' };
    $insertChild = $pdo->prepare('INSERT INTO family_children(family_id,child_id,relation_to_partner1,relation_to_partner2,position) VALUES(?,?,?,?,?)');
    $linked = [];
    $parentLinks = $has('LiensIndividuParents') ? $rows('SELECT * FROM LiensIndividuParents') : [];
    $withLink = array_fill_keys(array_map(static fn($l) => (int) $l['XrefIndividu'], $parentLinks), true); // (pas de recherche par personne : trop lent sur 50 000 fiches)
    foreach ($individus as $i) {   // anciennes bases : seul Individus.XrefUnionParents est rempli
        if ($i['XrefUnionParents'] && !isset($withLink[(int) $i['CodeID']])) {
            $parentLinks[] = ['XrefIndividu' => $i['CodeID'], 'XrefUnionParents' => $i['XrefUnionParents'], 'TypePere' => 0, 'TypeMere' => 0];
        }
    }
    foreach ($parentLinks as $l) {
        $fid = $familyMap[(int) $l['XrefUnionParents']] ?? null;
        $cid = $personMap[(int) $l['XrefIndividu']] ?? null;
        if (!$fid || !$cid || isset($linked[$fid . ':' . $cid])) { continue; }
        $linked[$fid . ':' . $cid] = true;
        $insertChild->execute([$fid, $cid, $relation($l['TypePere']), $relation($l['TypeMere']), $order[(int) $l['XrefIndividu']] ?? 0]);
    }

    // Événements
    $types = heredis_event_types();
    $typeCache = [];
    $eventMap = [];
    $insertEvent = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id,title,description,cause) VALUES(?,?,?,?,?,?,?,?,?,?)');
    $occupations = [];
    foreach ($rows('SELECT * FROM Evenements ORDER BY CodeID') as $e) {
        $code = (int) $e['EventType'];
        $pid = $e['XrefIndividuProprio'] ? ($personMap[(int) $e['XrefIndividuProprio']] ?? null) : null;
        $fid = $e['XrefUnionProprio'] ? ($familyMap[(int) $e['XrefUnionProprio']] ?? null) : null;
        if (!$pid && !$fid) { continue; }
        $scope = $pid ? 'person' : 'family';
        [, $tag, $label] = $types[$code] ?? [$scope, '', 'Événement Hérédis n°' . $code];
        $title = $txt($e['Titre']);
        if ($tag === '' && in_array($code, [15, 57, 99], true) && $title !== '') { [$label, $title] = [$title, '']; } // type personnalisé
        $typeId = gedcom_event_type_id($pdo, $typeCache, $scope, $tag !== '' ? $tag : 'EVEN', $tag !== '' ? '' : $label);
        $date = gedcom_date_to_text($txt($e['DateGed']));
        $insertEvent->execute([$scope, $pid, $fid, $typeId, $date, gedcom_year($date), $placeId($e['XrefLieu'] ? (int) $e['XrefLieu'] : null, $e['XrefSubdivision'] ? (int) $e['XrefSubdivision'] : null),
            $title, $note($e['XrefNote']), $txt($e['Cause'])]);
        $eventMap[(int) $e['CodeID']] = (int) $pdo->lastInsertId();
        $stats['events']++;
        if ($code === 23 && $pid) { $occupations[$pid][mb_strtolower($title)] = true; }
    }
    // Professions saisies dans la fiche (sans événement) → événement « Profession ». La fiche les affiche avec leurs
    // majuscules (Individus.Profession, séparées par des virgules) ; le dictionnaire les range parfois en minuscules.
    $professionNames = [];
    foreach ($individus as $i) {
        foreach (array_map('trim', explode(',', (string) $i['Profession'])) as $name) { if ($name !== '') { $professionNames[(int) $i['CodeID']][] = $name; } }
    }
    if ($has('LiensProfessionsIndi') && $has('Professions')) {
        foreach ($rows('SELECT l.XrefIndividu i, p.NomProfession n FROM LiensProfessionsIndi l JOIN Professions p ON p.CodeID=l.XrefProfession') as $o) {
            if ($txt($o['n']) !== '') { $professionNames[(int) $o['i']][] = $txt($o['n']); }
        }
    }
    if ($professionNames) {
        $occType = gedcom_event_type_id($pdo, $typeCache, 'person', 'OCCU', '');
        foreach ($professionNames as $code => $names) {
            $pid = $personMap[$code] ?? null;
            foreach ($names as $name) {
                if (!$pid || isset($occupations[$pid][mb_strtolower($name)])) { continue; }
                $insertEvent->execute(['person', $pid, null, $occType, '', null, null, $name, '', '']);
                $occupations[$pid][mb_strtolower($name)] = true;
                $stats['events']++;
            }
        }
    }
    // Titre de noblesse saisi dans la fiche
    foreach ($individus as $i) {
        if ($txt($i['Titre']) === '' || !isset($personMap[(int) $i['CodeID']])) { continue; }
        $insertEvent->execute(['person', $personMap[(int) $i['CodeID']], null, gedcom_event_type_id($pdo, $typeCache, 'person', 'TITL', ''), '', null, null, $txt($i['Titre']), '', '']);
        $stats['events']++;
    }
    // Témoins et autres personnes liées à un événement
    if ($has('LienIndividuEvenement')) {
        $insertWitness = $pdo->prepare('INSERT INTO event_witnesses(event_id,person_id,note,position) VALUES(?,?,?,?)');
        $pos = 0;
        foreach ($rows('SELECT * FROM LienIndividuEvenement ORDER BY CodeID') as $w) {
            $eid = $eventMap[(int) $w['XrefEvenement']] ?? null;
            $pid = $personMap[(int) $w['XrefIndividuOrig']] ?? null;
            if (!$eid || !$pid) { continue; }
            $insertWitness->execute([$eid, $pid, trim(implode(' — ', array_filter([$txt($w['Titre']), $txt($w['Age']) !== '' ? 'âge : ' . $txt($w['Age']) : '', $txt($w['Commentaire'])]))), $pos++]);
            $stats['witnesses']++;
        }
    }
    $pdo->exec("UPDATE persons SET living_status='deceased' WHERE living_status='unknown' AND unique_id LIKE 'heredis-%' AND id IN (SELECT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('DEAT','BURI','CREM'))");

    // Sources, dépôts d'archives et citations
    $sourceMap = [];
    if ($has('Sources')) {
        $repos = [];
        if ($has('Repositories')) { foreach ($rows('SELECT CodeID, Titre FROM Repositories') as $r) { $repos[(int) $r['CodeID']] = $txt($r['Titre']); } }
        $insertSource = $pdo->prepare('INSERT INTO sources(title,author,agency,publication,url,text,source_type) VALUES(?,?,?,?,?,?,?)');
        foreach ($rows('SELECT * FROM Sources') as $s) {
            $agency = $repos[(int) $s['XrefRepository']] ?? '';
            $extra = array_filter(['Document : ' . $txt($s['Document']), 'Cote : ' . $txt($s['Cote']), 'Classement : ' . $txt($s['Archivage']),
                'Numéro : ' . $txt($s['Numero']), 'Date : ' . gedcom_date_to_text($txt($s['DateGED']))], static fn($l) => !str_ends_with($l, ': '));
            $text = trim(implode("\n\n", array_filter([implode("\n", $extra), $note($s['XrefNote']), $note($s['XrefNoteTranscription'] ?? null)])));
            $url = $txt($s['Url']);
            $type = $url !== '' ? 'internet' : (($agency !== '' || $txt($s['Cote']) !== '') ? 'archive' : 'other');
            $insertSource->execute([$txt($s['Titre']) ?: ($txt($s['Document']) ?: 'Source sans titre'), $txt($s['Auteur']), $agency, '', $url, $text, $type]);
            $sourceMap[(int) $s['CodeID']] = (int) $pdo->lastInsertId();
            $stats['sources']++;
        }
        $insertCitation = $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality,note) VALUES(?,?,?,?,?,?)');
        foreach ([['LiensSourceEvenement', 'XrefEvenement', 'event', $eventMap], ['LiensSourceIndividu', 'XrefIndividu', 'person', $personMap]] as [$table, $col, $entity, $map]) {
            if (!$has($table)) { continue; }
            foreach ($rows("SELECT * FROM {$table}") as $c) {
                $sid = $sourceMap[(int) $c['XrefSource']] ?? null;
                $eid = $map[(int) $c[$col]] ?? null;
                if (!$sid || !$eid) { continue; }
                $insertCitation->execute([$entity, $eid, $sid, $txt($c['Citation']), '', trim($note($c['XrefNote']) . "\n\n" . $note($c['XrefNoteTranscription'] ?? null))]);
                $stats['citations']++;
            }
        }
    }

    // Médias : copie rangée par Hérédis dans « Media/#<n°> », sinon le fichier d'origine s'il est encore là
    $mediaMap = [];
    if ($has('Medias')) {
        if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
        $insertMedia = $pdo->prepare('INSERT INTO media(title,description,media_type,filename,thumbnail,date_text) VALUES(?,?,?,?,?,?)');
        foreach ($rows('SELECT * FROM Medias') as $m) {
            $candidates = heredis_list_dir($packageDir . '/Media/#' . (int) $m['CodeID']);
            $candidates = array_values(array_filter($candidates, 'is_file'));
            $from = $candidates[0] ?? (is_file((string) $m['FilePath']) ? (string) $m['FilePath'] : null);
            $name = $txt($m['FileName']) ?: basename((string) $m['FilePath']);
            $ext = strtolower(pathinfo($from ?? $name, PATHINFO_EXTENSION));
            $stored = '';
            if ($from !== null && in_array($ext, BACKUP_MEDIA_EXTENSIONS, true)) {
                $target = bin2hex(random_bytes(16)) . '.' . $ext;
                if (@copy($from, MEDIA_DIR . '/' . $target)) { $stored = $target; }
            }
            if ($stored === '') { $stats['media_missing']++; }
            $type = match (true) { $ext === 'pdf' => 'pdf', in_array($ext, ['mp3', 'm4a', 'aac', 'wav', 'aif', 'aiff', 'aifc', 'ogg', 'flac'], true) => 'audio',
                in_array($ext, ['mov', 'mp4', 'm4v', 'webm', 'avi', 'mkv'], true) => 'video', default => 'image' };
            $insertMedia->execute([pathinfo($name, PATHINFO_FILENAME), $note($m['XrefNote']), $type, $stored, '', gedcom_date_to_text($txt($m['DateGed']))]);
            $mediaMap[(int) $m['CodeID']] = (int) $pdo->lastInsertId();
            $stats['media']++;
        }
        $insertLink = $pdo->prepare('INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,?,?,?)');
        $portrait = $pdo->prepare('UPDATE persons SET portrait_media_id=? WHERE id=? AND portrait_media_id IS NULL');
        foreach ([['LiensMediaIndividu', 'XrefIndividu', 'person', $personMap], ['LiensMediaEvenement', 'XrefEvenement', 'event', $eventMap],
                  ['LiensMediaUnion', 'XrefUnion', 'family', $familyMap], ['LiensMediaSource', 'XrefSource', 'source', $sourceMap]] as [$table, $col, $entity, $map]) {
            if (!$has($table)) { continue; }
            foreach ($rows("SELECT * FROM {$table} ORDER BY Ordre") as $l) {
                $mid = $mediaMap[(int) $l['XrefMedia']] ?? null;
                $eid = $map[(int) $l[$col]] ?? null;
                if (!$mid || !$eid) { continue; }
                $insertLink->execute([$mid, $entity, $eid, (int) $l['Ordre']]);
                if ($entity === 'person' && !empty($l['MediaPrincipal'])) { $portrait->execute([$mid, $eid]); }
            }
        }
    }

    // Étiquettes
    if ($has('Etiquettes')) {
        $labelMap = [];
        $findLabel = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE');
        $insertLabel = $pdo->prepare('INSERT INTO labels(name,color,description) VALUES(?,?,?)');
        foreach ($rows('SELECT * FROM Etiquettes') as $l) {
            $name = $txt($l['Titre']);
            if ($name === '') { continue; }
            $findLabel->execute([$name]);
            $id = $findLabel->fetchColumn();
            if (!$id) {
                $insertLabel->execute([$name, sprintf('#%06x', ((int) $l['Couleur']) & 0xFFFFFF), $txt($l['Description'])]);
                $id = $pdo->lastInsertId();
            }
            $labelMap[(int) $l['CodeID']] = (int) $id;
        }
        $insertLabelLink = $pdo->prepare('INSERT OR IGNORE INTO label_links(label_id,entity_type,entity_id) VALUES(?,?,?)');
        foreach ([['LiensEtiquetteIndividu', 'XrefIndividu', 'person', $personMap], ['LiensEtiquetteEvenement', 'XrefEvenement', 'event', $eventMap],
                  ['LiensEtiquetteMedia', 'XrefMedia', 'media', $mediaMap]] as [$table, $col, $entity, $map]) {
            if (!$has($table)) { continue; }
            foreach ($rows("SELECT * FROM {$table}") as $l) {
                $lid = $labelMap[(int) $l['XrefEtiquette']] ?? null;
                $eid = $map[(int) ($l[$col] ?? 0)] ?? null;
                if ($lid && $eid) { $insertLabelLink->execute([$lid, $entity, $eid]); $stats['labels']++; }
            }
        }
    }

    // Tâches → rappels (avec les personnes concernées dans la note)
    if ($has('Taches')) {
        $taskPeople = [];
        if ($has('LiensTachesIndis')) {
            foreach ($rows("SELECT l.XrefTache t, trim(i.Prenoms || ' ' || i.Noms) n FROM LiensTachesIndis l JOIN Individus i ON i.CodeID=l.XrefIndividu") as $r) { $taskPeople[(int) $r['t']][] = $txt($r['n']); }
        }
        $insertReminder = $pdo->prepare('INSERT INTO standalone_reminders(title,notes,reminder_mode,reminder_due_at,reminder_done,reminder_done_at,reminder_category) VALUES(?,?,?,?,?,?,?)');
        foreach ($rows('SELECT * FROM Taches') as $t) {
            $due = preg_match('/^\d{4}-\d{2}-\d{2}/', (string) $t['DateEcheance'], $m) && $m[0] > '1971' ? $m[0] : '';
            $priority = match ((int) $t['Priorite']) { 1 => 'priorité faible', 2 => 'priorité moyenne', 3 => 'priorité élevée', default => '' };
            $notesText = trim(implode("\n\n", array_filter([$txt($t['Description']), $priority !== '' ? 'Hérédis : ' . $priority : '',
                !empty($taskPeople[(int) $t['CodeID']]) ? 'Personnes : ' . implode(', ', $taskPeople[(int) $t['CodeID']]) : ''])));
            $done = (int) $t['TacheRealisee'] ? 1 : 0;
            $insertReminder->execute([$txt($t['Titre']) ?: 'Tâche Hérédis', $notesText, $due !== '' ? 'on' : 'after', $due !== '' ? $due : date('Y-m-d'), $done, $done ? date('Y-m-d H:i:s') : '', '']);
            $stats['tasks']++;
        }
    }

    // Adresses de personnes vivantes → contacts
    if ($has('Adresses') && $has('LiensAdresses')) {
        $insertContact = $pdo->prepare('INSERT INTO living_contacts(person_id,first_name,last_name,email,phone,phone_mobile,address,postal_code,city,country) VALUES(?,?,?,?,?,?,?,?,?,?)');
        foreach ($rows('SELECT a.*, l.XrefIndividu, i.Prenoms, i.Noms FROM LiensAdresses l JOIN Adresses a ON a.CodeID=l.XrefAdresse JOIN Individus i ON i.CodeID=l.XrefIndividu') as $a) {
            $pid = $personMap[(int) $a['XrefIndividu']] ?? null;
            if (!$pid) { continue; }
            $insertContact->execute([$pid, $txt($a['Prenoms']), $txt($a['Noms']), $txt($a['Email']), $txt($a['Tel']), $txt($a['TelPortable']),
                trim($txt($a['Adresse1']) . "\n" . $txt($a['Adresse2'])), $txt($a['CodePostal']), $txt($a['Ville']), $txt($a['Pays']) ?: 'France']);
        }
    }

    gedimport_rebuild_search($pdo);
    $src = null;
    return $stats;
}
