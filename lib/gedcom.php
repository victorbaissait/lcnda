<?php
declare(strict_types=1);

/**
 * Import et export GEDCOM (5.5.1 et 7).
 *
 * Écrits en miroir : tout ce que l'export écrit, l'import sait le relire (aller-retour sans perte), et l'import
 * comprend aussi les particularités des logiciels courants (Hérédis : notes RTF, lieux en 6 morceaux, _FIL ;
 * Legacy/RootsMagic : _FREL/_MREL ; coordonnées MAP/LATI/LONG…).
 *
 * Les dates de LCNDA sont en français libre (« 28 juin 1814 », « 14/07/1789 », « vers 1750 »…) : elles sont
 * converties au format GEDCOM à l'export (« 28 JUN 1814 », « ABT 1750 ») et en français à l'import. Une date
 * impossible à convertir est gardée telle quelle comme « date en clair » GEDCOM : « (texte) ».
 *
 * Utilise des fonctions d'api.php : person_select(), export_option_enabled(), export_person_allowed(),
 * gedimport_parse(), gedimport_text(), gedimport_child(), gedimport_children(), gedimport_group_id(),
 * gedimport_index_media_dir(), gedimport_store_media(), gedimport_rebuild_search().
 */

/** Ordre des morceaux d'un lieu (identique à Hérédis) : commune, code postal, département, région, pays, lieu-dit. */
const GEDCOM_PLACE_FORM = 'Town, Area code, County, Region, Country, Subdivision';
const GEDCOM_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const GEDCOM_FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Événements individuels et attributs standard (GEDCOM 5.5.1) ; tout autre type est écrit en EVEN + TYPE. */
const GEDCOM_PERSON_EVENT_TAGS = ['BIRT', 'CHR', 'DEAT', 'BURI', 'CREM', 'ADOP', 'BAPM', 'BARM', 'BASM', 'BLES', 'CHRA',
    'CONF', 'FCOM', 'ORDN', 'NATU', 'EMIG', 'IMMI', 'CENS', 'PROB', 'WILL', 'GRAD', 'RETI'];
const GEDCOM_PERSON_ATTRIBUTE_TAGS = ['CAST', 'DSCR', 'EDUC', 'IDNO', 'NATI', 'NCHI', 'NMR', 'OCCU', 'PROP', 'RELI',
    'RESI', 'SSN', 'TITL', 'FACT'];
const GEDCOM_FAMILY_EVENT_TAGS = ['ANUL', 'CENS', 'DIV', 'DIVF', 'ENGA', 'MARB', 'MARC', 'MARR', 'MARL', 'MARS', 'RESI'];

/** Balises de structure, jamais lues comme des événements. */
const GEDCOM_STRUCTURAL_TAGS = ['NAME', 'SEX', 'FAMC', 'FAMS', 'NOTE', 'SOUR', 'OBJE', 'CHAN', 'CREA', 'RIN', 'REFN',
    'RFN', 'AFN', 'UID', 'ASSO', 'ALIA', 'ANCI', 'DESI', 'SUBM', 'HUSB', 'WIFE', 'CHIL', 'NCHI', 'RESN', 'SLGS', 'SLGC',
    'BAPL', 'CONL', 'ENDL', 'INIL', '_CREA', '_UID', '_GUID', '_FIL', '_UST', '_UPD', '_PRIM', '_FREL', '_MREL',
    '_FSFTID', '_TIME', '_STAT'];

function gedcom_value(mixed $value): string
{
    return trim(preg_replace('/\s+/u', ' ', str_replace(["\r", "\n"], ' ', (string) $value)) ?? '');
}

function gedcom_fold(string $value): string
{
    return mb_strtolower(trim(ascii_fold($value)));
}

// ─── Dates ──────────────────────────────────────────────────────────────────────────────────

function gedcom_month_number(string $word): ?int
{
    static $map = null;
    if ($map === null) {
        $map = [];
        foreach (GEDCOM_FR_MONTHS as $i => $name) { $map[gedcom_fold($name)] = $i + 1; }
        foreach (GEDCOM_MONTHS as $i => $name) { $map[strtolower($name)] = $i + 1; }
        foreach (['janv' => 1, 'fevr' => 2, 'fev' => 2, 'avr' => 4, 'juil' => 7, 'aou' => 8, 'sept' => 9,
            'january' => 1, 'february' => 2, 'march' => 3, 'april' => 4, 'june' => 6, 'july' => 7, 'august' => 8,
            'september' => 9, 'october' => 10, 'november' => 11, 'december' => 12] as $k => $v) { $map[$k] = $v; }
    }
    return $map[rtrim(gedcom_fold($word), '.')] ?? null;
}

/** Une date simple (sans « vers », « avant »…) en GEDCOM, ou null si elle n'est pas reconnue. */
function gedcom_date_core(string $text): ?string
{
    $t = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    $t = preg_replace('/^(le|du|au)\s+/iu', '', $t) ?? $t;
    $t = preg_replace('/^(\d{1,2})\s*(er|e)\b/iu', '$1', $t) ?? $t;
    $fmt = static fn(?int $d, ?int $m, int $y): ?string => ($m !== null && ($m < 1 || $m > 12)) || ($d !== null && ($d < 1 || $d > 31))
        ? null
        : trim(($d ? $d . ' ' : '') . ($m ? GEDCOM_MONTHS[$m - 1] . ' ' : '') . $y);
    if (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{3,4})$/u', $t, $m)) { return $fmt((int) $m[1], (int) $m[2], (int) $m[3]); }
    if (preg_match('/^(\d{3,4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/u', $t, $m)) { return $fmt((int) $m[3], (int) $m[2], (int) $m[1]); }
    if (preg_match('/^(\d{1,2})[\/.\-](\d{3,4})$/u', $t, $m)) { return $fmt(null, (int) $m[1], (int) $m[2]); }
    if (preg_match('/^(\d{1,2})\s+([\p{L}.]+)\s*(\d{3,4})$/u', $t, $m) && ($mo = gedcom_month_number($m[2]))) { return $fmt((int) $m[1], $mo, (int) $m[3]); }
    if (preg_match('/^([\p{L}.]+)\s+(\d{3,4})$/u', $t, $m) && ($mo = gedcom_month_number($m[1]))) { return $fmt(null, $mo, (int) $m[2]); }
    if (preg_match('/^(\d{3,4})$/u', $t, $m)) { return (string) (int) $m[1]; }
    return null;
}

/** « 28 juin 1814 » → « 28 JUN 1814 » ; « vers 1750 » → « ABT 1750 » ; non reconnu → « (texte) ». */
function gedcom_date_from_text(string $text): string
{
    $original = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
    if ($original === '') { return ''; }
    $t = rtrim($original, " ,;");
    $uncertain = false;
    if (preg_match('/\(\s*\?\s*\)|\?$/u', $t)) { $uncertain = true; $t = trim(preg_replace('/\(\s*\?\s*\)|\?$/u', '', $t) ?? $t); }
    if (preg_match('/^entre\s+(.+?)\s+et\s+(.+)$/iu', $t, $m) && ($a = gedcom_date_core($m[1])) && ($b = gedcom_date_core($m[2]))) { return "BET $a AND $b"; }
    if (preg_match('/^(?:de|du)\s+(.+?)\s+(?:à|a|au)\s+(.+)$/iu', $t, $m) && ($a = gedcom_date_core($m[1])) && ($b = gedcom_date_core($m[2]))) { return "FROM $a TO $b"; }
    if (preg_match('/^(.+?)\s+(?:à|-)\s+(.+)$/iu', $t, $m) && ($a = gedcom_date_core($m[1])) && ($b = gedcom_date_core($m[2]))) { return "FROM $a TO $b"; }
    $qualifiers = [
        'ABT' => '/^(?:vers|environ|env\.?|circa|ca\.?|c\.|~|autour de|about|abt\.?)\s*/iu',
        'BEF' => '/^(?:avant|av\.?|before|bef\.?)\s+/iu',
        'AFT' => '/^(?:après|apres|ap\.?|after|aft\.?)\s+/iu',
        'EST' => '/^(?:estimé|estime|est\.)\s*/iu',
        'CAL' => '/^(?:calculé|calcule|cal\.)\s*/iu',
    ];
    foreach ($qualifiers as $gedcom => $pattern) {
        if (preg_match($pattern, $t)) {
            $core = gedcom_date_core(preg_replace($pattern, '', $t) ?? '');
            return $core !== null ? "$gedcom $core" : '(' . $original . ')';
        }
    }
    $core = gedcom_date_core($t);
    if ($core === null) { return '(' . $original . ')'; }
    return $uncertain ? "ABT $core" : $core;
}

