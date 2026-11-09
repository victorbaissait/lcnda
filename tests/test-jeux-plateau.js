'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test des 4 jeux de plateau de la page Jeu : ♟ Échecs, ⛀ Dames, 🁫 Dominos, 🎲 Yams.
 *     node tests/test-jeux-plateau.js          (SHOTS=dossier pour garder des captures)
 * 1. Les moteurs sans écran (require) : comptes « perft » de référence (échecs et dames), roque interdit sous échec ou à travers
 *    une case attaquée, prise en passant, promotion au choix, mat, pat, nulles (répétition, 50 coups, matériel), notation ;
 *    dames : prise majoritaire, prise arrière, dame volante, pion qui passe sur la dernière ligne sans devenir dame, blocage ;
 *    dominos : 28 dominos, premier double, pioche, partie bloquée, comptage ; Yams : toutes les cases, prime à 63, joker ;
 *    ordinateurs : ils jouent des coups légaux, l'IA des échecs répond en moins de 2 s, les niveaux se classent.
 * 2. Le navigateur, sur une petite généalogie servie par un vrai « php -S » : une partie de chaque, ↶, ⏸ (Échap), « ? »,
 *    clavier, ordinateur qui répond, aucun POST, 390 px et sombre sans débordement, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const L = require('../assets/js/app-jeu-famille-logique.js');
const E = require('../assets/js/app-jeu-echecs-moteur.js');
const D = require('../assets/js/app-jeu-dames-moteur.js');
const M = require('../assets/js/app-jeu-dominos-moteur.js');
const Y = require('../assets/js/app-jeu-yams-moteur.js');

let failures = 0;
const ok = msg => console.log('  ✓ ' + msg);
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { failures++; console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e).toString().split('\n').slice(0, 6).join('\n    ')); } }

