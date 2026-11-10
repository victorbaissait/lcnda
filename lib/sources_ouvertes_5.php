<?php
declare(strict_types=1);

/**
 * 🌍 Archives en ligne, cinquième lot (FamilySearch, WikiTree, Fichier Origine, Centre d'études acadiennes, Castle Garden,
 * Médaillés de Sainte-Hélène, Archives nationales du monde du travail, mémoriaux des cheminots / gendarmes / policiers,
 * état civil consulaire, Pamyat Naroda, Memorial, Maitron, CCFr, Calames).
 *
 * Même modèle que lib/sources_ouvertes.php : le serveur NE SE CONNECTE À AUCUN de ces sites. La page ouvre la recherche dans le
 * navigateur (adresses : assets/js/app-sources-ouvertes-5-core.js) ; la personne importe ensuite ce qu'elle a copié ou téléchargé.
 * Un import (POST so5_import, multipart : « file » facultatif + « data » en JSON) :
 *  - range le fichier dans les médias et le relie à la fiche ; crée une source (avec le lien), reliée à la fiche et aux événements créés ;
 *  - ajoute seulement ce qui MANQUE et que la personne a coché : événements (jamais une deuxième naissance / un deuxième décès),
 *    voyage (bloc « Départs / émigration »), récompense (« 🏆 Concours et récompenses »), ligne dans la fiche d'un employeur,
 *    note, identifiant FamilySearch (seulement si la case était vide) ;
 *  - garde tout dans so_imports (la table commune des archives en ligne, kind « so5:… ») pour « ↶ Annuler » (POST so5_undo).
 * POST so5_preview : « c'est la même personne ? » — les écarts entre le document et la fiche, ce qu'elle a déjà ; rien n'est écrit.
 */

const SO5_KINDS = ['acte', 'wikitree', 'origine', 'passager', 'medaille_sh', 'personnel', 'mort_service', 'biographie', 'fonds', 'pamyat', 'repression'];
const SO5_MENTION = 'Lu sur un site d’archives en ligne et recopié : à vérifier sur le document';
const SO5_TAGS = ['BIRT', 'CHR', 'DEAT', 'BURI', 'OCCU', 'RESI', 'EVEN', 'MISE', 'DEED'];
/** une seule naissance, un seul baptême, un seul décès, une seule inhumation : jamais un deuxième */
const SO5_SINGLE = ['BIRT', 'CHR', 'DEAT', 'BURI'];
/** les événements qui demandent du respect : une fiche qui en porte un n'entre dans aucun jeu */
const SO5_RESPECT = ['repression-politique-urss' => 'Répression politique (URSS)'];
const SO5_AGENCY = ['fs_records' => 'FamilySearch', 'fs_tree' => 'FamilySearch (arbre)', 'fs_catalog' => 'FamilySearch (catalogue)', 'wikitree' => 'WikiTree',
    'fichier_origine' => 'Fichier Origine (Fédération québécoise des sociétés de généalogie)', 'cea_acadie' => 'Centre d’études acadiennes Anselme-Chiasson',
    'castle_garden' => 'Castle Garden (Battery Conservancy)', 'sainte_helene' => 'Médaillés de Sainte-Hélène', 'anmt' => 'Archives nationales du monde du travail (Roubaix)',
    'memorial_cheminots' => 'Mémorial des cheminots', 'memorial_gendarmes' => 'Mémorial de la gendarmerie', 'memorial_policiers' => 'Mémorial de la police',
    'consulaire_nantes' => 'Archives diplomatiques (Nantes) — état civil consulaire', 'maitron' => 'Le Maitron', 'ccfr' => 'Catalogue collectif de France (CCFr)',
    'calames' => 'Calames (Abes)', 'pamyat_naroda' => 'Pamyat Naroda (ministère russe de la Défense)', 'memorial_urss' => 'Memorial'];

function so5_text(mixed $v, int $max = 500): string { return mb_substr(trim(is_scalar($v) ? safe_text($v) : ''), 0, $max); }
function so5_long(mixed $v, int $max = 20000): string { return mb_substr(trim(is_scalar($v) ? str_replace("\r", '', (string) $v) : ''), 0, $max); }
function so5_url(mixed $v): string { $s = trim(is_scalar($v) ? (string) $v : ''); return preg_match('#^https?://[^\s<>"\'`]+$#i', $s) && strlen($s) <= 2000 ? $s : ''; }
function so5_year(string $s): int { return preg_match('/\b(1[5-9]\d\d|20\d\d)\b/', $s, $m) ? (int) $m[1] : 0; }
function so5_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', '’' => "'", '-' => ' ']);
    return (string) preg_replace('/\s+/', ' ', $s);
}
function so5_schema(PDO $pdo): void
{
    if (!function_exists('so_schema')) { require_once __DIR__ . '/sources_ouvertes.php'; }
    so_schema($pdo); // la table commune so_imports
}

