<?php
declare(strict_types=1);

/**
 * 🧪 Base d'exemple (premier lancement) : une famille IMAGINAIRE sur 5 générations, pour essayer l'app sans rien risquer.
 *
 * Règles (validées par l'utilisateur) :
 *  - personne n'est né après 1950 et tout le monde est décédé (aucun vivant) ;
 *  - noms et prénoms plausibles mais inventés ; lieux : vraies communes de France, avec leurs coordonnées ;
 *  - « photos d'époque » dessinées par scripts/exemple-photos.php (assets/exemple/*.jpg) : sépia, aucun visage,
 *    rien de téléchargé ;
 *  - elle vit dans une généalogie à part (« Mes généalogies »), jamais dans la vraie base.
 *
 * exemple_build($pdo, $mediaDir) remplit une base NEUVE (déjà créée et à jour : schéma + migrations). Toujours le même
 * résultat (reproductible). Utilisée par api.php?action=premier_example_build et par scripts/exemple-base.php.
 */

const EXEMPLE_NAME = 'Exemple — famille Lavaudrin (imaginaire)';
const EXEMPLE_MAX_BIRTH_YEAR = 1950;

/** Vraies communes (INSEE, département, région, coordonnées, population arrondie) */
function exemple_places(): array
{
    return [
        'aubusson' => ['Aubusson', 'Creuse', 'Nouvelle-Aquitaine', '23', '23008', 45.9561, 2.1683, 3300],
        'felletin' => ['Felletin', 'Creuse', 'Nouvelle-Aquitaine', '23', '23079', 45.8833, 2.1736, 1600],
        'bourganeuf' => ['Bourganeuf', 'Creuse', 'Nouvelle-Aquitaine', '23', '23030', 45.9547, 1.7558, 2600],
        'gueret' => ['Guéret', 'Creuse', 'Nouvelle-Aquitaine', '23', '23096', 46.1714, 1.8714, 13000],
        'limoges' => ['Limoges', 'Haute-Vienne', 'Nouvelle-Aquitaine', '87', '87085', 45.8336, 1.2611, 130000],
        'clermont' => ['Clermont-Ferrand', 'Puy-de-Dôme', 'Auvergne-Rhône-Alpes', '63', '63113', 45.7772, 3.0870, 147000],
        'paris' => ['Paris', 'Paris', 'Île-de-France', '75', '75056', 48.8566, 2.3522, 2100000],
        'douarnenez' => ['Douarnenez', 'Finistère', 'Bretagne', '29', '29046', 48.0928, -4.3289, 14000],
        'quimper' => ['Quimper', 'Finistère', 'Bretagne', '29', '29232', 47.9960, -4.1020, 63000],
        'sedan' => ['Sedan', 'Ardennes', 'Grand Est', '08', '08409', 49.7019, 4.9403, 16000],
    ];
}

/**
 * Les personnes : clé => [prénom, nom, sexe, naissance [date, lieu], décès [date, lieu], métier, [baptême], [inhumation]].
 * Les clés « s1 » à « s31 » sont les numéros Sosa de Jean (s1) ; les autres sont des frères, sœurs et conjoints.
 */
