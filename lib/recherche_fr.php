<?php
declare(strict_types=1);

/**
 * 🔎 Recherche « à la française » : le moteur commun de toutes les recherches de personnes et de lieux de l'app
 * (Personnes, ⌘K, Listes, menu de choix unique, Où chercher ?, Doublons).
 *
 * Deux moitiés qui suivent EXACTEMENT les mêmes règles :
 *  - ici (PHP) : la recherche dans la base (table rfr_names, structure n°96) et l'explication « Trouvé par » ;
 *  - assets/js/app-recherche-fr.js (navigateur et Node) : la même normalisation, la même lecture d'une recherche,
 *    la même explication. tests/test-recherche-fr.js compare les deux sur des centaines de cas.
 * Les données (prénoms, formes latines, abréviations, diminutifs, particules, Saint/Ste, mots des dates) sont dans UN fichier :
 * assets/data/recherche-fr.json. Les communes fusionnées viennent de l'historique de l'INSEE déjà livré (lib/cartes_plus.php :
 * les anciens noms ajoutés à places.alternate_names, liste gardée dans meta « frontieres_alt ») ; le calendrier républicain
 * du convertisseur de PHP (frenchtojd), le même calcul que LCNDA_SHEET.republicanToGregorian côté navigateur.
 *
 * ─── API pour d'autres outils (ex. « Poser une question en français », ⌘K) ───
 *   rfr_parse_query(string $q, array $settings): array   ce que la recherche a compris : tokens (noms/prénoms), dates
 *   rfr_parse_dates(string $q, int $vers): array          les dates tapées en français → [['from','to','kind','label','ymd']], 'rest'
 *   rfr_person_ids(PDO, string $q, array $opts): array    les fiches trouvées, triées (exact, variantes, phonétique), avec « why »
 *   rfr_explain(array $parsed, array $forms, array $settings, bool $withPhon): array   pourquoi une fiche répond
 *   rfr_first_query(string $mot, array $settings): ?array le prénom de référence d'un mot (« Petrus » → Pierre, forme latine)
 *   rfr_phon(string), rfr_fold(string), rfr_name_keys(string), rfr_place_variants(string), rfr_settings(PDO)
 * Toutes les requêtes sont préparées (paramètres liés) ; les mots tapés ne sont jamais collés dans le SQL.
 */

const RFR_SETTINGS_KEY = 'genealogie-recherche-fr';
const RFR_DEFAULTS = ['auto' => true, 'latin' => true, 'abr' => true, 'vers' => 5];

/** La table commune (assets/data/recherche-fr.json), lue une fois. */
function rfr_data(): array
{
    static $d = null;
    if ($d === null) {
        $raw = @file_get_contents(dirname(__DIR__) . '/assets/data/recherche-fr.json');
        $d = is_string($raw) ? (json_decode($raw, true) ?: []) : [];
    }
    return $d;
}

/** Réglages → 🔎 Recherche (rangés comme les autres réglages de l'interface, clé genealogie-recherche-fr). */
function rfr_settings(?PDO $pdo = null): array
{
    $s = RFR_DEFAULTS;
    if ($pdo) {
        try {
            $st = $pdo->prepare('SELECT value FROM app_settings WHERE key=?'); $st->execute([RFR_SETTINGS_KEY]);
            $v = json_decode((string) ($st->fetchColumn() ?: ''), true);
            if (is_array($v)) { $s = rfr_settings_clean($v); }
        } catch (Throwable $_) {}
    }
    return $s;
}

function rfr_settings_clean(array $v): array
{
    $s = RFR_DEFAULTS;
    foreach (['auto', 'latin', 'abr'] as $k) { if (array_key_exists($k, $v)) { $s[$k] = (bool) $v[$k]; } }
    if (isset($v['vers']) && is_numeric($v['vers'])) { $s['vers'] = max(0, min(30, (int) $v['vers'])); }
    return $s;
}

/* ═════════ Normalisation ═════════ */

/** minuscules sans accents, ligatures défaites (œ, æ, ß, ø, ſ…), apostrophes, tirets et ponctuation → un espace */
function rfr_fold(string $s): string
{
    static $memo = [];
    if (isset($memo[$s])) { return $memo[$s]; }
    if (count($memo) > 60000) { $memo = []; }
    static $lig = ['Æ' => 'AE', 'æ' => 'ae', 'Œ' => 'OE', 'œ' => 'oe', 'ß' => 'ss', 'ẞ' => 'SS', 'Ø' => 'O', 'ø' => 'o', 'Đ' => 'D', 'đ' => 'd',
        'Ł' => 'L', 'ł' => 'l', 'Þ' => 'TH', 'þ' => 'th', 'Ð' => 'D', 'ð' => 'd', 'ı' => 'i', 'ſ' => 's', 'ĸ' => 'k', 'ŉ' => 'n', 'Ŋ' => 'N', 'ŋ' => 'n',
        'Ħ' => 'H', 'ħ' => 'h', 'Ŧ' => 'T', 'ŧ' => 't'];
    $t = strtr($s, $lig);
    if (class_exists('Normalizer')) { $n = Normalizer::normalize($t, Normalizer::FORM_D); if (is_string($n)) { $t = $n; } }
    $t = strtr((string) preg_replace('/\p{Mn}+/u', '', $t), $lig);
    if (function_exists('ascii_fold')) { $t = ascii_fold($t); } // sans l'extension intl : la table fixe de lib/text.php
    $t = strtolower($t);
    return $memo[$s] = trim((string) preg_replace('/[^a-z0-9]+/', ' ', $t));
}

/** minuscules, sans accents sauf « ç », apostrophes droites, espaces simples : le texte où l'on cherche les dates */
function rfr_low(string $s): string
{
    static $acc = ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ã' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ì' => 'i',
        'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ò' => 'o', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ù' => 'u', 'ÿ' => 'y', '’' => "'", '‘' => "'", 'ʼ' => "'", '`' => "'", '´' => "'", '–' => '-', '—' => '-'];
    $t = strtr(mb_strtolower($s, 'UTF-8'), $acc);
    return trim((string) preg_replace('/\s+/u', ' ', $t));
}

function rfr_particles(): array
{
    static $p = null;
    if ($p === null) { $p = array_flip(rfr_data()['particules']['mots'] ?? []); }
    return $p;
}

/** mots repliés → clé collée : « de albert » → « dalbert » (élision devant une voyelle ou un h) */
function rfr_glue_words(array $words): string
{
    static $el = null;
    if ($el === null) { $el = array_filter(rfr_data()['particules']['elision'] ?? [], 'is_string'); unset($el['_doc']); }
    $out = '';
    $n = count($words);
    foreach ($words as $i => $w) {
        if ($i + 1 < $n && isset($el[$w]) && preg_match('/^[aeiouyh]/', $words[$i + 1])) { $w = $el[$w]; }
        $out .= $w;
    }
    return $out;
}

/**
 * Les clés d'un nom de famille : collée (particules collées), nue (particules ôtées), phonétique (du nom nu).
 * « d'Albert » → dalbert / albert ; « La Combe » → lacombe / combe ; « Lacombe » → lacombe / lacombe.
 */
function rfr_name_keys(string $raw): array
{
    static $memo = [];
    if (isset($memo[$raw])) { return $memo[$raw]; }
    if (count($memo) > 30000) { $memo = []; }
    $words = rfr_fold($raw) === '' ? [] : explode(' ', rfr_fold($raw));
    $pw = rfr_fold(str_replace(['ç', 'Ç'], 's', $raw));
    $pw = $pw === '' ? [] : explode(' ', $pw);
    $P = rfr_particles();
    $strip = static function (array $ws) use ($P): array { $b = array_values(array_filter($ws, static fn($w) => !isset($P[$w]))); return $b ?: $ws; };
    $bare = $strip($words);
    // les clés comparées : le nom collé, puis sans ses particules du début une à une, puis sans aucune particule
    // (« de la Combe » → delacombe, lacombe, combe : trouvé par « Lacombe » comme par « Combe »)
    $keys = [];
    for ($i = 0, $n = count($words); $i < $n; $i++) {
        $k = rfr_glue_words(array_slice($words, $i));
        if ($k !== '' && !in_array($k, $keys, true)) { $keys[] = $k; }
        if (!isset($P[$words[$i]])) { break; }
    }
    if ($bare && !in_array(implode('', $bare), $keys, true)) { $keys[] = implode('', $bare); }
    return $memo[$raw] = [
        'glued' => rfr_glue_words($words),
        'bare' => implode('', $bare),
        'keys' => $keys,
        'phon' => rfr_phon_key(implode('', $strip($pw))),
        'particle' => count($bare) < count($words),
    ];
}

/** clé phonétique française d'un texte (nom, prénom) */
function rfr_phon(string $raw): string
{
    return rfr_phon_key(str_replace(' ', '', rfr_fold(str_replace(['ç', 'Ç'], 's', $raw))));
}

