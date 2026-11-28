<?php
/**
 * ⚖️🎩🏛️ Droit et pouvoir — le seul besoin côté serveur : retrouver le code INSEE (et le département) des lieux de la base,
 * pour que la page sache dans quelle commune, quel département, quel bailliage… était un événement.
 * Lecture seule (rien n'est écrit). Données : assets/data/dp-*.json(.gz), lues par le navigateur (heritage-droit-pouvoir.js).
 *   GET api.php?action=dp_places&ids=3,7,12            → {places: [{id, name, insee, dep}]}
 *   GET api.php?action=dp_places&name=Tulle&county=Corrèze&lat=…&lon=…   → {places: [{id: 0, …}]}
 * L'INSEE vient, dans l'ordre : du code rangé dans le lieu (places.admin4_code), sinon de la recherche par nom, département et
 * position de lib/commune_culture.php (cc_find_insee : la liste des communes livrée, assets/data/cc-communes.json.gz).
 */
declare(strict_types=1);

const DP_MAX_PLACES = 400;

function dp_insee_ok(string $c): bool { return (bool) preg_match('/^(\d[\dAB]\d{3})$/', $c); }
function dp_dep_of(string $insee): string { return $insee === '' ? '' : (str_starts_with($insee, '97') ? substr($insee, 0, 3) : substr($insee, 0, 2)); }

/** un lieu (ligne de la base ou nom envoyé par la page) → {id, name, insee, dep} */
function dp_resolve(PDO $pdo, array $q): array
{
    $id = safe_int($q['id'] ?? 0);
    $name = trim(safe_text($q['name'] ?? '')); $county = trim(safe_text($q['county'] ?? '')); $country = trim(safe_text($q['country'] ?? ''));
    $lat = is_numeric($q['lat'] ?? null) ? (float) $q['lat'] : null; $lon = is_numeric($q['lon'] ?? null) ? (float) $q['lon'] : null;
    $insee = strtoupper(trim((string) ($q['insee'] ?? '')));
    if ($id > 0) {
        $cols = array_column($pdo->query('PRAGMA table_info(places)')->fetchAll(PDO::FETCH_ASSOC), 'name');
        $s = $pdo->prepare('SELECT name, county, country, latitude, longitude' . (in_array('admin4_code', $cols, true) ? ', admin4_code' : ", '' AS admin4_code") . ' FROM places WHERE id=?');
        $s->execute([$id]);
        if ($r = $s->fetch(PDO::FETCH_ASSOC)) {
            $name = $name !== '' ? $name : (string) $r['name']; $county = $county !== '' ? $county : (string) $r['county']; $country = $country !== '' ? $country : (string) $r['country'];
            if ($lat === null && $r['latitude'] !== null && $r['latitude'] !== '') { $lat = (float) $r['latitude']; $lon = (float) $r['longitude']; }
            $c = strtoupper(trim((string) $r['admin4_code']));
            if (!dp_insee_ok($insee) && dp_insee_ok($c)) { $insee = $c; }
        }
        $s->closeCursor();
    }
    if (!dp_insee_ok($insee)) {
        $insee = '';
        $short = trim((string) preg_replace('/\s*[,(].*$/u', '', $name)); // « Tulle, Corrèze » → « Tulle »
        if ($short !== '' && is_file(__DIR__ . '/commune_culture.php')) {
            require_once __DIR__ . '/commune_plus.php';
            require_once __DIR__ . '/commune_culture.php';
            if (function_exists('cc_find_insee')) { $insee = cc_find_insee($short, $county, $lat, $lon, $country); }
        }
    }
    return ['id' => $id, 'name' => $name, 'insee' => $insee, 'dep' => dp_dep_of($insee)];
}

function dp_places(PDO $pdo, array $q): array
{
    $ids = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', (string) ($q['ids'] ?? '')))))), 0, DP_MAX_PLACES);
    if (!$ids) { return ['places' => [dp_resolve($pdo, $q)]]; }
    return ['places' => array_map(static fn(int $id) => dp_resolve($pdo, ['id' => $id]), $ids)];
}

function dp_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'dp_places' => dp_places($pdo, $q),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