function exemple_people(): array
{
    return [
        // Génération 1
        's1' => ['Jean', 'Lavaudrin', 'male', ['12 mars 1948', 'limoges'], ['3 novembre 2019', 'limoges'], 'Instituteur'],
        'claudine' => ['Claudine', 'Dumazeau', 'female', ['21 septembre 1949', 'gueret'], ['8 février 2021', 'limoges'], 'Infirmière'],
        'monique' => ['Monique', 'Lavaudrin', 'female', ['30 juillet 1945', 'limoges'], ['14 avril 2016', 'clermont'], 'Secrétaire'],
        'michel' => ['Michel', 'Ravailhe', 'male', ['2 janvier 1942', 'clermont'], ['19 octobre 2011', 'clermont'], 'Ouvrier chez un fabricant de pneus'],
        // Génération 2
        's2' => ['Paul', 'Lavaudrin', 'male', ['4 juin 1920', 'aubusson'], ['22 janvier 1990', 'limoges'], 'Cheminot'],
        's3' => ['Yvonne', 'Le Guennoc', 'female', ['17 août 1922', 'douarnenez'], ['9 mai 2004', 'limoges'], 'Couturière'],
        'rene' => ['René', 'Lavaudrin', 'male', ['11 mars 1922', 'aubusson'], ['15 mai 1940', 'sedan'], 'Apprenti tapissier'],
        'germaine' => ['Germaine', 'Lavaudrin', 'female', ['3 octobre 1925', 'aubusson'], ['vers 1928', 'aubusson'], ''],
        'corentin' => ['Corentin', 'Le Guennoc', 'male', ['6 décembre 1924', 'douarnenez'], ['27 juin 1999', 'douarnenez'], 'Marin-pêcheur'],
        // Génération 3
        's4' => ['Léon', 'Lavaudrin', 'male', ['2 février 1890', 'aubusson'], ['18 novembre 1957', 'aubusson'], 'Tapissier (lissier)', ['3 février 1890', 'aubusson']],
        's5' => ['Marie', 'Coustillac', 'female', ['25 mai 1893', 'felletin'], ['7 janvier 1971', 'aubusson'], 'Ménagère', ['26 mai 1893', 'felletin']],
        's6' => ['Yves', 'Le Guennoc', 'male', ['13 avril 1891', 'douarnenez'], ['2 septembre 1952', 'douarnenez'], 'Marin-pêcheur'],
        's7' => ['Anna', 'Kerbellec', 'female', ['vers 1895', 'quimper'], ['16 mars 1967', 'douarnenez'], 'Ouvrière de conserverie (sardinière)'],
        'henri' => ['Henri', 'Lavaudrin', 'male', ['9 septembre 1887', 'aubusson'], ['4 décembre 1950', 'paris'], 'Maçon'],
        'eugenie' => ['Eugénie', 'Bousquetal', 'female', ['20 juin 1891', 'paris'], ['12 août 1960', 'paris'], 'Blanchisseuse'],
        // Génération 4
        's8' => ['Antoine', 'Lavaudrin', 'male', ['14 janvier 1858', 'aubusson'], ['30 mars 1921', 'aubusson'], 'Tapissier', ['15 janvier 1858', 'aubusson'], ['1er avril 1921', 'aubusson']],
        's9' => ['Françoise', 'Merlandou', 'female', ['8 août 1862', 'bourganeuf'], ['11 décembre 1930', 'aubusson'], 'Ménagère'],
        's10' => ['Jean-Baptiste', 'Coustillac', 'male', ['19 février 1860', 'felletin'], ['5 juillet 1925', 'felletin'], 'Cultivateur'],
        's11' => ['Catherine', 'Fargevieille', 'female', ['vers 1865', 'felletin'], ['23 octobre 1940', 'felletin'], 'Cultivatrice'],
        's12' => ['Guillaume', 'Le Guennoc', 'male', ['1er mai 1863', 'douarnenez'], ['vers 1910', 'douarnenez'], 'Marin-pêcheur'],
        's13' => ['Marie-Jeanne', 'Cosquéric', 'female', ['28 novembre 1867', 'douarnenez'], ['10 février 1938', 'douarnenez'], 'Ramendeuse de filets'],
        's14' => ['Pierre', 'Kerbellec', 'male', ['3 mars 1866', 'quimper'], ['22 août 1931', 'quimper'], 'Menuisier'],
        's15' => ['Louise', 'Glémarec', 'female', ['12 juillet 1870', 'quimper'], ['5 mai 1945', 'quimper'], 'Couturière'],
        // Génération 5
        's16' => ['François', 'Lavaudrin', 'male', ['6 avril 1830', 'aubusson'], ['9 septembre 1889', 'aubusson'], 'Tapissier', ['7 avril 1830', 'aubusson']],
        's17' => ['Anne', 'Chabrignac', 'female', ['17 novembre 1834', 'aubusson'], ['2 mars 1898', 'aubusson'], 'Bobineuse'],
        's18' => ['Martial', 'Merlandou', 'male', ['vers 1832', 'bourganeuf'], ['14 juin 1880', 'bourganeuf'], 'Maçon'],
        's19' => ['Jeanne', 'Peyrichou', 'female', ['21 janvier 1836', 'bourganeuf'], ['30 mai 1901', 'bourganeuf'], 'Ménagère'],
        's20' => ['Léonard', 'Coustillac', 'male', ['10 octobre 1828', 'felletin'], ['18 février 1885', 'felletin'], 'Cultivateur'],
        's21' => ['Marguerite', 'Vergnaudet', 'female', ['2 septembre 1833', 'felletin'], ['24 avril 1890', 'felletin'], 'Ménagère'],
        's22' => ['Pierre', 'Fargevieille', 'male', ['vers 1830', 'felletin'], ['7 novembre 1899', 'felletin'], 'Sabotier'],
        's23' => ['Marie', 'Tournemiche', 'female', ['15 mars 1838', 'felletin'], ['1er février 1912', 'felletin'], 'Fileuse'],
        's24' => ['Jean-Marie', 'Le Guennoc', 'male', ['29 juin 1835', 'douarnenez'], ['13 décembre 1880', 'douarnenez'], 'Marin-pêcheur'],
        's25' => ['Corentine', 'Kermorvan', 'female', ['4 janvier 1840', 'douarnenez'], ['26 août 1915', 'douarnenez'], 'Ménagère'],
        's26' => ['Hervé', 'Cosquéric', 'male', ['18 mai 1838', 'douarnenez'], ['9 mars 1901', 'douarnenez'], 'Tonnelier'],
        's27' => ['Marie-Anne', 'Gourlaouen', 'female', ['vers 1842', 'douarnenez'], ['31 octobre 1920', 'douarnenez'], 'Ménagère'],
        's28' => ['Yves', 'Kerbellec', 'male', ['7 août 1837', 'quimper'], ['16 janvier 1900', 'quimper'], 'Menuisier'],
        's29' => ['Marie', 'Guillorec', 'female', ['22 février 1841', 'quimper'], ['3 juin 1911', 'quimper'], 'Lingère'],
        's30' => ['Joseph', 'Glémarec', 'male', ['14 septembre 1840', 'quimper'], ['20 avril 1905', 'quimper'], 'Journalier'],
        's31' => ['Catherine', 'Moalic', 'female', ['5 décembre 1844', 'quimper'], ['8 juillet 1928', 'quimper'], 'Ménagère'],
    ];
}

