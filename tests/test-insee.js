'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/insee_remote.php :   npm run test:insee
 * Fichiers des décès de data.gouv.fr (sans Internet : liste simulée), conversion du .txt en positions fixes, import.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-insee-'));
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
const line = (np, sx, dn, ln, cn, pn, dd, ld, acte) => pad(np, 80) + sx + dn + pad(ln, 5) + pad(cn, 30) + pad(pn, 30) + dd + pad(ld, 5) + pad(acte, 9);
fs.writeFileSync(path.join(dir, 'deces-2024.txt'), [line('BAISSAIT*ADRIEN PAUL/', '1', '19300412', '59279', 'HALLUIN', '', '20240105', '59350', '123'), line('DUPONT*MARIE/', '2', '19281231', '99134', 'MADRID', 'ESPAGNE', '20241120', '75056', '7')].join('\n') + '\n');
const php = code => {
  const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  return JSON.parse(r.stdout.trim().split('\n').pop());
};
const head = String.raw`
require 'lib/paths.php';
if (!is_file(DATA_DIR.'/genealogy.sqlite')) (new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php'); $a = strpos($src, 'function insee_deces_import(PDO'); $b = strpos($src, "\n}\n", $a); eval(substr($src, $a, $b - $a + 3));
`;
const res = JSON.stringify([
  { url: 'https://static.data.gouv.fr/resources/fichier-des-personnes-decedees/x/deces-2023.txt', title: 'deces-2023.txt', filesize: 1 },
  { url: 'https://static.data.gouv.fr/resources/fichier-des-personnes-decedees/x/deces-2023.csv', title: 'Décès 2023', filesize: 2 },
  { url: 'https://static.data.gouv.fr/resources/fichier-des-personnes-decedees/x/deces-2024.txt', title: 'deces-2024.txt' },
  { url: 'https://static.data.gouv.fr/resources/fichier-des-personnes-decedees/x/deces-2024-m03.txt', title: 'mars 2024' },
  { url: 'https://static.data.gouv.fr/resources/fichier-des-personnes-decedees/x/deces-2025-m01.txt', title: 'janvier 2025' },
  { url: 'https://evil.example.com/deces-2026.csv', title: 'piège' },
  { url: 'https://static.data.gouv.fr/resources/fichier-des-personnes-decedees/x/documentation.pdf', title: 'doc' },
]);
// 1) le .txt en positions fixes, converti puis importé comme un fichier choisi à la main
const imp = php(head + String.raw`
$csv = insee_fixed_width_to_csv('${path.join(dir, 'deces-2024.txt')}');
$_SERVER['REQUEST_METHOD'] = 'POST';
$_FILES['file'] = ['name' => 'deces-2024.txt', 'tmp_name' => $csv, 'error' => UPLOAD_ERR_OK, 'size' => filesize($csv)];
insee_deces_import($pdo);
`);
const after = php(head + String.raw`
$rows = $pdo->query('SELECT nom, prenom, prenoms, sexe, date_naissance, commune_naissance, pays_naissance, date_deces, code_lieu_deces, numero_acte_deces FROM insee_deces ORDER BY id')->fetchAll();
$pdo->exec("INSERT INTO insee_deces_imports(filename,row_count,inserted_count) VALUES('deces-2023.csv',1,1)");
$list = insee_remote_files($pdo, json_decode('${res}', true));
$pdo->exec("INSERT INTO insee_deces_imports(filename,row_count,inserted_count) VALUES('deces-2025-m07.txt',1,1),('deces-2025-m08.txt',1,1)");
$u = 'https://static.data.gouv.fr/resources/x/';
$list2 = insee_remote_files($pdo, [['url' => $u . 'deces-2025.txt'], ['url' => $u . 'deces-2025-m09.txt'], ['url' => $u . 'deces-2026-m01.txt'], ['url' => $u . 'deces-2025-m08.txt']])['files'];
echo json_encode(['rows' => $rows, 'list' => $list, 'list2' => $list2], JSON_UNESCAPED_UNICODE);
`);
const files = Object.fromEntries(after.list.files.map(f => [f.name, f]));
const checks = [
  ['import du .txt converti : 2 décès', () => assert.equal(imp.inserted, 2)],
  ['positions fixes bien lues (nom, prénoms, dates, lieu, acte)', () => assert.deepEqual(after.rows[0], { nom: 'BAISSAIT', prenom: 'ADRIEN PAUL', prenoms: 'ADRIEN PAUL', sexe: 'M', date_naissance: '19300412', commune_naissance: 'HALLUIN', pays_naissance: '', date_deces: '20240105', code_lieu_deces: '59350', numero_acte_deces: '123' })],
  ['pays de naissance et sexe féminin', () => { assert.equal(after.rows[1].pays_naissance, 'ESPAGNE'); assert.equal(after.rows[1].sexe, 'F'); }],
  ['une seule version par période, le CSV préféré', () => { assert.ok(files['deces-2023.csv']); assert.ok(!files['deces-2023.txt']); }],
  ['déjà importés reconnus (par le nom)', () => { assert.ok(files['deces-2023.csv'].imported); assert.ok(files['deces-2024.txt'].imported); }],
  ['mois remplacés par le fichier de l’année', () => assert.ok(files['deces-2024-m03.txt'].superseded)],
  ['nouveau : plus récent que ce qui est importé', () => { assert.ok(files['deces-2025-m01.txt'].new); assert.equal(after.list.new_count, 1); assert.equal(files['deces-2025-m01.txt'].label, 'Décès de janvier 2025'); }],
  ['adresses hors data.gouv.fr et autres fichiers ignorés', () => { assert.ok(!files['deces-2026.csv']); assert.ok(!files['documentation.pdf']); }],
  ['fichier de l’année après des mois déjà importés : nouveau, et classé avant ses mois', () => { assert.ok(after.list2.find(f => f.name === 'deces-2025.txt').new); assert.equal(after.list2[0].name, 'deces-2026-m01.txt'); assert.equal(after.list2[1].name, 'deces-2025.txt'); assert.ok(after.list2.find(f => f.name === 'deces-2025-m09.txt').superseded); }],
  ['du plus récent au plus ancien', () => assert.equal(after.list.files[0].name, 'deces-2025-m01.txt')],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
