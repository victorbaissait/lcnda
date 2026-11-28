<?php
declare(strict_types=1);
/**
 * 🏘️ Lieux-dits, ⛪ patrimoine et 📜 anciens noms d'une commune (assets/js/heritage-lieux-patrimoine.js).
 *
 *  · 📜 Anciens noms : livrés avec l'app, assets/data/dicotopo/DTxx.json.gz (un fichier par département couvert, lu à la demande ;
 *    scripts/lieux-patrimoine/build-dicotopo.py). Source : DicoTopo, Dictionnaire topographique de la France (CTHS, Archives
 *    nationales, École nationale des chartes), dicotopo.cths.fr — Licence Ouverte 2.0.
 *  · 🏘️ Lieux-dits (IGN BD TOPO®) et ⛪ Monuments historiques (Mérimée) + objets (Palissy) : des PACKS par département,
 *    téléchargés en un bouton depuis la version « lieux-patrimoine-donnees » du dépôt GitHub (manifeste
 *    lieux-patrimoine-manifest.json, fabriqués par scripts/lieux-patrimoine/build-packs.py dans .github/workflows/lieux-patrimoine.yml),
 *    par tranches, reprise, vérifiés (en-tête LCLIEUX1, taille, sha256, base lisible) avant d'être rangés dans
 *    <dossier des données>/lieux-patrimoine/<sorte>-<département>.sqlite. Même façon que la météo (lib/meteo_dl.php).
 *  · Rien n'est écrit dans la généalogie : lecture seule. Essais : GENEALOGY_TEST=1 + LCNDA_TEST_LP_DIR (un dossier à la place de GitHub).
 */

const LP_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/lieux-patrimoine-donnees/';
const LP_DL_STEP = 16 * 1024 * 1024;
const LP_HEADER_SIZE = 4096;
const LP_PACK_MAX = 256 * 1024 * 1024; // un pack fait 0,1 à 3 Mo : au-delà, ce n'en est pas un
const LP_KINDS = ['lieuxdits' => ['lieux', 'communes'], 'patrimoine' => ['objets']];
const LP_DICO_URL = 'https://dicotopo.cths.fr';
const LP_SOURCES_INFO = [
    'dicotopo' => ['DicoTopo — Dictionnaire topographique de la France', 'Anciens noms des lieux : formes anciennes datées, avec leur source, pour les départements dont le dictionnaire est publié', 'Livré avec l’app', 'Licence Ouverte 2.0 (équivalente à CC BY 4.0)', 'DicoTopo, Dictionnaire topographique de la France — Comité des travaux historiques et scientifiques (CTHS), Archives nationales (Centre d’onomastique), École nationale des chartes', 'https://dicotopo.cths.fr'],
    'bdtopo' => ['IGN — BD TOPO®', 'Lieux-dits habités (hameaux, fermes, moulins…) et non habités, avec leur position', 'Pack « Lieux-dits » de chaque département', 'Licence Ouverte Etalab 2.0', '© IGN – BD TOPO®', 'https://www.data.gouv.fr/datasets/bd-topo-r'],
    'adminexpress' => ['IGN — ADMIN EXPRESS COG', 'Noms et codes des communes', 'Pack « Lieux-dits » de chaque département', 'Licence Ouverte Etalab 2.0', '© IGN – ADMIN EXPRESS', 'https://geoservices.ign.fr/adminexpress'],
    'merimee' => ['Ministère de la Culture — base Mérimée', 'Immeubles protégés au titre des Monuments historiques (églises, châteaux, croix…)', 'Pack « Patrimoine » de chaque département', 'Licence Ouverte 2.0', 'Ministère de la Culture, POP : plateforme ouverte du patrimoine — base Mérimée', 'https://www.data.gouv.fr/datasets/5af120e5b595087cfabcde81'],
    'palissy' => ['Ministère de la Culture — base Palissy', 'Objets protégés au titre des Monuments historiques (cloches, fonts baptismaux, tableaux, statues…)', 'Pack « Patrimoine » de chaque département', 'Licence Ouverte', 'Ministère de la Culture, POP : plateforme ouverte du patrimoine — base Palissy', 'https://www.data.gouv.fr/datasets/615bcdd729be9185b3b0681a'],
];

/* ═════════════════════════ Les fichiers ═════════════════════════ */

function lp_dir(): string { return SHARED_DATA_DIR . '/lieux-patrimoine'; }
function lp_dico_dir(): string { return (getenv('GENEALOGY_TEST') === '1' && getenv('LCNDA_TEST_DICOTOPO_DIR')) ? (string) getenv('LCNDA_TEST_DICOTOPO_DIR') : APP_ROOT . '/assets/data/dicotopo'; }

/** « lieuxdits-15 » → ['lieuxdits', '15'] (sinon une erreur : rien d'autre n'est accepté) */
function lp_key(string $key): array
{
    if (!preg_match('/^(lieuxdits|patrimoine)-(\d{2}|2A|2B|97\d)$/', $key, $m)) { throw new LcndaBadInput(i18n_t('Pack inconnu.')); }
    return [$m[1], $m[2]];
}

function lp_pack_path(string $key): string { lp_key($key); return lp_dir() . '/' . $key . '.sqlite'; }

