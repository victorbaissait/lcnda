<?php
declare(strict_types=1);

/**
 * LCNDA — 🗺️ Cartes en plus, vague 2 (maquette docs/design/cartes-nouvelles.html) : les données des cinq nouvelles cartes de
 * Graphiques → Cartes (assets/js/heritage-diagram-cartes-plus2.js). Mode d'emploi : docs/UI.md (« 🗺️ Cartes en plus, vague 2 »).
 *
 *   GET cartes_plus2&what=trades   🔨 les métiers, placés (lieu de l'acte, sinon résidence de l'époque, sinon naissance)
 *   GET cartes_plus2&what=mirror   👫 deux (ou quatre) groupes de personnes → leurs lieux, années, ancêtres des deux côtés
 *   GET cartes_plus2&what=areas    ⭕ les événements des ancêtres, génération par génération (ou siècle, ou une vie)
 *   GET cartes_plus2&what=links    🕸 parrains, marraines, témoins : village de l'acte ↔ village d'où vient le témoin
 *   GET cartes_plus2&what=crises   ⚰️ les décès placés et datés, les crises du 🌍 Monde autour et tes événements locaux
 *
 * Lecture seule. Tout passe par cp_hidden() (lib/cartes_plus.php) : jamais un vivant ni une fiche confidentielle, ni à l'écran
 * ni à l'export (filtré ici, côté serveur, pas seulement caché dans le dessin). Rien de nouveau en base. Aucun appel en ligne.
 * Essais : tests/test-cartes-nouvelles.js.
 */

require_once __DIR__ . '/cartes_plus.php';
require_once __DIR__ . '/diagram_genea.php';
require_once __DIR__ . '/diagram_options.php';

/** un nombre entier borné, lu dans la demande */
function cp2_int(array $q, string $k, int $def, int $min, int $max): int
{
    $v = $q[$k] ?? null;
    if (!is_scalar($v) || !preg_match('/^-?\d{1,9}$/', trim((string) $v))) { return $def; }
    return max($min, min($max, (int) $v));
}

/** un mot parmi une liste connue */
function cp2_pick(array $q, string $k, array $allowed, string $def): string
{
    $v = is_scalar($q[$k] ?? null) ? (string) $q[$k] : '';
    return in_array($v, $allowed, true) ? $v : $def;
}

/** une liste d'étiquettes d'événements « births,marriages » → les balises GEDCOM */
function cp2_tags(string $list): array
{
    $tags = [];
    foreach (explode(',', $list) as $w) { foreach (CP_EV_GROUPS[trim($w)] ?? [] as $t) { $tags[$t] = true; } }
    return $tags ? array_keys($tags) : array_merge(...array_values(CP_EV_GROUPS));
}

/** les événements situés (et datés si on les a) de ces personnes : [[personne, lieu, année, balise]] — sans les fiches cachées */
function cp2_events(PDO $pdo, array $tags, array $persons, int $max = 40000): array
{
    if (!$persons) { return []; }
    $hidden = cp_hidden($pdo); $out = [];
    $in = implode(',', array_map(static fn($t) => $pdo->quote($t), $tags));
    foreach (array_chunk(array_values(array_unique(array_map('intval', $persons))), 400) as $chunk) {
        $ids = implode(',', $chunk);
        $sql = "SELECT e.person_id AS pid, e.place_id, e.year, t.gedcom_tag AS tag FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($ids) AND t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL
            UNION ALL SELECT f.partner1_id, e.place_id, e.year, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE f.partner1_id IN ($ids) AND t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL
            UNION ALL SELECT f.partner2_id, e.place_id, e.year, t.gedcom_tag FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN families f ON f.id=e.family_id WHERE f.partner2_id IN ($ids) AND t.gedcom_tag IN ($in) AND e.place_id IS NOT NULL";
        foreach ($pdo->query($sql) as $r) {
            $pid = (int) $r['pid']; if (isset($hidden[$pid])) { continue; }
            $out[] = [$pid, (int) $r['place_id'], $r['year'] !== null && (int) $r['year'] > 0 ? (int) $r['year'] : null, (string) $r['tag']];
            if (count($out) >= $max) { return $out; }
        }
    }
    return $out;
}

/** les lieux d'événements qui n'ont pas de position (pour « ⚠ Lieux sans position » et le lien vers 📍 Lieux à placer) */
function cp2_unplaced(PDO $pdo, array $placeIds, array $placed): array
{
    $miss = array_values(array_diff(array_unique(array_map('intval', $placeIds)), array_map('intval', array_keys($placed))));
    $out = [];
    foreach (array_chunk(array_slice($miss, 0, 400), 400) as $chunk) {
        foreach ($pdo->query('SELECT id, name FROM places WHERE id IN (' . implode(',', $chunk) . ')') as $p) { $out[] = ['id' => (int) $p['id'], 'name' => mb_substr(trim((string) $p['name']), 0, 80)]; }
    }
    return ['count' => count($miss), 'list' => array_slice($out, 0, 60)];
}

/** la personne de départ : son numéro, et si elle se montre (pas vivante, pas confidentielle) ; sinon son nom de famille seulement */
function cp2_root(PDO $pdo, int $asked): array
{
    $root = dgn_root($pdo, $asked);
    if (!$root) { return ['id' => 0, 'shown' => false, 'name' => '', 'family' => '']; }
    $s = $pdo->prepare('SELECT first_name, last_name FROM persons WHERE id=?'); $s->execute([$root]); $p = $s->fetch() ?: [];
    $shown = !isset(cp_hidden($pdo)[$root]);
    $family = mb_strtoupper(trim((string) ($p['last_name'] ?? '')));
    return ['id' => $root, 'shown' => $shown, 'name' => $shown ? dgn_name($p) : '', 'family' => mb_substr($family, 0, 60)];
}

/** le point d'entrée : api.php?action=cartes_plus2 */
function cp2_data(PDO $pdo, array $q): array
{
    $what = (string) ($q['what'] ?? '');
    return match ($what) {
        default => throw new RuntimeException('Demande inconnue.'),
    };
}
