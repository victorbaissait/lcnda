<?php
declare(strict_types=1);

/**
 * 🌐 Mon site web (Listes → 🛠️ Outils de modification → « 🌐 Mon site web » ; interface : assets/js/heritage-site-web*.js,
 * styles : assets/css/site-web.css). Un site = des pages (HTML), une feuille de styles (CSS), un script (JS), des couleurs
 * et polices (« 🎨 Styles »), gardés en JSON dans la table websites (migration schema_v60) ; les versions dans website_versions.
 *
 * Sûreté :
 *  - le HTML des pages est désamorcé à l'enregistrement (website_defuse : pas de <script>, d'<iframe>, d'objet, de <base>,
 *    d'attribut on…, de lien javascript:/data:) ; le JavaScript de la personne est gardé à part, en texte : il ne tourne que
 *    dans l'aperçu isolé (iframe sandbox, origine opaque) et dans le site exporté (js/script.js) ; jamais dans l'app ;
 *  - les blocs de la généalogie (arbre, fiche, frise, carte, chiffres, photos d'une personne, gens d'un lieu) sont remplis
 *    ici, figés à l'export, avec la règle du partage F11 (gedcom_share_hidden) : aucune personne vivante ni fiche
 *    confidentielle ; une image n'y part que si personne de caché n'y est relié ou repéré ; le nom complet d'une personne
 *    cachée écrit à la main dans un texte est remplacé par « [nom retiré] » à l'export ;
 *  - les images sont réenregistrées (sans EXIF), réduites à 1600 px, avec des noms fabriqués (images/m1.jpg) ;
 *  - le site exporté a une politique de sécurité (CSP) : scripts seulement depuis ses propres fichiers, rien d'autre.
 */

const SITE_MAX = 20000000;      // octets de JSON
const SITE_PAGES_MAX = 60;
const SITE_HTML_MAX = 2000000;  // une page
const SITE_CSS_MAX = 600000;
const SITE_JS_MAX = 600000;
const SITE_VERSIONS_MAX = 100;
const SITE_IMG_MAX = 1600;
const SITE_REDACTED = '[nom retiré]';
const SITE_BLOCK_KINDS = ['menu', 'person', 'tree', 'timeline', 'map', 'chart', 'photos', 'place', 'diagram'];
const SITE_FROZEN_MAX = 3500000;  // une carte figée (image) ou un diagramme figé (SVG)
/** 🗺 Fonds qu'on peut aussi montrer en « carte interactive » dans le site publié : leurs conditions permettent qu'un site
 *  les affiche avec leur mention (OpenStreetMap, CARTO, OpenTopoMap, OpenHistoricalMap). Les autres fonds (Esri, IGN,
 *  bibliothèques…) restent en image figée ; leur carte interactive passe au fond OpenStreetMap. */
const SITE_MAP_LIVE = [
    'osm' => ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© les contributeurs d’OpenStreetMap', 19],
    'osmfr' => ['https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', '© OpenStreetMap France · © les contributeurs d’OpenStreetMap', 19],
    'osmde' => ['https://a.tile.openstreetmap.de/{z}/{x}/{y}.png', '© les contributeurs d’OpenStreetMap', 18],
    'cyclosm' => ['https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', '© CyclOSM · © les contributeurs d’OpenStreetMap', 19],
    'relief' => ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', '© OpenTopoMap (CC-BY-SA) · © les contributeurs d’OpenStreetMap', 17],
    'light' => ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', '© les contributeurs d’OpenStreetMap · © CARTO', 19],
    'dark' => ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', '© les contributeurs d’OpenStreetMap · © CARTO', 19],
    'minimal' => ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png', '© les contributeurs d’OpenStreetMap · © CARTO', 19],
    'roads' => ['https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png', '© les contributeurs d’OpenStreetMap · © CARTO', 19],
    'voyager' => ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', '© les contributeurs d’OpenStreetMap · © CARTO', 19],
    'ohm' => ['https://tile.openhistoricalmap.org/map/{z}/{x}/{y}.png', '© les contributeurs d’OpenHistoricalMap', 18],
];

function website_ready(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    website_schema($pdo); // une ancienne base qui n'aurait pas encore la migration : mêmes tables que schema_v60
    $done = true;
}

function website_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS websites (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}', info_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS website_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES websites(id) ON DELETE CASCADE)");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_website_versions_site ON website_versions(site_id, id)');
}

/* ═════════ Nettoyage ═════════ */

/** Une adresse sans danger : relative (sans « schéma »), http(s), mailto, tel, # ; pour une image aussi data:image (png, jpeg, gif, webp). */
function website_url_ok(string $raw, bool $isSrc): bool
{
    $v = html_entity_decode($raw, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $v = trim((string) preg_replace('/[\x00-\x20\x7f]+/', '', $v));
    if ($v === '') { return true; }
    if ($isSrc && preg_match('#^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$#i', $v)) { return true; }
    if (preg_match('#^([a-z][a-z0-9+.\-]*):#i', $v, $m)) { return in_array(strtolower($m[1]), ['http', 'https', 'mailto', 'tel'], true); }
    return true; // une adresse relative (page.html, images/x.jpg, #ancre)
}

/** Retire d'un HTML de page ce qui pourrait s'exécuter. $removed : combien de choses ont été retirées. */
function website_defuse(string $html, int &$removed = 0): string
{
    $html = str_replace("\0", '', $html);
    $paired = 'script|style|iframe|object|applet|template|noscript|title|frameset|noembed|noframes|xmp|plaintext|handler|listener';
    $single = 'script|style|iframe|object|applet|template|noscript|title|frameset|noembed|noframes|xmp|plaintext|embed|base|meta|link|frame|portal|animate|set|animatemotion|animatetransform|discard|foreignobject|handler|listener|param';
    for ($i = 0; $i < 6; $i++) { // <scr<script>ipt> : on recommence jusqu'à ce que plus rien ne bouge
        $before = $html;
        $html = (string) preg_replace_callback('#<\s*(' . $paired . ')\b[^>]*>.*?<\s*/\s*\1\s*>#is', static function () use (&$removed) { $removed++; return ''; }, $html);
        $html = (string) preg_replace_callback('#<\s*/?\s*(' . $single . ')\b[^>]*>#is', static function () use (&$removed) { $removed++; return ''; }, $html);
        $html = (string) preg_replace('#<\s*/?\s*(html|head|body|!doctype)\b[^>]*>#is', '', $html);
        if ($html === $before) { break; }
    }
    // attributs : événements, srcdoc, formaction, xlink:href, ping, srcset (des adresses qu'on ne vérifie pas une à une)
    $html = (string) preg_replace_callback('#(<[a-z][^>]*?)\s(on[a-z0-9_\-]*|formaction|srcdoc|xlink:href|ping|srcset|imagesrcset)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#is', static function ($m) use (&$removed) { $removed++; return $m[1]; }, $html);
    for ($i = 0; $i < 3; $i++) { // un attribut sans valeur « onload » (sans =) ne fait rien ; on repasse pour les suites d'attributs
        $html = (string) preg_replace_callback('#(<[a-z][^>]*?)\s(on[a-z0-9_\-]*|formaction|srcdoc|xlink:href|ping|srcset)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#is', static function ($m) use (&$removed) { $removed++; return $m[1]; }, $html);
    }
    // adresses : href, src, action, poster, data, background, cite, href d'un <use>
    $html = (string) preg_replace_callback('#(\s)(href|src|action|poster|data|background|cite|codebase|dynsrc|lowsrc)\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))#i', static function ($m) use (&$removed) {
        $v = $m[4] !== '' ? $m[4] : (($m[5] ?? '') !== '' ? $m[5] : ($m[6] ?? ''));
        if (website_url_ok($v, strtolower($m[2]) !== 'href' && strtolower($m[2]) !== 'action' && strtolower($m[2]) !== 'cite')) { return $m[0]; }
        $removed++;
        return $m[1] . $m[2] . '=""';
    }, $html);
    // style="…" : pas d'expression(), de javascript:, de -moz-binding, de behavior
    $html = (string) preg_replace_callback('#\sstyle\s*=\s*("([^"]*)"|\'([^\']*)\')#i', static function ($m) use (&$removed) {
        $v = $m[2] !== '' ? $m[2] : ($m[3] ?? '');
        $clean = website_css_value_clean(html_entity_decode($v, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($clean !== html_entity_decode($v, ENT_QUOTES | ENT_HTML5, 'UTF-8')) { $removed++; }
        return ' style="' . htmlspecialchars($clean, ENT_QUOTES | ENT_HTML5, 'UTF-8', false) . '"';
    }, $html);
    $html = (string) preg_replace('#(java|vb|live)script\s*:#i', '', $html);
    return $html;
}

/** Un SVG dessiné par l'app (diagramme) : seulement la balise <svg>, désamorcé comme une page (pas de script, d'événement, de lien) */
function website_svg_clean(string $svg, int &$removed = 0): string
{
    $svg = trim($svg);
    if (!preg_match('#^<svg\b[^>]*>.*</svg>$#is', $svg)) { return ''; }
    $svg = website_defuse($svg, $removed);
    $svg = (string) preg_replace('#\s(href)\s*=\s*("(?!\#)[^"]*"|\'(?!\#)[^\']*\')#i', '', $svg); // dans un SVG : seulement des liens internes (#…)
    return preg_match('#^<svg\b#i', ltrim($svg)) ? $svg : '';
}

/** Une image envoyée en data: (carte figée) : relue et réenregistrée par GD (sans métadonnées), 2000 px au plus ; [octets, extension] */
function website_image_from_data(string $data): ?array
{
    if (!preg_match('#^data:image/(jpeg|png);base64,([A-Za-z0-9+/=]+)$#', $data, $m) || !extension_loaded('gd')) { return null; }
    $bytes = base64_decode($m[2], true);
    $info = $bytes !== false ? @getimagesizefromstring($bytes) : false;
    if (!$info || $info[0] * $info[1] > 8000000) { return null; }
    $im = @imagecreatefromstring($bytes);
    if (!$im) { return null; }
    $r = min(1, 2000 / max($info[0], $info[1])); $w = max(1, (int) round($info[0] * $r)); $h = max(1, (int) round($info[1] * $r));
    $out = imagecreatetruecolor($w, $h); imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $im, 0, 0, 0, 0, $w, $h, $info[0], $info[1]);
    ob_start(); imagejpeg($out, null, 86); $b = (string) ob_get_clean();
    imagedestroy($out); imagedestroy($im);
    return [$b, 'jpg'];
}

/** La clé d'une carte figée : la même que dans l'app (heritage-site-web.js, mapKey) */
function website_map_key(array $a): string
{
    return 'map:' . safe_int($a['person'] ?? 0) . ':' . (($a['scope'] ?? '') === 'ancestors' ? 'ancestors' : 'person') . ':' . max(1, min(12, safe_int($a['gens'] ?? 6) ?: 6)) . ':' . (preg_match('/^[a-z0-9_]{1,30}$/', (string) ($a['fond'] ?? '')) ? $a['fond'] : 'svg');
}

/** Les lieux d'une carte (personne seule, ou avec ses ancêtres), sans personne cachée : [{lat, lng, name, n}] */
function website_map_points(PDO $pdo, array $a): array
{
    $pid = safe_int($a['person'] ?? 0);
    if (!website_open($pdo, $pid)) { return []; }
    $ids = ($a['scope'] ?? '') === 'ancestors' ? array_keys(h_ancestors($pdo, $pid, max(1, min(12, safe_int($a['gens'] ?? 6) ?: 6)))) : [$pid];
    $pts = [];
    foreach (array_slice($ids, 0, 400) as $id) {
        foreach (website_events($pdo, (int) $id) as $e) {
            if (($e['lat'] === null || $e['lng'] === null) && $e['p'] !== '') { $g = website_geo($pdo, $e['p']); if ($g) { $e['lat'] = $g[0]; $e['lng'] = $g[1]; } } // lieu sans coordonnées : villes du monde de l'app
            if ($e['lat'] === null || $e['lng'] === null || abs($e['lat']) > 85 || abs($e['lng']) > 180) { continue; }
            $k = round($e['lat'], 3) . ',' . round($e['lng'], 3);
            $pts[$k] ??= ['lat' => round($e['lat'], 5), 'lng' => round($e['lng'], 5), 'name' => $e['p'], 'n' => 0];
            $pts[$k]['n']++;
        }
    }
    uasort($pts, static fn($x, $y) => $y['n'] <=> $x['n']);
    return array_values($pts);
}

function website_css_value_clean(string $css): string
{
    $css = str_replace(["\0", '<', '>'], '', $css);
    $css = (string) preg_replace('#expression\s*\(|(java|vb|live)script\s*:|-moz-binding|behavior\s*:|@import#i', '', $css);
    return $css;
}

/** La feuille de styles : pas de « </style », pas d'expression(), @import seulement vers Google Fonts (https). */
function website_css_clean(string $css): string
{
    $css = str_replace("\0", '', $css);
    $css = (string) preg_replace('#<\s*/?\s*(style|script)\b[^>]*>?#i', '', $css);
    $css = str_replace(['<!--', '-->'], '', $css);
    $css = (string) preg_replace('#expression\s*\(|(java|vb|live)script\s*:|-moz-binding|behavior\s*:#i', '', $css);
    $css = (string) preg_replace_callback('#@import\s+(url\()?\s*["\']?([^"\')\s;]+)["\']?\s*\)?[^;]*;?#i', static fn($m) => preg_match('#^https://fonts\.googleapis\.com/#', $m[2]) ? $m[0] : '', $css);
    return $css;
}

/** Le script : du texte, jamais lancé dans l'app ; « </script » coupé pour qu'il ne sorte pas de sa balise dans l'aperçu. */
function website_js_clean(string $js): string
{
    return (string) preg_replace('#<\s*/\s*script#i', '<\/script', str_replace("\0", '', $js));
}

function website_color(mixed $v, string $d): string
{
    return is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtolower($v) : $d;
}

function website_font(mixed $v, string $d): string
{
    $v = is_string($v) ? trim(preg_replace('/[^\p{L}\p{N} \-\'.,]/u', '', $v) ?? '') : '';
    return $v !== '' ? mb_substr($v, 0, 80) : $d;
}

function website_slug(string $s): string
{
    $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    $t = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $t !== false ? $t : $s), '-'));
    return mb_substr($t, 0, 60) ?: 'page';
}

