'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔎 « Poser une question », suite (lib/question_plus.php, assets/js/heritage-questions-plus.js) :   node tests/test-questions-plus.js
 *  1. les corrections : négations, minuscules, « vers 1850 », prénom latin, faute sur le nom, « Jean Durand » seul, guerre, OU / ET,
 *     « mariés en l'an III », vivants probables, métier au féminin, garde-fou « Je n'ai pas tenu compte de : … » ;
 *  2. le second essai (moteur « à la française ») seulement quand rien n'est compris ;
 *  3. les nouvelles questions : « moi / mes / ma / mon », parenté élargie, fautes de frappe, « qui est X ? » ;
 *  4. les renvois vers les outils (Que manque-t-il ?, Où chercher ?, dossiers ⚖️, Contrôle) ; rien du ⚖️ en mode consultation ;
 *  5. ⌘K : la détection (vrais et faux positifs), la ligne « Poser la question », la réponse courte, homonymes, XSS ;
 *     captures (SHOTS=dossier : qp-*.png, 1440, 390, sombre).
 * Données fictives.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-qplus-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media') };
const XSS = '<img src=x onerror=window.__xss=1>';
let checks = 0, failed = 0;
const t = async (label, fn) => { try { await fn(); checks++; console.log('✓', label); } catch (e) { failed++; console.error('✗', label, '\n  ', e && e.message || e); } };
const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], { cwd: appRoot, env, encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) { throw new Error(r.stderr || r.stdout); } return r.stdout; };

/* ═════ la base fictive : 5 générations, Durand, Mazaud (dont Petrus, né « vers 1850 »), Combes, Le Gall, un dossier ⚖️ ═════ */
php(String.raw`
require 'lib/paths.php';
(new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'))->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
require 'lib/bootstrap.php';
$pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,state,country) VALUES(1,'Lille','Nord','Hauts-de-France','France'),(2,'Quimper','Finistère','Bretagne','France'),(3,'Saint-Pierre-des-Corps','Indre-et-Loire','Centre','France'),(4,'Verdun','Meuse','Lorraine','France'),(5,'Combes','Hérault','Occitanie','France'),(6,'Tours','Indre-et-Loire','Centre','France')");
$P = [[1,'Moi','Durand','male','',1],[2,'Jean','Durand','male','boulanger',0],[3,'Marie','Le Gall','female','couturière',0],[4,'Sophie','Durand','female','',0],[5,'Louis','Durand','male','cultivateur',0],
 [6,'Jeanne','Combes','female','',0],[7,'Pierre','Durand','male','soldat',0],[8,'Rose','Mazaud','female','',0],[9,'Petrus','MAZAUD','male','laboureur',0],[10,'Jean-Baptiste','Mazaud','male','laboureur',0],
 [11,'Paul','Mazaud','male','',0],[12,'Yves','Le Gall','male','marin',0],[13,'Anne','Le Gall','female','',0],[14,'François','Combes','male','tisserand',0],[15,'Jeanne','Dubois','female','',0],
 [16,'Jean','Martin','male','',0],[17,'Marguerite','Dupont','female','',0],[18,'Jean','Combes','male','meunier',0],[19,'Catherine','Lefèvre','female','',0],[20,'Hervé','Le Gall','male','',0],
 [21,'Xss','<img src=x onerror=window.__xss=1>','female','meunière',0],[22,'Claude','Martin','male','',0]];
foreach ($P as [$id,$f,$l,$g,$o,$s]) { $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,occupation,is_start) VALUES(?,?,?,?,?,?)')->execute([$id,$f,$l,$g,$o,$s]); }
$pdo->exec("UPDATE persons SET mort_pour_la_france='yes' WHERE id=7");
$F = [[1,2,3,[1,4],['12 juin 1988',1988,1]],[2,5,6,[2],['3 mai 1955',1955,1]],[3,7,8,[5],['8 février 1925',1925,1]],[4,9,19,[8,10],['10 janvier 1870',1870,3]],[5,10,null,[11],null],
 [6,12,null,[13],null],[7,14,15,[18],['15 brumaire an III',1794,5]],[8,18,null,[6],['1830',1830,5]],[9,16,17,[],['20 avril 1875',1875,6]],[10,20,null,[3,12],null],[11,22,21,[],null]];
foreach ($F as [$id,$a,$b,$kids,$m]) {
  $pdo->prepare('INSERT INTO families(id,partner1_id,partner2_id) VALUES(?,?,?)')->execute([$id,$a,$b]);
  foreach ($kids as $k) $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES($id,$k)");
  if ($m) $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,place_id) VALUES('family',?,?,?,?,?)")->execute([$id,$t('MARR'),$m[0],$m[1],$m[2]]);
}
$E = [[1,'BIRT','5 juin 1990',1990,1],[2,'BIRT','12 mars 1960',1960,1],[3,'BIRT','5 juin 1962',1962,2],[4,'BIRT','1992',1992,1],[5,'BIRT','2 août 1930',1930,1],[5,'DEAT','10 juin 1944',1944,4],
 [6,'BIRT','1932',1932,5],[7,'BIRT','1er janvier 1900',1900,1],[7,'DEAT','21 février 1916',1916,4],[8,'BIRT','vers 1902',1902,3],[8,'DEAT','1980',1980,6],[9,'BIRT','vers 1850',1850,3],[9,'DEAT','3 mars 1920',1920,3],
 [10,'BIRT','1875',1875,3],[11,'BIRT','1905',1905,6],[12,'BIRT','1965',1965,2],[13,'BIRT','1995',1995,2],[14,'BIRT','1770',1770,5],[14,'DEAT','1840',1840,5],[15,'BIRT','1772',1772,5],[16,'BIRT','1848',1848,6],
 [16,'DEAT','1910',1910,6],[17,'BIRT','1851',1851,6],[18,'BIRT','15 brumaire an III',1794,5],[18,'DEAT','1860',1860,5],[19,'BIRT','1852',1852,6],[9,'RESI','1880',1880,3],[14,'RESI','1800',1800,5],[21,'BIRT','1840',1840,6]];
foreach ($E as [$p,$tag,$d,$y,$pl]) $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',?,?,?,?,?)")->execute([$p,$t($tag),$d,$y,$pl]);
// parrain de Jean Combes : Jean Martin (témoin du baptême, rôle « parrain »)
$bid = (int) $pdo->query("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=18 AND t.gedcom_tag='BIRT'")->fetchColumn();
$pdo->exec("INSERT INTO event_witnesses(event_id,person_id,note) VALUES($bid,16,'parrain')");
// ⚖️ un dossier pour Petrus MAZAUD : 2 héritiers calculés, 1 branche à rechercher, une échéance en retard, un courrier sans réponse, une pièce manquante, un héritier introuvable
succ_dossiers_ensure($pdo);
$pdo->exec("INSERT INTO succ_cases(id,number,title,deceased_id,state,snapshot_json) VALUES(1,'S-2026-01','Succession Mazaud',9,'recherche','{\"order\":1,\"shares\":{\"10\":\"1/2\",\"8\":\"1/2\"},\"unknown\":[99]}')");
$pdo->exec("INSERT INTO succ_deadlines(case_id,due,label,kind) VALUES(1,'2020-01-01','Déclaration','declaration')");
$pdo->exec("INSERT INTO courriers(destinataire,objet,date_envoi,succ_case_id,person_id,reponse) VALUES('Paul Mazaud','Lettre aux héritiers','2026-10-01',1,11,'')");
$pdo->exec("INSERT INTO succ_pieces(case_id,piece_key,state,note) VALUES(1,'deces:9','missing','acte de décès')");
$pdo->exec("INSERT INTO succ_case_persons(case_id,person_id,role,contact_state) VALUES(1,11,'heir','introuvable')");
echo 'ok';
`);

