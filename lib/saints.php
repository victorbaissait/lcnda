<?php
declare(strict_types=1);

/**
 * Le prénom et le saint du jour. Autrefois, l'enfant recevait souvent le prénom du saint fêté le jour de sa naissance
 * ou de son baptême (souvent le lendemain). Calendrier : celui des almanachs français (calendrier usuel des Postes),
 * avec les grandes fêtes de la Vierge pour « Marie ». Il a varié selon les époques et les diocèses : c'est un indice.
 */
function saints_calendar(): array
{
    static $cal = null;
    if ($cal !== null) { return $cal; }
    $months = [
        1 => ['Marie', 'Basile', 'Geneviève', 'Odilon', 'Édouard', 'Mélaine', 'Raymond', 'Lucien', 'Alix', 'Guillaume', 'Paulin', 'Tatiana', 'Yvette', 'Nina', 'Rémi', 'Marcel', 'Roseline', 'Prisca', 'Marius', 'Sébastien', 'Agnès', 'Vincent', 'Barnard', 'François de Sales', 'Paul', 'Paule', 'Angèle', 'Thomas d’Aquin', 'Gildas', 'Martine', 'Marcelle'],
        2 => ['Ella', 'Marie|Théophane', 'Blaise', 'Véronique', 'Agathe', 'Gaston', 'Eugénie', 'Jacqueline', 'Apolline', 'Arnaud', 'Notre-Dame de Lourdes', 'Félix', 'Béatrice', 'Valentin', 'Claude', 'Julienne', 'Alexis', 'Bernadette', 'Gabin', 'Aimée', 'Pierre Damien', 'Isabelle', 'Lazare', 'Modeste', 'Roméo', 'Nestor', 'Honorine', 'Romain', 'Auguste'],
        3 => ['Aubin', 'Charles le Bon', 'Guénolé', 'Casimir', 'Olive', 'Colette', 'Félicité', 'Jean de Dieu', 'Françoise', 'Vivien', 'Rosine', 'Justine', 'Rodrigue', 'Mathilde', 'Louise', 'Bénédicte', 'Patrice', 'Cyrille', 'Joseph', 'Herbert', 'Clémence', 'Léa', 'Victorien', 'Catherine de Suède', 'Marie|Humbert', 'Larissa', 'Habib', 'Gontran', 'Gwladys', 'Amédée', 'Benjamin'],
        4 => ['Hugues', 'Sandrine', 'Richard', 'Isidore', 'Irène', 'Marcellin', 'Jean-Baptiste de la Salle', 'Julie', 'Gautier', 'Fulbert', 'Stanislas', 'Jules', 'Ida', 'Maxime', 'Paterne', 'Benoît-Joseph', 'Anicet', 'Parfait', 'Emma', 'Odette', 'Anselme', 'Alexandre', 'Georges', 'Fidèle', 'Marc', 'Alida', 'Zita', 'Valérie', 'Catherine de Sienne', 'Robert'],
        5 => ['Joseph', 'Boris', 'Philippe|Jacques', 'Sylvain', 'Judith', 'Prudence', 'Gisèle', 'Désiré', 'Pacôme', 'Solange', 'Estelle', 'Achille', 'Rolande', 'Matthias', 'Denise', 'Honoré', 'Pascal', 'Éric', 'Yves', 'Bernardin', 'Constantin', 'Émile', 'Didier', 'Donatien', 'Sophie', 'Bérenger', 'Augustin de Cantorbéry', 'Germain', 'Aymar', 'Ferdinand', 'Pétronille'],
        6 => ['Justin', 'Blandine', 'Kévin', 'Clotilde', 'Igor', 'Norbert', 'Gilbert', 'Médard', 'Diane', 'Landry', 'Barnabé', 'Guy', 'Antoine de Padoue', 'Élisée', 'Germaine', 'Jean-François Régis', 'Hervé', 'Léonce', 'Romuald', 'Silvère', 'Rodolphe', 'Alban', 'Audrey', 'Jean-Baptiste', 'Prosper', 'Anthelme', 'Fernand', 'Irénée', 'Pierre|Paul', 'Martial'],
        7 => ['Thierry', 'Martinien', 'Thomas', 'Florent', 'Antoine', 'Mariette', 'Raoul', 'Thibault', 'Amandine', 'Ulrich', 'Benoît', 'Olivier', 'Henri|Joël', 'Camille', 'Donald', 'Marie|Carmen', 'Charlotte', 'Frédéric', 'Arsène', 'Marina', 'Victor', 'Marie-Madeleine|Madeleine', 'Brigitte', 'Christine', 'Jacques', 'Anne|Joachim', 'Nathalie', 'Samson', 'Marthe', 'Juliette', 'Ignace'],
        8 => ['Alphonse', 'Julien', 'Lydie', 'Jean-Marie Vianney', 'Abel', 'Transfiguration', 'Gaëtan', 'Dominique', 'Amour', 'Laurent', 'Claire', 'Clarisse', 'Hippolyte', 'Évrard', 'Marie', 'Armel', 'Hyacinthe', 'Hélène', 'Jean Eudes', 'Bernard', 'Christophe', 'Fabrice', 'Rose de Lima', 'Barthélemy', 'Louis', 'Natacha', 'Monique', 'Augustin', 'Sabine', 'Fiacre', 'Aristide'],
        9 => ['Gilles', 'Ingrid', 'Grégoire', 'Rosalie', 'Raïssa', 'Bertrand', 'Reine', 'Marie|Adrien', 'Alain', 'Inès', 'Adelphe', 'Apollinaire', 'Aimé', 'Croix glorieuse', 'Roland', 'Édith', 'Renaud', 'Nadège', 'Émilie', 'Davy', 'Matthieu', 'Maurice', 'Constant', 'Thècle', 'Hermann', 'Côme|Damien', 'Vincent de Paul', 'Venceslas', 'Michel|Gabriel|Raphaël', 'Jérôme'],
        10 => ['Thérèse de l’Enfant-Jésus', 'Léger', 'Gérard', 'François d’Assise', 'Fleur', 'Bruno', 'Serge', 'Pélagie', 'Denis', 'Ghislain', 'Firmin', 'Wilfried', 'Géraud', 'Juste', 'Thérèse d’Avila', 'Edwige', 'Baudouin', 'Luc', 'René', 'Adeline', 'Céline', 'Élodie', 'Jean de Capistran', 'Florentin', 'Crépin', 'Dimitri', 'Émeline', 'Simon|Jude', 'Narcisse', 'Bienvenue', 'Quentin'],
        11 => ['Toussaint', 'Défunts', 'Hubert', 'Charles', 'Sylvie', 'Bertille', 'Carine', 'Geoffroy', 'Théodore', 'Léon', 'Martin', 'Christian', 'Brice', 'Sidoine', 'Albert', 'Marguerite', 'Élisabeth', 'Aude', 'Tanguy', 'Edmond', 'Marie', 'Cécile', 'Clément', 'Flora', 'Catherine', 'Delphine', 'Séverin', 'Jacques de la Marche', 'Saturnin', 'André'],
        12 => ['Florence', 'Viviane', 'François-Xavier', 'Barbara|Barbe', 'Gérald', 'Nicolas', 'Ambroise', 'Marie', 'Pierre Fourier', 'Romaric', 'Daniel', 'Jeanne-Françoise de Chantal', 'Lucie', 'Odile', 'Ninon', 'Alice', 'Gaël', 'Gatien', 'Urbain', 'Théophile', 'Pierre Canisius', 'Françoise-Xavière', 'Armand', 'Adèle', 'Emmanuel', 'Étienne', 'Jean', 'Innocents', 'David', 'Roger', 'Sylvestre'],
    ];
    $cal = [];
    foreach ($months as $m => $days) {
        foreach ($days as $i => $names) { $cal[sprintf('%02d-%02d', $m, $i + 1)] = explode('|', $names); }
    }
    return $cal;
}

