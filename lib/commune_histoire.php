<?php
declare(strict_types=1);

/**
 * LCNDA — 🏛 Commune qui n'existait pas (encore ou plus) à la date d'un événement (idée « CountyCheck » de RootsMagic).
 *
 * Source : l'historique officiel des communes de l'INSEE (Code officiel géographique, Licence Ouverte 2.0), déjà livré avec
 * l'app (data/reference/frontieres/com.csv et mvt.csv, « 🏛 Frontières anciennes », lib/cartes_plus.php) : « Communes depuis
 * 1943 » (code, nom, date de début, date de fin) et « Événements survenus aux communes depuis 1943 » (créations, fusions,
 * communes nouvelles, rétablissements, changements de nom et de code). Rien n'est téléchargé, rien n'est envoyé.
 *
 * Ce qui est signalé (lib/controle.php, sorte 📍 Lieux, sous-sorte « anachro » ; fiche de l'événement ; 🔎 Ce qui le concerne) :
 *  - 🟠 not_yet : la commune a été créée APRÈS l'événement (ex. Chamrousse, créée en 1989 avec des parties de trois communes) ;
 *  - 🟠 gone    : la commune avait disparu AVANT l'événement (fusion simple, suppression) ; une commune devenue « associée »
 *                 ou « déléguée » garde son état civil : jamais signalée ;
 *  - 🟡 formed  : le nom d'aujourd'hui est celui d'une commune nouvelle ou d'une fusion postérieure (ex. Les Trois-Saints, 2025) :
 *                 à la date de l'événement, c'était l'une des communes d'avant.
 * Prudence : rien avant 1790 (des paroisses, pas des communes) ; rien d'avant 1943 que le fichier ne connaît pas ; une date
 * approximative (« vers », « avant », « entre »…) doit être à plus de 10 ans de la date du changement ; un nom de lieu qui n'a
 * jamais été celui d'une commune (lieu-dit, hameau) n'est jamais contrôlé ; un simple changement de nom n'est pas une erreur.
 *
 * API : GET commune_hist_event (&event_id), commune_hist_check (&place_id&date_text), commune_hist_about ;
 *       POST commune_hist_fix ({event_id, code, name} ou {event_id, place_id} pour « ↶ Annuler »), commune_hist_setting.
 * Essai : tests/test-commune-anachronique.js
 */

const CH_VERSION = 1;
const CH_SOURCE_URL = 'https://www.insee.fr/fr/information/2560452';
const CH_SEARCH_URL = 'https://www.insee.fr/fr/metadonnees/historique-commune';
const CH_LICENCE = 'Licence Ouverte 2.0 (Etalab)';
const CH_SETTING = 'genealogie-commune-histoire';

/** les deux fichiers de l'INSEE : ceux installés par « 🏛 Frontières anciennes » s'ils sont là, sinon ceux livrés avec l'app */
function ch_files(): ?array
{
    $dirs = [];
    if (!function_exists('cp_front_dir') && is_file(__DIR__ . '/cartes_plus.php')) { require_once __DIR__ . '/cartes_plus.php'; }
    if (function_exists('cp_front_dir')) { $dirs[] = cp_front_dir(); }
    $dirs[] = APP_ROOT . '/data/reference/frontieres';
    foreach ($dirs as $d) {
        if (is_file($d . '/mvt.csv') && is_file($d . '/com.csv')) { return ['mvt' => $d . '/mvt.csv', 'com' => $d . '/com.csv']; }
    }
    return null;
}

function ch_fold(string $s): string
{
    $s = function_exists('ascii_fold') ? ascii_fold($s) : (string) (@iconv('UTF-8', 'ASCII//TRANSLIT', $s) ?: $s);
    $s = strtolower($s);
    $s = (string) preg_replace('/[^a-z0-9]+/', ' ', $s);
    $s = (string) preg_replace('/\b(st)\b/', 'saint', $s);
    $s = (string) preg_replace('/\b(ste)\b/', 'sainte', $s);
    return trim((string) preg_replace('/\s+/', ' ', $s));
}

/** le département d'un code commune (2A, 2B, 971…) */
function ch_dep(string $code): string { return str_starts_with($code, '97') ? substr($code, 0, 3) : substr($code, 0, 2); }

