<?php
declare(strict_types=1);
/**
 * 🌐 Traduction côté serveur (même dictionnaire que assets/js/app-i18n.js ; mode d'emploi : docs/I18N.md).
 *
 *  - i18n_lang() : la langue de la page — en-tête « X-LCNDA-Lang » envoyé par app.js (api()), sinon le cookie lcnda_lang ;
 *    toujours une des 16 langues (fr par défaut).
 *  - i18n_t('Texte français', ['n' => 3]) : le texte dans cette langue, sinon le français (variables {x} remplacées).
 *  - json_response() passe le message « error » par i18n_t() : un message d'erreur connu arrive traduit ; en français,
 *    rien ne change.
 */

const I18N_LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'pl', 'nl', 'cs', 'sv', 'da', 'sk', 'nb', 'ro', 'fi', 'hu'];

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
            // finnois et hongrois : 1 → one, sinon other (hongrois : le nom reste au singulier après un nombre, « 5 személy »)
            $v = ($few ? ($v['few'] ?? null) : null) ?? ($n == 1.0 ? ($v['one'] ?? null) : null) ?? $v['other'] ?? $v['many'] ?? $v['one'] ?? null; // un mot au pluriel lu tout seul : la forme « un »
        }
        if (is_string($v) && $v !== '') { $out = $v; }
    }
    if ($vars) {
        $out = (string) preg_replace_callback('/\{([a-z_][a-z0-9_]*)\}/i', static fn ($m) => array_key_exists($m[1], $vars) ? (string) $vars[$m[1]] : $m[0], $out);
    }
    return $out;
}

/** la langue d'une page HTML (index.php) : le cookie seulement */
function i18n_page_lang(): string
{
    $c = strtolower(substr((string) ($_COOKIE['lcnda_lang'] ?? ''), 0, 5));
    return in_array($c, I18N_LANGS, true) ? $c : 'fr';
}

/** le dictionnaire écrit dans la page (sans aller le chercher ensuite) ; '' en français */
function i18n_page_script(): string
{
    $lang = i18n_page_lang();
    if ($lang === 'fr') { return ''; }
    $file = dirname(__DIR__) . '/assets/i18n/' . $lang . '.json';
    if (!is_file($file)) { return ''; }
    $data = json_decode((string) file_get_contents($file), true);
    if (!is_array($data)) { return ''; }
    return '<script>window.LCNDA_I18N_DATA=' . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';</script>';
}
