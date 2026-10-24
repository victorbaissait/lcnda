<?php
declare(strict_types=1);

/**
 * 🎞️ Diaporamas et récits (interface : assets/js/heritage-slideshow.js) : des diapositives (photos, titres, cartes animées
 * d'un trajet), une musique, des voix enregistrées. Un diaporama = un document JSON ; les photos et les sons restent dans
 * les médias. Table créée à la première utilisation (sans changer le numéro de structure).
 * Deux sortes : le diaporama simple (mode absent ou « slideshow », diapositives photo / titre / carte) et la présentation
 * façon Keynote (mode « keynote », assets/js/heritage-keynote.js) : des diapositives d'objets libres (textes, images,
 * formes, tableaux, graphiques, fiches de personnes, vidéos, sons), des animations et des transitions. Tout est
 * nettoyé ici (longueurs, nombres, couleurs, polices, fichiers des médias seulement, petites images data: sûres).
 */

const SLIDESHOW_MAX = 8000000; // une présentation (Keynote) peut garder de petites images collées (data:)

function slideshows_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS slideshows (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    $done = true;
}

function slideshows_list(PDO $pdo): array
{
    slideshows_ensure($pdo);
    $out = [];
    foreach ($pdo->query('SELECT id, name, data_json, updated_at FROM slideshows ORDER BY updated_at DESC')->fetchAll() as $r) {
        $d = json_decode((string) $r['data_json'], true) ?: [];
        $slides = is_array($d['slides'] ?? null) ? $d['slides'] : [];
        $cover = ''; $mode = ($d['mode'] ?? '') === 'keynote' ? 'keynote' : 'slideshow';
        foreach ($slides as $s) {
            if (($s['type'] ?? '') === 'photo' && !empty($s['filename'])) { $cover = (string) $s['filename']; break; }
            if ($mode === 'keynote') { if (!empty($s['bg']['filename'])) { $cover = (string) $s['bg']['filename']; break; } foreach ((array) ($s['objs'] ?? []) as $o) { if (is_array($o) && ($o['t'] ?? '') === 'image' && !empty($o['filename'])) { $cover = (string) $o['filename']; break 2; } } }
        }
        $dur = 0.0; foreach ($slides as $s) { $dur += is_numeric($s['dur'] ?? null) ? (float) $s['dur'] : 5; }
        $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'updated_at' => $r['updated_at'], 'slides' => count($slides), 'duration' => round($dur), 'cover' => $cover, 'mode' => $mode];
    }
    return $out;
}

function slideshow_get(PDO $pdo, int $id): array
{
    slideshows_ensure($pdo);
    $s = $pdo->prepare('SELECT * FROM slideshows WHERE id=?'); $s->execute([$id]); $r = $s->fetch();
    if (!$r) { throw new RuntimeException('Diaporama introuvable.'); }
    return ['id' => (int) $r['id'], 'name' => $r['name'], 'show' => json_decode((string) $r['data_json'], true) ?: new stdClass(), 'updated_at' => $r['updated_at']];
}