function lp_pdo(string $key): ?PDO
{
    static $pool = [];
    $path = lp_pack_path($key);
    if (array_key_exists($path, $pool)) { return $pool[$path]; }
    if (!is_file($path)) { return null; } // pas gardé : il peut arriver pendant que l'app tourne
    try {
        $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $opts[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $pdo = new PDO('sqlite:' . $path, null, null, $opts);
        $pdo->query('SELECT 1 FROM meta LIMIT 1');
        return $pool[$path] = $pdo;
    } catch (Throwable) { return $pool[$path] = null; }
}

/** clé de comparaison d'un nom (même règle que fold() dans scripts/lieux-patrimoine/build-packs.py) */
function lp_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = str_replace(['œ', 'æ', '’'], ['oe', 'ae', "'"], $s);
    if (class_exists('Normalizer')) { $s = (string) Normalizer::normalize($s, Normalizer::FORM_D); $s = (string) preg_replace('/\p{Mn}+/u', '', $s); }
    else { $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ÿ' => 'y']); }
    $s = trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
    $s = (string) preg_replace('/^(le|la|les|l) /', '', $s);
    $s = (string) preg_replace('/\b(saint|st)\b/', 'st', $s);
    return (string) preg_replace('/\b(sainte|ste)\b/', 'ste', $s);
}

function lp_dep_names(): array
{
    if (!function_exists('world_dept_codes')) { require_once __DIR__ . '/monde_autour.php'; }
    static $names = null;
    if ($names !== null) { return $names; }
    $names = [];
    $list = 'Ain=01;Aisne=02;Allier=03;Alpes-de-Haute-Provence=04;Hautes-Alpes=05;Alpes-Maritimes=06;Ardèche=07;Ardennes=08;Ariège=09;Aube=10;Aude=11;Aveyron=12;Bouches-du-Rhône=13;Calvados=14;Cantal=15;Charente=16;Charente-Maritime=17;Cher=18;Corrèze=19;Corse-du-Sud=2A;Haute-Corse=2B;Côte-d’Or=21;Côtes-d’Armor=22;Creuse=23;Dordogne=24;Doubs=25;Drôme=26;Eure=27;Eure-et-Loir=28;Finistère=29;Gard=30;Haute-Garonne=31;Gers=32;Gironde=33;Hérault=34;Ille-et-Vilaine=35;Indre=36;Indre-et-Loire=37;Isère=38;Jura=39;Landes=40;Loir-et-Cher=41;Loire=42;Haute-Loire=43;Loire-Atlantique=44;Loiret=45;Lot=46;Lot-et-Garonne=47;Lozère=48;Maine-et-Loire=49;Manche=50;Marne=51;Haute-Marne=52;Mayenne=53;Meurthe-et-Moselle=54;Meuse=55;Morbihan=56;Moselle=57;Nièvre=58;Nord=59;Oise=60;Orne=61;Pas-de-Calais=62;Puy-de-Dôme=63;Pyrénées-Atlantiques=64;Hautes-Pyrénées=65;Pyrénées-Orientales=66;Bas-Rhin=67;Haut-Rhin=68;Rhône=69;Haute-Saône=70;Saône-et-Loire=71;Sarthe=72;Savoie=73;Haute-Savoie=74;Paris=75;Seine-Maritime=76;Seine-et-Marne=77;Yvelines=78;Deux-Sèvres=79;Somme=80;Tarn=81;Tarn-et-Garonne=82;Var=83;Vaucluse=84;Vendée=85;Vienne=86;Haute-Vienne=87;Vosges=88;Yonne=89;Territoire de Belfort=90;Essonne=91;Hauts-de-Seine=92;Seine-Saint-Denis=93;Val-de-Marne=94;Val-d’Oise=95;Guadeloupe=971;Martinique=972;Guyane=973;La Réunion=974;Mayotte=976';
    foreach (explode(';', $list) as $pair) { [$n, $c] = explode('=', $pair); $names[$c] = $n; }
    return $names;
}

/** le département d'un lieu de la base (code INSEE, code GeoNames, nom du département : lib/monde_autour.php) */
function lp_place_dep(array $pl): string
{
    if (!function_exists('world_place_dept')) { require_once __DIR__ . '/monde_autour.php'; }
    $d = world_place_dept($pl);
    if ($d !== '') { return $d; }
    $country = lp_fold((string) ($pl['country'] ?? ''));
    if ($country !== '' && !in_array($country, ['france', 'fr'], true)) { return ''; }
    // « Aurillac, Cantal » : le département écrit dans le nom
    $codes = world_dept_codes();
    foreach (array_slice(array_map('trim', explode(',', (string) ($pl['name'] ?? ''))), 1) as $part) { $f = world_fold($part); if (isset($codes[$f])) { return $codes[$f]; } }
    return '';
}

/** les départements des lieux de la famille (ceux qui servent dans un événement), le plus souvent cité d'abord */
function lp_user_deps(PDO $pdo): array
{
    $n = [];
    try {
        foreach ($pdo->query('SELECT pl.*, COUNT(e.id) AS n FROM places pl JOIN events e ON e.place_id=pl.id GROUP BY pl.id')->fetchAll(PDO::FETCH_ASSOC) as $pl) {
            $d = lp_place_dep($pl); if ($d !== '' && $d !== '20') { $n[$d] = ($n[$d] ?? 0) + (int) $pl['n']; }
        }
    } catch (Throwable) {}
    arsort($n);
    return array_map('strval', array_keys($n));
}

/* ═════════════════════════ 📜 DicoTopo (livré avec l'app) ═════════════════════════ */

function lp_dico_index(): array
{
    static $idx = null;
    if ($idx !== null) { return $idx; }
    $f = lp_dico_dir() . '/index.json';
    $idx = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    $idx += ['deps' => []];
    return $idx;
}

/** un département de DicoTopo : {dep, label, bibl, c: {insee: [nom, lon, lat, n° du lieu]}, p: [[id, nom, insee, description]], o: [[n°, forme, date, année, référence]]} */
function lp_dico(string $dep): ?array
{
    static $memo = [];
    if (!preg_match('/^(\d{2}|2A|2B|97\d)$/', $dep)) { return null; }
    if (array_key_exists($dep, $memo)) { return $memo[$dep]; }
    $f = lp_dico_dir() . "/DT$dep.json.gz";
    if (!is_file($f)) { return $memo[$dep] = null; }
    $d = json_decode((string) gzdecode((string) file_get_contents($f)), true);
    if (!is_array($d) || !is_array($d['p'] ?? null)) { return $memo[$dep] = null; }
    // les formes anciennes, rangées par lieu
    $by = [];
    foreach ($d['o'] ?? [] as $o) { $by[(int) $o[0]][] = $o; }
    $d['by'] = $by;
    if (count($memo) > 12) { array_shift($memo); }
    return $memo[$dep] = $d;
}

function lp_dico_place(array $d, int $i): array
{
    $p = $d['p'][$i];
    return ['id' => 'P' . $p[0], 'name' => (string) $p[1], 'insee' => (string) $p[2], 'desc' => (string) $p[3], 'url' => LP_DICO_URL . '/places/P' . $p[0],
        'old' => array_map(static fn($o) => ['label' => (string) $o[1], 'date' => (string) $o[2], 'year' => $o[3] === null ? null : (int) $o[3], 'ref' => (string) $o[4]], $d['by'][$i] ?? [])];
}

/** ce que DicoTopo dit d'une commune : ses anciens noms, et les lieux de la commune qui en ont */
function lp_dico_commune(string $insee, string $dep): array
{
    $idx = lp_dico_index();
    $info = $idx['deps'][$dep] ?? null;
    $base = ['covered' => (bool) $info, 'dep' => $dep, 'dep_label' => $info['label'] ?? (lp_dep_names()[$dep] ?? $dep), 'bibl' => $info['bibl'] ?? null, 'covered_deps' => array_map('strval', array_keys($idx['deps']))];
    if (!$info || $insee === '') { return $base + ['found' => false]; }
    $d = lp_dico($dep);
    if (!$d) { return $base + ['found' => false]; }
    $c = $d['c'][$insee] ?? null;
    $commune = $c && (int) $c[3] >= 0 ? lp_dico_place($d, (int) $c[3]) : null;
    $places = [];
    foreach ($d['p'] as $i => $p) {
        if ((string) $p[2] !== $insee || ($c && $i === (int) $c[3])) { continue; }
        $places[] = lp_dico_place($d, $i);
    }
    usort($places, static fn($a, $b) => (count($b['old']) <=> count($a['old'])) ?: strcmp(lp_fold($a['name']), lp_fold($b['name'])));
    return $base + ['found' => (bool) ($c || $places), 'commune' => $commune, 'commune_name' => $c[0] ?? '', 'places' => array_slice($places, 0, 400), 'places_total' => count($places)];
}

/* ═════════════════════════ La commune d'un lieu ═════════════════════════ */

function lp_in_ring(float $x, float $y, array $ring): bool
{
    $in = false; $n = count($ring);
    for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
        [$xi, $yi] = $ring[$i]; [$xj, $yj] = $ring[$j];
        if ((($yi > $y) !== ($yj > $y)) && ($x < ($xj - $xi) * ($y - $yi) / (($yj - $yi) ?: 1e-12) + $xi)) { $in = !$in; }
    }
    return $in;
}

