<?php
declare(strict_types=1);

/**
 * 🌍 Ta famille dans les grands mouvements : les déplacements de chaque personne (naissance, baptême, mariage, résidence,
 * recensement, décès…) comparés aux grandes migrations de l'histoire (exode rural, bougnats, Barcelonnettes, Italiens,
 * rapatriés d'Algérie…) : même départ, même arrivée, même époque.
 *
 * - assets/data/grands-mouvements.json : la liste livrée (une source pour chacun) ;
 * - table own_movements : les mouvements ajoutés par moi (« les verriers de Carmaux vers Albi ») ;
 * - table movement_marks : mes réponses « Oui, c'est ça » / « Non » pour une personne et un mouvement ;
 * - le rapprochement : « sûr » (arrivée pendant le mouvement, lieux précis) ou « possible », jamais imposé.
 * Affiché : Listes → Histoire (assets/js/heritage-mouvements.js), la fiche (bloc « 🌍 Le monde autour »).
 * Essai : tests/test-mouvements.js
 */

function mouvements_ensure(PDO $pdo): void
{
    static $done = false; if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS own_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', from_year INTEGER NOT NULL DEFAULT 0, to_year INTEGER NOT NULL DEFAULT 0,
        de TEXT NOT NULL DEFAULT '', vers TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS movement_marks (person_id INTEGER NOT NULL, movement_id TEXT NOT NULL, verdict TEXT NOT NULL DEFAULT 'oui', updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(person_id, movement_id))");
    $done = true;
}

function mouvements_bundled(): array
{
    static $doc = null;
    if ($doc === null) {
        $f = APP_ROOT . '/assets/data/grands-mouvements.json';
        $doc = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
        $doc += ['mouvements' => []];
    }
    return $doc;
}

/** « 15, 12, Lyon, Italie » → {dep, villes, pays} (une case de mes mouvements) */
function mouvements_parse_where(string $s): array
{
    $out = ['dep' => [], 'villes' => [], 'pays' => []];
    $countries = ['france', 'italie', 'espagne', 'portugal', 'belgique', 'suisse', 'allemagne', 'pologne', 'algerie', 'maroc', 'tunisie', 'canada', 'quebec', 'mexique', 'argentine', 'uruguay', 'chili', 'bresil',
        'etats unis', 'usa', 'royaume uni', 'angleterre', 'pays bas', 'luxembourg', 'russie', 'ukraine', 'armenie', 'turquie', 'liban', 'syrie', 'guadeloupe', 'martinique', 'reunion', 'la reunion', 'guyane', 'haiti', 'senegal', 'vietnam', 'australie', 'afrique du sud', 'irlande', 'grece', 'roumanie', 'hongrie', 'autriche', 'tchequie', 'malte'];
    $codes = world_dept_codes();
    foreach (preg_split('/[,;]+/', $s) as $part) {
        $part = trim($part); if ($part === '') { continue; }
        $f = world_fold($part);
        if (preg_match('/^(97\d|2[AB]|\d{2})$/i', $part)) { $out['dep'][] = strtoupper($part); }
        elseif (isset($codes[$f])) { $out['dep'][] = $codes[$f]; }
        elseif (in_array($f, $countries, true)) { $out['pays'][] = $part; }
        else { $out['villes'][] = $part; }
    }
    return $out;
}

function mouvements_own(PDO $pdo): array
{
    mouvements_ensure($pdo);
    $out = [];
    foreach ($pdo->query('SELECT * FROM own_movements ORDER BY from_year, id')->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = ['id' => 'o' . (int) $r['id'], 'own' => (int) $r['id'], 'title' => (string) $r['title'], 'from' => (int) $r['from_year'], 'to' => (int) $r['to_year'],
            'de' => mouvements_parse_where((string) $r['de']), 'vers' => mouvements_parse_where((string) $r['vers']), 'de_text' => (string) $r['de'], 'vers_text' => (string) $r['vers'],
            'desc' => (string) $r['description'], 'src' => (string) $r['source'], 'url' => (string) $r['url']];
    }
    return $out;
}

/** tous les mouvements (livrés + les miens) */
function mouvements_all(PDO $pdo): array
{
    return array_merge(array_map(static fn($m) => $m + ['own' => 0, 'de_text' => mouvements_where_text($m['de']), 'vers_text' => mouvements_where_text($m['vers'])], mouvements_bundled()['mouvements']), mouvements_own($pdo));
}

