<?php
declare(strict_types=1);

/**
 * 🏰 Lieux anciens d'Allemagne et d'Europe centrale (GOV, « Geschichtliches Orts-Verzeichnis », gov.genealogy.net ;
 * écran : assets/js/heritage-gov.js).
 *
 * Les données sont dans un fichier SQLite À PART (jamais dans la base de la généalogie) : SHARED_DATA_DIR/gov/gov.sqlite,
 * fabriqué par scripts/gov/build-gov.py (.github/workflows/gov.yml) et déposé dans la version « gov-donnees » du dépôt.
 * Réglages → 🏰 Lieux anciens (GOV) → « ⤓ Installer » le télécharge (par tranches de 16 Mo, reprise, empreinte sha256 :
 * même façon que la météo, lib/meteo_dl.php). Tables : obj (id, gov, lat, lon), name, typ, rel (partOf), postal, types, meta.
 *
 * Dans la base de la généalogie, une seule petite table : gov_place_links (lieu de la base ↔ objet GOV), écrite quand on
 * confirme « C'est ce lieu » ; « Ajouter ce lieu à ma base » crée un lieu (places) avec ses anciens noms. ↶ Annuler les défait.
 * Essais : un dossier local à la place de GitHub (GENEALOGY_TEST=1 + LCNDA_TEST_GOV_DIR).
 */

const GOV_DL_BASE = 'https://github.com/victorbaissait/lcnda/releases/download/gov-donnees/';
const GOV_DL_STEP = 16 * 1024 * 1024;
const GOV_HEADER_SIZE = 4096;
const GOV_PACK_MAX = 6 * 1024 * 1024 * 1024;
const GOV_ITEM_URL = 'https://gov.genealogy.net/item/show/';
const GOV_LANGS = ['deu' => 'allemand', 'ger' => 'allemand', 'pol' => 'polonais', 'cze' => 'tchèque', 'ces' => 'tchèque', 'slk' => 'slovaque', 'slo' => 'slovaque',
    'fra' => 'français', 'fre' => 'français', 'lat' => 'latin', 'rus' => 'russe', 'lit' => 'lituanien', 'lav' => 'letton', 'est' => 'estonien', 'hun' => 'hongrois',
    'dan' => 'danois', 'nld' => 'néerlandais', 'dut' => 'néerlandais', 'eng' => 'anglais', 'ita' => 'italien', 'slv' => 'slovène', 'hrv' => 'croate', 'ukr' => 'ukrainien',
    'ron' => 'roumain', 'rum' => 'roumain', 'hsb' => 'haut-sorabe', 'dsb' => 'bas-sorabe', 'wen' => 'sorabe', 'csb' => 'cachoube', 'yid' => 'yiddish', 'swe' => 'suédois',
    'bel' => 'biélorusse', 'srp' => 'serbe', 'nds' => 'bas-allemand', 'ltz' => 'luxembourgeois', 'roh' => 'romanche', 'fry' => 'frison', 'heb' => 'hébreu'];

/* ═════════════════════════ Le fichier ═════════════════════════ */

function gov_pack_dir(): string { return SHARED_DATA_DIR . '/gov'; }
function gov_file(): string { return gov_pack_dir() . '/gov.sqlite'; }

function gov_pdo(): ?PDO
{
    static $pool = [];
    $path = gov_file();
    clearstatcache(true, $path);
    $key = $path . '|' . (is_file($path) ? filemtime($path) . ':' . filesize($path) : 'none');
    if (array_key_exists($key, $pool)) { return $pool[$key]; }
    if (!is_file($path) || filesize($path) < 1024) { return $pool[$key] = null; }
    try {
        $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $opts[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
        $pdo = new PDO('sqlite:' . $path, null, null, $opts);
        $pdo->query('SELECT 1 FROM meta LIMIT 1');
        return $pool[$key] = $pdo;
    } catch (Throwable) {
        return $pool[$key] = null;
    }
}

function gov_need(): PDO
{
    $g = gov_pdo();
    if (!$g) { throw new RuntimeException(i18n_t('Les lieux anciens (GOV) ne sont pas installés : Réglages → 🏰 Lieux anciens (GOV) → ⤓ Installer.')); }
    return $g;
}

function gov_meta(?PDO $g = null): array
{
    static $memo = [];
    $g = $g ?: gov_pdo(); if (!$g) { return []; }
    $k = spl_object_id($g);
    return $memo[$k] ??= $g->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
}

/** même pliage que scripts/gov/build-gov.py : minuscules, lettres latines sans accents (table du pack), le reste → espaces */
function gov_fold(string $s): string
{
    static $map = null;
    if ($map === null) { $map = json_decode((string) (gov_meta()['fold_map'] ?? '{}'), true) ?: []; $map += ['ß' => 'ss', 'ł' => 'l', 'đ' => 'd', 'ø' => 'o', 'æ' => 'ae', 'œ' => 'oe']; }
    $s = strtr(mb_strtolower($s, 'UTF-8'), $map);
    if (class_exists('Normalizer')) { $d = Normalizer::normalize($s, Normalizer::FORM_D); if (is_string($d)) { $s = (string) preg_replace('/\p{Mn}+/u', '', $d); } }
    return trim((string) preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s));
}

/* ═════════════════════════ Lire un objet ═════════════════════════ */

/** vrai si la ligne (y1, y2, yr) vaut pour l'année ; $y null : toujours */
function gov_valid(array $r, ?int $y): bool
{
    if ($y === null) { return true; }
    return ($r['y1'] === null || (int) $r['y1'] <= $y) && ($r['y2'] === null || (int) $r['y2'] >= $y);
}

/** préférence entre lignes valides : bornes qui encadrent l'année > ouverte > « attesté en » le plus proche */
function gov_score(array $r, ?int $y): float
{
    if ($y === null) { return ($r['y2'] === null ? 2.0 : 1.0) + ($r['y1'] !== null ? (int) $r['y1'] / 100000 : 0); }
    if ($r['y1'] !== null || $r['y2'] !== null) { return 3.0; }
    if ($r['yr'] !== null) { return 2.0 - min(1.0, abs((int) $r['yr'] - $y) / 500); }
    return 1.0;
}

