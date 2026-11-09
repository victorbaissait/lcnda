<?php
declare(strict_types=1);

/**
 * Fabrique une TRÈS GROSSE base de test, réaliste, pour vérifier que l'app reste rapide (tests/test-grosse-base.js).
 *
 *   GENEALOGY_DATA_DIR=/un/dossier/vide GENEALOGY_MEDIA_DIR=/un/dossier/vide/media GENEALOGY_SKIP_REFERENCE=1 \
 *       php scripts/grosse-base.php 100000 [graine]
 *
 * - familles sur 13 générations (1650 → aujourd'hui), mariages dans le même « pays » ou avec une personne venue d'ailleurs ;
 * - 3 à 5 événements par personne (naissance, baptême, décès, inhumation, profession, résidence) + les mariages ;
 * - 20 000 lieux (communes inventées, rangées par département, avec coordonnées) — moins pour une petite base ;
 * - quelques médias (petites images), sources et citations, notes, étiquettes, une personne de départ (Sosa 1).
 * Même nombre + même graine = même base. Refuse d'écrire dans le dossier de données de l'app ou dans une base qui existe.
 */

if (PHP_SAPI !== 'cli') { exit(1); }
$target = max(50, (int) ($argv[1] ?? 100000));
$seed = (int) ($argv[2] ?? 1789);
mt_srand($seed);

$dirEnv = getenv('GENEALOGY_DATA_DIR');
if (!is_string($dirEnv) || trim($dirEnv) === '') { fwrite(STDERR, "Donne GENEALOGY_DATA_DIR (un dossier de test, jamais la vraie base).\n"); exit(1); }
require __DIR__ . '/../lib/paths.php';
if (realpath(DATA_DIR) === realpath(APP_ROOT . '/data')) { fwrite(STDERR, "Refusé : c'est le dossier de données de l'app.\n"); exit(1); }
@mkdir(DATA_DIR, 0775, true);
@mkdir(MEDIA_DIR, 0775, true);
$dbFile = DATA_DIR . '/genealogy.sqlite';
if (is_file($dbFile)) { fwrite(STDERR, 'Refusé : une base existe déjà dans ' . DATA_DIR . "\n"); exit(1); }

$t0 = microtime(true);
$p = new PDO('sqlite:' . $dbFile);
$p->exec(file_get_contents(APP_ROOT . '/data/schema.sql'));
$p = null;
require __DIR__ . '/../lib/bootstrap.php';
$pdo = db();
$pdo->exec('PRAGMA synchronous = OFF');
$type = static function (string $tag) use ($pdo): int {
    $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$tag]);
    return (int) $s->fetchColumn();
};
$T = ['BIRT' => $type('BIRT'), 'CHR' => $type('CHR'), 'DEAT' => $type('DEAT'), 'BURI' => $type('BURI'), 'MARR' => $type('MARR'), 'OCCU' => $type('OCCU'), 'RESI' => $type('RESI')];

