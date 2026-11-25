<?php
declare(strict_types=1);

/**
 * 🎓 Entraîner la lecture sur mes lignes relues : le travail en tâche de fond (lancé par lib/atelier_entrainer.php).
 *   php scripts/atelier_train.php <dossier du travail> <dossier de l'application> <dossier htr commun>
 * Le dossier contient job.json (les commandes déjà construites), train/ heldout/ (images + .gt.txt), out/ ; on y écrit status.json
 * (phase, passe n / N, temps restant, justesse avant / après) et train.log. Le fichier « cancel » arrête : le meilleur état atteint est gardé.
 * Kraken : ketos test (modèle de départ, lignes mises de côté) → ketos train → ketos test (nouveau modèle) → copie dans htr/models.
 * Qwen : scripts/atelier_train_qwen.py fait tout et écrit des lignes JSON ({"phase":…}, {"epoch":…}, {"modelfile":…}).
 */

[$self, $dir, $appRoot, $htrDir] = array_pad($argv, 4, '');
if ($dir === '' || !is_file($dir . '/job.json')) { exit(2); }
@set_time_limit(0);
$job = json_decode((string) file_get_contents($dir . '/job.json'), true) ?: [];
$st = json_decode((string) @file_get_contents($dir . '/status.json'), true) ?: [];
$put = static function (array $more) use ($dir, &$st): void {
    $st = array_merge($st, $more, ['updated' => time()]);
    @file_put_contents($dir . '/status.json.tmp', json_encode($st, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    @rename($dir . '/status.json.tmp', $dir . '/status.json');
};
$log = static function (string $l) use ($dir): void { @file_put_contents($dir . '/train.log', $l . "\n", FILE_APPEND); };
$cancelled = static fn(): bool => is_file($dir . '/cancel');
$pct = static function (string $s): ?float { // « Average accuracy: 92.31% », « val_accuracy=0.913 », « accuracy 0.88 »
    if (preg_match('/accuracy[^0-9%]{0,12}([0-9]+(?:\.[0-9]+)?)\s*%/i', $s, $m)) { return round((float) $m[1], 1); }
    if (preg_match('/val_accuracy[^0-9]{0,4}([0-9]*\.[0-9]+|[01])\b/i', $s, $m)) { $v = (float) $m[1]; return round($v <= 1 ? $v * 100 : $v, 1); }
    return null;
};
/** lance une commande, chaque ligne de sortie à onLine ; 'cancelled' si arrêtée, sinon le code de sortie */
$run = static function (array $cmd, callable $onLine) use ($cancelled, $log, $appRoot, $job) {
    $log('$ ' . implode(' ', array_map(static fn($a) => str_contains($a, ' ') ? '"' . $a . '"' : $a, $cmd)));
    $env = getenv(); $env['PYTHONUNBUFFERED'] = '1'; if (!empty($job['allow_download'])) { $env['LCNDA_ALLOW_DOWNLOAD'] = '1'; } // le modèle de départ de Qwen : seulement si la case est cochée
    $p = @proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $appRoot !== '' ? $appRoot : null, $env);
    if (!is_resource($p)) { return 127; }
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $buf = ['', ''];
    $drain = static function (bool $all = false) use (&$buf, $pipes, $onLine, $log) {
        foreach ([1, 2] as $k) {
            $buf[$k - 1] .= (string) stream_get_contents($pipes[$k]);
            $parts = preg_split('/\r\n|\r|\n/', $buf[$k - 1]); $buf[$k - 1] = $all ? '' : (string) array_pop($parts); // les barres d'avancée réécrivent la ligne (\r)
            foreach ($parts as $l) { if (trim($l) !== '') { $log($l); $onLine($l); } }
        }
    };
    $code = -1;
    while (true) {
        $drain();
        $ps = proc_get_status($p); if (!$ps['running']) { $code = (int) $ps['exitcode']; break; }
        if ($cancelled()) { proc_terminate($p); usleep(300000); if (proc_get_status($p)['running']) { proc_terminate($p, 9); } $drain(true); @fclose($pipes[1]); @fclose($pipes[2]); proc_close($p); return 'cancelled'; }
        usleep(200000);
    }
    $drain(true); @fclose($pipes[1]); @fclose($pipes[2]); $c2 = proc_close($p);
    return $code >= 0 ? $code : $c2;
};
$t0 = time(); $epochs = (int) ($job['epochs'] ?? 30);
$progress = static function (int $e, ?int $of = null) use ($put, $t0, &$epochs, &$st): void {
    if ($of) { $epochs = $of; }
    $el = time() - $t0; $eta = $e > 0 ? (int) round($el / $e * max(0, $epochs - $e)) : null;
    $put(['epoch' => $e, 'epochs' => $epochs, 'pct' => (int) round(100 * $e / max(1, $epochs)), 'eta' => $eta]);
};
$fail = static function (string $msg) use ($put, $log): never { $log('⛔ ' . $msg); $put(['state' => 'error', 'error' => $msg]); exit(1); };
$trained = static function (array $entry) use ($htrDir): void { // htr/models/trained.json (verrouillé : deux généalogies peuvent entraîner)
    $f = $htrDir . '/models/trained.json'; @mkdir(dirname($f), 0775, true);
    $h = fopen($f, 'c+'); if (!$h) { return; } flock($h, LOCK_EX);
    $j = json_decode((string) stream_get_contents($h), true) ?: []; $j['models'] = array_values(array_filter((array) ($j['models'] ?? []), static fn($m) => is_array($m) && ($m['id'] ?? '') !== $entry['id'])); $j['models'][] = $entry;
    ftruncate($h, 0); rewind($h); fwrite($h, json_encode($j, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); flock($h, LOCK_UN); fclose($h);
};
$id = basename($dir); $engine = (string) ($job['engine'] ?? 'kraken');

if ($engine === 'qwen') {
    $put(['phase' => 'train']); $before = null; $after = null; $modelfile = ''; $adapter = ''; $err = '';
    $code = $run((array) $job['cmd_train'], static function (string $l) use (&$before, &$after, &$modelfile, &$adapter, &$err, $progress, $put) {
        $j = json_decode($l, true); if (!is_array($j)) { return; }
        if (($j['phase'] ?? '') === 'before' && isset($j['accuracy'])) { $before = round((float) $j['accuracy'], 1); $put(['before' => $before]); }
        if (($j['phase'] ?? '') === 'after' && isset($j['accuracy'])) { $after = round((float) $j['accuracy'], 1); $put(['after' => $after, 'phase' => 'after']); }
        if (($j['phase'] ?? '') === 'download') { $put(['phase' => 'download']); }
        if (isset($j['epoch'])) { $put(['phase' => 'train']); $progress((int) $j['epoch'], isset($j['epochs']) ? (int) $j['epochs'] : null); if (isset($j['loss'])) { $put(['loss' => round((float) $j['loss'], 4)]); } }
        if (!empty($j['adapter'])) { $adapter = (string) $j['adapter']; }
        if (!empty($j['modelfile'])) { $modelfile = (string) $j['modelfile']; }
        if (!empty($j['error'])) { $err = (string) $j['error']; }
    });
    if ($code === 'cancelled' && $adapter === '') { $put(['state' => 'cancelled']); exit(0); }
    if ($code !== 0 && $code !== 'cancelled') { $fail($err !== '' ? $err : 'L’entraînement de Qwen n’a pas abouti (voir le journal).'); }
    $dest = $htrDir . '/qwen/' . $id; @mkdir(dirname($dest), 0775, true);
    if (!@rename($dir . '/out', $dest)) { $dest = $dir . '/out'; }
    $fix = static fn(string $p) => $p !== '' ? str_replace($dir . '/out', $dest, $p) : '';
    $modelfile = $fix($modelfile);
    $trained(['id' => $id, 'engine' => 'qwen', 'title' => (string) $job['title'], 'hand' => (string) $job['hand'], 'dir' => $dest, 'modelfile' => $modelfile, 'base' => (string) $job['base'], 'lines' => (int) $job['lines'], 'before' => $before, 'after' => $after, 'created' => date('c')]);
    $put(['state' => $code === 'cancelled' ? 'cancelled' : 'done', 'phase' => 'done', 'dir' => $dest, 'modelfile' => $modelfile, 'kept' => true, 'pct' => 100]);
    exit(0);
}

// ─── Kraken ───
$acc = null;
$put(['phase' => 'before']);
$code = $run((array) $job['cmd_test_base'], static function (string $l) use (&$acc, $pct) { $v = $pct($l); if ($v !== null && preg_match('/average|accuracy/i', $l)) { $acc = $v; } });
if ($code === 'cancelled') { $put(['state' => 'cancelled']); exit(0); }
$put(['before' => $acc]);
$put(['phase' => 'train']); $progress(0);
$best = null;
$code = $run((array) $job['cmd_train'], static function (string $l) use ($progress, $put, $pct, &$best) {
    if (preg_match('/\bstage\s+(\d+)\s*\/\s*(\d+|∞)/i', $l, $m)) { $progress((int) $m[1], ctype_digit($m[2]) ? (int) $m[2] : null); }
    elseif (preg_match('/\bepoch\s+(\d+)/i', $l, $m) && !str_contains($l, '%|')) { $progress((int) $m[1] + (stripos($l, 'epoch 0') !== false ? 1 : 0)); }
    $v = $pct($l); if ($v !== null && stripos($l, 'accuracy') !== false) { $best = max($best ?? 0, $v); $put(['val' => $best]); }
});
$out = $dir . '/out';
$cands = glob($out . '/model_best.mlmodel') ?: [];
if (!$cands) { $all = glob($out . '/model_*.mlmodel') ?: []; natsort($all); $cands = $all ? [end($all)] : []; }
$model = $cands[0] ?? '';
if ($code === 'cancelled' && $model === '') { $put(['state' => 'cancelled', 'kept' => false]); exit(0); }
if ($code !== 0 && $code !== 'cancelled') { $fail($model === '' ? 'L’entraînement n’a pas abouti (voir le journal).' : 'L’entraînement s’est arrêté en route (voir le journal).'); }
if ($model === '' || filesize($model) < 1000) { $fail('L’entraînement n’a pas produit de modèle.'); }
$wasCancelled = $code === 'cancelled';
@unlink($dir . '/cancel'); // la mesure « après » se fait quand même (quelques secondes)
$put(['phase' => 'after']); $after = null;
$cmd = array_map(static fn($a) => $a === '{MODEL}' ? $model : $a, (array) $job['cmd_test_new']);
$run($cmd, static function (string $l) use (&$after, $pct) { $v = $pct($l); if ($v !== null && preg_match('/average|accuracy/i', $l)) { $after = $v; } });
$file = 'lcnda-' . substr((string) ($job['slug'] ?? 'main'), 0, 40) . '-' . substr($id, 0, 6) . '.mlmodel';
@mkdir($htrDir . '/models', 0775, true);
if (!@copy($model, $htrDir . '/models/' . $file)) { $fail('Le modèle n’a pas pu être rangé avec les modèles de lecture.'); }
$trained(['id' => $id, 'engine' => 'kraken', 'file' => $file, 'title' => (string) $job['title'], 'hand' => (string) $job['hand'], 'base' => (string) ($job['base'] ?? ''), 'lines' => (int) $job['lines'], 'heldout' => (int) $job['heldout'], 'before' => $acc, 'after' => $after, 'created' => date('c')]);
$put(['state' => $wasCancelled ? 'cancelled' : 'done', 'phase' => 'done', 'after' => $after, 'model_file' => $file, 'kept' => true, 'pct' => 100]);