(async () => {
    console.log('♟ Échecs (moteur)');
    await t('perft de référence : départ (20, 400, 8 902, 197 281), « Kiwipete », fins de partie, promotions', () => {
        const s = E.fromFEN();
        assert.deepEqual([1, 2, 3, 4].map(d => E.perft(s, d)), [20, 400, 8902, 197281]);
        assert.equal(E.toFEN(s), E.START, 'la position est rendue intacte');
        assert.equal(E.perft(E.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 3), 97862);
        assert.equal(E.perft(E.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 5), 674624);
        assert.equal(E.perft(E.fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 4), 422333);
        assert.equal(E.perft(E.fromFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'), 3), 62379);
    });
    await t('roque : interdit sous échec, à travers une case attaquée, après que le roi a bougé ; permis sinon', () => {
        const castles = fen => E.legal(E.fromFEN(fen)).filter(m => m.flag === 'K' || m.flag === 'Q').map(m => m.flag).sort().join('');
        assert.equal(castles('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'KQ');
        assert.equal(castles('r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1'), '', 'roi en échec : pas de roque');
        assert.equal(castles('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1'), 'Q', 'f1 attaquée : pas de petit roque');
        assert.equal(castles('r3k2r/8/8/8/8/8/2r5/R3K2R w KQkq - 0 1'), 'K', 'c1 attaquée : pas de grand roque');
        assert.equal(castles('r3k2r/8/8/8/8/8/1r6/R3K2R w KQkq - 0 1'), 'KQ', 'b1 attaquée seulement (la tour y passe) : le grand roque reste permis');
        assert.equal(castles('r3k2r/8/8/8/8/8/8/R3K2R w Kkq - 0 1'), 'K', 'droit perdu');
        const s = E.replay(['e1f1', 'e8d8', 'f1e1', 'd8e8'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').s;
        assert.equal(E.legal(s).filter(m => m.flag).length, 0, 'le roi a bougé : plus de roque');
        const r = E.replay(['e1g1'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
        assert.equal(r.s.b[E.sqIndex('f1')], 'R'); assert.equal(r.s.b[E.sqIndex('g1')], 'K'); assert.equal(r.sans[0], 'O-O');
    });
    await t('prise en passant : seulement juste après le double pas ; le pion pris disparaît', () => {
        const r = E.replay(['e2e4', 'a7a6', 'e4e5', 'd7d5']);
        const ep = E.legal(r.s).find(m => m.flag === 'ep'); assert.ok(ep); assert.equal(E.uci(ep), 'e5d6');
        E.play(r.s, 'e5d6'); assert.equal(r.s.b[E.sqIndex('d5')], ''); assert.equal(r.s.b[E.sqIndex('d6')], 'P');
        const late = E.replay(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'h2h3', 'h7h6']); assert.ok(!E.legal(late.s).some(m => m.flag === 'ep'), 'trop tard');
    });
    await t('promotion au choix (dame, tour, fou, cavalier) et notation « a8=D+ »', () => {
        const s = E.fromFEN('7k/P7/8/8/8/8/8/K7 w - - 0 1'), ms = E.legal(s).filter(m => E.uci(m).startsWith('a7a8'));
        assert.deepEqual(ms.map(m => m.promo).sort(), ['b', 'n', 'q', 'r']);
        assert.equal(E.san(s, ms.find(m => m.promo === 'q')), 'a8=D+'); assert.equal(E.san(s, ms.find(m => m.promo === 'n')), 'a8=C');
        E.play(s, 'a7a8n'); assert.equal(s.b[0], 'N');
    });
    await t('mat du berger (« Dh4# »), pat, triple répétition, 50 coups, matériel insuffisant', () => {
        const fool = E.replay(['f2f3', 'e7e5', 'g2g4', 'd8h4']); assert.equal(fool.sans.at(-1), 'Dh4#');
        assert.deepEqual([E.status(fool.s).reason, E.status(fool.s).result], ['mat', '0-1']);
        const pat = E.status(E.fromFEN('k7/8/1Q6/8/8/8/8/7K b - - 0 1')); assert.deepEqual([pat.over, pat.reason, pat.result], [true, 'pat', '1/2-1/2']);
        const rep = E.replay(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1']); assert.equal(E.status(rep.s).over, false);
        E.play(rep.s, 'f6g8'); assert.equal(E.status(rep.s).reason, 'repetition');
        const fifty = E.fromFEN('k7/8/8/8/8/8/8/K6R w - - 99 80'); E.play(fifty, 'h1h2'); assert.equal(E.status(fifty).reason, 'cinquante');
        assert.equal(E.status(E.fromFEN('k7/8/8/8/8/8/8/K6B w - - 0 1')).reason, 'materiel');
        assert.equal(E.status(E.fromFEN('k7/8/8/8/8/8/8/K5NN w - - 0 1')).over, false, 'deux cavaliers : on joue encore');
        assert.equal(E.status(E.fromFEN('k1b5/8/8/8/8/8/8/K6B w - - 0 1')).reason, 'materiel', 'fous de même couleur');
        assert.equal(E.status(E.fromFEN('kb6/8/8/8/8/8/8/K6B w - - 0 1')).over, false, 'fous de couleurs différentes');
    });
    await t('notation : lever l’ambiguïté (« Cbd2 », « T1a2 »), prises de pion (« exd5 »), roques', () => {
        const s = E.fromFEN('k7/8/8/8/8/8/8/KN3N2 w - - 0 1'); assert.equal(E.san(s, E.findMove(s, 'b1d2')), 'Cbd2');
        const s2 = E.fromFEN('7k/8/8/8/8/R7/8/R5K1 w - - 0 1'); assert.equal(E.san(s2, E.findMove(s2, 'a1a2')), 'T1a2');
        assert.deepEqual(E.replay(['e2e4', 'd7d5', 'e4d5']).sans, ['e4', 'd5', 'exd5']);
        assert.equal(E.san(E.fromFEN('k7/8/8/8/8/8/8/K6N w - - 0 1'), E.findMove(E.fromFEN('k7/8/8/8/8/8/8/K6N w - - 0 1'), 'h1g3'), 'en'), 'Ng3');
    });
    await t('l’ordinateur : mat en un trouvé, coups légaux, le niveau difficile répond en moins de 2 s', () => {
        assert.equal(E.uci(E.bestMove(E.fromFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), {level: 'moyen'}).move), 'a1a8');
        for (const fen of [E.START, 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1']) {
            const s = E.fromFEN(fen), t0 = Date.now(), r = E.bestMove(s, {level: 'difficile'}), ms = Date.now() - t0;
            assert.ok(ms < 2000, `${ms} ms`); assert.ok(E.legal(s).some(m => E.uci(m) === E.uci(r.move))); assert.equal(E.toFEN(s), fen, 'position rendue intacte');
        }
        // le niveau difficile prend une dame offerte
        assert.equal(E.uci(E.bestMove(E.fromFEN('k7/8/8/3q4/8/8/8/K2R4 w - - 0 1'), {level: 'difficile'}).move), 'd1d5');
        // une partie entière ordinateur contre ordinateur : toujours légale, finit par un résultat
        const s = E.fromFEN(); let n = 0, st;
        while (!(st = E.status(s)).over && n < 160) { const m = E.bestMove(s, {level: 'facile', ms: 40, rand: L.rng('p' + n)}).move; assert.ok(E.play(s, m)); n++; }
        assert.ok(st.over || n === 160);
    });

    console.log('⛀ Dames (moteur)');
    const put = (v, list, turn = 0) => { const s = D.create(v); s.b.fill(0); list.forEach(([i, x]) => { s.b[i] = x; }); s.turn = turn; s.keys = [D.key(s)]; return s; };
    await t('perft de référence : internationales (9, 81, 658, 4 265, 27 117) et anglaises (7, 49, 302, 1 469, 7 361)', () => {
        const perft = (s, d) => (d ? D.legal(s).reduce((n, m) => n + perft(D.apply(D.clone(s), m), d - 1), 0) : 1);
        assert.deepEqual([1, 2, 3, 4, 5].map(d => perft(D.create('internationales'), d)), [9, 81, 658, 4265, 27117]);
        assert.deepEqual([1, 2, 3, 4, 5].map(d => perft(D.create('anglaises'), d)), [7, 49, 302, 1469, 7361]);
        const s = D.create(); assert.equal(s.b.filter(x => x === 1).length, 20); assert.equal(s.b.filter(x => x === -1).length, 20);
        assert.equal(D.num(s, 1), 1); assert.equal(D.num(s, 99 - 1), 50); assert.equal(D.fromNum(s, 32), 63);
    });
    await t('prise obligatoire et majoritaire (internationales) ; libre choix de la prise (anglaises)', () => {
        const s = put('internationales', [[61, 1], [52, -1], [34, -1], [87, 1], [78, -1]]), ms = D.legal(s);
        assert.equal(ms.length, 1, 'seule la rafle de 2 pièces'); assert.deepEqual([ms[0].from, ms[0].to, ms[0].caps.length], [61, 25, 2]);
        assert.equal(D.notation(s, ms[0]), '31x13');
        const a = put('anglaises', [[49, 1], [42, -1], [28, -1], [40, 1], [33, -1]]), am = D.legal(a);
        assert.equal(am.length, 2, 'les deux prises'); assert.deepEqual(am.map(m => m.caps.length).sort(), [1, 2]); assert.ok(!am.some(m => !m.caps.length), 'pas de simple déplacement');
    });
    await t('prise en arrière des pions (internationales oui, anglaises non) ; dame volante ; pièce prise jamais sautée deux fois', () => {
        assert.equal(D.legal(put('internationales', [[54, 1], [65, -1]])).filter(m => m.caps.length).length, 1);
        const a = D.legal(put('anglaises', [[35, 1], [44, -1]])); assert.ok(a.every(m => !m.caps.length), 'pas de prise en arrière');
        const k = D.legal(put('internationales', [[90, 2], [63, -1]])); assert.equal(k.length, 6); assert.ok(k.every(m => m.caps[0] === 63));
        assert.deepEqual(k.map(m => m.to).sort((x, y) => x - y), [9, 18, 27, 36, 45, 54]);
        const free = D.legal(put('internationales', [[90, 2]])); assert.equal(free.length, 9, 'la dame glisse loin');
        const ak = D.legal(put('anglaises', [[56, 2]])); assert.equal(ak.length, 1, 'dame anglaise : un pas');
        // une rafle en carré qui revient sur sa case de départ : 4 pièces prises, aucune deux fois
        const loop = put('internationales', [[63, 1], [54, -1], [34, -1], [32, -1], [52, -1]]), ring = D.legal(loop);
        assert.equal(ring.length, 1, 'le carré dans un sens ou dans l’autre : le même coup'); ring.forEach(m => { assert.equal(m.caps.length, 4); assert.equal(new Set(m.caps).size, 4); assert.equal(m.to, 63); });
        D.apply(loop, ring[0]); assert.equal(loop.b[63], 1); assert.equal(loop.b.filter(x => x < 0).length, 0);
    });
    await t('un pion qui passe sur la dernière ligne pendant une rafle reste pion ; en anglaises il s’arrête et devient dame', () => {
        const ms = D.legal(put('internationales', [[21, 1], [12, -1], [14, -1]]));
        assert.equal(ms.length, 1); assert.deepEqual([ms[0].to, ms[0].caps.length, ms[0].promote], [25, 2, false]);
        const st = D.apply(put('internationales', [[21, 1], [12, -1], [14, -1]]), ms[0]); assert.equal(st.b[25], 1);
        const end = D.legal(put('internationales', [[12, 1]])).find(m => m.to === 3); assert.equal(end.promote, true);
        const a = D.legal(put('anglaises', [[17, 1], [10, -1], [12, -1]])); assert.equal(a.length, 1); assert.deepEqual([a[0].to, a[0].caps.length, a[0].promote], [3, 1, true]);
    });
    await t('perdu sans coup possible, nulle par répétition', () => {
        const st = D.status(put('internationales', [[90, 1], [81, -1], [72, -1]])); assert.deepEqual([st.over, st.winner, st.reason], [true, 1, 'bloque']);
        assert.equal(D.status(put('internationales', [[5, -1]])).reason, 'plus');
        const s = put('internationales', [[90, 2], [1, -2]]), go = (a, b) => { const m = D.legal(s).find(x => x.from === a && x.to === b); assert.ok(m); D.apply(s, m); };
        go(90, 81); go(1, 12); go(81, 90); go(12, 1); go(90, 81); go(1, 12); go(81, 90); assert.equal(D.status(s).over, false); go(12, 1);
        assert.equal(D.status(s).reason, 'repetition');
    });
    await t('l’ordinateur : coups légaux, prend ce qui est offert, partie entière jusqu’au bout', () => {
        const s = put('internationales', [[61, 1], [52, -1], [5, -1]]); assert.equal(D.bestMove(s, {level: 'moyen'}).move.caps.length, 1);
        for (const v of ['internationales', 'anglaises']) {
            const g = D.create(v); let n = 0, st;
            while (!(st = D.status(g)).over && n < 300) { const r = D.bestMove(g, {level: n % 2 ? 'moyen' : 'facile', ms: 60, rand: L.rng('d' + n)}); assert.ok(D.legal(g).some(m => D.moveId(m) === D.moveId(r.move))); D.apply(g, r.move); n++; }
            assert.ok(st.over || n === 300, v);
        }
        const t0 = Date.now(); D.bestMove(D.create(), {level: 'difficile'}); assert.ok(Date.now() - t0 < 2000);
    });

    console.log('🁫 Dominos (moteur)');
    await t('28 dominos, 7 chacun à deux, 6 à trois ou quatre ; le plus gros double commence (et doit être posé)', () => {
        assert.equal(M.ALL.length, 28); assert.equal(M.ALL.reduce((s, x) => s + M.pips(x), 0), 168);
        const s2 = M.deal(2, L.rng('a')), s4 = M.deal(4, L.rng('b'));
        assert.deepEqual(s2.hands.map(h => h.length), [7, 7]); assert.equal(s2.stock.length, 14); assert.deepEqual(s4.hands.map(h => h.length), [6, 6, 6, 6]); assert.equal(s4.stock.length, 4);
        for (let k = 0; k < 30; k++) { const s = M.deal(2, L.rng('o' + k)), doubles = s.hands.flat().filter(M.isDouble); if (!doubles.length) continue; const top = Math.max(...doubles.map(x => x[0])); assert.deepEqual(s.opener, [top, top]); assert.ok(s.hands[s.turn].some(x => M.same(x, s.opener)));
            assert.equal(M.moves(s).length, 1, 'seul le double peut ouvrir'); }
    });
    await t('poser au bon bout (retourné s’il le faut), piocher seulement sans coup, passer seulement sans pioche', () => {
        const s = {n: 2, hands: [[[2, 5], [6, 6]], [[1, 1], [0, 3]]], stock: [[4, 4]], line: [[3, 2]], ends: [3, 2], turn: 0, opener: null, passes: 0, passedOn: [[], []], over: false, winner: -1, draw: true, log: []};
        assert.deepEqual(M.sides(s, [2, 5]), ['R']); assert.deepEqual(M.sides(s, [6, 6]), []);
        assert.equal(M.draw(s), null, 'pas de pioche quand on peut jouer'); assert.equal(M.pass(s), false);
        assert.ok(M.play(s, 0, 0, 'R')); assert.deepEqual(s.line.at(-1), [2, 5]); assert.deepEqual(s.ends, [3, 5]);
        assert.ok(M.play(s, 1, 1, 'L')); assert.deepEqual(s.line[0], [0, 3]); assert.deepEqual(s.ends, [0, 5]);
        assert.equal(M.canPlay(s, 0), false); assert.deepEqual(M.draw(s), [4, 4]); assert.equal(M.pass(s), true, 'pioche vide : on passe');
    });
    await t('partie bloquée : le moins de points gagne et marque ceux des autres ; « Domino ! » : on marque les mains adverses', () => {
        const s = {n: 2, hands: [[[6, 6]], [[5, 5], [0, 1]]], stock: [], line: [[2, 3]], ends: [2, 3], turn: 0, opener: null, passes: 0, passedOn: [[], []], over: false, winner: -1, draw: false, log: []};
        assert.ok(M.pass(s)); assert.ok(M.pass(s)); assert.deepEqual([s.over, s.blocked, s.winner, s.gain], [true, true, 1, 12]);
        const d = {n: 2, hands: [[[3, 4]], [[6, 6], [1, 2]]], stock: [], line: [[2, 3]], ends: [2, 3], turn: 0, opener: null, passes: 0, passedOn: [[], []], over: false, winner: -1, draw: true, log: []};
        assert.ok(M.play(d, 0, 0, 'R')); assert.deepEqual([d.over, d.blocked, d.winner, d.gain], [true, false, 0, 15]);
    });
    await t('des manches entières à 2, 3 et 4 : jamais un domino perdu ou en double ; l’ordinateur difficile bat le facile', () => {
        let wins = 0, games = 0;
        for (let k = 0; k < 240; k++) {
            const n = 2 + (k % 3), R = L.rng('m' + k), s = M.deal(n, R, {draw: k % 2 === 0}); let guard = 0;
            while (!s.over && guard++ < 400) { const p = s.turn, m = M.aiMove(s, p, p === 0 ? 'difficile' : 'facile', R); if (m) assert.ok(M.play(s, p, m.i, m.side)); else if (!M.draw(s, p)) assert.ok(M.pass(s, p)); }
            assert.ok(s.over); const all = [...s.line, ...s.stock, ...s.hands.flat()].map(x => [...x].sort().join('-'));
            assert.equal(all.length, 28); assert.equal(new Set(all).size, 28);
            for (let i = 1; i < s.line.length; i++) assert.equal(s.line[i - 1][1], s.line[i][0], 'la chaîne se suit');
            if (n === 2) { games++; if (s.winner === 0) wins++; }
        }
        assert.ok(wins / games > 0.5, `${wins} / ${games}`);
    });

    console.log('🎲 Yams (moteur)');
    await t('toutes les cases de la feuille française et américaine', () => {
        const sc = (d, b, v = 'fr') => Y.score(d, b, v, Y.emptySheet());
        assert.equal(sc([1, 1, 3, 1, 5], 'un'), 3); assert.equal(sc([6, 6, 2, 6, 6], 'six'), 24);
        assert.equal(sc([4, 4, 4, 2, 1], 'brelan'), 12); assert.equal(sc([4, 4, 4, 2, 1], 'brelan', 'us'), 15); assert.equal(sc([4, 4, 2, 2, 1], 'brelan'), 0);
        assert.equal(sc([5, 5, 5, 5, 1], 'carre'), 20); assert.equal(sc([5, 5, 5, 5, 1], 'carre', 'us'), 21); assert.equal(sc([5, 5, 5, 1, 1], 'carre'), 0);
        assert.equal(sc([2, 2, 3, 3, 3], 'full'), 25); assert.equal(sc([2, 2, 2, 2, 3], 'full'), 0);
        assert.equal(sc([1, 2, 3, 4, 6], 'psuite'), 30); assert.equal(sc([3, 4, 5, 6, 6], 'psuite'), 30); assert.equal(sc([1, 2, 3, 5, 6], 'psuite'), 0);
        assert.equal(sc([2, 3, 4, 5, 6], 'gsuite'), 40); assert.equal(sc([1, 2, 3, 4, 5], 'gsuite'), 40); assert.equal(sc([1, 2, 3, 4, 6], 'gsuite'), 0);
        assert.equal(sc([3, 3, 3, 3, 3], 'yams'), 50); assert.equal(sc([3, 3, 3, 3, 2], 'yams'), 0); assert.equal(sc([1, 2, 3, 4, 6], 'chance'), 16);
        assert.equal(Y.BOXES.length, 13);
    });
    await t('la prime : 35 points à partir de 63 dans le haut (62 : rien) ; le total', () => {
        const s = Y.emptySheet(); Object.assign(s, {un: 3, deux: 6, trois: 9, quatre: 12, cinq: 15, six: 18}); // 63
        assert.deepEqual([Y.totals(s).upper, Y.totals(s).prime, Y.totals(s).need], [63, 35, 0]);
        s.un = 2; assert.deepEqual([Y.totals(s).upper, Y.totals(s).prime, Y.totals(s).need], [62, 0, 1]);
        Object.assign(s, {brelan: 18, carre: 0, full: 25, psuite: 30, gsuite: 40, yams: 50, chance: 22}); assert.equal(Y.totals(s).total, 62 + 185); assert.ok(Y.full(s));
        const w = Y.emptySheet(); assert.deepEqual(Y.write(w, [2, 2, 3, 3, 3], 'full'), {pts: 25, bonus: 0}); assert.equal(Y.write(w, [2, 2, 3, 3, 3], 'full'), null, 'une case ne sert qu’une fois');
    });
    await t('Yahtzee : prime de 100 pour un Yahtzee de plus, case du haut d’abord, puis joker', () => {
        const s = Y.emptySheet(); Y.write(s, [4, 4, 4, 4, 4], 'yams', 'us'); assert.equal(s.yams, 50);
        assert.equal(Y.allowed([4, 4, 4, 4, 4], 'full', 'us', s), false, 'la case des 4 est libre : elle d’abord');
        assert.deepEqual(Y.write(s, [4, 4, 4, 4, 4], 'quatre', 'us'), {pts: 20, bonus: 100});
        assert.equal(Y.score([4, 4, 4, 4, 4], 'gsuite', 'us', s), 40, 'joker'); assert.equal(Y.score([4, 4, 4, 4, 4], 'gsuite', 'fr', s), 0);
        assert.equal(Y.totals(s).bonus, 100);
    });
    await t('l’ordinateur : il garde des dés qui ont un sens et le niveau difficile marque plus que le facile', () => {
        const play = (lvl, seed) => { const R = L.rng(seed), sh = Y.emptySheet(); for (let k = 0; k < 13; k++) { let d = Y.roll(5, R); for (let left = 2; left >= 1; left--) { const keep = Y.aiKeep(sh, d, left, lvl, 'fr', R); if (keep.every(Boolean)) break; d = d.map((v, i) => (keep[i] ? v : 1 + Math.floor(R() * 6))); } const b = Y.bestBox(sh, d, 'fr'); assert.ok(Y.write(sh, d, b.box, 'fr')); } assert.ok(Y.full(sh)); return Y.totals(sh).total; };
        const avg = (lvl, n) => { let s = 0; for (let k = 0; k < n; k++) s += play(lvl, lvl + k); return s / n; };
        const f = avg('facile', 40), d = avg('difficile', 15); assert.ok(d > f + 20, `${d} contre ${f}`);
        assert.deepEqual(Y.aiKeep(Y.emptySheet(), [6, 6, 6, 6, 6], 2, 'moyen'), [true, true, true, true, true]);
    });

    await browserPart();
    console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon.');
    process.exit(failures ? 1 : 0);
})();

/* ═════ 2. Navigateur ═════ */
async function browserPart() {
    console.log('Navigateur');
    let pw; try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (_) { try { pw = require('playwright'); } catch (__) { console.log('  (Playwright absent : partie navigateur sautée)'); return; } }
    const appRoot = path.resolve(__dirname, '..'), phpPath = findPhp([devBundledPhp()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-plateau-')), env = {...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1'};
    fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $p = db();
for ($i = 0; $i < 40; $i++) $p->prepare("INSERT INTO persons(first_name,last_name,gender,living_status,is_private) VALUES(?,?,?,?,0)")->execute(['Ancêtre' . $i, 'Famille' . $i, $i % 2 ? 'female' : 'male', 'deceased']);
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES('Vivant','Toujours','male','living')");
$p->exec("INSERT INTO persons(first_name,last_name,gender,living_status,is_private) VALUES('Cachée','Secrète','female','deceased',1)");
echo 'ok';`], {cwd: appRoot, encoding: 'utf8', env});
    if (r.status !== 0 || !/ok$/.test(r.stdout.trim())) { failures++; console.log('  ✗ base de test\n' + (r.stderr || r.stdout)); return; }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], {cwd: appRoot, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const shots = process.env.SHOTS || '';
    const browser = await pw.chromium.launch();
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 950}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
        const page = await ctx.newPage();
        const errors = [], posts = []; let watch = false;
        page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
        page.on('request', q => {
            if (!watch || /^(GET|HEAD)$/.test(q.method())) return;
            let keys = []; try { const b = JSON.parse(q.postData() || '{}'); keys = [...Object.keys(b.set || {}), ...(b.remove || [])]; } catch (_) {}
            if (/action=save_settings/.test(q.url()) && keys.length && !keys.some(k => /jeux/.test(k))) return;
            posts.push(q.method() + ' ' + q.url() + ' ' + keys.join(','));
        });
        await page.goto(base);
        await page.waitForFunction(() => window.LCNDA_APP?.state?.csrf && ['echecs', 'dames', 'dominos', 'yams'].every(k => window.LCNDA_JEUX_FAMILLE?.KEYS?.includes(k)), null, {timeout: 30000});
        await page.evaluate(async () => { document.documentElement.classList.add('a11y-calm'); await window.LCNDA_APP.setModule('jeu'); });
        await page.waitForSelector('select[name="variant"]');
        const J = (fn, arg) => page.evaluate(fn, arg);
        const game = () => J(() => window.LCNDA_JEUX_FAMILLE._games()[0]);
        const setup = async key => {
            if (!await page.$('select[name="variant"]')) { await page.click('[data-jf-new]'); await page.waitForSelector('select[name="variant"]'); }
            await page.selectOption('select[name="variant"]', key); await page.waitForSelector(`.jf-${key} #jf-setup-form`);
        };
        const startGame = async key => { await page.click('#jf-setup-form [type=submit]'); await page.waitForSelector('[data-jf-play] .jp-bar'); const g = await game(); assert.equal(g.kind, key); return g; };
        const sq = (name) => `.jpe-board [data-i="${(8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0])}"]`;

        await t('les 4 jeux sont dans « Jeu ▾ » avec les autres', async () => {
            const opts = await page.$$eval('select[name="variant"] option', l => l.map(o => o.value));
            ['goose', 'morpion', 'naval', 'echecs', 'dames', 'dominos', 'yams'].forEach(k => assert.ok(opts.includes(k), k));
        });
        await t('♟ à deux : mat du berger à la souris, notation, ↶ défait un coup, ⏸ par Échap, règles dans le « ? »', async () => {
            await setup('echecs');
            await page.selectOption('.jf-player[data-i="1"] select[name="pai"]', '');
            const g0 = await startGame('echecs'); watch = true;
            assert.ok(Object.keys(g0.names || {}).length >= 30, 'les pièces portent des noms d’ancêtres');
            assert.ok(!Object.values(g0.names).some(n => /Vivant|Cachée/.test(n)), 'jamais un vivant ni une fiche confidentielle');
            for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) { await page.click(sq(a)); await page.click(sq(b)); }
            await page.waitForFunction(() => window.LCNDA_JEUX_FAMILLE._games()[0].result === '0-1');
            const g = await game(); assert.equal(g.reason, 'mat'); assert.equal(g.finished, true);
            assert.match(await page.textContent('.jpe-moves'), /Dh4#/);
            if (shots) await page.screenshot({path: path.join(shots, 'echecs-mat.png'), fullPage: true});
            await page.click('[data-jp-undo]'); await page.waitForFunction(() => window.LCNDA_JEUX_FAMILLE._games()[0].moves.length === 3);
            assert.equal((await game()).finished, false);
            await page.click('.goose-page h2'); await page.keyboard.press('Escape'); await page.waitForSelector('.jp-pause');
            await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.jp-pause'));
            await page.click('[data-jp-rules]'); await page.waitForSelector('dialog[open] .jp-rules'); assert.match(await page.textContent('dialog[open]'), /Roque/);
            await page.click('dialog[open] [data-h-close]'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
            watch = false;
        });
        await t('♟ au clavier (flèches + Entrée) puis l’ordinateur répond tout seul', async () => {
            await page.click('[data-jf-new]'); await setup('echecs');
            await page.selectOption('.jf-player[data-i="1"] select[name="pai"]', 'facile');
            await startGame('echecs'); watch = true;
            await page.focus('.jpe-board [tabindex="0"]');
            const focusAt = () => page.evaluate(() => document.activeElement?.dataset?.i);
            assert.equal(await focusAt(), '0', 'la case a8 d’abord');
            for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowDown'); for (let k = 0; k < 4; k++) await page.keyboard.press('ArrowRight');
            assert.equal(await focusAt(), String(6 * 8 + 4), 'e2'); await page.keyboard.press('Enter');
            await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
            await page.waitForFunction(() => window.LCNDA_JEUX_FAMILLE._games()[0].moves.length >= 2, null, {timeout: 8000});
            const g = await game(); assert.equal(g.moves[0], 'e2e4');
            watch = false;
        });
        await t('⛀ dames internationales contre l’ordinateur : un coup, il répond ; le damier fait 10 × 10', async () => {
            await page.click('[data-jf-new]'); await setup('dames'); await startGame('dames'); watch = true;
            assert.equal(await page.$$eval('.jpd-board .is-dark', l => l.length), 50);
            await page.click('.jpd-board [data-i="61"]'); await page.click('.jpd-board [data-i="52"]');
            await page.waitForFunction(() => window.LCNDA_JEUX_FAMILLE._games()[0].moves.length >= 2, null, {timeout: 8000});
            assert.equal((await game()).moves[0], '61>52:');
            if (shots) await page.screenshot({path: path.join(shots, 'dames.png'), fullPage: true});
            watch = false;
        });
        await t('🁫 dominos contre un ordinateur : une manche entière, comptage des points', async () => {
            await page.click('[data-jf-new]'); await setup('dominos'); await page.click('[data-jf-seg="target"][data-v="0"]'); await startGame('dominos'); watch = true;
            for (let k = 0; k < 120; k++) {
                const g = await game(); if (g.s.over) break;
                if (g.s.turn !== 0) { await page.waitForTimeout(80); continue; }
                const m = await J(() => { const s = window.LCNDA_JEUX_FAMILLE._games()[0].s; return window.LCNDA_DOMINOS.moves(s)[0] || null; });
                if (m) { await page.click(`[data-jpm-i="${m.i}"]`); if (await page.$('[data-jpm-end]')) await page.click(`[data-jpm-end="${m.side}"]`).catch(() => {}); }
                else if (await page.$('[data-jpm-draw]')) await page.click('[data-jpm-draw]'); else if (await page.$('[data-jpm-pass]')) await page.click('[data-jpm-pass]');
                await page.waitForTimeout(60);
            }
            await page.waitForSelector('.jpm-end-box');
            const g = await game(); assert.equal(g.s.over, true); assert.equal(g.finished, true);
            if (g.s.winner >= 0) assert.equal(g.scores[g.s.winner], g.s.gain);
            if (shots) await page.screenshot({path: path.join(shots, 'dominos-fin.png'), fullPage: true});
            watch = false;
        });
        await t('🎲 Yams seul : 13 tours, la feuille se remplit, le total et le record', async () => {
            await page.click('[data-jf-new]'); await setup('yams'); await page.click('[data-jf-pdel="1"]'); await startGame('yams'); watch = true;
            for (let k = 0; k < 13; k++) {
                await page.click('[data-jpy-roll]'); await page.waitForSelector('[data-jpy-box]');
                if (k === 0) { await page.click('[data-jpy-die="0"]'); assert.equal((await game()).keep[0], true, 'un dé gardé'); await page.click('[data-jpy-roll]'); await page.waitForSelector('[data-jpy-box]'); assert.equal((await game()).rolls, 2); }
                await page.click('[data-jpy-box]');
            }
            await page.waitForFunction(() => window.LCNDA_JEUX_FAMILLE._games()[0].finished);
            const g = await game(); assert.ok(Y.full(g.sheets[0]));
            const rec = await J(() => JSON.parse(localStorage.getItem('lcnda-jeux-plateau-records') || '{}').yams?.fr?.best?.v); assert.equal(rec, Y.totals(g.sheets[0]).total);
            assert.match(await page.textContent('.jp-rec'), /record/);
            if (shots) await page.screenshot({path: path.join(shots, 'yams-fin.png'), fullPage: true});
            // ↶ : la dernière case remplie revient
            await page.click('[data-jp-undo]'); await page.waitForFunction(() => !window.LCNDA_JEUX_FAMILLE._games()[0].finished);
            watch = false;
        });
        await t('aucun POST pendant les parties', () => assert.deepEqual(posts, []));
        await t('390 px et sombre : préparation et parties sans débordement de la page', async () => {
            await page.setViewportSize({width: 390, height: 844});
            await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
            for (const k of ['echecs', 'dames', 'dominos', 'yams']) {
                await page.click('[data-jf-new]').catch(() => {}); await page.waitForTimeout(200);
                await setup(k);
                const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over <= 1, `${k} préparation : ${over}px de trop`);
                await startGame(k); await page.waitForTimeout(300);
                const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert.ok(over2 <= 1, `${k} partie : ${over2}px de trop`);
                if (shots) await page.screenshot({path: path.join(shots, `${k}-390-sombre.png`), fullPage: true});
            }
        });
        await t('aucune erreur JavaScript', () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); fs.rmSync(dir, {recursive: true, force: true}); }
}
