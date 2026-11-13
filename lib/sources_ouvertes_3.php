<?php
declare(strict_types=1);

/**
 * 🌍 Archives en ligne, troisième lot : prisonniers 14-18 (CICR), anciens députés et sénateurs, brevets d'invention (INPI),
 * thèses de médecine, École polytechnique, CTHS, Archives de Paris, Joconde, Internet Archive / Persée, Antenati, PARES,
 * Torre do Tombo, Arolsen, Open Archives, Geneteka, FreeBMD / FreeCEN, BAnQ, Bibliothèque et Archives Canada, NARA,
 * Find a Grave, Yad Vashem (Justes parmi les nations).
 *
 * Même modèle que lib/sources_ouvertes.php (Mémoire des hommes, Léonore…) dont il reprend la table so_imports, le
 * rangement du fichier (so_store_file) et « ↶ Annuler » (so_undo) : le serveur NE SE CONNECTE À AUCUN de ces sites.
 * Adresses et lecture des fichiers : assets/js/app-sources-ouvertes-3-core.js.
 *
 * POST so3_preview : « c'est la même personne ? » + ce que la fiche a déjà — rien n'est écrit.
 * POST so3_import (multipart : « file » facultatif + « data » en JSON) :
 *   - le fichier → un média relié à la fiche ; une source avec le lien, la mention « à vérifier », reliée à la fiche,
 *     aux événements créés et au média ;
 *   - les événements COCHÉS (naissance, baptême, décès, inhumation : seulement si la fiche n'en a pas ; résidence,
 *     profession, recensement, « Prisonnier de guerre »…) — un mariage n'est jamais créé ici (il se range dans la famille) ;
 *   - les blocs COCHÉS : 💡 invention avec son brevet (profil inventeur coché si besoin), 🏛 mandat (profil politique),
 *     🎓 diplôme (thèse, Polytechnique), 🏆 récompense (Juste parmi les nations), unité du bloc Poilu (CICR).
 * POST so3_undo : retire tout (so_undo) et décoche les profils que l'import avait cochés.
 */

const SO3_KINDS = ['cicr', 'elu', 'brevet', 'these', 'polytechnique', 'cths', 'joconde', 'findagrave', 'freecen', 'freebmd', 'openarchives', 'juste', 'arolsen', 'acte', 'electeur', 'livre'];
const SO3_SITES = ['cicr_pg', 'sycomore', 'senat_anciens', 'inpi_brevets19', 'biusante_theses', 'biusante_bio', 'polytechnique', 'cths', 'paris_ec', 'paris_electeurs', 'joconde', 'archiveorg_local', 'persee',
    'antenati_nom', 'pares', 'torre_tombo', 'arolsen_fr', 'openarchives', 'geneteka', 'freebmd', 'freecen', 'banq', 'bac_lac', 'nara', 'findagrave', 'yv_justes'];
const SO3_LABEL = ['cicr' => 'Fiche de prisonnier (CICR)', 'elu' => 'Fiche d’élu', 'brevet' => 'Brevet d’invention', 'these' => 'Thèse de médecine', 'polytechnique' => 'Registre de l’École polytechnique',
    'cths' => 'Annuaire des sociétés savantes (CTHS)', 'joconde' => 'Œuvre d’un musée (Joconde)', 'findagrave' => 'Tombe (Find a Grave)', 'freecen' => 'Recensement britannique (FreeCEN)', 'freebmd' => 'Index FreeBMD',
    'openarchives' => 'Acte (Open Archives)', 'juste' => 'Juste parmi les nations (Yad Vashem)', 'arolsen' => 'Document des Arolsen Archives', 'acte' => 'Acte d’état civil ou paroissial', 'electeur' => 'Liste électorale', 'livre' => 'Livre ou article'];
/** balises qu'une fiche n'a qu'une fois : jamais une deuxième */
const SO3_UNIQUE = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI'];
const SO3_TAGS = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'RESI', 'OCCU', 'CENS', 'EVEN', 'POW', 'MARR', 'MARB'];
const SO3_BLOCKS = ['military', 'sciences', 'education', 'awards', 'politic'];

