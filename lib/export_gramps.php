<?php
declare(strict_types=1);

/**
 * ⤓ Vers Gramps : fichier .gramps (XML Gramps 1.7.1 gzippé, lu par Gramps 5.1 et 5.2), valide selon le schéma RELAX NG de
 * Gramps (data/grampsxml.rng ; vérifié par tests/test-imports-exports-plus.js avec xmllint). Données : echanges_dataset()
 * (lib/echanges.php), donc mêmes règles de vie privée que le GEDCOM « pour partager ».
 *
 * Ce qui part : personnes (noms, autres noms, surnom, sexe), familles (parents, enfants avec adoption…), événements (dates
 * avec « vers / avant / après / entre », calendriers julien et républicain), lieux en hiérarchie (pays → région →
 * département → commune) avec coordonnées, sources et dépôts, citations (page, confiance), notes, médias (nom du fichier),
 * étiquettes (tags) et témoins (rôle « Witness » ou le rôle noté). Les fichiers des médias ne sont pas dans le .gramps.
 */

/** Type d'événement de Gramps (noms anglais du XML) d'après la balise GEDCOM ; sinon le libellé (type personnalisé). */
function gramps_out_event_type(string $tag, string $label): string
{
    static $map = ['BIRT' => 'Birth', 'DEAT' => 'Death', 'BURI' => 'Burial', 'CREM' => 'Cremation', 'CHR' => 'Christening', 'BAPM' => 'Baptism',
        'ADOP' => 'Adopted', 'BARM' => 'Bar Mitzvah', 'BASM' => 'Bas Mitzvah', 'BLES' => 'Blessing', 'CHRA' => 'Adult Christening', 'CONF' => 'Confirmation',
        'FCOM' => 'First Communion', 'ORDN' => 'Ordination', 'NATU' => 'Naturalization', 'EMIG' => 'Emigration', 'IMMI' => 'Immigration', 'CENS' => 'Census',
        'PROB' => 'Probate', 'WILL' => 'Will', 'GRAD' => 'Graduation', 'RETI' => 'Retirement', 'EDUC' => 'Education', 'OCCU' => 'Occupation',
        'RESI' => 'Residence', 'RELI' => 'Religion', 'PROP' => 'Property', 'TITL' => 'Nobility Title', 'NCHI' => 'Number of Children',
        'NMR' => 'Number of Marriages', 'CAST' => 'Caste', 'DSCR' => 'Description', 'IDNO' => 'Identification Number', 'NATI' => 'Nationality',
        '_MILT' => 'Military Service', '_DEG' => 'Degree', '_MDCL' => 'Medical Information', '_ELEC' => 'Elected', '_EXCM' => 'Excommunication',
        'MARR' => 'Marriage', 'DIV' => 'Divorce', 'DIVF' => 'Divorce Filing', 'ENGA' => 'Engagement', 'ANUL' => 'Annulment', 'MARB' => 'Marriage Banns',
        'MARC' => 'Marriage Contract', 'MARL' => 'Marriage License', 'MARS' => 'Marriage Settlement'];
    $t = strtoupper(trim($tag));
    return $map[$t] ?? (trim($label) !== '' ? trim($label) : 'Unknown');
}

/** Rôle d'un témoin (LCNDA, en français) → rôle de Gramps. */
function gramps_out_role(string $note): string
{
    $n = gedcom_fold($note);
    return match (true) {
        $n === '' || str_contains($n, 'temoin') => 'Witness',
        str_contains($n, 'officier') || str_contains($n, 'cure') || str_contains($n, 'pretre') || str_contains($n, 'officiant') => 'Clergy',
        str_contains($n, 'declarant') => 'Informant',
        default => trim($note),
    };
}

