<?php
declare(strict_types=1);

/**
 * LCNDA — 🧬 Arbre des métiers et 🗺 Carte de la vie d'une personne : les données (lecture seule, tout est borné).
 * Écrans : assets/js/heritage-metiers-arbre.js (Graphiques → « 🧬 Arbre des métiers ») et assets/js/heritage-carte-vie.js
 * (fenêtre « 🗺 Carte de la vie »), noyau commun pour le navigateur et Node : assets/js/app-metiers-carte-core.js.
 *
 * GET api.php?action=metiers_arbre&ids=1,2,3 (au plus 1500)
 *   → {jobs: {id: [{text, key, name, domain, sector, year}]}, hidden: [ids], sectors: [[clé, icône, nom, couleur]], base: {…}}
 *   Le classement réutilise le dictionnaire des métiers anciens (lib/metiers_anciens.php : trade_match, ses 18 domaines),
 *   rangés en grands secteurs ; un métier qu'il ne connaît pas passe par quelques mots simples (ouvrier, employé…).
 *   base = la transmission dans toute la base (père → fils, mère → fille) par siècle de naissance de l'enfant.
 * GET api.php?action=carte_vie&person=id[&family=1][&share=1]
 *   → les étapes de la « Carte qui raconte » (lib/diagram_cartes2.php, what=story) + recensements, voyages, placements,
 *     faits militaires (poilu_events) et, avec family=1, la naissance et le décès du conjoint, la naissance, le mariage et
 *     le décès des enfants (pendant sa vie). share=1 (vidéo à partager) : jamais un vivant ni une fiche confidentielle.
 */

require_once __DIR__ . '/metiers_anciens.php';

/** les grands secteurs : [clé, icône, nom, couleur] (couleurs lisibles sur fond clair comme sombre) */
const METIERS_SECTORS = [
    ['agri', '🌾', 'Agriculture et forêt', '#4d8a2f'],
    ['arti', '🔨', 'Artisanat', '#c2611a'],
    ['indu', '🏭', 'Industrie, mines', '#5b6573'],
    ['comm', '🛒', 'Commerce', '#c99a06'],
    ['tran', '🚂', 'Transports et mer', '#0e7f99'],
    ['serv', '🏠', 'Services, domestiques', '#9b5fc0'],
    ['armee', '🎖', 'Armée et police', '#b42318'],
    ['clerge', '⛪', 'Clergé', '#6941c6'],
    ['lib', '⚖️', 'Professions libérales, école, administration', '#2563c9'],
    ['rang', '🏰', 'Rentiers, rangs et statuts', '#8a6a2f'],
    ['foyer', '🧺', 'Au foyer, sans profession', '#8c8c8c'],
    ['autre', '❔', 'Autre métier', '#a3a3a3'],
];
/** les 18 domaines du dictionnaire → les grands secteurs */
const METIERS_DOMAIN_SECTOR = ['T' => 'agri', 'F' => 'agri', 'M' => 'arti', 'X' => 'arti', 'C' => 'arti', 'B' => 'arti', 'A' => 'arti', 'L' => 'arti',
    'P' => 'indu', 'V' => 'comm', 'R' => 'tran', 'E' => 'tran', 'S' => 'serv', 'Q' => 'armee', 'G' => 'clerge', 'J' => 'lib', 'H' => 'lib', 'N' => 'rang'];