/** {dep, villes, pays} → « Cantal (15), Aveyron (12) » */
function mouvements_where_text(array $w): string
{
    static $names = null;
    if ($names === null) {
        $names = [];
        $list = 'Ain=01;Aisne=02;Allier=03;Alpes-de-Haute-Provence=04;Hautes-Alpes=05;Alpes-Maritimes=06;Ardèche=07;Ardennes=08;Ariège=09;Aube=10;Aude=11;Aveyron=12;Bouches-du-Rhône=13;Calvados=14;Cantal=15;Charente=16;Charente-Maritime=17;Cher=18;Corrèze=19;Corse-du-Sud=2A;Haute-Corse=2B;Côte-d’Or=21;Côtes-d’Armor=22;Creuse=23;Dordogne=24;Doubs=25;Drôme=26;Eure=27;Eure-et-Loir=28;Finistère=29;Gard=30;Haute-Garonne=31;Gers=32;Gironde=33;Hérault=34;Ille-et-Vilaine=35;Indre=36;Indre-et-Loire=37;Isère=38;Jura=39;Landes=40;Loir-et-Cher=41;Loire=42;Haute-Loire=43;Loire-Atlantique=44;Loiret=45;Lot=46;Lot-et-Garonne=47;Lozère=48;Maine-et-Loire=49;Manche=50;Marne=51;Haute-Marne=52;Mayenne=53;Meurthe-et-Moselle=54;Meuse=55;Morbihan=56;Moselle=57;Nièvre=58;Nord=59;Oise=60;Orne=61;Pas-de-Calais=62;Puy-de-Dôme=63;Pyrénées-Atlantiques=64;Hautes-Pyrénées=65;Pyrénées-Orientales=66;Bas-Rhin=67;Haut-Rhin=68;Rhône=69;Haute-Saône=70;Saône-et-Loire=71;Sarthe=72;Savoie=73;Haute-Savoie=74;Paris=75;Seine-Maritime=76;Seine-et-Marne=77;Yvelines=78;Deux-Sèvres=79;Somme=80;Tarn=81;Tarn-et-Garonne=82;Var=83;Vaucluse=84;Vendée=85;Vienne=86;Haute-Vienne=87;Vosges=88;Yonne=89;Territoire de Belfort=90;Essonne=91;Hauts-de-Seine=92;Seine-Saint-Denis=93;Val-de-Marne=94;Val-d’Oise=95';
        foreach (explode(';', $list) as $pair) { [$n, $c] = explode('=', $pair); $names[$c] = $n; }
    }
    $deps = array_map('strval', $w['dep'] ?? []);
    $idf = ['75', '92', '93', '94', '77', '78', '91', '95'];
    $out = [];
    if ($deps && !array_diff($idf, $deps)) { $out[] = i18n_t('Paris et sa région'); $deps = array_values(array_diff($deps, $idf)); }
    foreach ($deps as $d) { $out[] = isset($names[$d]) ? $names[$d] . ' (' . $d . ')' : $d; }
    return implode(', ', array_merge($out, $w['villes'] ?? [], $w['pays'] ?? []));
}

/** un lieu (ligne de places) → {dep, pays (plié), ville (plié)} */
function mouvements_place_key(array $pl): array
{
    $c = world_fold((string) ($pl['country'] ?? ''));
    $dep = world_place_dept($pl);
    $alias = ['fr' => 'france', 'usa' => 'etats unis', 'united states' => 'etats unis', 'us' => 'etats unis', 'u s a' => 'etats unis', 'quebec' => 'canada', 'royaume uni' => 'royaume uni', 'uk' => 'royaume uni', 'angleterre' => 'royaume uni', 'la reunion' => 'reunion'];
    $c = $alias[$c] ?? $c;
    if ($c === '' ) { $c = in_array($dep, ['971', '972', '973', '974', '976'], true) ? ['971' => 'guadeloupe', '972' => 'martinique', '973' => 'guyane', '974' => 'reunion', '976' => 'mayotte'][$dep] : 'france'; }
    return ['id' => (int) ($pl['id'] ?? 0), 'name' => (string) ($pl['name'] ?? ''), 'lat' => is_numeric($pl['latitude'] ?? null) ? (float) $pl['latitude'] : null, 'lon' => is_numeric($pl['longitude'] ?? null) ? (float) $pl['longitude'] : null, 'dep' => $dep, 'pays' => $c, 'ville' => world_fold((string) ($pl['name'] ?? ''))];
}

