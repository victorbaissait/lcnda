<?php
declare(strict_types=1);

/**
 * 📍 Images de lieux : « Où a-t-elle été prise ? » (écran : assets/js/heritage-place-photos.js).
 *
 * Ce qui existait déjà et qu'on garde : le média (une seule place pour les images), son lieu (media.place_id, structure n°72),
 * la fiche de carte postale (lib/postcards.php : éditeur, lieu montré, angle de vue), le comparateur de photos
 * (lib/photo_compare.php : fondu, rideau, réglages enregistrés), les 🤝 demandes d'entraide (help_requests, lib/heritage_links.php)
 * et les ✉️ petites annonces (press_ads, lib/periodicals.php). Ce fichier ajoute :
 *  - place_photos : ce qu'on sait de l'image en tant que vue d'un lieu (sorte, auteur ou éditeur, photo d'aujourd'hui, comparaison) ;
 *    la date de prise de vue reste media.date_text (C4) ;
 *  - place_photo_guesses : une ou plusieurs hypothèses de lieu par image — lieu de la base et/ou point précis, OU une zone
 *    (cercle ou polygone), rue et adresse, direction de la prise de vue (angle et ouverture du cône), certitude (certain,
 *    probable, possible, à vérifier), pourquoi (indices), auteur et d'où vient l'idée (moi, une demande d'entraide, une annonce) ;
 *    une seule « retenue » par image : elle devient le lieu du média (media.place_id) et celui de sa carte postale s'il y en a une.
 *
 *   GET  api.php?action=place_photos[&place_id=&street=&from=&to=&certainty=certain,probable&unplaced=1&bbox=s,w,n,e&all=1&limit=]
 *        → {items: [...], streets: [...], total} — la lecture « claire » pour une couche de carte (docs/UI.md)
 *   GET  api.php?action=place_photo&media_id=N → {item, asks: [...]}
 *   POST api.php?action=place_photo_write {op: info | guess | retain | delete_guess | restore_guess | ask | answer | answer_undo, …, csrf}
 *
 * Aucune requête sortante. Textes bornés, numéros vérifiés en base, coordonnées et zones relues (cercle : rayon 5 m – 50 km ;
 * polygone : 3 à 200 sommets valides, pas plat) ; requêtes préparées ; mode consultation : écritures refusées par kiosk_guard().
 */

const PP_KINDS = ['postcard' => 'Carte postale', 'photo' => 'Photo ancienne', 'engraving' => 'Gravure, dessin', 'plan' => 'Plan', 'painting' => 'Tableau', 'other' => 'Autre'];
const PP_CERTAINTY = ['certain' => 'Certain', 'probable' => 'Probable', 'possible' => 'Possible', 'verify' => 'À vérifier'];
const PP_ORIGINS = ['me' => 'Moi', 'help_request' => 'Demande d’entraide', 'press_ad' => 'Petite annonce', 'forum' => 'Forum', 'other' => 'Autre'];
const PP_MAX_GUESSES = 30;
const PP_MAX_POLY = 200;

function place_photos_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS place_photos (
        media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'photo',
        author TEXT NOT NULL DEFAULT '',
        today_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
        comparison_id INTEGER,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS place_photo_guesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
        lat REAL, lon REAL,
        zone_json TEXT NOT NULL DEFAULT '',
        street TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        bearing REAL, fov REAL,
        certainty TEXT NOT NULL DEFAULT 'possible',
        why TEXT NOT NULL DEFAULT '',
        retained INTEGER NOT NULL DEFAULT 0,
        author TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT 'me',
        origin_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_ppg_media ON place_photo_guesses(media_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_ppg_place ON place_photo_guesses(place_id)');
    $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_ppg_retained ON place_photo_guesses(media_id) WHERE retained=1');
}

function pp_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='place_photo_guesses'")->fetchColumn()) { place_photos_schema($pdo); }
    $done = true;
}

function pp_text(mixed $v, int $max = 300, bool $multiline = false): string
{
    $t = str_replace("\0", '', scalar_text($v ?? ''));
    $t = $multiline ? preg_replace("/\r\n?/", "\n", $t) : preg_replace('/\s+/u', ' ', $t);
    return mb_substr(trim((string) $t), 0, $max);
}

function pp_num(mixed $v, float $min, float $max): ?float
{
    if ($v === null || $v === '' || is_array($v) || is_bool($v)) { return null; }
    $s = str_replace(',', '.', trim(scalar_text($v)));
    if (!is_numeric($s)) { return null; }
    $n = (float) $s;
    return (is_finite($n) && $n >= $min && $n <= $max) ? round($n, 7) : null;
}

/** Une zone envoyée par la page → tableau propre, ou null (vide) ; une zone mal formée → refus clair. */
function pp_zone(mixed $raw): ?array
{
    if (is_string($raw)) { $raw = trim($raw) === '' ? null : json_decode($raw, true); }
    if ($raw === null || $raw === [] ) { return null; }
    if (!is_array($raw)) { throw new LcndaBadInput('La zone dessinée n’est pas lisible.'); }
    $type = (string) ($raw['type'] ?? '');
    if ($type === 'circle') {
        $lat = pp_num($raw['lat'] ?? null, -90, 90); $lon = pp_num($raw['lon'] ?? null, -180, 180); $r = pp_num($raw['r'] ?? null, 5, 50000);
        if ($lat === null || $lon === null || $r === null) { throw new LcndaBadInput('Le cercle doit avoir un centre et un rayon entre 5 m et 50 km.'); }
        return ['type' => 'circle', 'lat' => $lat, 'lon' => $lon, 'r' => round($r)];
    }
    if ($type === 'polygon') {
        $pts = [];
        foreach (array_slice(is_array($raw['pts'] ?? null) ? $raw['pts'] : [], 0, PP_MAX_POLY + 1) as $p) {
            if (!is_array($p)) { throw new LcndaBadInput('Un sommet de la zone n’est pas lisible.'); }
            $la = pp_num($p[0] ?? ($p['lat'] ?? null), -90, 90); $lo = pp_num($p[1] ?? ($p['lon'] ?? null), -180, 180);
            if ($la === null || $lo === null) { throw new LcndaBadInput('Un sommet de la zone n’a pas de coordonnées valides.'); }
            $k = round($la, 6) . ':' . round($lo, 6);
            if (!isset($pts[$k])) { $pts[$k] = [round($la, 6), round($lo, 6)]; }
        }
        $pts = array_values($pts);
        if (count($pts) < 3) { throw new LcndaBadInput('Une zone a besoin d’au moins 3 points différents.'); }
        if (count($pts) > PP_MAX_POLY) { throw new LcndaBadInput('Une zone a au plus ' . PP_MAX_POLY . ' points.'); }
        $area = 0.0; $n = count($pts);
        for ($i = 0; $i < $n; $i++) { [$y1, $x1] = $pts[$i]; [$y2, $x2] = $pts[($i + 1) % $n]; $area += $x1 * $y2 - $x2 * $y1; }
        if (abs($area) < 1e-12) { throw new LcndaBadInput('La zone est toute plate : ses points sont alignés.'); }
        return ['type' => 'polygon', 'pts' => $pts];
    }
    throw new LcndaBadInput('Sorte de zone inconnue (cercle ou polygone).');
}

