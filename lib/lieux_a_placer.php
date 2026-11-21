<?php
declare(strict_types=1);

/**
 * LCNDA — 📍 Les lieux encore à placer (maquette docs/design/cartes-nouvelles.html, partie 6 ; écran : assets/js/heritage-lieux-a-placer.js).
 * Les lieux de la base sans position, regroupés par commune probable grâce au référentiel des communes livré avec l'app
 * (table commune_contours : code INSEE et centre ; villes et lieux-dits du monde : lib/reference.php), sans Internet.
 * Rien n'est placé sans un clic ; aucun service en ligne n'est appelé sans un choix explicite, lieu par lieu.
 *
 *   GET  lieux_a_placer (&spelling=norm|fuzzy|exact &lieudit=spot|center|skip &several=nearest|ask &ignored=1 &ids=1,2)
 *        → {items: [{id, name, county, country, events, status, why, props: [...], rest}], counts, total_events}
 *   POST lieux_place  {items: [{id, lat, lon, insee?, dept?, approx?}], what: all|pos} → {before: [...]} (pour ↶ Annuler)
 *   POST lieux_undo   {items: before} → remet les anciennes valeurs (un seul message ↶ Annuler pour un lieu comme pour un lot)
 *   POST lieux_online {q} → 🌐 une proposition de plus du service de recherche d'adresses de l'IGN (Géoplateforme) :
 *        seul le nom du lieu est envoyé (aucun nom de personne, aucune date). Adresse d'essai : LCNDA_LAP_GEOCODE (file://…).
 * Les écritures passent par handle_write (journal, transaction, mode consultation et verrou respectés). Rien de nouveau en base :
 * « position approchée » est écrit dans la description du lieu (places n'a pas de colonne de précision).
 */

require_once __DIR__ . '/cartes_plus.php';

const LAP_MAX = 600;
const LAP_GEOCODE = 'https://data.geopf.fr/geocodage/search';

/** « St-Martin », « SAINT MARTIN », « Saint-Martin » → « saint martin » */
function lap_key(string $s): string
{
    $s = strtolower(ascii_fold(trim($s)));
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s);
    $s = preg_replace('/\b(st)\b/', 'saint', (string) $s);
    $s = preg_replace('/\b(ste)\b/', 'sainte', (string) $s);
    return trim((string) preg_replace('/\s+/', ' ', (string) $s));
}

/** le nom exact (sans rapprochement) : seulement les majuscules et les espaces */
function lap_exact(string $s): string { return trim((string) preg_replace('/\s+/', ' ', mb_strtolower(trim($s)))); }

/** un nom de lieu tapé → [nom, indice de département (code), autres morceaux] : « Naves (19) », « NAVES, Corrèze », « Le Mas Bas, Naves » */
function lap_parse(string $name, array $pl): array
{
    $dep = '';
    $codes = world_dept_codes();
    if (preg_match('/\((\d{2}|2[AB]|97\d)\)/i', $name, $m)) { $dep = strtoupper($m[1]); }
    elseif (preg_match('/\(([^)]+)\)/u', $name, $m) && isset($codes[world_fold($m[1])])) { $dep = $codes[world_fold($m[1])]; } // « Tulle (Corrèze) »
    $clean = trim((string) preg_replace('/\([^)]*\)/', ' ', $name));
    $parts = array_values(array_filter(array_map('trim', preg_split('/\s*[,;]\s*/u', $clean) ?: []), static fn($x) => $x !== ''));
    $rest = [];
    foreach (array_slice($parts, 1) as $p) {
        $f = world_fold($p);
        if (isset($codes[$f])) { $dep = $dep ?: $codes[$f]; continue; }
        if (preg_match('/^(\d{2}|2[AB]|97\d)$/i', $p)) { $dep = $dep ?: strtoupper($p); continue; }
        if (in_array($f, ['france', 'fr'], true)) { continue; }
        $rest[] = $p;
    }
    if ($dep === '') { $dep = (string) ($pl['admin2_code'] ?? ''); }
    if ($dep === '' && trim((string) ($pl['county'] ?? '')) !== '') { $dep = $codes[world_fold((string) $pl['county'])] ?? ''; }
    return [(string) ($parts[0] ?? trim($name)), $dep, $rest];
}

