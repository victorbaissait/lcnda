<?php
declare(strict_types=1);

/**
 * Fond de carte hors ligne : tuiles dessinées sur l'ordinateur à partir des contours de communes déjà dans la base
 * (France et pays des battues ajoutés). Même découpage que les tuiles OpenStreetMap (z/x/y, 256 px), en SVG.
 * Gardées dans DATA_DIR/cache/offline-tiles pour ne les dessiner qu'une fois (le cache se vide si les contours changent).
 * 🌍 Sous les communes : la carte du monde de Natural Earth (domaine public), livrée avec l'app (assets/data/ne-monde-50m.json.gz,
 * scripts/build-ne-monde.js) : les terres et les frontières des pays d'aujourd'hui, partout dans le monde, sans Internet.
 */

/** les pays de Natural Earth (lus une fois par requête) : [['n'=>nom, 'b'=>[x0,y0,x1,y1], 'r'=>[[x,y,x,y…]…]]…], en centièmes de degré */
function offline_world_countries(): array
{
    static $c = null;
    if ($c !== null) { return $c; }
    $f = APP_ROOT . '/assets/data/ne-monde-50m.json.gz';
    $j = is_file($f) ? json_decode((string) @gzdecode((string) file_get_contents($f)), true) : null;
    return $c = is_array($j['countries'] ?? null) ? $j['countries'] : [];
}

/** un polygone coupé au cadre [lo, hi]² (Sutherland–Hodgman) : les grands pays ne débordent pas de la tuile */
function offline_clip_ring(array $pts, float $lo, float $hi): array
{
    $edges = [[0, $lo, true], [0, $hi, false], [1, $lo, true], [1, $hi, false]];
    foreach ($edges as [$k, $v, $min]) {
        $out = []; $n = count($pts); if (!$n) { break; }
        $in = static fn($p) => $min ? $p[$k] >= $v : $p[$k] <= $v;
        for ($i = 0; $i < $n; $i++) {
            $a = $pts[$i]; $b = $pts[($i + 1) % $n]; $ia = $in($a); $ib = $in($b);
            if ($ia) { $out[] = $a; }
            if ($ia !== $ib) { $t = ($v - $a[$k]) / (($b[$k] - $a[$k]) ?: 1e-9); $q = [$a[0] + ($b[0] - $a[0]) * $t, $a[1] + ($b[1] - $a[1]) * $t]; $q[$k] = $v; $out[] = $q; }
        }
        $pts = $out;
    }
    return $pts;
}

/** les terres et les frontières des pays dans une tuile (chemins SVG, mêmes conventions que les communes) */
function offline_world_paths(int $z, int $x, int $y, callable $px, callable $py): string
{
    $b = offline_tile_bounds($z, $x, $y);
    $padLon = ($b['east'] - $b['west']) * 0.02; $padLat = ($b['north'] - $b['south']) * 0.02;
    $w = ($b['west'] - $padLon) * 100; $e = ($b['east'] + $padLon) * 100; $s = ($b['south'] - $padLat) * 100; $n = ($b['north'] + $padLat) * 100;
    $tol = $z <= 3 ? 1.5 : ($z <= 6 ? 1.0 : 0.6);
    $d = '';
    foreach (offline_world_countries() as $c) {
        [$x0, $y0, $x1, $y1] = $c['b'];
        if ($x1 < $w || $x0 > $e || $y1 < $s || $y0 > $n) { continue; }
        foreach ($c['r'] as $flat) {
            $pts = []; $last = null; $cnt = count($flat);
            for ($i = 0; $i + 1 < $cnt; $i += 2) {
                $p = [$px($flat[$i] / 100), $py($flat[$i + 1] / 100)];
                if ($last && abs($p[0] - $last[0]) < $tol && abs($p[1] - $last[1]) < $tol) { continue; }
                $pts[] = $p; $last = $p;
            }
            $pts = array_map(static fn($p) => [round($p[0], 1), round($p[1], 1)], offline_clip_ring($pts, -4.0, 260.0));
            if (count($pts) < 3) { continue; }
            $d .= 'M' . implode('L', array_map(static fn($p) => $p[0] . ' ' . $p[1], $pts)) . 'Z';
        }
    }
    return $d === '' ? '' : '<path fill="#f7f3e8" stroke="#c4b9a2" stroke-width="' . ($z >= 6 ? '0.9' : '0.6') . '" stroke-linejoin="round" d="' . $d . '"/>';
}

function offline_tile_bounds(int $z, int $x, int $y): array
{
    $n = 2 ** $z;
    $lon = static fn($px) => $px / $n * 360 - 180;
    $lat = static fn($py) => rad2deg(atan(sinh(M_PI * (1 - 2 * $py / $n))));
    return ['west' => $lon($x), 'east' => $lon($x + 1), 'north' => $lat($y), 'south' => $lat($y + 1)];
}

