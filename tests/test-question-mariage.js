'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Poser une question : mariage et enfants (lib/question_famille.php) :   npm run test:question-mariage
 * « Quelles sont les femmes nées avant 1800 en Indre-et-Loire qui se sont mariées après l'âge de 20 ans ayant eu au moins deux enfants ? »
 * Chaque critère seul, les fautes courantes (« se sont marié », « ayant eux », sans accents), jamais mariées, sans enfant, âges,
 * remariées, la recherche enregistrée qui garde ces critères, et les fiches sans date signalées.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-qmariage-'));
const questions = {
    full: 'Quelles sont les femmes nées avant 1800 en Indre-et-Loire qui se sont mariées après l’âge de 20 ans ayant eu au moins deux enfants ?',
    fautes: 'quelles sont les femmes nees avant 1800 en Indre-et-Loire qui se sont marie apres l\'age de 20 ans ayant eux au moins deux enfants',
    majuscules: 'Quelles sont les FEMMES nées avant 1800 en Indre-et-Loire qui se sont MARIÉES après l’âge de 20 ans AYANT EU au moins DEUX enfants ?',
    signale: 'quelles sont les femmes nées avant 1800 en Indre-et-Loire qui se sont mariées ?',
    mariees: 'Les femmes qui se sont mariées',
    jamais: 'Quelles femmes ne se sont jamais mariées ?',
    jamais2: 'les femmes jamais mariées',
    celib: 'femmes célibataires',
    pas: 'les femmes nées avant 1800 pas mariées',
    sans: 'Les femmes sans enfant',
    sans2: 'femmes qui n’ont pas eu d’enfants',
    avant20: 'femmes mariées avant 20 ans',
    entre: 'femmes mariées entre 20 et 30 ans',
    plus30: 'femmes mariées à plus de 30 ans',
    a20: 'femmes mariées à 20 ans',
    deux: 'femmes ayant eu au moins deux enfants',
    plus5: 'femmes avec plus de 5 enfants',
    exact3: 'femmes avec exactement 3 enfants',
    trois: 'femmes ayant eu trois enfants',
    des: 'femmes qui ont eu des enfants',
    remariees: 'femmes remariées',
    plusieurs: 'femmes mariées plusieurs fois',
    deuxMar: 'femmes ayant eu au moins deux mariages',
    combien: 'Combien de femmes se sont mariées après 20 ans ?',
    jeunes: 'femmes mariées jeunes',
    marie: 'Quelles femmes s’appellent Marie ?',
    ete: 'femmes ayant été mariées',
    caps: 'QUELLES SONT LES FEMMES NÉES AVANT 1800 EN INDRE-ET-LOIRE QUI SE SONT MARIÉES APRÈS L’ÂGE DE 20 ANS AYANT EU AU MOINS DEUX ENFANTS ?',
    capsLieu: 'les femmes nées avant 1800 EN INDRE-ET-LOIRE qui se sont mariées',
    capsNom: 'LES ALPHA MARIÉS AU XIXE SIÈCLE',
    capsMarie: 'QUELLES FEMMES S’APPELLENT MARIE ?',
    moyenSans: 'Quel est l’âge moyen au mariage des femmes sans enfant ?',
    moyenRemar: 'Quel est l’âge moyen au mariage des femmes remariées ?',
    morts70: 'Quelles femmes sont mortes à 70 ans sans enfant ?',
    recordJeune: 'Quelles femmes ayant eu au moins deux enfants se sont mariées le plus jeunes ?',
    qui: 'Qui s’est marié après 30 ans ?',
    hommes: 'les hommes qui ont eu au moins 3 enfants',
    alpha: 'les Alpha mariés au XIXe siècle',
    bravo: 'les Bravo mariés au XVIIIe siècle',
    morteSans: 'femmes nées en Indre-et-Loire mortes sans enfant célibataires',
};
const code = String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
require 'tests/api_functions.php';
$pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,country) VALUES(1,'Tours','Indre-et-Loire','France'),(2,'Paris','Seine','France')");
// personnes fictives : [id, prénom, nom, sexe, année de naissance, lieu]
$people = [[1,'Anne','Alpha','female',1780,1],[2,'Paul','Alpha','male',null,0],[3,'Berthe','Bravo','female',1790,1],[4,'Jean','Bravo','male',null,0],[5,'Claire','Charlie','female',1785,1],
  [6,'Denise','Delta','female',1795,1],[7,'Louis','Delta','male',null,0],[8,'Henri','Durand','male',null,0],[9,'Emma','Echo','female',1770,1],[10,'Fanny','Foxtrot','female',1810,1],
  [11,'Gisèle','Golf','female',1785,2],[12,'Hélène','Hotel','female',null,0],[13,'Iris','India','female',1792,1],[14,'Marc','Mike','male',null,0],[16,'Marie','Zulu','female',1799,1]];
