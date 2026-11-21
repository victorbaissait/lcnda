<?php
declare(strict_types=1);

/**
 * 🐘 Calculs gardés tant que la généalogie ne change pas (très grosses bases : 200 000 à 500 000 fiches).
 *
 * Chaque table suivie a une ligne dans data_gen (migration 100) avec un jeton tiré au hasard ; des déclencheurs SQLite
 * le retirent au hasard à CHAQUE ligne ajoutée, modifiée ou supprimée, d'où qu'elle vienne (l'app, un import, une
 * synchronisation, un autre programme). Un calcul gardé note les jetons des tables qu'il lit : si l'un a bougé, il est
 * refait. Un jeton au hasard (et pas un compteur) : une base remise d'une sauvegarde puis modifiée ne peut pas retomber
 * par hasard sur un calcul gardé d'un autre état.
 *
 * Si un déclencheur a disparu (table reconstruite par une migration future, base d'une autre version), il est recréé et
 * tous les jetons sont retirés (tout est refait une fois). Base en lecture seule, ou erreur : rien n'est gardé, le calcul
 * est fait à chaque fois (comme avant).
 *
 * Le résultat est gardé dans DATA_DIR/cache/calc-<nom>.ser (serialize : les mêmes valeurs PHP, types compris) (un fichier par généalogie) : jamais dans la base, pour ne
 * pas la faire grossir ni déclencher une sauvegarde automatique.
 */

const CALC_GEN_TABLES = ['persons', 'events', 'families', 'family_children', 'places', 'sources', 'source_links', 'media', 'media_links',
    'notes', 'name_variants', 'labels', 'label_links', 'event_types', 'surname_groups', 'archives_dispo_corr', 'app_settings', 'tresor_items', 'proof_cases', 'link_strength', 'living_contacts', 'so_imports', 'items', 'census_members', 'census_records'];
/** à augmenter si un calcul gardé change de forme (tous les fichiers gardés sont alors refaits) */
const CALC_CACHE_VERSION = 2;

/** Le texte exact de chaque déclencheur (nom => CREATE TRIGGER …) : seuls ceux-là sont gardés à l'ouverture d'une base. */
function calc_gen_triggers(array $tables): array
{
    $out = [];
    foreach (CALC_GEN_TABLES as $t) {
        if (!in_array($t, $tables, true)) { continue; }
        foreach (['INSERT', 'UPDATE', 'DELETE'] as $op) {
            $name = 'lcnda_gen_' . $t . '_' . strtolower($op);
            $out[$name] = "CREATE TRIGGER {$name} AFTER {$op} ON \"{$t}\" BEGIN UPDATE data_gen SET tok=random() WHERE tbl='{$t}'; END";
        }
    }
    return $out;
}

/**
 * 🛡 Pour drop_unexpected_schema_objects() (lib/bootstrap.php : une base reçue ne garde aucun déclencheur) : ce
 * déclencheur est-il exactement l'un des nôtres (même nom ET même texte, qui ne fait que retirer un jeton) ?
 */
function calc_gen_trigger_allowed(string $name, ?string $sql): bool
{
    static $all = null;
    $all ??= calc_gen_triggers(CALC_GEN_TABLES);
    return isset($all[$name]) && $sql !== null && $all[$name] === $sql;
}

