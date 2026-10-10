'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des outils (lib/heritage_tools.php) :   npm run test:tools
 * Paroisses d'Ancien Régime, noms cités, voyages impossibles, dossier Scans, mode consultation, et un aller-retour
 * complet de « travail à deux » entre deux copies d'une même base.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-tools-'));
const A = path.join(tmp, 'a'), B = path.join(tmp, 'b'), SCANS = path.join(tmp, 'scans');
[A, B, SCANS].forEach(d => fs.mkdirSync(d, { recursive: true }));
const prelude = String.raw`
require 'lib/paths.php';
if (!is_file(DATA_DIR.'/genealogy.sqlite')) { (new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); }
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php'); $a = strpos($src, 'function person_select'); $b = strpos($src, "\n}\n", $a); eval(substr($src, $a, $b - $a + 3));
`;
function php(dir, code) {
  const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', prelude + code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim());
  return JSON.parse(r.stdout.trim().split('\n').pop());
}
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

// Base A
const setup = php(A, String.raw`
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Pierre','Durand','male'),('Anne','Roux','female')");
$pdo->exec("INSERT INTO places(name,county,country,latitude,longitude,admin4_code) VALUES('Lille','Nord','France',50.63,3.06,'59350'),('Marseille','Bouches-du-Rhône','France',43.30,5.37,'13055'),('Le Bourg','Nord','France',50.6,3.1,'59999')");
$chr = $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='CHR' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',1,$chr,'3 mars 1790',1790,1),('person',2,$chr,'12 avril 1700',1700,3)");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',2,$chr,'4 mars 1790',1790,2)");
$pdo->exec("INSERT INTO event_witnesses(event_id,person_id,note) VALUES(3,1,'parrain')");
save_parish($pdo, ['place_id' => 3, 'parish_place_id' => 1, 'until_year' => 1790]);
$pdo->exec("INSERT INTO media(title,media_type,filename,transcription) VALUES('Acte','image','x.jpg','Le trois mars 1790 a été baptisé Jean, fils de Pierre Durand. Parrain Jacques Martin, tisserand, demeurant à Lille. Marraine Marie Lefebvre.')");
$out = ['map' => parish_map($pdo), 'pp' => person_parishes($pdo, 2), 'sugg' => array_column(cited_name_suggestions($pdo, $pdo->query('SELECT transcription FROM media WHERE id=1')->fetchColumn()), null, 'name')];
save_cited_name($pdo, ['name' => 'Jacques Martin', 'role' => 'parrain', 'occupation' => 'tisserand', 'media_id' => 1, 'year' => 1790]);
save_cited_name($pdo, ['name' => 'Jacques  MARTIN', 'role' => 'témoin', 'year' => 1795]);
$out['cited'] = cited_names_data($pdo);
$out['dates'] = [exact_date('3 mars 1790'), exact_date('1er février 1801'), exact_date('1790-03-04'), exact_date('mars 1790')];
$out['journeys'] = array_map(fn($a) => [$a['person_id'], $a['km'], $a['days']], impossible_journeys($pdo));
$out['sync'] = sync_start($pdo, ['author' => 'Victor'])['active'];
echo json_encode($out);
`);
check('paroisse : rattachement par lieu et par commune', () => { assert.equal(setup.map.by_insee['59999'][0].parish, 'Lille'); assert.equal(setup.pp['3'][0].until, 1790); });
check('noms repérés dans une transcription (rôle, métier)', () => { const s = setup.sugg['Jacques Martin']; assert.ok(s, Object.keys(setup.sugg).join(', ')); assert.equal(s.role, 'parrain'); assert.equal(s.occupation, 'tisserand'); assert.ok(setup.sugg['Marie Lefebvre']); });
check('index : même nom regroupé, années', () => { const g = setup.cited[0]; assert.equal(g.items.length, 2); assert.equal(g.from, 1790); assert.equal(g.to, 1795); });
check('dates exactes', () => assert.deepEqual(setup.dates, ['1790-03-03', '1801-02-01', '1790-03-04', null]));
check('voyage impossible : parrain à Marseille le lendemain de Lille', () => assert.deepEqual(setup.journeys, [[1, 834, 1]]));