/** Fêtes sans prénom (Toussaint, Transfiguration…) : affichées, jamais comparées à un prénom. */
function saint_is_feast(string $name): bool
{
    return in_array($name, ['Toussaint', 'Défunts', 'Transfiguration', 'Croix glorieuse', 'Innocents', 'Notre-Dame de Lourdes'], true);
}

function saint_fold(string $s): string
{
    return trim(preg_replace('/[^a-z]+/', ' ', strtolower(ascii_fold($s))));
}

/** Prénoms que « porte » un saint : « Jean-Baptiste de la Salle » → jean baptiste, jean, baptiste. */
function saint_name_keys(string $saint): array
{
    if (saint_is_feast($saint)) { return []; }
    $main = preg_split('/\s+(?:de|d|du|des|la|le|l)\s+|\s+(?:d’|d\')/u', $saint)[0];
    $main = preg_replace('/\s+(Damien|Eudes|Vianney|Régis|Fourier|Canisius|le Bon)$/u', '', $main);
    $full = saint_fold($main);
    $keys = [$full];
    foreach (explode(' ', $full) as $part) { if (strlen($part) > 2) { $keys[] = $part; } }
    return array_values(array_unique(array_filter($keys)));
}

/** Le saint du jour qui correspond à l'un des prénoms (null sinon). */
function saint_matching(string $firstNames, int $month, int $day): ?string
{
    $cal = saints_calendar();
    $saints = $cal[sprintf('%02d-%02d', $month, $day)] ?? [];
    $given = saint_fold($firstNames);
    if ($given === '') { return null; }
    $words = explode(' ', $given);
    foreach ($saints as $saint) {
        foreach (saint_name_keys($saint) as $key) {
            if ($key === $given || in_array($key, $words, true) || (str_contains($key, ' ') && str_contains(' ' . $given . ' ', ' ' . $key . ' '))) { return $saint; }
        }
    }
    return null;
}

