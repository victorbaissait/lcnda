/* LCNDA — 💰📏 Les montants et les mesures, là où ils sont écrits (sans page ni réseau).
 * window.LCNDA_MONTANTS (aussi require() dans Node : tests/test-montants.js). S'appuie sur le 🪙 Convertisseur d'autrefois
 * (app-autrefois-engine.js : readSum, worth, readMeasure) et les mesures par région (heritage-calendar-more.js).
 *   numberAt(mots)            « trois cents » → 300, « dix-huit » → 18, « quatre-vingt-seize » → 96, « 1 200 » → 1200
 *   scan(texte)               [{s, e, type: 'money' | 'measure', raw, norm}] : « la somme de trois cents livres tournois »,
 *                             « douze livres dix sols », « un arpent et demi de pré », « cinq pieds deux pouces »
 *   explain(trouvé, {year, region, wageSols, calendarMore}) → {title, lines: [texte], source, url, convert: {tab, value}}
 *                             (une mesure qui variait d'une région à l'autre : une ligne le dit, avec la région prise)
 *   prices(année, prix)       les prix sourcés de assets/data/prix-reference.json qui tombent cette année-là
 *   loadPrices()              lit ce fichier (livré avec l'app) une fois → LCNDA_EXT.prixReference
 * Un mot comme « livre » suivi de « de pain », « de beurre »… est un poids : il n'est pas pris pour une somme.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_MONTANTS = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (root) {
    'use strict';
    const F = () => root?.LCNDA_AUTREFOIS || (typeof require === 'function' ? (() => { try { return require('./app-autrefois-engine.js'); } catch (_) { return null; } })() : null);
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'");
    const I18 = () => root?.LCNDA_I18N;
    const i18n = (s, v) => { const I = I18(); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const nf = (n, d = 2) => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: d});

    const UNITS = {zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
        quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, septante: 70, octante: 80, huitante: 80, nonante: 90};
    const NUMW = '(?:' + [...Object.keys(UNITS), 'cents?', 'mille', 'mil', 'et'].sort((a, b) => b.length - a.length).join('|') + ')';
    /** des mots (ou des chiffres) → un nombre ; null si ce n'est pas un nombre */
    function numberAt(raw) {
        const s = fold(raw).trim(); if (!s) return null;
        if (/^\d[\d\s  .]*(?:,\d+)?$/.test(s)) { const v = Number(s.replace(/[\s  .]/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; }
        const toks = s.split(/[\s-]+/).filter(Boolean); let total = 0, cur = 0, any = false;
        for (let i = 0; i < toks.length; i++) {
            const w = toks[i];
            if (w === 'et') continue;
            if (w === 'cent' || w === 'cents') { cur = (cur || 1) * 100; any = true; continue; }
            if (w === 'mille' || w === 'mil') { total += (cur || 1) * 1000; cur = 0; any = true; continue; }
            if (!(w in UNITS)) return null;
            const v = UNITS[w]; any = true;
            if ((w === 'vingt' || w === 'vingts') && cur % 100 > 0 && cur % 100 < 10) { cur = cur - cur % 100 + (cur % 100) * 20; continue; } // quatre-vingt(s), six-vingts
            cur += v;
        }
        return any ? total + cur : null;
    }

    const MONEY = ['livres?(?:\\s+(?:tournois|parisis|de\\s+lorraine|du\\s+barrois))?', 'sols?', 'sous', 'deniers?', 'francs?(?:\\s+germinal)?', 'centimes?', 'ecus?', 'louis(?:\\s+d\'or)?', 'pistoles?', 'anciens\\s+francs', 'nouveaux\\s+francs'];
    const MEASURE = ['arpents?', 'perches?(?:\\s+carrees?)?', 'toises?(?:\\s+carrees?)?', 'journa(?:l|ux)', 'boisseaux?', 'setiers?', 'minots?', 'muids?', 'pintes?', 'chopines?', 'veltes?', 'feuillettes?', 'quartauts?',
        'bicherees?', 'bichets?', 'hommees?', 'vergees?', 'acres?', 'ouvrees?', 'seterees?', 'cannes?', 'millerolles?', 'bonniers?', 'rasieres?', 'aunes?', 'lieues?', 'pieds?', 'pouces?', 'hectares?', 'ares?'];
    // ce qui suit « livre » quand c'est un poids
    const WEIGHT_AFTER = /^\s+(?:de|d')\s*(?:pain|beurre|viande|lard|sel|chandelles?|cire|fromage|farine|ble|seigle|huile|sucre|cafe|tabac|poids|laine|fil|chanvre|fer|plomb|poudre|savon|riz|morue|poisson|graisse|suif)\b/;
    const NUMRE = `(?:\\d[\\d\\s  .]*(?:,\\d+)?|${NUMW}(?:[\\s-]+${NUMW})*)`;
    const reMoney = new RegExp(`(?<![\\p{L}\\d])(${NUMRE})\\s+(${MONEY.join('|')})(?![\\p{L}])`, 'giu');
    const reMeasure = new RegExp(`(?<![\\p{L}\\d])(${NUMRE})\\s+(${MEASURE.join('|')})(?:\\s+(de\\s+paris|du\\s+roi|des\\s+eaux\\s+et\\s+forets|commun))?(?![\\p{L}])`, 'giu');

    /** les sommes et les mesures du texte, dans l'ordre */
    function scan(text) {
        const src = String(text ?? ''), f = fold(src), out = [];
        if (f.length !== src.length) return []; // (les accents se plient sans changer la longueur ; sinon on ne risque rien)
        const take = (re, type) => {
            re.lastIndex = 0; let m;
            while ((m = re.exec(f))) {
                const n = numberAt(m[1].trim()); if (n == null || n <= 0) continue;
                let s = m.index + m[0].indexOf(m[1].trim()), e = m.index + m[0].length;
                if (type === 'money' && /^livre/.test(m[2]) && WEIGHT_AFTER.test(f.slice(e))) continue;
                let parts = [`${n} ${m[2]}${m[3] ? ' ' + m[3] : ''}`];
                // « et demi », « et demie »
                const half = /^\s+et\s+demie?\b/.exec(f.slice(e)); if (half) { parts = [`${n + 0.5} ${m[2]}${m[3] ? ' ' + m[3] : ''}`]; e += half[0].length; }
                // la suite de la même somme : « douze livres dix sols six deniers », « cinq pieds deux pouces »
                for (;;) {
                    const rest = f.slice(e), re2 = new RegExp(`^(?:\\s*,)?(?:\\s+et)?\\s+(${NUMRE})\\s+(${(type === 'money' ? ['sols?', 'sous', 'deniers?', 'centimes?'] : ['pieds?', 'pouces?', 'lignes?', 'perches?', 'toises?']).join('|')})(?![\\p{L}])`, 'iu');
                    const k = re2.exec(rest); if (!k) break; const v = numberAt(k[1].trim()); if (v == null) break;
                    parts.push(`${v} ${k[2]}`); e += k[0].length;
                }
                if (out.some(o => s < o.e && e > o.s)) continue;
                out.push({s, e, type, raw: src.slice(s, e), norm: parts.join(' ')});
            }
        };
        take(reMoney, 'money'); take(reMeasure, 'measure');
        return out.sort((a, b) => a.s - b.s);
    }

    /** la bulle : une somme en euros d'aujourd'hui, en pain, en journées ; une mesure en mètres, ares ou litres, avec la source */
    function explain(hit, o = {}) {
        const E = F(); if (!E || !hit) return null;
        if (hit.type === 'money') {
            const sum = E.readSum(hit.norm); if (!sum?.ok) return null;
            const y = Number(o.year) || 0;
            if (!y) return {title: sum.label, lines: [i18n('Donne la date de l’acte pour savoir ce que ça vaut aujourd’hui.')], source: '', url: '', convert: {tab: 'argent', value: hit.norm}};
            const w = E.worth(sum, y, {wageSols: o.wageSols}); if (!w) return null;
            const lines = [i18n('{a} ({y}) {e} d’aujourd’hui', {a: sum.label, y: String(y), e: E.euroText(w.euros)})];
            const more = [w.bread > 0 ? i18n('{n} kg de pain', {n: nf(w.bread, w.bread >= 100 ? 0 : 1)}) : '', w.days ? i18n('{n} journées de journalier', {n: nf(w.days, w.days >= 10 ? 0 : 1)}) : ''].filter(Boolean);
            if (more.length) lines.push(more.join(' · '));
            lines.push(w.source === 'insee' ? i18n('Indice des prix de l’INSEE.') : i18n('Ordre de grandeur (avant 1901, pas d’indice officiel).'));
            (o.prices ? prices(y, o.prices) : []).slice(0, 2).forEach(p => lines.push('💰 ' + p.text));
            return {title: sum.label, lines, source: E.SOURCE, url: E.SOURCE_URL, convert: {tab: 'argent', value: hit.norm, year: y}, euros: w.euros};
        }
        const region = o.region || 'paris', m = E.readMeasure(hit.norm, region, {calendarMore: o.calendarMore}); if (!m?.ok) return null;
        const lines = [i18n('{a} = {m}', {a: m.label, m: m.metric}) + (m.approx ? ' ' + i18n('(environ)') : '')];
        if (m.fromRegion) lines.push(i18n('Mesure de : {r}', {r: m.fromRegion}));
        (m.elsewhere || []).slice(0, 2).forEach(x => lines.push(`${x.label} (${x.region}) : ${x.metric}`));
        // la même unité ne valait pas pareil partout : on le dit (la région prise : celle du lieu de l'acte, sinon celle du Convertisseur)
        if ((m.elsewhere || []).length) lines.push(i18n('Cette mesure changeait d’une région à l’autre : la valeur donnée est celle de « {r} ».', {r: m.fromRegion || m.region}));
        return {title: m.label, lines, source: m.src || '', url: m.url || '', convert: {tab: 'mesures', value: hit.norm}, base: m.base, kind: m.kind};
    }

    /** les prix sourcés (prix-reference.json) de cette année */
    function prices(year, doc) {
        const y = Number(year) || 0, items = Array.isArray(doc) ? doc : (doc?.items || []);
        return items.filter(it => { const a = Number(String(it.from || '').slice(0, 4)), b = Number(String(it.to || '').slice(0, 4)); return a && b && y >= a && y <= b; });
    }

    /** le fichier des prix sourcés, livré avec l'app (lu une fois, jamais sur internet) → LCNDA_EXT.prixReference */
    let prixP = null;
    function loadPrices() {
        const ext = root?.LCNDA_EXT; if (!ext || typeof fetch !== 'function') return Promise.resolve(null);
        if (ext.prixReference) return Promise.resolve(ext.prixReference);
        return prixP || (prixP = fetch('assets/data/prix-reference.json').then(r => (r.ok ? r.json() : null)).then(d => { ext.prixReference = d || {items: []}; return ext.prixReference; }).catch(() => { prixP = null; return null; }));
    }

    return {numberAt, scan, explain, prices, loadPrices, fold};
});
