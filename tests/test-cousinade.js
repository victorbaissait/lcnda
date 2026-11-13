'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🎉 Organiser une cousinade (lib/cousinade.php, assets/js/app-cousinade-core.js, assets/js/heritage-cousinade.js) :
 *     node tests/test-cousinade.js        (captures : SHOTS=dossier node tests/test-cousinade.js)
 *  1. les calculs (Node) : foyers et leur nom, modèle d'invitation, mailto, plan de table (foyer jamais coupé), chiffres,
 *     badge, lecture d'un tableau importé ;
 *  2. le serveur (base neuve, migration 86) : descendants VIVANTS d'un couple (morts et fiches confidentielles laissés de côté,
 *     « vivant ? » pour un statut inconnu), conjoints au choix, branches, liens de parenté avec l'ancêtre et avec une personne de
 *     référence jusqu'au cousin issu de germains et au-delà (issu d'issus, générations d'écart, à la mode de Bretagne), contacts
 *     repris du répertoire des vivants et de la fiche, modifiés sans toucher la fiche (sauf la case), réponses, ↶ Annuler
 *     (retirer, réponse, import, nouvelle recherche, suppression du projet), CSRF, mode consultation fermé ;
 *  3. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : liste, projet et ses 6 onglets, badges générés,
 *     invitations par foyer, aucune erreur JavaScript, pas de défilement de côté.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const C = require('../assets/js/app-cousinade-core.js');

const appRoot = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const Y = new Date().getFullYear();