$pick = static fn(array $a) => $a[mt_rand(0, count($a) - 1)];
$MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
$H = ['Jean', 'Pierre', 'Jacques', 'Louis', 'François', 'Antoine', 'Joseph', 'Michel', 'André', 'Étienne', 'Guillaume', 'Martin', 'Léonard', 'Henri', 'Paul', 'Marcel', 'Georges', 'René', 'Auguste', 'Baptiste', 'Claude', 'Gabriel', 'Mathieu', 'Nicolas', 'Philippe', 'Simon', 'Thomas', 'Victor', 'Émile', 'Lucien', 'Raymond', 'Roger', 'Robert', 'Bernard', 'Christian', 'Alain', 'Patrick', 'Thierry', 'Julien', 'Nicolas', 'Lucas', 'Hugo', 'Léo', 'Gabin'];
$F = ['Marie', 'Jeanne', 'Anne', 'Marguerite', 'Catherine', 'Françoise', 'Louise', 'Madeleine', 'Élisabeth', 'Antoinette', 'Rose', 'Julie', 'Joséphine', 'Victoire', 'Marthe', 'Germaine', 'Suzanne', 'Yvonne', 'Simone', 'Odette', 'Lucienne', 'Denise', 'Monique', 'Nicole', 'Christiane', 'Sylvie', 'Isabelle', 'Nathalie', 'Sophie', 'Camille', 'Léa', 'Emma', 'Chloé', 'Manon', 'Blanche', 'Thérèse', 'Hélène', 'Léonie', 'Mélanie', 'Pauline'];
$racines = ['MART', 'BOR', 'FAUR', 'MAZ', 'PEYR', 'ROUX', 'VID', 'BLANCH', 'DELM', 'LER', 'CHAST', 'BESS', 'SOUL', 'LACH', 'NO', 'DUP', 'DUR', 'BERN', 'LAMB', 'GIR', 'MOR', 'FOURN', 'MERC', 'BONN', 'GAUTH', 'CHEVAL', 'MOUL', 'ROUSS', 'GARN', 'CHAUV', 'BRUN', 'FAB', 'LAC', 'VIAL', 'MAL', 'TEYSS', 'COUD', 'ESTR', 'BOUY', 'VERG'];
$fins = ['IN', 'IE', 'E', 'EL', 'ET', 'ON', 'AND', 'ARD', 'AUD', 'EAU', 'IER', 'OT', 'ANT', 'AT', 'Y', 'EIX', 'ERT', 'OUX', 'AS', 'ES'];
$NOMS = [];
foreach ($racines as $r) { foreach ($fins as $f) { $NOMS[] = $r . $f; } }
$METIERS = ['cultivateur', 'laboureur', 'journalier', 'meunier', 'forgeron', 'tisserand', 'cordonnier', 'charpentier', 'maçon', 'boulanger', 'marchand', 'domestique', 'couturière', 'instituteur', 'notaire', 'menuisier', 'tailleur de pierre', 'aubergiste', 'cultivatrice', 'employé', 'ouvrier', 'cheminot', 'infirmière', 'commerçant'];