function gedcom_date_core_to_text(string $core): string
{
    $core = trim(preg_replace('/^@#D[^@]*@\s*/', '', $core) ?? $core);
    if (preg_match('/^(?:(\d{1,2})\s+)?(?:([A-Z]{3,4})\s+)?(-?\d{1,4})(?:\/\d{1,2})?(?:\s+B\.?C\.?)?$/i', $core, $m)) {
        $month = $m[2] !== '' ? array_search(strtoupper($m[2]), GEDCOM_MONTHS, true) : false;
        if ($m[2] !== '' && $month === false) { return $core; }
        return trim(($m[1] !== '' ? (int) $m[1] . ' ' : '') . ($month !== false ? GEDCOM_FR_MONTHS[$month] . ' ' : '') . $m[3]);
    }
    return $core;
}

/** « 28 JUN 1814 » → « 28 juin 1814 » ; « ABT 1750 » → « vers 1750 » ; « (texte) » → « texte ». */
function gedcom_date_to_text(string $value): string
{
    $v = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    if ($v === '') { return ''; }
    if (preg_match('/^\((.*)\)$/u', $v, $m)) { return trim($m[1]); }
    if (preg_match('/^INT\s+(.+?)\s*\((.*)\)$/iu', $v, $m)) { return gedcom_date_core_to_text($m[1]) . ' (' . trim($m[2]) . ')'; }
    if (preg_match('/^BET\s+(.+)\s+AND\s+(.+)$/iu', $v, $m)) { return 'entre ' . gedcom_date_core_to_text($m[1]) . ' et ' . gedcom_date_core_to_text($m[2]); }
    if (preg_match('/^FROM\s+(.+)\s+TO\s+(.+)$/iu', $v, $m)) { return 'de ' . gedcom_date_core_to_text($m[1]) . ' à ' . gedcom_date_core_to_text($m[2]); }
    if (preg_match('/^FROM\s+(.+)$/iu', $v, $m)) { return 'depuis ' . gedcom_date_core_to_text($m[1]); }
    if (preg_match('/^TO\s+(.+)$/iu', $v, $m)) { return 'jusqu’à ' . gedcom_date_core_to_text($m[1]); }
    foreach (['ABT' => 'vers', 'EST' => 'estimé', 'CAL' => 'calculé', 'BEF' => 'avant', 'AFT' => 'après'] as $gedcom => $fr) {
        if (preg_match('/^' . $gedcom . '\.?\s+(.+)$/iu', $v, $m)) { return $fr . ' ' . gedcom_date_core_to_text($m[1]); }
    }
    return gedcom_date_core_to_text($v);
}

function gedcom_year(string $text): ?int
{
    return preg_match('/(?<!\d)(\d{3,4})(?!\d)/', $text, $m) ? (int) $m[1] : null;
}

// ─── Textes (notes RTF d'Hérédis, lignes longues) ──────────────────────────────────────────

/** Convertit une note RTF (Hérédis pour Mac exporte ses notes ainsi) en texte simple. Laisse un texte normal intact. */
function gedcom_rtf_to_text(string $text): string
{
    if (!preg_match('/^\s*\{\\\\rtf/', $text)) { return $text; }
    $s = str_replace(["\r\n", "\r"], "\n", $text);
    // Tables de polices, couleurs, styles… : blocs à ignorer entièrement.
    $s = preg_replace('/\{\\\\(?:fonttbl|colortbl|stylesheet|info|\*)(?:[^{}]|\{[^{}]*\})*\}/', '', $s) ?? $s;
    $s = preg_replace('/\\\\(?:par|line)\b ?/', "\n", $s) ?? $s;
    $s = preg_replace_callback("/\\\\'([0-9a-fA-F]{2})/", static fn($m) => mb_convert_encoding(chr(hexdec($m[1])), 'UTF-8', 'Windows-1252'), $s) ?? $s;
    $s = preg_replace_callback('/\\\\u(-?\d+) ?\??/', static fn($m) => mb_chr(((int) $m[1] + 65536) % 65536, 'UTF-8') ?: '', $s) ?? $s;
    $s = preg_replace('/\\\\([{}\\\\])/', "\x01$1", $s) ?? $s;          // accolades et barres échappées : à garder
    $s = preg_replace('/\\\\[a-zA-Z]+-?\d* ?/', '', $s) ?? $s;          // mots de contrôle
    $s = preg_replace('/\\\\[^a-zA-Z]/', '', $s) ?? $s;
    $s = str_replace(['{', '}'], '', $s);
    $s = str_replace("\x01", '', $s);
    $lines = array_map('trim', explode("\n", $s));
    return trim(preg_replace("/\n{3,}/", "\n\n", implode("\n", $lines)) ?? '');
}

// ─── Lieux ──────────────────────────────────────────────────────────────────────────────────

/** Morceaux d'un lieu de LCNDA, sans répéter ce que le nom contient déjà (bug « …, France, Département…, France »). */
function gedcom_place_parts(array $row): array
{
    $county = trim((string) ($row['county'] ?? ''));
    $state = trim((string) ($row['state'] ?? ''));
    $country = trim((string) ($row['country'] ?? ''));
    $subdivision = trim((string) ($row['subdivision'] ?? ''));
    $nameParts = array_values(array_filter(array_map('trim', explode(',', (string) ($row['place_name'] ?? ''))), static fn($p) => $p !== ''));
    $town = (string) array_shift($nameParts);
    if ($nameParts && $county === '' && $state === '' && $country === '') {
        // Nom complet sans morceaux séparés (« Commune, Département, Région, Pays ») : on le répartit comme à l'import.
        $split = gedcom_split_place($town . ', ' . implode(', ', $nameParts), []);
        return ['town' => $split['name'], 'postal' => '', 'county' => $split['county'], 'state' => $split['state'], 'country' => $split['country'], 'subdivision' => trim($split['subdivision'] . ($subdivision !== '' ? ', ' . $subdivision : ''), ', ')];
    }
    // Nom qui répète déjà département / région / pays (lieux venus de MacFamilyTree) : on enlève les répétitions et on
    // range chaque morceau restant à sa place (avant le département : lieu-dit ; après : région).
    $known = array_filter(['county' => gedcom_fold($county), 'state' => gedcom_fold($state), 'country' => gedcom_fold($country), 'subdivision' => gedcom_fold($subdivision)]);
    $afterCounty = false;
    $extraSubdivisions = [];
    foreach ($nameParts as $part) {
        $match = array_search(gedcom_fold($part), $known, true);
        if ($match !== false) { if ($match === 'county' || $match === 'state' || $match === 'country') { $afterCounty = true; } continue; }
        if ($afterCounty && $state === '') { $state = $part; continue; }
        if ($afterCounty && $country === '') { $country = $part; continue; }
        if (!$afterCounty && $county === '') { $county = $part; $afterCounty = true; continue; }
        $extraSubdivisions[] = $part;
    }
    $subdivision = implode(', ', array_filter([...$extraSubdivisions, $subdivision]));
    return ['town' => $town, 'postal' => '', 'county' => $county, 'state' => $state, 'country' => $country, 'subdivision' => $subdivision];
}

