<?php
declare(strict_types=1);
/**
 * 🌐 Traduction côté serveur (même dictionnaire que assets/js/app-i18n.js ; mode d'emploi : docs/I18N.md).
 *
 *  - i18n_lang() : la langue de la page — en-tête « X-LCNDA-Lang » envoyé par app.js (api()), sinon le cookie lcnda_lang ;
 *    toujours une des 30 langues (fr par défaut).
 *  - i18n_t('Texte français', ['n' => 3]) : le texte dans cette langue, sinon le français (variables {x} remplacées).
 *  - json_response() passe le message « error » par i18n_t() : un message d'erreur connu arrive traduit ; en français,
 *    rien ne change.
 */

const I18N_LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'cs', 'sv', 'da', 'sk', 'nb', 'ro', 'fi', 'hu', 'hr', 'sl', 'lt', 'lv', 'et', 'is', 'tr', 'lb', 'sq', 'mt', 'vi', 'id', 'ru', 'uk'];

function i18n_lang(): string
{
    static $lang = null;
    if ($lang !== null) { return $lang; }
    $h = strtolower(substr((string) ($_SERVER['HTTP_X_LCNDA_LANG'] ?? ''), 0, 5));
    $c = strtolower(substr((string) ($_COOKIE['lcnda_lang'] ?? ''), 0, 5));
    $lang = in_array($h, I18N_LANGS, true) ? $h : (in_array($c, I18N_LANGS, true) ? $c : 'fr');
    return $lang;
}

/** le dictionnaire d'une langue (assets/i18n/<code>.json), lu une fois ; [] pour le français */
function i18n_dict(?string $lang = null): array
{
    static $cache = [];
    $lang = $lang ?? i18n_lang();
    if ($lang === 'fr' || !in_array($lang, I18N_LANGS, true)) { return []; }
    if (!isset($cache[$lang])) {
        $file = dirname(__DIR__) . '/assets/i18n/' . $lang . '.json';
        $data = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        $cache[$lang] = is_array($data) ? $data : [];
    }
    return $cache[$lang];
}

function i18n_t(string $text, array $vars = [], string $ctx = ''): string
{
    $out = $text;
    $d = i18n_dict();
    if ($d) {
        $v = ($ctx !== '' && isset($d[$ctx . '|' . $text])) ? $d[$ctx . '|' . $text] : ($d[$text] ?? null);
        if (is_array($v)) {
            $n = isset($vars['n']) && is_numeric($vars['n']) ? (float) $vars['n'] : 1.0;
            // roumain : 1 → one ; 0, 2 à 19 (et 101 à 119…) → few ; 20 et plus → other (« 20 de persoane »), comme Intl.PluralRules('ro')
            $few = i18n_lang() === 'ro' && $n != 1.0 && ($n == 0.0 || floor($n) != $n || (fmod($n, 100.0) >= 1 && fmod($n, 100.0) <= 19));
            // finnois, hongrois, estonien, turc, luxembourgeois et albanais : 1 → one, sinon other ; vietnamien et indonésien : toujours other (une seule forme) (hongrois et turc : le nom reste au singulier après un nombre, « 5 személy », « 5 kişi »)
            $cat = i18n_plural_cat(i18n_lang(), $n); // croate, slovène, lituanien, letton, islandais, maltais, vietnamien, indonésien, russe, ukrainien : leur propre règle (les autres langues ne changent pas)
            if ($cat !== null) { $v = $v[$cat] ?? $v['other'] ?? $v['one'] ?? null; }
            else { $v = ($few ? ($v['few'] ?? null) : null) ?? ($n == 1.0 ? ($v['one'] ?? null) : null) ?? $v['other'] ?? $v['many'] ?? $v['one'] ?? null; } // un mot au pluriel lu tout seul : la forme « un »
        }
        if (is_string($v) && $v !== '') { $out = $v; }
    }
    if ($vars) {
        $out = (string) preg_replace_callback('/\{([a-z_][a-z0-9_]*)\}/i', static fn ($m) => array_key_exists($m[1], $vars) ? (string) $vars[$m[1]] : $m[0], $out);
    }
    return $out;
}

