<?php
declare(strict_types=1);

/**
 * Lot 8 « ciel et métier » — les deux choses qui ont besoin du serveur (tout le reste est calculé dans la page,
 * assets/js/heritage-lot8-ciel-metier.js, avec les fichiers assets/data/l8a-*.json.gz) :
 *
 *  1. 🌍 Les villes du monde au même nom — le répertoire mondial de GeoNames déjà livré avec l'app (lib/reference.php,
 *     world_reference() : GeoNames, CC BY 4.0, https://www.geonames.org) : les lieux habités (codes PPL…) portant
 *     exactement le même nom, dans un autre pays que la commune. Rien ne part sur Internet.
 *       GET l8a_homonyms&name=Tulle&country=France&lat=&lon=  → {ok, items: [{name, state, country, cc, lat, lon, population, url}], total}
 *       GET l8a_homonyms_base → {ok, rows} : les homonymes de tous les lieux de la base (pour Listes → Données)
 *  2. 🗺️ Les vieux plans de sa ville — Wikimedia Commons, EN LIGNE à la demande puis gardé sur l'ordinateur (le même cache et les
 *     mêmes outils que « Autour du village », lib/commune_plus.php) : dans la catégorie Commons de la commune (Wikidata P373),
 *     les sous-catégories de cartes et plans (« Old maps of … », « Maps of … », « Plans of … », « Cadastral maps of … »…) ;
 *     seulement les images datées de 1950 ou avant (ou rangées dans une catégorie de cartes anciennes sans date), avec auteur
 *     et licence de chacune. « ＋ Garder dans les médias » passe par cplus_keep / cplus_keep_undo (commune_plus.php).
 *       GET l8a_maps&place_id=|name=&lat=&lon=&insee=&country=&fresh=1
 * Essais : GENEALOGY_TEST=1 + LCNDA_TEST_CPLUS_DIR (fichiers l8a_subcats.json, l8a_subsub_N.json, l8a_files_N.json).
 */

require_once __DIR__ . '/reference.php';

/** 🌍 les villes du même nom ailleurs dans le monde */
function l8a_homonyms(array $q): array
{
    $name = trim(safe_text($q['name'] ?? ''));
    $name = trim((string) preg_replace('/\s*\(.*$|,.*$/u', '', $name));
    if (mb_strlen($name) < 2) { return ['ok' => false, 'message' => 'Choisis une commune.']; }
    $world = world_reference();
    if (!$world) { return ['ok' => false, 'unavailable' => true, 'message' => 'Le répertoire des villes du monde n’est pas prêt sur cet ordinateur (il se prépare au démarrage) : réessaie dans une minute.']; }
    $key = world_search_key($name);
    $country = trim(safe_text($q['country'] ?? ''));
    $own = '';
    if ($country === '' || preg_match('/^(fr|fra|france|république française)$/iu', $country)) { $own = 'FR'; }
    else {
        $s = $world->prepare('SELECT code FROM countries WHERE name = ? COLLATE NOCASE'); $s->execute([$country]); $own = (string) $s->fetchColumn();
        if ($own === '' && preg_match('/^[A-Z]{2}$/i', $country)) { $own = strtoupper($country); }
    }
    $lat = is_numeric($q['lat'] ?? null) ? (float) $q['lat'] : null; $lon = is_numeric($q['lon'] ?? null) ? (float) $q['lon'] : null;
    $s = $world->prepare("SELECT w.geoname_id, w.name, w.state, w.country_code, w.latitude, w.longitude, w.population, w.feature_code, c.name AS country
        FROM world_places w JOIN countries c ON c.code = w.country_code WHERE w.search_key = ? AND (w.feature_code LIKE 'PPL%' OR w.feature_code = '') ORDER BY w.population DESC LIMIT 400");
    $s->execute([$key]);
    $items = []; $seen = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if ($own !== '' && $r['country_code'] === $own) { continue; }
        if ($lat !== null && $r['latitude'] !== null && l8a_km($lat, (float) $lon, (float) $r['latitude'], (float) $r['longitude']) < 25) { continue; } // la commune elle-même
        $k = $r['country_code'] . '|' . world_search_key((string) $r['state']);
        if (isset($seen[$k]) && (int) $r['population'] === 0) { continue; } // les mêmes hameaux d'une même région : un seul
        $seen[$k] = true;
        $id = (int) $r['geoname_id'];
        $items[] = ['name' => (string) $r['name'], 'state' => (string) $r['state'], 'country' => (string) $r['country'], 'cc' => (string) $r['country_code'],
            'lat' => $r['latitude'] !== null ? round((float) $r['latitude'], 4) : null, 'lon' => $r['longitude'] !== null ? round((float) $r['longitude'], 4) : null,
            'population' => (int) $r['population'], 'kind' => (string) $r['feature_code'], 'url' => $id > 0 ? 'https://www.geonames.org/' . $id : ''];
    }
    return ['ok' => true, 'name' => $name, 'own' => $own, 'total' => count($items), 'items' => array_slice($items, 0, 60),
        'source' => ['label' => 'GeoNames', 'licence' => 'CC BY 4.0', 'url' => 'https://www.geonames.org/']];
}

