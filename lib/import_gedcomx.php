<?php
declare(strict_types=1);

/**
 * ⤒ GEDCOM-X (le format de FamilySearch) : JSON (application/x-gedcomx-v1+json) et XML (application/x-gedcomx-v1+xml).
 *
 * Traduit en GEDCOM 5.5.1 puis importé par le même moteur (import_gedcom_into_db) : un seul import, un seul aperçu,
 * un seul « ↶ Annuler ». Relit sans perte notable ce qu'écrit l'export GEDCOM-X de LCNDA (lib/echanges.php) : personnes,
 * noms (et autres noms), sexe, faits datés et placés (valeur, cause, notes, sources et pages), couples et leurs faits,
 * filiations (adoption, nourricier, beau-parent), lieux avec coordonnées, sources, dépôts, notes, identifiants FamilySearch
 * et Wikidata. Le XML est lu sans DOCTYPE ni ENTITY.
 */

const GEDCOMX_MAX_BYTES = 300 * 1048576;

/** Vrai si un texte JSON ou XML ressemble à du GEDCOM-X. */
function gedcomx_sniff(string $head): bool
{
    $h = substr($head, 0, 65536);
    if (preg_match('/<gedcomx\b/i', $h)) { return true; }
    return (bool) preg_match('/^\s*[\[{]/', $h) && str_contains($h, '"persons"') && (str_contains($h, 'gedcomx.org') || str_contains($h, '"relationships"') || str_contains($h, '"nameForms"'));
}