/**
 * Phonétique française (lettres a-z déjà repliées). Règles, dans l'ordre :
 * h muet du début ; sch→ch ; ph→f ; th→t ; rh→r ; gn→n ; ck, cq, qu, q → k ; ch, sh → X (son « che ») ;
 * gu devant e/i/y → g dur ; ge devant a/o/u → j ; g devant e/i/y → j ; c devant e/i/y → s ; c → k ; y → i ; w → v ; z → s ;
 * x final muet, sinon ks ; bv → v ; h restants muets ;
 * eau, au → o ; aul devant t/d/s/x/z (Arnault, Gaultier) → o ; ai, ei → e ; oeu, eu → e ; ou → U ; ean → an ;
 * en, em devant une consonne → an ; am devant une consonne → an ; om devant b/p → on ; im devant b/p → in ;
 * finales : -er, -ez, -et → e ; puis t, d, s, x, z, p muets ; e muet ; puis encore t, d, s, x, z muets ;
 * lettres doublées réduites. « Dupont », « Dupond », « Dupon », « Dupons » → dupon ; « Thibault », « Thibaud », « Thibeau » → tibo.
 */
function rfr_phon_key(string $w): string
{
    static $memo = [];
    if (isset($memo[$w])) { return $memo[$w]; }
    if (count($memo) > 30000) { $memo = []; }
    $s = (string) preg_replace('/[^a-z]/', '', $w);
    if ($s === '') { return $memo[$w] = ''; }
    $r = [
        ['/^h/', ''], ['/sch/', 'ch'], ['/ph/', 'f'], ['/th/', 't'], ['/rh/', 'r'], ['/gn/', 'n'],
        ['/ck|cq|qu|q/', 'k'], ['/ch|sh/', 'X'],
        ['/gu(?=[eiy])/', 'G'], ['/ge(?=[aou])/', 'j'], ['/g(?=[eiy])/', 'j'], ['/c(?=[eiy])/', 's'], ['/c/', 'k'],
        ['/y/', 'i'], ['/w/', 'v'], ['/z/', 's'], ['/x$/', ''], ['/x/', 'ks'], ['/bv/', 'v'], ['/h/', ''], ['/G/', 'g'],
        ['/eau/', 'o'], ['/aul(?=[tdsxz])/', 'o'], ['/au/', 'o'], ['/ai|ei/', 'e'], ['/oeu|eu/', 'e'], ['/ou/', 'U'], ['/ean(?![aeiou])/', 'an'],
        ['/e[nm](?=[^aeiouU])/', 'an'], ['/am(?=[^aeiouU])/', 'an'], ['/om(?=[bp])/', 'on'], ['/im(?=[bp])/', 'in'],
        ['/(?<=.)(er|ez|et)$/', 'e'],
    ];
    foreach ($r as [$re, $to]) { $s = (string) preg_replace($re, $to, $s); }
    for ($i = 0; $i < 2; $i++) {
        while (strlen($s) > 2 && preg_match('/[tdsxzp]$/', $s)) { $s = substr($s, 0, -1); }
        if ($i === 0 && strlen($s) > 2 && str_ends_with($s, 'e')) { $s = substr($s, 0, -1); }
    }
    $s = (string) preg_replace('/(.)\1+/', '$1', $s);
    return $memo[$w] = $s;
}

/** Distance d'édition (même calcul que le navigateur). */
function rfr_lev(string $a, string $b): int
{
    return levenshtein($a, $b);
}

/** deux clés phonétiques de nom de famille assez proches : égales, ou 1 lettre d'écart (2 dès 6 lettres), même début */
function rfr_phon_near(string $q, string $k): bool
{
    if ($q === '' || $k === '') { return false; }
    if ($q === $k) { return true; }
    if (strlen($q) < 3 || $q[0] !== $k[0]) { return false; }
    $max = strlen($q) >= 6 ? 2 : 1;
    if (abs(strlen($q) - strlen($k)) > $max) { return false; }
    return rfr_lev($q, $k) <= $max;
}

/* ═════════ Prénoms ═════════ */

/** clé d'un prénom : replié, sans espaces ni tirets ni points */
function rfr_first_key(string $s): string
{
    return str_replace(' ', '', rfr_fold($s));
}

/**
 * L'index des prénoms : clé → [canon, fr, kind (fr|latin|decl|abr|dim|colle), dot (abréviation écrite avec un point final), g].
 * D'abord toutes les formes françaises, puis les formes écrites (latin, abr, dim, colle), puis les déclinaisons et les formes
 * en I fabriquées : une forme déjà prise n'est jamais remplacée.
 */
function rfr_first_index(): array
{
    static $ix = null;
    if ($ix !== null) { return $ix; }
    $ix = [];
    $D = rfr_data();
    $groups = $D['prenoms'] ?? [];
    $put = static function (string $form, array $g, string $kind) use (&$ix): void {
        $k = rfr_first_key($form);
        if ($k === '' || isset($ix[$k])) { return; }
        $ix[$k] = ['canon' => rfr_first_key($g['fr']), 'fr' => $g['fr'], 'kind' => $kind, 'dot' => str_ends_with(trim($form), '.'), 'g' => $g['genre'] ?? ''];
    };
    foreach ($groups as $g) { $put($g['fr'], $g, 'fr'); }
    foreach ($groups as $g) { foreach (['latin', 'abr', 'dim', 'colle'] as $kind) { foreach ($g[$kind] ?? [] as $f) { $put($f, $g, $kind); } } }
    $dec = $D['declinaisons'] ?? [];
    unset($dec['_doc']);
    foreach ($groups as $g) {
        foreach ($g['latin'] ?? [] as $f) {
            $words = explode(' ', rfr_fold($f));
            for ($c = 0; $c < 3; $c++) {
                $out = [];
                foreach ($words as $w) {
                    $done = false;
                    foreach ($dec as $end => $cases) {
                        if (strlen($w) > strlen($end) + 1 && str_ends_with($w, $end) && isset($cases[$c])) { $out[] = substr($w, 0, -strlen($end)) . $cases[$c]; $done = true; break; }
                    }
                    if (!$done) { $out[] = $w; }
                }
                $put(implode(' ', $out), $g, 'decl');
            }
        }
    }
    foreach ($ix as $k => $e) {
        if (in_array($e['kind'], ['latin', 'decl'], true) && str_contains($k, 'j')) {
            $i = str_replace('j', 'i', $k);
            if (!isset($ix[$i])) { $ix[$i] = $e; $ix[$i]['kind'] = 'decl'; }
        }
    }
    return $ix;
}

function rfr_kind_allowed(string $kind, array $set): bool
{
    if ($kind === 'latin' || $kind === 'decl') { return (bool) $set['latin']; }
    if ($kind === 'abr' || $kind === 'dim' || $kind === 'colle') { return (bool) $set['abr']; }
    return true;
}

/** nom de la sorte, pour l'explication */
function rfr_kind_name(string $kind): string
{
    return match ($kind) { 'latin', 'decl' => 'latin', 'abr' => 'abr', 'dim' => 'dim', 'colle' => 'colle', default => 'fr' };
}

/**
 * Les prénoms d'une fiche (prénom + autres prénoms) : [['canon','fr','kind','form','comp']] ; un prénom inconnu de la table
 * garde sa propre clé (kind self). Un prénom composé donne aussi ses parties (Jean-Baptiste → jean, baptiste).
 */
function rfr_first_forms(string $raw): array
{
    static $memo = [];
    if (isset($memo[$raw])) { return $memo[$raw]; }
    if (count($memo) > 30000) { $memo = []; }
    $ix = rfr_first_index();
    $fold = rfr_fold($raw);
    if ($fold === '') { return $memo[$raw] = []; }
    $words = explode(' ', $fold);
    $out = [];
    $add = static function (array $e, string $form) use (&$out, $ix): void {
        $out[] = ['canon' => $e['canon'], 'fr' => $e['fr'], 'kind' => $e['kind'], 'form' => $form, 'comp' => false];
        $parts = preg_split('/[\s-]+/u', $e['fr']) ?: [];
        if (count($parts) > 1) {
            foreach ($parts as $p) { $pk = rfr_first_key($p); if (isset($ix[$pk]) && $ix[$pk]['kind'] === 'fr') { $out[] = ['canon' => $ix[$pk]['canon'], 'fr' => $ix[$pk]['fr'], 'kind' => $e['kind'], 'form' => $form, 'comp' => true]; } }
        }
    };
    $whole = implode('', $words);
    if (isset($ix[$whole])) { $add($ix[$whole], trim($raw)); return $memo[$raw] = $out; }
    $n = count($words);
    for ($i = 0; $i < $n;) {
        $hit = 0;
        for ($len = min(4, $n - $i); $len >= 1; $len--) {
            $k = implode('', array_slice($words, $i, $len));
            if (isset($ix[$k])) { $add($ix[$k], implode(' ', array_slice($words, $i, $len))); $hit = $len; break; }
        }
        if ($hit) { $i += $hit; continue; }
        $out[] = ['canon' => $words[$i], 'fr' => '', 'kind' => 'self', 'form' => $words[$i], 'comp' => false];
        $i++;
    }
    return $memo[$raw] = $out;
}

