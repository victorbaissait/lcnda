<?php
declare(strict_types=1);

/**
 * 🏘️ Fiche d'un village (Listes → Fiche d'un village, structure n°13) : pour une commune, les familles de la base qui
 * y ont vécu, les métiers dominants, l'église et la paroisse, la population au fil des recensements, la carte de Cassini.
 *
 * Une « commune » regroupe tous les lieux de la base qui portent son code INSEE (hameaux compris) ; sans code, le nom
 * et le département. Les notes (église, saint patron, populations relevées…) sont dans village_profiles.
 */

function village_key(array $place): string
{
    $code = trim((string) ($place['admin4_code'] ?? ''));
    if ($code !== '') { return $code; }
    return 'n:' . mb_strtolower(trim((string) ($place['name'] ?? ''))) . '|' . mb_strtolower(trim((string) ($place['county'] ?? '')));
}

/** Lieux de la base qui composent cette commune. */
function village_place_ids(PDO $pdo, string $key): array
{
    if (str_starts_with($key, 'n:')) {
        [$name] = explode('|', substr($key, 2), 2);
        // Comparaison faite en PHP : lower() de SQLite ne met pas « É » en minuscule
        $s = $pdo->prepare("SELECT id, name, county, admin4_code FROM places WHERE name LIKE ? AND COALESCE(admin4_code,'')=''");
        $s->execute(['%' . mb_substr($name, 1)]);
        $ids = [];
        foreach ($s->fetchAll() as $r) { if (village_key($r) === $key) { $ids[] = (int) $r['id']; } }
        if (!$ids) { // nom tout en majuscules accentuées, ou très court : on parcourt tous les lieux sans code
            foreach ($pdo->query("SELECT id, name, county, admin4_code FROM places WHERE COALESCE(admin4_code,'')=''") as $r) { if (village_key($r) === $key) { $ids[] = (int) $r['id']; } }
        }
        return $ids;
    } else {
        $s = $pdo->prepare('SELECT id FROM places WHERE admin4_code=?');
        $s->execute([$key]);
    }
    return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
}

/** Les communes où la famille a vécu (au moins un événement ou un recensement), les plus riches d'abord. */
function villages_list(PDO $pdo, string $q = ''): array
{
    $rows = $pdo->query("SELECT p.id, p.name, p.county, p.state, p.country, p.admin4_code,
            (SELECT count(*) FROM events e WHERE e.place_id=p.id) AS events,
            (SELECT count(DISTINCT e.person_id) FROM events e WHERE e.place_id=p.id AND e.person_id IS NOT NULL) AS persons,
            (SELECT min(e.year) FROM events e WHERE e.place_id=p.id) AS y1, (SELECT max(e.year) FROM events e WHERE e.place_id=p.id) AS y2,
            (SELECT count(*) FROM census_records c WHERE c.place_id=p.id) AS census
        FROM places p WHERE EXISTS (SELECT 1 FROM events e WHERE e.place_id=p.id) OR EXISTS (SELECT 1 FROM census_records c WHERE c.place_id=p.id)")->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $k = village_key($r);
        $v = &$out[$k];
        $v ??= ['key' => $k, 'name' => '', 'county' => $r['county'], 'country' => $r['country'], 'insee' => $r['admin4_code'], 'events' => 0, 'persons' => 0, 'census' => 0, 'from' => null, 'to' => null, 'places' => 0];
        // Nom de la commune : celui du lieu « principal » (le plus utilisé) d'un même code
        if ($v['name'] === '' || (int) $r['events'] > ($v['_best'] ?? -1)) { $v['name'] = $r['name']; $v['_best'] = (int) $r['events']; }
        $v['events'] += (int) $r['events']; $v['persons'] += (int) $r['persons']; $v['census'] += (int) $r['census']; $v['places']++;
        if ($r['y1']) { $v['from'] = $v['from'] === null ? (int) $r['y1'] : min($v['from'], (int) $r['y1']); }
        if ($r['y2']) { $v['to'] = max((int) $v['to'], (int) $r['y2']); }
        unset($v);
    }
    // Nom officiel de la commune quand le code INSEE est connu (pas celui d'un hameau)
    $official = $pdo->prepare('SELECT name FROM commune_contours WHERE insee_code=?');
    foreach ($out as &$v) {
        unset($v['_best']);
        if ($v['insee'] && !str_starts_with($v['key'], 'n:')) { try { $official->execute([$v['insee']]); $n = $official->fetchColumn(); if ($n) { $v['name'] = $n; } } catch (Throwable $_) {} }
    }
    unset($v);
    $out = array_values($out);
    if ($q !== '') { $fq = ascii_fold(mb_strtolower($q)); $out = array_values(array_filter($out, static fn($v) => str_contains(ascii_fold(mb_strtolower($v['name'] . ' ' . $v['county'])), $fq))); }
    usort($out, static fn($a, $b) => $b['persons'] <=> $a['persons'] ?: $b['events'] <=> $a['events'] ?: strcmp($a['name'], $b['name']));
    return $out;
}

