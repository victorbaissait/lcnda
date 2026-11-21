<?php
declare(strict_types=1);

/**
 * 📱 Le téléphone par le wifi (maquette validée docs/design/telephone-wifi.html). Un téléphone accepté sur l'ordinateur avec la
 * sorte « 📱 Téléphone de terrain » (electron/lan-gate.js) ne peut faire QUE deux choses :
 *  - déposer une photo et une ligne de texte dans la boîte « 📥 À trier » (rien n'entre dans l'arbre sans un clic sur l'ordinateur) ;
 *  - lire la liste réduite « Pour qui ? » : les visites d'archives à venir et les personnes décédées (jamais les vivants ni les
 *    fiches confidentielles, sauf réglage), cherchées côté serveur, 15 réponses au plus, sans aucun lien vers les fiches.
 *
 * DÉFENSE EN PROFONDEUR
 *  1. La porte du wifi (lan-gate.js) : liste blanche de chemins et d'actions pour un téléphone, origine exigée pour écrire, corps
 *     borné, débit limité ; elle signe la sorte de l'appareil (x-carnet-device-kind, avec le second secret de la porte).
 *  2. lib/reseau_local.php : un téléphone de terrain n'atteint que /terrain.php (tout autre chemin : refusé).
 *  3. Ici (terrain.php → tw_phone_main) : liste blanche des actions et de leur méthode, jeton CSRF, mot de passe de la généalogie
 *     redemandé après 15 minutes sans geste (essais comptés par appareil : 5 faux → 15 min de pause, en plus du freinage commun),
 *     mode consultation et verrou respectés, chaque photo vérifiée : un seul fichier par envoi, taille, premiers octets, en-tête
 *     relu par GD, dimensions bornées (pas de bombe de décompression), image décodée puis RÉENREGISTRÉE (aucune métadonnée, aucun
 *     contenu caché ne survit : GPS, EXIF, commentaire, polyglotte), nom tiré au hasard sur l'ordinateur.
 *  4. Les fichiers de la boîte sont dans le dossier de données (a-trier/), que le routeur ne sert jamais ; l'ordinateur les lit
 *     par api.php?action=inbox_file, toujours avec un type d'image, nosniff et une politique « sandbox ».
 * Réglages (TW_SPEC, rangés dans app_settings sous « lcnda-telephone-wifi ») : la valeur conseillée d'abord, réglée au départ.
 * 📜 Qui a vu quoi : chaque dépôt (tw_depot), chaque fichier refusé (tw_refus), chaque liste vue (tw_liste), chaque photo reliée
 * (tw_relie), avec l'appareil.
 */

require_once __DIR__ . '/verrou.php';

const TW_SETTINGS_KEY = 'lcnda-telephone-wifi';
/** Réglages à choix : la première valeur est la conseillée. */
const TW_SPEC = [
    'sorte' => ['terrain', 'lecture'],          // sorte proposée quand la demande vient d'un téléphone
    'arrivee_ou' => ['trier', 'relier'],         // où arrivent les photos : À trier | reliées tout de suite à la personne choisie
    'liste' => ['visites_decedes', 'visites', 'rien'], // ce que le téléphone voit pour « Pour qui ? »
    'vivants' => ['non', 'oui'],                 // les vivants dans la liste (nom seulement)
    'confid' => ['non', 'oui'],                  // les fiches confidentielles dans la liste (nom seulement)
    'pourqui' => ['facultatif', 'obligatoire', 'cache'],
    'texte' => ['envoi', 'photo'],               // une ligne pour tout l'envoi | une par photo
    'gps' => ['retire', 'relier', 'garde'],      // position GPS : retirée | gardée à part, décidée en reliant | gardée (la carte la montre)
    'original' => ['oui', 'non'],                // garder la taille d'origine | réduire à 2000 points
    'horswifi' => ['attente', 'demander', 'refuser'],
    'apres' => ['effacer', 'vignettes'],         // après l'envoi, sur le téléphone
    'annuler_tel' => ['range', '10s', 'jamais'], // « ↶ Annuler » sur le téléphone : tant que pas rangées | 10 s | jamais
    'mdp' => ['ouverture', 'liste'],             // mot de passe : à l'ouverture, 15 min | seulement pour voir la liste
    'pastille' => ['oui', 'non'],
    'arrivee' => ['pastille', 'message'],
    'suppr' => ['30j', 'direct'],                // supprimée : 30 jours dans « 🗑 Supprimées » | effacée après les 10 s de ↶ Annuler
    'tombe' => ['proposer', 'rien'],
    'retrait' => ['garder', 'supprimer'],        // un téléphone retiré : ses photos restent à trier | vont dans « Supprimées »
    'registre' => ['tout', 'depots'],
    'consultation' => ['refuser', 'deposer'],    // ordinateur en mode consultation : le téléphone ne dépose plus | dépose encore
];
/** Réglages en nombre : [défaut, min, max]. */
const TW_NUM = ['max_mb' => [25, 1, 100], 'par_envoi' => [20, 1, 50], 'boite_max' => [500, 10, 5000]];
const TW_IDLE_MIN = 15;                     // mot de passe redemandé après 15 min sans geste sur le téléphone
const TW_TRIES = 5;                         // 5 mots de passe faux depuis un téléphone…
const TW_TRIES_PAUSE = 15 * 60;             // …et ce téléphone attend 15 min
const TW_TRASH_DAYS = 30;                   // « 🗑 Supprimées » : 30 jours, puis effacées pour de bon
const TW_UNDO_S = 10;                       // ↶ Annuler (et « effacée tout de suite » : après ces 10 s)
const TW_MAX_PIXELS = 50000000;             // 50 millions de points (une photo de téléphone : 12 à 50) : au-delà, refusée sans la décoder
const TW_MAX_SIDE = 20000;
const TW_BATCH_BYTES = 200 * 1024 * 1024;   // un envoi (plusieurs photos) : 200 Mo au plus
const TW_BOX_BYTES = 5 * 1024 * 1024 * 1024; // la boîte entière : 5 Go au plus
const TW_NOTE_MAX = 200;
const TW_REDUCE_PX = 2000;
const TW_THUMB_PX = 480;
/** Les seules actions du téléphone, avec leur méthode (liste blanche : tout le reste est refusé). */
const TW_PHONE_ACTIONS = ['state' => 'GET', 'list' => 'GET', 'unlock' => 'POST', 'lock' => 'POST', 'deposit' => 'POST', 'undo' => 'POST'];
const TW_TYPES = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'avif' => 'image/avif'];

final class TwRefuse extends RuntimeException
{
    public function __construct(public readonly string $why, string $message, public readonly int $status = 422) { parent::__construct($message); }
}

/* ═════════ structure, réglages, outils ═════════ */

function tw_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS phone_inbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_ts INTEGER NOT NULL DEFAULT 0,
        device_id TEXT NOT NULL DEFAULT '',
        device_name TEXT NOT NULL DEFAULT '',
        batch TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        for_kind TEXT NOT NULL DEFAULT '',
        for_id INTEGER NOT NULL DEFAULT 0,
        file TEXT NOT NULL DEFAULT '',
        ext TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        taken_at TEXT NOT NULL DEFAULT '',
        had_gps INTEGER NOT NULL DEFAULT 0,
        lat REAL,
        lon REAL,
        status TEXT NOT NULL DEFAULT 'box' CHECK(status IN ('box','linked','deleted')),
        deleted_ts INTEGER NOT NULL DEFAULT 0,
        linked_ts INTEGER NOT NULL DEFAULT 0,
        media_id INTEGER NOT NULL DEFAULT 0,
        link_kind TEXT NOT NULL DEFAULT '',
        link_id INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_phone_inbox_status ON phone_inbox(status, created_ts)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_phone_inbox_batch ON phone_inbox(batch, device_id)');
}

