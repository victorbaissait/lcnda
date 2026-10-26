'use strict';
/** Les widgets des Trésors sur le tableau de bord (heritage-tresors-widgets.js) — appelé par tests/test-tresors.js */
module.exports = async (t, {page}, assert) => {
    await t('🧩 les 15 widgets des Trésors : dans le choix du tableau de bord, chacun se dessine sans erreur', async () => {
        const r = await page.evaluate(async () => { const E = window.LCNDA_EXT, A = window.LCNDA_APP, T = E.tresors.T;
            await T.save({kind: 'letter', title: 'Pour plus tard', body: 'X', open_at: '2041-06-01', data: {from: 'Mamie', to: 'Léa'}});
            const keys = A.defaultDashboardBlocks.filter(x => /^tr_/.test(x[0])).map(x => x[0]), box = document.createElement('div'); box.id = 'trw-all'; box.className = 'dashboard-grid'; box.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:auto;background:#fff;padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start'; document.body.append(box); const out = {};
            for (const k of keys) { const D = await E.dashboard[k].load(); const html = E.dashboard[k].render('01', {id: k, type: k, config: {}}, 'span-6', D); const el = document.createElement('div'); el.dataset.k = k; el.innerHTML = html; box.append(el); out[k] = el.innerText; }
            await new Promise(res => setTimeout(res, 300));
            for (const x of await T.items('letter')) if (x.title === 'Pour plus tard') await T.remove(x.id);
            return {keys, out, info: keys.filter(k => !A.dashboardWidgetInfo?.[k])}; });
        if (process.env.TRW_SHOT) await page.screenshot({path: process.env.TRW_SHOT, fullPage: false}); // TRW_SHOT=chemin.png : voir les widgets
        assert.equal(r.keys.length, 15, r.keys.join());
        assert.deepEqual(r.info, [], 'chaque widget a sa phrase d’aide');
        for (const k of r.keys) assert.doesNotMatch(r.out[k], /n’a pas pu se dessiner|n’ont pas pu se charger/, k);
        assert.match(r.out.tr_word, /\S/); assert.match(r.out.tr_money, /en \d{4}[\s\S]*€/);
        assert.match(r.out.tr_letter, /Dans [\s\S]*Pour plus tard/); assert.match(r.out.tr_mystery, /C’est (une femme|un homme)/);
        assert.match(r.out.tr_aton, /À \d+ ans|Il faut|Pas encore/); assert.match(r.out.tr_grow, /Depuis|Choisis/); assert.match(r.out.tr_stamps, /\d+ \/ \d+/);
    });
    await t('🧩 widgets : les boutons ouvrent le bon trésor ; ▶ l’ambiance joue et ⏹ l’arrête', async () => {
        await page.evaluate(() => document.querySelector('#trw-all [data-k="tr_word"] [data-trw-open]').click());
        await page.waitForSelector('[data-tr-page="vieux-mots"]');
        const played = await page.evaluate(async () => { const b = document.querySelector('#trw-all [data-k="tr_ambiance"] [data-trw-play]'); if (!b) return 'pas de bouton'; let made = 0; const AC = window.AudioContext;
            window.AudioContext = class extends AC { constructor(...a) { super(...a); made++; } }; b.click(); document.querySelector('#trw-all [data-k="tr_ambiance"] [data-trw-stop]').click(); window.AudioContext = AC; return made; });
        assert.equal(played, 1, 'un son lancé');
        await page.evaluate(() => document.getElementById('trw-all')?.remove());
    });
};