function village_profile(PDO $pdo, string $key): array
{
    $s = $pdo->prepare('SELECT * FROM village_profiles WHERE place_key=?'); $s->execute([$key]);
    $p = $s->fetch() ?: ['id' => 0, 'place_key' => $key, 'church' => '', 'patron_saint' => '', 'diocese' => '', 'populations_json' => '[]', 'notes' => '', 'population_source' => ''];
    $p['populations'] = json_decode((string) $p['populations_json'], true) ?: [];
    unset($p['populations_json']);
    return $p;
}

/** « 1793 : 450 », « 1806 = 512 hab. », « 1836 ; 1 204 » → [[1793, 450], …] (une ligne par recensement). */
function parse_populations(string $text): array
{
    $out = [];
    foreach (preg_split('/\R/u', $text) as $line) {
        if (!preg_match('/\b(1[5-9]\d\d|20\d\d)\b\D+([\d\s  .]+)/u', $line, $m)) { continue; }
        $n = (int) preg_replace('/\D/', '', $m[2]);
        if ($n > 0) { $out[(int) $m[1]] = $n; }
    }
    ksort($out);
    return array_map(static fn($y, $n) => [$y, $n], array_keys($out), array_values($out));
}

function village_detail(PDO $pdo, string $key): array
{
    $ids = village_place_ids($pdo, $key);
    if (!$ids) { throw new RuntimeException('Commune introuvable.'); }
    $in = implode(',', $ids);
    $places = $pdo->query("SELECT id, name, county, state, country, latitude, longitude, admin4_code, COALESCE(population,0) AS population FROM places WHERE id IN ({$in})")->fetchAll();
    $main = $places[0];
    foreach ($places as $p) { if ($p['latitude'] !== null && ($main['latitude'] === null || (int) $p['population'] > (int) $main['population'])) { $main = $p; } }
    $name = $main['name'];
    if (!str_starts_with($key, 'n:')) { try { $c = $pdo->prepare('SELECT name, centroid_lat, centroid_lon FROM commune_contours WHERE insee_code=?'); $c->execute([$key]); if ($row = $c->fetch()) { $name = $row['name']; if ($main['latitude'] === null && $row['centroid_lat'] !== null) { $main['latitude'] = $row['centroid_lat']; $main['longitude'] = $row['centroid_lon']; } } } catch (Throwable $_) {} }

    // Personnes qui ont un événement ici (le leur, ou celui de leur couple)
    $ev = $pdo->query("SELECT e.id, e.person_id, e.family_id, e.year, e.date_text, t.gedcom_tag, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.place_id IN ({$in})")->fetchAll();
    $personYears = [];
    $add = static function (int $pid, $year) use (&$personYears): void { if (!$pid) { return; } $personYears[$pid] ??= []; if ($year) { $personYears[$pid][] = (int) $year; } };
    $tags = [];
    $decades = [];
    $byType = [];
    foreach ($ev as $e) {
        if ($e['person_id']) { $add((int) $e['person_id'], $e['year']); }
        elseif ($e['family_id']) { $f = $pdo->query('SELECT partner1_id, partner2_id FROM families WHERE id=' . (int) $e['family_id'])->fetch(); if ($f) { $add((int) $f['partner1_id'], $e['year']); $add((int) $f['partner2_id'], $e['year']); } }
        $tags[$e['gedcom_tag']] = ($tags[$e['gedcom_tag']] ?? 0) + 1;
        if ($e['year']) {
            $d = (int) (floor($e['year'] / 10) * 10);
            $decades[$d] = ($decades[$d] ?? 0) + 1;
            // Par sorte d'acte : naissances, mariages, décès regroupés ; les autres sous leur nom
            $group = match (true) { in_array($e['gedcom_tag'], ['BIRT', 'CHR', 'BAPM'], true) => 'Naissances et baptêmes', in_array($e['gedcom_tag'], ['MARR', 'MARC', 'MARB', 'ENGA'], true) => 'Mariages', in_array($e['gedcom_tag'], ['DEAT', 'BURI', 'CREM'], true) => 'Décès et sépultures', default => (string) $e['label'] };
            $byType[$group][$d] = ($byType[$group][$d] ?? 0) + 1;
        }
    }
    foreach ($pdo->query("SELECT cm.person_id, c.year FROM census_members cm JOIN census_records c ON c.id=cm.census_id WHERE c.place_id IN ({$in}) AND cm.person_id IS NOT NULL") as $r) { $add((int) $r['person_id'], $r['year']); }
    ksort($decades);
    $people = collection_people($pdo, array_keys($personYears));

    // Familles : par nom de famille (écritures voisines regroupées)
    $families = [];
    foreach ($people as $pid => $p) {
        $ln = trim((string) $p['last_name']);
        if ($ln === '') { continue; }
        // Écritures voisines d'un même nom (Dupont, DUPONT, Dupond) : même famille
        $k = preg_replace('/(?<=[a-z])[dt]$/', '', variant_loose(variant_key($ln, 'last_name')));
        $f = &$families[$k];
        $f ??= ['name' => $ln, 'names' => [], 'count' => 0, 'from' => null, 'to' => null, 'people' => []];
        $f['names'][$ln] = ($f['names'][$ln] ?? 0) + 1;
        $f['count']++;
        $years = $personYears[$pid] ?: array_filter([$p['birth_year'] ?? null, $p['death_year'] ?? null]);
        if ($years) { $f['from'] = $f['from'] === null ? min($years) : min($f['from'], min($years)); $f['to'] = max((int) $f['to'], max($years)); }
        $f['people'][] = $p;
        unset($f);
    }
    foreach ($families as &$f) {
        arsort($f['names']); $f['name'] = (string) array_key_first($f['names']); $f['variants'] = array_keys($f['names']); unset($f['names']);
        usort($f['people'], static fn($a, $b) => ((int) ($a['birth_year'] ?? 9999)) <=> ((int) ($b['birth_year'] ?? 9999)));
        $f['generations'] = $f['from'] !== null && $f['to'] !== null ? max(1, (int) round(($f['to'] - $f['from']) / 30) + 1) : 1;
    }
    unset($f);
    $families = array_values($families);
    usort($families, static fn($a, $b) => $b['count'] <=> $a['count'] ?: strcmp($a['name'], $b['name']));

    // Métiers dominants : métier des fiches + métiers notés ici (événement « Profession »)
    $jobs = [];
    $addJob = static function (string $job, $year, int $pid) use (&$jobs): void {
        $job = trim($job);
        if ($job === '') { return; }
        $k = function_exists('variant_key') ? variant_loose(variant_key($job, 'occupation')) : mb_strtolower($job);
        $j = &$jobs[$k];
        $j ??= ['name' => $job, 'people' => [], 'from' => null, 'to' => null];
        $j['people'][$pid] = true;
        if ($year) { $j['from'] = $j['from'] === null ? (int) $year : min($j['from'], (int) $year); $j['to'] = max((int) $j['to'], (int) $year); }
        unset($j);
    };
    foreach ($people as $pid => $p) { $addJob((string) ($p['occupation'] ?? ''), $personYears[$pid] ? min($personYears[$pid]) : null, (int) $pid); }
    foreach ($pdo->query("SELECT e.person_id, e.title, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='OCCU' AND e.place_id IN ({$in}) AND e.person_id IS NOT NULL") as $r) { $addJob((string) $r['title'], $r['year'], (int) $r['person_id']); }
    $jobs = array_values(array_map(static fn($j) => ['name' => $j['name'], 'count' => count($j['people']), 'from' => $j['from'], 'to' => $j['to']], $jobs));
    usort($jobs, static fn($a, $b) => $b['count'] <=> $a['count'] ?: strcmp($a['name'], $b['name']));

    // Recensements de la base à cet endroit
    $census = $pdo->query("SELECT c.year, count(DISTINCT c.id) AS households, count(cm.id) AS members FROM census_records c LEFT JOIN census_members cm ON cm.census_id=c.id WHERE c.place_id IN ({$in}) AND c.year IS NOT NULL GROUP BY c.year ORDER BY c.year")->fetchAll();

    // Paroisse (Ancien Régime), registres en ligne, cimetières
    $parish = [];
    if (function_exists('parish_map')) {
        $map = parish_map($pdo);
        foreach ($ids as $id) { foreach ($map['by_place'][$id] ?? [] as $x) { $parish[$x['parish'] . $x['until']] = $x; } }
        if (!str_starts_with($key, 'n:')) { foreach ($map['by_insee'][$key] ?? [] as $x) { $parish[$x['parish'] . $x['until']] = $x; } }
    }
    $registers = [];
    if (!str_starts_with($key, 'n:') && function_exists('online_registers')) { try { $registers = array_slice(online_registers($pdo, $key, (string) $name, false)['links'] ?? [], 0, 4); } catch (Throwable $_) {} }
    $graves = [];
    try { $g = $pdo->prepare("SELECT cemetery_name, count(*) AS n FROM graves WHERE city=? COLLATE NOCASE GROUP BY cemetery_name ORDER BY n DESC"); $g->execute([$name]); $graves = $g->fetchAll(); } catch (Throwable $_) {}

    $profile = village_profile($pdo, $key);
    $media = $profile['id'] && function_exists('heritage_media') ? (heritage_media($pdo, 'village', [(int) $profile['id']])[(int) $profile['id']] ?? []) : [];
    $labels = $profile['id'] ? (collection_labels($pdo, 'village', [(int) $profile['id']])[(int) $profile['id']] ?? []) : [];
    $current = 0; foreach ($places as $p) { $current = max($current, (int) $p['population']); }

    return [
        'key' => $key, 'name' => $name, 'county' => $main['county'], 'state' => $main['state'], 'country' => $main['country'], 'insee' => str_starts_with($key, 'n:') ? '' : $key,
        'lat' => $main['latitude'] !== null ? (float) $main['latitude'] : null, 'lon' => $main['longitude'] !== null ? (float) $main['longitude'] : null,
        'place_id' => (int) $main['id'], 'places' => village_used_place_names($pdo, $in),
        'families' => $families, 'jobs' => array_slice($jobs, 0, 20), 'people_count' => count($people),
        'acts' => ['baptemes' => ($tags['BIRT'] ?? 0) + ($tags['CHR'] ?? 0) + ($tags['BAPM'] ?? 0), 'mariages' => $tags['MARR'] ?? 0, 'deces' => ($tags['DEAT'] ?? 0) + ($tags['BURI'] ?? 0)],
        'decades' => $decades, 'decades_by_type' => village_decades_by_type($byType), 'census' => $census, 'current_population' => $current,
        'parish' => array_values($parish), 'registers' => $registers, 'graves' => $graves,
        'profile' => $profile, 'media' => $media, 'labels' => $labels,
    ];
}

