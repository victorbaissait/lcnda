'use strict';
/** Les essais du lot 4 des Trésors (chasse au trésor, ancêtre mystère, livre dont tu es le héros, coïncidences, Et si) — appelés par tests/test-tresors.js */
/** l'impression passe par la fenêtre « Imprimer » de l'app (K13) : on lit son aperçu */
const printFrame = async page => { const fr = await (await page.waitForSelector('dialog.k-print[open] iframe', {timeout: 15000})).contentFrame(); return {waitForSelector: (...a) => fr.waitForSelector(...a), $$eval: (...a) => fr.$$eval(...a), content: () => fr.content(), close: () => page.click('dialog.k-print[open] [data-k-x]')}; };
module.exports = async (t, {page, open, body}, assert) => {
    const T = fn => page.evaluate(`(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => (${fn})(T, tr)); })()`);
    await t('🗝️ chasse au trésor : 3 cachettes, 3 énigmes ; la bonne réponse mène à la cachette suivante, les autres à des fausses pistes', async () => {
        await open('chasse'); await page.fill('[data-hu-form] [name="spots"]', 'sous le paillasson\nderrière l’horloge\ndans le grenier'); await page.fill('[data-hu-form] [name="treasure"]', 'le gâteau');
        await page.click('[data-hu-form] button[type="submit"]'); const w = await printFrame(page); await w.waitForSelector('.cd');
        assert.equal(await w.$$eval('.cd', l => l.length), 3); const html = await w.content();
        assert.match(html, /Carte 2 <small>\(à cacher : sous le paillasson\)/); assert.match(html, /cherchez <u>derrière l’horloge<\/u>/); assert.match(html, /le gâteau/);
        const cards = await w.$$eval('.cd', l => l.map(c => c.textContent)); assert.ok(cards.every(c => (c.match(/cherchez/g) || []).length >= 3), 'chaque énigme a au moins trois pistes'); await w.close();
        assert.match(await body(), /Les chasses préparées/);
    });
    await t('🕵️ ancêtre mystère : le même ancêtre pour une journée ; les indices se dévoilent ; trouvé du premier coup = 10 points', async () => {
        const same = await T('(T, tr) => window.LCNDA_EXT.tresorMystery.mysteryOf(T, tr, "2026-10-25").id === window.LCNDA_EXT.tresorMystery.mysteryOf(T, tr, "2026-10-25").id'); assert.equal(same, true);
        await open('mystere'); assert.equal(await page.$$eval('.h-tr-clues li', l => l.length), 1); await page.click('[data-my-more]'); assert.equal(await page.$$eval('.h-tr-clues li', l => l.length), 2);
        const id = await page.evaluate(() => window.LCNDA_EXT.tresorMystery.current());
        await page.evaluate(i => { const el = document.querySelector('[data-tr-body] [name="guess"]'); el.value = String(i); el.dispatchEvent(new Event('change', {bubbles: true})); }, id);
        await page.click('[data-my-try]'); await page.waitForTimeout(100); assert.match(await body(), /Bravo/); assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('lcnda-tr-mystery'))).points, 9);
    });
    await t('📖 livre dont tu es le héros : la vie de Jean MARTIN, le métier (cheminot), le mariage (Louise), le départ (Paris)', async () => {
        const ch = await T('(T, tr) => window.LCNDA_EXT.tresorHero.chapters(T, tr, tr.people.find(p => T.name(p) === "Jean MARTIN"))');
        assert.deepEqual(ch.map(c => c.title), ['Ta naissance', 'Le métier', 'L’amour', 'Partir ?', 'Les enfants', 'La fin du voyage']);
        assert.ok(ch[1].choices.some(c => c.real && c.label === 'Devenir cheminot')); assert.ok(ch[2].choices.some(c => c.real && /Louise FAURE/.test(c.label))); assert.match(ch[3].real, /Paris/);
        await open('heros'); await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors; return T.tree().then(tr => { const el = document.querySelector('[data-tr-body] [name="hero"]'); el.value = String(tr.people.find(p => T.name(p) === 'Jean MARTIN').id); el.dispatchEvent(new Event('change', {bubbles: true})); }); });
        await page.click('[data-he-go]'); assert.match(await body(), /Tu es Jean\. Tu nais le 12 mars 1877 à Naves, fils de Antoine MARTIN et de Marie DURAND/);
        for (let k = 0; k < 8; k++) { const real = await page.$('[data-he-c]'); if (real) { const btns = await page.$$('[data-he-c]'); for (const b of btns) { if (/cheminot|Louise|Paris/.test(await b.textContent())) { await b.click(); break; } } await page.click('[data-he-next]'); } else if (await page.$('[data-he-next]')) await page.click('[data-he-next]'); else break; }
        assert.match(await body(), /Tu as fait 3 choix sur 3 comme Jean/);
    });
    await t('🎯 coïncidences : 4 naissances un 12 mars, Jeanne morte le jour de son anniversaire, Léa née le jour de la mort de son grand-père, Noël, le jour de l’An', async () => {
        await open('coincidences'); const b = await body();
        assert.match(b, /4 personnes nées un 12 mars/); assert.match(b, /Jeanne BORIE est morte le jour de son anniversaire, à 63 ans/); assert.match(b, /Pierre FAURE est mort le jour de son anniversaire/);
        assert.match(b, /Léa MARTIN est née un 12 mars, jour anniversaire de la mort de sa grand-père Henri MARTIN|Léa MARTIN est née un 12 mars, jour anniversaire de la mort de son grand-père Henri MARTIN/); assert.match(b, /Berthe FAURE est née le jour de Noël 1890/); assert.match(b, /Suzanne LEROY est née le jour de l’An 1908/);
    });
    await t('🦋 Et si Antoine et Marie ne s’étaient pas rencontrés : 7 vies, dont Léa', async () => {
        await open('et-si'); const fid = await T('(T, tr) => tr.families.find(f => [f.a, f.b].map(x => T.name(tr.byId.get(x))).join(" & ") === "Antoine MARTIN & Marie DURAND").id');
        await page.selectOption('[data-wi-f]', String(fid)); await page.waitForTimeout(100); const b = await body(); assert.match(b, /7 vies n’auraient jamais existé/); assert.match(b, /Et Léa MARTIN non plus/); assert.match(b, /dont 2 personnes en vie/);
    });
};
