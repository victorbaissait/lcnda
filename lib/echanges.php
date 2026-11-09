<?php
declare(strict_types=1);

/**
 * ⤓ Exports « en plus » (Réglages → Export, « ⤓ Exporter ▾ » des listes) :
 *  - GEDCOM « Pour Geneanet » (export_gedcom avec target=geneanet : voir lib/gedcom.php) ;
 *  - GEDCOM-X (JSON de FamilySearch) ;
 *  - agenda .ics (anniversaires de naissance, de mariage, de décès et fêtes du prénom ; RFC 5545) ;
 *  - vCard 4.0 (.vcf, RFC 6350) des contacts : répertoire des vivants, services d'archives, cousins ADN, correspondants ;
 *  - lieux en KML (Google Earth, un dossier par sorte d'événement) et en GeoJSON (RFC 7946).
 * L'export vers Gramps est dans lib/export_gramps.php ; il prend ses données dans echanges_dataset().
 *
 * Vie privée : mêmes règles que le GEDCOM « pour partager » (gedcom_share_hidden) — vivants (même probables) et fiches
 * confidentielles anonymes (« Personne vivante », sexe et liens seulement) ou retirés (living=drop). Le mode
 * confidentialité des Réglages (privacy=1) l'impose.
 */

const ECH_MAX_ROWS = 400000; // garde-fou : au-delà, l'export est refusé avec une phrase claire

/** Vrai si l'export doit cacher les vivants et les fiches confidentielles. */
function echanges_share(bool $default = true): bool
{
    return export_option_enabled('share', $default) || export_privacy_enabled();
}

/** « anon » (gardés anonymes, liens familiaux seulement) ou « drop » (retirés du fichier). */
function echanges_living_mode(): string
{
    return ($_GET['living'] ?? '') === 'drop' ? 'drop' : 'anon';
}

/** Nom affiché d'une fiche : « Jean Pierre DUPONT ». */
function echanges_person_name(array $p): string
{
    $given = trim(implode(' ', array_filter([trim((string) ($p['first_name'] ?? '')), trim((string) ($p['middle_name'] ?? ''))])));
    return trim($given . ' ' . mb_strtoupper(trim((string) ($p['last_name'] ?? '')))) ?: 'Sans nom';
}

/**
 * Toutes les données d'un export « en plus », filtrées selon la vie privée et la branche (gedcom_branch_ids lit $_GET).
 * Une personne masquée (hidden) n'a plus rien d'autre que son sexe et ses liens familiaux (mode anon) ou disparaît (drop).
 */
