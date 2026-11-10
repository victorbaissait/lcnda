<?php
declare(strict_types=1);

/**
 * 🗂 Archives en ligne (suite) : monuments aux morts (MémorialGenWeb, 1870-1871, victimes civiles 1939-1945), cimetières
 * (Cimetières de France, BillionGraves, relevés collaboratifs ; Find a Grave est dans le 3e lot), communes (Cassini / EHESS : population depuis
 * 1793 et changements de nom), noms (Géopatronyme), protestants réfugiés, rôles d'équipage, archives d'Europe (Matricula,
 * Norvège, Suède, Danemark, Irlande, Porta fontium, Hungaricana, JewishGen). La presse étrangère passe par l'import « presse »
 * commun (lib/sources_ouvertes.php, so_import).
 *
 * Même modèle que lib/sources_ouvertes.php (et SocFace) : le serveur NE SE CONNECTE À AUCUN de ces sites. La page ouvre la
 * recherche dans le navigateur de la personne (adresses : assets/js/app-sources-ouvertes-4-core.js), puis la personne importe
 * ce qu'elle a téléchargé (photo, PDF, page enregistrée, tableau) ou recopie les cases. Rien n'est écrasé : un décès, une
 * sépulture, un baptême déjà sur la fiche sont gardés ; tout reste marqué « à vérifier » (mention SO_MENTION sur la source).
 *
 *  GET  so4_context (person_id)  ce que la fiche apporte (so_context + sépulture + événements déjà là)
 *  GET  so4_place   (place_id)   population gardée, histoire INSEE de la commune (frontières anciennes), imports
 *  POST so4_preview              « c'est la même personne ? » — écarts entre le document et la fiche ; rien n'est écrit
 *  POST so4_import  (multipart)  kind memorial · sepulture · acte : média relié, source avec lien, événement / bloc proposé
 *  POST so4_place_import         population d'une commune (Cassini ou recopiée) ; une année déjà là n'est pas remplacée
 *  POST so4_undo                 ↶ Annuler (ce qu'un import a créé est retiré, rien d'autre)
 */

const SO4_KINDS = ['memorial', 'sepulture', 'acte'];
const SO4_EVENT_TAGS = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CENS', 'RESI', 'EMIG', 'IMMI', 'OCCU', 'NATU', 'CONF', 'EVEN'];
const SO4_UNIQUE_TAGS = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI'];
const SO4_SITES = [
    'memorialgenweb' => ['MémorialGenWeb', 'MémorialGenWeb — relevés des monuments aux morts'],
    'memorialgenweb_commune' => ['MémorialGenWeb', 'MémorialGenWeb — relevés des monuments aux morts'],
    'morts_1870' => ['Morts de la guerre de 1870-1871', 'MémorialGenWeb / Souvenir français'],
    'victimes_civiles_3945' => ['Victimes civiles 1939-1945', 'Mémoire des hommes / MémorialGenWeb'],
    'cimetieres_de_france' => ['Cimetières de France', 'Cimetières de France'],
    'billiongraves' => ['BillionGraves', 'BillionGraves (photos de tombes)'],
    'geneanet_releves' => ['Relevés de tombes', 'Geneanet — relevés collaboratifs de cimetières'],
    'huguenots' => ['Huguenots réfugiés', 'Le Refuge huguenot'],
    'roles_equipage' => ['Rôles d’équipage', 'Archives départementales / Service historique de la Défense'],
    'matricula' => ['Matricula', 'Matricula — registres paroissiaux d’Europe centrale'],
    'digitalarkivet' => ['Digitalarkivet', 'Arkivverket — Digitalarkivet (Norvège)'],
    'riksarkivet' => ['Riksarkivet', 'Riksarkivet (Suède)'],
    'danishfamilysearch' => ['Danish Family Search', 'Danish Family Search (Danemark)'],
    'irishgenealogy' => ['irishgenealogy.ie', 'irishgenealogy.ie (Irlande)'],
    'portafontium' => ['Porta fontium', 'Porta fontium (Bohême, Bavière, Autriche)'],
    'hungaricana' => ['Hungaricana', 'Hungaricana (Hongrie)'],
    'jewishgen' => ['JewishGen', 'JewishGen'],
    'cassini' => ['Cassini / EHESS', 'EHESS — Des villages de Cassini aux communes d’aujourd’hui'],
    'saisie' => ['Saisie', 'Recopié à la main'],
];
/** les noms des journaux étrangers pour l'import « presse » commun (lib/sources_ouvertes.php) */
function so4_press_agencies(): array
{
    return ['chroniclingamerica' => 'Chronicling America (Bibliothèque du Congrès)', 'trove' => 'Trove (Bibliothèque nationale d’Australie)',
        'paperspast' => 'Papers Past (Bibliothèque nationale de Nouvelle-Zélande)', 'delpher' => 'Delpher (Bibliothèque royale des Pays-Bas)'];
}