/** Le XML GEDCOM-X → le même tableau que le JSON. */
function gedcomx_xml_to_array(string $xml): array
{
    $xml = preg_replace('/^\xEF\xBB\xBF/', '', $xml) ?? $xml;
    if (preg_match('/<!DOCTYPE|<!ENTITY/i', $xml)) { throw new RuntimeException('Ce fichier GEDCOM-X contient un « DOCTYPE » ou des « ENTITY » XML : il est refusé par prudence.'); }
    $dom = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $ok = $dom->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE);
    libxml_clear_errors(); libxml_use_internal_errors($prev);
    if (!$ok || !$dom->documentElement || $dom->documentElement->localName !== 'gedcomx') { throw new RuntimeException('Le XML de ce fichier GEDCOM-X est abîmé (ou ce n’est pas du GEDCOM-X).'); }
    $kids = static function (DOMElement $e, string $name): array { $o = []; foreach ($e->childNodes as $c) { if ($c instanceof DOMElement && $c->localName === $name) { $o[] = $c; } } return $o; };
    $one = static function (DOMElement $e, string $name) use ($kids): ?DOMElement { return $kids($e, $name)[0] ?? null; };
    $txt = static fn(?DOMElement $e): string => $e ? trim($e->textContent) : '';
    $ref = static fn(?DOMElement $e, string $attr): array => $e ? [$attr => $e->getAttribute($attr)] : [];
    $notes = static function (DOMElement $e) use ($kids, $one, $txt): array { return array_map(static fn($n) => array_filter(['subject' => $txt($one($n, 'subject')), 'text' => $txt($one($n, 'text'))]), $kids($e, 'note')); };
    $sources = static function (DOMElement $e) use ($kids): array { return array_map(static fn($s) => ['description' => $s->getAttribute('description')], $kids($e, 'source')); };
    $fact = static function (DOMElement $f) use ($kids, $one, $txt, $notes, $sources): array {
        $o = ['type' => $f->getAttribute('type')];
        if ($d = $one($f, 'date')) { $o['date'] = array_filter(['original' => $txt($one($d, 'original')), 'formal' => $txt($one($d, 'formal'))]); }
        if ($p = $one($f, 'place')) { $o['place'] = array_filter(['original' => $txt($one($p, 'original')), 'description' => $p->getAttribute('description')]); }
        if (($v = $one($f, 'value')) !== null) { $o['value'] = $txt($v); }
        $q = array_map(static fn($x) => ['name' => $x->getAttribute('name'), 'value' => trim($x->textContent)], $kids($f, 'qualifier'));
        if ($q) { $o['qualifiers'] = $q; }
        if ($n = $notes($f)) { $o['notes'] = $n; }
        if ($s = $sources($f)) { $o['sources'] = $s; }
        return $o;
    };
    $root = $dom->documentElement; $out = ['persons' => [], 'relationships' => [], 'sourceDescriptions' => [], 'agents' => [], 'places' => []];
    foreach ($kids($root, 'person') as $p) {
        $o = ['id' => $p->getAttribute('id')];
        if ($g = $one($p, 'gender')) { $o['gender'] = ['type' => $g->getAttribute('type')]; }
        if (($l = $one($p, 'living')) !== null) { $o['living'] = $txt($l) === 'true'; }
        if ($p->getAttribute('private') === 'true') { $o['private'] = true; }
        $o['names'] = array_map(static function ($n) use ($kids, $txt, $one) {
            return ['type' => $n->getAttribute('type'), 'preferred' => $n->getAttribute('preferred') === 'true', 'nameForms' => array_map(static fn($nf) => ['fullText' => $txt($one($nf, 'fullText')),
                'parts' => array_map(static fn($pt) => ['type' => $pt->getAttribute('type'), 'value' => $pt->getAttribute('value')], $kids($nf, 'part'))], $kids($n, 'nameForm'))];
        }, $kids($p, 'name'));
        $o['facts'] = array_map($fact, $kids($p, 'fact'));
        $o['notes'] = $notes($p); $o['sources'] = $sources($p);
        foreach ($kids($p, 'identifier') as $id) { $o['identifiers'][$id->getAttribute('type') ?: 'http://gedcomx.org/Primary'][] = trim($id->textContent); }
        $out['persons'][] = $o;
    }
    foreach ($kids($root, 'relationship') as $r) {
        $out['relationships'][] = ['id' => $r->getAttribute('id'), 'type' => $r->getAttribute('type'), 'person1' => $ref($one($r, 'person1'), 'resource'), 'person2' => $ref($one($r, 'person2'), 'resource'),
            'facts' => array_map($fact, $kids($r, 'fact')), 'notes' => $notes($r), 'sources' => $sources($r)];
    }
    foreach ($kids($root, 'sourceDescription') as $s) {
        $o = ['id' => $s->getAttribute('id'), 'about' => $s->getAttribute('about'), 'titles' => array_map(static fn($t) => ['value' => trim($t->textContent)], $kids($s, 'title')),
            'citations' => array_map(static fn($c) => ['value' => $txt($one($c, 'value'))], $kids($s, 'citation')), 'notes' => $notes($s)];
        if ($c = $one($s, 'componentOf')) { $o['componentOf'] = ['description' => $c->getAttribute('description')]; }
        if ($c = $one($s, 'repository')) { $o['repository'] = ['resource' => $c->getAttribute('resource')]; }
        $out['sourceDescriptions'][] = $o;
    }
    foreach ($kids($root, 'agent') as $a) { $out['agents'][] = ['id' => $a->getAttribute('id'), 'names' => array_map(static fn($n) => ['value' => trim($n->textContent)], $kids($a, 'name'))]; }
    foreach ($kids($root, 'place') as $pl) {
        $o = ['id' => $pl->getAttribute('id'), 'names' => array_map(static fn($n) => ['value' => trim($n->textContent)], $kids($pl, 'name'))];
        if (($la = $one($pl, 'latitude')) && ($lo = $one($pl, 'longitude'))) { $o['latitude'] = (float) $txt($la); $o['longitude'] = (float) $txt($lo); }
        $out['places'][] = $o;
    }
    return $out;
}