/** la commune (code INSEE) d'un lieu : code GeoNames, contour communal qui contient le point, nom dans le département */
function lp_place_commune(PDO $pdo, array $pl): array
{
    $dep = lp_place_dep($pl);
    $a4 = strtoupper(trim((string) ($pl['admin4_code'] ?? '')));
    $country = lp_fold((string) ($pl['country'] ?? ''));
    $fr = $country === '' || in_array($country, ['france', 'fr'], true);
    if (!$fr) { return ['insee' => '', 'dep' => '', 'how' => 'abroad']; }
    if (preg_match('/^(\d{2}|2A|2B)\d{3}$/', $a4)) { return ['insee' => $a4, 'dep' => str_starts_with($a4, '97') ? substr($a4, 0, 3) : substr($a4, 0, 2), 'how' => 'insee']; }
    $lat = $pl['latitude'] ?? null; $lon = $pl['longitude'] ?? null;
    if (is_numeric($lat) && is_numeric($lon)) {
        try {
            $s = $pdo->prepare('SELECT insee_code, geometry_json FROM commune_contours WHERE min_lon<=? AND max_lon>=? AND min_lat<=? AND max_lat>=? LIMIT 40');
            $s->execute([(float) $lon, (float) $lon, (float) $lat, (float) $lat]);
            foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $g = json_decode((string) $r['geometry_json'], true); $g = $g['geometry'] ?? $g;
                $polys = ($g['type'] ?? '') === 'Polygon' ? [$g['coordinates'] ?? []] : (($g['type'] ?? '') === 'MultiPolygon' ? ($g['coordinates'] ?? []) : []);
                foreach ($polys as $poly) { if ($poly && lp_in_ring((float) $lon, (float) $lat, $poly[0])) { $c = (string) $r['insee_code']; return ['insee' => $c, 'dep' => substr($c, 0, 2), 'how' => 'contour']; } }
            }
        } catch (Throwable) {}
    }
    $key = lp_fold(trim(explode(',', (string) ($pl['name'] ?? ''))[0]));
    if ($key === '') { return ['insee' => '', 'dep' => $dep, 'how' => 'none']; }
    $hits = [];
    try {
        $s = $pdo->prepare('SELECT insee_code, name FROM commune_contours WHERE name=? COLLATE NOCASE LIMIT 20'); $s->execute([trim(explode(',', (string) ($pl['name'] ?? ''))[0])]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) { $hits[(string) $r['insee_code']] = true; }
    } catch (Throwable) {}
    foreach ($dep !== '' ? [$dep] : array_map('strval', array_keys(lp_dico_index()['deps'])) as $d) {
        if ($p = lp_pdo("lieuxdits-$d")) { $s = $p->prepare('SELECT insee FROM communes WHERE cle=?'); $s->execute([$key]); foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $c) { $hits[(string) $c] = true; } }
        if ($dep !== '' && ($dd = lp_dico($d))) { foreach ($dd['c'] as $insee => $c) { if (lp_fold((string) $c[0]) === $key) { $hits[(string) $insee] = true; } } }
    }
    if ($dep !== '') { $hits = array_filter($hits, static fn($v, $k) => str_starts_with((string) $k, $dep), ARRAY_FILTER_USE_BOTH); }
    if (count($hits) === 1) { $c = (string) array_key_first($hits); return ['insee' => $c, 'dep' => str_starts_with($c, '97') ? substr($c, 0, 3) : substr($c, 0, 2), 'how' => 'nom']; }
    return ['insee' => '', 'dep' => $dep, 'how' => count($hits) > 1 ? 'ambiguous' : 'none'];
}

/* ═════════════════════════ La fiche d'un lieu : ce que l'app sait de sa commune ═════════════════════════ */

