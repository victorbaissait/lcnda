<?php
declare(strict_types=1);

/**
 * Limites administratives de geoBoundaries (William & Mary geoLab, https://www.geoboundaries.org), jeu « gbOpen » :
 * seulement des licences ouvertes (domaine public, CC BY, CC BY IGO, ODbL), source et licence gardées pour les crédits.
 * Pour chaque pays : le niveau le plus fin qui compte au plus MAX_UNITS unités, et le niveau 1 (régions) pour situer les
 * communes. Fichiers dans vendor/geo/.cache/geob/<PAYS>-ADMn.geojson + <PAYS>.json (métadonnées).
 *
 *   php scripts/fetch-geoboundaries.php SN BF BJ …       (codes ISO à 2 lettres)
 */

const MAX_UNITS = 4000;
$iso3 = ['SN' => 'SEN', 'BF' => 'BFA', 'BJ' => 'BEN', 'CI' => 'CIV', 'NE' => 'NER', 'NG' => 'NGA', 'TG' => 'TGO', 'AO' => 'AGO', 'CD' => 'COD',
    'CG' => 'COG', 'CV' => 'CPV', 'DJ' => 'DJI', 'ER' => 'ERI', 'GA' => 'GAB', 'GW' => 'GNB', 'RW' => 'RWA', 'SL' => 'SLE', 'SO' => 'SOM', 'ST' => 'STP',
    'TD' => 'TCD', 'UG' => 'UGA', 'LR' => 'LBR', 'BI' => 'BDI', 'BW' => 'BWA', 'LY' => 'LBY', 'NA' => 'NAM', 'SD' => 'SDN', 'SS' => 'SSD', 'TZ' => 'TZA',
    'ZA' => 'ZAF', 'KM' => 'COM', 'MG' => 'MDG', 'MU' => 'MUS', 'MW' => 'MWI', 'MZ' => 'MOZ', 'SC' => 'SYC', 'ZM' => 'ZMB', 'ZW' => 'ZWE', 'LS' => 'LSO',
    'TW' => 'TWN', 'ML' => 'MLI', 'MR' => 'MRT', 'GN' => 'GIN', 'GM' => 'GMB', 'GH' => 'GHA', 'KE' => 'KEN', 'ET' => 'ETH', 'CM' => 'CMR', 'CF' => 'CAF',
    'GQ' => 'GNQ', 'SZ' => 'SWZ',
    // Caraïbes, Pacifique et petits territoires (2026-10-08)
    'CU' => 'CUB', 'DO' => 'DOM', 'HT' => 'HTI', 'JM' => 'JAM', 'BS' => 'BHS', 'TT' => 'TTO', 'BB' => 'BRB', 'LC' => 'LCA', 'VC' => 'VCT', 'GD' => 'GRD',
    'AG' => 'ATG', 'DM' => 'DMA', 'KN' => 'KNA', 'AW' => 'ABW', 'CW' => 'CUW', 'SX' => 'SXM', 'BQ' => 'BES', 'VG' => 'VGB', 'KY' => 'CYM', 'TC' => 'TCA',
    'AI' => 'AIA', 'MS' => 'MSR', 'BM' => 'BMU', 'FJ' => 'FJI', 'SB' => 'SLB', 'VU' => 'VUT', 'WS' => 'WSM', 'TO' => 'TON', 'KI' => 'KIR', 'TV' => 'TUV',
    'NR' => 'NRU', 'PW' => 'PLW', 'FM' => 'FSM', 'MH' => 'MHL', 'CK' => 'COK', 'NU' => 'NIU', 'TK' => 'TKL', 'NF' => 'NFK', 'PN' => 'PCN', 'GL' => 'GRL',
    'FO' => 'FRO', 'GI' => 'GIB', 'JE' => 'JEY', 'GG' => 'GGY', 'IM' => 'IMN', 'AX' => 'ALA', 'FK' => 'FLK', 'SH' => 'SHN', 'SJ' => 'SJM'];
$dir = dirname(__DIR__) . '/vendor/geo/.cache/geob';
@mkdir($dir, 0775, true);
$get = static function (string $url): ?string {
    for ($try = 1; $try <= 4; $try++) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 900, CURLOPT_USERAGENT => 'LCNDA-build/0.2']);
        $body = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if (is_string($body) && $code === 200) { return $body; }
        if ($code === 404) { return null; } // ce niveau n'existe pas pour ce pays : inutile d'insister
        fwrite(STDERR, "  tentative {$try} : HTTP {$code} ({$url})\n"); sleep(10 * $try);
    }
    return null;
};
foreach (array_slice($argv, 1) as $cc) {
    $cc = strtoupper($cc); $code3 = $iso3[$cc] ?? null;
    if (!$code3) { echo "{$cc} : code inconnu\n"; continue; }
    if (is_file("{$dir}/{$cc}.json")) { echo "{$cc} : déjà là\n"; continue; }
    $levels = [];
    foreach (['ADM0', 'ADM1', 'ADM2', 'ADM3', 'ADM4'] as $adm) { // ADM0 = territoire entier (petites îles sans communes)
        $meta = json_decode((string) $get("https://www.geoboundaries.org/api/current/gbOpen/{$code3}/{$adm}/"), true);
        if (is_array($meta) && !empty($meta['gjDownloadURL'])) { $levels[$adm] = $meta; }
    }
    // Seulement des licences qui permettent de redistribuer (pas « Other - Direct Permission », accordée à geoBoundaries seul)
    $open = static fn(array $m): bool => (bool) preg_match('/public domain|creative commons|open database license|open government licence|cc0|cc by/i', (string) ($m['boundaryLicense'] ?? ''));
    $levels = array_filter($levels, $open);
    $fine = null;
    foreach (array_reverse($levels, true) as $adm => $meta) { if ((int) $meta['admUnitCount'] <= MAX_UNITS) { $fine = $adm; break; } }
    if (!$fine) { echo "{$cc} : rien chez geoBoundaries\n"; continue; }
    $keep = array_unique([$fine, isset($levels['ADM1']) && $fine !== 'ADM0' ? 'ADM1' : $fine]);
    foreach ($keep as $adm) {
        $file = "{$dir}/{$cc}-{$adm}.geojson";
        if (!is_file($file)) { $body = $get($levels[$adm]['gjDownloadURL']); if ($body === null) { echo "{$cc} {$adm} : ÉCHEC\n"; continue 2; } file_put_contents($file, $body); }
    }
    file_put_contents("{$dir}/{$cc}.json", json_encode(['country' => $cc, 'fine' => $fine, 'state' => isset($levels['ADM1']) && !in_array($fine, ['ADM0', 'ADM1'], true) ? 'ADM1' : '',
        'units' => (int) $levels[$fine]['admUnitCount'], 'license' => $levels[$fine]['boundaryLicense'] ?? '', 'source' => $levels[$fine]['boundarySource'] ?? '',
        'year' => $levels[$fine]['boundaryYearRepresented'] ?? ''], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    printf("%s : %s (%d unités) — %s — %s\n", $cc, $fine, $levels[$fine]['admUnitCount'], $levels[$fine]['boundaryLicense'] ?? '?', mb_substr((string) ($levels[$fine]['boundarySource'] ?? ''), 0, 60));
}
