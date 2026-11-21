<?php
declare(strict_types=1);

/**
 * LCNDA — 🗺️ Cartes en plus, vague 2 (maquette docs/design/cartes-nouvelles.html) : les données des cinq nouvelles cartes de
 * Graphiques → Cartes (assets/js/heritage-diagram-cartes-plus2.js). Mode d'emploi : docs/UI.md (« 🗺️ Cartes en plus, vague 2 »).
 *
 *   GET cartes_plus2&what=trades   🔨 les métiers, placés (lieu de l'acte, sinon résidence de l'époque, sinon naissance)
 *   GET cartes_plus2&what=mirror   👫 deux (ou quatre) groupes de personnes → leurs lieux, années, ancêtres des deux côtés
 *   GET cartes_plus2&what=areas    ⭕ les événements des ancêtres, génération par génération (ou siècle, ou une vie)
 *   GET cartes_plus2&what=links    🕸 parrains, marraines, témoins : village de l'acte ↔ village d'où vient le témoin
 *   GET cartes_plus2&what=crises   ⚰️ les décès placés et datés, les crises du 🌍 Monde autour et tes événements locaux
 *
 * Lecture seule. Tout passe par cp_hidden() (lib/cartes_plus.php) : jamais un vivant ni une fiche confidentielle, ni à l'écran
 * ni à l'export (filtré ici, côté serveur, pas seulement caché dans le dessin). Rien de nouveau en base. Aucun appel en ligne.
 * Essais : tests/test-cartes-nouvelles.js.
 */

require_once __DIR__ . '/cartes_plus.php';
require_once __DIR__ . '/diagram_genea.php';
require_once __DIR__ . '/diagram_options.php';

/** un nombre entier borné, lu dans la demande */
function cp2_int(array $q, string $k, int $def, int $min, int $max): int
{
    $v = $q[$k] ?? null;
    if (!is_scalar($v) || !preg_match('/^-?\d{1,9}$/', trim((string) $v))) { return $def; }
    return max($min, min($max, (int) $v));
}

/** un mot parmi une liste connue */
function cp2_pick(array $q, string $k, array $allowed, string $def): string
{
    $v = is_scalar($q[$k] ?? null) ? (string) $q[$k] : '';
    return in_array($v, $allowed, true) ? $v : $def;
}

/** une liste d'étiquettes d'événements « births,marriages » → les balises GEDCOM */
function cp2_tags(string $list): array
{
    $tags = [];
    foreach (explode(',', $list) as $w) { foreach (CP_EV_GROUPS[trim($w)] ?? [] as $t) { $tags[$t] = true; } }
    return $tags ? array_keys($tags) : array_merge(...array_values(CP_EV_GROUPS));
}

/** les événements situés (et datés si on les a) de ces personnes : [[personne, lieu, année, balise]] — sans les fiches cachées */
function cp2_events(PDO $pdo, array $tags, array $persons, int $max = 40000): array
{
    if (!$persons) { return []; }
    $hidden = cp_hidden($pdo); $out = [];
    $in = implode(',', array_map(static fn($t) => $pdo->quote($t), $tags));
    foreach (array_chunk(array_values(array_unique(array_map('intval', $persons))), 400) as $chunk) {
        $ids = implode(',', $chunk);
        $sql = "SELECT e.person_id AS pid, e.place_id, e.year, t.gedcom_tag AS tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($ids) AND t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL
            UNION ALL SELECT f.partner1_id, e.place_id, e.year, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE f.partner1_id IN ($ids) AND t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL
            UNION ALL SELECT f.partner2_id, e.place_id, e.year, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE f.partner2_id IN ($ids) AND t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL";
        foreach ($pdo->query($sql) as $r) {
            $pid = (int) $r['pid']; if (isset($hidden[$pid])) { continue; }
            $out[] = [$pid, (int) $r['place_id'], $r['year'] !== null && (int) $r['year'] > 0 ? (int) $r['year'] : null, (string) $r['tag']];
            if (count($out) >= $max) { return $out; }
        }
    }
    return $out;
}

