#!/usr/bin/env node
/* 🗂 Les onglets d'un dossier de succession (maquette docs/design/dossier-et-transcriptions.html, A) :
 *  - par défaut (conseillé) une seule ligne d'onglets C5, ce qui ne tient pas passe dans « Plus ▾ » (avec les compteurs),
 *    l'onglet ouvert reste visible ; plus de grille de boutons segmentés ; 1440 et 390 sans défilement de côté ;
 *  - 📁 Dossier : plus les 9 boutons en double en bas, un résumé cliquable à la place ;
 *  - réglage « tabs_layout » (menu de choix unique, conseillé en premier, retenu, valeur inconnue refusée) : par familles, colonne à gauche
 *    (un menu de choix sur téléphone) ; les pastilles d'état restent comme avant.
 *   node tests/test-dossier-onglets.js   (captures : SHOTS=/chemin node tests/test-dossier-onglets.js) */
'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = '1';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const SHOTS = process.env.SHOTS || '';

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-dossier-onglets-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ([[1,'Louis','MAZAUD','male','deceased'],[2,'Hélène','PEYRAT','female','deceased'],[10,'Marcel','MAZAUD','male','deceased'],[21,'Paul','MAZAUD','male','living'],[22,'Suzanne','MAZAUD','female','living'],[50,'Pierre','DURAND','male','living']] as $x) { $ins->execute($x); }
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',?,?,?,?)");
foreach ([[1,'1900'],[2,'1902'],[10,'1938'],[21,'1940'],[22,'1941']] as $b) { $ev->execute([$b[0],$tag('BIRT'),$b[1],(int)$b[1]]); }
foreach ([[1,'1980'],[2,'1990'],[10,'3 mars 2026']] as $d) { $ev->execute([$d[0],$tag('DEAT'),$d[1],(int)substr($d[1],-4)]); }
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(100,1,2)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(100,10),(100,21),(100,22)");
echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(x => { cookie = (x.headers.get('set-cookie') || '').split(';')[0]; return x; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const post = async body => { const x = await fetch(`${base}api.php?action=successoral_write`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({...body, csrf})}); return {status: x.status, body: await x.json().catch(() => ({}))}; };
    const browser = await chromium.launch();
    const shot = async (pg, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await pg.screenshot({path: path.join(SHOTS, name + '.png'), fullPage: false}); } };
    let CID = 0;
    const open = async (w, h, tab = 'dossier') => {
        const ctx = await browser.newContext({viewport: {width: w, height: h}, deviceScaleFactor: 1});
        await ctx.addInitScript(() => { try { if (!localStorage.getItem('genealogie-usage')) { localStorage.setItem('genealogie-usage', JSON.stringify({usages: ['genealogie', 'successoral'], start: 'last'})); localStorage.setItem('genealogie-menu-successoral', '1'); } } catch (_) {} });
        const pg = await ctx.newPage(); const errs = [];
        pg.on('pageerror', e => errs.push(e.message));
        await pg.goto(base + '#successoral'); await pg.waitForFunction(() => window.LCNDA_EXT?.successoral && window.LCNDA_EXT?.succPlus2?.cfg, null, {timeout: 30000});
        await pg.evaluate(async () => { await window.LCNDA_EXT.succPlus2.loadSettings?.(true); });
        await pg.evaluate(([id, k]) => window.LCNDA_EXT.successoral.openCase(id, k), [CID, tab]);
        await pg.waitForSelector(`[data-succ-tab="${tab}"].is-active`, {timeout: 15000, state: "attached"}); await pg.waitForTimeout(300);
        return {ctx, pg, errs};
    };
    const noSide = pg => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    try {
        await t('un dossier de succession pour les essais ; valeur inconnue du réglage refusée (la conseillée reste)', async () => {
            const c = await post({op: 'save', deceased_id: 10, notary_person_id: 50, number: '2026-014', opened_at: '2026-04-02'});
            assert.equal(c.status, 200, JSON.stringify(c.body)); CID = c.body.result.id;
            const bad = await post({op: 'settings_save', settings: {p2: {tabs_layout: '<script>'}}});
            assert.equal((bad.body.result?.settings?.p2 || {}).tabs_layout || 'line', 'line');
        });
        await t('A1 par défaut, 1440 : une seule ligne d’onglets (pas la grille des boutons segmentés), compteurs, résumé cliquable au lieu des 9 boutons en double', async () => {
            const {ctx, pg, errs} = await open(1440, 900);
            assert.equal(await pg.locator('.succ-tabbar[data-succ-layout="line"]').count(), 1);
            assert.equal(await pg.locator('.segmented.succ-tabs, .succ-tabs.segmented').count(), 0, 'plus de bouton segmenté pour les onglets');
            const tops = await pg.$$eval('.succ-tabrow > [data-succ-tab]', bs => [...new Set(bs.map(b => Math.round(b.getBoundingClientRect().top)))]);
            assert.equal(tops.length, 1, 'une seule ligne : ' + tops);
            assert.equal(await pg.$eval('.succ-tabrow', e => getComputedStyle(e).display), 'flex');
            assert.match(await pg.textContent('[data-succ-tab="pieces"] .succ-k'), /^\d+ \/ \d+$/, 'Pièces : compteur');
            assert.match(await pg.textContent('[data-succ-tab="heirs"] .succ-k'), /^\d+$/);
            assert.equal(await pg.locator('.succ-quick').count(), 0, 'plus les boutons en double');
            assert.equal(await pg.locator('.succ-recap .succ-recap-i').count(), 4);
            assert.equal(await pg.locator('.succ-steps .succ-step').count(), 5, 'les pastilles d’état restent');
            await shot(pg, 'a1-1440');
            await pg.click('.succ-recap [data-succ-tab="heirs"]');
            await pg.waitForSelector('.succ-tabrow [data-succ-tab="heirs"].is-active');
            assert.equal(await noSide(pg), true);
            assert.deepEqual(errs, []); await ctx.close();
        });
        await t('A1, 390 : « Plus ▾ » montre les onglets qui ne tiennent pas (avec compteurs), l’onglet ouvert reste visible, pas de défilement de côté', async () => {
            const {ctx, pg, errs} = await open(390, 844, 'journal');
            assert.equal(await noSide(pg), true, 'pas de défilement de côté');
            await pg.waitForSelector('[data-succ-more]:not([hidden])');
            const vis = await pg.evaluate(() => { const row = document.querySelector('.succ-tabrow').getBoundingClientRect(), a = document.querySelector('.succ-tabrow .is-active').getBoundingClientRect(); return a.left >= row.left - 1 && a.right <= row.right + 1; });
            assert.equal(vis, true, 'l’onglet ouvert est entier');
            await shot(pg, 'a1-390');
            await pg.click('[data-succ-more]');
            await pg.waitForSelector('.ui-actmenu');
            const labels = await pg.$$eval('.ui-actmenu .ui-actmenu-i', bs => bs.map(b => b.textContent.trim()));
            assert.ok(labels.some(l => /Disposition des onglets/.test(l)), labels.join(' | '));
            assert.ok(labels.length >= 3, 'des onglets dans « Plus ▾ »');
            await shot(pg, 'a1-390-plus');
            const target = labels.find(l => /Dossier/.test(l)) ? 'dossier' : null;
            await pg.locator('.ui-actmenu .ui-actmenu-i').first().click();
            await pg.waitForTimeout(400);
            if (target) await pg.waitForSelector('.succ-tabrow .is-active');
            assert.notEqual(await pg.$eval('.succ-tabrow .is-active', b => b.dataset.succTab), 'journal', 'un autre onglet ouvert depuis « Plus ▾ »');
            for (const k of ['notary', 'fees', 'heirs']) { await pg.click(`[data-succ-tab="${k}"]`); await pg.waitForSelector(`.succ-tabrow [data-succ-tab="${k}"].is-active`); assert.equal(await noSide(pg), true, k); }
            assert.deepEqual(errs, []); await ctx.close();
        });
        await t('réglage dans « Outils du dossier : réglages » : un menu de choix unique, la conseillée d’abord', async () => {
            const {ctx, pg, errs} = await open(1440, 900);
            const opts = await pg.evaluate(() => { const box = document.createElement('div'); box.innerHTML = window.LCNDA_EXT.succPlus2.settingsHtml({p2: {}}); const s = box.querySelector('select[data-sp2-set="tabs_layout"]'); return s ? [...s.options].map(o => [o.value, o.textContent, o.selected]) : null; });
            assert.ok(opts, 'un menu de choix');
            assert.deepEqual(opts.map(o => o[0]), ['line', 'families', 'side']);
            assert.equal(opts[0][2], true); assert.match(opts[0][1], /conseillé/);
            assert.deepEqual(errs, []); await ctx.close();
        });
        await t('A2 « par familles » : cinq familles, puis les onglets de la famille ; la famille retient son onglet ; 1440 et 390', async () => {
            assert.equal((await post({op: 'settings_save', settings: {p2: {tabs_layout: 'families'}}})).body.result.settings.p2.tabs_layout, 'families');
            for (const [w, h] of [[1440, 900], [390, 844]]) {
                const {ctx, pg, errs} = await open(w, h);
                assert.equal(await pg.locator('.succ-fams > [data-succ-fam]').count(), 5);
                await pg.click('[data-succ-fam="pieces"]'); await pg.waitForSelector('[data-succ-tab="pieces"].is-active');
                assert.deepEqual(await pg.$$eval('.succ-subtabs [data-succ-tab]', bs => bs.map(b => b.dataset.succTab)), ['pieces', 'notary']);
                await pg.click('.succ-subtabs [data-succ-tab="notary"]'); await pg.waitForSelector('[data-succ-tab="notary"].is-active');
                await pg.click('[data-succ-fam="search"]'); await pg.waitForSelector('[data-succ-tab="heirs"].is-active');
                await pg.click('[data-succ-fam="pieces"]'); await pg.waitForSelector('[data-succ-tab="notary"].is-active');
                assert.equal(await noSide(pg), true);
                await shot(pg, `a2-${w}`);
                assert.deepEqual(errs, []); await ctx.close();
            }
        });
        await t('A3 « colonne à gauche » : la liste à gauche en familles ; un menu de choix sur téléphone ; 1440 et 390', async () => {
            await post({op: 'settings_save', settings: {p2: {tabs_layout: 'side'}}});
            {
                const {ctx, pg, errs} = await open(1440, 900);
                assert.equal(await pg.isVisible('.succ-sidenav'), true);
                assert.equal(await pg.isVisible('[data-succ-tabsel]'), false);
                await pg.click('.succ-sidenav [data-succ-tab="journal"]'); await pg.waitForSelector('.succ-sidenav [data-succ-tab="journal"].is-active');
                assert.equal(await noSide(pg), true); await shot(pg, 'a3-1440');
                assert.deepEqual(errs, []); await ctx.close();
            }
            {
                const {ctx, pg, errs} = await open(390, 844);
                assert.equal(await pg.isVisible('.succ-sidenav'), false);
                assert.equal(await pg.isVisible('[data-succ-tabsel]'), true);
                await pg.selectOption('[data-succ-tabsel]', 'fees'); await pg.waitForSelector('[data-succ-tab="fees"].is-active', {state: 'attached'});
                assert.equal(await pg.inputValue('[data-succ-tabsel]'), 'fees');
                assert.equal(await noSide(pg), true); await shot(pg, 'a3-390');
                assert.deepEqual(errs, []); await ctx.close();
            }
            await post({op: 'settings_save', settings: {p2: {tabs_layout: 'line'}}});
        });
        await t('les autres boutons segmentés de 3 et plus gardent leur grille (règle générale de heritage.css intacte)', async () => {
            const css = fs.readFileSync(path.join(root, 'assets/css/heritage.css'), 'utf8');
            assert.match(css, /\.segmented:has\(> button:nth-child\(3\)\)\{grid-template-columns:repeat\(3,1fr\)\}/);
            const {ctx, pg} = await open(1440, 900);
            await pg.evaluate(() => window.LCNDA_EXT.successoral.openCase(0)); await pg.waitForSelector('.succ-views.segmented');
            await ctx.close();
        });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `✗ ${fails} échec(s)` : '✓ tout est bon');
    process.exit(fails ? 1 : 0);
})();