/** la chaîne rangée dans rfr_names.first_canons : « ␠pierre l:jean a:baptiste␠ » (la sorte en tête, sauf forme française) */
function rfr_first_canon_string(string $raw): string
{
    $pre = ['latin' => 'l:', 'decl' => 'l:', 'abr' => 'a:', 'dim' => 'd:', 'colle' => 'c:'];
    $t = [];
    foreach (rfr_first_forms($raw) as $f) { $t[($pre[$f['kind']] ?? '') . $f['canon']] = true; }
    return $t ? ' ' . implode(' ', array_keys($t)) . ' ' : '';
}

/** Le prénom de référence d'un mot tapé (côté recherche) ; une abréviation écrite avec un point n'est reconnue qu'avec ce point. */
function rfr_first_query(string $token, array $set): ?array
{
    $k = rfr_first_key($token);
    $e = rfr_first_index()[$k] ?? null;
    if (!$e || strlen($k) < 2) { return null; }
    if ($e['dot'] && !str_ends_with(rtrim($token), '.')) { return null; }
    if (!rfr_kind_allowed($e['kind'], $set)) { return null; }
    return $e;
}

/* ═════════ Lieux ═════════ */

/** « St-Martin-le-Vieux » → « saint martin le vieux » ; « N.-D. » → « notre dame » */
function rfr_place_fold(string $s): string
{
    $w = rfr_fold($s);
    if ($w === '') { return ''; }
    $L = rfr_data()['lieux']['abreviations'] ?? [];
    $words = explode(' ', $w);
    $out = [];
    $n = count($words);
    for ($i = 0; $i < $n; $i++) {
        $two = $i + 1 < $n ? $words[$i] . ' ' . $words[$i + 1] : '';
        if ($two !== '' && isset($L[$two]) && $i + 2 < $n) { $out[] = $L[$two]; $i++; continue; }
        if (isset($L[$words[$i]]) && $i + 1 < $n && ($words[$i] !== 's' || $i === 0 || $words[$i - 1] === 'de' || $words[$i - 1] === 'sur')) { $out[] = $L[$words[$i]]; continue; }
        $out[] = $words[$i];
    }
    return implode(' ', $out);
}

/** Les façons de lire un nom de lieu tapé : tel quel, Saint/Sainte écrits en entier, sans l'article du début. */
function rfr_place_variants(string $q): array
{
    $f = rfr_fold($q);
    if ($f === '') { return []; }
    $v = [$f, rfr_place_fold($q)];
    $arts = rfr_data()['lieux']['articles'] ?? [];
    foreach ([$f, rfr_place_fold($q)] as $x) {
        $w = explode(' ', $x);
        if (count($w) > 1 && in_array($w[0], $arts, true)) { $v[] = implode(' ', array_slice($w, 1)); }
    }
    return array_values(array_unique(array_filter($v, static fn($x) => $x !== '')));
}

/* ═════════ Dates ═════════ */

function rfr_roman(string $s): int
{
    if (ctype_digit($s)) { return (int) $s; }
    $v = ['i' => 1, 'v' => 5, 'x' => 10, 'l' => 50];
    $s = strtolower($s); $n = 0;
    for ($i = 0, $l = strlen($s); $i < $l; $i++) { $a = $v[$s[$i]] ?? 0; $b = $v[$s[$i + 1] ?? ''] ?? 0; $n += $a < $b ? -$a : $a; }
    return $n;
}

/** an, mois (1-13), jour républicains → [a, m, j] grégorien (convertisseur de PHP, comme bio_day_republican) */
function rfr_republican(int $an, int $mo, int $d): ?array
{
    if ($an < 1 || $an > 14 || $mo < 1 || $mo > 13 || $d < 1 || $d > ($mo === 13 ? 6 : 30) || !function_exists('frenchtojd')) { return null; }
    $g = cal_from_jd(frenchtojd($mo, $d, $an), CAL_GREGORIAN);
    return [(int) $g['year'], (int) $g['month'], (int) $g['day']];
}

function rfr_months(): array
{
    static $m = null;
    if ($m === null) { $m = rfr_data()['dates']['mois'] ?? []; }
    return $m;
}

/** une date écrite (acte, fiche) → 'AAAA-MM-JJ', 'AAAA-MM', 'AAAA' ou '' (« 3 mars 1850 », « 03/03/1850 », « 15 brumaire an III ») */
function rfr_date_ymd(string $text): string
{
    $t = rfr_low($text);
    if ($t === '') { return ''; }
    $rep = rfr_data()['dates']['republicain'] ?? [];
    $mo = rfr_months();
    if (preg_match('/(\d{1,2}|1er)\s*(?:er|e)?\s+(' . implode('|', $rep) . ')\s+(?:de l\'|l\')?an\s+([ivxl]+|\d{1,2})\b/', $t, $m)) {
        $g = rfr_republican(rfr_roman($m[3]), (int) array_search($m[2], $rep, true) + 1, $m[1] === '1er' ? 1 : (int) $m[1]);
        return $g ? sprintf('%04d-%02d-%02d', ...$g) : '';
    }
    if (preg_match('/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/', $t, $m)) { return sprintf('%04d-%02d-%02d', (int) $m[1], (int) $m[2], (int) $m[3]); }
    if (preg_match('/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/', $t, $m)) { return sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[2], (int) $m[1]); }
    if (preg_match('/\b(\d{1,2}|1er)\s+([a-z0-9]+)\.?\s+(\d{3,4})\b/', $t, $m) && isset($mo[$m[2]])) { return sprintf('%04d-%02d-%02d', (int) $m[3], $mo[$m[2]], $m[1] === '1er' ? 1 : (int) $m[1]); }
    if (preg_match('/\b([a-z0-9]+)\.?\s+(\d{3,4})\b/', $t, $m) && isset($mo[$m[1]])) { return sprintf('%04d-%02d', (int) $m[2], $mo[$m[1]]); }
    if (preg_match('/(?<!\d)(\d{3,4})(?!\d)/', $t, $m)) { return sprintf('%04d', (int) $m[1]); }
    return '';
}

/**
 * Les dates tapées dans une recherche : « vers 1850 » (± marge), « entre 1850 et 1860 », « 1850-1860 », « avant 1900 »,
 * « après 1789 », « depuis 1789 », « années 1880 », « XVIIIe siècle » (1700-1799), « 3 mars 1850 », « 3/3/1850 »,
 * « mars 1850 », « 15 brumaire an III », une année seule. → ['dates' => [[from, to, kind, label, ymd]], 'rest' => texte sans les dates]
 */
function rfr_parse_dates(string $q, int $vers = 5): array
{
    $t = ' ' . rfr_low($q) . ' ';
    $D = rfr_data()['dates'] ?? [];
    $rep = implode('|', $D['republicain'] ?? []);
    $mois = implode('|', array_map(static fn($k) => preg_quote((string) $k, '/'), array_keys(rfr_months())));
    $out = [];
    $take = static function (string $re, callable $fn) use (&$t, &$out): void {
        $t = (string) preg_replace_callback($re, static function ($m) use ($fn, &$out) { $d = $fn($m); if ($d === null) { return $m[0]; } $out[] = $d + ['label' => trim($m[0])]; return ' '; }, $t);
    };
    $day = static fn(int $y, int $m, int $d): ?array => checkdate($m, $d, $y) ? ['from' => $y, 'to' => $y, 'kind' => 'day', 'ymd' => sprintf('%04d-%02d-%02d', $y, $m, $d)] : null;
    $take('/(?<=\s)(\d{1,2}|1er|premier)\s*(?:er|e)?\s+(' . $rep . ')\s+(?:de l\'|l\')?an\s+([ivxl]+|\d{1,2})(?=\s)/', static function ($m) use ($rep, $day) {
        $g = rfr_republican(rfr_roman($m[3]), (int) array_search($m[2], explode('|', $rep), true) + 1, in_array($m[1], ['1er', 'premier'], true) ? 1 : (int) $m[1]);
        return $g ? (['kind' => 'rep'] + $day($g[0], $g[1], $g[2])) : null;
    });
    $take('/(?<=\s)(\d{1,2}|1er)\s+(' . $mois . ')\.?\s+(\d{3,4})(?=\s)/', static fn($m) => $day((int) $m[3], rfr_months()[$m[2]], $m[1] === '1er' ? 1 : (int) $m[1]));
    $take('/(?<=\s)(\d{4})-(\d{1,2})-(\d{1,2})(?=\s)/', static fn($m) => $day((int) $m[1], (int) $m[2], (int) $m[3]));
    $take('/(?<=\s)(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})(?=\s)/', static fn($m) => $day((int) $m[3], (int) $m[2], (int) $m[1]));
    $take('/(?<=\s)(' . $mois . ')\.?\s+(\d{3,4})(?=\s)/', static fn($m) => ['from' => (int) $m[2], 'to' => (int) $m[2], 'kind' => 'month', 'ymd' => sprintf('%04d-%02d', (int) $m[2], rfr_months()[$m[1]])]);
    $take('/(?<=\s)(?:entre|de)\s+(\d{3,4})\s+(?:et|a)\s+(\d{3,4})(?=\s)/', static fn($m) => ['from' => min((int) $m[1], (int) $m[2]), 'to' => max((int) $m[1], (int) $m[2]), 'kind' => 'between', 'ymd' => '']);
    $take('/(?<=\s)(\d{4})\s*-\s*(\d{4})(?=\s)/', static fn($m) => ['from' => min((int) $m[1], (int) $m[2]), 'to' => max((int) $m[1], (int) $m[2]), 'kind' => 'between', 'ymd' => '']);
    $take('/(?<=\s)(?:les\s+)?annees\s+(\d{3})0(?=\s)/', static fn($m) => ['from' => (int) ($m[1] . '0'), 'to' => (int) ($m[1] . '9'), 'kind' => 'decade', 'ymd' => '']);
    $take('/(?<=\s)(?:au\s+|du\s+)?([ivxl]+?|\d{1,2})\s*(?:e|er|eme|ieme)?\s+siecle(?=\s)/', static function ($m) { $n = rfr_roman($m[1]); return $n >= 1 && $n <= 21 ? ['from' => ($n - 1) * 100, 'to' => ($n - 1) * 100 + 99, 'kind' => 'century', 'ymd' => ''] : null; });
    $vw = implode('|', array_map(static fn($w) => preg_quote($w, '/') . ($w === '~' ? '' : '\.?'), $D['vers'] ?? ['vers']));
    $take('/(?<=\s)(?:' . $vw . ')\s*(\d{3,4})(?=\s)/', static fn($m) => ['from' => (int) $m[1] - $vers, 'to' => (int) $m[1] + $vers, 'kind' => 'vers', 'ymd' => '']);
    $aw = implode('|', array_map(static fn($w) => preg_quote($w, '/') . '\.?', $D['avant'] ?? ['avant']));
    $take('/(?<=\s)(?:' . $aw . ')\s+(\d{3,4})(?=\s)/', static fn($m) => ['from' => null, 'to' => (int) $m[1] - 1, 'kind' => 'before', 'ymd' => '']);
    $take('/(?<=\s)(?:a partir de|depuis)\s+(\d{3,4})(?=\s)/', static fn($m) => ['from' => (int) $m[1], 'to' => null, 'kind' => 'after', 'ymd' => '']);
    $pw = implode('|', array_map(static fn($w) => preg_quote($w, '/') . '\.?', $D['apres'] ?? ['apres']));
    $take('/(?<=\s)(?:' . $pw . ')\s+(\d{3,4})(?=\s)/', static fn($m) => ['from' => (int) $m[1] + 1, 'to' => null, 'kind' => 'after', 'ymd' => '']);
    $take('/(?<=\s)(1[0-9]{3}|20[0-9]{2})(?=\s)/', static fn($m) => ['from' => (int) $m[1], 'to' => (int) $m[1], 'kind' => 'year', 'ymd' => '']);
    $norm = static fn(array $d): array => ['from' => $d['from'], 'to' => $d['to'], 'kind' => $d['kind'], 'label' => $d['label'], 'ymd' => $d['ymd']];
    return ['dates' => array_map($norm, $out), 'rest' => trim((string) preg_replace('/\s+/', ' ', $t))];
}

