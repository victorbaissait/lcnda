<?php
declare(strict_types=1);

/**
 * 🔎 « Poser une question en français » : mariage et enfants (avec lib/heritage_links.php, question_to_criteria).
 *  - marié(e)s / qui se sont marié(e)s / ayant été mariées ; jamais mariées, pas mariées, célibataires ;
 *  - âge au (premier) mariage : « mariées après l'âge de 20 ans », « avant 18 ans », « entre 20 et 30 ans », « à plus de 40 ans » ;
 *  - remariées, mariées plusieurs fois, « au moins deux mariages » ;
 *  - nombre d'enfants : « ayant eu au moins deux enfants », « avec plus de 5 enfants », « sans enfant », « avec exactement 3 enfants »,
 *    « qui ont eu des enfants » (chiffres ou lettres, un à vingt).
 * Le mariage = un événement MARR d'une famille de la personne ; l'âge = année du premier mariage − année de naissance
 * (les deux connues, sinon la fiche n'est pas comptée pour ce critère) ; les enfants = ceux de ses familles (family_children).
 * Les critères vont dans la recherche (saved_search_criteria) : « Enregistrer comme recherche » les garde.
 */

const QF_NUMBERS = ['zero' => 0, 'un' => 1, 'une' => 1, 'deux' => 2, 'trois' => 3, 'quatre' => 4, 'cinq' => 5, 'six' => 6, 'sept' => 7, 'huit' => 8, 'neuf' => 9, 'dix' => 10, 'onze' => 11, 'douze' => 12,
    'treize' => 13, 'quatorze' => 14, 'quinze' => 15, 'seize' => 16, 'dix sept' => 17, 'dix huit' => 18, 'dix neuf' => 19, 'vingt' => 20, 'vingt cinq' => 25, 'trente' => 30, 'trente cinq' => 35,
    'quarante' => 40, 'quarante cinq' => 45, 'cinquante' => 50, 'soixante' => 60];
const QF_FAMILY_KEYS = ['married', 'marr_age_min', 'marr_age_max', 'marriages_min', 'children_min', 'children_max'];

/** « 3 », « trois », « dix huit » → 3, 18 ; null sinon */
function qf_num(string $s): ?int
{
    $s = trim(preg_replace('/\s+/', ' ', $s));
    if (preg_match('/^\d{1,3}$/', $s)) { return (int) $s; }
    return QF_NUMBERS[$s] ?? null;
}
/** l'expression régulière d'un nombre (les mots les plus longs d'abord : « dix huit » avant « dix ») */
function qf_num_re(): string
{
    static $re = null;
    if ($re === null) { $w = array_keys(QF_NUMBERS); usort($w, static fn($a, $b) => strlen($b) <=> strlen($a)); $re = '(?:\d{1,3}|' . implode('|', $w) . ')'; }
    return $re;
}

/**
 * La question sans accents ni majuscules, apostrophes et traits d'union changés en espaces, et pour chaque octet de ce texte
 * l'endroit de la question d'origine (pour effacer ce qui a été compris). « Marie » avec une majuscule (un prénom) reste à part.
 */
function qf_fold_map(string $q): array
{
    $t = ''; $map = [];
    foreach (preg_split('//u', $q, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_OFFSET_CAPTURE) as [$ch, $off]) {
        $f = in_array($ch, ['’', "'", '-', '‘'], true) ? ' ' : strtolower(ascii_fold($ch));
        for ($i = 0, $l = strlen($f); $i < $l; $i++) { $map[strlen($t) + $i] = [$off, strlen($ch)]; }
        $t .= $f;
    }
    // le prénom « Marie » (majuscule, mot seul) n'est pas « mariée » sans accent
    if (preg_match_all('/(?<!\p{L})Marie(?!\p{L})/u', $q, $mm, PREG_OFFSET_CAPTURE)) {
        foreach ($mm[0] as [, $off]) { foreach ($map as $tb => [$qo]) { if ($qo === $off) { $t = substr_replace($t, 'MARIE', $tb, 5); break; } } }
    }
    // un prénom donné (« prénommées marie », « qui s'appelle marie ») non plus
    $t = (string) preg_replace_callback('/\b(prenomm\w*|appel\w*|nomm\w*)( +)([a-z]+)/', static fn($m) => $m[1] . $m[2] . strtoupper($m[3]), $t);
    return [$t, $map];
}

