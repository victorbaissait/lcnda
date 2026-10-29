'use strict';
/** Listes › ✨ Trésors de famille (lettres, bougies, partages, passeport des lieux, actes manquants) et les liens des pages vers leur liste — appelé par tests/test-tresors.js */
module.exports = async (t, {page}, assert) => {
    const list = async k => { await page.evaluate(k => { window.LCNDA_APP.state.listType = k; window.LCNDA_APP.setModule('listes'); }, k); await page.waitForSelector('.h-trl'); await page.waitForTimeout(250);
        return page.evaluate(() => ({rows: [...document.querySelectorAll('.h-trl tbody tr')].map(r => r.innerText), text: document.querySelector('.h-trl').innerText})); };
    await t('✨ Listes des Trésors : lettres (sans le contenu scellé), bougies, partages, passeport des lieux, actes manquants', async () => {
        await page.evaluate(async () => { const T = window.LCNDA_EXT.tresors.T, tr = await T.tree(true), paul = tr.people.find(p => T.name(p) === 'Paul MARTIN');
            await T.save({kind: 'letter', title: 'Pour tes 18 ans', body: 'TEXTE SECRET', open_at: '2045-01-01', data: {from: 'Mamie', to: 'Léa'}});
            await T.save({kind: 'candle', person_id: paul.id, title: 'Pour Paul', body: 'On pense à toi', data: {from: 'Léa'}});
            await T.save({kind: 'share', person_id: paul.id, title: 'La branche Martin', open_at: '2099-01-01', data: {people: 12, locked: true}}); });
        let r = await list('tr_letters'); assert.ok(r.rows.some(x => /Pour tes 18 ans/.test(x) && /scellée/.test(x)), r.rows.join(' | ')); assert.doesNotMatch(r.text, /TEXTE SECRET/, 'jamais le contenu d’une lettre scellée');
        await page.click('.h-trl .ui-listbar-fbtn'); await page.check('[data-lb-f="state"][value="ouvertes"]'); await page.click('[data-lb-done]'); await page.waitForTimeout(150); const open = await page.evaluate(() => [...document.querySelectorAll('.h-trl tbody tr')].map(x => x.innerText)); assert.ok(!open.some(x => /Pour tes 18 ans/.test(x)));
        r = await list('tr_candles'); assert.ok(r.rows.some(x => /Paul MARTIN/.test(x) && /On pense à toi/.test(x) && /allumée/.test(x)), r.rows.join(' | '));
        r = await list('tr_shares'); assert.ok(r.rows.some(x => /12/.test(x) && /oui/.test(x) && /en cours/.test(x)), r.rows.join(' | '));
        r = await list('tr_stamps'); assert.ok(r.rows.length > 0, 'les lieux de l’arbre');
        await list('tr_gaps'); assert.ok(await page.$('[data-trl-gaps]'), 'le bouton vers l’assistant');
        await page.click('[data-trl-gaps]'); await page.waitForFunction(() => window.LCNDA_APP.state.module === 'recherche' && window.LCNDA_APP.state.researchKind === 'gaps');
        // on range derrière soi : les essais suivants (bougies, lettres) partent d'une base propre
        await page.evaluate(async () => { const T = window.LCNDA_EXT.tresors.T; for (const k of ['letter', 'candle', 'share']) for (const x of await T.items(k)) if (['Pour tes 18 ans', 'Pour Paul', 'La branche Martin'].includes(x.title)) await T.remove(x.id); });
    });
    await t('✨ chaque page des Trésors mène à sa liste (et Rappels, Maisons de famille pour ce qui existait déjà)', async () => {
        for (const [k, type] of [['lettres', 'tr_letters'], ['bougie', 'tr_candles'], ['rappels', 'reminders'], ['maisons', 'houses']]) {
            await page.evaluate(k => window.LCNDA_EXT.tresors.open(k), k); await page.waitForSelector(`[data-tr-page="${k}"] [data-tr-rel]`);
            await page.click(`[data-tr-page="${k}"] [data-tr-rel]`); await page.waitForFunction(type => window.LCNDA_APP.state.module === 'listes' && window.LCNDA_APP.state.listType === type, type);
        }
        const side = await page.evaluate(() => document.querySelector('#sidebar-content')?.innerText || ''); assert.match(side, /Trésors de famille/);
    });
};