/** Le centre d'une zone (pour la poser sur une carte). */
function pp_zone_center(?array $z): ?array
{
    if (!$z) { return null; }
    if ($z['type'] === 'circle') { return [(float) $z['lat'], (float) $z['lon']]; }
    $la = 0.0; $lo = 0.0; foreach ($z['pts'] as $p) { $la += $p[0]; $lo += $p[1]; }
    return [$la / count($z['pts']), $lo / count($z['pts'])];
}

function pp_media(PDO $pdo, int $id): ?array
{
    if ($id <= 0) { return null; }
    $s = $pdo->prepare('SELECT id, title, filename, thumbnail, media_type, date_text FROM media WHERE id=?'); $s->execute([$id]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}

function pp_img(?string $file, ?string $thumb): string
{
    $t = trim((string) $thumb) ?: trim((string) $file);
    return $t !== '' ? 'media/' . rawurlencode($t) : '';
}

function pp_year(string $s): ?int
{
    return preg_match('/(?<!\d)(1[4-9]\d\d|20\d\d)(?!\d)/', $s, $m) ? (int) $m[1] : null;
}

function pp_has_col(PDO $pdo, string $table, string $col): bool
{
    static $cache = [];
    $k = "$table.$col";
    if (!isset($cache[$k])) { $q = $pdo->prepare("SELECT 1 FROM pragma_table_info(?) WHERE name=?"); $q->execute([$table, $col]); $cache[$k] = (bool) $q->fetchColumn(); }
    return $cache[$k];
}

function pp_guess_out(array $g): array
{
    $zone = $g['zone_json'] !== '' ? json_decode((string) $g['zone_json'], true) : null;
    $lat = $g['lat'] !== null ? (float) $g['lat'] : null; $lon = $g['lon'] !== null ? (float) $g['lon'] : null;
    $at = $lat !== null ? [$lat, $lon] : (pp_zone_center(is_array($zone) ? $zone : null) ?? ($g['pl_lat'] !== null && $g['pl_lon'] !== null ? [(float) $g['pl_lat'], (float) $g['pl_lon']] : null));
    return [
        'id' => (int) $g['id'], 'media_id' => (int) $g['media_id'],
        'place' => $g['place_id'] ? ['id' => (int) $g['place_id'], 'name' => (string) $g['pl_name'], 'county' => (string) $g['pl_county'], 'country' => (string) $g['pl_country'],
            'lat' => $g['pl_lat'] !== null ? (float) $g['pl_lat'] : null, 'lon' => $g['pl_lon'] !== null ? (float) $g['pl_lon'] : null] : null,
        'lat' => $lat, 'lon' => $lon, 'zone' => is_array($zone) ? $zone : null,
        'street' => (string) $g['street'], 'address' => (string) $g['address'],
        'bearing' => $g['bearing'] !== null ? (float) $g['bearing'] : null, 'fov' => $g['fov'] !== null ? (float) $g['fov'] : null,
        'certainty' => (string) $g['certainty'], 'certainty_label' => PP_CERTAINTY[$g['certainty']] ?? (string) $g['certainty'],
        'why' => (string) $g['why'], 'retained' => (bool) $g['retained'], 'author' => (string) $g['author'],
        'origin' => (string) $g['origin'], 'origin_label' => PP_ORIGINS[$g['origin']] ?? '', 'origin_id' => $g['origin_id'] !== null ? (int) $g['origin_id'] : null,
        'at' => $at ? ['lat' => round($at[0], 7), 'lon' => round($at[1], 7)] : null,
        'created_at' => (string) $g['created_at'], 'updated_at' => (string) $g['updated_at'],
    ];
}

function pp_guesses(PDO $pdo, array $mediaIds): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $mediaIds))));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 500) as $chunk) {
        $s = $pdo->prepare('SELECT g.*, pl.name AS pl_name, pl.county AS pl_county, pl.country AS pl_country, pl.latitude AS pl_lat, pl.longitude AS pl_lon
            FROM place_photo_guesses g LEFT JOIN places pl ON pl.id=g.place_id WHERE g.media_id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')
            ORDER BY g.retained DESC, CASE g.certainty WHEN \'certain\' THEN 0 WHEN \'probable\' THEN 1 WHEN \'possible\' THEN 2 ELSE 3 END, g.id');
        $s->execute($chunk);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $g) { $out[(int) $g['media_id']][] = pp_guess_out($g); }
    }
    return $out;
}

