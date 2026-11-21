<?php
declare(strict_types=1);

/**
 * 🖧 Plusieurs ordinateurs (maquette docs/design/plusieurs-ordinateurs.html) : ce que PHP sait d'un appareil invité.
 * La porte du wifi (electron/lan-gate.js) a déjà vérifié le jeton de l'appareil, son adresse (privée, même réseau), le nom
 * d'hôte et l'origine ; elle présente à PHP le nom 127.0.0.1, ajoute le secret de l'app et signe l'appareil avec un second
 * secret (GENEALOGY_GATE_SECRET, en-tête x-carnet-gate). Sans ce second secret, l'en-tête x-carnet-device est ignoré : une
 * demande sans lui est celle de la fenêtre de l'ordinateur principal.
 *
 * Ici, pour un appareil invité (router.php, avant tout le reste) :
 *  - 👁 lecture seule : toute écriture est refusée, sauf ouvrir / verrouiller sa propre séance (mot de passe de la
 *    généalogie, lib/verrou.php) et les réglages d'affichage, gardés pour la séance seulement (comme le mode consultation :
 *    kiosk_state() est « allumé » pour lui, donc kiosk_blocks() s'applique aussi aux lectures : exports, base) ;
 *  - réservé à l'ordinateur principal : changer de généalogie, le mot de passe, les sauvegardes et restaurations, les
 *    réglages globaux, l'archive d'installation (telecharger.php), les envois (upload.php), le registre ;
 *  - 🔐 réglage conseillé « mot de passe obligatoire » (en-tête x-carnet-device-pw) : une généalogie sans mot de passe ne
 *    s'ouvre pas sur un autre appareil ;
 *  - 📜 access_log_add() note le nom de l'appareil dans la colonne « device » (migration 99).
 */

/** L'appareil invité de cette demande, ou null (la fenêtre de l'ordinateur principal, un essai en ligne de commande). */
function lan_device(): ?array
{
    static $memo = false;
    if ($memo !== false) { return $memo; }
    $memo = null;
    if (PHP_SAPI === 'cli') { return null; }
    $gate = (string) getenv('GENEALOGY_GATE_SECRET');
    $given = (string) ($_SERVER['HTTP_X_CARNET_GATE'] ?? '');
    $id = (string) ($_SERVER['HTTP_X_CARNET_DEVICE'] ?? '');
    if ($gate === '' || $given === '' || !hash_equals($gate, $given) || !preg_match('/^[a-f0-9]{16}$/', $id)) {
        // un en-tête d'appareil sans la bonne signature : jamais pris pour la fenêtre principale non plus (refusé)
        if ($id !== '' || $given !== '') { $memo = ['id' => 'refuse', 'name' => '?', 'ip' => '', 'pw' => true, 'forged' => true]; }
        return $memo;
    }
    $name = trim((string) preg_replace('/[\x00-\x1f\x7f]+/u', ' ', rawurldecode((string) ($_SERVER['HTTP_X_CARNET_DEVICE_NAME'] ?? ''))));
    $memo = ['id' => $id, 'name' => mb_substr($name !== '' ? $name : 'Appareil', 0, 40), 'ip' => substr((string) ($_SERVER['HTTP_X_CARNET_DEVICE_IP'] ?? ''), 0, 45),
        'pw' => (string) ($_SERVER['HTTP_X_CARNET_DEVICE_PW'] ?? '') === '1', 'forged' => false];
    return $memo;
}

/** Le nom de l'appareil pour le registre (vide : l'ordinateur principal). */
function lan_device_name(): string
{
    if (isset($GLOBALS['LCNDA_LOG_DEVICE']) && is_string($GLOBALS['LCNDA_LOG_DEVICE'])) { return $GLOBALS['LCNDA_LOG_DEVICE']; }
    $d = lan_device();
    return $d ? (string) $d['name'] : '';
}

/** Écritures permises à un invité : seulement sa propre séance (mot de passe), et les réglages d'affichage (rien n'est écrit). */
const LAN_GUEST_WRITES = ['glock_unlock', 'glock_lock_now', 'glock_touch', 'save_settings'];
/** Lectures réservées à l'ordinateur principal, en plus de celles du mode consultation (kiosk_blocks) */
const LAN_GUEST_BLOCKED_READS = ['access_log', 'access_log_csv', 'autobackup_close', 'autobackup_tick', 'autobackup_check', 'lan_note', 'database_profiles',
    'export_sqlite', 'export_full_backup', 'website_live', 'website_live_rev', 'desk_widget_page', 'desk_widget_file'];

function lan_refuse(int $status, string $error, array $extra = []): bool
{
    require_once __DIR__ . '/i18n.php';
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => i18n_t($error)] + $extra + ['lan_guest' => true, 'kiosk' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return true;
}

