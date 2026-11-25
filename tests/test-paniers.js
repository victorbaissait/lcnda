#!/usr/bin/env node
/* 🧺 Les paniers nommés, rangés les uns dans les autres (lib/connexions.php : parent_id, dests_json, done, note ; assets/js/heritage-connexions.js).
 * Base : tests/prendre-depuis-seed.js (noms inventés MAZAUD, LACOMBE, DURAND ; l'enquête « testenquête »).
 *  serveur : 3 niveaux, comptes avec les sous-paniers, pas de boucle, déplacer un élément (↶), supprimer un parent (remonter / tout, ↶) ;
 *  écran : « ＋ Nouveau panier… » ; « Garder dans le panier » demande lequel (le dernier en premier) ; la vue en grand (arbre ▸/▾, fil « › »,
 *  ✓ utilisé, note, glisser un élément / un sous-panier dans un autre, ↶) ; les destinations habituelles choisies d'avance dans « Mettre dans… » ;
 *  « ☑ Choisir… » une partie avec cases à trois états ; « Prendre depuis… → Panier » par sous-panier ; 390 px ; sombre ; de l'air (12 px au moins) ; aucune erreur.
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
    const bks = async () => (await B.api('cx_basket', {})).baskets;
    const bByName = async n => (await bks()).find(x => x.name === n);
    const closeAll = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.cx-panel, .ui-actmenu').forEach(x => x.remove()); });
    const clickUndo = async () => { const u = p.locator('.toast button, [data-undo]', {hasText: /Annuler|↶/}).last(); await u.waitFor({timeout: 8000}); await u.click(); await sleep(600); };
    const view = async () => { await closeAll(); await p.evaluate(() => window.LCNDA_EXT.connexions.openBasketView()); await p.waitForSelector('dialog.cx-bview[open] [data-cx-btree]'); };
    const padOk = sel => p.evaluate(s => { const d = document.querySelector(s), r = d.getBoundingClientRect(); const bad = [...d.querySelectorAll('button, input, select, a, textarea, [tabindex="0"]')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]')).map(e => [e, e.getBoundingClientRect()]).filter(([e, q]) => q.width && (q.left - r.left < 12 || r.right - q.right < 12) && !e.matches('.cx-gut')); return bad.map(([e]) => e.outerHTML.slice(0, 90)); }, sel);
    let fam, mar, tem;
    try {
        await t('serveur : 3 niveaux (Famille MAZAUD › Mariage 1813 › Témoins), comptes avec les sous-paniers, fil d’Ariane', async () => {
            fam = (await cx('basket_new', {name: 'Famille MAZAUD', icon: '👪'})).id;
            mar = (await cx('basket_new', {name: 'Mariage 1813', icon: '💍', parent_id: fam, note: 'les pièces pour le mariage'})).id;
            tem = (await cx('basket_new', {name: 'Témoins', parent_id: mar})).id;
            await cx('basket_add', {basket_id: fam, items: [{kind: 'datum', title: 'Moulin de Treignac', value: '1790'}]});
            await cx('basket_add', {basket_id: mar, items: [{kind: 'event', ref_id: 1, title: 'Naissance · Jean MAZAUD'}, {kind: 'datum', title: 'Date du mariage', value: '8 février 1813'}]});
            await cx('basket_add', {basket_id: tem, items: [{kind: 'person', ref_id: 2, title: 'Pierre LACOMBE'}, {kind: 'person', ref_id: 3, title: 'Jacques DURAND'}]});
            const f = await bByName('Famille MAZAUD'), t3 = await bByName('Témoins');
            assert.strictEqual(f.total, 5); assert.strictEqual(f.count, 1); assert.deepStrictEqual(t3.path, ['Famille MAZAUD', 'Mariage 1813', 'Témoins']); assert.strictEqual(t3.depth, 2);
            const tree = await B.api('cx_basket', {basket_id: fam, tree: 1}); assert.strictEqual(tree.items.length, 5);
        });
        await t('serveur : pas de boucle (Famille dans Témoins refusé), un panier ne va pas dans lui-même', async () => {
            assert.match(await cxTry('basket_move', {basket_id: fam, parent_id: tem}), /lui-même ni dans un de ses sous-paniers/);
            assert.match(await cxTry('basket_move', {basket_id: mar, parent_id: mar}), /lui-même/);
            assert.match(await cxTry('basket_edit', {basket_id: fam, name: 'Famille MAZAUD', parent_id: mar}), /sous-paniers/);
        });
        await t('serveur : supprimer un parent — « remonter » garde les sous-paniers (↶ remet tout), « tout » supprime l’arbre (↶ aussi)', async () => {
            const r = await cx('basket_delete', {basket_id: mar, mode: 'up'});
            assert.strictEqual((await bByName('Témoins')).parent_id, fam); assert.ok(!(await bByName('Mariage 1813')));
            await cx('basket_undelete', {basket: r.basket, baskets_removed: r.baskets_removed, moved: r.moved, rows: r.rows});
            assert.strictEqual((await bByName('Témoins')).parent_id, mar); assert.strictEqual((await bByName('Mariage 1813')).count, 2);
            const r2 = await cx('basket_delete', {basket_id: mar, mode: 'all'});
            assert.ok(!(await bByName('Témoins'))); assert.strictEqual((await bByName('Famille MAZAUD')).total, 1);
            await cx('basket_undelete', {basket: r2.basket, baskets_removed: r2.baskets_removed, moved: r2.moved, rows: r2.rows});
            assert.strictEqual((await bByName('Famille MAZAUD')).total, 5);
        });
        await t('« Garder dans le panier » demande lequel (le dernier utilisé en premier) ; « ＋ Nouveau panier… » (nom, emoji, une ligne)', async () => {
            await B.openInv(1); await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'place'})); await p.waitForSelector('.cx-take [data-cx-res] .cx-rlist li', {timeout: 15000});
            await p.locator('.cx-take .cx-rlist li').first().locator('input').check();
            await p.click('.cx-take [data-cx-tobasket]'); await p.waitForSelector('.ui-actmenu');
            assert.match(await p.textContent('.ui-actmenu'), /Dans quel panier/); assert.match(await p.textContent('.ui-actmenu'), /Famille MAZAUD › Mariage 1813 › Témoins/);
            await p.locator('.ui-actmenu button', {hasText: 'Nouveau panier'}).click();
            await p.waitForSelector('dialog[open] input[name="name"]'); await p.fill('dialog[open] input[name="name"]', 'Recherches Treignac'); await p.fill('dialog[open] input[name="icon"]', '📍');
            await p.fill('dialog[open] input[name="note"]', 'les lieux à vérifier'); await p.click('dialog[open] button[type="submit"]');
            await sleep(1200);
            const b = await bByName('Recherches Treignac'); assert.ok(b && b.count === 1 && b.icon === '📍' && b.note === 'les lieux à vérifier', JSON.stringify(b));
            assert.match(await p.getAttribute('#cx-pill', 'title'), /Recherches Treignac/);
        });
        await t('la vue en grand : arbre ▸/▾, fil « Famille MAZAUD › Mariage 1813 », « 5 éléments dont 4 dans les sous-paniers », ✓ utilisé et une note (↶)', async () => {
            await p.evaluate(id => localStorage.setItem('genealogie-connexions-panier', String(id)), fam);
            await view();
            assert.match(await p.textContent('.cx-bview .cx-tk-say'), /5 éléments dont 4 dans les sous-paniers/);
            assert.strictEqual(await p.locator('.cx-bview .cx-bnode').count(), 2);
            await p.click(`.cx-bview [data-cx-btog="${mar}"]`); assert.ok(await p.locator(`.cx-bview [data-cx-bn="${mar}"] > .cx-bbody`).isHidden());
            await p.click(`.cx-bview [data-cx-btog="${mar}"]`); assert.ok(await p.locator(`.cx-bview [data-cx-bn="${tem}"]`).isVisible());
            const li = p.locator('.cx-bview [data-cx-vi]', {hasText: 'Moulin de Treignac'});
            await li.locator('[data-cx-vdone]').check(); await p.waitForSelector('.cx-bview [data-cx-vi].is-done');
            await p.locator('.cx-bview [data-cx-vi]', {hasText: 'Moulin de Treignac'}).locator('[data-cx-vnote]').fill('voir le cadastre'); await p.keyboard.press('Tab'); await sleep(500);
            const it = (await B.api('cx_basket', {basket_id: fam})).items[0]; assert.strictEqual(Number(it.done), 1); assert.strictEqual(it.note, 'voir le cadastre');
            await clickUndo(); assert.strictEqual((await B.api('cx_basket', {basket_id: fam})).items[0].note, '');
            await p.evaluate(id => localStorage.setItem('genealogie-connexions-panier', String(id)), mar); await view();
            assert.match(await p.textContent('.cx-bview .cx-tk-say'), /Famille MAZAUD › Mariage 1813/);
        });
        await t('glisser : un élément dans un sous-panier, un sous-panier dans un autre (↶)', async () => {
            await p.evaluate(id => localStorage.setItem('genealogie-connexions-panier', String(id)), fam); await view();
            await p.locator('.cx-bview [data-cx-vi]', {hasText: 'Moulin de Treignac'}).dragTo(p.locator(`.cx-bview [data-cx-bh="${tem}"]`)); await sleep(1000);
            assert.ok((await B.api('cx_basket', {basket_id: tem})).items.some(x => x.title === 'Moulin de Treignac'));
            await clickUndo(); assert.ok((await B.api('cx_basket', {basket_id: fam})).items.some(x => x.title === 'Moulin de Treignac'));
            await view();
            const rt = (await bByName('Recherches Treignac')).id;
            await p.evaluate(([a, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: 'basket_move', basket_id: a, parent_id: b}}), [rt, fam]); await view();
            await p.locator(`.cx-bview [data-cx-bh="${rt}"]`).dragTo(p.locator(`.cx-bview [data-cx-bh="${mar}"]`)); await sleep(1000);
            assert.strictEqual((await bByName('Recherches Treignac')).parent_id, mar);
            await p.locator(`.cx-bview [data-cx-bh="${mar}"]`).dragTo(p.locator(`.cx-bview [data-cx-bh="${rt}"]`)); await sleep(1000);
            assert.strictEqual((await bByName('Mariage 1813')).parent_id, fam, 'boucle refusée à l’écran aussi');
            await cx('basket_move', {basket_id: rt, parent_id: 0});
        });
        await t('les destinations habituelles (l’enquête « testenquête » + le Livre de famille) : choisies d’avance dans « Mettre dans… » ; « → … » sous le nom', async () => {
            await cx('basket_edit', {basket_id: mar, name: 'Mariage 1813', icon: '💍', note: 'les pièces pour le mariage', parent_id: fam,
                dests: [{id: 'investigation', label: 'l’enquête « testenquête »', ctx: {investigation_id: 1, item_id: 0, mode: 'one', label: 'Ici : l’enquête « testenquête »'}}, {id: 'book', label: 'Le Livre de famille'}]});
            await p.evaluate(id => localStorage.setItem('genealogie-connexions-panier', String(id)), mar); await view();
            assert.match(await p.textContent('.cx-bview .cx-tk-say'), /→ l’enquête « testenquête » · Le Livre de famille/);
            await p.click('.cx-bview [data-cx-vput]'); await p.waitForSelector('.cx-put[open] .cx-presets');
            assert.match(await p.textContent('.cx-put .cx-presets'), /testenquête/); assert.match(await p.textContent('.cx-put [data-cx-putgo]'), /Mettre dans l’enquête « testenquête » \+ Le Livre de famille/);
            await p.click('.cx-put [data-cx-dest="basket"]'); assert.strictEqual(await p.locator('.cx-put .cx-presets').count(), 0, 'une autre ligne remplace');
            await p.keyboard.press('Escape');
        });
        await t('« ☑ Choisir… » une partie : un sous-panier entier (case à trois états), « Mettre les 3 cochés dans… » → l’enquête', async () => {
            await p.evaluate(id => localStorage.setItem('genealogie-connexions-panier', String(id)), fam); await view();
            await p.click('.cx-bview [data-cx-vpick]');
            await p.locator(`.cx-bview [data-cx-pkb="${mar}"]`).check(); await sleep(400);
            assert.match(await p.textContent('.cx-bview [data-cx-vputsel]'), /Mettre les 4 cochés/);
            await p.locator('.cx-bview [data-cx-vi]', {hasText: 'Jacques DURAND'}).locator('[data-cx-pk]').uncheck(); await sleep(400);
            assert.strictEqual(await p.evaluate(id => document.querySelector(`.cx-bview [data-cx-pkb="${id}"]`).indeterminate, mar), true, 'trois états');
            assert.strictEqual(await p.evaluate(id => document.querySelector(`.cx-bview [data-cx-pkb="${id}"]`).indeterminate, tem), true);
            await p.click('.cx-bview [data-cx-vputsel]'); await p.waitForSelector('.cx-put[open]');
            assert.match(await p.textContent('.cx-put h2'), /3 éléments/);
            await p.locator('.cx-put [data-cx-dest="investigation"]').first().click(); await p.click('.cx-put [data-cx-putgo]');
            await p.waitForSelector('dialog[open] select[name="inv"], .cx-inv[open]', {timeout: 10000}).catch(() => {});
            if (await p.locator('.cx-inv[open]').count()) { await p.selectOption('.cx-inv select[name="inv"]', '1'); await p.click('.cx-inv button[type="submit"]'); }
            await sleep(1500);
            const links = (await B.api('investigation', {id: 1})).items.flatMap(i => i.links || []); assert.ok(links.some(l => /Pierre LACOMBE|Date du mariage/.test(l.label)) || (await B.api('investigation', {id: 1})).items.some(i => /pièces prises/.test(i.title)));
            assert.ok((await B.api('cx_basket', {basket_id: tem})).items.some(x => x.title === 'Jacques DURAND'), 'le non coché reste');
        });
        await t('« Prendre depuis… → Panier » : un groupe par sous-panier, une case pour le prendre entier (trois états)', async () => {
            await closeAll(); await p.evaluate(id => localStorage.setItem('genealogie-connexions-panier', String(id)), fam);
            await p.evaluate(() => window.LCNDA_EXT.connexions.openTake({tab: 'basket'})); await p.waitForSelector('.cx-take [data-cx-grp]', {timeout: 15000});
            assert.match(await p.textContent('.cx-take [data-cx-res]'), /Famille MAZAUD › Mariage 1813 › Témoins/);
            await p.locator(`.cx-take [data-cx-grp="${tem}"]`).check();
            assert.strictEqual(await p.evaluate(id => document.querySelector(`.cx-take [data-cx-grp="${id}"]`).indeterminate, fam), true);
            assert.match(await p.textContent('.cx-take [data-cx-chips]'), /Ouvrir en grand/);
        });
        await t('de l’air : aucun bouton ni champ à moins de 12 px des bords (vue du panier, « Mettre dans… », « Prendre depuis… »)', async () => {
            assert.deepStrictEqual(await padOk('dialog.cx-take'), []);
            await view(); assert.deepStrictEqual(await padOk('dialog.cx-bview'), []);
            await p.click('.cx-bview [data-cx-vput]'); await p.waitForSelector('.cx-put[open]'); assert.deepStrictEqual(await padOk('dialog.cx-put'), []);
        });
        await t('390 px et thème sombre : la vue du panier tient, sombre et lisible', async () => {
            await p.setViewportSize({width: 390, height: 800}); await view();
            assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390 && document.querySelector('dialog.cx-bview').getBoundingClientRect().right <= 390));
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            assert.match(await p.evaluate(() => getComputedStyle(document.querySelector('dialog.cx-bview')).backgroundColor), /28, 31, 36/);
            await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur dans la page', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
