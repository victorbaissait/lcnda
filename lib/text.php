<?php
declare(strict_types=1);

/**
 * Retire les accents d'un texte (« Évelyne Çelik » → « Evelyne Celik »).
 *
 * Remplace les appels à iconv('ASCII//TRANSLIT'), dont le résultat dépend du système :
 * macOS produit « 'e » pour « é », Linux/Windows selon la bibliothèque embarquée.
 * Ici la table est fixe : le résultat est identique partout.
 */
function ascii_fold(string $value): string
{
    static $map = null;
    if ($map === null) {
        $map = [
            'À'=>'A', 'Á'=>'A', 'Â'=>'A', 'Ã'=>'A', 'Ä'=>'A', 'Å'=>'A',
            'Æ'=>'AE', 'Ç'=>'C', 'È'=>'E', 'É'=>'E', 'Ê'=>'E', 'Ë'=>'E',
            'Ì'=>'I', 'Í'=>'I', 'Î'=>'I', 'Ï'=>'I', 'Ð'=>'D', 'Ñ'=>'N',
            'Ò'=>'O', 'Ó'=>'O', 'Ô'=>'O', 'Õ'=>'O', 'Ö'=>'O', 'Ø'=>'O',
            'Ù'=>'U', 'Ú'=>'U', 'Û'=>'U', 'Ü'=>'U', 'Ý'=>'Y', 'Þ'=>'Th',
            'ß'=>'ss', 'à'=>'a', 'á'=>'a', 'â'=>'a', 'ã'=>'a', 'ä'=>'a',
            'å'=>'a', 'æ'=>'ae', 'ç'=>'c', 'è'=>'e', 'é'=>'e', 'ê'=>'e',
            'ë'=>'e', 'ì'=>'i', 'í'=>'i', 'î'=>'i', 'ï'=>'i', 'ð'=>'d',
            'ñ'=>'n', 'ò'=>'o', 'ó'=>'o', 'ô'=>'o', 'õ'=>'o', 'ö'=>'o',
            'ø'=>'o', 'ù'=>'u', 'ú'=>'u', 'û'=>'u', 'ü'=>'u', 'ý'=>'y',
            'þ'=>'th', 'ÿ'=>'y', 'Ā'=>'A', 'ā'=>'a', 'Ă'=>'A', 'ă'=>'a',
            'Ą'=>'A', 'ą'=>'a', 'Ć'=>'C', 'ć'=>'c', 'Ĉ'=>'C', 'ĉ'=>'c',
            'Ċ'=>'C', 'ċ'=>'c', 'Č'=>'C', 'č'=>'c', 'Ď'=>'D', 'ď'=>'d',
            'Đ'=>'D', 'đ'=>'d', 'Ē'=>'E', 'ē'=>'e', 'Ĕ'=>'E', 'ĕ'=>'e',
            'Ė'=>'E', 'ė'=>'e', 'Ę'=>'E', 'ę'=>'e', 'Ě'=>'E', 'ě'=>'e',
            'Ĝ'=>'G', 'ĝ'=>'g', 'Ğ'=>'G', 'ğ'=>'g', 'Ġ'=>'G', 'ġ'=>'g',
            'Ģ'=>'G', 'ģ'=>'g', 'Ĥ'=>'H', 'ĥ'=>'h', 'Ħ'=>'H', 'ħ'=>'h',
            'Ĩ'=>'I', 'ĩ'=>'i', 'Ī'=>'I', 'ī'=>'i', 'Ĭ'=>'I', 'ĭ'=>'i',
            'Į'=>'I', 'į'=>'i', 'İ'=>'I', 'ı'=>'i', 'Ĵ'=>'J', 'ĵ'=>'j',
            'Ķ'=>'K', 'ķ'=>'k', 'ĸ'=>'k', 'Ĺ'=>'L', 'ĺ'=>'l', 'Ļ'=>'L',
            'ļ'=>'l', 'Ľ'=>'L', 'ľ'=>'l', 'Ł'=>'L', 'ł'=>'l', 'Ń'=>'N',
            'ń'=>'n', 'Ņ'=>'N', 'ņ'=>'n', 'Ň'=>'N', 'ň'=>'n', 'ŉ'=>'n',
            'Ŋ'=>'N', 'ŋ'=>'n', 'Ō'=>'O', 'ō'=>'o', 'Ŏ'=>'O', 'ŏ'=>'o',
            'Ő'=>'O', 'ő'=>'o', 'Œ'=>'OE', 'œ'=>'oe', 'Ŕ'=>'R', 'ŕ'=>'r',
            'Ŗ'=>'R', 'ŗ'=>'r', 'Ř'=>'R', 'ř'=>'r', 'Ś'=>'S', 'ś'=>'s',
            'Ŝ'=>'S', 'ŝ'=>'s', 'Ş'=>'S', 'ş'=>'s', 'Š'=>'S', 'š'=>'s',
            'Ţ'=>'T', 'ţ'=>'t', 'Ť'=>'T', 'ť'=>'t', 'Ŧ'=>'T', 'ŧ'=>'t',
            'Ũ'=>'U', 'ũ'=>'u', 'Ū'=>'U', 'ū'=>'u', 'Ŭ'=>'U', 'ŭ'=>'u',
            'Ů'=>'U', 'ů'=>'u', 'Ű'=>'U', 'ű'=>'u', 'Ų'=>'U', 'ų'=>'u',
            'Ŵ'=>'W', 'ŵ'=>'w', 'Ŷ'=>'Y', 'ŷ'=>'y', 'Ÿ'=>'Y', 'Ź'=>'Z',
            'ź'=>'z', 'Ż'=>'Z', 'ż'=>'z', 'Ž'=>'Z', 'ž'=>'z', 'Ơ'=>'O',
            'ơ'=>'o', 'Ư'=>'U', 'ư'=>'u', 'Ǎ'=>'A', 'ǎ'=>'a', 'Ǐ'=>'I',
            'ǐ'=>'i', 'Ǒ'=>'O', 'ǒ'=>'o', 'Ǔ'=>'U', 'ǔ'=>'u', 'Ǖ'=>'U',
            'ǖ'=>'u', 'Ǘ'=>'U', 'ǘ'=>'u', 'Ǚ'=>'U', 'ǚ'=>'u', 'Ǜ'=>'U',
            'ǜ'=>'u', 'Ǟ'=>'A', 'ǟ'=>'a', 'Ǡ'=>'A', 'ǡ'=>'a', 'Ǧ'=>'G',
            'ǧ'=>'g', 'Ǩ'=>'K', 'ǩ'=>'k', 'Ǫ'=>'O', 'ǫ'=>'o', 'Ǭ'=>'O',
            'ǭ'=>'o', 'ǰ'=>'j', 'Ǵ'=>'G', 'ǵ'=>'g', 'Ǹ'=>'N', 'ǹ'=>'n',
            'Ǻ'=>'A', 'ǻ'=>'a', 'Ȁ'=>'A', 'ȁ'=>'a', 'Ȃ'=>'A', 'ȃ'=>'a',
            'Ȅ'=>'E', 'ȅ'=>'e', 'Ȇ'=>'E', 'ȇ'=>'e', 'Ȉ'=>'I', 'ȉ'=>'i',
            'Ȋ'=>'I', 'ȋ'=>'i', 'Ȍ'=>'O', 'ȍ'=>'o', 'Ȏ'=>'O', 'ȏ'=>'o',
            'Ȑ'=>'R', 'ȑ'=>'r', 'Ȓ'=>'R', 'ȓ'=>'r', 'Ȕ'=>'U', 'ȕ'=>'u',
            'Ȗ'=>'U', 'ȗ'=>'u', 'Ș'=>'S', 'ș'=>'s', 'Ț'=>'T', 'ț'=>'t',
            'Ȟ'=>'H', 'ȟ'=>'h', 'Ȧ'=>'A', 'ȧ'=>'a', 'Ȩ'=>'E', 'ȩ'=>'e',
            'Ȫ'=>'O', 'ȫ'=>'o', 'Ȭ'=>'O', 'ȭ'=>'o', 'Ȯ'=>'O', 'ȯ'=>'o',
            'Ȱ'=>'O', 'ȱ'=>'o', 'Ȳ'=>'Y', 'ȳ'=>'y', 'Ḁ'=>'A', 'ḁ'=>'a',
            'Ḃ'=>'B', 'ḃ'=>'b', 'Ḅ'=>'B', 'ḅ'=>'b', 'Ḇ'=>'B', 'ḇ'=>'b',
            'Ḉ'=>'C', 'ḉ'=>'c', 'Ḋ'=>'D', 'ḋ'=>'d', 'Ḍ'=>'D', 'ḍ'=>'d',
            'Ḏ'=>'D', 'ḏ'=>'d', 'Ḑ'=>'D', 'ḑ'=>'d', 'Ḓ'=>'D', 'ḓ'=>'d',
            'Ḕ'=>'E', 'ḕ'=>'e', 'Ḗ'=>'E', 'ḗ'=>'e', 'Ḙ'=>'E', 'ḙ'=>'e',
            'Ḛ'=>'E', 'ḛ'=>'e', 'Ḝ'=>'E', 'ḝ'=>'e', 'Ḟ'=>'F', 'ḟ'=>'f',
            'Ḡ'=>'G', 'ḡ'=>'g', 'Ḣ'=>'H', 'ḣ'=>'h', 'Ḥ'=>'H', 'ḥ'=>'h',
            'Ḧ'=>'H', 'ḧ'=>'h', 'Ḩ'=>'H', 'ḩ'=>'h', 'Ḫ'=>'H', 'ḫ'=>'h',
            'Ḭ'=>'I', 'ḭ'=>'i', 'Ḯ'=>'I', 'ḯ'=>'i', 'Ḱ'=>'K', 'ḱ'=>'k',
            'Ḳ'=>'K', 'ḳ'=>'k', 'Ḵ'=>'K', 'ḵ'=>'k', 'Ḷ'=>'L', 'ḷ'=>'l',
            'Ḹ'=>'L', 'ḹ'=>'l', 'Ḻ'=>'L', 'ḻ'=>'l', 'Ḽ'=>'L', 'ḽ'=>'l',
            'Ḿ'=>'M', 'ḿ'=>'m', 'Ṁ'=>'M', 'ṁ'=>'m', 'Ṃ'=>'M', 'ṃ'=>'m',
            'Ṅ'=>'N', 'ṅ'=>'n', 'Ṇ'=>'N', 'ṇ'=>'n', 'Ṉ'=>'N', 'ṉ'=>'n',
            'Ṋ'=>'N', 'ṋ'=>'n', 'Ṍ'=>'O', 'ṍ'=>'o', 'Ṏ'=>'O', 'ṏ'=>'o',
            'Ṑ'=>'O', 'ṑ'=>'o', 'Ṓ'=>'O', 'ṓ'=>'o', 'Ṕ'=>'P', 'ṕ'=>'p',
            'Ṗ'=>'P', 'ṗ'=>'p', 'Ṙ'=>'R', 'ṙ'=>'r', 'Ṛ'=>'R', 'ṛ'=>'r',
            'Ṝ'=>'R', 'ṝ'=>'r', 'Ṟ'=>'R', 'ṟ'=>'r', 'Ṡ'=>'S', 'ṡ'=>'s',
            'Ṣ'=>'S', 'ṣ'=>'s', 'Ṥ'=>'S', 'ṥ'=>'s', 'Ṧ'=>'S', 'ṧ'=>'s',
            'Ṩ'=>'S', 'ṩ'=>'s', 'Ṫ'=>'T', 'ṫ'=>'t', 'Ṭ'=>'T', 'ṭ'=>'t',
            'Ṯ'=>'T', 'ṯ'=>'t', 'Ṱ'=>'T', 'ṱ'=>'t', 'Ṳ'=>'U', 'ṳ'=>'u',
            'Ṵ'=>'U', 'ṵ'=>'u', 'Ṷ'=>'U', 'ṷ'=>'u', 'Ṹ'=>'U', 'ṹ'=>'u',
            'Ṻ'=>'U', 'ṻ'=>'u', 'Ṽ'=>'V', 'ṽ'=>'v', 'Ṿ'=>'V', 'ṿ'=>'v',
            'Ẁ'=>'W', 'ẁ'=>'w', 'Ẃ'=>'W', 'ẃ'=>'w', 'Ẅ'=>'W', 'ẅ'=>'w',
            'Ẇ'=>'W', 'ẇ'=>'w', 'Ẉ'=>'W', 'ẉ'=>'w', 'Ẋ'=>'X', 'ẋ'=>'x',
            'Ẍ'=>'X', 'ẍ'=>'x', 'Ẏ'=>'Y', 'ẏ'=>'y', 'Ẑ'=>'Z', 'ẑ'=>'z',
            'Ẓ'=>'Z', 'ẓ'=>'z', 'Ẕ'=>'Z', 'ẕ'=>'z', 'ẖ'=>'h', 'ẗ'=>'t',
            'ẘ'=>'w', 'ẙ'=>'y', 'Ạ'=>'A', 'ạ'=>'a', 'Ả'=>'A', 'ả'=>'a',
            'Ấ'=>'A', 'ấ'=>'a', 'Ầ'=>'A', 'ầ'=>'a', 'Ẩ'=>'A', 'ẩ'=>'a',
            'Ẫ'=>'A', 'ẫ'=>'a', 'Ậ'=>'A', 'ậ'=>'a', 'Ắ'=>'A', 'ắ'=>'a',
            'Ằ'=>'A', 'ằ'=>'a', 'Ẳ'=>'A', 'ẳ'=>'a', 'Ẵ'=>'A', 'ẵ'=>'a',
            'Ặ'=>'A', 'ặ'=>'a', 'Ẹ'=>'E', 'ẹ'=>'e', 'Ẻ'=>'E', 'ẻ'=>'e',
            'Ẽ'=>'E', 'ẽ'=>'e', 'Ế'=>'E', 'ế'=>'e', 'Ề'=>'E', 'ề'=>'e',
            'Ể'=>'E', 'ể'=>'e', 'Ễ'=>'E', 'ễ'=>'e', 'Ệ'=>'E', 'ệ'=>'e',
            'Ỉ'=>'I', 'ỉ'=>'i', 'Ị'=>'I', 'ị'=>'i', 'Ọ'=>'O', 'ọ'=>'o',
            'Ỏ'=>'O', 'ỏ'=>'o', 'Ố'=>'O', 'ố'=>'o', 'Ồ'=>'O', 'ồ'=>'o',
            'Ổ'=>'O', 'ổ'=>'o', 'Ỗ'=>'O', 'ỗ'=>'o', 'Ộ'=>'O', 'ộ'=>'o',
            'Ớ'=>'O', 'ớ'=>'o', 'Ờ'=>'O', 'ờ'=>'o', 'Ở'=>'O', 'ở'=>'o',
            'Ỡ'=>'O', 'ỡ'=>'o', 'Ợ'=>'O', 'ợ'=>'o', 'Ụ'=>'U', 'ụ'=>'u',
            'Ủ'=>'U', 'ủ'=>'u', 'Ứ'=>'U', 'ứ'=>'u', 'Ừ'=>'U', 'ừ'=>'u',
            'Ử'=>'U', 'ử'=>'u', 'Ữ'=>'U', 'ữ'=>'u', 'Ự'=>'U', 'ự'=>'u',
            'Ỳ'=>'Y', 'ỳ'=>'y', 'Ỵ'=>'Y', 'ỵ'=>'y', 'Ỷ'=>'Y', 'ỷ'=>'y',
            'Ỹ'=>'Y', 'ỹ'=>'y',
        ];
    }
    $folded = strtr($value, $map);
    // Accents « décomposés » (lettre + signe combinant), fréquents sur macOS.
    $stripped = preg_replace('/\p{Mn}+/u', '', $folded);
    return $stripped ?? $folded;
}

