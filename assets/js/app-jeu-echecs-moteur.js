/* LCNDA — ♟ Échecs : le moteur (sans écran). Toutes les règles : roque (interdit sous échec, en passant par une case attaquée
 * ou si le roi / la tour ont bougé), prise en passant, promotion au choix, échec et mat, pat, nulle par triple répétition,
 * par la règle des 50 coups et par matériel insuffisant ; notation algébrique en français (R D T F C) ou en anglais.
 * Ordinateur : alpha-bêta (négamax) avec recherche des prises au calme, ordre des coups, approfondissement progressif borné en temps.
 * Aucune bibliothèque. Testé dans Node (tests/test-jeux-plateau.js, dont les comptes « perft » de référence).
 * Peut aussi tourner dans un Worker (l'écran lui confie la réflexion de l'ordinateur pour ne pas figer la page).
 * Cases : index r * 8 + c, r = 0 la 8e rangée (en haut, côté noir), c = 0 la colonne a. Pièces : 'PNBRQK' blanches, 'pnbrqk' noires, '' vide.
 */
(function (root) {
    'use strict';
    const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const FILES = 'abcdefgh';
    const sqName = i => FILES[i & 7] + (8 - (i >> 3));
    const sqIndex = n => (/^[a-h][1-8]$/.test(n) ? (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]) : -1);
    const isW = p => p !== '' && p === p.toUpperCase();
    const colorOf = p => (p === '' ? '' : isW(p) ? 'w' : 'b');
    const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const RD = [[-1, 0], [1, 0], [0, -1], [0, 1]], BD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    /* ═════ Position ═════ */
    function fromFEN(fen = START) {
        const [pl, turn = 'w', castle = '-', ep = '-', half = '0', full = '1'] = String(fen).trim().split(/\s+/);
        const b = [];
        for (const ch of pl.replace(/\//g, '')) { if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) b.push(''); else b.push(ch); }
        if (b.length !== 64) throw new Error('Position illisible.');
        const s = {b, turn: turn === 'b' ? 'b' : 'w', castle: castle === '-' ? '' : castle.replace(/[^KQkq]/g, ''), ep: sqIndex(ep), half: Number(half) || 0, full: Number(full) || 1, kw: b.indexOf('K'), kb: b.indexOf('k'), keys: []};
        s.keys.push(key(s));
        return s;
    }
    function toFEN(s) {
        let out = '';
        for (let r = 0; r < 8; r++) { let e = 0; for (let c = 0; c < 8; c++) { const p = s.b[r * 8 + c]; if (!p) { e++; continue; } if (e) { out += e; e = 0; } out += p; } if (e) out += e; if (r < 7) out += '/'; }
        return `${out} ${s.turn} ${s.castle || '-'} ${s.ep >= 0 ? sqName(s.ep) : '-'} ${s.half} ${s.full}`;
    }
    const clone = s => ({...s, b: s.b.slice(), keys: s.keys.slice()});
    /** la clé de répétition : pièces, trait, roques, et la prise en passant seulement si elle est vraiment jouable */
    function key(s) {
        let ep = '-';
        if (s.ep >= 0) { const r = s.ep >> 3, c = s.ep & 7, pr = s.turn === 'w' ? r + 1 : r - 1, pawn = s.turn === 'w' ? 'P' : 'p'; if ((c > 0 && s.b[pr * 8 + c - 1] === pawn) || (c < 7 && s.b[pr * 8 + c + 1] === pawn)) ep = String(s.ep); }
        return s.b.map(p => p || '.').join('') + s.turn + (s.castle || '-') + ep;
    }

    /* ═════ Attaques ═════ */
    function attacked(b, sq, byW) {
        const r = sq >> 3, c = sq & 7, at = (y, x) => (y >= 0 && y < 8 && x >= 0 && x < 8 ? b[y * 8 + x] : null);
        const P = byW ? 'P' : 'p', N = byW ? 'N' : 'n', K = byW ? 'K' : 'k', Bq = byW ? 'B' : 'b', R = byW ? 'R' : 'r', Q = byW ? 'Q' : 'q';
        const pr = byW ? r + 1 : r - 1; if (at(pr, c - 1) === P || at(pr, c + 1) === P) return true;
        for (const [dy, dx] of KN) if (at(r + dy, c + dx) === N) return true;
        for (const [dy, dx] of KG) if (at(r + dy, c + dx) === K) return true;
        for (const [dy, dx] of RD) { let y = r + dy, x = c + dx; while (y >= 0 && y < 8 && x >= 0 && x < 8) { const p = b[y * 8 + x]; if (p) { if (p === R || p === Q) return true; break; } y += dy; x += dx; } }
        for (const [dy, dx] of BD) { let y = r + dy, x = c + dx; while (y >= 0 && y < 8 && x >= 0 && x < 8) { const p = b[y * 8 + x]; if (p) { if (p === Bq || p === Q) return true; break; } y += dy; x += dx; } }
        return false;
    }
    const inCheck = (s, side = s.turn) => attacked(s.b, side === 'w' ? s.kw : s.kb, side !== 'w');

    /* ═════ Coups ═════ */
    /** les coups « pseudo-légaux » (le roi peut rester en échec : on le vérifie après) ; capturesOnly pour la recherche au calme */
    function pseudo(s, capturesOnly = false) {
        const b = s.b, w = s.turn === 'w', out = [], mine = p => p !== '' && isW(p) === w, foe = p => p !== '' && isW(p) !== w;
        const add = (from, to, p, flag = '') => {
            const cap = flag === 'ep' ? (w ? 'p' : 'P') : b[to];
            if ((p === 'P' && to < 8) || (p === 'p' && to >= 56)) { for (const pr of 'qrbn') out.push({from, to, p, cap, promo: pr, flag}); }
            else out.push({from, to, p, cap, promo: '', flag});
        };
        for (let i = 0; i < 64; i++) {
            const p = b[i]; if (!mine(p)) continue;
            const r = i >> 3, c = i & 7, t = p.toLowerCase();
            if (t === 'p') {
                const d = w ? -1 : 1, r1 = r + d;
                if (r1 >= 0 && r1 < 8) {
                    if (!b[r1 * 8 + c] && (!capturesOnly || r1 === 0 || r1 === 7)) {
                        add(i, r1 * 8 + c, p);
                        const startRow = w ? 6 : 1;
                        if (r === startRow && !b[(r + 2 * d) * 8 + c] && !capturesOnly) add(i, (r + 2 * d) * 8 + c, p, '2');
                    }
                    for (const dc of [-1, 1]) { const x = c + dc; if (x < 0 || x > 7) continue; const to = r1 * 8 + x; if (foe(b[to])) add(i, to, p); else if (to === s.ep) add(i, to, p, 'ep'); }
                }
                continue;
            }
            if (t === 'n' || t === 'k') {
                for (const [dy, dx] of t === 'n' ? KN : KG) { const y = r + dy, x = c + dx; if (y < 0 || y > 7 || x < 0 || x > 7) continue; const to = y * 8 + x; if (mine(b[to])) continue; if (capturesOnly && !b[to]) continue; add(i, to, p); }
                if (t === 'k' && !capturesOnly) {
                    const home = w ? 60 : 4, K = w ? 'K' : 'k', Rk = w ? 'R' : 'r', ks = w ? 'K' : 'k', qs = w ? 'Q' : 'q';
                    if (i === home && b[i] === K) {
                        if (s.castle.includes(ks) && b[home + 3] === Rk && !b[home + 1] && !b[home + 2] && !attacked(b, home, !w) && !attacked(b, home + 1, !w) && !attacked(b, home + 2, !w)) out.push({from: i, to: home + 2, p, cap: '', promo: '', flag: 'K'});
                        if (s.castle.includes(qs) && b[home - 4] === Rk && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home, !w) && !attacked(b, home - 1, !w) && !attacked(b, home - 2, !w)) out.push({from: i, to: home - 2, p, cap: '', promo: '', flag: 'Q'});
                    }
                }
                continue;
            }
            const dirs = t === 'r' ? RD : t === 'b' ? BD : KG;
            for (const [dy, dx] of dirs) { let y = r + dy, x = c + dx; while (y >= 0 && y < 8 && x >= 0 && x < 8) { const to = y * 8 + x; if (mine(b[to])) break; if (b[to]) { add(i, to, p); break; } if (!capturesOnly) add(i, to, p); y += dy; x += dx; } }
        }
        return out;
    }
    /** jouer un coup sur la position (en place) ; rend de quoi le défaire */
    function make(s, m) {
        const b = s.b, w = s.turn === 'w', u = {castle: s.castle, ep: s.ep, half: s.half, kw: s.kw, kb: s.kb};
        b[m.from] = '';
        if (m.flag === 'ep') b[m.to + (w ? 8 : -8)] = '';
        b[m.to] = m.promo ? (w ? m.promo.toUpperCase() : m.promo) : m.p;
        if (m.flag === 'K') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = ''; }
        if (m.flag === 'Q') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = ''; }
        if (m.p === 'K') s.kw = m.to; else if (m.p === 'k') s.kb = m.to;
        let c = s.castle;
        if (c) {
            if (m.p === 'K') c = c.replace(/[KQ]/g, ''); else if (m.p === 'k') c = c.replace(/[kq]/g, '');
            for (const q of [m.from, m.to]) { if (q === 63) c = c.replace('K', ''); else if (q === 56) c = c.replace('Q', ''); else if (q === 7) c = c.replace('k', ''); else if (q === 0) c = c.replace('q', ''); }
        }
        s.castle = c;
        s.ep = m.flag === '2' ? (m.from + m.to) >> 1 : -1;
        s.half = m.p === 'P' || m.p === 'p' || m.cap ? 0 : s.half + 1;
        if (!w) s.full++;
        s.turn = w ? 'b' : 'w';
        return u;
    }
    function unmake(s, m, u) {
        const b = s.b; s.turn = s.turn === 'w' ? 'b' : 'w'; const w = s.turn === 'w';
        if (!w) s.full--;
        b[m.from] = m.p;
        if (m.flag === 'ep') { b[m.to] = ''; b[m.to + (w ? 8 : -8)] = m.cap; } else b[m.to] = m.cap;
        if (m.flag === 'K') { b[m.from + 3] = b[m.from + 1]; b[m.from + 1] = ''; }
        if (m.flag === 'Q') { b[m.from - 4] = b[m.from - 1]; b[m.from - 1] = ''; }
        s.castle = u.castle; s.ep = u.ep; s.half = u.half; s.kw = u.kw; s.kb = u.kb;
    }
    function legal(s) {
        const out = [], side = s.turn;
        for (const m of pseudo(s)) { const u = make(s, m); if (!inCheck(s, side)) out.push(m); unmake(s, m, u); }
        return out;
    }
    const uci = m => sqName(m.from) + sqName(m.to) + (m.promo || '');
    const findMove = (s, str) => { const t = String(str || '').toLowerCase(); return legal(s).find(m => uci(m) === t || (t.length === 4 && !m.promo && uci(m) === t)) || null; };

    /* ═════ Notation ═════ */
    const LETTERS = {fr: {N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R'}, en: {N: 'N', B: 'B', R: 'R', Q: 'Q', K: 'K'}};
    /** la notation algébrique d'un coup légal (avant de le jouer) : « Cf3 », « exd5 », « O-O », « e8=D+ », « Tad1# » */
    function san(s, m, lang = 'fr') {
        const L = LETTERS[lang] || LETTERS.fr, T = m.p.toUpperCase();
        let out;
        if (m.flag === 'K') out = 'O-O'; else if (m.flag === 'Q') out = 'O-O-O';
        else {
            const capt = !!m.cap;
            if (T === 'P') out = (capt ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + L[m.promo.toUpperCase()] : '');
            else {
                const others = legal(s).filter(x => x.p === m.p && x.to === m.to && x.from !== m.from);
                let dis = '';
                if (others.length) { const sameFile = others.some(x => (x.from & 7) === (m.from & 7)), sameRank = others.some(x => (x.from >> 3) === (m.from >> 3)); dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String(8 - (m.from >> 3)) : sqName(m.from); }
                out = L[T] + dis + (capt ? 'x' : '') + sqName(m.to);
            }
        }
        const u = make(s, m), chk = inCheck(s), mate = chk && !legal(s).length; unmake(s, m, u);
        return out + (mate ? '#' : chk ? '+' : '');
    }

    /* ═════ La partie : jouer, état, fin ═════ */
    /** joue un coup (objet légal ou texte « e2e4 », « e7e8q ») et garde la clé de répétition ; rend le coup joué ou null */
    function play(s, mv) {
        const m = typeof mv === 'string' ? findMove(s, mv) : legal(s).find(x => x.from === mv.from && x.to === mv.to && (x.promo || '') === (mv.promo || '')) || null;
        if (!m) return null;
        make(s, m); s.keys.push(key(s));
        return m;
    }
    function insufficient(b) {
        const rest = []; b.forEach((p, i) => { if (p && p.toLowerCase() !== 'k') rest.push([p, i]); });
        if (!rest.length) return true;
        if (rest.some(([p]) => /[pqrPQR]/.test(p))) return false;
        if (rest.length === 1) return true; // roi + fou ou roi + cavalier contre roi
        if (rest.every(([p]) => p.toLowerCase() === 'b')) { const col = new Set(rest.map(([, i]) => ((i >> 3) + (i & 7)) % 2)); return col.size === 1; } // que des fous, tous sur la même couleur
        return false;
    }
    /** l'état : {over, result: '1-0'|'0-1'|'1/2-1/2'|'', reason: 'mat'|'pat'|'repetition'|'cinquante'|'materiel'|'', check} */
    function status(s) {
        const moves = legal(s), check = inCheck(s);
        if (!moves.length) return check ? {over: true, result: s.turn === 'w' ? '0-1' : '1-0', reason: 'mat', check} : {over: true, result: '1/2-1/2', reason: 'pat', check};
        if (insufficient(s.b)) return {over: true, result: '1/2-1/2', reason: 'materiel', check};
        if (s.half >= 100) return {over: true, result: '1/2-1/2', reason: 'cinquante', check};
        const k = s.keys[s.keys.length - 1]; if (s.keys.filter(x => x === k).length >= 3) return {over: true, result: '1/2-1/2', reason: 'repetition', check};
        return {over: false, result: '', reason: '', check, moves};
    }
    const REASONS = {mat: 'échec et mat', pat: 'pat (plus de coup possible sans être en échec)', repetition: 'nulle par triple répétition', cinquante: 'nulle : 50 coups sans prise ni pion avancé', materiel: 'nulle : plus assez de pièces pour mater', temps: 'temps écoulé', abandon: 'abandon', accord: 'nulle d’un commun accord'};
    /** rejoue une liste de coups depuis une position : {s, sans} (les coups illisibles arrêtent la relecture) */
    function replay(list, fen = START, lang = 'fr') {
        const s = fromFEN(fen), sans = [];
        for (const x of list || []) { const m = findMove(s, x); if (!m) break; sans.push(san(s, m, lang)); make(s, m); s.keys.push(key(s)); }
        return {s, sans};
    }
    function perft(s, depth) {
        if (!depth) return 1; let n = 0;
        for (const m of pseudo(s)) { const side = s.turn, u = make(s, m); if (!inCheck(s, side)) n += depth === 1 ? 1 : perft(s, depth - 1); unmake(s, m, u); }
        return n;
    }

    /* ═════ L'ordinateur ═════ */
    const VAL = {p: 100, n: 320, b: 330, r: 500, q: 900, k: 0};
    // tables de placement (du point de vue des blancs, a8 en premier)
    const PST = {
        p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
        n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
        b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
        r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
        q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
        k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
        ke: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
    };
    /** l'évaluation, du point de vue du joueur qui a le trait */
    function evaluate(s) {
        let score = 0, mat = 0; const b = s.b;
        for (let i = 0; i < 64; i++) { const p = b[i]; if (p && p !== 'K' && p !== 'k' && p !== 'P' && p !== 'p') mat += VAL[p.toLowerCase()]; }
        const end = mat <= 1300;
        for (let i = 0; i < 64; i++) {
            const p = b[i]; if (!p) continue;
            const w = isW(p), t = p.toLowerCase(), idx = w ? i : (7 - (i >> 3)) * 8 + (i & 7), tab = t === 'k' && end ? PST.ke : PST[t];
            const v = VAL[t] + tab[idx]; score += w ? v : -v;
        }
        return s.turn === 'w' ? score : -score;
    }
    const MATE = 100000;
    function order(moves, best) {
        const sc = m => (best && m.from === best.from && m.to === best.to && m.promo === best.promo ? 1e6 : 0) + (m.cap ? 10 * VAL[m.cap.toLowerCase()] - VAL[m.p.toLowerCase()] / 10 + 1000 : 0) + (m.promo === 'q' ? 900 : 0);
        return moves.map(m => [sc(m), m]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    }
    /**
     * le coup de l'ordinateur : {move, score, depth}
     * o.level : 'facile' | 'moyen' | 'difficile' ; o.ms : le temps de réflexion au plus ; o.rand : hasard (0..1) ; o.depth : profondeur imposée
     */
    function bestMove(s0, o = {}) {
        const s = clone(s0), level = o.level || 'moyen', rand = o.rand || Math.random;
        const all = legal(s); if (!all.length) return {move: null, score: 0, depth: 0};
        if (all.length === 1) return {move: all[0], score: 0, depth: 0};
        const maxDepth = o.depth || (level === 'facile' ? 1 : level === 'moyen' ? 3 : 6), limit = o.ms ?? (level === 'facile' ? 200 : level === 'moyen' ? 700 : 1500);
        const t0 = Date.now(); let nodes = 0, stop = false;
        const seen = new Map(); s.keys.forEach(k => seen.set(k, (seen.get(k) || 0) + 1));
        const tick = () => { if ((++nodes & 1023) === 0 && Date.now() - t0 > limit) stop = true; };
        function quiet(alpha, beta, qd) {
            tick(); const stand = evaluate(s);
            if (stand >= beta) return beta; if (alpha < stand) alpha = stand; if (qd > 6 || stop) return alpha;
            for (const m of order(pseudo(s, true))) {
                const side = s.turn, u = make(s, m); if (inCheck(s, side)) { unmake(s, m, u); continue; }
                const v = -quiet(-beta, -alpha, qd + 1); unmake(s, m, u);
                if (v >= beta) return beta; if (v > alpha) alpha = v;
            }
            return alpha;
        }
        function search(depth, alpha, beta, ply) {
            tick(); if (stop) return 0;
            if (ply && (s.half >= 100 || insufficient(s.b))) return 0;
            if (ply) { const k = key(s); if ((seen.get(k) || 0) >= 1) return 0; } // une position déjà vue : on la compte nulle (évite de tourner en rond)
            if (depth <= 0) return quiet(alpha, beta, 0);
            let any = false, best = -Infinity; const k = ply ? key(s) : null; if (k) seen.set(k, (seen.get(k) || 0) + 1);
            for (const m of order(pseudo(s))) {
                const side = s.turn, u = make(s, m); if (inCheck(s, side)) { unmake(s, m, u); continue; }
                any = true; const chk = inCheck(s);
                const v = -search(depth - 1 + (chk && ply < 8 ? 1 : 0) * (depth <= 1 ? 1 : 0), -beta, -alpha, ply + 1); unmake(s, m, u);
                if (stop) break;
                if (v > best) best = v; if (v > alpha) alpha = v; if (alpha >= beta) break;
            }
            if (k) seen.set(k, seen.get(k) - 1);
            if (!any) return inCheck(s) ? -MATE + ply : 0;
            return best;
        }
        let bestM = all[0], bestScore = -Infinity, reached = 0;
        for (let d = 1; d <= maxDepth; d++) {
            let curBest = null, curScore = -Infinity, alpha = -Infinity; const scored = [];
            for (const m of order(all, bestM)) {
                const u = make(s, m); const v = -search(d - 1, -Infinity, -alpha, 1); unmake(s, m, u);
                if (stop) break;
                scored.push([v, m]); if (v > curScore) { curScore = v; curBest = m; } if (v > alpha) alpha = v;
            }
            if (stop && !curBest) break;
            if (curBest && (!stop || curScore >= bestScore)) { bestM = curBest; bestScore = curScore; reached = d; }
            if (stop || Math.abs(curScore) > MATE - 100) break;
            if (level === 'facile' && scored.length) { // le niveau facile se trompe souvent : un coup parmi les « pas trop mauvais »
                const ok = scored.filter(([v]) => v >= curScore - 250); bestM = ok[Math.floor(rand() * ok.length)][1];
                if (rand() < 0.25) bestM = all[Math.floor(rand() * all.length)];
            }
        }
        return {move: bestM, score: bestScore, depth: reached};
    }

    const API = {START, fromFEN, toFEN, clone, key, attacked, inCheck, pseudo, legal, make, unmake, play, uci, findMove, san, status, replay, perft, insufficient, evaluate, bestMove, sqName, sqIndex, colorOf, isW, REASONS, LETTERS};
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.LCNDA_ECHECS = API;
    // dans un Worker : réfléchir sans figer la page
    if (typeof window === 'undefined' && typeof importScripts === 'function' && typeof self !== 'undefined') {
        self.onmessage = e => { const {id, fen, keys, level, ms} = e.data || {}; try { const s = fromFEN(fen); if (Array.isArray(keys)) s.keys = keys; const r = bestMove(s, {level, ms}); self.postMessage({id, move: r.move ? uci(r.move) : '', score: r.score, depth: r.depth}); } catch (er) { self.postMessage({id, error: String(er?.message || er)}); } };
    }
})(typeof window !== 'undefined' ? window : globalThis);
