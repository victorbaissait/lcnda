#!/usr/bin/env node
/* 🧩 Tableaux : 🧵 fil rouge, 🏷 tampons de solidité, 🔎 ce qui manque, 🧮 calculette d'âge, ☐ liste à cocher
 * (assets/js/heritage-boards.js, lib/boards.php) :
 *  1. ＋ Ajouter : les quatre sections ; 🔎 posé sans fiche → l'état vide commun ; avec des fiches → ce qui manque (rien sur une fiche
 *     vivante ni confidentielle), relu quand on pose une fiche ; une ligne ouvre la fiche ;
 *  2. clic droit → « 🧵 Relier par un fil rouge à… » puis clic sur l'autre élément → « même témoin » : trait rouge courbe en tirets,
 *     accroché aux deux (il suit quand on bouge) ; ↶ le retire ;
 *  3. clic droit → « 🏷 Tampon › » → Prouvé : le tampon sur le coin, enregistré, exporté ; « Retirer le tampon » ; ↶ ;
 *  4. 🧮 « 42 ans en 1793 » → né vers 1751 (entre 1750 et 1751), en direct ; ⇄ « né en 1751, en 1793 » → 42 ans ; enregistré ;
 *  5. ☐ lignes ajoutées, écrites, cochées sur place (barrées, « 1/2 »), enlevées ; ↶ ; enregistré ;
 *  6. le serveur trie ce qu'il garde (tampon inconnu, lignes bizarres) ; aucune erreur JS.
 * Base : tests/prendre-depuis-seed.js (noms fictifs MAZAUD, LACOMBE, DURAND).   node tests/test-tableau-fil-tampons.js */
'use strict';
const assert = require('assert');
const path = require('path');
const {spawnSync} = require('child_process');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

