<?php
declare(strict_types=1);
/**
 * 🧪 Essais seulement (tests/test-audit-options.js) : la route d'écriture POST api.php?action=onglets_write de l'onglet
 * 📄 Documents (lib/onglets.php : onglets_api_post), tant qu'elle n'est pas branchée dans api.php (handle_write).
 * Mêmes gardes que api.php : jeton CSRF, mode consultation (kiosk_guard), une transaction. Le reste : le routeur de l'app.
 */
$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
if (preg_match('~/api\.php$~', $path) && ($_GET['action'] ?? '') === 'onglets_write' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    chdir(dirname(__DIR__));
    require_once dirname(__DIR__) . '/lib/bootstrap.php';
    require_once dirname(__DIR__) . '/lib/onglets.php';
    $pdo = db();
    $data = request_json();
    verify_csrf($data);
    kiosk_guard('onglets_write', true);
    try { $pdo->beginTransaction(); $r = onglets_api_post($pdo, $data); $pdo->commit(); json_response(['ok' => true, 'result' => $r]); }
    catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } json_response(['error' => $e->getMessage()], 422); }
}
return require dirname(__DIR__) . '/router.php';