/** 🌍 pour la liste (Listes → Données) : les lieux de la base qui ont un homonyme dans un autre pays */
function l8a_homonyms_base(PDO $pdo): array
{
    $world = world_reference();
    if (!$world) { return ['ok' => false, 'unavailable' => true, 'rows' => [], 'message' => 'Le répertoire des villes du monde n’est pas prêt sur cet ordinateur : réessaie dans une minute.']; }
    $rows = []; $seen = [];
    $places = $pdo->query("SELECT id, name, country, latitude, longitude FROM places WHERE TRIM(COALESCE(name,'')) <> '' ORDER BY id LIMIT 3000")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($places as $p) {
        $name = trim((string) preg_replace('/\s*\(.*$|,.*$/u', '', (string) $p['name']));
        $k = world_search_key($name) . '|' . mb_strtolower((string) $p['country']);
        if ($name === '' || isset($seen[$k])) { continue; }
        $seen[$k] = true;
        $r = l8a_homonyms(['name' => $name, 'country' => (string) $p['country'], 'lat' => $p['latitude'], 'lon' => $p['longitude']]);
        foreach (array_slice($r['items'] ?? [], 0, 10) as $it) { $rows[] = ['commune' => $name, 'place_id' => (int) $p['id']] + $it; }
        if (count($rows) > 5000) { break; }
    }
    return ['ok' => true, 'rows' => $rows, 'source' => ['label' => 'GeoNames', 'licence' => 'CC BY 4.0', 'url' => 'https://www.geonames.org/']];
}

function l8a_km(float $a, float $b, float $c, float $d): float
{
    $r = M_PI / 180;
    $x = sin(($c - $a) * $r / 2) ** 2 + cos($a * $r) * cos($c * $r) * sin(($d - $b) * $r / 2) ** 2;
    return 12742 * asin(min(1, sqrt($x)));
}

const L8A_MAP_CAT = '/\b(old\s+maps?|maps?|plans?|cadastr\w*|cartes?|city\s+plans?|town\s+plans?|vues?\s+cavali[eè]res?|bird.?s[- ]eye\s+views?)\b/i';
const L8A_OLD_CAT = '/\b(old|historic(al)?|ancien\w*|(1[5-9])th[- ]century|1[5-9]\d\ds?)\b/i';

