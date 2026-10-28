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
const GEDCOM_REPUBLICAN_MONTHS = ['VEND', 'BRUM', 'FRIM', 'NIVO', 'PLUV', 'VENT', 'GERM', 'FLOR', 'PRAI', 'MESS', 'THER', 'FRUC', 'COMP'];
const GEDCOM_FR_REPUBLICAN_MONTHS = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jours complémentaires'];
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
    '_FSFTID', '_TIME', '_STAT', '_KIND', '_PET', '_LABEL', '_TITL', '_CAL', '_COLR'];

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
    // double année (calendrier julien, avant le changement de début d'année) : « 11 février 1700/01 » → « 11 FEB 1700/01 »
    if (preg_match('/^(.*\d{3,4})\/(\d{1,2})$/u', $t, $dual)) { $c = gedcom_date_core($dual[1]); return $c !== null ? $c . '/' . str_pad($dual[2], 2, '0', STR_PAD_LEFT) : null; }
    $t = preg_replace('/^(le|du|au)\s+/iu', '', $t) ?? $t;
    $t = preg_replace('/^(\d{1,2})\s*(er|e)\b/iu', '$1', $t) ?? $t;
    if (preg_match('/^(.+?)\s*(?:av\.?\s*J\.?-?C\.?|avant J\.?-?C\.?|B\.?C\.?)$/iu', $t, $bc)) { $c = gedcom_date_core($bc[1]); return $c !== null ? $c . ' B.C.' : null; }
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
    // CAL et EST d'abord : « ca » de « vers » ne doit pas avaler « calculé »
    $qualifiers = [
        'CAL' => '/^(?:calculée?|calcul[ée]e?|cal\.)\s*/iu',
        'EST' => '/^(?:estimée?|estime|est\.)\s*/iu',
        'ABT' => '/^(?:vers|environ|env\.?|circa|ca\.?|c\.|~|autour de|about|abt\.?)(?=[\s\d]|$)\s*/iu',
        'BEF' => '/^(?:avant|av\.?|before|bef\.?)\s+/iu',
        'AFT' => '/^(?:après|apres|ap\.?|after|aft\.?)\s+/iu',
        'FROM' => '/^depuis\s+/iu',
        'TO' => '/^jusqu[’\']?\s*(?:à|a|au|en)\s+/iu',
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
    $calendar = gedcom_date_calendar($core);
    $core = trim(preg_replace('/^(?:@#D[^@]*@|(?:JULIAN|GREGORIAN|FRENCH_R|HEBREW)(?=\s))\s*/', '', $core) ?? $core);
    if ($calendar === 'republican' && preg_match('/^(?:(\d{1,2})\s+)?(?:([A-Z]{4})\s+)?(\d{1,2})$/i', $core, $m)) {
        $month = $m[2] !== '' ? array_search(strtoupper($m[2]), GEDCOM_REPUBLICAN_MONTHS, true) : false;
        if ($m[2] !== '' && $month === false) { return $core; }
        $name = $month === false ? '' : ($month === 12 ? ((int) $m[1] > 1 ? 'jours complémentaires' : 'jour complémentaire') : GEDCOM_FR_REPUBLICAN_MONTHS[$month]);
        return trim(($m[1] !== '' ? (int) $m[1] . ' ' : '') . ($name !== '' ? $name . ' ' : '') . 'an ' . gedcom_roman((int) $m[3]));
    }
    if (preg_match('/^(?:(\d{1,2})\s+)?(?:([A-Z]{3,4})\s+)?(-?\d{1,4})(\/\d{1,2})?(\s+B\.?C\.?)?$/i', $core, $m)) {
        $month = $m[2] !== '' ? array_search(strtoupper($m[2]), GEDCOM_MONTHS, true) : false;
        if ($m[2] !== '' && $month === false) { return $core; }
        return trim(($m[1] !== '' ? (int) $m[1] . ' ' : '') . ($month !== false ? GEDCOM_FR_MONTHS[$month] . ' ' : '') . $m[3] . ($m[4] ?? '') . (!empty($m[5]) ? ' av. J.-C.' : ''));
    }
    return $core;
}

/** Calendrier indiqué dans une date GEDCOM (« @#DJULIAN@ … », « @#DFRENCH R@ … », GEDCOM 7 « JULIAN … ») : gregorian par défaut. */
function gedcom_date_calendar(string $value): string
{
    if (preg_match('/@#D\s*FRENCH\s*R\s*@|\bFRENCH_R\b/i', $value)) { return 'republican'; }
    if (preg_match('/@#D\s*JULIAN\s*@|\bJULIAN\b/i', $value)) { return 'julian'; }
    if (preg_match('/@#D\s*HEBREW\s*@|\bHEBREW\b/i', $value)) { return 'hebrew'; }
    return 'gregorian';
}

/** 2 → « II » (années du calendrier républicain) */
function gedcom_roman(int $n): string
{
    $o = '';
    foreach (['X' => 10, 'IX' => 9, 'V' => 5, 'IV' => 4, 'I' => 1] as $r => $v) { while ($n >= $v) { $o .= $r; $n -= $v; } }
    return $o !== '' ? $o : (string) $n;
}

/** « II » → 2, « 12 » → 12 */
function gedcom_roman_value(string $v): int
{
    if (ctype_digit($v)) { return (int) $v; }
    $map = ['I' => 1, 'V' => 5, 'X' => 10, 'L' => 50]; $total = 0; $prev = 0;
    foreach (array_reverse(str_split(strtoupper($v))) as $ch) { $n = $map[$ch] ?? 0; $total += $n < $prev ? -$n : $n; $prev = max($prev, $n); }
    return $total;
}

/** « 15 brumaire an II » → « 15 BRUM 2 » (sans l'escape), ou null. */
function gedcom_republican_core(string $text): ?string
{
    $t = mb_strtolower(trim(ascii_fold($text)));
    $t = preg_replace('/^(le|du|au)\s+/u', '', $t) ?? $t;
    if (preg_match('/^(?:(\d{1,2})(?:er|e)?\s+)?(?:(jours?\s+complementaires?|sans-?culottides?|[a-z]+)\s+)?(?:de\s+)?(?:l[\'’]\s*)?an\s+([ivxl]+|\d{1,2})$/u', $t, $m)) {
        $month = '';
        if (($m[2] ?? '') !== '') {
            $i = preg_match('/compl|culott/', $m[2]) ? 12 : array_search($m[2], array_map(static fn($x) => ascii_fold($x), GEDCOM_FR_REPUBLICAN_MONTHS), true);
            if ($i === false) { return null; }
            $month = GEDCOM_REPUBLICAN_MONTHS[$i];
        }
        $year = gedcom_roman_value($m[3]);
        if ($year < 1) { return null; }
        return trim((($m[1] ?? '') !== '' ? (int) $m[1] . ' ' : '') . ($month !== '' ? $month . ' ' : '') . $year);
    }
    return null;
}

