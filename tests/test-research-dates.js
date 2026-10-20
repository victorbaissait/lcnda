'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des dates précises des recherches (Recherche › Dates et Proximité) :   npm run test:research-dates
 * Les dates d'actes sont lues au jour près quelle que soit leur écriture ; date élargie, entre deux dates, date impossible.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-dates-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
require 'tests/api_functions.php';
$ev = fn($text, $cal = 'gregorian', $conv = '') => ['date_text' => $text, 'date_calendar' => $cal, 'date_converted' => $conv];
$events = ['a' => $ev('24/08/1770'), 'b' => $ev('18 novembre 1792'), 'c' => $ev('24 AUG 1770'), 'd' => $ev('1770-08-30'), 'e' => $ev('août 1770'), 'f' => $ev('1770'),
  'g' => $ev('3 fructidor an II', 'french_r', '20 août 1794'), 'h' => $ev('1er septembre 1770')];
$keep = function (array $windows) use ($events) { $out = []; foreach ($events as $k => $e) if (research_events_in_windows([$e], $windows)) $out[] = $k; return $out; };
$o = [];
[$w, $l, $i] = research_date_windows(['24/08/1770'], 'exact', 0); $o['exact'] = [$keep($w), $l, $i];
[$w, $l, $i] = research_date_windows(['24/08/1770'], 'after', 10); $o['after'] = [$keep($w), $l];
[$w, $l, $i] = research_date_windows(['24 août 1770'], 'both', 8); $o['both'] = [$keep($w), $l];
[$w, $l, $i] = research_date_windows(['01/09/1770'], 'exact', 0, '01/01/1795'); $o['between'] = [$keep($w), $l];
[$w, $l, $i] = research_date_windows(['01/01/1795'], 'exact', 0, '01/09/1770'); $o['between_inverse'] = $l;
[$w, $l, $i] = research_date_windows(['30/19/1836'], 'after', 100); $o['invalid'] = [count($w), $i];
[$w, $l, $i] = research_date_windows(['30/02/1988', '20 août 1794'], 'exact', 0); $o['several'] = [$l, $i, $keep($w)];
$o['year_where'] = research_windows_year_where(research_date_windows(['01/12/1770'], 'exact', 0, '02/01/1772')[0])[1];
echo json_encode($o, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['date précise : 24/08/1770, 24 AUG 1770 (GEDCOM) ; pas « août 1770 » ni « 1770 »', () => assert.deepEqual(out.exact, [['a', 'c'], '24/08/1770', []])],
  ['élargie après de 10 jours', () => assert.deepEqual(out.after, [['a', 'c', 'd', 'h'], '24/08/1770 — 03/09/1770'])],
  ['date écrite en toutes lettres, élargie avant et après', () => assert.deepEqual(out.both, [['a', 'c', 'd', 'h'], '16/08/1770 — 01/09/1770'])],
  ['entre deux dates : écritures diverses et calendrier républicain converti', () => assert.deepEqual(out.between, [['b', 'g', 'h'], 'du 01/09/1770 au 01/01/1795'])],
  ['entre deux dates données à l’envers : remises dans l’ordre', () => assert.equal(out.between_inverse, 'du 01/09/1770 au 01/01/1795')],
  ['date impossible (30/19/1836) : signalée, pas de recherche sur une autre période', () => assert.deepEqual(out.invalid, [0, ['30/19/1836']])],
  ['plusieurs dates, dont une impossible (30 février)', () => assert.deepEqual(out.several, ['20/08/1794', ['30/02/1988'], ['g']])],
  ['années couvertes pour le pré-filtre', () => assert.deepEqual(out.year_where, [1770, 1772])],
];
let failed = 0;
for (const [label, fn] of checks) { try { fn(); console.log('✓', label); } catch (e) { failed++; console.error('✗', label, '\n  ', e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
if (failed) { console.error(`${failed} échec(s).`); process.exit(1); }
console.log(`${checks.length} vérifications réussies.`);
