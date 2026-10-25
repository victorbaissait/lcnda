'use strict';
/** Les essais de la relecture (failles corrigées) : lettre scellée, fiches confidentielles dans le partage, injection dans le fichier partagé — appelés par tests/test-tresors.js */
module.exports = async (t, {page}, assert) => {
    await t('🔒 une lettre scellée ne s’ouvre pas avant l’heure : ni date avancée, ni sorte changée ; ses pièces jointes restent', async () => {
        const r = await page.evaluate(async () => { const T = window.LCNDA_EXT.tresors.T;
            const {id} = await T.save({kind: 'letter', title: 'Secret', body: 'LE CONTENU', open_at: '2045-05-05', data: {to: 'Léa', media: [7, 8], age: 18, when: 'date'}});
            await T.save({id, kind: 'letter', title: 'Secret', body: '', open_at: '2001-01-01', data: {to: 'Léa', media: []}}); // tenter de l'ouvrir en avançant la date
            await T.save({id, kind: 'sense', title: 'Secret', body: '', data: {}}); // tenter de changer sa sorte
            const l = (await T.items('letter')).find(x => x.id === id), s = (await T.items('sense')).find(x => x.id === id);
            await T.save({id, kind: 'letter', title: 'Secret', body: '', open_at: '2050-01-01', data: {to: 'Léa'}}); // la repousser : permis
            const l2 = (await T.items('letter')).find(x => x.id === id); return {sealed: l?.sealed, body: l?.body, open: l?.open_at, asSense: !!s, open2: l2?.open_at}; });
        assert.equal(r.sealed, true); assert.equal(r.body, ''); assert.equal(r.open, '2045-05-05'); assert.equal(r.asSense, false); assert.equal(r.open2, '2050-01-01');
    });
    await t('🔗 le partage : ni fiche confidentielle, ni phrase qui nomme une personne retirée ; pas d’injection dans le fichier', async () => {
        const r = await page.evaluate(() => { const {T} = window.LCNDA_EXT.tresors, S = window.LCNDA_EXT.tresorShare;
            return T.tree(true).then(tr0 => {
                const tr = {...tr0, people: tr0.people.map(p => ({...p})), byId: new Map()}; tr.people.forEach(p => tr.byId.set(p.id, p));
                const id = n => tr.people.find(p => T.name(p) === n).id; tr.byId.get(id('Marie DURAND')).priv = true; // Marie : fiche confidentielle
                const d = S.branchData(T, tr, id('Léa MARTIN'), 'asc', 6), names = d.people.map(p => p.n), all = JSON.stringify(d.people);
                const html = S.shareHtml('x', Date.now() + 1e7, {exp: Date.now() + 1e7, people: [{id: 1, n: '</script><script>window.__pwn=1</script>', l: '', o: '', s: [], par: [], kids: []}]}, false);
                return {hasMarie: names.includes('Marie DURAND'), mentions: all.includes('Marie DURAND'), antoine: names.includes('Antoine MARTIN'), breaks: html.split('</script>').length - 1};
            }); });
        assert.equal(r.hasMarie, false); assert.equal(r.mentions, false, 'aucune phrase ne la nomme (« a épousé Marie DURAND »)'); assert.equal(r.antoine, true);
        assert.equal(r.breaks, 1, 'une seule fin de script : le nom piégé ne sort pas du script');
    });
};
