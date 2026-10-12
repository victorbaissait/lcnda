<?php
declare(strict_types=1);
/**
 * Pour les tests : charge toutes les fonctions et constantes de api.php sans exécuter la requête
 * (à inclure après lib/bootstrap.php). Chaque « function » de premier niveau va jusqu'à la ligne « } ».
 */
foreach (['gedcom', 'heredis', 'backup'] as $lib) { require_once APP_ROOT . '/lib/' . $lib . '.php'; }
$src = file_get_contents(APP_ROOT . '/api.php');
preg_match_all('/^const [A-Z0-9_]+\s*=.*?;\s*$/ms', $src, $consts);
foreach ($consts[0] as $c) { if (preg_match('/^const ([A-Z0-9_]+)/', $c, $m) && !defined($m[1])) { eval($c); } }
$at = 0;
while (preg_match('/^function (\w+)\(/m', $src, $m, PREG_OFFSET_CAPTURE, $at)) {
    $start = $m[0][1]; $end = strpos($src, "\n}\n", $start);
    if ($end === false) { break; }
    if (!function_exists($m[1][0])) { eval(substr($src, $start, $end - $start + 3)); }
    $at = $end + 3;
}
