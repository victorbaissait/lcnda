<?php
declare(strict_types=1);

/**
 * 🎤 Scène (assets/js/heritage-scene*.js) : ce que le navigateur ne peut pas tirer du catalogue d'une personne.
 * Les fiches elles-mêmes (concerts, tournées, rôles, séries…) passent par le moteur (lib/art_engine.php, action art / art_write) :
 * ici seulement des LECTURES.
 *
 *   GET api.php?action=scene&op=places&ids=3,7,12   → {places: [{id, name, county, state, country, lat, lon}]}
 *        les coordonnées des lieux des soirs (carte des concerts, itinéraire d'une tournée, pays des statistiques).
 */

/* Les sortes du domaine, pour le moteur qui lit $GLOBALS['ART_EXTRA_TYPES'] (lib/art_engine.php, art_extra_types()) :
 *   clé => [nom, pluriel, icône, famille, type parent, profil(s) qui la portent]. (Sans ce registre, elles sont dans ART_BUILTIN_TYPES.) */
$GLOBALS['ART_EXTRA_TYPES'] = (is_array($GLOBALS['ART_EXTRA_TYPES'] ?? null) ? $GLOBALS['ART_EXTRA_TYPES'] : []) + [
    'tour' => ['Tournée', 'Tournées', '🚌', 'scene', '', ['artist', 'actor']],
    'stage_piece' => ['Sketch, numéro, scène', 'Sketches, numéros, scènes', '🎭', 'scene', '', ['artist', 'actor']],
    'role' => ['Rôle', 'Rôles', '🎭', 'scene', '', ['actor']],
    'series' => ['Série, émission', 'Séries et émissions', '📺', 'film', '', ['artist', 'actor']],
    'season' => ['Saison', 'Saisons', '📂', 'film', 'series', ['artist', 'actor']],
    'episode' => ['Épisode', 'Épisodes', '🎞', 'film', 'season', ['artist', 'actor']],
    'profile_actor' => ['Profil d’acteur', 'Profils d’acteur', '🎬', 'profile', '', ['actor']],
];

/** les coordonnées et le pays de quelques lieux (au plus 300 à la fois) */
function scene_places(PDO $pdo, string $ids): array
{
    $list = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', $ids)), static fn(int $n) => $n > 0))), 0, 300);
    if (!$list) { return ['places' => []]; }
    $s = $pdo->prepare('SELECT id, name, county, state, country, latitude, longitude FROM places WHERE id IN (' . implode(',', array_fill(0, count($list), '?')) . ')');
    $s->execute($list);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $lat = $r['latitude'] !== null && $r['latitude'] !== '' ? (float) $r['latitude'] : null;
        $lon = $r['longitude'] !== null && $r['longitude'] !== '' ? (float) $r['longitude'] : null;
        if ($lat !== null && $lon !== null && ($lat === 0.0 && $lon === 0.0 || abs($lat) > 90 || abs($lon) > 180)) { $lat = $lon = null; }
        $out[] = ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'county' => (string) ($r['county'] ?? ''), 'state' => (string) ($r['state'] ?? ''),
            'country' => (string) ($r['country'] ?? ''), 'lat' => $lat, 'lon' => $lon];
    }
    return ['places' => $out];
}

function scene_api_get(PDO $pdo, array $g): array
{
    return match ((string) ($g['op'] ?? '')) {
        'places' => scene_places($pdo, (string) ($g['ids'] ?? '')),
        default => throw new RuntimeException('Demande inconnue.'),
    };
}