/* ═════ les questions, posées directement (ask_question) ═════ */
const QUESTIONS = ['les enfants de Pierre Mazaud', 'les enfants de Petrus Mazeau', 'les enfants de Jn Bte Mazaud', 'les enfants de Petrus', 'les enfants de Petrus MAZAUD', 'qui est né vers 1850', 'nés vers 1850 à Tours',
    'nés dans les années 1850', 'les morts de 1916', 'mariés en l\'an III', 'les durand nés à lille', 'qui est ne a lille', 'nés à St Pierre des Corps', 'Jean Durand', 'qui est Petrus Mazaud ?', 'parle-moi de Pierre Mazaud',
    'qui est mort à la guerre', 'qui est mort pendant la guerre de 14', 'qui a connu la Grande Guerre', 'les hommes nés à Lille ou à Quimper', 'quels ancêtres étaient laboureurs ou tisserands', 'les tisserands et les meuniers',
    'nés en 1850 ou 1851', 'nés après 1789 et avant 1800', 'les femmes nées à Lille et mariées', 'les vivants', 'les hommes nés après 1900 encore en vie', 'les meunières', 'les meuniers',
    'qui n\'a pas de date de décès', 'les personnes sans date de décès', 'les femmes qui ne sont pas nées à Lille', 'les personnes qui ne sont pas des ancêtres', 'les personnes sans parents', 'qui n\'a pas de source',
    'les ancêtres sans profession', 'quels ancêtres n\'ont pas de parents connus', 'mes ancêtres', 'les boulangers 1850', 'les laboureurs mais pas les tisserands', 'Durand', 'les Le Gall', 'combien de Jean', 'Durand Lille 1850',
    'ma grand-mère paternelle', 'mes grands-parents', 'mes grands-parents maternels', 'mes arrière-grands-parents', 'mes cousins germains', 'quel est mon lien avec Paul Mazaud', 'mes oncles', 'les oncles de Moi Durand',
    'les tantes de Sophie Durand', 'les neveux de Yves Le Gall', 'les beaux-parents de Marie Le Gall', 'la belle-mère de Marie Le Gall', 'les gendres de Petrus Mazaud', 'les beaux-frères de Jean Durand', 'le parrain de Jean Combes',
    'les filleuls de Jean Martin', 'les enfans de Petrus Mazaud', 'les boulangés', 'la femme de Jean Durand', 'morts en 1916', 'quels actes me manquent', 'où chercher Petrus Mazaud', 'les héritiers de Petrus Mazaud',
    'les héritiers de Rose Mazaud', 'dossiers en retard', 'quels héritiers n\'ont pas répondu', 'pièces manquantes', 'héritiers introuvables', 'les doublons', 'les enfants de Jean', 'qui est né le même jour que moi',
    `qui est Xss ${XSS}`];