/** Le site reçu → [données nettoyées, résumé, nombre de choses retirées] */
function website_check(mixed $data): array
{
    if (!is_array($data) || !isset($data['pages']) || !is_array($data['pages']) || !array_is_list($data['pages'])) {
        throw new LcndaBadInput('Site illisible : il manque ses pages.');
    }
    if (count($data['pages']) < 1 || count($data['pages']) > SITE_PAGES_MAX) { throw new LcndaBadInput('Un site a de 1 à ' . SITE_PAGES_MAX . ' pages.'); }
    $removed = 0; $pages = []; $slugs = []; $ids = [];
    foreach ($data['pages'] as $i => $p) {
        if (!is_array($p)) { throw new LcndaBadInput('Page illisible.'); }
        $html = is_string($p['html'] ?? null) ? $p['html'] : '';
        if (strlen($html) > SITE_HTML_MAX) { throw new LcndaBadInput('Une page est trop lourde (plus de 2 Mo) : range les images dans les médias, ou partage-la en deux pages.'); }
        $id = is_string($p['id'] ?? null) && preg_match('/^[a-z0-9\-]{1,40}$/', $p['id']) && !isset($ids[$p['id']]) ? $p['id'] : 'p' . ($i + 1) . '-' . bin2hex(random_bytes(3));
        $ids[$id] = true;
        $name = mb_substr(safe_text($p['name'] ?? ''), 0, 80) ?: ($i === 0 ? 'Accueil' : 'Page ' . ($i + 1));
        $slug = $i === 0 ? 'index' : website_slug(is_string($p['slug'] ?? null) && $p['slug'] !== '' ? $p['slug'] : $name);
        if ($slug === 'index' && $i > 0) { $slug = 'page-' . ($i + 1); }
        $base = $slug; $k = 2;
        while (isset($slugs[$slug])) { $slug = $base . '-' . $k++; }
        $slugs[$slug] = true;
        $pages[] = ['id' => $id, 'name' => $name, 'slug' => $slug, 'html' => website_defuse($html, $removed),
            'title' => mb_substr(safe_text($p['title'] ?? ''), 0, 160), 'desc' => mb_substr(safe_text($p['desc'] ?? ''), 0, 300)];
    }
    $css = is_string($data['css'] ?? null) ? $data['css'] : '';
    $js = is_string($data['js'] ?? null) ? $data['js'] : '';
    if (strlen($css) > SITE_CSS_MAX || strlen($js) > SITE_JS_MAX) { throw new LcndaBadInput('La feuille de styles ou le script est trop lourd (600 ko au plus).'); }
    $cssClean = website_css_clean($css);
    if ($cssClean !== $css) { $removed++; }
    $t = is_array($data['theme'] ?? null) ? $data['theme'] : [];
    $num = static fn($v, float $a, float $b, float $d) => is_numeric($v) ? max($a, min($b, (float) $v)) : $d;
    $theme = ['primary' => website_color($t['primary'] ?? '', '#7a2a2a'), 'accent' => website_color($t['accent'] ?? '', '#c8a45c'), 'bg' => website_color($t['bg'] ?? '', '#fbf8f3'),
        'text' => website_color($t['text'] ?? '', '#2b2420'), 'font' => website_font($t['font'] ?? '', 'Georgia'), 'headFont' => website_font($t['headFont'] ?? '', 'Georgia'),
        'width' => (int) $num($t['width'] ?? 1100, 480, 2400, 1100), 'radius' => (int) $num($t['radius'] ?? 8, 0, 60, 8), 'size' => (int) $num($t['size'] ?? 17, 11, 28, 17)];
    $s = is_array($data['settings'] ?? null) ? $data['settings'] : [];
    $settings = ['lang' => is_string($s['lang'] ?? null) && preg_match('/^[a-z]{2}(-[A-Z]{2})?$/', $s['lang']) ? $s['lang'] : 'fr',
        'title' => mb_substr(safe_text($s['title'] ?? ''), 0, 120), 'desc' => mb_substr(safe_text($s['desc'] ?? ''), 0, 300),
        'tpl' => is_string($s['tpl'] ?? null) && preg_match('/^[\w-]{1,40}$/', $s['tpl']) ? $s['tpl'] : '', 'credit' => !array_key_exists('credit', $s) || !empty($s['credit'])];
    // ce qui a été figé dans l'app : diagrammes (SVG, dessinés par Graphiques → Mes diagrammes) et cartes avec leur fond (image)
    $frozen = [];
    $allHtml = implode('', array_column($pages, 'html'));
    foreach (is_array($data['frozen'] ?? null) ? array_slice($data['frozen'], 0, 200, true) : [] as $k => $v) {
        $k = (string) $k;
        if (preg_match('/^diagram:(\d{1,9})$/', $k, $m) && is_string($v) && strlen($v) <= SITE_FROZEN_MAX && preg_match('#data-diagram\s*=\s*["\']?' . $m[1] . '\b#', $allHtml)) {
            $svg = website_svg_clean($v, $removed);
            if ($svg !== '') { $frozen[$k] = $svg; }
        } elseif (preg_match('/^map:\d{1,9}:(person|ancestors):\d{1,2}:[a-z0-9_]{1,30}$/', $k) && is_array($v) && is_string($v['img'] ?? null) && strlen($v['img']) <= SITE_FROZEN_MAX
            && preg_match('#^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$#', $v['img'])) {
            $frozen[$k] = ['img' => $v['img'], 'credit' => mb_substr(safe_text($v['credit'] ?? ''), 0, 200), 'w' => max(100, min(2000, (int) ($v['w'] ?? 760))), 'h' => max(80, min(2000, (int) ($v['h'] ?? 460))),
                'view' => is_array($v['view'] ?? null) ? ['lat' => max(-85, min(85, (float) ($v['view']['lat'] ?? 0))), 'lng' => max(-180, min(180, (float) ($v['view']['lng'] ?? 0))), 'z' => max(1, min(18, (int) ($v['view']['z'] ?? 6)))] : null];
        }
    }
    $clean = ['v' => 1, 'pages' => $pages, 'css' => $cssClean, 'js' => website_js_clean($js), 'theme' => $theme, 'settings' => $settings, 'frozen' => $frozen ?: new stdClass()];
    $first = ''; $blocks = 0;
    foreach ($pages as $p) {
        if ($first === '' && preg_match('#<h[1-2]\b[^>]*>(.*?)</h[1-2]>#is', $p['html'], $m)) { $first = mb_substr(trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8')), 0, 120); }
        $blocks += preg_match_all('#data-lc-block\s*=#i', $p['html']);
    }
    $info = ['pages' => count($pages), 'head' => $first, 'blocks' => $blocks, 'tpl' => $settings['tpl'], 'colors' => [$theme['primary'], $theme['bg'], $theme['accent']], 'js' => trim($js) !== ''];
    return [$clean, $info, $removed];
}

/* ═════════ Les sites et leurs versions ═════════ */

function websites_list(PDO $pdo): array
{
    website_ready($pdo);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'],
        'info' => json_decode((string) $r['info_json'], true) ?: new stdClass()], $pdo->query('SELECT id, name, info_json, created_at, updated_at FROM websites ORDER BY updated_at DESC, id DESC')->fetchAll());
}

