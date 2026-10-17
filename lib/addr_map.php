<?php
declare(strict_types=1);

/*
 * 🗺️ Plan des adresses d'une commune (structure n°31 ; écran : assets/js/heritage-addrmap.js).
 * Les adresses viennent des personnes relevées dans les dépouillements (archive_digest_people.address), commune par commune
 * (code INSEE), année par année. Pour les placer :
 *  - la Base Adresse Nationale (BAN) du département, téléchargée UNE fois (adresse.data.gouv.fr, fichier .csv.gz), puis lue
 *    en local : on n'en garde que les communes utiles (ban_addresses) ; tout se fait ensuite sans Internet ;
 *  - les anciens noms de rues (addr_streets) : « rue Haute » = aujourd'hui « rue Paul Doumer », ou rue disparue (tracé à la main) ;
 *  - les points posés à la main sur une carte ancienne (addr_points, source 'manual') : jamais écrasés par le placement automatique.
 * La BAN ne connaît que les adresses d'aujourd'hui : une rue détruite n'y est pas, une rue percée depuis y est.
 */

const ADDR_BAN_URL = 'https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-%s.csv.gz';
const ADDR_STOP = ['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'en', 'et'];
const ADDR_ABBR = ['r' => 'rue', 'rue' => 'rue', 'av' => 'avenue', 'ave' => 'avenue', 'bd' => 'boulevard', 'bld' => 'boulevard', 'boul' => 'boulevard', 'pl' => 'place', 'ch' => 'chemin', 'chem' => 'chemin',
    'imp' => 'impasse', 'rte' => 'route', 'fbg' => 'faubourg', 'faub' => 'faubourg', 'gde' => 'grande', 'gd' => 'grand', 'st' => 'saint', 'ste' => 'sainte', 'sq' => 'square', 'all' => 'allee',
    'pas' => 'passage', 'quai' => 'quai', 'crs' => 'cours', 'sent' => 'sentier', 'hameau' => 'hameau', 'ham' => 'hameau', 'lt' => 'lieutenant', 'mal' => 'marechal', 'gal' => 'general', 'pdt' => 'president'];

/** Nom de rue → clé de comparaison : sans accents, abréviations développées, petits mots retirés (« R. de la Seine » = « rue Seine »). */
function addr_street_key(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ú' => 'u', 'ÿ' => 'y', 'œ' => 'oe', 'æ' => 'ae', 'ñ' => 'n']);
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s) ?? '';
    $out = [];
    foreach (preg_split('/\s+/', trim($s)) ?: [] as $i => $w) {
        if ($w === '') { continue; }
        if (isset(ADDR_ABBR[$w]) && ($i === 0 || in_array($w, ['st', 'ste', 'gde', 'gd', 'lt', 'mal', 'gal', 'pdt'], true))) { $w = ADDR_ABBR[$w]; }
        if (in_array($w, ADDR_STOP, true)) { continue; }
        $out[] = $w;
    }
    return implode(' ', $out);
}

/** « 3 bis », « 3B », « 3 b » → « 3b » ; « 12 » → « 12 » ; '' si pas de numéro. */
function addr_house_key(string $h): string
{
    $h = mb_strtolower(trim($h));
    if (!preg_match('/^(\d+)\s*([a-z]*)/u', $h, $m)) { return ''; }
    $rep = ['bis' => 'b', 'b' => 'b', 'ter' => 't', 't' => 't', 'quater' => 'q', 'q' => 'q'][$m[2]] ?? substr($m[2], 0, 1);
    return $m[1] . $rep;
}

/** « 3 bis rue de la Seine » → ['3 bis', 'rue de la Seine'] (même découpage que l'écran). */
function addr_split(string $a): array
{
    $a = trim($a);
    if (preg_match('/^(\d+\s*(?:bis|ter|quater|[a-d])?)(?:\s*,\s*|\s+)(.+)$/iu', $a, $m)) { return [trim($m[1]), trim($m[2])]; }
    if (preg_match('/^(\d+\s*(?:bis|ter|quater|[a-d])?)$/iu', $a, $m)) { return [trim($m[1]), '']; }
    return ['', $a];
}

