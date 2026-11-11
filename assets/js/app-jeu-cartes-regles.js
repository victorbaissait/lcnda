/* LCNDA — 🂡 Jeux de cartes à plusieurs, contre l'ordinateur : les règles, sans écran (testées dans Node : tests/test-jeux-cartes.js).
 *
 * Huit jeux : Bataille, Huit américain, Dame de pique, Président, Belote, Tarot à 4, Rami (gin), Crapette.
 * Le joueur 0 est la personne (en bas, « Sud ») ; les autres sont l'ordinateur 🤖, au niveau facile, moyen ou difficile.
 * Le hasard est celui des patiences (LCNDA_PATIENCES.rng) : même graine = même donne.
 *
 * Une carte : {r, s, i} — jeu de 52 : r 1..13 (As..Roi), s 0..3 (♥ ♦ ♠ ♣, comme les patiences) ;
 *   belote : 32 cartes (As, 7..Roi) ; tarot : s 0..3 r 1..14 (Valet 11, Cavalier 12, Dame 13, Roi 14), atouts s 4 r 1..21, excuse s 5 r 0 ;
 *   crapette : deux jeux de 52, o = à qui est la carte (0 ou 1).
 * Une partie : {k, seed, n, level, names, turn, phase, hands, …, total, manche, over, winner, log}.
 * API (window.LCNDA_CARTES) : GAMES, get(k), create(k, {n, level, levels (un niveau par joueur), seed, names}), legal(st), play(st, action) → {ok, msg},
 *   ai(st) (le coup de l'ordinateur pour le joueur dont c'est le tour — toujours un coup de legal()), next(st) (manche suivante),
 *   hint(st) (= ai au niveau difficile), helpers (cardName, melds, deadwood, belotePoints…).
 * Actions : {t: 'play', c} (une carte, par son numéro i) · {t: 'play', cards: [i…]} (Président) · {t: 'draw'} · {t: 'pass'} · {t: 'flip'} ·
 *   {t: 'bid', v} · {t: 'take', s} · {t: 'give', cards} · {t: 'discard', c} · {t: 'knock', c} · {t: 'move', from, to} · {t: 'end'}.
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const P = () => root.LCNDA_PATIENCES;
    const rng = seed => P().rng(seed);
    const shuffle = (list, R) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const SUIT = ['♥', '♦', '♠', '♣'], SUIT_NAME = ['cœur', 'carreau', 'pique', 'trèfle'];
    const RANK_NAME = ['', 'As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi'];
    const TAROT_NAME = ['', 'As', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Cavalier', 'Dame', 'Roi'];
    const red = c => c.s === 0 || c.s === 1;
    /** les textes : traduits dans le navigateur (LCNDA_I18N), tels quels en français et dans Node */
    const I18 = () => (typeof window !== 'undefined' && window.LCNDA_I18N) || null;
    const i18n = (s, v) => { const I = I18(); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s); };
    const plur = (n, one, many) => { const I = I18(); return I ? I.plural(n, one, many) : `${n} ${n > 1 ? many : one}`; };
    const sn = s => i18n(SUIT_NAME[s], {ctx: 'carte'}), rn = r => i18n(RANK_NAME[r], {ctx: 'carte'});
    const seat = n => i18n(n, {ctx: 'siege'});
    /** le nom d'une carte, en clair (« Dame de pique », « Atout 21 », « L'excuse ») */
    function cardName(c, k) {
        if (!c) return '';
        if (k === 'tarot') { if (c.s === 5) return i18n('l’Excuse'); if (c.s === 4) return c.r === 1 ? i18n('le Petit (atout 1)') : i18n('l’atout {n}', {n: String(c.r)}); return i18n('{rank} de {suit}', {rank: i18n(TAROT_NAME[c.r], {ctx: 'carte'}), suit: sn(c.s)}); }
        return i18n('{rank} de {suit}', {rank: rn(c.r), suit: sn(c.s)});
    }
    const deck52 = () => { const d = []; for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({r, s, i: d.length}); return d; };
    const deck32 = () => { const d = []; for (let s = 0; s < 4; s++) for (const r of [1, 7, 8, 9, 10, 11, 12, 13]) d.push({r, s, i: d.length}); return d; };
    const deckTarot = () => { const d = []; for (let s = 0; s < 4; s++) for (let r = 1; r <= 14; r++) d.push({r, s, i: d.length}); for (let r = 1; r <= 21; r++) d.push({r, s: 4, i: d.length}); d.push({r: 0, s: 5, i: d.length}); return d; };
    const pickIn = (R, list) => list[Math.floor(R() * list.length)];
    const sum = l => l.reduce((a, b) => a + b, 0);
    const byId = (st, i) => st.hands.flat().find(c => c.i === i) || null;
    const others = (st, p) => Array.from({length: st.n}, (_, k) => (p + 1 + k) % st.n).filter(q => q !== p);
    const log = (st, msg) => { st.log.push(msg); if (st.log.length > 80) st.log.shift(); };
    const nm = (st, p) => st.names[p] || i18n('Joueur {n}', {n: String(p + 1)});
    /** un nouveau tirage du hasard, toujours le même pour la même partie au même moment */
    const R = st => rng(`${st.seed}:${st.manche}:${st.rs++}`);
    const LEVELS = ['facile', 'moyen', 'difficile'];

    /* ═══════════ Les plis (Dame de pique, Belote, Tarot) ═══════════ */
    function trickStart(st, leader) { st.trick = []; st.leader = leader; st.turn = leader; }
    const ledSuit = (st) => { const f = st.trick.find(x => !(st.k === 'tarot' && x.c.s === 5)); return f ? f.c.s : -1; };

    /* ═══════════ 1. ⚔ Bataille ═══════════ */
    const hiAce = c => (c.r === 1 ? 14 : c.r);
    const bataille = {
        min: 2, max: 4,
        deal(st) {
            const d = shuffle(deck52(), R(st)); st.hands = Array.from({length: st.n}, () => []);
            d.forEach((c, j) => st.hands[j % st.n].push(c)); st.phase = 'play'; st.turn = 0; st.plis = 0; st.last = null; st.cap = 600;
        },
        legal: st => (st.phase === 'play' ? [{t: 'flip'}] : []),
        play(st, a) {
            if (a.t !== 'flip' || st.phase !== 'play') return {ok: false, msg: i18n('Retourne une carte.')};
            const Rr = R(st); let pot = [], fighters = st.hands.map((h, p) => p).filter(p => st.hands[p].length), shown = [], battles = 0, winner = -1;
            for (let guard = 0; guard < 30 && fighters.length; guard++) {
                const up = [];
                fighters.forEach(p => { const c = st.hands[p].shift(); if (c) { pot.push(c); up.push({p, c}); shown.push({p, c, hidden: false}); } });
                if (!up.length) break;
                const best = Math.max(...up.map(x => hiAce(x.c))), top = up.filter(x => hiAce(x.c) === best).map(x => x.p);
                if (top.length === 1) { winner = top[0]; break; }
                battles++;
                // bataille ! chacun des ex æquo pose une carte cachée, puis on rejoue entre eux
                top.forEach(p => { const c = st.hands[p].shift(); if (c) { pot.push(c); shown.push({p, c, hidden: true}); } });
                fighters = top.filter(p => st.hands[p].length);
                if (fighters.length === 1) { winner = fighters[0]; break; }
            }
            if (winner < 0) { // plus personne n'a de cartes pour départager : le pot revient à celui qui en a le plus
                winner = st.hands.map((h, p) => [h.length, p]).sort((x, y) => y[0] - x[0])[0][1];
            }
            st.hands[winner].push(...shuffle(pot, Rr));
            st.plis++; st.last = {shown, winner, battles, n: pot.length};
            log(st, i18n(battles > 1 ? 'Double bataille ! {name} ramasse {n} cartes.' : battles ? 'Bataille ! {name} ramasse {n} cartes.' : '{name} ramasse {n} cartes.', {name: nm(st, winner), n: String(pot.length)}));
            const alive = st.hands.filter(h => h.length).length;
            if (alive <= 1 || st.plis >= st.cap) {
                const counts = st.hands.map(h => h.length), best = Math.max(...counts);
                st.winner = counts.indexOf(best); st.total = counts.slice(); st.over = true; st.phase = 'over';
                log(st, alive <= 1 ? i18n('{name} a toutes les cartes : gagné !', {name: nm(st, st.winner)}) : i18n('Après {n} plis, {name} a le plus de cartes : gagné !', {n: String(st.cap), name: nm(st, st.winner)}));
            }
            return {ok: true};
        },
        ai: () => ({t: 'flip'}),
        score: st => st.hands.map(h => h.length),
    };

    /* ═══════════ 2. 🎱 Huit américain ═══════════ */
    const huitPts = c => (c.r === 8 ? 50 : c.r >= 11 ? 10 : c.r === 1 ? 1 : c.r);
    const huit = {
        min: 2, max: 4, target: 100,
        deal(st) {
            const d = shuffle(deck52(), R(st)), per = st.n === 2 ? 8 : 7;
            st.hands = Array.from({length: st.n}, () => []);
            for (let k = 0; k < per; k++) for (let p = 0; p < st.n; p++) st.hands[p].push(d.shift());
            // la première carte retournée ne doit pas être un 8
            let first = d.findIndex(c => c.r !== 8); const [c0] = d.splice(first, 1);
            st.pile = [c0]; st.stock = d; st.suit = c0.s; st.dir = 1; st.pending = 0; st.drew = false;
            st.turn = (st.manche - 1) % st.n; st.phase = 'play'; st.voids = Array.from({length: st.n}, () => [false, false, false, false]);
        },
        top: st => st.pile[st.pile.length - 1],
        playable(st, c) { const t = this.top(st); if (st.pending) return c.r === 2; return c.r === 8 || c.r === t.r || c.s === st.suit; },
        legal(st) {
            if (st.phase !== 'play') return [];
            const h = st.hands[st.turn], out = [];
            h.forEach(c => { if (!this.playable(st, c)) return; if (c.r === 8) for (let s = 0; s < 4; s++) out.push({t: 'play', c: c.i, s}); else out.push({t: 'play', c: c.i}); });
            if (st.pending) out.push({t: 'draw'});
            else if (!st.drew && (st.stock.length || st.pile.length > 1)) out.push({t: 'draw'});
            else out.push({t: 'pass'});
            return out;
        },
        refill(st) { if (st.stock.length) return; const t = st.pile.pop(); st.stock = shuffle(st.pile, R(st)); st.pile = [t]; },
        advance(st, k = 1) { st.turn = ((st.turn + st.dir * k) % st.n + st.n) % st.n; st.drew = false; },
        play(st, a) {
            const p = st.turn, h = st.hands[p];
            if (a.t === 'draw') {
                if (st.pending) {
                    let n = 0; for (let k = 0; k < st.pending; k++) { this.refill(st); const c = st.stock.pop(); if (c) { h.push(c); n++; } }
                    log(st, i18n('{name} pioche {n} cartes.', {name: nm(st, p), n: String(n)})); st.pending = 0; this.advance(st); return {ok: true};
                }
                if (st.drew) return {ok: false, msg: i18n('Tu as déjà pioché : joue une carte ou passe.')};
                this.refill(st); const c = st.stock.pop(); if (!c) return {ok: false, msg: i18n('Plus rien à piocher.')};
                h.push(c); st.drew = true; st.voids[p][st.suit] = true; log(st, i18n('{name} pioche.', {name: nm(st, p)}));
                return {ok: true, drawn: c.i};
            }
            if (a.t === 'pass') { if (st.pending || (!st.drew && (st.stock.length || st.pile.length > 1))) return {ok: false, msg: i18n('Pioche d’abord une carte.')}; log(st, i18n('{name} passe.', {name: nm(st, p)})); this.advance(st); return {ok: true}; }
            if (a.t !== 'play') return {ok: false};
            const j = h.findIndex(c => c.i === a.c); if (j < 0) return {ok: false, msg: i18n('Cette carte n’est pas dans ta main.')};
            const c = h[j]; if (!this.playable(st, c)) return {ok: false, msg: st.pending ? i18n('Il faut jouer un 2 ou piocher {n} cartes.', {n: String(st.pending)}) : i18n('Il faut jouer du {suit}, un {rank} ou un 8.', {suit: sn(st.suit), rank: rn(this.top(st).r)})};
            if (c.r === 8 && !(a.s >= 0 && a.s <= 3)) return {ok: false, msg: i18n('Choisis la couleur demandée.')};
            h.splice(j, 1); st.pile.push(c); st.suit = c.r === 8 ? a.s : c.s;
            log(st, c.r === 8 ? i18n('{name} joue {card} et demande du {suit} {sym}.', {name: nm(st, p), card: cardName(c), suit: sn(a.s), sym: SUIT[a.s]}) : i18n('{name} joue {card}.', {name: nm(st, p), card: cardName(c)}));
            if (!h.length) return this.endManche(st, p);
            if (c.r === 2) { st.pending += 2; this.advance(st); }
            else if (c.r === 11) { log(st, i18n('{name} passe son tour.', {name: nm(st, (p + st.dir + st.n) % st.n)})); this.advance(st, 2); }
            else if (c.r === 1) { st.dir = -st.dir; if (st.n === 2) { st.drew = false; log(st, i18n('{name} rejoue.', {name: nm(st, p)})); } else { log(st, i18n('On change de sens.')); this.advance(st); } }
            else this.advance(st);
            return {ok: true};
        },
        endManche(st, w) {
            const pts = st.hands.map(h => sum(h.map(huitPts)));
            pts.forEach((v, p) => { st.total[p] += v; }); st.lastScore = pts; st.phase = 'end';
            log(st, i18n('{name} n’a plus de cartes : fin de la manche.', {name: nm(st, w)}));
            if (Math.max(...st.total) >= this.target) { const lo = Math.min(...st.total); st.winner = st.total.indexOf(lo); st.over = true; st.phase = 'over'; log(st, i18n('{name} gagne la partie avec le moins de points.', {name: nm(st, st.winner)})); }
            return {ok: true};
        },
        ai(st, lvl, Rr) {
            const L = this.legal(st), plays = L.filter(a => a.t === 'play');
            if (!plays.length) return L[0];
            if (lvl === 'facile') return Rr() < 0.15 && L.some(a => a.t === 'draw') && !st.pending ? L.find(a => a.t === 'draw') : pickIn(Rr, plays);
            const h = st.hands[st.turn], count = s => h.filter(c => c.s === s && c.r !== 8).length;
            const bestSuit = [0, 1, 2, 3].sort((a, b) => count(b) - count(a))[0];
            const next = (st.turn + st.dir + st.n) % st.n, danger = st.hands[next].length <= 2;
            const score = a => {
                const c = byId(st, a.c); let v = 0;
                if (c.r === 8) v -= 30 - (h.length <= 2 ? 40 : 0); // le 8 se garde pour la fin
                if (c.r === 2 || c.r === 11) v += danger ? 25 : 2;
                v += count(c.s) * 3 + huitPts(c) / 5;
                if (c.r === 8) { v += a.s === bestSuit ? 5 : -5; if (lvl === 'difficile' && st.voids[next][a.s]) v += 8; }
                if (lvl === 'difficile' && c.r !== 8 && st.voids[next][c.s]) v += 6;
                return v;
            };
            return plays.slice().sort((x, y) => score(y) - score(x))[0];
        },
        score: st => st.total,
    };

    /* ═══════════ 3. ♠ Dame de pique ═══════════ */
    const isQS = c => c.s === 2 && c.r === 12;
    const heartPts = c => (c.s === 0 ? 1 : isQS(c) ? 13 : 0);
    const dame = {
        min: 4, max: 4, target: 100,
        passDir: st => [1, 3, 2, 0][(st.manche - 1) % 4], // à gauche, à droite, en face, on garde
        deal(st) {
            const d = shuffle(deck52(), R(st)); st.hands = [[], [], [], []]; d.forEach((c, j) => st.hands[j % 4].push(c));
            st.won = [[], [], [], []]; st.broken = false; st.tricks = 0; st.lastTrick = null;
            const dir = this.passDir(st);
            if (dir) { st.phase = 'pass'; st.turn = 0; st.given = [null, null, null, null]; }
            else this.startPlay(st);
        },
        startPlay(st) { st.phase = 'play'; const p = st.hands.findIndex(h => h.some(c => c.s === 3 && c.r === 2)); trickStart(st, p); },
        legal(st) {
            if (st.phase === 'pass') { const h = st.hands[st.turn]; return [{t: 'give', cards: this.passChoice(st, st.turn, st.level, rng(st.seed + 'p'))}].concat(h.length ? [] : []); }
            if (st.phase !== 'play') return [];
            const h = st.hands[st.turn], first = st.tricks === 0;
            if (!st.trick.length) {
                if (first) return h.filter(c => c.s === 3 && c.r === 2).map(c => ({t: 'play', c: c.i}));
                const ok = h.filter(c => c.s !== 0 || st.broken); return (ok.length ? ok : h).map(c => ({t: 'play', c: c.i}));
            }
            const s = ledSuit(st), follow = h.filter(c => c.s === s);
            if (follow.length) return follow.map(c => ({t: 'play', c: c.i}));
            if (first) { const clean = h.filter(c => !heartPts(c)); if (clean.length) return clean.map(c => ({t: 'play', c: c.i})); }
            return h.map(c => ({t: 'play', c: c.i}));
        },
        play(st, a) {
            if (st.phase === 'pass') {
                const p = st.turn, h = st.hands[p], ids = [...new Set(a.cards || [])];
                if (a.t !== 'give' || ids.length !== 3 || !ids.every(i => h.some(c => c.i === i))) return {ok: false, msg: i18n('Choisis 3 cartes à donner.')};
                st.given[p] = ids;
                // l'ordinateur choisit ses 3 cartes en même temps
                for (let q = 1; q < 4; q++) if (!st.given[q]) st.given[q] = this.passChoice(st, q, st.levels?.[q] || st.level, R(st));
                const dir = this.passDir(st), moved = st.given.map((g, q) => g.map(i => { const k = st.hands[q].findIndex(c => c.i === i); return st.hands[q].splice(k, 1)[0]; }));
                moved.forEach((cards, q) => st.hands[(q + dir) % 4].push(...cards));
                st.received = moved[(0 - dir + 4) % 4].map(c => c.i);
                log(st, i18n(dir === 1 ? 'Chacun a donné 3 cartes à son voisin de gauche.' : dir === 3 ? 'Chacun a donné 3 cartes à son voisin de droite.' : 'Chacun a donné 3 cartes au joueur d’en face.'));
                this.startPlay(st); return {ok: true};
            }
            if (a.t !== 'play' || !this.legal(st).some(x => x.c === a.c)) return {ok: false, msg: this.why(st, a.c)};
            const p = st.turn, h = st.hands[p], c = h.splice(h.findIndex(x => x.i === a.c), 1)[0];
            st.trick.push({p, c}); if (c.s === 0) st.broken = true;
            if (st.trick.length < 4) { st.turn = (p + 1) % 4; return {ok: true}; }
            const s = st.trick[0].c.s, win = st.trick.filter(x => x.c.s === s).sort((x, y) => hiAce(y.c) - hiAce(x.c))[0].p;
            const pts = sum(st.trick.map(x => heartPts(x.c)));
            st.won[win].push(...st.trick.map(x => x.c)); st.lastTrick = {cards: st.trick.slice(), winner: win, pts}; st.tricks++;
            log(st, pts ? i18n('{name} ramasse le pli ({points}).', {name: nm(st, win), points: plur(pts, 'point', 'points')}) : i18n('{name} ramasse le pli.', {name: nm(st, win)}));
            if (st.tricks === 13) { st.trick = []; return this.endManche(st); }
            trickStart(st, win); return {ok: true};
        },
        why(st, i) {
            const h = st.hands[st.turn], c = h.find(x => x.i === i); if (!c) return i18n('Cette carte n’est pas dans ta main.');
            if (!st.trick.length && st.tricks === 0) return i18n('Le 2 de trèfle commence toujours.');
            if (!st.trick.length && c.s === 0) return i18n('On ne commence pas par du cœur tant qu’aucun cœur n’a été joué.');
            if (st.trick.length && h.some(x => x.s === ledSuit(st))) return i18n('Il faut fournir du {suit}.', {suit: sn(ledSuit(st))});
            return i18n('Au premier pli, pas de cœur ni de Dame de pique (si tu as autre chose).');
        },
        endManche(st) {
            let pts = st.won.map(w => sum(w.map(heartPts)));
            const moon = pts.indexOf(26);
            if (moon >= 0) { pts = pts.map((v, p) => (p === moon ? 0 : 26)); log(st, i18n('🌙 {name} a ramassé tous les points : 26 pour chacun des autres !', {name: nm(st, moon)})); }
            pts.forEach((v, p) => { st.total[p] += v; }); st.lastScore = pts; st.phase = 'end';
            if (Math.max(...st.total) >= this.target) { const lo = Math.min(...st.total); st.winner = st.total.indexOf(lo); st.over = true; st.phase = 'over'; log(st, i18n('{name} gagne avec le moins de points.', {name: nm(st, st.winner)})); }
            return {ok: true};
        },
        passChoice(st, p, lvl, Rr) {
            const h = st.hands[p].slice();
            if (lvl === 'facile') return shuffle(h, Rr).slice(0, 3).map(c => c.i);
            const spades = h.filter(c => c.s === 2).length;
            const danger = c => (isQS(c) ? 100 : c.s === 2 && c.r === 1 || c.s === 2 && c.r === 13 ? (spades >= 5 && lvl === 'difficile' ? 5 : 60) : c.s === 0 ? hiAce(c) * 2 + 10 : hiAce(c) * 2 + (lvl === 'difficile' && h.filter(x => x.s === c.s).length <= 2 ? 12 : 0));
            return h.sort((x, y) => danger(y) - danger(x)).slice(0, 3).map(c => c.i);
        },
        ai(st, lvl, Rr) {
            const L = this.legal(st); if (st.phase === 'pass') return L[0];
            if (lvl === 'facile' || L.length === 1) return pickIn(Rr, L);
            const cards = L.map(a => byId(st, a.c)), h = st.hands[st.turn];
            const qsOut = !st.won.flat().some(isQS) && !st.trick.some(x => isQS(x.c));
            if (!st.trick.length) {
                // entamer : la plus petite carte d'une couleur courte (pas de pique haut si la Dame court encore)
                const len = s => h.filter(c => c.s === s).length;
                const sc = c => hiAce(c) * 2 + len(c.s) + (c.s === 0 ? 6 : 0) + (c.s === 2 && qsOut && hiAce(c) >= 12 ? 40 : 0) - (lvl === 'difficile' && c.s === 2 && qsOut && hiAce(c) < 12 && !h.some(isQS) ? 8 : 0);
                return L[cards.indexOf(cards.slice().sort((x, y) => sc(x) - sc(y))[0])];
            }
            const s = ledSuit(st), cur = st.trick.filter(x => x.c.s === s).sort((x, y) => hiAce(y.c) - hiAce(x.c))[0].c;
            const pts = sum(st.trick.map(x => heartPts(x.c))), last = st.trick.length === 3;
            if (cards[0].s !== s) { // on ne peut pas fournir : se défausser du plus dangereux
                const qs = cards.find(isQS); if (qs) return L[cards.indexOf(qs)];
                const sc = c => (c.s === 2 && hiAce(c) > 12 && qsOut ? 60 : 0) + (c.s === 0 ? 20 : 0) + hiAce(c);
                return L[cards.indexOf(cards.slice().sort((x, y) => sc(y) - sc(x))[0])];
            }
            const under = cards.filter(c => hiAce(c) < hiAce(cur)).sort((x, y) => hiAce(y) - hiAce(x));
            if (under.length) return L[cards.indexOf(under[0])]; // la plus forte qui ne prend pas
            if (last && !pts) { const safe = cards.filter(c => !isQS(c)).sort((x, y) => hiAce(y) - hiAce(x)); if (safe.length) return L[cards.indexOf(safe[0])]; }
            const lo = cards.slice().sort((x, y) => hiAce(x) - hiAce(y) + (isQS(x) ? 50 : 0) - (isQS(y) ? 50 : 0));
            return L[cards.indexOf(lo[0])];
        },
        score: st => st.total,
    };

    /* ═══════════ 4. 👑 Président ═══════════ */
    const pv = c => (c.r + 10) % 13; // 3 = 0 … Roi = 10, As = 11, 2 = 12
    const TITLES = {3: ['Président', 'Neutre', 'Clochard'], 4: ['Président', 'Vice-président', 'Vice-clochard', 'Clochard']};
    const president = {
        min: 3, max: 4, manches: 5,
        deal(st) {
            const d = shuffle(deck52(), R(st)); st.hands = Array.from({length: st.n}, () => []); d.forEach((c, j) => st.hands[j % st.n].push(c));
            st.out = []; st.cur = null; st.passed = []; st.lastPlay = -1; st.phase = 'play';
            if (st.ranks) { // l'échange : le Clochard donne ses meilleures cartes au Président, qui lui rend ses plus faibles
                const pairs = st.n === 4 ? [[0, 3, 2], [1, 2, 1]] : [[0, 2, 2]];
                pairs.forEach(([a, b, k]) => {
                    const top = st.ranks[a], bot = st.ranks[b]; if (top == null || bot == null) return;
                    const best = st.hands[bot].sort((x, y) => pv(y) - pv(x)).splice(0, k), low = st.hands[top].sort((x, y) => pv(x) - pv(y)).splice(0, k);
                    st.hands[top].push(...best); st.hands[bot].push(...low);
                    log(st, i18n('{name} donne {cards} à {other}, qui rend {back}.', {name: nm(st, bot), cards: best.map(c => cardName(c)).join(` ${i18n('et', {ctx: 'liste'})} `), other: nm(st, top), back: low.map(c => cardName(c)).join(` ${i18n('et', {ctx: 'liste'})} `)}));
                });
                st.turn = st.ranks[st.n - 1];
            } else st.turn = st.hands.findIndex(h => h.some(c => c.s === 3 && c.r === 3)); // la première fois : le 3 de trèfle commence
            st.hands.forEach(h => h.sort((x, y) => pv(x) - pv(y) || x.s - y.s));
        },
        active: (st, p) => st.hands[p].length > 0,
        legal(st) {
            if (st.phase !== 'play') return [];
            const h = st.hands[st.turn], groups = {}; h.forEach(c => { (groups[pv(c)] = groups[pv(c)] || []).push(c); });
            const out = [];
            Object.entries(groups).forEach(([v, g]) => {
                v = Number(v);
                if (!st.cur) { for (let k = 1; k <= g.length; k++) out.push({t: 'play', cards: g.slice(0, k).map(c => c.i)}); }
                else if (g.length >= st.cur.count && v > st.cur.val) out.push({t: 'play', cards: g.slice(0, st.cur.count).map(c => c.i)});
            });
            if (st.cur) out.push({t: 'pass'});
            return out;
        },
        nextActive(st, p) { for (let k = 1; k <= st.n; k++) { const q = (p + k) % st.n; if (this.active(st, q) && !st.passed.includes(q)) return q; } return -1; },
        clear(st, lead) { st.cur = null; st.passed = []; let p = lead; if (!this.active(st, p)) { for (let k = 1; k <= st.n; k++) { const q = (lead + k) % st.n; if (this.active(st, q)) { p = q; break; } } } st.turn = p; },
        play(st, a) {
            const p = st.turn, h = st.hands[p];
            if (a.t === 'pass') {
                if (!st.cur) return {ok: false, msg: i18n('Tu commences : pose une ou plusieurs cartes de même valeur.')};
                st.passed.push(p); log(st, i18n('{name} passe.', {name: nm(st, p)}));
                const q = this.nextActive(st, p);
                if (q < 0 || q === st.lastPlay || (st.passed.length && this.waiting(st) === 0)) { log(st, i18n('Tout le monde passe : {name} reprend la main.', {name: nm(st, st.lastPlay)})); this.clear(st, st.lastPlay); }
                else st.turn = q;
                return {ok: true};
            }
            if (a.t !== 'play') return {ok: false};
            const ids = [...new Set(a.cards || [])], cards = ids.map(i => h.find(c => c.i === i));
            if (!cards.length || cards.some(c => !c)) return {ok: false, msg: i18n('Choisis des cartes de ta main.')};
            if (cards.some(c => pv(c) !== pv(cards[0]))) return {ok: false, msg: i18n('Les cartes jouées ensemble doivent avoir la même valeur.')};
            if (st.cur && cards.length !== st.cur.count) return {ok: false, msg: i18n('Il faut poser {cards} à la fois.', {cards: plur(st.cur.count, 'carte', 'cartes')})};
            if (st.cur && pv(cards[0]) <= st.cur.val) return {ok: false, msg: i18n('Il faut une valeur plus forte (le 2 est la plus forte, puis l’As).')};
            cards.forEach(c => h.splice(h.indexOf(c), 1));
            st.cur = {count: cards.length, val: pv(cards[0]), cards: cards.slice(), by: p}; st.lastPlay = p;
            log(st, cards.length > 1 ? i18n('{name} pose {n} × {rank}.', {name: nm(st, p), n: String(cards.length), rank: cards[0].r >= 11 ? i18n(RANK_NAME[cards[0].r] + 's', {ctx: 'carte'}) : rn(cards[0].r)}) : i18n('{name} pose {rank}.', {name: nm(st, p), rank: rn(cards[0].r)}));
            if (!h.length) { st.out.push(p); log(st, i18n('{name} n’a plus de cartes : {title} !', {name: nm(st, p), title: i18n(TITLES[st.n][st.out.length - 1])})); }
            const left = st.hands.map((x, q) => q).filter(q => this.active(st, q));
            if (left.length <= 1) { st.out.push(...left); return this.endManche(st); }
            if (cards[0].r === 2) { log(st, i18n('Un 2 : personne ne peut faire mieux, le pli est fini.')); this.clear(st, p); return {ok: true}; }
            const q = this.nextActive(st, p);
            if (q < 0 || q === p) { log(st, i18n('Personne ne peut suivre : {name} reprend la main.', {name: nm(st, p)})); this.clear(st, p); } else st.turn = q;
            return {ok: true};
        },
        waiting(st) { return st.hands.map((x, q) => q).filter(q => this.active(st, q) && !st.passed.includes(q) && q !== st.lastPlay).length; },
        endManche(st) {
            st.ranks = st.out.slice(); const pts = Array(st.n).fill(0);
            st.ranks.forEach((p, k) => { pts[p] = st.n - 1 - k; }); pts.forEach((v, p) => { st.total[p] += v; }); st.lastScore = pts; st.phase = 'end';
            log(st, st.ranks.map((p, k) => i18n('{title} : {name}', {title: i18n(TITLES[st.n][k]), name: nm(st, p)})).join(' · '));
            if (st.manche >= this.manches) { const hi = Math.max(...st.total); st.winner = st.total.indexOf(hi); st.over = true; st.phase = 'over'; log(st, i18n('{name} gagne la partie.', {name: nm(st, st.winner)})); }
            return {ok: true};
        },
        ai(st, lvl, Rr) {
            const L = this.legal(st), plays = L.filter(a => a.t === 'play'); if (!plays.length) return L[0];
            if (lvl === 'facile') return Rr() < 0.2 && st.cur ? {t: 'pass'} : pickIn(Rr, plays);
            const h = st.hands[st.turn], cnt = v => h.filter(c => pv(c) === v).length;
            const sc = a => { const c = byId(st, a.cards[0]), v = pv(c), n = a.cards.length; let s = -v * 3; if (n < cnt(v)) s -= 12; if (!st.cur) s += n * 4; if (lvl === 'difficile' && v >= 11 && h.length > 4) s -= 30; return s; };
            const best = plays.slice().sort((x, y) => sc(y) - sc(x))[0];
            if (st.cur && lvl === 'difficile' && pv(byId(st, best.cards[0])) >= 11 && h.length > 5 && st.cur.val < 9) return {t: 'pass'};
            return best;
        },
        titles: n => TITLES[n],
        score: st => st.total,
    };

    /* ═══════════ 5. 🃏 Belote (à 4, en 2 équipes) ═══════════ */
    const B_TRUMP = {11: 20, 9: 14, 1: 11, 10: 10, 13: 4, 12: 3, 8: 0, 7: 0}, B_PLAIN = {1: 11, 10: 10, 13: 4, 12: 3, 11: 2, 9: 0, 8: 0, 7: 0};
    const B_TORD = [7, 8, 12, 13, 10, 1, 9, 11], B_PORD = [7, 8, 9, 11, 12, 13, 10, 1], B_SEQ = [7, 8, 9, 10, 11, 12, 13, 1];
    const bStrength = (c, trump) => (c.s === trump ? 100 + B_TORD.indexOf(c.r) : B_PORD.indexOf(c.r));
    const bPts = (c, trump) => (c.s === trump ? B_TRUMP[c.r] : B_PLAIN[c.r]);
    const team = p => p % 2;
    /** les annonces d'une main : carrés (Valets 200, 9 150, As 10 Roi Dame 100), puis suites dans les cartes qui restent (3 : 20, 4 : 50, 5 et plus : 100) */
    function belAnnonces(hand, trump) {
        const out = [], used = new Set();
        [[11, 200, 'Carré de Valets'], [9, 150, 'Carré de 9'], [1, 100, 'Carré d’As'], [10, 100, 'Carré de 10'], [13, 100, 'Carré de Rois'], [12, 100, 'Carré de Dames']].forEach(([r, v, label]) => {
            const g = hand.filter(c => c.r === r); if (g.length === 4) { out.push({v, label: i18n(label), high: 20 + B_SEQ.indexOf(r), trump: false}); g.forEach(c => used.add(c.i)); }
        });
        for (let s = 0; s < 4; s++) {
            const has = B_SEQ.map(r => hand.some(c => c.s === s && c.r === r && !used.has(c.i)));
            let k = 0; while (k < 8) { if (!has[k]) { k++; continue; } let e = k; while (e + 1 < 8 && has[e + 1]) e++; const len = e - k + 1;
                if (len >= 3) out.push({v: len >= 5 ? 100 : len === 4 ? 50 : 20, label: len >= 5 ? i18n('Cent ({n} à la suite) à {sym}', {n: String(len), sym: SUIT[s]}) : len === 4 ? i18n('Cinquante à {sym}', {sym: SUIT[s]}) : i18n('Tierce à {sym}', {sym: SUIT[s]}), high: e, trump: s === trump});
                k = e + 1; }
        }
        return out;
    }
    const belote = {
        min: 4, max: 4, target: 501, teams: true,
        deal(st) {
            const d = shuffle(deck32(), R(st)); st.dealer = ((st.manche - 1) + (st.redeal || 0)) % 4;
            st.hands = [[], [], [], []];
            for (let k = 0; k < 5; k++) for (let q = 1; q <= 4; q++) st.hands[(st.dealer + q) % 4].push(d.shift());
            st.turned = d.shift(); st.rest = d; st.trump = -1; st.taker = -1; st.phase = 'bid1'; st.turn = (st.dealer + 1) % 4; st.bids = 0;
            st.won = [[], []]; st.tricks = 0; st.lastTrick = null; st.ann = null; st.beloteP = -1; st.trick = []; st.trickCount = [0, 0];
        },
        legal(st) {
            const h = st.hands[st.turn];
            if (st.phase === 'bid1') return [{t: 'take', s: st.turned.s}, {t: 'pass'}];
            if (st.phase === 'bid2') return [0, 1, 2, 3].filter(s => s !== st.turned.s).map(s => ({t: 'take', s})).concat([{t: 'pass'}]);
            if (st.phase !== 'play') return [];
            return this.allowed(st, h, st.turn).map(c => ({t: 'play', c: c.i}));
        },
        /** la carte la plus forte du pli et qui la tient */
        master(st) { if (!st.trick.length) return null; const s = st.trick[0].c.s; let best = null; st.trick.forEach(x => { if (x.c.s !== s && x.c.s !== st.trump) return; if (!best || bStrength(x.c, st.trump) > bStrength(best.c, st.trump)) best = x; }); return best; },
        allowed(st, h, p) {
            if (!st.trick.length) return h.slice();
            const s = st.trick[0].c.s, T = st.trump, m = this.master(st), trumpsIn = st.trick.filter(x => x.c.s === T);
            const topT = trumpsIn.length ? Math.max(...trumpsIn.map(x => bStrength(x.c, T))) : -1;
            const follow = h.filter(c => c.s === s);
            if (follow.length) {
                if (s !== T) return follow;
                const over = follow.filter(c => bStrength(c, T) > topT); return over.length ? over : follow; // à l'atout : monter si on peut
            }
            if (m && team(m.p) === team(p)) return h.slice(); // le partenaire est maître : on fait ce qu'on veut
            const trumps = h.filter(c => c.s === T);
            if (trumps.length) { const over = trumps.filter(c => bStrength(c, T) > topT); return over.length ? over : trumps; }
            return h.slice();
        },
        take(st, p, s) {
            st.trump = s; st.taker = p; const h = st.hands[p]; h.push(st.turned);
            h.push(st.rest.shift(), st.rest.shift());
            for (let q = 1; q <= 4; q++) { const x = (st.dealer + q) % 4; if (x !== p) for (let k = 0; k < 3; k++) st.hands[x].push(st.rest.shift()); }
            log(st, i18n('{name} prend à {sym} {suit}.', {name: nm(st, p), sym: SUIT[s], suit: sn(s)}));
            // belote-rebelote : le Roi et la Dame d'atout dans la même main
            st.beloteP = st.hands.findIndex(hh => hh.some(c => c.s === s && c.r === 13) && hh.some(c => c.s === s && c.r === 12));
            // les annonces : seule l'équipe qui a la meilleure les marque toutes
            const all = st.hands.map(hh => belAnnonces(hh, s)), best = [0, 1].map(t => all.filter((a, q) => team(q) === t).flat().sort((x, y) => y.v - x.v || y.high - x.high || (y.trump - x.trump))[0] || null);
            let wt = -1; if (best[0] && best[1]) wt = best[0].v !== best[1].v ? (best[0].v > best[1].v ? 0 : 1) : best[0].high !== best[1].high ? (best[0].high > best[1].high ? 0 : 1) : best[0].trump ? 0 : best[1].trump ? 1 : -1; else wt = best[0] ? 0 : best[1] ? 1 : -1;
            st.ann = {list: all, team: wt, pts: wt < 0 ? 0 : sum(all.filter((a, q) => team(q) === wt).flat().map(a => a.v))};
            if (wt >= 0) all.forEach((a, q) => { if (team(q) === wt && a.length) log(st, i18n('{name} annonce : {list}.', {name: nm(st, q), list: a.map(x => x.label).join(', ')})); });
            st.phase = 'play'; trickStart(st, (st.dealer + 1) % 4);
            st.hands.forEach(hh => hh.sort((x, y) => (x.s === s) - (y.s === s) || x.s - y.s || bStrength(x, s) - bStrength(y, s)));
        },
        play(st, a) {
            const p = st.turn;
            if (st.phase === 'bid1' || st.phase === 'bid2') {
                if (a.t === 'take') { if (st.phase === 'bid1' ? a.s !== st.turned.s : (a.s === st.turned.s || !(a.s >= 0 && a.s < 4))) return {ok: false, msg: i18n(st.phase === 'bid1' ? 'Au premier tour, on prend dans la couleur de la carte retournée.' : 'Au second tour, on choisit une autre couleur.')}; this.take(st, p, a.s); return {ok: true}; }
                if (a.t !== 'pass') return {ok: false};
                log(st, i18n('{name} passe.', {name: nm(st, p)})); st.bids++; st.turn = (p + 1) % 4;
                if (st.bids === 4 && st.phase === 'bid1') { st.phase = 'bid2'; st.bids = 0; }
                else if (st.bids === 4) { log(st, i18n('Personne ne prend : on redistribue.')); st.redeal = (st.redeal || 0) + 1; this.deal(st); }
                return {ok: true};
            }
            if (a.t !== 'play') return {ok: false};
            const h = st.hands[p], c = h.find(x => x.i === a.c);
            if (!c) return {ok: false, msg: i18n('Cette carte n’est pas dans ta main.')};
            if (!this.allowed(st, h, p).includes(c)) return {ok: false, msg: this.why(st, h, p)};
            h.splice(h.indexOf(c), 1); st.trick.push({p, c});
            if (st.beloteP === p && c.s === st.trump && (c.r === 13 || c.r === 12)) log(st, i18n(h.some(x => x.s === st.trump && (x.r === 13 || x.r === 12)) ? '{name} : « Belote ! »' : '{name} : « Rebelote ! »', {name: nm(st, p)}));
            if (st.trick.length < 4) { st.turn = (p + 1) % 4; return {ok: true}; }
            const w = this.master(st).p, pts = sum(st.trick.map(x => bPts(x.c, st.trump)));
            st.won[team(w)].push(...st.trick.map(x => x.c)); st.trickCount[team(w)]++; st.tricks++;
            st.lastTrick = {cards: st.trick.slice(), winner: w, pts}; log(st, i18n('{name} ramasse le pli ({points}).', {name: nm(st, w), points: plur(pts, 'point', 'points')}));
            if (st.tricks === 8) { st.trick = []; return this.endManche(st, w); }
            trickStart(st, w); return {ok: true};
        },
        why(st, h, p) {
            const s = st.trick[0].c.s; if (h.some(c => c.s === s)) return s === st.trump ? i18n('À l’atout, il faut monter (jouer plus fort) si tu peux.') : i18n('Il faut fournir du {suit}.', {suit: sn(s)});
            return i18n('Tu n’as pas de la couleur demandée : il faut couper avec un atout (et monter si un atout est déjà posé), sauf si ton partenaire est maître.');
        },
        endManche(st, last) {
            const T = st.trump, card = [0, 1].map(t => sum(st.won[t].map(c => bPts(c, T))));
            card[team(last)] += 10; // dix de der
            const capot = st.trickCount.findIndex(n => n === 8);
            if (capot >= 0) { card[capot] = 250; card[1 - capot] = 0; }
            const bel = [0, 0]; if (st.beloteP >= 0) bel[team(st.beloteP)] = 20;
            const ann = [0, 0]; if (st.ann?.team >= 0) ann[st.ann.team] = st.ann.pts;
            const tt = team(st.taker), tot = [0, 1].map(t => card[t] + bel[t] + ann[t]);
            let pts;
            if (tot[tt] > tot[1 - tt]) { pts = tot; log(st, i18n('L’équipe qui a pris fait son contrat : {a} contre {b}.', {a: String(tot[tt]), b: String(tot[1 - tt])})); }
            else { pts = [0, 0]; pts[1 - tt] = (capot >= 0 ? 250 : 162) + ann[0] + ann[1] + bel[1 - tt]; pts[tt] = bel[tt]; log(st, i18n('L’équipe qui a pris est « dedans » ({a} contre {b}) : tout va aux adversaires.', {a: String(tot[tt]), b: String(tot[1 - tt])})); }
            st.lastScore = pts.slice(); st.teamTotal = st.teamTotal || [0, 0]; st.teamTotal[0] += pts[0]; st.teamTotal[1] += pts[1];
            st.total = [st.teamTotal[0], st.teamTotal[1], st.teamTotal[0], st.teamTotal[1]]; st.phase = 'end'; st.detail = {card, bel, ann, capot};
            if (Math.max(...st.teamTotal) >= this.target) { const wt = st.teamTotal[0] >= st.teamTotal[1] ? 0 : 1; st.winner = wt; st.winTeam = wt; st.over = true; st.phase = 'over'; log(st, i18n('L’équipe de {a} et {b} gagne la partie.', wt === 0 ? {a: nm(st, 0), b: nm(st, 2)} : {a: nm(st, 1), b: nm(st, 3)})); }
            return {ok: true};
        },
        handValue(h, s, extra) { const all = extra ? h.concat([extra]) : h; let v = 0; all.forEach(c => { if (c.s === s) v += B_TRUMP[c.r] + 5; else if (c.r === 1) v += 11; else if (c.r === 10 && all.some(x => x.s === c.s && x.r === 1)) v += 5; }); return v; },
        ai(st, lvl, Rr) {
            const p = st.turn, h = st.hands[p], L = this.legal(st);
            if (st.phase === 'bid1' || st.phase === 'bid2') {
                const need = lvl === 'facile' ? 55 + Rr() * 25 : lvl === 'moyen' ? 62 : 58;
                const cand = L.filter(a => a.t === 'take').map(a => [a, this.handValue(h, a.s, st.turned) + (lvl === 'difficile' && team(p) === team(st.dealer) && st.phase === 'bid1' ? 4 : 0)]).sort((x, y) => y[1] - x[1])[0];
                return cand && cand[1] >= need ? cand[0] : {t: 'pass'};
            }
            if (lvl === 'facile' || L.length === 1) return pickIn(Rr, L);
            const T = st.trump, cards = L.map(a => byId(st, a.c)), m = this.master(st), seen = new Set([...st.won.flat(), ...st.trick.map(x => x.c)].map(c => c.i));
            const pick = c => L[cards.indexOf(c)];
            const lowest = l => l.slice().sort((x, y) => bPts(x, T) - bPts(y, T) || bStrength(x, T) - bStrength(y, T))[0];
            if (!st.trick.length) {
                const myTeamTook = team(p) === team(st.taker), trumps = cards.filter(c => c.s === T);
                const jack = trumps.find(c => c.r === 11); if (myTeamTook && jack) return pick(jack);
                if (lvl === 'difficile') { // une carte maîtresse (la plus forte qui reste dans sa couleur)
                    const masterCard = cards.find(c => c.s !== T && deck32().filter(x => x.s === c.s && !seen.has(x.i) && !h.some(y => y.i === x.i)).every(x => bStrength(x, T) < bStrength(c, T)));
                    if (masterCard) return pick(masterCard);
                }
                const ace = cards.find(c => c.s !== T && c.r === 1); if (ace) return pick(ace);
                return pick(lowest(cards.filter(c => c.s !== T).length ? cards.filter(c => c.s !== T) : cards));
            }
            const partnerWins = m && team(m.p) === team(p), last = st.trick.length === 3;
            if (partnerWins && (last || lvl === 'difficile' && bStrength(m.c, T) >= 100 + 5 || m.c.s !== T && m.c.r === 1)) { // charger le pli du partenaire
                const rich = cards.filter(c => c.s !== T || cards.every(x => x.s === T)).sort((x, y) => bPts(y, T) - bPts(x, T)); if (rich.length) return pick(rich[0]);
            }
            const winners = cards.filter(c => !m || (c.s === T ? (m.c.s !== T || bStrength(c, T) > bStrength(m.c, T)) : c.s === m.c.s && m.c.s !== T && bStrength(c, T) > bStrength(m.c, T)));
            if (!partnerWins && winners.length) return pick(winners.slice().sort((x, y) => bStrength(x, T) - bStrength(y, T))[0]);
            return pick(lowest(cards));
        },
        score: st => st.total,
        annonces: belAnnonces,
    };

    /* ═══════════ 6. 🃟 Tarot à 4 ═══════════ */
    const isOudler = c => (c.s === 4 && (c.r === 1 || c.r === 21)) || c.s === 5;
    const tHalf = c => (isOudler(c) ? 9 : c.s >= 4 ? 1 : c.r === 14 ? 9 : c.r === 13 ? 7 : c.r === 12 ? 5 : c.r === 11 ? 3 : 1); // en demi-points
    const tPower = c => (c.s === 5 ? -1 : c.s === 4 ? 100 + c.r : c.r);
    const CONTRACTS = ['', 'Prise', 'Garde', 'Garde sans le chien', 'Garde contre le chien'], MULT = [0, 1, 2, 4, 6], NEED = [56, 51, 41, 36];
    const tarot = {
        min: 4, max: 4, manches: 4,
        deal(st) {
            for (let tries = 0; tries < 20; tries++) {
                const d = shuffle(deckTarot(), R(st)); st.dealer = (st.manche - 1 + (st.redeal || 0)) % 4; st.hands = [[], [], [], []];
                st.chien = d.splice(0, 6); d.forEach((c, j) => st.hands[(st.dealer + 1 + j) % 4].push(c));
                // petit sec (le Petit seul atout, sans l'Excuse) : on redistribue
                if (!st.hands.some(h => h.some(c => c.s === 4 && c.r === 1) && h.filter(c => c.s >= 4).length === 1)) break;
                log(st, i18n('Petit sec : on redistribue.'));
            }
            st.hands.forEach(h => this.sort(h)); st.phase = 'bid'; st.turn = (st.dealer + 1) % 4; st.bid = 0; st.taker = -1; st.spoken = 0;
            st.won = [[], []]; st.tricks = 0; st.trick = []; st.lastTrick = null; st.ecart = []; st.excuseDue = null; st.pab = 0;
        },
        sort: h => h.sort((x, y) => (x.s === 5 ? 4.5 : x.s) - (y.s === 5 ? 4.5 : y.s) || x.r - y.r),
        camp: (st, p) => (p === st.taker ? 0 : 1),
        legal(st) {
            const h = st.hands[st.turn];
            if (st.phase === 'bid') return [{t: 'pass'}].concat([1, 2, 3, 4].filter(v => v > st.bid).map(v => ({t: 'bid', v})));
            if (st.phase === 'ecart') return [{t: 'discard', cards: this.ecartChoice(st, st.turn, 'moyen')}];
            if (st.phase !== 'play') return [];
            return this.allowed(st, h).map(c => ({t: 'play', c: c.i}));
        },
        allowed(st, h) {
            const lead = st.trick.find(x => x.c.s !== 5); if (!lead) return h.slice();
            const s = lead.c.s, ex = h.filter(c => c.s === 5), follow = h.filter(c => c.s === s);
            const topT = Math.max(0, ...st.trick.filter(x => x.c.s === 4).map(x => x.c.r));
            if (follow.length) { if (s !== 4) return follow.concat(ex); const over = follow.filter(c => c.r > topT); return (over.length ? over : follow).concat(ex); }
            const trumps = h.filter(c => c.s === 4);
            if (trumps.length) { const over = trumps.filter(c => c.r > topT); return (over.length ? over : trumps).concat(ex); }
            return h.slice();
        },
        okEcart: (c, h) => !(c.s === 4 || c.s === 5 || c.r === 14) || (c.s === 4 && !isOudler(c) && h.filter(x => !(x.s >= 4 || x.r === 14)).length < 6),
        play(st, a) {
            const p = st.turn;
            if (st.phase === 'bid') {
                if (a.t === 'bid') { if (!(a.v > st.bid && a.v <= 4)) return {ok: false, msg: i18n('Il faut annoncer plus fort que le contrat déjà demandé.')}; st.bid = a.v; st.taker = p; log(st, i18n('{name} : {contract}.', {name: nm(st, p), contract: i18n(CONTRACTS[a.v])})); }
                else if (a.t === 'pass') log(st, i18n('{name} passe.', {name: nm(st, p)})); else return {ok: false};
                st.spoken++; st.turn = (p + 1) % 4;
                if (st.spoken === 4) {
                    if (!st.bid) { log(st, i18n('Tout le monde passe : on redistribue.')); st.redeal = (st.redeal || 0) + 1; this.deal(st); return {ok: true}; }
                    st.mult = MULT[st.bid];
                    if (st.bid <= 2) { st.hands[st.taker].push(...st.chien); this.sort(st.hands[st.taker]); log(st, i18n('Le chien : {cards}.', {cards: st.chien.map(c => cardName(c, 'tarot')).join(', ')})); st.phase = 'ecart'; st.turn = st.taker; }
                    else { st.ecart = st.chien.slice(); st.chienTo = st.bid === 3 ? 0 : 1; log(st, i18n(st.bid === 3 ? 'Le chien va au preneur, sans être regardé.' : 'Le chien va à la défense, sans être regardé.')); st.phase = 'play'; trickStart(st, (st.dealer + 1) % 4); }
                }
                return {ok: true};
            }
            if (st.phase === 'ecart') {
                const h = st.hands[p], ids = [...new Set(a.cards || [])], cards = ids.map(i => h.find(c => c.i === i));
                if (a.t !== 'discard' || cards.length !== 6 || cards.some(c => !c)) return {ok: false, msg: i18n('Choisis 6 cartes à mettre à l’écart.')};
                if (cards.some(c => !this.okEcart(c, h))) return {ok: false, msg: i18n('Pas de Roi, d’Excuse, ni de bout à l’écart ; un atout seulement si tu ne peux pas faire autrement.')};
                cards.forEach(c => h.splice(h.indexOf(c), 1)); st.ecart = cards; st.chienTo = 0;
                const shownT = cards.filter(c => c.s === 4); if (shownT.length) log(st, i18n('{name} met à l’écart {cards} (montré).', {name: nm(st, p), cards: shownT.map(c => cardName(c, 'tarot')).join(', ')}));
                log(st, i18n('{name} a fait son écart.', {name: nm(st, p)})); st.phase = 'play'; trickStart(st, (st.dealer + 1) % 4); return {ok: true};
            }
            if (a.t !== 'play') return {ok: false};
            const h = st.hands[p], c = h.find(x => x.i === a.c);
            if (!c) return {ok: false, msg: i18n('Cette carte n’est pas dans ta main.')};
            if (!this.allowed(st, h).includes(c)) return {ok: false, msg: this.why(st, h)};
            h.splice(h.indexOf(c), 1); st.trick.push({p, c});
            if (st.trick.length < 4) { st.turn = (p + 1) % 4; return {ok: true}; }
            const w = this.winnerOf(st.trick), lastTrick = st.tricks === 17;
            const ex = st.trick.find(x => x.c.s === 5);
            const take = st.trick.filter(x => x !== ex || (lastTrick && false)).map(x => x.c);
            st.won[this.camp(st, w)].push(...take);
            if (ex) { st.won[this.camp(st, ex.p)].push(ex.c); if (this.camp(st, ex.p) !== this.camp(st, w)) st.excuseDue = this.camp(st, w); }
            if (lastTrick) { const petit = st.trick.find(x => x.c.s === 4 && x.c.r === 1); if (petit) { st.pab = this.camp(st, w) === 0 ? 1 : -1; log(st, i18n(this.camp(st, w) === 0 ? 'Le Petit au bout pour le preneur !' : 'Le Petit au bout pour la défense !')); } }
            st.tricks++; st.lastTrick = {cards: st.trick.slice(), winner: w}; log(st, i18n('{name} ramasse le pli.', {name: nm(st, w)}));
            if (st.tricks === 18) { st.trick = []; return this.endManche(st); }
            trickStart(st, w); return {ok: true};
        },
        winnerOf(trick) { const lead = trick.find(x => x.c.s !== 5); if (!lead) return trick[0].p; const s = lead.c.s; let best = lead; trick.forEach(x => { if (x.c.s === 4 && (best.c.s !== 4 || x.c.r > best.c.r)) best = x; else if (x.c.s === s && best.c.s === s && x.c.r > best.c.r) best = x; }); return best.p; },
        why(st, h) { const lead = st.trick.find(x => x.c.s !== 5), s = lead.c.s; if (h.some(c => c.s === s)) return s === 4 ? i18n('À l’atout, il faut monter (jouer un atout plus fort) si tu peux.') : i18n('Il faut fournir du {suit}.', {suit: sn(s)}); return i18n('Tu n’as pas la couleur demandée : il faut couper avec un atout, et monter si un atout est déjà posé. (L’Excuse se joue quand tu veux.)'); },
        endManche(st) {
            const half = [0, 1].map(t => sum(st.won[t].map(tHalf)));
            half[st.chienTo || 0] += sum(st.ecart.map(tHalf));
            if (st.excuseDue != null) { const owner = 1 - st.excuseDue; half[owner] -= 1; half[st.excuseDue] += 1; } // l'Excuse s'échange contre une petite carte
            const oud = st.won[0].concat(st.chienTo === 0 ? st.ecart : []).filter(isOudler).length, need = NEED[oud];
            const pts = half[0] / 2, diff = pts - need, win = diff >= 0, base = (25 + Math.round(Math.abs(diff))) * st.mult * (win ? 1 : -1);
            const s = base + st.pab * 10 * st.mult;
            const res = [0, 0, 0, 0].map((v, p) => (p === st.taker ? 3 * s : -s));
            res.forEach((v, p) => { st.total[p] += v; }); st.lastScore = res; st.phase = 'end';
            st.detail = {pts, need, oud, contract: i18n(CONTRACTS[st.bid]), win, mult: st.mult, pab: st.pab};
            log(st, i18n(win ? '{name} réussit sa {contract} : {pts} points pour {need} demandés ({bouts}).' : '{name} chute sa {contract} : {pts} points pour {need} demandés ({bouts}).', {name: nm(st, st.taker), contract: i18n(CONTRACTS[st.bid]), pts: String(pts), need: String(need), bouts: plur(oud, 'bout', 'bouts')}));
            if (st.manche >= this.manches) { const hi = Math.max(...st.total); st.winner = st.total.indexOf(hi); st.over = true; st.phase = 'over'; log(st, i18n('{name} gagne la partie.', {name: nm(st, st.winner)})); }
            return {ok: true};
        },
        handScore(h) { let v = 0; h.forEach(c => { if (c.s === 5) v += 8; else if (c.s === 4) { v += c.r === 21 ? 10 : c.r === 1 ? (h.filter(x => x.s === 4).length >= 5 ? 8 : 2) : 2 + (c.r >= 16 ? 2 : 0); } else if (c.r === 14) v += 6; else if (c.r === 13) v += 3; }); for (let s = 0; s < 4; s++) if (!h.some(c => c.s === s)) v += 5; return v; },
        ecartChoice(st, p, lvl) {
            const h = st.hands[p].slice(), cand = h.filter(c => this.okEcart(c, h));
            const len = s => h.filter(c => c.s === s).length;
            // les atouts en dernier ; d'abord les couleurs courtes (pour pouvoir couper), et les cartes qui valent des points (gardées à l'abri)
            return cand.sort((x, y) => (x.s === 4) - (y.s === 4) || (lvl === 'facile' ? 0 : len(x.s) - len(y.s)) || tHalf(y) - tHalf(x) || x.r - y.r).slice(0, 6).map(c => c.i);
        },
        ai(st, lvl, Rr) {
            const p = st.turn, h = st.hands[p], L = this.legal(st);
            if (st.phase === 'bid') {
                const v = this.handScore(h) + (lvl === 'facile' ? Rr() * 16 - 8 : 0), want = v >= 81 ? 4 : v >= 71 ? 3 : v >= 56 ? 2 : v >= (lvl === 'difficile' ? 42 : 40) ? 1 : 0;
                return want > st.bid ? {t: 'bid', v: want} : {t: 'pass'};
            }
            if (st.phase === 'ecart') return {t: 'discard', cards: this.ecartChoice(st, p, lvl)};
            if (lvl === 'facile' || L.length === 1) { const noPetit = L.filter(a => !(byId(st, a.c).s === 4 && byId(st, a.c).r === 1)); return pickIn(Rr, lvl === 'facile' || !noPetit.length ? L : noPetit); }
            const cards = L.map(a => byId(st, a.c)), pick = c => L[cards.indexOf(c)];
            const myCamp = this.camp(st, p), petit = cards.find(c => c.s === 4 && c.r === 1), ex = cards.find(c => c.s === 5);
            const keep = cards.filter(c => c !== petit && c !== ex), pool = keep.length ? keep : cards;
            if (!st.trick.length) {
                if (ex && h.length > 2 && lvl === 'difficile' && h.filter(c => c.s === 4).length < 3) return pick(ex);
                const king = pool.find(c => c.s < 4 && c.r === 14); if (king && myCamp === 1) return pick(king);
                if (myCamp === 0) { const big = pool.filter(c => c.s === 4).sort((x, y) => y.r - x.r)[0]; if (big && big.r >= 15) return pick(big); }
                return pick(pool.slice().sort((x, y) => (x.s === 4) - (y.s === 4) || tHalf(x) - tHalf(y) || x.r - y.r)[0]);
            }
            const w = this.winnerOf(st.trick), friendly = this.camp(st, w) === myCamp, lastToPlay = st.trick.length === 3;
            if (petit && (lastToPlay && !st.trick.some(x => x.c.s === 4) && cards.every(c => c.s === 4 || c.s === 5))) return pick(petit); // le Petit gagne s'il est seul atout du pli
            if (friendly && (lastToPlay || lvl === 'difficile')) { const rich = pool.filter(c => c.s < 4).sort((x, y) => tHalf(y) - tHalf(x)); if (rich.length) return pick(rich[0]); }
            const beats = pool.filter(c => this.winnerOf(st.trick.concat([{p, c}])) === p);
            if (!friendly && beats.length && (lastToPlay || st.trick.some(x => tHalf(x.c) > 1) || lvl === 'difficile')) return pick(beats.sort((x, y) => tPower(x) - tPower(y))[0]);
            if (ex && h.length <= 3 && h.length > 1) return pick(ex);
            return pick(pool.slice().sort((x, y) => tHalf(x) - tHalf(y) || tPower(x) - tPower(y))[0]);
        },
        score: st => st.total,
        CONTRACTS, isOudler, tHalf,
    };

    /* ═══════════ 7. 🀄 Rami (gin) à deux ═══════════ */
    const ginVal = c => Math.min(10, c.r);
    /** toutes les combinaisons possibles d'une main : brelans, carrés, suites de 3 cartes et plus dans une même couleur (As en bas) */
    function allMelds(hand) {
        const out = [];
        for (let r = 1; r <= 13; r++) { const g = hand.filter(c => c.r === r); if (g.length >= 3) { if (g.length === 4) { out.push(g.slice()); for (let k = 0; k < 4; k++) out.push(g.filter((_, j) => j !== k)); } else out.push(g.slice()); } }
        for (let s = 0; s < 4; s++) { const g = hand.filter(c => c.s === s).sort((a, b) => a.r - b.r); for (let a = 0; a < g.length; a++) for (let b = a + 2; b < g.length; b++) { const run = g.slice(a, b + 1); if (run.every((c, j) => !j || c.r === run[j - 1].r + 1)) out.push(run); else break; } }
        return out;
    }
    /** le meilleur rangement d'une main : {melds, dead, dw (points des cartes seules)} */
    function bestMelds(hand) {
        const melds = allMelds(hand); let best = {melds: [], dead: hand.slice(), dw: sum(hand.map(ginVal))};
        const rec = (k, used, chosen) => {
            const dead = hand.filter(c => !used.has(c.i)), dw = sum(dead.map(ginVal));
            if (dw < best.dw) best = {melds: chosen.slice(), dead, dw};
            for (let j = k; j < melds.length; j++) { const m = melds[j]; if (m.some(c => used.has(c.i))) continue; m.forEach(c => used.add(c.i)); chosen.push(m); rec(j + 1, used, chosen); chosen.pop(); m.forEach(c => used.delete(c.i)); }
        };
        rec(0, new Set(), []); return best;
    }
    const fitsMeld = (m, c) => { const set = m.every(x => x.r === m[0].r); if (set) return m.length < 4 && c.r === m[0].r; const s = m[0].s, lo = Math.min(...m.map(x => x.r)), hi = Math.max(...m.map(x => x.r)); return c.s === s && (c.r === lo - 1 || c.r === hi + 1); };
    const rami = {
        min: 2, max: 2, target: 100,
        deal(st) {
            const d = shuffle(deck52(), R(st)); st.hands = [[], []];
            for (let k = 0; k < 10; k++) for (let p = 0; p < 2; p++) st.hands[p].push(d.shift());
            st.discard = [d.shift()]; st.stock = d; st.turn = (st.manche - 1) % 2; st.phase = 'draw'; st.took = -1; st.result = null;
        },
        legal(st) {
            if (st.phase === 'draw') return [{t: 'draw', from: 'stock'}].concat(st.discard.length ? [{t: 'draw', from: 'discard'}] : []);
            if (st.phase !== 'discard') return [];
            const h = st.hands[st.turn], out = [];
            h.forEach(c => { if (c.i === st.took) return; out.push({t: 'discard', c: c.i}); if (bestMelds(h.filter(x => x !== c)).dw <= 10) out.push({t: 'knock', c: c.i}); });
            return out;
        },
        play(st, a) {
            const p = st.turn, h = st.hands[p];
            if (st.phase === 'draw') {
                if (a.t !== 'draw') return {ok: false, msg: i18n('Prends d’abord une carte : dans la pioche ou sur la défausse.')};
                const c = a.from === 'discard' ? st.discard.pop() : st.stock.pop(); if (!c) return {ok: false, msg: i18n('Il n’y a rien là.')};
                h.push(c); st.took = a.from === 'discard' ? c.i : -1; st.phase = 'discard';
                log(st, a.from === 'discard' ? i18n('{name} prend {card} sur la défausse.', {name: nm(st, p), card: cardName(c)}) : i18n('{name} pioche.', {name: nm(st, p)})); return {ok: true, drawn: c.i};
            }
            if (st.phase !== 'discard' || (a.t !== 'discard' && a.t !== 'knock')) return {ok: false};
            const c = h.find(x => x.i === a.c); if (!c) return {ok: false, msg: i18n('Cette carte n’est pas dans ta main.')};
            if (c.i === st.took) return {ok: false, msg: i18n('On ne rejette pas la carte qu’on vient de prendre sur la défausse.')};
            const rest = h.filter(x => x !== c);
            if (a.t === 'knock' && bestMelds(rest).dw > 10) return {ok: false, msg: i18n('Pour frapper, tes cartes seules doivent faire 10 points ou moins.')};
            h.splice(h.indexOf(c), 1); st.discard.push(c);
            if (a.t === 'knock') return this.knock(st, p);
            log(st, i18n('{name} jette {card}.', {name: nm(st, p), card: cardName(c)}));
            if (st.stock.length <= 2) { st.result = {nul: true}; st.lastScore = [0, 0]; st.phase = 'end'; log(st, i18n('La pioche est presque vide : manche nulle.')); return {ok: true}; }
            st.turn = 1 - p; st.phase = 'draw'; st.took = -1; return {ok: true};
        },
        knock(st, p) {
            const q = 1 - p, K = bestMelds(st.hands[p]), D = bestMelds(st.hands[q]), gin = K.dw === 0;
            let dead = D.dead.slice(), laid = [];
            if (!gin) { const melds = K.melds.map(m => m.slice()); let again = true; while (again) { again = false; for (const c of dead.slice()) { const m = melds.find(x => fitsMeld(x, c)); if (m) { m.push(c); dead = dead.filter(x => x !== c); laid.push(c); again = true; } } } }
            const ddw = sum(dead.map(ginVal)), pts = [0, 0];
            if (gin) { pts[p] = 25 + ddw; log(st, i18n('{name} fait gin ! (+{n})', {name: nm(st, p), n: String(pts[p])})); }
            else if (K.dw < ddw) { pts[p] = ddw - K.dw; log(st, i18n('{name} frappe : {a} contre {b} (+{n}).', {name: nm(st, p), a: String(K.dw), b: String(ddw), n: String(pts[p])})); }
            else { pts[q] = K.dw - ddw + 25; log(st, i18n('{name} contre la frappe : {a} contre {b} (+{n}).', {name: nm(st, q), a: String(ddw), b: String(K.dw), n: String(pts[q])})); }
            st.result = {knocker: p, gin, K, D: {...D, dead}, laid: laid.map(c => c.i)};
            pts.forEach((v, k) => { st.total[k] += v; }); st.lastScore = pts; st.phase = 'end';
            if (Math.max(...st.total) >= this.target) { st.winner = st.total[0] >= st.total[1] ? 0 : 1; st.over = true; st.phase = 'over'; log(st, i18n('{name} gagne la partie.', {name: nm(st, st.winner)})); }
            return {ok: true};
        },
        ai(st, lvl, Rr) {
            const p = st.turn, h = st.hands[p], L = this.legal(st);
            if (st.phase === 'draw') {
                if (lvl === 'facile') return Rr() < 0.3 && st.discard.length ? {t: 'draw', from: 'discard'} : {t: 'draw', from: 'stock'};
                const top = st.discard[st.discard.length - 1]; if (!top) return {t: 'draw', from: 'stock'};
                const now = bestMelds(h).dw, withTop = Math.min(...h.map(c => bestMelds(h.filter(x => x !== c).concat([top])).dw));
                return withTop < now - (lvl === 'difficile' ? 0 : 1) ? {t: 'draw', from: 'discard'} : {t: 'draw', from: 'stock'};
            }
            const opts = L.filter(a => a.t === 'discard').map(a => { const rest = h.filter(c => c.i !== a.c); return {a, dw: bestMelds(rest).dw, v: ginVal(byId(st, a.c))}; }).sort((x, y) => x.dw - y.dw || y.v - x.v);
            const choice = lvl === 'facile' ? opts[Math.min(opts.length - 1, Math.floor(Rr() * 3))] : opts[0];
            if (choice.dw <= 10) { const early = st.stock.length > 20; if (lvl !== 'difficile' || choice.dw <= 4 || !early || choice.dw === 0) return {t: 'knock', c: choice.a.c}; }
            return choice.a;
        },
        score: st => st.total,
    };

    /* ═══════════ 8. 🂮 Crapette ═══════════ */
    const isCol = id => /^c\d$/.test(id);
    const crapette = {
        min: 2, max: 2,
        deal(st) {
            const Rr = R(st); st.cols = Array.from({length: 8}, () => []); st.found = Array.from({length: 8}, () => []); st.crap = [[], []]; st.talon = [[], []]; st.disc = [[], []]; st.hand = [null, null];
            for (let o = 0; o < 2; o++) {
                const d = shuffle(deck52().map(c => ({...c, i: c.i + 52 * o, o})), Rr);
                st.crap[o] = d.splice(0, 13); st.crap[o].forEach((c, j) => { c.up = j === 12; });
                for (let k = 0; k < 4; k++) { const c = d.shift(); c.up = true; st.cols[o * 4 + k].push(c); }
                st.talon[o] = d.map(c => ({...c, up: false}));
            }
            st.hands = [[], []]; st.turn = 0; st.phase = 'play'; st.turns = 0; st.cap = 400; st.moved = 0;
        },
        top: l => l[l.length - 1],
        src(st, id) { const o = Number(id.slice(-1)); if (id.startsWith('cr')) return st.crap[o]; if (id.startsWith('h')) return st.hand[o] ? [st.hand[o]] : []; if (id.startsWith('c')) return st.cols[Number(id.slice(1))]; if (id.startsWith('f')) return st.found[Number(id.slice(1))]; if (id.startsWith('df')) return st.disc[o]; return null; },
        canTo(st, c, to, p) {
            if (/^f\d$/.test(to)) { const t = this.top(st.found[Number(to.slice(1))]); return t ? t.s === c.s && c.r === t.r + 1 : c.r === 1; }
            if (isCol(to)) { const t = this.top(st.cols[Number(to.slice(1))]); return !t || (red(t) !== red(c) && c.r === t.r - 1); }
            const o = Number(to.slice(-1)); if (o === p) return false; // sur les piles de l'autre seulement
            if (/^(cr|df)[01]$/.test(to)) { const t = this.top(to.startsWith('cr') ? st.crap[o] : st.disc[o]); return !!t && t.up !== false && t.s === c.s && Math.abs(c.r - t.r) === 1; }
            return false;
        },
        sources(st, p) { const out = []; if (st.crap[p].length) out.push('cr' + p); if (st.hand[p]) out.push('h' + p); for (let k = 0; k < 8; k++) if (st.cols[k].length) out.push('c' + k); return out; },
        targets: p => ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'cr' + (1 - p), 'df' + (1 - p)],
        legal(st) {
            if (st.phase !== 'play') return [];
            const p = st.turn, out = [];
            this.sources(st, p).forEach(from => { const c = this.top(this.src(st, from)); this.targets(p).forEach(to => { if (to === from) return; if (isCol(from) && isCol(to) && !st.cols[Number(to.slice(1))].length && st.cols[Number(from.slice(1))].length === 1) return; if (this.canTo(st, c, to, p)) out.push({t: 'move', from, to}); }); });
            if (st.hand[p]) out.push({t: 'end'});
            else if (st.talon[p].length || st.disc[p].length) out.push({t: 'flip'});
            else out.push({t: 'pass'});
            return out;
        },
        left: (st, p) => st.crap[p].length + st.talon[p].length + st.disc[p].length + (st.hand[p] ? 1 : 0),
        play(st, a) {
            const p = st.turn;
            if (a.t === 'flip') {
                if (st.hand[p]) return {ok: false, msg: i18n('Tu as déjà une carte retournée : joue-la ou pose-la sur ta défausse.')};
                if (!st.talon[p].length) { if (!st.disc[p].length) return {ok: false, msg: i18n('Plus de talon.')}; st.talon[p] = st.disc[p].reverse().map(c => ({...c, up: false})); st.disc[p] = []; log(st, i18n('{name} retourne sa défausse : elle redevient son talon.', {name: nm(st, p)})); }
                const c = st.talon[p].pop(); c.up = true; st.hand[p] = c; return {ok: true};
            }
            if (a.t === 'end' || a.t === 'pass') {
                if (a.t === 'end') { if (!st.hand[p]) return {ok: false}; st.disc[p].push(st.hand[p]); st.hand[p] = null; }
                else if (st.hand[p] || st.talon[p].length || st.disc[p].length) return {ok: false, msg: i18n('Retourne d’abord une carte de ton talon.')};
                log(st, i18n('{name} termine son tour.', {name: nm(st, p)})); st.turn = 1 - p; st.turns++;
                if (st.turns >= st.cap) return this.finish(st, -1);
                return {ok: true};
            }
            if (a.t !== 'move') return {ok: false};
            const from = this.src(st, a.from || ''), to = this.src(st, a.to || '');
            if (!from || !to || !from.length) return {ok: false, msg: i18n('Rien à prendre là.')};
            if (!this.sources(st, p).includes(a.from)) return {ok: false, msg: i18n('Tu ne peux prendre que le dessus de ta crapette, ta carte retournée ou le dessus d’une colonne.')};
            const c = this.top(from); if (!this.canTo(st, c, a.to, p)) return {ok: false, msg: this.why(a.to)};
            if (a.from.startsWith('h')) st.hand[p] = null; else from.pop();
            c.up = true; to.push(c); st.moved++;
            if (a.from.startsWith('cr') && st.crap[p].length) this.top(st.crap[p]).up = true;
            if (!this.left(st, p)) return this.finish(st, p);
            return {ok: true};
        },
        why: to => i18n(to.startsWith('f') ? 'Sur une fondation : on monte de l’As au Roi, dans la même couleur de carte.' : to.startsWith('c') ? 'Sur une colonne : une carte plus faible d’un, de l’autre couleur (rouge sur noir) ; une colonne vide prend n’importe quelle carte.' : 'Sur la crapette ou la défausse de l’autre : même couleur de carte, juste au-dessus ou au-dessous.'),
        finish(st, w) {
            if (w < 0) { const l = [this.left(st, 0), this.left(st, 1)]; w = l[0] <= l[1] ? 0 : 1; log(st, i18n('Après {n} tours, {name} a le moins de cartes : gagné !', {n: String(st.cap), name: nm(st, w)})); }
            else log(st, i18n('{name} a posé toutes ses cartes : gagné !', {name: nm(st, w)}));
            st.winner = w; st.total = [52 - this.left(st, 0), 52 - this.left(st, 1)]; st.over = true; st.phase = 'over'; return {ok: true};
        },
        ai(st, lvl, Rr) {
            const p = st.turn, L = this.legal(st), moves = L.filter(a => a.t === 'move');
            const finish = L.find(a => a.t !== 'move');
            // jamais d'une colonne à l'autre pour l'ordinateur (pas de va-et-vient)
            const useful = moves.filter(a => !(isCol(a.from) && isCol(a.to)));
            if (!useful.length) return finish;
            if (lvl === 'facile') return Rr() < 0.25 ? finish : pickIn(Rr, useful);
            // d'abord les fondations, puis vider sa crapette, puis se débarrasser de sa carte retournée ; charger les piles de l'autre
            const sc = a => (a.to.startsWith('f') ? 100 : 0) + (a.from.startsWith('cr') ? 40 : a.from.startsWith('h') ? 25 : 0) + (/^(cr|df)/.test(a.to) ? 20 : 0)
                + (lvl === 'difficile' && isCol(a.from) && a.to.startsWith('f') && st.cols[Number(a.from.slice(1))].length === 1 ? 15 : 0) // une colonne qui se vide : de la place pour la crapette
                - (isCol(a.from) && !a.to.startsWith('f') ? 30 : 0);
            return useful.slice().sort((x, y) => sc(y) - sc(x))[0];
        },
        score: st => [0, 1].map(p => 52 - crapette.left(st, p)),
    };

    /* ═══════════ La liste des jeux ═══════════ */
    const GAMES = [
        {k: 'bataille', name: 'Bataille', icon: '⚔️', E: bataille, players: [2, 3, 4], def: 2, deck: 52,
            desc: 'Chacun retourne sa carte du dessus : la plus forte ramasse le tout. Égalité : bataille !',
            rules: ['On distribue tout le jeu de 52 cartes, faces cachées. Chacun retourne la carte du dessus de son tas.', 'La plus forte ramasse toutes les cartes retournées et les met sous son tas. L’As est la plus forte, puis le Roi, la Dame, le Valet, le 10… jusqu’au 2.', 'Égalité : « Bataille ! ». Ceux qui sont à égalité posent une carte cachée, puis une visible : la plus forte ramasse tout.', 'Celui qui n’a plus de cartes a perdu. On gagne en prenant toutes les cartes (ou, après 600 plis, avec le plus de cartes).']},
        {k: 'huit', name: 'Huit américain', icon: '🎱', E: huit, players: [2, 3, 4], def: 3, deck: 52,
            desc: 'Pose une carte de même couleur ou de même valeur ; le 8 change la couleur. Le premier sans carte gagne la manche.',
            rules: ['8 cartes chacun à deux, 7 à trois ou quatre. Une carte est retournée au milieu.', 'À ton tour, pose une carte de la même couleur (♥ ♦ ♠ ♣) ou de la même valeur que celle du dessus.', 'Le 8 se pose sur tout et tu choisis la couleur demandée.', 'Le 2 : le suivant pioche 2 cartes (sauf s’il pose un 2 à son tour, alors le suivant en pioche 4…). Le Valet : le suivant passe son tour. L’As : on change de sens (à deux, tu rejoues).', 'Si tu ne peux pas (ou ne veux pas) jouer, pioche une carte ; ensuite tu joues si tu peux, sinon tu passes.', 'Le premier qui n’a plus de cartes finit la manche. Les autres comptent leurs cartes : 8 = 50 points, figures = 10, As = 1, les autres leur valeur. Dès que quelqu’un atteint 100 points, celui qui en a le moins gagne.']},
        {k: 'dame', name: 'Dame de pique', icon: '♠️', E: dame, players: [4], def: 4, deck: 52,
            desc: 'Le jeu des plis où il ne faut rien ramasser : chaque cœur coûte 1 point, la Dame de pique 13.',
            rules: ['À quatre, 13 cartes chacun. Avant de jouer, chacun donne 3 cartes : à gauche, puis à droite, puis en face, puis on garde (et on recommence).', 'Le 2 de trèfle commence. Il faut fournir la couleur demandée ; sinon on joue ce qu’on veut. La plus forte carte de la couleur demandée ramasse le pli (l’As est le plus fort).', 'Chaque cœur ramassé coûte 1 point, la Dame de pique 13 points. On ne commence pas un pli par du cœur tant qu’aucun cœur n’a été joué. Au premier pli, pas de cœur ni de Dame de pique si tu as autre chose.', '🌙 Celui qui ramasse tous les cœurs et la Dame de pique ne prend rien : les autres prennent 26 points chacun.', 'Dès que quelqu’un atteint 100 points, celui qui en a le moins gagne.']},
        {k: 'president', name: 'Président', icon: '👑', E: president, players: [3, 4], def: 4, deck: 52,
            desc: 'Débarrasse-toi de tes cartes en posant plus fort que le précédent : le premier devient Président.',
            rules: ['On distribue tout le jeu. Le 3 est la plus faible, puis 4, 5… Roi, As ; le 2 est la plus forte.', 'Celui qui commence pose une, deux, trois ou quatre cartes de même valeur. Les suivants doivent poser le même nombre de cartes, plus fortes, ou passer. Qui a passé ne rejoue plus dans ce pli.', 'Quand tout le monde passe, le dernier qui a posé reprend la main. Un 2 ferme le pli tout de suite.', 'Le premier qui n’a plus de cartes est Président, le dernier Clochard. À la manche suivante, le Clochard donne ses 2 meilleures cartes au Président, qui lui rend ses 2 plus faibles (à quatre, le Vice-clochard et le Vice-président échangent une carte). Le Clochard commence.', 'Points : à 4 joueurs, 3 au Président, 2 au Vice-président, 1 au Vice-clochard ; partie en 5 manches.']},
        {k: 'belote', name: 'Belote', icon: '🃏', E: belote, players: [4], def: 4, deck: 32,
            desc: 'À quatre, en deux équipes : toi et Nord contre Ouest et Est. Prends à l’atout, annonce, et fais tes plis.',
            rules: ['Jeu de 32 cartes (de l’As au 7). Toi et Nord (en face) contre Ouest et Est. 5 cartes chacun et une carte retournée.', 'Les enchères : au premier tour, on prend la couleur de la carte retournée ou on passe ; au second tour, on peut choisir une autre couleur. Personne ne prend : on redistribue.', 'Le preneur reçoit la carte retournée et 2 cartes, les autres 3 (8 cartes chacun).', 'Il faut fournir la couleur demandée. Si tu n’en as pas, tu dois couper avec un atout (et monter si un atout est déjà posé), sauf si ton partenaire est maître du pli. À l’atout, il faut monter si on peut.', 'Les points. Atout : Valet 20, 9 14, As 11, 10 10, Roi 4, Dame 3. Autres couleurs : As 11, 10 10, Roi 4, Dame 3, Valet 2. Le dernier pli vaut 10 de plus (« dix de der »). Tous les plis : capot, 250.', 'Annonces (montrées toutes seules au début) : tierce 20, cinquante 50, cent 100 ; carré de Valets 200, de 9 150, d’As, de 10, de Rois ou de Dames 100. Seule l’équipe qui a la plus forte annonce marque les siennes. Belote-rebelote (Roi et Dame d’atout dans la même main) : 20.', 'L’équipe qui a pris doit faire plus de points que l’autre ; sinon elle est « dedans » et l’autre équipe marque 162 + les annonces. La première équipe à 501 points gagne.']},
        {k: 'tarot', name: 'Tarot à 4', icon: '🃟', E: tarot, players: [4], def: 4, deck: 78,
            desc: 'Le jeu de 78 cartes : 21 atouts, l’Excuse, les Cavaliers. Un preneur contre les trois autres.',
            rules: ['78 cartes : les 4 couleurs (Roi, Dame, Cavalier, Valet, 10… As), 21 atouts et l’Excuse. 18 cartes chacun, 6 au chien.', 'Les enchères, chacun une fois : Prise, Garde, Garde sans le chien, Garde contre le chien (de plus en plus fort ; ×1, ×2, ×4, ×6). Le plus fort contrat l’emporte : il joue seul contre les trois autres.', 'Prise ou Garde : le preneur prend le chien, puis met 6 cartes à l’écart (pas de Roi, ni d’atout sauf s’il ne peut pas faire autrement, jamais un bout). Garde sans : le chien compte pour le preneur ; Garde contre : pour la défense.', 'Il faut fournir la couleur demandée ; sinon il faut couper avec un atout et monter si un atout est déjà posé ; à l’atout, il faut monter si on peut. L’Excuse se joue quand on veut, ne gagne jamais, et reste à son camp (contre une petite carte).', 'Les bouts : le 21, le Petit (atout 1) et l’Excuse. Le preneur doit faire 56 points sans bout, 51 avec un, 41 avec deux, 36 avec trois. Rois 4,5, Dames 3,5, Cavaliers 2,5, Valets 1,5, bouts 4,5, les autres 0,5.', 'Le score : (25 + l’écart) × le contrat, payé par chacun des trois défenseurs au preneur (ou l’inverse s’il chute). Petit au bout (le Petit dans le dernier pli) : 10 × le contrat pour le camp qui le gagne. Partie en 4 donnes.', 'Pas de poignée ni de chelem dans cette version.']},
        {k: 'rami', name: 'Rami (gin)', icon: '🀄', E: rami, players: [2], def: 2, deck: 52,
            desc: 'Range ta main en brelans et en suites ; frappe quand tes cartes seules font 10 points ou moins.',
            rules: ['À deux, 10 cartes chacun ; une carte retournée commence la défausse.', 'À ton tour : prends la carte de la pioche ou celle du dessus de la défausse, puis jette une carte (pas celle que tu viens de prendre sur la défausse).', 'Les combinaisons : un brelan ou un carré (3 ou 4 cartes de même valeur), une suite de 3 cartes ou plus dans la même couleur (l’As est en bas : As-2-3).', 'Les cartes qui ne sont dans aucune combinaison sont tes « cartes seules » : As 1, figures 10, les autres leur valeur. Quand elles font 10 ou moins, tu peux frapper en jetant ta dernière carte.', 'L’autre pose alors ses combinaisons et peut ajouter ses cartes seules sur les tiennes. Tu marques la différence. S’il a autant ou moins que toi, il marque la différence + 25. Gin (aucune carte seule) : 25 + ses cartes seules.', 'La pioche presque vide (2 cartes) : manche nulle. Premier à 100 points.']},
        {k: 'crapette', name: 'Crapette', icon: '🂮', E: crapette, players: [2], def: 2, deck: 104,
            desc: 'À deux, chacun son jeu : pose toutes tes cartes avant l’autre, sur les colonnes, les fondations… et sur ses piles !',
            rules: ['Chacun a un jeu de 52 cartes (dos bleu pour toi, rouge pour l’ordinateur) : une crapette de 13 cartes (seule celle du dessus est visible), 4 cartes posées dans les colonnes de son côté, et le reste en talon.', 'Au milieu, 8 fondations qui montent de l’As au Roi dans la même couleur de carte.', 'Les 8 colonnes sont à tout le monde : on y descend en alternant rouge et noir ; une colonne vide prend n’importe quelle carte. On ne déplace qu’une carte à la fois.', 'À ton tour, joue le dessus de ta crapette, le dessus d’une colonne, ou retourne la carte du dessus de ton talon pour la jouer. Tu peux aussi poser une carte sur la crapette ou la défausse de l’autre : même couleur de carte, juste au-dessus ou au-dessous.', 'Quand la carte retournée ne te sert pas, pose-la sur ta défausse : ton tour est fini. Talon vide : ta défausse retournée devient ton talon.', 'Le premier qui a posé toute sa crapette, son talon et sa défausse gagne. (Pas de pénalité « Crapette ! » dans cette version : rien ne t’oblige à jouer dans un ordre précis.)']},
    ];
    const BY = new Map(GAMES.map(g => [g.k, g]));
    const get = k => BY.get(k) || null;
    const NAMES = ['Toi', 'Ouest', 'Nord', 'Est'];

    /** une nouvelle partie : n joueurs (le joueur 0 est la personne), level : facile | moyen | difficile */
    function create(k, o = {}) {
        const g = get(k); if (!g) throw new Error('Jeu inconnu : ' + k);
        let n = Number(o.n) || g.def; if (!g.players.includes(n)) n = g.def;
        const names = Array.isArray(o.names) && o.names.length >= n ? o.names.slice(0, n) : (n === 2 ? ['Toi', 'Nord'] : n === 3 ? ['Toi', 'Ouest', 'Est'] : NAMES.slice()).map(seat);
        const level = LEVELS.includes(o.level) ? o.level : 'moyen', levels = Array.from({length: n}, (_, p) => (LEVELS.includes(o.levels?.[p]) ? o.levels[p] : level));
        const st = {k, seed: String(o.seed ?? 'x'), n, level, levels, names, rs: 0, manche: 1, total: Array(n).fill(0), log: [], over: false, winner: -1, phase: 'play', turn: 0, hands: []};
        g.E.deal(st); return st;
    }
    const legal = st => (st.over || st.phase === 'end' ? [] : get(st.k).E.legal(st));
    function play(st, a) {
        if (!a || st.over) return {ok: false, msg: i18n('La partie est finie.')};
        if (st.phase === 'end') return {ok: false, msg: i18n('La manche est finie.')};
        return get(st.k).E.play(st, a) || {ok: false};
    }
    /** le coup de l'ordinateur pour le joueur dont c'est le tour */
    function ai(st, level) { const L = legal(st); if (!L.length) return null; const a = get(st.k).E.ai(st, level || st.levels?.[st.turn] || st.level, R(st)); return a || L[0]; }
    const hint = st => ai(st, 'difficile');
    /** la manche suivante (après le décompte) */
    function next(st) { if (st.phase !== 'end' || st.over) return false; st.manche++; st.redeal = 0; get(st.k).E.deal(st); return true; }
    /** vrai si l'action fait partie des coups permis (même cartes, même ordre ignoré) */
    function isLegal(st, a) {
        const key = x => JSON.stringify({...x, cards: x.cards ? x.cards.slice().sort((p, q) => p - q) : undefined});
        const L = legal(st);
        if (a?.t === 'give' || a?.t === 'discard' && a.cards) return L.some(x => x.t === a.t); // un choix libre de cartes : vérifié par play()
        return L.some(x => key(x) === key(a));
    }

    root.LCNDA_CARTES = {GAMES, get, create, legal, play, ai, hint, next, isLegal, LEVELS, SUIT, SUIT_NAME, RANK_NAME, TAROT_NAME, cardName, red,
        helpers: {bestMelds, allMelds, ginVal, belAnnonces, bPts, bStrength, tHalf, isOudler, pv, hiAce, heartPts, TITLES, CONTRACTS}, deck52, deck32, deckTarot};
})();
