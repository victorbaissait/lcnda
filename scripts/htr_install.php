<?php
declare(strict_types=1);

/**
 * Installation de la reconnaissance d'écriture (HTR), lancée en arrière-plan par l'application
 * (Réglages → Reconnaissance d'écriture → Installer) :
 *   php scripts/htr_install.php <dossier htr> <dossier de l'application> [models]
 *
 * 1. trouve Python 3 (3.10 ou 3.11 de préférence), crée l'environnement <dossier htr>/venv et y installe Kraken ;
 * 2. télécharge les modèles du catalogue (config/htr-models.json : « url » directe, sinon « doi » avec « kraken get »)
 *    dans <dossier htr>/models.
 * L'avancement est écrit dans <dossier htr>/status.json (lu par l'écran), le détail dans install.log.
 */

[$self, $htrDir, $appRoot, $only] = array_pad($argv, 4, '');
if ($htrDir === '' || $appRoot === '') { fwrite(STDERR, "Usage : php htr_install.php <dossier htr> <dossier app> [models]\n"); exit(2); }
@set_time_limit(0);
$win = DIRECTORY_SEPARATOR === '\\';

function status(string $state, string $step, array $extra = []): void
{
    global $htrDir;
    file_put_contents($htrDir . '/status.json', json_encode(['state' => $state, 'step' => $step, 'updated' => time()] + $extra, JSON_UNESCAPED_UNICODE));
    echo '[' . date('H:i:s') . "] {$step}\n";
}

function run(array $cmd, ?string &$out = null): int
{
    echo '$ ' . implode(' ', $cmd) . "\n";
    $p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($p)) { return 127; }
    $out = '';
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $open = [$pipes[1], $pipes[2]];
    while ($open) { // on ne surveille plus un tuyau fermé (sinon la boucle tourne à vide)
        $r = $open; $w = $e = null;
        if (@stream_select($r, $w, $e, 5) === false) { break; }
        foreach ($r as $pipe) { $chunk = (string) fread($pipe, 8192); $out .= $chunk; echo $chunk; }
        $open = array_values(array_filter($open, static fn($p) => !feof($p)));
    }
    fclose($pipes[1]); fclose($pipes[2]);
    return proc_close($p);
}

function fail(string $message): never { status('error', $message); exit(1); }
// Toute erreur imprévue termine l'installation proprement (sinon l'écran reste « en cours » deux heures)
set_exception_handler(static function (Throwable $e): void { status('error', 'Installation interrompue : ' . $e->getMessage()); exit(1); });

$venv = $htrDir . '/venv';
$venvPython = $win ? $venv . '/Scripts/python.exe' : $venv . '/bin/python3';
$kraken = $win ? $venv . '/Scripts/kraken.exe' : $venv . '/bin/kraken';

if ($only !== 'models') {
    // 1. Python 3 (Kraken fonctionne avec Python 3.9 à 3.12 ; 3.10 ou 3.11 conseillés)
    status('running', 'Recherche de Python 3…');
    $candidates = $win ? [['py', '-3.11'], ['py', '-3.10'], ['py', '-3.12'], ['py', '-3'], ['python']] : [['python3.11'], ['python3.10'], ['python3.12'], ['/opt/homebrew/bin/python3.11'], ['/usr/local/bin/python3.11'], ['python3'], ['/usr/bin/python3']];
    $python = null;
    foreach ($candidates as $c) {
        $v = '';
        if (run([...$c, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], $v) === 0 && preg_match('/^3\.(9|10|11|12)\b/m', trim($v))) { $python = $c; break; }
    }
    if (!$python) {
        fail('Python 3.10 ou 3.11 introuvable sur cet ordinateur. Installe-le depuis python.org (une seule fois), puis clique de nouveau sur « Installer ».');
    }
    if (!is_file($venvPython)) {
        status('running', 'Création de l’environnement Python…');
        if (run([...$python, '-m', 'venv', $venv]) !== 0) { fail('Impossible de créer l’environnement Python (voir le journal).'); }
    }
    status('running', 'Installation de Kraken (plusieurs minutes, environ 1 Go)…');
    run([$venvPython, '-m', 'pip', 'install', '--upgrade', 'pip']);
    if (run([$venvPython, '-m', 'pip', 'install', 'kraken']) !== 0 || !is_file($kraken)) { fail('L’installation de Kraken a échoué (voir le journal).'); }
}

// 2. Modèles
status('running', 'Téléchargement des modèles…');
@mkdir($htrDir . '/models', 0775, true);
$catalog = json_decode((string) @file_get_contents($appRoot . '/config/htr-models.json'), true) ?: [];
$done = []; $missing = [];
foreach ($catalog as $m) {
    $name = basename((string) ($m['model'] ?? ''));
    if ($name === '' || isset($done[$name])) { continue; }
    $done[$name] = true;
    $dest = $htrDir . '/models/' . $name;
    if ((is_file($dest) && filesize($dest) > 1000) || (is_file($appRoot . '/' . $m['model']) && filesize($appRoot . '/' . $m['model']) > 1000)) { continue; }
    $ok = false;
    if (!empty($m['url'])) {
        status('running', "Téléchargement du modèle {$name}…");
        $in = @fopen((string) $m['url'], 'rb'); $out = $in ? fopen($dest . '.part', 'wb') : false;
        if ($in && $out) { stream_copy_to_stream($in, $out); fclose($in); fclose($out); $ok = filesize($dest . '.part') > 1000 && rename($dest . '.part', $dest); }
        @unlink($dest . '.part');
    } elseif (!empty($m['doi']) && is_file($kraken)) {
        status('running', "Téléchargement du modèle {$name} (dépôt de modèles Kraken)…");
        $out = '';
        $started = time();
        if (run([$kraken, 'get', (string) $m['doi']], $out) === 0) {
            $found = null;
            if (preg_match_all('/(\S+\.mlmodel)/', $out, $mm)) { foreach (array_reverse($mm[1]) as $p) { if (is_file($p)) { $found = $p; break; } } }
            if (!$found) { // sinon : le plus récent dans les dossiers où Kraken range ses modèles
                $home = getenv('HOME') ?: getenv('USERPROFILE') ?: '';
                foreach ([$home . '/.local/share/htrmopo', $home . '/.config/kraken', $home . '/Library/Application Support/htrmopo', getenv('APPDATA') . '/htrmopo'] as $dir) {
                    if (!is_dir($dir) || !is_readable($dir)) { continue; }
                    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::LEAVES_ONLY, RecursiveIteratorIterator::CATCH_GET_CHILD) as $f) {
                        if (str_ends_with((string) $f, '.mlmodel') && $f->getMTime() >= $started - 5 && (!$found || $f->getMTime() > filemtime($found))) { $found = (string) $f; }
                    }
                }
            }
            if ($found) { $ok = copy($found, $dest); }
        }
    }
    if (!$ok) { $missing[] = $name; }
}
if ($missing) {
    status('done', 'Installation terminée. Modèles à ajouter à la main : ' . implode(', ', $missing) . ' (bouton « Choisir le fichier » de chaque modèle).', ['missing' => $missing]);
} else {
    status('done', 'Installation terminée : la reconnaissance d’écriture est prête.');
}