/** pour les métiers que le dictionnaire ne connaît pas (souvent récents) : quelques mots, dans cet ordre */
const METIERS_WORDS = [
    ['foyer', '/\b(menagere|sans profession|sans etat|retraite|retraitee|au foyer|mere au foyer|femme au foyer|chomeur|etudiant|etudiante|eleve|ecolier|ecoliere)\b/'],
    ['armee', '/\b(soldat|militaire|gendarme|policier|officier|sergent|caporal|adjudant|capitaine|lieutenant|colonel|commandant|general|marechal des logis|douanier|garde mobile)\b/'],
    ['clerge', '/\b(pretre|cure|abbe|vicaire|religieu(x|se)|soeur|frere convers|moine|pasteur|rabbin|chanoine|eveque)\b/'],
    ['agri', '/\b(agricult|cultivat|exploitant agricole|ferm|eleveu|viticult|vigneron|maraich|horticult|paysan|berger|bucheron|forestier|jardinier)/'],
    ['indu', '/\b(ouvri|usine|manoeuvre|mineur|metallurg|sidérurg|siderurg|fondeur|filat|tisseu|ajusteur|tourneur|fraiseur|soudeur|chaudronnier|electricien|mecanicien|technicien|ingenieur)/'],
    ['tran', '/\b(cheminot|chauffeur|conducteur|camionneur|routier|marin|matelot|pilote|aviateur|postier|facteur|livreur|transporteur|docker|batelier)/'],
    ['comm', '/\b(commer|vendeu|negoci|marchand|epicier|boutiqu|representant|caissier|libraire|antiquaire|brocanteur|courtier|banquier|agent immobilier)/'],
    ['lib', '/\b(instit|profess|enseignant|medecin|docteur|avocat|notaire|huissier|pharmac|infirmi|dentiste|veterinaire|architecte|juge|magistrat|fonctionnaire|secretaire|comptable|employe|redacteur|journaliste|chercheur|directeur|cadre|administrat|maire|depute|senateur)/'],
    ['serv', '/\b(domestique|servante|bonne|cuisini|femme de chambre|valet|concierge|gardien|coiffeu|blanchiss|lingere|nourrice|aide soignant|menage)/'],
    ['arti', '/\b(artisan|menuisier|charpentier|macon|plombier|peintre|boulanger|boucher|patissier|cordonnier|couturi|tailleur|forgeron|serrurier|ebeniste|tapissier|horloger|bijoutier|potier)/'],
];

function metiers_sector_info(): array
{
    $o = [];
    foreach (METIERS_SECTORS as $s) { $o[$s[0]] = $s; }
    return $o;
}

/** un métier tel qu'il est écrit → [clé du dictionnaire ou « perso-… », nom, domaine, secteur] */
function metiers_classify(string $text): array
{
    static $memo = [];
    $text = trim(mb_substr($text, 0, 160));
    if ($text === '') { return ['', '', '', 'autre']; }
    if (isset($memo[$text])) { return $memo[$text]; }
    $f = trade_fold($text);
    $key = trade_match($text);
    $D = trades_dict();
    if ($key && isset($D['by'][$key])) {
        $t = $D['by'][$key];
        $dom = (string) ($t['domain'] ?? '');
        $sector = METIERS_DOMAIN_SECTOR[$dom] ?? 'autre';
        // « propriétaire », « rentier » : un statut ; « sans profession » n'est pas un métier
        if (preg_match(METIERS_WORDS[0][1], $f)) { $sector = 'foyer'; }
        $r = [$key, (string) $t['name'], $dom, $sector];
    } else {
        $sector = 'autre';
        foreach (METIERS_WORDS as [$s, $re]) { if (preg_match($re, $f)) { $sector = $s; break; } }
        $r = [trade_key_for($text), mb_strtoupper(mb_substr($text, 0, 1)) . mb_substr($text, 1, 79), '', $sector];
    }
    if (count($memo) > 5000) { $memo = []; }
    return $memo[$text] = $r;
}

/** les métiers notés pour ces personnes (fiche, événements « Profession », recensements) : [id → [{text, key, name, domain, sector, year}]] */
function metiers_jobs_of(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($v) => $v > 0)));
    $raw = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $in = implode(',', $chunk);
        $rows = $pdo->query("
            SELECT p.id AS pid, p.occupation AS val, NULL AS year, 0 AS src FROM persons p WHERE p.id IN ($in) AND p.occupation IS NOT NULL AND TRIM(p.occupation)!=''
            UNION ALL
            SELECT e.person_id, COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')), e.year, 1 FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.person_id IN ($in) AND (t.gedcom_tag='OCCU' OR LOWER(t.label) LIKE '%profes%' OR LOWER(t.label) LIKE '%m%tier%' OR LOWER(t.label) LIKE '%activit%')
              AND COALESCE(NULLIF(TRIM(e.title),''), NULLIF(TRIM(e.description),'')) IS NOT NULL
            UNION ALL
            SELECT cm.person_id, cm.occupation, cr.year, 2 FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id
            WHERE cm.person_id IN ($in) AND cm.occupation IS NOT NULL AND TRIM(cm.occupation)!=''")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $r) { $raw[(int) $r['pid']][] = $r; }
    }
    $out = [];
    foreach ($raw as $pid => $rows) {
        $by = [];
        foreach ($rows as $r) {
            // « laboureur et vigneron », « tisserand / cabaretier » : deux métiers
            foreach (preg_split('/\s*(?:,|;|\/|\bet\b|\bpuis\b)\s*/u', trim((string) $r['val'])) ?: [] as $part) {
                $part = trim($part, " \t.-");
                if (mb_strlen($part) < 3) { continue; }
                [$key, $name, $dom, $sector] = metiers_classify($part);
                if ($key === '') { continue; }
                $y = $r['year'] !== null ? (int) $r['year'] : null;
                if (!isset($by[$key])) { $by[$key] = ['text' => mb_substr($part, 0, 80), 'key' => $key, 'name' => $name, 'domain' => $dom, 'sector' => $sector, 'year' => $y, 'n' => 0]; }
                elseif ($y !== null && ($by[$key]['year'] === null || $y < $by[$key]['year'])) { $by[$key]['year'] = $y; }
                $by[$key]['n']++;
            }
        }
        // le plus souvent noté d'abord, puis le plus ancien
        uasort($by, static fn($a, $b) => $b['n'] <=> $a['n'] ?: (($a['year'] ?? 9999) <=> ($b['year'] ?? 9999)));
        $out[$pid] = array_slice(array_values(array_map(static function ($j) { unset($j['n']); return $j; }, $by)), 0, 6);
    }
    return $out;
}

