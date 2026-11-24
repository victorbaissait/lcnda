'use strict';
/** 🂠 Patiences (assets/js/app-jeu-patience-regles.js) : les règles sans écran.   node tests/test-patiences.js
 *  1. chaque jeu se distribue avec toutes ses cartes (52 ou 104), et pareil pour une même donne ;
 *  2. en suivant l'aide (💡) jusqu'à 400 coups : aucun coup conseillé n'est refusé, aucune carte ne se perd ni ne se double ;
 *  3. une partie relue (JSON, comme localStorage) : « Infinity » devenu null se remet (fait par app-jeu-patience.js) ;
 *  4. les jeux qui posent les As d'avance (Westcliff, L'entrepôt, Lucas…) en posent bien 4 (ou 8) ;
 *  5. chaque jeu, 50 donnes : le bon nombre de cartes, chaque carte une seule fois, des piles bien formées ; puis quelques coups
 *     de l'aide et « Tout monter » sans erreur ; aucun jeu n'a exactement les mêmes règles qu'un autre ;
 *  6. les réglages ajoutés avec la centaine de patiences de la fin de la liste (réserves en rangée, une carte cachée sur deux,
 *     fondations de 2 en 2 ou du Roi à l'As, cartes de départ précises, ramasser sans mélanger, cases qui s'ouvrent tard…).
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
        assert.ok(f.filter(p => p.cards.length).length >= (P.norm(g).found.outN || 4), `${g.k} : ${f.map(p => p.cards.length).join(',')}`);
    }
});
/* ═════ 5. tous les jeux, beaucoup de donnes ═════ */
const play = (st, g, steps) => {
    for (let k = 0; k < steps && !st.won; k++) {
        const h = P.hint(st); if (!h) break;
        if (h.stock) { if (!P.stock(st).ok) break; }
        else if (h.set) assert.ok(P.trySet(st, h.set), `${g.k} : paire conseillée refusée`);
        else assert.ok(P.move(st, h.from, h.idx, h.to), `${g.k} : coup conseillé refusé ${JSON.stringify(h)}`);
        if (!g.mode && k % 5 === 4) P.autoAll(st);
    }
};
t(`les ${P.GAMES.length} jeux : 50 donnes chacun, cartes justes, piles bien formées, l’aide et « Tout monter » sans erreur`, () => {
    for (const g of P.GAMES) {
        assert.ok(g.k && g.name && g.desc && g.diff >= 1 && g.diff <= 5 && P.FAMILIES.some(f => f[0] === g.fam), `${g.k} : fiche incomplète`);
        for (let i = 0; i < 50; i++) {
            const st = P.deal(g.k, 'n' + i), cards = cardsOf(st), n = expected(g);
            assert.equal(P.counts(st), n, `${g.k} (n${i}) : ${P.counts(st)} cartes au lieu de ${n}`);
            assert.equal(new Set(cards.map(c => c.i)).size, cards.length, `${g.k} : cartes en double`);
            assert.ok(cards.every(c => c.r >= 1 && c.r <= 13 && c.s >= 0 && c.s <= 3), `${g.k} : carte impossible`);
            assert.equal(new Set(st.piles.map(p => p.id)).size, st.piles.length, `${g.k} : deux piles du même nom`);
            assert.ok(st.piles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), `${g.k} : pile sans place`);
            assert.ok(st.piles.filter(p => p.type === 'found').every(p => p.cards.length <= 13), `${g.k} : fondation trop haute`);
            if (!g.mode) assert.ok(st.piles.filter(p => p.type === 'tab' && p.cards.length).every(p => P.top(p).up), `${g.k} : carte du bas cachée`);
            if (i < 3) { const n0 = P.counts(st); play(st, g, 25); if (!g.mode) P.autoAll(st); assert.equal(P.counts(st), n0, `${g.k} : cartes perdues en jouant`); }
        }
    }
});
t('aucun jeu n’a exactement les mêmes règles qu’un autre', () => {
    const sig = g => JSON.stringify((({k, name, desc, diff, fam, stockLabel, ...rest}) => (g.mode ? rest : P.norm(rest)))(g)), seen = new Map();
    for (const g of P.GAMES) { const s = sig(g); assert.ok(!seen.has(s), `${g.k} a les mêmes règles que ${seen.get(s)}`); seen.set(s, g.k); }
});

