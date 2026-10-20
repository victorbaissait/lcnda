<?php
/**
 * Petite généalogie pour tester les diagrammes en plus (tests/test-diagram-more.js) : celle des diagrammes Généalogie
 * (tests/fixtures/diagram-genea-seed.php : 7 générations, trous, implexe, descendance), plus des coordonnées et des
 * lieux de mariage, une fratrie avec ses mariages et ses enfants, des variantes de noms, des vivants, des décès
 * pendant le choléra de 1832 et la Grande Guerre.
 *   GENEALOGY_DATA_DIR=… php tests/fixtures/diagram-more-seed.php
 */
require __DIR__ . '/diagram-genea-seed.php';
$coords = ['Rennes' => [48.1147, -1.6794], 'Vitré' => [48.1236, -1.2094], 'Caen' => [49.1829, -0.3707], 'Angers' => [47.4784, -0.5632], 'Poitiers' => [46.5802, 0.3404], 'Paris' => [48.8566, 2.3522]];
foreach ($coords as $n => [$la, $lo]) { $pdo->prepare('UPDATE places SET latitude=?, longitude=? WHERE name=?')->execute([$la, $lo, $n]); }
// mariages : un lieu (celui de la naissance de l'épouse, ou Rennes)
foreach ($pdo->query("SELECT e.id, f.partner2_id FROM events e JOIN families f ON f.id=e.family_id WHERE e.scope='family'")->fetchAll() as $i => $m) {
    $pl = (int) $pdo->query('SELECT place_id FROM events WHERE person_id=' . (int) $m['partner2_id'] . ' AND place_id IS NOT NULL LIMIT 1')->fetchColumn();
    $pdo->prepare('UPDATE events SET place_id=? WHERE id=?')->execute([$i % 3 ? ($pl ?: $pid[0]) : $pid[1], $m['id']]);
}
// une fratrie : les frères et sœurs du n° 2, avec mariages et enfants
$father = $sosa[4]; $mother = $sosa[5];
$s = $pdo->prepare('SELECT family_id FROM family_children WHERE child_id=?'); $s->execute([$sosa[2]]); $famId = (int) $s->fetchColumn();
$sib = [];
foreach ([['Paul', 'male', 1958, 1990], ['Lucie', 'female', 1962, 2015], ['Marc', 'male', 1966, null], ['Hélène', 'female', 1969, 1971]] as $k => [$fn, $g, $by, $dy]) {
    $c = $addP($fn, 'MARTIN', $g); $pdo->prepare('INSERT INTO family_children(family_id,child_id,position) VALUES(?,?,?)')->execute([$famId, $c, $k + 2]);
    $ev($c, $T['BIRT'], sprintf('%04d-03-1%d', $by, $k), "1$k/03/$by", $pid[0]);
    if ($dy) { $ev($c, $T['DEAT'], sprintf('%04d-06-01', $dy), "1/6/$dy", $pid[0]); } else { $pdo->exec("UPDATE persons SET living_status='living' WHERE id=$c"); }
    $sib[] = $c;
}
foreach ([[$sib[0], 1982], [$sib[1], 1985]] as [$p, $y]) {
    $sp = $addP('Claire', 'ROBIN', 'female'); $f = $fam($p, $sp, 0);
    $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',?,?,?,?,?,?)")->execute([$f, $T['MARR'], (string) $y, $y, "$y-07-01", $pid[2]]);
    for ($k = 0; $k < 2; $k++) { $c = $addP('Enfant' . $k, 'MARTIN', 'male'); $fam($p, $sp, $c); $ev($c, $T['BIRT'], sprintf('%04d-02-0%d', $y + 2 + $k * 3, $k + 1), '', $pid[0]); }
}
// variantes de noms (MARTIN, Martins) et un groupe de noms
$pdo->exec("UPDATE persons SET last_name='Martins' WHERE id=" . $sosa[16]);
// des décès pendant les crises (choléra de 1832 à Rennes, Grande Guerre)
for ($i = 0; $i < 12; $i++) { $x = $addP('Victime' . $i, 'DURAND', $i % 2 ? 'female' : 'male'); $ev($x, $T['BIRT'], sprintf('%04d-01-01', 1790 + $i), '', $pid[0]); $ev($x, $T['DEAT'], $i < 7 ? '1832-08-1' . ($i % 9) : sprintf('%04d-09-01', 1914 + $i % 4), '', $pid[0]); }
// la racine Sosa : vivante
$pdo->exec("UPDATE persons SET living_status='living' WHERE id=" . $sosa[1]);
echo 'ok fratrie ' . implode(',', $sib) . "\n";
