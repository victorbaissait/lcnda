<?php
declare(strict_types=1);

/**
 * ⤒ Imports d'arbres venus d'autres logiciels (en plus de lib/gedcom.php, lib/heredis.php et de MacFamilyTree dans api.php).
 *
 *  - Gramps : fichier .gramps (XML, gzippé ou non) et paquet .gpkg (tar.gz : data.gramps + médias). Le XML est lu sans
 *    DOCTYPE ni ENTITY (seul le DOCTYPE standard de Gramps, sans contenu, est retiré avant la lecture), puis traduit en
 *    GEDCOM et passé à import_gedcom_into_db() : un seul moteur d'import pour tout (lieux, sources, notes, médias,
 *    étiquettes, témoins…). Les médias ne viennent QUE du paquet (chemins relatifs, jamais « ../ » ni absolus).
 *  - Reçus d'import : ce qu'un import a ajouté (plages d'identifiants par table), pour « ↶ Annuler » (H7).
 *  - Fichiers en attente : le fichier analysé à l'étape 2 de la fenêtre K13 est gardé, l'étape 3 l'importe sans le renvoyer.
 *  - ADN : reconnaître un fichier brut de SNP (refusé : vie privée, loi française).
 */

const GRAMPS_MAX_XML = 400 * 1048576;        // XML décompressé : 400 Mo au plus
const GRAMPS_MAX_TAR_FILES = 20000;
const GRAMPS_MAX_TAR_TOTAL = 8 * 1073741824;  // 8 Go une fois ouvert
const IMPORT_RECEIPT_TABLES = ['persons', 'name_variants', 'families', 'family_children', 'events', 'event_witnesses', 'notes',
    'sources', 'source_links', 'media', 'media_links', 'labels', 'label_links', 'places', 'event_types', 'surname_groups', 'pets'];

/** Retire un dossier temporaire et son contenu (sans suivre les liens). */
function imports_rmdir(string $dir): void
{
    if (!is_dir($dir) || is_link($dir)) { return; }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) { $f->isDir() && !$f->isLink() ? @rmdir($f->getPathname()) : @unlink($f->getPathname()); }
    @rmdir($dir);
}

/** « 1 fiche », « 3 fiches » (0 et 1 au singulier, jamais « (s) ») */
function imports_plural(int $n, string $one, string $many): string { return number_format($n, 0, ',', ' ') . ' ' . ($n > 1 ? $many : $one); }

// ─── Gramps : lecture sûre ────────────────────────────────────────────────────────────────

/** Taille du XML décompressé acceptée : 400 Mo, et au plus le quart de la mémoire permise à PHP (le XML est ensuite lu en entier). */
function gramps_xml_limit(): int
{
    $m = trim((string) ini_get('memory_limit'));
    if ($m === '' || $m === '-1') { return GRAMPS_MAX_XML; }
    $n = (int) $m; $u = strtolower(substr($m, -1));
    $bytes = $u === 'g' ? $n * 1073741824 : ($u === 'm' ? $n * 1048576 : ($u === 'k' ? $n * 1024 : $n));
    return max(1048576, min(GRAMPS_MAX_XML, intdiv($bytes, 4)));
}

/** Contenu d'un .gramps (gzippé ou non), borné en taille (une « bombe gzip » est refusée sans être ouverte en entier). */
function gramps_read_file(string $path): string
{
    $limit = gramps_xml_limit();
    $fh = @fopen($path, 'rb');
    if (!$fh) { throw new RuntimeException('Lecture du fichier Gramps impossible.'); }
    $magic = (string) fread($fh, 2); fclose($fh);
    if ($magic === "\x1f\x8b") {
        $gz = @gzopen($path, 'rb');
        if (!$gz) { throw new RuntimeException('Ce fichier Gramps compressé est abîmé.'); }
        $out = '';
        while (!gzeof($gz)) {
            $chunk = gzread($gz, 1048576);
            if ($chunk === false) { gzclose($gz); throw new RuntimeException('Ce fichier Gramps compressé est abîmé.'); }
            $out .= $chunk;
            if (strlen($out) > $limit) { gzclose($gz); throw new RuntimeException('Ce fichier Gramps est anormalement gros une fois ouvert (plus de ' . intdiv($limit, 1048576) . ' Mo) : il n’est pas ouvert.'); }
        }
        gzclose($gz);
        return $out;
    }
    if (filesize($path) > $limit) { throw new RuntimeException('Ce fichier Gramps est trop gros (plus de ' . intdiv($limit, 1048576) . ' Mo).'); }
    return (string) file_get_contents($path);
}

/** Le XML de Gramps en DOM, sans DTD ni entité (refus d'un DOCTYPE qui a du contenu ou d'un ENTITY). */
function gramps_dom(string $xml): DOMDocument
{
    $xml = preg_replace('/^\xEF\xBB\xBF/', '', $xml) ?? $xml;
    if (preg_match('/<!ENTITY/i', $xml)) { throw new RuntimeException('Ce fichier contient des « ENTITY » XML : il est refusé par prudence.'); }
    // DOCTYPE standard de Gramps : <!DOCTYPE database PUBLIC "…" "…"> (sans [contenu]) → retiré ; tout autre DOCTYPE → refusé
    $xml = preg_replace('/<!DOCTYPE\s+database\s+PUBLIC\s+"[^"\[\]<>]*"\s+"[^"\[\]<>]*"\s*>/i', '', $xml, 1) ?? $xml;
    if (preg_match('/<!DOCTYPE/i', $xml)) { throw new RuntimeException('Ce fichier contient un « DOCTYPE » XML inattendu : il est refusé par prudence.'); }
    if (!preg_match('/<database\b/', substr($xml, 0, 4096))) { throw new RuntimeException('Ce fichier n’est pas un fichier Gramps (balise « database » absente).'); }
    $dom = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $ok = $dom->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE);
    libxml_clear_errors(); libxml_use_internal_errors($prev);
    if (!$ok || !$dom->documentElement) { throw new RuntimeException('Le XML de ce fichier Gramps est abîmé : il ne peut pas être lu.'); }
    return $dom;
}

/**
 * Ouvre un paquet .gpkg (tar.gz) dans $dest : seulement des fichiers ordinaires, chemins relatifs sans « .. »,
 * nombre et taille bornés (bombe tar/gzip refusée). Renvoie le chemin du .gramps trouvé.
 */
function gramps_unpack_gpkg(string $path, string $dest): string
{
    $packed = max(1, (int) filesize($path));
    $gz = @gzopen($path, 'rb');
    if (!$gz) { throw new RuntimeException('Impossible d’ouvrir le paquet Gramps (.gpkg).'); }
    $free = @disk_free_space($dest);
    $total = 0; $count = 0; $longName = null; $paxPath = null; $grampsFile = null;
    $readExact = static function ($gz, int $n): string { $s = ''; while (strlen($s) < $n) { $c = gzread($gz, min(1048576, $n - strlen($s))); if ($c === false || $c === '') { break; } $s .= $c; } return $s; };
    try {
        while (true) {
            $head = $readExact($gz, 512);
            if (strlen($head) < 512 || trim($head, "\0") === '') { break; }
            $name = rtrim(substr($head, 0, 100), "\0");
            $size = octdec(trim(substr($head, 124, 12), "\0 ")) ?: 0;
            $type = $head[156];
            $prefix = rtrim(substr($head, 345, 155), "\0");
            if (substr($head, 257, 5) === 'ustar' && $prefix !== '') { $name = $prefix . '/' . $name; }
            $size = (int) $size;
            $padded = (int) (ceil($size / 512) * 512);
            if ($type === 'L') { $longName = rtrim($readExact($gz, $padded), "\0"); $longName = substr($longName, 0, $size); continue; }
            if ($type === 'x') { $pax = substr($readExact($gz, $padded), 0, $size); if (preg_match('/\d+ path=([^\n]*)\n/', $pax, $m)) { $paxPath = $m[1]; } continue; }
            if ($type === 'g') { $readExact($gz, $padded); continue; }
            if ($longName !== null) { $name = $longName; $longName = null; }
            if ($paxPath !== null) { $name = $paxPath; $paxPath = null; }
            if (!in_array($type, ['0', "\0", '7'], true)) { // dossiers, liens (symboliques ou non), appareils : sautés
                if ($size > 0) { $readExact($gz, $padded); }
                continue;
            }
            if (++$count > GRAMPS_MAX_TAR_FILES) { throw new RuntimeException('Ce paquet Gramps contient trop de fichiers : il n’est pas ouvert.'); }
            $total += $size;
            if ($total > GRAMPS_MAX_TAR_TOTAL || ($free !== false && $total > $free - 1073741824)) { throw new RuntimeException('Ce paquet Gramps est trop gros une fois ouvert pour la place libre de l’ordinateur.'); }
            if ($total > 200 * 1048576 && $total > 100 * $packed) { throw new RuntimeException('Ce paquet Gramps est anormal (beaucoup trop gros une fois ouvert) : il n’est pas ouvert.'); }
            $rel = gramps_safe_relpath($name);
            if ($rel === null) { throw new RuntimeException('Ce paquet Gramps contient un chemin interdit (« ' . mb_substr($name, 0, 80) . ' ») : il n’est pas ouvert.'); }
            $target = $dest . '/' . $rel;
            if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0700, true) && !is_dir(dirname($target))) { throw new RuntimeException('Dossier temporaire impossible à créer.'); }
            $out = fopen($target, 'wb');
            if (!$out) { throw new RuntimeException('Fichier temporaire impossible à écrire.'); }
            $left = $size;
            while ($left > 0) { $c = gzread($gz, min(1048576, $left)); if ($c === false || $c === '') { break; } fwrite($out, $c); $left -= strlen($c); }
            fclose($out);
            if ($left > 0) { throw new RuntimeException('Ce paquet Gramps est incomplet (fichier coupé).'); }
            if ($padded > $size) { $readExact($gz, $padded - $size); }
            if (preg_match('/\.gramps$/i', $rel) && ($grampsFile === null || substr_count($rel, '/') < substr_count((string) $grampsFile, '/'))) { $grampsFile = $rel; }
        }
    } finally { gzclose($gz); }
    if ($grampsFile === null) { throw new RuntimeException('Aucun fichier « data.gramps » dans ce paquet : ce n’est pas un paquet Gramps.'); }
    return $dest . '/' . $grampsFile;
}