/** les données envoyées par la page, nettoyées et bornées */
function so5_clean(array $d): array
{
    $kind = in_array($d['kind'] ?? '', SO5_KINDS, true) ? (string) $d['kind'] : '';
    if ($kind === '') { throw new LcndaBadInput('Sorte d’import inconnue.'); }
    $site = is_string($d['site'] ?? null) && preg_match('/^[a-z0-9_]{1,40}$/', $d['site']) ? $d['site'] : '';
    $f = [];
    foreach ((is_array($d['fields'] ?? null) ? $d['fields'] : []) as $k => $v) {
        if (!is_string($k) || !preg_match('/^[a-z_]{1,40}$/', $k) || count($f) >= 60) { continue; }
        $f[$k] = in_array($k, ['text', 'description', 'notes', 'service'], true) ? so5_long($v) : so5_text($v);
    }
    $events = [];
    foreach (array_slice(is_array($d['events'] ?? null) ? $d['events'] : [], 0, 10) as $e) {
        if (!is_array($e) || empty($e['checked'])) { continue; }
        $tag = strtoupper(so5_text($e['tag'] ?? '', 8));
        if (!in_array($tag, SO5_TAGS, true)) { continue; }
        $slug = so5_text($e['slug'] ?? '', 60);
        $events[] = ['tag' => $tag, 'date' => so5_text($e['date'] ?? '', 100), 'place' => so5_text($e['place'] ?? '', 200), 'description' => so5_text($e['description'] ?? '', 500),
            'slug' => isset(SO5_RESPECT[$slug]) ? $slug : '', 'label' => so5_text($e['label'] ?? '', 80)];
    }
    $obj = static fn(string $k) => is_array($d[$k] ?? null) && !empty($d[$k]['checked']) ? $d[$k] : null;
    $voyage = $obj('voyage'); $award = $obj('award'); $employer = $obj('employer'); $note = $obj('note');
    $fs = strtoupper(so5_text($d['fs_id'] ?? '', 12));
    return ['kind' => $kind, 'site' => $site, 'person_id' => safe_int($d['person_id'] ?? 0), 'url' => so5_url($d['url'] ?? ''), 'fields' => $f, 'events' => $events,
        'voyage' => $voyage ? array_map(static fn($v) => is_scalar($v) ? (string) $v : '', array_intersect_key($voyage, array_flip(['departure_port', 'ship_name', 'destination', 'departure_date', 'arrival_date', 'arrival_port', 'reason', 'passenger_list_ref', 'notes']))) : null,
        'award' => $award ? array_map(static fn($v) => is_scalar($v) ? (string) $v : '', array_intersect_key($award, array_flip(['title', 'date', 'grade', 'org', 'source', 'notes']))) : null,
        'employer' => $employer ? ['name' => so5_text($employer['name'] ?? '', 200), 'line' => so5_text($employer['line'] ?? '', 600), 'date' => so5_text($employer['date'] ?? '', 60)] : null,
        'note' => $note ? ['title' => so5_text($note['title'] ?? '', 200), 'text' => so5_long($note['text'] ?? '')] : null,
        'fs_id' => preg_match('/^[A-Z0-9]{4}-[A-Z0-9]{3,4}$/', $fs) ? $fs : ''];
}

/** ce que la fiche a déjà : nom, années, balises d'événements, identifiant FamilySearch, verrou */
function so5_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, middle_name, last_name, gender, COALESCE(familysearch_id,\'\') AS fs, COALESCE(is_locked,0) AS locked FROM persons WHERE id=?');
    $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $ev = $pdo->prepare("SELECT e.id, e.date_text, e.year, t.gedcom_tag AS tag, t.slug, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? ORDER BY e.id");
    $ev->execute([$pid]);
    $events = $ev->fetchAll(PDO::FETCH_ASSOC);
    $has = []; $first = [];
    foreach ($events as $e) { $t = (string) $e['tag']; if ($t !== '') { $has[$t] = true; $first[$t] ??= $e; } }
    return ['id' => (int) $p['id'], 'first' => trim($p['first_name'] . ' ' . $p['middle_name']), 'last' => (string) $p['last_name'], 'gender' => (string) $p['gender'],
        'fs' => (string) $p['fs'], 'locked' => (int) $p['locked'] === 1, 'has' => $has, 'events' => $first,
        'birth_year' => (int) (($first['BIRT'] ?? $first['CHR'] ?? [])['year'] ?? 0) ?: null, 'death_year' => (int) (($first['DEAT'] ?? $first['BURI'] ?? [])['year'] ?? 0) ?: null];
}