function so4_schema(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $done = true;
    if (function_exists('so_schema')) { so_schema($pdo); }
    $pdo->exec("CREATE TABLE IF NOT EXISTS place_populations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        population INTEGER NOT NULL,
        origin TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        batch TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(place_id, year))");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_place_populations_place ON place_populations(place_id, year)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS place_former_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        year INTEGER NOT NULL DEFAULT 0,
        origin TEXT NOT NULL DEFAULT '',
        batch TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_place_former_names_place ON place_former_names(place_id)');
}

function so4_text(mixed $v, int $max = 500): string { return function_exists('so_text') ? so_text($v, $max) : mb_substr(trim(is_scalar($v) ? safe_text($v) : ''), 0, $max); }
function so4_url(mixed $v): string { $s = trim(is_scalar($v) ? (string) $v : ''); return preg_match('#^https?://[^\s<>"\'`]+$#i', $s) && strlen($s) <= 2000 ? $s : ''; }
function so4_fold(string $s): string { return function_exists('so_fold') ? so_fold($s) : mb_strtolower(trim($s)); }
function so4_year(string $s): int { return preg_match('/\b(1[5-9]\d\d|20\d\d)\b/', $s, $m) ? (int) $m[1] : 0; }

/** GET so4_context : ce que la fiche apporte à la recherche, sa sépulture et les événements déjà là */
function so4_context(PDO $pdo, int $personId): array
{
    so4_schema($pdo);
    $ctx = so_context($pdo, $personId);
    $g = $pdo->prepare('SELECT g.id, g.cemetery_name, g.city, g.country, g.plan_ref, g.gps_lat, g.gps_lon FROM graves g JOIN grave_persons gp ON gp.grave_id=g.id WHERE gp.person_id=? ORDER BY gp.id LIMIT 1');
    $g->execute([$personId]);
    $ctx['grave'] = $g->fetch(PDO::FETCH_ASSOC) ?: null;
    $ev = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.year, e.date_text AS date, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=? AND e.scope='person'");
    $ev->execute([$personId]);
    $ctx['events'] = $ev->fetchAll(PDO::FETCH_ASSOC);
    $imp = $pdo->prepare("SELECT batch, kind, created_at, summary FROM so_imports WHERE person_id=? AND undone_at='' AND kind LIKE 'so4_%' ORDER BY created_at DESC LIMIT 20");
    $imp->execute([$personId]);
    $ctx['so4_imports'] = $imp->fetchAll(PDO::FETCH_ASSOC);
    return $ctx;
}

/** les champs envoyés par la page, nettoyés et bornés */
function so4_clean(array $d): array
{
    $kind = in_array($d['kind'] ?? '', SO4_KINDS, true) ? (string) $d['kind'] : '';
    if ($kind === '') { throw new LcndaBadInput('Sorte d’import inconnue.'); }
    $site = is_string($d['site'] ?? null) && array_key_exists($d['site'], SO4_SITES) ? $d['site'] : '';
    $f = is_array($d['fields'] ?? null) ? $d['fields'] : [];
    $out = ['kind' => $kind, 'person_id' => safe_int($d['person_id'] ?? 0), 'site' => $site, 'url' => so4_url($d['url'] ?? ''), 'fields' => []];
    $long = ['text', 'bio', 'notes', 'transcript', 'inscription'];
    foreach ($f as $k => $v) {
        if (!is_string($k) || !preg_match('/^[a-z_]{1,40}$/', $k) || count($out['fields']) >= 60) { continue; }
        $out['fields'][$k] = so4_text($v, in_array($k, $long, true) ? 20000 : 500);
    }
    $tag = strtoupper((string) ($d['tag'] ?? ($out['fields']['tag'] ?? '')));
    $out['tag'] = in_array($tag, SO4_EVENT_TAGS, true) ? $tag : '';
    foreach (['add_event', 'set_mpf', 'add_unit', 'add_grave'] as $k) { $out[$k] = !empty($d[$k]) && $d[$k] !== '0'; }
    $out['place_id'] = is_scalar($d['place_id'] ?? null) && preg_match('/^w?\d{1,12}$/', (string) $d['place_id']) ? (string) $d['place_id'] : '';
    foreach (['gps_lat' => 90, 'gps_lon' => 180] as $k => $lim) {
        $v = str_replace(',', '.', (string) ($out['fields'][$k] ?? ''));
        $out['fields'][$k] = is_numeric($v) && abs((float) $v) <= $lim ? (string) (float) $v : '';
    }
    return $out;
}