/** le lieu correspond-il à « de » ou « vers » ? → 3 (ville), 2 (département), 1 (pays), 0 (non) */
function mouvements_hit(array $where, array $k): int
{
    foreach ($where['villes'] ?? [] as $v) { $f = world_fold((string) $v); if ($f !== '' && ($k['ville'] === $f || str_starts_with($k['ville'], $f . ' '))) { return 3; } }
    foreach ($where['dep'] ?? [] as $d) { if ($k['dep'] !== '' && strtoupper((string) $d) === $k['dep']) { return 2; } }
    $alias = ['usa' => 'etats unis', 'united states' => 'etats unis', 'quebec' => 'canada', 'angleterre' => 'royaume uni', 'la reunion' => 'reunion', 'saint domingue' => 'haiti', 'prusse' => 'allemagne'];
    foreach ($where['pays'] ?? [] as $p) { $f = world_fold((string) $p); $f = $alias[$f] ?? $f; if ($f === $k['pays']) { return 1; } }
    return 0;
}

/** les lieux datés de chaque personne : [pid => [[year, tag, placeKey], …] du plus ancien au plus récent] */
function mouvements_tracks(PDO $pdo, array $only = []): array
{
    $ids = array_values(array_filter(array_map('intval', $only)));
    $w = $ids ? ' AND x.pid IN (' . implode(',', $ids) . ')' : '';
    $sql = "SELECT x.pid, x.tag, x.year, x.date_text, pl.* FROM (
              SELECT e.person_id AS pid, t.gedcom_tag AS tag, e.year, e.date_text, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL AND e.place_id IS NOT NULL
              UNION ALL SELECT f.partner1_id, t.gedcom_tag, e.year, e.date_text, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE e.place_id IS NOT NULL AND f.partner1_id IS NOT NULL
              UNION ALL SELECT f.partner2_id, t.gedcom_tag, e.year, e.date_text, e.place_id FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE e.place_id IS NOT NULL AND f.partner2_id IS NOT NULL
            ) x JOIN places pl ON pl.id=x.place_id WHERE 1=1$w";
    $out = [];
    foreach ($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $y = world_year($r['date_text'], $r['year']); if (!$y) { continue; }
        $pl = $r; $pl['id'] = $r['place_id'] ?? $r['id'];
        $out[(int) $r['pid']][] = [$y, (string) $r['tag'], mouvements_place_key($pl)];
    }
    $rank = ['BIRT' => 0, 'CHR' => 1, 'BAPM' => 1];
    foreach ($out as &$t) { usort($t, static fn($a, $b) => [$a[0], $rank[$a[1]] ?? 5] <=> [$b[0], $rank[$b[1]] ?? 5]); }
    return $out;
}

/** une personne et un mouvement → null ou {level, from, to, y0, y1} */
function mouvements_match(array $track, array $m): ?array
{
    if (count($track) < 2) { return null; }
    $best = null;
    // le départ : le premier lieu noté qui correspond à « de » (souvent la naissance) ; l'arrivée : un lieu plus tard qui correspond à « vers »
    foreach ($track as $i => [$y0, $tag0, $k0]) {
        $h0 = mouvements_hit($m['de'], $k0); if (!$h0) { continue; }
        if (mouvements_hit($m['vers'], $k0) >= 2) { continue; } // déjà « arrivé » au départ (ex. né à Paris)
        if (!empty($m['sauf']) && mouvements_hit($m['sauf'], $k0)) { continue; }
        for ($j = $i + 1; $j < count($track); $j++) {
            [$y1, $tag1, $k1] = $track[$j];
            $h1 = mouvements_hit($m['vers'], $k1); if (!$h1) { continue; }
            if ($k1['id'] === $k0['id'] || $k1['ville'] === $k0['ville']) { continue; } // pas bougé
            if ($k1['pays'] === $k0['pays'] && $k1['dep'] === $k0['dep'] && $h0 < 3 && $h1 < 3) { continue; } // dans le même département : seulement d'une ville nommée à l'autre
            if (mouvements_hit($m['de'], $k1) >= 2) { continue; } // revenu au pays de départ
            if ($y1 < $m['from'] || $y0 > $m['to'] + 5) { continue; } // pas la même époque
            $inside = $y1 >= $m['from'] && $y1 <= $m['to'] + 5;
            if (!$inside && $y1 > $m['to'] + 25) { continue; }
            $precise = $h0 >= 2 || $h1 >= 2 || $k0['pays'] !== $k1['pays'];
            $level = $inside && $precise ? 'sur' : 'possible';
            $c = ['level' => $level, 'y0' => $y0, 'y1' => $y1, 'from' => $k0['name'], 'to' => $k1['name'], 'from_id' => $k0['id'], 'to_id' => $k1['id'], 'from_ll' => $k0['lat'] !== null && $k0['lon'] !== null ? [$k0['lat'], $k0['lon']] : null, 'to_ll' => $k1['lat'] !== null && $k1['lon'] !== null ? [$k1['lat'], $k1['lon']] : null, 'abroad' => $k0['pays'] !== 'france' || $k1['pays'] !== 'france'];
            if (!$best || ($best['level'] !== 'sur' && $level === 'sur')) { $best = $c; }
            if ($best['level'] === 'sur') { return $best; }
            break; // la première arrivée suffit
        }
    }
    return $best;
}

