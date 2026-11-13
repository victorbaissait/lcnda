/* LCNDA — ⛀ Dames : le moteur (sans écran).
 * Trois règles : « internationales » (10×10, celles qu'on joue en France), « brésiliennes » (les mêmes sur 8×8) et « anglaises » (8×8, checkers).
 *  - internationales / brésiliennes : prise obligatoire ET majoritaire (on doit prendre le plus de pièces possible), les pions prennent
 *    aussi en arrière, dames volantes (elles glissent et prennent à distance), une pièce prise reste sur le plateau jusqu'à la fin de la rafle
 *    (on ne la saute pas deux fois), un pion ne devient dame que s'il finit son coup sur la dernière rangée.
 *  - anglaises : prise obligatoire (n'importe laquelle, mais jusqu'au bout), les pions prennent seulement en avant, dames d'un pas,
 *    un pion qui arrive au bout pendant une prise devient dame et s'arrête.
 * Nulle : triple répétition, ou 25 coups chacun (40 en anglaises) sans prise ni pion avancé. Perdu : plus de coup possible.
 * Cases : index r * N + c (r = 0 en haut). Pièces : 1 pion du joueur 0 (en bas, il monte), 2 sa dame ; -1 et -2 pour le joueur 1 (en haut).
 * Notation officielle : cases foncées numérotées de 1 (en haut à gauche) à 50 (ou 32) ; « 32-28 », « 28x19 ». Testé dans Node.
 */