/**
 * Clé de recherche : minuscules, sans accents, tirets et ponctuation remplacés par des espaces.
 * « Jean-Baptiste » → « jean baptiste », « KÉVIN » → « kevin », « Œuvray » → « oeuvray ».
 */
function search_fold(?string $value): string
{
    static $cache = [];
    $value = (string) $value;
    if ($value === '') { return ''; }
    if (isset($cache[$value])) { return $cache[$value]; }
    if (count($cache) > 50000) { $cache = []; }
    return $cache[$value] = trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower(ascii_fold($value))));
}

/** Fonction SQL lc_fold(x) = search_fold(x), branchée sur chaque connexion (db()). */
function register_search_fold(PDO $pdo): void
{
    $pdo->sqliteCreateFunction('lc_fold', static fn($v): string => search_fold($v === null ? '' : (string) $v), 1, defined('PDO::SQLITE_DETERMINISTIC') ? PDO::SQLITE_DETERMINISTIC : 0);
}

/**
 * Condition SQL « $expr contient le mot cherché », sans tenir compte des accents, de la casse ni des tirets.
 * $raw : paramètre lié à « %mot tapé% » ; $fold : « %search_fold(mot)% » ; $loose : search_loose_like(search_fold(mot)).
 * Rapide sur une grande base : les comparaisons simples (LIKE, en C) passent d'abord ; la fonction PHP lc_fold()
 * ne sert que pour les noms qui ont un accent, un tiret ou une apostrophe ET qui ressemblent déjà au mot cherché.
 */