function save_village_profile(PDO $pdo, array $data): array
{
    $key = safe_text($data['key'] ?? '');
    if ($key === '' || !village_place_ids($pdo, $key)) { throw new RuntimeException('Commune introuvable.'); }
    $pops = is_array($data['populations'] ?? null) ? $data['populations'] : parse_populations((string) ($data['populations_text'] ?? ''));
    $pops = array_values(array_filter(array_map(static fn($r) => is_array($r) ? [(int) ($r[0] ?? 0), (int) ($r[1] ?? 0)] : null, $pops), static fn($r) => $r && $r[0] >= 1500 && $r[0] <= 2100 && $r[1] > 0));
    $pdo->prepare('INSERT INTO village_profiles(place_key, name, church, patron_saint, diocese, populations_json, notes, updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(place_key) DO UPDATE SET name=excluded.name, church=excluded.church, patron_saint=excluded.patron_saint, diocese=excluded.diocese, populations_json=excluded.populations_json, notes=excluded.notes,
            population_source=CASE WHEN excluded.populations_json=\'[]\' THEN \'\' ELSE village_profiles.population_source END, updated_at=CURRENT_TIMESTAMP')
        ->execute([$key, safe_text($data['name'] ?? ''), safe_text($data['church'] ?? ''), safe_text($data['patron_saint'] ?? ''), safe_text($data['diocese'] ?? ''), json_encode($pops), h_long($data, 'notes', 40000)]);
    $id = (int) $pdo->query('SELECT id FROM village_profiles WHERE place_key=' . $pdo->quote($key))->fetchColumn();
    log_change($pdo, 'meta', 0, 'update', 'Fiche du village enregistrée : ' . safe_text($data['name'] ?? $key));
    return ['id' => $id];
}

