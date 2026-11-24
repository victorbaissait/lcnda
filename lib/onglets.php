<?php
declare(strict_types=1);

/**
 * 📄 Documents et 🎨 Catalogue raisonné : deux onglets du menu du haut, cachés au départ (maquette
 * docs/design/onglets-documents-catalogue.html). Interface : assets/js/heritage-onglets-documents.js et
 * heritage-onglets-catalogue.js. Rien de nouveau dans la base : les documents sont les médias (table media), le catalogue
 * est celui des Artistes (table items, lib/art_engine.php).
 *
 * Lecture (GET action=onglets) et quelques écritures (POST action=onglets_write, onglets_api_post : ✎ modifier sur place,
 * personnes reliées, ✉️ pièces manquantes). Routes de lecture :
 *   GET api.php?action=onglets&op=documents          → {documents: [...], total, readonly}   (une ligne courte par média)
 *   GET api.php?action=onglets&op=document&id=12     → {document: {...}, readonly}           (la fiche complète)
 *   GET api.php?action=onglets&op=artists            → {artists: [...], readonly}            (qui a un catalogue)
 *
 *  - les lettres scellées (trésors) ne sortent pas en mode consultation (sealed_media_sql, comme la liste Médias) ;
 *  - mode consultation : les personnes vivantes ou confidentielles ne sont pas nommées sur les documents, et leur
 *    catalogue n'est pas proposé (mêmes règles que « Créations et carrières », lib/creations.php) ;
 *  - tout est en SQL préparé, borné (20 000 documents, 2 000 artistes).
 */

const ONGLETS_MAX_DOCS = 20000;
const ONGLETS_MAX_DOC_PEOPLE = 60; // noms par document dans la liste (la fiche les a tous)

function onglets_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

function onglets_has_col(PDO $pdo, string $table, string $col): bool
{
    static $memo = [];
    $k = $table . '.' . $col;
    if (!isset($memo[$k])) {
        $s = $pdo->prepare('SELECT 1 FROM pragma_table_info(?) WHERE name=?'); $s->execute([$table, $col]);
        $memo[$k] = (bool) $s->fetchColumn();
    }
    return $memo[$k];
}

/** les personnes qu'on ne nomme pas en mode consultation (vivantes, confidentielles) */
function onglets_hidden_people_sql(PDO $pdo, string $alias = 'p'): string
{
    if (!onglets_kiosk()) { return ''; }
    $c = " AND COALESCE({$alias}.living_status,'')<>'living'";
    if (onglets_has_col($pdo, 'persons', 'is_private')) { $c .= " AND COALESCE({$alias}.is_private,0)=0"; }
    return $c;
}

/** l'année d'une date écrite comme dans un acte (« 12 mars 1916 », « vers 1784 ») */
function onglets_year(string $date): ?int
{
    return preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $date, $m) ? (int) $m[1] : null;
}

/** media_id → personnes (id, nom, sexe) : liens directs, par un événement (la personne, ou le couple), par une famille */
function onglets_media_people(PDO $pdo, ?array $ids = null): array
{
    $in = '';
    $params = [];
    if ($ids !== null) {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (!$ids) { return []; }
        $in = ' AND ml.media_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
    }
    $hide = onglets_hidden_people_sql($pdo);
    $parts = [
        "SELECT ml.media_id, p.id AS pid FROM media_links ml JOIN persons p ON ml.entity_type='person' AND p.id=ml.entity_id WHERE 1{$in}{$hide}",
        "SELECT ml.media_id, p.id FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN persons p ON p.id=e.person_id WHERE 1{$in}{$hide}",
        "SELECT ml.media_id, p.id FROM media_links ml JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id JOIN families f ON f.id=e.family_id JOIN persons p ON p.id IN (f.partner1_id, f.partner2_id) WHERE 1{$in}{$hide}",
        "SELECT ml.media_id, p.id FROM media_links ml JOIN families f ON ml.entity_type='family' AND f.id=ml.entity_id JOIN persons p ON p.id IN (f.partner1_id, f.partner2_id) WHERE 1{$in}{$hide}",
    ];
    $sql = 'SELECT x.media_id, x.pid, p.first_name, p.last_name, p.gender FROM (' . implode(' UNION ', $parts) . ') x JOIN persons p ON p.id=x.pid ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE';
    $s = $pdo->prepare($sql);
    if ($ids !== null) { for ($i = 0; $i < 4; $i++) { array_push($params, ...$ids); } }
    $s->execute($params);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[(int) $r['media_id']][] = ['id' => (int) $r['pid'], 'name' => trim(((string) $r['first_name']) . ' ' . ((string) $r['last_name'])) ?: 'Personne sans nom', 'gender' => (string) $r['gender'],
            'last' => trim((string) $r['last_name']), 'first' => trim((string) $r['first_name'])];
    }
    return $out;
}

