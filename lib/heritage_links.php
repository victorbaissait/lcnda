<?php
declare(strict_types=1);

/**
 * Relier les informations (structure n°11, lib/migrations.php) :
 *  - poser une question en français (« Quels ancêtres étaient boulangers à Lille avant 1850 ? ») → recherche ;
 *  - langues parlées (par une personne et sa descendance) et langues des actes / documents, avec carte ;
 *  - liens « @[Jean Dupont|12] » dans les notes et transcriptions, et rubrique « Cité dans » ;
 *  - citations de sources détaillées et référence rédigée toujours de la même façon ;
 *  - demandes d'entraide prêtes à copier (forum, Geneanet, Facebook).
 */

/* ─── 🔎 Question en français → recherche ────────────────────────────── */

const QUESTION_OCCUPATIONS = ['boulanger', 'meunier', 'tisserand', 'laboureur', 'cultivateur', 'agriculteur', 'journalier', 'manouvrier', 'forgeron', 'marechal', 'menuisier', 'charpentier', 'cordonnier', 'tailleur', 'notaire', 'cure', 'pretre', 'instituteur', 'marin', 'pecheur', 'mineur', 'soldat', 'militaire', 'gendarme', 'couturiere', 'couturier', 'domestique', 'servante', 'vigneron', 'berger', 'marchand', 'negociant', 'aubergiste', 'cabaretier', 'boucher', 'charcutier', 'charron', 'macon', 'sabotier', 'tonnelier', 'fileur', 'fileuse', 'dentelliere', 'brasseur', 'meuniere', 'epicier', 'medecin', 'chirurgien', 'sage-femme', 'nourrice', 'cheminot', 'ouvrier', 'employe', 'commercant', 'proprietaire', 'rentier', 'fermier', 'metayer', 'bucheron', 'charbonnier', 'serrurier', 'horloger', 'orfevre', 'peintre', 'potier', 'tanneur', 'cordier', 'bourrelier', 'tuilier', 'carrier', 'verrier', 'garde', 'facteur', 'douanier', 'maire', 'chapelier', 'drapier', 'mercier', 'teinturier', 'tisserande', 'blanchisseuse', 'lingere', 'repasseuse', 'cuisiniere', 'cuisinier', 'jardinier', 'vacher', 'charretier', 'voiturier', 'roulier', 'batelier', 'matelot', 'capitaine'];

/** Mot au singulier et au masculin (« boulangères » → « boulanger »), pour comparer les métiers. */
function q_base(string $word): string
{
    $w = strtolower(ascii_fold($word));
    $w = preg_replace('/(s|x)$/', '', $w);
    foreach (['ieres' => 'ier', 'iere' => 'ier', 'eres' => 'er', 'ere' => 'er', 'euse' => 'eur', 'trice' => 'teur', 'ienne' => 'ien', 'onne' => 'on'] as $from => $to) {
        if (str_ends_with($w, $from) && strlen($w) > strlen($from) + 2) { return substr($w, 0, -strlen($from)) . $to; }
    }
    return $w;
}

/**
 * Comprend les formules courantes : métier, lieu (à, dans le, en…), avant / après / entre / siècle, prénom, nom,
 * naissance / mariage / décès, « ancêtres », hommes / femmes, « né le même jour que moi ».
 * Renvoie les critères de recherche (comme une recherche enregistrée) et ce qui a été compris.
 */