function lp_lieuxdits(string $insee, string $dep): array
{
    $p = lp_pdo("lieuxdits-$dep");
    if (!$p) { return ['installed' => false, 'dep' => $dep]; }
    $s = $p->prepare('SELECT nom, nature, lat, lon, habite FROM lieux WHERE insee=? ORDER BY cle'); $s->execute([$insee]);
    $rows = $s->fetchAll();
    foreach ($rows as &$r) { $r['lat'] = $r['lat'] === null ? null : (float) $r['lat']; $r['lon'] = $r['lon'] === null ? null : (float) $r['lon']; $r['habite'] = (int) $r['habite']; }
    unset($r);
    $c = $p->prepare('SELECT nom FROM communes WHERE insee=?'); $c->execute([$insee]);
    return ['installed' => true, 'dep' => $dep, 'commune' => (string) ($c->fetchColumn() ?: ''), 'list' => $rows, 'fixture' => (bool) $p->query("SELECT value FROM meta WHERE key='fixture'")->fetchColumn()];
}

function lp_patrimoine(string $insee, string $dep, string $communeName = ''): array
{
    $p = lp_pdo("patrimoine-$dep");
    if (!$p) { return ['installed' => false, 'dep' => $dep]; }
    $s = $p->prepare('SELECT ref, base, nom, deno, commune, siecle, dates, protection, resume, edifice, vocable, lat, lon FROM objets WHERE insee=? ORDER BY base, nom'); $s->execute([$insee]);
    $rows = $s->fetchAll();
    if (!$rows && $communeName !== '') { $s = $p->prepare("SELECT ref, base, nom, deno, commune, siecle, dates, protection, resume, edifice, vocable, lat, lon FROM objets WHERE insee='' AND commune=? COLLATE NOCASE ORDER BY base, nom"); $s->execute([$communeName]); $rows = $s->fetchAll(); }
    foreach ($rows as &$r) { $r['url'] = 'https://pop.culture.gouv.fr/notice/' . ($r['base'] === 'palissy' ? 'palissy' : 'merimee') . '/' . rawurlencode((string) $r['ref']); }
    unset($r);
    return ['installed' => true, 'dep' => $dep, 'list' => $rows, 'fixture' => (bool) $p->query("SELECT value FROM meta WHERE key='fixture'")->fetchColumn()];
}

/** GET lp_place&id= (ou &insee=) → la commune, ses anciens noms (DicoTopo), ses lieux-dits et son patrimoine (packs) */
function lp_place_data(PDO $pdo, array $q): array
{
    $id = safe_int($q['id'] ?? 0); $pl = null;
    if ($id > 0) { $s = $pdo->prepare('SELECT * FROM places WHERE id=?'); $s->execute([$id]); $pl = $s->fetch(PDO::FETCH_ASSOC) ?: null; }
    $insee = strtoupper(trim((string) ($q['insee'] ?? '')));
    if (!preg_match('/^(\d{2}|2A|2B)\d{3}$/', $insee)) { $insee = ''; }
    if ($insee !== '') { $where = ['insee' => $insee, 'dep' => str_starts_with($insee, '97') ? substr($insee, 0, 3) : substr($insee, 0, 2), 'how' => 'insee']; }
    elseif ($pl) { $where = lp_place_commune($pdo, $pl); }
    else { return ['ok' => false, 'how' => 'none']; }
    $dep = (string) $where['dep']; $insee = (string) $where['insee'];
    $out = ['ok' => $insee !== '', 'place' => $pl ? ['id' => (int) $pl['id'], 'name' => (string) $pl['name']] : null, 'insee' => $insee, 'dep' => $dep, 'dep_name' => lp_dep_names()[$dep] ?? '', 'how' => $where['how']];
    if ($insee === '') { return $out; }
    $out['dicotopo'] = lp_dico_commune($insee, $dep);
    $out['lieuxdits'] = lp_lieuxdits($insee, $dep);
    $out['commune'] = $out['dicotopo']['commune_name'] ?? '' ?: ($out['lieuxdits']['commune'] ?? '') ?: (string) ($pl['name'] ?? '');
    $out['patrimoine'] = lp_patrimoine($insee, $dep, (string) $out['commune']);
    return $out;
}

/* ═════════════════════════ « Ce serait peut-être … » : un nom inconnu ═════════════════════════ */

/** GET lp_suggest&q=&deps=15,19 → les lieux-dits (packs) et les formes anciennes (DicoTopo) qui portent ce nom */
function lp_suggest_data(PDO $pdo, array $q): array
{
    $name = trim((string) ($q['q'] ?? ''));
    $name = mb_substr($name, 0, 120);
    $key = lp_fold($name);
    if (mb_strlen($key) < 3) { return ['q' => $name, 'guesses' => []]; }
    $deps = array_values(array_filter(array_map('strtoupper', array_map('trim', explode(',', (string) ($q['deps'] ?? '')))), static fn($d) => (bool) preg_match('/^(\d{2}|2A|2B|97\d)$/', $d)));
    if (!$deps) { $deps = array_slice(lp_user_deps($pdo), 0, 12); }
    $limit = max(1, min(30, safe_int($q['limit'] ?? 8)));
    $out = []; $seen = [];
    $add = static function (array $g) use (&$out, &$seen) { $k = $g['source'] . '|' . lp_fold($g['name']) . '|' . $g['insee']; if (isset($seen[$k])) { return; } $seen[$k] = true; $out[] = $g; };
    foreach ($deps as $dep) {
        // 📜 les formes anciennes de DicoTopo (et les noms d'aujourd'hui du dictionnaire)
        if ($d = lp_dico($dep)) {
            foreach ($d['o'] as $o) {
                if (lp_fold((string) $o[1]) !== $key) { continue; }
                $p = $d['p'][(int) $o[0]]; $c = $d['c'][(string) $p[2]] ?? null;
                $add(['source' => 'dicotopo', 'name' => (string) $p[1], 'old' => (string) $o[1], 'date' => (string) $o[2], 'year' => $o[3], 'ref' => (string) $o[4], 'insee' => (string) $p[2], 'commune' => (string) ($c[0] ?? ''), 'dep' => $dep, 'desc' => (string) $p[3], 'url' => LP_DICO_URL . '/places/P' . $p[0], 'lat' => $c[2] ?? null, 'lon' => $c[1] ?? null]);
            }
            foreach ($d['p'] as $p) {
                if (lp_fold((string) $p[1]) !== $key) { continue; }
                $c = $d['c'][(string) $p[2]] ?? null;
                $add(['source' => 'dicotopo', 'name' => (string) $p[1], 'old' => '', 'date' => '', 'year' => null, 'ref' => '', 'insee' => (string) $p[2], 'commune' => (string) ($c[0] ?? ''), 'dep' => $dep, 'desc' => (string) $p[3], 'url' => LP_DICO_URL . '/places/P' . $p[0], 'lat' => $c[2] ?? null, 'lon' => $c[1] ?? null]);
            }
        }
        // 🏘️ les lieux-dits de l'IGN
        if ($p = lp_pdo("lieuxdits-$dep")) {
            $s = $p->prepare('SELECT l.nom, l.nature, l.insee, l.lat, l.lon, c.nom AS commune FROM lieux l LEFT JOIN communes c ON c.insee=l.insee WHERE l.cle=? LIMIT 30'); $s->execute([$key]);
            foreach ($s->fetchAll() as $r) { $add(['source' => 'ign', 'name' => (string) $r['nom'], 'old' => '', 'date' => '', 'year' => null, 'ref' => '', 'insee' => (string) $r['insee'], 'commune' => (string) ($r['commune'] ?? ''), 'dep' => $dep, 'desc' => (string) $r['nature'], 'url' => '', 'lat' => $r['lat'] === null ? null : (float) $r['lat'], 'lon' => $r['lon'] === null ? null : (float) $r['lon']]); }
        }
        if (count($out) >= $limit * 3) { break; }
    }
    $names = lp_dep_names();
    foreach ($out as &$g) { $g['dep_name'] = $names[$g['dep']] ?? $g['dep']; }
    unset($g);
    return ['q' => $name, 'deps' => $deps, 'guesses' => array_slice($out, 0, $limit), 'more' => max(0, count($out) - $limit)];
}

