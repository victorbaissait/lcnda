<?php
declare(strict_types=1);

/**
 * 🌐 Installation de la traduction hors ligne (lot D), lancée en arrière-plan par l'app (lib/telech_d_traduction.php) :
 *   php scripts/telech-d/argos_install.php <dossier traduction> <dossier app> <langue> <dossier htr> <essai 0|1>
 * 1. Python : celui que la lecture d'écriture (HTR) a installé (<dossier htr>/python, python-build-standalone, licence PSF),
 *    sinon le Python 3.9 à 3.12 de l'ordinateur. Pas de Python : on le dit (« installe d'abord la lecture d'écriture »).
 * 2. Argos Translate (MIT / CC0) dans <dossier traduction>/venv, par pip (PyPI) ; sous Linux, PyTorch « processeur » seul.
 * 3. Les modèles de la langue (ex. de → en, puis en → fr), depuis l'index officiel d'Argos Translate.
 * 4. Vérification (--check) : la liste des modèles installés et la licence écrite dans chacun → engine.json.
 * Avancement : status.json (state, step, pct) ; détail : install.log. Annulation : le fichier « cancel ».
 */

[$self, $dir, $appRoot, $lang, $htrDir, $sim] = array_pad($argv, 6, '');
if ($dir === '' || $appRoot === '' || $lang === '') { fwrite(STDERR, "Usage : php argos_install.php <dossier> <app> <langue> [htr] [essai]\n"); exit(2); }
@set_time_limit(0);
$win = DIRECTORY_SEPARATOR === '\\';
const PAIRS = ['de' => ['de-en', 'en-fr'], 'it' => ['it-en', 'en-fr'], 'es' => ['es-en', 'en-fr'], 'nl' => ['nl-en', 'en-fr'], 'pl' => ['pl-en', 'en-fr'], 'pt' => ['pt-en', 'en-fr'], 'en' => ['en-fr']];
if (!isset(PAIRS[$lang])) { fwrite(STDERR, "Langue inconnue\n"); exit(2); }
$prev = json_decode((string) @file_get_contents($dir . '/status.json'), true);
$id = is_array($prev) ? (string) ($prev['id'] ?? '') : '';
@unlink($dir . '/cancel');

