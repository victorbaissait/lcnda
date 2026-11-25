#!/usr/bin/env node
/* 🧩 Branches isolées (lib/branches_isolees.php, assets/js/heritage-branches-isolees.js, assets/css/pistes-branches-celebres.css).
 *  1. serveur : les groupes détachés de la personne de départ (taille, noms, origine), sans les animaux ni les fiches « hors
 *     généalogie » ; les fiches seules réunies ; « C'est voulu » retenu (et ↶) ; rapide sur 20 000 fiches ;
 *  2. écran : le cadre dans Réglages → ✅ Contrôle de la base, « 👁 Voir ces fiches », « 🔗 Relier à… » (add_relation, ↶),
 *     « C'est voulu » (↶), le réglage « genealogie-branches-isolees ».
 *   node tests/test-branches-isolees.js */
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

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-bis-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const php = (code, extra = {}) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env: {...env, ...extra}, maxBuffer: 64 * 1024 * 1024}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
    php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
// le tronc : Jean MAZAUD (départ), ses parents, sa femme, leur fils
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Pierre','MAZAUD','male','deceased',0),(3,'Marie','DURAND','female','deceased',0),(4,'Rose','MAZAUD','female','deceased',0),(5,'Louis','MAZAUD','male','deceased',0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,2,3),(2,1,4)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,5)");
// un groupe isolé de 4 LACOMBE (un couple, deux enfants), créé « le 3 mars 2026 »
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,created_at) VALUES(10,'Antoine','LACOMBE','male','deceased','2026-03-03 10:00:00'),(11,'Jeanne','LACOMBE','female','deceased','2026-03-03 10:00:00'),(12,'Paul','LACOMBE','male','deceased','2026-03-03 10:00:00'),(13,'Léa','DURAND','female','deceased','2026-03-03 10:00:00')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(10,10,11)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(10,12),(10,13)");
// deux frères DURAND sans parents connus (une famille sans parent) ; une fiche seule ; un animal ; une fiche « hors généalogie »
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(20,'Marc','DURAND','male','deceased'),(21,'Luc','DURAND','male','deceased'),(30,'Agathe','LACOMBE','female','deceased')");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(20,NULL,NULL)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(20,20),(20,21)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,kind) VALUES(40,'Médor','','male','deceased','animal')");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,outside_genealogy) VALUES(41,'Notaire','DURAND','male','deceased',1)");
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
        // index.php ne charge pas encore ces fichiers : on les ajoute (comme le feront les balises)
        if (!await p.evaluate(() => !!window.LCNDA_EXT?.branchesIsolees)) {
            await p.addStyleTag({url: base + 'assets/css/pistes-branches-celebres.css'});
            await p.addScriptTag({url: base + 'assets/js/heritage-pistes-auto.js'});
            await p.addScriptTag({url: base + 'assets/js/heritage-branches-isolees.js'});
        }
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        /** « ↶ Annuler » du message qui dit… (le plus récent) */
        const undo = async re => {
            await p.waitForFunction(src => [...document.querySelectorAll('.ui-toast, .toast')].some(x => new RegExp(src).test(x.textContent)), re.source, {timeout: 10000});
            const h = await p.evaluateHandle(src => { const box = [...document.querySelectorAll('.ui-toast, .toast')].reverse().find(x => new RegExp(src).test(x.textContent)); return [...(box ? box.querySelectorAll('button') : [])].find(b => /Annuler/.test(b.textContent)); }, re.source);
            await h.asElement().click();
        };
        const post = (x, b) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).catch(e => ({error: e.message})), [x, b]);

        /* ═════════ 1. le serveur ═════════ */
        await t('isoles_list : le tronc (5 fiches autour de Jean MAZAUD), un groupe de 4 LACOMBE, 2 frères DURAND, 1 fiche seule ; ni l’animal ni la fiche hors généalogie', async () => {
            const r = await api('isoles_list');
            assert.strictEqual(r.root.id, 1); assert.strictEqual(r.main, 5); assert.strictEqual(r.total, 12, 'les 12 fiches comptées (sans l’animal ni « hors généalogie »)');
            assert.deepStrictEqual(r.groups.map(g => [g.key, g.size, g.alone]), [['g:10', 4, false], ['g:20', 2, false], ['seules', 1, true]]);
            const g = r.groups[0];
            assert.deepStrictEqual(g.names[0], {name: 'LACOMBE', n: 3}); assert.strictEqual(g.created_from, '2026-03-03');
            assert.strictEqual(r.isolated, 7);
            // un import encore annulable (son reçu) : « venu de l’import « cousins-lacombe.ged » »
            fs.mkdirSync(path.join(tmp, 'cache/import-receipts'), {recursive: true});
            fs.writeFileSync(path.join(tmp, 'cache/import-receipts', 'aaaaaaaaaaaaaaaaaaaaaaaa.json'), JSON.stringify({kind: 'tree', at: '2026-03-03T10:00:00+01:00', label: 'cousins-lacombe.ged', ranges: {persons: [9, 13]}}));
            const r2 = await api('isoles_list');
            assert.deepStrictEqual(r2.groups[0].origin, {kind: 'import', label: 'cousins-lacombe.ged', at: '2026-03-03'});
            assert.strictEqual(r2.groups[1].origin, null);
        });
        await t('isoles_group : les fiches d’un groupe (nom, années, liens) ; un groupe inconnu est refusé', async () => {
            const r = await api('isoles_group', {key: 'g:10'});
            assert.deepStrictEqual(r.people.map(x => x.id).sort(), [10, 11, 12, 13]);
            assert.ok(r.people.every(x => x.links >= 1));
            assert.ok((await api('isoles_group', {key: 'g:999'})).error);
            assert.ok((await api('isoles_group', {key: "x'; DROP"})).error);
        });
        await t('« C’est voulu » : le groupe passe dans les écartés (retenu), et ↶ le remet', async () => {
            await post('isoles_ignore', {key: 'g:20', size: 2});
            let r = await api('isoles_list');
            assert.deepStrictEqual(r.groups.map(g => g.key), ['g:10', 'seules']); assert.deepStrictEqual(r.ignored.map(g => g.key), ['g:20']);
            await post('isoles_unignore', {key: 'g:20'});
            r = await api('isoles_list'); assert.deepStrictEqual(r.groups.map(g => g.key), ['g:10', 'g:20', 'seules']);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('Contrôle de la base : le cadre « 🧩 Branches isolées » au-dessus de la liste (taille, noms, date)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'controle'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-bis-box] .bis-row', {timeout: 30000});
            const txt = await p.textContent('[data-bis-box]');
            assert.match(txt, /Branches isolées/); assert.match(txt, /Groupe de 4 fiches/); assert.match(txt, /LACOMBE \(3\)/); assert.match(txt, /venu de l’import « cousins-lacombe\.ged » du 3 mars 2026/);
            assert.match(txt, /1 fiches seules|fiches seules/); assert.match(txt, /Jean MAZAUD/);
        });
        await t('« 👁 Voir ces fiches » : la liste du groupe, avec « ↗ Fiche »', async () => {
            await p.click('[data-bis-see="g:10"]');
            await p.waitForSelector('dialog.bis-dialog [data-bis-open]', {timeout: 10000});
            const txt = await p.textContent('dialog.bis-dialog');
            assert.match(txt, /Antoine LACOMBE/); assert.match(txt, /Léa DURAND/);
            await p.click('dialog.bis-dialog button[value="cancel"]');
        });
        await t('« C’est voulu » sur l’écran puis ↶ Annuler', async () => {
            await p.click('[data-bis-ok="g:20"]');
            await p.waitForFunction(() => !document.querySelector('[data-bis-box] .bis-panel > .ctl-list [data-bis-key="g:20"]'), null, {timeout: 10000});
            assert.ok(await p.$('[data-bis-again="g:20"]'), 'dans « 🙈 écartés »');
            await undo(/Groupe écarté/);
            await p.waitForSelector('[data-bis-box] .bis-panel > .ctl-list [data-bis-key="g:20"]', {timeout: 10000});
        });
        await t('« 🔗 Relier à… » : Antoine LACOMBE est l’enfant de Jean MAZAUD → le groupe disparaît ; ↶ le fait revenir', async () => {
            await p.evaluate(() => { window.LCNDA_PICKER = {openPicker: async () => ({id: 1, title: 'Jean MAZAUD'})}; });
            await p.click('[data-bis-link="g:10"]');
            await p.waitForSelector('dialog.bis-dialog select[name="who"]', {timeout: 10000});
            await p.selectOption('dialog.bis-dialog select[name="who"]', '10');
            await p.selectOption('dialog.bis-dialog select[name="rel"]', 'child');
            await p.click('dialog.bis-dialog button[value="ok"]');
            await p.waitForFunction(() => !document.querySelector('[data-bis-key="g:10"]'), null, {timeout: 15000});
            const r = await api('isoles_list'); assert.strictEqual(r.main, 9); assert.ok(!r.groups.some(g => g.key === 'g:10'));
            const link = JSON.parse(php(`$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo json_encode($p->query("SELECT f.partner1_id, f.partner2_id FROM family_children fc JOIN families f ON f.id=fc.family_id WHERE fc.child_id=10 AND (f.partner1_id=1 OR f.partner2_id=1)")->fetchAll(PDO::FETCH_ASSOC));`));
            assert.strictEqual(link.length, 1, 'Jean MAZAUD est bien le parent d’Antoine LACOMBE');
            await undo(/Lien ajouté/);
            await p.waitForSelector('[data-bis-key="g:10"]', {timeout: 15000});
        });
        await t('Réglages : éteindre le cadre (« genealogie-branches-isolees ») le retire du Contrôle', async () => {
            await p.evaluate(() => { localStorage.setItem('genealogie-branches-isolees', JSON.stringify({panel: false})); const A = window.LCNDA_APP; A.state.maintenanceTab = 'controle'; A.renderMaintenance(); });
            await p.waitForSelector('.ctl-page [data-ctl-bar]', {timeout: 20000}); await sleep(600);
            assert.strictEqual(await p.$('[data-bis-box]'), null);
            await p.evaluate(() => localStorage.removeItem('genealogie-branches-isolees'));
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'pistes_reglages'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-pst-set="genealogie-branches-isolees|panel"]', {timeout: 20000});
        });
        await t('rapide : 20 000 fiches (dont 300 groupes isolés) en moins de 3 secondes', async () => {
            php(String.raw`require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); $pdo->beginTransaction();
$ins = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,'deceased')");
$fam = $pdo->prepare('INSERT INTO families(id,partner1_id,partner2_id) VALUES(?,?,?)'); $kid = $pdo->prepare('INSERT INTO family_children(family_id,child_id) VALUES(?,?)');
$id = 1000; $fid = 1000; $prev = 1;
for ($i = 0; $i < 6500; $i++) { // une longue lignée reliée au tronc : père, mère, enfant
    $a = $id++; $b = $id++; $c = $id++; $ins->execute([$a,'Jean','MAZAUD','male']); $ins->execute([$b,'Marie','DURAND','female']); $ins->execute([$c,'Paul','MAZAUD','male']);
    $fam->execute([$fid, $a, $b]); $kid->execute([$fid, $c]); $kid->execute([$fid, $prev]); $fid++; $prev = $a; }
for ($i = 0; $i < 300; $i++) { $a = $id++; $b = $id++; $ins->execute([$a,'Louis','LACOMBE','male']); $ins->execute([$b,'Anne','LACOMBE','female']); $fam->execute([$fid++, $a, $b]); }
$pdo->commit(); echo 'ok';`);
            const t0 = Date.now(); const r = await api('isoles_list'); const ms = Date.now() - t0;
            console.log(`   ${r.total} fiches, ${r.groups.length} groupes, ${r.ms} ms (serveur), ${ms} ms (aller-retour)`);
            assert.ok(r.total > 20000); assert.strictEqual(r.groups.filter(g => !g.alone).length, 302); assert.ok(ms < 3000, `${ms} ms`);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