/* ═════════════════════════ 📋 Listes (moteur commun LCNDA_EXT.dataLists) : filtrer côté serveur ═════════════════════════ */

/** « 2e moitié 12e siècle » → [1150, 1199] ; « 1810 » → [1810, 1810] ; « 17e siècle ; 18e siècle » → [1600, 1799] */
function lp_period(string ...$texts): array
{
    $from = null; $to = null;
    foreach ($texts as $t) {
        if (preg_match_all('/\b(\d{1,2})e\s+(?:s\.|siècle)/u', $t, $m)) { foreach ($m[1] as $c) { $c = (int) $c; if ($c < 1 || $c > 21) { continue; } $a = ($c - 1) * 100; $b = $a + 99;
            if (preg_match('/1(?:re|ère) moitié ' . $c . 'e/u', $t)) { $b = $a + 49; } elseif (preg_match('/2e moitié ' . $c . 'e/u', $t)) { $a += 50; }
            $from = $from === null ? $a : min($from, $a); $to = $to === null ? $b : max($to, $b); } }
        if (preg_match_all('/\b(1[0-9]{3}|[5-9][0-9]{2})\b/', $t, $m)) { foreach ($m[1] as $y) { $y = (int) $y; $from = $from === null ? $y : min($from, $y); $to = $to === null ? $y : max($to, $y); } }
        if ($from !== null) { break; } // la première colonne qui dit quelque chose
    }
    return [$from, $to];
}

function lp_km(float $a, float $b, float $c, float $d): float
{
    $r = M_PI / 180; $x = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
    return 6371 * 2 * asin(min(1.0, sqrt($x)));
}

/** une ligne passe-t-elle un filtre {key, op, value} ? */
function lp_row_match(array $row, array $f): bool
{
    $k = (string) ($f['key'] ?? ''); $op = (string) ($f['op'] ?? 'contains'); $v = $f['value'] ?? '';
    if ($k === '' || !array_key_exists($k, $row)) { return true; }
    $x = $row[$k];
    if (is_array($v)) { return in_array(lp_fold((string) $x), array_map(static fn($y) => lp_fold((string) $y), $v), true) !== ($op === '!=' || $op === 'not'); }
    $num = is_numeric($x) && is_numeric($v);
    return match ($op) {
        '=', 'eq', 'is' => $num ? (float) $x == (float) $v : lp_fold((string) $x) === lp_fold((string) $v),
        '!=', 'not', 'neq' => $num ? (float) $x != (float) $v : lp_fold((string) $x) !== lp_fold((string) $v),
        '>', 'gt' => $x !== null && $x !== '' && (float) $x > (float) $v,
        '>=', 'gte' => $x !== null && $x !== '' && (float) $x >= (float) $v,
        '<', 'lt' => $x !== null && $x !== '' && (float) $x < (float) $v,
        '<=', 'lte' => $x !== null && $x !== '' && (float) $x <= (float) $v,
        'starts', 'startsWith', '^' => str_starts_with(lp_fold((string) $x), lp_fold((string) $v)),
        'empty' => $x === null || $x === '',
        'notempty' => $x !== null && $x !== '',
        default => str_contains(lp_fold((string) $x), lp_fold((string) $v)),
    };
}

