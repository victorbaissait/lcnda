<?php
declare(strict_types=1);

/**
 * 🔎 « Poser une question en français », suite (avec lib/heritage_links.php, lib/question_more.php, lib/question_famille.php).
 * Rien ici ne change une réponse déjà juste : chaque règle ne joue que sur ce que les règles d'avant ne lisaient pas, ou lisaient de travers.
 *
 *  1. Avant l'analyse, la question est récrite (qp_rewrite) ; chaque réécriture est dite dans « J'ai compris » :
 *     - fautes de frappe sur les mots-clés (« enfans », « boulangés ») : distance d'édition 1, sur un vocabulaire fermé ;
 *     - dates que les règles ne lisent pas : « vers 1850 » (marge de Réglages → 🔎 Recherche), « années 1850 », « de 1850 à 1860 », « les morts de 1916 » ;
 *     - lieux en minuscules ou abrégés (« à lille », « à St Pierre des Corps ») → écrits comme dans la base ; noms de famille en minuscules ;
 *     - « moi / mes / ma / mon » : la personne de départ (« ma grand-mère paternelle », « mes cousins germains », « mon lien avec X »).
 *  2. Réponses directes (qp_direct) : « qui est X ? » (résumé + lien vers la fiche), « mort à la guerre » / « pendant la guerre de 14 »
 *     (champ « Mort pour la France » et dates), et les renvois vers les outils existants : « Que manque-t-il ? », « Où chercher ? »,
 *     dossiers ⚖️ (héritiers, retards, sans réponse, pièces, introuvables — jamais en mode consultation), Contrôle de la base (doublons).
 *  3. Négations (qp_negations) : « sans date de décès », « qui ne sont pas nées à Lille », « qui ne sont pas des ancêtres »,
 *     « sans parents », « sans source », « sans profession » → critères de recherche (qp_criteria / qp_where : enregistrables).
 *  4. OU / ET entre deux lieux, deux métiers ou deux années (qp_or_variants) : une recherche par terme, réunies.
 *  5. Second essai (qp_second) : rien n'a été compris → le moteur de la recherche « à la française » (rfr_person_ids) sur les mots
 *     qui restent, une fois retirés les mots de la question (« les Le Gall », « Durand »).
 *  6. Garde-fou (qp_ignored) : « Je n'ai pas tenu compte de : … » quand un mot qui compte n'a pas été lu.
 */

/* ═════════ Vocabulaire fermé (mots-clés des questions, sans accents) ═════════ */

const QP_VOCAB_BASE = ['enfant', 'enfants', 'frere', 'freres', 'soeur', 'soeurs', 'parents', 'cousin', 'cousins', 'cousine', 'cousines', 'oncle', 'oncles', 'tante', 'tantes',
    'neveu', 'neveux', 'niece', 'nieces', 'ancetre', 'ancetres', 'descendant', 'descendants', 'conjoint', 'conjoints', 'epoux', 'epouse', 'epouses', 'parrain', 'parrains',
    'marraine', 'marraines', 'filleul', 'filleuls', 'filleule', 'filleules', 'gendre', 'gendres', 'grands', 'petits', 'petites', 'arriere', 'mariage', 'mariages', 'naissance',
    'naissances', 'baptemes', 'deces', 'decedes', 'decedees', 'maries', 'mariees', 'mortes', 'baptises', 'inhumes', 'habitaient', 'vivaient', 'combien', 'quelles', 'heritiers',
    'paternel', 'paternelle', 'paternels', 'paternelles', 'maternel', 'maternelle', 'maternels', 'maternelles', 'germain', 'germains', 'germaine', 'germaines', 'femmes', 'hommes'];
/** des mots courants à 1 lettre d'un mot-clé : jamais « corrigés » */
const QP_COMMON = ['genre', 'entre', 'ventre', 'mortel', 'marie', 'mairie', 'matin', 'marins', 'pareil', 'parent', 'enfance', 'parente', 'apparente', 'cousu', 'tantot', 'autre', 'autres',
    'personne', 'personnes', 'gens', 'avant', 'apres', 'depuis', 'siecle', 'siecles', 'ayant', 'avaient', 'etaient', 'leurs', 'jamais', 'encore', 'moins', 'toutes', 'filles', 'garcons',
    'quels', 'quelle', 'lesquels', 'meres', 'peres', 'freres', 'mariee', 'marier', 'maris', 'parle', 'ecart', 'centenaires', 'moyenne', 'plus', 'grande', 'grand', 'petit', 'petite',
    'famille', 'familles', 'lieux', 'villes', 'communes', 'metiers', 'prenoms', 'noms', 'mois', 'saisons', 'sources', 'source', 'profession', 'professions', 'doublons', 'dossiers',
    'retard', 'pieces', 'actes', 'chercher', 'manquent', 'manque', 'trouver', 'connus', 'connues', 'connu', 'connue', 'vivants', 'vivantes', 'guerre', 'france', 'pendant', 'combat',
    'mort', 'morts', 'morte', 'decede', 'decedee', 'marie', 'femme', 'homme', 'fille', 'garcon', 'frere', 'soeur', 'pere', 'mere', 'epoux', 'mari', 'oncle', 'tante', 'neveu', 'niece', 'cousin',
    'cousine', 'enfant', 'parent', 'parrain', 'marraine', 'filleul', 'gendre', 'ancetre', 'descendant', 'conjoint', 'naissance', 'mariage', 'bapteme', 'baptise', 'baptisee', 'inhume', 'inhumee',
    'habitait', 'vivait', 'residait', 'demeurait', 'heritier', 'heritiers', 'dossier', 'piece', 'acte', 'courrier', 'courriers', 'reponse', 'repondu', 'meunier', 'meuniers', 'paternels', 'maternels'];

function qp_fold(string $s): string { return strtolower(ascii_fold($s)); }
function qp_words(string $s): array { return preg_split('/[^a-z0-9]+/', qp_fold($s), -1, PREG_SPLIT_NO_EMPTY); }
function qp_key(string $s): string { return implode(' ', qp_words($s)); }

function qp_vocab(PDO $pdo): array
{
    static $v = null;
    if ($v !== null) { return $v; }
    $v = array_fill_keys(QP_VOCAB_BASE, true);
    foreach (QUESTION_OCCUPATIONS as $o) { $v[$o] = true; $v[$o . 's'] = true; }
    return $v;
}

/** les mots des noms, prénoms et lieux de la base (sans accents), pour ne jamais « corriger » un nom */
function qp_name_words(PDO $pdo): array
{
    static $w = null;
    if ($w !== null) { return $w; }
    $w = [];
    foreach (['SELECT DISTINCT first_name FROM persons', 'SELECT DISTINCT last_name FROM persons', 'SELECT DISTINCT name FROM places', 'SELECT DISTINCT county FROM places', 'SELECT DISTINCT state FROM places'] as $sql) {
        try { foreach ($pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN) as $s) { foreach (qp_words((string) $s) as $x) { $w[$x] = true; } } } catch (Throwable $_) {}
    }
    return $w;
}

/** les lieux de la base : clé (mots sans accents) → nom tel qu'écrit (commune d'abord, puis département, région, pays) */
function qp_places(PDO $pdo): array
{
    static $p = null;
    if ($p !== null) { return $p; }
    $p = [];
    foreach (['name', 'county', 'state', 'country'] as $col) {
        try { foreach ($pdo->query("SELECT DISTINCT {$col} FROM places WHERE trim(COALESCE({$col},''))<>''")->fetchAll(PDO::FETCH_COLUMN) as $s) { $k = qp_key((string) $s); if (strlen($k) >= 2) { $p[$k] ??= trim((string) $s); } } } catch (Throwable $_) {}
    }
    return $p;
}

/** les noms de famille de la base : clé → nom tel qu'écrit */
function qp_last_names(PDO $pdo): array
{
    static $l = null;
    if ($l !== null) { return $l; }
    $l = [];
    foreach ($pdo->query("SELECT DISTINCT last_name FROM persons WHERE trim(COALESCE(last_name,''))<>''")->fetchAll(PDO::FETCH_COLUMN) as $s) { $l[qp_key((string) $s)] ??= trim((string) $s); }
    return $l;
}

function qp_root_name(PDO $pdo): array
{
    $root = function_exists('qm_root') ? qm_root($pdo) : 0;
    if (!$root) { return [0, '']; }
    $s = $pdo->prepare("SELECT COALESCE(first_name,''), COALESCE(last_name,'') FROM persons WHERE id=?"); $s->execute([$root]);
    [$f, $l] = $s->fetch(PDO::FETCH_NUM) ?: ['', ''];
    return trim((string) $f) !== '' && trim((string) $l) !== '' ? [$root, trim($f . ' ' . $l)] : [$root, ''];
}