/** Noms des lieux de la commune vraiment utilisés par la famille (événements, recensements), sans doublon. */
function village_used_place_names(PDO $pdo, string $in): array
{
    return $pdo->query("SELECT DISTINCT name FROM places WHERE id IN ({$in}) AND (EXISTS (SELECT 1 FROM events e WHERE e.place_id=places.id) OR EXISTS (SELECT 1 FROM census_records c WHERE c.place_id=places.id)) ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
}

/** Sortes d'actes dans l'ordre : naissances, mariages, décès, puis les autres (les plus nombreuses d'abord). */
function village_decades_by_type(array $byType): array
{
    $first = ['Naissances et baptêmes', 'Mariages', 'Décès et sépultures'];
    $out = [];
    foreach ($first as $k) { if (isset($byType[$k])) { ksort($byType[$k]); $out[] = ['label' => $k, 'decades' => $byType[$k], 'total' => array_sum($byType[$k])]; } }
    $others = array_diff_key($byType, array_flip($first));
    uksort($others, static fn($a, $b) => array_sum($others[$b]) <=> array_sum($others[$a]) ?: strcmp($a, $b));
    foreach ($others as $k => $d) { ksort($d); $out[] = ['label' => $k, 'decades' => $d, 'total' => array_sum($d)]; }
    return $out;
}

/* ─── 📈 Population de la commune, d'après Wikipédia ─────────────────── */

function wiki_get_json(string $url): array
{
    if (!function_exists('curl_init')) { throw new RuntimeException('Téléchargement impossible : PHP n’a pas l’extension curl.'); }
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 4, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 25,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'LCNDA/0.4 (logiciel de genealogie ; https://github.com/victorbaissait/lcnda)', CURLOPT_HTTPHEADER => ['Accept: application/json']] + lcnda_curl_tls());
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    unset($ch);
    if ($body === false || $code !== 200) { throw new RuntimeException('Wikipédia ne répond pas' . ($err !== '' ? ' (' . $err . ')' : ($code ? " (erreur {$code})" : '')) . '. Vérifie la connexion à Internet.'); }
    $json = json_decode((string) $body, true);
    if (!is_array($json)) { throw new RuntimeException('Réponse de Wikipédia illisible.'); }
    return $json;
}