function so3_ready(PDO $pdo): void
{
    if (!function_exists('so_schema')) { require_once __DIR__ . '/sources_ouvertes.php'; }
    so_schema($pdo);
}

/** les champs envoyés par la page, nettoyés et bornés */
function so3_clean(array $d): array
{
    $kind = in_array($d['kind'] ?? '', SO3_KINDS, true) ? (string) $d['kind'] : '';
    if ($kind === '') { throw new LcndaBadInput('Sorte d’import inconnue.'); }
    $site = in_array($d['site'] ?? '', SO3_SITES, true) ? (string) $d['site'] : '';
    $out = ['kind' => $kind, 'site' => $site, 'person_id' => safe_int($d['person_id'] ?? 0), 'url' => so_url($d['url'] ?? ''), 'fields' => [], 'events' => [], 'blocks' => [],
        'source_title' => so_text($d['source_title'] ?? '', 300), 'text' => so_text($d['text'] ?? '', 20000)];
    foreach ((is_array($d['fields'] ?? null) ? $d['fields'] : []) as $k => $v) {
        if (!is_string($k) || !preg_match('/^[a-z_]{1,40}$/', $k) || count($out['fields']) >= 60) { continue; }
        $out['fields'][$k] = so_text($v, 600);
    }
    foreach (array_slice(is_array($d['events'] ?? null) ? $d['events'] : [], 0, 50) as $e) {
        if (!is_array($e)) { continue; }
        $tag = strtoupper(so_text($e['tag'] ?? '', 6));
        if (!in_array($tag, SO3_TAGS, true)) { continue; }
        $out['events'][] = ['tag' => $tag, 'label' => so_text($e['label'] ?? '', 120), 'date' => so_text($e['date'] ?? '', 100), 'place' => so_text($e['place'] ?? '', 200), 'note' => so_text($e['note'] ?? '', 1000)];
    }
    foreach ((is_array($d['blocks'] ?? null) ? $d['blocks'] : []) as $b) { if (in_array($b, SO3_BLOCKS, true) && !in_array($b, $out['blocks'], true)) { $out['blocks'][] = $b; } }
    return $out;
}

/** ce que la fiche a déjà (balises uniques, prénom, nom, année de naissance) */
function so3_person(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT id, first_name, middle_name, last_name, gender, living_status FROM persons WHERE id=?'); $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
    $e = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.date_text, e.year, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? ORDER BY COALESCE(e.year,9999), e.id");
    $e->execute([$pid]);
    $has = [];
    foreach ($e->fetchAll(PDO::FETCH_ASSOC) as $r) { $t = (string) $r['tag']; if ($t !== '' && !isset($has[$t])) { $has[$t] = ['date' => (string) $r['date_text'], 'year' => (int) $r['year'], 'place' => (string) $r['place']]; } }
    return ['id' => (int) $p['id'], 'first' => trim((string) $p['first_name'] . ' ' . (string) $p['middle_name']), 'last' => (string) $p['last_name'], 'gender' => (string) $p['gender'],
        'living' => (string) $p['living_status'], 'has' => $has, 'birth_year' => $has['BIRT']['year'] ?? ($has['CHR']['year'] ?? ($has['BAPM']['year'] ?? 0))];
}

