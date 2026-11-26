<?php
declare(strict_types=1);
/**
 * LCNDA — 🧭 Histoire autour (écran : assets/js/heritage-histoire-autour.js ; données : assets/data/ha-*.json.gz,
 * fabriquées par scripts/histoire-autour/build.py).
 *
 * Le serveur ne fait qu'une chose : rassembler, en lecture seule, ce que le navigateur doit savoir d'une personne pour
 * chercher autour d'elle (batailles près de ses lieux, voies romaines, institutions où elle est née ou morte, le navire
 * du marin, les phares du gardien, les catastrophes loin de la France) :
 *   ha_life?id=N → {person: {id, first, gender, birth, death, kind}, places: [...], events: [...], jobs: [...], text}
 * Tout le reste (les rapprochements) se calcule dans le navigateur à partir des fichiers livrés avec l'app.
 * Rien n'est écrit dans la base.
 */

function ha_cols(PDO $pdo, string $table): array
{
    static $memo = [];
    return $memo[$table] ??= array_column($pdo->query("PRAGMA table_info($table)")->fetchAll(PDO::FETCH_ASSOC), 'name');
}

function ha_year(array $e): ?int
{
    if (is_numeric($e['year'] ?? null) && (int) $e['year'] !== 0) { return (int) $e['year']; }
    return preg_match('/^(-?\d{4})/', (string) ($e['sort_date'] ?? ''), $m) ? (int) $m[1] : null;
}

