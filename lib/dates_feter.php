<?php
declare(strict_types=1);

/**
 * 🎂 Dates à fêter (F10 ; widget du tableau de bord, assets/js/heritage-dates-feter.js).
 *
 * Construit sur ce qui existe : les dates des fiches sont lues comme dans le « Calendrier de la famille »
 * (genea_calendar_events, lib/calendars.php : « 3 juillet 1832 », « 03/07/1832 », GEDCOM, conversion grégorienne d'une
 * date julienne ou républicaine) ; les vivants sont reconnus comme pour l'export « Pour partager » (gedcom_share_hidden,
 * lib/gedcom.php : déclarés vivants, ou sans décès et nés il y a moins de 100 ans) ; le Sosa vient de sosa_positions()
 * (api.php) ; une branche = la personne choisie, ses descendants et leurs conjoints (h_descendants, lib/heritage.php).
 * Le rappel « la veille / une semaine avant » est un rappel ordinaire de l'app (save_standalone_reminder), posé par l'écran.
 *
 * GET api.php?action=dates_feter&period=today|week|month&who=all|living|dead&sosa=0|1&branch=ID&kinds=birth,union,death&round=0|1
 *
 * Confidentialité : une fiche confidentielle (is_private) n'apparaît jamais ; en mode consultation 🔒 (la famille regarde),
 * un vivant n'est montré que par son prénom, sans âge ni année.
 */

const DF_PERIODS = ['today' => 0, 'week' => 6, 'month' => 30];
const DF_NOCES = [1 => 'noces de coton', 2 => 'noces de cuir', 5 => 'noces de bois', 10 => 'noces d’étain', 15 => 'noces de cristal', 20 => 'noces de porcelaine', 25 => 'noces d’argent',
    30 => 'noces de perle', 35 => 'noces de rubis', 40 => 'noces d’émeraude', 45 => 'noces de vermeil', 50 => 'noces d’or', 55 => 'noces d’orchidée', 60 => 'noces de diamant', 65 => 'noces de palissandre', 70 => 'noces de platine', 75 => 'noces d’albâtre', 80 => 'noces de chêne'];

