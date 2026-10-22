<?php
declare(strict_types=1);

/**
 * 🗺 Cadastre (écran : assets/js/heritage-cadastre.js ; Listes → Lieux et maisons → « 🗺 Cadastre »).
 * Une parcelle = commune (code INSEE + lieu de la base), préfixe, section, numéro, lieu-dit, surface, nature, adresse,
 * ancien numéro (plan napoléonien), contour (GeoJSON), notes ; et ses liens (cadastre_parcel_links) : personnes
 * (propriétaire, occupant… avec un rôle et des dates C4), maisons de l'outil Maison, lieux, événements, médias (extrait de
 * matrice, plan scanné, photos), sources, cartes anciennes calées (Listes → Cartes anciennes). Migration schema_v60.
 *
 * Données libres de droit récupérées en ligne, TOUJOURS par le serveur (aucune clé, cache local, délais courts, limite
 * de demandes ; on n'envoie que le code de la commune, la section, le numéro ou un point : jamais un nom de personne) :
 *  - API Carto de l'IGN, module cadastre (apicarto.ign.fr/api/cadastre : Parcellaire Express PCI, Licence Ouverte 2.0) ;
 *  - en secours, le WFS de la Géoplateforme IGN (data.geopf.fr/wfs, couche CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle) ;
 *  - l'adresse la plus proche : géocodage inverse de la Géoplateforme (data.geopf.fr/geocodage, BAN, Licence Ouverte 2.0) ;
 *  - les ventes depuis 2020 : DVF géolocalisées d'Etalab (files.data.gouv.fr/geo-dvf, Licence Ouverte 2.0, sans nom de personne).
 * Pour les essais : LCNDA_CADASTRE_FIXTURES=dossier (index.json = [{match, file}]) remplace Internet par des réponses enregistrées.
 */

const CADASTRE_LINK_KINDS = ['person', 'house', 'place', 'event', 'media', 'source', 'oldmap'];
const CADASTRE_LINKS_MAX = 500;
const CADASTRE_GEOM_POINTS_MAX = 20000;
const CADASTRE_CACHE_DAYS = 30;
const CADASTRE_RATE_PER_MIN = 40;
const CADASTRE_APICARTO = 'https://apicarto.ign.fr/api/cadastre/';
const CADASTRE_WFS = 'https://data.geopf.fr/wfs/ows';
const CADASTRE_REVERSE = 'https://data.geopf.fr/geocodage/reverse';
const CADASTRE_DVF = 'https://files.data.gouv.fr/geo-dvf/latest/csv/%d/communes/%s/%s.csv';
const CADASTRE_ATTRIBUTION = 'Parcelles : DGFiP / IGN, Parcellaire Express (PCI), Licence Ouverte 2.0';

function cadastre_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS cadastre_parcels (id INTEGER PRIMARY KEY AUTOINCREMENT,
        insee TEXT NOT NULL DEFAULT '', commune_place_id INTEGER, commune_name TEXT NOT NULL DEFAULT '',
        prefixe TEXT NOT NULL DEFAULT '000', section TEXT NOT NULL DEFAULT '', numero TEXT NOT NULL DEFAULT '', idu TEXT NOT NULL DEFAULT '',
        lieu_dit TEXT NOT NULL DEFAULT '', surface_m2 INTEGER, nature TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
        old_ref TEXT NOT NULL DEFAULT '', geometry_json TEXT NOT NULL DEFAULT '', lat REAL, lon REAL,
        source TEXT NOT NULL DEFAULT 'manual', notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_cadastre_parcels_idu ON cadastre_parcels(idu) WHERE idu <> ''");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cadastre_parcels_insee ON cadastre_parcels(insee, section, numero)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cadastre_parcels_place ON cadastre_parcels(commune_place_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS cadastre_parcel_links (id INTEGER PRIMARY KEY AUTOINCREMENT, parcel_id INTEGER NOT NULL,
        kind TEXT NOT NULL, target_id INTEGER, txt TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '', is_primary INTEGER NOT NULL DEFAULT 0,
        date_from TEXT NOT NULL DEFAULT '', date_to TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (parcel_id) REFERENCES cadastre_parcels(id) ON DELETE CASCADE)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cadastre_links_parcel ON cadastre_parcel_links(parcel_id, sort_order)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_cadastre_links_target ON cadastre_parcel_links(kind, target_id)');
}

/** Lecture seule d'abord (pas de CREATE pendant la lecture d'une fiche : « base verrouillée ») */
function cadastre_ready(PDO $pdo): bool
{
    static $ok = null;
    if ($ok === true) { return true; }
    $ok = (int) $pdo->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('cadastre_parcels','cadastre_parcel_links')")->fetchColumn() === 2;
    return $ok;
}

/* ─────────────── Petites règles ─────────────── */

function cadastre_insee(mixed $v): string
{
    $s = strtoupper(preg_replace('/\s+/', '', safe_text($v)) ?? '');
    return preg_match('/^(\d{5}|2[AB]\d{3})$/', $s) ? $s : '';
}
/** « a » → « 0A », « ab » → « AB », « 0b » → « 0B » ; vide si ce n'est pas une section */
function cadastre_section(mixed $v): string
{
    $s = strtoupper(preg_replace('/[\s.\-]+/', '', safe_text($v)) ?? '');
    if (!preg_match('/^[0-9A-Z]{1,2}$/', $s)) { return ''; }
    return str_pad($s, 2, '0', STR_PAD_LEFT);
}
/** « 12 » → « 0012 » ; vide si ce n'est pas un numéro */
function cadastre_numero(mixed $v): string
{
    $s = preg_replace('/\s+/', '', safe_text($v)) ?? '';
    if (!preg_match('/^\d{1,4}$/', $s) || (int) $s === 0) { return ''; }
    return str_pad($s, 4, '0', STR_PAD_LEFT);
}
function cadastre_prefixe(mixed $v): string
{
    $s = preg_replace('/\D/', '', safe_text($v)) ?? '';
    return $s === '' ? '000' : str_pad(substr($s, 0, 3), 3, '0', STR_PAD_LEFT);
}
function cadastre_idu(string $insee, string $prefixe, string $section, string $numero): string
{
    return $insee !== '' && $section !== '' && $numero !== '' ? $insee . $prefixe . $section . $numero : '';
}
function cadastre_dept(string $insee): string
{
    return preg_match('/^97\d/', $insee) ? substr($insee, 0, 3) : substr($insee, 0, 2);
}
function cadastre_text(mixed $v, int $max): string
{
    return mb_substr(safe_text($v), 0, $max);
}
/** Le titre d'une parcelle : « Section AB n° 100 » (« 0A » s'écrit « A ») */
function cadastre_title(array $p): string
{
    $sec = ltrim((string) ($p['section'] ?? ''), '0') ?: (string) ($p['section'] ?? '');
    $num = ltrim((string) ($p['numero'] ?? ''), '0');
    $t = trim(($sec !== '' ? 'Section ' . $sec : '') . ($num !== '' ? ' n° ' . $num : ''));
    return $t !== '' ? $t : (trim((string) ($p['lieu_dit'] ?? '')) ?: 'Parcelle sans numéro');
}

/**
 * Contour GeoJSON (Polygon ou MultiPolygon) : nombres finis, longitudes et latitudes possibles, 20 000 points au plus,
 * 7 décimales (1 cm). Rend [géométrie, lat, lon du centre] ou [null, null, null].
 */