/** POST so3_preview : les écarts entre le document et la fiche ; rien n'est écrit */
function so3_preview(PDO $pdo, array $data): array
{
    so3_ready($pdo);
    $c = so3_clean($data);
    $p = so3_person($pdo, $c['person_id']);
    $f = $c['fields']; $out = [];
    $add = static function (string $level, string $text) use (&$out): void { $out[] = ['level' => $level, 'text' => $text]; };
    if (!empty($f['last']) && $p['last'] !== '' && so_fold($f['last']) !== so_fold($p['last'])) { $add('orange', 'Le document dit « ' . $f['last'] . ' », la fiche « ' . $p['last'] . ' » : est-ce bien la même personne ?'); }
    if (!empty($f['first']) && $p['first'] !== '') {
        $a = explode(' ', so_fold($f['first']))[0]; $b = explode(' ', so_fold($p['first']));
        if ($a !== '' && !in_array($a, $b, true)) { $add('orange', 'Prénom lu « ' . $f['first'] . ' », la fiche dit « ' . $p['first'] . ' ».'); }
    }
    $by = so_year((string) ($f['birth_date'] ?? ($f['birth'] ?? '')));
    if ($by && $p['birth_year'] && abs($by - (int) $p['birth_year']) > 1) { $add('orange', 'Né en ' . $by . ' d’après le document, en ' . $p['birth_year'] . ' d’après la fiche.'); }
    $names = ['BIRT' => 'une naissance', 'CHR' => 'un baptême', 'BAPM' => 'un baptême', 'DEAT' => 'un décès', 'BURI' => 'une inhumation'];
    foreach ($c['events'] as $e) {
        if (in_array($e['tag'], SO3_UNIQUE, true) && isset($p['has'][$e['tag']])) { $h = $p['has'][$e['tag']]; $add('info', 'La fiche a déjà ' . $names[$e['tag']] . ' (' . trim($h['date'] . ($h['place'] !== '' ? ' à ' . $h['place'] : '')) . ') : elle est gardée telle quelle, aucune autre n’est ajoutée.'); }
        if (in_array($e['tag'], ['MARR', 'MARB'], true)) { $add('info', 'Un mariage se range dans la famille du couple : il n’est pas ajouté ici, il reste écrit dans la source.'); }
    }
    if ($c['kind'] === 'arolsen' || $c['kind'] === 'juste') { $add('info', 'Ces archives touchent aux persécutions : elles restent sobres, et ne sont jamais reprises dans les jeux.'); }
    if ($c['url'] !== '') {
        $s = $pdo->prepare('SELECT count(*) FROM sources s JOIN source_links l ON l.source_record_id=s.id WHERE s.url=? AND l.entity_type=\'person\' AND l.entity_id=?');
        $s->execute([$c['url'], $c['person_id']]);
        if ((int) $s->fetchColumn()) { $add('yellow', 'Ce lien est déjà une source de cette fiche : l’importer encore ferait un doublon.'); }
    }
    return ['ecarts' => $out, 'person' => ['id' => $p['id'], 'first' => $p['first'], 'last' => $p['last'], 'has' => array_keys($p['has'])]];
}

/** l'identifiant d'un type d'événement de personne : par balise, sinon par nom */
function so3_event_type(PDO $pdo, string $tag, string $label): int
{
    if ($tag === 'POW') {
        $s = $pdo->prepare("SELECT id FROM event_types WHERE COALESCE(scope,'person')='person' AND lower(label) LIKE 'prisonnier%' ORDER BY id LIMIT 1"); $s->execute();
        if ($id = (int) $s->fetchColumn()) { return $id; }
        $tag = 'EVEN';
    }
    if ($tag === 'BAPM') { $tag = 'CHR'; }
    if ($tag === 'EVEN') {
        $s = $pdo->prepare("SELECT id FROM event_types WHERE COALESCE(scope,'person')='person' AND (lower(label) LIKE 'autre%' OR gedcom_tag='EVEN') ORDER BY (lower(label) LIKE 'autre%') DESC, id LIMIT 1"); $s->execute();
        return (int) $s->fetchColumn();
    }
    $s = $pdo->prepare("SELECT id FROM event_types WHERE gedcom_tag=? AND COALESCE(scope,'person')='person' ORDER BY id LIMIT 1"); $s->execute([$tag]);
    return (int) $s->fetchColumn();
}

/** les profils de la fiche (pour décocher à l'annulation ceux que l'import a cochés) */
function so3_profiles(PDO $pdo, int $pid): array
{
    try { $s = $pdo->prepare('SELECT profile_key FROM person_profiles WHERE person_id=?'); $s->execute([$pid]); return array_map('strval', $s->fetchAll(PDO::FETCH_COLUMN)); } catch (Throwable $_) { return []; }
}