/** la transmission dans toute la base : père → fils et mère → fille, par siècle de naissance de l'enfant */
function metiers_transmission_base(PDO $pdo): array
{
    $pairs = $pdo->query("SELECT fc.child_id, f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id LIMIT 60000")->fetchAll(PDO::FETCH_ASSOC);
    $ids = [];
    foreach ($pairs as $r) { foreach (['child_id', 'partner1_id', 'partner2_id'] as $k) { if ((int) $r[$k]) { $ids[(int) $r[$k]] = true; } } }
    $info = [];
    foreach (array_chunk(array_keys($ids), 500) as $chunk) {
        $in = implode(',', $chunk);
        foreach ($pdo->query("SELECT p.id, p.gender, (SELECT MIN(e.year) FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('BIRT','CHR','BAPM')) AS by FROM persons p WHERE p.id IN ($in)") as $p) {
            $info[(int) $p['id']] = [(string) $p['gender'], $p['by'] !== null ? (int) $p['by'] : null];
        }
    }
    $jobs = metiers_jobs_of($pdo, array_keys($ids));
    $keys = static fn(int $id) => array_column($jobs[$id] ?? [], 'key');
    $out = ['male' => ['same' => 0, 'pairs' => 0, 'by' => []], 'female' => ['same' => 0, 'pairs' => 0, 'by' => []]];
    $seen = [];
    foreach ($pairs as $r) {
        $c = (int) $r['child_id'];
        foreach ([(int) $r['partner1_id'], (int) $r['partner2_id']] as $par) {
            if (!$par || isset($seen["$par|$c"])) { continue; }
            $seen["$par|$c"] = true;
            $g = $info[$c][0] ?? ''; $gp = $info[$par][0] ?? '';
            if (!in_array($g, ['male', 'female'], true) || $g !== $gp) { continue; } // père → fils, mère → fille
            $kc = $keys($c); $kp = $keys($par);
            if (!$kc || !$kp) { continue; }
            $same = (bool) array_intersect($kc, $kp);
            $y = $info[$c][1] ?? null;
            $cent = $y === null ? 0 : intdiv($y, 100) + 1;
            $o = &$out[$g];
            $o['pairs']++; if ($same) { $o['same']++; }
            $o['by'][$cent] ??= [0, 0]; $o['by'][$cent][1]++; if ($same) { $o['by'][$cent][0]++; }
            unset($o);
        }
    }
    foreach ($out as &$o) { ksort($o['by']); $o['by'] = array_map(static fn($c, $v) => ['century' => $c, 'same' => $v[0], 'pairs' => $v[1]], array_keys($o['by']), array_values($o['by'])); }
    unset($o);
    return $out;
}

function metiers_hidden(PDO $pdo): array
{
    require_once __DIR__ . '/cartes_outils.php';
    try { return cartes_outils_hidden($pdo); } catch (Throwable) { return []; }
}

