<?php
declare(strict_types=1);

/**
 * Fabrique data/reference/geo-world.sqlite.gz : les villes du monde (hors France métropolitaine, déjà dans
 * geo-fr) pour les suggestions de lieux et les coordonnées. SOURCES PUBLIQUES uniquement :
 *   - allCountries.zip de GeoNames (CC BY 4.0) : TOUS les lieux habités du monde (~5 millions), ou à défaut
 *     cities1000.zip (lieux de plus de 1 000 habitants) ;
 *   - scripts/geo/admin1CodesASCII.txt (GeoNames) : noms des régions / états ;
 *   - scripts/geo/country-names-fr.tsv : noms des pays en français.
 * Ce fichier n'est PAS copié dans les bases : il est interrogé à la demande (lib/reference.php). Seuls les lieux
 * choisis par l'utilisateur entrent dans sa base.
 *
 *   php scripts/build-reference-world.php <allCountries.zip | cities1000.zip> [fichier de sortie]
 */

ini_set('memory_limit', '1024M');
require __DIR__ . '/../lib/text.php';
$zip = $argv[1] ?? '';
if (!is_file($zip)) { fwrite(STDERR, "Usage : php scripts/build-reference-world.php <allCountries.zip | cities1000.zip>\n"); exit(1); }
$entry = str_contains(basename($zip), 'allCountries') ? 'allCountries.txt' : 'cities1000.txt';
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
$db->exec("CREATE TABLE countries (code TEXT PRIMARY KEY, name TEXT NOT NULL)");
$c = $db->prepare('INSERT INTO countries VALUES(?,?)');
foreach ($countries as $code => $name) { $c->execute([$code, $name]); }
// Compact : pas de noms alternatifs, pays en code (table countries). L'index de recherche est créé sur
// l'ordinateur à la première utilisation (lib/reference.php), pour alléger le fichier livré.
$db->exec("CREATE TABLE world_places (geoname_id INTEGER PRIMARY KEY, name TEXT NOT NULL, search_key TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '', country_code TEXT NOT NULL DEFAULT '', latitude REAL, longitude REAL,
    population INTEGER NOT NULL DEFAULT 0, feature_code TEXT NOT NULL DEFAULT '')");
$insert = $db->prepare('INSERT OR IGNORE INTO world_places VALUES(?,?,?,?,?,?,?,?,?)');
$db->beginTransaction();
$h = fopen('zip://' . $zip . '#' . $entry, 'r');
if (!$h) { fwrite(STDERR, "{$entry} introuvable dans l'archive\n"); exit(1); }
$n = 0;
while (($line = fgets($h)) !== false) {
    $c = explode("\t", rtrim($line, "\r\n"));
    // Lieux habités (classe P), y compris historiques ou disparus (utiles en généalogie) ; France : dans geo-fr
    if (count($c) < 15 || $c[6] !== 'P' || $c[8] === 'FR') { continue; }
    // search_key = nom replié (minuscules, sans accents) : recherche par début de nom, sur index
    $insert->execute([(int) $c[0], $c[1], $key($c[1]), $admin1[$c[8] . '.' . $c[10]] ?? '', $c[8],
        round((float) $c[4], 5), round((float) $c[5], 5), (int) $c[14], $c[7]]);
    $n++;
    if ($n % 500000 === 0) { fwrite(STDERR, "  {$n} lieux…\n"); }
}
fclose($h);
$db->commit();
$info = $db->prepare('INSERT INTO reference_info VALUES(?,?)');
$info->execute(['source', 'GeoNames ' . basename($zip) . ' (CC BY 4.0, https://www.geonames.org)']);
$info->execute(['sha256', hash_file('sha256', $zip)]);
$info->execute(['version', date('Ymd')]);
$db->exec('VACUUM');
$db = null;
// Sortie : 2e argument, sinon data/reference/. Écrite à côté puis renommée : l'application ne lit jamais un fichier à moitié écrit.
$out = $argv[2] ?? dirname(__DIR__) . '/data/reference/geo-world.sqlite.gz';
if (!is_dir(dirname($out))) { mkdir(dirname($out), 0775, true); }
$in = fopen($tmp, 'rb'); $gz = gzopen($out . '.part', 'wb6');
while (!feof($in)) { gzwrite($gz, (string) fread($in, 1 << 20)); }
fclose($in); gzclose($gz); unlink($tmp);
rename($out . '.part', $out);
printf("%d lieux dans le monde → %s (%.1f Mo)\n", $n, $out, filesize($out) / 1048576);