/** POST so5_preview : « c'est la même personne ? » — rien n'est écrit */
function so5_preview(PDO $pdo, array $data): array
{
    $c = so5_clean($data);
    if (!$c['person_id']) { return ['ecarts' => [], 'person' => null]; }
    $p = so5_person($pdo, $c['person_id']); $f = $c['fields']; $out = [];
    $add = static function (string $level, string $text) use (&$out): void { $out[] = ['level' => $level, 'text' => $text]; };
    if (!empty($f['last']) && $p['last'] !== '' && so5_fold($f['last']) !== so5_fold($p['last'])) { $add('orange', 'Le document dit « ' . $f['last'] . ' », la fiche « ' . $p['last'] . ' » : est-ce bien la même personne ?'); }
    if (!empty($f['first']) && $p['first'] !== '') {
        $a = explode(' ', so5_fold($f['first']))[0]; $b = explode(' ', so5_fold($p['first']));
        if (!in_array($a, $b, true)) { $add('orange', 'Prénom lu « ' . $f['first'] . ' », la fiche dit « ' . $p['first'] . ' ».'); }
    }
    $by = so5_year((string) ($f['birth_date'] ?? ''));
    if ($by && $p['birth_year'] && abs($by - (int) $p['birth_year']) > 2) { $add('orange', 'Né(e) en ' . $by . ' d’après le document, en ' . $p['birth_year'] . ' d’après la fiche.'); }
    $dy = so5_year((string) ($f['death_date'] ?? ''));
    if ($dy && $p['death_year'] && abs($dy - (int) $p['death_year']) > 1) { $add('orange', 'Mort(e) en ' . $dy . ' d’après le document, en ' . $p['death_year'] . ' d’après la fiche.'); }
    if ($p['birth_year'] && $c['kind'] === 'medaille_sh' && ((int) $p['birth_year'] > 1800)) { $add('yellow', 'Né(e) en ' . $p['birth_year'] . ' : trop jeune pour avoir servi sous l’Empire (la médaille de 1857 est pour les soldats de 1792-1815).'); }
    if (in_array($c['kind'], ['medaille_sh', 'pamyat'], true) && $p['gender'] === 'female') { $add('yellow', 'La fiche est celle d’une femme : vérifie que c’est la bonne personne.'); }
    foreach (SO5_SINGLE as $t) {
        if (!empty($p['has'][$t])) { $e = $p['events'][$t]; $add('info', ['BIRT' => 'La naissance', 'CHR' => 'Le baptême', 'DEAT' => 'Le décès', 'BURI' => 'L’inhumation'][$t] . ' de la fiche (' . trim(($e['date_text'] ?: '') . ($e['place'] ? ' à ' . $e['place'] : '')) . ') est gardée telle quelle : aucune autre n’est ajoutée.'); }
    }
    if ($p['fs'] !== '' && !empty($data['fs_id']) && strtoupper((string) $data['fs_id']) !== strtoupper($p['fs'])) { $add('orange', 'La fiche a déjà l’identifiant FamilySearch ' . $p['fs'] . ' : il est gardé.'); }
    if ($c['url'] !== '') {
        $s = $pdo->prepare('SELECT count(*) FROM sources s JOIN source_links l ON l.source_record_id=s.id WHERE s.url=? AND l.entity_type=\'person\' AND l.entity_id=?');
        $s->execute([$c['url'], $c['person_id']]);
        if ((int) $s->fetchColumn()) { $add('yellow', 'Ce lien est déjà une source de cette fiche : l’importer encore ferait un doublon.'); }
    }
    return ['ecarts' => $out, 'person' => ['id' => $p['id'], 'first' => $p['first'], 'last' => $p['last'], 'gender' => $p['gender'], 'fs' => $p['fs'], 'locked' => $p['locked'], 'has' => $p['has'],
        'birth_year' => $p['birth_year'], 'death_year' => $p['death_year']]];
}

