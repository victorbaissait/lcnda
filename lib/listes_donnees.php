<?php
declare(strict_types=1);

/**
 * 🧰 Listes → Données : la recherche côté serveur des grandes listes tirées des packs déjà installés
 * (écran : assets/js/app-listes-donnees.js, qui les enregistre dans LCNDA_EXT.dataLists avec query()).
 *
 *   GET ld_query&src=…&query={q, filters:[{key, op, value}], near:{lat, lon, km}, years:{from, to, mode}, sort, dir, offset, limit}
 *       → {rows, total, more}       (total s'arrête à LD_COUNT_MAX : « plus de 100 000 »)
 *   GET ld_facet&src=…&key=…&query={…} → {values: [[valeur, nombre], …]}   (les choix d'un filtre « liste », avec leur nombre)
 *
 * Lecture seule : les packs sont ouverts par leur propre fichier (lib/histoire.php, prenoms_pays.php, bases_officielles.php,
 * gov.php, elections.php, meteo.php) ; rien n'est écrit, ni dans les packs ni dans la généalogie.
 * La position d'une commune (packs sans coordonnées : population, CatNat, inondations, élections) vient des lieux de la base
 * (places.admin4_code = code Insee, rempli par les communes GeoNames livrées avec l'app).
 * Essai : tests/test-listes-donnees.js
 */

const LD_COUNT_MAX = 100000;
const LD_NEAR_MAX = 20000;

/** km entre deux points (haversine) */
function ld_km(float $a, float $b, float $c, float $d): float
{
    $r = M_PI / 180; $x = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
    return 6371 * 2 * asin(min(1.0, sqrt($x)));
}

function ld_fold(?string $s): string
{
    $s = mb_strtolower(trim((string) $s));
    if (class_exists('Normalizer')) { $s = (string) Normalizer::normalize($s, Normalizer::FORM_D); $s = (string) preg_replace('/\p{Mn}+/u', '', $s); }
    return str_replace(['œ', 'æ', '’'], ['oe', 'ae', "'"], $s);
}