/** media_id → lieu (celui d'un événement ou d'un recensement rattaché) */
function onglets_media_places(PDO $pdo): array
{
    $out = [];
    $sql = "SELECT ml.media_id, COALESCE(pe.name, pc.name) AS place FROM media_links ml
        LEFT JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id LEFT JOIN places pe ON pe.id=e.place_id
        LEFT JOIN census_records cr ON ml.entity_type='census' AND cr.id=ml.entity_id LEFT JOIN places pc ON pc.id=cr.place_id
        WHERE COALESCE(pe.name, pc.name, '')<>'' ORDER BY ml.position, ml.id";
    // le lieu choisi pour le média lui-même (« ✎ Modifier » de l'onglet Documents, import de photos) passe d'abord
    if (onglets_has_col($pdo, 'media', 'place_id')) {
        try { foreach ($pdo->query('SELECT m.id AS media_id, p.name AS place FROM media m JOIN places p ON p.id=m.place_id')->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['media_id']] = (string) $r['place']; } } catch (Throwable $e) {}
    }
    try { foreach ($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['media_id']] ??= (string) $r['place']; } } catch (Throwable $e) {}
    return $out;
}

/**
 * 📍 les lieux de chaque document, avec leurs coordonnées quand on les connaît (chercher « autour d'une ville, à X km ») :
 * le lieu du média, ceux des événements et recensements reliés, et le lieu écrit dans ses actes de l'Atelier (s'il est dans Lieux).
 * [media_id => [{id, name, lat, lon}]] (6 au plus par document)
 */
function onglets_media_geo(PDO $pdo): array
{
    $out = [];
    $put = static function (int $mid, array $r) use (&$out) {
        $name = trim((string) ($r['name'] ?? '')); if ($name === '' || count($out[$mid] ?? []) >= 6) { return; }
        foreach ($out[$mid] ?? [] as $x) { if ((int) $x['id'] === (int) ($r['id'] ?? 0) && $x['id'] || mb_strtolower($x['name']) === mb_strtolower($name)) { return; } }
        $lat = $r['latitude'] ?? null; $lon = $r['longitude'] ?? null;
        $out[$mid][] = ['id' => (int) ($r['id'] ?? 0), 'name' => mb_substr($name, 0, 120), 'lat' => is_numeric($lat) ? round((float) $lat, 5) : null, 'lon' => is_numeric($lon) ? round((float) $lon, 5) : null];
    };
    try {
        if (onglets_has_col($pdo, 'media', 'place_id')) {
            foreach ($pdo->query('SELECT m.id AS media_id, p.id, p.name, p.latitude, p.longitude FROM media m JOIN places p ON p.id=m.place_id') as $r) { $put((int) $r['media_id'], $r); }
        }
        $sql = "SELECT ml.media_id, p.id, p.name, p.latitude, p.longitude FROM media_links ml
            LEFT JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id LEFT JOIN census_records cr ON ml.entity_type='census' AND cr.id=ml.entity_id
            JOIN places p ON p.id=COALESCE(e.place_id, cr.place_id) ORDER BY ml.position, ml.id";
        foreach ($pdo->query($sql) as $r) { $put((int) $r['media_id'], $r); }
    } catch (Throwable $e) {}
    try {
        act_transcriptions_ensure($pdo);
        $byName = [];
        foreach ($pdo->query("SELECT id, name, latitude, longitude FROM places WHERE trim(COALESCE(name,''))<>'' ORDER BY (latitude IS NULL), id") as $p) {
            $k = mb_strtolower(trim(explode(',', (string) $p['name'])[0])); $byName[$k] ??= $p;
        }
        foreach ($pdo->query("SELECT media_id, place FROM act_transcriptions WHERE media_id IS NOT NULL AND trim(place)<>'' ORDER BY id") as $a) {
            $k = mb_strtolower(trim(explode(',', (string) $a['place'])[0]));
            $put((int) $a['media_id'], $byName[$k] ?? ['id' => 0, 'name' => (string) $a['place']]);
        }
    } catch (Throwable $e) {}
    return $out;
}

/** 📜 les sortes d'actes de chaque document (Atelier : naissance, mariage…) et l'année de son premier acte : [media_id => {kinds, year}] */
function onglets_media_acts(PDO $pdo): array
{
    $out = [];
    try {
        act_transcriptions_ensure($pdo);
        foreach ($pdo->query('SELECT media_id, kind, date_text FROM act_transcriptions WHERE media_id IS NOT NULL ORDER BY id') as $a) {
            $mid = (int) $a['media_id']; $out[$mid] ??= ['kinds' => [], 'year' => 0];
            $k = (string) $a['kind']; if ($k !== '' && $k !== 'apreciser' && !in_array($k, $out[$mid]['kinds'], true)) { $out[$mid]['kinds'][] = $k; }
            if (!$out[$mid]['year']) { $out[$mid]['year'] = (int) (onglets_year((string) $a['date_text']) ?? 0); }
        }
    } catch (Throwable $e) {}
    return $out;
}

