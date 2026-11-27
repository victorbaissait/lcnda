#!/usr/bin/env node
/* 🧩 Tableaux : un clic sur une pastille de couleur ne fait rien bouger (assets/js/heritage-boards.js, assets/css/heritage.css).
 *  Barre du haut (✏️ Stylo, ↗ Flèche avec « Pointes », ／ Trait, 🗒 Note) et panneau de droite (fond, bord, texte, fond du tableau) :
 *  seule la pastille choisie change (la rangée n'est pas refaite, le carré « autre couleur » reste à sa place et prend la couleur),
 *  la couleur est bien prise, et « • modifié » ↔ « ✓ Enregistré » ne fait plus passer les boutons du haut d'une ligne à l'autre.
 *  Base : tests/prendre-depuis-seed.js (noms fictifs MAZAUD, LACOMBE, DURAND).   node tests/test-tableau-pastilles-stables.js */
'use strict';
const assert = require('assert');
const {start, sleep} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };

/* dans la page : clique la pastille n° idx de `boxSel`, relève les cadres de `measureSel` pendant 8 images → [différences] */
const clickAndWatch = (p, boxSel, swSel, idx, measureSel) => p.evaluate(async ([boxSel, swSel, idx, measureSel]) => {
    const box = document.querySelector(boxSel);
    const snap = () => [...document.querySelectorAll(measureSel)].map(e => { const r = e.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`; }).join(' ');
    const base = snap(), bad = [];
    const sws = [...box.querySelectorAll(swSel)]; const target = idx < 0 ? sws[sws.length + idx] : sws[idx];
    if (!target) return ['pastille introuvable'];
    target.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    if (snap() !== base) bad.push('tout de suite');
    for (let i = 0; i < 8; i++) { await new Promise(r => requestAnimationFrame(r)); if (snap() !== base) bad.push('image ' + i); }
    await new Promise(r => setTimeout(r, 900)); if (snap() !== base) bad.push('à la fin');
    return bad;
}, [boxSel, swSel, idx, measureSel]);

(async () => {
    const B = await start();
    const p = B.page;
    try {
        await p.waitForFunction(() => window.LCNDA_EXT?.openBoardById && window.LCNDA_UI?.savedStatus, null, {timeout: 60000});
        const post = (x, body) => p.evaluate(([y, b]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: b}).then(r => r?.result ?? r), [x, body]);
        const id = Number((await post('save_board', {title: 'Les pastilles MAZAUD', data: {items: [{id: 'n0', type: 'note', x: 0, y: 0, w: 200, h: 120, text: 'LACOMBE'}, {id: 's0', type: 'shape', x: 300, y: 0, w: 120, h: 80, shape: 'rect'}]}})).id);
        await p.evaluate(x => window.LCNDA_EXT.openBoardById(x), id); await p.waitForSelector('.h-board-stage', {timeout: 20000});
        await p.waitForFunction(x => window.LCNDA_EXT.boardsInternals?.current?.id === x, id, {timeout: 20000}); await sleep(600);
        const OPTS = '.h-board [data-bd-opts]', TB = `${OPTS} .h-sw, ${OPTS} .h-bt, ${OPTS} .ui-color, ${OPTS} input[type=color], .h-board-inspector`;

        await t('barre du haut : ↗ Flèche (trait puis « Pointes »), ✏️ Stylo, ／ Trait, 🗒 Note — rien ne bouge, la pastille et le carré prennent la couleur', async () => {
            for (const [tool, idx] of [['arrow', 2], ['arrow', -3], ['pen', 2], ['line', 3], ['note', 2]]) {
                await p.click(`.h-board [data-bd-tool="${tool}"]`); await sleep(500);
                const bad = await clickAndWatch(p, OPTS, '.h-sw', idx, TB);
                assert.deepStrictEqual(bad, [], `${tool} #${idx} : ça bouge (${bad.join(', ')})`);
                const st = await p.evaluate(([o, idx]) => { const sws = [...document.querySelectorAll(`${o} .h-sw`)]; const s = idx < 0 ? sws[sws.length + idx] : sws[idx];
                    const row = [...document.querySelectorAll(`${o} .h-sw`)].filter(x => [...x.attributes].some(a => a.name.startsWith('data-bd-') && s.getAttribute(a.name) === a.value && a.name !== 'data-v'));
                    return {on: s.classList.contains('is-on'), others: row.filter(x => x !== s && x.classList.contains('is-on')).length, v: s.dataset.v || s.dataset.bdPencolor || s.dataset.bdNotecolor}; }, [OPTS, idx]);
                assert.ok(st.on, `${tool} : la pastille est cochée`); assert.strictEqual(st.others, 0, `${tool} : une seule pastille cochée`);
            }
            // la flèche : la couleur des pointes est prise (« = » décoché), le carré « autre couleur » des pointes la montre
            await p.click('.h-board [data-bd-tool="arrow"]'); await sleep(400);
            await clickAndWatch(p, OPTS, '.h-sw', -3, TB);
            const head = await p.evaluate(o => ({same: document.querySelector(`${o} .h-bt[data-bd-toolcolor="head"]`).classList.contains('is-on'), v: [...document.querySelectorAll(`${o} .h-sw[data-bd-toolcolor="head"]`)].find(x => x.classList.contains('is-on'))?.dataset.v, custom: document.querySelector(`${o} [data-bd-toolcustom="head"]`).value}), OPTS);
            assert.strictEqual(head.same, false, '« = » décoché'); assert.strictEqual(head.custom.toLowerCase(), String(head.v).toLowerCase(), 'le carré « autre couleur » prend la couleur');
            const bad = await clickAndWatch(p, OPTS, '.h-bt[data-bd-toolcolor="head"]', 0, TB);
            assert.deepStrictEqual(bad, [], '« = » : rien ne bouge');
            assert.ok(await p.evaluate(o => document.querySelector(`${o} .h-bt[data-bd-toolcolor="head"]`).classList.contains('is-on') && !document.querySelector(`${o} .h-sw[data-bd-toolcolor="head"].is-on`), OPTS), '« = » recoché, plus de pastille de pointe');
            await p.click('.h-board [data-bd-tool="select"]'); await sleep(300);
        });
        await t('panneau de droite : fond d’une note, bord d’une forme, fond du tableau — rien ne bouge, la couleur est prise', async () => {
            const IN = '.h-board-inspector', M = `${IN} .h-sw, ${IN} .ui-color, ${IN} label, .h-board-toolbar, .h-board-main`;
            for (const it of ['n0', 's0']) {
                await p.evaluate(x => window.LCNDA_EXT.boardsInternals.current.select([x]), it); await sleep(500);
                const bad = await clickAndWatch(p, IN, '.h-sw[data-bd-set="fill"]', 3, M);
                assert.deepStrictEqual(bad, [], `${it} : ça bouge (${bad.join(', ')})`);
                const r = await p.evaluate(([x, IN]) => { const s = document.querySelectorAll(`${IN} .h-sw[data-bd-set="fill"]`)[3]; return {v: s.dataset.v, on: s.classList.contains('is-on'), n: document.querySelectorAll(`${IN} .h-sw[data-bd-set="fill"].is-on`).length, item: window.LCNDA_EXT.boardsInternals.current.items.find(i => i.id === x).fill}; }, [it, IN]);
                assert.strictEqual(r.item, r.v, `${it} : la couleur est prise`); assert.ok(r.on); assert.strictEqual(r.n, 1);
            }
            await p.evaluate(() => window.LCNDA_EXT.boardsInternals.current.select([])); await sleep(500);
            if (await p.$(`${IN} [data-bd-bgset]`)) {
                const bad = await clickAndWatch(p, IN, '[data-bd-bgset]', 2, M);
                assert.deepStrictEqual(bad, [], `fond du tableau : ça bouge (${bad.join(', ')})`);
            }
        });
        await t('« • modifié » ↔ « Enregistrement… » ↔ « ✓ Enregistré » : les boutons du haut restent sur la même ligne', async () => {
            const pos = await p.evaluate(() => { const el = document.querySelector('[data-bd-status]'), out = []; for (const st of ['saved', 'dirty', 'saving', 'error', 'saved']) { window.LCNDA_UI.savedStatus(el, st); out.push(Math.round(document.querySelector('.h-board-main').getBoundingClientRect().y)); } return out; });
            assert.strictEqual(new Set(pos).size, 1, pos.join(' / '));
        });
        await t('aucune erreur de page', async () => { assert.deepStrictEqual(B.errs || [], []); });
    } finally { await B.stop(); }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