/** La page Wikipédia de la commune (« Halluin », « Saint-Martin (Gers) »…), ou '' si on ne la trouve pas. */
function village_wiki_title(string $lang, string $name, string $county): string
{
    $api = "https://{$lang}.wikipedia.org/w/api.php?format=json&formatversion=2&";
    $fold = static fn($x) => ascii_fold(mb_strtolower(trim($x)));
    $r = wiki_get_json($api . http_build_query(['action' => 'query', 'list' => 'search', 'srlimit' => 10, 'srnamespace' => 0,
        'srsearch' => '"' . $name . '" ' . ($lang === 'fr' ? 'commune ' : 'town ') . $county]));
    $cands = [];
    foreach ($r['query']['search'] ?? [] as $i => $hit) {
        $t = (string) $hit['title'];
        if ($fold($t) === $fold($name)) { $cands[] = [$i, $t]; }
        elseif (str_starts_with($fold($t), $fold($name) . ' (') || str_starts_with($fold($t), $fold($name) . ', ')) { $cands[] = [$county !== '' && str_contains($fold($t), $fold($county)) ? $i - 20 : $i + 5, $t]; }
    }
    usort($cands, static fn($a, $b) => $a[0] <=> $b[0]);
    foreach ($cands as [, $t]) { // pas une page d'homonymie
        $p = wiki_get_json($api . http_build_query(['action' => 'query', 'prop' => 'pageprops', 'ppprop' => 'disambiguation', 'redirects' => 1, 'titles' => $t]));
        $page = $p['query']['pages'][0] ?? [];
        if (!empty($page['missing']) || isset($page['pageprops']['disambiguation'])) { continue; }
        return (string) ($page['title'] ?? $t);
    }
    return '';
}