/** GET lp_list&kind=lieuxdits|merimee|palissy|dicotopo&query={q, filters, near:{lat,lon,km}, years:{from,to}, sort, dir, offset, limit} → {rows, total} */
function lp_list_data(array $q): array
{
    $kind = (string) ($q['kind'] ?? '');
    if (!in_array($kind, ['lieuxdits', 'merimee', 'palissy', 'dicotopo'], true)) { throw new LcndaBadInput(i18n_t('Liste inconnue.')); }
    $qq = json_decode((string) ($q['query'] ?? '{}'), true); $qq = is_array($qq) ? $qq : [];
    $text = lp_fold(mb_substr((string) ($qq['q'] ?? ''), 0, 120));
    $filters = array_values(array_filter(is_array($qq['filters'] ?? null) ? $qq['filters'] : [], 'is_array'));
    $near = is_array($qq['near'] ?? null) && is_numeric($qq['near']['lat'] ?? null) && is_numeric($qq['near']['lon'] ?? null) ? ['lat' => (float) $qq['near']['lat'], 'lon' => (float) $qq['near']['lon'], 'km' => max(0.1, min(500.0, (float) ($qq['near']['km'] ?? 10)))] : null;
    $years = is_array($qq['years'] ?? null) ? $qq['years'] : null;
    $yf = is_numeric($years['from'] ?? null) ? (int) $years['from'] : null; $yt = is_numeric($years['to'] ?? null) ? (int) $years['to'] : null;
    $offset = max(0, safe_int($qq['offset'] ?? 0)); $limit = max(1, min(2000, safe_int($qq['limit'] ?? 200)));
    // les départements à lire : un filtre « dep » s'il y en a un, sinon tous ceux installés (ou couverts par DicoTopo)
    $depWanted = [];
    foreach ($filters as $f) { if (($f['key'] ?? '') === 'dep') { foreach ((array) ($f['value'] ?? []) as $d) { $d = strtoupper(trim((string) $d)); if (preg_match('/^(\d{2}|2A|2B|97\d)$/', $d)) { $depWanted[] = $d; } } } }
    $packKind = $kind === 'lieuxdits' ? 'lieuxdits' : 'patrimoine';
    $deps = $kind === 'dicotopo' ? array_map('strval', array_keys(lp_dico_index()['deps']))
        : array_values(array_filter(array_map(static fn($f) => explode('-', basename($f, '.sqlite'), 2)[1] ?? '', glob(lp_dir() . "/$packKind-*.sqlite") ?: [])));
    if ($depWanted) { $deps = array_values(array_intersect($deps, $depWanted)); }
    $names = lp_dep_names(); $rows = []; $cap = 60000; $truncated = false;
    $bbox = $near ? [$near['lat'] - $near['km'] / 110.0, $near['lat'] + $near['km'] / 110.0, $near['lon'] - $near['km'] / (111.0 * max(0.2, cos(deg2rad($near['lat'])))), $near['lon'] + $near['km'] / (111.0 * max(0.2, cos(deg2rad($near['lat']))))] : null;
    foreach ($deps as $dep) {
        if ($kind === 'dicotopo') {
            $d = lp_dico($dep); if (!$d) { continue; }
            foreach ($d['o'] as $o) {
                $p = $d['p'][(int) $o[0]]; $c = $d['c'][(string) $p[2]] ?? null;
                if ($text !== '' && !str_contains(lp_fold($o[1] . ' ' . $p[1]), $text)) { continue; }
                if ($bbox && (!$c || $c[2] === null || $c[2] < $bbox[0] || $c[2] > $bbox[1] || $c[1] < $bbox[2] || $c[1] > $bbox[3])) { continue; }
                $rows[] = ['name' => (string) $o[1], 'date' => (string) $o[2], 'year' => $o[3] === null ? null : (int) $o[3], 'ref' => (string) $o[4], 'place' => (string) $p[1], 'desc' => (string) $p[3],
                    'commune' => (string) ($c[0] ?? ''), 'insee' => (string) $p[2], 'dep' => $dep, 'dep_name' => $names[$dep] ?? $dep, 'lat' => $c[2] ?? null, 'lon' => $c[1] ?? null, 'url' => LP_DICO_URL . '/places/P' . $p[0]];
                if (count($rows) >= $cap) { $truncated = true; break 2; }
            }
            continue;
        }
        $pdo = lp_pdo("$packKind-$dep"); if (!$pdo) { continue; }
        $w = []; $args = [];
        if ($kind === 'lieuxdits') { $sql = 'SELECT l.nom, l.nature, l.habite, l.insee, l.lat, l.lon, c.nom AS commune FROM lieux l LEFT JOIN communes c ON c.insee=l.insee'; $col = 'l.'; if ($text !== '') { $w[] = '(l.cle LIKE ? OR c.cle LIKE ?)'; $args[] = "%$text%"; $args[] = "%$text%"; } }
        else { $sql = 'SELECT * FROM objets'; $col = ''; $w[] = 'base=?'; $args[] = $kind; if ($text !== '') { $w[] = '(cle LIKE ? OR lower(deno) LIKE ? OR lower(commune) LIKE ?)'; array_push($args, "%$text%", "%$text%", "%$text%"); } }
        if ($bbox) { $w[] = "{$col}lat BETWEEN ? AND ? AND {$col}lon BETWEEN ? AND ?"; array_push($args, $bbox[0], $bbox[1], $bbox[2], $bbox[3]); }
        $s = $pdo->prepare($sql . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' LIMIT ' . ($cap - count($rows) + 1)); $s->execute($args);
        foreach ($s->fetchAll() as $r) {
            if ($kind === 'lieuxdits') { $rows[] = ['name' => (string) $r['nom'], 'nature' => (string) $r['nature'], 'habite' => (int) $r['habite'] ? i18n_t('habité') : i18n_t('non habité'), 'commune' => (string) ($r['commune'] ?? ''), 'insee' => (string) $r['insee'], 'dep' => $dep, 'dep_name' => $names[$dep] ?? $dep, 'lat' => $r['lat'] === null ? null : (float) $r['lat'], 'lon' => $r['lon'] === null ? null : (float) $r['lon']]; }
            else { [$a, $b] = lp_period((string) $r['dates'], (string) $r['siecle']); [$pa] = lp_period((string) $r['protection']);
                $rows[] = ['name' => (string) $r['nom'], 'deno' => (string) $r['deno'], 'siecle' => (string) $r['siecle'], 'dates' => (string) $r['dates'], 'from' => $a, 'to' => $b, 'protection' => (string) $r['protection'], 'protected' => $pa,
                    'edifice' => (string) $r['edifice'], 'resume' => (string) $r['resume'], 'commune' => (string) $r['commune'], 'insee' => (string) $r['insee'], 'dep' => $dep, 'dep_name' => $names[$dep] ?? $dep,
                    'lat' => $r['lat'] === null ? null : (float) $r['lat'], 'lon' => $r['lon'] === null ? null : (float) $r['lon'], 'ref' => (string) $r['ref'], 'url' => 'https://pop.culture.gouv.fr/notice/' . $kind . '/' . rawurlencode((string) $r['ref'])]; }
            if (count($rows) >= $cap) { $truncated = true; break 2; }
        }
    }
    // les filtres combinés, la distance exacte, les années
    $out = [];
    foreach ($rows as $r) {
        foreach ($filters as $f) { if (($f['key'] ?? '') !== 'dep' && !lp_row_match($r, $f)) { continue 2; } }
        if ($near) { if ($r['lat'] === null) { continue; } $r['km'] = round(lp_km($near['lat'], $near['lon'], (float) $r['lat'], (float) $r['lon']), 1); if ($r['km'] > $near['km']) { continue; } }
        if ($yf !== null || $yt !== null) {
            [$a, $b] = $kind === 'dicotopo' ? [$r['year'], $r['year']] : [$r['from'] ?? null, $r['to'] ?? null];
            if ($a === null || ($yt !== null && $a > $yt) || ($yf !== null && ($b ?? $a) < $yf)) { continue; }
        }
        $out[] = $r;
    }
    $sort = (string) ($qq['sort'] ?? ($near ? 'km' : 'name')); $dir = strtolower((string) ($qq['dir'] ?? 'asc')) === 'desc' ? -1 : 1;
    if ($out && array_key_exists($sort, $out[0])) { usort($out, static function ($a, $b) use ($sort, $dir) { $x = $a[$sort]; $y = $b[$sort]; if ($x === null || $x === '') { return 1; } if ($y === null || $y === '') { return -1; } return $dir * (is_numeric($x) && is_numeric($y) ? $x <=> $y : strcmp(lp_fold((string) $x), lp_fold((string) $y))); }); }
    return ['rows' => array_slice($out, $offset, $limit), 'total' => count($out), 'truncated' => $truncated, 'deps' => $deps];
}

