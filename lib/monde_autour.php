<?php
declare(strict_types=1);

/**
 * 🌍 Le monde autour : la vie d'un ancêtre à côté des grands événements (guerres, épidémies, lois, inventions, régimes)
 * et de l'histoire locale (département, commune).
 *
 * - assets/data/monde-autour.json : la liste livrée avec l'app (331 événements, 1500–1960 surtout, source de chacun) ;
 *   ses « crises » (crisis: true) sont aussi la liste « Épidémies, guerres, hivers terribles » (lib/heritage_more.php,
 *   historical_crises()) : une seule liste pour toute l'app.
 * - table history_events (structure n°50) : mes événements à moi (une fête, une inondation, un incendie au village…),
 *   rattachés à une commune, à son département, à la France ou au monde.
 * - world_around() : pour une fiche, ce qui s'est passé pendant sa vie là où elle a vécu, avec son âge
 *   (« Jean a 19 ans quand la guerre de 1870 commence »). Affiché sur la fiche (bloc « 🌍 Le monde autour ») et dans la
 *   Chronologie (colonne « Contexte »), assets/js/heritage-monde.js.
 */

const WORLD_REACH = ['commune', 'departement', 'france', 'monde'];

function world_events_bundled(): array
{
    static $doc = null;
    if ($doc === null) {
        $f = APP_ROOT . '/assets/data/monde-autour.json';
        $doc = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
        $doc += ['events' => [], 'cats' => []];
    }
    return $doc;
}

/** Les crises de « Épidémies, guerres, hivers terribles » : [début, fin, sorte, titre, portée, description] */
function historical_crises(): array
{
    $out = [];
    foreach (world_events_bundled()['events'] as $e) {
        if (!empty($e['crisis'])) { $out[] = [(int) $e['from'], (int) $e['to'], (string) $e['cat'], (string) $e['title'], (string) $e['scope'], (string) $e['desc']]; }
    }
    return $out;
}

/** Numéros des départements d'après leur nom (pour un lieu sans code INSEE) */
function world_dept_codes(): array
{
    static $map = null;
    if ($map !== null) { return $map; }
    $list = 'Ain=01;Aisne=02;Allier=03;Alpes-de-Haute-Provence=04;Basses-Alpes=04;Hautes-Alpes=05;Alpes-Maritimes=06;Ardèche=07;Ardennes=08;Ariège=09;Aube=10;Aude=11;Aveyron=12;Bouches-du-Rhône=13;Calvados=14;Cantal=15;Charente=16;Charente-Maritime=17;Charente-Inférieure=17;Cher=18;Corrèze=19;Corse-du-Sud=2A;Haute-Corse=2B;Corse=20;Côte-d\'Or=21;Côtes-d\'Armor=22;Côtes-du-Nord=22;Creuse=23;Dordogne=24;Doubs=25;Drôme=26;Eure=27;Eure-et-Loir=28;Finistère=29;Gard=30;Haute-Garonne=31;Gers=32;Gironde=33;Hérault=34;Ille-et-Vilaine=35;Indre=36;Indre-et-Loire=37;Isère=38;Jura=39;Landes=40;Loir-et-Cher=41;Loire=42;Haute-Loire=43;Loire-Atlantique=44;Loire-Inférieure=44;Loiret=45;Lot=46;Lot-et-Garonne=47;Lozère=48;Maine-et-Loire=49;Manche=50;Marne=51;Haute-Marne=52;Mayenne=53;Meurthe-et-Moselle=54;Meurthe=54;Meuse=55;Morbihan=56;Moselle=57;Nièvre=58;Nord=59;Oise=60;Orne=61;Pas-de-Calais=62;Puy-de-Dôme=63;Pyrénées-Atlantiques=64;Basses-Pyrénées=64;Hautes-Pyrénées=65;Pyrénées-Orientales=66;Bas-Rhin=67;Haut-Rhin=68;Rhône=69;Haute-Saône=70;Saône-et-Loire=71;Sarthe=72;Savoie=73;Haute-Savoie=74;Paris=75;Seine=75;Seine-Maritime=76;Seine-Inférieure=76;Seine-et-Marne=77;Yvelines=78;Seine-et-Oise=78;Deux-Sèvres=79;Somme=80;Tarn=81;Tarn-et-Garonne=82;Var=83;Vaucluse=84;Vendée=85;Vienne=86;Haute-Vienne=87;Vosges=88;Yonne=89;Territoire de Belfort=90;Essonne=91;Hauts-de-Seine=92;Seine-Saint-Denis=93;Val-de-Marne=94;Val-d\'Oise=95;Guadeloupe=971;Martinique=972;Guyane=973;La Réunion=974;Réunion=974;Mayotte=976';
    $map = [];
    foreach (explode(';', $list) as $pair) { [$n, $c] = explode('=', $pair); $map[world_fold($n)] = $c; }
    return $map;
}