(async () => {
    /* ═════ 1. les calculs ═════ */
    await t('foyers : un par foyer, nom « Paul et Claire MARTIN », adresse, courriels ; « Famille » au-delà de deux', async () => {
        const g = [{id: 1, invited: true, foyer: 'f1', first_name: 'Paul', last_name: 'Martin', person_id: 6, gen: 2, address: '3 rue Haute', postal_code: '19000', city: 'Tulle', country: 'France', email: 'paul@exemple.fr'},
            {id: 2, invited: true, foyer: 'f1', first_name: 'Claire', last_name: 'Martin', person_id: 10, spouse_of: 6, gen: 2, email: 'claire@exemple.fr'},
            {id: 3, invited: true, foyer: 'f3', first_name: 'Luc', last_name: 'Martin', person_id: 11, gen: 3}, {id: 4, invited: true, foyer: 'f3', first_name: 'Ana', last_name: 'Soto', spouse_of: 11, gen: 3},
            {id: 5, invited: true, foyer: 'f3', first_name: 'Léo', last_name: 'Martin', person_id: 14, gen: 4, birth: Y - 9}, {id: 6, invited: false, foyer: 'f6', first_name: 'X', last_name: 'Y'}];
        const f = C.foyers(g);
        assert.equal(f.length, 2);
        const a = f.find(x => x.key === 'f1'); assert.equal(a.name, 'Paul et Claire MARTIN'); assert.deepEqual(a.address, ['3 rue Haute', '19000 TULLE']); assert.deepEqual(a.emails, ['paul@exemple.fr', 'claire@exemple.fr']);
        assert.equal(f.find(x => x.key === 'f3').name, 'Famille MARTIN');
        assert.equal(C.foyerName([g[2], g[3]]), 'Luc MARTIN et Ana SOTO');
    });
    await t('modèle : seuls les champs connus sont remplacés ; mailto prêt (rien n’est envoyé)', async () => {
        assert.equal(C.fill('Chère {foyer}, le {date} à {lieu} {inconnu}', {foyer: 'famille', date: '12 juin', lieu: 'Tulle'}), 'Chère famille, le 12 juin à Tulle {inconnu}');
        const m = C.mailto(['a@x.fr', 'b@x.fr'], 'Cousinade', 'Bonjour\nà tous');
        assert.match(m, /^mailto:a%40x\.fr,b%40x\.fr\?subject=Cousinade&body=Bonjour%0D%0A%C3%A0%20tous$/);
        assert.match(C.mailto(['a@x.fr'], 's', 'b', {bcc: true}), /^mailto:\?bcc=/);
    });
    await t('plan de table : par branche, un foyer jamais coupé, nombre de personnes compté', async () => {
        const g = [];
        for (let i = 1; i <= 7; i++) g.push({id: i, invited: true, answer: 'yes', foyer: 'a' + Math.ceil(i / 2), branch_id: 100, first_name: 'A' + i, last_name: 'X'});
        g.push({id: 20, invited: true, answer: 'yes', foyer: 'b', branch_id: 200, first_name: 'B', last_name: 'Y', people_count: 3}, {id: 21, invited: true, answer: 'maybe', foyer: 'c', branch_id: 200, first_name: 'C', last_name: 'Y'}, {id: 22, invited: true, answer: 'no', foyer: 'd', branch_id: 200, first_name: 'D', last_name: 'Y'});
        const p = C.tablePlan(g, 4);
        for (const fy of ['a1', 'a2', 'a3', 'a4']) { const ids = g.filter(x => x.foyer === fy).map(x => p.byGuest[x.id]); assert.equal(new Set(ids).size, 1, fy); }
        assert.ok(p.tables.every(tb => tb.seats <= 4));
        assert.notEqual(p.byGuest[20], p.byGuest[1], 'chaque branche a sa table');
        assert.equal(p.byGuest[21], undefined); assert.equal(p.byGuest[22], undefined);
        assert.equal(C.tablePlan(g, 4, {maybe: true}).byGuest[21] > 0, true);
    });
    await t('chiffres par branche et régimes ; lecture d’un tableau importé (titres en français, réponses)', async () => {
        const s = C.stats([{id: 1, invited: true, answer: 'yes', branch_id: 1, diet: 'végétarien'}, {id: 2, invited: true, answer: 'no', branch_id: 1}, {id: 3, invited: true, answer: '', branch_id: 2}, {id: 4, invited: false, branch_id: 2}, {id: 5, invited: true, answer: 'yes', branch_id: 2, people_count: 4, diet: 'Végétarien, sans gluten'}], [{id: 1, name: 'Pierre'}, {id: 2, name: 'Louise'}]);
        assert.deepEqual([s.total.invited, s.total.yes, s.total.no, s.total.wait, s.total.people], [4, 2, 1, 1, 5]);
        assert.equal(s.rows[1].people, 4); assert.equal(s.diets[0].n, 2);
        const r = C.rowsToGuests([['Prénom', 'Nom', 'Courriel', 'Réponse', 'Nb de personnes', 'Ville', 'Couleur'], ['Anne', 'Roux', 'anne@x.fr', 'Oui', '3', 'Brive', 'bleu'], ['', 'Peyre', '', 'peut-être', '', '', ''], ['', '', '', '', '', '', '']]);
        assert.equal(r.guests.length, 2); assert.equal(r.unknown, 1);
        assert.deepEqual(r.guests[0], {first_name: 'Anne', last_name: 'Roux', email: 'anne@x.fr', answer: 'yes', people_count: 3, city: 'Brive'});
        assert.equal(r.guests[1].answer, 'maybe');
        assert.equal(C.rowsToGuests([['Invité'], ['Marie DUPONT']]).guests[0].last_name, 'DUPONT');
    });

    /* ═════ 2. le serveur ═════ */
    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-cousinade-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$Y = (int) date('Y');
$people = [[1,'Jean','MARTIN','male','deceased',1880],[2,'Marie','DURAND','female','deceased',1885],[3,'Pierre','MARTIN','male','deceased',1910],[4,'Louise','MARTIN','female','deceased',1912],
 [5,'Anne','ROCHE','female','deceased',1912],[6,'Paul','MARTIN','male','living',1945],[7,'Jeanne','MARTIN','female','deceased',1948],[8,'Henri','BORIE','male','deceased',1908],[9,'Michel','BORIE','male','living',1946],
 [10,'Claire','PETIT','female','living',1947],[11,'Luc','MARTIN','male','living',1975],[12,'Sophie','LEROY','female','living',1972],[13,'Emma','BORIE','female','living',1978],[14,'Léo','MARTIN','male','unknown',$Y-9],
 [15,'Hugo','BORIE','male','living',2001],[16,'Secret','MARTIN','male','living',1980],[17,'Zoé','BORIE','female','living',2024],[18,'Vieux','MARTIN','male','unknown',1890],[19,'Ana','SOTO','female','living',1976],[20,'Autre','DUPRE','male','living',1950]];
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ($people as $r) { $ins->execute([$r[0],$r[1],$r[2],$r[3],$r[4]]); }
$pdo->exec('UPDATE persons SET is_private=1 WHERE id=16');
$b = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',?,?,?,?)");
foreach ($people as $r) { $ev->execute([$r[0],$b,(string)$r[5],$r[5]]); }
// familles : Jean+Marie → Pierre, Louise, Vieux ; Pierre+Anne → Paul, Jeanne ; Louise+Henri → Michel ; Paul+Claire → Luc, Secret ; Jeanne+? → Sophie ; Michel → Emma ; Luc+Ana → Léo ; Emma → Hugo ; Hugo → Zoé
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,3,5),(3,8,4),(4,6,10),(5,NULL,7),(6,9,NULL),(7,11,19),(8,NULL,13),(9,15,NULL),(10,1,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(1,4),(1,18),(2,6),(2,7),(3,9),(4,11),(4,16),(5,12),(6,13),(7,14),(8,15),(9,17),(10,20)");
$pdo->exec("INSERT INTO living_contacts(person_id,first_name,last_name,email,phone_mobile,address,postal_code,city,country) VALUES(6,'Paul','MARTIN','paul@exemple.fr','0612345678','3 rue Haute','19000','Tulle','France')");
$pdo->exec("INSERT INTO places(id,name,country) VALUES(1,'Brive','France')");
$r = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='RESI' LIMIT 1")->fetchColumn();
if ($r) { $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id,address) VALUES('person',13,?,'2020',2020,1,'8 avenue Foch')")->execute([$r]); }
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (op, q = {}) => (await fetch(`${base}api.php?action=cousinade&${new URLSearchParams({op, ...q})}`, { headers: { Cookie: cookie } })).json();
    const post = async (body, token = csrf) => { const r = await fetch(`${base}api.php?action=cousinade_write`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const w = async body => { const r = await post(body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.result; };
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env });
    let cid = 0, D = null;
    const byName = first => D.guests.find(g => g.first_name === first);
    try {
        await t('migration 86 : les tables existent ; aperçu : descendants vivants, conjoints, « vivant ? », confidentiels à part', async () => {
            const st = await (await fetch(`${base}api.php?action=schema_status`, { headers: { Cookie: cookie } })).json(); assert.ok(st.version >= 86, String(st.version));
            assert.match(php("echo $pdo->query(\"SELECT count(*) FROM sqlite_master WHERE name IN ('cousinades','cousinade_guests')\")->fetchColumn();").stdout, /^2$/);
            const p = await get('preview', { ancestor_id: 1, ancestor2_id: 2, spouses: 1 });
            // vivants : Paul, Michel, Luc, Sophie, Emma, Léo (?), Hugo, Zoé = 8 descendants ; + Claire, Ana = 2 conjoints
            assert.equal(p.descendants, 8, JSON.stringify(p)); assert.equal(p.found, 10); assert.equal(p.doubt, 1); assert.equal(p.private, 1); assert.equal(p.branches, 2);
            assert.equal((await get('preview', { ancestor_id: 1, ancestor2_id: 2, spouses: 0 })).found, 8);
        });
        await t('créer : invités trouvés, ni morts, ni confidentiel, ni l’enfant d’un autre lit (couple) ; CSRF obligatoire', async () => {
            assert.ok((await post({ op: 'save', ancestor_id: 1 }, 'faux')).status >= 400);
            assert.equal((await post({ op: 'save', ancestor_id: 16 })).status, 422, 'un ancêtre confidentiel est refusé');
            const r = await w({ op: 'save', ancestor_id: 1, ancestor2_id: 2, ref_id: 11, date_text: '12 juin 2027', place_id: 1, include_spouses: 1 });
            cid = r.id; assert.equal(r.fill.added.length, 10);
            D = await get('get', { id: cid });
            const names = D.guests.map(g => g.first_name).sort();
            assert.deepEqual(names, ['Ana', 'Claire', 'Emma', 'Hugo', 'Luc', 'Léo', 'Michel', 'Paul', 'Sophie', 'Zoé'].sort());
            assert.equal(D.title, 'Cousinade MARTIN'); assert.equal(D.place_text, 'Brive');
            assert.equal(D.ancestor_name, 'Jean MARTIN et Marie DURAND');
            assert.ok(!JSON.stringify(D).includes('Secret'), 'la fiche confidentielle n’apparaît nulle part');
            assert.deepEqual(D.branches.map(b => b.first), ['Pierre', 'Louise']);
            assert.equal(byName('Léo').doubt, true); assert.equal(byName('Luc').doubt, false);
        });
        await t('liens avec l’ancêtre : fils… arrière-arrière-arrière-petite-fille ; conjoints', async () => {
            assert.equal(byName('Paul').kin_ancestor, 'petit-fils');
            assert.equal(byName('Luc').kin_ancestor, 'arrière-petit-fils');
            assert.equal(byName('Hugo').kin_ancestor, 'arrière-arrière-petit-fils');
            assert.equal(byName('Zoé').kin_ancestor, 'arrière-arrière-arrière-petite-fille');
            assert.equal(byName('Claire').kin_ancestor, 'épouse du petit-fils');
            assert.equal(byName('Paul').branch_id, 3); assert.equal(byName('Michel').branch_id, 4); assert.equal(byName('Claire').branch_id, 3);
        });
        await t('liens avec la personne de référence (Luc) : cousine germaine, issue de germains, générations d’écart, mode de Bretagne', async () => {
            assert.equal(byName('Luc').kin_ref, 'self');
            assert.equal(byName('Paul').kin_ref, 'père'); assert.equal(byName('Claire').kin_ref, 'mère'); assert.equal(byName('Léo').kin_ref, 'fils');
            assert.equal(byName('Sophie').kin_ref, 'cousine germaine');
            assert.equal(byName('Emma').kin_ref, 'cousine issue de germains');
            assert.equal(byName('Hugo').kin_ref, 'cousin issu de germains avec 1 génération d’écart');
            assert.equal(byName('Zoé').kin_ref, 'cousine issue de germains avec 2 générations d’écart');
            assert.match(byName('Michel').kin_ref, /^oncle à la mode de Bretagne/);
            assert.equal(byName('Ana').kin_ref, 'épouse');
        });
        await t('au-delà : avec Zoé comme référence, Léo est « cousin issu d’issus de germains avec 1 génération d’écart » ; changer la référence ne touche rien d’autre', async () => {
            await w({ op: 'save', id: cid, ref_id: 17 });
            D = await get('get', { id: cid });
            assert.equal(byName('Léo').kin_ref, 'cousin issu d’issus de germains avec 1 génération d’écart');
            assert.equal(byName('Emma').kin_ref, 'grand-mère');
            assert.equal(D.date_text, '12 juin 2027'); assert.equal(D.ancestor2_id, 2); assert.equal(D.place_text, 'Brive');
            await w({ op: 'save', id: cid, ref_id: 11 }); D = await get('get', { id: cid });
        });
        await t('foyers par défaut : le conjoint et l’enfant mineur avec le descendant ; une invitation par foyer', async () => {
            assert.equal(byName('Claire').foyer, byName('Paul').foyer);
            assert.equal(byName('Léo').foyer, byName('Luc').foyer); assert.equal(byName('Ana').foyer, byName('Luc').foyer);
            assert.equal(byName('Zoé').foyer, byName('Hugo').foyer, 'Zoé (mineure) suit son parent Hugo');
            const f = C.foyers(D.guests);
            assert.equal(f.length, 6, f.map(x => x.name).join(' | ')); // Paul+Claire, Michel, Luc+Ana+Léo, Sophie, Emma, Hugo+Zoé
            assert.ok(f.some(x => x.name === 'Paul MARTIN et Claire PETIT')); assert.ok(f.some(x => x.name === 'Famille MARTIN'));
        });
        await t('coordonnées : reprises du répertoire des vivants (Paul) et de la résidence de la fiche (Emma) ; modifiées ici sans toucher la fiche', async () => {
            const paul = byName('Paul'); assert.equal(paul.email, 'paul@exemple.fr'); assert.equal(paul.city, 'Tulle');
            const emma = byName('Emma'); assert.equal(emma.address, '8 avenue Foch'); assert.equal(emma.city, 'Brive');
            await w({ op: 'guest_save', cousinade_id: cid, id: paul.id, email: 'paul.nouveau@exemple.fr' });
            assert.match(php("echo $pdo->query('SELECT email FROM living_contacts WHERE person_id=6')->fetchColumn();").stdout, /^paul@exemple\.fr$/);
            assert.equal((await post({ op: 'guest_save', cousinade_id: cid, id: paul.id, email: 'pas un courriel' })).status, 422);
            await w({ op: 'guest_save', cousinade_id: cid, id: emma.id, email: 'emma@exemple.fr', phone: '0700000000', to_contacts: 1 });
            assert.match(php("echo $pdo->query('SELECT email||\"|\"||city FROM living_contacts WHERE person_id=13')->fetchColumn();").stdout, /^emma@exemple\.fr\|Brive$/);
        });
        await t('réponses, nombre, régime ; « ↶ Annuler » une réponse donnée à plusieurs', async () => {
            const ids = [byName('Paul').id, byName('Claire').id];
            const r = await w({ op: 'guests_set', cousinade_id: cid, ids, field: 'answer', value: 'yes' });
            assert.equal(r.count, 2);
            await w({ op: 'guest_save', cousinade_id: cid, id: byName('Michel').id, answer: 'maybe', people_count: 2, diet: 'végétarien' });
            assert.equal((await post({ op: 'guests_set', cousinade_id: cid, ids, field: 'answer', value: 'bof' })).status, 422);
            assert.equal((await post({ op: 'guests_set', cousinade_id: cid, ids, field: 'living_doubt', value: 1 })).status, 422);
            assert.equal((await post({ op: 'guest_save', cousinade_id: cid, id: ids[0], people_count: 500 })).status, 422);
            D = await get('get', { id: cid }); assert.equal(byName('Paul').answer, 'yes'); assert.equal(byName('Michel').people_count, 2);
            await w({ op: 'guests_set', cousinade_id: cid, field: 'answer', values: r.prev });
            D = await get('get', { id: cid }); assert.equal(byName('Paul').answer, ''); assert.equal(byName('Claire').answer, '');
            await w({ op: 'guests_set', cousinade_id: cid, ids, field: 'answer', value: 'yes' });
            await w({ op: 'guests_set', cousinade_id: cid, ids: [byName('Luc').id, byName('Ana').id, byName('Léo').id, byName('Sophie').id], field: 'answer', value: 'yes' });
            await w({ op: 'guests_set', cousinade_id: cid, ids: [byName('Hugo').id], field: 'answer', value: 'no' });
            D = await get('get', { id: cid });
            const s = C.stats(D.guests, D.branches);
            assert.equal(s.total.yes, 6); assert.equal(s.total.no, 1); assert.equal(s.total.maybe, 1); assert.equal(s.total.wait, 2);
            assert.equal(s.rows.find(x => x.id === 3).yes, 6);
        });
        await t('retirer un invité puis « ↶ Annuler » ; une nouvelle recherche ne le remet pas', async () => {
            const z = byName('Zoé');
            await w({ op: 'guests_delete', cousinade_id: cid, ids: [z.id] });
            D = await get('get', { id: cid }); assert.equal(byName('Zoé'), undefined);
            assert.equal((await w({ op: 'rescan', id: cid })).added.length, 0, 'retiré à la main : ne revient pas tout seul');
            await w({ op: 'guests_restore', cousinade_id: cid, ids: [z.id] });
            D = await get('get', { id: cid }); assert.ok(byName('Zoé'));
        });
        await t('nouvelle recherche : un descendant ajouté à l’arbre entre, « ↶ Annuler » le retire', async () => {
            php("$pdo->exec(\"INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(30,'Nina','BORIE','female','living')\"); $pdo->exec('INSERT INTO family_children(family_id,child_id) VALUES(8,30)');");
            const r = await w({ op: 'rescan', id: cid }); assert.equal(r.added.length, 1);
            D = await get('get', { id: cid }); assert.equal(byName('Nina').kin_ref, 'cousine issue de germains avec 1 génération d’écart');
            await w({ op: 'guests_purge', cousinade_id: cid, ids: r.added });
            D = await get('get', { id: cid }); assert.equal(byName('Nina'), undefined);
        });
        await t('importer une liste : met à jour les invités de même nom, ajoute les autres ; « ↶ Annuler » remet tout', async () => {
            const r = await w({ op: 'import', cousinade_id: cid, rows: [{ first_name: 'Sophie', last_name: 'Leroy', email: 'sophie@exemple.fr', answer: 'no' }, { first_name: 'Rémi', last_name: 'Faure', city: 'Uzerche', answer: 'yes', people_count: 3, email: 'faux' }] });
            assert.equal(r.added.length, 1); assert.equal(r.updated.length, 1);
            D = await get('get', { id: cid });
            assert.equal(byName('Sophie').email, 'sophie@exemple.fr'); assert.equal(byName('Sophie').answer, 'no');
            const remi = byName('Rémi'); assert.equal(remi.person_id, null); assert.equal(remi.people_count, 3); assert.equal(remi.email, '', 'un courriel faux n’entre pas');
            await w({ op: 'import_undo', cousinade_id: cid, added: r.added, updated: r.updated });
            D = await get('get', { id: cid }); assert.equal(byName('Rémi'), undefined); assert.equal(byName('Sophie').email, ''); assert.equal(byName('Sophie').answer, 'yes');
        });
        await t('ajouter à la main (fiche ou nom libre) ; refus d’un doublon et d’une fiche confidentielle', async () => {
            const a = await w({ op: 'guest_save', cousinade_id: cid, person_id: 20, answer: 'yes' }); assert.ok(a.id);
            assert.equal((await post({ op: 'guest_save', cousinade_id: cid, person_id: 20 })).status, 422);
            assert.equal((await post({ op: 'guest_save', cousinade_id: cid, person_id: 16 })).status, 422);
            assert.equal((await post({ op: 'guest_save', cousinade_id: cid, first_name: ' ', last_name: '' })).status, 422);
            const b = await w({ op: 'guest_save', cousinade_id: cid, first_name: 'Tante', last_name: 'Odette', branch_id: 4 });
            D = await get('get', { id: cid }); assert.equal(byName('Tante').branch_id, 4); assert.equal(byName('Autre').kin_ancestor, 'fils', 'un fils de Jean hors du couple, ajouté à la main');
            await w({ op: 'guests_delete', cousinade_id: cid, ids: [a.id, b.id] });
        });
        await t('réglages du projet (couleurs, album) bornés ; fiche devenue confidentielle cachée ; supprimer puis « ↶ Annuler »', async () => {
            const r = await w({ op: 'options', id: cid, patch: { branchColors: { 3: '#123456', 4: 'red;}' }, album: [999], evil: 1, badges: { rel: 'both' } } });
            assert.deepEqual(r.options.branchColors, { 3: '#123456' }); assert.deepEqual(r.options.album, []); assert.equal(r.options.evil, undefined);
            php('$pdo->exec("UPDATE persons SET is_private=1 WHERE id=12");');
            D = await get('get', { id: cid }); assert.equal(byName('Sophie'), undefined); assert.equal(D.hidden, 1);
            php('$pdo->exec("UPDATE persons SET is_private=0 WHERE id=12");');
            await w({ op: 'delete', id: cid }); assert.equal((await get('list')).items.length, 0);
            await w({ op: 'restore', id: cid }); assert.equal((await get('list')).items.length, 1);
            D = await get('get', { id: cid });
        });
        await t('mode consultation : rien ne se lit, rien ne s’écrit', async () => {
            const act = async (action, body) => (await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).status;
            assert.equal(await act('kiosk_enter', { password: 'secret1' }), 200);
            try {
                const r = await fetch(`${base}api.php?action=cousinade&op=get&id=${cid}`, { headers: { Cookie: cookie } }); assert.notEqual(r.status, 200);
                assert.doesNotMatch(await r.text(), /paul@exemple/);
                assert.notEqual((await post({ op: 'guests_set', cousinade_id: cid, ids: [1], field: 'answer', value: 'yes' })).status, 200);
            } finally { assert.equal(await act('kiosk_exit', { password: 'secret1' }), 200); }
        });

        /* ═════ 3. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        await w({ op: 'guests_set', cousinade_id: cid, ids: [byName('Michel').id], field: 'table_no', value: 2 });
        const browser = await chromium.launch();
        const shot = async (pg, name, full = false) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }); } };
        const open = async (w0, h0, dark) => {
            const ctx = await browser.newContext({ viewport: { width: w0, height: h0 }, colorScheme: dark ? 'dark' : 'light' });
            if (dark) await ctx.addInitScript(() => { try { localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); } catch (_) {} }); // le vrai mode sombre de l’app (preset « dark »)
            const pg = await ctx.newPage(); const errs = [];
            pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
            await pg.goto(base + '#listes'); await pg.waitForFunction(() => window.LCNDA_EXT?.cousinade && window.LCNDA_APP?.setModule, null, { timeout: 15000 });
            return { ctx, pg, errs };
        };
        const noSide = async pg => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
        try {
            for (const [w0, h0, dark, tag] of [[1440, 900, false, '1440'], [390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                await t(`navigateur ${tag} : liste, projet et ses 6 onglets, sans erreur`, async () => {
                    const { ctx, pg, errs } = await open(w0, h0, dark);
                    await pg.evaluate(() => window.LCNDA_EXT.cousinade.open(0)); await pg.waitForSelector('[data-cous-open]');
                    assert.ok(await pg.locator('[data-side-value="cousinades"]').count() >= (w0 > 800 ? 1 : 0));
                    await shot(pg, `liste-${tag}`);
                    await pg.click('[data-cous-open]'); await pg.waitForSelector('.cous-tabs');
                    await pg.waitForSelector('.cous-table, .ui-cards'); await pg.waitForTimeout(400); await noSide(pg); await shot(pg, `invites-${tag}`, true);
                    for (const tab of ['invit', 'badges', 'tree', 'day', 'stats']) {
                        await pg.click(`[data-cous-tab="${tab}"]`); await pg.waitForTimeout(500); await noSide(pg); await shot(pg, `${tab}-${tag}`, true);
                    }
                    await pg.click('[data-cous-tab="day"]'); await pg.click('[data-cous-sub="tables"]'); await pg.waitForTimeout(300); await shot(pg, `tables-${tag}`, true);
                    await pg.click('[data-cous-tab="guests"]'); await pg.waitForTimeout(300);
                    assert.deepEqual(errs, []); await ctx.close();
                });
            }
            await t('badges générés (photo, branche, lien), invitations par foyer, nouvelle cousinade (K1), cocher ↶ Annuler, grand arbre', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.evaluate(id => window.LCNDA_EXT.cousinade.open(id), cid); await pg.waitForSelector('.cous-table');
                // une case décochée → message H7 avec ↶ Annuler, qui la recoche
                const box = pg.locator('[data-cous-inv]').first(); await box.uncheck(); await pg.waitForSelector('.ui-toast-btn', { timeout: 5000 });
                await pg.locator('.ui-toast-btn', { hasText: 'Annuler' }).last().click(); await pg.waitForTimeout(1200);
                assert.equal(await pg.locator('[data-cous-inv]').first().isChecked(), true);
                // badges : une planche par 8, la branche, le lien
                const b = await pg.evaluate(() => { const d = window.LCNDA_EXT.cousinade; return fetch('api.php?action=cousinade&op=get&id=' + document.querySelector('[data-cous-project]').dataset.cousProject).then(r => r.json()).then(D => { const pages = d.badgePages(D, {rel: 'both', photo: true, qr: true, per: '8', who: 'inv'}); return {n: pages.length, html: pages.map(p => p.html).join('')}; }); });
                assert.equal(b.n, 2, '10 invités cochés → 2 planches de 8');
                assert.match(b.html, /Branche Pierre/); assert.match(b.html, /Cousine germaine de Luc/); assert.match(b.html, /Arrière-petit-fils de Jean MARTIN et Marie DURAND/); assert.match(b.html, /<svg/);
                await pg.click('[data-cous-tab="badges"]'); await pg.waitForSelector('.cous-badge'); assert.ok(await pg.locator('.cous-sheet-prev .cous-badge').count() >= 4);
                // invitations : une par foyer
                await pg.click('[data-cous-tab="invit"]'); await pg.waitForSelector('[data-cous-letter]');
                assert.match(await pg.textContent('.cous-page'), /6 foyers à inviter/);
                assert.match(await pg.textContent('[data-cous-letter]'), /Jean MARTIN et Marie DURAND/);
                assert.ok(await pg.locator('a[href^="mailto:"]').count() >= 2);
                await pg.click('[data-cous-print-inv]'); await pg.waitForSelector('dialog.k-print[open]'); await pg.waitForTimeout(1200);
                const pages = await pg.evaluate(() => document.querySelector('dialog.k-print [data-k-pgtxt]')?.textContent || ''); assert.match(pages, /6/);
                await shot(pg, 'imprimer-invitations'); await pg.click('dialog.k-print [data-k-x]');
                // grand arbre : un dessin, une case par descendant non confidentiel
                const doc = await pg.evaluate(() => fetch('api.php?action=cousinade&op=get&id=' + document.querySelector('[data-cous-project]').dataset.cousProject).then(r => r.json()).then(D => window.LCNDA_EXT.cousinade.buildTree(D, {format: 'a1', theme: 'classique', gens: 6, spouses: true, photos: true, title: 'Test'})));
                const json = JSON.stringify(doc); assert.ok(!/Secret/.test(json)); assert.match(json, /Zoé BORIE/); assert.match(json, /Photos du jour/);
                // ＋ Nouvelle cousinade : sans ancêtre → K1
                await pg.evaluate(() => window.LCNDA_EXT.cousinade.open(0)); await pg.waitForSelector('[data-cous-new]');
                await pg.click('[data-cous-new]'); await pg.waitForSelector('dialog[open] .cous-form'); await shot(pg, 'nouvelle');
                await pg.click('dialog[open] button[type=submit]'); await pg.waitForTimeout(400);
                assert.match(await pg.textContent('dialog[open]'), /Choisis l’ancêtre/);
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('⋯ de la fiche : « 🎉 Organiser une cousinade… » ; Outils de modification', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                const items = await pg.evaluate(() => window.LCNDA_EXT.personMoreItems.map(f => { try { return f({person: {id: 1}})?.label; } catch (_) { return null; } }).filter(Boolean));
                assert.ok(items.includes('Organiser une cousinade…'));
                assert.ok(await pg.evaluate(() => window.LCNDA_EXT.editToolsExtra.some(x => x.key === 'cousinade')));
                assert.deepEqual(errs, []); await ctx.close();
            });
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
        if (failed) { console.error(`✗ ${failed} échec(s)`); process.exitCode = 1; } else console.log('✓ tout est bon');
    }
})();