function cadastre_clean_geometry(mixed $g): array
{
    if (is_string($g)) { $g = $g === '' ? null : json_decode($g, true); }
    if (!is_array($g) || !in_array($g['type'] ?? '', ['Polygon', 'MultiPolygon'], true) || !is_array($g['coordinates'] ?? null)) { return [null, null, null]; }
    $polys = $g['type'] === 'Polygon' ? [$g['coordinates']] : $g['coordinates'];
    $count = 0; $out = []; $bb = [INF, INF, -INF, -INF]; $n = 0;
    foreach ($polys as $poly) {
        if (!is_array($poly)) { continue; }
        $rings = [];
        foreach ($poly as $ring) {
            if (!is_array($ring)) { continue; }
            $pts = [];
            foreach ($ring as $pt) {
                if (!is_array($pt) || !isset($pt[0], $pt[1]) || !is_numeric($pt[0]) || !is_numeric($pt[1])) { continue; }
                $lon = (float) $pt[0]; $lat = (float) $pt[1];
                if (!is_finite($lon) || !is_finite($lat) || abs($lon) > 180 || abs($lat) > 90) { continue; }
                if (++$count > CADASTRE_GEOM_POINTS_MAX) { break 3; }
                $pts[] = [round($lon, 7), round($lat, 7)];
                if (!$rings) { $bb = [min($bb[0], $lon), min($bb[1], $lat), max($bb[2], $lon), max($bb[3], $lat)]; $n++; }
            }
            if (count($pts) >= 3) { $rings[] = $pts; }
        }
        if ($rings) { $out[] = $rings; }
    }
    if (!$out || !$n) { return [null, null, null]; }
    return [['type' => 'MultiPolygon', 'coordinates' => $out], round(($bb[1] + $bb[3]) / 2, 7), round(($bb[0] + $bb[2]) / 2, 7)]; // le centre du cadre des contours extérieurs
}

/** Le point est-il dans le contour ? (pour garder la bonne parcelle autour d'un clic) */
function cadastre_point_in(array $geom, float $lat, float $lon): bool
{
    foreach ($geom['coordinates'] ?? [] as $poly) {
        $inside = false;
        foreach ($poly as $k => $ring) {
            $in = false; $m = count($ring);
            for ($i = 0, $j = $m - 1; $i < $m; $j = $i++) {
                [$xi, $yi] = $ring[$i]; [$xj, $yj] = $ring[$j];
                if (($yi > $lat) !== ($yj > $lat) && $lon < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12) + $xi) { $in = !$in; }
            }
            if ($k === 0) { $inside = $in; } elseif ($in) { $inside = false; }
        }
        if ($inside) { return true; }
    }
    return false;
}

/* ─────────────── Liste, fiche ─────────────── */

/** Ce qu'il faut pour la liste (et la carte, avec with_geom=1) : sans les textes longs */
function cadastre_list(PDO $pdo, array $get = []): array
{
    if (!cadastre_ready($pdo)) { return ['items' => [], 'attribution' => CADASTRE_ATTRIBUTION]; }
    $geom = !empty($get['with_geom']);
    $rows = $pdo->query('SELECT id, insee, commune_place_id, commune_name, prefixe, section, numero, idu, lieu_dit, surface_m2, nature, address, old_ref, lat, lon, source, created_at, updated_at'
        . ($geom ? ', geometry_json' : '') . ' FROM cadastre_parcels ORDER BY updated_at DESC, id DESC LIMIT 5000')->fetchAll(PDO::FETCH_ASSOC);
    $links = [];
    foreach ($pdo->query("SELECT l.parcel_id, l.kind, l.target_id, l.txt, l.role, l.date_from, l.date_to FROM cadastre_parcel_links l ORDER BY l.parcel_id, l.sort_order, l.id")->fetchAll(PDO::FETCH_ASSOC) as $l) {
        $links[(int) $l['parcel_id']][] = $l;
    }
    $names = cadastre_person_names($pdo, array_merge(...array_map(static fn($ls) => array_map(static fn($l) => $l['kind'] === 'person' ? (int) $l['target_id'] : 0, $ls), array_values($links) ?: [[]])));
    $houseIds = []; foreach ($links as $ls) { foreach ($ls as $l) { if ($l['kind'] === 'house') { $houseIds[] = (int) $l['target_id']; } } }
    $houses = cadastre_titles($pdo, 'houses', 'name', $houseIds);
    $out = [];
    foreach ($rows as $r) {
        $id = (int) $r['id']; $ls = $links[$id] ?? [];
        $count = array_count_values(array_column($ls, 'kind'));
        $people = [];
        foreach ($ls as $l) {
            if ($l['kind'] !== 'person') { continue; }
            $people[] = ['id' => (int) $l['target_id'], 'name' => $l['target_id'] ? ($names[(int) $l['target_id']] ?? 'Fiche supprimée') : $l['txt'], 'role' => $l['role'], 'from' => $l['date_from'], 'to' => $l['date_to']];
        }
        $item = ['id' => $id, 'title' => cadastre_title($r), 'insee' => $r['insee'], 'commune_place_id' => (int) $r['commune_place_id'], 'commune' => $r['commune_name'],
            'prefixe' => $r['prefixe'], 'section' => $r['section'], 'numero' => $r['numero'], 'idu' => $r['idu'], 'lieu_dit' => $r['lieu_dit'],
            'surface_m2' => $r['surface_m2'] === null ? null : (int) $r['surface_m2'], 'nature' => $r['nature'], 'address' => $r['address'], 'old_ref' => $r['old_ref'],
            'lat' => $r['lat'] === null ? null : (float) $r['lat'], 'lon' => $r['lon'] === null ? null : (float) $r['lon'], 'source' => $r['source'],
            'people' => $people, 'houses' => array_values(array_filter(array_map(static fn($l) => $l['kind'] === 'house' ? ['id' => (int) $l['target_id'], 'name' => $houses[(int) $l['target_id']] ?? 'Maison'] : null, $ls))),
            'counts' => ['person' => $count['person'] ?? 0, 'house' => $count['house'] ?? 0, 'media' => $count['media'] ?? 0, 'event' => $count['event'] ?? 0, 'oldmap' => $count['oldmap'] ?? 0, 'source' => $count['source'] ?? 0, 'place' => $count['place'] ?? 0],
            'created_at' => $r['created_at'], 'updated_at' => $r['updated_at']];
        if ($geom) { $item['geometry'] = $r['geometry_json'] !== '' ? json_decode((string) $r['geometry_json'], true) : null; }
        $out[] = $item;
    }
    return ['items' => $out, 'attribution' => CADASTRE_ATTRIBUTION];
}

/** id → « Prénom NOM » */
function cadastre_person_names(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $s = $pdo->query('SELECT id, first_name, last_name, gender, kind FROM persons WHERE id IN (' . implode(',', $chunk) . ')');
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $p) { $out[(int) $p['id']] = trim(trim((string) $p['first_name']) . ' ' . mb_strtoupper(trim((string) $p['last_name']))) ?: 'Sans nom'; }
    }
    return $out;
}

/** id → titre, pour une table qui a peut-être disparu (ancienne base) */
function cadastre_titles(PDO $pdo, string $table, string $col, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) { return []; }
    try {
        $out = [];
        foreach ($pdo->query("SELECT id, {$col} AS t FROM {$table} WHERE id IN (" . implode(',', $ids) . ')')->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['id']] = (string) $r['t']; }
        return $out;
    } catch (Throwable $_) { return []; }
}

