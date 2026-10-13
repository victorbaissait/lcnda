'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/calendars.php :   npm run test:calendars
 * Lecture des dates des fiches (jour, mois, année, approximative, autre calendrier converti) et « Mon agenda ».
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-calendars-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$out = ['parse' => array_map(fn($t) => cal_parse_date($t), ['3 juillet 1832', '1er mars 1790', '03/07/1832', '1832-07-03', 'juillet 1832', '07/1832', '1850', 'vers 1850', 'ABT 3 JUL 1832', '31 février 1800', '', 'inconnue'])];
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Dupont','male'),('Marie','Martin','female')");
$birt = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$marr = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='MARR' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(1,2)");
$e = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,date_calendar,date_converted,year) VALUES(?,?,?,?,?,?,?,?)");
$e->execute(['person', 1, null, $birt, '12 thermidor an II', 'republican', '30/07/1794', 1794]);
$e->execute(['family', null, 1, $marr, 'juin 1820', 'gregorian', '', 1820]);
$e->execute(['person', 2, null, $birt, '', 'gregorian', '', null]);
$g = genea_calendar_events($pdo);
$out['genea'] = array_map(fn($x) => [$x['y'], $x['m'], $x['d'], $x['group'], implode(' et ', array_column($x['who'], 'name'))], $g['events']);
$out['undated'] = $g['undated'];
$out['one'] = count(genea_calendar_events($pdo, ['person_id' => 2])['events']);
save_genealogy_fair($pdo, ['title' => 'Salon de Bourges', 'date_start' => '2026-10-14', 'date_end' => '2026-10-16', 'place_text' => 'Bourges']);
$pdo->prepare("INSERT INTO standalone_reminders(title, reminder_due_at, reminder_mode) VALUES('Commander l’acte', '2026-11-02', 'on')")->execute();
$a = my_agenda($pdo)['items'];
$out['agenda'] = array_map(fn($x) => [$x['src'], $x['start'], $x['end']], $a);
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
fs.rmSync(dir, { recursive: true, force: true });
let out;
try { out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch (_) { console.error(r.stdout, r.stderr); process.exit(1); }
const checks = [
  ['dates au jour (écrites de 4 façons)', () => { for (const i of [0, 2, 3]) assert.deepEqual(out.parse[i], [1832, 7, 3, false]); assert.deepEqual(out.parse[1], [1790, 3, 1, false]); }],
  ['dates au mois, à l’année, approximatives, GEDCOM', () => { assert.deepEqual(out.parse[4], [1832, 7, null, false]); assert.deepEqual(out.parse[5], [1832, 7, null, false]); assert.deepEqual(out.parse[6], [1850, null, null, false]); assert.deepEqual(out.parse[7], [1850, null, null, true]); assert.deepEqual(out.parse[8], [1832, 7, 3, true]); }],
  ['date impossible ou vide refusée', () => { assert.equal(out.parse[9][2], null); assert.equal(out.parse[10], null); assert.equal(out.parse[11], null); }],
  ['date républicaine placée grâce à sa conversion ; mariage au mois, avec les deux époux', () => assert.deepEqual(out.genea, [[1794, 7, 30, 'birth', 'Jean Dupont'], [1820, 6, null, 'union', 'Jean Dupont et Marie Martin']])],
  ['événement sans date compté à part ; une seule personne', () => { assert.equal(out.undated, 1); assert.equal(out.one, 1); }],
  ['Mon agenda : salon sur plusieurs jours, rappel', () => assert.deepEqual(out.agenda, [['fair', '2026-10-14', '2026-10-16'], ['reminder', '2026-11-02', '']])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