/** Les couples : [lui, elle, mariage [date, lieu] ou null, enfants (dans l'ordre)] */
function exemple_couples(): array
{
    return [
        'f_s1' => ['s1', 'claudine', ['8 juillet 1972', 'gueret'], []],
        'f_mon' => ['michel', 'monique', ['17 septembre 1966', 'clermont'], []],
        'f_s2' => ['s2', 's3', ['14 avril 1944', 'limoges'], ['monique', 's1']],
        'f_s4' => ['s4', 's5', ['22 février 1919', 'felletin'], ['s2', 'rene', 'germaine']],
        'f_s6' => ['s6', 's7', ['10 janvier 1920', 'douarnenez'], ['s3', 'corentin']],
        'f_hen' => ['henri', 'eugenie', ['5 avril 1913', 'paris'], []],
        'f_s8' => ['s8', 's9', ['27 novembre 1886', 'aubusson'], ['henri', 's4']],
        'f_s10' => ['s10', 's11', ['14 février 1888', 'felletin'], ['s5']],
        'f_s12' => ['s12', 's13', ['vers 1889', 'douarnenez'], ['s6']],
        'f_s14' => ['s14', 's15', ['18 septembre 1893', 'quimper'], ['s7']],
        'f_s16' => ['s16', 's17', ['20 février 1856', 'aubusson'], ['s8']],
        'f_s18' => ['s18', 's19', ['vers 1859', 'bourganeuf'], ['s9']],
        'f_s20' => ['s20', 's21', ['5 novembre 1856', 'felletin'], ['s10']],
        'f_s22' => ['s22', 's23', ['vers 1862', 'felletin'], ['s11']],
        'f_s24' => ['s24', 's25', ['12 juin 1861', 'douarnenez'], ['s12']],
        'f_s26' => ['s26', 's27', ['vers 1865', 'douarnenez'], ['s13']],
        'f_s28' => ['s28', 's29', ['24 octobre 1863', 'quimper'], ['s14']],
        'f_s30' => ['s30', 's31', ['8 janvier 1867', 'quimper'], ['s15']],
    ];
}

