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
// relecture : @string / @comment avant les références, accents LaTeX, inproceedings
$bib2 = "\xEF\xBB\xBF@string{ae=\"Annales\"}\n@book{k1, title={L'{\\'E}cole {\\\x60a} Paris}, author={Fran\\c{c}ois, Jean}, year=1990}\n@comment{rien}\n@inproceedings{k3, title={Trois \\& 50\\%}, booktitle={Actes}}";
$out['bib2'] = atelier_import($pdo, ['project_id' => $pid, 'text' => $bib2])['count'];
$t2 = array_column(array_filter(atelier_project($pdo, $pid)['items'], fn($i) => in_array($i['title'], ["L'École à Paris", 'Trois & 50%'], true)), null, 'title');
$out['bib2items'] = [count($t2), $t2["L'École à Paris"]['data']['creators'][0]['last'] ?? '', $t2['Trois & 50%']['data']['kind'] ?? ''];
// renommer un dossier garde sa place ; déplacer avec les sous-dossiers ; sortir de tous les dossiers
$q2 = save_atelier_project($pdo, ['title' => 'Ordre', 'folders' => ['A', 'B', ['name' => 'C', 'children' => ['C1']]]]);
$fs = array_column(atelier_project($pdo, $q2['id'])['folders'], null, 'name');
save_atelier_folder($pdo, ['id' => $fs['A']['id'], 'name' => 'A2', 'parent_id' => 0, 'icon' => '', 'color' => '']);
$rootsAfter = array_values(array_filter(atelier_project($pdo, $q2['id'])['folders'], fn($f) => $f['parent_id'] === null)); usort($rootsAfter, fn($a, $b) => $a['position'] <=> $b['position']);
$out['rename_order'] = array_column($rootsAfter, 'name');
$it = save_atelier_item($pdo, ['project_id' => $q2['id'], 'type' => 'note', 'data' => ['text' => 'x'], 'folder_ids' => [$fs['C1']['id']]]);
atelier_items_action($pdo, ['project_id' => $q2['id'], 'ids' => [$it['id']], 'action' => 'move', 'from' => $fs['C']['id'], 'from_deep' => 1, 'folder_id' => $fs['B']['id']]);
$out['deep_move'] = [atelier_project($pdo, $q2['id'])['items'][0]['folders'], (int) $fs['B']['id']];
atelier_items_action($pdo, ['project_id' => $q2['id'], 'ids' => [$it['id']], 'action' => 'unfile']);
$out['unfiled'] = atelier_project($pdo, $q2['id'])['items'][0]['folders'];
delete_atelier_project($pdo, ['id' => $q2['id']]);
// import d'un projet Zotero RDF : collections → dossiers (la collection de départ devient le projet), notes, liens ; CSL JSON, EndNote XML
$z = atelier_import($pdo, ['text' => file_get_contents('tests/fixtures/atelier-zotero.rdf'), 'new_project' => ['title' => '', 'kind' => 'these']]);
$ZP = atelier_project($pdo, $z['project_id']);
$zf = array_column($ZP['folders'], null, 'id');
$out['zotero'] = ['title' => $ZP['project']['title'], 'summary' => [$z['count'], $z['notes'], $z['links'], $z['folders'], $z['files_skipped']],
    'folders' => array_map(fn($f) => $f['name'] . '<' . ($f['parent_id'] ? $zf[$f['parent_id']]['name'] : '-'), $ZP['folders']),
    'book' => array_values(array_map(fn($i) => [count($i['folders']), $i['data']['publisher'], $i['data']['place'], $i['data']['isbn'], $i['tags']], array_filter($ZP['items'], fn($i) => $i['title'] === "Les montreurs d'images")))[0],
    'note_related' => array_values(array_filter($ZP['items'], fn($i) => $i['type'] === 'note' && $i['data']['related']))[0]['data']['text'] ?? '',
    'article' => array_values(array_map(fn($i) => [$i['data']['container'], $i['data']['pages'], $i['data']['doi']], array_filter($ZP['items'], fn($i) => $i['title'] === 'Images et colporteurs')))[0]];
