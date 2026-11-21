<?php
declare(strict_types=1);

/**
 * 🏛 Cet acte est-il en ligne aux archives ? (maquette validée : docs/design/archives-en-ligne.html ; interface :
 * assets/js/heritage-archives-dispo.js).
 *
 * Une pastille pour chaque naissance, baptême, mariage, décès, sépulture, calculée à la lecture (rien n'est recopié dans
 * les événements) :
 *   🟢 online      une limite VÉRIFIÉE pour ce département et ce type d'acte couvre toute la date
 *   🟡 maybe       limite pas encore confirmée (« verified » ≠ true, ou source « secondaire »), date à 2 ans de la limite,
 *                  date approximative à cheval sur la limite (« vers » = ± 5 ans), plus de 100 ans sans limite connue,
 *                  Paris avant 1860 (état civil reconstitué)
 *   📮 ask         trop récent pour être en ligne mais communicable : à demander — à QUI (mairie, Archives départementales,
 *                  Service central d'état civil à Nantes, ANOM, archives diocésaines…)
 *   🔒 restricted  naissance ou mariage de moins de 75 ans (code du patrimoine, art. L213-2) : réservé jusqu'en <année>
 *   ❔ verify      pas de date, département inconnu, lieu à l'étranger
 * Jamais 🟢 sans limite sourcée : la table vient de config/archives-en-ligne.json (rempli à part, chaque ligne avec
 * l'adresse officielle et la date de vérification ; fichier absent ⇒ tout « à vérifier », sans erreur), puis des
 * corrections de la personne (✓ trouvé en ligne, ✗ pas en ligne, ＋ noter la limite) : table archives_dispo_corr
 * (migration 95), pour tout le département ou « seulement cette commune », avec la date et l'acte concernés.
 * L'app n'interroge jamais les sites des archives : elle compare une date à une limite notée, puis ouvre la page.
 *
 * GET  ad_events&ids=1,2 | ad_person&id= | ad_counts[&sosa=1] | ad_table | ad_succ&case_id=
 * POST ad_write {op: correct | undo | limit}
 */

const AD_TAGS = ['BIRT', 'CHR', 'BAPM', 'MARR', 'DEAT', 'BURI'];
const AD_ACTS = ['N' => 'Naissances', 'M' => 'Mariages', 'D' => 'Décès', 'TD' => 'Tables décennales', 'BMS' => 'Registres paroissiaux'];
/** à qui demander : clé → [icône, libellé] (les clés existent aussi dans lib/courriers_actes.php, CL_RECIPIENTS) */
const AD_WHO = ['mairie' => ['📮', 'Mairie'], 'ad' => ['🏛', 'Archives départementales'], 'scec' => ['🌍', 'Service central d’état civil (Nantes)'],
    'shd' => ['🎖', 'Service historique de la Défense'], 'anom' => ['⚓', 'Archives nationales d’outre-mer (Aix-en-Provence)'], 'diocese' => ['⛪', 'Archives diocésaines'],
    'notaire' => ['🏛', 'Notaire ou Archives départementales (série E)']];
/** les pays des anciennes colonies (état civil aux ANOM, Aix-en-Provence) */
const AD_COLONIES = '/^(alg[ée]rie|algeria|indochine|cochinchine|tonkin|annam|vietnam|viet nam|cambodge|laos|s[ée]n[ée]gal|soudan|mali|guin[ée]e|c[oô]te d.ivoire|dahomey|b[ée]nin|niger|haute volta|burkina|togo|cameroun|gabon|congo|tchad|oubangui|madagascar|comores|djibouti|tunisie|maroc|inde fran[çc]aise|pondich[ée]ry)$/iu';
/** quelques pays étrangers écrits comme nom de lieu (un lieu « Pologne » tapé à la main) */
const AD_FOREIGN = '/^(allemagne|pologne|italie|espagne|portugal|belgique|suisse|luxembourg|pays-bas|hollande|angleterre|royaume-uni|[ée]cosse|irlande|autriche|hongrie|tch[ée]quie|boh[eê]me|russie|ukraine|roumanie|gr[eè]ce|turquie|su[eè]de|norv[eè]ge|danemark|finlande|lituanie|lettonie|estonie|[ée]tats-unis|canada|qu[ée]bec|argentine|br[ée]sil|mexique|australie|alg[ée]rie|maroc|tunisie|s[ée]n[ée]gal|indochine|madagascar|prusse|bavi[eè]re)$/iu';
const AD_LEGI = 'https://www.legifrance.gouv.fr/search/code?tab_selection=code&searchField=ALL&query=L213-2%20code%20du%20patrimoine&page=1&init=true';

