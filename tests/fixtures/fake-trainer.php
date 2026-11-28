<?php
/**
 * 🎓 Un faux entraîneur pour tests/test-atelier-idees.js (jamais utilisé hors des essais : GENEALOGY_TEST=1).
 * Imite « ketos test », « ketos train » (sortie de Kraken : « stage 3/30 », « val_accuracy=0.91 », out/model_best.mlmodel)
 * et scripts/atelier_train_qwen.py (lignes JSON). Chaque appel est noté dans FAKE_TRAIN_ARGS_LOG (pour vérifier les commandes).
 * FAKE_TRAIN_FAIL=1 : échoue ; FAKE_TRAIN_SLEEP : millisecondes par passe (150).
 */
$args = array_slice($argv, 1);
if ($log = getenv('FAKE_TRAIN_ARGS_LOG')) { file_put_contents($log, json_encode($args, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND); }
$opt = static function (string $k) use ($args): string { $i = array_search($k, $args, true); return $i === false ? '' : (string) ($args[$i + 1] ?? ''); };
$sleep = (int) (getenv('FAKE_TRAIN_SLEEP') ?: 150) * 1000;
// FAKE_TRAIN_SNAP : un dossier où garder une copie des listes reçues (train, val, heldout) et du texte juste de la 1ʳᵉ ligne mise de côté —
// le dossier du travail est effacé une fois l'entraînement fini (audit sécurité), l'essai vérifie le partage des lignes sur cette copie
$snap = static function (string $name, string $file): void { $d = (string) getenv('FAKE_TRAIN_SNAP'); if ($d === '' || !is_file($file)) { return; } @mkdir($d, 0775, true); @copy($file, "$d/$name"); };
if (getenv('FAKE_TRAIN_FAIL') === '1') { fwrite(STDERR, "RuntimeError: CUDA out of memory\n"); exit(1); }
if (in_array('--engine', $args, true)) { // Qwen (Unsloth)
    $out = $opt('--out'); $n = (int) $opt('--epochs');
    echo json_encode(['phase' => 'before', 'accuracy' => 71.5]), "\n";
    for ($e = 1; $e <= $n; $e++) { usleep($sleep); echo json_encode(['epoch' => $e, 'epochs' => $n, 'loss' => round(1.2 / $e, 3)]), "\n"; }
    @mkdir("$out/adapter", 0775, true); file_put_contents("$out/adapter/adapter_model.safetensors", str_repeat('x', 2000));
    file_put_contents("$out/model.gguf", str_repeat('g', 2000)); file_put_contents("$out/Modelfile", "FROM ./model.gguf\n");
    echo json_encode(['adapter' => "$out/adapter"]), "\n", json_encode(['phase' => 'after', 'accuracy' => 88.0]), "\n", json_encode(['modelfile' => "$out/Modelfile"]), "\n";
    exit(0);
}
if (($args[0] ?? '') === 'test') {
    $m = $opt('-m'); $ev = $opt('-e');
    if (!is_file($m) || !is_file($ev)) { fwrite(STDERR, "missing\n"); exit(1); }
    $snap('heldout.txt', $ev); $first = trim((string) strtok((string) file_get_contents($ev), "\n")); if ($first !== '') { $snap('heldout-1.gt.txt', (string) preg_replace('/\.png$/', '.gt.txt', $first)); }
    echo "Evaluating " . count(array_filter(explode("\n", (string) file_get_contents($ev)))) . " lines\n";
    echo str_contains($m, '/out/model') ? "Average accuracy: 93.40%, (error rate: 6.60%)\n" : "Average accuracy: 81.20%, (error rate: 18.80%)\n";
    exit(0);
}
if (($args[0] ?? '') === 'train') {
    $o = $opt('-o'); $n = (int) $opt('-N');
    foreach (['-i', '-t', '-e'] as $k) { if (!is_file($opt($k))) { fwrite(STDERR, "no such file for $k\n"); exit(1); } }
    $snap('train.txt', $opt('-t')); $snap('val.txt', $opt('-e'));
    for ($e = 1; $e <= $n; $e++) {
        if ($e === 1) { echo "Initializing model ✓\n"; }
        usleep($sleep);
        echo "stage $e/$n\r", "val_accuracy=" . number_format(.8 + .1 * $e / $n, 3) . "\n";
        file_put_contents("{$o}_{$e}.mlmodel", str_repeat('m', 3000)); copy("{$o}_{$e}.mlmodel", "{$o}_best.mlmodel");
    }
    exit(0);
}
fwrite(STDERR, "unknown\n"); exit(2);
