'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/village.php :   npm run test:village
 * Communes regroupées (hameaux du même code INSEE), familles, métiers dominants, populations, paroisse.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-village-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php');
foreach (['function person_select', 'function set_label_links', 'function labels_for_entity', 'function allowed_label_entity_types'] as $fn) { $a = strpos($src, $fn); $b = strpos($src, "\n}\n", $a); if (!function_exists(substr($fn, 9))) eval(substr($src, $a, $b - $a + 3)); }
$out = ['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()];
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude,admin4_code,population) VALUES('Saint-Yrieix','Haute-Vienne','France',45.5,1.2,'87187',6800),('Le Moulin','Haute-Vienne','France',45.51,1.21,'87187',0),('Lille','Nord','France',50.6,3.0,'59350',230000),('Lieu-sans-code','Corrèze','France',45.2,1.8,'',0),('Étampes','Essonne','France',48.4,2.1,'',0)");
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,occupation) VALUES('Jean','Dupont','male','laboureur'),('Pierre','DUPONT','male','Laboureur'),('Marie','Dupond','female',''),('Paul','Martin','male','meunier'),('Luc','Petit','male','tisserand')");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES
  ('person',1,{$t('BIRT')},'1750',1750,1),('person',2,{$t('BIRT')},'1780',1780,2),('person',3,{$t('DEAT')},'1820',1820,1),('person',4,{$t('BURI')},'1800',1800,2),('person',5,{$t('BIRT')},'1850',1850,3),('person',5,{$t('RESI')},'1880',1880,4),('person',5,{$t('DEAT')},'1890',1890,5)");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(4,3)");
