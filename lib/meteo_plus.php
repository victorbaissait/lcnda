<?php
declare(strict_types=1);
/**
 * 🌦 Météo d'autrefois : les COMPLÉMENTS Copernicus (packs facultatifs « plus-… », fabriqués par scripts/meteo/meteo_plus.py,
 * installés comme les autres packs : Réglages → 🌦 Météo d'autrefois). Ils s'ajoutent au détail d'un jour (meteo_day, $res['plus']),
 * sans rien changer à ce que donnent le socle et les autres packs :
 *   - plus-neige    (ERA5-Land, ≈ 9 km)  : neige au sol, neige tombée, et min./max. plus fins ;
 *   - plus-cerra    (CERRA, ≈ 5,5 km)    : min./max. encore plus fins (passe devant ERA5-Land) ;
 *   - plus-ressenti (UTCI, ≈ 30 km)      : le ressenti le plus chaud et le plus froid de la journée ;
 *   - plus-rivieres (GloFAS, ≈ 5 km)     : le débit de la grande rivière la plus proche (à 8 km au plus), comparé à l'habitude ;
 *   - plus-anciennes (relevés in situ)   : des stations d'avant 1836, lues comme les autres stations (rien à faire ici).
 * Chaque morceau dit sa source (nom, licence, mention, adresse) : l'écran met la ligne et le lien « ↗ source ».
 */

const METEO_PLUS_KINDS = ['plus-neige', 'plus-ressenti', 'plus-rivieres', 'plus-cerra', 'plus-anciennes'];
const METEO_PLUS_RIVER_KM = 8.0;

/** le carreau le plus proche d'une source des compléments, dans un pack « plus-… », qui couvre l'année */
function meteo_plus_cell(string $source, float $lat, float $lon, int $year, float $w, float $maxKm): ?array
{
    $best = null;
    foreach (meteo_files() as $f) {
        if (!str_starts_with($f['kind'], 'plus-')) { continue; }
        $pdo = meteo_pdo($f['path']); if (!$pdo) { continue; }
        $s = $pdo->prepare('SELECT * FROM grid WHERE source=? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND (debut IS NULL OR debut<=?) AND (fin IS NULL OR fin>=?)');
        $s->execute([$source, $lat - $w, $lat + $w, $lon - $w * 1.5, $lon + $w * 1.5, $year, $year]);
        foreach ($s->fetchAll() as $c) {
            $km = meteo_km($lat, $lon, (float) $c['lat'], (float) $c['lon']);
            if ($km <= $maxKm && (!$best || $km < $best['km'])) { $best = $c + ['file' => $f['path'], 'km' => $km]; }
        }
    }
    return $best;
}

/** la valeur d'une colonne d'un bloc annuel, au jour $i (0 = 1er janvier) */
function meteo_plus_val(?array $block, string $col, int $i): ?int
{
    if (!$block || $i < 0 || $i >= $block['n']) { return null; }
    $v = $block['cols'][$col][$i] ?? null;
    return $v === null ? null : (int) $v;
}

/** la grande rivière la plus proche (GloFAS) : le carreau qui a le plus fort débit moyen à moins de 8 km */
function meteo_plus_river(float $lat, float $lon, int $year): ?array
{
    $best = null; $w = METEO_PLUS_RIVER_KM / 111.0;
    foreach (meteo_files() as $f) {
        if (!str_starts_with($f['kind'], 'plus-')) { continue; }
        $pdo = meteo_pdo($f['path']); if (!$pdo) { continue; }
        try {
            $s = $pdo->prepare("SELECT g.*, r.moyenne, r.p10, r.p90, r.p99 FROM grid g JOIN riviere r ON r.grid_id=g.id WHERE g.source='glofas' AND g.lat BETWEEN ? AND ? AND g.lon BETWEEN ? AND ? AND g.debut<=? AND g.fin>=?");
            $s->execute([$lat - $w, $lat + $w, $lon - $w * 1.6, $lon + $w * 1.6, $year, $year]);
        } catch (Throwable) { continue; }
        foreach ($s->fetchAll() as $c) {
            $km = meteo_km($lat, $lon, (float) $c['lat'], (float) $c['lon']);
            if ($km <= METEO_PLUS_RIVER_KM && (!$best || (float) $c['moyenne'] > (float) $best['moyenne'])) { $best = $c + ['file' => $f['path'], 'km' => $km]; }
        }
    }
    return $best;
}

