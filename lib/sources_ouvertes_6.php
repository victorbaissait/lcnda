<?php
declare(strict_types=1);

/**
 * 📚 Archives en ligne, sixième lot : bibliothèques numériques régionales, auteurs (IdRef, data.bnf.fr), Wikisource, gens de
 * mer, notaires de Paris, HisKi (Finlande), Old Bailey (Londres), sites payants.
 *
 * Même modèle que lib/sources_ouvertes.php et lib/sources_ouvertes_3.php, dont il reprend la table so_imports, le rangement
 * du fichier (so_store_file) et « ↶ Annuler » (so_undo) : le serveur NE SE CONNECTE À AUCUN de ces sites. Adresses et lecture
 * des fichiers : assets/js/app-sources-ouvertes-6-core.js.
 *
 * GET so6_context : ce que la fiche apporte (so_context) + « a publié / profil savant ou artiste » + ses fiches en ligne.
 * POST so6_preview : « c'est la même personne ? » — les écarts entre le document et la fiche ; rien n'est écrit.
 * POST so6_import (multipart : « file » facultatif + « data » en JSON) :
 *   - le fichier → un média relié à la fiche (depuis la fiche d'un lieu : relié à la source du lieu) ;
 *   - une source avec le lien et la mention « à vérifier », reliée à la fiche (ou au lieu), aux événements créés et au média ;
 *   - les événements COCHÉS (naissance, baptême, décès, inhumation : seulement si la fiche n'en a pas ; procès, départ…) —
 *     un mariage n'est jamais créé ici ;
 *   - auteur : le lien de la notice (IdRef, data.bnf.fr) dans « Fiches en ligne » (s'il n'y est pas déjà).
 * POST so6_undo : retire les fiches en ligne ajoutées, puis tout le reste (so_undo).
 */

const SO6_KINDS = ['auteur', 'hiski', 'oldbailey', 'document'];
const SO6_SITES = ['numelyo', 'lectura', 'rosalis', 'memoirevive', 'normannia', 'yroise', 'idref', 'databnf', 'wikisource', 'marins_shd', 'minutier', 'siv', 'hiski', 'oldbailey', 'scotlandspeople',
    'ancestry', 'myheritage', 'filae', 'geneanet_premium', ''];
const SO6_LABEL = ['auteur' => 'Notice d’autorité (auteur)', 'hiski' => 'Acte de paroisse finlandaise (HisKi)', 'oldbailey' => 'Procès de l’Old Bailey (Londres)', 'document' => 'Document d’une bibliothèque ou d’un site d’archives'];
const SO6_SITE_LABEL = ['numelyo' => 'Numelyo (Bibliothèque municipale de Lyon)', 'lectura' => 'Lectura Plus (Auvergne-Rhône-Alpes)', 'rosalis' => 'Rosalis (Bibliothèque de Toulouse)',
    'memoirevive' => 'Mémoire vive (Besançon)', 'normannia' => 'Normannia (bibliothèque numérique normande)', 'yroise' => 'Yroise (Bibliothèque de Brest)', 'idref' => 'IdRef (Abes)', 'databnf' => 'data.bnf.fr (Bibliothèque nationale de France)',
    'wikisource' => 'Wikisource', 'marins_shd' => 'Service historique de la Défense — inscription maritime', 'minutier' => 'Archives nationales — Minutier central des notaires de Paris', 'siv' => 'Archives nationales — Salle des inventaires virtuelle',
    'hiski' => 'HisKi (Suomen Sukututkimusseura, Finlande)', 'oldbailey' => 'Old Bailey Online (Londres)', 'scotlandspeople' => 'ScotlandsPeople (payant)', 'ancestry' => 'Ancestry (payant)', 'myheritage' => 'MyHeritage (payant)',
    'filae' => 'Filae (payant)', 'geneanet_premium' => 'Geneanet'];
