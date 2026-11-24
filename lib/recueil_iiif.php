<?php
declare(strict_types=1);
/**
 * 📚 Un recueil depuis l'adresse d'un registre en ligne (IIIF : le format d'images que publient beaucoup d'archives,
 * de bibliothèques et Gallica). On colle l'adresse du « manifeste » (…/manifest.json) : l'app lit le titre et la liste
 * des vues, puis télécharge les vues choisies, quelques-unes à chaque appel (la fenêtre montre l'avancée), dans les Médias,
 * chacune sur une nouvelle page du recueil. Rien n'est envoyé : on ne fait que lire l'adresse donnée.
 * Sécurité : seulement http(s), jamais une adresse du réseau local (link_safe_resolve, chaque redirection revérifiée),
 * tailles bornées (manifeste 8 Mo, une vue 25 Mo), une vue doit être une vraie image.
 * Essais : tests/test-recueil-iiif.js (un faux site « iiif.test » lu sur le disque, seulement quand GENEALOGY_TEST=1).
 */

const IIIF_MANIFEST_MAX = 8 * 1024 * 1024;
const IIIF_IMAGE_MAX = 25 * 1024 * 1024;
const IIIF_BATCH = 4;

/** lit une adresse publique (suit 6 redirections au plus, chacune revérifiée) ; renvoie le contenu */
function iiif_get(string $url, int $max): string
{
    $url = trim($url);
    // essais : le faux site « https://iiif.test/… » est lu dans un dossier (jamais en dehors des essais)
    $dir = (string) getenv('LCNDA_TEST_IIIF_DIR');
    if (getenv('GENEALOGY_TEST') === '1' && $dir !== '' && preg_match('#^https://iiif\.test/([A-Za-z0-9_./,!-]+)$#', $url, $m) && !str_contains($m[1], '..')) {
        $f = $dir . '/' . $m[1]; if (!is_file($f)) { throw new LcndaBadInput(i18n_t('Adresse introuvable (erreur {code}).', ['code' => '404'])); }
        return (string) file_get_contents($f);
    }
    if (!function_exists('curl_init')) { throw new RuntimeException(i18n_t('Téléchargement impossible : PHP n’a pas l’extension curl.')); }
    for ($hop = 0; $hop < 7; $hop++) {
        $resolve = link_safe_resolve($url);
        if ($resolve === null) { throw new LcndaBadInput(i18n_t('Adresse refusée : seulement une adresse publique en http ou https.')); }
        $body = ''; $too = false;
        $ch = curl_init($url);
        curl_setopt_array($ch, ($resolve !== '' ? [CURLOPT_RESOLVE => [$resolve]] : []) + [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROXY => '', CURLOPT_NOPROXY => '*',
            CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => 90, CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (LCNDA, lecture IIIF)',
            CURLOPT_HTTPHEADER => ['Accept: application/ld+json, application/json, image/*;q=0.9, */*;q=0.5'],
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too, $max) { $body .= $chunk; if (strlen($body) > $max) { $too = true; return 0; } return strlen($chunk); }] + lcnda_curl_tls());
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $loc = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: ''); $err = curl_errno($ch) ? curl_strerror(curl_errno($ch)) : '';
        unset($ch);
        if ($too) { throw new LcndaBadInput(i18n_t('Fichier trop gros.')); }
        if (in_array($code, [301, 302, 303, 307, 308], true) && $loc !== '') { $url = link_absolute_url($url, $loc); continue; }
        if ($code < 200 || $code >= 300) { throw new LcndaBadInput($err !== '' ? i18n_t('Le site ne répond pas : {err}', ['err' => $err]) : i18n_t('Adresse introuvable (erreur {code}).', ['code' => (string) $code])); }
        return $body;
    }
    throw new LcndaBadInput(i18n_t('Trop de redirections.'));
}

