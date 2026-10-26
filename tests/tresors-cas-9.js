'use strict';
/** Widgets 🌌 ciel de naissance et 📰 gazette, Listes › 📰 Gazettes, crédits des sons — appelé par tests/test-tresors.js */
module.exports = async (t, {page}, assert) => {
    await t('🌌📰 widgets du tableau de bord : le ciel d’une personne choisie, la gazette d’une année précise ; « Lire » ouvre la gazette', async () => {
        const r = await page.evaluate(async () => { const E = window.LCNDA_EXT, A = window.LCNDA_APP, T = E.tresors.T, tr = await E.dashboard.tr_sky.load(), paul = tr.people.find(p => T.name(p) === 'Paul MARTIN');
            const box = document.createElement('div'); box.id = 'trw-test'; document.body.append(box);
            box.innerHTML = E.dashboard.tr_sky.render('01', {id: 'a', type: 'tr_sky', config: {person: paul.id, hour: 22}}, 'span-4', tr) + E.dashboard.tr_gazette.render('02', {id: 'b', type: 'tr_gazette', config: {mode: 'fixe', year: paul.by}}, 'span-6', tr);
            await new Promise(res => setTimeout(res, 300));
            const c = box.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
            return {inChooser: A.defaultDashboardBlocks.filter(x => ['tr_sky', 'tr_gazette'].includes(x[0])).length, title: box.querySelector('h3, .card-title, header')?.textContent || box.innerText, lit, year: box.querySelector('.h-trw-gz small')?.textContent, by: paul.by, cfg: !!E.dashboardConfig.tr_sky?.html && !!E.dashboardConfig.tr_gazette?.read}; });
        assert.equal(r.inChooser, 2); assert.ok(r.cfg); assert.match(r.title, /Paul/); assert.ok(r.lit > 500, 'le ciel est dessiné'); assert.equal(r.year, `Année ${r.by}`);
        await page.evaluate(() => document.querySelector('#trw-test [data-trw-gz]').click()); await page.waitForSelector('[data-tr-page="gazette"] .gz');
        assert.equal(Number(await page.inputValue('[data-tr-page="gazette"] [name=y]')), r.by); await page.evaluate(() => document.getElementById('trw-test')?.remove());
    });
    await t('📰 Listes › Gazettes : une ligne par année de la famille, « Lire » ouvre la bonne année', async () => {
        await page.evaluate(() => { window.LCNDA_APP.state.listType = 'gazettes'; window.LCNDA_APP.setModule('listes'); }); await page.waitForSelector('.h-gz-list tbody tr');
        const y = await page.$eval('.h-gz-list tbody tr [data-trw-gz]', b => b.dataset.trwGz); await page.click('.h-gz-list tbody tr [data-trw-gz]');
        await page.waitForSelector('[data-tr-page="gazette"] .gz'); assert.equal(await page.inputValue('[data-tr-page="gazette"] [name=y]'), y);
    });
    await t('🔊 ambiance sonore : les crédits disent que tout est synthétisé, libre de droits, couche par couche', async () => {
        await page.evaluate(() => window.LCNDA_EXT.tresors.open('ambiance')); await page.waitForSelector('[data-tr-page="ambiance"] .h-tr-credits');
        const txt = await page.$eval('.h-tr-credits', d => d.textContent); assert.match(txt, /Libres de droits/); assert.match(txt, /aucun enregistrement|Aucun enregistrement/i);
        assert.equal(await page.$$eval('.h-tr-credits li', l => l.length), await page.evaluate(() => Object.keys(window.LCNDA_EXT.tresorAmbiance.LAYERS).length), 'une ligne de crédit par couche');
    });
};
