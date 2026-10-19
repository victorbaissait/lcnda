<?php
declare(strict_types=1);

/**
 * 📸 Cartes de photos (assets/js/heritage-photomaps.js) : des cartes à soi sur lesquelles on pose des photos et des vidéos
 * de l'app, chacune à un endroit et à une date ; une carte « Toutes mes cartes » les réunit.
 *
 *   GET  api.php?action=photomaps                 → {maps: [...résumés : nombres, période, vignettes]}
 *   GET  api.php?action=photomap&id=N             → {map, items}
 *   GET  api.php?action=photomap_all              → {maps, items} (les éléments de toutes les cartes)
 *   GET  api.php?action=photomap_thumb&m=N        → petite vignette JPEG (photo réduite, ou image d'une vidéo si ffmpeg est là)
 *   POST api.php?action=photomap_write {op, …, csrf}  (save_map, delete_map, restore_map, add_media, update_item, reset_gps,
 *                                                     remove_items, restore_items, reorder)
 *   POST api.php?action=photomap_upload (multipart : files[], map_id, drop_lat, drop_lon) → le fichier entre dans les médias
 *        comme d'habitude, ses coordonnées GPS et sa date de prise de vue sont lues ici, puis il est posé sur la carte.
 *
 * Tables créées à la demande (CREATE TABLE IF NOT EXISTS, comme lib/puzzle.php) : photo_maps, photo_map_items et
 * photo_media_geo (ce qu'on a lu dans le fichier : GPS, date, durée — relu si le fichier change). Une base qui ne les a pas
 * encore se lit comme « aucune carte ». Suppression d'une carte ou d'un élément : mise de côté (deleted_at) pour que
 * « ↶ Annuler » la remette ; les éléments mis de côté depuis plus de deux jours partent pour de bon.
 *
 * Lecture des métadonnées sans bibliothèque (pm_meta_read) : EXIF des JPEG, PNG (eXIf), WebP (EXIF) et HEIC (élément Exif),
 * atome « ©xyz » / clés QuickTime (com.apple.quicktime.location.ISO6709, creationdate) et « mvhd » des MP4 / MOV.
 * Tout ce qui arrive du navigateur est relu (liste blanche, types, bornes) ; requêtes préparées ; mode consultation :
 * les écritures sont refusées par kiosk_guard() (api.php).
 */

const PHOTOMAP_ACTIONS = ['photomaps', 'photomap', 'photomap_all', 'photomap_thumb', 'photomap_write', 'photomap_upload'];
const PHOTOMAP_MAX_MAPS = 500;
const PHOTOMAP_MAX_ITEMS = 20000;      // par carte
const PHOTOMAP_MAX_ADD = 2000;         // médias ajoutés en une fois
const PHOTOMAP_SHAPES = ['round', 'square'];
const PHOTOMAP_THUMB_DIR = 'cache/photomaps-mini'; // dans le dossier de la généalogie (DATA_DIR), hors des médias : ni sauvegardé, ni mélangé aux fichiers
const PHOTOMAP_THUMB_SIZE = 240;
const PHOTOMAP_UPLOAD_TYPES = [
    'image/jpeg' => ['jpg', 'image'], 'image/png' => ['png', 'image'], 'image/webp' => ['webp', 'image'], 'image/gif' => ['gif', 'image'],
    'image/heic' => ['heic', 'convert'], 'image/heif' => ['heic', 'convert'], 'image/heic-sequence' => ['heic', 'convert'],
    'video/mp4' => ['mp4', 'video'], 'video/quicktime' => ['mov', 'video'], 'video/webm' => ['webm', 'video'], 'video/x-m4v' => ['mp4', 'video'],
];
const PHOTOMAP_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* ═══════════════════════ Tables ═══════════════════════ */

