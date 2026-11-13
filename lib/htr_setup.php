<?php
declare(strict_types=1);

/**
 * ✍️ Lecture d'écriture manuscrite (HTR) : installation, modèles, lectures en arrière-plan.
 * Réglages → Reconnaissance d'écriture (HTR) (assistant en 3 étapes) et l'atelier de transcription (« ✨ Lire l'acte »).
 *
 * Kraken (Python) et ses modèles pèsent plus d'1 Go : ils ne sont pas livrés avec l'application mais installés une
 * fois dans le dossier des données commun (SHARED_DATA_DIR/htr), accessible en écriture. Ce qui existait déjà dans le
 * dossier de l'application (.venv-htr, models/htr) reste utilisé.
 *   htr/python/      Python 3.11 tout prêt (python-build-standalone), si on n'utilise pas celui de l'ordinateur
 *   htr/venv/        environnement Python avec Kraken
 *   htr/models/      modèles .mlmodel (+ manifest.json : empreinte, licence, source de chacun)
 *   htr/engine.json  version de Python et de Kraken, dernière vérification
 *   htr/status.json, install.log   avancement de l'installation (scripts/htr_install.php)
 * Les lectures (image de l'acte) sont dans DATA_DIR/htr-jobs/<id> (la généalogie ouverte), effacées après 6 heures.
 */

require_once __DIR__ . '/htr_net.php';

function htr_dir(): string
{
    $d = SHARED_DATA_DIR . '/htr'; // commun à toutes les généalogies
    if (!is_dir($d . '/models')) { @mkdir($d . '/models', 0775, true); }
    return $d;
}

function htr_is_windows(): bool { return DIRECTORY_SEPARATOR === '\\'; }
function htr_simulated(): bool { $s = (string) getenv('GENEALOGY_HTR_SIMULATE'); return $s !== '' && $s !== '0'; }

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
    $name = basename((string) ($model['model'] ?? $model['file'] ?? ''));
    if ($name === '' || !htr_model_name_ok($name)) { return null; }
    $paths = [htr_dir() . '/models/' . $name];
    if (!empty($model['model'])) { $paths[] = APP_ROOT . '/' . (string) $model['model']; }
    foreach ($paths as $p) {
        if (is_file($p) && filesize($p) > 1000) { return realpath($p) ?: $p; }
    }
    return null;
}

/** Les fichiers de modèles connus (config/htr-model-files.json) : source, licence, langues, période. */
function htr_model_files(): array
{
    static $files = null;
    if ($files !== null) { return $files; }
    $raw = json_decode((string) @file_get_contents(APP_ROOT . '/config/htr-model-files.json'), true);
    $files = [];
    foreach (is_array($raw) ? $raw : [] as $f) {
        if (is_array($f) && htr_model_name_ok((string) ($f['file'] ?? ''))) { $files[(string) $f['file']] = $f; }
    }
    return $files;
}

function htr_install_status(): array
{
    $s = @json_decode((string) @file_get_contents(htr_dir() . '/status.json'), true);
    return is_array($s) ? $s : ['state' => 'idle'];
}

function htr_json_file(string $path): array { $j = @json_decode((string) @file_get_contents($path), true); return is_array($j) ? $j : []; }