function world_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe', '’' => "'"]);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $s));
}

/** Le numéro de département d'un lieu (code INSEE, code GeoNames, sinon le nom du département) */
function world_place_dept(array $pl): string
{
    $country = world_fold((string) ($pl['country'] ?? ''));
    if ($country !== '' && !in_array($country, ['france', 'fr'], true)) { return ''; }
    $insee = trim((string) ($pl['admin4_code'] ?? ''));
    if (preg_match('/^(97\d|2[AB]|\d{2})/i', $insee, $m)) { return strtoupper($m[1]); }
    $a2 = trim((string) ($pl['admin2_code'] ?? ''));
    if (preg_match('/^(97\d|2[AB]|\d{2})$/i', $a2)) { return strtoupper($a2); }
    $codes = world_dept_codes();
    foreach (['county', 'subdivision', 'name'] as $k) { $f = world_fold((string) ($pl[$k] ?? '')); if ($f !== '' && isset($codes[$f])) { return $codes[$f]; } }
    return '';
}

/** Les lieux d'une ou plusieurs fiches : numéros de lieux, départements, textes de régions, en France ou non */
function world_person_places(PDO $pdo, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    $out = ['places' => [], 'depts' => [], 'texts' => [], 'france' => false, 'abroad' => false, 'any' => false];
    if (!$ids) { return $out; }
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $s = $pdo->prepare("SELECT DISTINCT pl.* FROM events e JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id IN ($marks) OR e.family_id IN (SELECT id FROM families WHERE partner1_id IN ($marks) OR partner2_id IN ($marks))");
    $s->execute(array_merge($ids, $ids, $ids));
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $pl) {
        $out['any'] = true;
        $out['places'][(int) $pl['id']] = (string) $pl['name'];
        $c = world_fold((string) ($pl['country'] ?? ''));
        if ($c === '' || $c === 'france' || $c === 'fr') { $out['france'] = true; } else { $out['abroad'] = true; }
        if (($d = world_place_dept($pl)) !== '') { $out['depts'][$d] = true; }
        $out['texts'][] = world_fold(implode(' ', [(string) ($pl['county'] ?? ''), (string) ($pl['state'] ?? ''), (string) ($pl['subdivision'] ?? '')]));
    }
    if (!$out['any']) { $out['france'] = true; } // aucun lieu noté : on suppose la France
    return $out;
}

/** La portée d'un événement touche-t-elle ces lieux ? → 'monde', 'france', 'local' ou '' */
function world_scope_hit(string $scope, array $where): string
{
    $sc = trim($scope);
    $f = world_fold($sc);
    if ($f === 'monde' || $f === 'europe') { return 'monde'; }
    if ($f === 'france' || $f === '') { return $where['france'] ? 'france' : ''; }
    foreach (explode(',', $sc) as $part) {
        $part = trim($part); if ($part === '') { continue; }
        if (preg_match('/^(97\d|2[AB]|\d{2})$/i', $part)) { if (isset($where['depts'][strtoupper($part)]) || ($part === '20' && (isset($where['depts']['2A']) || isset($where['depts']['2B'])))) { return 'local'; } continue; }
        $w = world_fold($part);
        foreach ($where['texts'] as $t) { if ($w !== '' && preg_match('/\b' . preg_quote($w, '/') . '\b/', $t)) { return 'local'; } }
    }
    return '';
}