function tw_defaults(): array { return array_map(static fn(array $o) => $o[0], TW_SPEC) + array_map(static fn(array $o) => $o[0], TW_NUM); }

function tw_settings(PDO $pdo): array
{
    $raw = null;
    try { $s = $pdo->prepare('SELECT value FROM app_settings WHERE key=?'); $s->execute([TW_SETTINGS_KEY]); $raw = $s->fetchColumn(); } catch (Throwable $_) {}
    $j = json_decode((string) ($raw ?: ''), true);
    $out = tw_defaults();
    if (is_array($j)) {
        foreach (TW_SPEC as $k => $opts) { if (isset($j[$k]) && in_array($j[$k], $opts, true)) { $out[$k] = $j[$k]; } }
        foreach (TW_NUM as $k => [, $min, $max]) { if (isset($j[$k]) && is_int($j[$k]) && $j[$k] >= $min && $j[$k] <= $max) { $out[$k] = $j[$k]; } }
    }
    return $out;
}

/** Seules les clés et valeurs permises sont gardées ; rend aussi les réglages d'avant (↶ Annuler). */
function tw_settings_save(PDO $pdo, array $d): array
{
    $prev = tw_settings($pdo);
    $next = $prev;
    foreach ((is_array($d['settings'] ?? null) ? $d['settings'] : []) as $k => $v) {
        if (!is_string($k)) { continue; }
        if (isset(TW_SPEC[$k]) && is_string($v) && in_array($v, TW_SPEC[$k], true)) { $next[$k] = $v; }
        if (isset(TW_NUM[$k]) && is_numeric($v) && (int) $v >= TW_NUM[$k][1] && (int) $v <= TW_NUM[$k][2]) { $next[$k] = (int) $v; }
    }
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')
        ->execute([TW_SETTINGS_KEY, json_encode($next, JSON_UNESCAPED_UNICODE)]);
    return ['settings' => $next, 'prev' => $prev];
}

function tw_now(): int { return glock_now(); }
function tw_dir(): string
{
    $d = DATA_DIR . '/a-trier';
    if (!is_dir($d)) { @mkdir($d, 0700, true); }
    return $d;
}
/** Un nom de fichier de la boîte : toujours tiré au hasard ici, jamais celui du téléphone. */
function tw_file_ok(string $f): bool { return (bool) preg_match('/^[a-f0-9]{32}(-v)?\.(jpg|png|webp|avif)$/', $f); }
function tw_has_table(PDO $pdo, string $t): bool
{
    try { $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"); $s->execute([$t]); return (bool) $s->fetchColumn(); } catch (Throwable $_) { return false; }
}
/** Une ligne de texte venue du téléphone : jamais de caractère de contrôle ni de sens d'écriture caché, 200 caractères au plus. */
function tw_line(mixed $v, int $max = TW_NOTE_MAX): string
{
    $s = is_string($v) ? $v : '';
    if (!mb_check_encoding($s, 'UTF-8')) { $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8'); }
    $s = (string) preg_replace('/[\x00-\x1f\x7f-\x9f\x{200b}-\x{200f}\x{202a}-\x{202e}\x{2066}-\x{2069}\x{feff}]+/u', ' ', $s);
    return mb_substr(trim((string) preg_replace('/\s+/u', ' ', $s)), 0, $max);
}
function tw_person_name(array $p): string { return trim(trim((string) ($p['first_name'] ?? '')) . ' ' . mb_strtoupper(trim((string) ($p['last_name'] ?? '')))); }
function tw_log(?PDO $pdo, string $kind, string $type = '', ?int $id = null, string $label = '', string $what = ''): void
{
    if (function_exists('access_log_add')) { access_log_add($pdo, $kind, $type, $id, $label, $what); }
}

/* ═════════ la liste réduite « Pour qui ? » ═════════ */

/** La condition SQL des personnes que le téléphone peut voir (p = persons). Décédée : notée ainsi, ou un décès / une inhumation connus. */
function tw_people_where(array $set): string
{
    $w = [];
    if ($set['vivants'] !== 'oui') {
        $w[] = "(p.living_status='deceased' OR (p.living_status<>'living' AND EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag IN ('DEAT','BURI','CREM'))))";
    }
    if ($set['confid'] !== 'oui') { $w[] = 'p.is_private=0'; }
    return $w ? implode(' AND ', $w) : '1';
}
function tw_person_allowed(PDO $pdo, int $id, array $set): ?array
{
    if ($id <= 0 || $set['liste'] !== 'visites_decedes') { return null; }
    $s = $pdo->prepare('SELECT p.id, p.first_name, p.last_name, p.living_status FROM persons p WHERE p.id=? AND ' . tw_people_where($set));
    $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}
function tw_visit_allowed(PDO $pdo, int $id, array $set): ?array
{
    if ($id <= 0 || $set['liste'] === 'rien' || !tw_has_table($pdo, 'archive_visit_plans')) { return null; }
    $s = $pdo->prepare('SELECT id, title, archive_center, visit_date FROM archive_visit_plans WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}
function tw_visit_label(array $v): string { return trim((string) ($v['archive_center'] ?: $v['title']) . ((string) $v['visit_date'] !== '' ? ', ' . $v['visit_date'] : '')); }
/** Années de naissance et de décès (« 1871 – 1934 ») ; jamais pour un vivant. */
function tw_years(PDO $pdo, array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids)));
    if (!$ids) { return []; }
    $in = implode(',', $ids);
    $out = [];
    foreach ($pdo->query("SELECT e.person_id, t.gedcom_tag AS tag, e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IN ($in) AND e.year IS NOT NULL AND t.gedcom_tag IN ('BIRT','CHR','BAPM','DEAT','BURI') ORDER BY e.id") as $e) {
        $k = in_array($e['tag'], ['BIRT', 'CHR', 'BAPM'], true) ? 'b' : 'd';
        $out[(int) $e['person_id']][$k] ??= (int) $e['year'];
    }
    return array_map(static fn(array $y) => trim(($y['b'] ?? '?') . ' – ' . ($y['d'] ?? '?')), $out);
}
/** La liste réduite : bornée (15 personnes, 10 visites), une recherche d'au moins 2 lettres pour les personnes, rien par numéro. */
function tw_phone_list(PDO $pdo, array $set, string $q): array
{
    $q = tw_line($q, 40);
    $fold = function_exists('search_fold') ? search_fold($q) : mb_strtolower($q);
    $fold = trim((string) preg_replace('/[%_\\\\]+/', ' ', $fold));
    $visits = [];
    if ($set['liste'] !== 'rien' && tw_has_table($pdo, 'archive_visit_plans')) {
        $today = date('Y-m-d', tw_now());
        // les visites à venir et du jour, toujours proposées (10 au plus) : on les reconnaît sans les chercher
        $s = $pdo->prepare("SELECT id, title, archive_center, visit_date FROM archive_visit_plans WHERE visit_date='' OR visit_date>=? ORDER BY visit_date='', visit_date, id LIMIT 10");
        $s->execute([$today]);
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $v) { $visits[] = ['kind' => 'visit', 'id' => (int) $v['id'], 'name' => tw_visit_label($v)]; }
    }
    $people = [];
    if ($set['liste'] === 'visites_decedes' && preg_match_all('/\p{L}/u', $fold) >= 2) {
        $like = '%' . $fold . '%';
        $s = $pdo->prepare("SELECT p.id, p.first_name, p.last_name, p.living_status FROM persons p WHERE (lc_fold(p.first_name || ' ' || p.last_name) LIKE ? OR lc_fold(p.last_name || ' ' || p.first_name) LIKE ?) AND "
            . tw_people_where($set) . ' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE, p.id LIMIT 15');
        $s->execute([$like, $like]);
        $rows = $s->fetchAll(PDO::FETCH_ASSOC);
        $years = tw_years($pdo, array_column(array_filter($rows, static fn($r) => $r['living_status'] !== 'living'), 'id'));
        foreach ($rows as $r) { $people[] = ['kind' => 'person', 'id' => (int) $r['id'], 'name' => tw_person_name($r), 'years' => $r['living_status'] === 'living' ? '' : ($years[(int) $r['id']] ?? '')]; }
    }
    return ['visits' => $visits, 'people' => $people, 'mode' => $set['liste']];
}

