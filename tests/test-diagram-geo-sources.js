'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🗺️ Les sources de chiffres de « Les lieux de ton arbre » (lib/diagram_cartes.php, api diagram_geo) :
 *     node tests/test-diagram-geo-sources.js
 * Baptêmes seuls, sépultures seules, résidences, recensements (membres + événements), métiers, départs et arrivées,
 * personnes et patronymes différents, âge moyen au décès (moyenne + nombre de personnes), actes avec une source ou un
 * document, n'importe quelle sorte d'événement ; filtre « mes ancêtres » et période sur chacune ; sortes inconnues.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-geo-sources-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
require 'tests/api_functions.php';
require_once 'lib/research.php'; require_once 'lib/diagram_cartes.php';
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
// lieux : 1 Rennes, 2 Paris, 3 Nantes, 4 Brest
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude) VALUES('Rennes','Ille-et-Vilaine','France',48.11,-1.68),('Paris','Paris','France',48.85,2.35),('Nantes','Loire-Atlantique','France',47.21,-1.55),('Brest','Finistère','France',48.39,-4.48)");
// 1 Moi (racine), 2 Père, 3 Mère, 4 Cousin, 5 Cousine
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Moi','Martin','male',1),('Père','Martin','male',0),('Mère','Durand','female',0),('Cousin','Le Goff','male',0),('Cousine','LE GOFF','female',0)");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(2,3),(4,5)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1)");
$ev = function ($pid, $tag, $y, $pl, $sort = null, $fam = null) use ($pdo, $t) {
  $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,year,date_text,sort_date,place_id) VALUES(?,?,?,?,?,?,?,?)')->execute([$fam ? 'family' : 'person', $fam ? null : $pid, $fam, $t($tag), $y, (string) $y, $sort, $pl]);
  return (int) $pdo->lastInsertId(); };
