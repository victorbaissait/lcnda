'use strict';
/** 🥘 🎶 👃 Recettes, chansons et souvenirs des sens rangés dans la Mémoire familiale (une seule liste) — appelé par tests/test-tresors.js */
module.exports = async (t, {page}, assert) => {
    await t('🥘 fusion : un ancien élément des Trésors passe dans la Mémoire familiale, sans rien perdre ; modifié là-bas, la page des Trésors suit', async () => {
        const r = await page.evaluate(async () => { const {T} = window.LCNDA_EXT.tresors, A = window.LCNDA_APP, tr = await T.tree(true), rose = tr.people.find(p => T.name(p) === 'Marie DURAND');
            await T.save({kind: 'recipe', title: 'La soupe aux choux', body: 'Tout mettre dans la marmite.', data: {from: String(rose.id), dish: 'entree', serves: 'pour 8', ingredients: '1 chou\n2 carottes', story: 'Le dimanche soir.'}});
            const a = (await T.api('tresor_memories', {kind: 'recipe'})).items.find(x => x.title === 'La soupe aux choux');
            const left = (await T.items('recipe')).length; // plus rien dans les Trésors
            const fm = (await A.api('family_memories', {kind: 'recipe'})).memories.find(m => m.title === 'La soupe aux choux');
            // modifiée dans la Mémoire familiale : le texte complet devient la préparation
            await A.api('save_family_memory', {}, {method: 'POST', body: {id: fm.id, kind: 'recipe', title: 'La soupe aux choux', content: 'Recette réécrite à la main.', origin_text: fm.origin_text, notes: fm.notes}});
            const b = (await T.api('tresor_memories', {kind: 'recipe'})).items.find(x => x.title === 'La soupe aux choux');
            return {a, left, fm: {kind: fm.kind, label: fm.kind_label, content: fm.content, origin: fm.origin_text, notes: fm.notes, people: fm.people.map(p => p.person.id)}, rose: rose.id, b}; });
        assert.match(String(r.a.id), /^m\d+$/); assert.equal(r.a.data.ingredients, '1 chou\n2 carottes'); assert.equal(r.a.body, 'Tout mettre dans la marmite.'); assert.equal(r.a.data.dish, 'entree');
        assert.equal(r.left, 0, 'plus de recette dans les Trésors : un seul endroit');
        assert.equal(r.fm.label, 'Recette'); assert.match(r.fm.content, /Ingrédients :\n1 chou\n2 carottes\n\nPréparation :\nTout mettre/); assert.match(r.fm.origin, /pour 8/); assert.equal(r.fm.notes, 'Le dimanche soir.'); assert.deepEqual(r.fm.people, [r.rose]);
        assert.equal(r.b.body, 'Recette réécrite à la main.'); assert.ok(!r.b.data.ingredients, 'les anciens ingrédients ne doublent pas le texte réécrit');
    });
    await t('👃 la page des Trésors enregistre dans la Mémoire familiale (sorte « Souvenir des sens ») ; supprimer marche ; le bloc de la fiche les montre', async () => {
        await page.evaluate(() => window.LCNDA_EXT.tresors.open('sens')); await page.waitForSelector('[data-tr-page="sens"] [data-c-new]');
        await page.click('[data-tr-page="sens"] [data-c-new]'); await page.waitForSelector('dialog[open] [name="title"]');
        await page.fill('dialog[open] [name="title"]', 'Le bruit du moulin'); await page.fill('dialog[open] [name="place"]', 'Naves');
        await page.click('dialog[open] [type=submit]'); await page.waitForFunction(() => /Le bruit du moulin/.test(document.querySelector('[data-c-list]')?.innerText || ''));
        const kinds = await page.evaluate(async () => (await window.LCNDA_APP.api('family_memories', {kind: 'sense'})).memories.map(m => [m.title, m.kind_label, m.origin_text]));
        assert.deepEqual(kinds.find(k => k[0] === 'Le bruit du moulin'), ['Le bruit du moulin', 'Souvenir des sens', 'Naves']);
        assert.ok(await page.$('[data-c-memlist]'), 'lien vers Listes › Mémoire familiale');
        page.once('dialog', d => d.accept());
        const id = await page.$eval('[data-c-list] article', a => a.dataset.cId); assert.match(id, /^m\d+$/);
        await page.click(`[data-c-del="${id}"]`); await page.click('dialog[open] .modal-actions button:not(.secondary)').catch(() => {});
        await page.waitForFunction(() => !/Le bruit du moulin/.test(document.querySelector('[data-c-list]')?.innerText || ''), null, {timeout: 8000});
    });
};