/* ═════════ Lire une recherche ═════════ */

/**
 * Ce que la recherche a compris : ['raw', 'dates' (rfr_parse_dates), 'tokens' => [[raw, fold, parts, glued, bare, phon, first, merged]]].
 * Les particules seules se collent au mot qui suit (« de la Combe ») ; deux mots qui forment un prénom composé connu
 * (« Jn Bte », « Marie Anne ») n'en font qu'un.
 */
function rfr_parse_query(string $q, ?array $set = null): array
{
    $set ??= RFR_DEFAULTS;
    $q = mb_substr($q, 0, 200);
    $d = rfr_parse_dates($q, (int) $set['vers']);
    $raw = array_values(array_filter(preg_split('/\s+/u', $d['rest']) ?: [], static fn($w) => rfr_fold($w) !== ''));
    $raw = array_slice($raw, 0, 8);
    $P = rfr_particles();
    // 1. particules seules collées au mot suivant
    $toks = [];
    $pend = [];
    foreach ($raw as $i => $w) {
        $f = rfr_fold($w);
        if (isset($P[$f]) && $i + 1 < count($raw)) { $pend[] = $w; continue; }
        $toks[] = ['words' => array_merge($pend, [$w]), 'merged' => $pend ? 'particle' : ''];
        $pend = [];
    }
    // 2. prénoms composés connus écrits en deux mots
    $ix = rfr_first_index();
    $out = [];
    for ($i = 0, $n = count($toks); $i < $n; $i++) {
        if ($i + 1 < $n && $toks[$i]['merged'] === '' && $toks[$i + 1]['merged'] === '') {
            $two = $toks[$i]['words'][0] . ' ' . $toks[$i + 1]['words'][0];
            $e = $ix[rfr_first_key($two)] ?? null;
            if ($e && (str_contains($e['fr'], '-') || str_contains($e['fr'], ' ')) && rfr_first_query($two, $set)) {
                $out[] = ['words' => [$toks[$i]['words'][0], $toks[$i + 1]['words'][0]], 'merged' => 'first'];
                $i++;
                continue;
            }
        }
        $out[] = $toks[$i];
    }
    $tokens = [];
    foreach ($out as $t) {
        $text = implode(' ', $t['words']);
        $fold = rfr_fold($text);
        $k = rfr_name_keys($text);
        $parts = $t['merged'] === 'first' ? array_map('rfr_fold', $t['words']) : [$fold];
        $tokens[] = ['raw' => $text, 'fold' => $fold, 'parts' => $parts, 'glued' => $k['glued'], 'bare' => $k['bare'], 'keys' => array_values(array_filter($k['keys'], static fn($x) => strlen($x) >= 3)), 'phon' => $k['phon'],
            'first' => $t['merged'] === 'particle' ? null : rfr_first_query($text, $set), 'merged' => $t['merged']];
    }
    return ['raw' => $q, 'dates' => $d['dates'], 'tokens' => $tokens];
}

/* ═════════ Pourquoi une fiche répond ═════════ */

/** une forme du nom (fiche ou variante) prête à comparer */
function rfr_form_prepare(array $f): array
{
    $first = trim(($f['first'] ?? '') . ' ' . ($f['middle'] ?? ''));
    $last = (string) ($f['last'] ?? '');
    $k = rfr_name_keys($last);
    $phons = [];
    foreach (explode(' ', rfr_fold(str_replace(['ç', 'Ç'], 's', $first))) as $w) { if ($w !== '') { $phons[rfr_phon_key($w)] = true; } }
    return ['src' => (int) ($f['src'] ?? 0), 'type' => (string) ($f['type'] ?? ''), 'first' => $first, 'last' => $last,
        'words' => rfr_fold($first . ' ' . $last . ' ' . ($f['group'] ?? '')), 'keys' => $k['keys'], 'phon' => $k['phon'],
        'firsts' => rfr_first_forms($first), 'fphons' => array_keys($phons)];
}

function rfr_form_label(array $f): string
{
    return trim($f['first'] . ' ' . $f['last']);
}

/**
 * Pourquoi cette fiche répond à la recherche, mot par mot : ['ok' => bool, 'tier' => 0 nom de la fiche | 1 autre nom noté |
 * 2 équivalent (particule, forme latine, abréviation, diminutif, prénom composé) | 3 phonétique, 'why' => [[k, …]]].
 * $forms : [['src' => 0, 'type' => '', 'first', 'middle', 'last', 'group'], ['src' => id de name_variants, 'type' => 'married', …]].
 * $extra[i] : une raison trouvée ailleurs pour le mot i (lieu de naissance ou de décès, dans le menu de choix).
 */
function rfr_explain(array $parsed, array $forms, ?array $set = null, bool $withPhon = true, array $extra = []): array
{
    $set ??= RFR_DEFAULTS;
    $F = array_map('rfr_form_prepare', $forms);
    $tier = 0; $why = []; $ok = true;
    foreach ($parsed['tokens'] as $i => $t) {
        $best = null;
        foreach ($F as $f) {
            $c = rfr_match_token($t, $f, $set, $withPhon);
            if ($c && ($best === null || $c['tier'] < $best['tier'])) { $best = $c; }
        }
        if (isset($extra[$i]) && ($best === null || $best['tier'] > 0)) { $best = ['tier' => 0, 'why' => $extra[$i]]; }
        if ($best === null) { $ok = false; continue; }
        $tier = max($tier, $best['tier']);
        $why[] = $best['why'];
    }
    return ['ok' => $ok, 'tier' => $tier, 'why' => rfr_unique_why($why)];
}

function rfr_unique_why(array $why): array
{
    $seen = []; $out = [];
    foreach ($why as $w) { $k = json_encode($w); if (!isset($seen[$k])) { $seen[$k] = true; $out[] = $w; } }
    return $out;
}