function ad_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS archives_dispo_corr (id INTEGER PRIMARY KEY AUTOINCREMENT, dept_code TEXT NOT NULL, act_key TEXT NOT NULL,
        commune TEXT NOT NULL DEFAULT '', commune_label TEXT NOT NULL DEFAULT '', verdict TEXT NOT NULL, year INTEGER NOT NULL, url TEXT NOT NULL DEFAULT '',
        event_id INTEGER, about TEXT NOT NULL DEFAULT '', source_id INTEGER, link_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_ad_corr_dept ON archives_dispo_corr(dept_code, act_key)');
}
function ad_ready(PDO $pdo): bool
{
    static $ok = null;
    if ($ok === null) { $ok = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='archives_dispo_corr'")->fetchColumn(); }
    return $ok;
}

/* ═════ la table livrée (config/archives-en-ligne.json) ═════ */
function ad_config_path(): string
{
    $env = getenv('LCNDA_ARCHIVES_EN_LIGNE');
    return is_string($env) && $env !== '' ? $env : APP_ROOT . '/config/archives-en-ligne.json';
}
/** la table des limites : absente ou illisible ⇒ vide (tout « à vérifier »), sans erreur */
function ad_config(bool $fresh = false): array
{
    static $c = null;
    if ($c !== null && !$fresh) { return $c; }
    ad_memo_gen(true);
    $c = ['departements' => [], 'generated' => '', 'note' => '', 'present' => false];
    $path = ad_config_path();
    if (!is_file($path) || filesize($path) > 4_000_000) { return $c; }
    $j = json_decode((string) @file_get_contents($path), true);
    if (!is_array($j) || ($j['format'] ?? '') !== 'lcnda-archives-en-ligne' || !is_array($j['departements'] ?? null)) { return $c; }
    $deps = [];
    foreach ($j['departements'] as $code => $d) {
        $code = strtoupper((string) $code);
        if (!preg_match('/^(\d{2}|2[AB]|97\d)$/', $code) || !is_array($d)) { continue; }
        $acts = [];
        foreach (is_array($d['acts'] ?? null) ? $d['acts'] : [] as $k => $a) {
            if (!isset(AD_ACTS[$k]) || !is_array($a)) { continue; }
            $src = ad_url((string) ($a['source'] ?? ''));
            $until = isset($a['until']) && is_numeric($a['until']) ? (int) $a['until'] : null;
            $from = isset($a['from']) && is_numeric($a['from']) ? (int) $a['from'] : null;
            if ($src === '' || ($until === null && $from === null)) { continue; } // une ligne sans source n'existe pas
            $acts[$k] = ['until' => $until, 'from' => $from, 'source' => $src, 'checked' => (string) ($a['checked'] ?? ''),
                'confidence' => (string) ($a['confidence'] ?? '') === 'officielle' ? 'officielle' : 'secondaire', 'verified' => ($a['verified'] ?? null) === true, 'note' => mb_substr((string) ($a['note'] ?? ''), 0, 400)];
        }
        $deps[$code] = ['name' => mb_substr((string) ($d['name'] ?? ''), 0, 80), 'site' => ad_url((string) ($d['site'] ?? '')), 'acts' => $acts, 'note' => mb_substr((string) ($d['note'] ?? ''), 0, 600)];
    }
    return $c = ['departements' => $deps, 'generated' => (string) ($j['generated'] ?? ''), 'note' => mb_substr((string) ($j['note'] ?? ''), 0, 600), 'present' => true];
}
function ad_url(string $u): string
{
    $u = trim($u);
    return preg_match('#^https?://[^\s<>"\'`]+$#i', $u) && mb_strlen($u) <= 500 ? $u : '';
}
function ad_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['’' => "'", 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'ô' => 'o', 'î' => 'i', 'ï' => 'i', 'û' => 'u', 'ù' => 'u', 'ç' => 'c', '-' => ' ']);
    return trim((string) preg_replace('/\s+/', ' ', $s));
}