/** La fiche complète : la parcelle, son contour, ses liens (avec leurs noms d'aujourd'hui), les archives du département */
function cadastre_get(PDO $pdo, int $id): array
{
    if (!cadastre_ready($pdo)) { throw new RuntimeException('Parcelle introuvable.'); }
    $s = $pdo->prepare('SELECT * FROM cadastre_parcels WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r) { throw new RuntimeException('Parcelle introuvable (supprimée ?).'); }
    $l = $pdo->prepare('SELECT kind, target_id, txt, role, is_primary, date_from, date_to, note FROM cadastre_parcel_links WHERE parcel_id=? ORDER BY sort_order, id'); $l->execute([$id]);
    $links = $l->fetchAll(PDO::FETCH_ASSOC);
    $by = []; foreach ($links as $x) { $by[$x['kind']][] = (int) $x['target_id']; }
    $names = cadastre_person_names($pdo, $by['person'] ?? []);
    $houses = cadastre_titles($pdo, 'houses', 'name', $by['house'] ?? []);
    $places = cadastre_titles($pdo, 'places', 'name', $by['place'] ?? []);
    $sources = cadastre_titles($pdo, 'sources', 'title', $by['source'] ?? []);
    $oldmaps = []; $media = []; $events = [];
    if (!empty($by['oldmap'])) { try { foreach ($pdo->query('SELECT id, title, year_text FROM old_maps WHERE id IN (' . implode(',', array_map('intval', $by['oldmap'])) . ')')->fetchAll(PDO::FETCH_ASSOC) as $o) { $oldmaps[(int) $o['id']] = trim($o['title'] . ($o['year_text'] !== '' ? ' (' . $o['year_text'] . ')' : '')); } } catch (Throwable $_) {} }
    if (!empty($by['media'])) { foreach ($pdo->query('SELECT id, title, filename, thumbnail, media_type FROM media WHERE id IN (' . implode(',', array_map('intval', $by['media'])) . ')')->fetchAll(PDO::FETCH_ASSOC) as $m) { $media[(int) $m['id']] = $m; } }
    if (!empty($by['event'])) {
        foreach ($pdo->query('SELECT e.id, e.date_text, e.person_id, COALESCE(NULLIF(e.title, \'\'), t.label, \'Événement\') AS label, pl.name AS place FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.id IN (' . implode(',', array_map('intval', $by['event'])) . ')')->fetchAll(PDO::FETCH_ASSOC) as $e) { $events[(int) $e['id']] = $e; }
    }
    $evPeople = cadastre_person_names($pdo, array_column($events, 'person_id'));
    $outLinks = [];
    foreach ($links as $x) {
        $tid = (int) $x['target_id'];
        $o = ['kind' => $x['kind'], 'id' => $tid, 'role' => $x['role'], 'primary' => (int) $x['is_primary'] === 1, 'from' => $x['date_from'], 'to' => $x['date_to'], 'note' => $x['note']];
        switch ($x['kind']) {
            case 'person': $o['title'] = $tid ? ($names[$tid] ?? 'Fiche supprimée') : $x['txt']; if (!$tid) { $o['txt'] = $x['txt']; } $o['gone'] = $tid && !isset($names[$tid]); break;
            case 'house': $o['title'] = $houses[$tid] ?? 'Maison supprimée'; $o['gone'] = !isset($houses[$tid]); break;
            case 'place': $o['title'] = $places[$tid] ?? 'Lieu supprimé'; $o['gone'] = !isset($places[$tid]); break;
            case 'source': $o['title'] = $sources[$tid] ?? 'Source supprimée'; $o['gone'] = !isset($sources[$tid]); break;
            case 'oldmap': $o['title'] = $oldmaps[$tid] ?? 'Carte ancienne supprimée'; $o['gone'] = !isset($oldmaps[$tid]); break;
            case 'media': $m = $media[$tid] ?? null; $o['title'] = $m ? (trim((string) $m['title']) ?: (string) $m['filename']) : 'Média supprimé'; $o['filename'] = $m['filename'] ?? ''; $o['thumbnail'] = $m['thumbnail'] ?? ''; $o['media_type'] = $m['media_type'] ?? ''; $o['gone'] = !$m; break;
            case 'event': $e = $events[$tid] ?? null; $o['title'] = $e ? trim($e['label'] . ($e['date_text'] ? ' · ' . $e['date_text'] : '') . ($e['person_id'] && isset($evPeople[(int) $e['person_id']]) ? ' · ' . $evPeople[(int) $e['person_id']] : '')) : 'Événement supprimé'; $o['person_id'] = (int) ($e['person_id'] ?? 0); $o['gone'] = !$e; break;
        }
        $outLinks[] = $o;
    }
    $p = ['id' => (int) $r['id'], 'title' => cadastre_title($r), 'insee' => $r['insee'], 'commune_place_id' => (int) $r['commune_place_id'], 'commune' => $r['commune_name'],
        'prefixe' => $r['prefixe'], 'section' => $r['section'], 'numero' => $r['numero'], 'idu' => $r['idu'], 'lieu_dit' => $r['lieu_dit'],
        'surface_m2' => $r['surface_m2'] === null ? null : (int) $r['surface_m2'], 'nature' => $r['nature'], 'address' => $r['address'], 'old_ref' => $r['old_ref'],
        'geometry' => $r['geometry_json'] !== '' ? json_decode((string) $r['geometry_json'], true) : null, 'lat' => $r['lat'] === null ? null : (float) $r['lat'], 'lon' => $r['lon'] === null ? null : (float) $r['lon'],
        'source' => $r['source'], 'notes' => $r['notes'], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at']];
    return ['parcel' => $p, 'links' => $outLinks, 'archives' => cadastre_archives($p['insee']), 'attribution' => CADASTRE_ATTRIBUTION];
}

/** Les archives départementales de la commune (liste de l'app, sans garantie) et une recherche sur FranceArchives */
function cadastre_archives(string $insee): ?array
{
    if ($insee === '') { return null; }
    $dept = cadastre_dept($insee);
    $row = null;
    if (function_exists('departmental_archives_seed')) {
        foreach (departmental_archives_seed() as $a) { if ((string) $a['code'] === $dept) { $row = $a; break; } }
    }
    return ['dept' => $dept, 'service' => $row['service'] ?? ('Archives départementales (' . $dept . ')'), 'url' => $row['search_url'] ?? '', 'digitized' => $row['digitized'] ?? '', 'note' => $row['note'] ?? ''];
}

/** Les parcelles reliées à une personne, une maison ou un lieu (pour les blocs des fiches) ; pour un lieu, aussi celles de la commune */
function cadastre_for(PDO $pdo, string $kind, int $id, string $insee = ''): array
{
    if (!cadastre_ready($pdo) || !in_array($kind, ['person', 'house', 'place'], true) || ($id <= 0 && $insee === '')) { return []; }
    $sql = 'SELECT DISTINCT p.id, p.insee, p.commune_name, p.prefixe, p.section, p.numero, p.lieu_dit, p.surface_m2, p.nature, p.address, p.old_ref, p.lat, p.lon, p.updated_at FROM cadastre_parcels p LEFT JOIN cadastre_parcel_links l ON l.parcel_id=p.id WHERE (l.kind=? AND l.target_id=?)';
    $params = [$kind, $id];
    if ($kind === 'place' && $insee === '' && $id > 0) { try { $insee = cadastre_place_info($pdo, $id)['insee']; } catch (Throwable $_) {} } // un lieu sans code : la commune de même nom
    if ($kind === 'place') { $sql .= ' OR p.commune_place_id=?'; $params[] = $id; if ($insee !== '') { $sql .= ' OR p.insee=?'; $params[] = $insee; } }
    $s = $pdo->prepare($sql . ' ORDER BY p.commune_name, p.section, p.numero LIMIT 500'); $s->execute($params);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) { return []; }
    $ids = array_map(static fn($r) => (int) $r['id'], $rows);
    $l = $pdo->prepare('SELECT parcel_id, kind, target_id, txt, role, is_primary, date_from, date_to FROM cadastre_parcel_links WHERE parcel_id IN (' . implode(',', $ids) . ") AND kind IN ('person','house') ORDER BY sort_order, id"); $l->execute();
    $links = $l->fetchAll(PDO::FETCH_ASSOC);
    $names = cadastre_person_names($pdo, array_map(static fn($x) => $x['kind'] === 'person' ? (int) $x['target_id'] : 0, $links));
    $houses = cadastre_titles($pdo, 'houses', 'name', array_map(static fn($x) => $x['kind'] === 'house' ? (int) $x['target_id'] : 0, $links));
    $by = []; foreach ($links as $x) { $by[(int) $x['parcel_id']][] = $x; }
    return array_map(static function ($r) use ($by, $names, $houses, $kind, $id) {
        $mine = null; $people = []; $hs = [];
        foreach ($by[(int) $r['id']] ?? [] as $x) {
            if ($x['kind'] === 'person') { $people[] = ['id' => (int) $x['target_id'], 'name' => $x['target_id'] ? ($names[(int) $x['target_id']] ?? 'Fiche supprimée') : $x['txt'], 'role' => $x['role'], 'from' => $x['date_from'], 'to' => $x['date_to']]; }
            if ($x['kind'] === 'house') { $hs[] = ['id' => (int) $x['target_id'], 'name' => $houses[(int) $x['target_id']] ?? 'Maison']; }
            if ($x['kind'] === $kind && (int) $x['target_id'] === $id && $mine === null) { $mine = ['role' => $x['role'], 'primary' => (int) $x['is_primary'] === 1, 'from' => $x['date_from'], 'to' => $x['date_to']]; }
        }
        return ['id' => (int) $r['id'], 'title' => cadastre_title($r), 'commune' => $r['commune_name'], 'insee' => $r['insee'], 'lieu_dit' => $r['lieu_dit'], 'surface_m2' => $r['surface_m2'] === null ? null : (int) $r['surface_m2'],
            'nature' => $r['nature'], 'address' => $r['address'], 'old_ref' => $r['old_ref'], 'lat' => $r['lat'] === null ? null : (float) $r['lat'], 'lon' => $r['lon'] === null ? null : (float) $r['lon'],
            'updated_at' => $r['updated_at'], 'mine' => $mine, 'people' => $people, 'houses' => $hs];
    }, $rows);
}

/** Pour la fiche d'une personne (lib/heritage.php) */
function cadastre_for_person(PDO $pdo, int $personId): array
{
    return cadastre_for($pdo, 'person', $personId);
}

/* ─────────────── Enregistrer, supprimer, remettre ─────────────── */

/** Les liens envoyés par la page, vérifiés un par un (la sorte, la fiche qui existe, des textes courts) */
function cadastre_clean_links(PDO $pdo, mixed $links): array
{
    if (!is_array($links)) { return []; }
    if (count($links) > CADASTRE_LINKS_MAX) { throw new RuntimeException('Trop de liens sur une seule parcelle (' . CADASTRE_LINKS_MAX . ' au plus).'); }
    $tables = ['person' => 'persons', 'house' => 'houses', 'place' => 'places', 'event' => 'events', 'media' => 'media', 'source' => 'sources', 'oldmap' => 'old_maps'];
    $exists = [];
    $out = []; $seen = [];
    foreach (array_values($links) as $i => $x) {
        if (!is_array($x)) { continue; }
        $kind = (string) ($x['kind'] ?? '');
        if (!in_array($kind, CADASTRE_LINK_KINDS, true)) { throw new RuntimeException('Lien de sorte inconnue.'); }
        $tid = safe_int($x['id'] ?? 0);
        $txt = $kind === 'person' && $tid <= 0 ? cadastre_text($x['txt'] ?? '', 200) : '';
        if ($tid <= 0 && $txt === '') { continue; }
        if ($tid > 0) {
            $key = $kind . ':' . $tid;
            if (!array_key_exists($key, $exists)) {
                try { $s = $pdo->prepare('SELECT 1 FROM ' . $tables[$kind] . ' WHERE id=?'); $s->execute([$tid]); $exists[$key] = (bool) $s->fetchColumn(); } catch (Throwable $_) { $exists[$key] = false; }
            }
            if (!$exists[$key]) { continue; } // une fiche supprimée entre-temps : le lien part
            $dup = $key . '|' . cadastre_text($x['role'] ?? '', 80);
            if (isset($seen[$dup])) { continue; }
            $seen[$dup] = true;
        }
        $out[] = ['kind' => $kind, 'target_id' => $tid > 0 ? $tid : null, 'txt' => $txt, 'role' => cadastre_text($x['role'] ?? '', 80), 'is_primary' => !empty($x['primary']) ? 1 : 0,
            'date_from' => cadastre_text($x['from'] ?? '', 60), 'date_to' => cadastre_text($x['to'] ?? '', 60), 'note' => cadastre_text($x['note'] ?? '', 500), 'sort_order' => $i];
    }
    return $out;
}

function save_cadastre_parcel(PDO $pdo, array $data): array
{
    cadastre_schema($pdo); // une ancienne base sans la migration (copie ouverte à part)
    $id = safe_int($data['id'] ?? 0);
    $insee = cadastre_insee($data['insee'] ?? '');
    $section = cadastre_section($data['section'] ?? '');
    $numero = cadastre_numero($data['numero'] ?? '');
    $prefixe = cadastre_prefixe($data['prefixe'] ?? '');
    if (safe_text($data['section'] ?? '') !== '' && $section === '') { throw new RuntimeException('La section s’écrit avec 1 ou 2 lettres ou chiffres (ex. « AB », « B », « 0A »).'); }
    if (safe_text($data['numero'] ?? '') !== '' && $numero === '') { throw new RuntimeException('Le numéro de parcelle est un nombre de 1 à 9999.'); }
    if (safe_text($data['insee'] ?? '') !== '' && $insee === '') { throw new RuntimeException('Code de commune (INSEE) inconnu : 5 chiffres, ex. 19272.'); }
    $lieuDit = cadastre_text($data['lieu_dit'] ?? '', 200);
    if ($section === '' && $numero === '' && $lieuDit === '' && trim(safe_text($data['old_ref'] ?? '')) === '') { throw new RuntimeException('Donne au moins la section et le numéro de la parcelle (ou un lieu-dit).'); }
    $placeId = safe_int($data['commune_place_id'] ?? 0);
    $pl = null;
    if ($placeId > 0) { try { $pl = cadastre_place_info($pdo, $placeId); } catch (Throwable $_) { $placeId = 0; } if ($pl && $insee === '') { $insee = $pl['insee']; } }
    $commune = cadastre_text($data['commune_name'] ?? '', 200);
    if ($commune === '' && $placeId > 0) { $commune = (string) ($pl['name'] ?? ''); }
    $surface = $data['surface_m2'] ?? null;
    $surface = $surface === null || $surface === '' ? null : (is_numeric($surface) ? max(0, min(1000000000, (int) round((float) $surface))) : throw new RuntimeException('La surface est un nombre de mètres carrés.'));
    [$geom, $lat, $lon] = cadastre_clean_geometry($data['geometry'] ?? null);
    if ($lat === null && is_numeric($data['lat'] ?? null) && is_numeric($data['lon'] ?? null) && abs((float) $data['lat']) <= 90 && abs((float) $data['lon']) <= 180) { $lat = round((float) $data['lat'], 7); $lon = round((float) $data['lon'], 7); }
    $source = in_array($data['source'] ?? '', ['api', 'manual', 'map'], true) ? $data['source'] : 'manual';
    $idu = cadastre_idu($insee, $prefixe, $section, $numero);
    if ($idu !== '') {
        $d = $pdo->prepare("SELECT id FROM cadastre_parcels WHERE idu=? AND id<>?"); $d->execute([$idu, $id]);
        if ($other = (int) $d->fetchColumn()) { throw new RuntimeException('Cette parcelle est déjà dans ta liste (fiche n° ' . $other . ') : ouvre-la plutôt que d’en créer une deuxième.'); }
    }
    $links = cadastre_clean_links($pdo, $data['links'] ?? []);
    $row = [$insee, $placeId ?: null, $commune, $prefixe, $section, $numero, $idu, $lieuDit, $surface, cadastre_text($data['nature'] ?? '', 120), cadastre_text($data['address'] ?? '', 300),
        cadastre_text($data['old_ref'] ?? '', 120), $geom ? json_encode($geom, JSON_UNESCAPED_UNICODE) : '', $lat, $lon, $source, cadastre_text($data['notes'] ?? '', 20000)];
    if ($id > 0) {
        $e = $pdo->prepare('SELECT 1 FROM cadastre_parcels WHERE id=?'); $e->execute([$id]);
        if (!$e->fetchColumn()) { throw new RuntimeException('Parcelle introuvable (supprimée ?).'); }
        $pdo->prepare('UPDATE cadastre_parcels SET insee=?, commune_place_id=?, commune_name=?, prefixe=?, section=?, numero=?, idu=?, lieu_dit=?, surface_m2=?, nature=?, address=?, old_ref=?, geometry_json=?, lat=?, lon=?, source=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([...$row, $id]);
    } else {
        $pdo->prepare('INSERT INTO cadastre_parcels(insee, commune_place_id, commune_name, prefixe, section, numero, idu, lieu_dit, surface_m2, nature, address, old_ref, geometry_json, lat, lon, source, notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($row);
        $id = (int) $pdo->lastInsertId();
    }
    cadastre_write_links($pdo, $id, $links);
    $title = cadastre_title(['section' => $section, 'numero' => $numero, 'lieu_dit' => $lieuDit]);
    log_change($pdo, 'cadastre_parcel', $id, empty($data['id']) ? 'create' : 'update', 'Parcelle ' . $title . ($commune !== '' ? ' (' . $commune . ')' : '') . ' enregistrée');
    return ['id' => $id, 'title' => $title];
}

function cadastre_write_links(PDO $pdo, int $id, array $links): void
{
    $pdo->prepare('DELETE FROM cadastre_parcel_links WHERE parcel_id=?')->execute([$id]);
    $ins = $pdo->prepare('INSERT INTO cadastre_parcel_links(parcel_id, kind, target_id, txt, role, is_primary, date_from, date_to, note, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)');
    foreach ($links as $l) { $ins->execute([$id, $l['kind'], $l['target_id'], $l['txt'], $l['role'], $l['is_primary'], $l['date_from'], $l['date_to'], $l['note'], $l['sort_order']]); }
}

/** Supprime et rend tout ce qu'il faut pour « ↶ Annuler » (restore_cadastre_parcel) */
function delete_cadastre_parcel(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    if (!cadastre_ready($pdo)) { throw new RuntimeException('Parcelle introuvable.'); }
    $s = $pdo->prepare('SELECT * FROM cadastre_parcels WHERE id=?'); $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Parcelle introuvable (déjà supprimée ?).'); }
    $l = $pdo->prepare('SELECT kind, target_id, txt, role, is_primary, date_from, date_to, note FROM cadastre_parcel_links WHERE parcel_id=? ORDER BY sort_order, id'); $l->execute([$id]);
    $links = array_map(static fn($x) => ['kind' => $x['kind'], 'id' => (int) $x['target_id'], 'txt' => $x['txt'], 'role' => $x['role'], 'primary' => (int) $x['is_primary'] === 1, 'from' => $x['date_from'], 'to' => $x['date_to'], 'note' => $x['note']], $l->fetchAll(PDO::FETCH_ASSOC));
    $pdo->prepare('DELETE FROM cadastre_parcel_links WHERE parcel_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM cadastre_parcels WHERE id=?')->execute([$id]);
    log_change($pdo, 'cadastre_parcel', $id, 'delete', 'Parcelle ' . cadastre_title($row) . ' supprimée', $row);
    $parcel = $row; $parcel['geometry'] = $row['geometry_json'] !== '' ? json_decode((string) $row['geometry_json'], true) : null; unset($parcel['geometry_json']);
    return ['parcel' => $parcel, 'links' => $links];
}

/** « ↶ Annuler » : la parcelle revient avec le même numéro (s'il est libre), relue comme un enregistrement neuf */
function restore_cadastre_parcel(PDO $pdo, array $data): array
{
    cadastre_schema($pdo);
    $p = is_array($data['parcel'] ?? null) ? $data['parcel'] : throw new RuntimeException('Rien à remettre.');
    $id = safe_int($p['id'] ?? 0);
    $taken = false;
    if ($id > 0) { $s = $pdo->prepare('SELECT 1 FROM cadastre_parcels WHERE id=?'); $s->execute([$id]); $taken = (bool) $s->fetchColumn(); }
    if ($id > 0 && !$taken) { $pdo->prepare("INSERT INTO cadastre_parcels(id, section, lieu_dit) VALUES(?, '', 'x')")->execute([$id]); }
    $res = save_cadastre_parcel($pdo, ['id' => $id > 0 && !$taken ? $id : 0, 'links' => $data['links'] ?? []] + array_intersect_key($p, array_flip(['insee', 'commune_place_id', 'commune_name', 'prefixe', 'section', 'numero', 'lieu_dit', 'surface_m2', 'nature', 'address', 'old_ref', 'geometry', 'lat', 'lon', 'source', 'notes'])));
    return $res;
}

/** Relier (ou retirer) une seule chose, tout de suite : « 🔗 Relier une parcelle » d'une maison, d'un lieu, d'une carte ancienne */
function cadastre_link(PDO $pdo, array $data): array
{
    cadastre_schema($pdo);
    $pid = safe_int($data['parcel_id'] ?? 0);
    $s = $pdo->prepare('SELECT 1 FROM cadastre_parcels WHERE id=?'); $s->execute([$pid]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Parcelle introuvable (supprimée ?).'); }
    $kind = (string) ($data['kind'] ?? '');
    $tid = safe_int($data['id'] ?? 0);
    if (empty($data['on'])) {
        $pdo->prepare('DELETE FROM cadastre_parcel_links WHERE parcel_id=? AND kind=? AND target_id=?')->execute([$pid, $kind, $tid]);
        return ['ok' => true, 'removed' => true];
    }
    $clean = cadastre_clean_links($pdo, [['kind' => $kind, 'id' => $tid, 'role' => $data['role'] ?? '', 'from' => $data['from'] ?? '', 'to' => $data['to'] ?? '']]);
    if (!$clean) { throw new RuntimeException('Cette fiche n’existe pas (supprimée ?).'); }
    $e = $pdo->prepare('SELECT 1 FROM cadastre_parcel_links WHERE parcel_id=? AND kind=? AND target_id=?'); $e->execute([$pid, $kind, $tid]);
    if ($e->fetchColumn()) { return ['ok' => true, 'already' => true]; }
    $n = $pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cadastre_parcel_links WHERE parcel_id=?'); $n->execute([$pid]);
    $l = $clean[0];
    $pdo->prepare('INSERT INTO cadastre_parcel_links(parcel_id, kind, target_id, txt, role, is_primary, date_from, date_to, note, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)')
        ->execute([$pid, $l['kind'], $l['target_id'], '', $l['role'], 0, $l['date_from'], $l['date_to'], '', (int) $n->fetchColumn()]);
    $pdo->prepare('UPDATE cadastre_parcels SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$pid]);
    return ['ok' => true];
}

/** Le code INSEE d'un lieu de la base (pour chercher dans le cadastre) */
function cadastre_place_info(PDO $pdo, int $placeId): array
{
    $s = $pdo->prepare('SELECT id, name, county, admin4_code, country, latitude, longitude FROM places WHERE id=?'); $s->execute([$placeId]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Lieu introuvable.'); }
    $insee = cadastre_insee($p['admin4_code'] ?? '');
    $lat = is_numeric($p['latitude']) ? (float) $p['latitude'] : null; $lon = is_numeric($p['longitude']) ? (float) $p['longitude'] : null;
    // un lieu tapé à la main (« Tulle », Corrèze, FRANCE) sans code : la commune de même nom (même département d'abord, puis la plus peuplée)
    if ($insee === '' && trim((string) $p['name']) !== '' && (trim((string) $p['country']) === '' || preg_match('/^fran/i', (string) $p['country']))) {
        $f = $pdo->prepare("SELECT admin4_code, latitude, longitude FROM places WHERE admin4_code <> '' AND name = ? COLLATE NOCASE ORDER BY (COALESCE(county,'') = ? COLLATE NOCASE) DESC, COALESCE(population,0) DESC LIMIT 1");
        $f->execute([trim((string) $p['name']), trim((string) $p['county'])]);
        if ($r = $f->fetch(PDO::FETCH_ASSOC)) { $insee = cadastre_insee($r['admin4_code']); if ($lat === null && is_numeric($r['latitude'])) { $lat = (float) $r['latitude']; $lon = (float) $r['longitude']; } }
    }
    return ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'insee' => $insee, 'lat' => $lat, 'lon' => $lon];
}

/* ─────────────── Internet : API Carto (IGN), WFS de la Géoplateforme, adresse, DVF ─────────────── */

function cadastre_cache_dir(): string
{
    $d = DATA_DIR . '/cache/cadastre';
    if (!is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}

/** Au plus CADASTRE_RATE_PER_MIN demandes à Internet par minute (pour ne pas abuser des services publics) */
function cadastre_rate_check(): void
{
    $f = cadastre_cache_dir() . '/rate.json';
    $now = time();
    $fh = @fopen($f, 'c+');
    if (!$fh) { return; }
    flock($fh, LOCK_EX);
    $list = json_decode((string) stream_get_contents($fh), true);
    $list = array_values(array_filter(is_array($list) ? $list : [], static fn($t) => is_int($t) && $t > $now - 60));
    if (count($list) >= CADASTRE_RATE_PER_MIN) { flock($fh, LOCK_UN); fclose($fh); throw new RuntimeException('Beaucoup de demandes au cadastre en une minute : attends un petit moment et réessaie.'); }
    $list[] = $now;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($list)); fflush($fh);
    flock($fh, LOCK_UN); fclose($fh);
}

/**
 * Lit une adresse d'Internet (HTTPS seulement, délais courts, taille bornée), avec un cache de 30 jours.
 * Rend le texte, ou null si la page n'existe pas (404). Lève une erreur claire si le réseau ne répond pas.
 */
function cadastre_http(string $url, int $maxBytes = 8000000, int $timeout = 15): ?string
{
    $fx = getenv('LCNDA_CADASTRE_FIXTURES');
    if (is_string($fx) && $fx !== '' && is_dir($fx)) {
        $index = json_decode((string) @file_get_contents($fx . '/index.json'), true) ?: [];
        foreach ($index as $e) {
            if (is_array($e) && isset($e['match'], $e['file']) && str_contains(urldecode($url), (string) $e['match'])) {
                if (($e['status'] ?? 200) === 404) { return null; }
                if (($e['status'] ?? 200) >= 500) { throw new RuntimeException('Le cadastre en ligne ne répond pas pour l’instant.'); }
                return (string) file_get_contents($fx . '/' . basename((string) $e['file']));
            }
        }
        throw new RuntimeException('Le cadastre en ligne ne répond pas (pas d’Internet ?). Tu peux remplir la parcelle à la main.');
    }
    $cache = cadastre_cache_dir() . '/' . md5($url) . '.json';
    if (is_file($cache) && filemtime($cache) > time() - CADASTRE_CACHE_DAYS * 86400) {
        $c = json_decode((string) file_get_contents($cache), true);
        if (is_array($c) && array_key_exists('body', $c)) { return $c['body']; }
    }
    if (!function_exists('curl_init')) { throw new RuntimeException('Recherche impossible : PHP n’a pas l’extension curl.'); }
    cadastre_rate_check();
    $body = ''; $tooBig = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => $timeout,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'LCNDA (logiciel de genealogie)', CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => ['Accept: application/json, text/csv, */*'],
        CURLOPT_WRITEFUNCTION => static function ($c, $chunk) use (&$body, &$tooBig, $maxBytes) { $body .= $chunk; if (strlen($body) > $maxBytes) { $tooBig = true; return 0; } return strlen($chunk); }]
        + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    $ok = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch);
    unset($ch);
    if ($tooBig) { throw new RuntimeException('La réponse du service est trop grosse : précise la recherche (section et numéro).'); }
    if ($code === 404) { @file_put_contents($cache, json_encode(['body' => null])); return null; }
    if ($ok === false || $code >= 400 || $code === 0) {
        throw new RuntimeException($code >= 400 ? 'Le service du cadastre a refusé la demande (code ' . $code . '). Réessaie plus tard, ou remplis la parcelle à la main.' : 'Le cadastre en ligne ne répond pas' . ($err !== '' ? ' (' . $err . ')' : '') . '. Vérifie la connexion à Internet, ou remplis la parcelle à la main.');
    }
    @file_put_contents($cache, json_encode(['body' => $body, 'at' => date('c')]));
    return $body;
}

/** Une parcelle de l'API Carto, du WFS (Parcellaire Express) ou du cadastre Etalab → la forme de l'app */
function cadastre_normalize_feature(array $f): ?array
{
    $p = is_array($f['properties'] ?? null) ? $f['properties'] : [];
    $idu = (string) ($p['idu'] ?? $p['id'] ?? '');
    $insee = cadastre_insee($p['code_insee'] ?? $p['commune'] ?? (isset($p['code_dep'], $p['code_com']) ? $p['code_dep'] . $p['code_com'] : ''));
    $section = cadastre_section($p['section'] ?? '');
    $numero = cadastre_numero($p['numero'] ?? '');
    $prefixe = cadastre_prefixe($p['com_abs'] ?? $p['prefixe'] ?? '');
    if ((!$insee || !$section || !$numero) && preg_match('/^(\d{5}|2[AB]\d{3})(\d{3})([0-9A-Z]{2})(\d{4})$/', $idu, $m)) { [$insee, $prefixe, $section, $numero] = [$insee ?: $m[1], $m[2], $section ?: $m[3], $numero ?: $m[4]]; }
    if ($section === '' || $numero === '') { return null; }
    [$geom, $lat, $lon] = cadastre_clean_geometry($f['geometry'] ?? null);
    $surface = $p['contenance'] ?? null;
    return ['idu' => cadastre_idu($insee, $prefixe, $section, $numero), 'insee' => $insee, 'prefixe' => $prefixe, 'section' => $section, 'numero' => $numero,
        'title' => cadastre_title(['section' => $section, 'numero' => $numero]), 'commune' => (string) ($p['nom_com'] ?? ''), 'feuille' => (string) ($p['feuille'] ?? ''),
        'surface_m2' => is_numeric($surface) ? (int) $surface : null, 'geometry' => $geom, 'lat' => $lat, 'lon' => $lon];
}

/** Lit un GeoJSON (FeatureCollection) ; null si la réponse n'en est pas un */
function cadastre_features(?string $body): ?array
{
    if ($body === null) { return []; }
    $j = json_decode($body, true);
    if (!is_array($j) || !is_array($j['features'] ?? null)) { return null; }
    return $j['features'];
}

/**
 * GET cadastre_lookup : mode=ref (insee, section, numero facultatif, prefixe) · mode=point (lat, lon) · mode=sections (insee).
 * Rend {parcels: [...], sections?: [...], source, attribution}. Chaque parcelle dit si elle est déjà dans ta liste (existing_id).
 */
function cadastre_lookup(PDO $pdo, array $get): array
{
    $mode = (string) ($get['mode'] ?? 'ref');
    $source = 'apicarto';
    if ($mode === 'sections') {
        $insee = cadastre_insee($get['insee'] ?? '');
        if ($insee === '') { throw new RuntimeException('Choisis d’abord une commune de France (avec son code INSEE).'); }
        $feats = null;
        try { $feats = cadastre_features(cadastre_http(CADASTRE_APICARTO . 'feuille?' . http_build_query(['code_insee' => $insee, '_limit' => 1000]))); } catch (Throwable $e) { $feats = null; $err = $e; }
        if ($feats === null) { $source = 'wfs'; $feats = cadastre_features(cadastre_http(cadastre_wfs_url('feuille', "code_insee='{$insee}'", 1000))); }
        if ($feats === null) { throw $err ?? new RuntimeException('Réponse du cadastre illisible.'); }
        $secs = [];
        foreach ($feats as $f) { $s = cadastre_section($f['properties']['section'] ?? ''); if ($s !== '') { $secs[$s] = true; } }
        $secs = array_keys($secs); sort($secs, SORT_NATURAL);
        return ['sections' => $secs, 'parcels' => [], 'source' => $source, 'attribution' => CADASTRE_ATTRIBUTION];
    }
    if ($mode === 'point') {
        $lat = (float) ($get['lat'] ?? 0); $lon = (float) ($get['lon'] ?? 0);
        if (!is_numeric($get['lat'] ?? null) || !is_numeric($get['lon'] ?? null) || abs($lat) > 90 || abs($lon) > 180) { throw new RuntimeException('Point de la carte incompris.'); }
        $lat = round($lat, 6); $lon = round($lon, 6);
        $feats = null;
        try { $feats = cadastre_features(cadastre_http(CADASTRE_APICARTO . 'parcelle?' . http_build_query(['geom' => json_encode(['type' => 'Point', 'coordinates' => [$lon, $lat]]), '_limit' => 5]))); } catch (Throwable $e) { $err = $e; }
        if ($feats === null) {
            $source = 'wfs'; $d = 0.00005;
            $feats = cadastre_features(cadastre_http(CADASTRE_WFS . '?' . http_build_query(['SERVICE' => 'WFS', 'VERSION' => '2.0.0', 'REQUEST' => 'GetFeature', 'TYPENAMES' => 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle', 'OUTPUTFORMAT' => 'application/json', 'SRSNAME' => 'CRS:84', 'COUNT' => 20, 'BBOX' => implode(',', [$lon - $d, $lat - $d, $lon + $d, $lat + $d, 'CRS:84'])])));
        }
        if ($feats === null) { throw $err ?? new RuntimeException('Réponse du cadastre illisible.'); }
        $parcels = array_values(array_filter(array_map('cadastre_normalize_feature', $feats)));
        // le clic tombe dans laquelle ? celle-là d'abord
        usort($parcels, static fn($a, $b) => (int) ($b['geometry'] && cadastre_point_in($b['geometry'], $lat, $lon)) <=> (int) ($a['geometry'] && cadastre_point_in($a['geometry'], $lat, $lon)));
        if (count($parcels) > 1 && $parcels[0]['geometry'] && cadastre_point_in($parcels[0]['geometry'], $lat, $lon)) { $parcels = [$parcels[0]]; }
        return ['parcels' => cadastre_mark_existing($pdo, $parcels), 'source' => $source, 'attribution' => CADASTRE_ATTRIBUTION, 'address' => !empty($get['address']) ? cadastre_address($lat, $lon) : null];
    }
    $insee = cadastre_insee($get['insee'] ?? '');
    $section = cadastre_section($get['section'] ?? '');
    $numero = cadastre_numero($get['numero'] ?? '');
    if ($insee === '') { throw new RuntimeException('Choisis d’abord une commune de France (avec son code INSEE).'); }
    if ($section === '') { throw new RuntimeException('Écris la section (1 ou 2 lettres, ex. « AB » ou « B »).'); }
    $q = ['code_insee' => $insee, 'section' => $section] + ($numero !== '' ? ['numero' => $numero] : []) + ['_limit' => $numero !== '' ? 10 : 500];
    if (($pre = safe_text($get['prefixe'] ?? '')) !== '' && cadastre_prefixe($pre) !== '000') { $q['com_abs'] = cadastre_prefixe($pre); }
    $feats = null;
    try { $feats = cadastre_features(cadastre_http(CADASTRE_APICARTO . 'parcelle?' . http_build_query($q))); } catch (Throwable $e) { $err = $e; }
    if ($feats === null) {
        $source = 'wfs';
        $cql = "code_insee='{$insee}' AND section='{$section}'" . ($numero !== '' ? " AND numero='{$numero}'" : ''); // valeurs vérifiées (chiffres et lettres seulement)
        $feats = cadastre_features(cadastre_http(cadastre_wfs_url('parcelle', $cql, $numero !== '' ? 10 : 500)));
    }
    if ($feats === null) { throw $err ?? new RuntimeException('Réponse du cadastre illisible.'); }
    $parcels = array_values(array_filter(array_map('cadastre_normalize_feature', $feats)));
    usort($parcels, static fn($a, $b) => strcmp($a['numero'], $b['numero']));
    if ($numero === '') { $parcels = array_map(static function ($p) { $p['geometry'] = null; return $p; }, $parcels); } // une section entière : les numéros seulement
    return ['parcels' => cadastre_mark_existing($pdo, $parcels), 'source' => $source, 'attribution' => CADASTRE_ATTRIBUTION];
}

function cadastre_wfs_url(string $layer, string $cql, int $count): string
{
    return CADASTRE_WFS . '?' . http_build_query(['SERVICE' => 'WFS', 'VERSION' => '2.0.0', 'REQUEST' => 'GetFeature', 'TYPENAMES' => 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:' . $layer,
        'OUTPUTFORMAT' => 'application/json', 'SRSNAME' => 'CRS:84', 'COUNT' => $count, 'CQL_FILTER' => $cql]);
}

function cadastre_mark_existing(PDO $pdo, array $parcels): array
{
    if (!$parcels || !cadastre_ready($pdo)) { return $parcels; }
    $s = $pdo->prepare('SELECT id FROM cadastre_parcels WHERE idu=?');
    foreach ($parcels as &$p) { $s->execute([$p['idu']]); $p['existing_id'] = (int) $s->fetchColumn() ?: null; }
    unset($p);
    return $parcels;
}

/** L'adresse d'aujourd'hui la plus proche d'un point (géocodage inverse de la Géoplateforme, BAN) ; '' si rien ou pas de réseau */
function cadastre_address(float $lat, float $lon): string
{
    try {
        $j = json_decode((string) cadastre_http(CADASTRE_REVERSE . '?' . http_build_query(['lon' => round($lon, 6), 'lat' => round($lat, 6), 'index' => 'address', 'limit' => 1]), 2000000, 10), true);
        return mb_substr((string) ($j['features'][0]['properties']['label'] ?? ''), 0, 300);
    } catch (Throwable $_) { return ''; }
}

/**
 * GET cadastre_dvf (idu) : les ventes de la parcelle depuis 2020 (DVF géolocalisées, Etalab) — date, nature de la vente,
 * prix, nature du terrain (culture), surface, adresse. Aucune personne dans ces fichiers. Fichier de la commune lu une fois par année.
 */
function cadastre_dvf(PDO $pdo, array $get): array
{
    $idu = strtoupper(preg_replace('/\s+/', '', safe_text($get['idu'] ?? '')) ?? '');
    if (!preg_match('/^(\d{5}|2[AB]\d{3})\d{3}[0-9A-Z]{2}\d{4}$/', $idu)) { throw new RuntimeException('Il faut une parcelle avec sa commune, sa section et son numéro.'); }
    $insee = substr($idu, 0, 5); $dept = cadastre_dept($insee);
    $year = (int) date('Y');
    $sales = []; $years = []; $errors = 0;
    for ($y = $year - 1; $y >= max(2014, $year - 7); $y--) {
        try { $csv = cadastre_http(sprintf(CADASTRE_DVF, $y, $dept, $insee), 40000000, 30); }
        catch (Throwable $_) { $errors++; continue; }
        if ($csv === null) { continue; }
        $years[] = $y;
        $lines = preg_split('/\r?\n/', $csv) ?: [];
        $head = str_getcsv((string) array_shift($lines), ',', '"', '');
        $col = array_flip($head);
        if (!isset($col['id_parcelle'])) { continue; }
        foreach ($lines as $line) {
            if ($line === '' || !str_contains($line, $idu)) { continue; }
            $c = str_getcsv($line, ',', '"', '');
            if (($c[$col['id_parcelle']] ?? '') !== $idu) { continue; }
            $g = static fn($k) => isset($col[$k]) ? trim((string) ($c[$col[$k]] ?? '')) : '';
            $key = $g('id_mutation') . '|' . $g('nature_culture') . '|' . $g('type_local');
            $sales[$key] = ['date' => $g('date_mutation'), 'nature_mutation' => $g('nature_mutation'), 'valeur' => is_numeric($g('valeur_fonciere')) ? (float) $g('valeur_fonciere') : null,
                'nature_culture' => $g('nature_culture'), 'type_local' => $g('type_local'), 'surface_terrain' => is_numeric($g('surface_terrain')) ? (int) $g('surface_terrain') : null,
                'surface_bati' => is_numeric($g('surface_reelle_bati')) ? (int) $g('surface_reelle_bati') : null,
                'adresse' => trim(implode(' ', array_filter([$g('adresse_numero') . $g('adresse_suffixe'), $g('adresse_nom_voie')]))) . ($g('code_postal') !== '' ? ', ' . $g('code_postal') . ' ' . $g('nom_commune') : '')];
        }
        if (count($years) >= 6) { break; }
    }
    if (!$years && $errors) { throw new RuntimeException('Les ventes (DVF) n’ont pas pu être lues : pas d’Internet, ou service indisponible.'); }
    $sales = array_values($sales);
    usort($sales, static fn($a, $b) => strcmp($b['date'], $a['date']));
    return ['sales' => $sales, 'years' => $years, 'attribution' => 'Demandes de valeurs foncières (DGFiP), géolocalisées par Etalab — Licence Ouverte 2.0'];
}

/* ─────────────── Menu de choix (sorte « parcel ») ─────────────── */

function picker_parcels(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!picker_table_exists($pdo, 'cadastre_parcels')) { return ['total' => 0, 'items' => []]; }
    picker_register($pdo); // picker_fold() (déjà fait par picker_search ; utile appelée seule)
    $params = [];
    $qq = preg_replace('/\b(section|sect|n°|no|num[eé]ro)\b\.?/iu', ' ', $q) ?? $q;
    $where = picker_text_where(['c.commune_name', 'c.lieu_dit', 'c.address', 'c.old_ref', "(c.section || ' ' || c.numero)", "(ltrim(c.section,'0') || ' ' || ltrim(c.numero,'0'))", 'c.idu'], trim(preg_replace('/\s+/', ' ', $qq) ?? ''), $params);
    [$total, $rows] = picker_page($pdo, 'SELECT c.id, c.commune_name, c.section, c.numero, c.lieu_dit, c.surface_m2, c.address', "FROM cadastre_parcels c WHERE {$where}", 'c.commune_name COLLATE NOCASE, c.section, c.numero', $params, $offset, $limit);
    return ['total' => $total, 'items' => array_map(static function ($r) {
        $surf = $r['surface_m2'] !== null ? number_format((int) $r['surface_m2'], 0, ',', ' ') . ' m²' : '';
        return ['kind' => 'parcel', 'id' => (int) $r['id'], 'title' => cadastre_title($r) . ($r['commune_name'] !== '' ? ' · ' . $r['commune_name'] : ''),
            'meta' => implode(' · ', array_filter([$r['lieu_dit'], $r['address'], $surf])), 'badge' => $surf, 'badge_style' => '', 'group' => 'parcel', 'icon' => '▦', 'short' => (string) $r['commune_name']];
    }, $rows)];
}