/** un mot tapé contre une forme du nom : ['tier', 'why'] ou null (même ordre de règles que la requête SQL) */
function rfr_match_token(array $t, array $f, array $set, bool $withPhon): ?array
{
    $all = true;
    foreach ($t['parts'] as $p) { if ($p === '' || !str_contains($f['words'], $p)) { $all = false; break; } }
    if ($all) {
        if ($f['src'] === 0) { return ['tier' => 0, 'why' => ['k' => 'exact']]; }
        return ['tier' => 1, 'why' => ['k' => in_array($f['type'], ['married', 'historical'], true) ? 'married' : 'variant', 'v' => rfr_form_label($f)]];
    }
    if (array_intersect($t['keys'], $f['keys'])) {
        return ['tier' => 2, 'why' => ['k' => 'particle', 'v' => $f['last']]];
    }
    if ($t['first']) {
        foreach ($f['firsts'] as $e) {
            if ($e['canon'] !== $t['first']['canon'] || !rfr_kind_allowed($e['kind'], $set)) { continue; }
            if ($e['kind'] !== 'fr' && $e['kind'] !== 'self') { return ['tier' => 2, 'why' => ['k' => rfr_kind_name($e['kind']), 'v' => $e['form'], 'fr' => $e['fr']]]; }
            if ($t['first']['kind'] !== 'fr') { return ['tier' => 2, 'why' => ['k' => rfr_kind_name($t['first']['kind']), 'v' => $t['raw'], 'fr' => $t['first']['fr']]]; }
            return ['tier' => 2, 'why' => ['k' => 'colle', 'v' => $e['form'], 'fr' => $e['fr']]];
        }
    }
    if ($withPhon && $t['phon'] !== '') {
        if (rfr_phon_near($t['phon'], $f['phon'])) { return ['tier' => 3, 'why' => ['k' => 'phon', 'v' => $f['last']]]; }
        if (strlen($t['phon']) >= 2 && in_array($t['phon'], $f['fphons'], true)) { return ['tier' => 3, 'why' => ['k' => 'phon', 'v' => $f['first']]]; }
    }
    return null;
}

/**
 * Les dates de la recherche contre celles d'une fiche : [['k' => 'date', 'label' => 'vers 1850', 'ev' => 'birth', 'y' => 1848]].
 * $ev : [['ev' => birth|bapt|marr|death|buri, 'y' => année, 'text' => date écrite]].
 */
function rfr_explain_dates(array $dates, array $ev): array
{
    $out = [];
    foreach ($dates as $d) {
        $hit = null;
        foreach ($ev as $e) {
            if ($e['y'] === null || $e['y'] === '') { continue; }
            $y = (int) $e['y'];
            if (($d['from'] !== null && $y < $d['from']) || ($d['to'] !== null && $y > $d['to'])) { continue; }
            if ($d['ymd'] !== '' && !str_starts_with(rfr_date_ymd((string) $e['text']), $d['ymd'])) { continue; }
            $hit = $e; break;
        }
        $out[] = ['k' => 'date', 'v' => $d['label'], 'ev' => $hit['ev'] ?? '', 'y' => $hit ? (int) $hit['y'] : null];
    }
    return $out;
}

/* ═════════ La base : table rfr_names (structure n°96) ═════════ */

function rfr_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS rfr_names (
        person_id INTEGER NOT NULL,
        src INTEGER NOT NULL DEFAULT 0,
        vtype TEXT NOT NULL DEFAULT '',
        sig TEXT NOT NULL DEFAULT '',
        words TEXT NOT NULL DEFAULT '',
        last_keys TEXT NOT NULL DEFAULT '',
        last_phon TEXT NOT NULL DEFAULT '',
        first_canons TEXT NOT NULL DEFAULT '',
        first_phons TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(person_id, src)
    ) WITHOUT ROWID");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_rfr_names_phon ON rfr_names(last_phon)');
}

/** fonctions SQL : rfr_ymd(date écrite) */
function rfr_register(PDO $pdo): void
{
    static $done = [];
    $id = spl_object_id($pdo);
    if (isset($done[$id])) { return; }
    $pdo->sqliteCreateFunction('rfr_ymd', static fn($v): string => rfr_date_ymd($v === null ? '' : (string) $v), 1, defined('PDO::SQLITE_DETERMINISTIC') ? PDO::SQLITE_DETERMINISTIC : 0);
    $pdo->sqliteCreateFunction('rfr_place_fold', static fn($v): string => rfr_place_fold($v === null ? '' : (string) $v), 1, defined('PDO::SQLITE_DETERMINISTIC') ? PDO::SQLITE_DETERMINISTIC : 0);
    $done[$id] = true;
}

function rfr_row(int $pid, int $src, string $type, string $sig, string $first, string $last, string $group): array
{
    $k = rfr_name_keys($last);
    $ph = [];
    foreach (explode(' ', rfr_fold(str_replace(['ç', 'Ç'], 's', $first))) as $w) { if ($w !== '') { $ph[rfr_phon_key($w)] = true; } }
    return [$pid, $src, $type, $sig, rfr_fold($first . ' ' . $last . ' ' . $group), $k['keys'] ? ' ' . implode(' ', $k['keys']) . ' ' : '', $k['phon'], rfr_first_canon_string($first), $ph ? ' ' . implode(' ', array_keys($ph)) . ' ' : ''];
}

/**
 * Remet rfr_names à jour : chaque nom est comparé à sa signature (prénom|autres prénoms|nom|groupe) ; seules les fiches
 * changées sont recalculées. Aucun déclencheur dans la base (bootstrap.php les retire tous) : la vérification se fait ici,
 * une fois par requête. Base en lecture seule : on garde ce qu'il y a.
 */
function rfr_refresh(PDO $pdo, bool $force = false): int
{
    static $done = [];
    $id = spl_object_id($pdo);
    if (isset($done[$id]) && !$force) { return 0; }
    $done[$id] = true;
    try {
        rfr_schema($pdo);
        // vérification complète seulement si une écriture a eu lieu depuis (rfr_mark_dirty, api.php), si le nombre de fiches
        // ou de variantes a changé, ou toutes les 10 minutes (une écriture passée par ailleurs)
        $now = [(int) $pdo->query('SELECT count(*) FROM main.persons')->fetchColumn(), (int) $pdo->query('SELECT COALESCE(max(id),0) FROM main.persons')->fetchColumn(),
            (int) $pdo->query('SELECT count(*) FROM main.name_variants')->fetchColumn(), (int) $pdo->query('SELECT COALESCE(max(id),0) FROM main.name_variants')->fetchColumn()];
        $meta = [];
        foreach ($pdo->query("SELECT key, value FROM meta WHERE key IN ('rfr_dirty','rfr_seen')") as $r) { $meta[$r['key']] = (string) $r['value']; }
        $seen = json_decode($meta['rfr_seen'] ?? '', true);
        if (!$force && ($meta['rfr_dirty'] ?? '') !== '1' && is_array($seen) && ($seen['n'] ?? null) === $now && time() - (int) ($seen['at'] ?? 0) < 600) { return 0; }
        $n = rfr_refresh_full($pdo);
        $pdo->prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('rfr_seen',?)")->execute([json_encode(['n' => $now, 'at' => time()])]);
        $pdo->exec("DELETE FROM meta WHERE key='rfr_dirty'");
        return $n;
    } catch (Throwable $e) {
        error_log('[recherche] rfr_names : ' . $e->getMessage());
        return 0;
    }
}

/** une écriture vient d'avoir lieu (appelé en fin de requête d'écriture par api.php) : la prochaine recherche revérifie rfr_names */
function rfr_mark_dirty(PDO $pdo): void
{
    try { $pdo->exec("INSERT OR REPLACE INTO meta(key,value) VALUES('rfr_dirty','1')"); } catch (Throwable $_) {}
}