(async () => {
    const B = await start();
    const p = B.page;
    const post = (x, body) => p.evaluate(([y, b]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: b}).then(r => r?.result ?? r), [x, body]);
    const cur = () => p.evaluate(() => JSON.parse(JSON.stringify(window.LCNDA_EXT.boardsInternals.current.items)));
    const clean = () => p.evaluate(() => { document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()); document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.toast').forEach(x => x.remove()); });
    const save = async () => { await p.click('.h-board [data-bd-save]'); await sleep(1200); };
    const openBoard = async id => { await clean(); if (await p.$('.h-board [data-bd-save]')) await save();
        await p.evaluate(x => window.LCNDA_EXT.openBoardById(x), id); await p.waitForSelector('.h-board-stage', {timeout: 20000});
        await p.waitForFunction(x => window.LCNDA_EXT.boardsInternals?.current?.isOpen?.() && window.LCNDA_EXT.boardsInternals.current.id === x, id, {timeout: 20000}); await sleep(400); };
    const addMenu = async () => { await clean(); await p.click('.h-board [data-bd-add]'); await p.waitForSelector('dialog[open] .h-bd-add'); };
    const menuPick = async rx => { await p.waitForSelector('.ui-actmenu', {timeout: 5000}); const b = p.locator('.ui-actmenu button, .ui-actmenu [role="menuitem"]').filter({hasText: rx}).first(); await b.click(); await sleep(300); };
    const rclick = async sel => { const bb = await p.locator(sel).boundingBox(); await p.mouse.click(bb.x + 20, bb.y + bb.height / 2, {button: 'right'}); await sleep(250); };
    const undo = async () => { await p.click('.h-board [data-bd-undo]'); await sleep(400); };
    try {
        // 2 vivante, 3 confidentielle (sur la base d'essai)
        const db = path.join(B.tmp, 'genealogy.sqlite');
        const r0 = spawnSync('python3', ['-c', `import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("UPDATE persons SET living_status='living' WHERE id=2");c.execute("UPDATE persons SET is_private=1 WHERE id=3");c.commit()`, db], {encoding: 'utf8'});
        assert.strictEqual(r0.status, 0, r0.stderr);
        const names = Object.fromEntries(Object.entries((await B.api('board_people', {ids: '1,2,3,4'})).people).map(([k, v]) => [k, v.name]));
        const bid = Number((await post('save_board', {title: 'Les fils MAZAUD', data: {items: [
            {id: 'n1', type: 'note', x: 0, y: 0, w: 200, h: 120, text: 'Témoin LACOMBE'},
            {id: 'g1', type: 'gaps', x: 600, y: 0, w: 340, h: 300, title: 'Ce qui manque'}]}})).id);
        assert.ok(bid);

        await t('＋ Ajouter : 🧵 fil rouge, 🔎 ce qui manque, 🧮 calculette, ☐ liste ; 🔎 sans fiche → l’état vide commun', async () => {
            await openBoard(bid);
            await p.waitForSelector('.h-bi.is-type-gaps .empty-state, .h-bi.is-type-gaps [class*="empty"]', {timeout: 10000});
            assert.match(await p.textContent('.h-bi.is-type-gaps'), /Aucune fiche sur ce tableau/);
            await addMenu();
            const ks = await p.$$eval('dialog[open] .h-bd-add > section[data-k]', a => a.map(x => x.dataset.k));
            for (const k of ['fil', 'gaps', 'agecalc', 'checklist']) assert.ok(ks.includes(k), k);
            await clean();
        });
        await t('🔎 avec des fiches : ce qui manque, rien sur la vivante ni la confidentielle ; relu quand on pose une fiche ; clic → la fiche', async () => {
            await p.evaluate(() => { const c = window.LCNDA_EXT.boardsInternals.current; c.placeCx([{kind: 'person', ref_id: 1, title: 'x'}, {kind: 'person', ref_id: 2, title: 'y'}, {kind: 'person', ref_id: 3, title: 'z'}], {at: [300, 400]}); });
            await p.waitForSelector('.h-bi.is-type-gaps [data-bd-gapopen]', {timeout: 10000});
            const txt = await p.textContent('.h-bi.is-type-gaps');
            assert.ok(txt.includes(names[1]), txt); assert.match(txt, /date de décès/);
            assert.ok(!txt.includes(names[2]) && !txt.includes(names[3]), 'rien sur la vivante ni la confidentielle : ' + txt);
            await p.evaluate(() => window.LCNDA_EXT.boardsInternals.current.placeCx([{kind: 'person', ref_id: 4, title: 'w'}], {at: [300, 700]}));
            await p.waitForFunction(n => document.querySelector('.h-bi.is-type-gaps').textContent.includes(n) || document.querySelector('.h-bi.is-type-gaps').textContent.includes('Rien ne manque'), names[4], {timeout: 10000});
            assert.strictEqual(await p.$eval('.h-bi.is-type-gaps [data-bd-gapopen]', b => b.dataset.bdGapopen), '1');
        });
        await t('🧵 clic droit → « Relier par un fil rouge à… » → l’autre élément → « même témoin » ; il suit ; ↶', async () => {
            await rclick('.h-bi[data-bi="n1"]'); await menuPick(/fil rouge/);
            const pid = (await cur()).find(i => i.type === 'person' && i.person_id === 1).id;
            const bb = await p.locator(`.h-bi[data-bi="${pid}"]`).boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(200);
            await menuPick(/même témoin/);
            const l = (await cur()).find(i => i.kind === 'redstring');
            assert.ok(l, 'un fil'); assert.deepStrictEqual([l.from, l.to, l.text, l.color, l.path, l.dash, l.headEnd], ['n1', pid, 'même témoin', '#c92a2a', 'curve', 'dash', 'none']);
            assert.match(await p.textContent(`.h-bi[data-bi="${l.id}"] .h-bi-linelabel`), /même témoin/);
            // la note bouge : le fil suit
            const nb = await p.locator('.h-bi[data-bi="n1"] .h-bi-note').boundingBox();
            await p.mouse.move(nb.x + 30, nb.y + 30); await p.mouse.down(); await p.mouse.move(nb.x + 30, nb.y + 230, {steps: 6}); await p.mouse.up(); await sleep(300);
            const l2 = (await cur()).find(i => i.id === l.id);
            assert.ok(Math.abs(l2.points[0][1] - l.points[0][1]) > 100, `suit : ${l.points[0]} → ${l2.points[0]}`);
            await undo(); await undo();
            assert.ok(!(await cur()).some(i => i.kind === 'redstring'), '↶ le retire');
        });
        await t('🏷 clic droit → « Tampon › » → Prouvé : sur le coin, enregistré, exporté ; retiré ; ↶', async () => {
            await rclick('.h-bi[data-bi="n1"]'); await menuPick(/Tampon/); await menuPick(/Prouvé/);
            assert.strictEqual(await p.textContent('.h-bi[data-bi="n1"] .h-bi-stamp'), 'Prouvé');
            const st = await p.$eval('.h-bi[data-bi="n1"] .h-bi-stamp', e => [getComputedStyle(e).transform, getComputedStyle(e).position]);
            assert.ok(st[0] !== 'none' && st[1] === 'absolute', 'penché, sur le coin');
            await save();
            assert.strictEqual((await B.api('board', {id: bid})).data.items.find(i => i.id === 'n1').stamp, 'proved');
            await rclick('.h-bi[data-bi="n1"]'); await menuPick(/Tampon/); await menuPick(/Retirer le tampon/);
            assert.ok(!(await p.$('.h-bi[data-bi="n1"] .h-bi-stamp')));
            await undo(); assert.strictEqual((await cur()).find(i => i.id === 'n1').stamp, 'proved', '↶ le remet');
        });
        await t('🧮 « 42 ans en 1793 » → né vers 1751 (entre 1750 et 1751) en direct ; ⇄ né en 1751 → 42 ans ; enregistré', async () => {
            await addMenu(); await p.click('dialog[open] [data-bd-addagecalc]'); await p.waitForSelector('.h-bi.is-type-agecalc');
            const S = '.h-bi.is-type-agecalc';
            await p.fill(`${S} [data-bd-calc="calcAge"]`, '42'); await p.fill(`${S} [data-bd-calc="calcYear"]`, '1793');
            assert.match(await p.textContent(`${S} [data-bd-calcout]`), /né vers 1751.*entre 1750 et 1751/);
            await p.press(`${S} [data-bd-calc="calcYear"]`, 'Enter'); await sleep(200);
            await p.click(`${S} [data-bd-inl="agemode"]`); await sleep(200);
            await p.fill(`${S} [data-bd-calc="calcBorn"]`, '1751');
            assert.match(await p.textContent(`${S} [data-bd-calcout]`), /42 ans/);
            await p.press(`${S} [data-bd-calc="calcBorn"]`, 'Enter'); await sleep(200);
            await save();
            const it = (await B.api('board', {id: bid})).data.items.find(i => i.type === 'agecalc');
            assert.deepStrictEqual([it.calcMode, it.calcAge, it.calcYear, it.calcBorn], ['birth', 42, 1793, 1751]);
        });
        await t('☐ liste à cocher : écrire, ajouter, cocher sur place (barré, 1/2), enlever ; ↶ ; enregistrée', async () => {
            await addMenu(); await p.click('dialog[open] [data-bd-addchecklist]'); await p.waitForSelector('.h-bi.is-type-checklist');
            const S = '.h-bi.is-type-checklist';
            await p.fill(`${S} [data-bd-cktext="0"]`, 'Acte de baptême DURAND'); await p.press(`${S} [data-bd-cktext="0"]`, 'Enter'); await sleep(150);
            await p.click(`${S} [data-bd-inl="ckadd"]`); await sleep(200);
            await p.keyboard.type('Recensement 1836'); await p.keyboard.press('Enter'); await sleep(150);
            await p.check(`${S} [data-bd-ck="0"]`); await sleep(200);
            assert.strictEqual((await p.textContent(`${S} .h-bi-ckcount`)).trim(), '1/2');
            assert.ok(await p.$eval(`${S} li:first-child`, e => e.classList.contains('is-done') && getComputedStyle(e.querySelector('input[type=text]')).textDecorationLine === 'line-through'));
            let it = (await cur()).find(i => i.type === 'checklist');
            assert.deepStrictEqual(it.checks, [{t: 'Acte de baptême DURAND', done: true}, {t: 'Recensement 1836', done: false}]);
            await p.click(`${S} [data-bd-inl="ckdel"][data-i="1"]`); await sleep(200);
            assert.strictEqual((await cur()).find(i => i.type === 'checklist').checks.length, 1);
            await undo(); assert.strictEqual((await cur()).find(i => i.type === 'checklist').checks.length, 2, '↶ remet la ligne');
            await save();
            it = (await B.api('board', {id: bid})).data.items.find(i => i.type === 'checklist');
            assert.strictEqual(it.checks.length, 2); assert.strictEqual(it.checks[0].done, true);
        });
        await t('serveur : tampon inconnu et lignes bizarres écartés ; types inconnus refusés', async () => {
            const id2 = Number((await post('save_board', {title: 'Essai LACOMBE', data: {items: [
                {id: 'a', type: 'note', stamp: 'faux<script>', x: 0, y: 0, w: 10, h: 10}, {id: 'b', type: 'checklist', checks: [{t: {x: 1}, done: 'oui'}, 'x', {t: 'ok'}], x: 0, y: 0, w: 10, h: 10},
                {id: 'c', type: 'agecalc', calcMode: 'zz', calcAge: 'abc', calcYear: 99999, x: 0, y: 0, w: 10, h: 10}, {id: 'd', type: 'stampz', x: 0, y: 0}]}})).id);
            const its = (await B.api('board', {id: id2})).data.items;
            assert.deepStrictEqual(its.map(i => i.id), ['a', 'b', 'c']);
            assert.strictEqual(its[0].stamp, undefined);
            assert.deepStrictEqual(its[1].checks, [{t: '', done: true}, {t: 'ok', done: false}]);
            assert.deepStrictEqual([its[2].calcMode, its[2].calcAge, its[2].calcYear], ['age', undefined, 3000]);
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(B.errs, []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