/* ═════ la date : une fourchette ═════ */
/** « 12 mars 1904 » → [1904, 1904] ; « vers 1910 » → [1905, 1915] ; « entre 1905 et 1912 » ; « avant 1920 » → [1910, 1920] ; « après 1900 » → [1900, 1910] */
function ad_range(string $text, ?int $year): ?array
{
    static $memo = []; // fonction pure, appelée pour chaque acte : gardée par date
    $mk = $text . "\x1f" . $year;
    if (array_key_exists($mk, $memo)) { return $memo[$mk]; }
    if (count($memo) > 100000) { $memo = []; }
    return $memo[$mk] = ad_range_raw($text, $year);
}
function ad_range_raw(string $text, ?int $year): ?array
{
    $t = ad_fold($text);
    $ys = preg_match_all('/(?<!\d)(1[0-9]\d\d|20\d\d)(?!\d)/', $t, $m) ? array_map('intval', $m[1]) : [];
    if (!$ys && $year) { $ys = [$year]; }
    if (!$ys) { return null; }
    if (preg_match('/\b(entre|de|from|bet)\b.*\b(et|a|and|to)\b/', $t) && count($ys) >= 2) { return [min($ys), max($ys), true]; }
    $y = $ys[0];
    if (preg_match('/\b(vers|v\.|env|environ|circa|ca\.?|abt|about|est)\b|~/', $t)) { return [$y - 5, $y + 5, true]; }
    if (preg_match('/\b(avant|bef|before)\b/', $t)) { return [$y - 10, $y, true]; }
    if (preg_match('/\b(apres|aft|after)\b/', $t)) { return [$y, $y + 10, true]; }
    return [$y, $y, false];
}

