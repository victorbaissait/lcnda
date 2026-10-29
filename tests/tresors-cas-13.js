'use strict';
/** ✨ Trésors : un seul modèle pour toutes les pages (en-tête K5, ⤓ Exporter ▾, 🖨 Imprimer, 📁 copie dans les médias, K10, K1) — appelé par tests/test-tresors.js */
module.exports = async (t, {page, open, pick}, assert) => {
    await t('📐 les 44 pages : le même en-tête (sur-titre « Trésors · … », icône à part, ← Tous les trésors), un seul ⤓ Exporter ▾, aucun ⬇ ni 📥', async () => {
        const keys = await page.evaluate(() => window.LCNDA_EXT.tresorFeatures.map(f => f.key));
        assert.ok(keys.length >= 44, `${keys.length} pages`);
        const bad = [];
        for (const k of keys) {
            await open(k);
            const r = await page.evaluate(k => {
                const pg = document.querySelector(`[data-tr-page="${k}"]`), h = pg?.querySelector(':scope > .page-header');
                const acts = h?.querySelector('.page-actions'), txt = pg?.textContent || '';
                return {head: !!h?.matches('.ui-ph[data-tr-head]'), eb: h?.querySelector('.eyebrow')?.textContent || '', ico: !!h?.querySelector('h2 > .ui-ph-ico'), back: !!h?.querySelector('.ui-ph-text [data-tr-home]'),
                    exp: pg.querySelectorAll('[data-tr-export]').length, expOut: [...pg.querySelectorAll('[data-tr-export]')].filter(b => !acts?.contains(b)).length,
                    prn: pg.querySelectorAll('[data-tr-print]').length, prnOut: [...pg.querySelectorAll('[data-tr-print]')].filter(b => !acts?.contains(b)).length,
                    blue: acts ? acts.querySelectorAll(':scope > .button:not(.secondary)').length : 0, arrows: /⬇|📥/.test(txt), rawPrint: !!pg.querySelector('[onclick*="print"]'),
                    handEmpty: [...pg.querySelectorAll('p.h-tr-muted, p.muted')].some(p => /^(Aucun|Aucune|Rien|L’arbre est vide|Pas d’)/.test(p.textContent.trim()))};
            }, k);
            const why = [!r.head && 'en-tête', !/^Trésors · \S/.test(r.eb) && `sur-titre « ${r.eb} »`, !r.ico && 'icône', !r.back && '← Tous les trésors', r.exp > 1 && `${r.exp} Exporter`, r.expOut && 'Exporter hors de l’en-tête',
                r.prn > 1 && `${r.prn} Imprimer`, r.prnOut && 'Imprimer hors de l’en-tête', r.blue > 1 && `${r.blue} boutons bleus`, r.arrows && '⬇ ou 📥', r.rawPrint && 'window.print', r.handEmpty && 'ligne vide écrite à la main'].filter(Boolean);
            if (why.length) bad.push(`${k} : ${why.join(', ')}`);
        }
        assert.deepEqual(bad, []);
    });
    await t('⤓ Exporter ▾ : les formats dans un seul menu, puis « 📁 Ranger une copie dans les médias » (l’image entre dans les médias)', async () => {
        await open('coloriage');
        await page.click('[data-tr-page] .page-header [data-tr-export]');
        const items = await page.$$eval('.ui-actmenu .ui-actmenu-i b', l => l.map(b => b.textContent));
        assert.deepEqual(items, ['Image PNG', 'Dessin SVG', 'Ranger une copie dans les médias']);
        await page.keyboard.press('Escape');
        const resp = page.waitForResponse(r => r.url().includes('action=retouch_media'), {timeout: 30000});
        await pick('Ranger une copie dans les médias');
        const j = await (await resp).json(); assert.ok(j?.result?.media_id > 0, 'un nouveau média');
        const m = await page.evaluate(id => window.LCNDA_APP.api('tresor_media', {ids: String(id)}), j.result.media_id);
        assert.equal(m.media?.[0]?.media_type, 'image'); assert.match(m.media?.[0]?.title || '', /Arbre à colorier/);
    });
    await t('🖨 Imprimer : toujours la fenêtre « Imprimer » de l’app (À ton âge…, autrefois window.print)', async () => {
        await open('aton-age'); await page.click('[data-tr-page] .page-header [data-tr-print]');
        const fr = await (await page.waitForSelector('dialog.k-print[open] iframe', {timeout: 15000})).contentFrame();
        await fr.waitForSelector('.pg'); assert.match(await fr.content(), /À ton âge/); assert.equal(await fr.$('button'), null, 'sans les boutons');
        await page.click('dialog.k-print[open] [data-k-x]');
    });
    await t('⛔ K1 : une lettre sans date ni texte → l’erreur sous le champ, la fenêtre reste ouverte (pas de message en bas)', async () => {
        await open('lettres'); await page.click('[data-tr-page] .page-header [data-l-new]'); await page.waitForSelector('dialog[open] [name="open_at"]');
        await page.click('dialog[open] button[type="submit"]'); await page.waitForTimeout(200);
        assert.ok(await page.$('dialog[open] [name="open_at"][aria-invalid="true"]'), 'le champ de la date est marqué');
        assert.match(await page.$eval('dialog[open]', d => d.textContent), /Choisis le jour où la lettre s’ouvrira/);
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
    });
    await t('📱 390 px : réglages puis aperçu sur une seule colonne, rien ne dépasse sur le côté', async () => {
        await page.setViewportSize({width: 390, height: 844});
        try {
            for (const k of ['ciel', 'broderie', 'coloriage']) {
                await open(k);
                const r = await page.evaluate(() => { const sp = document.querySelector('[data-tr-body] .h-tr-split'), cols = sp ? getComputedStyle(sp).gridTemplateColumns.split(' ').length : 0, ws = document.querySelector('#workspace');
                    return {cols, wide: ws.getBoundingClientRect().width, over: document.documentElement.scrollWidth > window.innerWidth + 1, view: !!sp?.querySelector(':scope > .h-tr-view')}; });
                assert.equal(r.cols, 1, `${k} : une colonne`); assert.ok(r.wide > 300, `${k} : la page prend la largeur (${r.wide})`); assert.equal(r.over, false, `${k} : pas de défilement de côté`); assert.ok(r.view, `${k} : l’aperçu`);
            }
        } finally { await page.setViewportSize({width: 1400, height: 950}); }
    });
};
