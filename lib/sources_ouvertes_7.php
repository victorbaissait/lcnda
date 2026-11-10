<?php
declare(strict_types=1);

/**
 * 🌍 Archives en ligne, 7e lot : Archives Portal Europe, Justes parmi les nations (Comité français pour Yad Vashem), enfants
 * trouvés et Assistance publique, MonumentsMorts (université de Lille), relevés des cercles généalogiques, aide par lieu
 * (FamilySearch Wiki, GenWiki, GOV), Allemagne (CompGen, Archion), cadastres anciens (Archivní mapy, Mapire), Arcanum ADT,
 * Ancestry Library Edition.
 *
 * Même modèle que lib/sources_ouvertes.php (dont il reprend la table so_imports, le rangement du fichier so_store_file et
 * « ↶ Annuler » so_undo) : le serveur NE SE CONNECTE À AUCUN de ces sites. La page ouvre la recherche dans le navigateur de
 * la personne (adresses : assets/js/app-sources-ouvertes-7-core.js), puis la personne importe ce qu'elle a téléchargé.
 * Rien n'est écrasé : un événement unique déjà là (naissance, baptême, décès, inhumation), une distinction déjà notée, un
 * placement de même matricule sont gardés ; tout reste « à vérifier » (mention SO_MENTION sur la source et le média).
 * La presse hongroise (Arcanum ADT) passe par l'import « presse » commun (so_import).
 *
 *  POST so7_preview              « c'est la même personne ? » — écarts entre le document et la fiche ; rien n'est écrit
 *  POST so7_import (multipart)   kind acte · juste · enfant · monument · carte : média relié (fiche et/ou lieu), source
 *                                avec le lien, et ce qui est coché (événement, récompense « Juste », placement)
 *  POST so7_undo                 ↶ Annuler (le placement créé ici, puis le reste par so_undo)
 * so7_respect_ids() : les fiches reconnues « Juste parmi les nations » → jamais dans un jeu (mode simple, Trésors).
 */

const SO7_KINDS = ['acte', 'juste', 'enfant', 'monument', 'carte'];
const SO7_EVENT_TAGS = ['BIRT', 'CHR', 'DEAT', 'BURI', 'RESI', 'OCCU', 'EVEN'];
const SO7_UNIQUE_TAGS = ['BIRT', 'CHR', 'DEAT', 'BURI'];
const SO7_JUSTE = 'Juste parmi les nations';
const SO7_SITES = [
    'ape' => ['Archives Portal Europe', 'Archives Portal Europe (archives de 30 pays)'],
    'cfyv_justes' => ['Comité français pour Yad Vashem', 'Comité français pour Yad Vashem'],
    'monumentsmorts' => ['MonumentsMorts', 'MonumentsMorts — université de Lille'],
    'ap_paris' => ['Archives de Paris', 'Archives de Paris — enfants trouvés et assistés'],
    'enfants_fa' => ['FranceArchives', 'Archives départementales (via FranceArchives) — enfants assistés'],
    'cercle_dept' => ['Cercle généalogique', 'Relevés d’un cercle généalogique'],
    'compgen_ofb' => ['CompGen', 'CompGen — Online-OFB (livres des familles)'],
    'archion' => ['Archion', 'Archion — registres paroissiaux protestants (Allemagne)'],
    'archivni_mapy' => ['Archivní mapy', 'ČÚZK — Archivní mapy (cadastre ancien)'],
    'mapire' => ['Mapire', 'Arcanum — Mapire (cartes anciennes)'],
    'ancestry_library' => ['Ancestry Library Edition', 'Ancestry Library Edition (en bibliothèque)'],
    'saisie' => ['Saisie', 'Recopié à la main'],
];

function so7_text(mixed $v, int $max = 500): string { return so_text($v, $max); }