const askAll = (kiosk = false) => JSON.parse(php(String.raw`
require 'lib/paths.php'; require 'lib/bootstrap.php'; require 'tests/api_functions.php';
${kiosk ? "file_put_contents(kiosk_path(), json_encode(['hash' => 'x', 'since' => 'now']));" : ''}
$pdo = db(); $o = [];
foreach (json_decode(${JSON.stringify(JSON.stringify(QUESTIONS))}, true) as $q) {
  try { $r = ask_question($pdo, $q); $o[$q] = ['understood' => $r['understood'], 'answer' => $r['answer'], 'count' => $r['count'] ?? 0, 'ids' => array_map(fn($p) => (int) $p['id'], $r['people'] ?? []), 'rows' => $r['rows'] ?? [], 'facts' => $r['facts'] ?? [], 'open' => $r['open'] ?? [], 'criteria' => $r['criteria'] ?? null, 'homonyms' => array_map(fn($h) => $h['id'], $r['homonyms'] ?? [])]; }
  catch (Throwable $e) { $o[$q] = ['error' => $e->getMessage()]; }
}
${kiosk ? '@unlink(kiosk_path());' : ''}
echo json_encode($o, JSON_UNESCAPED_UNICODE);
`).trim().split('\n').pop());

(async () => {
    const A = askAll();
    const K = askAll(true);
    const q = s => { const r = A[s]; assert.ok(r, `question absente : ${s}`); return r; };
    const ids = s => [...q(s).ids].sort((a, b) => a - b);
    const u = s => (q(s).understood || []).join(' | ');

    /* ── 1. corrections ── */
    await t('prénom latin : « les enfants de Pierre Mazaud » → Petrus MAZAUD (2 enfants), dit dans « J’ai compris »', () => { assert.deepEqual(ids('les enfants de Pierre Mazaud'), [8, 10]); assert.match(u('les enfants de Pierre Mazaud'), /« Pierre Mazaud » compris comme Petrus MAZAUD/); });
    await t('faute sur le nom : « Petrus Mazeau » n’est plus un lieu ; « Jn Bte » = Jean-Baptiste', () => { assert.deepEqual(ids('les enfants de Petrus Mazeau'), [8, 10]); assert.doesNotMatch(u('les enfants de Petrus Mazeau'), /lieu/); assert.deepEqual(ids('les enfants de Jn Bte Mazaud'), [11]); });
    await t('ce qui marchait marche pareil (Petrus seul, nom exact, homonymes « Jean »)', () => { assert.deepEqual(ids('les enfants de Petrus'), [8, 10]); assert.equal(q('les enfants de Petrus MAZAUD').answer, 'Petrus MAZAUD : 2 enfants.'); assert.deepEqual([...q('les enfants de Jean').homonyms].sort((a, b) => a - b), [2, 10, 16, 18]); });
    await t('« vers 1850 » (± 5 ans), « années 1850 », « les morts de 1916 »', () => {
        assert.deepEqual(ids('qui est né vers 1850'), [9, 16, 17, 19]); assert.match(u('qui est né vers 1850'), /vers 1850 \(1845-1855\)/);
        assert.deepEqual(ids('nés vers 1850 à Tours'), [16, 17, 19], 'Paul Mazaud (1905) n’y est plus');
        assert.deepEqual(ids('nés dans les années 1850'), [9, 17, 19]); assert.deepEqual(ids('les morts de 1916'), [7]);
    });
    await t('« mariés en l’an III » : la date républicaine du mariage est lue (2 personnes, plus « peut-être »)', () => { assert.equal(q('mariés en l\'an III').answer, '2 personnes sont mariées en l’an III.'); assert.deepEqual(ids('mariés en l\'an III'), [14, 15]); });
    await t('minuscules : « les durand nés à lille », « qui est ne a lille », « St Pierre des Corps »', () => {
        assert.deepEqual(ids('les durand nés à lille'), [1, 2, 4, 5, 7]); assert.match(u('les durand nés à lille'), /lieu : Lille/); assert.match(u('les durand nés à lille'), /nom : Durand/);
        assert.deepEqual(ids('qui est ne a lille'), [1, 2, 4, 5, 7]); assert.deepEqual(ids('nés à St Pierre des Corps'), [8, 9, 10]);
    });
    await t('« Jean Durand » seul : la fiche de Jean Durand (résumé), pas tous les Durand', () => { assert.deepEqual(ids('Jean Durand'), [2]); assert.ok(q('Jean Durand').facts.length >= 3); assert.equal(q('Jean Durand').open[0].kind, 'person'); });
    await t('guerre : « mort à la guerre » (Mort pour la France), « mort pendant la guerre de 14 » (et pas les vivants)', () => {
        assert.deepEqual(ids('qui est mort à la guerre'), [7]); assert.match(q('qui est mort à la guerre').answer, /Notés « Mort pour la France » : 1\./);
        assert.deepEqual(ids('qui est mort pendant la guerre de 14'), [7]); assert.match(q('qui est mort pendant la guerre de 14').answer, /Morts pendant la Grande Guerre \(1914-1918\) : 1\. Dont « Mort pour la France » : 1\./);
        assert.equal(q('qui a connu la Grande Guerre').count, 8, 'avoir connu la guerre ne change pas (les vivants de 1914-1918)');
    });
    await t('OU / ET : deux lieux, deux métiers, deux années ; « après … et avant … », « nées à Lille et mariées » ne sont pas coupés', () => {
        assert.deepEqual(ids('les hommes nés à Lille ou à Quimper'), [1, 2, 5, 7, 12]); assert.match(u('les hommes nés à Lille ou à Quimper'), /lieu : Lille ou Quimper/);
        assert.deepEqual(ids('quels ancêtres étaient laboureurs ou tisserands'), [9, 14]); assert.deepEqual(ids('les tisserands et les meuniers'), [14, 18, 21]);
        assert.deepEqual(ids('nés en 1850 ou 1851'), [9, 17]); assert.equal(q('nés en 1850 ou 1851').criteria, null, 'une réponse réunie ne s’enregistre pas comme une seule recherche');
        assert.deepEqual(ids('nés après 1789 et avant 1800'), [18]); assert.deepEqual(ids('les femmes nées à Lille et mariées'), []);
    });
    await t('vivants : notés vivants ou probablement vivants (né il y a moins de 100 ans, sans décès)', () => { assert.deepEqual(ids('les vivants'), [1, 2, 3, 4, 6, 12, 13]); assert.deepEqual(ids('les hommes nés après 1900 encore en vie'), [1, 2, 12]); });
    await t('métier au féminin : « les meunières » = des femmes (pas Jean Combes) ; « les meuniers » inchangé', () => { assert.deepEqual(ids('les meunières'), [21]); assert.match(u('les meunières'), /femmes/); assert.deepEqual(ids('les meuniers'), [18, 21], 'le métier sans le sexe, comme avant'); });
    await t('négations : sans date de décès, pas nées à Lille, pas des ancêtres, sans parents, sans source, sans profession', () => {
        const noDeath = ids('les personnes sans date de décès');
        assert.ok(!noDeath.includes(7) && noDeath.includes(1) && noDeath.length === 15, JSON.stringify(noDeath)); assert.deepEqual(ids('qui n\'a pas de date de décès'), noDeath);
        assert.deepEqual(ids('les femmes qui ne sont pas nées à Lille'), [3, 6, 8, 13, 15, 17, 19, 21]); assert.match(u('les femmes qui ne sont pas nées à Lille'), /pas nées à Lille/);
        assert.deepEqual(ids('les personnes qui ne sont pas des ancêtres'), [1, 4, 10, 11, 12, 13, 16, 17, 21, 22]);
        assert.deepEqual(ids('les personnes sans parents'), [7, 9, 14, 15, 16, 17, 19, 20, 21, 22]);
        assert.equal(q('qui n\'a pas de source').count, 22); assert.deepEqual(ids('les ancêtres sans profession'), [6, 8, 15, 19, 20]);
        assert.deepEqual(ids('quels ancêtres n\'ont pas de parents connus'), [7, 9, 14, 15, 19, 20]);
        assert.equal(q('les personnes sans date de décès').criteria.missing, 'death', 'gardé dans « Enregistrer comme recherche »');
    });
    await t('« mes ancêtres » inchangé (ancêtres de la personne de départ)', () => { assert.match(u('mes ancêtres'), /^parmi les ancêtres de la personne de départ$/); assert.equal(q('mes ancêtres').count, 12); });
    await t('garde-fou : « Je n’ai pas tenu compte de : « 1850 » », « pas »', () => { assert.match(q('les boulangers 1850').answer, /Je n’ai pas tenu compte de : « 1850 »/); assert.match(q('les laboureurs mais pas les tisserands').answer, /« pas »/); });

    /* ── 2. second essai ── */
    await t('second essai (rien compris) : « Durand », « les Le Gall » par la recherche à la française ; « combien de Jean » inchangé', () => {
        assert.deepEqual(ids('Durand'), [1, 2, 4, 5, 7]); assert.match(u('Durand'), /recherche de nom/); assert.deepEqual(ids('les Le Gall'), [3, 12, 13, 20]);
        assert.match(u('combien de Jean'), /^prénom : Jean$/); assert.ok(q('Durand Lille 1850').error, 'rien trouvé : toujours « pas compris »');
    });

    /* ── 3. nouvelles questions ── */
    await t('« moi / mes / ma / mon » : grand-mère paternelle, grands-parents (maternels), arrière-grands-parents, cousins germains, mon lien', () => {
        assert.deepEqual(ids('ma grand-mère paternelle'), [6]); assert.match(u('ma grand-mère paternelle'), /« moi » = la personne de départ : Moi Durand/);
        assert.deepEqual(ids('mes grands-parents'), [5, 6, 20]); assert.deepEqual(ids('mes grands-parents maternels'), [20]); assert.deepEqual(ids('mes arrière-grands-parents'), [7, 8, 18]);
        assert.deepEqual(ids('mes cousins germains'), [13]); assert.match(q('quel est mon lien avec Paul Mazaud').answer, /^Moi Durand est le cousin germain/);
    });
    await t('parenté élargie : oncles, tantes, neveux, beaux-parents, belle-mère, gendres, beaux-frères, parrain, filleuls', () => {
        assert.deepEqual(ids('mes oncles'), [12]); assert.deepEqual(ids('les oncles de Moi Durand'), [12]); assert.deepEqual(ids('les tantes de Sophie Durand'), []);
        assert.deepEqual(ids('les neveux de Yves Le Gall'), [1]); assert.deepEqual(ids('les beaux-parents de Marie Le Gall'), [5, 6]); assert.deepEqual(ids('la belle-mère de Marie Le Gall'), [6]);
        assert.deepEqual(ids('les gendres de Petrus Mazaud'), [7]); assert.deepEqual(ids('les beaux-frères de Jean Durand'), [12]);
        assert.deepEqual(ids('le parrain de Jean Combes'), [16]); assert.deepEqual(ids('les filleuls de Jean Martin'), [18]);
    });
    await t('fautes de frappe : « enfans » → enfants, « boulangés » → boulangers ; « femme », « morts » jamais « corrigés »', () => {
        assert.deepEqual(ids('les enfans de Petrus Mazaud'), [8, 10]); assert.match(u('les enfans de Petrus Mazaud'), /« enfans » lu « enfants »/);
        assert.deepEqual(ids('les boulangés'), [2]); assert.deepEqual(ids('la femme de Jean Durand'), [3]); assert.doesNotMatch(u('morts en 1916'), /lu/);
    });
    await t('« qui est X ? » : résumé + lien vers la fiche (aussi « Pierre Mazaud » = Petrus)', () => {
        const r = q('qui est Petrus Mazaud ?'); assert.equal(r.answer, 'Petrus MAZAUD (1850-1920), laboureur.'); assert.deepEqual(r.open, [{kind: 'person', id: 9, label: 'Ouvrir la fiche'}]);
        assert.ok(r.facts.some(f => f[0] === 'Enfants' && /^2 — /.test(f[1])));
        assert.deepEqual(ids('parle-moi de Pierre Mazaud'), [9]);
    });
    await t('« le même jour que moi » inchangé', () => assert.deepEqual(ids('qui est né le même jour que moi'), [3]));

    /* ── 4. renvois ── */
    await t('renvois : Que manque-t-il ?, Où chercher ?, Contrôle de la base (doublons)', () => {
        assert.equal(q('quels actes me manquent').open[0].kind, 'gaps'); assert.ok(q('quels actes me manquent').rows.length <= 3);
        assert.deepEqual(q('où chercher Petrus Mazaud').open, [{kind: 'ou_chercher', id: 9, label: '🌍 Où chercher ?'}]);
        assert.equal(q('les doublons').open[0].kind, 'controle');
    });
    await t('⚖️ héritiers (dernier calcul du dossier), sans dossier, retards, sans réponse, pièces, introuvables', () => {
        const h = q('les héritiers de Petrus Mazaud'); assert.deepEqual(ids('les héritiers de Petrus Mazaud'), [8, 10]); assert.match(h.answer, /S-2026-01.*calcul enregistré : 2\. Branches encore à rechercher : 1\./s); assert.deepEqual(h.open, [{kind: 'succ_case', id: 1, label: 'Ouvrir le dossier'}]);
        assert.equal(q('les héritiers de Rose Mazaud').open[0].kind, 'succ_new');
        assert.match(q('dossiers en retard').answer, /^Dossiers avec des échéances en retard : 1\./); assert.equal(q('dossiers en retard').rows.length, 1);
        assert.deepEqual(ids('quels héritiers n\'ont pas répondu'), [11]); assert.equal(q('pièces manquantes').rows.length, 1); assert.deepEqual(ids('héritiers introuvables'), [11]);
    });
    await t('mode consultation : rien du ⚖️ (la question n’est pas comprise) ; le reste répond', () => {
        for (const s of ['les héritiers de Petrus Mazaud', 'dossiers en retard', 'quels héritiers n\'ont pas répondu', 'pièces manquantes', 'héritiers introuvables']) { assert.ok(K[s].error && !/S-2026|Mazaud/.test(K[s].error), s); }
        assert.deepEqual(K['les enfants de Pierre Mazaud'].ids.sort((a, b) => a - b), [8, 10]);
    });
    await t('verrou : ask_question passe par la garde commune (api.php) ; recherche enregistrée avec les nouveaux critères', () => {
        const api = fs.readFileSync(path.join(appRoot, 'api.php'), 'utf8'); assert.ok(api.indexOf("'ask_question' =>") > api.indexOf('glock_guard('));
        const out = JSON.parse(php(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); echo json_encode([run_saved_search($pdo, ['not_place' => 'Lille', 'not_place_event' => 'birth', 'gender' => 'female']), saved_search_label(['missing' => 'death', 'no_parents' => 1])], JSON_UNESCAPED_UNICODE);`));
        assert.deepEqual(out[0].sort((a, b) => a - b), [3, 6, 8, 13, 15, 17, 19, 21]); assert.match(out[1], /sans date de décès · sans parents connus/);
    });

    /* ── 5. ⌘K : la détection (dans le navigateur, sans serveur) ── */
    const box = {window: {LCNDA_EXT: {}}, document: {body: {classList: {contains: () => false}}}, localStorage: {getItem: () => null, setItem() {}}, setTimeout, Date};
    box.window.window = box.window; vm.createContext(box);
    vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-questions-plus.js'), 'utf8').replace(/^\(\(\) => \{/, '(() => { const window = globalThis.window;'), box);
    const QP = box.window.LCNDA_EXT.questionsPlus;
    await t('⌘K : vrais positifs (?, mot de question, parenté + de, événement + lieu/date, « le plus », « en moyenne »)', () => {
        for (const s of ['les enfants de Petrus MAZAUD', 'Qui est né en 1850', 'combien de Jean', 'Où est mort Pierre Durand', 'enfants de Petrus', 'frères de Marie', 'nés à Lille', 'morts en 1916', 'mariés avant 1800',
            'Petrus Mazaud a-t-il eu des enfants ?', 'âge moyen au décès en moyenne', 'qui a vécu le plus longtemps', 'mes grands-parents', 'ma grand-mère paternelle', 'liste des boulangers', 'est-ce que Jean Durand est mort',
            'quel est mon lien avec Paul', 'Les Durand nés à Lille', 'héritiers de Petrus', 'Jean Durand ?', 'cousins d\'Anne']) { assert.equal(QP.isQuestion(s), true, s); }
    });
    await t('⌘K : faux positifs (noms qui ressemblent à des mots) : Combes, Frère, Lenfant, Quand, Combien, Marie Durand…', () => {
        for (const s of ['Combes', 'Frère', 'Lenfant', 'Quand', 'Qui', 'Combien', 'Durand', 'Jean Durand', 'Marie Durand', 'Frère Jacques', 'Lenfant Pierre', 'Combes 1850', 'Petrus Mazaud', 'Saint-Pierre-des-Corps',
            'Ma', 'Mesnil Durand', 'Monier Jean', 'Mort', 'Lemort Paul', 'Nes', 'Marie Lille', 'Leplus', 'Durand Lille 1850', 'Lamoyenne Paul', 'Pourquoi', 'Quentin Durand']) { assert.equal(QP.isQuestion(s), false, s); }
    });
    await t('⌘K : la réponse courte (« Petrus MAZAUD : 2 enfants »), les homonymes (« Plusieurs “Jean” : choisir… »)', () => {
        const a = QP.shortAnswer({answer: 'Petrus MAZAUD : 2 enfants.', understood: ['enfants de Petrus MAZAUD (1850-1920)'], count: 2});
        assert.equal(a.label, '🔎 Petrus MAZAUD : 2 enfants'); assert.equal(a.hint, 'J’ai compris : enfants de Petrus MAZAUD (1850-1920)');
        const h = QP.shortAnswer({answer: 'Plusieurs fiches ont le prénom « Jean » : laquelle ? …', understood: [], count: 0, homonyms: [{id: 1}, {id: 2}], facts: [['Prénom', 'Jean'], ['Fiches', '4']]});
        assert.equal(h.label, '🔎 Plusieurs “Jean” : choisir…');
    });

    /* ── 6. le navigateur : écran « Poser une question », ⌘K, XSS, captures ── */
    let pw = null; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { pw = null; } }
    if (!pw) { console.log('— Playwright absent : partie navigateur sautée'); }
    else {
        const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
        const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
        const base = `http://127.0.0.1:${port}/`;
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        if (SHOTS) fs.mkdirSync(SHOTS, {recursive: true});
        const browser = await pw.chromium.launch();
        const errors = [];
        try {
            for (const [name, vp, dark] of [['1440', {width: 1440, height: 950}, false], ['390', {width: 390, height: 860}, false], ['sombre', {width: 1440, height: 950}, true]]) {
                await t(`navigateur ${name} : écran « Poser une question » (renvoi, résumé), ⌘K (ligne tout de suite, puis réponse), XSS`, async () => {
                    const ctx = await browser.newContext({viewport: vp, colorScheme: dark ? 'dark' : 'light'});
                    await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-last-route', '#tableau-de-bord'); } catch (_) {} });
                    const p = await ctx.newPage();
                    p.on('pageerror', e => errors.push(`${name} : ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
                    await p.goto(base);
                    await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.questionsPlus && window.LCNDA_EXT?.question, null, {timeout: 30000});
                    if (dark) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                    const until = async (fn, arg, ms, what) => { try { await p.waitForFunction(fn, arg, {timeout: ms}); } catch (e) { throw new Error(`${what} : ${(await p.evaluate(() => (document.querySelector('#quick-search') || document.querySelector('#h-question-out'))?.innerText || '')).slice(0, 900)}`); } };
                    const noScroll = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'pas de défilement horizontal');
                    // l'écran : « qui est Petrus Mazaud ? » → résumé + « Ouvrir la fiche »
                    await p.evaluate(() => { const st = window.LCNDA_APP.state; st.hQuestion = 'qui est Petrus Mazaud ?'; st.researchKind = 'question'; window.LCNDA_APP.setModule('recherche'); });
                    await until(() => !!document.querySelector('#h-question-out [data-h-question-open]'), null, 20000, 'qui est (écran)');
                    assert.match(await p.locator('#h-question-out').innerText(), /Petrus MAZAUD \(1850-1920\), laboureur/);
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `qp-qui-est-${name}.png`)});
                    await noScroll();
                    // une question à renvoi (⚖️ héritiers) puis le bouton ouvre le dossier
                    await p.fill('#h-question-form input[name=q]', 'les héritiers de Petrus Mazaud'); await p.press('#h-question-form input[name=q]', 'Enter');
                    await until(() => /S-2026-01/.test(document.querySelector('#h-question-out')?.innerText || ''), null, 20000, 'héritiers');
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `qp-heritiers-${name}.png`)});
                    // XSS : un nom piégé dans la réponse et dans « J'ai compris »
                    await p.fill('#h-question-form input[name=q]', 'qui est Xss <img src=x onerror=window.__xss=1>'); await p.press('#h-question-form input[name=q]', 'Enter');
                    await until(() => /qui est : Xss/i.test(document.querySelector('#h-question-out')?.innerText || ''), null, 20000, 'xss écran');
                    await p.waitForTimeout(300);
                    assert.equal(await p.evaluate(() => window.__xss), undefined, 'nom piégé jamais exécuté (écran)');
                    assert.equal(await p.locator('#h-question-out img').count(), 0);
                    // ⌘K : la ligne « Poser la question » tout de suite, puis la réponse courte
                    await p.locator('body').click({position: {x: 5, y: 5}}).catch(() => {});
                    await p.evaluate(() => window.LCNDA_APP.state.hQuestion = '');
                    await p.keyboard.press('Control+KeyK');
                    await p.waitForSelector('#quick-search input', {timeout: 10000});
                    await p.fill('#quick-search input', 'les enfants de Pierre Mazaud');
                    await p.waitForFunction(() => /Poser la question : « les enfants de Pierre Mazaud »|Petrus MAZAUD : 2 enfants/.test(document.querySelector('#quick-search')?.innerText || ''), null, {timeout: 5000});
                    await until(() => /Petrus MAZAUD : 2 enfants/.test(document.querySelector('#quick-search')?.innerText || ''), null, 10000, 'cmdk réponse');
                    assert.match(await p.locator('#quick-search').innerText(), /J’ai compris : enfants de Petrus MAZAUD/);
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `qp-cmdk-${name}.png`)});
                    // homonymes
                    await p.fill('#quick-search input', 'les enfants de Jean');
                    await until(() => /Plusieurs “Jean” : choisir…/.test(document.querySelector('#quick-search')?.innerText || ''), null, 10000, 'homonymes');
                    // un nom : pas de ligne question ; une question qui trouve aussi des personnes : la ligne question en 2e
                    await p.fill('#quick-search input', 'Combes');
                    await p.waitForFunction(() => /François Combes/.test(document.querySelector('#quick-search')?.innerText || ''), null, {timeout: 10000});
                    assert.doesNotMatch(await p.locator('#quick-search').innerText(), /Poser la question/);
                    await p.fill('#quick-search input', 'Les Combes');
                    await p.waitForFunction(() => /François Combes/.test(document.querySelector('#quick-search')?.innerText || '') && /🔎/.test(document.querySelector('#quick-search')?.innerText || ''), null, {timeout: 10000});
                    const rows = await p.locator('#quick-search li[data-qs-index]').allInnerTexts();
                    assert.ok(!/🔎/.test(rows[0]) && /🔎/.test(rows[1] || ''), 'la ligne question passe 2e : ' + rows.slice(0, 3).join(' / '));
                    // XSS dans ⌘K
                    await p.fill('#quick-search input', 'qui est Xss <img src=x onerror=window.__xss=1>');
                    await until(() => /J’ai compris : qui est : Xss/i.test(document.querySelector('#quick-search')?.innerText || ''), null, 10000, 'xss cmdk');
                    assert.equal(await p.locator('#quick-search img').count(), 0); assert.equal(await p.evaluate(() => window.__xss), undefined, 'nom piégé jamais exécuté (⌘K)');
                    // Entrée : l'écran de la question, rempli
                    await p.fill('#quick-search input', 'les enfants de Pierre Mazaud');
                    await p.waitForFunction(() => /Petrus MAZAUD : 2 enfants/.test(document.querySelector('#quick-search')?.innerText || ''), null, {timeout: 10000});
                    await p.keyboard.press('Enter');
                    await p.waitForFunction(() => document.querySelector('#h-question-form input[name=q]')?.value === 'les enfants de Pierre Mazaud', null, {timeout: 10000});
                    // réglage : non → seulement « Poser la question »
                    await p.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'recherche_fr'; window.LCNDA_APP.setModule('maintenance'); });
                    await p.waitForSelector('[data-qp-quick]', {timeout: 20000});
                    if (SHOTS) await p.screenshot({path: path.join(SHOTS, `qp-reglage-${name}.png`)});
                    await noScroll();
                    await p.locator('label:has([data-qp-quick])').click();
                    assert.equal(await p.evaluate(() => window.LCNDA_EXT.questionsPlus.answersOn()), false);
                    await p.keyboard.press('Control+KeyK'); await p.waitForSelector('#quick-search input', {timeout: 10000});
                    await p.fill('#quick-search input', 'les enfants de Pierre Mazaud');
                    await p.waitForFunction(() => /Poser la question/.test(document.querySelector('#quick-search')?.innerText || ''), null, {timeout: 5000});
                    await p.waitForTimeout(900);
                    assert.doesNotMatch(await p.locator('#quick-search').innerText(), /2 enfants/);
                    await p.keyboard.press('Escape');
                    await p.evaluate(() => window.LCNDA_EXT.questionsPlus.setAnswers(true));
                    await p.waitForTimeout(1600); // le réglage part aussi dans la base (comme les autres « genealogie-* ») : on attend l'envoi
                    await ctx.close();
                });
            }
            await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
        } finally { await browser.close(); proc.kill(); }
    }
    if (!process.env.QP_KEEP) fs.rmSync(dir, {recursive: true, force: true}); else console.log('base gardée :', dir);
    if (failed) { console.error(`${failed} échec(s) sur ${checks + failed}.`); process.exit(1); }
    console.log(`✓ questions, suite : ${checks} vérifications`);
})();
