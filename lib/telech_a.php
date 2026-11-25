<?php
declare(strict_types=1);

/**
 * 🗺 Voir le village tel qu'il était (téléchargements, lot A). Écran : assets/js/heritage-telech-a.js (style : assets/css/telech-a.css).
 * Ce qui existait déjà n'est pas refait (voir docs/telechargements-lot-a.md) : carte d'État-major (fond « etatmajor »), photos de
 * 1950 (lot 10), carte géologique (fond « brgm_geol », roche des communes), cavités (lot 10), rivières (Métiers et rivières),
 * Base Adresse Nationale par département (Plan des adresses). Ici, seulement :
 *  - 🌾 ce qu'est devenue la terre autour du village : CORINE Land Cover 1990 et 2018 (Copernicus ; tuiles WMTS de la
 *    Géoplateforme, couches LANDCOVER.CLC90_FR et LANDCOVER.CLC18_FR), lues pixel par pixel autour du lieu (1 km ; 3 km pour la
 *    mer et les marais), comme les forêts du lot 10. Rien ne part pour une fiche confidentielle ou une personne vivante (pid).
 *    Licence : Copernicus Land Monitoring Service, accès « free, full and open » (règlement (UE) 1159/2013), source à citer.
 *  - 🗺 cartes OpenStreetMap HORS LIGNE par région : un pack .mbtiles (tuiles vectorielles, schéma OpenMapTiles) fabriqué par
 *    .github/workflows/telech-a-osm.yml (extrait Geofabrik → tilemaker) et déposé dans la version « telech-a-osm » du dépôt ;
 *    téléchargé par tranches (Réglages → 🗂 Données), vérifié (taille, sha256, base lisible), puis dessiné ICI en SVG
 *    (GET telech_a_osm_tile&z=&x=&y=) : sans Internet. Hors des régions installées : le fond hors ligne de l'app (Natural Earth).
 *    Licence : ODbL 1.0, « © les contributeurs d'OpenStreetMap » ; schéma OpenMapTiles (CC BY 4.0).
 * GET  telech_a_clc&lat=&lon=[&pid=][&cached_only=1] · telech_a_list · telech_a_about · telech_a_osm_status · telech_a_osm_dl_info
 *      telech_a_osm_dl_resume&id= · telech_a_osm_tile&z=&x=&y=
 * POST telech_a_osm_dl_start {key} · _dl_step {id} · _dl_cancel {id} · telech_a_osm_pack_finish {id} · telech_a_osm_pack_undo {key}
 *      telech_a_osm_pack_remove {key} · telech_a_osm_pack_restore {key} · telech_a_cache_clear
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_TELECHA_DIR (un fichier <étape> par appel ; absent = hors ligne ; le pack OSM : ses fichiers).
 */

require_once __DIR__ . '/lot10_voir_village.php'; // l10v_private, l10v_point, l10v_tile_of

const TA_UA = 'LCNDA-genealogie/1.0 (application de bureau ; recherche a la demande ; https://github.com/victorbaissait/lcnda)';
const TA_WMTS = 'https://data.geopf.fr/wmts';
const TA_CLC_STYLE = 'CORINE Land Cover - France métropolitaine';
const TA_CLC_LAYERS = ['1990' => 'LANDCOVER.CLC90_FR', '2018' => 'LANDCOVER.CLC18_FR'];
const TA_READ = '2026-11-25';
const TA_OSM_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/telech-a-osm/';
const TA_OSM_STEP = 16 * 1024 * 1024;
const TA_OSM_MAX = 3 * 1024 * 1024 * 1024;
/** les régions proposées (extraits Geofabrik : régions historiques françaises + voisins) ; le pack en ligne dit sa propre étiquette */
const TA_OSM_REGIONS = [
    'alsace' => 'Alsace', 'aquitaine' => 'Aquitaine', 'auvergne' => 'Auvergne', 'basse-normandie' => 'Basse-Normandie', 'bourgogne' => 'Bourgogne',
    'bretagne' => 'Bretagne', 'centre' => 'Centre', 'champagne-ardenne' => 'Champagne-Ardenne', 'corse' => 'Corse', 'franche-comte' => 'Franche-Comté',
    'haute-normandie' => 'Haute-Normandie', 'ile-de-france' => 'Île-de-France', 'languedoc-roussillon' => 'Languedoc-Roussillon', 'limousin' => 'Limousin',
    'lorraine' => 'Lorraine', 'midi-pyrenees' => 'Midi-Pyrénées', 'nord-pas-de-calais' => 'Nord-Pas-de-Calais', 'pays-de-la-loire' => 'Pays de la Loire',
    'picardie' => 'Picardie', 'poitou-charentes' => 'Poitou-Charentes', 'provence-alpes-cote-d-azur' => 'Provence-Alpes-Côte d’Azur', 'rhone-alpes' => 'Rhône-Alpes',
    'belgium' => 'Belgique', 'luxembourg' => 'Luxembourg', 'switzerland' => 'Suisse', 'monaco' => 'Monaco'];

/* ═════════════════════ réseau et réponses gardées ═════════════════════ */