/** la vérification complète, nom par nom (signature) */
function rfr_refresh_full(PDO $pdo): int
{
    {
        $sigP = "COALESCE(p.first_name,'')||'|'||COALESCE(p.middle_name,'')||'|'||COALESCE(p.last_name,'')||'|'||COALESCE(g.name,'')";
        $sigV = "COALESCE(v.type,'')||'|'||COALESCE(v.first_name,'')||'|'||COALESCE(v.middle_name,'')||'|'||COALESCE(v.last_name,'')";
        $stale = [];
        foreach ($pdo->query("SELECT p.id FROM main.persons p LEFT JOIN main.surname_groups g ON g.id=p.surname_group_id LEFT JOIN main.rfr_names n ON n.person_id=p.id AND n.src=0 WHERE n.sig IS NOT ({$sigP})")->fetchAll(PDO::FETCH_COLUMN) as $x) { $stale[(int) $x] = true; }
        foreach ($pdo->query("SELECT v.person_id FROM main.name_variants v LEFT JOIN main.rfr_names n ON n.person_id=v.person_id AND n.src=v.id WHERE n.sig IS NOT ({$sigV})")->fetchAll(PDO::FETCH_COLUMN) as $x) { $stale[(int) $x] = true; }
        foreach ($pdo->query('SELECT n.person_id FROM main.rfr_names n WHERE n.src>0 AND NOT EXISTS(SELECT 1 FROM main.name_variants v WHERE v.id=n.src AND v.person_id=n.person_id)')->fetchAll(PDO::FETCH_COLUMN) as $x) { $stale[(int) $x] = true; }
        $gone = (int) $pdo->query('SELECT count(*) FROM main.rfr_names WHERE src=0')->fetchColumn() + count($stale) > (int) $pdo->query('SELECT count(*) FROM main.persons')->fetchColumn() ? 1 : 0;
        if (!$stale && !$gone) { return 0; }
        $own = !$pdo->inTransaction();
        if ($own) { $pdo->beginTransaction(); }
        try {
            if ($gone) { $pdo->exec('DELETE FROM main.rfr_names WHERE person_id NOT IN (SELECT id FROM main.persons)'); }
            $del = $pdo->prepare('DELETE FROM main.rfr_names WHERE person_id=?');
            $ins = $pdo->prepare('INSERT OR REPLACE INTO main.rfr_names(person_id,src,vtype,sig,words,last_keys,last_phon,first_canons,first_phons) VALUES(?,?,?,?,?,?,?,?,?)');
            foreach (array_chunk(array_keys($stale), 500) as $chunk) {
                $in = implode(',', array_map('intval', $chunk));
                foreach ($chunk as $pid) { $del->execute([$pid]); }
                foreach ($pdo->query("SELECT p.id, COALESCE(p.first_name,'') f, COALESCE(p.middle_name,'') m, COALESCE(p.last_name,'') l, COALESCE(g.name,'') g, {$sigP} sig FROM main.persons p LEFT JOIN main.surname_groups g ON g.id=p.surname_group_id WHERE p.id IN ({$in})") as $r) {
                    $ins->execute(rfr_row((int) $r['id'], 0, '', (string) $r['sig'], trim($r['f'] . ' ' . $r['m']), (string) $r['l'], (string) $r['g']));
                }
                foreach ($pdo->query("SELECT v.id, v.person_id, COALESCE(v.type,'') t, COALESCE(v.first_name,'') f, COALESCE(v.middle_name,'') m, COALESCE(v.last_name,'') l, {$sigV} sig FROM main.name_variants v WHERE v.person_id IN ({$in}) AND v.person_id IN (SELECT id FROM main.persons)") as $r) {
                    $ins->execute(rfr_row((int) $r['person_id'], (int) $r['id'], (string) $r['t'], (string) $r['sig'], trim($r['f'] . ' ' . $r['m']), (string) $r['l'], ''));
                }
            }
            if ($own) { $pdo->commit(); }
        } catch (Throwable $e) { if ($own && $pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
        return count($stale);
    }
}

/** les clés phonétiques de noms de la base proches de celle tapée */
function rfr_near_keys(PDO $pdo, string $k): array
{
    static $all = [];
    $id = spl_object_id($pdo);
    if (!isset($all[$id])) { $all[$id] = $pdo->query("SELECT DISTINCT last_phon FROM main.rfr_names WHERE last_phon<>''")->fetchAll(PDO::FETCH_COLUMN); }
    return array_values(array_filter($all[$id], static fn($x) => rfr_phon_near($k, (string) $x)));
}

/** les lieux de la base dont le nom (ou un ancien nom) contient le mot, avec Saint/Ste et l'article du début */
function rfr_place_ids(PDO $pdo, string $word): array
{
    $vs = rfr_place_variants($word);
    if (!$vs || strlen($vs[0]) < 2) { return []; }
    rfr_register($pdo);
    $parts = []; $params = [];
    foreach ($vs as $i => $v) {
        $parts[] = "lc_fold(pl.name) LIKE :v{$i} OR rfr_place_fold(pl.name) LIKE :v{$i}";
        $params[":v{$i}"] = '%' . $v . '%';
    }
    $s = $pdo->prepare('SELECT pl.id FROM places pl WHERE pl.id IN (SELECT DISTINCT place_id FROM events WHERE place_id IS NOT NULL) AND (' . implode(' OR ', $parts) . ')');
    $s->execute($params);
    return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
}

/** Condition SQL (sur p.id) : la fiche a une date dans la fourchette — un de ses événements ou un événement de ses couples */
function rfr_date_sql(array $d, int $i, array &$params): string
{
    $c = [];
    if ($d['from'] !== null) { $c[] = "e.year >= :dfa{$i}"; $params[":dfa{$i}"] = (int) $d['from']; }
    if ($d['to'] !== null) { $c[] = "e.year <= :dfb{$i}"; $params[":dfb{$i}"] = (int) $d['to']; }
    if ($d['ymd'] !== '') { $c[] = "rfr_ymd(e.date_text) LIKE :dfd{$i}"; $params[":dfd{$i}"] = $d['ymd'] . '%'; }
    $w = $c ? implode(' AND ', $c) : '1';
    return "p.id IN (SELECT e.person_id FROM events e WHERE e.person_id IS NOT NULL AND e.year IS NOT NULL AND {$w}
        UNION SELECT f.partner1_id FROM events e JOIN families f ON f.id=e.family_id WHERE e.year IS NOT NULL AND {$w}
        UNION SELECT f.partner2_id FROM events e JOIN families f ON f.id=e.family_id WHERE e.year IS NOT NULL AND {$w})";
}

/**
 * La recherche de fiches : ['ids' => [id…] (page demandée, triée : nom de la fiche, autre nom noté, équivalent, phonétique),
 *   'tiers' => [id => rang], 'total' => nombre trouvé, 'parsed' => rfr_parse_query, 'phonetic' => bool (phonétique utilisée),
 *   'fallback' => null | ['q' => mots tapés, 'n' => nombre, 'names' => [noms proches]], 'places' => [i => [ids de lieux]]].
 * $o : offset, limit, phonetic (true = toujours phonétique), kind (human|animal|''), where (condition SQL en plus sur p,
 *      avec ses paramètres nommés dans params), order (ORDER BY après le rang), places (true : un mot peut être un lieu de
 *      naissance ou de décès, comme dans le menu de choix), settings.
 */
function rfr_person_ids(PDO $pdo, string $q, array $o = []): array
{
    rfr_register($pdo);
    rfr_refresh($pdo);
    $set = $o['settings'] ?? rfr_settings($pdo);
    $P = rfr_parse_query($q, $set);
    $always = !empty($o['phonetic']);
    $res = rfr_person_run($pdo, $P, $o, $set, $always);
    $res['fallback'] = null;
    $res['phonetic'] = $always;
    if (!$always && $set['auto'] && !$res['total'] && $P['tokens']) {
        $res2 = rfr_person_run($pdo, $P, $o, $set, true);
        if ($res2['total']) {
            $res = $res2;
            $res['phonetic'] = true;
            // les noms proches, tels qu'écrits dans les fiches (ceux qui ont répondu à l'oreille)
            $names = [];
            $why = rfr_why_of($pdo, ['ids' => array_slice($res2['ids'], 0, 40), 'parsed' => $P, 'settings' => $set, 'with_phon' => true, 'places' => $res2['places']]);
            foreach ($why as $list) { foreach ($list as $w) { if (($w['k'] ?? '') === 'phon' && count($names) < 5) { $names[mb_strtolower((string) $w['v'])] ??= (string) $w['v']; } } }
            $res['fallback'] = ['q' => trim((string) preg_replace('/\s+/u', ' ', $P['raw'])), 'n' => $res2['total'], 'names' => array_values($names)];
        }
    }
    $res['parsed'] = $P;
    $res['settings'] = $set;
    return $res;
}

function rfr_person_run(PDO $pdo, array $P, array $o, array $set, bool $withPhon): array
{
    $params = [];
    $subs = [];
    $places = [];
    foreach ($P['tokens'] as $k => $t) {
        $ex = [];
        foreach ($t['parts'] as $j => $part) { $ex[] = "n.words LIKE :e{$k}_{$j}"; $params[":e{$k}_{$j}"] = '%' . strtr($part, ['%' => '', '_' => '']) . '%'; }
        $exact = '(' . implode(' AND ', $ex) . ')';
        $eq = [];
        foreach ($t['keys'] as $j => $key) { $eq[] = "n.last_keys LIKE :g{$k}_{$j}"; $params[":g{$k}_{$j}"] = '% ' . $key . ' %'; }
        if ($t['first']) {
            $c = $t['first']['canon'];
            $pre = [''];
            if ($set['latin']) { $pre[] = 'l:'; }
            if ($set['abr']) { array_push($pre, 'a:', 'd:', 'c:'); }
            foreach ($pre as $j => $p) { $eq[] = "n.first_canons LIKE :c{$k}_{$j}"; $params[":c{$k}_{$j}"] = '% ' . $p . $c . ' %'; }
        }
        $eqSql = $eq ? '(' . implode(' OR ', $eq) . ')' : '0';
        $ph = '0';
        if ($withPhon && $t['phon'] !== '') {
            $near = rfr_near_keys($pdo, $t['phon']);
            $ph = "(n.last_phon IN (SELECT value FROM json_each(:p{$k}))" . (strlen($t['phon']) >= 2 ? " OR n.first_phons LIKE :fp{$k}" : '') . ')';
            $params[":p{$k}"] = json_encode($near);
            if (strlen($t['phon']) >= 2) { $params[":fp{$k}"] = '% ' . $t['phon'] . ' %'; }
        }
        $subs[] = "SELECT n.person_id AS person_id, {$k} AS k, MIN(CASE WHEN {$exact} THEN (CASE WHEN n.src=0 THEN 0 ELSE 1 END) WHEN {$eqSql} THEN 2 ELSE 3 END) AS tier
            FROM main.rfr_names n WHERE {$exact} OR {$eqSql} OR {$ph} GROUP BY n.person_id";
        if (!empty($o['places']) && $t['merged'] !== 'first' && strlen($t['fold']) >= 2) {
            $places[$k] = rfr_place_ids($pdo, $t['raw']);
            if ($places[$k]) {
                $params[":pl{$k}"] = json_encode($places[$k]);
                $subs[] = "SELECT e.person_id, {$k}, 0 FROM events e JOIN event_types et ON et.id=e.event_type_id WHERE e.person_id IS NOT NULL AND et.gedcom_tag IN ('BIRT','DEAT') AND e.place_id IN (SELECT value FROM json_each(:pl{$k}))";
            }
        }
    }
    $where = [];
    foreach ($P['dates'] as $i => $d) { $where[] = rfr_date_sql($d, $i, $params); }
    if (($o['kind'] ?? '') === 'animal') { $where[] = "p.kind='animal'"; }
    elseif (($o['kind'] ?? '') === 'human') { $where[] = "COALESCE(p.kind,'human')<>'animal'"; }
    if (!empty($o['where'])) { $where[] = '(' . $o['where'] . ')'; $params += $o['params'] ?? []; }
    $order = $o['order'] ?? ("CASE WHEN trim(COALESCE(p.last_name,''))='' THEN 1 WHEN p.last_name GLOB '[?X]*' OR lower(p.last_name)='inconnu' THEN 2 ELSE 0 END," . fold_sort_sql('p.last_name') . ',' . fold_sort_sql('p.first_name') . ',p.id');
    $limit = max(1, (int) ($o['limit'] ?? 120));
    $offset = max(0, (int) ($o['offset'] ?? 0));
    if ($subs) {
        $n = count($P['tokens']);
        $sql = 'WITH t(person_id,k,tier) AS (' . implode(' UNION ALL ', $subs) . "),
            m AS (SELECT person_id, MAX(tt) AS tier FROM (SELECT person_id, k, MIN(tier) AS tt FROM t GROUP BY person_id, k) GROUP BY person_id HAVING count(*) = {$n})
            SELECT p.id, m.tier, count(*) OVER () AS total_ FROM m JOIN persons p ON p.id=m.person_id LEFT JOIN surname_groups g ON g.id=p.surname_group_id"
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY m.tier, {$order} LIMIT {$limit} OFFSET {$offset}";
    } else {
        $sql = 'SELECT p.id, 0 AS tier, count(*) OVER () AS total_ FROM persons p LEFT JOIN surname_groups g ON g.id=p.surname_group_id'
            . ($where ? ' WHERE ' . implode(' AND ', $where) : ' WHERE 0') . " ORDER BY {$order} LIMIT {$limit} OFFSET {$offset}";
    }
    $s = $pdo->prepare($sql);
    foreach ($params as $key => $v) { if (preg_match('/' . preg_quote((string) $key, '/') . '(?![A-Za-z0-9_])/', $sql)) { $s->bindValue($key, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR); } }
    $s->execute();
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $ids = []; $tiers = []; $total = 0;
    foreach ($rows as $r) { $ids[] = (int) $r['id']; $tiers[(int) $r['id']] = (int) $r['tier']; $total = (int) $r['total_']; }
    if (!$total && $offset > 0) { $total = -1; } // plus loin que la fin
    return ['ids' => $ids, 'tiers' => $tiers, 'total' => max(0, $total), 'places' => $places, 'with_phon' => $withPhon];
}

/** les noms (fiche + variantes) de ces fiches, pour rfr_explain */
function rfr_forms_of(PDO $pdo, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return []; }
    $in = implode(',', $ids);
    $out = [];
    foreach ($pdo->query("SELECT p.id, COALESCE(p.first_name,'') f, COALESCE(p.middle_name,'') m, COALESCE(p.last_name,'') l, COALESCE(g.name,'') g FROM main.persons p LEFT JOIN main.surname_groups g ON g.id=p.surname_group_id WHERE p.id IN ({$in})") as $r) {
        $out[(int) $r['id']][] = ['src' => 0, 'type' => '', 'first' => $r['f'], 'middle' => $r['m'], 'last' => $r['l'], 'group' => $r['g']];
    }
    foreach ($pdo->query("SELECT id, person_id, COALESCE(type,'') t, COALESCE(first_name,'') f, COALESCE(middle_name,'') m, COALESCE(last_name,'') l FROM main.name_variants WHERE person_id IN ({$in}) ORDER BY position, id") as $r) {
        $out[(int) $r['person_id']][] = ['src' => (int) $r['id'], 'type' => $r['t'], 'first' => $r['f'], 'middle' => $r['m'], 'last' => $r['l'], 'group' => ''];
    }
    return $out;
}