/** Jours où l'on fête un prénom (pour une naissance sans date) : « Martin » → [['11-11','Martin']]. */
function saint_days_for_name(string $firstName): array
{
    $first = saint_fold(preg_split('/[\s]+/u', trim($firstName))[0] ?? '');
    if ($first === '') { return []; }
    $out = [];
    foreach (saints_calendar() as $md => $saints) {
        foreach ($saints as $saint) { if (in_array($first, saint_name_keys($saint), true) && saint_fold($saint) !== '') { $out[] = [$md, $saint]; } }
    }
    return $out;
}

function saint_day_label(string $md): string
{
    static $mois = [1 => 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    [$m, $d] = array_map('intval', explode('-', $md));
    return ($d === 1 ? '1er' : (string) $d) . ' ' . $mois[$m];
}

/** Jour et mois d'un événement de naissance ou de baptême. */
function saint_event_days(PDO $pdo, int $personId): array
{
    $stmt = $pdo->prepare("SELECT t.gedcom_tag, e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.date_text<>'' ORDER BY e.year");
    $stmt->execute([$personId]);
    $days = [];
    foreach ($stmt->fetchAll() as $row) {
        $md = dashboard_month_day((string) $row['date_text']);
        if ($md && $md[0] >= 1 && $md[0] <= 12 && $md[1] >= 1 && $md[1] <= 31) {
            $kind = $row['gedcom_tag'] === 'BIRT' ? 'birth' : 'baptism';
            $days[$kind] ??= $md;
        }
    }
    $stmt->closeCursor();
    return $days;
}

/**
 * Pour une fiche : « Né le 24 juin, prénommé Jean : saint Jean-Baptiste ». On regarde le jour de la naissance, celui du
 * baptême, et le lendemain de la naissance (baptême du lendemain non saisi). Sans date : les jours de fête du prénom.
 */
function person_saint_info(PDO $pdo, array $person): ?array
{
    $first = trim((string) ($person['first_name'] ?? '') . ' ' . (string) ($person['middle_name'] ?? ''));
    if ($first === '') { return null; }
    $female = ($person['gender'] ?? '') === 'female';
    $days = saint_event_days($pdo, (int) $person['id']);
    $tries = [];
    if (isset($days['birth'])) { $tries[] = ['birth', $days['birth'], $female ? 'Née' : 'Né']; }
    if (isset($days['baptism'])) { $tries[] = ['baptism', $days['baptism'], $female ? 'Baptisée' : 'Baptisé']; }
    if (isset($days['birth'])) {
        $next = (new DateTimeImmutable(sprintf('2001-%02d-%02d', $days['birth'][0], min($days['birth'][1], 28))))->modify('+1 day');
        if ($days['birth'][1] <= 28) { $tries[] = ['next', [(int) $next->format('n'), (int) $next->format('j')], $female ? 'Née la veille' : 'Né la veille']; }
    }
    foreach ($tries as [$kind, [$m, $d], $verb]) {
        $saint = saint_matching($first, $m, $d);
        if ($saint) {
            $md = sprintf('%02d-%02d', $m, $d);
            $label = $kind === 'next'
                ? sprintf('%s de la Saint-%s (%s), prénommé%s %s', $verb, $saint, saint_day_label($md), $female ? 'e' : '', $first)
                : sprintf('%s le %s, prénommé%s %s : saint%s %s', $verb, saint_day_label($md), $female ? 'e' : '', $first, saint_is_female_name($saint) ? 'e' : '', $saint);
            return ['matched' => true, 'kind' => $kind, 'saint' => $saint, 'day' => $md, 'label' => $label];
        }
    }
    if (!$days) {
        $hints = saint_days_for_name($first);
        if ($hints && count($hints) <= 3) {
            $parts = array_map(static fn($h) => saint_day_label($h[0]) . ' (saint' . (saint_is_female_name($h[1]) ? 'e' : '') . ' ' . $h[1] . ')', $hints);
            return ['matched' => false, 'hint' => true, 'days' => array_column($hints, 0),
                'label' => 'Prénom fêté le ' . implode(' ou le ', $parts) . ' : piste possible pour une naissance ou un baptême autour de ce jour.'];
        }
    }
    return null;
}

function saint_is_female_name(string $saint): bool
{
    static $female = ['Marie', 'Geneviève', 'Alix', 'Tatiana', 'Yvette', 'Nina', 'Roseline', 'Prisca', 'Agnès', 'Paule', 'Angèle', 'Martine', 'Marcelle', 'Ella', 'Véronique', 'Agathe', 'Eugénie', 'Jacqueline', 'Apolline', 'Béatrice', 'Julienne', 'Bernadette', 'Aimée', 'Isabelle', 'Honorine', 'Olive', 'Colette', 'Félicité', 'Françoise', 'Rosine', 'Justine', 'Mathilde', 'Louise', 'Bénédicte', 'Clémence', 'Léa', 'Catherine', 'Larissa', 'Gwladys', 'Sandrine', 'Irène', 'Julie', 'Ida', 'Emma', 'Odette', 'Alida', 'Zita', 'Valérie', 'Judith', 'Prudence', 'Gisèle', 'Solange', 'Estelle', 'Rolande', 'Denise', 'Sophie', 'Pétronille', 'Blandine', 'Clotilde', 'Diane', 'Germaine', 'Audrey', 'Mariette', 'Amandine', 'Camille', 'Charlotte', 'Marina', 'Marie-Madeleine', 'Madeleine', 'Brigitte', 'Christine', 'Anne', 'Nathalie', 'Marthe', 'Juliette', 'Lydie', 'Claire', 'Clarisse', 'Hélène', 'Rose', 'Natacha', 'Monique', 'Sabine', 'Ingrid', 'Rosalie', 'Raïssa', 'Reine', 'Inès', 'Édith', 'Nadège', 'Émilie', 'Thècle', 'Thérèse', 'Fleur', 'Pélagie', 'Edwige', 'Adeline', 'Céline', 'Élodie', 'Émeline', 'Bienvenue', 'Sylvie', 'Bertille', 'Carine', 'Marguerite', 'Élisabeth', 'Aude', 'Cécile', 'Flora', 'Delphine', 'Florence', 'Viviane', 'Barbara', 'Barbe', 'Lucie', 'Odile', 'Ninon', 'Alice', 'Jeanne', 'Adèle', 'Carmen'];
    $first = preg_split('/[\s-]+/u', $saint)[0];
    return in_array($saint, $female, true) || in_array($first, $female, true);
}

/** Widget : le(s) saint(s) du jour et les personnes nées ou baptisées ce jour-là (toutes années). */
function saint_of_day_data(PDO $pdo, int $month, int $day): array
{
    $md = sprintf('%02d-%02d', $month, $day);
    $saints = saints_calendar()[$md] ?? [];
    $rows = $pdo->query("SELECT e.person_id, e.date_text, e.year, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.person_id IS NOT NULL AND e.date_text<>''")->fetchAll();
    $ids = [];
    foreach ($rows as $r) {
        $d = dashboard_month_day((string) $r['date_text']);
        if ($d && $d[0] === $month && $d[1] === $day) { $ids[(int) $r['person_id']] = $r['gedcom_tag'] === 'BIRT' ? 'birth' : 'baptism'; }
    }
    $people = [];
    if ($ids) {
        $chunk = array_slice(array_keys($ids), 0, 400);
        $stmt = $pdo->prepare(person_select() . ' WHERE p.id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
        $stmt->execute($chunk);
        foreach ($stmt->fetchAll() as $p) {
            $first = trim((string) $p['first_name'] . ' ' . (string) ($p['middle_name'] ?? ''));
            $people[] = ['person' => $p, 'kind' => $ids[(int) $p['id']], 'named_after' => $first !== '' ? saint_matching($first, $month, $day) : null];
        }
        $stmt->closeCursor();
        usort($people, static fn($a, $b) => [(bool) $b['named_after'], (int) ($a['person']['birth_year'] ?? 0)] <=> [(bool) $a['named_after'], (int) ($b['person']['birth_year'] ?? 0)]);
    }
    return ['day' => $md, 'day_label' => saint_day_label($md), 'saints' => $saints, 'people' => array_slice($people, 0, 40), 'people_total' => count($people),
        'named_after' => count(array_filter($people, static fn($p) => $p['named_after']))];
}

/** Statistiques : part des enfants prénommés d'après le saint de leur naissance ou baptême, par époque et par famille,
 * et la liste des personnes concernées (date, saint, jour retenu) pour les voir et les trier. */
function saint_stats_data(PDO $pdo): array
{
    $rows = $pdo->query("SELECT p.id, p.first_name, COALESCE(p.middle_name,'') AS middle_name, COALESCE(p.last_name,'') AS last_name, COALESCE(p.gender,'') AS gender,
            e.date_text, e.year, t.gedcom_tag
        FROM persons p JOIN events e ON e.person_id=p.id JOIN event_types t ON t.id=e.event_type_id
        WHERE t.gedcom_tag IN ('BIRT','CHR','BAPM') AND e.date_text<>'' AND COALESCE(p.first_name,'')<>'' ORDER BY p.id, e.year")->fetchAll();
    $byPerson = [];
    foreach ($rows as $r) {
        $md = dashboard_month_day((string) $r['date_text']);
        if (!$md || $md[0] < 1 || $md[0] > 12 || $md[1] < 1 || $md[1] > 31) { continue; }
        $id = (int) $r['id'];
        $byPerson[$id] ??= ['first' => trim($r['first_name'] . ' ' . $r['middle_name']), 'first_name' => (string) $r['first_name'], 'last' => $r['last_name'],
            'gender' => $r['gender'], 'year' => (int) $r['year'], 'days' => []];
        if (!$byPerson[$id]['year'] && (int) $r['year']) { $byPerson[$id]['year'] = (int) $r['year']; }
        $kind = $r['gedcom_tag'] === 'BIRT' ? 'birth' : 'baptism';
        $byPerson[$id]['days'][] = [$md[0], $md[1], $kind, (string) $r['date_text'], (int) $r['year']];
        if ($kind === 'birth') {
            // lendemain de la naissance (baptême du lendemain non saisi), y compris en fin de mois
            $next = (new DateTimeImmutable(sprintf('2000-%02d-01', $md[0])))->modify('+' . $md[1] . ' day');
            $byPerson[$id]['days'][] = [(int) $next->format('n'), (int) $next->format('j'), 'next', (string) $r['date_text'], (int) $r['year']];
        }
    }
    $periods = []; $families = []; $people = []; $matched = 0;
    foreach ($byPerson as $id => $p) {
        $match = null;
        foreach ($p['days'] as [$m, $d, $kind, $dateText, $year]) {
            $saint = saint_matching($p['first'], $m, $d);
            if ($saint) { $match = ['saint' => $saint, 'kind' => $kind, 'day' => sprintf('%02d-%02d', $m, $d), 'date_text' => $dateText, 'year' => $year]; break; }
        }
        $first = $p['days'][0];
        $matched += $match ? 1 : 0;
        $period = null;
        if ($p['year'] > 0) {
            $period = (int) (floor($p['year'] / 25) * 25);
            $periods[$period]['total'] = ($periods[$period]['total'] ?? 0) + 1;
            $periods[$period]['matched'] = ($periods[$period]['matched'] ?? 0) + ($match ? 1 : 0);
        }
        $fam = trim($p['last']) !== '' ? mb_convert_case(mb_strtolower($p['last']), MB_CASE_TITLE) : '';
        if ($fam !== '') {
            $families[$fam]['total'] = ($families[$fam]['total'] ?? 0) + 1;
            $families[$fam]['matched'] = ($families[$fam]['matched'] ?? 0) + ($match ? 1 : 0);
        }
        $people[] = ['id' => $id, 'first_name' => $p['first'], 'last_name' => $p['last'], 'gender' => $p['gender'], 'family' => $fam,
            'period' => $period === null ? '' : $period . '–' . ($period + 24),
            'date_text' => $match['date_text'] ?? $first[3], 'year' => $match['year'] ?? $first[4] ?: $p['year'],
            'day' => $match['day'] ?? sprintf('%02d-%02d', $first[0], $first[1]),
            'day_label' => saint_day_label($match['day'] ?? sprintf('%02d-%02d', $first[0], $first[1])),
            'kind' => $match['kind'] ?? $first[2], 'saint' => $match['saint'] ?? null,
            'saint_label' => $match ? 'saint' . (saint_is_female_name($match['saint']) ? 'e' : '') . ' ' . $match['saint'] : null];
    }
    ksort($periods);
    $fmt = static fn($k, $v) => ['label' => (string) $k, 'total' => $v['total'], 'matched' => $v['matched'], 'percent' => $v['total'] ? round(100 * $v['matched'] / $v['total'], 1) : 0];
    $periodRows = []; foreach ($periods as $k => $v) { $periodRows[] = $fmt($k . '–' . ($k + 24), $v); }
    $familyRows = []; foreach ($families as $k => $v) { if ($v['total'] >= 8) { $familyRows[] = $fmt($k, $v); } }
    usort($familyRows, static fn($a, $b) => $b['total'] <=> $a['total']);
    usort($people, static fn($a, $b) => [(int) $a['year'] ?: 9999, $a['day'], $a['id']] <=> [(int) $b['year'] ?: 9999, $b['day'], $b['id']]); // sans année : à la fin
    return ['total' => count($byPerson), 'matched' => $matched, 'periods' => $periodRows, 'families' => array_slice($familyRows, 0, 40), 'people' => $people];
}
