'use strict';
/** Les essais du lot 5 des Trésors (broderie, gravure laser, mosaïque, visage de la lignée, gazette, fond d'écran) — appelés par tests/test-tresors.js */
module.exports = async (t, {page, open, body}, assert) => {
    const T = fn => page.evaluate(`(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => (${fn})(T, tr)); })()`);
    await t('🧵 broderie : le marquoir « FAMILLE MARTIN », la grille, les fils et la taille sur Aïda', async () => {
        await open('broderie'); const b = await body(); assert.match(b, /\d+ × \d+ points · sur Aïda 14/); assert.match(b, /Rouge DMC 321 — \d+ points/); assert.match(b, /Vert DMC 701/);
        const sm = await page.evaluate(() => { const s = window.LCNDA_EXT.tresorStitch.sampler({title: 'AB', couple: '', date: '', color: 'rouge'}); return s.grid[4].slice(0, s.W).map(c => c ? 'x' : '.').join(''); });
        assert.match(sm, /\.xxx\.\.xxxx\./, 'le haut du A et du B'); await page.selectOption('[data-xs] [name="mode"]', 'grille'); assert.ok(await page.$$eval('[data-xs-out] text', l => l.length) > 100);
        const dl = page.waitForEvent('download'); await page.click('[data-xs-svg]'); assert.match((await dl).suggestedFilename(), /broderie-famille-martin\.svg/);
    });
    await t('🔥 gravure laser : un SVG en millimètres, noir = gravure, rouge = découpe, avec les noms des ancêtres', async () => {
        await open('laser'); const svg = await page.$eval('[data-lz-out] svg', s => s.outerHTML); assert.match(svg, /width="300mm"/); assert.match(svg, /stroke="#ff0000"/); assert.match(svg, />Claude</); assert.match(svg, />Antoine</);
        const dl = page.waitForEvent('download'); await page.click('[data-lz-svg]'); assert.match((await dl).suggestedFilename(), /eventail-lea-martin\.svg/);
    });
    await t('🖼️ mosaïque : les 3 portraits en grille, puis Jean refait avec les visages', async () => {
        await open('mosaique'); await page.waitForSelector('[data-mo-c]'); assert.match(await body(), /3 visages/);
        await page.selectOption('[data-tr-body] [name="mode"]', 'photo'); await page.waitForTimeout(300); const h = await page.$eval('[data-mo-c]', c => c.height); assert.equal(h, 2000);
    });
    await t('👤 visage de la lignée : de père en père depuis Léa, les visages de Henri (encadré sur l’acte), Jean et Antoine', async () => {
        await open('visage'); await page.waitForSelector('.h-tr-faces'); const names = await page.$$eval('.h-tr-faces figcaption b', l => l.map(b => b.textContent));
        assert.deepEqual(names, ['Henri MARTIN', 'Jean MARTIN', 'Antoine MARTIN']); assert.match(await body(), /Le visage moyen de 3 générations/);
    });
    await t('📰 gazette : 1903, le mariage de Jean et Louise à la une, le carnet, le prix du pain', async () => {
        await open('gazette'); await page.fill('[data-tr-body] [name="y"]', '1903'); await page.waitForTimeout(100); const b = await body();
        assert.match(b, /La Gazette des MARTIN/); assert.match(b, /Jean et Louise se sont dit oui/); assert.match(b, /PARIS\. — C’est le 15 juin 1903 que Jean MARTIN, cheminot, a épousé Louise FAURE, institutrice/); assert.match(b, /Le kilo de pain : environ \d+ centimes/);
        await page.fill('[data-tr-body] [name="y"]', '1905'); await page.waitForTimeout(100); assert.match(await body(), /Bienvenue à Henri/);
    });
    await t('🖥️ fond d’écran : l’ancêtre du jour (le même toute la journée), en 1920 × 1080 puis au format téléphone', async () => {
        const same = await T('(T, tr) => window.LCNDA_EXT.tresorWallpaper.ancestorOfDay(T, tr, "2026-03-12")'); assert.match(same.why, /il y a \d+ ans, jour pour jour/);
        await open('fond-ecran'); await page.waitForTimeout(300); assert.deepEqual(await page.$eval('[data-wp-c]', c => [c.width, c.height]), [1920, 1080]);
        await page.selectOption('[data-tr-body] [name="size"]', 'tel'); await page.waitForTimeout(300); assert.deepEqual(await page.$eval('[data-wp-c]', c => [c.width, c.height]), [1179, 2556]);
        const dl = page.waitForEvent('download'); await page.click('[data-wp-png]'); assert.match((await dl).suggestedFilename(), /fond-d-ecran-\d{4}-\d\d-\d\d\.png/);
    });
};