/** l'événement que l'import proposera (et pourquoi il n'est pas ajouté) */
function so4_event_plan(array $c, array $ctx): array
{
    $f = $c['fields'];
    [$tag, $date, $place] = match ($c['kind']) {
        'memorial' => ['DEAT', (string) ($f['death_date'] ?? ''), (string) ($f['death_place'] ?? '')],
        'sepulture' => ['BURI', (string) ($f['burial_date'] ?? ''), trim((string) ($f['city'] ?? ''))],
        default => [$c['tag'], (string) ($f['date'] ?? ''), (string) ($f['place'] ?? '')],
    };
    if ($tag === '') { return ['tag' => '', 'ok' => false, 'why' => 'Aucune sorte d’acte choisie : seul le document et sa source entrent.']; }
    $have = array_values(array_filter($ctx['events'] ?? [], static fn($e) => $e['tag'] === $tag || ($tag === 'CHR' && $e['tag'] === 'BAPM') || ($tag === 'BAPM' && $e['tag'] === 'CHR')));
    if ($have && in_array($tag, SO4_UNIQUE_TAGS, true)) {
        return ['tag' => $tag, 'ok' => false, 'existing' => $have[0], 'why' => 'La fiche a déjà cet événement (' . trim(($have[0]['date'] ?: '') . ($have[0]['place'] ? ' à ' . $have[0]['place'] : '')) . ') : il est gardé tel quel, rien n’est ajouté.'];
    }
    $y = so4_year($date);
    foreach ($have as $e) { if ($y && (int) $e['year'] === $y) { return ['tag' => $tag, 'ok' => false, 'existing' => $e, 'why' => 'La fiche a déjà cet événement en ' . $y . ' : rien n’est ajouté (pas de doublon).']; } }
    if ($date === '' && $place === '' && $c['place_id'] === '') { return ['tag' => $tag, 'ok' => false, 'why' => 'Ni date ni lieu : l’événement n’est pas ajouté (le document et la source entrent quand même).']; }
    return ['tag' => $tag, 'ok' => true, 'date' => $date, 'place' => $place];
}

/** POST so4_preview : « c'est la même personne ? » — rien n'est écrit */
function so4_preview(PDO $pdo, array $data): array
{
    $c = so4_clean($data);
    $ctx = so4_context($pdo, $c['person_id']);
    $f = $c['fields']; $p = $ctx['person']; $out = [];
    $add = static function (string $level, string $text) use (&$out): void { $out[] = ['level' => $level, 'text' => $text]; };
    if (!empty($f['last']) && $p['last'] !== '' && so4_fold($f['last']) !== so4_fold($p['last'])) { $add('orange', 'Le document dit « ' . $f['last'] . ' », la fiche « ' . $p['last'] . ' » : est-ce bien la même personne ?'); }
    if (!empty($f['first']) && $p['first'] !== '') {
        $a = explode(' ', so4_fold($f['first']))[0]; $b = explode(' ', so4_fold($p['first']));
        if (!in_array($a, $b, true)) { $add('orange', 'Prénom lu « ' . $f['first'] . ' », la fiche dit « ' . $p['first'] . ' ».'); }
    }
    $by = so4_year((string) ($f['birth_date'] ?? ''));
    if ($by && $p['birth_year'] && abs($by - (int) $p['birth_year']) > 1) { $add('orange', 'Né(e) en ' . $by . ' d’après le document, en ' . $p['birth_year'] . ' d’après la fiche.'); }
    $dy = so4_year((string) ($f['death_date'] ?? ''));
    if ($dy && $p['death_year'] && abs($dy - (int) $p['death_year']) > 1) { $add('orange', 'Décès en ' . $dy . ' d’après le document, en ' . $p['death_year'] . ' d’après la fiche.'); }
    $plan = so4_event_plan($c, $ctx);
    if (!$plan['ok'] && $plan['tag'] !== '') { $add(isset($plan['existing']) ? 'info' : 'yellow', $plan['why']); }
    if ($c['kind'] === 'memorial') {
        if ($p['mpf'] === 'no' && ($f['mpf'] ?? '') === 'yes') { $add('orange', 'La fiche dit « pas Mort pour la France » : la case n’est pas changée.'); }
        if (($f['conflict'] ?? '') === '1914-1918' && $p['gender'] === 'female') { $add('yellow', 'La fiche est celle d’une femme : vérifie que c’est la bonne personne.'); }
    }
    if ($c['kind'] === 'sepulture' && $ctx['grave']) {
        $add('info', 'La fiche a déjà une sépulture (' . trim(($ctx['grave']['cemetery_name'] ?: 'cimetière') . ($ctx['grave']['city'] ? ', ' . $ctx['grave']['city'] : '')) . ') : la photo s’y ajoute, ses cases ne changent pas.');
    }
    if ($c['url'] !== '') {
        $s = $pdo->prepare("SELECT count(*) FROM sources s JOIN source_links l ON l.source_record_id=s.id WHERE s.url=? AND l.entity_type='person' AND l.entity_id=?");
        $s->execute([$c['url'], $c['person_id']]);
        if ((int) $s->fetchColumn()) { $add('yellow', 'Ce lien est déjà une source de cette fiche : l’importer encore ferait un doublon.'); }
    }
    return ['ecarts' => $out, 'plan' => $plan, 'context' => $ctx];
}