/** Chemin relatif sûr (« photos/a.jpg »), ou null : absolu, « .. », lecteur Windows, caractère nul. */
function gramps_safe_relpath(string $name): ?string
{
    $name = str_replace('\\', '/', $name);
    if ($name === '' || str_contains($name, "\0") || $name[0] === '/' || preg_match('#^[A-Za-z]:#', $name)) { return null; }
    $parts = [];
    foreach (explode('/', $name) as $p) {
        if ($p === '' || $p === '.') { continue; }
        if ($p === '..') { return null; }
        $parts[] = $p;
    }
    return $parts ? implode('/', $parts) : null;
}

// ─── Gramps → GEDCOM ──────────────────────────────────────────────────────────────────────

/** Les balises GEDCOM des types d'événements de Gramps (noms anglais du XML). */
function gramps_event_tags(): array
{
    return ['Birth' => 'BIRT', 'Death' => 'DEAT', 'Baptism' => 'BAPM', 'Christening' => 'CHR', 'Burial' => 'BURI', 'Cremation' => 'CREM',
        'Adopted' => 'ADOP', 'Adult Christening' => 'CHRA', 'Bar Mitzvah' => 'BARM', 'Bas Mitzvah' => 'BASM', 'Blessing' => 'BLES',
        'Confirmation' => 'CONF', 'First Communion' => 'FCOM', 'Ordination' => 'ORDN', 'Naturalization' => 'NATU', 'Emigration' => 'EMIG',
        'Immigration' => 'IMMI', 'Census' => 'CENS', 'Probate' => 'PROB', 'Will' => 'WILL', 'Graduation' => 'GRAD', 'Retirement' => 'RETI',
        'Occupation' => 'OCCU', 'Residence' => 'RESI', 'Education' => 'EDUC', 'Religion' => 'RELI', 'Nobility Title' => 'TITL',
        'Property' => 'PROP', 'Caste' => 'CAST', 'Number of Children' => '', 'Marriage' => 'MARR', 'Divorce' => 'DIV', 'Engagement' => 'ENGA',
        'Marriage Banns' => 'MARB', 'Marriage Contract' => 'MARC', 'Marriage License' => 'MARL', 'Marriage Settlement' => 'MARS',
        'Annulment' => 'ANUL', 'Divorce Filing' => 'DIVF'];
}

/** Libellés français des types Gramps sans balise GEDCOM (EVEN + TYPE). */
function gramps_event_labels(): array
{
    return ['Military Service' => 'Service militaire', 'Medical Information' => 'Information médicale', 'Cause Of Death' => 'Cause du décès',
        'Degree' => 'Diplôme', 'Elected' => 'Élection', 'Excommunication' => 'Excommunication', 'Number of Marriages' => 'Nombre de mariages',
        'Position' => 'Fonction', 'Alternate Birth' => 'Autre naissance', 'Alternate Death' => 'Autre décès', 'Alternate Marriage' => 'Autre mariage',
        'Engagement' => 'Fiançailles', 'Marriage Alliance' => 'Alliance', 'Stillbirth' => 'Mort-né', 'Number of Children' => 'Nombre d’enfants',
        'Family' => 'Événement familial', 'Unknown' => 'Événement', 'Nickname' => 'Surnom', 'Description' => 'Description',
        'National Origin' => 'Origine', 'Identification Number' => 'Numéro d’identification', 'Social Security Number' => 'Numéro de sécurité sociale',
        'Age' => 'Âge', 'Agency' => 'Organisme', 'Cause' => 'Cause', 'Father Age' => 'Âge du père', 'Mother Age' => 'Âge de la mère', 'Witness' => 'Témoin', 'Time' => 'Heure'];
}

/** Rôles d'une personne dans un événement (Gramps) → mot français (témoin, parrain…). « » = personne principale. */
function gramps_role_label(string $role): string
{
    $map = ['primary' => '', 'family' => '', 'bride' => '', 'groom' => '', 'witness' => 'Témoin', 'godfather' => 'Parrain', 'godmother' => 'Marraine',
        'godparent' => 'Parrain ou marraine', 'informant' => 'Déclarant', 'clergy' => 'Officiant', 'celebrant' => 'Célébrant', 'aide' => 'Aide', 'unknown' => 'Présent'];
    $k = strtolower(trim($role));
    return array_key_exists($k, $map) ? $map[$k] : trim($role);
}

/** Coordonnée Gramps (« 48.85 », « N48.85 », « 48°51'24"N », « 48:51:24 N ») → nombre, ou null. */
function gramps_coord(string $v, bool $isLat): ?float
{
    $v = trim(str_replace(',', '.', $v));
    if ($v === '') { return null; }
    if (is_numeric($v)) { $n = (float) $v; }
    elseif (preg_match('/^([NSEW])?\s*(-?\d+(?:\.\d+)?)\s*([NSEW])?$/i', $v, $m) && ($m[1] !== '' || ($m[3] ?? '') !== '')) {
        $n = (float) $m[2]; $h = strtoupper(($m[1] ?? '') ?: ($m[3] ?? '')); if ($h === 'S' || $h === 'W') { $n = -abs($n); }
    } elseif (preg_match('/^([NSEW])?\s*(\d+)\s*[°:d\s]\s*(\d+(?:\.\d+)?)?\s*[\'′:m\s]?\s*(\d+(?:\.\d+)?)?\s*["″s]?\s*([NSEW])?$/iu', $v, $m)) {
        $n = (float) $m[2] + (float) ($m[3] ?? 0) / 60 + (float) ($m[4] ?? 0) / 3600;
        $h = strtoupper(($m[1] ?? '') ?: ($m[5] ?? '')); if ($h === 'S' || $h === 'W') { $n = -$n; }
    } else { return null; }
    if (($isLat && abs($n) > 90) || (!$isLat && abs($n) > 180)) { return null; }
    return round($n, 6);
}

/** Date de Gramps (dateval / daterange / datespan / datestr) → date GEDCOM (« ABT 12 MAR 1850 », « BET 1850 AND 1855 »…). */
function gramps_date_gedcom(?DOMElement $holder): string
{
    if (!$holder) { return ''; }
    foreach ($holder->childNodes as $c) {
        if (!$c instanceof DOMElement) { continue; }
        $cal = strtolower($c->getAttribute('cformat'));
        $esc = $cal === 'julian' ? '@#DJULIAN@ ' : ($cal === 'french republican' ? '@#DFRENCH R@ ' : '');
        $one = static function (string $iso) use ($esc, $cal): string {
            if (!preg_match('/^(-?\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/', trim($iso), $m)) { return ''; }
            $y = (int) $m[1]; $mo = (int) ($m[2] ?? 0); $d = (int) ($m[3] ?? 0);
            if ($y === 0) { return ''; }
            $months = $cal === 'french republican' ? GEDCOM_REPUBLICAN_MONTHS : GEDCOM_MONTHS;
            $out = ($d > 0 && $mo > 0 ? $d . ' ' : '') . ($mo > 0 && isset($months[$mo - 1]) ? $months[$mo - 1] . ' ' : '') . abs($y) . ($y < 0 ? ' B.C.' : '');
            return $esc . $out;
        };
        $qual = strtolower($c->getAttribute('quality'));
        $qPrefix = $qual === 'estimated' ? 'EST ' : ($qual === 'calculated' ? 'CAL ' : '');
        if ($c->localName === 'dateval') {
            $d = $one($c->getAttribute('val'));
            if ($d === '') { return ''; }
            $type = strtolower($c->getAttribute('type'));
            return match ($type) { 'about' => 'ABT ', 'before' => 'BEF ', 'after' => 'AFT ', 'estimated' => 'EST ', 'calculated' => 'CAL ', default => $qPrefix } . $d;
        }
        if ($c->localName === 'daterange' || $c->localName === 'datespan') {
            $a = $one($c->getAttribute('start')); $b = $one($c->getAttribute('stop'));
            if ($a === '' && $b === '') { return ''; }
            if ($c->localName === 'daterange') { return $a !== '' && $b !== '' ? "BET $a AND $b" : ($a !== '' ? "AFT $a" : "BEF $b"); }
            return trim(($a !== '' ? "FROM $a " : '') . ($b !== '' ? "TO $b" : ''));
        }
        if ($c->localName === 'datestr') { $t = trim($c->getAttribute('val')); return $t !== '' ? '(' . str_replace(['(', ')'], '', $t) . ')' : ''; }
    }
    return '';
}