/** État pour l'écran : ce qui manque et pourquoi, modèles (licence, empreinte), installation en cours, vérification. */
function htr_setup_status(): array
{
    $files = htr_model_files();
    $manifest = htr_json_file(htr_dir() . '/models/manifest.json');
    $models = [];
    // les modèles connus, puis les profils de langue de l'ancien catalogue (config/htr-models.json)
    foreach (htr_model_catalog() as $m) {
        $name = basename((string) $m['model']);
        if (!htr_model_name_ok($name)) { continue; }
        $files[$name] ??= ['file' => $name, 'title' => $name, 'source' => !empty($m['doi']) ? 'manual' : 'manual', 'languages' => '', 'period' => '', 'best_for' => (string) ($m['description'] ?? ''), 'license' => ''];
        $files[$name]['profiles'][] = (string) ($m['label'] ?? $m['id']);
    }
    foreach ($files as $name => $f) {
        $p = htr_model_file(['file' => $name, 'model' => 'models/htr/' . $name]);
        $man = is_array($manifest[$name] ?? null) ? $manifest[$name] : [];
        $models[] = [
            'file' => $name, 'title' => (string) ($f['title'] ?? $name), 'authors' => (string) ($f['authors'] ?? ''),
            'languages' => (string) ($f['languages'] ?? ''), 'period' => (string) ($f['period'] ?? ''), 'best_for' => (string) ($f['best_for'] ?? ''),
            'uses' => array_values(array_map('strval', (array) ($f['uses'] ?? []))), 'recommended' => !empty($f['recommended']),
            'source' => ($f['source'] ?? '') === 'zenodo' ? 'zenodo' : 'manual', 'doi' => (string) ($f['doi'] ?? ''),
            'license' => (string) ($man['license'] ?? $f['license'] ?? ''), 'size_hint_mb' => (int) ($f['size_hint_mb'] ?? 0),
            'profiles' => array_values(array_unique((array) ($f['profiles'] ?? []))),
            'present' => (bool) $p, 'size' => $p ? (int) filesize($p) : 0,
            'verified' => $p && !empty($man['sha256']) && is_file(htr_dir() . '/models/' . $name) ? (string) ($man['checked'] ?? 'sha256') : '',
            'sha256' => $p ? (string) ($man['sha256'] ?? '') : '',
            'removed' => !$p && is_file(htr_dir() . '/models/.removed/' . $name),
        ];
    }
    $status = htr_install_status();
    // Installation interrompue (application fermée) : plus « en cours » au bout de 2 heures sans nouvelles
    if (($status['state'] ?? '') === 'running' && time() - (int) ($status['updated'] ?? 0) > 7200) { $status['state'] = 'interrupted'; }
    $log = @file_get_contents(htr_dir() . '/install.log') ?: '';
    $engine = htr_json_file(htr_dir() . '/engine.json');
    $kraken = htr_kraken_installed();
    $present = array_values(array_filter($models, static fn($m) => $m['present']));
    $free = @disk_free_space(htr_dir());
    $verified = is_array($engine['verified'] ?? null) ? $engine['verified'] : null;
    return [
        'kraken' => $kraken, 'python' => htr_venv_python() !== null,
        'python_source' => (string) ($engine['python'] ?? ($kraken ? 'system' : '')), 'python_version' => (string) ($engine['python_version'] ?? ''),
        'kraken_version' => (string) ($engine['kraken_version'] ?? ''), 'installed_at' => (string) ($engine['installed_at'] ?? ''),
        'embedded_possible' => htr_python_triple() !== null,
        'models' => $models, 'ready' => $kraken && (bool) $present, 'verified' => $verified,
        'install' => $status, 'log' => mb_substr($log, -6000), 'windows' => htr_is_windows(),
        'os' => match (PHP_OS_FAMILY) { 'Darwin' => 'mac', 'Windows' => 'windows', default => 'linux' },
        'free_bytes' => $free === false ? null : (int) $free, 'size_bytes' => htr_dir_size(), 'dir' => htr_dir(),
        'simulated' => htr_simulated(),
    ];
}

/** Place prise par le moteur et les modèles (sans suivre les liens). */
function htr_dir_size(): int
{
    $n = 0;
    foreach (['python', 'venv', 'models'] as $sub) {
        $d = htr_dir() . '/' . $sub;
        if (!is_dir($d) || is_link($d)) { continue; }
        try {
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS)) as $f) { if (!$f->isLink() && $f->isFile()) { $n += (int) $f->getSize(); } }
        } catch (Throwable $e) { /* dossier illisible : compté à 0 */ }
    }
    return $n;
}

function htr_spawn_php(array $args, string $log): void
{
    $php = PHP_BINARY ?: 'php';
    if (htr_is_windows()) {
        $cmd = 'start "" /B ' . implode(' ', array_map('escapeshellarg', [$php, ...$args])) . ' >> ' . escapeshellarg($log) . ' 2>&1';
        pclose(popen('cmd /C "' . $cmd . '"', 'r'));
    } else {
        exec('nohup ' . implode(' ', array_map('escapeshellarg', [$php, ...$args])) . ' >> ' . escapeshellarg($log) . ' 2>&1 &');
    }
}