/** Date formelle GEDCOM-X (« +1814-06-28 », « A+1750 », « +1880/+1885 », « /+1800 ») → date GEDCOM ; '' si illisible. */
function gedcomx_formal_to_gedcom(string $f): string
{
    $f = trim($f);
    $one = static function (string $s): ?string {
        if (!preg_match('/^([+-])(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T.*)?$/', $s, $m)) { return null; }
        $y = (int) $m[2]; $mo = (int) ($m[3] ?? 0); $d = (int) ($m[4] ?? 0);
        if ($mo > 12 || $d > 31) { return null; }
        return trim(($d ? $d . ' ' : '') . ($mo ? GEDCOM_MONTHS[$mo - 1] . ' ' : '') . $y . ($m[1] === '-' ? ' B.C.' : ''));
    };
    $approx = false;
    if (str_starts_with($f, 'A')) { $approx = true; $f = substr($f, 1); }
    if (str_contains($f, '/')) {
        [$a, $b] = explode('/', $f, 2);
        $ga = $a !== '' ? $one($a) : null; $gb = $b !== '' && !str_starts_with($b, 'P') ? $one($b) : null;
        if ($ga && $gb) { return ($approx ? 'BET ' : 'FROM ') . $ga . ($approx ? ' AND ' : ' TO ') . $gb; }
        if ($ga) { return 'AFT ' . $ga; }
        if ($gb) { return 'BEF ' . $gb; }
        return '';
    }
    $g = $one($f);
    return $g === null ? '' : ($approx ? 'ABT ' . $g : $g);
}