/* ═════════ une photo qui arrive ═════════ */

/** Le type réel d'après les premiers octets. */
function tw_sniff(string $h): string
{
    if (str_starts_with($h, "\xFF\xD8\xFF")) { return 'jpg'; }
    if (str_starts_with($h, "\x89PNG\r\n\x1a\n")) { return 'png'; }
    if (str_starts_with($h, 'RIFF') && substr($h, 8, 4) === 'WEBP') { return 'webp'; }
    if (substr($h, 4, 4) === 'ftyp') {
        $b = substr($h, 8, 4);
        if (in_array($b, ['avif', 'avis'], true)) { return 'avif'; }
        if (in_array($b, ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'], true)) { return 'heic'; }
    }
    return '';
}

/**
 * Vérifie et réenregistre une photo. Rend [bytes, ext, largeur, hauteur, vignette, meta (lat, lon, taken)].
 * Rien de ce qui arrive n'est gardé tel quel : l'image est décodée puis réencodée (sans aucune métadonnée).
 */
function tw_image(string $tmp, int $size, array $set): array
{
    if ($size <= 0 || !is_file($tmp)) { throw new TwRefuse('vide', 'Fichier vide.'); }
    if ($size > $set['max_mb'] * 1024 * 1024) { throw new TwRefuse('gros', i18n_t('Photo trop grosse (plus de {n} Mo, la taille maximale réglée sur l’ordinateur).', ['n' => $set['max_mb']]), 413); }
    if (!extension_loaded('gd')) { throw new TwRefuse('type', 'Ce format de photo ne se lit pas sur cet ordinateur : choisis-la en JPEG.'); }
    $head = (string) @file_get_contents($tmp, false, null, 0, 64);
    $kind = tw_sniff($head);
    if ($kind === 'heic') { throw new TwRefuse('heic', 'Ce format de photo ne se lit pas sur cet ordinateur : choisis-la en JPEG.'); }
    if ($kind === '') { throw new TwRefuse('type', 'Ce n’est pas une photo : seules les photos JPEG, PNG, WEBP et AVIF sont acceptées.', 415); }
    $want = ['jpg' => IMAGETYPE_JPEG, 'png' => IMAGETYPE_PNG, 'webp' => IMAGETYPE_WEBP, 'avif' => defined('IMAGETYPE_AVIF') ? IMAGETYPE_AVIF : -1][$kind];
    $info = @getimagesize($tmp);
    if (!is_array($info) || (int) $info[2] !== $want) { throw new TwRefuse('abime', 'Image abîmée ou illisible.'); }
    [$w, $h] = [(int) $info[0], (int) $info[1]];
    // bombe de décompression : les dimensions sont lues dans l'en-tête, AVANT de décoder quoi que ce soit
    if ($w < 1 || $h < 1 || $w > TW_MAX_SIDE || $h > TW_MAX_SIDE || $w * $h > TW_MAX_PIXELS) { throw new TwRefuse('enorme', 'Image trop grande (plus de 50 millions de points) : refusée.'); }
    $loader = ['jpg' => 'imagecreatefromjpeg', 'png' => 'imagecreatefrompng', 'webp' => 'imagecreatefromwebp', 'avif' => 'imagecreatefromavif'][$kind];
    if (!function_exists($loader)) { throw new TwRefuse('type', 'Ce format de photo ne se lit pas sur cet ordinateur : choisis-la en JPEG.'); }
    @ini_set('gd.jpeg_ignore_warning', '1');
    $img = @$loader($tmp);
    if (!$img instanceof GdImage || imagesx($img) !== $w || imagesy($img) !== $h) { throw new TwRefuse('abime', 'Image abîmée ou illisible.'); }
    if (!function_exists('pm_meta_read')) { require_once __DIR__ . '/photomaps.php'; }
    $meta = pm_meta_read($tmp);
    // le sens de la photo (EXIF Orientation) est appliqué avant de réenregistrer, puisque l'EXIF disparaît
    $o = (int) ($meta['orientation'] ?? 1);
    if ($o >= 2 && $o <= 8) {
        if (in_array($o, [2, 7], true)) { imageflip($img, IMG_FLIP_HORIZONTAL); }
        if (in_array($o, [4, 5], true)) { imageflip($img, IMG_FLIP_VERTICAL); }
        $angle = [3 => 180, 5 => 270, 6 => 270, 7 => 270, 8 => 90][$o] ?? 0; // imagerotate tourne dans le sens contraire des aiguilles
        if ($angle) { $r = imagerotate($img, $angle, 0); if ($r instanceof GdImage) { $img = $r; } }
    }
    [$w, $h] = [imagesx($img), imagesy($img)];
    if ($set['original'] === 'non' && max($w, $h) > TW_REDUCE_PX) { $img = tw_resize($img, TW_REDUCE_PX); [$w, $h] = [imagesx($img), imagesy($img)]; }
    $ext = $kind === 'avif' && !function_exists('imageavif') ? 'jpg' : $kind;
    $bytes = tw_encode($img, $ext, 92);
    if ($bytes === '') { throw new TwRefuse('abime', 'Image abîmée ou illisible.'); }
    $thumb = tw_encode(tw_resize($img, TW_THUMB_PX), 'jpg', 80);
    $hadGps = isset($meta['lat'], $meta['lon']);
    return ['bytes' => $bytes, 'ext' => $ext, 'w' => $w, 'h' => $h, 'thumb' => $thumb, 'had_gps' => $hadGps,
        'lat' => $hadGps && $set['gps'] !== 'retire' ? (float) $meta['lat'] : null, 'lon' => $hadGps && $set['gps'] !== 'retire' ? (float) $meta['lon'] : null,
        'taken' => preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', (string) ($meta['taken'] ?? '')) ? (string) $meta['taken'] : ''];
}
function tw_resize(GdImage $img, int $max): GdImage
{
    $w = imagesx($img); $h = imagesy($img);
    $r = min(1, $max / max($w, $h));
    if ($r >= 1) { return $img; }
    $nw = max(1, (int) round($w * $r)); $nh = max(1, (int) round($h * $r));
    $out = imagecreatetruecolor($nw, $nh);
    imagealphablending($out, false); imagesavealpha($out, true);
    imagefill($out, 0, 0, imagecolorallocatealpha($out, 255, 255, 255, 127));
    imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
    return $out;
}
function tw_encode(GdImage $img, string $ext, int $q): string
{
    ob_start();
    $ok = match ($ext) {
        'png' => (static function () use ($img): bool { imagesavealpha($img, true); return imagepng($img, null, 6); })(),
        'webp' => function_exists('imagewebp') && imagewebp($img, null, $q),
        'avif' => function_exists('imageavif') && imageavif($img, null, $q),
        default => (static function () use ($img, $q): bool {
            // un JPEG n'a pas de transparence : posé sur du blanc
            $w = imagesx($img); $h = imagesy($img);
            $bg = imagecreatetruecolor($w, $h); imagefill($bg, 0, 0, imagecolorallocate($bg, 255, 255, 255)); imagecopy($bg, $img, 0, 0, 0, 0, $w, $h);
            imageinterlace($bg, true);
            return imagejpeg($bg, null, $q);
        })(),
    };
    $b = (string) ob_get_clean();
    return $ok ? $b : '';
}

/* ═════════ le téléphone (terrain.php) ═════════ */

function tw_phone_json(array $d, int $status = 200): never
{
    header('X-Frame-Options: DENY');
    json_response($d + ['lan_terrain' => true], $status);
}
function tw_device(): array
{
    $d = function_exists('lan_device') ? lan_device() : null;
    if (!$d || !empty($d['forged']) || ($d['kind'] ?? '') !== 'terrain') { tw_phone_json(['error' => 'Refusé.'], 403); }
    return $d;
}
/** La séance du téléphone : ouverte avec le mot de passe de la généalogie, oubliée après 15 min sans geste ou un nouveau lancement. */
function tw_phone_unlocked(array $info, array $dev): bool
{
    if (!$info['locked']) { return true; }
    $e = $_SESSION['tw'] ?? null;
    if (!is_array($e) || ($e['dev'] ?? '') !== $dev['id'] || !is_string($e['lock'] ?? null) || !hash_equals((string) $info['lock_id'], $e['lock'])) { return false; }
    if ((string) ($e['boot'] ?? '') !== glock_boot()) { return false; }
    return tw_now() - (int) ($e['seen'] ?? 0) <= TW_IDLE_MIN * 60;
}
function tw_phone_touch(array $info): void
{
    $e = $_SESSION['tw'] ?? null;
    if (!$info['locked'] || !is_array($e) || tw_now() - (int) ($e['seen'] ?? 0) < 20) { return; }
    glock_session_write(static function (): void { if (isset($_SESSION['tw'])) { $_SESSION['tw']['seen'] = tw_now(); } });
}
function tw_tries_file(): string { return DATA_DIR . '/telephone-wifi-essais.json'; }
/** Les essais du mot de passe, comptés par téléphone (en plus du freinage commun de lib/verrou.php). */
function tw_tries(string $devId, ?callable $change = null): array
{
    $f = tw_tries_file();
    $fh = @fopen($f, 'c+');
    if ($fh === false) { return ['fails' => 0, 'until' => 0]; }
    try {
        flock($fh, LOCK_EX);
        $all = json_decode((string) stream_get_contents($fh), true);
        $all = is_array($all) ? $all : [];
        $me = is_array($all[$devId] ?? null) ? $all[$devId] + ['fails' => 0, 'until' => 0] : ['fails' => 0, 'until' => 0];
        if ($change) {
            $me = $change($me);
            $all[$devId] = $me;
            foreach ($all as $k => $v) { if (!is_array($v) || ((int) ($v['until'] ?? 0) < tw_now() - 86400 && (int) ($v['fails'] ?? 0) === 0)) { unset($all[$k]); } }
            ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($all)); fflush($fh);
        }
        return $me;
    } finally { flock($fh, LOCK_UN); fclose($fh); @chmod($f, 0600); }
}

function tw_phone_main(): never
{
    $dev = tw_device();
    $action = is_string($_GET['action'] ?? null) ? (string) $_GET['action'] : '';
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!isset(TW_PHONE_ACTIONS[$action])) { tw_phone_json(['error' => 'Refusé.'], 403); }
    if (TW_PHONE_ACTIONS[$action] !== $method) { tw_phone_json(['error' => 'Refusé.'], 405); }
    $g = $_SERVER['HTTP_X_GENEALOGY'] ?? null;
    if (is_string($g) && $g !== '' && $g !== glock_key()) {
        tw_phone_json(['error' => i18n_t('« {name} » n’est plus ouverte sur l’ordinateur : tes photos restent en attente ici.', ['name' => $g]), 'genealogy_changed' => true], 409);
    }
    $payload = $method === 'POST' ? request_json() : [];
    if ($method === 'POST') { verify_csrf(is_array($payload) ? $payload : []); }
    try { $pdo = db(); } catch (Throwable $e) { tw_phone_json(['error' => 'La généalogie n’est pas prête sur l’ordinateur.'], 503); }
    tw_schema($pdo);
    $set = tw_settings($pdo);
    $info = glock_info();
    $unlocked = tw_phone_unlocked($info, $dev);
    if ($action === 'state') {
        tw_phone_json(['name' => glock_genealogy_name(), 'genealogy' => glock_key(), 'device' => $dev['name'], 'locked' => $info['locked'], 'unlocked' => $unlocked,
            'needs_pw' => $info['locked'] && !$unlocked && $set['mdp'] === 'ouverture', 'csrf' => csrf_token(), 'idle_min' => TW_IDLE_MIN,
            'settings' => array_intersect_key($set, array_flip(['liste', 'pourqui', 'texte', 'horswifi', 'apres', 'annuler_tel', 'max_mb', 'par_envoi']))]);
    }
    if ($action === 'unlock') { tw_phone_unlock($info, $dev, $payload); }
    if ($action === 'lock') {
        glock_session_write(static function (): void { unset($_SESSION['tw']); });
        tw_phone_json(['ok' => true]);
    }
    $relock = static function (): never {
        if (!empty($_SESSION['tw'])) { glock_session_write(static function (): void { unset($_SESSION['tw']); }); access_log_add(null, 'lock_idle', 'genealogy'); }
        header('X-LCNDA-Glock: 1');
        tw_phone_json(['error' => 'Cette généalogie est verrouillée : donne son mot de passe pour l’ouvrir.', 'glock' => true, 'locked' => true], 423);
    };
    if ($action === 'list') {
        if (!$unlocked) { $relock(); }
        tw_phone_touch($info);
        $q = is_string($_GET['q'] ?? null) ? (string) $_GET['q'] : '';
        $out = tw_phone_list($pdo, $set, $q);
        if ($set['registre'] === 'tout' && tw_line($q, 40) !== '') { tw_log($pdo, 'tw_liste', 'inbox', null, tw_line($q, 40), (string) (count($out['people']) + count($out['visits']))); }
        tw_phone_json($out);
    }
    if (!$unlocked && $set['mdp'] === 'ouverture') { $relock(); }
    if ($unlocked) { tw_phone_touch($info); }
    if (is_file(function_exists('kiosk_path') ? kiosk_path() : DATA_DIR . '/consultation.json') && $set['consultation'] === 'refuser') {
        tw_phone_json(['error' => 'L’ordinateur est en mode consultation : il ne reçoit pas de photo pour l’instant. Elles restent en attente ici.', 'kiosk' => true], 423);
    }
    if ($action === 'undo') { tw_phone_undo($pdo, $set, $dev, $payload); }
    tw_phone_deposit($pdo, $set, $dev, $payload);
}

function tw_phone_unlock(array $info, array $dev, array $payload): never
{
    if (!$info['locked']) { tw_phone_json(['ok' => true, 'unlocked' => true]); }
    $me = tw_tries($dev['id']);
    if ((int) $me['until'] > tw_now()) {
        $wait = (int) $me['until'] - tw_now();
        header('Retry-After: ' . $wait);
        tw_phone_json(['error' => i18n_t('Trop d’essais depuis ce téléphone : réessaie dans {n} min.', ['n' => max(1, (int) ceil($wait / 60))]), 'wait' => $wait, 'glock' => true], 429);
    }
    $r = glock_try($info, glock_pw($payload['password'] ?? null), 'open');
    if ($r['throttled']) { glock_refuse($r); }
    if (!$r['ok']) {
        $me = tw_tries($dev['id'], static function (array $m): array { $m['fails'] = (int) $m['fails'] + 1; if ($m['fails'] >= TW_TRIES) { $m['until'] = tw_now() + TW_TRIES_PAUSE; $m['fails'] = 0; } return $m; });
        if ((int) $me['until'] > tw_now()) { header('Retry-After: ' . TW_TRIES_PAUSE); tw_phone_json(['error' => i18n_t('Trop d’essais depuis ce téléphone : réessaie dans {n} min.', ['n' => (int) (TW_TRIES_PAUSE / 60)]), 'wait' => TW_TRIES_PAUSE, 'glock' => true], 429); }
        glock_refuse($r);
    }
    tw_tries($dev['id'], static fn(array $m): array => ['fails' => 0, 'until' => 0]);
    glock_session_write(static function () use ($info, $dev): void {
        if (PHP_SAPI !== 'cli') { @session_regenerate_id(true); }
        $_SESSION['tw'] = ['dev' => $dev['id'], 'lock' => (string) $info['lock_id'], 'boot' => glock_boot(), 'seen' => tw_now()];
    });
    tw_phone_json(['ok' => true, 'unlocked' => true, 'csrf' => csrf_token()]);
}

/** ↶ Annuler sur le téléphone : seulement SES photos de CET envoi, encore dans la boîte (ou dans les 10 s, réglage). */
function tw_phone_undo(PDO $pdo, array $set, array $dev, array $p): never
{
    $batch = is_string($p['batch'] ?? null) ? (string) $p['batch'] : '';
    if (!preg_match('/^[a-f0-9]{16,32}$/', $batch) || $set['annuler_tel'] === 'jamais') { tw_phone_json(['error' => 'Rien à annuler.'], 422); }
    $min = $set['annuler_tel'] === '10s' ? tw_now() - TW_UNDO_S : 0;
    $s = $pdo->prepare("SELECT id, file FROM phone_inbox WHERE batch=? AND device_id=? AND status='box' AND created_ts>=?");
    $s->execute([$batch, $dev['id'], $min]);
    $rows = $s->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) {
        $pdo->prepare('DELETE FROM phone_inbox WHERE id=?')->execute([(int) $r['id']]);
        tw_unlink_files((string) $r['file']);
    }
    tw_phone_json(['ok' => true, 'removed' => count($rows)]);
}
function tw_unlink_files(string $file): void
{
    if (!tw_file_ok($file)) { return; }
    $d = tw_dir();
    @unlink($d . '/' . $file);
    @unlink($d . '/' . preg_replace('/\.[a-z]+$/', '-v.jpg', $file));
}