/**
 * Date d'un événement pour l'export, avec l'escape de son calendrier : « @#DJULIAN@ 11 FEB 1700/01 »,
 * « @#DFRENCH R@ 15 BRUM 2 » (GEDCOM 7 : « JULIAN … », « FRENCH_R … »). Autre calendrier : la date en clair.
 */
function gedcom_date_out(string $text, string $calendar, string $version = '5.5.1'): string
{
    $calendar = $calendar !== '' ? $calendar : 'gregorian';
    if ($calendar === 'republican') {
        $t = trim($text); $qual = '';
        foreach (['ABT' => '/^(?:vers|environ|env\.?|circa|ca\.?)\s+/iu', 'BEF' => '/^(?:avant|av\.)\s+/iu', 'AFT' => '/^(?:après|apres|ap\.)\s+/iu'] as $g => $re) {
            if (preg_match($re, $t)) { $qual = $g . ' '; $t = preg_replace($re, '', $t) ?? $t; break; }
        }
        $core = gedcom_republican_core($t);
        if ($core === null) { return '(' . trim($text) . ')'; }
        return $qual . ($version === '7' ? 'FRENCH_R ' : '@#DFRENCH R@ ') . $core;
    }
    $g = gedcom_date_from_text($text);
    if ($calendar === 'julian' && $g !== '' && $g[0] !== '(') {
        $esc = $version === '7' ? 'JULIAN ' : '@#DJULIAN@ ';
        return preg_replace('/(^|\b(?:BET|AND|FROM|TO|ABT|EST|CAL|BEF|AFT)\s+)(?=\d|[A-Z]{3}\s+\d)/', '$1' . $esc, $g) ?? $g;
    }
    if ($calendar !== 'gregorian' && $calendar !== 'julian' && $g !== '' && $g[0] !== '(') { return '(' . trim($text) . ')'; }
    return $g;
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
    $filename = 'genealogie-' . (($_GET['branch_mode'] ?? '') !== '' ? 'branche-' : '') . date('Ymd-His') . '.ged';
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $out = fopen('php://output', 'w');
    $escape = static fn(string $v): string => str_starts_with($v, '@') && !preg_match('/^@[^@]+@$/', $v) && !str_starts_with($v, '@#D') ? '@' . $v : $v; // « @#DJULIAN@ » : escape de calendrier, gardé tel quel
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

    $allPersons = $pdo->query(person_select() . ' ORDER BY p.id')->fetchAll();
    $families = $pdo->query('SELECT * FROM families ORDER BY id')->fetchAll();
    // Une seule branche (ascendants d'une personne, ou descendants d'un couple) au lieu de toute la base
    $branch = gedcom_branch_ids($pdo);
    $keptFamilies = null;
    if ($branch !== null) {
        $kids = [];
        foreach ($pdo->query('SELECT family_id, child_id FROM family_children') as $c) { $kids[(int) $c['family_id']][] = (int) $c['child_id']; }
        $allPersons = array_values(array_filter($allPersons, static fn($p) => isset($branch[(int) $p['id']])));
        $families = array_values(array_filter($families, static function ($f) use ($branch, $kids) {
            $members = array_filter([(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0), ...($kids[(int) $f['id']] ?? [])], static fn($id) => isset($branch[$id]));
            return count($members) >= 2;
        }));
        $keptFamilies = array_fill_keys(array_map(static fn($f) => (int) $f['id'], $families), true);
    }
    // « Pour partager » (ou mode confidentialité) : les vivants, même probables, et les fiches confidentielles restent dans
    // l'arbre mais anonymes (« Personne vivante », sexe et liens familiaux seulement), pour que les branches se rejoignent.
    $share = export_option_enabled('share', false) || export_privacy_enabled();
    $hidden = $share ? gedcom_share_hidden($pdo, $allPersons, $families) : [];
    $persons = $share ? $allPersons : array_values(array_filter($allPersons, 'export_person_allowed'));
    $visible = array_fill_keys(array_map(static fn($p) => (int) $p['id'], $persons), true);
    $genderById = [];
    foreach ($allPersons as $gp) { $genderById[(int) $gp['id']] = (string) ($gp['gender'] ?? 'unknown'); }
    $childrenByFamily = []; $famcByChild = []; $famsBySpouse = [];
    foreach ($families as $f) {
        foreach (['partner1_id', 'partner2_id'] as $k) { if ((int) ($f[$k] ?? 0) > 0) { $famsBySpouse[(int) $f[$k]][(int) $f['id']] = true; } }
    }
    foreach ($pdo->query('SELECT * FROM family_children ORDER BY family_id,position,id') as $c) {
        if ($keptFamilies !== null && !isset($keptFamilies[(int) $c['family_id']])) { continue; }
        $childrenByFamily[(int) $c['family_id']][(int) $c['child_id']] = $c;
        $famcByChild[(int) $c['child_id']][(int) $c['family_id']] = $c;
    }
    $events = $pdo->query("SELECT e.*,t.gedcom_tag,t.label AS type_label,pl.name AS place_name,pl.subdivision,pl.county,pl.state,pl.country,pl.latitude,pl.longitude
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        ORDER BY COALESCE(e.sort_date,''),COALESCE(e.year,9999),e.id")->fetchAll();
    $hiddenFamily = [];
    foreach ($families as $f) { if (isset($hidden[(int) ($f['partner1_id'] ?? 0)]) || isset($hidden[(int) ($f['partner2_id'] ?? 0)])) { $hiddenFamily[(int) $f['id']] = true; } }
    $eventsByPerson = []; $eventsByFamily = []; $hiddenEvent = [];
    foreach ($events as $e) {
        $pidE = (int) ($e['person_id'] ?? 0); $fidE = (int) ($e['family_id'] ?? 0);
        if (($pidE && isset($hidden[$pidE])) || ($fidE && isset($hiddenFamily[$fidE]))) { $hiddenEvent[(int) $e['id']] = true; continue; }
        if (($e['scope'] ?? '') === 'person' && $pidE > 0 && isset($visible[$pidE])) { $eventsByPerson[$pidE][] = $e; }
        if (($e['scope'] ?? '') === 'family' && $fidE > 0) { $eventsByFamily[$fidE][] = $e; }
    }
    // Cible d'une note, d'une citation ou d'un média appartenant à une personne masquée : jamais exportée
    $secret = static fn(string $type, int $id): bool => ($type === 'person' && isset($hidden[$id])) || ($type === 'event' && isset($hiddenEvent[$id])) || ($type === 'family' && isset($hiddenFamily[$id]));
    $notesByTarget = [];
    if ($includeNotes) {
        foreach ($pdo->query('SELECT entity_type,entity_id,title,body FROM notes ORDER BY id') as $n) {
            $body = trim((string) $n['body']); $title = trim((string) $n['title']);
            if (($body === '' && $title === '') || $secret((string) $n['entity_type'], (int) $n['entity_id'])) { continue; }
            // le titre reste lisible par les autres logiciels (1re ligne) et LCNDA le relit à part (_TITL)
            $notesByTarget[$n['entity_type'] . ':' . (int) $n['entity_id']][] = ['title' => $title, 'body' => $title !== '' ? ($body !== '' ? $title . "\n" . $body : $title) : $body];
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
            if (isset($sources[(int) $l['source_record_id']]) && !$secret((string) $l['entity_type'], (int) $l['entity_id'])) { $citations[$l['entity_type'] . ':' . (int) $l['entity_id']][] = $l; }
        }
        if ($hidden) { // une source citée SEULEMENT par des personnes masquées n'est pas exportée
            $cited = [];
            foreach ($citations as $list) { foreach ($list as $l) { $cited[(int) $l['source_record_id']] = true; } }
            $linkedElsewhere = $pdo->query("SELECT DISTINCT source_record_id FROM source_links WHERE source_record_id IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
            $allCited = array_fill_keys(array_map('intval', $linkedElsewhere), true);
            foreach (array_keys($sources) as $sid) { if (isset($allCited[$sid]) && !isset($cited[$sid])) { unset($sources[$sid]); } }
        }
    }
    $mediaByTarget = []; $media = [];
    if ($includeMedia) {
        // Seulement les médias d'une fiche, d'une famille, d'un événement ou d'une source qui part dans le fichier
        // (pas ceux des vivants exclus, ni ceux d'une autre branche)
        $keptFam = []; foreach ($families as $f) { if (!isset($hiddenFamily[(int) $f['id']])) { $keptFam[(int) $f['id']] = true; } }
        $eventOwner = []; foreach ($events as $e) { $eventOwner[(int) $e['id']] = [(int) ($e['person_id'] ?? 0), (int) ($e['family_id'] ?? 0)]; }
        $exported = static function (string $type, int $id) use ($visible, $keptFam, $eventOwner, $sources, $hidden): bool {
            if ($type === 'person') { return isset($visible[$id]) && !isset($hidden[$id]); }
            if ($type === 'family') { return isset($keptFam[$id]); }
            if ($type === 'event') { [$p, $f] = $eventOwner[$id] ?? [0, 0]; return ($p && isset($visible[$p]) && !isset($hidden[$p])) || ($f && isset($keptFam[$f])); }
            if ($type === 'source') { return isset($sources[$id]); }
            return false;
        };
        foreach ($pdo->query('SELECT ml.entity_type,ml.entity_id,ml.media_id,m.* FROM media_links ml JOIN media m ON m.id=ml.media_id ORDER BY ml.position,ml.id') as $m) {
            if ($secret((string) $m['entity_type'], (int) $m['entity_id']) || !$exported((string) $m['entity_type'], (int) $m['entity_id'])) { continue; }
            $mediaByTarget[$m['entity_type'] . ':' . (int) $m['entity_id']][] = (int) $m['media_id'];
            $media[(int) $m['media_id']] = $m;
        }
    }
    $variants = [];
    foreach ($pdo->query('SELECT * FROM name_variants ORDER BY person_id,position,id') as $v) { $variants[(int) $v['person_id']][] = $v; }

    $writeNotes = static function (int $level, string $target) use ($notesByTarget, $text, $line): void {
        foreach ($notesByTarget[$target] ?? [] as $n) {
            $text($level, 'NOTE', $n['body']);
            if ($n['title'] !== '') { $line($level + 1, '_TITL', $n['title']); }
        }
    };
    // Étiquettes (balise propre à LCNDA, relue à l'import) : « 1 _LABEL Poilu » + « 2 _COLR #cc0000 »
    $labelsByTarget = [];
    foreach ($pdo->query("SELECT ll.entity_type,ll.entity_id,l.name,l.color FROM label_links ll JOIN labels l ON l.id=ll.label_id WHERE ll.entity_type IN ('person','family','event') ORDER BY l.name,l.id") as $l) {
        if (!$secret((string) $l['entity_type'], (int) $l['entity_id'])) { $labelsByTarget[$l['entity_type'] . ':' . (int) $l['entity_id']][] = $l; }
    }
    $writeLabels = static function (int $level, string $target) use ($labelsByTarget, $line): void {
        foreach ($labelsByTarget[$target] ?? [] as $l) {
            $line($level, '_LABEL', (string) $l['name']);
            if (trim((string) ($l['color'] ?? '')) !== '') { $line($level + 1, '_COLR', (string) $l['color']); }
        }
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
    $writeEvent = static function (array $e, string $scope) use ($line, $text, $writeNotes, $writeCitations, $writeMedia, $writeLabels, $includeNotes, $version): void {
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
        $calendar = (string) ($e['date_calendar'] ?? 'gregorian');
        $date = trim((string) ($e['date_text'] ?? '')) !== '' ? gedcom_date_out((string) $e['date_text'], $calendar, $version) : (string) ($e['year'] ?? '');
        if ($date !== '') {
            $line(2, 'DATE', $date);
            // calendrier sans escape GEDCOM (musulman, juif…) : gardé pour le retour dans LCNDA
            if (!in_array($calendar, ['', 'gregorian', 'julian', 'republican'], true)) { $line(3, '_CAL', $calendar); }
        }
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
        $writeLabels(2, 'event:' . (int) $e['id']);
    };

    foreach ($persons as $p) {
        $pid = (int) $p['id'];
        $line(0, '@I' . $pid . '@', 'INDI');
        if (isset($hidden[$pid])) {
            $line(1, 'NAME', $hidden[$pid] === 'private' ? 'Fiche /confidentielle/' : 'Personne /vivante/');
            $line(1, 'SEX', match ($p['gender'] ?? 'unknown') { 'male' => 'M', 'female' => 'F', default => 'U' });
            foreach (array_keys($famcByChild[$pid] ?? []) as $famId) { $line(1, 'FAMC', '@F' . $famId . '@'); }
            foreach (array_keys($famsBySpouse[$pid] ?? []) as $famId) { $line(1, 'FAMS', '@F' . $famId . '@'); }
            continue;
        }
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
        if (($p['kind'] ?? 'human') === 'animal') { // fiche d'animal (balises LCNDA, relues à l'import) : l'espèce, la race, la puce… dans _PET
            $line(1, '_KIND', 'animal');
            try { $petStmt ??= $pdo->prepare('SELECT data_json FROM pets WHERE person_id=? ORDER BY id LIMIT 1'); $petStmt->execute([$pid]); $pj = (string) $petStmt->fetchColumn(); $petStmt->closeCursor(); }
            catch (Throwable) { $pj = ''; }
            if ($pj !== '' && $pj !== '{}' && is_array(json_decode($pj, true))) { $text(2, '_PET', $pj); }
        }
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
        $writeLabels(1, 'person:' . $pid);
    }

    foreach ($families as $f) {
        $fid = (int) $f['id'];
        $people = array_filter([(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0), ...array_keys($childrenByFamily[$fid] ?? [])], static fn($id) => isset($visible[$id]));
        if (!$people) { continue; }
        $line(0, '@F' . $fid . '@', 'FAM');
        // HUSB = l'homme, WIFE = la femme, quel que soit l'ordre dans la base ; sinon (même sexe, inconnu) l'ordre de la base
        [$husb, $wife] = [(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0)];
        $g1 = $genderById[$husb] ?? 'unknown'; $g2 = $genderById[$wife] ?? 'unknown';
        if (($g1 === 'female' && $g2 !== 'female') || ($g2 === 'male' && $g1 !== 'male')) { [$husb, $wife] = [$wife, $husb]; }
        if ($husb && isset($visible[$husb])) { $line(1, 'HUSB', '@I' . $husb . '@'); }
        if ($wife && isset($visible[$wife])) { $line(1, 'WIFE', '@I' . $wife . '@'); }
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
        $writeLabels(1, 'family:' . $fid);
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

/**
 * Texte d'un fichier GEDCOM → UTF-8, d'après sa ligne « 1 CHAR » : ANSEL (accents écrits avant la lettre),
 * IBMPC / MSDOS (CP850), MACINTOSH (MacRoman), UTF-16 (CHAR UNICODE) ; sinon, si ce n'est pas de l'UTF-8 valide,
 * Windows-1252. La marque BOM est retirée.
 */
/** L'encodage d'origine d'un GEDCOM (affiché dans l'analyse) */
function gedcom_detect_encoding(string $text): string
{
    if (str_starts_with($text, "\xFF\xFE") || str_starts_with($text, "\xFE\xFF") || (strlen($text) > 3 && ($text[0] === "\0" || $text[1] === "\0"))) { return 'UTF-16'; }
    if (str_starts_with($text, "\xEF\xBB\xBF") || mb_check_encoding($text, 'UTF-8')) { return 'UTF-8'; }
    $char = preg_match('/^1 CHAR (.+)/m', $text, $m) ? strtoupper(trim($m[1])) : '';
    if ($char === 'ANSEL') { return gedcom_ansel_mismatch($text) ? GEDCOM_ANSEL_LATIN1 : 'ANSEL'; }
    if (in_array($char, ['IBMPC', 'MSDOS', 'IBM PC', 'CP850', 'DOS'], true)) { return 'MS-DOS (CP850)'; }
    if (in_array($char, ['MACINTOSH', 'MAC', 'MACROMAN'], true)) { return 'Mac Roman'; }
    return 'Windows-1252';
}

function gedcom_text_to_utf8(string $text): string
{
    if (str_starts_with($text, "\xFF\xFE") || str_starts_with($text, "\xFE\xFF") || (strlen($text) > 3 && ($text[0] === "\0" || $text[1] === "\0"))) {
        $enc = str_starts_with($text, "\xFE\xFF") || $text[0] === "\0" ? 'UTF-16BE' : 'UTF-16LE';
        $text = (string) @mb_convert_encoding(preg_replace('/^(\xFF\xFE|\xFE\xFF)/', '', $text), 'UTF-8', $enc);
    }
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
    if (mb_check_encoding($text, 'UTF-8')) { return $text; }
    $char = preg_match('/^1 CHAR (.+)/m', $text, $m) ? strtoupper(trim($m[1])) : '';
    if ($char === 'ANSEL' && !gedcom_ansel_mismatch($text)) { return gedcom_ansel_to_utf8($text); }
    if (in_array($char, ['IBMPC', 'MSDOS', 'IBM PC', 'CP850', 'DOS'], true)) { $out = @mb_convert_encoding($text, 'UTF-8', 'CP850'); if (is_string($out)) { return $out; } }
    if (in_array($char, ['MACINTOSH', 'MAC', 'MACROMAN'], true) && function_exists('iconv')) { $out = @iconv('MACINTOSH', 'UTF-8//TRANSLIT', $text); if (is_string($out) && $out !== '') { return $out; } }
    return (string) @mb_convert_encoding($text, 'UTF-8', 'Windows-1252');
}

const GEDCOM_ANSEL_LATIN1 = 'Windows-1252 (le fichier annonce ANSEL, mais ses accents sont en Latin-1)';
/** Le message de l'analyse quand « 1 CHAR ANSEL » est faux (fichier en Latin-1 / Windows-1252) */
const GEDCOM_ANSEL_LATIN1_WARNING = 'Le fichier annonce « CHAR ANSEL », mais ses accents sont écrits en Latin-1 (Windows) : il est lu en Windows-1252, pour garder « René », « Léa », « François »… tels quels.';

/**
 * « 1 CHAR ANSEL » mais ce n'est pas de l'ANSEL valable (souvent du Latin-1 ou du Windows-1252) : en ANSEL, un octet
 * 0xE0–0xFE est un accent posé AVANT une lettre ; un accent suivi d'une espace, d'un chiffre, d'une ponctuation ou de
 * la fin de ligne (« René », « née »), ou un octet qui n'existe pas en ANSEL (0x80–0x9F, 0xC9–0xCC, 0xD0–0xDF, 0xFC, 0xFD, 0xFF),
 * montre que le fichier est en Latin-1. Quelques erreurs dans un vrai ANSEL ne le font pas changer.
 */
function gedcom_ansel_mismatch(string $text): bool
{
    $bad = 0; $good = 0; $n = min(strlen($text), 4_000_000);
    for ($i = 0; $i < $n; $i++) {
        $b = ord($text[$i]); if ($b < 0x80) { continue; }
        if (($b >= 0x80 && $b <= 0x9F && !in_array($b, [0x88, 0x89, 0x8D, 0x8E], true)) || ($b >= 0xC9 && $b <= 0xCC) || ($b >= 0xD0 && $b <= 0xDF) || in_array($b, [0xAF, 0xBB, 0xFC, 0xFD, 0xFF], true)) { $bad++; continue; }
        if ($b >= 0xE0) {
            $next = $i + 1 < $n ? ord($text[$i + 1]) : 0x0A;
            if (($next >= 0x41 && $next <= 0x5A) || ($next >= 0x61 && $next <= 0x7A) || $next >= 0xE0) { $good++; } else { $bad++; }
        }
    }
    return $bad > 0 && $bad >= max(1, $good * 0.1);
}

/** ANSEL (Z39.47, avec les ajouts GEDCOM) : les accents sont écrits AVANT la lettre qu'ils portent. */
function gedcom_ansel_to_utf8(string $text): string
{
    static $special = [0xA1 => 'Ł', 0xA2 => 'Ø', 0xA3 => 'Đ', 0xA4 => 'Þ', 0xA5 => 'Æ', 0xA6 => 'Œ', 0xA7 => 'ʹ', 0xA8 => '·', 0xA9 => '♭', 0xAA => '®', 0xAB => '±', 0xAC => 'Ơ', 0xAD => 'Ư', 0xAE => 'ʼ',
        0xB0 => 'ʻ', 0xB1 => 'ł', 0xB2 => 'ø', 0xB3 => 'đ', 0xB4 => 'þ', 0xB5 => 'æ', 0xB6 => 'œ', 0xB7 => 'ʺ', 0xB8 => 'ı', 0xB9 => '£', 0xBA => 'ð', 0xBC => 'ơ', 0xBD => 'ư', 0xBE => '□', 0xBF => '■',
        0xC0 => '°', 0xC1 => 'ℓ', 0xC2 => '℗', 0xC3 => '©', 0xC4 => '♯', 0xC5 => '¿', 0xC6 => '¡', 0xC7 => 'ß', 0xC8 => '€', 0xCD => 'e', 0xCE => 'o', 0xCF => 'ß'];
    static $combining = [0xE0 => 0x0309, 0xE1 => 0x0300, 0xE2 => 0x0301, 0xE3 => 0x0302, 0xE4 => 0x0303, 0xE5 => 0x0304, 0xE6 => 0x0306, 0xE7 => 0x0307, 0xE8 => 0x0308, 0xE9 => 0x030C, 0xEA => 0x030A,
        0xEB => 0xFE20, 0xEC => 0xFE21, 0xED => 0x0315, 0xEE => 0x030B, 0xEF => 0x0310, 0xF0 => 0x0327, 0xF1 => 0x0328, 0xF2 => 0x0323, 0xF3 => 0x0324, 0xF4 => 0x0325, 0xF5 => 0x0333, 0xF6 => 0x0332,
        0xF7 => 0x0326, 0xF8 => 0x031C, 0xF9 => 0x032E, 0xFA => 0xFE22, 0xFB => 0xFE23, 0xFE => 0x0313];
    $out = ''; $pending = '';
    $n = strlen($text);
    for ($i = 0; $i < $n; $i++) {
        $b = ord($text[$i]);
        if (isset($combining[$b])) { $pending .= mb_chr($combining[$b], 'UTF-8'); continue; }
        $ch = $b < 0x80 ? $text[$i] : ($special[$b] ?? '');
        if ($pending !== '' && ($ch === "\n" || $ch === "\r")) { $out .= $pending; $pending = ''; } // accent sans lettre : gardé seul
        $out .= $ch . $pending;
        $pending = '';
    }
    $out .= $pending;
    return class_exists('Normalizer') ? (Normalizer::normalize($out, Normalizer::FORM_C) ?: $out) : $out;
}

/** Importe un fichier GEDCOM (.ged) : voir l'en-tête du fichier. $mediaBaseDir : dossier des médias d'une archive GedZip. */
/** Vrai type du contenu d'un fichier (pas seulement son extension) : image, son, vidéo ou PDF. */
function gedimport_real_media_type(string $path): bool
{
    if (!function_exists('finfo_open')) return true;
    $mime = (string) (new finfo(FILEINFO_MIME_TYPE))->file($path);
    return (bool) preg_match('#^(image/|audio/|video/|application/pdf$)#', $mime);
}

function import_gedcom_into_db(PDO $pdo, string $path, ?string $mediaBaseDir = null, bool $fromDisk = false): array
{
    $content = file_get_contents($path);
    if ($content === false) { throw new RuntimeException('Lecture du fichier GEDCOM impossible'); }
    $anselLatin1 = !mb_check_encoding($content, 'UTF-8') && gedcom_detect_encoding($content) === GEDCOM_ANSEL_LATIN1;
    $content = gedcom_text_to_utf8($content);
    if (!preg_match('/^\s*0\s+HEAD\b/m', $content) && !preg_match('/^\s*0\s+@[^@]+@\s+INDI\b/m', $content)) {
        throw new RuntimeException('Ce fichier n’est pas un GEDCOM : aucune personne ni en-tête « HEAD » trouvé.');
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
    $personMap = []; $familyMap = []; $sourceMap = []; $mediaMap = []; $dupXref = []; $firstName = [];
    $stats = ['persons' => 0, 'families' => 0, 'children_links' => 0, 'events' => 0, 'marriages' => 0, 'notes' => 0,
        'sources' => 0, 'citations' => 0, 'name_variants' => 0, 'media' => 0, 'media_missing' => 0, 'labels' => 0, 'animals' => 0,
        'loops_skipped' => 0, 'warnings' => $anselLatin1 ? [GEDCOM_ANSEL_LATIN1_WARNING] : []];
    // Titre d'une note (balise _TITL écrite par LCNDA) et son texte sans ce titre répété en 1re ligne
    $noteParts = static function (stdClass $n) use ($byXref, $noteText, $textOf): array {
        $body = $noteText($n);
        $v = trim($n->value);
        $holder = preg_match('/^@([^@]+)@$/', $v, $m) && isset($byXref[$m[1]]) ? $byXref[$m[1]] : $n;
        $title = ($t = gedimport_child($holder, '_TITL')) ? $textOf($t) : '';
        if ($title !== '') {
            if ($body === $title) { $body = ''; }
            elseif (str_starts_with($body, $title . "\n")) { $body = ltrim(substr($body, strlen($title) + 1), "\n"); }
        }
        return [$title, $body];
    };
    // Étiquettes (_LABEL, couleur _COLR) : retrouvées par leur nom, créées au besoin
    $labelCache = [];
    $applyLabels = static function (stdClass $node, string $entityType, int $entityId) use ($pdo, &$labelCache, &$stats, $textOf): void {
        foreach (gedimport_children($node, '_LABEL') as $l) {
            $name = trim($textOf($l));
            if ($name === '') { continue; }
            $key = mb_strtolower($name);
            if (!isset($labelCache[$key])) {
                $find = $pdo->prepare('SELECT id FROM labels WHERE name=? COLLATE NOCASE LIMIT 1'); $find->execute([$name]);
                $id = (int) $find->fetchColumn();
                if (!$id) {
                    $color = ($c = gedimport_child($l, '_COLR')) && preg_match('/^#[0-9a-f]{6}$/i', trim($c->value)) ? strtolower(trim($c->value)) : '#0066cc';
                    $pdo->prepare('INSERT INTO labels(name,color) VALUES(?,?)')->execute([$name, $color]);
                    $id = (int) $pdo->lastInsertId();
                    $stats['labels']++;
                }
                $labelCache[$key] = $id;
            }
            $pdo->prepare('INSERT OR IGNORE INTO label_links(label_id,entity_type,entity_id) VALUES(?,?,?)')->execute([$labelCache[$key], $entityType, $entityId]);
        }
    };

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
    // $fromDisk : seulement un .ged ouvert depuis l'ordinateur (app de bureau) ; jamais une archive reçue (GedZip…), qui pourrait
    // désigner n'importe quel fichier du disque (« 2 FILE /Users/…/impots.pdf ») et l'aspirer dans les médias
    $resolveMedia = static function (stdClass $obje) use ($pdo, $byXref, $mediaIndex, $insertMedia, &$mediaMap, &$stats, $textOf, $noteText, $fromDisk): ?int {
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
            // Fichier sur l'ordinateur : chemin complet Mac/Linux (« /Users/… ») ou Windows (« C:\Users\… », écrit par Hérédis PC).
            // Seulement pour un .ged ouvert depuis l'ordinateur (pas un fichier envoyé), et si le contenu est bien une image, un son, une vidéo ou un PDF.
            if (!$stored && $allowed && $fromDisk && preg_match('#^(/|[A-Za-z]:/)#', $path) && is_file($path) && gedimport_real_media_type($path)) {
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
        // deux fiches avec le même identifiant (@I1@ deux fois) : les deux sont gardées, chacune avec ses événements ;
        // les familles qui citent cet identifiant sont reliées à la première (avertissement à la fin)
        $rec->lcPid = $pid;
        if ($rec->xref && isset($personMap[$rec->xref])) { $dupXref[$rec->xref][] = trim($main['first'] . ' ' . mb_strtoupper($main['last'])) ?: 'sans nom'; }
        else { $personMap[$rec->xref] = $pid; $firstName[$rec->xref] = trim($main['first'] . ' ' . mb_strtoupper($main['last'])) ?: 'sans nom'; }
        $stats['persons']++;
        if (($k = gedimport_child($rec, '_KIND')) && strtolower(trim($k->value)) === 'animal') {
            $pdo->prepare("UPDATE persons SET kind='animal' WHERE id=?")->execute([$pid]);
            if (function_exists('pet_of_person')) {
                $petId = pet_of_person($pdo, $pid, true);
                $pn = gedimport_child($k, '_PET'); $pd = $pn ? json_decode(gedimport_text($pn), true) : null;
                if ($petId && is_array($pd) && function_exists('pet_clean')) { $pdo->prepare('UPDATE pets SET data_json=? WHERE id=?')->execute([json_encode(pet_clean($pd), JSON_UNESCAPED_UNICODE), $petId]); }
            }
            $stats['animals']++;
        }
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
    $insertEvent = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id,address,title,description,cause,agency,date_calendar,date_converted) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $insertNote = $pdo->prepare('INSERT INTO notes(entity_type,entity_id,title,body) VALUES(?,?,?,?)');
    $personTags = array_merge(GEDCOM_PERSON_EVENT_TAGS, GEDCOM_PERSON_ATTRIBUTE_TAGS, ['EVEN']);
    $familyTags = array_merge(GEDCOM_FAMILY_EVENT_TAGS, ['EVEN']);
    $isEventNode = static fn(stdClass $c, array $known): bool => in_array($c->tag, $known, true)
        || (!in_array($c->tag, GEDCOM_STRUCTURAL_TAGS, true) && (gedimport_child($c, 'DATE') || gedimport_child($c, 'PLAC') || gedimport_child($c, 'TYPE')));
    $importEvent = static function (stdClass $c, string $scope, ?int $personId, ?int $familyId) use ($pdo, &$typeCache, &$placeCache, $placeForm, $insertEvent, $insertNote, $cite, $linkMedia, $noteText, $noteParts, $applyLabels, $textOf, $unescape, &$stats): void {
        $type = ($t = gedimport_child($c, 'TYPE')) ? trim($textOf($t)) : '';
        $typeId = gedcom_event_type_id($pdo, $typeCache, $scope, $c->tag, $c->tag === 'EVEN' || !in_array($c->tag, array_merge(GEDCOM_PERSON_EVENT_TAGS, GEDCOM_PERSON_ATTRIBUTE_TAGS, GEDCOM_FAMILY_EVENT_TAGS), true) ? $type : '');
        $dateNode = gedimport_child($c, 'DATE');
        $dateRaw = $dateNode ? trim($dateNode->value) : '';
        $date = gedcom_date_to_text($dateRaw);
        // calendrier : escape GEDCOM (@#DJULIAN@, @#DFRENCH R@…) ou _CAL écrit par LCNDA
        $calendar = ($cal = $dateNode ? gedimport_child($dateNode, '_CAL') : null) ? strtolower(trim($cal->value)) : gedcom_date_calendar($dateRaw);
        if (!in_array($calendar, ['gregorian', 'julian', 'republican', 'islamic', 'hebrew'], true)) { $calendar = 'gregorian'; }
        [$year, $converted] = function_exists('event_year_and_converted') ? event_year_and_converted($date, '', $calendar) : [gedcom_year($date), ''];
        $placeId = ($p = gedimport_child($c, 'PLAC')) ? gedcom_import_place_id($pdo, $placeCache, $p, $placeForm) : null;
        $value = trim($unescape($c->value));
        $title = ($t = gedimport_child($c, '_TITL')) ? $textOf($t) : (in_array(strtoupper($value), ['Y', 'YES'], true) ? '' : $value);
        if ($type !== '' && in_array($c->tag, GEDCOM_PERSON_ATTRIBUTE_TAGS, true) && $title === '') { $title = $type; }
        $address = ($a = gedimport_child($c, 'ADDR')) ? $textOf($a) : '';
        $agency = ($a = gedimport_child($c, 'AGNC')) ? $textOf($a) : '';
        $cause = ($a = gedimport_child($c, 'CAUS')) ? $textOf($a) : '';
        // 1re note sans titre = description de l'événement ; les autres (et celles qui ont un titre) = notes
        $description = null; $notes = [];
        foreach (gedimport_children($c, 'NOTE') as $nn) {
            [$nt, $nb] = $noteParts($nn);
            if ($nt === '' && $nb === '') { continue; }
            if ($nt === '' && $description === null) { $description = $nb; continue; }
            $notes[] = [$nt, $nb];
        }
        $insertEvent->execute([$scope, $personId, $familyId, $typeId, $date, $year, $placeId, $address, $title, $description ?? '', $cause, $agency, $calendar, $converted]);
        $eventId = (int) $pdo->lastInsertId();
        foreach ($notes as [$nt, $nb]) { $insertNote->execute(['event', $eventId, $nt, $nb]); $stats['notes']++; }
        $applyLabels($c, 'event', $eventId);
        $cite($c, 'event', $eventId);
        $linkMedia($c, 'event', $eventId);
        $stats['events']++;
        if ($c->tag === 'MARR') { $stats['marriages']++; }
    };
    foreach ($records as $rec) {
        if ($rec->tag !== 'INDI' || !(isset($rec->lcPid) || isset($personMap[$rec->xref]))) { continue; }
        $pid = $rec->lcPid ?? $personMap[$rec->xref];
        $nati = ''; $dscr = '';
        foreach ($rec->children as $c) {
            if ($c->tag === 'NOTE') {
                [$nt, $body] = $noteParts($c);
                if ($body !== '' || $nt !== '') { $insertNote->execute(['person', $pid, $nt, $body]); $stats['notes']++; }
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
        $applyLabels($rec, 'person', $pid);
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
    // enfants cités par la famille (CHIL) ; un enfant relié seulement par son FAMC (sans CHIL dans la famille) est relié quand même
    $chilOf = [];
    foreach ($records as $rec) {
        if ($rec->tag !== 'FAM') { continue; }
        foreach (gedimport_children($rec, 'CHIL') as $chil) { $chilOf[(string) $rec->xref][trim($chil->value, '@ ')] = true; }
    }
    $famcOnly = [];
    foreach ($records as $rec) {
        if ($rec->tag !== 'INDI') { continue; }
        $fil = ($f = gedimport_child($rec, '_FIL')) ? $relation($f->value) : 'biological';
        foreach (gedimport_children($rec, 'FAMC') as $famc) {
            $pedi = ($p = gedimport_child($famc, 'PEDI')) ? $relation($p->value) : $fil;
            $famXref = trim($famc->value, '@ ');
            $pediByChild[$rec->xref][$famXref] = $pedi;
            if ($famXref !== '' && !isset($chilOf[$famXref][(string) $rec->xref])) { $famcOnly[$famXref][(string) $rec->xref] = true; }
        }
    }
    $stats['famc_only_links'] = 0;
    // Liens qui feraient une boucle (quelqu'un parent de lui-même, ou ancêtre de son propre parent) : ignorés et comptés
    $parentsOf = [];
    $isAncestor = static function (int $ancestor, int $person) use (&$parentsOf): bool {
        $seen = []; $stack = [$person];
        while ($stack) {
            $cur = array_pop($stack);
            foreach ($parentsOf[$cur] ?? [] as $p) {
                if ($p === $ancestor) { return true; }
                if (!isset($seen[$p])) { $seen[$p] = true; $stack[] = $p; }
            }
        }
        return false;
    };
    $nameOf = static function (int $id) use ($pdo): string {
        $s = $pdo->prepare("SELECT trim(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) FROM persons WHERE id=?"); $s->execute([$id]);
        return (string) $s->fetchColumn() ?: 'fiche #' . $id;
    };
    foreach ($records as $rec) {
        if ($rec->tag !== 'FAM') { continue; }
        $husb = ($h = gedimport_child($rec, 'HUSB')) ? ($personMap[trim($h->value, '@ ')] ?? null) : null;
        $wife = ($w = gedimport_child($rec, 'WIFE')) ? ($personMap[trim($w->value, '@ ')] ?? null) : null;
        if ($husb !== null && $husb === $wife) {
            $stats['loops_skipped']++; $stats['warnings'][] = 'Famille ' . $rec->xref . ' : ' . $nameOf($husb) . ' était à la fois mari et femme ; gardé une seule fois.';
            $wife = null;
        }
        $insertFamily->execute([$husb, $wife]);
        $fid = (int) $pdo->lastInsertId();
        $familyMap[(string) $rec->xref] = $fid;
        $stats['families']++;
        $position = 0;
        $kids = array_map(static fn($c) => [trim($c->value, '@ '), $c], gedimport_children($rec, 'CHIL'));
        foreach (array_keys($famcOnly[(string) $rec->xref] ?? []) as $x) { $kids[] = [(string) $x, null]; }
        foreach ($kids as [$xref, $chil]) {
            if ($chil === null && isset($personMap[$xref])) { $stats['famc_only_links']++; }
            if (!isset($personMap[$xref])) { continue; }
            $childId = $personMap[$xref];
            $loop = false;
            foreach ([$husb, $wife] as $parent) {
                if ($parent !== null && ($parent === $childId || $isAncestor($childId, $parent))) { $loop = true; }
            }
            if ($loop) {
                $stats['loops_skipped']++;
                if (count($stats['warnings']) < 50) { $stats['warnings'][] = 'Famille ' . $rec->xref . ' : lien enfant ignoré pour ' . $nameOf($childId) . ' (il serait son propre ancêtre).'; }
                continue;
            }
            foreach ([$husb, $wife] as $parent) { if ($parent !== null) { $parentsOf[$childId][] = $parent; } }
            $base = $pediByChild[$xref][(string) $rec->xref] ?? 'biological';
            $r1 = ($chil && ($n = gedimport_child($chil, '_FREL'))) ? $relation($n->value) : $base;
            $r2 = ($chil && ($n = gedimport_child($chil, '_MREL'))) ? $relation($n->value) : $base;
            $insertChild->execute([$fid, $personMap[$xref], $r1, $r2, $position++]);
            $stats['children_links']++;
        }
        foreach ($rec->children as $c) {
            if ($c->tag === 'NOTE') {
                [$nt, $body] = $noteParts($c);
                if ($body !== '' || $nt !== '') { $insertNote->execute(['family', $fid, $nt, $body]); $stats['notes']++; }
            } elseif ($isEventNode($c, $familyTags)) {
                $importEvent($c, 'family', null, $fid);
            }
        }
        $cite($rec, 'family', $fid);
        $linkMedia($rec, 'family', $fid);
        $applyLabels($rec, 'family', $fid);
    }

    foreach ($dupXref as $x => $others) {
        if (count($stats['warnings']) >= 60) { break; }
        $n = count($others) + 1;
        $stats['warnings'][] = $n . ' fiches ont le même identifiant @' . $x . '@ (' . $firstName[$x] . ', ' . implode(', ', array_slice($others, 0, 3)) . ') : toutes sont gardées, chacune avec ses événements ; les familles qui citent @' . $x . '@ sont reliées à la première (' . $firstName[$x] . '). Vérifie les autres.';
    }
    if ($dupXref) { $stats['duplicate_xrefs'] = count($dupXref); }
    if ($stats['famc_only_links'] > 0) {
        $n = $stats['famc_only_links'];
        $stats['warnings'][] = $n < 2
            ? '1 enfant n’était relié à sa famille que depuis sa propre fiche (FAMC, sans CHIL dans la famille) : la filiation a été reprise.'
            : $n . ' enfants n’étaient reliés à leur famille que depuis leur propre fiche (FAMC, sans CHIL dans la famille) : les filiations ont été reprises.';
    }
    $pdo->exec("UPDATE persons SET living_status='deceased' WHERE living_status='unknown' AND id IN (SELECT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('DEAT','BURI','CREM'))");
    gedimport_rebuild_search($pdo);
    return ['format' => 'gedcom'] + $stats;
}

/**
 * Personnes à masquer dans un export « pour partager » : id => 'living' | 'private'.
 * Confidentielle (is_private) ; vivante déclarée ; ou probablement vivante : ni décès ni inhumation, et née il y a moins de
 * 100 ans (naissance estimée, si elle manque, d'après le mariage, les enfants ou les parents) ; ou décédée depuis
 * l'année limite du mode confidentialité.
 */
function gedcom_share_hidden(PDO $pdo, array $persons, array $families): array
{
    $now = (int) date('Y'); $limit = $now - 100; $cutoff = export_death_cutoff_year();
    $byId = []; foreach ($persons as $p) { $byId[(int) $p['id']] = $p; }
    $dead = array_fill_keys(array_map('intval', $pdo->query("SELECT DISTINCT e.person_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('DEAT','BURI','CREM') AND e.person_id IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN)), true);
    $partners = []; $childrenOf = []; $parentsOf = [];
    $kidsByFamily = [];
    foreach ($pdo->query('SELECT family_id, child_id FROM family_children') as $c) { $kidsByFamily[(int) $c['family_id']][] = (int) $c['child_id']; }
    foreach ($families as $f) {
        foreach ($kidsByFamily[(int) $f['id']] ?? [] as $c) {
            foreach ([(int) ($f['partner1_id'] ?? 0), (int) ($f['partner2_id'] ?? 0)] as $parent) { if ($parent) { $childrenOf[$parent][] = $c; $parentsOf[$c][] = $parent; } }
        }
    }
    $year = static fn($v): ?int => $v !== null && $v !== '' && (int) $v > 0 ? (int) $v : null;
    $estimate = static function (int $id) use ($byId, $childrenOf, $parentsOf, $year): ?int {
        $p = $byId[$id] ?? []; if ($y = $year($p['birth_year'] ?? null)) { return $y; }
        if ($y = $year($p['marr_year'] ?? null)) { return $y - 25; }
        $kids = array_filter(array_map(static fn($c) => $year($byId[$c]['birth_year'] ?? null), $childrenOf[$id] ?? []));
        if ($kids) { return min($kids) - 25; }
        $parents = array_filter(array_map(static fn($c) => $year($byId[$c]['birth_year'] ?? null), $parentsOf[$id] ?? []));
        return $parents ? max($parents) + 25 : null;
    };
    $hidden = [];
    foreach ($byId as $id => $p) {
        if ((int) ($p['is_private'] ?? 0) === 1) { $hidden[$id] = 'private'; continue; }
        if (($p['living_status'] ?? '') === 'living') { $hidden[$id] = 'living'; continue; }
        $deathYear = $year($p['death_year'] ?? null);
        if ($cutoff && $deathYear && $deathYear >= $cutoff) { $hidden[$id] = 'living'; continue; }
        if (($p['living_status'] ?? '') === 'deceased' || isset($dead[$id]) || $deathYear) { continue; }
        $born = $estimate($id);
        if ($born !== null && $born >= $limit) { $hidden[$id] = 'living'; }
    }
    return $hidden;
}

/**
 * Personnes d'une branche à exporter (null = toute la base) :
 *  - branch_mode=ascendants&branch_person=ID[&branch_generations=N] : la personne et ses ascendants ;
 *  - branch_mode=descendants&branch_person=ID[&branch_partner=ID][&branch_spouses=0] : le couple, ses descendants
 *    et (par défaut) les conjoints des descendants.
 */
function gedcom_branch_ids(PDO $pdo): ?array
{
    $mode = (string) ($_GET['branch_mode'] ?? '');
    $person = (int) ($_GET['branch_person'] ?? 0);
    if (!in_array($mode, ['ascendants', 'descendants'], true) || $person <= 0) { return null; }
    $generations = max(1, min(60, (int) ($_GET['branch_generations'] ?? 60)));
    if ($mode === 'ascendants') { return h_ancestors($pdo, $person, $generations); }
    $partner = (int) ($_GET['branch_partner'] ?? 0);
    $spouses = ($_GET['branch_spouses'] ?? '1') !== '0';
    if (!$partner) { return h_descendants($pdo, [$person], $generations, $spouses); }
    // Descendants de CE couple seulement (pas les enfants d'une autre union de l'un des deux)
    $stmt = $pdo->prepare('SELECT fc.child_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE (f.partner1_id=? AND f.partner2_id=?) OR (f.partner1_id=? AND f.partner2_id=?)');
    $stmt->execute([$person, $partner, $partner, $person]);
    $children = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    $keep = $children ? h_descendants($pdo, $children, $generations - 1, $spouses) : [];
    return $keep + [$person => true, $partner => true];
}
