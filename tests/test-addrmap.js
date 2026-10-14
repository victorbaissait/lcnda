'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/addr_map.php :   npm run test:addrmap
 * 🗺️ Plan des adresses : la BAN du département (fichier .csv.gz) lue en local pour une commune, placement automatique
 * (numéro exact, numéro voisin, rue seule, nom proche), anciens noms de rues (renommée, disparue), point posé à la main jamais écrasé.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-addrmap-'));
// Fichier BAN au format de adresse.data.gouv.fr (séparateur « ; »)
const head = 'id;id_fantoir;numero;rep;nom_voie;code_postal;code_insee;nom_commune;code_insee_ancienne_commune;nom_ancienne_commune;x;y;lon;lat;type_position;alias;nom_ld;libelle_acheminement;nom_afnor;source_position;source_nom_voie;certification_commune;cad_parcelles';
const line = (n, rep, voie, lon, lat, insee = '77533') => `${insee}_x_${n}${rep};${insee}_0100;${n};${rep};${voie};77870;${insee};Vulaines-sur-Seine;;;0;0;${lon};${lat};entrée;;;VULAINES;;commune;commune;1;`;
fs.mkdirSync(path.join(dir, 'ban'), { recursive: true });
fs.writeFileSync(path.join(dir, 'ban', 'adresses-77.csv.gz'), zlib.gzipSync([head,
  line(3, '', 'Rue de la Seine', 2.7701, 48.4301), line(5, '', 'Rue de la Seine', 2.7703, 48.4303), line(8, '', 'Rue de la Seine', 2.7708, 48.4308),
  line(1, '', 'Rue Paul Doumer', 2.7801, 48.4401), line(2, 'bis', 'Rue Paul Doumer', 2.7802, 48.4402),
  line(1, '', 'Rue de la Gare', 2.79, 48.45, '77001')].join('\n') + '\n'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$out = ['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()];
$out['keys'] = [addr_street_key('R. de la Seine'), addr_street_key('rue de la  Seine'), addr_house_key('3 bis'), addr_house_key('3B'), addr_split('12 bis, rue Haute')];
$pdo->exec("INSERT INTO places(name, admin4_code) VALUES('Vulaines-sur-Seine', '77533')"); $pl = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO archive_digest_entries(place_id, city_name, record_type, year_text) VALUES($pl, 'Vulaines-sur-Seine', 'recensement', '1906')"); $d1 = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO archive_digest_entries(place_id, city_name, record_type, year_text) VALUES($pl, 'Vulaines-sur-Seine', 'recensement', '1921')"); $d2 = (int) $pdo->lastInsertId();
$ins = $pdo->prepare('INSERT INTO archive_digest_people(archive_digest_id, first_name, last_name, household_key, page_number, address) VALUES(?,?,?,?,?,?)');
$ins->execute([$d1, 'Louis', 'Baissait', '48', '4', '3 rue de la Seine']);   // exact
$ins->execute([$d2, 'Louis', 'Baissait', '12', '2', '3 R. de la Seine']);    // même adresse en 1921
$ins->execute([$d1, 'Paul', 'Martin', '49', '4', '7 rue de la Seine']);      // 7 n'existe plus : voisin impair (5)
$ins->execute([$d1, 'Jean', 'Petit', '50', '4', 'rue de la Senne']);         // nom mal écrit, sans numéro
$ins->execute([$d1, 'Marie', 'Haute', '51', '5', '2 bis rue Haute']);        // ancien nom → rue Paul Doumer
$ins->execute([$d1, 'Anne', 'Pré', '52', '5', '4 ruelle du Moulin']);        // rue disparue
$m = addr_map_data($pdo, ['digest_id' => $d1]);
$out['data'] = [$m['insee'], $m['years'], count($m['addresses']), $m['ban']['count'], $m['ban']['file'] !== null];
$imp = addr_ban_import($pdo, ['insee' => '77533']);
$out['import'] = [$imp['imported'], $imp['placed'], $imp['left']];
$pt = function () use ($pdo) { $r = []; foreach ($pdo->query("SELECT street_key || '|' || house_key AS k, precision, round(lat,4) AS lat FROM addr_points ORDER BY k") as $p) { $r[$p['k']] = $p['precision'] . '@' . $p['lat']; } return $r; };
$out['points1'] = $pt();
save_addr_street($pdo, ['insee' => '77533', 'old_name' => 'rue Haute', 'status' => 'renamed', 'current_name' => 'Rue Paul Doumer']);
save_addr_street($pdo, ['insee' => '77533', 'old_name' => 'ruelle du Moulin', 'status' => 'gone', 'path' => [[48.431, 2.771], [48.432, 2.772]], 'year_to' => '1950']);
$out['points2'] = $pt();
save_addr_point($pdo, ['insee' => '77533', 'street' => 'ruelle du Moulin', 'house' => '4', 'lat' => 48.4315, 'lon' => 2.7715]);
save_addr_point($pdo, ['insee' => '77533', 'street' => 'rue de la Seine', 'house' => '7', 'lat' => 48.5, 'lon' => 2.8]);
addr_auto_place($pdo, ['insee' => '77533', 'force' => true]);
$out['points3'] = $pt();
$m = addr_map_data($pdo, ['insee' => '77533']);
$a = array_values(array_filter($m['addresses'], fn($x) => $x['key'] === 'rue seine|3'))[0];
$out['years_on_point'] = [array_keys($a['years']), $a['years']['1906'][0]['people'][0]['name'], count($m['streets']), $m['streets'][0]['status'] ?? '', count($m['current_streets'])];
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
fs.rmSync(dir, { recursive: true, force: true });
let out;
try { out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch (_) { console.error(r.stdout, r.stderr); process.exit(1); }
const checks = [
  ['structure à jour (n°38)', () => assert.equal(out.version, 38)],
  ['noms de rues et numéros comparables (« R. de la Seine » = « rue de la Seine », « 3 bis » = « 3B »)', () => assert.deepEqual(out.keys, ['rue seine', 'rue seine', '3b', '3b', ['12 bis', 'rue Haute']])],
  ['commune trouvée par son code INSEE, années des dépouillements, adresses rassemblées', () => assert.deepEqual(out.data, ['77533', [1906, 1921], 5, 0, true])],
  ['BAN du département lue en local : seulement la commune ; placement automatique', () => assert.deepEqual(out.import, [5, 3, 2])],
  ['exact, numéro voisin du même côté, nom mal écrit (milieu de rue) ; ancien nom et rue disparue restent à placer', () => assert.deepEqual(out.points1, {'rue seine|3': 'exact@48.4301', 'rue seine|7': 'approx@48.4303', 'rue senne|': 'fuzzy@48.4304'})],
  ['ancien nom → nom actuel : « 2 bis rue Haute » placé rue Paul Doumer ; la rue disparue reste à placer', () => assert.equal(out.points2['rue haute|2b'], 'exact@48.4402')],
  ['point posé à la main : jamais écrasé, même en replaçant tout', () => { assert.equal(out.points3['ruelle moulin|4'], 'manual@48.4315'); assert.equal(out.points3['rue seine|7'], 'manual@48.5'); }],
  ['une adresse, plusieurs années ; rues anciennes et rues d’aujourd’hui', () => assert.deepEqual(out.years_on_point, [[1906, 1921], 'Louis Baissait', 2, 'renamed', 2])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