/** la fiche telle que l'import la voit */
function so7_person(PDO $pdo, int $pid): ?array
{
    if ($pid <= 0) { return null; }
    $s = $pdo->prepare('SELECT id, first_name, middle_name, last_name, gender, COALESCE(is_locked,0) AS locked FROM persons WHERE id=?');
    $s->execute([$pid]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { return null; }
    $ev = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND e.scope='person'");
    $ev->execute([$pid]);
    $has = []; $by = 0;
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) { $has[(string) $e['tag']] = true; if (in_array($e['tag'], ['BIRT', 'CHR'], true) && !$by) { $by = (int) $e['year']; } }
    $hasJuste = false; try { $j = $pdo->prepare("SELECT count(*) FROM items WHERE person_id=? AND type_key='award' AND (title LIKE ? OR data LIKE ?)"); $j->execute([$pid, '%' . SO7_JUSTE . '%', '%' . SO7_JUSTE . '%']); $hasJuste = (int) $j->fetchColumn() > 0; } catch (Throwable $_) {}
    $mats = []; try { $m = $pdo->prepare('SELECT matricule FROM child_placements WHERE person_id=?'); $m->execute([$pid]); $mats = array_values(array_filter(array_map('strval', $m->fetchAll(PDO::FETCH_COLUMN)))); } catch (Throwable $_) {}
    return ['id' => (int) $p['id'], 'first' => trim($p['first_name'] . ' ' . $p['middle_name']), 'last' => (string) $p['last_name'], 'gender' => (string) $p['gender'],
        'locked' => (int) $p['locked'] === 1, 'birth_year' => $by ?: null, 'has' => $has, 'hasJuste' => $hasJuste, 'matricules' => $mats];
}

/** les champs envoyés par la page, nettoyés et bornés */
function so7_clean(array $d): array
{
    $kind = in_array($d['kind'] ?? '', SO7_KINDS, true) ? (string) $d['kind'] : '';
    if ($kind === '') { throw new LcndaBadInput('Sorte d’import inconnue.'); }
    $site = is_string($d['site'] ?? null) && array_key_exists($d['site'], SO7_SITES) ? $d['site'] : 'saisie';
    $f = is_array($d['fields'] ?? null) ? $d['fields'] : [];
    $out = ['kind' => $kind, 'person_id' => safe_int($d['person_id'] ?? 0), 'place_id' => is_scalar($d['place_id'] ?? null) && preg_match('/^w?\d{1,12}$/', (string) $d['place_id']) ? (string) $d['place_id'] : '', 'site' => $site, 'url' => so_url($d['url'] ?? ''),
        'same' => ($d['same'] ?? 'yes') === 'no' ? 'no' : 'yes', 'fields' => [], 'adds' => []];
    $long = ['text', 'saved', 'inscription', 'outcome'];
    foreach ($f as $k => $v) {
        if (!is_string($k) || !preg_match('/^[a-z_]{1,40}$/', $k) || count($out['fields']) >= 60) { continue; }
        $out['fields'][$k] = so7_text($v, in_array($k, $long, true) ? 20000 : 500);
    }
    $tag = strtoupper((string) ($out['fields']['type'] ?? ''));
    $out['tag'] = in_array($tag, SO7_EVENT_TAGS, true) ? $tag : '';
    foreach ((array) ($d['adds'] ?? []) as $k => $v) { if (in_array($k, ['event', 'award', 'placement'], true)) { $out['adds'][$k] = !empty($v) && $v !== '0'; } }
    return $out;
}