/** POST so4_import (multipart) : média relié, source avec le lien, événement / bloc proposé — rien d'écrasé */
function so4_import(PDO $pdo, ?array $file, array $data): array
{
    so4_schema($pdo);
    $c = so4_clean($data);
    $pid = $c['person_id'];
    if (!$pid || !person_exists($pdo, $pid)) { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
    assert_person_unlocked($pdo, $pid);
    $f = $c['fields'];
    $ctx = so4_context($pdo, $pid);
    $stored = so_store_file($file);
    if (!$stored && $c['url'] === '' && trim((string) ($f['text'] ?? '')) === '') { throw new LcndaBadInput('Il faut un fichier, un lien ou au moins le texte du document.'); }
    [$siteName, $agency] = SO4_SITES[$c['site']] ?? ['Archives en ligne', 'Archives en ligne'];
    $batch = 'so4-' . bin2hex(random_bytes(6));
    $ids = ['media' => [], 'media_links' => [], 'sources' => [], 'source_links' => [], 'events' => [], 'items' => [], 'poilu_units' => [], 'graves' => [], 'grave_persons' => []];
    $before = []; $notes = [];
    $who = trim(($f['first'] ?? '') . ' ' . mb_strtoupper((string) ($f['last'] ?? ''))) ?: trim($ctx['person']['first'] . ' ' . mb_strtoupper($ctx['person']['last']));
    $plan = so4_event_plan($c, $ctx);
    $kindTitle = match ($c['kind']) { 'memorial' => 'Monument aux morts', 'sepulture' => 'Photo de tombe', default => ($plan['tag'] !== '' ? (['BIRT' => 'Acte de naissance', 'CHR' => 'Acte de baptême', 'BAPM' => 'Acte de baptême', 'DEAT' => 'Acte de décès', 'BURI' => 'Acte d’inhumation', 'CENS' => 'Recensement', 'EMIG' => 'Émigration', 'OCCU' => 'Rôle d’équipage'][$plan['tag']] ?? 'Document') : 'Document') };
    $pdo->beginTransaction();
    try {
        // 1. le fichier → un média relié à la fiche (et à la sépulture pour une photo de tombe)
        $mediaId = 0;
        if ($stored) {
            [$mediaFile, $mtype] = $stored;
            $title = so4_text($f['media_title'] ?? '', 300) ?: $kindTitle . ' — ' . $who . ' (' . $siteName . ')';
            $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_reference, document_title, document_url, transcription) VALUES(?,?,?,?,?,?,?,?,?,?)')
                ->execute([$title, SO_MENTION . '.', $mtype, $mediaFile, $mtype === 'image' ? $mediaFile : '', so4_text($f['date'] ?? ($f['death_date'] ?? ''), 100),
                    so4_text($f['cote'] ?? '', 200), $kindTitle, $c['url'], so4_text($f['transcript'] ?? ($f['text'] ?? ''), 20000)]);
            $mediaId = (int) $pdo->lastInsertId(); $ids['media'][] = $mediaId;
            $pos = $pdo->prepare("SELECT COALESCE(max(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?"); $pos->execute([$pid]);
            $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$mediaId, $pid, (float) $pos->fetchColumn()]);
            $ids['media_links'][] = (int) $pdo->lastInsertId();
            log_change($pdo, 'media', $mediaId, 'create', $kindTitle . ' importé(e) pour ' . $who);
        }
        // 2. l'événement proposé (seulement s'il manque : rien d'écrasé, pas de doublon)
        $eventId = 0;
        if ($c['add_event'] && $plan['ok']) {
            $type = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag=" . $pdo->quote($plan['tag']) . " ORDER BY id LIMIT 1")->fetchColumn();
            if (!$type && $plan['tag'] === 'CHR') { $type = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BAPM' ORDER BY id LIMIT 1")->fetchColumn(); }
            if ($type) {
                $desc = '';
                if ($c['kind'] === 'memorial') { $desc = trim(implode(' — ', array_filter([($f['mpf'] ?? '') === 'yes' ? 'Mort pour la France' : '', ($f['civil'] ?? '') === 'yes' ? 'Victime civile' : '', $f['cause'] ?? '', !empty($f['unit']) ? '(' . $f['unit'] . ')' : '']))); }
                if ($c['kind'] === 'acte') { $desc = trim(implode(' · ', array_filter([$f['occupation'] ?? '', !empty($f['ship']) ? 'navire « ' . $f['ship'] . ' »' : '', !empty($f['father']) ? 'père : ' . $f['father'] : '', !empty($f['mother']) ? 'mère : ' . $f['mother'] : '']))); }
                $eventId = (int) add_event($pdo, ['person_id' => $pid, 'event_type_id' => $type, 'date_text' => so4_text($plan['date'], 100), 'place_id' => $c['place_id'], 'place_name' => so4_text($plan['place'], 200), 'country' => so4_text($f['country'] ?? 'France', 80) ?: 'France', 'description' => mb_substr($desc, 0, 500)])['id'];
                $ids['events'][] = $eventId; $notes[] = ['DEAT' => 'décès ajouté', 'BURI' => 'inhumation ajoutée', 'BIRT' => 'naissance ajoutée', 'CHR' => 'baptême ajouté', 'BAPM' => 'baptême ajouté', 'CENS' => 'recensement ajouté', 'EMIG' => 'émigration ajoutée', 'IMMI' => 'immigration ajoutée', 'RESI' => 'résidence ajoutée', 'OCCU' => 'profession ajoutée'][$plan['tag']] ?? 'événement ajouté';
            }
        } elseif ($c['add_event'] && $plan['tag'] !== '') { $notes[] = 'événement déjà sur la fiche, gardé'; }
        // 3. selon la sorte
        if ($c['kind'] === 'memorial') {
            if ($c['set_mpf'] && ($f['mpf'] ?? '') === 'yes') {
                if (in_array($ctx['person']['mpf'], ['', 'unknown'], true)) {
                    $before['mpf'] = $ctx['person']['mpf'];
                    $pdo->prepare("UPDATE persons SET mort_pour_la_france='yes', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([$pid]);
                    $notes[] = 'case « Mort pour la France » cochée';
                } elseif ($ctx['person']['mpf'] !== 'yes') { $notes[] = 'case « Mort pour la France » laissée telle quelle'; }
            }
            $unit = so4_text($f['unit'] ?? '', 200);
            if ($c['add_unit'] && $unit !== '' && ($f['conflict'] ?? '1914-1918') === '1914-1918') {
                $has = false; foreach ($ctx['units'] as $u) { if (so4_fold((string) $u['unit_name']) === so4_fold($unit)) { $has = true; } }
                if (!$has) {
                    $pdo->prepare('INSERT INTO poilu_units(person_id, unit_name, date_from, date_to, jmo_cote, jmo_url, note, position) VALUES(?,?,?,?,?,?,?,?)')->execute([$pid, $unit, '', '', '', '', 'D’après le relevé ' . $siteName, count($ctx['units'])]);
                    $ids['poilu_units'][] = (int) $pdo->lastInsertId(); $notes[] = 'unité ajoutée au bloc Poilu';
                    $flag = (int) $pdo->query('SELECT COALESCE(show_poilu_block,0) FROM persons WHERE id=' . $pid)->fetchColumn();
                    if (!$flag) { $before['show_poilu_block'] = 0; $pdo->prepare('UPDATE persons SET show_poilu_block=1 WHERE id=?')->execute([$pid]); }
                }
            }
        } elseif ($c['kind'] === 'sepulture') {
            $graveId = (int) ($ctx['grave']['id'] ?? 0);
            if (!$graveId && $c['add_grave'] && (trim((string) ($f['cemetery'] ?? '')) !== '' || trim((string) ($f['city'] ?? '')) !== '')) {
                $pdo->prepare('INSERT INTO graves(cemetery_name,city,country,address,plan_ref,gps_lat,gps_lon,condition_state,grave_exists,notes) VALUES(?,?,?,?,?,?,?,?,?,?)')
                    ->execute([so4_text($f['cemetery'] ?? '', 200), so4_text($f['city'] ?? '', 200), so4_text($f['country'] ?? '', 80), '', so4_text($f['plot'] ?? '', 200),
                        $f['gps_lat'] !== '' ? (float) $f['gps_lat'] : null, $f['gps_lon'] !== '' ? (float) $f['gps_lon'] : null, 'inconnu', 1, SO_MENTION . ' (' . $siteName . ').']);
                $graveId = (int) $pdo->lastInsertId(); $ids['graves'][] = $graveId;
                $pdo->prepare('INSERT INTO grave_persons(grave_id,person_id,position) VALUES(?,?,0)')->execute([$graveId, $pid]); $ids['grave_persons'][] = (int) $pdo->lastInsertId();
                log_change($pdo, 'grave', $graveId, 'create', 'Sépulture ajoutée d’après ' . $siteName);
                $notes[] = 'sépulture ajoutée (bloc Cimetière)';
            }
            if ($graveId && $mediaId) {
                $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'grave', ?, 0)")->execute([$mediaId, $graveId]);
                $ids['media_links'][] = (int) $pdo->lastInsertId(); $notes[] = 'photo rangée dans « Photos datées » de la sépulture';
            }
        }
        // 4. la source, avec le lien ; reliée à la fiche, à l'événement créé et au média
        $what = match ($c['kind']) {
            'memorial' => $siteName . ' — ' . $who . (!empty($f['monument']) ? ', monument de ' . $f['monument'] : '') . (!empty($f['death_date']) ? ', décédé(e) le ' . $f['death_date'] : ''),
            'sepulture' => 'Sépulture de ' . $who . (!empty($f['cemetery']) ? ' — ' . $f['cemetery'] : '') . (!empty($f['city']) ? ', ' . $f['city'] : '') . ' (' . $siteName . ')',
            default => $kindTitle . ' — ' . $who . (!empty($f['date']) ? ', ' . $f['date'] : '') . (!empty($f['place']) ? ', ' . $f['place'] : '') . ' (' . $siteName . ')',
        };
        $text = SO_MENTION . '.' . (trim((string) ($f['bio'] ?? '')) !== '' ? "\n\n" . so4_text($f['bio'], 20000) : '') . (trim((string) ($f['text'] ?? '')) !== '' ? "\n\n" . so4_text($f['text'], 20000) : '');
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')->execute([mb_substr($what, 0, 400), '', $agency, so4_text($f['register'] ?? ($f['conflict'] ?? ''), 200), $c['url'], $text]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $link = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $page = so4_text($f['page'] ?? ($f['cote'] ?? ''), 120);
        $link->execute(['person', $pid, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId();
        if ($eventId) { $link->execute(['event', $eventId, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mediaId, $sid]); $ids['media_links'][] = (int) $pdo->lastInsertId(); }
        $summary = $siteName . ' : ' . implode(', ', array_merge($mediaId ? ['document rangé dans les médias'] : [], ['source créée'], $notes));
        $pdo->prepare('INSERT INTO so_imports(batch, kind, person_id, summary, ids, before_json) VALUES(?,?,?,?,?,?)')
            ->execute([$batch, 'so4_' . $c['kind'], $pid, $summary, json_encode($ids), json_encode($before, JSON_UNESCAPED_UNICODE)]);
        log_change($pdo, 'person', $pid, 'update', $summary . ' — ' . SO_MENTION);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($stored) { @unlink(MEDIA_DIR . '/' . $stored[0]); }
        throw $e;
    }
    return ['batch' => $batch, 'summary' => $summary, 'media_id' => $ids['media'][0] ?? 0, 'source_id' => $sid, 'event_id' => $eventId, 'grave_id' => $ids['graves'][0] ?? 0, 'notes' => $notes];
}

/** GET so4_place : la population gardée, les anciens noms, l'histoire INSEE (frontières anciennes) et les imports */
function so4_place(PDO $pdo, int $placeId): array
{
    so4_schema($pdo);
    $s = $pdo->prepare("SELECT id, name, COALESCE(county,'') AS county, COALESCE(state,'') AS state, COALESCE(country,'') AS country, COALESCE(admin4_code,'') AS insee, COALESCE(admin2_code,'') AS dept, COALESCE(population,0) AS population_now FROM places WHERE id=?");
    $s->execute([$placeId]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Lieu introuvable.'); }
    $rows = $pdo->prepare('SELECT year, population AS pop, origin, url FROM place_populations WHERE place_id=? ORDER BY year'); $rows->execute([$placeId]);
    $names = $pdo->prepare('SELECT name, year, origin FROM place_former_names WHERE place_id=? ORDER BY year, id'); $names->execute([$placeId]);
    $history = []; $installed = false;
    if (function_exists('cp_front_communes') && preg_match('/^\d[\dAB]\d{3}$/', (string) $p['insee'])) {
        try { $h = cp_front_communes(['code' => $p['insee']]); $installed = (bool) $h['installed']; $history = $h['items'] ?? []; } catch (Throwable $_) {}
    } elseif (function_exists('cp_front_installed')) { $installed = cp_front_installed(); }
    $imports = $pdo->prepare("SELECT batch, created_at, summary FROM so_imports WHERE kind='so4_population' AND person_id=0 AND undone_at='' AND ids LIKE ? ORDER BY created_at DESC LIMIT 10");
    $imports->execute(['%"place":' . $placeId . ',%']);
    return ['place' => $p, 'rows' => $rows->fetchAll(PDO::FETCH_ASSOC), 'names' => $names->fetchAll(PDO::FETCH_ASSOC), 'history' => array_slice($history, 0, 40), 'front_installed' => $installed, 'imports' => $imports->fetchAll(PDO::FETCH_ASSOC)];
}

/** POST so4_place_import : la population d'une commune (Cassini ou recopiée) et ses anciens noms ; une année déjà là est gardée */
function so4_place_import(PDO $pdo, array $data): array
{
    so4_schema($pdo);
    $placeId = safe_int($data['place_id'] ?? 0);
    $chk = $pdo->prepare('SELECT name FROM places WHERE id=?'); $chk->execute([$placeId]); $name = $chk->fetchColumn();
    if ($name === false) { throw new RuntimeException('Choisis d’abord la commune.'); }
    $site = in_array($data['site'] ?? '', ['cassini', 'saisie'], true) ? (string) $data['site'] : 'saisie';
    $url = so4_url($data['url'] ?? '');
    $rows = is_array($data['rows'] ?? null) ? array_slice($data['rows'], 0, 400) : [];
    $names = is_array($data['names'] ?? null) ? array_slice($data['names'], 0, 40) : [];
    $have = []; $q = $pdo->prepare('SELECT year, population FROM place_populations WHERE place_id=?'); $q->execute([$placeId]);
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) { $have[(int) $r['year']] = (int) $r['population']; }
    $haveNames = []; $q = $pdo->prepare('SELECT name FROM place_former_names WHERE place_id=?'); $q->execute([$placeId]);
    foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $n) { $haveNames[so4_fold((string) $n)] = true; }
    $batch = 'so4-' . bin2hex(random_bytes(6));
    $ids = ['place' => $placeId, 'populations' => [], 'names' => []]; $kept = []; $added = 0;
    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare('INSERT INTO place_populations(place_id, year, population, origin, url, note, batch) VALUES(?,?,?,?,?,?,?)');
        foreach ($rows as $r) {
            if (!is_array($r)) { continue; }
            $y = safe_int($r['year'] ?? 0); $n = safe_int($r['pop'] ?? -1, -1);
            if ($y < 1700 || $y > 2100 || $n < 0 || $n > 20000000) { continue; }
            if (array_key_exists($y, $have)) { if ($have[$y] !== $n) { $kept[] = ['year' => $y, 'kept' => $have[$y], 'new' => $n]; } continue; }
            $ins->execute([$placeId, $y, $n, $site, $url, SO_MENTION, $batch]); $ids['populations'][] = (int) $pdo->lastInsertId(); $have[$y] = $n; $added++;
        }
        $insN = $pdo->prepare('INSERT INTO place_former_names(place_id, name, year, origin, batch) VALUES(?,?,?,?,?)');
        foreach ($names as $r) {
            $nm = so4_text(is_array($r) ? ($r['name'] ?? '') : $r, 120); $y = is_array($r) ? safe_int($r['year'] ?? 0) : 0;
            if ($nm === '' || isset($haveNames[so4_fold($nm)]) || so4_fold($nm) === so4_fold((string) $name)) { continue; }
            $insN->execute([$placeId, $nm, $y >= 1700 && $y <= 2100 ? $y : 0, $site, $batch]); $ids['names'][] = (int) $pdo->lastInsertId(); $haveNames[so4_fold($nm)] = true;
        }
        if (!$added && !$ids['names']) { $pdo->rollBack(); return ['batch' => '', 'added' => 0, 'names' => 0, 'kept' => $kept, 'summary' => 'Rien de nouveau : tout était déjà là.']; }
        $summary = ($site === 'cassini' ? 'Cassini (EHESS)' : 'Saisie') . ' — ' . $name . ' : ' . $added . ' année' . ($added > 1 ? 's' : '') . ' de population' . ($ids['names'] ? ', ' . count($ids['names']) . ' ancien' . (count($ids['names']) > 1 ? 's' : '') . ' nom' . (count($ids['names']) > 1 ? 's' : '') : '');
        $pdo->prepare('INSERT INTO so_imports(batch, kind, person_id, summary, ids, before_json) VALUES(?,?,?,?,?,?)')->execute([$batch, 'so4_population', 0, $summary, json_encode($ids), '{}']);
        log_change($pdo, 'place', $placeId, 'update', $summary);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return ['batch' => $batch, 'added' => $added, 'names' => count($ids['names']), 'kept' => $kept, 'summary' => $summary];
}

