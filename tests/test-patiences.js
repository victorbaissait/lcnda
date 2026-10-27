'use strict';
/** 🂠 Patiences (assets/js/app-jeu-patience-regles.js) : les règles sans écran.   node tests/test-patiences.js
 *  1. chaque jeu se distribue avec toutes ses cartes (52 ou 104), et pareil pour une même donne ;
 *  2. en suivant l'aide (💡) jusqu'à 400 coups : aucun coup conseillé n'est refusé, aucune carte ne se perd ni ne se double ;
 *  3. une partie relue (JSON, comme localStorage) : « Infinity » devenu null se remet (fait par app-jeu-patience.js) ;
 *  4. les jeux qui posent les As d'avance (Westcliff, L'entrepôt, Lucas…) en posent bien 4 (ou 8).
 */
const assert = require('node:assert/strict');
global.window = globalThis;
require('../assets/js/app-jeu-patience-regles.js');
const P = globalThis.LCNDA_PATIENCES;
let failed = 0, count = 0;
const t = (name, fn) => { try { fn(); count++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const cardsOf = st => st.piles.flatMap(p => p.cards).concat(st.hand ? [st.hand] : []);
const expected = g => 52 * (P.norm(g).decks || 1);

t(`les ${P.GAMES.length} jeux se distribuent avec toutes leurs cartes, et une donne se rejoue pareil`, () => {
    for (const g of P.GAMES) for (const seed of ['a', 'b', 'c']) {
        const st = P.deal(g.k, seed);
        assert.equal(P.counts(st), expected(g), `${g.k} (${seed})`);
        assert.equal(new Set(cardsOf(st).map(c => c.i)).size, cardsOf(st).length, `${g.k} : cartes en double`);
        assert.equal(JSON.stringify(P.deal(g.k, seed)), JSON.stringify(st), `${g.k} : même donne`);
    }
});
t('en suivant l’aide : aucun coup conseillé refusé, aucune carte perdue ni doublée', () => {
    let won = 0;
    for (const g of P.GAMES) for (const seed of ['a', 'b']) {
        const st = P.deal(g.k, seed), n0 = P.counts(st);
        for (let k = 0; k < 400 && !st.won; k++) {
            const h = P.hint(st); if (!h) break;
            if (h.stock) { const r = P.stock(st); if (!r.ok) break; }
            else if (h.set) assert.ok(P.trySet(st, h.set), `${g.k} : paire conseillée refusée`);
            else assert.ok(P.move(st, h.from, h.idx, h.to), `${g.k} : coup conseillé refusé ${JSON.stringify(h)}`);
            assert.equal(P.counts(st), n0, `${g.k} : nombre de cartes après le coup ${k}`);
        }
        if (st.won) won++;
    }
    console.log(`  (${won} parties gagnées rien qu’en suivant l’aide)`);
});
t('une partie relue (JSON) garde ses règles de pioche', () => {
    const st = JSON.parse(JSON.stringify(P.deal('klondike1', 'x')));
    assert.equal(st.redeals, null, 'JSON écrit Infinity comme null : app-jeu-patience.js le remet');
    st.redeals = Infinity;
    for (let k = 0; k < 30; k++) P.stock(st);
    assert.ok(P.stock(st).ok, 'la pioche repasse toujours');
});
t('les As posés d’avance sont tous sur les fondations', () => {
    for (const g of P.GAMES.filter(x => P.norm(x).found.out?.length)) {
        const st = P.deal(g.k, 'z'), f = st.piles.filter(p => p.type === 'found');
        assert.ok(f.filter(p => p.cards.length).length >= 4, `${g.k} : ${f.map(p => p.cards.length).join(',')}`);
    }
});
console.log(`${failed ? '✗' : '✓'} patiences : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`);
process.exit(failed ? 1 : 0);
