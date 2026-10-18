<?php
declare(strict_types=1);

/**
 * 🔎 « Poser une question en français » — les questions qui demandent un calcul, et pas seulement une liste
 * (le reste : lib/heritage_links.php, question_to_criteria). Appelé en premier par ask_question() ; rend null si la
 * question n'est pas de ce genre. Réponses :
 *  - lien de parenté entre deux personnes (« cousins issus de germains », « oncle à la mode de Bretagne », degré civil) ;
 *  - records : qui a vécu le plus longtemps, mort le plus jeune, la plus grande famille, marié le plus jeune / le plus
 *    tard, le plus grand écart d'âge entre époux, l'ancêtre le plus ancien, le plus récent ;
 *  - moyennes : âge au mariage, au décès (espérance de vie), au premier enfant, enfants par couple ;
 *  - les plus fréquents : prénoms, noms, métiers, communes, mois de naissance / mariage / décès ;
 *  - faits d'une personne : quand / où est-il né, mort, marié ; quel âge avait-il à son mariage, à sa mort ;
 *    quel âge aurait-il aujourd'hui ;
 *  - époques : vivants en 1900, qui avait 20 ans en 1914, qui a connu la Grande Guerre, la Révolution… ;
 *  - comptes : combien d'ancêtres trouvés (par génération), combien de générations.
 * Les filtres simples de la question (hommes / femmes, ancêtres, siècle, entre … et …) s'appliquent aux calculs.
 */