function gov_obj(PDO $g, string $gov): ?array
{
    $s = $g->prepare('SELECT id, gov, lat, lon FROM obj WHERE gov=?'); $s->execute([$gov]);
    $r = $s->fetch();
    return $r ?: null;
}

function gov_obj_by_id(PDO $g, int $id): ?array
{
    static $memo = [];
    if (array_key_exists($id, $memo)) { return $memo[$id]; }
    $s = $g->prepare('SELECT id, gov, lat, lon FROM obj WHERE id=?'); $s->execute([$id]);
    return $memo[$id] = ($s->fetch() ?: null);
}

function gov_types(PDO $g): array
{
    static $memo = null;
    if ($memo === null) { $memo = []; foreach ($g->query('SELECT * FROM types') as $t) { $t['groups'] = array_map('intval', array_filter(explode(',', (string) $t['grp']))); $memo[(int) $t['id']] = $t; } }
    return $memo;
}

/** le type de l'objet à l'année : ['id', 'label', 'fr', 'groups'] */
function gov_type_at(PDO $g, int $obj, ?int $y): ?array
{
    $s = $g->prepare('SELECT type, y1, y2, yr FROM typ WHERE obj=?'); $s->execute([$obj]);
    $rows = $s->fetchAll();
    if (!$rows) { return null; }
    $ok = array_values(array_filter($rows, static fn($r) => gov_valid($r, $y))) ?: $rows;
    usort($ok, static fn($a, $b) => gov_score($b, $y) <=> gov_score($a, $y));
    $t = gov_types($g)[(int) $ok[0]['type']] ?? null;
    if (!$t) { return ['id' => (int) $ok[0]['type'], 'label' => '', 'fr' => '', 'groups' => []]; }
    return ['id' => (int) $t['id'], 'label' => (string) ($t['de'] ?: $t['en'] ?: $t['fr']), 'fr' => (string) ($t['fr'] ?? ''), 'groups' => $t['groups']];
}

function gov_names(PDO $g, int $obj): array
{
    $s = $g->prepare('SELECT name, lang, y1, y2, yr FROM name WHERE obj=? ORDER BY COALESCE(y1, yr, -9999), rowid'); $s->execute([$obj]);
    return $s->fetchAll();
}

/** le nom à l'année ; $prefer : langues dans l'ordre (fra d'abord pour les grands États, sinon la langue du temps) */
function gov_name_at(PDO $g, int $obj, ?int $y, array $prefer = []): string
{
    $rows = gov_names($g, $obj);
    if (!$rows) { return ''; }
    $ok = array_values(array_filter($rows, static fn($r) => gov_valid($r, $y))) ?: $rows;
    usort($ok, static function ($a, $b) use ($y, $prefer) {
        $pa = array_search($a['lang'], $prefer, true); $pb = array_search($b['lang'], $prefer, true);
        $pa = $pa === false ? 99 : $pa; $pb = $pb === false ? 99 : $pb;
        return [$pa, -gov_score($a, $y)] <=> [$pb, -gov_score($b, $y)];
    });
    return (string) $ok[0]['name'];
}

/** « Kreis Hirschberg », « Province de Silésie » (le type en français quand GOV le donne, sinon le mot allemand) */
function gov_label(PDO $g, int $obj, ?int $y): array
{
    $t = gov_type_at($g, $obj, $y);
    $fr = $t && $t['fr'] !== '';
    $name = gov_name_at($g, $obj, $y, $fr ? ['fra', 'fre', 'deu'] : ['deu', 'fra']);
    if (!$t || ($t['label'] === '' && !$fr)) { $text = $name; }
    elseif ($fr) { $w = mb_strtoupper(mb_substr($t['fr'], 0, 1)) . mb_substr($t['fr'], 1); $text = $w . (preg_match('/^[aeiouyàâéèêîôûh]/iu', $name) ? ' d’' : ' de ') . $name; }
    else { $w = preg_replace('/\s*\([^)]*\)$/u', '', $t['label']); $text = (stripos($name, (string) $w) !== false ? $name : $w . ' ' . $name); }
    return ['name' => $name, 'type' => $t ? ($t['fr'] ?: $t['label']) : '', 'type_de' => $t['label'] ?? '', 'groups' => $t['groups'] ?? [], 'text' => $text];
}

/** les parents (partOf) qui valent à l'année, du meilleur au moins bon */
function gov_parents(PDO $g, int $obj, ?int $y): array
{
    $s = $g->prepare('SELECT parent, y1, y2, yr FROM rel WHERE child=?'); $s->execute([$obj]);
    $out = [];
    foreach ($s->fetchAll() as $r) { if (gov_valid($r, $y)) { $r['score'] = gov_score($r, $y); $out[] = $r; } }
    usort($out, static fn($a, $b) => $b['score'] <=> $a['score']);
    return $out;
}

/** sorte d'un objet : church, civil, court, admin (avec son niveau : 0 État … 6 sous la commune), settlement */
function gov_kind(array $groups): array
{
    if (in_array(3, $groups, true)) { return ['church', 0]; }
    if (in_array(6, $groups, true)) { return ['court', 0]; }
    foreach ([32 => 6, 31 => 5, 30 => 4, 29 => 3, 28 => 2, 27 => 1, 26 => 0] as $gr => $lvl) { if (in_array($gr, $groups, true)) { return ['admin', $lvl]; } }
    if (in_array(2, $groups, true)) { return ['civil', 0]; }
    if (in_array(1, $groups, true)) { return ['admin', 5]; }
    if (in_array(8, $groups, true)) { return ['settlement', 7]; }
    return ['other', 0];
}