function save_slideshow(PDO $pdo, array $data): array
{
    slideshows_ensure($pdo);
    $id = safe_int($data['id'] ?? 0);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200) ?: 'Mon diaporama';
    $show = is_array($data['show'] ?? null) ? $data['show'] : [];
    if (($show['mode'] ?? '') === 'keynote') { $show = keynote_clean_show($show); }
    else {
        // les fichiers cités doivent être des médias de la base (rien d'autre n'est lu)
        $okFile = static fn($f) => is_string($f) && $f !== '' && preg_match('#^[A-Za-z0-9._%\-/]{1,240}$#', $f) && !str_contains($f, '..');
        foreach (['music'] as $k) { if (isset($show[$k]['filename']) && !$okFile($show[$k]['filename'])) { unset($show[$k]); } }
        $slides = [];
        foreach (array_slice(is_array($show['slides'] ?? null) ? $show['slides'] : [], 0, 400) as $s) {
            if (!is_array($s) || !in_array($s['type'] ?? '', ['photo', 'title', 'map'], true)) { continue; }
            if (isset($s['filename']) && !$okFile($s['filename'])) { unset($s['filename']); }
            if (isset($s['voice']['filename']) && !$okFile($s['voice']['filename'])) { unset($s['voice']); }
            $slides[] = $s;
        }
        $show['slides'] = $slides;
    }
    $json = json_encode($show, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > SLIDESHOW_MAX) { throw new RuntimeException('Diaporama trop lourd.'); }
    if ($id) {
        $s = $pdo->prepare('UPDATE slideshows SET name=?, data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'); $s->execute([$name, $json, $id]);
        if (!$s->rowCount()) { throw new RuntimeException('Diaporama introuvable.'); }
    } else {
        $pdo->prepare('INSERT INTO slideshows(name, data_json) VALUES(?,?)')->execute([$name, $json]);
        $id = (int) $pdo->lastInsertId();
    }
    log_change($pdo, 'meta', 0, 'update', 'Diaporama enregistré : ' . $name);
    return ['id' => $id];
}

