<?php
declare(strict_types=1);

/**
 * 🔬 Sciences, inventions et explorations (interface : assets/js/heritage-sciences*.js, styles assets/css/sciences.css).
 * Construit SUR le moteur des fiches (lib/art_engine.php, docs/TYPES.md) : aucune table à soi.
 *
 *  - Les sortes : invention 💡 (brevets pays par pays, prototypes, licences, objets fabriqués), discovery 🔬 (espèce, comète,
 *    gène, site…), paper 📄 (publication scientifique), expedition 🧭 (itinéraire, membres, collectes) ; et les fiches de profil
 *    profile_inventor, profile_scientist, profile_explorer (une par personne, comme « profile » pour l'artiste).
 *  - Les profils : inventor 💡 Inventeur, scientist 🔬 Scientifique, explorer 🧭 Explorateur (table person_profiles).
 *    Une fiche de ces sortes se range chez une personne qui a l'un de ces trois profils (pas besoin d'être « Artiste »).
 *  - GET  api.php?action=sciences&op=coords&ids=1,2   → coordonnées des lieux (carte de l'itinéraire, lieu de la découverte)
 *  - POST api.php?action=sciences_remote {source: crossref|orcid|hal, …} → publications à importer (DOI, ORCID, HAL)
 *
 * Branchements dans les fichiers partagés : voir scratchpad iac/sciences/hooks.md (art_kind_ok, art_save_item, art_subline, api.php).
 */

/** clé => [nom, pluriel, icône, famille, type parent] */
const SCI_TYPES = [
    'invention' => ['Invention', 'Inventions', '💡', 'science', ''],
    'discovery' => ['Découverte', 'Découvertes', '🔬', 'science', ''],
    'paper' => ['Publication scientifique', 'Publications', '📄', 'science', ''],
    'expedition' => ['Expédition', 'Expéditions', '🧭', 'science', ''],
    'profile_inventor' => ['Profil d’inventeur', 'Profils', '💡', 'profile', ''],
    'profile_scientist' => ['Profil de scientifique', 'Profils', '🔬', 'profile', ''],
    'profile_explorer' => ['Profil d’explorateur', 'Profils', '🧭', 'profile', ''],
];
/** les profils de ce domaine : clé => [nom, icône] */
const SCI_PROFILES = ['inventor' => ['Inventeur', '💡'], 'scientist' => ['Scientifique', '🔬'], 'explorer' => ['Explorateur', '🧭']];

function sciences_kind_ok(string $kind): bool { return isset(SCI_TYPES[$kind]); }

/** le profil d'une fiche de profil (« profile_scientist » → « scientist »), sinon '' */
function sciences_profile_of_type(string $kind): string
{
    return str_starts_with($kind, 'profile_') && isset(SCI_PROFILES[substr($kind, 8)]) ? substr($kind, 8) : '';
}

/** les types et les profils dans la base (pour leurs noms et icônes dans le menu de choix) ; idempotent */
function sciences_register(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $ti = $pdo->prepare("INSERT OR IGNORE INTO item_types(key, label, plural, icon, family, domain, parent_type, origin) VALUES(?,?,?,?,?,?,?,'builtin')");
    foreach (SCI_TYPES as $k => [$l, $pl, $ic, $fam, $par]) { $ti->execute([$k, $l, $pl, $ic, $fam, $fam, $par]); }
    $pr = $pdo->prepare("INSERT OR IGNORE INTO profiles(key, label, icon, origin) VALUES(?,?,?,'builtin')");
    foreach (SCI_PROFILES as $k => [$l, $ic]) { $pr->execute([$k, $l, $ic]); }
    $done = true;
}

