<?php
declare(strict_types=1);

/**
 * 🔐 L'écran « … est verrouillée » (index.php, quand la séance n'a pas ouvert cette généalogie protégée par un mot de passe).
 * Rien de la base n'est lu ni écrit dans la page : seulement le nom de la généalogie (rangé hors de la base, genealogies.json),
 * le jeton CSRF de la séance et les textes de l'app. Le reste (essai, autre généalogie) : assets/js/app-verrou-ecran.js.
 */
require_once __DIR__ . '/i18n.php';
header('Cache-Control: no-store, private');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-LCNDA-Glock: 1');
$glockName = glock_genealogy_name();
$e = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$lang = i18n_page_lang();
?>
<!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="robots" content="noindex">
    <title><?= $e(i18n_t('🔐 Généalogie verrouillée')) ?></title>
    <link rel="stylesheet" href="assets/css/verrou.css?v=1">
    <script>try { var d = JSON.parse(localStorage.getItem('genealogie-design') || 'null'); if ((d && d.preset === 'dark') || (!d && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.dataset.theme = 'dark'; } catch (_) {}</script>
</head>
<body class="gl-body">
<main class="gl-screen" id="glock-screen" data-glock-screen>
    <section class="gl-card" aria-labelledby="gl-title">
        <div class="gl-ico" aria-hidden="true">🔐</div>
        <h1 id="gl-title" class="gl-title"><?= str_replace('§NAME§', '<span data-i18n-off>' . $e($glockName) . '</span>', $e(i18n_t('« {name} » est verrouillée', ['name' => '§NAME§']))) ?></h1>
        <p class="gl-lead"><?= $e(i18n_t('Elle est protégée par un mot de passe.')) ?></p>
        <form class="gl-form" data-glock-form autocomplete="off" novalidate>
            <label class="gl-label" for="glock-pw"><?= $e(i18n_t('Mot de passe')) ?></label>
            <input id="glock-pw" name="password" type="password" class="gl-input" autocomplete="current-password" maxlength="1024" required autofocus spellcheck="false" autocapitalize="off">
            <button type="submit" class="gl-button" data-glock-open><?= $e(i18n_t('Ouvrir')) ?></button>
            <p class="gl-msg" data-glock-msg role="status" aria-live="polite"></p>
        </form>
        <p class="gl-links">
            <button type="button" class="gl-link" data-glock-others>⇄ <?= $e(i18n_t('Ouvrir une autre généalogie')) ?></button>
            <span aria-hidden="true">·</span>
            <button type="button" class="gl-link" data-glock-forgot aria-expanded="false"><?= $e(i18n_t('Mot de passe oublié ?')) ?></button>
        </p>
        <div class="gl-others" data-glock-list hidden></div>
        <div class="gl-forgot" data-glock-forgot-text hidden>
            <p><?= $e(i18n_t('Sans ce mot de passe, cette généalogie ne peut plus être ouverte dans l’app : il n’existe pas de porte dérobée, et personne ne peut le retrouver pour toi.')) ?></p>
            <p><?= $e(i18n_t('Attention : le verrou n’empêche pas de lire le fichier si quelqu’un le copie (il n’est pas chiffré). Pour ça, chiffre le disque de ton ordinateur (FileVault sur Mac, BitLocker sous Windows).')) ?></p>
        </div>
    </section>
</main>
<script>window.LCNDA_GENEALOGY = <?= json_encode(glock_key()) ?>; window.INSTALL_CSRF = <?= json_encode(csrf_token()) ?>; window.LCNDA_GLOCK_SCREEN = true;</script>
<?= i18n_page_script() ?>
<script src="assets/js/app-i18n.js?v=42"></script>
<script src="assets/js/app-verrou-ecran.js?v=1"></script>
</body>
</html>
