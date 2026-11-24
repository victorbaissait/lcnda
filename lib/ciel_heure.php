<?php
declare(strict_types=1);

/**
 * 🕰️ La vraie heure de l'acte — ce que la page a besoin de savoir pour remettre une heure écrite à l'heure d'aujourd'hui :
 * la date lue (« 12 mars 1877 » → 1877-03-12) et le lieu (commune, pays, département, coordonnées).
 * Le calcul lui-même est fait dans la page (assets/js/heritage-ciel-heure.js, règles de tzdata : assets/data/tz-europe-amerique.json).
 *
 * GET ciel_heure_ctx&date=…&place_id=…   → {date, place}
 * GET ciel_heure_ctx&person_id=…         → {date, time, place} de sa naissance (ou de son baptême), pour 🌌 Le ciel de naissance
 */

function ciel_heure_place(PDO $pdo, int $id): ?array
{
    if ($id <= 0) { return null; }
    $s = $pdo->prepare('SELECT id, name, subdivision, county, state, country, latitude, longitude FROM places WHERE id=?');
    $s->execute([$id]);
    $p = $s->fetch(PDO::FETCH_ASSOC);
    if (!$p) { return null; }
    return ['id' => (int) $p['id'], 'name' => (string) $p['name'], 'county' => (string) ($p['county'] ?? ''), 'state' => (string) ($p['state'] ?? ''),
        'subdivision' => (string) ($p['subdivision'] ?? ''), 'country' => (string) ($p['country'] ?? ''),
        'lat' => $p['latitude'] !== null && $p['latitude'] !== '' ? (float) $p['latitude'] : null, 'lng' => $p['longitude'] !== null && $p['longitude'] !== '' ? (float) $p['longitude'] : null];
}

/** « 12 mars 1877 » → « 1877-03-12 » (null si le jour n'est pas connu) */
function ciel_heure_date(string $text): ?string
{
    $text = trim($text);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $text)) { return $text; }
    $p = cal_parse_date($text);
    if (!$p || $p[1] === null || $p[2] === null) { return null; }
    return sprintf('%04d-%02d-%02d', $p[0], $p[1], $p[2]);
}

function ciel_heure_ctx(PDO $pdo, array $q): array
{
    $pid = safe_int($q['person_id'] ?? 0);
    if ($pid) {
        $s = $pdo->prepare("SELECT e.date_text, e.sort_date, e.event_time, e.place_id, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id
            WHERE e.person_id=? AND t.gedcom_tag IN ('BIRT','CHR','BAPM') ORDER BY t.gedcom_tag='BIRT' DESC, e.id LIMIT 1");
        $s->execute([$pid]);
        $e = $s->fetch(PDO::FETCH_ASSOC);
        if (!$e) { return ['ok' => false]; }
        $date = ciel_heure_date((string) $e['date_text']) ?? (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $e['sort_date']) ? (string) $e['sort_date'] : null);
        return ['ok' => true, 'tag' => (string) $e['gedcom_tag'], 'date' => $date, 'time' => (string) ($e['event_time'] ?? ''), 'place' => ciel_heure_place($pdo, (int) $e['place_id'])];
    }
    return ['ok' => true, 'date' => ciel_heure_date((string) ($q['date'] ?? '')), 'place' => ciel_heure_place($pdo, safe_int($q['place_id'] ?? 0))];
}