/** les profils « sciences » cochés sur une fiche */
function sciences_person_profiles(PDO $pdo, int $personId): array
{
    $s = $pdo->prepare('SELECT profile_key FROM person_profiles WHERE person_id=? AND profile_key IN (' . implode(',', array_fill(0, count(SCI_PROFILES), '?')) . ')');
    $s->execute([$personId, ...array_keys(SCI_PROFILES)]);
    return array_map('strval', $s->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Appelé par art_save_item avant d'écrire (après le contrôle du verrou) : vrai si la fiche relève de ce domaine.
 * La personne doit avoir un des trois profils (inventeur, scientifique, explorateur) ; sinon message clair.
 * Une fiche de profil est unique par personne : $d['id'] reçoit celle qui existe déjà.
 */
function sciences_before_save(PDO $pdo, int $personId, string $kind, array &$d): bool
{
    if (!sciences_kind_ok($kind)) { return false; }
    sciences_register($pdo);
    $own = sciences_profile_of_type($kind);
    if ($own !== '') { // la fiche de profil coche son profil
        $pdo->prepare('INSERT OR IGNORE INTO person_profiles(person_id, profile_key) VALUES(?,?)')->execute([$personId, $own]);
        if (!safe_int($d['id'] ?? 0)) {
            $s = $pdo->prepare('SELECT id FROM items WHERE person_id=? AND type_key=? ORDER BY id LIMIT 1'); $s->execute([$personId, $kind]);
            $d['id'] = (int) $s->fetchColumn();
        }
        return true;
    }
    if (!sciences_person_profiles($pdo, $personId)) {
        $want = ['invention' => 'inventor', 'expedition' => 'explorer'][$kind] ?? 'scientist';
        if (empty($d['make_profile'])) {
            throw new RuntimeException('Cette fiche n’est pas cochée « ' . SCI_PROFILES[$want][1] . ' ' . SCI_PROFILES[$want][0] . ' » (ni scientifique, inventeur ou explorateur) : coche ce profil sur la fiche avant d’y ranger ' . ['invention' => 'une invention', 'discovery' => 'une découverte', 'paper' => 'une publication', 'expedition' => 'une expédition'][$kind] . '.');
        }
        $pdo->prepare('INSERT OR IGNORE INTO person_profiles(person_id, profile_key) VALUES(?,?)')->execute([$personId, $want]);
    }
    return true;
}

/** après l'écriture : la fiche de profil est retenue dans person_profiles (comme le profil d'artiste) */
function sciences_after_save(PDO $pdo, int $personId, string $kind, int $id): void
{
    $own = sciences_profile_of_type($kind);
    if ($own !== '') {
        $pdo->prepare('INSERT INTO person_profiles(person_id, profile_key, item_id) VALUES(?,?,?) ON CONFLICT(person_id, profile_key) DO UPDATE SET item_id=excluded.item_id')->execute([$personId, $own, $id]);
    }
}

/** la ligne grise du menu de choix (art_subline) ; null = pas de ce domaine */
function sciences_subline(array $d, string $kind): ?string
{
    if (!sciences_kind_ok($kind)) { return null; }
    $s = static fn(string $k) => is_scalar($d[$k] ?? null) ? trim((string) $d[$k]) : '';
    $parts = match ($kind) {
        'invention' => [$s('domain'), is_array($d['patents'] ?? null) && $d['patents'] ? count($d['patents']) . ' brevet' . (count($d['patents']) > 1 ? 's' : '') : ''],
        'discovery' => [$s('dkind_label') ?: $s('dkind'), $s('sci_name'), $s('date')],
        'paper' => [$s('journal_txt'), $s('year') ?: $s('date'), $s('doi') !== '' ? 'DOI ' . $s('doi') : ''],
        'expedition' => [$s('region'), $s('dates')],
        default => [],
    };
    return implode(' · ', array_values(array_filter($parts, static fn($x) => $x !== '')));
}

/* ═════════ Lecture : coordonnées des lieux ═════════ */

function sciences_coords(PDO $pdo, string $ids): array
{
    $list = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', $ids)), static fn($x) => $x > 0))), 0, 500);
    if (!$list) { return ['places' => []]; }
    $s = $pdo->prepare('SELECT id, name, county, country, latitude, longitude FROM places WHERE id IN (' . implode(',', array_fill(0, count($list), '?')) . ')');
    $s->execute($list);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $lat = $r['latitude'] !== null ? (float) $r['latitude'] : null; $lon = $r['longitude'] !== null ? (float) $r['longitude'] : null;
        $out[] = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'county' => (string) $r['county'], 'country' => (string) $r['country'],
            'lat' => $lat !== null && $lat >= -90 && $lat <= 90 ? $lat : null, 'lon' => $lon !== null && $lon >= -180 && $lon <= 180 ? $lon : null];
    }
    return ['places' => $out];
}

function sciences_api_get(PDO $pdo, array $g): array
{
    return match ((string) ($g['op'] ?? '')) {
        'coords' => sciences_coords($pdo, (string) ($g['ids'] ?? '')),
        default => throw new RuntimeException('Demande inconnue.'),
    };
}

/* ═════════ Import des publications : DOI (Crossref), ORCID, HAL ═════════ */

/** un DOI propre (« https://doi.org/10.1038/251123a0 » → « 10.1038/251123a0 ») ou '' */
function sciences_doi(string $v): string
{
    $v = trim(preg_replace('~^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)~i', '', trim($v)) ?? '');
    return preg_match('~^10\.\d{4,9}/[^\s"<>]{1,200}$~', $v) ? $v : '';
}

