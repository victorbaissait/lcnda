<?php
/**
 * Petite généalogie pour tester les diagrammes Généalogie et Frises (tests/test-diagram-genea.js) :
 * une ascendance de 7 générations avec des trous et un implexe, une descendance, des dates complètes ou non,
 * des lieux (département, région), des métiers, des témoins et parrains, des étiquettes, un nom piégé.
 *   GENEALOGY_DATA_DIR=… php tests/fixtures/diagram-genea-seed.php [personnes en plus]
 */
chdir(__DIR__ . '/../..');
require 'lib/paths.php';
@mkdir(DATA_DIR, 0777, true);
if (!is_file(DATA_DIR . '/genealogy.sqlite')) {
    $p = new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite');
    $p->exec(file_get_contents(APP_ROOT . '/data/schema.sql'));
    $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Seed','Seed','male')");
    $p = null;
}
require 'lib/bootstrap.php';
$pdo = db();
$pdo->exec('DELETE FROM persons'); $pdo->exec('DELETE FROM families'); $pdo->exec('DELETE FROM family_children'); $pdo->exec('DELETE FROM events'); $pdo->exec('DELETE FROM places');
$tag = static function (string $t) use ($pdo): int { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$T = ['BIRT' => $tag('BIRT'), 'DEAT' => $tag('DEAT'), 'MARR' => $tag('MARR'), 'CHR' => $tag('CHR')];
$places = [['Rennes', 'Ille-et-Vilaine', 'Bretagne'], ['Vitré', 'Ille-et-Vilaine', 'Bretagne'], ['Caen', 'Calvados', 'Normandie'], ['Angers', 'Maine-et-Loire', 'Pays de la Loire'], ['Poitiers', 'Vienne', 'Nouvelle-Aquitaine'], ['Paris', 'Paris', 'Île-de-France']];
$pid = [];
foreach ($places as [$n, $c, $s]) { $pdo->prepare("INSERT INTO places(name,county,state,country) VALUES(?,?,?,'France')")->execute([$n, $c, $s]); $pid[] = (int) $pdo->lastInsertId(); }
$first = [['Jean', 'Pierre', 'Louis', 'François', 'Joseph', 'Jacques', 'Julien', 'René'], ['Marie', 'Anne', 'Jeanne', 'Françoise', 'Perrine', 'Julienne', 'Louise', 'Rose']];
$last = ['MARTIN', 'DURAND', 'PETIT', 'MOREAU', 'GARNIER', 'ROUX', 'FOURNIER', 'GIRARD', 'BONNET', 'LAMBERT', 'ROBIN', 'MASSON'];
$jobs = ['laboureur', 'tisserand', 'meunier', 'journalier', 'marchand'];
$addP = static function (string $f, string $l, string $g, string $job = '') use ($pdo): int { $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,occupation,living_status) VALUES(?,?,?,?,?)')->execute([$f, $l, $g, $job, 'deceased']); return (int) $pdo->lastInsertId(); };
$ev = static function (int $p, int $type, string $sort, string $text, ?int $place) use ($pdo): int { $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)")->execute([$p, $type, $text, (int) substr($sort, 0, 4), $sort, $place]); return (int) $pdo->lastInsertId(); };
$fam = static function (int $a, int $b, int $child) use ($pdo): int {
    $s = $pdo->prepare('SELECT id FROM families WHERE partner1_id=? AND partner2_id=?'); $s->execute([$a, $b]); $f = (int) $s->fetchColumn();
    if (!$f) { $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId(); }
    if ($child) { $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$f, $child]); }
    return $f;
};
// l'ascendance : Sosa 1 à 127, quelques branches inconnues ; le n° 1 a un nom piégé
$sosa = [];
for ($s = 1; $s < 128; $s++) {
    $g = (int) floor(log($s, 2));
    if ($g >= 3 && ($s * 13) % 11 === 0) { continue; }
    if ($s > 1 && !isset($sosa[intdiv($s, 2)])) { continue; }
    $female = $s > 1 && $s % 2 === 1;
    $l = $s === 1 ? 'MARTIN <img src=x onerror="window.__xss=1">' : ($s % 2 === 0 ? (isset($sosa[intdiv($s, 2)]) ? $pdo->query('SELECT last_name FROM persons WHERE id=' . $sosa[intdiv($s, 2)])->fetchColumn() : 'MARTIN') : $last[($s * 7) % count($last)]);
    if ($s === 2) { $l = 'MARTIN'; }
    $id = $addP($first[$female ? 1 : 0][($s * 5 + $g) % 8], $l, $female ? 'female' : 'male', $jobs[$s % 5]);
    $sosa[$s] = $id;
    $y = 1990 - $g * 29 - ($s % 5) * 2; $m = 1 + ($s * 5) % 12; $d = 1 + ($s * 7) % 28;
    $place = $pid[($s >> max(0, $g - 2)) % count($pid)];
    $ev($id, $s % 3 === 0 ? $T['CHR'] : $T['BIRT'], $s % 4 === 3 ? sprintf('%04d-00-00', $y) : sprintf('%04d-%02d-%02d', $y, $m, $d), $s % 4 === 3 ? (string) $y : "$d/$m/$y", $s % 6 ? $place : null);
    if ($s > 1 && $s % 5 !== 1) { $ev($id, $T['DEAT'], sprintf('%04d-%02d-%02d', $y + 50 + $s % 30, 1 + ($s * 3) % 12, 1 + ($s * 11) % 28), '', $place); }
}
$pdo->exec('UPDATE persons SET is_start=0'); $pdo->exec('UPDATE persons SET is_start=1 WHERE id=' . $sosa[1]);
for ($s = 1; $s < 64; $s++) {
    if (!isset($sosa[$s])) { continue; }
    $f = $sosa[$s * 2] ?? 0; $m = $sosa[$s * 2 + 1] ?? 0;
    if ($f && $m) { $fid = $fam($f, $m, $sosa[$s]); $y = (int) $pdo->query('SELECT year FROM events WHERE person_id=' . $sosa[$s] . ' LIMIT 1')->fetchColumn() - 2;
        $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date) VALUES('family',?,?,?,?,?)")->execute([$fid, $T['MARR'], "$y", $y, sprintf('%04d-%02d-%02d', $y, 1 + $s % 12, 1 + ($s * 3) % 28)]); }
    elseif ($f || $m) { $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$f ?: null, $m ?: null]); $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([(int) $pdo->lastInsertId(), $sosa[$s]]); }
}
// implexe : les parents du n° 40 sont aussi ceux du n° 42 (deux frères et sœurs dans l'ascendance)
if (isset($sosa[42], $sosa[80], $sosa[81])) { $fam($sosa[80], $sosa[81], $sosa[42]); $pdo->exec('DELETE FROM family_children WHERE child_id=' . $sosa[42] . ' AND family_id NOT IN (SELECT id FROM families WHERE partner1_id=' . $sosa[80] . ')'); }
// une descendance : les enfants des enfants du n° 16
$parents = [$sosa[16] ?? $sosa[8]];
for ($g = 0; $g < 3; $g++) { $next = [];
    foreach ($parents as $p) { $sp = $addP($first[1][$g + 1], $last[($p + $g) % 12], 'female'); for ($k = 0; $k < 2 + ($p + $g) % 3; $k++) { $c = $addP($first[$k % 2][($k + $g) % 8], 'MARTIN', $k % 2 ? 'female' : 'male'); $fam($p, $sp, $c); $ev($c, $T['BIRT'], sprintf('%04d-%02d-%02d', 1860 + $g * 25 + $k, 1 + $k, 2 + $k), '', $pid[0]); if ($k % 2 === 0) { $next[] = $c; } } }
    $parents = array_slice($next, 0, 6); }