/* ═════════ 1. Réécritures ═════════ */

/**
 * La question récrite pour les règles existantes : ['q', 'notes' (à mettre en tête de « J'ai compris »), 'person' (fiche choisie), 'replace' (étiquettes à remplacer)].
 */
function qp_rewrite(PDO $pdo, string $q): array
{
    $notes = []; $person = 0; $replace = []; $chain = null;
    // ── fautes de frappe sur les mots-clés
    $vocab = qp_vocab($pdo); $common = array_flip(QP_COMMON); $names = null;
    $q = (string) preg_replace_callback('/(?<![\p{L}\p{M}])[\p{L}\p{M}]{5,}(?![\p{L}\p{M}])/u', static function ($m) use ($pdo, $vocab, $common, &$names, &$notes) {
        $w = $m[0]; $f = qp_fold($w);
        if (isset($vocab[$f]) || isset($common[$f]) || !preg_match('/^[a-z]+$/', $f)) { return $w; }
        $cands = [];
        foreach ($vocab as $v => $_) { if (abs(strlen($v) - strlen($f)) <= 1 && $v[0] === $f[0] && levenshtein($v, $f) === 1) { $cands[] = $v; } }
        if (!$cands) { return $w; }
        $bases = array_unique(array_map('q_base', $cands));
        if (count($bases) > 1) { return $w; }
        $names ??= qp_name_words($pdo);
        if (isset($names[$f])) { return $w; }
        // plusieurs formes du même mot (« boulanger », « boulangers ») : celle qui finit comme le mot tapé
        usort($cands, static fn($a, $b) => (substr($b, -1) === substr($f, -1)) <=> (substr($a, -1) === substr($f, -1)) ?: strlen($b) <=> strlen($a));
        $notes[] = i18n_t('« {a} » lu « {b} »', ['a' => $w, 'b' => $cands[0]]);
        return $cands[0];
    }, $q);

    // ── dates que les règles ne lisent pas (réécrites en « entre … et … » ou « en … », lues partout de la même façon)
    $vers = function_exists('rfr_settings') ? (int) (rfr_settings($pdo)['vers'] ?? 5) : 5;
    $q = (string) preg_replace_callback('/(?<![\p{L}])vers\s+(?:l[\'’]an\s+)?(\d{3,4})(?!\d)/iu', static function ($m) use ($vers, &$replace) {
        $y = (int) $m[1]; $a = $y - $vers; $b = $y + $vers;
        $replace["entre {$a} et {$b}"] = i18n_t('vers {y} ({a}-{b})', ['y' => $y, 'a' => $a, 'b' => $b]);
        return "entre {$a} et {$b}";
    }, $q);
    $q = (string) preg_replace_callback('/(?<![\p{L}])(?:(?:dans|pendant|durant)\s+)?(?:les\s+)?ann[ée]es\s+(\d{3})0(?!\d)/iu', static function ($m) use (&$replace) {
        $a = (int) ($m[1] . '0'); $b = $a + 9;
        $replace["entre {$a} et {$b}"] = i18n_t('dans les années {y} ({a}-{b})', ['y' => $a, 'a' => $a, 'b' => $b]);
        return "entre {$a} et {$b}";
    }, $q);
    $q = (string) preg_replace('/(?<![\p{L}])de\s+(\d{4})\s+[àa]\s+(\d{4})(?!\d)/iu', 'entre $1 et $2', $q);
    $q = (string) preg_replace('/(?<![\p{L}])(n[ée]e?s?|morte?s?|d[ée]c[ée]d[ée]e?s?|mari[ée]e?s?|naissances?|d[ée]c[èe]s|mariages?|baptis[ée]e?s?|baptêmes?|inhum[ée]e?s?)\s+de\s+(\d{4})(?!\d)/iu', '$1 en $2', $q);

    // ── lieux en minuscules ou abrégés (« à lille », « à St Pierre des Corps ») : écrits comme dans la base
    $places = qp_places($pdo);
    $q = (string) preg_replace_callback('/(?<![\p{L}])(à|a|en|au|aux|dans\s+l[ea]s?|dans\s+l[\'’]|sur|près\s+de|pres\s+de)\s+([\p{L}][\p{L}\p{M}\'’.-]*(?:\s+[\p{L}][\p{L}\p{M}\'’.-]*){0,5})/u', static function ($m) use ($places) { // « lieu : Lille » est dit par les règles d'après
        $words = preg_split('/\s+/u', $m[2]);
        for ($n = count($words); $n >= 1; $n--) {
            $cand = implode(' ', array_slice($words, 0, $n));
            $variants = function_exists('rfr_place_variants') ? rfr_place_variants($cand) : [qp_key($cand)];
            array_unshift($variants, qp_key($cand));
            foreach ($variants as $v) {
                $k = qp_key((string) $v);
                if (strlen($k) < 2 || !isset($places[$k])) { continue; }
                $db = $places[$k];
                $lower = !preg_match('/^\p{Lu}/u', $cand);
                if (!$lower && mb_strtolower($cand) === mb_strtolower($db)) { return $m[0]; } // déjà écrit comme dans la base
                if (preg_match('/^\d/', $db)) { return $m[0]; }
                return $m[1] . ' ' . $db . mb_substr($m[2], mb_strlen($cand));
            }
        }
        return $m[0];
    }, $q);

    // ── noms de famille en minuscules (« les durand nés à Lille ») : seulement si aucune personne n'est citée
    if (preg_match('/(?<![\p{L}\p{M}\'’-])\p{Ll}[\p{L}\p{M}]{2,}/u', $q)) {
        $last = qp_last_names($pdo); $vocab2 = $vocab + array_flip(QP_COMMON);
        $skip = array_flip(['les', 'des', 'qui', 'que', 'est', 'sont', 'nes', 'nees', 'morts', 'avec', 'dans', 'pour', 'chez', 'entre', 'avant', 'apres', 'tous', 'toutes', 'combien', 'quels', 'quelles', 'mes', 'mon', 'ses', 'leur', 'leurs', 'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre', 'ancetres', 'aieux', 'vivants', 'jean', 'pierre']);
        $prev = '';
        $q = (string) preg_replace_callback('/(?<![\p{L}\p{M}\'’-])([\p{L}][\p{L}\p{M}]*)(?![\p{L}\p{M}\'’-])/u', static function ($m) use ($pdo, $last, $places, $vocab2, $skip, &$prev) { // « nom : Durand » est dit par les règles d'après
            $f = qp_key($m[1]); $before = $prev; $prev = $f;
            if (!preg_match('/^\p{Ll}/u', $m[1]) || mb_strlen($m[1]) < 3) { return $m[1]; }
            if (!isset($last[$f]) || isset($vocab2[$f]) || isset($skip[$f]) || isset($places[$f])) { return $m[1]; }
            // « petrus mazaud » : le prénom d'une fiche de ce nom juste avant → une personne citée, pas un nom de famille seul
            if ($before !== '') { $s = $pdo->prepare("SELECT 1 FROM persons WHERE last_name=? COLLATE NOCASE AND (' '||lower(first_name)||' ') LIKE ? LIMIT 1"); $s->execute([$last[$f], '% ' . $before . ' %']); if ($s->fetchColumn()) { return $m[1]; } }
            $known = []; foreach (QUESTION_OCCUPATIONS as $o) { $known[q_base($o)] = true; }
            if (isset($known[q_base($m[1])])) { return $m[1]; }
            return $last[$f];
        }, $q);
    }

    // ── « moi / mes / ma / mon » : la personne de départ de l'arbre
    [$root, $rootName] = qp_root_name($pdo);
    if ($root && $rootName !== '') {
        $me = static function () use (&$notes, $rootName) { $notes[] = i18n_t('« moi » = la personne de départ : {name}', ['name' => $rootName]); };
        // « mon lien avec Paul Mazaud », « quel lien entre moi et X », « X et moi »
        if (preg_match('/(?<![\p{L}])(?:mon|notre)\s+lien\s+(?:de\s+parent[ée]\s+)?(?:avec|à|a)\s+(.+?)\s*\??$/iu', $q, $m) || preg_match('/(?<![\p{L}])lien\s+(?:de\s+parent[ée]\s+)?(?:entre\s+moi\s+et|avec\s+moi\s+et|avec)\s+(.+?)\s*\??$/iu', $q, $m)) {
            if (!preg_match('/^moi\b/iu', $m[1])) { $q = 'quel est le lien entre ' . $rootName . ' et ' . $m[1] . ' ?'; $person = $root; $me(); }
        } elseif (preg_match('/(?<![\p{L}])(mes|mon|ma)\s+((?:[\p{L}\p{M}\'’-]+)(?:\s+[\p{L}\p{M}\'’-]+){0,4})/iu', $q, $m, PREG_OFFSET_CAPTURE)) {
            $relWords = array_flip(['arriere', 'grand', 'grands', 'petit', 'petits', 'petite', 'petites', 'parent', 'parents', 'pere', 'peres', 'mere', 'meres', 'enfant', 'enfants', 'fils', 'fille', 'filles',
                'frere', 'freres', 'soeur', 'soeurs', 'et', 'demi', 'oncle', 'oncles', 'tante', 'tantes', 'neveu', 'neveux', 'niece', 'nieces', 'cousin', 'cousins', 'cousine', 'cousines', 'germain', 'germains',
                'germaine', 'germaines', 'issu', 'issus', 'issue', 'issues', 'beau', 'beaux', 'belle', 'belles', 'gendre', 'gendres', 'bru', 'brus', 'parrain', 'parrains', 'marraine', 'marraines', 'filleul',
                'filleuls', 'filleule', 'filleules', 'conjoint', 'conjoints', 'epoux', 'epouse', 'mari', 'femme', 'paternel', 'paternels', 'paternelle', 'paternelles', 'maternel', 'maternels', 'maternelle',
                'maternelles', 'descendants', 'descendance', 'propres']);
            $toks = preg_split('/\s+/u', $m[2][0]); $take = [];
            foreach ($toks as $i => $tk) {
                $parts = qp_words($tk);
                if (!$parts) { break; }
                $ok = true; foreach ($parts as $p) { if (!isset($relWords[$p])) { $ok = false; } }
                if (!$ok && qp_key($tk) === 'de' && isset($toks[$i + 1]) && str_starts_with(qp_key($toks[$i + 1]), 'germain')) { $ok = true; }
                if (!$ok) { break; }
                $take[] = $tk;
            }
            while ($take && in_array(qp_key(end($take)), ['et', 'de'], true)) { array_pop($take); }
            $phrase = implode(' ', $take); $pk = qp_key($phrase);
            if ($take && !preg_match('/\b(ancetres?|aieux|ascendants?)\b/', $pk) && $pk !== 'propres') {
                $start = $m[0][1]; $len = strlen($m[1][0]) + (strlen($m[0][0]) - strlen($m[1][0]) - strlen($m[2][0])) + strlen($phrase);
                // « les enfants de ma sœur », « le mari de ma tante » : un lien de parenté avant « ma / mon / mes » → deux liens à enchaîner
                // (ask_question cherche d'abord « ma sœur », puis le premier lien sur cette personne ; jamais sur « moi »)
                $kin = $relWords + array_flip(['ancetre', 'ancetres', 'aieux', 'ascendant', 'ascendants', 'descendant', 'heritier', 'heritiers', 'famille', 'fratrie', 'cousinade', 'proches']);
                unset($kin['et'], $kin['propres']);
                $chained = false;
                if (preg_match('/([\p{L}\p{M}\'’-]+)\s+(?:de|du|des|d[\'’])\s*$/iu', substr($q, 0, $start), $bm)) {
                    $bw = qp_words($bm[1]); $chained = (bool) $bw; foreach ($bw as $x) { if (!isset($kin[$x])) { $chained = false; } }
                }
                if ($chained) { $chain = ['inner' => 'les ' . $phrase . ' de ' . $rootName, 'said' => substr($q, $start, $len), 'start' => $start, 'len' => $len, 'root' => $root]; $me(); }
                else {
                    $q = substr_replace($q, 'les ' . $phrase . ' de ' . $rootName, $start, $len);
                    $person = $root; $me();
                }
            }
        }
        // « les ancêtres de moi », « les cousins de moi » (pas « même jour que moi », déjà compris)
        if (!$person && !$chain && preg_match('/(?<![\p{L}])(de|d’|d\')\s*moi(?![\p{L}])(?!\s+\p{Lu})/iu', $q)) {
            $q = (string) preg_replace('/(?<![\p{L}])(?:de|d’|d\')\s*moi(?![\p{L}])/iu', 'de ' . $rootName, $q, 1); $person = $root; $me();
        }
    }
    return ['q' => $q, 'notes' => array_values(array_unique($notes)), 'person' => $person, 'replace' => $replace, 'chain' => $chain];
}