function gedcom_place_value(array $parts): string
{
    if (implode('', $parts) === '') { return ''; }
    return implode(', ', array_map(static fn($p) => str_replace(',', ' ', gedcom_value($p)), [$parts['town'], $parts['postal'], $parts['county'], $parts['state'], $parts['country'], $parts['subdivision']]));
}

/** Découpe un PLAC selon le FORM de l'en-tête (ou, sans FORM, selon la position des morceaux). */
function gedcom_split_place(string $value, array $form): array
{
    $parts = array_map('trim', explode(',', $value));
    $out = ['name' => '', 'postal' => '', 'county' => '', 'state' => '', 'country' => '', 'subdivision' => ''];
    if ($form && count($form) >= count(array_filter($parts, static fn($p) => $p !== ''))) {
        foreach ($form as $i => $label) {
            $p = $parts[$i] ?? '';
            if ($p === '') { continue; }
            $l = gedcom_fold($label);
            $key = match (true) {
                (bool) preg_match('/town|city|ville|commune|paroisse|parish|lieu$/', $l) => 'name',
                (bool) preg_match('/area|postal|zip|code|insee/', $l) => 'postal',
                (bool) preg_match('/county|departement|dept|district/', $l) => 'county',
                (bool) preg_match('/region|state|province/', $l) => 'state',
                (bool) preg_match('/country|pays|nation/', $l) => 'country',
                default => 'subdivision',
            };
            $out[$key] = $out[$key] === '' ? $p : $out[$key] . ', ' . $p;
        }
        return $out;
    }
    $parts = array_values(array_filter($parts, static fn($p) => $p !== ''));
    $n = count($parts);
    if ($n === 0) { return $out; }
    $out['name'] = $parts[0];
    if ($n >= 2) { $out['country'] = $parts[$n - 1]; }
    if ($n >= 3) { $out['county'] = $parts[1]; }
    if ($n >= 4) { $out['state'] = $parts[$n - 2]; }
    if ($n >= 5) { $out['subdivision'] = implode(', ', array_slice($parts, 2, $n - 4)); }
    return $out;
}

function gedcom_coordinate(?string $value): ?float
{
    $v = strtoupper(trim((string) $value));
    if ($v === '' || !preg_match('/^([NSEW])?\s*(-?\d+(?:[.,]\d+)?)$/', $v, $m)) { return null; }
    $n = (float) str_replace(',', '.', $m[2]);
    return in_array($m[1], ['S', 'W'], true) ? -abs($n) : $n;
}

function gedcom_import_place_id(PDO $pdo, array &$cache, stdClass $placNode, array $form): ?int
{
    $raw = trim(gedimport_text($placNode));
    if ($raw === '') { return null; }
    $p = gedcom_split_place($raw, $form);
    if ($p['name'] === '') { $p['name'] = $raw; }
    $lat = $lon = null;
    if ($map = gedimport_child($placNode, 'MAP')) {
        $lat = gedcom_coordinate(($n = gedimport_child($map, 'LATI')) ? $n->value : null);
        $lon = gedcom_coordinate(($n = gedimport_child($map, 'LONG')) ? $n->value : null);
    }
    $key = gedcom_fold(implode('|', [$p['name'], $p['county'], $p['state'], $p['country'], $p['subdivision']]));
    if (!isset($cache[$key])) {
        $stmt = $pdo->prepare("SELECT id FROM places WHERE name=? COLLATE NOCASE AND coalesce(county,'')=? AND coalesce(state,'')=? AND coalesce(country,'')=? AND coalesce(subdivision,'')=? LIMIT 1");
        $stmt->execute([$p['name'], $p['county'], $p['state'], $p['country'], $p['subdivision']]);
        $id = $stmt->fetchColumn();
        if (!$id) {
            $pdo->prepare('INSERT INTO places(name,county,state,country,subdivision,latitude,longitude) VALUES(?,?,?,?,?,?,?)')
                ->execute([$p['name'], $p['county'], $p['state'], $p['country'], $p['subdivision'], $lat, $lon]);
            $id = (int) $pdo->lastInsertId();
        }
        $cache[$key] = (int) $id;
    }
    if ($lat !== null && $lon !== null) {
        $pdo->prepare('UPDATE places SET latitude=?,longitude=? WHERE id=? AND (latitude IS NULL OR longitude IS NULL)')->execute([$lat, $lon, $cache[$key]]);
    }
    return $cache[$key];
}

/**
 * Coupe une ligne trop longue en morceaux (CONC) sans jamais couper juste avant ou après un espace : les lecteurs
 * GEDCOM, dont le nôtre, suppriment les espaces en bout de ligne, ce qui collerait deux mots.
 */
function gedcom_conc_chunks(string $row, int $size): array
{
    $chars = mb_str_split($row);
    $chunks = [];
    $start = 0;
    $n = count($chars);
    while ($n - $start > $size) {
        $cut = $start + $size;
        while ($cut < $n && $cut > $start + 1 && (ctype_space($chars[$cut - 1]) || ctype_space($chars[$cut]))) { $cut--; }
        if ($cut <= $start + 1) { $cut = $start + $size; }
        $chunks[] = implode('', array_slice($chars, $start, $cut - $start));
        $start = $cut;
    }
    $chunks[] = implode('', array_slice($chars, $start));
    return $chunks;
}

// ─── Export ─────────────────────────────────────────────────────────────────────────────────