function offline_tile_svg(PDO $pdo, int $z, int $x, int $y): string
{
    $z = max(0, min(19, $z));
    $n = 2 ** $z;
    if ($x < 0 || $y < 0 || $x >= $n || $y >= $n) { return offline_tile_wrap(''); }
    $count = (int) $pdo->query('SELECT count(*) FROM commune_contours')->fetchColumn();
    $dir = SHARED_DATA_DIR . '/cache/offline-tiles/w1-' . $count . '/' . $z . '/' . $x;
    $file = $dir . '/' . $y . '.svg';
    if (is_file($file)) { return (string) file_get_contents($file); }
    $b = offline_tile_bounds($z, $x, $y);
    // Un peu de marge pour que les traits ne s'arrêtent pas au bord de la tuile
    $padLon = ($b['east'] - $b['west']) * 0.02; $padLat = ($b['north'] - $b['south']) * 0.02;
    $stmt = $pdo->prepare('SELECT insee_code, name, geometry_json, centroid_lon, centroid_lat, min_lon, max_lon, min_lat, max_lat FROM commune_contours
        WHERE max_lon>=? AND min_lon<=? AND max_lat>=? AND min_lat<=?');
    $stmt->execute([$b['west'] - $padLon, $b['east'] + $padLon, $b['south'] - $padLat, $b['north'] + $padLat]);
    $px = static fn(float $lon) => (($lon + 180) / 360 * $n - $x) * 256;
    $py = static function (float $lat) use ($n, $y) { $lat = max(-85.05, min(85.05, $lat)); $r = deg2rad($lat); return ((1 - log(tan($r) + 1 / cos($r)) / M_PI) / 2 * $n - $y) * 256; };
    // Plus on voit loin, plus on simplifie : en dessous de quelques pixels, une commune devient un petit rectangle
    $minSize = $z <= 6 ? 6 : ($z <= 8 ? 3 : 0.6);
    $tol = $z <= 6 ? 2.0 : ($z <= 9 ? 1.0 : 0.5);
    $dec = $z <= 9 ? 0 : 1;
    $paths = []; $labels = [];
    foreach ($stmt as $row) {
        $w = ($px((float) $row['max_lon']) - $px((float) $row['min_lon']));
        $h = ($py((float) $row['min_lat']) - $py((float) $row['max_lat']));
        if ($w < $minSize && $h < $minSize) {
            // Petite à cette échelle : son rectangle englobant suffit (la terre reste visible, sans détail)
            $x0 = round($px((float) $row['min_lon'])); $y0 = round($py((float) $row['max_lat']));
            $paths[] = 'M' . $x0 . ' ' . $y0 . 'h' . max(1, round($w)) . 'v' . max(1, round($h)) . 'h-' . max(1, round($w)) . 'z';
            continue;
        }
        $geom = json_decode((string) $row['geometry_json'], true);
        if (!is_array($geom)) { continue; }
        $polys = ($geom['type'] ?? '') === 'MultiPolygon' ? $geom['coordinates'] : (($geom['type'] ?? '') === 'Polygon' ? [$geom['coordinates']] : []);
        $d = '';
        foreach ($polys as $poly) {
            foreach ($poly as $ring) {
                $last = null; $pts = [];
                foreach ($ring as $pt) {
                    $p = [round($px((float) $pt[0]), $dec), round($py((float) $pt[1]), $dec)];
                    if ($last && abs($p[0] - $last[0]) < $tol && abs($p[1] - $last[1]) < $tol) { continue; }
                    $pts[] = $p; $last = $p;
                }
                if (count($pts) < 3) { continue; }
                $d .= 'M' . implode('L', array_map(static fn($p) => $p[0] . ' ' . $p[1], $pts)) . 'Z';
            }
        }
        if ($d !== '') { $paths[] = $d; }
        // Noms des communes à partir du zoom 11 (seulement celles dont le centre est dans la tuile)
        if ($z >= 11 && $row['centroid_lon'] !== null) {
            $cx = $px((float) $row['centroid_lon']); $cy = $py((float) $row['centroid_lat']);
            if ($cx >= 0 && $cx <= 256 && $cy >= 0 && $cy <= 256 && ($w > 40 || $z >= 13)) {
                $labels[] = '<text x="' . round($cx, 1) . '" y="' . round($cy, 1) . '">' . htmlspecialchars((string) $row['name'], ENT_XML1) . '</text>';
            }
        }
    }
    $stroke = $z >= 9 ? ' stroke="#b9b09c" stroke-width="' . ($z >= 11 ? '0.8' : '0.4') . '"' : '';
    $body = offline_world_paths($z, $x, $y, $px, $py)
        . ($paths ? '<path fill="#f7f3e8"' . $stroke . ' d="' . implode('', $paths) . '"/>' : '')
        . ($labels ? '<g font-family="Helvetica,Arial,sans-serif" font-size="' . ($z >= 13 ? 12 : 10) . '" fill="#5d5648" text-anchor="middle" stroke="#f7f3e8" stroke-width="3" paint-order="stroke">' . implode('', $labels) . '</g>' : '');
    $svg = offline_tile_wrap($body);
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    @file_put_contents($file, $svg);
    return $svg;
}

function offline_tile_wrap(string $body): string
{
    // Fond bleu-gris très clair : la mer et les pays qui ne sont pas dans la base
    return '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#e6ecf0"/>' . $body . '</svg>';
}

function offline_tile_response(PDO $pdo): never
{
    $svg = offline_tile_svg($pdo, safe_int($_GET['z'] ?? 0), safe_int($_GET['x'] ?? 0), safe_int($_GET['y'] ?? 0));
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Cache-Control: private, max-age=86400');
    echo $svg;
    exit;
}