/** Lance l'installation en arrière-plan (scripts/htr_install.php) : Python, Kraken, modèles, vérification. */
function htr_install_start(array $data): array
{
    $status = htr_install_status();
    if (($status['state'] ?? '') === 'running' && time() - (int) ($status['updated'] ?? 0) < 7200) { return ['started' => false, 'already' => true]; }
    $script = APP_ROOT . '/scripts/htr_install.php';
    if (!is_file($script)) { throw new RuntimeException('Programme d’installation introuvable (scripts/htr_install.php).'); }
    $only = safe_text($data['only'] ?? '');
    if (str_starts_with($only, 'model:')) {
        $f = substr($only, 6);
        if (!htr_model_name_ok($f) || (htr_model_files()[$f]['source'] ?? '') !== 'zenodo') { throw new RuntimeException('Ce modèle ne se télécharge pas tout seul : ajoute son fichier à la main.'); }
    } elseif (!in_array($only, ['', 'engine', 'models', 'check'], true)) {
        throw new RuntimeException('Demande d’installation inconnue.');
    }
    $py = in_array($data['python'] ?? '', ['embedded', 'system'], true) ? (string) $data['python'] : 'auto';
    $simFail = htr_simulated() ? preg_replace('/[^a-z_]/', '', (string) ($data['simulate_fail'] ?? '')) : ''; // tests seulement
    @file_put_contents(htr_dir() . '/status.json', json_encode(['state' => 'running', 'step' => 'Démarrage…', 'pct' => 1, 'phase' => $only === 'check' ? 'check' : (str_starts_with($only, 'model') ? 'model' : 'engine'), 'updated' => time()]));
    @file_put_contents(htr_dir() . '/install.log', '[' . date('H:i:s') . "] Installation demandée ({$only}" . ($only === '' ? 'tout' : '') . ", python : {$py})\n");
    htr_spawn_php([$script, htr_dir(), APP_ROOT, $only, $py, (string) $simFail], htr_dir() . '/install.log');
    return ['started' => true];
}

/** 🗑 Désinstaller : le moteur (Python, Kraken), et les modèles si on le demande. Ne se défait pas (≈ 1,5 Go). */
function htr_uninstall(array $data): array
{
    $status = htr_install_status();
    if (($status['state'] ?? '') === 'running' && time() - (int) ($status['updated'] ?? 0) < 7200) { throw new RuntimeException('Une installation est en cours : attends qu’elle finisse.'); }
    $dir = htr_dir(); $freed = 0;
    foreach (['venv', 'python', 'python.tmp'] as $sub) { if (is_dir($dir . '/' . $sub) || is_link($dir . '/' . $sub)) { $freed += htr_rmtree($dir . '/' . $sub, $dir); } }
    if (empty($data['keep_models'])) {
        foreach (glob($dir . '/models/*.mlmodel') ?: [] as $f) { if (!is_link($f)) { $freed += (int) filesize($f); } @unlink($f); }
        if (is_dir($dir . '/models/.removed')) { $freed += htr_rmtree($dir . '/models/.removed', $dir); }
        @unlink($dir . '/models/manifest.json');
    }
    foreach (['engine.json', 'status.json', 'install.log', 'python-dl.tar.gz'] as $f) { @unlink($dir . '/' . $f); }
    return ['freed' => $freed, 'kept_models' => !empty($data['keep_models'])];
}

/** Retirer un modèle (rangé de côté : « ↶ Annuler » le remet), ou le remettre. */
function htr_model_remove(array $data, bool $restore = false): array
{
    $name = basename(safe_text($data['file'] ?? ''));
    if (!htr_model_name_ok($name)) { throw new RuntimeException('Nom de modèle refusé.'); }
    $dir = htr_dir() . '/models'; @mkdir($dir . '/.removed', 0775, true);
    [$from, $to] = $restore ? [$dir . '/.removed/' . $name, $dir . '/' . $name] : [$dir . '/' . $name, $dir . '/.removed/' . $name];
    if (!is_file($from) || is_link($from) || !htr_inside($dir, $from)) { throw new RuntimeException($restore ? 'Ce modèle n’est plus là.' : 'Ce modèle n’est pas installé dans les données.'); }
    if (!@rename($from, $to)) { throw new RuntimeException('Impossible de déplacer le modèle.'); }
    return ['file' => $name, 'restored' => $restore];
}