/**
 * L'index (gardé dans le dossier partagé, refait si les fichiers changent) :
 *  rows[code] = [[début, fin, nom], …] (communes de plein exercice), names[nom replié] = [codes],
 *  in[code][date] = [[mod, code d'avant, nom d'avant, sorte d'avant], …], out[code][date] = [[mod, code d'après, nom d'après, sorte d'après], …]
 */
function ch_index(): ?array
{
    static $memo = false;
    if ($memo !== false) { return $memo; }
    $f = ch_files();
    if (!$f) { return $memo = null; }
    $sig = md5(implode('|', [CH_VERSION, $f['mvt'], filesize($f['mvt']), filemtime($f['mvt']), $f['com'], filesize($f['com']), filemtime($f['com'])]));
    $dir = (defined('SHARED_DATA_DIR') ? SHARED_DATA_DIR : DATA_DIR) . '/cache';
    $cache = $dir . '/commune-histoire.json';
    $raw = is_file($cache) ? @file_get_contents($cache) : false;
    if (is_string($raw)) { $d = json_decode($raw, true); if (is_array($d) && ($d['sig'] ?? '') === $sig) { return $memo = $d; } }
    $idx = ['sig' => $sig, 'rows' => [], 'names' => [], 'in' => [], 'out' => []];
    $open = static function (string $p): array {
        $h = fopen($p, 'rb'); $line = preg_replace('/^\xEF\xBB\xBF/', '', (string) fgets($h));
        $sep = substr_count($line, ';') > substr_count($line, ',') ? ';' : ',';
        $head = array_flip(array_map(static fn($x) => strtoupper(trim((string) $x, " \"\r\n")), str_getcsv($line, $sep, '"', '')));
        return [$h, $sep, $head];
    };
    [$h, $sep, $ix] = $open($f['com']);
    while (($r = fgetcsv($h, 0, $sep, '"', '')) !== false) {
        if (count($r) < count($ix) || ($r[$ix['TYPECOM']] ?? 'COM') !== 'COM') { continue; }
        $code = (string) $r[$ix['COM']]; $name = (string) $r[$ix['LIBELLE']];
        $idx['rows'][$code][] = [substr((string) $r[$ix['DATE_DEBUT']], 0, 10), substr((string) $r[$ix['DATE_FIN']], 0, 10), $name];
        foreach (array_unique([ch_fold($name), ch_fold((string) ($r[$ix['NCCENR']] ?? ''))]) as $k) { if ($k !== '' && !in_array($code, $idx['names'][$k] ?? [], true)) { $idx['names'][$k][] = $code; } }
    }
    fclose($h);
    foreach ($idx['rows'] as &$rs) { usort($rs, static fn($a, $b) => strcmp($a[0], $b[0])); }
    unset($rs);
    [$h, $sep, $ix] = $open($f['mvt']);
    while (($r = fgetcsv($h, 0, $sep, '"', '')) !== false) {
        if (count($r) < count($ix)) { continue; }
        $g = static fn($k) => trim((string) ($r[$ix[$k]] ?? ''));
        $mod = (int) $g('MOD'); $date = substr($g('DATE_EFF'), 0, 10);
        if ($g('TYPECOM_AP') === 'COM' && $g('COM_AP') !== '') { $idx['in'][$g('COM_AP')][$date][] = [$mod, $g('COM_AV'), $g('LIBELLE_AV'), $g('TYPECOM_AV')]; }
        if ($g('TYPECOM_AV') === 'COM' && $g('COM_AV') !== '') { $idx['out'][$g('COM_AV')][$date][] = [$mod, $g('COM_AP'), $g('LIBELLE_AP'), $g('TYPECOM_AP')]; }
    }
    fclose($h);
    if (is_dir($dir) || @mkdir($dir, 0775, true)) {
        $tmp = $cache . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, json_encode($idx, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) !== false) { @rename($tmp, $cache); } else { @unlink($tmp); }
    }
    return $memo = $idx;
}

