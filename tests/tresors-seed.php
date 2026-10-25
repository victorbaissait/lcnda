<?php
// Un petit arbre pour les essais des Trésors (tests/test-tresors.js) : 4 générations, mariages, métiers, lieux, dates précises.
require 'lib/paths.php';
$p = new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT . '/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $db = db();
$tag = fn(string $t) => (int) $db->query("SELECT id FROM event_types WHERE gedcom_tag='$t' LIMIT 1")->fetchColumn();
$B = $tag('BIRT'); $D = $tag('DEAT'); $M = $tag('MARR'); $O = $tag('OCCU');
$places = [['Tulle', 45.267, 1.771], ['Naves', 45.313, 1.767], ['Paris', 48.857, 2.352], ['Brive-la-Gaillarde', 45.158, 1.533], ['Lyon', 45.764, 4.836]];
$pl = []; foreach ($places as [$n, $la, $lo]) { $db->prepare('INSERT INTO places(name, latitude, longitude, country) VALUES(?,?,?,?)')->execute([$n, $la, $lo, 'France']); $pl[$n] = (int) $db->lastInsertId(); }
$person = function (string $first, string $last, string $g, ?string $birth, ?string $bplace, ?string $death = null, ?string $dplace = null, string $occ = '', bool $start = false, string $living = 'deceased') use ($db, $B, $D, $O, $pl) {
    $db->prepare('INSERT INTO persons(first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,?,?)')->execute([$first, $last, $g, $living, $start ? 1 : 0]); $id = (int) $db->lastInsertId();
    $ev = function (int $t, ?string $d, ?string $place, string $title = '') use ($db, $id, $pl) { if (!$d) return; $db->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,title) VALUES('person',?,?,?,?,?,?,?)")->execute([$id, $t, $d, (int) substr($d, 0, 4), $d, $place ? $pl[$place] : null, $title]); };
    $ev($B, $birth, $bplace); $ev($D, $death, $dplace); if ($occ) { $ev($O, $birth ? (string) ((int) substr($birth, 0, 4) + 25) . '-01-01' : null, $bplace, $occ); }
    return $id;
};
$couple = function (int $a, int $b, ?string $date, ?string $place, array $kids) use ($db, $M, $pl) {
    $db->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $db->lastInsertId();
    if ($date) { $db->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',?,?,?,?,?,?)")->execute([$f, $M, $date, (int) substr($date, 0, 4), $date, $place ? $pl[$place] : null]); }
    foreach ($kids as $k) { $db->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$f, $k]); }
    return $f;
};
// génération 4 (arrière-grands-parents)
$g1 = $person('Antoine', 'MARTIN', 'male', '1850-03-12', 'Naves', '1920-05-02', 'Naves', 'sabotier');
$g2 = $person('Marie', 'DURAND', 'female', '1855-07-08', 'Tulle', '1930-11-30', 'Tulle', 'couturière');
$g3 = $person('Pierre', 'FAURE', 'male', '1848-12-12', 'Brive-la-Gaillarde', '1905-12-12', 'Brive-la-Gaillarde', 'laboureur');
$g4 = $person('Jeanne', 'BORIE', 'female', '1852-03-12', 'Naves', '1915-03-12', 'Naves', 'ménagère');
// génération 3
$c1 = $person('Jean', 'MARTIN', 'male', '1877-03-12', 'Naves', '1950-01-15', 'Paris', 'cheminot');
$c2 = $person('Louise', 'FAURE', 'female', '1880-09-21', 'Brive-la-Gaillarde', '1960-02-02', 'Paris', 'institutrice');
$c3 = $person('Paul', 'MARTIN', 'male', '1879-06-01', 'Naves', '1916-02-25', 'Verdun', 'menuisier');
$c4 = $person('Rose', 'FAURE', 'female', '1883-04-04', 'Brive-la-Gaillarde', '1970-07-07', 'Lyon', 'tisserande');
$couple($g1, $g2, '1876-05-20', 'Naves', [$c1, $c3]);
$c5 = $person('Marcel', 'FAURE', 'male', '1885-01-30', 'Naves', '1940-06-10', 'Naves', 'forgeron');
$c6 = $person('Émile', 'FAURE', 'male', '1888-08-08', 'Naves', '1918-10-01', 'Somme', 'cultivateur');
$c7 = $person('Berthe', 'FAURE', 'female', '1890-12-25', 'Naves', '1975-01-01', 'Tulle', 'repasseuse');
$couple($g3, $g4, '1878-02-14', 'Naves', [$c2, $c4, $c5, $c6, $c7]);
// génération 2
$d1 = $person('Henri', 'MARTIN', 'male', '1905-08-30', 'Paris', '1985-03-12', 'Paris', 'mécanicien');
$d2 = $person('Suzanne', 'LEROY', 'female', '1908-01-01', 'Lyon', '1999-09-09', 'Lyon', 'secrétaire');
$d3 = $person('Lucien', 'MARTIN', 'male', '1907-11-11', 'Paris', '1975-04-04', 'Paris', 'boulanger');
$couple($c1, $c2, '1903-06-15', 'Paris', [$d1, $d3]);
// génération 1 et la personne de départ
$e1 = $person('Claude', 'MARTIN', 'male', '1935-12-24', 'Lyon', null, null, 'ingénieur', false, 'deceased');
$couple($d1, $d2, '1932-10-10', 'Lyon', [$e1]);
$e2 = $person('Anne', 'MOREL', 'female', '1938-02-02', 'Tulle', null, null, 'pharmacienne');
$me = $person('Léa', 'MARTIN', 'female', '1990-03-12', 'Lyon', null, null, '', true, 'living');
$h2 = $person('Henri', 'MARTIN', 'male', '1994-05-05', 'Lyon', null, null, '', false, 'living'); // comme son grand-père Henri (le prénom saute une génération)
$couple($e1, $e2, '1960-04-04', 'Tulle', [$me, $h2]);
// une somme d'autrefois (le pouvoir d'achat) : la dot du mariage d'Antoine et Marie
$db->exec("UPDATE events SET description='contrat chez Me Brousse, dot de 1200 francs' WHERE family_id=1");
// une signature repérée sur un acte (le mur des signatures) : Jean MARTIN, 1903
file_put_contents(MEDIA_DIR . '/acte-1903.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAHgAAAA8CAIAAAAiz+n/AAABG0lEQVR42u3asRHCQAxE0S3FpVE9DZAQ0gARllar489sjMTDls3d6f16EkMEAdBAE6CBBhoFoIEmQAMNNApAA02ABhpoAjTQ93Jdj68JBKpqTznKada1vSmHOMq6vDFF3YMh1h2/utJaH7duakCBrQ9a95X2QYd84amiClQese4up0xlv3V3IYVfIx5rQwnld9+t4LlptGLe9V3XtumkLa13fKzzGfC/0Oa3Gu2ad7Vz3/mernVPlS1vMl3Qtu7vFxr5f6+N8+5OualVFG2cdz8XHVwX1EbldYuCZdDha8cJ2zcF0CG7IcnKhxw3WLEVeci5jvzd3nMO0ISfX+CkEtBAE6CBBhoCoIEmQAMNNApAA02ABhpoFIA+KB9LCzNHbiPVGAAAAABJRU5ErkJggg=='));
$db->prepare("INSERT INTO media(title, media_type, filename, thumbnail, date_text) VALUES('Acte de mariage', 'image', 'acte-1903.png', 'acte-1903.png', '15 juin 1903')")->execute(); $mid = (int) $db->lastInsertId();
try { $db->exec("ALTER TABLE media_tags ADD COLUMN tag_type TEXT NOT NULL DEFAULT 'person'"); } catch (Throwable $_) {}
$db->prepare("INSERT INTO media_tags(media_id, person_id, x, y, w, h, tag_type) VALUES(?,?,10,20,80,60,'signature')")->execute([$mid, $c1]);
echo 'ok';
