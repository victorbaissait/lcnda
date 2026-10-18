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

/** les fiches avec leurs repères (naissance, décès, lieux, dates exactes), une seule lecture par question */
function qm_people(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $p = [];
    foreach ($pdo->query("SELECT id, COALESCE(first_name,'') AS first, COALESCE(last_name,'') AS last, COALESCE(gender,'') AS gender, COALESCE(occupation,'') AS occupation, COALESCE(living_status,'') AS living FROM persons") as $r) {
        $p[(int) $r['id']] = ['id' => (int) $r['id']] + $r + ['by' => null, 'bd' => null, 'bplace' => '', 'dy' => null, 'dd' => null, 'dplace' => ''];
    }
    $rows = $pdo->query("SELECT e.person_id, e.year, e.date_text, t.gedcom_tag, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY t.gedcom_tag IN ('BIRT','DEAT') DESC")->fetchAll();
    foreach ($rows as $e) {
        $id = (int) $e['person_id']; if (!isset($p[$id])) { continue; }
        $birth = in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true); $k = $birth ? 'b' : 'd';
        if ($p[$id][$k . 'y'] === null && $e['year'] !== null) { $p[$id][$k . 'y'] = (int) $e['year']; $p[$id][$k . 'd'] = exact_date((string) $e['date_text']); }
        if ($p[$id][$k . 'place'] === '' && $e['place'] !== '') { $p[$id][$k . 'place'] = (string) $e['place']; }
    }
    return $cache = $p;
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
/** les personnes citées dans la question (suites de mots qui forment un prénom + un nom de la base), de gauche à droite */
function qm_find_people(PDO $pdo, string $q): array
{
    preg_match_all('/[\p{L}\p{M}-]+/u', $q, $mm, PREG_OFFSET_CAPTURE);
    $tok = array_map(static fn($m) => strtolower(ascii_fold($m[0])), $mm[0]);
    $part = ['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'van', 'von', 'der'];
    $people = [];
    foreach (qm_people($pdo) as $id => $p) {
        $fi = preg_split('/[\s-]+/', strtolower(ascii_fold($p['first'])), -1, PREG_SPLIT_NO_EMPTY); $la = preg_split('/[\s-]+/', strtolower(ascii_fold($p['last'])), -1, PREG_SPLIT_NO_EMPTY);
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
    $f = $gx === 'female'; $e = $f ? 'e' : '';
    $great = static fn(int $n, string $base) => str_repeat('arrière-', max(0, $n)) . $base;
    if ($a === 0) { return $b === 1 ? ($f ? 'la mère' : 'le père') : ($f ? 'l’' . $great($b - 2, 'grand-mère') : 'l’' . $great($b - 2, 'grand-père')); }
    if ($b === 0) { return $a === 1 ? ($f ? 'la fille' : 'le fils') : ($f ? 'l’' . $great($a - 2, 'petite-fille') : 'l’' . $great($a - 2, 'petit-fils')); }
    $demi = $half ? 'demi-' : '';
    if ($a === 1 && $b === 1) { return $f ? "la {$demi}sœur" : "le {$demi}frère"; }
    if ($a === 1) { return ($f ? 'la ' : 'le ') . $demi . ($b === 2 ? ($f ? 'tante' : 'oncle') : $great($b - 3, $f ? 'grand-tante' : 'grand-oncle')); }
    if ($b === 1) { return ($f ? 'la ' : 'le ') . $demi . ($a === 2 ? ($f ? 'nièce' : 'neveu') : $great($a - 3, $f ? 'petite-nièce' : 'petit-neveu')); }
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
    $people = null; $P = static function () use ($pdo, &$people) { return $people ??= qm_people($pdo); };
    $now = (int) date('Y');

    // ── lien de parenté entre deux personnes
    if (preg_match('/\b(lien|parente|apparente|apparentes|relie|relies|cousins?|qu.est .* pour|quel rapport)\b/', $t)) {
        $ids = qm_find_people($pdo, $q);
        if (count($ids) >= 2) {
            [$x, $y] = $ids; $pp = $P(); $nx = qm_name($pp[$x]); $ny = qm_name($pp[$y]);
            $k = qm_kinship($pdo, $x, $y);
            if (!$k) { // par alliance : X est le conjoint d'un parent de sang de Y, ou l'inverse
                foreach (qm_couples($pdo) as $c) {
                    foreach ([[$c['a'], $c['b']], [$c['b'], $c['a']]] as [$sp, $other]) {
                        if ($sp === $x && $other && ($k2 = qm_kinship($pdo, $other, $y))) { $lab = qm_kin_label($k2['a'], $k2['b'], $pp[$other]['gender'] ?? '', $k2['half']); return qm_answer(['lien de parenté', "{$nx} et {$ny}"], "Par alliance : {$nx} est l’époux ou l’épouse de " . qm_name($pp[$other]) . ", qui est {$lab} de {$ny}.", ['ids' => [$x, $y, $other]]); }
                    }
                }
                return qm_answer(['lien de parenté', "{$nx} et {$ny}"], "Aucun ancêtre commun connu dans l’arbre entre {$nx} et {$ny}.");
            }
            $label = qm_kin_label($k['a'], $k['b'], $pp[$x]['gender'] ?? '', $k['half']);
            $anc = implode(' et ', array_map(static fn($i) => qm_name($pp[$i]), array_slice($k['commons'], 0, 2)));
            $civil = $k['a'] + $k['b'];
            $facts = [['Lien', ucfirst($label) . " de {$ny}"], ['Ancêtre(s) commun(s)', $anc], ['Générations', "{$nx} : {$k['a']} · {$ny} : {$k['b']}"], ['Degré (droit civil)', $civil . 'e degré']];
            return qm_answer(['lien de parenté', "{$nx} et {$ny}"], ($k['a'] === 0 && $k['b'] === 0) ? 'C’est la même personne.' : "{$nx} est {$label} de {$ny}." . ($anc && $k['a'] && $k['b'] ? " Ancêtre(s) commun(s) : {$anc}." : ''), ['facts' => $facts, 'ids' => [$x, $y]]);
        }
    }

    // ── les faits d'une personne : quand / où est-il né, mort, marié ; quel âge…
    if (preg_match('/\b(quand|en quelle annee|quelle date|ou|quel age|a quel age|combien de temps)\b/', $t) && preg_match('/\b(nee?|naissance|mort|morte|decede|decedee|deces|marie|mariee|mariage|age|aurait|vecu)\b/', $t)) {
        $ids = qm_find_people($pdo, $q);
        if (count($ids) === 1) {
            $id = $ids[0]; $p = $P()[$id]; $n = qm_name($p); $facts = [];
            $when = static fn(?string $d, ?int $y) => $d ? (new DateTime($d))->format('j') . ' ' . QM_MONTHS[(int) substr($d, 5, 2)] . ' ' . substr($d, 0, 4) : ($y ? "en {$y}" : '');
            $wd = static fn(?string $d) => $d ? 'le ' : '';
            $marr = array_values(array_filter(qm_couples($pdo), static fn($c) => $c['a'] === $id || $c['b'] === $id));
            if ($p['by']) { $facts[] = ['Naissance', trim($when($p['bd'], $p['by']) . ($p['bplace'] ? ' à ' . $p['bplace'] : ''))]; }
            if ($p['dy']) { $facts[] = ['Décès', trim($when($p['dd'], $p['dy']) . ($p['dplace'] ? ' à ' . $p['dplace'] : ''))]; }
            foreach ($marr as $c) { $sp = $c['a'] === $id ? $c['b'] : $c['a']; if ($c['my']) { $age = qm_age($p['bd'], $p['by'], $c['md'], $c['my']); $facts[] = ['Mariage', trim($when($c['md'], $c['my']) . ($sp && isset($P()[$sp]) ? ' avec ' . qm_name($P()[$sp]) : '') . ($age !== null ? ' — à ' . qm_years($age) : ''))]; } }
            if ($p['by'] && $p['dy']) { $facts[] = ['Âge au décès', qm_years((float) qm_age($p['bd'], $p['by'], $p['dd'], $p['dy']))]; }
            if (preg_match('/\b(aurait|aujourd.hui)\b/', $t) && $p['by']) { $age = qm_age($p['bd'], $p['by'], date('Y-m-d'), $now); return qm_answer(['âge aujourd’hui', $n], "{$n} aurait " . qm_years((float) $age) . ' aujourd’hui' . ($p['dy'] ? " (décédé" . ($p['gender'] === 'female' ? 'e' : '') . " en {$p['dy']})" : '') . '.', ['facts' => $facts, 'ids' => [$id]]); }
            if (preg_match('/\bage\b/', $t) && preg_match('/\b(mariage|marie|mariee)\b/', $t) && $marr && $marr[0]['my'] && $p['by']) { $age = qm_age($p['bd'], $p['by'], $marr[0]['md'], $marr[0]['my']); return qm_answer(['âge au mariage', $n], "{$n} avait " . qm_years((float) $age) . " à son mariage ({$marr[0]['my']}).", ['facts' => $facts, 'ids' => [$id]]); }
            if (preg_match('/\b(age|vecu|combien de temps)\b/', $t) && $p['by'] && $p['dy']) { return qm_answer(['âge au décès', $n], "{$n} est mort" . ($p['gender'] === 'female' ? 'e' : '') . ' à ' . qm_years((float) qm_age($p['bd'], $p['by'], $p['dd'], $p['dy'])) . '.', ['facts' => $facts, 'ids' => [$id]]); }
            $kind = preg_match('/\b(mort|morte|decede|decedee|deces)\b/', $t) ? 'd' : (preg_match('/\b(marie|mariee|mariage)\b/', $t) ? 'm' : 'b');
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
        $root = qm_root($pdo); $anc = $root ? h_ancestors($pdo, $root, 40) : []; unset($anc[$root]); $by = [];
        foreach ($anc as $g) { $by[$g - 1] = ($by[$g - 1] ?? 0) + 1; } // h_ancestors : 2 = parents → génération 1
        ksort($by); $distinct = count($anc);
        $slots = function_exists('sosa_positions') ? count(sosa_positions($pdo, $root, 200000)['positions'] ?? []) - 1 : $distinct; // implexe : un même ancêtre à plusieurs places
        $names = [1 => 'parents', 2 => 'grands-parents', 3 => 'arrière-grands-parents', 4 => 'arrière-arrière-grands-parents'];
        $rows = []; foreach ($by as $g => $n) { $exp = 1 << $g; $rows[] = ['ids' => [], 'label' => 'Génération ' . ($g + 1) . ' — ' . ($names[$g] ?? "{$exp} ancêtres possibles"), 'value' => "{$n} / {$exp} (" . round($n / $exp * 100) . ' %)']; }
        return qm_answer(['ancêtres trouvés par génération'], $by ? "{$distinct} ancêtres connus sur " . count($by) . ' générations (' . ($slots - $distinct > 0 ? ($slots - $distinct) . ' places occupées par un même ancêtre : implexe' : 'sans implexe') . ').' : 'Aucun ancêtre connu pour la personne de départ.', ['rows' => $rows]);
    }

    // ── nés tel jour / tel mois (« nés un 25 décembre », « nés en mai »)
    if (preg_match('/\b(nee?s?|naissances?|marie(?:e|s|es)?|morte?s?|decede(?:e|s|es)?)\b.*?\b(?:un |le |en )?(?:(\d{1,2})(?:er)? )?(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b(?! \d{4})/', $t, $m)) {
        $mon = array_search($m[3], array_map(static fn($x) => strtolower(ascii_fold($x)), QM_MONTHS), true); $day = ($m[2] ?? '') !== '' ? (int) $m[2] : 0;
        $evt = preg_match('/^(morte?s?|decede)/', $m[1]) ? 'd' : (str_starts_with($m[1], 'mari') ? 'm' : 'b'); $ids = [];
        if ($evt === 'm') { foreach (qm_couples($pdo) as $c) { if ($c['md'] && (int) substr($c['md'], 5, 2) === $mon && (!$day || (int) substr($c['md'], 8, 2) === $day)) { array_push($ids, ...array_filter([$c['a'], $c['b']])); } } }
        else { foreach ($kept() as $id => $p) { $d = $p[$evt . 'd']; if ($d && (int) substr($d, 5, 2) === $mon && (!$day || (int) substr($d, 8, 2) === $day)) { $ids[] = $id; } } }
        $lab = ($day ? 'le ' . ($day === 1 ? '1er' : $day) . ' ' : 'en ') . QM_MONTHS[$mon];
        return qm_answer(array_merge([['b' => 'naissance', 'd' => 'décès', 'm' => 'mariage'][$evt] . ' ' . $lab], $fl), (($n = count(array_unique($ids))) < 2 ? "{$n} personne." : "{$n} personnes."), ['ids' => array_values(array_unique($ids))]);
    }
    return null;
}
