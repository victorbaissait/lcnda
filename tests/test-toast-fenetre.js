#!/usr/bin/env node
/* Messages (toast, undoToast) et fenêtre ouverte (assets/js/app.js : liftToastRegion, assets/css/ui.css .toast-region.is-lifted) :
 * à 390 px, une fenêtre commune (openDialog) a son bas (Annuler / Enregistrer) au bas de l'écran ; un message avec « ↶ Annuler »
 * (sur deux ou trois lignes, comme un vrai message) se pose AU-DESSUS de ce bas : il ne couvre aucun bouton, même survolé (le survol le garde à l'écran), et un clic sur
 * « Enregistrer » arrive bien au bouton. À 1440 px, une petite fenêtre au milieu : le message reste à sa place d'origine.
 *   node tests/test-toast-fenetre.js */
'use strict';
const assert = require('assert');
const {start} = require('./prendre-depuis-seed.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };

const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);

async function scenario(viewport, tag) {
    const B = await start({viewport});
    const p = B.page;
    try {
        // une fenêtre commune, haute (beaucoup de champs) : sur téléphone, son bas est collé au bas de l'écran
        const open = () => p.evaluate(() => { window.__saved = 0; const rows = Array.from({length: 18}, (_, i) => `<label>Champ ${i + 1}<input name="f${i}"></label>`).join('');
            window.LCNDA_EXT.openDialog({eyebrow: 'ESSAI', title: 'Fenêtre et message', body: rows, onSubmit: () => { window.__saved++; return true; }}); });
        const foot = () => p.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); const f = [...d.querySelectorAll('.modal-actions')].filter(x => x.getClientRects().length).at(-1);
            return [...f.querySelectorAll('button')].filter(b => b.offsetWidth).map(b => { const r = b.getBoundingClientRect(); return {label: b.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom}; }); });
        const toasts = () => p.evaluate(() => [...document.querySelectorAll('.toast-region .toast:not(.is-leaving)')].map(x => { const r = x.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; }));
        await open(); await p.waitForSelector('dialog[open] .modal-actions button');
        await p.evaluate(() => window.LCNDA_APP.undoToast('Réglage changé : « Afficher les dates en toutes lettres dans les fiches et les listes », pour toutes les fiches de cette généalogie', {undo: () => {}}));
        await p.waitForSelector('.toast-region .toast');
        await p.waitForFunction(() => document.querySelector('.toast-region .toast')?.getBoundingClientRect().height > 0);
        const btns = await foot(), ts = await toasts();
        assert.ok(btns.length >= 2, JSON.stringify(btns));
        await t(`${tag} : le message ne couvre aucun bouton du bas de la fenêtre`, async () => {
            for (const b of btns) for (const x of ts) assert.ok(!overlap(b, x), `« ${b.label} » couvert : ${JSON.stringify({b, x})}`);
            const vh = viewport.height; for (const x of ts) assert.ok(x.top >= 0 && x.bottom <= vh, 'le message reste dans l’écran');
        });
        await t(`${tag} : survolé, le message reste et ne bloque toujours pas « Enregistrer »`, async () => {
            const x = ts[0]; await p.mouse.move((x.left + x.right) / 2, (x.top + x.bottom) / 2);
            await p.waitForFunction(() => document.querySelector('.toast-region .toast')?.classList.contains('is-paused'), null, {timeout: 5000});
            const save = btns.find(b => /Enregistrer|OK|Valider/i.test(b.label)) || btns.at(-1);
            const hit = await p.evaluate(([cx, cy]) => { const e = document.elementFromPoint(cx, cy); return e?.closest('.modal-actions') ? e.closest('button')?.textContent.trim() : (e?.closest('.toast') ? 'TOAST' : e?.tagName); }, [(save.left + save.right) / 2, (save.top + save.bottom) / 2]);
            assert.equal(hit, save.label, 'le clic au milieu du bouton arrive au bouton');
            await p.mouse.click((save.left + save.right) / 2, (save.top + save.bottom) / 2);
            await p.waitForFunction(() => window.__saved === 1, null, {timeout: 5000});
        });
        await t(`${tag} : fenêtre fermée, le message revient à sa place d’origine`, async () => {
            await p.evaluate(() => window.LCNDA_APP.toast('Un autre message'));
            await p.waitForFunction(() => !document.querySelector('dialog[open]') && document.querySelector('.toast-region')?.parentNode === document.body);
            assert.equal(await p.evaluate(() => document.querySelector('.toast-region').classList.contains('is-lifted')), false);
        });
        await t(`${tag} : aucune erreur dans la page`, async () => assert.deepStrictEqual(B.errs, []));
    } finally { await B.stop(); }
}

(async () => {
    await scenario({width: 390, height: 844}, '390 px');
    await scenario({width: 1440, height: 900}, '1440 px');
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