/** L'année d'une date écrite comme dans un acte (« 12 mars 1948 », « vers 1865 ») */
function exemple_year(string $date): ?int
{
    return preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', $date, $m) ? (int) $m[1] : null;
}

/** Remplit une base neuve. Renvoie le nombre de choses créées. */
function exemple_build(PDO $pdo, string $mediaDir): array
{
    if ((int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn() > 0) {
        throw new RuntimeException('La base d’exemple a déjà des fiches.');
    }
    foreach (exemple_people() as $key => $p) {
        $y = exemple_year($p[3][0]);
        if ($y === null || $y > EXEMPLE_MAX_BIRTH_YEAR || exemple_year($p[4][0]) === null) {
            throw new RuntimeException("Base d’exemple : « {$key} » doit être né(e) avant 1951 et décédé(e).");
        }
    }
    $types = [];
    foreach ($pdo->query('SELECT id, scope, slug FROM event_types') as $t) { $types[$t['scope'] . ':' . $t['slug']] = (int) $t['id']; }
    $type = static function (string $scope, string $slug) use ($types): int {
        if (!isset($types[$scope . ':' . $slug])) { throw new RuntimeException("Type d’événement absent : $slug"); }
        return $types[$scope . ':' . $slug];
    };
    $stats = ['persons' => 0, 'families' => 0, 'events' => 0, 'places' => 0, 'sources' => 0, 'notes' => 0, 'media' => 0, 'census' => 0];
    $pdo->beginTransaction();
    try {
        // Lieux
        $placeId = [];
        $insPlace = $pdo->prepare("INSERT INTO places(name,county,state,country,latitude,longitude,admin2_code,admin4_code,feature_code,population) VALUES(?,?,?,'France',?,?,?,?,'PPL',?)");
        foreach (exemple_places() as $k => [$name, $dep, $region, $num, $insee, $lat, $lon, $pop]) {
            $insPlace->execute([$name, $dep, $region, $lat, $lon, $num, $insee, $pop]);
            $placeId[$k] = (int) $pdo->lastInsertId();
            $stats['places']++;
        }
        // Personnes
        $id = [];
        $groups = [];
        $insPerson = $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,occupation,surname_group_id,is_start) VALUES(?,?,?,'deceased',?,?,?)");
        $insEvent = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id,description) VALUES(?,?,?,?,?,?,?,?)');
        $event = static function (string $scope, ?int $pid, ?int $fid, int $typeId, string $date, ?string $place, string $desc = '') use ($insEvent, $pdo, $placeId, &$stats): int {
            $insEvent->execute([$scope, $pid, $fid, $typeId, $date, exemple_year($date), $place !== null ? $placeId[$place] : null, $desc]);
            $stats['events']++;
            return (int) $pdo->lastInsertId();
        };
        $ev = [];
        foreach (exemple_people() as $key => $p) {
            [$first, $last, $gender, $birth, $death, $job] = $p;
            if (!isset($groups[$last])) {
                $pdo->prepare('INSERT OR IGNORE INTO surname_groups(name) VALUES(?)')->execute([$last]);
                $g = $pdo->prepare('SELECT id FROM surname_groups WHERE name=? COLLATE NOCASE'); $g->execute([$last]);
                $groups[$last] = (int) $g->fetchColumn() ?: null;
            }
            $insPerson->execute([$first, $last, $gender, $job, $groups[$last], $key === 's1' ? 1 : 0]);
            $pid = $id[$key] = (int) $pdo->lastInsertId();
            $stats['persons']++;
            $ev[$key]['birth'] = $event('person', $pid, null, $type('person', 'birth'), $birth[0], $birth[1]);
            if (!empty($p[6])) { $ev[$key]['baptism'] = $event('person', $pid, null, $type('person', 'baptism'), $p[6][0], $p[6][1]); }
            $ev[$key]['death'] = $event('person', $pid, null, $type('person', 'death'), $death[0], $death[1]);
            if (!empty($p[7])) { $event('person', $pid, null, $type('person', 'burial'), $p[7][0], $p[7][1]); }
            if ($job !== '') {
                $workYear = (exemple_year($birth[0]) ?? 1900) + 25;
                $event('person', $pid, null, $type('person', 'occupation'), 'vers ' . $workYear, $death[1], $job);
            }
        }
        // Couples, enfants, mariages
        $fam = [];
        $insFam = $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)');
        $insChild = $pdo->prepare('INSERT INTO family_children(family_id,child_id,position) VALUES(?,?,?)');
        foreach (exemple_couples() as $fk => [$him, $her, $marriage, $children]) {
            $insFam->execute([$id[$him], $id[$her]]);
            $fid = $fam[$fk] = (int) $pdo->lastInsertId();
            $stats['families']++;
            foreach ($children as $i => $c) { $insChild->execute([$fid, $id[$c], $i]); }
            if ($marriage) { $ev[$fk]['marriage'] = $event('family', null, $fid, $type('family', 'marriage'), $marriage[0], $marriage[1]); }
        }
        // Événements particuliers
        $event('person', $id['s4'], null, $type('person', 'residence'), 'entre 1914 et 1918', null, 'Mobilisé : 78ᵉ régiment d’infanterie (Guéret), blessé en 1916.');
        $event('person', $id['henri'], null, $type('person', 'residence'), 'vers 1910', 'paris', 'Maçon « de la Creuse » sur les chantiers de Paris, comme beaucoup de jeunes du pays.');
        $event('person', $id['s2'], null, $type('person', 'residence'), '1945', 'limoges', 'Rue des Petites-Maisons (adresse inventée).');
        // Sources et citations
        $insSource = $pdo->prepare("INSERT INTO sources(title,author,agency,publication,text) VALUES(?,?,?,?,?)");
        $src = [];
        foreach ([
            'ad23' => ['État civil d’Aubusson et de Felletin (naissances, mariages, décès)', '', 'Archives départementales de la Creuse', 'Cote imaginaire 4 E 8 / 1850-1920', 'Source d’exemple : la cote est inventée.'],
            'ad29' => ['État civil de Douarnenez et de Quimper', '', 'Archives départementales du Finistère', 'Cote imaginaire 3 E 46 / 1860-1925', 'Source d’exemple : la cote est inventée.'],
            'rec' => ['Recensement de population d’Aubusson, 1926', '', 'Archives départementales de la Creuse', 'Cote imaginaire 6 M 211', 'Liste nominative du recensement (exemple).'],
            'livret' => ['Livret militaire de Léon Lavaudrin', '', 'Papiers de famille', '', 'Gardé dans la boîte en fer de la famille (exemple).'],
        ] as $k => $s) { $insSource->execute($s); $src[$k] = (int) $pdo->lastInsertId(); $stats['sources']++; }
        $insCite = $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality) VALUES(?,?,?,?,?)');
        foreach (['s4', 's8', 's16', 's5', 's10', 'rene', 'germaine'] as $k) { $insCite->execute(['event', $ev[$k]['birth'], $src['ad23'], 'Acte n° ' . (10 + strlen($k) * 7), '3']); }
        foreach (['s6', 's12', 's3', 's7', 's14'] as $k) { $insCite->execute(['event', $ev[$k]['birth'], $src['ad29'], 'Acte n° ' . (20 + strlen($k) * 5), '3']); }
        $insCite->execute(['event', $ev['f_s4']['marriage'], $src['ad23'], 'Mariages 1919, acte n° 4', '3']);
        $insCite->execute(['event', $ev['f_s8']['marriage'], $src['ad23'], 'Mariages 1886, acte n° 31', '3']);
        $insCite->execute(['person', $id['s4'], $src['livret'], 'Classe 1910', '2']);
        // Notes
        $insNote = $pdo->prepare("INSERT INTO notes(entity_type,entity_id,title,body,created_at,updated_at) VALUES('person',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        foreach ([
            's1' => ['🧪 Une famille imaginaire', "Toute cette famille est inventée pour essayer l’app : les noms, les prénoms, les dates et les histoires. Les communes, elles, existent vraiment.\nPersonne n’est né après 1950 et tout le monde est décédé : il n’y a aucun vivant."],
            's4' => ['Tapissier à Aubusson', "Léon apprend le métier de lissier dans l’atelier de son père Antoine, à 13 ans. Mobilisé en 1914, blessé en 1916, il retrouve son métier à tisser en 1919 et se marie la même année avec Marie Coustillac, de Felletin."],
            's12' => ['Disparu en mer', "Guillaume ne revient pas d’une marée d’hiver, vers 1910. Son bateau n’a jamais été retrouvé : la date de son décès n’est connue qu’à peu près."],
            'rene' => ['Mort à 18 ans', "René, apprenti tapissier comme son père, meurt près de Sedan en mai 1940."],
            'henri' => ['Un maçon de la Creuse à Paris', "Comme beaucoup de jeunes de la Creuse, Henri part chaque printemps sur les chantiers de Paris. Il finit par s’y installer et y épouse Eugénie en 1913."],
            's7' => ['Date de naissance à chercher', "On ne connaît que l’âge d’Anna au recensement : sa naissance est notée « vers 1895 ». Un bon exemple d’acte qui reste à trouver."],
        ] as $k => [$t, $b]) { $insNote->execute([$id[$k], $t, $b]); $stats['notes']++; }
        // Recensement de 1926 à Aubusson
        $pdo->prepare("INSERT INTO census_records(year,date_text,status,address,place_id,notes) VALUES(1926,'mars 1926','found','Rue des Tapissiers (adresse inventée)',?,'Ménage n° 112 (exemple).')")->execute([$placeId['aubusson']]);
        $censusId = (int) $pdo->lastInsertId();
        $stats['census']++;
        $insMember = $pdo->prepare('INSERT INTO census_members(census_id,person_id,display_name,first_name,age_text,birth_place,occupation,household_position,is_primary) VALUES(?,?,?,?,?,?,?,?,?)');
        foreach ([['s4', '36 ans', 'Aubusson', 'Tapissier', 'Chef de ménage', 1], ['s5', '32 ans', 'Felletin', 'Ménagère', 'Épouse', 0], ['s2', '5 ans', 'Aubusson', '', 'Fils', 0], ['rene', '4 ans', 'Aubusson', '', 'Fils', 0], ['germaine', '5 mois', 'Aubusson', '', 'Fille', 0], ['s9', '63 ans', 'Bourganeuf', 'Sans profession', 'Mère du chef', 0]] as [$k, $age, $born, $occ, $pos, $prim]) {
            $p = exemple_people()[$k];
            $insMember->execute([$censusId, $id[$k], mb_strtoupper($p[1]), $p[0], $age, $born, $occ, $pos, $prim]);
            $event('person', $id[$k], null, $type('person', 'census'), 'mars 1926', 'aubusson', $pos);
        }
        // « Photos » d'époque (dessinées par scripts/exemple-photos.php)
        if (!is_dir($mediaDir) && !@mkdir($mediaDir, 0775, true) && !is_dir($mediaDir)) { throw new RuntimeException('Dossier des médias impossible à créer.'); }
        $insMedia = $pdo->prepare("INSERT INTO media(title,description,media_type,filename,thumbnail,date_text,document_reference) VALUES(?,?,'image',?,?,?,?)");
        $insLink = $pdo->prepare('INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,?,?,?)');
        $photos = [
            ['maison.jpg', 'La maison familiale à Aubusson', 'Dessin d’exemple, façon photo d’époque.', 'vers 1905', '', [['person', 's8'], ['person', 's4']]],
            ['atelier.jpg', 'Le métier à tisser de l’atelier', 'L’atelier de tapisserie d’Antoine puis de Léon (dessin d’exemple).', 'vers 1910', '', [['person', 's4'], ['person', 's8']]],
            ['mariage.jpg', 'Mariage de Léon et Marie', 'Photo de groupe devant la mairie de Felletin (dessin d’exemple, sans visages).', '22 février 1919', '', [['family', 'f_s4'], ['event', 'f_s4:marriage']]],
            ['acte-mariage.jpg', 'Acte de mariage de Léon Lavaudrin et Marie Coustillac', 'Page du registre (dessin d’exemple, écriture illisible).', '22 février 1919', 'Cote imaginaire 4 E 79/45', [['event', 'f_s4:marriage'], ['source', 'ad23']]],
            ['port.jpg', 'Le port de Douarnenez (carte postale)', 'Les bateaux de pêche des Le Guennoc (dessin d’exemple).', 'vers 1930', '', [['person', 's6'], ['person', 'corentin']]],
            ['bourg.jpg', 'Le bourg de Felletin et son église', 'Dessin d’exemple, façon carte postale.', 'vers 1900', '', [['person', 's10'], ['person', 's5']]],
            ['foins.jpg', 'Les foins à Felletin', 'Dessin d’exemple : deux silhouettes au loin, sans visage.', 'vers 1935', '', [['person', 's5']]],
            ['recensement.jpg', 'Recensement d’Aubusson, 1926', 'Liste nominative (dessin d’exemple).', 'mars 1926', 'Cote imaginaire 6 M 211', [['census', 'census'], ['source', 'rec']]],
            ['livret-militaire.jpg', 'Livret militaire de Léon', 'La couverture du livret (dessin d’exemple).', '1910', '', [['person', 's4'], ['source', 'livret']]],
        ];
        $srcDir = __DIR__ . '/../assets/exemple';
        foreach ($photos as [$file, $title, $desc, $date, $ref, $links]) {
            $from = $srcDir . '/' . $file;
            if (!is_file($from)) { continue; }
            $name = 'exemple-' . $file;
            if (!@copy($from, rtrim($mediaDir, '/') . '/' . $name)) { throw new RuntimeException('Copie d’une image d’exemple impossible.'); }
            $insMedia->execute([$title, $desc, $name, $name, $date, $ref]);
            $mid = (int) $pdo->lastInsertId();
            $stats['media']++;
            foreach ($links as $pos => [$etype, $k]) {
                $eid = match ($etype) {
                    'person' => $id[$k], 'family' => $fam[$k], 'source' => $src[$k], 'census' => $censusId,
                    'event' => (static function () use ($k, $ev) { [$a, $b] = explode(':', $k); return $ev[$a][$b]; })(),
                };
                $insLink->execute([$mid, $etype, $eid, $pos]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
    return $stats;
}
