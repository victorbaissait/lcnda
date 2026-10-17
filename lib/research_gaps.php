<?php
declare(strict_types=1);

/**
 * 🔍 Assistant de recherche « Que manque-t-il ? » (Recherche → type « Que manque-t-il ? ») : pour chaque ancêtre de la
 * lignée, les actes qui manquent (naissance, mariage, décès, parents — voir suggestions.php — et aussi recensements,
 * registre matricule, succession, contrat de mariage), avec la commune, les années, le service d'archives
 * (Archives départementales de tel département) et les séries où chercher selon l'époque : registres paroissiaux avant
 * 1792, état civil et tables décennales ensuite, minutes notariales (3 E), enregistrement (3 Q), recrutement (1 R),
 * recensements (6 M). Ce qui est déjà dans le suivi des dépouillements est signalé. Lecture seule.
 */

/** les départements français : code => [nom, article (« de la », « du »…)] */
function gaps_departments(): array
{
    static $d = null;
    if ($d !== null) { return $d; }
    $raw = "01|Ain|de l’;02|Aisne|de l’;03|Allier|de l’;04|Alpes-de-Haute-Provence|des ;05|Hautes-Alpes|des ;06|Alpes-Maritimes|des ;07|Ardèche|de l’;08|Ardennes|des ;09|Ariège|de l’;10|Aube|de l’;11|Aude|de l’;12|Aveyron|de l’;13|Bouches-du-Rhône|des ;14|Calvados|du ;15|Cantal|du ;16|Charente|de la ;17|Charente-Maritime|de la ;18|Cher|du ;19|Corrèze|de la ;2A|Corse-du-Sud|de la ;2B|Haute-Corse|de la ;21|Côte-d’Or|de la ;22|Côtes-d’Armor|des ;23|Creuse|de la ;24|Dordogne|de la ;25|Doubs|du ;26|Drôme|de la ;27|Eure|de l’;28|Eure-et-Loir|d’;29|Finistère|du ;30|Gard|du ;31|Haute-Garonne|de la ;32|Gers|du ;33|Gironde|de la ;34|Hérault|de l’;35|Ille-et-Vilaine|d’;36|Indre|de l’;37|Indre-et-Loire|d’;38|Isère|de l’;39|Jura|du ;40|Landes|des ;41|Loir-et-Cher|de ;42|Loire|de la ;43|Haute-Loire|de la ;44|Loire-Atlantique|de la ;45|Loiret|du ;46|Lot|du ;47|Lot-et-Garonne|de ;48|Lozère|de la ;49|Maine-et-Loire|de ;50|Manche|de la ;51|Marne|de la ;52|Haute-Marne|de la ;53|Mayenne|de la ;54|Meurthe-et-Moselle|de ;55|Meuse|de la ;56|Morbihan|du ;57|Moselle|de la ;58|Nièvre|de la ;59|Nord|du ;60|Oise|de l’;61|Orne|de l’;62|Pas-de-Calais|du ;63|Puy-de-Dôme|du ;64|Pyrénées-Atlantiques|des ;65|Hautes-Pyrénées|des ;66|Pyrénées-Orientales|des ;67|Bas-Rhin|du ;68|Haut-Rhin|du ;69|Rhône|du ;70|Haute-Saône|de la ;71|Saône-et-Loire|de ;72|Sarthe|de la ;73|Savoie|de la ;74|Haute-Savoie|de la ;75|Paris|de ;76|Seine-Maritime|de la ;77|Seine-et-Marne|de ;78|Yvelines|des ;79|Deux-Sèvres|des ;80|Somme|de la ;81|Tarn|du ;82|Tarn-et-Garonne|de ;83|Var|du ;84|Vaucluse|de ;85|Vendée|de la ;86|Vienne|de la ;87|Haute-Vienne|de la ;88|Vosges|des ;89|Yonne|de l’;90|Territoire de Belfort|du ;91|Essonne|de l’;92|Hauts-de-Seine|des ;93|Seine-Saint-Denis|de la ;94|Val-de-Marne|du ;95|Val-d’Oise|du ;971|Guadeloupe|de la ;972|Martinique|de la ;973|Guyane|de la ;974|La Réunion|de ;976|Mayotte|de ";
    $d = [];
    foreach (explode(';', $raw) as $row) { [$code, $name, $art] = explode('|', $row); $d[$code] = ['code' => $code, 'name' => $name, 'article' => $art]; }
    return $d;
}