function tw_refuse_note(PDO $pdo, array $set, string $code): void
{
    if ($set['registre'] === 'tout') { tw_log($pdo, 'tw_refus', 'inbox', null, '', $code); }
}

function tw_phone_deposit(PDO $pdo, array $set, array $dev, array $p): never
{
    try {
        // un seul fichier par envoi de la page (le téléphone envoie ses photos l'une après l'autre) : sous le nom « photo »
        $all = 0;
        foreach ($_FILES as $f) { $all += is_array($f['name'] ?? null) ? count((array) $f['name']) : 1; }
        $f = $_FILES['photo'] ?? null;
        if ($all !== 1 || !is_array($f) || is_array($f['name'] ?? null)) { throw new TwRefuse('nombre', 'Une seule photo à la fois.'); }
        // deux fichiers sous le même nom : PHP n'en garde qu'un ; un envoi bien plus gros que la photo reçue en cachait d'autres
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > (int) ($f['size'] ?? 0) + 4096) { throw new TwRefuse('nombre', 'Une seule photo à la fois.'); }
        if ((int) ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw in_array((int) $f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? new TwRefuse('gros', i18n_t('Photo trop grosse (plus de {n} Mo, la taille maximale réglée sur l’ordinateur).', ['n' => $set['max_mb']]), 413) : new TwRefuse('recu', 'La photo n’est pas arrivée en entier : elle sera renvoyée.');
        }
        $batch = is_string($p['batch'] ?? null) ? (string) $p['batch'] : '';
        if (!preg_match('/^[a-f0-9]{16,32}$/', $batch)) { throw new TwRefuse('envoi', 'Refusé.'); }
        $note = tw_line($p['note'] ?? '');
        $for = is_string($p['for'] ?? null) ? (string) $p['for'] : '';
        $forKind = ''; $forId = 0; $forLabel = '';
        if ($for !== '' && $set['pourqui'] !== 'cache') {
            if (!preg_match('/^(person|visit):([1-9]\d{0,9})$/', $for, $m)) { throw new TwRefuse('pourqui', 'Personne ou visite inconnue.'); }
            $row = $m[1] === 'person' ? tw_person_allowed($pdo, (int) $m[2], $set) : tw_visit_allowed($pdo, (int) $m[2], $set);
            // la même réponse qu'elle n'existe pas, soit vivante, soit confidentielle : le téléphone n'apprend rien
            if (!$row) { throw new TwRefuse('pourqui', 'Personne ou visite inconnue.'); }
            $forKind = $m[1]; $forId = (int) $m[2]; $forLabel = $m[1] === 'person' ? tw_person_name($row) : tw_visit_label($row);
        }
        if ($forKind === '' && $set['pourqui'] === 'obligatoire') { throw new TwRefuse('pourqui', 'Choisis pour qui est cette photo.'); }
        $box = $pdo->query("SELECT count(*) AS n, coalesce(sum(size),0) AS b FROM phone_inbox WHERE status='box'")->fetch(PDO::FETCH_ASSOC);
        if ((int) $box['n'] >= $set['boite_max'] || (int) $box['b'] + (int) $f['size'] > TW_BOX_BYTES) { throw new TwRefuse('pleine', '📥 La boîte est pleine sur l’ordinateur : trie-la d’abord.', 507); }
        $s = $pdo->prepare('SELECT count(*) AS n, coalesce(sum(size),0) AS b FROM phone_inbox WHERE batch=? AND device_id=?'); $s->execute([$batch, $dev['id']]);
        $b = $s->fetch(PDO::FETCH_ASSOC);
        if ((int) $b['n'] >= $set['par_envoi']) { throw new TwRefuse('trop', i18n_t('Trop de photos dans cet envoi ({n} au plus).', ['n' => $set['par_envoi']]), 413); }
        if ((int) $b['b'] + (int) $f['size'] > TW_BATCH_BYTES) { throw new TwRefuse('total', 'Cet envoi est trop gros en tout (200 Mo au plus) : envoie le reste ensuite.', 413); }
        $img = tw_image((string) $f['tmp_name'], (int) $f['size'], $set);
    } catch (TwRefuse $e) {
        tw_refuse_note($pdo, $set, $e->why);
        tw_phone_json(['error' => $e->getMessage(), 'refused' => $e->why], $e->status);
    }
    $name = bin2hex(random_bytes(16)) . '.' . $img['ext'];
    $dir = tw_dir();
    if (@file_put_contents($dir . '/' . $name, $img['bytes']) === false) { tw_phone_json(['error' => 'Impossible de ranger la photo sur l’ordinateur (disque plein ?).'], 507); }
    @chmod($dir . '/' . $name, 0600);
    if ($img['thumb'] !== '') { @file_put_contents($dir . '/' . preg_replace('/\.[a-z]+$/', '-v.jpg', $name), $img['thumb']); }
    $pdo->prepare('INSERT INTO phone_inbox(created_ts, device_id, device_name, batch, note, for_kind, for_id, file, ext, size, width, height, taken_at, had_gps, lat, lon) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([tw_now(), $dev['id'], $dev['name'], $batch, $note, $forKind, $forId, $name, $img['ext'], strlen($img['bytes']), $img['w'], $img['h'], $img['taken'], $img['had_gps'] ? 1 : 0, $img['lat'], $img['lon']]);
    $id = (int) $pdo->lastInsertId();
    tw_log($pdo, 'tw_depot', 'inbox', $id, $forLabel !== '' ? $forLabel : $note, $img['had_gps'] && $set['gps'] === 'retire' ? 'gps' : '');
    // réglage « reliées tout de suite à la personne choisie » : toujours visibles dans À trier (filtre « Reliées »), avec ↶ Annuler
    if ($set['arrivee_ou'] === 'relier' && $forKind !== '') {
        try { $pdo->beginTransaction(); tw_link($pdo, $set, [$id], $forKind, $forId, false); $pdo->commit(); } catch (Throwable $_) { if ($pdo->inTransaction()) { $pdo->rollBack(); } }
    }
    tw_phone_json(['ok' => true, 'id' => $id, 'gps_removed' => $img['had_gps'] && $set['gps'] === 'retire']);
}

/* ═════════ 📥 la boîte À trier (l'ordinateur : api.php) ═════════ */

/** Les photos supprimées depuis plus de 30 jours (ou 10 s, réglage) sont effacées pour de bon, fichiers compris ; les lignes reliées depuis 30 jours aussi (le média reste). */
function tw_purge(PDO $pdo, ?array $set = null): int
{
    $set ??= tw_settings($pdo);
    $t = tw_now();
    $limit = $set['suppr'] === 'direct' ? $t - TW_UNDO_S : $t - TW_TRASH_DAYS * 86400;
    $s = $pdo->prepare("SELECT id, file, status FROM phone_inbox WHERE (status='deleted' AND deleted_ts<?) OR (status='linked' AND linked_ts<?)");
    $s->execute([$limit, $t - TW_TRASH_DAYS * 86400]);
    $n = 0;
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if ($r['status'] === 'deleted') { tw_unlink_files((string) $r['file']); }
        else { @unlink(tw_dir() . '/' . preg_replace('/\.[a-z]+$/', '-v.jpg', (string) $r['file'])); }
        $pdo->prepare('DELETE FROM phone_inbox WHERE id=?')->execute([(int) $r['id']]);
        $n++;
    }
    return $n;
}