/** un libellé IIIF (texte, {"fr": ["…"]}, [{"@value": "…"}]) en texte */
function iiif_label(mixed $l): string
{
    if (is_string($l)) { return trim(strip_tags($l)); }
    if (!is_array($l)) { return ''; }
    if (isset($l['@value'])) { return iiif_label($l['@value']); }
    foreach (['fr', 'none', 'en'] as $k) { if (isset($l[$k])) { return iiif_label(is_array($l[$k]) ? ($l[$k][0] ?? '') : $l[$k]); } }
    $first = reset($l); return $first === false ? '' : iiif_label($first);
}

/** l'adresse d'une image (largeur 2000 au plus) depuis un service d'images IIIF, ou l'image elle-même */
function iiif_image_url(string $service, string $direct): string
{
    $service = rtrim($service, '/');
    if ($service !== '' && preg_match('#^https?://#i', $service)) { return $service . '/full/!2000,2000/0/default.jpg'; }
    return preg_match('#^https?://#i', $direct) ? $direct : '';
}

/** le manifeste (Presentation 2 ou 3) → titre, attribution, vues [{label, url}] */
function iiif_parse(string $json): array
{
    $m = json_decode($json, true);
    if (!is_array($m)) { throw new LcndaBadInput(i18n_t('Ce n’est pas un manifeste IIIF (pas du JSON).')); }
    $views = [];
    $svc = function ($s): string { if (is_array($s) && array_is_list($s)) { $s = $s[0] ?? null; } return is_array($s) ? (string) ($s['@id'] ?? $s['id'] ?? '') : ''; };
    if (isset($m['sequences'][0]['canvases']) && is_array($m['sequences'][0]['canvases'])) { // version 2
        foreach ($m['sequences'][0]['canvases'] as $i => $c) {
            $res = $c['images'][0]['resource'] ?? null; if (!is_array($res)) { continue; }
            $url = iiif_image_url($svc($res['service'] ?? null), (string) ($res['@id'] ?? ''));
            if ($url !== '') { $views[] = ['label' => iiif_label($c['label'] ?? '') ?: (string) ($i + 1), 'url' => $url]; }
        }
    } elseif (isset($m['items']) && is_array($m['items'])) { // version 3
        foreach ($m['items'] as $i => $c) {
            $body = $c['items'][0]['items'][0]['body'] ?? null; if (is_array($body) && array_is_list($body)) { $body = $body[0] ?? null; } if (!is_array($body)) { continue; }
            $url = iiif_image_url($svc($body['service'] ?? null), (string) ($body['id'] ?? ''));
            if ($url !== '') { $views[] = ['label' => iiif_label($c['label'] ?? '') ?: (string) ($i + 1), 'url' => $url]; }
        }
    } else { throw new LcndaBadInput(i18n_t('Ce n’est pas un manifeste IIIF : colle l’adresse du « manifest » (souvent …/manifest.json).')); }
    if (!$views) { throw new LcndaBadInput(i18n_t('Aucune image dans ce manifeste.')); }
    $attr = iiif_label($m['attribution'] ?? ($m['requiredStatement']['value'] ?? ''));
    return ['title' => mb_substr(iiif_label($m['label'] ?? '') ?: i18n_t('Registre en ligne'), 0, 300), 'attribution' => mb_substr($attr, 0, 500), 'views' => array_slice($views, 0, 3000)];
}

/** GET recueil_iiif_preview&url=… : ce qu'il y a avant de télécharger */
function recueil_iiif_preview(string $url): array
{
    if (function_exists('onglets_kiosk') && onglets_kiosk()) { throw new LcndaBadInput(i18n_t('Pas en mode consultation.')); }
    $p = iiif_parse(iiif_get($url, IIIF_MANIFEST_MAX));
    return ['title' => $p['title'], 'attribution' => $p['attribution'], 'count' => count($p['views']), 'labels' => array_column($p['views'], 'label')];
}