function website_get(PDO $pdo, int $id): array
{
    website_ready($pdo);
    $s = $pdo->prepare('SELECT * FROM websites WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Site introuvable.'); }
    $n = $pdo->prepare('SELECT count(*) FROM website_versions WHERE site_id=?'); $n->execute([$id]);
    return ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'data' => json_decode((string) $r['data_json'], true) ?: new stdClass(),
        'versions' => (int) $n->fetchColumn(), 'updated_at' => $r['updated_at'], 'created_at' => $r['created_at'], 'rev' => content_rev((string) $r['data_json'])];
}

function save_website(PDO $pdo, array $data): array
{
    website_ready($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200) ?: 'Mon site';
    [$clean, $info, $removed] = website_check($data['data'] ?? null);
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > SITE_MAX) { throw new LcndaBadInput('Site trop lourd (plus de 20 Mo) : range les images dans les médias plutôt que dans les pages.'); }
    $infoJson = json_encode($info, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    if ($id > 0) {
        if (isset($data['rev']) && is_string($data['rev']) && $data['rev'] !== '') { // un autre onglet a enregistré entre-temps
            $c = $pdo->prepare('SELECT data_json FROM websites WHERE id=?'); $c->execute([$id]); $cur = $c->fetchColumn();
            if ($cur !== false && content_rev((string) $cur) !== $data['rev'] && empty($data['force'])) { throw new LcndaConflict('Ce site a été modifié ailleurs (autre onglet ou autre fenêtre) depuis que tu l’as ouvert.'); }
        }
        $s = $pdo->prepare('UPDATE websites SET name=?, data_json=?, info_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $json, $infoJson, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Site introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO websites(name, data_json, info_json) VALUES(?,?,?)')->execute([$name, $json, $infoJson]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, 'update', 'Site web enregistré : ' . $name);
    $u = $pdo->prepare('SELECT updated_at FROM websites WHERE id=?'); $u->execute([$id]);
    return ['id' => $id, 'updated_at' => $u->fetchColumn(), 'rev' => content_rev($json), 'removed' => $removed, 'data' => $clean];
}

function rename_website(PDO $pdo, array $data): array
{
    website_ready($pdo);
    $id = safe_int($data['id'] ?? 0); $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($id <= 0 || $name === '') { throw new LcndaBadInput('Nom manquant.'); }
    $s = $pdo->prepare('UPDATE websites SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $id]);
    if (!$s->rowCount()) { throw new RuntimeException('Site introuvable.'); }
    return ['id' => $id];
}

/** supprime et rend le site entier, avec ses versions (l'écran peut le remettre avec « ↶ Annuler ») */
function delete_website(PDO $pdo, array $data): array
{
    website_ready($pdo);
    $id = safe_int($data['id'] ?? 0);
    $old = website_get($pdo, $id);
    $v = $pdo->prepare('SELECT label, data_json, created_at FROM website_versions WHERE site_id=? ORDER BY id'); $v->execute([$id]);
    $old['version_rows'] = array_map(static fn($r) => ['label' => $r['label'], 'data' => json_decode((string) $r['data_json'], true), 'created_at' => $r['created_at']], $v->fetchAll());
    $pdo->prepare('DELETE FROM website_versions WHERE site_id=?')->execute([$id]);
    $pdo->prepare('DELETE FROM websites WHERE id=?')->execute([$id]);
    log_change($pdo, 'meta', 0, 'delete', 'Site web supprimé : ' . $old['name']);
    return ['id' => $id, 'site' => $old];
}

function restore_website(PDO $pdo, array $data): array
{
    website_ready($pdo);
    $d = is_array($data['site'] ?? null) ? $data['site'] : [];
    $r = save_website($pdo, ['name' => $d['name'] ?? 'Mon site', 'data' => $d['data'] ?? null]);
    foreach (array_slice(is_array($d['version_rows'] ?? null) ? $d['version_rows'] : [], 0, SITE_VERSIONS_MAX) as $v) {
        if (!is_array($v)) { continue; }
        try { [$clean] = website_check($v['data'] ?? null); } catch (Throwable $_) { continue; }
        $pdo->prepare('INSERT INTO website_versions(site_id, label, data_json, created_at) VALUES(?,?,?,?)')->execute([$r['id'], mb_substr(safe_text($v['label'] ?? ''), 0, 120), json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            preg_match('/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/', (string) ($v['created_at'] ?? '')) ? $v['created_at'] : date('Y-m-d H:i:s')]);
    }
    unset($r['data']);
    return $r;
}

function duplicate_website(PDO $pdo, array $data): array
{
    website_ready($pdo);
    $old = website_get($pdo, safe_int($data['id'] ?? 0));
    $r = save_website($pdo, ['name' => mb_substr(safe_text($data['name'] ?? '') ?: ($old['name'] . ' (copie)'), 0, 200), 'data' => $old['data']]);
    unset($r['data']);
    return $r;
}

function website_versions(PDO $pdo, int $siteId): array
{
    website_ready($pdo);
    $s = $pdo->prepare('SELECT id, label, created_at FROM website_versions WHERE site_id=? ORDER BY id DESC'); $s->execute([$siteId]);
    return array_map(static fn($r) => ['id' => (int) $r['id'], 'label' => (string) $r['label'], 'created_at' => $r['created_at']], $s->fetchAll());
}

function website_version(PDO $pdo, int $id): array
{
    website_ready($pdo);
    $s = $pdo->prepare('SELECT * FROM website_versions WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Version introuvable.'); }
    return ['id' => (int) $r['id'], 'site_id' => (int) $r['site_id'], 'label' => (string) $r['label'], 'created_at' => $r['created_at'], 'data' => json_decode((string) $r['data_json'], true) ?: new stdClass()];
}

function save_website_version(PDO $pdo, array $data): array
{
    website_ready($pdo);
    $siteId = safe_int($data['site_id'] ?? 0);
    $e = $pdo->prepare('SELECT count(*) FROM websites WHERE id=?'); $e->execute([$siteId]);
    if (!(int) $e->fetchColumn()) { throw new RuntimeException('Site introuvable : enregistre-le d’abord.'); }
    [$clean] = website_check($data['data'] ?? null);
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > SITE_MAX) { throw new LcndaBadInput('Version trop lourde.'); }
    $label = mb_substr(safe_text($data['label'] ?? ''), 0, 120) ?: ('Version du ' . date('d/m/Y à H:i'));
    $pdo->prepare('INSERT INTO website_versions(site_id, label, data_json) VALUES(?,?,?)')->execute([$siteId, $label, $json]);
    $vid = (int) $pdo->lastInsertId();
    $pdo->prepare('DELETE FROM website_versions WHERE site_id=? AND id NOT IN (SELECT id FROM website_versions WHERE site_id=? ORDER BY id DESC LIMIT ' . SITE_VERSIONS_MAX . ')')->execute([$siteId, $siteId]);
    return ['id' => $vid, 'label' => $label];
}

function delete_website_version(PDO $pdo, array $data): array
{
    website_ready($pdo);
    $old = website_version($pdo, safe_int($data['id'] ?? 0));
    $pdo->prepare('DELETE FROM website_versions WHERE id=?')->execute([$old['id']]);
    return ['id' => $old['id'], 'version' => $old];
}

function restore_website_version(PDO $pdo, array $data): array
{
    website_ready($pdo);
    $v = is_array($data['version'] ?? null) ? $data['version'] : [];
    return save_website_version($pdo, ['site_id' => $v['site_id'] ?? 0, 'label' => $v['label'] ?? '', 'data' => $v['data'] ?? null]);
}

/* ═════════ Qui peut paraître : la règle du partage F11 ═════════ */