/**
 * Appelé par router.php pour chaque demande, avant le reste. true = la demande a reçu sa réponse (refus) ; false = elle continue.
 * $path : le chemin demandé (déjà vérifié par router.php).
 */
function lan_guest_route(string $path): bool
{
    $d = lan_device();
    if (!$d) { return false; }
    if (!empty($d['forged'])) { return lan_refuse(403, 'Refusé.'); }
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $read = in_array($method, ['GET', 'HEAD'], true);
    $action = is_string($_GET['action'] ?? null) ? (string) $_GET['action'] : '';
    $lower = strtolower($path);
    // 🔐 réglage conseillé : pas de mot de passe sur cette généalogie = elle ne s'ouvre pas sur un autre appareil
    if ($d['pw'] && ($lower === '/' || str_ends_with($lower, '.php') || str_starts_with($lower, '/media/'))) {
        require_once __DIR__ . '/verrou.php';
        if (!glock_info()['locked']) {
            if ($lower === '/' || $lower === '/index.php') { lan_nopw_page(); return true; }
            return lan_refuse(423, 'Cette généalogie n’a pas de mot de passe : elle ne s’ouvre pas sur un autre appareil. Sur l’ordinateur principal : Réglages → 🔐 Mot de passe de cette généalogie.', ['lan_nopw' => true]);
        }
    }
    if (in_array($lower, ['/telecharger.php', '/upload.php'], true)) {
        return lan_refuse(423, 'Appareil invité : lecture seule. Cela ne se fait que sur l’ordinateur principal.');
    }
    if ($lower === '/api.php') {
        if (!$read && !in_array($action, LAN_GUEST_WRITES, true)) {
            return lan_refuse(423, 'Appareil invité : lecture seule. Cela ne se fait que sur l’ordinateur principal.');
        }
        if ($read && in_array($action, LAN_GUEST_BLOCKED_READS, true)) {
            return lan_refuse(423, 'Appareil invité : lecture seule. Cela ne se fait que sur l’ordinateur principal.');
        }
        return false;
    }
    if (!$read) { return lan_refuse(423, 'Appareil invité : lecture seule. Cela ne se fait que sur l’ordinateur principal.'); }
    return false;
}

/** La page montrée à l'invité quand la généalogie n'a pas de mot de passe (rien de la base). */
function lan_nopw_page(): void
{
    require_once __DIR__ . '/i18n.php';
    http_response_code(423);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    $t = static fn(string $s): string => htmlspecialchars(i18n_t($s), ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="' . htmlspecialchars(i18n_lang(), ENT_QUOTES, 'UTF-8') . '"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>🖧 LCNDA</title>'
        . '<body style="margin:0;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box;font:16px/1.5 system-ui,sans-serif;color:#333;background:#fbfbfb">'
        . '<div style="max-width:460px"><h1 style="font-size:22px">🔐 ' . $t('Il faut un mot de passe') . '</h1><p>'
        . $t('Cette généalogie n’a pas de mot de passe : elle ne s’ouvre pas sur un autre appareil. Sur l’ordinateur principal : Réglages → 🔐 Mot de passe de cette généalogie.')
        . '</p></div></body></html>';
}

/**
 * Note au registre un geste de la porte (ouverte, coupée, appareil autorisé, refusé, retiré, connecté). Seulement le processus
 * principal de l'app (second secret GENEALOGY_LOCAL_SECRET, que ni la page ni un appareil ne connaissent) : router.php.
 */
function lan_note_route(): bool
{
    $secret = (string) getenv('GENEALOGY_LOCAL_SECRET');
    if ($secret === '' || !hash_equals($secret, (string) ($_SERVER['HTTP_X_CARNET_LOCAL'] ?? '')) || lan_device()) {
        http_response_code(403); header('Content-Type: text/plain; charset=utf-8'); echo 'Refusé'; return true;
    }
    require_once __DIR__ . '/verrou.php';
    $kinds = ['lan_open', 'lan_close', 'lan_ok', 'lan_refuse', 'lan_remove', 'lan_connect'];
    $kind = (string) ($_GET['kind'] ?? '');
    if (in_array($kind, $kinds, true)) {
        $device = mb_substr(trim((string) preg_replace('/[\x00-\x1f\x7f]+/u', ' ', (string) ($_GET['device'] ?? ''))), 0, 40);
        $GLOBALS['LCNDA_LOG_DEVICE'] = $device;
        access_log_add(null, $kind, 'device', null, (string) ($_GET['label'] ?? ''), mb_substr((string) ($_GET['what'] ?? ''), 0, 40));
        unset($GLOBALS['LCNDA_LOG_DEVICE']);
    }
    header('Content-Type: application/json; charset=utf-8');
    echo '{"ok":true}';
    return true;
}
