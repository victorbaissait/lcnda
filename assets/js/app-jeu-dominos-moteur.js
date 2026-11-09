/* LCNDA — 🁫 Dominos (double-six) : le moteur (sans écran). Testé dans Node.
 * 28 dominos, 2 à 4 joueurs (7 dominos chacun à deux, 6 à trois ou quatre), avec pioche ou « bloqué » (sans pioche : on boude).
 * La première manche : celui qui a le plus gros double commence en le posant (sinon le plus gros domino) ; ensuite, le gagnant de la manche.
 * On pose un domino qui touche un bout de la chaîne ; sinon on pioche (jusqu'à pouvoir jouer) ou on passe.
 * La manche s'arrête quand un joueur n'a plus de domino (« Domino ! ») ou quand personne ne peut plus jouer (partie bloquée :
 * le moins de points en main gagne). Le gagnant marque les points qui restent dans les mains des autres.
 */
(function (root) {
    'use strict';
    const ALL = (() => { const t = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) t.push([a, b]); return t; })();
    const pips = t => t[0] + t[1];
    const handPips = h => h.reduce((s, t) => s + pips(t), 0);
    const isDouble = t => t[0] === t[1];
    const same = (x, y) => (x[0] === y[0] && x[1] === y[1]) || (x[0] === y[1] && x[1] === y[0]);
    function shuffle(list, rand) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

    /** une nouvelle manche : {hands, stock, line, ends, turn, opener, passes, passedOn, over, winner, blocked, gain} */
    function deal(n, rand, o = {}) {
        const per = o.per || (n === 2 ? 7 : 6), pool = shuffle(ALL, rand), hands = Array.from({length: n}, (_, i) => pool.slice(i * per, (i + 1) * per));
        const s = {n, hands, stock: pool.slice(n * per), line: [], ends: null, turn: 0, opener: null, passes: 0, passedOn: hands.map(() => []), over: false, winner: -1, blocked: false, gain: 0, draw: o.draw !== false, log: []};
        if (Number.isInteger(o.starter) && o.starter >= 0 && o.starter < n) s.turn = o.starter;
        else {
            // le plus gros double, sinon le plus gros domino
            let best = null;
            hands.forEach((h, p) => h.forEach(t => { const v = isDouble(t) ? 1000 + t[0] : pips(t) * 10 + Math.max(...t); if (!best || v > best.v) best = {v, p, t}; }));
            s.turn = best.p; s.opener = best.t.slice();
        }
        return s;
    }
    /** où ce domino peut aller : ['L'] / ['R'] / ['L', 'R'] / [] */
    function sides(s, t) {
        if (!s.line.length) return s.opener && !same(t, s.opener) ? [] : ['R'];
        const [l, r] = s.ends, out = [];
        if (t[0] === l || t[1] === l) out.push('L');
        if (t[0] === r || t[1] === r) out.push('R');
        return out;
    }
    /** les coups possibles du joueur p : [{i, side}] */
    const moves = (s, p = s.turn) => s.hands[p].flatMap((t, i) => sides(s, t).map(side => ({i, side})));
    const canPlay = (s, p = s.turn) => moves(s, p).length > 0;
    /** poser le domino n° i de la main de p du côté side ('L' ou 'R') ; rend true si c'est fait */
    function play(s, p, i, side) {
        if (s.over || p !== s.turn) return false;
        const t = s.hands[p][i]; if (!t || !sides(s, t).includes(side)) return false;
        let tile;
        if (!s.line.length) { tile = [t[0], t[1]]; s.line.push(tile); s.ends = [tile[0], tile[1]]; }
        else if (side === 'L') { const l = s.ends[0]; tile = t[1] === l ? [t[0], t[1]] : [t[1], t[0]]; s.line.unshift(tile); s.ends[0] = tile[0]; }
        else { const r = s.ends[1]; tile = t[0] === r ? [t[0], t[1]] : [t[1], t[0]]; s.line.push(tile); s.ends[1] = tile[1]; }
        s.hands[p].splice(i, 1); s.passes = 0; s.opener = null;
        s.log.push({p, t: tile.slice(), side});
        if (!s.hands[p].length) return finish(s, p, false), true;
        s.turn = (p + 1) % s.n; return true;
    }
    /** piocher un domino (seulement si on ne peut pas jouer) ; rend le domino ou null */
    function draw(s, p = s.turn) {
        if (s.over || !s.draw || p !== s.turn || canPlay(s, p) || !s.stock.length) return null;
        const t = s.stock.pop(); s.hands[p].push(t); s.log.push({p, pioche: true}); return t;
    }
    /** passer (seulement si on ne peut ni jouer ni piocher) */
    function pass(s, p = s.turn) {
        if (s.over || p !== s.turn || canPlay(s, p) || (s.draw && s.stock.length)) return false;
        if (s.ends) s.passedOn[p] = [...new Set([...s.passedOn[p], ...s.ends])];
        s.passes++; s.log.push({p, passe: true});
        if (s.passes >= s.n) { // personne ne peut plus jouer : partie bloquée, le moins de points en main gagne
            const pts = s.hands.map(handPips), min = Math.min(...pts), best = pts.map((x, k) => (x === min ? k : -1)).filter(k => k >= 0);
            finish(s, best.length === 1 ? best[0] : -1, true); return true;
        }
        s.turn = (p + 1) % s.n; return true;
    }
    function finish(s, w, blocked) {
        s.over = true; s.winner = w; s.blocked = blocked;
        s.gain = w < 0 ? 0 : s.hands.reduce((sum, h, k) => sum + (k === w ? 0 : handPips(h)), 0);
    }

    /* ═════ L'ordinateur ═════ */
    /** le choix de l'ordinateur : {i, side} ou null (il faut piocher ou passer) ; level 'facile' | 'moyen' | 'difficile' */
    function aiMove(s, p, level = 'moyen', rand = Math.random) {
        const ms = moves(s, p); if (!ms.length) return null;
        if (level === 'facile') return ms[Math.floor(rand() * ms.length)];
        const hand = s.hands[p];
        if (level === 'moyen') return ms.slice().sort((a, b) => (pips(hand[b.i]) + (isDouble(hand[b.i]) ? 0.5 : 0)) - (pips(hand[a.i]) + (isDouble(hand[a.i]) ? 0.5 : 0)))[0];
        // difficile : garder des numéros variés, poser les doubles et les gros tôt, viser les numéros que les autres n'ont pas
        const seen = Array(7).fill(0); s.line.forEach(t => { seen[t[0]]++; if (!isDouble(t)) seen[t[1]]++; }); hand.forEach(t => { seen[t[0]]++; if (!isDouble(t)) seen[t[1]]++; });
        const others = s.passedOn.filter((_, k) => k !== p).flat(), nextShort = s.hands[(p + 1) % s.n].length <= 2;
        const value = m => {
            const t = hand[m.i], rest = hand.filter((_, k) => k !== m.i);
            let ends;
            if (!s.line.length) ends = [t[0], t[1]];
            else { const e = s.ends.slice(), k = m.side === 'L' ? 0 : 1, other = t[0] === e[k] ? t[1] : t[0]; e[k] = other; ends = e; }
            const follow = rest.filter(x => ends.includes(x[0]) || ends.includes(x[1])).length;
            let v = pips(t) * (nextShort ? 2 : 1) + (isDouble(t) ? 4 : 0) + follow * 3;
            ends.forEach(e => { if (others.includes(e)) v += 5; if (seen[e] >= 7) v += 3; });
            return v;
        };
        return ms.map(m => [value(m), m]).sort((a, b) => b[0] - a[0])[0][1];
    }

    const API = {ALL, pips, handPips, isDouble, same, deal, sides, moves, canPlay, play, draw, pass, aiMove, shuffle};
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.LCNDA_DOMINOS = API;
})(typeof window !== 'undefined' ? window : globalThis);