/* ═════════ 2. Réponses directes ═════════ */

/** une personne citée : par son nom exact (qm_find_people), sinon par le moteur « à la française » (Petrus = Pierre, Mazeau ≈ Mazaud) */
function qp_find_person(PDO $pdo, string $text): array
{
    $ids = function_exists('qm_find_people') ? qm_find_people($pdo, $text) : [];
    if ($ids) { return ['id' => $ids[0], 'all' => $ids, 'loose' => false]; }
    $loose = qp_loose_person($pdo, $text);
    return $loose ? ['id' => $loose['id'], 'all' => [$loose['id']], 'loose' => true, 'homonyms' => $loose['homonyms']] : [];
}

/**
 * Un nom de personne écrit autrement que dans la fiche (« Pierre Mazaud » pour Petrus MAZAUD, « Petrus Mazeau », « Jn Bte Mazaud ») :
 * une suite de 2 à 4 mots = prénom (forme de référence : latin, abréviation, diminutif) + nom (même clé, ou même son). Rend null sinon.
 */
function qp_loose_person(PDO $pdo, string $text, array $skipWords = []): ?array
{
    if (!function_exists('rfr_first_forms')) { return null; }
    preg_match_all('/[\p{L}\p{M}.]+(?:[\'’-][\p{L}\p{M}.]+)*/u', $text, $mm);
    $tok = $mm[0];
    $stop = array_flip(['qui', 'que', 'quel', 'quels', 'quelle', 'quelles', 'combien', 'est', 'sont', 'les', 'des', 'ses', 'son', 'sa', 'mes', 'mon', 'ma', 'moi', 'tous', 'toutes', 'liste', 'donne', 'montre',
        'ont', 'avait', 'avaient', 'a', 't', 'il', 'elle', 'ils', 'elles', 'eu', 'de', 'du', 'd', 'la', 'le', 'l', 'et', 'ou', 'nes', 'nees', 'ne', 'nee', 'mort', 'morts', 'morte', 'maries', 'mariee', 'mariees',
        'marie', 'en', 'au', 'aux', 'avant', 'apres', 'entre', 'vers', 'dans', 'sur', 'pour', 'chez', 'parle', 'presente', 'dis', 'raconte', 'heritiers', 'heritier', 'chercher', 'actes', 'enfants', 'enfant',
        'freres', 'soeurs', 'parents', 'cousins', 'oncles', 'tantes', 'neveux', 'fils', 'filles', 'fille', 'pere', 'mere', 'epoux', 'epouse', 'femme', 'mari', 'conjoint', 'ancetres', 'descendants', 'parrain', 'marraine']);
    foreach ($skipWords as $w) { foreach (qp_words((string) $w) as $x) { $stop[$x] = true; } } // les mots de parenté de la question
    $set = function_exists('rfr_settings') ? rfr_settings($pdo) : RFR_DEFAULTS;
    $n = count($tok); $best = null;
    // ⏱ une seule lecture des fiches par requête (index des clés de nom et de leur son), et un budget de temps : au-delà, rien n'est
    // retenu (la question n'est pas « comprise » plutôt que d'attendre une minute sur une grosse base)
    $t0 = microtime(true); $budget = (float) ($GLOBALS['QP_LOOSE_BUDGET'] ?? 1.5);
    $idx = null; $cand = [];
    $firstOk = static function (array &$P, int $i, string $fCanon, string $first): bool {
        $P[$i][3] ??= array_column(rfr_first_forms($P[$i][1]), 'canon');
        return in_array($fCanon, $P[$i][3], true) || rfr_first_key($P[$i][1]) === rfr_first_key($first);
    };
    for ($len = min(4, $n); $len >= 2 && !$best; $len--) {
        for ($i = 0; $i + $len <= $n && !$best; $i++) {
            if (microtime(true) - $t0 > $budget) { return null; } // trop long : pas de « personne citée » devinée
            $w = array_slice($tok, $i, $len);
            $bad = false; foreach ($w as $x) { if (isset($stop[qp_key($x)]) || preg_match('/\d/', $x) || array_intersect_key(array_flip(qp_words($x)), $stop) && count(qp_words($x)) > 1) { $bad = true; } }
            if ($bad) { continue; }
            $idx ??= qp_loose_index($pdo);
            for ($k = $len - 1; $k >= 1 && !$best; $k--) {
                $first = implode(' ', array_slice($w, 0, $k)); $last = implode(' ', array_slice($w, $k));
                $fq = rfr_first_query($first, $set); $fCanon = $fq ? $fq['canon'] : rfr_first_key($first);
                // les fiches de même nom (une clé en commun) ou d'un nom qui sonne pareil, cherchées dans l'index (une fois par nom essayé)
                if (!isset($cand[$last])) {
                    $lk = rfr_name_keys($last); $same = []; $near = [];
                    foreach ($lk['keys'] as $key) { foreach ($idx['key'][$key] ?? [] as $pi) { $same[$pi] = true; } }
                    $ph = (string) $lk['phon'];
                    if ($ph !== '') {
                        foreach ($idx['phon'][$ph[0]] ?? [] as $len2 => $list) {
                            if (abs($len2 - strlen($ph)) > 2) { continue; }
                            foreach ($list as $pk => $ids) { if (rfr_phon_near($ph, (string) $pk)) { foreach ($ids as $pi) { $near[$pi] = true; } } }
                        }
                    }
                    $cand[$last] = [$same, $near];
                }
                [$same, $near] = $cand[$last];
                $hits = [];
                foreach (array_keys($same + $near) as $pi) {
                    if (!$firstOk($idx['p'], $pi, $fCanon, $first)) { continue; }
                    [$id, $pf] = $idx['p'][$pi];
                    $hits[] = ['id' => $id, 'exact' => (isset($same[$pi]) ? 1 : 0) + (rfr_first_key($pf) === rfr_first_key($first) ? 1 : 0)];
                }
                if (!$hits) { continue; }
                usort($hits, static fn($a, $b) => $b['exact'] <=> $a['exact'] ?: $a['id'] <=> $b['id']);
                $top = array_values(array_filter($hits, static fn($h) => $h['exact'] === $hits[0]['exact']));
                $best = ['id' => $hits[0]['id'], 'homonyms' => count($top) > 1 ? array_column($top, 'id') : [], 'from' => $i, 'to' => $i + $len - 1, 'text' => implode(' ', $w)];
            }
        }
    }
    return $best;
}