function fold_like_sql(string $expr, string $raw, string $fold, string $loose): string
{
    return "({$expr} LIKE {$raw} COLLATE NOCASE OR {$expr} LIKE {$fold} COLLATE NOCASE OR ({$expr} GLOB '*[^ -&(-,.-~]*' AND {$expr} LIKE {$loose} AND lc_fold({$expr}) LIKE {$fold}))";
}

/**
 * Motif LIKE large pour un mot replié : les lettres qui peuvent porter un accent deviennent « _ » (une lettre,
 * accentuée ou non), les espaces et « oe »/« ae » (œ, æ) « % ». « helene » → « %h_l_n_% » trouve « Hélène ».
 */
function search_loose_like(string $folded): string
{
    $p = str_replace(['oe', 'ae', 'ss'], ' ', $folded);
    $p = (string) preg_replace('/[aeiouycn]/', '_', $p);
    $p = (string) preg_replace('/\s+/', '%', trim($p));
    return '%' . $p . '%';
}

/** Les trois valeurs à lier pour fold_like_sql() : [brut, replié, large]. */
function fold_like_params(string $word): array
{
    $word = trim($word, '%');
    $fold = search_fold($word);
    if ($fold === '') { $fold = mb_strtolower($word); }
    return ['%' . $word . '%', '%' . $fold . '%', search_loose_like($fold)];
}

/** Expression SQL pour trier sans tenir compte des accents (« Élise » avec les E, « Œuvray » avec les O). */
function fold_sort_sql(string $expr): string
{
    return "(CASE WHEN {$expr} GLOB '*[^ -&(-,.-~]*' THEN lc_fold({$expr}) ELSE lower(trim({$expr})) END)";
}

/** Paramètres « ? » de fold_like_sql($expr, '?', '?', '?'), dans l'ordre où ils apparaissent. */
function fold_like_args(string $word): array
{
    [$raw, $fold, $loose] = fold_like_params($word);
    return [$raw, $fold, $loose, $fold];
}