function echanges_dataset(PDO $pdo, bool $shareDefault = true): array
{
    $share = echanges_share($shareDefault);
    $mode = echanges_living_mode();
    $total = (int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn();
    if ($total > ECH_MAX_ROWS) { throw new RuntimeException('La base est trop grande pour cet export (plus de ' . ECH_MAX_ROWS . ' fiches).'); }
    $all = $pdo->query(person_select() . ' ORDER BY p.id')->fetchAll();
    $families = $pdo->query('SELECT * FROM families ORDER BY id')->fetchAll();
    $branch = gedcom_branch_ids($pdo);
    $kidsAll = [];
    foreach ($pdo->query('SELECT * FROM family_children ORDER BY family_id, position, id') as $c) { $kidsAll[(int) $c['family_id']][(int) $c['child_id']] = $c; }
    if ($branch !== null) {
        $all = array_values(array_filter($all, static fn($p) => isset($branch[(int) $p['id']])));
        $families = array_values(array_filter($families, static function ($f) use ($branch, $kidsAll) {
            $m = array_filter([(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0), ...array_keys($kidsAll[(int) $f['id']] ?? [])], static fn($id) => isset($branch[$id]));
            return count($m) >= 2;
        }));
    }
    $hidden = $share ? gedcom_share_hidden($pdo, $all, $families) : [];
    $persons = [];
    foreach ($all as $p) {
        $id = (int) $p['id'];
        if (!$share && !export_person_allowed($p)) { continue; }
        if (isset($hidden[$id]) && $mode === 'drop') { continue; }
        $persons[$id] = $p;
    }
    $isOpen = static fn(int $id): bool => isset($persons[$id]) && !isset($hidden[$id]);
    $fams = []; $children = [];
    foreach ($families as $f) {
        $fid = (int) $f['id'];
        $p1 = (int) ($f['partner1_id'] ?? 0); $p2 = (int) ($f['partner2_id'] ?? 0);
        $kids = [];
        foreach ($kidsAll[$fid] ?? [] as $cid => $c) { if (isset($persons[$cid])) { $kids[$cid] = $c; } }
        $members = array_filter([$p1, $p2, ...array_keys($kids)], static fn($id) => $id && isset($persons[$id]));
        if (!$members) { continue; }
        $f['partner1_id'] = isset($persons[$p1]) ? $p1 : 0;
        $f['partner2_id'] = isset($persons[$p2]) ? $p2 : 0;
        $f['hidden'] = isset($hidden[$p1]) || isset($hidden[$p2]);
        $fams[$fid] = $f; $children[$fid] = $kids;
    }
    $events = []; $byPerson = []; $byFamily = [];
    $placeIds = [];
    $stmt = $pdo->query("SELECT e.*, t.gedcom_tag, t.label AS type_label, t.color AS type_color, pl.name AS place_name, pl.subdivision, pl.county, pl.state, pl.country,
            pl.latitude, pl.longitude, pl.admin4_code
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        ORDER BY COALESCE(e.sort_date,''), COALESCE(e.year,9999), e.id");
    foreach ($stmt as $e) {
        $pid = (int) ($e['person_id'] ?? 0); $fid = (int) ($e['family_id'] ?? 0);
        if (($e['scope'] ?? '') === 'person') { if (!$pid || !$isOpen($pid)) { continue; } $byPerson[$pid][] = (int) $e['id']; }
        elseif (($e['scope'] ?? '') === 'family') { if (!$fid || !isset($fams[$fid]) || $fams[$fid]['hidden']) { continue; } $byFamily[$fid][] = (int) $e['id']; }
        else { continue; }
        $events[(int) $e['id']] = $e;
        if ((int) ($e['place_id'] ?? 0)) { $placeIds[(int) $e['place_id']] = true; }
    }
    $places = [];
    foreach (array_chunk(array_keys($placeIds), 500) as $chunk) {
        $s = $pdo->prepare('SELECT * FROM places WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
        $s->execute($chunk);
        foreach ($s as $pl) { $places[(int) $pl['id']] = $pl; }
    }
    $open = static function (string $type, int $id) use ($isOpen, $fams, $events, &$sources): bool {
        return match ($type) {
            'person' => $isOpen($id),
            'family' => isset($fams[$id]) && !$fams[$id]['hidden'],
            'event' => isset($events[$id]),
            'source' => isset($sources[$id]),
            default => false,
        };
    };
    $sources = [];
    foreach ($pdo->query('SELECT * FROM sources ORDER BY id') as $s) { $sources[(int) $s['id']] = $s; }
    $citations = []; $cited = [];
    foreach ($pdo->query('SELECT * FROM source_links WHERE source_record_id IS NOT NULL ORDER BY id') as $l) {
        if (!isset($sources[(int) $l['source_record_id']]) || !in_array($l['entity_type'], ['person', 'family', 'event'], true) || !$open((string) $l['entity_type'], (int) $l['entity_id'])) { continue; }
        $citations[$l['entity_type'] . ':' . (int) $l['entity_id']][] = $l;
        $cited[(int) $l['source_record_id']] = true;
    }
    if ($share && $hidden) { // une source citée seulement par des fiches masquées ne part pas
        $anyCite = array_fill_keys(array_map('intval', $pdo->query('SELECT DISTINCT source_record_id FROM source_links WHERE source_record_id IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN)), true);
        foreach (array_keys($sources) as $sid) { if (isset($anyCite[$sid]) && !isset($cited[$sid])) { unset($sources[$sid]); } }
    }
    $notes = [];
    foreach ($pdo->query('SELECT id, entity_type, entity_id, title, body FROM notes ORDER BY id') as $n) {
        if (trim((string) $n['body']) === '' && trim((string) $n['title']) === '') { continue; }
        if (!$open((string) $n['entity_type'], (int) $n['entity_id'])) { continue; }
        $notes[$n['entity_type'] . ':' . (int) $n['entity_id']][] = $n;
    }
    $media = []; $mediaBy = [];
    foreach ($pdo->query('SELECT ml.entity_type, ml.entity_id, m.* FROM media_links ml JOIN media m ON m.id=ml.media_id ORDER BY ml.position, ml.id') as $m) {
        if (!$open((string) $m['entity_type'], (int) $m['entity_id'])) { continue; }
        $mediaBy[$m['entity_type'] . ':' . (int) $m['entity_id']][(int) $m['id']] = true;
        $media[(int) $m['id']] = $m;
    }
    $labels = []; $labelList = [];
    try {
        foreach ($pdo->query("SELECT ll.entity_type, ll.entity_id, l.id, l.name, l.color FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type IN ('person','family','event') ORDER BY l.name") as $l) {
            if (!$open((string) $l['entity_type'], (int) $l['entity_id'])) { continue; }
            $labels[$l['entity_type'] . ':' . (int) $l['entity_id']][] = (int) $l['id'];
            $labelList[(int) $l['id']] = $l;
        }
    } catch (Throwable) {}
    $variants = [];
    foreach ($pdo->query('SELECT * FROM name_variants ORDER BY person_id, position, id') as $v) { if ($isOpen((int) $v['person_id'])) { $variants[(int) $v['person_id']][] = $v; } }
    $witnesses = [];
    try {
        foreach ($pdo->query('SELECT event_id, person_id, note FROM event_witnesses ORDER BY event_id, position, id') as $w) {
            if (isset($events[(int) $w['event_id']]) && $isOpen((int) $w['person_id'])) { $witnesses[(int) $w['event_id']][] = $w; }
        }
    } catch (Throwable) {}
    return ['share' => $share, 'mode' => $mode, 'persons' => $persons, 'hidden' => array_intersect_key($hidden, $persons), 'families' => $fams, 'children' => $children,
        'events' => $events, 'byPerson' => $byPerson, 'byFamily' => $byFamily, 'places' => $places, 'sources' => $sources, 'citations' => $citations,
        'notes' => $notes, 'media' => $media, 'mediaBy' => $mediaBy, 'labels' => $labels, 'labelList' => $labelList, 'variants' => $variants, 'witnesses' => $witnesses];
}

/** Nom complet d'un lieu « Commune, Département, Région, Pays » (sans répétition). */
function echanges_place_title(array $pl): string
{
    $parts = [];
    foreach ([$pl['subdivision'] ?? '', $pl['name'] ?? $pl['place_name'] ?? '', $pl['county'] ?? '', $pl['state'] ?? '', $pl['country'] ?? ''] as $v) {
        $v = trim((string) $v);
        if ($v !== '' && !in_array(gedcom_fold($v), array_map('gedcom_fold', $parts), true)) { $parts[] = $v; }
    }
    return implode(', ', $parts);
}

// ─── Dates : LCNDA → GEDCOM → Gramps / GEDCOM-X ──────────────────────────────────────────────

/**
 * Découpe une date GEDCOM (« ABT 28 JUN 1814 », « BET 1880 AND 1885 », « @#DJULIAN@ 11 FEB 1700/01 », « (texte) »)
 * → ['kind' => val|range|span|str, 'mod' => ''|about|before|after, 'quality' => ''|estimated|calculated,
 *    'a' => [y,m,d,bc], 'b' => [y,m,d,bc]|null, 'cal' => gregorian|julian|republican, 'text' => texte d'origine].
 */
function echanges_date_parts(string $ged): array
{
    $ged = trim($ged);
    $out = ['kind' => 'str', 'mod' => '', 'quality' => '', 'a' => null, 'b' => null, 'cal' => gedcom_date_calendar($ged), 'text' => $ged];
    if ($ged === '' || $ged[0] === '(') { $out['text'] = trim($ged, '()'); return $out; }
    $core = static function (string $c): ?array {
        $c = trim(preg_replace('/@#D[^@]*@|\b(?:JULIAN|GREGORIAN|FRENCH_R|HEBREW)\b/', '', $c) ?? $c);
        $bc = (bool) preg_match('/\s+B\.?C\.?$/i', $c);
        $c = trim(preg_replace('/\s+B\.?C\.?$/i', '', $c) ?? $c);
        if (!preg_match('/^(?:(\d{1,2})\s+)?(?:([A-Z]{3,4})\s+)?(\d{1,4})(?:\/\d{1,2})?$/i', $c, $m)) { return null; }
        $mo = 0;
        if ($m[2] !== '') {
            $i = array_search(strtoupper($m[2]), GEDCOM_MONTHS, true);
            if ($i === false) { $i = array_search(strtoupper($m[2]), GEDCOM_REPUBLICAN_MONTHS, true); }
            if ($i === false) { return null; }
            $mo = $i + 1;
        }
        return [(int) $m[3], $mo, $m[1] !== '' ? (int) $m[1] : 0, $bc];
    };
    $v = $ged;
    if (preg_match('/^BET\s+(.+)\s+AND\s+(.+)$/i', $v, $m)) { $a = $core($m[1]); $b = $core($m[2]); if ($a && $b) { return ['kind' => 'range', 'a' => $a, 'b' => $b] + $out; } return $out; }
    if (preg_match('/^FROM\s+(.+)\s+TO\s+(.+)$/i', $v, $m)) { $a = $core($m[1]); $b = $core($m[2]); if ($a && $b) { return ['kind' => 'span', 'a' => $a, 'b' => $b] + $out; } return $out; }
    if (preg_match('/^FROM\s+(.+)$/i', $v, $m) && ($a = $core($m[1]))) { return ['kind' => 'val', 'mod' => 'after', 'a' => $a] + $out; }
    if (preg_match('/^TO\s+(.+)$/i', $v, $m) && ($a = $core($m[1]))) { return ['kind' => 'val', 'mod' => 'before', 'a' => $a] + $out; }
    foreach (['ABT' => ['about', ''], 'EST' => ['about', 'estimated'], 'CAL' => ['', 'calculated'], 'BEF' => ['before', ''], 'AFT' => ['after', '']] as $k => [$mod, $q]) {
        if (preg_match('/^' . $k . '\.?\s+(.+)$/i', $v, $m)) { $a = $core($m[1]); return $a ? ['kind' => 'val', 'mod' => $mod, 'quality' => $q, 'a' => $a] + $out : $out; }
    }
    $a = $core($v);
    return $a ? ['kind' => 'val', 'a' => $a] + $out : $out;
}

/** La date GEDCOM d'un événement de LCNDA. */
function echanges_event_gedcom_date(array $e): string
{
    $txt = trim((string) ($e['date_text'] ?? ''));
    if ($txt === '') { return ($e['year'] ?? null) ? (string) (int) $e['year'] : ''; }
    return gedcom_date_out($txt, (string) ($e['date_calendar'] ?? 'gregorian'), '5.5.1');
}

/** [y,m,d] → « 1814-06-28 », « 1814-06 », « 1814 » (format des dates de Gramps). */
function echanges_ymd(array $p, string $zero = ''): string
{
    $s = ($p[3] ?? false ? '-' : '') . str_pad((string) $p[0], 4, '0', STR_PAD_LEFT);
    if ($p[1]) { $s .= '-' . str_pad((string) $p[1], 2, '0', STR_PAD_LEFT); if ($p[2]) { $s .= '-' . str_pad((string) $p[2], 2, '0', STR_PAD_LEFT); } }
    return $s;
}

/** Date formelle GEDCOM-X (« +1814-06-28 », « A+1750 », « +1880/+1885 », « /+1800 ») ; '' si impossible (autre calendrier, texte). */
function echanges_gedcomx_formal(string $ged): string
{
    $d = echanges_date_parts($ged);
    if ($d['kind'] === 'str' || $d['cal'] !== 'gregorian' || ($d['a'][3] ?? false) || ($d['b'][3] ?? false)) { return ''; }
    $one = static fn(array $p): string => '+' . echanges_ymd($p);
    if ($d['kind'] === 'range') { return 'A' . $one($d['a']) . '/' . $one($d['b']); }
    if ($d['kind'] === 'span') { return $one($d['a']) . '/' . $one($d['b']); }
    return match ($d['mod']) { 'about' => 'A' . $one($d['a']), 'before' => '/' . $one($d['a']), 'after' => $one($d['a']) . '/', default => $one($d['a']) };
}

// ─── Envoi d'un fichier ─────────────────────────────────────────────────────────────────────

function echanges_send(string $filename, string $mime, string $body, array $headers = []): never
{
    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('Access-Control-Expose-Headers: X-LCNDA-Count, X-LCNDA-Skipped');
    foreach ($headers as $k => $v) { header($k . ': ' . $v); }
    header('Content-Length: ' . strlen($body));
    echo $body;
    exit;
}

/** Point d'entrée des exports (GET action=export_plus&format=…). */
function export_plus(PDO $pdo): never
{
    @set_time_limit(0);
    $format = (string) ($_GET['format'] ?? '');
    try {
        match ($format) {
            'gramps' => (static function () use ($pdo) { require_once __DIR__ . '/export_gramps.php'; export_gramps($pdo); })(),
            'gedcomx' => export_gedcomx($pdo),
            'ics' => export_ics($pdo),
            'vcard' => export_vcard($pdo),
            'kml', 'geojson' => export_places_geo($pdo, $format),
            default => json_response(['error' => 'Format d’export inconnu.'], 422),
        };
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
    exit;
}

// ─── GEDCOM-X (JSON) ─────────────────────────────────────────────────────────────────────────

/** Types GEDCOM-X des faits (http://gedcomx.org/…) d'après la balise GEDCOM. */
function echanges_gedcomx_fact_type(string $tag, string $label, string $scope): string
{
    static $map = ['BIRT' => 'Birth', 'DEAT' => 'Death', 'BURI' => 'Burial', 'CREM' => 'Cremation', 'CHR' => 'Christening', 'BAPM' => 'Baptism',
        'ADOP' => 'Adoption', 'BARM' => 'BarMitzvah', 'BASM' => 'BatMitzvah', 'BLES' => 'Blessing', 'CONF' => 'Confirmation', 'FCOM' => 'FirstCommunion',
        'ORDN' => 'Ordination', 'NATU' => 'Naturalization', 'EMIG' => 'Emigration', 'IMMI' => 'Immigration', 'CENS' => 'Census', 'PROB' => 'Probate',
        'WILL' => 'Will', 'GRAD' => 'Graduation', 'RETI' => 'Retirement', 'CAST' => 'Caste', 'DSCR' => 'PhysicalDescription', 'EDUC' => 'Education',
        'IDNO' => 'NationalId', 'NATI' => 'Nationality', 'NCHI' => 'NumberOfChildren', 'NMR' => 'NumberOfMarriages', 'OCCU' => 'Occupation',
        'PROP' => 'Property', 'RELI' => 'Religion', 'RESI' => 'Residence', 'TITL' => 'NobilityTitle', '_MILT' => 'MilitaryService',
        'MARR' => 'Marriage', 'DIV' => 'Divorce', 'DIVF' => 'DivorceFiling', 'ENGA' => 'Engagement', 'ANUL' => 'Annulment', 'MARB' => 'MarriageBanns',
        'MARC' => 'MarriageContract', 'MARL' => 'MarriageLicense', 'MARS' => 'MarriageSettlement'];
    $tag = strtoupper($tag);
    if ($scope === 'family' && $tag === 'RESI') { return 'http://gedcomx.org/Residence'; }
    return isset($map[$tag]) ? 'http://gedcomx.org/' . $map[$tag] : 'data:,' . rawurlencode($label !== '' ? $label : 'Événement');
}

function export_gedcomx(PDO $pdo): never
{
    $d = echanges_dataset($pdo, true);
    $doc = ['description' => '#SD', 'attribution' => ['created' => (int) (microtime(true) * 1000), 'changeMessage' => 'Exporté depuis LCNDA (Le Carnet numérique des ancêtres)'],
        'persons' => [], 'relationships' => [], 'sourceDescriptions' => [], 'agents' => [], 'places' => []];
    $doc['sourceDescriptions'][] = ['id' => 'SD', 'resourceType' => 'http://gedcomx.org/DigitalArtifact', 'titles' => [['value' => 'Généalogie exportée depuis LCNDA', 'lang' => 'fr']], 'created' => (int) (microtime(true) * 1000)];
    $placeRef = [];
    foreach ($d['places'] as $id => $pl) {
        $p = ['id' => 'P' . $id, 'names' => [['lang' => 'fr', 'value' => echanges_place_title($pl)]]];
        if ($pl['latitude'] !== null && $pl['longitude'] !== null && $pl['latitude'] !== '' && $pl['longitude'] !== '') { $p['latitude'] = (float) $pl['latitude']; $p['longitude'] = (float) $pl['longitude']; }
        $doc['places'][] = $p; $placeRef[$id] = true;
    }
    $agents = [];
    foreach ($d['sources'] as $sid => $s) {
        $sd = ['id' => 'S' . $sid, 'resourceType' => 'http://gedcomx.org/PhysicalArtifact', 'titles' => [['value' => (string) ($s['title'] ?: 'Source sans titre')]]];
        $cit = trim(implode(', ', array_filter([trim((string) $s['author']), trim((string) $s['title']), trim((string) $s['publication'])])));
        $sd['citations'] = [['value' => $cit !== '' ? $cit : 'Source sans titre']];
        if (trim((string) $s['url']) !== '' && preg_match('#^https?://#i', trim((string) $s['url']))) { $sd['about'] = trim((string) $s['url']); }
        if (trim((string) $s['text']) !== '') { $sd['notes'] = [['text' => (string) $s['text']]]; }
        $agency = trim((string) ($s['agency'] ?? ''));
        if ($agency !== '') {
            $k = gedcom_fold($agency);
            if (!isset($agents[$k])) { $agents[$k] = 'A' . (count($agents) + 1); $doc['agents'][] = ['id' => $agents[$k], 'names' => [['value' => $agency]]]; }
            $sd['repository'] = ['resource' => '#' . $agents[$k]];
        }
        $doc['sourceDescriptions'][] = $sd;
    }
    $compNo = 0; $compIds = [];
    $sourceRefs = static function (string $key) use ($d, &$doc, &$compNo, &$compIds): array {
        $out = [];
        foreach ($d['citations'][$key] ?? [] as $c) {
            $sid = (int) $c['source_record_id']; if (!isset($d['sources'][$sid])) { continue; }
            $page = trim((string) ($c['page'] ?? ''));
            if ($page === '') { $out[] = ['description' => '#S' . $sid]; continue; }
            $ck = $sid . '|' . $page;
            if (!isset($compIds[$ck])) {
                $compIds[$ck] = 'S' . $sid . '-' . (++$compNo);
                $doc['sourceDescriptions'][] = ['id' => $compIds[$ck], 'resourceType' => 'http://gedcomx.org/PhysicalArtifact', 'componentOf' => ['description' => '#S' . $sid],
                    'titles' => [['value' => (string) ($d['sources'][$sid]['title'] ?: 'Source') . ' — ' . $page]], 'citations' => [['value' => (string) ($d['sources'][$sid]['title'] ?: 'Source') . ', ' . $page]]];
            }
            $out[] = ['description' => '#' . $compIds[$ck]];
        }
        return $out;
    };
    $notesOf = static function (string $key) use ($d): array {
        return array_map(static fn($n) => array_filter(['subject' => trim((string) $n['title']), 'text' => trim((string) $n['body']) !== '' ? (string) $n['body'] : (string) $n['title']], static fn($v) => $v !== ''), $d['notes'][$key] ?? []);
    };
    $fact = static function (array $e, string $scope) use ($placeRef, $sourceRefs, $notesOf): array {
        $f = ['type' => echanges_gedcomx_fact_type((string) $e['gedcom_tag'], (string) $e['type_label'], $scope)];
        $ged = echanges_event_gedcom_date($e);
        if ($ged !== '') {
            $f['date'] = ['original' => trim((string) ($e['date_text'] ?? '')) ?: $ged];
            if (($formal = echanges_gedcomx_formal($ged)) !== '') { $f['date']['formal'] = $formal; }
        }
        if ((int) ($e['place_id'] ?? 0)) {
            $f['place'] = ['original' => echanges_place_title($e)];
            if (isset($placeRef[(int) $e['place_id']])) { $f['place']['description'] = '#P' . (int) $e['place_id']; }
        }
        if (trim((string) ($e['title'] ?? '')) !== '') { $f['value'] = trim((string) $e['title']); }
        $q = []; if (trim((string) ($e['cause'] ?? '')) !== '') { $q[] = ['name' => 'http://gedcomx.org/Cause', 'value' => trim((string) $e['cause'])]; }
        if ($q) { $f['qualifiers'] = $q; }
        $notes = $notesOf('event:' . (int) $e['id']);
        if (trim((string) ($e['description'] ?? '')) !== '') { array_unshift($notes, ['text' => (string) $e['description']]); }
        if ($notes) { $f['notes'] = $notes; }
        if ($src = $sourceRefs('event:' . (int) $e['id'])) { $f['sources'] = $src; }
        return $f;
    };
    foreach ($d['persons'] as $pid => $p) {
        $g = match ($p['gender'] ?? '') { 'male' => 'Male', 'female' => 'Female', 'nonbinary' => 'Intersex', default => 'Unknown' };
        $person = ['id' => 'I' . $pid, 'gender' => ['type' => 'http://gedcomx.org/' . $g]];
        if (isset($d['hidden'][$pid])) {
            $person['living'] = $d['hidden'][$pid] === 'living';
            $person['private'] = true;
            $person['names'] = [['nameForms' => [['fullText' => $d['hidden'][$pid] === 'private' ? 'Fiche confidentielle' : 'Personne vivante']]]];
            $doc['persons'][] = $person; continue;
        }
        $person['living'] = ($p['living_status'] ?? '') === 'living';
        $nameForm = static function (array $n): array {
            $given = trim(implode(' ', array_filter([trim((string) ($n['first_name'] ?? '')), trim((string) ($n['middle_name'] ?? ''))])));
            $parts = [];
            if (trim((string) ($n['prefix'] ?? '')) !== '') { $parts[] = ['type' => 'http://gedcomx.org/Prefix', 'value' => trim((string) $n['prefix'])]; }
            if ($given !== '') { $parts[] = ['type' => 'http://gedcomx.org/Given', 'value' => $given]; }
            if (trim((string) ($n['last_name'] ?? '')) !== '') { $parts[] = ['type' => 'http://gedcomx.org/Surname', 'value' => trim((string) $n['last_name'])]; }
            if (trim((string) ($n['suffix'] ?? '')) !== '') { $parts[] = ['type' => 'http://gedcomx.org/Suffix', 'value' => trim((string) $n['suffix'])]; }
            return ['fullText' => trim($given . ' ' . trim((string) ($n['last_name'] ?? '')) . ' ' . trim((string) ($n['suffix'] ?? ''))) ?: 'Sans nom', 'parts' => $parts];
        };
        $person['names'] = [['type' => 'http://gedcomx.org/BirthName', 'preferred' => true, 'nameForms' => [$nameForm($p)]]];
        foreach ($d['variants'][$pid] ?? [] as $v) {
            $type = match ($v['type'] ?? '') { 'historical' => 'MarriedName', 'nickname' => 'Nickname', default => 'AlsoKnownAs' };
            $person['names'][] = ['type' => 'http://gedcomx.org/' . $type, 'nameForms' => [$nameForm($v)]];
        }
        $facts = [];
        foreach ($d['byPerson'][$pid] ?? [] as $eid) { $facts[] = $fact($d['events'][$eid], 'person'); }
        if (trim((string) ($p['occupation'] ?? '')) !== '' && !array_filter($facts, static fn($f) => $f['type'] === 'http://gedcomx.org/Occupation')) { $facts[] = ['type' => 'http://gedcomx.org/Occupation', 'value' => trim((string) $p['occupation'])]; }
        if ($facts) { $person['facts'] = $facts; }
        if ($n = $notesOf('person:' . $pid)) { $person['notes'] = $n; }
        if ($s = $sourceRefs('person:' . $pid)) { $person['sources'] = $s; }
        if (trim((string) ($p['familysearch_id'] ?? '')) !== '') { $person['identifiers'] = ['http://gedcomx.org/Persistent' => ['https://www.familysearch.org/ark:/61903/4:1:' . trim((string) $p['familysearch_id'])]]; }
        $doc['persons'][] = $person;
    }
    $relType = static fn(string $r): ?string => match ($r) { 'adopted' => 'http://gedcomx.org/AdoptiveParent', 'foster' => 'http://gedcomx.org/FosterParent', 'step' => 'http://gedcomx.org/StepParent', 'biological' => 'http://gedcomx.org/BiologicalParent', default => null };
    foreach ($d['families'] as $fid => $f) {
        $p1 = (int) $f['partner1_id']; $p2 = (int) $f['partner2_id'];
        if ($p1 && $p2) {
            $rel = ['id' => 'F' . $fid, 'type' => 'http://gedcomx.org/Couple', 'person1' => ['resource' => '#I' . $p1], 'person2' => ['resource' => '#I' . $p2]];
            $facts = []; foreach ($d['byFamily'][$fid] ?? [] as $eid) { $facts[] = $fact($d['events'][$eid], 'family'); }
            if ($facts) { $rel['facts'] = $facts; }
            if (!$f['hidden']) { if ($n = $notesOf('family:' . $fid)) { $rel['notes'] = $n; } if ($s = $sourceRefs('family:' . $fid)) { $rel['sources'] = $s; } }
            $doc['relationships'][] = $rel;
        }
        foreach ($d['children'][$fid] ?? [] as $cid => $c) {
            foreach ([[$p1, 'relation_to_partner1'], [$p2, 'relation_to_partner2']] as [$parent, $col]) {
                if (!$parent) { continue; }
                $r = ['id' => 'PC' . $fid . '-' . $parent . '-' . $cid, 'type' => 'http://gedcomx.org/ParentChild', 'person1' => ['resource' => '#I' . $parent], 'person2' => ['resource' => '#I' . $cid]];
                if (($t = $relType((string) ($c[$col] ?? 'biological'))) && ($c[$col] ?? 'biological') !== 'biological') { $r['facts'] = [['type' => $t]]; }
                $doc['relationships'][] = $r;
            }
        }
    }
    foreach (['relationships', 'sourceDescriptions', 'agents', 'places'] as $k) { if (!$doc[$k]) { unset($doc[$k]); } }
    $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    echanges_send('genealogie-gedcomx-' . date('Ymd-His') . '.json', 'application/x-gedcomx-v1+json; charset=utf-8', $json, ['X-LCNDA-Count' => (string) count($d['persons'])]);
}

// ─── Agenda .ics (RFC 5545) ─────────────────────────────────────────────────────────────────

function echanges_ics_text(string $v): string
{
    return str_replace(["\\", "\r\n", "\r", "\n", ',', ';'], ["\\\\", '\\n', '\\n', '\\n', '\\,', '\\;'], $v);
}

/** Une ligne pliée à 75 octets (RFC 5545 §3.1 / RFC 6350 §3.2), sans couper un caractère UTF-8 ; fin CRLF. */
function echanges_fold(string $line): string
{
    $out = []; $cur = ''; $size = 0;
    foreach (mb_str_split($line) as $ch) {
        $n = strlen($ch);
        if ($size + $n > ($out ? 74 : 75)) { $out[] = $cur; $cur = ''; $size = 0; }
        $cur .= $ch; $size += $n;
    }
    $out[] = $cur;
    return implode("\r\n ", $out) . "\r\n";
}

/**
 * Anniversaires (naissance, mariage, décès) et fêtes du prénom, chaque année.
 * who=all|sosa|branch (root_id = la personne n°1 ou le haut de la branche) ; living=1 : seulement les personnes en vie ;
 * groups=birth,union,death,feast ; alarm=1 : rappel la veille. Les fiches confidentielles ne sont jamais mises.
 */
function export_ics(PDO $pdo): never
{
    require_once __DIR__ . '/calendars.php';
    require_once __DIR__ . '/saints.php';
    $who = in_array($_GET['who'] ?? 'all', ['all', 'sosa', 'branch'], true) ? (string) ($_GET['who'] ?? 'all') : 'all';
    $root = (int) ($_GET['root_id'] ?? 0);
    $groups = array_values(array_intersect(explode(',', (string) ($_GET['groups'] ?? 'birth,union')), ['birth', 'union', 'death', 'feast']));
    if (!$groups) { throw new RuntimeException('Coche au moins une sorte d’anniversaire.'); }
    $onlyLiving = ($_GET['living'] ?? '') === '1';
    $alarm = ($_GET['alarm'] ?? '1') !== '0';
    $ids = null;
    if ($who !== 'all') {
        if ($root <= 0) { throw new RuntimeException($who === 'sosa' ? 'Aucune personne n°1 (Sosa) : choisis-la dans Réglages → Apparence.' : 'Choisis la personne en haut de la branche.'); }
        $ids = $who === 'sosa' ? h_ancestors($pdo, $root, 60) : h_descendants($pdo, [$root], 60, true);
    }
    $people = [];
    foreach ($pdo->query("SELECT p.id, p.first_name, p.last_name, p.gender, p.is_private, p.living_status, p.kind,
            EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI','CREM')) AS dead FROM persons p") as $p) {
        $people[(int) $p['id']] = $p;
    }
    $keepPerson = static function (int $id) use ($people, $ids, $onlyLiving): bool {
        $p = $people[$id] ?? null;
        if (!$p || (int) $p['is_private'] === 1) { return false; }
        if ($ids !== null && !isset($ids[$id])) { return false; }
        if ($onlyLiving && ((int) $p['dead'] || ($p['living_status'] ?? '') === 'deceased')) { return false; }
        return true;
    };
    $stamp = gmdate('Ymd\THis\Z');
    $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LCNDA//Genealogie//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' . echanges_ics_text('Anniversaires de la famille')];
    $count = 0; $skipped = 0;
    $vevent = static function (string $uid, int $y, int $m, int $d, string $summary, string $desc) use (&$lines, $stamp, $alarm, &$count): void {
        $next = (new DateTimeImmutable(sprintf('%04d-%02d-%02d', $y, $m, $d)))->modify('+1 day');
        array_push($lines, 'BEGIN:VEVENT', 'UID:' . $uid, 'DTSTAMP:' . $stamp, 'DTSTART;VALUE=DATE:' . sprintf('%04d%02d%02d', $y, $m, $d), 'DTEND;VALUE=DATE:' . $next->format('Ymd'),
            'SUMMARY:' . echanges_ics_text($summary));
        if ($desc !== '') { $lines[] = 'DESCRIPTION:' . echanges_ics_text($desc); }
        $lines[] = $m === 2 && $d === 29 ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY';
        $lines[] = 'TRANSP:TRANSPARENT';
        $lines[] = 'CATEGORIES:' . echanges_ics_text('Généalogie');
        if ($alarm) { array_push($lines, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' . echanges_ics_text($summary), 'TRIGGER:-P1D', 'END:VALARM'); }
        $lines[] = 'END:VEVENT';
        $count++;
    };
    $label = ['birth' => 'Anniversaire de naissance', 'union' => 'Anniversaire de mariage', 'death' => 'Anniversaire du décès'];
    $evGroups = array_values(array_intersect($groups, ['birth', 'union', 'death']));
    if ($evGroups) {
        $data = genea_calendar_events($pdo);
        foreach ($data['events'] as $e) {
            if (!in_array($e['group'], $evGroups, true)) { continue; }
            if ($e['group'] === 'birth' && !in_array($e['tag'], ['BIRT', 'BAPM', 'CHR'], true)) { continue; }
            $whoIds = array_map(static fn($w) => (int) $w['id'], $e['who']);
            if (!$whoIds || !array_filter($whoIds, $keepPerson)) { continue; }
            if (array_filter($whoIds, static fn($id) => (int) ($people[$id]['is_private'] ?? 0) === 1)) { continue; }
            if (!$e['d'] || !$e['m'] || $e['approx'] || $e['y'] < 1583) { $skipped++; continue; }
            $names = implode(' et ', array_map(static fn($w) => $w['name'], $e['who']));
            $fem = ($e['who'][0]['gender'] ?? '') === 'female';
            $what = $e['group'] === 'birth' ? (($fem ? 'née' : 'né') . ' en ' . $e['y']) : mb_strtolower((string) $e['type']) . ' en ' . $e['y'];
            $vevent('lcnda-anniv-' . (int) $e['id'] . '@lcnda.local', (int) $e['y'], (int) $e['m'], (int) $e['d'], $label[$e['group']] . ' de ' . $names . ' (' . $what . ')',
                $e['type'] . ' : ' . $e['text'] . ($e['place'] ? ' à ' . $e['place'] : '') . "\nExporté depuis LCNDA (généalogie).");
        }
    }
    if (in_array('feast', $groups, true)) {
        foreach ($people as $id => $p) {
            if (!$keepPerson($id) || ($p['kind'] ?? 'human') === 'animal' || trim((string) $p['first_name']) === '') { continue; }
            foreach (array_slice(saint_days_for_name((string) $p['first_name']), 0, 1) as [$md, $saint]) {
                [$m, $dd] = array_map('intval', explode('-', $md));
                $first = preg_split('/\s+/u', trim((string) $p['first_name']))[0];
                $vevent('lcnda-fete-' . $id . '-' . $md . '@lcnda.local', 2000, $m, $dd, 'Fête de ' . $first . ' ' . trim((string) $p['last_name']) . ' (' . $saint . ')',
                    'Fête du prénom : ' . saint_day_label($md) . "\nExporté depuis LCNDA (généalogie).");
            }
        }
    }
    if (!$count) { throw new RuntimeException($skipped ? 'Aucune date assez précise : ' . $skipped . ' date(s) n’ont que l’année ou une date approchée (vers, avant…), qu’un calendrier ne sait pas placer.' : 'Personne ne correspond à ce choix.'); }
    $lines[] = 'END:VCALENDAR';
    $body = implode('', array_map('echanges_fold', $lines));
    echanges_send('anniversaires-' . ($who === 'sosa' ? 'ancetres' : ($who === 'all' ? 'famille' : 'branche')) . '.ics', 'text/calendar; charset=utf-8', $body, ['X-LCNDA-Count' => (string) $count, 'X-LCNDA-Skipped' => (string) $skipped]);
}

// ─── vCard 4.0 (RFC 6350) ───────────────────────────────────────────────────────────────────

function echanges_vcard_text(string $v): string
{
    return str_replace(["\\", "\r\n", "\r", "\n", ',', ';'], ["\\\\", '\\n', '\\n', '\\n', '\\,', '\\;'], trim($v));
}

/** Un numéro français ou international → « tel:+33612345678 », sinon null (gardé en texte). */
function echanges_tel_uri(string $raw): ?string
{
    $n = preg_replace('/[\s.\-()\/]/', '', trim($raw)) ?? '';
    if (preg_match('/^00(\d{6,15})$/', $n, $m)) { return 'tel:+' . $m[1]; }
    if (preg_match('/^\+\d{6,15}$/', $n)) { return 'tel:' . $n; }
    if (preg_match('/^0(\d{9})$/', $n, $m)) { return 'tel:+33' . $m[1]; }
    return null;
}

/**
 * Contacts en vCard 4.0 : which=living,archives,dna,courriers (répertoire des vivants, services d'archives, correspondances
 * ADN, destinataires du registre de courriers). Ce sont des données que tu as toi-même notées pour les joindre.
 */
function export_vcard(PDO $pdo): never
{
    $which = array_values(array_intersect(explode(',', (string) ($_GET['which'] ?? 'living,archives,dna,courriers')), ['living', 'archives', 'dna', 'courriers']));
    if (!$which) { throw new RuntimeException('Coche au moins une sorte de contacts.'); }
    $cards = [];
    $rev = gmdate('Ymd\THis\Z');
    $card = static function (array $p) use (&$cards, $rev): void {
        $l = ['BEGIN:VCARD', 'VERSION:4.0', 'KIND:' . $p['kind'], 'FN:' . echanges_vcard_text($p['fn'])];
        if (!empty($p['n'])) { $l[] = 'N:' . implode(';', array_map('echanges_vcard_text', $p['n'])); }
        if (!empty($p['org'])) { $l[] = 'ORG:' . echanges_vcard_text($p['org']); }
        foreach ($p['emails'] ?? [] as $e) { if (filter_var(trim($e), FILTER_VALIDATE_EMAIL)) { $l[] = 'EMAIL;TYPE=home:' . trim($e); } }
        foreach ($p['tels'] ?? [] as [$num, $type]) {
            if (trim($num) === '') { continue; }
            $uri = echanges_tel_uri($num);
            $l[] = $uri ? 'TEL;VALUE=uri;TYPE="' . $type . '":' . $uri : 'TEL;VALUE=text;TYPE="' . $type . '":' . echanges_vcard_text($num);
        }
        if (!empty($p['adr']) && implode('', $p['adr']) !== '') { $l[] = 'ADR;TYPE=' . ($p['kind'] === 'org' ? 'work' : 'home') . ':;;' . implode(';', array_map('echanges_vcard_text', $p['adr'])); }
        if (!empty($p['url']) && preg_match('#^https?://\S+$#i', trim($p['url']))) { $l[] = 'URL:' . trim($p['url']); }
        if (!empty($p['cat'])) { $l[] = 'CATEGORIES:' . echanges_vcard_text($p['cat']); }
        if (trim((string) ($p['note'] ?? '')) !== '') { $l[] = 'NOTE:' . echanges_vcard_text((string) $p['note']); }
        $l[] = 'UID:urn:uuid:' . $p['uid'];
        $l[] = 'REV:' . $rev;
        $l[] = 'PRODID:-//LCNDA//Genealogie//FR';
        $l[] = 'END:VCARD';
        $cards[] = implode('', array_map('echanges_fold', $l));
    };
    $uuid = static function (string $seed): string { $h = md5('lcnda-vcard-' . $seed); return sprintf('%s-%s-4%s-%s%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 13, 3), dechex(8 | (hexdec($h[16]) & 3)), substr($h, 17, 3), substr($h, 20, 12)); };
    $safe = static function (callable $fn): void { try { $fn(); } catch (PDOException) {} }; // table absente (vieille base) : passée
    if (in_array('living', $which, true)) {
        $safe(function () use ($pdo, $card, $uuid) {
            foreach ($pdo->query('SELECT * FROM living_contacts ORDER BY last_name, first_name, id') as $c) {
                $fn = trim($c['first_name'] . ' ' . $c['last_name']); if ($fn === '') { continue; }
                $card(['kind' => 'individual', 'fn' => $fn, 'n' => [$c['last_name'], $c['first_name'], '', '', ''], 'emails' => [(string) $c['email']],
                    'tels' => [[(string) ($c['phone_mobile'] ?: ''), 'cell'], [(string) ($c['phone_landline'] ?: ''), 'voice'], [(string) (($c['phone_mobile'] ?: $c['phone_landline']) ? '' : $c['phone']), 'voice']],
                    'adr' => [(string) $c['address'], (string) $c['city'], '', (string) $c['postal_code'], (string) $c['country']],
                    'cat' => 'Famille', 'note' => trim(implode("\n", array_filter([(string) $c['relationship'], (string) $c['notes']]))), 'uid' => $uuid('living-' . $c['id'])]);
            }
        });
    }
    if (in_array('archives', $which, true)) {
        $safe(function () use ($pdo, $card, $uuid) {
            foreach ($pdo->query('SELECT * FROM archive_services ORDER BY name, id') as $a) {
                $card(['kind' => 'org', 'fn' => (string) $a['name'], 'org' => (string) $a['name'], 'emails' => [(string) $a['email']], 'tels' => [[(string) $a['phone'], 'work']],
                    'adr' => [(string) $a['address'], (string) $a['city'], '', '', 'France'], 'url' => (string) $a['website_url'], 'cat' => 'Archives',
                    'note' => trim(implode("\n", array_filter([$a['opening_hours'] ? 'Horaires : ' . $a['opening_hours'] : '', (string) $a['notes']]))), 'uid' => $uuid('archive-' . $a['id'])]);
            }
        });
    }
    if (in_array('dna', $which, true)) {
        $safe(function () use ($pdo, $card, $uuid) {
            foreach ($pdo->query('SELECT m.*, k.company FROM dna_matches m LEFT JOIN dna_kits k ON k.id=m.kit_id ORDER BY m.shared_cm DESC, m.id') as $m) {
                if (trim((string) $m['name']) === '') { continue; }
                $j = json_decode((string) ($m['data_json'] ?? ''), true) ?: [];
                $card(['kind' => 'individual', 'fn' => (string) $m['name'], 'emails' => [(string) ($j['email'] ?? '')], 'cat' => 'Cousins ADN',
                    'note' => trim(implode("\n", array_filter(['Correspondance ADN' . ($m['company'] ? ' (' . $m['company'] . ')' : '') . ' : ' . rtrim(rtrim(number_format((float) $m['shared_cm'], 1, ',', ''), '0'), ',') . ' cM partagés', $m['relationship'] ? 'Lien estimé : ' . $m['relationship'] : '', $m['side'] ? 'Côté : ' . $m['side'] : '']))),
                    'uid' => $uuid('dna-' . $m['id'])]);
            }
        });
    }
    if (in_array('courriers', $which, true)) {
        $safe(function () use ($pdo, $card, $uuid) {
            $seen = [];
            foreach ($pdo->query("SELECT destinataire, organisme, objet, date_envoi FROM courriers WHERE trim(destinataire)<>'' ORDER BY destinataire, date_envoi") as $c) {
                $k = gedcom_fold($c['destinataire']); $seen[$k]['name'] = $c['destinataire']; $seen[$k]['org'] = $c['organisme']; $seen[$k]['obj'][] = trim($c['objet'] . ($c['date_envoi'] ? ' (' . $c['date_envoi'] . ')' : ''));
            }
            foreach ($seen as $k => $c) {
                $card(['kind' => 'org', 'fn' => (string) $c['name'], 'org' => (string) $c['name'], 'cat' => 'Correspondants', 'note' => 'Courriers : ' . implode(' ; ', array_slice($c['obj'], 0, 20)), 'uid' => $uuid('courrier-' . $k)]);
            }
        });
    }
    if (!$cards) { throw new RuntimeException('Aucun contact à exporter : ton répertoire, tes services d’archives et tes cousins ADN sont vides.'); }
    echanges_send('contacts-' . date('Ymd') . '.vcf', 'text/vcard; charset=utf-8', implode('', $cards), ['X-LCNDA-Count' => (string) count($cards)]);
}

// ─── Lieux : KML (Google Earth) et GeoJSON ──────────────────────────────────────────────────

function echanges_xml(string $v): string
{
    $v = preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', $v) ?? '';
    return htmlspecialchars($v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

/** Les lieux des événements (personnes masquées : leurs événements ne comptent pas), rangés par sorte d'événement. */
function export_places_geo(PDO $pdo, string $format): never
{
    $d = echanges_dataset($pdo, true);
    $byPlace = []; $noCoord = [];
    foreach ($d['events'] as $e) {
        $plId = (int) ($e['place_id'] ?? 0); if (!$plId || !isset($d['places'][$plId])) { continue; }
        $pl = $d['places'][$plId];
        $lat = $e['precise_lat'] ?? null; $lon = $e['precise_lon'] ?? null;
        if ($lat === null || $lon === null || $lat === '' || $lon === '') { $lat = $pl['latitude']; $lon = $pl['longitude']; }
        if ($lat === null || $lon === null || $lat === '' || $lon === '' || abs((float) $lat) > 90 || abs((float) $lon) > 180) { $noCoord[$plId] = true; continue; }
        $who = [];
        if (($e['scope'] ?? '') === 'person') { $who[] = echanges_person_name($d['persons'][(int) $e['person_id']]); }
        else { $f = $d['families'][(int) $e['family_id']] ?? null; foreach ([(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0)] as $pp) { if ($pp && isset($d['persons'][$pp]) && !isset($d['hidden'][$pp])) { $who[] = echanges_person_name($d['persons'][$pp]); } } }
        $kind = trim((string) $e['type_label']) ?: 'Événement';
        $byPlace[$plId]['place'] = $pl;
        $hasPl = $pl['latitude'] !== null && $pl['longitude'] !== null && $pl['latitude'] !== '' && $pl['longitude'] !== '';
        $byPlace[$plId]['lat'] ??= $hasPl ? (float) $pl['latitude'] : (float) $lat; $byPlace[$plId]['lon'] ??= $hasPl ? (float) $pl['longitude'] : (float) $lon;
        $byPlace[$plId]['events'][] = ['kind' => $kind, 'color' => (string) ($e['type_color'] ?? ''), 'date' => trim((string) $e['date_text']) ?: (string) ($e['year'] ?? ''), 'year' => $e['year'] !== null ? (int) $e['year'] : null,
            'who' => implode(' et ', $who), 'lat' => (float) $lat, 'lon' => (float) $lon];
    }
    ksort($byPlace);
    $count = count($byPlace); $skipped = count(array_diff_key($noCoord, $byPlace));
    if (!$count) { throw new RuntimeException($skipped ? 'Aucun lieu n’a de coordonnées (latitude, longitude) : place-les d’abord sur la carte.' : 'Aucun événement avec un lieu à exporter.'); }
    $stamp = date('Ymd-His');
    if ($format === 'geojson') {
        $features = [];
        foreach ($byPlace as $id => $p) {
            $kinds = [];
            foreach ($p['events'] as $ev) { $kinds[$ev['kind']] = ($kinds[$ev['kind']] ?? 0) + 1; }
            $features[] = ['type' => 'Feature', 'id' => 'P' . $id, 'geometry' => ['type' => 'Point', 'coordinates' => [round($p['lon'], 6), round($p['lat'], 6)]],
                'properties' => ['name' => (string) $p['place']['name'], 'title' => echanges_place_title($p['place']), 'county' => (string) $p['place']['county'], 'region' => (string) $p['place']['state'],
                    'country' => (string) $p['place']['country'], 'events_count' => count($p['events']), 'kinds' => $kinds,
                    'events' => array_map(static fn($ev) => ['kind' => $ev['kind'], 'date' => $ev['date'], 'year' => $ev['year'], 'who' => $ev['who']], $p['events'])]];
        }
        $body = json_encode(['type' => 'FeatureCollection', 'features' => $features], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        echanges_send('lieux-' . $stamp . '.geojson', 'application/geo+json; charset=utf-8', $body, ['X-LCNDA-Count' => (string) $count, 'X-LCNDA-Skipped' => (string) $skipped]);
    }
    // KML : un dossier par sorte d'événement, un repère par lieu (avec tous ses événements de cette sorte)
    $folders = [];
    foreach ($byPlace as $id => $p) { foreach ($p['events'] as $ev) { $folders[$ev['kind']]['color'] = $ev['color']; $folders[$ev['kind']]['places'][$id][] = $ev; } }
    ksort($folders, SORT_STRING | SORT_FLAG_CASE);
    $kmlColor = static function (string $hex): string { // #rrggbb → aabbggrr
        if (!preg_match('/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i', $hex, $m)) { return 'ff0066cc'; }
        return strtolower('ff' . $m[3] . $m[2] . $m[1]);
    };
    $x = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2">', '<Document>', '<name>' . echanges_xml('Lieux de la famille') . '</name>',
        '<description>' . echanges_xml('Exporté depuis LCNDA le ' . date('d/m/Y') . ' : ' . $count . ' lieu(x).') . '</description>'];
    $n = 0;
    foreach ($folders as $kind => $f) { $n++; $x[] = '<Style id="s' . $n . '"><IconStyle><color>' . $kmlColor((string) $f['color']) . '</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>'; }
    $n = 0;
    foreach ($folders as $kind => $f) {
        $n++;
        $x[] = '<Folder><name>' . echanges_xml($kind . ' (' . count($f['places']) . ')') . '</name>';
        foreach ($f['places'] as $id => $evs) {
            $p = $byPlace[$id];
            $lines = array_map(static fn($ev) => trim($ev['date'] . ' — ' . ($ev['who'] !== '' ? $ev['who'] : $ev['kind']), ' —'), $evs);
            $x[] = '<Placemark><name>' . echanges_xml((string) $p['place']['name']) . '</name><styleUrl>#s' . $n . '</styleUrl>'
                . '<description>' . echanges_xml(echanges_place_title($p['place']) . "\n" . implode("\n", $lines)) . '</description>'
                . '<ExtendedData><Data name="evenements"><value>' . count($evs) . '</value></Data><Data name="sorte"><value>' . echanges_xml($kind) . '</value></Data></ExtendedData>'
                . '<Point><coordinates>' . round($p['lon'], 6) . ',' . round($p['lat'], 6) . ',0</coordinates></Point></Placemark>';
        }
        $x[] = '</Folder>';
    }
    $x[] = '</Document>'; $x[] = '</kml>';
    echanges_send('lieux-' . $stamp . '.kml', 'application/vnd.google-earth.kml+xml; charset=utf-8', implode("\n", $x) . "\n", ['X-LCNDA-Count' => (string) $count, 'X-LCNDA-Skipped' => (string) $skipped]);
}

// ─── GEDCOM « Pour Geneanet » (appelé depuis export_gedcom) ─────────────────────────────────

/** Vrai pour un export GEDCOM réglé pour Geneanet (target=geneanet). */
function echanges_geneanet(): bool
{
    return ($_GET['target'] ?? '') === 'geneanet';
}

/**
 * Lieu au format de Geneanet (GeneWeb) : « [Lieu-dit] - Commune, Code INSEE, Département, Région, Pays » ; en-tête
 * « PLAC FORM Town, Area code, County, Region, Country ». Le code est celui de la commune s'il est connu.
 */
function echanges_geneanet_place(array $parts, array $e): string
{
    if (implode('', $parts) === '') { return ''; }
    $town = trim((string) $parts['town']);
    $sub = trim((string) $parts['subdivision']);
    if ($sub !== '') { $town = '[' . $sub . '] - ' . $town; }
    $code = trim((string) ($e['admin4_code'] ?? ''));
    if (!preg_match('/^(\d{5}|2[AB]\d{3})$/', $code)) { $code = ''; }
    $country = trim((string) $parts['country']);
    if (gedcom_fold($country) === 'france') { $country = 'France'; }
    return implode(', ', array_map(static fn($p) => str_replace(',', ' ', gedcom_value($p)), [$town, $code, $parts['county'], $parts['state'], $country]));
}