/** un lieu de la base et ses coordonnées (le centre de « à X km autour de ») */
function onglets_place_point(PDO $pdo, int $id): array
{
    $s = $pdo->prepare('SELECT id, name, latitude, longitude FROM places WHERE id=?'); $s->execute([$id]); $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Lieu introuvable.'); }
    return ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'lat' => is_numeric($p['latitude']) ? (float) $p['latitude'] : null, 'lon' => is_numeric($p['longitude']) ? (float) $p['longitude'] : null];
}

/** ✉️ les correspondants d'une pièce : [{id, name}] (au plus 6) depuis correspondent_json, sinon correspondent_name (« Jean ; Marie ») */
function onglets_correspondents(string $json, string $name): array
{
    $out = [];
    $list = json_decode($json, true);
    if (is_array($list)) { foreach ($list as $x) { if (is_array($x) && trim((string) ($x['name'] ?? '')) !== '') { $out[] = ['id' => (int) ($x['id'] ?? 0), 'name' => mb_substr(trim((string) $x['name']), 0, 80)]; } } }
    if (!$out && trim($name) !== '') { foreach (preg_split('/\s*[;,\/]\s*/u', $name) as $n) { if ($n !== '') { $out[] = ['id' => 0, 'name' => mb_substr($n, 0, 80)]; } } }
    return array_slice($out, 0, 6);
}

/** la liste : une ligne courte par document (la colonne de gauche, A → Z ou dossiers) */
function onglets_documents(PDO $pdo): array
{
    $series = onglets_has_col($pdo, 'media', 'archive_series') ? "COALESCE(m.archive_series,'')" : "''";
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo) : '';
    $s = $pdo->prepare("SELECT m.id, m.title, m.document_title, m.filename, m.thumbnail, m.media_type, COALESCE(m.date_text,'') AS date_text,
            COALESCE(m.document_reference,'') AS cote, COALESCE(m.media_subject_type,'') AS subject, COALESCE(m.correspondence_type,'') AS corr,
            COALESCE(m.correspondent_json,'') AS corr_json, COALESCE(m.correspondent_name,'') AS corr_name, COALESCE(m.correspondence_reply_to_media_id,0) AS reply_to,
            CASE WHEN trim(COALESCE(m.transcription,''))<>'' THEN 1 ELSE 0 END AS has_tr, m.created_at, {$series} AS series,
            (SELECT count(*) FROM media_links l WHERE l.media_id=m.id) AS links
        FROM media m WHERE 1{$sealed} ORDER BY m.id LIMIT " . (ONGLETS_MAX_DOCS + 1));
    $s->execute();
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $more = count($rows) > ONGLETS_MAX_DOCS;
    if ($more) { array_pop($rows); }
    $people = onglets_media_people($pdo);
    $places = onglets_media_places($pdo);
    $geo = onglets_media_geo($pdo);
    $acts = onglets_media_acts($pdo);
    $ro = function_exists('onglets_kiosk') && onglets_kiosk();
    $docs = array_map(static function (array $r) use ($people, $places, $geo, $acts, $ro) {
        $id = (int) $r['id'];
        $title = trim((string) $r['title']) ?: trim((string) $r['document_title']) ?: trim((string) $r['filename']) ?: 'Document sans titre';
        $pp = $people[$id] ?? [];
        return ['id' => $id, 'title' => mb_substr($title, 0, 200), 'media_type' => (string) $r['media_type'], 'filename' => (string) $r['filename'], 'thumbnail' => (string) $r['thumbnail'],
            'date_text' => mb_substr((string) $r['date_text'], 0, 80), 'year' => onglets_year((string) $r['date_text']) ?: (($acts[$id]['year'] ?? 0) ?: null), 'cote' => mb_substr((string) $r['cote'], 0, 80),
            'subject' => (string) $r['subject'], 'corr' => (string) $r['corr'], 'has_tr' => (int) $r['has_tr'], 'created_at' => (string) $r['created_at'],
            'series' => mb_substr((string) $r['series'], 0, 120), 'links' => (int) $r['links'], 'place' => mb_substr($places[$id] ?? '', 0, 120),
            // les noms montrés sous le titre et cherchés par « Chercher… » (bornés ; en consultation, sans vivants ni fiches confidentielles)
            'geo' => $geo[$id] ?? [], 'kinds' => $acts[$id]['kinds'] ?? [],
            'people' => array_slice(array_map(static fn($p) => ['id' => $p['id'], 'name' => mb_substr($p['name'], 0, 80), 'last' => mb_substr($p['last'], 0, 60), 'first' => mb_substr($p['first'], 0, 60)], $pp), 0, ONGLETS_MAX_DOC_PEOPLE), 'people_count' => count($pp),
            // ✉️ les correspondants (fiches ou noms libres ; pas en mode consultation : un vivant pourrait y être) et la pièce à laquelle elle répond
            'corrs' => $ro || (string) $r['corr'] === '' ? [] : onglets_correspondents((string) $r['corr_json'], (string) $r['corr_name']), 'reply_to' => (int) $r['reply_to']];
    }, $rows);
    // 📚 les recueils où est chaque document (chercher et filtrer par recueil, « 📚 Recueils » dans la colonne)
    $rx = function_exists('recueil_doc_index') ? recueil_doc_index($pdo) : ['recueils' => [], 'of' => []];
    $labels = onglets_media_labels($pdo); // 🏷 les étiquettes de chaque document (pastilles et « Filtrer ▾ → Étiquette »)
    foreach ($docs as &$d) { $d['recueils'] = $rx['of'][$d['id']] ?? []; $d['labels'] = $labels[$d['id']] ?? []; }
    unset($d);
    return ['documents' => $docs, 'total' => count($docs), 'more' => $more, 'readonly' => onglets_kiosk(), 'recueils' => $rx['recueils'],
        'missing' => onglets_missing_list($pdo)];
}