/** À quoi appartenait le lieu cette année-là : paroisse, état civil, tribunal, et la suite administrative jusqu'à l'État */
function gov_chain(PDO $g, int $obj, ?int $y): array
{
    $one = static function (int $id) use ($g, $y) { $o = gov_obj_by_id($g, $id); $l = gov_label($g, $id, $y); [$k, $lvl] = gov_kind($l['groups']); return ['gov' => $o['gov'] ?? '', 'name' => $l['name'], 'type' => $l['type'], 'text' => $l['text'], 'kind' => $k, 'level' => $lvl, 'id' => $id]; };
    $direct = array_map(static fn($p) => $one((int) $p['parent']), gov_parents($g, $obj, $y));
    $church = []; $civil = []; $court = [];
    foreach ($direct as $p) { if ($p['kind'] === 'civil') { $civil[] = $p; } elseif ($p['kind'] === 'court') { $court[] = $p; } }
    // la paroisse et ce qui est au-dessus (Kirchspiel → Kirchenkreis → Landeskirche)
    $cur = null; foreach ($direct as $p) { if ($p['kind'] === 'church') { $cur = $p; break; } }
    $seen = [$obj => true];
    while ($cur && count($church) < 4 && !isset($seen[$cur['id']])) {
        $seen[$cur['id']] = true; $church[] = $cur; $next = null;
        foreach (gov_parents($g, $cur['id'], $y) as $p) { $c = $one((int) $p['parent']); if ($c['kind'] === 'church') { $next = $c; break; } }
        $cur = $next;
    }
    // l'administration : à chaque pas, le parent le plus « proche » (commune avant Kreis avant province), jusqu'en haut
    $admin = []; $cur = $obj; $seen = [$obj => true];
    for ($i = 0; $i < 14; $i++) {
        $cands = [];
        foreach (gov_parents($g, $cur, $y) as $p) { $c = $one((int) $p['parent']); if (in_array($c['kind'], ['admin', 'settlement'], true) && !isset($seen[$c['id']])) { $c['score'] = $p['score']; $cands[] = $c; } }
        if (!$cands) { break; }
        usort($cands, static fn($a, $b) => [$b['score'], $b['level']] <=> [$a['score'], $a['level']]);
        $pick = $cands[0]; $seen[$pick['id']] = true; $admin[] = $pick; $cur = $pick['id'];
    }
    $clean = static fn(array $l) => array_map(static fn($x) => ['gov' => $x['gov'], 'name' => $x['name'], 'type' => $x['type'], 'text' => $x['text'], 'kind' => $x['kind'], 'level' => $x['level']], $l);
    $high = array_values(array_filter($admin, static fn($x) => $x['kind'] === 'admin' && $x['level'] <= 3));
    $parts = array_column(array_merge(array_slice($church, 0, 1), $high ?: array_filter($admin, static fn($x) => $x['kind'] === 'admin')), 'text');
    return ['year' => $y, 'church' => $clean($church), 'civil' => $clean(array_slice($civil, 0, 2)), 'court' => $clean(array_slice($court, 0, 2)), 'admin' => $clean($admin),
        'sentence' => $parts ? ($y !== null ? i18n_t('en {y} : {list}', ['y' => (string) $y, 'list' => implode(', ', $parts)]) : implode(', ', $parts)) : ''];
}

/** tout ce qu'on montre d'un objet : ses noms (langue, années), son type, ses codes postaux, ses coordonnées, à l'année et aujourd'hui */
function gov_object_data(PDO $g, string $gov, ?int $y = null): array
{
    $o = gov_obj($g, $gov);
    if (!$o) { throw new RuntimeException(i18n_t('Lieu introuvable dans GOV.')); }
    $id = (int) $o['id'];
    $names = array_map(static fn($r) => ['name' => $r['name'], 'lang' => $r['lang'], 'lang_fr' => GOV_LANGS[$r['lang']] ?? $r['lang'],
        'from' => $r['y1'] !== null ? (int) $r['y1'] : null, 'to' => $r['y2'] !== null ? (int) $r['y2'] : null, 'year' => $r['yr'] !== null ? (int) $r['yr'] : null], gov_names($g, $id));
    $seen = []; $names = array_values(array_filter($names, static function ($n) use (&$seen) { $k = $n['name'] . '|' . $n['lang'] . '|' . $n['from'] . '|' . $n['to']; if (isset($seen[$k])) { return false; } return $seen[$k] = true; }));
    $s = $g->prepare('SELECT code, y1, y2, yr FROM postal WHERE obj=?'); $s->execute([$id]);
    $postal = array_values(array_unique(array_column($s->fetchAll(), 'code')));
    $now = (int) date('Y');
    [$lat, $lon] = gov_position($g, $id);
    $t = gov_type_at($g, $id, $y);
    return ['gov' => $o['gov'], 'url' => GOV_ITEM_URL . rawurlencode((string) $o['gov']), 'lat' => $lat, 'lon' => $lon, 'coords_from_parent' => $o['lat'] === null && $lat !== null,
        'name' => gov_name_at($g, $id, $y, ['deu']), 'name_today' => gov_name_at($g, $id, $now, ['pol', 'ces', 'cze', 'deu']),
        'type' => $t ? ($t['fr'] ?: $t['label']) : '', 'names' => $names, 'postal' => $postal,
        'at' => $y !== null ? gov_chain($g, $id, $y) : null, 'today' => gov_chain($g, $id, $now)];
}

/** coordonnées de l'objet, ou de son parent le plus proche qui en a (paroisse → son village) */
function gov_position(PDO $g, int $id): array
{
    $o = gov_obj_by_id($g, $id);
    if ($o && $o['lat'] !== null) { return [(float) $o['lat'], (float) $o['lon']]; }
    // un objet sans coordonnées : l'enfant le plus « bas » qui en a (Kirchspiel → son Kirchdorf)
    $s = $g->prepare('SELECT o.lat, o.lon FROM rel r JOIN obj o ON o.id=r.child WHERE r.parent=? AND o.lat IS NOT NULL LIMIT 1'); $s->execute([$id]);
    $r = $s->fetch();
    return $r ? [(float) $r['lat'], (float) $r['lon']] : [null, null];
}

/* ═════════════════════════ Chercher ═════════════════════════ */

