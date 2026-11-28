<?php
declare(strict_types=1);

/**
 * LCNDA — 🗺 Tout autour d'un lieu : « Ma famille » (lecture seule). Écran : assets/js/app-autour-lieu.js (📊 Données et 🔍 Recherche).
 *
 * GET api.php?action=autour_lieu&lat=&lon=&km=&place_id=&exact=0|1
 *   → {items: [{k, key, t, s, y, y2, lat, lon, km, pl, p?, e?, m?, f?, mt?, inv?, ep?}], kiosk, more}
 *   k (la sorte) : births · marriages · deaths · residences · events · documents · photos · postcards · investigations · photo_inquiries
 *   - les événements de la famille dont le lieu (ou la position précise) est dans le rayon ; « Ce lieu seulement » (exact=1) : le même
 *     lieu de la base (place_id), ou un lieu à moins d'1 km ;
 *   - les médias rangés sur un lieu (media.place_id), placés par leur position GPS (photo_media_geo) ou reliés à un événement du rayon :
 *     les cartes postales à part (postcards : lieu montré, ou point de vue), les documents, les photos ;
 *   - les enquêtes 🕵️ : une pièce reliée à un événement du rayon, ou la personne de l'enquête née, mariée, morte… dans le rayon ;
 *   - les enquêtes photo 🔎 (lib/enquete_photo.php, seulement si elle est là) : la conclusion (lieu retenu) ou un lieu relié.
 * La période se choisit à l'écran (tout est renvoyé, daté ou non).
 * Mode consultation (et appareil invité) : jamais une fiche confidentielle ni un vivant (comme Listes → Personnes, lib/listes_personnes.php),
 * ni un événement confidentiel, ni ce qui ne montre qu'eux (médias, cartes, enquêtes), ni une enquête photo confidentielle.
 */

const AL_MAX = 20000;
const AL_EXACT_KM = 1.0;
const AL_TAGS = [
    'births' => ['BIRT', 'CHR', 'BAPM'],
    'marriages' => ['MARR', 'MARC', 'ENGA', 'MARB', 'MARL', 'MARS', 'MRCI', 'MRRE'],
    'deaths' => ['DEAT', 'BURI', 'CREM'],
    'residences' => ['RESI', 'CENS'],
];

/** un texte de l'écran, dans la langue choisie (lib/i18n.php) */
function al_t(string $s): string { return function_exists('i18n_t') ? i18n_t($s) : $s; }

function al_kiosk(): bool { return function_exists('kiosk_state') && !empty(kiosk_state()['on']); }

function al_km(float $a, float $b, float $c, float $d): float
{
    $p1 = deg2rad($a); $p2 = deg2rad($c); $dp = deg2rad($c - $a); $dl = deg2rad($d - $b);
    $x = sin($dp / 2) ** 2 + cos($p1) * cos($p2) * sin($dl / 2) ** 2;
    return 6371.0 * 2 * atan2(sqrt($x), sqrt(1 - $x));
}

function al_has_table(PDO $pdo, string $t): bool
{
    static $m = [];
    return $m[$t] ??= (bool) $pdo->query('SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=' . $pdo->quote($t))->fetchColumn();
}

function al_has_col(PDO $pdo, string $t, string $c): bool
{
    static $m = [];
    return $m["$t.$c"] ??= al_has_table($pdo, $t) && (bool) $pdo->query("SELECT 1 FROM pragma_table_info('$t') WHERE name=" . $pdo->quote($c))->fetchColumn();
}

function al_year(?string $s): ?int
{
    return preg_match('/(?<!\d)(\d{3,4})(?!\d)/', (string) $s, $m) ? (int) $m[1] : null;
}

function al_kind_of(string $tag): string
{
    foreach (AL_TAGS as $k => $tags) { if (in_array(strtoupper($tag), $tags, true)) { return $k; } }
    return 'events';
}