function gaps_norm(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['’' => "'", 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'ô' => 'o', 'î' => 'i', 'ï' => 'i', 'û' => 'u', 'ù' => 'u', 'ç' => 'c', '-' => ' ']);
    return preg_replace('/\s+/', ' ', $s) ?? $s;
}

/** le service d'archives d'un lieu : un département français (par son code, son nom, ou « (19) » dans le nom), sinon le pays */
function gaps_archive_of(array $place): array
{
    $deps = gaps_departments();
    $country = trim((string) ($place['country'] ?? ''));
    $french = $country === '' || preg_match('/^(france|fr|fra)$/i', $country);
    $hit = null;
    if ($french) {
        $code = strtoupper(trim((string) ($place['admin2_code'] ?? '')));
        if (isset($deps[$code])) { $hit = $deps[$code]; }
        if (!$hit && ($county = gaps_norm((string) ($place['county'] ?? ''))) !== '') {
            foreach ($deps as $d) { if (gaps_norm($d['name']) === $county || preg_match('/^0?' . preg_quote($county, '/') . '$/', $d['code'])) { $hit = $d; break; } }
        }
        if (!$hit && preg_match('/\((\d{2,3}|2A|2B)\)/i', (string) ($place['name'] ?? ''), $m) && isset($deps[strtoupper(str_pad($m[1], 2, '0', STR_PAD_LEFT))])) { $hit = $deps[strtoupper(str_pad($m[1], 2, '0', STR_PAD_LEFT))]; }
        if (!$hit) {
            foreach (array_slice(array_map('trim', explode(',', (string) ($place['name'] ?? ''))), 1) as $part) {
                foreach ($deps as $d) { if (gaps_norm($d['name']) === gaps_norm($part)) { $hit = $d; break 2; } }
            }
        }
    }
    if ($hit) {
        $service = match ($hit['code']) {
            '75' => 'Archives de Paris',
            '67', '68' => 'Archives d’Alsace (' . ($hit['code'] === '67' ? 'site de Strasbourg' : 'site de Colmar') . ')',
            default => 'Archives départementales ' . $hit['article'] . $hit['name'],
        };
        return ['key' => $hit['code'], 'label' => $service, 'department' => $hit['name'], 'code' => $hit['code'], 'france' => true];
    }
    if ($french) { return ['key' => '?', 'label' => 'Archives départementales (département à préciser)', 'department' => '', 'code' => '', 'france' => true]; }
    return ['key' => 'x-' . mb_strtolower($country), 'label' => 'Archives de ' . $country, 'department' => '', 'code' => '', 'france' => false, 'country' => $country];
}

/** les années d'un dépouillement (« 1823-1848 », « 1830 ») recoupent-elles la recherche ? (sans années : oui) */
function gaps_overlap(string $text, ?int $from, ?int $to): bool
{
    if (!preg_match_all('/\b(1[5-9]\d\d|20\d\d)\b/', $text, $m) || $from === null) { return true; }
    $ys = array_map('intval', $m[1]);
    return min($ys) <= ($to ?? $from) && max($ys) >= $from;
}

/** les tables décennales qui couvrent une fenêtre d'années (1792-1802, puis 1803-1812, 1813-1822…) */
function gaps_decennial(int $from, int $to): array
{
    $out = [];
    $from = max(1792, $from);
    for ($start = 1792; $start <= min($to, 1962); $start = $start === 1792 ? 1803 : $start + 10) {
        $end = $start === 1792 ? 1802 : $start + 9;
        if ($end >= $from && $start <= $to) { $out[] = "$start-$end"; }
    }
    return $out;
}