/** « Trouver un lieu ancien » : un nom d'autrefois (allemand, polonais, tchèque…) → le lieu, son nom d'aujourd'hui, où il est */
function gov_search(string $q, int $limit = 30): array
{
    $g = gov_need();
    $f = gov_fold($q);
    if (mb_strlen($f) < 2) { return ['items' => [], 'q' => $q]; }
    $s = $g->prepare('SELECT obj, name, lang, y1, y2, yr, fold FROM name WHERE fold >= ? AND fold < ? LIMIT 600');
    $s->execute([$f, $f . "\u{10FFFF}"]);
    $byObj = [];
    foreach ($s->fetchAll() as $r) { $byObj[(int) $r['obj']][] = $r; }
    $now = (int) date('Y');
    $items = [];
    foreach ($byObj as $id => $hits) {
        $o = gov_obj_by_id($g, $id); if (!$o) { continue; }
        $t = gov_type_at($g, $id, null); [$kind] = gov_kind($t['groups'] ?? []);
        $exact = (bool) array_filter($hits, static fn($h) => $h['fold'] === $f);
        [$lat, $lon] = gov_position($g, $id);
        $items[] = ['id' => $id, 'gov' => $o['gov'], 'lat' => $lat, 'lon' => $lon, 'kind' => $kind, 'type' => $t ? ($t['fr'] ?: $t['label']) : '',
            'matched' => $hits[0]['name'], 'matched_lang' => GOV_LANGS[$hits[0]['lang']] ?? $hits[0]['lang'],
            'rank' => ($exact ? 0 : 10) + ($o['lat'] !== null ? 0 : 3) + ($kind === 'settlement' ? 0 : ($kind === 'admin' ? 1 : 2))];
    }
    usort($items, static fn($a, $b) => [$a['rank'], $a['matched']] <=> [$b['rank'], $b['matched']]);
    $items = array_slice($items, 0, max(1, min(60, $limit)));
    foreach ($items as &$it) {
        $it['name_today'] = gov_name_at($g, $it['id'], $now, ['pol', 'ces', 'cze', 'deu']);
        $today = gov_chain($g, $it['id'], $now);
        $it['today'] = implode(', ', array_column(array_filter($today['admin'], static fn($x) => $x['kind'] === 'admin' && $x['level'] <= 3), 'name'));
        $it['old_names'] = implode(' · ', array_values(array_unique(array_column(gov_names($g, $it['id']), 'name'))));
        $it['url'] = GOV_ITEM_URL . rawurlencode((string) $it['gov']);
        unset($it['rank'], $it['id']);
    }
    unset($it);
    return ['items' => $items, 'q' => $q];
}

/* ═════════════════════════ Les lieux de la base ═════════════════════════ */

function gov_links_table(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec('CREATE TABLE IF NOT EXISTS gov_place_links (place_id INTEGER PRIMARY KEY, gov_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    $done = true;
}

function gov_link_of(PDO $pdo, int $placeId): string
{
    try { $s = $pdo->prepare('SELECT gov_id FROM gov_place_links WHERE place_id=?'); $s->execute([$placeId]); return (string) ($s->fetchColumn() ?: ''); }
    catch (Throwable) { return ''; } // pas encore de table : aucun lien
}

function gov_km(float $a, float $b, float $c, float $d): float
{
    $p = M_PI / 180; $h = sin(($c - $a) * $p / 2) ** 2 + cos($a * $p) * cos($c * $p) * sin(($d - $b) * $p / 2) ** 2;
    return 2 * 6371.0 * asin(min(1.0, sqrt($h)));
}

/** les objets GOV qui portent ce nom (n'importe quelle langue, n'importe quelle époque), avec la distance au lieu de la base */
function gov_candidates(PDO $g, array $place): array
{
    $name = trim(preg_split('/[,(]/u', (string) $place['name'])[0] ?? '');
    $f = gov_fold($name);
    if ($f === '') { return []; }
    $s = $g->prepare('SELECT DISTINCT obj FROM name WHERE fold=? LIMIT 300'); $s->execute([$f]);
    $lat = $place['latitude'] !== null && $place['latitude'] !== '' ? (float) $place['latitude'] : null;
    $lon = $place['longitude'] !== null && $place['longitude'] !== '' ? (float) $place['longitude'] : null;
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $id = (int) $id; $o = gov_obj_by_id($g, $id); if (!$o || $o['lat'] === null) { continue; }
        $t = gov_type_at($g, $id, null); [$kind] = gov_kind($t['groups'] ?? []);
        if (!in_array($kind, ['settlement', 'admin'], true)) { continue; }
        $km = $lat !== null && $lon !== null ? gov_km($lat, $lon, (float) $o['lat'], (float) $o['lon']) : null;
        $out[] = ['id' => $id, 'gov' => $o['gov'], 'km' => $km, 'kind' => $kind, 'type' => $t ? ($t['fr'] ?: $t['label']) : '', 'lat' => (float) $o['lat'], 'lon' => (float) $o['lon']];
    }
    usort($out, static fn($a, $b) => [$a['km'] ?? 1e9, $a['kind'] === 'settlement' ? 0 : 1] <=> [$b['km'] ?? 1e9, $b['kind'] === 'settlement' ? 0 : 1]);
    return $out;
}

/** le lieu de la base dans GOV : le lien confirmé, ou un lieu du même nom à moins de 5 km (« sûr »), sinon les choix possibles */
function gov_resolve(PDO $pdo, PDO $g, int $placeId): array
{
    $s = $pdo->prepare('SELECT id, name, county, state, country, latitude, longitude FROM places WHERE id=?'); $s->execute([$placeId]);
    $place = $s->fetch(PDO::FETCH_ASSOC);
    if (!$place) { throw new RuntimeException(i18n_t('Lieu introuvable.')); }
    $link = gov_link_of($pdo, $placeId);
    if ($link !== '' && ($o = gov_obj($g, $link))) { return ['place' => $place, 'gov' => $link, 'id' => (int) $o['id'], 'how' => 'link', 'choices' => []]; }
    $c = gov_candidates($g, $place);
    if ($c && $c[0]['km'] !== null && $c[0]['km'] <= 5.0) { return ['place' => $place, 'gov' => $c[0]['gov'], 'id' => $c[0]['id'], 'how' => 'near', 'km' => round($c[0]['km'], 1), 'choices' => []]; }
    $now = (int) date('Y');
    $choices = array_map(static function ($x) use ($g, $now) {
        $today = gov_chain($g, $x['id'], $now);
        return ['gov' => $x['gov'], 'type' => $x['type'], 'km' => $x['km'] === null ? null : round($x['km']), 'lat' => $x['lat'], 'lon' => $x['lon'],
            'name_today' => gov_name_at($g, $x['id'], $now, ['pol', 'ces', 'cze', 'deu']),
            'where' => implode(', ', array_column(array_filter($today['admin'], static fn($a) => $a['kind'] === 'admin' && $a['level'] <= 3), 'name'))];
    }, array_slice(array_values(array_filter($c, static fn($x) => $x['km'] === null || $x['km'] <= 60)), 0, 8));
    return ['place' => $place, 'gov' => '', 'id' => 0, 'how' => $choices ? 'choose' : 'none', 'choices' => $choices];
}

