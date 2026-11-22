<?php
/**
 * Petite généalogie inventée pour tests/test-diagrammes-lot-c.js (grille des recensements, schéma de preuve, arbre de mots,
 * zones des paroisses, carte en étoile) :
 *  - Jean MAZAUD (bûcheron, ° 1818 Naves, † 1884 Naves), personne de départ, × Marie LACOMBE (° 1822 Chanteix) en 1842 à Naves ;
 *    ses parents Antoine MAZAUD (° 1790 Naves, † 1850) et Anne BESSE (° 1795 Seilhac) ;
 *    leurs enfants Pierre (° 1845 Naves, † 1916 Buenos Aires, Argentine) et Louise (° 1848 Naves, × 1870 à Tulle, † 1931 Tulle) ;
 *  - Seilhac est rattaché à la paroisse d'Ancien Régime « Naves » (église : Naves) ;
 *  - recensements : Jean 1836 trouvé, 1846 non trouvé ; Pierre 1866 pas encore en France ;
 *  - un dossier de preuve (Antoine père de Jean) : 2 pour, 1 contre, 1 recherche, 1 conflit ; une hypothèse à deux réponses ;
 *  - deux transcriptions : « fils de Antoine MAZAUD… » (média de Jean) et « fils de Jean MAZAUD… » (atelier, Naves 1845).
 *   GENEALOGY_DATA_DIR=… php tests/fixtures/diagram-lot-c-seed.php   → « ok lotc {json des numéros} »
 */
