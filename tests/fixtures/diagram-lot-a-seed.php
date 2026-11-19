<?php
/**
 * Petite généalogie (inventée) pour tester les diagrammes du lot A (tests/test-diagrammes-lot-a.js) :
 *  - Marie LACOMBE (° 1790, personne de départ) : ses parents Jean LACOMBE et Anne MAZAUD sont cousins germains
 *    (petits-enfants de Pierre LACOMBE × Jeanne ESTRADE) → F = 1/16 = 6,25 % ; Paul ADOPTE, adopté : pas de parents biologiques ;
 *  - des armoiries (Lacombe, Mazaud) reliées à Pierre LACOMBE et à Antoine MAZAUD ;
 *  - le groupe de noms « Lacombe » et des variantes (La Combe 1705, Lacoumbe 1725-1740) ;
 *  - deux recensements de Bort (1851 et 1856) aux âges écrits librement ; une source reliée.
 *   GENEALOGY_DATA_DIR=… php tests/fixtures/diagram-lot-a-seed.php   → « ok lot-a {json des numéros} »
 */
chdir(__DIR__ . '/../..');
require 'lib/paths.php';
@mkdir(DATA_DIR, 0777, true);
if (!is_file(DATA_DIR . '/genealogy.sqlite')) {
    $p = new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite');
    $p->exec(file_get_contents(APP_ROOT . '/data/schema.sql'));
    $p = null;
}
require 'lib/bootstrap.php';
$pdo = db();
$tag = static function (string $t) use ($pdo): int { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$T = ['BIRT' => $tag('BIRT'), 'DEAT' => $tag('DEAT'), 'MARR' => $tag('MARR')];
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude) VALUES('Bort','Corrèze','France',45.40,2.50)"); $bort = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO surname_groups(name) VALUES('Lacombe')"); $grp = (int) $pdo->lastInsertId();
$addP = static function (string $f, string $l, string $g, ?int $group = null) use ($pdo): int { $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,living_status,surname_group_id) VALUES(?,?,?,?,?)')->execute([$f, $l, $g, 'deceased', $group]); return (int) $pdo->lastInsertId(); };
$ev = static function (int $p, int $type, int $y) use ($pdo, $bort): int { $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)")->execute([$p, $type, (string) $y, $y, "$y-01-01", $bort]); return (int) $pdo->lastInsertId(); };
$fam = static function (int $a, int $b, array $kids, string $rel = 'biological', ?int $y = null) use ($pdo, $T): int {
    $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId();
    foreach ($kids as $k => $c) { $pdo->prepare('INSERT INTO family_children(family_id,child_id,relation_to_partner1,relation_to_partner2,position) VALUES(?,?,?,?,?)')->execute([$f, $c, $rel, $rel, $k]); }
    if ($y) { $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date) VALUES('family',?,?,?,?,?)")->execute([$f, $T['MARR'], (string) $y, $y, "$y-06-01"]); }
    return $f;
};
$pierre = $addP('Pierre', 'LACOMBE', 'male', $grp); $jeanne = $addP('Jeanne', 'ESTRADE', 'female');
$leonard = $addP('Léonard', 'LACOMBE', 'male', $grp); $catherine = $addP('Catherine', 'LACOMBE', 'female', $grp);
$mvergne = $addP('Marie', 'VERGNE', 'female'); $antoine = $addP('Antoine', 'MAZAUD', 'male');
$jean = $addP('Jean', 'LACOMBE', 'male', $grp); $anne = $addP('Anne', 'MAZAUD', 'female');
$marie = $addP('Marie', 'LACOMBE', 'female', $grp); $paul = $addP('Paul', 'ADOPTE', 'male');
$pdo->exec("UPDATE persons SET is_start=1 WHERE id=$marie");
foreach ([[$pierre, 1700], [$jeanne, 1702], [$leonard, 1725], [$catherine, 1728], [$mvergne, 1730], [$antoine, 1726], [$jean, 1755], [$anne, 1758], [$marie, 1790], [$paul, 1792]] as [$p, $y]) { $ev($p, $T['BIRT'], $y); }
$ev($pierre, $T['DEAT'], 1770); $ev($jean, $T['DEAT'], 1820);
$fam($pierre, $jeanne, [$leonard, $catherine], 'biological', 1722);
$fam($leonard, $mvergne, [$jean], 'biological', 1752);
$fam($antoine, $catherine, [$anne], 'biological', 1754);
$fam($jean, $anne, [$marie], 'biological', 1788);
$fam($jean, $anne, [$paul], 'adopted');
// armoiries
$pdo->exec("INSERT INTO coats_of_arms(title,blazon) VALUES('Lacombe','D’azur au chevron d’or'),('Mazaud','De gueules à trois besants d’argent')");
$coat1 = (int) $pdo->query("SELECT id FROM coats_of_arms WHERE title='Lacombe'")->fetchColumn(); $coat2 = (int) $pdo->query("SELECT id FROM coats_of_arms WHERE title='Mazaud'")->fetchColumn();
$pdo->prepare('INSERT INTO coat_of_arms_people(coat_id,person_id) VALUES(?,?),(?,?)')->execute([$coat1, $pierre, $coat2, $antoine]);
// variantes du nom
$pdo->prepare("INSERT INTO name_variants(person_id,last_name,from_year,to_year,source_note) VALUES(?,?,?,?,?),(?,?,?,?,?)")->execute([$jean, 'La Combe', 1705, null, 'Registres de Bort', $leonard, 'Lacoumbe', 1725, 1740, '']);
// recensements de Bort
$cens = static function (int $y, array $members) use ($pdo, $bort): int {
    $pdo->prepare("INSERT INTO census_records(year,status,place_id) VALUES(?,'found',?)")->execute([$y, $bort]); $c = (int) $pdo->lastInsertId();
    foreach ($members as [$name, $age, $role, $pid]) { $pdo->prepare('INSERT INTO census_members(census_id,person_id,display_name,age_text,household_position) VALUES(?,?,?,?,?)')->execute([$c, $pid, $name, $age, $role]); }
    return $c;
};
$cens(1851, [['Jean LACOMBE', '34', 'chef', $jean], ['Rose FAURIE', '30 ans', 'épouse', null], ['Louis FAURIE', '6 mois', 'fils', null], ['Inconnu', 'âgé', 'domestique', null], ['Marie LACOMBE', '61', 'mère', $marie]]);
$cens(1856, [['Rose FAURIE', '35', 'veuve', null], ['Louis FAURIE', '5', 'fils', null]]);
// une source sur la naissance de Jean
$pdo->exec("INSERT INTO sources(title) VALUES('Registre de Bort 1755')"); $src = (int) $pdo->lastInsertId();
$birthJean = (int) $pdo->query("SELECT id FROM events WHERE person_id=$jean AND event_type_id={$T['BIRT']}")->fetchColumn();
$pdo->prepare("INSERT INTO source_links(source_id,entity_type,entity_id,source_record_id) VALUES(?,'event',?,?)")->execute([$src, $birthJean, $src]);
echo 'ok lot-a ' . json_encode(compact('pierre', 'jeanne', 'leonard', 'catherine', 'antoine', 'jean', 'anne', 'marie', 'paul', 'bort', 'grp', 'src')) . "\n";
