#!/usr/bin/env node
/* 🐘 Deux fichiers PHP ne déclarent jamais la même fonction.
 *  Le bogue d'origine : lib/lieux_doublons.php et un autre fichier déclaraient tous deux ld_fold() et ld_km() → « Cannot redeclare » (erreur
 *  fatale) dès qu'une page chargeait les deux. Pire encore quand l'un est gardé par function_exists() : l'autre fonction, qui ne fait PAS la
 *  même chose, est appelée sans bruit (lib/migrations.php : pf_schema des prénoms ↔ pf_schema des partages).
 *  1. lit api.php et lib/*.php avec le vrai découpeur de PHP (token_get_all : pas les fonctions JS des pages HTML écrites dans le PHP),
 *     garde les fonctions déclarées hors des classes et des fonctions (y compris dans un if (!function_exists(…))) ;
 *  2. aucun nom (sans tenir compte des majuscules, comme PHP) dans deux fichiers, ni deux fois dans le même ;
 *  3. charge TOUS les fichiers lib/ ensemble dans un seul PHP (require_once) : aucune « Cannot redeclare », aucune erreur fatale.
 *   node tests/test-php-fonctions-uniques.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const phpPath = findPhp([devBundledPhp()]) || 'php';
let fails = 0;
const t = (name, fn) => { try { fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 30).join('\n  ')); } };

const files = ['api.php', ...fs.readdirSync(path.join(root, 'lib')).filter(f => f.endsWith('.php')).sort().map(f => 'lib/' + f)];
const php = (code, env = {}) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'display_errors=stderr', '-d', 'memory_limit=1G', '-r', code, ...files], {cwd: root, encoding: 'utf8', env: {...process.env, ...env}, maxBuffer: 64 << 20});

/* les fonctions déclarées hors classe et hors fonction, fichier par fichier : [{name, file, line, guarded}] */
const SCAN = String.raw`
$out = [];
foreach (array_slice($argv, 1) as $f) {
    $toks = token_get_all(file_get_contents($f));
    $stack = []; $pending = null; $prev = null; $n = count($toks);
    for ($i = 0; $i < $n; $i++) {
        $tk = $toks[$i];
        if (is_array($tk)) {
            [$id, $txt, $line] = $tk;
            if (in_array($id, [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) { continue; }
            if (in_array($id, [T_CLASS, T_INTERFACE, T_TRAIT], true) || (defined('T_ENUM') && $id === T_ENUM)) {
                if (!($prev === T_DOUBLE_COLON)) { $pending = 'class'; } // Foo::class n'ouvre rien
            } elseif ($id === T_FUNCTION) {
                if ($prev !== T_USE) {
                    $pending = 'func';
                    for ($j = $i + 1; $j < $n; $j++) { // le nom (function &nom) : sinon c'est une fonction anonyme
                        $x = $toks[$j];
                        if (is_array($x) && in_array($x[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) { continue; }
                        if ($x === '&') { continue; }
                        if (is_array($x) && $x[0] === T_STRING && !in_array('class', $stack, true) && !in_array('func', $stack, true)) {
                            $out[] = ['name' => $x[1], 'file' => $f, 'line' => $line, 'guarded' => in_array('block', $stack, true)];
                        }
                        break;
                    }
                }
            } elseif ($id === T_CURLY_OPEN || $id === T_DOLLAR_OPEN_CURLY_BRACES) { $stack[] = 'str'; }
            $prev = $id;
            continue;
        }
        if ($tk === '{') { $stack[] = $pending ?? 'block'; $pending = null; }
        elseif ($tk === '}') { array_pop($stack); }
        elseif ($tk === ';' && $pending === 'func') { $pending = null; } // function abstraite / d'interface
        $prev = $tk;
    }
}
echo json_encode($out);`;

let decl = [];
t(`le découpeur de PHP lit les ${files.length} fichiers (api.php, lib/*.php) et y trouve les fonctions`, () => {
    const r = php(SCAN);
    assert.strictEqual(r.status, 0, r.stderr);
    decl = JSON.parse(r.stdout);
    assert.ok(decl.length > 3000, 'trop peu de fonctions : ' + decl.length);
    const names = new Set(decl.map(d => d.name));
    for (const n of ['ld_dispatch', 'json_response', 'ld_fold']) assert.ok(names.has(n), 'pas trouvée : ' + n);
    // les fonctions JS écrites dans les pages HTML du PHP ne comptent pas (lib/photo_ask.php : function store(){…} dans du HTML)
    assert.ok(!decl.some(d => d.name === 'store' && d.file === 'lib/photo_ask.php'), 'du JS pris pour du PHP');
});

t('aucune fonction déclarée deux fois (dans deux fichiers, ou deux fois dans le même, même gardée par function_exists)', () => {
    const by = new Map();
    for (const d of decl) { const k = d.name.toLowerCase(); (by.get(k) || by.set(k, []).get(k)).push(d); }
    const dup = [...by.values()].filter(a => a.length > 1).map(a => `${a[0].name} : ` + a.map(d => `${d.file}:${d.line}${d.guarded ? ' (gardée)' : ''}`).join(', '));
    assert.deepStrictEqual(dup, [], 'à renommer dans le fichier le plus récent (et ses appels) :\n' + dup.join('\n'));
});

t('tous les fichiers lib/ chargés ensemble dans un seul PHP : aucune « Cannot redeclare », aucune erreur fatale', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-fonctions-'));
    try {
        const r = php(String.raw`
error_reporting(E_ALL);
chdir(getcwd());
require 'lib/paths.php';
$p0 = new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT . '/data/schema.sql')); $p0 = null;
require_once 'lib/bootstrap.php';
$n = 0;
foreach (array_slice($argv, 1) as $f) {
    if ($f === 'api.php') { continue; } // le point d'entrée : il répond à la requête
    ob_start(); require_once $f; ob_end_clean(); $n++;
}
echo "\nCHARGES:$n\n";`, {GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1'});
        const m = /CHARGES:(\d+)/.exec(r.stdout);
        assert.ok(!/Cannot redeclare|Fatal error/i.test(r.stderr + r.stdout), (r.stderr + r.stdout).split('\n').filter(l => /redeclare|Fatal/i.test(l)).slice(0, 10).join('\n'));
        assert.strictEqual(r.status, 0, r.stderr.slice(0, 2000));
        assert.ok(m && Number(m[1]) === files.length - 1, `fichiers chargés : ${m && m[1]} sur ${files.length - 1}\n${r.stderr.slice(0, 2000)}`);
    } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
});

console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