/** GET gov_place&id=&year= → le lieu de la base dans GOV (anciens noms, à quoi il appartenait l'année dite et aujourd'hui) */
function gov_place_data(PDO $pdo, int $placeId, ?int $year): array
{
    $g = gov_pdo();
    if (!$g) { return ['installed' => false]; }
    $r = gov_resolve($pdo, $g, $placeId);
    $out = ['installed' => true, 'place_id' => $placeId, 'place' => (string) $r['place']['name'], 'how' => $r['how'], 'km' => $r['km'] ?? null, 'choices' => $r['choices']];
    if ($r['gov'] !== '') {
        // l'année par défaut : celle des événements de ce lieu (la plus ancienne)
        if ($year === null) { $s = $pdo->prepare('SELECT MIN(year) FROM events WHERE place_id=? AND year IS NOT NULL'); $s->execute([$placeId]); $v = $s->fetchColumn(); $year = $v !== false && $v !== null ? (int) $v : null; }
        $out['object'] = gov_object_data($g, $r['gov'], $year);
        $out['year'] = $year;
    }
    return $out;
}

/** GET gov_events&ids= → pour chaque événement d'un lieu reconnu : « en 1870 : Kirchspiel X, Kreis Y, … » */
function gov_events_data(PDO $pdo, string $ids): array
{
    $g = gov_pdo();
    if (!$g) { return ['installed' => false, 'events' => (object) []]; }
    $list = array_slice(array_values(array_unique(array_filter(array_map('intval', explode(',', $ids))))), 0, 300);
    if (!$list) { return ['installed' => true, 'events' => (object) []]; }
    $s = $pdo->prepare('SELECT id, place_id, year FROM events WHERE id IN (' . implode(',', array_fill(0, count($list), '?')) . ') AND place_id IS NOT NULL');
    $s->execute($list);
    $places = []; $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $pid = (int) $e['place_id'];
        if (!array_key_exists($pid, $places)) { try { $r = gov_resolve($pdo, $g, $pid); $places[$pid] = $r['gov'] !== '' ? $r : null; } catch (Throwable) { $places[$pid] = null; } }
        $r = $places[$pid]; if (!$r) { continue; }
        $y = $e['year'] !== null ? (int) $e['year'] : null;
        $ch = gov_chain($g, (int) $r['id'], $y);
        if ($ch['sentence'] === '') { continue; }
        $out[(int) $e['id']] = ['gov' => $r['gov'], 'place_id' => $pid, 'how' => $r['how'], 'year' => $y, 'sentence' => $ch['sentence'], 'name_then' => gov_name_at($g, (int) $r['id'], $y, ['deu', 'pol', 'ces'])];
    }
    return ['installed' => true, 'events' => (object) $out];
}

/** POST gov_place_link {place_id, gov} : « C'est ce lieu » (gov vide : retirer le lien) → {old} pour ↶ Annuler */
function gov_place_link(PDO $pdo, array $data): array
{
    $pid = (int) ($data['place_id'] ?? 0);
    $gov = trim((string) ($data['gov'] ?? ''));
    if ($gov !== '' && !preg_match('/^[A-Za-z0-9_-]{3,40}$/', $gov)) { throw new LcndaBadInput('Identifiant GOV refusé.'); }
    $s = $pdo->prepare('SELECT name FROM places WHERE id=?'); $s->execute([$pid]);
    $name = $s->fetchColumn();
    if ($name === false) { throw new RuntimeException(i18n_t('Lieu introuvable.')); }
    if ($gov !== '' && ($g = gov_pdo()) && !gov_obj($g, $gov)) { throw new RuntimeException(i18n_t('Lieu introuvable dans GOV.')); }
    gov_links_table($pdo);
    $old = gov_link_of($pdo, $pid);
    if ($gov === '') { $pdo->prepare('DELETE FROM gov_place_links WHERE place_id=?')->execute([$pid]); }
    else { $pdo->prepare('INSERT INTO gov_place_links(place_id, gov_id) VALUES(?,?) ON CONFLICT(place_id) DO UPDATE SET gov_id=excluded.gov_id')->execute([$pid, $gov]); }
    log_change($pdo, 'place', $pid, 'update', $gov === '' ? 'Lien GOV retiré : ' . $name : 'Lieu relié à GOV (' . $gov . ') : ' . $name);
    return ['place_id' => $pid, 'gov' => $gov, 'old' => $old];
}