/* ═════ 6. les réglages ajoutés ═════ */
let uid = 9000;
const C = (r, s, up = true) => ({r, s, up, i: uid++});
const pile = (st, id) => st.piles.find(p => p.id === id);
t('réserves en rangée et pioche sur la réserve (Agnès Bernauer, la duchesse, la porte)', () => {
    const st = P.deal('agnesbernauer', 'r1'), rs = st.piles.filter(p => p.row);
    assert.equal(rs.length, 7); assert.ok(rs.every(p => p.cards.length === 1 && p.cards[0].up)); assert.equal(pile(st, 'stock').cards.length, 16);
    assert.ok(P.stock(st).ok); assert.ok(rs.every(p => p.cards.length === 2)); assert.equal(pile(st, 'stock').cards.length, 9);
    assert.ok(P.canPick(st, 'r0', 1) && !P.canPick(st, 'r0', 0), 'seule la carte du dessus se joue');
    assert.equal(P.canDrop(st, [C(5, 0)], 'r1', 't0'), false, 'on ne pose rien sur la réserve');
    P.stock(st); P.stock(st); assert.equal(pile(st, 'stock').cards.length, 0); assert.equal(rs[0].cards.length + rs[1].cards.length, 8);
    assert.equal(P.deal('duchess', 'x').piles.filter(p => p.row).map(p => p.cards.length).join(), '3,3,3,3');
    assert.equal(P.deal('gate', 'x').piles.filter(p => p.row).map(p => p.cards.length).join(), '5,5');
});
t('une carte cachée sur deux (Le mur de pierre, Alternance)', () => {
    const st = P.deal('stonewall', 'a');
    st.piles.filter(p => p.type === 'tab').forEach(p => assert.deepEqual(p.cards.map(c => c.up), [false, true, false, true, false, true]));
    const al = P.deal('alternation', 'a'); al.piles.filter(p => p.type === 'tab').forEach(p => assert.deepEqual(p.cards.map(c => c.up), [false, true, false, true, false, true, true]));
});
t('de deux en deux (le mont Olympe) : tableau et fondations', () => {
    const st = P.deal('mountolympus', 'a'), f = st.piles.filter(p => p.type === 'found');
    assert.equal(f.length, 16); assert.equal(f.filter(p => p.cards[0]?.r === 1).length, 8); assert.equal(f.filter(p => p.cards[0]?.r === 2).length, 8);
    const t0 = pile(st, 't0'); t0.cards = [C(11, 2)];
    assert.ok(P.canDrop(st, [C(9, 2)], 't0', 't1')); assert.ok(!P.canDrop(st, [C(10, 2)], 't0', 't1')); assert.ok(!P.canDrop(st, [C(9, 3)], 't0', 't1'));
    const ace = f.find(p => p.cards[0].r === 1 && p.cards.length === 1);
    assert.ok(P.canDrop(st, [C(3, ace.cards[0].s)], ace.id, 't1')); assert.ok(!P.canDrop(st, [C(2, ace.cards[0].s)], ace.id, 't1'));
    const oe = P.deal('oddandeven', 'a'), k = oe.piles.find(p => p.type === 'found' && p.cards[0].r === 2);
    k.cards.push(C(4, k.cards[0].s), C(6, k.cards[0].s), C(8, k.cards[0].s), C(10, k.cards[0].s), C(12, k.cards[0].s));
    assert.ok(P.canDrop(oe, [C(1, k.cards[0].s)], k.id, 't0'), 'Pair et impair : après la Dame, l’As');
});
t('seulement quelques cartes posées d’avance (Bonne mesure, Pair et impair, le cotillon royal)', () => {
    const gm = P.deal('goodmeasure', 'a').piles.filter(p => p.type === 'found' && p.cards.length);
    assert.equal(gm.length, 2); assert.notEqual(gm[0].cards[0].s, gm[1].cards[0].s);
    for (const k of ['oddandeven', 'royalcotillion']) {
        const f = P.deal(k, 'b').piles.filter(p => p.type === 'found');
        assert.equal(f.length, 8); for (const r of [1, 2]) assert.deepEqual(f.filter(p => p.cards[0].r === r).map(p => p.cards[0].s).sort(), [0, 1, 2, 3], `${k} : ${r}`);
    }
    const oe = P.deal('oddandeven', 'c'); pile(oe, 't0').cards = [C(9, 0)]; assert.equal(P.canDrop(oe, [C(8, 2)], 't0', 'waste'), false, 'on ne construit pas sur ces places');
});
t('des fondations qui descendent du Roi (Bisley, la maison sur la colline)', () => {
    const st = P.deal('bisley', 'a'), up = st.piles.filter(p => p.type === 'found' && !p.down), down = st.piles.filter(p => p.down);
    assert.equal(up.length, 4); assert.equal(down.length, 4); assert.ok(up.every(p => p.cards.length === 1 && p.cards[0].r === 1)); assert.ok(down.every(p => !p.cards.length));
    assert.deepEqual(st.piles.filter(p => p.type === 'tab').map(p => p.cards.length), [3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    assert.ok(P.canDrop(st, [C(13, 1)], 'k0', 't0')); assert.ok(!P.canDrop(st, [C(12, 1)], 'k0', 't0'));
    down[0].cards.push(C(13, 1)); assert.ok(P.canDrop(st, [C(12, 1)], 'k0', 't0')); assert.ok(!P.canDrop(st, [C(12, 2)], 'k0', 't0'));
    const h = P.deal('houseonthehill', 'a'); assert.equal(h.piles.filter(p => p.type === 'found').length, 8); assert.equal(h.piles.filter(p => p.down).length, 4);
    // gagné quand tout est monté, y compris sur les fondations qui descendent
    const w = P.deal('bisley', 'w'), all = w.piles.flatMap(p => p.cards.splice(0)); const fs = w.piles.filter(p => p.type === 'found');
    for (let s = 0; s < 4; s++) { fs.find(p => p.id === 'f' + s).cards.push(...all.filter(c => c.s === s && c.r <= 6).sort((a, b) => a.r - b.r)); fs.find(p => p.id === 'k' + s).cards.push(...all.filter(c => c.s === s && c.r > 7).sort((a, b) => b.r - a.r)); pile(w, 't' + s).cards.push(all.find(c => c.s === s && c.r === 7)); }
    assert.ok(P.move(w, 't0', 0, 'f0') || P.move(w, 't0', 0, 'k0')); for (let s = 1; s < 4; s++) P.tap(w, 't' + s, 0); assert.equal(w.won, true);
});
t('des cartes de départ précises (le cadran du grand-père) et la valeur de départ partout (le pingouin)', () => {
    const st = P.deal('grandfathersclock', 'a'), f = st.piles.filter(p => p.type === 'found');
    assert.deepEqual(f.map(p => [p.cards[0].r, p.cards[0].s]), P.get('grandfathersclock').found.cards); assert.ok(f.every(p => p.cards.length === 1));
    assert.ok(P.canDrop(st, [C(3, 0)], 'f0', 't0')); assert.ok(P.canDrop(st, [C(1, 3)], 'f11', 't0'), 'le Roi passe à l’As');
    assert.ok(new Set(f.map(p => p.y)).size === 2, 'sur deux rangées');
    const pg = P.deal('penguin', 'a'), pf = pg.piles.filter(p => p.type === 'found');
    assert.ok(pf.every(p => p.cards.length === 1 && p.cards[0].r === pg.base)); assert.equal(pg.piles.filter(p => p.type === 'tab').reduce((a, p) => a + p.cards.length, 0), 48);
    pile(pg, 't6').cards = []; const below = pg.base === 1 ? 13 : pg.base - 1;
    assert.ok(P.canDrop(pg, [C(below, 0)], 't6', 'c0'), 'une colonne vide prend la carte juste sous la valeur de départ'); assert.ok(!P.canDrop(pg, [C(below === 13 ? 12 : below + 1, 0)], 't6', 'c0'));
});
t('au fond des colonnes (FreeCell défi) et monter pendant la distribution (la citadelle)', () => {
    for (let i = 0; i < 10; i++) { const st = P.deal('challengefc', 'c' + i); assert.deepEqual(st.piles.filter(p => p.type === 'tab').map(p => p.cards[0].r).sort(), [1, 1, 1, 1, 2, 2, 2, 2]); }
    for (let i = 0; i < 20; i++) {
        const st = P.deal('citadel', 'c' + i), f = st.piles.filter(p => p.type === 'found');
        assert.equal(P.counts(st), 52); f.forEach(p => p.cards.forEach((c, j) => assert.ok(c.s === p.cards[0].s && c.r === j + 1)));
    }
    assert.ok([...Array(20)].some((_, i) => P.deal('citadel', 'c' + i).piles.some(p => p.type === 'found' && p.cards.length > 1)), 'des cartes montent pendant la distribution');
});
t('jamais plus de 3 cartes (Shamrocks), monter ou descendre (anyud), suites d’une même teinte (la tarentule)', () => {
    const st = P.deal('shamrocks', 'a'), full = st.piles.find(p => p.type === 'tab' && p.cards.length === 3), one = st.piles.find(p => p.type === 'tab' && p.cards.length === 1);
    const c = P.top(full); assert.equal(P.canDrop(st, [C(c.r > 1 ? c.r - 1 : 2, 2)], full.id, one.id), false);
    pile(st, 't17').cards = [C(7, 0)]; assert.ok(P.canDrop(st, [C(8, 2)], 't17', 't0')); assert.ok(P.canDrop(st, [C(6, 3)], 't17', 't0')); assert.ok(!P.canDrop(st, [C(9, 3)], 't17', 't0'));
    const ta = P.deal('tarantula', 'a'), t0 = pile(ta, 't0'); t0.cards = [C(9, 0), C(8, 1), C(7, 0)];
    assert.ok(P.canPick(ta, 't0', 0), 'cœur, carreau, cœur : même teinte'); t0.cards = [C(9, 0), C(8, 2)]; assert.ok(!P.canPick(ta, 't0', 0));
});
t('ramasser sans mélanger, par 4 (la cruelle, la persévérance)', () => {
    const st = P.deal('cruel', 'a'), tabs = st.piles.filter(p => p.type === 'tab'), before = tabs.flatMap(p => p.cards.map(c => c.i));
    assert.ok(P.stock(st).ok); assert.deepEqual(tabs.flatMap(p => p.cards.map(c => c.i)), before, 'même ordre'); assert.ok(tabs.every(p => p.cards.length === 4));
    tabs[0].cards.splice(1, 3); assert.ok(P.stock(st).ok); assert.deepEqual(tabs.map(p => p.cards.length), [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1]);
    assert.equal(st.redeals, Infinity); const pe = P.deal('perseverance', 'a'); P.stock(pe); P.stock(pe); assert.equal(P.stock(pe).ok, false);
});
t('la pioche saute les colonnes vides (Motif de divorce) ; la case de Miss Milligan s’ouvre quand la pioche est vide', () => {
    const st = P.deal('groundsdivorce', 'a'); pile(st, 't3').cards = []; const n = P.counts(st);
    P.stock(st); assert.equal(pile(st, 't3').cards.length, 0); assert.ok(st.piles.filter(p => p.type === 'tab' && p.id !== 't3').every(p => p.cards.length === 6)); assert.equal(P.counts(st), n);
    const mm = P.deal('missmilligan', 'a'); assert.equal(P.canDrop(mm, [C(5, 0)], 'c1', 't0'), false);
    pile(mm, 'stock').cards = []; assert.ok(P.canDrop(mm, [C(5, 0)], 'c1', 't0'));
});
t('les jeux à part : Golf double, trois sommets stricts, As en haut à 5, la baronne', () => {
    const dg = P.deal('doublegolf', 'a'); assert.equal(dg.piles.filter(p => p.type === 'tab').length, 9); assert.ok(dg.piles.filter(p => p.type === 'tab').every(p => p.cards.length === 7)); assert.equal(P.counts(dg), 104);
    const tp = P.deal('tripeaksstrict', 'a'), w = pile(tp, 'waste'); w.cards.push(C(13, 0)); const free = tp.piles.find(p => p.type === 'slot' && p.cards[0].up);
    free.cards[0] = C(1, 1); assert.equal(P.canDrop(tp, free.cards, 'waste', free.id), false, 'l’As ne suit pas le Roi');
    const tp2 = P.deal('tripeaks', 'a'); pile(tp2, 'waste').cards.push(C(13, 0)); const f2 = tp2.piles.find(p => p.type === 'slot' && p.cards[0].up); f2.cards[0] = C(1, 1); assert.ok(P.canDrop(tp2, f2.cards, 'waste', f2.id));
    const au = P.deal('acesup5', 'a'); assert.equal(au.piles.filter(p => p.type === 'tab').length, 5); assert.ok(au.piles.filter(p => p.type === 'tab').every(p => p.cards.length === 1));
    au.piles.filter(p => p.type === 'tab').forEach((p, i) => { p.cards = i < 4 ? [C(1, i)] : []; }); pile(au, 'stock').cards = []; P.move(au, 't0', 0, 't4'); assert.equal(au.won, true);
    const b = P.deal('baroness', 'a'); assert.equal(b.piles.filter(p => p.type === 'slot').length, 5); assert.ok(P.stock(b).ok); assert.ok(b.piles.filter(p => p.type === 'slot').every(p => p.cards.length === 2)); assert.equal(P.counts(b), 52);
    const sl = b.piles.filter(p => p.type === 'slot'); sl[0].cards.push(C(13, 0)); const n = P.counts(b); assert.ok(P.trySet(b, [sl[0].id])); assert.equal(sl[0].cards.length, 2, 'pas de remplissage'); assert.equal(P.counts(b), n);
});
t('les jeux à part : Sir Tommy, le chat dans le coin, la stratégie', () => {
    for (const k of ['sirtommy', 'pussinthecorner', 'strategy', 'calculation']) assert.ok(P.hint(P.deal(k, 'a')), `${k} : l’aide propose toujours un coup au départ`);
    const st = P.deal('sirtommy', 'a'); assert.ok(st.piles.filter(p => p.type === 'found').every(p => !p.cards.length));
    pile(st, 'waste').cards = [C(1, 2)]; assert.ok(P.move(st, 'waste', 0, 'f0')); pile(st, 'waste').cards = [C(2, 0)]; assert.ok(P.move(st, 'waste', 0, 'f0'), 'sans s’occuper des couleurs');
    const pc = P.deal('pussinthecorner', 'a'), f0 = pile(pc, 'f0'); assert.equal(f0.cards[0].r, 1);
    assert.ok(P.canDrop(pc, [C(2, f0.cards[0].s === 0 ? 1 : 0)], 'f0', 'waste')); assert.ok(!P.canDrop(pc, [C(2, 2)], 'f0', 'waste'));
    pile(pc, 'stock').cards = []; pile(pc, 'waste').cards = []; const n = P.counts(pc); pile(pc, 't0').cards.push(C(9, 9 % 4)); assert.ok(P.stock(pc).ok, 'ramasser'); assert.equal(P.stock(pc).ok, true); assert.equal(pc.redeals, 0); assert.equal(P.counts(pc), n + 1);
    const sg = P.deal('strategy', 'a'); assert.equal(sg.piles.filter(p => p.type === 'tab').length, 8); pile(sg, 'f0').cards = [C(1, 0)];
    assert.ok(!P.canDrop(sg, [C(2, 0)], 'f0', 't0'), 'tant que la pioche n’est pas vide, seuls les As montent'); pile(sg, 'stock').cards = []; assert.ok(P.canDrop(sg, [C(2, 0)], 'f0', 't0')); assert.ok(!P.canDrop(sg, [C(2, 1)], 'f0', 't0'));
});
t('les jeux à part : Gizeh, Toutânkhamon, les lunes, le voisin, Isabelle, Quatorze en colonnes', () => {
    const gz = P.deal('giza', 'a'); assert.equal(gz.piles.filter(p => p.type === 'slot').length, 52); assert.ok(!gz.piles.some(p => p.type === 'stock')); assert.equal(P.stock(gz).ok, false);
    const kt = P.deal('kingtut', 'a'); P.stock(kt); assert.equal(pile(kt, 'waste').cards.length, 3);
    for (const k of ['bluemoon', 'redmoon']) {
        const st = P.deal(k, 'a'), slots = st.piles.filter(p => p.type === 'slot'); assert.equal(slots.length, 56); assert.equal(slots.filter(p => !p.cards.length).length, 4); assert.equal(P.counts(st), 52);
        for (let r = 0; r < 4; r++) assert.equal(pile(st, `m${r}_0`).cards[0].r, 1, `${k} : As en début de rangée`);
        if (k === 'redmoon') for (let r = 0; r < 4; r++) assert.equal(pile(st, `m${r}_13`).cards.length, 0);
        assert.ok(P.legalMoves(st).every(m => { const c = pile(st, m.from).cards[0], [r, col] = m.to.slice(1).split('_').map(Number), left = pile(st, `m${r}_${col - 1}`).cards[0]; return col > 0 && c.r === left.r + 1 && c.s === left.s; }));
        assert.ok(P.stock(st).ok); assert.equal(P.counts(st), 52); assert.equal(st.piles.filter(p => p.type === 'slot' && !p.cards.length).length, 4);
    }
    const nb = P.deal('neighbour', 'a'); assert.ok(P.legalMoves(nb).every(m => m.set.length === 1 ? pile(nb, m.set[0]).cards[0].r === 13 : m.set.reduce((a, id) => a + pile(nb, id).cards[0].r, 0) === 13));
    const is = P.deal('isabel', 'a'), cols = is.piles.filter(p => p.type === 'tab'); assert.equal(cols.length, 13); assert.ok(cols.every(p => p.cards.length === 4 && p.cards.filter(c => c.up).length === 1));
    const m = P.legalMoves(is)[0]; if (m) { assert.ok(P.trySet(is, m.set)); m.set.forEach(id => assert.ok(P.top(pile(is, id)).up, 'la carte suivante se retourne')); }
    const fo = P.deal('fourteenout', 'a'); assert.deepEqual(fo.piles.filter(p => p.type === 'tab').map(p => p.cards.length), [5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4]);
    assert.ok(P.legalMoves(fo).every(x => x.set.reduce((a, id) => a + P.top(pile(fo, id)).r, 0) === 14));
});
console.log(`${failed ? '✗' : '✓'} patiences : ${count} vérifications${failed ? `, ${failed} en échec` : ''}`);
process.exit(failed ? 1 : 0);