const SO6_UNIQUE = ['BIRT', 'CHR', 'DEAT', 'BURI'];
const SO6_TAGS = ['BIRT', 'CHR', 'DEAT', 'BURI', 'RESI', 'OCCU', 'EVEN', 'MARR'];
/** les profils qui font proposer IdRef / data.bnf.fr sur la fiche */
const SO6_AUTHOR_PROFILES = ['artist', 'writer', 'scientist', 'inventor', 'explorer', 'collector'];
const SO6_AUTHOR_ITEMS = ['book', 'work', 'publication', 'article', 'these', 'thesis', 'livre'];

function so6_ready(PDO $pdo): void
{
    if (!function_exists('so_schema')) { require_once __DIR__ . '/sources_ouvertes.php'; }
    so_schema($pdo);
}

/** GET so6_context : so_context + profils, « a publié », fiches en ligne déjà notées */
function so6_context(PDO $pdo, int $pid): array
{
    so6_ready($pdo);
    $ctx = so_context($pdo, $pid);
    $ctx['profiles'] = []; $ctx['is_author'] = false; $ctx['sheets'] = [];
    if ($pid > 0) {
        try { $s = $pdo->prepare('SELECT profile_key FROM person_profiles WHERE person_id=?'); $s->execute([$pid]); $ctx['profiles'] = array_map('strval', $s->fetchAll(PDO::FETCH_COLUMN)); } catch (Throwable $_) {}
        $books = 0;
        try {
            $in = implode(',', array_fill(0, count(SO6_AUTHOR_ITEMS), '?'));
            $s = $pdo->prepare("SELECT count(*) FROM items WHERE type_key IN ($in) AND (person_id=? OR id IN (SELECT item_id FROM item_people WHERE person_id=?))");
            $s->execute([...SO6_AUTHOR_ITEMS, $pid, $pid]); $books = (int) $s->fetchColumn();
        } catch (Throwable $_) {
            try { $in = implode(',', array_fill(0, count(SO6_AUTHOR_ITEMS), '?')); $s = $pdo->prepare("SELECT count(*) FROM items WHERE type_key IN ($in) AND person_id=?"); $s->execute([...SO6_AUTHOR_ITEMS, $pid]); $books = (int) $s->fetchColumn(); } catch (Throwable $_) {}
        }
        $ctx['publications'] = $books;
        $ctx['is_author'] = $books > 0 || (bool) array_intersect($ctx['profiles'], SO6_AUTHOR_PROFILES);
        try { $s = $pdo->prepare("SELECT id, label, site, url FROM person_online_sheets WHERE person_id=? AND url<>'' ORDER BY id"); $s->execute([$pid]); $ctx['sheets'] = $s->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $_) {}
    }
    return $ctx;
}

/** les champs envoyés par la page, nettoyés et bornés */
function so6_clean(array $d): array
{
    $kind = in_array($d['kind'] ?? '', SO6_KINDS, true) ? (string) $d['kind'] : '';
    if ($kind === '') { throw new LcndaBadInput('Sorte d’import inconnue.'); }
    $site = in_array($d['site'] ?? '', SO6_SITES, true) ? (string) $d['site'] : '';
    $out = ['kind' => $kind, 'site' => $site, 'person_id' => safe_int($d['person_id'] ?? 0), 'place_id' => safe_int($d['place_id'] ?? 0), 'url' => so_url($d['url'] ?? ''), 'fields' => [], 'events' => [],
        'sheet' => !empty($d['sheet']) && $d['sheet'] !== '0', 'source_title' => so_text($d['source_title'] ?? '', 300), 'text' => so_text($d['text'] ?? '', 20000)];
    foreach ((is_array($d['fields'] ?? null) ? $d['fields'] : []) as $k => $v) {
        if (!is_string($k) || !preg_match('/^[a-z_0-9]{1,40}$/', $k) || count($out['fields']) >= 40) { continue; }
        $out['fields'][$k] = so_text($v, 600);
    }
    foreach (array_slice(is_array($d['events'] ?? null) ? $d['events'] : [], 0, 40) as $e) {
        if (!is_array($e)) { continue; }
        $tag = strtoupper(so_text($e['tag'] ?? '', 6));
        if (!in_array($tag, SO6_TAGS, true)) { continue; }
        $out['events'][] = ['tag' => $tag, 'label' => so_text($e['label'] ?? '', 120), 'date' => so_text($e['date'] ?? '', 100), 'place' => so_text($e['place'] ?? '', 200), 'note' => so_text($e['note'] ?? '', 1000)];
    }
    return $out;
}

