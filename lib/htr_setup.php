<?php
declare(strict_types=1);

/**
 * ✍️ Reconnaissance d'écriture manuscrite (HTR) : installation en un clic (Maintenance → Reconnaissance d'écriture).
 *
 * Kraken (Python) et ses modèles pèsent plus d'1 Go : ils ne sont pas livrés avec l'application mais installés une
 * fois dans le dossier des données (DATA_DIR/htr), qui est accessible en écriture (le dossier de l'application ne
 * l'est pas une fois installée). Ce qui existait déjà dans le dossier de l'application (.venv-htr, models/htr) reste
 * utilisé.
 *   DATA_DIR/htr/venv/      environnement Python avec Kraken
 *   DATA_DIR/htr/models/    modèles .mlmodel
 *   DATA_DIR/htr/status.json, install.log   avancement de l'installation (scripts/htr_install.php)
 */

function htr_dir(): string
{
    $d = SHARED_DATA_DIR . '/htr'; // commun à toutes les généalogies
    if (!is_dir($d)) { @mkdir($d . '/models', 0775, true); }
    if (!is_dir($d . '/models')) { @mkdir($d . '/models', 0775, true); }
    return $d;
}

function htr_is_windows(): bool { return DIRECTORY_SEPARATOR === '\\'; }

/** Python de l'environnement installé (données, sinon l'ancien .venv-htr de l'application). */
function htr_venv_python(): ?string
{
    $candidates = htr_is_windows()
        ? [htr_dir() . '/venv/Scripts/python.exe', APP_ROOT . '/.venv-htr/Scripts/python.exe']
        : [htr_dir() . '/venv/bin/python3', APP_ROOT . '/.venv-htr/bin/python3'];
    foreach ($candidates as $c) { if (is_file($c)) { return $c; } }
    return null;
}

function htr_kraken_installed(): bool
{
    $py = htr_venv_python();
    if (!$py) { return false; }
    $bin = dirname($py) . (htr_is_windows() ? '/kraken.exe' : '/kraken');
    return is_file($bin);
}

/** Fichier d'un modèle : d'abord dans les données, puis dans l'application. */
function htr_model_file(array $model): ?string
{
    $name = basename((string) ($model['model'] ?? ''));
    if ($name === '') { return null; }
    foreach ([htr_dir() . '/models/' . $name, APP_ROOT . '/' . (string) $model['model']] as $p) {
        if (is_file($p) && filesize($p) > 1000) { return realpath($p) ?: $p; }
    }
    return null;
}

function htr_install_status(): array
{
    $s = @json_decode((string) @file_get_contents(htr_dir() . '/status.json'), true);
    return is_array($s) ? $s : ['state' => 'idle'];
}

/** État pour l'écran : Python, Kraken, modèles présents, installation en cours. */
function htr_setup_status(): array
{
    $models = [];
    foreach (htr_model_catalog() as $m) {
        $name = basename((string) $m['model']);
        $models[$name] ??= ['file' => $name, 'labels' => [], 'present' => false, 'size' => 0, 'doi' => (string) ($m['doi'] ?? ''), 'url' => (string) ($m['url'] ?? '')];
        $models[$name]['labels'][] = (string) ($m['label'] ?? $m['id']);
        $p = htr_model_file($m);
        if ($p) { $models[$name]['present'] = true; $models[$name]['size'] = (int) filesize($p); }
        if (!$models[$name]['doi'] && !empty($m['doi'])) { $models[$name]['doi'] = (string) $m['doi']; }
    }
    $status = htr_install_status();
    // Installation interrompue (application fermée) : plus « en cours » au bout de 2 heures sans nouvelles
    if (($status['state'] ?? '') === 'running' && time() - (int) ($status['updated'] ?? 0) > 7200) { $status['state'] = 'interrupted'; }
    $log = @file_get_contents(htr_dir() . '/install.log') ?: '';
    return [
        'kraken' => htr_kraken_installed(), 'python' => htr_venv_python(),
        'models' => array_values($models), 'ready' => htr_kraken_installed() && array_filter($models, static fn($m) => $m['present']),
        'install' => $status, 'log' => mb_substr($log, -6000), 'windows' => htr_is_windows(), 'dir' => htr_dir(),
    ];
}

/** Lance l'installation en arrière-plan (scripts/htr_install.php) : environnement Python, Kraken, modèles. */
function htr_install_start(array $data): array
{
    $status = htr_install_status();
    if (($status['state'] ?? '') === 'running' && time() - (int) ($status['updated'] ?? 0) < 7200) { return ['started' => false, 'already' => true]; }
    $script = APP_ROOT . '/scripts/htr_install.php';
    if (!is_file($script)) { throw new RuntimeException('Programme d’installation introuvable (scripts/htr_install.php).'); }
    $php = PHP_BINARY ?: 'php';
    @file_put_contents(htr_dir() . '/status.json', json_encode(['state' => 'running', 'step' => 'Démarrage…', 'updated' => time()]));
    @file_put_contents(htr_dir() . '/install.log', '[' . date('H:i:s') . "] Installation demandée\n");
    $only = safe_text($data['only'] ?? ''); // « models » : seulement les modèles
    $args = [$php, $script, htr_dir(), APP_ROOT, $only];
    if (htr_is_windows()) {
        $cmd = 'start "" /B ' . implode(' ', array_map('escapeshellarg', $args)) . ' >> ' . escapeshellarg(htr_dir() . '/install.log') . ' 2>&1';
        pclose(popen('cmd /C "' . $cmd . '"', 'r'));
    } else {
        exec('nohup ' . implode(' ', array_map('escapeshellarg', $args)) . ' >> ' . escapeshellarg(htr_dir() . '/install.log') . ' 2>&1 &');
    }
    return ['started' => true];
}

/** Modèle ajouté à la main (fichier .mlmodel téléchargé par l'utilisateur). */
function htr_upload_model(?array $file, string $target): never
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { json_response(['error' => 'Fichier non reçu.'], 422); }
    $name = basename($target !== '' ? $target : (string) $file['name']);
    if (!preg_match('/^[A-Za-z0-9._-]+\.mlmodel$/', $name)) { json_response(['error' => 'Il faut un fichier de modèle Kraken (.mlmodel).'], 422); }
    if ((int) $file['size'] < 1000) { json_response(['error' => 'Ce fichier est trop petit pour être un modèle.'], 422); }
    $dest = htr_dir() . '/models/' . $name;
    if (!@move_uploaded_file((string) $file['tmp_name'], $dest) && !@copy((string) $file['tmp_name'], $dest)) { json_response(['error' => 'Impossible de ranger le modèle.'], 500); }
    json_response(['ok' => true, 'file' => $name, 'size' => (int) filesize($dest)]);
}