/**
 * Chiffres de population d'une page Wikipédia déjà mise en forme (HTML) : la section « Évolution démographique »
 * (frwiki : une ligne d'années, puis une ligne d'habitants) ou « Historical population » (enwiki : année | habitants).
 */
function village_parse_population_html(string $html): array
{
    $at = -1; $level = 2;
    foreach (['Évolution_démographique', 'Démographie', 'Historical_population', 'Population_history', 'Demographics', 'Population', 'Bevölkerungsentwicklung', 'Einwohnerentwicklung'] as $id) {
        if (preg_match('/<h([2-6])[^>]*\bid="' . preg_quote($id, '/') . '"/u', $html, $m, PREG_OFFSET_CAPTURE)) { $at = $m[0][1]; $level = (int) $m[1][0]; break; }
    }
    if ($at < 0) { return []; }
    $rest = substr($html, $at + 10);
    $end = preg_match('/<h[2-' . $level . '][\s>]/', $rest, $m, PREG_OFFSET_CAPTURE) ? $m[0][1] : strlen($rest);
    $part = substr($rest, 0, $end);
    $part = preg_replace('#<sup\b.*?</sup>#su', '', $part); // appels de notes [1], [a]
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8"?><div>' . $part . '</div>');
    libxml_clear_errors();
    $year = static fn(string $t) => preg_match('/^\D{0,3}(1[5-9]\d\d|20\d\d)\D{0,4}$/u', trim($t), $m) ? (int) $m[1] : 0;
    $count = static function (string $t): int {
        $t = trim(preg_replace('/\(.*?\)/u', '', $t));
        if (!preg_match('/^[\d\s\x{00A0}\x{202F}.,\x{2009}]+$/u', $t)) { return 0; }
        $t = preg_replace('/[.,]\d{1,2}$/', '', $t); // décimales éventuelles
        return (int) preg_replace('/\D/', '', $t);
    };
    $out = [];
    foreach ($dom->getElementsByTagName('table') as $table) {
        $rows = [];
        foreach ($table->getElementsByTagName('tr') as $tr) {
            $cells = [];
            foreach ($tr->childNodes as $c) { if ($c instanceof DOMElement && in_array($c->nodeName, ['td', 'th'], true)) { $cells[] = trim(preg_replace('/\s+/u', ' ', $c->textContent)); } }
            if ($cells) { $rows[] = $cells; }
        }
        for ($i = 0; $i < count($rows); $i++) {
            $ys = array_map($year, $rows[$i]);
            // une ligne d'années suivie d'une ligne d'habitants
            if (count($ys) >= 2 && count(array_filter($ys)) === count($ys) && isset($rows[$i + 1]) && count($rows[$i + 1]) === count($ys)) {
                foreach ($ys as $k => $y) { $n = $count($rows[$i + 1][$k]); if ($n > 0) { $out[$y] = $n; } }
                $i++;
                continue;
            }
            // année | habitants (| évolution)
            if (count($rows[$i]) >= 2 && $year($rows[$i][0]) && ($n = $count($rows[$i][1])) > 0) { $out[$year($rows[$i][0])] = $n; }
        }
    }
    ksort($out);
    $out = array_filter($out, static fn($n) => $n < 40000000);
    return array_map(static fn($y, $n) => [$y, $n], array_keys($out), array_values($out));
}