/** un ORCID (avec ou sans l'adresse) vérifié par sa clé de contrôle, ou '' */
function sciences_orcid(string $v): string
{
    if (!preg_match('~(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])~i', $v, $m)) { return ''; }
    $id = strtoupper($m[1] . $m[2] . $m[3] . $m[4]); $t = 0;
    for ($i = 0; $i < 15; $i++) { $t = ($t + (int) $id[$i]) * 2; }
    $r = (12 - $t % 11) % 11; $chk = $r === 10 ? 'X' : (string) $r;
    return $chk === $id[15] ? implode('-', str_split($id, 4)) : '';
}

/** une publication, toujours la même forme (le navigateur en fait une fiche « paper ») */
function sciences_pub(array $p): array
{
    $t = static fn($v, int $n = 400) => mb_substr(trim(strip_tags(html_entity_decode((string) (is_scalar($v) ? $v : ''), ENT_QUOTES | ENT_HTML5, 'UTF-8'))), 0, $n);
    return ['title' => $t($p['title'] ?? '', 600), 'year' => $t($p['year'] ?? '', 4), 'date' => $t($p['date'] ?? '', 40), 'journal' => $t($p['journal'] ?? '', 300),
        'volume' => $t($p['volume'] ?? '', 40), 'issue' => $t($p['issue'] ?? '', 40), 'pages' => $t($p['pages'] ?? '', 40), 'doi' => sciences_doi((string) ($p['doi'] ?? '')),
        'hal' => $t($p['hal'] ?? '', 60), 'url' => preg_match('~^https://~', (string) ($p['url'] ?? '')) ? mb_substr((string) $p['url'], 0, 500) : '',
        'authors' => array_values(array_filter(array_map(static fn($a) => $t($a, 160), array_slice(is_array($p['authors'] ?? null) ? $p['authors'] : [], 0, 60)))),
        'citations' => is_numeric($p['citations'] ?? null) ? (int) $p['citations'] : null, 'ptype' => $t($p['ptype'] ?? 'article', 30), 'abstract' => $t($p['abstract'] ?? '', 6000), 'source' => $t($p['source'] ?? '', 20)];
}

function sciences_crossref_type(string $t): string
{
    return match ($t) { 'journal-article' => 'article', 'proceedings-article' => 'communication', 'book' , 'monograph', 'edited-book' => 'livre', 'book-chapter' => 'chapitre',
        'dissertation' => 'these', 'report' => 'rapport', 'posted-content' => 'preprint', default => 'article' };
}

function sciences_from_crossref(array $m): array
{
    $dp = $m['issued']['date-parts'][0] ?? ($m['published']['date-parts'][0] ?? []);
    return sciences_pub(['title' => $m['title'][0] ?? '', 'year' => (string) ($dp[0] ?? ''), 'date' => implode('-', array_map('strval', array_slice(is_array($dp) ? $dp : [], 0, 3))),
        'journal' => $m['container-title'][0] ?? '', 'volume' => $m['volume'] ?? '', 'issue' => $m['issue'] ?? '', 'pages' => $m['page'] ?? '', 'doi' => $m['DOI'] ?? '',
        'url' => 'https://doi.org/' . ($m['DOI'] ?? ''), 'authors' => array_map(static fn($a) => trim(($a['given'] ?? '') . ' ' . ($a['family'] ?? ($a['name'] ?? ''))), is_array($m['author'] ?? null) ? $m['author'] : []),
        'citations' => $m['is-referenced-by-count'] ?? null, 'ptype' => sciences_crossref_type((string) ($m['type'] ?? '')), 'abstract' => $m['abstract'] ?? '', 'source' => 'crossref']);
}

/** la liste des travaux d'ORCID (v3.0 /works) → publications */
function sciences_parse_orcid(array $j): array
{
    $items = [];
    foreach (array_slice(is_array($j['group'] ?? null) ? $j['group'] : [], 0, 400) as $g) {
        $w = $g['work-summary'][0] ?? []; $doi = '';
        foreach (($w['external-ids']['external-id'] ?? []) as $x) { if (strtolower((string) ($x['external-id-type'] ?? '')) === 'doi') { $doi = (string) ($x['external-id-value'] ?? ''); break; } }
        $pd = $w['publication-date'] ?? [];
        $items[] = sciences_pub(['title' => $w['title']['title']['value'] ?? '', 'year' => $pd['year']['value'] ?? '', 'date' => implode('-', array_filter([$pd['year']['value'] ?? '', $pd['month']['value'] ?? '', $pd['day']['value'] ?? ''])),
            'journal' => $w['journal-title']['value'] ?? '', 'doi' => $doi, 'url' => (string) ($w['url']['value'] ?? ''), 'ptype' => str_replace(['journal-article', 'conference-paper', 'book-chapter', 'dissertation-thesis'], ['article', 'communication', 'chapitre', 'these'], (string) ($w['type'] ?? 'article')), 'source' => 'orcid']);
    }
    return $items;
}