/** la fiche complète d'un document (à droite) */
function onglets_document(PDO $pdo, int $id): array
{
    if ($id <= 0) { throw new LcndaBadInput('Document introuvable.'); } // 422 avec une phrase, pas une erreur 500
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo) : '';
    $s = $pdo->prepare("SELECT * FROM media m WHERE m.id=?{$sealed}"); $s->execute([$id]);
    $m = $s->fetch(PDO::FETCH_ASSOC);
    if (!$m) { throw new LcndaBadInput('Document introuvable : il n’existe pas, ou plus.'); }
    $str = static fn($k, $n = 400) => mb_substr((string) ($m[$k] ?? ''), 0, $n);
    $url = (string) ($m['document_url'] ?? '');
    if (!preg_match('~^https?://~i', $url)) { $url = ''; }
    $people = onglets_media_people($pdo, [$id])[$id] ?? [];
    // années de vie des personnes (naissance, décès), pour leur pastille
    if ($people) {
        $pids = array_column($people, 'id');
        $ev = $pdo->prepare("SELECT e.person_id, t.gedcom_tag AS tag, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.person_id IN (" . implode(',', array_fill(0, count($pids), '?')) . ") AND t.gedcom_tag IN ('BIRT','DEAT') AND e.year IS NOT NULL GROUP BY e.person_id, t.gedcom_tag");
        $life = [];
        try { $ev->execute($pids); foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) { $life[(int) $e['person_id']][$e['tag'] === 'BIRT' ? 'birth' : 'death'] = (int) $e['y']; } } catch (Throwable $e) {}
        foreach ($people as &$p) { $p['birth'] = $life[$p['id']]['birth'] ?? null; $p['death'] = $life[$p['id']]['death'] ?? null; }
        unset($p);
    }
    // 📄 un seul texte par document : les actes de l'Atelier de transcription sur cette image (titre, sorte, état, zones, personnes relevées)
    $acts = function_exists('act_transcriptions_for_media') ? act_transcriptions_for_media($pdo, $id) : [];
    $roles = []; $found = [];
    foreach ($acts as $a) { foreach ($a['people'] as $q) { if ($q['person_id'] > 0) { $found[$q['person_id']] = true; if ($q['role'] !== '') { $roles[$q['person_id']] ??= $q['role']; } } } }
    $known = array_flip(array_column($people, 'id'));
    $more = array_values(array_diff(array_keys($found), array_keys($known))); // relevées dans l'Atelier, pas (encore) reliées au média
    if ($more) {
        $pp = $pdo->prepare('SELECT p.id, p.first_name, p.last_name, p.gender FROM persons p WHERE p.id IN (' . implode(',', array_fill(0, count($more), '?')) . ')' . onglets_hidden_people_sql($pdo, 'p'));
        $pp->execute($more);
        foreach ($pp->fetchAll(PDO::FETCH_ASSOC) as $r) { $people[] = ['id' => (int) $r['id'], 'name' => trim($r['first_name'] . ' ' . $r['last_name']) ?: 'Personne sans nom', 'gender' => (string) $r['gender'], 'last' => (string) $r['last_name'], 'first' => (string) $r['first_name'], 'found' => 1]; }
    }
    foreach ($people as &$p) { if (isset($roles[$p['id']])) { $p['role'] = mb_substr($roles[$p['id']], 0, 60); } }
    unset($p);
    // à quoi il est rattaché (fiche, événement, recensement…)
    $links = [];
    $l = $pdo->prepare("SELECT ml.entity_type, ml.entity_id, COALESCE(et.label,'') AS ev_label, COALESCE(ev.date_text,'') AS ev_date, COALESCE(cr.year,'') AS cr_year,
            COALESCE(ev.person_id,0) AS ev_person, trim(COALESCE(pp.first_name,'') || ' ' || COALESCE(pp.last_name,'')) AS p_name
        FROM media_links ml LEFT JOIN persons pp ON ml.entity_type IN ('person','military') AND pp.id=ml.entity_id" . onglets_hidden_people_sql($pdo, 'pp') . "
        LEFT JOIN events ev ON ml.entity_type='event' AND ev.id=ml.entity_id LEFT JOIN event_types et ON et.id=ev.event_type_id
        LEFT JOIN census_records cr ON ml.entity_type='census' AND cr.id=ml.entity_id WHERE ml.media_id=? ORDER BY ml.position, ml.id LIMIT 200");
    $l->execute([$id]);
    foreach ($l->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $label = match ((string) $r['entity_type']) {
            'person' => $r['p_name'] !== '' ? 'Fiche de ' . $r['p_name'] : 'Fiche individuelle', 'family' => 'Famille', 'source' => 'Source', 'military' => $r['p_name'] !== '' ? 'Dossier militaire de ' . $r['p_name'] : 'Dossier militaire', 'battue_item' => 'Annotation de battue',
            'census' => trim('Recensement ' . $r['cr_year']), 'event' => trim(($r['ev_label'] ?: 'Événement') . ($r['ev_date'] !== '' ? ' — ' . $r['ev_date'] : '')), default => 'Autre',
        };
        $links[] = ['type' => (string) $r['entity_type'], 'label' => mb_substr($label, 0, 160)];
    }
    $places = [];
    $pl = $pdo->prepare("SELECT DISTINCT COALESCE(pe.id, pc.id) AS id, COALESCE(pe.name, pc.name) AS name FROM media_links ml
        LEFT JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id LEFT JOIN places pe ON pe.id=e.place_id
        LEFT JOIN census_records cr ON ml.entity_type='census' AND cr.id=ml.entity_id LEFT JOIN places pc ON pc.id=cr.place_id
        WHERE ml.media_id=? AND COALESCE(pe.name, pc.name, '')<>'' LIMIT 20");
    try { $pl->execute([$id]); $places = array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name']], $pl->fetchAll(PDO::FETCH_ASSOC)); } catch (Throwable $e) {}
    if ((int) ($m['place_id'] ?? 0) > 0) { // le lieu du média lui-même d'abord
        try { $pp = $pdo->prepare('SELECT id, name FROM places WHERE id=?'); $pp->execute([(int) $m['place_id']]); if ($r = $pp->fetch(PDO::FETCH_ASSOC)) { $places = array_values(array_filter($places, static fn($x) => $x['id'] !== (int) $r['id'])); array_unshift($places, ['id' => (int) $r['id'], 'name' => (string) $r['name']]); } } catch (Throwable $e) {}
    }
    $service = '';
    if (onglets_has_col($pdo, 'media', 'archive_service_id') && (int) ($m['archive_service_id'] ?? 0) > 0) {
        try { $a = $pdo->prepare('SELECT name FROM archive_services WHERE id=?'); $a->execute([(int) $m['archive_service_id']]); $service = (string) ($a->fetchColumn() ?: ''); } catch (Throwable $e) {}
    }
    $title = trim($str('title', 300)) ?: trim($str('document_title', 300)) ?: trim($str('filename', 300)) ?: 'Document sans titre';
    $doc = ['id' => $id, 'title' => $title, 'document_title' => $str('document_title', 300), 'description' => $str('description', 4000), 'media_type' => $str('media_type', 30),
        'filename' => $str('filename', 300), 'thumbnail' => $str('thumbnail', 300), 'date_text' => $str('date_text', 120), 'year' => onglets_year((string) ($m['date_text'] ?? '')),
        'cote' => $str('document_reference', 160), 'pages' => $str('document_pages', 120), 'url' => mb_substr($url, 0, 600), 'subject' => $str('media_subject_type', 60),
        'corr' => $str('correspondence_type', 60), 'correspondent' => $str('correspondent_name', 200), 'transcription' => mb_substr((string) ($m['transcription'] ?? ''), 0, 60000),
        'series' => $str('archive_series', 200), 'service' => mb_substr($service, 0, 200), 'created_at' => $str('created_at', 40), 'is_person_photo' => (int) ($m['is_person_photo'] ?? 0),
        'duration' => isset($m['duration_seconds']) && $m['duration_seconds'] !== null ? (float) $m['duration_seconds'] : null,
        'people' => $people, 'links' => $links, 'places' => $places, 'acts' => $acts, 'place_id' => (int) ($m['place_id'] ?? 0)];
    return ['document' => $doc, 'readonly' => onglets_kiosk()];
}

/** les personnes qui ont un catalogue (cochées « Artiste » ou avec des fiches d'œuvres), les plus fournies d'abord */
function onglets_artists(PDO $pdo): array
{
    if (function_exists('art_ensure')) { art_ensure($pdo); }
    $hide = onglets_hidden_people_sql($pdo);
    $rows = $pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, COALESCE(p.is_artist,0) AS is_artist, COALESCE(p.artist_discipline,'') AS discipline,
            (SELECT count(*) FROM items i WHERE i.person_id=p.id AND substr(i.type_key,1,8)<>'profile_' AND i.type_key<>'profile') AS n
        FROM persons p WHERE COALESCE(p.kind,'person')<>'animal'{$hide}
            AND (COALESCE(p.is_artist,0)=1 OR EXISTS (SELECT 1 FROM items i WHERE i.person_id=p.id AND substr(i.type_key,1,8)<>'profile_' AND i.type_key<>'profile'))
        ORDER BY n DESC, p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 2000")->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    $ids = array_map(static fn($r) => (int) $r['id'], $rows);
    $life = [];
    if ($ids) {
        try {
            foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag AS tag, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN (" . implode(',', $ids) . ") AND t.gedcom_tag IN ('BIRT','DEAT') AND e.year IS NOT NULL GROUP BY e.person_id, t.gedcom_tag")->fetchAll(PDO::FETCH_ASSOC) as $e) {
                $life[(int) $e['person_id']][$e['tag'] === 'BIRT' ? 'birth' : 'death'] = (int) $e['y'];
            }
        } catch (Throwable $e) {}
    }
    foreach ($rows as $r) {
        $id = (int) $r['id'];
        $out[] = ['id' => $id, 'name' => trim(((string) $r['first_name']) . ' ' . mb_strtoupper((string) $r['last_name'])), 'gender' => (string) $r['gender'], 'discipline' => (string) $r['discipline'],
            'items' => (int) $r['n'], 'birth' => $life[$id]['birth'] ?? null, 'death' => $life[$id]['death'] ?? null];
    }
    return ['artists' => $out, 'readonly' => onglets_kiosk()];
}

/** 🏷 les étiquettes posées sur les médias : [media_id => [{id, name, color}]] */
function onglets_media_labels(PDO $pdo): array
{
    $out = [];
    try {
        foreach ($pdo->query("SELECT ll.entity_id AS mid, l.id, l.name, COALESCE(l.color,'') AS color FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type='media' ORDER BY l.name COLLATE NOCASE LIMIT 100000") as $r) {
            $out[(int) $r['mid']][] = ['id' => (int) $r['id'], 'name' => mb_substr((string) $r['name'], 0, 80), 'color' => preg_match('/^#[0-9a-f]{6}$/i', (string) $r['color']) ? (string) $r['color'] : ''];
        }
    } catch (Throwable $e) {}
    return $out;
}

/* ─── ✉️ Pièces manquantes d'une correspondance (« ✉️ Noter une pièce manquante » dans le fil des Lettres) ───
 * Une pièce qu'on sait perdue ou pas encore retrouvée (« la lettre de mai 1916 dont parle la suivante ») : une ligne
 * à sa place dans le fil, sans fichier. Table créée à la demande (doc_missing_pieces) ; une pièce retirée est gardée
 * (deleted_at) pour « ↶ Annuler ». */
function onglets_missing_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS doc_missing_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, exchange_key TEXT NOT NULL DEFAULT '',
        after_media_id INTEGER NOT NULL DEFAULT 0, date_text TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_doc_missing_key ON doc_missing_pieces(exchange_key)');
    $done = true;
}
function onglets_missing_list(PDO $pdo): array
{
    try {
        onglets_missing_ensure($pdo);
        return array_map(static fn($r) => ['id' => (int) $r['id'], 'key' => (string) $r['exchange_key'], 'after' => (int) $r['after_media_id'], 'date_text' => (string) $r['date_text'],
            'title' => (string) $r['title'], 'note' => (string) $r['note'], 'created_at' => (string) $r['created_at']],
            $pdo->query('SELECT * FROM doc_missing_pieces WHERE deleted_at IS NULL ORDER BY id LIMIT 5000')->fetchAll(PDO::FETCH_ASSOC));
    } catch (Throwable $e) { return []; }
}