/** ['hidden' => [id => living|private], 'persons' => [id => ligne], 'forbidden' => [noms complets des cachés]] (une fois par requête) */
function website_privacy(PDO $pdo): array
{
    static $cache = null;
    if ($cache !== null) { return $cache; }
    $all = $pdo->query(person_select())->fetchAll();
    $families = $pdo->query('SELECT * FROM families')->fetchAll();
    $hidden = function_exists('gedcom_share_hidden') ? gedcom_share_hidden($pdo, $all, $families) : [];
    $byId = [];
    foreach ($all as $p) { $byId[(int) $p['id']] = $p; }
    $fold = static function (string $s): string { $s = mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $s))); $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s); return $t !== false && $t !== '' ? $t : $s; };
    $shown = [];
    foreach ($all as $p) { if (!isset($hidden[(int) $p['id']])) { $shown[$fold($p['first_name'] . ' ' . $p['last_name'])] = true; $shown[$fold($p['last_name'] . ' ' . $p['first_name'])] = true; } }
    $forbidden = [];
    foreach ($hidden as $hid => $_) {
        $p = $byId[$hid] ?? null; if (!$p) { continue; }
        $first = trim((string) $p['first_name']); $last = trim((string) $p['last_name']);
        if ($first === '' || $last === '') { continue; }
        $one = trim(preg_split('/\s+/u', $first)[0] ?? '');
        foreach (array_unique([$first . ' ' . $last, $last . ' ' . $first, $one . ' ' . $last, $last . ' ' . $one]) as $full) {
            if (mb_strlen($full) >= 5 && !isset($shown[$fold($full)])) { $forbidden[] = $full; }
        }
    }
    $forbidden = array_values(array_unique($forbidden));
    usort($forbidden, static fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
    return $cache = ['hidden' => $hidden, 'persons' => $byId, 'forbidden' => $forbidden];
}

function website_open(PDO $pdo, int $id): bool
{
    $pv = website_privacy($pdo);
    return $id > 0 && isset($pv['persons'][$id]) && !isset($pv['hidden'][$id]);
}

/** media_id → [person_id => true] : reliées (fiche, événement, famille), repérées (visages), portrait ; comme F11. Une fois par requête. */
function website_media_people(PDO $pdo): array
{
    static $map = null;
    if ($map !== null) { return $map; }
    $map = [];
    $fam = [];
    foreach ($pdo->query('SELECT id, partner1_id, partner2_id FROM families') as $f) { $fam[(int) $f['id']] = [(int) $f['partner1_id'], (int) $f['partner2_id']]; }
    foreach ($pdo->query("SELECT ml.media_id, ml.entity_type, ml.entity_id, e.person_id AS ev_person, e.family_id AS ev_family FROM media_links ml LEFT JOIN events e ON ml.entity_type='event' AND e.id=ml.entity_id") as $l) {
        $who = [];
        $t = (string) $l['entity_type']; $eid = (int) $l['entity_id'];
        if ($t === 'person') { $who[] = $eid; }
        elseif ($t === 'event') { $who[] = (int) $l['ev_person']; foreach ($fam[(int) $l['ev_family']] ?? [] as $x) { $who[] = $x; } }
        elseif ($t === 'family') { foreach ($fam[$eid] ?? [] as $x) { $who[] = $x; } }
        foreach (array_filter($who) as $pid) { $map[(int) $l['media_id']][$pid] = true; }
    }
    try { foreach ($pdo->query('SELECT media_id, person_id FROM media_tags WHERE person_id IS NOT NULL') as $t) { $map[(int) $t['media_id']][(int) $t['person_id']] = true; } } catch (Throwable $_) {}
    foreach ($pdo->query('SELECT id, portrait_media_id FROM persons WHERE portrait_media_id IS NOT NULL') as $p) { $map[(int) $p['portrait_media_id']][(int) $p['id']] = true; }
    return $map;
}

/** Une image de la base peut-elle paraître sur le site ? (personne de caché dessus ; un fichier du dossier des médias) */
function website_media_ok(PDO $pdo, int $mediaId): bool
{
    $pv = website_privacy($pdo);
    foreach (array_keys(website_media_people($pdo)[$mediaId] ?? []) as $pid) { if (isset($pv['hidden'][$pid])) { return false; } }
    return true;
}

/** « media/nom.jpg » → la ligne du média (ou null) */
function website_media_by_file(PDO $pdo, string $file): ?array
{
    static $cache = [];
    if (array_key_exists($file, $cache)) { return $cache[$file]; }
    $s = $pdo->prepare('SELECT id, title, filename, media_type, date_text FROM media WHERE filename=? OR thumbnail=? LIMIT 1'); $s->execute([$file, $file]);
    return $cache[$file] = ($s->fetch(PDO::FETCH_ASSOC) ?: null);
}

/** Le nom complet d'une personne cachée, écrit à la main dans un texte, devient « [nom retiré] ». Rend [texte, combien]. */
function website_redact(PDO $pdo, string $html): array
{
    $n = 0;
    foreach (website_privacy($pdo)['forbidden'] as $name) {
        $re = '/(?<![\p{L}])' . implode('[\s\-]+', array_map(static fn($w) => preg_quote($w, '/'), preg_split('/\s+/u', $name))) . '(?![\p{L}])/iu';
        $html = (string) preg_replace_callback($re, static function () use (&$n) { $n++; return SITE_REDACTED; }, $html);
    }
    return [$html, $n];
}

/* ═════════ Les blocs de la généalogie ═════════ */

