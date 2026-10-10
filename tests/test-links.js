'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/heritage_links.php :   npm run test:links
 * Question en français, langues (héritées par la descendance), liens @, citation détaillée, demande d'entraide,
 * compagnons de voyage.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-links-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php'); $a = strpos($src, 'function person_select'); $b = strpos($src, "\n}\n", $a); eval(substr($src, $a, $b - $a + 3));
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Moi','Durand','male',1),('Jean','Durand','male',0),('Marie','Le Gall','female',0),('Yves','Le Gall','male',0),('Paul','Martin','male',0)");
$pdo->exec("UPDATE persons SET occupation='boulanger' WHERE id=2");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(2,3)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1)");
$pdo->exec("INSERT INTO families(partner1_id) VALUES(4)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(2,3)");
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude) VALUES('Lille','Nord','France',50.63,3.06),('Quimper','Finistère','France',48.0,-4.1)");
$birt = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',2,$birt,'12 mars 1800',1800,1),('person',1,$birt,'5 juin 1990',1990,1),('person',5,$birt,'5 juin 1850',1850,1),('person',4,$birt,'1770',1770,2)");
$out = [];
$q = ask_question($pdo, 'Quels ancêtres étaient boulangers à Lille avant 1850 ?');
$out['q1'] = [array_column($q['people'], 'id'), $q['understood']];
$out['q2'] = array_column(ask_question($pdo, 'Qui est né le même jour que moi ?')['people'], 'id');
save_person_language($pdo, ['person_id' => 4, 'language' => 'Breton', 'certainty' => 'certain']);
$out['lang_moi'] = array_column(person_languages_resolved($pdo, 1)['inherited'], 'language');
set_no_inherited_language($pdo, ['person_id' => 2, 'value' => 1]);
$out['lang_jean'] = array_column(person_languages_resolved($pdo, 2)['inherited'], 'language');
$out['overview'] = count(languages_overview($pdo)['languages'][0]['people']);
save_record_languages($pdo, ['entity_type' => 'event', 'entity_id' => 1, 'languages' => [['language' => 'latin'], ['language' => 'Flamand', 'certainty' => 'doute']]]);
$out['rec'] = record_languages_for($pdo, 'event', [1])[1];
$pdo->exec("INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',5,'Voisin','Il habitait à côté de @[Jean Durand|2] en 1820.')");
$out['mentions'] = array_column(person_mentions($pdo, 2), 'kind');
$out['ref'] = citation_reference(['archive' => 'AD Nord', 'commune' => 'Halluin', 'register' => 'naissances', 'years' => '1802-1812', 'cote' => '3 E 12345', 'view' => '87', 'view_total' => '240', 'act' => '45']);
$msg = help_request_message($pdo, 2, 'parents', '', 'forum');
$out['help'] = [str_contains($msg, 'Jean Durand'), str_contains($msg, 'Ce que je sais'), str_contains($msg, 'Lille')];
$v = save_voyage($pdo, ['person_id' => 2, 'departure_port' => 'Le Havre', 'companion_people' => [['person_id' => 3, 'naturalization_date' => '1890'], ['person_id' => 1]]]);
$out['voyage'] = [count(voyages_data($pdo, 3)), voyages_data($pdo, 2)[0]['companion_people'][0]['naturalization_date']];
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['question : ancêtres boulangers à Lille avant 1850', () => { assert.deepEqual(out.q1[0], [2]); assert.ok(out.q1[1].some(u => u.includes('boulanger'))); }],
  ['question : né le même jour que moi', () => assert.deepEqual(out.q2, [5])],
  ['langue héritée d’un arrière-grand-parent', () => assert.deepEqual(out.lang_moi, ['breton'])],
  ['refus explicite de l’héritage', () => assert.deepEqual(out.lang_jean, [])],
  ['carte des langues : locuteurs déclarés et hérités', () => assert.ok(out.overview >= 2)],
  ['langues d’un acte avec certitude', () => assert.deepEqual(out.rec, [{ language: 'latin', certainty: 'certain' }, { language: 'flamand', certainty: 'doute' }])],
  ['« Cité dans » : note qui cite la fiche avec @', () => assert.deepEqual(out.mentions, ['note'])],
  ['référence de source rédigée', () => assert.equal(out.ref, 'AD Nord, Halluin, naissances 1802-1812, 3 E 12345, vue 87/240, acte n° 45')],
  ['demande d’entraide rédigée', () => assert.deepEqual(out.help, [true, true, true])],
  ['voyage commun : sur la fiche du compagnon, naturalisation par personne', () => assert.deepEqual(out.voyage, [1, '1890'])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