/**
 * Traduit le XML de Gramps en texte GEDCOM 5.5.1 (avec les balises que l'import de LCNDA relit : _LABEL, _COLR, _FREL, _MREL,
 * _PHOTO, ASSO + RELA sous un événement pour les témoins…). Renvoie [texte, nombres].
 */
function gramps_to_gedcom(DOMDocument $dom): array
{
    $root = $dom->documentElement;
    $kids = static function (?DOMNode $n, string $name): array { $o = []; if ($n) { foreach ($n->childNodes as $c) { if ($c instanceof DOMElement && $c->localName === $name) { $o[] = $c; } } } return $o; };
    $kid = static function (?DOMNode $n, string $name) use ($kids): ?DOMElement { return $kids($n, $name)[0] ?? null; };
    $txt = static function (?DOMNode $n): string { return $n ? trim($n->textContent) : ''; };
    $section = static function (string $name) use ($root, $kid): ?DOMElement { return $kid($root, $name); };
    $byHandle = [];
    foreach (['events' => 'event', 'people' => 'person', 'families' => 'family', 'citations' => 'citation', 'sources' => 'source',
        'places' => 'placeobj', 'objects' => 'object', 'repositories' => 'repository', 'notes' => 'note', 'tags' => 'tag'] as $sec => $el) {
        foreach ($kids($section($sec), $el) as $e) { $h = $e->getAttribute('handle'); if ($h !== '') { $byHandle[$h] = $e; } }
    }
    $xref = []; $n = ['I' => 0, 'F' => 0, 'S' => 0, 'R' => 0, 'N' => 0, 'O' => 0];
    $idFor = static function (string $handle, string $p) use (&$xref, &$n): string { if (!isset($xref[$handle])) { $xref[$handle] = $p . (++$n[$p]); } return $xref[$handle]; };
    $get = static function (string $h, string $kind) use ($byHandle): ?DOMElement { $e = $byHandle[$h] ?? null; return $e && $e->localName === $kind ? $e : null; };
    $lines = [];
    $esc = static fn(string $v): string => str_replace('@', '@@', $v);
    $add = static function (int $lvl, string $tag, string $value = '') use (&$lines, $esc): void {
        $value = str_replace(["\r\n", "\r"], "\n", $value);
        $parts = explode("\n", $value);
        $first = (string) array_shift($parts);
        $lines[] = rtrim($lvl . ' ' . $tag . ' ' . ($tag === 'DATE' ? $first : $esc($first))); // une date garde son « @#DJULIAN@ »
        foreach ($parts as $p) { $lines[] = rtrim(($lvl + 1) . ' CONT ' . $esc($p)); }
    };
    $ptr = static function (int $lvl, string $tag, string $id) use (&$lines): void { $lines[] = "$lvl $tag @$id@"; };
    $counts = ['persons' => 0, 'families' => 0, 'events' => 0, 'places' => 0, 'sources' => 0, 'citations' => 0, 'notes' => 0, 'media' => 0, 'tags' => 0, 'repositories' => 0, 'witnesses' => 0, 'media_refused' => 0];

    // Étiquettes (tags) : nom + couleur (#rrrrggggbbbb → #rrggbb)
    $tagRefs = static function (int $lvl, DOMElement $e) use ($kids, $get, $add): void {
        foreach ($kids($e, 'tagref') as $r) {
            $t = $get($r->getAttribute('hlink'), 'tag'); if (!$t || trim($t->getAttribute('name')) === '') { continue; }
            $add($lvl, '_LABEL', trim($t->getAttribute('name')));
            $c = strtolower($t->getAttribute('color'));
            if (preg_match('/^#([0-9a-f]{12})$/', $c, $m)) { $c = '#' . substr($m[1], 0, 2) . substr($m[1], 4, 2) . substr($m[1], 8, 2); }
            if (preg_match('/^#[0-9a-f]{6}$/', $c) && $c !== '#000000') { $add($lvl + 1, '_COLR', $c); }
        }
    };
    $noteRefs = static function (int $lvl, DOMElement $e) use ($kids, $get, $idFor, $ptr): void {
        foreach ($kids($e, 'noteref') as $r) { if ($get($r->getAttribute('hlink'), 'note')) { $ptr($lvl, 'NOTE', $idFor($r->getAttribute('hlink'), 'N')); } }
    };
    $objRefs = static function (int $lvl, DOMElement $e) use ($kids, $get, $idFor, $ptr): void {
        foreach ($kids($e, 'objref') as $r) { if ($get($r->getAttribute('hlink'), 'object')) { $ptr($lvl, 'OBJE', $idFor($r->getAttribute('hlink'), 'O')); } }
    };
    $citeRefs = static function (int $lvl, DOMElement $e) use ($kids, $kid, $get, $idFor, $ptr, $add, $txt, &$counts): void {
        foreach ($kids($e, 'citationref') as $r) {
            $c = $get($r->getAttribute('hlink'), 'citation'); if (!$c) { continue; }
            $s = ($sr = $kid($c, 'sourceref')) ? $get($sr->getAttribute('hlink'), 'source') : null;
            if (!$s) { continue; }
            $ptr($lvl, 'SOUR', $idFor($s->getAttribute('handle'), 'S'));
            if (($p = $txt($kid($c, 'page'))) !== '') { $add($lvl + 1, 'PAGE', $p); }
            $conf = (int) $txt($kid($c, 'confidence'));
            if ($kid($c, 'confidence')) { $add($lvl + 1, 'QUAY', (string) min(3, max(0, $conf === 4 ? 3 : $conf))); }
            $extra = [];
            if (($d = gramps_date_gedcom($c)) !== '') { $extra[] = 'Date : ' . gedcom_date_to_text($d); }
            foreach (array_merge($kids($c, 'srcattribute'), $kids($c, 'data_item')) as $a) { $k = $a->getAttribute('type') ?: $a->getAttribute('key'); $v = $a->getAttribute('value'); if ($v !== '') { $extra[] = ($k !== '' ? $k . ' : ' : '') . $v; } }
            if ($extra) { $add($lvl + 1, 'NOTE', implode("\n", $extra)); }
            foreach ($kids($c, 'noteref') as $nr) { if ($get($nr->getAttribute('hlink'), 'note')) { $ptr($lvl + 1, 'NOTE', $idFor($nr->getAttribute('hlink'), 'N')); } }
            $counts['citations']++;
        }
    };

    // Lieux : la chaîne (hameau → commune → département → région → pays) rangée dans les 6 morceaux de l'import
    $placeCache = [];
    $placeOf = static function (string $h) use (&$placeOf, &$placeCache, $get, $kids, $kid, $txt): ?array {
        if (isset($placeCache[$h])) { return $placeCache[$h]; }
        $chain = []; $seen = []; $cur = $get($h, 'placeobj');
        while ($cur && !isset($seen[$cur->getAttribute('handle')]) && count($chain) < 12) {
            $seen[$cur->getAttribute('handle')] = true;
            $names = $kids($cur, 'pname');
            $name = $names ? trim($names[0]->getAttribute('value')) : '';
            $alts = array_values(array_filter(array_map(static fn($p) => trim($p->getAttribute('value')), array_slice($names, 1))));
            if ($name === '' && ($loc = $kid($cur, 'location'))) { // ancien format (Gramps 3) : <location city county state country/>
                $chain = array_merge($chain, array_values(array_filter([['type' => 'Street', 'name' => $loc->getAttribute('street')], ['type' => 'City', 'name' => $loc->getAttribute('city') ?: $loc->getAttribute('parish')],
                    ['type' => 'County', 'name' => $loc->getAttribute('county')], ['type' => 'State', 'name' => $loc->getAttribute('state')], ['type' => 'Country', 'name' => $loc->getAttribute('country')]], static fn($x) => trim($x['name']) !== '')));
                if (!$chain) { $chain[] = ['type' => 'City', 'name' => $txt($kid($cur, 'ptitle'))]; }
                $chain[0] += ['code' => $loc->getAttribute('postal')];
            } else {
                $co = $kid($cur, 'coord');
                $chain[] = ['type' => $cur->getAttribute('type') ?: 'Unknown', 'name' => $name ?: $txt($kid($cur, 'ptitle')), 'code' => $txt($kid($cur, 'code')) ?: $cur->getAttribute('code'),
                    'lat' => $co ? gramps_coord($co->getAttribute('lat'), true) : null, 'lon' => $co ? gramps_coord($co->getAttribute('long'), false) : null, 'alts' => $alts,
                    'notes' => $kids($cur, 'noteref')];
            }
            if (count($chain) === 1 && ($co = $kid($cur, 'coord')) && !isset($chain[0]['lat'])) { $chain[0]['lat'] = gramps_coord($co->getAttribute('lat'), true); $chain[0]['lon'] = gramps_coord($co->getAttribute('long'), false); }
            $pr = $kid($cur, 'placeref');
            $cur = $pr ? $get($pr->getAttribute('hlink'), 'placeobj') : null;
        }
        if (!$chain || trim((string) $chain[0]['name']) === '') { return $placeCache[$h] = null; }
        $slot = ['town' => [], 'postal' => '', 'county' => [], 'state' => [], 'country' => [], 'sub' => []];
        $townTypes = ['city', 'town', 'village', 'municipality', 'parish', 'borough', 'unknown'];
        $belowTown = ['street', 'number', 'building', 'farm', 'hamlet', 'locality', 'neighborhood'];
        foreach ($chain as $i => $p) {
            $t = strtolower((string) $p['type']); $nm = trim((string) $p['name']); if ($nm === '') { continue; }
            if (in_array($t, ['county', 'department', 'district'], true)) { $slot['county'][] = $nm; }
            elseif (in_array($t, ['state', 'province', 'region'], true)) { $slot['state'][] = $nm; }
            elseif ($t === 'country') { $slot['country'][] = $nm; }
            elseif ($i === 0 && in_array($t, $belowTown, true) && isset($chain[1]) && in_array(strtolower((string) $chain[1]['type']), $townTypes, true)) { $slot['sub'][] = $nm; }
            elseif (!$slot['town'] && !$slot['county'] && !$slot['state'] && !$slot['country']) { $slot['town'][] = $nm; }
            else { $slot['sub'][] = $nm; }
            if ($slot['postal'] === '' && trim((string) ($p['code'] ?? '')) !== '' && !in_array($t, ['country', 'state', 'province', 'region', 'county', 'department'], true)) { $slot['postal'] = trim((string) $p['code']); }
        }
        if (!$slot['town']) { $slot['town'][] = array_shift($slot['sub']) ?? trim((string) $chain[0]['name']); }
        $clean = static fn(array $a): string => implode(' ', array_map(static fn($x) => str_replace(',', ' ', $x), $a));
        $value = implode(', ', [$clean($slot['town']), str_replace(',', ' ', $slot['postal']), $clean($slot['county']), $clean($slot['state']), $clean($slot['country']), $clean($slot['sub'])]);
        $lat = null; $lon = null;
        foreach ($chain as $p) { if (isset($p['lat'], $p['lon']) && $p['lat'] !== null && $p['lon'] !== null) { $lat = $p['lat']; $lon = $p['lon']; break; } }
        return $placeCache[$h] = ['value' => $value, 'lat' => $lat, 'lon' => $lon, 'alts' => $chain[0]['alts'] ?? [], 'notes' => $chain[0]['notes'] ?? []];
    };
    $writePlace = static function (int $lvl, DOMElement $ev) use ($kid, $placeOf, $add, $get, $txt): void {
        $pl = $kid($ev, 'place'); if (!$pl) { return; }
        $p = $placeOf($pl->getAttribute('hlink')); if (!$p) { return; }
        $add($lvl, 'PLAC', $p['value']);
        if ($p['lat'] !== null && $p['lon'] !== null) {
            $add($lvl + 1, 'MAP');
            $add($lvl + 2, 'LATI', ($p['lat'] < 0 ? 'S' : 'N') . abs($p['lat']));
            $add($lvl + 2, 'LONG', ($p['lon'] < 0 ? 'W' : 'E') . abs($p['lon']));
        }
        if ($p['alts']) { $add($lvl + 1, '_ALTN', implode(', ', $p['alts'])); }
        foreach ($p['notes'] as $nr) { if (($note = $get($nr->getAttribute('hlink'), 'note')) && ($t = $txt($kid($note, 'text'))) !== '') { $add($lvl + 1, 'NOTE', $t); } }
    };

    // Un événement écrit sous une personne ou une famille ; les autres participants (témoins, parrain…) en ASSO + RELA
    $tags = gramps_event_tags(); $labels = gramps_event_labels();
    $participants = []; // handle d'événement → [[handle personne, rôle]]
    foreach ($kids($section('people'), 'person') as $p) {
        foreach ($kids($p, 'eventref') as $r) { $participants[$r->getAttribute('hlink')][] = [$p->getAttribute('handle'), $r->getAttribute('role') ?: 'Primary']; }
    }
    $familyEvents = [];
    foreach ($kids($section('families'), 'family') as $f) { foreach ($kids($f, 'eventref') as $r) { $familyEvents[$r->getAttribute('hlink')] = true; } }
    $attrTags = ['Caste' => 'CAST', 'Description' => 'DSCR', 'Identification Number' => 'IDNO', 'National Origin' => 'NATI', 'Social Security Number' => 'SSN',
        'Occupation' => 'OCCU', 'Nobility Title' => 'TITL', 'Religion' => 'RELI', 'Education' => 'EDUC', 'Property' => 'PROP'];
    $valueTags = ['OCCU', 'RELI', 'TITL', 'EDUC', 'NATI', 'CAST', 'DSCR', 'PROP', 'IDNO', 'SSN'];
    $writeEvent = static function (int $lvl, DOMElement $ev, ?string $ownerHandle) use ($add, $kid, $kids, $txt, $tags, $labels, $valueTags, $writePlace, $noteRefs, $citeRefs, $objRefs, $tagRefs, &$participants, $idFor, $ptr, &$counts): void {
        $type = $txt($kid($ev, 'type')) ?: 'Unknown';
        $tag = $tags[$type] ?? '';
        $desc = $txt($kid($ev, 'description'));
        // descriptions faites toutes seules par Gramps (« Birth of Dupont, Jean », « Naissance de Dupont, Jean ») : laissées de côté
        $auto = (bool) preg_match('/^[\p{L} ]{3,40} (?:of|de|du|d[\'’]) ?[^,]+, [^,]+$/u', $desc);
        if ($tag !== '' && in_array($tag, $valueTags, true)) { $add($lvl, $tag, $desc); }
        elseif ($tag !== '') { $add($lvl, $tag); if ($desc !== '' && !$auto) { $add($lvl + 1, '_TITL', $desc); } }
        else { $add($lvl, 'EVEN', $auto ? '' : $desc); $add($lvl + 1, 'TYPE', $labels[$type] ?? $type); }
        if (($d = gramps_date_gedcom($ev)) !== '') { $add($lvl + 1, 'DATE', $d); }
        $writePlace($lvl + 1, $ev);
        $extra = [];
        foreach ($kids($ev, 'attribute') as $a) {
            $k = $a->getAttribute('type'); $v = $a->getAttribute('value'); if ($v === '') { continue; }
            if ($k === 'Cause') { $add($lvl + 1, 'CAUS', $v); } elseif ($k === 'Agency') { $add($lvl + 1, 'AGNC', $v); } else { $extra[] = ($labels[$k] ?? $k) . ' : ' . $v; }
        }
        if ($extra) { $add($lvl + 1, 'NOTE', implode("\n", $extra)); }
        foreach ($participants[$ev->getAttribute('handle')] ?? [] as [$ph, $role]) {
            if ($ph === $ownerHandle) { continue; }
            $label = gramps_role_label($role);
            if ($label === '') { continue; } // autre personne principale : l'événement est écrit aussi chez elle
            $ptr($lvl + 1, 'ASSO', $idFor($ph, 'I')); $add($lvl + 2, 'RELA', $label); $counts['witnesses']++;
        }
        $noteRefs($lvl + 1, $ev); $citeRefs($lvl + 1, $ev); $objRefs($lvl + 1, $ev); $tagRefs($lvl + 1, $ev);
        $counts['events']++;
    };

    // ── En-tête
    $lines[] = '0 HEAD';
    $lines[] = '1 SOUR Gramps';
    if (($cr = $kid($kid($root, 'header'), 'created')) && $cr->getAttribute('version') !== '') { $lines[] = '2 VERS ' . preg_replace('/[^\w.\-]/', '', $cr->getAttribute('version')); }
    $lines[] = '2 NAME Gramps';
    $lines[] = '1 GEDC'; $lines[] = '2 VERS 5.5.1'; $lines[] = '2 FORM LINEAGE-LINKED';
    $lines[] = '1 CHAR UTF-8';
    $lines[] = '1 PLAC'; $lines[] = '2 FORM ' . GEDCOM_PLACE_FORM;

    // ── Personnes
    $nameTypes = ['Married Name' => 'married', 'Also Known As' => 'aka', 'Birth Name' => 'birth'];
    foreach ($kids($section('people'), 'person') as $p) {
        $h = $p->getAttribute('handle');
        $lines[] = '0 @' . $idFor($h, 'I') . '@ INDI';
        $names = $kids($p, 'name');
        // surnoms (du 1er nom, des autres noms, attribut « Nickname ») et prénom usuel : des NICK sous le 1er nom
        $nicks = [];
        foreach ($names as $i => $nm) { if (($nk = $txt($kid($nm, 'nick'))) !== '') { $nicks[] = $nk; } if ($i === 0 && ($cl = $txt($kid($nm, 'call'))) !== '' && !in_array(mb_strtolower($cl), preg_split('/[\s\-]+/u', mb_strtolower($txt($kid($nm, 'first')))) ?: [], true)) { $nicks[] = $cl; } }
        foreach ($kids($p, 'attribute') as $a) { if ($a->getAttribute('type') === 'Nickname' && trim($a->getAttribute('value')) !== '') { $nicks[] = trim($a->getAttribute('value')); } }
        $nicks = array_values(array_unique($nicks));
        foreach ($names as $i => $nm) {
            $first = $txt($kid($nm, 'first'));
            $surs = [];
            foreach ($kids($nm, 'surname') as $s) { $v = trim(trim($s->getAttribute('prefix')) . ' ' . $txt($s)); if ($v !== '') { $surs[] = $v . ($s->getAttribute('connector') !== '' ? ' ' . $s->getAttribute('connector') : ''); } }
            if (!$surs && ($ls = $kid($nm, 'last'))) { $surs[] = $txt($ls); } // Gramps 3
            $last = trim(implode(' ', $surs));
            $suffix = $txt($kid($nm, 'suffix')); $title = $txt($kid($nm, 'title'));
            $add(1, 'NAME', trim(str_replace('/', ' ', $first) . ' /' . str_replace('/', ' ', $last) . '/ ' . str_replace('/', ' ', $suffix)));
            if ($first !== '') { $add(2, 'GIVN', $first); }
            if ($last !== '') { $add(2, 'SURN', $last); }
            if ($suffix !== '') { $add(2, 'NSFX', $suffix); }
            if ($title !== '') { $add(2, 'NPFX', $title); }
            if ($i === 0) { foreach ($nicks as $nk) { $add(2, 'NICK', $nk); } }
            else {
                $t = $nameTypes[$nm->getAttribute('type')] ?? '';
                $add(2, 'TYPE', $t === 'married' ? 'married' : ($t === 'aka' ? 'aka' : 'variant'));
                if (($d = gramps_date_gedcom($nm)) !== '') { $add(2, 'DATE', $d); }
            }
            $noteRefs(2, $nm);
        }
        $g = strtoupper($txt($kid($p, 'gender')));
        $add(1, 'SEX', in_array($g, ['M', 'F', 'X'], true) ? $g : 'U');
        if ($p->getAttribute('priv') === '1') { $add(1, 'RESN', 'privacy'); }
        // événements dont la personne est le personnage principal
        foreach ($kids($p, 'eventref') as $r) {
            $role = $r->getAttribute('role') ?: 'Primary';
            if (gramps_role_label($role) !== '') { continue; }
            $ev = $get($r->getAttribute('hlink'), 'event'); if (!$ev) { continue; }
            $writeEvent(1, $ev, $h);
        }
        // événements sans personne principale ni famille (seulement des témoins) : écrits chez la première personne citée
        foreach ($kids($p, 'eventref') as $r) {
            $eh = $r->getAttribute('hlink'); $ev = $get($eh, 'event'); if (!$ev || isset($familyEvents[$eh])) { continue; }
            $hasMain = false; foreach ($participants[$eh] ?? [] as [, $ro]) { if (gramps_role_label($ro) === '') { $hasMain = true; } }
            if (!$hasMain && ($participants[$eh][0][0] ?? '') === $h) { $writeEvent(1, $ev, $h); }
        }
        foreach ($kids($p, 'attribute') as $a) {
            $k = $a->getAttribute('type'); $v = $a->getAttribute('value'); if ($v === '') { continue; }
            if ($k === 'Nickname') { continue; } // déjà en NICK sous le premier nom
            if (isset($attrTags[$k])) { $add(1, $attrTags[$k], $v); } else { $add(1, 'EVEN', $v); $add(2, 'TYPE', $labels[$k] ?? $k); }
            $citeRefs(2, $a); $noteRefs(2, $a);
        }
        foreach ($kids($p, 'address') as $ad) {
            $parts = array_values(array_filter(array_map(static fn($t) => $txt($kid($ad, $t)), ['street', 'locality', 'city', 'county', 'state', 'country', 'postal', 'phone'])));
            if (!$parts) { continue; }
            $add(1, 'RESI'); if (($d = gramps_date_gedcom($ad)) !== '') { $add(2, 'DATE', $d); } $add(2, 'ADDR', implode(', ', $parts)); $citeRefs(2, $ad); $noteRefs(2, $ad);
        }
        $urls = [];
        foreach ($kids($p, 'url') as $u) { $href = trim($u->getAttribute('href')); if ($href !== '') { $urls[] = trim(($u->getAttribute('description') ?: 'Lien') . ' : ' . $href); } }
        if ($urls) { $add(1, 'NOTE', "Liens :\n" . implode("\n", $urls)); }
        foreach ($kids($p, 'personref') as $pr) {
            if (!$get($pr->getAttribute('hlink'), 'person')) { continue; }
            $ptr(1, 'ASSO', $idFor($pr->getAttribute('hlink'), 'I')); $add(2, 'RELA', gramps_role_label($pr->getAttribute('rel')) ?: ($pr->getAttribute('rel') ?: 'Relation'));
        }
        // le premier média image de la personne = son portrait (comme dans Gramps)
        foreach ($kids($p, 'objref') as $k => $r) {
            $o = $get($r->getAttribute('hlink'), 'object');
            if ($o && ($f = $kid($o, 'file')) && str_starts_with(strtolower($f->getAttribute('mime')), 'image/')) { $ptr(1, '_PHOTO', $idFor($r->getAttribute('hlink'), 'O')); break; }
        }
        $objRefs(1, $p); $noteRefs(1, $p); $citeRefs(1, $p); $tagRefs(1, $p);
        $counts['persons']++;
    }

    // ── Familles
    $rel = static fn(string $v): string => $v === '' || strtolower($v) === 'birth' ? 'Natural' : $v;
    foreach ($kids($section('families'), 'family') as $f) {
        $lines[] = '0 @' . $idFor($f->getAttribute('handle'), 'F') . '@ FAM';
        if (($fa = $kid($f, 'father')) && $get($fa->getAttribute('hlink'), 'person')) { $ptr(1, 'HUSB', $idFor($fa->getAttribute('hlink'), 'I')); }
        if (($mo = $kid($f, 'mother')) && $get($mo->getAttribute('hlink'), 'person')) { $ptr(1, 'WIFE', $idFor($mo->getAttribute('hlink'), 'I')); }
        foreach ($kids($f, 'childref') as $c) {
            if (!$get($c->getAttribute('hlink'), 'person')) { continue; }
            $ptr(1, 'CHIL', $idFor($c->getAttribute('hlink'), 'I'));
            $add(2, '_FREL', $rel($c->getAttribute('frel'))); $add(2, '_MREL', $rel($c->getAttribute('mrel')));
        }
        foreach ($kids($f, 'eventref') as $r) { if ($ev = $get($r->getAttribute('hlink'), 'event')) { $writeEvent(1, $ev, null); } }
        $rt = ($r = $kid($f, 'rel')) ? $r->getAttribute('type') : '';
        if (in_array($rt, ['Unmarried', 'Civil Union'], true)) { $add(1, 'NOTE', $rt === 'Civil Union' ? 'Union civile (PACS ou équivalent).' : 'Couple non marié.'); }
        foreach ($kids($f, 'attribute') as $a) { $v = $a->getAttribute('value'); if ($v === '') { continue; } $add(1, 'EVEN', $v); $add(2, 'TYPE', $labels[$a->getAttribute('type')] ?? $a->getAttribute('type')); }
        $objRefs(1, $f); $noteRefs(1, $f); $citeRefs(1, $f); $tagRefs(1, $f);
        $counts['families']++;
    }

    // ── Sources et dépôts
    $repoText = [];
    foreach ($kids($section('repositories'), 'repository') as $r) {
        $lines[] = '0 @' . $idFor($r->getAttribute('handle'), 'R') . '@ REPO';
        $add(1, 'NAME', $txt($kid($r, 'rname')) ?: 'Dépôt sans nom');
        $parts = [];
        foreach ($kids($r, 'address') as $ad) { $parts[] = implode(', ', array_values(array_filter(array_map(static fn($t) => $txt($kid($ad, $t)), ['street', 'locality', 'city', 'postal', 'county', 'state', 'country', 'phone'])))); }
        foreach ($kids($r, 'url') as $u) { if (trim($u->getAttribute('href')) !== '') { $parts[] = trim($u->getAttribute('href')); } }
        $repoText[$r->getAttribute('handle')] = implode(' — ', array_filter($parts));
        $counts['repositories']++;
    }
    foreach ($kids($section('sources'), 'source') as $s) {
        $lines[] = '0 @' . $idFor($s->getAttribute('handle'), 'S') . '@ SOUR';
        $add(1, 'TITL', $txt($kid($s, 'stitle')) ?: 'Source sans titre');
        if (($v = $txt($kid($s, 'sauthor'))) !== '') { $add(1, 'AUTH', $v); }
        if (($v = $txt($kid($s, 'spubinfo'))) !== '') { $add(1, 'PUBL', $v); }
        if (($v = $txt($kid($s, 'sabbrev'))) !== '') { $add(1, 'ABBR', $v); }
        $more = [];
        foreach ($kids($s, 'reporef') as $rr) {
            $rh = $rr->getAttribute('hlink'); if (!$get($rh, 'repository')) { continue; }
            $ptr(1, 'REPO', $idFor($rh, 'R'));
            if ($rr->getAttribute('callno') !== '') { $add(2, 'CALN', $rr->getAttribute('callno')); }
            $more[] = 'Conservé à : ' . trim(($byHandle[$rh] ? $txt($kid($byHandle[$rh], 'rname')) : '') . ($repoText[$rh] ? ' (' . $repoText[$rh] . ')' : '')) . ($rr->getAttribute('callno') !== '' ? ', cote ' . $rr->getAttribute('callno') : '') . ($rr->getAttribute('medium') !== '' ? ' — ' . $rr->getAttribute('medium') : '');
        }
        foreach (array_merge($kids($s, 'srcattribute'), $kids($s, 'data_item')) as $a) { $k = $a->getAttribute('type') ?: $a->getAttribute('key'); $v = $a->getAttribute('value'); if ($v !== '') { $more[] = ($k !== '' ? $k . ' : ' : '') . $v; } }
        if ($more) { $add(1, 'TEXT', implode("\n", $more)); }
        $noteRefs(1, $s); $objRefs(1, $s);
        $counts['sources']++;
    }

    // ── Notes
    foreach ($kids($section('notes'), 'note') as $nt) {
        $t = $txt($kid($nt, 'text'));
        $nl = explode("\n", str_replace(["\r\n", "\r"], "\n", $t));
        $lines[] = rtrim('0 @' . $idFor($nt->getAttribute('handle'), 'N') . '@ NOTE ' . $esc(array_shift($nl)));
        foreach ($nl as $l) { $lines[] = rtrim('1 CONT ' . $esc($l)); }
        $counts['notes']++;
    }

    // ── Médias (fichier relatif au paquet : jamais un chemin absolu ni « .. »)
    foreach ($kids($section('objects'), 'object') as $o) {
        $f = $kid($o, 'file');
        $lines[] = '0 @' . $idFor($o->getAttribute('handle'), 'O') . '@ OBJE';
        $src = $f ? trim($f->getAttribute('src')) : '';
        // chemin absolu de l'ordinateur d'origine : dans un paquet .gpkg, Gramps le range sans le « / » du début ; « .. » : refusé
        $rel = preg_match('#^https?://#i', $src) ? $src : gramps_safe_relpath(preg_replace('#^(?:[A-Za-z]:)?[/\\\\]+#', '', $src) ?? $src);
        if ($rel !== null && $rel !== '') { $add(1, 'FILE', $rel); } elseif ($src !== '') { $counts['media_refused']++; }
        if ($f && $f->getAttribute('mime') !== '') { $add(2, 'FORM', preg_replace('#^.*/#', '', $f->getAttribute('mime'))); }
        if ($f && trim($f->getAttribute('description')) !== '') { $add(1, 'TITL', trim($f->getAttribute('description'))); }
        if (($d = gramps_date_gedcom($o)) !== '') { $add(1, 'DATE', $d); }
        $noteRefs(1, $o);
        $counts['media']++;
    }
    $counts['places'] = count($kids($section('places'), 'placeobj'));
    $counts['tags'] = count($kids($section('tags'), 'tag'));
    $lines[] = '0 TRLR';
    return [implode("\n", $lines) . "\n", $counts];
}

