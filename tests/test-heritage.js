'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des fiches « patrimoine » (lib/heritage.php) :   npm run test:heritage
 * Base temporaire : voyages, placements, armoiries, poilus, circuits, papiers, cartes anciennes, recherches enregistrées,
 * inventaires après décès, export GEDCOM d'une branche.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-heritage-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php'; require 'lib/gedcom.php';
$pdo = db();
$src = file_get_contents('api.php'); $a = strpos($src, 'function person_select'); $b = strpos($src, "\n}\n", $a); eval(substr($src, $a, $b - $a + 3));
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Dupont','male'),('Marie','Martin','female'),('Paul','Dupont','male'),('Gaston','Dupont','male'),('Rose','Autre','female')");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(1,2),(3,NULL),(1,5)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(2,4)");
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude) VALUES('Lille','Nord','France',50.63,3.06),('Le Havre','Seine-Maritime','France',49.49,0.10),('Québec','Québec','Canada',46.81,-71.21)");
$birt = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$chr = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='CHR' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',1,$chr,'1790',1790,1),('person',3,$birt,'1820',1820,1),('person',4,$birt,'1912',1912,1)");
$out = [];
$out['version'] = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
save_voyage($pdo, ['person_id' => 3, 'departure_port' => 'Le Havre', 'arrival_port' => 'Québec', 'ship_name' => 'La Belle', 'departure_date' => '12 mai 1850']);
$v = voyages_data($pdo, 3)[0]; $out['voyage'] = [$v['departure_year'], count($v['route']), (int) $pdo->query('SELECT show_voyage_block FROM persons WHERE id=3')->fetchColumn()];
save_placement($pdo, ['person_id' => 4, 'place_text' => 'Lille', 'start_date' => '1913-01-01', 'end_date' => '1915-04-02']);
$out['placement'] = placements_data($pdo, 4)[0]['duration'];
save_coat_of_arms($pdo, ['title' => 'Armes', 'blazon' => 'd’azur', 'people' => [1, 3]]);
$out['coat'] = count(coats_of_arms_data($pdo, 3));
$out['poilu'] = count(save_poilu($pdo, ['person_id' => 4, 'units' => [['unit_name' => '152e RI', 'date_from' => '1914-08-02']], 'events' => [['event_date' => '1916-03-02', 'kind' => 'blesse']]])['units']);
$t = save_field_trip($pdo, ['title' => 'Nord', 'people' => [['id' => 4, 'mode' => 'ascendants', 'generations' => 3]], 'generate' => 1]);
$out['trip'] = array_column(field_trip_detail($pdo, $t['id'])['stops'], 'kind');
$resi = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='RESI' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',5,$resi,'1900',1900,2)");
$t2 = save_field_trip($pdo, ['title' => 'Rose', 'people' => [['id' => 5, 'mode' => 'person']], 'generate' => 1]);
$out['trip2'] = array_map(static fn($s) => $s['kind'] . ':' . $s['title'], field_trip_detail($pdo, $t2['id'])['stops']);
$t3 = save_field_trip($pdo, ['title' => 'Vide', 'people' => [['id' => 2, 'mode' => 'person']], 'generate' => 1]);
$out['trip3'] = [$t3['id'] > 0, $t3['warning'] ?? ''];
$out['paper'] = [save_family_paper($pdo, ['title' => 'Livret', 'people' => [1]])['class_number'], count(family_papers_data($pdo, '', 1))];
$out['map'] = save_old_map($pdo, ['title' => 'Plan', 'control_points' => [['u' => 0, 'v' => 0, 'lat' => 50, 'lon' => 3], ['u' => 100, 'v' => 0, 'lat' => 50, 'lon' => 3.1], ['u' => 0, 'v' => 100, 'lat' => 49.9, 'lon' => 3]]])['transform'] !== null;
$crit = ['last_name' => 'Dupont', 'event' => 'birth', 'place' => 'Nord', 'year_to' => 1900];
save_saved_search($pdo, ['name' => 'Dupont du Nord', 'criteria' => $crit]);
$pdo->exec("INSERT INTO persons(first_name,last_name) VALUES('Luc','Dupont')"); $pdo->exec("INSERT INTO events(scope,person_id,event_type_id,year,place_id) VALUES('person',6,$birt,1700,1)");
$out['search'] = [run_saved_search($pdo, $crit), saved_searches_data($pdo)['searches'][0]['new_count']];
$out['amounts'] = [parse_old_amount('12 l 5 s 3 d'), parse_old_amount('152,50')];
save_probate_inventory($pdo, ['person_id' => 1, 'date_text' => '1790', 'items' => [['category' => 'meubles', 'value_text' => '3 l 10 s'], ['category' => 'dettes', 'value_text' => '1 l']]]);
$i = probate_inventories_data($pdo, 1)[0]; $out['probate'] = [$i['total'], $i['net']];
$_GET = ['branch_mode' => 'descendants', 'branch_person' => 1, 'branch_partner' => 2]; $d = array_keys(gedcom_branch_ids($pdo)); sort($d);
$_GET = ['branch_mode' => 'ascendants', 'branch_person' => 4]; $asc = array_keys(gedcom_branch_ids($pdo)); sort($asc);
$out['branch'] = [$d, $asc];
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['structure à jour (n°22)', () => assert.equal(out.version, 22)],
  ['voyage : année, trajet Le Havre → Québec, bloc coché', () => assert.deepEqual(out.voyage, [1850, 2, 1])],
  ['enfant placé : durée calculée', () => assert.equal(out.placement, '2 ans et 3 mois')],
  ['armoiries liées à leurs porteurs', () => assert.equal(out.coat, 1)],
  ['poilu : unités enregistrées', () => assert.equal(out.poilu, 1)],
  ['circuit : une résidence sans adresse donne la commune (et ses archives)', () => assert.deepEqual([...out.trip2].sort(), ['archives:Archives départementales — Seine-Maritime', 'autre:Commune de Le Havre'])],
  ['circuit sans aucun lieu : enregistré quand même, avec une explication', () => { assert.equal(out.trip3[0], true); assert.match(out.trip3[1], /ascendants/); }],
  ['circuit : mairie, église et archives préparées', () => assert.deepEqual([...out.trip].sort(), ['archives', 'eglise', 'mairie'])],
  ['papiers : numéro de classement automatique', () => assert.deepEqual(out.paper, ['P-0001', 1])],
  ['carte ancienne calée avec 3 points', () => assert.equal(out.map, true)],
  ['recherche enregistrée : résultats et nouvelle fiche signalée', () => { assert.deepEqual(out.search[0].sort(), [1, 3, 6]); assert.equal(out.search[1], 1); }],
  ['montants anciens (livres, sols, deniers)', () => assert.deepEqual(out.amounts, [12.2625, 152.5])],
  ['inventaire après décès : total et net', () => assert.deepEqual(out.probate, [3.5, 2.5])],
  ['GEDCOM d’une branche : descendants du couple seulement, ascendants', () => assert.deepEqual(out.branch, [[1, 2, 3, 4], [1, 2, 3, 4]])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