/** les communes du référentiel, rangées par nom rapproché (une seule lecture par demande) */
function lap_communes(PDO $pdo): array
{
    static $memo = null;
    if ($memo !== null) { return $memo; }
    $by = []; $exact = [];
    try {
        foreach ($pdo->query('SELECT insee_code, name, centroid_lat, centroid_lon FROM commune_contours WHERE centroid_lat IS NOT NULL') as $c) {
            $row = ['insee' => (string) $c['insee_code'], 'name' => (string) $c['name'], 'lat' => (float) $c['centroid_lat'], 'lon' => (float) $c['centroid_lon'], 'dept' => lap_dept_of((string) $c['insee_code'])];
            $by[lap_key((string) $c['name'])][] = $row;
            $exact[lap_exact((string) $c['name'])][] = $row;
        }
    } catch (Throwable $_) {}
    return $memo = ['by' => $by, 'exact' => $exact];
}

function lap_dept_of(string $insee): string
{
    return preg_match('/^(97\d|2[AB]|\d{2})/', $insee, $m) ? $m[1] : '';
}

/** distance de Levenshtein entre deux noms rapprochés (petits noms seulement) */
function lap_close(string $a, string $b): bool
{
    if ($a === '' || $b === '' || abs(strlen($a) - strlen($b)) > 2 || $a[0] !== $b[0]) { return false; }
    return levenshtein($a, $b) <= max(1, min(2, intdiv(strlen($a), 6)));
}

/** pour chaque lieu sans position : le milieu des AUTRES lieux placés des événements des mêmes personnes (« distance au reste ») */
function lap_rest(PDO $pdo, array $ids): array
{
    if (!$ids) { return []; }
    $out = [];
    foreach (array_chunk($ids, 300) as $chunk) {
        $in = implode(',', array_map('intval', $chunk));
        $sql = "WITH who AS (
                SELECT e.place_id AS pl, e.person_id AS pid FROM events e WHERE e.place_id IN ($in) AND e.person_id IS NOT NULL
                UNION SELECT e.place_id, f.partner1_id FROM events e JOIN families f ON f.id=e.family_id WHERE e.place_id IN ($in) AND f.partner1_id IS NOT NULL
                UNION SELECT e.place_id, f.partner2_id FROM events e JOIN families f ON f.id=e.family_id WHERE e.place_id IN ($in) AND f.partner2_id IS NOT NULL)
            SELECT w.pl, p.latitude AS lat, p.longitude AS lon FROM who w
              JOIN events e2 ON e2.person_id=w.pid JOIN places p ON p.id=e2.place_id
              WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND NOT (p.latitude=0 AND p.longitude=0) LIMIT 60000";
        $acc = [];
        foreach ($pdo->query($sql) as $r) { $acc[(int) $r['pl']][0][] = (float) $r['lat']; $acc[(int) $r['pl']][1][] = (float) $r['lon']; }
        foreach ($acc as $pl => [$la, $lo]) { sort($la); sort($lo); $out[$pl] = [$la[intdiv(count($la), 2)], $lo[intdiv(count($lo), 2)]]; }
    }
    return $out;
}

/** une proposition : [nom affiché, lat, lon, code INSEE, n° de département, approché ?, sorte] (+ distance au reste) */
function lap_prop(array $c, string $kind, bool $approx, ?array $rest, string $label = ''): array
{
    $km = $rest ? round(h_distance_km($rest[0], $rest[1], (float) $c['lat'], (float) $c['lon'])) : null;
    return ['label' => $label !== '' ? $label : ($c['name'] . ($c['dept'] !== '' ? ' (' . $c['dept'] . ')' : '')), 'lat' => round((float) $c['lat'], 5), 'lon' => round((float) $c['lon'], 5),
        'insee' => (string) ($c['insee'] ?? ''), 'dept' => (string) ($c['dept'] ?? ''), 'approx' => $approx, 'kind' => $kind, 'km' => $km];
}