function export_gramps(PDO $pdo): never
{
    $d = echanges_dataset($pdo, true);
    $w = new XMLWriter();
    $w->openMemory();
    $w->setIndent(true);
    $w->setIndentString('  ');
    $w->startDocument('1.0', 'UTF-8');
    $w->writeDtd('database', '-//Gramps//DTD Gramps XML 1.7.1//EN', 'http://gramps-project.org/xml/1.7.1/grampsxml.dtd');
    $clean = static fn($v): string => preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', (string) $v) ?? '';
    $el = static function (string $name, $text = null, array $attrs = []) use ($w, $clean): void {
        $w->startElement($name);
        foreach ($attrs as $k => $v) { $w->writeAttribute($k, $clean($v)); }
        if ($text !== null) { $w->text($clean($text)); }
        $w->endElement();
    };
    $now = (string) time();
    $obj = static fn(string $handle, string $id, array $extra = []): array => ['handle' => $handle, 'change' => $now, 'id' => $id] + $extra;
    $w->startElement('database');
    $w->writeAttribute('xmlns', 'http://gramps-project.org/xml/1.7.1/');
    $w->startElement('header');
    $el('created', null, ['date' => date('Y-m-d'), 'version' => '5.1.6']);
    $w->startElement('researcher'); $el('resname', 'LCNDA (Le Carnet numérique des ancêtres)'); $w->endElement();
    $w->endElement();

    // Notes : rassemblées d'abord (chaque objet cite les siennes par noteref)
    $notes = []; // handle => [type, text]
    $noteRefs = static function (string $key, string $type, array $extraTexts = []) use ($d, &$notes): array {
        $out = [];
        foreach ($extraTexts as $t) { if (trim($t) !== '') { $h = '_N' . (count($notes) + 1); $notes[$h] = [$type, $t]; $out[] = $h; } }
        foreach ($d['notes'][$key] ?? [] as $n) {
            $text = trim((string) $n['title']) !== '' ? trim((string) $n['title']) . (trim((string) $n['body']) !== '' ? "\n" . $n['body'] : '') : (string) $n['body'];
            $h = '_N' . (count($notes) + 1); $notes[$h] = [$type, $text]; $out[] = $h;
        }
        return $out;
    };
    // Citations : une par lien de source
    $citations = []; // handle => [source id, page, confidence, note handles]
    $citeRefs = static function (string $key) use ($d, &$citations, &$notes): array {
        $out = [];
        foreach ($d['citations'][$key] ?? [] as $c) {
            $sid = (int) $c['source_record_id']; if (!isset($d['sources'][$sid])) { continue; }
            $q = (string) ($c['quality'] ?? '');
            $conf = match ($q) { '0' => 0, '1' => 1, '2' => 3, '3' => 4, default => 2 };
            $nh = [];
            if (trim((string) ($c['note'] ?? '')) !== '') { $h = '_N' . (count($notes) + 1); $notes[$h] = ['Citation', (string) $c['note']]; $nh[] = $h; }
            $h = '_C' . (int) $c['id']; $citations[$h] = [$sid, trim((string) ($c['page'] ?? '')), $conf, $nh]; $out[] = $h;
        }
        return $out;
    };
    $tagRefs = static fn(string $key): array => array_map(static fn($id) => '_T' . $id, $d['labels'][$key] ?? []);
    $objRefs = static fn(string $key): array => array_map(static fn($id) => '_O' . $id, array_keys($d['mediaBy'][$key] ?? []));
    $dateEl = static function (string $ged) use ($el): void {
        if ($ged === '') { return; }
        $p = echanges_date_parts($ged);
        $cf = match ($p['cal']) { 'julian' => ['cformat' => 'Julian'], 'republican' => ['cformat' => 'French Republican'], 'hebrew' => ['cformat' => 'Hebrew'], default => [] };
        if ($p['kind'] === 'str') { $el('datestr', null, ['val' => $p['text']]); return; }
        $q = $p['quality'] !== '' ? ['quality' => $p['quality']] : [];
        if ($p['kind'] === 'range' || $p['kind'] === 'span') { $el($p['kind'] === 'range' ? 'daterange' : 'datespan', null, ['start' => echanges_ymd($p['a']), 'stop' => echanges_ymd($p['b'])] + $q + $cf); return; }
        $el('dateval', null, ['val' => echanges_ymd($p['a'])] + ($p['mod'] !== '' ? ['type' => $p['mod']] : []) + $q + $cf);
    };

    // Lieux : hiérarchie pays → région → département → commune (placeref vers le niveau au-dessus)
    $levels = []; // clé → [handle, type, name, parent handle]
    $levelHandle = static function (string $type, string $name, ?string $parent) use (&$levels): ?string {
        if (trim($name) === '') { return $parent; }
        $k = $type . '|' . gedcom_fold($name) . '|' . ($parent ?? '');
        if (!isset($levels[$k])) { $levels[$k] = ['_L' . (count($levels) + 1), $type, trim($name), $parent]; }
        return $levels[$k][0];
    };
    $placeParent = [];
    foreach ($d['places'] as $id => $pl) {
        $h = $levelHandle('Country', (string) ($pl['country'] ?? ''), null);
        $h = $levelHandle('State', (string) ($pl['state'] ?? ''), $h);
        $h = $levelHandle('County', (string) ($pl['county'] ?? ''), $h);
        $placeParent[$id] = $h;
    }

    // Événements
    $eventRole = []; // handle d'événement → déjà écrit
    $w->startElement('events');
    foreach ($d['events'] as $eid => $e) {
        $w->startElement('event');
        foreach ($obj('_E' . $eid, 'E' . $eid) as $k => $v) { $w->writeAttribute($k, $v); }
        $el('type', gramps_out_event_type((string) $e['gedcom_tag'], (string) $e['type_label']));
        $dateEl(echanges_event_gedcom_date($e));
        if ((int) ($e['place_id'] ?? 0) && isset($d['places'][(int) $e['place_id']])) { $el('place', null, ['hlink' => '_P' . (int) $e['place_id']]); }
        // la description de Gramps = l'intitulé de l'événement (« Ouvrier agricole », « Mariage religieux »…) ; vide sinon
        $desc = trim((string) ($e['title'] ?? ''));
        if ($desc === '' && gramps_out_event_type((string) $e['gedcom_tag'], '') === 'Unknown' && trim((string) $e['type_label']) === '') { $desc = 'Événement'; }
        if ($desc !== '') { $el('description', $desc); }
        if (trim((string) ($e['cause'] ?? '')) !== '') { $el('attribute', null, ['type' => 'Cause', 'value' => trim((string) $e['cause'])]); }
        if (trim((string) ($e['agency'] ?? '')) !== '') { $el('attribute', null, ['type' => 'Agency', 'value' => trim((string) $e['agency'])]); }
        foreach ($noteRefs('event:' . $eid, 'Event Note', [trim((string) ($e['description'] ?? ''))]) as $h) { $el('noteref', null, ['hlink' => $h]); }
        foreach ($citeRefs('event:' . $eid) as $h) { $el('citationref', null, ['hlink' => $h]); }
        foreach ($objRefs('event:' . $eid) as $h) { $el('objref', null, ['hlink' => $h]); }
        foreach ($tagRefs('event:' . $eid) as $h) { $el('tagref', null, ['hlink' => $h]); }
        $w->endElement();
    }
    $w->endElement();

    // Personnes
    $witnessOf = [];
    foreach ($d['witnesses'] as $eid => $list) { foreach ($list as $wi) { $witnessOf[(int) $wi['person_id']][] = [$eid, (string) $wi['note']]; } }
    $parentIn = []; $childOf = [];
    foreach ($d['families'] as $fid => $f) {
        foreach ([(int) $f['partner1_id'], (int) $f['partner2_id']] as $p) { if ($p) { $parentIn[$p][] = $fid; } }
        foreach (array_keys($d['children'][$fid] ?? []) as $c) { $childOf[$c][] = $fid; }
    }
    $w->startElement('people');
    foreach ($d['persons'] as $pid => $p) {
        $w->startElement('person');
        foreach ($obj('_I' . $pid, 'I' . $pid, isset($d['hidden'][$pid]) ? ['priv' => '1'] : []) as $k => $v) { $w->writeAttribute($k, $v); }
        $el('gender', match ($p['gender'] ?? '') { 'male' => 'M', 'female' => 'F', 'nonbinary' => 'X', default => 'U' });
        $hidden = isset($d['hidden'][$pid]);
        $nick = '';
        foreach ($d['variants'][$pid] ?? [] as $v) { if (($v['type'] ?? '') === 'nickname' && $nick === '') { $nick = trim((string) $v['first_name']); } }
        $writeName = static function (array $n, string $type, bool $alt, string $nickName = '') use ($w, $el): void {
            $w->startElement('name');
            if ($alt) { $w->writeAttribute('alt', '1'); }
            $w->writeAttribute('type', $type);
            $given = trim(implode(' ', array_filter([trim((string) ($n['first_name'] ?? '')), trim((string) ($n['middle_name'] ?? ''))])));
            if ($given !== '') { $el('first', $given); }
            $el('surname', trim((string) ($n['last_name'] ?? '')), trim((string) ($n['prefix'] ?? '')) !== '' ? ['prefix' => trim((string) $n['prefix'])] : []);
            if (trim((string) ($n['suffix'] ?? '')) !== '') { $el('suffix', trim((string) $n['suffix'])); }
            if ($nickName !== '') { $el('nick', $nickName); }
            $w->endElement();
        };
        if ($hidden) {
            $writeName(['first_name' => $d['hidden'][$pid] === 'private' ? 'Fiche' : 'Personne', 'last_name' => $d['hidden'][$pid] === 'private' ? 'confidentielle' : 'vivante'], 'Birth Name', false);
        } else {
            $writeName($p, 'Birth Name', false, $nick);
            foreach ($d['variants'][$pid] ?? [] as $v) {
                if (($v['type'] ?? '') === 'nickname') { continue; }
                $writeName($v, ($v['type'] ?? '') === 'historical' ? 'Married Name' : 'Also Known As', true);
            }
            foreach ($d['byPerson'][$pid] ?? [] as $eid) { $el('eventref', null, ['hlink' => '_E' . $eid, 'role' => 'Primary']); }
            foreach ($witnessOf[$pid] ?? [] as [$eid, $note]) { $el('eventref', null, ['hlink' => '_E' . $eid, 'role' => gramps_out_role($note)]); }
            foreach ($objRefs('person:' . $pid) as $h) { $el('objref', null, ['hlink' => $h]); }
            if (trim((string) ($p['occupation'] ?? '')) !== '' && !array_filter($d['byPerson'][$pid] ?? [], static fn($e) => ($d['events'][$e]['gedcom_tag'] ?? '') === 'OCCU')) { $el('attribute', null, ['type' => 'Occupation', 'value' => trim((string) $p['occupation'])]); }
            if (trim((string) ($p['nationality'] ?? '')) !== '') { $el('attribute', null, ['type' => 'Nationality', 'value' => trim((string) $p['nationality'])]); }
        }
        foreach ($childOf[$pid] ?? [] as $fid) { $el('childof', null, ['hlink' => '_F' . $fid]); }
        foreach ($parentIn[$pid] ?? [] as $fid) { $el('parentin', null, ['hlink' => '_F' . $fid]); }
        if (!$hidden) {
            foreach ($noteRefs('person:' . $pid, 'Person Note') as $h) { $el('noteref', null, ['hlink' => $h]); }
            foreach ($citeRefs('person:' . $pid) as $h) { $el('citationref', null, ['hlink' => $h]); }
            foreach ($tagRefs('person:' . $pid) as $h) { $el('tagref', null, ['hlink' => $h]); }
        }
        $w->endElement();
    }
    $w->endElement();

    // Familles
    $rel = static fn(string $r): string => match ($r) { 'adopted' => 'Adopted', 'foster' => 'Foster', 'step' => 'Stepchild', default => 'Birth' };
    $w->startElement('families');
    foreach ($d['families'] as $fid => $f) {
        $w->startElement('family');
        foreach ($obj('_F' . $fid, 'F' . $fid, $f['hidden'] ? ['priv' => '1'] : []) as $k => $v) { $w->writeAttribute($k, $v); }
        $hasMarr = (bool) array_filter($d['byFamily'][$fid] ?? [], static fn($e) => in_array($d['events'][$e]['gedcom_tag'] ?? '', ['MARR', 'MARC', 'MARB'], true));
        $el('rel', null, ['type' => $hasMarr ? 'Married' : 'Unknown']);
        // père = l'homme, mère = la femme (sinon l'ordre de la base)
        [$a, $b] = [(int) $f['partner1_id'], (int) $f['partner2_id']];
        $ga = $d['persons'][$a]['gender'] ?? ''; $gb = $d['persons'][$b]['gender'] ?? '';
        if (($ga === 'female' && $gb !== 'female') || ($gb === 'male' && $ga !== 'male')) { [$a, $b] = [$b, $a]; }
        if ($a) { $el('father', null, ['hlink' => '_I' . $a]); }
        if ($b) { $el('mother', null, ['hlink' => '_I' . $b]); }
        foreach ($d['byFamily'][$fid] ?? [] as $eid) { $el('eventref', null, ['hlink' => '_E' . $eid, 'role' => 'Family']); }
        if (!$f['hidden']) { foreach ($objRefs('family:' . $fid) as $h) { $el('objref', null, ['hlink' => $h]); } }
        foreach ($d['children'][$fid] ?? [] as $cid => $c) {
            $r1 = (string) ($c['relation_to_partner1'] ?? 'biological'); $r2 = (string) ($c['relation_to_partner2'] ?? 'biological');
            $fatherRel = $a === (int) $f['partner1_id'] ? $r1 : $r2; $motherRel = $a === (int) $f['partner1_id'] ? $r2 : $r1;
            $attrs = ['hlink' => '_I' . $cid];
            if ($fatherRel !== 'biological' || $motherRel !== 'biological') { $attrs['mrel'] = $rel($motherRel); $attrs['frel'] = $rel($fatherRel); }
            $el('childref', null, $attrs);
        }
        if (!$f['hidden']) {
            foreach ($noteRefs('family:' . $fid, 'Family Note') as $h) { $el('noteref', null, ['hlink' => $h]); }
            foreach ($citeRefs('family:' . $fid) as $h) { $el('citationref', null, ['hlink' => $h]); }
            foreach ($tagRefs('family:' . $fid) as $h) { $el('tagref', null, ['hlink' => $h]); }
        }
        $w->endElement();
    }
    $w->endElement();

    // Citations
    $w->startElement('citations');
    foreach ($citations as $h => [$sid, $page, $conf, $nh]) {
        $w->startElement('citation');
        foreach ($obj($h, 'C' . substr($h, 2)) as $k => $v) { $w->writeAttribute($k, $v); }
        if ($page !== '') { $el('page', $page); }
        $el('confidence', (string) $conf);
        foreach ($nh as $n) { $el('noteref', null, ['hlink' => $n]); }
        $el('sourceref', null, ['hlink' => '_S' . $sid]);
        $w->endElement();
    }
    $w->endElement();

    // Sources et dépôts
    $repos = [];
    foreach ($d['sources'] as $s) { $a = trim((string) ($s['agency'] ?? '')); if ($a !== '' && !isset($repos[gedcom_fold($a)])) { $repos[gedcom_fold($a)] = ['_R' . (count($repos) + 1), $a]; } }
    $w->startElement('sources');
    foreach ($d['sources'] as $sid => $s) {
        $w->startElement('source');
        foreach ($obj('_S' . $sid, 'S' . $sid) as $k => $v) { $w->writeAttribute($k, $v); }
        $el('stitle', (string) ($s['title'] ?: 'Source sans titre'));
        if (trim((string) $s['author']) !== '') { $el('sauthor', trim((string) $s['author'])); }
        if (trim((string) $s['publication']) !== '') { $el('spubinfo', trim((string) $s['publication'])); }
        foreach ($noteRefs('source:' . $sid, 'Source text', [trim((string) $s['text'])]) as $h) { $el('noteref', null, ['hlink' => $h]); }
        foreach ($objRefs('source:' . $sid) as $h) { $el('objref', null, ['hlink' => $h]); }
        if (trim((string) $s['url']) !== '') { $el('srcattribute', null, ['type' => 'URL', 'value' => trim((string) $s['url'])]); }
        $a = trim((string) ($s['agency'] ?? ''));
        if ($a !== '') { $el('reporef', null, ['hlink' => $repos[gedcom_fold($a)][0], 'medium' => 'Book'] + (trim((string) ($s['archive_cote'] ?? '')) !== '' ? ['callno' => trim((string) $s['archive_cote'])] : [])); }
        $w->endElement();
    }
    $w->endElement();

    // Lieux : niveaux (pays, régions, départements) puis communes
    $w->startElement('places');
    foreach ($levels as [$h, $type, $name, $parent]) {
        $w->startElement('placeobj');
        foreach ($obj($h, 'P' . $h) + ['type' => $type] as $k => $v) { $w->writeAttribute($k, $v); }
        $el('pname', null, ['value' => $name]);
        if ($parent) { $el('placeref', null, ['hlink' => $parent]); }
        $w->endElement();
    }
    foreach ($d['places'] as $id => $pl) {
        $w->startElement('placeobj');
        $type = trim((string) ($pl['subdivision'] ?? '')) !== '' ? 'Locality' : 'City';
        foreach ($obj('_P' . $id, 'P' . $id) + ['type' => $type] as $k => $v) { $w->writeAttribute($k, $v); }
        $el('ptitle', echanges_place_title($pl));
        $code = trim((string) ($pl['admin4_code'] ?? ''));
        if ($code !== '') { $el('code', $code); }
        $name = trim((string) ($pl['name'] ?? '')) ?: 'Lieu sans nom';
        if (trim((string) ($pl['subdivision'] ?? '')) !== '') { $name = trim((string) $pl['subdivision']) . ', ' . $name; }
        $el('pname', null, ['value' => $name]);
        foreach (array_filter(array_map('trim', explode(',', (string) ($pl['alternate_names'] ?? '')))) as $i => $alt) { if ($i < 20 && $alt !== $name) { $el('pname', null, ['value' => $alt]); } }
        if ($pl['latitude'] !== null && $pl['longitude'] !== null && $pl['latitude'] !== '' && $pl['longitude'] !== '') {
            $el('coord', null, ['long' => rtrim(rtrim(number_format((float) $pl['longitude'], 6, '.', ''), '0'), '.'), 'lat' => rtrim(rtrim(number_format((float) $pl['latitude'], 6, '.', ''), '0'), '.')]);
        }
        if ($placeParent[$id] ?? null) { $el('placeref', null, ['hlink' => $placeParent[$id]]); }
        if (trim((string) ($pl['description'] ?? '')) !== '') { foreach ($noteRefs('place:' . $id, 'Place Note', [(string) $pl['description']]) as $h) { $el('noteref', null, ['hlink' => $h]); } }
        $w->endElement();
    }
    $w->endElement();

    // Médias (le nom du fichier, relatif au dossier des médias de LCNDA)
    $w->startElement('objects');
    foreach ($d['media'] as $id => $m) {
        $file = trim((string) ($m['filename'] ?? ''));
        $url = trim((string) ($m['document_url'] ?? ''));
        $src = $file !== '' ? $file : $url;
        if ($src === '') { continue; }
        $ext = strtolower(pathinfo($src, PATHINFO_EXTENSION));
        $mime = match ($ext) { 'jpg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp', 'tif', 'tiff' => 'image/tiff', 'pdf' => 'application/pdf',
            'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'mp4' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm', default => 'application/octet-stream' };
        $w->startElement('object');
        foreach ($obj('_O' . $id, 'O' . $id) as $k => $v) { $w->writeAttribute($k, $v); }
        $el('file', null, ['src' => $src, 'mime' => $mime, 'description' => (string) ($m['title'] ?: ($m['document_title'] ?: pathinfo($src, PATHINFO_FILENAME)))]);
        foreach ($noteRefs('media:' . $id, 'Media Note', [trim((string) ($m['description'] ?? ''))]) as $h) { $el('noteref', null, ['hlink' => $h]); }
        if (trim((string) ($m['date_text'] ?? '')) !== '') { $dateEl(gedcom_date_from_text((string) $m['date_text'])); }
        $w->endElement();
    }
    $w->endElement();

    // Dépôts
    if ($repos) {
        $w->startElement('repositories');
        foreach ($repos as [$h, $name]) {
            $w->startElement('repository');
            foreach ($obj($h, 'R' . substr($h, 2)) as $k => $v) { $w->writeAttribute($k, $v); }
            $el('rname', $name); $el('type', 'Archive');
            $w->endElement();
        }
        $w->endElement();
    }
    // Notes
    if ($notes) {
        $w->startElement('notes');
        foreach ($notes as $h => [$type, $text]) {
            $w->startElement('note');
            foreach ($obj($h, 'N' . substr($h, 2)) + ['type' => $type] as $k => $v) { $w->writeAttribute($k, $v); }
            $el('text', $text);
            $w->endElement();
        }
        $w->endElement();
    }
    $w->endElement(); // database
    $w->endDocument();
    $xml = $w->outputMemory();
    // Les étiquettes (tags) doivent venir juste après l'en-tête : écrites à part puis insérées
    if ($d['labelList']) {
        $t = new XMLWriter(); $t->openMemory(); $t->setIndent(true); $t->setIndentString('  '); $t->startDocument('1.0', 'UTF-8');
        $t->startElement('tags');
        $prio = 0;
        foreach ($d['labelList'] as $id => $l) {
            $c = preg_match('/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i', (string) $l['color'], $m) ? '#' . $m[1] . $m[1] . $m[2] . $m[2] . $m[3] . $m[3] : '#000000000000';
            $t->startElement('tag');
            foreach (['handle' => '_T' . $id, 'change' => $now, 'name' => $clean($l['name']), 'color' => $c, 'priority' => (string) $prio++] as $k => $v) { $t->writeAttribute($k, $v); }
            $t->endElement();
        }
        $t->endElement();
        $t->endDocument();
        $tags = trim((string) preg_replace('/^<\?xml[^>]*\?>\s*/', '', $t->outputMemory()));
        $xml = preg_replace('#(</header>\s*)#', '$1' . str_replace(['\\', '$'], ['\\\\', '\\$'], $tags) . "\n  ", $xml, 1) ?? $xml;
    }
    $gz = gzencode($xml, 9);
    echanges_send('genealogie-' . date('Ymd-His') . '.gramps', 'application/x-gramps', (string) $gz, ['X-LCNDA-Count' => (string) count($d['persons'])]);
}