$c = atelier_import($pdo, ['text' => file_get_contents('tests/fixtures/atelier-csl.json'), 'project_id' => $z['project_id']]);
$e = atelier_import($pdo, ['text' => file_get_contents('tests/fixtures/atelier-endnote.xml'), 'project_id' => $z['project_id']]);
$all = array_column(atelier_project($pdo, $z['project_id'])['items'], null, 'title');
$out['csl_endnote'] = [$c['format'], $c['count'], $e['format'], $e['count'], $all['Le peep-show']['data']['year'], $all['Le peep-show']['tags'], $all['Peepshow boxes']['data']['doi'], $all["Le grand art de la lumière et de l'ombre"]['data']['creators'][0]['last']];
try { atelier_import($pdo, ['text' => '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><oops', 'new_project' => ['title' => 'X']]); $out['bad_rdf'] = 'accepté'; } catch (Throwable $ex) { $out['bad_rdf'] = 'refusé'; }
$out['bad_rdf_left'] = (int) $pdo->query("SELECT count(*) FROM atelier_projects WHERE title='X'")->fetchColumn();
// sorte d'élément à soi : valeurs gardées, personne vérifiée, lieu, titre tiré du premier texte
$cu = save_atelier_item($pdo, ['project_id' => $z['project_id'], 'type' => 'custom', 'data' => ['ctype' => 'x_plaque', 'values' => ['fab' => 'Lapierre', 'vu' => 1, 'par' => 1, 'faux' => 999999, 'lieu' => ['text' => 'Lille']], 'pkeys' => ['par', 'faux']]]);
$ci = array_column(atelier_project($pdo, $z['project_id'])['items'], null, 'id')[$cu['id']];
$out['custom'] = [$ci['title'], $ci['data']['ctype'], $ci['data']['values']['par'], $ci['data']['values']['faux'], $ci['data']['values']['lieu']['text'], $ci['data']['values']['vu']];
delete_atelier_project($pdo, ['id' => $z['project_id']]);
delete_atelier_project($pdo, ['id' => $pid]);
$out['gone'] = (int) $pdo->query('SELECT (SELECT count(*) FROM atelier_items)+(SELECT count(*) FROM atelier_folders)+(SELECT count(*) FROM atelier_item_folders)')->fetchColumn();
// Projet complet (export « 💾 ») réimporté : dossiers imbriqués, citation reliée à sa référence, liens refaits
$full = ['type' => 'lcnda-atelier-projet', 'version' => 1, 'project' => ['title' => 'Partagé', 'kind' => 'livre'], 'folders' => [['id' => 7, 'parent_id' => 0, 'name' => 'Partie A', 'notes' => 'Plan'], ['id' => 8, 'parent_id' => 7, 'name' => 'Chap. 1']],
    'items' => [['id' => 50, 'type' => 'reference', 'title' => 'Un livre', 'data' => ['kind' => 'livre', 'year' => '1900'], 'tags' => ['x'], 'starred' => true, 'folders' => [8]],
        ['id' => 51, 'type' => 'quote', 'title' => '', 'data' => ['text' => 'Une phrase', 'source_id' => 50, 'related' => [50]], 'tags' => [], 'folders' => [8]]]];
$imp = atelier_import($pdo, ['text' => json_encode($full), 'new_project' => ['title' => '', 'kind' => 'livre']]);
$pr = atelier_project($pdo, $imp['project_id']); $by = []; foreach ($pr['items'] as $i) { $by[$i['type']] = $i; }
$fb = array_column($pr['folders'], null, 'name');
$out['full'] = [$pr['project']['title'], count($pr['folders']), (int) $fb['Chap. 1']['parent_id'] === (int) $fb['Partie A']['id'], $fb['Partie A']['notes'], (int) $by['quote']['data']['source_id'] === (int) $by['reference']['id'], $by['quote']['data']['related'] === [(int) $by['reference']['id']], (int) $by['reference']['starred'], $by['reference']['folders'] === [(int) $fb['Chap. 1']['id']]];
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const checks = [
  ['structure à jour (n° de lib/migrations.php)', () => assert.equal(out.version, Number(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'lib/migrations.php'), 'utf8').match(/const SCHEMA_VERSION = (\d+);/)[1]))],
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
  ['import BibTeX : @string / @comment ignorés sans perdre les références, accents LaTeX, actes de colloque', () => { assert.equal(out.bib2, 2); assert.deepEqual(out.bib2items, [2, 'François', 'chapitre']); }],
  ['renommer un dossier garde sa place', () => assert.deepEqual(out.rename_order, ['A2', 'B', 'C'])],
  ['déplacer depuis un dossier avec ses sous-dossiers ; sortir de tous les dossiers', () => { assert.deepEqual(out.deep_move, [[out.deep_move[1]], out.deep_move[1]]); assert.deepEqual(out.unfiled, []); }],
  ['import Zotero RDF : la collection de départ devient le projet, sous-collections en dossiers, élément dans deux dossiers', () => { assert.equal(out.zotero.title, 'Thèse optique'); assert.deepEqual(out.zotero.summary, [3, 2, 1, 3, 1]); assert.deepEqual(out.zotero.folders, ['Chapitre 1<-', 'Section 1.1<Chapitre 1', 'Chapitre 2<-']); assert.deepEqual(out.zotero.book, [2, 'Gallimard', 'Paris', '978-2-07-012345-6', ["vues d'optique", 'colportage']]); }],
  ['import Zotero RDF : note jointe gardée (texte sans HTML), revue reliée, pages, DOI', () => { assert.equal(out.zotero.note_related, 'Très utile pour le chapitre 2.\nVoir p. 45.'); assert.deepEqual(out.zotero.article, ['Annales', '10–25', '10.1234/abc']); }],
  ['import CSL JSON et EndNote XML ; fichier abîmé refusé sans laisser de projet', () => { assert.deepEqual(out.csl_endnote, ['CSL JSON', 2, 'EndNote XML', 2, '1998', ['optique', 'spectacle'], '10.9/xyz', 'Mannoni']); assert.equal(out.bad_rdf, 'refusé'); assert.equal(out.bad_rdf_left, 0); }],
  ['sorte d’élément à soi : valeurs, personne inexistante retirée, lieu, titre tiré du premier texte', () => assert.deepEqual(out.custom, ['Lapierre', 'x_plaque', 1, null, 'Lille', 1])],
  ['projet supprimé avec tout son contenu', () => assert.equal(out.gone, 0)],
  ['projet complet réimporté : dossiers imbriqués et leurs notes, citation reliée, liens, favori', () => assert.deepEqual(out.full, ['Partagé', 2, true, 'Plan', true, true, 1, true])],
];
let failed = 0;
for (const [name, fn] of checks) { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
console.log(failed ? `\n${failed} vérification(s) en échec.` : `\n${checks.length} vérifications réussies.`);
process.exit(failed ? 1 : 0);