/** la ligne d'une commune valable à une date (avant 1943 : la première ligne, si elle commence le 1er janvier 1943) */
function ch_row_at(array $idx, string $code, string $iso): ?array
{
    $rows = $idx['rows'][$code] ?? [];
    foreach ($rows as $i => $r) {
        $from = $i === 0 && $r[0] <= '1943-01-01' ? '0000-01-01' : $r[0];
        if ($iso >= $from && ($r[1] === '' || $iso < $r[1])) { return $r; }
    }
    return null;
}

function ch_name_at(array $idx, string $code, string $iso, string $fallback = ''): string
{
    $r = ch_row_at($idx, $code, $iso);
    return $r ? $r[2] : $fallback;
}

/** le nom d'aujourd'hui d'une commune (en suivant les fusions et changements de code), et son code */
function ch_now(array $idx, string $code, int $hops = 0): array
{
    $rows = $idx['rows'][$code] ?? [];
    $last = $rows ? $rows[count($rows) - 1] : null;
    if ($last && $last[1] === '') { return [$code, $last[2]]; }
    if ($last && $hops < 10) {
        foreach ($idx['out'][$code][$last[1]] ?? [] as $o) { if ($o[3] === 'COM' && $o[1] !== $code) { return ch_now($idx, $o[1], $hops + 1); } }
    }
    return [$code, $last[2] ?? ''];
}

/**
 * Le code INSEE d'un lieu de la base, seulement si son nom est (ou a été) celui d'une commune — jamais un lieu-dit.
 * $place = ligne de places (name, country, admin4_code, admin2_code).
 */
function ch_place_code(array $idx, array $place): ?string
{
    $country = ch_fold((string) ($place['country'] ?? ''));
    if ($country !== '' && !in_array($country, ['france', 'fr'], true)) { return null; }
    $name = trim((string) ($place['name'] ?? ''));
    if ($name === '' || preg_match('/\d/', $name)) { return null; }
    $codes = $idx['names'][ch_fold($name)] ?? [];
    if (!$codes) { return null; }
    $a4 = trim((string) ($place['admin4_code'] ?? ''));
    if ($a4 !== '' && in_array($a4, $codes, true)) { return $a4; }
    $dep = $a4 !== '' ? ch_dep($a4) : trim((string) ($place['admin2_code'] ?? ''));
    if ($dep !== '') { $codes = array_values(array_filter($codes, static fn($c) => ch_dep($c) === $dep)); }
    return count($codes) === 1 ? $codes[0] : null;
}

/** une date d'événement : [année, date exacte AAAA-MM-JJ ou null, approximative ?] */
function ch_event_date(string $text, $year): ?array
{
    $text = trim($text);
    $y = $year !== null && $year !== '' ? (int) $year : null;
    $iso = $text !== '' && function_exists('exact_date') ? exact_date($text) : null;
    if ($iso) { $y ??= (int) substr($iso, 0, 4); }
    if ($y === null && preg_match('/\b(1[5-9]\d\d|20\d\d)\b/', $text, $m)) { $y = (int) $m[1]; }
    if ($y === null || $y < 1 || $y > 2200) { return null; }
    $approx = !$iso && preg_match('/\b(vers|env\.?|environ|abt|about|circa|ca\.?|bef|avant|aft|apr[eè]s|bet|entre|est|calc?|int|from|to|de|du|à|au|or|ou|probablement|peut[- ]?[eê]tre)\b|[~?≈<>]/iu', $text);
    return [$y, $iso, (bool) $approx];
}

/** l'événement est-il sûrement AVANT (sens -1) ou sûrement APRÈS (sens +1) la date du changement ? */
function ch_surely(array $d, string $boundary, int $sense): bool
{
    [$y, $iso, $approx] = $d;
    $by = (int) substr($boundary, 0, 4);
    if ($iso) { return $sense < 0 ? $iso < $boundary : $iso >= $boundary; }
    if ($approx) { return $sense < 0 ? $y + 10 < $by : $y - 10 > $by; }
    return $sense < 0 ? $y < $by : $y > $by;
}

/** la date de référence d'une date d'événement pour lire le fichier (milieu de l'année si seule l'année est connue) */
function ch_ref_iso(array $d): string { return $d[1] ?: sprintf('%04d-07-01', $d[0]); }