/**
 * L'index des fiches pour qp_loose_person, fait une fois par requête : [p => [[id, prénom, nom, formes du prénom (au besoin)]],
 * key => [clé de nom => [n°…]], phon => [1re lettre => [longueur => [son => [n°…]]]]] (le même son pour beaucoup de fiches : une fois).
 */
function qp_loose_index(PDO $pdo): array
{
    static $memo = [];
    $sig = spl_object_id($pdo) . ':' . implode(':', $pdo->query("SELECT COUNT(*), COALESCE(MAX(id),0) FROM persons")->fetch(PDO::FETCH_NUM));
    if (isset($memo[$sig])) { return $memo[$sig]; }
    $out = ['p' => [], 'key' => [], 'phon' => []]; $byName = [];
    foreach ($pdo->query("SELECT id, COALESCE(first_name,'') AS f, COALESCE(last_name,'') AS l FROM persons WHERE trim(COALESCE(first_name,''))<>'' AND trim(COALESCE(last_name,''))<>''") as $r) {
        $i = count($out['p']); $l = (string) $r['l']; $out['p'][] = [(int) $r['id'], (string) $r['f'], $l, null];
        $byName[$l][] = $i;
    }
    foreach ($byName as $l => $ids) { // un même nom de famille : ses clés une seule fois
        $nk = rfr_name_keys((string) $l);
        foreach ($nk['keys'] as $key) { foreach ($ids as $i) { $out['key'][$key][] = $i; } }
        $ph = (string) $nk['phon'];
        if ($ph !== '') { foreach ($ids as $i) { $out['phon'][$ph[0]][strlen($ph)][$ph][] = $i; } }
    }
    $memo = [$sig => $out]; // une seule base gardée
    return $out;
}

/** les faits d'une fiche (résumé de « qui est X ? ») */
function qp_summary(PDO $pdo, int $id, string $asked = ''): array
{
    $all = qm_people($pdo); $p = $all[$id] ?? null;
    if (!$p) { return qm_answer([], ''); }
    $name = qm_name($p); $life = person_life_years($pdo, $id);
    $when = static fn(?string $d, ?int $y, string $text) => $d ? (new DateTime($d))->format('j') . ' ' . QM_MONTHS[(int) substr($d, 5, 2)] . ' ' . substr($d, 0, 4) : (trim($text) !== '' ? trim($text) : ($y ? (string) $y : ''));
    $facts = [];
    if ($p['by'] !== null || $p['bplace'] !== '') { $facts[] = [i18n_t('Naissance'), trim($when($p['bd'], $p['by'], $p['btext']) . ($p['bplace'] !== '' ? ' — ' . $p['bplace'] : ''))]; }
    if ($p['dy'] !== null || $p['dplace'] !== '') { $facts[] = [i18n_t('Décès'), trim($when($p['dd'], $p['dy'], $p['dtext']) . ($p['dplace'] !== '' ? ' — ' . $p['dplace'] : ''))]; }
    if (trim($p['occupation']) !== '') { $facts[] = [i18n_t('Métier'), trim($p['occupation'])]; }
    $nm = static fn(array $ids) => implode(', ', array_map(static fn($x) => isset($all[$x]) ? qm_name($all[$x]) : '#' . $x, $ids));
    $par = h_parents($pdo, $id); if ($par) { $facts[] = [i18n_t('Parents'), $nm($par)]; }
    $sp = search_relatives($pdo, 'spouses', $id); if ($sp) { $facts[] = [i18n_t('Conjoint'), $nm($sp)]; }
    $kids = search_relatives($pdo, 'children', $id); if ($kids) { $facts[] = [i18n_t('Enfants'), count($kids) . ' — ' . $nm(array_slice($kids, 0, 8)) . (count($kids) > 8 ? '…' : '')]; }
    $answer = $name . ($life !== '' ? " ({$life})" : '') . (trim($p['occupation']) !== '' ? ', ' . trim($p['occupation']) : '') . '.';
    $u = [i18n_t('qui est : {name}', ['name' => $name])];
    if ($asked !== '' && qp_key($asked) !== qp_key($name)) { $u[] = i18n_t('« {a} » compris comme {b}', ['a' => $asked, 'b' => $name]); }
    return qm_answer($u, $answer, ['facts' => $facts, 'ids' => [$id], 'open' => [['kind' => 'person', 'id' => $id, 'label' => i18n_t('Ouvrir la fiche')]]]);
}

/** les mots de la question qui ne sont pas un nom (« qui est », « parle-moi de », « ? ») */
function qp_strip_ask(string $q): string
{
    $s = trim((string) preg_replace('/[?!.]+\s*$/u', '', trim($q)));
    $s = (string) preg_replace('/^(?:qui\s+(?:est|était|etait|c[\'’]est|était-ce)|parle[- ]moi\s+(?:de|d[\'’])|pr[ée]sente[- ]moi|dis[- ]moi\s+qui\s+est|raconte[- ]moi|c[\'’]est\s+qui)\s*/iu', '', $s);
    return trim($s);
}