// témoins et parrains
$pdo->exec("CREATE TABLE IF NOT EXISTS event_witnesses (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, person_id INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
$ids = array_values($sosa);
$evs = $pdo->query('SELECT id, person_id FROM events WHERE person_id IS NOT NULL ORDER BY id LIMIT 60')->fetchAll();
foreach ($evs as $i => $e) { foreach ([['parrain', 3], ['marraine', 5], ['témoin', 7]] as [$role, $k]) { $w = $ids[($i * $k + 1) % count($ids)]; if ($w !== (int) $e['person_id']) { $pdo->prepare('INSERT INTO event_witnesses(event_id,person_id,note) VALUES(?,?,?)')->execute([$e['id'], $w, $role]); } } }
$pdo->prepare('INSERT INTO event_witnesses(event_id,person_id,note) VALUES(?,?,?)')->execute([$evs[0]['id'], $ids[3], 'voisin <b>piégé</b>']);
// étiquettes
$pdo->exec("INSERT OR IGNORE INTO labels(name,color) VALUES('À vérifier','#e15759'),('Branche bretonne','#4e79a7'),('Photo à trouver <i>x</i>','#59a14f')");
$lab = $pdo->query('SELECT id FROM labels ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
foreach ($ids as $i => $p) { foreach ($lab as $j => $l) { if (($i + $j) % ($j + 2) === 0) { $pdo->prepare("INSERT OR IGNORE INTO label_links(label_id,entity_type,entity_id) VALUES(?,'person',?)")->execute([$l, $p]); } } }
// beaucoup de personnes en plus (essais de vitesse)
$more = (int) ($argv[1] ?? 0);
if ($more > 0) {
    $pdo->beginTransaction();
    $ins = $pdo->prepare('INSERT INTO persons(first_name,last_name,gender) VALUES(?,?,?)');
    $e = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,year,sort_date) VALUES('person',?,?,?,?)");
    for ($i = 0; $i < $more; $i++) { $ins->execute([$first[$i % 2][$i % 8], $last[$i % 12], $i % 2 ? 'female' : 'male']); $id = (int) $pdo->lastInsertId(); $y = 1600 + $i % 400; $e->execute([$id, $T['BIRT'], $y, sprintf('%04d-%02d-%02d', $y, 1 + $i % 12, 1 + $i % 28)]); }
    $pdo->commit();
}
echo 'ok ' . count($sosa) . ' ancêtres, racine ' . $sosa[1] . "\n";
