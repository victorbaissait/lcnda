'use strict';
/** Les essais du lot 3 des Trésors (ciel de naissance, bougie, ambiance sonore, arbre qui pousse, musique de l'arbre) — appelés par tests/test-tresors.js */
module.exports = async (t, {page, open, body}, assert) => {
    const T = fn => page.evaluate(`(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => (${fn})(T, tr)); })()`);
    await t('🌌 ciel : les calculs (éclipse du 8 avril 2024 = nouvelle lune, pleine lune du 25 janvier 2024, l’étoile polaire à la hauteur de la latitude)', async () => {
        const r = await page.evaluate(() => { const S = window.LCNDA_EXT.tresorSky; const a = S.sky({date: '2024-04-08', hour: 12, lat: 48.857, lng: 2.352}), b = S.sky({date: '2024-01-25', hour: 22, lat: 48.857, lng: 2.352});
            return {a: a.moon.phase, b: b.moon.phase, pol: b.stars.find(s => s.n === 'Polaris').alt, jup: b.planets.find(p => p.n === 'Jupiter').alt, set: b.set}; });
        assert.equal(r.a, 'nouvelle lune'); assert.equal(r.b, 'pleine lune'); assert.ok(Math.abs(r.pol - 48.9) < 1.5, `${r.pol}`); assert.ok(r.jup > 10, 'Jupiter levée le soir'); assert.ok(r.set > 16.3 && r.set < 17.2, `coucher ${r.set}`);
    });
    await t('🌌 ciel de naissance de Jean MARTIN (Naves, 12 mars 1877) : l’image se dessine et se télécharge en PNG', async () => {
        await open('ciel'); await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => { const el = document.querySelector('[data-sk] [name="who"]'); el.value = String(tr.people.find(p => T.name(p) === 'Jean MARTIN').id); el.dispatchEvent(new Event('change', {bubbles: true})); }); });
        await page.waitForTimeout(200); const b = await body(); assert.match(b, /lune|croissant|quartier/); assert.match(b, /coucher du soleil vers 1[78] h/); assert.match(b, /étoiles brillantes au-dessus de l’horizon/);
        const px = await page.$eval('[data-sk-c]', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let bright = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) bright++; return bright; });
        assert.ok(px > 300, `${px} points clairs (étoiles, texte)`);
        const dl = page.waitForEvent('download'); await page.click('[data-sk-png]'); assert.match((await dl).suggestedFilename(), /ciel-de-naissance-jean\.png/);
    });
    await t('🕯️ bougie : allumée pour Marie DURAND, elle brûle ; le registre et le bloc de la fiche la montrent', async () => {
        await open('bougie'); await page.click('[data-cd-new]'); await page.waitForSelector('dialog[open] [name="msg"]');
        await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => { const el = document.querySelector('dialog[open] [name="who"]'); el.value = String(tr.people.find(p => T.name(p) === 'Marie DURAND').id); el.dispatchEvent(new Event('change', {bubbles: true})); }); });
        await page.fill('dialog[open] [name="msg"]', 'On pense à toi.'); await page.fill('dialog[open] [name="from"]', 'Léa'); await page.click('dialog[open] button[type="submit"]');
        await page.waitForSelector('.h-tr-cd .h-tr-candle.is-lit'); const b = await body(); assert.match(b, /Marie DURAND[\s\S]*On pense à toi[\s\S]*de Léa · encore 7 j/);
        const ann = await T('(T, tr) => window.LCNDA_EXT.tresorCandle.anniversaries(T, tr, 366).length'); assert.ok(ann > 10, `${ann} anniversaires`);
    });
    await t('🔊 ambiance : le métier choisit l’ambiance (forgeron → la forge), le son se joue et s’arrête', async () => {
        await open('ambiance'); const v = await page.evaluate(() => window.LCNDA_EXT.tresorAmbiance.sceneFor('forgeron')); assert.equal(v, 'forge');
        await page.selectOption('[data-am-p]', {label: 'Marcel FAURE (forgeron)'}); assert.equal(await page.inputValue('[data-am-s]'), 'forge'); assert.equal(await page.inputValue('[data-am-l="forge"]'), '80');
        await page.click('[data-am-play]'); await page.waitForTimeout(700); assert.equal(await page.$eval('[data-tr-body]', h => h.dataset.playing), '1');
        await page.click('[data-am-stop]'); assert.equal(await page.$eval('[data-tr-body]', h => h.dataset.playing ?? ''), '');
    });
    await t('🌳 arbre qui pousse : depuis Antoine MARTIN ; en 1880 Jean est là, Henri pas encore ; Antoine roussit après 1920', async () => {
        await open('arbre-pousse'); assert.match(await page.$eval('[data-gr-box] svg', s => s.textContent), /Pierre/); // l'ancêtre le plus ancien aux descendants les plus nombreux
        await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => { const el = document.querySelector('[data-tr-body] [name="root"]'); el.value = String(tr.people.find(p => T.name(p) === 'Antoine MARTIN').id); el.dispatchEvent(new Event('change', {bubbles: true})); }); });
        assert.match(await page.$eval('[data-gr-box] svg', s => s.textContent), /Antoine[\s\S]*Jean[\s\S]*Henri/);
        const st = await page.evaluate(() => { const show = window.LCNDA_EXT.tresorGrow.show, op = n => [...document.querySelectorAll('[data-gr-n]')].find(g => g.textContent.startsWith(n)); show(1880); const a = [op('Jean').getAttribute('opacity'), op('Henri').getAttribute('opacity')]; show(1925); return [...a, op('Antoine').dataset.dead]; });
        assert.deepEqual(st, ['1', '0', '1']);
    });
    await t('🎼 musique de l’arbre : une note par naissance, des accords de mariage, et le fichier WAV', async () => {
        await open('musique'); const s = await T('(T, tr) => { const S = window.LCNDA_EXT.tresorMusic.score(T, tr, tr.people.map(p => p.id)); return {births: S.notes.filter(n => !n.death && !n.wed).length, weds: S.notes.filter(n => n.wed).length, len: S.length}; }');
        assert.equal(s.births, 18); assert.equal(s.weds, 15); assert.ok(s.len > 10);
        const dl = page.waitForEvent('download', {timeout: 60000}); await page.click('[data-mu-wav]'); const d = await dl; assert.equal(d.suggestedFilename(), 'la-musique-de-l-arbre.wav');
        assert.ok(await page.evaluate(() => window.LCNDA_EXT.tresorMusic.last) > 100000);
    });
    await t('🌌 le bloc « ciel de sa naissance » sur la fiche', async () => {
        await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => T.openPerson(tr.people.find(p => T.name(p) === 'Jean MARTIN').id)); });
        await page.waitForSelector('[data-sky-block] [data-sky-txt]:not(:empty)', {timeout: 15000}); assert.match(await page.textContent('[data-sky-block]'), /lune|croissant|quartier/);
    });
};