/* ═════ la limite d'un département (table livrée, puis corrections) ═════ */
function ad_corrections(PDO $pdo, bool $fresh = false): array
{
    static $rows = null;
    if ($rows !== null && !$fresh) { return $rows; }
    ad_memo_gen(true);
    $rows = [];
    if (!ad_ready($pdo)) { return $rows; }
    foreach ($pdo->query('SELECT * FROM archives_dispo_corr ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) as $r) { $rows[] = $r; }
    return $rows;
}
/**
 * La limite effective : until (en ligne jusqu'à), confirmed (jusqu'où c'est confirmé : page officielle vérifiée, ou ✓ de la
 * personne), from (registres paroissiaux), la source et ce que la personne a corrigé.
 */
function ad_limit(PDO $pdo, string $dept, string $key, string $commune = ''): ?array
{
    static $memo = [], $gen = -1;
    if ($gen !== ad_memo_gen()) { $memo = []; $gen = ad_memo_gen(); }
    $mk = spl_object_id($pdo) . "\x1f" . $dept . "\x1f" . $key . "\x1f" . $commune;
    if (array_key_exists($mk, $memo)) { return $memo[$mk]; }
    if (count($memo) > 50000) { $memo = []; }
    return $memo[$mk] = ad_limit_raw($pdo, $dept, $key, $commune);
}
function ad_limit_raw(PDO $pdo, string $dept, string $key, string $commune = ''): ?array
{
    $cfg = ad_config()['departements'][$dept]['acts'][$key] ?? null;
    $lim = $cfg ? ['until' => $cfg['until'], 'from' => $cfg['from'], 'confirmed' => ($cfg['verified'] && $cfg['confidence'] === 'officielle') ? $cfg['until'] : null,
        'source' => $cfg['source'], 'checked' => $cfg['checked'], 'confidence' => $cfg['confidence'], 'verified' => $cfg['verified'], 'note' => $cfg['note'], 'origin' => 'lcnda', 'mine' => []] : null;
    $cf = ad_fold($commune);
    foreach (ad_corrections($pdo) as $c) {
        if ((string) $c['dept_code'] !== $dept || (string) $c['act_key'] !== $key) { continue; }
        if ((string) $c['commune'] !== '' && (string) $c['commune'] !== $cf) { continue; }
        $y = (int) $c['year'];
        $lim ??= ['until' => null, 'from' => null, 'confirmed' => null, 'source' => '', 'checked' => '', 'confidence' => '', 'verified' => false, 'note' => '', 'origin' => 'moi', 'mine' => []];
        $v = (string) $c['verdict'];
        if ($v === 'yes') { $lim['until'] = max((int) $lim['until'], $y); $lim['confirmed'] = max((int) $lim['confirmed'], $y); }
        elseif ($v === 'no') { $lim['until'] = $lim['until'] === null ? $y - 1 : min((int) $lim['until'], $y - 1); $lim['confirmed'] = $lim['confirmed'] === null ? null : min((int) $lim['confirmed'], $y - 1); }
        elseif ($v === 'limit') { $lim['until'] = $y; $lim['confirmed'] = $y; if ((string) $c['url'] !== '') { $lim['source'] = (string) $c['url']; } }
        else { continue; } // « pas trouvé dans le registre » : la limite ne bouge pas
        if ($lim['origin'] === 'lcnda') { $lim['origin'] = 'moi'; }
        $lim['mine'][] = ['id' => (int) $c['id'], 'verdict' => $v, 'year' => $y, 'commune' => (string) $c['commune_label'], 'about' => (string) $c['about'], 'date' => substr((string) $c['created_at'], 0, 10)];
    }
    return $lim;
}

/** le « numéro de version » des tables (livrée, corrections) : les calculs gardés par lieu ou par limite repartent à zéro s'il change */
function ad_memo_gen(bool $bump = false): int
{
    static $g = 0;
    if ($bump) { $g++; }
    return $g;
}
/**
 * Ce que la pastille d'un acte tire de son seul lieu (ad_status) : pays (un lieu qui est lui-même un pays étranger,
 * « Pologne » sans pays noté, compte comme l'étranger), à l'étranger ou non, à qui demander alors, département, site,
 * commune. Gardé par lieu.
 */
function ad_place_info(string $place, string $county, string $countryRaw, string $admin2): array
{
    static $memo = [], $gen = -1;
    if ($gen !== ad_memo_gen()) { $memo = []; $gen = ad_memo_gen(); }
    $mk = $place . "\x1f" . $county . "\x1f" . $countryRaw . "\x1f" . $admin2;
    if (isset($memo[$mk])) { return $memo[$mk]; }
    if (count($memo) > 50000) { $memo = []; }
    $out = ['abroad' => false, 'who' => '', 'country' => '', 'noplace' => false, 'code' => '', 'dept' => null, 'site' => '', 'commune' => ''];
    $country = trim($countryRaw);
    $first = trim((string) preg_replace('/\s*,.*$/', '', $place));
    if (($country === '' || preg_match('/^(france|fr|fra)$/i', $country)) && $first !== '' && preg_match(AD_FOREIGN, $first)) { $country = $first; }
    $out['country'] = $country;
    if ($country !== '' && !preg_match('/^(france|fr|fra)$/i', $country)) {
        $out['abroad'] = true; $out['who'] = preg_match(AD_COLONIES, $country) ? 'anom' : 'scec';
        return $memo[$mk] = $out;
    }
    if (trim($place) === '') { $out['noplace'] = true; return $memo[$mk] = $out; }
    $a = function_exists('gaps_archive_of') ? gaps_archive_of(['name' => $place, 'county' => $county, 'country' => $country, 'admin2_code' => $admin2]) : [];
    if (empty($a['code'])) { return $memo[$mk] = $out; }
    $code = (string) $a['code'];
    $dcfg = ad_config()['departements'][$code] ?? null;
    $site = $dcfg['site'] ?? '';
    if ($site === '' && function_exists('so_department')) { $sd = so_department((string) $a['department'], $place); $site = $sd['url'] ?? ''; }
    $out['code'] = $code;
    $out['dept'] = ['code' => $code, 'name' => (string) $a['department'], 'service' => (string) $a['label'], 'note' => (string) ($dcfg['note'] ?? '')];
    $out['site'] = $site;
    $out['commune'] = trim((string) preg_replace('/\s*[,(].*$/', '', $place));
    return $memo[$mk] = $out;
}

/* ═════ la pastille d'un acte ═════ */
/**
 * $e : {id, tag, date_text, year, place, county, country, admin2_code, linked}. → {status, reason, key, dept, range, limit,
 * open_at, open_year, who, site, linked, …}. $today pour les tests.
 */
function ad_status(PDO $pdo, array $e, ?string $today = null): array
{
    $today = $today ?: date('Y-m-d');
    $nowY = (int) substr($today, 0, 4);
    $tag = (string) ($e['tag'] ?? '');
    $out = ['event_id' => (int) ($e['id'] ?? 0), 'tag' => $tag, 'status' => 'verify', 'reason' => '', 'key' => '', 'dept' => null, 'range' => null, 'limit' => null,
        'open_at' => null, 'open_year' => null, 'who' => '', 'site' => '', 'linked' => !empty($e['linked']), 'place' => (string) ($e['place'] ?? ''), 'date' => (string) ($e['date_text'] ?? '')];
    if (!in_array($tag, AD_TAGS, true)) { $out['reason'] = 'tag'; return $out; }
    $r = ad_range((string) ($e['date_text'] ?? ''), isset($e['year']) && $e['year'] !== null && $e['year'] !== '' ? (int) $e['year'] : null);
    // 🐘 tout ce qui ne dépend que du lieu (pays, département, site, commune) : calculé une fois par lieu (20 000 lieux pour
    // 466 000 actes sur une base de 200 000 fiches), mêmes règles et même ordre qu'avant
    $P = ad_place_info((string) ($e['place'] ?? ''), (string) ($e['county'] ?? ''), (string) ($e['country'] ?? ''), (string) ($e['admin2_code'] ?? ''));
    // à l'étranger : la table ne couvre que les départements français
    if ($P['abroad']) {
        $out['reason'] = 'abroad'; $out['who'] = $P['who']; $out['country'] = $P['country']; $out['range'] = $r;
        if ($out['who'] === 'anom' && $r) { $out['status'] = 'ask'; }
        return $out;
    }
    if (!$r) { $out['reason'] = 'nodate'; return $out; }
    [$lo, $hi, $approx] = $r;
    $out['range'] = [$lo, $hi, $approx];
    if ($P['noplace']) { $out['reason'] = 'noplace'; return $out; }
    if ($P['code'] === '') { $out['reason'] = 'nodept'; return $out; }
    $code = $P['code'];
    $out['dept'] = $P['dept'];
    $out['site'] = $P['site'];
    $commune = $P['commune'];
    $out['commune'] = $commune;
    // la clé de la table : avant 1793, les registres paroissiaux ; ensuite l'état civil (baptême et sépulture : religieux)
    $religious = in_array($tag, ['CHR', 'BAPM', 'BURI'], true);
    $key = $hi <= 1792 ? 'BMS' : ($religious ? '' : ['BIRT' => 'N', 'MARR' => 'M', 'DEAT' => 'D'][$tag]);
    if ($key === '') { $out['status'] = 'ask'; $out['reason'] = 'religious'; $out['who'] = 'diocese'; return $out; }
    $out['key'] = $key;
    // 75 ans (naissance, mariage) : la date la plus tardive de la fourchette (prudent)
    $restricted = false;
    if ($key === 'N' || $key === 'M') {
        static $openMemo = []; // la date d'ouverture ne dépend que de la date écrite (gardée : 466 000 actes, 117 000 dates)
        $ok = ($approx ? '1' : '0') . $hi . "\x1f" . (string) ($e['date_text'] ?? '');
        if (!isset($openMemo[$ok])) {
            if (count($openMemo) > 100000) { $openMemo = []; }
            $exact = !$approx && function_exists('exact_date') ? exact_date((string) ($e['date_text'] ?? '')) : null;
            $openMemo[$ok] = $exact ? date('Y-m-d', (int) strtotime($exact . ' +75 years')) : ($hi + 75) . '-12-31';
        }
        $openAt = $openMemo[$ok];
        $out['open_at'] = $openAt; $out['open_year'] = (int) substr($openAt, 0, 4);
        $restricted = $openAt > $today;
    }
    $askWho = $hi < $nowY - 100 ? 'ad' : 'mairie'; // plus de 100 ans : les registres sont aux Archives départementales
    // Paris avant 1860 : l'état civil a brûlé en 1871 (état civil reconstitué)
    if ($code === '75' && $lo < 1860) { $out['status'] = 'maybe'; $out['reason'] = 'paris1860'; $out['who'] = 'ad'; return $out; }
    $lim = ad_limit($pdo, $code, $key, $commune);
    $out['limit'] = $lim;
    if ($key === 'BMS') { // tout est communicable ; la ligne dit à partir de quand, et jusqu'à 1792 (ou plus)
        $until = $lim ? ($lim['until'] ?? 1792) : null;
        $from = $lim['from'] ?? null;
        if (!$lim) { $out['status'] = 'maybe'; $out['reason'] = 'nolimit'; $out['who'] = 'ad'; return $out; }
        if ($from !== null && $hi < $from) { $out['status'] = 'ask'; $out['reason'] = 'before_from'; $out['who'] = 'ad'; return $out; }
        $conf = $lim['confirmed'] !== null || ($lim['verified'] && $lim['confidence'] === 'officielle');
        if ($hi <= $until && ($from === null || $lo >= $from)) { $out['status'] = $conf ? 'online' : 'maybe'; $out['reason'] = $conf ? 'limit' : 'unconfirmed'; return $out; }
        $out['status'] = 'maybe'; $out['reason'] = 'straddle'; return $out;
    }
    if ($lim && $lim['until'] !== null) {
        $until = (int) $lim['until'];
        $confirmed = $lim['confirmed'];
        if ($hi <= $until) {
            if ($confirmed !== null && $hi <= (int) $confirmed) { $out['status'] = 'online'; $out['reason'] = 'limit'; }
            else { $out['status'] = 'maybe'; $out['reason'] = 'unconfirmed'; }
            return $out;
        }
        if ($lo <= $until) { $out['status'] = 'maybe'; $out['reason'] = 'straddle'; return $out; }
        if ($hi - $until <= 2 && !$restricted && !$lim['mine']) { $out['status'] = 'maybe'; $out['reason'] = 'near'; return $out; }
        $out['status'] = $restricted ? 'restricted' : 'ask'; $out['reason'] = 'after'; $out['who'] = $askWho; return $out;
    }
    // pas de limite vérifiée
    if ($hi < $nowY - 100) { $out['status'] = 'maybe'; $out['reason'] = 'nolimit'; $out['who'] = 'ad'; return $out; }
    $out['status'] = $restricted ? 'restricted' : 'ask'; $out['reason'] = 'recent'; $out['who'] = $askWho;
    return $out;
}

/* ═════ lectures en une fois ═════ */
function ad_event_rows(PDO $pdo, string $where, array $params = []): array
{
    return (function () use ($pdo, $where, $params) {
        $s = $pdo->prepare("SELECT e.id, e.person_id, e.family_id, e.date_text, e.year, t.gedcom_tag AS tag, COALESCE(pl.name,'') AS place, COALESCE(pl.county,'') AS county,
                COALESCE(NULLIF(pl.country,''), NULLIF(e.former_country,''), '') AS country, COALESCE(pl.admin2_code,'') AS admin2_code,
                ((SELECT count(*) FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id) + (SELECT count(*) FROM media_links ml WHERE ml.entity_type='event' AND ml.entity_id=e.id)) AS linked
            FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
            WHERE t.gedcom_tag IN ('BIRT','CHR','BAPM','MARR','DEAT','BURI') AND $where");
        $s->execute($params);
        return $s->fetchAll(PDO::FETCH_ASSOC);
    })();
}
function ad_events(PDO $pdo, array $ids, ?string $today = null): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($i) => $i > 0)));
    $out = [];
    foreach (array_chunk($ids, 800) as $chunk) {
        foreach (ad_event_rows($pdo, 'e.id IN (' . implode(',', $chunk) . ')') as $r) { $out[(int) $r['id']] = ad_status($pdo, $r, $today); }
    }
    return $out;
}
/** les actes d'une personne (et ses mariages), dans l'ordre */
function ad_person(PDO $pdo, int $pid, ?string $today = null): array
{
    $rows = ad_event_rows($pdo, '(e.person_id=? OR e.family_id IN (SELECT id FROM families WHERE partner1_id=? OR partner2_id=?)) ORDER BY COALESCE(e.year,9999), e.id', [$pid, $pid, $pid]);
    return array_map(static fn($r) => ad_status($pdo, $r, $today), $rows);
}
/** le compteur du widget : actes 🟢 pas encore liés à une source (par sorte), et les autres pastilles */
function ad_counts(PDO $pdo, bool $sosaOnly = false, ?string $today = null): array
{
    $where = '1=1';
    if ($sosaOnly) {
        $ids = [];
        $root = (int) $pdo->query('SELECT id FROM persons WHERE is_start=1 ORDER BY id LIMIT 1')->fetchColumn();
        if ($root) {
            $seen = [$root => true]; $todo = [$root];
            while ($todo && count($seen) < 20000) {
                $in = implode(',', array_splice($todo, 0, 500));
                foreach ($pdo->query("SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id IN ($in)")->fetchAll(PDO::FETCH_NUM) as $f) {
                    foreach ($f as $p) { $p = (int) $p; if ($p && !isset($seen[$p])) { $seen[$p] = true; $todo[] = $p; } }
                }
            }
            $ids = array_keys($seen);
        }
        $where = $ids ? '(e.person_id IN (' . implode(',', $ids) . ') OR e.family_id IN (SELECT id FROM families WHERE partner1_id IN (' . implode(',', $ids) . ')))' : '0';
    }
    $n = ['online' => 0, 'maybe' => 0, 'ask' => 0, 'restricted' => 0, 'verify' => 0];
    $todo = ['N' => 0, 'M' => 0, 'D' => 0, 'B' => 0, 'S' => 0];
    $ids = [];
    $today = $today ?: date('Y-m-d');
    foreach (ad_event_rows($pdo, $where) as $r) {
        if (!empty($r['linked'])) { continue; } // un acte déjà lié à une source ou à un média ne compte nulle part
        $s = ad_status($pdo, $r, $today);
        if ($s['status'] === 'online' && !$s['linked']) {
            $k = ['BIRT' => 'N', 'MARR' => 'M', 'DEAT' => 'D', 'CHR' => 'B', 'BAPM' => 'B', 'BURI' => 'S'][$s['tag']];
            $todo[$k]++; if (count($ids) < 2000) { $ids[] = $s['event_id']; }
        } elseif (!$s['linked']) { $n[$s['status']]++; }
    }
    return ['todo' => array_sum($todo), 'by' => $todo, 'others' => $n, 'event_ids' => $ids, 'table' => ad_config()['present']];
}
/** la table des limites, pour l'écran « 🗂 Archives en ligne par département » */
function ad_table(PDO $pdo): array
{
    $cfg = ad_config();
    $deps = function_exists('gaps_departments') ? gaps_departments() : [];
    $rows = [];
    foreach ($deps as $code => $d) {
        $c = $cfg['departements'][$code] ?? null;
        $acts = [];
        foreach (array_keys(AD_ACTS) as $k) {
            $l = ad_limit($pdo, (string) $code, $k);
            if ($l) { $acts[$k] = $l; }
        }
        $rows[] = ['code' => (string) $code, 'name' => $d['name'], 'site' => $c['site'] ?? '', 'note' => $c['note'] ?? '', 'acts' => $acts];
    }
    $mine = array_map(static fn($c) => ['id' => (int) $c['id'], 'dept' => (string) $c['dept_code'], 'act' => (string) $c['act_key'], 'commune' => (string) $c['commune_label'], 'verdict' => (string) $c['verdict'],
        'year' => (int) $c['year'], 'url' => (string) $c['url'], 'about' => (string) $c['about'], 'date' => substr((string) $c['created_at'], 0, 10)], ad_corrections($pdo));
    return ['rows' => $rows, 'mine' => $mine, 'generated' => $cfg['generated'], 'present' => $cfg['present'], 'note' => $cfg['note'], 'acts' => AD_ACTS, 'who' => AD_WHO, 'legifrance' => AD_LEGI];
}