/**
 * Importe un .gramps ou un .gpkg. Les médias du paquet sont copiés dans les médias de LCNDA par import_gedcom_into_db
 * (chemin relatif d'abord, puis par nom, toujours dans le dossier du paquet).
 */
function gramps_import_into_db(PDO $pdo, string $path, bool $package): array
{
    $tmp = sys_get_temp_dir() . '/gramps_' . bin2hex(random_bytes(8));
    if (!mkdir($tmp, 0700, true) && !is_dir($tmp)) { throw new RuntimeException('Dossier temporaire impossible à créer.'); }
    try {
        $grampsPath = $package ? gramps_unpack_gpkg($path, $tmp) : $path;
        [$ged, $counts] = gramps_to_gedcom(gramps_dom(gramps_read_file($grampsPath)));
        $gedPath = $tmp . '/.lcnda-gramps.ged';
        file_put_contents($gedPath, $ged);
        $stats = import_gedcom_into_db($pdo, $gedPath, $package ? dirname($grampsPath) : null, false);
        if ($counts['media_refused'] > 0) { $stats['warnings'][] = imports_plural($counts['media_refused'], 'média au chemin interdit (« .. ») laissé de côté', 'médias au chemin interdit (« .. ») laissés de côté') . ' : seuls les fichiers rangés dans le paquet sont repris.'; }
        return ['format' => 'gramps', 'producer' => 'gramps', 'producer_label' => 'Gramps', 'gramps' => $counts] + $stats;
    } finally {
        imports_rmdir($tmp);
    }
}