function delete_slideshow(PDO $pdo, array $data): array
{
    slideshows_ensure($pdo);
    $pdo->prepare('DELETE FROM slideshows WHERE id=?')->execute([safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

function rename_slideshow(PDO $pdo, array $data): array
{
    slideshows_ensure($pdo);
    $name = mb_substr(safe_text($data['name'] ?? ''), 0, 200);
    if ($name === '') { throw new RuntimeException('Nom manquant.'); }
    $pdo->prepare('UPDATE slideshows SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, safe_int($data['id'] ?? 0)]);
    return ['ok' => true];
}

/* ═════════ 🎞️ Présentation façon Keynote : le nettoyage ═════════ */

function kn_file_ok(mixed $f): bool { return is_string($f) && $f !== '' && preg_match('#^[A-Za-z0-9._%\-/]{1,240}$#', $f) === 1 && !str_contains($f, '..'); }
function kn_color(mixed $c): ?string { $c = is_string($c) ? trim($c) : ''; return preg_match('/^#[0-9a-f]{3,8}$/i', $c) ? strtolower($c) : null; }
function kn_num(mixed $v, float $min, float $max, float $def): float { return is_numeric($v) && is_finite((float) $v) ? max($min, min($max, (float) $v)) : $def; }
function kn_id(mixed $v): ?string { return is_string($v) && preg_match('/^[A-Za-z0-9_\-]{1,40}$/', $v) ? $v : null; }
function kn_text(mixed $v, int $max): string { return is_scalar($v) ? mb_substr(str_replace("\0", '', (string) $v), 0, $max) : ''; }
function kn_font(mixed $v): string { return is_string($v) ? mb_substr(preg_replace('/[^\p{L}\p{N}\s\-\'",.]/u', '', $v) ?? '', 0, 120) : ''; }
/** une petite image collée : seulement data:image/png|jpeg|webp|gif en base64 (pas de SVG : il pourrait contenir du script) */
function kn_data_img(mixed $v, int $max = 1500000): ?string { return is_string($v) && strlen($v) <= $max && preg_match('#^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$#', $v) ? $v : null; }
function kn_clean_style(string $st): string
{
    $ok = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'text-decoration', 'text-decoration-line', 'text-align', 'line-height', 'letter-spacing', 'vertical-align'];
    $out = [];
    foreach (explode(';', $st) as $decl) {
        $p = explode(':', $decl, 2); if (count($p) < 2) { continue; }
        $k = strtolower(trim($p[0])); $v = trim($p[1]);
        if (!in_array($k, $ok, true) || $v === '' || strlen($v) > 120 || preg_match('/url|expression|javascript|[<>\\\\{}@]/i', $v) || !preg_match('/^[#\p{L}\p{N} .,%\'"\-()]+$/u', $v)) { continue; }
        $out[] = $k . ': ' . $v;
    }
    return implode('; ', array_slice($out, 0, 12));
}
/** le texte riche d'une zone de texte : quelques balises, et un style limité */
function kn_clean_html(mixed $h): string
{
    $h = kn_text($h, 30000);
    $h = preg_replace('#<(script|style|iframe|object|embed|svg|math|template|textarea|title|noscript)\b[^>]*>.*?</\1\s*>#is', '', $h) ?? '';
    $h = strip_tags($h, '<b><strong><i><em><u><s><strike><br><div><p><ul><ol><li><span><sup><sub>');
    return preg_replace_callback('#<(/?)([a-z]+)\b([^>]*)>#i', static function ($m) {
        $tag = strtolower($m[2]);
        if ($m[1] !== '') { return "</$tag>"; }
        $st = '';
        if (preg_match('#\sstyle\s*=\s*("([^"]*)"|\'([^\']*)\')#i', $m[3], $x)) { $st = kn_clean_style(html_entity_decode(($x[2] ?? '') !== '' ? $x[2] : ($x[3] ?? ''), ENT_QUOTES | ENT_HTML5)); }
        return "<$tag" . ($st !== '' ? ' style="' . htmlspecialchars($st, ENT_QUOTES) . '"' : '') . '>';
    }, $h) ?? '';
}
/** des données « instantanées » (fiche d'une personne) : des textes et nombres, peu profonds */
function kn_plain(mixed $v, int $depth = 0): mixed
{
    if (is_bool($v)) { return $v; }
    if (is_int($v) || is_float($v)) { return is_finite((float) $v) ? $v : 0; }
    if (is_string($v)) { return mb_substr($v, 0, 600); }
    if (!is_array($v) || $depth > 3) { return null; }
    $out = []; $n = 0;
    foreach ($v as $k => $x) {
        if (++$n > 60) { break; }
        if (is_string($k) && !preg_match('/^[A-Za-z0-9_]{1,30}$/', $k)) { continue; }
        $c = kn_plain($x, $depth + 1); if ($c !== null) { $out[$k] = $c; }
    }
    return $out;
}
const KN_OBJ_TYPES = ['text', 'image', 'shape', 'table', 'chart', 'person', 'video', 'audio', 'link'];
function keynote_clean_obj(array $o): ?array
{
    $t = $o['t'] ?? ''; if (!in_array($t, KN_OBJ_TYPES, true)) { return null; }
    $id = kn_id($o['id'] ?? null); if (!$id) { return null; }
    $r = ['id' => $id, 't' => $t, 'x' => kn_num($o['x'] ?? 0, -20000, 20000, 0), 'y' => kn_num($o['y'] ?? 0, -20000, 20000, 0), 'w' => kn_num($o['w'] ?? 100, 1, 20000, 100), 'h' => kn_num($o['h'] ?? 100, 1, 20000, 100),
        'rot' => kn_num($o['rot'] ?? 0, -360, 360, 0), 'op' => kn_num($o['op'] ?? 1, 0, 1, 1)];
    foreach (['lock', 'hide', 'shadow', 'flipH', 'flipV', 'autoplay', 'loop', 'muted', 'controls', 'head', 'italic', 'acc', 'nofill'] as $k) { if (!empty($o[$k])) { $r[$k] = true; } }
    if ($g = kn_id($o['g'] ?? null)) { $r['g'] = $g; }
    if ($t === 'link') { $a = kn_id($o['from'] ?? null); $b = kn_id($o['to'] ?? null); if (!$a || !$b) { return null; } $r['from'] = $a; $r['to'] = $b; } // ↔ un trait accroché à deux objets
    if ($t === 'shape' && ($o['kind'] ?? '') === 'combo' && is_array($o['parts'] ?? null)) { // ⊕ deux formes fusionnées
        $r['mop'] = in_array($o['mop'] ?? '', ['union', 'subtract', 'intersect'], true) ? $o['mop'] : 'union'; $r['parts'] = [];
        foreach (array_slice(array_values($o['parts']), 0, 2) as $q) { if (!is_array($q)) { continue; } $p = ['kind' => preg_match('/^[a-z]{1,20}$/', (string) ($q['kind'] ?? '')) ? (string) $q['kind'] : 'rect'];
            foreach (['x' => [-20000, 20000], 'y' => [-20000, 20000], 'w' => [1, 20000], 'h' => [1, 20000], 'points' => [3, 40], 'inner' => [5, 95], 'radius' => [0, 2000]] as $k => [$lo, $hi]) { if (isset($q[$k]) && is_numeric($q[$k])) { $p[$k] = kn_num($q[$k], $lo, $hi, $lo); } }
            $r['parts'][] = $p; } }
    foreach (['name' => 80, 'role' => 20, 'caption' => 300, 'text' => 4000, 'kind' => 20, 'fit' => 12, 'mask' => 12, 'align' => 10, 'valign' => 10, 'dash' => 10, 'view' => 12, 'arrow' => 10] as $k => $max) { if (isset($o[$k]) && is_scalar($o[$k]) && $o[$k] !== '') { $r[$k] = kn_text($o[$k], $max); } }
    foreach (['fill', 'stroke', 'color', 'headFill', 'headColor', 'border', 'shColor'] as $k) { if (($c = kn_color($o[$k] ?? null)) !== null) { $r[$k] = $c; } }
    foreach (['font'] as $k) { if (isset($o[$k]) && ($f = kn_font($o[$k])) !== '') { $r[$k] = $f; } }
    $nums = ['size' => [4, 600], 'sw' => [0, 200], 'radius' => [0, 2000], 'lh' => [0.6, 4], 'pad' => [0, 400], 'zoom' => [1, 8], 'px' => [0, 100], 'py' => [0, 100], 'bw' => [0, 100], 'vol' => [0, 1], 'ls' => [-20, 100],
        'bright' => [0, 300], 'contrast' => [0, 300], 'sat' => [0, 300], 'sepia' => [0, 100], 'gray' => [0, 100], 'blur' => [0, 40], 'points' => [3, 40], 'inner' => [5, 95], 'pid' => [0, 1e12], 'media_id' => [0, 1e12], 'start' => [0, 86400], 'weight' => [100, 900], 'shBlur' => [0, 200], 'gens' => [1, 4]];
    foreach ($nums as $k => [$a, $b]) { if (isset($o[$k]) && is_numeric($o[$k])) { $r[$k] = kn_num($o[$k], $a, $b, $a); if (in_array($k, ['pid', 'media_id', 'weight', 'points', 'gens'], true)) { $r[$k] = (int) $r[$k]; } } }
    if (isset($o['html'])) { $r['html'] = kn_clean_html($o['html']); }
    if (isset($o['filename']) && kn_file_ok($o['filename'])) { $r['filename'] = $o['filename']; }
    if (isset($o['poster']) && kn_file_ok($o['poster'])) { $r['poster'] = $o['poster']; }
    if (isset($o['src']) && ($d = kn_data_img($o['src'])) !== null) { $r['src'] = $d; }
    if ($t === 'table' && is_array($o['rows'] ?? null)) {
        $r['rows'] = array_map(static fn($row) => array_map(static fn($c) => kn_text($c, 600), array_slice(is_array($row) ? array_values($row) : [], 0, 16)), array_slice(array_values($o['rows']), 0, 40));
    }
    if ($t === 'chart' && is_array($o['spec'] ?? null)) {
        $sp = $o['spec']; $c = ['kind' => preg_match('/^[a-z0-9_]{1,30}$/i', (string) ($sp['kind'] ?? '')) ? (string) $sp['kind'] : 'columns'];
        $c['o'] = []; foreach (array_slice(is_array($sp['o'] ?? null) ? $sp['o'] : [], 0, 40, true) as $k => $v) { if (is_string($k) && preg_match('/^[A-Za-z0-9_]{1,24}$/', $k) && is_scalar($v)) { $c['o'][$k] = is_string($v) ? mb_substr($v, 0, 200) : $v; } }
        foreach (['rows', 'series'] as $key) { $c[$key] = []; foreach (array_slice(is_array($sp[$key] ?? null) ? $sp[$key] : [], 0, 200) as $row) { if (!is_array($row)) { continue; } $x = []; foreach (array_slice($row, 0, 20, true) as $k => $v) { if (is_string($k) && preg_match('/^[A-Za-z0-9_]{1,24}$/', $k) && is_scalar($v)) { $x[$k] = is_string($v) ? mb_substr($v, 0, 200) : $v; } } $c[$key][] = $x; } }
        $r['spec'] = $c;
    }
    if ($t === 'person' && is_array($o['data'] ?? null)) { $r['data'] = kn_plain($o['data']); if (isset($r['data']['portrait']) && !kn_file_ok($r['data']['portrait'])) { unset($r['data']['portrait']); } }
    return $r;
}
const KN_TRANS = ['none', 'fade', 'dissolve', 'push', 'movein', 'reveal', 'wipe', 'zoom', 'flip', 'cube', 'swap', 'magic', 'blinds', 'black'];
const KN_FX = ['appear', 'fade', 'fly', 'scale', 'type', 'blur', 'spin', 'drop', 'wipe', 'pop', 'path'];
function keynote_clean_slide(array $s): ?array
{
    $id = kn_id($s['id'] ?? null); if (!$id) { return null; }
    $r = ['id' => $id, 'type' => 'kn', 'layout' => preg_match('/^[a-z0-9_-]{1,20}$/', (string) ($s['layout'] ?? '')) ? (string) $s['layout'] : 'blank', 'dur' => kn_num($s['dur'] ?? 5, 1, 600, 5)];
    foreach (['skip', 'auto', 'collapsed', 'noMaster'] as $k) { if (!empty($s[$k])) { $r[$k] = true; } }
    $r['section'] = kn_text($s['section'] ?? '', 80); $r['notes'] = kn_text($s['notes'] ?? '', 20000);
    $bg = is_array($s['bg'] ?? null) ? $s['bg'] : [];
    $b = ['type' => in_array($bg['type'] ?? '', ['theme', 'color', 'gradient', 'radial', 'image'], true) ? $bg['type'] : 'theme', 'angle' => kn_num($bg['angle'] ?? 135, 0, 360, 135), 'fit' => in_array($bg['fit'] ?? '', ['cover', 'contain'], true) ? $bg['fit'] : 'cover', 'dim' => kn_num($bg['dim'] ?? 0, 0, 90, 0)];
    foreach (['c1', 'c2'] as $k) { if (($c = kn_color($bg[$k] ?? null)) !== null) { $b[$k] = $c; } }
    if (isset($bg['filename']) && kn_file_ok($bg['filename'])) { $b['filename'] = $bg['filename']; }
    if (isset($bg['src']) && ($d = kn_data_img($bg['src'])) !== null) { $b['src'] = $d; }
    $r['bg'] = $b;
    $tr = is_array($s['trans'] ?? null) ? $s['trans'] : [];
    $r['trans'] = ['type' => in_array($tr['type'] ?? '', KN_TRANS, true) ? $tr['type'] : 'dissolve', 'dur' => kn_num($tr['dur'] ?? .8, 0.1, 5, .8), 'dir' => in_array($tr['dir'] ?? '', ['l', 'r', 't', 'b'], true) ? $tr['dir'] : 'l'];
    $objs = []; $ids = [];
    foreach (array_slice(is_array($s['objs'] ?? null) ? $s['objs'] : [], 0, 300) as $o) { if (is_array($o) && ($c = keynote_clean_obj($o)) && !isset($ids[$c['id']])) { $ids[$c['id']] = 1; $objs[] = $c; } }
    $r['objs'] = $objs;
    $builds = [];
    foreach (array_slice(is_array($s['builds'] ?? null) ? $s['builds'] : [], 0, 300) as $bd) {
        if (!is_array($bd) || !($oid = kn_id($bd['obj'] ?? null)) || !isset($ids[$oid])) { continue; }
        $builds[] = ['id' => kn_id($bd['id'] ?? null) ?? ('b' . count($builds)), 'obj' => $oid, 'kind' => ($bd['kind'] ?? '') === 'out' ? 'out' : 'in', 'fx' => in_array($bd['fx'] ?? '', KN_FX, true) ? $bd['fx'] : 'fade',
            'dir' => in_array($bd['dir'] ?? '', ['l', 'r', 't', 'b'], true) ? $bd['dir'] : 'l', 'dur' => kn_num($bd['dur'] ?? .6, 0.05, 20, .6), 'delay' => kn_num($bd['delay'] ?? 0, 0, 60, 0), 'start' => in_array($bd['start'] ?? '', ['click', 'with', 'after'], true) ? $bd['start'] : 'click']
            + (($bd['fx'] ?? '') === 'path' ? ['pk' => in_array($bd['pk'] ?? '', ['line', 'arc', 'wave', 'zigzag', 'loop'], true) ? $bd['pk'] : 'line', 'dx' => kn_num($bd['dx'] ?? 400, -4000, 4000, 400), 'dy' => kn_num($bd['dy'] ?? 0, -4000, 4000, 0)] : []);
    }
    $r['builds'] = $builds;
    return $r;
}
function keynote_clean_show(array $show): array
{
    $out = ['mode' => 'keynote', 'aspect' => preg_match('/^[0-9a-z:_-]{1,12}$/i', (string) ($show['aspect'] ?? '')) ? (string) $show['aspect'] : '16:9',
        'w' => (int) kn_num($show['w'] ?? 1920, 320, 4000, 1920), 'h' => (int) kn_num($show['h'] ?? 1080, 240, 4000, 1080),
        'theme' => preg_match('/^[a-z0-9_-]{1,30}$/', (string) ($show['theme'] ?? '')) ? (string) $show['theme'] : 'blanc', 'musicVol' => kn_num($show['musicVol'] ?? .5, 0, 1, .5), 'loop' => !empty($show['loop'])];
    $cols = is_array($show['colors'] ?? null) ? $show['colors'] : []; $fonts = is_array($show['fonts'] ?? null) ? $show['fonts'] : [];
    foreach (['fg', 'accent', 'bg'] as $k) { if (($c = kn_color($cols[$k] ?? null)) !== null) { $out['colors'][$k] = $c; } }
    foreach (['title', 'body'] as $k) { if (($f = kn_font($fonts[$k] ?? '')) !== '') { $out['fonts'][$k] = $f; } }
    if (is_array($show['music'] ?? null) && isset($show['music']['filename']) && kn_file_ok($show['music']['filename'])) { $out['music'] = ['filename' => $show['music']['filename'], 'media_id' => (int) kn_num($show['music']['media_id'] ?? 0, 0, 1e12, 0), 'title' => kn_text($show['music']['title'] ?? '', 200)]; }
    $slides = []; $ids = [];
    foreach (array_slice(is_array($show['slides'] ?? null) ? $show['slides'] : [], 0, 500) as $s) { if (is_array($s) && ($c = keynote_clean_slide($s)) && !isset($ids[$c['id']])) { $ids[$c['id']] = 1; $slides[] = $c; } }
    $out['slides'] = $slides;
    $mo = []; $mids = []; // 🗂 le masque : des objets montrés sous toutes les diapositives
    foreach (array_slice(is_array($show['master']['objs'] ?? null) ? $show['master']['objs'] : [], 0, 60) as $o) { if (is_array($o) && ($o['t'] ?? '') !== 'link' && ($c = keynote_clean_obj($o)) && !isset($mids[$c['id']])) { $mids[$c['id']] = 1; $mo[] = $c; } }
    if ($mo) { $out['master'] = ['objs' => $mo]; }
    return $out;
}
