'use strict';
/** Les essais du lot 1 des Trésors (lettres, À ton âge, 7 familles, coloriage, dater une photo) — appelés par tests/test-tresors.js */
module.exports = async (t, {page, open, body}, assert) => {
    await t('✉️ lettre aux descendants : scellée (ni texte ni secret envoyé), puis ouverte quand la date est passée', async () => {
        await open('lettres'); await page.click('[data-l-new]'); await page.waitForSelector('dialog[open] [name="to"]');
        await page.fill('dialog[open] [name="to"]', 'Léa'); await page.fill('dialog[open] [name="open_at"]', '2040-01-01'); await page.fill('dialog[open] [name="title"]', 'Pour plus tard');
        await page.fill('dialog[open] [name="body"]', 'UN SECRET DE FAMILLE'); await page.click('dialog[open] button[type="submit"]'); await page.waitForSelector('.h-tr-sealed');
        const api = await page.evaluate(() => window.LCNDA_APP.api('tresors', { kind: 'letter' })); assert.equal(api.items[0].sealed, true); assert.equal(api.items[0].body, '');
        assert.ok(!(await body()).includes('UN SECRET'), 'le texte ne se voit pas');
        // une lettre ancienne (la date est passée) : elle est ouverte
        await page.evaluate(() => window.LCNDA_EXT.tresors.T.save({ kind: 'letter', title: 'Souvenir', body: 'Bonjour du passé', open_at: '2001-01-01', data: { to: 'tous' } }));
        await open('lettres'); assert.match(await body(), /Bonjour du passé/);
    });
    await t('✉️ « aux 18 ans de » : la date d’ouverture est l’anniversaire', async () => {
        const d = await page.evaluate(() => window.LCNDA_EXT.tresorLetters.ageDate({ by: 1990, bd: '1990-03-12' }, 18)); assert.equal(d, '2008-03-12');
    });
    await t('🎂 À ton âge : à 26 ans, l’arrière-arrière-grand-père se mariait (Naves, 1876) ; à 28, l’arrière-grand-père devenait père', async () => {
        await open('aton-age'); await page.fill('[data-age-form] [name="age"]', '26'); await page.click('[data-age-form] button[type="submit"]'); await page.waitForTimeout(200);
        let b = await body(); assert.match(b, /Antoine MARTIN[\s\S]*arrière-arrière-grand-père[\s\S]*se mariait avec Marie DURAND à Naves \(20 mai 1876\)/);
        await page.fill('[data-age-form] [name="age"]', '28'); await page.click('[data-age-form] button[type="submit"]'); await page.waitForTimeout(200);
        b = await body(); assert.match(b, /Jean MARTIN[\s\S]*devenait père de Henri MARTIN/);
    });
    await t('🃏 7 familles : MARTIN et FAURE, 6 cartes chacune, les planches et la règle s’impriment', async () => {
        await open('sept-familles'); assert.match(await body(), /MARTIN/); assert.match(await body(), /FAURE/);
        const pop = page.waitForEvent('popup'); await page.click('[data-7-print]'); const w = await pop; await w.waitForSelector('.card');
        const n = await w.$$eval('.card:not(.back)', l => l.length); assert.ok(n >= 12 && n % 6 === 0, `${n} cartes`); assert.equal(await w.$$eval('.card.back', l => l.length), n, 'un dos par carte'); assert.match(await w.content(), /Le jeu des/); await w.close();
    });
    await t('🃏 7 familles : 6 styles, photos sépia / N&B, ce qui s’écrit, la couleur d’une famille, la fenêtre de la photo (sans photo)', async () => {
        for (const s of ['ancien', 'moderne', 'enfant', 'artdeco', 'bois', 'classique']) { await page.selectOption('[data-7-opts] [name=style]', s); assert.ok(await page.$(`.h-tr-7 .card.s-${s}`), s); }
        await page.selectOption('[data-7-opts] [name=fx]', 'nb'); assert.ok(await page.$('.h-tr-7 .card.fx-nb'));
        await page.uncheck('[data-7-opts] [name=sh-others]'); assert.equal(await page.$('.h-tr-7 .card .others'), null, 'sans la liste'); await page.check('[data-7-opts] [name=sh-others]');
        await page.$eval('[data-7-col]', i => { i.value = '#123456'; i.dispatchEvent(new Event('input', {bubbles: true})); }); assert.match(await page.$eval('.h-tr-7 .card', c => c.style.getPropertyValue('--c')), /#123456/);
        await page.click('.h-tr-7 [data-7-ph]'); await page.waitForSelector('dialog[open] [data-crop]'); await page.click('dialog[open] [data-k="-1"]'); await page.click('dialog[open] button[type=submit]');
        const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('lcnda-7familles'))); assert.ok(Object.values(prefs.photos).some(x => x.none), 'sans photo retenu');
        await page.evaluate(() => localStorage.removeItem('lcnda-7familles'));
    });
    await t('🖍️ arbre à colorier : les ancêtres de Léa en traits noirs, avec son nom au pied', async () => {
        await open('coloriage'); const svg = await page.$eval('[data-co-out] svg', s => s.outerHTML);
        assert.match(svg, /L’arbre de Léa MARTIN/); assert.match(svg, /Claude/); assert.match(svg, /Henri/); assert.ok(!/fill="#(?!fff|000)[0-9a-f]{3,6}"/i.test(svg), 'que du blanc et du noir');
    });
    await t('🖍️ arbre à colorier : 8 dessins (arbre, fleurs, maisons, blasons, montgolfières, ruche, éventail, rosace), noms, trait, cadre, titre', async () => {
        const ds = await page.evaluate(() => Object.keys(window.LCNDA_EXT.tresorColoring.CO_DESIGNS)); assert.ok(ds.length >= 8, ds.join());
        for (const d of ds) { await page.check(`[data-co] [name=design][value=${d}]`); const svg = await page.$eval('[data-co-out] svg', s => s.outerHTML);
            assert.match(svg, /Claude/, d); assert.ok(!/fill="#(?!fff|000)[0-9a-f]{3,6}"/i.test(svg), `${d} : que du blanc et du noir`); }
        await page.selectOption('[data-co] [name=label]', 'prenom'); await page.selectOption('[data-co] [name=stroke]', '5'); await page.selectOption('[data-co] [name=frame]', 'etoiles'); await page.fill('[data-co] [name=title]', 'Les racines de Léa'); await page.click('[data-co] button[type=submit]');
        const svg = await page.$eval('[data-co-out] svg', s => s.outerHTML); assert.match(svg, /stroke-width="5"/); assert.match(svg, /Les racines de Léa/); assert.ok(!/MARTIN · 1935/.test(svg), 'le prénom seul');
        await page.selectOption('[data-co] [name=frame]', 'aucun'); await page.fill('[data-co] [name=title]', ''); await page.check('[data-co] [name=design][value=arbre]'); await page.selectOption('[data-co] [name=label]', 'complet'); await page.selectOption('[data-co] [name=stroke]', '3');
    });
    await t('📷 dater une photo : carte de visite à coins carrés + crinoline → 1859-1869 ; une femme de 20 ans → Marie DURAND ? non : Jeanne BORIE ? (nées vers 1850)', async () => {
        await open('dater-photo');
        const tick = async txt => page.click(`[data-ph] label:has-text("${txt}") input`);
        await tick('Petite carte (6 × 10 cm)'); await tick('Coins carrés'); await tick('Jupe très large en cloche');
        await page.fill('[data-ph] [name="age"]', '15'); await page.selectOption('[data-ph] [name="sex"]', 'female'); await page.waitForTimeout(200);
        const b = await body(); assert.match(b, /entre 1859 et 1869/); assert.match(b, /Marie DURAND|Jeanne BORIE/);
    });
};