/** Un .gramps / .gpkg en texte GEDCOM (pour « Fusionner un arbre » et l'aperçu), sans les médias. */
function gramps_file_to_gedcom(string $path, bool $package): array
{
    if (!$package) { return gramps_to_gedcom(gramps_dom(gramps_read_file($path))); }
    $tmp = sys_get_temp_dir() . '/gramps_' . bin2hex(random_bytes(8));
    mkdir($tmp, 0700, true);
    try { $g = gramps_unpack_gpkg($path, $tmp); $media = 0; foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS)) as $f) { if ($f->isFile() && !preg_match('/\.gramps$/i', $f->getFilename())) { $media++; } }
        [$ged, $counts] = gramps_to_gedcom(gramps_dom(gramps_read_file($g))); $counts['package_files'] = $media; return [$ged, $counts]; }
    finally { imports_rmdir($tmp); }
}

// ─── Aperçu d'un arbre avant import (étape 2 de la fenêtre K13) ──────────────────────────────

/** Logiciel d'où vient un GEDCOM, d'après HEAD.SOUR (et son NAME / CORP). */
function gedcom_producer(string $text): array
{
    $head = '';
    $start = str_replace(["\r\n", "\r"], "\n", substr($text, 0, 20000)); // Reunion (Mac) : lignes finies par « \r » seul
    if (preg_match('/^\s*0\s+HEAD\b(.*?)(?=^\s*0\s)/ms', $start, $m)) { $head = $m[1]; }
    $sour = preg_match('/^\s*1\s+SOUR\s+(.*)$/mi', $head, $m) ? trim($m[1]) : '';
    $all = strtolower($head);
    $known = [
        'ancestry' => ['Ancestry', '/ancestry/'], 'myheritage' => ['MyHeritage', '/myheritage/'], 'gramps' => ['Gramps', '/\bgramps\b/'],
        'familysearch' => ['FamilySearch', '/familysearch/'], 'geneanet' => ['Geneanet', '/geneanet/'], 'heredis' => ['Hérédis', '/heredis/'],
        'rootsmagic' => ['RootsMagic', '/rootsmagic/'], 'legacy' => ['Legacy', '/\blegacy\b/'], 'ftm' => ['Family Tree Maker', '/family tree maker|\bftm\b/'],
        'macfamilytree' => ['MacFamilyTree', '/macfamilytree|mac family tree/'], 'geneatique' => ['Généatique', '/geneatique|généatique/'], 'lcnda' => ['LCNDA', '/lcnda/'],
        // autres logiciels (tests/fixtures/autres-logiciels/*.ged) ; GeneWeb et GEDCOM-X : traduits par lib/import_geneweb.php, lib/import_gedcomx.php
        'family_historian' => ['Family Historian', '/family[_ ]historian|calico pie/'], 'ancestral_quest' => ['Ancestral Quest', '/ancestral quest|ancestquest|incline software/'],
        'reunion' => ['Reunion', '/\breunion\b|leister/'], 'genopro' => ['GenoPro', '/genopro/'], 'wikitree' => ['WikiTree', '/wikitree/'], 'geni' => ['Geni', '/\bgeni(\.com)?\b/'],
        'ancestris' => ['Ancestris', '/ancestris/'], 'webtrees' => ['webtrees', '/webtrees/'], 'brothers_keeper' => ['Brother’s Keeper', '/brother.?s keeper|broskeep/'],
        'paf' => ['PAF (Personal Ancestral File)', '/\bpaf\b|personal ancestral file/'], 'geneweb' => ['GeneWeb', '/geneweb/'], 'gedcomx' => ['GEDCOM-X', '/gedcom-x/'],
    ];
    // d'abord le logiciel nommé par « 1 SOUR » (et son NAME / CORP), puis tout l'en-tête (« 1 DEST ANCESTRY » ne doit pas tromper)
    $sourBlock = preg_match('/^\s*1\s+SOUR\b.*?(?=^\s*1\s|\z)/msi', $head, $sm) ? strtolower($sm[0]) : '';
    foreach ([strtolower($sour), $sourBlock, $all] as $hay) {
        if ($hay === '') { continue; }
        foreach ($known as $k => [$label, $rx]) { if (preg_match($rx, $hay)) { return ['producer' => $k, 'producer_label' => $label, 'sour' => $sour]; } }
    }
    return ['producer' => '', 'producer_label' => $sour, 'sour' => $sour];
}

