#!/usr/bin/env node
/* ⭐ Parents célèbres (lib/parents_celebres.php, assets/js/heritage-parents-celebres.js, assets/css/pistes-branches-celebres.css).
 * Wikidata et WikiTree sont remplacés par des réponses enregistrées (tests/fixtures/parents-celebres/ : forme réelle des API,
 * personnes et liens FICTIFS ; GENEALOGY_TEST=1 + LCNDA_TEST_CELEB_DIR) ; chaque appel est noté dans calls.log.
 *  1. serveur : remonter les liens de famille de Wikidata (P22, P25, P26, P40, P3373) depuis une fiche reliée, garder les
 *     personnes connues, le chemin complet (arbre + Wikidata) et le nombre de degrés ; jamais une fiche vivante ou confidentielle
 *     envoyée ; « Proposer des fiches Wikidata » (rapprochement prudent : nom, prénom, années) puis ✓ C'est lui / ✗ Pas lui et ↶ ;
 *     WikiTree (getConnections) pour une fiche qui a un identifiant WikiTree, refusé pour une personne vivante ;
 *  2. écran : Listes → « ⭐ Parents célèbres », la ligne de la fiche (« Parent éloigné de… », le chemin, « à vérifier »), WikiTree.
 *   node tests/test-parents-celebres.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FX = path.join(__dirname, 'fixtures/parents-celebres');

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-pc-')), net0 = path.join(tmp, 'net');
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true}); fs.cpSync(FX, net0, {recursive: true});
    const calls = () => { try { return fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_CELEB_DIR: net0};
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    const q = sql => JSON.parse(php(`$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`) || '[]');
    php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,is_private,wikidata_id) VALUES
 (1,'Jan','MAZAUD','male','deceased',1,0,''),(2,'Pieter','MAZAUD','male','deceased',0,0,'Q9000002'),(3,'Maria','LACOMBE','female','deceased',0,0,''),
 (4,'Paul','DURAND','male','living',0,0,'Q9000050'),(5,'Anne','LACOMBE','female','deceased',0,1,''),(6,'Louis','DURAND','male','unknown',0,0,'')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,1,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,4)");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',?,?,?,?)");
foreach ([[1,'BIRT',1850],[1,'DEAT',1910],[2,'BIRT',1820],[2,'DEAT',1880],[3,'BIRT',1824],[3,'DEAT',1890],[4,'BIRT',1980],[5,'BIRT',1830],[5,'DEAT',1900],[6,'BIRT',1950]] as [$p,$g,$y]) { $ins->execute([$p,$t($g),(string)$y,$y]); }
echo 'ok';`);
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.parentsCelebres)) { // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
            await p.addStyleTag({url: base + 'assets/css/pistes-branches-celebres.css'});
            await p.addScriptTag({url: base + 'assets/js/heritage-pistes-auto.js'});
            await p.addScriptTag({url: base + 'assets/js/heritage-parents-celebres.js'});
        }
        const api = (x, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, qq]);
        const post = (x, b) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).then(r => r.result ?? r).catch(e => ({error: e.message})), [x, b]);
        const runAll = async id => { let r, n = 0; do { r = await post('celeb_step', {id}); n++; } while (r.job?.status === 'running' && n < 80); return r; };
        const undo = async re => {
            await p.waitForFunction(src => [...document.querySelectorAll('.ui-toast, .toast')].some(x => new RegExp(src).test(x.textContent)), re.source, {timeout: 10000});
            const h = await p.evaluateHandle(src => { const box = [...document.querySelectorAll('.ui-toast, .toast')].reverse().find(x => new RegExp(src).test(x.textContent)); return [...(box ? box.querySelectorAll('button') : [])].find(b => /Annuler/.test(b.textContent)); }, re.source);
            await h.asElement().click();
        };

        /* ═════════ 1. le serveur ═════════ */
        await t('celeb_start : on remonte Wikidata depuis Pieter MAZAUD (Q9000002) ; jamais Paul DURAND (vivant, Q9000050)', async () => {
            const s = await post('celeb_start', {scope: 'all'});
            assert.strictEqual(s.job.total, 1, 'une seule fiche de départ : Pieter (Paul est vivant)');
            const r = await runAll(s.job.id);
            assert.strictEqual(r.job.status, 'done', JSON.stringify(r).slice(0, 300)); assert.strictEqual(r.job.counts.found, 2);
            const c = calls().join('\n');
            assert.match(c, /wbgetentities Q9000002/); assert.match(c, /Q9000010/); assert.match(c, /Q9000100/);
            assert.ok(!/Q9000050/.test(c), 'rien pour une personne vivante');
            const f = q('SELECT celeb_q, hops, label FROM pcel_found ORDER BY hops');
            assert.deepStrictEqual(f.map(x => [x.celeb_q, x.hops]), [['Q9000012', 2], ['Q9000100', 3]]);
        });
        await t('celeb_person (Jan) : « Parent éloigné de Armand Mazaud, 3 degrés » — 1 lien dans l’arbre, 2 dans Wikidata, chaque maillon sourcé', async () => {
            const r = await api('celeb_person', {id: 1});
            const a = r.results[0];
            assert.strictEqual(a.label, 'Armand Mazaud'); assert.strictEqual(a.degrees, 3); assert.strictEqual(a.by_marriage, false);
            assert.deepStrictEqual(a.tree.map(x => [x.id, x.rel]), [[2, 'father']]);
            assert.deepStrictEqual(a.wikidata.map(h => [h.q, h.prop]), [['Q9000010', 'P22'], ['Q9000012', 'P40']]);
            assert.strictEqual(a.wikidata[0].from_url, 'https://www.wikidata.org/wiki/Q9000002#P22');
            assert.strictEqual(a.url, 'https://www.wikidata.org/wiki/Q9000012'); assert.match(a.wiki_url, /fr\.wikipedia\.org\/wiki\/Armand_Mazaud/);
            const b = r.results[1];
            assert.strictEqual(b.label, 'Célestin Lacombe'); assert.strictEqual(b.degrees, 4); assert.strictEqual(b.by_marriage, true);
            assert.deepStrictEqual(b.wikidata.map(h => h.prop), ['P22', 'P3373', 'P26']);
        });
        await t('celeb_list : vu depuis la personne de départ, avec les fiches reliées', async () => {
            const r = await api('celeb_list');
            assert.deepStrictEqual(r.rows.map(x => [x.label, x.degrees]), [['Armand Mazaud', 3], ['Célestin Lacombe', 4]]);
            assert.deepStrictEqual(r.linked.map(l => l.q), ['Q9000002'], 'Paul (vivant) n’est pas un point de départ');
        });
        await t('« Proposer des fiches Wikidata » : Maria LACOMBE = Q9000003 (pas Q9000004, née en 1700) ; rien pour Anne (confidentielle) ni Louis', async () => {
            const s = await post('celeb_propose_start', {scope: 'all'});
            assert.deepStrictEqual(s.job.total, 2, 'Jan et Maria (Pieter est déjà relié ; Paul vivant, Anne confidentielle, Louis né en 1950)');
            const r = await runAll(s.job.id); assert.strictEqual(r.job.status, 'done');
            const c = calls().filter(l => l.startsWith('wbsearchentities')).join('\n');
            assert.match(c, /Maria LACOMBE/); assert.match(c, /Jan MAZAUD/); assert.ok(!/Anne|Louis|Paul/.test(c), c);
            const pr = (await api('celeb_proposals')).rows;
            assert.deepStrictEqual(pr.map(x => [x.person_id, x.q]), [[3, 'Q9000003']]);
            assert.match(pr[0].why.map(w => w[1]).join(' '), /né\(e\) la même année \(1824\)/);
        });
        await t('✓ C’est lui → l’identifiant Wikidata sur la fiche, ↶ le retire ; ✗ Pas lui retenu, ↶', async () => {
            const ok = await post('celeb_link_ok', {person_id: 3, q: 'Q9000003'});
            assert.strictEqual(q('SELECT wikidata_id FROM persons WHERE id=3')[0].wikidata_id, 'Q9000003');
            await post('celeb_link_undo', {person_id: 3, q: 'Q9000003', before: ok.before});
            assert.strictEqual(q('SELECT wikidata_id FROM persons WHERE id=3')[0].wikidata_id, '');
            await post('celeb_link_no', {person_id: 3, q: 'Q9000003'});
            assert.strictEqual((await api('celeb_proposals')).rows.length, 0);
            await post('celeb_link_unno', {person_id: 3, q: 'Q9000003'});
            assert.strictEqual((await api('celeb_proposals')).rows.length, 1);
        });
        await t('🌲 WikiTree : identifiant de Pieter (Mazaud-12), Connection Finder vers Célestin Lacombe (Lacombe-100, donné par Wikidata P2949) ; refusé pour Paul (vivant)', async () => {
            const tg = (await api('celeb_about')).targets;
            assert.ok(tg.some(x => x.wt === 'Hugo-215') && tg.some(x => x.wt === 'Lacombe-100'));
            assert.ok((await post('celeb_wikitree_set', {person_id: 2, wt: 'https://www.wikitree.com/wiki/Mazaud-12'})).ok);
            const r = await post('celeb_wikitree_check', {person_id: 2, target: 'Lacombe-100'});
            assert.strictEqual(r.result.length, 3); assert.deepStrictEqual(r.result.path.map(x => x.wt), ['Mazaud-12', 'Mazaud-10', 'Mazaud-11', 'Lacombe-100']);
            assert.match(r.finder_url, /Special:Connection.*person1Name=Mazaud-12.*person2Name=Lacombe-100/);
            assert.match(calls().join('\n'), /getConnections Mazaud-12,Lacombe-100/);
            await post('celeb_wikitree_set', {person_id: 4, wt: 'Durand-1'});
            const no = await post('celeb_wikitree_check', {person_id: 4, target: 'Lacombe-100'});
            assert.match(no.error || '', /vivante/); assert.ok(!/Durand-1/.test(calls().join('\n')));
            assert.ok((await post('celeb_wikitree_set', {person_id: 2, wt: 'pas un identifiant'})).error);
        });
        await t('hors ligne : la recherche se met en pause avec un message clair', async () => {
            fs.renameSync(path.join(net0, 'online'), path.join(net0, 'online.off'));
            php(`$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');$p->exec('DELETE FROM pcel_cache');`);
            fs.renameSync(path.join(net0, 'wd-Q9000002.json'), path.join(net0, 'wd-Q9000002.off'));
            const s = await post('celeb_start', {scope: 'all'});
            const r = await runAll(s.job.id);
            assert.strictEqual(r.job.status, 'paused'); assert.match(r.job.message, /Internet/);
            fs.renameSync(path.join(net0, 'online.off'), path.join(net0, 'online')); fs.renameSync(path.join(net0, 'wd-Q9000002.off'), path.join(net0, 'wd-Q9000002.json'));
            await post('celeb_resume', {id: s.job.id}); const r2 = await runAll(s.job.id); assert.strictEqual(r2.job.status, 'done');
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('Listes → ⭐ Parents célèbres : les personnages, le chemin, les sources ↗, « à vérifier », la proposition', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_celebres'; A.setModule('listes'); });
            await p.waitForSelector('[data-pc-results] .pc-row', {timeout: 20000});
            const txt = await p.textContent('.pc-page');
            assert.match(txt, /Parent éloigné de Armand Mazaud, 3 degrés/); assert.match(txt, /Allié\(e\) de Célestin Lacombe, 4 degrés/);
            assert.match(txt, /à vérifier : ces arbres sont collaboratifs/i); assert.match(txt, /CC0 1\.0/);
            assert.ok(await p.$$eval('.pc-page a[target="_blank"][rel*="noopener"]', a => a.some(x => /wikidata\.org\/wiki\/Q9000002#P22/.test(x.href))));
            assert.match(await p.textContent('[data-pc-props]'), /Maria LACOMBE/);
            await sleep(800); // la liste a fini de se dessiner
            await p.click('[data-pc-yes="3|Q9000003"]');
            await p.waitForFunction(() => /Fiche reliée à Wikidata/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual(q('SELECT wikidata_id FROM persons WHERE id=3')[0].wikidata_id, 'Q9000003');
            await undo(/Fiche reliée à Wikidata/); await sleep(800);
            assert.strictEqual(q('SELECT wikidata_id FROM persons WHERE id=3')[0].wikidata_id, '');
        });
        await t('la fiche de Jan : « ⭐ Parent éloigné de Armand Mazaud, 3 degrés », le chemin dépliable, « à vérifier »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-pc-person-block="1"] .pc-result', {timeout: 20000});
            const txt = await p.textContent('[data-pc-person-block="1"]');
            assert.match(txt, /⭐ Parent éloigné de Armand Mazaud, 3 degrés/); assert.match(txt, /son père/); assert.match(txt, /son fils/); assert.match(txt, /Wikidata \(P22\)/); assert.match(txt, /collaboratifs/);
        });
        await t('WikiTree allumé (Réglages) : la fiche de Pieter montre le chemin WikiTree et « 🌲 Chercher dans WikiTree »', async () => {
            await p.evaluate(() => localStorage.setItem('genealogie-parents-celebres', JSON.stringify({wikitree: true})));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-pc-person-block="2"] [data-pc-wt]', {timeout: 20000});
            const txt = await p.textContent('[data-pc-person-block="2"]');
            assert.match(txt, /WikiTree : relié\(e\) à Célestin Lacombe, 3 degrés/); assert.match(txt, /Connection Finder/);
            await p.evaluate(() => localStorage.removeItem('genealogie-parents-celebres'));
        });
        await t('Réglages → « 🔎 Pistes, branches, célèbres » : WikiTree éteint au départ, Wikidata CC0, conditions WikiTree non relues', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'pistes_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-pst-set="genealogie-parents-celebres|wikitree"]', {timeout: 20000});
            assert.strictEqual(await p.isChecked('[data-pst-set="genealogie-parents-celebres|wikitree"]'), false);
            assert.strictEqual(await p.isChecked('[data-pst-set="genealogie-parents-celebres|block"]'), true);
            const s = await p.textContent('.pst-settings');
            assert.match(s, /Wikidata/); assert.match(s, /non relues/); assert.match(s, /appId/);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