/** les lieux à placer, chacun avec ce que l'app propose (rien n'est placé ici) */
function lap_list(PDO $pdo, array $q): array
{
    $spelling = in_array($q['spelling'] ?? '', ['fuzzy', 'exact'], true) ? (string) $q['spelling'] : 'norm';
    $lieudit = in_array($q['lieudit'] ?? '', ['center', 'skip'], true) ? (string) $q['lieudit'] : 'spot';
    $several = ($q['several'] ?? '') === 'ask' ? 'ask' : 'nearest';
    $onlyIds = array_values(array_filter(array_map('intval', explode(',', (string) ($q['ids'] ?? ''))))) ;
    $dismissed = [];
    try { foreach ($pdo->query("SELECT issue_key FROM dismissed_issues WHERE issue_key LIKE 'place:%'") as $d) { $dismissed[(int) substr((string) $d['issue_key'], 6)] = true; } } catch (Throwable $_) {}
    $wantIgnored = !empty($q['ignored']);
    $sql = "SELECT pl.id, pl.name, pl.county, pl.state, pl.country, pl.admin2_code, pl.admin4_code, count(e.id) AS n, min(e.year) AS y0, max(e.year) AS y1
        FROM places pl LEFT JOIN events e ON e.place_id=pl.id
        WHERE (pl.latitude IS NULL OR pl.longitude IS NULL OR (pl.latitude=0 AND pl.longitude=0)) AND trim(COALESCE(pl.name,''))<>''" . ($onlyIds ? ' AND pl.id IN (' . implode(',', array_slice($onlyIds, 0, 500)) . ')' : '') . "
        GROUP BY pl.id ORDER BY n DESC, pl.name COLLATE NOCASE LIMIT " . (LAP_MAX * 2);
    $places = [];
    foreach ($pdo->query($sql) as $p) {
        $isIgn = isset($dismissed[(int) $p['id']]);
        if ($isIgn !== $wantIgnored) { continue; }
        $places[] = $p; if (count($places) >= LAP_MAX) { break; }
    }
    $rest = lap_rest($pdo, array_map(static fn($p) => (int) $p['id'], $places));
    $C = lap_communes($pdo);
    $old = function_exists('cp_front_installed') && cp_front_installed() ? cp_front_records()['records'] : [];
    $oldBy = [];
    foreach ($old as $r) { $oldBy[lap_key((string) ($r['n'] ?? ''))][] = $r; } // disparues et anciens noms
    $items = []; $counts = ['sure' => 0, 'probable' => 0, 'several' => 0, 'old' => 0, 'abroad' => 0, 'none' => 0]; $events = 0;
    foreach ($places as $p) {
        $id = (int) $p['id']; $name = trim((string) $p['name']); $r = $rest[$id] ?? null;
        [$main, $dep, $more] = lap_parse($name, $p);
        $country = world_fold((string) $p['country']);
        $find = static function (string $n) use ($C, $spelling): array { return $spelling === 'exact' ? ($C['exact'][lap_exact($n)] ?? []) : ($C['by'][lap_key($n)] ?? []); };
        $status = 'none'; $why = ['code' => 'none']; $props = [];
        $byDist = static function (array $list) use ($r): array { if ($r) { usort($list, static fn($a, $b) => h_distance_km($r[0], $r[1], $a['lat'], $a['lon']) <=> h_distance_km($r[0], $r[1], $b['lat'], $b['lon'])); } return $list; };
        if ($country !== '' && !in_array($country, ['france', 'fr'], true)) {
            // 🌍 hors de France : les villes du monde livrées, départagées par le pays écrit
            $w = null; try { $w = world_place_exact($main, (string) $p['country']); } catch (Throwable $_) {}
            if ($w) { $status = 'abroad'; $why = ['code' => 'abroad', 'country' => (string) $p['country']]; $props[] = lap_prop(['name' => (string) $w['name'], 'lat' => (float) $w['latitude'], 'lon' => (float) $w['longitude'], 'dept' => '', 'insee' => ''], 'world', false, $r, $w['name'] . ', ' . $w['country']); }
            else { $status = 'abroad'; $why = ['code' => 'abroad_none', 'country' => (string) $p['country']]; }
        } else {
            $hit = $find($main);
            if (!$hit && $spelling !== 'exact' && strlen(lap_key($main)) >= 4) { // « St Martin » : les « Saint-Martin-… » (plusieurs, jamais une seule cochée toute seule)
                $k = lap_key($main) . ' ';
                foreach ($C['by'] as $ck => $list) { if (str_starts_with((string) $ck, $k)) { foreach ($list as $c) { $hit[] = $c; } } }
                if (count($hit) === 1) { $hit[] = $hit[0]; } // un seul « Saint-Martin-… » : ce n'est pas le même nom, on demande quand même
            }
            if ($hit && $dep !== '') { $inDep = array_values(array_filter($hit, static fn($c) => $c['dept'] === $dep)); if ($inDep) { $hit = $inDep; } }
            if (count($hit) === 1 && ($dep === '' || $hit[0]['dept'] === $dep)) {
                $status = $dep !== '' ? 'sure' : 'probable';
                $why = ['code' => $dep !== '' ? 'name_dept' : 'national', 'name' => $hit[0]['name']];
                $props[] = lap_prop($hit[0], 'commune', false, $r);
            } elseif (count($hit) > 1) {
                $status = 'several'; $list = $byDist($hit);
                $hit = array_values(array_unique($hit, SORT_REGULAR)); $list = $byDist($hit);
                $why = ['code' => 'several', 'n' => count($hit)];
                if ($several === 'nearest') { foreach (array_slice($list, 0, 3) as $c) { $props[] = lap_prop($c, 'commune', false, $r); } }
            } elseif ($more && ($com = $byDist($find($more[0]))) && $lieudit !== 'skip') {
                // « Le Mas Bas, Naves » : un lieu-dit dans une commune
                $c = $dep !== '' ? (array_values(array_filter($com, static fn($x) => $x['dept'] === $dep))[0] ?? $com[0]) : $com[0];
                $spot = null;
                if ($lieudit === 'spot') {
                    try { foreach (world_place_suggestions($main, 'France', 20) as $w) { if (world_search_key((string) $w['name']) === world_search_key($main) && h_distance_km($c['lat'], $c['lon'], (float) $w['latitude'], (float) $w['longitude']) < 15) { $spot = $w; break; } } } catch (Throwable $_) {}
                }
                if ($spot) { $status = 'sure'; $why = ['code' => 'lieudit', 'name' => $c['name']]; $props[] = lap_prop(['name' => $main, 'lat' => (float) $spot['latitude'], 'lon' => (float) $spot['longitude'], 'insee' => $c['insee'], 'dept' => $c['dept']], 'lieudit', false, $r, $main . ', ' . $c['name']); }
                else { $status = 'probable'; $why = ['code' => 'lieudit_center', 'name' => $c['name']]; }
                $props[] = lap_prop($c, 'commune', true, $r, $c['name'] . ($c['dept'] !== '' ? ' (' . $c['dept'] . ')' : ''));
            } elseif (isset($oldBy[lap_key($main)])) {
                // 🕰 une ancienne commune (🏛 Frontières anciennes) : au centre de l'ancienne commune si connu, sinon de celle d'aujourd'hui
                $o = $oldBy[lap_key($main)][0];
                $status = 'old'; $why = ['code' => 'old', 'to' => (string) ($o['nn'] ?? ''), 'year' => substr((string) ($o['d'] ?? ''), 0, 4)];
                if (isset($o['lat'], $o['lon']) && is_numeric($o['lat'])) { $props[] = lap_prop(['name' => (string) ($o['nn'] ?? $main), 'lat' => (float) $o['lat'], 'lon' => (float) $o['lon'], 'insee' => (string) ($o['nc'] ?? ''), 'dept' => lap_dept_of((string) ($o['nc'] ?? ''))], 'old', !empty($o['approx']), $r, $main . ' → ' . ($o['nn'] ?? '')); }
            } elseif ($spelling === 'fuzzy') {
                // des fautes proches (« Fereol » → « Féréole ») : proposées, jamais cochées
                $k = lap_key($main); $cands = [];
                foreach ($C['by'] as $ck => $list) { if (lap_close($k, (string) $ck)) { foreach ($list as $c) { if ($dep === '' || $c['dept'] === $dep) { $cands[] = $c; } } } if (count($cands) > 20) { break; } }
                foreach (array_slice($byDist($cands), 0, 3) as $c) { $props[] = lap_prop($c, 'fuzzy', false, $r); }
                $why = ['code' => $cands ? 'fuzzy' : 'none'];
            }
        }
        $counts[$status]++; $events += (int) $p['n'];
        $items[] = ['id' => $id, 'name' => mb_substr($name, 0, 120), 'county' => mb_substr(trim((string) $p['county']), 0, 60), 'country' => mb_substr(trim((string) $p['country']), 0, 60),
            'events' => (int) $p['n'], 'years' => [$p['y0'] !== null ? (int) $p['y0'] : null, $p['y1'] !== null ? (int) $p['y1'] : null], 'status' => $status, 'why' => $why, 'props' => $props,
            'rest' => $r ? [round($r[0], 4), round($r[1], 4)] : null, 'group' => $props && $props[0]['insee'] !== '' && $status !== 'several' ? $props[0]['insee'] : ''];
    }
    return ['items' => $items, 'counts' => $counts, 'total' => count($items), 'total_events' => $events, 'online' => true];
}