/** le dossier ⚖️ d'un défunt (le plus récent) */
function qp_succ_case_of(PDO $pdo, int $pid): ?array
{
    $s = $pdo->prepare('SELECT id, number, title, snapshot_json, state FROM succ_cases WHERE deceased_id=? AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 1'); $s->execute([$pid]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}
function qp_case_label(array $c): string { $n = trim((string) $c['number']); $t = trim((string) $c['title']); return trim(($n !== '' ? $n : '#' . $c['id']) . ($t !== '' ? ' — ' . $t : '')); }

/** les questions qui ont déjà leur outil, et celles qui demandent une réponse entière (qui est X, morts à la guerre) */
function qp_direct(PDO $pdo, string $q, int $personId = 0): ?array
{
    $t = ' ' . qp_key($q) . ' ';
    $succ = static fn() => function_exists('succ_ready') && succ_ready($pdo);
    $notUnderstood = static fn() => new RuntimeException('Je n’ai pas compris la question. Exemples : « Quels ancêtres étaient boulangers à Lille avant 1850 ? », « Qui est né le même jour que moi ? », « les Dupont mariés dans le Nord au XVIIIe siècle ».');

    // ── ⚖️ les dossiers de succession (jamais en mode consultation : la question n'est alors pas comprise)
    $isHeirs = preg_match('/ heritiers? /', $t);
    $isLate = preg_match('/ dossiers? (de succession )?(en retard|qui ont du retard|avec du retard)| (echeances?|delais?) (en retard|depasses?|depassees?) /', $t);
    $isNoAnswer = $isHeirs && preg_match('/ (pas|jamais) (encore )?(repondu|repondus|de reponse)| sans reponse| ne repondent pas| n ont pas repondu/', $t) || preg_match('/ courriers? (aux heritiers )?sans reponse /', $t);
    $isPieces = preg_match('/ pieces? (manquantes?|qui manquent|a obtenir)/', $t);
    $isLost = $isHeirs && preg_match('/ (introuvables?|pas trouves?|perdus?|qu on ne trouve pas) /', $t);
    if ($isHeirs || $isLate || $isNoAnswer || $isPieces || $isLost) {
        if (function_exists('succ_kiosk') && succ_kiosk()) { throw $notUnderstood(); }
        if (!$succ()) { return qm_answer([i18n_t('dossiers de succession')], i18n_t('Aucun dossier de succession dans cette généalogie.'), ['open' => [['kind' => 'succ_list', 'label' => i18n_t('⚖️ Dossiers de succession')]]]); }
        $u = [i18n_t('dossiers de succession')];
        if ($isNoAnswer) {
            $rows = []; $ids = []; $cases = [];
            try {
                foreach ($pdo->query("SELECT c.id, c.destinataire, c.date_envoi, c.person_id, c.succ_case_id, s.number, s.title FROM courriers c JOIN succ_cases s ON s.id=c.succ_case_id AND s.deleted_at IS NULL
                        WHERE c.succ_case_id IS NOT NULL AND COALESCE(c.reponse,'') IN ('','none') AND s.state NOT IN ('clos','archive') ORDER BY c.date_envoi, c.id LIMIT 200")->fetchAll(PDO::FETCH_ASSOC) as $c) {
                    $rows[] = [$c['person_id'] ? [(int) $c['person_id']] : [], trim((string) $c['destinataire']) ?: '—', trim(qp_case_label(['id' => $c['succ_case_id'], 'number' => $c['number'], 'title' => $c['title']]) . ($c['date_envoi'] ? ' · ' . $c['date_envoi'] : ''))];
                    if ($c['person_id']) { $ids[] = (int) $c['person_id']; } $cases[(int) $c['succ_case_id']] = true;
                }
            } catch (Throwable $_) {}
            $open = count($cases) === 1 ? [['kind' => 'succ_case', 'id' => array_key_first($cases), 'label' => i18n_t('Ouvrir le dossier')]] : [['kind' => 'succ_list', 'label' => i18n_t('⚖️ Dossiers de succession')]];
            return qm_answer(array_merge($u, [i18n_t('courriers sans réponse')]), $rows ? i18n_t('Courriers aux héritiers sans réponse : {n}.', ['n' => count($rows)]) : i18n_t('Aucun courrier de dossier n’attend de réponse.'), ['ids' => array_values(array_unique($ids)), 'rows' => qm_rows($rows, 50), 'open' => $open]);
        }
        if ($isLate) {
            $late = array_values(array_filter(succ_list($pdo), static fn($c) => $c['late'] > 0 && !in_array($c['state'], ['clos', 'archive'], true)));
            $rows = array_map(static fn($c) => [$c['deceased_id'] ? [$c['deceased_id']] : [], qp_case_label($c) . ($c['deceased'] !== '' ? ' · ' . $c['deceased'] : ''), i18n_t('{n} en retard', ['n' => $c['late']])], $late);
            return qm_answer(array_merge($u, [i18n_t('échéances en retard')]), $late ? i18n_t('Dossiers avec des échéances en retard : {n}.', ['n' => count($late)]) : i18n_t('Aucun dossier n’a d’échéance en retard.'),
                ['rows' => qm_rows($rows, 50), 'open' => [['kind' => 'succ_list', 'label' => i18n_t('⚖️ Dossiers de succession')], ['kind' => 'semaine', 'label' => i18n_t('🗓 Ma semaine')]]]);
        }
        // un défunt cité, sinon tous les dossiers ouverts
        $who = qp_find_person($pdo, $q);
        if ($isPieces || $isLost) {
            $where = ''; $params = [];
            if ($who) { $c = qp_succ_case_of($pdo, (int) $who['id']); if (!$c) { return qm_answer(array_merge($u, [i18n_t('défunt : {name}', ['name' => question_person_name($pdo, (int) $who['id'])])]), i18n_t('Aucun dossier de succession pour {name}.', ['name' => question_person_name($pdo, (int) $who['id'])]), ['open' => [['kind' => 'succ_new', 'id' => (int) $who['id'], 'label' => i18n_t('⚖️ Rechercher les héritiers…')]]]); } $where = ' AND s.id=?'; $params[] = (int) $c['id']; }
            $rows = []; $ids = []; $cases = [];
            if ($isPieces) {
                $st = $pdo->prepare("SELECT p.piece_key, p.note, s.id, s.number, s.title FROM succ_pieces p JOIN succ_cases s ON s.id=p.case_id AND s.deleted_at IS NULL WHERE p.state='missing' AND s.state NOT IN ('clos','archive'){$where} ORDER BY s.id, p.piece_key LIMIT 300"); $st->execute($params);
                foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) { $rows[] = [[], qp_case_label($r), trim((string) $r['piece_key'] . ($r['note'] !== '' ? ' — ' . $r['note'] : ''))]; $cases[(int) $r['id']] = true; }
                $ans = $rows ? i18n_t('Pièces notées « manquante » : {n}. La liste complète (en main, demandées, à demander) est dans l’onglet Pièces du dossier.', ['n' => count($rows)]) : i18n_t('Aucune pièce notée « manquante ». La liste des pièces de chaque dossier est dans son onglet Pièces.');
                $lab = i18n_t('pièces manquantes');
            } else {
                $st = $pdo->prepare("SELECT cp.person_id, cp.contact_state, s.id, s.number, s.title FROM succ_case_persons cp JOIN succ_cases s ON s.id=cp.case_id AND s.deleted_at IS NULL WHERE cp.deleted_at IS NULL AND cp.contact_state IN ('introuvable','silence') AND s.state NOT IN ('clos','archive'){$where} ORDER BY s.id LIMIT 300"); $st->execute($params);
                foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) { $pid = (int) $r['person_id']; $rows[] = [[$pid], question_person_name($pdo, $pid), qp_case_label($r) . ' · ' . ($r['contact_state'] === 'introuvable' ? i18n_t('introuvable') : i18n_t('ne répond pas'))]; $ids[] = $pid; $cases[(int) $r['id']] = true; }
                $ans = $rows ? i18n_t('Héritiers introuvables ou qui ne répondent pas : {n}.', ['n' => count($rows)]) : i18n_t('Aucun héritier noté introuvable ou sans réponse.');
                $lab = i18n_t('héritiers introuvables');
            }
            $open = count($cases) === 1 ? [['kind' => 'succ_case', 'id' => array_key_first($cases), 'label' => i18n_t('Ouvrir le dossier')]] : [['kind' => 'succ_list', 'label' => i18n_t('⚖️ Dossiers de succession')]];
            return qm_answer(array_merge($u, [$lab]), $ans, ['ids' => $ids, 'rows' => qm_rows($rows, 50), 'open' => $open]);
        }
        // « les héritiers de X » : le dernier calcul du dossier (snapshot) ; le calcul lui-même reste dans le dossier
        if (!$who) { return qm_answer($u, i18n_t('De qui ? Écris par exemple « les héritiers de Jean Dupont ».'), ['open' => [['kind' => 'succ_list', 'label' => i18n_t('⚖️ Dossiers de succession')]]]); }
        $pid = (int) $who['id']; $name = question_person_name($pdo, $pid);
        $u = [i18n_t('héritiers de {name}', ['name' => $name])];
        $c = qp_succ_case_of($pdo, $pid);
        if (!$c) { return qm_answer($u, i18n_t('Aucun dossier de succession pour {name}. Le dossier calcule les héritiers d’après l’arbre.', ['name' => $name]), ['ids' => [$pid], 'open' => [['kind' => 'succ_new', 'id' => $pid, 'label' => i18n_t('⚖️ Rechercher les héritiers…')]]]); }
        $snap = json_decode((string) $c['snapshot_json'], true);
        if (function_exists('access_log_add')) { access_log_add($pdo, 'case_open', 'case', (int) $c['id'], function_exists('access_case_label') ? access_case_label($pdo, (int) $c['id']) : '', 'question_heirs'); } // 📜 comme l'ouverture du dossier
        $open = [['kind' => 'succ_case', 'id' => (int) $c['id'], 'label' => i18n_t('Ouvrir le dossier')]];
        if (!is_array($snap) || !is_array($snap['shares'] ?? null)) { return qm_answer($u, i18n_t('Dossier {d} : les héritiers n’ont pas encore été calculés. Ouvre le dossier pour faire le calcul.', ['d' => qp_case_label($c)]), ['open' => $open]); }
        $rows = []; $ids = [];
        foreach ($snap['shares'] as $hid => $share) { $hid = (int) $hid; if ($hid <= 0) { continue; } $rows[] = [[$hid], question_person_name($pdo, $hid), (string) $share]; $ids[] = $hid; }
        $unk = is_array($snap['unknown'] ?? null) ? count($snap['unknown']) : 0;
        $ans = i18n_t('Dossier {d} — héritiers d’après le dernier calcul enregistré : {n}.', ['d' => qp_case_label($c), 'n' => count($rows)]) . ($unk ? ' ' . i18n_t('Branches encore à rechercher : {n}.', ['n' => $unk]) : '');
        return qm_answer($u, $ans, ['ids' => $ids, 'rows' => qm_rows($rows, 100), 'open' => $open]);
    }

    // ── 🔍 « quels actes me manquent ? » → Que manque-t-il ?
    if (preg_match('/ (actes? (qui )?(me |nous )?manqu\w*|quels actes|actes? a (chercher|trouver)|(que|qu) (me |nous )?manque t il|ce qui (me |nous )?manque|qu est ce qui (me |nous )?manque|actes? manquants?|documents? manquants?)/', $t)) {
        $who = qp_find_person($pdo, $q);
        $d = function_exists('research_gaps_data') ? research_gaps_data($pdo) : ['items' => [], 'total' => 0];
        $items = $d['items'] ?? [];
        if ($who) { $items = array_values(array_filter($items, static fn($it) => (int) $it['person_id'] === (int) $who['id'])); }
        $rows = array_map(static fn($it) => [[(int) $it['person_id']], $it['name'] . ' — ' . i18n_t((string) $it['what']), trim(($it['from'] ? ($it['to'] && $it['to'] !== $it['from'] ? $it['from'] . '-' . $it['to'] : (string) $it['from']) : '') . ($it['place'] !== '' ? ' · ' . $it['place'] : ''))], array_slice($items, 0, 3));
        $n = $who ? count($items) : (int) ($d['total'] ?? count($items));
        $for = $who ? question_person_name($pdo, (int) $who['id']) : (string) ($d['root_name'] ?? '');
        $ans = $n ? i18n_t('Actes ou documents à chercher pour {name} : {n}. Les 3 premiers ci-dessous ; la liste complète, avec où chercher et dans quelle série, est dans « Que manque-t-il ? ».', ['n' => $n, 'name' => $for]) : i18n_t('Rien de connu à chercher pour {name}.', ['name' => $for]);
        return qm_answer([i18n_t('actes à chercher')], $ans, ['rows' => qm_rows($rows, 3), 'open' => [['kind' => 'gaps', 'label' => i18n_t('🔍 Que manque-t-il ?')]]]);
    }
    // ── 🌍 « où chercher X ? »
    if (preg_match('/ ou (chercher|trouver|rechercher)( des actes| les actes)? | quels? sites? /', $t)) {
        $who = qp_find_person($pdo, $q);
        $pid = $who ? (int) $who['id'] : 0;
        if (!$pid && preg_match('/ (mes|mon|ma|moi) /', $t)) { [$pid] = qp_root_name($pdo); }
        $name = $pid ? question_person_name($pdo, $pid) : '';
        return qm_answer([i18n_t('où chercher'), ...($name !== '' ? [$name] : [])], $name !== '' ? i18n_t('« Où chercher ? » donne pour {name} les sites et les séries d’archives les plus utiles, et pourquoi.', ['name' => $name]) : i18n_t('« Où chercher ? » donne pour chaque personne les sites et les séries d’archives les plus utiles, et pourquoi.'),
            ['ids' => $pid ? [$pid] : [], 'open' => [['kind' => 'ou_chercher', 'id' => $pid, 'label' => i18n_t('🌍 Où chercher ?')]]]);
    }
    // ── ✅ les doublons → Contrôle de la base
    if (preg_match('/ (doublons?|en double|deux fois|fiches? (en )?doubles?) /', $t)) {
        return qm_answer([i18n_t('doublons')], i18n_t('Le Contrôle de la base cherche les doublons probables (mêmes noms, mêmes dates, mêmes parents) et aide à les fusionner.'), ['open' => [['kind' => 'controle', 'label' => i18n_t('✅ Contrôle de la base')]]]);
    }

    // ── 🎖 morts à la guerre, morts pour la France, morts pendant une guerre (champ « Mort pour la France » et dates de décès)
    if (preg_match('/ (morts?|mortes?|tues?|tuees?|decedes?|decedees?|tombes?|disparus?) /', $t) && (preg_match('/ (a la guerre|au combat|au front|pour la france|a l ennemi|en guerre) /', $t) || (preg_match('/ (pendant|durant|lors de|a) /', $t) && preg_match('/ (guerre|guerres) /', $t)))) {
        $era = null;
        foreach (QM_ERAS as $re => $v) { if ($v[3] && preg_match('/\b(' . $re . ')\b/', $t)) { $era = $v; break; } }
        $wars = $era ? [$era] : array_values(array_filter(QM_ERAS, static fn($v) => $v[3]));
        $all = qm_humans($pdo); $mpf = [];
        try { foreach ($pdo->query("SELECT id FROM persons WHERE mort_pour_la_france='yes'")->fetchAll(PDO::FETCH_COLUMN) as $x) { $mpf[(int) $x] = true; } } catch (Throwable $_) {}
        $rows = []; $sure = []; $maybe = [];
        foreach ($all as $id => $p) {
            $inWar = null;
            foreach ($wars as $w) { if ($p['dy'] !== null && $p['dy'] >= $w[0] && $p['dy'] <= $w[1]) { $inWar = $w; break; } }
            $isMpf = isset($mpf[$id]) && (!$era || $inWar);
            if ($isMpf) { $sure[] = $id; $rows[] = [$id, qm_name($p) . ($p['dy'] ? " ({$p['dy']})" : ''), i18n_t('mort pour la France')]; continue; }
            if (!$inWar) { continue; }
            $age = $p['by'] !== null ? $p['dy'] - $p['by'] : null;
            $soldier = $p['gender'] === 'male' && (($age !== null && $age >= 17 && $age <= 50) || preg_match('/\b(soldat|militaire|caporal|sergent|poilu|marin|matelot|officier)/', qp_fold($p['occupation'])));
            if ($era || $soldier) { $maybe[] = $id; $rows[] = [$id, qm_name($p) . " ({$p['dy']})" . ($p['dplace'] !== '' ? ' — ' . $p['dplace'] : ''), $soldier ? i18n_t('mort pendant la guerre, en âge de combattre') : i18n_t('mort pendant la guerre')]; }
        }
        $lab = $era ? i18n_t('morts pendant {era}', ['era' => $era[2]]) : i18n_t('morts à la guerre');
        $ans = $era ? i18n_t('Morts pendant {era} : {n}.', ['n' => count($sure) + count($maybe), 'era' => $era[2]])
            : i18n_t('Notés « Mort pour la France » : {n}. Morts pendant une guerre, en âge de combattre ou soldats (à vérifier) : {m}.', ['n' => count($sure), 'm' => count($maybe)]);
        if ($era && $sure) { $ans .= ' ' . i18n_t('Dont « Mort pour la France » : {n}.', ['n' => count($sure)]); }
        return qm_answer([$lab], $ans . ' ' . i18n_t('Pour les soldats : Mémoire des hommes et les registres matricules.'), ['ids' => array_merge($sure, $maybe), 'rows' => qm_rows($rows, 100)]);
    }

    // ── 👤 « qui est Petrus Mazaud ? », « parle-moi de… », ou un nom seul (« Jean Durand »)
    $rest = qp_strip_ask($q);
    $asked = qp_key($rest) !== qp_key((string) preg_replace('/[?!.]+\s*$/u', '', $q)); // « qui est », « parle-moi de »…
    $looksName = (bool) preg_match('/^\p{Lu}[\p{L}\p{M}\'’.-]*(?:\s+\p{Lu}[\p{L}\p{M}\'’.-]*){1,3}$/u', $rest); // « Jean Durand » seul
    if ($rest !== '' && ($asked || $looksName) && mb_strlen($rest) <= 80) {
        $words = qp_words($rest);
        $ids = function_exists('qm_find_people') ? qm_find_people($pdo, $rest) : [];
        $covered = false;
        if (count($ids) === 1) { $all = qm_people($pdo); $pw = array_merge(qm_words($all[$ids[0]]['first']), qm_words($all[$ids[0]]['last']), ['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l']); $covered = !array_diff($words, $pw); }
        if ($covered) { return qp_summary($pdo, $ids[0], $rest); }
        if ($asked && !$ids && count($words) >= 2 && count($words) <= 4) {
            $loose = qp_loose_person($pdo, $rest);
            if ($loose && count(preg_split('/\s+/u', $loose['text'])) === count(preg_split('/\s+/u', $rest))) { return qp_summary($pdo, (int) $loose['id'], $rest); }
        }
    }
    return null;
}

