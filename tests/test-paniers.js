#!/usr/bin/env node
/* 🧺 Les paniers nommés et leurs 📁 dossiers (lib/connexions.php : cx_folders, cx_baskets.folder_id, dests_json, done, note ; assets/js/heritage-connexions.js).
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND ; l'enquête « testenquête »).
 *  serveur : 📁 Famille MAZAUD › 📁 Mariage 1813 › 🧺 Témoins (3 niveaux) ; un dossier neuf vient avec « Nouveau panier » ; comptes ; pas de boucle ;
 *    supprimer un dossier (remonter / tout, ↶) ; un dossier vidé de son dernier panier est signalé ;
 *  écran : « Garder dans le panier » demande lequel ; « ＋ Nouveau panier… » ; la vue en grand (✓ utilisé, note, ↶, fil « 📁 › 📁 › 🧺 ») ;
 *    le dernier panier sorti d'un dossier → « supprimer aussi le dossier ? » (↶) ; glisser un panier dans un dossier ; les destinations habituelles
 *    choisies d'avance ; envoyer une partie (cases à trois états sur dossiers / paniers / éléments) ; 390 px ; sombre ; 12 px d'air ; aucune erreur.
 *   node tests/test-paniers.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await t.before?.(); await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const cx = (op, body = {}) => p.evaluate(([o, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: o, ...b}}).then(r => r?.result ?? r), [op, body]);
    const cxTry = (op, body = {}) => p.evaluate(([o, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: o, ...b}}).then(() => 'ok', e => e.message), [op, body]);
    const tree = () => B.api('cx_basket', {all: 1});
    const bByName = async n => (await tree()).baskets.find(x => x.name === n);
    const fByName = async n => (await tree()).folders.find(x => x.name === n);
    const closeAll = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.cx-panel, .ui-actmenu').forEach(x => x.remove()); });
    const clickUndo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(700); };
    const setCur = id => p.evaluate(x => localStorage.setItem('genealogie-connexions-panier', String(x)), id);
    const view = async () => { await closeAll(); await p.evaluate(() => window.LCNDA_EXT.connexions.openBasketView()); await p.waitForSelector('dialog.cx-bview[open] .cx-put-body'); };
    const takeBasket = async () => { await closeAll(); await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'basket'})); await p.waitForSelector('.cx-take [data-cx-ttree]', {timeout: 15000}); };
    const padOk = sel => p.evaluate(s => { const d = document.querySelector(s), r = d.getBoundingClientRect(); return [...d.querySelectorAll('button, input, select, a, textarea')].filter(e => e.getClientRects().length && !e.closest('[hidden]') && !e.matches('.cx-gut'))
        .map(e => [e, e.getBoundingClientRect()]).filter(([, q]) => q.width && (q.left - r.left < 12 || r.right - q.right < 12)).map(([e]) => e.outerHTML.slice(0, 90)); }, sel);
    let fam, mar, tem, cad;
    try {
        await t('serveur : 📁 Famille MAZAUD › 📁 Mariage 1813 › 🧺 Témoins ; un dossier neuf vient avec son « Nouveau panier » ; comptes et fil', async () => {
            const f1 = await cx('folder_new', {name: 'Famille MAZAUD', icon: '👪', basket_name: 'Cadastre'}); fam = f1.id; cad = f1.basket_id;
            const f2 = await cx('folder_new', {name: 'Mariage 1813', parent_id: fam, basket_name: 'Témoins'}); mar = f2.id; tem = f2.basket_id;
            await cx('basket_add', {basket_id: cad, items: [{kind: 'datum', title: 'Moulin de Treignac', value: '1790'}]});
            await cx('basket_add', {basket_id: tem, items: [{kind: 'person', ref_id: 2, title: 'Pierre LACOMBE'}, {kind: 'person', ref_id: 3, title: 'Jacques DURAND'}, {kind: 'datum', title: 'Date du mariage', value: '8 février 1813'}]});
            const r = await tree(), t1 = r.baskets.find(x => x.id === tem), F = r.folders.find(x => x.id === fam);
            assert.deepStrictEqual(t1.path, ['Famille MAZAUD', 'Mariage 1813', 'Témoins']); assert.strictEqual(t1.depth, 2);
            assert.strictEqual(F.baskets, 2); assert.strictEqual(F.total, 4); assert.strictEqual(r.folders.find(x => x.id === mar).depth, 1);
            assert.ok(r.baskets.some(x => x.name === 'Cadastre' && x.folder_id === fam));
        });
        await t('serveur : pas de boucle (Famille dans Mariage 1813 refusé, ni dans lui-même) ; un panier ne va que dans un dossier qui existe', async () => {
            assert.match(await cxTry('folder_move', {folder_id: fam, parent_id: mar}), /lui-même ni dans un de ses sous-dossiers/);
            assert.match(await cxTry('folder_move', {folder_id: mar, parent_id: mar}), /lui-même/);
            assert.match(await cxTry('basket_move', {basket_id: tem, folder_id: 9999}), /Dossier introuvable/);
        });
        await t('serveur : supprimer un dossier — « remonter » (paniers et sous-dossiers d’un niveau, ↶) ou « tout » (↶ remet tout, éléments compris)', async () => {
            const r = await cx('folder_delete', {folder_id: mar, mode: 'up'});
            assert.strictEqual((await bByName('Témoins')).folder_id, fam); assert.ok(!(await fByName('Mariage 1813')));
            await cx('folder_undelete', r); assert.strictEqual((await bByName('Témoins')).folder_id, mar);
            const r2 = await cx('folder_delete', {folder_id: fam, mode: 'all'});
            assert.ok(!(await bByName('Témoins')) && !(await fByName('Mariage 1813')));
            await cx('folder_undelete', r2); assert.strictEqual((await fByName('Famille MAZAUD')).total, 4);
            assert.strictEqual((await B.api('cx_basket', {basket_id: tem})).items.length, 3);
        });
        await t('« Garder dans le panier » demande lequel (fil des dossiers) ; « ＋ Nouveau panier… » (nom, emoji, une ligne, dossier)', async () => {
            await B.openInv(1); await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'place'})); await p.waitForSelector('.cx-take [data-cx-q]'); await p.fill('.cx-take [data-cx-q]', 'Treignac');
            await p.waitForSelector('.cx-take [data-cx-res] .cx-rlist li', {timeout: 15000});
            await p.locator('.cx-take .cx-rlist li').first().locator('input').check();
            await p.click('.cx-take [data-cx-tobasket]'); await p.waitForSelector('.ui-actmenu');
            assert.match(await p.textContent('.ui-actmenu'), /Dans quel panier/); assert.match(await p.textContent('.ui-actmenu'), /Famille MAZAUD › 📁 Mariage 1813 › 🧺 Témoins/);
            await p.locator('.ui-actmenu button', {hasText: 'Nouveau panier'}).click();
            await p.waitForSelector('dialog[open] input[name="name"]'); await p.fill('dialog[open] input[name="name"]', 'Recherches Treignac'); await p.fill('dialog[open] input[name="icon"]', '📍');
            await p.fill('dialog[open] input[name="note"]', 'les lieux à vérifier'); await p.selectOption('dialog[open] select[name="folder"]', String(fam));
            await p.click('dialog[open] button[type="submit"]'); await sleep(1500);
            const b = await bByName('Recherches Treignac'); assert.ok(b && b.count === 1 && b.icon === '📍' && b.note === 'les lieux à vérifier' && b.folder_id === fam, JSON.stringify(b));
            assert.match(await p.getAttribute('#cx-pill', 'title'), /Recherches Treignac/);
        });
        await t('la vue en grand : fil « 📁 Famille MAZAUD › 📁 Mariage 1813 › 🧺 Témoins », ✓ utilisé et une note (↶)', async () => {
            await setCur(tem); await view();
            assert.match(await p.textContent('.cx-bview .cx-crumbs'), /📁 Famille MAZAUD › 📁 Mariage 1813 › 🧺 Témoins/);
            await p.locator('.cx-bview [data-cx-vi]', {hasText: 'Pierre LACOMBE'}).locator('[data-cx-vdone]').check(); await p.waitForSelector('.cx-bview [data-cx-vi].is-done');
            await p.locator('.cx-bview [data-cx-vi]', {hasText: 'Jacques DURAND'}).locator('[data-cx-vnote]').fill('témoin de l’époux'); await p.keyboard.press('Tab'); await sleep(600);
            const its = (await B.api('cx_basket', {basket_id: tem})).items;
            assert.strictEqual(Number(its.find(x => x.title === 'Pierre LACOMBE').done), 1); assert.strictEqual(its.find(x => x.title === 'Jacques DURAND').note, 'témoin de l’époux');
            await clickUndo(); assert.strictEqual((await B.api('cx_basket', {basket_id: tem})).items.find(x => x.title === 'Jacques DURAND').note, '');
            assert.match(await p.textContent('.cx-bview .cx-tk-say'), /1 utilisés|1 utilisé/);
        });
        await t('glisser un panier dans un dossier ; le dernier panier sorti d’un dossier → « supprimer aussi le dossier ? » (↶ remet tout)', async () => {
            await takeBasket();
            await p.locator(`.cx-take [data-cx-tb="${tem}"]`).dragTo(p.locator(`.cx-take [data-cx-tf="${fam}"]`));
            await p.waitForSelector('dialog[open] [name="cx-choice"]', {timeout: 10000});
            assert.match(await p.textContent('dialog[open]:last-of-type'), /n’a plus de panier/);
            await p.check('dialog[open] [name="cx-choice"][value="del"]'); await p.click('dialog[open] button[type="submit"]'); await sleep(1200);
            assert.strictEqual((await bByName('Témoins')).folder_id, fam); assert.ok(!(await fByName('Mariage 1813')), 'le dossier vide est supprimé');
            await clickUndo();
            assert.strictEqual((await bByName('Témoins')).folder_id, mar); assert.ok(await fByName('Mariage 1813'));
        });
        await t('les destinations habituelles (l’enquête « testenquête » + le Livre de famille) : choisies d’avance dans « Mettre dans… »', async () => {
            await cx('basket_edit', {basket_id: tem, name: 'Témoins', folder_id: mar, dests: [{id: 'investigation', label: 'l’enquête « testenquête »', ctx: {investigation_id: 1, item_id: 0, mode: 'one', label: 'Ici : l’enquête « testenquête »'}}, {id: 'book', label: 'Le Livre de famille'}]});
            await setCur(tem); await view();
            assert.match(await p.textContent('.cx-bview .cx-tk-say'), /→ l’enquête « testenquête » · Le Livre de famille/);
            await p.click('.cx-bview [data-cx-vput]'); await p.waitForSelector('.cx-put[open] .cx-presets');
            assert.match(await p.textContent('.cx-put [data-cx-putgo]'), /Mettre dans l’enquête « testenquête » \+ Le Livre de famille/);
            await p.click('.cx-put [data-cx-dest="basket"]'); assert.strictEqual(await p.locator('.cx-put .cx-presets').count(), 0, 'une autre ligne remplace');
            await p.keyboard.press('Escape');
        });
        await t('envoyer une partie : un dossier entier coché (trois états), un élément décoché → « Prendre (N) » dans l’enquête ; le reste reste', async () => {
            await B.openInv(1); await takeBasket();
            await p.locator(`.cx-take [data-cx-grp="f${mar}"]`).check(); await sleep(200);
            assert.match(await p.textContent('.cx-take [data-cx-n]'), /3 cochées/);
            await p.locator('.cx-take .cx-ttree li', {hasText: 'Jacques DURAND'}).locator('input[data-cx-ri]').uncheck(); await sleep(200);
            assert.strictEqual(await p.evaluate(id => document.querySelector(`.cx-take [data-cx-grp="f${id}"]`).indeterminate, mar), true);
            assert.strictEqual(await p.evaluate(id => document.querySelector(`.cx-take [data-cx-grp="f${id}"]`).indeterminate, fam), true, 'le dossier parent aussi');
            await p.click('.cx-take [data-cx-takehere]'); await sleep(2000);
            const links = (await B.api('investigation', {id: 1})).items.flatMap(i => i.links || []);
            assert.ok(links.some(l => /Date du mariage/.test(l.label)), JSON.stringify(links.map(l => l.label)));
            const left = (await B.api('cx_basket', {basket_id: tem})).items.map(x => x.title); assert.deepStrictEqual(left, ['Jacques DURAND']);
        });
        await t('« ☑ Choisir… » dans la vue : Tout / Rien, « Mettre le coché dans… »', async () => {
            await setCur(cad); await view(); await p.click('.cx-bview [data-cx-vpick]');
            await p.click('.cx-bview [data-cx-pall2]'); assert.match(await p.textContent('.cx-bview [data-cx-vputsel]'), /Mettre le coché dans/);
            await p.click('.cx-bview [data-cx-pnone]'); assert.ok(await p.locator('.cx-bview [data-cx-vputsel]').isDisabled());
        });
        await t('de l’air : aucun bouton ni champ à moins de 12 px des bords (vue du panier, « Mettre dans… », « Prendre depuis… »)', async () => {
            await view(); assert.deepStrictEqual(await padOk('dialog.cx-bview'), []);
            await p.click('.cx-bview [data-cx-vput]'); await p.waitForSelector('.cx-put[open]'); assert.deepStrictEqual(await padOk('dialog.cx-put'), []);
            await takeBasket(); assert.deepStrictEqual(await padOk('dialog.cx-take'), []);
        });
        await t('390 px et thème sombre : la vue du panier et l’arbre tiennent, sombres et lisibles', async () => {
            await p.setViewportSize({width: 390, height: 800}); await view();
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390 && document.querySelector('dialog.cx-bview').getBoundingClientRect().right <= 390));
            await takeBasket(); assert.ok(await p.evaluate(() => document.querySelector('dialog.cx-take').scrollWidth <= 390));
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            assert.match(await p.evaluate(() => getComputedStyle(document.querySelector('dialog.cx-take')).backgroundColor), /28, 31, 36/);
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await p.setViewportSize({width: 1440, height: 900});
        });
        await t('LCNDA_EXT.cxBaskets (pour l’écran « Paniers » à venir) : tree, items, create, createFolder, move, moveFolder, remove…', async () => {
            const api = await p.evaluate(() => Object.keys(window.LCNDA_EXT.cxBaskets || {}));
            for (const k of ['tree', 'items', 'create', 'createFolder', 'edit', 'editFolder', 'move', 'moveFolder', 'remove', 'removeFolder', 'moveItems']) assert.ok(api.includes(k), k);
            const tr = await p.evaluate(() => window.LCNDA_EXT.cxBaskets.tree()); assert.ok(tr.folders.length >= 2 && tr.baskets.length >= 3);
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
