<?php
declare(strict_types=1);

/**
 * Installation de la lecture d'écriture manuscrite (HTR), lancée en arrière-plan par l'application
 * (Réglages → Reconnaissance d'écriture (HTR) → assistant en 3 étapes) :
 *   php scripts/htr_install.php <dossier htr> <dossier de l'application> [quoi] [python] [échec simulé]
 *     quoi   : ''  (moteur, puis le modèle conseillé s'il n'y en a aucun, puis vérification)
 *              'engine' · 'models' (tous les modèles téléchargeables qui manquent) · 'model:<fichier>' · 'check'
 *     python : 'auto' (défaut : le Python tout prêt, sinon celui de l'ordinateur) · 'embedded' · 'system'
 *
 * 1. Python : par défaut, un Python 3.11 tout prêt (python-build-standalone, licence PSF), téléchargé une fois depuis
 *    GitHub et rangé dans <dossier htr>/python — rien à installer soi-même. Sinon le Python 3.9 à 3.12 de l'ordinateur.
 * 2. Kraken (Apache 2.0) dans <dossier htr>/venv, par pip (PyPI ; sous Linux, PyTorch en version « processeur » seule).
 * 3. Modèles : depuis leur dépôt officiel Zenodo seulement ; licence lue à la source, empreinte (MD5 de Zenodo, ou
 *    SHA-256 écrite dans config/htr-model-files.json) vérifiée avant de garder le fichier.
 * 4. Vérification : Kraken s'ouvre et lit le modèle (scripts/htr_recognize.py --check).
 * Avancement : <dossier htr>/status.json (state, step, pct, phase, code) ; détail : install.log.
 * GENEALOGY_HTR_SIMULATE=1 (tests) : tout est simulé, rien n'est téléchargé.
 */

[$self, $htrDir, $appRoot, $only, $pyMode, $simFail] = array_pad($argv, 6, '');
if ($htrDir === '' || $appRoot === '') { fwrite(STDERR, "Usage : php htr_install.php <dossier htr> <dossier app> [quoi] [python]\n"); exit(2); }
require $appRoot . '/lib/htr_net.php';
@set_time_limit(0);
$win = DIRECTORY_SEPARATOR === '\\';
$simulate = (string) getenv('GENEALOGY_HTR_SIMULATE');
$simulate = $simulate !== '' && $simulate !== '0';
$pyMode = in_array($pyMode, ['embedded', 'system'], true) ? $pyMode : 'auto';
$phase = 'engine';