/** La table des jetons et les déclencheurs (migration 100 ; refait sans risque s'il manque quelque chose). */
function calc_gen_install(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS data_gen (tbl TEXT PRIMARY KEY, tok INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID');
    $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    $have = $pdo->query("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND substr(name, 1, 10)='lcnda_gen_'")->fetchAll(PDO::FETCH_KEY_PAIR);
    foreach (calc_gen_triggers($tables) as $name => $sql) {
        if (($have[$name] ?? null) === $sql) { continue; }
        if (isset($have[$name])) { $pdo->exec('DROP TRIGGER IF EXISTS "' . $name . '"'); }
        $pdo->exec($sql);
    }
    foreach (CALC_GEN_TABLES as $t) {
        if (in_array($t, $tables, true)) { $pdo->prepare('INSERT OR IGNORE INTO data_gen(tbl, tok) VALUES(?, random())')->execute([$t]); }
    }
}

/**
 * Gros import (des centaines de milliers de lignes) : les déclencheurs ralentiraient chaque ligne (journal d'instruction) ;
 * retirés pendant l'import, DANS sa transaction (une annulation les remet), puis calc_gen_resume() les remet et retire
 * tous les jetons. Oubli ou plantage entre les deux : calc_gen_ok() le voit à la requête suivante et fait de même.
 */
function calc_gen_suspend(PDO $pdo): void
{
    try { foreach ($pdo->query("SELECT name FROM sqlite_master WHERE type='trigger' AND substr(name, 1, 10)='lcnda_gen_'")->fetchAll(PDO::FETCH_COLUMN) as $n) { $pdo->exec('DROP TRIGGER IF EXISTS "' . str_replace('"', '""', (string) $n) . '"'); } }
    catch (Throwable $_) {}
}
function calc_gen_resume(PDO $pdo): void
{
    try { calc_gen_install($pdo); $pdo->exec('UPDATE data_gen SET tok=random()'); } catch (Throwable $_) {}
}

/** Les déclencheurs attendus sont-ils tous là ? (sinon : recréés, et tous les jetons retirés) — une fois par requête */
function calc_gen_ok(PDO $pdo): bool
{
    static $ok = [];
    $k = spl_object_id($pdo);
    if (isset($ok[$k])) { return $ok[$k]; }
    try {
        $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
        $want = calc_gen_triggers($tables);
        $have = $pdo->query("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND substr(name, 1, 10)='lcnda_gen_'")->fetchAll(PDO::FETCH_KEY_PAIR);
        $rows = in_array('data_gen', $tables, true) ? (int) $pdo->query('SELECT count(*) FROM data_gen')->fetchColumn() : -1;
        ksort($want); ksort($have);
        if ($have !== $want || $rows !== count($want) / 3) {
            $pdo->beginTransaction();
            try {
                calc_gen_install($pdo);
                $pdo->exec('UPDATE data_gen SET tok=random()');
                $pdo->commit();
            } catch (Throwable $e) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $e; }
        }
        return $ok[$k] = true;
    } catch (Throwable $_) {
        return $ok[$k] = false; // base en lecture seule, verrouillée… : pas de calcul gardé
    }
}

/** La signature des tables $tables (leurs jetons), ou null si on ne peut pas s'y fier. */
function calc_gen_sig(PDO $pdo, array $tables): ?string
{
    if (!calc_gen_ok($pdo)) { return null; }
    try {
        // ⚖️ une lecture filtrée (succ_shadow_filter : tables temporaires du même nom qui cachent les vraies) : jamais gardée
        if ((int) $pdo->query("SELECT count(*) FROM temp.sqlite_master WHERE type IN ('table','view')")->fetchColumn() > 0) {
            $shadow = array_intersect($tables, $pdo->query("SELECT name FROM temp.sqlite_master WHERE type IN ('table','view')")->fetchAll(PDO::FETCH_COLUMN));
            if ($shadow) { return null; }
        }
        $tok = $pdo->query('SELECT tbl, tok FROM data_gen')->fetchAll(PDO::FETCH_KEY_PAIR);
    } catch (Throwable $_) { return null; }
    $out = [];
    foreach ($tables as $t) {
        if (!in_array($t, CALC_GEN_TABLES, true)) { return null; } // une table non suivie : pas de cache possible
        $out[] = $t . '=' . ($tok[$t] ?? 'absente');
    }
    return implode(',', $out);
}

/** la version du code (une mise à jour de l'app refait les calculs gardés) : dates des fichiers PHP de l'app */
function calc_code_sig(): string
{
    static $sig = null;
    if ($sig !== null) { return $sig; }
    $root = dirname(__DIR__); $m = 0; $n = 0;
    foreach (array_merge([$root . '/api.php'], glob(__DIR__ . '/*.php') ?: []) as $f) { $m = max($m, (int) @filemtime($f)); $n++; }
    return $sig = $m . '.' . $n;
}

