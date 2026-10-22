/**
 * 🧮 Le moteur de la Calculette (window.LCNDA_CALC ; aussi require() dans Node pour les essais).
 * Sans écran, sans bibliothèque, sans eval ni Function : un petit lecteur de calculs (jetons → arbre), puis un calcul
 * sur des valeurs sûres — fractions exactes (BigInt), nombres à virgule, nombres complexes, listes, matrices.
 * Réutilise : LCNDA_SHEET (dates des actes C4 readActDate, calendrier républicain), LCNDA_EXT.calendarMore
 * (mesures anciennes par région, livres-sols-deniers, écart entre deux dates). Le Tableur garde son propre lecteur de
 * formules (il parle de cellules A1, de plages et de feuilles) : celui-ci parle de x, de i, de matrices et d'unités.
 * L'écran (fenêtre flottante 🧮) est dans heritage-calculette.js ; mode d'emploi : docs/UI.md, « 🧮 Calculette ».
 */
(function (root, factory) {
    const M = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = M;
    if (typeof window !== 'undefined') window.LCNDA_CALC = M;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
    'use strict';

    /* ═════════ Limites : un calcul fou ne bloque rien ═════════ */
    const LIMITS = {input: 2000, tokens: 1500, depth: 80, bits: 60000, list: 10000, mat: 20, fact: 5000, evals: 400000, sum: 100000, digits: 400};
    class CalcError extends Error { constructor(msg, o = {}) { super(msg); this.hint = o.hint || ''; this.pos = o.pos ?? -1; this.calc = true; } }
    const fail = (msg, o) => { throw new CalcError(msg, o); };
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const sheet = () => G.LCNDA_SHEET || null;
    const calMore = () => G.LCNDA_EXT?.calendarMore || null;
    let budget = 0; // nombre d'opérations du calcul en cours
    const tick = (n = 1) => { budget += n; if (budget > LIMITS.evals * 10) fail('Ce calcul est trop long : je m’arrête là.', {hint: 'Essaie avec des nombres plus petits ou moins d’étapes.'}); };

    /* ═════════ Entiers et fractions exactes (BigInt) ═════════ */
    const babs = a => (a < 0n ? -a : a);
    const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) { [a, b] = [b, a % b]; } return a; };
    const blen = a => (a === 0n ? 0 : babs(a).toString(2).length);
    const bToF = (n, d = 1n) => { const s = Math.max(blen(n), blen(d)) - 1000; if (s > 0) { const k = BigInt(s); return Number(n >> k) / Number(d >> k); } return Number(n) / Number(d); };
    class Frac { constructor(n, d) { this.n = n; this.d = d; } }
    /** une fraction réduite ; trop grande → nombre à virgule (approché) */
    function fr(n, d = 1n) {
        if (typeof n === 'number') n = BigInt(n); if (typeof d === 'number') d = BigInt(d);
        if (d === 0n) fail('Division par zéro : on ne peut pas diviser par 0.');
        if (d < 0n) { n = -n; d = -d; }
        const g = bgcd(n, d); if (g > 1n) { n /= g; d /= g; }
        if (blen(n) > LIMITS.bits || blen(d) > LIMITS.bits) { const f = bToF(n, d); if (!Number.isFinite(f)) fail('Nombre trop grand pour être calculé.'); return f; }
        return new Frac(n, d);
    }
    const ZERO = new Frac(0n, 1n), ONE = new Frac(1n, 1n);
    const isF = x => x instanceof Frac, isR = x => typeof x === 'number', isInt = x => isF(x) && x.d === 1n;
    const isZero = x => (isF(x) ? x.n === 0n : isR(x) ? x === 0 : isC(x) ? x.re === 0 && x.im === 0 : false);
    /** un nombre à virgule → fraction exacte (seulement s'il est entier ou décimal court) */
    function fracOfFloat(x) {
        if (!Number.isFinite(x)) return x;
        if (Number.isInteger(x) && Math.abs(x) < 2 ** 53) return new Frac(BigInt(x), 1n);
        return x;
    }
    /** une fraction proche d'un nombre à virgule (fractions continues), dénominateur ≤ maxD */
    function approxFrac(x, maxD = 1000000) {
        if (!Number.isFinite(x)) return null;
        let h0 = 0, h1 = 1, k0 = 1, k1 = 0, v = x;
        for (let i = 0; i < 64; i++) {
            const a = Math.floor(v), h2 = a * h1 + h0, k2 = a * k1 + k0;
            if (k2 > maxD) break;
            h0 = h1; h1 = h2; k0 = k1; k1 = k2;
            if (Math.abs(x - h1 / k1) <= 1e-12 * Math.max(1, Math.abs(x))) return fr(BigInt(h1), BigInt(k1));
            if (v === a) break; v = 1 / (v - a);
        }
        return Math.abs(x - h1 / k1) <= 1e-12 * Math.max(1, Math.abs(x)) ? fr(BigInt(h1), BigInt(k1)) : null;
    }
    /** racine entière n-ième (ou null si ce n'est pas une puissance exacte) */
    function bRoot(a, k) {
        if (a < 0n) return null; if (a < 2n) return a;
        let x = BigInt(Math.max(1, Math.floor(Math.pow(Number(a), 1 / k)))); const K = BigInt(k);
        if (blen(a) > 1000) { x = 1n << BigInt(Math.ceil(blen(a) / k)); }
        for (let i = 0; i < 2000; i++) { const y = ((K - 1n) * x + a / (x ** (K - 1n))) / K; if (y >= x) break; x = y; }
        while (x ** K > a) x--; while ((x + 1n) ** K <= a) x++;
        return x ** K === a ? x : null;
    }
    const bSqrtFloor = a => { if (a < 2n) return a; let x = BigInt(Math.floor(Math.sqrt(Number(a)))); if (blen(a) > 100) x = 1n << BigInt(Math.ceil(blen(a) / 2)); for (;;) { const y = (x + a / x) >> 1n; if (y >= x) break; x = y; } while (x * x > a) x--; while ((x + 1n) * (x + 1n) <= a) x++; return x; };

    /* ═════════ Nombres complexes (parties à virgule) ═════════ */
    class Cx { constructor(re, im) { this.re = re; this.im = im; } }
    const isC = x => x instanceof Cx;
    const cx = (re, im) => (im === 0 || Object.is(im, -0) ? re : new Cx(re, im));
    const toF = x => (isF(x) ? bToF(x.n, x.d) : isR(x) ? x : NaN);
    const parts = x => (isC(x) ? [x.re, x.im] : [toF(x), 0]);

    /* ═════════ Listes, matrices, textes ═════════ */
    class List { constructor(items) { if (items.length > LIMITS.list) fail(`Liste trop longue (plus de ${LIMITS.list} nombres).`); this.items = items; } }
    class Mat { constructor(a) { this.a = a; this.r = a.length; this.c = a[0]?.length || 0; if (this.r > LIMITS.mat || this.c > LIMITS.mat) fail(`Matrice trop grande (au plus ${LIMITS.mat} × ${LIMITS.mat}).`); } }
    /** un résultat déjà mis en mots (décomposition, base, solutions…) : on ne calcule plus avec */
    class Txt { constructor(text, html, extra = {}) { this.text = text; this.html = html ?? esc(text); Object.assign(this, extra); } }
    const isList = x => x instanceof List, isMat = x => x instanceof Mat, isTxt = x => x instanceof Txt;
    const isNum = x => isF(x) || isR(x) || isC(x);
    const vecOf = x => (isList(x) ? x.items : isMat(x) ? x.a.flat() : [x]);
    function listOrMat(items) {
        if (items.length && items.every(isList)) { const w = items[0].items.length; if (w && items.every(l => l.items.length === w && l.items.every(isNum))) return new Mat(items.map(l => l.items)); }
        return new List(items);
    }

    /* ═════════ Les quatre opérations, la puissance (exactes quand c'est possible) ═════════ */
    const NEED_NUM = (what, x) => fail(`${what} : il faut des nombres ici${isTxt(x) ? ` (« ${x.text} » est un résultat écrit en mots)` : ''}.`);
    function lift2(a, b, f, name) {
        if (isList(a) || isList(b)) {
            if (isList(a) && isList(b)) { if (a.items.length !== b.items.length) fail(`Les deux listes n’ont pas la même longueur (${a.items.length} et ${b.items.length}).`); return new List(a.items.map((x, i) => f(x, b.items[i]))); }
            return isList(a) ? new List(a.items.map(x => f(x, b))) : new List(b.items.map(y => f(a, y)));
        }
        return null;
    }
    function add(a, b) {
        tick();
        const l = lift2(a, b, add); if (l) return l;
        if (isMat(a) || isMat(b)) { if (!isMat(a) || !isMat(b)) fail('On ne peut pas ajouter un nombre et une matrice.', {hint: 'Pour multiplier chaque case, utilise « × ».'}); if (a.r !== b.r || a.c !== b.c) fail(`Les deux matrices n’ont pas la même taille (${a.r} × ${a.c} et ${b.r} × ${b.c}).`); return new Mat(a.a.map((row, i) => row.map((x, j) => add(x, b.a[i][j])))); }
        if (!isNum(a)) NEED_NUM('Addition', a); if (!isNum(b)) NEED_NUM('Addition', b);
        if (isF(a) && isF(b)) return fr(a.n * b.d + b.n * a.d, a.d * b.d);
        if (isC(a) || isC(b)) { const [ar, ai] = parts(a), [br, bi] = parts(b); return cx(ar + br, ai + bi); }
        return toF(a) + toF(b);
    }
    function neg(a) {
        if (isList(a)) return new List(a.items.map(neg)); if (isMat(a)) return new Mat(a.a.map(r => r.map(neg)));
        if (!isNum(a)) NEED_NUM('Signe moins', a);
        if (isF(a)) return new Frac(-a.n, a.d); if (isC(a)) return new Cx(-a.re, -a.im); return -a;
    }
    const sub = (a, b) => add(a, neg(b));
    function mul(a, b) {
        tick();
        if (isMat(a) && isMat(b)) {
            if (a.c !== b.r) fail(`Produit impossible : la 1re matrice a ${a.c} colonne${a.c > 1 ? 's' : ''}, la 2e a ${b.r} ligne${b.r > 1 ? 's' : ''}.`, {hint: 'Pour multiplier deux matrices, il faut autant de colonnes dans la 1re que de lignes dans la 2e.'});
            return new Mat(a.a.map(row => b.a[0].map((_, j) => row.reduce((s, x, k) => add(s, mul(x, b.a[k][j])), ZERO))));
        }
        if (isMat(a) && isList(b)) { if (a.c !== b.items.length) fail(`Produit impossible : la matrice a ${a.c} colonnes et la liste ${b.items.length} nombres.`); return new List(a.a.map(row => row.reduce((s, x, k) => add(s, mul(x, b.items[k])), ZERO))); }
        if (isMat(a) || isMat(b)) { const m = isMat(a) ? a : b, k = isMat(a) ? b : a; if (!isNum(k)) NEED_NUM('Multiplication', k); return new Mat(m.a.map(r => r.map(x => mul(x, k)))); }
        const l = lift2(a, b, mul); if (l) return l;
        if (!isNum(a)) NEED_NUM('Multiplication', a); if (!isNum(b)) NEED_NUM('Multiplication', b);
        if (isF(a) && isF(b)) return fr(a.n * b.n, a.d * b.d);
        if (isC(a) || isC(b)) { const [ar, ai] = parts(a), [br, bi] = parts(b); return cx(ar * br - ai * bi, ar * bi + ai * br); }
        return toF(a) * toF(b);
    }
    function inv1(b) {
        if (isZero(b)) fail('Division par zéro : on ne peut pas diviser par 0.');
        if (isF(b)) return fr(b.d, b.n);
        if (isC(b)) { const q = b.re * b.re + b.im * b.im; return cx(b.re / q, -b.im / q); }
        return 1 / toF(b);
    }
    function div(a, b) {
        tick();
        if (isMat(b)) { if (isMat(a)) return mul(a, matInverse(b)); return mul(a, matInverse(b)); }
        if (isMat(a)) { if (!isNum(b)) NEED_NUM('Division', b); return mul(a, inv1(b)); }
        const l = lift2(a, b, div); if (l) return l;
        if (!isNum(a)) NEED_NUM('Division', a); if (!isNum(b)) NEED_NUM('Division', b);
        if (isZero(b)) fail('Division par zéro : on ne peut pas diviser par 0.');
        if (isF(a) && isF(b)) return fr(a.n * b.d, a.d * b.n);
        return mul(a, inv1(b));
    }
    /* complexes : exp, log, puissance */
    const cexp = z => { const [r, i] = parts(z), e = Math.exp(r); return cx(e * Math.cos(i), e * Math.sin(i)); };
    const clog = z => { const [r, i] = parts(z); if (r === 0 && i === 0) fail('ln(0) n’existe pas (il part vers −∞).'); return cx(Math.log(Math.hypot(r, i)), Math.atan2(i, r)); };
    const cabs = z => { const [r, i] = parts(z); return Math.hypot(r, i); };
    function pow(a, b) {
        tick();
        if (isMat(a)) {
            if (!isInt(b)) fail('Une matrice ne peut être élevée qu’à une puissance entière.');
            if (a.r !== a.c) fail('Seule une matrice carrée peut être élevée à une puissance.');
            let e = b.n, base = a; if (e < 0n) { base = matInverse(a); e = -e; } if (e > 10000n) fail('Puissance trop grande pour une matrice.');
            let res = new Mat(a.a.map((r, i) => r.map((_, j) => (i === j ? ONE : ZERO))));
            while (e > 0n) { if (e & 1n) res = mul(res, base); base = mul(base, base); e >>= 1n; }
            return res;
        }
        const l = lift2(a, b, pow); if (l) return l;
        if (!isNum(a)) NEED_NUM('Puissance', a); if (!isNum(b)) NEED_NUM('Puissance', b);
        if (isF(a) && isInt(b)) {
            const e = b.n;
            if (a.n === 0n) { if (e < 0n) fail('Division par zéro : 0 ne peut pas être élevé à une puissance négative.'); return e === 0n ? ONE : ZERO; }
            if (babs(a.n) === a.d) return (e % 2n === 0n || a.n > 0n) ? ONE : new Frac(-1n, 1n);
            const est = Math.max(blen(a.n), blen(a.d)) * Number(babs(e));
            if (est <= LIMITS.bits) return e >= 0n ? fr(a.n ** e, a.d ** e) : fr(a.d ** -e, a.n ** -e);
            const f = Math.pow(toF(a), Number(e)); if (!Number.isFinite(f)) fail('Nombre trop grand pour être calculé.'); return f;
        }
        if (isF(a) && isF(b) && b.d <= 1000n) { // racine exacte : (p/q)^(m/n)
            const k = Number(b.d), neg = a.n < 0n;
            if (!neg || k % 2 === 1) {
                const rn = bRoot(babs(a.n), k), rd = bRoot(a.d, k);
                if (rn !== null && rd !== null) return pow(fr(neg ? -rn : rn, rd), new Frac(b.n, 1n));
                if (neg) { const r = Math.pow(-toF(a), toF(b)); return b.n % 2n !== 0n ? -r : r; } // (−8)^(1/3) = −2 : racine impaire d'un négatif
            }
        }
        if (isC(a) || isC(b) || toF(a) < 0 && !Number.isInteger(toF(b))) {
            if (isInt(b) && babs(b.n) <= 64n) { let r = ONE, base = a, e = babs(b.n); while (e > 0n) { if (e & 1n) r = mul(r, base); base = mul(base, base); e >>= 1n; } return b.n < 0n ? inv1(r) : r; }
            if (isZero(a)) return ZERO;
            return cexp(mul(b, clog(a)));
        }
        const r = Math.pow(toF(a), toF(b)); if (!Number.isFinite(r)) fail(Number.isNaN(r) ? 'Ce calcul n’a pas de résultat.' : 'Nombre trop grand pour être calculé.'); return r;
    }
    function sqrt(a) {
        if (isList(a)) return new List(a.items.map(sqrt));
        if (isF(a)) {
            if (a.n >= 0n) { const rn = bRoot(a.n, 2), rd = bRoot(a.d, 2); if (rn !== null && rd !== null) return fr(rn, rd); return Math.sqrt(toF(a)); }
            const s = sqrt(new Frac(-a.n, a.d)); return cx(0, toF(s));
        }
        if (isR(a)) return a >= 0 ? Math.sqrt(a) : cx(0, Math.sqrt(-a));
        if (isC(a)) { const m = cabs(a), re = Math.sqrt((m + a.re) / 2), im = Math.sign(a.im || 1) * Math.sqrt((m - a.re) / 2); return cx(re, im); }
        NEED_NUM('Racine', a);
    }
    const real = (x, what) => { if (isC(x)) { if (Math.abs(x.im) < 1e-14 * Math.max(1, Math.abs(x.re))) return x.re; fail(`${what} : il faut un nombre réel (sans i).`); } if (!isF(x) && !isR(x)) NEED_NUM(what, x); return x; };
    const cmp = (a, b) => { if (isF(a) && isF(b)) { const d = a.n * b.d - b.n * a.d; return d < 0n ? -1 : d > 0n ? 1 : 0; } const x = toF(a), y = toF(b); return x < y ? -1 : x > y ? 1 : 0; };
    const intOf = (x, what) => { x = real(x, what); if (isF(x) && x.d === 1n) return x.n; if (isR(x) && Number.isInteger(x) && Math.abs(x) < 2 ** 53) return BigInt(x); fail(`${what} : il faut un nombre entier.`); };

    /* ═════════ Matrices : déterminant, inverse, systèmes (exacts avec des fractions) ═════════ */
    const absNum = x => (isF(x) ? Math.abs(toF(x)) : cabs(x));
    const matOf = (x, what) => { if (isMat(x)) return x; if (isList(x) && x.items.every(isNum)) return new Mat([x.items]); fail(`${what} : il faut une matrice, par exemple [[1 ; 2] ; [3 ; 4]].`); };
    /** élimination de Gauss : {rank, det, rows} ; exacte pour des fractions, pivot le plus grand sinon */
    function gauss(A, B = null) {
        const n = A.r, m = A.c, a = A.a.map((row, i) => [...row, ...(B ? B.a[i] : [])]);
        let det = ONE, r = 0; const exact = a.every(row => row.every(isF));
        for (let c = 0; c < m && r < n; c++) {
            let p = -1, best = 0;
            for (let i = r; i < n; i++) { const v = absNum(a[i][c]); if (!isZero(a[i][c]) && (exact ? p < 0 : v > best)) { p = i; best = v; } }
            if (p < 0 || (!exact && best < 1e-13)) { det = ZERO; continue; }
            if (p !== r) { [a[p], a[r]] = [a[r], a[p]]; det = neg(det); }
            const pv = a[r][c]; det = mul(det, pv);
            for (let j = c; j < a[r].length; j++) a[r][j] = div(a[r][j], pv);
            for (let i = 0; i < n; i++) if (i !== r && !isZero(a[i][c])) { const f = a[i][c]; for (let j = c; j < a[i].length; j++) a[i][j] = sub(a[i][j], mul(f, a[r][j])); }
            r++;
        }
        return {rank: r, det: r < Math.min(n, m) ? ZERO : det, rows: a};
    }
    function matDet(x) { const A = matOf(x, 'Déterminant'); if (A.r !== A.c) fail(`Le déterminant demande une matrice carrée (celle-ci fait ${A.r} × ${A.c}).`); return gauss(A).det; }
    function matInverse(x) {
        const A = matOf(x, 'Inverse'); if (A.r !== A.c) fail(`Seule une matrice carrée a un inverse (celle-ci fait ${A.r} × ${A.c}).`);
        const I = new Mat(A.a.map((r, i) => r.map((_, j) => (i === j ? ONE : ZERO)))), g = gauss(A, I);
        if (g.rank < A.r || isZero(g.det)) fail('Cette matrice n’a pas d’inverse (son déterminant vaut 0).');
        return new Mat(g.rows.map(row => row.slice(A.c)));
    }
    const transpose = x => { const A = matOf(x, 'Transposée'); return new Mat(A.a[0].map((_, j) => A.a.map(r => r[j]))); };
    function solveLinear(A, b) {
        const B = new Mat(b.map(v => [v])), g = gauss(A, B);
        if (g.rank < A.c) {
            const bad = g.rows.slice(g.rank).some(row => !isZero(row[A.c]) && row.slice(0, A.c).every(isZero));
            fail(bad ? 'Ce système n’a aucune solution (les équations se contredisent).' : 'Ce système a une infinité de solutions (des équations disent la même chose).');
        }
        if (g.rows.slice(A.c).some(row => !isZero(row[A.c]))) fail('Ce système n’a aucune solution (les équations se contredisent).');
        return g.rows.slice(0, A.c).map(row => row[A.c]);
    }

    /* ═════════ Arithmétique : pgcd, premiers, décomposition, combinatoire ═════════ */
    const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    const modPow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
    function isPrime(n) {
        if (n < 2n) return false;
        for (const p of SMALL_PRIMES) { if (n === p) return true; if (n % p === 0n) return false; }
        let d = n - 1n, s = 0; while ((d & 1n) === 0n) { d >>= 1n; s++; }
        for (const a of SMALL_PRIMES) { // déterministe jusqu'à 3,3 × 10^24
            let x = modPow(a, d, n); if (x === 1n || x === n - 1n) continue;
            let ok = false; for (let i = 1; i < s; i++) { x = x * x % n; if (x === n - 1n) { ok = true; break; } }
            if (!ok) return false;
        }
        return true;
    }
    function rho(n) { // Pollard-Brent
        if (n % 2n === 0n) return 2n;
        for (let c = 1n; c < 50n; c++) {
            let x = 2n, y = 2n, d = 1n; const f = v => (v * v + c) % n; let steps = 0;
            while (d === 1n) { x = f(x); y = f(f(y)); d = bgcd(x - y, n); if (++steps > 200000) break; }
            if (d !== n && d !== 1n) return d;
        }
        return null;
    }
    function factorize(n) {
        if (n < 0n) n = -n; const out = new Map(), addF = (p, k = 1) => out.set(p, (out.get(p) || 0) + k);
        if (n < 2n) return out;
        for (let p = 2n; p < 10000n && p * p <= n; p += (p === 2n ? 1n : 2n)) { while (n % p === 0n) { addF(p); n /= p; } }
        const stack = n > 1n ? [n] : [];
        while (stack.length) {
            const m = stack.pop(); if (m === 1n) continue;
            if (isPrime(m)) { addF(m); continue; }
            const r = bSqrtFloor(m); if (r * r === m) { stack.push(r, r); continue; }
            const d = rho(m); if (!d) fail('Ce nombre est trop dur à décomposer.'); stack.push(d, m / d);
        }
        return new Map([...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    }
    const SUP = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻'};
    const sup = s => String(s).split('').map(c => SUP[c] || c).join('');
    function factorsTxt(n) {
        if (babs(n) > 10n ** 30n) fail('Ce nombre est trop grand pour être décomposé (au plus 30 chiffres).');
        if (babs(n) < 2n) return new Txt(String(n), esc(String(n)), {note: `${n} n’a pas de facteur premier.`});
        const f = factorize(n), sgn = n < 0n ? '−' : '';
        const text = sgn + [...f].map(([p, k]) => (k > 1 ? `${p}^${k}` : `${p}`)).join(' × ');
        const html = sgn + [...f].map(([p, k]) => (k > 1 ? `${p}<sup>${k}</sup>` : `${p}`)).join(' × ');
        const prime = f.size === 1 && [...f.values()][0] === 1;
        return new Txt(text.replace(/\^(\d+)/g, (_, d) => sup(d)), html, {note: prime ? `${babs(n)} est un nombre premier.` : `${[...f].reduce((s, [, k]) => s * (k + 1), 1)} diviseurs.`});
    }
    const fact = n => { if (n > BigInt(LIMITS.fact)) fail(`Factorielle trop grande : au plus ${LIMITS.fact}!.`); let r = 1n; for (let k = 2n; k <= n; k++) r *= k; return r; };
    const nCk = (n, k) => { if (k < 0n || k > n) return 0n; if (k > n - k) k = n - k; if (k > 100000n) fail('Nombre trop grand pour être calculé.'); let r = 1n; for (let i = 1n; i <= k; i++) r = r * (n - k + i) / i; return r; };
    const nAk = (n, k) => { if (k < 0n || k > n) return 0n; if (k > 100000n) fail('Nombre trop grand pour être calculé.'); let r = 1n; for (let i = 0n; i < k; i++) r *= n - i; return r; };
    function gamma(x) { // Lanczos
        if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
        const g = 607 / 128, c = [0.99999999999999709182, 57.156235665862923517, -59.597960355475491248, 14.136097974741747174, -0.49191381609762019978, 0.33994649984811888699e-4, 0.46523628927048575665e-4, -0.98374475304879564677e-4, 0.15808870322491248884e-3, -0.21026444172410488319e-3, 0.21743961811521264320e-3, -0.16431810653676389022e-3, 0.84418223983852743293e-4, -0.26190838401581408670e-4, 0.36899182659531622704e-5]; // précision 10⁻¹⁵
        x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < c.length; i++) a += c[i] / (x + i);
        return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
    }
    function factorial(x) {
        x = real(x, 'Factorielle');
        if (isInt(x)) { if (x.n < 0n) fail('La factorielle n’existe pas pour un entier négatif.', {hint: 'n! = 1 × 2 × … × n, pour n = 0, 1, 2…'}); return fr(fact(x.n)); }
        const v = toF(x); if (Number.isInteger(v)) { if (v < 0) fail('La factorielle n’existe pas pour un entier négatif.'); return fr(fact(BigInt(v))); }
        const r = gamma(v + 1); if (!Number.isFinite(r)) fail('Nombre trop grand pour être calculé.'); return r;
    }
    const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function toBase(x, b) {
        const n = intOf(x, 'Changement de base'); if (b < 2 || b > 36) fail('La base va de 2 à 36.');
        const s = (n < 0n ? '-' : '') + babs(n).toString(b).toUpperCase();
        const pre = {2: '0b', 8: '0o', 16: '0x'}[b] || '';
        const grouped = b === 2 ? s.replace(/\B(?=(\d{4})+(?!\d))/g, ' ') : s;
        return new Txt(pre ? (n < 0n ? '-' : '') + pre + s.replace('-', '') : s, `${esc(grouped)}<sub>${b}</sub>`, {note: `${n} écrit en base ${b}${pre ? ` (à retaper : ${n < 0n ? '-' : ''}${pre}${s.replace('-', '')})` : ''}`});
    }

    /* ═════════ Statistiques sur une liste ═════════ */
    const flatNums = (args, what) => { const v = args.flatMap(vecOf); if (!v.length) fail(`${what} : la liste est vide.`); v.forEach(x => { if (!isNum(x)) NEED_NUM(what, x); }); return v; };
    const sortReal = (v, what) => v.map(x => real(x, what)).sort(cmp);
    const sum = v => v.reduce((s, x) => add(s, x), ZERO);
    const mean = v => div(sum(v), fr(v.length));
    const variance = (v, sample) => { if (sample && v.length < 2) fail('L’écart-type d’un échantillon demande au moins 2 nombres.'); const m = mean(v), s = v.reduce((t, x) => { const d = sub(x, m); return add(t, mul(d, d)); }, ZERO); return div(s, fr(v.length - (sample ? 1 : 0))); };
    const median = v => { const s = sortReal(v, 'Médiane'), n = s.length; return n % 2 ? s[(n - 1) >> 1] : div(add(s[n / 2 - 1], s[n / 2]), fr(2)); };
    const quart = (v, q) => { const s = sortReal(v, 'Quartile'), n = s.length, k = Math.ceil(q * n) - 1; return s[Math.max(0, Math.min(n - 1, k))]; }; // définition du lycée en France

    /* ═════════ Les angles ═════════ */
    const ANGLE = {deg: Math.PI / 180, rad: 1, grad: Math.PI / 200};
    const toRad = (x, env) => mul(x, ANGLE[env.angle] ?? 1);
    const fromRad = (x, env) => (env.angle === 'rad' ? x : div(x, ANGLE[env.angle]));
    /** sinus exact des angles remarquables en degrés (0, 30, 90, 150…) : 1/2, 1, 0… sinon null */
    function exactSin(x, env) {
        if (!isF(x) || env.angle === 'rad') return x && isF(x) && x.n === 0n ? ZERO : null;
        let d = env.angle === 'grad' ? mul(x, fr(9n, 10n)) : x; if (!isInt(d)) return null;
        const r = Number(((d.n % 360n) + 360n) % 360n), T = {0: ZERO, 30: fr(1, 2), 90: ONE, 150: fr(1, 2), 180: ZERO, 210: fr(-1, 2), 270: fr(-1), 330: fr(-1, 2)};
        return T[r] ?? null;
    }
    const exactCos = (x, env) => (isF(x) && env.angle !== 'rad' ? exactSin(add(x, env.angle === 'grad' ? fr(100) : fr(90)), env) : isF(x) && x.n === 0n ? ONE : null);

    /* ═════════ Fonctions réelles et complexes ═════════ */
    const csin = z => { const [a, b] = parts(z); return cx(Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)); };
    const ccos = z => { const [a, b] = parts(z); return cx(Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)); };
    const I = new Cx(0, 1);
    const casin = z => mul(neg(I), clog(add(mul(I, z), sqrt(sub(ONE, mul(z, z)))))); // −i ln(iz + √(1−z²))
    const cacos = z => sub(Math.PI / 2, casin(z));
    const catan = z => mul(new Cx(0, 0.5), sub(clog(sub(ONE, mul(I, z))), clog(add(ONE, mul(I, z)))));
    const mapNum = (x, f) => (isList(x) ? new List(x.items.map(y => mapNum(y, f))) : isMat(x) ? new Mat(x.a.map(r => r.map(y => mapNum(y, f)))) : isNum(x) ? f(x) : NEED_NUM('Fonction', x));
    /** f réel (si x réel et dans le domaine), sinon cf complexe */
    const rc = (x, rf, cf, inDom = () => true) => mapNum(x, v => { if (!isC(v) && inDom(toF(v))) { const r = rf(toF(v)); if (Number.isFinite(r)) return fracOfFloat(r); fail('Ce calcul n’a pas de résultat fini.'); } return cf(v); });
    function roundTo(x, n, mode = 'round') {
        return mapNum(x, v => {
            if (isC(v)) return cx(toF(roundTo(v.re, n, mode)), toF(roundTo(v.im, n, mode)));
            const k = 10n ** BigInt(Math.max(0, n)), q = isF(v) ? v : (approxFrac(v, 1e12) || null);
            if (q && isF(q)) { const t = q.n * k, d = q.d; let r = t / d, rem = t % d; if (mode === 'floor') { if (rem < 0n) r -= 1n; } else if (mode === 'ceil') { if (rem > 0n) r += 1n; } else if (mode === 'trunc') { /* vers 0 */ } else { const twice = 2n * babs(rem); if (twice >= d) r += t < 0n ? -1n : 1n; } return fr(r, k); }
            const p = Math.pow(10, n), f = {floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc, round: y => Math.sign(y) * Math.round(Math.abs(y))}[mode]; return f(toF(v) * p) / p;
        });
    }

    /* ═════════ Le lecteur : jetons ═════════ */
    const SUPMAP = {'⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-'};
    function prepare(src) {
        return String(src)
            .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => `^(${m.split('').map(c => SUPMAP[c]).join('')})`)
            .replace(/[×·∙⋅]/g, '*').replace(/[÷:]/g, '/').replace(/[−–—]/g, '-').replace(/\*\*/g, '^')
            .replace(/[  ]/g, ' ').replace(/≠/g, '<>');
    }
    const IS_LETTER = /[A-Za-zÀ-ɏπφθ_]/;
    function tokenize(src, {dec = ','} = {}) {
        const s = prepare(src), toks = []; let i = 0;
        if (s.length > LIMITS.input) fail(`Calcul trop long (plus de ${LIMITS.input} signes).`);
        const push = (t, v, pos, raw) => { toks.push({t, v, pos, raw}); if (toks.length > LIMITS.tokens) fail('Calcul trop long.'); };
        while (i < s.length) {
            const c = s[i];
            if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
            // nombres : 0x1F, 0b101, 0o17, 12,5 ou 12.5, 1,5e-3 ; « 1 234 » (espace des milliers)
            if (/[0-9]/.test(c) || ((c === '.' || (c === ',' && dec === ',')) && /[0-9]/.test(s[i + 1] || ''))) {
                const m0 = /^0([xob])([0-9a-f]+)/i.exec(s.slice(i));
                if (m0) { const base = {x: 16, o: 8, b: 2}[m0[1].toLowerCase()], digits = m0[2].toLowerCase(), ok = [...digits].every(ch => parseInt(ch, 36) < base); if (!ok) fail(`« ${m0[0]} » n’est pas un nombre en base ${base}.`, {pos: i}); push('num', fr(BigInt((base === 16 ? '0x' : base === 8 ? '0o' : '0b') + digits)), i, m0[0]); i += m0[0].length; continue; }
                let j = i, int = '';
                while (j < s.length && /[0-9]/.test(s[j])) int += s[j++];
                while (/^ [0-9]{3}(?![0-9])/.test(s.slice(j)) && int.length && int.length <= 3 + 4 * 6 && !/[0-9]/.test(s[j + 4] || '') && (toks.length === 0 || toks[toks.length - 1].t !== 'num')) { // milliers « 1 234 567 »
                    if (/[0-9]/.test(s[j + 4] || '')) break; int += s.slice(j + 1, j + 4); j += 4;
                }
                let fracPart = '';
                const isDec = ch => ch === '.' || (ch === ',' && dec === ',');
                if (isDec(s[j]) && /[0-9]/.test(s[j + 1] || '')) { j++; while (j < s.length && /[0-9]/.test(s[j])) fracPart += s[j++]; }
                else if (isDec(s[j]) && s[j] === '.' && !/[0-9]/.test(s[j + 1] || '')) j++; // « 2. »
                let exp = 0n; const em = /^[eE]([+-]?\d{1,6})(?![A-Za-z])/.exec(s.slice(j));
                if (em) { exp = BigInt(em[1]); j += em[0].length; }
                let n = BigInt((int || '0') + fracPart), d = 10n ** BigInt(fracPart.length);
                if (babs(exp) > 5000n) fail('Nombre trop grand pour être calculé.', {pos: i});
                if (exp > 0n) n *= 10n ** exp; else if (exp < 0n) d *= 10n ** -exp;
                push('num', fr(n, d), i, s.slice(i, j)); i = j; continue;
            }
            if (IS_LETTER.test(c)) {
                let j = i; while (j < s.length && /[A-Za-zÀ-ɏπφθ_0-9.]/.test(s[j]) && !(s[j] === '.' && !/[A-Za-z_]/.test(s[j + 1] || ''))) j++;
                push('id', s.slice(i, j), i, s.slice(i, j)); i = j; continue;
            }
            if (c === '√' || c === '∛' || c === '∜') { push('id', c === '√' ? 'sqrt' : c === '∛' ? 'cbrt' : 'root4', i, c); toks[toks.length - 1].prefix = true; i++; continue; }
            if (c === '<' || c === '>') { const two = s.slice(i, i + 2); if (['<=', '>=', '<>'].includes(two)) { push('op', two, i, two); i += 2; } else { push('op', c, i, c); i++; } continue; }
            if (c === '≤' || c === '≥') { push('op', c === '≤' ? '<=' : '>=', i, c); i++; continue; }
            if ('+-*/^!%='.includes(c)) { push('op', c, i, c); i++; continue; }
            if (c === '(') { push('lp', c, i, c); i++; continue; }
            if (c === ')') { push('rp', c, i, c); i++; continue; }
            if (c === '[') { push('lb', c, i, c); i++; continue; }
            if (c === ']') { push('rb', c, i, c); i++; continue; }
            if (c === ';' || c === ',') { push('sep', c, i, c); i++; continue; }
            if (c === '|') { push('bar', c, i, c); i++; continue; }
            if (c === '°') { push('deg', c, i, c); i++; continue; }
            if (c === '∞') { push('id', 'inf', i, c); i++; continue; }
            fail(`Je ne comprends pas le signe « ${c} ».`, {pos: i, hint: 'Les signes compris : + − × ÷ ^ ! % ( ) [ ] ; = et les noms des fonctions.'});
        }
        return toks;
    }

    /* ═════════ Le lecteur : arbre ═════════ */
    const isFn = name => !!FN[fnKey(name)];
    const CONSTS = {pi: 'π', 'π': 'π', e: 'e', phi: 'φ', 'φ': 'φ', i: 'i', inf: '∞', ans: 'ans', rep: 'ans'};
    const isConst = name => Object.prototype.hasOwnProperty.call(CONSTS, name) || Object.prototype.hasOwnProperty.call(CONSTS, fold(name));
    const VAR_LETTERS = /^[a-zA-Zθ]$/;
    /** « sinx », « 2pix », « xy » : coupés en morceaux connus (fonctions, constantes, lettres seules) ; sinon tel quel */
    function splitIdent(name) {
        if (isFn(name) || isConst(name) || VAR_LETTERS.test(name) || /\d/.test(name)) return [name];
        const keys = [...Object.keys(FN), ...Object.keys(ALIAS), 'pi', 'phi'].filter(k => k.length > 1).sort((a, b) => b.length - a.length);
        const out = []; let s = name;
        while (s) {
            const k = keys.find(x => fold(s).startsWith(x));
            if (k) { out.push(s.slice(0, k.length)); s = s.slice(k.length); continue; }
            if (/^[xyzt]/i.test(s)) { out.push(s[0]); s = s.slice(1); continue; }
            return [name];
        }
        return out;
    }
    const OPNAME = {'+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', '=': '='};
    function parse(src, opts = {}) {
        const toks0 = tokenize(src, opts), toks = [];
        toks0.forEach(t => { if (t.t === 'id' && !t.prefix) splitIdent(t.v).forEach((v, k, a) => toks.push({...t, v, raw: v, split: a.length > 1, pos: t.pos + a.slice(0, k).join('').length})); else toks.push(t); });
        if (!toks.length) fail('Tape un calcul.');
        let p = 0, depth = 0, inAbs = 0;
        const peek = () => toks[p], next = () => toks[p++];
        const isOp = (t, v) => t && t.t === 'op' && (v === undefined || t.v === v);
        const deeper = () => { if (++depth > LIMITS.depth) fail('Trop de parenthèses imbriquées.'); };
        const endPos = () => { const t = toks[Math.min(p, toks.length) - 1]; return t ? t.pos + String(t.raw).length : 0; };
        const missing = (after) => {
            const t = peek();
            if (!t) return fail(after ? `Il manque un nombre après « ${OPNAME[after.v] || after.raw} ».` : 'Il manque un nombre à la fin.', {pos: endPos()});
            if (t.t === 'rp') return fail(after ? `Il manque un nombre après « ${OPNAME[after.v] || after.raw} », avant « ) ».` : 'Il y a une parenthèse fermante « ) » de trop, ou il manque un nombre avant elle.', {pos: t.pos});
            if (t.t === 'op') return fail(`Il manque un nombre avant « ${OPNAME[t.v] || t.raw} ».`, {pos: t.pos});
            if (t.t === 'sep') return fail(`Le signe « ${t.v} » sépare les nombres d’une fonction, comme pgcd(12 ; 18).`, {pos: t.pos, hint: opts.dec === ',' ? 'Pour un nombre à virgule, colle la virgule aux chiffres : 2,5.' : ''});
            return fail(`Je ne comprends pas « ${t.raw} » ici.`, {pos: t.pos});
        };
        const startsPrimary = t => t && (t.t === 'num' || t.t === 'id' || t.t === 'lp' || t.t === 'lb' || (t.t === 'bar' && !inAbs));
        function expr() { deeper(); const e = equation(); depth--; return e; }
        function equation() {
            let a = additive();
            const t = peek();
            if (t && t.t === 'op' && ['=', '<', '>', '<=', '>=', '<>'].includes(t.v)) { next(); if (!peek() || !startsPrimary(peek()) && !isOp(peek(), '-') && !isOp(peek(), '+') && peek().t !== 'id') missing(t); const b = additive(); a = {k: t.v === '=' ? 'eq' : 'cmp', op: t.v, a, b, pos: t.pos}; }
            return a;
        }
        function additive() {
            let a = multiplicative();
            for (;;) { const t = peek(); if (!isOp(t, '+') && !isOp(t, '-')) break; next(); if (!peek()) missing(t); const b = multiplicative(); a = {k: 'bin', op: t.v, a, b, pos: t.pos}; }
            return a;
        }
        function multiplicative() {
            let a = implicit();
            for (;;) {
                const t = peek();
                if (isOp(t, '*') || isOp(t, '/')) { next(); if (!peek()) missing(t); const b = implicit(); a = {k: 'bin', op: t.v, a, b, pos: t.pos}; continue; }
                if (t && t.t === 'id' && fold(t.v) === 'mod') { next(); if (!peek()) missing(t); const b = implicit(); a = {k: 'call', name: 'mod', args: [a, b], infix: true, pos: t.pos}; continue; }
                break;
            }
            return a;
        }
        function implicit() {
            let a = unary();
            for (;;) {
                const t = peek(); if (!startsPrimary(t) || (t.t === 'id' && fold(t.v) === 'mod')) break;
                const prev = toks[p - 1];
                if (t.t === 'num' && prev && (prev.t === 'num' || prev.t === 'rp' && false)) fail(`Il manque un signe entre « ${prev.raw} » et « ${t.raw} ».`, {pos: t.pos, hint: 'Par exemple « × » ou « + ».'});
                if (t.t === 'id' && fold(t.v) === 'en') break;
                const b = power(); a = {k: 'bin', op: '*', a, b, implicit: true, pos: t.pos};
            }
            return a;
        }
        function unary() {
            const t = peek();
            if (isOp(t, '-') || isOp(t, '+')) { next(); if (!peek()) missing(t); const a = unary(); return t.v === '-' ? {k: 'neg', a, pos: t.pos} : a; }
            return power();
        }
        function power() {
            const base = postfix(); const t = peek();
            if (isOp(t, '^')) { next(); if (!peek()) missing(t); const e = unary(); return {k: 'bin', op: '^', a: base, b: e, pos: t.pos}; }
            return base;
        }
        function postfix() {
            let a = primary();
            for (;;) { const t = peek(); if (isOp(t, '!')) { next(); a = {k: 'post', op: '!', a, pos: t.pos}; } else if (isOp(t, '%')) { next(); a = {k: 'post', op: '%', a, pos: t.pos}; } else if (t && t.t === 'deg') { next(); a = {k: 'post', op: '°', a, pos: t.pos}; } else break; }
            return a;
        }
        function args(name, t0) {
            const out = []; deeper();
            if (peek() && peek().t === 'rp') { next(); depth--; return out; }
            for (;;) {
                if (!peek()) fail(`Il manque une parenthèse fermante « ) » après ${name}(…).`, {pos: endPos(), hint: 'Ajoute « ) » à la fin.'});
                out.push(expr());
                const t = peek();
                if (t && t.t === 'sep') { next(); continue; }
                if (t && t.t === 'rp') { next(); break; }
                if (!t) fail(`Il manque une parenthèse fermante « ) » après ${name}(…).`, {pos: endPos(), hint: 'Ajoute « ) » à la fin.'});
                fail(`Je ne comprends pas « ${t.raw} » dans ${name}(…).`, {pos: t.pos});
            }
            depth--; return out;
        }
        function primary() {
            const t = next();
            if (!t) { p--; return missing(toks[p - 1]); }
            if (t.t === 'num') return {k: 'num', v: t.v, raw: t.raw, pos: t.pos};
            if (t.t === 'lp') {
                if (peek() && peek().t === 'rp') fail('Les parenthèses sont vides.', {pos: t.pos});
                const e = expr(); const c = next();
                if (!c || c.t !== 'rp') { if (c && c.t === 'sep') fail('Le signe « ; » sépare les nombres d’une fonction, comme pgcd(12 ; 18) — il n’a pas sa place ici.', {pos: c.pos}); fail('Il manque une parenthèse fermante « ) ».', {pos: c ? c.pos : endPos(), hint: 'Ajoute « ) » à la fin.'}); }
                return {...e, paren: true};
            }
            if (t.t === 'lb') {
                const items = []; deeper();
                if (peek() && peek().t === 'rb') { next(); depth--; return {k: 'list', items, pos: t.pos}; }
                for (;;) { if (!peek()) fail('Il manque un crochet fermant « ] ».', {pos: endPos()}); items.push(expr()); const c = next(); if (c && c.t === 'sep') continue; if (c && c.t === 'rb') break; fail(c ? `Je ne comprends pas « ${c.raw} » dans la liste.` : 'Il manque un crochet fermant « ] ».', {pos: c ? c.pos : endPos(), hint: 'Une liste s’écrit [1 ; 2 ; 3].'}); }
                depth--; return {k: 'list', items, pos: t.pos};
            }
            if (t.t === 'bar') { inAbs++; const e = expr(); inAbs--; const c = next(); if (!c || c.t !== 'bar') fail('Il manque la barre fermante « | » de la valeur absolue.', {pos: c ? c.pos : endPos()}); return {k: 'call', name: 'abs', args: [e], bars: true, pos: t.pos}; }
            if (t.t === 'id') {
                const name = t.v;
                if (isFn(name) && !(VAR_LETTERS.test(name) && !(peek() && peek().t === 'lp') && !t.prefix)) {
                    if (peek() && peek().t === 'lp') { const lp = next(); return {k: 'call', name, args: args(name, lp), pos: t.pos}; }
                    if (!peek() || !startsPrimary(peek()) && !isOp(peek(), '-')) fail(`Il manque le nombre de ${t.prefix ? `« ${t.raw} »` : `${name}(…)`}.`, {pos: endPos(), hint: t.prefix ? '' : `Par exemple ${name}(30).`});
                    const a = isOp(peek(), '-') ? unary() : power();
                    return {k: 'call', name, args: [a], bare: true, pos: t.pos};
                }
                return {k: 'id', name, pos: t.pos, split: t.split};
            }
            if (t.t === 'rp') fail('Il y a une parenthèse fermante « ) » de trop.', {pos: t.pos, hint: 'Retire-la, ou ajoute « ( » avant.'});
            if (t.t === 'rb') fail('Il y a un crochet fermant « ] » de trop.', {pos: t.pos});
            p--; return missing(toks[p - 1]);
        }
        const tree = expr();
        if (p < toks.length) {
            const t = toks[p];
            if (t.t === 'rp') fail('Il y a une parenthèse fermante « ) » de trop.', {pos: t.pos, hint: 'Retire-la, ou ajoute « ( » avant.'});
            if (t.t === 'sep') fail(`Le signe « ${t.v} » sépare les nombres d’une fonction, comme pgcd(12 ; 18).`, {pos: t.pos, hint: opts.dec === ',' ? 'Pour un nombre à virgule, colle la virgule aux chiffres : 2,5.' : ''});
            if (t.t === 'num') fail(`Il manque un signe avant « ${t.raw} ».`, {pos: t.pos, hint: 'Par exemple « × » ou « + ».'});
            fail(`Je ne comprends pas « ${t.raw} » ici.`, {pos: t.pos});
        }
        return tree;
    }
    /** les lettres libres d'un arbre (x, y, n…) qui ne sont ni une constante, ni une fonction, ni déjà liées */
    function freeVars(node, bound = new Set(), out = new Set()) {
        if (!node || typeof node !== 'object') return out;
        if (node.k === 'id' && !isConst(node.name) && !bound.has(node.name)) out.add(node.name);
        if (node.k === 'call') {
            const key = fnKey(node.name), def = FN[key];
            if (def?.binds) { const v = def.binds(node.args); const b2 = new Set(bound); if (v) b2.add(v); node.args.forEach((a, i) => { if (!(def.varArg === i)) freeVars(a, i === 0 ? b2 : bound, out); }); return out; }
            node.args.forEach(a => freeVars(a, bound, out));
        }
        ['a', 'b'].forEach(k => node[k] && freeVars(node[k], bound, out));
        (node.items || []).forEach(a => freeVars(a, bound, out));
        return out;
    }

    /* ═════════ Le calcul ═════════ */
    function evaluateNode(node, env) {
        tick();
        switch (node.k) {
            case 'num': return env.float ? toF(node.v) : node.v;
            case 'id': return lookup(node, env);
            case 'neg': return neg(evaluateNode(node.a, env));
            case 'list': return listOrMat(node.items.map(n => evaluateNode(n, env)));
            case 'post': {
                if (node.op === '%') return div(evaluateNode(node.a, env), fr(100));
                if (node.op === '°') { const v = evaluateNode(node.a, env); return env.angle === 'deg' ? v : env.angle === 'grad' ? mul(v, fr(10n, 9n)) : mul(v, Math.PI / 180); }
                return mapNum(evaluateNode(node.a, env), factorial);
            }
            case 'bin': {
                const a = evaluateNode(node.a, env);
                // « 200 + 10 % » = 220 ; « 200 − 10 % » = 180 (comme sur une calculette de poche)
                if ((node.op === '+' || node.op === '-') && node.b.k === 'post' && node.b.op === '%' && !node.b.paren) { const pc = mul(a, evaluateNode(node.b, env)); return node.op === '+' ? add(a, pc) : sub(a, pc); }
                const b = evaluateNode(node.b, env);
                return node.op === '+' ? add(a, b) : node.op === '-' ? sub(a, b) : node.op === '*' ? mul(a, b) : node.op === '/' ? div(a, b) : pow(a, b);
            }
            case 'cmp': { const a = real(evaluateNode(node.a, env), 'Comparaison'), b = real(evaluateNode(node.b, env), 'Comparaison'), c = cmp(a, b), ok = {'<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0, '<>': c !== 0}[node.op]; return new Txt(ok ? 'VRAI' : 'FAUX', ok ? 'Vrai ✓' : 'Faux', {bool: ok}); }
            case 'eq': {
                if (env.inEq) fail('Une équation ne peut pas contenir un autre signe « = ».');
                const a = evaluateNode(node.a, env), b = evaluateNode(node.b, env);
                if (isNum(a) && isNum(b)) { const d = sub(a, b), ok = isF(d) ? d.n === 0n : cabs(d) < 1e-12 * Math.max(1, cabs(a)); return new Txt(ok ? 'VRAI' : 'FAUX', ok ? 'Vrai ✓' : 'Faux', {bool: ok}); }
                fail('Je ne sais comparer avec « = » que des nombres.');
            }
            case 'call': return callFn(node, env);
        }
        fail('Je ne comprends pas ce calcul.');
    }
    function lookup(node, env) {
        const n = node.name;
        if (env.vars && Object.prototype.hasOwnProperty.call(env.vars, n)) return env.vars[n];
        const c = CONSTS[n] ?? CONSTS[fold(n)];
        if (c === 'π') return Math.PI; if (c === 'e') return Math.E; if (c === 'φ') return (1 + Math.sqrt(5)) / 2; if (c === 'i') return new Cx(0, 1);
        if (c === '∞') fail('L’infini (∞) n’est pas un nombre : je ne peux pas calculer avec.');
        if (c === 'ans') { if (env.ans === undefined || env.ans === null) fail('Il n’y a pas encore de résultat précédent (ans).'); return env.ans; }
        if (isFn(n)) fail(`${n} est une fonction : écris ${n}(…) avec son nombre entre parenthèses.`, {pos: node.pos});
        if (VAR_LETTERS.test(n)) fail(`La lettre « ${n} » n’a pas de valeur.`, {pos: node.pos, hint: env.top ? `Pour une équation, ajoute « = … » (x² = 4) ; pour une courbe, ouvre l’onglet 📈 Courbes.` : ''});
        const s = suggest(n);
        fail(`Je ne connais pas « ${n} ».${s ? ` Voulais-tu dire « ${s} » ?` : ''}`, {pos: node.pos, hint: 'La liste des fonctions est dans le mode 🧪 Scientifique (rubriques en haut des touches).'});
    }
    /** distance entre deux mots (une lettre en trop, en moins, changée ou deux lettres inversées = 1) */
    const lev = (a, b) => { const m = a.length, n = b.length, d = Array.from({length: m + 1}, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) { d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); } return d[m][n]; };
    function suggest(name) {
        const f = fold(name); let best = '', bd = 3;
        [...Object.keys(FN), ...Object.keys(ALIAS)].forEach(k => { const d = lev(f, k); if (d < bd && d <= (k.length <= 4 ? 1 : 2) && f.length >= 2) { bd = d; best = FN[k]?.show || FN[ALIAS[k]]?.show || k; } });
        return best;
    }
    function callFn(node, env) {
        const key = fnKey(node.name), def = FN[key];
        if (!def) fail(`Je ne connais pas la fonction « ${node.name} ».`, {pos: node.pos});
        const n = node.args.length, show = def.show || key;
        if (n < def.min || n > def.max) {
            const need = def.min === def.max ? `${def.min} nombre${def.min > 1 ? 's' : ''}` : def.max === Infinity ? `au moins ${def.min} nombre${def.min > 1 ? 's' : ''}` : `${def.min} à ${def.max} nombres`;
            const commaNum = env.dec === ',' && node.args.some(a => a.k === 'num' && /,/.test(a.raw || ''));
            fail(`${show}(…) demande ${need}${def.min > 1 || def.max > 1 ? ', séparés par « ; »' : ''}.`, {pos: node.pos, hint: commaNum ? `La virgule sert aux nombres à virgule (2,5) : sépare les nombres avec « ; », par exemple ${def.ex || show + '(12 ; 18)'}.` : def.ex ? `Par exemple : ${def.ex}` : ''});
        }
        if (def.lazy) return def.f(node.args, env, node);
        const vals = node.args.map(a => evaluateNode(a, env));
        return def.f(vals, env, node);
    }

    /* ═════════ Équations, dérivées, intégrales ═════════ */
    const withVar = (env, name, v) => ({...env, vars: {...(env.vars || {}), [name]: v}});
    const evalAt = (node, env, name, x) => evaluateNode(node, withVar(env, name, x));
    /** le polynôme (coefficients du plus haut degré au plus bas, exacts si possible) d'une expression en une lettre, ou null */
    /** l'arbre n'a que + − × ÷ (par un nombre) et des puissances entières de la lettre ? (sinon ce n'est pas un polynôme) */
    function polyShape(n, name) {
        const has = m => freeVars(m).has(name) || (m.k === 'id' && m.name === name);
        switch (n.k) {
            case 'num': case 'id': return true;
            case 'neg': return polyShape(n.a, name);
            case 'post': return n.op === '%' ? polyShape(n.a, name) : !has(n.a);
            case 'list': return false;
            case 'eq': case 'cmp': return polyShape(n.a, name) && polyShape(n.b, name);
            case 'bin':
                if (n.op === '+' || n.op === '-' || n.op === '*') return polyShape(n.a, name) && polyShape(n.b, name);
                if (n.op === '/') return polyShape(n.a, name) && !has(n.b);
                if (n.op === '^') return !has(n.b) && polyShape(n.a, name);
                return false;
            case 'call': return !has(n);
        }
        return false;
    }
    function polyOf(node, env, name, maxDeg = 4) {
        if (!polyShape(node, name)) return null;
        const pts = [], vals = [];
        try { for (let k = 0; k <= maxDeg + 3; k++) { const x = fr(k - 2); pts.push(x); const v = evalAt(node, env, name, x); if (!isNum(v)) return null; vals.push(v); } } catch (e) { if (e.calc && /Division par zéro|pas de résultat|n’existe pas/.test(e.message)) return null; throw e; }
        const exact = vals.every(isF);
        // différences finies : le degré est le dernier rang non nul
        let diff = vals.slice(), deg = -1; const tol = exact ? 0 : 1e-9 * Math.max(1, ...vals.map(absNum));
        for (let r = 0; r < vals.length; r++) { if (diff.some(v => absNum(v) > tol)) deg = r; diff = diff.slice(1).map((v, i) => sub(v, diff[i])); }
        if (deg > maxDeg) return null;
        if (deg < 0) return {coefs: [ZERO], exact, deg: 0};
        const n = deg + 1, A = new Mat(pts.slice(0, n).map(x => Array.from({length: n}, (_, j) => pow(x, fr(n - 1 - j))))), c = solveLinear(A, vals.slice(0, n));
        // vérifie en deux autres points (1/3 et 17) : sinon ce n'était pas un polynôme
        for (const x of [fr(1, 3), fr(17)]) { let y; try { y = evalAt(node, env, name, x); } catch (_) { return null; } if (!isNum(y)) return null; const p = c.reduce((s, a) => add(mul(s, x), a), ZERO), d = sub(p, y); if (exact && isF(y) ? !isZero(d) : absNum(d) > 1e-7 * Math.max(1, absNum(y))) return null; }
        const coefs = c.map(v => (exact ? v : (isC(v) ? v : snap(toF(v)))));
        return {coefs, exact, deg};
    }
    const snap = v => { const r = Math.round(v); if (Math.abs(v - r) < 1e-10 * Math.max(1, Math.abs(v))) return fracOfFloat(r); const q = approxFrac(v, 10000); return q && isF(q) ? q : v; };
    const polyEval = (c, x) => c.reduce((s, a) => add(mul(s, x), a), ZERO);
    /** √n simplifié : [k, m] avec n = k² m (m sans carré, facteurs jusqu'à 10⁶) */
    function surd(n) { let k = 1n, m = n; for (let p = 2n; p * p <= m && p < 1000000n; p++) { while (m % (p * p) === 0n) { m /= p * p; k *= p; } } return [k, m]; }
    function rationalRoots(c) {
        // coefficients entiers : on chasse les dénominateurs
        let L = 1n; c.forEach(x => { L = L * x.d / bgcd(L, x.d); }); let a = c.map(x => x.n * (L / x.d));
        const out = [];
        for (;;) {
            while (a.length > 1 && a[a.length - 1] === 0n) { out.push(ZERO); a = a.slice(0, -1); }
            if (a.length <= 1) break;
            const a0 = babs(a[a.length - 1]), an = babs(a[0]);
            if (a0 > 10n ** 12n || an > 10n ** 12n) break;
            const divs = v => { const r = []; for (let d = 1n; d * d <= v; d++) if (v % d === 0n) { r.push(d); if (d * d !== v) r.push(v / d); } return r; };
            let found = null;
            outer: for (const pp of divs(a0)) for (const q of divs(an)) for (const s of [1n, -1n]) { const x = fr(s * pp, q); if (isZero(polyEval(a.map(v => fr(v)), x))) { found = x; break outer; } }
            if (!found) break;
            out.push(found);
            // division synthétique
            const q = [], fx = found; let r = ZERO; a.map(v => fr(v)).forEach((v, i) => { r = i ? add(mul(r, fx), v) : v; if (i < a.length - 1) q.push(r); });
            let L2 = 1n; q.forEach(x => { L2 = L2 * x.d / bgcd(L2, x.d); }); a = q.map(x => x.n * (L2 / x.d));
        }
        return {roots: out, rest: a.map(v => fr(v))};
    }
    /** les racines d'un polynôme de degré ≤ 4 : [{v, text, html, mult}] et, pour le 2e degré, la forme exacte avec √ */
    function polyRoots(coefs) {
        let c = coefs.slice(); while (c.length > 1 && isZero(c[0])) c.shift();
        const deg = c.length - 1; if (deg < 1) return {deg, roots: []};
        if (deg > 4) fail('Je résous les équations jusqu’au degré 4.');
        const roots = []; const exact = c.every(isF);
        let rest = c;
        if (exact) { const rr = rationalRoots(c); rr.roots.forEach(v => roots.push({v})); rest = rr.rest; }
        const d2 = rest.length - 1;
        if (d2 === 1) roots.push({v: div(neg(rest[1]), rest[0])});
        else if (d2 === 2) {
            const [a, b, cc] = rest, D = sub(mul(b, b), mul(fr(4), mul(a, cc))), h = div(neg(b), mul(fr(2), a)), s = sqrt(D);
            const two = mul(fr(2), a);
            const r1 = add(h, div(s, two)), r2 = sub(h, div(s, two));
            let form = null;
            if (exact && isF(D) && !isF(s)) { // forme exacte : h ± (k/2a)√m (ou i√m)
                const neg_ = D.n < 0n, P = babs(D.n) * D.d, [k, m] = surd(P), coef = div(fr(k, D.d), babs2(two));
                const qn = coef, root = m === 1n ? (neg_ ? 'i' : '1') : neg_ ? `i√${m}` : `√${m}`;
                const cstr = isInt(qn) ? `${qn.n === 1n ? '' : qn.n}${root}` : `${qn.n === 1n ? '' : qn.n}${root}/${qn.d}`;
                const hTxt = isZero(h) ? '' : `${fmtFracPlain(h)} `;
                form = `${hTxt}± ${cstr}`.trim();
            }
            roots.push({v: r1, form, sign: '+'}, {v: r2, form, sign: '−'});
        } else if (d2 >= 3) {
            durandKerner(rest.map(toFc)).forEach(z => roots.push({v: cleanRoot(z, rest)}));
        }
        // multiplicités
        const merged = [];
        roots.forEach(r => { const same = merged.find(m => isF(m.v) && isF(r.v) ? cmp(m.v, r.v) === 0 && !isC(m.v) : cabs(sub(m.v, r.v)) < 1e-9); if (same) same.mult++; else merged.push({...r, mult: 1}); });
        merged.sort((x, y) => { const [a1, b1] = parts(x.v), [a2, b2] = parts(y.v); return (b1 !== 0) - (b2 !== 0) || a1 - a2 || b1 - b2; }); // les réelles d'abord
        return {deg, roots: merged};
    }
    const babs2 = q => (isF(q) && q.n < 0n ? new Frac(-q.n, q.d) : q);
    const toFc = x => (isC(x) ? x : toF(x));
    function durandKerner(c) {
        const n = c.length - 1, a = c.map(v => (isC(v) ? v : new Cx(v, 0))), lead = a[0], m = a.map(v => div(v, lead));
        let z = Array.from({length: n}, (_, k) => cexp(new Cx(Math.log(1 + Math.max(...m.map(cabs))) * 0.5, 2 * Math.PI * k / n + 0.4)));
        const P = x => m.reduce((s, v) => add(mul(s, x), v), ZERO);
        for (let it = 0; it < 800; it++) {
            let moved = 0;
            z = z.map((zi, i) => { let den = ONE; z.forEach((zj, j) => { if (j !== i) den = mul(den, sub(zi, zj)); }); if (isZero(den)) return add(zi, 1e-6); const nz = sub(zi, div(P(zi), den)); moved = Math.max(moved, cabs(sub(nz, zi))); return nz; });
            if (moved < 1e-15) break;
        }
        return z;
    }
    function cleanRoot(z, coefs) {
        let [re, im] = parts(z);
        if (Math.abs(im) < 1e-9 * Math.max(1, Math.abs(re))) im = 0;
        if (im === 0) { const q = approxFrac(re, 10000); if (q && isF(q) && coefs.every(isF) && isZero(polyEval(coefs, q))) return q; return re; }
        return cx(re, im);
    }
    const fmtFracPlain = q => (isInt(q) ? String(q.n) : `${q.n}/${q.d}`);
    /** les racines d'une fonction (pas un polynôme) : changements de signe entre a et b, puis dichotomie */
    function numericRoots(f, a, b, steps = 4000) {
        const out = [], h = (b - a) / steps;
        if (!Array.from({length: 41}, (_, k) => f(a + (b - a) * k / 40)).some(Number.isFinite)) return out; // rien de calculable : inutile de chercher
        let x0 = a, y0 = f(a);
        for (let k = 1; k <= steps; k++) {
            const x1 = a + k * h, y1 = f(x1);
            if (Number.isFinite(y0) && Number.isFinite(y1)) {
                if (y0 === 0) out.push(x0);
                else if (y0 * y1 < 0) {
                    let lo = x0, hi = x1, flo = y0;
                    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2, fm = f(mid); if (!Number.isFinite(fm)) break; if (fm === 0) { lo = hi = mid; break; } if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; } }
                    const r = (lo + hi) / 2, fr_ = f(r);
                    if (Math.abs(fr_) < 1e-6 * Math.max(1, Math.abs(y0), Math.abs(y1))) out.push(r); // pas une asymptote (tan…)
                }
            }
            x0 = x1; y0 = y1;
        }
        if (Number.isFinite(y0) && y0 === 0) out.push(x0);
        return out.filter((x, i) => i === 0 || Math.abs(x - out[i - 1]) > 1e-9 * Math.max(1, Math.abs(x))).slice(0, 60);
    }
    const realFn = (node, env, name) => x => { try { const v = evalAt(node, {...env, float: true}, name, x); const r = isC(v) ? (Math.abs(v.im) < 1e-12 ? v.re : NaN) : toF(v); return r; } catch (_) { return NaN; } };
    /** la lettre d'une équation : x (ou la seule lettre libre) */
    function varOf(nodes, given) {
        if (given) return given;
        const fv = new Set(); nodes.forEach(n => freeVars(n, new Set(), fv));
        if (fv.has('x')) return 'x';
        const list = [...fv].filter(v => VAR_LETTERS.test(v));
        if (list.length === 1) return list[0];
        if (!list.length) return 'x';
        fail(`Plusieurs lettres inconnues (${list.join(', ')}) : pour un système, écris toutes les équations dans resoudre(… ; …).`);
    }
    function solveTxt(name, roots, extra = {}) {
        if (!roots.length) return new Txt(`Aucune solution${extra.none ? ' ' + extra.none : ''}`, `Aucune solution${extra.none ? ' ' + esc(extra.none) : ''}`, {solve: true, roots: [], ...extra});
        const item = r => { const f = formatValue(r.v, extra.fmt || {}); const m = r.mult > 1 ? ` (${['', '', 'double', 'triple', 'quadruple'][r.mult] || r.mult + ' fois'})` : ''; return {text: `${name} = ${f.text}${m}`, html: `<i>${esc(name)}</i> = ${f.html}${esc(m)}`}; };
        const its = roots.map(item);
        const formTxt = roots.find(r => r.form) ? `${name} = ${roots.find(r => r.form).form}` : '';
        return new Txt(its.map(x => x.text).join(' ou '), its.map(x => x.html).join(' <span class="cm-or">ou</span> '), {solve: true, ...extra, roots: roots.map(r => r.v), note: [formTxt ? `Valeur exacte : ${formTxt}` : '', extra.note || ''].filter(Boolean).join(' · ')});
    }
    function solveEquations(eqNodes, env, given, range) {
        const exprs = eqNodes.map(n => (n.k === 'eq' ? {k: 'bin', op: '-', a: n.a, b: n.b} : n));
        if (exprs.length === 1) {
            const name = varOf(exprs, given), e = exprs[0];
            const poly = polyOf(e, {...env, inEq: true}, name);
            if (poly) {
                if (poly.deg === 0 || poly.coefs.length === 1 || poly.coefs.every((c, i) => i === poly.coefs.length - 1 || isZero(c))) {
                    const c0 = poly.coefs[poly.coefs.length - 1];
                    return isZero(c0) ? new Txt('Toujours vrai', `Toujours vrai : tout nombre ${esc(name)} convient.`, {solve: true, roots: []}) : solveTxt(name, [], {none: '(l’égalité est toujours fausse)'});
                }
                const r = polyRoots(poly.coefs);
                const inRange = range ? r.roots.filter(x => !isC(x.v) && toF(x.v) >= range[0] && toF(x.v) <= range[1]) : r.roots;
                return solveTxt(name, inRange, {fmt: env.fmt, none: range ? `entre ${range[0]} et ${range[1]}` : '', note: `Équation du ${r.deg === 1 ? '1er' : r.deg + 'e'} degré${range ? `, solutions entre ${range[0]} et ${range[1]}` : ''}.`});
            }
            const [a, b] = range || [-100, 100];
            const f = realFn(e, {...env, inEq: true}, name), roots = numericRoots(f, a, b);
            return solveTxt(name, roots.map(v => ({v: snap(v)})), {fmt: env.fmt, none: `entre ${a} et ${b}`, note: `Solutions cherchées entre ${a} et ${b}${roots.length ? ' (valeurs approchées)' : ''}.`});
        }
        // système du 1er degré
        const fv = new Set(); exprs.forEach(n => freeVars(n, new Set(), fv));
        const vars = [...fv].filter(v => VAR_LETTERS.test(v)).sort((p, q) => 'xyztuvw'.indexOf(p) - 'xyztuvw'.indexOf(q) || p.localeCompare(q));
        if (!vars.length) fail('Ce système n’a pas d’inconnue (x, y, z…).');
        if (vars.length > 6) fail('Je résous les systèmes jusqu’à 6 inconnues.');
        const at = (e, vals) => evaluateNode(e, {...env, inEq: true, vars: {...(env.vars || {}), ...Object.fromEntries(vars.map((v, i) => [v, vals[i]]))}});
        const z = vars.map(() => ZERO), A = [], B = [];
        exprs.forEach(e => {
            const c0 = at(e, z); const row = vars.map((_, j) => sub(at(e, vars.map((__, k) => (k === j ? ONE : ZERO))), c0));
            for (const test of [vars.map((_, k) => fr(k + 2)), vars.map((_, k) => fr(1, k + 3))]) { const pred = row.reduce((s, a, k) => add(s, mul(a, test[k])), c0), got = at(e, test), d = sub(pred, got); if (isF(d) ? !isZero(d) : absNum(d) > 1e-9 * Math.max(1, absNum(got))) fail('Ce système n’est pas du premier degré : je sais résoudre les systèmes où les inconnues ne sont ni multipliées entre elles, ni au carré.'); }
            A.push(row); B.push(neg(c0));
        });
        const sol = solveLinear(new Mat(A), B);
        const its = vars.map((v, i) => { const f = formatValue(sol[i], env.fmt || {}); return {text: `${v} = ${f.text}`, html: `<i>${esc(v)}</i> = ${f.html}`}; });
        return new Txt(its.map(x => x.text).join(' ; '), its.map(x => x.html).join(' <span class="cm-or">;</span> '), {solve: true, system: true, roots: sol, note: `Système de ${exprs.length} équations à ${vars.length} inconnue${vars.length > 1 ? 's' : ''}.`});
    }
    function derivative(node, env, name, a) {
        const poly = polyOf(node, env, name, 12);
        if (poly && isF(a) && poly.exact) { const n = poly.coefs.length - 1; const d = poly.coefs.slice(0, -1).map((c, i) => mul(c, fr(n - i))); return d.length ? polyEval(d, a) : ZERO; }
        const f = realFn(node, env, name), x = toF(a);
        // méthode de Ridders (extrapolation de Richardson)
        let h = 0.1 * Math.max(1, Math.abs(x)), best = NaN, err = Infinity; const t = [[(f(x + h) - f(x - h)) / (2 * h)]];
        for (let i = 1; i < 10; i++) {
            h /= 1.4; t[i] = [(f(x + h) - f(x - h)) / (2 * h)]; let fac = 1.96;
            for (let j = 1; j <= i; j++) { t[i][j] = (t[i][j - 1] * fac - t[i - 1][j - 1]) / (fac - 1); fac *= 1.96; const e = Math.max(Math.abs(t[i][j] - t[i][j - 1]), Math.abs(t[i][j] - t[i - 1][j - 1])); if (e <= err) { err = e; best = t[i][j]; } }
            if (Math.abs(t[i][i] - t[i - 1][i - 1]) >= 2 * err) break;
        }
        if (!Number.isFinite(best)) fail(`La dérivée n’existe pas en ${name} = ${formatValue(a).text}.`);
        return snap(best);
    }
    function integral(node, env, name, a, b) {
        const poly = polyOf(node, env, name, 12);
        if (poly && poly.exact && isF(a) && isF(b)) { const n = poly.coefs.length - 1, P = [...poly.coefs.map((c, i) => div(c, fr(n - i + 1))), ZERO]; return sub(polyEval(P, b), polyEval(P, a)); }
        const f = realFn(node, env, name), A = toF(a), B = toF(b);
        if (!Number.isFinite(A) || !Number.isFinite(B)) fail('Les bornes de l’intégrale doivent être des nombres.');
        let evals = 0;
        const XK = [0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691, 0.405845151377397, 0.207784955007898, 0];
        const WK = [0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728];
        const WG = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469];
        const gk = (lo, hi) => { const c = (lo + hi) / 2, hl = (hi - lo) / 2; let k = 0, g = 0; for (let i = 0; i < 8; i++) { const dx = hl * XK[i], y = i === 7 ? f(c) : f(c - dx) + f(c + dx); evals += i === 7 ? 1 : 2; k += WK[i] * y; if (i % 2 === 1) g += WG[(i - 1) / 2] * y; } return [k * hl, Math.abs((k - g) * hl)]; };
        const rec = (lo, hi, tol, depth) => { const [v, e] = gk(lo, hi); if (!Number.isFinite(v)) fail('L’intégrale ne converge pas (la fonction part à l’infini entre les bornes).'); if (e <= tol || depth > 40 || evals > 200000) return v; const m = (lo + hi) / 2; return rec(lo, m, tol / 2, depth + 1) + rec(m, hi, tol / 2, depth + 1); };
        const v = rec(A, B, 1e-11 * Math.max(1, Math.abs(B - A)), 0);
        return snap(v);
    }
    function seriesSum(node, env, name, a, b, product = false) {
        const lo = intOf(a, 'Somme'), hi = intOf(b, 'Somme');
        if (hi - lo > BigInt(LIMITS.sum)) fail(`Trop de termes (au plus ${LIMITS.sum}).`);
        let s = product ? ONE : ZERO; for (let k = lo; k <= hi; k++) { const v = evalAt(node, env, name, fr(k)); s = product ? mul(s, v) : add(s, v); }
        return s;
    }

    /* ═════════ Les fonctions (nom français d'abord ; les noms anglais en alias) ═════════ */
    const FN = {}, ALIAS = {};
    const fnKey = name => { const f = fold(name).replace(/[\s_.-]/g, ''); if (name === 'C' || name === 'A') return name; return FN[f] ? f : ALIAS[f] || f; };
    function def(names, o, f) {
        const [main, ...al] = names.split(' '); FN[main] = {min: 1, max: 1, ...o, f, show: o.show || main};
        al.forEach(a => { ALIAS[a] = main; });
    }
    const one = f => (v, env) => f(v[0], env);
    const asDec = x => mapNum(x, v => (isF(v) && v.d !== 1n ? toF(v) : v)); // un arrondi s'écrit avec une virgule (3,14), pas en fraction
    const trig = (rf, cf, ex, exName) => one((x, env) => mapNum(x, v => { if (ex) { const e = ex(v, env); if (e !== null) return e; } return isC(v) ? cf(v) : fracOfFloat(rf(toF(toRad(v, env)))); }));
    def('sin', {group: 'trig', desc: 'Sinus (dans l’unité d’angle choisie)', ex: 'sin(30)'}, trig(Math.sin, csin, exactSin));
    def('cos', {group: 'trig', desc: 'Cosinus', ex: 'cos(60)'}, trig(Math.cos, ccos, exactCos));
    def('tan', {group: 'trig', desc: 'Tangente', ex: 'tan(45)'}, one((x, env) => mapNum(x, v => { const s = exactSin(v, env), c = exactCos(v, env); if (c !== null && isZero(c)) fail(`tan(${formatValue(v).text}${env.angle === 'deg' ? '°' : ''}) n’existe pas (le cosinus vaut 0).`); if (s !== null && c !== null) return div(s, c); if (isC(v)) return div(csin(v), ccos(v)); const r = toF(toRad(v, env)), cr = Math.cos(r); if (Math.abs(cr) < 1e-15) fail('Cette tangente n’existe pas (le cosinus vaut 0).'); if (env.angle === 'deg' && isInt(v) && Number(((v.n % 180n) + 180n) % 180n) === 45) return Number(((v.n % 180n) + 180n) % 180n) === 45 ? ONE : new Frac(-1n, 1n); if (env.angle === 'deg' && isInt(v) && Number(((v.n % 180n) + 180n) % 180n) === 135) return new Frac(-1n, 1n); return fracOfFloat(Math.tan(r)); })));
    const inverse = (rf, cf, dom, nm) => one((x, env) => mapNum(x, v => { if (!isC(v) && !dom(toF(v))) fail(`${nm}(…) demande un nombre entre −1 et 1.`); if (!isC(v) && dom(toF(v))) { const r = rf(toF(v)); const out = fromRad(r, env); return isR(out) ? snap(out) : out; } const z = cf(v); return env.angle === 'rad' ? z : div(z, ANGLE[env.angle]); }));
    def('asin arcsin', {group: 'trig', desc: 'Arc sinus (angle dont le sinus vaut x)', ex: 'asin(0,5)'}, inverse(Math.asin, casin, v => v >= -1 && v <= 1, 'asin'));
    def('acos arccos', {group: 'trig', desc: 'Arc cosinus', ex: 'acos(0,5)'}, inverse(Math.acos, cacos, v => v >= -1 && v <= 1, 'acos'));
    def('atan arctan', {group: 'trig', desc: 'Arc tangente', ex: 'atan(1)'}, inverse(Math.atan, catan, () => true, 'atan'));
    def('atan2', {group: 'trig', min: 2, max: 2, desc: 'Angle du point (x ; y) : atan2(y ; x)', ex: 'atan2(1 ; 1)'}, (v, env) => { const r = Math.atan2(toF(real(v[0], 'atan2')), toF(real(v[1], 'atan2'))); return snap(toF(fromRad(r, env))); });
    const hyp = (rf, cf) => one(x => rc(x, rf, cf));
    def('sinh sh', {group: 'hyp', desc: 'Sinus hyperbolique', ex: 'sinh(1)'}, hyp(Math.sinh, z => mul(0.5, sub(cexp(z), cexp(neg(z))))));
    def('cosh ch', {group: 'hyp', desc: 'Cosinus hyperbolique', ex: 'cosh(1)'}, hyp(Math.cosh, z => mul(0.5, add(cexp(z), cexp(neg(z))))));
    def('tanh th', {group: 'hyp', desc: 'Tangente hyperbolique', ex: 'tanh(1)'}, hyp(Math.tanh, z => { const a = cexp(z), b = cexp(neg(z)); return div(sub(a, b), add(a, b)); }));
    def('asinh argsh arcsinh', {group: 'hyp', desc: 'Argument sinus hyperbolique', ex: 'asinh(1)'}, hyp(Math.asinh, z => clog(add(z, sqrt(add(mul(z, z), ONE))))));
    def('acosh argch arccosh', {group: 'hyp', desc: 'Argument cosinus hyperbolique', ex: 'acosh(2)'}, one(x => rc(x, Math.acosh, z => clog(add(z, mul(sqrt(add(z, ONE)), sqrt(sub(z, ONE))))), v => v >= 1)));
    def('atanh argth arctanh', {group: 'hyp', desc: 'Argument tangente hyperbolique', ex: 'atanh(0,5)'}, one(x => rc(x, Math.atanh, z => mul(0.5, sub(clog(add(ONE, z)), clog(sub(ONE, z)))), v => v > -1 && v < 1)));
    const lnE = x => mapNum(x, v => { if (isZero(v)) fail('ln(0) n’existe pas (il part vers −∞).', {hint: 'Le logarithme demande un nombre plus grand que 0.'}); if (isInt(v) && v.n === 1n) return ZERO; if (!isC(v) && toF(v) > 0) return fracOfFloat(Math.log(toF(v))); return clog(v); });
    def('ln', {group: 'log', desc: 'Logarithme népérien (base e)', ex: 'ln(e)'}, one(lnE));
    def('log lg', {group: 'log', max: 2, desc: 'Logarithme décimal ; log(x ; b) en base b', ex: 'log(1000)'}, v => {
        const b = v[1] ?? fr(10), x = v[0];
        if (isF(x) && isF(b) && x.n > 0n && b.n > 0n && !(b.n === b.d)) { // puissance exacte : log(1000) = 3, log(8 ; 2) = 3, log(1/100) = −2
            for (let k = -200; k <= 200; k++) { if (k === 0) continue; const p = pow(b, fr(k)); if (isF(p) && cmp(p, x) === 0) return fr(k); if (Math.abs(k) > 3 && Math.abs(Math.log(toF(x)) / Math.log(toF(b)) - k) > 2) { if (k > 0) break; } }
            if (x.n === x.d) return ZERO;
        }
        if (isF(b) && b.n === b.d) fail('La base d’un logarithme ne peut pas valoir 1.');
        return div(lnE(x), lnE(b));
    });
    def('log2', {group: 'log', desc: 'Logarithme en base 2', ex: 'log2(1024)'}, v => FN.log.f([v[0], fr(2)]));
    def('exp', {group: 'log', desc: 'Exponentielle : e puissance x', ex: 'exp(1)'}, one(x => mapNum(x, v => (isZero(v) ? ONE : isC(v) ? cexp(v) : fracOfFloat(Math.exp(toF(v)))))));
    def('sqrt racine rac', {group: 'pow', max: 2, desc: 'Racine carrée ; racine(x ; n) : racine n-ième', ex: 'racine(2)', show: 'racine'}, v => (v.length === 2 ? FN.root.f(v) : sqrt(v[0])));
    def('cbrt', {group: 'pow', desc: 'Racine cubique', ex: 'cbrt(27)', show: 'cbrt'}, v => FN.root.f([v[0], fr(3)]));
    def('root4', {group: 'pow', desc: 'Racine 4e', show: '∜'}, v => FN.root.f([v[0], fr(4)]));
    def('root nroot', {group: 'pow', min: 2, max: 2, desc: 'Racine n-ième : root(x ; n)', ex: 'root(32 ; 5)'}, v => { const n = intOf(v[1], 'Racine'); if (n === 0n) fail('La racine 0-ième n’existe pas.'); const x = real(v[0], 'Racine'); if (cmp(x, ZERO) < 0 && n % 2n === 0n) return pow(x, fr(1n, n)); if (cmp(x, ZERO) < 0) return neg(pow(neg(x), fr(1n, n))); return pow(x, fr(1n, n)); });
    def('abs valeurabsolue', {group: 'pow', desc: 'Valeur absolue (ou module d’un complexe) : |x|', ex: 'abs(-5)'}, one(x => mapNum(x, v => (isF(v) ? babs2(v) : isC(v) ? fracOfFloat(cabs(v)) : Math.abs(v)))));
    def('fact factorielle', {group: 'arith', desc: 'Factorielle : n! = 1 × 2 × … × n', ex: '10!'}, one(x => mapNum(x, factorial)));
    def('gamma', {group: 'arith', desc: 'Fonction Γ : Γ(n) = (n − 1)!', ex: 'gamma(0,5)'}, one(x => mapNum(x, v => factorial(sub(v, ONE)))));
    // complexes
    def('re reel', {group: 'cx', desc: 'Partie réelle', ex: 're(3+4i)'}, one(x => mapNum(x, v => (isC(v) ? fracOfFloat(v.re) : v))));
    def('im imag imaginaire', {group: 'cx', desc: 'Partie imaginaire', ex: 'im(3+4i)'}, one(x => mapNum(x, v => (isC(v) ? fracOfFloat(v.im) : ZERO))));
    def('module mod_ norme', {group: 'cx', desc: 'Module |z| = √(a² + b²)', ex: 'module(3+4i)'}, one(x => mapNum(x, v => (isC(v) ? snap(cabs(v)) : babs2(isF(v) ? v : fracOfFloat(Math.abs(v)))))));
    def('arg argument', {group: 'cx', desc: 'Argument (angle) d’un complexe', ex: 'arg(1+i)'}, one((x, env) => mapNum(x, v => { const [r, i] = parts(v); if (r === 0 && i === 0) fail('L’argument de 0 n’existe pas.'); return snap(toF(fromRad(Math.atan2(i, r), env))); })));
    def('conj conjugue', {group: 'cx', desc: 'Conjugué : a − bi', ex: 'conj(3+4i)'}, one(x => mapNum(x, v => (isC(v) ? cx(v.re, -v.im) : v))));
    // arrondis
    def('arrondi round', {group: 'arith', max: 2, desc: 'Arrondi (au plus proche) ; arrondi(x ; n) avec n chiffres après la virgule', ex: 'arrondi(3,14159 ; 2)'}, v => asDec(roundTo(v[0], v[1] ? Number(intOf(v[1], 'Arrondi')) : 0)));
    def('ent floor plancher', {group: 'arith', desc: 'Partie entière (vers le bas)', ex: 'ent(-2,5)'}, one(x => roundTo(x, 0, 'floor')));
    def('plafond ceil', {group: 'arith', desc: 'Arrondi vers le haut', ex: 'plafond(2,1)'}, one(x => roundTo(x, 0, 'ceil')));
    def('tronque trunc', {group: 'arith', max: 2, desc: 'Coupe les chiffres après la virgule (vers 0)', ex: 'tronque(-2,7)'}, v => asDec(roundTo(v[0], v[1] ? Number(intOf(v[1], 'Tronque')) : 0, 'trunc')));
    def('frac fraction', {group: 'arith', desc: 'Écrit un nombre à virgule en fraction', ex: 'frac(0,75)'}, one(x => mapNum(x, v => { if (isF(v)) return v; const q = approxFrac(toF(v), 1e7); if (!q) fail('Je ne trouve pas de fraction simple pour ce nombre.'); return q; })));
    def('dec decimal', {group: 'arith', desc: 'Écrit le nombre en décimal', ex: 'dec(1/3)'}, one(x => mapNum(x, v => (isF(v) && v.d !== 1n ? toF(v) : v))));
    def('signe sign', {group: 'arith', desc: 'Signe : −1, 0 ou 1', ex: 'signe(-3)'}, one(x => fr(cmp(real(x, 'Signe'), ZERO))));
    def('mod modulo', {group: 'arith', min: 2, max: 2, desc: 'Reste de la division : 17 mod 5', ex: '17 mod 5', show: 'mod'}, v => { const a = real(v[0], 'mod'), b = real(v[1], 'mod'); if (isZero(b)) fail('Division par zéro : on ne peut pas diviser par 0.'); return sub(a, mul(b, roundTo(div(a, b), 0, 'floor'))); });
    def('quotient div', {group: 'arith', min: 2, max: 2, desc: 'Quotient entier', ex: 'quotient(17 ; 5)'}, v => roundTo(div(real(v[0], 'quotient'), real(v[1], 'quotient')), 0, 'floor'));
    def('pgcd gcd', {group: 'arith', min: 2, max: Infinity, desc: 'Plus grand commun diviseur', ex: 'pgcd(12 ; 18)'}, v => fr(v.flatMap(vecOf).map(x => intOf(x, 'pgcd')).reduce(bgcd)));
    def('ppcm lcm', {group: 'arith', min: 2, max: Infinity, desc: 'Plus petit commun multiple', ex: 'ppcm(4 ; 6)'}, v => fr(v.flatMap(vecOf).map(x => babs(intOf(x, 'ppcm'))).reduce((a, b) => (a === 0n || b === 0n ? 0n : a / bgcd(a, b) * b))));
    def('C comb ncr combinaison', {group: 'arith', min: 2, max: 2, desc: 'Combinaisons : C(n ; k) façons de choisir k parmi n', ex: 'C(5 ; 2)', show: 'C'}, v => fr(nCk(intOf(v[0], 'C'), intOf(v[1], 'C'))));
    def('A arr npr arrangement', {group: 'arith', min: 2, max: 2, desc: 'Arrangements : A(n ; k) (l’ordre compte)', ex: 'A(5 ; 2)', show: 'A'}, v => fr(nAk(intOf(v[0], 'A'), intOf(v[1], 'A'))));
    def('premier isprime estpremier', {group: 'arith', desc: 'Est-ce un nombre premier ?', ex: 'premier(97)'}, one(x => { const n = intOf(x, 'premier'); const ok = isPrime(n); return new Txt(ok ? 'VRAI' : 'FAUX', ok ? `Oui, ${n} est premier ✓` : `Non, ${n} n’est pas premier`, {bool: ok, note: ok ? '' : n > 1n ? `${n} = ${factorsTxt(n).text}` : ''}); }));
    def('facteurs factor decomposition', {group: 'arith', desc: 'Décomposition en facteurs premiers', ex: 'facteurs(360)'}, one(x => factorsTxt(intOf(x, 'facteurs'))));
    def('premiersuivant nextprime', {group: 'arith', desc: 'Le nombre premier suivant', ex: 'premiersuivant(100)'}, one(x => { let n = intOf(x, 'premiersuivant') + 1n; let k = 0; while (!isPrime(n)) { n++; if (++k > 100000) fail('Trop loin.'); } return fr(n); }));
    def('bin', {group: 'base', desc: 'Écrit un entier en binaire (base 2)', ex: 'bin(10)'}, one(x => toBase(x, 2)));
    def('oct', {group: 'base', desc: 'Écrit un entier en octal (base 8)', ex: 'oct(64)'}, one(x => toBase(x, 8)));
    def('hex', {group: 'base', desc: 'Écrit un entier en hexadécimal (base 16)', ex: 'hex(255)'}, one(x => toBase(x, 16)));
    def('base', {group: 'base', min: 2, max: 2, desc: 'Écrit un entier dans une base de 2 à 36', ex: 'base(100 ; 3)'}, v => toBase(v[0], Number(intOf(v[1], 'base'))));
    // statistiques
    const many = {group: 'stat', min: 1, max: Infinity};
    def('moyenne mean avg', {...many, desc: 'Moyenne', ex: 'moyenne([12 ; 15 ; 9])'}, v => mean(flatNums(v, 'Moyenne')));
    def('mediane median', {...many, desc: 'Médiane (la valeur du milieu)', ex: 'mediane([3 ; 1 ; 4 ; 1 ; 5])'}, v => median(flatNums(v, 'Médiane')));
    def('variance var varp', {...many, desc: 'Variance (de la population)', ex: 'variance([2 ; 4 ; 4 ; 4 ; 5 ; 5 ; 7 ; 9])'}, v => variance(flatNums(v, 'Variance'), false));
    def('ecarttype stdevp sigma', {...many, desc: 'Écart-type σ (de la population, comme au lycée)', ex: 'ecarttype([2 ; 4 ; 4 ; 4 ; 5 ; 5 ; 7 ; 9])'}, v => sqrt(variance(flatNums(v, 'Écart-type'), false)));
    def('ecarttypee stdev ecarttypeechantillon', {...many, desc: 'Écart-type d’un échantillon (divisé par n − 1)', ex: 'ecarttype_e([1 ; 2 ; 3 ; 4])', show: 'ecarttype_e'}, v => sqrt(variance(flatNums(v, 'Écart-type'), true)));
    def('somme sum', {group: 'stat', min: 1, max: Infinity, lazy: true, binds: a => (a.length === 4 && a[1].k === 'id' ? a[1].name : null), varArg: 1, desc: 'Somme d’une liste ; somme(k² ; k ; 1 ; 10) : somme d’une suite', ex: 'somme([1 ; 2 ; 3])'}, (args, env) => {
        if (args.length === 4 && args[1].k === 'id') return seriesSum(args[0], env, args[1].name, evaluateNode(args[2], env), evaluateNode(args[3], env));
        return sum(flatNums(args.map(a => evaluateNode(a, env)), 'Somme'));
    });
    def('produit product', {group: 'stat', min: 1, max: Infinity, lazy: true, binds: a => (a.length === 4 && a[1].k === 'id' ? a[1].name : null), varArg: 1, desc: 'Produit d’une liste ; produit(k ; k ; 1 ; 5)', ex: 'produit([2 ; 3 ; 4])'}, (args, env) => {
        if (args.length === 4 && args[1].k === 'id') return seriesSum(args[0], env, args[1].name, evaluateNode(args[2], env), evaluateNode(args[3], env), true);
        return flatNums(args.map(a => evaluateNode(a, env)), 'Produit').reduce((s, x) => mul(s, x), ONE);
    });
    def('min', {...many, desc: 'Le plus petit', ex: 'min(4 ; 2 ; 8)'}, v => sortReal(flatNums(v, 'min'), 'min')[0]);
    def('max', {...many, desc: 'Le plus grand', ex: 'max(4 ; 2 ; 8)'}, v => sortReal(flatNums(v, 'max'), 'max').at(-1));
    def('etendue range', {...many, desc: 'Étendue : max − min', ex: 'etendue([4 ; 2 ; 8])'}, v => { const s = sortReal(flatNums(v, 'Étendue'), 'Étendue'); return sub(s.at(-1), s[0]); });
    def('q1 quartile1', {...many, desc: '1er quartile', ex: 'q1([1 ; 2 ; 3 ; 4 ; 5 ; 6 ; 7 ; 8])'}, v => quart(flatNums(v, 'Quartile'), 0.25));
    def('q3 quartile3', {...many, desc: '3e quartile', ex: 'q3([1 ; 2 ; 3 ; 4 ; 5 ; 6 ; 7 ; 8])'}, v => quart(flatNums(v, 'Quartile'), 0.75));
    def('effectif count nombre', {...many, desc: 'Combien de nombres dans la liste', ex: 'effectif([4 ; 2 ; 8])'}, v => fr(flatNums(v, 'Effectif').length));
    def('tri sort', {...many, desc: 'Range la liste du plus petit au plus grand', ex: 'tri([3 ; 1 ; 2])'}, v => new List(sortReal(flatNums(v, 'Tri'), 'Tri')));
    // matrices
    def('det determinant', {group: 'mat', desc: 'Déterminant d’une matrice carrée', ex: 'det([[1 ; 2] ; [3 ; 4]])'}, one(matDet));
    def('inv inverse', {group: 'mat', desc: 'Matrice inverse', ex: 'inverse([[1 ; 2] ; [3 ; 4]])'}, one(x => (isNum(x) ? inv1(x) : matInverse(x))));
    def('transp transpose transposee', {group: 'mat', desc: 'Transposée (lignes ↔ colonnes)', ex: 'transp([[1 ; 2 ; 3]])'}, one(transpose));
    def('trace', {group: 'mat', desc: 'Trace : somme de la diagonale', ex: 'trace([[1 ; 2] ; [3 ; 4]])'}, one(x => { const A = matOf(x, 'Trace'); if (A.r !== A.c) fail('La trace demande une matrice carrée.'); return A.a.reduce((s, r, i) => add(s, r[i]), ZERO); }));
    def('identite id eye', {group: 'mat', desc: 'Matrice identité n × n', ex: 'identite(3)'}, one(x => { const n = Number(intOf(x, 'identite')); if (n < 1 || n > LIMITS.mat) fail(`La taille va de 1 à ${LIMITS.mat}.`); return new Mat(Array.from({length: n}, (_, i) => Array.from({length: n}, (__, j) => (i === j ? ONE : ZERO)))); }));
    def('rang rank', {group: 'mat', desc: 'Rang d’une matrice', ex: 'rang([[1 ; 2] ; [2 ; 4]])'}, one(x => fr(gauss(matOf(x, 'Rang')).rank)));
    def('systeme linsolve', {group: 'eq', min: 2, max: 2, desc: 'Résout A·X = B (matrice A, liste B)', ex: 'systeme([[2 ; 1] ; [1 ; -1]] ; [3 ; 0])'}, v => { const A = matOf(v[0], 'Système'), b = vecOf(v[1]); if (A.r !== b.length) fail(`La matrice a ${A.r} lignes et la liste ${b.length} nombres : il en faut autant.`); if (A.r !== A.c) fail('Le système doit avoir autant d’équations que d’inconnues.'); return new List(solveLinear(A, b)); });
    // équations, analyse
    def('resoudre solve', {group: 'eq', min: 1, max: 6, lazy: true, desc: 'Résout une équation (jusqu’au 4e degré exactement, ou approchée) ou un système', ex: 'resoudre(x^2 - 3x + 2 = 0)'}, (args, env) => {
        const eqs = [], extra = [];
        args.forEach(a => (a.k === 'eq' || (a.k !== 'id' && a.k !== 'num' && a.k !== 'neg' && !extra.length && !eqs.length) ? eqs.push(a) : extra.push(a)));
        if (!eqs.length) fail('Écris l’équation dans resoudre(…), par exemple resoudre(x^2 = 4).');
        let name = null, range = null;
        if (extra[0] && extra[0].k === 'id' && VAR_LETTERS.test(extra[0].name)) { name = extra[0].name; extra.shift(); }
        if (extra.length === 2) range = extra.map(e => toF(real(evaluateNode(e, env), 'Intervalle')));
        else if (extra.length) fail('resoudre(équation ; lettre ; début ; fin) : je n’ai pas compris les nombres en plus.');
        return solveEquations(eqs, env, name, range);
    });
    def('racines roots', {group: 'eq', min: 2, max: 5, desc: 'Racines d’un polynôme : ses coefficients, du plus haut degré au plus bas', ex: 'racines(1 ; -3 ; 2)'}, (v, env) => { const c = v.map(x => { if (!isNum(x)) NEED_NUM('racines', x); return x; }); const r = polyRoots(c); return solveTxt('x', r.roots, {fmt: env.fmt}); });
    def('derivee deriv diff', {group: 'ana', min: 2, max: 3, lazy: true, binds: a => (a.length === 3 && a[1].k === 'id' ? a[1].name : varOf([a[0]])), desc: 'Nombre dérivé de f en a : derivee(f(x) ; a)', ex: 'derivee(x^3 ; 2)'}, (args, env) => {
        const name = args.length === 3 && args[1].k === 'id' ? args[1].name : varOf([args[0]]); const a = evaluateNode(args.at(-1), env); return derivative(args[0], {...env, angle: 'rad'}, name, real(a, 'Dérivée'));
    });
    def('integrale integral integ', {group: 'ana', min: 3, max: 4, lazy: true, binds: a => (a.length === 4 && a[1].k === 'id' ? a[1].name : varOf([a[0]])), desc: 'Intégrale de f entre a et b : integrale(f(x) ; a ; b)', ex: 'integrale(x^2 ; 0 ; 3)'}, (args, env) => {
        const name = args.length === 4 && args[1].k === 'id' ? args[1].name : varOf([args[0]]); const a = evaluateNode(args.at(-2), env), b = evaluateNode(args.at(-1), env); return integral(args[0], {...env, angle: 'rad'}, name, real(a, 'Intégrale'), real(b, 'Intégrale'));
    });
    def('limite limit lim', {group: 'ana', min: 2, max: 3, lazy: true, binds: a => (a.length === 3 && a[1].k === 'id' ? a[1].name : varOf([a[0]])), desc: 'Valeur approchée de la limite en a', ex: 'limite(sin(x)/x ; 0)'}, (args, env) => {
        const name = args.length === 3 && args[1].k === 'id' ? args[1].name : varOf([args[0]]); const a = toF(real(evaluateNode(args.at(-1), env), 'Limite')); const f = realFn(args[0], {...env, angle: 'rad'}, name);
        const vals = [1e-4, 1e-5, 1e-6].map(h => [f(a + h), f(a - h)]); const l = vals[2], ok = Number.isFinite(l[0]) && Number.isFinite(l[1]) && Math.abs(l[0] - l[1]) < 1e-4 * Math.max(1, Math.abs(l[0]));
        if (!ok) fail('Je ne trouve pas de limite (à gauche et à droite ce n’est pas pareil, ou ça part à l’infini).'); return snap((l[0] + l[1]) / 2);
    });

    /* ═════════ Affichage des valeurs ═════════ */
    const NNBSP = ' ';
    const groupInt = (s, sep = NNBSP) => s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    const minus = s => String(s).replace(/^-/, '−');
    /** un nombre à virgule → texte (digits chiffres significatifs, virgule française) : {text, html, approx, sci} */
    function fmtFloat(x, {digits = 10, dec = ','} = {}) {
        if (Number.isNaN(x)) return {text: 'NaN', html: 'pas un nombre', approx: false};
        if (!Number.isFinite(x)) return {text: x > 0 ? '∞' : '-∞', html: x > 0 ? '∞' : '−∞', approx: false};
        if (x === 0) return {text: '0', html: '0', approx: false};
        const a = Math.abs(x), e = Math.floor(Math.log10(a));
        const approx = Number(x.toPrecision(Math.min(15, 17))) !== Number(x.toPrecision(digits)) && Math.abs(Number(x.toPrecision(15)) - Number(x.toPrecision(digits))) > 0;
        if (e >= 15 || e < -7) {
            let [m, ex] = x.toExponential(digits - 1).split('e'); m = m.replace(/\.?0+$/, ''); const ee = Number(ex);
            const mt = m.replace('.', dec);
            return {text: `${mt}e${ee}`, html: `${minus(mt)}${NNBSP}×${NNBSP}10<sup>${minus(String(ee))}</sup>`, approx, sci: true};
        }
        let s = Number(x.toPrecision(digits)).toString();
        if (/e/.test(s)) s = Number(x.toPrecision(digits)).toFixed(Math.max(0, digits - e - 1)).replace(/\.?0+$/, '');
        const [ip, fp] = s.split('.'), body = fp ? `${ip}${dec}${fp}` : ip;
        return {text: body, html: minus(fp ? `${groupInt(ip)}${dec}${fp}` : groupInt(ip)), approx};
    }
    /** une fraction exacte → {text, html (fraction posée), alt (le décimal), exact} */
    function fmtFrac(q, o = {}) {
        const {dec = ','} = o;
        if (q.d === 1n) {
            const s = q.n.toString(), neg_ = q.n < 0n, digs = s.replace('-', '');
            if (digs.length > LIMITS.digits) { const f = fmtFloat(toF(q), o); return {text: f.text, html: f.html, alt: `${digs.length} chiffres`, approx: true}; }
            if (digs.length > 15) { const f = fmtFloat(toF(q), {...o, digits: Math.min(10, o.digits || 10)}); return {text: s, html: `<span class="cm-long">${minus(neg_ ? '-' + groupInt(digs) : groupInt(digs))}</span>`, alt: `≈ ${f.html} · ${digs.length} chiffres`}; }
            return {text: s, html: minus(neg_ ? '-' + groupInt(digs) : groupInt(digs))};
        }
        const f = fmtFloat(toF(q), o);
        // décimal exact ? (dénominateur fait de 2 et de 5)
        let d = q.d; while (d % 2n === 0n) d /= 2n; while (d % 5n === 0n) d /= 5n;
        let exactDec = '';
        if (d === 1n) { let k = 0, m = q.d; while (m > 1n) { m /= (m % 10n === 0n ? 10n : m % 2n === 0n ? 2n : 5n); k++; if (k > 40) break; } const scale = 10n ** BigInt(Math.min(k * 2, 60)); const v = q.n * scale / q.d; let s = babs(v).toString().padStart(Math.min(k * 2, 60) + 1, '0'); const cut = s.length - Math.min(k * 2, 60); let ip = s.slice(0, cut), fp = s.slice(cut).replace(/0+$/, ''); if (fp.length <= 15) exactDec = `${q.n < 0n ? '-' : ''}${ip}${fp ? dec + fp : ''}`; }
        if (o.frac === false) return {text: exactDec || f.text, html: exactDec ? minus(exactDec.replace(/^(-?)(\d+)/, (_, s0, ip) => s0 + groupInt(ip))) : f.html, alt: `= ${q.n}/${q.d}`.replace('-', '−'), approx: !exactDec && f.approx};
        const n = babs(q.n).toString(), dd = q.d.toString();
        const html = `${q.n < 0n ? '−' : ''}<span class="cm-fr"><span class="cm-fr-n">${groupInt(n)}</span><span class="cm-fr-d">${groupInt(dd)}</span></span>`;
        return {text: `${q.n}/${q.d}`, html, alt: exactDec ? `= ${minus(exactDec)}` : `≈ ${f.html}`, exact: true};
    }
    function fmtCx(z, o) {
        let re = z.re, im = z.im; const sc = Math.max(Math.abs(re), Math.abs(im));
        if (Math.abs(re) < 1e-13 * sc) re = 0; if (Math.abs(im) < 1e-13 * sc) im = 0;
        if (im === 0) return fmtFloat(re, o);
        const r = re === 0 ? null : fmtFloat(re, o), a = Math.abs(im), i = a === 1 ? {text: '', html: ''} : fmtFloat(a, o), sg = im < 0 ? '-' : '+';
        const text = `${r ? r.text + ' ' + sg + ' ' : (im < 0 ? '-' : '')}${i.text}i`;
        const html = `${r ? r.html + ' ' + (sg === '-' ? '−' : '+') + ' ' : (im < 0 ? '−' : '')}${i.html}<i>i</i>`;
        const mod = Math.hypot(re, im), ang = Math.atan2(im, re);
        return {text, html, approx: (r?.approx) || i.approx, alt: `module ${fmtFloat(mod, o).html} · argument ${fmtFloat(o.angle === 'deg' ? ang * 180 / Math.PI : o.angle === 'grad' ? ang * 200 / Math.PI : ang, o).html}${o.angle === 'deg' ? '°' : o.angle === 'grad' ? ' gr' : ' rad'}`};
    }
    function formatValue(v, o = {}) {
        const opt = {digits: 10, dec: ',', frac: true, angle: 'deg', ...o};
        if (isF(v)) return fmtFrac(v, opt);
        if (isR(v)) { const f = fmtFloat(v, opt); if (opt.frac !== false && f.approx === false) return f; return f; }
        if (isC(v)) return fmtCx(v, opt);
        if (isTxt(v)) return {text: v.text, html: v.html, alt: v.note || ''};
        const sep = opt.dec === ',' ? ' ; ' : ', ';
        if (isList(v)) { const it = v.items.map(x => formatValue(x, opt)); return {text: `[${it.map(x => x.text).join(sep.trim() === ';' ? ' ; ' : ', ')}]`, html: `[${it.map(x => x.html).join(sep)}]`, alt: `${v.items.length} nombre${v.items.length > 1 ? 's' : ''}`}; }
        if (isMat(v)) {
            const cells = v.a.map(r => r.map(x => formatValue(x, opt)));
            return {text: `[${cells.map(r => `[${r.map(c => c.text).join(' ; ')}]`).join(' ; ')}]`, html: `<span class="cm-mat" role="table"><span class="cm-mat-b">[</span><table>${cells.map(r => `<tr>${r.map(c => `<td>${c.html}</td>`).join('')}</tr>`).join('')}</table><span class="cm-mat-b">]</span></span>`, alt: `matrice ${v.r} × ${v.c}`};
        }
        return {text: String(v), html: esc(String(v))};
    }

    /* ═════════ L'écriture jolie du calcul tapé (fractions, puissances, racines dessinées) ═════════ */
    const PREC = {eq: 0, cmp: 0, '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, '^': 4, post: 5, atom: 6};
    const precOf = n => (n.k === 'bin' ? PREC[n.op] : n.k === 'neg' ? PREC.neg : n.k === 'post' ? PREC.post : n.k === 'eq' || n.k === 'cmp' ? 0 : PREC.atom);
    function toHtml(node, o = {}) {
        const dec = o.dec || ',';
        const wrap = (n, min, keepParen = true) => { const h = toHtml(n, o); return precOf(n) < min || (keepParen && n.paren && n.k !== 'list' && !(n.k === 'call')) ? `<span class="cm-p">(</span>${h}<span class="cm-p">)</span>` : h; };
        switch (node.k) {
            case 'num': { const raw = node.raw || ''; if (/^0[xob]/i.test(raw)) return esc(raw); const t = raw.replace(/\s/g, ''), m = /^(\d*)([.,](\d+))?([eE]([+-]?\d+))?$/.exec(t); if (!m) return esc(raw); const ip = groupInt(m[1] || '0'), fp = m[3] ? dec + m[3] : ''; return `${ip}${fp}${m[4] ? `${NNBSP}×${NNBSP}10<sup>${minus(m[5])}</sup>` : ''}`; }
            case 'id': { const c = CONSTS[node.name] ?? CONSTS[fold(node.name)]; if (c === 'π' || c === 'φ') return `<i class="cm-k">${c}</i>`; if (c === 'ans') return '<span class="cm-ans">ans</span>'; return `<i>${esc(node.name)}</i>`; }
            case 'neg': return `−${wrap(node.a, PREC.neg + 1)}`;
            case 'list': {
                if (node.items.length && node.items.every(n => n.k === 'list')) return `<span class="cm-mat"><span class="cm-mat-b">[</span><table>${node.items.map(r => `<tr>${r.items.map(c => `<td>${toHtml(c, o)}</td>`).join('')}</tr>`).join('')}</table><span class="cm-mat-b">]</span></span>`;
                return `[${node.items.map(n => toHtml(n, o)).join(' ; ')}]`;
            }
            case 'post': return node.op === '!' ? `${wrap(node.a, PREC.post)}!` : node.op === '%' ? `${wrap(node.a, PREC.post)}${NNBSP}%` : `${wrap(node.a, PREC.post)}°`;
            case 'eq': case 'cmp': return `${toHtml(node.a, o)} <span class="cm-op">${{'=': '=', '<': '&lt;', '>': '&gt;', '<=': '≤', '>=': '≥', '<>': '≠'}[node.op]}</span> ${toHtml(node.b, o)}`;
            case 'bin': {
                if (node.op === '/') return `<span class="cm-fr"><span class="cm-fr-n">${toHtml(node.a, o)}</span><span class="cm-fr-d">${toHtml(node.b, o)}</span></span>`;
                if (node.op === '^') return `${wrap(node.a, PREC['^'] + 1)}<sup>${toHtml(node.b, o)}</sup>`;
                if (node.op === '*') { if (node.implicit) return `${wrap(node.a, PREC['*'])}${NNBSP}${wrap(node.b, PREC['*'] + 1)}`; return `${wrap(node.a, PREC['*'])} <span class="cm-op">×</span> ${wrap(node.b, PREC['*'] + 1)}`; }
                return `${wrap(node.a, PREC['+'])} <span class="cm-op">${node.op === '+' ? '+' : '−'}</span> ${wrap(node.b, PREC['+'] + 1)}`;
            }
            case 'call': {
                const key = fnKey(node.name), a = node.args.map(n => toHtml(n, o));
                if (node.bars || key === 'abs') return `<span class="cm-abs">|${a[0]}|</span>`;
                if (key === 'sqrt' && a.length === 1) return `<span class="cm-rt"><span class="cm-rt-s">√</span><span class="cm-rt-b">${a[0]}</span></span>`;
                if (key === 'cbrt' || key === 'root4' || (key === 'root' || key === 'sqrt') && a.length === 2) { const idx = key === 'cbrt' ? '3' : key === 'root4' ? '4' : a[1]; return `<span class="cm-rt"><sup class="cm-rt-i">${idx}</sup><span class="cm-rt-s">√</span><span class="cm-rt-b">${a[0]}</span></span>`; }
                if (node.infix) return `${wrap(node.args[0], PREC['*'])} <span class="cm-op">mod</span> ${wrap(node.args[1], PREC['*'] + 1)}`;
                if (key === 'fact') return `${wrap(node.args[0], PREC.post)}!`;
                if (key === 'exp' && a.length === 1) return `<i>e</i><sup>${a[0]}</sup>`;
                const shown = FN[key]?.show || node.name;
                return `<span class="cm-fn">${esc(shown)}</span><span class="cm-p">(</span>${a.join(' ; ')}<span class="cm-p">)</span>`;
            }
        }
        return '';
    }

    /* ═════════ Unités : mesures d'aujourd'hui, anciennes (calendarMore, par région), poids, monnaies ═════════ */
    // [noms…], genre, valeur dans l'unité de base (m, m², l, g, denier, s), exacte ?
    const BUILTIN_UNITS = [
        [['m', 'metre', 'metres', 'mètre', 'mètres'], 'long', '1', 1], [['cm', 'centimetre', 'centimetres'], 'long', '0.01', 1], [['mm', 'millimetre', 'millimetres'], 'long', '0.001', 1],
        [['dm', 'decimetre', 'decimetres'], 'long', '0.1', 1], [['km', 'kilometre', 'kilometres'], 'long', '1000', 1],
        [['inch', 'inches', 'pouce anglais', 'pouces anglais'], 'long', '0.0254', 1], [['ft', 'foot', 'feet', 'pied anglais', 'pieds anglais'], 'long', '0.3048', 1], [['yd', 'yard', 'yards'], 'long', '0.9144', 1],
        [['mi', 'mile', 'miles'], 'long', '1609.344', 1], [['mille marin', 'milles marins', 'nmi', 'nautique'], 'long', '1852', 1],
        [['m2', 'm²', 'metre carre', 'metres carres'], 'surf', '1', 1], [['cm2', 'cm²'], 'surf', '0.0001', 1], [['km2', 'km²'], 'surf', '1000000', 1],
        [['a', 'are', 'ares'], 'surf', '100', 1], [['ca', 'centiare', 'centiares'], 'surf', '1', 1], [['ha', 'hectare', 'hectares'], 'surf', '10000', 1], [['acre anglais', 'acres anglais', 'acre us'], 'surf', '4046.8564224', 1],
        [['l', 'litre', 'litres'], 'vol', '1', 1], [['cl', 'centilitre', 'centilitres'], 'vol', '0.01', 1], [['ml', 'millilitre', 'millilitres'], 'vol', '0.001', 1], [['dl', 'decilitre', 'decilitres'], 'vol', '0.1', 1],
        [['hl', 'hectolitre', 'hectolitres'], 'vol', '100', 1], [['m3', 'm³', 'metre cube', 'metres cubes'], 'vol', '1000', 1], [['cm3', 'cm³'], 'vol', '0.001', 1],
        [['g', 'gramme', 'grammes'], 'mass', '1', 1], [['mg', 'milligramme', 'milligrammes'], 'mass', '0.001', 1], [['kg', 'kilo', 'kilos', 'kilogramme', 'kilogrammes'], 'mass', '1000', 1],
        [['t', 'tonne', 'tonnes'], 'mass', '1000000', 1], [['quintal', 'quintaux'], 'mass', '100000', 1], [['lb', 'livre anglaise', 'livres anglaises', 'pound', 'pounds'], 'mass', '453.59237', 1], [['oz', 'once anglaise', 'onces anglaises', 'ounce'], 'mass', '28.349523125', 1],
        // poids de marc (Paris, avant 1795) : 1 livre = 2 marcs = 16 onces = 128 gros = 9 216 grains
        [['livre poids', 'livres poids', 'livre poids de marc', 'livres poids de marc', 'livre de poids'], 'mass', '489.5058', 0], [['marc', 'marcs'], 'mass', '244.7529', 0],
        [['once', 'onces'], 'mass', '30.59411', 0], [['gros'], 'mass', '3.824264', 0], [['denier de poids', 'deniers de poids', 'scrupule', 'scrupules'], 'mass', '1.274755', 0], [['grain', 'grains'], 'mass', '0.05311458', 0],
        [['quintal ancien', 'quintaux anciens'], 'mass', '48950.58', 0], [['millier', 'milliers'], 'mass', '489505.8', 0],
        // monnaie de compte : 1 livre = 20 sols = 240 deniers ; franc germinal (an XI) = 1 livre 3 deniers (81 livres = 80 francs)
        [['denier', 'deniers', 'd'], 'money', '1', 1], [['sol', 'sols', 'sou', 'sous', 's'], 'money', '12', 1], [['livre', 'livres', 'livre tournois', 'livres tournois', 'lt'], 'money', '240', 1],
        [['liard', 'liards'], 'money', '3', 1], [['ecu', 'ecus', 'écu', 'écus', 'petit ecu', 'petits ecus'], 'money', '720', 1], [['gros ecu', 'gros ecus'], 'money', '1440', 1],
        [['louis', 'louis d’or', "louis d'or"], 'money', '5760', 1], [['pistole', 'pistoles'], 'money', '2400', 1], [['franc', 'francs', 'franc germinal'], 'money', '243', 1],
        [['s', 'seconde', 'secondes', 'sec'], 'time', '1', 1], [['min', 'minute', 'minutes'], 'time', '60', 1], [['h', 'heure', 'heures'], 'time', '3600', 1],
        [['j', 'jour', 'jours'], 'time', '86400', 1], [['semaine', 'semaines'], 'time', '604800', 1], [['mois'], 'time', '2629746', 1], [['an', 'ans', 'annee', 'annees', 'année', 'années'], 'time', '31556952', 1], [['siecle', 'siecles', 'siècle', 'siècles'], 'time', '3155695200', 1],
    ];
    const KIND_LABEL = {long: 'longueur', surf: 'surface', vol: 'volume', mass: 'poids', money: 'monnaie', time: 'durée', temp: 'température'};
    const KIND_BASE = {long: 'm', surf: 'm²', vol: 'l', mass: 'g', money: 'denier', time: 's'};
    /** le pluriel d'un nom d'unité : toise → toises, boisseau → boisseaux, journal → journaux */
    const plur = w => (/[sxz]$/.test(w) ? w : /(eau|au|eu)$/.test(w) ? w + 'x' : /al$/.test(w) && !/^(bal|cal|chacal|festival|carnaval|val)$/.test(w) ? w.slice(0, -2) + 'aux' : w + 's');
    const decFrac = s => { const m = /^(-?\d+)(?:\.(\d+))?$/.exec(String(s)); if (!m) return fracOfFloat(Number(s)); return fr(BigInt(m[1] + (m[2] || '')), 10n ** BigInt((m[2] || '').length)); };
    const numFrac = v => (Number.isInteger(v) ? fr(BigInt(v)) : decFrac(String(v)));
    let unitCache = null;
    function unitTable(region = 'paris') {
        if (unitCache && unitCache.region === region && unitCache.cm === !!calMore()) return unitCache.map;
        const map = new Map(), addU = (alias, u) => { const k = fold(alias).replace(/[’']/g, "'").replace(/\s+/g, ' ').trim(); if (!k) return; if (!map.has(k)) map.set(k, []); const l = map.get(k); if (!l.some(x => x.id === u.id)) l.push(u); };
        BUILTIN_UNITS.forEach(([names, kind, val, exact]) => { const u = {id: 'b:' + names[0], label: names[0], names, kind, value: decFrac(val), exact: !!exact}; names.forEach(n => addU(n, u)); });
        const cm = calMore();
        if (cm?.REGIONS) {
            const regs = [cm.REGIONS.find(r => r.id === region), cm.REGIONS.find(r => r.id === 'paris')].filter((r, i, a) => r && a.indexOf(r) === i);
            const extraFirst = new Map();
            regs.forEach((r, ri) => r.units.forEach(([id, label, kind, value, approx, note]) => {
                const u = {id: `${r.id}:${id}`, label, kind: kind === 'grain' || kind === 'liq' ? 'vol' : kind, value: numFrac(value), exact: false, approx: !!approx, note: note || '', region: r.label};
                const names = new Set([id.replace(/\d+$/, m => (m === '2' ? ' carre' : m)).replace(/_/g, ' ')]);
                String(label).replace(/\s*\([^)]*\)/g, '').split(/\s+ou\s+/).forEach(n => { n = n.trim(); if (!n) return; names.add(n); const w = n.split(' '); names.add([plur(w[0]), ...w.slice(1)].join(' ')); if (w.length > 1 && !/[sx]$/.test(w[w.length - 1]) && /carree?$/.test(fold(w[w.length - 1]))) names.add([w[0] + 's', ...w.slice(1, -1), w[w.length - 1] + 's'].join(' ')); });
                if (/^(toise2|perche2|perche2_ef|canne2|corde2)$/.test(id)) names.add(fold(label).replace(/\s*\(.*$/, ''));
                [...names].forEach(n => { const w = n.split(' '); names.add([plur(w[0]), ...w.slice(1)].join(' ')); if (w[0] !== plur(w[0]) && /s$/.test(plur(w[0])) === false) names.add([w[0] + 's', ...w.slice(1)].join(' ')); });
                [...names].forEach(n => { const k = fold(n); if (ri === 0 || !extraFirst.has(k)) { addU(n, u); extraFirst.set(k, 1); } });
                // les unités de la région passent avant les autres pour un même nom
                const k0 = fold(label); if (ri === 0 && map.get(k0)?.length > 1) map.set(k0, [u, ...map.get(k0).filter(x => x !== u)]);
            }));
        }
        // températures (pas proportionnelles)
        [['°c', 'celsius', 'degre celsius', 'degres celsius', 'degré celsius', 'degrés celsius'], ['°f', 'fahrenheit', 'degre fahrenheit', 'degres fahrenheit'], ['kelvin', 'kelvins']].forEach((names, i) => { const u = {id: 't:' + ['c', 'f', 'k'][i], label: ['°C', '°F', 'K'][i], kind: 'temp', temp: ['c', 'f', 'k'][i], exact: true}; names.forEach(n => addU(n, u)); });
        unitCache = {region, cm: !!cm, map}; return map;
    }
    const unitsByName = (name, region) => unitTable(region).get(fold(name).replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()) || [];
    const tempToK = (v, t) => (t === 'k' ? v : t === 'c' ? add(v, fr(27315n, 100n)) : add(mul(sub(v, fr(32)), fr(5n, 9n)), fr(27315n, 100n)));
    const tempFromK = (v, t) => (t === 'k' ? v : t === 'c' ? sub(v, fr(27315n, 100n)) : add(mul(sub(v, fr(27315n, 100n)), fr(9n, 5n)), fr(32)));
    /** « 3 livres 5 sous 6 deniers », « 2,5 toises », « (2+3) pieds » → {base, kind, unit (la dernière)} ou null */
    function parseQuantity(s, env, kindHint = null, depth = 0) {
        s = s.trim(); if (!s || depth > 6) return null;
        const words = s.split(/\s+/), region = env.region || 'paris';
        for (let n = Math.min(6, words.length); n >= 1; n--) {
            const tail = words.slice(-n).join(' '), restWords = words.slice(0, -n); let rest = restWords.join(' ');
            let units = unitsByName(tail, region);
            // « 12toises » ou « 3m » collés
            if (!units.length && n === 1) { const m = /^(.*?[\d)])([A-Za-zÀ-ÿ°²³'’][\wÀ-ÿ°²³'’]*)$/.exec(tail); if (m) { units = unitsByName(m[2], region); if (units.length) rest = [...restWords, m[1]].join(' '); } }
            if (!units.length) continue;
            if (kindHint) units = [...units.filter(u => u.kind === kindHint), ...units.filter(u => u.kind !== kindHint)];
            for (const u of units) {
                if (kindHint && u.kind !== kindHint) continue;
                if (!rest.trim()) return {base: u.kind === 'temp' ? tempToK(ONE, u.temp) : u.value, kind: u.kind, unit: u, amount: ONE};
                const amt = tryAmount(rest, env);
                if (amt !== null) return {base: u.kind === 'temp' ? tempToK(amt, u.temp) : mul(amt, u.value), kind: u.kind, unit: u, amount: amt};
                if (u.kind === 'temp') continue;
                const rw = rest.split(/\s+/);
                for (let k = rw.length - 1; k >= 1; k--) {
                    const amt2 = tryAmount(rw.slice(k).join(' '), env); if (amt2 === null) continue;
                    const q = parseQuantity(rw.slice(0, k).join(' ').replace(/\s+et$/i, ''), env, u.kind, depth + 1);
                    if (q && q.kind === u.kind) return {base: add(q.base, mul(amt2, u.value)), kind: u.kind, unit: u, compound: true};
                }
            }
        }
        return null;
    }
    function tryAmount(s, env) { try { const v = evaluateNode(parse(s, env), {...env, vars: {}}); return isF(v) || isR(v) ? v : null; } catch (_) { return null; } }
    /** livres décimales → « 3 livres 5 sols 6 deniers » (calendarMore.lsd quand il est là) */
    function lsdText(deniers) {
        const L = toF(deniers) / 240, cm = calMore();
        if (cm?.lsd) return cm.lsd(L);
        let den = Math.round(toF(deniers)); const l = Math.floor(den / 240), s = Math.floor((den % 240) / 12), d = den % 12;
        return [l ? `${l} livre${l > 1 ? 's' : ''}` : '', s ? `${s} sol${s > 1 ? 's' : ''}` : '', d ? `${d} denier${d > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ') || '0 livre';
    }
    function plainName(u, v) { const n = u.names ? u.names[0] : String(u.label).replace(/\s*\(.*$/, ''); const many = isF(v) ? babs(v.n) >= 2n * v.d : Math.abs(toF(v)) >= 2; if (!many || /^[a-z]{1,3}[²³23]?$/i.test(n)) return n; const w = n.split(' '); return [plur(w[0]), ...w.slice(1)].join(' '); }
    function convertText(q, target, env, fmt) {
        const label = u => esc(String(u.label).replace(/\s*\(.*$/, ''));
        let val;
        if (target.kind === 'temp') val = tempFromK(q.base, target.temp); else val = div(q.base, target.value);
        const exact = q.unit.exact !== false && target.exact !== false && !q.unit.approx;
        const shown = exact || q.kind === 'money' ? val : toF(val);
        // les mesures anciennes ne sont connues qu'à 6 chiffres près : on n'en montre pas plus
        const f = formatValue(isF(shown) && shown.d !== 1n && !(q.kind === 'money') ? toF(shown) : shown, {...fmt, digits: exact ? fmt.digits : Math.min(fmt.digits || 10, 6), frac: q.kind === 'money' ? fmt.frac : false});
        const tName = target.kind === 'temp' ? target.label : env.typedTarget && !/^(m|l|g|s|h|j|a|t|d)$/i.test(env.typedTarget) && fold(env.typedTarget) !== fold(target.names?.[0] || '') ? env.typedTarget : plainName(target, val);
        if (q.kind === 'money' && !(isF(val) && val.d === 1n) && /^(livre|sol|sou|ecu|louis|pistole|franc)/.test(fold(target.names?.[0] || ''))) { // « 3 livres 5 sols 5 deniers »
            const t = lsdText(q.base), dv = formatValue(toF(val), {...fmt, frac: false});
            return new Txt(t, esc(t), {convert: true, value: val, kind: 'money', note: `≈ ${dv.text} ${tName} · 1 livre = 20 sols = 240 deniers`});
        }
        const notes = [];
        if (q.unit.approx || target.approx) notes.push('≈ valeur approchée : la mesure changeait d’un lieu à l’autre');
        if (q.unit.region && q.unit.region !== target.region) notes.push(`mesure de ${q.unit.region}`); else if (target.region) notes.push(`mesure de ${target.region}`);
        if (q.kind === 'money' && lsdText(q.base) !== `${f.text} ${tName}`) notes.push(lsdText(q.base));
        if (q.unit.note) notes.push(q.unit.note); if (target.note) notes.push(target.note);
        return new Txt(`${f.text} ${tName}`, `${f.html}${NNBSP}<span class="cm-unit">${esc(tName)}</span>`, {convert: true, value: val, note: notes.filter(Boolean).join(' · '), kind: q.kind, unitLabel: label(target)});
    }
    function baseText(q, fmt) {
        if (q.kind === 'temp') { const c = tempFromK(q.base, 'c'); const f = formatValue(toF(c), {...fmt, frac: false}); return new Txt(`${f.text} °C`, `${f.html}${NNBSP}<span class="cm-unit">°C</span>`, {convert: true, value: c}); }
        if (q.kind === 'money') { const t = lsdText(q.base); const f = formatValue(q.base, fmt); return new Txt(t, esc(t), {convert: true, value: q.base, note: `soit ${f.text} denier${toF(q.base) >= 2 ? 's' : ''} · 1 livre = 20 sols = 240 deniers`}); }
        const b = q.base, v = toF(b), k = q.kind;
        let unit = KIND_BASE[k], val = v;
        if (k === 'long' && Math.abs(v) >= 1000) { unit = 'km'; val = v / 1000; } else if (k === 'surf' && Math.abs(v) >= 10000) { unit = 'ha'; val = v / 10000; } else if (k === 'surf' && Math.abs(v) >= 100) { unit = 'a'; val = v / 100; }
        else if (k === 'vol' && Math.abs(v) >= 100) { unit = 'hl'; val = v / 100; } else if (k === 'mass' && Math.abs(v) >= 1000) { unit = 'kg'; val = v / 1000; }
        else if (k === 'time') { const d = v / 86400; if (Math.abs(d) >= 1) { unit = 'jours'; val = d; } else if (Math.abs(v) >= 3600) { unit = 'h'; val = v / 3600; } else if (Math.abs(v) >= 60) { unit = 'min'; val = v / 60; } }
        const f = formatValue(q.unit.exact && isF(b) && unit === KIND_BASE[k] ? b : val, {...fmt, frac: false, digits: q.unit.exact === false ? Math.min(fmt.digits || 10, 6) : fmt.digits});
        return new Txt(`${f.text} ${unit}`, `${f.html}${NNBSP}<span class="cm-unit">${esc(unit)}</span>`, {convert: true, value: val, note: [q.unit.approx ? '≈ valeur approchée' : '', q.unit.region ? `mesure de ${q.unit.region}` : '', q.unit.note || ''].filter(Boolean).join(' · ')});
    }

    /* ═════════ Dates des actes (C4) : calendrier républicain, jour de la semaine, âge entre deux dates ═════════ */
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const REP_FR = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jour complémentaire'];
    const SANSC = ['de la Vertu', 'du Génie', 'du Travail', 'de l’Opinion', 'des Récompenses', 'de la Révolution'];
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
    const WEEK = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    const jdnG = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045; };
    const longDate = o => `${o.d === 1 ? '1er' : o.d} ${MONTHS[o.m - 1]} ${o.y}`;
    function weekdayOf(o) { const cm = calMore(); if (cm?.weekday) { try { return cm.weekday(o.y, o.m, o.d).weekday; } catch (_) {} } return WEEK[((jdnG(o.y, o.m, o.d) % 7) + 7) % 7]; }
    function repLabel(r) { if (r.mo === 13) return `${r.d === 1 ? '1er' : r.d} jour complémentaire (jour ${SANSC[r.d - 1] || ''}) an ${ROMAN[r.an]}`; return `${r.d === 1 ? '1er' : r.d} ${REP_FR[r.mo - 1]} an ${ROMAN[r.an]}`; }
    function toRepublican(o) {
        const S = sheet(); if (!S) fail('Le calendrier républicain n’est pas chargé.');
        if (jdnG(o.y, o.m, o.d) < jdnG(1792, 9, 22) || jdnG(o.y, o.m, o.d) > jdnG(1805, 12, 31)) fail('Le calendrier républicain n’a servi que du 22 septembre 1792 (1er vendémiaire an I) au 31 décembre 1805.');
        const r = S.gregorianToRepublican(o.y, o.m, o.d); if (!r) fail('Cette date est hors du calendrier républicain.'); return r;
    }
    function readDate(text) {
        const S = sheet(); if (!S) return null;
        const t = String(text).trim(); if (!t || t.length > 120) return null;
        const d = S.readActDate(t); if (!d) return null;
        if (d.error) fail(String(d.error).replace(/^./, c => c.toUpperCase()) + (/\.$/.test(d.error) ? '' : '.'));
        return d;
    }
    const looksLikeDate = t => /\b(janv|fevr|févr|mars|avril|avr|mai|juin|juil|aout|août|sept|oct|nov|dec|déc|vend[ée]miaire|brumaire|frimaire|niv[oô]se|pluvi[oô]se|vent[oô]se|germinal|flor[ée]al|prairial|messidor|thermidor|fructidor|compl[ée]mentaire|sansculottide)|\ban\s+[ivx]+\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{3,4}\b|\b\d{4}-\d{2}-\d{2}\b|\bvers\s+\d{3,4}\b/i.test(fold(t));
    function dateTxt(d) {
        const lines = []; let main;
        if (d.prec === 'jour' && d.d) {
            const g = longDate(d), wd = weekdayOf(d);
            if (d.rep) { main = `${g}`; lines.push(`${wd}`, `= ${d.label}`); }
            else { main = `${d.kind ? d.kind + ' ' : ''}${g}`; lines.push(wd); try { if (!d.kind && jdnG(d.y, d.m, d.d) >= jdnG(1792, 9, 22) && jdnG(d.y, d.m, d.d) <= jdnG(1805, 12, 31)) lines.push(`= ${repLabel(toRepublican(d))}`); } catch (_) {} }
        } else { main = d.label; if (d.approx) lines.push('date approchée'); }
        return new Txt(main, esc(main), {date: d, note: lines.join(' · ')});
    }
    function diffTxt(a, b) {
        const cm = calMore(); if (!cm?.dateDiff) fail('Le calcul des écarts de dates n’est pas chargé.');
        const obj = d => ({y: d.y, m: d.m || 0, d: d.d || 0});
        const r = cm.dateDiff(obj(a), obj(b)); if (!r) fail('Je ne sais pas calculer l’écart entre ces deux dates.');
        const pl = (n, one, many) => `${n.toLocaleString('fr-FR')} ${n > 1 ? (many || one + 's') : one}`;
        const ymd = x => [x.years ? pl(x.years, 'an') : '', x.months ? `${x.months} mois` : '', x.days || (!x.years && !x.months) ? pl(x.days, 'jour') : ''].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' et $1');
        if (r.exact) { const t = ymd(r); return new Txt(t, esc(t), {age: true, value: fr(r.years), note: `soit ${pl(r.totalDays, 'jour')} (${pl(r.weeks, 'semaine')}${r.weekDays ? ` et ${pl(r.weekDays, 'jour')}` : ''})${r.swapped ? ' · la 2e date est la plus ancienne' : ''} · du ${a.label} au ${b.label}`}); }
        const t = r.min.years === r.max.years ? `${pl(r.min.years, 'an')} environ` : `entre ${r.min.years} et ${pl(r.max.years, 'an')}`;
        return new Txt(t, esc(t), {age: true, value: fr(r.min.years), note: `une date n’est pas complète (jour, mois et année) : de ${ymd(r.min)} à ${ymd(r.max)}`});
    }
    function tryDates(input, env) {
        const t = input.trim();
        // conversion : « 3 frimaire an XII en grégorien », « 14/07/1789 en républicain »
        let m = /^(.+?)\s+(?:en|vers|->|→)\s+(?:calendrier\s+)?(r[ée]publicain|r[ée]volutionnaire|gr[ée]gorien|jour de la semaine|jour)\s*$/i.exec(t);
        if (m) {
            const d = readDate(m[1]); if (!d) fail(`Je ne comprends pas la date « ${m[1]} ».`, {hint: 'Écris-la comme dans un acte : 7 mai 1925, 14/07/1789, 3 frimaire an XII.'});
            if (!d.d) fail('Il faut une date complète (jour, mois, année).');
            const w = fold(m[2]);
            if (w.startsWith('jour')) { const wd = weekdayOf(d); return new Txt(wd, esc(wd), {date: d, note: longDate(d)}); }
            if (w.startsWith('gr')) { const g = longDate(d); return new Txt(g, esc(g), {date: d, note: weekdayOf(d)}); }
            const r = toRepublican(d), lab = repLabel(r); return new Txt(lab, esc(lab), {date: d, note: `${weekdayOf(d)} ${longDate(d)}`});
        }
        // écart, âge : « 7 mai 1925 → 8 décembre 1960 », « du 7 mai 1925 au 8/12/1960 », « âge 1925 1960 »
        m = /^(?:(?:[âa]ge|[ée]cart|dur[ée]e)\s*(?:de|du|entre|:)?\s*|du\s+|de\s+|entre\s+)?(.+?)\s*(?:→|->|=>|\bau\b|\bà\b|\ba\b|\bjusqu[’']?au\b|\bet\b|\bjusqu[’']?à\b)\s*(?:le\s+)?(.+)$/i.exec(t);
        if (m && (/→|->|=>/.test(t) || /^(?:[âa]ge|[ée]cart|dur[ée]e|du|entre)\b/i.test(t) || looksLikeDate(m[1]) || looksLikeDate(m[2]))) {
            let a = null, b = null; try { a = readDate(m[1]); b = readDate(m[2]); } catch (e) { if (looksLikeDate(t)) throw e; }
            if (a && b && !(isNumericOnly(m[1]) && isNumericOnly(m[2]) && !/→|->|=>|[âa]ge|[ée]cart/i.test(t))) return diffTxt(a, b);
        }
        // une seule date
        if (looksLikeDate(t) && /[a-zA-Zéû]/.test(t)) { const d = readDate(t); if (d) return dateTxt(d); }
        return null;
    }
    const isNumericOnly = s => /^[\d\s.,]+$/.test(s.trim());

    /* ═════════ Le calcul complet d'une ligne ═════════ */
    /** « journal » : une mesure d'une autre région ? → la phrase pour la choisir */
    function otherRegionHint(text) {
        const cm = calMore(); if (!cm?.REGIONS) return '';
        const words = fold(text).split(/\s+/).filter(w => /^[a-z]{3,}$/.test(w));
        for (const r of cm.REGIONS) for (const u of r.units) { const n = fold(u[1]).replace(/\s*\(.*$/, ''), id = fold(u[0]); if (words.some(w => w === id || w === plur(id) || n.startsWith(w) && w.length >= 4)) return `« ${String(u[1]).replace(/\s*\(.*$/, '')} » est une mesure de ${r.label} : choisis cette région dans ⚙️ Réglages → Mesures anciennes.`; }
        return '';
    }
    const BASES = {bin: 2, binaire: 2, oct: 8, octal: 8, hex: 16, hexa: 16, hexadecimal: 16, decimal: 10};
    function tryConvert(input, env, fmt) {
        const m = /^(.+?\S)\s*(?:\s(?:en|in|vers)\s|->|→|=>)\s*(.+)$/i.exec(input.trim());
        if (!m) return null;
        const left = m[1].trim(), right = m[2].trim(), rf = fold(right).replace(/^base\s+/, 'base ');
        // bases et formes
        if (BASES[rf] || /^base \d+$/.test(rf)) { const b = BASES[rf] || Number(rf.slice(5)); const v = evaluateNode(parse(left, env), env); if (b === 10) return v; return toBase(v, b); }
        if (/^fractions?$/.test(rf)) return FN.frac.f([evaluateNode(parse(left, env), env)]);
        if (/^(decimal|decimale|nombre a virgule|virgule)$/.test(rf)) return FN.dec.f([evaluateNode(parse(left, env), env)]);
        if (/^(facteurs|facteurs premiers|nombres premiers)$/.test(rf)) return FN.facteurs.f([evaluateNode(parse(left, env), env)]);
        if (/^(lsd|livres sols deniers|livres sous deniers)$/.test(rf)) { const q = parseQuantity(left, env, 'money'); if (!q) return null; return baseText(q, fmt); }
        const targets = unitsByName(right, env.region);
        if (!targets.length) { if (parseQuantity(left, env) || tryAmount(left, env) !== null) fail(`Je ne connais pas l’unité « ${right} ».`, {hint: otherRegionHint(right) || 'Les unités comprises sont dans la rubrique « Unités » du mode 🧪 Scientifique.'}); return null; }
        for (const tu of targets) {
            const q = parseQuantity(left, env, tu.kind);
            if (q && q.kind === tu.kind) return convertText(q, tu, {...env, typedTarget: right.replace(/\s+/g, ' ')}, fmt);
        }
        const q = parseQuantity(left, env);
        if (q) fail(`On ne peut pas convertir une ${KIND_LABEL[q.kind]} en ${KIND_LABEL[targets[0].kind]} (${right}).`);
        if (/[a-zA-Zé]/.test(left)) fail(`Je ne connais pas l’unité de « ${left} ».`, {hint: otherRegionHint(left) || 'Les unités comprises sont dans la rubrique « Unités » du mode 🧪 Scientifique.'});
        return null;
    }
    const DEFAULTS = {angle: 'deg', digits: 10, dec: ',', frac: true, region: 'paris'};
    /**
     * Calcule une ligne tapée. opts : {angle: 'deg'|'rad'|'grad', digits, dec: ','|'.', frac, region, ans}
     * → {ok, value, kind, text (à copier), html (joli), alt (2e ligne), approx, inputHtml, error, hint, pos}
     */
    function evaluate(input, opts = {}) {
        const o = {...DEFAULTS, ...opts}; budget = 0;
        const fmt = {digits: o.digits, dec: o.dec, frac: o.frac, angle: o.angle};
        const env = {angle: o.angle, ans: o.ans, region: o.region, dec: o.dec, fmt, vars: {}, top: true};
        const src = String(input ?? '').replace(/\s+$/g, '').replace(/^\s+/, '').replace(/=\s*$/, '');
        // pas de « / » tapé : un résultat décimal exact s'écrit en décimal (1 234,5), la fraction en 2e ligne
        const typedFrac = /\/|÷|:|frac|fraction|\^\s*\(?\s*-|\^-|inv|systeme|resoudre|solve|racines/i.test(src);
        const decOnly = v => { if (!isF(v) || v.d === 1n || typedFrac) return false; let d = v.d; while (d % 2n === 0n) d /= 2n; while (d % 5n === 0n) d /= 5n; return d === 1n; };
        const done = (v, kind, inputHtml) => {
            if (isNum(v) && !isFinite(toF(isC(v) ? v.re : v)) && !isC(v)) fail('Nombre trop grand pour être calculé.');
            const f = formatValue(v, decOnly(v) ? {...fmt, frac: false} : fmt);
            if (o.angle !== 'rad' && /(sin|cos|tan)\s*\(?[^)]*(pi|π)/i.test(src)) f.alt = [f.alt, `angle en ${o.angle === 'deg' ? 'degrés' : 'grades'} : passe en RAD pour calculer avec π`].filter(Boolean).join(' · ');
            return {ok: true, value: v, kind: kind || (isTxt(v) ? (v.solve ? 'solve' : v.convert ? 'convert' : v.date || v.age ? 'date' : v.bool !== undefined ? 'bool' : 'text') : isMat(v) ? 'matrix' : isList(v) ? 'list' : isC(v) ? 'complex' : 'number'), text: f.text, html: f.html, alt: f.alt || '', approx: !!f.approx, exact: isF(v), inputHtml: inputHtml ?? esc(src), canReuse: isNum(v) || isList(v) || isMat(v) || (isTxt(v) && isNum(v.value))};
        };
        try {
            if (!src) fail('Tape un calcul.');
            if (src.length > LIMITS.input) fail(`Calcul trop long (plus de ${LIMITS.input} signes).`);
            const d = /[a-zA-Zéû→]|->/.test(src) ? tryDates(src, env) : null; if (d) return done(d, 'date');
            if (/\s(en|in|vers)\s|->|→|=>/i.test(src)) { const c = tryConvert(src, env, fmt); if (c) return done(c, isTxt(c) && c.convert ? 'convert' : null); }
            let tree;
            try { tree = parse(src, o); }
            catch (e) { if (e.calc) { const q = /[a-zA-Z]/.test(src) ? parseQuantity(src, env) : null; if (q) return done(baseText(q, fmt), 'convert'); } throw e; }
            const inputHtml = toHtml(tree, o);
            if (tree.k === 'eq') {
                const fv = [...freeVars(tree)];
                if (fv.length && fv.every(v => VAR_LETTERS.test(v))) return done(solveEquations([tree], env, null, null), 'solve', inputHtml);
            }
            let v;
            try { v = evaluateNode(tree, env); }
            catch (e) { if (e.calc && /n’a pas de valeur|Je ne connais pas/.test(e.message)) { const q = parseQuantity(src, env); if (q) return done(baseText(q, fmt), 'convert'); } throw e; }
            return done(v, null, inputHtml);
        } catch (e) {
            if (!e.calc) { if (e instanceof RangeError) return {ok: false, error: 'Ce calcul est trop gros pour être fait.', hint: '', pos: -1, inputHtml: esc(src)}; throw e; }
            return {ok: false, error: e.message, hint: e.hint || '', pos: e.pos, inputHtml: esc(src)};
        }
    }
    /** une fonction y = f(x) pour les courbes : compilée une fois, calculée en nombres à virgule (rapide) ; NaN hors du domaine */
    function compile(text, {angle = 'rad', dec = ',', vars = {}} = {}) {
        let src = String(text || '').trim().replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
        const tree = parse(src, {dec});
        const fv = [...freeVars(tree)].filter(v => v !== 'x');
        if (fv.length) fail(`La lettre « ${fv[0]} » n’a pas de valeur : une courbe s’écrit avec x seulement, par exemple sin(x).`);
        if (tree.k === 'eq' || tree.k === 'cmp') fail('Écris seulement la formule de y, par exemple x^2 − 1 (sans « = »).');
        const env = {angle, float: true, vars: {...vars}, fmt: {}};
        const fn = x => { budget = 0; try { env.vars.x = x; const v = evaluateNode(tree, env); if (isC(v)) return Math.abs(v.im) < 1e-12 * Math.max(1, Math.abs(v.re)) ? v.re : NaN; const r = toF(v); return Number.isFinite(r) ? r : NaN; } catch (_) { return NaN; } };
        fn.html = toHtml(tree, {dec}); fn.tree = tree;
        return fn;
    }
    /** la liste des fonctions pour l'aide : [{name, group, desc, ex}] */
    const GROUPS = {trig: 'Trigonométrie', hyp: 'Hyperboliques', log: 'Logarithmes et exponentielle', pow: 'Puissances et racines', cx: 'Nombres complexes', arith: 'Arithmétique et arrondis', base: 'Bases (binaire, hexadécimal…)', stat: 'Statistiques', mat: 'Matrices', eq: 'Équations', ana: 'Dérivées et intégrales'};
    const functionList = () => Object.entries(FN).filter(([k]) => k !== 'root4').map(([k, d]) => ({name: d.show || k, key: k, group: d.group, groupLabel: GROUPS[d.group] || '', desc: d.desc || '', ex: d.ex || '', aliases: Object.entries(ALIAS).filter(([, v]) => v === k).map(([a]) => a)}));
    const unitList = (region = 'paris') => { const seen = new Set(), out = []; unitTable(region).forEach(list => list.forEach(u => { if (seen.has(u.id)) return; seen.add(u.id); out.push({id: u.id, label: String(u.label).replace(/\s*\(.*$/, ''), full: u.label, kind: u.kind, kindLabel: KIND_LABEL[u.kind], region: u.region || '', approx: !!u.approx, exact: !!u.exact, name: u.names ? u.names[0] : fold(String(u.label).replace(/\s*\(.*$/, ''))}); })); return out; };
    /** le nombre à reprendre dans un autre calcul (« ans », la mémoire) : une valeur, ou null */
    const reusable = v => (isNum(v) || isList(v) || isMat(v) ? v : isTxt(v) && isNum(v.value) ? v.value : null);
    /** un nombre écrit pour être retapé (mémoire MR, insertion depuis l'historique) */
    function asInput(v, {dec = ','} = {}) {
        v = reusable(v); if (v === null) return '';
        if (isF(v)) { if (v.d === 1n) return v.n.toString(); const n = `${v.n}/${v.d}`; return v.n < 0n ? `(${n})` : n; }
        if (isR(v)) { let s = String(Number(v.toPrecision(15))); s = s.replace(/e\+?/, 'e'); return dec === ',' ? s.replace('.', ',') : s; }
        if (isC(v)) return `(${formatValue(v, {dec, digits: 15}).text.replace(/\s/g, '')})`;
        const f = formatValue(v, {dec, digits: 15}); return f.text;
    }

    return {LIMITS, CalcError, Frac, Cx, List, Mat, Txt, fr, toF, evaluate, parse, tokenize, toHtml, formatValue, compile, freeVars, functionList, unitList, unitsByName, GROUPS, KIND_LABEL,
        isF, isR, isC, isList, isMat, isTxt, isNum, reusable, asInput, add, sub, mul, div, pow, sqrt, matDet, matInverse, polyRoots, isPrime, factorize, fold, esc,
        _reset: () => { unitCache = null; }};
});