foreach ($people as [$id,$f,$l,$g,$by,$pl]) {
    $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender) VALUES(?,?,?,?)')->execute([$id,$f,$l,$g]);
    if ($by) { $pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',$id,{$t('BIRT')},'$by',$by,$pl)"); }
}
// familles : [femme, mari, année du mariage (0 = mariage sans date, -1 = pas de mariage), nombre d'enfants]
$fams = [[1,2,1805,3],[3,4,1808,1],[6,7,1830,2],[6,8,1840,4],[9,14,0,2],[10,14,1830,2],[11,2,1810,2],[12,4,1800,3],[13,7,1812,0]];
$kid = 100;
foreach ($fams as [$w,$h,$y,$n]) {
    $pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES($h,$w)"); $fid = (int) $pdo->lastInsertId();
    if ($y >= 0) { $pdo->exec("INSERT INTO events(scope,family_id,event_type_id,date_text,year) VALUES('family',$fid,{$t('MARR')}," . ($y ? "'$y',$y" : "'',NULL") . ")"); }
    for ($i = 0; $i < $n; $i++) { $kid++; $pdo->exec("INSERT INTO persons(id,first_name,last_name,gender) VALUES($kid,'Enfant$kid','Kilo','male')"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES($fid,$kid)"); }
}
// décès : Anne et Claire à 70 ans
foreach ([[1,1850],[5,1855]] as [$id,$y]) { $pdo->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',$id,{$t('DEAT')},'$y',$y)"); }
$o = [];
foreach (json_decode(getenv('QM_QUESTIONS'), true) as $k => $q) {
    try { $a = ask_question($pdo, $q); $ids = array_map('intval', array_column($a['people'], 'id')); sort($ids); $o[$k] = ['ids' => $ids, 'understood' => $a['understood'], 'answer' => $a['answer'], 'criteria' => $a['criteria']]; }
    catch (Throwable $e) { $o[$k] = ['error' => $e->getMessage()]; }
}
$sv = save_saved_search($pdo, ['name' => 'Femmes de Touraine', 'criteria' => $o['full']['criteria']]);
$d = saved_searches_data($pdo)['searches'][0];
$o['saved'] = [$sv['count'], $d['count'], $d['description'], json_decode($pdo->query('SELECT criteria FROM saved_searches')->fetchColumn(), true)];
echo json_encode($o, JSON_UNESCAPED_UNICODE);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, encoding: 'utf8', env: { ...process.env, QM_QUESTIONS: JSON.stringify(questions), GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') } });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const out = JSON.parse(r.stdout.trim().split('\n').pop());
const ids = (k, want) => { assert.ok(!out[k].error, out[k].error); assert.deepEqual(out[k].ids, want, `${questions[k]} → ${JSON.stringify(out[k].ids)} (${out[k].understood.join(' | ')})`); };
const chips = (k, want) => { for (const w of want) assert.ok(out[k].understood.includes(w), `« ${w} » absent de J’ai compris : ${out[k].understood.join(' | ')}`); };
const checks = [
    ['la phrase complète : nées avant 1800 en Indre-et-Loire, mariées après 20 ans, au moins 2 enfants → Anne et Denise', () => ids('full', [1, 6])],
    ['« J’ai compris » montre chaque critère', () => chips('full', ['femmes', 'nées avant 1800', 'lieu : Indre-et-Loire', 'mariées après 20 ans', 'au moins 2 enfants'])],
    ['la fiche mariée sans date de mariage est signalée (1 fiche sans date)', () => assert.match(out.full.answer, /^1 fiche sans date n’a pas pu être vérifiée/)],
    ['fautes courantes : « nees », « se sont marie », « apres l\'age », « ayant eux »', () => { ids('fautes', [1, 6]); chips('fautes', ['mariées après 20 ans', 'au moins 2 enfants']); }],
    ['majuscules', () => ids('majuscules', [1, 6])],
    ['la question signalée : nées avant 1800 en Indre-et-Loire qui se sont mariées', () => { ids('signale', [1, 3, 6, 9, 13]); chips('signale', ['nées avant 1800', 'mariées']); }],
    ['« qui se sont mariées » seul (mariage avec ou sans date)', () => ids('mariees', [1, 3, 6, 9, 10, 11, 12, 13])],
    ['jamais mariées, célibataires, pas mariées (« Marie » n’est pas « mariée »)', () => { ids('jamais', [5, 16]); ids('jamais2', [5, 16]); ids('celib', [5, 16]); ids('pas', [5, 16]); chips('jamais', ['jamais mariées']); }],
    ['sans enfant', () => { ids('sans', [5, 13, 16]); ids('sans2', [5, 13, 16]); chips('sans', ['sans enfant']); }],
    ['âge au mariage : avant 20 ans, entre 20 et 30, à plus de 30, à 20 ans', () => { ids('avant20', [3]); ids('entre', [1, 10, 11, 13]); ids('plus30', [6]); ids('a20', [10, 13]); chips('entre', ['mariées entre 20 et 30 ans']); chips('plus30', ['mariées après 30 ans']); chips('avant20', ['mariées avant 20 ans']); chips('a20', ['mariées à 20 ans']); }],
    ['nombre d’enfants : au moins deux, plus de 5, exactement 3, « trois » en lettres, des enfants', () => { ids('deux', [1, 6, 9, 10, 11, 12]); ids('plus5', [6]); ids('exact3', [1, 12]); ids('trois', [1, 12]); ids('des', [1, 3, 6, 9, 10, 11, 12]); chips('exact3', ['exactement 3 enfants']); chips('des', ['avec des enfants']); chips('plus5', ['au moins 6 enfants']); }],
    ['remariées, mariées plusieurs fois, au moins deux mariages', () => { ids('remariees', [6]); ids('plusieurs', [6]); ids('deuxMar', [6]); chips('remariees', ['au moins 2 mariages']); }],
    ['« combien » : le nombre et les 2 fiches sans date', () => { ids('combien', [1, 6, 11]); assert.match(out.combien.answer, /^3 fiches répondent à la question\. 2 fiches sans date n’ont pas pu être vérifiées/); }],
    ['« mariées jeunes » : pas d’âge inventé, on le dit', () => { ids('jeunes', [1, 3, 6, 9, 10, 11, 12, 13]); assert.match(out.jeunes.answer, /pas assez précis/); }],
    ['le prénom Marie reste un prénom', () => { ids('marie', [16]); assert.ok(!out.marie.understood.some(u => /mari[ée]/.test(u)), out.marie.understood.join(' | ')); }],
    ['« ayant été mariées »', () => ids('ete', [1, 3, 6, 9, 10, 11, 12, 13])],
    ['sans autre critère, au masculin : « Qui s’est marié après 30 ans ? », « les hommes qui ont eu au moins 3 enfants »', () => { ids('qui', [6]); chips('qui', ['mariés après 30 ans']); ids('hommes', [2, 4, 8, 14]); chips('hommes', ['hommes', 'au moins 3 enfants']); }],
    ['comme avant : « les Alpha mariés au XIXe siècle » (le siècle est celui du mariage)', () => { ids('alpha', [1, 2]); ids('bravo', [4]) /* Jean Bravo, marié en 1800 à Hélène */; assert.equal(out.alpha.criteria.event, 'MARR'); }],
    ['« sans enfant » et « célibataires » avec un autre événement', () => { assert.ok(!out.morteSans.error, out.morteSans.error); chips('morteSans', ['jamais mariées', 'sans enfant']); }],
    ['question en capitales : le lieu et le reste compris', () => { ids('caps', [1, 6]); chips('caps', ['femmes', 'nées avant 1800', 'lieu : Indre-et-Loire', 'mariées après 20 ans', 'au moins 2 enfants']); }],
    ['seulement le lieu en capitales (« EN INDRE-ET-LOIRE »)', () => { ids('capsLieu', [1, 3, 6, 9, 13]); chips('capsLieu', ['lieu : Indre-et-Loire']); }],
    ['en capitales, un nom de famille reste un nom (« LES ALPHA »), « MARIE » reste un prénom', () => { ids('capsNom', [1, 2]); chips('capsNom', ['nom : Alpha']); ids('capsMarie', [16]); }],
    ['calcul : âge moyen au mariage des femmes sans enfant (Iris, 20 ans) ; des femmes remariées (Denise, 35 ans)', () => { assert.match(out.moyenSans.answer, /^Âge moyen au premier mariage : 20,0 ans/); chips('moyenSans', ['âge moyen au premier mariage', 'femmes', 'sans enfant']); assert.match(out.moyenRemar.answer, /^Âge moyen au premier mariage : 35,0 ans/); chips('moyenRemar', ['au moins 2 mariages']); }],
    ['calcul : mortes à 70 ans sans enfant (Claire, pas Anne)', () => { ids('morts70', [5]); chips('morts70', ['sans enfant']); }],
    ['record : mariée le plus jeune parmi les femmes ayant eu au moins deux enfants (Fanny, 20 ans)', () => { assert.match(out.recordJeune.answer, /^Fanny Foxtrot .*20 ans/); chips('recordJeune', ['au moins 2 enfants']); }],
    ['« Enregistrer comme recherche » garde les critères (2 fiches, description)', () => {
        assert.equal(out.saved[0], 2); assert.equal(out.saved[1], 2);
        assert.match(out.saved[2], /mariées après 20 ans/); assert.match(out.saved[2], /au moins 2 enfants/);
        assert.equal(out.saved[3].marr_age_min, 21); assert.equal(out.saved[3].children_min, 2); assert.equal(out.saved[3].gender, 'female');
    }],
];
let failed = 0;
for (const [label, fn] of checks) { try { fn(); console.log('✓', label); } catch (e) { failed++; console.error('✗', label, '\n  ', e.message); } }
fs.rmSync(dir, { recursive: true, force: true });
if (failed) { console.error(`${failed} échec(s).`); process.exit(1); }
console.log(`${checks.length} vérifications réussies.`);