/* ═════════ 3. Négations et absences ═════════ */

/**
 * « sans date de décès », « qui n'a pas de date de décès », « qui ne sont pas nées à Lille », « qui ne sont pas des ancêtres »,
 * « sans parents (connus) », « sans source », « sans profession » : retirés de la question → ['q', 'crit', 'labels'].
 */
function qp_negations(string $q): array
{
    $crit = []; $labels = [];
    $cut = static function (string $re, callable $fn) use (&$q): void {
        $q = (string) preg_replace_callback($re, static function ($m) use ($fn) { $fn($m); return ' '; }, $q);
    };
    $evRe = '(n[ée]e?s?|morte?s?|d[ée]c[ée]d[ée]e?s?|mari[ée]e?s?|baptis[ée]e?s?)';
    $evOf = static fn(string $w) => match (true) { (bool) preg_match('/^n/iu', $w) => 'birth', (bool) preg_match('/^(m[o]|d)/iu', $w) => 'death', (bool) preg_match('/^mari/iu', $w) => 'MARR', default => 'CHR' };
    $sansDate = '(?:(?:qui\s+)?(?:n[\'’]\s*(?:a|ont|avai(?:en)?t)\s+pas\s+(?:de|d[\'’])|sans|aucune?)\s*)';
    // « sans date de décès », « qui n'a pas de date de naissance », « sans décès connu »
    $cut('/' . $sansDate . '(?:date\s+(?:de|du|d[\'’])\s*)?(d[ée]c[èe]s|naissance|mariage)(?:\s+connue?s?|\s+not[ée]e?s?)?(?![\p{L}])/iu', static function ($m) use (&$crit, &$labels) {
        $k = ['d' => 'death', 'n' => 'birth', 'm' => 'marriage'][mb_strtolower(qp_fold($m[1])[0])] ?? 'death';
        $crit['missing'] = $k; $labels[] = ['death' => i18n_t('sans date de décès'), 'birth' => i18n_t('sans date de naissance'), 'marriage' => i18n_t('sans date de mariage')][$k];
    });
    // « sans parents (connus) », « n'ont pas de parents connus », « sans père ni mère »
    $cut('/(?:(?:qui\s+)?(?:n[\'’]\s*(?:a|ont|avai(?:en)?t)\s+pas\s+(?:de|d[\'’])|sans|aucun)\s*)(?:parents?|p[èe]re\s+ni\s+m[èe]re)(?:\s+connus?)?(?![\p{L}])/iu', static function () use (&$crit, &$labels) { $crit['no_parents'] = 1; $labels[] = i18n_t('sans parents connus'); });
    // « sans source », « qui n'a pas de source », « aucune source »
    $cut('/(?:(?:qui\s+)?(?:n[\'’]\s*(?:a|ont|avai(?:en)?t)\s+pas\s+(?:de|d[\'’])|sans|aucune)\s*)sources?(?![\p{L}])/iu', static function () use (&$crit, &$labels) { $crit['no_source'] = 1; $labels[] = i18n_t('sans source'); });
    // « sans profession », « sans métier »
    $cut('/(?:(?:qui\s+)?(?:n[\'’]\s*(?:a|ont|avai(?:en)?t)\s+pas\s+(?:de|d[\'’])|sans|aucun|aucune)\s*)(?:profession|m[ée]tier)s?(?:\s+connue?s?|\s+not[ée]e?s?)?(?![\p{L}])/iu', static function () use (&$crit, &$labels) { $crit['no_occupation'] = 1; $labels[] = i18n_t('sans profession notée'); });
    // « qui ne sont pas des ancêtres », « pas mes ancêtres »
    $cut('/(?:qui\s+)?(?:ne|n[\'’])\s*(?:sont|est|[ée]taient|[ée]tait)\s+pas\s+(?:des|mes|un|une|parmi\s+les|parmi\s+mes)?\s*(?:anc[êe]tres?|aïeux|aieux|ascendants?)(?![\p{L}])/iu', static function () use (&$crit, &$labels) { $crit['not_ancestors'] = 1; $labels[] = i18n_t('qui ne sont pas des ancêtres'); });
    // « qui ne sont pas nées à Lille », « pas nés en Bretagne », « non mariés à Tours »
    $cut('/(?:(?:qui\s+)?(?:ne|n[\'’])\s*(?:sont|est|[ée]taient|[ée]tait)\s+pas|(?<![\p{L}])pas|(?<![\p{L}])non)\s+' . $evRe . '\s+(?:à|a|en|au|aux|dans\s+l[ea]s?|dans\s+l[\'’])\s*([\p{L}][\p{L}\p{M}\'’-]*(?:[\s-](?:sur|sous|en|de|du|la|le|les|des|lès|lez|\p{Lu}[\p{L}\p{M}\'’-]*))*)/u', static function ($m) use (&$crit, &$labels, $evOf) {
        $crit['not_place'] = trim($m[2]); $crit['not_place_event'] = $evOf($m[1]);
        $labels[] = i18n_t('pas {ev} à {place}', ['ev' => mb_strtolower($m[1]), 'place' => $crit['not_place']]);
    });
    return ['q' => trim((string) preg_replace('/\s+/u', ' ', $q)), 'crit' => $crit, 'labels' => $labels];
}

