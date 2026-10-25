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
        const n = await w.$$eval('.card', l => l.length); assert.ok(n >= 12 && n % 6 === 0, `${n} cartes`); assert.match(await w.content(), /Le jeu des/); await w.close();
    });
    await t('🖍️ arbre à colorier : les ancêtres de Léa en traits noirs, avec son nom au pied', async () => {
        await open('coloriage'); const svg = await page.$eval('[data-co-out] svg', s => s.outerHTML);
        assert.match(svg, /L’arbre de Léa MARTIN/); assert.match(svg, /Claude/); assert.match(svg, /Henri/); assert.ok(!/fill="#(?!fff|000)[0-9a-f]{3,6}"/i.test(svg), 'que du blanc et du noir');
    });
    await t('📷 dater une photo : carte de visite à coins carrés + crinoline → 1859-1869 ; une femme de 20 ans → Marie DURAND ? non : Jeanne BORIE ? (nées vers 1850)', async () => {
        await open('dater-photo');
        const tick = async txt => page.click(`[data-ph] label:has-text("${txt}") input`);
        await tick('Petite carte (6 × 10 cm)'); await tick('Coins carrés'); await tick('Jupe très large en cloche');
        await page.fill('[data-ph] [name="age"]', '15'); await page.selectOption('[data-ph] [name="sex"]', 'female'); await page.waitForTimeout(200);
        const b = await body(); assert.match(b, /entre 1859 et 1869/); assert.match(b, /Marie DURAND|Jeanne BORIE/);
    });
};