// Copie de la base A pour le cousin (B), qui modifie de son côté
php(A, `$pdo->exec('PRAGMA wal_checkpoint(FULL)'); $pdo->exec('VACUUM main INTO ' . $pdo->quote('${B.replace(/\\/g, '/')}/genealogy.sqlite')); echo '1';`);
const pkg = php(B, String.raw`
sync_set_author($pdo, ['author' => 'Cousin']);
$pdo->exec("UPDATE persons SET occupation='tisserand' WHERE id=1");
$pdo->exec("INSERT INTO persons(first_name,last_name) VALUES('Louis','Durand')");
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(1,2)");
$fid = $pdo->lastInsertId();
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES($fid,3)");
$pdo->exec("DELETE FROM events WHERE id=2");
$changes = sync_diff($pdo);
$s = sync_settings($pdo);
echo json_encode(['format' => 'lcnda-changes', 'version' => 1, 'base_uid' => $s['base_uid'], 'package_uid' => 'p1', 'author' => 'Cousin', 'changes' => $changes]);
`);
check('paquet : 5 changements (modif, 3 ajouts, 1 suppression)', () => { assert.equal(pkg.changes.length, 5); assert.deepEqual(pkg.changes.map(c => c.op).sort(), ['create', 'create', 'create', 'delete', 'update']); });
fs.mkdirSync(path.join(A, 'sync-inbox'), { recursive: true });
fs.writeFileSync(path.join(A, 'sync-inbox', 'abc123.json'), JSON.stringify(pkg));
// A modifie aussi la même fiche avant de recevoir le paquet (conflit attendu sur Pierre)
php(A, `$pdo->exec("UPDATE persons SET occupation='laboureur' WHERE id=1"); echo '1';`);
const applied = php(A, `sync_apply($pdo, ['token' => 'abc123', 'accepted' => array_keys(json_decode(file_get_contents(DATA_DIR.'/sync-inbox/abc123.json'), true)['changes'])]);`);
const after = php(A, String.raw`echo json_encode(['occ' => $pdo->query('SELECT occupation FROM persons WHERE id=1')->fetchColumn(), 'louis' => (int) $pdo->query("SELECT count(*) FROM persons WHERE first_name='Louis'")->fetchColumn(),
  'child' => (int) $pdo->query("SELECT count(*) FROM family_children fc JOIN persons p ON p.id=fc.child_id WHERE p.first_name='Louis'")->fetchColumn(), 'ev2' => (int) $pdo->query('SELECT count(*) FROM events WHERE id=2')->fetchColumn(),
  'pending' => array_map(fn($c) => $c['tbl'] . ':' . $c['op'], sync_diff($pdo)), 'backups' => count(glob(DATA_DIR . '/backups/*avant-fusion-paquet.db'))]);`);
check('paquet appliqué : modification, ajouts liés, suppression, copie de sécurité', () => { assert.equal(applied.applied, 5); assert.equal(after.occ, 'tisserand'); assert.equal(after.louis, 1); assert.equal(after.child, 1); assert.equal(after.ev2, 0); assert.equal(after.backups, 1); });
check('ce qui vient du cousin n’est pas renvoyé dans le paquet suivant', () => assert.deepEqual(after.pending, []));

// Dossier Scans et mode consultation (par le serveur, comme l'application)
fs.writeFileSync(path.join(SCANS, 'acte-1.png'), Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'));
fs.utimesSync(path.join(SCANS, 'acte-1.png'), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
const scan = php(A, `save_scan_inbox_settings($pdo, ['dir' => '${SCANS.replace(/\\/g, '/')}', 'enabled' => 1, 'move_imported' => 1]); echo json_encode(['pending' => count(scan_inbox_pending($pdo, '${SCANS.replace(/\\/g, '/')}'))]);`);
const run = php(A, `scan_inbox_run($pdo);`);
const run2 = php(A, `scan_inbox_run($pdo);`);
check('dossier Scans : fichier importé une seule fois, puis rangé', () => { assert.equal(scan.pending, 1); assert.equal(run.imported.length, 1); assert.equal(run2.imported.length, 0); assert.ok(fs.existsSync(path.join(SCANS, 'Importés dans LCNDA', 'acte-1.png'))); });
const kiosk = php(A, String.raw`kiosk_enter(['password' => 'secret']); $codes = []; foreach ([['save_person', true], ['person', false], ['export_gedcom', false], ['save_settings', true], ['kiosk_exit', true]] as [$act, $w]) { $codes[$act] = kiosk_blocks($act, $w); }
$on = kiosk_state()['on']; @unlink(kiosk_path()); echo json_encode(['on' => $on, 'codes' => $codes, 'off' => kiosk_state()['on']]);`);
check('mode consultation : écritures et exports refusés, lecture permise', () => { assert.equal(kiosk.on, true); assert.deepEqual(kiosk.codes, {save_person: true, person: false, export_gedcom: true, save_settings: false, kiosk_exit: false}); assert.equal(kiosk.off, false); });

let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); } }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${checks.length - failed} vérifications réussies${failed ? `, ${failed} échec(s)` : ''}.`);
process.exitCode = failed ? 1 : 0;
