'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de la fusion de deux fiches (api.php merge_people) :   npm run test:merge
 * Tout ce qui appartient à la fiche fusionnée doit passer sur la fiche gardée.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-merge-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
require 'tests/api_functions.php';
$out = [];
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender) VALUES(1,'Jean','Durand','male'),(2,'Jean','Durant','male'),(3,'Marie','Le Gall','female'),(4,'Paul','Durand','male'),(5,'Lucie','Durand','female')");
$pdo->exec("INSERT INTO name_variants(person_id,type,first_name,last_name) VALUES(2,'aka','Jehan','Durant')");
$bapm = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,year) VALUES('person',4,$bapm,1800)");
$pdo->exec("INSERT INTO event_witnesses(event_id,person_id) VALUES(1,2)");
$pdo->exec("INSERT INTO person_online_sheets(person_id,label,url) VALUES(2,'Geneanet','https://x')");
$pdo->exec("INSERT INTO person_languages(person_id,language) VALUES(2,'breton')");
$pdo->exec("INSERT INTO resistance_profiles(person_id,network) VALUES(2,'Alliance')");
$pdo->exec("UPDATE persons SET show_resistance_block=1 WHERE id=2");
// même couple dans les deux fiches : Jean x Marie, un enfant chacun
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(10,1,3),(11,2,3)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(10,4),(11,5)");
rebuild_search($pdo,1); rebuild_search($pdo,2); rebuild_search($pdo,1);
$pdo->beginTransaction(); merge_people($pdo, ['target_id' => 1, 'source_id' => 2]); $pdo->commit();
$out['variants'] = $pdo->query("SELECT count(*) FROM name_variants WHERE person_id=1")->fetchColumn();
$out['witness'] = $pdo->query("SELECT person_id FROM event_witnesses")->fetchColumn();
$out['sheet'] = $pdo->query("SELECT person_id FROM person_online_sheets")->fetchColumn();
$out['lang'] = $pdo->query("SELECT person_id FROM person_languages")->fetchColumn();
$out['resistance'] = [$pdo->query("SELECT person_id FROM resistance_profiles")->fetchColumn(), $pdo->query("SELECT show_resistance_block FROM persons WHERE id=1")->fetchColumn()];
$out['families'] = $pdo->query("SELECT id FROM families ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
$out['children'] = $pdo->query("SELECT child_id FROM family_children WHERE family_id=10 ORDER BY child_id")->fetchAll(PDO::FETCH_COLUMN);
$out['search'] = $pdo->query("SELECT count(*) FROM person_search WHERE person_id IN (1,2)")->fetchColumn();
$pdo->exec("UPDATE persons SET is_locked=1 WHERE id=5");
try { merge_people($pdo, ['target_id' => 1, 'source_id' => 5]); $out['locked'] = 'fusionnée'; } catch (Throwable $e) { $out['locked'] = 'refusée'; }
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['variantes de nom gardées (la sienne + le nom d’avant fusion)', () => assert.equal(Number(out.variants), 2)],
  ['témoin d’un acte et fiche en ligne passés sur la fiche gardée', () => { assert.equal(Number(out.witness), 1); assert.equal(Number(out.sheet), 1); }],
  ['langue et parcours de résistant gardés, avec la case du bloc', () => { assert.equal(Number(out.lang), 1); assert.deepEqual(out.resistance.map(Number), [1, 1]); }],
  ['même couple : une seule famille, avec les enfants des deux', () => { assert.deepEqual(out.families.map(Number), [10]); assert.deepEqual(out.children.map(Number), [4, 5]); }],
  ['index de recherche : une ligne, la fiche fusionnée retirée', () => assert.equal(Number(out.search), 1)],
  ['fiche verrouillée : fusion refusée', () => assert.equal(out.locked, 'refusée')],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