function photomaps_ensure(PDO $pdo): void
{
    static $done = false;
    if ($done) { return; }
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_maps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#0066cc',
        period_text TEXT NOT NULL DEFAULT '',
        period_from TEXT NOT NULL DEFAULT '',
        period_to TEXT NOT NULL DEFAULT '',
        background TEXT NOT NULL DEFAULT '',
        shape TEXT NOT NULL DEFAULT 'round',
        show_track INTEGER NOT NULL DEFAULT 0,
        person_id INTEGER,
        investigation_id INTEGER,
        sort_order REAL NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_map_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        map_id INTEGER NOT NULL REFERENCES photo_maps(id) ON DELETE CASCADE,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        lat REAL,
        lon REAL,
        pos_source TEXT NOT NULL DEFAULT '',
        gps_lat REAL,
        gps_lon REAL,
        place_id INTEGER,
        date_text TEXT NOT NULL DEFAULT '',
        date_from TEXT NOT NULL DEFAULT '',
        date_to TEXT NOT NULL DEFAULT '',
        date_source TEXT NOT NULL DEFAULT '',
        taken_at TEXT NOT NULL DEFAULT '',
        taken_tz TEXT NOT NULL DEFAULT '',
        caption TEXT NOT NULL DEFAULT '',
        position REAL NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(map_id, media_id)
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_photo_map_items_map ON photo_map_items(map_id, deleted_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_photo_map_items_media ON photo_map_items(media_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS photo_media_geo (
        media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
        filename TEXT NOT NULL DEFAULT '',
        file_sig TEXT NOT NULL DEFAULT '',
        lat REAL,
        lon REAL,
        alt REAL,
        taken_at TEXT NOT NULL DEFAULT '',
        taken_tz TEXT NOT NULL DEFAULT '',
        duration REAL,
        width INTEGER,
        height INTEGER,
        orientation INTEGER,
        read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $done = true;
}

function photomaps_table_exists(PDO $pdo): bool
{
    return (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='photo_map_items'")->fetchColumn();
}

function photomaps_media_cols(PDO $pdo): array
{
    static $cols = null;
    if ($cols === null) { $cols = array_flip(array_column($pdo->query('PRAGMA table_info(media)')->fetchAll(PDO::FETCH_ASSOC), 'name')); }
    return $cols;
}

function photomaps_purge(PDO $pdo): void
{
    $pdo->exec("DELETE FROM photo_map_items WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-2 days')");
    $pdo->exec("DELETE FROM photo_maps WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-2 days')");
}

/* ═══════════════════════ Petits contrôles ═══════════════════════ */

function pm_text(mixed $v, int $max, bool $multiline = false): string
{
    if (!is_scalar($v)) { return ''; }
    $s = str_replace(["\r\n", "\r", "\0"], ["\n", "\n", ''], (string) $v);
    if (!$multiline) { $s = str_replace("\n", ' ', $s); }
    $s = (string) preg_replace('/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
    return mb_substr(trim($s), 0, $max);
}

function pm_id(mixed $v): int
{
    if (is_int($v)) { return $v > 0 ? $v : 0; }
    if (is_string($v) && preg_match('/^\d{1,12}$/', $v)) { return (int) $v; }
    if (is_float($v) && is_finite($v) && $v > 0 && floor($v) === $v) { return (int) $v; }
    return 0;
}

function pm_ids(mixed $v, int $max): array
{
    if (is_string($v)) { $v = explode(',', $v); }
    if (!is_array($v)) { return []; }
    $out = [];
    foreach ($v as $x) { $id = pm_id(is_string($x) ? trim($x) : $x); if ($id) { $out[$id] = $id; } if (count($out) >= $max) { break; } }
    return array_values($out);
}

/** latitude, longitude ou null ; [0, 0] (souvent un GPS qui n'a rien trouvé) n'est pas une position */
function pm_coords(mixed $lat, mixed $lon): ?array
{
    if (!is_numeric($lat) || !is_numeric($lon)) { return null; }
    $la = (float) $lat; $lo = (float) $lon;
    if (!is_finite($la) || !is_finite($lo) || abs($la) > 90 || abs($lo) > 180 || (abs($la) < 1e-7 && abs($lo) < 1e-7)) { return null; }
    return [round($la, 7), round($lo, 7)];
}

function pm_color(mixed $v): string
{
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : '#0066cc';
}

function pm_background(mixed $v): string
{
    return is_string($v) && preg_match('/^[a-z0-9_]{1,40}$/', $v) ? $v : '';
}

/* ═══════════════════════ Dates (C4 : texte libre, comme dans un acte) ═══════════════════════ */

function pm_fold(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', '’' => "'"]);
    return (string) preg_replace('/\s+/', ' ', str_replace(',', ' ', $s));
}

function pm_month(string $w): int
{
    $w = rtrim($w, '.');
    if (preg_match('/^\d{1,2}$/', $w)) { return (int) $w; }
    foreach ([['janv', 1], ['jan', 1], ['fevr', 2], ['fev', 2], ['mars', 3], ['mar', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['juil', 7], ['aout', 8], ['sept', 9], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12]] as [$p, $m]) {
        if (str_starts_with($w, $p)) { return $m; }
    }
    return 0;
}

function pm_ymd(int $y, int $m, int $d): string
{
    return sprintf('%04d-%02d-%02d', $y, $m, $d);
}

/** une date seule → [from, to, précision] ou null */
function pm_one_date(string $s): ?array
{
    $s = trim((string) preg_replace('/^le\s+/', '', $s));
    $ok = static fn(int $y): bool => $y >= 1 && $y <= 2100;
    $day = static function (int $d, int $m, int $y) use ($ok): ?array {
        if (!$ok($y) || $m < 1 || $m > 12 || $d < 1 || !checkdate($m, $d, $y)) { return null; }
        return [pm_ymd($y, $m, $d), pm_ymd($y, $m, $d), 'day'];
    };
    $month = static function (int $m, int $y) use ($ok): ?array {
        if (!$ok($y) || $m < 1 || $m > 12) { return null; }
        return [pm_ymd($y, $m, 1), pm_ymd($y, $m, (int) cal_days_or($m, $y)), 'month'];
    };
    if (preg_match('/^(\d{4})[:\-\/](\d{1,2})[:\-\/](\d{1,2})(?:[ t](\d{1,2}):(\d{2})(?::(\d{2}))?)?/', $s, $m)) { return $day((int) $m[3], (int) $m[2], (int) $m[1]); }
    if (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{3,4})$/', $s, $m)) { return $day((int) $m[1], (int) $m[2], (int) $m[3]); }
    if (preg_match('/^(\d{1,2})[\/.\-](\d{4})$/', $s, $m)) { return $month((int) $m[1], (int) $m[2]); }
    if (preg_match('/^(1er|\d{1,2})\s+([a-z0-9]+\.?)\s+(\d{3,4})$/', $s, $m)) { $mo = pm_month($m[2]); return $mo ? $day($m[1] === '1er' ? 1 : (int) $m[1], $mo, (int) $m[3]) : null; }
    if (preg_match('/^(?:les\s+)?annees\s+(\d{3})0$/', $s, $m) || preg_match('/^(\d{3})0s$/', $s, $m)) { $y = (int) $m[1] * 10; return $ok($y) ? [pm_ymd($y, 1, 1), pm_ymd(min(2100, $y + 9), 12, 31), 'decade'] : null; }
    if (preg_match('/^([a-z]+\.?)\s+(\d{3,4})$/', $s, $m)) { $mo = pm_month($m[1]); return $mo ? $month($mo, (int) $m[2]) : null; }
    if (preg_match('/^(\d{3,4})$/', $s, $m)) { $y = (int) $m[1]; return $ok($y) ? [pm_ymd($y, 1, 1), pm_ymd($y, 12, 31), 'year'] : null; }
    // calendrier républicain : « an II » (de septembre à septembre)
    if (preg_match('/^(?:de\s+l\'?)?an\s+([ivx]+|\d{1,2})$/', $s, $m)) {
        $r = strtoupper($m[1]); $map = ['I' => 1, 'V' => 5, 'X' => 10]; $n = 0;
        if (ctype_digit($r)) { $n = (int) $r; } else { for ($i = 0, $l = strlen($r); $i < $l; $i++) { $v = $map[$r[$i]]; $next = $i + 1 < $l ? $map[$r[$i + 1]] : 0; $n += $v < $next ? -$v : $v; } }
        if ($n < 1 || $n > 14) { return null; }
        return [pm_ymd(1791 + $n, 9, 22), pm_ymd(1792 + $n, 9, 21), 'year'];
    }
    return null;
}

function cal_days_or(int $m, int $y): int
{
    return (int) date('t', mktime(12, 0, 0, $m, 1, max(1970, min(2037, $y)))) + (($m === 2 && ($y < 1970 || $y > 2037)) ? ((($y % 4 === 0 && $y % 100 !== 0) || $y % 400 === 0) ? 29 : 28) - (int) date('t', mktime(12, 0, 0, 2, 1, max(1970, min(2037, $y)))) : 0);
}

/**
 * Une date C4 écrite librement (« 14 juillet 2023 », « 08/12/1960 », « vers 1950 », « avant 1800 », « entre 1880 et 1885 »,
 * « juillet 1936 », « années 1950 », « an II ») → ['from' => 'Y-m-d', 'to' => 'Y-m-d', 'prec' => …] ou null.
 */
function pm_date_parse(string $raw): ?array
{
    $s = pm_fold($raw);
    if ($s === '') { return null; }
    // une heure à la fin : « 7 mai 1925 a 14 h 30 », « 12/08/2019 18:42:07 », « 2019-08-12t18:42 » → seulement avec un jour précis
    if (preg_match('/^(.+?)(?:\s+a|\s+vers|\s*t|\s)\s*(\d{1,2})\s*(?:h|:)\s*(?:(\d{1,2})\s*(?:min|mn|m|:)?\s*(?:(\d{1,2})\s*s?)?)?\s*$/', $s, $m) && !preg_match('/^(?:entre|de|du)\s/', $s)) {
        $d = pm_one_date($m[1]);
        $h = (int) $m[2]; $i = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : 0; $sec = isset($m[4]) && $m[4] !== '' ? (int) $m[4] : 0;
        if ($d && $d[2] === 'day' && $h <= 23 && $i <= 59 && $sec <= 59) { return ['from' => $d[0], 'to' => $d[1], 'prec' => 'time', 'time' => sprintf('%02d:%02d:%02d', $h, $i, $sec)]; }
        if ($d && $d[2] !== 'day') { return null; }
    }
    if (preg_match('/^(?:entre|de|du)\s+(.+?)\s+(?:et|a|au|-)\s+(.+)$/', $s, $m)) {
        $a = pm_one_date($m[1]); $b = pm_one_date($m[2]);
        if ($a && $b && $a[0] <= $b[1]) { return ['from' => $a[0], 'to' => $b[1], 'prec' => 'range']; }
        return null;
    }
    if (preg_match('/^(?:vers|environ|env\.?|circa|ca\.?|c\.|~)\s*(.+)$/', $s, $m)) { $d = pm_one_date($m[1]); return $d ? ['from' => $d[0], 'to' => $d[1], 'prec' => 'approx'] : null; }
    if (preg_match('/^(?:avant|av\.?)\s+(.+)$/', $s, $m)) { $d = pm_one_date($m[1]); return $d ? ['from' => $d[0], 'to' => $d[0], 'prec' => 'before'] : null; }
    if (preg_match('/^(?:apres|ap\.?|depuis)\s+(.+)$/', $s, $m)) { $d = pm_one_date($m[1]); return $d ? ['from' => $d[1], 'to' => $d[1], 'prec' => 'after'] : null; }
    $d = pm_one_date($s);
    return $d ? ['from' => $d[0], 'to' => $d[1], 'prec' => $d[2]] : null;
}

/** « 2023-07-14 10:22:05 » → « 14 juillet 2023 » */
function pm_fr_date(string $iso): string
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $iso, $m)) { return ''; }
    $d = (int) $m[3];
    return ($d === 1 ? '1er' : (string) $d) . ' ' . PHOTOMAP_MONTHS[(int) $m[2] - 1] . ' ' . (int) $m[1];
}

/** « 2023-07-14 10:22:05 » → « 14 juillet 2023 à 10:22:05 » (une heure à minuit pile sans secondes : la date seule) */
function pm_fr_datetime(string $iso): string
{
    $d = pm_fr_date($iso);
    if ($d === '' || !preg_match('/[ T](\d{2}):(\d{2}):(\d{2})/', $iso, $m)) { return $d; }
    return $d . ' à ' . $m[1] . ':' . $m[2] . ':' . $m[3];
}

/** « 2023:07:14 10:22:05 » (EXIF) → « 2023-07-14 10:22:05 », ou '' si impossible */
function pm_exif_datetime(mixed $v): string
{
    if (!is_string($v) || !preg_match('/^(\d{4})[:\-](\d{2})[:\-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/', trim($v), $m)) { return ''; }
    [$y, $mo, $d] = [(int) $m[1], (int) $m[2], (int) $m[3]];
    if ($y < 1800 || $y > 2100 || !checkdate($mo, $d, $y)) { return ''; }
    $h = isset($m[4]) ? min(23, (int) $m[4]) : 0; $i = isset($m[5]) ? min(59, (int) $m[5]) : 0; $sec = isset($m[6]) && $m[6] !== '' ? min(59, (int) $m[6]) : 0;
    return sprintf('%04d-%02d-%02d %02d:%02d:%02d', $y, $mo, $d, $h, $i, $sec);
}

/** « +02:00 », « -0500 », « Z » → « +02:00 » / « UTC » ; sinon '' */
function pm_tz(string $v): string
{
    $v = trim($v);
    if ($v === 'Z' || strcasecmp($v, 'UTC') === 0) { return 'UTC'; }
    if (!preg_match('/^([+-])(\d{2}):?(\d{2})$/', $v, $m) || (int) $m[2] > 14 || (int) $m[3] > 59) { return ''; }
    return $m[1] . $m[2] . ':' . $m[3];
}

/** une heure en temps universel → l'heure locale du lieu, fuseau estimé d'après la longitude (15° par heure) */
function pm_utc_to_local(string $utc, ?float $lon): array
{
    if ($lon === null) { return [$utc, 'UTC']; }
    $h = (int) round($lon / 15);
    $t = strtotime($utc . ' UTC');
    if ($t === false) { return [$utc, 'UTC']; }
    return [gmdate('Y-m-d H:i:s', $t + $h * 3600), sprintf('~%s%02d:00', $h < 0 ? '-' : '+', abs($h))];
}

/* ═══════════════════════ Lecture des métadonnées (sans bibliothèque) ═══════════════════════ */

/** Bloc TIFF (EXIF) → ['lat', 'lon', 'alt', 'taken', 'orientation'] (ce qui est trouvé). */
function pm_tiff(string $t): array
{
    $n = strlen($t);
    if ($n < 8) { return []; }
    $bo = substr($t, 0, 2);
    if ($bo !== 'II' && $bo !== 'MM') { return []; }
    $le = $bo === 'II';
    $u16 = static fn(int $o): ?int => $o >= 0 && $o + 2 <= $n ? unpack($le ? 'v' : 'n', substr($t, $o, 2))[1] : null;
    $u32 = static fn(int $o): ?int => $o >= 0 && $o + 4 <= $n ? unpack($le ? 'V' : 'N', substr($t, $o, 4))[1] : null;
    if ($u16(2) !== 42) { return []; }
    $sizes = [1 => 1, 2 => 1, 3 => 2, 4 => 4, 5 => 8, 6 => 1, 7 => 1, 8 => 2, 9 => 4, 10 => 8, 11 => 4, 12 => 8];
    $ifd = static function (?int $off) use ($n, $u16, $u32): array {
        if ($off === null || $off < 8 || $off + 2 > $n) { return []; }
        $cnt = $u16($off);
        if ($cnt === null || $cnt > 1000) { return []; }
        $out = [];
        for ($i = 0; $i < $cnt; $i++) {
            $e = $off + 2 + $i * 12;
            if ($e + 12 > $n) { break; }
            $out[$u16($e)] = [$u16($e + 2), $u32($e + 4), $e + 8];
        }
        return $out;
    };
    $val = static function (?array $ent) use ($t, $n, $u16, $u32, $sizes, $le) {
        if (!$ent) { return null; }
        [$type, $count, $vo] = $ent;
        $sz = ($sizes[$type] ?? 0) * (int) $count;
        if ($sz <= 0 || $count > 4096) { return null; }
        $o = $sz <= 4 ? $vo : $u32($vo);
        if ($o === null || $o < 0 || $o + $sz > $n) { return null; }
        switch ($type) {
            case 2: return rtrim(substr($t, $o, (int) $count), "\0 ");
            case 3: return array_map(static fn($i) => $u16($o + $i * 2), range(0, $count - 1));
            case 4: return array_map(static fn($i) => $u32($o + $i * 4), range(0, $count - 1));
            case 9: return array_map(static function ($i) use ($o, $u32) { $v = (int) $u32($o + $i * 4); return $v > 0x7fffffff ? $v - 0x100000000 : $v; }, range(0, $count - 1));
            case 5: case 10:
                return array_map(static function ($i) use ($o, $u32, $type) {
                    $a = (int) $u32($o + $i * 8); $b = (int) $u32($o + $i * 8 + 4);
                    if ($type === 10) { if ($a > 0x7fffffff) { $a -= 0x100000000; } if ($b > 0x7fffffff) { $b -= 0x100000000; } }
                    return $b !== 0 ? $a / $b : null;
                }, range(0, $count - 1));
            default: return substr($t, $o, (int) $count);
        }
    };
    $out = [];
    $str = static fn($v): string => is_string($v) ? $v : ''; // une valeur d'un autre type que prévu (fichier piégé) : ignorée
    $ifd0 = $ifd($u32(4));
    if (isset($ifd0[0x0112])) { $o = $val($ifd0[0x0112]); if (is_array($o) && isset($o[0]) && $o[0] >= 1 && $o[0] <= 8) { $out['orientation'] = (int) $o[0]; } }
    $taken = '';
    if (isset($ifd0[0x8769])) {
        $p = $val($ifd0[0x8769]);
        $exif = is_array($p) && isset($p[0]) ? $ifd((int) $p[0]) : [];
        foreach ([0x9003, 0x9004] as $tag) { if ($taken === '' && isset($exif[$tag])) { $taken = pm_exif_datetime($val($exif[$tag])); } }
        // décalage horaire de la prise de vue (EXIF 2.31 : OffsetTimeOriginal, sinon OffsetTime) : « +02:00 »
        foreach ([0x9011, 0x9010] as $tag) { if (!isset($out['tz']) && isset($exif[$tag]) && ($z = pm_tz($str($val($exif[$tag])))) !== '') { $out['tz'] = $z; } }
    }
    if ($taken === '' && isset($ifd0[0x0132])) { $taken = pm_exif_datetime($val($ifd0[0x0132])); }
    if (isset($ifd0[0x8825])) {
        $p = $val($ifd0[0x8825]);
        $gps = is_array($p) && isset($p[0]) ? $ifd((int) $p[0]) : [];
        $dms = static function ($a): ?float {
            if (!is_array($a) || !isset($a[0]) || $a[0] === null) { return null; }
            return (float) $a[0] + (float) ($a[1] ?? 0) / 60 + (float) ($a[2] ?? 0) / 3600;
        };
        $lat = $dms($val($gps[2] ?? null)); $lon = $dms($val($gps[4] ?? null));
        if ($lat !== null && $lon !== null) {
            $latRef = strtoupper($str($val($gps[1] ?? null))); $lonRef = strtoupper($str($val($gps[3] ?? null)));
            if (str_starts_with($latRef, 'S')) { $lat = -$lat; }
            if (str_starts_with($lonRef, 'W')) { $lon = -$lon; }
            if ($c = pm_coords($lat, $lon)) { [$out['lat'], $out['lon']] = $c; }
            $alt = $val($gps[6] ?? null);
            if (is_array($alt) && isset($alt[0]) && is_numeric($alt[0]) && abs((float) $alt[0]) < 20000) { $ref = $val($gps[5] ?? null); $out['alt'] = round(((is_string($ref) && $ref !== '' && ord($ref[0]) === 1) ? -1 : 1) * (float) $alt[0], 1); }
        }
        if ($taken === '' && isset($gps[0x1D])) {
            $d = pm_exif_datetime($val($gps[0x1D]));
            $tm = $val($gps[7] ?? null);
            if ($d !== '' && is_array($tm) && count($tm) === 3 && !in_array(null, $tm, true)) { $d = substr($d, 0, 11) . sprintf('%02d:%02d:%02d', min(23, (int) $tm[0]), min(59, (int) $tm[1]), min(59, (int) $tm[2])); }
            if ($d !== '') { $taken = $d; $out['tz'] = 'UTC'; } // l'heure GPS est en temps universel
        }
    }
    if ($taken !== '') { $out['taken'] = $taken; }
    return $out;
}

/** un bloc EXIF « Exif\0\0 » + TIFF, ou le TIFF seul */
function pm_exif_block(string $d): array
{
    if (str_starts_with($d, "Exif\0\0")) { $d = substr($d, 6); }
    elseif (!str_starts_with($d, 'II') && !str_starts_with($d, 'MM')) {
        $p = strpos($d, "II*\0"); $q = strpos($d, "MM\0*");
        $at = $p === false ? $q : ($q === false ? $p : min($p, $q));
        if ($at === false || $at > 64) { return []; }
        $d = substr($d, $at);
    }
    return pm_tiff($d);
}

function pm_read($f, int $at, int $len): string
{
    if ($len <= 0 || $at < 0 || fseek($f, $at) !== 0) { return ''; }
    $s = fread($f, $len);
    return is_string($s) ? $s : '';
}

function pm_meta_jpeg($f): array
{
    $pos = 2;
    for ($i = 0; $i < 200; $i++) {
        $h = pm_read($f, $pos, 4);
        if (strlen($h) < 4 || $h[0] !== "\xFF") { return []; }
        $marker = ord($h[1]);
        if ($marker === 0xFF) { $pos++; continue; }            // octets de remplissage
        if ($marker === 0xD8 || ($marker >= 0xD0 && $marker <= 0xD7) || $marker === 0x01) { $pos += 2; continue; }
        if ($marker === 0xDA || $marker === 0xD9) { return []; } // début de l'image : plus de métadonnées
        $len = unpack('n', substr($h, 2, 2))[1];
        if ($len < 2) { return []; }
        if ($marker === 0xE1 && $len > 8) {
            $seg = pm_read($f, $pos + 4, min($len - 2, 256 * 1024));
            if (str_starts_with($seg, "Exif\0\0")) { return pm_exif_block($seg); }
        }
        $pos += 2 + $len;
    }
    return [];
}

function pm_meta_png($f): array
{
    $pos = 8;
    for ($i = 0; $i < 3000; $i++) {
        $h = pm_read($f, $pos, 8);
        if (strlen($h) < 8) { return []; }
        $len = unpack('N', substr($h, 0, 4))[1]; $type = substr($h, 4, 4);
        if ($type === 'eXIf' && $len > 8 && $len < 4 * 1024 * 1024) { return pm_exif_block(pm_read($f, $pos + 8, $len)); }
        if ($type === 'IEND') { return []; }
        $pos += 12 + $len;
    }
    return [];
}

function pm_meta_webp($f): array
{
    $pos = 12;
    for ($i = 0; $i < 200; $i++) {
        $h = pm_read($f, $pos, 8);
        if (strlen($h) < 8) { return []; }
        $type = substr($h, 0, 4); $len = unpack('V', substr($h, 4, 4))[1];
        if ($type === 'EXIF' && $len > 8 && $len < 4 * 1024 * 1024) { return pm_exif_block(pm_read($f, $pos + 8, $len)); }
        $pos += 8 + $len + ($len % 2);
    }
    return [];
}

/** les boîtes ISO (HEIC, MP4, MOV) entre $start et $end : [[type, début du contenu, fin], …] */
function pm_boxes($f, int $start, int $end, int $max = 500): array
{
    $out = []; $pos = $start;
    while ($pos + 8 <= $end && count($out) < $max) {
        $h = pm_read($f, $pos, 16);
        if (strlen($h) < 8) { break; }
        $size = unpack('N', substr($h, 0, 4))[1]; $type = substr($h, 4, 4); $head = 8;
        if ($size === 1) { if (strlen($h) < 16) { break; } $size = unpack('J', substr($h, 8, 8))[1]; $head = 16; }
        elseif ($size === 0) { $size = $end - $pos; }
        if ($size < $head || $pos + $size > $end + 8) { break; }
        $out[] = [$type, $pos + $head, min($end, $pos + $size)];
        $pos += $size;
    }
    return $out;
}

function pm_find_box(array $boxes, string $type): ?array
{
    foreach ($boxes as $b) { if ($b[0] === $type) { return $b; } }
    return null;
}

function pm_meta_heic($f, int $size): array
{
    $meta = pm_find_box(pm_boxes($f, 0, $size, 50), 'meta');
    if (!$meta) { return []; }
    $kids = pm_boxes($f, $meta[1] + 4, $meta[2]); // boîte « complète » : 4 octets de version
    $iinf = pm_find_box($kids, 'iinf'); $iloc = pm_find_box($kids, 'iloc');
    if (!$iinf || !$iloc) { return []; }
    $v = ord(pm_read($f, $iinf[1], 1));
    $exifId = 0;
    foreach (pm_boxes($f, $iinf[1] + 4 + ($v === 0 ? 2 : 4), $iinf[2], 4000) as $b) {
        if ($b[0] !== 'infe') { continue; }
        $d = pm_read($f, $b[1], min(64, $b[2] - $b[1]));
        $iv = ord($d[0] ?? "\0");
        $typeAt = $iv === 2 ? 8 : 10;
        if ($iv < 2 || strlen($d) < $typeAt + 4) { continue; } // entrée trop courte (fichier tronqué ou piégé)
        $id = $iv === 2 ? unpack('n', substr($d, 4, 2))[1] : unpack('N', substr($d, 4, 4))[1];
        if (substr($d, $typeAt, 4) === 'Exif') { $exifId = $id; break; }
    }
    if (!$exifId) { return []; }
    $d = pm_read($f, $iloc[1], min(256 * 1024, $iloc[2] - $iloc[1]));
    $n = strlen($d);
    if ($n < 8) { return []; }
    $ver = ord($d[0]); $p = 4;
    $s1 = ord($d[$p]); $s2 = ord($d[$p + 1]); $p += 2;
    $offSize = $s1 >> 4; $lenSize = $s1 & 15; $baseSize = $s2 >> 4; $idxSize = ($ver === 1 || $ver === 2) ? ($s2 & 15) : 0;
    $rd = static function (int $sz) use ($d, $n, &$p): ?int {
        if ($sz === 0) { return 0; }
        if ($p + $sz > $n) { return null; }
        $v = match ($sz) { 2 => unpack('n', substr($d, $p, 2))[1], 4 => unpack('N', substr($d, $p, 4))[1], 8 => unpack('J', substr($d, $p, 8))[1], default => null };
        $p += $sz; return $v;
    };
    $count = $rd($ver < 2 ? 2 : 4);
    for ($i = 0; $i < (int) $count && $i < 4000; $i++) {
        $id = $rd($ver < 2 ? 2 : 4);
        $method = 0;
        if ($ver === 1 || $ver === 2) { $method = (int) $rd(2) & 15; }
        $rd(2); // data_reference_index
        $base = $rd($baseSize); $ext = $rd(2);
        if ($id === null || $base === null || $ext === null) { return []; }
        $first = null;
        for ($e = 0; $e < $ext && $e < 64; $e++) {
            if ($idxSize) { $rd($idxSize); }
            $o = $rd($offSize); $l = $rd($lenSize);
            if ($o === null || $l === null) { return []; }
            $first ??= [$o, $l];
        }
        if ($id === $exifId && $first && $method === 0) {
            $data = pm_read($f, $base + $first[0], min(4 * 1024 * 1024, $first[1] ?: 65536));
            if (strlen($data) < 12) { return []; }
            $skip = unpack('N', substr($data, 0, 4))[1];
            return pm_exif_block(substr($data, 4 + min($skip, 64)));
        }
    }
    return [];
}

/** « +48.8584+002.2945+035.000/ » (ISO 6709) → [lat, lon] */
function pm_iso6709(string $s): ?array
{
    if (!preg_match('/([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)/', $s, $m)) { return null; }
    return pm_coords((float) $m[1], (float) $m[2]);
}

function pm_meta_mp4($f, int $size): array
{
    $out = [];
    $moov = pm_find_box(pm_boxes($f, 0, $size, 200), 'moov');
    if (!$moov) { return []; }
    $kids = pm_boxes($f, $moov[1], $moov[2], 500);
    if ($mvhd = pm_find_box($kids, 'mvhd')) {
        $d = pm_read($f, $mvhd[1], 32);
        if (strlen($d) >= 20) {
            if (ord($d[0]) === 1 && strlen($d) >= 32) { $created = unpack('J', substr($d, 4, 8))[1]; $scale = unpack('N', substr($d, 20, 4))[1]; $dur = unpack('J', substr($d, 24, 8))[1]; }
            else { $created = unpack('N', substr($d, 4, 4))[1]; $scale = unpack('N', substr($d, 12, 4))[1]; $dur = unpack('N', substr($d, 16, 4))[1]; }
            if ($scale > 0 && $dur > 0 && $dur / $scale < 86400 * 2) { $out['duration'] = round($dur / $scale, 2); }
            $unix = $created - 2082844800;
            if ($created > 0 && $unix > 0 && $unix < 4102444800) { $out['taken'] = gmdate('Y-m-d H:i:s', (int) $unix); $out['tz'] = 'UTC'; }
        }
    }
    $readMeta = static function (array $meta) use ($f, &$out): void {
        // en MP4 « meta » est une boîte complète (4 octets de version) ; en QuickTime non : on regarde où est « hdlr »
        $full = pm_read($f, $meta[1] + 8, 4) === 'hdlr' || pm_read($f, $meta[1] + 4, 4) !== 'hdlr';
        $kids = pm_boxes($f, $meta[1] + ($full ? 4 : 0), $meta[2], 500);
        $keys = [];
        if ($k = pm_find_box($kids, 'keys')) {
            $d = pm_read($f, $k[1], min(64 * 1024, $k[2] - $k[1]));
            $cnt = strlen($d) >= 8 ? unpack('N', substr($d, 4, 4))[1] : 0; $p = 8;
            for ($i = 1; $i <= $cnt && $i < 500 && $p + 8 <= strlen($d); $i++) { $sz = unpack('N', substr($d, $p, 4))[1]; if ($sz < 8) { break; } $keys[$i] = substr($d, $p + 8, $sz - 8); $p += $sz; }
        }
        if ($ilst = pm_find_box($kids, 'ilst')) {
            foreach (pm_boxes($f, $ilst[1], $ilst[2], 500) as $item) {
                $name = $item[0] === "\xA9xyz" ? 'xyz' : ($keys[unpack('N', $item[0])[1]] ?? '');
                if ($name === '') { continue; }
                $data = pm_find_box(pm_boxes($f, $item[1], $item[2], 10), 'data');
                if (!$data) { continue; }
                $val = pm_read($f, $data[1] + 8, min(512, $data[2] - $data[1] - 8));
                if (($name === 'xyz' || $name === 'com.apple.quicktime.location.ISO6709') && !isset($out['lat']) && ($c = pm_iso6709($val))) { [$out['lat'], $out['lon']] = $c; }
                if ($name === 'com.apple.quicktime.creationdate' && ($t = pm_exif_datetime($val)) !== '') { // heure locale + décalage
                    $out['taken'] = $t; $out['tz'] = preg_match('/([+-]\d{2}:?\d{2}|Z)\s*$/', trim($val), $z) ? pm_tz($z[1]) : '';
                }
            }
        }
    };
    if ($meta = pm_find_box($kids, 'meta')) { $readMeta($meta); }
    if ($udta = pm_find_box($kids, 'udta')) {
        $uk = pm_boxes($f, $udta[1], $udta[2], 500);
        if (!isset($out['lat']) && ($xyz = pm_find_box($uk, "\xA9xyz"))) {
            if ($c = pm_iso6709(pm_read($f, $xyz[1], min(256, $xyz[2] - $xyz[1])))) { [$out['lat'], $out['lon']] = $c; }
        }
        if (!isset($out['lat']) && ($m2 = pm_find_box($uk, 'meta'))) { $readMeta($m2); }
        // « loci » (3GPP, écrit par ffmpeg et des téléphones Android) : longitude, latitude, altitude en virgule fixe 16.16
        if (!isset($out['lat']) && ($lo = pm_find_box($uk, 'loci'))) {
            $d = pm_read($f, $lo[1], min(1024, $lo[2] - $lo[1]));
            $z = strpos($d, "\0", 6);
            if ($z !== false && strlen($d) >= $z + 10) {
                $fx = static function (string $b): float { $v = unpack('N', $b)[1]; if ($v > 0x7fffffff) { $v -= 0x100000000; } return $v / 65536; };
                if ($c = pm_coords($fx(substr($d, $z + 6, 4)), $fx(substr($d, $z + 2, 4)))) { [$out['lat'], $out['lon']] = $c; }
            }
        }
    }
    return $out;
}

/**
 * Ce que le fichier dit de lui-même : ['lat', 'lon', 'alt', 'taken' ('Y-m-d H:i:s'), 'duration', 'orientation'], seulement ce
 * qui est trouvé. Aucune erreur ne sort : un fichier abîmé ou d'un autre format donne [].
 */
function pm_meta_read(string $path): array
{
    $r = pm_meta_read_raw($path);
    // une heure en temps universel (vidéo, heure GPS) : ramenée à l'heure locale du lieu quand on connaît la position
    if (($r['tz'] ?? '') === 'UTC' && isset($r['taken'], $r['lon'])) { [$r['taken'], $r['tz']] = pm_utc_to_local($r['taken'], (float) $r['lon']); }
    return $r;
}

function pm_meta_read_raw(string $path): array
{
    if (!is_file($path) || !is_readable($path)) { return []; }
    $size = (int) @filesize($path);
    if ($size < 12) { return []; }
    $f = @fopen($path, 'rb');
    if (!$f) { return []; }
    try {
        $h = pm_read($f, 0, 16);
        if (str_starts_with($h, "\xFF\xD8")) { return pm_meta_jpeg($f); }
        if (str_starts_with($h, "\x89PNG\r\n\x1a\n")) { return pm_meta_png($f); }
        if (str_starts_with($h, 'RIFF') && substr($h, 8, 4) === 'WEBP') { return pm_meta_webp($f); }
        if (substr($h, 4, 4) === 'ftyp') {
            $brand = substr($h, 8, 4);
            if (in_array($brand, ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'avif'], true)) { return pm_meta_heic($f, $size); }
            return pm_meta_mp4($f, $size);
        }
        if (in_array(substr($h, 4, 4), ['moov', 'mdat', 'wide', 'free', 'skip'], true)) { return pm_meta_mp4($f, $size); }
        return [];
    } catch (Throwable $_) {
        return [];
    } finally {
        fclose($f);
    }
}

/* ═══════════════════════ Médias ═══════════════════════ */

function pm_media_path(string $filename): string
{
    $name = basename($filename);
    return $name === '' ? '' : MEDIA_DIR . '/' . $name;
}

/** image ou vidéo (ou '' : ni l'un ni l'autre) */
function pm_media_kind(array $m): string
{
    $type = strtolower((string) ($m['media_type'] ?? ''));
    $ext = strtolower(pathinfo((string) ($m['filename'] ?? ''), PATHINFO_EXTENSION));
    if ($type === 'video' || in_array($ext, ['mp4', 'mov', 'webm', 'm4v'], true) && $type !== 'audio') { return 'video'; }
    if (in_array($type, ['image', 'document', 'photo'], true) && in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) { return 'image'; }
    return '';
}

/** ce qu'on sait du fichier (relu s'il a changé), rangé dans photo_media_geo */
function pm_media_geo(PDO $pdo, int $mediaId, string $filename): array
{
    $path = pm_media_path($filename);
    $sig = $path !== '' && is_file($path) ? substr(md5(basename($filename) . '|' . filesize($path) . '|' . filemtime($path)), 0, 16) : '';
    $s = $pdo->prepare('SELECT * FROM photo_media_geo WHERE media_id=?'); $s->execute([$mediaId]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if ($row && $row['file_sig'] === $sig) { return $row; }
    $meta = $sig !== '' ? pm_meta_read($path) : [];
    $dims = $sig !== '' ? @getimagesize($path) : false;
    $row = ['media_id' => $mediaId, 'filename' => basename($filename), 'file_sig' => $sig, 'lat' => $meta['lat'] ?? null, 'lon' => $meta['lon'] ?? null, 'alt' => $meta['alt'] ?? null,
        'taken_at' => $meta['taken'] ?? '', 'taken_tz' => $meta['tz'] ?? '', 'duration' => $meta['duration'] ?? null, 'width' => is_array($dims) ? (int) $dims[0] : null, 'height' => is_array($dims) ? (int) $dims[1] : null,
        'orientation' => $meta['orientation'] ?? null];
    $pdo->prepare('INSERT OR REPLACE INTO photo_media_geo(media_id, filename, file_sig, lat, lon, alt, taken_at, taken_tz, duration, width, height, orientation, read_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)')
        ->execute(array_values($row));
    return $row;
}

/* ═══════════════════════ Lecture ═══════════════════════ */

/** une carte pour le navigateur ; une personne ou une enquête supprimée depuis n'y est plus liée */
function pm_map_out(array $r): array
{
    return ['id' => (int) $r['id'], 'name' => (string) $r['name'], 'description' => (string) $r['description'], 'color' => pm_color($r['color']),
        'period_text' => (string) $r['period_text'], 'period_from' => (string) $r['period_from'], 'period_to' => (string) $r['period_to'],
        'background' => (string) $r['background'], 'shape' => in_array($r['shape'], PHOTOMAP_SHAPES, true) ? $r['shape'] : 'round', 'show_track' => (int) $r['show_track'] === 1,
        'person_id' => $r['person_id'] !== null && ($r['person_ok'] ?? null) !== null ? (int) $r['person_id'] : null, 'person_name' => trim((string) ($r['person_name'] ?? '')),
        'investigation_id' => $r['investigation_id'] !== null && ($r['investigation_ok'] ?? null) !== null ? (int) $r['investigation_id'] : null, 'investigation_title' => (string) ($r['investigation_title'] ?? ''),
        'created_at' => (string) $r['created_at'], 'updated_at' => (string) $r['updated_at']];
}

function pm_map_select(): string
{
    return "SELECT pm.*, TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS person_name, p.id AS person_ok, i.title AS investigation_title, i.id AS investigation_ok
        FROM photo_maps pm LEFT JOIN persons p ON p.id = pm.person_id LEFT JOIN investigations i ON i.id = pm.investigation_id";
}

function pm_map_row(PDO $pdo, int $id, bool $withDeleted = false): ?array
{
    $s = $pdo->prepare(pm_map_select() . ' WHERE pm.id=?' . ($withDeleted ? '' : ' AND pm.deleted_at IS NULL'));
    $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/** les éléments (une carte, ou toutes) avec ce qu'il faut pour les dessiner et les ouvrir dans la visionneuse */
function pm_items(PDO $pdo, ?int $mapId, int $limit = 60000): array
{
    $cols = photomaps_media_cols($pdo);
    $dur = isset($cols['duration_seconds']) ? 'm.duration_seconds' : 'NULL';
    $where = $mapId !== null ? 'it.map_id = ?' : 'pm.deleted_at IS NULL';
    $sql = "SELECT it.*, m.title, m.filename, m.thumbnail, m.media_type, m.description, m.date_text AS media_date, {$dur} AS media_duration,
            g.duration AS geo_duration, g.width, g.height, pl.name AS place_name, pl.county AS place_county, pl.country AS place_country,
            (SELECT group_concat(ml.entity_id || ':' || REPLACE(TRIM(COALESCE(pp.first_name,'') || ' ' || COALESCE(pp.last_name,'')), '|', ' '), '|')
               FROM media_links ml JOIN persons pp ON pp.id = ml.entity_id WHERE ml.media_id = it.media_id AND ml.entity_type = 'person') AS people
        FROM photo_map_items it JOIN photo_maps pm ON pm.id = it.map_id JOIN media m ON m.id = it.media_id
        LEFT JOIN photo_media_geo g ON g.media_id = it.media_id LEFT JOIN places pl ON pl.id = it.place_id
        WHERE {$where} AND it.deleted_at IS NULL ORDER BY it.map_id, it.position, it.id LIMIT " . (int) $limit;
    $s = $pdo->prepare($sql);
    $s->execute($mapId !== null ? [$mapId] : []);
    $out = [];
    foreach ($s as $r) {
        $kind = pm_media_kind($r);
        if ($kind === '') { continue; }
        $people = [];
        foreach (array_filter(explode('|', (string) $r['people'])) as $p) { [$pid, $pn] = array_pad(explode(':', $p, 2), 2, ''); if ((int) $pid) { $people[] = ['id' => (int) $pid, 'name' => trim($pn) ?: 'Sans nom']; } }
        $out[] = [
            'id' => (int) $r['id'], 'map_id' => (int) $r['map_id'], 'media_id' => (int) $r['media_id'],
            'lat' => $r['lat'] !== null ? (float) $r['lat'] : null, 'lon' => $r['lon'] !== null ? (float) $r['lon'] : null,
            'src' => (string) $r['pos_source'], 'gps' => $r['gps_lat'] !== null && $r['gps_lon'] !== null ? [(float) $r['gps_lat'], (float) $r['gps_lon']] : null,
            'place_id' => $r['place_id'] !== null ? (int) $r['place_id'] : null,
            'place_name' => implode(', ', array_filter([(string) $r['place_name'], (string) $r['place_county']])),
            'date_text' => (string) $r['date_text'], 'from' => (string) $r['date_from'], 'to' => (string) $r['date_to'], 'date_src' => (string) $r['date_source'],
            'taken' => (string) $r['taken_at'], 'tz' => (string) $r['taken_tz'], 'caption' => (string) $r['caption'], 'pos' => (float) $r['position'],
            'kind' => $kind, 'title' => (string) $r['title'], 'filename' => (string) $r['filename'], 'thumbnail' => (string) $r['thumbnail'],
            'media_type' => (string) $r['media_type'], 'description' => (string) $r['description'],
            'dur' => $r['media_duration'] !== null ? (float) $r['media_duration'] : ($r['geo_duration'] !== null ? (float) $r['geo_duration'] : null),
            'w' => $r['width'] !== null ? (int) $r['width'] : null, 'h' => $r['height'] !== null ? (int) $r['height'] : null,
            'tv' => substr(md5((string) $r['filename']), 0, 8), 'people' => $people,
        ];
    }
    return $out;
}

/** résumés pour la liste : nombres, période, quatre vignettes */
function pm_summaries(PDO $pdo, ?array $onlyIds = null): array
{
    if (!photomaps_table_exists($pdo)) { return []; }
    $extra = $onlyIds !== null ? ' AND pm.id IN (' . (implode(',', array_map('intval', $onlyIds)) ?: '0') . ')' : '';
    $maps = $pdo->query(pm_map_select() . ' WHERE pm.deleted_at IS NULL' . $extra . ' ORDER BY pm.sort_order, pm.id')->fetchAll(PDO::FETCH_ASSOC);
    if (!$maps) { return []; }
    $stats = [];
    $q = $pdo->query("SELECT it.map_id, it.media_id, it.lat, it.date_from, it.date_to, m.media_type, m.filename FROM photo_map_items it JOIN media m ON m.id = it.media_id JOIN photo_maps pm ON pm.id = it.map_id
        WHERE it.deleted_at IS NULL AND pm.deleted_at IS NULL ORDER BY it.map_id, it.position, it.id");
    foreach ($q as $r) {
        $k = pm_media_kind($r);
        if ($k === '') { continue; }
        $st = &$stats[(int) $r['map_id']];
        $st ??= ['photos' => 0, 'videos' => 0, 'unplaced' => 0, 'from' => '', 'to' => '', 'thumbs' => []];
        $st[$k === 'video' ? 'videos' : 'photos']++;
        if ($r['lat'] === null) { $st['unplaced']++; }
        if ($r['date_from'] !== '' && ($st['from'] === '' || $r['date_from'] < $st['from'])) { $st['from'] = $r['date_from']; }
        if ($r['date_to'] !== '' && $r['date_to'] > $st['to']) { $st['to'] = $r['date_to']; }
        if (count($st['thumbs']) < 4 && $k === 'image') { $st['thumbs'][] = ['media_id' => (int) $r['media_id'], 'tv' => substr(md5((string) $r['filename']), 0, 8)]; }
        unset($st);
    }
    return array_map(static fn($r) => pm_map_out($r) + ($stats[(int) $r['id']] ?? ['photos' => 0, 'videos' => 0, 'unplaced' => 0, 'from' => '', 'to' => '', 'thumbs' => []]), $maps);
}

/* ═══════════════════════ Écriture ═══════════════════════ */

function pm_check_person(PDO $pdo, mixed $v): ?int
{
    $id = pm_id($v);
    if (!$id) { return null; }
    $s = $pdo->prepare('SELECT 1 FROM persons WHERE id=?'); $s->execute([$id]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Personne introuvable.'); }
    return $id;
}

function pm_check_investigation(PDO $pdo, mixed $v): ?int
{
    $id = pm_id($v);
    if (!$id) { return null; }
    $s = $pdo->prepare('SELECT 1 FROM investigations WHERE id=?'); $s->execute([$id]);
    if (!$s->fetchColumn()) { throw new RuntimeException('Enquête introuvable.'); }
    return $id;
}

function pm_need_map(PDO $pdo, mixed $id): array
{
    $mid = pm_id($id);
    $r = $mid ? pm_map_row($pdo, $mid) : null;
    if (!$r) { throw new RuntimeException('Carte de photos introuvable dans cette généalogie.'); }
    return $r;
}

function pm_save_map(PDO $pdo, array $d): array
{
    $id = pm_id($d['id'] ?? 0);
    $old = $id ? pm_need_map($pdo, $id) : null;
    if (!$old && (int) $pdo->query('SELECT count(*) FROM photo_maps WHERE deleted_at IS NULL')->fetchColumn() >= PHOTOMAP_MAX_MAPS) {
        throw new RuntimeException('Tu as déjà ' . PHOTOMAP_MAX_MAPS . ' cartes de photos : supprimes-en une pour en créer une autre.');
    }
    $name = pm_text($d['name'] ?? '', 160);
    if ($name === '') { throw new RuntimeException('Donne un nom à la carte.'); }
    $period = pm_text($d['period_text'] ?? '', 120);
    $pd = $period !== '' ? pm_date_parse($period) : null;
    if ($period !== '' && !$pd) { throw new RuntimeException('Période incomprise : écris par exemple « été 2023 » → « juillet 2023 », « 1950 », « entre 1950 et 1960 ».'); }
    $vals = [$name, pm_text($d['description'] ?? '', 4000, true), pm_color($d['color'] ?? ''), $period, $pd['from'] ?? '', $pd['to'] ?? '',
        pm_background($d['background'] ?? ''), in_array($d['shape'] ?? '', PHOTOMAP_SHAPES, true) ? $d['shape'] : 'round', !empty($d['show_track']) ? 1 : 0,
        pm_check_person($pdo, $d['person_id'] ?? null), pm_check_investigation($pdo, $d['investigation_id'] ?? null)];
    if ($old) {
        $pdo->prepare('UPDATE photo_maps SET name=?, description=?, color=?, period_text=?, period_from=?, period_to=?, background=?, shape=?, show_track=?, person_id=?, investigation_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, $id]);
        log_change($pdo, 'photo_map', $id, 'update', 'Carte de photos modifiée : « ' . $name . ' »');
    } else {
        $order = (float) $pdo->query('SELECT COALESCE(max(sort_order), 0) + 10 FROM photo_maps')->fetchColumn();
        $pdo->prepare('INSERT INTO photo_maps(name, description, color, period_text, period_from, period_to, background, shape, show_track, person_id, investigation_id, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')->execute([...$vals, $order]);
        $id = (int) $pdo->lastInsertId();
        log_change($pdo, 'photo_map', $id, 'create', 'Nouvelle carte de photos : « ' . $name . ' »');
    }
    return ['ok' => true, 'map' => pm_map_out(pm_map_row($pdo, $id))];
}

function pm_delete_map(PDO $pdo, array $d, bool $restore): array
{
    $id = pm_id($d['id'] ?? 0);
    $r = $id ? pm_map_row($pdo, $id, true) : null;
    if (!$r) { throw new RuntimeException('Carte de photos introuvable dans cette généalogie.'); }
    $pdo->prepare('UPDATE photo_maps SET deleted_at=' . ($restore ? 'NULL' : 'CURRENT_TIMESTAMP') . ' WHERE id=?')->execute([$id]);
    log_change($pdo, 'photo_map', $id, $restore ? 'restore' : 'delete', ($restore ? 'Carte de photos remise : « ' : 'Carte de photos supprimée : « ') . $r['name'] . ' » (les photos restent dans les médias)');
    return ['ok' => true, 'id' => $id];
}

/** un élément : sa date et sa position de départ, d'après le fichier (GPS, date de prise de vue) et le média */
function pm_item_defaults(PDO $pdo, array $media, ?array $drop = null): array
{
    $geo = pm_media_geo($pdo, (int) $media['id'], (string) $media['filename']);
    $gps = pm_coords($geo['lat'], $geo['lon']);
    $taken = (string) $geo['taken_at'];
    $dateText = ''; $from = ''; $to = ''; $dsrc = '';
    if ($taken !== '') { $dateText = pm_fr_datetime($taken); $from = $to = substr($taken, 0, 10); $dsrc = 'exif'; }
    elseif (trim((string) ($media['date_text'] ?? '')) !== '' && ($pd = pm_date_parse((string) $media['date_text']))) { $dateText = mb_substr(trim((string) $media['date_text']), 0, 120); $from = $pd['from']; $to = $pd['to']; $dsrc = 'media'; }
    $pos = $gps ?: $drop;
    return ['lat' => $pos[0] ?? null, 'lon' => $pos[1] ?? null, 'src' => $gps ? 'gps' : ($drop ? 'manual' : ''), 'gps_lat' => $gps[0] ?? null, 'gps_lon' => $gps[1] ?? null,
        'date_text' => $dateText, 'from' => $from, 'to' => $to, 'dsrc' => $dsrc, 'taken' => $taken, 'tz' => $taken !== '' ? (string) ($geo['taken_tz'] ?? '') : ''];
}

/** pose des médias sur une carte (déjà là : laissés tels quels ; retirés il y a peu : remis) */
function pm_add_media(PDO $pdo, int $mapId, array $mediaIds, ?array $drop = null): array
{
    $count = $pdo->prepare('SELECT count(*) FROM photo_map_items WHERE map_id=? AND deleted_at IS NULL'); $count->execute([$mapId]);
    $n = (int) $count->fetchColumn();
    $getMedia = $pdo->prepare('SELECT id, title, media_type, filename, date_text FROM media WHERE id=?');
    $exists = $pdo->prepare('SELECT id, deleted_at FROM photo_map_items WHERE map_id=? AND media_id=?');
    $revive = $pdo->prepare('UPDATE photo_map_items SET deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?');
    $ins = $pdo->prepare('INSERT INTO photo_map_items(map_id, media_id, lat, lon, pos_source, gps_lat, gps_lon, date_text, date_from, date_to, date_source, taken_at, taken_tz, position) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $posQ = $pdo->prepare('SELECT COALESCE(max(position), 0) FROM photo_map_items WHERE map_id=?'); $posQ->execute([$mapId]);
    $position = (float) $posQ->fetchColumn();
    $added = []; $skipped = 0; $already = 0;
    foreach ($mediaIds as $mid) {
        $getMedia->execute([$mid]); $m = $getMedia->fetch(PDO::FETCH_ASSOC);
        if (!$m || pm_media_kind($m) === '') { $skipped++; continue; }
        $exists->execute([$mapId, $mid]); $old = $exists->fetch(PDO::FETCH_ASSOC);
        if ($old && $old['deleted_at'] === null) { $already++; continue; }
        if ($n >= PHOTOMAP_MAX_ITEMS) { throw new RuntimeException('Une carte garde ' . PHOTOMAP_MAX_ITEMS . ' photos et vidéos au plus.'); }
        if ($old) { $revive->execute([(int) $old['id']]); $added[] = (int) $old['id']; $n++; continue; }
        $d = pm_item_defaults($pdo, $m, $drop);
        $position += 10;
        $ins->execute([$mapId, $mid, $d['lat'], $d['lon'], $d['src'], $d['gps_lat'], $d['gps_lon'], $d['date_text'], $d['from'], $d['to'], $d['dsrc'], $d['taken'], $d['tz'], $position]);
        $added[] = (int) $pdo->lastInsertId(); $n++;
    }
    if ($added) {
        $pdo->prepare('UPDATE photo_maps SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$mapId]);
        log_change($pdo, 'photo_map', $mapId, 'update', count($added) . ' photo(s) ou vidéo(s) posée(s) sur la carte');
    }
    $placed = 0;
    if ($added) {
        $q = $pdo->query('SELECT count(*) FROM photo_map_items WHERE lat IS NOT NULL AND id IN (' . implode(',', $added) . ')');
        $placed = (int) $q->fetchColumn();
    }
    return ['added' => $added, 'placed' => $placed, 'unplaced' => count($added) - $placed, 'already' => $already, 'skipped' => $skipped];
}

function pm_need_item(PDO $pdo, mixed $id): array
{
    $iid = pm_id($id);
    $s = $pdo->prepare('SELECT it.* FROM photo_map_items it JOIN photo_maps pm ON pm.id = it.map_id WHERE it.id=? AND it.deleted_at IS NULL AND pm.deleted_at IS NULL');
    $s->execute([$iid]);
    $r = $iid ? $s->fetch(PDO::FETCH_ASSOC) : null;
    if (!$r) { throw new RuntimeException('Photo introuvable sur cette carte (retirée entre-temps ?).'); }
    return $r;
}

function pm_one_item(PDO $pdo, int $id): ?array
{
    $mapId = (int) $pdo->query('SELECT map_id FROM photo_map_items WHERE id=' . $id)->fetchColumn();
    foreach (pm_items($pdo, $mapId) as $it) { if ($it['id'] === $id) { return $it; } }
    return null;
}

function pm_update_item(PDO $pdo, array $d): array
{
    $it = pm_need_item($pdo, $d['id'] ?? 0);
    $set = []; $vals = [];
    if (array_key_exists('lat', $d) || array_key_exists('lon', $d)) {
        $la = $d['lat'] ?? null; $lo = $d['lon'] ?? null;
        if (($la === null || $la === '') && ($lo === null || $lo === '')) { // les deux vides : remise dans « À placer » (une seule : refusée plus bas)
            $set[] = 'lat=NULL, lon=NULL, pos_source=\'\''; }
        else {
            $c = pm_coords($la, $lo);
            if (!$c) { throw new RuntimeException('Position impossible.'); }
            $src = in_array($d['src'] ?? '', ['manual', 'place', 'gps'], true) ? $d['src'] : 'manual';
            if ($src === 'gps' && $it['gps_lat'] === null) { $src = 'manual'; }
            $set[] = 'lat=?, lon=?, pos_source=?'; array_push($vals, $c[0], $c[1], $src);
        }
    }
    if (array_key_exists('place_id', $d)) {
        $pid = pm_id($d['place_id']);
        if ($pid) { $s = $pdo->prepare('SELECT 1 FROM places WHERE id=?'); $s->execute([$pid]); if (!$s->fetchColumn()) { throw new RuntimeException('Lieu introuvable.'); } }
        $set[] = 'place_id=?'; $vals[] = $pid ?: null;
    }
    if (array_key_exists('date_text', $d)) {
        $txt = pm_text($d['date_text'], 120);
        $pd = $txt !== '' ? pm_date_parse($txt) : null;
        if ($txt !== '' && !$pd) { throw new RuntimeException('Date incomprise : écris par exemple « 14 juillet 2023 », « vers 1950 », « entre 1880 et 1885 ».'); }
        $set[] = 'date_text=?, date_from=?, date_to=?, date_source=?, taken_at=?, taken_tz=?';
        // la date du fichier (avec son heure) est gardée si on réécrit le même jour sans heure
        $keepTaken = $txt !== '' && $it['taken_at'] !== '' && $pd && $pd['from'] === substr((string) $it['taken_at'], 0, 10) && $pd['prec'] === 'day' && empty($pd['time']);
        $taken = $keepTaken ? (string) $it['taken_at'] : (!empty($pd['time']) ? $pd['from'] . ' ' . $pd['time'] : '');
        array_push($vals, $txt, $pd['from'] ?? '', $pd['to'] ?? '', $txt === '' ? '' : ($keepTaken ? $it['date_source'] : 'manual'), $taken, $keepTaken ? $it['taken_tz'] : '');
    }
    if (array_key_exists('caption', $d)) { $set[] = 'caption=?'; $vals[] = pm_text($d['caption'], 1000, true); }
    if ($set) {
        $pdo->prepare('UPDATE photo_map_items SET ' . implode(', ', $set) . ', updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([...$vals, (int) $it['id']]);
    }
    if (array_key_exists('people', $d)) { pm_set_people($pdo, (int) $it['media_id'], pm_ids($d['people'], 200)); }
    return ['ok' => true, 'item' => pm_one_item($pdo, (int) $it['id'])];
}

/** les personnes de la photo : les liens « personne » du média (les mêmes que dans sa fiche) */
function pm_set_people(PDO $pdo, int $mediaId, array $ids): void
{
    $cur = $pdo->prepare("SELECT entity_id FROM media_links WHERE media_id=? AND entity_type='person'"); $cur->execute([$mediaId]);
    $now = array_map('intval', $cur->fetchAll(PDO::FETCH_COLUMN));
    $add = array_diff($ids, $now); $del = array_diff($now, $ids);
    $chk = $pdo->prepare('SELECT COALESCE(is_locked, 0) FROM persons WHERE id=?');
    foreach ([...$add, ...$del] as $pid) {
        $chk->execute([$pid]); $lock = $chk->fetchColumn();
        if ($lock === false && in_array($pid, $add, true)) { throw new RuntimeException('Personne introuvable.'); }
        if ((int) $lock === 1) { throw new RuntimeException('Fiche verrouillée : déverrouille-la avant d’y rattacher ou d’en détacher une photo.'); }
    }
    $insL = $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)");
    foreach ($add as $pid) { $insL->execute([$mediaId, $pid, microtime(true)]); }
    $delL = $pdo->prepare("DELETE FROM media_links WHERE media_id=? AND entity_type='person' AND entity_id=?");
    foreach ($del as $pid) { $delL->execute([$mediaId, $pid]); }
    if ($add || $del) { log_change($pdo, 'media', $mediaId, 'update', 'Personnes de la photo changées (carte de photos)'); }
}

function pm_reset_gps(PDO $pdo, array $d): array
{
    $it = pm_need_item($pdo, $d['id'] ?? 0);
    if ($it['gps_lat'] === null || $it['gps_lon'] === null) { throw new RuntimeException('Cette photo n’a pas de position GPS d’origine.'); }
    $pdo->prepare("UPDATE photo_map_items SET lat=gps_lat, lon=gps_lon, pos_source='gps', updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute([(int) $it['id']]);
    return ['ok' => true, 'item' => pm_one_item($pdo, (int) $it['id'])];
}

function pm_remove_items(PDO $pdo, array $d, bool $restore): array
{
    $ids = pm_ids($d['ids'] ?? [], PHOTOMAP_MAX_ITEMS);
    if (!$ids) { return ['ok' => true, 'count' => 0]; }
    $in = implode(',', $ids); // entiers vérifiés
    $s = $pdo->prepare('UPDATE photo_map_items SET deleted_at=' . ($restore ? 'NULL' : 'CURRENT_TIMESTAMP') . ", updated_at=CURRENT_TIMESTAMP WHERE id IN ({$in}) AND deleted_at IS " . ($restore ? 'NOT NULL' : 'NULL'));
    $s->execute();
    return ['ok' => true, 'count' => $s->rowCount()];
}

function pm_reorder(PDO $pdo, array $d): array
{
    $map = pm_need_map($pdo, $d['map_id'] ?? 0);
    $ids = pm_ids($d['ids'] ?? [], PHOTOMAP_MAX_ITEMS);
    $u = $pdo->prepare('UPDATE photo_map_items SET position=? WHERE id=? AND map_id=?');
    foreach ($ids as $i => $id) { $u->execute([($i + 1) * 10, $id, (int) $map['id']]); }
    return ['ok' => true];
}

/* ═══════════════════════ Import de fichiers ═══════════════════════ */

function pm_upload(PDO $pdo, array $post, ?array $files): never
{
    @set_time_limit(600);
    try {
        photomaps_ensure($pdo);
        $map = pm_need_map($pdo, $post['map_id'] ?? 0);
        $drop = pm_coords($post['drop_lat'] ?? null, $post['drop_lon'] ?? null);
        if (!$files || !isset($files['name'])) { throw new RuntimeException('Aucun fichier reçu.'); }
        $names = (array) $files['name']; $count = count($names);
        if ($count > 200) { throw new RuntimeException('200 fichiers au plus à la fois.'); }
        if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
        $cols = photomaps_media_cols($pdo);
        $done = []; $refused = []; $moved = []; $pending = [];
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        for ($i = 0; $i < $count; $i++) {
            $name = (string) ((array) $files['name'])[$i]; $tmp = (string) ((array) $files['tmp_name'])[$i];
            $err = (int) ((array) $files['error'])[$i]; $size = (int) ((array) $files['size'])[$i];
            $label = mb_substr(basename($name), 0, 120);
            if ($err !== UPLOAD_ERR_OK) { $refused[] = ['name' => $label, 'reason' => $err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE ? 'trop gros pour être envoyé (au plus ' . ini_get('upload_max_filesize') . ')' : 'pas reçu (code ' . $err . ')']; continue; }
            if ($size <= 0 || !is_uploaded_file($tmp)) { $refused[] = ['name' => $label, 'reason' => 'fichier vide']; continue; }
            $mime = (string) $finfo->file($tmp);
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            if (!isset(PHOTOMAP_UPLOAD_TYPES[$mime]) && in_array($ext, ['heic', 'heif'], true) && in_array($mime, ['application/octet-stream', 'image/heif', 'image/heic'], true)) { $mime = 'image/heic'; }
            if (!isset(PHOTOMAP_UPLOAD_TYPES[$mime])) { $refused[] = ['name' => $label, 'reason' => 'format non accepté (photos JPEG, PNG, WebP, GIF, HEIC ; vidéos MP4, MOV, WebM)']; continue; }
            [$outExt, $kind] = PHOTOMAP_UPLOAD_TYPES[$mime];
            $limit = $kind === 'video' ? 250 : 25;
            if ($size > $limit * 1024 * 1024) { $refused[] = ['name' => $label, 'reason' => "plus de {$limit} Mo"]; continue; }
            if ($kind === 'image' && !@getimagesize($tmp)) { $refused[] = ['name' => $label, 'reason' => 'image illisible (fichier abîmé ?)']; continue; }
            $meta = pm_meta_read($tmp); // GPS et date lus avant tout (une photo HEIC convertie les perdrait)
            $stored = bin2hex(random_bytes(16));
            if ($kind === 'convert') {
                $bin = function_exists('scan_inbox_converter') ? scan_inbox_converter() : null;
                if (!$bin) { $refused[] = ['name' => $label, 'reason' => 'photo HEIC : cet ordinateur ne sait pas la convertir en JPEG (règle l’iPhone sur « Le plus compatible », ou exporte-la en JPEG : le GPS est gardé)']; continue; }
                $target = MEDIA_DIR . '/' . $stored . '.jpg';
                $cmd = str_ends_with($bin, 'sips') ? escapeshellarg($bin) . ' -s format jpeg ' . escapeshellarg($tmp) . ' --out ' . escapeshellarg($target) : escapeshellarg($bin) . ' ' . escapeshellarg($tmp . '[0]') . ' ' . escapeshellarg($target);
                $o = []; $code = 1; exec($cmd . ' 2>&1', $o, $code);
                if ($code !== 0 || !is_file($target)) { @unlink($target); $refused[] = ['name' => $label, 'reason' => 'conversion HEIC impossible']; continue; }
                $file = $stored . '.jpg'; $kind = 'image';
            } else {
                $file = $stored . '.' . $outExt;
                if (!@move_uploaded_file($tmp, MEDIA_DIR . '/' . $file)) { $refused[] = ['name' => $label, 'reason' => 'copie impossible']; continue; }
            }
            $moved[] = MEDIA_DIR . '/' . $file;
            $pending[] = [$name, $label, $kind, $file, $meta];
        }
        // la base n'est écrite qu'une fois tous les fichiers en place, d'un seul coup : une erreur ne laisse pas de média sans fichier
        $pdo->beginTransaction();
        $insMedia = $pdo->prepare('INSERT INTO media(title, media_type, filename, thumbnail, date_text, description) VALUES(?,?,?,?,?,?)');
        foreach ($pending as [$name, $label, $kind, $file, $meta]) {
            $title = mb_substr(pathinfo($name, PATHINFO_FILENAME), 0, 300) ?: ($kind === 'video' ? 'Vidéo' : 'Photo');
            $dateText = isset($meta['taken']) ? pm_fr_datetime($meta['taken']) : '';
            $insMedia->execute([$title, $kind, $file, $kind === 'image' ? $file : '', $dateText, 'Importé dans la carte de photos « ' . $map['name'] . ' » le ' . date('d/m/Y')]);
            $mediaId = (int) $pdo->lastInsertId();
            if ($kind === 'video' && isset($cols['duration_seconds']) && isset($meta['duration'])) { $pdo->prepare('UPDATE media SET duration_seconds=? WHERE id=?')->execute([$meta['duration'], $mediaId]); }
            $done[] = ['media_id' => $mediaId, 'name' => $label, 'gps' => isset($meta['lat']), 'date' => $dateText];
        }
        $res = $done ? pm_add_media($pdo, (int) $map['id'], array_column($done, 'media_id'), $drop) : ['added' => [], 'placed' => 0, 'unplaced' => 0];
        if ($done) { log_change($pdo, 'media', null, 'upload', count($done) . ' fichier(s) importé(s) dans la carte de photos « ' . $map['name'] . ' »'); }
        $pdo->commit();
        json_response(['ok' => true, 'imported' => $done, 'refused' => $refused, 'placed' => $res['placed'], 'unplaced' => $res['unplaced'], 'item_ids' => $res['added']]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        foreach ($moved ?? [] as $f) { @unlink($f); }
        json_response(['error' => $e instanceof RuntimeException ? $e->getMessage() : 'Import impossible : ' . $e->getMessage()], 422);
    }
}

/* ═══════════════════════ Vignettes ═══════════════════════ */

/** assez de mémoire pour ouvrir l'image avec GD (≈ 5 octets par point, deux fois si on la tourne), sinon l'image elle-même */
function pm_gd_fits(int $w, int $h, int $bytes): bool
{
    $need = $w * $h * 10 + $bytes + 16 * 1024 * 1024;
    $lim = trim((string) ini_get('memory_limit'));
    if ($lim === '' || $lim === '-1') { return true; }
    $n = (int) $lim; $u = strtolower(substr($lim, -1));
    $n *= $u === 'g' ? 1 << 30 : ($u === 'm' ? 1 << 20 : ($u === 'k' ? 1 << 10 : 1));
    if ($n - memory_get_usage() >= $need) { return true; }
    @ini_set('memory_limit', (string) (int) ceil((memory_get_usage() + $need) / 1048576) . 'M'); // une grande photo de téléphone (48 Mpx)
    return trim((string) ini_get('memory_limit')) !== $lim;
}

function pm_ffmpeg(): ?string
{
    if (!function_exists('exec')) { return null; }
    foreach (['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/opt/local/bin/ffmpeg'] as $b) { if (is_executable($b)) { return $b; } }
    return null;
}

function pm_thumb(PDO $pdo, int $mediaId): never
{
    $s = $pdo->prepare('SELECT id, media_type, filename FROM media WHERE id=?'); $s->execute([$mediaId]);
    $m = $s->fetch(PDO::FETCH_ASSOC);
    $kind = $m ? pm_media_kind($m) : '';
    $path = $m ? pm_media_path((string) $m['filename']) : '';
    if ($kind === '' || $path === '' || !is_file($path)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Introuvable'; exit; }
    $dir = DATA_DIR . '/' . PHOTOMAP_THUMB_DIR;
    $v = substr(md5(basename($path) . '|' . filesize($path) . '|' . filemtime($path)), 0, 10);
    $out = $dir . '/m' . $mediaId . '-' . $v . '.jpg';
    if (!is_file($out)) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
            $legacy = MEDIA_DIR . '/photomaps-mini'; // ancien emplacement (dans les médias, donc dans les sauvegardes) : vidé
            if (is_dir($legacy)) { foreach (glob($legacy . '/m*.jpg') ?: [] as $oldFile) { @unlink($oldFile); } @rmdir($legacy); }
        }
        foreach (glob($dir . '/m' . $mediaId . '-*.jpg') ?: [] as $oldFile) { @unlink($oldFile); }
        $ok = false;
        if ($kind === 'image' && function_exists('imagecreatefromstring') && filesize($path) < 60 * 1024 * 1024) {
            $info = @getimagesize($path);
            if (is_array($info) && $info[0] * $info[1] < 120_000_000 && pm_gd_fits((int) $info[0], (int) $info[1], (int) filesize($path))) {
                $im = @imagecreatefromstring((string) file_get_contents($path));
                if ($im) {
                    $orient = (int) (pm_meta_read($path)['orientation'] ?? 1);
                    if (in_array($orient, [2, 4, 5, 7], true) && function_exists('imageflip')) { imageflip($im, $orient === 4 ? IMG_FLIP_VERTICAL : IMG_FLIP_HORIZONTAL); }
                    $rot = match ($orient) { 3, 4 => 180, 5, 6 => 270, 7, 8 => 90, default => 0 };
                    if ($rot) { $r = imagerotate($im, $rot, 0); if ($r) { imagedestroy($im); $im = $r; } }
                    $w = imagesx($im); $h = imagesy($im); $k = min(1, PHOTOMAP_THUMB_SIZE / max($w, $h));
                    $tw = max(1, (int) round($w * $k)); $th = max(1, (int) round($h * $k));
                    $t = imagecreatetruecolor($tw, $th);
                    imagefill($t, 0, 0, imagecolorallocate($t, 255, 255, 255));
                    imagecopyresampled($t, $im, 0, 0, 0, 0, $tw, $th, $w, $h);
                    $ok = imagejpeg($t, $out, 80);
                    imagedestroy($t); imagedestroy($im);
                }
            }
        } elseif ($kind === 'video' && ($ff = pm_ffmpeg())) {
            $cmd = escapeshellarg($ff) . ' -v error -y -ss 0.5 -i ' . escapeshellarg($path) . ' -frames:v 1 -vf ' . escapeshellarg('scale=' . PHOTOMAP_THUMB_SIZE . ':' . PHOTOMAP_THUMB_SIZE . ':force_original_aspect_ratio=decrease') . ' -q:v 5 ' . escapeshellarg($out);
            $o = []; $code = 1; exec($cmd . ' 2>&1', $o, $code);
            if ($code !== 0 || !is_file($out) || filesize($out) === 0) { // vidéo de moins d'une demi-seconde : la toute première image
                @unlink($out);
                exec(escapeshellarg($ff) . ' -v error -y -i ' . escapeshellarg($path) . ' -frames:v 1 -vf ' . escapeshellarg('scale=' . PHOTOMAP_THUMB_SIZE . ':' . PHOTOMAP_THUMB_SIZE . ':force_original_aspect_ratio=decrease') . ' -q:v 5 ' . escapeshellarg($out) . ' 2>&1', $o, $code);
            }
            $ok = $code === 0 && is_file($out) && filesize($out) > 0;
        }
        if (!$ok) {
            @unlink($out);
            if ($kind === 'image') { // pas de GD : l'image elle-même
                header('Location: media/' . rawurlencode(basename($path)), true, 302); exit;
            }
            http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Pas de vignette'; exit;
        }
    }
    header('Content-Type: image/jpeg');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=604800');
    header('Content-Length: ' . filesize($out));
    readfile($out);
    exit;
}

/* ═══════════════════════ 🔍 Menu de choix (sorte « photomap ») ═══════════════════════ */

function picker_photomaps(PDO $pdo, string $q, int $offset, int $limit): array
{
    if (!photomaps_table_exists($pdo)) { return ['total' => 0, 'items' => []]; }
    $all = pm_summaries($pdo);
    $ids = function_exists('picker_ids') ? picker_ids() : [];
    $fq = function_exists('picker_fold') ? picker_fold($q) : mb_strtolower($q);
    $rows = array_values(array_filter($all, static function ($m) use ($ids, $fq) {
        if ($ids) { return in_array($m['id'], $ids, true); }
        if ($fq === '') { return true; }
        $hay = function_exists('picker_fold') ? picker_fold($m['name'] . ' ' . $m['description'] . ' ' . $m['period_text'] . ' ' . $m['person_name']) : mb_strtolower($m['name'] . ' ' . $m['description']);
        return str_contains($hay, $fq);
    }));
    $page = array_slice($rows, $offset, $limit);
    return ['total' => count($rows), 'items' => array_map(static function ($m) {
        $years = $m['from'] !== '' ? substr($m['from'], 0, 4) . ($m['to'] !== '' && substr($m['to'], 0, 4) !== substr($m['from'], 0, 4) ? '–' . substr($m['to'], 0, 4) : '') : '';
        $t = $m['thumbs'][0] ?? null;
        return ['kind' => 'photomap', 'id' => $m['id'], 'title' => $m['name'] ?: 'Carte sans nom', 'color' => $m['color'],
            'meta' => implode(' · ', array_filter([$m['photos'] ? $m['photos'] . ' photo' . ($m['photos'] > 1 ? 's' : '') : '', $m['videos'] ? $m['videos'] . ' vidéo' . ($m['videos'] > 1 ? 's' : '') : '', $m['period_text'] ?: $years, $m['person_name']])) ?: 'Carte vide',
            'badge' => $years, 'badge_style' => '', 'group' => 'photomap', 'icon' => '📸', 'short' => $years,
            'thumb' => $t ? 'api.php?action=photomap_thumb&m=' . $t['media_id'] . '&v=' . $t['tv'] : ''];
    }, $page)];
}

/* ═══════════════════════ Aiguillage (api.php, après verify_csrf et kiosk_guard) ═══════════════════════ */

function photomaps_dispatch(PDO $pdo, string $action, bool $isWrite, array $payload): never
{
    try {
        if (!$isWrite) {
            if ($action === 'photomap_thumb') { pm_thumb($pdo, pm_id($_GET['m'] ?? 0)); }
            if ($action === 'photomaps') { json_response(['maps' => pm_summaries($pdo)]); }
            if (!photomaps_table_exists($pdo)) {
                if ($action === 'photomap_all') { json_response(['maps' => [], 'items' => []]); }
                throw new RuntimeException('Carte de photos introuvable dans cette généalogie.');
            }
            if ($action === 'photomap') {
                $map = pm_need_map($pdo, $_GET['id'] ?? 0);
                json_response(['map' => pm_summaries($pdo, [(int) $map['id']])[0] ?? pm_map_out($map), 'items' => pm_items($pdo, (int) $map['id'])]);
            }
            if ($action === 'photomap_all') { json_response(['maps' => pm_summaries($pdo), 'items' => pm_items($pdo, null)]); }
        }
        if ($isWrite && $action === 'photomap_upload') { pm_upload($pdo, $_POST, $_FILES['files'] ?? null); }
        if ($isWrite && $action === 'photomap_write') {
            $op = scalar_text($payload['op'] ?? '', 'op');
            photomaps_ensure($pdo);
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'save_map' => pm_save_map($pdo, $payload),
                    'delete_map' => pm_delete_map($pdo, $payload, false),
                    'restore_map' => pm_delete_map($pdo, $payload, true),
                    'add_media' => (static function () use ($pdo, $payload) {
                        $map = pm_need_map($pdo, $payload['map_id'] ?? 0);
                        $ids = pm_ids($payload['media_ids'] ?? [], PHOTOMAP_MAX_ADD + 1);
                        if (count($ids) > PHOTOMAP_MAX_ADD) { throw new RuntimeException(PHOTOMAP_MAX_ADD . ' photos et vidéos au plus en une fois.'); }
                        return ['ok' => true] + pm_add_media($pdo, (int) $map['id'], $ids, pm_coords($payload['drop_lat'] ?? null, $payload['drop_lon'] ?? null));
                    })(),
                    'update_item' => pm_update_item($pdo, $payload),
                    'reset_gps' => pm_reset_gps($pdo, $payload),
                    'remove_items' => pm_remove_items($pdo, $payload, false),
                    'restore_items' => pm_remove_items($pdo, $payload, true),
                    'reorder' => pm_reorder($pdo, $payload),
                    default => throw new RuntimeException('Opération inconnue sur les cartes de photos.'),
                };
                photomaps_purge($pdo);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            json_response($out);
        }
        json_response(['error' => 'Action inconnue sur les cartes de photos.'], 400);
    } catch (JsonException $e) {
        json_response(['error' => 'Carte de photos illisible.'], 422);
    } catch (RuntimeException $e) {
        json_response(['error' => $e->getMessage()], str_contains($e->getMessage(), 'introuvable') ? 404 : 422);
    }
}