/** les dates principales de ces fiches (pour l'explication des dates) */
function rfr_dates_of(PDO $pdo, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return []; }
    $in = implode(',', $ids);
    $map = ['BIRT' => 'birth', 'CHR' => 'bapt', 'BAPM' => 'bapt', 'DEAT' => 'death', 'BURI' => 'buri'];
    $out = [];
    foreach ($pdo->query("SELECT e.person_id pid, t.gedcom_tag tag, e.year y, e.date_text tx FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ({$in}) AND e.year IS NOT NULL ORDER BY e.id") as $r) {
        $out[(int) $r['pid']][] = ['ev' => $map[$r['tag']] ?? 'other', 'y' => (int) $r['y'], 'text' => (string) $r['tx']];
    }
    foreach ($pdo->query("SELECT f.partner1_id a, f.partner2_id b, t.gedcom_tag tag, e.year y, e.date_text tx FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE (f.partner1_id IN ({$in}) OR f.partner2_id IN ({$in})) AND e.year IS NOT NULL ORDER BY e.id") as $r) {
        foreach ([(int) $r['a'], (int) $r['b']] as $pid) { if ($pid && in_array($pid, $ids, true)) { $out[$pid][] = ['ev' => in_array($r['tag'], ['MARR', 'MRCI', 'MRRE'], true) ? 'marr' : 'other', 'y' => (int) $r['y'], 'text' => (string) $r['tx']]; } }
    }
    $rank = ['birth' => 0, 'bapt' => 1, 'marr' => 2, 'death' => 3, 'buri' => 4, 'other' => 5];
    foreach ($out as &$list) { usort($list, static fn($x, $y) => $rank[$x['ev']] <=> $rank[$y['ev']]); }
    unset($list);
    return $out;
}

/** « Trouvé par » de chaque fiche de la page : [id => [why…]] */
function rfr_why_of(PDO $pdo, array $res): array
{
    $ids = $res['ids'];
    if (!$ids) { return []; }
    $forms = rfr_forms_of($pdo, $ids);
    $dates = $res['parsed']['dates'] ? rfr_dates_of($pdo, $ids) : [];
    $placeNames = [];
    if (!empty($res['places'])) {
        $all = array_unique(array_merge(...array_values($res['places'])));
        if ($all) { foreach ($pdo->query('SELECT id, name FROM places WHERE id IN (' . implode(',', array_map('intval', $all)) . ')') as $r) { $placeNames[(int) $r['id']] = (string) $r['name']; } }
    }
    $personPlaces = [];
    if ($placeNames) {
        $in = implode(',', $ids);
        foreach ($pdo->query("SELECT e.person_id, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ({$in}) AND t.gedcom_tag IN ('BIRT','DEAT') AND e.place_id IS NOT NULL") as $r) { $personPlaces[(int) $r['person_id']][(int) $r['place_id']] = true; }
    }
    $out = [];
    foreach ($ids as $id) {
        $extra = [];
        foreach ($res['places'] ?? [] as $k => $pl) {
            foreach ($pl as $plid) { if (isset($personPlaces[$id][$plid])) { $extra[$k] = ['k' => 'place', 'v' => $placeNames[$plid] ?? '']; break; } }
        }
        $e = rfr_explain($res['parsed'], $forms[$id] ?? [], $res['settings'], $res['with_phon'] ?? $res['phonetic'], $extra);
        $out[$id] = array_merge($e['why'], rfr_explain_dates($res['parsed']['dates'], $dates[$id] ?? []));
    }
    return $out;
}

/**
 * Raison d'un lieu trouvé (menu de choix, ⌘K, Listes → Lieux) : null si son nom contient le mot tel quel ;
 * sinon Saint/Ste écrit autrement, article du début, ancien nom, ou commune fusionnée (historique de l'INSEE).
 */
function rfr_place_why(PDO $pdo, int $id, string $name, string $alternates, string $q): ?array
{
    $f = rfr_fold($q);
    if ($f === '' || str_contains(rfr_fold($name), $f)) { return null; }
    $pf = rfr_place_fold($name);
    foreach (rfr_place_variants($q) as $v) { if ($v !== $f && (str_contains($pf, $v) || str_contains(rfr_fold($name), $v))) { return ['k' => 'saint', 'v' => $name]; } }
    if (str_contains($pf, rfr_place_fold($q))) { return ['k' => 'saint', 'v' => $name]; }
    static $fusion = null;
    if ($fusion === null) {
        $fusion = [];
        try { $fusion = json_decode((string) ($pdo->query("SELECT value FROM meta WHERE key='frontieres_alt'")->fetchColumn() ?: '{}'), true) ?: []; } catch (Throwable $_) {}
    }
    foreach (array_slice(explode(',', $alternates), 0, 80) as $alt) {
        $alt = trim($alt);
        if ($alt === '') { continue; }
        $af = rfr_fold($alt);
        $ok = false;
        foreach (rfr_place_variants($q) as $v) { if (str_contains($af, $v) || str_contains(rfr_place_fold($alt), $v)) { $ok = true; break; } }
        if (!$ok) { continue; }
        $isFusion = in_array($af, array_map('rfr_fold', (array) ($fusion[(string) $id] ?? [])), true);
        return ['k' => $isFusion ? 'fusion' : 'oldname', 'v' => $alt, 'now' => $name];
    }
    return null;
}