/** « après 20 ans », « avant l'âge de 18 ans », « entre 20 et 30 ans », « à plus de 40 ans », « à 25 ans » → [min, max] (inclus) ou null */
function qf_age_range(string $s): ?array
{
    $n = qf_num_re();
    $s = trim(preg_replace('/\s+/', ' ', $s));
    if (preg_match("/^entre ($n) (?:ans )?et ($n) ans$/", $s, $m)) { $a = qf_num($m[1]); $b = qf_num($m[2]); return $a !== null && $b !== null ? [min($a, $b), max($a, $b)] : null; }
    if (!preg_match("/($n) ans$/", $s, $m) || ($v = qf_num($m[1])) === null) { return null; }
    if (preg_match('/^(?:apres|passe|a plus de|plus de|au dela de|a partir de)\b/', $s)) { return preg_match('/^a partir de/', $s) ? [$v, null] : [$v + 1, null]; }
    if (preg_match('/^(?:a )?au moins\b/', $s)) { return [$v, null]; }
    if (preg_match('/^(?:avant|en dessous de|a moins de|moins de)\b/', $s)) { return [null, max(0, $v - 1)]; }
    if (preg_match('/^(?:a )?(?:au plus|pas plus de)\b/', $s)) { return [null, $v]; }
    return [$v, $v]; // « à 25 ans », « à l'âge de 25 ans »
}

/** « au moins deux », « plus de 5 », « exactement 3 », « 3 », « des », « entre 2 et 4 » (devant « enfants ») → [min, max] ou null */
function qf_count_range(string $s): ?array
{
    $n = qf_num_re();
    $s = trim(preg_replace('/\s+/', ' ', $s));
    if (preg_match("/^entre ($n) et ($n)$/", $s, $m)) { $a = qf_num($m[1]); $b = qf_num($m[2]); return $a !== null && $b !== null ? [min($a, $b), max($a, $b)] : null; }
    if (in_array($s, ['des', 'un ou plusieurs', 'au moins un', 'au moins une', 'd', 'de'], true)) { return [1, null]; }
    if ($s === 'plusieurs') { return [2, null]; }
    if (!preg_match("/($n)$/", $s, $m) || ($v = qf_num($m[1])) === null) { return null; }
    if (preg_match('/^au moins\b/', $s)) { return [$v, null]; }
    if (preg_match('/^plus de\b/', $s)) { return [$v + 1, null]; }
    if (preg_match('/^moins de\b/', $s)) { return [null, max(0, $v - 1)]; }
    if (preg_match('/^(?:au plus|pas plus de)\b/', $s)) { return [null, $v]; }
    return [$v, $v]; // « exactement 3 », « 3 »
}

/**
 * Cherche dans la question ce qui parle de mariage et d'enfants, et l'efface de la question (le reste est lu comme avant :
 * sexe, années, lieu, métier, noms). Rend ['q' => la question sans ces mots, 'crit' => critères, 'mention' => « mariées » dit
 * sans plus de précision, 'young' => « mariées jeunes »] ; crit vide si rien n'a été trouvé.
 */
