<?php
declare(strict_types=1);

const ROOT = __DIR__ . '/..';
$package = $argv[1] ?? '';
if ($package === '') {
    fwrite(STDERR, "Usage : php scripts/import.php /chemin/vers/sauvegarde.mftpkg\n");
    exit(1);
}
$sourceDb = rtrim($package, '/') . '/database';
$targetDb = ROOT . '/data/genealogy.sqlite';

if (!is_file($sourceDb)) {
    fwrite(STDERR, "Base MacFamilyTree introuvable : {$sourceDb}\n");
    exit(1);
}

if (is_file($targetDb)) {
    unlink($targetDb);
}

$src = new PDO('sqlite:' . $sourceDb, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$dst = new PDO('sqlite:' . $targetDb, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$dst->exec(file_get_contents(ROOT . '/data/schema.sql'));
$dst->exec('PRAGMA foreign_keys = OFF');

function frenchLabel(string $identifier, string $typeName, string $tag): string
{
    if ($typeName !== '') {
        return $typeName;
    }
    $specific = ['_FamilyEvent_License'=>'Licence de mariage','_FamilyEvent_MarriageReligion'=>'Mariage religieux'];
    if (isset($specific[$identifier])) return $specific[$identifier];
    $map = [
        'BIRT' => 'Naissance', 'DEAT' => 'Décès', 'CHR' => 'Baptême', 'BAPM' => 'Baptême',
        'BURI' => 'Inhumation', 'OCCU' => 'Profession', 'RESI' => 'Lieu de résidence',
        'CENS' => 'Recensement', 'MARR' => 'Mariage', 'DIV' => 'Divorce', 'ENGA' => 'Fiançailles',
        'CREM' => 'Incinération', 'EMIG' => 'Émigration', 'IMMI' => 'Immigration', 'NATU' => 'Naturalisation',
        'GRAD' => 'Diplôme', 'EDUC' => 'Formation', 'RETI' => 'Retraite', 'WILL' => 'Testament',
        'ADOP' => 'Adoption', 'ILL' => 'Maladie', 'FUNE' => 'Obsèques', 'MILI' => 'Service militaire',
        'MISE' => 'Service militaire', 'EVEN' => 'Autre événement', 'MRCI' => 'Mariage civil',
        'MARL' => 'Licence de mariage', 'MARB' => 'Publication des bans',
    ];
    if (isset($map[$tag])) {
        return $map[$tag];
    }
    $label = preg_replace('/^_(Person|Family)Event_/', '', $identifier) ?: $identifier;
    $label = preg_replace('/([a-z])([A-Z])/', '$1 $2', $label) ?: $label;
    return $label !== '' ? $label : 'Événement';
}

function slugify(string $value): string
{
    $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value;
    return trim(strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $ascii) ?: ''), '-');
}

function extractYear(?string $date): ?int
{
    if (!$date || !preg_match('/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/', $date, $m)) {
        return null;
    }
    return (int) $m[1];
}

function coreDate(mixed $value): ?string
{
    if ($value === null || $value === '') return null;
    $timestamp = (float) $value + 978307200;
    return gmdate('Y-m-d H:i:s', (int) $timestamp);
}

function coordinate(array $row, string $prefix, bool $negative): ?float
{
    $degrees = $row[$prefix . 'DEGREES'] ?? null;
    if ($degrees === null || $degrees === '') return null;
    $value = (float) $degrees + ((float) ($row[$prefix . 'MINUTES'] ?? 0) / 60) + ((float) ($row[$prefix . 'SECONDS'] ?? 0) / 3600);
    return $negative ? -$value : $value;
}