/** placer un ou plusieurs lieux (une seule annulation) : rend les anciennes valeurs */
function lap_place(PDO $pdo, array $d): array
{
    $items = is_array($d['items'] ?? null) ? array_slice($d['items'], 0, 500) : [];
    if (!$items) { throw new RuntimeException('Aucun lieu à placer.'); }
    $posOnly = ($d['what'] ?? '') === 'pos';
    $before = []; $n = 0; $events = 0;
    $get = $pdo->prepare('SELECT id, name, latitude, longitude, admin4_code, admin2_code, description FROM places WHERE id=?');
    $cnt = $pdo->prepare('SELECT count(*) FROM events WHERE place_id=?');
    foreach ($items as $it) {
        if (!is_array($it)) { continue; }
        $id = safe_int($it['id'] ?? 0); $lat = h_coord($it['lat'] ?? null, 90); $lon = h_coord($it['lon'] ?? null, 180);
        if (!$id || $lat === null || $lon === null || ($lat == 0.0 && $lon == 0.0)) { throw new RuntimeException('Coordonnées invalides.'); }
        $get->execute([$id]); $b = $get->fetch(PDO::FETCH_ASSOC); if (!$b) { continue; }
        $insee = preg_match('/^(\d[\dAB]\d{3})$/', (string) ($it['insee'] ?? '')) ? (string) $it['insee'] : '';
        $dept = preg_match('/^(\d{2}|2[AB]|97\d)$/', (string) ($it['dept'] ?? '')) ? (string) $it['dept'] : '';
        $desc = (string) $b['description'];
        if (!empty($it['approx']) && !str_contains($desc, 'position approchée')) { $desc = trim($desc . ($desc !== '' ? ' — ' : '') . 'position approchée'); }
        $pdo->prepare('UPDATE places SET latitude=?, longitude=?, description=? WHERE id=?')->execute([$lat, $lon, mb_substr($desc, 0, 4000), $id]);
        if (!$posOnly && $insee !== '') { $pdo->prepare('UPDATE places SET admin4_code=? WHERE id=?')->execute([$insee, $id]); }
        if (!$posOnly && $dept !== '') { $pdo->prepare("UPDATE places SET admin2_code=? WHERE id=?")->execute([$dept, $id]); }
        log_change($pdo, 'place', $id, 'update', 'Lieu placé sur la carte : ' . $b['name'], $b, ['latitude' => $lat, 'longitude' => $lon]);
        $before[] = ['id' => $id, 'lat' => $b['latitude'], 'lon' => $b['longitude'], 'insee' => $b['admin4_code'], 'dept' => $b['admin2_code'], 'desc' => $b['description']];
        $cnt->execute([$id]); $events += (int) $cnt->fetchColumn(); $n++;
    }
    return ['before' => $before, 'n' => $n, 'events' => $events];
}

