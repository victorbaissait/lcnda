/* LCNDA — 🔎 Recherche « à la française » : le cœur commun (sans page ni réseau), jumeau de lib/recherche_fr.php.
 * window.LCNDA_RFR (navigateur) ou require() (Node : tests/test-recherche-fr.js compare les deux moitiés sur des centaines de cas).
 * Les données : assets/data/recherche-fr.json (dans la page : window.LCNDA_RFR_DATA, écrit par index.php ; dans Node : lu ici).
 *
 *   fold(s)                    minuscules sans accents, ligatures défaites, ponctuation → espace
 *   nameKeys(nom)              {glued, bare, phon, particle} : « d'Albert » → dalbert / albert / alber
 *   phon(s), phonNear(a, b)    phonétique française et proximité (nom de famille)
 *   firstForms(prénoms)        les prénoms de référence d'une fiche (formes latines, abréviations, diminutifs, composés)
 *   firstQuery(mot, réglages)  le prénom de référence d'un mot tapé (« Petrus » → Pierre, forme latine)
 *   placeFold(s), placeVariants(s)   St/Ste = Saint/Sainte, article du début
 *   parseDates(q, marge), dateYmd(texte)   dates tapées (vers, entre, avant, après, années, siècle, jour, républicain)
 *   parseQuery(q, réglages)    ce que la recherche a compris (mots, dates)
 *   explain(parsed, formes, réglages, phonétique, extra), explainDates(dates, événements)   « Trouvé par »
 *   whyText(why), whyHtml(why) le « Trouvé par » écrit (traduit, échappé)
 * Pour d'autres outils (ex. la question en phrase) : parseQuery et explain suffisent ; la recherche dans la base est côté
 * serveur (rfr_person_ids, lib/recherche_fr.php).
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LCNDA_RFR = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';
    const i18n = (s, v) => { const I = root && root.LCNDA_I18N; return I ? I.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)); };
    let DATA = (root && root.LCNDA_RFR_DATA) || null;
    if (!DATA && typeof require === 'function') { try { DATA = require('../data/recherche-fr.json'); } catch (_) { DATA = null; } }
    DATA = DATA || {};
    const DEFAULTS = {auto: true, latin: true, abr: true, vers: 5};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    function settingsClean(v) {
        const s = {...DEFAULTS};
        if (v && typeof v === 'object') {
            for (const k of ['auto', 'latin', 'abr']) if (k in v) s[k] = !!v[k];
            if (v.vers !== undefined && v.vers !== null && v.vers !== '' && !isNaN(Number(v.vers))) s.vers = Math.max(0, Math.min(30, Math.trunc(Number(v.vers))));
        }
        return s;
    }

    /* ═════════ Normalisation ═════════ */
    const LIG = {'Æ': 'AE', 'æ': 'ae', 'Œ': 'OE', 'œ': 'oe', 'ß': 'ss', 'ẞ': 'SS', 'Ø': 'O', 'ø': 'o', 'Đ': 'D', 'đ': 'd', 'Ł': 'L', 'ł': 'l', 'Þ': 'TH', 'þ': 'th', 'Ð': 'D', 'ð': 'd',
        'ı': 'i', 'ſ': 's', 'ĸ': 'k', 'ŉ': 'n', 'Ŋ': 'N', 'ŋ': 'n', 'Ħ': 'H', 'ħ': 'h', 'Ŧ': 'T', 'ŧ': 't'};
    const LIG_RX = new RegExp('[' + Object.keys(LIG).join('') + ']', 'g');
    const memoF = new Map();
    function fold(s) {
        s = String(s ?? '');
        const m = memoF.get(s); if (m !== undefined) return m;
        if (memoF.size > 60000) memoF.clear();
        const out = s.replace(LIG_RX, c => LIG[c]).normalize('NFD').replace(/\p{Mn}+/gu, '').replace(LIG_RX, c => LIG[c]).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        memoF.set(s, out);
        return out;
    }
    const ACC = {'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'î': 'i', 'ï': 'i', 'í': 'i', 'ì': 'i', 'ô': 'o', 'ö': 'o', 'ó': 'o', 'ò': 'o',
        'û': 'u', 'ü': 'u', 'ú': 'u', 'ù': 'u', 'ÿ': 'y', '’': "'", '‘': "'", 'ʼ': "'", '`': "'", '´': "'", '–': '-', '—': '-'};
    const ACC_RX = new RegExp('[' + Object.keys(ACC).join('') + ']', 'g');
    const low = s => String(s ?? '').toLowerCase().replace(ACC_RX, c => ACC[c]).replace(/\s+/gu, ' ').trim();
    const sReplace = s => String(s ?? '').replace(/[çÇ]/g, 's');

    let PART = null;
    const particles = () => PART || (PART = new Set((DATA.particules && DATA.particules.mots) || []));
    function glueWords(words) {
        const el = {...((DATA.particules && DATA.particules.elision) || {})}; delete el._doc;
        let out = '';
        words.forEach((w, i) => { if (i + 1 < words.length && typeof el[w] === 'string' && /^[aeiouyh]/.test(words[i + 1])) w = el[w]; out += w; });
        return out;
    }
    const memoN = new Map();
    function nameKeys(raw) {
        raw = String(raw ?? '');
        const m = memoN.get(raw); if (m) return m;
        if (memoN.size > 30000) memoN.clear();
        const f = fold(raw), words = f === '' ? [] : f.split(' ');
        const pf = fold(sReplace(raw)), pw = pf === '' ? [] : pf.split(' ');
        const P = particles();
        const strip = ws => { const b = ws.filter(w => !P.has(w)); return b.length ? b : ws; };
        const bare = strip(words);
        // les clés comparées : le nom collé, puis sans ses particules du début une à une, puis sans aucune particule
        const keys = [];
        for (let i = 0; i < words.length; i++) {
            const k = glueWords(words.slice(i));
            if (k !== '' && !keys.includes(k)) keys.push(k);
            if (!P.has(words[i])) break;
        }
        if (bare.length && !keys.includes(bare.join(''))) keys.push(bare.join(''));
        const out = {glued: glueWords(words), bare: bare.join(''), keys, phon: phonKey(strip(pw).join('')), particle: bare.length < words.length};
        memoN.set(raw, out);
        return out;
    }
    const phon = raw => phonKey(fold(sReplace(raw)).replace(/ /g, ''));
    const PHON_RULES = [
        [/^h/, ''], [/sch/g, 'ch'], [/ph/g, 'f'], [/th/g, 't'], [/rh/g, 'r'], [/gn/g, 'n'],
        [/ck|cq|qu|q/g, 'k'], [/ch|sh/g, 'X'],
        [/gu(?=[eiy])/g, 'G'], [/ge(?=[aou])/g, 'j'], [/g(?=[eiy])/g, 'j'], [/c(?=[eiy])/g, 's'], [/c/g, 'k'],
        [/y/g, 'i'], [/w/g, 'v'], [/z/g, 's'], [/x$/, ''], [/x/g, 'ks'], [/bv/g, 'v'], [/h/g, ''], [/G/g, 'g'],
        [/eau/g, 'o'], [/aul(?=[tdsxz])/g, 'o'], [/au/g, 'o'], [/ai|ei/g, 'e'], [/oeu|eu/g, 'e'], [/ou/g, 'U'], [/ean(?![aeiou])/g, 'an'],
        [/e[nm](?=[^aeiouU])/g, 'an'], [/am(?=[^aeiouU])/g, 'an'], [/om(?=[bp])/g, 'on'], [/im(?=[bp])/g, 'in'],
        [/(?<=.)(er|ez|et)$/, 'e'],
    ];
    const memoP = new Map();
    /** phonétique française : les mêmes règles, dans le même ordre, que rfr_phon_key() (lib/recherche_fr.php) */
    function phonKey(w) {
        w = String(w ?? '');
        const m = memoP.get(w); if (m !== undefined) return m;
        if (memoP.size > 30000) memoP.clear();
        let s = w.replace(/[^a-z]/g, '');
        if (s === '') { memoP.set(w, ''); return ''; }
        for (const [re, to] of PHON_RULES) s = s.replace(re, to);
        for (let i = 0; i < 2; i++) {
            while (s.length > 2 && /[tdsxzp]$/.test(s)) s = s.slice(0, -1);
            if (i === 0 && s.length > 2 && s.endsWith('e')) s = s.slice(0, -1);
        }
        s = s.replace(/(.)\1+/g, '$1');
        memoP.set(w, s);
        return s;
    }
    function lev(a, b) {
        if (a === b) return 0;
        const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
        let prev = Array.from({length: n + 1}, (_, j) => j);
        for (let i = 1; i <= m; i++) {
            const cur = [i];
            for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[n];
    }
    function phonNear(q, k) {
        if (!q || !k) return false;
        if (q === k) return true;
        if (q.length < 3 || q[0] !== k[0]) return false;
        const max = q.length >= 6 ? 2 : 1;
        if (Math.abs(q.length - k.length) > max) return false;
        return lev(q, k) <= max;
    }

    /* ═════════ Prénoms ═════════ */
    const firstKey = s => fold(s).replace(/ /g, '');
    let IX = null;
    function firstIndex() {
        if (IX) return IX;
        IX = new Map();
        const groups = DATA.prenoms || [];
        const put = (form, g, kind) => {
            const k = firstKey(form);
            if (k === '' || IX.has(k)) return;
            IX.set(k, {canon: firstKey(g.fr), fr: g.fr, kind, dot: String(form).trim().endsWith('.'), g: g.genre || ''});
        };
        groups.forEach(g => put(g.fr, g, 'fr'));
        groups.forEach(g => ['latin', 'abr', 'dim', 'colle'].forEach(kind => (g[kind] || []).forEach(f => put(f, g, kind))));
        const dec = {...(DATA.declinaisons || {})}; delete dec._doc;
        groups.forEach(g => (g.latin || []).forEach(f => {
            const words = fold(f).split(' ');
            for (let c = 0; c < 3; c++) {
                const out = words.map(w => {
                    for (const [end, cases] of Object.entries(dec)) if (w.length > end.length + 1 && w.endsWith(end) && cases[c] !== undefined) return w.slice(0, -end.length) + cases[c];
                    return w;
                });
                put(out.join(' '), g, 'decl');
            }
        }));
        for (const [k, e] of Array.from(IX.entries())) {
            if ((e.kind === 'latin' || e.kind === 'decl') && k.includes('j')) { const i = k.replace(/j/g, 'i'); if (!IX.has(i)) IX.set(i, {...e, kind: 'decl'}); }
        }
        return IX;
    }
    const kindAllowed = (kind, set) => (kind === 'latin' || kind === 'decl') ? !!set.latin : (kind === 'abr' || kind === 'dim' || kind === 'colle') ? !!set.abr : true;
    const kindName = kind => ({latin: 'latin', decl: 'latin', abr: 'abr', dim: 'dim', colle: 'colle'})[kind] || 'fr';
    const memoFF = new Map();
    function firstForms(raw) {
        raw = String(raw ?? '');
        const m = memoFF.get(raw); if (m) return m;
        if (memoFF.size > 30000) memoFF.clear();
        const ix = firstIndex(), f = fold(raw);
        if (f === '') { memoFF.set(raw, []); return []; }
        const words = f.split(' '), out = [];
        const add = (e, form) => {
            out.push({canon: e.canon, fr: e.fr, kind: e.kind, form, comp: false});
            const parts = e.fr.split(/[\s-]+/u);
            if (parts.length > 1) parts.forEach(p => { const pk = firstKey(p), x = ix.get(pk); if (x && x.kind === 'fr') out.push({canon: x.canon, fr: x.fr, kind: e.kind, form, comp: true}); });
        };
        const whole = words.join('');
        if (ix.has(whole)) { add(ix.get(whole), raw.trim()); memoFF.set(raw, out); return out; }
        for (let i = 0; i < words.length;) {
            let hit = 0;
            for (let len = Math.min(4, words.length - i); len >= 1; len--) {
                const k = words.slice(i, i + len).join('');
                if (ix.has(k)) { add(ix.get(k), words.slice(i, i + len).join(' ')); hit = len; break; }
            }
            if (hit) { i += hit; continue; }
            out.push({canon: words[i], fr: '', kind: 'self', form: words[i], comp: false});
            i++;
        }
        memoFF.set(raw, out);
        return out;
    }
    function firstCanonString(raw) {
        const pre = {latin: 'l:', decl: 'l:', abr: 'a:', dim: 'd:', colle: 'c:'};
        const t = [];
        firstForms(raw).forEach(f => { const k = (pre[f.kind] || '') + f.canon; if (!t.includes(k)) t.push(k); });
        return t.length ? ' ' + t.join(' ') + ' ' : '';
    }
    function firstQuery(token, set) {
        set = set || DEFAULTS;
        const k = firstKey(token), e = firstIndex().get(k);
        if (!e || k.length < 2) return null;
        if (e.dot && !String(token).replace(/\s+$/, '').endsWith('.')) return null;
        if (!kindAllowed(e.kind, set)) return null;
        return e;
    }

    /* ═════════ Lieux ═════════ */
    function placeFold(s) {
        const w0 = fold(s); if (w0 === '') return '';
        const L = (DATA.lieux && DATA.lieux.abreviations) || {};
        const words = w0.split(' '), out = [], n = words.length;
        for (let i = 0; i < n; i++) {
            const two = i + 1 < n ? words[i] + ' ' + words[i + 1] : '';
            if (two !== '' && typeof L[two] === 'string' && i + 2 < n) { out.push(L[two]); i++; continue; }
            if (typeof L[words[i]] === 'string' && i + 1 < n && (words[i] !== 's' || i === 0 || words[i - 1] === 'de' || words[i - 1] === 'sur')) { out.push(L[words[i]]); continue; }
            out.push(words[i]);
        }
        return out.join(' ');
    }
    function placeVariants(q) {
        const f = fold(q); if (f === '') return [];
        const v = [f, placeFold(q)], arts = (DATA.lieux && DATA.lieux.articles) || [];
        [f, placeFold(q)].forEach(x => { const w = x.split(' '); if (w.length > 1 && arts.includes(w[0])) v.push(w.slice(1).join(' ')); });
        return [...new Set(v.filter(x => x !== ''))];
    }

    /* ═════════ Dates ═════════ */
    function roman(s) {
        s = String(s); if (/^\d+$/.test(s)) return Number(s);
        const v = {i: 1, v: 5, x: 10, l: 50}; s = s.toLowerCase(); let n = 0;
        for (let i = 0; i < s.length; i++) { const a = v[s[i]] || 0, b = v[s[i + 1]] || 0; n += a < b ? -a : a; }
        return n;
    }
    const SHEET = () => (root && root.LCNDA_SHEET) || (typeof require === 'function' ? (() => { try { return require('./app-tableur-engine.js'); } catch (_) { return null; } })() : null);
    function republican(an, mo, d) {
        if (an < 1 || an > 14 || mo < 1 || mo > 13 || d < 1 || d > (mo === 13 ? 6 : 30)) return null;
        const S = SHEET(); if (!S || !S.republicanToGregorian) return null;
        const g = S.republicanToGregorian(an, mo, d); return [g.y, g.m, g.d];
    }
    const months = () => (DATA.dates && DATA.dates.mois) || {};
    const pad = (n, w) => String(n).padStart(w, '0');
    const checkdate = (m, d, y) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() && y >= 1;
    function dateYmd(text) {
        const t = low(text); if (t === '') return '';
        const rep = (DATA.dates && DATA.dates.republicain) || [], mo = months();
        let m;
        if ((m = t.match(new RegExp("(\\d{1,2}|1er)\\s*(?:er|e)?\\s+(" + rep.join('|') + ")\\s+(?:de l'|l')?an\\s+([ivxl]+|\\d{1,2})\\b")))) {
            const g = republican(roman(m[3]), rep.indexOf(m[2]) + 1, m[1] === '1er' ? 1 : Number(m[1]));
            return g ? `${pad(g[0], 4)}-${pad(g[1], 2)}-${pad(g[2], 2)}` : '';
        }
        if ((m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return `${pad(+m[1], 4)}-${pad(+m[2], 2)}-${pad(+m[3], 2)}`;
        if ((m = t.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/))) return `${pad(+m[3], 4)}-${pad(+m[2], 2)}-${pad(+m[1], 2)}`;
        if ((m = t.match(/\b(\d{1,2}|1er)\s+([a-z0-9]+)\.?\s+(\d{3,4})\b/)) && Object.prototype.hasOwnProperty.call(mo, m[2])) return `${pad(+m[3], 4)}-${pad(mo[m[2]], 2)}-${pad(m[1] === '1er' ? 1 : +m[1], 2)}`;
        if ((m = t.match(/\b([a-z0-9]+)\.?\s+(\d{3,4})\b/)) && Object.prototype.hasOwnProperty.call(mo, m[1])) return `${pad(+m[2], 4)}-${pad(mo[m[1]], 2)}`;
        if ((m = t.match(/(?<!\d)(\d{3,4})(?!\d)/))) return pad(+m[1], 4);
        return '';
    }
    const quote = s => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    function parseDates(q, vers = 5) {
        let t = ' ' + low(q) + ' ';
        const D = DATA.dates || {}, rep = (D.republicain || []).join('|');
        const mois = Object.keys(months()).map(quote).join('|');
        const out = [];
        const take = (re, fn) => { t = t.replace(re, (...m) => { const d = fn(m); if (d === null) return m[0]; out.push({...d, label: m[0].trim()}); return ' '; }); };
        const day = (y, m, d) => checkdate(m, d, y) ? {from: y, to: y, kind: 'day', ymd: `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`} : null;
        take(new RegExp("(?<=\\s)(\\d{1,2}|1er|premier)\\s*(?:er|e)?\\s+(" + rep + ")\\s+(?:de l'|l')?an\\s+([ivxl]+|\\d{1,2})(?=\\s)", 'g'), m => {
            const g = republican(roman(m[3]), rep.split('|').indexOf(m[2]) + 1, ['1er', 'premier'].includes(m[1]) ? 1 : Number(m[1]));
            const d = g ? day(g[0], g[1], g[2]) : null;
            return d ? {...d, kind: 'rep'} : null;
        });
        take(new RegExp('(?<=\\s)(\\d{1,2}|1er)\\s+(' + mois + ')\\.?\\s+(\\d{3,4})(?=\\s)', 'g'), m => day(Number(m[3]), months()[m[2]], m[1] === '1er' ? 1 : Number(m[1])));
        take(/(?<=\s)(\d{4})-(\d{1,2})-(\d{1,2})(?=\s)/g, m => day(+m[1], +m[2], +m[3]));
        take(/(?<=\s)(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?=\s)/g, m => day(+m[3], +m[2], +m[1]));
        take(new RegExp('(?<=\\s)(' + mois + ')\\.?\\s+(\\d{3,4})(?=\\s)', 'g'), m => ({from: +m[2], to: +m[2], kind: 'month', ymd: `${pad(+m[2], 4)}-${pad(months()[m[1]], 2)}`}));
        take(/(?<=\s)(?:entre|de)\s+(\d{3,4})\s+(?:et|a)\s+(\d{3,4})(?=\s)/g, m => ({from: Math.min(+m[1], +m[2]), to: Math.max(+m[1], +m[2]), kind: 'between', ymd: ''}));
        take(/(?<=\s)(\d{4})\s*-\s*(\d{4})(?=\s)/g, m => ({from: Math.min(+m[1], +m[2]), to: Math.max(+m[1], +m[2]), kind: 'between', ymd: ''}));
        take(/(?<=\s)(?:les\s+)?annees\s+(\d{3})0(?=\s)/g, m => ({from: Number(m[1] + '0'), to: Number(m[1] + '9'), kind: 'decade', ymd: ''}));
        take(/(?<=\s)(?:au\s+|du\s+)?([ivxl]+?|\d{1,2})\s*(?:e|er|eme|ieme)?\s+siecle(?=\s)/g, m => { const n = roman(m[1]); return n >= 1 && n <= 21 ? {from: (n - 1) * 100, to: (n - 1) * 100 + 99, kind: 'century', ymd: ''} : null; });
        const vw = (D.vers || ['vers']).map(w => quote(w) + (w === '~' ? '' : '\\.?')).join('|');
        take(new RegExp('(?<=\\s)(?:' + vw + ')\\s*(\\d{3,4})(?=\\s)', 'g'), m => ({from: +m[1] - vers, to: +m[1] + vers, kind: 'vers', ymd: ''}));
        const aw = (D.avant || ['avant']).map(w => quote(w) + '\\.?').join('|');
        take(new RegExp('(?<=\\s)(?:' + aw + ')\\s+(\\d{3,4})(?=\\s)', 'g'), m => ({from: null, to: +m[1] - 1, kind: 'before', ymd: ''}));
        take(/(?<=\s)(?:a partir de|depuis)\s+(\d{3,4})(?=\s)/g, m => ({from: +m[1], to: null, kind: 'after', ymd: ''}));
        const pw = (D.apres || ['apres']).map(w => quote(w) + '\\.?').join('|');
        take(new RegExp('(?<=\\s)(?:' + pw + ')\\s+(\\d{3,4})(?=\\s)', 'g'), m => ({from: +m[1] + 1, to: null, kind: 'after', ymd: ''}));
        take(/(?<=\s)(1[0-9]{3}|20[0-9]{2})(?=\s)/g, m => ({from: +m[1], to: +m[1], kind: 'year', ymd: ''}));
        return {dates: out.map(d => ({from: d.from, to: d.to, kind: d.kind, label: d.label, ymd: d.ymd})), rest: t.replace(/\s+/g, ' ').trim()};
    }

    /* ═════════ Lire une recherche ═════════ */
    function parseQuery(q, set) {
        set = settingsClean(set || DEFAULTS);
        q = Array.from(String(q ?? '')).slice(0, 200).join('');
        const d = parseDates(q, set.vers);
        const raw = d.rest.split(/\s+/u).filter(w => fold(w) !== '').slice(0, 8);
        const P = particles(), toks = [];
        let pend = [];
        raw.forEach((w, i) => {
            const f = fold(w);
            if (P.has(f) && i + 1 < raw.length) { pend.push(w); return; }
            toks.push({words: [...pend, w], merged: pend.length ? 'particle' : ''});
            pend = [];
        });
        const ix = firstIndex(), out = [];
        for (let i = 0; i < toks.length; i++) {
            if (i + 1 < toks.length && toks[i].merged === '' && toks[i + 1].merged === '') {
                const two = toks[i].words[0] + ' ' + toks[i + 1].words[0], e = ix.get(firstKey(two));
                if (e && (e.fr.includes('-') || e.fr.includes(' ')) && firstQuery(two, set)) { out.push({words: [toks[i].words[0], toks[i + 1].words[0]], merged: 'first'}); i++; continue; }
            }
            out.push(toks[i]);
        }
        const tokens = out.map(t => {
            const text = t.words.join(' '), f = fold(text), k = nameKeys(text);
            return {raw: text, fold: f, parts: t.merged === 'first' ? t.words.map(fold) : [f], glued: k.glued, bare: k.bare, keys: k.keys.filter(x => x.length >= 3), phon: k.phon,
                first: t.merged === 'particle' ? null : firstQuery(text, set), merged: t.merged};
        });
        return {raw: q, dates: d.dates, tokens};
    }

    /* ═════════ Pourquoi une fiche répond ═════════ */
    function formPrepare(f) {
        const first = `${f.first || ''} ${f.middle || ''}`.trim(), last = String(f.last || ''), k = nameKeys(last);
        const phons = [];
        fold(sReplace(first)).split(' ').forEach(w => { if (w !== '') { const p = phonKey(w); if (!phons.includes(p)) phons.push(p); } });
        return {src: Number(f.src || 0), type: String(f.type || ''), first, last, words: fold(`${first} ${last} ${f.group || ''}`), keys: k.keys, phon: k.phon,
            firsts: firstForms(first), fphons: phons};
    }
    const formLabel = f => `${f.first} ${f.last}`.trim();
    function matchToken(t, f, set, withPhon) {
        let all = true;
        for (const p of t.parts) if (p === '' || !f.words.includes(p)) { all = false; break; }
        if (all) {
            if (f.src === 0) return {tier: 0, why: {k: 'exact'}};
            return {tier: 1, why: {k: ['married', 'historical'].includes(f.type) ? 'married' : 'variant', v: formLabel(f)}};
        }
        if (t.keys.some(k => f.keys.includes(k))) return {tier: 2, why: {k: 'particle', v: f.last}};
        if (t.first) {
            for (const e of f.firsts) {
                if (e.canon !== t.first.canon || !kindAllowed(e.kind, set)) continue;
                if (e.kind !== 'fr' && e.kind !== 'self') return {tier: 2, why: {k: kindName(e.kind), v: e.form, fr: e.fr}};
                if (t.first.kind !== 'fr') return {tier: 2, why: {k: kindName(t.first.kind), v: t.raw, fr: t.first.fr}};
                return {tier: 2, why: {k: 'colle', v: e.form, fr: e.fr}};
            }
        }
        if (withPhon && t.phon !== '') {
            if (phonNear(t.phon, f.phon)) return {tier: 3, why: {k: 'phon', v: f.last}};
            if (t.phon.length >= 2 && f.fphons.includes(t.phon)) return {tier: 3, why: {k: 'phon', v: f.first}};
        }
        return null;
    }
    function uniqueWhy(why) { const seen = new Set(), out = []; why.forEach(w => { const k = JSON.stringify(w); if (!seen.has(k)) { seen.add(k); out.push(w); } }); return out; }
    function explain(parsed, forms, set, withPhon = true, extra = {}) {
        set = settingsClean(set || DEFAULTS);
        const F = (forms || []).map(formPrepare);
        let tier = 0, ok = true; const why = [];
        parsed.tokens.forEach((t, i) => {
            let best = null;
            for (const f of F) { const c = matchToken(t, f, set, withPhon); if (c && (best === null || c.tier < best.tier)) best = c; }
            if (extra[i] && (best === null || best.tier > 0)) best = {tier: 0, why: extra[i]};
            if (best === null) { ok = false; return; }
            tier = Math.max(tier, best.tier); why.push(best.why);
        });
        return {ok, tier, why: uniqueWhy(why)};
    }
    function explainDates(dates, ev) {
        return (dates || []).map(d => {
            let hit = null;
            for (const e of ev || []) {
                if (e.y === null || e.y === undefined || e.y === '') continue;
                const y = Number(e.y);
                if ((d.from !== null && y < d.from) || (d.to !== null && y > d.to)) continue;
                if (d.ymd !== '' && !dateYmd(e.text || '').startsWith(d.ymd)) continue;
                hit = e; break;
            }
            return {k: 'date', v: d.label, ev: hit ? hit.ev : '', y: hit ? Number(hit.y) : null};
        });
    }

    /* ═════════ « Trouvé par », écrit ═════════ */
    const vowel = s => /^[aeiouyhAEIOUYHÉÈÊÀÂÎÔŒéèêàâîôœ]/.test(String(s || ''));
    const EV = {birth: 'naissance', bapt: 'baptême', marr: 'mariage', death: 'décès', buri: 'sépulture', other: 'un événement'};
    function whyOne(w) {
        if (!w || typeof w !== 'object') return '';
        const v = String(w.v ?? ''), fr = String(w.fr ?? '');
        switch (w.k) {
            case 'exact': return i18n('nom exact');
            case 'married': return i18n('nom de mariage ({x})', {x: v});
            case 'variant': return i18n('autre nom noté ({x})', {x: v});
            case 'particle': return i18n('particule ignorée ({x})', {x: v});
            case 'latin': return vowel(fr) ? i18n('forme latine d’{p} ({x})', {p: fr, x: v}) : i18n('forme latine de {p} ({x})', {p: fr, x: v});
            case 'abr': return vowel(fr) ? i18n('abréviation d’{p} ({x})', {p: fr, x: v}) : i18n('abréviation de {p} ({x})', {p: fr, x: v});
            case 'dim': return vowel(fr) ? i18n('diminutif d’{p} ({x})', {p: fr, x: v}) : i18n('diminutif de {p} ({x})', {p: fr, x: v});
            case 'colle': return i18n('prénom composé ({p})', {p: fr || v});
            case 'phon': return i18n('phonétique (proche de {x})', {x: v});
            case 'place': return i18n('lieu ({x})', {x: v});
            case 'saint': return i18n('Saint, Sainte ou article écrits autrement ({x})', {x: v});
            case 'oldname': return i18n('ancien nom ({x})', {x: v});
            case 'fusion': return i18n('commune fusionnée ({x} → {y})', {x: v, y: String(w.now ?? '')});
            case 'date': return w.ev && w.y !== null && w.y !== undefined ? i18n('date « {d} » ({ev} {y})', {d: v, ev: i18n(EV[w.ev] || EV.other), y: String(w.y)}) : i18n('date « {d} »', {d: v});
            default: return '';
        }
    }
    /** les raisons d'une ligne ; seules, « nom exact » et une date ne disent rien de plus que le résultat : on les montre avec une autre raison */
    function whyList(why) {
        const list = (Array.isArray(why) ? why : []).filter(w => w && typeof w === 'object');
        const useful = list.some(w => w.k !== 'exact' && w.k !== 'date');
        return useful || list.some(w => w.k === 'date') ? list.filter(w => useful || w.k !== 'exact') : [];
    }
    const whyText = why => whyList(why).map(whyOne).filter(Boolean).join(' · ');
    const whyHtml = (why, cls = 'rfr-why') => { const t = whyText(why); return t ? `<small class="${esc(cls)}">${esc(i18n('Trouvé par : {x}', {x: t}))}</small>` : ''; };
    /** « Aucun Dupond ; 3 personnes proches : Dupont, Dupon » (repli phonétique), échappé */
    function fallbackHtml(fb) {
        if (!fb || !fb.n) return '';
        const P = root && root.LCNDA_I18N && root.LCNDA_I18N.plural ? root.LCNDA_I18N.plural : (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
        return `<div class="rfr-fallback" role="status">${esc(i18n('Aucun « {q} » ; {n} proches : {names}', {q: fb.q || '', n: P(Number(fb.n) || 0, 'personne'), names: (fb.names || []).join(', ')}))}</div>`;
    }

    return {DEFAULTS, settingsClean, fold, low, nameKeys, glueWords, phon, phonKey, phonNear, lev, firstKey, firstIndex, firstForms, firstCanonString, firstQuery, kindAllowed,
        placeFold, placeVariants, roman, republican, dateYmd, parseDates, parseQuery, formPrepare, matchToken, explain, explainDates, whyOne, whyList, whyText, whyHtml, fallbackHtml,
        get data() { return DATA; }};
});
