'use strict';
/** Listes › 🛂 Passeports : passeport intérieur et passeport pour l'étranger, séparés — appelé par tests/test-tresors.js */
module.exports = async (t, {page}, assert) => {
    await t('🛂 Listes › Passeports : tous, les passeports intérieurs, ceux pour l’étranger (Filtrer ▾ → Sorte) ; la sorte se choisit et se garde', async () => {
        await page.evaluate(async () => { const T = window.LCNDA_EXT.tresors.T, tr = await T.tree(true), id = n => tr.people.find(p => T.name(p) === n).id;
            await T.save({kind: 'passport', person_id: id('Paul MARTIN'), title: 'Passeport de Paul MARTIN', body: '', data: {sorte: 'etranger', destination: 'Jersey', date: '1871'}}); });
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'passports'; window.LCNDA_APP.setModule('listes'); });
        await page.waitForSelector('.h-pp-list'); await page.waitForTimeout(300);
        const sorts = () => page.$$eval('.h-pp-list tbody tr', l => l.map(r => r.children[1].textContent));
        const all = await sorts(); assert.ok(all.includes('Passeport') && all.includes('Passeport intérieur'), all.join());
        // H10 : la sorte est une rubrique de « Filtrer ▾ » (pastille bleue), plus des boutons Tous / Intérieurs / Étranger
        const sorte = v => page.evaluate(x => document.querySelector('.h-pp-list .ui-listbar').setFilter('sorte', x), v);
        await sorte(['etranger']); assert.deepEqual([...new Set(await sorts())], ['Passeport']);
        await sorte(['interieur']); assert.deepEqual([...new Set(await sorts())], ['Passeport intérieur'], 'un passeport sans sorte (saisi avant) est intérieur');
        await sorte([]);
        if (!await page.isVisible('[data-pp-go]')) await page.click('.h-pp-list .ui-ph-more > summary'); // K5 : dans l’en-tête, ou dans « ⋯ »
        await page.click('[data-pp-go]'); await page.waitForSelector('[data-tr-page="passeports"] .h-tr-pp');
        await page.click('[data-pp-edit]'); await page.waitForSelector('dialog[open] select[name="sorte"]');
        assert.ok(['interieur', 'etranger'].includes(await page.$eval('dialog[open] select[name="sorte"]', s => s.value)));
        await page.keyboard.press('Escape');
    });
};
