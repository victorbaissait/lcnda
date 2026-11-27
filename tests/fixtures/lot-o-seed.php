<?php
// 🌳 Lot O : une petite famille fictive (MAZAUD, LACOMBE, DURAND) pour tests/test-lot-o-arbre.js.
// Lancé avec GENEALOGY_DATA_DIR vers un dossier vide : crée la base, puis les fiches.
require 'lib/paths.php';
$p0 = new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT . '/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$P = [
    // id, prénom, nom, sexe, état, métier
    [1, 'Louis', 'MAZAUD', 'male', 'deceased', 'Cheminot'],
    [2, 'Jean', 'MAZAUD', 'male', 'deceased', 'Laboureur'],
    [3, 'Marie', 'DURAND', 'female', 'deceased', ''],
    [4, 'Pierre', 'MAZAUD', 'male', 'deceased', 'Cultivateur'],
    [5, 'Anne', 'LACOMBE', 'female', 'deceased', ''],
    [8, 'Léonard', 'MAZAUD', 'male', 'deceased', 'Laboureur'],
    [9, 'Jeanne', 'LACOMBE', 'female', 'deceased', ''],
    [10, 'Catherine', 'MAZAUD', 'female', 'deceased', ''],
    [11, 'Jacques', 'DURAND', 'male', 'deceased', 'Maçon'],
    [12, 'Jeanne', 'MAZAUD', 'female', 'deceased', ''],
    [13, 'Paul', 'MAZAUD', 'male', 'deceased', ''],
    [14, 'Antoine', 'LACOMBE', 'male', 'deceased', ''],
    [15, 'Honoré', 'DURAND', 'male', 'deceased', ''],
    [20, 'Rose', 'LACOMBE', 'female', 'deceased', ''],
    [30, 'Camille', 'MAZAUD', 'female', 'living', ''],
    [31, 'Hugo', 'VIVANT', 'male', 'living', ''],
];
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,?,?,?)');
foreach ($P as [$id, $f, $l, $g, $s]) { $ins->execute([$id, $f, $l, $g, $s, $id === 1 ? 1 : 0]); }
$cols = array_column($pdo->query('PRAGMA table_info(persons)')->fetchAll(), 'name');
if (in_array('occupation', $cols, true)) { $o = $pdo->prepare('UPDATE persons SET occupation=? WHERE id=?'); foreach ($P as $r) { if ($r[5] !== '') { $o->execute([$r[5], $r[0]]); } } }
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Seilhac','Corrèze','France',45.367,1.713),(2,'Tulle','Corrèze','France',45.267,1.771),(3,'Uzerche','Corrèze','France',45.424,1.563),(4,'Nice','Alpes-Maritimes','France',43.703,7.266),(5,'Paris','Paris','France',48.857,2.352)");
$t = static fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,title,description) VALUES('person',?,?,?,?,?,?,'','')");
$life = [
    // id, naissance, lieu, décès, lieu
    [1, '1880-03-02', 2, '1950-06-01', 2], [2, '1852-02-10', 1, '1921-04-03', 2], [3, '1855-08-15', 3, '1930-01-01', 2], [4, '1820-05-05', 1, '1856-05-01', 1],
    [5, '1822-01-01', 1, '1890-01-01', 1], [8, '1765-01-01', 1, '1830-01-01', 1], [9, '1768-01-01', 1, '1835-01-01', 1], [10, '1792-01-01', 1, '1860-01-01', 3],
    [11, '1825-01-01', 3, '1890-01-01', 3], [12, '1876-08-10', 1, '1950-01-01', 1], [13, '1856-12-01', 1, '1920-01-01', 1], [14, '1825-01-01', 1, '1895-01-01', 1],
    [15, '1790-01-01', 4, '1850-01-01', 4], [20, '1800-01-01', 1, '1870-01-01', 1], [30, '1990-01-01', 5, null, null], [31, '1992-05-05', 5, null, null],
];
foreach ($life as [$id, $b, $bp, $d, $dp]) {
    $ev->execute([$id, $t('BIRT'), $b, (int) $b, $b, $bp]);
    if ($d) { $ev->execute([$id, $t('DEAT'), $d, (int) $d, $d, $dp]); }
}
// familles : 1 Léonard × Jeanne ; 2 Pierre × Anne ; 3 Jean × Marie (cousins) ; 4 Honoré DURAND × Catherine ; 5 Jacques DURAND × Rose ; 6 Antoine × Anne (remariage) ; 7 Louis × ? (vivante)
$pdo->exec('INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,8,9),(2,4,5),(3,2,3),(4,15,10),(5,11,20),(6,14,5),(7,1,31)');
$pdo->exec('INSERT INTO family_children(family_id,child_id,position) VALUES(1,4,0),(1,10,1),(2,2,0),(2,13,1),(4,11,0),(5,3,0),(3,12,0),(3,1,1),(7,30,0)');
$m = $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',?,?,?,?,?,1)");
foreach ([[1, '1788-11-20'], [2, '1850-06-12'], [3, '1876-03-02'], [4, '1789-12-14'], [5, '1850-02-20'], [6, '1858-01-15'], [7, '1905-06-06']] as [$f, $d]) { $m->execute([$f, $t('MARR'), $d, (int) $d, $d]); }
$ecols = array_column($pdo->query('PRAGMA table_info(events)')->fetchAll(), 'name');
if (in_array('signed1', $ecols, true)) {
    $s = $pdo->prepare("UPDATE events SET signed1=?, signed2=? WHERE family_id=? AND scope='family'");
    $s->execute([0, 0, 1]); $s->execute([0, 0, 2]); $s->execute([1, 0, 3]);
}
echo json_encode(['ok' => 1, 'occupation' => in_array('occupation', $cols, true), 'signed' => in_array('signed1', $ecols, true)]);