function qf_extract(string $q, bool $bare = true): array
{
    [$t, $map] = qf_fold_map($q);
    $crit = []; $mention = false; $young = false; $spans = [];
    $n = qf_num_re();
    $M = '(?:re)?marie(?:e|s|es)?\b';
    $verb = '(?:qui )?(?:se sont |s est |s etaient |s etait |s etant |ont ete |a ete |ayant ete |avoir ete |etant |etaient |etait |sont |est |furent |fut )?';
    $take = static function (string $re, callable $fn) use (&$t, &$spans) {
        $re = '/(?<![a-z0-9])' . str_replace(' ', ' +', $re) . '/';
        while (preg_match($re, $t, $m, PREG_OFFSET_CAPTURE)) {
            if ($fn($m) === false) { break; }
            $spans[] = [$m[0][1], $m[0][1] + strlen($m[0][0])];
            $t = substr_replace($t, str_repeat(' ', strlen($m[0][0])), $m[0][1], strlen($m[0][0]));
        }
    };
    // jamais mariées, pas mariées, célibataires, sans s'être mariées
    $no = static function () use (&$crit) { $crit['married'] = 'no'; };
    $take("(?:qui )?(?:ne (?:se )?(?:sont|s est|s etaient|s etait|est|sont|furent) |n ont |n a |n ayant |n etant |n avaient |n avait |n eurent )?(?:jamais|pas|non) (?:ete |eu |)$M( jamais)?", $no);
    $take('(?:qui )?(?:sont |est |etaient |etait |restee?s? |reste |restes )?celibataires?\b', $no);
    $take("sans (?:s etre |avoir ete |etre |)(?:$M|mariage\b|conjoint\b)", $no);
    // remariées, mariées plusieurs fois / deux fois, au moins deux mariages
    $take("{$verb}(?:re)?marie(?:e|s|es)? (plusieurs|au moins $n|plus de $n|$n) fois\b", static function ($m) use (&$crit) {
        $s = trim(preg_replace('/\s+/', ' ', $m[1][0])); $v = $s === 'plusieurs' ? 2 : qf_num((string) preg_replace('/^(au moins|plus de) /', '', $s));
        if ($v === null) { return false; } if (str_starts_with($s, 'plus de')) { $v++; }
        $crit['marriages_min'] = max(2, $v);
    });
    $take("{$verb}remarie(?:e|s|es)?\b", static function () use (&$crit) { $crit['marriages_min'] = max(2, $crit['marriages_min'] ?? 0); });
    $take("(?:(?:qui )?(?:ont |a |ayant |avec )?(?:eu |eux |eus |eut )?)(au moins $n|plus de $n|plusieurs|$n) mariages\b", static function ($m) use (&$crit) {
        $s = trim(preg_replace('/\s+/', ' ', $m[1][0])); $v = $s === 'plusieurs' ? 2 : qf_num((string) preg_replace('/^(au moins|plus de) /', '', $s));
        if ($v === null || $v < 2 && !str_starts_with($s, 'plus de')) { return false; } if (str_starts_with($s, 'plus de')) { $v++; }
        $crit['marriages_min'] = max(2, $v);
    });
    // âge au mariage : « qui se sont mariées après l'âge de 20 ans », « mariés avant 18 ans », « mariées entre 20 et 30 ans »
    $age = "(?:(?:apres|passe|avant|en dessous de|a partir de) (?:l age de |l age des |)$n ans|(?:a )?(?:plus de|au dela de|au moins|moins de|au plus|pas plus de) $n ans|entre $n (?:ans )?et $n ans|(?:a l age de|a) $n ans)";
    $take("{$verb}$M (?:pour la premiere fois |la premiere fois |)($age)", static function ($m) use (&$crit, &$mention) {
        $r = qf_age_range($m[1][0]); if (!$r) { return false; }
        if ($r[0] !== null) { $crit['marr_age_min'] = $r[0]; } if ($r[1] !== null) { $crit['marr_age_max'] = $r[1]; }
        $mention = true;
    });
    // « mariées », « qui se sont marié(e)s », « ayant été mariées » (et « mariées jeunes », trop vague pour un âge)
    if ($bare) $take("{$verb}$M( jeunes?\b)?", static function ($m) use (&$mention, &$young) { $mention = true; if (!empty($m[1][0]) && trim($m[1][0]) !== '') { $young = true; } });
    // enfants : « sans enfant », « n'ont pas eu d'enfants », « aucun enfant »
    $none = static function () use (&$crit) { $crit['children_min'] = null; $crit['children_max'] = 0; };
    $take('sans (?:aucun |avoir eu d |avoir eu |avoir d |)(?:enfants?|descendance|posterite)\b', $none);
    $take('(?:qui )?(?:n ont |n a |n ayant |n avaient |n avait |n eurent )(?:jamais |pas |)(?:eu |eux |)(?:d |de |aucun |)enfants?\b', $none);
    $take('(?:qui )?(?:ont |a |ayant |avaient |avec )?(?:eu |eux |)aucun enfant\b', $none);
    // enfants : « ayant eu au moins deux enfants », « avec plus de 5 enfants », « qui ont eu des enfants », « avec exactement 3 enfants »
    $set = static function ($m) use (&$crit) {
        $r = qf_count_range($m[1][0]); if (!$r) { return false; }
        $crit['children_min'] = $r[0]; $crit['children_max'] = $r[1];
    };
    $qty = "(?:au moins $n|plus de $n|moins de $n|au plus $n|pas plus de $n|exactement $n|entre $n et $n)";
    $take("(?:(?:qui )?(?:ont |a |avaient |avait |eurent |ayant |avec )?(?:eu |eux |eus |eut )?)($qty)(?: seul| seule)? enfants?\b", $set);
    $take("(?:qui (?:ont|a|avaient|avait|eurent) (?:eu |eux |eus |eut |)|ayant (?:eu |eux |eus |eut |)|avec )(des|un ou plusieurs|plusieurs|d|$n)(?: seul| seule)? enfants?\b", $set);
    // ce qui a été compris est effacé de la question d'origine (mêmes octets : le reste ne bouge pas)
    foreach ($spans as [$a, $b]) {
        if (!isset($map[$a], $map[$b - 1])) { continue; }
        $from = $map[$a][0]; $to = $map[$b - 1][0] + $map[$b - 1][1];
        $q = substr_replace($q, str_repeat(' ', $to - $from), $from, $to - $from);
    }
    if (($crit['married'] ?? '') === 'no') { unset($crit['marr_age_min'], $crit['marr_age_max'], $crit['marriages_min']); $mention = false; }
    return ['q' => trim(preg_replace('/\s+/u', ' ', $q)), 'crit' => $crit, 'mention' => $mention, 'young' => $young];
}

