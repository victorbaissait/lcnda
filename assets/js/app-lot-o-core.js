/* LCNDA — Lot O : les calculs purs (sans écran), testés dans Node (tests/test-lot-o-arbre.js) et utilisés par app-lot-o-arbre.js.
 *  - dispense(kind, canon, civil, year, direct) : fallait-il une dispense de l'Église ? (Latran IV 1215 : jusqu'au 4ᵉ degré ;
 *    Code de 1917, en vigueur en 1918 : 3ᵉ degré, affinité au 2ᵉ ; Code de 1983 : 4ᵉ degré civil, affinité en ligne directe) ;
 *  - kinWords(da, db) : « cousins germains », « oncle et nièce »… ;
 *  - chome(y, m, d) : ce jour-là était-il chômé ? (dimanche, fêtes d'obligation avant 1802 — selon le diocèse —, décadi du
 *    calendrier républicain, les 4 fêtes du Concordat, les jours fériés de la loi) ;
 *  - tempsClos(y, m, d) : Avent ou Carême (le même calcul que heritage-lot10-regles-actes.js, julien avant 1583), si ce fichier
 *    n'est pas chargé ;
 *  - median, share, era.
 * Rien ne sort de l'ordinateur. Pour d'autres fichiers : LCNDA_EXT.lotOCore. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) { root.LCNDA_EXT = root.LCNDA_EXT || {}; root.LCNDA_EXT.lotOCore = api; }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    /* ═════ les jours ═════ */
    /** jour julien d'une date (calendrier grégorien à partir du 15 octobre 1582, julien avant) */
    function jdn(y, m, d) {
        const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
        const greg = y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)));
        return greg ? d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
            : d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
    }
    /** Pâques : jour julien (comput grégorien à partir de 1583, julien avant) */
    function easterJdn(y) {
        if (y >= 1583) {
            const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
            const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
            const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
            return jdn(y, mo, da);
        }
        const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7, mo = Math.floor((d + e + 114) / 31), da = ((d + e + 114) % 31) + 1;
        return jdn(y, mo, da);
    }
    /** 0 = lundi … 6 = dimanche */
    const weekday = j => ((j % 7) + 7) % 7;
    const adventJdn = y => { const j = jdn(y, 11, 27); return j + ((6 - weekday(j)) + 7) % 7; };
    /** Avent (1ᵉʳ dimanche de l'Avent → Épiphanie) ou Carême (mercredi des Cendres → dimanche après Pâques) — concile de Trente */
    function tempsClos(y, m, d) {
        if (!y || !m || !d) return null;
        const j = jdn(y, m, d), e = easterJdn(y);
        if (j >= adventJdn(y - 1) && j <= jdn(y, 1, 6)) return 'avent';
        if (j >= e - 46 && j <= e + 7) return 'careme';
        if (j >= adventJdn(y) && j <= jdn(y + 1, 1, 6)) return 'avent';
        return null;
    }

    /* ═════ ⛪ jours chômés ═════ */
    // calendrier républicain : le 1ᵉʳ vendémiaire de chaque année (an I à an XIV)
    const REP_START = [[1792, 9, 22], [1793, 9, 22], [1794, 9, 22], [1795, 9, 23], [1796, 9, 22], [1797, 9, 22], [1798, 9, 22], [1799, 9, 23], [1800, 9, 23], [1801, 9, 23], [1802, 9, 23], [1803, 9, 24], [1804, 9, 23], [1805, 9, 23]];
    /** la date républicaine (an, mois 1-13, jour) d'un jour entre 1792 et 1805, sinon null */
    function republican(y, m, d) {
        const j = jdn(y, m, d);
        for (let i = REP_START.length - 1; i >= 0; i--) {
            const s = jdn(...REP_START[i]);
            if (j >= s) { const n = j - s; if (i === REP_START.length - 1 && n > 365) return null; return {an: i + 1, mois: Math.floor(n / 30) + 1, jour: (n % 30) + 1}; }
        }
        return null;
    }
    const REP_ON = jdn(1793, 11, 24), CONCORDAT = jdn(1802, 4, 18); // le calendrier républicain obligatoire ; le dimanche rendu (Concordat, Pâques 1802)
    // les fêtes d'obligation communes à la plupart des diocèses avant 1802 (la liste changeait d'un diocèse à l'autre)
    const OLD_FIXED = [[1, 1, 'la Circoncision'], [1, 6, 'l’Épiphanie'], [2, 2, 'la Purification (Chandeleur)'], [3, 25, 'l’Annonciation'], [6, 24, 'la Saint-Jean-Baptiste'], [6, 29, 'la Saint-Pierre-et-Saint-Paul'],
        [8, 15, 'l’Assomption'], [9, 8, 'la Nativité de la Vierge'], [11, 1, 'la Toussaint'], [12, 8, 'l’Immaculée Conception'], [12, 25, 'Noël'], [12, 26, 'la Saint-Étienne']];
    const OLD_MOBILE = [[1, 'le lundi de Pâques'], [39, 'l’Ascension'], [50, 'le lundi de Pentecôte'], [60, 'la Fête-Dieu']];
    /** chome(1830, 8, 15) → {off: true, kind: 'fete'|'dimanche'|'decadi'|'ferie'|'', name, rule: 'ancien'|'republicain'|'concordat'|'loi', weekday} */
    function chome(y, m, d) {
        if (!y || !m || !d) return null;
        const j = jdn(y, m, d), wd = weekday(j), e = easterJdn(y), out = {off: false, kind: '', name: '', rule: '', weekday: wd};
        const hit = (kind, name, rule) => Object.assign(out, {off: true, kind, name, rule});
        if (j >= REP_ON && j < CONCORDAT) {
            const r = republican(y, m, d);
            if (r && r.mois <= 12 && r.jour % 10 === 0) return hit('decadi', 'décadi', 'republicain');
            if (r && r.mois === 13) return hit('ferie', 'un jour sans-culottide', 'republicain');
            out.rule = 'republicain'; return out;
        }
        if (j < CONCORDAT) {
            const f = OLD_FIXED.find(x => x[0] === m && x[1] === d); if (f) return hit('fete', f[2], 'ancien');
            const mob = OLD_MOBILE.find(x => j === e + x[0]); if (mob) return hit('fete', mob[1], 'ancien');
            if (j === e) return hit('fete', 'Pâques', 'ancien');
            if (wd === 6) return hit('dimanche', 'dimanche', 'ancien');
            out.rule = 'ancien'; return out;
        }
        // depuis 1802 : les 4 fêtes gardées par l'indult du Concordat, puis les jours fériés de la loi
        const fix = [[12, 25, 'Noël', 'concordat', 0], [8, 15, 'l’Assomption', 'concordat', 0], [11, 1, 'la Toussaint', 'concordat', 0], [1, 1, 'le jour de l’An', 'loi', 1810], [7, 14, 'la fête nationale', 'loi', 1880],
            [11, 11, 'l’armistice de 1918', 'loi', 1922], [5, 1, 'la fête du Travail', 'loi', 1947]];
        for (const [mm, dd, name, rule, from] of fix) if (m === mm && d === dd && y >= from) return hit(rule === 'concordat' ? 'fete' : 'ferie', name, rule);
        if (m === 5 && d === 8 && ((y >= 1953 && y <= 1959) || y >= 1982)) return hit('ferie', 'la victoire de 1945', 'loi');
        if (j === e + 39) return hit('fete', 'l’Ascension', 'concordat');
        if (y >= 1886 && j === e + 1) return hit('ferie', 'le lundi de Pâques', 'loi');
        if (y >= 1886 && j === e + 50) return hit('ferie', 'le lundi de Pentecôte', 'loi');
        if (wd === 6) return hit('dimanche', 'dimanche', 'concordat');
        out.rule = 'concordat'; return out;
    }

    /* ═════ 🔗 la dispense ═════ */
    /** dispense('consang'|'affin', degré canonique, degré civil, année, ligne directe ?) → {needed, limit, rule} */
    function dispense(kind, canon, civil, year, direct = false) {
        const y = Number(year) || 1800;
        if (direct) return {needed: true, limit: Infinity, rule: y < 1918 ? 'latran' : y < 1983 ? 'code1917' : 'code1983', direct: true, forbidden: kind === 'consang'};
        if (y < 1215) return {needed: canon <= 7, limit: 7, rule: 'avant1215'};
        if (y < 1918) return {needed: canon <= 4, limit: 4, rule: 'latran'};
        if (y < 1983) return kind === 'affin' ? {needed: canon <= 2, limit: 2, rule: 'code1917'} : {needed: canon <= 3, limit: 3, rule: 'code1917'};
        return kind === 'affin' ? {needed: false, limit: 0, rule: 'code1983'} : {needed: civil <= 4, limit: 4, rule: 'code1983', civil: true};
    }
    /** les mots du lien (degrés : générations de chacun jusqu'à l'ancêtre commun) */
    function kinWords(da, db) {
        const [a, b] = [Math.min(da, db), Math.max(da, db)];
        if (a === 0) return b === 1 ? 'parent et enfant' : b === 2 ? 'grand-parent et petit-enfant' : 'ancêtre et descendant';
        if (a === 1 && b === 1) return 'frère et sœur';
        if (a === 1 && b === 2) return 'oncle (ou tante) et neveu (ou nièce)';
        if (a === 2 && b === 2) return 'cousins germains';
        if (a === 2 && b === 3) return 'cousins « issus de germain » (une génération d’écart)';
        if (a === 3 && b === 3) return 'cousins issus de germains';
        if (a === 4 && b === 4) return 'arrière-cousins';
        return a === b ? 'cousins éloignés' : 'parents à des générations différentes';
    }

    /* ═════ les chiffres ═════ */
    const median = v => { const a = (v || []).filter(Number.isFinite).sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
    const share = (k, n) => (n ? Math.round(100 * k / n) : 0);
    /** « 1 sur 8 » : la fraction simple la plus proche (2 à 10) */
    function oneIn(k, n) { if (!n || !k) return null; const r = n / k; if (r < 1.5) return null; return Math.round(r); }
    const century = y => Math.floor((y - 1) / 100) + 1;
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
    /** les rayons par siècle : [{c, n, median, near}] (near = part des mariages à moins de km) */
    function radiusBy(rows, km = 12) {
        const by = new Map();
        (rows || []).forEach(r => { const c = century(Number(r.year)); if (!c) return; if (!by.has(c)) by.set(c, []); by.get(c).push(Number(r.km)); });
        return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([c, v]) => ({c, label: `${ROMAN[c] || c}ᵉ`, n: v.length, median: Math.round(median(v) * 10) / 10, near: share(v.filter(x => x < km).length, v.length)}));
    }
    /** les mois des mariages (12 cases) et ceux qui tombent en temps clos */
    function monthsOf(dated, monthsOnly, tc = tempsClos) {
        const n = Array(12).fill(0), clos = Array(12).fill(0), list = [];
        (monthsOnly || []).forEach((v, i) => { n[i] += Number(v) || 0; });
        (dated || []).forEach(r => { const [y, m, d] = String(r.d).split('-').map(Number); if (!m) return; n[m - 1]++; const k = tc(y, m, d); const kind = k && (typeof k === 'string' ? k : k.kind); if (kind) { clos[m - 1]++; list.push({...r, y, m, day: d, kind}); } });
        return {n, clos, list};
    }
    /** km entre deux points */
    const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
    /** 🎯 le chemin du centre : km tout droit du plus ancien au plus jeune, et le plus grand saut */
    function gravityPath(gens) {
        const g = (gens || []).filter(x => Number.isFinite(x.lat)).sort((a, b) => b.g - a.g); if (g.length < 2) return null;
        let jump = null;
        for (let i = 1; i < g.length; i++) { const k = km(g[i - 1].lat, g[i - 1].lon, g[i].lat, g[i].lon); if (!jump || k > jump.km) jump = {km: k, g: g[i].g, year: g[i].year}; }
        return {km: Math.round(km(g[0].lat, g[0].lon, g[g.length - 1].lat, g[g.length - 1].lon)), from: g[0], to: g[g.length - 1], jump: {...jump, km: Math.round(jump.km)}, gens: g.length};
    }

    /* ═════ 🕰 l'horloge d'une vie ═════ */
    const dayNum = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y ? jdn(y, m || 7, d || (m ? 15 : 1)) : null; };
    /** clockOf('1852-02-10', '1921-04-03', [{d, …}], 24) → {years, perHour: {y, m}, marks: [{…, frac, h, min, text}]} ; null sans les deux dates */
    function clockOf(birth, death, events = [], hours = 24) {
        const a = dayNum(birth), b = dayNum(death); if (a == null || b == null || b <= a) return null;
        const span = b - a, years = span / 365.2425, perH = years / hours;
        const marks = events.map(e => { const j = dayNum(e.d); if (j == null || j < a || j > b) return null; const frac = (j - a) / span, t = frac * hours * 60, h = Math.floor(t / 60), min = Math.round(t - h * 60) % 60;
            return {...e, frac, h: min === 0 && t - h * 60 > 59.5 ? h + 1 : h, min, text: `${min === 0 && t - h * 60 > 59.5 ? h + 1 : h} h ${String(min).padStart(2, '0')}`}; }).filter(Boolean);
        return {years: Math.floor(years), perHour: {y: Math.floor(perH), m: Math.round((perH % 1) * 12) % 12}, marks};
    }
    const REP_MONTHS = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jours complémentaires'];
    /** « 30 frimaire an XI » (1792-1805), sinon '' */
    function republicanText(y, m, d) { const r = republican(y, m, d); if (!r) return ''; return r.mois === 13 ? `${REP_MONTHS[12]} ${r.jour}, an ${ROMAN[r.an]}` : `${r.jour === 1 ? '1er' : r.jour} ${REP_MONTHS[r.mois - 1]} an ${ROMAN[r.an]}`; }

    /* ═════ 🐴 la poste aux chevaux (pack lo-poste, Zenodo 11196161, ODbL) ═════ */
    /** l'année du réseau pour une date : la dernière avant (1632 → 1833) ; après 1833 jusqu'en 1850, 1833 ; sinon null */
    function posteYear(years, y) { const ys = [...years].sort((a, b) => a - b); if (!y || y < ys[0] || y > 1850) return null; return ys.filter(x => x <= y).pop(); }
    /** Dijkstra : minutes de poste depuis un relais (routes à double sens) → Map(id → minutes) */
    function posteTimes(flat, from) {
        const adj = new Map(), add = (a, b, w) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, w]); };
        for (let i = 0; i + 2 < flat.length; i += 3) { add(flat[i], flat[i + 1], flat[i + 2]); add(flat[i + 1], flat[i], flat[i + 2]); }
        const dist = new Map([[from, 0]]), done = new Set(), heap = [[0, from]];
        const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
        const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
        heap.length = 0; push([0, from]);
        while (heap.length) { const [d, u] = pop(); if (done.has(u)) continue; done.add(u); for (const [v, w] of adj.get(u) || []) { const nd = d + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); push([nd, v]); } } }
        return dist;
    }
    /** le relais le plus proche d'un point parmi ceux qui ont un temps : {id, km} */
    function nearestRelay(relays, times, lat, lon) {
        let best = null;
        for (const [id, t] of times) { const r = relays[id]; if (!r) continue; const k = km(lat, lon, r[0], r[1]); if (!best || k < best.km) best = {id, km: k, minutes: t}; }
        return best;
    }
    return {jdn, easterJdn, weekday, tempsClos, republican, republicanText, REP_MONTHS, chome, dispense, kinWords, median, share, oneIn, century, ROMAN, radiusBy, monthsOf, km, gravityPath, clockOf, posteYear, posteTimes, nearestRelay};
});