/** la réponse de l'API de HAL (search) → publications */
function sciences_parse_hal(array $j): array
{
    $type = static fn($t) => ['ART' => 'article', 'COMM' => 'communication', 'OUV' => 'livre', 'COUV' => 'chapitre', 'THESE' => 'these', 'REPORT' => 'rapport', 'UNDEFINED' => 'preprint'][$t] ?? 'article';
    return array_map(static fn($d) => sciences_pub(['title' => $d['title_s'][0] ?? '', 'year' => (string) ($d['producedDateY_i'] ?? ''), 'date' => $d['producedDate_s'] ?? '', 'journal' => $d['journalTitle_s'] ?? '',
        'volume' => $d['volume_s'] ?? '', 'issue' => is_array($d['issue_s'] ?? null) ? ($d['issue_s'][0] ?? '') : ($d['issue_s'] ?? ''), 'pages' => $d['page_s'] ?? '', 'doi' => $d['doiId_s'] ?? '', 'hal' => $d['halId_s'] ?? '',
        'url' => $d['uri_s'] ?? '', 'authors' => $d['authFullName_s'] ?? [], 'ptype' => $type((string) ($d['docType_s'] ?? '')), 'source' => 'hal']), array_slice(is_array($j['response']['docs'] ?? null) ? $j['response']['docs'] : [], 0, 200));
}

function sciences_remote(array $q): array
{
    if (!function_exists('artist_json')) { throw new RuntimeException('Import indisponible.'); }
    $src = (string) ($q['source'] ?? '');
    switch ($src) {
        case 'crossref': // un ou plusieurs DOI (un par ligne)
            $dois = array_slice(array_values(array_unique(array_filter(array_map('sciences_doi', preg_split('~[\s,;]+~', (string) ($q['dois'] ?? '')) ?: [])))), 0, 25);
            if (!$dois) { throw new RuntimeException('Aucun DOI reconnu : il commence par « 10. » (ex. 10.1038/251123a0), ou colle l’adresse https://doi.org/…'); }
            $items = []; $errors = [];
            foreach ($dois as $doi) {
                try { $j = artist_json('https://api.crossref.org/works/' . rawurlencode($doi)); $items[] = sciences_from_crossref(is_array($j['message'] ?? null) ? $j['message'] : []); }
                catch (Throwable $e) { $errors[] = $doi . ' : ' . $e->getMessage(); }
            }
            return ['items' => $items, 'errors' => $errors];
        case 'orcid':
            $id = sciences_orcid((string) ($q['id'] ?? ''));
            if ($id === '') { throw new RuntimeException('Identifiant ORCID incorrect : 16 chiffres par groupes de 4 (ex. 0000-0002-1825-0097).'); }
            return ['items' => sciences_parse_orcid(artist_json('https://pub.orcid.org/v3.0/' . $id . '/works')), 'errors' => [], 'orcid' => $id];
        case 'hal':
            $who = mb_substr(trim((string) ($q['q'] ?? '')), 0, 120);
            if ($who === '') { throw new RuntimeException('Écris le nom de l’auteur (ex. Anne Martin) ou son identifiant HAL.'); }
            $w = str_replace(['"', '\\'], '', $who);
            $query = preg_match('~^[a-z0-9-]{3,60}$~', $w) ? 'authIdHal_s:"' . $w . '" OR authFullName_t:"' . $w . '"' : 'authFullName_t:"' . $w . '"'; // idHal (anne-martin) ou nom
            $j = artist_json('https://api.archives-ouvertes.fr/search/?' . http_build_query(['q' => $query, 'rows' => 200, 'wt' => 'json',
                'fl' => 'title_s,authFullName_s,journalTitle_s,producedDateY_i,producedDate_s,doiId_s,halId_s,uri_s,docType_s,volume_s,issue_s,page_s', 'sort' => 'producedDateY_i desc']));
            return ['items' => sciences_parse_hal($j), 'errors' => []];
        default:
            throw new RuntimeException('Source inconnue (DOI, ORCID ou HAL).');
    }
}
