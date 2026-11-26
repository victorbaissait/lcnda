#!/usr/bin/env node
/* 🧩 Tableaux ← 📊 données téléchargées, 🧺 panier, 📎 insérer une info (assets/js/heritage-boards.js, lib/boards.php) :
 *  1. ＋ Ajouter → « 📊 Des données téléchargées » : le choix commun (dataListPicker), « Poser vivant » → un élément « data » qui montre la liste
 *     comme le widget (↗ source), gardé après un rechargement, ⚙️ Personnaliser dans le panneau de droite, un clic ouvre la liste ;
 *     « Poser les lignes cochées » → une carte par ligne (titre, date, lieu, ↗ source) en grille, dans un ▭ cadre au nom de la liste ;
 *  2. ＋ Ajouter → « 🧺 Mon panier » : fiche, média, lieu (carte et repère), ensemble (tableur + source), passage (note + source), événement
 *     (carte) ; marqués « ✓ utilisé » ; ↶ retire tout et remet « pas utilisé » ; « 📥 Prendre depuis… » vers ce tableau ;
 *  3. 📍 Mettre dans… → 🧩 Un tableau (depuis une liste, tableau fermé) et ↶ ; glisser du panier sur la toile (posé où on lâche) ;
 *  4. 📎 de la barre (rien de choisi : une carte au centre, avec sa source) ; 📎 dans une note (au curseur, la source gardée « ↗ » dessous) ; « / » ;
 *     clic droit sur un élément → 🧺 Prendre ;
 *  5. mode consultation : rien ne se pose ; 390 px et sombre ; aucune erreur JS.
 * Base : tests/prendre-depuis-seed.js (noms fictifs MAZAUD, LACOMBE, DURAND).   node tests/test-tableau-donnees-panier.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const ONLY = process.env.TB_ONLY ? new RegExp(process.env.TB_ONLY) : null;
const t = async (name, fn) => { if (ONLY && !ONLY.test(name)) return; try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

/* une liste FABRIQUÉE, enregistrée avant le chargement de l'app */
const FAKE = () => {
    const E = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const rows = [{name: 'Grand prix de Chamberet', qid: 'Q1', d: '1777-06-01', y: 1777, lat: 45.585, lon: 1.72, lieu: 'Chamberet', u: 'https://example.org/gp'},
        {name: 'Course de Paris', d: '1777-07-01', y: 1777, lat: 48.85, lon: 2.35, lieu: 'Paris', u: ''},
        {name: 'Course trop tard', d: '1790-05-01', y: 1790, lat: 45.55, lon: 1.79, lieu: 'Treignac', u: ''}];
    (E.dataLists = E.dataLists || []).push({id: 'test_caisses', icon: '🛷', label: 'Courses de caisses à savon', group: 'Le monde', theme: 'sport', source: 'Jeu d’essai (CC0)', sourceUrl: 'https://example.org/licence',
        load: async () => rows,
        fields: [{key: 'name', label: 'Course', type: 'text'}, {key: 'd', label: 'Date', type: 'date'}, {key: 'lieu', label: 'Lieu', type: 'place'}, {key: 'u', label: 'Article', type: 'url'}],
        period: r => [r.y, r.y], geo: r => [r.lat, r.lon]});
};