/** les sources : sql (une sous-requête dont les colonnes portent le nom des champs) ou php (toutes les lignes d'un coup) */
function ld_sources(): array
{
    $dirHist = __DIR__ . '/histoire.php';
    $hist = static function () use ($dirHist) { require_once $dirHist; return hist_pdo(); };
    $vendKind = "CASE WHEN s.ecart > 0 AND (g.jours - s.moyenne) / s.ecart <= -2 THEN 'très précoces (été très chaud)' WHEN s.ecart > 0 AND (g.jours - s.moyenne) / s.ecart <= -1 THEN 'précoces (été chaud)'
        WHEN s.ecart > 0 AND (g.jours - s.moyenne) / s.ecart >= 2 THEN 'très tardives (été très frais)' WHEN s.ecart > 0 AND (g.jours - s.moyenne) / s.ecart >= 1 THEN 'tardives (été frais)' ELSE 'normales' END";
    return [
        /* 🍇 Vendanges : une ligne par région et par année */
        'hist_vendanges' => ['open' => $hist, 'keys' => ['region', 'code', 'year', 'days', 'diff', 'kind', 'lat', 'lon'], 'text' => ['region'], 'y1' => 'year', 'geo' => ['lat', 'lon'], 'sort' => 'year',
            'sql' => "SELECT s.nom AS region, g.code AS code, g.annee AS year, ROUND(g.jours, 1) AS days, CAST(ROUND(g.jours - s.moyenne) AS INTEGER) AS diff, $vendKind AS kind, s.lat AS lat, s.lon AS lon FROM ghd g JOIN ghd_series s ON s.code = g.code",
            'post' => static function (array $rows): array { foreach ($rows as &$r) { $y = max(1, (int) $r['year']); $r['date'] = (new DateTimeImmutable(sprintf('%04d-08-31', $y)))->modify('+' . (int) round((float) $r['days']) . ' days')->format('Y-m-d'); } return $rows; }],
        /* 🚂 Gares */
        'hist_gares' => ['open' => $hist, 'keys' => ['name', 'year', 'code', 'source', 'lat', 'lon'], 'text' => ['name'], 'y1' => 'year', 'y2' => 'year_to', 'geo' => ['lat', 'lon'], 'sort' => 'name',
            'sql' => "SELECT nom AS name, ouverture AS year, CASE WHEN ouverture IS NOT NULL THEN 9999 END AS year_to, insee AS code, CASE src WHEN 'wikidata' THEN 'Wikidata (date d’ouverture)' ELSE 'Un siècle de gares (sans date)' END AS source, lat, lon FROM gares"],
        /* 🌋 Séismes (EPICA, 1000 → 1899) */
        'hist_seismes' => ['open' => $hist, 'keys' => ['date', 'year', 'zone', 'io', 'intensity', 'mw', 'lat', 'lon'], 'text' => ['zone'], 'y1' => 'year', 'geo' => ['lat', 'lon'], 'sort' => 'year',
            'sql' => "SELECT annee || CASE WHEN mois IS NOT NULL THEN '-' || printf('%02d', mois) || CASE WHEN jour IS NOT NULL THEN '-' || printf('%02d', jour) ELSE '' END ELSE '' END AS date, annee AS year, zone, io, CAST(io AS REAL) AS intensity, ROUND(mw, 1) AS mw, lat, lon FROM seismes"],
        /* 🌊 Inondations historiques (BDHI) */
        'hist_crues' => ['open' => $hist, 'keys' => ['id', 'title', 'year', 'start', 'end', 'communes', 'deps'], 'text' => ['title', 'communes'], 'y1' => 'year', 'codes' => 'id', 'sort' => 'year',
            'near_sql' => 'EXISTS (SELECT 1 FROM bdhi_lieu l WHERE l.id = t.id AND l.code IN ({codes}))',
            'sql' => "SELECT b.id AS id, b.titre AS title, b.annee AS year, b.debut AS start, b.fin AS end,
                (SELECT group_concat(c.nom, ', ') FROM bdhi_lieu l JOIN communes c ON c.code = l.code WHERE l.id = b.id) AS communes,
                (SELECT group_concat(substr(l.code, 2), ', ') FROM bdhi_lieu l WHERE l.id = b.id AND substr(l.code, 1, 1) = 'D') AS deps FROM bdhi b",
            'post' => static function (array $rows, PDO $h, PDO $pdo): array {
                // la position : la première commune touchée (ou rien)
                $ids = array_column($rows, 'id'); if (!$ids) { return $rows; }
                $s = $h->prepare('SELECT id, code FROM bdhi_lieu WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ") AND substr(code, 1, 1) <> 'D'"); $s->execute($ids);
                $first = []; foreach ($s->fetchAll() as $r) { $first[(int) $r['id']][] = (string) $r['code']; }
                $pos = ld_code_positions($pdo, array_merge(...array_values($first ?: [[]])));
                foreach ($rows as &$r) { foreach ($first[(int) $r['id']] ?? [] as $c) { if (isset($pos[$c])) { [$r['lat'], $r['lon']] = $pos[$c]; break; } } }
                return $rows;
            }],
        /* ⚠️ Arrêtés CatNat (GASPAR, depuis 1982) */
        'hist_catnat' => ['open' => $hist, 'keys' => ['code', 'commune', 'dep', 'start', 'end', 'year', 'risk'], 'text' => ['commune', 'risk'], 'y1' => 'year', 'code' => 'code', 'sort' => 'start',
            'sql' => 'SELECT c.code AS code, cm.nom AS commune, cm.dep AS dep, c.debut AS start, c.fin AS end, CAST(substr(c.debut, 1, 4) AS INTEGER) AS year, r.nom AS risk
                FROM catnat c LEFT JOIN catnat_risques r ON r.code = c.risque LEFT JOIN communes cm ON cm.code = c.code'],
        /* 👥 Population des communes (Insee, 1876 → 2023) : 35 000 lignes, calculées en PHP */
        'hist_communes' => ['open' => $hist, 'php' => static function (PDO $h, PDO $pdo): array {
            $years = array_map('intval', explode(',', (string) ($h->query("SELECT value FROM meta WHERE key='pop_years'")->fetchColumn() ?: '')));
            $want = [1876, 1901, 1936, 1968, 1999, 2023]; $idx = [];
            foreach ($want as $y) { $i = array_search($y, $years, true); if ($i !== false) { $idx[$y] = $i; } }
            $pos = ld_code_positions($pdo, null);
            $out = [];
            foreach ($h->query('SELECT code, nom, dep, pop FROM communes') as $c) {
                $v = explode(',', (string) $c['pop']); $row = ['commune' => (string) $c['nom'], 'code' => (string) $c['code'], 'dep' => (string) $c['dep']];
                foreach ($want as $y) { $row['p' . $y] = isset($idx[$y], $v[$idx[$y]]) && $v[$idx[$y]] !== '' ? (int) $v[$idx[$y]] : null; }
                $vals = array_values(array_filter(array_map(static fn($x) => $x === '' ? null : (int) $x, $v), static fn($x) => $x !== null));
                $row['max'] = $vals ? max($vals) : null;
                $row['evolution'] = $row['p1876'] && $row['p2023'] !== null ? (int) round(100 * ($row['p2023'] - $row['p1876']) / $row['p1876']) : null;
                [$row['lat'], $row['lon']] = $pos[$row['code']] ?? [null, null];
                $out[] = $row;
            }
            return $out;
        }, 'text' => ['commune', 'code'], 'geo' => ['lat', 'lon'], 'sort' => 'commune'],
        /* 📊 Prénoms d'ici et d'ailleurs : prénom × zone × année × sexe */
        'pp_prenoms' => ['open' => static function () { require_once __DIR__ . '/prenoms_pays.php'; return pp_pdo(); },
            'keys' => ['name', 'zone', 'zone_id', 'country', 'year', 'sex', 'n', 'rank', 'permil'], 'text' => ['name'], 'y1' => 'year', 'sort' => '',
            'sql' => "SELECT nm.prenom AS name, z.nom AS zone, z.id AS zone_id, z.pays AS country, c.annee AS year, CASE c.sexe WHEN 1 THEN 'garçon' ELSE 'fille' END AS sex, c.n AS n, c.rang AS rank,
                CASE WHEN tt.n > 0 THEN ROUND(1000.0 * c.n / tt.n, 1) END AS permil
                FROM counts c JOIN names nm ON nm.id = c.name JOIN zones z ON z.id = c.zone LEFT JOIN totals tt ON tt.zone = c.zone AND tt.sexe = c.sexe AND tt.annee = c.annee"],
        /* 🎖️ Morts pour la France, 🏅 Léonore */
        'bo_mpf' => ld_bo_source('mpf'),
        'bo_leonore' => ld_bo_source('leonore'),
        /* 🏰 GOV : les noms des lieux anciens */
        'gov_noms' => ['open' => static function () { require_once __DIR__ . '/gov.php'; return gov_pdo(); },
            'keys' => ['name', 'lang', 'from', 'to', 'gov', 'kind', 'lat', 'lon'], 'text' => ['name'], 'y1' => 'from', 'y2' => 'to', 'geo' => ['lat', 'lon'], 'sort' => '',
            'sql' => 'SELECT n.name AS name, n.lang AS lang, COALESCE(n.y1, n.yr) AS "from", COALESCE(n.y2, n.yr) AS "to", o.gov AS gov,
                (SELECT ty.fr FROM typ y JOIN types ty ON ty.id = y.type WHERE y.obj = o.id LIMIT 1) AS kind, o.lat AS lat, o.lon AS lon FROM name n JOIN obj o ON o.id = n.obj'],
        /* 🗳 Élections d'autrefois : une ligne par commune et par élection */
        'elections' => ['open' => static function () { require_once __DIR__ . '/elections.php'; return elections_pdo(); },
            'keys' => ['code', 'commune', 'dep', 'year', 'election', 'tour', 'inscrits', 'votants', 'participation', 'eid'], 'text' => ['commune', 'election'], 'y1' => 'year', 'code' => 'code', 'sort' => 'year',
            'sql' => 'SELECT r.commune AS code, cm.name AS commune, cm.dep AS dep, e.year AS year, e.label AS election, e.tour AS tour, r.inscrits AS inscrits, r.votants AS votants,
                CASE WHEN r.inscrits > 0 THEN ROUND(100.0 * r.votants / r.inscrits, 1) END AS participation, e.id AS eid FROM results r JOIN elections e ON e.id = r.election_id JOIN communes cm ON cm.code = r.commune',
            'post' => static function (array $rows, PDO $e): array {
                $els = []; foreach ($e->query('SELECT * FROM elections') as $el) { $els[(int) $el['id']] = $el; }
                foreach ($rows as &$r) { $el = $els[(int) $r['eid']] ?? null; $res = $el ? elections_result($e, $el, (string) $r['code']) : null; $g = $res['groups'][0] ?? null;
                    $r['first'] = $g ? $g['label'] . ' (' . str_replace('.', ',', (string) $g['pct']) . ' %)' : ''; }
                return $rows;
            }],
        /* 🌦 Stations météo des packs installés */
        'meteo_stations' => ['open' => static function () { require_once __DIR__ . '/meteo.php'; foreach (meteo_files() as $f) { $p = meteo_pdo($f['path']); if ($p) { return $p; } } return null; },
            'php' => static function (): array {
                $out = []; $seen = [];
                foreach (meteo_files() as $f) {
                    $p = meteo_pdo($f['path']); if (!$p) { continue; }
                    try { $rows = $p->query('SELECT * FROM stations')->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable) { continue; }
                    foreach ($rows as $r) {
                        $k = ($r['source'] ?? '') . ':' . ($r['code'] ?? ''); if (isset($seen[$k])) { continue; } $seen[$k] = 1;
                        $out[] = ['name' => (string) ($r['nom'] ?? ''), 'country' => (string) ($r['pays'] ?? ''), 'source' => (string) ($r['source'] ?? ''), 'code' => (string) ($r['code'] ?? ''),
                            'alt' => isset($r['alt']) && $r['alt'] !== null ? (int) round((float) $r['alt']) : null, 'from' => isset($r['debut']) && $r['debut'] !== null ? (int) substr((string) $r['debut'], 0, 4) : null,
                            'to' => isset($r['fin']) && $r['fin'] !== null ? (int) substr((string) $r['fin'], 0, 4) : null, 'pack' => (string) $f['kind'],
                            'lat' => isset($r['lat']) ? (float) $r['lat'] : null, 'lon' => isset($r['lon']) ? (float) $r['lon'] : null];
                    }
                }
                return $out;
            }, 'text' => ['name', 'country'], 'y1' => 'from', 'y2' => 'to', 'geo' => ['lat', 'lon'], 'sort' => 'name'],
    ];
}

function ld_bo_source(string $kind): array
{
    return ['open' => static function () use ($kind) { require_once __DIR__ . '/bases_officielles.php'; return bo_pdo($kind); },
        'keys' => ['id', 'nom', 'prenoms', 'naiss', 'year', 'lieu', 'dep', 'deces', 'lieu_deces', 'unite', 'grade', 'cote', 'sexe'], 'text' => ['nom', 'prenoms', 'lieu'], 'y1' => 'year', 'sort' => '',
        'sql' => 'SELECT id, nom, prenoms, naiss, annee AS year, lieu, dep, deces, lieu_deces, unite, grade, cote, sexe, ref, src FROM records',
        'post' => static function (array $rows) use ($kind): array { foreach ($rows as &$r) { $r['url'] = bo_record_url($kind, $r); unset($r['ref'], $r['src']); } return $rows; }];
}

/** [code Insee => [lat, lon]] d'après les lieux de la base (null : tous) */
function ld_code_positions(PDO $pdo, ?array $codes): array
{
    $out = [];
    try {
        if ($codes === null) { $s = $pdo->query("SELECT admin4_code c, latitude, longitude FROM places WHERE admin4_code <> '' AND latitude IS NOT NULL AND longitude IS NOT NULL"); }
        else {
            $codes = array_values(array_unique(array_filter(array_map('strval', $codes)))); if (!$codes) { return []; }
            $s = $pdo->prepare('SELECT admin4_code c, latitude, longitude FROM places WHERE admin4_code IN (' . implode(',', array_fill(0, count($codes), '?')) . ') AND latitude IS NOT NULL AND longitude IS NOT NULL'); $s->execute($codes);
        }
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(string) $r['c']] ??= [(float) $r['latitude'], (float) $r['longitude']]; }
    } catch (Throwable) {}
    return $out;
}

/** les codes Insee des lieux de la base dans un carré autour d'un point */
function ld_codes_near(PDO $pdo, array $near): array
{
    [$a, $b, $c, $d] = ld_box($near);
    try {
        $s = $pdo->prepare("SELECT admin4_code c, latitude, longitude FROM places WHERE admin4_code <> '' AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?"); $s->execute([$a, $b, $c, $d]);
        $out = [];
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { if (ld_km($near['lat'], $near['lon'], (float) $r['latitude'], (float) $r['longitude']) <= $near['km']) { $out[(string) $r['c']] = 1; } }
        return array_slice(array_keys($out), 0, 5000);
    } catch (Throwable) { return []; }
}

function ld_box(array $n): array
{
    $dl = $n['km'] / 110.0; $dn = $n['km'] / (111.0 * max(0.05, cos(deg2rad($n['lat']))));
    return [$n['lat'] - $dl, $n['lat'] + $dl, $n['lon'] - $dn, $n['lon'] + $dn];
}

/** la demande, nettoyée */
function ld_read_query(array $g): array
{
    $q = json_decode((string) ($g['query'] ?? '{}'), true); $q = is_array($q) ? $q : [];
    $near = is_array($q['near'] ?? null) && is_numeric($q['near']['lat'] ?? null) && is_numeric($q['near']['lon'] ?? null)
        ? ['lat' => (float) $q['near']['lat'], 'lon' => (float) $q['near']['lon'], 'km' => max(0.1, min(2000.0, (float) ($q['near']['km'] ?? 10)))] : null;
    $y = is_array($q['years'] ?? null) ? $q['years'] : [];
    $years = is_numeric($y['from'] ?? null) || is_numeric($y['to'] ?? null) ? ['from' => is_numeric($y['from'] ?? null) ? (int) $y['from'] : null, 'to' => is_numeric($y['to'] ?? null) ? (int) $y['to'] : null, 'mode' => in_array($y['mode'] ?? '', ['within', 'overlap', 'in'], true) ? $y['mode'] : 'overlap'] : null;
    return ['q' => trim(mb_substr((string) ($q['q'] ?? ''), 0, 120)), 'filters' => array_values(array_filter(is_array($q['filters'] ?? null) ? $q['filters'] : [], 'is_array')),
        'near' => $near, 'years' => $years, 'sort' => (string) ($q['sort'] ?? ''), 'dir' => strtolower((string) ($q['dir'] ?? '')) === 'desc' ? 'desc' : 'asc',
        'offset' => max(0, safe_int($q['offset'] ?? 0)), 'limit' => max(0, min(5000, safe_int($q['limit'] ?? 100, 100)))];
}

/* ═════════════ le filtre d'une ligne (mode PHP) ═════════════ */
function ld_row_match(array $row, array $f): bool
{
    $k = (string) ($f['key'] ?? ''); $op = (string) ($f['op'] ?? 'contains'); $v = $f['value'] ?? '';
    if ($k === '' || !array_key_exists($k, $row)) { return true; }
    $x = $row[$k];
    if ($op === 'in' || is_array($v)) { $set = array_map(static fn($y) => ld_fold((string) $y), (array) $v); return in_array(ld_fold((string) $x), $set, true); }
    if ($op === 'between') { return false; }
    $num = is_numeric($x) && is_numeric($v);
    return match ($op) {
        'eq', '=' => $num ? (float) $x == (float) $v : ld_fold((string) $x) === ld_fold((string) $v),
        'ne', '!=' => $num ? (float) $x != (float) $v : ld_fold((string) $x) !== ld_fold((string) $v),
        'gte', '>=' => $x !== null && $x !== '' && (float) $x >= (float) $v,
        'lte', '<=' => $x !== null && $x !== '' && (float) $x <= (float) $v,
        'gt', '>' => $x !== null && $x !== '' && (float) $x > (float) $v,
        'lt', '<' => $x !== null && $x !== '' && (float) $x < (float) $v,
        'starts' => str_starts_with(ld_fold((string) $x), ld_fold((string) $v)),
        'true' => (bool) $x && $x !== 'non', 'false' => !$x || $x === 'non',
        'empty' => $x === null || $x === '', 'notempty' => $x !== null && $x !== '',
        default => str_contains(ld_fold((string) $x), ld_fold((string) $v)),
    };
}

function ld_period_ok(array $row, array $def, array $years): bool
{
    $a = $row[$def['y1'] ?? ''] ?? null; $b = $row[$def['y2'] ?? ''] ?? null; if ($a === null || $a === '') { return false; }
    $a = (int) $a; $b = $b === null || $b === '' ? $a : (int) $b;
    $f = $years['from'] ?? -1000000; $t = $years['to'] ?? 1000000;
    return $years['mode'] === 'within' ? $a >= $f && $b <= $t : $a <= $t && $b >= $f;
}

/* ═════════════ la requête SQL (mode sql) ═════════════ */
function ld_sql_where(array $def, array $qq, PDO $pdo, string $skipKey = ''): array
{
    $w = []; $args = []; $keys = $def['keys'];
    $col = static fn(string $k) => 't."' . $k . '"';
    if ($qq['q'] !== '') { $or = []; foreach ($def['text'] as $k) { $or[] = $col($k) . ' LIKE ?'; $args[] = '%' . $qq['q'] . '%'; } $w[] = '(' . implode(' OR ', $or) . ')'; }
    foreach ($qq['filters'] as $f) {
        $k = (string) ($f['key'] ?? ''); if (!in_array($k, $keys, true) || $k === $skipKey) { continue; }
        $op = (string) ($f['op'] ?? 'contains'); $v = $f['value'] ?? '';
        if ($op === 'in' || is_array($v)) { $vs = array_slice(array_map('strval', (array) $v), 0, 500); if (!$vs) { continue; } $w[] = $col($k) . ' IN (' . implode(',', array_fill(0, count($vs), '?')) . ')'; array_push($args, ...$vs); continue; }
        switch ($op) {
            case 'eq': case '=': $w[] = $col($k) . ' = ?'; $args[] = $v; break;
            case 'ne': case '!=': $w[] = '(' . $col($k) . ' IS NULL OR ' . $col($k) . ' <> ?)'; $args[] = $v; break;
            case 'gte': case '>=': $w[] = $col($k) . ' >= ?'; $args[] = (float) $v; break;
            case 'lte': case '<=': $w[] = $col($k) . ' <= ?'; $args[] = (float) $v; break;
            case 'gt': case '>': $w[] = $col($k) . ' > ?'; $args[] = (float) $v; break;
            case 'lt': case '<': $w[] = $col($k) . ' < ?'; $args[] = (float) $v; break;
            case 'starts': $w[] = $col($k) . ' LIKE ?'; $args[] = $v . '%'; break;
            case 'true': $w[] = '(' . $col($k) . " NOT IN ('', '0', 'non') AND " . $col($k) . ' IS NOT NULL)'; break;
            case 'false': $w[] = '(' . $col($k) . " IN ('', '0', 'non') OR " . $col($k) . ' IS NULL)'; break;
            case 'empty': $w[] = '(' . $col($k) . " IS NULL OR " . $col($k) . " = '')"; break;
            case 'notempty': $w[] = '(' . $col($k) . " IS NOT NULL AND " . $col($k) . " <> '')"; break;
            default: $w[] = $col($k) . ' LIKE ?'; $args[] = '%' . $v . '%';
        }
    }
    if ($qq['years'] && isset($def['y1'])) {
        $a = $col($def['y1']); $b = isset($def['y2']) ? 'COALESCE(' . $col($def['y2']) . ', ' . $a . ')' : $a;
        $f = $qq['years']['from'] ?? -1000000; $t = $qq['years']['to'] ?? 1000000;
        if ($qq['years']['mode'] === 'within') { $w[] = "$a >= ? AND $b <= ?"; array_push($args, $f, $t); }
        else { $w[] = "$a <= ? AND $b >= ?"; array_push($args, $t, $f); }
    }
    if ($qq['near']) {
        if (isset($def['geo'])) { [$a, $b, $c, $d] = ld_box($qq['near']); $w[] = $col($def['geo'][0]) . ' BETWEEN ? AND ? AND ' . $col($def['geo'][1]) . ' BETWEEN ? AND ?'; array_push($args, $a, $b, $c, $d); }
        elseif (isset($def['code']) || isset($def['near_sql'])) {
            $codes = ld_codes_near($pdo, $qq['near']); if (!$codes) { $w[] = '0'; }
            else { $m = implode(',', array_fill(0, count($codes), '?')); $w[] = isset($def['near_sql']) ? str_replace('{codes}', $m, $def['near_sql']) : $col($def['code']) . " IN ($m)"; array_push($args, ...$codes); }
        }
    }
    return [$w ? ' WHERE ' . implode(' AND ', $w) : '', $args];
}

/** la position et la distance de chaque ligne ; sans position, la ligne sort quand on cherche autour d'un lieu */
function ld_with_geo(array $rows, array $def, PDO $pdo, ?array $near): array
{
    if (isset($def['code'])) { $pos = ld_code_positions($pdo, array_column($rows, $def['code'])); foreach ($rows as &$r) { [$r['lat'], $r['lon']] = $pos[(string) $r[$def['code']]] ?? [null, null]; } unset($r); }
    if (!$near) { return $rows; }
    $out = [];
    foreach ($rows as $r) {
        if (!is_numeric($r['lat'] ?? null) || !is_numeric($r['lon'] ?? null)) { continue; }
        $r['_km'] = round(ld_km($near['lat'], $near['lon'], (float) $r['lat'], (float) $r['lon']), 1);
        if ($r['_km'] <= $near['km']) { $out[] = $r; }
    }
    return $out;
}

function ld_sort(array $rows, string $sort, string $dir): array
{
    if (!$rows || $sort === '') { return $rows; }
    $d = $dir === 'desc' ? -1 : 1;
    usort($rows, static function ($a, $b) use ($sort, $d) {
        $x = $a[$sort] ?? null; $y = $b[$sort] ?? null;
        if ($x === null || $x === '') { return ($y === null || $y === '') ? 0 : 1; } if ($y === null || $y === '') { return -1; }
        return $d * (is_numeric($x) && is_numeric($y) ? ((float) $x <=> (float) $y) : strcoll(ld_fold((string) $x), ld_fold((string) $y)));
    });
    return $rows;
}

function ld_query(PDO $pdo, string $src, array $g): array
{
    $defs = ld_sources(); $def = $defs[$src] ?? null;
    if (!$def) { throw new LcndaBadInput('Liste inconnue.'); }
    $pack = ($def['open'])();
    if (!$pack) { return ['rows' => [], 'total' => 0, 'installed' => false]; }
    $qq = ld_read_query($g);
    if (isset($def['php'])) { return ld_query_php($pdo, $pack, $def, $qq); }
    $keys = $def['keys']; $sort = $qq['near'] && ($qq['sort'] === '_km' || $qq['sort'] === '') ? '_km' : (in_array($qq['sort'], $keys, true) ? $qq['sort'] : ($def['sort'] ?? ''));
    [$where, $args] = ld_sql_where($def, $qq, $pdo);
    $base = 'SELECT * FROM (' . $def['sql'] . ') t' . $where;
    $post = static fn(array $rows) => isset($def['post']) ? ($def['post'])($rows, $pack, $pdo) : $rows;
    if ($qq['near']) { // tout ce qui est dans le carré, puis la vraie distance, le tri et la page en PHP
        $s = $pack->prepare($base . ' LIMIT ' . LD_NEAR_MAX); $s->execute($args);
        $rows = ld_with_geo($post($s->fetchAll(PDO::FETCH_ASSOC)), $def, $pdo, $qq['near']);
        $rows = ld_sort($rows, $sort ?: '_km', $qq['dir']);
        return ['rows' => array_slice($rows, $qq['offset'], $qq['limit']), 'total' => count($rows), 'more' => false];
    }
    $c = $pack->prepare('SELECT COUNT(*) FROM (SELECT 1 FROM (' . $def['sql'] . ') t' . $where . ' LIMIT ' . (LD_COUNT_MAX + 1) . ')'); $c->execute($args); $total = (int) $c->fetchColumn();
    $order = $sort !== '' && $sort !== '_km' ? ' ORDER BY t."' . $sort . '" IS NULL, t."' . $sort . '" ' . strtoupper($qq['dir']) : '';
    $s = $pack->prepare($base . $order . ' LIMIT ' . $qq['limit'] . ' OFFSET ' . $qq['offset']); $s->execute($args);
    $rows = ld_with_geo($post($s->fetchAll(PDO::FETCH_ASSOC)), $def, $pdo, null);
    return ['rows' => $rows, 'total' => min($total, LD_COUNT_MAX), 'more' => $total > LD_COUNT_MAX];
}

function ld_php_rows(PDO $pdo, PDO $pack, array $def): array
{
    return ($def['php'])($pack, $pdo);
}

function ld_php_filtered(PDO $pdo, PDO $pack, array $def, array $qq, string $skipKey = ''): array
{
    $rows = ld_php_rows($pdo, $pack, $def); $text = ld_fold($qq['q']); $out = [];
    foreach ($rows as $r) {
        if ($text !== '') { $hit = false; foreach ($def['text'] as $k) { if (str_contains(ld_fold((string) ($r[$k] ?? '')), $text)) { $hit = true; break; } } if (!$hit) { continue; } }
        foreach ($qq['filters'] as $f) { if (($f['key'] ?? '') !== $skipKey && !ld_row_match($r, $f)) { continue 2; } }
        if ($qq['years'] && isset($def['y1']) && !ld_period_ok($r, $def, $qq['years'])) { continue; }
        if ($qq['near']) {
            if (!is_numeric($r['lat'] ?? null)) { continue; }
            $r['_km'] = round(ld_km($qq['near']['lat'], $qq['near']['lon'], (float) $r['lat'], (float) $r['lon']), 1);
            if ($r['_km'] > $qq['near']['km']) { continue; }
        }
        $out[] = $r;
    }
    return $out;
}

function ld_query_php(PDO $pdo, PDO $pack, array $def, array $qq): array
{
    $rows = ld_php_filtered($pdo, $pack, $def, $qq);
    $sort = $qq['sort'] !== '' && ($rows && array_key_exists($qq['sort'], $rows[0])) ? $qq['sort'] : ($qq['near'] ? '_km' : ($def['sort'] ?? ''));
    $rows = ld_sort($rows, $sort, $qq['sort'] !== '' ? $qq['dir'] : 'asc');
    return ['rows' => array_slice($rows, $qq['offset'], $qq['limit']), 'total' => count($rows), 'more' => false];
}

/** les valeurs d'un champ (avec leur nombre), selon les autres filtres */
function ld_facet(PDO $pdo, string $src, array $g): array
{
    $def = ld_sources()[$src] ?? null; $key = (string) ($g['key'] ?? '');
    if (!$def) { throw new LcndaBadInput('Liste inconnue.'); }
    $pack = ($def['open'])(); if (!$pack) { return ['values' => []]; }
    $qq = ld_read_query($g);
    if (isset($def['php'])) {
        $n = []; foreach (ld_php_filtered($pdo, $pack, $def, $qq, $key) as $r) { $v = (string) ($r[$key] ?? ''); if ($v !== '') { $n[$v] = ($n[$v] ?? 0) + 1; } }
        arsort($n); $n = array_slice($n, 0, 300, true); return ['values' => array_map(null, array_map('strval', array_keys($n)), array_values($n))];
    }
    if (!in_array($key, $def['keys'], true)) { throw new LcndaBadInput('Champ inconnu.'); }
    [$where, $args] = ld_sql_where($def, $qq, $pdo, $key);
    $s = $pack->prepare('SELECT t."' . $key . '" v, COUNT(*) n FROM (' . $def['sql'] . ') t' . $where . ' GROUP BY t."' . $key . '" ORDER BY n DESC LIMIT 300'); $s->execute($args);
    return ['values' => array_values(array_filter(array_map(static fn($r) => [(string) $r['v'], (int) $r['n']], $s->fetchAll(PDO::FETCH_ASSOC)), static fn($x) => $x[0] !== ''))];
}

/** les sources installées (pour l'écran : « ⤓ Installer » sinon) */
function ld_status(): array
{
    $out = []; $err = [];
    // un pack qui ne s'ouvre pas (abîmé, verrouillé…) n'est pas « pas installé » : son erreur est donnée à part (l'écran la montre)
    foreach (ld_sources() as $id => $def) { try { $out[$id] = (bool) ($def['open'])(); } catch (Throwable $e) { $out[$id] = false; $err[$id] = $e->getMessage(); } }
    // 🧭 Histoire autour : les fichiers assets/data/ha-*.json.gz vraiment livrés (un sujet pas fabriqué n'est pas demandé : pas de 404)
    $ha = array_values(array_map(static fn($f) => basename($f, '.json.gz'), glob(__DIR__ . '/../assets/data/ha-*.json.gz') ?: []));
    return ['installed' => $out, 'errors' => (object) $err, 'ha_files' => $ha];
}

function ld_api_get(PDO $pdo, string $action, array $g): array
{
    $src = (string) ($g['src'] ?? '');
    return match ($action) {
        'ld_query' => ld_query($pdo, $src, $g),
        'ld_facet' => ld_facet($pdo, $src, $g),
        'ld_status' => ld_status(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