/** Le contenu d'un fichier GEDCOM-X (JSON ou XML) → [texte GEDCOM 5.5.1, nombres lus]. */
function gedcomx_to_gedcom(string $content): array
{
    if (strlen($content) > GEDCOMX_MAX_BYTES) { throw new RuntimeException('Ce fichier GEDCOM-X est trop gros (plus de 300 Mo).'); }
    $content = preg_replace('/^\xEF\xBB\xBF/', '', $content) ?? $content;
    if (preg_match('/^\s*</', $content)) { $doc = gedcomx_xml_to_array($content); }
    else {
        try { $doc = json_decode($content, true, 64, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING); }
        catch (JsonException) { throw new RuntimeException('Le JSON de ce fichier GEDCOM-X est abîmé : il ne peut pas être lu.'); }
        if (!is_array($doc)) { throw new RuntimeException('Ce fichier n’est pas du GEDCOM-X.'); }
    }
    $persons = is_array($doc['persons'] ?? null) ? $doc['persons'] : [];
    if (!$persons) { throw new RuntimeException('Aucune personne dans ce fichier GEDCOM-X.'); }
    $arr = static fn($v): array => is_array($v) ? array_values(array_filter($v, 'is_array')) : [];
    $str = static fn($v): string => is_scalar($v) ? trim((string) $v) : '';
    $refId = static fn($v): string => ltrim(is_array($v) ? (string) ($v['resource'] ?? $v['description'] ?? '') : (string) $v, '#');
    // les identifiants GEDCOM viennent des identifiants GEDCOM-X, nettoyés
    $xid = static function (string $prefix, string $id): string { $id = preg_replace('/[^A-Za-z0-9_\-]/', '', $id) ?: substr(md5($id), 0, 10); return $prefix . substr($id, 0, 40); };
    $counts = ['persons' => 0, 'families' => 0, 'events' => 0, 'sources' => 0, 'places' => 0, 'notes' => 0, 'children_links' => 0];
    $out = ['0 HEAD', '1 SOUR GEDCOM-X', '2 NAME GEDCOM-X', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
    $txt = static function (int $lvl, string $tag, string $v) use (&$out): void {
        foreach (explode("\n", str_replace("\r", '', trim($v))) as $k => $row) { $row = str_starts_with($row, '@') ? '@' . $row : $row; $out[] = $k === 0 ? "$lvl $tag" . ($row !== '' ? " $row" : '') : ($lvl + 1) . ' CONT' . ($row !== '' ? " $row" : ''); }
    };
    // lieux, sources, dépôts
    $places = [];
    foreach ($arr($doc['places'] ?? []) as $pl) { $places[$str($pl['id'] ?? '')] = $pl; $counts['places']++; }
    $agents = [];
    foreach ($arr($doc['agents'] ?? []) as $a) { $agents[$str($a['id'] ?? '')] = $str($arr($a['names'] ?? [])[0]['value'] ?? ''); }
    $sds = [];
    foreach ($arr($doc['sourceDescriptions'] ?? []) as $sd) { $sds[$str($sd['id'] ?? '')] = $sd; }
    $mainDesc = $refId($doc['description'] ?? '');
    $sourceX = []; // id de description → xref de la source (une « composante » renvoie à sa source + page)
    $title0 = static fn(array $sd) => $str($arr($sd['titles'] ?? [])[0]['value'] ?? '') ?: $str($arr($sd['citations'] ?? [])[0]['value'] ?? '');
    foreach ($sds as $id => $sd) {
        if ($id === '' || $id === $mainDesc || isset($sd['componentOf'])) { continue; }
        $x = $xid('S', $id); $sourceX[$id] = [$x, ''];
        $out[] = '0 @' . $x . '@ SOUR';
        $txt(1, 'TITL', $title0($sd) ?: 'Source sans titre');
        $cit = $str($arr($sd['citations'] ?? [])[0]['value'] ?? '');
        if ($cit !== '' && $cit !== $title0($sd)) { $txt(1, 'TEXT', $cit); }
        if (preg_match('#^https?://\S+$#i', $str($sd['about'] ?? ''))) { $out[] = '1 WWW ' . $str($sd['about']); }
        foreach ($arr($sd['notes'] ?? []) as $nt) { if ($str($nt['text'] ?? '') !== '') { $txt(1, 'NOTE', $str($nt['text'])); } }
        $rep = $refId($sd['repository'] ?? '');
        if ($rep !== '' && ($agents[$rep] ?? '') !== '') { $out[] = '1 REPO'; $out[] = '2 NAME ' . $agents[$rep]; }
        $counts['sources']++;
    }
    foreach ($sds as $id => $sd) {
        if (!isset($sd['componentOf'])) { continue; }
        $parent = $refId($sd['componentOf']);
        if (!isset($sourceX[$parent])) { continue; }
        $ptitle = $title0($sds[$parent]); $t = $title0($sd);
        $page = ($ptitle !== '' && str_starts_with($t, $ptitle . ' — ')) ? substr($t, strlen($ptitle . ' — ')) : $t;
        $sourceX[$id] = [$sourceX[$parent][0], $page];
    }
    $cite = static function (int $lvl, array $srcs) use ($arr, $refId, &$sourceX, &$out): void {
        foreach ($arr($srcs) as $s) {
            $d = $refId($s['description'] ?? '');
            if (!isset($sourceX[$d])) { continue; }
            $out[] = $lvl . ' SOUR @' . $sourceX[$d][0] . '@';
            if ($sourceX[$d][1] !== '') { $out[] = ($lvl + 1) . ' PAGE ' . $sourceX[$d][1]; }
        }
    };
    $notes = static function (int $lvl, array $ns, bool $firstIsDescription = false) use ($arr, $str, $txt, &$out, &$counts): void {
        foreach ($arr($ns) as $nt) {
            $body = $str($nt['text'] ?? ''); $subj = $str($nt['subject'] ?? '');
            if ($body === '' && $subj === '') { continue; }
            $txt($lvl, 'NOTE', $subj !== '' && $body !== $subj ? $subj . "\n" . $body : $body);
            if ($subj !== '') { $out[] = ($lvl + 1) . ' _TITL ' . $subj; }
            $counts['notes']++;
        }
    };
    static $types = ['Birth' => 'BIRT', 'Death' => 'DEAT', 'Burial' => 'BURI', 'Cremation' => 'CREM', 'Christening' => 'CHR', 'Baptism' => 'BAPM', 'Adoption' => 'ADOP',
        'BarMitzvah' => 'BARM', 'BatMitzvah' => 'BASM', 'Blessing' => 'BLES', 'Confirmation' => 'CONF', 'FirstCommunion' => 'FCOM', 'Ordination' => 'ORDN', 'Naturalization' => 'NATU',
        'Emigration' => 'EMIG', 'Immigration' => 'IMMI', 'Census' => 'CENS', 'Probate' => 'PROB', 'Will' => 'WILL', 'Graduation' => 'GRAD', 'Retirement' => 'RETI', 'Caste' => 'CAST',
        'PhysicalDescription' => 'DSCR', 'Education' => 'EDUC', 'NationalId' => 'IDNO', 'Nationality' => 'NATI', 'NumberOfChildren' => 'NCHI', 'NumberOfMarriages' => 'NMR',
        'Occupation' => 'OCCU', 'Property' => 'PROP', 'Religion' => 'RELI', 'Residence' => 'RESI', 'NobilityTitle' => 'TITL', 'MilitaryService' => '_MILT', 'Marriage' => 'MARR',
        'Divorce' => 'DIV', 'DivorceFiling' => 'DIVF', 'Engagement' => 'ENGA', 'Annulment' => 'ANUL', 'MarriageBanns' => 'MARB', 'MarriageContract' => 'MARC',
        'MarriageLicense' => 'MARL', 'MarriageSettlement' => 'MARS'];
    $writeFact = static function (array $f, string $scope) use ($str, $arr, $refId, $places, $types, $txt, $cite, $notes, &$out, &$counts): void {
        $type = $str($f['type'] ?? '');
        $label = '';
        if (str_starts_with($type, 'http://gedcomx.org/')) { $k = substr($type, 19); $tag = $types[$k] ?? 'EVEN'; if ($tag === 'EVEN') { $label = trim(preg_replace('/(?<=[a-z])(?=[A-Z])/', ' ', $k) ?? $k); } }
        elseif (str_starts_with($type, 'data:,')) { $tag = 'EVEN'; $label = rawurldecode(substr($type, 6)); }
        else { $tag = 'EVEN'; $label = $type !== '' ? (string) preg_replace('#^.*[/\#]#', '', $type) : 'Événement'; }
        if (in_array($type, ['http://gedcomx.org/AdoptiveParent', 'http://gedcomx.org/FosterParent', 'http://gedcomx.org/StepParent', 'http://gedcomx.org/BiologicalParent'], true)) { return; }
        $value = $str($f['value'] ?? '');
        $out[] = '1 ' . $tag . ($value !== '' ? ' ' . (str_starts_with($value, '@') ? '@' . $value : str_replace("\n", ' ', $value)) : '');
        if ($label !== '') { $out[] = '2 TYPE ' . $label; }
        $d = is_array($f['date'] ?? null) ? $f['date'] : [];
        $ged = $str($d['formal'] ?? '') !== '' ? gedcomx_formal_to_gedcom($str($d['formal'])) : '';
        $orig = $str($d['original'] ?? '');
        if ($orig !== '') {
            $fromText = function_exists('gedcom_date_from_text') ? gedcom_date_from_text($orig) : '(' . $orig . ')';
            // le texte d'origine passe devant s'il dit la même chose (« vers 1750 ») ou si la date formelle manque
            if ($ged === '' || ($fromText !== '' && $fromText[0] !== '(')) { $ged = $fromText; }
        }
        if ($ged !== '') { $out[] = '2 DATE ' . $ged; }
        $p = is_array($f['place'] ?? null) ? $f['place'] : [];
        $porig = $str($p['original'] ?? '');
        $pd = $places[$refId($p['description'] ?? '')] ?? null;
        if ($porig === '' && $pd) { $porig = $str($arr($pd['names'] ?? [])[0]['value'] ?? ''); }
        if ($porig !== '') {
            $out[] = '2 PLAC ' . str_replace('@', '@@', $porig);
            if ($pd && is_numeric($pd['latitude'] ?? null) && is_numeric($pd['longitude'] ?? null)) {
                $la = (float) $pd['latitude']; $lo = (float) $pd['longitude'];
                $out[] = '3 MAP'; $out[] = '4 LATI ' . ($la < 0 ? 'S' : 'N') . rtrim(rtrim(sprintf('%.6f', abs($la)), '0'), '.'); $out[] = '4 LONG ' . ($lo < 0 ? 'W' : 'E') . rtrim(rtrim(sprintf('%.6f', abs($lo)), '0'), '.');
            }
        }
        foreach ($arr($f['qualifiers'] ?? []) as $q) { if ($str($q['name'] ?? '') === 'http://gedcomx.org/Cause' && $str($q['value'] ?? '') !== '') { $out[] = '2 CAUS ' . $str($q['value']); } }
        $notes(2, $f['notes'] ?? []);
        $cite(2, $f['sources'] ?? []);
        $counts['events']++;
    };
    // personnes
    $pX = [];
    foreach ($persons as $p) { if (is_array($p) && $str($p['id'] ?? '') !== '') { $pX[$str($p['id'])] = $xid('I', $str($p['id'])); } }
    $famsOf = []; $famcOf = [];
    $fams = []; // clé → ['h' => id, 'w' => id, 'facts' => [], 'notes' => [], 'sources' => [], 'kids' => [childId => [rel1, rel2]]]
    $rels = $arr($doc['relationships'] ?? []);
    $coupleKey = static fn(string $a, string $b): string => $a < $b ? $a . '|' . $b : $b . '|' . $a;
    $coupleOf = [];
    foreach ($rels as $r) {
        if ($str($r['type'] ?? '') !== 'http://gedcomx.org/Couple') { continue; }
        $a = $refId($r['person1'] ?? ''); $b = $refId($r['person2'] ?? '');
        if (!isset($pX[$a]) || !isset($pX[$b]) || $a === $b) { continue; }
        $k = $coupleKey($a, $b);
        if (isset($fams[$k])) { foreach (['facts', 'notes', 'sources'] as $kk) { $fams[$k][$kk] = array_merge($fams[$k][$kk], $arr($r[$kk] ?? [])); } continue; }
        $fams[$k] = ['h' => $a, 'w' => $b, 'facts' => $arr($r['facts'] ?? []), 'notes' => $arr($r['notes'] ?? []), 'sources' => $arr($r['sources'] ?? []), 'kids' => []];
        $coupleOf[$a][$b] = $k; $coupleOf[$b][$a] = $k;
    }
    $parentsOf = [];
    foreach ($rels as $r) {
        if ($str($r['type'] ?? '') !== 'http://gedcomx.org/ParentChild') { continue; }
        $par = $refId($r['person1'] ?? ''); $ch = $refId($r['person2'] ?? '');
        if (!isset($pX[$par]) || !isset($pX[$ch]) || $par === $ch) { continue; }
        $how = 'biological';
        foreach ($arr($r['facts'] ?? []) as $f) { $how = match ($str($f['type'] ?? '')) { 'http://gedcomx.org/AdoptiveParent' => 'adopted', 'http://gedcomx.org/FosterParent' => 'foster', 'http://gedcomx.org/StepParent' => 'step', default => $how }; }
        $parentsOf[$ch][$par] = $how;
    }
    foreach ($parentsOf as $ch => $pars) {
        $left = $pars;
        while ($left) {
            $p1 = array_key_first($left); $h1 = $left[$p1]; unset($left[$p1]);
            $p2 = null;
            foreach ($left as $q => $_) { if (isset($coupleOf[$p1][$q])) { $p2 = $q; break; } }
            if ($p2 === null && count($left) === 1) { $p2 = array_key_first($left); }
            if ($p2 !== null) {
                $h2 = $left[$p2]; unset($left[$p2]);
                $k = $coupleKey($p1, $p2);
                $fams[$k] ??= ['h' => $p1, 'w' => $p2, 'facts' => [], 'notes' => [], 'sources' => [], 'kids' => []];
                $fams[$k]['kids'][$ch] = $fams[$k]['h'] === $p1 ? [$h1, $h2] : [$h2, $h1];
            } else {
                $k = 'seul|' . $p1;
                $fams[$k] ??= ['h' => $p1, 'w' => '', 'facts' => [], 'notes' => [], 'sources' => [], 'kids' => []];
                $fams[$k]['kids'][$ch] = [$h1, $h1];
            }
        }
    }
    $fno = 0; $famX = [];
    foreach ($fams as $k => $f) {
        $famX[$k] = 'F' . (++$fno);
        foreach ([$f['h'], $f['w']] as $who) { if ($who !== '') { $famsOf[$who][] = $famX[$k]; } }
        foreach ($f['kids'] as $ch => [$r1, $r2]) { $famcOf[$ch][] = [$famX[$k], $r1 === $r2 ? $r1 : 'biological']; }
    }
    foreach ($persons as $p) {
        if (!is_array($p) || !isset($pX[$str($p['id'] ?? '')])) { continue; }
        $id = $str($p['id']);
        $out[] = '0 @' . $pX[$id] . '@ INDI';
        $names = $arr($p['names'] ?? []);
        usort($names, static fn($a, $b) => (int) !empty($b['preferred']) <=> (int) !empty($a['preferred']));
        foreach ($names as $ni => $nm) {
            $nf = $arr($nm['nameForms'] ?? [])[0] ?? [];
            $parts = ['Given' => [], 'Surname' => [], 'Prefix' => [], 'Suffix' => []];
            foreach ($arr($nf['parts'] ?? []) as $pt) { $t = substr($str($pt['type'] ?? ''), 19); if (isset($parts[$t])) { $parts[$t][] = $str($pt['value'] ?? ''); } }
            $given = implode(' ', $parts['Given']); $sur = implode(' ', $parts['Surname']);
            if ($given === '' && $sur === '') { $given = $str($nf['fullText'] ?? ''); }
            $out[] = '1 NAME ' . trim($given . ' /' . $sur . '/ ' . implode(' ', $parts['Suffix']));
            if ($parts['Prefix']) { $out[] = '2 NPFX ' . implode(' ', $parts['Prefix']); }
            if ($ni > 0) {
                $t = substr($str($nm['type'] ?? ''), 19);
                $out[] = match ($t) { 'MarriedName' => '2 TYPE married', 'Nickname' => '2 _TYPE nickname', 'BirthName' => '2 TYPE birth', default => '2 TYPE aka' };
            }
        }
        if (!$names) { $out[] = '1 NAME /?/'; }
        $g = substr($str($p['gender']['type'] ?? ''), 19);
        $out[] = '1 SEX ' . match ($g) { 'Male' => 'M', 'Female' => 'F', 'Intersex' => 'X', default => 'U' };
        if (!empty($p['private'])) { $out[] = '1 RESN privacy'; }
        foreach ($arr($p['facts'] ?? []) as $f) { $writeFact($f, 'person'); }
        $notes(1, $p['notes'] ?? []);
        $cite(1, $p['sources'] ?? []);
        foreach ((is_array($p['identifiers'] ?? null) ? $p['identifiers'] : []) as $vals) {
            foreach ((array) $vals as $v) {
                $v = $str($v);
                if (preg_match('#familysearch\.org/(?:ark:/61903/4:1:|tree/person/(?:details/)?)([A-Z0-9]{4}-[A-Z0-9]{3,4})#', $v, $m)) { $out[] = '1 _FSFTID ' . $m[1]; }
                elseif (preg_match('#wikidata\.org/(?:entity|wiki)/(Q\d{1,12})\b#', $v, $m)) { $out[] = '1 _WIKIDATA ' . $m[1]; }
            }
        }
        foreach ($famcOf[$id] ?? [] as [$fx, $how]) { $out[] = '1 FAMC @' . $fx . '@'; if ($how !== 'biological') { $out[] = '2 PEDI ' . $how; } }
        foreach (array_unique($famsOf[$id] ?? []) as $fx) { $out[] = '1 FAMS @' . $fx . '@'; }
        $counts['persons']++;
    }
    foreach ($fams as $k => $f) {
        $out[] = '0 @' . $famX[$k] . '@ FAM';
        if ($f['h'] !== '') { $out[] = '1 HUSB @' . $pX[$f['h']] . '@'; }
        if ($f['w'] !== '') { $out[] = '1 WIFE @' . $pX[$f['w']] . '@'; }
        foreach ($f['kids'] as $ch => [$r1, $r2]) {
            $out[] = '1 CHIL @' . $pX[$ch] . '@';
            if ($r1 !== 'biological' || $r2 !== 'biological') { $out[] = '2 _FREL ' . $r1; $out[] = '2 _MREL ' . $r2; }
            $counts['children_links']++;
        }
        foreach ($f['facts'] as $fct) { $writeFact($fct, 'family'); }
        $notes(1, $f['notes']);
        $cite(1, $f['sources']);
        $counts['families']++;
    }
    $out[] = '0 TRLR';
    return [implode("\n", $out) . "\n", $counts];
}