/** Les images de lieux, avec leurs hypothèses — la lecture commune (liste, fiche du lieu, couche de carte). */
function pp_list(PDO $pdo, array $f = []): array
{
    pp_ready($pdo);
    $hasPc = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='postcards'")->fetchColumn();
    $mPlace = pp_has_col($pdo, 'media', 'place_id');
    $only = safe_int($f['media_id'] ?? 0);
    // les images qui sont des vues de lieux : une fiche ici, une hypothèse, une carte postale, ou un lieu posé sur le média
    $sql = "SELECT m.id, m.title, m.filename, m.thumbnail, m.media_type, m.date_text, " . ($mPlace ? 'm.place_id' : 'NULL') . " AS m_place,
            pp.kind, pp.author, pp.today_media_id, pp.comparison_id, pp.notes, pp.updated_at AS pp_updated, pp.created_at AS pp_created,
            " . ($hasPc ? 'pc.id AS pc_id, pc.publisher AS pc_publisher, pc.place_id AS pc_place, pc.view_lat AS pc_lat, pc.view_lon AS pc_lon, pc.view_bearing AS pc_bearing' : 'NULL AS pc_id, NULL AS pc_publisher, NULL AS pc_place, NULL AS pc_lat, NULL AS pc_lon, NULL AS pc_bearing') . "
        FROM media m LEFT JOIN place_photos pp ON pp.media_id=m.id " . ($hasPc ? 'LEFT JOIN postcards pc ON pc.media_id=m.id' : '') . "
        WHERE m.media_type='image' AND " . ($only ? 'm.id=' . $only : "(pp.media_id IS NOT NULL OR m.id IN (SELECT media_id FROM place_photo_guesses)" . ($hasPc ? ' OR pc.id IS NOT NULL' : '') . ')') . "
        ORDER BY COALESCE(pp.updated_at, m.created_at) DESC, m.id DESC LIMIT 20000";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    $guesses = pp_guesses($pdo, array_column($rows, 'id'));
    $places = [];
    $plIds = array_values(array_unique(array_filter(array_merge(array_map('intval', array_column($rows, 'm_place')), array_map('intval', array_column($rows, 'pc_place'))))));
    foreach (array_chunk($plIds, 500) as $chunk) {
        $s = $pdo->prepare('SELECT id, name, county, country, latitude, longitude FROM places WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')'); $s->execute($chunk);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) { $places[(int) $p['id']] = ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'county' => (string) $p['county'], 'country' => (string) $p['country'], 'lat' => $p['latitude'] !== null ? (float) $p['latitude'] : null, 'lon' => $p['longitude'] !== null ? (float) $p['longitude'] : null]; }
    }
    $today = [];
    $tIds = array_values(array_filter(array_map('intval', array_column($rows, 'today_media_id'))));
    foreach (array_chunk($tIds, 500) as $chunk) {
        $s = $pdo->prepare('SELECT id, title, filename, thumbnail FROM media WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')'); $s->execute($chunk);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $t) { $today[(int) $t['id']] = ['id' => (int) $t['id'], 'title' => (string) $t['title'], 'filename' => (string) $t['filename'], 'thumb' => pp_img($t['filename'], $t['thumbnail'])]; }
    }
    $items = [];
    foreach ($rows as $r) {
        $id = (int) $r['id'];
        $g = $guesses[$id] ?? [];
        $ret = null; foreach ($g as $x) { if ($x['retained']) { $ret = $x; break; } }
        // sans hypothèse : la carte postale (lieu montré, angle) ou le lieu du média servent d'hypothèse « implicite »
        $implicit = null;
        if (!$g) {
            $plId = (int) ($r['pc_place'] ?: $r['m_place']);
            $pl = $places[$plId] ?? null;
            if ($pl || $r['pc_lat'] !== null) {
                $at = $r['pc_lat'] !== null ? ['lat' => (float) $r['pc_lat'], 'lon' => (float) $r['pc_lon']] : ($pl && $pl['lat'] !== null ? ['lat' => $pl['lat'], 'lon' => $pl['lon']] : null);
                $implicit = ['id' => 0, 'place' => $pl, 'lat' => $r['pc_lat'] !== null ? (float) $r['pc_lat'] : null, 'lon' => $r['pc_lon'] !== null ? (float) $r['pc_lon'] : null, 'zone' => null, 'street' => '', 'address' => '',
                    'bearing' => $r['pc_bearing'] !== null ? (float) $r['pc_bearing'] : null, 'fov' => null, 'certainty' => 'probable', 'certainty_label' => PP_CERTAINTY['probable'], 'why' => $r['pc_id'] ? 'Lieu montré noté sur la fiche de la carte postale.' : 'Lieu noté sur le média.',
                    'retained' => true, 'author' => '', 'origin' => 'me', 'origin_label' => '', 'origin_id' => null, 'at' => $at, 'implicit' => true];
            }
        }
        $year = pp_year((string) $r['date_text']);
        $kind = (string) ($r['kind'] ?? '') ?: ($r['pc_id'] ? 'postcard' : 'photo');
        $items[] = [
            'media_id' => $id, 'title' => trim((string) $r['title']) ?: (PP_KINDS[$kind] ?? 'Image'),
            'filename' => (string) $r['filename'], 'thumb' => pp_img($r['filename'], $r['thumbnail']), 'src' => $r['filename'] ? 'media/' . rawurlencode((string) $r['filename']) : '',
            'kind' => $kind, 'kind_label' => PP_KINDS[$kind] ?? 'Image', 'date_text' => (string) $r['date_text'], 'year' => $year, 'decade' => $year ? intdiv($year, 10) * 10 : null,
            'author' => (string) ($r['author'] ?? '') ?: (string) ($r['pc_publisher'] ?? ''), 'notes' => (string) ($r['notes'] ?? ''),
            'postcard_id' => $r['pc_id'] ? (int) $r['pc_id'] : null,
            'today' => $r['today_media_id'] ? ($today[(int) $r['today_media_id']] ?? null) : null, 'comparison_id' => $r['comparison_id'] ? (int) $r['comparison_id'] : null,
            'guesses' => $g, 'retained' => $ret ?? $implicit, 'placed' => (bool) ($ret ?? $implicit), 'n_guesses' => count($g),
            'street' => (string) (($ret ?? $implicit)['street'] ?? '') ?: (string) (array_values(array_filter(array_column($g, 'street')))[0] ?? ''), // la rue de la retenue, sinon la première notée
            'updated_at' => (string) ($r['pp_updated'] ?? '') ?: '',
        ];
    }
    return pp_filter($items, $f);
}

/** Filtres de la lecture (mêmes noms côté page et côté serveur). */
function pp_filter(array $items, array $f): array
{
    $place = safe_int($f['place_id'] ?? 0);
    $street = mb_strtolower(pp_text($f['street'] ?? '', 200));
    $from = safe_int($f['from'] ?? 0); $to = safe_int($f['to'] ?? 0);
    $cert = array_values(array_intersect(array_map('trim', explode(',', (string) scalar_text($f['certainty'] ?? ''))), array_keys(PP_CERTAINTY)));
    $unplaced = !empty($f['unplaced']) && (string) $f['unplaced'] !== '0';
    $all = !empty($f['all']) && (string) $f['all'] !== '0';
    $bbox = null;
    if (!empty($f['bbox'])) {
        $b = array_map(static fn($x) => pp_num($x, -180, 180), explode(',', (string) scalar_text($f['bbox'])));
        if (count($b) === 4 && !in_array(null, $b, true)) { $bbox = $b; } // s, w, n, e
    }
    $streets = [];
    $out = [];
    foreach ($items as $it) {
        $cands = $all ? ($it['guesses'] ?: ($it['retained'] ? [$it['retained']] : [])) : ($it['retained'] ? [$it['retained']] : []);
        foreach ($it['guesses'] as $g) { if ($g['street'] !== '') { $streets[mb_strtolower($g['street'])] = $g['street']; } }
        if ($unplaced && $it['placed']) { continue; }
        if ($place && !array_filter($it['guesses'] ?: ($it['retained'] ? [$it['retained']] : []), static fn($g) => (int) ($g['place']['id'] ?? 0) === $place)) { continue; }
        if ($street !== '' && !array_filter($it['guesses'], static fn($g) => mb_strtolower($g['street']) === $street)) { continue; }
        if ($from && (!$it['year'] || $it['year'] < $from)) { continue; }
        if ($to && (!$it['year'] || $it['year'] > $to)) { continue; }
        if ($cert && !array_filter($cands, static fn($g) => in_array($g['certainty'], $cert, true))) { continue; }
        if ($bbox && !array_filter($cands, static fn($g) => $g['at'] && $g['at']['lat'] >= $bbox[0] && $g['at']['lat'] <= $bbox[2] && $g['at']['lon'] >= $bbox[1] && $g['at']['lon'] <= $bbox[3])) { continue; }
        $out[] = $it;
    }
    $limit = max(1, min(20000, safe_int($f['limit'] ?? 20000) ?: 20000));
    natcasesort($streets);
    return ['items' => array_slice($out, 0, $limit), 'total' => count($out), 'streets' => array_values($streets), 'kinds' => PP_KINDS, 'certainty' => PP_CERTAINTY, 'origins' => PP_ORIGINS];
}

/** Une image, avec ses demandes d'aide (entraide, annonces) déjà faites. */
function pp_get(PDO $pdo, int $mediaId): array
{
    pp_ready($pdo);
    $m = pp_media($pdo, $mediaId);
    if (!$m) { throw new RuntimeException('Image introuvable.'); }
    if ($m['media_type'] !== 'image') { throw new LcndaBadInput('Ce média n’est pas une image.'); }
    $items = pp_list($pdo, ['media_id' => $mediaId])['items'];
    $item = $items[0] ?? ['media_id' => $mediaId, 'title' => (string) $m['title'] ?: 'Image', 'filename' => (string) $m['filename'], 'thumb' => pp_img($m['filename'], $m['thumbnail']),
        'src' => $m['filename'] ? 'media/' . rawurlencode((string) $m['filename']) : '', 'kind' => 'photo', 'kind_label' => PP_KINDS['photo'], 'date_text' => (string) $m['date_text'], 'year' => pp_year((string) $m['date_text']),
        'decade' => null, 'author' => '', 'notes' => '', 'postcard_id' => null, 'today' => null, 'comparison_id' => null, 'guesses' => [], 'retained' => null, 'placed' => false, 'n_guesses' => 0, 'street' => '', 'updated_at' => ''];
    return ['item' => $item, 'asks' => pp_asks($pdo, $mediaId), 'kinds' => PP_KINDS, 'certainty' => PP_CERTAINTY, 'origins' => PP_ORIGINS,
        'streets' => pp_list($pdo, [])['streets']];
}

/** Les demandes d'aide reliées à l'image (même lien que les autres médias de ces fiches : family_collection_media). */
function pp_asks(PDO $pdo, int $mediaId): array
{
    $out = [];
    $s = $pdo->prepare("SELECT h.id, h.status, h.question, h.answer, h.posted_where, h.updated_at FROM help_requests h JOIN family_collection_media cm ON cm.collection_type='help_request' AND cm.collection_id=h.id WHERE cm.media_id=? ORDER BY h.id DESC");
    try { $s->execute([$mediaId]); foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $h) { $out[] = ['type' => 'help_request', 'id' => (int) $h['id'], 'label' => 'Demande d’entraide', 'status' => (string) $h['status'], 'where' => (string) $h['posted_where'], 'updated_at' => (string) $h['updated_at']]; } } catch (Throwable $_) {}
    if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='press_ads'")->fetchColumn()) {
        $s = $pdo->prepare("SELECT a.id, a.title, a.status, a.journal, a.updated_at FROM press_ads a JOIN family_collection_media cm ON cm.collection_type='press_ad' AND cm.collection_id=a.id WHERE cm.media_id=? ORDER BY a.id DESC");
        $s->execute([$mediaId]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $a) { $out[] = ['type' => 'press_ad', 'id' => (int) $a['id'], 'label' => 'Petite annonce', 'status' => (string) $a['status'], 'where' => (string) $a['journal'], 'title' => (string) $a['title'], 'updated_at' => (string) $a['updated_at']]; }
    }
    return $out;
}

