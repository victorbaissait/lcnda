<?php
declare(strict_types=1);

/**
 * 💡 Suggestions de recherche (widget du tableau de bord) : les trous de la lignée Sosa du de cujus, avec où et quand
 * chercher. « Ton Sosa 18, Pierre Martin, n'a pas de décès : regarde les décès et sépultures de Lille entre 1820 et 1840. »
 *  - naissance, mariage ou décès manquant d'un ancêtre, et parents inconnus ;
 *  - la fenêtre d'années vient des dates voisines (mariage, naissance de l'enfant de la lignée, naissance de la personne) ;
 *  - le lieu vient du mariage, de la naissance de l'enfant de la lignée ou du dernier lieu connu ;
 *  - les générations les plus proches d'abord (ce sont les actes les plus faciles à trouver).
 * Les fonctions sosa_positions() (api.php) servent à lire la lignée.
 */

const SUGGESTION_MAX_SOSA = 4095; // 12 générations

function research_suggestions_data(PDO $pdo, int $limit = 40): array
{
    $root = (int) $pdo->query('SELECT id FROM persons ORDER BY is_start DESC, id LIMIT 1')->fetchColumn();
    if (!$root || !function_exists('sosa_positions')) { return ['root_id' => 0, 'items' => [], 'total' => 0]; }
    $positions = array_filter(sosa_positions($pdo, $root, 20000)['positions'] ?? [], static fn($s) => $s <= SUGGESTION_MAX_SOSA, ARRAY_FILTER_USE_KEY);
    ksort($positions);
    if (!$positions) { return ['root_id' => $root, 'items' => [], 'total' => 0]; }
    $ids = array_values(array_unique($positions));
    $marks = implode(',', array_fill(0, count($ids), '?'));

    $people = [];
    $stmt = $pdo->prepare("SELECT id, first_name, last_name, gender, living_status FROM persons WHERE id IN ($marks)");
    $stmt->execute($ids);
    foreach ($stmt->fetchAll() as $p) { $people[(int) $p['id']] = $p + ['birth' => null, 'death' => null, 'last' => null]; }

    // Naissance (ou baptême), décès (ou sépulture), et le dernier événement daté de chaque ancêtre
    $stmt = $pdo->prepare("SELECT e.person_id, e.year, e.date_text, t.gedcom_tag, COALESCE(pl.name,'') AS place, pl.id AS place_id
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id
        WHERE e.person_id IN ($marks) ORDER BY e.year");
    $stmt->execute($ids);
    foreach ($stmt->fetchAll() as $e) {
        $pid = (int) $e['person_id']; $tag = (string) $e['gedcom_tag'];
        $info = ['year' => $e['year'] !== null ? (int) $e['year'] : null, 'text' => (string) $e['date_text'], 'place' => (string) $e['place']];
        if (in_array($tag, ['BIRT', 'CHR', 'BAPM'], true)) { if (!$people[$pid]['birth'] || ($tag === 'BIRT' && !$people[$pid]['birth']['year'])) { $people[$pid]['birth'] = $info; } }
        elseif (in_array($tag, ['DEAT', 'BURI'], true)) { $people[$pid]['death'] ??= $info; }
        if ($info['year'] && (!$people[$pid]['last'] || $info['year'] >= (int) $people[$pid]['last']['year'])) { $people[$pid]['last'] = $info + ['tag' => $tag]; }
    }
    // Mariages des couples de la lignée
    $marriages = [];
    $stmt = $pdo->prepare("SELECT f.partner1_id, f.partner2_id, e.year, e.date_text, COALESCE(pl.name,'') AS place
        FROM families f LEFT JOIN events e ON e.family_id=f.id AND e.event_type_id IN (SELECT id FROM event_types WHERE gedcom_tag IN ('MARR','MRCI','MRRE'))
        LEFT JOIN places pl ON pl.id=e.place_id WHERE f.partner1_id IN ($marks) OR f.partner2_id IN ($marks)");
    $stmt->execute(array_merge($ids, $ids));
    foreach ($stmt->fetchAll() as $m) {
        if ($m['year'] === null && trim((string) $m['date_text']) === '') { continue; }
        $key = min((int) $m['partner1_id'], (int) $m['partner2_id']) . '-' . max((int) $m['partner1_id'], (int) $m['partner2_id']);
        $marriages[$key] ??= ['year' => $m['year'] !== null ? (int) $m['year'] : null, 'text' => (string) $m['date_text'], 'place' => (string) $m['place']];
    }
    $coupleKey = static fn(int $a, int $b) => min($a, $b) . '-' . max($a, $b);
    $now = (int) date('Y');
    $items = [];
    $add = static function (int $sosa, int $pid, string $kind, string $what, ?int $from, ?int $to, string $place, string $why) use (&$items, $now) {
        if ($from !== null && $to !== null && $from > $to) { [$from, $to] = [$to, $from]; }
        if ($to !== null) { $to = min($to, $now); }
        $items[] = ['sosa' => $sosa, 'generation' => (int) floor(log($sosa, 2)) + 1, 'person_id' => $pid, 'kind' => $kind, 'what' => $what,
            'from' => $from, 'to' => $to, 'place' => $place, 'why' => $why];
    };
    $seen = [];
    foreach ($positions as $sosa => $pid) {
        if (isset($seen[$pid]) || !isset($people[$pid])) { continue; } // implexe : une seule fois, au plus petit numéro
        $seen[$pid] = true;
        $p = $people[$pid];
        $childId = $sosa > 1 ? ($positions[intdiv($sosa, 2)] ?? null) : null;
        $child = $childId ? ($people[$childId] ?? null) : null;
        $spouseId = $sosa > 1 ? ($positions[$sosa ^ 1] ?? null) : null;
        $marr = $spouseId ? ($marriages[$coupleKey($pid, $spouseId)] ?? null) : null;
        $female = $p['gender'] === 'female';
        $by = $p['birth']['year'] ?? null;
        $cy = $child['birth']['year'] ?? null;
        $my = $marr['year'] ?? null;
        $placeOf = static fn(?array ...$infos) => array_values(array_filter(array_map(static fn($i) => $i['place'] ?? '', $infos)))[0] ?? '';

        // Naissance manquante : d'après le mariage, sinon la naissance de l'enfant de la lignée
        if (!$p['birth'] && $sosa > 1) {
            if ($my) { $add($sosa, $pid, 'birth', 'naissance', $my - 40, $my - 15, $placeOf($marr, $child['birth'] ?? null), 'mariage en ' . $my); }
            elseif ($cy) { $add($sosa, $pid, 'birth', 'naissance', $cy - ($female ? 45 : 55), $cy - 16, $placeOf($child['birth'] ?? null), 'enfant né en ' . $cy); }
        }
        // Mariage manquant (une fois par couple : chez le père, ou la mère si le père est inconnu)
        if ($sosa > 1 && !$marr && ($sosa % 2 === 0 || !isset($positions[$sosa - 1])) && $cy) {
            $wife = $female ? $p : ($spouseId ? ($people[$spouseId] ?? null) : null);
            $place = $placeOf($wife['birth'] ?? null, $child['birth'] ?? null);
            $add($sosa, $pid, 'marriage', 'mariage', $cy - 12, $cy + 1, $place, 'enfant né en ' . $cy . ($wife && ($wife['birth']['place'] ?? '') !== '' ? ' ; souvent dans la paroisse de l’épouse' : ''));
        }
        // Décès manquant : après le dernier événement connu, jusqu'à ~95 ans
        if (!$p['death'] && $p['living_status'] !== 'living') {
            $base = $by ?? ($my ? $my - 25 : ($cy ? $cy - 30 : null));
            $after = max(array_filter([$p['last']['year'] ?? null, $my, $cy, $by], static fn($v) => $v !== null) ?: [0]);
            if ($base && $base < $now - 100 && $after) {
                $add($sosa, $pid, 'death', 'décès', $after, max($after, $base + 95), $placeOf($p['last'], $marr, $child['birth'] ?? null), ($p['last']['year'] ?? null) ? 'dernière mention en ' . $p['last']['year'] : 'né' . ($female ? 'e' : '') . ' vers ' . $base);
            }
        }
        // Parents inconnus : l'acte de mariage (ou de baptême) les nomme
        if ($sosa * 2 <= SUGGESTION_MAX_SOSA && !isset($positions[$sosa * 2]) && !isset($positions[$sosa * 2 + 1]) && ($my || $by)) {
            $add($sosa, $pid, 'parents', 'parents', $my ? $my - 1 : $by - 1, $my ? $my + 1 : $by + 1, $placeOf($marr, $p['birth']),
                $my ? 'son acte de mariage (' . $my . ') nomme ses parents' : 'son acte de baptême (' . $by . ') nomme ses parents');
        }
    }
    // Les plus proches générations d'abord ; à génération égale, naissance → mariage → décès → parents
    $order = ['birth' => 0, 'marriage' => 1, 'death' => 2, 'parents' => 3];
    usort($items, static fn($a, $b) => [$a['generation'], $order[$a['kind']], $a['sosa']] <=> [$b['generation'], $order[$b['kind']], $b['sosa']]);
    $total = count($items);
    if ($limit > 0) { $items = array_slice($items, 0, max(1, min(200, $limit))); } // 0 : tout (« Que manque-t-il ? »)
    foreach ($items as &$it) {
        $p = $people[$it['person_id']];
        $it['name'] = trim($p['first_name'] . ' ' . $p['last_name']) ?: 'Personne #' . $it['person_id'];
        $it['gender'] = $p['gender'];
    }
    unset($it);
    return ['root_id' => $root, 'items' => $items, 'total' => $total];
}