$dst->beginTransaction();
try {
    $personMap = [];
    $groupMap = [];
    $insertGroup = $dst->prepare('INSERT OR IGNORE INTO surname_groups(name) VALUES(?)');
    $findGroup = $dst->prepare('SELECT id FROM surname_groups WHERE name = ? COLLATE NOCASE');
    $insertPerson = $dst->prepare('INSERT INTO persons(source_id,unique_id,gedcom_id,first_name,middle_name,last_name,prefix,suffix,gender,living_status,is_private,is_bookmarked,is_start,surname_group_id,reference_number,familysearch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

    $people = $src->query('SELECT * FROM ZBASEOBJECT WHERE Z_ENT=15')->fetchAll();
    foreach ($people as $p) {
        $lastName = trim((string) ($p['ZLASTNAME'] ?? ''));
        $groupId = null;
        if ($lastName !== '') {
            $key = mb_strtolower($lastName);
            if (!isset($groupMap[$key])) {
                $insertGroup->execute([$lastName]);
                $findGroup->execute([$lastName]);
                $groupMap[$key] = (int) $findGroup->fetchColumn();
            }
            $groupId = $groupMap[$key];
        }
        $gender = match ((int) ($p['ZGENDER'] ?? -1)) { 0 => 'male', 1 => 'female', default => 'unknown' };
        $insertPerson->execute([
            $p['Z_PK'], $p['ZUNIQUEID'] ?? null, $p['ZGEDCOMID'] ?? null,
            $p['ZFIRSTNAME'] ?? '', $p['ZNAMEMIDDLE'] ?? '', $lastName, $p['ZNAMEPREFIX'] ?? '', $p['ZNAMESUFFIX'] ?? '',
            $gender, 'unknown', (int) ($p['ZISPRIVATE'] ?? 0), (int) ($p['ZISBOOKMARKED1'] ?? 0), (int) ($p['ZISSTARTPERSON'] ?? 0),
            $groupId, $p['ZREFERENCENUMBERID'] ?? '', $p['ZFAMILYSEARCHID'] ?? '',
        ]);
        $personMap[(int) $p['Z_PK']] = (int) $dst->lastInsertId();
    }

    $insertVariant = $dst->prepare('INSERT INTO name_variants(person_id,source_id,type,first_name,middle_name,last_name,prefix,suffix,position) VALUES(?,?,?,?,?,?,?,?,?)');
    $position = 0;
    foreach ($src->query('SELECT * FROM ZADDITIONALNAME ORDER BY Z_PK') as $n) {
        if (!isset($personMap[(int) $n['ZPERSON']])) continue;
        $insertVariant->execute([$personMap[(int) $n['ZPERSON']], $n['Z_PK'], 'historical', $n['ZFIRSTNAME'] ?? '', $n['ZNAMEMIDDLE'] ?? '', $n['ZLASTNAME'] ?? '', $n['ZNAMEPREFIX'] ?? '', $n['ZNAMESUFFIX'] ?? '', $position++]);
    }

    $familyMap = [];
    $insertFamily = $dst->prepare('INSERT INTO families(source_id,partner1_id,partner2_id) VALUES(?,?,?)');
    foreach ($src->query('SELECT * FROM ZBASEOBJECT WHERE Z_ENT=14') as $f) {
        $insertFamily->execute([$f['Z_PK'], $personMap[(int) ($f['ZMAN'] ?? 0)] ?? null, $personMap[(int) ($f['ZWOMAN'] ?? 0)] ?? null]);
        $familyMap[(int) $f['Z_PK']] = (int) $dst->lastInsertId();
    }
    $insertChild = $dst->prepare('INSERT INTO family_children(source_id,family_id,child_id,relation_to_partner1,relation_to_partner2,position) VALUES(?,?,?,?,?,?)');
    $relationName = static fn(mixed $v): string => match ((int) $v) { 1 => 'adopted', 2 => 'foster', 3 => 'step', default => 'biological' };
    foreach ($src->query('SELECT * FROM ZCHILDRELATION') as $c) {
        $familyId = $familyMap[(int) ($c['ZFAMILY'] ?? 0)] ?? null;
        $childId = $personMap[(int) ($c['ZCHILD'] ?? 0)] ?? null;
        if (!$familyId || !$childId) continue;
        $insertChild->execute([$c['Z_PK'], $familyId, $childId, $relationName($c['ZRELATIONTYPETOMANINFAMILY'] ?? 0), $relationName($c['ZRELATIONTYPETOWOMANINFAMILY'] ?? 0), (float) ($c['ZCUSTOMORDER'] ?? 0)]);
    }

    $typeMap = [];
    $insertType = $dst->prepare('INSERT INTO event_types(source_id,scope,slug,label,gedcom_tag,icon,color,is_custom,is_active) VALUES(?,?,?,?,?,?,?,?,?)');
    foreach ($src->query('SELECT * FROM ZCONCLUSIONTYPE WHERE Z_ENT IN (52,53)') as $t) {
        $scope = (int) $t['Z_ENT'] === 52 ? 'family' : 'person';
        $label = frenchLabel((string) ($t['ZIDENTIFIER'] ?? ''), (string) ($t['ZTYPENAME'] ?? ''), (string) ($t['ZGEDCOMTAG'] ?? ''));
        $slug = (slugify($label) ?: 'event') . '-' . $t['Z_PK'];
        $tag = (string) ($t['ZGEDCOMTAG'] ?? '');
        $icon = match ($tag) { 'BIRT' => 'star', 'DEAT' => 'cross', 'BURI' => 'grave', 'MARR' => 'rings', 'OCCU' => 'tool', 'RESI' => 'home', default => 'diamond' };
        $color = match ($tag) { 'BIRT' => '#0066cc', 'DEAT', 'BURI' => '#111111', 'MARR' => '#7a47db', default => '#0066cc' };
        $insertType->execute([$t['Z_PK'], $scope, $slug, $label, $tag, $icon, $color, (int) ($t['ZISUSERCREATED'] ?? 0), (int) ($t['ZISENABLED'] ?? 1)]);
        $typeMap[(int) $t['Z_PK']] = (int) $dst->lastInsertId();
    }

    $placeMap = [];
    $coordinates = [];
    foreach ($src->query('SELECT * FROM ZCOORDINATE') as $c) $coordinates[(int) $c['Z_PK']] = $c;
    $insertPlace = $dst->prepare('INSERT INTO places(source_id,name,county,state,country,alternate_names,latitude,longitude,description) VALUES(?,?,?,?,?,?,?,?,?)');
    foreach ($src->query('SELECT * FROM ZBASEOBJECT WHERE Z_ENT=28') as $p) {
        $coord = $coordinates[(int) ($p['ZCOORDINATE'] ?? 0)] ?? [];
        $lat = $coord ? coordinate($coord, 'ZLATITUDE', !empty($coord['ZLATITUDEISSOUTH'])) : null;
        $lon = $coord ? coordinate($coord, 'ZLONGITUDE', !empty($coord['ZLONGITUDEISWEST'])) : null;
        $insertPlace->execute([$p['Z_PK'], $p['ZPLACE'] ?? '', $p['ZCOUNTY'] ?? '', $p['ZSTATE'] ?? '', $p['ZCOUNTRY'] ?? '', $p['ZALTERNATEPLACENAMES'] ?? '', $lat, $lon, $p['ZUSERDESCRIPTION1'] ?? '']);
        $placeMap[(int) $p['Z_PK']] = (int) $dst->lastInsertId();
    }

    $eventMap = [];
    $insertEvent = $dst->prepare('INSERT INTO events(source_id,scope,person_id,family_id,event_type_id,date_text,year,place_id,address,title,description,cause,agency) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach ($src->query('SELECT * FROM ZBASEOBJECT WHERE Z_ENT IN (24,25)') as $e) {
        $scope = (int) $e['Z_ENT'] === 24 ? 'family' : 'person';
        $typeSource = (int) ($scope === 'family' ? ($e['ZCONCLUSIONTYPE'] ?? 0) : ($e['ZCONCLUSIONTYPE1'] ?? 0));
        $typeId = $typeMap[$typeSource] ?? null;
        if (!$typeId) continue;
        $date = trim((string) ($e['ZDATE1'] ?? ''));
        $insertEvent->execute([
            $e['Z_PK'], $scope,
            $scope === 'person' ? ($personMap[(int) ($e['ZPERSON1'] ?? 0)] ?? null) : null,
            $scope === 'family' ? ($familyMap[(int) ($e['ZFAMILY'] ?? 0)] ?? null) : null,
            $typeId, $date, extractYear($date), $placeMap[(int) ($e['ZASSIGNEDPLACE'] ?? 0)] ?? null,
            $e['ZADDRESS'] ?? '', $e['ZTITLE'] ?? '', $e['ZUSERDESCRIPTION1'] ?? '', $e['ZCAUSE'] ?? '', $e['ZAGENCY'] ?? '',
        ]);
        $eventMap[(int) $e['Z_PK']] = (int) $dst->lastInsertId();
    }

    $mediaMap = [];
    $insertMedia = $dst->prepare('INSERT INTO media(source_id,title,description,media_type,filename,thumbnail,date_text) VALUES(?,?,?,?,?,?,?)');
    $mediaDir = ROOT . '/media';
    if (!is_dir($mediaDir)) mkdir($mediaDir, 0775, true);
    foreach ($src->query('SELECT * FROM ZBASEOBJECT WHERE Z_ENT=19') as $m) {
        $original = (string) ($m['ZPICTUREFILEIDENTIFIER'] ?? '');
        $thumb = (string) ($m['ZTHUMBNAILFILEIDENTIFIER1'] ?? '');
        $originalName = $original !== '' ? basename($original) : '';
        $thumbName = $thumb !== '' ? basename($thumb) : '';
        foreach ([[$original, $originalName], [$thumb, $thumbName]] as [$relative, $name]) {
            if ($relative === '' || $name === '') continue;
            $from = rtrim($package, '/') . '/resources/' . ltrim($relative, '/');
            $to = $mediaDir . '/' . $name;
            if (is_file($from) && !is_file($to)) copy($from, $to);
        }
        $insertMedia->execute([$m['Z_PK'], $m['ZTITLE'] ?? '', $m['ZUSERDESCRIPTION'] ?? '', 'image', $originalName, $thumbName, $m['ZDATE'] ?? '']);
        $mediaMap[(int) $m['Z_PK']] = (int) $dst->lastInsertId();
    }

    $insertLink = $dst->prepare('INSERT INTO media_links(source_id,media_id,entity_type,entity_id,position) VALUES(?,?,?,?,?)');
    foreach ($src->query('SELECT * FROM ZMEDIARELATION') as $r) {
        $mediaId = $mediaMap[(int) ($r['ZBASEMEDIA'] ?? 0)] ?? null;
        $sourceContainer = (int) ($r['ZMEDIACONTAINER'] ?? 0);
        $containerEnt = (int) ($r['Z8_MEDIACONTAINER'] ?? 0);
        $entityType = match ($containerEnt) { 15 => 'person', 14 => 'family', 24, 25 => 'event', 11 => 'source', default => null };
        $entityId = match ($entityType) {
            'person' => $personMap[$sourceContainer] ?? null,
            'family' => $familyMap[$sourceContainer] ?? null,
            'event' => $eventMap[$sourceContainer] ?? null,
            default => null,
        };
        if ($mediaId && $entityType && $entityId) $insertLink->execute([$r['Z_PK'], $mediaId, $entityType, $entityId, (float) ($r['ZORDER'] ?? 0)]);
    }

    $insertNote = $dst->prepare('INSERT INTO notes(source_id,entity_type,entity_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
    foreach ($src->query('SELECT * FROM ZBASEOBJECT WHERE Z_ENT=6') as $n) {
        $sourceObject = (int) ($n['ZOBJECT'] ?? 0);
        $objectEnt = (int) ($n['Z7_OBJECT'] ?? 0);
        $entityType = match ($objectEnt) { 15 => 'person', 14 => 'family', 24, 25 => 'event', default => null };
        $entityId = match ($entityType) {
            'person' => $personMap[$sourceObject] ?? null,
            'family' => $familyMap[$sourceObject] ?? null,
            'event' => $eventMap[$sourceObject] ?? null,
            default => null,
        };
        if ($entityType && $entityId) $insertNote->execute([$n['Z_PK'], $entityType, $entityId, $n['ZTITLE'] ?? '', $n['ZTEXT'] ?? '', coreDate($n['ZCREATIONDATE'] ?? null), coreDate($n['ZCHANGEDATE'] ?? null)]);
    }

    $dst->exec("UPDATE persons SET living_status='deceased' WHERE id IN (SELECT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='DEAT')");
    $dst->exec("UPDATE persons SET living_status='living' WHERE living_status='unknown' AND id IN (SELECT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='BIRT' AND e.year >= CAST(strftime('%Y','now') AS INTEGER)-110)");

    $dst->exec('DELETE FROM person_search');
    $dst->exec("INSERT INTO person_search(person_id,first_name,last_name,variants,surname_group)
        SELECT p.id,p.first_name,p.last_name,
               COALESCE((SELECT group_concat(trim(coalesce(n.first_name,'') || ' ' || coalesce(n.last_name,'')), ' ') FROM name_variants n WHERE n.person_id=p.id),''),
               COALESCE(g.name,'')
        FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id");

    $meta = $dst->prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)');
    foreach ([
        'source_package' => realpath($package) ?: $package,
        'imported_at' => date(DATE_ATOM),
        'source_version' => 'MacFamilyTree 11.1.1',
    ] as $key => $value) $meta->execute([$key, $value]);

    $dst->exec("INSERT INTO saved_views(module,name,config_json,sort_order) VALUES
        ('graph','Ascendants — 4 générations','{\"mode\":\"ancestors\",\"depth\":4}',10),
        ('graph','Descendants — 3 générations','{\"mode\":\"descendants\",\"depth\":3}',20),
        ('map','Naissances','{\"event\":\"BIRT\",\"display\":\"markers\"}',10),
        ('map','Carte thermique','{\"event\":\"all\",\"display\":\"heat\"}',20)");

    $dst->commit();
    $dst->exec('PRAGMA foreign_keys = ON');
    $dst->exec('ANALYZE');
} catch (Throwable $e) {
    if ($dst->inTransaction()) $dst->rollBack();
    @unlink($targetDb);
    fwrite(STDERR, $e->getMessage() . "\n" . $e->getTraceAsString() . "\n");
    exit(1);
}

$stats = [
    'personnes' => $dst->query('SELECT count(*) FROM persons')->fetchColumn(),
    'familles' => $dst->query('SELECT count(*) FROM families')->fetchColumn(),
    'événements' => $dst->query('SELECT count(*) FROM events')->fetchColumn(),
    'médias' => $dst->query('SELECT count(*) FROM media')->fetchColumn(),
];
echo "Import terminé : " . json_encode($stats, JSON_UNESCAPED_UNICODE) . "\n";