/**
 * Le résultat de $fn, gardé tant que les tables $tables ne changent pas et que $extra (langue, date du jour, mode
 * consultation, paramètres…) est le même. $name : un nom de fichier court. Sans cache possible : $fn() simplement.
 */
function calc_cached(PDO $pdo, string $name, array $tables, array $extra, callable $fn, bool $store = true): mixed
{
    $sig = calc_gen_sig($pdo, $tables);
    if ($sig === null || !defined('DATA_DIR')) { return $fn(); }
    $extra = [$extra, calc_code_sig(), function_exists('i18n_lang') ? i18n_lang() : '']; // la langue de la page : les textes du résultat
    $sig = md5(json_encode([$sig, $extra, CALC_CACHE_VERSION]));
    $file = DATA_DIR . '/cache/calc-' . preg_replace('/[^a-z0-9_-]+/i', '_', $name) . '.ser';
    // le fichier : la signature (32 caractères), un saut de ligne, puis « S » + serialize, ou « Z » + un long texte compressé
    if (is_file($file) && ($fh = @fopen($file, 'rb'))) {
        $head = (string) fread($fh, 34); // la signature d'abord : un fichier d'un autre état n'est ni lu en entier ni désérialisé
        $body = strlen($head) === 34 && substr($head, 0, 32) === $sig ? (string) stream_get_contents($fh) : null;
        fclose($fh);
        if ($body !== null && $head[33] === 'Z') { $txt = @gzinflate($body); if (is_string($txt)) { return $txt; } }
        if ($body !== null && $head[33] === 'S') {
            $c = @unserialize($body, ['allowed_classes' => false]);
            if (is_array($c) && array_key_exists('v', $c)) { return $c['v']; }
        }
    }
    $v = $fn();
    // relu après le calcul : si la base a changé pendant ce temps, le résultat n'est pas gardé
    $after = calc_gen_sig($pdo, $tables);
    if ($store && $after !== null && md5(json_encode([$after, $extra, CALC_CACHE_VERSION])) === $sig) {
        $dir = dirname($file);
        if (is_dir($dir) || @mkdir($dir, 0775, true)) {
            $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
            // un long texte (une réponse déjà encodée de plusieurs Mo) : compressé, 5 à 8 fois moins de place sur le disque
            $data = is_string($v) && strlen($v) > 1 << 20 && function_exists('gzdeflate') ? 'Z' . gzdeflate($v, 1) : 'S' . serialize(['v' => $v]);
            if (@file_put_contents($tmp, $sig . "\n" . $data) !== false) { @rename($tmp, $file); } else { @unlink($tmp); }
        }
    }
    return $v;
}

/**
 * Pour une action qui répond elle-même (json_response… puis exit) : la réponse gardée telle quelle tant que les tables
 * $tables ne changent pas. Gardée : renvoyée tout de suite. Sinon $run() répond comme avant, et sa réponse est notée à la
 * sortie (seulement une réponse JSON réussie, et si la base n'a pas changé pendant le calcul).
 */
function calc_cached_response(PDO $pdo, string $name, array $tables, array $extra, callable $run): never
{
    $sig0 = calc_gen_sig($pdo, $tables);
    if ($sig0 === null || !defined('DATA_DIR')) { $run(); exit; }
    // calc_cached() avec un calcul qui ne doit pas tourner ici : on lit seulement (le « calcul » renvoie une marque)
    $mark = "\0calc-miss";
    $v = calc_cached($pdo, $name, $tables, $extra, static fn() => $mark, false);
    if (is_string($v) && $v !== $mark) { json_response_encoded($v); }
    ob_start(static function (string $buf, int $phase) use ($pdo, $name, $tables, $extra, $sig0) {
        if (($phase & PHP_OUTPUT_HANDLER_FINAL) && http_response_code() === 200 && $buf !== '' && ($buf[0] === '{' || $buf[0] === '[') && calc_gen_sig($pdo, $tables) === $sig0) {
            try { calc_cached($pdo, $name, $tables, $extra, static fn() => $buf); } catch (Throwable $_) {}
        }
        return $buf;
    }, 0);
    $run();
    exit;
}
