#!/usr/bin/env node
/* 🧩 Tableaux : 📋 colonnes « À chercher / En cours / Trouvé », 🔍 deux actes côte à côte, ⏱ minuteur de séance, ▶ présentation au clavier
 * (assets/js/heritage-boards.js, lib/boards.php) :
 *  1. ＋ Ajouter : les sections colonnes et côte à côte ; le mémo vocal caché sans micro possible ;
 *  2. 📋 une note lâchée dans « En cours » s'y range (centrée, sous l'en-tête) et le compteur passe à 1 ; vers « Trouvé » ; ↶ ;
 *     les colonnes se renomment sur place ; enregistré ;
 *  3. 🔍 deux images choisies → côte à côte ; la molette grossit les deux pareil ; 1:1 ; ↶ ; enregistré ;
 *  4. ⏱ 25:00 qui tourne ; pause ; « Finir la séance » → ce qui a été ajouté ;
 *  5. ▶ présentation : → / Espace / ← changent d'étape, Échap quitte ;
 *  6. le serveur trie (noms de colonnes, loupe) ; aucune erreur JS.
 * Base : tests/prendre-depuis-seed.js (noms fictifs MAZAUD, LACOMBE, DURAND).   node tests/test-tableau-colonnes.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const post = (x, body) => p.evaluate(([y, b]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: b}).then(r => r?.result ?? r), [x, body]);
    const cur = () => p.evaluate(() => JSON.parse(JSON.stringify(window.LCNDA_EXT.boardsInternals.current.items)));
    const one = async id => (await cur()).find(i => i.id === id);
    const clean = () => p.evaluate(() => { document.querySelectorAll('.ui-actmenu, .h-bd-pop').forEach(x => x.remove()); document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.toast').forEach(x => x.remove()); });
    const save = async () => { await p.click('.h-board [data-bd-save]'); await sleep(1200); };
    const undo = async () => { await p.click('.h-board [data-bd-undo]'); await sleep(400); };
    const addMenu = async () => { await clean(); await p.click('.h-board [data-bd-add]'); await p.waitForSelector('dialog[open] .h-bd-add'); };
    const dragTo = async (sel, tx, ty) => { const b = await p.locator(sel).boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(tx, ty, {steps: 8}); await p.mouse.up(); await sleep(350); };
    const colMid = async i => { const b = await p.locator(`.h-bi.is-type-columns section:nth-child(${i + 1})`).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    try {
        const img = new URL('assets/exemple/acte-mariage.jpg', p.url()).href, img2 = new URL('assets/exemple/bourg.jpg', p.url()).href;
        const bid = Number((await post('save_board', {title: 'Recherches MAZAUD', data: {items: [
            {id: 'c1', type: 'columns', x: 0, y: 0, w: 780, h: 480, z: -1},
            {id: 'n1', type: 'note', x: 900, y: 40, w: 160, h: 100, text: 'Baptême LACOMBE'},
            {id: 'w1', type: 'webimage', url: img, x: 900, y: 300, w: 200, h: 150}, {id: 'w2', type: 'webimage', url: img2, x: 1150, y: 300, w: 200, h: 150},
            {id: 'f1', type: 'frame', title: 'Étape DURAND', x: 0, y: 700, w: 400, h: 300}, {id: 'f2', type: 'frame', title: 'Étape MAZAUD', x: 600, y: 700, w: 400, h: 300}]}})).id);
        assert.ok(bid);
        await clean();
        await p.evaluate(x => window.LCNDA_EXT.openBoardById(x), bid); await p.waitForSelector('.h-board-stage', {timeout: 20000});
        await p.waitForFunction(x => window.LCNDA_EXT.boardsInternals?.current?.isOpen?.() && window.LCNDA_EXT.boardsInternals.current.id === x, bid, {timeout: 20000}); await sleep(400);
        await p.evaluate(() => { const c = window.LCNDA_EXT.boardsInternals.current; c.focus(['c1', 'n1', 'w1', 'w2']); }); await sleep(900);

        await t('＋ Ajouter : 📋 colonnes et 🔍 côte à côte ; le mémo vocal caché sans micro possible', async () => {
            await addMenu();
            const ks = await p.$$eval('dialog[open] .h-bd-add > section[data-k]', a => a.map(x => x.dataset.k));
            for (const k of ['columns', 'compare', 'memo']) assert.ok(ks.includes(k), k);
            assert.strictEqual(await p.$eval('dialog[open] section[data-k="memo"]', s => s.hidden === (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia)), true);
            await clean();
        });
        await t('📋 une note lâchée dans « En cours » s’y range, le compteur suit ; vers « Trouvé » ; ↶ ; renommer ; enregistré', async () => {
            const S = '.h-bi.is-type-columns';
            assert.deepStrictEqual(await p.$$eval(`${S} [data-bd-colname]`, a => a.map(x => x.value)), ['À chercher', 'En cours', 'Trouvé']);
            assert.deepStrictEqual(await p.$$eval(`${S} .h-bi-colcount`, a => a.map(x => x.textContent)), ['0', '0', '0']);
            const [mx, my] = await colMid(1); await dragTo('.h-bi[data-bi="n1"]', mx + 37, my);
            let n = await one('n1');
            assert.strictEqual(n.x, 260 + 50, 'centrée dans la colonne : ' + n.x); assert.ok(n.y >= 46, 'sous l’en-tête');
            assert.deepStrictEqual(await p.$$eval(`${S} .h-bi-colcount`, a => a.map(x => x.textContent)), ['0', '1', '0']);
            const [tx, ty] = await colMid(2); await dragTo('.h-bi[data-bi="n1"]', tx - 40, ty);
            assert.deepStrictEqual(await p.$$eval(`${S} .h-bi-colcount`, a => a.map(x => x.textContent)), ['0', '0', '1']);
            assert.strictEqual((await one('n1')).x, 520 + 50);
            await undo(); assert.strictEqual((await one('n1')).x, 310, '↶ la remet dans « En cours »');
            await p.fill(`${S} [data-bd-colname="0"]`, 'Pistes'); await p.press(`${S} [data-bd-colname="0"]`, 'Enter'); await sleep(200);
            assert.deepStrictEqual((await one('c1')).cols, ['Pistes', 'En cours', 'Trouvé']);
            // les colonnes emportent leurs cartes
            const c0 = await one('c1'); n = await one('n1');
            const hb = await p.locator(`${S} section:nth-child(1)`).boundingBox(); await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height - 20); await p.mouse.down(); await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height + 40, {steps: 6}); await p.mouse.up(); await sleep(300);
            const c2 = await one('c1'), n2 = await one('n1');
            assert.ok(c2.y - c0.y > 20 && Math.abs((n2.y - n.y) - (c2.y - c0.y)) < 1, `la carte suit : ${c2.y - c0.y} / ${n2.y - n.y}`);
            await undo();
            await save();
            const sv = (await B.api('board', {id: bid})).data.items;
            assert.deepStrictEqual(sv.find(i => i.id === 'c1').cols, ['Pistes', 'En cours', 'Trouvé']); assert.strictEqual(sv.find(i => i.id === 'n1').x, 310);
        });
        await t('🔍 deux images → côte à côte ; la molette grossit les deux pareil ; ↶ ; 1:1 ; enregistré', async () => {
            await clean();
            const b1 = await p.locator('.h-bi[data-bi="w1"]').boundingBox(), b2 = await p.locator('.h-bi[data-bi="w2"]').boundingBox();
            await p.mouse.click(b1.x + 30, b1.y + 30); await p.keyboard.down('Shift'); await p.mouse.click(b2.x + 30, b2.y + 30); await p.keyboard.up('Shift'); await sleep(200);
            await addMenu(); await p.click('dialog[open] [data-bd-addcmp]'); await p.waitForSelector('.h-bi.is-type-compare');
            const it = (await cur()).find(i => i.type === 'compare');
            assert.deepStrictEqual([it.url, it.url2], [img, img2]);
            const S = `.h-bi[data-bi="${it.id}"]`;
            await p.evaluate(id => window.LCNDA_EXT.boardsInternals.current.focus([id]), it.id); await sleep(900);
            const ib = await p.locator(`${S} [data-bd-cmp]`).first().boundingBox();
            await p.mouse.move(ib.x + ib.width / 3, ib.y + ib.height / 3); await p.mouse.wheel(0, -400); await sleep(700);
            const tf = await p.$$eval(`${S} [data-bd-cmp] img`, a => a.map(x => x.style.transform));
            assert.strictEqual(tf[0], tf[1], 'les deux pareil'); assert.match(tf[0], /scale\((?!1\))/);
            const cz = (await one(it.id)).cz; assert.ok(cz && cz.k > 1, 'loupe gardée');
            await undo(); assert.strictEqual((await one(it.id)).cz, undefined, '↶ revient à 1:1');
            await p.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2); await p.mouse.wheel(0, -300); await sleep(700);
            await save();
            const sv = (await B.api('board', {id: bid})).data.items.find(i => i.id === it.id);
            assert.ok(sv.cz.k > 1 && sv.url2 === img2, JSON.stringify(sv));
            await p.click(`${S} [data-bd-inl="cmpreset"]`); await sleep(300);
            assert.strictEqual((await one(it.id)).cz, undefined, '1:1');
        });
        await t('⏱ 25:00 qui tourne ; pause ; « Finir la séance » → ce qui a été ajouté', async () => {
            await clean();
            await p.click('.h-board [data-bd-timer]'); await sleep(1300);
            assert.match(await p.textContent('.h-board [data-bd-timer]'), /⏱ 24:5\d/);
            await p.click('.h-board [data-bd-timer]'); await p.click('.h-bd-pop [data-k="pause"]'); await sleep(200);
            assert.match(await p.textContent('.h-board [data-bd-timer]'), /⏸/);
            await addMenu(); await p.click('dialog[open] [data-bd-addchecklist]'); await p.waitForSelector('.h-bi.is-type-checklist'); await clean();
            await p.click('.h-board [data-bd-timer]'); await p.click('.h-bd-pop [data-k="end"]');
            await p.waitForSelector('dialog[open] .h-bd-tmsum');
            const txt = await p.textContent('dialog[open] .h-bd-tmsum');
            assert.match(txt, /1 ajoutés/); assert.match(txt, /À faire/);
            await clean(); assert.match(await p.textContent('.h-board [data-bd-timer]'), /⏱ 25:00/);
        });
        await t('▶ présentation : → / Espace / ← changent d’étape, Échap quitte', async () => {
            await clean(); await p.click('.h-board [data-bd-present]'); await p.click('.h-bd-pop [data-k="play"]'); await sleep(400);
            const bar = () => p.textContent('.h-bd-presentbar');
            assert.ok(await p.$('.h-board.is-present'), 'en présentation'); assert.match(await bar(), /1 \/ 2/);
            await p.keyboard.press('ArrowRight'); await sleep(150); assert.match(await bar(), /2 \/ 2/);
            await p.keyboard.press('ArrowLeft'); await sleep(150); assert.match(await bar(), /1 \/ 2/);
            await p.keyboard.press(' '); await sleep(150); assert.match(await bar(), /Étape MAZAUD.*2 \/ 2/);
            await p.keyboard.press('Escape'); await sleep(300);
            assert.ok(!(await p.$('.h-board.is-present')) && !(await p.$('.h-bd-presentbar')), 'Échap quitte');
            assert.strictEqual(await p.evaluate(() => !!document.fullscreenElement), false);
        });
        await t('serveur : noms de colonnes et loupe triés', async () => {
            const id2 = Number((await post('save_board', {title: 'Essai DURAND', data: {items: [
                {id: 'a', type: 'columns', cols: ['x'.repeat(99), {z: 1}, 'b', 'c', 'd', 'e', 'f', 'g'], x: 0, y: 0, w: 10, h: 10},
                {id: 'b', type: 'compare', media_id: '3', media_id2: -4, url2: 'javascript:alert(1)', cz: {k: 99, x: 'q', y: 5}, x: 0, y: 0, w: 10, h: 10}]}})).id);
            const its = (await B.api('board', {id: id2})).data.items;
            assert.deepStrictEqual(its[0].cols, ['x'.repeat(60), '', 'b', 'c', 'd', 'e']);
            assert.deepStrictEqual([its[1].media_id, its[1].media_id2, its[1].url2, its[1].cz], [3, 0, '', {k: 12, x: 0, y: 5}]);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