function ch_date_fr(string $iso): string
{
    if (!preg_match('/^(\d{4})-(\d\d)-(\d\d)$/', $iso, $m)) { return $iso; }
    $mo = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][(int) $m[2] - 1] ?? '';
    $d = (int) $m[3];
    return ($d === 1 ? '1er' : (string) $d) . ' ' . $mo . ' ' . $m[1];
}

function ch_list_fr(array $names, string $last = 'et'): string
{
    $names = array_values(array_unique(array_filter($names)));
    if (count($names) <= 1) { return $names[0] ?? ''; }
    return implode(', ', array_slice($names, 0, -1)) . ' ' . $last . ' ' . $names[count($names) - 1];
}

/**
 * L'état d'une commune (code) à la date d'un événement, pour un lieu nommé $placeName.
 * Rend null (rien à dire) ou ['state' => not_yet|gone|formed|renamed, 'boundary' => date, 'mod' => n, 'then' => [[code, nom], …],
 *  'name_then' => nom à cette date, 'now' => [code, nom d'aujourd'hui]].
 */
function ch_status(array $idx, string $code, string $placeName, array $d, int $hops = 0): ?array
{
    if ($d[0] < 1790 || $hops > 6) { return null; }
    $rows = $idx['rows'][$code] ?? [];
    if (!$rows) { return null; }
    $iso = ch_ref_iso($d);
    $fold = ch_fold($placeName);
    $row = ch_row_at($idx, $code, $iso);
    if ($row) {
        if (ch_fold($row[2]) === $fold) { return null; } // le lieu porte le nom de la commune à cette date
        // le nom d'aujourd'hui vient d'un changement fait après l'événement : lequel ?
        $boundary = $row[1];
        if ($boundary === '' || !ch_surely($d, $boundary, -1)) { return null; }
        $arrivals = $idx['in'][$code][$boundary] ?? [];
        $founders = [[$code, $row[2]]]; $mod = 10;
        foreach ($arrivals as [$m, $cav, $lav, $tav]) {
            if (in_array($m, [31, 32, 33, 34], true)) { $mod = $m; if ($tav === 'COM' && $cav !== '' && $cav !== $code) { $founders[] = [$cav, ch_name_at($idx, $cav, $iso, $lav)]; } }
        }
        $founders = array_values(array_unique($founders, SORT_REGULAR));
        $now = ch_now($idx, $code);
        return ['state' => count($founders) > 1 ? 'formed' : 'renamed', 'boundary' => $boundary, 'mod' => $mod, 'then' => $founders, 'name_then' => $row[2], 'now' => $now];
    }
    $first = $rows[0];
    if ($iso < $first[0]) { // pas encore là
        $arrivals = $idx['in'][$code][$first[0]] ?? [];
        foreach ($arrivals as [$m, $cav, $lav, $tav]) {
            if (in_array($m, [41, 50], true) && $cav !== '' && $cav !== $code) { return ch_status($idx, $cav, $placeName === $first[2] ? ch_name_at($idx, $cav, $iso, $placeName) : $placeName, $d, $hops + 1); } // nouveau code, même commune
        }
        if (!ch_surely($d, $first[0], -1)) { return null; }
        $founders = []; $mod = 0;
        foreach ($arrivals as [$m, $cav, $lav, $tav]) {
            if (in_array($m, [20, 21, 32, 31, 33], true)) { $mod = $mod ?: $m; if ($cav !== '' && $cav !== $code && in_array($tav, ['COM', 'COMA', 'COMD'], true)) { $founders[] = [$cav, ch_name_at($idx, $cav, $iso, $lav)]; } }
        }
        if (!$founders) { return null; } // création sans commune d'origine connue (Mayotte, 2011…)
        // un rétablissement : la commune existait déjà avant d'avoir été réunie, sous un autre code ; on ne sait pas : rien
        if ($mod === 21 && count($founders) === 1 && ch_fold($founders[0][1]) === $fold) { return null; }
        return ['state' => 'not_yet', 'boundary' => $first[0], 'mod' => $mod, 'then' => array_values(array_unique($founders, SORT_REGULAR)), 'name_then' => '', 'now' => ch_now($idx, $code)];
    }
    // plus là : après sa dernière ligne, ou dans un trou entre deux lignes (réunie puis rétablie)
    $prev = null;
    foreach ($rows as $r) { if ($r[1] !== '' && $r[1] <= $iso) { $prev = $r; } }
    if (!$prev || ch_fold($prev[2]) !== $fold || !ch_surely($d, $prev[1], +1)) { return null; }
    $deps = $idx['out'][$code][$prev[1]] ?? [];
    $then = []; $mod = 0;
    foreach ($deps as [$m, $cap, $lap, $tap]) {
        if (in_array($tap, ['COMA', 'COMD'], true) && $cap === $code) { return null; } // devenue associée ou déléguée : elle a gardé son état civil
        if (in_array($m, [41, 50], true) && $tap === 'COM' && $cap !== $code) { return ch_status($idx, $cap, ch_name_at($idx, $cap, $iso, $placeName), $d, $hops + 1); } // changement de code
        if ($tap === 'COM' && $cap !== '' && $cap !== $code) { $mod = $mod ?: $m; $then[] = [$cap, ch_name_at($idx, $cap, $iso, $lap)]; }
    }
    if (!$then) { return null; }
    return ['state' => 'gone', 'boundary' => $prev[1], 'mod' => $mod, 'then' => array_values(array_unique($then, SORT_REGULAR)), 'name_then' => $prev[2], 'now' => ch_now($idx, $then[0][0])];
}