/** le type d'événement d'une balise (ou d'un slug de respect, créé une fois) */
function so5_event_type(PDO $pdo, string $tag, string $slug = ''): int
{
    if ($slug !== '' && isset(SO5_RESPECT[$slug])) {
        $s = $pdo->prepare('SELECT id FROM event_types WHERE slug=?'); $s->execute([$slug]); $id = (int) $s->fetchColumn();
        if ($id) { return $id; }
        $pdo->prepare("INSERT INTO event_types(scope, slug, label, icon, color, is_custom) VALUES('person', ?, ?, 'diamond', '#5b6370', 1)")->execute([$slug, SO5_RESPECT[$slug]]);
        return (int) $pdo->lastInsertId();
    }
    $bySlug = ['MISE' => 'service-militaire', 'DEED' => 'acte', 'EVEN' => 'acte'];
    if (isset($bySlug[$tag])) { $s = $pdo->prepare("SELECT id FROM event_types WHERE slug=? AND scope='person'"); $s->execute([$bySlug[$tag]]); $id = (int) $s->fetchColumn(); if ($id) { return $id; } }
    $s = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? AND scope='person' ORDER BY id LIMIT 1"); $s->execute([$tag === 'EVEN' ? 'DEED' : $tag]);
    return (int) $s->fetchColumn();
}

/** range le fichier reçu (images, PDF, texte) dans les médias ; rend [nom, type de média] */
function so5_store_file(?array $file): ?array
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) { return null; }
    if ((int) ($file['error'] ?? 1) !== UPLOAD_ERR_OK) { throw new LcndaBadInput(upload_failure_message($file)); }
    $name = (string) ($file['name'] ?? 'fichier');
    if (!in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'txt'], true)) { throw new LcndaBadInput('Ici, on range une image (JPG, PNG, WebP, GIF), un PDF ou un texte (.txt).'); }
    if (!function_exists('lot_store_upload')) { require_once __DIR__ . '/lots.php'; }
    $r = lot_store_upload($file, $name);
    return [$r['name'], $r['media_type']];
}