/** où chercher : les séries et les conseils, selon la sorte d'acte et l'époque */
function gaps_where(string $kind, ?int $from, ?int $to, array $arch, string $place): array
{
    $from = $from ?? $to; $to = $to ?? $from;
    $mid = $from !== null ? (int) round(($from + $to) / 2) : null;
    $old = $mid !== null && $mid < 1792;
    $commune = $place !== '' ? $place : 'la commune';
    $steps = [];
    $td = ($to !== null && $to >= 1792) ? gaps_decennial((int) $from, (int) $to) : [];
    $tdLine = $td ? 'Commence par les tables décennales (un index alphabétique par décennie), puis le registre de l’année trouvée.' : '';
    $young = static fn(int $years) => $to !== null && $to > (int) date('Y') - $years;
    switch ($kind) {
        case 'birth':
            if ($old || ($from !== null && $from < 1792)) { $steps[] = ['series' => 'Registres paroissiaux (BMS)', 'detail' => "Les baptêmes de la paroisse de $commune (collection communale, série E dépôt ou GG ; ou celle du greffe). Le baptême suit la naissance de 0 à 3 jours."]; }
            if ($to === null || $to >= 1792) { $steps[] = ['series' => 'État civil — naissances', 'detail' => trim("Les registres de naissances de $commune. $tdLine")]; }
            if ($young(75)) { $steps[] = ['series' => 'Mairie', 'detail' => 'Un acte de naissance de moins de 75 ans n’est pas en ligne : copie intégrale à demander à la mairie (avec la preuve de ta filiation).']; }
            break;
        case 'marriage':
            if ($old || ($from !== null && $from < 1792)) { $steps[] = ['series' => 'Registres paroissiaux (BMS)', 'detail' => "Les mariages de la paroisse de $commune, d’ordinaire celle de l’épouse ; regarde aussi les bans dans la paroisse de l’époux."]; }
            if ($to === null || $to >= 1792) { $steps[] = ['series' => 'État civil — mariages', 'detail' => trim("Les registres de mariages de $commune (commune de l’épouse le plus souvent). $tdLine Les publications de bans sont parfois dans un registre à part.")]; }
            $steps[] = ['series' => $old ? 'Notaires (série E) et contrôle des actes (2 C)' : 'Minutes notariales (série 3 E)', 'detail' => 'Le contrat de mariage, signé chez un notaire quelques jours ou semaines avant ; depuis 1850 l’acte de mariage dit s’il y en a un, et chez quel notaire.' . ($old ? ' Le registre du contrôle des actes (série 2 C) donne le notaire et la date.' : ' Les registres de l’enregistrement (série 3 Q, actes civils publics) le retrouvent aussi.')];
            if ($young(75)) { $steps[] = ['series' => 'Mairie', 'detail' => 'Un acte de mariage de moins de 75 ans n’est pas en ligne : copie à demander à la mairie.']; }
            break;
        case 'death':
            if ($old || ($from !== null && $from < 1792)) { $steps[] = ['series' => 'Registres paroissiaux (BMS)', 'detail' => "Les sépultures de la paroisse de $commune (inhumation le lendemain du décès, en général)."]; }
            if ($to === null || $to >= 1792) { $steps[] = ['series' => 'État civil — décès', 'detail' => trim("Les décès de $commune, mais aussi de la commune d’un enfant chez qui la personne a pu finir sa vie, ou de l’hospice voisin. $tdLine")]; }
            if ($to === null || $to >= 1791) { $steps[] = ['series' => 'Enregistrement (série 3 Q)', 'detail' => 'Les tables des successions et absences du bureau de l’enregistrement du canton : la date et le lieu du décès, les héritiers, parfois les biens.']; }
            if ($from !== null && $from <= 1921 && $to >= 1914) { $steps[] = ['series' => 'Mémoire des hommes', 'detail' => 'Pour un homme mort entre 1914 et 1921 : la base des « morts pour la France » (ministère des Armées).']; }
            break;
        case 'parents':
            $steps[] = ['series' => $old ? 'Registres paroissiaux (BMS)' : 'État civil — mariages', 'detail' => "Son acte de mariage nomme ses parents (et dit s’ils sont vivants) ; à défaut, son acte de " . ($old ? 'baptême' : 'naissance') . '. Avant 1792, les actes de mariage nomment souvent les parents, pas toujours.'];
            $steps[] = ['series' => 'Recensements (série 6 M), à partir de 1836', 'detail' => 'La famille sous le même toit, avec les âges : pour trouver la commune et l’année de naissance.'];
            break;
        case 'census':
            $steps[] = ['series' => 'Recensements (série 6 M)', 'detail' => "Les listes nominatives de $commune, tous les 5 ans de 1836 à 1936 (avec l’âge, le métier, toute la maisonnée) ; beaucoup sont en ligne. Dans une grande ville, il faut l’adresse (rue)."];
            break;
        case 'military':
            $steps[] = ['series' => 'Recrutement militaire (série 1 R)', 'detail' => 'Le registre matricule de sa classe (année de naissance + 20), au bureau de recrutement du département où il habitait à 20 ans : signalement (taille, yeux, cheveux), adresses successives, campagnes, blessures. Index alphabétique par classe.'];
            break;
        case 'succession':
            $steps[] = ['series' => 'Enregistrement (série 3 Q)', 'detail' => 'Les tables des successions et absences puis les registres des mutations après décès, au bureau de l’enregistrement du canton du décès : héritiers, biens, valeur. Souvent dans les 6 mois après le décès.'];
            break;
        case 'contract':
            $steps[] = ['series' => $old ? 'Notaires (série E) et contrôle des actes (2 C)' : 'Minutes notariales (série 3 E)', 'detail' => 'Le contrat de mariage chez le notaire du bourg ou du canton, peu avant le mariage : la dot, les témoins, la famille élargie.' . ($old ? '' : ' L’acte de mariage (après 1850) dit s’il y a un contrat et chez quel notaire.')];
            break;
    }
    if (!$arch['france']) { $steps[] = ['series' => $arch['label'], 'detail' => 'Hors de France : les registres sont aux archives de la région ou de la paroisse ; FamilySearch en a numérisé beaucoup.']; }
    elseif (in_array($arch['code'], ['971', '972', '973', '974', '976'], true)) { $steps[] = ['series' => 'ANOM (Aix-en-Provence)', 'detail' => 'Les Archives nationales d’outre-mer gardent les doubles des registres (état civil en ligne).']; }
    elseif ($arch['code'] === '75' && $mid !== null && $mid < 1860) { $steps[] = ['series' => 'État civil reconstitué', 'detail' => 'L’état civil parisien d’avant 1860 a brûlé en 1871 : chercher dans les fichiers de l’état civil reconstitué (Archives de Paris).']; }
    return $steps;
}

