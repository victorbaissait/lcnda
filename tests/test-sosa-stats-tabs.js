'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * De cujus (Sosa n°1 enregistré dans la base), « Prénom et saint du jour » (personnes concernées, comptage),
 * statistiques à soi (sorte « statistique de l'app ») et onglets à soi (nettoyage, partage) :
 *   npm run test:sosa-stats-tabs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-sosa-'));
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$src = file_get_contents('api.php');
foreach (['function record_exists', 'function dashboard_month_day', 'function sosa_parent_ids', 'function sosa_positions', 'function person_select'] as $fn) { $a = strpos($src, $fn); $b = strpos($src, "\n}\n", $a); if (!function_exists(substr($fn, 9))) eval(substr($src, $a, $b - $a + 3)); }
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO persons(first_name,last_name,gender,is_start) VALUES('Jean','Martin','male',1),('Marie','Martin','female',0),('Jacques','Durand','male',0),('Paul','Durand','male',0),('Louis','Petit','male',0)");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES
  ('person',1,{$t('BIRT')},'24 juin 1802',1802),
  ('person',2,{$t('BIRT')},'15 août',NULL),
  ('person',3,{$t('BIRT')},'24 juillet 1801',1801),
  ('person',4,{$t('BIRT')},'3 mars 1850',1850),
  ('person',5,{$t('CHR')},'25 août 1888',1888)");
$out = [];
$out['set'] = set_start_person($pdo, ['person_id' => 3]);
$out['starts'] = $pdo->query('SELECT id FROM persons WHERE is_start=1')->fetchAll(PDO::FETCH_COLUMN);
try { set_start_person($pdo, ['person_id' => 999]); $out['missing'] = 'accepté'; } catch (Throwable $e) { $out['missing'] = 'refusé'; }
$s = saint_stats_data($pdo);
$out['total'] = $s['total']; $out['matched'] = $s['matched'];
$out['people'] = array_map(fn($p) => [$p['first_name'], $p['date_text'], $p['kind'], $p['saint_label']], $s['people']);
// Lignée : 1 Jean (1802) ← 2 Pierre (sans dates, mort ?) et 3 Anne ; 4 Paul né en 1680 : 122 ans pour 2 générations
$pdo->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Pierre','Martin','male'),('Anne','Le Gall','female'),('Paul','Martin','male')"); // 6, 7, 8
$pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES(6,7),(8,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,6)");
$pdo->exec("INSERT INTO places(name,latitude,longitude) VALUES('Brest',48.39,-4.49),('Quimper',47.99,-4.10),('Lille',50.63,3.06)");
$pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',8,{$t('BIRT')},'1680',1680,NULL),('person',7,{$t('BIRT')},'2 mai 1775',1775,2),('person',1,{$t('RESI')},'1830',1830,3)");
$pdo->exec("UPDATE events SET place_id=1 WHERE person_id=1 AND event_type_id={$t('BIRT')}");
set_start_person($pdo, ['person_id' => 1]);
$sg = research_suggestions_data($pdo, 50);
$out['sugg'] = array_map(fn($i) => [$i['sosa'], $i['kind'], $i['from'], $i['to'], $i['place']], $sg['items']);
$ac = age_checks($pdo);
$out['gen'] = array_values(array_map(fn($a) => $a['text'], array_filter($ac['alerts'], fn($a) => str_starts_with($a['text'], 'Sosa '))));
$rows = fn($rules, $src = 'persons') => array_map(fn($r) => trim(($r['people'][0]['first_name'] ?? '') . ' ' . ($r['people'][0]['last_name'] ?? '')), widget_rows($pdo, ['source' => $src, 'definition' => ['match' => 'all', 'rules' => $rules]])['rows']);
$out['near'] = $rows([['field' => 'near_place', 'value' => 'Brest', 'km' => 80]]);
$out['dates'] = $rows([['field' => 'date_range', 'date_from' => '1802-06-01', 'date_to' => '1802-06-30']]);
$out['age'] = $rows([['field' => 'age_at', 'from' => 25, 'to' => 30, 'values' => [$t('RESI')]]]);
$pdo->exec("UPDATE places SET county='Finistère' WHERE name IN ('Brest','Quimper')");
$out['county'] = $rows([['field' => 'county', 'value' => 'finist']]);
$out['spouse'] = $rows([['field' => 'spouse_name', 'value' => 'Le Gall']]);
$out['nokids'] = count($rows([['field' => 'children_count', 'from' => 0, 'to' => 0]]));
$out['kids1'] = $rows([['field' => 'children_count', 'from' => 1, 'to' => 1]]);
$out['anc'] = $rows([['field' => 'of_person', 'value' => 'ancestors']]); // de cujus : Jean (1)
$out['anc6'] = array_map(fn($r) => trim(($r['people'][0]['first_name'] ?? '') . ' ' . ($r['people'][0]['last_name'] ?? '')), widget_rows($pdo, ['source' => 'persons', 'person_id' => 6, 'definition' => ['match' => 'all', 'rules' => [['field' => 'of_person', 'value' => 'ancestors']]]])['rows']);
$out['fam6'] = count(widget_rows($pdo, ['source' => 'persons', 'person_id' => 6, 'definition' => ['match' => 'all', 'rules' => [['field' => 'of_person', 'value' => 'family']]]])['rows']);
// Employeurs : recensement + fiche (même employeur malgré majuscules et espaces), renommage
$pdo->exec("INSERT INTO census_records(year) VALUES(1906)");
$pdo->exec("INSERT INTO census_members(census_id,person_id,occupation,employer) VALUES(1,1,'fileur','Filature  LEMAIRE'),(1,NULL,'fileuse','Filature Lemaire')");
$pdo->exec("UPDATE census_members SET display_name='Rose Inconnue' WHERE person_id IS NULL");
save_employer_record($pdo, ['name' => 'Filature Lemaire', 'siren' => '552 100 554', 'website' => 'lemaire.fr', 'logo_url' => 'javascript:alert(1)', 'directors' => [['name' => 'Auguste Lemaire', 'role' => 'Fondateur'], ['name' => '']]]);
save_employer_record($pdo, ['name' => 'Garage Martin']);
$out['emp_list'] = array_map(fn($r) => [$r['name'], $r['person_count'], $r['has_record']], employer_list_all($pdo, '%'));
$d = employer_record_detail($pdo, 'filature lemaire');
$out['emp'] = [$d['data']['siren'], $d['data']['website'], $d['data']['logo_url'], count($d['data']['directors']), array_map(fn($p) => $p['first_name'], $d['people']), $d['span']];
save_employer_record($pdo, ['name' => 'Filatures Lemaire et fils', 'old_name' => 'Filature Lemaire', 'rename_mentions' => 1]);
$out['emp_renamed'] = $pdo->query("SELECT DISTINCT employer FROM census_members")->fetchAll(PDO::FETCH_COLUMN);
// Livret de famille : époux relié (Jean, 1), enfant relié (Louis, 5) ; report de ce qui manque
$bk = save_booklet($pdo, ['data' => ['commune' => 'Pernay', 'marriage_date' => '15 mai 1912', 'marriage_place' => 'Pernay',
    'husband' => ['written_name' => 'MARTIN Jean', 'person_id' => 1, 'death_date' => '3 mars 1950', 'death_place' => 'Tours'], 'wife' => ['written_name' => 'DURAND Marie', 'person_id' => 2],
    'children' => [['written_name' => 'MARTIN Louis', 'person_id' => 5, 'birth_date' => '25 août 1888'], ['written_name' => '']]]]);
$out['bk_title'] = $bk['title'];
$out['bk_children'] = count(booklet_detail($pdo, $bk['id'])['data']['children']);
$out['bk_mention'] = array_map(fn($m) => $m['role'], booklet_person_mentions($pdo, 5));
$out['bk_props'] = array_column(booklet_proposals($pdo, $bk['id'])['items'], 'key');
$out['bk_done'] = apply_booklet($pdo, ['id' => $bk['id'], 'keys' => ['husband:death', 'marriage', 'child:0:parents', 'pirate']])['done'];
$out['bk_props_after'] = array_column(booklet_proposals($pdo, $bk['id'])['items'], 'key');
// Tableaux : nettoyage des éléments, dossier (sous-tableau) rangé comme son parent, suppression en cascade, listes
$pdo->exec("INSERT INTO investigations(person_id,title) VALUES(1,'Le père')");
$bd = save_board($pdo, ['title' => 'Mur', 'owner_type' => 'investigation', 'owner_id' => 1, 'part' => 'Piste 1', 'data' => ['bg' => 'cork', 'items' => [
    ['id' => 'a', 'type' => 'note', 'text' => '<b>x</b>', 'x' => 10, 'y' => 20, 'w' => 100, 'h' => 80, 'fill' => 'javascript:alert(1)'],
    ['id' => 'b', 'type' => 'weblink', 'url' => 'javascript:alert(1)'], ['type' => 'pirate'], ['id' => 'c', 'type' => 'line', 'from' => 'a', 'to' => 'zz', 'points' => [[0, 0], [5, 5]]]]]]);
$sub = save_board($pdo, ['title' => 'Dossier', 'parent_id' => $bd['id']]);
$d = board_detail($pdo, $bd['id']);
$out['bd'] = [count($d['data']['items']), $d['data']['items'][0]['text'], $d['data']['items'][0]['fill'], $d['data']['items'][1]['url'], $d['data']['bg'], $d['owner_label'], $d['part']];
$out['bd_sub'] = [board_detail($pdo, $sub['id'])['owner_type'], board_detail($pdo, $sub['id'])['path'][0]['title']];
$out['bd_list'] = array_map(fn($r) => [$r['title'], $r['sub_count']], boards_list($pdo, ['owner_type' => 'investigation', 'owner_id' => 1]));
$out['bd_inv'] = array_map(fn($r) => [$r['title'], $r['boards']], research_lists_overview($pdo, 'investigations'));
// tableur, associations, instantanés, copie
save_board($pdo, ['id' => $bd['id'], 'title' => 'Mur', 'owner_type' => 'investigation', 'owner_id' => 1, 'data' => ['items' => [['id' => 't', 'type' => 'table', 'cells' => [['<i>a</i>', '=SOMME(A2:A3)'], [str_repeat('x', 900), ['pirate']]], 'colw' => [10, 5000], 'cfill' => ['0:1' => '#ff0000', 'bad' => '#000', '1:0' => 'url(x)']]],
    'links' => [['kind' => 'person', 'id' => 1, 'label' => 'Jean', 'part' => 'piste 2'], ['kind' => 'person', 'id' => 1, 'label' => 'Jean', 'part' => 'piste 2'], ['kind' => 'pirate', 'id' => 3]]]]);
$t = board_detail($pdo, $bd['id'])['data'];
$out['bd_table'] = [$t['items'][0]['cells'][0][0], mb_strlen($t['items'][0]['cells'][1][0]), $t['items'][0]['cells'][1][1], $t['items'][0]['colw'], array_keys((array) $t['items'][0]['cfill']), count($t['links'])];
$out['bd_linked'] = array_map(fn($r) => [$r['title'], $r['parts']], boards_linked($pdo, 'person', 1));
$snap = save_board_snapshot($pdo, ['board_id' => $bd['id'], 'label' => 'avant']);
save_board($pdo, ['id' => $bd['id'], 'title' => 'Mur', 'owner_type' => 'investigation', 'owner_id' => 1, 'data' => ['items' => []]]);
restore_board_snapshot($pdo, ['id' => $snap['id']]);
$cp = copy_board($pdo, ['id' => $bd['id'], 'snapshot_id' => $snap['id'], 'keep_owner' => false]);
$out['bd_snap'] = [count(board_detail($pdo, $bd['id'])['data']['items']), count(board_snapshots($pdo, $bd['id'])), board_detail($pdo, $cp['id'])['owner_type'], count(board_detail($pdo, $cp['id'])['data']['links']), $cp['title']];
delete_board($pdo, ['id' => $cp['id']]);
$out['bd_del'] = delete_board($pdo, ['id' => $bd['id']])['deleted'];
$out['bd_snapleft'] = (int) $pdo->query('SELECT count(*) FROM board_snapshots')->fetchColumn();
// nouveaux réglages : texte, listes, formes à soi, fusion, police et alignement sûrs, fond à soi
$nb = save_board($pdo, ['title' => 'Formes', 'data' => ['bg' => 'custom', 'bgColor' => '#eef6ee', 'bgPattern' => 'grid', 'items' => [
    ['id' => 'x', 'type' => 'text', 'text' => 'a', 'underline' => 1, 'strike' => 1, 'list' => 'roman', 'font' => 'x"><img src=x>', 'align' => 'center;color:red', 'radius' => 12],
    ['id' => 'y', 'type' => 'shape', 'shape' => 'my_1', 'svgpath' => 'M0 0L10 10Z', 'mask' => 'javascript:alert(1)', 'headEnd' => '<b>'],
    ['id' => 'z', 'type' => 'shape', 'shape' => 'my_2', 'svgpath' => 'M0 0"/><script>', 'list' => 'evil'],
    ['id' => 't', 'type' => 'table', 'cells' => [['a', 'b'], ['c', 'd']], 'merges' => [['r' => 0, 'c' => 0, 'rs' => 1, 'cs' => 2], ['r' => 1, 'c' => 1, 'rs' => 1, 'cs' => 1]]],
    ['id' => 'm', 'type' => 'media', 'media_id' => 3, 'bw' => 900, 'stroke' => '#ff0000', 'hard' => 50]]]]);
$d2 = board_detail($pdo, $nb['id'])['data']; $it = array_column($d2['items'], null, 'id');
$out['bd_new'] = [$d2['bgColor'], $d2['bgPattern'], $it['x']['underline'], $it['x']['list'], $it['x']['font'], $it['x']['align'], $it['y']['svgpath'], isset($it['y']['mask']), $it['y']['headEnd'], isset($it['z']['svgpath']), $it['z']['list'], count($it['t']['merges']), $it['m']['bw'], $it['m']['hard']];
delete_board($pdo, ['id' => $nb['id']]);
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`;

const checks = [];
const step = (name, fn) => checks.push([name, fn]);
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());

step('de cujus : une seule personne de départ dans la base', () => { assert.deepEqual(out.set, { id: 3, is_start: 1 }); assert.deepEqual(out.starts, [3]); });
step('de cujus : personne inconnue refusée', () => assert.equal(out.missing, 'refusé'));
step('saint du jour : une naissance sans année compte aussi parmi les « prénommés d’après le saint »', () => { assert.equal(out.total, 5); assert.equal(out.matched, 4); });
step('saint du jour : les personnes, par date (sans année à la fin), le jour retenu et le saint', () => assert.deepEqual(out.people, [
    ['Jacques', '24 juillet 1801', 'next', 'saint Jacques'],
    ['Jean', '24 juin 1802', 'birth', 'saint Jean-Baptiste'],
    ['Paul', '3 mars 1850', 'birth', null],
    ['Louis', '25 août 1888', 'baptism', 'saint Louis'],
    ['Marie', '15 août', 'birth', 'sainte Marie'],
]));

step('suggestions : la mère sans décès, le mariage du couple, la génération des grands-parents ; lieux et années voisins', () => {
    const s = out.sugg;
    assert.ok(s.some(([n, k, f, t, p]) => n === 3 && k === 'death' && f === 1802 && p === 'Quimper'), JSON.stringify(s));
    assert.ok(s.some(([n, k, f, t, p]) => n === 2 && k === 'marriage' && f === 1790 && t === 1803 && p === 'Quimper'), JSON.stringify(s));
    assert.ok(s.some(([n, k]) => n === 2 && k === 'birth'), 'naissance du père d’après l’enfant');
    assert.ok(!s.some(([n, k]) => n === 1 && k === 'birth'), 'le de cujus a sa naissance');
});
step('erreur de génération : un ancêtre Sosa trop vieux pour sa place (génération oubliée ?)', () => { assert.equal(out.gen.length, 1); assert.match(out.gen[0], /^Sosa 4 : 12[12] ans pour 2 générations$/); });
step('critères : à moins de N km d’une ville (personnes nées ou passées par là)', () => { assert.ok(out.near.includes('Jean Martin')); assert.ok(out.near.includes('Anne Le Gall')); assert.ok(!out.near.includes('Paul Durand')); });
step('critères : entre deux dates précises (24 juin 1802 oui, 24 juillet 1801 non)', () => assert.deepEqual(out.dates, ['Jean Martin']));
step('critères : âge à un événement (résidence à 28 ans)', () => assert.deepEqual(out.age, ['Jean Martin']));

step('critères : département, conjoint, nombre d’enfants (0 = aucun ; exactement 1)', () => {
    assert.deepEqual(out.county.sort(), ['Anne Le Gall', 'Jean Martin']);
    assert.deepEqual(out.spouse, ['Pierre Martin']);
    assert.deepEqual(out.kids1.sort(), ['Anne Le Gall', 'Paul Martin', 'Pierre Martin']);
    assert.equal(out.nokids, 5); // Jean, Marie, Jacques, Paul Durand, Louis : aucun enfant
});

step('critère « par rapport à la personne de la fiche » : ancêtres du de cujus, d’une fiche, famille proche', () => {
    assert.deepEqual(out.anc.sort(), ['Anne Le Gall', 'Paul Martin', 'Pierre Martin']);
    assert.deepEqual(out.anc6, ['Paul Martin']);
    assert.equal(out.fam6, 4); // Pierre, sa femme Anne, son fils Jean, son père Paul
});

step('employeurs : une fiche par nom (majuscules et espaces ignorés), avec les personnes des recensements', () => {
    assert.deepEqual(out.emp_list, [['Filature Lemaire', 2, 1], ['Garage Martin', 0, 1]]);
    const [sirenV, site, logo, dirs, people, span] = out.emp;
    assert.equal(sirenV, '552100554'); assert.equal(site, 'https://lemaire.fr'); assert.equal(logo, ''); assert.equal(dirs, 1);
    assert.deepEqual(people.sort(), ['Jean', 'Rose Inconnue']); assert.deepEqual(span, [1906, 1906]);
});
step('employeurs : renommer la fiche renomme aussi l’employeur dans les recensements', () => assert.deepEqual(out.emp_renamed, ['Filatures Lemaire et fils']));

step('livret de famille : transcription, fiche reliée, report sur les fiches de ce qui manque seulement', () => {
    assert.equal(out.bk_title, 'Livret de MARTIN Jean et DURAND Marie');
    assert.equal(out.bk_children, 1); // l'enfant vide est ignoré
    assert.deepEqual(out.bk_mention, ['child']);
    assert.ok(out.bk_props.includes('husband:death') && out.bk_props.includes('marriage') && out.bk_props.includes('child:0:parents'), JSON.stringify(out.bk_props));
    assert.ok(!out.bk_props.includes('child:0:birth'), 'Louis a déjà son baptême');
    assert.equal(out.bk_done, 3);
    assert.deepEqual(out.bk_props_after, []);
});

step('tableaux : éléments nettoyés (types, couleurs, adresses), dossier rangé comme son tableau, listes, suppression en cascade', () => {
    assert.deepEqual(out.bd, [3, '<b>x</b>', '', '', 'cork', 'Le père', 'Piste 1']); // le texte reste du texte (échappé à l'affichage)
    assert.deepEqual(out.bd_sub, ['investigation', 'Mur']);
    assert.deepEqual(out.bd_list, [['Mur', 1]]);
    assert.deepEqual(out.bd_inv, [['Le père', 1]]);
    assert.equal(out.bd_del, 2);
    assert.deepEqual(out.bd_table, ['<i>a</i>', 500, '', [30, 800], ['0:1'], 1]);
    assert.deepEqual(out.bd_linked, [['Mur', ['piste 2']]]);
    assert.deepEqual(out.bd_snap, [1, 2, '', 0, 'Mur (copie)']);
    assert.equal(out.bd_snapleft, 0);
    assert.deepEqual(out.bd_new, ['#eef6ee', 'grid', true, 'roman', 'ximg srcx', 'left', 'M0 0L10 10Z', false, 'triangle', false, '', 1, 200, 50]);
});

/* ── Côté navigateur : nettoyage des statistiques et des onglets (heritage-widgets.js, heritage-tabs.js) ── */
const store = {};
const storage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const appModules = { dashboard: ['01', 'Tableau de bord'], personnes: ['02', 'Personnes'], listes: ['05', 'Listes'], maintenance: ['10', 'Maintenance'], jeu: ['JEU', 'Jeu'] };
const appTypes = [['stats', '01', 'Chiffres clés'], ['reminders', '02', 'Rappels'], ['app_screen', '03', 'Écran de l’app']];
const sandbox = { window: {}, localStorage: storage, document: { addEventListener() {}, createElement: () => ({}) }, console, setTimeout, clearTimeout };
sandbox.window.LCNDA_APP = {
    escapeHtml: v => String(v), state: {}, appModules,
    defaultListTypes: [['villages', '36', 'Fiche d’un village']], defaultMaintenanceTabs: [['design', '01', 'Apparence']],
    orderedGraphDiagramItems: () => [['ancestors', '01', 'Arbre des ascendants']], orderedGraphStatsItems: () => [['surnames', '01', 'Noms']],
    orderedDashboardWidgetTypes: () => appTypes, dashboardWidgetLabel: k => k,
    dashboardNewWidget: (type, src = {}) => ({ id: src.id || type + '-x', type, width: String(src.width || '6'), limit: 0, config: src.config || {} }),
    syncCustomDashboardWidgets() {}, dashboardBlockSettings: () => ({ widgets: [] }), customTabs: () => [], saveCustomTabs() {},
};
vm.createContext(sandbox);
for (const f of ['heritage-widgets.js', 'heritage-tabs.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT;

step('statistique de l’app redessinée : réglages gardés, valeurs hors limites ramenées', () => {
    const d = ext.cleanWidgetDef({ id: 'cw_abcd1234', name: 'Prénoms', kind: 'appstat', statType: 'firstnames', statFrom: ' 12 mars 1750 ', statTo: 1900, statGender: 'female', statLineage: 1, style: 'pie', limit: 500, inStats: true });
    assert.equal(d.kind, 'appstat'); assert.equal(d.statType, 'firstnames'); assert.equal(d.statFrom, '12 mars 1750'); assert.equal(d.statTo, '1900');
    assert.equal(d.statGender, 'female'); assert.equal(d.statLineage, true); assert.equal(d.style, 'pie'); assert.equal(d.limit, 60); assert.equal(d.inStats, true);
});
step('statistique : une statistique inconnue de l’app devient « Noms »', () => assert.equal(ext.cleanWidgetDef({ kind: 'appstat', statType: 'requete_sql' }).statType, 'surnames'));
step('onglet page : widgets inconnus retirés, place dans la barre vérifiée', () => {
    const t = ext.cleanCustomTab({ id: 'ct_abcd1234', name: '  Ma lignée  ', icon: '🌳', kind: 'page', after: 'jeu', widgets: [{ type: 'stats', width: '12' }, { type: 'inconnu' }] });
    assert.equal(t.name, 'Ma lignée'); assert.equal(t.after, ''); assert.deepEqual(t.widgets.map(w => [w.type, w.width]), [['stats', '12']]);
});
step('onglet : une commune choisie (monographie) garde sa propre organisation, nettoyée', () => {
    const t = ext.cleanCustomTab({ kind: 'page', name: 'Mon village', widgets: [{ type: 'app_screen', width: '12', config: { target: 'monograph:n:pernay|indre-et-loire', placeName: 'Pernay', layout: { order: ['events', 'pirate', 'filters'], hidden: ['filters', 'x'] } } }] });
    const c = t.widgets[0].config;
    assert.equal(c.target, 'monograph:n:pernay|indre-et-loire'); assert.equal(c.placeName, 'Pernay');
    assert.equal(JSON.stringify(c.layout.order.slice(0, 2)), '["events","filters"]'); assert.equal(c.layout.order.length, 7); assert.equal(JSON.stringify(c.layout.hidden), '["filters"]');
    assert.equal(ext.cleanCustomTab({ kind: 'page', name: 'x', widgets: [{ type: 'app_screen', config: { target: 'village:<script>' } }] }).widgets[0].config.target, 'module:carte');
});
step('onglet raccourci : seulement un écran qui existe', () => {
    assert.equal(ext.cleanCustomTab({ kind: 'screen', target: 'list:villages', after: 'personnes' }).target, 'list:villages');
    assert.equal(ext.cleanCustomTab({ kind: 'screen', target: 'url:javascript:alert(1)' }).target, '');
    assert.match(ext.cleanCustomTab({ id: '../../x' }).id, /^ct_[a-z0-9]+$/);
});

let failed = 0;
console.log(`Test de cujus, saint du jour, statistiques et onglets à soi (${phpPath})`);
for (const [name, fn] of checks) {
    try { fn(); console.log('  ✓ ' + name); } catch (error) { failed++; console.log('  ✗ ' + name + '\n      ' + error.message); }
}
fs.rmSync(dir, { recursive: true, force: true });
if (failed) { console.log(`${failed} échec(s).`); process.exit(1); }
console.log(`${checks.length} vérifications réussies.`);