function export_gedcom(PDO $pdo): never
{
    $version = ($_GET['gedcom_version'] ?? '5.5.1') === '7' ? '7' : '5.5.1';
    $filename = 'genealogie-' . date('Ymd-His') . '.ged';
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $out = fopen('php://output', 'w');
    $escape = static fn(string $v): string => str_starts_with($v, '@') && !preg_match('/^@[^@]+@$/', $v) ? '@' . $v : $v;
    $line = static function (int $level, string $tag, string $value = '') use ($out, $escape): void {
        $value = gedcom_value($value);
        fwrite($out, $level . ' ' . $tag . ($value !== '' ? ' ' . $escape($value) : '') . "\n");
    };
    // Texte sur plusieurs lignes (CONT) ; en 5.5.1, lignes coupées à 200 caractères (CONC), sans perdre d'espace.
    $text = static function (int $level, string $tag, string $value) use ($out, $version): void {
        $rows = explode("\n", str_replace(["\r\n", "\r"], "\n", trim($value)));
        foreach ($rows as $i => $row) {
            $chunks = $version === '7' || $row === '' ? [$row] : gedcom_conc_chunks($row, 200);
            foreach ($chunks as $j => $chunk) {
                $chunk = str_starts_with($chunk, '@') ? '@' . $chunk : $chunk;
                [$lvl, $t] = $i === 0 && $j === 0 ? [$level, $tag] : ($j === 0 ? [$level + 1, 'CONT'] : [$level + 1, 'CONC']);
                fwrite($out, $lvl . ' ' . $t . ($chunk !== '' ? ' ' . $chunk : '') . "\n");
            }
        }
    };

    $line(0, 'HEAD');
    $line(1, 'SOUR', 'LCNDA');
    $line(2, 'NAME', 'Le Carnet numérique des ancêtres');
    $line(1, 'GEDC');
    $line(2, 'VERS', $version === '7' ? '7.0' : '5.5.1');
    if ($version !== '7') { $line(2, 'FORM', 'LINEAGE-LINKED'); $line(1, 'CHAR', 'UTF-8'); }
    $line(1, 'LANG', $version === '7' ? 'fr' : 'French');
    $line(1, 'DATE', strtoupper(date('j M Y')));
    $line(1, 'PLAC');
    $line(2, 'FORM', GEDCOM_PLACE_FORM);

    $includeNotes = export_option_enabled('include_notes', true);
    $includeSources = export_option_enabled('include_sources', true);
    $includeMedia = export_option_enabled('include_media', true);

    $persons = array_values(array_filter($pdo->query(person_select() . ' ORDER BY p.id')->fetchAll(), 'export_person_allowed'));
    $visible = array_fill_keys(array_map(static fn($p) => (int) $p['id'], $persons), true);
    $families = $pdo->query('SELECT * FROM families ORDER BY id')->fetchAll();
    $childrenByFamily = []; $famcByChild = []; $famsBySpouse = [];
    foreach ($families as $f) {
        foreach (['partner1_id', 'partner2_id'] as $k) { if ((int) ($f[$k] ?? 0) > 0) { $famsBySpouse[(int) $f[$k]][(int) $f['id']] = true; } }
    }
    foreach ($pdo->query('SELECT * FROM family_children ORDER BY family_id,position,id') as $c) {
        $childrenByFamily[(int) $c['family_id']][(int) $c['child_id']] = $c;
        $famcByChild[(int) $c['child_id']][(int) $c['family_id']] = $c;
    }
    $events = $pdo->query("SELECT e.*,t.gedcom_tag,t.label AS type_label,pl.name AS place_name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        ORDER BY COALESCE(e.sort_date,''),COALESCE(e.year,9999),e.id")->fetchAll();
    $eventsByPerson = []; $eventsByFamily = [];
    foreach ($events as $e) {
        if (($e['scope'] ?? '') === 'person' && (int) ($e['person_id'] ?? 0) > 0 && isset($visible[(int) $e['person_id']])) { $eventsByPerson[(int) $e['person_id']][] = $e; }
        if (($e['scope'] ?? '') === 'family' && (int) ($e['family_id'] ?? 0) > 0) { $eventsByFamily[(int) $e['family_id']][] = $e; }
    }
    $notesByTarget = [];
    if ($includeNotes) {
        foreach ($pdo->query('SELECT entity_type,entity_id,title,body FROM notes ORDER BY id') as $n) {
            $body = trim((string) $n['body']); $title = trim((string) $n['title']);
            if ($body === '' && $title === '') { continue; }
            $notesByTarget[$n['entity_type'] . ':' . (int) $n['entity_id']][] = $title !== '' && !str_starts_with($body, $title) ? $title . "\n" . $body : $body;
        }
    }
    $citations = []; $sources = []; $repos = [];
    if ($includeSources) {
        foreach ($pdo->query('SELECT * FROM sources ORDER BY id') as $s) {
            $sources[(int) $s['id']] = $s;
            $agency = trim((string) ($s['agency'] ?? ''));
            if ($agency !== '' && !isset($repos[gedcom_fold($agency)])) { $repos[gedcom_fold($agency)] = ['id' => count($repos) + 1, 'name' => $agency]; }
        }
        foreach ($pdo->query('SELECT * FROM source_links WHERE source_record_id IS NOT NULL ORDER BY id') as $l) {
            if (isset($sources[(int) $l['source_record_id']])) { $citations[$l['entity_type'] . ':' . (int) $l['entity_id']][] = $l; }
        }
    }
    $mediaByTarget = []; $media = [];
    if ($includeMedia) {
        foreach ($pdo->query('SELECT ml.entity_type,ml.entity_id,ml.media_id,m.* FROM media_links ml JOIN media m ON m.id=ml.media_id ORDER BY ml.position,ml.id') as $m) {
            $mediaByTarget[$m['entity_type'] . ':' . (int) $m['entity_id']][] = (int) $m['media_id'];
            $media[(int) $m['media_id']] = $m;
        }
    }
    $variants = [];
    foreach ($pdo->query('SELECT * FROM name_variants ORDER BY person_id,position,id') as $v) { $variants[(int) $v['person_id']][] = $v; }

    $writeNotes = static function (int $level, string $target) use ($notesByTarget, $text): void {
        foreach ($notesByTarget[$target] ?? [] as $body) { $text($level, 'NOTE', $body); }
    };
    $writeCitations = static function (int $level, string $target) use ($citations, $line, $text): void {
        foreach ($citations[$target] ?? [] as $c) {
            $line($level, 'SOUR', '@S' . (int) $c['source_record_id'] . '@');
            if (trim((string) ($c['page'] ?? '')) !== '') { $line($level + 1, 'PAGE', (string) $c['page']); }
            if (trim((string) ($c['quality'] ?? '')) !== '') {
                $q = (string) $c['quality'];
                if (preg_match('/^[0-3]$/', $q)) { $line($level + 1, 'QUAY', $q); } else { $line($level + 1, '_QUAL', $q); }
            }
            if (trim((string) ($c['note'] ?? '')) !== '') { $text($level + 1, 'NOTE', (string) $c['note']); }
        }
    };
    $writeMedia = static function (int $level, string $target) use ($mediaByTarget, $line): void {
        foreach (array_unique($mediaByTarget[$target] ?? []) as $id) { $line($level, 'OBJE', '@M' . $id . '@'); }
    };
    $writeEvent = static function (array $e, string $scope) use ($line, $text, $writeNotes, $writeCitations, $writeMedia, $includeNotes): void {
        $tag = strtoupper(trim((string) ($e['gedcom_tag'] ?? '')));
        $standard = $scope === 'person' ? array_merge(GEDCOM_PERSON_EVENT_TAGS, GEDCOM_PERSON_ATTRIBUTE_TAGS) : GEDCOM_FAMILY_EVENT_TAGS;
        $isAttribute = in_array($tag, GEDCOM_PERSON_ATTRIBUTE_TAGS, true);
        $title = trim((string) ($e['title'] ?? ''));
        if (!in_array($tag, $standard, true)) {
            // Type sans balise standard (Reconnaissance, Mariage religieux, DEED…) : EVEN + TYPE, relu tel quel à l'import.
            $line(1, 'EVEN', $title);
            $line(2, 'TYPE', (string) ($e['type_label'] ?: 'Événement'));
        } else {
            $line(1, $tag, $isAttribute ? $title : '');
            if (!$isAttribute && $title !== '') { $line(2, '_TITL', $title); }
        }
        $date = trim((string) ($e['date_text'] ?? '')) !== '' ? gedcom_date_from_text((string) $e['date_text']) : (string) ($e['year'] ?? '');
        if ($date !== '') { $line(2, 'DATE', $date); }
        $parts = gedcom_place_parts($e);
        $plac = gedcom_place_value($parts);
        if ($plac !== '') {
            $line(2, 'PLAC', $plac);
            if (($e['latitude'] ?? null) !== null && ($e['longitude'] ?? null) !== null && $e['latitude'] !== '' && $e['longitude'] !== '') {
                $lat = (float) $e['latitude']; $lon = (float) $e['longitude'];
                $line(3, 'MAP');
                $line(4, 'LATI', ($lat < 0 ? 'S' : 'N') . rtrim(rtrim(number_format(abs($lat), 6, '.', ''), '0'), '.'));
                $line(4, 'LONG', ($lon < 0 ? 'W' : 'E') . rtrim(rtrim(number_format(abs($lon), 6, '.', ''), '0'), '.'));
            }
        }
        if (trim((string) ($e['address'] ?? '')) !== '') { $line(2, 'ADDR', (string) $e['address']); }
        if (trim((string) ($e['agency'] ?? '')) !== '') { $line(2, 'AGNC', (string) $e['agency']); }
        if (trim((string) ($e['cause'] ?? '')) !== '') { $line(2, 'CAUS', (string) $e['cause']); }
        if ($includeNotes && trim((string) ($e['description'] ?? '')) !== '') { $text(2, 'NOTE', (string) $e['description']); }
        $writeNotes(2, 'event:' . (int) $e['id']);
        $writeCitations(2, 'event:' . (int) $e['id']);
        $writeMedia(2, 'event:' . (int) $e['id']);
    };

    foreach ($persons as $p) {
        $pid = (int) $p['id'];
        $line(0, '@I' . $pid . '@', 'INDI');
        $writeName = static function (array $n, ?string $type, ?string $lcndaType) use ($line): void {
            $given = trim(implode(' ', array_filter([trim((string) ($n['first_name'] ?? '')), trim((string) ($n['middle_name'] ?? ''))])));
            $surname = trim((string) ($n['last_name'] ?? ''));
            $line(1, 'NAME', trim($given . ' /' . $surname . '/ ' . trim((string) ($n['suffix'] ?? ''))));
            if ($type !== null) { $line(2, 'TYPE', $type); }
            if ($lcndaType !== null) { $line(2, '_TYPE', $lcndaType); }
            if (trim((string) ($n['prefix'] ?? '')) !== '') { $line(2, 'NPFX', (string) $n['prefix']); }
            if ($given !== '') { $line(2, 'GIVN', $given); }
            if (trim((string) ($n['middle_name'] ?? '')) !== '') { $line(2, '_MIDN', trim((string) $n['middle_name'])); }
            if ($surname !== '') { $line(2, 'SURN', $surname); }
            if (trim((string) ($n['suffix'] ?? '')) !== '') { $line(2, 'NSFX', (string) $n['suffix']); }
        };
        $writeName($p, null, null);
        foreach ($variants[$pid] ?? [] as $v) {
            if (($v['type'] ?? '') === 'nickname') { $line(2, 'NICK', trim((string) $v['first_name'])); }
        }
        foreach ($variants[$pid] ?? [] as $v) {
            if (($v['type'] ?? '') === 'nickname') { continue; }
            $writeName($v, ($v['type'] ?? '') === 'historical' ? 'married' : 'aka', (string) ($v['type'] ?? 'variant'));
            if (trim((string) ($v['date_text'] ?? '')) !== '') { $line(2, '_DATE', gedcom_date_from_text((string) $v['date_text'])); }
            if (trim((string) ($v['source_note'] ?? '')) !== '') { $line(2, 'NOTE', (string) $v['source_note']); }
        }
        $line(1, 'SEX', match ($p['gender'] ?? 'unknown') { 'male' => 'M', 'female' => 'F', default => 'U' });
        $hasOccu = false;
        foreach ($eventsByPerson[$pid] ?? [] as $e) { if (($e['gedcom_tag'] ?? '') === 'OCCU') { $hasOccu = true; } }
        if (!$hasOccu && trim((string) ($p['occupation'] ?? '')) !== '') { $line(1, 'OCCU', (string) $p['occupation']); }
        if (trim((string) ($p['nationality'] ?? '')) !== '') { $line(1, 'NATI', (string) $p['nationality']); }
        if (trim((string) ($p['physical_description'] ?? '')) !== '') { $line(1, 'DSCR', (string) $p['physical_description']); }
        foreach ($eventsByPerson[$pid] ?? [] as $e) { $writeEvent($e, 'person'); }
        foreach ($famcByChild[$pid] ?? [] as $famId => $c) {
            $line(1, 'FAMC', '@F' . $famId . '@');
            $r1 = (string) ($c['relation_to_partner1'] ?? 'biological'); $r2 = (string) ($c['relation_to_partner2'] ?? 'biological');
            if ($r1 === $r2 && in_array($r1, ['adopted', 'foster'], true)) { $line(2, 'PEDI', $r1); }
        }
        foreach (array_keys($famsBySpouse[$pid] ?? []) as $famId) { $line(1, 'FAMS', '@F' . $famId . '@'); }
        $writeNotes(1, 'person:' . $pid);
        $writeCitations(1, 'person:' . $pid);
        $writeMedia(1, 'person:' . $pid);
    }

    foreach ($families as $f) {
        $fid = (int) $f['id'];
        $people = array_filter([(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0), ...array_keys($childrenByFamily[$fid] ?? [])], static fn($id) => isset($visible[$id]));
        if (!$people) { continue; }
        $line(0, '@F' . $fid . '@', 'FAM');
        if (isset($visible[(int) ($f['partner1_id'] ?? 0)])) { $line(1, 'HUSB', '@I' . (int) $f['partner1_id'] . '@'); }
        if (isset($visible[(int) ($f['partner2_id'] ?? 0)])) { $line(1, 'WIFE', '@I' . (int) $f['partner2_id'] . '@'); }
        foreach ($childrenByFamily[$fid] ?? [] as $childId => $c) {
            if (!isset($visible[$childId])) { continue; }
            $line(1, 'CHIL', '@I' . $childId . '@');
            $rel = static fn(string $r): string => match ($r) { 'adopted' => 'Adopted', 'foster' => 'Foster', 'step' => 'Step', default => 'Natural' };
            $r1 = (string) ($c['relation_to_partner1'] ?? 'biological'); $r2 = (string) ($c['relation_to_partner2'] ?? 'biological');
            if ($r1 !== 'biological' || $r2 !== 'biological') { $line(2, '_FREL', $rel($r1)); $line(2, '_MREL', $rel($r2)); }
        }
        foreach ($eventsByFamily[$fid] ?? [] as $e) { $writeEvent($e, 'family'); }
        $writeNotes(1, 'family:' . $fid);
        $writeCitations(1, 'family:' . $fid);
        $writeMedia(1, 'family:' . $fid);
    }

    foreach ($sources as $sid => $s) {
        $line(0, '@S' . $sid . '@', 'SOUR');
        $line(1, 'TITL', (string) ($s['title'] ?: 'Source sans titre'));
        if (trim((string) ($s['author'] ?? '')) !== '') { $line(1, 'AUTH', (string) $s['author']); }
        if (trim((string) ($s['publication'] ?? '')) !== '') { $line(1, 'PUBL', (string) $s['publication']); }
        if (trim((string) ($s['text'] ?? '')) !== '') { $text(1, 'TEXT', (string) $s['text']); }
        if (trim((string) ($s['url'] ?? '')) !== '') { $line(1, 'WWW', (string) $s['url']); }
        if (trim((string) ($s['source_type'] ?? '')) !== '') { $line(1, '_TYPE', (string) $s['source_type']); }
        $agency = trim((string) ($s['agency'] ?? ''));
        if ($agency !== '') { $line(1, 'REPO', '@R' . $repos[gedcom_fold($agency)]['id'] . '@'); }
        $writeNotes(1, 'source:' . $sid);
        $writeMedia(1, 'source:' . $sid);
    }
    foreach ($repos as $r) {
        $line(0, '@R' . $r['id'] . '@', 'REPO');
        $line(1, 'NAME', $r['name']);
    }
    foreach ($media as $id => $m) {
        $line(0, '@M' . $id . '@', 'OBJE');
        $file = trim((string) ($m['filename'] ?? ''));
        if ($file !== '') {
            $line(1, 'FILE', $file);
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if ($ext !== '') { $line(2, 'FORM', $ext); }
        }
        $line(1, 'TITL', (string) ($m['title'] ?: ($m['document_title'] ?: 'Média')));
        if (trim((string) ($m['date_text'] ?? '')) !== '') { $line(1, 'DATE', gedcom_date_from_text((string) $m['date_text'])); }
        if ($includeNotes && trim((string) ($m['description'] ?? '')) !== '') { $text(1, 'NOTE', (string) $m['description']); }
        $writeNotes(1, 'media:' . $id);
    }
    $line(0, 'TRLR');
    fclose($out);
    exit;
}