/** POST so3_import (multipart) */
function so3_import(PDO $pdo, ?array $file, array $data): array
{
    so3_ready($pdo);
    $c = so3_clean($data);
    $pid = $c['person_id'];
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
    assert_person_unlocked($pdo, $pid);
    $f = $c['fields'];
    $p = so3_person($pdo, $pid);
    $stored = so_store_file($file);
    if (!$stored && $c['url'] === '' && $c['text'] === '' && !$c['events']) { throw new LcndaBadInput('Il faut un fichier, un lien, le texte du document ou au moins une ligne à ajouter.'); }
    $batch = 'so3-' . bin2hex(random_bytes(6));
    $ids = ['media' => [], 'media_links' => [], 'sources' => [], 'source_links' => [], 'events' => [], 'items' => [], 'poilu_units' => []];
    $before = ['profiles' => so3_profiles($pdo, $pid)];
    $kindTitle = SO3_LABEL[$c['kind']];
    $who = trim(($f['first'] ?? '') . ' ' . mb_strtoupper((string) ($f['last'] ?? ''))) ?: trim($p['first'] . ' ' . mb_strtoupper($p['last']));
    $notes = [];
    $pdo->beginTransaction();
    try {
        // 1. le fichier → un média relié à la fiche
        $mediaId = 0; $mediaFile = '';
        if ($stored) {
            [$mediaFile, $mtype] = $stored;
            $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_reference, document_title, document_url, transcription) VALUES(?,?,?,?,?,?,?,?,?,?)')
                ->execute([so_text($f['media_title'] ?? '', 300) ?: $kindTitle . ' — ' . $who, SO_MENTION . '.', $mtype, $mediaFile, $mtype === 'image' ? $mediaFile : '', so_text($f['date'] ?? '', 100),
                    so_text($f['cote'] ?? ($f['number'] ?? ($f['matricule'] ?? '')), 200), $kindTitle, $c['url'], $c['text']]);
            $mediaId = (int) $pdo->lastInsertId(); $ids['media'][] = $mediaId;
            $pos = $pdo->prepare("SELECT COALESCE(max(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?"); $pos->execute([$pid]);
            $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$mediaId, $pid, (float) $pos->fetchColumn()]);
            $ids['media_links'][] = (int) $pdo->lastInsertId();
            log_change($pdo, 'media', $mediaId, 'create', $kindTitle . ' importé(e) pour ' . $who);
        }
        // 2. les événements cochés — jamais une deuxième naissance, un deuxième décès…
        $kept = 0; $marr = 0;
        foreach ($c['events'] as $e) {
            if (in_array($e['tag'], ['MARR', 'MARB'], true)) { $marr++; continue; }
            if (in_array($e['tag'], SO3_UNIQUE, true) && (isset($p['has'][$e['tag']]) || ($e['tag'] === 'BAPM' && isset($p['has']['CHR'])))) { $kept++; continue; }
            $type = so3_event_type($pdo, $e['tag'], $e['label']);
            if (!$type) { continue; }
            $desc = trim(($e['tag'] === 'EVEN' && $e['label'] !== '' ? $e['label'] . ($e['note'] !== '' ? ' — ' : '') : '') . $e['note']);
            $eid = (int) add_event($pdo, ['person_id' => $pid, 'event_type_id' => $type, 'date_text' => $e['date'], 'place_id' => '', 'place_name' => $e['place'], 'description' => mb_substr($desc, 0, 1000)])['id'];
            $ids['events'][] = $eid;
            if (in_array($e['tag'], SO3_UNIQUE, true)) { $p['has'][$e['tag']] = ['date' => $e['date'], 'year' => 0, 'place' => $e['place']]; }
        }
        if ($ids['events']) { $notes[] = count($ids['events']) . ' événement' . (count($ids['events']) > 1 ? 's' : '') . ' ajouté' . (count($ids['events']) > 1 ? 's' : ''); }
        if ($kept) { $notes[] = $kept . ' déjà sur la fiche, gardé' . ($kept > 1 ? 's' : ''); }
        if ($marr) { $notes[] = 'mariage laissé dans la source (à ranger dans la famille)'; }
        // 3. les blocs cochés
        $src = ['cicr' => 'Archives du CICR (Genève)', 'brevet' => 'INPI — brevets du XIXe siècle', 'these' => 'Thèse (Sudoc, BIU Santé)', 'polytechnique' => 'Bibliothèque de l’École polytechnique', 'juste' => 'Yad Vashem', 'elu' => 'Sycomore (Assemblée nationale) / Sénat'][$c['kind']] ?? $kindTitle;
        if (in_array('sciences', $c['blocks'], true) && $c['kind'] === 'brevet') {
            $patent = array_filter(['country' => 'FR', 'no' => so_text($f['number'] ?? '', 60), 'filed' => so_text($f['date'] ?? '', 100), 'applicant' => so_text($f['inventor'] ?? $who, 200), 'title' => so_text($f['title'] ?? '', 300),
                'end' => so_text($f['duration'] ?? '', 60), 'url' => $c['url'], 'doc' => $src], static fn($v) => $v !== '');
            $r = art_save_item($pdo, ['person_id' => $pid, 'kind' => 'invention', 'make_profile' => 1, 'data' => ['title' => so_text($f['title'] ?? '', 300) ?: 'Invention (brevet ' . ($f['number'] ?? '') . ')', 'patents' => [$patent],
                'notes' => SO_MENTION . '.']]);
            $ids['items'][] = (int) $r['id']; $notes[] = 'invention ajoutée avec son brevet (💡)';
        }
        if (in_array('politic', $c['blocks'], true) && $c['kind'] === 'elu') {
            $r = art_save_item($pdo, ['person_id' => $pid, 'kind' => 'pol_mandate', 'data' => ['title' => so_text($f['mandates'] ?? '', 300) ?: 'Mandat de parlementaire', 'institution' => so_text($f['institution'] ?? '', 200),
                'constituency' => so_text($f['dept'] ?? '', 200), 'group' => so_text($f['group'] ?? '', 200), 'notes' => SO_MENTION . '.' . ($c['url'] !== '' ? "\n" . $c['url'] : '')]]);
            $ids['items'][] = (int) $r['id']; $notes[] = 'mandat ajouté (🏛 profil politique)';
        }
        if (in_array('education', $c['blocks'], true) && in_array($c['kind'], ['these', 'polytechnique'], true)) {
            if (!function_exists('blocs_save_item')) { require_once __DIR__ . '/blocs.php'; }
            $d = $c['kind'] === 'these'
                ? ['dkind' => 'autre', 'title' => 'Doctorat en médecine', 'specialty' => so_text($f['title'] ?? '', 300), 'date' => so_text($f['year'] ?? '', 100), 'mention' => so_text($f['faculty'] ?? '', 200), 'source' => $src . (!empty($f['cote']) ? ', cote ' . $f['cote'] : '')]
                : ['dkind' => 'autre', 'title' => 'École polytechnique' . (!empty($f['promotion']) ? ' — promotion ' . $f['promotion'] : ''), 'date' => so_text($f['promotion'] ?? ($f['entry'] ?? ''), 100), 'mention' => so_text(trim(($f['entry'] ?? '') . (!empty($f['exit']) ? ' · sortie : ' . $f['exit'] : '')), 300),
                    'source' => $src . (!empty($f['matricule']) ? ', matricule ' . $f['matricule'] : '')];
            $d['notes'] = SO_MENTION . '.' . ($c['url'] !== '' ? "\n" . $c['url'] : '');
            if ($mediaId) { $d['doc'] = ['mid' => $mediaId, 'f' => $mediaFile, 'title' => $kindTitle]; }
            $ids['items'][] = (int) blocs_save_item($pdo, ['person_id' => $pid, 'kind' => 'diploma', 'data' => $d])['id']; $notes[] = 'diplôme ajouté (🎓)';
        }
        if (in_array('awards', $c['blocks'], true) && $c['kind'] === 'juste') {
            if (!function_exists('blocs_save_item')) { require_once __DIR__ . '/blocs.php'; }
            $d = ['category' => 'decoration', 'level' => 'international', 'title' => 'Juste parmi les nations', 'date' => so_text($f['date'] ?? '', 100), 'org' => 'Yad Vashem', 'dossier' => $c['url'],
                'source' => 'Yad Vashem' . (!empty($f['file']) ? ', dossier ' . $f['file'] : ''), 'notes' => SO_MENTION . '.' . (!empty($f['rescued']) ? "\nPersonnes sauvées : " . $f['rescued'] : '')];
            if ($mediaId) { $d['photo'] = ['mid' => $mediaId, 'f' => $mediaFile, 'title' => $kindTitle]; }
            $ids['items'][] = (int) blocs_save_item($pdo, ['person_id' => $pid, 'kind' => 'award', 'data' => $d])['id']; $notes[] = 'récompense ajoutée (🏆 Juste parmi les nations)';
        }
        if (in_array('military', $c['blocks'], true) && $c['kind'] === 'cicr' && ($unit = so_text($f['unit'] ?? '', 200)) !== '') {
            $u = $pdo->prepare('SELECT unit_name FROM poilu_units WHERE person_id=?'); $u->execute([$pid]);
            $has = false; foreach ($u->fetchAll(PDO::FETCH_COLUMN) as $n) { if (so_fold((string) $n) === so_fold($unit)) { $has = true; } }
            if (!$has) {
                $pdo->prepare('INSERT INTO poilu_units(person_id, unit_name, date_from, date_to, jmo_cote, jmo_url, note, position) VALUES(?,?,?,?,?,?,?,?)')->execute([$pid, $unit, '', '', '', '', 'D’après la fiche de prisonnier du CICR', 99]);
                $ids['poilu_units'][] = (int) $pdo->lastInsertId(); $notes[] = 'unité ajoutée au bloc Poilu';
                $flag = (int) $pdo->query('SELECT COALESCE(show_poilu_block,0) FROM persons WHERE id=' . $pid)->fetchColumn();
                if (!$flag) { $before['show_poilu_block'] = 0; $pdo->prepare('UPDATE persons SET show_poilu_block=1 WHERE id=?')->execute([$pid]); }
            }
        }
        // 4. la source, avec le lien
        $siteLabel = ['cicr_pg' => 'Comité international de la Croix-Rouge — prisonniers de la Grande Guerre', 'sycomore' => 'Assemblée nationale — base Sycomore', 'senat_anciens' => 'Sénat — anciens sénateurs',
            'inpi_brevets19' => 'INPI — brevets 1791-1902', 'biusante_theses' => 'Sudoc / BIU Santé', 'biusante_bio' => 'BIU Santé', 'polytechnique' => 'École polytechnique', 'cths' => 'CTHS — La France savante',
            'paris_ec' => 'Archives de Paris', 'paris_electeurs' => 'Archives de Paris', 'joconde' => 'Ministère de la Culture — Joconde (POP)', 'archiveorg_local' => 'Internet Archive', 'persee' => 'Persée',
            'antenati_nom' => 'Portale Antenati (Italie)', 'pares' => 'PARES (Espagne)', 'torre_tombo' => 'Arquivo Nacional Torre do Tombo (Portugal)', 'arolsen_fr' => 'Arolsen Archives', 'openarchives' => 'Open Archives (Pays-Bas, Flandre)',
            'geneteka' => 'Geneteka (Pologne)', 'freebmd' => 'FreeBMD', 'freecen' => 'FreeCEN', 'banq' => 'BAnQ', 'bac_lac' => 'Bibliothèque et Archives Canada', 'nara' => 'NARA (États-Unis)', 'findagrave' => 'Find a Grave', 'yv_justes' => 'Yad Vashem'][$c['site']] ?? 'Archives en ligne';
        $title = $c['source_title'] !== '' ? $c['source_title'] : $kindTitle . ' — ' . $who;
        $text = SO_MENTION . '.' . ($c['text'] !== '' ? "\n\n" . $c['text'] : '');
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')->execute([mb_substr($title, 0, 400), '', $siteLabel, $kindTitle, $c['url'], $text]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $page = so_text($f['cote'] ?? ($f['number'] ?? ($f['matricule'] ?? ($f['memorial'] ?? ''))), 120);
        $link->execute(['person', $pid, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        foreach ($ids['events'] as $eid) { $link->execute(['event', $eid, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mediaId, $sid]); $ids['media_links'][] = (int) $pdo->lastInsertId(); }
        $after = so3_profiles($pdo, $pid);
        $before['profiles_added'] = array_values(array_diff($after, $before['profiles']));
        $summary = $kindTitle . ' : ' . implode(', ', array_merge($mediaId ? ['document rangé dans les médias'] : [], ['source créée'], $notes));
        $pdo->prepare('INSERT INTO so_imports(batch, kind, person_id, summary, ids, before_json) VALUES(?,?,?,?,?,?)')
            ->execute([$batch, $c['kind'], $pid, $summary, json_encode($ids), json_encode($before, JSON_UNESCAPED_UNICODE)]);
        log_change($pdo, 'person', $pid, 'update', $summary . ' — ' . SO_MENTION);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($stored) { @unlink(MEDIA_DIR . '/' . $stored[0]); }
        throw $e;
    }
    return ['batch' => $batch, 'summary' => $summary, 'media_id' => $ids['media'][0] ?? 0, 'source_id' => $sid, 'events' => $ids['events'], 'items' => $ids['items'], 'notes' => $notes];
}