/** Modèle ajouté à la main (fichier .mlmodel téléchargé par l'utilisateur). */
function htr_upload_model(?array $file, string $target): never
{
    if (!$file || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { json_response(['error' => 'Fichier non reçu.'], 422); }
    $name = basename($target !== '' ? $target : (string) $file['name']);
    if (!htr_model_name_ok($name)) { json_response(['error' => 'Il faut un fichier de modèle Kraken (.mlmodel).'], 422); }
    if ((int) $file['size'] < 1000) { json_response(['error' => 'Ce fichier est trop petit pour être un modèle.'], 422); }
    $dest = htr_dir() . '/models/' . $name;
    if (!htr_inside(htr_dir() . '/models', $dest)) { json_response(['error' => 'Nom de modèle refusé.'], 422); }
    if (!@move_uploaded_file((string) $file['tmp_name'], $dest) && !@copy((string) $file['tmp_name'], $dest)) { json_response(['error' => 'Impossible de ranger le modèle.'], 500); }
    // un modèle ajouté à la main : son empreinte est notée (pas de source officielle à comparer)
    $man = htr_json_file(htr_dir() . '/models/manifest.json');
    $man[$name] = ['sha256' => hash_file('sha256', $dest), 'checked' => 'à la main', 'license' => (string) (htr_model_files()[$name]['license'] ?? ''), 'bytes' => (int) filesize($dest), 'at' => date('c')];
    @file_put_contents(htr_dir() . '/models/manifest.json', json_encode($man, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    json_response(['ok' => true, 'file' => $name, 'size' => (int) filesize($dest)]);
}

/* ═════════ ✨ Lire l'acte : lecture en arrière-plan ═════════ */

function htr_jobs_dir(): string
{
    $d = DATA_DIR . '/htr-jobs';
    if (!is_dir($d)) { @mkdir($d, 0775, true); }
    return $d;
}

function htr_job_dir(string $id): string
{
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) { throw new RuntimeException('Lecture inconnue.'); }
    $d = htr_jobs_dir() . '/' . $id;
    if (!is_dir($d) || is_link($d)) { throw new RuntimeException('Lecture inconnue (ou trop ancienne).'); }
    return $d;
}

/** Démarre une lecture : l'image de l'acte (ou sa zone, ou l'image améliorée) est copiée dans un dossier à part. */
function htr_read_start(PDO $pdo, array $data): array
{
    // les vieilles lectures (plus de 6 heures) sont effacées
    $running = 0;
    foreach (glob(htr_jobs_dir() . '/*', GLOB_ONLYDIR) ?: [] as $d) {
        if (is_link($d) || !preg_match('/^[a-f0-9]{24}$/', basename($d))) { continue; }
        $age = time() - (int) @filemtime($d . '/job.json');
        if ($age > 6 * 3600) { htr_rmtree($d, htr_jobs_dir()); continue; }
        $r = htr_json_file($d . '/result.json');
        if (($r['state'] ?? 'running') === 'running' && time() - (int) ($r['updated'] ?? @filemtime($d . '/job.json')) < 900) { $running++; }
    }
    if ($running >= 2) { throw new RuntimeException('Deux lectures sont déjà en cours : attends qu’une se termine.'); }
    $mediaId = safe_int($data['media_id'] ?? 0); if (!$mediaId) { throw new RuntimeException('Choisis d’abord l’image de l’acte.'); }
    $stmt = $pdo->prepare('SELECT id, filename, media_type FROM media WHERE id = ?'); $stmt->execute([$mediaId]); $media = $stmt->fetch();
    if (!$media) { throw new RuntimeException('Média introuvable'); }
    if (($media['media_type'] ?? '') !== 'image') { throw new RuntimeException('La lecture d’écriture marche seulement sur les images.'); }
    // le moteur et le modèle
    $python = htr_venv_python();
    if (!$python || !htr_kraken_installed()) { throw new RuntimeException('La lecture d’écriture manuscrite n’est pas encore installée : Réglages → Reconnaissance d’écriture (HTR).'); }
    $file = basename(safe_text($data['model_file'] ?? ''));
    $modelPath = null;
    if ($file !== '') {
        if (!htr_model_name_ok($file)) { throw new RuntimeException('Modèle inconnu.'); }
        $modelPath = htr_model_file(['file' => $file, 'model' => 'models/htr/' . $file]);
    } elseif (!empty($data['model'])) {
        $m = htr_model_by_id(safe_text($data['model'])); $modelPath = htr_model_file($m); $file = basename((string) $m['model']);
    } else {
        foreach (htr_setup_status()['models'] as $m) { if ($m['present'] && (!$modelPath || $m['recommended'])) { $modelPath = htr_model_file(['file' => $m['file'], 'model' => 'models/htr/' . $m['file']]); $file = $m['file']; if ($m['recommended']) { break; } } }
    }
    if (!$modelPath) { throw new RuntimeException('Ce modèle d’écriture n’est pas installé : Réglages → Reconnaissance d’écriture (HTR), étape ②.'); }
    // l'image : celle du média, ou celle envoyée (zone découpée, image améliorée) — vérifiée comme pour htr_recognize
    $id = bin2hex(random_bytes(12));
    $dir = htr_jobs_dir() . '/' . $id;
    if (!@mkdir($dir, 0775)) { throw new RuntimeException('Écriture impossible dans le dossier des données.'); }
    try {
        if (!empty($data['image_b64']) && is_string($data['image_b64'])) {
            if (strlen($data['image_b64']) > 40 * 1024 * 1024) { throw new RuntimeException('Image améliorée trop lourde.'); }
            $bin = base64_decode($data['image_b64'], true);
            $info = $bin !== false ? @getimagesizefromstring($bin) : false;
            if (!$info || !in_array($info[2] ?? 0, [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) { throw new RuntimeException('Image améliorée illisible.'); }
            if ((int) $info[0] < 1 || (int) $info[1] < 1 || (int) $info[0] > 20000 || (int) $info[1] > 20000 || (int) $info[0] * (int) $info[1] > 120000000) { throw new RuntimeException('Image améliorée trop grande.'); }
            $img = 'page.' . ($info[2] === IMAGETYPE_PNG ? 'png' : 'jpg');
            file_put_contents($dir . '/' . $img, $bin); unset($bin);
        } else {
            $filename = str_replace(['\\', "\0"], ['/', ''], (string) $media['filename']);
            if ($filename === '' || str_contains($filename, '..')) { throw new RuntimeException('Nom de fichier média invalide.'); }
            $root = realpath(MEDIA_DIR); $src = realpath(MEDIA_DIR . '/' . $filename);
            if (!$root || !$src || !str_starts_with($src, $root . DIRECTORY_SEPARATOR) || !is_file($src)) { throw new RuntimeException('Fichier média introuvable.'); }
            $info = @getimagesize($src);
            if (!$info || !in_array($info[2] ?? 0, [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_TIFF_II, IMAGETYPE_TIFF_MM, IMAGETYPE_WEBP, IMAGETYPE_BMP], true)) { throw new RuntimeException('Cette image ne peut pas être lue (format).'); }
            $img = 'page' . image_type_to_extension((int) $info[2]);
            if (!copy($src, $dir . '/' . $img)) { throw new RuntimeException('Copie de l’image impossible.'); }
        }
        $job = ['python' => $python, 'model' => $modelPath, 'model_file' => $file, 'image' => $img, 'media_id' => $mediaId, 'language' => preg_replace('/[^a-z+]/', '', (string) ($data['language'] ?? '')), 'created' => time()];
        file_put_contents($dir . '/job.json', json_encode($job, JSON_UNESCAPED_UNICODE));
        file_put_contents($dir . '/result.json', json_encode(['state' => 'running', 'updated' => time()]));
    } catch (Throwable $e) {
        htr_rmtree($dir, htr_jobs_dir());
        throw $e;
    }
    htr_spawn_php([APP_ROOT . '/scripts/htr_job.php', $dir, APP_ROOT], $dir . '/run.log');
    return ['id' => $id, 'model_file' => $file];
}

/** Où en est la lecture ? (running, done + lignes, error, cancelled) */
function htr_read_job(string $id): array
{
    $dir = htr_job_dir($id);
    $r = htr_json_file($dir . '/result.json');
    $job = htr_json_file($dir . '/job.json');
    $state = (string) ($r['state'] ?? 'running');
    if ($state === 'running' && time() - (int) ($r['updated'] ?? $job['created'] ?? time()) > 1800) { $state = 'error'; $r['error'] = 'La lecture a pris trop de temps (plus de 30 minutes) : essaie sur une zone plus petite.'; }
    $out = ['id' => $id, 'state' => $state, 'elapsed' => max(0, time() - (int) ($job['created'] ?? time())), 'model_file' => (string) ($job['model_file'] ?? '')];
    if ($state === 'done') { $out += ['lines' => (array) ($r['lines'] ?? []), 'text' => (string) ($r['text'] ?? ''), 'engine' => (string) ($r['engine'] ?? ''), 'mode' => (string) ($r['mode'] ?? '')]; }
    if ($state === 'error') { $out['error'] = (string) ($r['error'] ?? 'La lecture n’a pas abouti.'); }
    return $out;
}

function htr_read_cancel(string $id): array
{
    $dir = htr_job_dir($id);
    @file_put_contents($dir . '/cancel', '1');
    return ['id' => $id, 'cancelled' => true];
}