/** les critères « mariage et enfants » d'une recherche, nettoyés (entiers ou null ; married : yes, no ou vide) */
function qf_criteria(array $c): array
{
    $int = static fn($v, int $max) => $v !== null && $v !== '' && is_numeric($v) && (int) $v >= 0 && (int) $v <= $max ? (int) $v : null;
    return ['married' => in_array($c['married'] ?? '', ['yes', 'no'], true) ? $c['married'] : '',
        'marr_age_min' => $int($c['marr_age_min'] ?? null, 120), 'marr_age_max' => $int($c['marr_age_max'] ?? null, 120),
        'marriages_min' => $int($c['marriages_min'] ?? null, 20), 'children_min' => $int($c['children_min'] ?? null, 60), 'children_max' => $int($c['children_max'] ?? null, 60)];
}
function qf_has(array $c): bool { foreach (QF_FAMILY_KEYS as $k) { if (($c[$k] ?? null) !== null && ($c[$k] ?? '') !== '') { return true; } } return false; }

/** année du premier mariage (MARR daté d'une famille de la personne) et année de naissance, en SQL (p = la personne) */
const QF_MARR_YEAR_SQL = "(SELECT min(me.year) FROM families mf JOIN events me ON me.family_id=mf.id JOIN event_types mt ON mt.id=me.event_type_id WHERE (mf.partner1_id=p.id OR mf.partner2_id=p.id) AND mt.gedcom_tag='MARR' AND me.year IS NOT NULL)";
const QF_BIRTH_YEAR_SQL = "(SELECT min(be.year) FROM events be JOIN event_types bt ON bt.id=be.event_type_id WHERE be.person_id=p.id AND bt.gedcom_tag IN ('BIRT','CHR','BAPM') AND be.year IS NOT NULL)";
const QF_MARRIED_SQL = "EXISTS(SELECT 1 FROM families mf JOIN events me ON me.family_id=mf.id JOIN event_types mt ON mt.id=me.event_type_id WHERE (mf.partner1_id=p.id OR mf.partner2_id=p.id) AND mt.gedcom_tag='MARR')";