/** API GET « rfr_explain » : ce que la recherche comprend d'un texte (pour l'écran des réglages et la question en phrase) */
function rfr_api_parse(PDO $pdo, string $q): array
{
    $set = rfr_settings($pdo);
    $P = rfr_parse_query($q, $set);
    return ['settings' => $set, 'parsed' => $P];
}

/* ═════════ Listes → Personnes, Événements, Lieux (api.php list_data) ═════════ */

/**
 * Une liste cherchée « à la française » : ['rows' => …, 'total' => …]. $cond / $condParams : les filtres de la liste
 * (sexe, lieu de naissance, étiquette…) écrits avec des « ? », sur les fiches (alias p).
 */
function rfr_list_rows(PDO $pdo, string $type, string $q, int $limit, int $offset, string $cond = '', array $condParams = []): array
{
    rfr_register($pdo);
    if ($type === 'events') { return rfr_list_events($pdo, $q, $limit, $offset); }
    if ($type === 'places') { return rfr_list_places($pdo, $q, $limit, $offset); }
    $i = 0;
    $named = (string) preg_replace_callback('/\?/', static function () use (&$i) { return ':lg' . ($i++); }, preg_replace('/^\s*AND\s+/i', '', trim($cond)));
    $np = [];
    foreach (array_values($condParams) as $k => $v) { $np[':lg' . $k] = $v; }
    $res = rfr_person_ids($pdo, $q, ['offset' => $offset, 'limit' => $limit, 'where' => $named, 'params' => $np,
        'order' => "CASE WHEN trim(COALESCE(p.last_name,''))='' THEN 1 ELSE 0 END," . fold_sort_sql('p.last_name') . ',' . fold_sort_sql('p.first_name') . ',p.id']);
    $rows = [];
    if ($res['ids']) {
        $why = rfr_why_of($pdo, $res);
        $by = [];
        foreach ($pdo->query(person_select() . ' WHERE p.id IN (' . implode(',', $res['ids']) . ')')->fetchAll() as $r) { $by[(int) $r['id']] = $r; }
        foreach ($res['ids'] as $id) { if (isset($by[$id])) { $rows[] = $by[$id] + ['why' => $why[$id] ?? []]; } }
    }
    return ['rows' => $rows, 'total' => $res['total'], 'fallback' => $res['fallback']];
}

/** Listes → Événements : la sorte, la personne ou le couple (avec les équivalences des noms et prénoms), et les dates tapées */
function rfr_list_events(PDO $pdo, string $q, int $limit, int $offset): array
{
    $set = rfr_settings($pdo);
    $D = rfr_parse_dates($q, (int) $set['vers']);
    $where = []; $params = [];
    foreach ($D['dates'] as $i => $d) {
        if ($d['from'] !== null) { $where[] = 'e.year >= ?'; $params[] = (int) $d['from']; }
        if ($d['to'] !== null) { $where[] = 'e.year <= ?'; $params[] = (int) $d['to']; }
        if ($d['ymd'] !== '') { $where[] = 'rfr_ymd(e.date_text) LIKE ?'; $params[] = $d['ymd'] . '%'; }
    }
    $rest = $D['rest'];
    $res = null;
    if ($rest !== '') {
        $res = rfr_person_ids($pdo, $rest, ['limit' => 20000, 'settings' => ['auto' => false] + $set]);
        if ($res['ids']) {
            $ids = json_encode($res['ids']);
            $where[] = '(' . list_event_search_sql() . ' OR e.person_id IN (SELECT value FROM json_each(?)) OR fa.partner1_id IN (SELECT value FROM json_each(?)) OR fa.partner2_id IN (SELECT value FROM json_each(?)))';
            $params = array_merge($params, list_event_search_params('%' . $rest . '%'), [$ids, $ids, $ids]);
        } else {
            $where[] = list_event_search_sql();
            $params = array_merge($params, list_event_search_params('%' . $rest . '%'));
        }
    }
    $sql = "SELECT e.id,e.date_text,e.year,t.label AS type,COALESCE(p.id,f1.id,f2.id) AS person_id,CASE WHEN p.id IS NOT NULL THEN trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')) ELSE trim(trim(COALESCE(f1.first_name,'')||' '||COALESCE(f1.last_name,''))||CASE WHEN f1.id IS NOT NULL AND f2.id IS NOT NULL THEN ' et ' ELSE '' END||trim(COALESCE(f2.first_name,'')||' '||COALESCE(f2.last_name,''))) END AS person,f1.id AS partner1_id,f2.id AS partner2_id,trim(pl.name || CASE WHEN COALESCE(pl.subdivision,'')<>'' THEN ', '||pl.subdivision ELSE '' END) AS place
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families fa ON fa.id=e.family_id LEFT JOIN persons f1 ON f1.id=fa.partner1_id LEFT JOIN persons f2 ON f2.id=fa.partner2_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE " . ($where ? implode(' AND ', $where) : '0') . ' ORDER BY COALESCE(e.year,9999),e.sort_date,e.id LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;
    $s = $pdo->prepare($sql);
    $s->execute($params);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $total = $offset + count($rows);
    if (count($rows) >= $limit) { // le nombre seulement s'il y a une suite (comme count_list_remaining)
        $c = $pdo->prepare('SELECT count(*) FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id LEFT JOIN families fa ON fa.id=e.family_id LEFT JOIN persons f1 ON f1.id=fa.partner1_id LEFT JOIN persons f2 ON f2.id=fa.partner2_id WHERE ' . ($where ? implode(' AND ', $where) : '0'));
        $c->execute($params);
        $total = (int) $c->fetchColumn();
    }
    $why = [];
    if ($res && $res['ids']) {
        $pids = [];
        foreach ($rows as $r) { foreach (['person_id', 'partner1_id', 'partner2_id'] as $c) { if ((int) ($r[$c] ?? 0) && isset($res['tiers'][(int) $r[$c]])) { $pids[(int) $r[$c]] = true; } } }
        if ($pids) { $why = rfr_why_of($pdo, ['ids' => array_keys($pids), 'parsed' => rfr_parse_query($rest, $set), 'settings' => $set, 'with_phon' => false, 'places' => []]); }
    }
    foreach ($rows as &$r) {
        $w = [];
        foreach (['person_id', 'partner1_id', 'partner2_id'] as $c) { if (isset($why[(int) ($r[$c] ?? 0)])) { $w = $why[(int) $r[$c]]; break; } }
        $r['why'] = array_merge($w, rfr_explain_dates($D['dates'], [['ev' => 'other', 'y' => $r['year'], 'text' => (string) $r['date_text']]]));
    }
    unset($r);
    return ['rows' => $rows, 'total' => $total, 'fallback' => null];
}

/** Listes → Lieux : Saint / St / Ste, l'article du début, les anciens noms et communes fusionnées */
function rfr_list_places(PDO $pdo, string $q, int $limit, int $offset): array
{
    $vs = rfr_place_variants($q) ?: [rfr_fold($q)];
    $parts = []; $params = [];
    foreach ($vs as $v) {
        $parts[] = '(' . list_place_where_sql($pdo) . ')';
        $params = array_merge($params, list_place_search_params('%' . $v . '%'));
        $parts[] = "(pl.alternate_names<>'' AND lc_fold(pl.alternate_names) LIKE ?)";
        $params[] = '%' . $v . '%';
    }
    $parts[] = "(pl.name LIKE '%st%' AND rfr_place_fold(pl.name) LIKE ?)";
    $params[] = '%' . rfr_place_fold($q) . '%';
    // les lieux de la généalogie seulement (même règle que la liste : list_place_where_sql, ici avec une recherche vide)
    $usedOnly = '(' . list_place_where_sql($pdo) . ')';
    $params = array_merge($params, list_place_search_params('%%'));
    $sql = 'SELECT pl.*,(SELECT count(*) FROM events e WHERE e.place_id=pl.id) AS event_count, count(*) OVER () AS total_ FROM places pl WHERE (' . implode(' OR ', $parts) . ") AND {$usedOnly}
        ORDER BY event_count DESC," . fold_sort_sql('pl.name') . ',' . fold_sort_sql("COALESCE(pl.subdivision,'')") . ',pl.id LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;
    $s = $pdo->prepare($sql);
    $s->execute($params);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    $total = $rows ? (int) $rows[0]['total_'] : 0;
    foreach ($rows as &$r) { unset($r['total_']); $w = rfr_place_why($pdo, (int) $r['id'], (string) $r['name'], (string) ($r['alternate_names'] ?? ''), $q); $r['why'] = $w ? [$w] : []; }
    unset($r);
    return ['rows' => $rows, 'total' => $total, 'fallback' => null];
}