/** GET metiers_arbre */
function metiers_arbre_data(PDO $pdo, array $get): array
{
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', is_string($get['ids'] ?? null) ? mb_substr($get['ids'], 0, 20000) : '')), static fn($v) => $v > 0))), 0, 1500);
    $hidden = metiers_hidden($pdo);
    $out = ['jobs' => (object) metiers_jobs_of($pdo, $ids), 'hidden' => array_values(array_filter($ids, static fn($i) => isset($hidden[$i]))),
        'sectors' => METIERS_SECTORS, 'domains' => trades_dict()['doc']['domains'] ?? []];
    if (!empty($get['base'])) { $out['base'] = metiers_transmission_base($pdo); }
    return $out;
}

/** une étape en plus pour la carte de la vie */
function carte_vie_step(string $date, ?int $year, string $kind, string $title, ?array $pl, ?float $lat, ?float $lon, string $src, string $placeText = '', string $who = '', int $pid = 0): array
{
    $lat = $lat !== null && abs($lat) <= 90 && !($lat == 0.0 && $lon == 0.0) ? round($lat, 5) : ($pl[4] ?? null);
    $lon = $lon !== null && $lat !== null && abs($lon) <= 180 ? round($lon, 5) : ($pl[5] ?? null);
    return ['date' => mb_substr(trim($date !== '' ? $date : ($year !== null ? (string) $year : '')), 0, 60), 'year' => $year, 'kind' => mb_substr($kind, 0, 60), 'tag' => '', 'title' => mb_substr(trim($title), 0, 120), 'with' => '',
        'place' => $pl ? $pl[0] : mb_substr(trim($placeText), 0, 120), 'county' => $pl ? $pl[1] : '', 'country' => $pl ? $pl[3] : '', 'insee' => $pl ? $pl[6] : '', 'lat' => $lat, 'lon' => $lon, 'src' => $src, 'who' => mb_substr($who, 0, 120), 'pid' => $pid];
}

function carte_vie_year(string $s): ?int
{
    return preg_match('/(?<!\d)(\d{3,4})(?!\d)/', $s, $m) ? (int) $m[1] : null;
}

function carte_vie_has(PDO $pdo, string $table): bool
{
    $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$table]);
    return (bool) $s->fetchColumn();
}