/** le texte d'une note, sans balises, sur une ligne */
function ha_plain(string $s): string
{
    $s = html_entity_decode(strip_tags(preg_replace('/<(br|\/p|\/div|\/li)[^>]*>/i', "\n", $s) ?? $s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim((string) preg_replace('/[ \t]+/u', ' ', $s));
}

/** ce qu'il faut savoir d'une personne pour chercher autour d'elle (lecture seule) */
function ha_life(PDO $pdo, int $id): array
{
    $pc = ha_cols($pdo, 'persons');
    $s = $pdo->prepare('SELECT * FROM persons WHERE id=?');
    $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { throw new RuntimeException(function_exists('i18n_t') ? i18n_t('Fiche introuvable.') : 'Fiche introuvable.'); }
    $kiosk = function_exists('kiosk_state') && !empty(kiosk_state()['on']);
    $ec = ha_cols($pdo, 'events');
    $priv = in_array('is_private', $ec, true) ? ', e.is_private' : ', 0 AS is_private';
    $plc = ha_cols($pdo, 'places');
    $insee = in_array('admin4_code', $plc, true) ? ', pl.admin4_code AS insee' : ", '' AS insee";
    $q = $pdo->prepare("SELECT e.id, e.year, e.sort_date, e.date_text, e.address, e.title, e.description, e.cause, e.agency$priv,
            t.gedcom_tag AS tag, t.slug, t.label AS type_label, pl.id AS place_id, pl.name AS place, pl.county, pl.state, pl.country, pl.latitude AS lat, pl.longitude AS lon$insee
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        WHERE e.person_id=? OR (e.scope='family' AND (f.partner1_id=? OR f.partner2_id=?)) ORDER BY COALESCE(e.year, 9999), e.id");
    $q->execute([$id, $id, $id]);
    $events = [];
    $places = [];
    $texts = [];
    $jobs = [];
    $addJob = static function (string $t, ?int $y) use (&$jobs) {
        $t = trim($t);
        if ($t === '' || mb_strlen($t) > 120) { return; }
        foreach ($jobs as $j) { if (mb_strtolower($j['text']) === mb_strtolower($t)) { return; } }
        $jobs[] = ['text' => $t, 'year' => $y];
    };
    foreach (preg_split('/\s*[;\/]\s*/u', (string) ($p['occupation'] ?? '')) ?: [] as $t) { $addJob($t, null); }
    $eventIds = [];
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $e) {
        if ($kiosk && !empty($e['is_private'])) { continue; }
        $y = ha_year($e);
        $tag = strtoupper((string) $e['tag']);
        $lat = is_numeric($e['lat']) ? (float) $e['lat'] : null;
        $lon = is_numeric($e['lon']) ? (float) $e['lon'] : null;
        if ($lat !== null && $lon !== null && $lat == 0.0 && $lon == 0.0) { $lat = $lon = null; }
        $eventIds[] = (int) $e['id'];
        $ev = ['id' => (int) $e['id'], 'tag' => $tag, 'type' => (string) $e['type_label'], 'year' => $y, 'date' => (string) ($e['sort_date'] ?? ''), 'date_text' => (string) $e['date_text'],
            'place_id' => $e['place_id'] !== null ? (int) $e['place_id'] : null, 'place' => trim((string) preg_replace('/\s*,.*$/u', '', (string) $e['place'])), 'place_full' => (string) $e['place'],
            'country' => (string) ($e['country'] ?? ''), 'lat' => $lat, 'lon' => $lon, 'insee' => (string) ($e['insee'] ?? ''),
            'address' => (string) $e['address'], 'title' => (string) $e['title'], 'description' => (string) $e['description']];
        $events[] = $ev;
        if ($tag === 'OCCU' || in_array(strtolower((string) $e['slug']), ['occupation', 'profession', 'metier'], true)) { $addJob((string) ($e['title'] ?: $e['description']), $y); }
        foreach (['address', 'title', 'description', 'cause', 'agency'] as $k) { if (trim((string) $e[$k]) !== '') { $texts[] = (string) $e[$k]; } }
        if ($ev['place_id'] !== null && !isset($places[$ev['place_id']])) {
            $places[$ev['place_id']] = ['id' => $ev['place_id'], 'name' => $ev['place'], 'full' => $ev['place_full'], 'country' => $ev['country'], 'lat' => $lat, 'lon' => $lon, 'insee' => $ev['insee'], 'years' => []];
        }
        if ($ev['place_id'] !== null && $y !== null) { $places[$ev['place_id']]['years'][] = $y; }
    }
    // les notes de la fiche et de ses événements (un navire, une adresse d'hospice…)
    $marks = $eventIds ? implode(',', array_fill(0, count($eventIds), '?')) : '';
    $n = $pdo->prepare("SELECT title, body FROM notes WHERE (entity_type='person' AND entity_id=?)" . ($marks ? " OR (entity_type='event' AND entity_id IN ($marks))" : '') . ' LIMIT 200');
    $n->execute(array_merge([$id], $eventIds));
    foreach ($n->fetchAll(PDO::FETCH_ASSOC) as $row) { $texts[] = trim($row['title'] . ' ' . ha_plain((string) $row['body'])); }
    // le recensement (métier) et le dossier militaire (souvent le navire d'un marin)
    try {
        $c = $pdo->prepare('SELECT cm.occupation, cr.year FROM census_members cm JOIN census_records cr ON cr.id=cm.census_id WHERE cm.person_id=?');
        $c->execute([$id]);
        foreach ($c->fetchAll(PDO::FETCH_ASSOC) as $row) { $addJob((string) $row['occupation'], is_numeric($row['year']) ? (int) $row['year'] : null); }
    } catch (Throwable $_) {}
    foreach (['military_data', 'physical_description'] as $k) {
        if (in_array($k, $pc, true) && trim((string) $p[$k]) !== '') {
            $m = json_decode((string) $p[$k], true);
            $texts[] = is_array($m) ? implode(' · ', array_filter(array_map(static fn($v) => is_scalar($v) ? (string) $v : '', iterator_to_array(new RecursiveIteratorIterator(new RecursiveArrayIterator($m)))))) : (string) $p[$k];
        }
    }
    $pick = static function (array $tags) use ($events): ?int { foreach ($tags as $t) { foreach ($events as $e) { if ($e['tag'] === $t && $e['year'] !== null) { return $e['year']; } } } return null; };
    $text = mb_substr(implode("\n", array_filter(array_map('trim', $texts))), 0, 30000);
    return ['ok' => true, 'person' => ['id' => $id, 'first' => trim((string) ($p['first_name'] ?? '')), 'last' => trim((string) ($p['last_name'] ?? '')), 'gender' => (string) ($p['gender'] ?? 'unknown'),
            'kind' => (string) ($p['kind'] ?? ''), 'birth' => $pick(['BIRT', 'BAPM', 'CHR']), 'death' => $pick(['DEAT', 'BURI', 'CREM'])],
        'events' => $events, 'places' => array_values(array_map(static function ($pl) { $ys = $pl['years']; $pl['from'] = $ys ? min($ys) : null; $pl['to'] = $ys ? max($ys) : null; unset($pl['years']); return $pl; }, $places)),
        'jobs' => $jobs, 'text' => $text];
}

function ha_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'ha_life' => ha_life($pdo, safe_int($q['id'] ?? 0)),
        default => throw new RuntimeException('Action inconnue.'),
    };
}