const QM_MONTHS = [1 => 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const QM_ERAS = [
    'guerre de 14|grande guerre|premiere guerre mondiale|guerre de 1914|14-18|1914-1918' => [1914, 1918, 'la Grande Guerre (1914-1918)', true],
    'seconde guerre mondiale|deuxieme guerre mondiale|guerre de 39|39-45|1939-1945' => [1939, 1945, 'la Seconde Guerre mondiale (1939-1945)', true],
    'guerre de 1870|guerre de 70|guerre franco-prussienne' => [1870, 1871, 'la guerre de 1870-1871', true],
    'guerre d.algerie' => [1954, 1962, 'la guerre d’Algérie (1954-1962)', true],
    'revolution francaise|la revolution' => [1789, 1799, 'la Révolution française (1789-1799)', false],
    'premier empire|napoleon|guerres napoleoniennes' => [1804, 1815, 'le Premier Empire (1804-1815)', true],
    'commune de paris' => [1871, 1871, 'la Commune de Paris (1871)', false],
    'grippe espagnole' => [1918, 1919, 'la grippe espagnole (1918-1919)', false],
    'belle epoque' => [1890, 1914, 'la Belle Époque (1890-1914)', false],
];

/* ─── calendrier républicain (an I à an XIV) ─── */
const QM_REP_MONTHS = [1 => 'vendemiaire', 'brumaire', 'frimaire', 'nivose', 'pluviose', 'ventose', 'germinal', 'floreal', 'prairial', 'messidor', 'thermidor', 'fructidor'];
/** le 1er vendémiaire de chaque année républicaine (années sextiles : III, VII, XI) */
const QM_REP_START = [1 => '1792-09-22', '1793-09-22', '1794-09-22', '1795-09-23', '1796-09-22', '1797-09-22', '1798-09-22', '1799-09-23', '1800-09-23', '1801-09-23', '1802-09-23', '1803-09-24', '1804-09-23', '1805-09-23', '1806-09-23'];
/** « ii », « XIV », « 2 » → 2 (null si ce n'est pas un numéro d'an républicain) */
function qm_roman(string $s): ?int
{
    $s = strtolower(trim($s));
    if (preg_match('/^\d{1,2}$/', $s)) { $n = (int) $s; return $n >= 1 && $n <= 14 ? $n : null; }
    if (!preg_match('/^[ivx]+$/', $s)) { return null; }
    $v = ['i' => 1, 'v' => 5, 'x' => 10]; $n = 0;
    for ($i = 0, $l = strlen($s); $i < $l; $i++) { $c = $v[$s[$i]]; $n += ($i + 1 < $l && $v[$s[$i + 1]] > $c) ? -$c : $c; }
    return $n >= 1 && $n <= 14 ? $n : null;
}
/** date républicaine → date grégorienne (AAAA-MM-JJ) ; mois 13 = jours complémentaires (sans-culottides) ; null si impossible */
function qm_rep_to_iso(int $year, int $month, int $day): ?string
{
    if ($year < 1 || $year > 14 || $month < 1 || $month > 13 || $day < 1) { return null; }
    if ($month <= 12 && $day > 30) { return null; }
    if ($month === 13 && $day > (in_array($year, [3, 7, 11], true) ? 6 : 5)) { return null; }
    return (new DateTime(QM_REP_START[$year]))->modify('+' . (($month - 1) * 30 + $day - 1) . ' days')->format('Y-m-d');
}
/** date grégorienne → [an, mois (13 = sans-culottides), jour] pendant le calendrier républicain, sinon null */
function qm_iso_to_rep(?string $iso): ?array
{
    if (!$iso || $iso < QM_REP_START[1] || $iso >= QM_REP_START[15]) { return null; }
    for ($y = 14; $y >= 1; $y--) { if ($iso >= QM_REP_START[$y]) { $off = (int) (new DateTime(QM_REP_START[$y]))->diff(new DateTime($iso))->days; return [$y, intdiv($off, 30) + 1, $off % 30 + 1]; } }
    return null;
}
/** « 15 brumaire an II », « 3e jour complémentaire an VII » (texte d'un acte) → date grégorienne, sinon null */
function qm_rep_text_iso(string $text): ?string
{
    $t = strtolower(ascii_fold($text));
    if (preg_match('/\b(\d{1,2})(?:er|e|eme)?\s+(' . implode('|', QM_REP_MONTHS) . ')\s+(?:de\s+)?(?:l[\'’]\s*)?an\s+([ivx]+|\d{1,2})\b/', $t, $m)) {
        $y = qm_roman($m[3]); return $y ? qm_rep_to_iso($y, (int) array_search($m[2], QM_REP_MONTHS, true), (int) $m[1]) : null;
    }
    if (preg_match('/\b(\d)(?:er|e|eme)?\s+(?:jour\s+complementaire|sans-?culottides?)\s+(?:de\s+)?(?:l[\'’]\s*)?an\s+([ivx]+|\d{1,2})\b/', $t, $m)) {
        $y = qm_roman($m[2]); return $y ? qm_rep_to_iso($y, 13, (int) $m[1]) : null;
    }
    return null;
}
/** 2 → « II » */
function qm_roman_str(int $n): string { $o = ''; foreach (['x' => 10, 'ix' => 9, 'v' => 5, 'iv' => 4, 'i' => 1] as $r => $v) { while ($n >= $v) { $o .= $r; $n -= $v; } } return strtoupper($o); }
/** un jour qui existe (le 29 février d'avant 1583 suit le calendrier julien : une année sur quatre) */
function qm_valid_date(int $d, int $m, int $y): bool
{
    if ($m === 2 && $d === 29 && $y < 1583) { return $y % 4 === 0; }
    return $y > 0 && checkdate($m, $d, $y);
}
/** « d’Antoine », « de Louis » */
function qm_de(string $name): string { return preg_match('/^[aeiouyœæ]/u', mb_strtolower(ascii_fold($name))) ? 'd’' . $name : 'de ' . $name; }
/** l’article devant un mot de parenté : « l’oncle », « l’arrière-grand-père », « le petit-fils », « la tante » */
function qm_art(string $noun, bool $female): string { return preg_match('/^[aeiouy]/', strtolower(ascii_fold($noun))) ? 'l’' . $noun : ($female ? 'la ' : 'le ') . $noun; }
/** « 1 personne », « 3 personnes » (0 et 1 au singulier) */
function qm_n(int $n, string $one, string $many): string { return $n . ' ' . ($n > 1 ? $many : $one); }
/** une question sur les animaux (les fiches « animal » ne comptent pas parmi les personnes sinon) */
function qm_about_animals(string $t): bool { return (bool) preg_match('/\b(animal|animaux|animaux de compagnie|betes?)\b/', $t); }

/** les fiches avec leurs repères (naissance, décès, lieux, dates exactes), une seule lecture par question */
function qm_people(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $p = [];
    $hasKind = false;
    try { $hasKind = (bool) array_filter($pdo->query('PRAGMA table_info(persons)')->fetchAll(), static fn($c) => $c['name'] === 'kind'); } catch (Throwable $_) {}
    foreach ($pdo->query("SELECT id, COALESCE(first_name,'') AS first, COALESCE(last_name,'') AS last, COALESCE(gender,'') AS gender, COALESCE(occupation,'') AS occupation, COALESCE(living_status,'') AS living, " . ($hasKind ? "COALESCE(kind,'human')" : "'human'") . " AS kind FROM persons") as $r) {
        $p[(int) $r['id']] = ['id' => (int) $r['id']] + $r + ['by' => null, 'bd' => null, 'bplace' => '', 'btext' => '', 'dy' => null, 'dd' => null, 'dplace' => '', 'dtext' => ''];
    }
    $rows = $pdo->query("SELECT e.person_id, e.year, e.date_text, t.gedcom_tag, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY t.gedcom_tag IN ('BIRT','DEAT') DESC")->fetchAll();
    foreach ($rows as $e) {
        $id = (int) $e['person_id']; if (!isset($p[$id])) { continue; }
        $birth = in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true); $k = $birth ? 'b' : 'd';
        $year = $e['year'] !== null ? (int) $e['year'] : null; $iso = exact_date((string) $e['date_text']);
        // une date du calendrier républicain (« 15 brumaire an II ») : convertie ici si la base ne l'a pas fait
        if (!$iso && ($rep = qm_rep_text_iso((string) $e['date_text']))) { $iso = $rep; $year ??= (int) substr($rep, 0, 4); }
        if ($p[$id][$k . 'y'] === null && $year !== null) { $p[$id][$k . 'y'] = $year; $p[$id][$k . 'd'] = $iso; $p[$id][$k . 'text'] = (string) $e['date_text']; }
        if ($p[$id][$k . 'text'] === '' && trim((string) $e['date_text']) !== '') { $p[$id][$k . 'text'] = (string) $e['date_text']; }
        if ($p[$id][$k . 'place'] === '' && $e['place'] !== '') { $p[$id][$k . 'place'] = (string) $e['place']; }
    }
    return $cache = $p;
}
/** les fiches qui comptent pour une question : les personnes (sans les animaux), ou seulement les animaux si la question parle d'animaux */
function qm_humans(PDO $pdo, bool $animals = false): array
{
    return array_filter(qm_people($pdo), static fn($p) => ($p['kind'] === 'animal') === $animals);
}
function qm_name(array $p): string { return trim($p['first'] . ' ' . $p['last']) ?: 'Sans nom'; }
/** âge en années entre deux repères (dates exactes si possible) */
function qm_age(?string $d1, ?int $y1, ?string $d2, ?int $y2): ?float
{
    if ($d1 && $d2) { $a = new DateTime($d1); $b = new DateTime($d2); $diff = $a->diff($b); return ($diff->invert ? -1 : 1) * ($diff->y + $diff->m / 12 + $diff->d / 365); }
    return $y1 !== null && $y2 !== null ? (float) ($y2 - $y1) : null;
}
function qm_years(float $a): string { $y = (int) floor($a); return $y . ' an' . ($y > 1 ? 's' : ''); }
/** les couples mariés : partenaires, année et date du mariage, enfants */
function qm_couples(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $c = [];
    foreach ($pdo->query("SELECT f.id, f.partner1_id, f.partner2_id, (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag='MARR' LIMIT 1) AS my,
            (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=f.id AND t.gedcom_tag='MARR' LIMIT 1) AS md,
            (SELECT count(*) FROM family_children fc WHERE fc.family_id=f.id) AS kids FROM families f") as $r) {
        $c[(int) $r['id']] = ['a' => (int) $r['partner1_id'], 'b' => (int) $r['partner2_id'], 'my' => $r['my'] !== null ? (int) $r['my'] : null, 'md' => exact_date((string) ($r['md'] ?? '')), 'kids' => (int) $r['kids']];
    }
    return $cache = $c;
}
/** les filtres simples d'une question : sexe, ancêtres, années */
function qm_filters(PDO $pdo, string $t): array
{
    $f = ['gender' => '', 'from' => null, 'to' => null, 'ancestors' => false, 'label' => []];
    if (preg_match('/\b(femmes|filles|aieules|epouses|meres|feminin)\b/', $t)) { $f['gender'] = 'female'; $f['label'][] = 'femmes'; }
    elseif (preg_match('/\b(hommes|garcons|peres|masculin)\b/', $t)) { $f['gender'] = 'male'; $f['label'][] = 'hommes'; }
    if (preg_match('/\b(ancetres|aieux|ascendants|ancetre)\b/', $t)) { $f['ancestors'] = true; $f['label'][] = 'ancêtres'; }
    $roman = ['xv' => 15, 'xvi' => 16, 'xvii' => 17, 'xviii' => 18, 'xix' => 19, 'xx' => 20, 'xxi' => 21];
    if (preg_match('/\bentre (\d{4}) et (\d{4})\b/', $t, $m)) { $f['from'] = (int) $m[1]; $f['to'] = (int) $m[2]; $f['label'][] = "entre {$m[1]} et {$m[2]}"; }
    elseif (preg_match('/\b(?:au|du) (xv|xvi|xvii|xviii|xix|xx|xxi|\d{2})(?:e|eme|ieme)? siecle\b/', $t, $m)) { $n = $roman[$m[1]] ?? (int) $m[1]; $f['from'] = ($n - 1) * 100 + 1; $f['to'] = $n * 100; $f['label'][] = "au {$n}e siècle"; }
    else { if (preg_match('/\bavant (\d{4})\b/', $t, $m)) { $f['to'] = (int) $m[1] - 1; $f['label'][] = "avant {$m[1]}"; } if (preg_match('/\bapres (\d{4})\b/', $t, $m)) { $f['from'] = (int) $m[1] + 1; $f['label'][] = "après {$m[1]}"; } }
    if ($f['ancestors']) { $root = qm_root($pdo); $f['set'] = $root ? h_ancestors($pdo, $root, 40) : []; unset($f['set'][$root]); }
    return $f;
}
/** la personne de départ de l'arbre (cochée, sinon la première fiche) */
function qm_root(PDO $pdo): int { return (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn(); }
function qm_keep(array $f, array $p, ?int $year = null): bool
{
    if ($f['gender'] && $p['gender'] !== $f['gender']) { return false; }
    if ($f['ancestors'] && !isset($f['set'][(int) $p['id']])) { return false; }
    $y = $year ?? $p['by'];
    if (($f['from'] !== null || $f['to'] !== null) && $y === null) { return false; }
    if ($f['from'] !== null && $y < $f['from']) { return false; }
    if ($f['to'] !== null && $y > $f['to']) { return false; }
    return true;
}
/** les mots d'un nom ou d'une question, sans accents ni majuscules, coupés aux espaces, traits d'union et apostrophes */
function qm_words(string $s): array { return preg_split('/[^a-z0-9]+/', strtolower(ascii_fold($s)), -1, PREG_SPLIT_NO_EMPTY); }
/** les personnes citées dans la question (suites de mots qui forment un prénom + un nom de la base), de gauche à droite */
function qm_find_people(PDO $pdo, string $q): array
{
    // mêmes coupures des deux côtés : espaces, traits d'union et apostrophes (« Marie-Thérèse », « D'ARTOIS »)
    $tok = qm_words($q);
    $part = ['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'van', 'von', 'der'];
    $people = [];
    foreach (qm_people($pdo) as $id => $p) {
        $fi = qm_words($p['first']); $la = qm_words($p['last']);
        if ($fi && $la) { $people[] = [$id, $fi, array_values(array_diff($la, $part))]; }
    }
    $found = []; $n = count($tok); $i = 0;
    while ($i < $n) {
        $best = null;
        for ($j = min($n - 1, $i + 6); $j > $i; $j--) {
            $words = array_values(array_diff(array_slice($tok, $i, $j - $i + 1), $part));
            if (count($words) < 2) { continue; }
            $hits = array_values(array_filter($people, static fn($p) => !array_diff($words, array_merge($p[1], $p[2])) && array_intersect($words, $p[1]) && array_intersect($words, $p[2])));
            if ($hits) { usort($hits, static fn($a, $b) => count($a[1]) + count($a[2]) <=> count($b[1]) + count($b[2]) ?: $a[0] <=> $b[0]); $best = [$hits[0][0], $j]; break; }
        }
        if ($best) { $found[] = $best[0]; $i = $best[1] + 1; } else { $i++; }
    }
    return array_values(array_unique($found));
}

/* ─── le lien de parenté entre deux personnes ─── */
function qm_parents(PDO $pdo, int $id): array
{
    static $map = null;
    if ($map === null) { $map = []; foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) { foreach ([$r['partner1_id'], $r['partner2_id']] as $x) { if ($x) { $map[(int) $r['child_id']][] = (int) $x; } } } }
    return $map[$id] ?? [];
}
function qm_ancestors(PDO $pdo, int $id, int $max = 30): array
{
    $out = [$id => 0]; $queue = [[$id, 0]];
    while ($queue) { [$x, $d] = array_shift($queue); if ($d >= $max) { continue; } foreach (qm_parents($pdo, $x) as $p) { if (!isset($out[$p])) { $out[$p] = $d + 1; $queue[] = [$p, $d + 1]; } } }
    return $out;
}
/** le nom français d'un lien de sang : a = générations de X à l'ancêtre commun, b = de Y à l'ancêtre commun */
function qm_kin_label(int $a, int $b, string $gx, bool $half): string
{
    if ($gx === 'male' || $gx === 'female') { return qm_kin_label_g($a, $b, $gx, $half); }
    // sexe inconnu : les deux mots (« l’oncle ou la tante »)
    $m = qm_kin_label_g($a, $b, 'male', $half); $w = qm_kin_label_g($a, $b, 'female', $half);
    return $m === $w ? $m : "{$m} ou {$w}";
}
function qm_kin_label_g(int $a, int $b, string $gx, bool $half): string
{
    $f = $gx === 'female'; $e = $f ? 'e' : '';
    $great = static fn(int $n, string $base) => str_repeat('arrière-', max(0, $n)) . $base;
    if ($a === 0) { return $b === 1 ? ($f ? 'la mère' : 'le père') : qm_art($great($b - 2, $f ? 'grand-mère' : 'grand-père'), $f); }
    if ($b === 0) { return $a === 1 ? ($f ? 'la fille' : 'le fils') : qm_art($great($a - 2, $f ? 'petite-fille' : 'petit-fils'), $f); }
    $demi = $half ? 'demi-' : '';
    if ($a === 1 && $b === 1) { return $f ? "la {$demi}sœur" : "le {$demi}frère"; }
    if ($a === 1) { return qm_art($demi . ($b === 2 ? ($f ? 'tante' : 'oncle') : $great($b - 3, $f ? 'grand-tante' : 'grand-oncle')), $f); }
    if ($b === 1) { return qm_art($demi . ($a === 2 ? ($f ? 'nièce' : 'neveu') : $great($a - 3, $f ? 'petite-nièce' : 'petit-neveu')), $f); }
    $deg = min($a, $b) - 1; $cous = $f ? 'cousine' : 'cousin';
    $name = match ($deg) { 1 => "{$cous} germain{$e}", 2 => "{$cous} issu{$e} de germains", 3 => "{$cous} issu{$e} d’issus de germains", default => "{$cous} au " . ($deg + 1) . 'e degré' };
    if ($a === $b) { return ($f ? 'la ' : 'le ') . $demi . $name; }
    if ($deg === 1 && abs($a - $b) === 1) { return $a > $b ? ($f ? 'la nièce à la mode de Bretagne (fille d’un cousin germain)' : 'le neveu à la mode de Bretagne (fils d’un cousin germain)') : ($f ? 'la tante à la mode de Bretagne (cousine germaine d’un parent)' : 'l’oncle à la mode de Bretagne (cousin germain d’un parent)'); }
    return ($f ? 'la ' : 'le ') . $demi . $name . ' avec ' . abs($a - $b) . ' génération' . (abs($a - $b) > 1 ? 's' : '') . ' d’écart';
}
function qm_kinship(PDO $pdo, int $x, int $y): ?array
{
    $ax = qm_ancestors($pdo, $x); $ay = qm_ancestors($pdo, $y); $best = null;
    foreach ($ax as $anc => $a) { if (isset($ay[$anc])) { $s = $a + $ay[$anc]; if (!$best || $s < $best['sum']) { $best = ['anc' => $anc, 'a' => $a, 'b' => $ay[$anc], 'sum' => $s]; } } }
    if (!$best) { return null; }
    $commons = array_keys(array_filter($ax, static fn($a, $anc) => isset($ay[$anc]) && $a === $best['a'] && $ay[$anc] === $best['b'], ARRAY_FILTER_USE_BOTH));
    // « demi » seulement si l'ancêtre commun a un conjoint connu qui n'est pas, lui, ancêtre des deux (un conjoint absent de l'arbre ne prouve rien)
    $half = false;
    if (count($commons) === 1 && $best['a'] > 0 && $best['b'] > 0) {
        foreach (qm_couples($pdo) as $c) { if ($c['a'] === $commons[0] || $c['b'] === $commons[0]) { $sp = $c['a'] === $commons[0] ? $c['b'] : $c['a']; if ($sp && !(isset($ax[$sp]) && isset($ay[$sp]))) { $half = true; break; } } }
    }
    return $best + ['commons' => $commons, 'half' => $half];
}

function qm_children_map(PDO $pdo): array
{
    static $map = null;
    if ($map === null) { $map = []; foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) { foreach ([$r['partner1_id'], $r['partner2_id']] as $x) { if ($x) { $map[(int) $x][(int) $r['child_id']] = true; } } } }
    return $map;
}
/** les cousins d'une personne : id => degré (1 = germain, 2 = issu de germains…), d'après l'ancêtre commun le plus proche */
function qm_cousins(PDO $pdo, int $x, int $maxDeg = 4): array
{
    $ax = qm_ancestors($pdo, $x, $maxDeg + 1); $kids = qm_children_map($pdo); $out = []; $seen = [];
    foreach ($ax as $anc => $a) {
        if ($a < 2) { continue; }
        $level = [$anc => true];
        for ($g = 0; $g < $a && $level; $g++) { $next = []; foreach ($level as $id => $_) { foreach ($kids[$id] ?? [] as $c => $_2) { $next[$c] = true; } } $level = $next; }
        foreach ($level as $y => $_) {
            if ($y === $x || isset($seen[$y]) || isset($ax[$y])) { continue; }
            $seen[$y] = true;
            $k = qm_kinship($pdo, $x, $y);
            if ($k && $k['a'] === $k['b'] && $k['a'] >= 2) { $out[$y] = $k['a'] - 1; }
        }
    }
    return $out;
}
/**
 * La personne dont parle la question : un prénom + un nom de la base, sinon un prénom seul s'il n'y en a qu'un
 * (« les frères de Louis »). Rend ['id' => …], ou ['ask' => [ids], 'word' => …] s'il faut demander laquelle, ou [].
 */
function qm_pick_person(PDO $pdo, string $q, int $chosen = 0): array
{
    $ids = qm_find_people($pdo, $q);
    if ($ids) { return ['id' => $ids[0]]; }
    $m = function_exists('question_first_name_scan') ? question_first_name_scan($pdo, $q) : null;
    if (!$m) { return []; }
    if (count($m['ids']) === 1) { return ['id' => $m['ids'][0]]; }
    if ($chosen && in_array($chosen, $m['ids'], true)) { return ['id' => $chosen]; }
    return ['ask' => $m['ids'], 'word' => $m['word']];
}
/** plusieurs fiches ont ce prénom : on les montre pour choisir (« Répondre pour celle-ci ») */
function qm_ask_which(PDO $pdo, array $who, string $what): array
{
    $hom = array_map(static fn($id) => ['id' => (int) $id, 'name' => question_person_name($pdo, (int) $id), 'life' => person_life_years($pdo, (int) $id), 'chosen' => false], $who['ask']);
    return qm_answer(["{$what} de « {$who['word']} »", 'plusieurs fiches'], 'Plusieurs fiches ont le prénom « ' . $who['word'] . ' » : laquelle ? Choisis-la ci-dessus (« Répondre pour celle-ci »), ou écris aussi le nom de famille.',
        ['homonyms' => $hom, 'facts' => [['Prénom', $who['word']], ['Fiches', (string) count($hom)]]]);
}

function qm_answer(array $understood, string $answer, array $extra = []): array
{
    return array_merge(['understood' => $understood, 'answer' => $answer, 'criteria' => null, 'homonyms' => [], 'count' => count($extra['ids'] ?? []), 'people' => [], 'rows' => [], 'facts' => []], $extra);
}
/** une liste classée : [id(s), libellé, valeur] → lignes pour l'affichage */
function qm_rows(array $list, int $limit = 15): array
{
    return array_map(static fn($r) => ['ids' => array_values((array) $r[0]), 'label' => $r[1], 'value' => $r[2]], array_slice($list, 0, $limit));
}

function question_special(PDO $pdo, string $question, int $personId = 0): ?array
{
    $q = trim(preg_replace('/\s+/u', ' ', $question));
    if (mb_strlen($q) > 300) { $q = mb_substr($q, 0, 300); } // une question, pas un texte : le calcul reste rapide
    $t = ' ' . strtolower(ascii_fold($q)) . ' ';
    $animals = qm_about_animals($t);
    // les statistiques portent sur les personnes ; les animaux seulement si la question parle d'animaux
    $people = null; $P = static function () use ($pdo, &$people, $animals) { return $people ??= qm_humans($pdo, $animals); };
    $all = qm_people($pdo);
    $now = (int) date('Y');
    $spouseWord = static fn(array $p) => $p['gender'] === 'female' ? 'l’épouse' : ($p['gender'] === 'male' ? 'l’époux' : 'l’époux ou l’épouse');

    // ── lien de parenté entre deux personnes
    if (preg_match('/\b(lien|parente|apparente|apparentes|relie|relies|cousins?|cousines?|qu.est .* pour|quel rapport)\b/', $t)) {
        $ids = qm_find_people($pdo, $q);
        if (count($ids) >= 2) {
            [$x, $y] = $ids; $pp = $all; $nx = qm_name($pp[$x]); $ny = qm_name($pp[$y]);
            $k = qm_kinship($pdo, $x, $y);
            if (!$k) { // par alliance : X est le conjoint d'un parent de sang de Y, ou Y le conjoint d'un parent de sang de X, ou les deux
                $couples = qm_couples($pdo); $sps = static function (int $id) use ($couples) { $o = []; foreach ($couples as $c) { if ($c['a'] === $id && $c['b']) { $o[] = $c['b']; } elseif ($c['b'] === $id && $c['a']) { $o[] = $c['a']; } } return array_values(array_unique($o)); };
                $u = ['lien de parenté', "{$nx} et {$ny}"];
                foreach ($sps($x) as $other) { // X est l'époux / l'épouse de quelqu'un de la famille de Y
                    if ($other === $y) { return qm_answer($u, "{$nx} est " . $spouseWord($pp[$x]) . ' ' . qm_de($ny) . '.', ['ids' => [$x, $y]]); }
                    if ($k2 = qm_kinship($pdo, $other, $y)) { $lab = qm_kin_label($k2['a'], $k2['b'], $pp[$other]['gender'] ?? '', $k2['half']); return qm_answer($u, "Par alliance : {$nx} est " . $spouseWord($pp[$x]) . ' ' . qm_de(qm_name($pp[$other])) . ", qui est {$lab} " . qm_de($ny) . '.', ['ids' => [$x, $y, $other]]); }
                }
                foreach ($sps($y) as $other) { // Y est l'époux / l'épouse de quelqu'un de la famille de X
                    if ($k2 = qm_kinship($pdo, $x, $other)) { $lab = qm_kin_label($k2['a'], $k2['b'], $pp[$x]['gender'] ?? '', $k2['half']); return qm_answer($u, "Par alliance : {$nx} est {$lab} " . qm_de(qm_name($pp[$other])) . ', ' . $spouseWord($pp[$other]) . ' ' . qm_de($ny) . '.', ['ids' => [$x, $y, $other]]); }
                }
                foreach ($sps($x) as $ox) { foreach ($sps($y) as $oy) { // les deux sont entrés dans la famille par mariage
                    if ($ox !== $oy && ($k2 = qm_kinship($pdo, $ox, $oy))) { $lab = qm_kin_label($k2['a'], $k2['b'], $pp[$ox]['gender'] ?? '', $k2['half']); return qm_answer($u, "Par alliance : {$nx} est " . $spouseWord($pp[$x]) . ' ' . qm_de(qm_name($pp[$ox])) . ", qui est {$lab} " . qm_de(qm_name($pp[$oy])) . ', ' . $spouseWord($pp[$oy]) . ' ' . qm_de($ny) . '.', ['ids' => [$x, $y, $ox, $oy]]); }
                } }
                return qm_answer($u, "Aucun ancêtre commun connu dans l’arbre entre {$nx} et {$ny}.");
            }
            $label = qm_kin_label($k['a'], $k['b'], $pp[$x]['gender'] ?? '', $k['half']);
            $anc = implode(' et ', array_map(static fn($i) => qm_name($pp[$i]), array_slice($k['commons'], 0, 2)));
            $civil = $k['a'] + $k['b'];
            $facts = [['Lien', ucfirst($label) . ' ' . qm_de($ny)], ['Ancêtre(s) commun(s)', $anc], ['Générations', "{$nx} : {$k['a']} · {$ny} : {$k['b']}"], ['Degré (droit civil)', $civil . 'e degré']];
            return qm_answer(['lien de parenté', "{$nx} et {$ny}"], ($k['a'] === 0 && $k['b'] === 0) ? 'C’est la même personne.' : "{$nx} est {$label} " . qm_de($ny) . '.' . ($anc && $k['a'] && $k['b'] ? " Ancêtre(s) commun(s) : {$anc}." : ''), ['facts' => $facts, 'ids' => [$x, $y]]);
        }
        // ── les cousins d'une personne (« les cousins germains de Louis MARTIN », « combien de cousines a Louise »)
        if (count($ids) <= 1 && preg_match('/\b(cousins?|cousines?)\b/', $t, $cm)) {
            $who = qm_pick_person($pdo, $q, $personId);
            if (!empty($who['ask'])) { return qm_ask_which($pdo, $who, 'cousins'); }
            if (!empty($who['id'])) {
                $id = $who['id']; $n = qm_name($all[$id]);
                $only = preg_match('/\bissue?s? d.issus de germains\b/', $t) ? 3 : (preg_match('/\bissue?s? de germains\b/', $t) ? 2 : (preg_match('/\bgermaine?s?\b/', $t) ? 1 : 0));
                $fem = str_starts_with($cm[1], 'cousine');
                $list = array_filter(qm_cousins($pdo, $id, max(4, $only)), static fn($d, $c) => (!$only || $d === $only) && (!$fem || ($all[$c]['gender'] ?? '') === 'female') && ($all[$c]['kind'] ?? 'human') !== 'animal', ARRAY_FILTER_USE_BOTH);
                asort($list);
                // « germain », « germaines », « issue de germains »… (accord avec le nombre et le sexe)
                $degName = static function (int $d, int $n, bool $f) { $e = $f ? 'e' : ''; $s = $n > 1 ? 's' : ''; return match ($d) { 1 => "germain{$e}{$s}", 2 => "issu{$e}{$s} de germains", 3 => "issu{$e}{$s} d’issus de germains", default => 'au ' . ($d + 1) . 'e degré' }; };
                $byDeg = array_count_values($list); ksort($byDeg);
                $allF = $list && !array_filter(array_keys($list), static fn($c) => ($all[$c]['gender'] ?? '') !== 'female');
                $anyF = (bool) array_filter(array_keys($list), static fn($c) => ($all[$c]['gender'] ?? '') === 'female');
                $word = $allF ? ['cousine', 'cousines'] : ($anyF ? ['cousin', 'cousins et cousines'] : ['cousin', 'cousins']);
                $what = $only ? ($fem ? 'cousines ' : 'cousins ') . $degName($only, 2, $fem) : ($fem ? 'cousines' : 'cousins');
                $rows = []; foreach ($list as $c => $d) { $cf = ($all[$c]['gender'] ?? '') === 'female'; $rows[] = [$c, qm_name($all[$c]), ($cf ? 'cousine ' : 'cousin ') . $degName($d, 1, $cf)]; }
                $ans = $list ? "{$n} : " . qm_n(count($list), $word[0], $word[1]) . (count($byDeg) === 1 ? ' ' . $degName((int) array_key_first($byDeg), count($list), $allF) : ' (' . implode(', ', array_map(static fn($d, $c) => $c . ' ' . $degName($d, $c, $allF), array_keys($byDeg), $byDeg)) . ')') . '.'
                    : ($fem ? 'Aucune cousine' : 'Aucun cousin') . ($only ? ' ' . $degName($only, 1, $fem) : '') . ' connu' . ($fem ? 'e' : '') . ' dans l’arbre pour ' . $n . '.';
                return qm_answer([$what . ' ' . qm_de($n)], $ans, ['ids' => array_keys($list), 'rows' => qm_rows($rows, 50)]);
            }
        }
    }

    // ── les faits d'une personne : quand / où est-il né, mort, marié ; quel âge…
    if (preg_match('/\b(quand|en quelle annee|quelle date|quelle est la date|date de (?:naissance|deces|mariage)|ou|quel age|a quel age|combien de temps)\b/', $t) && preg_match('/\b(nee?|naissance|mort|morte|decede|decedee|deces|marie|mariee|mariage|age|aurait|vecu)\b/', $t)) {
        $ids = qm_find_people($pdo, $q);
        if (count($ids) === 1) {
            $id = $ids[0]; $p = $all[$id]; $n = qm_name($p); $facts = [];
            // la question sans le nom de la personne (« Marie-Thérèse » n'est pas « mariée »)
            $tk = ' ' . implode(' ', array_diff(qm_words($q), qm_words($p['first'] . ' ' . $p['last']))) . ' ';
            $when = static fn(?string $d, ?int $y) => $d ? (new DateTime($d))->format('j') . ' ' . QM_MONTHS[(int) substr($d, 5, 2)] . ' ' . substr($d, 0, 4) : ($y ? "en {$y}" : '');
            $wd = static fn(?string $d) => $d ? 'le ' : '';
            $marr = array_values(array_filter(qm_couples($pdo), static fn($c) => $c['a'] === $id || $c['b'] === $id));
            if ($p['by']) { $facts[] = ['Naissance', trim($when($p['bd'], $p['by']) . ($p['bplace'] ? ' à ' . $p['bplace'] : ''))]; }
            if ($p['dy']) { $facts[] = ['Décès', trim($when($p['dd'], $p['dy']) . ($p['dplace'] ? ' à ' . $p['dplace'] : ''))]; }
            foreach ($marr as $c) { $sp = $c['a'] === $id ? $c['b'] : $c['a']; if ($c['my']) { $age = qm_age($p['bd'], $p['by'], $c['md'], $c['my']); $facts[] = ['Mariage', trim($when($c['md'], $c['my']) . ($sp && isset($all[$sp]) ? ' avec ' . qm_name($all[$sp]) : '') . ($age !== null ? ' — à ' . qm_years($age) : ''))]; } }
            $deathAge = $p['by'] && $p['dy'] ? (float) qm_age($p['bd'], $p['by'], $p['dd'], $p['dy']) : null;
            $bad = $deathAge !== null && $deathAge < 0 ? "Attention, dates incohérentes : le décès ({$p['dy']}) est daté avant la naissance ({$p['by']}). Vérifie la fiche de {$n}." : '';
            if ($deathAge !== null) { $facts[] = ['Âge au décès', $bad ? '⚠️ décès avant la naissance' : qm_years($deathAge)]; }
            if (preg_match('/\b(aurait|aujourd.hui)\b/', $t) && $p['by']) { $age = qm_age($p['bd'], $p['by'], date('Y-m-d'), $now); return qm_answer(['âge aujourd’hui', $n], "{$n} aurait " . qm_years((float) $age) . ' aujourd’hui' . ($p['dy'] ? " (décédé" . ($p['gender'] === 'female' ? 'e' : '') . " en {$p['dy']})" : '') . '.', ['facts' => $facts, 'ids' => [$id]]); }
            if (preg_match('/\bage\b/', $t) && preg_match('/\b(mariage|marie|mariee)\b/', $tk) && $marr && $marr[0]['my'] && $p['by']) { $age = qm_age($p['bd'], $p['by'], $marr[0]['md'], $marr[0]['my']); return qm_answer(['âge au mariage', $n], "{$n} avait " . qm_years((float) $age) . " à son mariage ({$marr[0]['my']}).", ['facts' => $facts, 'ids' => [$id]]); }
            if (preg_match('/\b(age|vecu|combien de temps)\b/', $t) && $bad) { return qm_answer(['âge au décès', $n], $bad, ['facts' => $facts, 'ids' => [$id]]); }
            if (preg_match('/\b(age|vecu|combien de temps)\b/', $t) && $p['by'] && $p['dy']) { return qm_answer(['âge au décès', $n], "{$n} est mort" . ($p['gender'] === 'female' ? 'e' : '') . ' à ' . qm_years((float) qm_age($p['bd'], $p['by'], $p['dd'], $p['dy'])) . '.', ['facts' => $facts, 'ids' => [$id]]); }
            $kind = preg_match('/\b(mort|morte|decede|decedee|deces)\b/', $tk) ? 'd' : (preg_match('/\b(marie|mariee|mariage)\b/', $tk) ? 'm' : 'b');
            $where = preg_match('/\bou\b/', $t);
            if ($kind === 'm') { $c = $marr[0] ?? null; $ans = $c && $c['my'] ? "{$n} s’est marié" . ($p['gender'] === 'female' ? 'e' : '') . ' ' . $wd($c['md']) . $when($c['md'], $c['my']) . '.' : "Pas de mariage daté pour {$n}."; }
            else { $y = $p[$kind . 'y']; $pl = $p[$kind . 'place']; $verb = $kind === 'b' ? 'né' : 'mort'; $e = $p['gender'] === 'female' ? 'e' : '';
                $ans = $where ? ($pl ? "{$n} est {$verb}{$e} à {$pl}" . ($y ? ' (' . $when($p[$kind . 'd'], $y) . ')' : '') . '.' : "Le lieu n’est pas connu pour {$n}.") : ($y ? "{$n} est {$verb}{$e} " . $wd($p[$kind . 'd']) . $when($p[$kind . 'd'], $y) . ($pl ? " à {$pl}" : '') . '.' : "La date n’est pas connue pour {$n}."); }
            return qm_answer([$n], $ans, ['facts' => $facts, 'ids' => [$id]]);
        }
    }

    $f = qm_filters($pdo, $t); $fl = $f['label'];
    $kept = static fn() => array_filter($P(), static fn($p) => qm_keep($f, $p));

    // ── époques : vivants en telle année, ceux qui avaient tel âge, ceux qui ont connu un événement
    $era = null;
    foreach (QM_ERAS as $re => $v) { if (preg_match('/\b(' . $re . ')\b/', $t)) { $era = $v; break; } }
    if (preg_match('/\b(?:avai(?:t|ent)|a) (\d{1,3}) ans en (\d{4})\b/', $t, $m)) {
        $y = (int) $m[2] - (int) $m[1]; $ids = array_keys(array_filter($P(), static fn($p) => $p['by'] !== null && abs($p['by'] - $y) <= 1 && ($p['dy'] === null || $p['dy'] >= (int) $m[2]) && qm_keep(['from' => null, 'to' => null] + $f, $p)));
        return qm_answer(array_merge(["{$m[1]} ans en {$m[2]}"], $fl), count($ids) . " personne(s) avaient environ {$m[1]} ans en {$m[2]} (nées vers {$y}).", ['ids' => $ids]);
    }
    if ($era || preg_match('/\b(vivants?|vivantes?|en vie|vivait|vivaient|connu|connue|connus|vecu)\b.*\ben (\d{4})\b/', $t, $m2)) {
        [$a, $b, $lab, $war] = $era ?: [(int) $m2[2], (int) $m2[2], 'en ' . $m2[2], false];
        $title = $era ? 'vivants pendant ' . $lab : 'vivants ' . $lab;
        $alive = array_filter($P(), static function ($p) use ($f, $a, $b) {
            if (!qm_keep(['from' => null, 'to' => null] + $f, $p) || $p['by'] === null || $p['by'] > $b) { return false; }
            if ($p['dy'] !== null) { return $p['dy'] >= $a; }
            return $p['living'] === 'living' || $p['by'] > $b - 95; // sans décès connu : vivant si moins de 95 ans
        });
        $ids = array_keys($alive); $extra = '';
        if ($war) { $sold = array_filter($alive, static fn($p) => $p['gender'] === 'male' && $p['by'] !== null && $b - $p['by'] >= 18 && $a - $p['by'] <= 45); $extra = ' Dont ' . count($sold) . ' homme(s) en âge d’être mobilisés (18 à 45 ans) : à chercher dans les registres matricules et Mémoire des hommes.'; $ids = array_merge(array_keys($sold), array_diff($ids, array_keys($sold))); }
        return qm_answer(array_merge([$title], $fl), count($ids) . " personne(s) ont vécu {$lab}." . $extra, ['ids' => $ids]);
    }

    // ── combien de personnes dans la base (les animaux à part)
    if (preg_match('/^ ?combien (?:de |d.)(personnes|fiches|individus|gens|animaux)(?: (?:y a-t-il|y a t il|il y a|en tout|au total|dans (?:l.arbre|la base|ma genealogie|ma base)))* ?\?? ?$/', $t)) {
        $h = count(qm_humans($pdo)); $an = count(qm_humans($pdo, true));
        if ($animals) { return qm_answer(['animaux'], $an ? qm_n($an, 'animal', 'animaux') . ' dans la base.' : 'Aucun animal dans la base.', ['ids' => array_keys(qm_humans($pdo, true))]); }
        return qm_answer(['personnes dans la base'], qm_n($h, 'personne', 'personnes') . ' dans la base' . ($an ? ' (sans compter ' . qm_n($an, 'animal', 'animaux') . ')' : '') . '.');
    }

    // ── dates précises : « né le 7 mai 1950 », « mort le 08/12/1960 », « né le 15 brumaire an II », « né un 15 brumaire », « né en l'an II »
    $evt = preg_match('/\b(morte?s?|decede(?:e|s|es)?|deces|mourut|moururent)\b/', $t) ? 'd' : (preg_match('/\b(nee?s?|naissances?|naquit|naquirent|baptise(?:e|s|es)?|baptemes?)\b/', $t) ? 'b' : (preg_match('/\b(mariee?s?|mariages?|s.est marie|se sont maries)\b/', $t) ? 'm' : ''));
    if ($evt !== '') {
        $verb = ['b' => ['né', 'née', 'nés', 'nées'], 'd' => ['mort', 'morte', 'morts', 'mortes'], 'm' => ['marié', 'mariée', 'mariés', 'mariées']][$evt];
        $evLab = ['b' => 'naissance', 'd' => 'décès', 'm' => 'mariage'][$evt];
        // les dates de l'événement demandé : [id, date exacte ou null, année ou null]
        $dated = static function () use ($evt, $pdo, $kept, $P) {
            $o = [];
            if ($evt === 'm') { $pp = $P(); foreach (qm_couples($pdo) as $c) { foreach ([$c['a'], $c['b']] as $x) { if ($x && isset($pp[$x])) { $o[] = [$x, $c['md'], $c['my']]; } } } return $o; }
            foreach ($kept() as $id => $p) { $o[] = [$id, $p[$evt . 'd'], $p[$evt . 'y']]; }
            return $o;
        };
        $say = static function (array $ids, string $when) use ($verb) { // « personne » est féminin : « 2 personnes sont nées »
            $n = count(array_unique($ids));
            if (!$n) { return "Aucune personne n’est {$verb[1]} {$when} dans l’arbre."; }
            return $n === 1 ? "1 personne est {$verb[1]} {$when}." : "{$n} personnes sont {$verb[3]} {$when}.";
        };
        $monthsRe = 'janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre';
        $full = null;
        if (preg_match('/\b(1er|\d{1,2})(?:er)? (' . $monthsRe . ') (\d{3,4})\b/', $t, $m)) { $full = [(int) $m[1], (int) array_search($m[2], array_map(static fn($x) => strtolower(ascii_fold($x)), QM_MONTHS), true), (int) $m[3]]; }
        elseif (preg_match('#\b(\d{1,2})[/.](\d{1,2})[/.](\d{3,4})\b#', $t, $m)) { $full = [(int) $m[1], (int) $m[2], (int) $m[3]]; }
        if ($full) {
            [$d, $mo, $y] = $full;
            $lab = 'le ' . ($d === 1 ? '1er' : $d) . ' ' . (QM_MONTHS[$mo] ?? $mo) . ' ' . $y;
            if (!qm_valid_date($d, $mo, $y)) {
                $why = $mo === 2 && $d === 29 ? " : {$y} n’est pas une année bissextile" : '';
                return qm_answer(['date impossible'], "Je n’ai pas compris la date : " . ($mo >= 1 && $mo <= 12 ? $lab : "{$d}/{$mo}/{$y}") . " n’existe pas{$why}. Vérifie la date (exemples : « le 7 mai 1950 », « le 08/12/1960 »).");
            }
            $iso = sprintf('%04d-%02d-%02d', $y, $mo, $d);
            $ids = array_column(array_filter($dated(), static fn($r) => $r[1] === $iso), 0);
            return qm_answer(array_merge(["{$evLab} {$lab}"], $fl), $say($ids, $lab), ['ids' => array_values(array_unique($ids))]);
        }
        if (preg_match('/\b(' . $monthsRe . ') (\d{4})\b/', $t, $m)) { // « nés en mai 1950 »
            $mo = (int) array_search($m[1], array_map(static fn($x) => strtolower(ascii_fold($x)), QM_MONTHS), true); $y = (int) $m[2];
            $ids = array_column(array_filter($dated(), static fn($r) => $r[1] && (int) substr($r[1], 0, 4) === $y && (int) substr($r[1], 5, 2) === $mo), 0);
            $lab = 'en ' . QM_MONTHS[$mo] . ' ' . $y;
            return qm_answer(array_merge(["{$evLab} {$lab}"], $fl), $say($ids, $lab), ['ids' => array_values(array_unique($ids))]);
        }
        $repRe = implode('|', QM_REP_MONTHS);
        $an = '(?:\s+(?:de\s+)?(?:l[\'’]\s*)?an\s+([ivx]+|\d{1,2})\b)?';
        $rep = null;
        if (preg_match('/\b(1er|\d{1,2})(?:er|e)? (' . $repRe . ')\b' . $an . '/', $t, $m)) { $rep = [(int) $m[1], (int) array_search($m[2], QM_REP_MONTHS, true), $m[3] ?? '', $m[1] . ' ' . $m[2]]; }
        elseif (preg_match('/\b(\d)(?:er|e|eme)? (?:jour complementaire|jours complementaires|sans-?culottides?)\b' . $an . '/', $t, $m)) { $rep = [(int) $m[1], 13, $m[2] ?? '', $m[1] . 'e jour complémentaire']; }
        if ($rep) {
            [$d, $mo, $yTxt, $txt] = $rep;
            $txt = $mo <= 12 ? ($d === 1 ? '1er' : $d) . ' ' . ['', 'vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor'][$mo] : $txt;
            if ($yTxt !== '') {
                $ry = qm_roman($yTxt); $iso = $ry ? qm_rep_to_iso($ry, $mo, $d) : null;
                $lab = "le {$txt} an " . ($ry ? qm_roman_str($ry) : strtoupper($yTxt));
                if (!$iso) { return qm_answer(['date impossible'], "Je n’ai pas compris la date : {$lab} n’existe pas" . ($mo === 13 && $d === 6 && $ry ? ' (seules les années III, VII et XI ont un 6e jour complémentaire)' : (!$ry ? ' (le calendrier républicain va de l’an I à l’an XIV)' : '')) . '.'); }
                $ids = array_column(array_filter($dated(), static fn($r) => $r[1] === $iso), 0);
                return qm_answer(array_merge(["{$evLab} {$lab}", 'soit le ' . (new DateTime($iso))->format('j') . ' ' . QM_MONTHS[(int) substr($iso, 5, 2)] . ' ' . substr($iso, 0, 4)], $fl), $say($ids, $lab), ['ids' => array_values(array_unique($ids))]);
            }
            if ($d < 1 || ($mo <= 12 && $d > 30) || ($mo === 13 && $d > 6)) { return qm_answer(['date impossible'], "Je n’ai pas compris la date : le {$txt} n’existe pas."); }
            $ids = array_column(array_filter($dated(), static function ($r) use ($mo, $d) { $x = qm_iso_to_rep($r[1]); return $x && $x[1] === $mo && $x[2] === $d; }), 0);
            return qm_answer(array_merge(["{$evLab} un {$txt} (calendrier républicain)"], $fl), $say($ids, "un {$txt}"), ['ids' => array_values(array_unique($ids))]);
        }
        if (preg_match('/\bl[\'’]\s*an ([ivx]+|\d{1,2})\b/', $t, $m) && ($ry = qm_roman($m[1]))) {
            $from = QM_REP_START[$ry]; $to = (new DateTime(QM_REP_START[$ry + 1]))->modify('-1 day')->format('Y-m-d');
            $lab = 'en l’an ' . qm_roman_str($ry);
            $rows = $dated(); $ids = array_column(array_filter($rows, static fn($r) => $r[1] && $r[1] >= $from && $r[1] <= $to), 0);
            $maybe = array_values(array_unique(array_column(array_filter($rows, static fn($r) => !$r[1] && $r[2] !== null && $r[2] >= (int) substr($from, 0, 4) && $r[2] <= (int) substr($to, 0, 4)), 0)));
            $range = 'du ' . (new DateTime($from))->format('j') . ' ' . QM_MONTHS[(int) substr($from, 5, 2)] . ' ' . substr($from, 0, 4) . ' au ' . (new DateTime($to))->format('j') . ' ' . QM_MONTHS[(int) substr($to, 5, 2)] . ' ' . substr($to, 0, 4);
            return qm_answer(array_merge(["{$evLab} {$lab}", $range], $fl), $say($ids, $lab) . ($maybe ? ' Peut-être aussi ' . qm_n(count($maybe), 'autre personne', 'autres personnes') . ' (seule l’année ' . substr($from, 0, 4) . ' ou ' . substr($to, 0, 4) . ' est connue) : à vérifier.' : ''), ['ids' => array_values(array_unique(array_merge($ids, $maybe)))]);
        }
    }

    // ── l'âge au décès : « mort à 70 ans », « morts avant 5 ans », « décédés à plus de 90 ans »
    if ($evt === 'd' && preg_match('/\b(a l.age de|a plus de|a moins de|plus de|moins de|avant|apres|vers|a) (\d{1,3}) ans\b/', $t, $m)) {
        $op = $m[1]; $age = (int) $m[2];
        $test = match (true) { in_array($op, ['avant', 'a moins de', 'moins de'], true) => static fn(float $a) => $a < $age, in_array($op, ['apres', 'a plus de', 'plus de'], true) => static fn(float $a) => $a >= $age, $op === 'vers' => static fn(float $a) => abs($a - $age) <= 2, default => static fn(float $a) => (int) floor($a) === $age };
        $opLab = ['avant' => 'avant', 'a moins de' => 'à moins de', 'moins de' => 'à moins de', 'apres' => 'après', 'a plus de' => 'à plus de', 'plus de' => 'à plus de', 'vers' => 'vers'][$op] ?? 'à';
        $l = []; foreach ($kept() as $id => $p) { if ($p['by'] !== null && $p['dy'] !== null) { $a = qm_age($p['bd'], $p['by'], $p['dd'], $p['dy']); if ($a !== null && $a >= 0 && $a < 125 && $test($a)) { $l[] = [$id, qm_name($p) . " ({$p['by']}-{$p['dy']})", $a]; } } }
        usort($l, static fn($x, $y) => $x[2] <=> $y[2]);
        $lab = "{$opLab} {$age} ans";
        return qm_answer(array_merge(["âge au décès : {$lab}"], $fl), $say(array_column($l, 0), $lab), ['ids' => array_column($l, 0), 'rows' => qm_rows(array_map(static fn($r) => [$r[0], $r[1], $r[2] < 1 ? 'moins d’un an' : qm_years($r[2])], $l), 50)]);
    }

    // ── les dates incohérentes : « mort avant sa naissance », « dates impossibles », « incohérences »
    if (preg_match('/\b(avant (?:sa|son|leur) naissance|incoheren\w*|dates? impossibles?|erreurs? de dates?|dates? fausses?)\b/', $t)) {
        $onlyBirth = (bool) preg_match('/\bavant (?:sa|son|leur) naissance\b/', $t);
        $l = [];
        foreach ($P() as $id => $p) {
            if ($p['by'] === null || $p['dy'] === null || ($a = qm_age($p['bd'], $p['by'], $p['dd'], $p['dy'])) === null) { continue; }
            if ($a < 0 && $evt !== 'm') { $l[] = [$id, qm_name($p), "décès ({$p['dy']}) avant la naissance ({$p['by']})"]; }
            elseif (!$onlyBirth && $a >= 125) { $l[] = [$id, qm_name($p), 'mort à ' . qm_years($a) . ' : âge peu croyable']; }
        }
        foreach (qm_couples($pdo) as $c) { foreach ([$c['a'], $c['b']] as $x) { $p = $P()[$x] ?? null; if ($p && $c['my'] !== null && $p['by'] !== null && $c['my'] < $p['by'] && ($evt === 'm' || !$onlyBirth)) { $l[] = [$x, qm_name($p), "mariage ({$c['my']}) avant la naissance ({$p['by']})"]; } } }
        if (!$onlyBirth) {
            $pp = $P();
            foreach ($pp as $id => $p) { if ($p['by'] === null) { continue; } foreach (qm_parents($pdo, $id) as $par) { $q2 = $pp[$par] ?? null; if (!$q2) { continue; }
                if ($q2['by'] !== null && $p['by'] - $q2['by'] < 12) { $l[] = [$id, qm_name($p), 'né' . ($p['gender'] === 'female' ? 'e' : '') . " en {$p['by']}, " . ($q2['gender'] === 'female' ? 'sa mère' : ($q2['gender'] === 'male' ? 'son père' : 'son parent')) . ' ' . qm_name($q2) . " est né" . ($q2['gender'] === 'female' ? 'e' : '') . " en {$q2['by']}"]; }
                elseif ($q2['dy'] !== null && $p['by'] > $q2['dy'] + ($q2['gender'] === 'female' ? 0 : 1)) { $l[] = [$id, qm_name($p), 'né' . ($p['gender'] === 'female' ? 'e' : '') . " en {$p['by']}, après la mort de " . ($q2['gender'] === 'female' ? 'sa mère' : 'son père') . ' ' . qm_name($q2) . " ({$q2['dy']})"]; } } }
            // les jours qui n'existent pas (« 29 février 1900 », « 31 avril », « 6e jour complémentaire an II »)
            $monthsMap = array_flip(array_map(static fn($x) => strtolower(ascii_fold($x)), QM_MONTHS));
            foreach ($pdo->query("SELECT e.person_id, e.date_text, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND trim(COALESCE(e.date_text,''))<>''") as $e) {
                $id = (int) $e['person_id']; if (!isset($pp[$id])) { continue; } $dt = strtolower(ascii_fold((string) $e['date_text']));
                $bad = false;
                if (preg_match('/\b(1er|\d{1,2})(?:er)? (' . implode('|', array_keys($monthsMap)) . ') (\d{3,4})\b/', $dt, $m)) { $bad = !qm_valid_date((int) $m[1], $monthsMap[$m[2]], (int) $m[3]); }
                elseif (preg_match('/\b(\d{1,2})(?:er|e)? (' . implode('|', QM_REP_MONTHS) . '|jour complementaire|sans-?culottide)s? (?:de )?(?:l[\'’] ?)?an ([ivx]+|\d{1,2})\b/', $dt)) { $bad = qm_rep_text_iso($dt) === null; }
                if ($bad) { $l[] = [$id, qm_name($pp[$id]), 'date impossible : « ' . $e['date_text'] . ' » (' . mb_strtolower((string) $e['label']) . ')']; }
            }
        }
        $what = $onlyBirth ? ($evt === 'm' ? 'mariage avant la naissance' : 'décès avant la naissance') : 'dates incohérentes';
        $ids = array_values(array_unique(array_column($l, 0)));
        return qm_answer(array_merge([$what], $fl), $l ? qm_n(count($ids), 'fiche a', 'fiches ont') . ' ' . ($onlyBirth ? 'cette incohérence' : 'des dates à vérifier') . ' : ' . implode(' ; ', array_map(static fn($r) => "{$r[1]} — {$r[2]}", array_slice($l, 0, 5))) . (count($l) > 5 ? '…' : '') . '.' : 'Aucune incohérence trouvée' . ($onlyBirth ? ' : personne n’est ' . ($evt === 'm' ? 'marié' : 'mort') . ' avant sa naissance.' : ' dans les dates.'),
            ['ids' => $ids, 'rows' => qm_rows($l, 100)]);
    }

    // ── records
    if (preg_match('/\b(vecu le plus (longtemps|vieux)|plus (vieux|vieille|age|agee|ages|agees|grand age)|doyen|doyenne|centenaires?|plus longue vie|mort le plus vieux|morte la plus vieille)\b/', $t)) {
        $l = []; foreach ($kept() as $id => $p) { if ($p['by'] && $p['dy']) { $age = qm_age($p['bd'], $p['by'], $p['dd'], $p['dy']); if ($age !== null && $age >= 0 && $age < 125) { $l[] = [$id, qm_name($p) . " ({$p['by']}-{$p['dy']})", $age]; } } }
        usort($l, static fn($a, $b) => $b[2] <=> $a[2]);
        if (preg_match('/\bcentenaires?\b/', $t)) { $l = array_values(array_filter($l, static fn($r) => $r[2] >= 100)); }
        if (!$l) { return qm_answer(array_merge(['plus longue vie'], $fl), 'Aucune fiche avec une naissance et un décès datés.'); }
        $rows = array_map(static fn($r) => [$r[0], $r[1], qm_years($r[2])], $l);
        return qm_answer(array_merge(['plus longue vie'], $fl), "{$l[0][1]} a vécu le plus longtemps : " . qm_years($l[0][2]) . '.', ['rows' => qm_rows($rows)]);
    }
    if (preg_match('/\b(mort|morte|morts|decede|decedee|disparu)e?s? le plus jeune|plus jeune (a|au) (sa mort|deces)|morte? jeune\b/', $t)) {
        $l = []; foreach ($kept() as $id => $p) { if ($p['by'] && $p['dy']) { $age = qm_age($p['bd'], $p['by'], $p['dd'], $p['dy']); if ($age !== null && $age >= 0) { $l[] = [$id, qm_name($p) . " ({$p['by']}-{$p['dy']})", $age]; } } }
        usort($l, static fn($a, $b) => $a[2] <=> $b[2]);
        $adult = preg_match('/\badulte/', $t); if ($adult) { $l = array_values(array_filter($l, static fn($r) => $r[2] >= 18)); }
        return qm_answer(array_merge(['mort le plus jeune'], $fl), $l ? "{$l[0][1]} : " . ($l[0][2] < 1 ? 'moins d’un an' : qm_years($l[0][2])) . '.' : 'Aucune fiche avec une naissance et un décès datés.', ['rows' => qm_rows(array_map(static fn($r) => [$r[0], $r[1], $r[2] < 1 ? 'moins d’un an' : qm_years($r[2])], $l))]);
    }
    if (preg_match('/\b(plus (d|de) enfants|plus d.enfants|plus grande famille|famille la plus nombreuse|familles? nombreuses?|plus nombreuse)\b/', $t)) {
        $pp = $P(); $l = [];
        foreach (qm_couples($pdo) as $c) { if ($c['kids'] < 1) { continue; } $a = $pp[$c['a']] ?? null; $b = $pp[$c['b']] ?? null; $ref = $a ?: $b; if (!$ref || !qm_keep($f + ['gender' => ''], $ref, $c['my'] ?? $ref['by'])) { continue; }
            $l[] = [array_values(array_filter([$c['a'], $c['b']])), implode(' et ', array_filter([$a ? qm_name($a) : '', $b ? qm_name($b) : ''])), $c['kids']]; }
        usort($l, static fn($a, $b) => $b[2] <=> $a[2]);
        return qm_answer(array_merge(['familles les plus nombreuses'], $fl), $l ? "{$l[0][1]} : {$l[0][2]} enfants." : 'Aucun couple avec des enfants.', ['rows' => qm_rows(array_map(static fn($r) => [$r[0], $r[1], $r[2] . ' enfant' . ($r[2] > 1 ? 's' : '')], $l))]);
    }
    if (preg_match('/\b(marie|mariee|maries|mariees|mariage|epoux|epouses|couples?|conjoints)\b/', $t) && preg_match('/\b(plus jeune|plus tot|plus jeunes|plus vieux|plus vieille|plus tard|plus age|plus agee|ecart)\b/', $t)) {
        $pp = $P(); $l = []; $gap = preg_match('/\becart\b/', $t); $old = preg_match('/\b(plus vieux|plus vieille|plus tard|plus age|plus agee)\b/', $t);
        foreach (qm_couples($pdo) as $c) {
            if (!$c['my']) { continue; } $a = $pp[$c['a']] ?? null; $b = $pp[$c['b']] ?? null;
            if ($gap) { if ($a && $b && $a['by'] && $b['by'] && qm_keep(['gender' => ''] + $f, $a, $c['my'])) { $l[] = [[$c['a'], $c['b']], qm_name($a) . ' et ' . qm_name($b) . " (mariés en {$c['my']})", abs((float) qm_age($a['bd'], $a['by'], $b['bd'], $b['by']))]; } continue; }
            foreach ([$a, $b] as $x) { if ($x && $x['by'] && qm_keep(['from' => null, 'to' => null] + $f, $x) && qm_keep(['gender' => ''] + $f, $x, $c['my'])) { $age = qm_age($x['bd'], $x['by'], $c['md'], $c['my']); if ($age !== null && $age >= 10) { $l[] = [$x['id'], qm_name($x) . " (en {$c['my']})", $age]; } } }
        }
        usort($l, static fn($x, $y) => ($gap || $old) ? $y[2] <=> $x[2] : $x[2] <=> $y[2]);
        $lab = $gap ? 'plus grand écart d’âge entre époux' : ($old ? 'mariés les plus âgés' : 'mariés les plus jeunes');
        return qm_answer(array_merge([$lab], $fl), $l ? "{$l[0][1]} : " . qm_years($l[0][2]) . ($gap ? ' d’écart' : '') . '.' : 'Pas assez de dates (naissance et mariage).', ['rows' => qm_rows(array_map(static fn($r) => [$r[0], $r[1], qm_years($r[2]) . ($gap ? ' d’écart' : '')], $l))]);
    }
    if (preg_match('/\b(plus ancien|plus ancienne|plus lointain|plus lointaine|plus vieil ancetre|premier ancetre|plus anciens|plus vieux ancetre|ne le plus tot)\b/', $t)) {
        $l = []; foreach ($kept() as $id => $p) { if ($p['by']) { $l[] = [$id, qm_name($p) . ($p['bplace'] ? ' — ' . $p['bplace'] : ''), $p['by']]; } }
        usort($l, static fn($a, $b) => $a[2] <=> $b[2]);
        return qm_answer(array_merge(['les plus anciens'], $fl), $l ? "{$l[0][1]}, né" . ($P()[$l[0][0]]['gender'] === 'female' ? 'e' : '') . " en {$l[0][2]}." : 'Aucune naissance datée.', ['rows' => qm_rows(array_map(static fn($r) => [$r[0], $r[1], 'né(e) en ' . $r[2]], $l))]);
    }

    // ── moyennes
    if (preg_match('/\b(moyen|moyenne|en moyenne|esperance de vie|age median)\b/', $t)) {
        $stats = static function (array $v) { if (!$v) { return null; } sort($v); $n = count($v); return ['avg' => array_sum($v) / $n, 'med' => $v[intdiv($n, 2)], 'n' => $n, 'min' => $v[0], 'max' => $v[$n - 1]]; };
        $byGender = static function (callable $val) use ($kept) { $o = ['male' => [], 'female' => [], 'all' => []]; foreach ($kept() as $p) { $v = $val($p); if ($v === null) { continue; } $o['all'][] = $v; if (isset($o[$p['gender']])) { $o[$p['gender']][] = $v; } } return $o; };
        $facts = []; $what = '';
        $fmtS = static fn(?array $s, string $u = 'ans') => $s ? number_format($s['avg'], 1, ',', ' ') . " {$u} (médiane " . number_format((float) $s['med'], 0, ',', ' ') . ", sur {$s['n']})" : '—';
        if (preg_match('/\b(mariage|marie|mariee|maries|se mari)/', $t)) {
            $first = []; foreach (qm_couples($pdo) as $c) { if (!$c['my']) { continue; } foreach ([$c['a'], $c['b']] as $x) { if ($x && (!isset($first[$x]) || $c['my'] < $first[$x][1])) { $first[$x] = [$c['md'], $c['my']]; } } }
            $v = $byGender(static fn($p) => isset($first[$p['id']]) && $p['by'] ? (($a = qm_age($p['bd'], $p['by'], $first[$p['id']][0], $first[$p['id']][1])) !== null && $a >= 12 && $a < 90 ? $a : null) : null); $what = 'âge moyen au premier mariage';
        } elseif (preg_match('/\b(premier enfant|premiere naissance|devenir (pere|mere|parent))\b/', $t)) {
            $firstKid = []; $pp = $P(); foreach ($pdo->query('SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id') as $r) { $k = $pp[(int) $r['child_id']] ?? null; if (!$k || !$k['by']) { continue; } foreach ([$r['partner1_id'], $r['partner2_id']] as $x) { $x = (int) $x; if ($x && (!isset($firstKid[$x]) || $k['by'] < $firstKid[$x][1])) { $firstKid[$x] = [$k['bd'], $k['by']]; } } }
            $v = $byGender(static fn($p) => isset($firstKid[$p['id']]) && $p['by'] ? (($a = qm_age($p['bd'], $p['by'], $firstKid[$p['id']][0], $firstKid[$p['id']][1])) !== null && $a >= 12 && $a < 70 ? $a : null) : null); $what = 'âge moyen à la naissance du premier enfant';
        } elseif (preg_match('/\b(enfants?)\b/', $t)) {
            $l = array_values(array_map(static fn($c) => $c['kids'], array_filter(qm_couples($pdo), static fn($c) => $c['kids'] > 0 && qm_keep(['gender' => ''] + $f, ($P()[$c['a']] ?? $P()[$c['b']] ?? ['gender' => '', 'id' => 0, 'by' => null]), $c['my']))));
            $s = $stats($l);
            return qm_answer(array_merge(['nombre moyen d’enfants par couple'], $fl), $s ? 'En moyenne ' . number_format($s['avg'], 1, ',', ' ') . " enfants par couple (sur {$s['n']} couples avec enfants ; de {$s['min']} à {$s['max']})." : 'Aucun couple avec des enfants.', ['facts' => $s ? [['Moyenne', number_format($s['avg'], 1, ',', ' ')], ['Médiane', (string) $s['med']], ['Couples', (string) $s['n']], ['Le plus', (string) $s['max']]] : []]);
        } else {
            $v = $byGender(static fn($p) => $p['by'] && $p['dy'] ? (($a = qm_age($p['bd'], $p['by'], $p['dd'], $p['dy'])) !== null && $a >= 0 && $a < 125 ? $a : null) : null); $what = 'âge moyen au décès';
            if (preg_match('/\badulte/', $t)) { $v = array_map(static fn($l) => array_values(array_filter($l, static fn($a) => $a >= 18)), $v); $what .= ' (adultes)'; }
        }
        $sa = $stats($v['all']); $sm = $stats($v['male']); $sf = $stats($v['female']);
        $facts = [['Tous', $fmtS($sa)], ['Hommes', $fmtS($sm)], ['Femmes', $fmtS($sf)]];
        if ($sa) { $facts[] = ['Écart', qm_years($sa['min']) . ' à ' . qm_years($sa['max'])]; }
        return qm_answer(array_merge([$what], $fl), $sa ? ucfirst($what) . ' : ' . number_format($sa['avg'], 1, ',', ' ') . ' ans' . ($sm && $sf ? ' (hommes ' . number_format($sm['avg'], 1, ',', ' ') . ', femmes ' . number_format($sf['avg'], 1, ',', ' ') . ')' : '') . '.' . ($what === 'âge moyen au décès' && !preg_match('/\badulte/', $t) ? ' La mortalité des enfants fait beaucoup baisser cette moyenne : demande « âge moyen au décès des adultes ».' : '') : 'Pas assez de dates pour calculer.', ['facts' => $facts]);
    }

    // ── les plus fréquents
    if (preg_match('/\b(plus (frequent|frequente|frequents|frequentes|courant|courante|courants|courantes|repandu|repandus|donne|donnes|porte|portes|populaire|populaires)|les plus|le plus|la plus|palmares|classement|top|repartition)\b/', $t)
        && preg_match('/\b(prenoms?|noms?|patronymes?|metiers?|professions?|villes?|communes?|lieux|villages?|mois|saisons?)\b/', $t, $what)) {
        $w = $what[1]; $count = []; $who = [];
        $add = static function (string $k, int $id) use (&$count, &$who) { $k = trim($k); if ($k === '') { return; } $count[$k] = ($count[$k] ?? 0) + 1; if (count($who[$k] ?? []) < 400) { $who[$k][] = $id; } };
        $evt = preg_match('/\b(mari|mariage)/', $t) ? 'm' : (preg_match('/\b(mort|deces|decede)/', $t) ? 'd' : 'b');
        if (str_starts_with($w, 'prenom')) { foreach ($kept() as $id => $p) { $add(preg_split('/[\s-]+/u', trim($p['first']))[0] ?? '', $id); } $lab = 'prénoms les plus fréquents'; }
        elseif (str_starts_with($w, 'nom') || str_starts_with($w, 'patronyme')) { foreach ($kept() as $id => $p) { $add(mb_strtoupper($p['last']), $id); } $lab = 'noms les plus fréquents'; }
        elseif (str_starts_with($w, 'metier') || str_starts_with($w, 'profession')) { foreach ($kept() as $id => $p) { $add(mb_strtolower(preg_split('/[,;\/]/u', $p['occupation'])[0] ?? ''), $id); } $lab = 'métiers les plus fréquents'; }
        elseif (in_array($w, ['mois', 'saison', 'saisons'], true)) {
            $seasons = [12 => 'hiver', 1 => 'hiver', 2 => 'hiver', 3 => 'printemps', 4 => 'printemps', 5 => 'printemps', 6 => 'été', 7 => 'été', 8 => 'été', 9 => 'automne', 10 => 'automne', 11 => 'automne'];
            if ($evt === 'm') { foreach (qm_couples($pdo) as $c) { if ($c['md'] && ($x = $P()[$c['a']] ?? $P()[$c['b']] ?? null) && qm_keep(['gender' => ''] + $f, $x, $c['my'])) { $m = (int) substr($c['md'], 5, 2); $add($w === 'mois' ? QM_MONTHS[$m] : $seasons[$m], $c['a'] ?: $c['b']); } } }
            else { foreach ($kept() as $id => $p) { $d = $evt === 'd' ? $p['dd'] : $p['bd']; if ($d) { $m = (int) substr($d, 5, 2); $add($w === 'mois' ? QM_MONTHS[$m] : $seasons[$m], $id); } } }
            $lab = ($w === 'mois' ? 'mois' : 'saisons') . ' des ' . ['b' => 'naissances', 'd' => 'décès', 'm' => 'mariages'][$evt];
        } else { foreach ($kept() as $id => $p) { $pl = $evt === 'd' ? $p['dplace'] : $p['bplace']; $add(trim(explode(',', $pl)[0]), $id); } $lab = 'lieux de ' . ($evt === 'd' ? 'décès' : 'naissance') . ' les plus fréquents'; }
        arsort($count); $tot = array_sum($count) ?: 1;
        $rows = []; foreach (array_slice($count, 0, 20, true) as $k => $n) { $rows[] = ['ids' => $who[$k] ?? [], 'label' => (string) $k, 'value' => $n . ' (' . round($n / $tot * 100) . ' %)', 'group' => true]; }
        $k0 = array_key_first($count);
        return qm_answer(array_merge([$lab], $fl), $k0 !== null ? ucfirst($lab) . ' : en tête, « ' . $k0 . ' » (' . $count[$k0] . ' fois sur ' . $tot . '), puis ' . implode(', ', array_slice(array_keys($count), 1, 4)) . '.' : 'Pas de données.', ['rows' => $rows]);
    }

    // ── combien d'ancêtres, de générations
    if (preg_match('/\bcombien\b/', $t) && preg_match('/\b(ancetres|generations|aieux|ascendants)\b/', $t)) {
        // la personne citée (« combien d'ancêtres a Jean MARTIN », « … a Louis ») ; sinon la personne de départ, en le disant
        $who = qm_pick_person($pdo, $q, $personId);
        if (!empty($who['ask'])) { return qm_ask_which($pdo, $who, 'ancêtres'); }
        $cited = !empty($who['id']); $root = $cited ? (int) $who['id'] : qm_root($pdo);
        $rootName = $root && isset($all[$root]) ? qm_name($all[$root]) : '';
        $anc = $root ? h_ancestors($pdo, $root, 40) : []; unset($anc[$root]); $by = [];
        foreach ($anc as $g) { $by[$g - 1] = ($by[$g - 1] ?? 0) + 1; } // h_ancestors : 2 = parents → génération 1
        ksort($by); $distinct = count($anc);
        $slots = function_exists('sosa_positions') ? count(sosa_positions($pdo, $root, 200000)['positions'] ?? []) - 1 : $distinct; // implexe : un même ancêtre à plusieurs places
        $names = [1 => 'parents', 2 => 'grands-parents', 3 => 'arrière-grands-parents', 4 => 'arrière-arrière-grands-parents'];
        $rows = []; foreach ($by as $g => $n) { $exp = 1 << $g; $rows[] = ['ids' => [], 'label' => 'Génération ' . ($g + 1) . ' — ' . ($names[$g] ?? "{$exp} ancêtres possibles"), 'value' => "{$n} / {$exp} (" . round($n / $exp * 100) . ' %)']; }
        $forWho = $cited ? $rootName : ($rootName !== '' ? "la personne de départ ({$rootName})" : 'la personne de départ');
        $implexe = $slots - $distinct;
        return qm_answer(['ancêtres trouvés par génération', $cited ? 'ancêtres ' . qm_de($rootName) : "pour la personne de départ : {$rootName}"],
            $by ? ucfirst($forWho) . ' : ' . qm_n($distinct, 'ancêtre connu', 'ancêtres connus') . ' sur ' . qm_n(count($by), 'génération', 'générations') . ' (' . ($implexe > 0 ? qm_n($implexe, 'place occupée', 'places occupées') . ' par un même ancêtre : implexe' : 'sans implexe') . ').' : 'Aucun ancêtre connu pour ' . $forWho . '.',
            ['rows' => $rows]);
    }

    // ── nés tel jour / tel mois (« nés un 25 décembre », « nés en mai »)
    if (preg_match('/\b(nee?s?|naissances?|marie(?:e|s|es)?|morte?s?|decede(?:e|s|es)?)\b.*?\b(?:un |le |en )?(?:(\d{1,2})(?:er)? )?(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b(?! \d{4})/', $t, $m)) {
        $mon = array_search($m[3], array_map(static fn($x) => strtolower(ascii_fold($x)), QM_MONTHS), true); $day = ($m[2] ?? '') !== '' ? (int) $m[2] : 0;
        $evt = preg_match('/^(morte?s?|decede)/', $m[1]) ? 'd' : (str_starts_with($m[1], 'mari') ? 'm' : 'b'); $ids = [];
        if ($evt === 'm') { foreach (qm_couples($pdo) as $c) { if ($c['md'] && (int) substr($c['md'], 5, 2) === $mon && (!$day || (int) substr($c['md'], 8, 2) === $day)) { array_push($ids, ...array_filter([$c['a'], $c['b']])); } } }
        else { foreach ($kept() as $id => $p) { $d = $p[$evt . 'd']; if ($d && (int) substr($d, 5, 2) === $mon && (!$day || (int) substr($d, 8, 2) === $day)) { $ids[] = $id; } } }
        $lab = ($day ? 'le ' . ($day === 1 ? '1er' : $day) . ' ' : 'en ') . QM_MONTHS[$mon];
        return qm_answer(array_merge([['b' => 'naissance', 'd' => 'décès', 'm' => 'mariage'][$evt] . ' ' . $lab], $fl), (($n = count(array_unique($ids))) < 1 ? 'Aucune personne.' : ($n < 2 ? "{$n} personne." : "{$n} personnes.")), ['ids' => array_values(array_unique($ids))]);
    }
    // ── les animaux (« qui sont les animaux », « combien d'animaux ») : fiches « animal », comptées à part des personnes
    if ($animals && preg_match('/\b(qui|quels?|quelles?|combien|liste|montre|donne|sont)\b/', $t)) {
        $ids = array_keys($kept());
        return qm_answer(array_merge(['animaux'], $fl), $ids ? qm_n(count($ids), 'animal', 'animaux') . ' dans la base.' : 'Aucun animal dans la base (une fiche devient « animal » depuis l’outil Animaux).', ['ids' => $ids]);
    }
    return null;
}