$pdo->exec("INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES('family',1,{$t('MARR')},'1790',1790,1)");
$list = villages_list($pdo);
$out['list'] = array_map(fn($v) => [$v['key'], $v['name'], $v['persons'], $v['places']], $list);
$out['search'] = array_column(villages_list($pdo, 'yrieix'), 'key');
$v = village_detail($pdo, '87187');
$out['families'] = array_map(fn($f) => [$f['name'], $f['count'], $f['from'], $f['to']], $v['families']);
$out['jobs'] = array_map(fn($j) => [$j['name'], $j['count']], $v['jobs']);
$out['acts'] = $v['acts'];
$out['bytype'] = array_map(fn($t) => [$t['label'], $t['total']], $v['decades_by_type']);
$out['current'] = $v['current_population'];
$out['pop'] = parse_populations("1793 : 1 450\n1806 = 1512 hab.\nsans chiffre\n1836 ; 1 604");
$saved = save_village_profile($pdo, ['key' => '87187', 'name' => 'Saint-Yrieix', 'church' => 'Collégiale du Moûtier', 'patron_saint' => 'saint Yrieix', 'populations_text' => "1793 : 1450\n1806 : 1512", 'pending_labels' => []]);
apply_pending_labels($pdo, 'save_village_profile', ['pending_labels' => []], $saved);
$out['profile'] = [village_detail($pdo, '87187')['profile']['church'], count(village_detail($pdo, '87187')['profile']['populations'])];
$fr = '<div class="mw-heading mw-heading3"><h3 id="Démographie">Démographie</h3></div><div class="mw-heading mw-heading4"><h4 id="Évolution_démographique">Évolution démographique</h4></div><p>Texte</p><table class="wikitable"><tbody><tr><th colspan="3">Évolution de la population</th></tr><tr><th>1793</th><th>1800</th><th>1806</th></tr><tr><td>4&#160;520</td><td>4&#160;612<sup class="reference">[1]</sup></td><td>—</td></tr><tr><th>2016</th><th>2021</th><th>2022</th></tr><tr><td>20&#8239;953</td><td>21&#160;002</td><td>21&#160;104</td></tr></tbody></table><div class="mw-heading mw-heading4"><h4 id="Pyramide_des_âges">Pyramide des âges</h4></div><table><tr><td>1990</td><td>12,5</td></tr></table>';
$out['wiki_fr'] = village_parse_population_html($fr);
$en = '<h2 id="Demographics">Demographics</h2><table class="toccolours"><tr><th>Year</th><th>Pop.</th><th>±%</th></tr><tr><td>1850</td><td>1,204</td><td>—</td></tr><tr><td>1900</td><td>2,310</td><td>+91.9%</td></tr></table><h2 id="Notes">Notes</h2><table><tr><td>1950</td><td>999</td></tr></table>';
$out['wiki_en'] = village_parse_population_html($en);
$out['wiki_none'] = village_parse_population_html('<h2 id="Histoire">Histoire</h2><table><tr><th>1793</th><th>1800</th></tr><tr><td>1</td><td>2</td></tr></table>');
save_village_populations($pdo, ['key' => '87187', 'name' => 'Saint-Yrieix', 'populations' => [[1806, 1600], [1999, 7000]], 'source' => 'https://fr.wikipedia.org/wiki/Saint-Yrieix-la-Perche']);
$pp = village_detail($pdo, '87187')['profile'];
$out['wiki_saved'] = [$pp['populations'], $pp['population_source'], $pp['church']];
$out['nocode'] = village_detail($pdo, 'n:lieu-sans-code|corrèze')['families'][0]['name'] ?? null;
$out['accent'] = village_detail($pdo, 'n:étampes|essonne')['name'];
try { village_detail($pdo, '00000'); $out['missing'] = 'trouvé'; } catch (Throwable $e) { $out['missing'] = 'refusé'; }
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['structure à jour (n°26)', () => assert.equal(out.version, 26)],
  ['Wikipédia (fr) : années puis habitants, notes et espaces enlevés, la pyramide des âges ignorée', () => assert.deepEqual(out.wiki_fr, [[1793, 4520], [1800, 4612], [2016, 20953], [2021, 21002], [2022, 21104]])],
  ['Wikipedia (en) : année | habitants', () => assert.deepEqual(out.wiki_en, [[1850, 1204], [1900, 2310]])],
  ['pas de section démographie → rien', () => assert.deepEqual(out.wiki_none, [])],
  ['chiffres récupérés fusionnés avec ceux saisis, source gardée, le reste de la fiche intact', () => assert.deepEqual(out.wiki_saved, [[[1793, 1450], [1806, 1600], [1999, 7000]], 'https://fr.wikipedia.org/wiki/Saint-Yrieix-la-Perche', 'Collégiale du Moûtier'])],
  ['communes : hameaux du même code regroupés, la plus peuplée de la famille d’abord', () => assert.deepEqual(out.list[0], ['87187', 'Saint-Yrieix', 4, 2])],
  ['commune sans code INSEE gardée (nom + département)', () => assert.ok(out.list.some(v => v[0] === 'n:lieu-sans-code|corrèze'))],
  ['recherche sans accents ni majuscules', () => assert.deepEqual(out.search, ['87187'])],
  ['familles : Dupont / DUPONT / Dupond regroupés, période', () => assert.deepEqual(out.families[0], ['Dupont', 3, 1750, 1820])],
  ['métiers dominants', () => assert.deepEqual(out.jobs, [['laboureur', 2], ['meunier', 1]])],
  ['actes de la famille', () => assert.deepEqual(out.acts, { baptemes: 2, mariages: 1, deces: 2 })],
  ['actes par sorte : naissances, mariages, décès d’abord', () => assert.deepEqual(out.bytype, [['Naissances et baptêmes', 2], ['Mariages', 1], ['Décès et sépultures', 2]])],
  ['population actuelle', () => assert.equal(out.current, 6800)],
  ['populations collées', () => assert.deepEqual(out.pop, [[1793, 1450], [1806, 1512], [1836, 1604]])],
  ['fiche du village enregistrée', () => assert.deepEqual(out.profile, ['Collégiale du Moûtier', 2])],
  ['commune sans code : fiche', () => assert.equal(out.nocode, 'Petit')],
  ['commune sans code au nom accentué (Étampes)', () => assert.equal(out.accent, 'Étampes')],
  ['commune inconnue refusée', () => assert.equal(out.missing, 'refusé')],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