// ─── Import ─────────────────────────────────────────────────────────────────────────────────

/** Types d'événements GEDCOM connus en français (complète gedimport_event_labels()). */
function gedcom_extra_event_labels(): array
{
    return ['NATI' => 'Nationalité', 'RELI' => 'Religion', 'TITL' => 'Titre', 'DSCR' => 'Description physique',
        'PROP' => 'Propriété', 'CAST' => 'Rang social', 'FACT' => 'Fait', 'BARM' => 'Bar mitzvah', 'BASM' => 'Bat mitzvah',
        'BLES' => 'Bénédiction', 'CHRA' => 'Baptême d’adulte', 'CONF' => 'Confirmation', 'FCOM' => 'Première communion',
        'ORDN' => 'Ordination', 'PROB' => 'Homologation de testament', 'MARC' => 'Contrat de mariage',
        'MARS' => 'Convention de mariage', 'DIVF' => 'Demande de divorce', 'IDNO' => 'Numéro d’identification'];
}

function gedcom_event_type_id(PDO $pdo, array &$cache, string $scope, string $tag, string $typeLabel): int
{
    $tag = strtoupper($tag);
    $label = trim($typeLabel);
    if ($tag === 'EVEN' && $label === '') { $label = 'Autre événement'; }
    $key = $scope . ':' . $tag . ':' . gedcom_fold($label);
    if (isset($cache[$key])) { return $cache[$key]; }
    $id = null;
    if ($label !== '') {
        // EVEN + TYPE (ou balise inconnue avec TYPE) : on cherche d'abord le type par son libellé.
        $stmt = $pdo->prepare('SELECT id FROM event_types WHERE scope=? AND label=? COLLATE NOCASE ORDER BY id LIMIT 1');
        $stmt->execute([$scope, $label]);
        $id = $stmt->fetchColumn() ?: null;
    }
    if (!$id && $tag !== 'EVEN' && $label === '') {
        $stmt = $pdo->prepare('SELECT id FROM event_types WHERE scope=? AND gedcom_tag=? ORDER BY id LIMIT 1');
        $stmt->execute([$scope, $tag]);
        $id = $stmt->fetchColumn() ?: null;
    }
    if (!$id && $tag !== 'EVEN' && $label === '') {
        // Balise absente de la base (ex. BAPM) : reprendre le type qui porte déjà son nom français (« Baptême »)
        $frLabel = (gedimport_event_labels() + gedcom_extra_event_labels())[$tag] ?? '';
        if ($frLabel !== '') {
            $stmt = $pdo->prepare('SELECT id FROM event_types WHERE scope=? AND label=? COLLATE NOCASE ORDER BY id LIMIT 1');
            $stmt->execute([$scope, $frLabel]);
            $id = $stmt->fetchColumn() ?: null;
        }
    }
    if (!$id) {
        $labels = gedimport_event_labels() + gedcom_extra_event_labels();
        $name = $label !== '' ? $label : ($labels[$tag] ?? (ucfirst(strtolower(ltrim($tag, '_'))) ?: 'Événement'));
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', gedcom_fold($name)) ?: 'evenement', '-') . '-' . bin2hex(random_bytes(3));
        $storedTag = ($label === '' && $tag !== 'EVEN') ? $tag : '';
        $pdo->prepare('INSERT INTO event_types(scope,slug,label,gedcom_tag,icon,color,is_custom,is_active) VALUES(?,?,?,?,?,?,1,1)')
            ->execute([$scope, $slug, $name, $storedTag, 'diamond', '#0066cc']);
        $id = (int) $pdo->lastInsertId();
    }
    $cache[$key] = (int) $id;
    return (int) $id;
}