$ev(1, 'BIRT', 1990, 2, '1990-05-10');
$ev(2, 'BIRT', 1920, 1, '1920-03-01'); $ev(2, 'CHR', 1920, 1); $ev(2, 'DEAT', 2000, 2, '2000-02-01'); $ev(2, 'BURI', 2000, 2); // 79 ans, Rennes → Paris
$ev(3, 'BIRT', 1925, 4); $ev(3, 'DEAT', 2005, 4); // 80 ans, sur place
$ev(4, 'CHR', 1850, 3); $ev(4, 'DEAT', 1900, 1); // 50 ans, Nantes → Rennes
$ev(5, 'BURI', 1880, 3);
$ev(2, 'RESI', 1950, 2); $ev(2, 'RESI', 1960, 2); $ev(3, 'RESI', 1950, 2); $ev(0, 'RESI', 1955, 4, null, 2); // un couple : deux personnes
$ev(2, 'OCCU', 1950, 2); $ev(4, 'OCCU', 1880, 3);
$ev(0, 'CENS', 1911, 1, null, 2); // recensement en événement de famille : les deux époux
$m = $ev(0, 'MARR', 1950, 2, null, 1);
$pdo->exec("INSERT INTO census_records(year,place_id) VALUES(1911,1),(1936,2)");
$pdo->exec("INSERT INTO census_members(census_id,person_id,display_name) VALUES(1,4,'Cousin'),(1,NULL,'Inconnu'),(2,2,'Père'),(2,3,'Mère')"); // Cousin 1911 Rennes déjà compté par l'événement
$pdo->exec("INSERT INTO sources(title) VALUES('Registre')");
$pdo->exec("INSERT INTO source_links(entity_type,entity_id,source_record_id) VALUES('event',1,1),('event',$m,1),('person',2,1)");
$pdo->exec("INSERT INTO media(filename,title) VALUES('acte.jpg','Acte')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'event',7)"); // décès de la Mère (Brest)
$geo = function (array $q) use ($pdo) { $r = diagram_geo_data($pdo, $q); $n = []; foreach ($r['places'] as $p) { $n[$p['name']] = $p['n']; } ksort($n); return ['what' => $r['what'], 'n' => $n, 'avg' => $r['avg'] ?? false, 'w' => array_column($r['places'], 'w', 'name'), 'type' => $r['type'] ?? null, 'unit' => $r['unit'] ?? '']; };
$out = [];
foreach (['baptisms', 'burials', 'residences', 'census', 'occupations', 'departures', 'arrivals', 'people', 'surnames', 'age_death', 'sourced', 'births', 'marriages'] as $w) { $out[$w] = $geo(['what' => $w]); }
$out['anc_people'] = $geo(['what' => 'people', 'ancestors' => 1]);
$out['anc_resi'] = $geo(['what' => 'residences', 'ancestors' => 1]);
$out['anc_age'] = $geo(['what' => 'age_death', 'ancestors' => 1]);
$out['per_census'] = $geo(['what' => 'census', 'from' => 1930, 'to' => 1940]);
$out['per_arrivals'] = $geo(['what' => 'arrivals', 'from' => 1950]);
$out['per_departures'] = $geo(['what' => 'departures', 'to' => 1900]);
$out['type'] = $geo(['what' => 'type', 'type' => $t('OCCU')]);
$out['type_fam'] = $geo(['what' => 'type', 'type' => $t('RESI')]);
$out['type_bad'] = $geo(['what' => 'type', 'type' => 99999]);
$out['bad'] = $geo(['what' => 'x; DROP TABLE']);
$pk = diagram_geo_data($pdo, ['what' => 'people']); $out['people_k'] = [$pk['distinct'] ?? false, array_column($pk['places'], 'k', 'name')];
$sk = diagram_geo_data($pdo, ['what' => 'surnames']); $out['surnames_k'] = array_column($sk['places'], 'k', 'name');
$ty = diagram_geo_data($pdo, ['list' => 'types'])['types']; $out['types'] = [count($ty), $ty[0]['usage_count'] > 0, array_keys($ty[0])];
$out['age'] = [diagram_geo_age('1920-03-01', 1920, '2000-02-01', 2000), diagram_geo_age('', 1920, '', 2000), diagram_geo_age('1900-00-00', 1900, '', 2050), diagram_geo_age('', null, '', 2000)];
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['baptêmes seuls (pas les naissances)', () => assert.deepEqual(out.baptisms.n, { Nantes: 1, Rennes: 1 })],
  ['sépultures seules', () => assert.deepEqual(out.burials.n, { Nantes: 1, Paris: 1 })],
  ['résidences : une personne une fois par lieu, les deux époux d’une résidence de famille', () => assert.deepEqual(out.residences.n, { Brest: 2, Paris: 2 })],
  ['recensements : membres (même sans fiche) + événements, sans compter deux fois', () => assert.deepEqual(out.census.n, { Paris: 2, Rennes: 3 })],
  ['métiers (événements avec un lieu)', () => assert.deepEqual(out.occupations.n, { Nantes: 1, Paris: 1 })],
  ['départs : comptés au lieu de naissance', () => assert.deepEqual(out.departures.n, { Nantes: 1, Rennes: 1 })],
  ['arrivées : comptées au lieu de décès', () => assert.deepEqual(out.arrivals.n, { Paris: 1, Rennes: 1 })],
  ['personnes différentes', () => assert.deepEqual(out.people.n, { Brest: 3, Nantes: 2, Paris: 3, Rennes: 3 })],
  ['patronymes différents (Le Goff = LE GOFF)', () => assert.deepEqual(out.surnames.n, { Brest: 2, Nantes: 1, Paris: 2, Rennes: 2 })],
  ['âge moyen au décès : moyenne en années, nombre de personnes, unité', () => { assert.deepEqual(out.age_death.n, { Brest: 80, Paris: 79, Rennes: 50 }); assert.equal(out.age_death.avg, true); assert.equal(out.age_death.unit, 'ans'); assert.deepEqual(out.age_death.w, { Brest: 1, Paris: 1, Rennes: 1 }); }],
  ['actes trouvés : une source (citation) ou un document joint sur l’événement', () => assert.deepEqual(out.sourced.n, { Brest: 1, Paris: 2 })],
  ['les anciennes sources n’ont pas bougé', () => { assert.deepEqual(out.births.n, { Brest: 1, Nantes: 1, Paris: 1, Rennes: 1 }); assert.deepEqual(out.marriages.n, { Paris: 1 }); assert.equal(out.births.avg, false); }],
  ['« mes ancêtres » : sur chaque source', () => { assert.deepEqual(out.anc_people.n, { Brest: 1, Paris: 3, Rennes: 1 }); assert.deepEqual(out.anc_resi.n, { Paris: 2 }); assert.deepEqual(out.anc_age.n, { Brest: 80, Paris: 79 }); }],
  ['période : année du recensement, du décès (arrivées), de la naissance (départs)', () => { assert.deepEqual(out.per_census.n, { Paris: 2 }); assert.deepEqual(out.per_arrivals.n, { Paris: 1 }); assert.deepEqual(out.per_departures.n, { Nantes: 1 }); }],
  ['une sorte d’événement au choix (nom renvoyé) ; une famille compte une fois', () => { assert.deepEqual(out.type.n, { Nantes: 1, Paris: 1 }); assert.ok(out.type.type?.label); assert.deepEqual(out.type_fam.n, { Brest: 1, Paris: 2 }); }],
  ['sorte d’événement inconnue : rien ; sorte de chiffres inconnue : les naissances', () => { assert.equal(Object.keys(out.type_bad.n).length, 0); assert.equal(out.type_bad.type, null); assert.equal(out.bad.what, 'births'); }],
  ['personnes et patronymes : leurs numéros (pour ne compter qu’une fois dans une zone)', () => { assert.equal(out.people_k[0], true); assert.deepEqual([...out.people_k[1].Paris].sort(), [1, 2, 3]);
    assert.equal(out.surnames_k.Paris.length, 2); assert.equal(new Set([...out.surnames_k.Paris, ...out.surnames_k.Rennes]).size, 3, 'même patronyme, même numéro'); }],
  ['liste des sortes d’événements (les plus utilisées d’abord)', () => { assert.ok(out.types[0] > 20); assert.equal(out.types[1], true); assert.deepEqual(out.types[2], ['id', 'label', 'scope', 'icon', 'gedcom_tag', 'usage_count']); }],
  ['âge : dates complètes, sinon années, invraisemblable refusé', () => assert.deepEqual(out.age, [79, 80, null, null])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