/** Département d'un code INSEE (Corse 2A/2B, outre-mer 971…). */
function addr_dept(string $insee): string
{
    $insee = strtoupper(trim($insee));
    if (preg_match('/^97\d/', $insee)) { return substr($insee, 0, 3); }
    return substr($insee, 0, 2);
}

function addr_ban_dir(): string
{
    $d = SHARED_DATA_DIR . '/ban'; // commun à toutes les généalogies
    if (!is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}

/** Commune : nom et centre (contours des communes, sinon lieux de la base). */
function addr_commune(PDO $pdo, string $insee): array
{
    $name = ''; $lat = null; $lon = null;
    try { $s = $pdo->prepare('SELECT name, centroid_lat, centroid_lon FROM commune_contours WHERE insee_code=?'); $s->execute([$insee]); if ($r = $s->fetch()) { $name = (string) $r['name']; $lat = $r['centroid_lat'] !== null ? (float) $r['centroid_lat'] : null; $lon = $r['centroid_lon'] !== null ? (float) $r['centroid_lon'] : null; } } catch (Throwable $_) {}
    $s = $pdo->prepare("SELECT name, latitude, longitude FROM places WHERE admin4_code=? ORDER BY (latitude IS NULL), id LIMIT 1"); $s->execute([$insee]);
    if ($r = $s->fetch()) { $name = $name ?: (string) $r['name']; if ($lat === null && $r['latitude'] !== null && $r['latitude'] !== '') { $lat = (float) $r['latitude']; $lon = (float) $r['longitude']; } }
    if ($lat === null) { $s = $pdo->prepare('SELECT AVG(lat), AVG(lon) FROM ban_addresses WHERE insee=?'); $s->execute([$insee]); [$a, $b] = $s->fetch(PDO::FETCH_NUM) ?: [null, null]; if ($a !== null) { $lat = (float) $a; $lon = (float) $b; } }
    return ['insee' => $insee, 'name' => $name, 'lat' => $lat, 'lon' => $lon];
}

/** Code INSEE d'un dépouillement (lieu de la base, sinon nom de la commune dans les contours). */
function addr_digest_insee(PDO $pdo, int $digestId): string
{
    $s = $pdo->prepare('SELECT a.city_name, a.department, p.admin4_code FROM archive_digest_entries a LEFT JOIN places p ON p.id=a.place_id WHERE a.id=?'); $s->execute([$digestId]);
    $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Dépouillement introuvable.'); }
    if (trim((string) $r['admin4_code']) !== '') { return trim((string) $r['admin4_code']); }
    try {
        $c = $pdo->prepare('SELECT insee_code FROM commune_contours WHERE lower(name)=lower(?) ORDER BY insee_code'); $c->execute([trim((string) $r['city_name'])]);
        $codes = $c->fetchAll(PDO::FETCH_COLUMN);
        $dept = preg_replace('/\D/', '', (string) $r['department']);
        foreach ($codes as $code) { if ($dept === '' || str_starts_with((string) $code, substr($dept, 0, 2))) { return (string) $code; } }
    } catch (Throwable $_) {}
    return '';
}

/** Les dépouillements de la commune (lieu avec ce code INSEE, ou même nom de commune). */
function addr_commune_digests(PDO $pdo, string $insee, string $name): array
{
    // sans code INSEE : même nom de commune ET même département (numéro « 77 », nom « Seine-et-Marne », ou non précisé)
    $dept = addr_dept($insee);
    $c = $pdo->prepare("SELECT county FROM places WHERE admin4_code=? AND COALESCE(county,'')<>'' LIMIT 1"); $c->execute([$insee]);
    $county = addr_street_key((string) $c->fetchColumn());
    $s = $pdo->prepare("SELECT a.id, a.year_text, a.record_type, a.archive_reference, a.department, p.admin4_code FROM archive_digest_entries a LEFT JOIN places p ON p.id=a.place_id
        WHERE p.admin4_code=? OR (COALESCE(p.admin4_code,'')='' AND ? <> '' AND (lower(a.city_name)=lower(?) OR lower(COALESCE(p.name,''))=lower(?))) ORDER BY a.year_text, a.id");
    $s->execute([$insee, $name, $name, $name]);
    $rows = array_filter($s->fetchAll(), static function ($r) use ($insee, $dept, $county) {
        if ((string) $r['admin4_code'] === $insee) { return true; }
        $d = trim((string) $r['department']);
        if ($d === '') { return true; }
        if (preg_match('/\b(\d{2,3}|2A|2B)\b/i', $d, $m)) { return strtoupper($m[1]) === $dept || str_starts_with(strtoupper($m[1]), $dept); }
        return $county === '' || addr_street_key($d) === $county;
    });
    return array_values(array_map(static fn($r) => ['id' => (int) $r['id'], 'year' => preg_match('/(1[5-9]\d\d|20\d\d)/', (string) $r['year_text'], $m) ? (int) $m[1] : 0, 'year_text' => (string) $r['year_text'], 'record_type' => (string) $r['record_type'], 'reference' => (string) $r['archive_reference']], $rows));
}

/** Toutes les adresses relevées dans la commune : une par (rue, numéro), avec les foyers de chaque année. */
function addr_collect(PDO $pdo, string $insee, array $digests): array
{
    if (!$digests) { return []; }
    $byId = []; foreach ($digests as $d) { $byId[$d['id']] = $d; }
    $in = implode(',', array_keys($byId));
    $rows = $pdo->query("SELECT id, archive_digest_id, first_name, last_name, age_text, household_position, occupation, household_key, page_number, address, person_id FROM archive_digest_people WHERE archive_digest_id IN ($in) AND trim(COALESCE(address,''))<>'' ORDER BY archive_digest_id, id")->fetchAll();
    $alias = addr_aliases($pdo, $insee);
    $out = [];
    foreach ($rows as $r) {
        [$house, $street] = addr_split((string) $r['address']);
        $skey = addr_street_key($street); $hkey = addr_house_key($house);
        if ($skey === '' && $hkey === '') { continue; }
        $k = $skey . '|' . $hkey;
        if (!isset($out[$k])) { $out[$k] = ['key' => $k, 'street_key' => $skey, 'house_key' => $hkey, 'street' => $street, 'house' => $house, 'street_status' => $alias[$skey]['status'] ?? '', 'current_name' => $alias[$skey]['current_name'] ?? '', 'years' => []]; }
        $d = $byId[(int) $r['archive_digest_id']];
        $y = (string) ($d['year'] ?: $d['year_text']);
        $hh = (string) $r['household_key'];
        $out[$k]['years'][$y][$d['id'] . '#' . $r['page_number'] . '#' . $hh]['people'][] = ['name' => trim($r['first_name'] . ' ' . $r['last_name']), 'role' => (string) $r['household_position'], 'age' => (string) $r['age_text'], 'job' => (string) $r['occupation'], 'person_id' => $r['person_id'] !== null ? (int) $r['person_id'] : null];
        $out[$k]['years'][$y][$d['id'] . '#' . $r['page_number'] . '#' . $hh] += ['digest_id' => $d['id'], 'page' => (string) $r['page_number'], 'household' => $hh];
    }
    foreach ($out as &$a) { foreach ($a['years'] as &$hhs) { $hhs = array_values($hhs); } unset($hhs); }
    unset($a);
    return array_values($out);
}

/** Anciens noms de rues de la commune, par clé : status 'renamed' (→ current_name), 'gone' (disparue), 'same'. */
function addr_aliases(PDO $pdo, string $insee): array
{
    $s = $pdo->prepare('SELECT * FROM addr_streets WHERE insee=?'); $s->execute([$insee]);
    $out = [];
    foreach ($s->fetchAll() as $r) { $out[(string) $r['old_key']] = ['id' => (int) $r['id'], 'old_name' => (string) $r['old_name'], 'current_name' => (string) $r['current_name'], 'status' => (string) $r['status'], 'voie_id' => (string) $r['voie_id'], 'path' => json_decode((string) $r['path_json'], true) ?: [], 'note' => (string) $r['note'], 'year_from' => (string) $r['year_from'], 'year_to' => (string) $r['year_to']]; }
    return $out;
}

/** Données de la carte : commune, années, adresses (avec leur point), rues anciennes, état de la BAN locale. */
function addr_map_data(PDO $pdo, array $q): array
{
    $insee = strtoupper(safe_text((string) ($q['insee'] ?? '')));
    $digestId = safe_int($q['digest_id'] ?? 0);
    if ($insee === '' && $digestId) { $insee = addr_digest_insee($pdo, $digestId); }
    if ($insee === '') { return ['insee' => '', 'error' => 'Commune inconnue : choisis la commune du dépouillement (avec son code INSEE) dans Recherche.']; }
    $commune = addr_commune($pdo, $insee);
    $digests = addr_commune_digests($pdo, $insee, $commune['name']);
    if ($digestId && !array_filter($digests, static fn($d) => $d['id'] === $digestId)) {
        $s = $pdo->prepare('SELECT id, year_text, record_type, archive_reference FROM archive_digest_entries WHERE id=?'); $s->execute([$digestId]);
        if ($r = $s->fetch()) { $digests[] = ['id' => (int) $r['id'], 'year' => preg_match('/(1[5-9]\d\d|20\d\d)/', (string) $r['year_text'], $m) ? (int) $m[1] : 0, 'year_text' => (string) $r['year_text'], 'record_type' => (string) $r['record_type'], 'reference' => (string) $r['archive_reference']]; }
    }
    $addresses = addr_collect($pdo, $insee, $digests);
    $pts = $pdo->prepare('SELECT * FROM addr_points WHERE insee=?'); $pts->execute([$insee]);
    $points = []; foreach ($pts->fetchAll() as $p) { $points[$p['street_key'] . '|' . $p['house_key']] = ['lat' => (float) $p['lat'], 'lon' => (float) $p['lon'], 'source' => (string) $p['source'], 'precision' => (string) $p['precision'], 'note' => (string) $p['note']]; }
    foreach ($addresses as &$a) { $a['point'] = $points[$a['key']] ?? null; }
    unset($a);
    $ban = $pdo->prepare('SELECT COUNT(*) FROM ban_addresses WHERE insee=?'); $ban->execute([$insee]);
    $imp = $pdo->prepare('SELECT * FROM ban_imports WHERE insee=?'); $imp->execute([$insee]);
    $dept = addr_dept($insee);
    $file = addr_ban_dir() . '/adresses-' . $dept . '.csv.gz';
    $years = array_values(array_unique(array_filter(array_map(static fn($d) => $d['year'], $digests))));
    sort($years);
    return ['insee' => $insee, 'commune' => $commune, 'digests' => $digests, 'years' => $years, 'addresses' => $addresses, 'streets' => array_values(addr_aliases($pdo, $insee)),
        'ban' => ['count' => (int) $ban->fetchColumn(), 'import' => $imp->fetch() ?: null, 'dept' => $dept, 'file' => is_file($file) ? ['size' => filesize($file), 'date' => date('c', (int) filemtime($file))] : null, 'url' => sprintf(ADDR_BAN_URL, $dept)],
        'current_streets' => addr_ban_streets($pdo, $insee)];
}

/** Rues d'aujourd'hui de la commune (BAN locale) : pour choisir le nom actuel d'une ancienne rue. */
function addr_ban_streets(PDO $pdo, string $insee): array
{
    $s = $pdo->prepare('SELECT street, voie_id, COUNT(*) AS n, AVG(lat) AS lat, AVG(lon) AS lon FROM ban_addresses WHERE insee=? GROUP BY street_key ORDER BY street COLLATE NOCASE'); $s->execute([$insee]);
    return array_map(static fn($r) => ['name' => (string) $r['street'], 'voie_id' => (string) $r['voie_id'], 'n' => (int) $r['n'], 'lat' => (float) $r['lat'], 'lon' => (float) $r['lon']], $s->fetchAll());
}

/** Télécharge le fichier BAN du département (une fois ; ~5 à 60 Mo selon le département). */
function addr_ban_download(PDO $pdo, array $data): array
{
    $dept = strtoupper(preg_replace('/[^0-9AB]/i', '', (string) ($data['dept'] ?? '')) ?? '');
    if (!preg_match('/^(\d{2}|2A|2B|97\d)$/', $dept)) { throw new RuntimeException('Département inconnu.'); }
    if (!function_exists('curl_init')) { throw new RuntimeException('Téléchargement impossible : PHP n’a pas l’extension curl.'); }
    @set_time_limit(0);
    $final = addr_ban_dir() . '/adresses-' . $dept . '.csv.gz';
    $tmp = $final . '.part';
    $fh = fopen($tmp, 'wb');
    $ch = curl_init(sprintf(ADDR_BAN_URL, $dept));
    curl_setopt_array($ch, [CURLOPT_FILE => $fh, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 1800,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'LCNDA (logiciel de genealogie)', CURLOPT_FAILONERROR => true] + (function_exists('lcnda_curl_tls') ? lcnda_curl_tls() : []));
    $ok = curl_exec($ch); $err = curl_error($ch); unset($ch); fclose($fh);
    if (!$ok || filesize($tmp) < 1000) { @unlink($tmp); throw new RuntimeException('Téléchargement interrompu' . ($err !== '' ? ' (' . $err . ')' : '') . '. Vérifie la connexion à Internet.'); }
    rename($tmp, $final);
    $out = ['dept' => $dept, 'size' => filesize($final)];
    if (!empty($data['insee'])) { $out += addr_ban_import($pdo, ['insee' => $data['insee']]); }
    return $out;
}

/**
 * Lit le fichier BAN du département (ou un fichier donné) et garde les adresses de la commune (ban_addresses).
 * Colonnes du fichier : id;id_fantoir;numero;rep;nom_voie;code_postal;code_insee;nom_commune;…;lon;lat;… (séparateur « ; »).
 */
function addr_ban_import(PDO $pdo, array $data, ?string $path = null): array
{
    $insee = strtoupper(safe_text((string) ($data['insee'] ?? '')));
    if ($insee === '') { throw new RuntimeException('Commune inconnue.'); }
    $path ??= addr_ban_dir() . '/adresses-' . addr_dept($insee) . '.csv.gz';
    if (!is_file($path)) { throw new RuntimeException('Le fichier des adresses du département n’est pas encore téléchargé.'); }
    @set_time_limit(0);
    $fh = gzopen($path, 'rb');
    if (!$fh) { throw new RuntimeException('Fichier des adresses illisible.'); }
    $head = str_getcsv(rtrim((string) gzgets($fh), "\r\n"), ';', '"', '');
    $col = array_flip(array_map(static fn($h) => trim((string) $h, "\xEF\xBB\xBF \""), $head));
    foreach (['numero', 'nom_voie', 'code_insee', 'lon', 'lat'] as $need) { if (!isset($col[$need])) { gzclose($fh); throw new RuntimeException('Ce fichier n’est pas un fichier d’adresses de la BAN (colonne « ' . $need . ' » absente).'); } }
    $own = !$pdo->inTransaction();
    if ($own) { $pdo->beginTransaction(); }
    try {
        $pdo->prepare('DELETE FROM ban_addresses WHERE insee=?')->execute([$insee]);
        $ins = $pdo->prepare('INSERT INTO ban_addresses(insee, street, street_key, house_key, number, lat, lon, ban_id, voie_id) VALUES(?,?,?,?,?,?,?,?,?)');
        $n = 0; $needle = ';' . $insee . ';';
        while (($line = gzgets($fh)) !== false) {
            if (!str_contains($line, $needle)) { continue; } // tri rapide avant de découper la ligne
            $c = str_getcsv(rtrim($line, "\r\n"), ';', '"', '');
            if (strtoupper((string) ($c[$col['code_insee']] ?? '')) !== $insee) { continue; }
            $num = trim((string) ($c[$col['numero']] ?? '')); $rep = isset($col['rep']) ? trim((string) ($c[$col['rep']] ?? '')) : '';
            $street = trim((string) ($c[$col['nom_voie']] ?? ''));
            $lat = (float) ($c[$col['lat']] ?? 0); $lon = (float) ($c[$col['lon']] ?? 0);
            if ($street === '' || !$lat || !$lon) { continue; }
            $number = trim($num === '0' || $num === '99999' ? '' : $num . ($rep !== '' ? ' ' . $rep : ''));
            $ins->execute([$insee, $street, addr_street_key($street), addr_house_key($number), $number, $lat, $lon, (string) ($c[$col['id']] ?? ''), isset($col['id_fantoir']) ? (string) ($c[$col['id_fantoir']] ?? '') : '']);
            $n++;
        }
        gzclose($fh);
        $pdo->prepare('INSERT INTO ban_imports(insee, dept, count, imported_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(insee) DO UPDATE SET dept=excluded.dept, count=excluded.count, imported_at=CURRENT_TIMESTAMP')->execute([$insee, addr_dept($insee), $n]);
        if ($own) { $pdo->commit(); }
    } catch (Throwable $e) { if ($own) { $pdo->rollBack(); } throw $e; }
    if (!$n) { return ['imported' => 0, 'warning' => 'Aucune adresse de cette commune dans le fichier (code INSEE ' . $insee . ').']; }
    return ['imported' => $n] + addr_auto_place($pdo, ['insee' => $insee]);
}

/** Petite distance d'édition pour les noms de rues proches (« rue Seine » / « rue Senne »). */
function addr_close(string $a, string $b): bool
{
    if ($a === '' || $b === '') { return false; }
    if ($a === $b) { return true; }
    if (str_contains($a, $b) || str_contains($b, $a)) { return min(strlen($a), strlen($b)) >= 6; }
    return levenshtein($a, $b) <= max(1, intdiv(min(strlen($a), strlen($b)), 6));
}

/**
 * Placement automatique, en local, avec la BAN de la commune : même rue (ou son nom actuel) et même numéro → 'exact' ;
 * numéro absent aujourd'hui → le numéro le plus proche de la même rue ('approx') ; sans numéro → le milieu de la rue ('street') ;
 * nom proche → 'fuzzy'. Rien n'écrase un point posé à la main. Les rues marquées « disparues » restent à placer.
 */
function addr_auto_place(PDO $pdo, array $data): array
{
    $insee = strtoupper(safe_text((string) ($data['insee'] ?? '')));
    $force = !empty($data['force']);
    $commune = addr_commune($pdo, $insee);
    $addresses = addr_collect($pdo, $insee, addr_commune_digests($pdo, $insee, $commune['name']));
    $s = $pdo->prepare('SELECT street_key, street, house_key, number, lat, lon FROM ban_addresses WHERE insee=?'); $s->execute([$insee]);
    $ban = []; foreach ($s->fetchAll() as $r) { $ban[$r['street_key']][] = $r; }
    if (!$ban) { return ['placed' => 0, 'left' => count($addresses), 'ban' => 0]; }
    $alias = addr_aliases($pdo, $insee);
    $have = []; $p = $pdo->prepare('SELECT street_key, house_key, source FROM addr_points WHERE insee=?'); $p->execute([$insee]);
    foreach ($p->fetchAll() as $r) { $have[$r['street_key'] . '|' . $r['house_key']] = $r['source']; }
    $put = $pdo->prepare("INSERT INTO addr_points(insee, street_key, house_key, street, house, lat, lon, source, precision, updated_at) VALUES(?,?,?,?,?,?,?,'ban',?,CURRENT_TIMESTAMP)
        ON CONFLICT(insee, street_key, house_key) DO UPDATE SET lat=excluded.lat, lon=excluded.lon, source='ban', precision=excluded.precision, street=excluded.street, house=excluded.house, updated_at=CURRENT_TIMESTAMP");
    $placed = 0; $left = 0;
    foreach ($addresses as $a) {
        $src = $have[$a['key']] ?? null;
        if ($src === 'manual' || ($src && !$force)) { continue; }
        $al = $alias[$a['street_key']] ?? null;
        if ($al && $al['status'] === 'gone') { $left++; continue; }
        $target = $al && $al['status'] === 'renamed' && $al['current_name'] !== '' ? addr_street_key($al['current_name']) : $a['street_key'];
        $prec = 'exact'; $rows = $ban[$target] ?? null;
        if (!$rows) { foreach ($ban as $k => $list) { if (addr_close($target, (string) $k)) { $rows = $list; $prec = 'fuzzy'; break; } } }
        if (!$rows) { $left++; continue; }
        $hit = null;
        if ($a['house_key'] !== '') {
            foreach ($rows as $r) { if ($r['house_key'] === $a['house_key']) { $hit = $r; break; } }
            if (!$hit) { // même numéro sans « bis », sinon le plus proche du même côté de la rue (pair / impair)
                $n = (int) $a['house_key'];
                $best = null; $bd = PHP_INT_MAX;
                foreach ($rows as $r) { $rn = (int) $r['house_key']; if (!$rn) { continue; } $d = abs($rn - $n) + (($rn % 2) !== ($n % 2) ? 1000 : 0); if ($d < $bd) { $bd = $d; $best = $r; } }
                if ($best) { $hit = $best; if ($prec !== 'fuzzy') { $prec = 'approx'; } }
            }
        }
        if (!$hit) { $lat = array_sum(array_map(static fn($r) => (float) $r['lat'], $rows)) / count($rows); $lon = array_sum(array_map(static fn($r) => (float) $r['lon'], $rows)) / count($rows); $hit = ['lat' => $lat, 'lon' => $lon]; $prec = $prec === 'fuzzy' ? 'fuzzy' : 'street'; }
        $put->execute([$insee, $a['street_key'], $a['house_key'], $a['street'], $a['house'], (float) $hit['lat'], (float) $hit['lon'], $prec]);
        $placed++;
    }
    return ['placed' => $placed, 'left' => $left, 'ban' => array_sum(array_map('count', $ban))];
}

/** Point posé (ou déplacé) à la main ; lat vide = retirer le point. */
function save_addr_point(PDO $pdo, array $data): array
{
    $insee = strtoupper(safe_text((string) ($data['insee'] ?? '')));
    $street = mb_substr(safe_text((string) ($data['street'] ?? '')), 0, 200); $house = mb_substr(safe_text((string) ($data['house'] ?? '')), 0, 20);
    $sk = (string) ($data['street_key'] ?? addr_street_key($street)); $hk = (string) ($data['house_key'] ?? addr_house_key($house));
    if ($insee === '' || ($sk === '' && $hk === '')) { throw new RuntimeException('Adresse inconnue.'); }
    if (!isset($data['lat']) || $data['lat'] === '' || $data['lat'] === null) {
        $pdo->prepare('DELETE FROM addr_points WHERE insee=? AND street_key=? AND house_key=?')->execute([$insee, $sk, $hk]);
        return ['deleted' => true];
    }
    $lat = (float) $data['lat']; $lon = (float) $data['lon'];
    if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) { throw new RuntimeException('Position impossible.'); }
    $src = ($data['source'] ?? '') === 'online' ? 'online' : 'manual';
    $pdo->prepare("INSERT INTO addr_points(insee, street_key, house_key, street, house, lat, lon, source, precision, note, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(insee, street_key, house_key) DO UPDATE SET lat=excluded.lat, lon=excluded.lon, source=excluded.source, precision=excluded.precision, note=excluded.note, street=excluded.street, house=excluded.house, updated_at=CURRENT_TIMESTAMP")
        ->execute([$insee, $sk, $hk, $street, $house, $lat, $lon, $src, $src === 'online' ? mb_substr(safe_text((string) ($data['precision'] ?? 'exact')), 0, 20) : 'manual', mb_substr(safe_text((string) ($data['note'] ?? '')), 0, 500)]);
    return ['ok' => true];
}

/** Ancien nom de rue : renommée (→ nom actuel), disparue (tracé à la main), ou inchangée ; delete pour l'oublier. */
function save_addr_street(PDO $pdo, array $data): array
{
    $insee = strtoupper(safe_text((string) ($data['insee'] ?? '')));
    $old = mb_substr(safe_text((string) ($data['old_name'] ?? '')), 0, 200);
    $key = addr_street_key($old);
    if ($insee === '' || $key === '') { throw new RuntimeException('Indique l’ancien nom de la rue.'); }
    if (!empty($data['delete'])) {
        $pdo->prepare('DELETE FROM addr_streets WHERE insee=? AND old_key=?')->execute([$insee, $key]);
        $pdo->prepare("DELETE FROM addr_points WHERE insee=? AND street_key=? AND source='ban'")->execute([$insee, $key]); // placés grâce à ce nom : recalculés
        return ['deleted' => true] + addr_auto_place($pdo, ['insee' => $insee]);
    }
    $status = in_array($data['status'] ?? '', ['renamed', 'gone', 'same'], true) ? $data['status'] : 'renamed';
    $path = [];
    foreach (array_slice(is_array($data['path'] ?? null) ? $data['path'] : [], 0, 500) as $pt) { if (is_array($pt) && isset($pt[0], $pt[1]) && is_numeric($pt[0]) && is_numeric($pt[1])) { $path[] = [round((float) $pt[0], 7), round((float) $pt[1], 7)]; } }
    $pdo->prepare("INSERT INTO addr_streets(insee, old_name, old_key, current_name, status, voie_id, path_json, note, year_from, year_to, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(insee, old_key) DO UPDATE SET old_name=excluded.old_name, current_name=excluded.current_name, status=excluded.status, voie_id=excluded.voie_id, path_json=excluded.path_json, note=excluded.note, year_from=excluded.year_from, year_to=excluded.year_to, updated_at=CURRENT_TIMESTAMP")
        ->execute([$insee, $old, $key, mb_substr(safe_text((string) ($data['current_name'] ?? '')), 0, 200), $status, mb_substr(safe_text((string) ($data['voie_id'] ?? '')), 0, 40), json_encode($path), mb_substr(safe_text((string) ($data['note'] ?? '')), 0, 2000),
            mb_substr(safe_text((string) ($data['year_from'] ?? '')), 0, 20), mb_substr(safe_text((string) ($data['year_to'] ?? '')), 0, 20)]);
    // le nom actuel change : les points placés automatiquement de cette rue sont recalculés
    $pdo->prepare("DELETE FROM addr_points WHERE insee=? AND street_key=? AND source='ban'")->execute([$insee, $key]);
    return ['ok' => true] + addr_auto_place($pdo, ['insee' => $insee]);
}
