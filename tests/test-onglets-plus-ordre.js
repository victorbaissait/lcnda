#!/usr/bin/env node
/* ＋ Ajouter un onglet : « ⠿ Ordre du menu » (glisser, clavier, même ordre que Réglages → Menus),
 * « ＋ Une autre liste… » / « ＋ Un autre outil… » (n'importe quelle liste ou outil, menu de choix à recherche mêlée),
 * et « Mettre mes onglets à la fin du menu » (coché au départ, sans casser un ordre réglé à la main).
 *   node tests/test-onglets-plus-ordre.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n  ')); } };

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-onglets-ordre-'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Jean','MAZAUD','male','deceased')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], {cwd: root, encoding: 'utf8', env});
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        page.on('pageerror', e => errs.push(e.message));
        await page.goto(base + '#dashboard', {waitUntil: 'load'});
        await page.waitForFunction(() => window.LCNDA_EXT?.tabsPlus && window.LCNDA_EXT?.shortcuts?.chooseTargets && window.LCNDA_APP?.orderedMenuKeys && document.querySelector('.main-nav > .nav-add-tab'), null, {timeout: 30000});
        const dlg = page.locator('dialog[open]:has([data-tp-cat])');
        const navKeys = () => page.$$eval('.main-nav > .nav-item', bs => bs.filter(b => b.style.display !== 'none').map(b => b.dataset.board || b.dataset.module));
        const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('genealogie-menu-order') || '[]'));
        const openPlus = async () => { await page.click('.main-nav > .nav-add-tab'); await page.waitForSelector('dialog[open] [data-tp-cat]'); };
        const closeAll = async () => { for (let i = 0; i < 4 && await page.$('dialog[open]'); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } };

        await t('2 · « ＋ Une autre liste… » : n’importe quelle liste (Recensements) devient un onglet au bout du menu', async () => {
            await openPlus();
            const before = await dlg.locator('[data-tp-group="2"] [data-tp-card], [data-tp-group="2"] [data-tp-own-card]').count();
            await dlg.locator('[data-tp-more="list"]').click();
            const ch = page.locator('dialog[open].h-sc-dlg');
            await ch.waitFor();
            assert.equal(await ch.locator('[data-sc-tab]').first().isVisible(), false, 'seulement les listes : pas les onglets « Dans ta base »…');
            const n = await ch.locator('.h-sc-catrow').count();
            assert.ok(n > 30, 'toutes les listes de l’app : ' + n);
            const targets = await ch.locator('.h-sc-catrow').evaluateAll(rs => rs.length);
            assert.ok(targets > 0);
            await ch.locator('[data-sc-qslot] input').fill('recensement');
            await page.waitForTimeout(300);
            const row = ch.locator('.h-sc-catrow', {hasText: /Recensements?$/}).first();
            await (await row.count() ? row : ch.locator('.h-sc-catrow').first()).click();
            await ch.locator('[type=submit]').click();
            await page.waitForTimeout(500);
            const own = await page.evaluate(() => window.LCNDA_APP.customTabs());
            const tab = own.find(x => x.kind === 'screen' && /^list:/.test(x.target) && x.target !== 'list:courriers');
            assert.ok(tab, JSON.stringify(own));
            const keys = await navKeys();
            assert.equal(keys[keys.length - 2], tab.id, 'au bout, juste avant Réglages : ' + keys.join(','));
            assert.equal(keys[keys.length - 1], 'maintenance');
            const after = await dlg.locator('[data-tp-group="2"] [data-tp-card], [data-tp-group="2"] [data-tp-own-card]').count();
            assert.equal(after, before + 1, 'la carte « mon onglet » est dans le groupe 2');
            const last = dlg.locator('[data-tp-group="2"] .tp-cards > *').last();
            assert.equal(await last.getAttribute('data-tp-own-card'), tab.id, 'regroupée à la fin du groupe');
            assert.ok(await last.locator('input').isChecked());
            // le raccourci ouvre bien la liste
            await closeAll();
            await page.click(`.main-nav .nav-custom-tab[data-board="${tab.id}"]`);
            await page.waitForFunction(id => window.LCNDA_APP.state.module === 'listes', tab.id, {timeout: 10000});
            assert.equal('list:' + await page.evaluate(() => window.LCNDA_APP.state.listType), tab.target);
        });

        await t('3 · « ＋ Un autre outil… » : un outil (Calculette) et une page des Réglages, ajoutés en une fois', async () => {
            await openPlus();
            await dlg.locator('[data-tp-more="tool"]').click();
            const ch = page.locator('dialog[open].h-sc-dlg');
            await ch.waitFor();
            const all = await ch.locator('.h-sc-catrow small').allTextContents();
            assert.ok(!all.some(x => /^(Listes|Écrans)$/.test(x.trim())), 'pas de listes ni d’écrans ici');
            await ch.locator('[data-sc-qslot] input').fill('calculette');
            await page.waitForTimeout(300);
            await ch.locator('.h-sc-catrow').first().click();
            await ch.locator('[data-sc-qslot] input').fill('sauvegarde');
            await page.waitForTimeout(300);
            assert.ok(await ch.locator('.h-sc-catrow').count() > 0, 'une page des Réglages se trouve');
            await ch.locator('.h-sc-catrow').first().click();
            assert.match(await ch.locator('[type=submit]').textContent(), /\(2\)/);
            await ch.locator('[type=submit]').click();
            await page.waitForTimeout(500);
            const own = await page.evaluate(() => window.LCNDA_APP.customTabs());
            assert.ok(own.some(x => x.target === 'tool:calculette'), JSON.stringify(own));
            assert.ok(own.some(x => /^maint:/.test(x.target)), JSON.stringify(own));
            const cards = await dlg.locator('[data-tp-group="3"] [data-tp-own-card]').count();
            assert.equal(cards, 2, 'les deux dans le groupe 3');
            // deux fois la même : pas deux onglets
            const n = own.length;
            await dlg.locator('[data-tp-more="tool"]').click();
            await ch.waitFor();
            await ch.locator('[data-sc-qslot] input').fill('calculette');
            await page.waitForTimeout(300);
            await ch.locator('.h-sc-catrow').first().click();
            await ch.locator('[type=submit]').click();
            await page.waitForTimeout(400);
            assert.equal((await page.evaluate(() => window.LCNDA_APP.customTabs())).length, n, 'pas de doublon');
            // décocher la carte cache l'onglet (sans l'effacer)
            const calc = own.find(x => x.target === 'tool:calculette').id;
            await dlg.locator(`[data-tp-own="${calc}"]`).uncheck();
            await page.waitForTimeout(300);
            assert.ok(!(await navKeys()).includes(calc), 'caché');
            assert.ok((await page.evaluate(() => window.LCNDA_APP.customTabs())).some(x => x.id === calc && x.hidden), 'gardé');
            await dlg.locator(`[data-tp-own="${calc}"]`).check();
            await page.waitForTimeout(300);
            assert.ok((await navKeys()).includes(calc), 'remontré');
            await closeAll();
        });

        await t('1 · « ⠿ Ordre du menu » : glisser une ligne change le menu, le même ordre que Réglages → Menus ; ↶ Annuler', async () => {
            await openPlus();
            await dlg.locator('[data-tp-filter="order"]').click();
            const rows = () => dlg.locator('[data-tp-order] .order-row').evaluateAll(rs => rs.map(r => r.dataset.orderKey));
            const first = await rows();
            assert.deepStrictEqual(first, await navKeys(), 'la liste = le menu');
            assert.equal(await dlg.locator('[data-tp-q]').isVisible(), false, 'pas de recherche ici');
            assert.ok(await dlg.locator('[data-tp-order] .order-row.is-own .tp-tag.is-own').count() >= 3, '« mon onglet » marqué');
            // glisser « Graphiques » tout en haut
            const g = dlg.locator('[data-tp-order] .order-row[data-order-key="graphiques"] .order-grip');
            const top = dlg.locator('[data-tp-order] .order-row').first();
            await g.dragTo(top, {targetPosition: {x: 20, y: 2}});
            await page.waitForTimeout(400);
            assert.equal((await rows())[0], 'graphiques', (await rows()).join(','));
            assert.equal((await navKeys())[0], 'graphiques', 'le menu suit');
            assert.equal((await stored())[0], 'graphiques', 'genealogie-menu-order');
            assert.equal(await page.$eval('.main-nav [data-module="graphiques"] span', s => s.textContent), '01');
            // ↶ Annuler
            await page.locator('.toast', {hasText: 'Ordre du menu changé'}).locator('button', {hasText: 'Annuler'}).first().click();
            await page.waitForTimeout(400);
            assert.deepStrictEqual(await navKeys(), first, 'remis comme avant');
            assert.deepStrictEqual(await rows(), first, 'la liste aussi');
        });

        await t('1 · au clavier : ⠿ (Tab) puis Alt + ↓ descend l’onglet', async () => {
            const k0 = await dlg.locator('[data-tp-order] .order-row').first().getAttribute('data-order-key');
            const grip = dlg.locator('[data-tp-order] .order-row').first().locator('.order-grip');
            assert.equal(await grip.getAttribute('tabindex'), '0', 'la poignée se prend au clavier');
            await grip.focus();
            await page.keyboard.press('Alt+ArrowDown');
            await page.waitForTimeout(400);
            const keys = await dlg.locator('[data-tp-order] .order-row').evaluateAll(rs => rs.map(r => r.dataset.orderKey));
            assert.equal(keys[1], k0, keys.join(','));
            assert.equal((await navKeys())[1], k0, 'le menu suit');
            await closeAll();
        });

        await t('1 · Réglages → Menus montre le même ordre', async () => {
            const menu = await navKeys();
            await page.evaluate(() => { window.LCNDA_APP.state.maintenanceTab = 'nav_menus'; window.LCNDA_APP.setModule('maintenance'); });
            await page.waitForSelector('#menu-order .order-row', {timeout: 20000});
            const keys = await page.$$eval('#menu-order .order-row', rs => rs.map(r => r.dataset.orderKey));
            assert.deepStrictEqual(keys.filter(k => menu.includes(k)), menu);
            assert.equal(await page.locator('[data-tp-settings] [data-tp-own-last]').isChecked(), true, 'la case est aussi dans Réglages, cochée au départ');
        });

        await t('3 · un ordre réglé à la main ne bouge pas ; un nouvel onglet à moi arrive au bout ; une partie de l’app arrive avant mes onglets', async () => {
            await page.evaluate(() => { window.LCNDA_APP.setModule('dashboard'); });
            const before = await stored();
            // un onglet fait dans l'Éditeur d'onglets (sans « Place dans la barre »)
            await page.evaluate(() => { const l = window.LCNDA_APP.customTabs(); l.push({id: 'ct_essaiordre', name: 'Mon carnet', icon: '📓', kind: 'screen', target: 'list:reminders', hidden: false}); window.LCNDA_APP.saveCustomTabs(l); });
            await page.waitForTimeout(200);
            const keys = await navKeys();
            assert.equal(keys[keys.length - 2], 'ct_essaiordre', 'au bout : ' + keys.join(','));
            const kept = keys.filter(k => before.includes(k));
            assert.deepStrictEqual(kept, before.filter(k => keys.includes(k)), 'l’ordre déjà réglé n’a pas bougé');
            // une partie de l'app (Fiches) montrée par ＋ : avant mes onglets du bout
            await openPlus();
            await dlg.locator('[data-tp-card="fiches"] input').check();
            await page.waitForTimeout(400);
            const k2 = await navKeys(), own = new Set((await page.evaluate(() => window.LCNDA_APP.customTabs())).map(x => x.id));
            const fi = k2.indexOf('fiches');
            assert.ok(fi > 0 && k2.slice(fi + 1, -1).every(k => own.has(k)), 'Fiches avant mes onglets du bout : ' + k2.join(','));
            await closeAll();
        });

        await t('3 · « ⤓ Regrouper mes onglets à la fin » et la case décochée (comme avant)', async () => {
            // un onglet à moi rangé à la main au début
            await page.evaluate(() => { const o = window.LCNDA_APP.orderedMenuKeys().filter(k => k !== 'ct_essaiordre'); o.unshift('ct_essaiordre'); localStorage.setItem('genealogie-menu-order', JSON.stringify(o)); window.LCNDA_APP.applyMenuOrder(); });
            assert.equal((await navKeys())[0], 'ct_essaiordre', 'gardé là où je l’ai mis');
            await openPlus();
            await dlg.locator('[data-tp-filter="order"]').click();
            await dlg.locator('[data-tp-own-group]').click();
            await page.waitForTimeout(300);
            const keys = await navKeys(), own = new Set((await page.evaluate(() => window.LCNDA_APP.customTabs())).map(x => x.id));
            const firstOwn = keys.findIndex(k => own.has(k));
            assert.ok(keys.slice(firstOwn, -1).every(k => own.has(k)) && keys[keys.length - 1] === 'maintenance', 'regroupés : ' + keys.join(','));
            assert.equal(await dlg.locator('[data-tp-own-group]').count(), 0, 'le bouton disparaît une fois regroupés');
            // décocher la case : un nouvel onglet se met à côté de l'onglet de l'app qui le précède (comme avant)
            await dlg.locator('[data-tp-own-last]').uncheck();
            await page.waitForTimeout(200);
            assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-menu-own-last')), '0');
            // « Trésors » rangé en tête à la main ; un onglet à moi, le premier de ma liste : il suit l'onglet de l'app d'avant (Trésors)
            await page.evaluate(() => { const o = window.LCNDA_APP.orderedMenuKeys().filter(k => k !== 'tresors'); o.unshift('tresors'); localStorage.setItem('genealogie-menu-order', JSON.stringify(o)); const l = window.LCNDA_APP.customTabs(); l.unshift({id: 'ct_essaiapres', name: 'Après', icon: '🧪', kind: 'screen', target: 'list:archives', hidden: false}); window.LCNDA_APP.saveCustomTabs(l); });
            const off = await page.evaluate(() => window.LCNDA_APP.orderedMenuKeys());
            assert.equal(off[1], 'ct_essaiapres', 'case décochée : à côté de Trésors, comme avant : ' + off.join(','));
            await dlg.locator('[data-tp-own-last]').check();
            await page.waitForTimeout(200);
            assert.equal(await page.evaluate(() => localStorage.getItem('genealogie-menu-own-last')), null, 'cochée = le défaut');
            const on = await page.evaluate(() => window.LCNDA_APP.orderedMenuKeys());
            assert.equal(on[on.length - 2], 'ct_essaiapres', 'case cochée : au bout, avant Réglages : ' + on.join(','));
            assert.equal(on[0], 'tresors', 'l’ordre réglé à la main ne bouge pas');
            await closeAll();
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `${fails} essai(s) en échec` : '＋ Ajouter un onglet : l’ordre, les listes et outils, mes onglets à la fin marchent.');
    process.exit(fails ? 1 : 0);
})();
