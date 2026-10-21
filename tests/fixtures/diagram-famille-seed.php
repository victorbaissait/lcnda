<?php
/**
 * Petite généalogie pour tester les diagrammes « de famille » D1 à D8 (tests/test-diagrammes-famille.js) : celle des
 * diagrammes en plus (tests/fixtures/diagram-more-seed.php : 7 générations, implexe, coordonnées, fratrie, crises),
 * plus des descendants vivants de la personne de départ (quatre générations en même temps), des métiers datés,
 * des domiciles et recensements dans d'autres communes, des mariages pendant le Carême et l'Avent.
 *   GENEALOGY_DATA_DIR=… php tests/fixtures/diagram-famille-seed.php [big]   (big : 5 000 personnes de plus, en familles)
 */
$argvKeep = $argv; $argv = [$argv[0]];
ob_start(); require __DIR__ . '/diagram-more-seed.php'; $moreOut = ob_get_clean();
if (!preg_match('/^ok fratrie/m', $moreOut)) { fwrite(STDERR, $moreOut); exit(1); }
$T += ['RESI' => $tag('RESI'), 'CENS' => $tag('CENS'), 'OCCU' => $tag('OCCU')];
$coords = ['Brest' => [48.3904, -4.4861, 'Finistère', 'Bretagne'], 'Nantes' => [47.2184, -1.5536, 'Loire-Atlantique', 'Pays de la Loire'], 'Fougères' => [48.3524, -1.1986, 'Ille-et-Vilaine', 'Bretagne'], 'Lyon' => [45.764, 4.8357, 'Rhône', 'Auvergne-Rhône-Alpes']];
foreach ($coords as $n => [$la, $lo, $c, $s]) { $pdo->prepare("INSERT INTO places(name,county,state,country,latitude,longitude) VALUES(?,?,?,'France',?,?)")->execute([$n, $c, $s, $la, $lo]); $pid[] = (int) $pdo->lastInsertId(); }
// des domiciles et des recensements (frise des lieux de vie) pour les ancêtres proches
foreach ([2, 3, 4, 5, 6, 7] as $k => $s) {
    if (!isset($sosa[$s])) { continue; }
    $y = (int) $pdo->query('SELECT year FROM events WHERE person_id=' . $sosa[$s] . ' AND year IS NOT NULL ORDER BY year LIMIT 1')->fetchColumn();
    if (!$y) { continue; }
    $ev($sosa[$s], $T['RESI'], sprintf('%04d-09-01', $y + 20), '', $pid[6 + $k % 4]);
    $ev($sosa[$s], $T['CENS'], sprintf('%04d-03-15', $y + 31), '', $pid[($k + 2) % 6]);
}
// des métiers datés (événement « Profession ») qui l'emportent sur la fiche vide
$pdo->exec("UPDATE persons SET occupation='' WHERE id=" . ($sosa[8] ?? 0));
if (isset($sosa[8])) { $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,title,year,sort_date) VALUES('person',?,?,?,?,?)")->execute([$sosa[8], $T['OCCU'], 'Charpentier', 1910, '1910-01-01']); }
// descendants vivants de la personne de départ (née vers 1988) : deux enfants
$root = $sosa[1]; $sp = $addP('Claire', 'LEROY', 'female');
foreach ([[2014, 'Hugo', 'male'], [2017, 'Léa', 'female']] as $k => [$y, $fn, $gd]) {
    $c = $addP($fn, 'MARTIN', $gd); $fam($root, $sp, $c); $ev($c, $T['BIRT'], sprintf('%04d-05-0%d', $y, $k + 1), '', $pid[0]);
    $pdo->exec("UPDATE persons SET living_status='living' WHERE id=$c");
}
// la grand-mère paternelle (Sosa 5) vit longtemps : elle connaît ses arrière-petits-enfants
if (isset($sosa[5])) { $pdo->exec('DELETE FROM events WHERE person_id=' . $sosa[5] . " AND event_type_id={$T['DEAT']}"); $ev($sosa[5], $T['DEAT'], '2020-02-10', '10/2/2020', $pid[0]); }
// des mariages pendant le Carême (12 mars : toujours dans le Carême) et l’Avent (10 décembre)
$fs = $pdo->query("SELECT e.id, e.year FROM events e WHERE e.scope='family' AND e.year IS NOT NULL ORDER BY e.id LIMIT 3")->fetchAll();
foreach ($fs as $i => $f) { $y = (int) $f['year']; $d = [sprintf('%04d-03-12', $y), sprintf('%04d-12-10', $y), sprintf('%04d-02-20', $y)][$i]; $pdo->prepare('UPDATE events SET sort_date=? WHERE id=?')->execute([$d, $f['id']]); }

// 5 000 personnes de plus, en familles sur 7 générations (essais de vitesse)
if (($argvKeep[1] ?? '') === 'big') {
    $pdo->beginTransaction();
    $jobs2 = ['laboureur', 'tisserand', 'meunier', 'journalier', 'marchand', 'cordonnier', 'forgeron', 'notaire'];
    $gen = [];
    for ($i = 0; $i < 80; $i++) { $h = $addP('Jean', 'BIG' . $i, 'male', $jobs2[$i % 8]); $f = $addP('Marie', 'BIGF' . $i, 'female'); $ev($h, $T['BIRT'], sprintf('%04d-%02d-%02d', 1600 + $i % 20, 1 + $i % 12, 1 + $i % 28), '', $pid[$i % 10]); $ev($f, $T['BIRT'], sprintf('%04d-%02d-%02d', 1602 + $i % 20, 1 + ($i * 5) % 12, 1 + $i % 28), '', $pid[($i + 3) % 10]); $gen[] = [$h, $f, 1600 + $i % 20]; }
    $n = 160;
    for ($g = 1; $g < 8 && $n < 5000; $g++) {
        $next = [];
        foreach ($gen as $j => [$h, $f, $y]) {
            $fid = $fam($h, $f, 0);
            $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,year,sort_date,place_id) VALUES('family',?,?,?,?,?)")->execute([$fid, $T['MARR'], $y + 24, sprintf('%04d-%02d-%02d', $y + 24, 1 + ($j * 7) % 12, 1 + $j % 28), $pid[$j % 10]]);
            for ($k = 0; $k < 4 && $n < 5000; $k++) {
                $male = ($k + $j) % 2 === 0; $c = $addP($male ? 'Pierre' : 'Anne', 'BIG' . $j, $male ? 'male' : 'female', $male ? $jobs2[($j + $k + $g) % 8] : ''); $fam($h, $f, $c); $n++;
                $by = $y + 26 + $k * 2; $ev($c, $T['BIRT'], sprintf('%04d-%02d-%02d', $by, 1 + ($k * 4 + $j) % 12, 1 + $k), '', $pid[($j + $k) % 10]); $ev($c, $T['DEAT'], sprintf('%04d-06-01', $by + ($k * 23 + $j) % 85), '', $pid[$j % 10]);
                if ($k < 2 && count($next) < 400) { $sp2 = $addP($male ? 'Rose' : 'Louis', 'SP' . $n, $male ? 'female' : 'male'); $n++; $ev($sp2, $T['BIRT'], sprintf('%04d-02-02', $by + 1), '', $pid[($j + 5) % 10]); $next[] = $male ? [$c, $sp2, $by] : [$sp2, $c, $by]; }
            }
        }
        $gen = $next;
    }
    $pdo->commit();
}
echo 'ok famille ' . $root . "\n";