/** ce que la fiche a déjà (balises uniques, prénom, nom, années) */
function so6_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, middle_name, last_name FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
    $e = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.date_text, e.year, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? ORDER BY COALESCE(e.year,9999), e.id");
    $e->execute([$pid]);
    $has = [];
    foreach ($e->fetchAll(PDO::FETCH_ASSOC) as $r) { $t = (string) $r['tag']; if ($t !== '' && !isset($has[$t])) { $has[$t] = ['date' => (string) $r['date_text'], 'year' => (int) $r['year'], 'place' => (string) $r['place']]; } }
    if (isset($has['BAPM']) && !isset($has['CHR'])) { $has['CHR'] = $has['BAPM']; }
    return ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name'] . ' ' . (string) $p['middle_name']), 'last' => (string) $p['last_name'], 'has' => $has,
        'birth_year' => $has['BIRT']['year'] ?? ($has['CHR']['year'] ?? 0), 'death_year' => $has['DEAT']['year'] ?? ($has['BURI']['year'] ?? 0)];
}

/** POST so6_preview : les écarts entre le document et la fiche ; rien n'est écrit */
function so6_preview(PDO $pdo, array $data): array
{
    so6_ready($pdo);
    $c = so6_clean($data);
    if (!$c['person_id']) { return ['ecarts' => $c['place_id'] ? [['level' => 'info', 'text' => 'Le document sera relié au lieu (source et média) ; aucune fiche de personne n’est touchée.']] : [], 'person' => null]; }
    $p = so6_person($pdo, $c['person_id']);
    $f = $c['fields']; $out = [];
    $add = static function (string $level, string $text) use (&$out): void { $out[] = ['level' => $level, 'text' => $text]; };
    if (!empty($f['last']) && $p['last'] !== '' && so_fold($f['last']) !== so_fold($p['last'])) { $add('orange', 'Le document dit « ' . $f['last'] . ' », la fiche « ' . $p['last'] . ' » : est-ce bien la même personne ?'); }
    if (!empty($f['first']) && $p['first'] !== '') {
        $a = explode(' ', so_fold($f['first']))[0]; $b = explode(' ', so_fold($p['first']));
        if ($a !== '' && !in_array($a, $b, true)) { $add('orange', 'Prénom lu « ' . $f['first'] . ' », la fiche dit « ' . $p['first'] . ' ».'); }
    }
    $by = so_year((string) ($f['birth_date'] ?? ''));
    if ($by && $p['birth_year'] && abs($by - (int) $p['birth_year']) > 1) { $add('orange', 'Né en ' . $by . ' d’après le document, en ' . $p['birth_year'] . ' d’après la fiche.'); }
    $dy = so_year((string) ($f['death_date'] ?? ''));
    if ($dy && $p['death_year'] && abs($dy - (int) $p['death_year']) > 1) { $add('orange', 'Mort en ' . $dy . ' d’après le document, en ' . $p['death_year'] . ' d’après la fiche.'); }
    if ($by && $p['death_year'] && $by > (int) $p['death_year']) { $add('orange', 'Le document le fait naître après la mort notée sur la fiche : sûrement un homonyme.'); }
    $names = ['BIRT' => 'une naissance', 'CHR' => 'un baptême', 'DEAT' => 'un décès', 'BURI' => 'une inhumation'];
    foreach ($c['events'] as $e) {
        if (in_array($e['tag'], SO6_UNIQUE, true) && isset($p['has'][$e['tag']])) { $h = $p['has'][$e['tag']]; $add('info', 'La fiche a déjà ' . $names[$e['tag']] . ' (' . trim($h['date'] . ($h['place'] !== '' ? ' à ' . $h['place'] : '')) . ') : elle est gardée telle quelle, aucune autre n’est ajoutée.'); }
        if ($e['tag'] === 'MARR') { $add('info', 'Un mariage se range dans la famille du couple : il n’est pas ajouté ici, il reste écrit dans la source.'); }
    }
    if ($c['url'] !== '') {
        $s = $pdo->prepare('SELECT count(*) FROM sources s JOIN source_links l ON l.source_record_id=s.id WHERE s.url=? AND l.entity_type=\'person\' AND l.entity_id=?');
        $s->execute([$c['url'], $c['person_id']]);
        if ((int) $s->fetchColumn()) { $add('yellow', 'Ce lien est déjà une source de cette fiche : l’importer encore ferait un doublon.'); }
        if ($c['kind'] === 'auteur') {
            $s = $pdo->prepare('SELECT count(*) FROM person_online_sheets WHERE person_id=? AND url=?'); $s->execute([$c['person_id'], $c['url']]);
            if ((int) $s->fetchColumn()) { $add('info', 'Ce lien est déjà dans ses « Fiches en ligne » : il n’y sera pas ajouté deux fois.'); }
        }
    }
    return ['ecarts' => $out, 'person' => ['id' => $p['id'], 'first' => $p['first'], 'last' => $p['last'], 'has' => array_keys($p['has'])]];
}

