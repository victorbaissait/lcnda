'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Poser une question avec un lieu :   npm run test:question-lieu
 * « Quel est l'âge moyen au mariage des femmes à Pernay ? » : seuls les mariages célébrés à Pernay ; deux villes « Pernay » avec des actes → laquelle ?
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-qlieu-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
require 'tests/api_functions.php';
$pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(name,subdivision,country) VALUES('Pernay','Indre-et-Loire','France'),('Pernay','Sarthe','France'),('Tours','Indre-et-Loire','France'),('Pernay','Indre-et-Loire','France')");
// femmes (née en 1800) et hommes ; mariages : 2 à Pernay (37) à 20 et 24 ans, 1 à Pernay (72) à 30 ans, 1 à Tours à 40 ans
$people = [['Anne','A','female'],['Paul','A','male'],['Marie','B','female'],['Jean','B','male'],['Rose','C','female'],['Luc','C','male'],['Lise','D','female'],['Marc','D','male']];
foreach ($people as [$f,$l,$g]) { $pdo->prepare('INSERT INTO persons(first_name,last_name,gender) VALUES(?,?,?)')->execute([$f,$l,$g]); }
foreach ([1,3,5,7] as $w) { $pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',$w,{$t('BIRT')},'01/01/1800',1800)"); }
foreach ([2,4,6,8] as $h) { $pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',$h,{$t('BIRT')},'01/01/1795',1795)"); }
$marr = [[1,2,1820,1],[3,4,1824,4],[5,6,1830,2],[7,8,1840,3]];
foreach ($marr as $i => [$w,$h,$y,$pl]) { $pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES($h,$w)"); $fid = (int) $pdo->lastInsertId(); $pdo->exec("INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES('family',$fid,{$t('MARR')},'01/01/$y',$y,$pl)"); }
$o = [];
$q = 'Quel est l’âge moyen au mariage des femmes à Pernay ?';
$a = ask_question($pdo, $q);
$o['ask'] = [$a['answer'], array_map(fn($c) => [$c['label'], $c['n']], $a['place_choices'] ?? [])];
$key37 = $a['place_choices'][0]['label'] === 'Pernay (Indre-et-Loire)' ? $a['place_choices'][0]['key'] : $a['place_choices'][1]['key'];
$b = ask_question($pdo, $q, 0, $key37);
$o['p37'] = [$b['answer'], $b['understood']];
$c = ask_question($pdo, 'Quel est l’âge moyen au mariage des femmes à Tours ?');
$o['tours'] = $c['answer'];
$d = ask_question($pdo, 'Quel est l’âge moyen au mariage des femmes ?');
$o['all'] = $d['answer'];
echo json_encode($o, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['deux villes « Pernay » avec des actes : la question demande laquelle (les deux fiches de Pernay 37 réunies)', () => { assert.match(out.ask[0], /laquelle/); assert.deepEqual(out.ask[1].map(c => c[0]).sort(), ['Pernay (Indre-et-Loire)', 'Pernay (Sarthe)']); assert.deepEqual(out.ask[1].find(c => c[0] === 'Pernay (Indre-et-Loire)')[1], 2); }],
  ['Pernay (Indre-et-Loire) choisie : seulement les mariages célébrés là (20 et 24 ans → 22)', () => { assert.match(out.p37[0], /^Âge moyen au premier mariage : 22,0 ans/); assert.ok(out.p37[1].includes('à Pernay (Indre-et-Loire)')); }],
  ['une seule ville de ce nom : pas de question, le lieu est pris (Tours → 40 ans)', () => assert.match(out.tours, /^Âge moyen au premier mariage : 40,0 ans/)],
  ['sans lieu : toutes les femmes (20, 24, 30, 40 → 28,5)', () => assert.match(out.all, /^Âge moyen au premier mariage : 28,5 ans/)],
];
let failed = 0;
for (const [label, fn] of checks) { try { fn(); console.log('✓', label); } catch (e) { failed++; console.error('✗', label, '\n  ', e.message, JSON.stringify(out)); } }
fs.rmSync(dir, { recursive: true, force: true });
if (failed) { console.error(`${failed} échec(s).`); process.exit(1); }
console.log(`${checks.length} vérifications réussies.`);
