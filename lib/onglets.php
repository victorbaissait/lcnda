<?php
declare(strict_types=1);

/**
 * 📄 Documents et 🎨 Catalogue raisonné : deux onglets du menu du haut, cachés au départ (maquette
 * docs/design/onglets-documents-catalogue.html). Interface : assets/js/heritage-onglets-documents.js et
 * heritage-onglets-catalogue.js. Rien de nouveau dans la base : les documents sont les médias (table media), le catalogue
 * est celui des Artistes (table items, lib/art_engine.php).
 *
 * Lecture seule. Une seule route :
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
        $out[(int) $r['media_id']][] = ['id' => (int) $r['pid'], 'name' => trim(((string) $r['first_name']) . ' ' . ((string) $r['last_name'])) ?: 'Personne sans nom', 'gender' => (string) $r['gender']];
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
    try { foreach ($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['media_id']] ??= (string) $r['place']; } } catch (Throwable $e) {}
    return $out;
}

/** la liste : une ligne courte par document (la colonne de gauche, A → Z ou dossiers) */
function onglets_documents(PDO $pdo): array
{
    $series = onglets_has_col($pdo, 'media', 'archive_series') ? "COALESCE(m.archive_series,'')" : "''";
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo) : '';
    $s = $pdo->prepare("SELECT m.id, m.title, m.document_title, m.filename, m.thumbnail, m.media_type, COALESCE(m.date_text,'') AS date_text,
            COALESCE(m.document_reference,'') AS cote, COALESCE(m.media_subject_type,'') AS subject, COALESCE(m.correspondence_type,'') AS corr,
            CASE WHEN trim(COALESCE(m.transcription,''))<>'' THEN 1 ELSE 0 END AS has_tr, m.created_at, {$series} AS series,
            (SELECT count(*) FROM media_links l WHERE l.media_id=m.id) AS links
        FROM media m WHERE 1{$sealed} ORDER BY m.id LIMIT " . (ONGLETS_MAX_DOCS + 1));
    $s->execute();
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $more = count($rows) > ONGLETS_MAX_DOCS;
    if ($more) { array_pop($rows); }
    $people = onglets_media_people($pdo);
    $places = onglets_media_places($pdo);
    $docs = array_map(static function (array $r) use ($people, $places) {
        $id = (int) $r['id'];
        $title = trim((string) $r['title']) ?: trim((string) $r['document_title']) ?: trim((string) $r['filename']) ?: 'Document sans titre';
        $pp = $people[$id] ?? [];
        return ['id' => $id, 'title' => mb_substr($title, 0, 200), 'media_type' => (string) $r['media_type'], 'filename' => (string) $r['filename'], 'thumbnail' => (string) $r['thumbnail'],
            'date_text' => mb_substr((string) $r['date_text'], 0, 80), 'year' => onglets_year((string) $r['date_text']), 'cote' => mb_substr((string) $r['cote'], 0, 80),
            'subject' => (string) $r['subject'], 'corr' => (string) $r['corr'], 'has_tr' => (int) $r['has_tr'], 'created_at' => (string) $r['created_at'],
            'series' => mb_substr((string) $r['series'], 0, 120), 'links' => (int) $r['links'], 'place' => mb_substr($places[$id] ?? '', 0, 120),
            'people' => array_slice(array_map(static fn($p) => ['id' => $p['id'], 'name' => $p['name']], $pp), 0, 4), 'people_count' => count($pp)];
    }, $rows);
    return ['documents' => $docs, 'total' => count($docs), 'more' => $more, 'readonly' => onglets_kiosk()];
}

/** la fiche complète d'un document (à droite) */
function onglets_document(PDO $pdo, int $id): array
{
    if ($id <= 0) { throw new RuntimeException('Document introuvable.'); }
    $sealed = function_exists('sealed_media_sql') ? sealed_media_sql($pdo) : '';
    $s = $pdo->prepare("SELECT * FROM media m WHERE m.id=?{$sealed}"); $s->execute([$id]);
    $m = $s->fetch(PDO::FETCH_ASSOC);
    if (!$m) { throw new RuntimeException('Ce document n’existe plus.'); }
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
        'people' => $people, 'links' => $links, 'places' => $places];
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

function onglets_api_get(PDO $pdo, array $g): array
{
    return match (scalar_text($g['op'] ?? '', 'op')) {
        'documents' => onglets_documents($pdo),
        'document' => onglets_document($pdo, safe_int($g['id'] ?? 0)),
        'artists' => onglets_artists($pdo),
        default => throw new RuntimeException('Demande inconnue.'),
    };
}