/** Ce qu'un GEDCOM va faire entrer (sans rien écrire) : nombres, logiciel, médias en ligne, avertissements. */
function gedcom_preview_counts(string $text): array
{
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $p = gedcom_producer($text);
    $text = preg_replace('/^\s*0\s+HEAD\b.*?(?=^\s*0\s)/ms', '', $text, 1) ?? $text; // l'en-tête (son « 1 FILE » est le nom du .ged)
    $c = static fn(string $rx): int => preg_match_all($rx, $text);
    $remote = $c('/^\s*\d+\s+FILE\s+https?:\/\//mi');
    $local = $c('/^\s*\d+\s+FILE\s+(?!https?:\/\/)\S/mi');
    return $p + [
        'persons' => $c('/^\s*0\s+@[^@]+@\s+INDI\b/m'), 'families' => $c('/^\s*0\s+@[^@]+@\s+FAM\b/m'),
        'sources' => $c('/^\s*0\s+@[^@]+@\s+SOUR\b/m'), 'notes' => $c('/^\s*0\s+@[^@]+@\s+NOTE\b/m'),
        'events' => $c('/^\s*1\s+(BIRT|CHR|BAPM|DEAT|BURI|CREM|MARR|DIV|ENGA|OCCU|RESI|CENS|EVEN|EMIG|IMMI|NATU|GRAD|EDUC|RETI|WILL|PROB|CONF|FCOM|_MILT)\b/m'),
        'media_remote' => $remote, 'media_local' => $local,
        'tags' => $c('/^\s*0\s+@[^@]+@\s+_MTTAG\b/m') + count(array_unique(preg_match_all('/^\s*\d+\s+_LABEL\s+(.+)$/m', $text, $mm) ? $mm[1] : [])),
    ];
}