function pp_need_image(PDO $pdo, mixed $id): array
{
    $m = pp_media($pdo, safe_int($id));
    if (!$m) { throw new LcndaBadInput('Cette image n’existe plus dans les Médias.'); }
    if ($m['media_type'] !== 'image') { throw new LcndaBadInput('Choisis une image (photo, carte postale, gravure, plan).'); }
    return $m;
}

function pp_touch_info(PDO $pdo, int $mediaId): void
{
    $pdo->prepare('INSERT INTO place_photos(media_id) VALUES(?) ON CONFLICT(media_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP')->execute([$mediaId]);
}

/** Ce qu'on sait de l'image : sorte, date de prise de vue (= media.date_text), auteur ou éditeur, photo d'aujourd'hui, notes. */
function pp_save_info(PDO $pdo, array $d): array
{
    $m = pp_need_image($pdo, $d['media_id'] ?? 0);
    $id = (int) $m['id'];
    $s = $pdo->prepare('SELECT * FROM place_photos WHERE media_id=?'); $s->execute([$id]); $old = $s->fetch(PDO::FETCH_ASSOC) ?: null;
    $kind = (string) scalar_text($d['kind'] ?? ($old['kind'] ?? 'photo'));
    if (!isset(PP_KINDS[$kind])) { $kind = 'photo'; }
    $today = array_key_exists('today_media_id', $d) ? safe_int($d['today_media_id']) : (int) ($old['today_media_id'] ?? 0);
    if ($today) { pp_need_image($pdo, $today); if ($today === $id) { throw new LcndaBadInput('La photo d’aujourd’hui doit être une autre image.'); } }
    $cmp = array_key_exists('comparison_id', $d) ? safe_int($d['comparison_id']) : (int) ($old['comparison_id'] ?? 0);
    if ($cmp) { $c = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='photo_comparisons'"); $c->execute(); if ($c->fetchColumn()) { $c = $pdo->prepare('SELECT 1 FROM photo_comparisons WHERE id=?'); $c->execute([$cmp]); if (!$c->fetchColumn()) { $cmp = 0; } } else { $cmp = 0; } }
    $vals = [$kind, array_key_exists('author', $d) ? pp_text($d['author'], 300) : (string) ($old['author'] ?? ''), $today ?: null, $cmp ?: null,
        array_key_exists('notes', $d) ? pp_text($d['notes'], 8000, true) : (string) ($old['notes'] ?? '')];
    if ($old) { $pdo->prepare('UPDATE place_photos SET kind=?, author=?, today_media_id=?, comparison_id=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE media_id=?')->execute([...$vals, $id]); }
    else { $pdo->prepare('INSERT INTO place_photos(kind, author, today_media_id, comparison_id, notes, media_id) VALUES(?,?,?,?,?,?)')->execute([...$vals, $id]); }
    if (array_key_exists('date_text', $d)) {
        $date = pp_text($d['date_text'], 120);
        if ($date !== (string) $m['date_text']) { $pdo->prepare('UPDATE media SET date_text=? WHERE id=?')->execute([$date, $id]); }
    }
    log_change($pdo, 'place_photo', $id, $old ? 'update' : 'create', 'Image de lieu : ' . ((string) $m['title'] ?: 'n° ' . $id), $old, null);
    return ['ok' => true, 'item' => pp_get($pdo, $id)['item']];
}

function pp_guess_row(PDO $pdo, int $id): ?array
{
    $s = $pdo->prepare('SELECT * FROM place_photo_guesses WHERE id=?'); $s->execute([$id]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** Une hypothèse relue : lieu et/ou point, OU une zone ; rue, adresse, direction, certitude, pourquoi, auteur, origine. */
function pp_guess_values(PDO $pdo, array $d, int $mediaId): array
{
    $placeId = safe_int($d['place_id'] ?? 0);
    if ($placeId) { $c = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $c->execute([$placeId]); if (!$c->fetchColumn()) { throw new LcndaBadInput('Ce lieu n’existe plus dans la base.'); } }
    $lat = pp_num($d['lat'] ?? null, -90, 90); $lon = pp_num($d['lon'] ?? null, -180, 180);
    if (($lat === null) !== ($lon === null)) { throw new LcndaBadInput('Le point précis a besoin de la latitude et de la longitude.'); }
    if ((($d['lat'] ?? '') !== '' && ($d['lat'] ?? null) !== null && $lat === null) || (($d['lon'] ?? '') !== '' && ($d['lon'] ?? null) !== null && $lon === null)) { throw new LcndaBadInput('Latitude entre -90 et 90, longitude entre -180 et 180.'); }
    $zone = pp_zone($d['zone'] ?? null);
    if (!$placeId && $lat === null && !$zone) { throw new LcndaBadInput('Donne au moins un lieu, un point sur la carte ou une zone.'); }
    $bearing = pp_num($d['bearing'] ?? null, 0, 360);
    if ($bearing !== null) { $bearing = fmod($bearing, 360.0); }
    $fov = pp_num($d['fov'] ?? null, 5, 180);
    $cert = (string) scalar_text($d['certainty'] ?? 'possible');
    if (!isset(PP_CERTAINTY[$cert])) { $cert = 'possible'; }
    $origin = (string) scalar_text($d['origin'] ?? 'me');
    if (!isset(PP_ORIGINS[$origin])) { $origin = 'me'; }
    $originId = safe_int($d['origin_id'] ?? 0) ?: null;
    if ($originId && in_array($origin, ['help_request', 'press_ad'], true)) {
        $t = $origin === 'help_request' ? 'help_requests' : 'press_ads';
        try { $c = $pdo->prepare("SELECT 1 FROM $t WHERE id=?"); $c->execute([$originId]); if (!$c->fetchColumn()) { $originId = null; } } catch (Throwable $_) { $originId = null; }
    } elseif (!in_array($origin, ['help_request', 'press_ad'], true)) { $originId = null; }
    return ['media_id' => $mediaId, 'place_id' => $placeId ?: null, 'lat' => $lat, 'lon' => $lon, 'zone_json' => $zone ? json_encode($zone) : '',
        'street' => pp_text($d['street'] ?? '', 200), 'address' => pp_text($d['address'] ?? '', 400), 'bearing' => $bearing, 'fov' => $bearing === null ? null : ($fov ?? 60.0),
        'certainty' => $cert, 'why' => pp_text($d['why'] ?? '', 4000, true), 'author' => pp_text($d['author'] ?? '', 160), 'origin' => $origin, 'origin_id' => $originId];
}

/** La retenue devient le lieu du média et celui de sa carte postale (un seul lieu, partout). */
function pp_sync(PDO $pdo, int $mediaId): void
{
    $s = $pdo->prepare('SELECT * FROM place_photo_guesses WHERE media_id=? AND retained=1'); $s->execute([$mediaId]);
    $g = $s->fetch(PDO::FETCH_ASSOC);
    if (!$g) { return; }
    if ($g['place_id'] && pp_has_col($pdo, 'media', 'place_id')) { $pdo->prepare('UPDATE media SET place_id=? WHERE id=?')->execute([(int) $g['place_id'], $mediaId]); }
    if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='postcards'")->fetchColumn()) {
        $zone = $g['zone_json'] !== '' ? json_decode((string) $g['zone_json'], true) : null;
        $at = $g['lat'] !== null ? [(float) $g['lat'], (float) $g['lon']] : null;
        $set = ['updated_at=CURRENT_TIMESTAMP']; $args = [];
        if ($g['place_id']) { $set[] = 'place_id=?'; $args[] = (int) $g['place_id']; }
        if ($at) { $set[] = 'view_lat=?'; $set[] = 'view_lon=?'; $args[] = $at[0]; $args[] = $at[1]; }
        elseif (is_array($zone) && ($zone['type'] ?? '') === 'circle') { $set[] = 'view_lat=?'; $set[] = 'view_lon=?'; $args[] = (float) $zone['lat']; $args[] = (float) $zone['lon']; }
        if ($g['bearing'] !== null) { $set[] = 'view_bearing=?'; $args[] = (float) $g['bearing']; }
        if (count($set) > 1) { $args[] = $mediaId; $pdo->prepare('UPDATE postcards SET ' . implode(', ', $set) . ' WHERE media_id=?')->execute($args); }
    }
}

function pp_set_retained(PDO $pdo, int $mediaId, int $guessId): void
{
    $pdo->prepare('UPDATE place_photo_guesses SET retained=0 WHERE media_id=? AND id<>?')->execute([$mediaId, $guessId]);
    $pdo->prepare('UPDATE place_photo_guesses SET retained=1, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$guessId]);
}

function pp_save_guess(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $old = $id ? pp_guess_row($pdo, $id) : null;
    if ($id && !$old) { throw new RuntimeException('Hypothèse introuvable.'); }
    $m = pp_need_image($pdo, $old ? $old['media_id'] : ($d['media_id'] ?? 0));
    $mediaId = (int) $m['id'];
    $v = pp_guess_values($pdo, $d, $mediaId);
    if (!$old) {
        $n = $pdo->prepare('SELECT count(*) FROM place_photo_guesses WHERE media_id=?'); $n->execute([$mediaId]);
        $count = (int) $n->fetchColumn();
        if ($count >= PP_MAX_GUESSES) { throw new LcndaBadInput('Une image a au plus ' . PP_MAX_GUESSES . ' hypothèses : retire celles qui ne tiennent plus.'); }
        $cols = array_keys($v);
        $pdo->prepare('INSERT INTO place_photo_guesses(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute(array_values($v));
        $id = (int) $pdo->lastInsertId();
        $retain = !empty($d['retained']) || $count === 0; // la première est retenue d'office
    } else {
        unset($v['media_id']);
        $pdo->prepare('UPDATE place_photo_guesses SET ' . implode(', ', array_map(static fn($c) => "$c=?", array_keys($v))) . ', updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...array_values($v), $id]);
        $retain = !empty($d['retained']);
    }
    if ($retain) { pp_set_retained($pdo, $mediaId, $id); }
    pp_touch_info($pdo, $mediaId);
    pp_sync($pdo, $mediaId);
    log_change($pdo, 'place_photo', $mediaId, $old ? 'update' : 'create', ($old ? 'Hypothèse de lieu modifiée' : 'Hypothèse de lieu ajoutée') . ' : ' . ((string) $m['title'] ?: 'image n° ' . $mediaId), $old, pp_guess_row($pdo, $id));
    return ['ok' => true, 'id' => $id, 'item' => pp_get($pdo, $mediaId)['item']];
}

function pp_retain(PDO $pdo, array $d): array
{
    $g = pp_guess_row($pdo, safe_int($d['id'] ?? 0));
    if (!$g) { throw new RuntimeException('Hypothèse introuvable.'); }
    $prev = $pdo->prepare('SELECT id FROM place_photo_guesses WHERE media_id=? AND retained=1'); $prev->execute([(int) $g['media_id']]);
    $before = (int) $prev->fetchColumn();
    pp_set_retained($pdo, (int) $g['media_id'], (int) $g['id']);
    pp_sync($pdo, (int) $g['media_id']);
    log_change($pdo, 'place_photo', (int) $g['media_id'], 'update', 'Hypothèse de lieu retenue', null, null);
    return ['ok' => true, 'previous' => $before ?: null, 'item' => pp_get($pdo, (int) $g['media_id'])['item']];
}

/** Supprime une hypothèse ; rend la ligne pour « ↶ Annuler ». Si c'était la retenue, la plus sûre qui reste prend sa place. */
function pp_delete_guess(PDO $pdo, array $d): array
{
    $g = pp_guess_row($pdo, safe_int($d['id'] ?? 0));
    if (!$g) { throw new RuntimeException('Hypothèse introuvable.'); }
    $mediaId = (int) $g['media_id'];
    $pdo->prepare('DELETE FROM place_photo_guesses WHERE id=?')->execute([(int) $g['id']]);
    if ((int) $g['retained']) {
        $n = $pdo->prepare("SELECT id FROM place_photo_guesses WHERE media_id=? ORDER BY CASE certainty WHEN 'certain' THEN 0 WHEN 'probable' THEN 1 WHEN 'possible' THEN 2 ELSE 3 END, id LIMIT 1"); $n->execute([$mediaId]);
        if ($next = (int) $n->fetchColumn()) { pp_set_retained($pdo, $mediaId, $next); pp_sync($pdo, $mediaId); }
    }
    log_change($pdo, 'place_photo', $mediaId, 'delete', 'Hypothèse de lieu retirée', $g, null);
    return ['ok' => true, 'snapshot' => $g, 'item' => pp_get($pdo, $mediaId)['item']];
}

function pp_restore_guess(PDO $pdo, array $d): array
{
    $s = is_array($d['snapshot'] ?? null) ? $d['snapshot'] : [];
    $id = safe_int($s['id'] ?? 0);
    if ($id <= 0 || pp_guess_row($pdo, $id)) { throw new LcndaBadInput('Rien à remettre.'); }
    $m = pp_need_image($pdo, $s['media_id'] ?? 0);
    $v = pp_guess_values($pdo, ['place_id' => $s['place_id'] ?? 0, 'lat' => $s['lat'] ?? null, 'lon' => $s['lon'] ?? null, 'zone' => $s['zone_json'] ?? '', 'street' => $s['street'] ?? '', 'address' => $s['address'] ?? '',
        'bearing' => $s['bearing'] ?? null, 'fov' => $s['fov'] ?? null, 'certainty' => $s['certainty'] ?? 'possible', 'why' => $s['why'] ?? '', 'author' => $s['author'] ?? '', 'origin' => $s['origin'] ?? 'me', 'origin_id' => $s['origin_id'] ?? null], (int) $m['id']);
    $cols = ['id', ...array_keys($v)];
    $pdo->prepare('INSERT INTO place_photo_guesses(' . implode(',', $cols) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute([$id, ...array_values($v)]);
    if (!empty($s['retained'])) { pp_set_retained($pdo, (int) $m['id'], $id); pp_sync($pdo, (int) $m['id']); }
    log_change($pdo, 'place_photo', (int) $m['id'], 'create', 'Hypothèse de lieu remise', null, null);
    return ['ok' => true, 'id' => $id, 'item' => pp_get($pdo, (int) $m['id'])['item']];
}

/** Le texte de la demande : ce qu'on voit, ce qu'on croit (hypothèses et indices), les questions. */
function pp_help_text(PDO $pdo, int $mediaId, string $format, string $question = ''): array
{
    $it = pp_get($pdo, $mediaId)['item'];
    $what = mb_strtolower($it['kind_label']);
    $when = $it['date_text'] !== '' ? $it['date_text'] : '';
    $title = ($format === 'facebook' ? '📍 ' : '') . 'Où a été prise cette ' . ($it['kind'] === 'postcard' ? 'carte postale' : ($it['kind'] === 'plan' ? 'vue (plan)' : 'photo')) . ' ?' . ($when !== '' ? ' (' . $when . ')' : '');
    $placeOf = static function (array $g): string {
        $p = [];
        if ($g['place']) { $p[] = $g['place']['name'] . ($g['place']['county'] && $g['place']['county'] !== $g['place']['name'] ? ' (' . $g['place']['county'] . ')' : ''); }
        if ($g['street'] !== '') { $p[] = $g['street']; }
        if ($g['address'] !== '') { $p[] = $g['address']; }
        if (!$p && $g['zone']) { $p[] = $g['zone']['type'] === 'circle' ? 'dans un rayon de ' . (int) $g['zone']['r'] . ' m autour de ' . round($g['zone']['lat'], 5) . ', ' . round($g['zone']['lon'], 5) : 'dans une zone dessinée sur la carte'; }
        if (!$p && $g['lat'] !== null) { $p[] = 'près de ' . round($g['lat'], 5) . ', ' . round($g['lon'], 5); }
        return implode(', ', $p) ?: 'lieu à préciser';
    };
    $out = [$title, '', 'Bonjour à toutes et à tous,', ''];
    $out[] = 'Je cherche où a été prise cette ' . $what . ($when !== '' ? ' (datée : ' . $when . ')' : '') . ($it['author'] !== '' ? ', éditeur ou photographe : ' . $it['author'] : '') . '.';
    if ($it['title'] !== '') { $out[] = 'Titre ou légende : « ' . $it['title'] . ' ».'; }
    if ($question !== '') { $out[] = ''; $out[] = $question; }
    if ($it['guesses']) {
        $out[] = '';
        $out[] = $format === 'facebook' ? '🤔 Mes pistes :' : 'Mes pistes, de la plus sûre à la moins sûre :';
        foreach (array_slice($it['guesses'], 0, $format === 'facebook' ? 4 : 12) as $g) {
            $line = ($format === 'facebook' ? '• ' : '- ') . $placeOf($g) . ' — ' . mb_strtolower($g['certainty_label']);
            if ($g['why'] !== '' && $format !== 'annonce') { $line .= ' (' . preg_replace('/\s+/u', ' ', mb_substr($g['why'], 0, 240)) . ')'; }
            $out[] = $line;
        }
    }
    $out[] = '';
    $out[] = $format === 'facebook' ? '❓ Reconnaissez-vous la rue, la place, un bâtiment ?' : 'Mes questions :';
    if ($format !== 'facebook') {
        $out[] = '- Reconnaissez-vous ce lieu (commune, rue, place, bâtiment) ?';
        $out[] = '- D’où la vue a-t-elle été prise, et vers quelle direction ?';
        $out[] = '- Le bâtiment ou la rue existent-ils encore aujourd’hui ?';
    }
    $out[] = '';
    $out[] = $format === 'facebook' ? '🙏 Merci d’avance !' : 'La photo est jointe. Merci d’avance pour toute piste (même un simple « ça me fait penser à… ») !';
    $long = implode("\n", $out);
    $short = 'Recherche lieu de ' . ($it['kind'] === 'postcard' ? 'carte postale ancienne' : 'photo ancienne') . ($when !== '' ? ' (' . $when . ')' : '') . ($it['title'] !== '' ? ' « ' . mb_substr($it['title'], 0, 80) . ' »' : '')
        . ($it['guesses'] ? ', peut-être ' . $placeOf($it['guesses'][0]) : '') . '. Qui reconnaît le lieu ? Photo sur demande.';
    return ['title' => $title, 'message' => $long, 'short' => $short, 'item' => $it];
}

/** « 🙋 Demander de l'aide » : la demande est créée DANS l'outil existant (entraide ou annonces), la photo y est reliée. */
function pp_ask(PDO $pdo, array $d): array
{
    $m = pp_need_image($pdo, $d['media_id'] ?? 0);
    $mediaId = (int) $m['id'];
    $where = (string) scalar_text($d['where'] ?? 'help_request');
    $question = pp_text($d['question'] ?? '', 2000, true);
    $message = array_key_exists('message', $d) && trim(scalar_text($d['message'])) !== '' ? mb_substr(str_replace("\0", '', preg_replace("/\r\n?/", "\n", scalar_text($d['message']))), 0, 20000) : null;
    pp_touch_info($pdo, $mediaId);
    if ($where === 'help_request') {
        $t = pp_help_text($pdo, $mediaId, (string) scalar_text($d['format'] ?? 'forum'), $question);
        $target = defined('HELP_TARGETS') && isset(HELP_TARGETS['place_photo']) ? 'place_photo' : 'other';
        $pdo->prepare('INSERT INTO help_requests(person_id, target, question, message, status, posted_where, posted_url, answer) VALUES(NULL,?,?,?,?,?,?,?)')
            ->execute([$target, $question !== '' ? $question : $t['title'], $message ?? $t['message'], 'draft', pp_text($d['posted_where'] ?? '', 200), '', '']);
        $id = (int) $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO family_collection_media(collection_type, collection_id, media_id, position, role) VALUES('help_request', ?, ?, 0, 'photo')")->execute([$id, $mediaId]);
        log_change($pdo, 'help_request', $id, 'create', 'Demande d’entraide : où a été prise une image');
        return ['ok' => true, 'type' => 'help_request', 'id' => $id, 'message' => $message ?? $t['message']];
    }
    if ($where === 'press_ad') {
        if (!function_exists('press_ads_ensure')) { require_once __DIR__ . '/periodicals.php'; }
        press_ads_ensure($pdo);
        $t = pp_help_text($pdo, $mediaId, 'annonce', $question);
        $pdo->prepare("INSERT INTO press_ads(title, kind, rules_id, periodical_id, journal, body, status, data_json) VALUES(?, 'recherche', 0, 0, ?, ?, 'draft', '{}')")
            ->execute([mb_substr($t['title'], 0, 200), pp_text($d['journal'] ?? '', 200), $message ?? $t['short']]);
        $id = (int) $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO family_collection_media(collection_type, collection_id, media_id, position, role) VALUES('press_ad', ?, ?, 0, 'photo')")->execute([$id, $mediaId]);
        log_change($pdo, 'meta', 0, 'update', 'Annonce enregistrée : ' . mb_substr($t['title'], 0, 200));
        return ['ok' => true, 'type' => 'press_ad', 'id' => $id, 'message' => $message ?? $t['short']];
    }
    throw new LcndaBadInput('Choisis où demander de l’aide (entraide ou petite annonce).');
}

/** Une réponse reçue → une nouvelle hypothèse, avec son auteur ; la réponse est aussi notée dans la demande (état « réponse reçue »). */
function pp_answer(PDO $pdo, array $d): array
{
    $type = (string) scalar_text($d['ask_type'] ?? '');
    $askId = safe_int($d['ask_id'] ?? 0);
    $author = pp_text($d['author'] ?? '', 160);
    if ($author === '') { throw new LcndaBadInput('Qui a répondu ? Donne un nom ou un pseudo.'); }
    $text = pp_text($d['why'] ?? '', 4000, true);
    $prev = null;
    if ($type === 'help_request' && $askId) {
        $s = $pdo->prepare('SELECT answer, status FROM help_requests WHERE id=?'); $s->execute([$askId]); $prev = $s->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$prev) { throw new LcndaBadInput('Cette demande d’entraide n’existe plus.'); }
    } elseif ($type === 'press_ad' && $askId) {
        if (!function_exists('press_ads_ensure')) { require_once __DIR__ . '/periodicals.php'; }
        press_ads_ensure($pdo);
        $s = $pdo->prepare('SELECT data_json AS answer, status FROM press_ads WHERE id=?'); $s->execute([$askId]); $prev = $s->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$prev) { throw new LcndaBadInput('Cette annonce n’existe plus.'); }
    } elseif (!in_array($type, ['forum', 'other'], true)) { $type = 'other'; $askId = 0; }
    $r = pp_save_guess($pdo, [...$d, 'id' => 0, 'author' => $author, 'origin' => $type, 'origin_id' => $askId ?: null, 'why' => $text]);
    $line = '— ' . $author . ' : ' . ($text !== '' ? preg_replace('/\s+/u', ' ', $text) : 'piste de lieu notée sur l’image');
    if ($type === 'help_request' && $prev) {
        $pdo->prepare("UPDATE help_requests SET answer=?, status=CASE WHEN status IN ('draft','posted') THEN 'answered' ELSE status END, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([mb_substr(trim((string) $prev['answer'] . "\n" . $line), 0, 20000), $askId]);
    } elseif ($type === 'press_ad' && $prev) {
        $data = json_decode((string) $prev['answer'], true) ?: [];
        $data['answers'] = mb_substr(trim((string) ($data['answers'] ?? '') . "\n" . $line), 0, 8000);
        $pdo->prepare("UPDATE press_ads SET data_json=?, status=CASE WHEN status IN ('draft','ready','sent','published') THEN 'answered' ELSE status END, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([json_encode($data, JSON_UNESCAPED_UNICODE), $askId]);
    }
    return $r + ['undo' => ['guess_id' => $r['id'], 'ask_type' => $type, 'ask_id' => $askId, 'prev_answer' => $prev['answer'] ?? null, 'prev_status' => $prev['status'] ?? null]];
}

function pp_answer_undo(PDO $pdo, array $d): array
{
    $g = pp_guess_row($pdo, safe_int($d['guess_id'] ?? 0));
    $mediaId = $g ? (int) $g['media_id'] : 0;
    if ($g) { pp_delete_guess($pdo, ['id' => (int) $g['id']]); }
    $type = (string) scalar_text($d['ask_type'] ?? ''); $askId = safe_int($d['ask_id'] ?? 0);
    $prevStatus = (string) scalar_text($d['prev_status'] ?? '');
    if ($type === 'help_request' && $askId && $prevStatus !== '') {
        $st = in_array($prevStatus, ['draft', 'posted', 'answered', 'solved', 'abandoned'], true) ? $prevStatus : 'draft';
        $pdo->prepare('UPDATE help_requests SET answer=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([mb_substr(scalar_text($d['prev_answer'] ?? ''), 0, 20000), $st, $askId]);
    } elseif ($type === 'press_ad' && $askId && $prevStatus !== '') {
        $data = json_decode(scalar_text($d['prev_answer'] ?? '{}'), true);
        $st = in_array($prevStatus, ['draft', 'ready', 'sent', 'published', 'answered', 'closed', 'refused'], true) ? $prevStatus : 'draft';
        $pdo->prepare('UPDATE press_ads SET data_json=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([json_encode(is_array($data) ? $data : [], JSON_UNESCAPED_UNICODE), $st, $askId]);
    }
    return ['ok' => true, 'item' => $mediaId ? pp_get($pdo, $mediaId)['item'] : null];
}

/** Aiguillage depuis api.php (après verify_csrf et kiosk_guard). */
function place_photos_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        pp_ready($pdo);
        if (!$isWrite && $action === 'place_photos') { json_response(pp_list($pdo, $_GET)); }
        if (!$isWrite && $action === 'place_photo') { json_response(pp_get($pdo, safe_int($_GET['media_id'] ?? 0))); }
        if (!$isWrite && $action === 'place_photo_help_text') { json_response(pp_help_text($pdo, pp_need_image($pdo, $_GET['media_id'] ?? 0)['id'], (string) scalar_text($_GET['format'] ?? 'forum'), pp_text($_GET['question'] ?? '', 2000, true))); }
        if ($isWrite && $action === 'place_photo_write') {
            if (!function_exists('help_requests_data')) { require_once __DIR__ . '/heritage_links.php'; }
            $op = scalar_text($payload['op'] ?? '', 'op');
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'info' => pp_save_info($pdo, $payload),
                    'guess' => pp_save_guess($pdo, $payload),
                    'retain' => pp_retain($pdo, $payload),
                    'delete_guess' => pp_delete_guess($pdo, $payload),
                    'restore_guess' => pp_restore_guess($pdo, $payload),
                    'ask' => pp_ask($pdo, $payload),
                    'answer' => pp_answer($pdo, $payload),
                    'answer_undo' => pp_answer_undo($pdo, $payload),
                    default => throw new LcndaBadInput('Opération inconnue sur les images de lieux.'),
                };
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue sur les images de lieux.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