/** ↶ Annuler : les anciennes valeurs, telles quelles */
function lap_undo(PDO $pdo, array $d): array
{
    $items = is_array($d['items'] ?? null) ? array_slice($d['items'], 0, 500) : [];
    $n = 0;
    foreach ($items as $it) {
        if (!is_array($it)) { continue; }
        $id = safe_int($it['id'] ?? 0); if (!$id) { continue; }
        $lat = $it['lat'] === null || $it['lat'] === '' ? null : h_coord($it['lat'], 90); $lon = $it['lon'] === null || $it['lon'] === '' ? null : h_coord($it['lon'], 180);
        $pdo->prepare('UPDATE places SET latitude=?, longitude=?, admin4_code=?, admin2_code=?, description=? WHERE id=?')
            ->execute([$lat, $lon, mb_substr((string) ($it['insee'] ?? ''), 0, 12) ?: null, mb_substr((string) ($it['dept'] ?? ''), 0, 4) ?: null, mb_substr((string) ($it['desc'] ?? ''), 0, 4000), $id]);
        log_change($pdo, 'place', $id, 'update', 'Lieu remis comme avant (↶ Annuler)', null, ['latitude' => $lat, 'longitude' => $lon]);
        $n++;
    }
    return ['n' => $n];
}

/** 🌐 en ligne, à la demande, pour UN lieu : seul son nom part (Géoplateforme de l'IGN) ; la réponse est une proposition de plus */
function lap_online(PDO $pdo, array $d): array
{
    $q = trim(mb_substr((string) ($d['q'] ?? ''), 0, 120));
    if (mb_strlen($q) < 2) { throw new RuntimeException('Le nom du lieu est trop court.'); }
    $base = (string) (getenv('LCNDA_LAP_GEOCODE') ?: LAP_GEOCODE);
    $url = str_starts_with($base, 'file://') ? $base : $base . '?' . http_build_query(['q' => $q, 'index' => 'address', 'type' => 'municipality', 'limit' => 5]);
    $res = cp_http_get($url, 400000, 15);
    if (!$res['ok']) { return ['ok' => false, 'offline' => true, 'props' => [], 'error' => 'Pas de réseau : rien n’a été envoyé.']; }
    $j = json_decode((string) $res['body'], true);
    $props = [];
    foreach (is_array($j['features'] ?? null) ? $j['features'] : [] as $f) {
        $c = $f['geometry']['coordinates'] ?? null; $pr = $f['properties'] ?? [];
        if (!is_array($c) || !is_numeric($c[0] ?? null) || !is_numeric($c[1] ?? null)) { continue; }
        $insee = preg_match('/^\d[\dAB]\d{3}$/', (string) ($pr['citycode'] ?? '')) ? (string) $pr['citycode'] : '';
        $props[] = ['label' => mb_substr(trim((string) ($pr['label'] ?? $pr['name'] ?? $q)), 0, 120) . ' 🌐', 'lat' => round((float) $c[1], 5), 'lon' => round((float) $c[0], 5), 'insee' => $insee, 'dept' => lap_dept_of($insee), 'approx' => false, 'kind' => 'online', 'km' => null];
        if (count($props) >= 5) { break; }
    }
    return ['ok' => true, 'props' => $props];
}