/** l'identifiant d'un type d'événement de personne : par balise, sinon « Autre » */
function so6_event_type(PDO $pdo, string $tag): int
{
    $try = $tag === 'CHR' ? ['CHR', 'BAPM'] : [$tag];
    foreach ($try as $t) {
        $s = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? AND COALESCE(scope,'person')='person' ORDER BY id LIMIT 1"); $s->execute([$t]);
        if ($id = (int) $s->fetchColumn()) { return $id; }
    }
    $s = $pdo->prepare("SELECT id FROM event_types WHERE COALESCE(scope,'person')='person' AND (gedcom_tag='EVEN' OR lower(label) LIKE 'autre%') ORDER BY (gedcom_tag='EVEN') DESC, id LIMIT 1"); $s->execute();
    return (int) $s->fetchColumn();
}

/** POST so6_import (multipart) */
function so6_import(PDO $pdo, ?array $file, array $data): array
{
    so6_ready($pdo);
    $c = so6_clean($data);
    $pid = $c['person_id']; $placeId = 0;
    if ($pid) {
        if (!person_exists($pdo, $pid)) { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
        assert_person_unlocked($pdo, $pid);
    } elseif ($c['place_id'] && $c['kind'] === 'document') {
        $s = $pdo->prepare('SELECT id FROM places WHERE id=?'); $s->execute([$c['place_id']]); $placeId = (int) $s->fetchColumn();
        if (!$placeId) { throw new RuntimeException('Ce lieu n’existe plus.'); }
    } else { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
    $f = $c['fields'];
    $p = $pid ? so6_person($pdo, $pid) : null;
    $stored = so_store_file($file);
    if (!$stored && $c['url'] === '' && $c['text'] === '' && !$c['events']) { throw new LcndaBadInput('Il faut un fichier, un lien, le texte du document ou au moins une ligne à ajouter.'); }
    $batch = 'so6-' . bin2hex(random_bytes(6));
    $ids = ['media' => [], 'media_links' => [], 'sources' => [], 'source_links' => [], 'events' => [], 'items' => [], 'poilu_units' => [], 'online_sheets' => []];
    $entity = $pid ? 'person' : 'place'; $entityId = $pid ?: $placeId;
    $kindTitle = SO6_LABEL[$c['kind']];
    $siteLabel = SO6_SITE_LABEL[$c['site']] ?? 'Archives en ligne';
    $who = $p ? (trim(($f['first'] ?? '') . ' ' . mb_strtoupper((string) ($f['last'] ?? ''))) ?: trim($p['first'] . ' ' . mb_strtoupper($p['last']))) : so_text($f['place'] ?? '', 200);
    $notes = []; $sid = 0;
    $pdo->beginTransaction();
    try {
        // 1. le fichier → un média relié à la fiche (ou au lieu)
        $mediaId = 0;
        if ($stored) {
            [$mediaFile, $mtype] = $stored;
            $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_reference, document_title, document_url, transcription) VALUES(?,?,?,?,?,?,?,?,?,?)')
                ->execute([so_text($f['media_title'] ?? ($f['title'] ?? ''), 300) ?: $kindTitle . ($who !== '' ? ' — ' . $who : ''), SO_MENTION . '.', $mtype, $mediaFile, $mtype === 'image' ? $mediaFile : '', so_text($f['date'] ?? '', 100),
                    so_text($f['cote'] ?? ($f['ref'] ?? ''), 200), $kindTitle, $c['url'], $c['text']]);
            $mediaId = (int) $pdo->lastInsertId(); $ids['media'][] = $mediaId;
            if ($entity === 'person') { // un lieu n'a pas de médias reliés : le média est relié à la source du lieu (plus bas)
                $pos = $pdo->prepare("SELECT COALESCE(max(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?"); $pos->execute([$entityId]);
                $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$mediaId, $entityId, (float) $pos->fetchColumn()]);
                $ids['media_links'][] = (int) $pdo->lastInsertId();
            }
            log_change($pdo, 'media', $mediaId, 'create', $kindTitle . ' importé(e)' . ($who !== '' ? ' pour ' . $who : ''));
        }
        // 2. les événements cochés — jamais une deuxième naissance, un deuxième décès…, jamais un mariage
        $kept = 0; $marr = 0;
        if ($p) {
            foreach ($c['events'] as $e) {
                if ($e['tag'] === 'MARR') { $marr++; continue; }
                if (in_array($e['tag'], SO6_UNIQUE, true) && isset($p['has'][$e['tag']])) { $kept++; continue; }
                $type = so6_event_type($pdo, $e['tag']);
                if (!$type) { continue; }
                $desc = trim(($e['tag'] === 'EVEN' && $e['label'] !== '' ? $e['label'] . ($e['note'] !== '' ? ' — ' : '') : '') . $e['note']);
                $eid = (int) add_event($pdo, ['person_id' => $pid, 'event_type_id' => $type, 'date_text' => $e['date'], 'place_id' => '', 'place_name' => $e['place'], 'description' => mb_substr($desc, 0, 1000)])['id'];
                $ids['events'][] = $eid;
                if (in_array($e['tag'], SO6_UNIQUE, true)) { $p['has'][$e['tag']] = ['date' => $e['date'], 'year' => 0, 'place' => $e['place']]; }
            }
        }
        if ($ids['events']) { $notes[] = count($ids['events']) . ' événement' . (count($ids['events']) > 1 ? 's' : '') . ' ajouté' . (count($ids['events']) > 1 ? 's' : ''); }
        if ($kept) { $notes[] = $kept . ' déjà sur la fiche, gardé' . ($kept > 1 ? 's' : ''); }
        if ($marr) { $notes[] = 'mariage laissé dans la source (à ranger dans la famille)'; }
        // 3. auteur : la notice dans « Fiches en ligne »
        if ($p && $c['kind'] === 'auteur' && $c['sheet'] && $c['url'] !== '') {
            $s = $pdo->prepare('SELECT count(*) FROM person_online_sheets WHERE person_id=? AND url=?'); $s->execute([$pid, $c['url']]);
            if (!(int) $s->fetchColumn()) {
                $lab = $c['site'] === 'databnf' ? 'data.bnf.fr' : ($c['site'] === 'idref' ? 'IdRef' : 'Notice d’auteur');
                $ident = trim(implode(' · ', array_filter([!empty($f['idref']) ? 'PPN ' . $f['idref'] : '', !empty($f['ark']) ? 'ark ' . $f['ark'] : '', !empty($f['isni']) ? 'ISNI ' . $f['isni'] : ''])));
                $pdo->prepare('INSERT INTO person_online_sheets(person_id,label,site,url,notes,checks_json,created_at,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)')
                    ->execute([$pid, $lab, $lab, $c['url'], trim(SO_MENTION . '.' . ($ident !== '' ? ' ' . $ident : '')), '[]']);
                $ids['online_sheets'][] = (int) $pdo->lastInsertId(); $notes[] = 'notice ajoutée à ses fiches en ligne';
            }
        }
        // 4. la source, avec le lien
        $title = $c['source_title'] !== '' ? $c['source_title'] : $kindTitle . ($who !== '' ? ' — ' . $who : '');
        $text = SO_MENTION . '.' . ($c['text'] !== '' ? "\n\n" . $c['text'] : '');
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')->execute([mb_substr($title, 0, 400), '', $siteLabel, $kindTitle, $c['url'], $text]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $page = so_text($f['cote'] ?? ($f['ref'] ?? ($f['page'] ?? '')), 120);
        $link->execute([$entity, $entityId, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        foreach ($ids['events'] as $eid) { $link->execute(['event', $eid, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mediaId, $sid]); $ids['media_links'][] = (int) $pdo->lastInsertId(); }
        $summary = $kindTitle . ' : ' . implode(', ', array_merge($mediaId ? ['document rangé dans les médias'] : [], ['source créée'], $notes));
        $pdo->prepare('INSERT INTO so_imports(batch, kind, person_id, summary, ids, before_json) VALUES(?,?,?,?,?,?)')
            ->execute([$batch, 'so6_' . $c['kind'], $pid, $summary, json_encode($ids), json_encode(['place_id' => $placeId], JSON_UNESCAPED_UNICODE)]);
        log_change($pdo, $entity, $entityId, 'update', $summary . ' — ' . SO_MENTION);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($stored) { @unlink(MEDIA_DIR . '/' . $stored[0]); }
        throw $e;
    }
    return ['batch' => $batch, 'summary' => $summary, 'media_id' => $ids['media'][0] ?? 0, 'source_id' => $sid, 'events' => $ids['events'], 'online_sheets' => $ids['online_sheets'], 'notes' => $notes];
}

/** POST so6_undo : les fiches en ligne ajoutées s'en vont, puis tout le reste (so_undo) */
function so6_undo(PDO $pdo, array $data): array
{
    so6_ready($pdo);
    $batch = so_text($data['batch'] ?? '', 40);
    if (!preg_match('/^so6-[0-9a-f]{12}$/', $batch)) { throw new LcndaBadInput('Import inconnu.'); }
    $s = $pdo->prepare("SELECT person_id, ids FROM so_imports WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Cet import est déjà annulé, ou introuvable.'); }
    $ids = json_decode((string) $row['ids'], true) ?: [];
    $pid = (int) $row['person_id'];
    if ($pid) { assert_person_unlocked($pdo, $pid); }
    foreach (array_map('intval', $ids['online_sheets'] ?? []) as $id) { $pdo->prepare('DELETE FROM person_online_sheets WHERE id=? AND person_id=?')->execute([$id, $pid]); }
    return so_undo($pdo, ['batch' => $batch]);
}

/** le point d'entrée (api.php) : GET so6_context · POST so6_preview, so6_import (multipart), so6_undo — jamais de requête vers un site */
const SO6_ACTIONS = ['so6_context', 'so6_preview', 'so6_import', 'so6_undo'];
function so6_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action !== 'so6_context') { json_response(['error' => 'Demande inconnue.'], 400); }
            json_response(so6_context($pdo, safe_int($_GET['person_id'] ?? 0)));
        }
        if ($action === 'so6_context') { json_response(['error' => 'Demande inconnue.'], 400); }
        if ($action === 'so6_import') {
            $data = $payload;
            if (isset($payload['data']) && is_string($payload['data'])) { $data = json_decode($payload['data'], true); }
            if (!is_array($data)) { throw new LcndaBadInput('Données de l’import illisibles.'); }
            json_response(['ok' => true, 'result' => so6_import($pdo, $_FILES['file'] ?? null, $data)]);
        }
        json_response(['ok' => true, 'result' => match ($action) { 'so6_preview' => so6_preview($pdo, $payload), 'so6_undo' => so6_undo($pdo, $payload), default => throw new LcndaBadInput('Demande inconnue.') }]);
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422); }
}