/** les conditions SQL (sur p, la personne) des critères mariage et enfants : [conditions, paramètres] (les nombres sont écrits dans
 *  la requête, des entiers déjà vérifiés : un paramètre « ? » arrive en texte et SQLite ne le compare pas comme un nombre) */
function qf_where(array $c): array
{
    $c = qf_criteria($c); $w = []; $p = [];
    $ageMin = $c['marr_age_min']; $ageMax = $c['marr_age_max'];
    if ($c['married'] === 'no') { $w[] = 'NOT ' . QF_MARRIED_SQL; }
    elseif ($c['married'] === 'yes' && $ageMin === null && $ageMax === null && $c['marriages_min'] === null) { $w[] = QF_MARRIED_SQL; }
    if ($c['marriages_min'] !== null) {
        $w[] = "(SELECT count(DISTINCT mf.id) FROM families mf JOIN events me ON me.family_id=mf.id JOIN event_types mt ON mt.id=me.event_type_id WHERE (mf.partner1_id=p.id OR mf.partner2_id=p.id) AND mt.gedcom_tag='MARR') >= " . (int) $c['marriages_min'];
    }
    if ($ageMin !== null || $ageMax !== null) {
        $age = '(' . QF_MARR_YEAR_SQL . ' - ' . QF_BIRTH_YEAR_SQL . ')';
        $w[] = QF_MARR_YEAR_SQL . ' IS NOT NULL AND ' . QF_BIRTH_YEAR_SQL . ' IS NOT NULL';
        if ($ageMin !== null) { $w[] = "{$age} >= " . (int) $ageMin; }
        if ($ageMax !== null) { $w[] = "{$age} <= " . (int) $ageMax; }
    }
    if ($c['children_min'] !== null || $c['children_max'] !== null) {
        $kids = '(SELECT count(DISTINCT kc.child_id) FROM family_children kc JOIN families kf ON kf.id=kc.family_id WHERE kf.partner1_id=p.id OR kf.partner2_id=p.id)';
        if ($c['children_min'] !== null) { $w[] = "{$kids} >= " . (int) $c['children_min']; }
        if ($c['children_max'] !== null) { $w[] = "{$kids} <= " . (int) $c['children_max']; }
    }
    return [$w, $p];
}

/** les fiches qui répondent aux critères mariage et enfants (id => true), pour les questions qui calculent (lib/question_more.php) */
function qf_ids(PDO $pdo, array $c): array
{
    [$w] = qf_where($c);
    if (!$w) { return []; }
    return array_fill_keys(array_map('intval', $pdo->query('SELECT p.id FROM persons p WHERE ' . implode(' AND ', $w))->fetchAll(PDO::FETCH_COLUMN)), true);
}

/** parmi ces fiches, celles qui sont mariées mais dont l'âge au mariage ne peut pas être calculé (année de naissance ou de mariage inconnue) */
function qf_age_unknown(PDO $pdo, array $ids): int
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return 0; }
    $n = 0;
    foreach (array_chunk($ids, 500) as $chunk) {
        $n += (int) $pdo->query('SELECT count(*) FROM persons p WHERE p.id IN (' . implode(',', $chunk) . ') AND ' . QF_MARRIED_SQL . ' AND (' . QF_MARR_YEAR_SQL . ' IS NULL OR ' . QF_BIRTH_YEAR_SQL . ' IS NULL)')->fetchColumn();
    }
    return $n;
}