function tw_row_out(array $r, array $labels): array
{
    $for = $r['for_kind'] !== '' ? ($labels[$r['for_kind'] . ':' . $r['for_id']] ?? '') : '';
    return ['id' => (int) $r['id'], 'at' => date('c', (int) $r['created_ts']), 'device' => (string) $r['device_name'], 'device_id' => (string) $r['device_id'], 'note' => (string) $r['note'],
        'for_kind' => (string) $r['for_kind'], 'for_id' => (int) $r['for_id'], 'for' => $for, 'w' => (int) $r['width'], 'h' => (int) $r['height'], 'size' => (int) $r['size'],
        'taken' => (string) $r['taken_at'], 'gps' => (int) $r['had_gps'] === 1, 'gps_kept' => $r['lat'] !== null, 'status' => (string) $r['status'],
        'deleted' => (int) $r['deleted_ts'] ? date('c', (int) $r['deleted_ts']) : '', 'media_id' => (int) $r['media_id'], 'link_kind' => (string) $r['link_kind'], 'link_id' => (int) $r['link_id'],
        'link' => $r['link_kind'] !== '' ? ($labels[$r['link_kind'] . ':' . $r['link_id']] ?? '') : ''];
}
function tw_labels(PDO $pdo, array $rows): array
{
    $want = [];
    foreach ($rows as $r) { if ($r['for_kind'] !== '') { $want[$r['for_kind']][] = (int) $r['for_id']; } if ($r['link_kind'] !== '') { $want[$r['link_kind']][] = (int) $r['link_id']; } }
    $out = [];
    if (!empty($want['person'])) { foreach ($pdo->query('SELECT id, first_name, last_name FROM persons WHERE id IN (' . implode(',', array_map('intval', array_unique($want['person']))) . ')') as $p) { $out['person:' . $p['id']] = tw_person_name($p); } }
    if (!empty($want['visit']) && tw_has_table($pdo, 'archive_visit_plans')) { foreach ($pdo->query('SELECT id, title, archive_center, visit_date FROM archive_visit_plans WHERE id IN (' . implode(',', array_map('intval', array_unique($want['visit']))) . ')') as $v) { $out['visit:' . $v['id']] = tw_visit_label($v); } }
    if (!empty($want['source'])) { foreach ($pdo->query('SELECT id, title FROM sources WHERE id IN (' . implode(',', array_map('intval', array_unique($want['source']))) . ')') as $v) { $out['source:' . $v['id']] = (string) $v['title']; } }
    if (!empty($want['event'])) { foreach ($pdo->query('SELECT e.id, t.label AS tname, e.date_text, p.first_name, p.last_name FROM events e LEFT JOIN event_types t ON t.id=e.event_type_id LEFT JOIN persons p ON p.id=e.person_id WHERE e.id IN (' . implode(',', array_map('intval', array_unique($want['event']))) . ')') as $v) { $out['event:' . $v['id']] = trim((string) $v['tname'] . ' · ' . tw_person_name($v) . ' ' . (string) $v['date_text'], ' ·'); } }
    return $out;
}
function tw_ids(mixed $raw): array
{
    $list = is_array($raw) ? $raw : explode(',', is_scalar($raw) ? (string) $raw : '');
    return array_slice(array_values(array_unique(array_filter(array_map(static fn($v) => safe_int($v), $list), static fn(int $v) => $v > 0))), 0, 500);
}