function website_e(mixed $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function website_name(array $p): string
{
    return trim(trim((string) $p['first_name'] . ' ' . (string) ($p['middle_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) $p['last_name']))) ?: 'Sans nom';
}

function website_years(array $p): string
{
    $b = $p['birth_year'] ?? $p['bapt_year'] ?? null; $d = $p['death_year'] ?? $p['buri_year'] ?? null;
    return $b || $d ? '(' . ($b ?: '?') . ' – ' . ($d ?: '?') . ')' : '';
}

/** Les événements d'une personne qui paraît : [{t, tag, d, y, p, lat, lng}] ; un événement de couple seulement si le conjoint paraît aussi */
function website_events(PDO $pdo, int $pid): array
{
    if (!website_open($pdo, $pid)) { return []; }
    $s = $pdo->prepare("SELECT e.date_text, e.year, e.sort_date, e.id, t.label AS type_label, t.gedcom_tag, pl.name AS place, pl.county, pl.latitude, pl.longitude, f.partner1_id, f.partner2_id
        FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id LEFT JOIN families f ON f.id=e.family_id
        WHERE e.person_id=? OR (e.family_id IS NOT NULL AND (f.partner1_id=? OR f.partner2_id=?))
        ORDER BY COALESCE(e.sort_date,''), COALESCE(e.year, 9999), e.id");
    $s->execute([$pid, $pid, $pid]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $other = (int) $e['partner1_id'] === $pid ? (int) $e['partner2_id'] : (int) $e['partner1_id'];
        if ($e['partner1_id'] !== null && $other && !website_open($pdo, $other)) { continue; } // mariage avec une personne cachée : il ne paraît pas
        $place = implode(', ', array_values(array_filter([trim((string) $e['place']), trim((string) $e['county'])])));
        $out[] = ['t' => (string) ($e['type_label'] ?: 'Événement'), 'tag' => (string) $e['gedcom_tag'], 'd' => trim((string) $e['date_text']), 'y' => $e['year'] !== null ? (int) $e['year'] : null, 'p' => $place,
            'lat' => is_numeric($e['latitude']) ? (float) $e['latitude'] : null, 'lng' => is_numeric($e['longitude']) ? (float) $e['longitude'] : null];
    }
    return $out;
}

/** Coordonnées d'un lieu écrit (« Tulle, Corrèze ») : la base puis les villes du monde de l'app (heritage_geocode), une fois par requête */
function website_geo(PDO $pdo, string $text): ?array
{
    static $cache = [];
    if (array_key_exists($text, $cache)) { return $cache[$text]; }
    if (count($cache) > 300 || !function_exists('heritage_geocode')) { return null; }
    try { $g = heritage_geocode($pdo, $text); } catch (Throwable $_) { $g = null; }
    return $cache[$text] = $g ? [(float) $g['lat'], (float) $g['lon']] : null;
}

/** Les parents (qui paraissent) d'une personne */
function website_parents(PDO $pdo, int $pid): array
{
    $s = $pdo->prepare('SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=? ORDER BY fc.id LIMIT 1');
    $s->execute([$pid]); $r = $s->fetch(PDO::FETCH_ASSOC) ?: [];
    $pv = website_privacy($pdo); $out = ['father' => 0, 'mother' => 0];
    foreach ([(int) ($r['partner1_id'] ?? 0), (int) ($r['partner2_id'] ?? 0)] as $id) {
        if (!$id || !isset($pv['persons'][$id])) { continue; }
        $g = (string) $pv['persons'][$id]['gender'];
        if ($g === 'female' && !$out['mother']) { $out['mother'] = $id; } elseif (!$out['father']) { $out['father'] = $id; } elseif (!$out['mother']) { $out['mother'] = $id; }
    }
    return $out;
}

function website_portrait(PDO $pdo, int $pid, callable $img): string
{
    $p = website_privacy($pdo)['persons'][$pid] ?? null;
    $mid = (int) ($p['portrait_media_id'] ?? 0);
    if (!$mid || !website_media_ok($pdo, $mid)) { return ''; }
    $s = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $s->execute([$mid]); $f = (string) $s->fetchColumn();
    $url = $f !== '' ? $img($f) : '';
    return $url !== '' ? '<img class="lc-portrait" src="' . website_e($url) . '" alt="' . website_e(website_name($p)) . '">' : '';
}

function website_hidden_note(string $what = 'Cette fiche'): string
{
    return '<p class="lc-note">' . website_e($what) . ' n’est pas publiée sur le site (personne vivante ou fiche confidentielle).</p>';
}

/** Le HTML d'un bloc de la généalogie. $a = ses attributs data-… ; $img(nomDuFichier) → l'adresse de l'image ('' si refusée). */
function website_block_html(PDO $pdo, array $a, callable $img, array $ctx = []): string
{
    $kind = (string) ($a['kind'] ?? '');
    $pid = safe_int($a['person'] ?? 0);
    $pv = website_privacy($pdo);
    switch ($kind) {
        case 'menu':
            $pages = is_array($ctx['pages'] ?? null) ? $ctx['pages'] : [];
            $li = array_map(static fn($p) => '<li><a href="' . website_e(($p['slug'] ?? 'index') . '.html') . '"' . (($p['slug'] ?? '') === ($ctx['current'] ?? '') ? ' aria-current="page"' : '') . '>' . website_e($p['name'] ?? '') . '</a></li>', $pages);
            return '<ul class="lc-menu-list">' . implode('', $li) . '</ul>';
        case 'person':
            if (!website_open($pdo, $pid)) { return website_hidden_note(); }
            $p = $pv['persons'][$pid];
            $ev = website_events($pdo, $pid);
            $life = static function (string $sign, ?string $d, array $ev, array $tags) { foreach ($ev as $e) { if (in_array($e['tag'], $tags, true)) { return $sign . ' ' . trim($e['d'] . ($e['p'] !== '' ? ', ' . $e['p'] : '')); } } return $d ? $sign . ' ' . $d : ''; };
            $lines = array_filter([$life('°', $p['birth_date'] ?? null, $ev, ['BIRT', 'CHR', 'BAPM']), $life('†', $p['death_date'] ?? null, $ev, ['DEAT', 'BURI'])]);
            $par = website_parents($pdo, $pid); $parTxt = [];
            foreach (['father', 'mother'] as $k) { if ($par[$k] && website_open($pdo, $par[$k])) { $parTxt[] = website_name($pv['persons'][$par[$k]]); } }
            $gender = (string) $p['gender'];
            $h = '<article class="lc-fiche">' . website_portrait($pdo, $pid, $img) . '<div class="lc-fiche-txt"><h3>' . website_e(website_name($p)) . '</h3>';
            if ($lines) { $h .= '<p class="lc-fiche-dates">' . implode('<br>', array_map('website_e', $lines)) . '</p>'; }
            if ($parTxt) { $h .= '<p class="lc-fiche-parents">' . website_e(($gender === 'female' ? 'Fille de ' : ($gender === 'male' ? 'Fils de ' : 'Enfant de ')) . implode(' et de ', $parTxt)) . '</p>'; }
            $more = array_values(array_filter($ev, static fn($e) => !in_array($e['tag'], ['BIRT', 'DEAT'], true)));
            if ($more && ($a['events'] ?? '1') !== '0') {
                $h .= '<ul class="lc-fiche-ev">' . implode('', array_map(static fn($e) => '<li><b>' . website_e($e['t']) . '</b> ' . website_e(trim($e['d'] . ($e['p'] !== '' ? ' · ' . $e['p'] : ''))) . '</li>', array_slice($more, 0, 30))) . '</ul>';
            }
            return $h . '</div></article>';
        case 'tree':
            if (!website_open($pdo, $pid)) { return website_hidden_note('Cet arbre'); }
            $gens = max(2, min(5, safe_int($a['gens'] ?? 3) ?: 3));
            $sosa = [1 => $pid];
            for ($n = 1; $n < (1 << ($gens - 1)); $n++) {
                if (empty($sosa[$n])) { continue; }
                $par = website_parents($pdo, $sosa[$n]);
                if ($par['father']) { $sosa[2 * $n] = $par['father']; }
                if ($par['mother']) { $sosa[2 * $n + 1] = $par['mother']; }
            }
            $cols = '';
            for ($g = 0; $g < $gens; $g++) {
                $boxes = '';
                for ($n = 1 << $g; $n < (1 << ($g + 1)); $n++) {
                    $id = $sosa[$n] ?? 0;
                    if ($id && website_open($pdo, $id)) {
                        $p = $pv['persons'][$id];
                        $boxes .= '<div class="lc-tree-box is-' . website_e(match ((string) $p['gender']) { 'male' => 'm', 'female' => 'f', default => 'u' }) . '"><b>' . website_e(website_name($p)) . '</b><small>' . website_e(website_years($p)) . '</small></div>';
                    } else {
                        $boxes .= '<div class="lc-tree-box is-empty"><small>' . ($id ? 'non publié' : '?') . '</small></div>';
                    }
                }
                $cols .= '<div class="lc-tree-col">' . $boxes . '</div>';
            }
            return '<div class="lc-tree" style="--lc-gens:' . $gens . '">' . $cols . '</div>';
        case 'timeline':
            if (!website_open($pdo, $pid)) { return website_hidden_note('Cette frise'); }
            $ev = array_values(array_filter(website_events($pdo, $pid), static fn($e) => $e['y'] !== null || $e['d'] !== ''));
            if (!$ev) { return '<p class="lc-note">Pas encore d’événement daté pour cette personne.</p>'; }
            return '<ol class="lc-frise">' . implode('', array_map(static fn($e) => '<li><span class="lc-frise-an">' . website_e($e['y'] ?? '') . '</span><div><b>' . website_e($e['t']) . '</b><br><small>' . website_e(trim($e['d'] . ($e['p'] !== '' ? ' · ' . $e['p'] : ''))) . '</small></div></li>', array_slice($ev, 0, 60))) . '</ol>';
        case 'map':
            if (!website_open($pdo, $pid)) { return website_hidden_note('Cette carte'); }
            $pts = website_map_points($pdo, $a);
            if (!$pts) { return '<p class="lc-note">Pas encore de lieu placé sur la carte (coordonnées) pour ' . (($a['scope'] ?? '') === 'ancestors' ? 'ces personnes' : 'cette personne') . '.</p>'; }
            $list = '';
            foreach ($pts as $pt) { $list .= '<li>' . website_e($pt['name']) . ' <small>(' . $pt['n'] . ')</small></li>'; }
            // une carte avec son fond (figée en image dans l'app) ; « interactive » : on peut la déplacer et zoomer dans le site
            $fz = $ctx['frozen'][website_map_key($a)] ?? null;
            $asset = $ctx['asset'] ?? null;
            if (is_array($fz) && $asset) {
                $url = $asset($fz['img'], 'carte');
                if ($url !== '') {
                    $img = '<img class="lc-map-img" src="' . website_e($url) . '" alt="Carte des lieux" width="' . (int) $fz['w'] . '" height="' . (int) $fz['h'] . '">';
                    $credit = '<small class="lc-map-credit">' . website_e($fz['credit']) . '</small>';
                    if (($a['vive'] ?? '') === '1' && !empty($fz['view'])) {
                        $live = SITE_MAP_LIVE[(string) ($a['fond'] ?? '')] ?? SITE_MAP_LIVE['osm'];
                        $data = json_encode(['tiles' => $live[0], 'credit' => $live[1], 'max' => $live[2], 'view' => $fz['view'], 'pts' => array_map(static fn($p) => [$p['lat'], $p['lng'], mb_substr((string) $p['name'], 0, 80), $p['n']], array_slice($pts, 0, 300))], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                        if (isset($ctx['live'])) { $ctx['live'](); }
                        return '<figure class="lc-map"><div class="lc-carte-vive" data-carte="' . website_e((string) $data) . '">' . $img . '</div><figcaption>' . $credit . '<ul class="lc-map-list">' . $list . '</ul></figcaption></figure>';
                    }
                    return '<figure class="lc-map">' . $img . '<figcaption>' . $credit . '<ul class="lc-map-list">' . $list . '</ul></figcaption></figure>';
                }
            }
            $lats = array_column($pts, 'lat'); $lngs = array_column($pts, 'lng');
            $minLa = min($lats); $maxLa = max($lats); $minLo = min($lngs); $maxLo = max($lngs);
            $padLa = max(0.2, ($maxLa - $minLa) * 0.15); $padLo = max(0.3, ($maxLo - $minLo) * 0.15);
            $minLa -= $padLa; $maxLa += $padLa; $minLo -= $padLo; $maxLo += $padLo;
            $W = 600; $H = (int) max(220, min(600, round($W * ($maxLa - $minLa) / max(0.0001, ($maxLo - $minLo) * cos(deg2rad(($minLa + $maxLa) / 2))))));
            $svg = '<svg class="lc-map-svg" viewBox="0 0 ' . $W . ' ' . $H . '" role="img" aria-label="Carte des lieux"><rect width="100%" height="100%" class="lc-map-bg"/>';
            foreach ($pts as $pt) {
                $x = round(($pt['lng'] - $minLo) / ($maxLo - $minLo) * $W, 1); $y = round(($maxLa - $pt['lat']) / ($maxLa - $minLa) * $H, 1);
                $r = min(14, 4 + 2 * $pt['n']);
                $svg .= '<circle cx="' . $x . '" cy="' . $y . '" r="' . $r . '" class="lc-map-dot"><title>' . website_e($pt['name']) . '</title></circle>';
                if ($pt['n'] > 1 || count($pts) < 12) { $svg .= '<text x="' . ($x + $r + 3) . '" y="' . ($y + 4) . '" class="lc-map-lbl">' . website_e(mb_substr((string) preg_replace('/,.*$/', '', $pt['name']), 0, 30)) . '</text>'; }
            }
            return '<figure class="lc-map">' . $svg . '</svg><figcaption><ul class="lc-map-list">' . $list . '</ul></figcaption></figure>';
        case 'diagram':
            $svg = $ctx['frozen']['diagram:' . safe_int($a['diagram'] ?? 0)] ?? '';
            return is_string($svg) && $svg !== '' ? '<figure class="lc-diagramme">' . $svg . '</figure>' : '<p class="lc-note">Ce diagramme n’a pas encore été dessiné : ouvre le site dans LCNDA (il se dessine tout seul), puis enregistre.</p>';
        case 'chart':
            $ids = $pid && website_open($pdo, $pid) ? array_keys(h_ancestors($pdo, $pid, 20)) : array_keys($pv['persons']);
            $ids = array_values(array_filter($ids, static fn($id) => website_open($pdo, (int) $id)));
            if (($a['chart'] ?? '') === 'prenoms') {
                $c = [];
                foreach ($ids as $id) { $f = trim(preg_split('/\s+/u', trim((string) $pv['persons'][$id]['first_name']))[0] ?? ''); if ($f !== '') { $c[$f] = ($c[$f] ?? 0) + 1; } }
                arsort($c); $c = array_slice($c, 0, 10, true);
                if (!$c) { return '<p class="lc-note">Pas encore de prénom à compter.</p>'; }
                $max = max($c); $rows = '';
                foreach ($c as $name => $k) { $rows .= '<div class="lc-bar"><span>' . website_e($name) . '</span><i style="width:' . round($k / $max * 100) . '%"></i><b>' . $k . '</b></div>'; }
                return '<figure class="lc-chart"><figcaption>Les prénoms les plus portés</figcaption>' . $rows . '</figure>';
            }
            $dec = [];
            foreach ($ids as $id) { $y = $pv['persons'][$id]['birth_year'] ?? $pv['persons'][$id]['bapt_year'] ?? null; if ($y) { $d = (int) (floor((int) $y / 10) * 10); $dec[$d] = ($dec[$d] ?? 0) + 1; } }
            if (!$dec) { return '<p class="lc-note">Pas encore de naissance datée à compter.</p>'; }
            ksort($dec);
            for ($d = (int) array_key_first($dec); $d < (int) array_key_last($dec) && count($dec) < 80; $d += 10) { $dec[$d] ??= 0; } // les décennies vides aussi
            ksort($dec);
            $max = max($dec); $n = count($dec); $W = 600; $H = 200; $bw = $W / max(1, $n);
            $svg = '<svg class="lc-chart-svg" viewBox="0 0 ' . $W . ' ' . ($H + 24) . '" role="img" aria-label="Naissances par décennie">';
            $i = 0;
            foreach ($dec as $d => $k) {
                $h = round($k / $max * $H, 1); $x = round($i * $bw + 2, 1);
                if ($k > 0) { $svg .= '<rect x="' . $x . '" y="' . ($H - $h) . '" width="' . max(1, round($bw - 4, 1)) . '" height="' . $h . '" class="lc-chart-bar"><title>' . $d . ' : ' . $k . '</title></rect>'; }
                if ($n <= 16 || $i % (int) ceil($n / 12) === 0) { $svg .= '<text x="' . round($x + $bw / 2 - 2, 1) . '" y="' . ($H + 16) . '" class="lc-chart-lbl" text-anchor="middle">' . $d . '</text>'; }
                $i++;
            }
            return '<figure class="lc-chart"><figcaption>Naissances par décennie (' . array_sum($dec) . ')</figcaption>' . $svg . '</svg></figure>';
        case 'photos':
            if (!website_open($pdo, $pid)) { return website_hidden_note('Cette galerie'); }
            $max = max(1, min(60, safe_int($a['max'] ?? 12) ?: 12));
            $mids = [];
            foreach (website_media_people($pdo) as $mid => $people) { if (isset($people[$pid])) { $mids[] = (int) $mid; } }
            $figs = '';
            if ($mids) {
                $in = implode(',', array_map('intval', $mids));
                foreach ($pdo->query("SELECT id, title, filename, date_text FROM media WHERE id IN ($in) AND media_type='image' ORDER BY COALESCE(date_text,''), id") as $m) {
                    if (substr_count($figs, '<figure') >= $max) { break; }
                    if (!website_media_ok($pdo, (int) $m['id'])) { continue; }
                    $url = $img((string) $m['filename']); if ($url === '') { continue; }
                    $figs .= '<figure><img src="' . website_e($url) . '" alt="' . website_e($m['title']) . '" loading="lazy"><figcaption>' . website_e(trim($m['title'] . ($m['date_text'] ? ' · ' . $m['date_text'] : ''))) . '</figcaption></figure>';
                }
            }
            return $figs !== '' ? '<div class="lc-galerie">' . $figs . '</div>' : '<p class="lc-note">Pas encore de photo publiable pour cette personne.</p>';
        case 'place':
            $plid = safe_int($a['place'] ?? 0);
            $s = $pdo->prepare('SELECT name, county, country FROM places WHERE id=?'); $s->execute([$plid]); $pl = $s->fetch(PDO::FETCH_ASSOC);
            if (!$pl) { return '<p class="lc-note">Choisis un lieu pour ce bloc.</p>'; }
            $q = $pdo->prepare("SELECT DISTINCT COALESCE(e.person_id, f.partner1_id) AS a, f.partner2_id AS b, t.label FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id WHERE e.place_id=?");
            $q->execute([$plid]); $who = [];
            foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) { foreach ([(int) $r['a'], (int) $r['b']] as $id) { if ($id && website_open($pdo, $id)) { $who[$id][] = mb_strtolower((string) $r['label']); } } }
            if (!$who) { return '<p class="lc-note">Personne de publiable n’est encore liée à ' . website_e($pl['name']) . '.</p>'; }
            uksort($who, static fn($x, $y) => strcmp(website_name($pv['persons'][$x]), website_name($pv['persons'][$y])));
            $li = '';
            foreach (array_slice($who, 0, 300, true) as $id => $what) { $li .= '<li><b>' . website_e(website_name($pv['persons'][$id])) . '</b> ' . website_e(website_years($pv['persons'][$id])) . ' <small>' . website_e(implode(', ', array_unique($what))) . '</small></li>'; }
            return '<div class="lc-lieu"><p class="lc-lieu-tete">' . website_e(count($who) . (count($who) > 1 ? ' personnes liées à ' : ' personne liée à ') . trim($pl['name'] . ($pl['county'] ? ' (' . $pl['county'] . ')' : ''))) . '</p><ul>' . $li . '</ul></div>';
    }
    return '<p class="lc-note">Bloc inconnu.</p>';
}

/** Les styles des blocs de la généalogie (ajoutés au site, avant la feuille de la personne : elle peut tout changer). */
function website_blocks_css(): string
{
    return <<<'CSS'
/* Blocs de la généalogie (fabriqués par LCNDA : tu peux les changer plus bas dans ta feuille) */
.lc-note{color:#7a6f66;font-style:italic}
.lc-fiche{display:flex;gap:1.2em;align-items:flex-start;padding:1em;border:1px solid rgba(0,0,0,.12);border-radius:var(--lc-arrondi,8px);background:rgba(255,255,255,.6)}
.lc-fiche h3{margin:0 0 .3em}
.lc-portrait{width:120px;height:150px;object-fit:cover;border-radius:var(--lc-arrondi,8px);flex:none}
.lc-fiche-ev{margin:.6em 0 0;padding-left:1.1em}
.lc-tree{display:grid;grid-template-columns:repeat(var(--lc-gens,3),minmax(0,1fr));gap:.6em;overflow-x:auto}
.lc-tree-col{display:flex;flex-direction:column;justify-content:space-around;gap:.4em}
.lc-tree-box{border:1px solid rgba(0,0,0,.18);border-left:4px solid #888;border-radius:6px;padding:.35em .5em;background:#fff;font-size:.85em;line-height:1.25}
.lc-tree-box b{display:block}.lc-tree-box small{color:#666}
.lc-tree-box.is-m{border-left-color:#3d6fb6}.lc-tree-box.is-f{border-left-color:#c2577f}.lc-tree-box.is-empty{opacity:.45}
.lc-frise{list-style:none;margin:0;padding:0;border-left:3px solid var(--lc-principale,#7a2a2a)}
.lc-frise li{display:flex;gap:.8em;margin:0 0 .9em;padding-left:.8em;position:relative}
.lc-frise li::before{content:'';position:absolute;left:-8px;top:.35em;width:13px;height:13px;border-radius:50%;background:var(--lc-principale,#7a2a2a)}
.lc-frise-an{font-weight:700;min-width:3.2em}
.lc-map-img{display:block;width:100%;max-width:760px;height:auto;border-radius:var(--lc-arrondi,8px)}.lc-map-credit{display:block;font-size:.75em;color:#6b625b;margin:.3em 0}
.lc-carte-vive{position:relative;max-width:760px;aspect-ratio:760/460;overflow:hidden;border-radius:var(--lc-arrondi,8px);background:#e8eef3;touch-action:none}.lc-carte-vive .lc-map-img{position:absolute;inset:0;height:100%}
.lc-diagramme{margin:0;max-width:900px}.lc-diagramme svg{width:100%;height:auto;display:block}
.lc-map{margin:0}.lc-map-svg{width:100%;max-width:720px;height:auto;display:block;border-radius:var(--lc-arrondi,8px)}.lc-map-bg{fill:#e8eef3}
.lc-map-dot{fill:var(--lc-principale,#7a2a2a);fill-opacity:.75;stroke:#fff;stroke-width:1.5}.lc-map-lbl{font:12px sans-serif;fill:#333}
.lc-map-list{columns:2;font-size:.9em}
.lc-chart{margin:0}.lc-chart figcaption{font-weight:700;margin-bottom:.4em}.lc-chart-svg{width:100%;max-width:640px;height:auto;display:block}
.lc-chart-bar{fill:var(--lc-principale,#7a2a2a)}.lc-chart-lbl{font:11px sans-serif;fill:#555}
.lc-bar{display:grid;grid-template-columns:8em 1fr 2.5em;gap:.5em;align-items:center;margin:.2em 0}.lc-bar i{display:block;height:.9em;background:var(--lc-principale,#7a2a2a);border-radius:3px}
.lc-galerie{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.8em}
.lc-galerie figure{margin:0}.lc-galerie img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--lc-arrondi,8px);display:block}
.lc-galerie figcaption{font-size:.85em;color:#666;margin-top:.3em}
.lc-lieu ul{columns:2;padding-left:1.1em}.lc-lieu-tete{font-weight:700}
.lc-menu-list{list-style:none;display:flex;flex-wrap:wrap;gap:.3em 1.2em;margin:0;padding:0}
.lc-menu-list a{text-decoration:none;color:inherit;font-weight:600}.lc-menu-list a[aria-current]{text-decoration:underline;text-underline-offset:.3em}
@media (max-width:640px){.lc-fiche{flex-direction:column}.lc-map-list,.lc-lieu ul{columns:1}.lc-tree{grid-template-columns:repeat(var(--lc-gens,3),minmax(140px,1fr))}}
CSS;
}

function website_theme_css(array $t): string
{
    $f = static fn(string $font) => "'" . str_replace("'", '', $font) . "', Georgia, serif";
    return "/* Couleurs et polices du site (onglet 🎨 Styles de LCNDA) */\n:root{--lc-principale:{$t['primary']};--lc-accent:{$t['accent']};--lc-fond:{$t['bg']};--lc-texte:{$t['text']};"
        . "--lc-police:" . $f($t['font']) . ";--lc-police-titres:" . $f($t['headFont']) . ";--lc-largeur:{$t['width']}px;--lc-arrondi:{$t['radius']}px;--lc-taille:{$t['size']}px}\n";
}

/**
 * Trouve les blocs <… data-lc-block="…"> d'une page et remplace leur contenu par le HTML de $fill(attributs).
 * Petit lecteur maison (pas de DOM : PHP 8.3 lit mal le HTML5) : il compte les balises du même nom pour trouver la fin du bloc.
 */
function website_fill_blocks(string $html, callable $fill): string
{
    $out = ''; $pos = 0; $guard = 0;
    while ($guard++ < 2000 && preg_match('#<([a-z][a-z0-9]*)\b([^>]*\sdata-lc-block\s*=\s*["\']?([a-z]+)["\']?[^>]*)>#i', $html, $m, PREG_OFFSET_CAPTURE, $pos)) {
        $tag = strtolower($m[1][0]); $open = $m[0][1]; $afterOpen = $open + strlen($m[0][0]);
        $attrs = ['kind' => strtolower($m[3][0])];
        if (preg_match_all('#\sdata-([a-z][a-z0-9\-]*)\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))#i', $m[2][0], $am, PREG_SET_ORDER)) {
            foreach ($am as $x) { $k = strtolower($x[1]); if ($k === 'lc-block') { continue; } $attrs[$k] = html_entity_decode($x[3] !== '' ? $x[3] : (($x[4] ?? '') !== '' ? $x[4] : ($x[5] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8'); }
        }
        // la fin du bloc : la balise fermante du même nom, en comptant celles qui s'ouvrent dedans
        $depth = 1; $scan = $afterOpen; $close = -1; $closeEnd = -1;
        while ($depth > 0 && preg_match('#<(/?)' . preg_quote($tag, '#') . '\b[^>]*>#i', $html, $t, PREG_OFFSET_CAPTURE, $scan)) {
            $depth += $t[1][0] === '/' ? -1 : 1;
            $scan = $t[0][1] + strlen($t[0][0]);
            if ($depth === 0) { $close = $t[0][1]; $closeEnd = $scan; }
        }
        $out .= substr($html, $pos, $afterOpen - $pos);
        $inner = in_array($attrs['kind'], SITE_BLOCK_KINDS, true) ? $fill($attrs) : '';
        if ($close < 0) { $out .= $inner . '</' . $tag . '>'; $pos = strlen($html); break; }
        $out .= $inner . '</' . $tag . '>';
        $pos = $closeEnd;
    }
    return $out . substr($html, $pos);
}

/**
 * Une page du site, prête : blocs remplis, images remplacées ($img), noms cachés retirés.
 * $mode : 'preview' (dans l'app : adresses media/…), 'export' (le .zip), 'inline' (un seul fichier, images en data:).
 * Rend [html du corps, nombre de noms retirés, images refusées].
 */
function website_page_body(PDO $pdo, array $site, int $idx, callable $img, string $mode, ?callable $asset = null, ?callable $live = null): array
{
    $page = $site['pages'][$idx];
    $ctx = ['pages' => array_map(static fn($p) => ['slug' => $p['slug'], 'name' => $p['name']], $site['pages']), 'current' => $page['slug'],
        'frozen' => is_array($site['frozen'] ?? null) ? $site['frozen'] : [], 'asset' => $asset, 'live' => $live];
    $html = website_fill_blocks($page['html'], static fn($a) => website_block_html($pdo, $a, $img, $ctx));
    // les images de la page et des styles écrits dans la page : media/… → l'adresse de l'export (ou rien si refusée)
    $refused = 0;
    // une image refusée (une personne cachée dessus) part en entier : la balise et son texte de remplacement
    $html = (string) preg_replace_callback('#<img\b[^>]*?\ssrc\s*=\s*["\']media/([^"\'?\#]+)["\'][^>]*>#i', static function ($m) use ($img, &$refused) {
        $u = $img(rawurldecode($m[1])); if ($u === '') { $refused++; return ''; }
        return (string) preg_replace('#(\ssrc\s*=\s*["\'])media/[^"\'?\#]+#i', '${1}' . str_replace(['\\', '$'], ['\\\\', '\\$'], htmlspecialchars($u, ENT_QUOTES)), $m[0], 1);
    }, $html);
    $html = (string) preg_replace_callback('#(\s(?:src|href|poster)\s*=\s*["\'])media/([^"\'?\#]+)(["\'])#i', static function ($m) use ($img, &$refused) {
        $u = $img(rawurldecode($m[2])); if ($u === '') { $refused++; return $m[1] . 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' . $m[3]; }
        return $m[1] . htmlspecialchars($u, ENT_QUOTES) . $m[3];
    }, $html);
    $html = (string) preg_replace_callback('#url\(\s*(["\']?)media/([^"\')]+)\1\s*\)#i', static function ($m) use ($img, &$refused) { $u = $img(rawurldecode($m[2])); if ($u === '') { $refused++; return 'none'; } return 'url(' . $u . ')'; }, $html);
    $names = 0;
    if ($mode !== 'preview') { [$html, $names] = website_redact($pdo, $html); }
    return [$html, $names, $refused];
}

function website_css_with_media(PDO $pdo, string $css, callable $img, int &$refused): string
{
    return (string) preg_replace_callback('#url\(\s*(["\']?)media/([^"\')]+)\1\s*\)#i', static function ($m) use ($img, &$refused) { $u = $img(rawurldecode($m[2])); if ($u === '') { $refused++; return 'none'; } return 'url("' . $u . '")'; }, $css);
}

/** Une image de la base pour le site : réduite (1600 px), réenregistrée sans EXIF ; [octets, extension] ou null */
function website_image_bytes(string $path, int $max = SITE_IMG_MAX): ?array
{
    $info = @getimagesize($path);
    if (!$info || !extension_loaded('gd') || (int) $info[0] * (int) $info[1] > 60000000) { return null; }
    $loader = match ($info[2]) { IMAGETYPE_JPEG => 'imagecreatefromjpeg', IMAGETYPE_PNG => 'imagecreatefrompng', IMAGETYPE_WEBP => 'imagecreatefromwebp', IMAGETYPE_GIF => 'imagecreatefromgif', default => null };
    $im = $loader && function_exists($loader) ? @$loader($path) : null;
    if (!$im) { return null; }
    $alpha = in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true);
    $r = min(1, $max / max($info[0], $info[1]));
    $w = max(1, (int) round($info[0] * $r)); $h = max(1, (int) round($info[1] * $r));
    $out = imagecreatetruecolor($w, $h);
    if ($alpha) { imagealphablending($out, false); imagesavealpha($out, true); imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127)); }
    else { imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255)); }
    imagecopyresampled($out, $im, 0, 0, 0, 0, $w, $h, $info[0], $info[1]);
    ob_start();
    if ($alpha) { imagepng($out, null, 8); $ext = 'png'; } else { imagejpeg($out, null, 84); $ext = 'jpg'; }
    $bytes = (string) ob_get_clean();
    imagedestroy($out); imagedestroy($im);
    return [$bytes, $ext];
}

/** Le fichier d'un média, s'il est bien dans le dossier des médias */
function website_media_path(string $file): ?string
{
    $root = realpath(MEDIA_DIR);
    $path = $root ? realpath(MEDIA_DIR . '/' . $file) : false;
    return $root && $path && str_starts_with($path, $root . DIRECTORY_SEPARATOR) && is_file($path) ? $path : null;
}

function website_csp(string $mode): string
{
    return $mode === 'export'
        ? "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self' mailto: https:"
        : "default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
}

/** Le document HTML complet d'une page. $css / $js : le texte (inline) ou null (fichiers css/style.css et js/script.js). */
/** Le petit script des cartes interactives (assets/js/site-carte-vive.js), copié dans le site */
function website_live_map_js(): string
{
    return (string) @file_get_contents(APP_ROOT . '/assets/js/site-carte-vive.js');
}

function website_document(array $site, int $idx, string $body, ?string $css, ?string $js, string $mode, bool $live = false): string
{
    $page = $site['pages'][$idx];
    $title = $page['title'] !== '' ? $page['title'] : trim($page['name'] . ($site['settings']['title'] !== '' && $idx > 0 ? ' — ' . $site['settings']['title'] : ($idx === 0 && $site['settings']['title'] !== '' ? ' — ' . $site['settings']['title'] : '')));
    $desc = $page['desc'] !== '' ? $page['desc'] : $site['settings']['desc'];
    $h = "<!doctype html>\n<html lang=\"" . website_e($site['settings']['lang']) . "\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        . '<meta http-equiv="Content-Security-Policy" content="' . htmlspecialchars(website_csp($mode), ENT_COMPAT) . "\">\n<meta name=\"referrer\" content=\"strict-origin-when-cross-origin\">\n"
        . '<title>' . website_e($title) . "</title>\n" . ($desc !== '' ? '<meta name="description" content="' . website_e($desc) . "\">\n" : '') . '<meta name="generator" content="LCNDA — Mon site web">' . "\n"
        . ($css === null ? "<link rel=\"stylesheet\" href=\"css/style.css\">\n" : '<style>' . str_ireplace('</style', '<\/style', $css) . "</style>\n") . "</head>\n<body>\n" . $body . "\n";
    if ($js === null) { $h .= ($live ? "<script src=\"js/carte-lcnda.js\" defer></script>\n" : '') . (trim($site['js']) !== '' ? "<script src=\"js/script.js\" defer></script>\n" : ''); }
    else { if ($live) { $h .= '<script>' . website_js_clean(website_live_map_js()) . "</script>\n"; } if (trim($js) !== '') { $h .= '<script>' . website_js_clean($js) . "</script>\n"; } }
    return $h . "</body>\n</html>\n";
}

/** La feuille complète : couleurs et polices, blocs de la généalogie, puis celle de la personne */
function website_full_css(array $site): string
{
    return website_theme_css($site['theme']) . "\n" . website_blocks_css() . "\n\n/* Ta feuille de styles */\n" . $site['css'];
}

/** Le site enregistré, relu et revérifié (comme à l'enregistrement) */
function website_load(PDO $pdo, int $id): array
{
    $r = website_get($pdo, $id);
    [$clean] = website_check($r['data']);
    return [$r, $clean];
}

/** Tout le site : fichiers à mettre dans le .zip (chemin → octets) et le résumé ; rien n'est écrit sur le disque. */
function website_build(PDO $pdo, array $site, string $mode = 'export'): array
{
    $files = []; $assets = []; $k = 0; $sum = ['pages' => 0, 'images' => 0, 'refused' => 0, 'names' => 0, 'missing' => 0, 'bytes' => 0, 'refused_titles' => []];
    $img = static function (string $file) use ($pdo, &$assets, &$k, &$files, &$sum, $mode): string {
        $file = ltrim(str_replace('\\', '/', $file), '/');
        if (isset($assets[$file])) { return $assets[$file]; }
        $m = website_media_by_file($pdo, $file);
        if (!$m) { $sum['missing']++; return $assets[$file] = ''; } // un fichier qui n'est pas un média de la base : il ne part pas
        if (!website_media_ok($pdo, (int) $m['id'])) { $sum['refused']++; if (count($sum['refused_titles']) < 8) { $sum['refused_titles'][] = (string) ($m['title'] ?: 'image'); } return $assets[$file] = ''; }
        $path = website_media_path((string) $m['filename']);
        if ($mode === 'check') { if (!$path) { $sum['missing']++; return $assets[$file] = ''; } $k++; $sum['images']++; return $assets[$file] = "images/m{$k}.jpg"; } // le résumé : sans refaire les images
        $bytes = $path ? website_image_bytes($path) : null;
        if (!$bytes) { $sum['missing']++; return $assets[$file] = ''; }
        $k++;
        if ($mode === 'inline') { return $assets[$file] = 'data:image/' . ($bytes[1] === 'png' ? 'png' : 'jpeg') . ';base64,' . base64_encode($bytes[0]); }
        $name = "images/m{$k}.{$bytes[1]}";
        $files[$name] = $bytes[0]; $sum['images']++; $sum['bytes'] += strlen($bytes[0]);
        return $assets[$file] = $name;
    };
    // les cartes figées (image envoyée par l'app) : réenregistrées, nom fabriqué
    $c = 0;
    $asset = static function (string $data, string $base) use (&$files, &$sum, &$c, $mode): string {
        if ($mode === 'check') { $c++; $sum['images']++; return "images/{$base}-{$c}.jpg"; }
        $b = website_image_from_data($data); if (!$b) { $sum['missing']++; return ''; }
        $c++;
        if ($mode === 'inline') { return 'data:image/jpeg;base64,' . base64_encode($b[0]); }
        $name = "images/{$base}-{$c}.{$b[1]}"; $files[$name] = $b[0]; $sum['images']++; $sum['bytes'] += strlen($b[0]);
        return $name;
    };
    $livePages = [];
    $pages = [];
    foreach ($site['pages'] as $i => $p) {
        [$body, $names, $refused] = website_page_body($pdo, $site, $i, $img, $mode, $asset, static function () use (&$livePages, $i) { $livePages[$i] = true; });
        $sum['names'] += $names;
        $pages[$i] = $body;
        $sum['pages']++;
    }
    $refusedCss = 0;
    $css = website_css_with_media($pdo, website_full_css($site), $img, $refusedCss);
    [$cssRed, $n2] = website_redact($pdo, $css); $sum['names'] += $n2;
    [$js, $n3] = website_redact($pdo, $site['js']); $sum['names'] += $n3;
    foreach ($pages as $i => $body) {
        $name = $i === 0 ? 'index.html' : $site['pages'][$i]['slug'] . '.html';
        $files[$name] = $mode === 'inline' ? website_document($site, $i, $body, $cssRed, $js, 'preview', isset($livePages[$i])) : website_document($site, $i, $body, null, null, 'export', isset($livePages[$i]));
    }
    if ($livePages && $mode !== 'inline') { $files['js/carte-lcnda.js'] = website_live_map_js(); } // la carte interactive : notre petit script, pas de bibliothèque
    if ($mode !== 'inline') {
        $files['css/style.css'] = $cssRed;
        if (trim($js) !== '') { $files['js/script.js'] = $js; }
        $files['LISEZ-MOI.txt'] = "« " . ($site['settings']['title'] ?: 'Mon site') . " » — site fait avec LCNDA (" . date('d/m/Y') . ")\r\n\r\n"
            . "Pour le voir : décompresse le dossier, puis ouvre index.html (double-clic).\r\n"
            . "Pour le mettre en ligne : envoie TOUT le contenu du dossier (index.html, les autres pages .html, css/, js/, images/) chez ton hébergeur (OVH, o2switch, Netlify, GitHub Pages…).\r\n\r\n"
            . "Les personnes vivantes et les fiches confidentielles n’y figurent pas ; les photos ont été réduites et nettoyées (sans données GPS ni appareil).\r\n";
    }
    return ['files' => $files, 'summary' => $sum];
}

/** Petit bout de HTML des blocs pour l'aperçu de l'app (images en media/…, rien de caché) */
function website_render(PDO $pdo, array $q): array
{
    $list = json_decode((string) ($q['blocks'] ?? '[]'), true);
    $pages = json_decode((string) ($q['pages'] ?? '[]'), true);
    $ctx = ['pages' => is_array($pages) ? array_slice(array_values(array_filter($pages, 'is_array')), 0, SITE_PAGES_MAX) : [], 'current' => (string) ($q['current'] ?? '')];
    $img = static function (string $file) use ($pdo): string {
        $m = website_media_by_file($pdo, ltrim($file, '/'));
        return $m && website_media_ok($pdo, (int) $m['id']) && website_media_path((string) $m['filename']) ? 'media/' . rawurlencode((string) $m['filename']) : '';
    };
    $out = [];
    foreach (array_slice(is_array($list) ? $list : [], 0, 80) as $a) {
        if (!is_array($a) || !in_array((string) ($a['kind'] ?? ''), SITE_BLOCK_KINDS, true)) { $out[] = ''; continue; }
        $a = array_map(static fn($v) => is_scalar($v) ? mb_substr((string) $v, 0, 200) : '', $a);
        $out[] = website_block_html($pdo, $a, $img, $ctx);
    }
    return ['html' => $out, 'css' => website_blocks_css(), 'live' => array_keys(SITE_MAP_LIVE)];
}

/** GET website_preview / website_export / website_export_check */
function website_dispatch(PDO $pdo, string $action, array $q): never
{
    try {
        @ini_set('memory_limit', '1024M');
        [$row, $site] = website_load($pdo, safe_int($q['id'] ?? 0));
        if ($action === 'website_export_check') {
            $b = website_build($pdo, $site, 'check');
            $s = $b['summary'];
            json_response(['ok' => true, 'summary' => $s, 'files' => array_keys($b['files']), 'gd' => extension_loaded('gd'), 'zip' => class_exists('ZipArchive')]);
        }
        $slug = website_slug((string) ($q['page'] ?? 'index'));
        $idx = 0;
        foreach ($site['pages'] as $i => $p) { if ($p['slug'] === $slug) { $idx = $i; } }
        if ($action === 'website_preview' || ($action === 'website_export' && ($q['format'] ?? '') === 'html')) {
            // une page seule, tout dedans (styles, script, images en data:) ; dans le navigateur, isolée (origine opaque)
            $b = website_build($pdo, $site, 'inline');
            $name = $idx === 0 ? 'index.html' : $site['pages'][$idx]['slug'] . '.html';
            $html = $b['files'][$name];
            if ($action === 'website_preview') {
                // les liens vers les autres pages restent dans l'aperçu
                $id = (int) $row['id'];
                $html = (string) preg_replace_callback('#href="([a-z0-9\-]+)\.html(\#[^"]*)?"#', static fn($m) => 'href="api.php?action=website_preview&amp;id=' . $id . '&amp;page=' . $m[1] . ($m[2] ?? '') . '"', $html);
                header('Content-Security-Policy: sandbox allow-scripts allow-forms; ' . website_csp('preview'));
                header('Content-Type: text/html; charset=utf-8');
                header('X-Content-Type-Options: nosniff');
                header('Cache-Control: no-store, private');
                header('Referrer-Policy: no-referrer');
                echo $html;
                exit;
            }
            header('Content-Type: text/html; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . website_slug($row['name']) . '-' . $site['pages'][$idx]['slug'] . '.html"');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store, private');
            echo $html;
            exit;
        }
        if (!class_exists('ZipArchive')) { json_response(['error' => 'Export impossible : l’extension PHP zip manque.'], 500); }
        @set_time_limit(600);
        $b = website_build($pdo, $site, 'export');
        $tmp = tempnam(sys_get_temp_dir(), 'site');
        $zip = new ZipArchive();
        if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) { throw new RuntimeException('Impossible de préparer le fichier.'); }
        foreach ($b['files'] as $path => $bytes) { $zip->addFromString($path, $bytes); }
        $zip->close();
        $name = 'site-' . website_slug($row['name']) . '-' . date('Ymd') . '.zip';
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . filesize($tmp));
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        readfile($tmp); @unlink($tmp);
        exit;
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], 422);
    }
}