(function (root) {
    'use strict';
    const RULES = {
        internationales: {N: 10, rows: 4, back: true, flying: true, majority: true, stopOnPromote: false, quiet: 50, label: 'Internationales (10 × 10)'},
        bresiliennes: {N: 8, rows: 3, back: true, flying: true, majority: true, stopOnPromote: false, quiet: 50, label: 'Internationales sur 8 × 8 (brésiliennes)'},
        anglaises: {N: 8, rows: 3, back: false, flying: false, majority: false, stopOnPromote: true, quiet: 80, label: 'Anglaises (8 × 8, checkers)'},
    };
    const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const sgn = side => (side === 0 ? 1 : -1);
    const rulesOf = v => RULES[v] || RULES.internationales;

    function create(v = 'internationales') {
        const R = rulesOf(v), N = R.N, b = new Array(N * N).fill(0);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if ((r + c) % 2 === 1) { if (r < R.rows) b[r * N + c] = -1; else if (r >= N - R.rows) b[r * N + c] = 1; }
        const s = {v: RULES[v] ? v : 'internationales', N, b, turn: 0, quiet: 0, keys: []};
        s.keys.push(key(s)); return s;
    }
    const key = s => s.b.join(',') + '|' + s.turn;
    const clone = s => ({...s, b: s.b.slice(), keys: s.keys.slice()});
    const num = (s, i) => Math.floor(i / s.N) * (s.N / 2) + Math.floor((i % s.N) / 2) + 1;
    const fromNum = (s, n) => { const per = s.N / 2, r = Math.floor((n - 1) / per), k = (n - 1) % per; return r * s.N + (r % 2 === 0 ? 2 * k + 1 : 2 * k); };
    const lastRow = (s, r, side) => (side === 0 ? r === 0 : r === s.N - 1);

    /** toutes les rafles possibles depuis la case i (chaque rafle complète : on ne peut plus rien prendre au bout) */
    function capturesFrom(s, i) {
        const R = rulesOf(s.v), N = s.N, b = s.b, piece = b[i], side = piece > 0 ? 0 : 1, sg = sgn(side), king = Math.abs(piece) === 2, out = [];
        const inside = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
        b[i] = 0; // la case de départ est libre pendant la rafle
        const dfs = (pos, caps, path) => {
            let more = false; const r0 = Math.floor(pos / N), c0 = pos % N;
            for (const [dr, dc] of DIRS) {
                if (!king && !R.back && dr !== -sg) continue;
                if (king && R.flying) {
                    let r = r0 + dr, c = c0 + dc;
                    while (inside(r, c) && b[r * N + c] === 0) { r += dr; c += dc; }
                    if (!inside(r, c)) continue;
                    const m = r * N + c; if (Math.sign(b[m]) !== -sg || caps.includes(m)) continue;
                    let lr = r + dr, lc = c + dc;
                    while (inside(lr, lc) && b[lr * N + lc] === 0) { more = true; dfs(lr * N + lc, [...caps, m], [...path, lr * N + lc]); lr += dr; lc += dc; }
                } else {
                    const mr = r0 + dr, mc = c0 + dc, lr = mr + dr, lc = mc + dc; if (!inside(lr, lc)) continue;
                    const m = mr * N + mc, l = lr * N + lc; if (Math.sign(b[m]) !== -sg || caps.includes(m) || b[l] !== 0) continue;
                    more = true;
                    if (!king && R.stopOnPromote && lastRow(s, lr, side)) { out.push({from: i, to: l, path: [...path, l], caps: [...caps, m]}); continue; }
                    dfs(l, [...caps, m], [...path, l]);
                }
            }
            if (!more && caps.length) out.push({from: i, to: pos, path, caps});
        };
        dfs(i, [], [i]);
        b[i] = piece;
        return out;
    }
    /** les coups légaux du joueur qui a le trait : [{from, to, path, caps, promote}] */
    function legal(s) {
        const R = rulesOf(s.v), N = s.N, b = s.b, sg = sgn(s.turn);
        let caps = [];
        for (let i = 0; i < b.length; i++) if (Math.sign(b[i]) === sg) caps.push(...capturesFrom(s, i));
        let moves;
        if (caps.length) {
            if (R.majority) { const best = Math.max(...caps.map(m => m.caps.length)); caps = caps.filter(m => m.caps.length === best); }
            const seen = new Set(); moves = caps.filter(m => { const k = `${m.from}>${m.to}:${m.caps.slice().sort((x, y) => x - y).join('.')}`; if (seen.has(k)) return false; seen.add(k); return true; });
        } else {
            moves = [];
            for (let i = 0; i < b.length; i++) {
                if (Math.sign(b[i]) !== sg) continue; const king = Math.abs(b[i]) === 2, r0 = Math.floor(i / N), c0 = i % N;
                for (const [dr, dc] of DIRS) {
                    if (!king && dr !== -sg) continue;
                    let r = r0 + dr, c = c0 + dc;
                    while (r >= 0 && c >= 0 && r < N && c < N && b[r * N + c] === 0) { moves.push({from: i, to: r * N + c, path: [i, r * N + c], caps: []}); if (!(king && R.flying)) break; r += dr; c += dc; }
                }
            }
        }
        moves.forEach(m => { m.promote = Math.abs(b[m.from]) === 1 && lastRow(s, Math.floor(m.to / N), s.turn); });
        return moves;
    }
    /** jouer un coup (en place) */
    function apply(s, m) {
        const p = s.b[m.from], man = Math.abs(p) === 1;
        s.b[m.from] = 0; m.caps.forEach(x => { s.b[x] = 0; });
        s.b[m.to] = m.promote ? 2 * Math.sign(p) : p;
        s.quiet = man || m.caps.length ? 0 : s.quiet + 1;
        s.turn = 1 - s.turn; s.keys.push(key(s));
        return s;
    }
    const moveId = m => `${m.from}>${m.to}:${m.caps.slice().sort((x, y) => x - y).join('.')}`;
    const notation = (s, m) => `${num(s, m.from)}${m.caps.length ? 'x' : '-'}${num(s, m.to)}`;
    /** {over, winner: 0|1|-1, reason: 'bloque'|'repetition'|'calme'|''} */
    function status(s) {
        const R = rulesOf(s.v), moves = legal(s);
        if (!moves.length) return {over: true, winner: 1 - s.turn, reason: s.b.some(x => Math.sign(x) === sgn(s.turn)) ? 'bloque' : 'plus', moves};
        const k = s.keys[s.keys.length - 1]; if (s.keys.filter(x => x === k).length >= 3) return {over: true, winner: -1, reason: 'repetition', moves};
        if (s.quiet >= R.quiet) return {over: true, winner: -1, reason: 'calme', moves};
        return {over: false, winner: -1, reason: '', moves};
    }
    const REASONS = {plus: 'plus aucune pièce', bloque: 'plus aucun coup possible', repetition: 'nulle : la même position trois fois', calme: 'nulle : trop de coups de dames sans prise', abandon: 'abandon', accord: 'nulle d’un commun accord', temps: 'temps écoulé'};
    function replay(v, ids) { const s = create(v), notes = []; for (const id of ids || []) { const m = legal(s).find(x => moveId(x) === id); if (!m) break; notes.push(notation(s, m)); apply(s, m); } return {s, notes}; }
    const count = s => { const c = {men: [0, 0], kings: [0, 0]}; s.b.forEach(x => { if (!x) return; const side = x > 0 ? 0 : 1; if (Math.abs(x) === 2) c.kings[side]++; else c.men[side]++; }); return c; };

    /* ═════ L'ordinateur ═════ */
    function evaluate(s) {
        const R = rulesOf(s.v), N = s.N, KV = R.flying ? 320 : 170; let sc = 0;
        for (let i = 0; i < s.b.length; i++) {
            const x = s.b[i]; if (!x) continue; const r = Math.floor(i / N), c = i % N, side = x > 0 ? 0 : 1;
            let v = Math.abs(x) === 2 ? KV : 100;
            if (Math.abs(x) === 1) { const adv = side === 0 ? N - 1 - r : r; v += adv * 4; if ((side === 0 && r === N - 1) || (side === 1 && r === 0)) v += 6; } // la dernière ligne garde le passage
            if (c > 0 && c < N - 1) v += 3; if (c >= 2 && c <= N - 3 && r >= 2 && r <= N - 3) v += 3;
            sc += side === 0 ? v : -v;
        }
        return s.turn === 0 ? sc : -sc;
    }
    /** le coup de l'ordinateur : {move, score} ; o.level 'facile' | 'moyen' | 'difficile', o.ms, o.rand */
    function bestMove(s0, o = {}) {
        const level = o.level || 'moyen', rand = o.rand || Math.random, all = legal(s0);
        if (!all.length) return {move: null, score: 0}; if (all.length === 1) return {move: all[0], score: 0};
        const maxD = o.depth || (level === 'facile' ? 2 : level === 'moyen' ? 4 : 10), limit = o.ms ?? (level === 'difficile' ? 1400 : 600), t0 = Date.now();
        let stop = false, nodes = 0;
        const search = (s, d, a, bt) => {
            if ((++nodes & 511) === 0 && Date.now() - t0 > limit) stop = true;
            const ms = legal(s); if (!ms.length) return -100000 + (20 - d);
            if (d <= 0 && !ms[0].caps.length) return evaluate(s);
            if (d <= -6) return evaluate(s); // les prises continuent un peu après la profondeur (pas de coup « dans le vide »)
            let best = -Infinity; ms.sort((x, y) => y.caps.length - x.caps.length);
            for (const m of ms) { const n = apply({...s, b: s.b.slice(), keys: []}, m); const v = -search(n, d - 1, -bt, -a); if (stop) return 0; if (v > best) best = v; if (v > a) a = v; if (a >= bt) break; }
            return best;
        };
        let bestM = all[0], bestV = -Infinity;
        for (let d = 1; d <= maxD; d++) {
            let cur = null, curV = -Infinity, a = -Infinity; const sc = [];
            for (const m of [bestM, ...all.filter(x => x !== bestM)]) { const n = apply({...s0, b: s0.b.slice(), keys: []}, m); const v = -search(n, d - 1, -Infinity, -a); if (stop) break; sc.push([v, m]); if (v > curV) { curV = v; cur = m; } if (v > a) a = v; }
            if (stop) break; bestM = cur; bestV = curV;
            if (level === 'facile') { const ok = sc.filter(([v]) => v >= curV - 120); bestM = ok[Math.floor(rand() * ok.length)][1]; }
            if (Math.abs(curV) > 90000) break;
        }
        return {move: bestM, score: bestV};
    }

    const API = {RULES, create, key, clone, num, fromNum, legal, capturesFrom, apply, moveId, notation, status, replay, count, evaluate, bestMove, REASONS, rulesOf};
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.LCNDA_DAMES = API;
})(typeof window !== 'undefined' ? window : globalThis);
