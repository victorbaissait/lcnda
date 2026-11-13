/* LCNDA — 🪙 Convertisseur d'autrefois : les calculs (sans page ni réseau).
 * window.LCNDA_AUTREFOIS (aussi require() dans Node pour les essais : tests/test-lecture-convertisseur.js).
 *  - Argent : livres tournois / sous / deniers, franc germinal, anciens francs, nouveaux francs, euros → euros d'aujourd'hui.
 *      readSum(texte)            « 12 livres 10 sous 6 deniers », « 300 F », « 45 NF », « 5 000 anciens francs », « 3 écus »
 *      worth(somme, année)       {euros, era, native, steps, source, approx, warn}
 *      Parités exactes : 1 livre = 20 sous = 240 deniers ; franc germinal (loi du 28 thermidor an III, 15 août 1795) = 1 livre 3 deniers,
 *      donc 81 livres = 80 francs ; 1 nouveau franc (1er janvier 1960) = 100 anciens francs ; 1 euro = 6,55957 francs (1er janvier 1999).
 *      Pouvoir d'achat : à partir de 1901, l'indice de l'INSEE (convertisseur franc-euro « Pouvoir d'achat de l'euro et du franc »,
 *      insee.fr/fr/information/2417794, indice base 2025 = 100, arrondi à 2 décimales : avant 1920, l'arrondi donne ± 15 %) — le même
 *      calcul que le convertisseur de l'INSEE ; avant 1901, un ordre de grandeur (prix des denrées), raccordé à l'INSEE en 1901.
 *  - Mesures anciennes : readMeasure(texte, région) avec les régions de LCNDA_EXT.calendarMore (heritage-calendar-more.js).
 *  - Calendrier républicain dans les deux sens : republican(texte) avec LCNDA_SHEET (app-tableur-engine.js), le même calcul que
 *      les champs de date (C4), le Tableur et la Calculette.
 * L'écran est dans heritage-lecture-autrefois.js (LCNDA_EXT.autrefois).
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_AUTREFOIS = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (root) {
    'use strict';
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    const nf = (n, d = 2) => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d, minimumFractionDigits: 0});
    const plural = (n, one, many) => `${nf(n, 2)} ${Math.abs(n) >= 2 ? (many || one + 's') : one}`;

    /* ═════════════ L'argent ═════════════ */
    const EURO_FRANC = 6.55957, NF_AF = 100, GERMINAL_LIVRES = 81 / 80; // 1 franc germinal = 1,0125 livre (1 livre 3 deniers)
    const SOURCE = 'INSEE, convertisseur franc-euro « Pouvoir d’achat de l’euro et du franc » (indice des prix, base 2025 = 100)';
    const SOURCE_URL = 'https://www.insee.fr/fr/information/2417794';
    // Indice INSEE (base 2025 = 100), tel que publié par le convertisseur de l'INSEE (relevé le 9 novembre 2026).
    const INSEE = {1901: .03, 1902: .03, 1903: .03, 1904: .03, 1905: .03, 1906: .03, 1907: .03, 1908: .03, 1909: .03, 1910: .03, 1911: .04, 1912: .04, 1913: .04, 1914: .04, 1915: .04,
        1916: .05, 1917: .06, 1918: .07, 1919: .1, 1920: .13, 1921: .12, 1922: .12, 1923: .12, 1924: .14, 1925: .15, 1926: .2, 1927: .21, 1928: .21, 1929: .21, 1930: .22, 1931: .21,
        1932: .19, 1933: .18, 1934: .18, 1935: .17, 1936: .17, 1937: .22, 1938: .25, 1939: .26, 1940: .31, 1941: .37, 1942: .45, 1943: .55, 1944: .68, 1945: 1, 1946: 1.53, 1947: 2.29,
        1948: 3.63, 1949: 4.11, 1950: 4.52, 1951: 5.25, 1952: 5.88, 1953: 5.78, 1954: 5.8, 1955: 5.86, 1956: 6.1, 1957: 6.29, 1958: 7.23, 1959: 7.68, 1960: 7.96, 1961: 8.23, 1962: 8.62,
        1963: 9.03, 1964: 9.34, 1965: 9.57, 1966: 9.83, 1967: 10.1, 1968: 10.56, 1969: 11.24, 1970: 11.82, 1971: 12.49, 1972: 13.26, 1973: 14.49, 1974: 16.48, 1975: 18.41, 1976: 20.19,
        1977: 22.08, 1978: 24.08, 1979: 26.67, 1980: 30.28, 1981: 34.34, 1982: 38.4, 1983: 42.1, 1984: 45.22, 1985: 47.85, 1986: 49.12, 1987: 50.67, 1988: 52.03, 1989: 53.91, 1990: 55.72,
        1991: 57.54, 1992: 58.87, 1993: 60.11, 1994: 61.1, 1995: 62.26, 1996: 63.46, 1997: 64.23, 1998: 64.65, 1999: 65, 2000: 66.08, 2001: 67.16, 2002: 68.46, 2003: 69.89, 2004: 71.39,
        2005: 72.64, 2006: 73.85, 2007: 74.95, 2008: 77.06, 2009: 77.13, 2010: 78.31, 2011: 79.96, 2012: 81.52, 2013: 82.23, 2014: 82.65, 2015: 82.68, 2016: 82.83, 2017: 83.68,
        2018: 85.23, 2019: 86.18, 2020: 86.59, 2021: 88.01, 2022: 92.61, 2023: 97.12, 2024: 99.07, 2025: 100};
    const INSEE_FIRST = 1901, INSEE_LAST = 2025;
    // Avant 1901 : euros d'aujourd'hui pour 1 livre (avant 1795) ou 1 franc (ensuite) — ordre de grandeur d'après le prix des denrées,
    // raccordé à l'INSEE en 1901 (1 franc de 1901 ≈ 5,08 €). Les années 1790-1797 (assignats) sont à part : voir warn.
    const BEFORE = [[1500, 30], [1600, 17], [1650, 15.5], [1700, 14.6], [1750, 12.2], [1789, 8.5], [1795, 7.2], [1800, 6.7], [1820, 5.9], [1850, 5.5], [1870, 5.1], [1890, 5.2], [1900, 5.08]];
    // Le prix d'un kilo de pain ordinaire, dans la monnaie de l'année (pour « en pain »)
    const BREAD = [[1600, 0.12], [1700, 0.18], [1750, 0.2], [1789, 0.35], [1800, 0.3], [1820, 0.3], [1850, 0.32], [1870, 0.4], [1890, 0.36], [1900, 0.34], [1913, 0.42], [1918, 0.6], [1920, 1.2], [1925, 1.6], [1930, 2.2], [1935, 1.9], [1938, 2.6], [1945, 7], [1948, 30], [1950, 40], [1955, 55], [1959, 75],
        [1960, 0.8], [1970, 1.6], [1975, 2.9], [1980, 5], [1985, 8], [1990, 10], [1995, 11.5], [2001, 13], [2002, 2.1], [2010, 3], [2015, 3.3], [2020, 3.6], [2025, 4.2]];
    /** la monnaie en usage une année : livre (avant 1795), franc (franc germinal puis « ancien » franc, 1795-1959), nf (1960-2001), euro */
    const era = y => (y < 1795 ? 'livre' : y < 1960 ? 'franc' : y < 2002 ? 'nf' : 'euro');
    const ERA_NAME = {livre: ['livre tournois', 'livres tournois'], franc: ['franc', 'francs'], nf: ['nouveau franc', 'nouveaux francs'], euro: ['euro', 'euros']};
    const eraName = (e, n = 2) => ERA_NAME[e][Math.abs(n) >= 2 ? 1 : 0];
    /** interpolation (géométrique) dans une table [année, valeur], sans franchir un changement de monnaie */
    function interp(rows, y) {
        const same = rows.filter(r => era(r[0]) === era(y)), R = same.length ? same : rows;
        if (y <= R[0][0]) return R[0][1]; if (y >= R.at(-1)[0]) return R.at(-1)[1];
        for (let i = 1; i < R.length; i++) { const [y1, v1] = R[i - 1], [y2, v2] = R[i]; if (y <= y2) return v1 * Math.pow(v2 / v1, (y - y1) / (y2 - y1)); }
        return R.at(-1)[1];
    }
    /** euros d'aujourd'hui (2025) pour 1 unité de la monnaie de l'année → {k, source: 'insee' | 'estimate'} */
    function euroPerUnit(year) {
        const y = Math.round(Number(year));
        if (y >= INSEE_FIRST) {
            const yy = Math.min(y, INSEE_LAST), e = era(yy);
            const inEuros = e === 'franc' ? 1 / (NF_AF * EURO_FRANC) : e === 'nf' ? 1 / EURO_FRANC : 1;
            return {k: inEuros * 100 / INSEE[yy], source: y > INSEE_LAST ? 'today' : 'insee'};
        }
        return {k: interp(BEFORE, y), source: 'estimate'};
    }
    const UNIT_WORDS = [ // [expression régulière, sorte, valeur dans cette sorte]
        [/^(?:livres?(?:\s+tournois)?|lt|lts|l|#|£)$/, 'deniers', 240], [/^(?:sous|sou|sols?|s)$/, 'deniers', 12], [/^(?:deniers?|d)$/, 'deniers', 1],
        [/^(?:ecus?(?:\s+de\s+3\s+livres)?|ecu\s+blanc)$/, 'deniers', 720], [/^ecus?\s+de\s+6\s+livres$/, 'deniers', 1440], [/^(?:louis(?:\s+d'or)?)$/, 'deniers', 5760], [/^(?:pistoles?)$/, 'deniers', 2400],
        [/^(?:francs?\s+germinal|francs?\s+or)$/, 'germinal', 1], [/^(?:francs?|fr|frs|f)$/, 'franc', 1], [/^(?:centimes?|cts?|c)$/, 'franc', .01],
        [/^(?:anciens?\s+francs?|af|a\.?\s?f\.?)$/, 'af', 1], [/^(?:nouveaux?\s+francs?|nf|n\.?\s?f\.?)$/, 'nf', 1], [/^(?:euros?|eur|€)$/, 'euro', 1],
    ];
    const num = s => Number(String(s).replace(/[\s  ]/g, '').replace(',', '.'));
    /**
     * Lit une somme écrite librement → {ok, kind: deniers|germinal|franc|af|nf|euro|plain, value, label} ou {ok: false, text}
     * « 12 livres 10 sous 6 deniers », « 12 l 10 s 6 d », « 300 F », « 1 200 francs », « 45 NF », « 5 000 anciens francs », « 3 écus », « 10 € », « 300 »
     */
    function readSum(raw) {
        const s = fold(raw).replace(/(\d)\s+(?=\d{3}\b)/g, '$1').replace(/(\d)([a-z€#£])/g, '$1 $2').replace(/,(?!\d)/g, ' ').replace(/\bet\b/g, ' ').trim();
        if (!s) return null;
        const re = /(\d+(?:[.,]\d+)?)\s*((?:[a-z€#£'.]+(?:\s+(?:tournois|germinal|or|d'or|de\s+[36]\s+livres|blanc|francs?))?)?)/g;
        let m, kind = '', value = 0, any = false, parts = [], coins = false;
        while ((m = re.exec(s))) {
            const n = num(m[1]), unit = m[2].replace(/\.$/, '').trim(); any = true;
            if (!unit) { if (kind && kind !== 'plain') return {ok: false, text: `il manque l’unité après « ${m[1]} »`}; kind = 'plain'; value += n; parts.push(nf(n)); continue; }
            const hit = UNIT_WORDS.find(([r]) => r.test(unit.replace(/\./g, '')));
            if (!hit) return {ok: false, text: `je ne connais pas « ${unit} » (exemples : 12 livres 10 sous, 300 francs, 45 NF, 3 écus, 10 €)`};
            if (kind && kind !== hit[1]) return {ok: false, text: 'une seule monnaie à la fois (livres, sous et deniers vont ensemble)'};
            kind = hit[1]; value += n * hit[2]; parts.push(`${nf(n)} ${unit.replace(/^ecu/, 'écu')}`); if (hit[2] > 240) coins = true;
        }
        if (!any) return {ok: false, text: 'écris un nombre (exemples : 12 livres 10 sous, 300 francs, 45 NF, 3 écus, 10 €)'};
        if (/[a-z]/.test(s.replace(re, '').replace(/\s+/g, ''))) return {ok: false, text: 'je ne comprends pas toute la somme (exemples : 12 livres 10 sous 6 deniers, 300 francs, 45 NF)'};
        const label = kind === 'deniers' ? (coins ? `${parts.join(' ')} (= ${lsdText(value)})` : lsdText(value)) : kind === 'germinal' ? plural(value, 'franc germinal', 'francs germinal') : kind === 'franc' ? plural(value, 'franc') : kind === 'af' ? plural(value, 'ancien franc', 'anciens francs')
            : kind === 'nf' ? plural(value, 'nouveau franc', 'nouveaux francs') : kind === 'euro' ? `${nf(value)} €` : nf(value);
        return {ok: true, kind, value, label};
    }
    /** deniers → « 12 livres 10 sous 6 deniers » */
    function lsdText(den) {
        den = Math.round(Number(den) || 0); const neg = den < 0; den = Math.abs(den);
        const l = Math.floor(den / 240), so = Math.floor((den % 240) / 12), d = den % 12;
        return (neg ? '− ' : '') + ([l ? `${nf(l, 0)} livre${l > 1 ? 's' : ''}` : '', so ? `${so} sou${so > 1 ? 's' : ''}` : '', d ? `${d} denier${d > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ') || '0 livre');
    }
    /**
     * La valeur d'une somme d'une année en euros d'aujourd'hui.
     * sum : le résultat de readSum (ou {kind, value}) ; opts.wageSols(year) : salaire d'un journalier en sols (pour les journées de travail)
     * → {euros, era, native (dans la monnaie de l'année), nativeText, steps: [phrases], source: insee|estimate, approx: true, warn: [phrases], bread (kg), days}
     */
    function worth(sum, year, opts = {}) {
        const y = Math.round(Number(year)); if (!sum || !sum.ok && sum.ok !== undefined || !y) return null;
        const e = era(y), steps = [], warn = [];
        let v = Number(sum.value) || 0, kind = sum.kind;
        if (kind === 'plain') kind = {livre: 'deniers', franc: 'franc', nf: 'nf', euro: 'euro'}[e], v = kind === 'deniers' ? v * 240 : v;
        // 1. la somme dans la monnaie de l'année
        let native;
        if (kind === 'deniers') {
            const livres = v / 240; if (v % 240) steps.push(`${lsdText(v)} = ${nf(livres, 4)} livres (1 livre = 20 sous = 240 deniers)`);
            if (e === 'livre') native = livres;
            else { native = livres / GERMINAL_LIVRES; steps.push(`${nf(livres, 4)} livres = ${nf(native, 4)} francs (81 livres = 80 francs germinal, loi de l’an III)`);
                if (e !== 'franc') { warn.push(`des livres en ${y} : la livre a disparu en 1795`); native = e === 'nf' ? native / NF_AF : native / NF_AF / EURO_FRANC; } }
        } else if (kind === 'germinal' || kind === 'franc') {
            if (e === 'livre') { native = v * GERMINAL_LIVRES; warn.push(`des francs en ${y} : avant 1795 on comptait en livres (le franc d’avant 1795 = 1 livre)`); steps.push(`${plural(v, 'franc')} = ${nf(native, 4)} livres`); }
            else if (e === 'franc') native = v;
            else if (e === 'nf') { native = v; if (kind === 'franc') steps.push('après 1960, « francs » veut dire nouveaux francs'); else { native = v / NF_AF; steps.push(`${plural(v, 'franc germinal', 'francs germinal')} = ${nf(native, 4)} nouveaux francs`); } }
            else { native = v / EURO_FRANC; steps.push(`${plural(v, 'franc')} = ${nf(native, 4)} € (1 € = 6,55957 F)`); }
        } else if (kind === 'af') {
            if (e === 'nf' || e === 'euro') { native = v / NF_AF; steps.push(`${plural(v, 'ancien franc', 'anciens francs')} = ${nf(native, 4)} nouveaux francs (1 NF = 100 AF)`); if (e === 'euro') { native /= EURO_FRANC; steps.push(`= ${nf(native, 4)} € (1 € = 6,55957 F)`); } }
            else native = e === 'livre' ? v * GERMINAL_LIVRES : v;
        } else if (kind === 'nf') {
            if (e === 'euro') { native = v / EURO_FRANC; steps.push(`${plural(v, 'franc')} = ${nf(native, 4)} € (1 € = 6,55957 F)`); }
            else if (e === 'nf') native = v;
            else { native = v * NF_AF; warn.push(`des nouveaux francs en ${y} : ils n’existent qu’à partir de 1960`); steps.push(`${plural(v, 'nouveau franc', 'nouveaux francs')} = ${nf(native, 2)} anciens francs`); }
        } else if (kind === 'euro') {
            if (e === 'euro') native = v;
            else { native = v * EURO_FRANC; steps.push(`${nf(v)} € = ${nf(native, 4)} francs (1 € = 6,55957 F)`); if (e !== 'nf') { native *= NF_AF; steps.push(`= ${nf(native, 2)} anciens francs`); } warn.push(`des euros en ${y} : l’euro n’existe qu’à partir de 2002 (1999 pour les banques)`); }
        } else return null;
        // 2. en euros d'aujourd'hui
        const per = euroPerUnit(y), euros = native * per.k;
        if (per.source === 'insee') steps.push(`1 ${eraName(e, 1)} de ${y} ≈ ${nf(per.k, per.k < 1 ? 4 : 2)} € d’aujourd’hui (indice INSEE ${nf(INSEE[Math.min(y, INSEE_LAST)])} en ${Math.min(y, INSEE_LAST)}, 100 en ${INSEE_LAST})`);
        else steps.push(`1 ${eraName(e, 1)} de ${y} ≈ ${nf(per.k, 2)} € d’aujourd’hui (ordre de grandeur : pas d’indice de l’INSEE avant 1901)`);
        if (y >= 1790 && y <= 1797) warn.push('entre 1790 et 1797, les assignats (billets) perdent presque toute leur valeur : une somme en assignats valait bien moins qu’en pièces');
        if (y >= 1901 && y < 1920) warn.push('avant 1920, l’indice de l’INSEE est arrondi (0,03, 0,04…) : le résultat peut varier de ± 15 %');
        if (y < 1901) warn.push('avant 1901, il n’y a pas d’indice des prix officiel : c’est un ordre de grandeur, à ± 50 % près');
        const breadK = interp(BREAD, Math.min(y, 2025)), wage = opts.wageSols?.(Math.min(y, 2001));
        const sols = e === 'euro' ? native * EURO_FRANC * NF_AF * 20 : e === 'nf' ? native * NF_AF * 20 : native * 20;
        return {euros, era: e, native, nativeText: e === 'livre' ? lsdText(native * 240) : e === 'euro' ? `${nf(native)} €` : plural(native, ERA_NAME[e][0], ERA_NAME[e][1]),
            steps, source: per.source, approx: true, warn, bread: native / breadK, days: wage ? sols / wage : null, year: y};
    }
    /** « ≈ 1 234 € » (arrondi raisonnable) */
    function euroText(n) {
        const a = Math.abs(n); if (!Number.isFinite(n)) return '—';
        const r = a >= 10000 ? Math.round(n / 100) * 100 : a >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
        return `≈ ${nf(r, a >= 100 ? 0 : 2)} €`;
    }

    /* ═════════════ Les mesures anciennes (régions de heritage-calendar-more.js) ═════════════ */
    const KIND_NAMES = {long: 'Longueur', surf: 'Surface', grain: 'Grains', liq: 'Liquides'};
    const METRIC_WORDS = [[/^(?:m|metres?|mètres?)$/, 'long', 1, 'm'], [/^(?:cm|centimetres?)$/, 'long', .01, 'cm'], [/^(?:mm|millimetres?)$/, 'long', .001, 'mm'], [/^(?:km|kilometres?)$/, 'long', 1000, 'km'],
        [/^(?:m2|m²|metres?\s+carres?)$/, 'surf', 1, 'm²'], [/^(?:a|ares?)$/, 'surf', 100, 'a'], [/^(?:ha|hectares?)$/, 'surf', 10000, 'ha'],
        [/^(?:l|litres?)$/, 'grain', 1, 'l'], [/^(?:hl|hectolitres?)$/, 'grain', 100, 'hl']];
    const calMore = opts => opts?.calendarMore || root?.LCNDA_EXT?.calendarMore || null;
    /** les régions et leurs unités : [{id, label, units: [{id, label, kind, value, approx, note}]}] */
    function regions(opts) {
        const cm = calMore(opts); if (!cm?.REGIONS) return [];
        return cm.REGIONS.map(r => ({id: r.id, label: r.label, units: r.units.map(u => ({id: u[0], label: u[1], kind: u[2], value: u[3], approx: !!u[4], note: u[5] || ''}))}));
    }
    /** les noms qu'on peut taper pour une unité : son id, son nom, le premier mot du nom, au pluriel */
    const plurals = w => [w, w + 's', w + 'x', w.replace(/al$/, 'aux'), w.replace(/eau$/, 'eaux')];
    function namesOf(u) {
        const label = fold(u.label).replace(/\s*\(.*$/, ''), first = label.split(' ')[0], out = new Set();
        [fold(u.id).replace(/_/g, ' '), label, first].forEach(w => plurals(w).forEach(x => out.add(x)));
        if (u.kind === 'surf' && /2$/.test(u.id)) { out.delete(first); plurals(first).forEach(x => out.delete(x)); } // « toise carrée » : seulement avec « carrée »
        return out;
    }
    function findUnit(word, region, regs) {
        const w = fold(word).replace(/\.$/, '');
        const R = regs.find(r => r.id === region) || regs[0], P = regs.find(r => r.id === 'paris');
        for (const r of [R, P, ...regs].filter(Boolean)) { const u = r.units.find(x => namesOf(x).has(w)); if (u) return {...u, region: r.id, regionLabel: r.label}; }
        const m = METRIC_WORDS.find(([re]) => re.test(w)); if (m) return {id: `metric_${m[1]}_${m[3]}`, label: m[3], kind: m[1], value: m[2], metric: true};
        return null;
    }
    /** « 3 arpents de Paris », « 1 toise », « 2 boisseaux » */
    function unitPlural(label, n) {
        const nm = String(label).replace(/\s*\(.*$/, ''); if (Math.abs(n) < 2) return nm;
        const [w, ...rest] = nm.split(' '), p = /[sxz]$/.test(w) ? w : /eau$/.test(w) ? w + 'x' : /al$/.test(w) ? w.replace(/al$/, 'aux') : w + 's';
        return [p, ...rest].join(' ');
    }
    const sameKind = (a, b) => a === b || (/(grain|liq)/.test(a) && /(grain|liq)/.test(b));
    /** une quantité de base (m, m² ou litres) → « 1,95 m », « 34,19 a », « 1,56 hl » */
    function metricText(base, kind) {
        if (kind === 'long') return base >= 1000 ? `${nf(base / 1000, 3)} km` : base < 1 ? `${nf(base * 100, 2)} cm` : `${nf(base, 3)} m`;
        if (kind === 'surf') return base >= 10000 ? `${nf(base / 10000, 4)} ha` : base >= 100 ? `${nf(base / 100, 2)} a (${nf(base, 0)} m²)` : `${nf(base, 2)} m²`;
        return base >= 100 ? `${nf(base / 100, 3)} hl` : `${nf(base, 3)} l`;
    }
    /**
     * readMeasure('3 arpents', 'paris') ou ('12 toises 3 pieds') ou ('2 ha') → {ok, kind, base, label, metric, approx, units: [{label, value, approx}], elsewhere: [{region, label, metric}]}
     * Les unités cherchées d'abord dans la région choisie, puis dans les mesures de Paris (du roi), puis en mètres, ares, litres.
     */
    function readMeasure(raw, region = 'paris', opts = {}) {
        const regs = regions(opts); if (!regs.length) return {ok: false, text: 'les mesures anciennes ne sont pas chargées'};
        const s = fold(raw).replace(/(\d)\s+(?=\d{3}\b)/g, '$1').replace(/(\d)([a-z²])/g, '$1 $2').trim(); if (!s) return null;
        const re = /(\d+(?:[.,]\d+)?)\s*([a-z²'][a-z²'.-]*(?:\s+(?:carres?|carrees?|du\s+roi|de\s+[a-z]+|des\s+eaux\s+et\s+forets|commun|de\s+vin|de\s+grains))?)/g;
        let m, kind = '', base = 0, approx = false, parts = [], any = false, first = null;
        while ((m = re.exec(s))) {
            any = true; let u = findUnit(m[2], region, regs);
            if (!u) { const w = m[2].split(' ')[0]; u = findUnit(w, region, regs); if (u) re.lastIndex = m.index + m[1].length + m[0].slice(m[1].length).indexOf(w) + w.length; }
            if (!u) return {ok: false, text: `je ne connais pas « ${m[2]} » ici (exemples : 3 arpents, 12 toises 3 pieds, 2 boisseaux, 1,5 ha)`};
            if (kind && !sameKind(kind, u.kind)) return {ok: false, text: 'une seule sorte de mesure à la fois (longueur, surface ou contenance)'};
            kind = kind || u.kind; const n = num(m[1]); base += n * u.value; approx = approx || u.approx; parts.push(`${nf(n, 3)} ${u.metric ? u.label : unitPlural(u.label, n)}`); first = first || u;
        }
        if (!any) return {ok: false, text: 'écris un nombre et une mesure (exemples : 3 arpents, 12 toises 3 pieds, 2 boisseaux, 1,5 ha)'};
        const R = regs.find(r => r.id === region) || regs[0];
        const units = R.units.filter(u => sameKind(u.kind, kind) && !(first && !first.metric && u.id === first.id && parts.length === 1)).map(u => ({label: u.label, value: base / u.value, approx: u.approx || approx, note: u.note}));
        // la même unité dans les autres régions (« l'arpent selon les lieux »)
        const elsewhere = first && !first.metric ? regs.filter(r => r.id !== (first.region || region)).map(r => { const u = r.units.find(x => namesOf(x).has(fold(first.label).replace(/\s*\(.*$/, '').split(' ')[0]) && sameKind(x.kind, kind)); return u ? {region: r.label, label: u.label, metric: metricText(u.value, u.kind), approx: u.approx} : null; }).filter(Boolean) : [];
        return {ok: true, kind, kindName: KIND_NAMES[kind] || '', base, label: parts.join(' '), metric: metricText(base, kind), approx, units, elsewhere,
            region: R.label, fromRegion: first?.regionLabel && first.region !== R.id ? first.regionLabel : ''};
    }

    /* ═════════════ Le calendrier républicain (dans les deux sens) ═════════════ */
    const REP = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jour complémentaire'];
    const DECADE = ['primidi', 'duodi', 'tridi', 'quartidi', 'quintidi', 'sextidi', 'septidi', 'octidi', 'nonidi', 'décadi'];
    const SANSCULOTTIDES = ['jour de la Vertu', 'jour du Génie', 'jour du Travail', 'jour de l’Opinion', 'jour des Récompenses', 'jour de la Révolution'];
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const WEEK = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const toRoman = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'][n] || String(n);
    const fromRoman = s => { const m = String(s).toUpperCase(); if (/^\d+$/.test(m)) return Number(m); if (!/^[IVX]+$/.test(m)) return 0; const v = {I: 1, V: 5, X: 10}; let t = 0; for (let i = 0; i < m.length; i++) t += v[m[i]] < (v[m[i + 1]] || 0) ? -v[m[i]] : v[m[i]]; return t; };
    const sheet = opts => opts?.sheet || root?.LCNDA_SHEET || (typeof require === 'function' ? (() => { try { return require('./app-tableur-engine.js'); } catch (_) { return null; } })() : null);
    const sextile = an => [3, 7, 11].includes(an);
    const gText = g => `${g.d === 1 ? '1er' : g.d} ${MONTHS[g.m - 1]} ${g.y}`;
    const rText = r => r.mo === 13 ? `${r.d === 1 ? '1er' : r.d + 'e'} jour complémentaire an ${toRoman(r.an)} (${SANSCULOTTIDES[r.d - 1]})` : `${r.d === 1 ? '1er' : r.d} ${REP[r.mo - 1]} an ${toRoman(r.an)}`;
    const weekday = g => WEEK[new Date(Date.UTC(g.y, g.m - 1, g.d)).getUTCDay()];
    const NUMWORDS = {un: 1, premier: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30};
    /** « quinze », « dix-sept », « vingt-et-un », « vingt et un » → 15, 17, 21 */
    const wordsNum = w => { const p = String(w).replace(/-et-|\s+et\s+/g, '-').split('-').filter(Boolean); let t = 0; for (const x of p) { const v = NUMWORDS[x]; if (!v) return 0; t += v; } return t; };
    /**
     * republican('12 thermidor an II') → {ok, dir: 'rep2greg', rep, greg, from, to, weekday, decade, text}
     * republican('14 juillet 1794') ou ('14/07/1794') → {ok, dir: 'greg2rep', …} ; hors du 22/09/1792–31/12/1805 : {ok: false, text}
     */
    function republican(raw, opts = {}) {
        const S = sheet(opts); if (!S?.republicanToGregorian) return {ok: false, text: 'le calendrier républicain n’est pas chargé'};
        const s = fold(raw).replace(/\([^)]*\)/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/^(le|du|au)\s+/, '').trim(); if (!s) return null;
        let m;
        // républicain → grégorien : « 12 thermidor an II », « 1er vendémiaire an 3 », « 3e jour complémentaire an VII », « quinze brumaire an dix »
        if ((m = s.replace(/\b(vingt|trente)\s+et\s+un\b/g, '$1-et-un').match(/^(1er|\d{1,2}|[a-z-]+)\s*(?:e|eme)?\s+(?:jour\s+)?([a-z]+(?:\s+complementaires?)?|sans-culottides?|complementaires?)\s+(?:de\s+l'|l')?an\s+([ivx]+|\d{1,2}|[a-z]+)(?:\s+de\s+la\s+republique.*)?$/))) {
            const d = m[1] === '1er' ? 1 : /^\d+$/.test(m[1]) ? Number(m[1]) : wordsNum(m[1]);
            const an = /^[ivx]+$|^\d+$/.test(m[3]) ? fromRoman(m[3]) : wordsNum(m[3]);
            const mk = m[2];
            const mi = /compl|culott/.test(mk) ? 12 : REP.findIndex(x => fold(x).startsWith(mk.slice(0, 4)));
            if (mi < 0) return {ok: false, text: `je ne connais pas le mois « ${m[2]} » (vendémiaire, brumaire… fructidor, jour complémentaire)`};
            if (!an || an > 14) return {ok: false, text: `an ${m[3].toUpperCase()} : le calendrier républicain va de l’an I à l’an XIV`};
            if (!d || d > (mi === 12 ? (sextile(an) ? 6 : 5) : 30)) return {ok: false, text: mi === 12 ? `date impossible : l’an ${toRoman(an)} a ${sextile(an) ? 6 : 5} jours complémentaires` : `date impossible : ${d} ${REP[mi]} (un mois républicain a 30 jours)`};
            if (an === 14 && (mi > 3 || mi === 3 && d > 10)) return {ok: false, text: 'le calendrier républicain s’arrête le 10 nivôse an XIV (31 décembre 1805)'};
            const g = S.republicanToGregorian(an, mi + 1, d), rep = {an, mo: mi + 1, d};
            return {ok: true, dir: 'rep2greg', rep, greg: g, from: rText(rep), to: gText(g), weekday: weekday(g), decade: mi === 12 ? '' : DECADE[(d - 1) % 10], text: `${rText(rep)} = ${weekday(g)} ${gText(g)}`};
        }
        // grégorien → républicain : « 14 juillet 1794 », « 14/07/1794 », « 1794-07-14 »
        let g = null;
        if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) g = {d: +m[1], m: +m[2], y: +m[3]};
        else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) g = {d: +m[3], m: +m[2], y: +m[1]};
        else if ((m = s.match(/^(1er|\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/))) { const mo = MONTHS.findIndex(x => fold(x).startsWith(m[2].slice(0, 3)) && (m[2].slice(0, 3) !== 'jui' || fold(x).startsWith(m[2].slice(0, 4)))); if (mo >= 0) g = {d: m[1] === '1er' ? 1 : +m[1], m: mo + 1, y: +m[3]}; }
        if (!g) return {ok: false, text: 'je ne comprends pas cette date (exemples : 12 thermidor an II, 14 juillet 1794, 14/07/1794)'};
        const dim = new Date(Date.UTC(g.y, g.m, 0)).getUTCDate();
        if (g.m < 1 || g.m > 12 || g.d < 1 || g.d > dim) return {ok: false, text: 'date impossible'};
        const t = Date.UTC(g.y, g.m - 1, g.d);
        if (t < Date.UTC(1792, 8, 22) || t > Date.UTC(1805, 11, 31)) return {ok: false, text: `le ${gText(g)} est hors du calendrier républicain (du 22 septembre 1792 au 31 décembre 1805)`};
        const r = S.gregorianToRepublican(g.y, g.m, g.d), rep = {an: r.an, mo: r.mo, d: r.d};
        return {ok: true, dir: 'greg2rep', rep, greg: g, from: gText(g), to: rText(rep), weekday: weekday(g), decade: rep.mo === 13 ? '' : DECADE[(rep.d - 1) % 10], text: `${weekday(g)} ${gText(g)} = ${rText(rep)}`};
    }
    /** les 13 mois d'une année républicaine, avec leurs dates grégoriennes */
    function republicanYear(an, opts = {}) {
        const S = sheet(opts); if (!S || an < 1 || an > 14) return [];
        return REP.map((name, i) => { const a = S.republicanToGregorian(an, i + 1, 1), last = i === 12 ? (sextile(an) ? 6 : 5) : 30, b = S.republicanToGregorian(an, i + 1, last); return {name, start: gText(a), end: gText(b), days: last}; });
    }

    return {fold, EURO_FRANC, NF_AF, GERMINAL_LIVRES, SOURCE, SOURCE_URL, INSEE, BEFORE, BREAD, era, eraName, euroPerUnit, readSum, lsdText, worth, euroText,
        KIND_NAMES, regions, readMeasure, metricText, REP, DECADE, republican, republicanYear, toRoman, fromRoman};
});
