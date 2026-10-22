<?php
/**
 * Petite généalogie pour tester les diagrammes D23 à D38 (tests/test-diagrammes-d23-d38.js) : celle des diagrammes
 * « de famille » (tests/fixtures/diagram-famille-seed.php), plus une famille de bûcherons de Pernay aux chiffres connus :
 *  - Jean BOIS (bûcheron, ° 1/3/1850 Pernay, † 1/5/1910) × Marie LEBLANC (° 1/2/1856 Pernay, † 1920) le 1/6/1874 à Pernay :
 *    Jean a signé, Marie « ne sait pas signer » ; un témoin a signé ; l'acte a une source ;
 *    trois enfants : ° 10/1/1875 († 1/6/1875, avant 1 an), ° 1/3/1877 († 1/4/1880, avant 5 ans), ° 1/5/1879 († 1950) ;
 *    veuve, Marie se remarie le 1/3/1912 avec Jacques NOYER (22 mois après) ;
 *  - Paul BOIS (Bûcheron, ° 1855 Pernay) : 3 enfants ; Louis CHENE (bûcheron, ° 1852 Pernay) : 2 enfants ;
 *    Marc HETRE (bûcheron, ° 1851 Tours) : 3 enfants ; Pierre ORME (laboureur, ° 1853 Pernay) : 3 enfants.
 *    → bûcheron + 3 enfants + né à Pernay : Jean et Paul seulement.
 *   GENEALOGY_DATA_DIR=… php tests/fixtures/diagram-vie-seed.php
 */
ob_start(); require __DIR__ . '/diagram-famille-seed.php'; $famOut = ob_get_clean();
if (!preg_match('/^ok famille/m', $famOut)) { fwrite(STDERR, $famOut); exit(1); }
$pdo->prepare("INSERT INTO places(name,county,state,country,latitude,longitude) VALUES('Pernay','Indre-et-Loire','Centre-Val de Loire','France',47.4477,0.4977)")->execute(); $pernay = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO places(name,county,state,country,latitude,longitude) VALUES('Tours','Indre-et-Loire','Centre-Val de Loire','France',47.3941,0.6848)")->execute(); $tours = (int) $pdo->lastInsertId();
$marr = static function (int $f, string $sort, ?int $place) use ($pdo, $T): int {
    $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',?,?,?,?,?,?)")->execute([$f, $T['MARR'], $sort, (int) substr($sort, 0, 4), $sort, $place]);
    return (int) $pdo->lastInsertId();
};
$ids = [];
// Jean BOIS et Marie LEBLANC
$jean = $addP('Jean', 'BOIS', 'male', 'bûcheron'); $marie = $addP('Marie', 'LEBLANC', 'female');
$ev($jean, $T['BIRT'], '1850-03-01', '1/3/1850', $pernay); $ev($jean, $T['DEAT'], '1910-05-01', '1/5/1910', $pernay);
$ev($marie, $T['BIRT'], '1856-02-01', '1/2/1856', $pernay); $ev($marie, $T['DEAT'], '1920-01-15', '15/1/1920', $pernay);
$f1 = $fam($jean, $marie, 0); $m1 = $marr($f1, '1874-06-01', $pernay);
$pdo->exec("UPDATE events SET signed1=1, signed2=0 WHERE id=$m1");
$wit = $addP('Étienne', 'TEMOIN', 'male');
$pdo->prepare('INSERT INTO event_witnesses(event_id,person_id,signed) VALUES(?,?,1)')->execute([$m1, $wit]);
$pdo->exec("INSERT INTO sources(title) VALUES('Registre de Pernay 1874')"); $src = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO source_links(source_id,entity_type,entity_id,source_record_id) VALUES(?,'event',?,?)")->execute([$src, $m1, $src]);
$ids = [$jean, $marie];
foreach ([['Pierre', 'male', '1875-01-10', '1875-06-01'], ['Rose', 'female', '1877-03-01', '1880-04-01'], ['Louis', 'male', '1879-05-01', '1950-01-01']] as [$fn, $g, $b, $d]) {
    $c = $addP($fn, 'BOIS', $g); $fam($jean, $marie, $c); $ev($c, $T['BIRT'], $b, '', $pernay); $ev($c, $T['DEAT'], $d, '', $pernay); $ids[] = $c;
}
$jacques = $addP('Jacques', 'NOYER', 'male'); $ev($jacques, $T['BIRT'], '1858-08-01', '', $tours); $ids[] = $jacques;
$f2 = $fam($jacques, $marie, 0); $marr($f2, '1912-03-01', $pernay);
// les autres pères de famille (le nombre d'enfants, le métier et le lieu de naissance comptent)
$fathers = [['Paul', 'BOIS', 'Bûcheron', '1855-04-02', $pernay, 3], ['Louis', 'CHENE', 'bûcheron', '1852-05-03', $pernay, 2], ['Marc', 'HETRE', 'bûcheron', '1851-06-04', $tours, 3], ['Pierre', 'ORME', 'laboureur', '1853-07-05', $pernay, 3]];
$fid = [];
foreach ($fathers as [$fn, $ln, $job, $b, $pl, $n]) {
    $p = $addP($fn, $ln, 'male', $job); $w = $addP('Anne', 'X' . $ln, 'female'); $ev($p, $T['BIRT'], $b, '', $pl);
    for ($k = 0; $k < $n; $k++) { $c = $addP('Enfant' . $k, $ln, 'female'); $fam($p, $w, $c); $ev($c, $T['BIRT'], sprintf('%04d-02-0%d', (int) substr($b, 0, 4) + 25 + $k * 2, $k + 1), '', $tours); }
    $fid[$fn . ' ' . $ln] = $p;
}
echo 'ok vie ' . json_encode(['jean' => $jean, 'marie' => $marie, 'paul' => $fid['Paul BOIS'], 'family' => $ids, 'pernay' => $pernay, 'm1' => $m1]) . "\n";