/** la phrase de l'alerte et ce qui va avec (titre, détail, propositions, source) */
function ch_describe(array $st, string $placeName, string $eventLabel, string $dateText, int $year): array
{
    $T = static fn(string $s, array $v = []): string => function_exists('i18n_t') ? i18n_t($s, $v) : strtr($s, array_combine(array_map(static fn($k) => '{' . $k . '}', array_keys($v)), array_map('strval', $v)) ?: []);
    $when = ch_date_fr($st['boundary']);
    $names = array_map(static fn($t) => $t[1], $st['then']);
    $modTxt = function_exists('cp_mod_label') ? cp_mod_label((int) $st['mod']) : '';
    if ($st['state'] === 'not_yet') {
        $title = $T('{place} n’existait pas encore en {year}', ['place' => $placeName, 'year' => $year]);
        $detail = $T('{event} {date} à {place} : cette commune a été créée le {when}, avec des parties de {from}. En {year}, c’était {then}.', ['event' => $eventLabel, 'date' => $dateText, 'place' => $placeName, 'when' => $when, 'from' => ch_list_fr($names), 'year' => $year, 'then' => ch_list_fr($names, $T('ou'))]);
        $level = 'orange';
    } elseif ($st['state'] === 'gone') {
        $title = $T('{place} n’existait plus en {year}', ['place' => $placeName, 'year' => $year]);
        $detail = $T('{event} {date} à {place} : la commune a été réunie à {to} le {when} ({what}). En {year}, la commune était {to}.', ['event' => $eventLabel, 'date' => $dateText, 'place' => $placeName, 'to' => ch_list_fr($names, $T('ou')), 'when' => $when, 'what' => $T($modTxt), 'year' => $year])
            . ($st['now'][1] !== '' && ch_fold($st['now'][1]) !== ch_fold($names[0] ?? '') ? ' ' . $T('Aujourd’hui : {now}.', ['now' => $st['now'][1]]) : '');
        $level = 'orange';
    } elseif ($st['state'] === 'formed') {
        $title = $T('« {place} » n’existait pas encore en {year}', ['place' => $placeName, 'year' => $year]);
        $detail = $T('{event} {date} à {place} : ce nom est celui de la commune formée le {when} ({what}) par {from}. En {year}, c’était {then}.', ['event' => $eventLabel, 'date' => $dateText, 'place' => $placeName, 'when' => $when, 'what' => $T($modTxt), 'from' => ch_list_fr($names), 'year' => $year, 'then' => ch_list_fr($names, $T('ou'))]);
        $level = 'yellow';
    } else {
        $title = $T('En {year}, {place} s’appelait {then}', ['place' => $placeName, 'year' => $year, 'then' => $st['name_then']]);
        $detail = $T('Nom changé le {when}.', ['when' => $when]);
        $level = 'info';
    }
    $quote = $T('INSEE, événement du {when} : {what} — {list}', ['when' => $when, 'what' => $T($modTxt), 'list' => ch_list_fr($names)]);
    return ['title' => $title, 'detail' => $detail, 'level' => $level, 'quote' => $quote,
        'then' => array_map(static fn($t) => ['code' => $t[0], 'name' => $t[1]], $st['then']),
        'source' => ['label' => 'INSEE, Code officiel géographique — historique des communes depuis 1943', 'licence' => CH_LICENCE, 'url' => CH_SEARCH_URL, 'dataset' => CH_SOURCE_URL,
            'commune_url' => $st['now'][0] !== '' && ($st['now'][1] ?? '') !== '' ? 'https://www.insee.fr/fr/metadonnees/geographie/commune/' . $st['now'][0] : '']];
}

