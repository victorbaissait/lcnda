<?php
declare(strict_types=1);

/**
 * Réglages de l'interface rangés dans la base (table app_settings, structure n°4) : ordre des menus, apparence,
 * tableau de bord, archives enregistrées, liens externes… (clés « genealogie-* » que l'interface garde aussi dans
 * le navigateur). Ils suivent ainsi la sauvegarde complète et un autre ordinateur.
 * index.php les injecte dans la page (window.LCNDA_SETTINGS) ; le début d'assets/js/app.js les applique et renvoie
 * chaque changement par api.php?action=save_settings.
 */

// Propres à cet ordinateur : jamais rangés dans la base (verrou d'une sauvegarde en cours, état de navigation).
const APP_SETTINGS_LOCAL_ONLY = ['genealogie-auto-backup-lock', 'genealogie-baissait-ui-v2', 'genealogie-last-route'];

/** Réglages de l'interface : seulement des clés « genealogie-… », valeur texte (JSON) de 2 Mo au plus. */
function app_setting_key_allowed(string $key): bool
{
    return (bool) preg_match('/^genealogie-[a-z0-9-]{1,80}$/', $key) && !in_array($key, APP_SETTINGS_LOCAL_ONLY, true);
}

function save_app_settings(PDO $pdo, array $data): never
{
    $set = is_array($data['set'] ?? null) ? $data['set'] : [];
    $remove = is_array($data['remove'] ?? null) ? $data['remove'] : [];
    $upsert = $pdo->prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP');
    $delete = $pdo->prepare('DELETE FROM app_settings WHERE key=?');
    $saved = 0;
    $pdo->beginTransaction();
    foreach ($set as $key => $value) {
        $key = (string) $key;
        if (!app_setting_key_allowed($key) || !is_string($value) || strlen($value) > 2 * 1024 * 1024) { continue; }
        $upsert->execute([$key, $value]);
        $saved++;
    }
    foreach ($remove as $key) {
        if (is_string($key) && app_setting_key_allowed($key)) { $delete->execute([$key]); $saved++; }
    }
    $pdo->commit();
    json_response(['ok' => true, 'saved' => $saved]);
}

/** Pour index.php : les réglages de la base, injectés dans la page avant le démarrage de l'interface. */
function app_settings_for_page(): ?array
{
    try {
        $out = [];
        foreach (db()->query('SELECT key, value FROM app_settings') as $row) {
            if (app_setting_key_allowed((string) $row['key'])) { $out[(string) $row['key']] = (string) $row['value']; }
        }
        return $out;
    } catch (Throwable) {
        return null;
    }
}