function status(string $state, string $step, int $pct, array $extra = []): void
{
    global $dir, $id, $lang;
    $s = ['state' => $state, 'id' => $id, 'lang' => $lang, 'step' => $step, 'pct' => max(0, min(100, $pct)), 'updated' => time()] + $extra;
    @file_put_contents($dir . '/status.json.tmp', json_encode($s, JSON_UNESCAPED_UNICODE));
    @rename($dir . '/status.json.tmp', $dir . '/status.json');
    echo '[' . date('H:i:s') . "] {$step}" . ($pct ? " ({$pct} %)" : '') . "\n";
}
function fail(string $code, string $message): never { status('error', $message, 0, ['code' => $code]); exit(1); }
function cancelled(): void { global $dir; if (is_file($dir . '/cancel')) { @unlink($dir . '/cancel'); fail('cancelled', 'Installation annulée.'); } }
function run(array $cmd, array $env = []): array
{
    echo '$ ' . implode(' ', $cmd) . "\n";
    $p = @proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env ?: null);
    if (!is_resource($p)) { return [127, '']; }
    $out = '';
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $open = [$pipes[1], $pipes[2]];
    while ($open) {
        $r = $open; $w = $e = null;
        if (@stream_select($r, $w, $e, 5) === false) { break; }
        foreach ($r as $pipe) { $chunk = (string) fread($pipe, 8192); $out .= $chunk; echo $chunk; }
        $open = array_values(array_filter($open, static fn($x) => !feof($x)));
    }
    fclose($pipes[1]); fclose($pipes[2]);
    return [proc_close($p), $out];
}
function save_engine(array $patch): void
{
    global $dir;
    $e = json_decode((string) @file_get_contents($dir . '/engine.json'), true);
    $e = is_array($e) ? $e : [];
    $e = array_replace_recursive($e, $patch);
    @file_put_contents($dir . '/engine.json', json_encode($e, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

/* ── essai : tout est simulé ── */
if ($sim === '1') {
    foreach ([[10, 'Python…'], [40, 'Argos Translate…'], [80, 'Modèles…']] as [$p, $s]) { status('running', $s, $p); usleep(150_000); cancelled(); }
    $models = [];
    foreach (PAIRS[$lang] as $pair) { $models[$pair] = ['version' => '1.9', 'licence' => 'essai : licence lue dans le paquet']; }
    save_engine(['ok' => true, 'version' => '1.9.6', 'python' => 'essai', 'models' => $models, 'built' => [$lang => date('Y-m-d')]]);
    status('done', 'Prêt.', 100);
    exit(0);
}

/* ── 1. Python ── */
status('running', 'Recherche de Python…', 3);
$venv = $dir . '/venv';
$vpy = $win ? $venv . '/Scripts/python.exe' : $venv . '/bin/python3';
if (!is_file($vpy)) {
    $base = null;
    $cands = [];
    if ($htrDir !== '') { $cands[] = [$win ? $htrDir . '/python/python.exe' : $htrDir . '/python/bin/python3']; }
    $cands = array_merge($cands, $win ? [['py', '-3.11'], ['py', '-3.10'], ['py', '-3.12'], ['python']] : [['python3.11'], ['python3.10'], ['python3.12'], ['python3']]);
    foreach ($cands as $c) {
        [$code, $out] = run([...$c, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])']);
        if ($code === 0 && preg_match('/^3\.(9|10|11|12)\b/m', trim($out))) { $base = $c; break; }
    }
    if ($base === null) { fail('no_python', 'Pas de Python 3.9 à 3.12 sur cet ordinateur. Installe d’abord la lecture d’écriture (Réglages → ✍️ HTR) : elle apporte un Python tout prêt.'); }
    status('running', 'Préparation de l’environnement Python…', 8);
    [$code] = run([...$base, '-m', 'venv', $venv]);
    if ($code !== 0 || !is_file($vpy)) { fail('venv', 'Impossible de préparer l’environnement Python.'); }
}
cancelled();

/* ── 2. Argos Translate ── */
[$code, $out] = run([$vpy, '-c', 'import argostranslate, sys; print("ok")']);
if ($code !== 0) {
    status('running', 'Téléchargement d’Argos Translate (≈ 450 Mo, une seule fois)…', 12);
    run([$vpy, '-m', 'pip', 'install', '--upgrade', 'pip']);
    if (PHP_OS_FAMILY === 'Linux') { run([$vpy, '-m', 'pip', 'install', 'torch', '--index-url', 'https://download.pytorch.org/whl/cpu']); }
    cancelled();
    [$code] = run([$vpy, '-m', 'pip', 'install', 'argostranslate>=1.9,<2']);
    if ($code !== 0) { fail('pip', 'L’installation d’Argos Translate a échoué (voir install.log).'); }
}
cancelled();

/* ── 3. les modèles ── */
$env = ['ARGOS_PACKAGES_DIR' => $dir . '/packages', 'ARGOS_DEVICE_TYPE' => 'cpu', 'PATH' => (string) getenv('PATH'), 'HOME' => $dir, 'PYTHONIOENCODING' => 'utf-8'];
$script = $appRoot . '/scripts/telech-d/argos_translate.py';
[$code, $out] = run([$vpy, '-I', $script, '--check'], $env);
$have = [];
foreach ((json_decode(trim($out), true)['installed'] ?? []) as $m) { $have[$m['from'] . '-' . $m['to']] = true; }
$pairs = PAIRS[$lang]; $n = 0;
foreach ($pairs as $pair) {
    $n++;
    if (isset($have[$pair])) { continue; }
    [$f, $t] = explode('-', $pair);
    status('running', "Téléchargement du modèle {$f} → {$t} (≈ 100 Mo)…", 40 + (int) (50 * ($n - 1) / count($pairs)));
    [$code, $o] = run([$vpy, '-I', $script, '--install', $f, $t], $env);
    $j = json_decode(trim($o), true);
    if ($code !== 0 || empty($j['ok'])) { fail('model', (string) ($j['message'] ?? "Le modèle {$f} → {$t} n’a pas pu être installé (voir install.log).")); }
    cancelled();
}

/* ── 4. vérification ── */
status('running', 'Vérification…', 95);
[$code, $out] = run([$vpy, '-I', $script, '--check'], $env);
$j = json_decode(trim($out), true);
if ($code !== 0 || empty($j['ok'])) { fail('check', 'Argos Translate ne s’ouvre pas (voir install.log).'); }
$models = [];
foreach ($j['installed'] ?? [] as $m) { $models[$m['from'] . '-' . $m['to']] = ['version' => (string) $m['version'], 'licence' => (string) $m['licence']]; }
foreach ($pairs as $pair) { if (!isset($models[$pair])) { fail('check', "Le modèle {$pair} manque après l’installation."); } }
save_engine(['ok' => true, 'version' => (string) ($j['version'] ?? ''), 'python' => $vpy, 'models' => $models, 'built' => [$lang => date('Y-m-d')]]);
status('done', 'Prêt.', 100);
