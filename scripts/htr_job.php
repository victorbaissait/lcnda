<?php
declare(strict_types=1);

/**
 * ✨ Lire l'acte : une lecture d'écriture manuscrite en arrière-plan (l'app reste libre pendant ce temps).
 *   php scripts/htr_job.php <dossier de la lecture> <dossier de l'application>
 * Le dossier (DATA_DIR/htr-jobs/<id>, créé par lib/htr_setup.php) contient job.json et l'image ; on y écrit result.json.
 * Le fichier « cancel » arrête la lecture. GENEALOGY_HTR_SIMULATE=1 (tests) : lignes inventées, sans Kraken.
 */

[$self, $jobDir, $appRoot] = array_pad($argv, 3, '');
if ($jobDir === '' || !is_file($jobDir . '/job.json')) { exit(2); }
@set_time_limit(0);
$job = json_decode((string) file_get_contents($jobDir . '/job.json'), true) ?: [];
$write = static function (array $r) use ($jobDir): void {
    @file_put_contents($jobDir . '/result.json.tmp', json_encode($r + ['updated' => time()], JSON_UNESCAPED_UNICODE));
    @rename($jobDir . '/result.json.tmp', $jobDir . '/result.json');
};
$cleanup = static function () use ($jobDir, $job): void { if (!empty($job['image']) && is_file($jobDir . '/' . basename((string) $job['image']))) { @unlink($jobDir . '/' . basename((string) $job['image'])); } };
$write(['state' => 'running', 'started' => time()]);
$image = $jobDir . '/' . basename((string) ($job['image'] ?? ''));
$sim = (string) getenv('GENEALOGY_HTR_SIMULATE');
if ($sim !== '' && $sim !== '0') {
    $info = @getimagesize($image) ?: [600, 400];
    [$w, $h] = [(int) $info[0], (int) $info[1]];
    for ($i = 0; $i < 10; $i++) { if (is_file($jobDir . '/cancel')) { $cleanup(); $write(['state' => 'cancelled']); exit(0); } usleep(80000); }
    $texts = [['L’an mil sept cent quatre-vingt-dix', [.98, .97, .96, .62, .95]], ['le vingt-trois mars a été baptisé Jean', [.97, .9, .52, .96, .94, .93, .99]], ['fils légitime de Pierre MARTIN laboureur', [.95, .96, .97, .91, .58, .9]], ['et de Marie Durand son épouse', [.99, .97, .95, .44, .96, .97]]];
    $lines = [];
    foreach ($texts as $n => [$t, $c]) {
        $y0 = (int) round($h * (.1 + .2 * $n)); $y1 = $y0 + max(4, (int) round($h * .12));
        $words = []; $x = (int) round($w * .05);
        foreach (explode(' ', $t) as $k => $word) { $ww = max(3, (int) round($w * .85 * mb_strlen($word) / mb_strlen($t))); $words[] = ['t' => $word, 'c' => $c[$k] ?? .9, 'bbox' => [$x, $y0, $x + $ww, $y1]]; $x += $ww + 4; }
        $lines[] = ['text' => $t, 'bbox' => [(int) round($w * .05), $y0, (int) round($w * .95), $y1], 'conf' => round(array_sum($c) / count($c), 3), 'words' => $words];
    }
    $cleanup();
    $write(['state' => 'done', 'lines' => $lines, 'text' => implode("\n", array_column($lines, 'text')), 'engine' => 'simulé', 'mode' => 'lines', 'model' => (string) ($job['model_file'] ?? '')]);
    exit(0);
}
$cmd = [(string) $job['python'], $appRoot . '/scripts/htr_recognize.py', '--lines', '--image', $image, '--model', (string) $job['model'], '--language', (string) ($job['language'] ?? '')];
$p = @proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $appRoot);
if (!is_resource($p)) { $cleanup(); $write(['state' => 'error', 'error' => 'Impossible de lancer le moteur de lecture.']); exit(1); }
stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
$out = ''; $err = '';
while (true) {
    $out .= (string) stream_get_contents($pipes[1]); $err .= (string) stream_get_contents($pipes[2]);
    $st = proc_get_status($p);
    if (!$st['running']) { break; }
    if (is_file($jobDir . '/cancel')) { proc_terminate($p); $cleanup(); $write(['state' => 'cancelled']); exit(0); }
    usleep(300000);
}
$out .= (string) stream_get_contents($pipes[1]); $err .= (string) stream_get_contents($pipes[2]);
fclose($pipes[1]); fclose($pipes[2]); proc_close($p);
$cleanup();
$r = json_decode(trim($out), true);
if (!is_array($r) || !empty($r['error']) || !isset($r['lines'])) {
    $msg = is_array($r) && !empty($r['error']) ? (string) $r['error'] : trim(mb_substr($err, -400));
    $write(['state' => 'error', 'error' => $msg !== '' ? $msg : 'La lecture n’a rien donné.']);
    exit(1);
}
// bornes : 2 000 lignes, 1 000 caractères par ligne
$lines = [];
foreach (array_slice((array) $r['lines'], 0, 2000) as $l) {
    if (!is_array($l)) { continue; }
    $box = is_array($l['bbox'] ?? null) && count($l['bbox']) === 4 ? array_map('intval', array_values($l['bbox'])) : null;
    $words = [];
    foreach (array_slice((array) ($l['words'] ?? []), 0, 300) as $w) { if (is_array($w)) { $words[] = ['t' => mb_substr((string) ($w['t'] ?? ''), 0, 120), 'c' => is_numeric($w['c'] ?? null) ? round((float) $w['c'], 3) : null]; } }
    $lines[] = ['text' => mb_substr((string) ($l['text'] ?? ''), 0, 1000), 'bbox' => $box, 'conf' => is_numeric($l['conf'] ?? null) ? round((float) $l['conf'], 3) : null, 'words' => $words];
}
$write(['state' => 'done', 'lines' => $lines, 'text' => implode("\n", array_column($lines, 'text')), 'engine' => 'kraken', 'mode' => (string) ($r['mode'] ?? ''), 'model' => (string) ($job['model_file'] ?? '')]);