function ch_enabled(PDO $pdo): bool
{
    $s = function_exists('ht_setting') ? ht_setting($pdo, CH_SETTING, ['controle' => true]) : ['controle' => true];
    return ($s['controle'] ?? true) !== false;
}

/**
 * Toutes les alertes de la base (lib/controle.php) : une par événement. $placeRows : id => ligne de places (déjà lue).
 * $people : fn(événement) => [ids de fiches].
 */
function ch_controle_alerts(PDO $pdo, callable $people): array
{
    if (!ch_enabled($pdo)) { return []; }
    $idx = ch_index(); if (!$idx) { return []; }
    $codeOf = [];
    $out = [];
    $q = $pdo->query("SELECT e.id, e.person_id, e.family_id, e.date_text, e.year, e.date_calendar, e.place_id, t.label, pl.name, pl.country, pl.admin4_code, pl.admin2_code
        FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE e.place_id IS NOT NULL AND (e.year IS NOT NULL OR trim(COALESCE(e.date_text,''))<>'')");
    foreach ($q as $r) {
        $pl = (int) $r['place_id'];
        if (!array_key_exists($pl, $codeOf)) { $codeOf[$pl] = ch_place_code($idx, $r); }
        $code = $codeOf[$pl]; if ($code === null) { continue; }
        $d = ch_event_date((string) $r['date_text'], $r['year']); if (!$d) { continue; }
        $st = ch_status($idx, $code, (string) $r['name'], $d);
        if (!$st || $st['state'] === 'renamed') { continue; }
        $desc = ch_describe($st, (string) $r['name'], (string) $r['label'], trim((string) $r['date_text']) ?: (string) $d[0], $d[0]);
        $ppl = $people($r); if (!$ppl) { continue; }
        $eid = (int) $r['id'];
        $out[] = ['key' => "commune-anachro:$eid", 'check' => 'commune-anachro', 'sort' => 'lieux', 'sub' => 'anachro', 'level' => $desc['level'], 'title' => $desc['title'], 'detail' => $desc['detail'],
            'people' => $ppl, 'rule' => $desc['quote'], 'place' => ['id' => $pl, 'name' => (string) $r['name']],
            'dates' => [['label' => (string) $r['label'], 'text' => trim((string) $r['date_text']) ?: (string) $d[0], 'y' => $d[0], 'j' => null, 'event_id' => $eid, 'person_id' => (int) ($ppl[0] ?? 0)]],
            'fix' => ['event_id' => $eid, 'person_id' => (int) ($ppl[0] ?? 0)], 'commune' => ['state' => $st['state'], 'code' => $code, 'boundary' => $st['boundary'], 'then' => $desc['then'], 'source' => $desc['source'], 'quote' => $desc['quote']],
            'fp' => md5($eid . '|' . $r['date_text'] . '|' . $pl)];
    }
    return $out;
}

/** GET commune_hist_check : un lieu et une date (fenêtre de l'événement, avant même d'enregistrer) */
function ch_check(PDO $pdo, int $placeId, string $dateText, $year = null, string $label = ''): array
{
    $idx = ch_index(); if (!$idx || !$placeId) { return ['ok' => true, 'alert' => null]; }
    $st = $pdo->prepare('SELECT id, name, country, admin4_code, admin2_code FROM places WHERE id=?'); $st->execute([$placeId]);
    $pl = $st->fetch(PDO::FETCH_ASSOC); if (!$pl) { return ['ok' => true, 'alert' => null]; }
    $code = ch_place_code($idx, $pl); if ($code === null) { return ['ok' => true, 'alert' => null]; }
    $d = ch_event_date($dateText, $year); if (!$d) { return ['ok' => true, 'alert' => null]; }
    $s = ch_status($idx, $code, (string) $pl['name'], $d); if (!$s) { return ['ok' => true, 'alert' => null]; }
    $desc = ch_describe($s, (string) $pl['name'], $label !== '' ? $label : 'Événement', trim($dateText) ?: (string) $d[0], $d[0]);
    return ['ok' => true, 'alert' => ['state' => $s['state'], 'level' => $desc['level'], 'title' => $desc['title'], 'detail' => $desc['detail'], 'then' => $desc['then'], 'source' => $desc['source'], 'quote' => $desc['quote'], 'code' => $code, 'place_id' => $placeId, 'boundary' => $s['boundary']]];
}

function ch_event_check(PDO $pdo, int $eventId): array
{
    $st = $pdo->prepare('SELECT e.id, e.date_text, e.year, e.place_id, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.id=?'); $st->execute([$eventId]);
    $e = $st->fetch(PDO::FETCH_ASSOC); if (!$e) { throw new RuntimeException('Événement introuvable.'); }
    $r = ch_check($pdo, (int) $e['place_id'], (string) $e['date_text'], $e['year'], (string) $e['label']);
    $r['event_id'] = $eventId;
    return $r;
}

/** le lieu de la base pour une commune d'alors (code + nom) : trouvé, sinon créé (ancienne commune) */
function ch_place_for(PDO $pdo, string $code, string $name, array $like): array
{
    $st = $pdo->prepare("SELECT id, name FROM places WHERE admin4_code=? AND COALESCE(country,'France') IN ('France','') ORDER BY COALESCE(population,0) DESC, id");
    $st->execute([$code]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $p) { if (ch_fold((string) $p['name']) === ch_fold($name)) { return ['id' => (int) $p['id'], 'created' => false]; } }
    $st = $pdo->prepare("SELECT id, name, admin4_code FROM places WHERE name=? COLLATE NOCASE AND COALESCE(country,'France') IN ('France','')");
    $st->execute([$name]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $p) { $a4 = (string) ($p['admin4_code'] ?? ''); if ($a4 === '' || ch_dep($a4) === ch_dep($code)) { return ['id' => (int) $p['id'], 'created' => false]; } }
    // une position : la commune d'aujourd'hui qui l'a absorbée, sinon le lieu d'origine
    $idx = ch_index(); [$nowCode] = $idx ? ch_now($idx, $code) : [$code];
    $pos = $pdo->prepare("SELECT latitude, longitude, county, state, admin2_code FROM places WHERE admin4_code IN (?,?) AND latitude IS NOT NULL ORDER BY admin4_code=? DESC, COALESCE(population,0) DESC LIMIT 1");
    $pos->execute([$code, $nowCode, $code]); $p = $pos->fetch(PDO::FETCH_ASSOC) ?: [];
    $pdo->prepare("INSERT INTO places(name, county, state, country, latitude, longitude, admin4_code, admin2_code, description) VALUES(?,?,?,?,?,?,?,?,?)")
        ->execute([$name, (string) ($p['county'] ?? ($like['county'] ?? '')), (string) ($p['state'] ?? ($like['state'] ?? '')), 'France', $p['latitude'] ?? ($like['latitude'] ?? null), $p['longitude'] ?? ($like['longitude'] ?? null), $code, (string) ($p['admin2_code'] ?? ch_dep($code)),
            'Ancienne commune (code INSEE ' . $code . ') — INSEE, Code officiel géographique, historique des communes (Licence Ouverte 2.0).']);
    return ['id' => (int) $pdo->lastInsertId(), 'created' => true];
}

/** POST commune_hist_fix : mettre la commune d'alors sur l'événement ({event_id, code, name}), ou remettre un lieu ({event_id, place_id}) */
function ch_fix(PDO $pdo, array $data): array
{
    $eid = (int) ($data['event_id'] ?? 0);
    $st = $pdo->prepare('SELECT * FROM events WHERE id=?'); $st->execute([$eid]); $before = $st->fetch(PDO::FETCH_ASSOC);
    if (!$before) { throw new RuntimeException('Événement introuvable.'); }
    if (function_exists('assert_event_unlocked')) { assert_event_unlocked($pdo, $eid); }
    $created = false;
    if (isset($data['place_id'])) {
        $pid = (int) $data['place_id'];
        if ($pid && !$pdo->query('SELECT 1 FROM places WHERE id=' . $pid)->fetchColumn()) { throw new RuntimeException('Lieu introuvable.'); }
    } else {
        $code = (string) ($data['code'] ?? ''); $name = trim((string) ($data['name'] ?? ''));
        if (!preg_match('/^\d[\dAB]\d{2,3}$/', $code) || $name === '' || mb_strlen($name) > 120) { throw new RuntimeException('Commune inconnue.'); }
        $idx = ch_index();
        if (!$idx || !isset($idx['rows'][$code])) { throw new RuntimeException('Commune inconnue.'); }
        $like = [];
        if ($before['place_id']) { $q = $pdo->prepare('SELECT * FROM places WHERE id=?'); $q->execute([(int) $before['place_id']]); $like = $q->fetch(PDO::FETCH_ASSOC) ?: []; }
        $r = ch_place_for($pdo, $code, $name, $like); $pid = $r['id']; $created = $r['created'];
    }
    $pdo->prepare('UPDATE events SET place_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$pid ?: null, $eid]);
    // un lieu créé pour rien (↶ Annuler) : retiré s'il ne sert plus
    $drop = (int) ($data['drop_place'] ?? 0);
    if ($drop && $drop !== $pid && !$pdo->query('SELECT 1 FROM events WHERE place_id=' . $drop . ' LIMIT 1')->fetchColumn() && str_starts_with((string) $pdo->query('SELECT description FROM places WHERE id=' . $drop)->fetchColumn(), 'Ancienne commune (code INSEE')) {
        $pdo->exec('DELETE FROM places WHERE id=' . $drop);
    }
    $st->execute([$eid]); $after = $st->fetch(PDO::FETCH_ASSOC);
    $name = (string) $pdo->query('SELECT name FROM places WHERE id=' . (int) $pid)->fetchColumn();
    if (function_exists('log_change')) { log_change($pdo, 'event', $eid, 'update', 'Contrôle de la base : lieu corrigé (commune de l’époque) → « ' . $name . ' »', $before, $after); }
    return ['event_id' => $eid, 'before_place_id' => (int) ($before['place_id'] ?? 0), 'place_id' => $pid, 'place_name' => $name, 'created' => $created];
}

function ch_about(PDO $pdo): array
{
    $f = ch_files(); $idx = ch_index();
    return ['ok' => (bool) $idx, 'files' => $f ? ['mvt' => filesize($f['mvt']), 'com' => filesize($f['com'])] : null, 'communes' => $idx ? count($idx['rows']) : 0,
        'source' => 'INSEE, Code officiel géographique (millésime livré avec l’app)', 'url' => CH_SOURCE_URL, 'search_url' => CH_SEARCH_URL, 'licence' => CH_LICENCE, 'enabled' => ch_enabled($pdo)];
}

function ch_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'commune_hist_event' => ch_event_check($pdo, (int) ($q['event_id'] ?? 0)),
        'commune_hist_check' => ch_check($pdo, (int) ($q['place_id'] ?? 0), mb_substr((string) ($q['date_text'] ?? ''), 0, 120), null, mb_substr((string) ($q['label'] ?? ''), 0, 80)),
        'commune_hist_about' => ch_about($pdo),
        default => throw new RuntimeException('Action inconnue.'),
    };
}

function ch_api_post(PDO $pdo, string $action, array $data): array
{
    if ($action === 'commune_hist_fix') { return ch_fix($pdo, $data); }
    if ($action === 'commune_hist_setting') {
        $before = ht_setting($pdo, CH_SETTING, ['controle' => true]);
        $new = ['controle' => !empty($data['controle']) && $data['controle'] !== '0' && $data['controle'] !== 'false'];
        ht_save_setting($pdo, CH_SETTING, $new);
        return ['before' => $before, 'value' => $new];
    }
    throw new RuntimeException('Action inconnue.');
}