/* ═════════════════════════ Réglages : ce qui est installé, les sources ═════════════════════════ */

function lp_status_data(PDO $pdo): array
{
    $packs = []; $removed = [];
    foreach (glob(lp_dir() . '/*.sqlite') ?: [] as $f) {
        $key = basename($f, '.sqlite');
        try { [$kind, $dep] = lp_key($key); } catch (Throwable) { continue; }
        $p = lp_pdo($key); $info = ['key' => $key, 'kind' => $kind, 'dep' => $dep, 'size' => (int) filesize($f), 'ok' => (bool) $p];
        if ($p) { try { $m = $p->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR); $info += ['count' => (int) ($m['count'] ?? 0), 'built' => (string) ($m['built'] ?? ''), 'fixture' => !empty($m['fixture'])]; } catch (Throwable) { $info['ok'] = false; } }
        $packs[$key] = $info;
    }
    foreach (glob(lp_dir() . '/*.sqlite.removed') ?: [] as $f) { $removed[] = basename($f, '.sqlite.removed'); }
    $idx = lp_dico_index(); $dsize = 0;
    foreach (array_map('strval', array_keys($idx['deps'])) as $d) { $dsize += (int) @filesize(lp_dico_dir() . "/DT$d.json.gz"); }
    return ['packs' => (object) $packs, 'removed' => $removed, 'wanted' => lp_user_deps($pdo), 'dep_names' => lp_dep_names(), 'pack_dir' => lp_dir(),
        'dicotopo' => ['deps' => (object) array_map(static fn($v) => ['label' => $v['label'] ?? '', 'places' => (int) ($v['places'] ?? 0), 'old' => (int) ($v['old'] ?? 0), 'size' => (int) ($v['size'] ?? 0)], $idx['deps']), 'size' => $dsize, 'built' => (string) ($idx['built'] ?? '')]];
}

function lp_about_data(): array
{
    $rows = [];
    foreach (LP_SOURCES_INFO as $id => [$nom, $what, $in, $lic, $mention, $url]) { $rows[] = compact('id', 'nom', 'what', 'in', 'mention', 'url') + ['licence' => $lic]; }
    return ['sources' => $rows];
}

/* ═════════════════════════ ⤓ Installer en un bouton (copie de lib/meteo_dl.php, pour la version « lieux-patrimoine-donnees ») ═════════════════════════ */