function import_pending_dir(): string
{
    $d = DATA_DIR . '/cache/import-pending';
    if (!is_dir($d)) { @mkdir($d, 0700, true); }
    foreach (glob($d . '/*') ?: [] as $f) { if (is_file($f) && filemtime($f) < time() - 86400) { @unlink($f); } } // plus d'un jour : oublié
    return $d;
}

/** Formats d'arbre reconnus par la fenêtre « ⤒ Importer un arbre » */
const IMPORT_TREE_EXTS = ['ged', 'gedcom', 'gramps', 'gpkg', 'zip', 'gdz', 'heredis', 'mftpkg'];

/**
 * Étape 2 de la fenêtre K13 : le fichier est gardé de côté (DATA_DIR/cache/import-pending) et décrit ; l'étape 3
 * (import_pending) l'importe sans le renvoyer.
 */
function import_preview(PDO $pdo, ?array $file): never
{
    if (!$file || ($file['error'] ?? 1) !== UPLOAD_ERR_OK) { json_response(['error' => upload_failure_message($file)], 422); }
    $name = (string) ($file['name'] ?? '');
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, IMPORT_TREE_EXTS, true)) { json_response(['error' => 'Ce format n’est pas un arbre : choisis un fichier GEDCOM (.ged), Gramps (.gramps, .gpkg), GedZip (.zip), Hérédis (.heredis) ou MacFamilyTree (.mftpkg).'], 422); }
    @set_time_limit(0);
    $out = ['format' => $ext, 'name' => $name, 'size' => (int) ($file['size'] ?? 0), 'notices' => []];
    try {
        if (in_array($ext, ['ged', 'gedcom'], true)) {
            $text = gedcom_text_to_utf8((string) file_get_contents($file['tmp_name']));
            if (!preg_match('/^\s*0\s+HEAD\b/m', $text) && !preg_match('/^\s*0\s+@[^@]+@\s+INDI\b/m', $text)) { throw new RuntimeException('Ce fichier n’est pas un GEDCOM : aucune personne ni en-tête « HEAD » trouvé.'); }
            $out += gedcom_preview_counts($text);
        } elseif ($ext === 'gramps' || $ext === 'gpkg') {
            [$ged, $counts] = gramps_file_to_gedcom($file['tmp_name'], $ext === 'gpkg');
            $out += gedcom_preview_counts($ged) + ['gramps' => $counts];
            $out['producer'] = 'gramps'; $out['producer_label'] = 'Gramps';
            $out['places'] = $counts['places']; $out['events'] = $counts['events']; $out['witnesses'] = $counts['witnesses'];
            if ($ext === 'gramps' && $counts['media'] > 0) { $out['notices'][] = ['kind' => 'warn', 'text' => 'Ce fichier .gramps cite ' . imports_plural($counts['media'], 'média', 'médias') . ' sans les contenir : les fiches des médias seront créées seulement si le fichier est déjà dans tes médias. Pour avoir les photos, exporte plutôt un « paquet Gramps » (.gpkg).']; }
            if ($ext === 'gpkg') { $out['media_local'] = $counts['package_files'] ?? 0; }
        } elseif ($ext === 'zip' || $ext === 'gdz') {
            if (function_exists('is_restore_upload') && is_restore_upload(['name' => 'x.zip', 'tmp_name' => $file['tmp_name']])) { throw new RuntimeException('C’est une sauvegarde complète de LCNDA : elle remplacerait toute ta base. Ouvre-la plutôt depuis Réglages → Sauvegarde.'); }
            $za = new ZipArchive();
            if ($za->open($file['tmp_name']) !== true) { throw new RuntimeException('Cette archive .zip est abîmée.'); }
            if (function_exists('import_zip_guard')) { import_zip_guard($za, sys_get_temp_dir()); } // bombe zip, chemins « ../ » : refusés dès l'aperçu
            $ged = null; $media = 0; $kind = '';
            for ($i = 0; $i < $za->numFiles; $i++) {
                $st = $za->statIndex($i); $nm = (string) ($st['name'] ?? '');
                if (preg_match('/\.(ged|gedcom)$/i', $nm) && $ged === null && (int) $st['size'] < 300 * 1048576) { $ged = $i; }
                elseif (preg_match('/\.heredis$/i', $nm)) { $kind = 'Hérédis'; }
                elseif (basename($nm) === 'database') { $kind = 'MacFamilyTree'; }
                elseif (preg_match('/\.(jpe?g|png|gif|webp|tiff?|pdf|mp3|m4a|wav|mp4|mov)$/i', $nm)) { $media++; }
            }
            if ($ged !== null) { $out += gedcom_preview_counts(gedcom_text_to_utf8((string) $za->getFromIndex($ged))); $out['media_local'] = $media; $out['format'] = 'gedzip'; }
            elseif ($kind !== '') { $out['producer_label'] = $kind; $out['format'] = $kind; }
            else { $za->close(); throw new RuntimeException('Ni fichier GEDCOM, ni Hérédis, ni MacFamilyTree dans cette archive.'); }
            $za->close();
        } else {
            $out['producer_label'] = $ext === 'heredis' ? 'Hérédis' : 'MacFamilyTree';
        }
    } catch (Throwable $e) { json_response(['error' => $e->getMessage()], 422); }
    if (($out['media_remote'] ?? 0) > 0) { $out['notices'][] = ['kind' => 'info', 'text' => imports_plural((int) $out['media_remote'], 'photo ou document en ligne', 'photos ou documents en ligne') . ' (' . ($out['producer_label'] ?: 'site') . ') : gardés comme liens dans une note de la fiche, jamais téléchargés.']; }
    foreach ((array) ($file['converted_warnings'] ?? []) as $w) { $out['notices'][] = ['kind' => 'warn', 'text' => (string) $w]; } // GeneWeb : blocs illisibles laissés de côté
    if (($out['producer'] ?? '') === 'geneweb') { $out['notices'][] = ['kind' => 'info', 'text' => 'Fichier GeneWeb (.gw) : familles, événements (pevt, fevt), témoins, parrains, notes et sources sont repris ; les notes générales de la base vont dans une note de la première fiche.']; }
    if (($out['producer'] ?? '') === 'gedcomx') { $out['notices'][] = ['kind' => 'info', 'text' => 'Fichier GEDCOM-X (FamilySearch) : personnes, couples, filiations (avec adoption), faits datés et placés, lieux avec coordonnées, sources et notes sont repris.']; }
    if (($out['producer'] ?? '') === 'ancestry') { $out['notices'][] = ['kind' => 'info', 'text' => 'Fichier d’Ancestry : les liens vers les fiches d’Ancestry (_APID) sont gardés dans les citations, les étiquettes (_MTTAG) deviennent des étiquettes.']; }
    if (($out['producer'] ?? '') === 'myheritage') { $out['notices'][] = ['kind' => 'info', 'text' => 'Fichier de MyHeritage : noms d’épouse (_MARNM), photo principale (_PHOTO, _PRIM) et liens vers les documents sont gardés.']; }
    $existing = (int) $pdo->query('SELECT count(*) FROM persons')->fetchColumn();
    if ($existing > 0) { $out['notices'][] = ['kind' => 'warn', 'text' => 'Ta base a déjà ' . imports_plural($existing, 'fiche', 'fiches') . ' : tout est ajouté à côté, sans rien fusionner. Pour l’arbre d’un cousin, « Fusionner un arbre » compare d’abord fiche par fiche.']; }
    $out['existing_persons'] = $existing;
    $token = bin2hex(random_bytes(12));
    $dest = import_pending_dir() . '/' . $token . '.' . $ext;
    if (!(is_uploaded_file($file['tmp_name']) ? move_uploaded_file($file['tmp_name'], $dest) : copy($file['tmp_name'], $dest))) { json_response(['error' => 'Le fichier n’a pas pu être gardé pour l’import.'], 500); }
    file_put_contents($dest . '.json', json_encode(['name' => $name], JSON_UNESCAPED_UNICODE));
    json_response(['ok' => true, 'token' => $token] + $out);
}

/** Le fichier gardé à l'étape 2 (jeton), comme un fichier envoyé. */
function import_pending_file(array $payload): array
{
    $token = (string) ($payload['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{24}$/', $token)) { json_response(['error' => 'Fichier à importer introuvable : recommence.'], 422); }
    $found = null;
    foreach (IMPORT_TREE_EXTS as $ext) { $p = import_pending_dir() . '/' . $token . '.' . $ext; if (is_file($p)) { $found = [$p, $ext]; break; } }
    if (!$found) { json_response(['error' => 'Le fichier à importer a été oublié (plus d’un jour) : recommence.'], 422); }
    $meta = json_decode((string) @file_get_contents($found[0] . '.json'), true) ?: [];
    $name = preg_replace('/[^\p{L}\p{N} ._\-()]/u', '_', (string) ($meta['name'] ?? 'arbre')) ?: 'arbre';
    if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== $found[1]) { $name .= '.' . $found[1]; }
    return ['name' => $name, 'tmp_name' => $found[0], 'error' => UPLOAD_ERR_OK, 'size' => (int) filesize($found[0]), 'local' => false, 'pending' => true];
}