/** POST so7_preview : « c'est la même personne ? » — rien n'est écrit */
function so7_preview(PDO $pdo, array $data): array
{
    so_schema($pdo);
    $c = so7_clean($data);
    $p = so7_person($pdo, $c['person_id']);
    $f = $c['fields']; $out = [];
    $add = static function (string $level, string $text) use (&$out): void { $out[] = ['level' => $level, 'text' => $text]; };
    if ($p) {
        if (!empty($f['last']) && $p['last'] !== '' && so_fold($f['last']) !== so_fold($p['last'])) { $add('orange', 'Le document dit « ' . $f['last'] . ' », la fiche « ' . $p['last'] . ' » : est-ce bien la même personne ?'); }
        if (!empty($f['first']) && $p['first'] !== '') { $a = explode(' ', so_fold($f['first']))[0]; if (!in_array($a, explode(' ', so_fold($p['first'])), true)) { $add('orange', 'Prénom lu « ' . $f['first'] . ' », la fiche dit « ' . $p['first'] . ' ».'); } }
        $by = so_year((string) ($f['birth_date'] ?? ''));
        if ($by && $p['birth_year'] && abs($by - (int) $p['birth_year']) > 1) { $add('orange', 'Né en ' . $by . ' d’après le document, en ' . $p['birth_year'] . ' d’après la fiche.'); }
        $dy = so_year((string) ($f['date'] ?? ($f['admission'] ?? '')));
        if ($dy && $p['birth_year'] && $dy < (int) $p['birth_year'] - 1 && in_array($c['kind'], ['acte', 'enfant', 'juste'], true) && $c['tag'] !== 'BIRT' && $c['tag'] !== 'CHR') { $add('orange', 'Le document est daté de ' . $dy . ', avant la naissance notée sur la fiche (' . $p['birth_year'] . ').'); }
        if ($c['kind'] === 'acte' && $c['tag'] && in_array($c['tag'], SO7_UNIQUE_TAGS, true) && !empty($p['has'][$c['tag']])) { $add('info', 'La fiche a déjà cet événement : il est gardé, rien n’est remplacé.'); }
        if ($c['kind'] === 'juste') { $add('info', 'Ces archives touchent aux persécutions : elles restent sobres, et la fiche ne sera plus reprise dans les jeux.'); if ($p['hasJuste']) { $add('yellow', 'La fiche porte déjà la distinction « Juste parmi les nations » : elle n’est pas ajoutée une deuxième fois.'); } }
        if ($c['kind'] === 'enfant' && !empty($f['matricule']) && in_array(so_fold($f['matricule']), array_map('so_fold', $p['matricules']), true)) { $add('yellow', 'Un placement avec ce matricule est déjà noté : il est gardé.'); }
        if ($p['locked']) { $add('orange', 'La fiche est verrouillée : déverrouille-la pour importer.'); }
    }
    if ($c['url'] !== '' && $c['person_id']) {
        $s = $pdo->prepare('SELECT count(*) FROM sources s JOIN source_links l ON l.source_record_id=s.id WHERE s.url=? AND l.entity_type=\'person\' AND l.entity_id=?');
        $s->execute([$c['url'], $c['person_id']]);
        if ((int) $s->fetchColumn()) { $add('yellow', 'Ce lien est déjà une source de cette fiche : l’importer encore ferait un doublon.'); }
    }
    return ['person' => $p, 'ecarts' => $out];
}