// ── lieux : départements (centre approximatif), puis communes inventées ──
$DEPTS = [
    ['Corrèze', '19', 'Limousin', 45.36, 1.88], ['Haute-Vienne', '87', 'Limousin', 45.89, 1.24], ['Creuse', '23', 'Limousin', 46.09, 2.02],
    ['Cantal', '15', 'Auvergne', 45.05, 2.67], ['Puy-de-Dôme', '63', 'Auvergne', 45.72, 3.14], ['Lot', '46', 'Occitanie', 44.62, 1.6],
    ['Dordogne', '24', 'Nouvelle-Aquitaine', 45.1, 0.75], ['Gers', '32', 'Occitanie', 43.69, 0.45], ['Aveyron', '12', 'Occitanie', 44.28, 2.68],
    ['Gironde', '33', 'Nouvelle-Aquitaine', 44.83, -0.58], ['Finistère', '29', 'Bretagne', 48.25, -4.05], ['Morbihan', '56', 'Bretagne', 47.85, -2.8],
    ['Nord', '59', 'Hauts-de-France', 50.45, 3.2], ['Pas-de-Calais', '62', 'Hauts-de-France', 50.5, 2.3], ['Somme', '80', 'Hauts-de-France', 49.95, 2.3],
    ['Seine', '75', 'Île-de-France', 48.86, 2.35], ['Seine-et-Oise', '78', 'Île-de-France', 48.8, 2.0], ['Loiret', '45', 'Centre', 47.9, 2.2],
    ['Rhône', '69', 'Rhône-Alpes', 45.76, 4.6], ['Isère', '38', 'Rhône-Alpes', 45.2, 5.6], ['Savoie', '73', 'Rhône-Alpes', 45.5, 6.4],
    ['Bouches-du-Rhône', '13', 'Provence', 43.5, 5.1], ['Var', '83', 'Provence', 43.45, 6.2], ['Hérault', '34', 'Occitanie', 43.6, 3.5],
    ['Bas-Rhin', '67', 'Alsace', 48.6, 7.6], ['Moselle', '57', 'Lorraine', 49.05, 6.6], ['Marne', '51', 'Champagne', 49.0, 4.1],
    ['Côte-d\'Or', '21', 'Bourgogne', 47.4, 4.8], ['Saône-et-Loire', '71', 'Bourgogne', 46.65, 4.5], ['Calvados', '14', 'Normandie', 49.1, -0.4],
    ['Manche', '50', 'Normandie', 49.1, -1.3], ['Vendée', '85', 'Pays de la Loire', 46.7, -1.3], ['Maine-et-Loire', '49', 'Pays de la Loire', 47.4, -0.55],
    ['Charente', '16', 'Nouvelle-Aquitaine', 45.7, 0.2], ['Haute-Garonne', '31', 'Occitanie', 43.35, 1.2], ['Pyrénées-Atlantiques', '64', 'Nouvelle-Aquitaine', 43.25, -0.75],
];
$pre = ['', '', '', 'Saint-', 'Sainte-', 'La ', 'Le ', 'Les ', 'Saint-', 'Villeneuve-', 'Mont', 'Beau', 'Châtel', 'Roche'];
$rac = ['Martin', 'Pierre', 'Germain', 'Julien', 'Laurent', 'Hilaire', 'Privat', 'Yrieix', 'Pardoux', 'Léger', 'Rémy', 'Sauveur', 'Naves', 'Treignac', 'Ussel', 'Brive', 'Meymac', 'Égletons', 'Argentat', 'Seilhac', 'Lubersac', 'Bort', 'Neuvic', 'Donzenac', 'Allassac', 'Juillac', 'Beynat', 'Corrèze', 'Chamberet', 'Masseret', 'Vigeois', 'Uzerche', 'Lapleau', 'Marcillac', 'Sornac', 'Bugeat', 'Peyrelevade', 'Chaumeil', 'Gimel', 'Sarran', 'Clergoux', 'Darnets', 'Soudeilles', 'Combressol', 'Palisse', 'Lamazière', 'Valiergues', 'Roziers', 'Bellac', 'Cognac', 'Aixe', 'Nexon', 'Feytiat', 'Couzeix'];
$suf = ['', '', '', '', '-sur-Vézère', '-sur-Dordogne', '-le-Château', '-les-Bois', '-la-Montagne', '-de-Corrèze', '-en-Val', '-le-Vieux', '-sur-Loire', '-sous-Bois', '-la-Forêt', '-le-Grand', '-les-Églises', '-du-Bois', '-sur-Mer'];
$placeCount = $target >= 100000 ? 20000 : max(200, (int) round($target / 5));
$pdo->beginTransaction();
$ipl = $pdo->prepare('INSERT INTO places(name,county,state,country,subdivision,latitude,longitude,population) VALUES(?,?,?,?,?,?,?,?)');
$placesByDept = [];
$seen = [];
for ($i = 0; $i < $placeCount; $i++) {
    $d = $i < count($DEPTS) * 40 ? $DEPTS[$i % count($DEPTS)] : $pick($DEPTS);
    $di = array_search($d, $DEPTS, true);
    do { $name = trim($pick($pre) . $pick($rac) . $pick($suf)); $k = $name . '|' . $d[1]; } while (isset($seen[$k]) && count($seen) < 200000 && mt_rand(0, 20) > 0);
    $seen[$k] = 1;
    $ipl->execute([$name, $d[0], $d[2], 'France', $d[0] . ' (' . $d[1] . ')', round($d[3] + (mt_rand(-400, 400) / 1000), 5), round($d[4] + (mt_rand(-500, 500) / 1000), 5), mt_rand(80, 20000)]);
    $placesByDept[$di][] = (int) $pdo->lastInsertId();
}
$pdo->commit();
$placeIn = static function (int $di) use ($placesByDept, $pick, $DEPTS): int {
    $l = $placesByDept[$di] ?? $placesByDept[mt_rand(0, count($DEPTS) - 1)] ?? $placesByDept[0];
    return $l[mt_rand(0, count($l) - 1)];
};

// ── dates ──
$dateText = static function (int $y, int $m, int $d, bool $vague = true) use ($MOIS): string {
    $r = mt_rand(1, 100);
    if ($vague && $r <= 3) { return 'vers ' . $y; }
    if ($vague && $r <= 5) { return 'avant ' . $y; }
    if ($vague && $r <= 6) { return 'entre ' . ($y - 2) . ' et ' . $y; }
    if ($vague && $r <= 12) { return (string) $y; }
    return $d . ' ' . $MOIS[$m - 1] . ' ' . $y;
};
$addDays = static function (int $y, int $m, int $d, int $days): array {
    $t = gmmktime(12, 0, 0, $m, $d, 2000) + $days * 86400; // une année bissextile servant d'étalon
    $dy = (int) gmdate('Y', $t) - 2000;
    return [$y + $dy, (int) gmdate('n', $t), (int) gmdate('j', $t)];
};