/** les critères de plus (enregistrés avec la recherche), seulement ceux qui sont donnés */
function qp_criteria(array $c): array
{
    $o = [];
    if (in_array($c['missing'] ?? '', ['death', 'birth', 'marriage'], true)) { $o['missing'] = $c['missing']; }
    foreach (['no_parents', 'no_source', 'no_occupation', 'not_ancestors', 'probably_living'] as $k) { if (!empty($c[$k])) { $o[$k] = 1; } }
    if (trim((string) ($c['not_place'] ?? '')) !== '') { $o['not_place'] = safe_text($c['not_place']); $o['not_place_event'] = in_array($c['not_place_event'] ?? '', ['birth', 'death', 'MARR', 'CHR', 'any'], true) ? $c['not_place_event'] : 'any'; }
    return $o;
}

/** le SQL de ces critères (pour run_saved_search) */
function qp_where(PDO $pdo, array $c): array
{
    $w = []; $p = [];
    $tags = static fn(string $k) => match ($k) { 'birth' => "'BIRT','CHR','BAPM'", 'death' => "'DEAT','BURI'", 'MARR', 'marriage' => "'MARR'", 'CHR' => "'CHR','BAPM'", default => '' };
    $own = "(e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))";
    if (!empty($c['missing'])) { $w[] = "NOT EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE {$own} AND t.gedcom_tag IN (" . $tags($c['missing']) . ") AND e.year IS NOT NULL)"; }
    if (!empty($c['no_parents'])) { $w[] = 'NOT EXISTS(SELECT 1 FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=p.id AND (f.partner1_id IS NOT NULL OR f.partner2_id IS NOT NULL))'; }
    if (!empty($c['no_source'])) { $w[] = "NOT EXISTS(SELECT 1 FROM source_links sl WHERE sl.entity_type='person' AND sl.entity_id=p.id) AND NOT EXISTS(SELECT 1 FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id IN (SELECT id FROM events WHERE person_id=p.id UNION ALL SELECT fe.id FROM families ff JOIN events fe ON fe.family_id=ff.id WHERE ff.partner1_id=p.id OR ff.partner2_id=p.id))"; }
    if (!empty($c['no_occupation'])) { $w[] = "trim(COALESCE(p.occupation,''))='' AND NOT EXISTS(SELECT 1 FROM events oe JOIN event_types ot ON ot.id=oe.event_type_id WHERE oe.person_id=p.id AND ot.gedcom_tag='OCCU')"; }
    if (!empty($c['probably_living'])) { // la règle « probablement vivant » de l'export (api.php, export_person_allowed)
        $w[] = "(p.living_status='living' OR (COALESCE(p.living_status,'') IN ('','unknown') AND NOT EXISTS(SELECT 1 FROM events de JOIN event_types dt ON dt.id=de.event_type_id WHERE de.person_id=p.id AND dt.gedcom_tag IN ('DEAT','BURI'))
            AND (SELECT min(be.year) FROM events be JOIN event_types bt ON bt.id=be.event_type_id WHERE be.person_id=p.id AND bt.gedcom_tag IN ('BIRT','CHR','BAPM')) > " . ((int) date('Y') - 100) . '))'; // un nombre écrit dans le SQL : une année en texte ne se compare pas à un nombre
    }
    if (($c['not_place'] ?? '') !== '') {
        $tg = $tags((string) ($c['not_place_event'] ?? 'any'));
        $w[] = "NOT EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id WHERE {$own}" . ($tg !== '' ? " AND t.gedcom_tag IN ({$tg})" : '') . " AND (pl.name LIKE ? COLLATE NOCASE OR pl.county LIKE ? COLLATE NOCASE OR pl.state LIKE ? COLLATE NOCASE OR pl.country LIKE ? COLLATE NOCASE))";
        array_push($p, $c['not_place'] . '%', $c['not_place'] . '%', $c['not_place'] . '%', $c['not_place']);
    }
    if (!empty($c['not_ancestors'])) {
        $start = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
        $anc = $start ? h_ancestors($pdo, $start, 40) : []; unset($anc[$start]);
        if ($anc) { $w[] = 'p.id NOT IN (' . implode(',', array_map('intval', array_keys($anc))) . ')'; } else { $w[] = '1=1'; }
    }
    return [$w, $p];
}