(async () => {
    const B = await start();
    const p = B.page;
    const post = (x, body) => p.evaluate(([y, b]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: b}).then(r => r?.result ?? r), [x, body]);
    const cur = () => p.evaluate(() => JSON.parse(JSON.stringify(window.LCNDA_EXT.boardsInternals.current.items)));
    const undo = async () => { const u = p.locator('.toast button', {hasText: '↶'}).last(); await u.waitFor({timeout: 10000}); await u.click(); await sleep(700); };
    /** un clic à la souris au milieu de l'élément (les fenêtres flottantes : sans « faire défiler jusqu'à lui ») */
    const mclick = async (loc, o = {}) => { const bb = await loc.boundingBox(); assert.ok(bb, 'visible'); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, o); };
    const clean = () => p.evaluate(() => { document.querySelectorAll('.ui-actmenu, .cx-qi, .cx-panel').forEach(x => x.remove()); document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.toast').forEach(x => x.remove()); });
    let bid = 0, bid2 = 0;
    const openBoard = async id => { await clean(); if (await p.$('.h-board [data-bd-save]')) { await p.click('.h-board [data-bd-save]'); await sleep(1200); } // enregistré avant de rouvrir (sinon « modifié ailleurs »)
        await p.evaluate(x => window.LCNDA_EXT.openBoardById(x), id); await p.waitForSelector('.h-board-stage', {timeout: 20000});
        await p.waitForFunction(x => window.LCNDA_EXT.boardsInternals?.current?.isOpen?.() && window.LCNDA_EXT.boardsInternals.current.id === x, id, {timeout: 20000}); await sleep(300); };
    const addMenu = async () => { await clean(); await p.click('.h-board [data-bd-add]'); await p.waitForSelector('dialog[open] .h-bd-add'); };
    const pickList = async () => { const S = 'dialog[open] section[data-k="data"]'; await p.waitForSelector(`${S} [data-ld-ov-q]`, {timeout: 15000}); await p.fill(`${S} [data-ld-ov-q]`, 'savon'); await p.click(`${S} [data-ld-pick="test_caisses"]`); await p.waitForSelector(`${S} .atd-chosen`); return S; };
    try {
        await B.ctx.addInitScript(FAKE);
        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.atelierData && window.LCNDA_EXT?.dataListPicker && window.LCNDA_EXT?.openBoardById && window.LCNDA_EXT?.connexions, null, {timeout: 60000});
        bid = Number((await post('save_board', {title: 'Les courses MAZAUD', data: {items: []}})).id);
        bid2 = Number((await post('save_board', {title: 'Tableau LACOMBE', data: {items: [{id: 'n0', type: 'note', x: 0, y: 0, w: 200, h: 120, text: 'Déjà là'}]}})).id);
        assert.ok(bid && bid2);

        await t('＋ Ajouter : « 📊 Des données téléchargées » et « 🧺 Mon panier », rangés avec les autres (Réglages → Tableaux)', async () => {
            await openBoard(bid); await addMenu();
            const ks = await p.$$eval('dialog[open] .h-bd-add > section[data-k]', a => a.map(x => x.dataset.k));
            assert.ok(ks.includes('data') && ks.includes('basket'), ks.join(','));
            assert.ok(ks.indexOf('data') < ks.indexOf('screen'), 'juste après « Une fiche »');
            const kit = await p.evaluate(() => window.LCNDA_EXT.boardKit.prefs().addOrder);
            assert.ok(kit.includes('data') && kit.includes('basket'), 'dans la liste « Menu ＋ Ajouter » des réglages');
        });
        await t('📊 Poser vivant : la liste comme le widget, ↗ source, gardée après rechargement, ⚙️ à droite, un clic ouvre la liste', async () => {
            const S = await pickList();
            await p.fill(`${S} [data-atd-f="from"]`, '1770'); await p.fill(`${S} [data-atd-f="to"]`, '1780'); await p.dispatchEvent(`${S} [data-atd-f="to"]`, 'change');
            await p.click(`${S} [data-bd-datalive]`);
            await p.waitForSelector('.h-bi.is-type-data .atd-rows li', {timeout: 20000});
            assert.deepStrictEqual((await p.$$eval('.h-bi.is-type-data .atd-rows li > button', a => a.map(x => x.textContent.trim()))).sort(), ['Course de Paris', 'Grand prix de Chamberet']);
            assert.ok(await p.$('.h-bi.is-type-data a.atd-src[href="https://example.org/gp"]'), '↗ source sur la ligne');
            assert.match(await p.textContent('.h-bi.is-type-data .atd-lic'), /Jeu d’essai \(CC0\)/);
            await p.click('.h-board [data-bd-save]'); await sleep(1200);
            const saved = (await B.api('board', {id: bid})).data.items.find(i => i.type === 'data');
            assert.deepStrictEqual([saved.cfg.src, saved.cfg.from, saved.cfg.to], ['test_caisses', '1770', '1780']);
            await p.reload(); await p.waitForFunction(() => window.LCNDA_EXT?.openBoardById && window.LCNDA_EXT?.atelierData, null, {timeout: 60000});
            await openBoard(bid); await p.waitForSelector('.h-bi.is-type-data .atd-rows li', {timeout: 20000});
            // ⚙️ Personnaliser dans le panneau de droite : on choisit l'élément
            await p.evaluate(() => { const c = window.LCNDA_EXT.boardsInternals.current; c.select([c.items.find(i => i.type === 'data').id]); });
            await p.waitForSelector('.h-board-inspector [data-bd-datacfg] [data-atd-perso]', {timeout: 10000});
            await p.selectOption('.h-board-inspector [data-atd-f="view"]', 'cards'); await p.click('.h-board-inspector [data-bd-dataapply]');
            await p.waitForSelector('.h-bi.is-type-data .atd-card', {timeout: 20000});
            assert.strictEqual((await cur()).find(i => i.type === 'data').cfg.view, 'cards');
            await p.click('.h-bi.is-type-data [data-atd-go]');
            await p.waitForFunction(() => window.LCNDA_APP.state.listType === 'data_test_caisses', null, {timeout: 15000});
        });
        await t('🗒 Poser les lignes cochées : une carte par ligne (titre, date, lieu, ↗ source) en grille, dans un ▭ cadre au nom de la liste', async () => {
            await openBoard(bid); const n0 = (await cur()).length; await addMenu(); const S = await pickList();
            await p.waitForSelector(`${S} [data-atd-pick]`, {timeout: 15000});
            const labels = await p.$$eval(`${S} [data-atd-pick]`, a => a.map(x => x.closest('li').textContent));
            for (const want of ['Grand prix de Chamberet', 'Course de Paris']) await p.check(`${S} [data-atd-pick="${labels.findIndex(l => l.includes(want))}"]`);
            await p.click(`${S} [data-bd-datarows]`); await sleep(500);
            const its = await cur(), cards = its.filter(i => i.type === 'card'), fr = its.find(i => i.type === 'frame');
            assert.strictEqual(its.length, n0 + 3);
            assert.strictEqual(cards.length, 2); assert.strictEqual(fr.title, 'Courses de caisses à savon');
            const gp = cards.find(c => c.title === 'Grand prix de Chamberet');
            assert.match(gp.sub, /1777/); assert.match(gp.sub, /Chamberet/); assert.strictEqual(gp.url, 'https://example.org/gp'); assert.match(gp.source, /Jeu d’essai/);
            assert.ok(cards.every(c => c.url), 'chaque carte a une source (la ligne, sinon la liste)');
            assert.ok(cards.every(c => c.x >= fr.x && c.x + c.w <= fr.x + fr.w && c.y >= fr.y && c.y + c.h <= fr.y + fr.h), 'dans le cadre');
            assert.strictEqual(cards[0].y, cards[1].y, 'en grille (même rangée)');
            assert.ok(await p.$('.h-bi.is-type-card a[data-bd-src][href="https://example.org/gp"]'));
        });
        // 🧺 un panier avec une chose de chaque sorte
        const seedBasket = () => p.evaluate(async () => {
            const CX = window.LCNDA_EXT.connexions, r = await window.LCNDA_APP.api('cx_basket', {}); await window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: 'basket_clear', basket_id: r.basket_id}});
            await CX.take([{kind: 'person', ref_id: 1, title: 'Jean MAZAUD'}, {kind: 'media', ref_id: 5, title: 'Photo de famille n° 5'},
                {kind: 'place', ref_id: 1, title: 'Treignac', data: {lat: 45.5367, lon: 1.7958}},
                {kind: 'set', title: 'Naissances LACOMBE', data: {columns: ['Nom', 'Année'], rows: [['Marie LACOMBE', '1790'], ['Anne LACOMBE', '1792']], source: 'Registre fictif', url: 'https://example.org/registre'}},
                {kind: 'text', title: 'Pierre DURAND était meunier', origin: {label: 'Note fictive', url: 'https://example.org/note'}},
                {kind: 'event', title: 'Naissance de Jean MAZAUD', value: '1790 · Treignac', origin: {label: 'Fiche de Jean MAZAUD', person_id: 1}}], {quiet: true});
            return (await window.LCNDA_APP.api('cx_basket', {})).items.length; });
        await t('🧺 Mon panier → chaque sorte posée (fiche, média, lieu, tableur, note, carte), marquée « utilisé » ; ↶ défait tout', async () => {
            assert.strictEqual(await seedBasket(), 6);
            await openBoard(bid); const n0 = (await cur()).length; await addMenu();
            const S = 'dialog[open] section[data-k="basket"]'; await p.waitForSelector(`${S} [data-bd-bki]`, {timeout: 15000});
            assert.ok(await p.$(`${S} select[data-bd-bksel]`), 'le choix du panier (basketSelect)');
            await p.check(`${S} [data-bd-bkall]`); await p.click(`${S} [data-bd-bkput]`);
            await p.waitForFunction(n => window.LCNDA_EXT.boardsInternals.current.items.length >= n + 6, n0, {timeout: 15000}); await sleep(800);
            const its = (await cur()).slice(n0), by = k => its.filter(i => i.type === k);
            assert.strictEqual(by('person')[0].person_id, 1); assert.strictEqual(by('media')[0].media_id, 5);
            assert.deepStrictEqual([by('map')[0].pins[0].lat, by('map')[0].pins[0].label], [45.5367, 'Treignac']);
            const tb = by('table')[0]; assert.deepStrictEqual(tb.cells[0], ['Nom', 'Année']); assert.strictEqual(tb.cells.length, 3); assert.strictEqual(tb.url, 'https://example.org/registre'); assert.match(tb.source, /Registre fictif/);
            assert.match(by('note')[0].text, /meunier/); assert.strictEqual(by('note')[0].url, 'https://example.org/note');
            assert.strictEqual(by('card')[0].title, 'Naissance de Jean MAZAUD'); assert.match(by('card')[0].source, /Fiche de Jean MAZAUD/);
            await p.waitForSelector('.h-bi.is-type-table .h-bi-srcline a[href="https://example.org/registre"]');
            await p.waitForSelector('.h-bi.is-type-person .h-bi-pinfo strong'); assert.ok(!/Fiche #/.test(await p.textContent('.h-bi.is-type-person .h-bi-pinfo strong')), 'la fiche est lue');
            const bk = await B.api('cx_basket', {}); assert.strictEqual(bk.items.length, 6, 'tout reste dans le panier'); assert.ok(bk.items.every(i => Number(i.done) === 1), 'marqués « utilisé »');
            await undo();
            assert.strictEqual((await cur()).length, n0, '↶ retire ce qui a été posé');
            assert.ok((await B.api('cx_basket', {})).items.every(i => Number(i.done) === 0), '↶ : plus « utilisé »');
        });
        await t('📥 Prendre depuis… → « Ajouter à 🧩 ce tableau »', async () => {
            await openBoard(bid); const n0 = (await cur()).length; await addMenu();
            await p.$eval('dialog[open] section[data-k="basket"] [data-bd-bktake]', x => x.scrollIntoView({block: 'center'}));
            await p.click('dialog[open] section[data-k="basket"] [data-bd-bktake]'); await p.waitForSelector('.cx-take');
            assert.match(await p.textContent('.cx-take h2'), /Les courses MAZAUD/);
            await p.click('.cx-take [data-cx-tab="basket"]');
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-take .cx-rlist li')].some(li => li.textContent.includes('Naissance de Jean MAZAUD')), null, {timeout: 10000});
            await p.locator('.cx-take .cx-rlist li', {hasText: 'Naissance de Jean MAZAUD'}).first().locator('input[type=checkbox]').check();
            await p.click('.cx-take [data-cx-takehere]');
            await p.waitForFunction(n => window.LCNDA_EXT.boardsInternals.current.items.length === n + 1, n0, {timeout: 15000});
            const c = (await cur()).at(-1); assert.strictEqual(c.type, 'card'); assert.strictEqual(c.title, 'Naissance de Jean MAZAUD');
            await undo(); assert.strictEqual((await cur()).length, n0);
        });
        await t('📍 Mettre dans… → 🧩 Un tableau, depuis une liste (tableau fermé) ; ↶ le retire', async () => {
            await clean(); await p.evaluate(() => window.LCNDA_EXT.dataListsEngine.open('test_caisses')); await p.waitForFunction(() => window.LCNDA_APP.state.listType === 'data_test_caisses', null, {timeout: 15000}); await sleep(600);
            assert.ok(await p.evaluate(() => !window.LCNDA_EXT.boardsInternals.current.isOpen()), 'le tableau est fermé');
            await p.evaluate(() => window.LCNDA_EXT.connexions.putInto([{kind: 'row', title: 'Course trop tard', value: '1790 · Treignac', origin: {label: 'Listes · Courses de caisses à savon', url: 'https://example.org/licence', open: {list: 'test_caisses'}}}]));
            await p.waitForSelector('.cx-put [data-cx-dest="board"]'); await p.click('.cx-put [data-cx-dest="board"]'); await p.click('.cx-put [data-cx-putgo]');
            await p.waitForSelector('.ui-actmenu'); await p.locator('.ui-actmenu button, .ui-actmenu [role="menuitem"]', {hasText: 'Tableau LACOMBE'}).first().click();
            for (let k = 0; k < 60 && !((await B.api('board', {id: bid2})).data.items || []).some(i => i.title === 'Course trop tard'); k++) await sleep(250);
            const it = (await B.api('board', {id: bid2})).data.items.find(i => i.title === 'Course trop tard');
            assert.strictEqual(it.type, 'card'); assert.strictEqual(it.url, 'https://example.org/licence'); assert.strictEqual(it.origin.open.list, 'test_caisses');
            assert.ok(it.x > 200, 'à droite de ce qui y était');
            await undo();
            const after = (await B.api('board', {id: bid2})).data.items; assert.deepStrictEqual(after.map(i => i.id), ['n0']);
        });
        await t('🧺 glissé du panneau du panier sur la toile : posé là où on lâche', async () => {
            await openBoard(bid); const n0 = (await cur()).length;
            await p.click('.h-board [data-bd-basket]'); await p.waitForSelector('.cx-panel li[data-cx-bi]', {timeout: 10000});
            const li = p.locator('.cx-panel li[data-cx-bi]', {hasText: 'Naissance de Jean MAZAUD'}).first();
            const sb = await p.$eval('.h-board-stage', x => { const r = x.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
            const tx = Math.round(sb.x + sb.w - 220), ty = Math.round(sb.y + 160); // à droite du panneau du panier
            const lb = await li.boundingBox(); await p.mouse.move(lb.x + 40, lb.y + lb.height / 2); await p.mouse.down(); await p.mouse.move(lb.x + 60, lb.y + lb.height / 2 + 10, {steps: 3}); await p.mouse.move(tx, ty, {steps: 8}); await p.mouse.up();
            await p.waitForFunction(n => window.LCNDA_EXT.boardsInternals.current.items.length === n + 1, n0, {timeout: 15000});
            const c = (await cur()).at(-1);
            const pos = await p.evaluate(id => { const el = document.querySelector(`.h-bi[data-bi="${id}"]`).getBoundingClientRect(); return {x: el.left + el.width / 2, y: el.top + el.height / 2}; }, c.id);
            const sb2 = await p.$eval('.h-board-stage', x => { const r = x.getBoundingClientRect(); return {x: r.left, y: r.top}; }), ex = tx + sb2.x - sb.x, ey = ty + sb2.y - sb.y; // la barre d'options change de hauteur quand un élément est choisi
            assert.ok(Math.abs(pos.x - ex) < 30 && Math.abs(pos.y - ey) < 30, `au pointeur : ${JSON.stringify(pos)} ≈ ${ex},${ey}`);
            await undo();
        });
        await t('📎 de la barre, rien de choisi : l’info est posée au centre avec sa source', async () => {
            await openBoard(bid); await p.evaluate(() => window.LCNDA_EXT.boardsInternals.current.select([])); const n0 = (await cur()).length;
            await p.click('.h-board [data-bd-insert]'); await p.waitForSelector('.cx-qi [data-qi-q]');
            await p.fill('.cx-qi [data-qi-q]', 'Naissance de Jean MAZAUD');
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi [data-qi-i]')].some(x => /Naissance de Jean MAZAUD/.test(x.textContent)), null, {timeout: 15000});
            await p.locator('.cx-qi [data-qi-i]', {hasText: 'Naissance de Jean MAZAUD'}).first().click();
            await p.waitForFunction(n => window.LCNDA_EXT.boardsInternals.current.items.length > n, n0, {timeout: 15000}); await sleep(300);
            const c = (await cur()).at(-1); assert.ok(['card', 'note', 'table'].includes(c.type), c.type);
            assert.ok(c.source || c.url, 'avec sa source : ' + JSON.stringify(c));
            await undo(); assert.strictEqual((await cur()).length, n0);
        });
        await t('📎 dans une note : au curseur, la source gardée (« ↗ » dessous) ; « / » en début de ligne ouvre aussi', async () => {
            await openBoard(bid);
            const id = await p.evaluate(async () => { const c = window.LCNDA_EXT.boardsInternals.current; const r = await c.placeCx([{kind: 'text', title: 'Pierre DURAND était meunier', origin: {label: 'Note fictive', url: 'https://example.org/note'}}]); c.focus(r.ids); return r.ids[0]; });
            assert.ok(id, 'une note posée'); await sleep(600);
            await p.evaluate(x => window.LCNDA_EXT.boardsInternals.current.select([x]), id);
            await p.click('.h-board [data-bd-insert]'); await p.waitForSelector('.cx-qi [data-qi-q]');
            await p.fill('.cx-qi [data-qi-q]', 'Naissance de Jean MAZAUD');
            await p.waitForFunction(() => [...document.querySelectorAll('.cx-qi [data-qi-i]')].some(x => /Naissance de Jean MAZAUD/.test(x.textContent)), null, {timeout: 15000});
            await mclick(p.locator('.cx-qi [data-qi-i]', {hasText: 'Naissance de Jean MAZAUD'}).first()); await sleep(500);
            assert.ok(await p.$(`.h-bi[data-bi="${id}"] [data-bd-text][contenteditable="true"]`), 'on écrit encore dans la note');
            await p.click('.h-board-stage', {position: {x: 30, y: 30}}); await sleep(600);
            const n = (await cur()).find(i => i.id === id);
            assert.match(n.text, /meunier/); assert.match(n.text, /Naissance de Jean MAZAUD/);
            assert.ok((n.srcs || []).some(s => /Fiche de Jean MAZAUD/.test(s.label)), 'la source gardée sur la note : ' + JSON.stringify(n.srcs));
            assert.ok(await p.$(`.h-bi[data-bi="${id}"] .h-bi-srcline`));
            // « / » en début de ligne, en écrivant dans la note
            await p.evaluate(x => window.LCNDA_EXT.boardsInternals.current.select([x]), id);
            await p.dblclick(`.h-bi[data-bi="${id}"]`); await p.waitForSelector(`.h-bi[data-bi="${id}"] [data-bd-text][contenteditable="true"]`);
            await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('/');
            await p.waitForSelector('.cx-qi [data-qi-q]', {timeout: 5000}); await p.keyboard.press('Escape'); await sleep(300);
            await p.click('.h-board-stage', {position: {x: 30, y: 30}}); await sleep(400);
        });
        await t('clic droit sur un élément du tableau → « 🧺 Prendre » le met au panier', async () => {
            await openBoard(bid); await clean();
            const id = await p.evaluate(async () => (await window.LCNDA_EXT.boardsInternals.current.placeCx([{kind: 'row', title: 'Grand prix de Chamberet', value: '1777 · Chamberet', origin: {label: 'Listes · Courses de caisses à savon', url: 'https://example.org/gp'}}])).ids[0]); await sleep(400);
            const before = (await B.api('cx_basket', {})).items.length; await p.evaluate(x => window.LCNDA_EXT.boardsInternals.current.focus([x]), id); await sleep(600);
            await mclick(p.locator(`.h-bi[data-bi="${id}"]`), {button: 'right'}); await p.waitForSelector('.ui-actmenu'); console.log('MENU', await p.evaluate(() => document.querySelector('.ui-actmenu').innerText.replace(/\n+/g, ' | ')));
            await mclick(p.locator('.ui-actmenu button, .ui-actmenu [role="menuitem"]', {hasText: /Prendre/}).first()); await sleep(800);
            const items = (await B.api('cx_basket', {})).items; assert.strictEqual(items.length, before + 1);
            assert.ok(items.some(i => i.title === 'Grand prix de Chamberet' && i.origin?.url === 'https://example.org/gp'));
        });
        await t('mode consultation : rien ne se pose (＋ Ajouter, 📎, « Mettre dans… »)', async () => {
            await openBoard(bid); const n0 = (await cur()).length;
            await p.evaluate(() => document.body.classList.add('is-kiosk'));
            await clean(); await p.click('.h-board [data-bd-add]'); await sleep(400);
            assert.ok(!(await p.$('dialog[open] .h-bd-add')), 'pas de fenêtre');
            assert.match(await p.evaluate(() => [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' ')), /consultation/);
            await p.click('.h-board [data-bd-insert]'); await sleep(300); assert.ok(!(await p.$('.cx-qi')));
            const r = await p.evaluate(async () => { const t0 = window.LCNDA_EXT.dropTargets.find(x => x.id === 'board'); let err = ''; try { await t0.receive([{kind: 'text', title: 'x'}], {board_id: window.LCNDA_EXT.boardsInternals.current.id}); } catch (e) { err = e.message; } return {on: t0.enabled(), here: t0.here(), err}; });
            assert.deepStrictEqual([r.on, r.here], [false, null]); assert.match(r.err, /consultation/);
            assert.strictEqual((await cur()).length, n0);
            await p.evaluate(() => document.body.classList.remove('is-kiosk'));
        });
        await t('390 px et sombre : la fenêtre « Ajouter » ne déborde pas, rien de collé ; données et cartes en sombre', async () => {
            await p.setViewportSize({width: 390, height: 844}); await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            await openBoard(bid); await addMenu(); await p.waitForSelector('dialog[open] section[data-k="basket"] [data-bd-bki], dialog[open] section[data-k="basket"] .muted', {timeout: 15000});
            await p.waitForSelector('dialog[open] section[data-k="data"] [data-ld-ov-q]', {timeout: 15000});
            const r = await p.evaluate(() => {
                const vw = document.documentElement.clientWidth, bad = [];
                document.querySelectorAll('dialog[open] section[data-k="data"] *, dialog[open] section[data-k="basket"] *').forEach(el => { const b = el.getBoundingClientRect(); if (!b.width || el.closest('.ldt-pick-themes')) return; if (b.right > vw + 0.5 || b.left < -0.5) bad.push(el.className || el.tagName); });
                const s = document.querySelector('dialog[open] section[data-k="basket"]').getBoundingClientRect();
                return {page: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 5), left: s.left, right: vw - s.right};
            });
            assert.ok(r.page <= 0, 'la page ne défile pas de côté : ' + r.page); assert.deepStrictEqual(r.bad, []);
            assert.ok(r.left >= 8 && r.right >= 8, `marges ${r.left} / ${r.right}`);
            await clean();
            const bg = await p.evaluate(() => [getComputedStyle(document.querySelector('.h-bi.is-type-data .h-bi-data')).backgroundColor, getComputedStyle(document.querySelector('.h-bi.is-type-card .h-bi-card')).backgroundColor]);
            assert.ok(bg.every(c => !/rgb\(255, 255, 255\)/.test(c)), 'sombre : ' + bg.join(' / '));
            await p.evaluate(() => { delete document.documentElement.dataset.theme; }); await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
