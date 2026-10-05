<?php
declare(strict_types=1);

/**
 * Fabrique data/reference/geo-world.sqlite.gz : les villes du monde (hors France métropolitaine, déjà dans
 * geo-fr) pour les suggestions de lieux et les coordonnées. SOURCES PUBLIQUES uniquement :
 *   - cities1000.zip de GeoNames (CC BY 4.0) : lieux de plus de 1 000 habitants (~165 000) ;
 *   - scripts/geo/admin1CodesASCII.txt (GeoNames) : noms des régions / états ;
 *   - scripts/geo/country-names-fr.tsv : noms des pays en français.
 * Ce fichier n'est PAS copié dans les bases : il est interrogé à la demande (lib/reference.php). Seuls les lieux
 * choisis par l'utilisateur entrent dans sa base.
 *
 *   php scripts/build-reference-world.php <cities1000.zip>
 */

ini_set('memory_limit', '1024M');
require __DIR__ . '/../lib/text.php';
$zip = $argv[1] ?? '';
if (!is_file($zip)) { fwrite(STDERR, "Usage : php scripts/build-reference-world.php <cities1000.zip>\n"); exit(1); }
$countries = [];
foreach (file(__DIR__ . '/geo/country-names-fr.tsv', FILE_IGNORE_NEW_LINES) as $l) {
    if ($l === '' || $l[0] === '#') { continue; }
    [$code, $fr, $en] = array_pad(explode("\t", $l), 3, '');
    $countries[$code] = $fr !== '' ? $fr : $en;
}
$admin1 = [];
foreach (file(__DIR__ . '/geo/admin1CodesASCII.txt', FILE_IGNORE_NEW_LINES) as $l) {
    $c = explode("\t", $l);
    if (isset($c[1])) { $admin1[$c[0]] = $c[1]; }
}
$key = static fn(string $v): string => trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(ascii_fold($v))));

$tmp = sys_get_temp_dir() . '/lcnda-world-' . bin2hex(random_bytes(4)) . '.sqlite';
$db = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF');
$db->exec("CREATE TABLE reference_info (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
$db->exec("CREATE TABLE world_places (geoname_id INTEGER PRIMARY KEY, name TEXT NOT NULL, search_key TEXT NOT NULL,
    alternate_names TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '',
    country_code TEXT NOT NULL DEFAULT '', latitude REAL, longitude REAL, population INTEGER NOT NULL DEFAULT 0, feature_code TEXT NOT NULL DEFAULT '')");
$insert = $db->prepare('INSERT OR IGNORE INTO world_places VALUES(?,?,?,?,?,?,?,?,?,?,?)');
$db->beginTransaction();
$h = fopen('zip://' . $zip . '#cities1000.txt', 'r');
if (!$h) { fwrite(STDERR, "cities1000.txt introuvable dans l'archive\n"); exit(1); }
$n = 0;
while (($line = fgets($h)) !== false) {
    $c = explode("\t", rtrim($line, "\r\n"));
    if (count($c) < 15 || $c[8] === 'FR' || in_array($c[7], ['PPLH', 'PPLQ', 'PPLW', 'PPLCH'], true)) { continue; } // France : geo-fr ; lieux disparus exclus
    $insert->execute([(int) $c[0], $c[1], $key($c[1]) . ' ' . $key($c[2]), mb_substr($c[3], 0, 2000), $admin1[$c[8] . '.' . $c[10]] ?? '',
        $countries[$c[8]] ?? $c[8], $c[8], (float) $c[4], (float) $c[5], (int) $c[14], $c[7]]);
    $n++;
}
fclose($h);
$db->commit();
$db->exec('CREATE INDEX idx_world_search ON world_places(search_key)');
$db->exec('CREATE INDEX idx_world_country ON world_places(country, search_key)');
$info = $db->prepare('INSERT INTO reference_info VALUES(?,?)');
$info->execute(['source', 'GeoNames cities1000.zip (CC BY 4.0, https://www.geonames.org)']);
$info->execute(['sha256', hash_file('sha256', $zip)]);
$info->execute(['version', date('Ymd')]);
$db->exec('VACUUM');
$db = null;
$out = dirname(__DIR__) . '/data/reference/geo-world.sqlite.gz';
$in = fopen($tmp, 'rb'); $gz = gzopen($out, 'wb9');
while (!feof($in)) { gzwrite($gz, (string) fread($in, 1 << 20)); }
fclose($in); gzclose($gz); unlink($tmp);
printf("%d lieux dans le monde → %s (%.1f Mo)\n", $n, $out, filesize($out) / 1048576);