function status(string $state, string $step, int $pct, array $extra = []): void
{
    global $htrDir, $phase;
    $s = ['state' => $state, 'step' => $step, 'pct' => max(0, min(100, $pct)), 'phase' => $phase, 'updated' => time()] + $extra;
    @file_put_contents($htrDir . '/status.json.tmp', json_encode($s, JSON_UNESCAPED_UNICODE));
    @rename($htrDir . '/status.json.tmp', $htrDir . '/status.json');
    echo '[' . date('H:i:s') . "] {$step}" . ($pct ? " ({$pct} %)" : '') . "\n";
}
function fail(string $code, string $message): never { status('error', $message, 0, ['code' => $code]); exit(1); }
set_exception_handler(static function (Throwable $e): void {
    $code = match ((int) $e->getCode()) { 503, 502, 508 => 'no_network', 403 => 'source', 413 => 'source', default => 'other' };
    status('error', 'Installation interrompue : ' . $e->getMessage(), 0, ['code' => $code]); exit(1);
});
function run(array $cmd, ?string &$out = null, ?callable $onLine = null): int
{
    echo '$ ' . implode(' ', $cmd) . "\n";
    $p = @proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($p)) { return 127; }
    $out = '';
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $open = [$pipes[1], $pipes[2]];
    while ($open) {
        $r = $open; $w = $e = null;
        if (@stream_select($r, $w, $e, 5) === false) { break; }
        foreach ($r as $pipe) { $chunk = (string) fread($pipe, 8192); $out .= $chunk; echo $chunk; if ($onLine && $chunk !== '') { $onLine($chunk); } }
        $open = array_values(array_filter($open, static fn($p) => !feof($p)));
    }
    fclose($pipes[1]); fclose($pipes[2]);
    return proc_close($p);
}
function sim(string $step, int $pct): void { status('running', $step, $pct); usleep(120000); }
function engine_info(): array { global $htrDir; $j = @json_decode((string) @file_get_contents($htrDir . '/engine.json'), true); return is_array($j) ? $j : []; }
function engine_save(array $patch): void { global $htrDir; @file_put_contents($htrDir . '/engine.json', json_encode($patch + engine_info(), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); }
function manifest(): array { global $htrDir; $j = @json_decode((string) @file_get_contents($htrDir . '/models/manifest.json'), true); return is_array($j) ? $j : []; }
function manifest_save(string $file, array $row): void { global $htrDir; $m = manifest(); $m[$file] = $row; @file_put_contents($htrDir . '/models/manifest.json', json_encode($m, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); }

@mkdir($htrDir . '/models', 0775, true);
$venv = $htrDir . '/venv';
$venvPython = $win ? $venv . '/Scripts/python.exe' : $venv . '/bin/python3';
$kraken = $win ? $venv . '/Scripts/kraken.exe' : $venv . '/bin/kraken';
$files = json_decode((string) @file_get_contents($appRoot . '/config/htr-model-files.json'), true) ?: [];

// Place sur le disque : environ 2 Go pour le moteur (PyTorch compris), 100 Mo pour un modèle
$needMb = in_array($only, ['', 'engine'], true) && !is_file($kraken) ? 2000 : 150;
$free = @disk_free_space($htrDir);
if ($only !== 'check' && $free !== false && $free < $needMb * 1024 * 1024 && !$simulate) {
    fail('disk', sprintf('Il manque de la place sur le disque : il faut environ %s libres, il en reste %s.', $needMb >= 1000 ? round($needMb / 1000, 1) . ' Go' : $needMb . ' Mo', round($free / 1e9, 1) . ' Go'));
}

/* ─── 1. Python et Kraken ─── */
function install_embedded_python(string $htrDir, bool $win): ?array
{
    $triple = htr_python_triple();
    if (!$triple) { echo "Pas de Python tout prêt pour cet ordinateur (" . PHP_OS_FAMILY . ' ' . php_uname('m') . ")\n"; return null; }
    $pyDir = $htrDir . '/python';
    $bin = $win ? $pyDir . '/python.exe' : $pyDir . '/bin/python3';
    if (is_file($bin)) { return [$bin]; }
    status('running', 'Recherche du Python tout prêt (python-build-standalone)…', 4);
    $tag = '20241016'; // version fixée : Python 3.11.10
    $rel = htr_http_get('https://api.github.com/repos/astral-sh/python-build-standalone/releases/tags/' . $tag, null, ['max_bytes' => 8 * 1024 * 1024, 'accept' => 'application/vnd.github+json']);
    $assets = (array) (json_decode($rel['body'], true)['assets'] ?? []);
    $asset = htr_python_asset($assets, $triple);
    if (!$asset) { echo "Aucun fichier pour {$triple}\n"; return null; }
    // l'empreinte publiée par la source : champ « digest » de GitHub, sinon le fichier SHA256SUMS de la même version
    $expected = (string) ($asset['digest'] ?? '');
    if (!preg_match('/^sha256:[a-f0-9]{64}$/', $expected)) {
        foreach ($assets as $a) {
            if (($a['name'] ?? '') === 'SHA256SUMS' && !empty($a['browser_download_url'])) {
                $sums = htr_http_get((string) $a['browser_download_url'], null, ['max_bytes' => 4 * 1024 * 1024])['body'];
                if (preg_match('/^([a-f0-9]{64})\s+\*?' . preg_quote((string) $asset['name'], '/') . '$/m', $sums, $m)) { $expected = 'sha256:' . $m[1]; }
            }
        }
    }
    if ($expected === '') { throw new RuntimeException('Le Python tout prêt n’a pas d’empreinte publiée : il n’est pas installé.', 403); }
    $part = $htrDir . '/python-dl.tar.gz';
    $got = htr_http_get((string) $asset['browser_download_url'], $part, ['max_bytes' => 200 * 1024 * 1024,
        'progress' => static fn($d, $t) => status('running', sprintf('Téléchargement du Python tout prêt : %d Mo%s…', $d / 1e6, $t ? ' sur ' . round($t / 1e6) : ''), 5 + ($t ? (int) (15 * $d / $t) : 5))]);
    if (!htr_hash_matches($got, $expected)) { @unlink($part); fail('checksum', 'Le Python téléchargé ne correspond pas à son empreinte officielle : il a été jeté. Réessaie plus tard.'); }
    status('running', 'Python vérifié ✓ — décompression…', 21);
    $tmp = $htrDir . '/python.tmp';
    if (is_dir($tmp)) { htr_rmtree($tmp, $htrDir); }
    @mkdir($tmp, 0775, true);
    $ok = false;
    try { $tar = new PharData($part); $tar->extractTo($tmp, null, true); $ok = true; } catch (Throwable $e) { echo 'PharData : ' . $e->getMessage() . "\n"; }
    if (!$ok) { $ok = run(['tar', '-xzf', $part, '-C', $tmp]) === 0; }
    @unlink($part);
    if (!$ok || !is_dir($tmp . '/python')) { htr_rmtree($tmp, $htrDir); throw new RuntimeException('Décompression du Python tout prêt impossible.'); }
    if (is_dir($pyDir)) { htr_rmtree($pyDir, $htrDir); }
    rename($tmp . '/python', $pyDir); htr_rmtree($tmp, $htrDir);
    if (!$win) { @chmod($bin, 0755); foreach (glob($pyDir . '/bin/*') ?: [] as $f) { @chmod($f, 0755); } }
    return is_file($bin) ? [$bin] : null;
}
function find_system_python(bool $win): ?array
{
    status('running', 'Recherche du Python de l’ordinateur…', 4);
    $candidates = $win ? [['py', '-3.11'], ['py', '-3.10'], ['py', '-3.12'], ['py', '-3'], ['python']] : [['python3.11'], ['python3.10'], ['python3.12'], ['/opt/homebrew/bin/python3.11'], ['/usr/local/bin/python3.11'], ['python3'], ['/usr/bin/python3']];
    foreach ($candidates as $c) {
        $v = '';
        if (run([...$c, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], $v) === 0 && preg_match('/^3\.(9|10|11|12)\b/m', trim($v))) { return $c; }
    }
    return null;
}

if (in_array($only, ['', 'engine'], true)) {
    $phase = 'engine';
    if ($simulate) {
        if ($simFail === 'no_python') { sim('Recherche de Python…', 4); fail('no_python', 'Pas de Python utilisable sur cet ordinateur, et le Python tout prêt n’a pas pu être téléchargé.'); }
        if ($simFail === 'no_network') { sim('Recherche du Python tout prêt…', 4); fail('no_network', 'Pas de réponse de github.com : vérifie la connexion à Internet.'); }
        foreach ([['Téléchargement du Python tout prêt : 12 Mo sur 30…', 10], ['Python vérifié ✓ — décompression…', 21], ['Création de l’environnement…', 24], ['Installation de Kraken : torch…', 50], ['Installation de Kraken : kraken…', 72]] as [$s, $p]) { sim($s, $p); }
        @mkdir(dirname($venvPython), 0775, true);
        file_put_contents($venvPython, "#!simulé\n"); file_put_contents($kraken, "#!simulé\n");
        engine_save(['python' => 'embedded', 'python_version' => '3.11.10', 'kraken_version' => '5.2.9 (simulé)', 'installed_at' => date('c')]);
    } elseif (!is_file($kraken)) {
        $python = null; $source = '';
        if ($pyMode !== 'system') {
            try { $python = install_embedded_python($htrDir, $win); $source = 'embedded'; }
            catch (Throwable $e) { echo 'Python tout prêt : ' . $e->getMessage() . "\n"; if ($pyMode === 'embedded') { throw $e; } }
        }
        if (!$python && $pyMode !== 'embedded') { $python = find_system_python($win); $source = 'system'; }
        if (!$python) { fail('no_python', 'Pas de Python utilisable : le Python tout prêt n’a pas pu être téléchargé, et aucun Python 3.9 à 3.12 n’est installé sur cet ordinateur.'); }
        if (!is_file($venvPython)) {
            status('running', 'Création de l’environnement…', 23);
            if (run([...$python, '-m', 'venv', $venv]) !== 0) { fail('venv', 'Impossible de créer l’environnement Python (voir le journal).'); }
        }
        status('running', 'Installation de Kraken (plusieurs minutes, environ 1 Go)…', 25);
        run([$venvPython, '-m', 'pip', 'install', '--upgrade', 'pip']);
        $pkgs = 0;
        $pip = [$venvPython, '-m', 'pip', 'install', 'kraken'];
        if (PHP_OS_FAMILY === 'Linux') { array_push($pip, '--extra-index-url', 'https://download.pytorch.org/whl/cpu'); } // PyTorch sans les 2 Go de pilotes graphiques
        $code = run($pip, $o, static function (string $chunk) use (&$pkgs) {
            if (preg_match_all('/^(Collecting|Downloading|Installing collected) (\S+)/m', $chunk, $m)) {
                $pkgs += count($m[0]);
                status('running', 'Installation de Kraken : ' . end($m[2]) . '…', 25 + (int) (50 * (1 - exp(-$pkgs / 40))));
            }
        });
        if ($code !== 0 || !is_file($kraken)) { fail('pip', 'L’installation de Kraken a échoué (le journal dit pourquoi).'); }
        $v = ''; run([$venvPython, '-c', 'import importlib.metadata as m, sys; print(m.version("kraken"), "%d.%d.%d" % sys.version_info[:3])'], $v);
        [$kv, $pv] = array_pad(preg_split('/\s+/', trim((string) $v)), 2, '');
        engine_save(['python' => $source, 'python_version' => $pv, 'kraken_version' => $kv, 'installed_at' => date('c')]);
    }
}

/* ─── 2. Modèles : Zenodo seulement, licence lue à la source, empreinte vérifiée ─── */
function download_model(array $f, string $htrDir, int $p0, int $p1): void
{
    global $simulate;
    $name = (string) ($f['file'] ?? '');
    if (!htr_model_name_ok($name) || ($f['source'] ?? '') !== 'zenodo' || !preg_match('/^\d{1,12}$/', (string) ($f['record'] ?? ''))) { throw new RuntimeException("Modèle {$name} : pas de source officielle prévue."); }
    $dest = $htrDir . '/models/' . $name;
    if (!htr_inside($htrDir . '/models', $dest)) { throw new RuntimeException('Chemin de modèle refusé.'); }
    if ($simulate) {
        foreach ([[30, 'Lecture de la fiche du modèle sur zenodo.org…'], [70, 'Téléchargement…'], [100, 'Empreinte vérifiée ✓']] as [$q, $s]) { sim("{$f['title']} : {$s}", $p0 + (int) (($p1 - $p0) * $q / 100)); }
        $bin = str_repeat("modèle simulé {$name}\n", 200);
        file_put_contents($dest, $bin);
        manifest_save($name, ['sha256' => hash('sha256', $bin), 'checked' => 'md5 (Zenodo)', 'license' => (string) ($f['license'] ?? ''), 'record' => $f['record'], 'bytes' => strlen($bin), 'at' => date('c')]);
        return;
    }
    status('running', "{$f['title']} : lecture de la fiche du modèle sur zenodo.org…", $p0);
    $rec = json_decode(htr_http_get('https://zenodo.org/api/records/' . $f['record'], null, ['max_bytes' => 8 * 1024 * 1024, 'accept' => 'application/json'])['body'], true);
    if (!is_array($rec)) { throw new RuntimeException('Fiche du modèle illisible.', 502); }
    $license = strtolower((string) ($rec['metadata']['license']['id'] ?? ($rec['metadata']['license'] ?? '')));
    if ($license === '' || !in_array($license, HTR_FREE_LICENSES, true)) {
        fail('license', "Le modèle « {$f['title']} » n’a pas de licence libre connue à sa source ({$license}) : il n’est pas installé.");
    }
    $file = null;
    foreach ((array) ($rec['files'] ?? []) as $zf) {
        if (preg_match('/\.mlmodel$/i', (string) ($zf['key'] ?? '')) && (!$file || (int) ($zf['size'] ?? 0) > (int) ($file['size'] ?? 0))) { $file = $zf; }
    }
    if (!$file) { throw new RuntimeException("Pas de fichier .mlmodel dans la fiche Zenodo du modèle « {$f['title']} »."); }
    $expected = !empty($f['sha256']) ? 'sha256:' . $f['sha256'] : (string) ($file['checksum'] ?? '');
    if (!preg_match('/^(md5:[a-f0-9]{32}|sha256:[a-f0-9]{64})$/', $expected)) { fail('checksum', 'Ce modèle n’a pas d’empreinte publiée : il n’est pas installé.'); }
    $url = (string) ($file['links']['self'] ?? ('https://zenodo.org/api/records/' . $f['record'] . '/files/' . rawurlencode((string) $file['key']) . '/content'));
    $part = $dest . '.part';
    $got = htr_http_get($url, $part, ['max_bytes' => 600 * 1024 * 1024,
        'progress' => static fn($d, $t) => status('running', sprintf('%s : %d Mo%s…', $f['title'], $d / 1e6, $t ? ' sur ' . max(1, round($t / 1e6)) : ''), $p0 + ($t ? (int) (($p1 - $p0) * $d / $t) : 2))]);
    if (!htr_hash_matches($got, $expected)) { @unlink($part); fail('checksum', "Le modèle « {$f['title']} » téléchargé ne correspond pas à son empreinte officielle : il a été jeté (fichier abîmé ou modifié en route). Réessaie plus tard."); }
    if ($got['bytes'] < 1000) { @unlink($part); throw new RuntimeException('Fichier de modèle vide.'); }
    rename($part, $dest);
    manifest_save($name, ['sha256' => $got['sha256'], 'checked' => str_starts_with($expected, 'md5:') ? 'md5 (Zenodo)' : 'sha256', 'license' => $license, 'record' => $f['record'], 'bytes' => $got['bytes'], 'at' => date('c')]);
    status('running', "{$f['title']} : empreinte vérifiée ✓", $p1);
}
$present = static fn(array $f): bool => htr_model_name_ok((string) $f['file']) && is_file($htrDir . '/models/' . $f['file']) && filesize($htrDir . '/models/' . $f['file']) > 1000;
$toGet = [];
if (str_starts_with($only, 'model:')) {
    $want = substr($only, 6);
    foreach ($files as $f) { if (($f['file'] ?? '') === $want) { $toGet[] = $f; } }
    if (!$toGet) { fail('other', 'Modèle inconnu.'); }
} elseif ($only === 'models') {
    $toGet = array_values(array_filter($files, static fn($f) => ($f['source'] ?? '') === 'zenodo' && !$present($f)));
} elseif ($only === '') {
    $any = array_filter($files, $present);
    if (!$any) { $toGet = array_values(array_filter($files, static fn($f) => !empty($f['recommended']) && ($f['source'] ?? '') === 'zenodo')); }
}
if ($toGet) {
    $phase = 'model';
    $span = (int) floor(15 / count($toGet)); $p = 78;
    foreach ($toGet as $f) { download_model($f, $htrDir, $p, $p + $span); $p += $span; }
}

/* ─── 3. Vérification : Kraken s'ouvre et lit un modèle ─── */
$phase = 'check';
status('running', 'Vérification : Kraken lit le modèle…', 95);
$model = null;
foreach ($files as $f) { if ($present($f)) { $model = $htrDir . '/models/' . $f['file']; break; } }
if (!$model) { foreach (glob($htrDir . '/models/*.mlmodel') ?: [] as $g) { if (filesize($g) > 1000) { $model = $g; break; } } }
if (!is_file($kraken)) { status('done', 'Le moteur de lecture n’est pas encore installé.', 100, ['ready' => false]); exit(0); }
if (!$model) { status('done', 'Le moteur est installé ; il reste à choisir un modèle d’écriture.', 100, ['ready' => false]); exit(0); }
if ($simulate) {
    sim('Vérification : Kraken lit le modèle…', 97);
    engine_save(['verified' => ['ok' => true, 'at' => date('c'), 'model' => basename($model), 'kraken' => '5.2.9 (simulé)']]);
    status('done', '✓ Prêt : lecture d’écriture manuscrite', 100, ['ready' => true]);
    exit(0);
}
$out = '';
$code = run([$venvPython, $appRoot . '/scripts/htr_recognize.py', '--check', '--model', $model], $out);
$j = json_decode(trim((string) preg_replace('/^.*\n(?=\{)/s', '', trim($out))), true);
if ($code !== 0 || !is_array($j) || empty($j['ok'])) {
    engine_save(['verified' => ['ok' => false, 'at' => date('c'), 'error' => (string) ($j['error'] ?? 'Kraken ne s’ouvre pas')]]);
    fail('check', 'La vérification a échoué : ' . (string) ($j['error'] ?? 'Kraken ne s’ouvre pas (voir le journal).'));
}
engine_save(['verified' => ['ok' => true, 'at' => date('c'), 'model' => basename($model), 'kraken' => (string) ($j['kraken'] ?? '')]]);
status('done', '✓ Prêt : lecture d’écriture manuscrite', 100, ['ready' => true]);
