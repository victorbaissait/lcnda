'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test de lib/atelier.php :   npm run test:atelier
 * Atelier de recherche : projets, dossiers imbriqués (sans boucle), éléments rangés dans plusieurs dossiers,
 * corbeille, étiquettes, import BibTeX et RIS.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-atelier-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php'); $a = strpos($src, 'function person_select'); $b = strpos($src, "\n}\n", $a); eval(substr($src, $a, $b - $a + 3));
$out = ['version' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()];
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Dupont','male')");
$p = save_atelier_project($pdo, ['title' => 'Les montreurs d’optique', 'kind' => 'these', 'target_words' => 100, 'folders' => [['name' => 'Partie 1', 'children' => [['name' => 'Chapitre 1', 'children' => ['Section A']], 'Chapitre 2']], 'Sources']]);
$pid = $p['id'];
$tree = atelier_project($pdo, $pid)['folders'];
$byName = array_column($tree, null, 'name');
$out['tree'] = [count($tree), (int) $byName['Section A']['parent_id'] === (int) $byName['Chapitre 1']['id'], $byName['Partie 1']['parent_id']];
// boucle refusée : Partie 1 dans sa propre Section A
try { save_atelier_folder($pdo, ['id' => $byName['Partie 1']['id'], 'parent_id' => $byName['Section A']['id']]); $out['loop'] = 'accepté'; } catch (Throwable $e) { $out['loop'] = 'refusé'; }
// déplacer Chapitre 2 à la racine, avant Sources
save_atelier_folder($pdo, ['id' => $byName['Chapitre 2']['id'], 'parent_id' => 0, 'before' => $byName['Sources']['id']]);
$roots = array_values(array_filter(atelier_project($pdo, $pid)['folders'], fn($f) => $f['parent_id'] === null));
usort($roots, fn($a, $b) => $a['position'] <=> $b['position']);
$out['roots'] = array_column($roots, 'name');
$ref = save_atelier_item($pdo, ['project_id' => $pid, 'type' => 'reference', 'title' => 'Le Monde dans une boîte', 'data' => ['kind' => 'livre', 'creators' => [['last' => 'Balzer', 'first' => 'Richard'], ['last' => '', 'first' => '']], 'year' => '1998', 'url' => 'javascript:alert(1)'], 'tags' => ['vues d’optique', 'vues d’optique', ''], 'folder_ids' => [$byName['Chapitre 1']['id'], $byName['Sources']['id'], 999999]]);
$q = save_atelier_item($pdo, ['project_id' => $pid, 'type' => 'quote', 'data' => ['text' => 'Le montreur pose sa boîte sur la place.', 'source_id' => $ref['id'], 'page' => '12']]);
$d = save_atelier_item($pdo, ['project_id' => $pid, 'type' => 'draft', 'title' => 'Intro', 'data' => ['text' => 'Les montreurs d’images parcouraient les foires.']]);
$per = save_atelier_item($pdo, ['project_id' => $pid, 'type' => 'person', 'data' => ['person_id' => 1, 'role' => 'colporteur']]);
try { save_atelier_item($pdo, ['project_id' => $pid, 'type' => 'note', 'data' => ['text' => '  ']]); $out['empty'] = 'accepté'; } catch (Throwable $e) { $out['empty'] = 'refusé'; }
$items = array_column(atelier_project($pdo, $pid)['items'], null, 'id');
$out['ref'] = [count($items[$ref['id']]['data']['creators']), $items[$ref['id']]['data']['url'], $items[$ref['id']]['tags'], count($items[$ref['id']]['folders'])];
$out['titles'] = [$items[$q['id']]['title'], $items[$per['id']]['title']];
$out['words'] = atelier_projects($pdo)['projects'][0]['words'];
// glisser dans un autre dossier (déplacer), corbeille, suppression définitive
atelier_items_action($pdo, ['project_id' => $pid, 'ids' => [$ref['id']], 'action' => 'move', 'from' => $byName['Chapitre 1']['id'], 'folder_id' => $byName['Section A']['id']]);
$out['moved'] = atelier_project($pdo, $pid)['items'][0]['folders'];
$out['expect_moved'] = [(int) $byName['Sources']['id'], (int) $byName['Section A']['id']];
atelier_items_action($pdo, ['project_id' => $pid, 'ids' => [$q['id']], 'action' => 'delete']);
$out['delete_not_trashed'] = (int) $pdo->query('SELECT count(*) FROM atelier_items WHERE id=' . $q['id'])->fetchColumn();
atelier_items_action($pdo, ['project_id' => $pid, 'ids' => [$q['id']], 'action' => 'trash']);
atelier_items_action($pdo, ['project_id' => $pid, 'ids' => [$q['id']], 'action' => 'delete']);
$out['deleted'] = (int) $pdo->query('SELECT count(*) FROM atelier_items WHERE id=' . $q['id'])->fetchColumn();
atelier_rename_tag($pdo, ['project_id' => $pid, 'from' => 'vues d’optique', 'to' => 'optique']);
$out['tag'] = atelier_project($pdo, $pid)['items'][0]['tags'];
// supprimer Partie 1 : ses sous-dossiers partent, l'élément reste
$out['folder_del'] = delete_atelier_folder($pdo, ['id' => $byName['Partie 1']['id']])['deleted'];
$out['ref_left'] = atelier_project($pdo, $pid)['items'][0]['folders'];
// import BibTeX et RIS
$bib = "@book{balzer98,\n  author = {Balzer, Richard and Jean {de La} Fontaine},\n  title = {Peepshows: {A} Visual History},\n  publisher = {Abrams},\n  address = {New York},\n  year = 1998,\n  keywords = {optique, peepshow}\n}\n@article{x, title=\"Les vues d'optique\", journal={Revue de l'art}, volume={5}, pages={10--25}, year={2004}, author={Martin, Paul}}";
$out['bib'] = atelier_import($pdo, ['project_id' => $pid, 'folder_id' => $byName['Sources']['id'], 'text' => $bib])['count'];
$ris = "TY  - JOUR\nTI  - Le colportage des images\nAU  - Dupont, Marie\nPY  - 2010/05/01\nJO  - Ethnologie française\nSP  - 101\nEP  - 120\nKW  - colportage\nER  - \n";
$out['ris'] = atelier_import($pdo, ['project_id' => $pid, 'text' => $ris])['count'];
$all = array_values(array_filter(atelier_project($pdo, $pid)['items'], fn($i) => $i['type'] === 'reference'));
$imp = array_column($all, null, 'title');
$out['bibitem'] = [$imp['Peepshows: A Visual History']['data']['creators'], $imp['Peepshows: A Visual History']['data']['place'], $imp['Peepshows: A Visual History']['tags'], $imp["Les vues d'optique"]['data']['pages'], $imp["Les vues d'optique"]['data']['kind']];
$out['risitem'] = [$imp['Le colportage des images']['data']['year'], $imp['Le colportage des images']['data']['pages'], $imp['Le colportage des images']['data']['container'], $imp['Le colportage des images']['data']['creators'][0]['last']];
try { atelier_import($pdo, ['project_id' => $pid, 'text' => 'rien du tout']); $out['bad_import'] = 'accepté'; } catch (Throwable $e) { $out['bad_import'] = 'refusé'; }
delete_atelier_project($pdo, ['id' => $pid]);
$out['gone'] = (int) $pdo->query('SELECT (SELECT count(*) FROM atelier_items)+(SELECT count(*) FROM atelier_folders)+(SELECT count(*) FROM atelier_item_folders)')->fetchColumn();
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['structure à jour (n°24)', () => assert.equal(out.version, 24)],
  ['plan de départ : dossiers et sous-sous-dossiers', () => assert.deepEqual(out.tree, [5, true, null])],
  ['un dossier ne va pas dans un de ses sous-dossiers', () => assert.equal(out.loop, 'refusé')],
  ['déplacer un dossier à la racine, avant un autre', () => assert.deepEqual(out.roots, ['Partie 1', 'Chapitre 2', 'Sources'])],
  ['référence nettoyée (auteur vide, lien dangereux, étiquette en double, dossier étranger)', () => assert.deepEqual(out.ref, [1, '', ['vues d’optique'], 2])],
  ['titre tiré du contenu (citation, personne de la base) ; élément vide refusé', () => { assert.equal(out.titles[0], '« Le montreur pose sa boîte sur la place. »'); assert.equal(out.titles[1], 'Jean Dupont'); assert.equal(out.empty, 'refusé'); }],
  ['mots des brouillons comptés', () => assert.equal(out.words, 6)],
  ['glisser vers un autre dossier : déplacé, gardé dans les autres', () => assert.deepEqual([...out.moved].sort(), [...out.expect_moved].sort())],
  ['suppression définitive seulement depuis la corbeille', () => { assert.equal(out.delete_not_trashed, 1); assert.equal(out.deleted, 0); }],
  ['étiquette renommée partout', () => assert.deepEqual(out.tag, ['optique'])],
  ['dossier supprimé avec ses sous-dossiers, l’élément reste', () => { assert.equal(out.folder_del, 3); assert.equal(out.ref_left.length, 1); }],
  ['import BibTeX : auteurs, lieu, mots-clés, pages, revue', () => { assert.equal(out.bib, 2); assert.deepEqual(out.bibitem[0].map(c => c.last), ['Balzer', 'Fontaine']); assert.equal(out.bibitem[1], 'New York'); assert.deepEqual(out.bibitem[2], ['optique', 'peepshow']); assert.equal(out.bibitem[3], '10–25'); assert.equal(out.bibitem[4], 'article'); }],
  ['import RIS ; fichier inconnu refusé', () => { assert.equal(out.ris, 1); assert.deepEqual(out.risitem, ['2010', '101–120', 'Ethnologie française', 'Dupont']); assert.equal(out.bad_import, 'refusé'); }],
  ['projet supprimé avec tout son contenu', () => assert.equal(out.gone, 0)],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