/** POST so5_import (multipart) */
function so5_import(PDO $pdo, ?array $file, array $data): array
{
    so5_schema($pdo);
    $c = so5_clean($data);
    $pid = $c['person_id'];
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
    assert_person_unlocked($pdo, $pid);
    $p = so5_person($pdo, $pid); $f = $c['fields'];
    $stored = so5_store_file($file);
    $hasText = trim((string) ($f['text'] ?? '')) !== '' || count(array_filter($f, static fn($v) => $v !== '')) >= 2;
    if (!$stored && $c['url'] === '' && !$hasText) { throw new LcndaBadInput('Il faut un fichier, un lien ou au moins le texte du document.'); }
    $batch = 'so5-' . bin2hex(random_bytes(6));
    $ids = ['media' => [], 'media_links' => [], 'sources' => [], 'source_links' => [], 'events' => [], 'items' => [], 'voyages' => [], 'notes' => [], 'employer_created' => []];
    $before = []; $notes = [];
    $who = trim(($f['first'] ?? '') . ' ' . mb_strtoupper((string) ($f['last'] ?? ''))) ?: trim($p['first'] . ' ' . mb_strtoupper($p['last']));
    $kindTitle = ['acte' => 'Acte', 'wikitree' => 'Fiche WikiTree', 'origine' => 'Fiche du Fichier Origine', 'passager' => 'Liste de passagers', 'medaille_sh' => 'Médaille de Sainte-Hélène',
        'personnel' => 'Registre du personnel', 'mort_service' => 'Mort en service', 'biographie' => 'Notice biographique', 'fonds' => 'Fonds d’archives', 'pamyat' => 'Fiche Pamyat Naroda', 'repression' => 'Fiche Memorial'][$c['kind']];
    $foreign = in_array($c['kind'], ['passager', 'pamyat', 'repression', 'origine'], true) || in_array($c['site'], ['cea_acadie', 'consulaire_nantes'], true);
    $pdo->beginTransaction();
    try {
        // 1. le fichier → un média relié à la fiche
        $mediaId = 0;
        if ($stored) {
            [$mediaFile, $mtype] = $stored;
            $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_reference, document_title, document_url, transcription) VALUES(?,?,?,?,?,?,?,?,?,?)')
                ->execute([so5_text($f['media_title'] ?? '', 300) ?: $kindTitle . ' — ' . $who, SO5_MENTION . '.', $mtype, $mediaFile, $mtype === 'image' ? $mediaFile : '',
                    so5_text($f['date'] ?? ($f['death_date'] ?? ($f['birth_date'] ?? '')), 100), so5_text($f['cote'] ?? ($f['numero'] ?? ''), 200), $kindTitle, $c['url'], so5_long($f['text'] ?? '')]);
            $mediaId = (int) $pdo->lastInsertId(); $ids['media'][] = $mediaId;
            $pos = $pdo->prepare("SELECT COALESCE(max(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?"); $pos->execute([$pid]);
            $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$mediaId, $pid, (float) $pos->fetchColumn()]);
            $ids['media_links'][] = (int) $pdo->lastInsertId();
            log_change($pdo, 'media', $mediaId, 'create', $kindTitle . ' importé(e) pour ' . $who);
        }
        // 2. les événements cochés : seulement ce qui manque
        $has = $p['has'];
        foreach ($c['events'] as $e) {
            $t = $e['tag'];
            if (in_array($t, SO5_SINGLE, true) && (!empty($has[$t]) || ($t === 'BIRT' && !empty($has['CHR'])) || ($t === 'CHR' && !empty($has['BIRT'])))) { $notes[] = mb_strtolower(['BIRT' => 'Naissance', 'CHR' => 'Baptême', 'DEAT' => 'Décès', 'BURI' => 'Inhumation'][$t]) . ' déjà sur la fiche, gardée'; continue; }
            if ($e['date'] === '' && $e['place'] === '' && $e['description'] === '') { continue; }
            $type = so5_event_type($pdo, $t, $e['slug']);
            if (!$type) { continue; }
            $ev = add_event($pdo, ['person_id' => $pid, 'event_type_id' => $type, 'date_text' => $e['date'], 'place_name' => $e['place'], 'country' => $foreign ? '' : 'France',
                'description' => $e['description'], 'fact_confidence' => 'unknown']);
            $ids['events'][] = (int) $ev['id']; $has[$t] = true;
        }
        if ($ids['events']) { $notes[] = count($ids['events']) . ' événement' . (count($ids['events']) > 1 ? 's' : '') . ' ajouté' . (count($ids['events']) > 1 ? 's' : ''); }
        // 3. voyage (bloc « Départs / émigration »)
        if ($c['voyage']) {
            if (!function_exists('save_voyage')) { require_once __DIR__ . '/heritage.php'; }
            $flag = (int) $pdo->query('SELECT COALESCE(show_voyage_block,0) FROM persons WHERE id=' . $pid)->fetchColumn();
            if (!$flag) { $before['show_voyage_block'] = 0; }
            $v = $c['voyage'];
            $r = save_voyage($pdo, ['person_id' => $pid, 'departure_port' => so5_text($v['departure_port'] ?? '', 200), 'ship_name' => so5_text($v['ship_name'] ?? '', 200), 'destination' => so5_text($v['destination'] ?? '', 200),
                'departure_date' => so5_text($v['departure_date'] ?? '', 100), 'arrival_date' => so5_text($v['arrival_date'] ?? '', 100), 'arrival_port' => so5_text($v['arrival_port'] ?? '', 200),
                'reason' => so5_text($v['reason'] ?? '', 500), 'passenger_list_ref' => so5_text($v['passenger_list_ref'] ?? '', 200), 'passenger_list_url' => $c['url'],
                'passenger_list_text' => so5_long($f['text'] ?? '', 20000), 'notes' => trim(so5_long($v['notes'] ?? '', 4000) . "\n" . SO5_MENTION . '.')]);
            $ids['voyages'][] = (int) $r['id']; $notes[] = 'voyage ajouté (Départs / émigration)';
        }
        // 4. récompense (« 🏆 Concours et récompenses »)
        if ($c['award']) {
            if (!function_exists('blocs_save_item')) { require_once __DIR__ . '/blocs.php'; }
            $a = $c['award'];
            $d = ['category' => 'decoration', 'level' => 'national', 'title' => so5_text($a['title'] ?? '', 200) ?: 'Décoration', 'grade' => so5_text($a['grade'] ?? '', 120), 'date' => so5_text($a['date'] ?? '', 100),
                'org' => so5_text($a['org'] ?? '', 200), 'dossier' => $c['url'], 'source' => so5_text($a['source'] ?? '', 300), 'notes' => trim(so5_long($a['notes'] ?? '', 4000) . "\n" . SO5_MENTION . '.')];
            if ($mediaId) { $d['photo'] = ['mid' => $mediaId, 'f' => $stored[0], 'title' => $kindTitle]; }
            $ids['items'][] = (int) blocs_save_item($pdo, ['person_id' => $pid, 'kind' => 'award', 'data' => $d])['id'];
            $notes[] = 'récompense ajoutée (🏆 Concours et récompenses)';
        }
        // 5. employeur : une ligne dans l'historique de sa fiche (créée si elle n'existe pas encore)
        if ($c['employer'] && $c['employer']['name'] !== '' && function_exists('employer_key')) {
            $key = employer_key($c['employer']['name']);
            $s = $pdo->prepare('SELECT id, data_json FROM employer_records WHERE key=?'); $s->execute([$key]); $row = $s->fetch(PDO::FETCH_ASSOC);
            $edata = $row ? (json_decode((string) $row['data_json'], true) ?: []) : [];
            $hist = is_array($edata['history'] ?? null) ? $edata['history'] : [];
            $hist[] = ['date' => $c['employer']['date'], 'text' => $c['employer']['line'] ?: ($who . ' (registre du personnel)')];
            $edata['history'] = $hist;
            $json = json_encode($edata, JSON_UNESCAPED_UNICODE);
            if ($row) {
                $before['employer'] = ['id' => (int) $row['id'], 'old' => (string) $row['data_json'], 'new' => $json];
                $pdo->prepare('UPDATE employer_records SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$json, (int) $row['id']]);
                $notes[] = 'ligne ajoutée à la fiche de l’employeur « ' . $c['employer']['name'] . ' »';
            } else {
                $pdo->prepare('INSERT INTO employer_records(key, name, data_json) VALUES(?,?,?)')->execute([$key, $c['employer']['name'], $json]);
                $ids['employer_created'][] = (int) $pdo->lastInsertId();
                $notes[] = 'fiche d’employeur « ' . $c['employer']['name'] . ' » créée';
            }
        }
        // 6. note
        if ($c['note'] && trim($c['note']['text']) !== '') {
            $pdo->prepare("INSERT INTO notes(entity_type, entity_id, title, body, created_at, updated_at) VALUES('person', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
                ->execute([$pid, $c['note']['title'] ?: $kindTitle, $c['note']['text'] . "\n\n" . SO5_MENTION . '.']);
            $ids['notes'][] = (int) $pdo->lastInsertId(); $notes[] = 'note ajoutée';
        }
        // 7. identifiant FamilySearch : seulement si la case était vide
        if ($c['fs_id'] !== '') {
            if ($p['fs'] === '') { $before['familysearch_id'] = ''; $before['familysearch_new'] = $c['fs_id']; $pdo->prepare('UPDATE persons SET familysearch_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$c['fs_id'], $pid]); $notes[] = 'identifiant FamilySearch noté'; }
            elseif (strtoupper($p['fs']) !== $c['fs_id']) { $notes[] = 'identifiant FamilySearch de la fiche gardé'; }
        }
        // 8. la source, avec le lien ; reliée à la fiche, aux événements créés et au média
        $title = so5_text($data['source_title'] ?? '', 240) ?: ($kindTitle . ' — ' . $who);
        $agency = SO5_AGENCY[$c['site']] ?? 'Archives en ligne';
        if ($c['kind'] === 'fonds' && !empty($f['repository'])) { $agency = so5_text($f['repository'], 200); }
        $text = SO5_MENTION . '.' . (trim((string) ($f['text'] ?? '')) !== '' ? "\n\n" . so5_long($f['text']) : '');
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')->execute([$title, so5_text($f['author'] ?? '', 200), $agency, $kindTitle, $c['url'], $text]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $page = so5_text($f['cote'] ?? ($f['numero'] ?? ($f['matricule'] ?? '')), 120);
        $link->execute(['person', $pid, $sid, $page, '', SO5_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        foreach ($ids['events'] as $eid) { $link->execute(['event', $eid, $sid, $page, '', SO5_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mediaId, $sid]); $ids['media_links'][] = (int) $pdo->lastInsertId(); }
        $summary = $kindTitle . ' : ' . implode(', ', array_merge($mediaId ? ['document rangé dans les médias'] : [], ['source créée'], $notes));
        $pdo->prepare('INSERT INTO so_imports(batch, kind, person_id, summary, ids, before_json) VALUES(?,?,?,?,?,?)')
            ->execute([$batch, 'so5:' . $c['kind'], $pid, $summary, json_encode($ids), json_encode($before, JSON_UNESCAPED_UNICODE)]);
        log_change($pdo, 'person', $pid, 'update', $summary . ' — ' . SO5_MENTION);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($stored) { @unlink(MEDIA_DIR . '/' . $stored[0]); }
        throw $e;
    }
    return ['batch' => $batch, 'summary' => $summary, 'media_id' => $ids['media'][0] ?? 0, 'source_id' => $sid, 'event_ids' => $ids['events'], 'voyage_id' => $ids['voyages'][0] ?? 0,
        'item_id' => $ids['items'][0] ?? 0, 'note_id' => $ids['notes'][0] ?? 0, 'notes' => $notes];
}

/** POST so5_undo : retire tout ce qu'un import a ajouté et remet les anciennes valeurs */
function so5_undo(PDO $pdo, array $data): array
{
    so5_schema($pdo);
    $batch = so5_text($data['batch'] ?? '', 40);
    $s = $pdo->prepare("SELECT * FROM so_imports WHERE batch=? AND undone_at='' AND kind LIKE 'so5:%'"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Cet import est déjà annulé, ou introuvable.'); }
    $ids = json_decode((string) $row['ids'], true) ?: []; $before = json_decode((string) $row['before_json'], true) ?: [];
    $pid = (int) $row['person_id'];
    assert_person_unlocked($pdo, $pid);
    $files = [];
    $pdo->beginTransaction();
    try {
        foreach (array_map('intval', $ids['items'] ?? []) as $id) {
            $pdo->prepare('DELETE FROM items WHERE id=? AND person_id=?')->execute([$id, $pid]);
            foreach (['item_people' => 'item_id', 'item_links' => 'from_id', 'item_rows' => 'item_id'] as $t => $col) { try { $pdo->prepare("DELETE FROM $t WHERE $col=?")->execute([$id]); } catch (Throwable $_) {} }
        }
        foreach (array_map('intval', $ids['voyages'] ?? []) as $id) {
            try { $pdo->prepare("DELETE FROM media_links WHERE entity_type='voyage' AND entity_id=?")->execute([$id]); } catch (Throwable $_) {}
            try { $pdo->prepare('DELETE FROM voyage_people WHERE voyage_id=?')->execute([$id]); } catch (Throwable $_) {}
            $pdo->prepare('DELETE FROM person_voyages WHERE id=? AND person_id=?')->execute([$id, $pid]);
        }
        foreach (array_map('intval', $ids['notes'] ?? []) as $id) { $pdo->prepare("DELETE FROM notes WHERE id=? AND entity_type='person' AND entity_id=?")->execute([$id, $pid]); }
        foreach (array_map('intval', $ids['employer_created'] ?? []) as $id) { $pdo->prepare('DELETE FROM employer_records WHERE id=?')->execute([$id]); }
        if (is_array($before['employer'] ?? null)) { // remis comme avant seulement si personne n'y a touché depuis ; sinon on retire juste la ligne ajoutée
            $e = $before['employer']; $cur = $pdo->prepare('SELECT data_json FROM employer_records WHERE id=?'); $cur->execute([(int) $e['id']]); $now = $cur->fetchColumn();
            if ($now !== false) {
                if ((string) $now === (string) $e['new']) { $pdo->prepare('UPDATE employer_records SET data_json=? WHERE id=?')->execute([(string) $e['old'], (int) $e['id']]); }
                else {
                    $nd = json_decode((string) $now, true) ?: []; $added = (json_decode((string) $e['new'], true) ?: [])['history'] ?? []; $last = end($added);
                    if ($last && is_array($nd['history'] ?? null)) { foreach ($nd['history'] as $i => $h) { if ($h === $last) { array_splice($nd['history'], $i, 1); break; } } $pdo->prepare('UPDATE employer_records SET data_json=? WHERE id=?')->execute([json_encode($nd, JSON_UNESCAPED_UNICODE), (int) $e['id']]); }
                }
            }
        }
        foreach (array_map('intval', $ids['source_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['events'] ?? []) as $id) {
            foreach (['media_links', 'source_links', 'notes', 'label_links'] as $t) { try { $pdo->prepare("DELETE FROM $t WHERE entity_type='event' AND entity_id=?")->execute([$id]); } catch (Throwable $_) {} }
            try { $pdo->prepare('DELETE FROM event_witnesses WHERE event_id=?')->execute([$id]); } catch (Throwable $_) {}
            $pdo->prepare('DELETE FROM events WHERE id=? AND person_id=?')->execute([$id, $pid]);
            log_change($pdo, 'event', $id, 'delete', 'Import d’archives en ligne annulé');
        }
        foreach (array_map('intval', $ids['sources'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT count(*) FROM source_links WHERE source_record_id=?'); $n->execute([$id]);
            if (!(int) $n->fetchColumn()) { $pdo->prepare("DELETE FROM media_links WHERE entity_type='source' AND entity_id=?")->execute([$id]); $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([$id]); }
        }
        foreach (array_map('intval', $ids['media_links'] ?? []) as $id) { $pdo->prepare('DELETE FROM media_links WHERE id=?')->execute([$id]); }
        foreach (array_map('intval', $ids['media'] ?? []) as $id) {
            $n = $pdo->prepare('SELECT count(*) FROM media_links WHERE media_id=?'); $n->execute([$id]);
            if ((int) $n->fetchColumn()) { continue; } // relié ailleurs entre-temps : gardé
            $fn = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $fn->execute([$id]); $name = basename((string) $fn->fetchColumn());
            $pdo->prepare('DELETE FROM media WHERE id=?')->execute([$id]);
            if ($name !== '') { $u = $pdo->prepare('SELECT count(*) FROM media WHERE filename=? OR thumbnail=?'); $u->execute([$name, $name]); if (!(int) $u->fetchColumn()) { $files[] = $name; } }
            log_change($pdo, 'media', $id, 'delete', 'Import d’archives en ligne annulé');
        }
        if (array_key_exists('familysearch_id', $before)) { $pdo->prepare('UPDATE persons SET familysearch_id=? WHERE id=? AND familysearch_id=?')->execute([(string) $before['familysearch_id'], $pid, (string) ($before['familysearch_new'] ?? '')]); }
        if (array_key_exists('show_voyage_block', $before)) {
            $left = $pdo->prepare('SELECT count(*) FROM person_voyages WHERE person_id=?'); $left->execute([$pid]);
            if (!(int) $left->fetchColumn()) { $pdo->prepare('UPDATE persons SET show_voyage_block=? WHERE id=?')->execute([(int) $before['show_voyage_block'], $pid]); }
        }
        $pdo->prepare('UPDATE so_imports SET undone_at=CURRENT_TIMESTAMP WHERE batch=?')->execute([$batch]);
        log_change($pdo, 'person', $pid, 'update', 'Import d’archives en ligne annulé (' . $row['kind'] . ')');
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    foreach ($files as $name) { @unlink(MEDIA_DIR . '/' . $name); }
    return ['batch' => $batch, 'undone' => true];
}

/** les fiches qui demandent du respect (victimes de la répression en URSS) : [id => true] — lu par mode_simple_data (« mem » : jamais dans un jeu) */
function so5_respect_ids(PDO $pdo): array
{
    $out = [];
    try {
        $in = implode(',', array_fill(0, count(SO5_RESPECT), '?'));
        $s = $pdo->prepare("SELECT DISTINCT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND (t.slug IN ($in) OR t.label IN ($in))");
        $s->execute([...array_keys(SO5_RESPECT), ...array_values(SO5_RESPECT)]);
        foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) { $out[(int) $id] = true; }
    } catch (Throwable $_) {}
    return $out;
}

/** le point d'entrée (api.php) : POST so5_preview, so5_import (multipart), so5_undo — aucune lecture d'un site extérieur */
const SO5_ACTIONS = ['so5_preview', 'so5_import', 'so5_undo'];
function so5_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) { json_response(['error' => 'Demande inconnue.'], 400); }
        if ($action === 'so5_import') {
            $data = $payload;
            if (isset($payload['data']) && is_string($payload['data'])) { $data = json_decode($payload['data'], true); }
            if (!is_array($data)) { throw new LcndaBadInput('Données de l’import illisibles.'); }
            json_response(['ok' => true, 'result' => so5_import($pdo, $_FILES['file'] ?? null, $data)]);
        }
        json_response(['ok' => true, 'result' => match ($action) { 'so5_preview' => so5_preview($pdo, $payload), 'so5_undo' => so5_undo($pdo, $payload), default => throw new LcndaBadInput('Demande inconnue.') }]);
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422); }
}