// ─── Reçus d'import : « ↶ Annuler » ────────────────────────────────────────────────────────

function import_receipt_dir(): string
{
    $d = DATA_DIR . '/cache/import-receipts';
    if (!is_dir($d)) { @mkdir($d, 0700, true); }
    return $d;
}

/** Les plus grands identifiants avant l'import. */
function import_receipt_begin(PDO $pdo): array
{
    $max = [];
    foreach (IMPORT_RECEIPT_TABLES as $t) {
        try { $max[$t] = (int) $pdo->query("SELECT COALESCE(MAX(id),0) FROM \"$t\"")->fetchColumn(); } catch (Throwable) { /* table absente */ }
    }
    return $max;
}

/** Garde ce que l'import a ajouté (plages d'identifiants) ; renvoie le jeton pour « ↶ Annuler ». */
function import_receipt_save(PDO $pdo, string $kind, array $before, array $extra = []): string
{
    $ranges = [];
    foreach ($before as $t => $from) {
        $to = (int) $pdo->query("SELECT COALESCE(MAX(id),0) FROM \"$t\"")->fetchColumn();
        if ($to > $from) { $ranges[$t] = [$from, $to]; }
    }
    $token = bin2hex(random_bytes(12));
    $files = glob(import_receipt_dir() . '/*.json') ?: [];
    usort($files, static fn($a, $b) => filemtime($a) <=> filemtime($b));
    foreach (array_slice($files, 0, max(0, count($files) - 19)) as $old) { @unlink($old); } // 20 reçus au plus
    file_put_contents(import_receipt_dir() . '/' . $token . '.json', json_encode(['kind' => $kind, 'at' => date('c'), 'ranges' => $ranges] + $extra, JSON_UNESCAPED_UNICODE));
    return $token;
}

/** Un reçu libre (import ADN : ids ajoutés, lignes d'avant) ; renvoie le jeton. */
function import_receipt_put(string $kind, array $data): string
{
    $token = bin2hex(random_bytes(12));
    $files = glob(import_receipt_dir() . '/*.json') ?: [];
    usort($files, static fn($a, $b) => filemtime($a) <=> filemtime($b));
    foreach (array_slice($files, 0, max(0, count($files) - 39)) as $old) { @unlink($old); }
    file_put_contents(import_receipt_dir() . '/' . $token . '.json', json_encode(['kind' => $kind, 'at' => date('c')] + $data, JSON_UNESCAPED_UNICODE));
    return $token;
}

function import_receipt_load(string $token, string $kind): array
{
    if (!preg_match('/^[0-9a-f]{24}$/', $token)) { throw new LcndaBadInput('Annulation impossible : import inconnu.'); }
    $f = import_receipt_dir() . '/' . $token . '.json';
    $r = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    if (!is_array($r) || ($r['kind'] ?? '') !== $kind) { throw new LcndaBadInput('Annulation impossible : cet import a déjà été annulé ou oublié.'); }
    return $r;
}

/**
 * ↶ Annuler un import d'arbre : retire tout ce qu'il a ajouté (fiches, familles, événements, lieux, sources, médias…),
 * sauf ce dont une fiche ajoutée ensuite à la main a besoin (un lieu, une source, une étiquette déjà réutilisés restent).
 */
function import_undo(PDO $pdo, array $d): array
{
    $token = (string) ($d['token'] ?? '');
    $r = import_receipt_load($token, 'tree');
    $rg = $r['ranges'] ?? [];
    $in = static function (string $t, string $col = 'id') use ($rg): string { if (!isset($rg[$t])) { return '0'; } return "($col > " . (int) $rg[$t][0] . " AND $col <= " . (int) $rg[$t][1] . ')'; };
    $out = static function (string $t) use ($rg): string { if (!isset($rg[$t])) { return '1'; } return '(id <= ' . (int) $rg[$t][0] . ' OR id > ' . (int) $rg[$t][1] . ')'; };
    // une fiche ajoutée ensuite (hors de l'import) qui s'appuie sur une fiche importée : on ne défait pas
    $p = $in('persons', 'partner1_id'); $p2 = $in('persons', 'partner2_id');
    $blocking = (int) $pdo->query("SELECT count(*) FROM families WHERE {$out('families')} AND ($p OR $p2)")->fetchColumn()
        + (int) $pdo->query("SELECT count(*) FROM family_children WHERE {$out('family_children')} AND ({$in('persons', 'child_id')} OR {$in('families', 'family_id')})")->fetchColumn()
        + (int) $pdo->query("SELECT count(*) FROM events WHERE {$out('events')} AND ({$in('persons', 'person_id')} OR {$in('families', 'family_id')})")->fetchColumn();
    if ($blocking > 0) { throw new LcndaBadInput('Des fiches importées ont déjà été reliées à d’autres : l’import ne peut plus être annulé d’un coup.'); }
    $files = [];
    if (isset($rg['media'])) { foreach ($pdo->query("SELECT filename FROM media WHERE {$in('media')}")->fetchAll(PDO::FETCH_COLUMN) as $fn) { if ($fn !== '') { $files[$fn] = true; } } }
    $n = 0;
    $del = static function (string $sql) use ($pdo, &$n): void { $n += (int) $pdo->exec($sql); };
    foreach (['event_witnesses', 'name_variants', 'family_children', 'source_links', 'media_links', 'label_links', 'notes', 'events'] as $t) { if (isset($rg[$t])) { $del("DELETE FROM $t WHERE {$in($t)}"); } }
    if (isset($rg['pets'])) { $del("DELETE FROM pets WHERE {$in('pets')}"); }
    if (isset($rg['families'])) { $del("DELETE FROM families WHERE {$in('families')}"); }
    if (isset($rg['persons'])) { $del("DELETE FROM persons WHERE {$in('persons')}"); }
    // ce qui sert encore ailleurs reste (lieu cité par un autre événement, source citée, étiquette posée…)
    if (isset($rg['places'])) { $del("DELETE FROM places WHERE {$in('places')} AND id NOT IN (SELECT place_id FROM events WHERE place_id IS NOT NULL)"); }
    if (isset($rg['sources'])) { $del("DELETE FROM sources WHERE {$in('sources')} AND id NOT IN (SELECT source_record_id FROM source_links WHERE source_record_id IS NOT NULL)"); }
    if (isset($rg['labels'])) { $del("DELETE FROM labels WHERE {$in('labels')} AND id NOT IN (SELECT label_id FROM label_links)"); }
    if (isset($rg['event_types'])) { $del("DELETE FROM event_types WHERE {$in('event_types')} AND id NOT IN (SELECT event_type_id FROM events)"); }
    if (isset($rg['surname_groups'])) { $del("DELETE FROM surname_groups WHERE {$in('surname_groups')} AND id NOT IN (SELECT surname_group_id FROM persons WHERE surname_group_id IS NOT NULL)"); }
    if (isset($rg['media'])) { $del("DELETE FROM media WHERE {$in('media')} AND id NOT IN (SELECT media_id FROM media_links)"); }
    // les fichiers copiés par l'import et que plus rien n'utilise
    $still = $pdo->prepare('SELECT 1 FROM media WHERE filename=? LIMIT 1');
    foreach (array_keys($files) as $fn) { $still->execute([$fn]); if (!$still->fetchColumn() && basename($fn) === $fn && is_file(MEDIA_DIR . '/' . $fn)) { @unlink(MEDIA_DIR . '/' . $fn); } }
    if (function_exists('gedimport_rebuild_search')) { gedimport_rebuild_search($pdo); }
    @unlink(import_receipt_dir() . '/' . $token . '.json');
    log_change($pdo, 'meta', 0, 'delete', 'Import annulé : ' . ($r['label'] ?? 'arbre') . ' (' . imports_plural($n, 'ligne retirée', 'lignes retirées') . ')');
    return ['removed' => $n, 'persons' => isset($rg['persons']) ? $rg['persons'][1] - $rg['persons'][0] : 0];
}

// ─── ADN : jamais de fichier brut ───────────────────────────────────────────────────────────

/** Vrai si le texte ressemble à un fichier brut de SNP (23andMe, Ancestry, MyHeritage, FTDNA, LivingDNA…). */
function dna_is_raw_text(string $head): bool
{
    $h = strtolower(substr($head, 0, 20000));
    if (preg_match('/^#.*(23andme|ancestrydna|myheritage dna raw|living dna|ftdna|family tree dna).*(raw|genotype|data)/m', $h)) { return true; }
    if (preg_match('/^"?rsid"?\s*[\t,;]\s*"?chromosome"?\s*[\t,;]\s*"?position"?/m', $h)) { return true; }
    if (preg_match('/^#\s*rsid\s+chromosome\s+position\s+genotype/m', $h)) { return true; }
    $lines = array_slice(preg_split('/\r?\n/', $h) ?: [], 0, 400);
    $snp = 0; $data = 0;
    foreach ($lines as $l) {
        if ($l === '' || $l[0] === '#') { continue; }
        $data++;
        if (preg_match('/^"?(rs|i|vg)\d+"?\s*[\t,;]\s*"?(\d{1,2}|x|y|xy|mt)"?\s*[\t,;]\s*"?\d+"?\s*[\t,;]\s*"?[acgtid\-0]{1,2}"?/', $l)) { $snp++; }
    }
    return $data >= 5 && $snp >= max(5, (int) ($data * 0.6));
}
