<?php
declare(strict_types=1);

/**
 * 📎 Taille des fichiers ajoutés (Réglages → Fichiers des médias ; assets/js/app-media-limits.js) :
 *  - la taille la plus grande d'une image ou d'un document (conseillé : 100 Mo), d'un son ou d'une vidéo (conseillé : 250 Mo),
 *    vérifiée par upload.php et rappelée dans le navigateur (window.LCNDA_MEDIA_LIMITS, écrit par index.php) ;
 *  - la taille d'image la plus grande, en millions de points (conseillé : 120), que les outils qui décodent une image
 *    (vignettes PHP/GD, « 🎚️ Mieux voir », ✨ Lire l'acte, Atelier, retouche…) acceptent de traiter : au-delà, l'image
 *    reste dans la généalogie, seuls ces outils ne la traitent pas (la mémoire de l'ordinateur est protégée).
 * Rangé dans la base (app_settings, clé lcnda-media-limits) : suit la sauvegarde complète. Le téléphone par le wifi
 * (lib/telephone_wifi.php) garde ses propres limites, plus serrées.
 */

const MEDIA_LIMITS_KEY = 'lcnda-media-limits';
const MEDIA_LIMITS_DEFAULT = ['image_mb' => 100, 'av_mb' => 250, 'mpx' => 120];
const MEDIA_LIMITS_CHOICES = [
    'image_mb' => [25, 50, 100, 200, 500],
    'av_mb' => [100, 250, 500, 1000, 2000],
    'mpx' => [50, 80, 120, 200, 300],
];

/** Les limites en cours (les conseillées si rien n'est réglé, ou si la valeur rangée n'est pas un des choix). */
function media_limits(?PDO $pdo = null): array
{
    static $memo = null;
    if ($pdo === null && $memo !== null) { return $memo; }
    $saved = [];
    try {
        $pdo ??= db();
        $st = $pdo->prepare('SELECT value FROM app_settings WHERE key=?');
        $st->execute([MEDIA_LIMITS_KEY]);
        $saved = json_decode((string) $st->fetchColumn(), true) ?: [];
    } catch (Throwable) { $saved = []; }
    $out = MEDIA_LIMITS_DEFAULT;
    foreach (MEDIA_LIMITS_CHOICES as $k => $choices) {
        $v = (int) ($saved[$k] ?? 0);
        if (in_array($v, $choices, true)) { $out[$k] = $v; }
    }
    return $memo = $out;
}

/** Pour la page (index.php) et api.php?action=media_limits : les limites, les choix, les conseillées. */
function media_limits_for_page(?PDO $pdo = null): array
{
    return ['limits' => media_limits($pdo), 'choices' => MEDIA_LIMITS_CHOICES, 'defaults' => MEDIA_LIMITS_DEFAULT];
}

/** api.php?action=save_media_limits : seulement des valeurs proposées ; une valeur absente reste comme avant. */
function media_limits_save(PDO $pdo, array $data): array
{
    $cur = media_limits($pdo);
    foreach (MEDIA_LIMITS_CHOICES as $k => $choices) {
        if (!array_key_exists($k, $data)) { continue; }
        $v = (int) $data[$k];
        if (!in_array($v, $choices, true)) { throw new RuntimeException('Valeur de réglage inconnue.'); }
        $cur[$k] = $v;
    }
    $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')
        ->execute([MEDIA_LIMITS_KEY, json_encode($cur)]);
    return media_limits_for_page($pdo);
}

/** La taille la plus grande, en octets, pour un fichier de cette sorte (image, pdf, audio, video). */
function media_max_bytes(string $mediaType, ?PDO $pdo = null): int
{
    $l = media_limits($pdo);
    return (in_array($mediaType, ['audio', 'video'], true) ? $l['av_mb'] : $l['image_mb']) * 1024 * 1024;
}

/**
 * Une image trop grande pour être décodée sans risque ? Lit seulement l'en-tête (getimagesize : rien n'est décodé).
 * Renvoie null si l'image peut être traitée (ou si ce n'est pas une image lisible : l'outil dira lui-même ce qui ne va pas),
 * sinon ['w' => …, 'h' => …, 'mpx' => …, 'max' => …].
 */
function media_image_too_big(string $path, ?PDO $pdo = null): ?array
{
    $info = @getimagesize($path);
    if (!$info || (int) $info[0] < 1 || (int) $info[1] < 1) { return null; }
    return media_pixels_too_big((int) $info[0], (int) $info[1], $pdo);
}

function media_pixels_too_big(int $w, int $h, ?PDO $pdo = null): ?array
{
    $max = media_limits($pdo)['mpx'];
    $mpx = $w * $h / 1e6;
    return $mpx > $max ? ['w' => $w, 'h' => $h, 'mpx' => (int) ceil($mpx), 'max' => $max] : null;
}

/** Le message clair : l'image est gardée, seuls les outils qui la décodent ne la traitent pas. */
function media_too_big_message(array $big): string
{
    return i18n_t('Cette image est très grande ({w} × {h} points, {n} millions) : elle est bien gardée, mais les outils qui la décodent (vignettes, « Mieux voir », lecture de l’écriture, retouche) ne la traitent pas au-delà de {max} millions de points, pour ne pas saturer la mémoire. Tu peux changer cette limite : Réglages → Fichiers des médias.',
        ['w' => $big['w'], 'h' => $big['h'], 'n' => $big['mpx'], 'max' => $big['max']]);
}

/** Avant de décoder une image : refuse proprement si elle dépasse la limite de points. */
function media_image_guard(string $path, ?PDO $pdo = null): void
{
    $big = media_image_too_big($path, $pdo);
    if ($big) { throw new RuntimeException(media_too_big_message($big)); }
}