/** POST so7_import (multipart) */
function so7_import(PDO $pdo, ?array $file, array $data): array
{
    so_schema($pdo);
    $c = so7_clean($data);
    $pid = $c['person_id'];
    $placeId = 0;
    if ($c['place_id'] !== '') {
        if (ctype_digit($c['place_id'])) { $q = $pdo->prepare('SELECT id FROM places WHERE id=?'); $q->execute([(int) $c['place_id']]); $placeId = (int) $q->fetchColumn(); }
        elseif (function_exists('place_id_from_data')) { $placeId = (int) (place_id_from_data($pdo, ['place_id' => $c['place_id'], 'place_name' => '']) ?? 0); }
    } // une commune « pas encore dans ta base » y entre une fois choisie
    $needPerson = in_array($c['kind'], ['acte', 'juste', 'enfant'], true);
    if ($pid && !person_exists($pdo, $pid)) { throw new RuntimeException('Fiche introuvable : elle a peut-être été supprimée.'); }
    if ($needPerson && !$pid) { throw new RuntimeException('Choisis d’abord la fiche à qui ce document se rapporte.'); }
    if (!$needPerson && !$pid && !$placeId) { throw new RuntimeException('Choisis le lieu (ou la fiche) que ce document complète.'); }
    if ($c['place_id'] !== '' && !$placeId) { throw new RuntimeException('Lieu introuvable.'); }
    if ($pid) { assert_person_unlocked($pdo, $pid); }
    $f = $c['fields'];
    $p = so7_person($pdo, $pid);
    $stored = so_store_file($file);
    if (!$stored && $c['url'] === '' && trim((string) ($f['text'] ?? '')) === '') { throw new LcndaBadInput('Il faut un fichier, un lien ou au moins le texte du document.'); }
    $apply = $c['same'] === 'yes';
    $batch = 'so7-' . bin2hex(random_bytes(6));
    $ids = ['media' => [], 'media_links' => [], 'sources' => [], 'source_links' => [], 'events' => [], 'items' => [], 'placements' => []];
    $before = []; $notes = [];
    [$siteShort, $agency] = SO7_SITES[$c['site']];
    $who = $p ? trim($p['first'] . ' ' . mb_strtoupper($p['last'])) : '';
    $kindTitle = ['acte' => 'Document d’archives', 'juste' => 'Juste parmi les nations', 'enfant' => 'Dossier d’enfant assisté', 'monument' => 'Monument aux morts', 'carte' => 'Plan cadastral'][$c['kind']];
    $placeName = '';
    if ($placeId) { $pn = $pdo->prepare('SELECT name FROM places WHERE id=?'); $pn->execute([$placeId]); $placeName = (string) $pn->fetchColumn(); }
    $pdo->beginTransaction();
    try {
        // 1. le fichier → un média relié à la fiche et/ou au lieu
        $mediaId = 0; $mediaFile = '';
        if ($stored) {
            [$mediaFile, $mtype] = $stored;
            $title = so7_text($f['media_title'] ?? '', 300) ?: $kindTitle . ' — ' . ($who ?: ($placeName ?: so7_text($f['commune'] ?? ($f['territory'] ?? ''), 120)));
            $pdo->prepare('INSERT INTO media(title, description, media_type, filename, thumbnail, date_text, document_reference, document_title, document_url, transcription, place_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$title, SO_MENTION . '.', $mtype, $mediaFile, $mtype === 'image' ? $mediaFile : '', so7_text($f['date'] ?? ($f['admission'] ?? ''), 100),
                    so7_text($f['cote'] ?? ($f['matricule'] ?? ($f['file'] ?? ($f['parcel'] ?? ''))), 200), $kindTitle, $c['url'], so7_text($f['inscription'] ?? ($f['text'] ?? ''), 20000), $placeId ?: null]);
            $mediaId = (int) $pdo->lastInsertId(); $ids['media'][] = $mediaId;
            $link = static function (string $type, int $id) use ($pdo, $mediaId, &$ids): void {
                $pos = $pdo->prepare('SELECT COALESCE(max(position),0)+1 FROM media_links WHERE entity_type=? AND entity_id=?'); $pos->execute([$type, $id]);
                $pdo->prepare('INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?,?,?,?)')->execute([$mediaId, $type, $id, (float) $pos->fetchColumn()]);
                $ids['media_links'][] = (int) $pdo->lastInsertId();
            };
            if ($pid) { $link('person', $pid); }
            log_change($pdo, 'media', $mediaId, 'create', $kindTitle . ' importé(e)' . ($who ? ' pour ' . $who : ''));
        }
        // 2. ce qui est coché (seulement si « c'est bien elle »)
        $eventId = 0;
        if ($apply && $pid && $c['kind'] === 'acte' && $c['tag'] && ($c['adds']['event'] ?? true) && (($f['date'] ?? '') !== '' || ($f['place'] ?? '') !== '')) {
            if (in_array($c['tag'], SO7_UNIQUE_TAGS, true) && !empty($p['has'][$c['tag']])) { $notes[] = 'événement déjà sur la fiche, gardé'; }
            else {
                $t = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $t->execute([$c['tag']]); $type = (int) $t->fetchColumn();
                if ($type) {
                    $desc = trim(implode(' · ', array_filter([$c['tag'] === 'EVEN' ? so7_text($f['tag_text'] ?? '', 120) : '', !empty($f['father']) ? 'Père : ' . $f['father'] : '', !empty($f['mother']) ? 'Mère : ' . $f['mother'] : ''])));
                    $eventId = (int) add_event($pdo, ['person_id' => $pid, 'event_type_id' => $type, 'date_text' => so7_text($f['date'] ?? '', 100), 'place_name' => so7_text($f['place'] ?? '', 200), 'description' => $desc])['id'];
                    $ids['events'][] = $eventId; $notes[] = 'événement ajouté';
                }
            }
        }
        if ($apply && $pid && $c['kind'] === 'juste' && ($c['adds']['award'] ?? true)) {
            if ($p['hasJuste']) { $notes[] = 'distinction déjà sur la fiche, gardée'; }
            else {
                if (!function_exists('blocs_save_item')) { require_once __DIR__ . '/blocs.php'; }
                $d = ['category' => 'decoration', 'level' => 'international', 'title' => SO7_JUSTE, 'date' => so7_text($f['date'] ?? '', 100), 'org' => 'Yad Vashem (Jérusalem) — Comité français pour Yad Vashem',
                    'dossier' => $c['url'], 'source' => trim('Comité français pour Yad Vashem' . (!empty($f['file']) ? ', dossier n° ' . $f['file'] : '')),
                    'notes' => trim((!empty($f['place']) ? 'Commune : ' . $f['place'] . "\n" : '') . (!empty($f['saved']) ? 'Personnes aidées : ' . $f['saved'] . "\n" : '') . SO_MENTION . '.')];
                if ($mediaId) { $d['photo'] = ['mid' => $mediaId, 'f' => $mediaFile, 'title' => $kindTitle]; }
                $ids['items'][] = (int) blocs_save_item($pdo, ['person_id' => $pid, 'kind' => 'award', 'data' => $d])['id'];
                $notes[] = 'distinction ajoutée (🏆 Concours et récompenses)';
            }
        }
        if ($apply && $pid && $c['kind'] === 'enfant' && ($c['adds']['placement'] ?? true)) {
            $mat = so7_text($f['matricule'] ?? '', 60);
            if ($mat !== '' && in_array(so_fold($mat), array_map('so_fold', $p['matricules']), true)) { $notes[] = 'placement de même matricule déjà noté, gardé'; }
            else {
                $pk = in_array($f['pkind'] ?? '', ['abandon', 'assistance', 'hospice', 'nourrice'], true) ? $f['pkind'] : 'assistance';
                $start = so7_text($f['admission'] ?? '', 100); $end = so7_text($f['end'] ?? '', 100);
                $pdo->prepare('INSERT INTO child_placements(person_id, kind, institution, matricule, start_date, start_year, end_date, end_year, place_text, nurse_name, outcome, notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
                    ->execute([$pid, $pk, so7_text($f['institution'] ?? '', 200) ?: ($c['site'] === 'ap_paris' ? 'Assistance publique de Paris' : ''), $mat, $start, so_year($start) ?: null, $end, so_year($end) ?: null,
                        so7_text($f['placed'] ?? '', 200), so7_text($f['nurse'] ?? '', 200), so7_text($f['outcome'] ?? '', 2000), SO_MENTION . '.' . ($c['url'] !== '' ? "\n" . $c['url'] : '')]);
                $plId = (int) $pdo->lastInsertId(); $ids['placements'][] = $plId;
                if ($mediaId) { $pdo->prepare("INSERT INTO family_collection_media(collection_type, collection_id, media_id, position) VALUES('placement', ?, ?, 0)")->execute([$plId, $mediaId]); } // la vignette du placement (lib/heritage.php)
                $flag = (int) $pdo->query('SELECT COALESCE(show_placement_block,0) FROM persons WHERE id=' . $pid)->fetchColumn();
                if (!$flag) { $before['show_placement_block'] = 0; $pdo->prepare('UPDATE persons SET show_placement_block=1 WHERE id=?')->execute([$pid]); }
                $notes[] = 'placement ajouté (👶 Enfant placé)';
            }
        }
        if (!$apply && $needPerson) { $notes[] = 'rien d’ajouté à la fiche (pas sûr que ce soit la même personne)'; }
        // 3. la source, avec le lien ; reliée à la fiche, au lieu, à l'événement créé et au média
        $who2 = trim(($f['first'] ?? '') . ' ' . mb_strtoupper((string) ($f['last'] ?? ''))) ?: $who;
        $srcTitle = match ($c['kind']) {
            'monument' => 'Monument aux morts' . ((($f['commune'] ?? '') ?: $placeName) !== '' ? ' de ' . (($f['commune'] ?? '') ?: $placeName) : ''),
            'carte' => 'Plan cadastral' . ((($f['territory'] ?? '') ?: $placeName) !== '' ? ' — ' . (($f['territory'] ?? '') ?: $placeName) : '') . (!empty($f['date']) ? ' (' . $f['date'] . ')' : ''),
            'enfant' => 'Enfant assisté' . (!empty($f['matricule']) ? ', matricule ' . $f['matricule'] : '') . ($who2 !== '' ? ' — ' . $who2 : ''),
            'juste' => SO7_JUSTE . ($who2 !== '' ? ' — ' . $who2 : '') . (!empty($f['file']) ? ' (dossier ' . $f['file'] . ')' : ''),
            default => trim(($f['tag_text'] ?? '') ?: 'Document d’archives') . ($who2 !== '' ? ' — ' . $who2 : '') . (!empty($f['date']) ? ', ' . $f['date'] : ''),
        };
        $text = SO_MENTION . '.' . (trim((string) ($f['text'] ?? '')) !== '' ? "\n\n" . so7_text($f['text'], 20000) : '');
        $pdo->prepare('INSERT INTO sources(title, author, agency, publication, url, text) VALUES(?,?,?,?,?,?)')
            ->execute([mb_substr($srcTitle, 0, 400), '', so7_text($f['archive'] ?? '', 200) ?: $agency, $siteShort, $c['url'], $text]);
        $sid = (int) $pdo->lastInsertId(); $ids['sources'][] = $sid;
        $sl = $pdo->prepare('INSERT INTO source_links(entity_type, entity_id, source_record_id, page, quality, note) VALUES(?,?,?,?,?,?)');
        $page = so7_text($f['cote'] ?? ($f['matricule'] ?? ($f['file'] ?? ($f['sheet'] ?? ''))), 120);
        if ($pid) { $sl->execute(['person', $pid, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($placeId) { $sl->execute(['place', $placeId, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($eventId) { $sl->execute(['event', $eventId, $sid, $page, '', SO_MENTION]); $ids['source_links'][] = (int) $pdo->lastInsertId(); }
        if ($mediaId) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'source', ?, 0)")->execute([$mediaId, $sid]); $ids['media_links'][] = (int) $pdo->lastInsertId(); }
        $summary = $siteShort . ' : ' . implode(', ', array_merge($mediaId ? ['document rangé dans les médias'] : [], ['source créée'], $notes));
        $pdo->prepare('INSERT INTO so_imports(batch, kind, person_id, summary, ids, before_json) VALUES(?,?,?,?,?,?)')
            ->execute([$batch, 'so7_' . $c['kind'], $pid, $summary, json_encode($ids), json_encode($before, JSON_UNESCAPED_UNICODE)]);
        if ($pid) { log_change($pdo, 'person', $pid, 'update', $summary . ' — ' . SO_MENTION); }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if ($stored) { @unlink(MEDIA_DIR . '/' . $stored[0]); }
        throw $e;
    }
    return ['batch' => $batch, 'summary' => $summary, 'media_id' => $ids['media'][0] ?? 0, 'source_id' => $sid, 'event_id' => $eventId, 'item_id' => $ids['items'][0] ?? 0,
        'placement_id' => $ids['placements'][0] ?? 0, 'notes' => $notes];
}

/** POST so7_undo : le placement créé ici, puis tout le reste par so_undo */
function so7_undo(PDO $pdo, array $data): array
{
    so_schema($pdo);
    $batch = so7_text($data['batch'] ?? '', 40);
    $s = $pdo->prepare("SELECT * FROM so_imports WHERE batch=? AND undone_at='' AND kind LIKE 'so7_%'"); $s->execute([$batch]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Cet import est déjà annulé, ou introuvable.'); }
    $ids = json_decode((string) $row['ids'], true) ?: []; $before = json_decode((string) $row['before_json'], true) ?: [];
    $pid = (int) $row['person_id'];
    if ($pid) { assert_person_unlocked($pdo, $pid); }
    $pdo->beginTransaction();
    try {
        foreach (array_map('intval', $ids['placements'] ?? []) as $id) {
            $pdo->prepare("DELETE FROM family_collection_media WHERE collection_type='placement' AND collection_id=?")->execute([$id]);
            $pdo->prepare('DELETE FROM child_placements WHERE id=? AND person_id=?')->execute([$id, $pid]);
        }
        if (array_key_exists('show_placement_block', $before)) {
            $n = $pdo->prepare('SELECT count(*) FROM child_placements WHERE person_id=?'); $n->execute([$pid]);
            if (!(int) $n->fetchColumn()) { $pdo->prepare('UPDATE persons SET show_placement_block=? WHERE id=?')->execute([(int) $before['show_placement_block'], $pid]); }
        }
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
    return so_undo($pdo, ['batch' => $batch]);
}

/** les fiches reconnues « Juste parmi les nations » (récompense ajoutée par n'importe quel lot) : jamais dans un jeu */
function so7_respect_ids(PDO $pdo): array
{
    $out = [];
    try {
        $s = $pdo->prepare("SELECT DISTINCT person_id FROM items WHERE type_key='award' AND person_id > 0 AND (title LIKE ? OR data LIKE ?)");
        $s->execute(['%' . SO7_JUSTE . '%', '%' . SO7_JUSTE . '%']);
        foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) { $out[(int) $id] = true; }
    } catch (Throwable $_) {}
    return $out;
}

/** le point d'entrée (api.php) : POST so7_preview, so7_import (multipart), so7_undo */
const SO7_ACTIONS = ['so7_preview', 'so7_import', 'so7_undo'];
function so7_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) { json_response(['error' => 'Demande inconnue.'], 400); }
        if ($action === 'so7_import') {
            $data = $payload;
            if (isset($payload['data']) && is_string($payload['data'])) { $data = json_decode($payload['data'], true); }
            if (!is_array($data)) { throw new LcndaBadInput('Données de l’import illisibles.'); }
            json_response(['ok' => true, 'result' => so7_import($pdo, $_FILES['file'] ?? null, $data)]);
        }
        json_response(['ok' => true, 'result' => match ($action) { 'so7_preview' => so7_preview($pdo, $payload), 'so7_undo' => so7_undo($pdo, $payload), default => throw new LcndaBadInput('Demande inconnue.') }]);
    } catch (LcndaBadInput $e) { json_response(['error' => $e->getMessage()], 422); }
    catch (Throwable $e) { json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422); }
}
