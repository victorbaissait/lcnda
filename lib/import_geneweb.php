<?php
declare(strict_types=1);

/**
 * ⤒ GeneWeb (.gw) : le fichier texte de GeneWeb et de Geneanet (« gwu », syntaxe classique et « gwplus »).
 *
 * Lu d'après l'analyseur de GeneWeb lui-même (bin/gwc/gwcomp.ml) puis traduit en GEDCOM 5.5.1, importé par le même
 * moteur que tout le reste (import_gedcom_into_db) : un seul import, un seul aperçu, un seul « ↶ Annuler ».
 *
 * Blocs compris : « fam » (couple, mariage +date #mp #mn #ms, #nm #eng #noment #banns #contract #license #pacs #residence,
 * divorce -date / #sep, témoins « wit m: », src, csrc, cbp, comm, fevt…end fevt, beg…end des enfants), « notes …
 * beg … end notes », « pevt … end pevt » (#birt #bapt #deat #buri #crem #occu #resi… et tout « #Nom » propre, avec #p #c
 * #s, témoins « wit: #godp … », notes « note … »), « rel … beg … end » (adoption, parrain, nourricier…), « notes-db »,
 * « page-ext », « wizard-note » (gardées à part), « encoding: utf-8 », « gwplus ».
 * Personnes : Nom Prénom.occ, {alias de prénom}, #salias, (nom public), #image, #nick, #alias, [titres], #apriv,
 * #occu, #src, naissance date #bp #bn #bs, !baptême #pp #pn #ps, décès (date, k/m/e/s + date, mj, od, 0, ?) #dp #dn #ds,
 * #buri / #crem date #rp #rn #rs.
 * Dates : 12/5/1835, 5/1835, 1835, ~ ? < > devant, 1880..1885, 1880|1885, suffixes J (julien), F (républicain),
 * H (hébreu, gardée en texte), 0(texte libre).
 */

const GW_MAX_BYTES = 300 * 1048576;  // 300 Mo
const GW_MAX_LINES = 8000000;

/** « Jean_Pierre » → « Jean Pierre », « a\_b » → « a_b » (copy_decode de GeneWeb) */
function gw_decode(string $s): string
{
    $out = '';
    $n = strlen($s);
    for ($i = 0; $i < $n; $i++) {
        $c = $s[$i];
        if ($c === '\\' && $i + 1 < $n) { $out .= $s[++$i]; }
        elseif ($c === '_') { $out .= ' '; }
        else { $out .= $c; }
    }
    return $out;
}

/** Les mots d'une ligne (séparés par espaces ou tabulations), décodés. */
function gw_fields(string $line): array
{
    $out = [];
    foreach (preg_split('/[ \t]+/', trim($line)) ?: [] as $w) { if ($w !== '') { $out[] = gw_decode($w); } }
    return $out;
}

/** Vrai si le mot commence comme une date GeneWeb. */
function gw_is_date(string $w): bool
{
    return $w !== '' && (bool) preg_match('/^[~?<>\-0-9]/', $w);
}

/** Une date GeneWeb → date GEDCOM 5.5.1 (« ABT 12 MAY 1835 », « BET 1880 AND 1885 », « @#DJULIAN@ … », « (texte) ») ; '' si vide. */
function gw_date(string $s): string
{
    $s = trim($s);
    if ($s === '' || $s === '0') { return ''; }
    if (preg_match('/^0\((.*)\)$/s', $s, $m)) { return '(' . str_replace(['(', ')'], '', trim($m[1])) . ')'; }
    $prec = '';
    if (in_array($s[0], ['~', '?', '<', '>'], true)) { $prec = $s[0]; $s = substr($s, 1); }
    $cal = 'G';
    if (preg_match('/[GJFH]$/', $s)) { $cal = substr($s, -1); $s = substr($s, 0, -1); }
    $or = null; $range = null;
    if (str_contains($s, '..')) { [$s, $range] = explode('..', $s, 2); }
    elseif (str_contains($s, '|')) { [$s, $or] = explode('|', $s, 2); }
    $one = static function (string $dmy) use ($cal): ?string {
        if (!preg_match('/^(-?\d+)(?:\/(-?\d+))?(?:\/(-?\d+))?$/', $dmy, $m)) { return null; }
        $parts = array_values(array_filter([$m[1], $m[2] ?? '', $m[3] ?? ''], static fn($x) => $x !== ''));
        [$d, $mo, $y] = match (count($parts)) { 3 => [(int) $parts[0], (int) $parts[1], (int) $parts[2]], 2 => [0, (int) $parts[0], (int) $parts[1]], default => [0, 0, (int) $parts[0]] };
        if ($y === 0 && $mo === 0) { return null; }
        if ($mo < 0 || $mo > 13 || $d < 0 || $d > 31) { return null; }
        $bc = $y < 0; $y = abs($y);
        $months = $cal === 'F' ? GEDCOM_REPUBLICAN_MONTHS : GEDCOM_MONTHS;
        if ($mo === 13 && $cal !== 'F') { return null; }
        $txt = ($d ? $d . ' ' : '') . ($mo ? $months[$mo - 1] . ' ' : '') . $y . ($bc ? ' B.C.' : '');
        return match ($cal) { 'J' => '@#DJULIAN@ ' . $txt, 'F' => '@#DFRENCH R@ ' . $txt, default => $txt };
    };
    if ($cal === 'H') { return '(' . ($prec === '~' ? 'vers ' : '') . str_replace(['(', ')'], '', $s) . ' (calendrier hébraïque))'; }
    $a = $one($s);
    if ($a === null) { return '(' . str_replace(['(', ')'], '', $prec . $s . ($range !== null ? '..' . $range : '') . ($or !== null ? '|' . $or : '')) . ')'; }
    if ($range !== null) { $b = $one($range); return $b !== null ? 'BET ' . $a . ' AND ' . $b : $a; }
    if ($or !== null) { $b = $one($or); return $b !== null ? '(' . gedcom_date_to_text($a) . ' ou ' . gedcom_date_to_text($b) . ')' : $a; }
    return match ($prec) { '~' => 'ABT ' . $a, '?' => 'EST ' . $a, '<' => 'BEF ' . $a, '>' => 'AFT ' . $a, default => $a };
}