/** les lieux d'événements qui n'ont pas de position (pour « ⚠ Lieux sans position » et le lien vers 📍 Lieux à placer) */
function cp2_unplaced(PDO $pdo, array $placeIds, array $placed): array
{
    $miss = array_values(array_diff(array_unique(array_map('intval', $placeIds)), array_map('intval', array_keys($placed))));
    $out = [];
    foreach (array_chunk(array_slice($miss, 0, 400), 400) as $chunk) {
        foreach ($pdo->query('SELECT id, name FROM places WHERE id IN (' . implode(',', $chunk) . ')') as $p) { $out[] = ['id' => (int) $p['id'], 'name' => mb_substr(trim((string) $p['name']), 0, 80)]; }
    }
    return ['count' => count($miss), 'list' => array_slice($out, 0, 60)];
}

/** la personne de départ : son numéro, et si elle se montre (pas vivante, pas confidentielle) ; sinon son nom de famille seulement */
function cp2_root(PDO $pdo, int $asked): array
{
    $root = dgn_root($pdo, $asked);
    if (!$root) { return ['id' => 0, 'shown' => false, 'name' => '', 'family' => '']; }
    $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$root]); $p = $s->fetch() ?: [];
    $shown = !isset(cp_hidden($pdo)[$root]);
    $family = mb_strtoupper(trim((string) ($p['last_name'] ?? '')));
    return ['id' => $root, 'shown' => $shown, 'name' => $shown ? dgn_name($p) : '', 'family' => mb_substr($family, 0, 60)];
}

/** le groupe de personnes : toute la base (null), mes ancêtres, côté père, côté mère — id → génération (ou true) */
function cp2_pop(PDO $pdo, string $pop, int $root, int $gens = 0): ?array
{
    if (!in_array($pop, ['anc', 'pat', 'mat', 'desc'], true)) { return null; }
    $root = dgn_root($pdo, $root); if (!$root) { return []; }
    return $pop === 'anc' || $pop === 'desc' ? dgo_walk($pdo, $root, $gens, $pop === 'anc') : dgo_branch($pdo, $root, $gens, $pop === 'pat');
}

/** les lieux de résidence (et de recensement) datés de ces personnes, et leur lieu de naissance : pour placer ce qui n'a pas de lieu */
function cp2_fallback_places(PDO $pdo, array $ids): array
{
    $resi = []; $birth = [];
    foreach (array_chunk(array_values(array_unique(array_map('intval', $ids))), 400) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT e.person_id AS pid, e.place_id, e.year, t.gedcom_tag AS tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($in) AND e.place_id IS NOT NULL AND t.gedcom_tag IN ('RESI','CENS','BIRT','CHR','BAPM')") as $r) {
            if (in_array($r['tag'], ['RESI', 'CENS'], true)) { $resi[(int) $r['pid']][] = [(int) $r['place_id'], $r['year'] !== null ? (int) $r['year'] : null]; }
            elseif (!isset($birth[(int) $r['pid']]) || $r['tag'] === 'BIRT') { $birth[(int) $r['pid']] = [(int) $r['place_id'], $r['year'] !== null ? (int) $r['year'] : null]; }
        }
    }
    return [$resi, $birth];
}