/** les compléments d'un jour (vide sans pack « plus-… ») : ['fine' => …, 'snow' => …, 'feel' => …, 'river' => …, 'sources' => […]] */
function meteo_plus_day(float $lat, float $lon, int $y, int $i): array
{
    $has = false;
    foreach (meteo_files() as $f) { if (str_starts_with($f['kind'], 'plus-') && $f['kind'] !== 'plus-anciennes') { $has = true; break; } }
    if (!$has) { return []; }
    $out = []; $src = [];
    // 1. les températures fines : CERRA (≈ 5,5 km) d'abord, sinon ERA5-Land (≈ 9 km)
    foreach ([['cerra', 0.08, 6.0, 5.5], ['era5land', 0.12, 10.0, 9.0]] as [$source, $w, $max, $size]) {
        $c = meteo_plus_cell($source, $lat, $lon, $y, $w, $max); if (!$c) { continue; }
        $b = meteo_block($c['file'], 'grid_daily', (int) $c['id'], $y);
        $tn = meteo_plus_val($b, 'TN', $i); $tx = meteo_plus_val($b, 'TX', $i);
        if ($tn === null && $tx === null) { continue; }
        $out['fine'] = ['source' => $source, 'size' => $size, 'km' => round($c['km'], 1), 'tn' => $tn === null ? null : $tn / 10, 'tx' => $tx === null ? null : $tx / 10];
        $src[] = $source; break;
    }
    // 2. la neige (ERA5-Land) : au sol à 0 h, et tombée dans la journée
    if ($c = meteo_plus_cell('era5land', $lat, $lon, $y, 0.12, 10.0)) {
        $b = meteo_block($c['file'], 'grid_daily', (int) $c['id'], $y);
        $sh = meteo_plus_val($b, 'SH', $i); $sf = meteo_plus_val($b, 'SF', $i);
        if ($sh !== null || $sf !== null) { $out['snow'] = ['sh' => $sh, 'sf' => $sf, 'km' => round($c['km'], 1)]; $src[] = 'era5land'; }
    }
    // 3. le ressenti (UTCI)
    if ($c = meteo_plus_cell('utci', $lat, $lon, $y, 0.3, 25.0)) {
        $b = meteo_block($c['file'], 'grid_daily', (int) $c['id'], $y);
        $ux = meteo_plus_val($b, 'UX', $i); $un = meteo_plus_val($b, 'UN', $i);
        if ($ux !== null || $un !== null) { $out['feel'] = ['ux' => $ux === null ? null : $ux / 10, 'un' => $un === null ? null : $un / 10, 'km' => round($c['km'], 1)]; $src[] = 'utci'; }
    }
    // 4. la rivière (GloFAS) : le débit du jour, comparé à ce qui est habituel à cet endroit
    if ($c = meteo_plus_river($lat, $lon, $y)) {
        $b = meteo_block($c['file'], 'grid_daily', (int) $c['id'], $y);
        $ql = meteo_plus_val($b, 'QL', $i);
        if ($ql !== null) {
            $out['river'] = ['q' => round(10 ** ($ql / 1000), 1), 'mean' => round((float) $c['moyenne'], 1), 'p10' => (float) $c['p10'], 'p90' => (float) $c['p90'], 'p99' => (float) $c['p99'],
                'km' => round($c['km'], 1), 'lat' => (float) $c['lat'], 'lon' => (float) $c['lon']];
            $src[] = 'glofas';
        }
    }
    if (!$out) { return []; }
    $out['sources'] = meteo_source_rows($src);
    foreach ($out['sources'] as &$s) { $s['url'] = $s['url'] ?: (METEO_PLUS_URLS[$s['id']] ?? ''); }
    unset($s);
    return $out;
}

/** les pages officielles (« ↗ source ») */
const METEO_PLUS_URLS = [
    'era5land' => 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land',
    'utci' => 'https://cds.climate.copernicus.eu/datasets/derived-utci-historical',
    'glofas' => 'https://ewds.climate.copernicus.eu/datasets/cems-glofas-historical',
    'cerra' => 'https://cds.climate.copernicus.eu/datasets/reanalysis-cerra-single-levels',
    'c3s-insitu' => 'https://cds.climate.copernicus.eu/datasets/insitu-observations-surface-land',
];
