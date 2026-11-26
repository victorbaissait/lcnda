#!/usr/bin/env node
/* 🧺 « Dans quel panier ? » partout (assets/js/heritage-connexions.js : take, askBasket, addedToast ; la fenêtre « Exporter »).
 *  1. le message nomme le panier : « 🧺 1 chose dans « Mon panier » », avec « Changer ▾ » et « ↶ Annuler » ;
 *  2. « Changer ▾ » : le petit menu (paniers par 📁 dossier, l'en cours ✓) → les choses DÉPLACÉES, ce panier devient celui en cours ; ↶ exact ;
 *  3. Alt+clic et clic droit sur un 🧺 (au bout d'un résultat de Recherche) : le menu avant de mettre ;
 *  4. « ＋ Nouveau panier… » demande le nom sur place (et un dossier) : créé, rempli, en cours ; ↶ le retire ;
 *  5. Réglages → « Quand je mets au panier » → « Me demander à chaque fois » : le menu à chaque 🧺, Entrée = le panier en cours ;
 *  6. plusieurs choses (⤓ Exporter → 🧺) : « Dans : [panier ▾] » sous les tuiles, le bouton dit où ; « ＋ Nouveau panier… » sur place ;
 *     la barre de sélection (plusieurs, plusieurs paniers) → le menu ;
 *  7. mode consultation : rien ; 390 px et sombre ; aucune erreur JS.
 * Base : tests/prendre-depuis-seed.js (noms fictifs MAZAUD, LACOMBE, DURAND).   node tests/test-panier-choix.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const cx = (op, body = {}) => p.evaluate(([o, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: o, ...b}}).then(r => r?.result ?? r), [op, body]);
    const tree = () => B.api('cx_basket', {all: 1});
    const itemsOf = async id => (await B.api('cx_basket', {basket_id: id})).items || [];
    const cur = () => p.evaluate(() => Number(JSON.parse(localStorage.getItem('genealogie-connexions-panier') || '0')) || 0);
    const setCur = id => p.evaluate(x => localStorage.setItem('genealogie-connexions-panier', String(x)), id);
    const clean = () => p.evaluate(() => { document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()); document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.toast').forEach(x => x.remove()); });
    const lastToast = () => p.locator('.toast:not(.is-leaving)').last();
    const toastBtn = async re => { const b = lastToast().locator('button', {hasText: re}); await b.waitFor({timeout: 10000}); return b; };
    const setAsk = v => p.evaluate(x => { const k = 'genealogie-connexions'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.ask = x; localStorage.setItem(k, JSON.stringify(s)); }, v);
    const research = async () => {
        await clean();
        await p.evaluate(() => { const st = window.LCNDA_APP.state; st.researchKind = 'proximity'; st.proximitySearch = {placeId: 1, placeName: 'Treignac', dateMode: 'range', yearFrom: 1780, yearTo: 1800, radiusKm: 10}; st.researchDisplay = 'cards';
            if (st.module !== 'recherche') window.LCNDA_APP.setModule('recherche'); else window.LCNDA_PARTS.renderResearch(); });
        await p.waitForSelector('#workspace .research-person-card[data-rk-id] [data-rk-bk]', {timeout: 30000, state: 'attached'}); await sleep(300);
    };
    const bk = n => p.locator('#workspace .research-person-card [data-rk-bk]').nth(n);
    const hoverBk = async n => { await p.locator('#workspace .research-person-card').nth(n).hover(); await sleep(200); return bk(n); };
    let mon, mar, fam;
    try {
        await t('le message nomme le panier : « 🧺 1 chose dans « Mon panier » » · « Changer ▾ » · « ↶ Annuler »', async () => {
            await research();
            const before = (await B.api('cx_basket', {})).items.length;
            await (await hoverBk(0)).click(); await sleep(1200);
            assert.ok(!(await p.$('.ui-actmenu')), 'pas de menu : le panier en cours');
            const txt = await lastToast().textContent();
            assert.match(txt, /🧺 1 chose dans « Mon panier »/, txt); assert.match(txt, /Changer ▾/); assert.match(txt, /↶ Annuler/);
            const r = await B.api('cx_basket', {}); mon = Number(r.basket_id); assert.strictEqual(r.items.length, before + 1);
            await (await toastBtn('↶')).click(); await sleep(1000);
            assert.strictEqual((await B.api('cx_basket', {})).items.length, before, '↶');
        });
        await t('« Changer ▾ » : le menu par dossier (l’en cours ✓) → les choses déplacées, ce panier devient celui en cours ; ↶ exact', async () => {
            const f = await cx('folder_new', {name: 'Famille MAZAUD', basket_name: 'Mariage MAZAUD 1813'}); fam = f.id; mar = f.basket_id;
            await setCur(mon); await p.evaluate(() => window.LCNDA_EXT.connexions.refresh?.());
            await research(); await clean();
            await (await hoverBk(1)).click(); await sleep(1200);
            assert.match(await lastToast().textContent(), /dans « Mon panier »/);
            const nMon = (await itemsOf(mon)).length;
            await (await toastBtn('Changer')).click(); await p.waitForSelector('.ui-actmenu.cx-bpick');
            const menu = await p.textContent('.ui-actmenu');
            assert.match(menu, /Dans quel panier/); assert.match(menu, /Famille MAZAUD › 🧺 Mariage MAZAUD 1813/); assert.match(menu, /Nouveau panier/);
            assert.match(await p.locator('.ui-actmenu .ui-actmenu-i').first().textContent(), /✓.*Mon panier/, 'l’en cours en premier, coché');
            await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Mariage MAZAUD 1813'}).click(); await sleep(1500);
            assert.strictEqual((await itemsOf(mon)).length, nMon - 1, 'sorti de « Mon panier »');
            assert.strictEqual((await itemsOf(mar)).length, 1, 'dans « Mariage MAZAUD 1813 »');
            assert.strictEqual(await cur(), mar, 'devient le panier en cours');
            assert.match(await lastToast().textContent(), /dans « Mariage MAZAUD 1813 »/);
            assert.match(await p.getAttribute('#cx-pill', 'title'), /Mariage MAZAUD 1813/, 'le nom dans la bulle de la pastille');
            await (await toastBtn('↶')).click(); await sleep(1500);
            assert.strictEqual((await itemsOf(mar)).length, 0); assert.strictEqual((await itemsOf(mon)).length, nMon - 1, 'rien remis dans « Mon panier » (il n’y était pas avant)');
            assert.strictEqual(await cur(), mon, '↶ : « Mon panier » redevient celui en cours');
        });
        await t('Alt+clic et clic droit sur un 🧺 : « Dans quel panier ? » avant de mettre', async () => {
            await clean(); await setCur(mon);
            await (await hoverBk(2)).click({modifiers: ['Alt']}); await p.waitForSelector('.ui-actmenu.cx-bpick', {timeout: 5000});
            assert.strictEqual((await itemsOf(mar)).length, 0, 'rien mis avant le choix');
            await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Mariage MAZAUD 1813'}).click(); await sleep(1300);
            assert.strictEqual((await itemsOf(mar)).length, 1); assert.strictEqual(await cur(), mar);
            await (await toastBtn('↶')).click(); await sleep(1200); assert.strictEqual((await itemsOf(mar)).length, 0); assert.strictEqual(await cur(), mon);
            await clean();
            await (await hoverBk(2)).click({button: 'right'}); await p.waitForSelector('.ui-actmenu.cx-bpick', {timeout: 5000});
            assert.ok(!(await p.$('.ui-actmenu:not(.cx-bpick)')), 'pas d’autre menu');
            await p.keyboard.press('Escape'); await sleep(500);
            assert.ok(!(await p.$('.ui-actmenu')), 'Échap ferme'); assert.strictEqual((await itemsOf(mar)).length, 0);
        });
        await t('« ＋ Nouveau panier… » : le nom sur place (et un dossier) → créé, rempli, en cours ; ↶ le retire', async () => {
            await clean(); await setCur(mon);
            await (await hoverBk(3)).click({modifiers: ['Alt']}); await p.waitForSelector('.ui-actmenu.cx-bpick');
            await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Nouveau panier'}).click();
            await p.waitForSelector('.ui-actmenu .cx-bnew [data-cx-bnname]'); assert.ok(!(await p.$('dialog[open]')), 'pas de fenêtre');
            await p.fill('.ui-actmenu [data-cx-bnname]', 'Témoins Treignac'); await p.selectOption('.ui-actmenu [data-cx-bnf]', String(fam));
            await p.keyboard.press('Enter'); await sleep(1500);
            const b = (await tree()).baskets.find(x => x.name === 'Témoins Treignac');
            assert.ok(b && b.count === 1 && b.folder_id === fam, JSON.stringify(b)); assert.strictEqual(await cur(), b.id);
            assert.match(await lastToast().textContent(), /dans « Témoins Treignac »/);
            await (await toastBtn('↶')).click(); await sleep(1500);
            assert.ok(!(await tree()).baskets.some(x => x.name === 'Témoins Treignac'), '↶ : le panier créé est retiré'); assert.strictEqual(await cur(), mon);
        });
        await t('Réglages → « Quand je mets au panier » → « Me demander à chaque fois » : le menu à chaque 🧺, Entrée = le panier en cours', async () => {
            await clean(); await B.go('maintenance', {maintenanceTab: 'connexions'}); await p.waitForSelector('#workspace .cx-askset');
            assert.match(await p.textContent('#workspace .cx-askset'), /Dans le panier en cours/);
            await p.check('#workspace [name="cx-ask"][value="always"]'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-connexions')).ask), 'always');
            await research(); await setCur(mon); const n0 = (await itemsOf(mon)).length;
            await (await hoverBk(4)).click(); await p.waitForSelector('.ui-actmenu.cx-bpick', {timeout: 5000});
            await p.keyboard.press('Enter'); await sleep(1300);
            assert.strictEqual((await itemsOf(mon)).length, n0 + 1, 'Entrée = le panier en cours');
            await (await toastBtn('↶')).click(); await sleep(1000);
            await setAsk('cur');
        });
        await t('⤓ Exporter → 🧺 : « Dans : [panier ▾] » sous les tuiles, le bouton dit où ; « ＋ Nouveau panier… » sur place ; la barre de sélection demande', async () => {
            await research(); await setCur(mon);
            const boxes = p.locator('#workspace .research-person-card [data-rp-pick]'); await boxes.nth(0).check(); await boxes.nth(1).check(); await boxes.nth(2).check();
            await p.$eval('#workspace .page-header [data-rp-export]', b => b.click()); await p.waitForSelector('dialog.ui-export');
            await p.locator('dialog.ui-export .ui-export-fmt').filter({hasText: /Mettre dans le panier/}).first().click();
            await p.waitForSelector('dialog.ui-export .cx-exp-bk [data-cx-expsel]');
            assert.match(await p.textContent('dialog.ui-export [data-ui-go]'), /Mettre dans « Mon panier » \(3\)/);
            await p.selectOption('dialog.ui-export [data-cx-expsel]', String(mar)); await sleep(100);
            assert.match(await p.textContent('dialog.ui-export [data-ui-go]'), /Mettre dans « Mariage MAZAUD 1813 » \(3\)/);
            await p.selectOption('dialog.ui-export [data-cx-expsel]', 'new'); await p.fill('dialog.ui-export [data-cx-expname]', 'Cousins Treignac');
            assert.match(await p.textContent('dialog.ui-export [data-ui-go]'), /Mettre dans « Cousins Treignac » \(3\)/);
            await p.click('dialog.ui-export [data-ui-go]'); await sleep(2000);
            assert.ok(!(await p.$('.ui-actmenu')), 'pas redemandé');
            const b = (await tree()).baskets.find(x => x.name === 'Cousins Treignac');
            assert.ok(b && b.count === 3, JSON.stringify(b)); assert.strictEqual(await cur(), b.id, 'devient le panier en cours');
            await (await toastBtn('↶')).click(); await sleep(1500); assert.strictEqual(await cur(), mon);
            // les autres tuiles : la ligne disparaît
            await p.$eval('#workspace .page-header [data-rp-export]', b => b.click()); await p.waitForSelector('dialog.ui-export');
            await p.locator('dialog.ui-export .ui-export-fmt').filter({hasText: /Mettre dans le panier/}).first().click(); await p.waitForSelector('dialog.ui-export .cx-exp-bk [data-cx-expsel]');
            await p.locator('dialog.ui-export .ui-export-fmt').filter({hasText: /CSV/}).first().click(); await sleep(100);
            assert.ok(await p.$eval('dialog.ui-export .cx-exp-bk', e => e.hidden));
            await clean();
            // la barre de sélection (plusieurs choses, plusieurs paniers) : le menu
            await p.evaluate(() => { window.LCNDA_EXT.connexions.take([{kind: 'datum', title: 'A', value: '1'}, {kind: 'datum', title: 'B', value: '2'}], {ask: 'multi'}); }); // (attend le choix : pas de await)
            await p.waitForSelector('.ui-actmenu.cx-bpick', {timeout: 5000}); assert.match(await p.textContent('.ui-actmenu'), /Dans quel panier \? \(2\)/);
            await p.keyboard.press('Escape'); await sleep(300);
            await boxes.nth(0).uncheck(); await boxes.nth(1).uncheck(); await boxes.nth(2).uncheck();
        });
        await t('mode consultation : ni message ni menu (Alt+clic, clic droit)', async () => {
            await clean(); await p.evaluate(() => document.body.classList.add('is-kiosk'));
            const n0 = (await itemsOf(mon)).length;
            const r = await p.evaluate(() => window.LCNDA_EXT.connexions.take([{kind: 'datum', title: 'X', value: 'y'}]));
            assert.strictEqual(r, null); assert.ok(!(await p.$('.ui-actmenu')));
            await p.evaluate(() => window.LCNDA_EXT.connexions.take([{kind: 'datum', title: 'X', value: 'y'}], {ask: true})); assert.ok(!(await p.$('.ui-actmenu')));
            assert.strictEqual((await itemsOf(mon)).length, n0);
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('390 px et sombre : le menu et « Nouveau panier » tiennent dans l’écran, 12 px d’air ; le message aussi', async () => {
            await p.setViewportSize({width: 390, height: 844}); await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await research(); await clean(); await setCur(mon);
            await p.evaluate(() => window.LCNDA_EXT.connexions.take([{kind: 'datum', title: 'Moulin', value: '1790'}]));
            await (await toastBtn('Changer')).click(); await p.waitForSelector('.ui-actmenu.cx-bpick');
            await p.locator('.ui-actmenu .ui-actmenu-i', {hasText: 'Nouveau panier'}).click(); await p.waitForSelector('.ui-actmenu .cx-bnew');
            const g = await p.evaluate(() => { const m = document.querySelector('.ui-actmenu'), r = m.getBoundingClientRect(), f = m.querySelector('.cx-bnew [data-cx-bnname]').getBoundingClientRect(); // le champ et les boutons, pas leur cadre
                return {l: r.left, r: innerWidth - r.right, sw: document.documentElement.scrollWidth, bg: getComputedStyle(m).backgroundColor, fl: f.left - r.left, fr: r.right - f.right}; });
            assert.ok(g.l >= 8 && g.r >= 8, JSON.stringify(g)); assert.ok(g.sw <= 390, 'pas de défilement de côté'); assert.ok(g.fl >= 8 && g.fr >= 8, 'rien de collé : ' + JSON.stringify(g));
            const okB = await p.evaluate(() => { const m = document.querySelector('.ui-actmenu').getBoundingClientRect(), b = document.querySelector('.ui-actmenu [data-cx-bnok]').getBoundingClientRect(); return [b.left - m.left, m.right - b.right]; });
            assert.ok(okB[0] >= 8 && okB[1] >= 8, 'le bouton « Créer et mettre » a de l’air : ' + okB);
            const lum = (g.bg.match(/\d+/g) || []).slice(0, 3).map(Number).reduce((a, b) => a + b, 0); assert.ok(lum < 300, 'fond sombre : ' + g.bg);
            await p.keyboard.press('Escape'); await sleep(300);
            await (await toastBtn('↶')).click(); await sleep(800);
            await p.setViewportSize({width: 1440, height: 900}); await p.evaluate(() => { delete document.documentElement.dataset.theme; });
        });
        await t('aucune erreur JS', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally {
        await B.stop();
        console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
        process.exit(fails ? 1 : 0);
    }
})();