/** Relier : la photo devient un média (fichier déplacé dans les médias, nom tiré au hasard), relié à ce que tu choisis ; le texte du téléphone devient sa description. */
function tw_link(PDO $pdo, array $set, array $ids, string $kind, int $target, bool $keepGps): array
{
    if (!in_array($kind, ['person', 'event', 'source', 'visit'], true) || $target <= 0) { throw new LcndaBadInput('Choisis à quoi relier.'); }
    $label = tw_labels($pdo, [['for_kind' => $kind, 'for_id' => $target, 'link_kind' => '', 'link_id' => 0]])[$kind . ':' . $target] ?? null;
    if ($label === null) { throw new LcndaBadInput('Introuvable.'); }
    if ($kind === 'person' && function_exists('person_is_locked') && person_is_locked($pdo, $target)) { throw new LcndaBadInput('Cette fiche est verrouillée : rien n’y est relié.'); }
    $done = [];
    $moved = [];
    try {
        foreach ($ids as $id) {
            $s = $pdo->prepare("SELECT * FROM phone_inbox WHERE id=? AND status='box'"); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
            if (!$r || !tw_file_ok((string) $r['file'])) { continue; }
            $src = tw_dir() . '/' . $r['file'];
            if (!is_file($src)) { continue; }
            if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
            $dest = bin2hex(random_bytes(16)) . '.' . $r['ext'];
            if (!@rename($src, MEDIA_DIR . '/' . $dest)) { if (!@copy($src, MEDIA_DIR . '/' . $dest)) { throw new RuntimeException('Impossible de ranger la photo dans les médias.'); } @unlink($src); }
            $moved[] = [MEDIA_DIR . '/' . $dest, $src];
            $title = (string) $r['note'] !== '' ? (string) $r['note'] : i18n_t('Photo du téléphone');
            $title = $kind === 'visit' ? trim($label . ' — ' . $title) : $title;
            $pdo->prepare("INSERT INTO media(title, description, media_type, filename, thumbnail) VALUES(?,?,'image',?,?)")->execute([mb_substr($title, 0, 300), (string) $r['note'], $dest, $dest]);
            $mid = (int) $pdo->lastInsertId();
            if ($kind !== 'visit') { $pdo->prepare('INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?,?,?,?)')->execute([$mid, $kind, $target, microtime(true)]); }
            else {
                $p = $pdo->prepare('SELECT import_json FROM archive_visit_plans WHERE id=?'); $p->execute([$target]);
                $imp = json_decode((string) $p->fetchColumn(), true); $imp = is_array($imp) ? $imp : [];
                $imp['phone_media'] = array_values(array_unique(array_merge(array_map('intval', (array) ($imp['phone_media'] ?? [])), [$mid])));
                try { $pdo->prepare('UPDATE archive_visit_plans SET import_json=? WHERE id=?')->execute([json_encode($imp, JSON_UNESCAPED_UNICODE), $target]); } catch (Throwable $_) {}
            }
            // la date de prise de vue (et la position, si le réglage la garde) : comme ⤒ Importer des photos (Cartes de photos)
            $lat = $r['lat'] !== null && ($set['gps'] === 'garde' || ($set['gps'] === 'relier' && $keepGps)) ? (float) $r['lat'] : null;
            $lon = $lat !== null ? (float) $r['lon'] : null;
            if ($lat !== null || (string) $r['taken_at'] !== '') {
                try {
                    if (!function_exists('pm_media_geo')) { require_once __DIR__ . '/photomaps.php'; }
                    photomaps_ensure($pdo); pm_media_geo($pdo, $mid, $dest);
                    $pdo->prepare('UPDATE photo_media_geo SET lat=?, lon=?, taken_at=? WHERE media_id=?')->execute([$lat, $lon, (string) $r['taken_at'], $mid]);
                } catch (Throwable $_) {}
            }
            $pdo->prepare("UPDATE phone_inbox SET status='linked', linked_ts=?, media_id=?, link_kind=?, link_id=?, file=? WHERE id=?")->execute([tw_now(), $mid, $kind, $target, $r['file'], $id]);
            tw_log($pdo, 'tw_relie', $kind, $kind === 'visit' ? null : $target, $label, 'photo');
            $done[] = ['id' => (int) $id, 'media_id' => $mid];
        }
    } catch (Throwable $e) {
        foreach ($moved as [$to, $from]) { if (is_file($to)) { @rename($to, $from); } }
        throw $e;
    }
    $tomb = $set['tombe'] === 'proposer' && $kind === 'person' && $done && (bool) array_filter($ids, static function ($id) use ($pdo) { $s = $pdo->prepare('SELECT note FROM phone_inbox WHERE id=?'); $s->execute([$id]); return (bool) preg_match('/\b(tombe|tombeau|s[ée]pulture|cimeti[èe]re|caveau|grave|tomb)\b/iu', (string) $s->fetchColumn()); });
    $tomb = $tomb && !tw_has_burial($pdo, $target);
    $buri = $tomb ? (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BURI' AND scope='person' ORDER BY is_custom, id LIMIT 1")->fetchColumn() : 0;
    return ['linked' => $done, 'label' => $label, 'tomb' => $tomb && $buri > 0, 'burial_type' => $buri, 'kind' => $kind, 'target' => $target];
}
function tw_has_burial(PDO $pdo, int $pid): bool
{
    $s = $pdo->prepare("SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=? AND t.gedcom_tag='BURI' LIMIT 1"); $s->execute([$pid]);
    return (bool) $s->fetchColumn();
}
/** ↶ Annuler un « Relier » : le média créé est retiré, la photo revient dans la boîte (seulement si personne ne l'a relié ailleurs entre-temps). */
function tw_unlink(PDO $pdo, array $ids): int
{
    $n = 0;
    foreach ($ids as $id) {
        $s = $pdo->prepare("SELECT * FROM phone_inbox WHERE id=? AND status='linked'"); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
        if (!$r || !tw_file_ok((string) $r['file'])) { continue; }
        $m = $pdo->prepare('SELECT filename FROM media WHERE id=?'); $m->execute([(int) $r['media_id']]); $fn = basename((string) $m->fetchColumn());
        if ($fn !== '' && preg_match('/^[a-f0-9]{32}\.(jpg|png|webp|avif)$/', $fn) && is_file(MEDIA_DIR . '/' . $fn)) { @rename(MEDIA_DIR . '/' . $fn, tw_dir() . '/' . $r['file']); }
        $pdo->prepare('DELETE FROM media_links WHERE media_id=?')->execute([(int) $r['media_id']]);
        try { $pdo->prepare('DELETE FROM photo_media_geo WHERE media_id=?')->execute([(int) $r['media_id']]); } catch (Throwable $_) {}
        $pdo->prepare('DELETE FROM media WHERE id=?')->execute([(int) $r['media_id']]);
        $pdo->prepare("UPDATE phone_inbox SET status='box', linked_ts=0, media_id=0, link_kind='', link_id=0 WHERE id=?")->execute([$id]);
        $n++;
    }
    return $n;
}

/** Un téléphone retiré (main.js, second secret) : ses photos restent à trier (conseillé) ou vont dans « 🗑 Supprimées ». */
function tw_device_removed(PDO $pdo, string $devId): int
{
    if (!preg_match('/^[a-f0-9]{16}$/', $devId) || !tw_has_table($pdo, 'phone_inbox')) { return 0; }
    if (tw_settings($pdo)['retrait'] !== 'supprimer') { return 0; }
    $s = $pdo->prepare("UPDATE phone_inbox SET status='deleted', deleted_ts=? WHERE device_id=? AND status='box'"); $s->execute([tw_now(), $devId]);
    return $s->rowCount();
}

function tw_inbox_file(PDO $pdo, int $id, bool $thumb, bool $download): never
{
    $s = $pdo->prepare('SELECT file, ext, status FROM phone_inbox WHERE id=?'); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    $file = $r ? (string) $r['file'] : '';
    if (!$r || !tw_file_ok($file) || !isset(TW_TYPES[(string) $r['ext']])) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Introuvable'; exit; }
    $path = tw_dir() . '/' . ($thumb ? preg_replace('/\.[a-z]+$/', '-v.jpg', $file) : $file);
    $type = $thumb ? 'image/jpeg' : TW_TYPES[(string) $r['ext']];
    if (!$thumb && $r['status'] === 'linked') { // déjà rangée : le fichier est dans les médias
        $m = $pdo->prepare('SELECT m.filename FROM media m JOIN phone_inbox i ON i.media_id=m.id WHERE i.id=?'); $m->execute([$id]); $fn = basename((string) $m->fetchColumn());
        $path = preg_match('/^[a-f0-9]{32}\.(jpg|png|webp|avif)$/', $fn) ? MEDIA_DIR . '/' . $fn : '';
    }
    if ($path === '' || !is_file($path)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Introuvable'; exit; }
    // toujours un type d'image, jamais deviné par le navigateur, jamais exécuté (sandbox), jamais gardé en cache
    header('Content-Type: ' . $type);
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    header('Cache-Control: no-store, private');
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="a-trier-' . $id . '.' . ($thumb ? 'jpg' : $r['ext']) . '"');
    while (ob_get_level() > 0) { ob_end_clean(); }
    readfile($path);
    exit;
}

function tw_inbox_count(PDO $pdo): int
{
    if (!tw_has_table($pdo, 'phone_inbox')) { return 0; }
    return (int) $pdo->query("SELECT count(*) FROM phone_inbox WHERE status='box'")->fetchColumn();
}

function tw_inbox_dispatch(PDO $pdo, string $action, bool $isWrite, array $d): never
{
    try {
        tw_schema($pdo);
        $set = tw_settings($pdo);
        if (!$isWrite && $action === 'inbox_count') { json_response(['box' => tw_inbox_count($pdo), 'pastille' => $set['pastille'], 'arrivee' => $set['arrivee']]); }
        if (!$isWrite && $action === 'inbox_file') { tw_inbox_file($pdo, safe_int($_GET['id'] ?? 0), !empty($_GET['thumb']), !empty($_GET['download'])); }
        if (!$isWrite && $action === 'inbox_list') {
            $pdo->beginTransaction(); tw_purge($pdo, $set); $pdo->commit();
            $view = in_array($_GET['view'] ?? '', ['box', 'deleted', 'linked'], true) ? (string) $_GET['view'] : 'box';
            $s = $pdo->prepare('SELECT * FROM phone_inbox WHERE status=? ORDER BY created_ts DESC, id DESC LIMIT 1000'); $s->execute([$view]);
            $rows = $s->fetchAll(PDO::FETCH_ASSOC);
            $labels = tw_labels($pdo, $rows);
            $counts = ['box' => 0, 'deleted' => 0, 'linked' => 0];
            foreach ($pdo->query('SELECT status, count(*) AS n FROM phone_inbox GROUP BY status') as $c) { $counts[(string) $c['status']] = (int) $c['n']; }
            json_response(['rows' => array_map(static fn($r) => tw_row_out($r, $labels), $rows), 'counts' => $counts, 'view' => $view, 'settings' => $set, 'defaults' => tw_defaults(),
                'spec' => TW_SPEC, 'num' => TW_NUM, 'trash_days' => TW_TRASH_DAYS, 'kiosk' => function_exists('kiosk_state') && !empty(kiosk_state()['on'])]);
        }
        if (!$isWrite && $action === 'inbox_settings') { json_response(['settings' => $set, 'defaults' => tw_defaults(), 'spec' => TW_SPEC, 'num' => TW_NUM]); }
        if ($isWrite && $action === 'inbox_write') {
            $op = is_string($d['op'] ?? null) ? (string) $d['op'] : '';
            $ids = tw_ids($d['ids'] ?? []);
            $pdo->beginTransaction();
            try {
                $out = match ($op) {
                    'link' => tw_link($pdo, $set, $ids, (string) ($d['kind'] ?? ''), safe_int($d['target'] ?? 0), !empty($d['keep_gps'])),
                    'unlink' => ['unlinked' => tw_unlink($pdo, $ids)],
                    'delete' => (static function () use ($pdo, $ids): array { $s = $pdo->prepare("UPDATE phone_inbox SET status='deleted', deleted_ts=? WHERE id=? AND status='box'"); $n = 0; foreach ($ids as $id) { $s->execute([tw_now(), $id]); $n += $s->rowCount(); } return ['deleted' => $n]; })(),
                    'restore' => (static function () use ($pdo, $ids, $set): array {
                        // ↶ Annuler / Remettre : seulement dans les 30 jours (ou les 10 s, réglage « effacée tout de suite ») et si le fichier est encore là
                        $limit = $set['suppr'] === 'direct' ? tw_now() - TW_UNDO_S : tw_now() - TW_TRASH_DAYS * 86400;
                        $n = 0;
                        foreach ($ids as $id) {
                            $s = $pdo->prepare("SELECT file FROM phone_inbox WHERE id=? AND status='deleted' AND deleted_ts>=?"); $s->execute([$id, $limit]); $f = (string) $s->fetchColumn();
                            if ($f === '' || !tw_file_ok($f) || !is_file(tw_dir() . '/' . $f)) { continue; }
                            $pdo->prepare("UPDATE phone_inbox SET status='box', deleted_ts=0 WHERE id=?")->execute([$id]); $n++;
                        }
                        if (!$n && $ids) { throw new LcndaBadInput('Trop tard : cette photo a été effacée pour de bon.'); }
                        return ['restored' => $n];
                    })(),
                    'note' => (static function () use ($pdo, $d): array { $s = $pdo->prepare("UPDATE phone_inbox SET note=? WHERE id=? AND status='box'"); $s->execute([tw_line($d['note'] ?? ''), safe_int($d['id'] ?? 0)]); return ['ok' => $s->rowCount() > 0]; })(),
                    'rotate' => tw_rotate($pdo, safe_int($d['id'] ?? 0), (string) ($d['dir'] ?? 'right')),
                    'settings' => tw_settings_save($pdo, $d),
                    default => throw new LcndaBadInput('Opération inconnue.'),
                };
                $pdo->commit();
            } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
            json_response(['ok' => true] + $out + ['box' => tw_inbox_count($pdo)]);
        }
        throw new LcndaBadInput('Opération inconnue.');
    } catch (LcndaBadInput $e) {
        json_response(['error' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        json_response(['error' => function_exists('readable_error_message') ? readable_error_message($e) : $e->getMessage()], 422);
    }
}

function tw_rotate(PDO $pdo, int $id, string $dir): array
{
    $s = $pdo->prepare("SELECT file, ext FROM phone_inbox WHERE id=? AND status='box'"); $s->execute([$id]); $r = $s->fetch(PDO::FETCH_ASSOC);
    if (!$r || !tw_file_ok((string) $r['file'])) { throw new LcndaBadInput('Introuvable.'); }
    $path = tw_dir() . '/' . $r['file'];
    $loader = ['jpg' => 'imagecreatefromjpeg', 'png' => 'imagecreatefrompng', 'webp' => 'imagecreatefromwebp', 'avif' => 'imagecreatefromavif'][(string) $r['ext']] ?? '';
    $img = $loader !== '' && function_exists($loader) ? @$loader($path) : null;
    if (!$img instanceof GdImage) { throw new LcndaBadInput('Image abîmée ou illisible.'); }
    $img = imagerotate($img, $dir === 'left' ? 90 : 270, 0);
    $bytes = tw_encode($img, (string) $r['ext'], 92);
    if ($bytes === '' || @file_put_contents($path, $bytes) === false) { throw new RuntimeException('Impossible de tourner la photo.'); }
    @file_put_contents(tw_dir() . '/' . preg_replace('/\.[a-z]+$/', '-v.jpg', (string) $r['file']), tw_encode(tw_resize($img, TW_THUMB_PX), 'jpg', 80));
    $pdo->prepare('UPDATE phone_inbox SET width=?, height=?, size=? WHERE id=?')->execute([imagesx($img), imagesy($img), strlen($bytes), $id]);
    return ['ok' => true];
}
