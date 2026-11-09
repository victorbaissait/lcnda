<?php
declare(strict_types=1);

/**
 * ⤒ Arbres d'autres logiciels, lus sans passer par leur export :
 *  - RootsMagic (.rmtree, .rmgc ; RootsMagic 8, 9, 10 et 7 .rmgc) : c'est une base SQLite, ouverte EN LECTURE SEULE, tables
 *    vérifiées, bornée en taille et en nombre de lignes. Elle est traduite en GEDCOM 5.5.1 puis importée par le même
 *    import que le GEDCOM (import_gedcom_into_db) : personnes, noms (et autres noms, surnoms), familles et filiations
 *    (adoption…), événements avec dates (encodage de RootsMagic), lieux (et lieux-dits) avec coordonnées, sources, citations
 *    (page, qualité), dépôts, médias liés, notes, témoins.
 *  - Family Tree Maker (.ftm, .ftmb) : fichier chiffré par son éditeur, illisible par tout autre logiciel → refusé avec une
 *    phrase claire (exporter un GEDCOM depuis FTM ; ses balises _MILT, _FREL… sont comprises).
 *  - Généatique : son fichier natif n'est pas documenté → son export GEDCOM (ANSI, ANSEL ou UTF-8, lieux par FORM, témoins)
 *    est lu par l'import GEDCOM.
 * Branché dans api.php (echanges_intercept_upload) : le fichier envoyé est remplacé par le GEDCOM traduit avant
 * « Importer un arbre », l'écran de départ, « Fusionner un arbre » et l'analyse.
 */

const RM_MAX_BYTES = 1024 * 1048576;  // 1 Go
const RM_MAX_ROWS = 2000000;           // par table
const FTM_MESSAGE = 'Family Tree Maker chiffre ses fichiers .ftm : aucun autre logiciel ne peut les lire. Dans Family Tree Maker, fais « Fichier → Exporter », choisis « GEDCOM 5.5.1 » (avec les médias si tu veux), puis importe ici le fichier .ged : ses particularités (service militaire, liens d’adoption _FREL / _MREL, photo principale…) sont comprises.';

/** Extensions reconnues ici (en plus de celles de l'import d'arbre). */
function echanges_foreign_ext(string $name): string
{
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    return in_array($ext, ['rmtree', 'rmgc', 'rmbackup', 'ftm', 'ftmb', 'ftw'], true) ? $ext : '';
}

/**
 * Avant les actions d'import (api.php) : un RootsMagic est traduit en GEDCOM (le fichier envoyé devient un .ged), un Family
 * Tree Maker est refusé avec la phrase qui explique quoi faire.
 */
function echanges_intercept_upload(string $action, ?array &$importFile): void
{
    $targets = [];
    if (isset($_FILES['file']) && is_array($_FILES['file'])) { $targets[] = 'files'; }
    if ($importFile && empty($importFile['pending'])) { $targets[] = 'import'; }
    foreach ($targets as $t) {
        $f = $t === 'files' ? $_FILES['file'] : $importFile;
        if (($f['error'] ?? 1) !== UPLOAD_ERR_OK) { continue; }
        $ext = echanges_foreign_ext((string) ($f['name'] ?? ''));
        if ($ext === '') { continue; }
        if (in_array($ext, ['ftm', 'ftmb', 'ftw'], true)) { json_response(['error' => FTM_MESSAGE, 'format' => 'ftm'], 422); }
        if ($ext === 'rmbackup') { json_response(['error' => 'C’est une sauvegarde de RootsMagic (.rmbackup) : ouvre-la dans RootsMagic (Fichier → Restaurer), puis importe ici le fichier .rmtree.'], 422); }
        try { [$ged] = rootsmagic_to_gedcom((string) $f['tmp_name']); }
        catch (RuntimeException $e) { json_response(['error' => $e->getMessage(), 'format' => 'rootsmagic'], 422); }
        $out = tempnam(sys_get_temp_dir(), 'lcrm');
        file_put_contents($out, $ged);
        register_shutdown_function(static fn() => @unlink($out));
        $conv = ['name' => preg_replace('/\.[^.]+$/', '', (string) $f['name']) . '.ged', 'tmp_name' => $out, 'error' => UPLOAD_ERR_OK, 'size' => strlen($ged), 'converted_from' => 'rootsmagic'] + array_diff_key($f, array_flip(['name', 'tmp_name', 'size', 'error', 'type']));
        if ($t === 'files') { $_FILES['file'] = $conv + ['type' => 'text/plain']; } else { $importFile = $conv; }
    }
}