function question_to_criteria(PDO $pdo, string $question): array
{
    $q = trim(preg_replace('/\s+/u', ' ', $question));
    $t = ' ' . strtolower(ascii_fold($q)) . ' ';
    $c = ['event' => 'any'];
    $understood = [];
    $used = [];

    if (preg_match('/\b(meme jour|meme date|jour de naissance) que (moi|[a-z].*?)(\?|$)/', $t, $m)) {
        $who = trim($m[2]);
        $pid = 0;
        if ($who === 'moi') { $pid = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 ORDER BY id LIMIT 1')->fetchColumn(); }
        else { $pid = question_find_person($pdo, $who); }
        if ($pid) {
            $c['same_birthday'] = $pid;
            $understood[] = 'né le même jour (jour et mois) que ' . question_person_name($pdo, $pid);
            return ['criteria' => saved_search_criteria($c) + ['same_birthday' => $pid], 'understood' => $understood];
        }
        $understood[] = 'personne de référence introuvable (« moi » = la personne de départ de l’arbre)';
    }
    // Parenté d'une personne nommée : « Adrien Paul Baissait a-t-il eu des enfants ? », « les petites-filles de Marie Dupont »
    $rel = question_relation($pdo, $q, $t);
    if ($rel) {
        $c['relation'] = $rel['relation']; $c['relation_of'] = $rel['person'];
        if ($rel['gender']) { $c['gender'] = $rel['gender']; }
        $understood[] = $rel['label'];
        $q = $rel['rest']; $t = ' ' . strtolower(ascii_fold($q)) . ' ';
    }
    if (!$rel && preg_match('/\b(ancetres|aieux|aieules|ascendants|ancetre)\b/', $t)) { $c['ancestors'] = 1; $understood[] = 'parmi les ancêtres de la personne de départ'; }
    if ($rel) { /* le sexe vient du mot de parenté (« fils », « petites-filles ») */ }
    elseif (preg_match('/\b(femmes|filles|aieules|epouses|meres)\b/', $t)) { $c['gender'] = 'female'; $understood[] = 'femmes'; }
    elseif (preg_match('/\b(hommes|garcons|peres|fils)\b/', $t)) { $c['gender'] = 'male'; $understood[] = 'hommes'; }
    if (preg_match('/\b(encore en vie|vivants|vivantes)\b/', $t)) { $c['living'] = 'living'; $understood[] = 'vivants'; }

    $events = ['birth' => '/\b(nee?s?|naissances?|naquit|naquirent|venus? au monde)\b/', 'CHR' => '/\b(baptise(e|s|es)?|baptemes?)\b/', 'MARR' => '/\b(marie(e|s|es)?|mariages?|epouse|ont epouse|se sont maries)\b/',
        'BURI' => '/\b(inhume(e|s|es)?|enterre(e|s|es)?|inhumations?)\b/', 'death' => '/\b(morte?s?|decede(e|s|es)?|deces|meurent|mourut|moururent)\b/', 'RESI' => '/\b(habitai(en)?t|vivai(en)?t|residai(en)?t|domicilie(e|s|es)?|demeurai(en)?t)\b/'];
    foreach ($events as $key => $re) { if (preg_match($re, $t)) { $c['event'] = $key; $understood[] = ['birth' => 'naissance ou baptême', 'CHR' => 'baptême', 'MARR' => 'mariage', 'BURI' => 'inhumation', 'death' => 'décès ou inhumation', 'RESI' => 'résidence'][$key]; break; } }

    // Années et siècles
    $roman = ['xii' => 12, 'xiii' => 13, 'xiv' => 14, 'xv' => 15, 'xvi' => 16, 'xvii' => 17, 'xviii' => 18, 'xix' => 19, 'xx' => 20, 'xxi' => 21];
    if (preg_match('/\bentre (\d{4}) et (\d{4})\b/', $t, $m)) { $c['year_from'] = (int) $m[1]; $c['year_to'] = (int) $m[2]; $understood[] = "entre {$m[1]} et {$m[2]}"; }
    else {
        if (preg_match('/\bavant (?:l\'an )?(\d{4})\b/', $t, $m)) { $c['year_to'] = (int) $m[1] - 1; $understood[] = "avant {$m[1]}"; }
        if (preg_match('/\b(?:apres|depuis) (?:l\'an )?(\d{4})\b/', $t, $m)) { $c['year_from'] = (int) $m[1] + 1; $understood[] = "après {$m[1]}"; }
        if (!isset($c['year_from']) && !isset($c['year_to']) && preg_match('/\ben (\d{4})\b/', $t, $m)) { $c['year_from'] = $c['year_to'] = (int) $m[1]; $understood[] = "en {$m[1]}"; }
        if (preg_match('/\b(?:au|du) (xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx|xxi|\d{2})(?:e|eme|ieme)? siecle\b/', $t, $m)) {
            $n = $roman[$m[1]] ?? (int) $m[1];
            if ($n) { $c['year_from'] = ($n - 1) * 100 + 1; $c['year_to'] = $n * 100; $understood[] = "au {$n}e siècle"; }
        }
    }

    // Lieu : « à Lille », « dans le Nord », « en Bretagne », « au Québec » (un siècle, « au XVIIIe », n'est pas un lieu)
    $qPlace = preg_replace('/\b(?:au|du|aux|des)\s+[XVIL]+\s*(?:e|è|ème|eme)?\s+si[eè]cles?/u', ' ', $q);
    if (preg_match('/(?:^|\s)(?:à|a|dans le|dans la|dans les|dans l[\'’]|en|au|aux|de|du)\s*((?:[A-ZÉÈÀÂÎÔ][\p{L}\'’-]*)(?:[\s-](?:sur|sous|en|de|du|la|le|les|lès|lez|[A-ZÉÈÀÂÎÔ][\p{L}\'’-]*))*)/u', $qPlace, $m)) {
        $place = trim(preg_replace('/\s+(sur|sous|en|de|du|la|le|les)$/u', '', $m[1]));
        $isName = $place !== '' && question_is_name($pdo, $place);
        if ($place !== '' && !$isName && !preg_match('/^(Quels?|Quelles?|Qui|Combien|Où)$/u', $place)) { $c['place'] = $place; $understood[] = "lieu : {$place}"; $used[strtolower(ascii_fold($place))] = true; }
    }

    // Métier
    $known = [];
    foreach (QUESTION_OCCUPATIONS as $o) { $known[q_base($o)] = $o; }
    try {
        foreach ($pdo->query("SELECT DISTINCT lower(trim(occupation)) FROM persons WHERE trim(COALESCE(occupation,''))<>'' LIMIT 3000")->fetchAll(PDO::FETCH_COLUMN) as $o) {
            $first = preg_split('/[\s,;\/]+/u', (string) $o)[0] ?? '';
            if (mb_strlen($first) >= 4) { $known[q_base($first)] = $first; }
        }
    } catch (Throwable $_) {}
    foreach (preg_split('/[^\p{L}-]+/u', $q) as $word) {
        if (mb_strlen($word) < 4) { continue; }
        $b = q_base($word);
        if (isset($known[$b])) { $stem = strlen($b) > 6 ? substr($b, 0, -2) : $b; $c['occupation'] = $stem; $understood[] = 'métier : ' . $known[$b]; break; }
    }

    // Prénoms et noms de famille présents dans la base (« les Dupont », « prénommés Gaston »)
    if (preg_match('/(?:prenomme(?:e|s|es)?|s\'appel(?:le|lent|ait|aient)|nomme(?:e|s|es)?) ([a-z-]+)/', $t, $m)) { $c['first_name'] = ucfirst($m[1]); $understood[] = 'prénom : ' . ucfirst($m[1]); }
    foreach (preg_split('/[^\p{L}\'’-]+/u', $q) as $i => $word) {
        if ($i === 0 || mb_strlen($word) < 3 || !preg_match('/^\p{Lu}/u', $word) || isset($used[strtolower(ascii_fold($word))])) { continue; }
        if (!isset($c['last_name'])) {
            $s = $pdo->prepare('SELECT 1 FROM persons WHERE last_name=? COLLATE NOCASE LIMIT 1'); $s->execute([$word]);
            if ($s->fetchColumn()) { $c['last_name'] = $word; $c['name_mode'] = 'exact'; $understood[] = "nom : {$word}"; continue; }
        }
        if (!isset($c['first_name'])) {
            $s = $pdo->prepare("SELECT 1 FROM persons WHERE (' '||first_name||' ') LIKE ? COLLATE NOCASE LIMIT 1"); $s->execute(['% ' . $word . ' %']);
            if ($s->fetchColumn()) { $c['first_name'] = $word; $understood[] = "prénom : {$word}"; }
        }
    }
    if (count($understood) === 0) { throw new RuntimeException('Je n’ai pas compris la question. Exemples : « Quels ancêtres étaient boulangers à Lille avant 1850 ? », « Qui est né le même jour que moi ? », « les Dupont mariés dans le Nord au XVIIIe siècle ».'); }
    $criteria = saved_search_criteria($c);
    if (!empty($c['ancestors'])) { $criteria['ancestors'] = 1; }
    return ['criteria' => $criteria, 'understood' => $understood, 'relation' => $rel];
}

/** Mots de parenté (sans accents, en minuscules) → lien, sexe éventuel, [singulier, pluriel] à afficher. Les plus longs d'abord. */
const QUESTION_RELATIONS = [
    'arriere[- ]petits?[- ]enfants?' => ['great_grandchildren', '', ['arrière-petit-enfant', 'arrière-petits-enfants']],
    'arriere[- ]petits?[- ]fils' => ['great_grandchildren', 'male', ['arrière-petit-fils', 'arrière-petits-fils']],
    'arriere[- ]petites?[- ]filles?' => ['great_grandchildren', 'female', ['arrière-petite-fille', 'arrière-petites-filles']],
    'petits?[- ]enfants?' => ['grandchildren', '', ['petit-enfant', 'petits-enfants']],
    'petits?[- ]fils' => ['grandchildren', 'male', ['petit-fils', 'petits-fils']],
    'petites?[- ]filles?' => ['grandchildren', 'female', ['petite-fille', 'petites-filles']],
    'grands?[- ]parents?' => ['grandparents', '', ['grand-parent', 'grands-parents']],
    'grands?[- ]peres?' => ['grandparents', 'male', ['grand-père', 'grands-pères']],
    'grands?[- ]meres?' => ['grandparents', 'female', ['grand-mère', 'grands-mères']],
    'descendants?|descendance|posterite' => ['descendants', '', ['descendant', 'descendants']],
    'ancetres?|ascendants?|ascendance|aieux' => ['ancestors_of', '', ['ancêtre', 'ancêtres']],
    'enfants?|progeniture' => ['children', '', ['enfant', 'enfants']],
    'fils' => ['children', 'male', ['fils', 'fils']],
    'filles?' => ['children', 'female', ['fille', 'filles']],
    'parents' => ['parents', '', ['parent', 'parents']],
    'peres?' => ['parents', 'male', ['père', 'pères']],
    'meres?' => ['parents', 'female', ['mère', 'mères']],
    'freres? et soeurs?|fratrie' => ['siblings', '', ['frère ou sœur', 'frères et sœurs']],
    'freres?|demi-freres?' => ['siblings', 'male', ['frère', 'frères']],
    'soeurs?|demi-soeurs?' => ['siblings', 'female', ['sœur', 'sœurs']],
    'conjoints?|epoux|maris?|epouses?|femme' => ['spouses', '', ['conjoint', 'conjoints']],
];

/**
 * Une question sur les proches d'une personne nommée ? On cherche d'abord la personne (les mots en majuscule qui
 * forment un prénom + un nom de la base), puis un mot de parenté. Rend null si ce n'est pas ce genre de question.
 */
function question_relation(PDO $pdo, string $q, string $t): ?array
{
    $found = null;
    foreach (QUESTION_RELATIONS as $re => [$relation, $gender, $labels]) {
        if (preg_match('/(?<![a-z-])(' . $re . ')(?![a-z-])/', $t, $m)) { $found = [$relation, $gender, $labels]; break; }
    }
    if (!$found) { return null; }
    // Suites de mots en majuscule (« Adrien Paul Baissait », « Marie-Thérèse de La Fontaine »)
    $stop = ['Est-ce', 'Est', 'Qui', 'Quel', 'Quels', 'Quelle', 'Quelles', 'Combien', 'Les', 'Le', 'La', 'Des', 'Donne', 'Montre', 'Liste', 'Cherche', 'Trouve', 'Y', 'A', 'À', 'Et', 'Ou', 'Il', 'Elle', 'Ils', 'Elles', 'Mes', 'Ses', 'Leurs', 'Tous', 'Toutes'];
    preg_match_all('/(?:\p{Lu}[\p{L}\'’-]*)(?:\s+(?:(?:de|du|des|d[\'’]|la|le|van|von|di|da)\s+)?\p{Lu}[\p{L}\'’-]*)*/u', $q, $mm);
    $best = 0; $bestText = '';
    foreach ($mm[0] as $chunk) {
        $words = array_values(array_filter(preg_split('/\s+/u', $chunk), static fn($w) => !in_array($w, $stop, true)));
        if (count($words) < 2) { continue; }
        // du plus long au plus court : « Adrien Paul Baissait », puis « Adrien Baissait »…
        for ($drop = 0; $drop <= count($words) - 2 && !$best; $drop++) {
            $try = $drop ? array_merge(array_slice($words, 0, count($words) - 1 - $drop), [end($words)]) : $words;
            $id = question_find_person($pdo, implode(' ', $try));
            if ($id) { $best = $id; $bestText = implode(' ', $words); }
        }
        if ($best) { break; }
    }
    if (!$best) { return null; }
    [$relation, $gender, $labels] = $found;
    $name = question_person_name($pdo, $best);
    $life = person_life_years($pdo, $best);
    return ['relation' => $relation, 'person' => $best, 'gender' => $gender, 'labels' => $labels,
        'label' => $labels[1] . ' de ' . $name . ($life !== '' ? " ({$life})" : ''), 'name' => $name,
        'yesno' => (bool) preg_match('/\b(a-t-(il|elle)|ont-(ils|elles)|avait-(il|elle)|est-ce qu|y a-t-il|a t il|a t elle)\b|\?\s*$/u', mb_strtolower($q)) && !preg_match('/\b(qui|quels?|quelles?|combien|liste|donne|montre)\b/u', mb_strtolower($q)),
        'rest' => trim(str_replace($bestText, ' ', $q))];
}

/** « 1850-1921 » à partir des événements de naissance et de décès (ou vide). */
function person_life_years(PDO $pdo, int $id): string
{
    $s = $pdo->prepare("SELECT (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')),
        (SELECT min(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI')) FROM persons p WHERE p.id=?");
    $s->execute([$id]);
    [$b, $d] = $s->fetch(PDO::FETCH_NUM) ?: [null, null];
    return ($b || $d) ? ($b ?: '?') . '-' . ($d ?: '') : '';
}

function question_find_person(PDO $pdo, string $text): int
{
    $parts = preg_split('/\s+/', trim($text));
    $s = $pdo->prepare("SELECT id FROM persons WHERE lower(first_name||' '||last_name) LIKE ? ORDER BY id LIMIT 1");
    $s->execute(['%' . implode('%', $parts) . '%']);
    return (int) $s->fetchColumn();
}

function question_person_name(PDO $pdo, int $id): string
{
    $s = $pdo->prepare("SELECT trim(first_name||' '||last_name) FROM persons WHERE id=?"); $s->execute([$id]);
    return (string) $s->fetchColumn() ?: '#' . $id;
}

function question_is_name(PDO $pdo, string $word): bool
{
    $s = $pdo->prepare("SELECT 1 FROM persons WHERE last_name=? COLLATE NOCASE OR (' '||first_name||' ') LIKE ? COLLATE NOCASE LIMIT 1");
    $s->execute([$word, '% ' . $word . ' %']);
    if (!$s->fetchColumn()) { return false; }
    $p = $pdo->prepare('SELECT 1 FROM places WHERE name=? COLLATE NOCASE OR county=? COLLATE NOCASE OR state=? COLLATE NOCASE LIMIT 1');
    $p->execute([$word, $word, $word]);
    return !$p->fetchColumn();
}

/** Personnes nées le même jour et le même mois qu'une autre (toutes années confondues). */
function same_birthday_ids(PDO $pdo, int $personId): array
{
    $rows = $pdo->query("SELECT e.person_id, e.date_text, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.person_id IS NOT NULL ORDER BY t.gedcom_tag='BIRT' DESC")->fetchAll();
    $md = [];
    foreach ($rows as $r) { $d = exact_date((string) $r['date_text']); if ($d && !isset($md[(int) $r['person_id']])) { $md[(int) $r['person_id']] = substr($d, 5); } }
    $target = $md[$personId] ?? null;
    if (!$target) { throw new RuntimeException('La date de naissance exacte de ' . question_person_name($pdo, $personId) . ' n’est pas connue.'); }
    return array_values(array_keys(array_filter($md, static fn($v, $id) => $v === $target && $id !== $personId, ARRAY_FILTER_USE_BOTH)));
}

function ask_question(PDO $pdo, string $question): array
{
    $r = question_to_criteria($pdo, $question);
    $ids = !empty($r['criteria']['same_birthday']) ? same_birthday_ids($pdo, (int) $r['criteria']['same_birthday']) : run_saved_search($pdo, $r['criteria']);
    $people = collection_people($pdo, array_slice($ids, 0, 1000));
    $answer = '';
    if ($rel = $r['relation'] ?? null) { // une phrase de réponse : « Oui, 2 enfants. »
        [$one, $many] = $rel['labels'];
        $n = count($ids);
        $what = $n === 1 ? "1 {$one}" : "{$n} {$many}";
        $none = $rel['gender'] === 'female' ? 'aucune' : 'aucun';
        if ($rel['yesno']) { $answer = $n ? "Oui, {$what}." : "Non : {$none} {$one} n’est connu" . ($none === 'aucune' ? 'e' : '') . " dans l’arbre pour {$rel['name']}."; }
        else { $answer = $n ? "{$rel['name']} : {$what}." : ucfirst($none) . " {$one} n’est connu" . ($none === 'aucune' ? 'e' : '') . " dans l’arbre pour {$rel['name']}."; }
    }
    return ['understood' => $r['understood'], 'answer' => $answer, 'criteria' => $r['criteria'], 'count' => count($ids), 'people' => array_values(array_filter(array_map(static fn($id) => $people[$id] ?? null, $ids)))];
}

/* ─── 🗣️ Langues ─────────────────────────────────────────────────────── */

const LANGUAGES = ['français', 'latin', 'flamand', 'néerlandais', 'picard', 'wallon', 'breton', 'gallo', 'normand', 'occitan', 'gascon', 'provençal', 'limousin', 'auvergnat', 'languedocien', 'franco-provençal', 'savoyard', 'basque', 'catalan', 'corse', 'alsacien', 'francique lorrain', 'allemand', 'luxembourgeois', 'italien', 'piémontais', 'espagnol', 'portugais', 'anglais', 'irlandais', 'yiddish', 'hébreu', 'polonais', 'russe', 'arménien', 'grec', 'arabe', 'kabyle', 'turc', 'créole', 'vietnamien'];
const LANGUAGE_CERTAINTY = ['certain' => 'certain', 'probable' => 'probable', 'doute' => 'à vérifier (doute)'];

function lang_clean(string $l): string { return mb_strtolower(trim(preg_replace('/\s+/u', ' ', $l))); }

/** Langues propres à une personne, et celles qu'elle tient d'un ancêtre (sauf si elle le refuse explicitement). */
function person_languages_resolved(PDO $pdo, int $personId): array
{
    $own = $pdo->prepare('SELECT * FROM person_languages WHERE person_id=? ORDER BY id'); $own->execute([$personId]);
    $ownRows = $own->fetchAll();
    $flag = $pdo->prepare('SELECT no_inherited_language FROM persons WHERE id=?'); $flag->execute([$personId]);
    $noInherit = (int) $flag->fetchColumn();
    $inherited = [];
    if (!$noInherit) {
        $level = [$personId]; $seen = [$personId => true]; $depth = 0;
        while ($level && $depth < 15) {
            $next = [];
            foreach ($level as $pid) {
                foreach (h_parents($pdo, $pid) as $parent) {
                    if (isset($seen[$parent])) { continue; }
                    $seen[$parent] = true;
                    $s = $pdo->prepare("SELECT l.*, trim(p.first_name||' '||p.last_name) AS from_name FROM person_languages l JOIN persons p ON p.id=l.person_id WHERE l.person_id=? AND l.to_descendants=1");
                    $s->execute([$parent]);
                    $found = $s->fetchAll();
                    foreach ($found as $f) { $inherited[lang_clean($f['language'])] ??= $f + ['generations' => $depth + 1]; }
                    $blocked = (int) $pdo->query('SELECT no_inherited_language FROM persons WHERE id=' . (int) $parent)->fetchColumn();
                    if (!$found && !$blocked) { $next[] = $parent; }
                }
            }
            $level = $next; $depth++;
        }
    }
    foreach ($ownRows as $o) { unset($inherited[lang_clean($o['language'])]); }
    return ['own' => $ownRows, 'inherited' => array_values($inherited), 'no_inherited' => $noInherit];
}

function save_person_language(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0);
    h_person_exists($pdo, $personId);
    $lang = lang_clean(safe_text($data['language'] ?? ''));
    if ($lang === '') { throw new RuntimeException('Indique la langue.'); }
    $certainty = array_key_exists((string) ($data['certainty'] ?? ''), LANGUAGE_CERTAINTY) ? (string) $data['certainty'] : 'certain';
    $fields = [$personId, $lang, $certainty, !isset($data['to_descendants']) || !empty($data['to_descendants']) ? 1 : 0, h_long($data, 'note', 2000)];
    if ($id) { $pdo->prepare('UPDATE person_languages SET person_id=?, language=?, certainty=?, to_descendants=?, note=? WHERE id=?')->execute([...$fields, $id]); }
    else { $pdo->prepare('INSERT INTO person_languages(person_id, language, certainty, to_descendants, note) VALUES(?,?,?,?,?)')->execute($fields); $id = (int) $pdo->lastInsertId(); }
    log_change($pdo, 'person', $personId, 'update', 'Langue parlée : ' . $lang);
    return ['id' => $id];
}

function delete_person_language(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM person_languages WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

function set_no_inherited_language(PDO $pdo, array $data): array
{
    $pdo->prepare('UPDATE persons SET no_inherited_language=? WHERE id=?')->execute([!empty($data['value']) ? 1 : 0, safe_int($data['person_id'] ?? 0)]);
    return ['ok' => true];
}

/** Langues d'un acte (événement) ou d'un document (média) : la liste envoyée remplace l'ancienne. */
function save_record_languages(PDO $pdo, array $data): array
{
    $type = ($data['entity_type'] ?? '') === 'media' ? 'media' : 'event';
    $id = safe_int($data['entity_id'] ?? 0);
    if (!$id) { throw new RuntimeException('Acte ou document manquant'); }
    $pdo->prepare('DELETE FROM record_languages WHERE entity_type=? AND entity_id=?')->execute([$type, $id]);
    $ins = $pdo->prepare('INSERT OR IGNORE INTO record_languages(entity_type, entity_id, language, certainty) VALUES(?,?,?,?)');
    foreach (is_array($data['languages'] ?? null) ? $data['languages'] : [] as $l) {
        $lang = lang_clean(safe_text(is_array($l) ? ($l['language'] ?? '') : $l));
        if ($lang === '') { continue; }
        $cert = is_array($l) && array_key_exists((string) ($l['certainty'] ?? ''), LANGUAGE_CERTAINTY) ? (string) $l['certainty'] : 'certain';
        $ins->execute([$type, $id, $lang, $cert]);
    }
    return ['ok' => true, 'languages' => record_languages_for($pdo, $type, [$id])[$id] ?? []];
}

function record_languages_for(PDO $pdo, string $type, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return []; }
    $s = $pdo->prepare('SELECT entity_id, language, certainty FROM record_languages WHERE entity_type=? AND entity_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY id');
    $s->execute([$type, ...$ids]);
    $out = [];
    foreach ($s->fetchAll() as $r) { $out[(int) $r['entity_id']][] = ['language' => $r['language'], 'certainty' => $r['certainty']]; }
    return $out;
}

/**
 * Vue d'ensemble : chaque langue, les personnes qui la parlaient (déclarées ou par héritage) et leur lieu de naissance
 * (pour la carte), puis les actes et documents par langue.
 */
function languages_overview(PDO $pdo): array
{
    $declared = $pdo->query("SELECT l.*, trim(p.first_name||' '||p.last_name) AS person_name FROM person_languages l JOIN persons p ON p.id=l.person_id ORDER BY l.language")->fetchAll();
    $speakers = [];
    $blocked = array_fill_keys(array_map('intval', $pdo->query('SELECT id FROM persons WHERE no_inherited_language=1')->fetchAll(PDO::FETCH_COLUMN)), true);
    $own = [];
    foreach ($declared as $d) { if ((int) $d['to_descendants']) { $own[(int) $d['person_id']][lang_clean($d['language'])] = true; } }
    foreach ($declared as $d) {
        $lang = lang_clean($d['language']);
        $speakers[$lang][(int) $d['person_id']] = ['how' => 'déclaré', 'certainty' => $d['certainty']];
        if (!(int) $d['to_descendants']) { continue; }
        $level = [(int) $d['person_id']]; $depth = 0;
        while ($level && $depth < 15) {
            $next = [];
            foreach (h_children($pdo, $level) as $child) {
                if (isset($speakers[$lang][$child]) || isset($blocked[$child])) { continue; }
                $speakers[$lang][$child] = ['how' => 'hérité de ' . $d['person_name'], 'certainty' => $d['certainty']];
                if (empty($own[$child])) { $next[] = $child; }
            }
            $level = $next; $depth++;
        }
    }
    $allIds = [];
    foreach ($speakers as $list) { $allIds = [...$allIds, ...array_keys($list)]; }
    $allIds = array_values(array_unique($allIds));
    $places = [];
    foreach (array_chunk($allIds, 400) as $chunk) {
        $marks = implode(',', array_fill(0, count($chunk), '?'));
        $s = $pdo->prepare("SELECT e.person_id, pl.name, pl.latitude, pl.longitude FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN places pl ON pl.id=e.place_id
            WHERE e.person_id IN ($marks) AND t.gedcom_tag IN ('BIRT','CHR','BAPM','RESI') AND pl.latitude IS NOT NULL ORDER BY t.gedcom_tag='BIRT' DESC, t.gedcom_tag='CHR' DESC");
        $s->execute($chunk);
        foreach ($s->fetchAll() as $r) { $places[(int) $r['person_id']] ??= ['place' => $r['name'], 'lat' => (float) $r['latitude'], 'lon' => (float) $r['longitude']]; }
    }
    $people = collection_people($pdo, $allIds);
    $langs = [];
    foreach ($speakers as $lang => $list) {
        $rows = [];
        foreach ($list as $pid => $info) { if (isset($people[$pid])) { $rows[] = ['person' => $people[$pid]] + $info + ['place' => $places[$pid] ?? null]; } }
        $langs[] = ['language' => $lang, 'people' => $rows, 'declared' => count(array_filter($rows, static fn($r) => $r['how'] === 'déclaré'))];
    }
    usort($langs, static fn($a, $b) => count($b['people']) <=> count($a['people']));
    $records = $pdo->query("SELECT rl.*, CASE WHEN rl.entity_type='event' THEN (SELECT t.label||' — '||COALESCE(e.date_text,'')||' — '||COALESCE((SELECT trim(p.first_name||' '||p.last_name) FROM persons p WHERE p.id=e.person_id),'') FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.id=rl.entity_id)
        ELSE (SELECT title FROM media WHERE id=rl.entity_id) END AS label,
        CASE WHEN rl.entity_type='event' THEN (SELECT person_id FROM events WHERE id=rl.entity_id) END AS person_id FROM record_languages rl ORDER BY rl.language, rl.entity_type")->fetchAll();
    return ['languages' => $langs, 'records' => $records, 'catalog' => LANGUAGES, 'certainties' => LANGUAGE_CERTAINTY];
}

/* ─── 🔗 Liens « @Jean Dupont » et rubrique « Cité dans » ─────────────── */

/** Tous les textes qui citent cette fiche par un lien « @[Nom|id] ». */
function person_mentions(PDO $pdo, int $personId): array
{
    $needle = '%|' . $personId . ']%';
    $out = [];
    $snip = static function (string $text) use ($personId): string {
        $pos = strpos($text, '|' . $personId . ']');
        $start = max(0, (int) $pos - 90);
        return ($start ? '… ' : '') . trim(mb_strcut($text, $start, 220)) . ' …';
    };
    $s = $pdo->prepare("SELECT n.id, n.entity_type, n.entity_id, n.title, n.body FROM notes n WHERE n.body LIKE ? OR n.title LIKE ?"); $s->execute([$needle, $needle]);
    foreach ($s->fetchAll() as $r) {
        $owner = $r['entity_type'] === 'person' ? (int) $r['entity_id'] : ($r['entity_type'] === 'event' ? (int) $pdo->query('SELECT person_id FROM events WHERE id=' . (int) $r['entity_id'])->fetchColumn() : 0);
        if ($owner === $personId) { continue; }
        $out[] = ['kind' => 'note', 'label' => 'Note' . ($r['title'] ? ' « ' . $r['title'] . ' »' : '') . ($owner ? ' de ' . question_person_name($pdo, $owner) : ''), 'person_id' => $owner ?: null, 'snippet' => $snip((string) $r['body'])];
    }
    $s = $pdo->prepare('SELECT id, title, transcription FROM media WHERE transcription LIKE ?'); $s->execute([$needle]);
    foreach ($s->fetchAll() as $r) { $out[] = ['kind' => 'transcription', 'label' => 'Transcription « ' . ($r['title'] ?: '#' . $r['id']) . ' »', 'media_id' => (int) $r['id'], 'snippet' => $snip((string) $r['transcription'])]; }
    $s = $pdo->prepare("SELECT e.id, e.person_id, e.description, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.description LIKE ? AND COALESCE(e.person_id,0)<>?"); $s->execute([$needle, $personId]);
    foreach ($s->fetchAll() as $r) { $out[] = ['kind' => 'event', 'label' => $r['label'] . ($r['person_id'] ? ' de ' . question_person_name($pdo, (int) $r['person_id']) : ''), 'person_id' => $r['person_id'] ? (int) $r['person_id'] : null, 'snippet' => $snip((string) $r['description'])]; }
    $s = $pdo->prepare("SELECT id, title, person_id, question, known_facts, documents FROM investigations WHERE question LIKE ? OR known_facts LIKE ? OR documents LIKE ?"); $s->execute([$needle, $needle, $needle]);
    foreach ($s->fetchAll() as $r) { $out[] = ['kind' => 'investigation', 'label' => 'Enquête « ' . $r['title'] . ' »', 'investigation_id' => (int) $r['id'], 'snippet' => $snip($r['question'] . ' ' . $r['known_facts'] . ' ' . $r['documents'])]; }
    $s = $pdo->prepare("SELECT id, title, notes FROM investigation_items WHERE notes LIKE ?"); $s->execute([$needle]);
    foreach ($s->fetchAll() as $r) { $out[] = ['kind' => 'investigation', 'label' => 'Piste d’enquête « ' . $r['title'] . ' »', 'snippet' => $snip((string) $r['notes'])]; }
    return $out;
}

/* ─── 📚 Citations de sources détaillées ─────────────────────────────── */

const CITATION_FIELDS = ['archive', 'commune', 'register', 'years', 'cote', 'view', 'view_total', 'act', 'view_url'];

function citation_from(array $data): array
{
    $c = [];
    foreach (CITATION_FIELDS as $f) { $v = safe_text($data['citation_' . $f] ?? ''); if ($v !== '') { $c[$f] = $v; } }
    if (isset($c['view_url']) && !preg_match('#^https?://#i', $c['view_url'])) { unset($c['view_url']); }
    return $c;
}

/** « AD Nord, Halluin, naissances 1802-1812, 3 E 12345, vue 87/240, acte n° 45 » : toujours le même ordre. */
function citation_reference(array $c): string
{
    $parts = [];
    foreach (['archive', 'commune'] as $f) { if (!empty($c[$f])) { $parts[] = $c[$f]; } }
    $reg = trim(($c['register'] ?? '') . ' ' . ($c['years'] ?? ''));
    if ($reg !== '') { $parts[] = $reg; }
    if (!empty($c['cote'])) { $parts[] = $c['cote']; }
    if (!empty($c['view'])) { $parts[] = 'vue ' . $c['view'] . (!empty($c['view_total']) ? '/' . $c['view_total'] : ''); }
    if (!empty($c['act'])) { $parts[] = 'acte n° ' . preg_replace('/^(n°|no|n)\s*/i', '', $c['act']); }
    return implode(', ', $parts);
}

/** Après l'ajout ou la modification d'une citation : référence rédigée dans « page », détail gardé à part. */
function store_citation(PDO $pdo, int $linkId, array $data): void
{
    $c = citation_from($data);
    if (!$linkId) { return; }
    if (!$c) { $pdo->prepare("UPDATE source_links SET citation_json='' WHERE id=?")->execute([$linkId]); return; }
    $ref = citation_reference($c);
    $page = safe_text($data['page'] ?? '');
    $prev = $pdo->prepare('SELECT citation_json FROM source_links WHERE id=?'); $prev->execute([$linkId]);
    $old = json_decode((string) $prev->fetchColumn(), true);
    $oldRef = is_array($old) ? citation_reference($old) : '';
    $pdo->prepare('UPDATE source_links SET citation_json=?, page=? WHERE id=?')->execute([json_encode($c, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ($page === '' || $page === $oldRef) ? $ref : $page, $linkId]);
}

/* ─── 🤝 Demandes d'entraide ──────────────────────────────────────────── */

const HELP_TARGETS = ['parents' => 'ses parents', 'birth' => 'sa naissance (date et lieu)', 'baptism' => 'son baptême', 'marriage' => 'son mariage', 'death' => 'son décès (date et lieu)', 'origin' => 'son origine (d’où venait la famille)', 'other' => 'autre chose'];
/** Même chose, dans une phrase : « Je cherche les parents de Jean Dupont ». */
const HELP_TARGETS_SENTENCE = ['parents' => 'les parents', 'birth' => 'la naissance (date et lieu)', 'baptism' => 'le baptême', 'marriage' => 'le mariage', 'death' => 'le décès (date et lieu)', 'origin' => 'l’origine de la famille', 'other' => 'des informations sur'];
const HELP_STATUSES = ['draft' => 'Brouillon', 'posted' => 'Publiée', 'answered' => 'Réponse reçue', 'solved' => 'Résolue', 'abandoned' => 'Abandonnée'];

/** Ce qu'on sait (avec les sources), ce qu'on cherche, ce qui a été essayé : de quoi rédiger le message. */
function help_request_facts(PDO $pdo, int $personId): array
{
    $p = collection_people($pdo, [$personId])[$personId] ?? null;
    if (!$p) { throw new RuntimeException('Personne introuvable'); }
    $ev = $pdo->prepare("SELECT e.id, e.date_text, e.year, t.label, t.gedcom_tag, pl.name AS place, pl.county, pl.country,
            (SELECT group_concat(s.title || CASE WHEN COALESCE(sl.page,'')<>'' THEN ' (' || sl.page || ')' ELSE '' END, ' ; ') FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE sl.entity_type='event' AND sl.entity_id=e.id) AS sources
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?) ORDER BY COALESCE(e.year, 9999), e.id");
    $ev->execute([$personId, $personId, $personId]);
    $events = $ev->fetchAll();
    $rel = static function (array $ids) use ($pdo): array { return array_values(collection_people($pdo, $ids)); };
    $parents = $rel(h_parents($pdo, $personId));
    $sp = $pdo->prepare('SELECT CASE WHEN partner1_id=? THEN partner2_id ELSE partner1_id END FROM families WHERE (partner1_id=? OR partner2_id=?)'); $sp->execute([$personId, $personId, $personId]);
    $spouses = $rel(array_filter(array_map('intval', $sp->fetchAll(PDO::FETCH_COLUMN))));
    $children = $rel(h_children($pdo, [$personId]));
    $inv = $pdo->prepare("SELECT i.*, (SELECT group_concat(it.title || CASE WHEN COALESCE(it.notes,'')<>'' THEN ' : ' || it.notes ELSE '' END, '\n') FROM investigation_items it WHERE it.investigation_id=i.id) AS items
        FROM investigations i WHERE i.person_id=? OR i.id IN (SELECT investigation_id FROM investigation_persons WHERE person_id=?) ORDER BY i.updated_at DESC");
    try { $inv->execute([$personId, $personId]); $investigations = $inv->fetchAll(); }
    catch (Throwable $_) { $inv = $pdo->prepare('SELECT i.*, NULL AS items FROM investigations i WHERE i.person_id=?'); $inv->execute([$personId]); $investigations = $inv->fetchAll(); }
    $ps = $pdo->prepare("SELECT s.title, sl.page FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE sl.entity_type='person' AND sl.entity_id=?"); $ps->execute([$personId]);
    return ['person' => $p, 'events' => $events, 'parents' => $parents, 'spouses' => $spouses, 'children' => $children, 'investigations' => $investigations, 'person_sources' => $ps->fetchAll()];
}

/** Message prêt à copier : forum (long), Geneanet (moyen), Facebook (court). */
function help_request_message(PDO $pdo, int $personId, string $target, string $question, string $format): string
{
    $f = help_request_facts($pdo, $personId);
    $name = static fn(array $p): string => trim(($p['first_name'] ?? '') . ' ' . ($p['last_name'] ?? ''));
    $years = static fn(array $p): string => ($p['birth_year'] || $p['death_year']) ? ' (' . ($p['birth_year'] ?: '?') . '-' . ($p['death_year'] ?: '?') . ')' : '';
    $who = $name($f['person']) . $years($f['person']);
    $places = array_values(array_unique(array_filter(array_map(static fn($e) => $e['place'] ? $e['place'] . ($e['county'] ? ' (' . $e['county'] . ')' : '') : '', $f['events']))));
    $what = HELP_TARGETS_SENTENCE[$target] ?? 'des informations sur';
    $want = $question !== '' ? $question : 'Je cherche ' . $what . (str_ends_with($what, ' sur') ? ' ' : ' de ') . $name($f['person']) . '.';
    $known = [];
    foreach ($f['events'] as $e) {
        $line = $e['label'] . ' : ' . trim(($e['date_text'] ?: ($e['year'] ?: 'date inconnue')) . ($e['place'] ? ' à ' . $e['place'] . ($e['county'] ? ' (' . $e['county'] . ')' : '') : ''));
        if ($format !== 'facebook' && $e['sources']) { $line .= ' — source : ' . $e['sources']; }
        $known[] = $line;
    }
    foreach ([['Parents', $f['parents']], ['Conjoint(s)', $f['spouses']], ['Enfants', $f['children']]] as [$label, $list]) {
        if ($list) { $known[] = $label . ' : ' . implode(', ', array_map(static fn($p) => $name($p) . $years($p), array_slice($list, 0, 8))); }
    }
    if ($format !== 'facebook') { foreach ($f['person_sources'] as $s) { $known[] = 'Source : ' . $s['title'] . ($s['page'] ? ' (' . $s['page'] . ')' : ''); } }
    $tried = [];
    foreach ($f['investigations'] as $i) {
        if ($i['documents']) { $tried[] = trim((string) $i['documents']); }
        foreach (array_filter(explode("\n", (string) $i['items'])) as $it) { $tried[] = $it; }
    }
    $tried = array_values(array_unique(array_filter(array_map('trim', $tried))));
    $title = ($format === 'facebook' ? '🔎 ' : '') . 'Recherche : ' . rtrim(str_replace(' sur', '', $what)) . ' — ' . $who . ($places ? ' — ' . $places[0] : '');
    $bullet = $format === 'facebook' ? '• ' : '- ';
    $out = [$title, ''];
    $out[] = 'Bonjour à toutes et à tous,';
    $out[] = '';
    $out[] = $want;
    $out[] = '';
    $out[] = $format === 'facebook' ? '📌 Ce que je sais :' : 'Ce que je sais :';
    foreach (array_slice($known, 0, $format === 'facebook' ? 8 : 40) as $k) { $out[] = $bullet . $k; }
    if ($tried) {
        $out[] = '';
        $out[] = $format === 'facebook' ? '✅ Déjà consulté :' : 'Ce que j’ai déjà consulté ou essayé :';
        foreach (array_slice($tried, 0, $format === 'facebook' ? 6 : 30) as $t) { $out[] = $bullet . preg_replace('/\s+/u', ' ', $t); }
    }
    $out[] = '';
    $out[] = $format === 'facebook' ? '🙏 Merci d’avance pour vos pistes !' : 'Toute piste (registre, cote, commune voisine, relevé) sera la bienvenue. Merci d’avance pour votre aide !';
    return implode("\n", $out);
}

function help_requests_data(PDO $pdo, string $status = 'open'): array
{
    $where = match ($status) { 'closed' => "WHERE h.status IN ('solved','abandoned')", 'all' => '', default => "WHERE h.status NOT IN ('solved','abandoned')" };
    $rows = $pdo->query("SELECT h.*, trim(p.first_name||' '||p.last_name) AS person_name FROM help_requests h LEFT JOIN persons p ON p.id=h.person_id {$where} ORDER BY h.updated_at DESC")->fetchAll();
    $counts = $pdo->query("SELECT sum(CASE WHEN status IN ('solved','abandoned') THEN 0 ELSE 1 END) AS open, sum(CASE WHEN status IN ('solved','abandoned') THEN 1 ELSE 0 END) AS closed FROM help_requests")->fetch();
    return ['requests' => with_labels($pdo, 'help_request', $rows), 'counts' => ['open' => (int) ($counts['open'] ?? 0), 'closed' => (int) ($counts['closed'] ?? 0)], 'targets' => HELP_TARGETS, 'statuses' => HELP_STATUSES];
}

function save_help_request(PDO $pdo, array $data): array
{
    $id = safe_int($data['id'] ?? 0);
    $personId = safe_int($data['person_id'] ?? 0) ?: null;
    $target = array_key_exists((string) ($data['target'] ?? ''), HELP_TARGETS) ? (string) $data['target'] : 'other';
    $status = array_key_exists((string) ($data['status'] ?? ''), HELP_STATUSES) ? (string) $data['status'] : 'draft';
    $url = safe_text($data['posted_url'] ?? '');
    if ($url !== '' && !preg_match('#^https?://#i', $url)) { $url = ''; }
    $fields = [$personId, $target, h_long($data, 'question', 4000), h_long($data, 'message', 40000), $status, safe_text($data['posted_where'] ?? ''), $url, h_long($data, 'answer', 20000)];
    if ($id) { $pdo->prepare('UPDATE help_requests SET person_id=?, target=?, question=?, message=?, status=?, posted_where=?, posted_url=?, answer=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$fields, $id]); }
    else { $pdo->prepare('INSERT INTO help_requests(person_id, target, question, message, status, posted_where, posted_url, answer) VALUES(?,?,?,?,?,?,?,?)')->execute($fields); $id = (int) $pdo->lastInsertId(); }
    return ['id' => $id];
}

function delete_help_request(PDO $pdo, array $data): array
{
    $pdo->prepare('DELETE FROM help_requests WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}
