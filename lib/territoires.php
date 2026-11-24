<?php
declare(strict_types=1);

/**
 * 🧩 Mes territoires (assets/js/heritage-territoires.js) et 🗺 données ouvertes sur les cartes (assets/js/heritage-carto-donnees.js).
 *
 *  · Un territoire = des communes réunies (leurs limites communes effacées) : nom, couleur, hachure, étiquette, la liste des codes INSEE
 *    et le contour déjà calculé dans la page (anneaux [lon, lat], règle pair-impair), gardé ici pour le redessiner sans recharger les
 *    35 000 communes (Carte, diagrammes, dessin, filtre « dans le territoire »). Table « territories », créée à la première demande.
 *    Les tracés des communes : IGN Admin Express (Licence Ouverte), assets/data/geo/fr-communes.json.gz (déjà livré).
 *  · Les données des packs déjà installés, posées sur une carte (lecture seule, jamais écrites) : séismes (pack « Histoire du lieu »,
 *    EPICA / INGV), stations météo (pack météo), lieux anciens (pack GOV). Seulement dans un cadre [ouest, sud, est, nord].
 * Rien n'est écrit dans la généalogie. Chaque changement se défait (↶ : terr_restore remet un territoire effacé ou l'ancienne version).
 */

const TERR_MAX_RINGS_JSON = 2_000_000; // 2 Mo de contour au plus par territoire

function terr_table(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS territories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'communes',
        style_json TEXT NOT NULL DEFAULT '{}', communes_json TEXT NOT NULL DEFAULT '[]', rings_json TEXT NOT NULL DEFAULT '[]',
        min_lon REAL, min_lat REAL, max_lon REAL, max_lat REAL, note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function terr_bad(string $m): never { throw new LcndaBadInput($m); }

/** le style : couleur, hachure, opacité, étiquette — seulement des valeurs sûres */
function terr_style(mixed $s): array
{
    $s = is_array($s) ? $s : [];
    $hex = static fn($c, $d) => is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? strtolower($c) : $d;
    return [
        'color' => $hex($s['color'] ?? null, '#c0392b'),
        'fill' => $hex($s['fill'] ?? null, $hex($s['color'] ?? null, '#c0392b')),
        'hatch' => in_array($s['hatch'] ?? '', ['', 'diag', 'diag2', 'cross', 'horiz', 'vert', 'dots'], true) ? (string) ($s['hatch'] ?? '') : '',
        'opacity' => max(0.0, min(1.0, is_numeric($s['opacity'] ?? null) ? (float) $s['opacity'] : 0.25)),
        'width' => max(0.2, min(12.0, is_numeric($s['width'] ?? null) ? (float) $s['width'] : 2.0)),
        'label' => ($s['label'] ?? true) !== false,
        'dash' => !empty($s['dash']),
    ];
}

/** les anneaux [[lon, lat], …] : nombres vérifiés, 5 décimales, au plus 400 anneaux et 200 000 points */
function terr_rings(mixed $r): array
{
    if (!is_array($r)) { return []; }
    $out = []; $n = 0;
    foreach (array_slice($r, 0, 400) as $ring) {
        if (!is_array($ring)) { continue; }
        $pts = [];
        foreach ($ring as $p) {
            if (!is_array($p) || !isset($p[0], $p[1]) || !is_numeric($p[0]) || !is_numeric($p[1])) { continue; }
            $lon = (float) $p[0]; $lat = (float) $p[1];
            if ($lon < -180 || $lon > 180 || $lat < -90 || $lat > 90) { continue; }
            $pts[] = [round($lon, 5), round($lat, 5)];
            if (++$n > 200000) { terr_bad('Ce territoire est trop grand (plus de 200 000 points).'); }
        }
        if (count($pts) >= 3) { $out[] = $pts; }
    }
    return $out;
}

function terr_row(array $r, bool $full = true): array
{
    $t = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'kind' => (string) $r['kind'], 'style' => json_decode((string) $r['style_json'], true) ?: [],
        'communes' => json_decode((string) $r['communes_json'], true) ?: [], 'note' => (string) $r['note'],
        'bbox' => $r['min_lon'] === null ? null : [(float) $r['min_lon'], (float) $r['min_lat'], (float) $r['max_lon'], (float) $r['max_lat']],
        'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at']];
    if ($full) { $t['rings'] = json_decode((string) $r['rings_json'], true) ?: []; }
    return $t;
}