// ── personnes, familles, événements, génération par génération ──
$pdo->beginTransaction();
$ip = $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,living_status,occupation) VALUES(?,?,?,?,?)');
$ifam = $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)');
$ichild = $pdo->prepare('INSERT INTO family_children(family_id,child_id,position) VALUES(?,?,?)');
$iev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id,description) VALUES(?,?,?,?,?,?,?,?)');
$total = 0;
$events = 0;
$person = static function (string $last, ?string $gender, int $year, int $dept, ?int $birthPlace = null, ?array $md = null) use (&$total, &$events, $ip, $iev, $pdo, $pick, $H, $F, $METIERS, $T, $dateText, $addDays, $placeIn): array {
    $g = $gender ?? (mt_rand(0, 1) ? 'male' : 'female');
    $first = $g === 'male' ? $pick($H) : $pick($F);
    if (mt_rand(1, 100) <= 30) { $first .= ' ' . ($g === 'male' ? $pick($H) : $pick($F)); }
    [$m, $d] = $md ?? [mt_rand(1, 12), mt_rand(1, 28)];
    $life = mt_rand(1, 100) <= 18 ? mt_rand(0, 5) : mt_rand(35, 92);
    // décès : au moins une semaine après la naissance (jamais avant le baptême)
    [$dy, $dm, $dd] = $addDays($year, $m, $d, $life * 365 + mt_rand(7, 360));
    $dead = $dy <= 2025 && ($year < 1925 || mt_rand(1, 100) <= 15);
    $job = $year < 2005 && $life > 20 ? $pick($METIERS) : '';
    $ip->execute([$first, $last, $g, $dead ? 'deceased' : ($year > 1925 ? 'living' : 'unknown'), $job]);
    $id = (int) $pdo->lastInsertId();
    $total++;
    $bp = $birthPlace ?? $placeIn($dept);
    $iev->execute(['person', $id, null, $T['BIRT'], $dateText($year, $m, $d), $year, $bp, '']); $events++;
    if ($year < 1905 && mt_rand(1, 100) <= 75) { [$cy, $cm, $cd] = $addDays($year, $m, $d, mt_rand(0, 3)); $iev->execute(['person', $id, null, $T['CHR'], $dateText($cy, $cm, $cd, false), $cy, $bp, '']); $events++; }
    if ($job !== '') { $oy = $year + mt_rand(18, min(40, $life - 1)); $iev->execute(['person', $id, null, $T['OCCU'], (string) $oy, $oy, $placeIn($dept), $job]); $events++; }
    if ($dead) {
        $dp = mt_rand(1, 100) <= 85 ? $bp : $placeIn($dept);
        $iev->execute(['person', $id, null, $T['DEAT'], $dateText($dy, $dm, $dd, false), $dy, $dp, '']); $events++;
        if (mt_rand(1, 100) <= 70) { [$by, $bm, $bd] = $addDays($dy, $dm, $dd, mt_rand(1, 3)); $iev->execute(['person', $id, null, $T['BURI'], $dateText($by, $bm, $bd, false), $by, $dp, '']); $events++; }
    } elseif (mt_rand(1, 100) <= 60) {
        $ry = min(2024, $year + mt_rand(20, 50)); $iev->execute(['person', $id, null, $T['RESI'], (string) $ry, $ry, $placeIn($dept), '']); $events++;
    }
    return ['id' => $id, 'g' => $g, 'y' => $year, 'last' => $last, 'dept' => $dept, 'life' => $life, 'dy' => $dead ? $dy : 9999];
};

