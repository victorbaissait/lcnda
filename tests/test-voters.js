'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/voters.php :   npm run test:voters
 * Cartes d'électeur, dates de vote, liste des électeurs, données du droit de vote dans le monde.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-voters-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php');
foreach (['function person_select', 'function set_label_links', 'function allowed_label_entity_types'] as $fn) { $a = strpos($src, $fn); $b = strpos($src, "\n}\n", $a); if (!function_exists(substr($fn, 9))) eval(substr($src, $a, $b - $a + 3)); }
$out = ['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()];
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Marie','Durand','female'),('Jean','Durand','male')");
$r = save_voter_cards($pdo, ['person_id' => 1, 'cards' => [['commune' => 'Halluin', 'issued' => '3 mars 1945', 'card_number' => '1234', 'bureau' => '2', 'lat' => '50.78', 'lon' => '3.12'], ['commune' => '', 'note' => '']],
    'votes' => [['date_text' => '29 avril 1945', 'election' => 'municipales', 'round' => '1'], ['date_text' => '21 octobre 1945', 'election' => 'referendum'], ['date_text' => '', 'election' => 'inconnue'], ['date_text' => 'vers 1950', 'election' => 'pirate']]]);
$out['saved'] = $r;
$d = voter_data($pdo, 1);
$out['card'] = [$d['cards'][0]['commune'], $d['cards'][0]['card_number'], (float) $d['cards'][0]['lat']];
$out['votes'] = array_map(fn($v) => [$v['year'], $v['election'], $v['election_label'], (int) $v['round']], $d['votes']);
$out['flag'] = (int) $pdo->query('SELECT show_voter_block FROM persons WHERE id=1')->fetchColumn();
$pdo->exec("INSERT INTO media(title,filename,media_type,media_subject_type) VALUES('Carte de Jean','jean.jpg','image','voter_card')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'person',2)");
$ov = voter_overview($pdo);
$out['overview'] = array_map(fn($x) => [(int) $x['person']['id'], count($x['cards']), count($x['votes']), $x['first'], count($x['media'])], $ov);
$out['heritage'] = isset(heritage_person_data($pdo, 1)['voter']['cards']);
clear_voter_cards($pdo, ['person_id' => 1]);
$out['cleared'] = count(voter_data($pdo, 1)['cards']) + count(voter_data($pdo, 1)['votes']);
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const suffrage = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/data/suffrage.json'), 'utf8'));
const world = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/data/world-110m.json'), 'utf8'));
const byId = Object.fromEntries(suffrage.countries.map(c => [c.id, c]));
const checks = [
  ['structure à jour (n°25)', () => assert.equal(out.version, 25)],
  ['cartes et votes enregistrés, lignes vides ignorées', () => assert.deepEqual(out.saved, { cards: 1, votes: 3 })],
  ['carte : commune, numéro, coordonnées', () => assert.deepEqual(out.card, ['Halluin', '1234', 50.78])],
  ['votes : année tirée de la date, élection inconnue refusée', () => assert.deepEqual(out.votes, [[1945, 'municipales', 'Municipales', 1], [1945, 'referendum', 'Référendum', 0], [1950, '', 'Vote', 0]])],
  ['le bloc s’affiche sur la fiche après l’enregistrement', () => assert.equal(out.flag, 1)],
  ['liste : les médias « Carte d’électeur » d’une fiche comptent aussi', () => assert.deepEqual(out.overview, [[1, 1, 3, 1945, 0], [2, 0, 0, null, 1]])],
  ['données de la fiche', () => assert.ok(out.heritage)],
  ['effacer', () => assert.equal(out.cleared, 0)],
  ['droit de vote : France 1848 / 1944, Suisse 1971 et ses 26 cantons', () => { assert.equal(byId['250'].women, 1944); assert.equal(byId['250'].men, 1848); assert.equal(byId['756'].women, 1971); assert.equal(byId['756'].subdivisions.length, 26); assert.equal(byId['756'].subdivisions.find(c => c.name === 'Appenzell Rhodes-Intérieures').women, 1990); }],
  ['codes pays uniques et années plausibles', () => { assert.equal(new Set(suffrage.countries.map(c => c.id)).size, suffrage.countries.length); suffrage.countries.forEach(c => { [c.men, c.women].forEach(y => assert.ok(y === null || (y >= 1840 && y <= 2025), c.name)); }); }],
  ['carte du monde : la plupart des pays ont une date', () => assert.ok(world.countries.filter(c => byId[c.id]).length / world.countries.length > 0.9)],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