/** Importe un fichier GEDCOM (.ged) : voir l'en-tête du fichier. $mediaBaseDir : dossier des médias d'une archive GedZip. */
function import_gedcom_into_db(PDO $pdo, string $path, ?string $mediaBaseDir = null): array
{
    $content = file_get_contents($path);
    if ($content === false) { throw new RuntimeException('Lecture du fichier GEDCOM impossible'); }
    $content = preg_replace('/^\xEF\xBB\xBF/', '', $content) ?? $content;
    if (preg_match('/^1 CHAR (.+)/m', $content, $m) && in_array(strtoupper(trim($m[1])), ['ANSEL', 'ANSI', 'IBMPC', 'MSDOS', 'ASCII'], true) && !mb_check_encoding($content, 'UTF-8')) {
        $content = @mb_convert_encoding($content, 'UTF-8', 'Windows-1252') ?: $content;
    }
    $records = gedimport_parse($content);
    $byXref = [];
    foreach ($records as $rec) { if ($rec->xref) { $byXref[$rec->xref] = $rec; } }
    $placeForm = [];
    foreach ($records as $rec) {
        if ($rec->tag === 'HEAD' && ($plac = gedimport_child($rec, 'PLAC')) && ($form = gedimport_child($plac, 'FORM'))) {
            $placeForm = array_map('trim', explode(',', $form->value));
        }
    }
    $unescape = static fn(string $v): string => str_replace('@@', '@', $v);
    $textOf = static fn(stdClass $n): string => trim(gedcom_rtf_to_text($unescape(gedimport_text($n))));
    $noteText = static function (stdClass $n) use ($byXref, $textOf): string {
        $v = trim($n->value);
        if (preg_match('/^@([^@]+)@$/', $v, $m)) { return isset($byXref[$m[1]]) ? $textOf($byXref[$m[1]]) : ''; }
        return $textOf($n);
    };

    $typeCache = []; $placeCache = []; $groupCache = [];
    $personMap = []; $familyMap = []; $sourceMap = []; $mediaMap = [];
    $stats = ['persons' => 0, 'families' => 0, 'children_links' => 0, 'events' => 0, 'marriages' => 0, 'notes' => 0,
        'sources' => 0, 'citations' => 0, 'name_variants' => 0, 'media' => 0, 'media_missing' => 0];

    // Sources et dépôts d'archives
    $insertSource = $pdo->prepare('INSERT INTO sources(source_id,title,author,agency,publication,url,text,source_type) VALUES(?,?,?,?,?,?,?,?)');
    foreach ($records as $rec) {
        if ($rec->tag !== 'SOUR' || !$rec->xref) { continue; }
        $get = static fn(string $tag): string => ($n = gedimport_child($rec, $tag)) ? $textOf($n) : '';
        $agency = '';
        if ($repo = gedimport_child($rec, 'REPO')) {
            $rv = trim($repo->value);
            $agency = preg_match('/^@([^@]+)@$/', $rv, $m) && isset($byXref[$m[1]]) ? (($nm = gedimport_child($byXref[$m[1]], 'NAME')) ? trim($nm->value) : '') : $rv;
        }
        $text = trim(implode("\n\n", array_filter([$get('TEXT'), ...array_map($noteText, gedimport_children($rec, 'NOTE'))])));
        $url = $get('WWW') ?: ($get('_URL') ?: $get('URL'));
        $insertSource->execute([null, $get('TITL') ?: ($get('ABBR') ?: 'Source sans titre'), $get('AUTH'), $agency, $get('PUBL'), $url, $text, $get('_TYPE')]);
        $sourceMap[$rec->xref] = (int) $pdo->lastInsertId();
        $stats['sources']++;
    }
    $insertCitation = $pdo->prepare('INSERT INTO source_links(entity_type,entity_id,source_record_id,page,quality,note) VALUES(?,?,?,?,?,?)');
    $cite = static function (stdClass $node, string $entityType, int $entityId) use ($pdo, $insertCitation, $insertSource, &$sourceMap, &$stats, $noteText, $textOf): void {
        foreach (gedimport_children($node, 'SOUR') as $s) {
            $v = trim($s->value);
            if (preg_match('/^@([^@]+)@$/', $v, $m)) {
                $sourceId = $sourceMap[$m[1]] ?? null;
            } else {
                if ($v === '') { continue; }
                $insertSource->execute([null, mb_substr($textOf($s), 0, 250), '', '', '', '', $textOf($s), '']); // citation sans source séparée
                $sourceId = (int) $pdo->lastInsertId();
                $stats['sources']++;
            }
            if (!$sourceId) { continue; }
            $page = ($p = gedimport_child($s, 'PAGE')) ? $textOf($p) : '';
            $quality = ($q = gedimport_child($s, 'QUAY')) ? trim($q->value) : (($q = gedimport_child($s, '_QUAL')) ? trim($q->value) : '');
            $notes = array_map($noteText, gedimport_children($s, 'NOTE'));
            if (($data = gedimport_child($s, 'DATA')) && ($t = gedimport_child($data, 'TEXT'))) { $notes[] = $textOf($t); }
            $insertCitation->execute([$entityType, $entityId, $sourceId, $page, $quality, trim(implode("\n\n", array_filter($notes)))]);
            $stats['citations']++;
        }
    };

    // Médias : fichier présent sur l'ordinateur (chemin complet), dans l'archive GedZip, ou déjà dans les médias de LCNDA.
    $mediaIndex = $mediaBaseDir !== null ? gedimport_index_media_dir($mediaBaseDir) : [];
    $insertMedia = $pdo->prepare('INSERT INTO media(title,description,media_type,filename,thumbnail,date_text) VALUES(?,?,?,?,?,?)');
    $insertMediaLink = $pdo->prepare('INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(?,?,?,?)');
    $resolveMedia = static function (stdClass $obje) use ($pdo, $byXref, $mediaIndex, $insertMedia, &$mediaMap, &$stats, $textOf, $noteText): ?int {
        $v = trim($obje->value);
        $key = null;
        if (preg_match('/^@([^@]+)@$/', $v, $m)) {
            $key = $m[1];
            if (array_key_exists($key, $mediaMap)) { return $mediaMap[$key]; }
            if (!isset($byXref[$key])) { return null; }
            $obje = $byXref[$key];
        }
        $fileNode = gedimport_child($obje, 'FILE');
        $raw = $fileNode ? trim($fileNode->value) : '';
        $stored = null;
        if ($raw !== '') {
            $path = str_replace('\\', '/', preg_replace('#^file://#', '', rawurldecode($raw)) ?? $raw);
            $path = preg_replace('#^/([A-Za-z]:/)#', '$1', $path) ?? $path; // « file:///C:/… » → « C:/… »
            $name = basename($path);
            $allowed = (bool) preg_match('/\.(jpe?g|png|gif|webp|heic|tiff?|bmp|pdf|mp3|m4a|wav|aiff?|aifc|ogg|mp4|mov|webm)$/i', $name);
            if ($allowed && $mediaIndex) { $stored = gedimport_store_media($mediaIndex, $raw); }
            if (!$stored && $allowed && is_file(MEDIA_DIR . '/' . $name)) { $stored = $name; }          // déjà dans LCNDA
            // Fichier sur l'ordinateur : chemin complet Mac/Linux (« /Users/… ») ou Windows (« C:\Users\… », écrit par Hérédis PC)
            if (!$stored && $allowed && preg_match('#^(/|[A-Za-z]:/)#', $path) && is_file($path)) {
                if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
                $target = bin2hex(random_bytes(16)) . '.' . strtolower(pathinfo($name, PATHINFO_EXTENSION));
                if (@copy($path, MEDIA_DIR . '/' . $target)) { $stored = $target; }
            }
        }
        if (!$stored) {
            if ($raw !== '') { $stats['media_missing']++; }
            if ($key !== null) { $mediaMap[$key] = null; }
            return null;
        }
        $title = ($t = gedimport_child($obje, 'TITL')) ? $textOf($t) : (($fileNode && ($t = gedimport_child($fileNode, 'TITL'))) ? $textOf($t) : '');
        $description = trim(implode("\n\n", array_map($noteText, gedimport_children($obje, 'NOTE'))));
        $date = ($d = gedimport_child($obje, 'DATE')) ? gedcom_date_to_text($d->value) : '';
        $ext = strtolower(pathinfo($stored, PATHINFO_EXTENSION));
        $type = match (true) { in_array($ext, ['pdf'], true) => 'pdf', in_array($ext, ['mp3', 'm4a', 'wav', 'aif', 'aiff', 'aifc', 'ogg'], true) => 'audio', in_array($ext, ['mp4', 'mov', 'webm'], true) => 'video', default => 'image' };
        $insertMedia->execute([$title, $description, $type, $stored, '', $date]);
        $id = (int) $pdo->lastInsertId();
        $stats['media']++;
        if ($key !== null) { $mediaMap[$key] = $id; }
        return $id;
    };
    $linkMedia = static function (stdClass $node, string $entityType, int $entityId) use ($resolveMedia, $insertMediaLink): void {
        $position = 0;
        foreach (gedimport_children($node, 'OBJE') as $o) {
            if (($id = $resolveMedia($o)) !== null) { $insertMediaLink->execute([$id, $entityType, $entityId, $position++]); }
        }
    };

    // Personnes
    $insertPerson = $pdo->prepare('INSERT INTO persons(gedcom_id,unique_id,first_name,middle_name,last_name,prefix,suffix,gender,living_status,surname_group_id,nationality,physical_description) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    $insertVariant = $pdo->prepare('INSERT INTO name_variants(person_id,type,first_name,middle_name,last_name,prefix,suffix,date_text,source_note,position) VALUES(?,?,?,?,?,?,?,?,?,?)');
    $readName = static function (stdClass $n) use ($unescape): array {
        $raw = $unescape(trim(gedimport_text($n)));
        $given = ''; $surname = ''; $suffix = '';
        if (preg_match('/^([^\/]*)\/([^\/]*)\/\s*(.*)$/u', $raw, $m)) { [$given, $surname, $suffix] = [trim($m[1]), trim($m[2]), trim($m[3])]; } else { $given = $raw; }
        $prefix = '';
        foreach (['GIVN' => 'given', 'SURN' => 'surname', 'NSFX' => 'suffix', 'NPFX' => 'prefix'] as $tag => $var) {
            if (($c = gedimport_child($n, $tag)) && trim($c->value) !== '') { $$var = trim($c->value); }
        }
        $middle = '';
        if (($c = gedimport_child($n, '_MIDN')) && ($m = trim($c->value)) !== '' && str_ends_with($given, ' ' . $m)) {
            $middle = $m;
            $given = trim(mb_substr($given, 0, mb_strlen($given) - mb_strlen($m) - 1));
        }
        return ['first' => $given, 'middle' => $middle, 'last' => $surname, 'prefix' => $prefix, 'suffix' => $suffix];
    };
    foreach ($records as $rec) {
        if ($rec->tag !== 'INDI') { continue; }
        $names = gedimport_children($rec, 'NAME');
        $main = $names ? $readName($names[0]) : ['first' => '', 'middle' => '', 'last' => '', 'prefix' => '', 'suffix' => ''];
        $sex = ($s = gedimport_child($rec, 'SEX')) ? strtoupper(trim($s->value)) : '';
        $gender = match ($sex) { 'M' => 'male', 'F' => 'female', default => 'unknown' };
        $nati = ''; $dscr = '';
        $insertPerson->execute([$rec->xref, $rec->xref, $main['first'], $main['middle'], $main['last'], $main['prefix'], $main['suffix'], $gender, 'unknown',
            gedimport_group_id($pdo, $groupCache, $main['last']), $nati, $dscr]);
        $pid = (int) $pdo->lastInsertId();
        $personMap[$rec->xref] = $pid;
        $stats['persons']++;
        $position = 0;
        foreach ($names as $i => $n) {
            if ($i === 0) {
                foreach (gedimport_children($n, 'NICK') as $nick) {
                    if (trim($nick->value) !== '') { $insertVariant->execute([$pid, 'nickname', trim($nick->value), '', '', '', '', '', '', $position++]); $stats['name_variants']++; }
                }
                continue;
            }
            $v = $readName($n);
            $gedType = ($t = gedimport_child($n, 'TYPE')) ? strtolower(trim($t->value)) : '';
            $lcndaType = ($t = gedimport_child($n, '_TYPE')) ? trim($t->value) : ($gedType === 'married' ? 'historical' : 'variant');
            $date = ($d = gedimport_child($n, '_DATE') ?: gedimport_child($n, 'DATE')) ? gedcom_date_to_text($d->value) : '';
            $note = trim(implode("\n", array_map($noteText, gedimport_children($n, 'NOTE'))));
            $insertVariant->execute([$pid, $lcndaType, $v['first'], $v['middle'], $v['last'], $v['prefix'], $v['suffix'], $date, $note, $position++]);
            $stats['name_variants']++;
        }
    }

    // Événements (personnes et familles) et notes
    $insertEvent = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id,address,title,description,cause,agency) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    $insertNote = $pdo->prepare('INSERT INTO notes(entity_type,entity_id,title,body) VALUES(?,?,?,?)');
    $personTags = array_merge(GEDCOM_PERSON_EVENT_TAGS, GEDCOM_PERSON_ATTRIBUTE_TAGS, ['EVEN']);
    $familyTags = array_merge(GEDCOM_FAMILY_EVENT_TAGS, ['EVEN']);
    $isEventNode = static fn(stdClass $c, array $known): bool => in_array($c->tag, $known, true)
        || (!in_array($c->tag, GEDCOM_STRUCTURAL_TAGS, true) && (gedimport_child($c, 'DATE') || gedimport_child($c, 'PLAC') || gedimport_child($c, 'TYPE')));
    $importEvent = static function (stdClass $c, string $scope, ?int $personId, ?int $familyId) use ($pdo, &$typeCache, &$placeCache, $placeForm, $insertEvent, $insertNote, $cite, $linkMedia, $noteText, $textOf, $unescape, &$stats): void {
        $type = ($t = gedimport_child($c, 'TYPE')) ? trim($textOf($t)) : '';
        $typeId = gedcom_event_type_id($pdo, $typeCache, $scope, $c->tag, $c->tag === 'EVEN' || !in_array($c->tag, array_merge(GEDCOM_PERSON_EVENT_TAGS, GEDCOM_PERSON_ATTRIBUTE_TAGS, GEDCOM_FAMILY_EVENT_TAGS), true) ? $type : '');
        $dateRaw = ($d = gedimport_child($c, 'DATE')) ? trim($d->value) : '';
        $date = gedcom_date_to_text($dateRaw);
        $placeId = ($p = gedimport_child($c, 'PLAC')) ? gedcom_import_place_id($pdo, $placeCache, $p, $placeForm) : null;
        $value = trim($unescape($c->value));
        $title = ($t = gedimport_child($c, '_TITL')) ? $textOf($t) : (in_array(strtoupper($value), ['Y', 'YES'], true) ? '' : $value);
        if ($type !== '' && in_array($c->tag, GEDCOM_PERSON_ATTRIBUTE_TAGS, true) && $title === '') { $title = $type; }
        $address = ($a = gedimport_child($c, 'ADDR')) ? $textOf($a) : '';
        $agency = ($a = gedimport_child($c, 'AGNC')) ? $textOf($a) : '';
        $cause = ($a = gedimport_child($c, 'CAUS')) ? $textOf($a) : '';
        $notes = array_values(array_filter(array_map($noteText, gedimport_children($c, 'NOTE'))));
        $insertEvent->execute([$scope, $personId, $familyId, $typeId, $date, gedcom_year($date), $placeId, $address, $title, $notes[0] ?? '', $cause, $agency]);
        $eventId = (int) $pdo->lastInsertId();
        foreach (array_slice($notes, 1) as $extra) { $insertNote->execute(['event', $eventId, '', $extra]); $stats['notes']++; }
        $cite($c, 'event', $eventId);
        $linkMedia($c, 'event', $eventId);
        $stats['events']++;
        if ($c->tag === 'MARR') { $stats['marriages']++; }
    };
    foreach ($records as $rec) {
        if ($rec->tag !== 'INDI' || !isset($personMap[$rec->xref])) { continue; }
        $pid = $personMap[$rec->xref];
        $nati = ''; $dscr = '';
        foreach ($rec->children as $c) {
            if ($c->tag === 'NOTE') {
                if (($body = $noteText($c)) !== '') { $insertNote->execute(['person', $pid, '', $body]); $stats['notes']++; }
            } elseif ($c->tag === 'DSCR' && !gedimport_child($c, 'DATE') && !gedimport_child($c, 'PLAC')) {
                $dscr = trim($unescape(gedimport_text($c)));
            } elseif ($c->tag === 'NATI' && !gedimport_child($c, 'DATE') && !gedimport_child($c, 'PLAC')) {
                $nati = trim($unescape($c->value));
            } elseif ($isEventNode($c, $personTags)) {
                $importEvent($c, 'person', $pid, null);
            }
        }
        if ($nati !== '' || $dscr !== '') { $pdo->prepare('UPDATE persons SET nationality=?,physical_description=? WHERE id=?')->execute([$nati, $dscr, $pid]); }
        $cite($rec, 'person', $pid);
        $linkMedia($rec, 'person', $pid);
    }

    // Familles, enfants (avec adoptions) et événements familiaux
    $insertFamily = $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)');
    $insertChild = $pdo->prepare('INSERT INTO family_children(family_id,child_id,relation_to_partner1,relation_to_partner2,position) VALUES(?,?,?,?,?)');
    $relation = static fn(string $v): string => match (true) {
        (bool) preg_match('/adopt/i', $v) => 'adopted',
        (bool) preg_match('/foster|nourric|accueil/i', $v) => 'foster',
        (bool) preg_match('/step|beau|belle/i', $v) => 'step',
        default => 'biological',
    };
    $pediByChild = [];
    foreach ($records as $rec) {
        if ($rec->tag !== 'INDI') { continue; }
        $fil = ($f = gedimport_child($rec, '_FIL')) ? $relation($f->value) : 'biological';
        foreach (gedimport_children($rec, 'FAMC') as $famc) {
            $pedi = ($p = gedimport_child($famc, 'PEDI')) ? $relation($p->value) : $fil;
            $pediByChild[$rec->xref][trim($famc->value, '@ ')] = $pedi;
        }
    }
    foreach ($records as $rec) {
        if ($rec->tag !== 'FAM') { continue; }
        $husb = ($h = gedimport_child($rec, 'HUSB')) ? ($personMap[trim($h->value, '@ ')] ?? null) : null;
        $wife = ($w = gedimport_child($rec, 'WIFE')) ? ($personMap[trim($w->value, '@ ')] ?? null) : null;
        $insertFamily->execute([$husb, $wife]);
        $fid = (int) $pdo->lastInsertId();
        $familyMap[(string) $rec->xref] = $fid;
        $stats['families']++;
        $position = 0;
        foreach (gedimport_children($rec, 'CHIL') as $chil) {
            $xref = trim($chil->value, '@ ');
            if (!isset($personMap[$xref])) { continue; }
            $base = $pediByChild[$xref][(string) $rec->xref] ?? 'biological';
            $r1 = ($n = gedimport_child($chil, '_FREL')) ? $relation($n->value) : $base;
            $r2 = ($n = gedimport_child($chil, '_MREL')) ? $relation($n->value) : $base;
            $insertChild->execute([$fid, $personMap[$xref], $r1, $r2, $position++]);
            $stats['children_links']++;
        }
        foreach ($rec->children as $c) {
            if ($c->tag === 'NOTE') {
                if (($body = $noteText($c)) !== '') { $insertNote->execute(['family', $fid, '', $body]); $stats['notes']++; }
            } elseif ($isEventNode($c, $familyTags)) {
                $importEvent($c, 'family', null, $fid);
            }
        }
        $cite($rec, 'family', $fid);
        $linkMedia($rec, 'family', $fid);
    }

    $pdo->exec("UPDATE persons SET living_status='deceased' WHERE living_status='unknown' AND id IN (SELECT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('DEAT','BURI','CREM'))");
    gedimport_rebuild_search($pdo);
    return ['format' => 'gedcom'] + $stats;
}