/** POST gov_place_add {gov} : « Ajouter ce lieu à ma base » (nom d'aujourd'hui, anciens noms, coordonnées, pays…) → {place_id} */
function gov_place_add(PDO $pdo, array $data): array
{
    $g = gov_need();
    $gov = trim((string) ($data['gov'] ?? ''));
    $o = preg_match('/^[A-Za-z0-9_-]{3,40}$/', $gov) ? gov_obj($g, $gov) : null;
    if (!$o) { throw new RuntimeException(i18n_t('Lieu introuvable dans GOV.')); }
    gov_links_table($pdo);
    $s = $pdo->prepare('SELECT place_id FROM gov_place_links WHERE gov_id=? LIMIT 1'); $s->execute([$gov]);
    if ($had = (int) $s->fetchColumn()) { return ['place_id' => $had, 'created' => false]; }
    $id = (int) $o['id']; $now = (int) date('Y');
    $name = gov_name_at($g, $id, $now, ['pol', 'ces', 'cze', 'deu']);
    $today = gov_chain($g, $id, $now)['admin'];
    $lvl = static function (array $levels) use ($today) { foreach ($today as $x) { if ($x['kind'] === 'admin' && in_array($x['level'], $levels, true)) { return $x['name']; } } return ''; };
    $country = ''; foreach ($today as $x) { if ($x['kind'] === 'admin' && $x['level'] === 0) { $country = gov_name_at($g, (int) gov_obj($g, $x['gov'])['id'], $now, ['fra', 'fre']); break; } }
    $alt = array_values(array_unique(array_filter(array_map(static fn($r) => (string) $r['name'], gov_names($g, $id)), static fn($n) => $n !== $name)));
    [$lat, $lon] = gov_position($g, $id);
    $pdo->prepare('INSERT INTO places(name, county, state, country, alternate_names, latitude, longitude, description) VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$name, $lvl([3, 2]), $lvl([1]), $country, implode(', ', array_slice($alt, 0, 30)), $lat, $lon, 'GOV : ' . GOV_ITEM_URL . $gov]);
    $pid = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO gov_place_links(place_id, gov_id) VALUES(?,?)')->execute([$pid, $gov]);
    log_change($pdo, 'place', $pid, 'create', 'Lieu ajouté depuis GOV : ' . $name);
    return ['place_id' => $pid, 'created' => true, 'name' => $name];
}

/** POST gov_place_add_undo {place_id} : ↶ Annuler l'ajout (seulement si rien ne s'en sert encore) */
function gov_place_add_undo(PDO $pdo, array $data): array
{
    $pid = (int) ($data['place_id'] ?? 0);
    $s = $pdo->prepare('SELECT (SELECT count(*) FROM events WHERE place_id=?) + (SELECT count(*) FROM gov_place_links WHERE place_id=?)'); $s->execute([$pid, $pid]);
    $used = (int) $pdo->query('SELECT count(*) FROM events WHERE place_id=' . $pid)->fetchColumn();
    if ($used > 0) { throw new RuntimeException(i18n_t('Ce lieu sert déjà dans des événements : il reste dans ta base.')); }
    $pdo->prepare('DELETE FROM gov_place_links WHERE place_id=?')->execute([$pid]);
    $pdo->prepare('DELETE FROM places WHERE id=?')->execute([$pid]);
    log_change($pdo, 'place', $pid, 'delete', 'Lieu ajouté depuis GOV retiré (↶ Annuler)');
    return ['place_id' => $pid, 'removed' => true];
}

/* ═════════════════════════ État, à propos ═════════════════════════ */

function gov_status_data(): array
{
    $g = gov_pdo();
    $removed = is_file(gov_file() . '.removed');
    if (!$g) { return ['installed' => false, 'removed' => $removed, 'dir' => gov_pack_dir()]; }
    $m = gov_meta($g);
    return ['installed' => true, 'removed' => $removed, 'dir' => gov_pack_dir(), 'size' => (int) filesize(gov_file()), 'objects' => (int) ($m['objects'] ?? 0),
        'with_coords' => (int) ($m['with_coords'] ?? 0), 'names' => (int) ($m['names'] ?? 0), 'zone' => (string) ($m['zone'] ?? ''), 'built' => (string) ($m['built'] ?? ''), 'fixture' => !empty($m['fixture'])];
}

function gov_about_data(): array
{
    $m = gov_meta();
    return ['installed' => (bool) $m, 'source' => $m['source'] ?? 'GOV — Geschichtliches Orts-Verzeichnis, Verein für Computergenealogie e. V.', 'source_url' => $m['source_url'] ?? 'https://gov.genealogy.net',
        'licence' => $m['licence'] ?? 'CC BY-SA', 'licence_url' => $m['licence_url'] ?? 'https://wiki.genealogy.net/GOV/Webservice', 'licence_text' => $m['licence_text'] ?? '',
        'licence_checked' => $m['licence_checked'] ?? '', 'mention' => $m['mention'] ?? 'Daten: GOV – Geschichtliches Orts-Verzeichnis (gov.genealogy.net), Verein für Computergenealogie e. V.',
        'built' => $m['built'] ?? '', 'zone' => $m['zone'] ?? '', 'objects' => (int) ($m['objects'] ?? 0)];
}

/* ═════════════════════════ ⤓ Installer (copie de lib/meteo_dl.php), retirer ═════════════════════════ */

function gov_dl_get(string $name, ?array $range = null, int $max = 20 * 1024 * 1024): string
{
    if (!preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name)) { throw new LcndaBadInput('Nom de fichier refusé.'); }
    $dir = (string) getenv('LCNDA_TEST_GOV_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '') {
        $f = $dir . '/' . $name; if (!is_file($f)) { throw new RuntimeException(i18n_t('Les lieux anciens (GOV) ne sont pas encore en ligne : réessaie plus tard.')); }
        if (!$range) { return (string) file_get_contents($f); }
        $h = fopen($f, 'rb'); fseek($h, $range[0]); $s = (string) fread($h, $range[1] - $range[0] + 1); fclose($h); return $s;
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    if (!function_exists('link_safe_resolve')) { require_once __DIR__ . '/collections.php'; }
    $url = GOV_DL_BASE . $name;
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new RuntimeException(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + ($range ? [CURLOPT_RANGE => $range[0] . '-' . $range[1]] : []) + [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*', CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_TIMEOUT => 300,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, lieux anciens GOV)',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new RuntimeException(i18n_t('Réponse trop grosse du serveur.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code === 404) { throw new RuntimeException(i18n_t('Les lieux anciens (GOV) ne sont pas encore en ligne : réessaie plus tard.')); }
        if ($code < 200 || $code >= 300) { throw new RuntimeException($err !== '' ? i18n_t('Pas de connexion au serveur : {err}', ['err' => $err]) : i18n_t('Le serveur répond {code}.', ['code' => (string) $code])); }
        return $body;
    }
    throw new RuntimeException(i18n_t('Trop de redirections.'));
}

/** GET gov_dl_info → ce qui est en ligne (gov-manifest.json, gardé une heure) */
function gov_dl_info(): array
{
    $cache = gov_pack_dir() . '/.envois/manifest.json';
    if (is_file($cache) && filemtime($cache) > time() - 3600 && getenv('GENEALOGY_TEST') !== '1') { $m = json_decode((string) file_get_contents($cache), true); }
    else {
        $m = json_decode(gov_dl_get('gov-manifest.json', null, 1024 * 1024), true);
        if (is_array($m)) { @mkdir(dirname($cache), 0775, true); @file_put_contents($cache, json_encode($m)); }
    }
    if (!is_array($m) || !is_array($m['packs'] ?? null)) { throw new RuntimeException(i18n_t('Le sommaire des données en ligne est illisible.')); }
    $p = $m['packs']['gov'] ?? null; $out = [];
    if (is_array($p) && is_array($p['parts'] ?? null) && $p['parts']) {
        $parts = []; $sum = 0; $okp = true;
        foreach ($p['parts'] as $x) { if (!is_array($x) || !preg_match('/^[A-Za-z0-9._-]{1,120}$/', (string) ($x['name'] ?? '')) || (int) ($x['size'] ?? 0) <= 0) { $okp = false; break; } $parts[] = ['name' => (string) $x['name'], 'size' => (int) $x['size']]; $sum += (int) $x['size']; }
        if ($okp && $sum === (int) ($p['size'] ?? -1) && $sum <= GOV_PACK_MAX) { $out['gov'] = ['size' => $sum, 'parts' => $parts, 'built' => (string) ($p['built'] ?? ''), 'zone' => (string) ($p['zone'] ?? '')]; }
    }
    return ['version' => (string) ($m['version'] ?? ''), 'packs' => (object) $out];
}

function gov_upload_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Envoi inconnu.'); }
    $dir = gov_pack_dir() . '/.envois';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) { throw new RuntimeException(i18n_t('Dossier des lieux anciens impossible à créer.')); }
    return $dir . '/' . $id . '.part';
}

/** POST gov_dl_start → {id, size} */
function gov_dl_start(array $data): array
{
    $p = ((array) gov_dl_info()['packs'])['gov'] ?? null;
    if (!$p) { throw new RuntimeException(i18n_t('Les lieux anciens (GOV) ne sont pas encore en ligne : réessaie plus tard.')); }
    foreach (glob(gov_pack_dir() . '/.envois/*.{part,dl}', GLOB_BRACE) ?: [] as $old) { if (filemtime($old) < time() - 7 * 86400) { @unlink($old); } }
    $id = bin2hex(random_bytes(12));
    $path = gov_upload_path($id);
    $free = @disk_free_space(dirname($path));
    if ($free !== false && $free < 2 * $p['size'] + 50 * 1024 * 1024) { throw new RuntimeException(i18n_t('Pas assez de place sur le disque (il faut environ {n} Go de libres).', ['n' => (string) round(2 * $p['size'] / 1e9, 1)])); }
    file_put_contents($path, '');
    file_put_contents(substr($path, 0, -5) . '.dl', json_encode(['parts' => $p['parts']]));
    return ['id' => $id, 'size' => $p['size']];
}

/** POST gov_dl_step {id} → {received, size, done} */
function gov_dl_step(array $data): array
{
    $path = gov_upload_path((string) ($data['id'] ?? ''));
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    @set_time_limit(0);
    clearstatcache(true, $path);
    $have = filesize($path); $size = array_sum(array_column($meta['parts'], 'size'));
    if ($have >= $size) { return ['received' => $have, 'size' => $size, 'done' => true]; }
    $start = 0;
    foreach ($meta['parts'] as $part) {
        if ($have < $start + $part['size']) {
            $from = $have - $start; $to = min($part['size'] - 1, $from + GOV_DL_STEP - 1);
            $bytes = gov_dl_get($part['name'], [$from, $to], GOV_DL_STEP + 1024);
            if (strlen($bytes) !== $to - $from + 1) { throw new RuntimeException(i18n_t('Morceau incomplet reçu : réessaie (la reprise garde ce qui est déjà là).')); }
            $out = fopen($path, 'ab'); fwrite($out, $bytes); fclose($out);
            clearstatcache(true, $path);
            return ['received' => filesize($path), 'size' => $size, 'done' => filesize($path) >= $size];
        }
        $start += $part['size'];
    }
    return ['received' => $have, 'size' => $size, 'done' => true];
}

function gov_dl_cancel(array $data): array
{
    $path = gov_upload_path((string) ($data['id'] ?? ''));
    foreach ([$path, substr($path, 0, -5) . '.dl'] as $f) { @unlink($f); }
    return ['ok' => true];
}

function gov_dl_resume(string $id): array
{
    $path = gov_upload_path($id);
    $meta = json_decode((string) @file_get_contents(substr($path, 0, -5) . '.dl'), true);
    if (!is_file($path) || !is_array($meta)) { return ['exists' => false]; }
    clearstatcache(true, $path);
    return ['exists' => true, 'received' => filesize($path), 'size' => array_sum(array_column($meta['parts'], 'size'))];
}

/** POST gov_pack_finish {id} → vérifie (en-tête LCGOV1, taille, empreinte, base lisible) puis range le pack */
function gov_pack_finish(array $data): array
{
    $path = gov_upload_path((string) ($data['id'] ?? ''));
    if (!is_file($path)) { throw new RuntimeException(i18n_t('Téléchargement inconnu ou expiré : recommence.')); }
    try {
        $f = fopen($path, 'rb'); $head = (string) fread($f, GOV_HEADER_SIZE); fclose($f);
        if (!str_starts_with($head, "LCGOV1\n")) { throw new RuntimeException(i18n_t('Ce n’est pas un pack de lieux anciens de LCNDA.')); }
        $h = json_decode(trim(substr($head, 7)), true);
        if (!is_array($h) || ($h['kind'] ?? '') !== 'gov' || !preg_match('/^[0-9a-f]{64}$/', (string) ($h['sha256'] ?? ''))) { throw new RuntimeException(i18n_t('En-tête du pack abîmé.')); }
        clearstatcache(true, $path);
        if (filesize($path) - GOV_HEADER_SIZE !== (int) ($h['size'] ?? -1)) { throw new RuntimeException(i18n_t('Le fichier est incomplet (téléchargement interrompu ?) : rien n’a été installé.')); }
        @set_time_limit(0);
        $target = gov_file();
        $tmp = $target . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $in = fopen($path, 'rb'); fseek($in, GOV_HEADER_SIZE); $out = fopen($tmp, 'wb'); $ctx = hash_init('sha256');
        while (!feof($in)) { $buf = fread($in, 1 << 20); if ($buf === false || $buf === '') { break; } hash_update($ctx, $buf); fwrite($out, $buf); }
        fclose($in); fclose($out);
        if (!hash_equals((string) $h['sha256'], hash_final($ctx))) { @unlink($tmp); throw new RuntimeException(i18n_t('Le fichier est abîmé (empreinte différente) : rien n’a été installé.')); }
        try {
            $f = fopen($tmp, 'rb'); $magic = (string) fread($f, 16); fclose($f);
            if ($magic !== "SQLite format 3\0") { throw new RuntimeException('pas une base'); }
            $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
            if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) { $opts[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY; }
            $t = new PDO('sqlite:' . $tmp, null, null, $opts);
            $meta = $t->query('SELECT key, value FROM meta')->fetchAll(PDO::FETCH_KEY_PAIR);
            if (($meta['kind'] ?? '') !== 'gov' || (int) ($meta['format'] ?? 0) !== 1) { throw new RuntimeException('sorte'); }
            $tables = $t->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
            if (array_diff(['meta', 'types', 'obj', 'name', 'typ', 'rel', 'postal'], $tables)) { throw new RuntimeException('schéma'); }
            $t = null;
        } catch (Throwable) { @unlink($tmp); throw new RuntimeException(i18n_t('Le pack ne peut pas être lu : rien n’a été installé.')); }
        $hadPrev = false;
        if (is_file($target)) { @unlink($target . '.prev'); $hadPrev = @rename($target, $target . '.prev'); }
        if (!@rename($tmp, $target)) { @unlink($tmp); if ($hadPrev) { @rename($target . '.prev', $target); } throw new RuntimeException(i18n_t('Pack impossible à ranger.')); }
        @unlink($target . '.removed');
        return ['objects' => (int) ($h['objects'] ?? 0), 'had_prev' => $hadPrev, 'size' => (int) filesize($target)];
    } finally { @unlink($path); @unlink(substr($path, 0, -5) . '.dl'); }
}

/** POST gov_pack_undo → défait la dernière installation (remet le pack d'avant, ou retire le nouveau) */
function gov_pack_undo(): array
{
    $t = gov_file();
    if (is_file($t . '.prev')) { @unlink($t); @rename($t . '.prev', $t); return ['restored' => true]; }
    @unlink($t);
    return ['removed' => true];
}

/** POST gov_pack_remove → mis de côté (« ↶ Annuler » : gov_pack_restore) */
function gov_pack_remove(): array
{
    $t = gov_file();
    if (!is_file($t)) { throw new RuntimeException(i18n_t('Les lieux anciens (GOV) ne sont pas installés.')); }
    @unlink($t . '.removed');
    if (!@rename($t, $t . '.removed')) { throw new RuntimeException(i18n_t('Pack impossible à retirer.')); }
    return ['ok' => true];
}

function gov_pack_restore(): array
{
    $t = gov_file();
    if (!is_file($t . '.removed')) { throw new RuntimeException(i18n_t('Rien à remettre.')); }
    if (is_file($t)) { throw new RuntimeException(i18n_t('Un autre pack a été installé entre-temps.')); }
    @rename($t . '.removed', $t);
    return ['ok' => true];
}

/* ═════════════════════════ Aiguillage (api.php) ═════════════════════════ */

function gov_api_get(PDO $pdo, string $action, array $q): array
{
    $year = isset($q['year']) && is_numeric($q['year']) ? (int) $q['year'] : null;
    return match ($action) {
        'gov_status' => gov_status_data(),
        'gov_about' => gov_about_data(),
        'gov_search' => gov_search(mb_substr((string) ($q['q'] ?? ''), 0, 120), (int) ($q['limit'] ?? 30)),
        'gov_object' => gov_object_data(gov_need(), (string) ($q['gov'] ?? ''), $year),
        'gov_place' => gov_place_data($pdo, (int) ($q['id'] ?? 0), $year),
        'gov_events' => gov_events_data($pdo, (string) ($q['ids'] ?? '')),
        'gov_dl_info' => (static function () { try { return gov_dl_info(); } catch (RuntimeException $e) { return ['version' => '', 'packs' => (object) [], 'offline' => true, 'error' => $e->getMessage()]; } })(),
        'gov_dl_resume' => gov_dl_resume((string) ($q['id'] ?? '')),
        default => throw new RuntimeException('Action GOV inconnue.'),
    };
}

/** les écritures du pack (fichiers à part, rien dans la généalogie) */
function gov_api_post(string $action, array $data): array
{
    return match ($action) {
        'gov_dl_start' => gov_dl_start($data),
        'gov_dl_step' => gov_dl_step($data),
        'gov_dl_cancel' => gov_dl_cancel($data),
        'gov_pack_finish' => gov_pack_finish($data),
        'gov_pack_undo' => gov_pack_undo(),
        'gov_pack_remove' => gov_pack_remove(),
        'gov_pack_restore' => gov_pack_restore(),
        default => throw new RuntimeException('Action GOV inconnue.'),
    };
}

/** les écritures dans la généalogie (handle_write d'api.php : verrou, mode consultation, journal) */
function gov_api_write(PDO $pdo, string $action, array $data): array
{
    return match ($action) {
        'gov_place_link' => gov_place_link($pdo, $data),
        'gov_place_add' => gov_place_add($pdo, $data),
        'gov_place_add_undo' => gov_place_add_undo($pdo, $data),
        default => throw new RuntimeException('Action GOV inconnue.'),
    };
}
