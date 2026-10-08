<?php
declare(strict_types=1);

/**
 * Télécharge des limites administratives d'OpenStreetMap (© les contributeurs d'OpenStreetMap, ODbL 1.0) par le service
 * public Overpass, pour scripts/build-reference-europe.php. Réponses gardées dans vendor/geo/.cache/osm/ (jamais refaites
 * si le fichier est déjà bon). Poli avec le serveur : une demande à la fois, pause entre deux, nouvelles tentatives.
 *
 *   php scripts/fetch-osm-boundaries.php count RS 4-10          niveaux administratifs présents (nombre de relations)
 *   php scripts/fetch-osm-boundaries.php get RS 7 [6]           relations des niveaux 7 (et 6) avec leurs tracés → RS-7.json
 *   php scripts/fetch-osm-boundaries.php tags RS 4              relations du niveau 4, sans tracé → RS-4-tags.json
 *   php scripts/fetch-osm-boundaries.php get CA-NB 8 6          une province ou un État seulement (code ISO 3166-2)
 *   php scripts/fetch-osm-boundaries.php country RS             contour du pays → RS-pays.json (pour écarter les unités voisines)
 */

ini_set('memory_limit', '4G'); // réponses de plusieurs centaines de Mo (Mexique, Canada…)
[$mode, $cc] = [$argv[1] ?? '', strtoupper($argv[2] ?? '')];
$levels = array_slice($argv, 3);
if ($mode === 'country') { $levels = ['pays']; }
if (!in_array($mode, ['count', 'get', 'tags', 'country'], true) || !preg_match('/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/', $cc) || !$levels) {
    fwrite(STDERR, "Usage : php scripts/fetch-osm-boundaries.php count|get|tags <PAYS> <niveaux…>\n"); exit(1);
}
$dir = dirname(__DIR__) . '/vendor/geo/.cache/osm';
@mkdir($dir, 0775, true);

function overpass(string $query, int $timeout = 900): ?string
{
    for ($try = 1; $try <= 6; $try++) {
        $ch = curl_init('https://overpass-api.de/api/interpreter');
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['data' => $query]), CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout, CURLOPT_USERAGENT => 'LCNDA-build/0.2 (genealogy app; github.com/victorbaissait/lcnda)',
            CURLOPT_HTTPHEADER => ['Accept: application/json']]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if (is_string($body) && $code === 200 && str_contains(substr($body, 0, 300), '"version"') && !str_contains($body, '"remark": "runtime error')) { return $body; }
        fwrite(STDERR, "  tentative {$try} : HTTP {$code}, nouvel essai dans " . (30 * $try) . " s\n");
        sleep(30 * $try);
    }
    return null;
}

// « CA-NB » : une province ou un État seulement (pays immenses)
// Hong Kong, Macao, Palestine, Sahara occidental… ne sont pas au niveau 2 dans OSM : OSM_AREA_ANY=1 enlève ce filtre
$level2 = getenv('OSM_AREA_ANY') ? '' : '[admin_level=2]';
$area = str_contains($cc, '-') ? "area[\"ISO3166-2\"=\"{$cc}\"]->.a;" : "area[\"ISO3166-1\"=\"{$cc}\"]{$level2}->.a;";
if ($mode === 'count') {
    [$from, $to] = array_map('intval', explode('-', $levels[0]) + [1 => $levels[0]]);
    for ($l = $from; $l <= $to; $l++) {
        $body = overpass("[out:json][timeout:120];{$area}rel(area.a)[boundary=administrative][admin_level={$l}];out count;", 180);
        $n = $body && preg_match('/"relations":\s*"?(\d+)/', $body, $m) ? (int) $m[1] : -1;
        if ($n !== 0) { echo "{$cc} niveau {$l} : " . ($n < 0 ? 'échec' : $n) . "\n"; }
        sleep(2);
    }
    exit(0);
}
$file = "{$dir}/{$cc}-" . implode('', $levels) . ($mode === 'tags' ? '-tags' : '') . '.json';
if ($mode === 'country') {
    if (is_file($file) && str_contains((string) file_get_contents($file, false, null, 0, 300), '"version"')) { echo basename($file) . " : déjà là\n"; exit(0); }
    $key = str_contains($cc, '-') ? 'ISO3166-2' : 'ISO3166-1';
    $body = overpass("[out:json][timeout:800];rel[boundary=administrative][\"{$key}\"=\"{$cc}\"];out geom;");
    if ($body === null) { fwrite(STDERR, basename($file) . " : ÉCHEC\n"); exit(2); }
    file_put_contents($file, $body);
    printf("%s : %d relation(s), %.1f Mo\n", basename($file), substr_count($body, '"type": "relation"'), strlen($body) / 1048576);
    sleep(3); exit(0);
}
if (is_file($file) && str_contains((string) file_get_contents($file, false, null, 0, 300), '"version"')) { echo basename($file) . " : déjà là\n"; exit(0); }
$filter = count($levels) === 1 ? "[admin_level={$levels[0]}]" : '[admin_level~"^(' . implode('|', $levels) . ')$"]';
$body = overpass("[out:json][timeout:800];{$area}rel(area.a)[boundary=administrative]{$filter};out " . ($mode === 'tags' ? 'tags' : 'geom') . ';');
if ($body === null) { fwrite(STDERR, basename($file) . " : ÉCHEC\n"); exit(2); }
file_put_contents($file, $body);
printf("%s : %d relations, %.1f Mo\n", basename($file), substr_count($body, '"type": "relation"'), strlen($body) / 1048576);
sleep(3);