$GENS = 13;
$r = 1.33;
$a = $target * ($r - 1) / (($r ** $GENS) - 1) / 1.45; // ≈ 45 % de conjoints venus d'ailleurs en plus
$current = [];
for ($i = 0; $i < (int) round($a); $i++) {
    $current[] = $person($pick($NOMS), null, 1650 + mt_rand(0, 15), mt_rand(0, count($DEPTS) - 1));
}
$families = 0;
$all = [];
$lastChildren = [];
for ($g = 1; $g < $GENS && $total < $target; $g++) {
    // les couples de la génération précédente : entre eux (même département de préférence) ou avec une personne d'ailleurs
    shuffle($current);
    $men = array_values(array_filter($current, fn($x) => $x['g'] === 'male' && $x['life'] >= 18));
    $women = array_values(array_filter($current, fn($x) => $x['g'] === 'female' && $x['life'] >= 18));
    $couples = [];
    $n = min(count($men), count($women));
    $soloM = array_slice($men, $n);
    $soloW = array_slice($women, $n);
    for ($i = 0; $i < $n; $i++) {
        if (mt_rand(1, 100) <= 55) { $couples[] = [$men[$i], $women[$i]]; } else { $soloM[] = $men[$i]; $soloW[] = $women[$i]; }
    }
    foreach ($soloM as $m) { if ($total < $target && mt_rand(1, 100) <= 70) { $couples[] = [$m, $person($pick($NOMS), 'female', $m['y'] + mt_rand(-4, 2), $m['dept'])]; } }
    foreach ($soloW as $w) { if ($total < $target && mt_rand(1, 100) <= 70) { $couples[] = [$person($pick($NOMS), 'male', $w['y'] + mt_rand(-2, 5), $w['dept']), $w]; } }
    $want = (int) round($a * ($r ** $g) * 1.3); // des enfants meurent jeunes, des couples restent sans enfant
    $kids = [];
    if (!$couples) { break; }
    $perCouple = $want / count($couples);
    foreach ($couples as [$hus, $wif]) {
        if ($total >= $target) { break; }
        $my = max($hus['y'], $wif['y']) + mt_rand(20, 28);
        if ($my >= min($hus['dy'], $wif['dy'])) { continue; } // on ne se marie pas après sa mort
        $ifam->execute([$hus['id'], $wif['id']]);
        $fid = (int) $pdo->lastInsertId();
        $families++;
        $dept = mt_rand(1, 100) <= 92 ? $hus['dept'] : $wif['dept'];
        $mp = $placeIn($wif['dept']);
        $iev->execute(['family', null, $fid, $T['MARR'], $dateText($my, mt_rand(1, 12), mt_rand(1, 28)), $my, $mp, '']); $events++;
        $k = max(0, (int) round($perCouple + (mt_rand(-150, 150) / 100)));
        $hy = $wif['y'];
        [$cy, $cm, $cd] = [$my, mt_rand(1, 12), mt_rand(1, 28)];
        for ($c = 0; $c < $k && $total < $target; $c++) {
            // des naissances espacées (13 mois à 3 ans), jamais après la mort de la mère ni plus d'un an après celle du père
            [$cy, $cm, $cd] = $addDays($cy, $cm, $cd, mt_rand(400, 1100));
            if ($cy > 2024 || $cy - $hy > 44 || $cy >= $wif['dy'] || $cy > $hus['dy']) { break; }
            $d2 = mt_rand(1, 100) <= 5 ? mt_rand(0, count($DEPTS) - 1) : $dept;
            $child = $person($hus['last'], null, $cy, $d2, null, [$cm, min(28, $cd)]);
            $ichild->execute([$fid, $child['id'], $c]);
            $kids[] = $child;
        }
    }
    $current = $kids;
    if ($kids) { $lastChildren = $kids; }
    fwrite(STDERR, sprintf("génération %d : %d enfants, %d personnes en tout\n", $g, count($kids), $total));
}
// complète jusqu'au nombre voulu (des branches « hors famille » : personnes isolées, comme dans une vraie base)
while ($total < $target) { $person($pick($NOMS), null, mt_rand(1700, 1990), mt_rand(0, count($DEPTS) - 1)); }
// la personne de départ (Sosa 1) : la plus jeune de la dernière génération qui a les deux parents
$start = $lastChildren ? end($lastChildren)['id'] : 1;
$pdo->prepare('UPDATE persons SET is_start=1 WHERE id=?')->execute([$start]);
$pdo->commit();

