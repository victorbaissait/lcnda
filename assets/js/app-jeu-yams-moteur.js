/* LCNDA — 🎲 Yams (Yahtzee) : le moteur (sans écran). Testé dans Node.
 * 5 dés, 3 lancers par tour (on garde les dés qu'on veut entre deux lancers), 13 cases à remplir chacun, une par tour.
 * Feuille « française » : 1 à 6 (la somme des dés de ce chiffre), prime de 35 points si le haut fait 63 ou plus ;
 *   Brelan (3 dés pareils : 3 × leur valeur), Carré (4 × la valeur), Full (25), Petite suite (4 à la suite : 30), Grande suite (5 : 40),
 *   Yams (5 pareils : 50), Chance (la somme des 5 dés).
 * Feuille « américaine » (Yahtzee) : Brelan et Carré = la somme des 5 dés ; un Yahtzee de plus = 100 points de prime, et il sert de
 *   « joker » (Full, suites au maximum) quand la case du haut de son chiffre est déjà remplie.
 * L'ordinateur : facile (prend le plus gros score tout de suite), moyen (garde les dés les plus nombreux), difficile (calcule
 *   l'espérance de chaque façon de garder les dés, sur toutes les relances possibles).
 */
(function (root) {
    'use strict';
    const UPPER = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six'];
    const LOWER = ['brelan', 'carre', 'full', 'psuite', 'gsuite', 'yams', 'chance'];
    const BOXES = [...UPPER, ...LOWER];
    const LABELS = {un: 'As (les 1)', deux: 'Les 2', trois: 'Les 3', quatre: 'Les 4', cinq: 'Les 5', six: 'Les 6', brelan: 'Brelan', carre: 'Carré', full: 'Full', psuite: 'Petite suite', gsuite: 'Grande suite', yams: 'Yams', chance: 'Chance'};
    const HELP = {
        fr: {un: 'La somme des 1', deux: 'La somme des 2', trois: 'La somme des 3', quatre: 'La somme des 4', cinq: 'La somme des 5', six: 'La somme des 6', brelan: '3 dés pareils : 3 × leur valeur', carre: '4 dés pareils : 4 × leur valeur', full: '3 pareils + 2 pareils : 25', psuite: '4 dés qui se suivent : 30', gsuite: '5 dés qui se suivent : 40', yams: '5 dés pareils : 50', chance: 'La somme des 5 dés'},
        us: {un: 'La somme des 1', deux: 'La somme des 2', trois: 'La somme des 3', quatre: 'La somme des 4', cinq: 'La somme des 5', six: 'La somme des 6', brelan: '3 dés pareils : la somme des 5 dés', carre: '4 dés pareils : la somme des 5 dés', full: '3 pareils + 2 pareils : 25', psuite: '4 dés qui se suivent : 30', gsuite: '5 dés qui se suivent : 40', yams: '5 dés pareils : 50 (un autre : 100 de prime)', chance: 'La somme des 5 dés'},
    };
    const PRIME_AT = 63, PRIME = 35, BONUS_YAMS = 100;
    const counts = d => { const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach(v => { c[v]++; }); return c; };
    const sum = d => d.reduce((a, b) => a + b, 0);
    const run = d => { const has = new Set(d); let best = 0, cur = 0; for (let v = 1; v <= 6; v++) { cur = has.has(v) ? cur + 1 : 0; best = Math.max(best, cur); } return best; };
    const isYams = d => d.length === 5 && d.every(v => v === d[0]);

    /** les points que ces dés font dans cette case (sheet : la feuille du joueur, pour le joker de la variante américaine) */
    function score(d, box, variant = 'fr', sheet = null) {
        const c = counts(d), s = sum(d), up = UPPER.indexOf(box);
        if (up >= 0) return c[up + 1] * (up + 1);
        const joker = variant === 'us' && isYams(d) && sheet && sheet.yams != null && sheet[UPPER[d[0] - 1]] != null;
        const top = k => { for (let v = 6; v >= 1; v--) if (c[v] >= k) return v; return 0; };
        switch (box) {
            case 'brelan': { const v = top(3); return !v ? 0 : variant === 'us' ? s : 3 * v; }
            case 'carre': { const v = top(4); return !v ? 0 : variant === 'us' ? s : 4 * v; }
            case 'full': return joker || (c.includes(3) && c.includes(2)) ? 25 : 0;
            case 'psuite': return joker || run(d) >= 4 ? 30 : 0;
            case 'gsuite': return joker || run(d) >= 5 ? 40 : 0;
            case 'yams': return isYams(d) ? 50 : 0;
            case 'chance': return s;
            default: return 0;
        }
    }
    /** en variante américaine, un Yahtzee doit d'abord aller dans la case du haut de son chiffre si elle est libre (règle du joker) */
    function allowed(d, box, variant, sheet) {
        if (sheet[box] != null) return false;
        if (variant === 'us' && isYams(d) && sheet.yams != null && box !== UPPER[d[0] - 1] && sheet[UPPER[d[0] - 1]] == null) return false;
        return true;
    }
    /** inscrire : rend les points mis (et la prime de Yahtzee éventuelle) */
    function write(sheet, d, box, variant = 'fr') {
        if (!allowed(d, box, variant, sheet)) return null;
        let bonus = 0;
        if (variant === 'us' && isYams(d) && sheet.yams === 50) { bonus = BONUS_YAMS; sheet.bonusYams = (sheet.bonusYams || 0) + BONUS_YAMS; }
        sheet[box] = score(d, box, variant, sheet);
        return {pts: sheet[box], bonus};
    }
    /** les totaux : {upper, prime, lower, bonus, total, need} (need : ce qui manque encore pour la prime) */
    function totals(sheet) {
        const upper = UPPER.reduce((a, b) => a + (sheet[b] || 0), 0), lower = LOWER.reduce((a, b) => a + (sheet[b] || 0), 0), prime = upper >= PRIME_AT ? PRIME : 0, bonus = sheet.bonusYams || 0;
        return {upper, prime, lower, bonus, total: upper + prime + lower + bonus, need: Math.max(0, PRIME_AT - upper)};
    }
    const full = sheet => BOXES.every(b => sheet[b] != null);
    const emptySheet = () => Object.fromEntries(BOXES.map(b => [b, null]));
    const roll = (n, rand = Math.random) => Array.from({length: n}, () => 1 + Math.floor(rand() * 6));

    /* ═════ L'ordinateur ═════ */
    /** ce que vaut « mettre ces points dans cette case », en pensant à la suite de la partie */
    function utility(sheet, box, pts, variant) {
        const up = UPPER.indexOf(box);
        if (up >= 0) {
            const v = up + 1, par = 3 * v, t = totals(sheet), stillPossible = t.prime === 0 && t.upper + UPPER.filter(b => sheet[b] == null && b !== box).reduce((a, b) => a + 5 * (UPPER.indexOf(b) + 1), 0) + pts >= PRIME_AT;
            return pts + (stillPossible ? (pts - par) * 1.2 + (t.upper + pts >= PRIME_AT && t.upper < PRIME_AT ? PRIME : 0) : 0) - (pts === 0 ? v * 0.8 : 0);
        }
        const cost = {brelan: 4, carre: 6, full: 9, psuite: 10, gsuite: 14, yams: 22, chance: 0}[box] || 0;
        if (box === 'chance') return pts - 21;
        if (box === 'brelan' || box === 'carre') return pts - (variant === 'us' ? 14 : 9) - (pts === 0 ? cost : 0);
        return pts === 0 ? -cost : pts - cost * 0.5;
    }
    /** la meilleure case pour ces dés : {box, pts, value} */
    function bestBox(sheet, d, variant = 'fr') {
        let best = null;
        for (const b of BOXES) { if (!allowed(d, b, variant, sheet)) continue; const pts = score(d, b, variant, sheet), v = utility(sheet, b, pts, variant); if (!best || v > best.value) best = {box: b, pts, value: v}; }
        return best;
    }
    // toutes les relances de k dés, comptées une fois chacune (avec leur nombre de façons)
    const OUTCOMES = [0, 1, 2, 3, 4, 5].map(k => { const m = new Map(); const rec = (left, arr) => { if (!left) { const key = arr.slice().sort().join(''); m.set(key, (m.get(key) || 0) + 1); return; } for (let v = 1; v <= 6; v++) rec(left - 1, [...arr, v]); }; rec(k, []); return [...m].map(([key, w]) => [key ? key.split('').map(Number) : [], w / 6 ** k]); });
    /** les dés à garder : un tableau de 5 booléens. rollsLeft : lancers qui restent (1 ou 2). */
    function aiKeep(sheet, d, rollsLeft, level = 'moyen', variant = 'fr', rand = Math.random) {
        const c = counts(d), open = b => sheet[b] == null;
        if (level === 'facile') {
            let v = 0, n = 0; for (let k = 6; k >= 1; k--) if (c[k] > n) { n = c[k]; v = k; }
            return n >= 2 || rand() < 0.5 ? d.map(x => x === v) : d.map(() => rand() < 0.3);
        }
        if (level === 'moyen') {
            if (isYams(d) && open('yams')) return d.map(() => true);
            const r = run(d);
            if (r >= 3 && (open('gsuite') || (open('psuite') && r < 4))) { const has = [...new Set(d)].sort(); let bestSeq = []; let cur = []; for (const v of has) { cur = cur.length && v === cur[cur.length - 1] + 1 ? [...cur, v] : [v]; if (cur.length > bestSeq.length) bestSeq = cur; } const used = new Set(); return d.map(x => { if (bestSeq.includes(x) && !used.has(x)) { used.add(x); return true; } return false; }); }
            if (c.includes(3) && c.includes(2) && open('full')) return d.map(() => true);
            let v = 0, n = 0; for (let k = 6; k >= 1; k--) if (c[k] > n || (c[k] === n && open(UPPER[k - 1]) && !open(UPPER[v - 1]))) { n = c[k]; v = k; }
            return d.map(x => x === v && n >= 2);
        }
        // difficile : l'espérance de chaque choix (une relance exacte, la suivante estimée par la meilleure case)
        const masks = new Map();
        for (let m = 0; m < 32; m++) { const kept = d.filter((_, i) => m & (1 << i)).sort(); const key = kept.join(''); if (!masks.has(key)) masks.set(key, m); }
        // avec encore une relance après celle-ci : la meilleure case tout de suite, un peu plus si les dés promettent (3 pareils, 4 à la suite)
        const later = dd => { const cc = counts(dd), most = Math.max(...cc), now = bestBox(sheet, dd, variant).value; return Math.max(now, now + (most >= 3 && open('yams') ? 4 : 0) + (most >= 3 && open('carre') ? 2 : 0) + (run(dd) >= 4 && open('gsuite') ? 5 : 0)); };
        const evalKeep = (kept, left) => { let e = 0; for (const [add, w] of OUTCOMES[5 - kept.length]) { const dd = [...kept, ...add]; e += w * (left > 1 ? later(dd) : bestBox(sheet, dd, variant).value); } return e; };
        let best = null;
        for (const [key, m] of masks) { const kept = key ? key.split('').map(Number) : []; const v = evalKeep(kept, rollsLeft); if (!best || v > best.v) best = {v, m}; }
        // ne rien relancer si garder tout vaut autant
        const all = bestBox(sheet, d, variant).value; if (all >= best.v - 0.01) return d.map(() => true);
        return d.map((_, i) => !!(best.m & (1 << i)));
    }

    const API = {UPPER, LOWER, BOXES, LABELS, HELP, PRIME_AT, PRIME, BONUS_YAMS, counts, run, isYams, score, allowed, write, totals, full, emptySheet, roll, utility, bestBox, aiKeep};
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.LCNDA_YAMS = API;
})(typeof window !== 'undefined' ? window : globalThis);
