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

// des portraits (des aplats de couleur suffisent) : la mosaïque, le visage de la lignée, le fond d'écran
$portrait = function (int $pid, string $file, string $b64) use ($db) { file_put_contents(MEDIA_DIR . '/' . $file, base64_decode($b64)); $db->prepare("INSERT INTO media(title, media_type, filename, thumbnail, is_person_photo) VALUES(?, 'image', ?, ?, 1)")->execute(['Portrait', $file, $file]); $m = (int) $db->lastInsertId(); $db->prepare('UPDATE persons SET portrait_media_id=? WHERE id=?')->execute([$m, $pid]); $db->prepare("INSERT INTO media_links(media_id, entity_type, entity_id) VALUES(?, 'person', ?)")->execute([$m, $pid]); return $m; };
$portrait($g1, 'portrait-antoine.png', 'iVBORw0KGgoAAAANSUhEUgAAACgAAAAyCAIAAACh0Q7HAAABAElEQVR42sXN1VEDABBF0VcTHoi7Bw/0ibuT4HQEO7s17J05/0dHxQV3XFp0J+Uld1pZdmfVFXdeW3UX9TV32Si4q+a6u25tuJt20d12Su6uW3b3vYqQNeL81WJkfehXhawR568WI+vjoCZkjTh/tRhZn4Z1IWvE+avFyPo8aghZI85fLUbWl3FTyBpx/moxsr5OWkLWiPNXi5F1ttkWskacv1qMrPOtjpA14vzVYmR92+4KWSPOXy1G1vednpA14vzVYmT92O0LWSPOXy1G1s+9gZA14vzVYmT92h8KWSPOXy1G1u/pSMgacf5qMbL+HIyFrBHnrxYj6+/hRMj67w/pQioot2C5wAAAAABJRU5ErkJggg==');
$portrait($c1, 'portrait-jean.png', 'iVBORw0KGgoAAAANSUhEUgAAACgAAAAyCAIAAACh0Q7HAAABAElEQVR42sXN1VEDABBF0VcYHoi7Bw+0g7uT4HQJO7s17J05/0cLR0W3eFxySydlt3xacStnVbd6XnNrF3VXuGy49aum27huueJN25VuO65813WV+56QNeL81WJkrT70hawR568WI2vtcSBkjTh/tRhZ609DIWvE+avFyNp4HglZI85fLUbW5stYyBpx/moxsrZeJ0LWiPNXi5G1PdsUskacv1qMrJ35lpA14vzVYmTtvm0LWSPOXy1G1t77jpA14vzVYmTtf+wKWSPOXy1G1sHnnpA14vzVYmQdfu0LWSPOXy1G1tH3VMgacf5qMbKOfw6ErBHnrxYj6+T3UMj67w/mzY3Zaf1k7QAAAABJRU5ErkJggg==');
$portrait($d1, 'portrait-henri.png', 'iVBORw0KGgoAAAANSUhEUgAAACgAAAAyCAIAAACh0Q7HAAABB0lEQVR42sXN1VEEAAxF0VcTLO7ubou7LNIY7u6w0BZkkhpyZ87/UcXooascO3KF8WNXNXHiqidPXc3UmaudPnd1MxeuvnjpGmavXOPctWuav3HNC7euZfFOyBpx/moxsrYu3QtZI85fLUbWtuUHIWvE+avFyNq+8ihkjTh/tRhZO1afhKwR568WI2vn2rOQNeL81WJk7Vp/EbJGnL9ajKzdG69C1ojzV4uRtWfzTcgacf5qMbL2br0LWSPOXy1G1r7tDyFrxPmrxcjav/MpZI04f7UYWQdKX0LWiPNXi5F1cPdbyBpx/moxsg7tlYWsEeevFiPr8P6PkDXi/NViZB05+BWy/vsDpe54SOPxVrQAAAAASUVORK5CYII=');
// un visage encadré sur l'acte (le visage de la lignée prend d'abord les visages repérés)
$db->prepare("INSERT INTO media_tags(media_id, person_id, x, y, w, h, tag_type) VALUES(?,?,0,0,50,100,'person')")->execute([$mid, $d1]);
echo 'ok';
