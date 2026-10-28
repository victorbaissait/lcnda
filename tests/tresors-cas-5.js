'use strict';
/** Les essais du lot 5 des Trésors (broderie, gravure laser, mosaïque, visage de la lignée, gazette, fond d'écran) — appelés par tests/test-tresors.js */
module.exports = async (t, {page, open, body, pick: exportPick}, assert) => {
    const T = fn => page.evaluate(`(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => (${fn})(T, tr)); })()`);
    await t('🧵 broderie : le marquoir « FAMILLE MARTIN », la grille, les fils et la taille sur Aïda', async () => {
        await open('broderie'); const b = await body(); assert.match(b, /\d+ × \d+ points · sur Aïda 14/); assert.match(b, /Rouge DMC 321 — \d+ points/); assert.match(b, /Vert DMC 701/);
        const sm = await page.evaluate(() => { const s = window.LCNDA_EXT.tresorStitch.sampler({title: 'AB', couple: '', date: '', color: 'rouge'}); return s.grid[4].slice(0, s.W).map(c => c ? 'x' : '.').join(''); });
        assert.match(sm, /\.xxx\.\.xxxx\./, 'le haut du A et du B'); await page.selectOption('[data-xs] [name="mode"]', 'grille'); assert.ok(await page.$$eval('[data-xs-out] text', l => l.length) > 100);
        const dl = page.waitForEvent('download'); await exportPick('La grille (dessin SVG)'); assert.match((await dl).suggestedFilename(), /broderie-famille-martin\.svg/);
    });
    await t('🧵 broderie : 8 motifs, 5 bordures, couleurs à soi, grandes lettres, toile et taille', async () => {
        await page.selectOption('[data-xs] [name="mode"]', 'apercu');
        for (const m of ['maison', 'coeur', 'couronne', 'tulipes', 'eglise', 'colombes', 'aucun', 'arbre']) for (const bd of ['coeurs', 'grecque', 'double', 'aucune', 'points']) {
            const r = await page.evaluate(([m, bd]) => { const S = window.LCNDA_EXT.tresorStitch, sm = S.sampler({title: 'FAMILLE MARTIN', couple: 'JEAN & LOUISE', date: '1903', motif: m, border: bd}); return {w: sm.W, h: sm.H, n: sm.grid.flat().filter(Boolean).length}; }, [m, bd]);
            assert.ok(r.w >= 41 && r.n > 100, `${m}/${bd}`); }
        await page.selectOption('[data-xs] [name="motif"]', 'couronne'); await page.selectOption('[data-xs] [name="m2"]', 'violet'); await page.selectOption('[data-xs] [name="border"]', 'coeurs'); await page.check('[data-xs] [name="big"]'); await page.selectOption('[data-xs] [name="count"]', '18'); await page.selectOption('[data-xs] [name="cloth"]', 'noir');
        const b = await body(); assert.match(b, /Violet DMC 550/); assert.match(b, /sur Aïda 18/); assert.match(await page.$eval('[data-xs-out] svg', s => s.outerHTML), /#1c1c1c/);
        const big = await page.evaluate(() => window.LCNDA_EXT.tresorStitch.sampler({title: 'AB', couple: '', date: '', big: true}).H); const small = await page.evaluate(() => window.LCNDA_EXT.tresorStitch.sampler({title: 'AB', couple: '', date: ''}).H); assert.ok(big > small, 'les grandes lettres prennent plus de place');
    });
    await t('🔥 gravure laser : un SVG en millimètres, noir = gravure, rouge = découpe, avec les noms des ancêtres', async () => {
        await open('laser'); const svg = await page.$eval('[data-lz-out] svg', s => s.outerHTML); assert.match(svg, /width="300mm"/); assert.match(svg, /stroke="#ff0000"/); assert.match(svg, />Claude</); assert.match(svg, />Antoine</);
        const dl = page.waitForEvent('download'); await exportPick('Dessin SVG pour la graveuse'); assert.match((await dl).suggestedFilename(), /eventail-lea-martin\.svg/);
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
        // le style : 8 styles, le nom du journal, 2 colonnes, sans le coin pratique, ma couleur ; 📐 dans la mise en page
        assert.ok(await page.$$eval('[data-gz-opts] [name=style] option', l => l.length) >= 8);
        await page.selectOption('[data-gz-opts] [name=style]', 'tabloid'); await page.fill('[data-gz-opts] [name=title]', 'Le Petit Martin'); await page.selectOption('[data-gz-opts] [name=cols]', '2'); await page.uncheck('[data-gz-opts] [name=show-pratique]');
        await page.check('[data-gz-opts] [name=ownAccent]'); await page.$eval('[data-gz-opts] [name=accent]', i => { i.value = '#00aa00'; i.dispatchEvent(new Event('input', {bubbles: true})); });
        const cls = await page.$eval('.gz', a => a.className + ' ' + a.getAttribute('style')); assert.match(cls, /gz-tabloid/); assert.match(cls, /gz-c2/); assert.match(cls, /gz-no-pratique/); assert.match(cls, /#00aa00/); assert.match(await body(), /Le Petit Martin/i);
        assert.equal(await page.$eval('.gz-s-pratique', s => getComputedStyle(s).display), 'none');
        await exportPick('mise en page'); await page.waitForSelector('.ly-item.ly-frame', {timeout: 10000}); await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await page.keyboard.press('Escape');
        await page.evaluate(() => localStorage.removeItem('lcnda-gazette-style'));
    });
    await t('🖥️ fond d’écran : l’ancêtre du jour (le même toute la journée), en 1920 × 1080 puis au format téléphone', async () => {
        const same = await T('(T, tr) => window.LCNDA_EXT.tresorWallpaper.ancestorOfDay(T, tr, "2026-03-12")'); assert.match(same.why, /il y a \d+ ans, jour pour jour/);
        await open('fond-ecran'); await page.waitForTimeout(300); assert.deepEqual(await page.$eval('[data-wp-c]', c => [c.width, c.height]), [1920, 1080]);
        await page.selectOption('[data-tr-body] [name="size"]', 'tel'); await page.waitForTimeout(300); assert.deepEqual(await page.$eval('[data-wp-c]', c => [c.width, c.height]), [1179, 2556]);
        const dl = page.waitForEvent('download'); await exportPick('Le fond d’écran (image PNG)'); assert.match((await dl).suggestedFilename(), /fond-d-ecran-\d{4}-\d\d-\d\d\.png/);
        // tout se règle : couleurs à soi, motif, forme, place, textes, calendrier, taille sur mesure ; retenu sur cet ordinateur
        await page.selectOption('[data-wp-form] [name="size"]', 'perso'); await page.fill('[data-wp-form] [name="w"]', '1000'); await page.fill('[data-wp-form] [name="h"]', '600'); await page.waitForTimeout(300); assert.deepEqual(await page.$eval('[data-wp-c]', c => [c.width, c.height]), [1000, 600]);
        await page.selectOption('[data-wp-form] [name="palette"]', 'perso'); await page.$eval('[data-wp-form] [name="c1"]', i => { i.value = '#ff0000'; i.dispatchEvent(new Event('input', {bubbles: true})); }); await page.selectOption('[data-wp-form] [name="grad"]', 'aucun'); await page.selectOption('[data-wp-form] [name="motif"]', 'aucun'); await page.waitForTimeout(300);
        assert.equal(await page.$eval('[data-wp-c]', c => Array.from(c.getContext('2d').getImageData(2, 2, 1, 1).data).slice(0, 3).join()), '255,0,0', 'le fond de ma couleur');
        for (const [n, v] of [['shape', 'arche'], ['photoPos', 'droite'], ['font', 'machine'], ['safe', 'icones']]) await page.selectOption(`[data-wp-form] [name="${n}"]`, v);
        await page.check('[data-wp-form] [name="cal"]'); await page.fill('[data-wp-form] [name="quote"]', 'Souviens-toi'); await page.waitForTimeout(300);
        const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('lcnda-fond-ecran'))); assert.equal(kept.shape, 'arche'); assert.equal(kept.quote, 'Souviens-toi'); assert.equal(kept.cal, true);
        await page.click('[data-wp-reset]'); await page.waitForTimeout(300); assert.equal(await page.evaluate(() => localStorage.getItem('lcnda-fond-ecran') && JSON.parse(localStorage.getItem('lcnda-fond-ecran')).shape), 'rond');
    });
};