/** 📚 la citation toute prête d'un document (cote, fonds, folio, lien), dans les 4 styles de lib/citation_styles.php */
function onglets_citation(PDO $pdo, int $id, array $g = []): array
{
    if (!function_exists('cite_format')) { require_once __DIR__ . '/citation_styles.php'; }
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo) : '';
    $s = $pdo->prepare("SELECT * FROM media m WHERE m.id=?{$sealed}"); $s->execute([$id]);
    $m = $s->fetch(PDO::FETCH_ASSOC);
    if (!$m) { throw new LcndaBadInput('Document introuvable : il n’existe pas, ou plus.'); }
    $service = null;
    if (onglets_has_col($pdo, 'media', 'archive_service_id') && (int) ($m['archive_service_id'] ?? 0) > 0) {
        try { $a = $pdo->prepare('SELECT * FROM archive_services WHERE id=?'); $a->execute([(int) $m['archive_service_id']]); $service = $a->fetch(PDO::FETCH_ASSOC) ?: null; } catch (Throwable $e) {}
    }
    $url = (string) ($m['document_url'] ?? '');
    if (!preg_match('~^https?://~i', $url)) { $url = ''; }
    $title = trim((string) ($m['document_title'] ?? '')) ?: trim((string) ($m['title'] ?? '')) ?: 'Document';
    $src = ['id' => $id, 'title' => $title, 'source_type' => trim((string) ($m['document_reference'] ?? '')) !== '' || $service ? 'archive' : 'other', 'author' => '', 'agency' => '',
        'publication' => '', 'archive_cote' => (string) ($m['document_reference'] ?? ''), 'archive_series' => (string) ($m['archive_series'] ?? ''), 'url' => $url,
        '_service' => $service ? ['name' => (string) ($service['name'] ?? ''), 'short_name' => (string) ($service['short_name'] ?? ''), 'city' => (string) ($service['city'] ?? '')] : null];
    $c = ['view_url' => $url];
    $folio = mb_substr(trim(safe_text($g['folio'] ?? '')), 0, 60);
    if ($folio === '' && trim((string) ($m['document_pages'] ?? '')) !== '') { $folio = mb_substr(trim((string) $m['document_pages']), 0, 60); }
    if ($folio !== '') { $c['view'] = $folio; }
    $parts = cite_parts($src, $c, ['act_date' => (string) ($m['date_text'] ?? ''), 'what' => $title]);
    return ['id' => $id, 'styles' => cite_format($parts), 'names' => CITE_STYLES];
}