function qp_labels(array $c): array
{
    $o = [];
    if (!empty($c['missing'])) { $o[] = ['death' => i18n_t('sans date de décès'), 'birth' => i18n_t('sans date de naissance'), 'marriage' => i18n_t('sans date de mariage')][$c['missing']] ?? ''; }
    if (!empty($c['no_parents'])) { $o[] = i18n_t('sans parents connus'); }
    if (!empty($c['no_source'])) { $o[] = i18n_t('sans source'); }
    if (!empty($c['no_occupation'])) { $o[] = i18n_t('sans profession notée'); }
    if (!empty($c['not_ancestors'])) { $o[] = i18n_t('qui ne sont pas des ancêtres'); }
    if (!empty($c['probably_living'])) { $o[] = i18n_t('vivants ou probablement vivants'); }
    if (($c['not_place'] ?? '') !== '') { $o[] = i18n_t('pas à {place}', ['place' => $c['not_place']]); }
    return array_values(array_filter($o));
}

/* ═════════ 4. OU / ET ═════════ */

/** « à Lille ou à Quimper », « laboureurs ou tisserands », « les tisserands et les meuniers », « en 1850 ou 1851 » → les questions, une par terme */
function qp_or_variants(PDO $pdo, string $q): ?array
{
    if (!preg_match('/(?<![\p{L}])(ou|et)(?![\p{L}])/iu', $q)) { return null; }
    $places = qp_places($pdo);
    $occ = []; foreach (QUESTION_OCCUPATIONS as $o) { $occ[q_base($o)] = true; }
    try { foreach ($pdo->query("SELECT DISTINCT lower(trim(occupation)) FROM persons WHERE trim(COALESCE(occupation,''))<>'' LIMIT 3000")->fetchAll(PDO::FETCH_COLUMN) as $o) { $f = preg_split('/[\s,;\/]+/u', (string) $o)[0] ?? ''; if (mb_strlen($f) >= 4) { $occ[q_base($f)] = true; } } } catch (Throwable $_) {}
    $kind = static function (string $s) use ($places, $occ): string {
        if (preg_match('/^\d{4}$/', $s)) { return 'year'; }
        if (isset($places[qp_key($s)])) { return 'place'; }
        if (mb_strlen($s) >= 4 && isset($occ[q_base($s)])) { return 'occ'; }
        return '';
    };
    $word = '[\p{L}\d][\p{L}\p{M}\d\'’-]*';
    $re = '/(' . $word . ')\s+(ou|et)\s+((?:(?:à|a|en|les|des|aux|au)\s+)?)(' . $word . ')/u';
    if (!preg_match_all($re, $q, $all, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) { return null; }
    foreach ($all as $m) {
        [$left, $lo] = $m[1]; [$right] = $m[4]; $conn = mb_strtolower($m[2][0]);
        $k = $kind($left);
        if ($k === '' || $kind($right) !== $k) { continue; }
        $before = mb_strtolower(trim(mb_substr(substr($q, 0, $lo), -8)));
        if (preg_match('/(entre|de)$/u', $before)) { continue; } // « entre 1840 et 1860 », « de 1850 à… »
        $whole = $m[0][0]; $start = $m[0][1];
        $v1 = substr_replace($q, $left, $start, strlen($whole));
        $v2 = substr_replace($q, $right, $start, strlen($whole));
        if ($k === 'place') { $right = $places[qp_key($right)]; }
        return ['variants' => [$v1, $v2], 'kind' => $k, 'terms' => [$left, $right], 'conn' => $conn];
    }
    return null;
}

/** « lieu : Lille » + « lieu : Quimper » → « lieu : Lille ou Quimper » ; « nés en 1850 » + « nés en 1851 » → « nés en 1850 ou 1851 » */
function qp_join_labels(string $a, string $b, string $conn): string
{
    $wa = preg_split('/\s+/u', $a); $wb = preg_split('/\s+/u', $b); $i = 0;
    while ($i < count($wa) - 1 && $i < count($wb) - 1 && $wa[$i] === $wb[$i]) { $i++; }
    return implode(' ', $wa) . ' ' . i18n_t($conn === 'ou' ? 'ou' : 'et') . ' ' . implode(' ', array_slice($wb, $i));
}

/* ═════════ 5. Second essai : le moteur « à la française » ═════════ */

function qp_second(PDO $pdo, string $q): ?array
{
    if (!function_exists('rfr_person_ids')) { return null; }
    $stop = '(?:qui|que|quels?|quelles?|est|sont|[ée]taient|les|des|tous|toutes|liste|montre(?:[- ]moi)?|donne(?:[- ]moi)?|cherche|trouve|combien\s+de|combien\s+d[\'’]|combien|y\s+a[- ]t[- ]il|il\s+y\s+a)';
    $rest = trim((string) preg_replace('/[?!.]+\s*$/u', '', $q));
    $prev = null;
    while ($prev !== $rest) { $prev = $rest; $rest = trim((string) preg_replace('/^' . $stop . '(?![\p{L}])\s*/iu', '', $rest)); }
    if ($rest === '' || mb_strlen($rest) > 80 || count(preg_split('/\s+/u', $rest)) > 5) { return null; }
    $r = rfr_person_ids($pdo, $rest, ['places' => true, 'limit' => 1000, 'kind' => 'human']);
    if (!$r['total']) { return null; }
    $u = [i18n_t('recherche de nom : « {x} »', ['x' => $rest])];
    if (!empty($r['fallback'])) { $u[] = i18n_t('orthographe proche'); }
    $ans = preg_match('/^\s*combien\b/iu', $q) ? ($r['total'] === 1 ? '1 fiche répond à la question.' : $r['total'] . ' fiches répondent à la question.') : '';
    return qm_answer($u, $ans, ['ids' => $r['ids'], 'count' => $r['total']]);
}

/* ═════════ 6. Garde-fou ═════════ */

/**
 * Les mots qui comptent et que rien n'a lus : une année, le mot après « à / en », « pas », « sans », « ou », un nom inconnu.
 * $text = la question telle que lue par les règles (après les réécritures), $r = le résultat de question_to_criteria.
 */
function qp_ignored(PDO $pdo, string $text, array $r): array
{
    $c = $r['criteria'] ?? []; if (!is_array($c)) { return []; }
    $consumed = $r['consumed'] ?? [];
    $t = ' ' . qp_key((string) ($r['text'] ?? $text)) . ' ';
    foreach ($consumed as $w) { $k = qp_key((string) $w); if ($k !== '') { $t = str_replace(' ' . $k . ' ', '  ', $t); } }
    $out = [];
    // une année que ni « entre », « avant », « après », « en », ni le siècle n'ont prise
    preg_match_all('/\b(\d{4})\b/', $t, $ys);
    $yrs = array_filter([$c['year_from'] ?? null, $c['year_to'] ?? null]);
    foreach ($ys[1] as $y) {
        $y = (int) $y; $ok = false;
        foreach ($yrs as $v) { if (abs((int) $v - $y) <= 1) { $ok = true; } }
        if (!$ok) { $out[] = (string) $y; }
    }
    foreach (['pas', 'sans', 'ou', 'ni', 'sauf', 'excepte', 'hormis'] as $w) { if (str_contains($t, " {$w} ")) { $out[] = $w; } }
    // le mot après « à » (un lieu inconnu de la base) quand aucun lieu n'a été pris
    if (($c['place'] ?? '') === '' && preg_match('/(?<![\p{L}])(?:à|a)\s+(\p{L}[\p{L}\p{M}\'’-]{2,})/u', (string) ($r['text'] ?? $text), $m) && !in_array(qp_key($m[1]), ['la', 'le', 'les', 'l', 'leur', 'sa', 'son', 'ses', 'plus', 'moins', 'partir', 'peu', 'cause'], true)
        && !preg_match('/^\d/', $m[1]) && !in_array(qp_key($m[1]), array_map('qp_key', $consumed), true)) { $out[] = 'à ' . $m[1]; }
    return array_values(array_unique($out));
}