function terr_get(PDO $pdo, int $id): ?array
{
    terr_table($pdo);
    $s = $pdo->prepare('SELECT * FROM territories WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ? terr_row($r) : null;
}

function terr_list(PDO $pdo, bool $full): array
{
    terr_table($pdo);
    return array_map(static fn($r) => terr_row($r, $full), $pdo->query('SELECT * FROM territories ORDER BY name COLLATE NOCASE, id')->fetchAll(PDO::FETCH_ASSOC));
}

/** enregistre (nouveau ou modifié) ; rend aussi l'ancienne version pour ↶ */
function terr_save(PDO $pdo, array $t): array
{
    terr_table($pdo);
    $name = trim(mb_substr(preg_replace('/\s+/u', ' ', (string) ($t['name'] ?? '')) ?? '', 0, 120));
    if ($name === '') { terr_bad('Donne un nom au territoire.'); }
    $communes = array_values(array_unique(array_filter(array_map('strval', is_array($t['communes'] ?? null) ? $t['communes'] : []), static fn($c) => preg_match('/^(\d[\dAB]\d{3}|97\d{3})$/', $c) === 1)));
    if (count($communes) > 40000) { terr_bad('Trop de communes.'); }
    $kind = in_array($t['kind'] ?? 'communes', ['communes', 'dessin', 'ancien'], true) ? (string) ($t['kind'] ?? 'communes') : 'communes';
    $rings = terr_rings($t['rings'] ?? []);
    if (!$rings) { terr_bad('Choisis au moins une commune.'); }
    $rj = json_encode($rings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    if (strlen((string) $rj) > TERR_MAX_RINGS_JSON) { terr_bad('Ce territoire est trop grand.'); }
    $b = [180.0, 90.0, -180.0, -90.0];
    foreach ($rings as $ring) { foreach ($ring as [$x, $y]) { $b[0] = min($b[0], $x); $b[1] = min($b[1], $y); $b[2] = max($b[2], $x); $b[3] = max($b[3], $y); } }
    $style = json_encode(terr_style($t['style'] ?? []), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $note = mb_substr((string) ($t['note'] ?? ''), 0, 2000);
    $id = (int) ($t['id'] ?? 0);
    $before = $id ? terr_get($pdo, $id) : null;
    if ($id && $before) {
        $pdo->prepare('UPDATE territories SET name=?, kind=?, style_json=?, communes_json=?, rings_json=?, min_lon=?, min_lat=?, max_lon=?, max_lat=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$name, $kind, $style, json_encode($communes), $rj, $b[0], $b[1], $b[2], $b[3], $note, $id]);
    } else {
        $pdo->prepare('INSERT INTO territories(name, kind, style_json, communes_json, rings_json, min_lon, min_lat, max_lon, max_lat, note) VALUES(?,?,?,?,?,?,?,?,?,?)')
            ->execute([$name, $kind, $style, json_encode($communes), $rj, $b[0], $b[1], $b[2], $b[3], $note]);
        $id = (int) $pdo->lastInsertId();
    }
    return ['territory' => terr_get($pdo, $id), 'before' => $before];
}

/** ↶ : remet un territoire tel qu'il était (effacé ou modifié), avec son numéro */
function terr_restore(PDO $pdo, array $t): array
{
    terr_table($pdo);
    $id = (int) ($t['id'] ?? 0); if ($id <= 0) { terr_bad('Territoire inconnu.'); }
    $pdo->prepare('DELETE FROM territories WHERE id=?')->execute([$id]);
    $pdo->prepare('INSERT INTO territories(id, name, created_at) VALUES(?, ?, ?)')->execute([$id, 'x', (string) ($t['created_at'] ?? date('Y-m-d H:i:s'))]);
    return terr_save($pdo, $t);
}

function terr_delete(PDO $pdo, int $id): array
{
    $before = terr_get($pdo, $id);
    if (!$before) { terr_bad('Territoire introuvable.'); }
    $pdo->prepare('DELETE FROM territories WHERE id=?')->execute([$id]);
    return ['ok' => true, 'before' => $before];
}

/** les lieux de la base qui ont une position (pour « depuis mes lieux ») */
function terr_places(PDO $pdo): array
{
    $cols = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $insee = in_array('admin4_code', $cols, true) ? 'p.admin4_code' : "''";
    $rows = $pdo->query("SELECT p.id, p.name, p.county, p.country, p.latitude AS lat, p.longitude AS lon, $insee AS insee,
        (SELECT COUNT(*) FROM events e WHERE e.place_id=p.id) AS n FROM places p WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL ORDER BY n DESC, p.name COLLATE NOCASE LIMIT 5000")->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'county' => (string) $r['county'], 'country' => (string) $r['country'],
        'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'insee' => (string) $r['insee'], 'n' => (int) $r['n']], $rows);
}

/* ═════════ 🗺 Les packs installés, en points sur une carte (lecture seule) ═════════ */

function carto_pdo_ro(string $path, string $probe): ?PDO
{
    if (!is_file($path) || filesize($path) === 0) { return null; }
    try {
        $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $opts[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $p = new PDO('sqlite:' . $path, null, null, $opts);
        $p->query("SELECT 1 FROM $probe LIMIT 1");
        return $p;
    } catch (Throwable) { return null; }
}

/** les fichiers des packs : [sorte => chemin] (seulement ceux qui sont là) */
function carto_packs(): array
{
    $out = [];
    $shared = defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : (defined('DATA_DIR') ? DATA_DIR : '');
    if ($shared === '') { return $out; }
    if (carto_pdo_ro($shared . '/histoire/histoire-locale.sqlite', 'seismes')) { $out['seismes'] = $shared . '/histoire/histoire-locale.sqlite'; }
    if (carto_pdo_ro($shared . '/gov/gov.sqlite', 'obj')) { $out['gov'] = $shared . '/gov/gov.sqlite'; }
    $meteoDirs = array_unique([rtrim((string) (getenv('LCNDA_METEO_DIR') ?: APP_ROOT . '/data-meteo'), '/'), $shared . '/meteo']);
    foreach ($meteoDirs as $d) {
        foreach (glob($d . '/meteo-*.sqlite') ?: [] as $f) { if (carto_pdo_ro($f, 'stations')) { $out['stations'] = $f; break 2; } }
    }
    return $out;
}

function carto_pack_rows(array $q): array
{
    $kind = (string) ($q['kind'] ?? '');
    $packs = carto_packs();
    if (!isset($packs[$kind])) { return ['installed' => false, 'rows' => []]; }
    $pdo = carto_pdo_ro($packs[$kind], $kind === 'gov' ? 'obj' : ($kind === 'seismes' ? 'seismes' : 'stations'));
    if (!$pdo) { return ['installed' => false, 'rows' => []]; }
    $bb = array_map('floatval', array_pad(explode(',', (string) ($q['bbox'] ?? '-180,-90,180,90')), 4, 0));
    [$w, $s, $e, $n] = $bb;
    if (!($e > $w && $n > $s)) { [$w, $s, $e, $n] = [-180.0, -90.0, 180.0, 90.0]; }
    $from = is_numeric($q['from'] ?? null) ? (int) $q['from'] : null;
    $to = is_numeric($q['to'] ?? null) ? (int) $q['to'] : null;
    $text = trim((string) ($q['q'] ?? ''));
    $limit = max(1, min(5000, (int) ($q['limit'] ?? 2000)));
    $args = [$s, $n, $w, $e];
    if ($kind === 'seismes') {
        $sql = 'SELECT annee AS year, mois, jour, lat, lon, io, mw, zone FROM seismes WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?';
        if ($from !== null) { $sql .= ' AND annee >= ?'; $args[] = $from; }
        if ($to !== null) { $sql .= ' AND annee <= ?'; $args[] = $to; }
        if ($text !== '') { $sql .= ' AND zone LIKE ?'; $args[] = '%' . $text . '%'; }
        $st = $pdo->prepare($sql . ' ORDER BY mw DESC, io DESC LIMIT ' . $limit); $st->execute($args);
        $rows = array_map(static fn($r) => ['name' => trim(($r['zone'] ?: 'Séisme') . ' (' . $r['year'] . ')'), 'year' => (int) $r['year'], 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'],
            'cat' => $r['io'] !== null && $r['io'] !== '' ? 'intensité ' . $r['io'] : '', 'value' => $r['mw'] !== null ? (float) $r['mw'] : null], $st->fetchAll());
        return ['installed' => true, 'rows' => $rows, 'source' => 'Séismes : EPICA (INGV), CC BY 4.0 — pack « Histoire du lieu »'];
    }
    if ($kind === 'stations') {
        $sql = 'SELECT nom, pays, lat, lon, alt, debut, fin FROM stations WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?';
        if ($from !== null) { $sql .= ' AND (fin IS NULL OR fin >= ?)'; $args[] = $from; }
        if ($to !== null) { $sql .= ' AND (debut IS NULL OR debut <= ?)'; $args[] = $to; }
        if ($text !== '') { $sql .= ' AND nom LIKE ?'; $args[] = '%' . $text . '%'; }
        $st = $pdo->prepare($sql . ' LIMIT ' . $limit); $st->execute($args);
        $rows = array_map(static fn($r) => ['name' => (string) $r['nom'], 'year' => $r['debut'] !== null ? (int) $r['debut'] : null, 'to' => $r['fin'] !== null ? (int) $r['fin'] : null,
            'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'cat' => (string) $r['pays']], $st->fetchAll());
        return ['installed' => true, 'rows' => $rows, 'source' => 'Stations météo — pack météo (sources dans Réglages)'];
    }
    // GOV : un nom par lieu (le plus récent), dans le cadre
    $sql = 'SELECT o.id, o.lat, o.lon, (SELECT n.name FROM name n WHERE n.obj=o.id ORDER BY COALESCE(n.y2, 9999) DESC LIMIT 1) AS name,
        (SELECT MIN(COALESCE(t.y1, t.yr)) FROM typ t WHERE t.obj=o.id) AS y1, (SELECT MAX(COALESCE(t.y2, t.yr)) FROM typ t WHERE t.obj=o.id) AS y2
        FROM obj o WHERE o.lat BETWEEN ? AND ? AND o.lon BETWEEN ? AND ?';
    if ($text !== '') { $sql .= ' AND EXISTS (SELECT 1 FROM name n WHERE n.obj=o.id AND n.name LIKE ?)'; $args[] = '%' . $text . '%'; }
    $st = $pdo->prepare($sql . ' LIMIT ' . $limit); $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        if ($from !== null && $r['y2'] !== null && (int) $r['y2'] < $from) { continue; }
        if ($to !== null && $r['y1'] !== null && (int) $r['y1'] > $to) { continue; }
        $rows[] = ['name' => (string) $r['name'], 'year' => $r['y1'] !== null ? (int) $r['y1'] : null, 'to' => $r['y2'] !== null ? (int) $r['y2'] : null, 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon'], 'cat' => ''];
    }
    return ['installed' => true, 'rows' => $rows, 'source' => 'GOV — Genealogical Gazetteer (Verein für Computergenealogie), CC BY-SA 3.0'];
}

/* ═════════ les entrées de api.php ═════════ */

function terr_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'terr_list' => ['territories' => terr_list($pdo, !empty($q['full']))],
        'terr_get' => ['territory' => terr_get($pdo, (int) ($q['id'] ?? 0))],
        'terr_places' => ['places' => terr_places($pdo)],
        'carto_packs' => ['packs' => array_keys(carto_packs())],
        'carto_pack_rows' => carto_pack_rows($q),
        default => terr_bad('Action inconnue.'),
    };
}

function terr_api_post(PDO $pdo, string $action, array $p): array
{
    return match ($action) {
        'terr_save' => terr_save($pdo, is_array($p['territory'] ?? null) ? $p['territory'] : []),
        'terr_delete' => terr_delete($pdo, (int) ($p['id'] ?? 0)),
        'terr_restore' => terr_restore($pdo, is_array($p['territory'] ?? null) ? $p['territory'] : []),
        default => terr_bad('Action inconnue.'),
    };
}
