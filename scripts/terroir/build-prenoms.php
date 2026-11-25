<?php
declare(strict_types=1);
/**
 * 🔤 Le sens des prénoms les plus donnés en France → assets/data/tr-prenoms.json.gz
 *
 * La liste : Insee, « Fichier des prénoms », édition 2024 (naissances 1900–2023), fichier France prenoms-2023-nat.csv
 * (https://www.insee.fr/fr/statistiques/8205621, Licence Ouverte 2.0) : les 1 500 prénoms les plus donnés de 1900 à 2023 et les
 * 1 500 les plus donnés avant 1960 (les deux listes réunies, environ 2 200 prénoms).
 * Le sens : Wiktionnaire (fr.wiktionary.org, CC BY-SA 4.0), partie « Étymologie » de l'article, pour le sens « Prénom » —
 * exactement le même code que l'app quand elle cherche en ligne (lib/terroir.php tr_wikt_fetch), 40 prénoms par appel.
 *
 *   php scripts/terroir/build-prenoms.php prenoms-2023-nat.csv [dossier-de-sortie]
 *   LCNDA_TR_RECORD_DIR=dossier : les réponses du Wiktionnaire y sont gardées (relancer ne refait pas les appels).
 */
ini_set('memory_limit', '1024M');
define('TR_NO_CACHE', true);
require __DIR__ . '/../../lib/bootstrap.php';
require_once __DIR__ . '/../../lib/terroir.php';

$csv = $argv[1] ?? ''; $out = $argv[2] ?? (APP_ROOT . '/assets/data');
if (!is_file($csv)) { fwrite(STDERR, "Fichier Insee introuvable : {$csv}\n"); exit(1); }
$all = []; $old = [];
$h = fopen($csv, 'r'); fgetcsv($h, 0, ';', '"', '');
while (($r = fgetcsv($h, 0, ';', '"', '')) !== false) {
    [$sexe, $name, $year, $n] = $r + ['', '', '', '0'];
    if ($name === '' || $name[0] === '_' || mb_strlen($name) < 2 || $year === 'XXXX') { continue; }
    $all[$name] = ($all[$name] ?? 0) + (int) $n;
    if ((int) $year < 1960) { $old[$name] = ($old[$name] ?? 0) + (int) $n; }
}
fclose($h);
arsort($all); arsort($old);
$names = array_values(array_unique(array_map('tr_title', array_merge(array_slice(array_keys($all), 0, 1500), array_slice(array_keys($old), 0, 1500)))));
fwrite(STDERR, count($names) . " prénoms\n");
$n = []; $none = [];
foreach (array_chunk($names, 40) as $i => $chunk) {
    for ($try = 0; ; $try++) {
        try { $res = tr_wikt_fetch($chunk, 'prenom'); break; }
        catch (Throwable $e) { if ($try >= 30) { throw $e; } fwrite(STDERR, '  ' . $e->getMessage() . " — on attend\n"); sleep(min(180, 30 * ($try + 1))); }
    }
    foreach ($chunk as $w) { $r = $res[$w] ?? null; if ($r && !empty($r['text'])) { $n[$r['title']] = $r['text']; } else { $none[] = $w; } }
    fwrite(STDERR, sprintf("  %d/%d : %d trouvés\n", min(count($names), ($i + 1) * 40), count($names), count($n)));
    if (getenv('LCNDA_TR_RECORD_DIR') === false || !is_file(getenv('LCNDA_TR_RECORD_DIR') . '/wikt_rev_' . substr(sha1('prenom|' . implode('|', $chunk)), 0, 10) . '.json')) { sleep(3); }
}
ksort($n);
$data = ['v' => 1, 'built' => date('Y-m-d'), 'attr' => 'Wiktionnaire (fr.wiktionary.org), partie « Étymologie » des articles, sens « Prénom » ; liste des prénoms : Insee, Fichier des prénoms (édition 2024)',
    'licence' => 'CC BY-SA 4.0 (Wiktionnaire, les contributeurs du Wiktionnaire) ; Licence Ouverte 2.0 (Insee, liste)', 'url' => 'https://fr.wiktionary.org/', 'n' => $n, 'none' => $none];
$f = rtrim($out, '/') . '/tr-prenoms.json.gz';
file_put_contents($f, gzencode(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 9));
fwrite(STDERR, sprintf("%s : %d octets, %d prénoms avec un sens, %d sans\n", $f, filesize($f), count($n), count($none)));