function mouvements_marks(PDO $pdo): array
{
    mouvements_ensure($pdo);
    $out = [];
    foreach ($pdo->query('SELECT person_id, movement_id, verdict FROM movement_marks')->fetchAll(PDO::FETCH_ASSOC) as $r) { $out[(int) $r['person_id'] . '|' . $r['movement_id']] = (string) $r['verdict']; }
    return $out;
}

/** GET grands_mouvements → chaque mouvement avec les personnes de la famille qui y ont pris part ; q.non=1 : aussi les « Non » */
function mouvements_list(PDO $pdo, array $q = []): array
{
    $all = mouvements_all($pdo); $tracks = mouvements_tracks($pdo); $marks = mouvements_marks($pdo);
    $names = [];
    if ($tracks) {
        foreach ($pdo->query('SELECT id, first_name, last_name, gender FROM persons WHERE id IN (' . implode(',', array_keys($tracks)) . ')')->fetchAll(PDO::FETCH_ASSOC) as $p) { $names[(int) $p['id']] = $p; }
    }
    $withNon = !empty($q['non']) && (string) $q['non'] !== '0';
    $rows = []; $people = [];
    foreach ($all as $m) {
        $who = [];
        foreach ($tracks as $pid => $t) {
            if (!isset($names[$pid])) { continue; }
            $r = mouvements_match($t, $m); if (!$r) { continue; }
            $v = $marks[$pid . '|' . $m['id']] ?? '';
            if ($v === 'non' && !$withNon) { continue; }
            if ($v === 'oui') { $r['level'] = 'sur'; }
            $p = $names[$pid];
            $who[] = $r + ['id' => $pid, 'name' => trim($p['first_name'] . ' ' . $p['last_name']), 'first' => trim((string) $p['first_name']), 'gender' => (string) $p['gender'], 'verdict' => $v];
            $people[$pid] = true;
        }
        usort($who, static fn($a, $b) => [$a['level'] === 'sur' ? 0 : 1, $a['y1']] <=> [$b['level'] === 'sur' ? 0 : 1, $b['y1']]);
        $rows[] = $m + ['people' => $who];
    }
    $doc = mouvements_bundled();
    return ['mouvements' => $rows, 'total' => count($all), 'found' => count(array_filter($rows, static fn($r) => $r['people'])), 'people' => count($people),
        'own' => count(array_filter($all, static fn($m) => !empty($m['own']))), 'credit' => (string) ($doc['credit'] ?? ''), 'licence' => (string) ($doc['licence'] ?? ''), 'licence_url' => (string) ($doc['licence_url'] ?? '')];
}

/** les mouvements d'une personne (bloc « Le monde autour », Ses déplacements) */
function mouvements_person(PDO $pdo, int $pid): array
{
    $t = mouvements_tracks($pdo, [$pid])[$pid] ?? []; if (count($t) < 2) { return []; }
    $marks = mouvements_marks($pdo); $out = [];
    foreach (mouvements_all($pdo) as $m) {
        $r = mouvements_match($t, $m); if (!$r) { continue; }
        $v = $marks[$pid . '|' . $m['id']] ?? ''; if ($v === 'non') { continue; }
        if ($v === 'oui') { $r['level'] = 'sur'; }
        $out[] = $r + ['id' => $m['id'], 'title' => $m['title'], 'm_from' => $m['from'], 'm_to' => $m['to'], 'desc' => $m['desc'], 'src' => $m['src'], 'url' => $m['url'], 'verdict' => $v, 'own' => $m['own'] ?? 0];
    }
    return $out;
}