/** Ouvre une base RootsMagic en lecture seule, vérifie qu'elle en est bien une. */
function rootsmagic_open(string $path): PDO
{
    if (!is_file($path)) { throw new RuntimeException('Fichier RootsMagic introuvable.'); }
    if (filesize($path) > RM_MAX_BYTES) { throw new RuntimeException('Ce fichier RootsMagic est trop gros (plus de 1 Go).'); }
    $h = fopen($path, 'rb'); $magic = $h ? (string) fread($h, 16) : ''; if ($h) { fclose($h); }
    if ($magic !== "SQLite format 3\0") { throw new RuntimeException('Ce fichier n’est pas une base RootsMagic lisible (il est abîmé, ou ce n’est pas un .rmtree).'); }
    try {
        $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);
        // RootsMagic range ses noms avec sa propre comparaison (RMNOCASE) : on la fournit pour pouvoir lire ses index
        $coll = static fn($a, $b): int => strcmp(mb_strtolower((string) $a), mb_strtolower((string) $b));
        if (method_exists($pdo, 'sqliteCreateCollation')) { @$pdo->sqliteCreateCollation('RMNOCASE', $coll); }
        $pdo->exec('PRAGMA query_only = 1');
        $tables = array_map('strtolower', $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN));
    } catch (PDOException) {
        throw new RuntimeException('Ce fichier RootsMagic est abîmé : il ne s’ouvre pas.');
    }
    foreach (['persontable', 'nametable', 'familytable', 'eventtable'] as $t) {
        if (!in_array($t, $tables, true)) { throw new RuntimeException('Ce fichier n’est pas une base RootsMagic : la table ' . $t . ' manque.'); }
    }
    return $pdo;
}

/** Lignes d'une table RootsMagic (absente : []), bornées. */
function rootsmagic_rows(PDO $rm, string $table): array
{
    $ok = $rm->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND lower(name)=lower(?)"); $ok->execute([$table]);
    if (!$ok->fetchColumn()) { return []; }
    $n = (int) $rm->query('SELECT count(*) FROM "' . $table . '"')->fetchColumn();
    if ($n > RM_MAX_ROWS) { throw new RuntimeException('Ce fichier RootsMagic est trop gros (' . $n . ' lignes dans ' . $table . ').'); }
    return $rm->query('SELECT * FROM "' . $table . '"')->fetchAll();
}

/**
 * Date de RootsMagic (« D.+18140628..+00000000.. », « DA+17500000..+00000000.. », « DR+18800000..+18850000.. », « Tvers 1800 »)
 * → date GEDCOM.
 */