function ta_dir(string $sub = '', bool $create = false): string
{
    $d = rtrim((string) (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : sys_get_temp_dir()), '/') . '/telech-a' . ($sub !== '' ? '/' . $sub : '');
    if ($create && !is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}
function ta_test_dir(): string { return getenv('GENEALOGY_TEST') === '1' ? (string) getenv('LCNDA_TEST_TELECHA_DIR') : ''; }

/** une tuile (ou un petit fichier) de la Géoplateforme ; en essai : le fichier <étape> du dossier d'essai */
function ta_http(string $step, string $url): string
{
    $step = (string) preg_replace('/[^A-Za-z0-9_.-]/', '', $step);
    if (($dir = ta_test_dir()) !== '') {
        @file_put_contents($dir . '/calls.log', $step . ' ' . $url . "\n", FILE_APPEND);
        if (!is_file($dir . '/' . $step)) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
        return (string) file_get_contents($dir . '/' . $step);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Recherche impossible : PHP n’a pas l’extension curl.')); }
    if (strtolower((string) parse_url($url, PHP_URL_HOST)) !== 'data.geopf.fr' || !str_starts_with($url, 'https://')) { throw new RuntimeException('Adresse refusée.'); }
    static $last = 0.0;
    $wait = 0.15 - (microtime(true) - $last); if ($wait > 0) { usleep((int) ($wait * 1e6)); }
    $body = ''; $too = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => TA_UA,
        CURLOPT_WRITEFUNCTION => static function ($c, $chunk) use (&$body, &$too) { $body .= $chunk; if (strlen($body) > 4_000_000) { $too = true; return 0; } return strlen($chunk); }] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    unset($ch); $last = microtime(true);
    if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
    if ($code === 0) { throw new RuntimeException(i18n_t('Pas de connexion à Internet : réessaie quand tu seras connecté.')); }
    if ($code === 429 || $code >= 500) { throw new RuntimeException(i18n_t('Le site est très demandé en ce moment : réessaie dans une minute.')); }
    if ($code === 404 || $code === 400) { return ''; } // hors de la couche (mer, frontière) : une tuile vide
    if ($code < 200 || $code >= 300) { throw new RuntimeException(i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
    $rec = (string) getenv('LCNDA_TELECHA_RECORD');
    if ($rec !== '' && is_dir($rec)) { @file_put_contents($rec . '/' . $step, $body); }
    return $body;
}

function ta_cached(string $key, callable $make, bool $only = false): array
{
    $f = ta_dir('cache') . '/' . sha1($key) . '.json';
    if (is_file($f)) { $j = json_decode((string) @file_get_contents($f), true); if (is_array($j) && isset($j['data'])) { return $j['data'] + ['cached' => true, 'fetched_at' => (int) $j['at']]; } }
    if ($only) { return ['ok' => true, 'notcached' => true]; }
    try { $data = $make(); }
    catch (Throwable $e) { return ['ok' => false, 'offline' => true, 'message' => $e->getMessage()]; }
    @file_put_contents(ta_dir('cache', true) . '/' . sha1($key) . '.json', json_encode(['key' => $key, 'at' => time(), 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $data + ['cached' => false, 'fetched_at' => time()];
}

/* ═════════════════════ 🌾 CORINE Land Cover 1990 → 2018 ═════════════════════ */

/** les 44 postes de la nomenclature CORINE et leur couleur officielle (légende CLC_FR de la Géoplateforme = palette de l'AEE) */
const TA_CLC = [
    111 => [0xe6004d, 'urbain'], 112 => [0xff0000, 'urbain'], 121 => [0xcc4df2, 'urbain'], 122 => [0xcc0000, 'urbain'], 123 => [0xe6cccc, 'urbain'], 124 => [0xe6cce6, 'urbain'],
    131 => [0xa600cc, 'carrieres'], 132 => [0xa64d00, 'urbain'], 133 => [0xff4dff, 'urbain'], 141 => [0xffa6ff, 'urbain'], 142 => [0xffe6ff, 'urbain'],
    211 => [0xffffa8, 'champs'], 212 => [0xffff00, 'champs'], 213 => [0xe6e600, 'champs'], 221 => [0xe68000, 'vignes'], 222 => [0xf2a64d, 'vignes'], 223 => [0xe6a600, 'vignes'],
    231 => [0xe6e64d, 'pres'], 241 => [0xffe6a6, 'mosaique'], 242 => [0xffe64d, 'mosaique'], 243 => [0xe6cc4d, 'mosaique'], 244 => [0xf2cca6, 'mosaique'],
    311 => [0x80ff00, 'bois'], 312 => [0x00a600, 'bois'], 313 => [0x4dff00, 'bois'], 321 => [0xccf24d, 'landes'], 322 => [0xa6ff80, 'landes'], 323 => [0xa6e64d, 'landes'], 324 => [0xa6f200, 'landes'],
    331 => [0xe6e6e6, 'nu'], 332 => [0xcccccc, 'nu'], 333 => [0xccffcc, 'nu'], 334 => [0x000000, 'nu'], 335 => [0xa6e6cc, 'nu'],
    411 => [0xa6a6ff, 'marais'], 412 => [0x4d4dff, 'marais'], 421 => [0xccccff, 'marais_mer'], 422 => [0xe6e6ff, 'marais_mer'], 423 => [0xa6a6e6, 'marais_mer'],
    511 => [0x00ccf2, 'eau'], 512 => [0x80f2e6, 'eau'], 521 => [0x00ffa6, 'mer'], 522 => [0xa6ffe6, 'mer'], 523 => [0xe6f2ff, 'mer']];

/** le poste CORINE d'une couleur (0 = transparent ou couleur inconnue, un bord lissé par exemple) */
function ta_clc_code(int $r, int $g, int $b, int $alpha): int
{
    static $memo = [];
    if ($alpha > 63) { return 0; }
    $k = ($r << 16) | ($g << 8) | $b;
    if (isset($memo[$k])) { return $memo[$k]; }
    $best = 0; $bd = 12 * 12 * 3;
    foreach (TA_CLC as $code => [$c]) {
        $d = ($r - (($c >> 16) & 255)) ** 2 + ($g - (($c >> 8) & 255)) ** 2 + ($b - ($c & 255)) ** 2;
        if ($d < $bd) { $bd = $d; $best = $code; }
    }
    if (count($memo) > 5000) { $memo = []; }
    return $memo[$k] = $best;
}
function ta_clc_url(string $layer, int $z, int $x, int $y): string
{
    return TA_WMTS . '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' . rawurlencode($layer) . '&STYLE=' . rawurlencode(TA_CLC_STYLE) . '&TILEMATRIXSET=PM&TILEMATRIX=' . $z . '&TILECOL=' . $x . '&TILEROW=' . $y . '&FORMAT=image%2Fpng';
}

/**
 * Les pixels CORINE autour d'un point, pour une année : [codes à moins de 1 km => nombre, à moins de 3 km => nombre, mètres par pixel].
 * $tile($year, $x, $y) donne les octets PNG d'une tuile (z = 12, ≈ 26 m par pixel en France : la plus petite surface de CORINE fait 25 ha).
 */
function ta_clc_sample(float $lat, float $lon, string $year, callable $tile, float $rIn = 1000.0, float $rOut = 3000.0): array
{
    $z = 12; [$fx, $fy] = l10v_tile_of($lat, $lon, $z);
    $tx = (int) floor($fx); $ty = (int) floor($fy); $px = ($fx - $tx) * 256; $py = ($fy - $ty) * 256;
    $mpp = 156543.03392 * cos(deg2rad($lat)) / (2 ** $z);
    $ri = $rIn / $mpp; $ro = $rOut / $mpp;
    $in = []; $out = []; $tiles = 0;
    $span = (int) ceil(($ro + 256) / 256);
    for ($dx = -$span; $dx <= $span; $dx++) {
        for ($dy = -$span; $dy <= $span; $dy++) {
            $cx = max($dx * 256, min($px, $dx * 256 + 256)); $cy = max($dy * 256, min($py, $dy * 256 + 256));
            if (hypot($cx - $px, $cy - $py) > $ro) { continue; }
            $bin = (string) $tile($year, $tx + $dx, $ty + $dy);
            $im = $bin !== '' ? @imagecreatefromstring($bin) : false; if (!$im) { continue; }
            $tiles++; $W = imagesx($im); $H = imagesy($im); $tc = imageistruecolor($im);
            for ($y = 0; $y < $H; $y++) {
                for ($x = 0; $x < $W; $x++) {
                    $d = hypot($dx * 256 + $x - $px, $dy * 256 + $y - $py); if ($d > $ro) { continue; }
                    $c = imagecolorat($im, $x, $y);
                    if ($tc) { $code = ta_clc_code(($c >> 16) & 255, ($c >> 8) & 255, $c & 255, ($c >> 24) & 127); }
                    else { $a = imagecolorsforindex($im, $c); $code = ta_clc_code($a['red'], $a['green'], $a['blue'], $a['alpha']); }
                    if (!$code) { continue; }
                    $out[$code] = ($out[$code] ?? 0) + 1;
                    if ($d <= $ri) { $in[$code] = ($in[$code] ?? 0) + 1; }
                }
            }
            imagedestroy($im);
        }
    }
    ksort($in); ksort($out);
    return [$in, $out, $mpp, $tiles];
}
/** nombres par poste → % par groupe (« champs », « bois »…), arrondis */
function ta_clc_groups(array $counts): array
{
    $tot = array_sum($counts); if (!$tot) { return []; }
    $g = [];
    foreach ($counts as $code => $n) { $k = TA_CLC[$code][1] ?? ''; if ($k !== '') { $g[$k] = ($g[$k] ?? 0) + $n; } }
    arsort($g);
    return array_map(static fn($n) => round($n * 100 / $tot, 1), $g);
}
/** le calcul complet (sans réseau si $tile est donné) */
function ta_clc_calc(float $lat, float $lon, ?callable $tile = null): array
{
    $tile ??= static fn(string $year, int $x, int $y) => ta_http("clc$year-$x-$y.png", ta_clc_url(TA_CLC_LAYERS[$year], 12, $x, $y));
    $res = []; $tiles = 0;
    foreach (array_keys(TA_CLC_LAYERS) as $year) {
        [$in, $out, $mpp, $n] = ta_clc_sample($lat, $lon, (string) $year, $tile);
        $tiles += $n; $ha = $mpp * $mpp / 10000;
        $wet = 0; $coast = 0; foreach ($out as $code => $c) { if (TA_CLC[$code][1] === 'marais') { $wet += $c; } // marais et tourbières de l'intérieur (les vasières de la côte changent de poste d'un inventaire à l'autre) if (in_array($code, [331, 421, 422, 423, 521, 522, 523], true)) { $coast += $c; } }
        $quarry = 0; foreach ($out as $code => $c) { if ($code === 131) { $quarry += $c; } }
        $res[$year] = ['groups' => ta_clc_groups($in), 'codes' => $in, 'pixels' => array_sum($in), 'wet_ha' => round($wet * $ha, 1), 'coast_ha' => round($coast * $ha, 1), 'quarry_ha' => round($quarry * $ha, 1)];
    }
    $ok = ($res['1990']['pixels'] ?? 0) > 0 || ($res['2018']['pixels'] ?? 0) > 0;
    return ['ok' => true, 'empty' => !$ok, 'tiles' => $tiles, 'radius' => [1000, 3000], 'years' => $res,
        'coast' => max($res['1990']['coast_ha'] ?? 0, $res['2018']['coast_ha'] ?? 0) >= 20,
        'source' => ['label' => 'CORINE Land Cover 1990 et 2018 — Union européenne, Copernicus Land Monitoring Service (AEE) ; production France : SDES', 'licence' => 'Copernicus : accès libre, complet et gratuit, source à citer',
            'url' => 'https://www.statistiques.developpement-durable.gouv.fr/corine-land-cover-0', 'licence_url' => 'https://land.copernicus.eu/en/data-policy']];
}
function telech_a_clc(PDO $pdo, array $q): array
{
    if (l10v_private($pdo, $q)) { return l10v_private_msg(); }
    $pt = l10v_point($q);
    if (!$pt) { return ['ok' => true, 'nopoint' => true]; }
    if (!function_exists('imagecreatefromstring')) { return ['ok' => false, 'message' => i18n_t('PHP n’a pas l’extension gd : impossible de lire la carte CORINE.')]; }
    $key = sprintf('clc:%.3f,%.3f', $pt[0], $pt[1]); // ≈ 100 m : deux fiches du même village partagent la réponse
    return ta_cached($key, static fn() => ta_clc_calc($pt[0], $pt[1]) + ['lat' => $pt[0], 'lon' => $pt[1], 'name' => mb_substr(trim((string) ($q['name'] ?? '')), 0, 120)], !empty($q['cached_only'])) + ['lat' => $pt[0], 'lon' => $pt[1]];
}
/** les lieux déjà regardés (pour Listes) */
function telech_a_list(): array
{
    $rows = [];
    foreach (glob(ta_dir('cache') . '/*.json') ?: [] as $f) {
        $j = json_decode((string) @file_get_contents($f), true); $d = $j['data'] ?? null;
        if (!is_array($d) || !str_starts_with((string) ($j['key'] ?? ''), 'clc:') || !empty($d['empty']) || empty($d['years'])) { continue; }
        $a = $d['years']['1990']['groups'] ?? []; $b = $d['years']['2018']['groups'] ?? [];
        $rows[] = ['name' => (string) ($d['name'] ?? ''), 'lat' => $d['lat'] ?? null, 'lon' => $d['lon'] ?? null,
            'urbain1990' => (float) ($a['urbain'] ?? 0), 'urbain2018' => (float) ($b['urbain'] ?? 0), 'bois1990' => (float) ($a['bois'] ?? 0), 'bois2018' => (float) ($b['bois'] ?? 0),
            'agri1990' => round(($a['champs'] ?? 0) + ($a['pres'] ?? 0) + ($a['mosaique'] ?? 0) + ($a['vignes'] ?? 0), 1), 'agri2018' => round(($b['champs'] ?? 0) + ($b['pres'] ?? 0) + ($b['mosaique'] ?? 0) + ($b['vignes'] ?? 0), 1),
            'marais1990' => (float) ($d['years']['1990']['wet_ha'] ?? 0), 'marais2018' => (float) ($d['years']['2018']['wet_ha'] ?? 0), 'coast' => !empty($d['coast']), 'at' => date('Y-m-d', (int) ($j['at'] ?? 0))];
    }
    usort($rows, static fn($x, $y) => strcmp($x['name'], $y['name']));
    return ['rows' => $rows];
}
function telech_a_cache_clear(): array
{
    $n = 0; foreach (glob(ta_dir('cache') . '/*.json') ?: [] as $f) { if (@unlink($f)) { $n++; } }
    return ['ok' => true, 'removed' => $n];
}

/* ═════════════════════ 🗺 OpenStreetMap hors ligne : le pack ═════════════════════ */

function ta_osm_key(string $k): string { if (!preg_match('/^[a-z][a-z0-9-]{1,40}$/', $k)) { throw new LcndaBadInput('Région inconnue.'); } return $k; }
function ta_osm_path(string $key): string { return ta_dir('osm') . '/' . ta_osm_key($key) . '.mbtiles'; }
function ta_osm_open(string $file): ?PDO
{
    if (!is_file($file) || filesize($file) < 1024) { return null; }
    try {
        $o = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $o[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $x = new PDO('sqlite:' . $file, null, null, $o);
        $x->query('SELECT 1 FROM tiles LIMIT 1');
        return $x;
    } catch (Throwable) { return null; }
}
function ta_osm_meta(PDO $m): array
{
    $meta = [];
    try { $meta = $m->query('SELECT name, value FROM metadata')->fetchAll(PDO::FETCH_KEY_PAIR); } catch (Throwable) {}
    $b = array_map('floatval', explode(',', (string) ($meta['bounds'] ?? '-180,-85,180,85')));
    return ['bounds' => count($b) === 4 ? $b : [-180, -85, 180, 85], 'minzoom' => (int) ($meta['minzoom'] ?? 0), 'maxzoom' => (int) ($meta['maxzoom'] ?? 14),
        'built' => (string) ($meta['lcnda_built'] ?? ''), 'label' => (string) ($meta['lcnda_label'] ?? ($meta['name'] ?? '')), 'compression' => (string) ($meta['compression'] ?? 'gzip')];
}
/** les packs installés : [clé => [pdo, meta, size]] */
function ta_osm_installed(): array
{
    static $all = null;
    if ($all !== null) { return $all; }
    $all = [];
    foreach (glob(ta_dir('osm') . '/*.mbtiles') ?: [] as $f) {
        $k = basename($f, '.mbtiles'); $p = ta_osm_open($f); if (!$p) { continue; }
        $all[$k] = ['pdo' => $p, 'meta' => ta_osm_meta($p), 'size' => (int) filesize($f), 'date' => date('Y-m-d', (int) filemtime($f))];
    }
    return $all;
}
function telech_a_osm_status(): array
{
    $packs = [];
    foreach (ta_osm_installed() as $k => $v) { $packs[$k] = ['label' => $v['meta']['label'] ?: (TA_OSM_REGIONS[$k] ?? $k), 'built' => $v['meta']['built'] ?: $v['date'], 'size' => $v['size'], 'bounds' => $v['meta']['bounds'], 'maxzoom' => $v['meta']['maxzoom']]; }
    $removed = array_map(static fn($f) => basename($f, '.mbtiles.removed'), glob(ta_dir('osm') . '/*.mbtiles.removed') ?: []);
    return ['installed' => (bool) $packs, 'packs' => $packs, 'removed' => $removed, 'regions' => TA_OSM_REGIONS, 'dir' => ta_dir('osm')];
}

/** un fichier de la version GitHub « telech-a-osm » (ou du dossier d'essai) ; $range = [début, fin] */
function ta_osm_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    if (($dir = ta_test_dir()) !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Les cartes hors ligne ne sont pas encore en ligne : réessaie plus tard.')); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    $url = TA_OSM_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, cartes hors ligne)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Les cartes hors ligne ne sont pas encore en ligne : réessaie plus tard.')); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion : {err}', ['err' => $err]) : i18n_t('Le site répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}
/** GET telech_a_osm_dl_info → les packs en ligne {packs: {clé: {label, size, sha256, built, parts}}} */
function telech_a_osm_dl_info(): array
{
    $cache = ta_dir('envois') . '/manifest.json';
    $m = null;
    if (is_file($cache) && filemtime($cache) > time() - 3600 && ta_test_dir() === '') { $m = json_decode((string) file_get_contents($cache), true); }
    if (!is_array($m)) {
        $m = json_decode(ta_osm_get('telech-a-osm-manifest.json', null, 2 * 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des cartes hors ligne est illisible.')); }
    $out = [];
    foreach ($m['packs'] as $k => $p) {
        if (!is_string($k) || !preg_match('/^[a-z][a-z0-9-]{1,40}$/', $k) || !is_array($p) || !is_array($p['parts'] ?? null) || !$p['parts'] || !preg_match('/^[0-9a-f]{64}$/', (string) ($p['sha256'] ?? ''))) { continue; }
        $parts = []; $sum = 0; $ok = true;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { $ok = false; break; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($ok && $sum === (int) ($p['size'] ?? -1) && $sum <= TA_OSM_MAX) { $out[$k] = ['label' => mb_substr((string) ($p['label'] ?? (TA_OSM_REGIONS[$k] ?? $k)), 0, 80), 'size' => $sum, 'sha256' => (string) $p['sha256'], 'built' => (string) ($p['built'] ?? ''), 'parts' => $parts]; }
    }
    return ['version' => (string) ($m['version'] ?? ''), 'packs' => $out];
}
function ta_osm_upload(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Envoi inconnu.'); }
    $dir = ta_dir('envois', true);
    if (!is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des cartes hors ligne impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}
function telech_a_osm_dl_start(array $d): array
{
    $key = ta_osm_key((string) ($d['key'] ?? ''));
    $p = telech_a_osm_dl_info()['packs'][$key] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Cette région n’est pas encore en ligne : réessaie plus tard.')); }
    foreach (glob(ta_dir('envois') . '/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12)); $path = ta_osm_upload($id);
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < 2 * $p['size'] + 50 * 1024 * 1024) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque (il faut environ {n} Mo de libres).', ['n' => (string) ceil(2 * $p['size'] / 1e6)])); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['key' => $key, 'label' => $p['label'], 'built' => $p['built'], 'parts' => $p['parts'], 'sha256' => $p['sha256'], 'size' => $p['size']]));
    return ['id' => $id, 'size' => $p['size']];
}
function ta_osm_dl_meta(string $id): array
{
    $path = ta_osm_upload($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta) || !is_array($meta['parts'] ?? null)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    return [$path, $meta];
}
function telech_a_osm_dl_step(array $d): array
{
    [$path, $meta] = ta_osm_dl_meta((string) ($d['id'] ?? ''));
    @set_time_limit(0); clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size')); $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + TA_OSM_STEP - 1);
            $bytes = ta_osm_get($part['name'], [$from, $to], TA_OSM_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out); clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}
function telech_a_osm_dl_resume(string $id): array
{
    try { [$path, $meta] = ta_osm_dl_meta($id); } catch (Throwable) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}
function telech_a_osm_dl_cancel(array $d): array
{
    $path = ta_osm_upload((string) ($d['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}
/** vérifie (taille, empreinte, MBTiles lisible au bon format) puis range le pack ; l'ancien est gardé pour ↶ Annuler */
function telech_a_osm_pack_finish(array $d): array
{
    [$path, $meta] = ta_osm_dl_meta((string) ($d['id'] ?? ''));
    try {
        clearstatcache(true, $path);
        if (filesize($path) !== (int) $meta['size']) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        @set_time_limit(0);
        if (!hash_equals((string) $meta['sha256'], (string) hash_file('sha256', $path))) { throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        $t = ta_osm_open($path);
        $fmt = ''; try { $fmt = $t ? (string) $t->query("SELECT value FROM metadata WHERE name='format'")->fetchColumn() : ''; } catch (Throwable) {}
        $t = null;
        if ($fmt !== 'pbf') { throw new RuntimeException(i18n_t('Le pack ne peut pas être lu : rien n’a été installé.')); }
        $target = ta_osm_path((string) $meta['key']); @mkdir(dirname($target), 0775, true); $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($path, $target)) { if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Pack impossible à ranger.')); }
        @unlink($target . '.removed');
        return ['ok' => true, 'key' => $meta['key'], 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}
function telech_a_osm_pack_undo(array $d): array
{
    $t = ta_osm_path((string) ($d['key'] ?? ''));
    if (is_file($t . '.prev')) { @unlink($t); @rename($t . '.prev', $t); return ['restored' => true]; }
    @unlink($t);
    return ['removed' => true];
}
function telech_a_osm_pack_remove(array $d): array
{
    $t = ta_osm_path((string) ($d['key'] ?? ''));
    if (!is_file($t)) { throw new RuntimeException(i18n_t('Cette région n’est pas installée.')); }
    @unlink($t . '.removed');
    if (!@rename($t, $t . '.removed')) { throw new RuntimeException(i18n_t('Pack impossible à retirer.')); }
    return ['ok' => true];
}
function telech_a_osm_pack_restore(array $d): array
{
    $t = ta_osm_path((string) ($d['key'] ?? ''));
    if (!is_file($t . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($t)) { throw new RuntimeException(i18n_t('Un autre pack a été installé entre-temps.')); }
    @rename($t . '.removed', $t);
    return ['ok' => true];
}

/* ═════════════════════ 🗺 OpenStreetMap hors ligne : lire et dessiner une tuile vectorielle ═════════════════════ */

/** lit un entier « varint » du protobuf */
function ta_pb_varint(string $s, int &$i): int
{
    $r = 0; $shift = 0; $n = strlen($s);
    while ($i < $n) { $b = ord($s[$i++]); $r |= ($b & 0x7f) << $shift; if ($b < 0x80) { return $r; } $shift += 7; if ($shift > 63) { break; } }
    return $r;
}
/** les champs d'un message protobuf : [[numéro, type, valeur]] (type 0 : entier, 2 : octets, 1/5 : 8/4 octets) */
function ta_pb_fields(string $s): array
{
    $out = []; $i = 0; $n = strlen($s);
    while ($i < $n) {
        $key = ta_pb_varint($s, $i); $f = $key >> 3; $t = $key & 7;
        if ($t === 0) { $out[] = [$f, 0, ta_pb_varint($s, $i)]; }
        elseif ($t === 2) { $len = ta_pb_varint($s, $i); $out[] = [$f, 2, substr($s, $i, $len)]; $i += $len; }
        elseif ($t === 1) { $out[] = [$f, 1, substr($s, $i, 8)]; $i += 8; }
        elseif ($t === 5) { $out[] = [$f, 5, substr($s, $i, 4)]; $i += 4; }
        else { break; }
    }
    return $out;
}
function ta_pb_packed(string $s): array { $o = []; $i = 0; $n = strlen($s); while ($i < $n) { $o[] = ta_pb_varint($s, $i); } return $o; }
/** une tuile Mapbox Vector Tile → [nom de couche => ['extent' => n, 'features' => [['type' => 1|2|3, 'props' => [...], 'geom' => [[[x, y]…]…]]]]] */
function ta_mvt_decode(string $data): array
{
    $layers = [];
    foreach (ta_pb_fields($data) as [$f, $t, $layerBuf]) {
        if ($f !== 3 || $t !== 2) { continue; }
        $name = ''; $extent = 4096; $keys = []; $vals = []; $feats = [];
        foreach (ta_pb_fields($layerBuf) as [$lf, $lt, $v]) {
            if ($lf === 1) { $name = $v; } elseif ($lf === 5) { $extent = (int) $v; } elseif ($lf === 3) { $keys[] = $v; } elseif ($lf === 2) { $feats[] = $v; }
            elseif ($lf === 4) {
                $val = null;
                foreach (ta_pb_fields($v) as [$vf, $vt, $vv]) {
                    if ($vf === 1) { $val = $vv; } elseif ($vf === 2) { $val = unpack('g', $vv)[1]; } elseif ($vf === 3) { $val = unpack('e', $vv)[1]; }
                    elseif ($vf === 4 || $vf === 5) { $val = $vv; } elseif ($vf === 6) { $val = ($vv >> 1) ^ -($vv & 1); } elseif ($vf === 7) { $val = (bool) $vv; }
                }
                $vals[] = $val;
            }
        }
        $out = [];
        foreach ($feats as $fb) {
            $type = 0; $tags = []; $geo = [];
            foreach (ta_pb_fields($fb) as [$ff, $ft, $fv]) { if ($ff === 3) { $type = (int) $fv; } elseif ($ff === 2) { $tags = ta_pb_packed($fv); } elseif ($ff === 4) { $geo = ta_pb_packed($fv); } }
            $props = []; for ($k = 0; $k + 1 < count($tags); $k += 2) { if (isset($keys[$tags[$k]])) { $props[$keys[$tags[$k]]] = $vals[$tags[$k + 1]] ?? null; } }
            // la géométrie : commandes MoveTo (1), LineTo (2), ClosePath (7), coordonnées en zigzag relatives
            $rings = []; $cur = []; $x = 0; $y = 0; $i = 0; $n = count($geo);
            while ($i < $n) {
                $cmd = $geo[$i] & 7; $cnt = $geo[$i] >> 3; $i++;
                if ($cmd === 7) { if ($cur) { $cur[] = $cur[0]; } continue; }
                for ($c = 0; $c < $cnt && $i + 1 < $n; $c++) {
                    $dx = $geo[$i] ?? 0; $dy = $geo[$i + 1] ?? 0; $i += 2;
                    $x += ($dx >> 1) ^ -($dx & 1); $y += ($dy >> 1) ^ -($dy & 1);
                    if ($cmd === 1) { if ($cur) { $rings[] = $cur; } $cur = [[$x, $y]]; } else { $cur[] = [$x, $y]; }
                }
            }
            if ($cur) { $rings[] = $cur; }
            $out[] = ['type' => $type, 'props' => $props, 'geom' => $rings];
        }
        $layers[$name] = ['extent' => $extent, 'features' => $out];
    }
    return $layers;
}
/** le style (couleurs proches des cartes de l'app) : [couche, filtre, sorte, couleur, largeur] dans l'ordre du dessin */
function ta_osm_style(): array
{
    return [
        ['landcover', static fn($p) => in_array($p['class'] ?? '', ['wood', 'forest'], true), 'fill', '#cfe3bf', 0],
        ['landcover', static fn($p) => in_array($p['class'] ?? '', ['grass', 'farmland', 'meadow'], true), 'fill', '#eef0dc', 0],
        ['landcover', static fn($p) => ($p['class'] ?? '') === 'wetland', 'fill', '#d4e6e2', 0],
        ['landcover', static fn($p) => in_array($p['class'] ?? '', ['sand', 'rock', 'ice'], true), 'fill', '#efe9dc', 0],
        ['landuse', static fn($p) => in_array($p['class'] ?? '', ['residential', 'suburb', 'neighbourhood', 'village'], true), 'fill', '#ece6df', 0],
        ['landuse', static fn($p) => in_array($p['class'] ?? '', ['cemetery', 'quarry', 'industrial', 'commercial', 'railway'], true), 'fill', '#e4ddd6', 0],
        ['park', static fn($p) => true, 'fill', '#d8ebcc', 0],
        ['water', static fn($p) => true, 'fill', '#aad3df', 0],
        ['waterway', static fn($p) => in_array($p['class'] ?? '', ['river', 'canal'], true), 'line', '#8cc4d6', 2.2],
        ['waterway', static fn($p) => !in_array($p['class'] ?? '', ['river', 'canal'], true), 'line', '#9fcbd9', 1.0],
        ['building', static fn($p) => true, 'fill', '#d9cfc6', 0],
        ['boundary', static fn($p) => (int) ($p['admin_level'] ?? 9) <= 6, 'dash', '#a58bb0', 1.0],
        ['transportation', static fn($p) => in_array($p['class'] ?? '', ['path', 'track'], true), 'dash', '#b09a7f', 0.8],
        ['transportation', static fn($p) => in_array($p['class'] ?? '', ['minor', 'service'], true), 'line', '#ffffff', 1.6],
        ['transportation', static fn($p) => in_array($p['class'] ?? '', ['tertiary', 'secondary'], true), 'line', '#fff4c2', 2.6],
        ['transportation', static fn($p) => in_array($p['class'] ?? '', ['primary', 'trunk'], true), 'line', '#fcd6a4', 3.2],
        ['transportation', static fn($p) => ($p['class'] ?? '') === 'motorway', 'line', '#e892a2', 3.6],
        ['transportation', static fn($p) => ($p['class'] ?? '') === 'rail', 'dash', '#888888', 1.2]];
}
/** les octets d'une tuile vectorielle (z/x/y XYZ) dans un pack, ou null */
function ta_osm_tile_data(PDO $m, string $compression, int $z, int $x, int $y): ?string
{
    $s = $m->prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?');
    $s->execute([$z, $x, (2 ** $z) - 1 - $y]);
    $d = $s->fetchColumn(); if ($d === false || $d === null) { return null; }
    $d = (string) $d;
    if (str_starts_with($d, "\x1f\x8b")) { $u = @gzdecode($d); return $u === false ? null : $u; }
    return $d;
}
/** une tuile en SVG à partir des packs installés ; null si aucun pack ne la couvre */
function ta_osm_tile_svg(int $z, int $x, int $y): ?string
{
    $n = 2 ** $z; if ($z < 0 || $z > 20 || $x < 0 || $y < 0 || $x >= $n || $y >= $n) { return null; }
    $lonW = $x / $n * 360 - 180; $lonE = ($x + 1) / $n * 360 - 180;
    $latN = rad2deg(atan(sinh(M_PI * (1 - 2 * $y / $n)))); $latS = rad2deg(atan(sinh(M_PI * (1 - 2 * ($y + 1) / $n))));
    foreach (ta_osm_installed() as $pk) {
        [$bw, $bs, $be, $bn] = $pk['meta']['bounds'];
        if ($lonE < $bw || $lonW > $be || $latN < $bs || $latS > $bn) { continue; }
        $mz = min($z, $pk['meta']['maxzoom']); if ($mz < $pk['meta']['minzoom']) { continue; }
        $dz = $z - $mz; $px = $x >> $dz; $py = $y >> $dz; // au-delà du zoom du pack : on agrandit la tuile parente
        $data = ta_osm_tile_data($pk['pdo'], $pk['meta']['compression'], $mz, $px, $py);
        if ($data === null) { continue; }
        return ta_osm_svg(ta_mvt_decode($data), 2 ** $dz, $x - ($px << $dz), $y - ($py << $dz), $z);
    }
    return null;
}
function ta_svg_esc(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_XML1, 'UTF-8'); }
/** dessine les couches : $scale = agrandissement (tuile parente), ($ox, $oy) = la sous-tuile voulue */
function ta_osm_svg(array $layers, int $scale, int $ox, int $oy, int $z): string
{
    $paths = '';
    $tr = static function (array $ring, int $extent) use ($scale, $ox, $oy): array {
        $k = 256 * $scale / $extent; $o = [];
        foreach ($ring as [$a, $b]) { $o[] = round($a * $k - $ox * 256, 1) . ' ' . round($b * $k - $oy * 256, 1); }
        return $o;
    };
    foreach (ta_osm_style() as [$layer, $filter, $kind, $color, $width]) {
        if (!isset($layers[$layer])) { continue; }
        $ext = (int) $layers[$layer]['extent'] ?: 4096; $d = '';
        foreach ($layers[$layer]['features'] as $f) {
            if (!$filter($f['props'])) { continue; }
            if ($kind === 'fill' && $f['type'] !== 3) { continue; }
            if ($kind !== 'fill' && $f['type'] === 1) { continue; }
            foreach ($f['geom'] as $ring) { if (count($ring) < 2) { continue; } $d .= 'M' . implode('L', $tr($ring, $ext)) . ($kind === 'fill' ? 'Z' : ''); }
        }
        if ($d === '') { continue; }
        $w = round($width * ($z >= 15 ? 1.6 : ($z >= 13 ? 1.0 : 0.6)), 2);
        $paths .= $kind === 'fill' ? '<path fill="' . $color . '" fill-rule="evenodd" d="' . $d . '"/>'
            : '<path fill="none" stroke="' . $color . '" stroke-width="' . $w . '" stroke-linecap="round" stroke-linejoin="round"' . ($kind === 'dash' ? ' stroke-dasharray="3 2"' : '') . ' d="' . $d . '"/>';
    }
    // les noms des lieux (villes, villages, hameaux selon le zoom) ; et des rivières au zoom fort
    $labels = '';
    $show = ['city' => 4, 'town' => 8, 'village' => 11, 'hamlet' => 13, 'suburb' => 13, 'locality' => 14, 'isolated_dwelling' => 15];
    foreach ($layers['place']['features'] ?? [] as $f) {
        $cls = (string) ($f['props']['class'] ?? ''); $name = trim((string) ($f['props']['name:latin'] ?? $f['props']['name'] ?? ''));
        if ($name === '' || $f['type'] !== 1 || $z < ($show[$cls] ?? 99) || !isset($f['geom'][0][0])) { continue; }
        $ext = (int) ($layers['place']['extent'] ?? 4096) ?: 4096; [$p] = $tr([$f['geom'][0][0]], $ext); [$lx, $ly] = array_map('floatval', explode(' ', $p));
        if ($lx < -40 || $lx > 296 || $ly < -10 || $ly > 266) { continue; }
        $fs = in_array($cls, ['city', 'town'], true) ? 13 : ($cls === 'village' ? 11 : 9.5);
        $labels .= '<text x="' . $lx . '" y="' . $ly . '" font-size="' . $fs . '"' . (in_array($cls, ['city', 'town'], true) ? ' font-weight="bold"' : '') . '>' . ta_svg_esc(mb_substr($name, 0, 40)) . '</text>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#f4f1ea"/>' . $paths
        . ($labels !== '' ? '<g font-family="system-ui,sans-serif" fill="#333" text-anchor="middle" stroke="#fff" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round">' . $labels . '</g>' : '') . '</svg>';
}
/** GET telech_a_osm_tile&z=&x=&y= → SVG (pack installé, sinon le fond hors ligne de l'app) */
function telech_a_osm_tile_response(PDO $pdo): never
{
    $z = safe_int($_GET['z'] ?? 0); $x = safe_int($_GET['x'] ?? 0); $y = safe_int($_GET['y'] ?? 0);
    $svg = null;
    try { $svg = ta_osm_tile_svg($z, $x, $y); } catch (Throwable) { $svg = null; }
    if ($svg === null) { require_once __DIR__ . '/offline_map.php'; $svg = offline_tile_svg($pdo, $z, $x, $y); }
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Cache-Control: private, max-age=86400');
    echo $svg;
    exit;
}

/* ═════════════════════ À propos des données ═════════════════════ */

function telech_a_about(): array
{
    return ['read' => TA_READ, 'sources' => [
        ['id' => 'clc', 'label' => 'CORINE Land Cover 1990 et 2018 (Copernicus, AEE ; SDES pour la France), tuiles de la Géoplateforme', 'licence' => 'Copernicus : « free, full and open access », source à citer', 'licence_url' => 'https://land.copernicus.eu/en/data-policy', 'url' => 'https://www.statistiques.developpement-durable.gouv.fr/corine-land-cover-0', 'how' => 'en ligne, lu pixel par pixel autour du lieu, gardé'],
        ['id' => 'ign', 'label' => 'IGN : photos aériennes 1950-1965, carte d’État-major, hydrographie (Géoplateforme)', 'licence' => 'Licence Ouverte 2.0 (Etalab)', 'licence_url' => 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', 'url' => 'https://cartes.gouv.fr/', 'how' => 'tuiles affichées par l’écran, rien n’est copié'],
        ['id' => 'osm', 'label' => 'OpenStreetMap (extraits régionaux Geofabrik, tuiles faites avec tilemaker, schéma OpenMapTiles)', 'licence' => 'ODbL 1.0 — « © les contributeurs d’OpenStreetMap » ; schéma OpenMapTiles CC BY 4.0', 'licence_url' => 'https://www.openstreetmap.org/copyright', 'url' => 'https://download.geofabrik.de/europe/france.html', 'how' => 'pack téléchargé (Réglages → 🗂 Données), dessiné sur l’ordinateur'],
        ['id' => 'inec', 'label' => 'Indicateur national de l’érosion côtière (Cerema, 2026)', 'licence' => 'CC BY (data.gouv.fr) — lien seulement (pas de service de carte vérifiable)', 'licence_url' => 'https://www.data.gouv.fr/datasets/6ad9eb466ec242fe5671d6fc', 'url' => 'https://www.geolittoral.developpement-durable.gouv.fr/telechargement-en-ligne-donnees-geolittoral-a802.html', 'how' => 'lien ↗ seulement']]];
}

/* ═════════════════════ routes ═════════════════════ */

function telech_a_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'telech_a_clc' => telech_a_clc($pdo, $q),
        'telech_a_list' => telech_a_list(),
        'telech_a_about' => telech_a_about(),
        'telech_a_osm_status' => telech_a_osm_status(),
        'telech_a_osm_dl_info' => (static function () { try { return telech_a_osm_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'packs' => [], 'offline' => true, 'error' => $e->getMessage()]; } })(),
        'telech_a_osm_dl_resume' => telech_a_osm_dl_resume((string) ($q['id'] ?? '')),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
function telech_a_api_post(string $action, array $d): array
{
    if (function_exists('kiosk_state') && !empty(kiosk_state()['on'])) { throw new RuntimeException(i18n_t('Mode consultation : rien ne se télécharge.')); }
    return match ($action) {
        'telech_a_osm_dl_start' => telech_a_osm_dl_start($d),
        'telech_a_osm_dl_step' => telech_a_osm_dl_step($d),
        'telech_a_osm_dl_cancel' => telech_a_osm_dl_cancel($d),
        'telech_a_osm_pack_finish' => telech_a_osm_pack_finish($d),
        'telech_a_osm_pack_undo' => telech_a_osm_pack_undo($d),
        'telech_a_osm_pack_remove' => telech_a_osm_pack_remove($d),
        'telech_a_osm_pack_restore' => telech_a_osm_pack_restore($d),
        'telech_a_cache_clear' => telech_a_cache_clear(),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