/** croate (hr) : one (1, 21, 31… sauf 11) | few (2–4, 22–24… sauf 12–14) | other ;
 *  slovène (sl) : one (1, 101…) | two (2, 102…) | few (3, 4, 103, 104… et les nombres à virgule) | other (0, 5 et plus) —
 *  lituanien (lt) : one (1, 21, 31… sauf 11) | few (2–9, 22–29… sauf 12–19) | many (les nombres à virgule ; dans le
 *  dictionnaire = la forme other) | other (0, 10–20, 30…) ;
 *  letton (lv) : zero (0, 10–20, 30…) | one (1, 21… sauf 11) | other (le reste, et les nombres à virgule) ;
 *  islandais (is) : one (1, 21, 31, 101… sauf 11, 111… ; à virgule : 0,1, 1,1… quand la partie après la virgule finit par 1
 *  sauf 11) | other (0, 2–20, 111… et 1,5) ;
 *  maltais (mt, CLDR 42 et plus) : one (1) | two (2) | few (0, 3–10, 103–110…) | many (11–19, 111–119…) | other (20–102,
 *  120…, et les nombres à virgule) ;
 *  vietnamien (vi) et indonésien (id) : une seule forme, other, pour tous les nombres (« 1 người », « 5 orang ») ;
 *  russe (ru) et ukrainien (uk) : one (1, 21, 31… sauf 11) | few (2–4, 22–24… sauf 12–14) | many (0, 5–20, 25–30…) |
 *  other (les nombres à virgule ; dans le dictionnaire = la forme few, « 1,5 человека ») —
 *  comme Intl.PluralRules('hr' / 'sl' / 'lt' / 'lv' / 'is' / 'mt' / 'vi' / 'id' / 'ru' / 'uk') ; null pour les autres langues (leur règle d'avant reste) */
function i18n_plural_cat(string $lang, float $n): ?string
{
    if ($lang === 'vi' || $lang === 'id') { return 'other'; }
    if (!in_array($lang, ['hr', 'sl', 'lt', 'lv', 'is', 'mt', 'ru', 'uk'], true)) { return null; }
    $n = abs($n);
    if ($lang === 'ru' || $lang === 'uk') {
        if (floor($n) != $n) { return 'other'; }
        $m10 = fmod($n, 10.0); $m100 = fmod($n, 100.0);
        if ($m10 == 1.0 && $m100 != 11.0) { return 'one'; }
        return ($m10 >= 2.0 && $m10 <= 4.0 && ($m100 < 12.0 || $m100 > 14.0)) ? 'few' : 'many';
    }
    if ($lang === 'mt') {
        if (floor($n) != $n) { return 'other'; }
        if ($n == 1.0) { return 'one'; }
        if ($n == 2.0) { return 'two'; }
        $m100 = fmod($n, 100.0);
        if ($n == 0.0 || ($m100 >= 3.0 && $m100 <= 10.0)) { return 'few'; }
        return ($m100 >= 11.0 && $m100 <= 19.0) ? 'many' : 'other';
    }
    if ($lang === 'is') {
        $s = rtrim(rtrim(sprintf('%.6F', $n), '0'), '.'); $dot = strpos($s, '.');
        $k = $dot === false ? (int) $s : (int) substr($s, $dot + 1); // nombre entier, sinon la partie après la virgule
        return ($k % 10 === 1 && $k % 100 !== 11) ? 'one' : 'other';
    }
    if (floor($n) != $n) { return ['sl' => 'few', 'lt' => 'many', 'lv' => 'other'][$lang] ?? 'other'; }
    $m10 = fmod($n, 10.0); $m100 = fmod($n, 100.0);
    if ($lang === 'lt') {
        if ($m100 >= 11.0 && $m100 <= 19.0) { return 'other'; }
        if ($m10 == 1.0) { return 'one'; }
        return $m10 >= 2.0 ? 'few' : 'other';
    }
    if ($lang === 'lv') {
        if ($m10 == 0.0 || ($m100 >= 11.0 && $m100 <= 19.0)) { return 'zero'; }
        return $m10 == 1.0 ? 'one' : 'other';
    }
    if ($lang === 'hr') {
        if ($m10 == 1.0 && $m100 != 11.0) { return 'one'; }
        return ($m10 >= 2.0 && $m10 <= 4.0 && ($m100 < 12.0 || $m100 > 14.0)) ? 'few' : 'other';
    }
    if ($m100 == 1.0) { return 'one'; }
    if ($m100 == 2.0) { return 'two'; }
    return ($m100 == 3.0 || $m100 == 4.0) ? 'few' : 'other';
}