function rootsmagic_date(?string $v): string
{
    $v = (string) $v;
    if ($v === '' || $v[0] === '.') { return ''; }
    if ($v[0] === 'T') { $t = trim(substr($v, 1)); return $t !== '' ? '(' . str_replace(['(', ')'], '', $t) . ')' : ''; }
    if ($v[0] !== 'D' || strlen($v) < 13) { return ''; }
    $one = static function (string $sign, string $ymd, string $dbl): string {
        $y = (int) substr($ymd, 0, 4); $m = (int) substr($ymd, 4, 2); $d = (int) substr($ymd, 6, 2);
        if ($y === 0) { return ''; }
        $s = ($d ? $d . ' ' : '') . ($m >= 1 && $m <= 12 ? GEDCOM_MONTHS[$m - 1] . ' ' : '') . $y;
        if ($dbl === '/') { $s .= '/' . str_pad((string) (($y + 1) % 100), 2, '0', STR_PAD_LEFT); }
        return $sign === '-' ? $s . ' B.C.' : $s;
    };
    $mod = $v[1];
    $a = $one($v[2], substr($v, 3, 8), $v[11] ?? '.');
    $q = $v[12] ?? '.';
    $b = strlen($v) >= 24 ? $one($v[13], substr($v, 14, 8), $v[22] ?? '.') : '';
    if ($a === '') { return ''; }
    $qual = match ($q) { 'A', 'C', 'S', '?', '1', '2', '3', '4', '5' => 'ABT ', 'E' => 'EST ', 'L' => 'CAL ', default => '' };
    return match ($mod) {
        'B', 'Y' => 'BEF ' . $a,
        'A', 'I' => 'AFT ' . $a,
        'F' => 'FROM ' . $a,
        'T', 'U' => 'TO ' . $a,
        'R', '-' => $b !== '' ? 'BET ' . $a . ' AND ' . $b : $qual . $a,
        'S' => $b !== '' ? 'FROM ' . $a . ' TO ' . $b : 'FROM ' . $a,
        'O' => $b !== '' ? 'BET ' . $a . ' AND ' . $b : $qual . $a,
        default => $qual . $a,
    };
}