/** Vivants et fiches confidentielles : id => 'living' | 'private' (même règle que l'export pour partager). */
function df_hidden_people(PDO $pdo): array
{
    $rows = $pdo->query("SELECT p.id, p.living_status, p.is_private,
            MIN(CASE WHEN t.gedcom_tag IN ('BIRT','CHR','BAPM') THEN e.year END) AS birth_year,
            MIN(CASE WHEN t.gedcom_tag IN ('DEAT','BURI','CREM') THEN e.year END) AS death_year
        FROM persons p LEFT JOIN events e ON e.person_id=p.id LEFT JOIN event_types t ON t.id=e.event_type_id GROUP BY p.id")->fetchAll();
    $marr = [];
    foreach ($pdo->query("SELECT f.partner1_id, f.partner2_id, MIN(e.year) AS y FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE t.gedcom_tag IN ('MARR','MRCI','MRRE') AND e.year IS NOT NULL GROUP BY f.id") as $f) {
        foreach (['partner1_id', 'partner2_id'] as $k) { $id = (int) ($f[$k] ?? 0); if ($id && (!isset($marr[$id]) || (int) $f['y'] < $marr[$id])) { $marr[$id] = (int) $f['y']; } }
    }
    foreach ($rows as &$r) { $r['marr_year'] = $marr[(int) $r['id']] ?? null; }
    unset($r);
    $families = $pdo->query('SELECT id, partner1_id, partner2_id FROM families')->fetchAll();
    $saved = $_GET['death_cutoff_year'] ?? null; unset($_GET['death_cutoff_year']); // pas de délai après décès ici : seulement les vivants
    try { return gedcom_share_hidden($pdo, $rows, $families); } finally { if ($saved !== null) { $_GET['death_cutoff_year'] = $saved; } }
}

function df_first_name(string $first): string
{
    $first = trim($first);
    return $first === '' ? 'Une personne de la famille' : (preg_split('/\s+/u', $first)[0] ?? $first);
}

function df_is_round(string $group, bool $living, int $years): bool
{
    if ($years <= 0) { return false; }
    if ($living) { return $years % 10 === 0 || ($group === 'union' && in_array($years, [25, 75], true)) || ($group === 'birth' && in_array($years, [18, 1], true)); }
    return $years % 50 === 0;
}

function dates_feter_data(PDO $pdo, array $q): array
{
    $period = array_key_exists((string) ($q['period'] ?? ''), DF_PERIODS) ? (string) $q['period'] : 'week';
    $span = DF_PERIODS[$period];
    $who = in_array($q['who'] ?? '', ['all', 'living', 'dead'], true) ? (string) $q['who'] : 'all';
    $onlySosa = ($q['sosa'] ?? '') === '1';
    $onlyRound = ($q['round'] ?? '') === '1';
    $branch = safe_int($q['branch'] ?? 0);
    $kinds = array_values(array_intersect(explode(',', (string) ($q['kinds'] ?? 'birth,union,death')), ['birth', 'union', 'death'])) ?: ['birth', 'union', 'death'];
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    // « aujourd'hui » : ?today=AAAA-MM-JJ pour les essais (comme « Ce jour-là » du mode simple), sinon la date du serveur
    $todayIso = preg_match('/^\d{4}-\d\d-\d\d$/', (string) ($q['today'] ?? '')) && checkdate((int) substr($q['today'], 5, 2), (int) substr($q['today'], 8, 2), (int) substr($q['today'], 0, 4)) ? (string) $q['today'] : date('Y-m-d');
    $today = new DateTimeImmutable($todayIso);

    $hidden = df_hidden_people($pdo);
    $sosas = [];
    if (function_exists('sosa_positions')) {
        $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
        if ($root) { foreach (sosa_positions($pdo, $root, 60000)['personSosas'] as $pid => $list) { $sosas[(int) $pid] = (int) $list[0]; } }
    }
    $inBranch = $branch > 0 ? h_descendants($pdo, [$branch], 60, true) : null;
    $people = [];
    foreach ($pdo->query("SELECT id, first_name, last_name, gender, COALESCE(kind,'person') AS kind FROM persons") as $p) { $people[(int) $p['id']] = $p; }

    $items = []; $counts = ['all' => 0, 'living' => 0, 'dead' => 0, 'round' => 0];
    foreach (genea_calendar_events($pdo)['events'] as $e) {
        $group = $e['group'] === 'union' ? 'union' : $e['group'];
        if (!in_array($group, ['birth', 'union', 'death'], true) || !in_array($group, $kinds, true)) { continue; }
        if (!in_array($e['tag'], ['BIRT', 'MARR', 'DEAT'], true)) { continue; } // une date à fêter : naissance, mariage, décès
        if ($e['approx'] || !$e['m'] || !$e['d'] || !$e['who']) { continue; }
        // la prochaine fois que tombe ce jour (le 29 février se fête le 28 les autres années)
        $hit = null;
        for ($k = 0; $k <= $span; $k++) {
            $day = $today->modify("+{$k} day");
            $m = (int) $day->format('n'); $d = (int) $day->format('j'); $leap = (bool) $day->format('L');
            if ($m === $e['m'] && ($d === $e['d'] || (!$leap && $e['m'] === 2 && $e['d'] === 29 && $d === 28))) { $hit = [$k, $day]; break; }
        }
        if (!$hit) { continue; }
        $whoIds = array_map(static fn($w) => (int) $w['id'], $e['who']);
        if (array_filter($whoIds, static fn($id) => ($hidden[$id] ?? '') === 'private' || (($people[$id]['kind'] ?? 'person') === 'animal'))) { continue; } // jamais une fiche confidentielle
        $livingIds = array_values(array_filter($whoIds, static fn($id) => ($hidden[$id] ?? '') === 'living'));
        $isLiving = $group !== 'death' && count($livingIds) > 0; // un couple dont l'un vit encore : ses noces se fêtent
        if ($who === 'living' && !$isLiving) { continue; }
        if ($who === 'dead' && $isLiving) { continue; }
        if ($onlySosa && !array_filter($whoIds, static fn($id) => isset($sosas[$id]))) { continue; }
        if ($inBranch !== null && !array_filter($whoIds, static fn($id) => isset($inBranch[$id]))) { continue; }
        [$days, $day] = $hit;
        $years = (int) $day->format('Y') - (int) $e['y'];
        if ($years < 0) { continue; }
        $round = df_is_round($group, $isLiving, $years);
        if ($onlyRound && !$round) { continue; }
        $mask = $kiosk && $isLiving; // en consultation : prénom seulement, ni âge ni année
        $persons = array_map(static function ($id) use ($people, $hidden, $sosas, $mask) {
            $p = $people[$id] ?? ['first_name' => '', 'last_name' => '', 'gender' => 'unknown'];
            $living = ($hidden[$id] ?? '') === 'living';
            return ['id' => $mask && $living ? 0 : $id, 'first' => df_first_name((string) $p['first_name']), 'last' => $mask && $living ? '' : trim((string) $p['last_name']),
                'gender' => (string) ($p['gender'] ?? 'unknown'), 'living' => $living, 'sosa' => $mask && $living ? null : ($sosas[$id] ?? null)];
        }, $whoIds);
        $items[] = [
            'event_id' => $mask ? 0 : (int) $e['id'], 'kind' => $group, 'type' => (string) $e['type'], 'date' => $day->format('Y-m-d'), 'days' => $days,
            'years' => $mask ? null : $years, 'year' => $mask ? null : (int) $e['y'], 'living' => $isLiving, 'round' => $mask ? false : $round,
            'noces' => !$mask && $group === 'union' && $isLiving ? (DF_NOCES[$years] ?? '') : '',
            'place' => $mask ? '' : (string) $e['place'], 'persons' => $persons, 'masked' => $mask,
        ];
        $counts['all']++; $counts[$isLiving ? 'living' : 'dead']++; if ($round && !$mask) { $counts['round']++; }
    }
    usort($items, static fn($a, $b) => $a['days'] <=> $b['days'] ?: ($b['round'] <=> $a['round']) ?: ($b['living'] <=> $a['living']) ?: strcmp($a['persons'][0]['first'] ?? '', $b['persons'][0]['first'] ?? ''));
    return ['period' => $period, 'span' => $span, 'today' => $todayIso, 'kiosk' => $kiosk, 'items' => array_slice($items, 0, 300), 'counts' => $counts, 'total' => count($items)];
}