function world_own_events(PDO $pdo): array
{
    try {
        return $pdo->query('SELECT h.*, pl.name AS place_name, pl.county, pl.country, pl.admin2_code, pl.admin4_code, pl.subdivision FROM history_events h LEFT JOIN places pl ON pl.id=h.place_id ORDER BY h.from_year, h.id')->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $_) { return []; }
}

/** Mes événements au même format que la liste livrée */
function world_own_as_events(PDO $pdo): array
{
    $out = [];
    foreach (world_own_events($pdo) as $r) {
        $reach = (string) $r['reach'];
        $dept = $r['place_id'] ? world_place_dept($r) : '';
        $scope = $reach === 'monde' ? 'Monde' : ($reach === 'france' ? 'France' : ($reach === 'departement' ? ($dept ?: (string) $r['county']) : ''));
        $out[] = ['id' => 'h' . (int) $r['id'], 'own' => (int) $r['id'], 'from' => (int) $r['from_year'], 'to' => (int) $r['to_year'], 'date' => (string) $r['date_text'],
            'cat' => (string) $r['category'], 'level' => 1, 'scope' => $scope, 'reach' => $reach, 'place_id' => $r['place_id'] ? (int) $r['place_id'] : null,
            'place' => (string) ($r['place_name'] ?? ''), 'dept' => $dept, 'title' => (string) $r['title'], 'quand' => (string) $r['quand'], 'desc' => (string) $r['description'],
            'src' => (string) $r['source'], 'url' => (string) $r['url'], 'updated_at' => (string) $r['updated_at']];
    }
    return $out;
}

/** « vers 1784 » → 1784 */
function world_year(?string $text, $year): int
{
    if ((int) $year > 0) { return (int) $year; }
    return preg_match('/\b(1[0-9]{3}|20[0-9]{2})\b/', (string) $text, $m) ? (int) $m[1] : 0;
}

/**
 * Pour une fiche : ce qui s'est passé pendant sa vie, là où elle a vécu.
 * $q : level (1 = les grands événements, 2 = tout), cats (sortes séparées par des virgules), from / to (période imposée, ex. la Chronologie), local (1 = seulement l'histoire locale)
 */