/** GET carte_vie */
function carte_vie_data(PDO $pdo, array $get): array
{
    require_once __DIR__ . '/diagram_cartes2.php';
    $pid = is_scalar($get['person'] ?? null) ? (int) $get['person'] : 0;
    $base = diagram_cartes2_data($pdo, ['what' => 'story', 'person' => $pid]);
    $pid = (int) ($base['id'] ?? 0);
    if (!$pid) { return ['id' => 0, 'name' => '', 'steps' => [], 'missing' => 0]; }
    $hidden = metiers_hidden($pdo);
    $share = !empty($get['share']);
    $me = ['id' => $pid, 'name' => (string) $base['name'], 'gender' => (string) ($base['gender'] ?? ''), 'hidden' => isset($hidden[$pid])];
    if ($share && $me['hidden']) { return $me + ['steps' => [], 'private' => true]; }
    $steps = [];
    foreach ($base['steps'] as $i => $s) { $steps[] = $s + ['src' => 'event', 'who' => '', 'pid' => $pid, 'o' => $i]; }
    $extra = []; $placeIds = [];
    // 🧾 recensements
    $q = $pdo->prepare("SELECT cr.year, cr.date_text, cr.address, cr.place_id, cm.occupation FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id WHERE cm.person_id=? ORDER BY cr.year LIMIT 60");
    $q->execute([$pid]);
    $census = $q->fetchAll(PDO::FETCH_ASSOC);
    foreach ($census as $c) { if ($c['place_id']) { $placeIds[] = (int) $c['place_id']; } }
    $places = dc2_places($pdo, $placeIds);
    foreach ($census as $c) {
        $pl = $c['place_id'] ? ($places[(int) $c['place_id']] ?? null) : null;
        $extra[] = carte_vie_step((string) ($c['date_text'] ?: $c['year']), (int) $c['year'], 'Recensement', trim(implode(' · ', array_filter([(string) $c['occupation'], (string) $c['address']]))), $pl, null, null, 'census', (string) $c['address']);
    }
    // 🚢 voyages (les siens et ceux où il ou elle est passager)
    if (carte_vie_has($pdo, 'person_voyages')) {
        $vq = carte_vie_has($pdo, 'voyage_people')
            ? $pdo->prepare('SELECT v.* FROM person_voyages v WHERE v.person_id=? OR v.id IN (SELECT voyage_id FROM voyage_people WHERE person_id=?) ORDER BY v.departure_year, v.id LIMIT 40')
            : $pdo->prepare('SELECT v.* FROM person_voyages v WHERE v.person_id=? OR v.person_id=? ORDER BY v.departure_year, v.id LIMIT 40');
        $vq->execute([$pid, $pid]);
        foreach ($vq->fetchAll(PDO::FETCH_ASSOC) as $v) {
            $ship = trim((string) $v['ship_name']);
            $y = $v['departure_year'] !== null ? (int) $v['departure_year'] : carte_vie_year((string) $v['departure_date']);
            if (trim((string) $v['departure_port']) !== '') { $extra[] = carte_vie_step((string) $v['departure_date'], $y, 'Départ en voyage', $ship ? "à bord du $ship" : (string) $v['reason'], null, is_numeric($v['dep_lat']) ? (float) $v['dep_lat'] : null, is_numeric($v['dep_lon']) ? (float) $v['dep_lon'] : null, 'voyage', (string) $v['departure_port']); }
            $dest = trim((string) ($v['arrival_port'] ?: $v['destination']));
            if ($dest !== '') { $ya = carte_vie_year((string) $v['arrival_date']) ?? $y; $extra[] = carte_vie_step((string) $v['arrival_date'], $ya, 'Arrivée', $ship ? "par le $ship" : '', null, is_numeric($v['dest_lat']) ? (float) $v['dest_lat'] : null, is_numeric($v['dest_lon']) ? (float) $v['dest_lon'] : null, 'voyage', $dest); }
        }
    }
    // 👶 placements (nourrice, assistance)
    if (carte_vie_has($pdo, 'child_placements')) {
        $cq = $pdo->prepare('SELECT * FROM child_placements WHERE person_id=? ORDER BY start_year, id LIMIT 30'); $cq->execute([$pid]);
        foreach ($cq->fetchAll(PDO::FETCH_ASSOC) as $c) {
            if (trim((string) $c['place_text']) === '' && !is_numeric($c['lat'])) { continue; }
            $extra[] = carte_vie_step((string) $c['start_date'], $c['start_year'] !== null ? (int) $c['start_year'] : carte_vie_year((string) $c['start_date']), 'Placement', trim((string) ($c['nurse_name'] ? 'chez ' . $c['nurse_name'] : $c['institution'])), null, is_numeric($c['lat']) ? (float) $c['lat'] : null, is_numeric($c['lon']) ? (float) $c['lon'] : null, 'placement', (string) $c['place_text']);
        }
    }
    // 🎖 service militaire, guerre (faits notés dans « Poilus »)
    if (carte_vie_has($pdo, 'poilu_events')) {
        $mq = $pdo->prepare("SELECT event_date, kind, place_text, note FROM poilu_events WHERE person_id=? AND TRIM(place_text)<>'' ORDER BY event_date, id LIMIT 60"); $mq->execute([$pid]);
        $K = ['incorporation' => 'Incorporation', 'blessure' => 'Blessure', 'citation' => 'Citation', 'hopital' => 'Hôpital', 'prisonnier' => 'Prisonnier', 'deces' => 'Mort au combat', 'demobilisation' => 'Démobilisation'];
        foreach ($mq->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $extra[] = carte_vie_step((string) $m['event_date'], carte_vie_year((string) $m['event_date']), 'Service militaire' . (isset($K[$m['kind']]) ? ' : ' . $K[$m['kind']] : ''), mb_substr((string) $m['note'], 0, 100), null, null, null, 'military', (string) $m['place_text']);
        }
    }
    // 👪 la famille : le conjoint (naissance, décès), les enfants (naissance, mariage, décès) pendant sa vie
    if (!empty($get['family'])) {
        $life = [null, null];
        foreach ($steps as $s) { if (in_array($s['tag'], ['BIRT', 'CHR', 'BAPM'], true) && $s['year'] !== null && $life[0] === null) { $life[0] = $s['year']; } if (in_array($s['tag'], ['DEAT', 'BURI'], true) && $s['year'] !== null) { $life[1] = $life[1] === null ? $s['year'] : min($life[1], $s['year']); } }
        $fams = $pdo->prepare('SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id=? OR partner2_id=?'); $fams->execute([$pid, $pid]);
        $who = [];
        foreach ($fams->fetchAll(PDO::FETCH_ASSOC) as $f) {
            $sp = (int) $f['partner1_id'] === $pid ? (int) $f['partner2_id'] : (int) $f['partner1_id'];
            if ($sp) { $who[$sp] = ['spouse', ['BIRT', 'DEAT']]; }
            $ch = $pdo->prepare('SELECT child_id FROM family_children WHERE family_id=? ORDER BY position, id'); $ch->execute([(int) $f['id']]);
            foreach ($ch->fetchAll(PDO::FETCH_COLUMN) as $c) { $who[(int) $c] = ['child', ['BIRT', 'MARR', 'DEAT']]; }
        }
        unset($who[$pid]);
        if ($who) {
            $in = implode(',', array_map('intval', array_keys($who)));
            $names = [];
            foreach ($pdo->query("SELECT id, first_name, last_name, gender FROM persons WHERE id IN ($in)") as $p) { $names[(int) $p['id']] = [trim((string) $p['first_name'] . ' ' . (string) $p['last_name']) ?: 'Sans nom', (string) $p['gender']]; }
            $evs = $pdo->query("SELECT e.person_id, e.family_id, e.scope, e.date_text, e.year, e.place_id, e.precise_lat, e.precise_lon, t.gedcom_tag, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id
                WHERE ((e.scope='person' AND e.person_id IN ($in)) OR (e.scope='family' AND e.family_id IN (SELECT id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in))))
                  AND t.gedcom_tag IN ('BIRT','DEAT','MARR') ORDER BY e.year LIMIT 400")->fetchAll(PDO::FETCH_ASSOC);
            $famOwner = [];
            foreach ($pdo->query("SELECT id, partner1_id, partner2_id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in)") as $f) { foreach (['partner1_id', 'partner2_id'] as $k) { if (isset($who[(int) $f[$k]]) && $who[(int) $f[$k]][0] === 'child') { $famOwner[(int) $f['id']] = (int) $f[$k]; } } }
            $places = dc2_places($pdo, array_column($evs, 'place_id'));
            $LAB = ['BIRT' => 'Naissance', 'DEAT' => 'Décès', 'MARR' => 'Mariage'];
            $done = [];
            foreach ($evs as $e) {
                $p = $e['scope'] === 'family' ? ($famOwner[(int) $e['family_id']] ?? 0) : (int) $e['person_id'];
                if (!$p || !isset($who[$p]) || !in_array($e['gedcom_tag'], $who[$p][1], true) || isset($done[$p . $e['gedcom_tag']])) { continue; }
                if ($share && isset($hidden[$p])) { continue; }
                $y = $e['year'] !== null ? (int) $e['year'] : null;
                if ($who[$p][0] === 'child' && $y !== null && $life[1] !== null && $y > $life[1]) { continue; }
                $done[$p . $e['gedcom_tag']] = true;
                [$nm, $g] = $names[$p] ?? ['?', ''];
                $rel = $who[$p][0] === 'spouse' ? ($g === 'female' ? 'son épouse' : ($g === 'male' ? 'son époux' : 'son conjoint')) : ($g === 'female' ? 'sa fille' : ($g === 'male' ? 'son fils' : 'son enfant'));
                $pl = $e['place_id'] ? ($places[(int) $e['place_id']] ?? null) : null;
                $extra[] = carte_vie_step((string) ($e['date_text'] ?: ''), $y, ($LAB[$e['gedcom_tag']] ?? $e['label']) . ' de ' . $nm, $rel, $pl, is_numeric($e['precise_lat']) ? (float) $e['precise_lat'] : null, is_numeric($e['precise_lon']) ? (float) $e['precise_lon'] : null, $who[$p][0] === 'spouse' ? 'spouse' : 'child', '', $rel, $p);
            }
        }
    }
    // l'ordre : par année (stable : les événements gardent leur ordre fin, les étapes en plus viennent après ceux de la même année)
    $all = $steps;
    foreach ($extra as $k => $s) { $all[] = $s + ['o' => 100000 + $k]; }
    usort($all, static fn($a, $b) => (($a['year'] ?? 99999) <=> ($b['year'] ?? 99999)) ?: ($a['o'] <=> $b['o']));
    $all = array_slice(array_map(static function ($s) { unset($s['o']); return $s; }, $all), 0, 400);
    $missing = count(array_filter($all, static fn($s) => $s['place'] !== '' && ($s['lat'] === null || $s['lon'] === null)));
    return $me + ['steps' => $all, 'missing' => $missing];
}