/* ═════ ✓ / ✗ de la personne, ＋ noter la limite, ↶ annuler ═════ */
function ad_write(PDO $pdo, array $in): array
{
    ad_schema($pdo);
    $op = (string) ($in['op'] ?? '');
    if ($op === 'undo') {
        $id = (int) ($in['id'] ?? 0);
        $s = $pdo->prepare('SELECT * FROM archives_dispo_corr WHERE id=?'); $s->execute([$id]);
        $c = $s->fetch(PDO::FETCH_ASSOC);
        if (!$c) { throw new RuntimeException('Correction introuvable.'); }
        if ((int) $c['link_id']) { $pdo->prepare('DELETE FROM source_links WHERE id=?')->execute([(int) $c['link_id']]); }
        if ((int) $c['source_id'] && !(int) $pdo->query('SELECT count(*) FROM source_links WHERE source_record_id=' . (int) $c['source_id'])->fetchColumn()) { $pdo->prepare('DELETE FROM sources WHERE id=?')->execute([(int) $c['source_id']]); }
        $pdo->prepare('DELETE FROM archives_dispo_corr WHERE id=?')->execute([$id]);
        return ['ok' => true];
    }
    if ($op === 'limit') {
        $dept = strtoupper(trim((string) ($in['dept'] ?? '')));
        $act = (string) ($in['act'] ?? '');
        $year = (int) ($in['year'] ?? 0);
        $url = ad_url((string) ($in['url'] ?? ''));
        if (!function_exists('gaps_departments') || !isset(gaps_departments()[$dept])) { throw new LcndaBadInput('Département inconnu.'); }
        if (!isset(AD_ACTS[$act])) { throw new LcndaBadInput('Type d’acte inconnu.'); }
        if ($year < 1500 || $year > (int) date('Y')) { throw new LcndaBadInput('Année incorrecte.'); }
        if ($url === '') { throw new LcndaBadInput('L’adresse de la page qui le dit est obligatoire.'); }
        $pdo->prepare("INSERT INTO archives_dispo_corr(dept_code, act_key, verdict, year, url, about) VALUES(?,?,'limit',?,?,?)")->execute([$dept, $act, $year, $url, mb_substr((string) ($in['about'] ?? ''), 0, 200)]);
        return ['ok' => true, 'id' => (int) $pdo->lastInsertId()];
    }
    if ($op !== 'correct') { throw new LcndaBadInput('Opération inconnue.'); }
    $eid = (int) ($in['event_id'] ?? 0);
    $verdict = (string) ($in['verdict'] ?? '');
    if (!in_array($verdict, ['yes', 'no', 'notfound'], true)) { throw new LcndaBadInput('Réponse inconnue.'); }
    $st = ad_events($pdo, [$eid])[$eid] ?? null;
    if (!$st) { throw new RuntimeException('Événement introuvable.'); }
    if (!$st['dept'] || $st['key'] === '' || !$st['range']) { throw new LcndaBadInput('Cet acte n’a pas de département ou de date : précise d’abord le lieu et la date.'); }
    $year = $verdict === 'no' ? (int) $st['range'][0] : (int) $st['range'][1];
    $communeOnly = ($in['scope'] ?? '') === 'commune';
    $url = ad_url((string) ($in['url'] ?? ''));
    $about = mb_substr(trim((string) ($in['about'] ?? '')), 0, 200);
    $pdo->prepare('INSERT INTO archives_dispo_corr(dept_code, act_key, commune, commune_label, verdict, year, url, event_id, about) VALUES(?,?,?,?,?,?,?,?,?)')
        ->execute([$st['dept']['code'], $st['key'], $communeOnly ? ad_fold((string) $st['commune']) : '', $communeOnly ? (string) $st['commune'] : '', $verdict, $year, $url, $eid, $about]);
    $cid = (int) $pdo->lastInsertId();
    $sourceId = 0; $linkId = 0;
    if ($verdict === 'yes' && !empty($in['add_source'])) {
        $title = mb_substr(trim((string) ($in['source_title'] ?? '')), 0, 300) ?: 'AD ' . $st['dept']['name'] . ', état civil de ' . $st['commune'];
        $pdo->prepare("INSERT INTO sources(title, agency, url) VALUES(?,?,?)")->execute([$title, $st['dept']['service'], $url ?: $st['site']]);
        $sourceId = (int) $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO source_links(entity_type, entity_id, source_record_id, page, note) VALUES('event',?,?,?,?)")->execute([$eid, $sourceId, mb_substr((string) ($in['page'] ?? ''), 0, 120), 'Trouvé en ligne (🏛 Archives en ligne)']);
        $linkId = (int) $pdo->lastInsertId();
        $pdo->prepare('UPDATE archives_dispo_corr SET source_id=?, link_id=? WHERE id=?')->execute([$sourceId, $linkId, $cid]);
    }
    ad_corrections($pdo, true);
    return ['ok' => true, 'id' => $cid, 'source_id' => $sourceId, 'status' => ad_events($pdo, [$eid])[$eid] ?? null];
}

/** les pièces d'un dossier de succession : la pastille de chaque acte */
function ad_succ(PDO $pdo, array $eventIds): array { return ad_events($pdo, $eventIds); }

function ad_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action === 'ad_events') { json_response(['ok' => true, 'items' => ad_events($pdo, explode(',', (string) ($_GET['ids'] ?? '')))]); }
            if ($action === 'ad_person') { json_response(['ok' => true, 'items' => ad_person($pdo, safe_int($_GET['id'] ?? 0)), 'table' => ad_config()['present']]); }
            if ($action === 'ad_counts') { json_response(['ok' => true] + ad_counts($pdo, ($_GET['sosa'] ?? '') === '1')); }
            if ($action === 'ad_table') { json_response(['ok' => true] + ad_table($pdo)); }
        }
        if ($isWrite && $action === 'ad_write') {
            $pdo->beginTransaction();
            try { $out = ad_write($pdo, $payload); $pdo->commit(); } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue.'], 400);
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
