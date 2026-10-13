'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/digest_pages.php :   npm run test:depouillements
 * 📜 Listes › Dépouillements : une page à la fois, sur les mêmes données que Recherche › Dépouillement d'archive.
 * Créer une page, la renuméroter (photos, personnes et lignes de transcription suivent), la supprimer (photos « à ranger »).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-depouillements-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$out = [];
$pdo->exec("INSERT INTO archive_digest_entries(city_name, record_type, year_text, pages_json) VALUES('Vulaines-sur-Seine', 'recensement', '1906', '[{\"number\":\"1\",\"status\":\"checked\",\"content_type\":\"acts\",\"act_from\":\"\",\"act_to\":\"\",\"note\":\"\"}]')");
$e = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO media(title, media_type, filename) VALUES('Vue 2', 'image', 'v2.jpg')"); $m = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO archive_digest_media(archive_digest_id, media_id, page_number) VALUES($e, $m, '2')");
$pdo->exec("INSERT INTO archive_digest_people(archive_digest_id, first_name, last_name, page_number, household_key) VALUES($e, 'Jean', 'Dupont', '2', '3')");
$pdo->exec("INSERT INTO archive_digest_transcription_lines(archive_digest_id, page_number, line_number, content) VALUES($e, '2', 1, 'Dupont Jean chef')");
// la page 2 n'a pas encore de fiche : on la crée en la modifiant
$r = save_archive_digest_page($pdo, ['archive_digest_id' => $e, 'old_number' => '2', 'number' => '2', 'status' => 'found', 'act_from' => '12']);
$out['create'] = array_map(fn($p) => $p['number'] . ':' . $p['status'], $r['pages']);
try { save_archive_digest_page($pdo, ['archive_digest_id' => $e, 'old_number' => '2', 'number' => '1']); $out['dup'] = 'accepté'; } catch (Throwable $x) { $out['dup'] = 'refusé'; }
// renuméroter : 2 → 10 ; tout suit
$r = save_archive_digest_page($pdo, ['archive_digest_id' => $e, 'old_number' => '2', 'number' => '10']);
$col = fn($t) => (string) $pdo->query("SELECT page_number FROM $t WHERE archive_digest_id=$e")->fetchColumn();
$out['renum'] = [array_column($r['pages'], 'number'), $col('archive_digest_media'), $col('archive_digest_people'), $col('archive_digest_transcription_lines'), $r['pages'][1]['act_from']];
// supprimer : la photo passe « à ranger », la personne garde son numéro
$r = save_archive_digest_page($pdo, ['archive_digest_id' => $e, 'old_number' => '10', 'delete' => 1]);
$out['delete'] = [array_column($r['pages'], 'number'), $col('archive_digest_media'), $col('archive_digest_people')];
try { save_archive_digest_page($pdo, ['archive_digest_id' => 9999, 'number' => '1']); $out['missing'] = 'accepté'; } catch (Throwable $x) { $out['missing'] = 'refusé'; }
echo json_encode($out);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
fs.rmSync(dir, { recursive: true, force: true });
let out;
try { out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch (_) { console.error(r.stdout, r.stderr); process.exit(1); }
const checks = [
  ['une page utilisée par une photo sans fiche de page : la fiche se crée, pages rangées dans l’ordre', () => assert.deepEqual(out.create, ['1:checked', '2:found'])],
  ['deux pages ne peuvent pas avoir le même numéro', () => assert.equal(out.dup, 'refusé')],
  ['renuméroter : photos, personnes et lignes suivent ; ordre naturel (1, 10) ; champs gardés', () => assert.deepEqual(out.renum, [['1', '10'], '10', '10', '10', '12'])],
  ['supprimer une page : ses photos passent « à ranger », les personnes gardent leur numéro', () => assert.deepEqual(out.delete, [['1'], '', '10'])],
  ['dépouillement inexistant refusé', () => assert.equal(out.missing, 'refusé')],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
