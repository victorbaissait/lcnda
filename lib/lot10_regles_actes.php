<?php
declare(strict_types=1);

/**
 * ⚖️ Les règles de sa vie (lot 10) — serveur de assets/js/heritage-lot10-regles-actes.js.
 * Presque tout est livré dans l'app (assets/data/l10-*.json.gz, lus par la page) ; ce fichier sert seulement :
 *  - GET l10_mariages&place_id=|insee=|name=   💒 les dates des mariages célébrés dans une commune (toutes les fiches de la base,
 *    sans nom ni personne : seulement « AAAA-MM-JJ », pour compter les mariages par mois et repérer les temps clos).
 * Lecture seule. Rien ne part sur Internet.
 */

require_once __DIR__ . '/commune_culture.php'; // cc_find_insee

function l10_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'l10_mariages' => l10_mariages($pdo, $q),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}

/** les lieux de la base qui sont cette commune : le lieu choisi, et ceux qui ont le même code INSEE (ou le même nom) */
function l10_place_ids(PDO $pdo, array $q): array
{
    $pid = safe_int($q['place_id'] ?? 0);
    $insee = preg_match('/^\d[\dAB]\d{3}$/', (string) ($q['insee'] ?? '')) ? (string) $q['insee'] : '';
    $name = safe_text($q['name'] ?? '');
    $pc = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $hasInsee = in_array('admin4_code', $pc, true);
    if ($pid && $insee === '' && $hasInsee) {
        $s = $pdo->prepare('SELECT COALESCE(admin4_code,\'\') FROM places WHERE id=?'); $s->execute([$pid]);
        $v = (string) $s->fetchColumn(); if (preg_match('/^\d[\dAB]\d{3}$/', $v)) { $insee = $v; }
    }
    $ids = $pid ? [$pid] : [];
    if ($insee !== '' && $hasInsee) {
        $s = $pdo->prepare('SELECT id FROM places WHERE admin4_code=?'); $s->execute([$insee]);
        $ids = array_merge($ids, array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN)));
    }
    if (!$ids && $name !== '') {
        $s = $pdo->prepare('SELECT id FROM places WHERE name=? COLLATE NOCASE'); $s->execute([$name]);
        $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    }
    return array_values(array_unique(array_filter($ids)));
}

/** GET l10_mariages : {ok, dates: ['1754-11-12', …], months_only: [['1754', 11], …], undated, total} (5 000 au plus) */
function l10_mariages(PDO $pdo, array $q): array
{
    $ids = l10_place_ids($pdo, $q);
    if (!$ids) { return ['ok' => true, 'dates' => [], 'months' => [], 'undated' => 0, 'total' => 0]; }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $s = $pdo->prepare("SELECT e.sort_date, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id
        WHERE t.gedcom_tag IN ('MARR','MARB') AND e.place_id IN ($in) AND COALESCE(e.is_private,0)=0 LIMIT 5000");
    $s->execute($ids);
    $dates = []; $months = []; $undated = 0; $total = 0;
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $total++;
        if (preg_match('/^(\d{4})-(\d\d)-(\d\d)/', (string) $r['sort_date'], $m) && $m[2] !== '00') {
            if ($m[3] !== '00') { $dates[] = $m[1] . '-' . $m[2] . '-' . $m[3]; } else { $months[] = [(int) $m[1], (int) $m[2]]; }
        } else { $undated++; }
    }
    sort($dates);
    return ['ok' => true, 'dates' => $dates, 'months' => $months, 'undated' => $undated, 'total' => $total];
}