// ── sources, citations, notes, étiquettes, médias ──
$pdo->beginTransaction();
$maxP = (int) $pdo->query('SELECT max(id) FROM persons')->fetchColumn();
$maxE = (int) $pdo->query('SELECT max(id) FROM events')->fetchColumn();
$isrc = $pdo->prepare('INSERT INTO sources(title,author,agency) VALUES(?,?,?)');
$nSrc = max(20, (int) round($target / 300));
for ($i = 1; $i <= $nSrc; $i++) {
    $d = $pick($DEPTS);
    $isrc->execute(['Registres paroissiaux de ' . $pick($rac) . ' (' . $d[1] . ') ' . (1650 + $i % 300) . '-' . (1660 + $i % 300), '', 'Archives départementales ' . $d[0]]);
}
$isl = $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality) VALUES(?,?,?,?,?)');
for ($i = 0, $n = (int) round($target / 2); $i < $n; $i++) {
    $isl->execute(['event', mt_rand(1, $maxE), mt_rand(1, $nSrc), 'f° ' . mt_rand(1, 300) . ' v°', $pick(['', 'primary', 'secondary'])]);
}
$ino = $pdo->prepare('INSERT INTO notes(entity_type,entity_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?)');
for ($i = 0, $n = (int) round($target / 10); $i < $n; $i++) {
    $ino->execute(['person', mt_rand(1, $maxP), '', 'Note de recherche n° ' . $i . ' : acte trouvé aux archives, à vérifier avec le registre des insinuations. ' . str_repeat('Texte. ', mt_rand(1, 30)), '2026-01-01 10:00:00', '2026-01-01 10:00:00']);
}
$ila = $pdo->prepare('INSERT INTO labels(name,color) VALUES(?,?)');
$colors = ['#0066cc', '#cc3300', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#ad1457', '#5d4037'];
foreach (['À vérifier', 'Branche paternelle', 'Branche maternelle', 'Poilu', 'Émigré', 'Notaire', 'Meunier', 'Cousins', 'Photo à trouver', 'ADN', 'Militaire', 'Instituteur', 'Recensé 1906', 'Acte manquant', 'Mariage double', 'Jumeaux', 'Protestant', 'Noble', 'Enfant trouvé', 'Centenaire'] as $i => $l) { $ila->execute([$l, $colors[$i % count($colors)]]); }
$ill = $pdo->prepare('INSERT OR IGNORE INTO label_links(label_id,entity_type,entity_id) VALUES(?,?,?)');
for ($i = 0, $n = (int) round($target / 20); $i < $n; $i++) { $ill->execute([mt_rand(1, 20), 'person', mt_rand(1, $maxP)]); }
// petites images (une vraie image PNG, plusieurs fichiers)
$img = imagecreatetruecolor(320, 240);
$im = $pdo->prepare('INSERT INTO media(title,media_type,filename,date_text,is_person_photo) VALUES(?,?,?,?,?)');
$iml = $pdo->prepare('INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,?,?,?)');
$nMed = max(10, min(400, (int) round($target / 250)));
for ($i = 1; $i <= $nMed; $i++) {
    imagefilledrectangle($img, 0, 0, 319, 239, imagecolorallocate($img, mt_rand(60, 220), mt_rand(60, 220), mt_rand(60, 220)));
    imagestring($img, 5, 20, 100, 'Photo ' . $i, imagecolorallocate($img, 0, 0, 0));
    $file = sprintf('grosse-base-%04d.png', $i);
    imagepng($img, MEDIA_DIR . '/' . $file);
    $photo = $i % 3 !== 0;
    $im->execute([$photo ? 'Portrait ' . $i : 'Acte ' . $i, 'image', $file, (string) mt_rand(1860, 1990), $photo ? 1 : 0]);
    $mid = (int) $pdo->lastInsertId();
    $pid = mt_rand(1, $maxP);
    $iml->execute([$mid, 'person', $pid, 0]);
    if ($photo && mt_rand(0, 1)) { $pdo->prepare('UPDATE persons SET portrait_media_id=? WHERE id=?')->execute([$mid, $pid]); }
}
$pdo->commit();
$pdo->exec('PRAGMA synchronous = NORMAL');

$c = static fn(string $t) => (int) $pdo->query("SELECT count(*) FROM $t")->fetchColumn();
printf("ok : %d personnes, %d familles, %d événements, %d lieux, %d sources, %d citations, %d notes, %d médias — départ n° %d — %.1f s\n",
    $c('persons'), $c('families'), $c('events'), $c('places'), $c('sources'), $c('source_links'), $c('notes'), $c('media'), $start, microtime(true) - $t0);