function lp_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput(i18n_t('Nom de fichier refusé.')); }
    $dir = (string) getenv('LCNDA_TEST_LP_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Pas encore en ligne : réessaie plus tard.')); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = LP_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, lieux-dits et patrimoine)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur des données.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Pas encore en ligne : réessaie plus tard.')); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion au serveur des données : {err}', ['err' => $err]) : i18n_t('Le serveur des données répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/** GET lp_dl_info → les packs en ligne (manifeste lieux-patrimoine-manifest.json, gardé une heure) */
function lp_dl_info(): array
{
    $cache = lp_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(lp_dl_get('lieux-patrimoine-manifest.json', null, 2 * 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des données en ligne est illisible.')); }
    $out = [];
    foreach ($m['packs'] as $key => $p) {
        try { lp_key((string) $key); } catch (Throwable) { continue; }
        if (!is_array($p['parts'] ?? null) || !$p['parts']) { continue; }
        $parts = []; $sum = 0;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { continue 2; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($sum !== (int) ($p['size'] ?? -1) || $sum > LP_PACK_MAX) { continue; }
        $out[$key] = ['size' => $sum, 'parts' => $parts, 'built' => (string) ($p['built'] ?? ''), 'count' => (int) ($p['count'] ?? 0)];
    }
    return ['version' => (string) ($m['version'] ?? ''), 'packs' => (object) $out];
}

function lp_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    $dir = lp_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des données impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST lp_dl_start {key} → {id, size} */
function lp_dl_start(array $data): array
{
    $key = (string) ($data['key'] ?? ''); lp_key($key);
    $p = ((array) lp_dl_info()['packs'])[$key] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Ce pack n’est pas encore en ligne.')); }
    foreach (glob(lp_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12)); $path = lp_upload_path($id);
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < 2 * $p['size'] + 20 * 1024 * 1024) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque.')); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['key' => $key, 'parts' => $p['parts']]));
    return ['id' => $id, 'size' => $p['size'], 'key' => $key];
}

/** POST lp_dl_step {id} → {received, size, done} : la tranche suivante (reprend où le fichier s'est arrêté) */
function lp_dl_step(array $data): array
{
    $path = lp_upload_path((string) ($data['id'] ?? ''));
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size'));
    if ($have >= $size) { return ['received' => $have, 'size' => $size, 'done' => true]; }
    $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + LP_DL_STEP - 1);
            $bytes = lp_dl_get($part['name'], [$from, $to], LP_DL_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
            clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}

function lp_dl_cancel(array $data): array
{
    $path = lp_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

function lp_dl_resume(string $id): array
{
    $path = lp_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta)) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'key' => $meta['key'], 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}

/** POST lp_pack_finish {id} → vérifie (en-tête LCLIEUX1, taille, empreinte, base lisible du bon schéma) puis range le pack */
function lp_pack_finish(array $data): array
{
    $path = lp_upload_path((string) ($data['id'] ?? ''));
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    try {
        $f = fopen($path, 'rb'); $head = (string) fread($f, LP_HEADER_SIZE); fclose($f);
        if (!str_starts_with($head, "LCLIEUX1\n")) { throw new RuntimeException(i18n_t('Ce n’est pas un pack « Lieux-dits et patrimoine » de LCNDA.')); }
        $hd = json_decode(trim(substr($head, 9)), true);
        $key = is_array($hd) ? ($hd['kind'] ?? '') . '-' . ($hd['dep'] ?? '') : '';
        try { [$kind] = lp_key($key); } catch (Throwable) { throw new RuntimeException(i18n_t('En-tête du pack abîmé.')); }
        if (!preg_match('/^[0-9a-f]{64}$/', (string) ($hd['sha256'] ?? '')) || (is_array($meta) && ($meta['key'] ?? '') !== $key)) { throw new RuntimeException(i18n_t('En-tête du pack abîmé.')); }
        clearstatcache(true, $path);
        if (filesize($path) - LP_HEADER_SIZE !== (int) ($hd['size'] ?? -1)) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        $target = lp_pack_path($key); $tmp = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $in = fopen($path, 'rb'); fseek($in, LP_HEADER_SIZE); $out = fopen($tmp, 'wb'); $ctx = hash_init('sha256');
        while (!feof($in)) { $buf = fread($in, 1 << 20); if ($buf === false || $buf === '') { break; } hash_update($ctx, $buf); fwrite($out, $buf); }
        fclose($in); fclose($out);
        if (!hash_equals((string) $hd['sha256'], hash_final($ctx))) { @unlink($tmp); throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        try {
            $f = fopen($tmp, 'rb'); $magic = (string) fread($f, 16); fclose($f);
            if ($magic !== "SQLite format 3\0") { throw new RuntimeException('pas une base'); }
            $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
            if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $opts[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
            $t = new PDO('sqlite:' . $tmp, null, null, $opts);
            $m = $t->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            if (($m['kind'] ?? '') !== $kind || ($m['dep'] ?? '') !== (string) $hd['dep'] || (int) ($m['format'] ?? 0) !== 1) { throw new RuntimeException('sorte'); }
            $tables = $t->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
            if (array_diff(array_merge(['meta', 'sources'], LP_KINDS[$kind]), $tables)) { throw new RuntimeException('schéma'); }
            $t = null;
        } catch (Throwable) { @unlink($tmp); throw new RuntimeException(i18n_t('Le pack ne peut pas être lu : rien n’a été installé.')); }
        $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($tmp, $target)) { @unlink($tmp); if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Pack impossible à ranger.')); }
        @unlink($target . '.removed');
        return ['key' => $key, 'kind' => $kind, 'dep' => (string) $hd['dep'], 'count' => (int) ($hd['count'] ?? 0), 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST lp_pack_undo {key} → défait la dernière installation (remet le pack d'avant, ou retire le nouveau) */
function lp_pack_undo(array $data): array
{
    $target = lp_pack_path((string) ($data['key'] ?? ''));
    if (is_file($target . '.prev')) { @unlink($target); @rename($target . '.prev', $target); return ['restored' => true]; }
    if (is_file($target)) { @unlink($target); }
    return ['removed' => true];
}

/** POST lp_pack_remove {key} → mis de côté (« ↶ Annuler » : lp_pack_restore) */
function lp_pack_remove(array $data): array
{
    $target = lp_pack_path((string) ($data['key'] ?? ''));
    if (!is_file($target)) { throw new RuntimeException(i18n_t('Ce pack n’est pas installé.')); }
    @unlink($target . '.removed');
    if (!@rename($target, $target . '.removed')) { throw new RuntimeException(i18n_t('Pack impossible à retirer.')); }
    return ['ok' => true, 'key' => basename($target, '.sqlite')];
}

function lp_pack_restore(array $data): array
{
    $target = lp_pack_path((string) ($data['key'] ?? ''));
    if (!is_file($target . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($target)) { throw new RuntimeException(i18n_t('Un autre pack a été installé entre-temps.')); }
    @rename($target . '.removed', $target);
    return ['ok' => true];
}

/* ═════════════════════════ Aiguillage (api.php) ═════════════════════════ */

function lp_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'lp_status' => lp_status_data($pdo),
        'lp_about' => lp_about_data(),
        'lp_place' => lp_place_data($pdo, $q),
        'lp_suggest' => lp_suggest_data($pdo, $q),
        'lp_list' => lp_list_data($q),
        // sans internet (ou rien encore en ligne) : une réponse normale qui le dit, pas une erreur du serveur
        'lp_dl_info' => (static function () { try { return lp_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'packs' => (object) [], 'offline' => true, 'error' => $e->getMessage()]; } })(),
        'lp_dl_resume' => lp_dl_resume((string) ($q['id'] ?? '')),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

function lp_api_post(string $action, array $data): array
{
    return match ($action) {
        'lp_dl_start' => lp_dl_start($data),
        'lp_dl_step' => lp_dl_step($data),
        'lp_dl_cancel' => lp_dl_cancel($data),
        'lp_pack_finish' => lp_pack_finish($data),
        'lp_pack_undo' => lp_pack_undo($data),
        'lp_pack_remove' => lp_pack_remove($data),
        'lp_pack_restore' => lp_pack_restore($data),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