function world_around(PDO $pdo, int $id, array $q = []): array
{
    $s = $pdo->prepare('SELECT id, first_name, last_name, gender, living_status FROM persons WHERE id=?'); $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException('Fiche introuvable.'); }
    $ev = $pdo->prepare("SELECT t.gedcom_tag AS tag, e.date_text, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI','CREM') ORDER BY e.id");
    $ev->execute([$id]);
    $by = ['BIRT' => 0, 'BAP' => 0, 'DEAT' => 0, 'BURI' => 0];
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $y = world_year($r['date_text'], $r['year']); if (!$y) { continue; }
        $k = in_array($r['tag'], ['CHR', 'BAPM'], true) ? 'BAP' : (in_array($r['tag'], ['BURI', 'CREM'], true) ? 'BURI' : $r['tag']);
        if (!$by[$k]) { $by[$k] = $y; }
    }
    $b = $by['BIRT'] ?: $by['BAP']; $d = $by['DEAT'] ?: $by['BURI'];
    $now = (int) date('Y');
    $living = (string) $p['living_status'] === 'living';
    $from = safe_int($q['from'] ?? 0); $to = safe_int($q['to'] ?? 0);
    if (!$from || !$to) {
        if ($b) { $from = $b; $to = $d ?: ($living ? $now : min($now, $b + 90)); }
        elseif ($d) { $from = $d - 70; $to = $d; }
    }
    $first = trim((string) $p['first_name']) ?: (trim((string) $p['last_name']) ?: 'Cette personne');
    $f = (string) $p['gender'] === 'female'; $m = (string) $p['gender'] === 'male';
    $person = ['id' => $id, 'first' => $first, 'name' => trim($p['first_name'] . ' ' . $p['last_name']), 'gender' => (string) $p['gender'], 'birth' => $b, 'death' => $d, 'living' => $living];
    $doc = world_events_bundled();
    $cats = $doc['cats'];
    if (!$from || !$to || $to < $from) {
        return ['person' => $person, 'span' => null, 'events' => [], 'cats' => $cats, 'reason' => 'Ajoute au moins une date de naissance, de baptême ou de décès : l’app saura alors quelle période montrer.'];
    }
    $level = safe_int($q['level'] ?? 1) >= 2 ? 2 : 1;
    $want = array_filter(array_map('trim', explode(',', (string) ($q['cats'] ?? ''))));
    $onlyLocal = !empty($q['local']) && (string) $q['local'] !== '0';
    $where = world_person_places($pdo, [$id]);
    $out = [];
    foreach (array_merge($doc['events'], world_own_as_events($pdo)) as $e) {
        if ($e['to'] < $from || $e['from'] > $to) { continue; }
        if ($want && !in_array($e['cat'], $want, true)) { continue; }
        if (!empty($e['own']) && ($e['reach'] ?? '') === 'commune') { $hit = $e['place_id'] && isset($where['places'][$e['place_id']]) ? 'local' : ''; }
        else { $hit = world_scope_hit((string) $e['scope'], $where); }
        if ($hit === '') { continue; }
        if ($onlyLocal && $hit !== 'local') { continue; }
        if ($hit !== 'local' && empty($e['own']) && (int) $e['level'] > $level) { continue; }
        $age = $b ? $e['from'] - $b : null;
        $phrase = ''; $hint = '';
        $quand = trim((string) ($e['quand'] ?? '')) ?: ('« ' . $e['title'] . ' »' . ($e['to'] > $e['from'] ? ' commence' : ' a lieu'));
        if ($age !== null) {
            if ($age < 0 && $e['to'] >= $b) { $phrase = "Quand $first naît, c’est déjà le temps de : " . $e['title'] . ' (' . $e['from'] . '–' . $e['to'] . ').'; }
            elseif ($age === 0) { $phrase = "$first vient de naître quand $quand."; }
            elseif ($age > 0) { $phrase = "$first a $age an" . ($age > 1 ? 's' : '') . " quand $quand."; }
        }
        if ($d && $d >= $e['from'] && $d <= $e['to'] && in_array($e['cat'], ['épidémie', 'famine', 'hiver', 'guerre', 'crise'], true)) {
            $hint = "$first meurt pendant cette période ($d)" . ($hit === 'local' ? ', dans une région touchée' : '') . ' : la cause est peut-être là.';
        } elseif ($m && $e['cat'] === 'guerre' && $hit !== 'monde' && $age !== null && $e['from'] >= 1798 && $age + ($e['to'] - $e['from']) >= 20 && $age <= 45 && (!$d || $d >= $e['from'])) {
            $hint = 'À cet âge, il a pu être appelé : regarde les registres matricules ou les contrôles de troupe.';
        }
        $out[] = $e + ['hit' => $hit, 'age' => $age, 'phrase' => $phrase, 'hint' => $hint];
    }
    usort($out, static fn($x, $y) => [$x['from'], $x['to'], $x['title']] <=> [$y['from'], $y['to'], $y['title']]);
    return ['person' => $person, 'span' => [$from, $to], 'events' => $out, 'cats' => $cats, 'places' => ['depts' => array_keys($where['depts']), 'count' => count($where['places'])],
        'total' => count($doc['events']), 'credit' => (string) ($doc['credit'] ?? ''), 'licence' => (string) ($doc['licence'] ?? '')];
}