/** ce qui a été compris, en mots (« J'ai compris : », description d'une recherche enregistrée) ; accordé au féminin pour les femmes */
function qf_labels(array $c, string $gender = ''): array
{
    $c = qf_criteria($c); $f = $gender === 'female'; $out = [];
    $a = $c['marr_age_min']; $b = $c['marr_age_max'];
    if ($c['married'] === 'no') { $out[] = $f ? i18n_t('jamais mariées') : i18n_t('jamais mariés'); }
    elseif ($a !== null && $b !== null && $a === $b) { $out[] = $f ? i18n_t('mariées à {n} ans', ['n' => $a]) : i18n_t('mariés à {n} ans', ['n' => $a]); }
    elseif ($a !== null && $b !== null) { $out[] = $f ? i18n_t('mariées entre {a} et {b} ans', ['a' => $a, 'b' => $b]) : i18n_t('mariés entre {a} et {b} ans', ['a' => $a, 'b' => $b]); }
    elseif ($a !== null) { $out[] = $f ? i18n_t('mariées après {n} ans', ['n' => $a - 1]) : i18n_t('mariés après {n} ans', ['n' => $a - 1]); }
    elseif ($b !== null) { $out[] = $f ? i18n_t('mariées avant {n} ans', ['n' => $b + 1]) : i18n_t('mariés avant {n} ans', ['n' => $b + 1]); }
    elseif ($c['married'] === 'yes' && $c['marriages_min'] === null) { $out[] = $f ? i18n_t('mariées') : i18n_t('mariés'); }
    if ($c['married'] !== 'no' && $c['marriages_min'] !== null) { $out[] = i18n_t('au moins {n} mariages', ['n' => $c['marriages_min']]); }
    $x = $c['children_min']; $y = $c['children_max'];
    if ($y === 0) { $out[] = i18n_t('sans enfant'); }
    elseif ($x !== null && $y !== null && $x === $y) { $out[] = $x === 1 ? i18n_t('exactement 1 enfant') : i18n_t('exactement {n} enfants', ['n' => $x]); }
    elseif ($x !== null && $y !== null) { $out[] = i18n_t('entre {a} et {b} enfants', ['a' => $x, 'b' => $y]); }
    elseif ($x !== null) { $out[] = $x <= 1 ? i18n_t('avec des enfants') : i18n_t('au moins {n} enfants', ['n' => $x]); }
    elseif ($y !== null) { $out[] = $y === 1 ? i18n_t('au plus 1 enfant') : i18n_t('au plus {n} enfants', ['n' => $y]); }
    return $out;
}

/** « nées avant 1800 », « nés entre 1700 et 1750 » : la naissance et ses années en un seul morceau ([sorte, valeurs] du morceau des années) */
function qf_birth_label(array $year, string $gender): string
{
    $f = $gender === 'female';
    [$kind, $v] = $year;
    return match ($kind) {
        'between' => $f ? i18n_t('nées entre {a} et {b}', ['a' => $v[0], 'b' => $v[1]]) : i18n_t('nés entre {a} et {b}', ['a' => $v[0], 'b' => $v[1]]),
        'before' => $f ? i18n_t('nées avant {y}', ['y' => $v[0]]) : i18n_t('nés avant {y}', ['y' => $v[0]]),
        'after' => $f ? i18n_t('nées après {y}', ['y' => $v[0]]) : i18n_t('nés après {y}', ['y' => $v[0]]),
        'in' => $f ? i18n_t('nées en {y}', ['y' => $v[0]]) : i18n_t('nés en {y}', ['y' => $v[0]]),
        default => $f ? i18n_t('nées au {n}e siècle', ['n' => $v[0]]) : i18n_t('nés au {n}e siècle', ['n' => $v[0]]),
    };
}