/**
 * Un fichier .gw → [texte GEDCOM 5.5.1, nombres lus]. Les blocs illisibles sont sautés (comme « gwc -nofail ») et dits
 * dans les avertissements (ligne, début du texte).
 */
function geneweb_to_gedcom(string $raw): array
{
    if (strlen($raw) > GW_MAX_BYTES) { throw new RuntimeException('Ce fichier GeneWeb est trop gros (plus de 300 Mo).'); }
    if (str_starts_with($raw, "\xEF\xBB\xBF")) { $raw = substr($raw, 3); }
    if (str_contains(substr($raw, 0, 4096), "\0")) { throw new RuntimeException('Ce fichier n’est pas un fichier texte GeneWeb (.gw) : il contient des données binaires. Une base GeneWeb (.gwb) ne se lit pas : dans GeneWeb, fais « gwu » (ou « Exporter en .gw ») puis importe ce fichier.'); }
    if (!mb_check_encoding($raw, 'UTF-8')) { $raw = mb_convert_encoding($raw, 'UTF-8', 'ISO-8859-1'); }
    $lines = preg_split('/\r\n|\r|\n/', $raw) ?: [];
    if (count($lines) > GW_MAX_LINES) { throw new RuntimeException('Ce fichier GeneWeb a trop de lignes.'); }
    if (!preg_match('/^\s*(fam|notes|pevt|rel)\s/m', substr($raw, 0, 2000000))) { throw new RuntimeException('Ce fichier n’est pas un fichier GeneWeb (.gw) : aucun bloc « fam », « pevt » ou « notes » trouvé.'); }

    $P = [];          // personnes : n° => données
    $keyOf = [];      // « nom|prénom|occ » → n°
    $F = [];          // familles
    $warn = [];
    $counts = ['persons' => 0, 'families' => 0, 'events' => 0, 'notes' => 0, 'witnesses' => 0, 'sources' => 0, 'skipped_blocks' => 0, 'db_notes' => 0];
    $i = 0; $n = count($lines);
    $fail = static function (string $msg) { throw new InvalidArgumentException($msg); };

    $newPerson = static function (string $sn, string $fn, int $occ) use (&$P): int {
        $id = count($P) + 1;
        $P[$id] = ['sn' => $sn, 'fn' => $fn, 'occ' => $occ, 'sex' => '', 'main' => [], 'pevt' => [], 'notes' => [], 'names' => [], 'occu' => '', 'src' => '',
            'image' => '', 'titles' => [], 'private' => false, 'famc' => [], 'fams' => [], 'asso' => [], 'defined' => false];
        return $id;
    };
    $person = static function (string $sn, string $fn, int $occ) use (&$keyOf, $newPerson): int {
        if ($sn === '?' || $fn === '?') { return $newPerson($sn === '?' ? '' : $sn, $fn === '?' ? '' : $fn, $occ); } // « ? ? » : toujours une personne à part
        $k = mb_strtolower($sn . '|' . $fn . '|' . $occ);
        return $keyOf[$k] ??= $newPerson($sn, $fn, $occ);
    };
    $getField = static function (string $lab, array &$l): string {
        if (count($l) >= 2 && $l[0] === $lab) { $v = trim($l[1]); $l = array_slice($l, 2); return $v; }
        return '';
    };
    $isNameStart = static fn(string $w): bool => $w !== '' && (bool) preg_match('/^[\p{L}0-9? ]/u', $w);
    $fstName = static function (array &$l) use ($fail): array {
        if (!$l || !preg_match('/^[\p{L}\[0-9? ]/u', $l[0])) { $fail('prénom attendu'); }
        $x = trim(array_shift($l)); $occ = 0;
        if (preg_match('/^(.*)\.(\d+)$/', $x, $m)) { $x = $m[1]; $occ = (int) $m[2]; }
        return [$x, $occ];
    };
    $getName = static function (array &$l) use ($isNameStart): string {
        if (!$l || in_array($l[0], ['#nick', '#alias'], true) || $l[0][0] === '{' || !$isNameStart($l[0])) { return ''; }
        return trim(array_shift($l));
    };
    // set_infos : tout ce qui suit le nom d'une personne, dans l'ordre de GeneWeb
    $setInfos = static function (int $id, array &$l, string $csrc = '', string $cbp = '') use (&$P, $getField): void {
        $p = &$P[$id];
        $p['defined'] = true;
        while ($l && preg_match('/^\{(.*)\}$/s', $l[0], $m)) { array_shift($l); $p['names'][] = ['first' => trim($m[1])]; }
        while ($l && $l[0] === '#salias' && count($l) >= 2) { $p['names'][] = ['last' => trim($l[1])]; $l = array_slice($l, 2); }
        if ($l && preg_match('/^\((.*)\)$/s', $l[0], $m)) { array_shift($l); $p['names'][] = ['aka' => trim($m[1])]; }
        if ($l && in_array($l[0], ['#image', '#photo'], true) && count($l) >= 2) { $p['image'] = trim($l[1]); $l = array_slice($l, 2); }
        while ($l && $l[0] === '#nick' && count($l) >= 2) { $p['names'][] = ['nick' => trim($l[1])]; $l = array_slice($l, 2); }
        while ($l && $l[0] === '#alias' && count($l) >= 2) { $p['names'][] = ['aka' => trim($l[1])]; $l = array_slice($l, 2); }
        while ($l && preg_match('/^\[(.*)\]$/s', $l[0], $m)) { array_shift($l); $p['titles'][] = $m[1]; }
        if ($l && in_array($l[0], ['#apubl', '#apriv', '#afriend', '#semipub'], true)) { if (array_shift($l) === '#apriv') { $p['private'] = true; } }
        if (($o = $getField('#occu', $l)) !== '') { $p['occu'] = $o; }
        if (($s = $getField('#src', $l)) !== '') { $p['src'] = $s; } elseif ($csrc !== '' && $p['src'] === '') { $p['src'] = $csrc; }
        $ev = static function (string $tag, string $date, string $place, string $note, string $src, string $cause = '') use (&$p): void {
            if ($date === '' && $place === '' && $note === '' && $src === '' && $cause === '' && !in_array($tag, ['DEAT', 'BURI', 'CREM'], true)) { return; }
            $p['main'][$tag] = ['date' => $date, 'place' => $place, 'note' => $note, 'src' => $src, 'cause' => $cause];
        };
        $birth = null;
        if ($l && $l[0][0] !== '!' && gw_is_date($l[0])) { $birth = gw_date(array_shift($l)); }
        $bp = $getField('#bp', $l); $bn = $getField('#bn', $l); $bs = $getField('#bs', $l);
        $ev('BIRT', (string) $birth, $bp !== '' ? $bp : $cbp, $bn, $bs);
        $bapt = null;
        if ($l && $l[0][0] === '!' && strlen($l[0]) > 1 && gw_is_date(substr($l[0], 1))) { $bapt = gw_date(substr(array_shift($l), 1)); }
        elseif ($l && $l[0] === '!') { array_shift($l); $bapt = ''; }
        $pp = $getField('#pp', $l); if ($pp === '') { $pp = $getField('#bp', $l); }
        $pn = $getField('#pn', $l); $ps = $getField('#ps', $l);
        if ($bapt !== null || $pp !== '' || $pn !== '' || $ps !== '') { $p['main']['BAPM'] = ['date' => (string) $bapt, 'place' => $pp, 'note' => $pn, 'src' => $ps, 'cause' => '']; }
        $death = null; $dcause = '';
        if ($l) {
            $x = $l[0];
            if ($x === '?') { array_shift($l); }
            elseif ($x === 'mj') { array_shift($l); $death = ''; $dcause = 'Mort jeune'; }
            elseif ($x === 'od') { array_shift($l); $death = ''; }
            else {
                $k = ['k' => 'Tué', 'm' => 'Assassiné', 'e' => 'Exécuté', 's' => 'Disparu'][$x[0]] ?? '';
                $rest = $k !== '' ? substr($x, 1) : $x;
                if ($rest !== '' && gw_is_date($rest)) { array_shift($l); $death = gw_date($rest); $dcause = $k; }
            }
        }
        $dp = $getField('#dp', $l); $dn = $getField('#dn', $l); $ds = $getField('#ds', $l);
        if ($death !== null || $dp !== '' || $dn !== '' || $ds !== '') { $ev('DEAT', (string) $death, $dp, $dn, $ds, $dcause); }
        if ($l && in_array($l[0], ['#buri', '#crem'], true)) {
            $tag = array_shift($l) === '#buri' ? 'BURI' : 'CREM';
            $bd = ($l && gw_is_date($l[0])) ? gw_date(array_shift($l)) : '';
            $rp = $getField('#rp', $l); $rn = $getField('#rn', $l); $rs = $getField('#rs', $l);
            $ev($tag, $bd, $rp, $rn, $rs);
        }
        unset($p);
    };
    // parse_parent : « Nom Prénom.occ [infos] » ; défini s'il reste des mots (sauf un « + » qui suit)
    $parseParent = static function (array &$l, bool $stopAtPlus = true) use ($getName, $fstName, $person, $setInfos): array {
        $sn = $getName($l);
        [$fn, $occ] = $fstName($l);
        $id = $person($sn, $fn, $occ);
        $bogus = $sn === '?' || $fn === '?' || $sn === '' && $fn === '';
        $defined = $bogus || ($l && !($stopAtPlus && $l[0] !== '' && $l[0][0] === '+'));
        if ($defined && $l) { $setInfos($id, $l); }
        return [$id, $sn];
    };
    $wkind = static function (array &$l): string {
        $map = ['#godp' => 'Godparent', '#offi' => 'Officier d’état civil', '#notr' => 'Notaire', '#reli' => 'Officiant', '#info' => 'Déclarant', '#atte' => 'Présent', '#ment' => 'Mentionné', '#othe' => 'Présent'];
        if ($l && isset($map[$l[0]])) { return $map[array_shift($l)]; }
        if ($l && $l[0] !== '' && $l[0][0] === '#') { array_shift($l); }
        return 'Witness';
    };
    $realLine = static function () use (&$i, $n, $lines): ?string {
        while ($i < $n) { $x = $lines[$i++]; if (trim($x) !== '' && $x[0] !== '#') { return $x; } }
        return null;
    };
    // un événement d'un bloc pevt / fevt, puis ses témoins (wit) et ses notes (note)
    $readEvents = static function (string $end) use (&$i, $n, $lines, $wkind, $parseParent, $getField, &$counts, &$P, $fail): array {
        $evs = [];
        while (true) {
            if ($i >= $n) { $fail('« ' . $end . ' » manquant'); }
            $x = rtrim($lines[$i++]);
            if (trim($x) === '') { continue; }
            if (trim($x) === $end) { break; }
            $l = gw_fields($x);
            if (!$l || $l[0][0] !== '#') { $fail('événement attendu'); }
            $name = substr(array_shift($l), 1);
            $date = ($l && $l[0][0] !== '!' && gw_is_date($l[0])) ? gw_date(array_shift($l)) : '';
            $place = $getField('#p', $l); $cause = $getField('#c', $l); $src = $getField('#s', $l);
            if ($l) { $fail('mots en trop'); }
            $wit = []; $notes = [];
            while ($i < $n) {
                $y = rtrim($lines[$i]); $f = gw_fields($y);
                if ($f && in_array($f[0], ['wit', 'wit:'], true)) {
                    $i++; array_shift($f);
                    $sex = ($f && in_array($f[0], ['m:', 'f:'], true)) ? array_shift($f) : '';
                    $role = $wkind($f);
                    [$wid] = $parseParent($f, false);
                    if ($sex !== '' && ($P[$wid]['sex'] ?? '') === '') { $P[$wid]['sex'] = $sex === 'm:' ? 'M' : 'F'; }
                    $wnote = [];
                    while ($i < $n && preg_match('/^wnote(?:\s(.*))?$/', $lines[$i], $wm)) { $wnote[] = $wm[1] ?? ''; $i++; }
                    $wit[] = [$wid, $role, trim(implode("\n", $wnote))];
                    $counts['witnesses']++;
                } elseif (preg_match('/^note(?:\s(.*))?$/', $y, $nm)) { $notes[] = $nm[1] ?? ''; $i++; }
                else { break; }
            }
            $evs[] = ['name' => $name, 'date' => $date, 'place' => $place, 'cause' => $cause, 'src' => $src, 'note' => trim(implode("\n", $notes)), 'wit' => $wit];
        }
        return $evs;
    };
    $blockEnd = static function (string $end) use (&$i, $n, $lines): string {
        $buf = [];
        while ($i < $n) { $x = rtrim($lines[$i++]); if ($x === $end) { return trim(implode("\n", $buf)); } $buf[] = $x; }
        return trim(implode("\n", $buf));
    };
    $dbNotes = [];

    while (($line = $realLine()) !== null) {
        $startLine = $i;
        $l = gw_fields($line);
        $head = $l[0] ?? '';
        try {
            if ($head === 'encoding:' || $head === 'gwplus') { continue; }
            if ($head === 'fam') {
                array_shift($l);
                [$h, $surname] = $parseParent($l, true);
                if (!$l || $l[0][0] !== '+') { $fail('« + » attendu entre les deux conjoints'); }
                $m = array_shift($l);
                $fam = ['husb' => $h, 'wife' => 0, 'rel' => 'married', 'marr' => ['date' => strlen($m) > 1 ? gw_date(substr($m, 1)) : '', 'place' => '', 'note' => '', 'src' => ''],
                    'div' => null, 'sep' => false, 'wit' => [], 'src' => '', 'comm' => '', 'fevt' => [], 'kids' => []];
                $sexes = ['M', 'F'];
                $relWords = ['#nm' => 'notmarried', '#eng' => 'engaged', '#noment' => 'nomention', '#nsck' => 'notmarried', '#nsckm' => 'married', '#banns' => 'banns', '#contract' => 'contract', '#license' => 'license', '#pacs' => 'pacs', '#residence' => 'residence'];
                if ($l && isset($relWords[$l[0]])) {
                    $fam['rel'] = $relWords[array_shift($l)];
                    if ($l && strlen($l[0]) === 2 && preg_match('/^[mf?][mf?]$/', $l[0])) { $c = array_shift($l); $sexes = [$c[0] === 'm' ? 'M' : ($c[0] === 'f' ? 'F' : ''), $c[1] === 'm' ? 'M' : ($c[1] === 'f' ? 'F' : '')]; }
                }
                $fam['marr']['place'] = $getField('#mp', $l); $fam['marr']['note'] = $getField('#mn', $l); $fam['marr']['src'] = $getField('#ms', $l);
                if ($l && $l[0] !== '' && $l[0][0] === '-') { $d = array_shift($l); $fam['div'] = strlen($d) > 1 ? gw_date(substr($d, 1)) : ''; }
                elseif ($l && $l[0] === '#sep') { array_shift($l); $fam['sep'] = true; }
                [$w] = $parseParent($l, false);
                if ($l) { $fail('mots en trop après la conjointe'); }
                $fam['wife'] = $w;
                foreach ([[$h, $sexes[0]], [$w, $sexes[1]]] as [$pid, $sx]) { if ($sx !== '' && $P[$pid]['sex'] === '') { $P[$pid]['sex'] = $sx; } }
                $next = $realLine();
                while ($next !== null && in_array(($f = gw_fields($next))[0] ?? '', ['wit', 'wit:'], true)) {
                    array_shift($f);
                    $sx = ($f && in_array($f[0], ['m:', 'f:'], true)) ? array_shift($f) : '';
                    [$wid] = $parseParent($f, false);
                    if ($sx !== '' && $P[$wid]['sex'] === '') { $P[$wid]['sex'] = $sx === 'm:' ? 'M' : 'F'; }
                    $fam['wit'][] = [$wid, 'Witness', '']; $counts['witnesses']++;
                    $next = $realLine();
                }
                $csrc = ''; $cbp = '';
                foreach (['src', 'csrc', 'cbp'] as $kw) {
                    if ($next !== null && preg_match('/^' . $kw . '\s+(.*)$/', $next, $mm)) {
                        $v = gw_decode(trim($mm[1]));
                        if ($kw === 'src') { $fam['src'] = $v; } elseif ($kw === 'csrc') { $csrc = $v; } else { $cbp = $v; }
                        $next = $realLine();
                    }
                }
                if ($next !== null && preg_match('/^comm(?:\s(.*))?$/', $next, $mm)) { $fam['comm'] = trim($mm[1] ?? ''); $next = $realLine(); }
                if ($next !== null && trim($next) === 'fevt') { $fam['fevt'] = $readEvents('end fevt'); $next = $realLine(); }
                if ($next !== null && trim($next) === 'beg') {
                    while (true) {
                        $c = $realLine();
                        if ($c === null) { $fail('« end » des enfants manquant'); }
                        if (trim($c) === 'end') { break; }
                        $cl = gw_fields($c);
                        if (($cl[0] ?? '') !== '-') { $fail('ligne d’enfant attendue (« - … »)'); }
                        array_shift($cl);
                        $sx = '';
                        if (count($cl) > 1 && in_array($cl[0], ['h', 'm', 'f'], true)) { $sx = array_shift($cl) === 'f' ? 'F' : 'M'; }
                        [$fn, $occ] = $fstName($cl);
                        $sn = $surname;
                        if ($cl && ($cl[0] === '?' || !preg_match('/^[<>!~?\-0-9{#(\[]/', $cl[0]))) { $sn = trim(array_shift($cl)); }
                        $cid = $person($sn, $fn, $occ);
                        $setInfos($cid, $cl, $csrc, $cbp);
                        if ($cl) { $fail('mots en trop sur la ligne d’un enfant'); }
                        if ($sx !== '' && $P[$cid]['sex'] === '') { $P[$cid]['sex'] = $sx; }
                        $fam['kids'][] = [$cid, 'birth'];
                    }
                    $next = null;
                }
                if ($next !== null) { $i--; } // la ligne lue en trop (bloc suivant) sera relue
                $F[] = $fam;
                continue;
            }
            if ($head === 'notes' && count($l) === 1) { $dbNotes[] = $blockEnd('end notes'); continue; }
            if ($head === 'notes') {
                array_shift($l);
                $sn = $getName($l); [$fn, $occ] = $fstName($l);
                $id = $person($sn, $fn, $occ);
                $b = $realLine();
                if ($b === null || trim($b) !== 'beg') { $fail('« beg » attendu après « notes »'); }
                $txt = $blockEnd('end notes');
                if ($txt !== '') { $P[$id]['notes'][] = $txt; }
                continue;
            }
            if ($head === 'notes-db') { $t = $blockEnd('end notes-db'); if ($t !== '') { $dbNotes[] = $t; } continue; }
            if ($head === 'page-ext') { $t = $blockEnd('end page-ext'); if ($t !== '') { $dbNotes[] = 'Page « ' . trim(substr(trim($line), 8)) . ' »' . "\n" . $t; } continue; }
            if ($head === 'wizard-note') { $blockEnd('end wizard-note'); continue; }
            if ($head === 'pevt') {
                array_shift($l);
                [$id] = $parseParent($l, false);
                foreach ($readEvents('end pevt') as $e) { $P[$id]['pevt'][] = $e; }
                continue;
            }
            if ($head === 'rel') {
                array_shift($l);
                [$id] = $parseParent($l, false);
                $b = $realLine();
                if ($b === null || trim($b) !== 'beg') { $fail('« beg » attendu après « rel »'); }
                while (true) {
                    if ($i >= $n) { $fail('« end » manquant'); }
                    $x = trim($lines[$i++]);
                    if ($x === 'end') { break; }
                    if ($x === '') { continue; }
                    $r = gw_fields($x);
                    if (($r[0] ?? '') !== '-' || count($r) < 3) { $fail('relation attendue'); }
                    $kind = rtrim($r[1], ':'); $both = str_ends_with($r[1], ':'); $r = array_slice($r, 2);
                    $kinds = ['adop' => 'adopted', 'reco' => 'Reconnaissance', 'cand' => 'Parent possible', 'godp' => 'Godparent', 'fost' => 'foster'];
                    if (!isset($kinds[$kind])) { $fail('relation inconnue « ' . $kind . ' »'); }
                    $fa = 0; $mo = 0;
                    if ($both) { [$fa] = $parseParent($r, true); if (($r[0] ?? '') !== '+') { $fail('« + » attendu'); } array_shift($r); [$mo] = $parseParent($r, false); }
                    elseif (($r[0] ?? '') === 'fath:') { array_shift($r); [$fa] = $parseParent($r, false); }
                    elseif (($r[0] ?? '') === 'moth:') { array_shift($r); [$mo] = $parseParent($r, false); }
                    else { $fail('« fath: » ou « moth: » attendu'); }
                    if ($fa && $P[$fa]['sex'] === '') { $P[$fa]['sex'] = 'M'; }
                    if ($mo && $P[$mo]['sex'] === '') { $P[$mo]['sex'] = 'F'; }
                    if (in_array($kind, ['adop', 'fost'], true)) {
                        $F[] = ['husb' => $fa, 'wife' => $mo, 'rel' => 'nomention', 'marr' => ['date' => '', 'place' => '', 'note' => '', 'src' => ''], 'div' => null, 'sep' => false, 'wit' => [], 'src' => '', 'comm' => '', 'fevt' => [], 'kids' => [[$id, $kinds[$kind]]]];
                    } else {
                        foreach ([$fa, $mo] as $who) { if ($who) { $P[$id]['asso'][] = [$who, $kinds[$kind]]; } }
                    }
                }
                continue;
            }
            $fail('bloc inconnu « ' . mb_substr($head, 0, 30) . ' »');
        } catch (InvalidArgumentException $e) {
            $counts['skipped_blocks']++;
            if (count($warn) < 20) { $warn[] = 'Ligne ' . $startLine . ' : ' . $e->getMessage() . ' — « ' . mb_substr(trim($line), 0, 70) . ' » (bloc laissé de côté)'; }
            // reprendre au bloc suivant : la prochaine ligne qui commence par un mot de bloc
            while ($i < $n && !preg_match('/^(fam|notes|pevt|rel|notes-db|page-ext|wizard-note)(\s|$)/', $lines[$i])) { $i++; }
        }
    }
    if (!$P) { throw new RuntimeException('Aucune personne lue dans ce fichier GeneWeb' . ($warn ? ' : ' . $warn[0] : '.')); }

    // ── GEDCOM ──
    $out = ['0 HEAD', '1 SOUR GeneWeb', '2 NAME GeneWeb (fichier .gw)', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
    $txt = static function (int $lvl, string $tag, string $v) use (&$out): void {
        $rows = explode("\n", str_replace("\r", '', trim($v)));
        foreach ($rows as $k => $row) { $row = str_starts_with($row, '@') ? '@' . $row : $row; $out[] = $k === 0 ? "$lvl $tag" . ($row !== '' ? " $row" : '') : ($lvl + 1) . ' CONT' . ($row !== '' ? " $row" : ''); }
    };
    $plac = static fn(string $p): string => str_replace(['@'], ['@@'], $p);
    $evTags = ['birt' => 'BIRT', 'bapt' => 'BAPM', 'deat' => 'DEAT', 'buri' => 'BURI', 'crem' => 'CREM', 'barm' => 'BARM', 'basm' => 'BASM', 'bles' => 'BLES',
        'cens' => 'CENS', 'conf' => 'CONF', 'educ' => 'EDUC', 'emig' => 'EMIG', 'fcom' => 'FCOM', 'grad' => 'GRAD', 'immi' => 'IMMI', 'natu' => 'NATU',
        'occu' => 'OCCU', 'ordn' => 'ORDN', 'prop' => 'PROP', 'resi' => 'RESI', 'reti' => 'RETI', 'will' => 'WILL', 'mser' => '_MILT', 'circ' => '_CIRC', 'elec' => '_ELEC',
        'marr' => 'MARR', 'enga' => 'ENGA', 'div' => 'DIV', 'anul' => 'ANUL', 'marb' => 'MARB', 'marc' => 'MARC', 'marl' => 'MARL'];
    $evLabels = ['acco' => 'Accomplissement', 'acqu' => 'Acquisition', 'adhe' => 'Adhésion', 'awar' => 'Décoration', 'chgn' => 'Changement de nom', 'degr' => 'Diplôme',
        'demm' => 'Démobilisation', 'dist' => 'Distinction', 'exco' => 'Excommunication', 'fune' => 'Obsèques', 'hosp' => 'Hospitalisation', 'illn' => 'Maladie',
        'lpas' => 'Liste de passagers', 'mdis' => 'Distinction militaire', 'mobm' => 'Mobilisation', 'mpro' => 'Promotion militaire', 'vteb' => 'Vente de bien',
        'nmar' => 'Pas de mariage', 'nmen' => 'Pas de mention', 'sep' => 'Séparation', 'pacs' => 'PACS', 'bapl' => 'Baptême (SDJ)', 'conl' => 'Confirmation (SDJ)',
        'endl' => 'Dotation (SDJ)', 'dotl' => 'Dotation (SDJ)', 'flkl' => 'Lien familial (SDJ)', 'slgc' => 'Scellement (SDJ)', 'slgp' => 'Scellement (SDJ)', 'slgs' => 'Scellement (SDJ)'];
    $writeEvent = static function (array $e, string $name) use (&$out, $txt, $plac, $evTags, $evLabels, &$counts): void {
        $k = strtolower($name);
        $tag = $evTags[$k] ?? 'EVEN';
        $out[] = '1 ' . $tag . (($tag === 'DEAT' || $tag === 'MARR') && ($e['date'] ?? '') === '' && ($e['place'] ?? '') === '' ? ' Y' : '');
        if ($tag === 'EVEN') { $out[] = '2 TYPE ' . ($evLabels[$k] ?? gw_decode($name)); }
        if (($e['date'] ?? '') !== '') { $out[] = '2 DATE ' . $e['date']; }
        if (($e['place'] ?? '') !== '') { $out[] = '2 PLAC ' . $plac($e['place']); }
        if (($e['cause'] ?? '') !== '') { $out[] = '2 CAUS ' . $e['cause']; }
        if (($e['note'] ?? '') !== '') { $txt(2, 'NOTE', $e['note']); }
        if (($e['src'] ?? '') !== '') { $txt(2, 'SOUR', $e['src']); }
        foreach ($e['wit'] ?? [] as [$wid, $role, $wn]) { $out[] = '2 ASSO @I' . $wid . '@'; $out[] = '3 RELA ' . $role; if ($wn !== '') { $txt(3, 'NOTE', $wn); } }
        $counts['events']++;
    };
    foreach ($F as $fi => $f) {
        foreach ([$f['husb'], $f['wife']] as $pid) { if ($pid) { $P[$pid]['fams'][] = $fi + 1; } }
        foreach ($f['kids'] as [$cid, $how]) { $P[$cid]['famc'][] = [$fi + 1, $how]; }
    }
    foreach ($P as $id => $p) {
        $out[] = '0 @I' . $id . '@ INDI';
        $out[] = '1 NAME ' . trim($p['fn']) . ' /' . trim($p['sn']) . '/';
        if ($p['fn'] !== '') { $out[] = '2 GIVN ' . $p['fn']; }
        if ($p['sn'] !== '') { $out[] = '2 SURN ' . $p['sn']; }
        foreach ($p['names'] as $nm) {
            if (isset($nm['nick'])) { $out[] = '2 NICK ' . $nm['nick']; }
            if (isset($nm['aka'])) { $out[] = '2 _AKA ' . $nm['aka']; }
        }
        foreach ($p['names'] as $nm) {
            if (isset($nm['first'])) { $out[] = '1 NAME ' . $nm['first'] . ' /' . $p['sn'] . '/'; $out[] = '2 TYPE aka'; }
            if (isset($nm['last'])) { $out[] = '1 NAME ' . $p['fn'] . ' /' . $nm['last'] . '/'; $out[] = '2 TYPE aka'; }
        }
        if ($p['sex'] !== '') { $out[] = '1 SEX ' . $p['sex']; }
        if ($p['private']) { $out[] = '1 RESN privacy'; }
        $pevtTags = [];
        foreach ($p['pevt'] as $e) { $pevtTags[strtolower($e['name'])] = true; }
        $order = ['BIRT' => 'birt', 'BAPM' => 'bapt', 'DEAT' => 'deat', 'BURI' => 'buri', 'CREM' => 'crem'];
        foreach ($order as $tag => $k) {
            if (!isset($p['main'][$tag])) { continue; }
            if (isset($pevtTags[$k])) { // le même événement dans « pevt » : on garde celui-là, complété par la ligne principale
                foreach ($p['pevt'] as &$pe) { if (strtolower($pe['name']) === $k) { foreach (['date', 'place', 'note', 'src', 'cause'] as $kk) { if (($pe[$kk] ?? '') === '' && ($p['main'][$tag][$kk] ?? '') !== '') { $pe[$kk] = $p['main'][$tag][$kk]; } } break; } }
                unset($pe);
                continue;
            }
            $writeEvent($p['main'][$tag], $k);
        }
        if ($p['occu'] !== '' && !isset($pevtTags['occu'])) { $out[] = '1 OCCU ' . $p['occu']; $counts['events']++; }
        foreach ($p['titles'] as $t) {
            $parts = explode(':', $t);
            if (count($parts) < 2 || trim($parts[1]) === '') { continue; }
            $out[] = '1 TITL ' . trim(gw_decode($parts[1]));
            if (trim($parts[2] ?? '') !== '') { $out[] = '2 PLAC ' . $plac(trim(gw_decode($parts[2]))); }
            $a = gw_date(trim($parts[3] ?? '')); $b = gw_date(trim($parts[4] ?? ''));
            if ($a !== '' && $b !== '' && $a[0] !== '(' && $b[0] !== '(') { $out[] = '2 DATE FROM ' . $a . ' TO ' . $b; } elseif ($a !== '') { $out[] = '2 DATE ' . ($a[0] === '(' ? $a : 'FROM ' . $a); } elseif ($b !== '' && $b[0] !== '(') { $out[] = '2 DATE TO ' . $b; }
            $counts['events']++;
        }
        foreach ($p['pevt'] as $e) { $writeEvent($e, $e['name']); }
        if ($p['src'] !== '') { $txt(1, 'SOUR', $p['src']); $counts['sources']++; }
        foreach ($p['notes'] as $nt) { $txt(1, 'NOTE', $nt); $counts['notes']++; }
        if ($p['image'] !== '') { $out[] = '1 OBJE'; $out[] = '2 FILE ' . $p['image']; }
        foreach ($p['asso'] as [$who, $role]) { $out[] = '1 ASSO @I' . $who . '@'; $out[] = '2 RELA ' . $role; }
        foreach ($p['famc'] as [$fid, $how]) { $out[] = '1 FAMC @F' . $fid . '@'; if ($how !== 'birth') { $out[] = '2 PEDI ' . $how; } }
        foreach (array_unique($p['fams']) as $fid) { $out[] = '1 FAMS @F' . $fid . '@'; }
    }
    foreach ($F as $fi => $f) {
        $out[] = '0 @F' . ($fi + 1) . '@ FAM';
        if ($f['husb']) { $out[] = '1 HUSB @I' . $f['husb'] . '@'; }
        if ($f['wife']) { $out[] = '1 WIFE @I' . $f['wife'] . '@'; }
        foreach ($f['kids'] as [$cid]) { $out[] = '1 CHIL @I' . $cid . '@'; }
        $fevtNames = array_map(static fn($e) => strtolower($e['name']), $f['fevt']);
        $relTag = ['married' => 'marr', 'engaged' => 'enga', 'banns' => 'marb', 'contract' => 'marc', 'license' => 'marl', 'pacs' => 'pacs', 'residence' => 'resi'][$f['rel']] ?? null;
        if ($relTag !== null && !in_array($relTag, $fevtNames, true)) {
            $m = $f['marr'] + ['wit' => $f['rel'] === 'married' ? $f['wit'] : []];
            if ($relTag === 'marr' || $m['date'] !== '' || $m['place'] !== '') { $writeEvent($m, $relTag); }
        } elseif ($relTag !== null) {
            foreach ($f['fevt'] as &$fe) { if (strtolower($fe['name']) === $relTag) { foreach (['date', 'place', 'note', 'src'] as $kk) { if (($fe[$kk] ?? '') === '' && ($f['marr'][$kk] ?? '') !== '') { $fe[$kk] = $f['marr'][$kk]; } } $have = array_column($fe['wit'], 0); foreach ($f['wit'] as $fw) { if (!in_array($fw[0], $have, true)) { $fe['wit'][] = $fw; } } break; } }
            unset($fe);
        }
        if ($f['rel'] === 'notmarried' && $f['wit']) { $out[] = '1 NOTE Témoins : ' . implode(', ', array_map(static fn($w) => trim($P[$w[0]]['fn'] . ' ' . $P[$w[0]]['sn']), $f['wit'])); }
        if ($f['div'] !== null && !in_array('div', $fevtNames, true)) { $writeEvent(['date' => $f['div'], 'place' => ''], 'div'); }
        if ($f['sep'] && !in_array('sep', $fevtNames, true)) { $writeEvent(['date' => '', 'place' => '', 'note' => 'Séparés'], 'sep'); }
        foreach ($f['fevt'] as $e) { $writeEvent($e, $e['name']); }
        if ($f['src'] !== '') { $txt(1, 'SOUR', $f['src']); $counts['sources']++; }
        if ($f['comm'] !== '') { $txt(1, 'NOTE', $f['comm']); $counts['notes']++; }
    }
    if ($dbNotes) {
        // notes générales de la base GeneWeb : sur la première personne, dans une note à part (rien ne se perd)
        $txt(0, '@NDB@ NOTE', 'Notes de la base GeneWeb' . "\n\n" . implode("\n\n", $dbNotes));
        $counts['db_notes'] = count($dbNotes);
        // relie la note à la 1re personne
        foreach ($out as $k => $row) { if ($row === '0 @I1@ INDI') { array_splice($out, $k + 1, 0, ['1 NOTE @NDB@']); break; } }
    }
    $out[] = '0 TRLR';
    $counts['persons'] = count($P);
    $counts['families'] = count($F);
    $counts['warnings'] = $warn;
    return [implode("\n", $out) . "\n", $counts];
}