/**
 * POST recueil_iiif_import {url, recueil_id (0 : un nouveau recueil, pris de la 1re fois), from, to (n° de vues, 1 = la première), done (déjà faites)}
 * → {recueil_id, created, done, total, media_ids} : télécharge IIIF_BATCH vues à la fois ; la fenêtre rappelle jusqu'au bout.
 */
function recueil_iiif_import(PDO $pdo, array $d): array
{
    $url = trim((string) ($d['url'] ?? '')); if ($url === '') { throw new LcndaBadInput(i18n_t('Colle l’adresse du registre en ligne.')); }
    $p = iiif_parse(iiif_get($url, IIIF_MANIFEST_MAX)); $n = count($p['views']);
    $from = max(1, min($n, safe_int($d['from'] ?? 1) ?: 1)); $to = max($from, min($n, safe_int($d['to'] ?? $n) ?: $n));
    $done = max(0, safe_int($d['done'] ?? 0)); $total = $to - $from + 1;
    $rid = safe_int($d['recueil_id'] ?? 0); $created = false;
    if (!$rid) {
        $r = save_recueil($pdo, ['title' => $p['title'], 'url' => $url, 'first_version' => i18n_t('En ligne (IIIF)'), 'description' => trim(i18n_t('Vues téléchargées depuis {u}', ['u' => $url]) . ($p['attribution'] !== '' ? "\n" . i18n_t('Source : {s}', ['s' => $p['attribution']]) : ''))]);
        $rid = (int) $r['id']; $created = true;
    } else { recueil_row($pdo, $rid); }
    $vid = (int) $pdo->query('SELECT MAX(id) FROM recueil_versions WHERE recueil_id=' . $rid)->fetchColumn();
    $ids = [];
    for ($k = $done; $k < $total && count($ids) < IIIF_BATCH; $k++) {
        $v = $p['views'][$from - 1 + $k];
        $bytes = iiif_get($v['url'], IIIF_IMAGE_MAX);
        $info = @getimagesizefromstring($bytes); $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'][$info['mime'] ?? ''] ?? '';
        if ($ext === '') { throw new LcndaBadInput(i18n_t('La vue {n} n’est pas une image.', ['n' => $v['label']])); }
        if (!is_dir(MEDIA_DIR)) { @mkdir(MEDIA_DIR, 0775, true); }
        $name = bin2hex(random_bytes(16)) . '.' . $ext;
        if (file_put_contents(MEDIA_DIR . '/' . $name, $bytes) === false) { throw new RuntimeException(i18n_t('Impossible de ranger la photo dans les médias.')); }
        $pdo->prepare("INSERT INTO media(title, description, media_type, filename, thumbnail) VALUES(?,?,'image',?,?)")
            ->execute([mb_substr($p['title'] . ' — ' . i18n_t('vue {n}', ['n' => $v['label']]), 0, 300), mb_substr($url, 0, 2000), $name, $name]);
        $ids[] = (int) $pdo->lastInsertId();
    }
    if ($ids) {
        recueil_add_images($pdo, ['recueil_id' => $rid, 'version_id' => $vid, 'mode' => 'new_pages', 'media_ids' => $ids]);
        // le nom de chaque vue (« f° 12 », « 23 »…) devient le nom de sa page
        $pg = $pdo->prepare('SELECT page_id FROM recueil_images WHERE recueil_id=? AND media_id=?');
        foreach ($ids as $j => $mid) { $pg->execute([$rid, $mid]); $pid = (int) $pg->fetchColumn(); $lab = (string) $p['views'][$from - 1 + $done + $j]['label'];
            if ($pid && $lab !== '' && !ctype_digit($lab)) { save_recueil_page($pdo, ['id' => $pid, 'label' => $lab]); } }
    }
    return ['recueil_id' => $rid, 'created' => $created, 'done' => $done + count($ids), 'total' => $total, 'media_ids' => $ids, 'title' => $p['title']];
}