/** Va chercher la page Wikipédia de la commune et en tire l'évolution du nombre d'habitants. */
function village_wiki_population(PDO $pdo, string $key, string $title = ''): array
{
    $v = village_detail($pdo, $key);
    $country = ascii_fold(mb_strtolower((string) ($v['country'] ?? '')));
    $langs = in_array($country, ['', 'france', 'belgique', 'suisse', 'luxembourg', 'monaco', 'canada', 'quebec'], true) ? ['fr', 'en'] : (in_array($country, ['allemagne', 'deutschland', 'germany', 'autriche', 'osterreich', 'austria'], true) ? ['de', 'en', 'fr'] : ['en', 'fr']);
    foreach ($langs as $lang) {
        $t = $title !== '' && $lang === $langs[0] ? $title : village_wiki_title($lang, (string) $v['name'], (string) ($v['county'] ?? ''));
        if ($t === '') { continue; }
        $p = wiki_get_json("https://{$lang}.wikipedia.org/w/api.php?format=json&formatversion=2&" . http_build_query(['action' => 'parse', 'page' => $t, 'prop' => 'text', 'redirects' => 1, 'disablelimitreport' => 1, 'disableeditsection' => 1]));
        $html = (string) ($p['parse']['text'] ?? '');
        // une commune homonyme d'un autre département : la page doit parler du nôtre
        $county = trim((string) ($v['county'] ?? ''));
        if ($county !== '' && !str_contains(ascii_fold(mb_strtolower(html_entity_decode(strip_tags($html)))), ascii_fold(mb_strtolower($county)))) { continue; }
        $pops = village_parse_population_html($html);
        $real = (string) ($p['parse']['title'] ?? $t);
        if (count($pops) >= 2) { return ['populations' => $pops, 'title' => $real, 'url' => "https://{$lang}.wikipedia.org/wiki/" . rawurlencode(str_replace(' ', '_', $real)), 'lang' => $lang]; }
    }
    throw new RuntimeException('Pas de chiffres de population trouvés sur Wikipédia pour ' . $v['name'] . '. Tu peux les saisir à la main (crayon en haut).');
}

/** Enregistre les chiffres récupérés (ils remplacent ceux des mêmes années ; les autres saisis à la main restent). */
function save_village_populations(PDO $pdo, array $data): array
{
    $key = safe_text($data['key'] ?? '');
    if ($key === '' || !village_place_ids($pdo, $key)) { throw new RuntimeException('Commune introuvable.'); }
    $merged = [];
    foreach (village_profile($pdo, $key)['populations'] as $r) { $merged[(int) $r[0]] = (int) $r[1]; }
    foreach ((array) ($data['populations'] ?? []) as $r) { if (is_array($r) && (int) ($r[0] ?? 0) >= 1500 && (int) $r[0] <= 2100 && (int) ($r[1] ?? 0) > 0) { $merged[(int) $r[0]] = (int) $r[1]; } }
    ksort($merged);
    $pops = array_map(static fn($y, $n) => [$y, $n], array_keys($merged), array_values($merged));
    $source = preg_match('#^https://[a-z]{2,3}\.wikipedia\.org/wiki/#', (string) ($data['source'] ?? '')) ? (string) $data['source'] : '';
    $pdo->prepare("INSERT INTO village_profiles(place_key, name, populations_json, population_source, updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(place_key) DO UPDATE SET populations_json=excluded.populations_json, population_source=excluded.population_source, updated_at=CURRENT_TIMESTAMP")
        ->execute([$key, safe_text($data['name'] ?? ''), json_encode($pops), $source]);
    log_change($pdo, 'meta', 0, 'update', 'Population du village récupérée : ' . safe_text($data['name'] ?? $key));
    return ['populations' => $pops];
}