/** Texte de RootsMagic (notes avec <b>, <i>, <u>, <font…>) → texte simple. */
function rootsmagic_text($v): string
{
    $t = (string) $v;
    $t = preg_replace('#<br\s*/?>#i', "\n", $t) ?? $t;
    $t = html_entity_decode(strip_tags($t), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(str_replace(["\r\n", "\r"], "\n", $t));
}

/** Champs d'une source ou d'une citation (blob XML « <Root><Fields><Field><Name>Page</Name><Value>…</Value> ») → [nom => valeur]. */
function rootsmagic_fields($blob): array
{
    $s = (string) $blob;
    if ($s === '' || stripos($s, '<!DOCTYPE') !== false || stripos($s, '<!ENTITY') !== false) { return []; }
    $out = [];
    if (preg_match_all('#<Field>\s*<Name>(.*?)</Name>\s*<Value>(.*?)</Value>\s*</Field>#si', $s, $m, PREG_SET_ORDER)) {
        foreach ($m as $f) { $out[strtolower(trim($f[1]))] = rootsmagic_text(html_entity_decode($f[2], ENT_QUOTES | ENT_XML1, 'UTF-8')); }
    }
    return $out;
}

/**
 * Une base RootsMagic → [texte GEDCOM 5.5.1, nombres lus]. Lecture seule ; aucune requête n'écrit.
 */
function rootsmagic_to_gedcom(string $path): array
{
    $rm = rootsmagic_open($path);
    try {
        $persons = rootsmagic_rows($rm, 'PersonTable');
        $names = rootsmagic_rows($rm, 'NameTable');
        $families = rootsmagic_rows($rm, 'FamilyTable');
        $children = rootsmagic_rows($rm, 'ChildTable');
        $events = rootsmagic_rows($rm, 'EventTable');
        $factTypes = rootsmagic_rows($rm, 'FactTypeTable');
        $places = rootsmagic_rows($rm, 'PlaceTable');
        $sources = rootsmagic_rows($rm, 'SourceTable');
        $citations = rootsmagic_rows($rm, 'CitationTable');
        $citLinks = rootsmagic_rows($rm, 'CitationLinkTable');
        $media = rootsmagic_rows($rm, 'MultimediaTable');
        $mediaLinks = rootsmagic_rows($rm, 'MediaLinkTable');
        $addresses = rootsmagic_rows($rm, 'AddressTable');
        $addrLinks = rootsmagic_rows($rm, 'AddressLinkTable');
        $witnesses = rootsmagic_rows($rm, 'WitnessTable');
        $roles = rootsmagic_rows($rm, 'RoleTable');
    } catch (PDOException $e) {
        throw new RuntimeException('Ce fichier RootsMagic est abîmé : une table ne se lit pas.');
    }
    $rm = null;
    $g = static fn(array $r, string $k, $def = '') => $r[$k] ?? $r[strtolower($k)] ?? $def;
    $out = [];
    $line = static function (int $lvl, string $tag, string $val = '') use (&$out): void {
        $val = trim(preg_replace('/\s+/u', ' ', str_replace(["\r", "\n"], ' ', $val)) ?? '');
        if ($val !== '' && $val[0] === '@' && !preg_match('/^@[^@ ]+@$/', $val)) { $val = '@' . $val; }
        $out[] = $lvl . ' ' . $tag . ($val !== '' ? ' ' . $val : '');
    };
    $text = static function (int $lvl, string $tag, string $val) use (&$out): void {
        foreach (explode("\n", str_replace(["\r\n", "\r"], "\n", trim($val))) as $i => $row) {
            $row = str_starts_with($row, '@') ? '@' . $row : $row;
            $out[] = ($i === 0 ? $lvl . ' ' . $tag : ($lvl + 1) . ' CONT') . ($row !== '' ? ' ' . $row : '');
        }
    };
    // Faits
    $ft = [];
    foreach ($factTypes as $f) { $ft[(int) $g($f, 'FactTypeID')] = ['tag' => strtoupper(trim((string) $g($f, 'GedcomTag'))), 'name' => trim((string) $g($f, 'Name')), 'owner' => (int) $g($f, 'OwnerType')]; }
    // Lieux : PlaceType 0 = lieu, 2 = détail (lieu-dit, cimetière… rattaché à MasterID)
    $pl = [];
    foreach ($places as $p) { $pl[(int) $g($p, 'PlaceID')] = $p; }
    $placeOf = static function (int $placeId, int $siteId) use ($pl, $g): array {
        $p = $pl[$placeId] ?? null; if (!$p) { return ['', null, null]; }
        $name = trim((string) $g($p, 'Name'));
        if ($siteId && isset($pl[$siteId])) { $name = trim((string) $g($pl[$siteId], 'Name')) . ', ' . $name; }
        $coord = static function ($r) use ($g): array { $la = (int) $g($r, 'Latitude', 0); $lo = (int) $g($r, 'Longitude', 0); return ($la || $lo) ? [$la / 1e7, $lo / 1e7] : [null, null]; };
        [$la, $lo] = $siteId && isset($pl[$siteId]) ? $coord($pl[$siteId]) : [null, null];
        if ($la === null) { [$la, $lo] = $coord($p); }
        return [$name, $la, $lo];
    };
    // Citations (RootsMagic 8+ : CitationTable + CitationLinkTable ; 7 : CitationTable avec OwnerType/OwnerID)
    $cit = []; $citBy = [];
    foreach ($citations as $c) { $cit[(int) $g($c, 'CitationID')] = $c; }
    if ($citLinks) {
        foreach ($citLinks as $l) { $citBy[(int) $g($l, 'OwnerType') . ':' . (int) $g($l, 'OwnerID')][] = [(int) $g($l, 'CitationID'), (string) $g($l, 'Quality')]; }
    } else {
        foreach ($citations as $c) { if (isset($c['OwnerType'])) { $citBy[(int) $c['OwnerType'] . ':' . (int) $c['OwnerID']][] = [(int) $g($c, 'CitationID'), (string) $g($c, 'Quality')]; } }
    }
    $srcIds = [];
    foreach ($sources as $s) { $srcIds[(int) $g($s, 'SourceID')] = true; }
    $writeCites = static function (int $lvl, int $ownerType, int $ownerId) use ($citBy, $cit, $srcIds, $g, $line, $text): void {
        foreach ($citBy[$ownerType . ':' . $ownerId] ?? [] as [$cid, $quality]) {
            $c = $cit[$cid] ?? null; if (!$c) { continue; }
            $sid = (int) $g($c, 'SourceID'); if (!isset($srcIds[$sid])) { continue; }
            $line($lvl, 'SOUR', '@S' . $sid . '@');
            $fields = rootsmagic_fields($g($c, 'Fields'));
            $page = $fields['page'] ?? (trim((string) $g($c, 'RefNumber')) ?: trim((string) $g($c, 'CitationName')));
            if ($page !== '') { $line($lvl + 1, 'PAGE', $page); }
            // Qualité de RootsMagic (« ~~~ » : source, information, preuve) → QUAY 0–3
            $q = strtoupper(trim($quality));
            if ($q !== '' && $q !== '~~~') { $line($lvl + 1, 'QUAY', str_contains($q, 'X') ? '0' : (str_starts_with($q, 'O') && str_contains($q, 'D') ? '3' : (str_starts_with($q, 'O') ? '2' : '1'))); }
            $note = trim(implode("\n\n", array_filter([rootsmagic_text($g($c, 'Comments')), rootsmagic_text($g($c, 'ActualText'))])));
            if ($note !== '') { $text($lvl + 1, 'NOTE', $note); }
        }
    };
    // Médias
    $med = []; $mediaBy = [];
    foreach ($media as $m) { $med[(int) $g($m, 'MediaID')] = $m; }
    foreach ($mediaLinks as $l) { $mediaBy[(int) $g($l, 'OwnerType') . ':' . (int) $g($l, 'OwnerID')][] = [(int) $g($l, 'MediaID'), (int) $g($l, 'IsPrimary', 0)]; }
    $writeMedia = static function (int $lvl, int $ownerType, int $ownerId) use ($mediaBy, $med, $line): void {
        foreach ($mediaBy[$ownerType . ':' . $ownerId] ?? [] as [$mid, $prim]) {
            if (!isset($med[$mid])) { continue; }
            $line($lvl, 'OBJE', '@M' . $mid . '@');
            if ($prim) { $line($lvl + 1, '_PRIM', 'Y'); }
        }
    };
    // Témoins (RootsMagic « partage » un événement : WitnessTable + RoleTable)
    $roleName = []; foreach ($roles as $r) { $roleName[(int) $g($r, 'RoleID')] = trim((string) $g($r, 'RoleName')); }
    $witBy = []; foreach ($witnesses as $wi) { if ((int) $g($wi, 'PersonID')) { $witBy[(int) $g($wi, 'EventID')][] = [(int) $g($wi, 'PersonID'), $roleName[(int) $g($wi, 'Role')] ?? 'Witness']; } }
    $personIds = []; foreach ($persons as $p) { $personIds[(int) $g($p, 'PersonID')] = true; }
    $writeEvent = static function (array $e, string $scope) use ($ft, $placeOf, $g, $line, $text, $writeCites, $writeMedia, $witBy, $personIds): void {
        $type = $ft[(int) $g($e, 'EventType')] ?? ['tag' => 'EVEN', 'name' => 'Événement', 'owner' => 0];
        $tag = preg_match('/^_?[A-Z0-9]{3,5}$/', $type['tag']) ? $type['tag'] : 'EVEN';
        $std = $scope === 'person' ? array_merge(GEDCOM_PERSON_EVENT_TAGS, GEDCOM_PERSON_ATTRIBUTE_TAGS) : GEDCOM_FAMILY_EVENT_TAGS;
        $details = trim((string) $g($e, 'Details'));
        if ($tag === 'EVEN' || (!in_array($tag, $std, true) && !str_starts_with($tag, '_'))) {
            $line(1, 'EVEN', $details);
            $line(2, 'TYPE', $type['name'] !== '' ? $type['name'] : 'Événement');
        } else {
            $line(1, $tag, $details);
        }
        $date = rootsmagic_date((string) $g($e, 'Date'));
        if ($date !== '') { $line(2, 'DATE', $date); }
        [$plac, $la, $lo] = $placeOf((int) $g($e, 'PlaceID', 0), (int) $g($e, 'SiteID', 0));
        if ($plac !== '') {
            $line(2, 'PLAC', $plac);
            if ($la !== null) { $line(3, 'MAP'); $line(4, 'LATI', ($la < 0 ? 'S' : 'N') . abs(round($la, 6))); $line(4, 'LONG', ($lo < 0 ? 'W' : 'E') . abs(round($lo, 6))); }
        }
        $note = rootsmagic_text($g($e, 'Note'));
        if ($note !== '') { $text(2, 'NOTE', $note); }
        foreach ($witBy[(int) $g($e, 'EventID')] ?? [] as [$wid, $role]) {
            if (!isset($personIds[$wid])) { continue; }
            $line(2, 'ASSO', '@I' . $wid . '@'); $line(3, 'RELA', $role !== '' ? $role : 'Witness');
        }
        $writeCites(2, 2, (int) $g($e, 'EventID'));
        $writeMedia(2, 2, (int) $g($e, 'EventID'));
    };

    $line(0, 'HEAD');
    $line(1, 'SOUR', 'RootsMagic');
    $line(2, 'NAME', 'RootsMagic (lu directement par LCNDA)');
    $line(1, 'GEDC'); $line(2, 'VERS', '5.5.1'); $line(2, 'FORM', 'LINEAGE-LINKED');
    $line(1, 'CHAR', 'UTF-8');

    $namesBy = [];
    foreach ($names as $n) { $namesBy[(int) $g($n, 'OwnerID')][] = $n; }
    $eventsBy = [];
    foreach ($events as $e) { $eventsBy[(int) $g($e, 'OwnerType') . ':' . (int) $g($e, 'OwnerID')][] = $e; }
    foreach ($eventsBy as &$list) { usort($list, static fn($a, $b) => [(int) ($a['SortDate'] ?? 0), (int) $a['EventID']] <=> [(int) ($b['SortDate'] ?? 0), (int) $b['EventID']]); }
    unset($list);
    $famc = []; $fams = [];
    $fam = []; foreach ($families as $f) { $fam[(int) $g($f, 'FamilyID')] = $f; foreach (['FatherID', 'MotherID'] as $k) { if ((int) $g($f, $k)) { $fams[(int) $g($f, $k)][] = (int) $g($f, 'FamilyID'); } } }
    $kids = []; foreach ($children as $c) { if (isset($fam[(int) $g($c, 'FamilyID')])) { $kids[(int) $g($c, 'FamilyID')][] = $c; $famc[(int) $g($c, 'ChildID')][] = $c; } }
    $rel = static fn(int $r): string => match ($r) { 1 => 'Adopted', 2 => 'Step', 3 => 'Foster', default => 'Natural' };
    $counts = ['persons' => 0, 'families' => count($fam), 'events' => count($events), 'places' => count($places), 'sources' => count($sources), 'citations' => count($citLinks ?: $citations), 'media' => count($media), 'notes' => 0];

    foreach ($persons as $p) {
        $pid = (int) $g($p, 'PersonID');
        $counts['persons']++;
        $line(0, '@I' . $pid . '@', 'INDI');
        $list = $namesBy[$pid] ?? [];
        usort($list, static fn($a, $b) => (int) $g($b, 'IsPrimary', 0) <=> (int) $g($a, 'IsPrimary', 0));
        foreach ($list as $i => $n) {
            $given = trim((string) $g($n, 'Given')); $sur = trim((string) $g($n, 'Surname'));
            $line(1, 'NAME', trim($given . ' /' . str_replace('/', ' ', $sur) . '/ ' . trim((string) $g($n, 'Suffix'))));
            if ($i > 0) { $nt = (int) $g($n, 'NameType', 0); $line(2, 'TYPE', match ($nt) { 5 => 'married', 2 => 'birth', 4 => 'maiden', 3 => 'immigrant', default => 'aka' }); }
            if (trim((string) $g($n, 'Prefix')) !== '') { $line(2, 'NPFX', (string) $g($n, 'Prefix')); }
            if ($given !== '') { $line(2, 'GIVN', $given); }
            if ($sur !== '') { $line(2, 'SURN', $sur); }
            if (trim((string) $g($n, 'Suffix')) !== '') { $line(2, 'NSFX', (string) $g($n, 'Suffix')); }
            if (trim((string) $g($n, 'Nickname')) !== '') { $line(2, 'NICK', (string) $g($n, 'Nickname')); }
            if ($i > 0 && ($dt = rootsmagic_date((string) $g($n, 'Date'))) !== '') { $line(2, 'DATE', $dt); }
            if ($i > 0 && ($nn = rootsmagic_text($g($n, 'Note'))) !== '') { $text(2, 'NOTE', $nn); }
        }
        if (!$list) { $line(1, 'NAME', '//'); }
        $line(1, 'SEX', match ((int) $g($p, 'Sex', 2)) { 0 => 'M', 1 => 'F', default => 'U' });
        if ((int) $g($p, 'IsPrivate', 0) === 1) { $line(1, 'RESN', 'confidential'); }
        if (trim((string) $g($p, 'UniqueID')) !== '') { $line(1, '_UID', trim((string) $g($p, 'UniqueID'))); }
        foreach ($eventsBy['0:' . $pid] ?? [] as $e) { $writeEvent($e, 'person'); }
        foreach ($famc[$pid] ?? [] as $c) {
            $line(1, 'FAMC', '@F' . (int) $g($c, 'FamilyID') . '@');
            $rf = (int) $g($c, 'RelFather', 0); $rmo = (int) $g($c, 'RelMother', 0);
            if ($rf === $rmo && in_array($rf, [1, 3], true)) { $line(2, 'PEDI', $rf === 1 ? 'adopted' : 'foster'); }
        }
        foreach ($fams[$pid] ?? [] as $fid) { $line(1, 'FAMS', '@F' . $fid . '@'); }
        $note = rootsmagic_text($g($p, 'Note'));
        if ($note !== '') { $text(1, 'NOTE', $note); $counts['notes']++; }
        $writeCites(1, 0, $pid);
        $writeMedia(1, 0, $pid);
    }
    foreach ($fam as $fid => $f) {
        $line(0, '@F' . $fid . '@', 'FAM');
        if ((int) $g($f, 'FatherID') && isset($personIds[(int) $g($f, 'FatherID')])) { $line(1, 'HUSB', '@I' . (int) $g($f, 'FatherID') . '@'); }
        if ((int) $g($f, 'MotherID') && isset($personIds[(int) $g($f, 'MotherID')])) { $line(1, 'WIFE', '@I' . (int) $g($f, 'MotherID') . '@'); }
        $list = $kids[$fid] ?? [];
        usort($list, static fn($a, $b) => (int) $g($a, 'ChildOrder', 0) <=> (int) $g($b, 'ChildOrder', 0));
        foreach ($list as $c) {
            if (!isset($personIds[(int) $g($c, 'ChildID')])) { continue; }
            $line(1, 'CHIL', '@I' . (int) $g($c, 'ChildID') . '@');
            $rf = (int) $g($c, 'RelFather', 0); $rmo = (int) $g($c, 'RelMother', 0);
            if ($rf || $rmo) { $line(2, '_FREL', $rel($rf)); $line(2, '_MREL', $rel($rmo)); }
        }
        foreach ($eventsBy['1:' . $fid] ?? [] as $e) { $writeEvent($e, 'family'); }
        $note = rootsmagic_text($g($f, 'Note'));
        if ($note !== '') { $text(1, 'NOTE', $note); $counts['notes']++; }
        $writeCites(1, 1, $fid);
        $writeMedia(1, 1, $fid);
    }
    // Dépôts (AddressTable AddressType=1) reliés aux sources (AddressLinkTable OwnerType=3)
    $repoOf = [];
    $addr = []; foreach ($addresses as $a) { $addr[(int) $g($a, 'AddressID')] = $a; }
    foreach ($addrLinks as $l) { if ((int) $g($l, 'OwnerType') === 3 && isset($addr[(int) $g($l, 'AddressID')])) { $repoOf[(int) $g($l, 'OwnerID')] = (int) $g($l, 'AddressID'); } }
    foreach ($sources as $s) {
        $sid = (int) $g($s, 'SourceID');
        $f = rootsmagic_fields($g($s, 'Fields'));
        $line(0, '@S' . $sid . '@', 'SOUR');
        $line(1, 'TITL', trim((string) $g($s, 'Name')) ?: ($f['title'] ?? 'Source sans titre'));
        if (($f['author'] ?? '') !== '') { $line(1, 'AUTH', $f['author']); }
        $publ = trim(implode(', ', array_filter([$f['publisher'] ?? '', $f['pubplace'] ?? ($f['publishplace'] ?? ''), $f['pubdate'] ?? ($f['publishdate'] ?? '')])));
        if ($publ !== '') { $line(1, 'PUBL', $publ); }
        $body = trim(implode("\n\n", array_filter([rootsmagic_text($g($s, 'ActualText')), rootsmagic_text($g($s, 'Comments'))])));
        if ($body !== '') { $text(1, 'TEXT', $body); }
        if (($f['url'] ?? '') !== '' && preg_match('#^https?://#i', $f['url'])) { $line(1, 'WWW', $f['url']); }
        if (isset($repoOf[$sid])) { $line(1, 'REPO', '@R' . $repoOf[$sid] . '@'); }
        $writeMedia(1, 3, $sid);
    }
    foreach (array_unique(array_values($repoOf)) as $aid) {
        $a = $addr[$aid];
        $line(0, '@R' . $aid . '@', 'REPO');
        $line(1, 'NAME', trim((string) $g($a, 'Name')) ?: 'Dépôt');
        $adr = trim(implode(', ', array_filter([trim((string) $g($a, 'Street1')), trim((string) $g($a, 'City')), trim((string) $g($a, 'Country'))])));
        if ($adr !== '') { $line(1, 'ADDR', $adr); }
    }
    foreach ($med as $mid => $m) {
        $line(0, '@M' . $mid . '@', 'OBJE');
        $file = str_replace('\\', '/', trim((string) $g($m, 'MediaPath'))); $file = rtrim($file, '/') . '/' . trim((string) $g($m, 'MediaFile'));
        $file = ltrim($file, '/') === trim((string) $g($m, 'MediaFile')) ? trim((string) $g($m, 'MediaFile')) : $file;
        // RootsMagic note « ?\ » pour le dossier des médias : on garde le nom seul (cherché dans tes médias)
        if (str_starts_with($file, '?')) { $file = basename($file); }
        $line(1, 'FILE', $file);
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION)); if ($ext !== '') { $line(2, 'FORM', $ext); }
        $title = trim((string) $g($m, 'Caption')); if ($title !== '') { $line(1, 'TITL', $title); }
        if (($dt = rootsmagic_date((string) $g($m, 'Date'))) !== '') { $line(1, 'DATE', $dt); }
        $desc = rootsmagic_text($g($m, 'Description')); if ($desc !== '') { $text(1, 'NOTE', $desc); }
    }
    $line(0, 'TRLR');
    return [implode("\n", $out) . "\n", $counts];
}