/** POST so4_undo : ↶ Annuler — la population et la sépulture créées ici, puis le reste par so_undo (lib/sources_ouvertes.php) */
function so4_undo(PDO $pdo, array $data): array
{
    so4_schema($pdo);
    $batch = so4_text($data['batch'] ?? '', 40);
    $s = $pdo->prepare("SELECT * FROM so_imports WHERE batch=? AND undone_at='' AND kind LIKE 'so4_%'"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Cet import est déjà annulé, ou introuvable.'); }
    $ids = json_decode((string) $row['ids'], true) ?: [];
    if ($row['kind'] === 'so4_population') {
        $pdo->beginTransaction();
        try {
            foreach (array_map('intval', $ids['populations'] ?? []) as $id) { $pdo->prepare('DELETE FROM place_populations WHERE id=? AND batch=?')->execute([$id, $batch]); }
            foreach (array_map('intval', $ids['names'] ?? []) as $id) { $pdo->prepare('DELETE FROM place_former_names WHERE id=? AND batch=?')->execute([$id, $batch]); }
            $pdo->prepare('UPDATE so_imports SET undone_at=CURRENT_TIMESTAMP WHERE batch=?')->execute([$batch]);
            log_change($pdo, 'place', (int) ($ids['place'] ?? 0), 'update', 'Import de population annulé');
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
        return ['batch' => $batch, 'undone' => true];
    }
    $pid = (int) $row['person_id'];
    assert_person_unlocked($pdo, $pid);
    if (!empty($ids['graves']) || !empty($ids['grave_persons'])) {
        $pdo->beginTransaction();
        try {
            foreach (array_map('intval', $ids['grave_persons'] ?? []) as $id) { $pdo->prepare('DELETE FROM grave_persons WHERE id=? AND person_id=?')->execute([$id, $pid]); }
            foreach (array_map('intval', $ids['graves'] ?? []) as $id) {
                $n = $pdo->prepare('SELECT count(*) FROM grave_persons WHERE grave_id=?'); $n->execute([$id]);
                if ((int) $n->fetchColumn()) { continue; } // une autre personne y a été ajoutée entre-temps : la sépulture reste
                $mine = implode(',', array_map('intval', $ids['media_links'] ?? [])) ?: '0';
                $m = $pdo->prepare("SELECT count(*) FROM media_links WHERE entity_type='grave' AND entity_id=? AND id NOT IN ($mine)"); $m->execute([$id]);
                if ((int) $m->fetchColumn()) { continue; } // d'autres photos y ont été rangées : gardée
                $pdo->prepare('DELETE FROM graves WHERE id=?')->execute([$id]);
                log_change($pdo, 'grave', $id, 'delete', 'Import d’archives en ligne annulé');
            }
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    }
    return so_undo($pdo, ['batch' => $batch]);
}

/** le point d'entrée (api.php) */
const SO4_ACTIONS = ['so4_context', 'so4_place', 'so4_preview', 'so4_import', 'so4_place_import', 'so4_undo'];
function so4_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            json_response(match ($action) {
                'so4_context' => so4_context($pdo, safe_int($_GET['person_id'] ?? 0)),
                'so4_place' => so4_place($pdo, safe_int($_GET['place_id'] ?? 0)),
                default => throw new LcndaBadInput('Demande inconnue.'),
            });
        }
        if ($action === 'so4_import') {
            $data = $payload;
            if (isset($payload['data']) && is_string($payload['data'])) { $data = json_decode($payload['data'], true); }
            if (!is_array($data)) { throw new LcndaBadInput('Données de l’import illisibles.'); }
            json_response(['ok' => true, 'result' => so4_import($pdo, $_FILES['file'] ?? null, $data)]);
        }
        json_response(['ok' => true, 'result' => match ($action) {
            'so4_preview' => so4_preview($pdo, $payload), 'so4_place_import' => so4_place_import($pdo, $payload), 'so4_undo' => so4_undo($pdo, $payload),
            default => throw new LcndaBadInput('Demande inconnue.'),
        }]);
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422); }
}