/**
 * 🌐 la langue de l'ordinateur (en-tête Accept-Language, « de-CH,de;q=0.9,en;q=0.8 ») : la première des langues de l'app,
 * par ordre de préférence ; norvégien (no, nn) → bokmål ; une langue que l'app ne connaît pas → l'anglais ; rien → le français.
 * Suit I18N_LANGS : une langue ajoutée plus tard est reconnue toute seule.
 */
function i18n_detect_lang(string $accept): string
{
    $accept = substr($accept, 0, 500);
    $items = [];
    foreach (explode(',', $accept) as $i => $part) {
        $bits = explode(';', trim($part));
        $tag = strtolower(trim($bits[0]));
        if ($tag === '' || $tag === '*') { continue; }
        $q = 1.0;
        foreach (array_slice($bits, 1) as $b) {
            if (preg_match('/^\s*q\s*=\s*([0-9.]+)\s*$/i', $b, $m)) { $q = (float) $m[1]; }
        }
        if ($q <= 0) { continue; }
        $items[] = [$tag, $q, $i];
    }
    if (!$items) { return 'fr'; }
    usort($items, fn($a, $b) => $b[1] <=> $a[1] ?: $a[2] <=> $b[2]);
    foreach ($items as [$tag]) {
        $base = explode('-', str_replace('_', '-', $tag))[0];
        if (in_array($base, ['no', 'nn'], true)) { $base = 'nb'; }
        if (in_array($base, I18N_LANGS, true)) { return $base; }
    }
    return 'en';
}

/**
 * la langue d'une page HTML (index.php) : le cookie ; au tout premier lancement (pas encore de base, aucun choix gardé),
 * i18n_page_lang(true) prend la langue de l'ordinateur (i18n_detect_lang) — une base existante ne change jamais de langue.
 */
function i18n_page_lang(?bool $firstRun = null): string
{
    static $first = false;
    if ($firstRun !== null) { $first = $firstRun; }
    $c = strtolower(substr((string) ($_COOKIE['lcnda_lang'] ?? ''), 0, 5));
    if (in_array($c, I18N_LANGS, true)) { return $c; }
    if ($first && !isset($_COOKIE['lcnda_lang'])) { return i18n_detect_lang((string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')); }
    return 'fr';
}

/** le dictionnaire écrit dans la page (sans aller le chercher ensuite) ; '' en français */
function i18n_page_script(): string
{
    $lang = i18n_page_lang();
    // langue devinée au premier lancement : l'app la garde (localStorage) comme si on l'avait choisie
    $guess = !isset($_COOKIE['lcnda_lang']) && $lang !== 'fr' ? '<script>window.LCNDA_I18N_FIRST=' . json_encode($lang) . ';</script>' : '';
    if ($lang === 'fr') { return ''; }
    $file = dirname(__DIR__) . '/assets/i18n/' . $lang . '.json';
    if (!is_file($file)) { return ''; }
    $data = json_decode((string) file_get_contents($file), true);
    if (!is_array($data)) { return ''; }
    return $guess . '<script>window.LCNDA_I18N_DATA=' . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>';
}