/** 🗺️ les vieux plans et cartes d'une commune (Commons) */
function l8a_maps(PDO $pdo, array $q): array
{
    require_once __DIR__ . '/commune_plus.php';
    $p = cplus_place($pdo, $q);
    if ($p['name'] === '' && $p['insee'] === '' && $p['qid'] === '') { return ['ok' => false, 'noplace' => true, 'message' => i18n_t('Choisis une commune.')]; }
    $fresh = !empty($q['fresh']);
    $c = cplus_commune($p, $fresh);
    if (empty($c['ok'])) { return $c; }
    if ($c['category'] === '') { return ['ok' => true, 'items' => [], 'commune' => $c, 'message' => i18n_t('Cette commune n’a pas de catégorie sur Wikimedia Commons.')]; }
    $r = cplus_cached('images', 'l8a-maps:' . $c['category'], static function () use ($c) {
        $cat = $c['category'];
        $list = static function (string $step, string $title): array {
            $j = cplus_commons($step, ['action' => 'query', 'list' => 'categorymembers', 'cmtitle' => $title, 'cmtype' => 'subcat', 'cmlimit' => 200]);
            return array_map(static fn($m) => (string) ($m['title'] ?? ''), $j['query']['categorymembers'] ?? []);
        };
        $cats = [];
        foreach ($list('l8a_subcats.json', 'Category:' . $cat) as $t) { if (preg_match(L8A_MAP_CAT, $t)) { $cats[] = $t; } }
        // un niveau de plus : « Maps of X » contient souvent « Old maps of X », « Cadastral maps of X »…
        $more = [];
        foreach (array_slice($cats, 0, 3) as $i => $t) {
            foreach ($list('l8a_subsub_' . $i . '.json', $t) as $u) { if (preg_match(L8A_MAP_CAT, $u) && !in_array($u, $cats, true)) { $more[] = $u; } }
        }
        $cats = array_values(array_unique(array_merge($cats, $more)));
        // les cartes anciennes d'abord, puis les plans, puis les cartes en général
        $rank = static fn($t) => preg_match(L8A_OLD_CAT, $t) ? 0 : (preg_match('/plans?|cadastr/i', $t) ? 1 : 2);
        usort($cats, static fn($a, $b) => $rank($a) <=> $rank($b) ?: strcmp($a, $b));
        $cats = array_slice($cats, 0, 5);
        $items = []; $seen = [];
        foreach ($cats as $i => $ct) {
            $oldCat = (bool) preg_match(L8A_OLD_CAT, $ct);
            $jj = cplus_commons('l8a_files_' . $i . '.json', ['action' => 'query', 'generator' => 'categorymembers', 'gcmtitle' => $ct, 'gcmtype' => 'file', 'gcmlimit' => 100,
                'prop' => 'imageinfo', 'iiprop' => 'url|extmetadata|mime', 'iiurlwidth' => 360,
                'iiextmetadatafilter' => 'DateTimeOriginal|DateTime|Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|ImageDescription|ObjectName']);
            foreach ($jj['query']['pages'] ?? [] as $pg) {
                $title = (string) ($pg['title'] ?? ''); if ($title === '' || isset($seen[$title])) { continue; }
                $ii = $pg['imageinfo'][0] ?? null; if (!$ii || !preg_match('#^image/(jpeg|png|webp|gif|tiff)$#', (string) ($ii['mime'] ?? 'image/jpeg'))) { continue; }
                $md = $ii['extmetadata'] ?? []; $v = static fn($k) => (string) ($md[$k]['value'] ?? '');
                $year = cplus_year($v('DateTimeOriginal'));
                if (!$year) { $year = cplus_year((string) preg_replace('/^File:/', '', $title)); }
                if ($year > 1950 || (!$year && !$oldCat)) { continue; }
                $lic = cplus_text($v('LicenseShortName') ?: $v('UsageTerms'), 80);
                if ($lic === '') { continue; }
                $seen[$title] = true;
                $free = (bool) preg_match('/public domain|^pd|cc0|cc[- ]by(?!.*\bnc\b)(?!.*\bnd\b)|attribution|no restrictions/i', $lic);
                $items[] = ['file' => $title, 'title' => cplus_text($v('ObjectName') ?: (string) preg_replace('/^File:|\.\w+$/', '', $title), 160),
                    'desc' => cplus_text($v('ImageDescription'), 240), 'year' => $year, 'date' => cplus_text($v('DateTimeOriginal'), 60), 'category' => (string) preg_replace('/^Category:/', '', $ct),
                    'author' => cplus_text($v('Artist'), 160) ?: cplus_text($v('Credit'), 160), 'licence' => $lic, 'licence_url' => (string) ($md['LicenseUrl']['value'] ?? ''), 'free' => $free,
                    'thumb' => (string) ($ii['thumburl'] ?? ''), 'page' => (string) ($ii['descriptionurl'] ?? ('https://commons.wikimedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $title))))];
            }
        }
        usort($items, static fn($a, $b) => ($a['year'] ?: 1950) <=> ($b['year'] ?: 1950) ?: strcmp($a['file'], $b['file']));
        return ['ok' => true, 'items' => array_slice($items, 0, 40), 'categories' => array_map(static fn($t) => (string) preg_replace('/^Category:/', '', $t), $cats), 'commune_label' => $c['label'],
            'source' => ['label' => 'Wikimedia Commons', 'licence' => i18n_t('licence propre à chaque image'), 'url' => 'https://commons.wikimedia.org/wiki/Category:' . rawurlencode(str_replace(' ', '_', $cat))]];
    }, $fresh);
    return $r + ['commune' => $c];
}

function l8a_api_get(PDO $pdo, string $action, array $q): array
{
    return match ($action) {
        'l8a_homonyms' => l8a_homonyms($q),
        'l8a_homonyms_base' => l8a_homonyms_base($pdo),
        'l8a_maps' => l8a_maps($pdo, $q),
        default => throw new LcndaBadInput('Action inconnue.'),
    };
}