/** POST movement_mark {person_id, movement_id, verdict: oui | non | ''} → l'ancienne réponse (pour « ↶ Annuler ») */
function mouvements_mark(PDO $pdo, array $d): array
{
    mouvements_ensure($pdo);
    $pid = safe_int($d['person_id'] ?? 0); $mid = (string) ($d['movement_id'] ?? '');
    if (!$pid || !preg_match('/^[a-z0-9-]{1,60}$/', $mid)) { throw new LcndaBadInput(i18n_t('Personne ou mouvement inconnu.')); }
    $v = (string) ($d['verdict'] ?? ''); if (!in_array($v, ['oui', 'non', ''], true)) { $v = ''; }
    $s = $pdo->prepare('SELECT verdict FROM movement_marks WHERE person_id=? AND movement_id=?'); $s->execute([$pid, $mid]); $old = (string) ($s->fetchColumn() ?: '');
    if ($v === '') { $pdo->prepare('DELETE FROM movement_marks WHERE person_id=? AND movement_id=?')->execute([$pid, $mid]); }
    else { $pdo->prepare('INSERT INTO movement_marks(person_id, movement_id, verdict) VALUES(?,?,?) ON CONFLICT(person_id, movement_id) DO UPDATE SET verdict=excluded.verdict, updated_at=CURRENT_TIMESTAMP')->execute([$pid, $mid, $v]); }
    return ['ok' => true, 'old' => $old];
}

/** POST save_own_movement {id, title, from_year, to_year, de, vers, description, source, url} */
function mouvements_save_own(PDO $pdo, array $d): array
{
    mouvements_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $title = mb_substr(trim((string) ($d['title'] ?? '')), 0, 200);
    if ($title === '') { throw new LcndaBadInput(i18n_t('Donne un nom au mouvement.')); }
    $from = safe_int($d['from_year'] ?? 0); $to = safe_int($d['to_year'] ?? 0) ?: $from;
    if ($from < 1000 || $from > 2100 || $to < $from || $to > 2100) { throw new LcndaBadInput(i18n_t('Les années vont de 1000 à 2100, la fin après le début.')); }
    $de = mb_substr(trim((string) ($d['de'] ?? '')), 0, 500); $vers = mb_substr(trim((string) ($d['vers'] ?? '')), 0, 500);
    if ($de === '' || $vers === '') { throw new LcndaBadInput(i18n_t('Dis d’où partaient les gens et où ils allaient.')); }
    $url = trim((string) ($d['url'] ?? ''));
    if ($url !== '' && !preg_match('#^https?://#i', $url)) { throw new LcndaBadInput(i18n_t('L’adresse du lien doit commencer par http:// ou https://.')); }
    $vals = [$title, $from, $to, $de, $vers, mb_substr(trim((string) ($d['description'] ?? '')), 0, 4000), mb_substr(trim((string) ($d['source'] ?? '')), 0, 500), mb_substr($url, 0, 1000)];
    if ($id) {
        $s = $pdo->prepare('UPDATE own_movements SET title=?, from_year=?, to_year=?, de=?, vers=?, description=?, source=?, url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([...$vals, $id]);
        if (!$s->rowCount()) { throw new LcndaBadInput(i18n_t('Mouvement introuvable.')); }
    } else {
        $pdo->prepare('INSERT INTO own_movements(title, from_year, to_year, de, vers, description, source, url) VALUES(?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

/** POST delete_own_movement {id} → la ligne (pour « ↶ Annuler ») */
function mouvements_delete_own(PDO $pdo, array $d): array
{
    mouvements_ensure($pdo);
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM own_movements WHERE id=?'); $s->execute([$id]); $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new LcndaBadInput(i18n_t('Mouvement introuvable.')); }
    $pdo->prepare('DELETE FROM own_movements WHERE id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM movement_marks WHERE movement_id=?')->execute(['o' . $id]);
    return ['ok' => true, 'row' => $row];
}