function al_name(array $r, string $p = ''): string
{
    return trim(trim((string) ($r[$p . 'first_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) ($r[$p . 'last_name'] ?? ''))));
}

/** les fiches qu'on ne montre pas en consultation : confidentielles et vivantes */
function al_hidden_people(PDO $pdo): array
{
    $h = [];
    foreach ($pdo->query("SELECT id FROM persons WHERE COALESCE(is_private,0)=1 OR living_status='living'") as $r) { $h[(int) $r['id']] = true; }
    return $h;
}

function al_data(PDO $pdo, array $q): array
{
    $lat = is_numeric($q['lat'] ?? null) ? (float) $q['lat'] : null;
    $lon = is_numeric($q['lon'] ?? null) ? (float) $q['lon'] : null;
    $exact = !empty($q['exact']) && $q['exact'] !== '0';
    $km = $exact ? AL_EXACT_KM : max(0.5, min(500.0, (float) ($q['km'] ?? 30)));
    $placeId = (int) ($q['place_id'] ?? 0);
    $kiosk = al_kiosk();
    if ($lat === null || $lon === null || abs($lat) > 90 || abs($lon) > 180) { return ['items' => [], 'kiosk' => $kiosk, 'more' => false]; }
    $hidden = $kiosk ? al_hidden_people($pdo) : [];
    $dLat = $km / 111.0; $dLon = $km / max(0.5, 111.0 * cos(deg2rad($lat)));
    $box = [$lat - $dLat, $lat + $dLat, $lon - $dLon, $lon + $dLon];
    $within = static function ($la, $lo, ?int $pid = null) use ($lat, $lon, $km, $exact, $placeId): ?float {
        if ($la === null || $lo === null || $la === '' || $lo === '') { return null; }
        $d = al_km($lat, $lon, (float) $la, (float) $lo);
        if ($exact && $placeId > 0 && $pid === $placeId) { return round($d, 2); }
        return $d <= $km ? round($d, 2) : null;
    };
    $items = []; $more = false;
    $push = static function (array $it) use (&$items, &$more): void { if (count($items) >= AL_MAX) { $more = true; return; } $items[] = $it; };

    /* ── les lieux du rayon (et le lieu choisi lui-même) ── */
    $places = [];
    $s = $pdo->prepare('SELECT id, name, county, latitude, longitude FROM places WHERE (latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?) OR id=?');
    $s->execute([...$box, $placeId]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $d = $within($p['latitude'], $p['longitude'], (int) $p['id']);
        if ($d === null) { continue; }
        $places[(int) $p['id']] = ['name' => trim((string) $p['name'] . ($p['county'] ? ', ' . $p['county'] : '')), 'lat' => (float) $p['latitude'], 'lon' => (float) $p['longitude'], 'km' => $d];
    }

    /* ── 👶 💍 ✝ 🏠 📅 les événements ── */
    $precise = al_has_col($pdo, 'events', 'precise_lat') && al_has_col($pdo, 'events', 'precise_lon');
    $priv = al_has_col($pdo, 'events', 'is_private');
    $evAt = []; // event_id => [lat, lon, km, place, year]
    $byPerson = []; // person_id => le plus proche de ses événements
    $sel = 'SELECT e.id, e.year, e.date_text, e.place_id, e.person_id, f.partner1_id, f.partner2_id, t.gedcom_tag AS tag, t.label AS tl'
        . ($precise ? ', e.precise_lat, e.precise_lon' : '') . ($priv ? ', COALESCE(e.is_private,0) AS ep' : ', 0 AS ep')
        . ', p.first_name, p.last_name, a.first_name AS a_first_name, a.last_name AS a_last_name, b.first_name AS b_first_name, b.last_name AS b_last_name
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families f ON f.id=e.family_id
        LEFT JOIN persons a ON a.id=f.partner1_id LEFT JOIN persons b ON b.id=f.partner2_id WHERE ';
    $rows = [];
    foreach (array_chunk(array_keys($places), 500) as $ch) {
        $rows = array_merge($rows, $pdo->query($sel . 'e.place_id IN (' . implode(',', $ch) . ') ORDER BY e.id LIMIT 60000')->fetchAll(PDO::FETCH_ASSOC));
    }
    if ($precise) {
        $s = $pdo->prepare($sel . 'e.precise_lat BETWEEN ? AND ? AND e.precise_lon BETWEEN ? AND ? LIMIT 20000');
        $s->execute($box);
        $seen = array_flip(array_map(static fn($r) => (int) $r['id'], $rows));
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if (!isset($seen[(int) $r['id']])) { $rows[] = $r; } }
    }
    foreach ($rows as $r) {
        $people = array_values(array_filter([(int) $r['person_id'], (int) $r['partner1_id'], (int) $r['partner2_id']]));
        if ($kiosk && ((int) $r['ep'] === 1 || array_filter($people, static fn($p) => isset($hidden[$p])))) { continue; }
        $pl = $places[(int) $r['place_id']] ?? null;
        $la = $precise && $r['precise_lat'] !== null ? (float) $r['precise_lat'] : ($pl['lat'] ?? null);
        $lo = $precise && $r['precise_lon'] !== null ? (float) $r['precise_lon'] : ($pl['lon'] ?? null);
        $d = $la !== null && $lo !== null ? $within($la, $lo, (int) $r['place_id']) : null;
        if ($d === null) { continue; }
        $who = $r['person_id'] ? al_name($r) : implode(' et ', array_filter([al_name($r, 'a_'), al_name($r, 'b_')]));
        $y = $r['year'] !== null && $r['year'] !== '' ? (int) $r['year'] : al_year((string) $r['date_text']);
        $place = $pl['name'] ?? '';
        $evAt[(int) $r['id']] = [$la, $lo, $d, $place, $y];
        $pid = (int) ($r['person_id'] ?: $r['partner1_id'] ?: $r['partner2_id']);
        foreach ($people as $p) { if (!isset($byPerson[$p]) || $d < $byPerson[$p][2]) { $byPerson[$p] = [$la, $lo, $d, $place, $y, (string) $r['tl']]; } }
        $push(['k' => al_kind_of((string) $r['tag']), 'key' => 'e' . $r['id'], 't' => $who ?: al_t('Sans nom'), 's' => trim(al_t((string) $r['tl']) . ($r['date_text'] ? ' · ' . $r['date_text'] : '')),
            'y' => $y, 'lat' => $la, 'lon' => $lo, 'km' => $d, 'pl' => $place, 'p' => $pid ?: null, 'e' => (int) $r['id'], 'tl' => (string) $r['tl']]);
    }

    /* ── 📄 📷 🏞 les médias ── */
    $hideM = [];
    if ($kiosk && al_has_table($pdo, 'media_links')) {
        foreach ($pdo->query("SELECT media_id, entity_type, entity_id FROM media_links WHERE entity_type IN ('person','event')") as $r) {
            if ($r['entity_type'] === 'person' && isset($hidden[(int) $r['entity_id']])) { $hideM[(int) $r['media_id']] = true; }
        }
        if ($priv) { foreach ($pdo->query("SELECT ml.media_id FROM media_links ml JOIN events e ON e.id=ml.entity_id AND ml.entity_type='event' LEFT JOIN persons p ON p.id=e.person_id WHERE COALESCE(e.is_private,0)=1 OR COALESCE(p.is_private,0)=1 OR p.living_status='living'") as $r) { $hideM[(int) $r['media_id']] = true; } }
    }
    $cards = []; // media_id => postcard
    if (al_has_table($pdo, 'postcards')) {
        foreach ($pdo->query('SELECT c.id, c.media_id, c.verso_media_id, c.title, c.publisher, c.sent_date, c.place_id, c.view_lat, c.view_lon, c.writer_person_id, c.recipient_person_id, m.title AS mtitle, m.filename, m.thumbnail, m.date_text FROM postcards c JOIN media m ON m.id=c.media_id') as $c) {
            $cards[(int) $c['media_id']] = $c; if ($c['verso_media_id']) { $cards[(int) $c['verso_media_id']] = $c; }
        }
        foreach ($cards as $mid => $c) {
            if ($mid !== (int) $c['media_id']) { continue; }
            if ($kiosk && (isset($hideM[$mid]) || isset($hidden[(int) $c['writer_person_id']]) || isset($hidden[(int) $c['recipient_person_id']]))) { continue; }
            $pl = $places[(int) $c['place_id']] ?? null;
            $d = $pl ? $pl['km'] : $within($c['view_lat'], $c['view_lon']);
            if ($d === null) { continue; }
            $push(['k' => 'postcards', 'key' => 'c' . $c['id'], 't' => (string) ($c['title'] ?: $c['mtitle'] ?: al_t('Carte postale')), 's' => trim(implode(' · ', array_filter([(string) $c['publisher'], (string) ($c['sent_date'] ?: $c['date_text'])]))),
                'y' => al_year((string) ($c['sent_date'] ?: $c['date_text'])), 'lat' => $pl['lat'] ?? (float) $c['view_lat'], 'lon' => $pl['lon'] ?? (float) $c['view_lon'], 'km' => $d, 'pl' => $pl['name'] ?? '',
                'm' => $mid, 'f' => (string) ($c['filename'] ?? ''), 'th' => (string) ($c['thumbnail'] ?? ''), 'mt' => 'image']);
        }
    }
    $media = []; // media_id => [lat, lon, km, place, year?]
    if (al_has_col($pdo, 'media', 'place_id') && $places) {
        foreach (array_chunk(array_keys($places), 500) as $ch) {
            foreach ($pdo->query('SELECT id, place_id FROM media WHERE place_id IN (' . implode(',', $ch) . ')') as $r) { $p = $places[(int) $r['place_id']]; $media[(int) $r['id']] = [$p['lat'], $p['lon'], $p['km'], $p['name'], null]; }
        }
    }
    if (al_has_table($pdo, 'photo_media_geo')) {
        $s = $pdo->prepare('SELECT media_id, lat, lon FROM photo_media_geo WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?'); $s->execute($box);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $d = $within($r['lat'], $r['lon']); if ($d !== null && !isset($media[(int) $r['media_id']])) { $media[(int) $r['media_id']] = [(float) $r['lat'], (float) $r['lon'], $d, '', null]; } }
    }
    if ($evAt && al_has_table($pdo, 'media_links')) {
        foreach (array_chunk(array_keys($evAt), 500) as $ch) {
            foreach ($pdo->query("SELECT media_id, entity_id FROM media_links WHERE entity_type='event' AND entity_id IN (" . implode(',', $ch) . ')') as $r) {
                $a = $evAt[(int) $r['entity_id']]; $mid = (int) $r['media_id'];
                if (!isset($media[$mid]) || $a[2] < $media[$mid][2]) { $media[$mid] = [$a[0], $a[1], $a[2], $a[3], $a[4]]; }
            }
        }
    }
    if ($media) {
        foreach (array_chunk(array_keys($media), 500) as $ch) {
            foreach ($pdo->query('SELECT id, title, media_type, filename, thumbnail, date_text, document_reference FROM media WHERE id IN (' . implode(',', $ch) . ')') as $m) {
                $mid = (int) $m['id']; if (isset($cards[$mid]) || ($kiosk && isset($hideM[$mid]))) { continue; }
                [$la, $lo, $d, $place, $ey] = $media[$mid];
                $type = strtolower((string) $m['media_type']);
                $push(['k' => in_array($type, ['image', 'photo', 'portrait'], true) ? 'photos' : 'documents', 'key' => 'm' . $mid, 't' => (string) ($m['title'] ?: $m['filename'] ?: al_t('Média')),
                    's' => trim(implode(' · ', array_filter([(string) $m['date_text'], (string) $m['document_reference']]))), 'y' => al_year((string) $m['date_text']) ?? $ey,
                    'lat' => $la, 'lon' => $lo, 'km' => $d, 'pl' => $place, 'm' => $mid, 'f' => (string) $m['filename'], 'th' => (string) $m['thumbnail'], 'mt' => (string) $m['media_type']]);
            }
        }
    }

    /* ── 🕵️ les enquêtes ── */
    if (al_has_table($pdo, 'investigations')) {
        $linked = [];
        if ($evAt && al_has_col($pdo, 'investigation_items', 'linked_event_id')) {
            foreach (array_chunk(array_keys($evAt), 500) as $ch) {
                foreach ($pdo->query('SELECT investigation_id, linked_event_id FROM investigation_items WHERE linked_event_id IN (' . implode(',', $ch) . ')') as $r) {
                    $a = $evAt[(int) $r['linked_event_id']]; $iid = (int) $r['investigation_id'];
                    if (!isset($linked[$iid]) || $a[2] < $linked[$iid][2]) { $linked[$iid] = $a; }
                }
            }
        }
        foreach ($pdo->query('SELECT i.id, i.title, i.status, i.person_id, p.first_name, p.last_name FROM investigations i LEFT JOIN persons p ON p.id=i.person_id') as $r) {
            $iid = (int) $r['id']; $pid = (int) $r['person_id'];
            if ($kiosk && isset($hidden[$pid])) { continue; }
            $a = $linked[$iid] ?? null; $why = al_t('une pièce reliée à un événement d’ici');
            if (!$a && isset($byPerson[$pid])) { $a = $byPerson[$pid]; $why = al_t((string) $a[5]); }
            if (!$a) { continue; }
            $push(['k' => 'investigations', 'key' => 'i' . $iid, 't' => (string) ($r['title'] ?: al_t('Enquête')), 's' => trim(implode(' · ', array_filter([al_name($r), $why]))),
                'y' => $a[4], 'lat' => $a[0], 'lon' => $a[1], 'km' => $a[2], 'pl' => $a[3], 'inv' => $iid, 'p' => $pid ?: null]);
        }
    }

    /* ── 🔎 les enquêtes photo (lib/enquete_photo.php, si elle est là) ── */
    $epLib = __DIR__ . '/enquete_photo.php';
    if (is_file($epLib) && al_has_table($pdo, 'photo_inquiries')) {
        try {
            if (!function_exists('ep_list')) { require_once $epLib; }
            if (function_exists('ep_list')) {
                $lk = [];
                if (al_has_table($pdo, 'photo_inquiry_links')) { foreach ($pdo->query("SELECT inquiry_id, ref_id FROM photo_inquiry_links WHERE kind='place'") as $r) { $lk[(int) $r['inquiry_id']][] = (int) $r['ref_id']; } }
                foreach (ep_list($pdo)['inquiries'] ?? [] as $qq) {
                    if ($kiosk && !empty($qq['is_private'])) { continue; }
                    $pids = array_values(array_unique(array_filter(array_merge([(int) ($qq['place']['place_id'] ?? 0)], $lk[(int) $qq['id']] ?? []))));
                    $best = null;
                    foreach ($pids as $p) { if (isset($places[$p]) && (!$best || $places[$p]['km'] < $best['km'])) { $best = $places[$p]; } }
                    if (!$best) { continue; }
                    $dt = $qq['date'] ?? null;
                    $y = is_array($dt) ? (isset($dt['from']) && is_numeric($dt['from']) ? (int) $dt['from'] : al_year((string) ($dt['text'] ?? ''))) : al_year((string) $dt);
                    $push(['k' => 'photo_inquiries', 'key' => 'q' . $qq['id'], 't' => (string) ($qq['title'] ?: al_t('Enquête photo')), 's' => is_array($dt) ? (string) ($dt['text'] ?? '') : (string) ($dt ?? ''),
                        'y' => $y, 'lat' => $best['lat'], 'lon' => $best['lon'], 'km' => $best['km'], 'pl' => $best['name'], 'ep' => (int) $qq['id'], 'th' => (string) ($qq['thumb'] ?? '')]);
                }
            }
        } catch (Throwable $_) { /* l'enquête photo n'est pas encore prête : rien de plus */ }
    }
    usort($items, static fn($a, $b) => ($a['km'] <=> $b['km']) ?: (($a['y'] ?? 99999) <=> ($b['y'] ?? 99999)));
    return ['items' => $items, 'kiosk' => $kiosk, 'more' => $more, 'km' => $km, 'exact' => $exact];
}