/** La liste entière (Listes → « 🌍 Le monde autour »), avec mes événements ; q : texte, cat, from, to, own (1 = seulement les miens) */
function world_events_list(PDO $pdo, array $q = []): array
{
    $doc = world_events_bundled();
    $all = array_merge(array_map(static fn($e) => $e + ['own' => 0], $doc['events']), world_own_as_events($pdo));
    $text = world_fold((string) ($q['q'] ?? ''));
    $cat = (string) ($q['cat'] ?? '');
    $from = safe_int($q['from'] ?? 0); $to = safe_int($q['to'] ?? 0);
    $own = !empty($q['own']) && (string) $q['own'] !== '0';
    $rows = array_values(array_filter($all, static function ($e) use ($text, $cat, $from, $to, $own) {
        if ($own && empty($e['own'])) { return false; }
        if ($cat !== '' && $e['cat'] !== $cat) { return false; }
        if ($from && $e['to'] < $from) { return false; }
        if ($to && $e['from'] > $to) { return false; }
        if ($text !== '' && !str_contains(world_fold($e['title'] . ' ' . $e['desc'] . ' ' . $e['scope'] . ' ' . ($e['place'] ?? '') . ' ' . $e['from']), $text)) { return false; }
        return true;
    }));
    usort($rows, static fn($x, $y) => [$x['from'], $x['to'], $x['title']] <=> [$y['from'], $y['to'], $y['title']]);
    return ['events' => $rows, 'cats' => $doc['cats'], 'total' => count($all), 'own' => count(array_filter($all, static fn($e) => !empty($e['own']))),
        'credit' => (string) ($doc['credit'] ?? ''), 'licence' => (string) ($doc['licence'] ?? ''), 'licence_url' => (string) ($doc['licence_url'] ?? '')];
}

/** POST save_history_event */
function world_save_event(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $title = mb_substr(trim((string) ($d['title'] ?? '')), 0, 200);
    if ($title === '') { throw new RuntimeException('Donne un titre à l’événement.'); }
    $from = safe_int($d['from_year'] ?? 0); $to = safe_int($d['to_year'] ?? 0) ?: $from;
    if ($from < 1000 || $from > 2100) { throw new RuntimeException('Donne l’année de l’événement (entre 1000 et 2100).'); }
    if ($to < $from || $to > 2100) { throw new RuntimeException('L’année de fin doit venir après celle du début.'); }
    $cats = world_events_bundled()['cats'];
    $cat = (string) ($d['category'] ?? 'société'); if (!isset($cats[$cat])) { $cat = 'société'; }
    $reach = in_array($d['reach'] ?? '', WORLD_REACH, true) ? (string) $d['reach'] : 'commune';
    $place = safe_int($d['place_id'] ?? 0) ?: null;
    if ($place) { $s = $pdo->prepare('SELECT id FROM places WHERE id=?'); $s->execute([$place]); if (!$s->fetchColumn()) { $place = null; } }
    if (in_array($reach, ['commune', 'departement'], true) && !$place) { throw new RuntimeException('Choisis la commune de l’événement.'); }
    $url = trim((string) ($d['url'] ?? ''));
    if ($url !== '' && !preg_match('#^https?://#i', $url)) { throw new RuntimeException('L’adresse du lien doit commencer par http:// ou https://.'); }
    $vals = [$from, $to, mb_substr(trim((string) ($d['date_text'] ?? '')), 0, 80), $title, $cat, mb_substr(trim((string) ($d['quand'] ?? '')), 0, 200),
        mb_substr(trim(str_replace("\r", '', (string) ($d['description'] ?? ''))), 0, 4000), mb_substr(trim((string) ($d['source'] ?? '')), 0, 500), mb_substr($url, 0, 1000), $place, $reach];
    if ($id) {
        $s = $pdo->prepare('UPDATE history_events SET from_year=?, to_year=?, date_text=?, title=?, category=?, quand=?, description=?, source=?, url=?, place_id=?, reach=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $s->execute([...$vals, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Événement introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO history_events(from_year, to_year, date_text, title, category, quand, description, source, url, place_id, reach) VALUES(?,?,?,?,?,?,?,?,?,?,?)')->execute($vals);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', $id, 'update', 'Le monde autour : ' . $title);
    return ['ok' => true, 'id' => $id];
}

/** POST delete_history_event → la ligne entière (pour « ↶ Annuler ») */
function world_delete_event(PDO $pdo, array $d): array
{
    $id = safe_int($d['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM history_events WHERE id=?'); $s->execute([$id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) { throw new RuntimeException('Événement introuvable.'); }
    $pdo->prepare('DELETE FROM history_events WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', $id, 'delete', 'Le monde autour : ' . $row['title'] . ' supprimé');
    return ['ok' => true, 'row' => $row];
}