/** 🔨 les métiers, placés : [personne, lieu, année, clé du métier, secteur, domaine, d'où (acte, recensement, fiche)] */
function cp2_trades(PDO $pdo, array $q): array
{
    require_once __DIR__ . '/metiers_carte.php';
    $chain = ($q['where'] ?? '') !== 'act';
    $hidden = cp_hidden($pdo);
    $only = cp2_pop($pdo, cp2_pick($q, 'pop', ['all', 'anc', 'pat', 'mat'], 'all'), cp2_int($q, 'root', 0, 0, PHP_INT_MAX), 0);
    $ok = static fn(int $pid) => $pid > 0 && !isset($hidden[$pid]) && ($only === null || isset($only[$pid]));
    $raw = [];
    $sql = "SELECT e.person_id AS pid, e.place_id AS pl, e.year, COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')) AS val, 'act' AS src FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.person_id IS NOT NULL AND (t.gedcom_tag='OCCU' OR LOWER(t.label) LIKE '%profes%' OR LOWER(t.label) LIKE '%m%tier%') AND COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')) IS NOT NULL
        UNION ALL SELECT cm.person_id, cr.place_id, cr.year, cm.occupation, 'census' FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id WHERE cm.person_id IS NOT NULL AND TRIM(COALESCE(cm.occupation,''))<>''
        UNION ALL SELECT p.id, NULL, NULL, p.occupation, 'sheet' FROM persons p WHERE TRIM(COALESCE(p.occupation,''))<>''";
    foreach ($pdo->query($sql) as $r) { $pid = (int) $r['pid']; if ($ok($pid)) { $raw[] = $r; } if (count($raw) > 60000) { break; } }
    // la fiche ne dit qu'un métier « en général » : s'il est déjà noté par un acte, on ne le compte pas deux fois
    $seen = [];
    foreach ($raw as $r) { if ($r['src'] !== 'sheet') { $seen[(int) $r['pid'] . '|' . trade_fold((string) $r['val'])] = true; } }
    [$resi, $birth] = $chain ? cp2_fallback_places($pdo, array_map(static fn($r) => (int) $r['pid'], $raw)) : [[], []];
    $rows = []; $unclassed = []; $names = [];
    foreach ($raw as $r) {
        $pid = (int) $r['pid']; $y = $r['year'] !== null && (int) $r['year'] > 0 ? (int) $r['year'] : null; $pl = $r['pl'] !== null ? (int) $r['pl'] : null; $how = $r['src'];
        if ($r['src'] === 'sheet' && isset($seen[$pid . '|' . trade_fold((string) $r['val'])])) { continue; }
        if (!$pl && $chain) {
            // sinon la résidence de l'époque (la plus proche de l'année), sinon le lieu de naissance
            $best = null;
            foreach ($resi[$pid] ?? [] as [$rp, $ry]) { $d = $y !== null && $ry !== null ? abs($ry - $y) : 500; if ($best === null || $d < $best[1]) { $best = [$rp, $d, $ry]; } }
            if ($best) { $pl = $best[0]; $how = 'resi'; $y ??= $best[2]; }
            elseif (isset($birth[$pid])) { $pl = $birth[$pid][0]; $how = 'birth'; $y ??= $birth[$pid][1] !== null ? $birth[$pid][1] + 25 : null; } // le métier d'une vie : vers 25 ans
        }
        if (!$pl) { continue; }
        foreach (preg_split('/\s*(?:,|;|\/|\bet\b|\bpuis\b)\s*/u', trim((string) $r['val'])) ?: [] as $part) {
            $part = trim($part, " \t.-"); if (mb_strlen($part) < 3) { continue; }
            [$key, $name, $dom, $sector] = metiers_classify($part);
            if ($key === '') { continue; }
            $names[$key] = mb_substr($name, 0, 80);
            if ($sector === 'autre') { $unclassed[$key] = ($unclassed[$key] ?? 0) + 1; }
            $rows[] = [$pid, $pl, $y, $key, $sector, $dom, $how];
        }
        if (count($rows) >= 40000) { break; }
    }
    $places = cp_places($pdo, array_column($rows, 1));
    $D = trades_dict()['doc']['domains'] ?? [];
    $gender = [];
    foreach (array_chunk(array_values(array_unique(array_column($rows, 0))), 500) as $chunk) { foreach ($pdo->query('SELECT id, gender FROM persons WHERE id IN (' . implode(',', $chunk) . ')') as $p) { $gender[(int) $p['id']] = $p['gender'] === 'female' ? 'f' : ($p['gender'] === 'male' ? 'm' : ''); } }
    arsort($unclassed);
    return ['rows' => $rows, 'names' => $names, 'places' => $places, 'people' => cp_people($pdo, array_column($rows, 0)), 'gender' => $gender,
        'sectors' => array_map(static fn($s) => ['k' => $s[0], 'icon' => $s[1], 'label' => $s[2], 'color' => $s[3]], METIERS_SECTORS),
        'domains' => array_map(static fn($k, $d) => ['k' => (string) $k, 'icon' => (string) ($d['icon'] ?? ''), 'label' => (string) ($d['label'] ?? $k)], array_keys($D), $D),
        'unclassed' => array_slice(array_map(static fn($k, $n) => ['key' => $k, 'name' => $names[$k] ?? $k, 'n' => $n], array_keys($unclassed), $unclassed), 0, 200),
        'unplaced' => cp2_unplaced($pdo, array_column($rows, 1), $places)];
}