/* ─── ✎ Les écritures de l'onglet Documents (POST api.php?action=onglets_write, {op, …}) ───
 *  doc_save     {media_id, title?, date_text?, document_reference?, place_id?} → {before, after}   (✎ Modifier sur place)
 *  doc_people   {media_id, add: [ids], remove: [ids]} → {added, removed}                           (personnes reliées ; ↶ = l'inverse)
 *  missing_add  {key, after, date_text, title, note} → {id} ; missing_delete / missing_restore {id}  (✉️ pièce manquante)
 * Hors mode consultation seulement (kiosk_guard l'a déjà refusé avant ; vérifié encore ici). */
function onglets_api_post(PDO $pdo, array $d): array
{
    if (onglets_kiosk()) { throw new RuntimeException('Mode consultation : rien ne peut être modifié.'); }
    $op = (string) ($d['op'] ?? '');
    $mediaRow = static function (int $id) use ($pdo): array {
        $s = $pdo->prepare('SELECT * FROM media WHERE id=?'); $s->execute([$id]); $m = $s->fetch(PDO::FETCH_ASSOC);
        if (!$m) { throw new LcndaBadInput('Document introuvable.'); }
        return $m;
    };
    switch ($op) {
        case 'doc_save': {
            $id = safe_int($d['media_id'] ?? 0); $m = $mediaRow($id);
            $set = []; $vals = [];
            foreach (['title' => 500, 'date_text' => 500, 'document_reference' => 500] as $k => $max) {
                if (array_key_exists($k, $d)) { $set[] = "$k=?"; $vals[] = mb_substr(trim(safe_text((string) $d[$k])), 0, $max); }
            }
            $before = ['title' => (string) $m['title'], 'date_text' => (string) $m['date_text'], 'document_reference' => (string) $m['document_reference']];
            if (onglets_has_col($pdo, 'media', 'place_id')) {
                $before['place_id'] = (int) ($m['place_id'] ?? 0);
                if (array_key_exists('place_id', $d)) {
                    $pid = safe_int($d['place_id'] ?? 0);
                    if ($pid) { $c = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $c->execute([$pid]); if (!$c->fetchColumn()) { throw new LcndaBadInput('Lieu introuvable.'); } }
                    $set[] = 'place_id=?'; $vals[] = $pid ?: null;
                }
            }
            if (!$set) { return ['before' => $before, 'after' => $before, 'unchanged' => true]; }
            $vals[] = $id;
            $pdo->prepare('UPDATE media SET ' . implode(',', $set) . ' WHERE id=?')->execute($vals);
            $after = $mediaRow($id);
            log_change($pdo, 'media', $id, 'update', 'Document modifié dans l’onglet Documents : « ' . mb_substr((string) ($after['title'] ?: '#' . $id), 0, 120) . ' »', $m, $after);
            return ['before' => $before, 'after' => ['title' => (string) $after['title'], 'date_text' => (string) $after['date_text'], 'document_reference' => (string) $after['document_reference'], 'place_id' => (int) ($after['place_id'] ?? 0)]];
        }
        case 'doc_people': {
            $id = safe_int($d['media_id'] ?? 0); $mediaRow($id);
            $ids = static fn($v) => array_values(array_unique(array_filter(array_map('safe_int', array_slice(is_array($v) ? $v : [], 0, 500)))));
            $add = $ids($d['add'] ?? []); $rem = $ids($d['remove'] ?? []);
            $added = []; $removed = [];
            $has = $pdo->prepare("SELECT 1 FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=?");
            $exists = $pdo->prepare('SELECT 1 FROM persons WHERE id=?');
            foreach ($add as $pid) {
                $exists->execute([$pid]); if (!$exists->fetchColumn()) { continue; }
                $has->execute([$id, $pid]); if ($has->fetchColumn()) { continue; }
                $pos = $pdo->prepare("SELECT COALESCE(MAX(position),0)+1 FROM media_links WHERE entity_type='person' AND entity_id=?"); $pos->execute([$pid]);
                $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$id, $pid, (float) $pos->fetchColumn()]);
                $added[] = $pid;
            }
            foreach ($rem as $pid) {
                $del = $pdo->prepare("DELETE FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=?"); $del->execute([$id, $pid]);
                if ($del->rowCount()) { $removed[] = $pid; }
            }
            if ($added || $removed) { log_change($pdo, 'media', $id, 'link-media', 'Personnes reliées au document : +' . count($added) . ' / −' . count($removed)); }
            return ['added' => $added, 'removed' => $removed];
        }
        case 'missing_add': {
            onglets_missing_ensure($pdo);
            $key = mb_substr(trim(safe_text((string) ($d['key'] ?? ''))), 0, 400);
            if ($key === '') { throw new LcndaBadInput('Correspondance inconnue.'); }
            $title = mb_substr(trim(safe_text((string) ($d['title'] ?? ''))), 0, 200);
            $date = mb_substr(trim(safe_text((string) ($d['date_text'] ?? ''))), 0, 80);
            if ($title === '' && $date === '') { throw new LcndaBadInput('Écris au moins une date ou quelques mots sur la pièce manquante.'); }
            $pdo->prepare('INSERT INTO doc_missing_pieces(exchange_key, after_media_id, date_text, title, note) VALUES(?,?,?,?,?)')
                ->execute([$key, safe_int($d['after'] ?? 0), $date, $title, mb_substr(trim(safe_text((string) ($d['note'] ?? ''))), 0, 2000)]);
            $nid = (int) $pdo->lastInsertId();
            log_change($pdo, 'meta', 0, 'create', 'Pièce manquante notée dans une correspondance : ' . ($title ?: $date));
            return ['id' => $nid];
        }
        case 'missing_delete': case 'missing_restore': {
            onglets_missing_ensure($pdo);
            $id = safe_int($d['id'] ?? 0);
            $s = $pdo->prepare('UPDATE doc_missing_pieces SET deleted_at=' . ($op === 'missing_delete' ? 'CURRENT_TIMESTAMP' : 'NULL') . ' WHERE id=?'); $s->execute([$id]);
            if (!$s->rowCount()) { throw new LcndaBadInput('Pièce manquante introuvable.'); }
            return ['ok' => true];
        }
    }
    throw new RuntimeException('Demande inconnue.');
}

function onglets_api_get(PDO $pdo, array $g): array
{
    return match (scalar_text($g['op'] ?? '', 'op')) {
        'documents' => onglets_documents($pdo),
        'citation' => onglets_citation($pdo, safe_int($g['id'] ?? 0), $g),
        'missing' => ['missing' => onglets_missing_list($pdo)],
        'document' => onglets_document($pdo, safe_int($g['id'] ?? 0)),
        'artists' => onglets_artists($pdo),
        'place_point' => onglets_place_point($pdo, safe_int($g['id'] ?? 0)),
        default => throw new RuntimeException('Demande inconnue.'),
    };
}