require __DIR__ . '/../../lib/paths.php';
(new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT . '/data/schema.sql'));
require __DIR__ . '/../../lib/bootstrap.php';
$pdo = db();
$tag = static fn(string $t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$T = ['BIRT' => $tag('BIRT'), 'DEAT' => $tag('DEAT'), 'MARR' => $tag('MARR')];
$place = static function (string $n, string $c, string $ctry, float $la, float $lo) use ($pdo): int { $pdo->prepare('INSERT INTO places(name,county,country,latitude,longitude) VALUES(?,?,?,?,?)')->execute([$n, $c, $ctry, $la, $lo]); return (int) $pdo->lastInsertId(); };
$P = ['naves' => $place('Naves', 'Corrèze', 'France', 45.31, 1.77), 'chanteix' => $place('Chanteix', 'Corrèze', 'France', 45.32, 1.62), 'tulle' => $place('Tulle', 'Corrèze', 'France', 45.267, 1.77),
    'seilhac' => $place('Seilhac', 'Corrèze', 'France', 45.367, 1.712), 'ba' => $place('Buenos Aires', '', 'Argentine', -34.6, -58.38)];
$addP = static function (string $f, string $l, string $g, string $occ = '') use ($pdo): int { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,occupation) VALUES(?,?,?,'deceased',?)")->execute([$f, $l, $g, $occ]); return (int) $pdo->lastInsertId(); };
$ev = static function (int $p, int $t, int $y, int $pl) use ($pdo): int { $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)")->execute([$p, $t, (string) $y, $y, sprintf('%04d-01-01', $y), $pl]); return (int) $pdo->lastInsertId(); };
$fam = static function (int $a, int $b, array $kids, ?int $y = null, ?int $pl = null) use ($pdo, $T): int {
    $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$a, $b]); $f = (int) $pdo->lastInsertId();
    foreach ($kids as $k) { $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)')->execute([$f, $k]); }
    if ($y) { $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',?,?,?,?,?,?)")->execute([$f, $T['MARR'], (string) $y, $y, sprintf('%04d-06-01', $y), $pl]); }
    return $f;
};
$jean = $addP('Jean', 'MAZAUD', 'male', 'bûcheron'); $marie = $addP('Marie', 'LACOMBE', 'female');
$antoine = $addP('Antoine', 'MAZAUD', 'male', 'tisserand'); $anne = $addP('Anne', 'BESSE', 'female');
$pierre = $addP('Pierre', 'MAZAUD', 'male'); $louise = $addP('Louise', 'MAZAUD', 'female'); $gendre = $addP('Henri', 'FAURIE', 'male');
$pdo->exec("UPDATE persons SET is_start=1 WHERE id=$jean");
$ev($jean, $T['BIRT'], 1818, $P['naves']); $ev($jean, $T['DEAT'], 1884, $P['naves']);
$ev($marie, $T['BIRT'], 1822, $P['chanteix']); $ev($marie, $T['DEAT'], 1899, $P['naves']);
$ev($antoine, $T['BIRT'], 1790, $P['naves']); $ev($antoine, $T['DEAT'], 1850, $P['naves']); $ev($anne, $T['BIRT'], 1795, $P['seilhac']);
$ev($pierre, $T['BIRT'], 1845, $P['naves']); $ev($pierre, $T['DEAT'], 1916, $P['ba']);
$ev($louise, $T['BIRT'], 1848, $P['naves']); $ev($louise, $T['DEAT'], 1931, $P['tulle']); $ev($gendre, $T['BIRT'], 1846, $P['tulle']);
$fam($antoine, $anne, [$jean], 1815, $P['seilhac']); $fam($jean, $marie, [$pierre, $louise], 1842, $P['naves']); $fam($gendre, $louise, [], 1870, $P['tulle']);
// la paroisse d'Ancien Régime de Seilhac : Naves
$pdo->prepare("INSERT INTO place_parishes(place_id,place_text,parish_name,parish_place_id,until_year) VALUES(?,?,?,?,1790)")->execute([$P['seilhac'], 'Seilhac', 'Naves', $P['naves']]);
// recensements
$cens = static function (int $p, int $y, string $st, int $pl) use ($pdo): int { $pdo->prepare('INSERT INTO census_records(year,status,place_id) VALUES(?,?,?)')->execute([$y, $st, $pl]); $c = (int) $pdo->lastInsertId(); $pdo->prepare('INSERT INTO census_members(census_id,person_id,is_primary) VALUES(?,?,1)')->execute([$c, $p]); return $c; };
$c1 = $cens($jean, 1836, 'found', $P['naves']); $cens($jean, 1846, 'not_found', $P['naves']); $cens($pierre, 1866, 'not_in_france', $P['naves']);
// un dossier de preuve
require_once APP_ROOT . '/lib/preuve.php'; preuve_schema($pdo);
$pdo->prepare("INSERT INTO proof_cases(subject,person_id,related_id,question,conclusion,certainty) VALUES('parent',?,?,?,?,'probable')")->execute([$jean, $antoine, 'Antoine MAZAUD est-il le père de Jean ?', 'Oui, très probablement.']);
$case = (int) $pdo->lastInsertId();
foreach ([['for', 'Mariage de Jean : fils d’Antoine', 'original', ''], ['for', 'Recensement 1836 au foyer d’Antoine', 'derived', ''], ['against', 'Un autre Jean MAZAUD né en 1817', '', ''], ['research', 'Naissance de Jean : registre lacunaire', '', ''], ['conflict', 'Âge au décès différent', '', 'âge approximatif']] as $i => [$k, $t, $q, $res]) {
    $pdo->prepare('INSERT INTO proof_items(case_id,kind,text,quality,resolution,position) VALUES(?,?,?,?,?,?)')->execute([$case, $k, $t, $q, $res, $i]);
}
// une hypothèse à comparer (deux réponses)
require_once APP_ROOT . '/lib/hypothesis_compare.php';
$pdo->prepare("INSERT INTO hypotheses(person_id,type,title,statement) VALUES(?,'identity',?,?)")->execute([$pierre, 'Où est mort Pierre ?', 'deux pistes']); $hyp = (int) $pdo->lastInsertId();
try { hypothesis_compare_schema($pdo); } catch (Throwable $e) { /* déjà fait par les migrations */ }
$opt = static function (string $l) use ($pdo, $hyp): int { $pdo->prepare('INSERT INTO hypothesis_options(hypothesis_id,label) VALUES(?,?)')->execute([$hyp, $l]); return (int) $pdo->lastInsertId(); };
$o1 = $opt('Buenos Aires'); $o2 = $opt('Tulle');
foreach ([[$o1, 'for', 3, 'Acte de décès consulaire'], [$o1, 'for', 1, 'Lettre de sa sœur'], [$o2, 'against', 2, 'Absent des tables de Tulle']] as [$o, $st, $w, $txt]) {
    $pdo->prepare('INSERT INTO hypothesis_proofs(hypothesis_id,option_id,stance,weight,ref_text) VALUES(?,?,?,?,?)')->execute([$hyp, $o, $st, $w, $txt]);
}
// des transcriptions
$pdo->prepare("INSERT INTO media(title,media_type,transcription,date_text) VALUES('Mariage MAZAUD 1842','document',?,'1842')")->execute(['Jean MAZAUD, fils de Antoine MAZAUD et de Anne BESSE, cultivateurs. Marie LACOMBE, fille de feu Léonard LACOMBE.']);
$m = (int) $pdo->lastInsertId(); $pdo->prepare("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(?,'person',?)")->execute([$m, $jean]);
require_once APP_ROOT . '/lib/transcriptions.php'; act_transcriptions_ensure($pdo);
$pdo->prepare("INSERT INTO act_transcriptions(title,kind,date_text,place,body) VALUES('Naissance de Pierre','naissance','1845','Naves',?)")->execute(['Pierre, fils de Jean MAZAUD, bûcheron, et de Marie LACOMBE.']);
$pdo->prepare("INSERT INTO act_transcriptions(title,kind,date_text,place,body) VALUES('Décès à Tulle','deces','1931','Tulle',?)")->execute(['Louise MAZAUD, veuve de Henri FAURIE.']);
echo 'ok lotc ' . json_encode(['jean' => $jean, 'marie' => $marie, 'antoine' => $antoine, 'pierre' => $pierre, 'louise' => $louise, 'case' => $case, 'hyp' => $hyp, 'naves' => $P['naves'], 'seilhac' => $P['seilhac'], 'census' => $c1]) . "\n";