/** POST so3_undo : tout ce que l'import a ajouté s'en va (so_undo), puis les profils qu'il avait cochés sont décochés */
function so3_undo(PDO $pdo, array $data): array
{
    so3_ready($pdo);
    $batch = so_text($data['batch'] ?? '', 40);
    if (!preg_match('/^so3-[0-9a-f]{12}$/', $batch)) { throw new LcndaBadInput('Import inconnu.'); }
    $s = $pdo->prepare("SELECT person_id, before_json FROM so_imports WHERE batch=? AND undone_at=''"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Cet import est déjà annulé, ou introuvable.'); }
    $r = so_undo($pdo, ['batch' => $batch]);
    $before = json_decode((string) $row['before_json'], true) ?: [];
    $pid = (int) $row['person_id'];
    foreach (array_map('strval', (array) ($before['profiles_added'] ?? [])) as $key) {
        // décoché seulement s'il ne reste aucune fiche de ce profil (une ajoutée entre-temps le garde)
        $kinds = $key === 'inventor' ? ['invention', 'profile_inventor'] : ($key === 'politic' || $key === 'elu_local' ? ['pol_mandate', 'pol_election', 'pol_party', 'pol_text', 'pol_speech', 'pol_affair'] : []);
        if ($kinds) { $n = $pdo->prepare('SELECT count(*) FROM items WHERE person_id=? AND type_key IN (' . implode(',', array_fill(0, count($kinds), '?')) . ')'); $n->execute([$pid, ...$kinds]); if ((int) $n->fetchColumn()) { continue; } }
        $pdo->prepare('DELETE FROM person_profiles WHERE person_id=? AND profile_key=?')->execute([$pid, $key]);
    }
    return $r;
}

/** le point d'entrée (api.php) : POST so3_preview, so3_import (multipart), so3_undo */
const SO3_ACTIONS = ['so3_preview', 'so3_import', 'so3_undo'];
function so3_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) { json_response(['error' => 'Demande inconnue.'], 400); }
        if ($action === 'so3_import') {
            $data = $payload;
            if (isset($payload['data']) && is_string($payload['data'])) { $data = json_decode($payload['data'], true); }
            if (!is_array($data)) { throw new LcndaBadInput('Données de l’import illisibles.'); }
            json_response(['ok' => true, 'result' => so3_import($pdo, $_FILES['file'] ?? null, $data)]);
        }
        json_response(['ok' => true, 'result' => match ($action) { 'so3_preview' => so3_preview($pdo, $payload), 'so3_undo' => so3_undo($pdo, $payload), default => throw new LcndaBadInput('Demande inconnue.') }]);
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422); }
}

/** les fiches qui ont reçu un document des Arolsen Archives (persécutions) : comme les déportés, jamais dans un jeu */
function so3_respect_ids(PDO $pdo): array
{
    $out = [];
    try { foreach ($pdo->query("SELECT DISTINCT person_id FROM so_imports WHERE kind='arolsen' AND undone_at=''")->fetchAll(PDO::FETCH_COLUMN) as $id) { $out[(int) $id] = true; } } catch (Throwable $_) {}
    return $out;
}