/** les métiers connus (pour « Un métier et ses variantes ») : [{key, name, n}] les plus notés d'abord */
function cp2_trade_list(PDO $pdo): array
{
    $r = cp2_trades($pdo, []); $n = [];
    foreach ($r['rows'] as $row) { $n[$row[3]] = ($n[$row[3]] ?? 0) + 1; }
    arsort($n);
    return ['trades' => array_map(static fn($k, $c) => ['key' => $k, 'name' => $r['names'][$k] ?? $k, 'n' => $c], array_keys($n), $n)];
}

/** 👫 deux (ou quatre) groupes de personnes → leurs événements situés : côté père / côté mère, quatre grands-parents, deux personnes, deux noms, deux listes */
function cp2_mirror(PDO $pdo, array $q): array
{
    $side = cp2_pick($q, 'side', ['pat', 'grand', 'two', 'names', 'lists'], 'pat');
    $gens = cp2_int($q, 'gens', 8, 0, 40);
    $tags = cp2_tags((string) ($q['ev'] ?? 'births,marriages,deaths,residences'));
    $hidden = cp_hidden($pdo);
    $root = cp2_root($pdo, cp2_int($q, 'root', 0, 0, PHP_INT_MAX));
    $groups = []; $member = []; $sosas = []; $labels = []; $wedding = null;
    $add = static function (int $g, int $pid, ?int $sosa = null) use (&$member, &$sosas, $hidden): void {
        if ($pid <= 0 || isset($hidden[$pid])) { return; }
        $member[$pid][$g] = true; if ($sosa !== null) { $sosas[$pid][] = $sosa; }
    };
    $who = static function (int $id) use ($pdo, $hidden): string { if (!$id || isset($hidden[$id])) { return ''; } $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$id]); $r = $s->fetch(); return $r ? dgn_name($r) : ''; };
    if ($side === 'pat' || $side === 'grand') {
        if (!$root['id']) { throw new RuntimeException('Choisis d’abord une personne de départ.'); }
        $S = dgn_sosa($pdo, $root['id'], $gens > 0 ? $gens + 1 : 40, 120000);
        $n = $side === 'pat' ? 2 : 4;
        foreach ($S as $s => $id) {
            if ($s < $n) { continue; }
            $g = strlen(decbin((int) $s)) - 1; $top = $side === 'pat' ? ($s >> ($g - 1)) - 2 : ($s >> ($g - 2)) - 4;
            $add($top, (int) $id, (int) $s);
        }
        $labels = $side === 'pat' ? ['Côté père', 'Côté mère'] : ['Grand-père paternel', 'Grand-mère paternelle', 'Grand-père maternel', 'Grand-mère maternelle'];
        $groups = array_map(static fn($l, $i) => ['label' => $l, 'who' => $who((int) ($S[$side === 'pat' ? $i + 2 : $i + 4] ?? 0)), 'surname' => ''], $labels, array_keys($labels));
        // le mariage des parents (sosa 2 et 3) : souvent là que les deux lignées se rencontrent
        if (isset($S[2], $S[3]) && !isset($hidden[(int) $S[2]]) && !isset($hidden[(int) $S[3]])) {
            $st = $pdo->prepare("SELECT e.place_id, e.year, e.date_text FROM families f JOIN events e ON e.family_id=f.id JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='MARR' AND ((f.partner1_id=? AND f.partner2_id=?) OR (f.partner1_id=? AND f.partner2_id=?)) AND e.place_id IS NOT NULL LIMIT 1");
            $st->execute([(int) $S[2], (int) $S[3], (int) $S[3], (int) $S[2]]); $m = $st->fetch();
            if ($m) { $wedding = ['place' => (int) $m['place_id'], 'year' => $m['year'] !== null ? (int) $m['year'] : null, 'date' => mb_substr((string) $m['date_text'], 0, 40), 'a' => $who((int) $S[2]), 'b' => $who((int) $S[3])]; }
        }
    } elseif ($side === 'two') {
        $a = cp2_int($q, 'a', 0, 0, PHP_INT_MAX); $b = cp2_int($q, 'b', 0, 0, PHP_INT_MAX);
        if (!$a || !$b) { throw new RuntimeException('Choisis les deux personnes.'); }
        foreach ([$a, $b] as $g => $p) { foreach (dgn_sosa($pdo, $p, $gens > 0 ? $gens + 1 : 40, 60000) as $s => $id) { $add($g, (int) $id, (int) $s); } }
        $groups = [['label' => 'Première personne', 'who' => $who($a), 'surname' => ''], ['label' => 'Deuxième personne', 'who' => $who($b), 'surname' => '']];
    } elseif ($side === 'names') {
        $na = cp_fold(mb_substr(trim((string) ($q['na'] ?? '')), 0, 80)); $nb = cp_fold(mb_substr(trim((string) ($q['nb'] ?? '')), 0, 80));
        if ($na === '' || $nb === '') { throw new RuntimeException('Choisis les deux noms de famille.'); }
        foreach ($pdo->query("SELECT id, last_name FROM persons WHERE COALESCE(last_name,'')<>''") as $p) { $f = cp_fold((string) $p['last_name']); if ($f === $na) { $add(0, (int) $p['id']); } if ($f === $nb) { $add(1, (int) $p['id']); } }
        $groups = [['label' => mb_strtoupper(trim((string) $q['na'])), 'who' => '', 'surname' => mb_strtoupper(trim((string) $q['na']))], ['label' => mb_strtoupper(trim((string) $q['nb'])), 'who' => '', 'surname' => mb_strtoupper(trim((string) $q['nb']))]];
    } else {
        $la = cp2_int($q, 'la', 0, 0, PHP_INT_MAX); $lb = cp2_int($q, 'lb', 0, 0, PHP_INT_MAX);
        if (!$la || !$lb) { throw new RuntimeException('Choisis les deux listes.'); }
        foreach ([$la, $lb] as $g => $l) { foreach (array_keys(dgo_list_people($pdo, $l)) as $id) { $add($g, (int) $id); } }
        $names = []; $st = $pdo->prepare('SELECT name FROM custom_lists WHERE id=?'); foreach ([$la, $lb] as $l) { $st->execute([$l]); $names[] = mb_substr((string) $st->fetchColumn(), 0, 80); }
        $groups = [['label' => $names[0] ?: 'Première liste', 'who' => '', 'surname' => ''], ['label' => $names[1] ?: 'Deuxième liste', 'who' => '', 'surname' => '']];
    }
    $events = cp2_events($pdo, $tags, array_keys($member));
    $places = cp_places($pdo, array_merge(array_column($events, 1), $wedding ? [$wedding['place']] : []));
    // les ancêtres des deux côtés (implexe, ancêtres communs) : la plus petite génération par côté pour « le chemin le plus court »
    $both = [];
    foreach ($member as $pid => $gs) { if (count($gs) > 1) { $both[$pid] = array_values(array_unique($sosas[$pid] ?? [])); } }
    $gen = []; foreach ($sosas as $pid => $list) { foreach ($list as $s) { $g = strlen(decbin((int) $s)); $gen[$pid] = min($gen[$pid] ?? 99, $g); } }
    $short = [];
    if ($side === 'pat' || $side === 'grand') { foreach ($both as $pid => $list) { sort($list); $s = $list[0]; $g = strlen(decbin($s)) - 1; $short[$pid] = $side === 'pat' ? ($s >> ($g - 1)) - 2 : ($s >> ($g - 2)) - 4; } }
    return ['side' => $side, 'groups' => $groups, 'events' => $events, 'member' => array_map(static fn($g) => array_keys($g), $member), 'both' => $both, 'short' => $short, 'gen' => $gen,
        'places' => $places, 'people' => cp_people($pdo, array_merge(array_keys($both), array_column($events, 0))), 'root' => $root, 'wedding' => $wedding && isset($places[$wedding['place']]) ? $wedding : null,
        'unplaced' => cp2_unplaced($pdo, array_column($events, 1), $places)];
}

/** le point d'entrée : api.php?action=cartes_plus2 */
function cp2_data(PDO $pdo, array $q): array
{
    $what = (string) ($q['what'] ?? '');
    return match ($what) {
        'trades' => cp2_trades($pdo, $q),
        'trade_list' => cp2_trade_list($pdo),
        'mirror' => cp2_mirror($pdo, $q),
        default => throw new RuntimeException('Demande inconnue.'),
    };
}