function research_gaps_data(PDO $pdo, array $q = []): array
{
    $maxGen = max(2, min(12, safe_int($q['gen'] ?? 7) ?: 7));
    $base = function_exists('research_suggestions_data') ? research_suggestions_data($pdo, 200) : ['root_id' => 0, 'items' => []];
    $root = (int) ($base['root_id'] ?? 0);
    if (!$root) { return ['root_id' => 0, 'items' => [], 'archives' => [], 'counts' => []]; }
    $positions = array_filter(sosa_positions($pdo, $root, 20000)['positions'] ?? [], static fn($s) => $s < (1 << $maxGen), ARRAY_FILTER_USE_KEY);
    ksort($positions);
    $ids = array_values(array_unique($positions));
    $sosaOf = []; foreach ($positions as $s => $pid) { $sosaOf[$pid] ??= $s; }
    $items = array_values(array_filter($base['items'] ?? [], static fn($it) => $it['generation'] <= $maxGen));

    // de quoi chercher les autres manques : naissance, décès, dernier lieu, service militaire, recensements trouvés
    $people = [];
    if ($ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $s = $pdo->prepare("SELECT id, first_name, last_name, gender, living_status, COALESCE(military_data,'') AS mil FROM persons WHERE id IN ($marks)"); $s->execute($ids);
        foreach ($s->fetchAll() as $p) { $people[(int) $p['id']] = $p + ['by' => null, 'dy' => null, 'bplace' => '', 'dplace' => '', 'lplace' => '', 'ly' => null, 'census' => 0, 'tags' => []]; }
        $s = $pdo->prepare("SELECT e.person_id, e.year, t.gedcom_tag, COALESCE(pl.name,'') AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id IN ($marks) ORDER BY e.year"); $s->execute($ids);
        foreach ($s->fetchAll() as $e) { $pid = (int) $e['person_id']; if (!isset($people[$pid])) { continue; } $p = &$people[$pid]; $tag = (string) $e['gedcom_tag']; $y = $e['year'] !== null ? (int) $e['year'] : null; $p['tags'][$tag] = true;
            if (in_array($tag, ['BIRT', 'BAPM', 'CHR'], true) && $p['by'] === null) { $p['by'] = $y; $p['bplace'] = $p['bplace'] ?: $e['place']; }
            if (in_array($tag, ['DEAT', 'BURI'], true) && $p['dy'] === null) { $p['dy'] = $y; $p['dplace'] = $p['dplace'] ?: $e['place']; }
            if ($e['place'] !== '' && $y !== null && ($p['ly'] === null || $y >= $p['ly'])) { $p['ly'] = $y; $p['lplace'] = $e['place']; }
            unset($p); }
        try { $s = $pdo->prepare("SELECT person_id, count(*) AS n FROM census_members WHERE person_id IN ($marks) GROUP BY person_id"); $s->execute($ids); foreach ($s->fetchAll() as $r) { if (isset($people[(int) $r['person_id']])) { $people[(int) $r['person_id']]['census'] = (int) $r['n']; } } } catch (Throwable $_) {}
    }
    $now = (int) date('Y');
    $add = static function (int $pid, string $kind, string $what, ?int $from, ?int $to, string $place, string $why) use (&$items, $sosaOf, $people) {
        $s = $sosaOf[$pid] ?? 0; $p = $people[$pid];
        $items[] = ['sosa' => $s, 'generation' => $s ? (int) floor(log($s, 2)) + 1 : 0, 'person_id' => $pid, 'kind' => $kind, 'what' => $what, 'from' => $from, 'to' => $to, 'place' => $place, 'why' => $why,
            'name' => trim($p['first_name'] . ' ' . $p['last_name']) ?: 'Personne #' . $pid, 'gender' => $p['gender']];
    };
    $census = [1836, 1841, 1846, 1851, 1856, 1861, 1866, 1872, 1876, 1881, 1886, 1891, 1896, 1901, 1906, 1911, 1921, 1926, 1931, 1936];
    foreach ($people as $pid => $p) {
        $by = $p['by']; $dy = $p['dy']; $male = $p['gender'] === 'male';
        // recensements : vivant entre 1836 et 1936, aucun recensement relié
        if (!$p['census'] && ($by || $dy)) {
            $a = $by ?? ($dy - 60); $b = $dy ?? min($now, $a + 85);
            $ys = array_values(array_filter($census, static fn($y) => $y >= $a && $y <= $b));
            if ($ys) { $add($pid, 'census', 'recensements', $ys[0], end($ys), $p['lplace'] ?: $p['bplace'], 'vivant' . ($p['gender'] === 'female' ? 'e' : '') . ' aux recensements de ' . (count($ys) > 6 ? $ys[0] . ' à ' . end($ys) . ' (' . count($ys) . ')' : implode(', ', $ys))); }
        }
        // registre matricule : homme né de 1847 à 1921 (classes 1867 à 1941), sans dossier militaire
        if ($male && $by && $by >= 1847 && $by <= 1921 && trim((string) $p['mil'], " {}[]\n") === '') { $add($pid, 'military', 'registre matricule', $by + 20, $by + 20, $p['bplace'], 'classe ' . ($by + 20) . ' (né en ' . $by . ')'); }
        // succession : décès connu entre 1791 et 1960, sans succession ni testament
        if ($dy && $dy >= 1791 && $dy <= 1960 && empty($p['tags']['PROB']) && empty($p['tags']['WILL'])) { $add($pid, 'succession', 'succession', $dy, $dy + 1, $p['dplace'] ?: $p['lplace'], 'décès en ' . $dy); }
    }
    // contrats de mariage : mariage connu (avant 1940) sans contrat
    if ($ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $s = $pdo->prepare("SELECT f.id, f.partner1_id, f.partner2_id, e.year, COALESCE(pl.name,'') AS place,
                EXISTS(SELECT 1 FROM events c JOIN event_types ct ON ct.id=c.event_type_id WHERE c.family_id=f.id AND ct.gedcom_tag IN ('MARC','MARS','MARB')) AS has_contract
            FROM families f JOIN events e ON e.family_id=f.id JOIN event_types t ON t.id=e.event_type_id AND t.gedcom_tag='MARR' LEFT JOIN places pl ON pl.id=e.place_id
            WHERE f.partner1_id IN ($marks) AND f.partner2_id IN ($marks) AND e.year IS NOT NULL");
        $s->execute(array_merge($ids, $ids));
        $done = [];
        foreach ($s->fetchAll() as $m) {
            if ((int) $m['has_contract'] || (int) $m['year'] >= 1940 || isset($done[(int) $m['id']])) { continue; } $done[(int) $m['id']] = true;
            $husband = isset($people[(int) $m['partner1_id']]) && $people[(int) $m['partner1_id']]['gender'] === 'male' ? (int) $m['partner1_id'] : (int) $m['partner2_id'];
            if (!isset($people[$husband])) { continue; }
            $add($husband, 'contract', 'contrat de mariage', (int) $m['year'] - 1, (int) $m['year'], (string) $m['place'], 'mariage en ' . $m['year']);
        }
    }

    // le lieu → le service d'archives
    $placeCache = [];
    $placeRow = static function (string $name) use ($pdo, &$placeCache): array {
        if ($name === '') { return []; }
        if (!isset($placeCache[$name])) {
            try { $s = $pdo->prepare('SELECT id, name, county, country, admin2_code FROM places WHERE name=? ORDER BY (admin2_code IS NOT NULL AND admin2_code<>\'\') DESC, id LIMIT 1'); $s->execute([$name]); $placeCache[$name] = $s->fetch() ?: ['name' => $name]; }
            catch (Throwable $_) { $s = $pdo->prepare('SELECT id, name, county, country FROM places WHERE name=? LIMIT 1'); $s->execute([$name]); $placeCache[$name] = $s->fetch() ?: ['name' => $name]; }
        }
        return $placeCache[$name];
    };
    // ce qui est déjà dans le suivi des dépouillements
    $digest = [];
    try { foreach ($pdo->query("SELECT id, place_id, city_name, record_type, year_text, status FROM archive_digest_entries") as $r) { $digest[] = $r; } } catch (Throwable $_) {}
    $recType = ['birth' => 'naissance', 'marriage' => 'mariage', 'death' => 'deces', 'parents' => 'mariage', 'census' => 'recensement', 'military' => 'fiche_militaire', 'succession' => 'succession', 'contract' => 'autre'];
    $archives = [];
    foreach ($items as &$it) {
        $pl = $placeRow((string) $it['place']);
        $arch = gaps_archive_of($pl ?: ['name' => (string) $it['place']]);
        $it['place_id'] = (int) ($pl['id'] ?? 0);
        $it['archive'] = $arch;
        $it['record_type'] = $recType[$it['kind']] ?? 'autre';
        if (in_array($it['kind'], ['birth', 'death'], true) && $it['to'] !== null && $it['to'] < 1792) { $it['record_type'] = $it['kind'] === 'birth' ? 'bapteme' : 'deces'; }
        $it['where'] = gaps_where($it['kind'], $it['from'], $it['to'], $arch, (string) $it['place']);
        $it['decennial'] = ($it['to'] ?? 0) >= 1792 && in_array($it['kind'], ['birth', 'marriage', 'death', 'parents'], true) ? gaps_decennial((int) ($it['from'] ?? $it['to']), (int) $it['to']) : [];
        $it['digested'] = array_values(array_map(static fn($r) => ['id' => (int) $r['id'], 'year_text' => (string) $r['year_text'], 'status' => (string) $r['status']], array_filter($digest, static fn($r) => $r['record_type'] === $it['record_type']
            && (($it['place_id'] && (int) $r['place_id'] === $it['place_id']) || ($it['place'] !== '' && gaps_norm((string) $r['city_name']) === gaps_norm((string) $it['place'])))
            && gaps_overlap((string) $r['year_text'], $it['from'], $it['to']))));
        $k = $arch['key'];
        $archives[$k] ??= ['key' => $k, 'label' => $arch['label'], 'department' => $arch['department'], 'code' => $arch['code'], 'count' => 0, 'communes' => []];
        $archives[$k]['count']++;
        if ($it['place'] !== '') { $archives[$k]['communes'][$it['place']] = ($archives[$k]['communes'][$it['place']] ?? 0) + 1; }
    }
    unset($it);
    $order = ['birth' => 0, 'marriage' => 1, 'death' => 2, 'parents' => 3, 'contract' => 4, 'succession' => 5, 'census' => 6, 'military' => 7];
    usort($items, static fn($a, $b) => [$a['generation'], $order[$a['kind']] ?? 9, $a['sosa']] <=> [$b['generation'], $order[$b['kind']] ?? 9, $b['sosa']]);
    $archives = array_values($archives);
    usort($archives, static fn($a, $b) => $b['count'] <=> $a['count']);
    foreach ($archives as &$a) { arsort($a['communes']); $a['communes'] = array_slice(array_keys($a['communes']), 0, 12); }
    unset($a);
    $counts = []; foreach ($items as $it) { $counts[$it['kind']] = ($counts[$it['kind']] ?? 0) + 1; }
    $rootName = ''; try { $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$root]); $r = $s->fetch(); $rootName = $r ? trim($r['first_name'] . ' ' . $r['last_name']) : ''; } catch (Throwable $_) {}
    return ['root_id' => $root, 'root_name' => $rootName, 'generations' => $maxGen, 'ancestors' => count($ids), 'items' => array_slice($items, 0, 600), 'total' => count($items), 'archives' => $archives, 'counts' => $counts];
}
