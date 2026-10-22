/**
 * 🧮 Le moteur commun des tableaux (window.LCNDA_SHEET ; aussi require() dans Node pour les essais).
 * Sans bibliothèque, sans écran : formules en français (et en anglais), dates des actes (« vers 1784 », « an II »,
 * comprises comme les dates C4 : UI.readDate), recalcul par dépendances, erreurs expliquées, CSV / TSV / collage,
 * XLSX et ODS (lire et écrire), JSON, et le seul fabricant de fichiers ZIP de l'app.
 * Calcul sûr : jamais eval ni Function ; tailles, profondeur et nombre de cellules bornés.
 * Maquette validée : « 🧮 Tableur » (écrans A à J) ; mode d'emploi : docs/UI.md, « 🧮 Tableur ».
 * L'écran (Outils de modification → 🧮 Tableur) est dans heritage-tableur.js.
 */
(function (root, factory) {
    const S = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = S;
    if (typeof window !== 'undefined') window.LCNDA_SHEET = S;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
    'use strict';

    /* ═════════ Limites (un fichier piégé ou un calcul fou ne doivent rien bloquer) ═════════ */
    const LIMITS = {
        rows: 1048576, cols: 16384,           // comme Excel (A1 → XFD1048576)
        cells: 2000000,                        // cellules remplies dans un classeur
        sheets: 200, formula: 8192, depth: 100, tokens: 4000,
        text: 32767,                           // caractères dans une cellule
        spill: 200000,                         // cases d'un résultat UNIQUE / TRIER / FILTRE
        fileBytes: 60 * 1024 * 1024,           // fichier importé
        unzipBytes: 300 * 1024 * 1024,         // total décompressé
        unzipEntry: 150 * 1024 * 1024,         // un élément décompressé
        zipEntries: 4000, zipRatio: 400,       // éléments ; rapport décompressé / compressé au-delà d'1 Mo
        xmlNodes: 6000000, styles: 5000, csvRows: 1048576,
    };

    /* ═════════ Petits outils ═════════ */
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const COLS = [];
    const colName = c => {
        if (c < 1000 && COLS[c]) return COLS[c];
        let s = '', n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        if (c < 1000) COLS[c] = s; return s;
    };
    const colNum = s => { let c = 0; for (const ch of String(s).toUpperCase()) { const k = ch.charCodeAt(0) - 64; if (k < 1 || k > 26) return -1; c = c * 26 + k; } return c - 1; };
    const addr = (r, c) => colName(c) + (r + 1);
    const ADDR_RX = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;
    /** 'B12' → [11, 1] ; null si ce n'est pas une adresse */
    const parseAddr = s => { const m = ADDR_RX.exec(String(s).trim()); if (!m) return null; const r = Number(m[2]) - 1, c = colNum(m[1]); return r >= 0 && r < LIMITS.rows && c >= 0 && c < LIMITS.cols ? [r, c] : null; };
    /** 'A1:C4' (ou 'B2') → {r0, c0, r1, c1} */
    const parseRange = s => {
        const t = String(s || '').trim().replace(/^.*!/, ''), [a, b] = t.split(':'), A = parseAddr(a), B = b ? parseAddr(b) : A;
        if (!A || !B) return null;
        return {r0: Math.min(A[0], B[0]), c0: Math.min(A[1], B[1]), r1: Math.max(A[0], B[0]), c1: Math.max(A[1], B[1])};
    };
    const rangeStr = g => (g.r0 === g.r1 && g.c0 === g.c1 ? addr(g.r0, g.c0) : `${addr(g.r0, g.c0)}:${addr(g.r1, g.c1)}`);
    const inRange = (g, r, c) => r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1;
    /** Une couleur sûre (#hex, rgb(), hsl(), un nom simple) ; sinon '' — rien ne peut glisser dans un style */
    const safeCol = c => { if (c == null || c === '') return ''; const t = String(c).trim(); return /^#[0-9a-f]{3,8}$/i.test(t) || /^[a-z]{3,20}$/i.test(t) || /^(rgb|hsl)a?\([\d\s.,%]+\)$/i.test(t) ? t : ''; };
    const quoteSheet = n => (/^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]*$/.test(n) && !ADDR_RX.test(n) && !/^(vrai|faux|true|false)$/i.test(n) ? n : `'${String(n).replace(/'/g, "''")}'`);

    /* ═════════ Les valeurs : nombre, texte, VRAI/FAUX, vide (null), date, erreur, tableau ═════════ */
    class SErr { constructor(code, info = '', cell = '') { this.code = code; this.info = info; this.cell = cell; } toString() { return this.code; } }
    const isErr = v => v instanceof SErr;
    const err = (code, info, cell) => new SErr(code, info, cell);
    /** Une date du calendrier (DATE, AUJOURDHUI…) : son numéro de série (jours depuis le 30/12/1899, comme les tableurs) */
    class SDate { constructor(serial, time = false) { this.serial = serial; this.time = time; } valueOf() { return this.serial; } }
    /** Un tableau de résultats (UNIQUE, TRIER, FILTRE) qui « déborde » sur les cases voisines */
    class SArr { constructor(rows) { this.rows = rows; this.h = rows.length; this.w = rows.reduce((m, r) => Math.max(m, r.length), 0); } get(i, j) { const v = this.rows[i]?.[j]; return v === undefined ? null : v; } values() { const o = []; this.rows.forEach(r => { for (let j = 0; j < this.w; j++) o.push(r[j] === undefined ? null : r[j]); }); return o; } }
    const EPOCH = Date.UTC(1899, 11, 30);
    const ymdSerial = (y, m = 1, d = 1) => { const dt = new Date(Date.UTC(2000, m - 1, d)); dt.setUTCFullYear(y); return Math.round((dt.getTime() - EPOCH) / 864e5); };
    const serialYmd = s => { const dt = new Date(EPOCH + Math.floor(s) * 864e5); return {y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate()}; };
    /** « 1 234,5 », « 12,40 € », « 35 % », « -2.5 » → nombre ; sinon null */
    const NUM_RX = /^[-+]?(\d{1,3}([   ]\d{3})+|\d+)?([.,]\d+)?([eE][-+]?\d+)?$/;
    function toNum(t) {
        if (typeof t === 'number') return Number.isFinite(t) ? t : null;
        if (t instanceof SDate) return t.serial;
        if (typeof t === 'boolean') return t ? 1 : 0;
        let s = String(t ?? '').trim(); if (!s || s.length > 60) return null;
        let k = 1;
        if (/%$/.test(s)) { s = s.slice(0, -1).trim(); k = 100; }
        s = s.replace(/^(€|\$|£)\s*/, '').replace(/\s*(€|eur|euros?|\$|£|f|fr|francs?)$/i, '');
        if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ''); // 1,234.5 (anglais)
        if (!NUM_RX.test(s) || !/\d/.test(s)) return null;
        const n = Number(s.replace(/[   ]/g, '').replace(',', '.'));
        return Number.isFinite(n) ? (k === 100 ? n / 100 : n) : null;
    }
    const NF = new Map();
    const fmtFr = (n, o = {}) => { const k = `${o.minimumFractionDigits}|${o.maximumFractionDigits}|${o.useGrouping}`; let f = NF.get(k); if (!f) { try { f = new Intl.NumberFormat('fr-FR', o); } catch (_) { f = {format: x => String(x).replace('.', ',')}; } NF.set(k, f); } return f.format(n); };
    /** Une valeur en texte (pour & , CONCAT, GAUCHE…) */
    function toStr(v) {
        if (v == null) return '';
        if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
        if (typeof v === 'number') return fmtFr(v, {maximumFractionDigits: 10, useGrouping: false});
        if (v instanceof SDate) { const d = serialYmd(v.serial); return `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}`; }
        if (isErr(v)) return v.code;
        return String(v);
    }
    /** Une valeur en nombre pour un calcul ; une erreur #VALEUR! qui dit laquelle sinon */
    function toN(v, cell = '') {
        if (isErr(v)) return v;
        if (typeof v === 'number') return v;
        if (v == null || v === '') return 0;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v instanceof SDate) return v.serial;
        const n = toNum(v); if (n !== null) return n;
        return err('#VALEUR!', {text: String(v)}, cell);
    }
    const truthy = v => (typeof v === 'string' ? ['vrai', 'true', 'oui', '1'].includes(fold(v).trim()) : v instanceof SDate ? true : !!v);

    /* ═════════ Les dates des actes (C4) ═════════ */
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MONTH_KEYS = [['janv', 1], ['jan', 1], ['fevr', 2], ['fev', 2], ['feb', 2], ['mars', 3], ['mar', 3], ['avr', 4], ['apr', 4], ['mai', 5], ['may', 5], ['juin', 6], ['jun', 6], ['juil', 7], ['jul', 7], ['aout', 8], ['aug', 8], ['sept', 9], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12], ['7bre', 9], ['8bre', 10], ['9bre', 11], ['xbre', 12], ['10bre', 12]];
    const REP = ['vendemiaire', 'brumaire', 'frimaire', 'nivose', 'pluviose', 'ventose', 'germinal', 'floreal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'sansculottide'];
    const REP_FR = ['vendémiaire', 'brumaire', 'frimaire', 'nivôse', 'pluviôse', 'ventôse', 'germinal', 'floréal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'jour complémentaire'];
    const monthOf = w => { w = fold(w).replace(/\.$/, ''); if (/^\d{1,2}$/.test(w)) return Number(w); const k = MONTH_KEYS.find(([p]) => w.startsWith(p)); return k ? k[1] : 0; };
    const roman = s => { const m = String(s).toUpperCase(); if (/^\d+$/.test(m)) return Number(m); if (!/^[IVX]+$/.test(m)) return 0; const v = {I: 1, V: 5, X: 10}; let t = 0; for (let i = 0; i < m.length; i++) t += v[m[i]] < (v[m[i + 1]] || 0) ? -v[m[i]] : v[m[i]]; return t; };
    const toRoman = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'][n] || String(n);
    const dim = (m, y) => (m === 2 && y < 1583 ? (y % 4 === 0 ? 29 : 28) : new Date(Date.UTC(y, m, 0)).getUTCDate());
    /** an, mois (1–13), jour du calendrier républicain → {y, m, d} grégorien (années sextiles III, VII, XI) */
    function republicanToGregorian(an, mo, d) {
        let days = 0; for (let y = 1; y < an; y++) days += [3, 7, 11].includes(y) ? 366 : 365;
        const t = Date.UTC(1792, 8, 22) + (days + (mo - 1) * 30 + d - 1) * 864e5, dt = new Date(t);
        return {y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate()};
    }
    /** grégorien → républicain {an, mo, d} (ou null hors de l'an I à l'an XIV) */
    function gregorianToRepublican(y, m, d) {
        let t = (Date.UTC(y, m - 1, d) - Date.UTC(1792, 8, 22)) / 864e5; if (t < 0) return null;
        let an = 1; for (;;) { const len = [3, 7, 11].includes(an) ? 366 : 365; if (t < len) break; t -= len; an++; if (an > 14) return null; }
        return {an, mo: Math.floor(t / 30) + 1, d: (t % 30) + 1};
    }
    function oneDate(s) {
        s = s.trim().replace(/^(le|du|au)\s+/, '').replace(/\s+/g, ' '); let m;
        const day = (d, mo, y) => {
            if (mo < 1 || mo > 12) return {error: `mois impossible : ${mo}`};
            if (d < 1 || d > dim(mo, y)) return {error: `« ${d} ${MONTHS[mo - 1]} ${y} » : date impossible`};
            return {y, m: mo, d, prec: 'jour', label: `${d === 1 ? '1er' : d} ${MONTHS[mo - 1]} ${y}`};
        };
        if ((m = s.match(/^(?:(\d{1,2}|1er)\s+([a-z]+)\s+)?(?:de\s+l')?an\s+([ivx]+|\d{1,2})$/))) {
            const an = roman(m[3]); if (!an || an > 14) return {error: `an ${m[3].toUpperCase()} : le calendrier républicain va de l’an I à l’an XIV`};
            if (!m[2]) return {y: 1792 + an, prec: 'année', approx: true, label: `an ${toRoman(an)}`};
            const mi = REP.findIndex(x => x.startsWith(fold(m[2]).slice(0, 4))), d = m[1] === '1er' ? 1 : Number(m[1]);
            if (mi < 0) return null;
            if (d < 1 || d > (mi === 12 ? ([3, 7, 11].includes(an) ? 6 : 5) : 30)) return {error: `« ${d} ${REP_FR[mi]} an ${toRoman(an)} » : date impossible`};
            const g = republicanToGregorian(an, mi + 1, d);
            return {...g, prec: 'jour', label: `${d === 1 ? '1er' : d} ${REP_FR[mi]} an ${toRoman(an)}`, rep: true};
        }
        if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{3,4})$/))) return day(+m[1], +m[2], +m[3]);
        if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return day(+m[3], +m[2], +m[1]);
        if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) { const mo = +m[1]; if (mo < 1 || mo > 12) return {error: `mois impossible : ${mo}`}; return {y: +m[2], m: mo, prec: 'mois', label: `${MONTHS[mo - 1]} ${m[2]}`}; }
        if ((m = s.match(/^(1er|\d{1,2})\s+([a-z0-9]+\.?)\s+(\d{3,4})$/))) { const mo = monthOf(m[2]); if (!mo) return null; return day(m[1] === '1er' ? 1 : +m[1], mo, +m[3]); }
        if ((m = s.match(/^([a-z0-9]+\.?)\s+(\d{3,4})$/))) { const mo = monthOf(m[1]); if (!mo || /^\d+$/.test(m[1])) return null; return {y: +m[2], m: mo, prec: 'mois', label: `${MONTHS[mo - 1]} ${m[2]}`}; }
        if ((m = s.match(/^(\d{3,4})$/))) return {y: +m[1], prec: 'année', label: m[1]};
        return null;
    }
    /**
     * Une date écrite comme dans un acte → {y, m?, d?, prec, approx, label, kind} ; {error} si elle est impossible ; null si ce n'est pas une date.
     * prec : jour | mois | année ; kind : '' | vers | avant | après | entre. Dans l'app, la validation et le libellé viennent de
     * UI.readDate (C4) : un tableur dit exactement la même chose que les champs de date.
     */
    function readActDate(raw, {search = false} = {}) {
        if (raw == null || raw === '') return null;
        if (raw instanceof SDate) return {...serialYmd(raw.serial), prec: 'jour', approx: false, kind: '', label: toStr(raw)};
        if (typeof raw === 'number') return raw >= 1 && raw < 3000 && Number.isInteger(raw) ? {y: raw, prec: 'année', approx: false, kind: '', label: String(raw)} : null;
        let s = fold(raw).trim().replace(/\s+/g, ' ').replace(/,/g, ''); if (!s || s.length > 200) return null;
        let kind = '', m, d = null;
        if ((m = s.match(/^(?:entre|de|du)\s+(.+?)\s+(?:et|a|au|-)\s+(.+)$/))) {
            const a = oneDate(m[1]), b = oneDate(m[2]);
            if (a?.error) return a; if (b?.error) return b;
            if (a && b) { const y = Math.round((a.y + b.y) / 2); return {y, prec: 'année', approx: true, kind: 'entre', from: a, to: b, label: `entre ${a.label} et ${b.label}`}; }
        }
        if ((m = s.match(/^(vers|environ|env\.?|circa|ca\.?|c\.|~|≈)\s*(.+)$/))) { kind = 'vers'; s = m[2]; }
        else if ((m = s.match(/^(avant|av\.?)\s+(.+)$/))) { kind = 'avant'; s = m[2]; }
        else if ((m = s.match(/^(apres|ap\.?|depuis)\s+(.+)$/))) { kind = 'après'; s = m[2]; }
        d = oneDate(s);
        if (!d && search) { // dans une phrase : « baptisé le 3 frimaire an XII », « né à Auch le 7 mai 1925 »
            const pats = [/(?:\b(?:\d{1,2}|1er)\s+[a-z]+\s+)?\ban\s+(?:[ivx]+|\d{1,2})\b/, /\b(?:\d{1,2}|1er)\s+[a-z]+\.?\s+\d{3,4}\b/, /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{3,4}\b/, /\b[a-z]+\s+\d{4}\b/, /\b1[0-9]{3}\b|\b20[0-9]{2}\b/];
            for (const p of pats) { const x = s.match(p); if (x) { d = oneDate(x[0]); if (d) { if (!d.error && /^\d{4}$/.test(x[0]) && s.trim() !== x[0]) d = {...d, approx: true}; break; } } }
        }
        if (!d) return null;
        if (d.error) return d;
        const out = {...d, kind, approx: !!(d.approx || kind), label: kind ? `${kind} ${d.label}` : d.label};
        // dans l'app : même validation et même libellé que les champs de date (C4)
        const UI = typeof window !== 'undefined' ? window.LCNDA_UI : null;
        if (UI?.readDate && typeof raw === 'string' && !search) { try { const r = UI.readDate(raw); if (r && !r.ok && /impossible|futur|l’an 0/.test(r.text || '')) return {error: r.text}; if (r?.ok) out.label = r.label; } catch (_) {} }
        return out;
    }
    const actSerial = d => ymdSerial(d.y, d.m || 1, d.d || 1);
    /** l'âge en années entières entre deux dates d'acte */
    const yearsBetween = (a, b) => { let n = b.y - a.y; if (a.m && b.m && (b.m < a.m || (b.m === a.m && a.d && b.d && b.d < a.d))) n--; return n; };

    /* ═════════ Lecture des formules : jetons, puis arbre (sans eval) ═════════ */
    const OPS2 = ['<=', '>=', '<>'];
    const IDENT0 = /[A-Za-z_À-ɏ\\]/, IDENT = /[\w.À-ɏ\\]/;
    /** Le mode d'écriture d'une formule : 'fr' (« ; » entre les morceaux, virgule décimale) ou 'en' (« , » entre les morceaux) */
    function formulaMode(src) {
        let q = false, semi = false, commaIn = false, depth = 0;
        for (let i = 0; i < src.length; i++) { const ch = src[i]; if (ch === '"') q = !q; if (q) continue; if (ch === ';') semi = true; if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth > 0 && !(/\d/.test(src[i - 1] || '') && /\d/.test(src[i + 1] || ''))) commaIn = true; }
        return semi || !commaIn ? 'fr' : 'en';
    }
    /**
     * Découpe une formule (sans le « = ») en jetons {t, raw, …, pre} : num, str, bool, err, ref, rng, name, fn, op, sep, lp, rp.
     * pre = les espaces avant le jeton (pour réécrire la formule telle quelle).
     */
    function tokenize(src, mode = formulaMode(src)) {
        const out = []; let i = 0; const n = src.length;
        if (n > LIMITS.formula) throw err('#TROP!', 'la formule est trop longue');
        const refAt = (j, sheet) => { // une adresse, une plage, une colonne A:A ou une ligne 2:2
            const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?/.exec(src.slice(j, j + 40));
            const mc = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![\w(])/.exec(src.slice(j, j + 20));
            const mr = /^(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![\w.(])/.exec(src.slice(j, j + 20));
            if (m && !IDENT.test(src[j + m[0].length] || '') && src[j + m[0].length] !== '(' && src[j + m[0].length] !== '!') {
                const c0 = colNum(m[2]), r0 = Number(m[4]) - 1;
                if (c0 < 0 || c0 >= LIMITS.cols || r0 < 0 || r0 >= LIMITS.rows) return null;
                if (m[6]) { const c1 = colNum(m[6]), r1 = Number(m[8]) - 1; if (c1 < 0 || c1 >= LIMITS.cols || r1 < 0 || r1 >= LIMITS.rows) return null; return {len: m[0].length, tok: {t: 'rng', sheet, r0, c0, r1, c1, a: [!!m[1], !!m[3], !!m[5], !!m[7]]}}; }
                return {len: m[0].length, tok: {t: 'ref', sheet, r: r0, c: c0, a: [!!m[1], !!m[3]]}};
            }
            if (mc) { const c0 = colNum(mc[2]), c1 = colNum(mc[4]); if (c0 >= 0 && c1 >= 0) return {len: mc[0].length, tok: {t: 'rng', sheet, r0: 0, c0, r1: LIMITS.rows - 1, c1, whole: 'col', a: [!!mc[1], false, !!mc[3], false]}}; }
            if (mr) { const r0 = Number(mr[2]) - 1, r1 = Number(mr[4]) - 1; if (r0 >= 0 && r1 >= 0) return {len: mr[0].length, tok: {t: 'rng', sheet, r0, c0: 0, r1, c1: LIMITS.cols - 1, whole: 'row', a: [false, !!mr[1], false, !!mr[3]]}}; }
            return null;
        };
        while (i < n) {
            const s0 = i; while (i < n && /\s/.test(src[i])) i++;
            const pre = src.slice(s0, i); if (i >= n) break;
            if (out.length > LIMITS.tokens) throw err('#TROP!', 'la formule est trop longue');
            const ch = src[i], push = (tok, len) => { tok.pre = pre; tok.raw = src.slice(i, i + len); out.push(tok); i += len; };
            if (ch === '"') { let j = i + 1, v = ''; for (;;) { if (j >= n) throw err('#SYNTAXE!', {near: src.slice(i, i + 12), why: 'il manque un guillemet « " » à la fin d’un texte'}); if (src[j] === '"') { if (src[j + 1] === '"') { v += '"'; j += 2; continue; } break; } v += src[j++]; } push({t: 'str', v}, j + 1 - i); continue; }
            if (ch === "'") { // 'Ma feuille'!A1
                let j = i + 1, name = ''; for (;;) { if (j >= n) throw err('#SYNTAXE!', {near: src.slice(i, i + 12), why: 'il manque une apostrophe à la fin du nom de feuille'}); if (src[j] === "'") { if (src[j + 1] === "'") { name += "'"; j += 2; continue; } break; } name += src[j++]; }
                if (src[j + 1] !== '!') throw err('#SYNTAXE!', {near: src.slice(i, j + 2), why: 'après le nom de la feuille, il faut « ! » puis la cellule'});
                const r = refAt(j + 2, name); if (!r) throw err('#REF!', {what: src.slice(i, j + 8)});
                push(r.tok, j + 2 - i + r.len); continue;
            }
            if (ch === '#') { const m = /^#(N\/A|NA|DIV\/0!|VALEUR!|VALUE!|REF!|NOM\?|NAME\?|NOMBRE!|NUM!|NULL!|BOUCLE!|DATE\?)/i.exec(src.slice(i, i + 10)); if (m) { push({t: 'err', v: m[0].toUpperCase()}, m[0].length); continue; } throw err('#SYNTAXE!', {near: src.slice(i, i + 8)}); }
            if (ch === '$' || IDENT0.test(ch)) {
                const r = refAt(i, null); if (r) { push(r.tok, r.len); continue; }
                let j = i; if (ch === '$') throw err('#SYNTAXE!', {near: src.slice(i, i + 8)});
                while (j < n && IDENT.test(src[j])) j++;
                const word = src.slice(i, j);
                if (src[j] === '!') { const rr = refAt(j + 1, word); if (!rr) throw err('#REF!', {what: src.slice(i, j + 8)}); push(rr.tok, j + 1 - i + rr.len); continue; }
                let k = j; while (k < n && src[k] === ' ') k++;
                if (src[k] === '(') { push({t: 'fn', v: word}, j - i); continue; }
                if (/^(vrai|faux|true|false)$/i.test(word)) { push({t: 'bool', v: /^(vrai|true)$/i.test(word)}, j - i); continue; }
                push({t: 'name', v: word}, j - i); continue;
            }
            if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] || '')) || (ch === ',' && mode === 'fr' && /\d/.test(src[i + 1] || '') && !/[\w)]/.test(src[i - 1] || ''))) {
                const rr = refAt(i, null); if (rr && rr.tok.whole === 'row') { push(rr.tok, rr.len); continue; }
                const m = (mode === 'fr' ? /^\d*(?:[.,]\d+)?(?:[eE][-+]?\d+)?/ : /^\d*(?:\.\d+)?(?:[eE][-+]?\d+)?/).exec(src.slice(i, i + 40));
                const v = Number(m[0].replace(',', '.')); if (!Number.isFinite(v)) throw err('#SYNTAXE!', {near: m[0]});
                push({t: 'num', v}, m[0].length); continue;
            }
            const two = src.slice(i, i + 2);
            if (OPS2.includes(two)) { push({t: 'op', v: two}, 2); continue; }
            if ('+-*/^&=<>%'.includes(ch)) { push({t: 'op', v: ch}, 1); continue; }
            if (ch === '(') { push({t: 'lp'}, 1); continue; }
            if (ch === ')') { push({t: 'rp'}, 1); continue; }
            if (ch === ';' || (ch === ',' && mode === 'en')) { push({t: 'sep'}, 1); continue; }
            if (ch === ',') { push({t: 'sep'}, 1); continue; } // une virgule seule entre deux morceaux, même en français
            throw err('#SYNTAXE!', {near: src.slice(i, i + 8), why: `le signe « ${ch} » n’a pas sa place ici`});
        }
        return out;
    }
    /** jetons → arbre (profondeur bornée) */
    function parseTokens(toks) {
        let i = 0, depth = 0;
        const peek = () => toks[i], next = () => toks[i++];
        const isOp = v => toks[i]?.t === 'op' && toks[i].v === v;
        const deeper = () => { if (++depth > LIMITS.depth) throw err('#TROP!', 'la formule est trop imbriquée'); };
        function primary() {
            const t = next();
            if (!t) throw err('#SYNTAXE!', {why: 'la formule s’arrête trop tôt'});
            if (t.t === 'num') return {k: 'n', v: t.v};
            if (t.t === 'str') return {k: 's', v: t.v};
            if (t.t === 'bool') return {k: 'b', v: t.v};
            if (t.t === 'err') return {k: 'e', v: t.v};
            if (t.t === 'ref') return {k: 'ref', sheet: t.sheet, r: t.r, c: t.c, raw: t.raw};
            if (t.t === 'rng') return {k: 'rng', sheet: t.sheet, r0: Math.min(t.r0, t.r1), c0: Math.min(t.c0, t.c1), r1: Math.max(t.r0, t.r1), c1: Math.max(t.c0, t.c1), whole: t.whole, raw: t.raw};
            if (t.t === 'name') return {k: 'name', v: t.v};
            if (t.t === 'lp') { deeper(); const e = expr(); depth--; if (peek()?.t !== 'rp') throw err('#SYNTAXE!', {why: 'il manque une parenthèse « ) »'}); next(); return e; }
            if (t.t === 'fn') {
                if (peek()?.t !== 'lp') throw err('#SYNTAXE!', {near: t.v}); next(); deeper();
                const args = [];
                if (peek()?.t !== 'rp') for (;;) {
                    if (peek()?.t === 'sep') { args.push({k: 'empty'}); next(); continue; }
                    if (peek()?.t === 'rp') { args.push({k: 'empty'}); break; }
                    args.push(expr());
                    if (peek()?.t === 'sep') { next(); if (peek()?.t === 'rp') { args.push({k: 'empty'}); break; } continue; }
                    break;
                }
                if (peek()?.t !== 'rp') throw err('#SYNTAXE!', {why: `il manque une parenthèse « ) » après ${t.v.toUpperCase()}(…`});
                next(); depth--;
                if (args.length > 255) throw err('#TROP!', 'trop de morceaux dans une fonction');
                return {k: 'fn', name: t.v, args};
            }
            if (t.t === 'op' && (t.v === '-' || t.v === '+')) { deeper(); const a = unary(); depth--; return t.v === '-' ? {k: 'neg', a} : a; }
            if (t.t === 'rp') throw err('#SYNTAXE!', {why: 'une parenthèse « ) » de trop'});
            if (t.t === 'sep') throw err('#SYNTAXE!', {why: 'un « ; » à une place inattendue'});
            throw err('#SYNTAXE!', {near: t.raw || t.v});
        }
        function postfix() { let a = primary(); while (isOp('%')) { next(); a = {k: 'pct', a}; } return a; }
        function unary() { if (isOp('-') || isOp('+')) { const op = next().v; deeper(); const a = unary(); depth--; return op === '-' ? {k: 'neg', a} : a; } return postfix(); }
        function pow() { let a = unary(); while (isOp('^')) { next(); a = {k: 'op', op: '^', a, b: unary()}; } return a; }
        function mul() { let a = pow(); while (isOp('*') || isOp('/')) { const op = next().v; a = {k: 'op', op, a, b: pow()}; } return a; }
        function add() { let a = mul(); while (isOp('+') || isOp('-')) { const op = next().v; a = {k: 'op', op, a, b: mul()}; } return a; }
        function cat() { let a = add(); while (isOp('&')) { next(); a = {k: 'op', op: '&', a, b: add()}; } return a; }
        function expr() { let a = cat(); while (peek()?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const op = next().v; a = {k: 'op', op, a, b: cat()}; } return a; }
        const ast = expr();
        if (i < toks.length) { const t = toks[i]; throw err('#SYNTAXE!', t.t === 'rp' ? {why: 'une parenthèse « ) » de trop'} : {near: t.raw || String(t.v ?? '')}); }
        return ast;
    }
    /** « =SOMME(A1:A3) » → arbre ; garde une erreur de lecture comme un nœud erreur (la cellule montrera l'explication) */
    function parseFormula(f) {
        const src = String(f).replace(/^=/, '');
        try { return parseTokens(tokenize(src)); } catch (e) { if (isErr(e)) return {k: 'perr', err: e}; throw e; }
    }

    /* ═════════ Les fonctions (nom français ; le nom anglais est accepté aussi) ═════════ */
    const isMat = v => v && typeof v === 'object' && typeof v.values === 'function' && 'h' in v;
    /** tous les morceaux, plages et tableaux mis à plat */
    const flat = args => { const o = []; for (const a of args) { if (isMat(a)) { for (const v of a.values()) o.push(v); } else o.push(a); } return o; };
    /** les nombres : dans une plage, le texte est ignoré ; un morceau tapé doit être un nombre */
    function nums(args) {
        const out = [];
        for (const a of args) {
            if (a === undefined) continue;
            if (isMat(a)) { for (const v of a.values()) { if (isErr(v)) return v; if (typeof v === 'number') out.push(v); else if (v instanceof SDate) out.push(v.serial); } }
            else { if (a === null) continue; const n = toN(a); if (isErr(n)) return n; out.push(n); }
        }
        return out;
    }
    const firstErr = arr => arr.find(isErr);
    const mat = a => (isMat(a) ? a : new SArr([[a ?? null]]));
    const need = (n, k) => { if (isErr(n)) throw n; return n; };
    const num = (v, cell) => need(toN(v, cell));
    const int = v => Math.trunc(num(v));
    /** un critère de NB.SI, SOMME.SI… : ">60", "<>laboureur", "lab*", 12 */
    function crit(c) {
        if (typeof c === 'number' || typeof c === 'boolean') return v => (typeof v === 'number' || typeof v === 'boolean' ? v === c : toNum(v) === c);
        const s = toStr(c), m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s), op = m[1] || '=', t = m[2], n = toNum(t);
        const wild = /[*?]/.test(t) ? new RegExp('^' + fold(t).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null;
        return v => {
            if (isErr(v)) return false;
            const vn = typeof v === 'number' ? v : v instanceof SDate ? v.serial : null;
            if (n !== null && vn !== null) return {'=': vn === n, '<>': vn !== n, '<': vn < n, '>': vn > n, '<=': vn <= n, '>=': vn >= n}[op];
            if (n !== null && ['<', '>', '<=', '>='].includes(op)) return false;
            const a = fold(toStr(v)), b = fold(t);
            if (op === '=' || op === '<>') { const eq = wild ? wild.test(a) : a === b; return op === '=' ? (t === '' ? v == null || v === '' : eq) : !eq; }
            return {'<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b}[op];
        };
    }
    const cmpVals = (a, b) => { // tri : nombres d'abord, puis textes (sans accents), puis vides
        const an = typeof a === 'number' ? a : a instanceof SDate ? a.serial : null, bn = typeof b === 'number' ? b : b instanceof SDate ? b.serial : null;
        if (a == null || a === '') return b == null || b === '' ? 0 : 1; if (b == null || b === '') return -1;
        if (an !== null && bn !== null) return an - bn; if (an !== null) return -1; if (bn !== null) return 1;
        return fold(toStr(a)).localeCompare(fold(toStr(b)), 'fr', {numeric: true});
    };
    const eqVals = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a === b : fold(toStr(a)) === fold(toStr(b)));
    const roundTo = (x, d, mode) => { const k = 10 ** d, y = x * k, e = 1e-9; const r = mode === 'down' ? Math.trunc(y) : mode === 'up' ? (y < 0 ? -Math.ceil(-y - e) : Math.ceil(y - e)) : Math.sign(y) * Math.round(Math.abs(y) + e); return r / k; };
    /** une date d'acte pour une fonction de date ; ≈ notée si elle est approximative */
    const needDate = (v, ctx, what = 'la date') => {
        if (isErr(v)) throw v;
        if (v == null || v === '') throw err('#DATE?', {text: '', what});
        const d = readActDate(v);
        if (!d) throw err('#DATE?', {text: toStr(v), what});
        if (d.error) throw err('#DATE?', {text: toStr(v), why: d.error});
        if (d.approx) ctx.approx = true;
        return d;
    };
    const sosaN = v => { const n = num(v); if (!(n >= 1) || !Number.isInteger(n)) throw err('#VALEUR!', {why: 'un numéro Sosa est un nombre entier qui commence à 1'}); return n; };
    const today = ctx => { const d = ctx.now(); return {y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), prec: 'jour'}; };
    const textFmt = (v, f) => { // TEXTE(valeur; "0,00") : les formats les plus courants
        const F = String(f || ''), fl = fold(F);
        if (/[jdmay]/i.test(F) && !/^[#0,. %€]+$/.test(F)) {
            const d = v instanceof SDate ? serialYmd(v.serial) : typeof v === 'number' ? serialYmd(v) : readActDate(v); if (!d || d.error) return toStr(v);
            const p = n => String(n).padStart(2, '0');
            return fl.replace(/aaaa|yyyy/g, d.y).replace(/aa|yy/g, String(d.y).slice(-2)).replace(/mmmm/g, MONTHS[(d.m || 1) - 1]).replace(/mm/g, p(d.m || 1)).replace(/jj|dd/g, p(d.d || 1));
        }
        const n = toNum(v); if (n === null) return toStr(v);
        const dec = (F.split(/[.,]/)[1] || '').replace(/[^0#]/g, '').length, pct = F.includes('%'), x = pct ? n * 100 : n;
        return fmtFr(x, {minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: /#\s|\s0|# /.test(F)}) + (pct ? ' %' : '') + (F.includes('€') ? ' €' : '');
    };
    /* La liste : [famille, signature, ce que ça fait, nom anglais (ou ''), fonction(args, ctx), paresseuse ?] */
    const FN = {};
    const def = (name, fam, sig, desc, en, f, o = {}) => { FN[name] = {name, fam, sig, desc, en, f, ...o}; };
    // Calcul
    def('SOMME', 'Calcul', 'SOMME(nombre1; [nombre2]; …)', 'Additionne des nombres ou des plages.', 'SUM', a => { const n = nums(a); return isErr(n) ? n : n.reduce((s, x) => s + x, 0); });
    def('MOYENNE', 'Calcul', 'MOYENNE(nombre1; [nombre2]; …)', 'La moyenne des nombres.', 'AVERAGE', a => { const n = nums(a); if (isErr(n)) return n; return n.length ? n.reduce((s, x) => s + x, 0) / n.length : err('#DIV/0!', {why: 'il n’y a aucun nombre dans la plage'}); });
    def('MIN', 'Calcul', 'MIN(nombre1; …)', 'Le plus petit nombre.', 'MIN', a => { const n = nums(a); return isErr(n) ? n : n.length ? n.reduce((m, x) => Math.min(m, x), Infinity) : 0; });
    def('MAX', 'Calcul', 'MAX(nombre1; …)', 'Le plus grand nombre.', 'MAX', a => { const n = nums(a); return isErr(n) ? n : n.length ? n.reduce((m, x) => Math.max(m, x), -Infinity) : 0; });
    def('NB', 'Calcul', 'NB(valeur1; …)', 'Compte les cellules qui contiennent un nombre.', 'COUNT', a => flat(a).filter(v => typeof v === 'number' || v instanceof SDate).length);
    def('NBVAL', 'Calcul', 'NBVAL(valeur1; …)', 'Compte les cellules qui ne sont pas vides.', 'COUNTA', a => flat(a).filter(v => v !== null && v !== '').length);
    def('NB.VIDE', 'Calcul', 'NB.VIDE(plage)', 'Compte les cellules vides.', 'COUNTBLANK', a => flat(a).filter(v => v === null || v === '').length);
    def('PRODUIT', 'Calcul', 'PRODUIT(nombre1; …)', 'Multiplie des nombres.', 'PRODUCT', a => { const n = nums(a); return isErr(n) ? n : n.reduce((s, x) => s * x, 1); });
    def('ARRONDI', 'Calcul', 'ARRONDI(nombre; [décimales])', 'Arrondit au plus proche.', 'ROUND', a => roundTo(num(a[0]), a[1] == null ? 0 : int(a[1])));
    def('ARRONDI.INF', 'Calcul', 'ARRONDI.INF(nombre; [décimales])', 'Arrondit vers zéro.', 'ROUNDDOWN', a => roundTo(num(a[0]), a[1] == null ? 0 : int(a[1]), 'down'));
    def('ARRONDI.SUP', 'Calcul', 'ARRONDI.SUP(nombre; [décimales])', 'Arrondit en s’éloignant de zéro.', 'ROUNDUP', a => roundTo(num(a[0]), a[1] == null ? 0 : int(a[1]), 'up'));
    def('ENT', 'Calcul', 'ENT(nombre)', 'La partie entière (arrondi vers le bas).', 'INT', a => Math.floor(num(a[0])));
    def('ABS', 'Calcul', 'ABS(nombre)', 'Le nombre sans son signe.', 'ABS', a => Math.abs(num(a[0])));
    def('MOD', 'Calcul', 'MOD(nombre; diviseur)', 'Le reste d’une division.', 'MOD', a => { const x = num(a[0]), y = num(a[1]); if (!y) return err('#DIV/0!', {why: 'le diviseur de MOD vaut 0'}); return x - y * Math.floor(x / y); });
    def('PUISSANCE', 'Calcul', 'PUISSANCE(nombre; puissance)', 'Un nombre élevé à une puissance.', 'POWER', a => num(a[0]) ** num(a[1]));
    def('RACINE', 'Calcul', 'RACINE(nombre)', 'La racine carrée.', 'SQRT', a => { const x = num(a[0]); return x < 0 ? err('#NOMBRE!', {why: 'pas de racine carrée d’un nombre négatif'}) : Math.sqrt(x); });
    def('MEDIANE', 'Calcul', 'MEDIANE(nombre1; …)', 'La valeur du milieu.', 'MEDIAN', a => { const n = nums(a); if (isErr(n)) return n; if (!n.length) return err('#NOMBRE!', {why: 'aucun nombre'}); n.sort((x, y) => x - y); const k = n.length >> 1; return n.length % 2 ? n[k] : (n[k - 1] + n[k]) / 2; });
    def('ECARTYPE', 'Calcul', 'ECARTYPE(nombre1; …)', 'L’écart type (sur un échantillon).', 'STDEV', a => { const n = nums(a); if (isErr(n)) return n; if (n.length < 2) return err('#DIV/0!', {why: 'il faut au moins deux nombres'}); const m = n.reduce((s, x) => s + x, 0) / n.length; return Math.sqrt(n.reduce((s, x) => s + (x - m) ** 2, 0) / (n.length - 1)); });
    def('RANG', 'Calcul', 'RANG(nombre; plage; [ordre])', 'La place d’un nombre dans une liste (1 = le plus grand ; ordre 1 = le plus petit d’abord).', 'RANK', a => { const x = num(a[0]), n = nums([mat(a[1])]); if (isErr(n)) return n; if (!n.includes(x)) return err('#N/A', {what: toStr(x), where: 'la liste'}); const asc = a[2] != null && truthy(a[2]) && num(a[2]) !== 0; return n.filter(y => (asc ? y < x : y > x)).length + 1; });
    def('GRANDE.VALEUR', 'Calcul', 'GRANDE.VALEUR(plage; k)', 'La k-ième plus grande valeur.', 'LARGE', a => { const n = nums([mat(a[0])]), k = int(a[1]); if (isErr(n)) return n; if (k < 1 || k > n.length) return err('#NOMBRE!', {why: `k doit aller de 1 à ${n.length}`}); return n.sort((x, y) => y - x)[k - 1]; });
    def('PETITE.VALEUR', 'Calcul', 'PETITE.VALEUR(plage; k)', 'La k-ième plus petite valeur.', 'SMALL', a => { const n = nums([mat(a[0])]), k = int(a[1]); if (isErr(n)) return n; if (k < 1 || k > n.length) return err('#NOMBRE!', {why: `k doit aller de 1 à ${n.length}`}); return n.sort((x, y) => x - y)[k - 1]; });
    // Conditions
    def('SI', 'Conditions', 'SI(test; si_vrai; [si_faux])', 'Une valeur si le test est vrai, une autre sinon.', 'IF', (a, ctx) => { const t = a[0](); if (isErr(t)) return t; return truthy(t) ? (a[1] ? a[1]() : true) : (a[2] ? a[2]() : false); }, {lazy: true});
    def('SI.CONDITIONS', 'Conditions', 'SI.CONDITIONS(test1; valeur1; [test2; valeur2]; …)', 'La valeur du premier test vrai.', 'IFS', a => { for (let i = 0; i + 1 < a.length; i += 2) { const t = a[i](); if (isErr(t)) return t; if (truthy(t)) return a[i + 1](); } return err('#N/A', {why: 'aucun test n’est vrai'}); }, {lazy: true});
    def('SI.ERREUR', 'Conditions', 'SI.ERREUR(valeur; si_erreur)', 'La valeur, ou autre chose s’il y a une erreur.', 'IFERROR', a => { const v = a[0](); return isErr(v) ? (a[1] ? a[1]() : '') : v; }, {lazy: true, alias: ['SIERREUR']});
    def('SI.NON.DISP', 'Conditions', 'SI.NON.DISP(valeur; si_absent)', 'La valeur, ou autre chose si elle n’est pas trouvée (#N/A).', 'IFNA', a => { const v = a[0](); return isErr(v) && v.code === '#N/A' ? (a[1] ? a[1]() : '') : v; }, {lazy: true});
    def('ET', 'Conditions', 'ET(test1; test2; …)', 'VRAI si tous les tests sont vrais.', 'AND', a => { const f = flat(a), e = firstErr(f); return e || f.filter(v => v !== null).every(truthy); });
    def('OU', 'Conditions', 'OU(test1; test2; …)', 'VRAI si au moins un test est vrai.', 'OR', a => { const f = flat(a), e = firstErr(f); return e || f.some(truthy); });
    def('NON', 'Conditions', 'NON(test)', 'Inverse un test.', 'NOT', a => (isErr(a[0]) ? a[0] : !truthy(a[0])));
    def('NB.SI', 'Conditions', 'NB.SI(plage; critère)', 'Compte les cellules qui remplissent une condition (">60", "laboureur", "lab*").', 'COUNTIF', a => { const f = crit(a[1]); return mat(a[0]).values().filter(f).length; });
    def('NB.SI.ENS', 'Conditions', 'NB.SI.ENS(plage1; critère1; [plage2; critère2]; …)', 'Compte les lignes qui remplissent toutes les conditions.', 'COUNTIFS', a => { const ps = []; for (let i = 0; i + 1 < a.length; i += 2) ps.push([mat(a[i]).values(), crit(a[i + 1])]); if (!ps.length) return 0; const n = ps[0][0].length; if (ps.some(p => p[0].length !== n)) return err('#VALEUR!', {why: 'les plages n’ont pas la même taille'}); let k = 0; for (let i = 0; i < n; i++) if (ps.every(([v, f]) => f(v[i]))) k++; return k; });
    def('SOMME.SI', 'Conditions', 'SOMME.SI(plage; critère; [plage_somme])', 'Additionne les cellules qui remplissent une condition.', 'SUMIF', a => { const f = crit(a[1]), k = mat(a[0]).values(), s = mat(a[2] ?? a[0]).values(); let t = 0; k.forEach((v, i) => { if (f(v) && typeof s[i] === 'number') t += s[i]; }); return t; });
    def('SOMME.SI.ENS', 'Conditions', 'SOMME.SI.ENS(plage_somme; plage1; critère1; …)', 'Additionne les lignes qui remplissent toutes les conditions.', 'SUMIFS', a => { const s = mat(a[0]).values(), ps = []; for (let i = 1; i + 1 < a.length; i += 2) ps.push([mat(a[i]).values(), crit(a[i + 1])]); if (ps.some(p => p[0].length !== s.length)) return err('#VALEUR!', {why: 'les plages n’ont pas la même taille'}); let t = 0; s.forEach((v, i) => { if (typeof v === 'number' && ps.every(([w, f]) => f(w[i]))) t += v; }); return t; });
    def('MOYENNE.SI', 'Conditions', 'MOYENNE.SI(plage; critère; [plage_moyenne])', 'La moyenne des cellules qui remplissent une condition.', 'AVERAGEIF', a => { const f = crit(a[1]), k = mat(a[0]).values(), s = mat(a[2] ?? a[0]).values(); let t = 0, n = 0; k.forEach((v, i) => { if (f(v) && typeof s[i] === 'number') { t += s[i]; n++; } }); return n ? t / n : err('#DIV/0!', {why: 'aucune cellule ne remplit la condition'}); });
    // Chercher
    def('RECHERCHEV', 'Chercher', 'RECHERCHEV(valeur; tableau; n°_colonne; [proche])', 'Cherche dans la 1re colonne d’un tableau et rend la valeur d’une autre colonne.', 'VLOOKUP', a => { const t = a[1]; if (!isMat(t)) return err('#VALEUR!', {why: 'le 2e morceau doit être une plage, par exemple A2:C40'}); const col = int(a[2]); if (col < 1 || col > t.w) return err('#REF!', {what: `la colonne ${col} du tableau (il en a ${t.w})`}); const exact = a[3] != null && !truthy(a[3]); let best = -1; for (let i = 0; i < t.h; i++) { const v = t.get(i, 0); if (eqVals(v, a[0])) return t.get(i, col - 1); if (!exact && typeof a[0] === 'number' && typeof v === 'number' && v <= a[0]) best = i; } return best >= 0 ? t.get(best, col - 1) : err('#N/A', {what: toStr(a[0]), fn: 'RECHERCHEV'}); });
    def('RECHERCHEH', 'Chercher', 'RECHERCHEH(valeur; tableau; n°_ligne; [proche])', 'Cherche dans la 1re ligne d’un tableau.', 'HLOOKUP', a => { const t = a[1]; if (!isMat(t)) return err('#VALEUR!', {why: 'le 2e morceau doit être une plage'}); const row = int(a[2]); if (row < 1 || row > t.h) return err('#REF!', {what: `la ligne ${row} du tableau`}); for (let j = 0; j < t.w; j++) if (eqVals(t.get(0, j), a[0])) return t.get(row - 1, j); return err('#N/A', {what: toStr(a[0]), fn: 'RECHERCHEH'}); });
    def('RECHERCHEX', 'Chercher', 'RECHERCHEX(valeur; où_chercher; quoi_rendre; [si_absent])', 'Cherche une valeur et rend celle d’à côté.', 'XLOOKUP', a => { const k = mat(a[1]).values(), r = mat(a[2]); const i = k.findIndex(x => eqVals(x, a[0])); if (i < 0) return a[3] !== undefined && a[3] !== null ? a[3] : err('#N/A', {what: toStr(a[0]), fn: 'RECHERCHEX'}); return r.w === 1 || r.h === 1 ? r.values()[i] ?? null : new SArr([Array.from({length: r.w}, (_, j) => r.get(i, j))]); });
    def('INDEX', 'Chercher', 'INDEX(plage; ligne; [colonne])', 'La valeur à une ligne et une colonne de la plage.', 'INDEX', a => { const t = mat(a[0]); let r = a[1] == null ? 0 : int(a[1]), c = a[2] == null ? 0 : int(a[2]); if (t.h === 1 && a[2] == null && r) { c = r; r = 1; } if (!r) r = 1; if (!c) c = 1; if (r < 1 || r > t.h || c < 1 || c > t.w) return err('#REF!', {what: `la ligne ${r}, colonne ${c} de la plage (${t.h} × ${t.w})`}); return t.get(r - 1, c - 1); });
    def('EQUIV', 'Chercher', 'EQUIV(valeur; plage; [type])', 'La position d’une valeur dans une plage (type 0 = exactement).', 'MATCH', a => { const v = mat(a[1]).values(), ty = a[2] == null ? 1 : int(a[2]); if (ty === 0) { const f = typeof a[0] === 'string' && /[*?]/.test(a[0]) ? crit(a[0]) : x => eqVals(x, a[0]); const i = v.findIndex(f); return i >= 0 ? i + 1 : err('#N/A', {what: toStr(a[0]), fn: 'EQUIV'}); } let best = -1; v.forEach((x, i) => { const c = cmpVals(x, a[0]); if (ty > 0 ? c <= 0 : c >= 0) best = i; }); return best >= 0 ? best + 1 : err('#N/A', {what: toStr(a[0]), fn: 'EQUIV'}); });
    def('CHOISIR', 'Chercher', 'CHOISIR(n°; valeur1; valeur2; …)', 'La n-ième valeur de la liste.', 'CHOOSE', a => { const i = int(a[0]); return i >= 1 && i < a.length ? a[i] : err('#VALEUR!', {why: `il n’y a pas de valeur n° ${i}`}); });
    def('UNIQUE', 'Chercher', 'UNIQUE(plage)', 'Les valeurs sans doublons (déborde sur les cases du dessous).', 'UNIQUE', a => { const t = mat(a[0]), seen = new Set(), rows = []; for (let i = 0; i < t.h; i++) { const row = Array.from({length: t.w}, (_, j) => t.get(i, j)); if (row.every(v => v == null || v === '')) continue; const k = row.map(v => fold(toStr(v))).join('\u0001'); if (!seen.has(k)) { seen.add(k); rows.push(row); } } return rows.length ? new SArr(rows) : err('#N/A', {why: 'la plage est vide'}); });
    def('TRIER', 'Chercher', 'TRIER(plage; [n°_colonne]; [ordre])', 'La plage triée (ordre 1 = croissant, -1 = décroissant).', 'SORT', a => { const t = mat(a[0]), col = a[1] == null ? 1 : int(a[1]), ord = a[2] == null ? 1 : num(a[2]); if (col < 1 || col > t.w) return err('#VALEUR!', {why: `la plage n’a pas de colonne ${col}`}); const rows = Array.from({length: t.h}, (_, i) => Array.from({length: t.w}, (_, j) => t.get(i, j))); rows.sort((x, y) => cmpVals(x[col - 1], y[col - 1]) * (ord < 0 ? -1 : 1)); return new SArr(rows); });
    def('FILTRE', 'Chercher', 'FILTRE(plage; condition; [si_vide])', 'Les lignes de la plage qui remplissent la condition (ex. =FILTRE(A2:C9; C2:C9>30)).', 'FILTER', a => { const t = mat(a[0]), c = mat(a[1]).values(); if (c.length !== t.h) return err('#VALEUR!', {why: 'la condition doit avoir autant de lignes que la plage'}); const rows = []; for (let i = 0; i < t.h; i++) if (!isErr(c[i]) && truthy(c[i])) rows.push(Array.from({length: t.w}, (_, j) => t.get(i, j))); return rows.length ? new SArr(rows) : a[2] !== undefined && a[2] !== null ? a[2] : err('#N/A', {why: 'aucune ligne ne remplit la condition'}); });
    // Texte
    const S1 = v => { if (isErr(v)) throw v; return toStr(v); };
    def('CONCAT', 'Texte', 'CONCAT(texte1; texte2; …)', 'Met des textes bout à bout.', 'CONCAT', a => { const f = flat(a), e = firstErr(f); return e || f.map(toStr).join(''); });
    def('CONCATENER', 'Texte', 'CONCATENER(texte1; texte2; …)', 'Met des textes bout à bout.', 'CONCATENATE', a => { const f = flat(a), e = firstErr(f); return e || f.map(toStr).join(''); });
    def('JOINDRE.TEXTE', 'Texte', 'JOINDRE.TEXTE(séparateur; ignorer_vides; texte1; …)', 'Met des textes bout à bout avec un séparateur.', 'TEXTJOIN', a => { const sep = S1(a[0]), skip = a[1] == null ? true : truthy(a[1]), f = flat(a.slice(2)), e = firstErr(f); return e || f.filter(v => !skip || (v !== null && v !== '')).map(toStr).join(sep); });
    def('GAUCHE', 'Texte', 'GAUCHE(texte; [nb])', 'Les premiers caractères.', 'LEFT', a => [...S1(a[0])].slice(0, a[1] == null ? 1 : Math.max(0, int(a[1]))).join(''));
    def('DROITE', 'Texte', 'DROITE(texte; [nb])', 'Les derniers caractères.', 'RIGHT', a => { const s = [...S1(a[0])], n = a[1] == null ? 1 : Math.max(0, int(a[1])); return n ? s.slice(-n).join('') : ''; });
    def('STXT', 'Texte', 'STXT(texte; début; nb)', 'Un morceau au milieu d’un texte.', 'MID', a => { const st = int(a[1]); if (st < 1) return err('#VALEUR!', {why: 'le début compte à partir de 1'}); return [...S1(a[0])].slice(st - 1, st - 1 + Math.max(0, int(a[2]))).join(''); });
    def('NBCAR', 'Texte', 'NBCAR(texte)', 'Le nombre de caractères.', 'LEN', a => [...S1(a[0])].length);
    def('MAJUSCULE', 'Texte', 'MAJUSCULE(texte)', 'En capitales.', 'UPPER', a => S1(a[0]).toLocaleUpperCase('fr'));
    def('MINUSCULE', 'Texte', 'MINUSCULE(texte)', 'En minuscules.', 'LOWER', a => S1(a[0]).toLocaleLowerCase('fr'));
    def('NOMPROPRE', 'Texte', 'NOMPROPRE(texte)', 'Une capitale au début de chaque mot.', 'PROPER', a => S1(a[0]).toLocaleLowerCase('fr').replace(/(^|[\s\-'’])(\p{L})/gu, (m, p, l) => p + l.toLocaleUpperCase('fr')));
    def('SUPPRESPACE', 'Texte', 'SUPPRESPACE(texte)', 'Retire les espaces en trop.', 'TRIM', a => S1(a[0]).replace(/\s+/g, ' ').trim());
    def('SUBSTITUE', 'Texte', 'SUBSTITUE(texte; ancien; nouveau; [n°])', 'Remplace un morceau de texte.', 'SUBSTITUTE', a => { const s = S1(a[0]), o = S1(a[1]), n = S1(a[2]); if (!o) return s; if (a[3] == null) return s.split(o).join(n); const k = int(a[3]); let i = -1; for (let j = 0; j < k; j++) { i = s.indexOf(o, i + 1); if (i < 0) return s; } return s.slice(0, i) + n + s.slice(i + o.length); });
    def('CHERCHE', 'Texte', 'CHERCHE(texte_cherché; texte; [début])', 'La position d’un texte dans un autre (sans tenir compte des capitales).', 'SEARCH', a => { const i = fold(S1(a[1])).indexOf(fold(S1(a[0])), (a[2] == null ? 1 : int(a[2])) - 1); return i >= 0 ? i + 1 : err('#VALEUR!', {why: `« ${S1(a[0])} » n’est pas dans le texte`}); });
    def('TEXTE', 'Texte', 'TEXTE(valeur; format)', 'Un nombre ou une date écrits avec un format ("0,00", "0 %", "jj/mm/aaaa").', 'TEXT', a => textFmt(a[0], S1(a[1])));
    def('CNUM', 'Texte', 'CNUM(texte)', 'Le nombre écrit dans un texte.', 'VALUE', a => { if (typeof a[0] === 'number') return a[0]; const n = toNum(a[0]); return n === null ? err('#VALEUR!', {text: toStr(a[0])}) : n; });
    // Dates
    def('DATE', 'Dates', 'DATE(année; mois; jour)', 'Fabrique une date.', 'DATE', a => new SDate(ymdSerial(int(a[0]), int(a[1]), int(a[2]))));
    def('ANNEE', 'Dates', 'ANNEE(date)', 'L’année d’une date (date d’acte comprise).', 'YEAR', (a, ctx) => needDate(a[0], ctx).y);
    def('MOIS', 'Dates', 'MOIS(date)', 'Le mois d’une date (1 à 12).', 'MONTH', (a, ctx) => { const d = needDate(a[0], ctx); return d.m || err('#DATE?', {text: toStr(a[0]), why: 'cette date n’a pas de mois'}); });
    def('JOUR', 'Dates', 'JOUR(date)', 'Le jour du mois.', 'DAY', (a, ctx) => { const d = needDate(a[0], ctx); return d.d || err('#DATE?', {text: toStr(a[0]), why: 'cette date n’a pas de jour'}); });
    def('JOURSEM', 'Dates', 'JOURSEM(date)', 'Le jour de la semaine (1 = dimanche).', 'WEEKDAY', (a, ctx) => { const d = needDate(a[0], ctx); if (!d.d) return err('#DATE?', {text: toStr(a[0]), why: 'il faut le jour'}); return (((actSerial(d) + 6) % 7) + 7) % 7 + 1; });
    def('AUJOURDHUI', 'Dates', 'AUJOURDHUI()', 'La date du jour.', 'TODAY', (a, ctx) => { const t = today(ctx); return new SDate(ymdSerial(t.y, t.m, t.d)); }, {volatile: true});
    def('MAINTENANT', 'Dates', 'MAINTENANT()', 'La date et l’heure.', 'NOW', (a, ctx) => { const d = ctx.now(); return new SDate(ymdSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400, true); }, {volatile: true});
    def('DATEDIF', 'Dates', 'DATEDIF(début; fin; "A"|"M"|"J")', 'L’écart entre deux dates, en années, mois ou jours.', 'DATEDIF', (a, ctx) => { const x = needDate(a[0], ctx, 'le début'), y = needDate(a[1], ctx, 'la fin'), u = fold(a[2] == null ? 'a' : S1(a[2])); if (actSerial(y) < actSerial(x)) return err('#NOMBRE!', {why: 'la fin est avant le début'}); if (u.startsWith('m')) return yearsBetween(x, y) * 12 + (((y.m || 1) - (x.m || 1) + 12) % 12) - ((y.d || 1) < (x.d || 1) ? 1 : 0) + (((y.m || 1) - (x.m || 1) + 12) % 12 === 0 && (y.d || 1) < (x.d || 1) ? 12 : 0); if (u.startsWith('j') || u.startsWith('d')) return actSerial(y) - actSerial(x); return yearsBetween(x, y); });
    // Généalogie
    def('AGE', 'Généalogie', 'AGE(naissance; [décès]; [unité])', 'L’âge entre deux dates d’acte (« vers 1784 », « an II » compris) ; « ≈ » si une date est approximative. Unité : « ans », « mois » ou « jours ».', '', (a, ctx) => {
        const x = needDate(a[0], ctx, 'la naissance'), y = a[1] == null || a[1] === '' ? today(ctx) : needDate(a[1], ctx, 'le décès'), u = fold(a[2] == null ? 'ans' : S1(a[2]));
        if (actSerial(y) < actSerial(x) && y.y < x.y) return err('#DATE?', {why: 'la seconde date est avant la première'});
        if (u.startsWith('j') || u.startsWith('d')) return actSerial(y) - actSerial(x);
        const n = yearsBetween(x, y); if (n < 0) return err('#DATE?', {why: 'la seconde date est avant la première'});
        if (u.startsWith('m')) return n * 12 + ((((y.m || 1) - (x.m || 1)) % 12) + 12) % 12;
        if (!(x.m && y.m)) ctx.approx = ctx.approx || !(x.prec === 'jour' && y.prec === 'jour') && (x.approx || y.approx);
        return n;
    });
    def('ANNEE.ACTE', 'Généalogie', 'ANNEE.ACTE(texte)', 'L’année trouvée dans un texte d’acte, même républicain (« baptisé le 3 frimaire an XII » → 1803).', '', (a, ctx) => { if (isErr(a[0])) return a[0]; const d = readActDate(a[0], {search: true}); if (!d) return err('#DATE?', {text: toStr(a[0])}); if (d.error) return err('#DATE?', {text: toStr(a[0]), why: d.error}); if (d.approx) ctx.approx = true; return d.y; });
    def('DATE.ACTE', 'Généalogie', 'DATE.ACTE(texte)', 'La date comprise, écrite proprement (comme « ✓ Compris : » des champs de date).', '', (a, ctx) => { const d = needDate(a[0], ctx); return d.label; });
    def('DATE.PRECISION', 'Généalogie', 'DATE.PRECISION(texte)', '« jour », « mois », « année », « vers », « avant », « après » ou « entre ».', '', (a, ctx) => { const d = needDate(a[0], ctx); return d.kind || d.prec; });
    def('REPUBLICAIN', 'Généalogie', 'REPUBLICAIN(date)', 'La date dans le calendrier républicain.', '', (a, ctx) => { const d = needDate(a[0], ctx); if (!d.d) return err('#DATE?', {why: 'il faut une date au jour près'}); const r = gregorianToRepublican(d.y, d.m, d.d); if (!r) return err('#DATE?', {why: 'le calendrier républicain va du 22 septembre 1792 à 1805'}); return `${r.d === 1 ? '1er' : r.d} ${REP_FR[r.mo - 1]} an ${toRoman(r.an)}`; });
    def('SOSA.GENERATION', 'Généalogie', 'SOSA.GENERATION(numéro)', 'La génération d’un numéro Sosa (1 = toi, 2 et 3 = tes parents…).', '', a => Math.floor(Math.log2(sosaN(a[0]))) + 1);
    def('SOSA.PERE', 'Généalogie', 'SOSA.PERE(numéro)', 'Le numéro Sosa du père (2 × n).', '', a => 2 * sosaN(a[0]));
    def('SOSA.MERE', 'Généalogie', 'SOSA.MERE(numéro)', 'Le numéro Sosa de la mère (2 × n + 1).', '', a => 2 * sosaN(a[0]) + 1);
    def('SOSA.COTE', 'Généalogie', 'SOSA.COTE(numéro)', '« paternel » ou « maternel » (le côté du Sosa 1).', '', a => { const n = sosaN(a[0]); if (n < 2) return 'toi'; const g = Math.floor(Math.log2(n)); return n < 3 * 2 ** (g - 1) ? 'paternel' : 'maternel'; });
    // les noms : français, anglais, et les écritures sans accent (« SIERREUR », « ANNÉE »)
    const ALIAS = {};
    Object.values(FN).forEach(f => { ALIAS[f.name] = f.name; ALIAS[fold(f.name).toUpperCase()] = f.name; if (f.en) ALIAS[f.en] = ALIAS[f.en] || f.name; (f.alias || []).forEach(x => { ALIAS[x] = f.name; }); });
    Object.assign(ALIAS, {AVG: 'MOYENNE', MOY: 'MOYENNE', 'ANNÉE': 'ANNEE', AUJOURD: 'AUJOURDHUI', 'CONCATENATE': 'CONCATENER', 'STDEV.S': 'ECARTYPE', 'ECARTYPE.STANDARD': 'ECARTYPE', 'RANK.EQ': 'RANG', 'EQUIVX': 'EQUIV'});
    const fnKey = name => { const u = String(name || '').toUpperCase().replace(/^(_XLFN\.)?(_XLWS\.)?/, '').replace(/^COM\.MICROSOFT\./, ''); return ALIAS[u] || ALIAS[fold(u).toUpperCase()] || null; };
    const lev = (a, b) => { if (Math.abs(a.length - b.length) > 3) return 9; const d = Array.from({length: a.length + 1}, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
    const suggest = name => { const u = fold(name).toUpperCase(); let best = null, bd = 3; Object.keys(FN).forEach(k => { const d = lev(u, fold(k).toUpperCase()); if (d < bd) { bd = d; best = k; } }); return best; };

    /* ═════════ Les erreurs, expliquées en français (avec la cellule en cause) ═════════ */
    const ERR_EN = {'#DIV/0!': '#DIV/0!', '#NOM?': '#NAME?', '#VALEUR!': '#VALUE!', '#REF!': '#REF!', '#N/A': '#N/A', '#NOMBRE!': '#NUM!', '#BOUCLE!': '#REF!', '#DATE?': '#VALUE!', '#SYNTAXE!': '#NAME?', '#DEBORD!': '#SPILL!', '#TROP!': '#NUM!'};
    function explain(e) {
        if (!isErr(e)) return '';
        const i = e.info || {}, at = e.cell ? ` (cellule ${e.cell})` : '';
        switch (e.code) {
            case '#DIV/0!': return i.ref ? `Tu divises par zéro : ${i.ref} est vide ou vaut 0. Astuce : =SI.ERREUR(…;"") laisse la case vide.` : `Tu divises par zéro${i.why ? ` : ${i.why}` : ''}. Astuce : =SI.ERREUR(…;"") laisse la case vide.`;
            case '#NOM?': return i.name ? `Je ne connais pas « ${i.name} ».${i.sugg ? ` Voulais-tu dire ${i.sugg} ?` : ' Tape les premières lettres : la liste des fonctions s’ouvre.'}` : 'Un nom inconnu dans la formule.';
            case '#VALEUR!': return i.text !== undefined ? `« ${i.text} » n’est pas un nombre${at} : on ne peut pas faire de calcul avec.` : `${i.why ? i.why.charAt(0).toUpperCase() + i.why.slice(1) : 'Une valeur ne convient pas'}${at}.`;
            case '#REF!': return `La formule montre ${i.what ? `quelque chose qui n’existe pas : ${i.what}` : 'une cellule qui a été supprimée'}.`;
            case '#N/A': return i.what !== undefined ? `${i.fn || 'La recherche'} n’a pas trouvé « ${i.what} »${i.where ? ` dans ${i.where}` : ''}.` : `${i.why ? i.why.charAt(0).toUpperCase() + i.why.slice(1) : 'Valeur introuvable'}.`;
            case '#BOUCLE!': return i.path ? `${i.path} : la formule tourne en rond.` : 'La formule a besoin d’elle-même : elle tourne en rond.';
            case '#DATE?': return i.why ? `${i.text ? `« ${i.text} » : ` : ''}${i.why}.` : `Je ne comprends pas ${i.what || 'cette date'}${i.text ? ` (« ${i.text} »)` : ''}. Exemples : 7 mai 1925, vers 1784, an II, entre 1880 et 1885.`;
            case '#SYNTAXE!': return `Je ne comprends pas la formule${i.near ? ` près de « ${i.near} »` : ''}${i.why ? ` : ${i.why}` : ' : vérifie les parenthèses, les guillemets et les « ; »'}.`;
            case '#NOMBRE!': return `${i.why ? i.why.charAt(0).toUpperCase() + i.why.slice(1) : 'Nombre impossible'}.`;
            case '#DEBORD!': return `Le résultat a besoin de ${i.size || 'plusieurs cases'} vers le bas et la droite, mais ${i.cell || 'une case'} n’est pas vide : vide-la pour voir tout le résultat.`;
            case '#TROP!': return `Trop gros pour être calculé : ${typeof e.info === 'string' ? e.info : 'réduis la plage'}.`;
            default: return 'Erreur dans la formule.';
        }
    }
    const errHint = e => (e?.code === '#DIV/0!' ? 'Astuce : =SI.ERREUR(A4/B4;"")' : '');

    /* ═════════ Le calcul d'un classeur : graphe de dépendances, recalcul de ce qui change seulement ═════════ */
    const ROWKEY = (si, r, c) => `${si}:${r}:${c}`;
    const unkey = k => { const [s, r, c] = k.split(':'); return [+s, +r, +c]; };
    const isFormula = v => typeof v === 'string' && v.length > 1 && v[0] === '=';
    /** la valeur d'une cellule qui n'est pas une formule */
    function constVal(cell) {
        if (cell == null) return null;
        const v = typeof cell === 'object' ? cell.v : cell;
        if (v == null || v === '') return null;
        if (typeof v === 'number' || typeof v === 'boolean') return v;
        if (typeof v === 'string') return v[0] === "'" ? v.slice(1) : v;
        return null;
    }
    const cellRaw = cell => (cell == null ? null : typeof cell === 'object' ? cell.v : cell);

    class RangeVal {
        constructor(calc, si, r0, c0, r1, c1) { this.calc = calc; this.si = si; this.r0 = r0; this.c0 = c0; this.r1 = r1; this.c1 = c1; this.h = r1 - r0 + 1; this.w = c1 - c0 + 1; }
        get(i, j) { return i < 0 || j < 0 || i >= this.h || j >= this.w ? null : this.calc.val(this.si, this.r0 + i, this.c0 + j); }
        values() {
            const o = new Array(this.h * this.w), calc = this.calc, sh = calc.wb.sheets[this.si]; if (!sh) return o.fill(null);
            const cells = sh.cells, names = []; for (let c = this.c0; c <= this.c1; c++) names.push(colName(c));
            const spill = calc.spill.size > 0; let k = 0;
            for (let r = this.r0; r <= this.r1; r++) { const rs = String(r + 1); for (let j = 0; j < names.length; j++) {
                const cell = cells[names[j] + rs], raw = cell == null ? null : typeof cell === 'object' ? cell.v : cell;
                if (raw == null || raw === '') o[k++] = spill ? calc.val(this.si, r, this.c0 + j) : null;
                else if (typeof raw === 'string' && raw[0] === '=' && raw.length > 1) o[k++] = calc.val(this.si, r, this.c0 + j);
                else o[k++] = typeof raw === 'string' ? (raw[0] === "'" ? raw.slice(1) : raw) : raw;
            } }
            return o;
        }
    }

    /** les formules d'une feuille, rangées par colonne (pour trouver vite celles qui sont dans une plage) */
    class ColIndex {
        constructor() { this.cols = new Map(); this.sorted = new Map(); this.size = 0; }
        add(r, c) { let s = this.cols.get(c); if (!s) this.cols.set(c, s = new Set()); if (!s.has(r)) { s.add(r); this.size++; this.sorted.delete(c); } }
        del(r, c) { const s = this.cols.get(c); if (s?.delete(r)) { this.size--; this.sorted.delete(c); } }
        each(r0, r1, c0, c1, cb) {
            const span = c1 - c0 + 1;
            const one = c => { const set = this.cols.get(c); if (!set || !set.size) return; let a = this.sorted.get(c); if (!a) { a = [...set].sort((x, y) => x - y); this.sorted.set(c, a); }
                let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < r0) lo = m + 1; else hi = m; } for (let i = lo; i < a.length && a[i] <= r1; i++) cb(a[i], c); };
            if (span > this.cols.size) { this.cols.forEach((_, c) => { if (c >= c0 && c <= c1) one(c); }); } else for (let c = c0; c <= c1; c++) one(c);
        }
    }
    class Calc {
        /** opts.now() : l'heure (pour les essais) */
        constructor(wb, opts = {}) { this.wb = wb; this.now = opts.now || (() => new Date()); this.reset(); }
        reset() {
            this.memo = new Map(); this.ast = new Map(); this.approx = new Set(); this.spill = new Map(); this.spillOf = new Map(); this.blocked = new Map();
            this.rcell = new Map(); this.rbyCol = []; this.rwide = []; this.fdeps = new Map(); this.gray = new Set(); this.volatile = new Set();
            this.names = new Map((this.wb.sheets || []).map((s, i) => [fold(s.name), i]));
            this.formulas = (this.wb.sheets || []).map(() => new Set()); this.fidx = (this.wb.sheets || []).map(() => new ColIndex());
            (this.wb.sheets || []).forEach((sh, si) => { sh._used = null; for (const k in sh.cells) { if (isFormula(cellRaw(sh.cells[k]))) { const p = parseAddr(k); if (p) this.addF(si, p[0], p[1]); } } });
            this.formulas.forEach(set => set.forEach(k => this.index(k)));
            this.formulas.forEach(set => set.forEach(k => this.ensure(k)));
        }
        addF(si, r, c) { this.formulas[si].add(ROWKEY(si, r, c)); this.fidx[si].add(r, c); }
        delF(si, r, c) { this.formulas[si].delete(ROWKEY(si, r, c)); this.fidx[si].del(r, c); }
        sheetIdx(name, si) { if (name == null) return si; const j = this.names.get(fold(name)); return j === undefined ? -1 : j; }
        used(si) { const sh = this.wb.sheets[si]; if (!sh) return {r: 0, c: 0}; if (!sh._used) { let r = 0, c = 0; for (const k in sh.cells) { const p = parseAddr(k); if (p) { if (p[0] + 1 > r) r = p[0] + 1; if (p[1] + 1 > c) c = p[1] + 1; } } sh._used = {r, c}; } let {r, c} = sh._used; this.spillOf.forEach((sz, k) => { const [s, ar, ac] = unkey(k); if (s === si) { r = Math.max(r, ar + sz.h); c = Math.max(c, ac + sz.w); } }); return {r, c}; }
        /** l'arbre d'une formule (lu une fois) et ses précédents */
        astOf(key) {
            const [si, r, c] = unkey(key), sh = this.wb.sheets[si], src = cellRaw(sh?.cells[addr(r, c)]);
            let a = this.ast.get(key); if (a && a.src === src) return a;
            a = {src, ast: isFormula(src) ? parseFormula(src) : null}; this.ast.set(key, a); return a;
        }
        /** note les cellules et les plages dont dépend une formule */
        index(key) {
            this.unindex(key);
            const {ast} = this.astOf(key); if (!ast) return;
            const [si] = unkey(key), cells = new Set(), ranges = [];
            const walk = n => {
                if (!n || typeof n !== 'object') return;
                if (n.k === 'ref') { const s = this.sheetIdx(n.sheet, si); if (s >= 0) cells.add(ROWKEY(s, n.r, n.c)); }
                else if (n.k === 'rng') { const s = this.sheetIdx(n.sheet, si); if (s >= 0) ranges.push({si: s, r0: n.r0, c0: n.c0, r1: n.r1, c1: n.c1, f: key}); }
                else if (n.k === 'name') { const t = this.nameTarget(n.v, si); if (t?.k === 'ref') cells.add(ROWKEY(t.si, t.r, t.c)); else if (t) ranges.push({si: t.si, r0: t.r0, c0: t.c0, r1: t.r1, c1: t.c1, f: key}); }
                else if (n.k === 'fn') { const k = fnKey(n.name); if (k && FN[k].volatile) this.volatile.add(key); n.args.forEach(walk); }
                else { walk(n.a); walk(n.b); }
            };
            walk(ast);
            cells.forEach(k => { let s = this.rcell.get(k); if (!s) this.rcell.set(k, s = new Set()); s.add(key); });
            ranges.forEach(g => { if (g.c1 - g.c0 > 63) { (this.rwide[g.si] = this.rwide[g.si] || new Set()).add(g); return; } const m = this.rbyCol[g.si] = this.rbyCol[g.si] || new Map(); for (let c = g.c0; c <= g.c1; c++) { let s = m.get(c); if (!s) m.set(c, s = new Set()); s.add(g); } });
            this.fdeps.set(key, {cells: [...cells], ranges});
        }
        unindex(key) {
            const d = this.fdeps.get(key); if (!d) return;
            d.cells.forEach(k => this.rcell.get(k)?.delete(key));
            d.ranges.forEach(g => { if (g.c1 - g.c0 > 63) { this.rwide[g.si]?.delete(g); return; } const m = this.rbyCol[g.si]; if (m) for (let c = g.c0; c <= g.c1; c++) m.get(c)?.delete(g); });
            this.fdeps.delete(key); this.volatile.delete(key);
        }
        /** « Total » → une cellule ou une plage (noms du classeur) */
        nameTarget(name, si) {
            const t = this.wb.names?.[name] ?? Object.entries(this.wb.names || {}).find(([k]) => fold(k) === fold(name))?.[1];
            if (!t) return null;
            const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(String(t)), sheet = m ? (m[1] ? m[1].replace(/''/g, "'") : m[2]) : null, ref = m ? m[3] : String(t);
            const s = this.sheetIdx(sheet, si), g = parseRange(ref.replace(/\$/g, '')); if (s < 0 || !g) return null;
            return g.r0 === g.r1 && g.c0 === g.c1 ? {k: 'ref', si: s, r: g.r0, c: g.c0} : {k: 'rng', si: s, ...g};
        }
        /** les formules qui dépendent directement d'une cellule */
        dependents(key) {
            const out = new Set(this.rcell.get(key) || []), [si, r, c] = unkey(key);
            const look = set => { if (set) for (const g of set) if (r >= g.r0 && r <= g.r1 && c >= g.c0 && c <= g.c1) out.add(g.f); };
            look(this.rbyCol[si]?.get(c)); look(this.rwide[si]);
            return out;
        }
        /** les formules à calculer avant celle-ci */
        precedents(key) {
            const d = this.fdeps.get(key); if (!d) return [];
            const out = [];
            d.cells.forEach(k => { const [s] = unkey(k); if (this.formulas[s]?.has(k)) out.push(k); else { const a = this.spill.get(k); if (a) out.push(a); } });
            d.ranges.forEach(g => {
                const ix = this.fidx[g.si]; if (!ix) return;
                if (ix.size) ix.each(g.r0, g.r1, g.c0, g.c1, (r, c) => out.push(ROWKEY(g.si, r, c)));
                this.spillOf.forEach((sz, a) => { const [s, ar, ac] = unkey(a); if (s === g.si && ar <= g.r1 && ar + sz.h - 1 >= g.r0 && ac <= g.c1 && ac + sz.w - 1 >= g.c0) out.push(a); });
            });
            return out;
        }
        /** calcule une formule et, avant elle, celles dont elle a besoin (sans récursion profonde : 10 000 lignes en chaîne passent) */
        ensure(k0) {
            if (this.memo.has(k0)) return;
            const stack = [k0], exp = new Set();
            let guard = 0;
            try {
                while (stack.length) {
                    if (++guard > 2e7) break;
                    const k = stack[stack.length - 1];
                    if (this.memo.has(k)) { stack.pop(); continue; }
                    if (!exp.has(k)) {
                        if (this.gray.has(k)) { stack.pop(); continue; } // déjà en cours plus haut : la boucle sera dite par compute()
                        exp.add(k); this.gray.add(k);
                        const todo = this.precedents(k).filter(p => !this.memo.has(p) && !this.gray.has(p));
                        if (todo.length) { for (const p of todo) stack.push(p); continue; }
                    }
                    stack.pop(); this.compute(k); this.gray.delete(k);
                }
            } finally { exp.forEach(k => this.gray.delete(k)); }
        }
        compute(key) {
            const [si, r, c] = unkey(key), here = addr(r, c);
            const ctx = {si, now: this.now, approx: false, cell: here, key};
            let v;
            const {ast} = this.astOf(key);
            this.computing = this.computing || new Set(); this.computing.add(key);
            try { v = ast ? (ast.k === 'perr' ? ast.err : this.ev(ast, ctx)) : constVal(this.wb.sheets[si].cells[here]); }
            catch (e) { if (isErr(e)) v = e; else if (e instanceof RangeError) v = err('#TROP!', 'la formule demande trop de calculs'); else throw e; }
            finally { this.computing.delete(key); }
            if (v instanceof RangeVal) v = v.h === 1 && v.w === 1 ? v.get(0, 0) : new SArr(Array.from({length: Math.min(v.h, 5000)}, (_, i) => Array.from({length: v.w}, (_, j) => v.get(i, j))));
            if (typeof v === 'number' && !Number.isFinite(v)) v = Number.isNaN(v) ? err('#NOMBRE!', {why: 'le calcul n’a pas de résultat'}) : err('#NOMBRE!', {why: 'le résultat est trop grand pour être calculé'});
            this.clearSpill(key);
            if (v instanceof SArr) v = this.placeSpill(key, v);
            if (ctx.approx) this.approx.add(key); else this.approx.delete(key);
            this.memo.set(key, v === undefined ? null : v);
        }
        clearSpill(key) { const sz = this.spillOf.get(key); if (!sz) return; const [si, r, c] = unkey(key); for (let i = 0; i < sz.h; i++) for (let j = 0; j < sz.w; j++) if (i || j) this.spill.delete(ROWKEY(si, r + i, c + j)); this.spillOf.delete(key); }
        placeSpill(key, arr) {
            const [si, r, c] = unkey(key), sh = this.wb.sheets[si];
            if (arr.h * arr.w > LIMITS.spill) return err('#TROP!', 'le résultat est trop grand');
            if (arr.h === 1 && arr.w === 1) return arr.get(0, 0);
            for (let i = 0; i < arr.h; i++) for (let j = 0; j < arr.w; j++) { if (!i && !j) continue; const a = addr(r + i, c + j), k = ROWKEY(si, r + i, c + j); if (cellRaw(sh.cells[a]) != null && cellRaw(sh.cells[a]) !== '' || (this.spill.has(k) && this.spill.get(k) !== key)) { this.blocked.set(key, {h: arr.h, w: arr.w}); return err('#DEBORD!', {size: `${arr.h} × ${arr.w}`, cell: a}); } }
            this.blocked.delete(key);
            for (let i = 0; i < arr.h; i++) for (let j = 0; j < arr.w; j++) if (i || j) this.spill.set(ROWKEY(si, r + i, c + j), key);
            this.spillOf.set(key, {h: arr.h, w: arr.w, arr});
            return arr.get(0, 0);
        }
        /** la valeur d'une cellule (calculée si c'est une formule) */
        val(si, r, c) {
            const sh = this.wb.sheets[si]; if (!sh) return err('#REF!', {what: 'une feuille supprimée'});
            const cell = sh.cells[addr(r, c)], raw = cell == null ? null : typeof cell === 'object' ? cell.v : cell;
            if (raw == null || raw === '') { if (!this.spill.size) return null; const a = this.spill.get(ROWKEY(si, r, c)); if (a) { const sz = this.spillOf.get(a), [, ar, ac] = unkey(a); return sz ? sz.arr.get(r - ar, c - ac) : null; } return null; }
            if (typeof raw !== 'string') return raw;
            if (raw[0] === "'") return raw.slice(1);
            if (raw[0] === '=' && raw.length > 1) {
                const key = ROWKEY(si, r, c);
                if (this.memo.has(key)) return this.memo.get(key);
                if (this.computing?.has(key) || this.gray.has(key)) throw err('#BOUCLE!', {path: this.loopPath(key)});
                this.ensure(key); return this.memo.has(key) ? this.memo.get(key) : err('#BOUCLE!', {path: this.loopPath(key)});
            }
            return raw;
        }
        loopPath(key) { const [si, r, c] = unkey(key), here = addr(r, c), back = [...(this.computing || [])].filter(k => k !== key).map(k => addr(unkey(k)[1], unkey(k)[2])); return back.length ? `${here} a besoin de ${back[back.length - 1]}, qui a besoin de ${here}` : `${here} a besoin d’elle-même`; }
        /** évalue un nœud */
        ev(n, ctx) {
            switch (n.k) {
                case 'n': case 's': case 'b': return n.v;
                case 'e': return err(n.v === '#NAME?' ? '#NOM?' : n.v === '#VALUE!' ? '#VALEUR!' : n.v === '#NUM!' ? '#NOMBRE!' : n.v === '#NA' ? '#N/A' : n.v);
                case 'empty': return null;
                case 'perr': return n.err;
                case 'ref': { const s = this.sheetIdx(n.sheet, ctx.si); if (s < 0) return err('#REF!', {what: `la feuille « ${n.sheet} »`}); const v = this.val(s, n.r, n.c); return v; }
                case 'rng': { const s = this.sheetIdx(n.sheet, ctx.si); if (s < 0) return err('#REF!', {what: `la feuille « ${n.sheet} »`}); const u = this.used(s); const r1 = n.whole === 'col' ? Math.max(n.r0, Math.min(n.r1, u.r - 1)) : n.r1, c1 = n.whole === 'row' ? Math.max(n.c0, Math.min(n.c1, u.c - 1)) : n.c1; if ((r1 - n.r0 + 1) * (c1 - n.c0 + 1) > 5e6) return err('#TROP!', 'la plage est trop grande'); return new RangeVal(this, s, n.r0, n.c0, r1, c1); }
                case 'name': { const t = this.nameTarget(n.v, ctx.si); if (!t) return err('#NOM?', {name: n.v, sugg: suggest(n.v)}); return t.k === 'ref' ? this.val(t.si, t.r, t.c) : new RangeVal(this, t.si, t.r0, t.c0, t.r1, t.c1); }
                case 'neg': { const v = this.scalar(this.ev(n.a, ctx)), x = toN(v); return isErr(x) ? x : -x; }
                case 'pct': { const v = this.scalar(this.ev(n.a, ctx)), x = toN(v); return isErr(x) ? x : x / 100; }
                case 'op': return this.binop(n, ctx);
                case 'fn': return this.call(n, ctx);
            }
            return err('#SYNTAXE!', {});
        }
        scalar(v) { if (v instanceof RangeVal || v instanceof SArr) return v.h === 1 && v.w === 1 ? v.get(0, 0) : err('#VALEUR!', {why: 'une plage entière ne tient pas dans une case : utilise SOMME(…), INDEX(…)…'}); return v; }
        binop(n, ctx) {
            const A = this.ev(n.a, ctx), B = this.ev(n.b, ctx);
            // plage comparée ou calculée case par case (FILTRE(A2:C9; C2:C9>30))
            if ((A instanceof RangeVal || A instanceof SArr || B instanceof RangeVal || B instanceof SArr) && !(isMat(A) && A.h === 1 && A.w === 1 && isMat(B) && B.h === 1 && B.w === 1)) {
                const ma = mat(A), mb = mat(B), h = Math.max(ma.h, mb.h), w = Math.max(ma.w, mb.w);
                if (h * w > LIMITS.spill) return err('#TROP!', 'la plage est trop grande');
                const g = (m, i, j) => m.get(m.h === 1 ? 0 : i, m.w === 1 ? 0 : j);
                return new SArr(Array.from({length: h}, (_, i) => Array.from({length: w}, (_, j) => this.op1(n.op, g(ma, i, j), g(mb, i, j), n))));
            }
            return this.op1(n.op, this.scalar(A), this.scalar(B), n);
        }
        op1(op, a, b, n) {
            if (op === '&') { if (isErr(a)) return a; if (isErr(b)) return b; return toStr(a) + toStr(b); }
            if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
                if (isErr(a)) return a; if (isErr(b)) return b;
                const an = typeof a === 'number' || a instanceof SDate, bn = typeof b === 'number' || b instanceof SDate;
                let x, y; if (an && bn) { x = +a; y = +b; } else if ((a == null || a === '') && bn) { x = 0; y = +b; } else if ((b == null || b === '') && an) { x = +a; y = 0; } else if (an !== bn && a != null && b != null && a !== '' && b !== '') { x = an ? 0 : 1; y = bn ? 0 : 1; } else { x = fold(toStr(a)); y = fold(toStr(b)); }
                return {'=': x === y, '<>': x !== y, '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y}[op];
            }
            const x = toN(a, n.a?.k === 'ref' ? n.a.raw : ''), y = toN(b, n.b?.k === 'ref' ? n.b.raw : '');
            if (isErr(x)) return x; if (isErr(y)) return y;
            const keepDate = (a instanceof SDate && !(b instanceof SDate)) && (op === '+' || op === '-');
            let v;
            switch (op) {
                case '+': v = x + y; break; case '-': v = x - y; break; case '*': v = x * y; break;
                case '/': if (y === 0) return err('#DIV/0!', n.b?.k === 'ref' ? {ref: n.b.raw} : {}); v = x / y; break;
                case '^': v = x ** y; if (Number.isNaN(v)) return err('#NOMBRE!', {why: 'puissance impossible'}); break;
            }
            return keepDate ? new SDate(v) : v;
        }
        call(n, ctx) {
            const key = fnKey(n.name);
            if (!key) return err('#NOM?', {name: n.name.toUpperCase(), sugg: suggest(n.name)});
            const F = FN[key];
            const args = F.lazy ? n.args.map(a => (a.k === 'empty' ? null : () => this.scalar(this.ev(a, ctx)))) : n.args.map(a => (a.k === 'empty' ? null : this.ev(a, ctx)));
            if (!F.lazy) for (const a of args) if (isErr(a) && !['ET', 'OU', 'CONCAT', 'NB', 'NBVAL', 'NB.VIDE'].includes(key)) return a;
            try { return F.f(args, ctx); } catch (e) { if (isErr(e)) return e; throw e; }
        }
        /** après un changement : recalcule seulement ce qui en dépend (et les débordements touchés) */
        changed(cells) {
            let todo = [...cells], rounds = 0; const all = new Set();
            while (todo.length && rounds++ < 20) {
                const dirty = new Set(), stack = [];
                todo.forEach(k => { const [si] = unkey(k), raw = cellRaw(this.wb.sheets[si]?.cells[addr(unkey(k)[1], unkey(k)[2])]);
                    const [, rr, cc] = unkey(k);
                    if (isFormula(raw)) { if (this.formulas[si]) this.addF(si, rr, cc); this.index(k); dirty.add(k); } else if (this.formulas[si]?.has(k)) { this.delF(si, rr, cc); this.unindex(k); this.memo.delete(k); this.approx.delete(k); const sz = this.spillOf.get(k); if (sz) { for (let i = 0; i < sz.h; i++) for (let j = 0; j < sz.w; j++) if (i || j) stack.push(ROWKEY(si, rr + i, cc + j)); this.clearSpill(k); } }
                    stack.push(k);
                    const an = this.spill.get(k); if (an && an !== k) dirty.add(an); // on écrit dans un débordement : sa formule le dira (#DEBORD!)
                    this.blocked.forEach((sz, a) => { const [s2, ar, ac] = unkey(a); if (s2 === si && rr >= ar && rr < ar + sz.h && cc >= ac && cc < ac + sz.w && a !== k) dirty.add(a); }); });
                this.volatile.forEach(k => dirty.add(k));
                while (stack.length) { const k = stack.pop(); this.dependents(k).forEach(f => { if (!dirty.has(f)) { dirty.add(f); stack.push(f); } }); }
                const before = new Map(); dirty.forEach(k => { const sz = this.spillOf.get(k); if (sz) before.set(k, sz); this.memo.delete(k); });
                // les cases d'un débordement qui change comptent aussi comme changées
                const spilled = [];
                dirty.forEach(k => { if (before.has(k)) { const [si, r, c] = unkey(k), sz = before.get(k); for (let i = 0; i < sz.h; i++) for (let j = 0; j < sz.w; j++) if (i || j) spilled.push(ROWKEY(si, r + i, c + j)); this.clearSpill(k); } });
                dirty.forEach(k => this.ensure(k));
                dirty.forEach(k => { all.add(k); const sz = this.spillOf.get(k); if (sz) { const [si, r, c] = unkey(k); for (let i = 0; i < sz.h; i++) for (let j = 0; j < sz.w; j++) if (i || j) spilled.push(ROWKEY(si, r + i, c + j)); } });
                todo = spilled.filter(k => !all.has(k)); todo.forEach(k => all.add(k));
                // seulement les cases d'un débordement qui ne sont pas déjà à jour
                todo = todo.filter(k => [...this.dependents(k)].some(f => !dirty.has(f)));
            }
            return all;
        }
        /** des cellules ont changé de valeur ou de formule sur la feuille si : [[r, c], …] */
        setCellChanged(si, list) { const sh = this.wb.sheets[si]; if (sh?._used) list.forEach(([r, c]) => { if (cellRaw(sh.cells[addr(r, c)]) != null) { if (r + 1 > sh._used.r) sh._used.r = r + 1; if (c + 1 > sh._used.c) sh._used.c = c + 1; } }); return this.changed(list.map(([r, c]) => ROWKEY(si, r, c))); }
        isApprox(si, r, c) { return this.approx.has(ROWKEY(si, r, c)); }
        spillAnchor(si, r, c) { const a = this.spill.get(ROWKEY(si, r, c)); return a ? unkey(a) : null; }
    }

    /* ═════════ Ce qu'on tape dans une cellule, et ce qu'on y voit ═════════ */
    /** « 12,5 » → 12.5 ; « 35 % » → 0.35 (format %) ; « 0032 » reste du texte ; « =… » formule ; « VRAI » → vrai */
    function parseInput(text, {fmt = ''} = {}) {
        if (text == null) return {v: null};
        if (typeof text === 'number' || typeof text === 'boolean') return {v: text};
        let s = String(text); if (s.length > LIMITS.text) s = s.slice(0, LIMITS.text);
        const t = s.trim();
        if (t === '') return {v: null};
        if (t[0] === '=' && t.length > 1) return {v: '=' + t.slice(1).trim()};
        if (t[0] === "'") return {v: s};
        if (fmt === 'text') return {v: /^[=+\-@]/.test(t) || toNum(t) !== null ? "'" + s : s};
        if (/^(vrai|faux)$/i.test(t)) return {v: /^vrai$/i.test(t)};
        if (/^0\d/.test(t) && !/^0[.,]/.test(t)) return {v: s}; // 0032 : un numéro, pas un nombre
        const n = toNum(t);
        if (n !== null) { const out = {v: n}; if (/%\s*$/.test(t)) out.fmt = 'pct'; else if (/€|eur/i.test(t)) out.fmt = 'eur'; return out; }
        return {v: s};
    }
    const DEC_DEFAULT = {num: 2, eur: 2, pct: 0};
    /** une valeur prête à afficher, selon le format de la cellule */
    function formatValue(v, st = {}, {approx = false} = {}) {
        if (v == null) return '';
        if (isErr(v)) return v.code;
        if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
        const f = st.fmt || '', dec = Number.isInteger(st.dec) ? Math.max(0, Math.min(10, st.dec)) : null, pre = approx ? '≈ ' : '';
        if (v instanceof SDate) { if (f && !['date', 'auto', 'actdate', 'text'].includes(f)) return formatValue(v.serial, st, {approx}); const d = serialYmd(v.serial), p = n => String(n).padStart(2, '0'); const s = `${p(d.d)}/${p(d.m)}/${d.y}`; if (v.time) { const sec = Math.round((v.serial % 1) * 86400); return `${s} ${p(Math.floor(sec / 3600))}:${p(Math.floor(sec / 60) % 60)}`; } return s; }
        if (typeof v === 'number') {
            if (f === 'pct') return pre + fmtFr(v * 100, {minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 2}) + ' %';
            if (f === 'eur') return pre + fmtFr(v, {minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2}) + ' €';
            if (f === 'num') return pre + fmtFr(v, {minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2});
            if (f === 'int') return pre + fmtFr(Math.round(v), {maximumFractionDigits: 0});
            if (f === 'date') { const d = serialYmd(v), p = n => String(n).padStart(2, '0'); return `${p(d.d)}/${p(d.m)}/${d.y}`; }
            if (dec !== null) return pre + fmtFr(v, {minimumFractionDigits: dec, maximumFractionDigits: dec});
            const a = Math.abs(v);
            if (a !== 0 && (a >= 1e15 || a < 1e-9)) return pre + v.toExponential(4).replace('.', ',');
            return pre + fmtFr(v, {maximumFractionDigits: a >= 1000 ? 2 : 6, useGrouping: a >= 10000});
        }
        const s = String(v);
        if (f === 'date') { const d = readActDate(s); if (d && !d.error && d.d) { const p = n => String(n).padStart(2, '0'); return `${p(d.d)}/${p(d.m)}/${d.y}`; } }
        return s;
    }
    /** ce que la cellule contient, en mots (panneau « Cellule ») */
    function kindOf(raw, v) {
        if (raw == null || raw === '') return 'Vide';
        if (isFormula(raw)) return isErr(v) ? '⛔ Formule en erreur' : 'ƒ Formule';
        if (typeof raw === 'number') return 'Nombre';
        if (typeof raw === 'boolean') return 'VRAI / FAUX';
        const s = String(raw); if (s[0] === "'") return 'Texte';
        const d = /\d|\ban\s+[ivx]/i.test(s) ? readActDate(s) : null;
        if (d?.error) return '⚠️ Date impossible';
        if (d) return '📅 Date d’acte';
        return 'Texte';
    }
    /** la clé de tri d'une valeur (les dates d'actes se rangent à leur date) */
    function sortKey(v) {
        if (v == null || v === '') return [3, 0];
        if (typeof v === 'number') return [0, v];
        if (v instanceof SDate) return [0, v.serial];
        if (typeof v === 'boolean') return [1, v ? 1 : 0];
        if (isErr(v)) return [2, 0];
        const s = String(v); const d = /\d/.test(s) && s.length < 60 ? readActDate(s) : null;
        if (d && !d.error) return [0, actSerial(d)];
        return [1, fold(s)];
    }
    const compareKeys = (a, b) => (a[0] !== b[0] ? a[0] - b[0] : typeof a[1] === 'number' && typeof b[1] === 'number' ? a[1] - b[1] : String(a[1]).localeCompare(String(b[1]), 'fr', {numeric: true}));

    /* ═════════ Réécrire une formule : recopie (A1 → A2), lignes insérées, noms anglais ═════════ */
    const refText = (t, mode) => {
        const sh = t.sheet != null ? (mode === 'ods' ? null : quoteSheet(t.sheet) + '!') : '';
        const one = (r, c, ac, ar) => `${ac ? '$' : ''}${colName(c)}${ar ? '$' : ''}${r + 1}`;
        if (t.t === 'ref') return (sh || '') + one(t.r, t.c, t.a[0], t.a[1]);
        if (t.whole === 'col') return `${sh || ''}${t.a[0] ? '$' : ''}${colName(t.c0)}:${t.a[2] ? '$' : ''}${colName(t.c1)}`;
        if (t.whole === 'row') return `${sh || ''}${t.a[1] ? '$' : ''}${t.r0 + 1}:${t.a[3] ? '$' : ''}${t.r1 + 1}`;
        return `${sh || ''}${one(t.r0, t.c0, t.a[0], t.a[1])}:${one(t.r1, t.c1, t.a[2], t.a[3])}`;
    };
    const numText = (v, mode) => { const s = String(v); return mode === 'fr' ? s.replace('.', ',') : s; };
    /** jetons → texte (mode 'fr' ou 'en') ; nameOf(jeton fn) pour traduire les noms */
    function serialize(toks, mode = 'fr', nameOf = null) {
        return toks.map(t => {
            let x;
            switch (t.t) {
                case 'ref': case 'rng': x = t.bad ? '#REF!' : refText(t, mode); break;
                case 'num': x = numText(t.v, mode); break;
                case 'str': x = `"${String(t.v).replace(/"/g, '""')}"`; break;
                case 'sep': x = mode === 'fr' ? ';' : ','; break;
                case 'fn': x = nameOf ? nameOf(t) : t.raw; break;
                case 'bool': x = mode === 'fr' ? (t.v ? 'VRAI' : 'FAUX') : (t.v ? 'TRUE' : 'FALSE'); break;
                default: x = t.raw;
            }
            return (t.pre || '') + x;
        }).join('');
    }
    const safeTok = f => { try { const src = String(f).replace(/^=/, ''), mode = formulaMode(src); return {toks: tokenize(src, mode), mode}; } catch (_) { return null; } };
    /** une formule recopiée dr lignes plus bas et dc colonnes à droite (les $ restent fixes) */
    function shiftFormula(f, dr, dc) {
        const T = safeTok(f); if (!T) return f;
        T.toks.forEach(t => {
            if (t.t === 'ref') { if (!t.a[0]) t.c += dc; if (!t.a[1]) t.r += dr; if (t.r < 0 || t.c < 0 || t.r >= LIMITS.rows || t.c >= LIMITS.cols) t.bad = true; }
            else if (t.t === 'rng') {
                if (t.whole !== 'row') { if (!t.a[0]) t.c0 += dc; if (!t.a[2]) t.c1 += dc; }
                if (t.whole !== 'col') { if (!t.a[1]) t.r0 += dr; if (!t.a[3]) t.r1 += dr; }
                if (t.r0 < 0 || t.c0 < 0 || t.r1 >= LIMITS.rows || t.c1 >= LIMITS.cols || t.r1 < 0 || t.c1 < 0) t.bad = true;
            }
        });
        return '=' + serialize(T.toks, T.mode);
    }
    /**
     * Lignes ou colonnes insérées (n > 0) ou supprimées (n < 0) à partir de « at » sur la feuille « target » :
     * les formules qui la montrent suivent ; une cellule supprimée devient #REF!.
     */
    function adjustFormula(f, {own, target, axis, at, n}) {
        const T = safeTok(f); if (!T) return f;
        let touched = false;
        const fix = (p) => { if (n > 0) return p >= at ? p + n : p; if (p >= at && p < at - n) return null; return p >= at - n ? p + n : p; };
        T.toks.forEach(t => {
            if (t.t !== 'ref' && t.t !== 'rng') return;
            const sheet = t.sheet ?? own; if (fold(sheet) !== fold(target)) return;
            if (t.t === 'ref') { const k = axis === 'row' ? 'r' : 'c', v = fix(t[k]); if (v === null) t.bad = true; else if (v !== t[k]) { t[k] = v; } touched = true; return; }
            if ((axis === 'row' && t.whole === 'col') || (axis === 'col' && t.whole === 'row')) return;
            const k0 = axis === 'row' ? 'r0' : 'c0', k1 = axis === 'row' ? 'r1' : 'c1';
            if (n > 0) { if (t[k0] >= at) t[k0] += n; if (t[k1] >= at) t[k1] += n; }
            else { const d0 = at, d1 = at - n - 1; if (t[k0] >= d0 && t[k1] <= d1) t.bad = true; else { const lo = t[k0] < d0 ? t[k0] : t[k0] > d1 ? t[k0] + n : d0, hi = t[k1] < d0 ? t[k1] : t[k1] > d1 ? t[k1] + n : d0 - 1; t[k0] = lo; t[k1] = Math.max(lo, hi); } }
            touched = true;
        });
        return touched ? '=' + serialize(T.toks, T.mode) : f;
    }
    /** une feuille renommée : les formules qui la nomment suivent */
    function renameInFormula(f, from, to) {
        const T = safeTok(f); if (!T) return f; let hit = false;
        T.toks.forEach(t => { if ((t.t === 'ref' || t.t === 'rng') && t.sheet != null && fold(t.sheet) === fold(from)) { t.sheet = to; hit = true; } });
        return hit ? '=' + serialize(T.toks, T.mode) : f;
    }
    /** les cellules montrées par une formule (pour les colorer pendant la frappe) */
    function refsOf(f) {
        const T = safeTok(f); if (!T) return [];
        return T.toks.filter(t => t.t === 'ref' || t.t === 'rng').map(t => (t.t === 'ref' ? {sheet: t.sheet, r0: t.r, c0: t.c, r1: t.r, c1: t.c} : {sheet: t.sheet, r0: t.r0, c0: t.c0, r1: t.r1, c1: t.c1, whole: t.whole}));
    }
    /** F4 : A1 → $A$1 → A$1 → $A1 → A1 pour la référence sous le curseur */
    function cycleAbs(f, pos) {
        const src = String(f), off = src[0] === '=' ? 1 : 0, T = safeTok(src); if (!T) return {f: src, pos};
        let p = off, hit = null;
        for (const t of T.toks) { p += (t.pre || '').length; const end = p + t.raw.length; if ((t.t === 'ref' || t.t === 'rng') && pos >= p && pos <= end) { hit = t; break; } p = end; }
        if (!hit) return {f: src, pos};
        const nextA = (c, r) => (c && r ? [false, true] : !c && r ? [true, false] : c && !r ? [false, false] : [true, true]);
        if (hit.t === 'ref') hit.a = nextA(hit.a[0], hit.a[1]); else { const a = nextA(hit.a[0], hit.a[1]); hit.a = [a[0], a[1], a[0], a[1]]; }
        const out = '=' + serialize(T.toks, T.mode); let q = 1; for (const t of T.toks) { const txt = serialize([t], T.mode); if (t === hit) { q += txt.length; break; } q += txt.length; }
        return {f: out, pos: q};
    }
    /** la formule en anglais (pour Excel) ; null si une fonction n'existe pas en anglais (on gardera la valeur) */
    function toEnglish(f) {
        const T = safeTok(f); if (!T) return null; let ok = true;
        const out = serialize(T.toks, 'en', t => { const k = fnKey(t.v); if (!k || !FN[k].en) { ok = false; return t.v; } const en = FN[k].en; return ['SORT', 'FILTER'].includes(en) ? '_xlfn._xlws.' + en : ['UNIQUE', 'XLOOKUP', 'CONCAT', 'TEXTJOIN', 'IFS', 'IFNA'].includes(en) ? '_xlfn.' + en : en; });
        if (T.toks.some(t => t.t === 'name')) ok = false;
        return ok ? out : null;
    }
    /** une formule d'Excel ou de LibreOffice (noms anglais) → en français ; null si une fonction est inconnue */
    function toFrench(fEn, {mode = 'en'} = {}) {
        let toks; try { toks = tokenize(String(fEn).replace(/^=/, ''), mode); } catch (_) { return null; }
        let ok = true;
        const out = serialize(toks, 'fr', t => { const k = fnKey(t.v); if (!k) { ok = false; return t.v; } return k; });
        return ok ? '=' + out : null;
    }

    /* ═════════ Poignée de recopie : suites (1836, 1841 → 1846…), mois, jours, « Feuille 1 » → « Feuille 2 » ═════════ */
    const DAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    /** les valeurs des cellules suivantes (count) d'après les premières (seed) ; formules : à recopier par l'appelant (shiftFormula) */
    function fillSeries(seed, count) {
        const out = [], n = seed.length; if (!n || count <= 0) return out;
        const nums = seed.map(v => (typeof v === 'number' ? v : null));
        if (nums.every(v => v !== null) && n >= 2) { const step = (nums[n - 1] - nums[0]) / (n - 1); for (let i = 1; i <= count; i++) out.push(Math.round((nums[n - 1] + step * i) * 1e9) / 1e9); return out; }
        const months = seed.map(v => (typeof v === 'string' ? MONTHS.findIndex(m => fold(m) === fold(v.trim())) : -1)), days = seed.map(v => (typeof v === 'string' ? DAYS_FR.indexOf(fold(v.trim())) : -1));
        const cap = (s, like) => (/^[A-ZÀ-Ý]/.test(like) ? s.charAt(0).toUpperCase() + s.slice(1) : s);
        if (months.every(i => i >= 0)) { const step = n >= 2 ? months[1] - months[0] || 1 : 1; for (let i = 1; i <= count; i++) out.push(cap(MONTHS[(((months[n - 1] + step * i) % 12) + 12) % 12], seed[0])); return out; }
        if (days.every(i => i >= 0)) { for (let i = 1; i <= count; i++) out.push(cap(DAYS_FR[(days[n - 1] + i) % 7], seed[0])); return out; }
        const tail = seed.map(v => (typeof v === 'string' && !isFormula(v) ? /^(.*?)(\d+)(\D*)$/.exec(v) : null));
        if (tail.every(Boolean) && tail.every(m => m[1] === tail[0][1] && m[3] === tail[0][3])) { const ns = tail.map(m => Number(m[2])), step = n >= 2 ? (ns[n - 1] - ns[0]) / (n - 1) || 1 : 1, w = tail[0][2].length; for (let i = 1; i <= count; i++) out.push(tail[0][1] + String(Math.round(ns[n - 1] + step * i)).padStart(w, '0') + tail[0][3]); return out; }
        for (let i = 0; i < count; i++) out.push(seed[i % n]);
        return out;
    }

    /* ═════════ CSV, TSV, collage ═════════ */
    /** octets → texte : BOM, UTF-8 strict, sinon Windows-1252 (vieil Excel) ; enc : 'auto' | 'utf-8' | 'windows-1252' | 'macintosh' */
    function decodeBytes(u8, enc = 'auto') {
        if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
        const dec = (name, fatal = false) => new TextDecoder(name, {fatal}).decode(u8);
        if (enc && enc !== 'auto') { try { return {text: dec(enc).replace(/^﻿/, ''), encoding: enc}; } catch (_) { return {text: dec('utf-8').replace(/^﻿/, ''), encoding: 'utf-8'}; } }
        if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return {text: dec('utf-8').slice(u8.length ? 0 : 0).replace(/^﻿/, ''), encoding: 'utf-8', bom: true};
        if (u8[0] === 0xff && u8[1] === 0xfe) return {text: dec('utf-16le').replace(/^﻿/, ''), encoding: 'utf-16le', bom: true};
        if (u8[0] === 0xfe && u8[1] === 0xff) return {text: dec('utf-16be').replace(/^﻿/, ''), encoding: 'utf-16be', bom: true};
        try { return {text: dec('utf-8', true), encoding: 'utf-8'}; } catch (_) {}
        try { return {text: dec('windows-1252'), encoding: 'windows-1252'}; } catch (_) { return {text: dec('latin1'), encoding: 'latin1'}; }
    }
    const ENC_LABEL = {'utf-8': 'UTF-8', 'windows-1252': 'Windows (vieil Excel)', latin1: 'Windows (vieil Excel)', 'utf-16le': 'UTF-16', 'utf-16be': 'UTF-16', macintosh: 'Mac Roman'};
    /** le séparateur le plus probable des premières lignes : « ; », « , », tabulation ou « | » */
    function sniffSep(text) {
        const lines = []; let cur = '', q = false;
        for (let i = 0; i < text.length && lines.length < 25; i++) { const ch = text[i]; if (ch === '"') q = !q; if (!q && (ch === '\n' || ch === '\r')) { if (cur) lines.push(cur); cur = ''; continue; } if (!q) cur += ch; else cur += ch === '"' ? '' : 'x'; }
        if (cur) lines.push(cur);
        let best = ';', score = -1;
        for (const sep of ['\t', ';', ',', '|']) { const counts = lines.map(l => l.split(sep).length - 1); const min = Math.min(...counts), max = Math.max(...counts); if (max === 0) continue; const s = (min === max ? 1000 : 0) + min * 10 + (sep === '\t' ? 5 : sep === ';' ? 3 : 0); if (s > score) { score = s; best = sep; } }
        return best;
    }
    /** texte CSV → lignes (guillemets, retours à la ligne dans une cellule, lignes bornées) */
    function parseCSV(text, {sep = null, maxRows = LIMITS.csvRows} = {}) {
        const t = String(text || '').replace(/^﻿/, ''); sep = sep || sniffSep(t);
        const out = []; let row = [], cur = '', q = false, i = 0, cells = 0;
        const n = t.length;
        const endCell = () => { row.push(cur.length > LIMITS.text ? cur.slice(0, LIMITS.text) : cur); cur = ''; if (++cells > LIMITS.cells) throw err('#TROP!', 'le fichier a trop de cellules'); };
        while (i < n) {
            const ch = t[i];
            if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; } cur += ch; i++; continue; }
            if (ch === '"' && cur === '') { q = true; i++; continue; }
            if (ch === sep) { endCell(); i++; continue; }
            if (ch === '\r' || ch === '\n') { endCell(); out.push(row); row = []; if (ch === '\r' && t[i + 1] === '\n') i++; i++; if (out.length >= maxRows) break; continue; }
            cur += ch; i++;
        }
        if (cur !== '' || row.length) { endCell(); out.push(row); }
        return out;
    }
    /** une cellule de texte qui serait lue comme une formule par un tableur (= + - @, tabulation) : protégée par une apostrophe */
    function csvSafe(v) {
        if (v == null) return '';
        if (typeof v === 'number' || typeof v === 'boolean') return v;
        const s = String(v);
        if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(?:[.,\s\u00a0\u202f]\d+)*(?:[eE][-+]?\d+)?$/.test(s)) return "'" + s; // même règle que A().csvSafe (app.js)
        return s;
    }
    function csvCell(v, sep = ';', safe = true) {
        let s = v == null ? '' : typeof v === 'number' ? (sep === ',' ? String(v) : String(v).replace('.', ',')) : typeof v === 'boolean' ? (v ? 'VRAI' : 'FAUX') : String(safe ? csvSafe(v) : v);
        if (s.includes(sep) || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
        return s;
    }
    /** lignes → CSV (séparateur « ; », UTF-8 avec BOM : les accents passent dans Excel) */
    function toCSV(rows, {sep = ';', bom = true, safe = true, eol = '\r\n'} = {}) {
        return (bom ? '﻿' : '') + rows.map(r => r.map(v => csvCell(v, sep, safe)).join(sep)).join(eol) + eol;
    }
    /** un tableau collé depuis Excel, Google Sheets ou une page : texte (TSV) et, si on l'a, le HTML (gras, couleurs) */
    function parseClipboard(text, html = '') {
        if (html && typeof DOMParser !== 'undefined' && /<table/i.test(html)) {
            try {
                const doc = new DOMParser().parseFromString(html.slice(0, 20e6), 'text/html'), table = doc.querySelector('table');
                if (table) {
                    const rows = [], styles = [], grid = [];
                    [...table.rows].slice(0, 100000).forEach((tr, ri) => {
                        grid[ri] = grid[ri] || []; let ci = 0;
                        [...tr.cells].forEach(td => {
                            while (grid[ri][ci]) ci++;
                            const cs = Math.min(50, td.colSpan || 1), rs = Math.min(500, td.rowSpan || 1);
                            const st = {}, css = td.getAttribute('style') || '', b = td.querySelector('b,strong'), it = td.querySelector('i,em');
                            if (/font-weight:\s*(bold|[6-9]00)/i.test(css) || (b && b.textContent.trim() === td.textContent.trim() && td.textContent.trim())) st.b = 1;
                            if (/font-style:\s*italic/i.test(css) || (it && it.textContent.trim() === td.textContent.trim() && td.textContent.trim())) st.i = 1;
                            const bg = /background(?:-color)?:\s*([^;]+)/i.exec(css)?.[1]?.trim(), fg = /(?:^|;)\s*color:\s*([^;]+)/i.exec(css)?.[1]?.trim();
                            if (bg && safeCol(bg) && !/^(transparent|white|#fff(fff)?)$/i.test(bg)) st.fill = safeCol(bg);
                            if (fg && safeCol(fg) && !/^(black|#000(000)?|windowtext)$/i.test(fg)) st.color = safeCol(fg);
                            const al = /text-align:\s*(left|center|right)/i.exec(css)?.[1]; if (al) st.h = al.toLowerCase();
                            const txt = (td.innerText ?? td.textContent ?? '').replace(/ /g, ' ').replace(/\n+$/, '');
                            (rows[ri] = rows[ri] || [])[ci] = txt; if (Object.keys(st).length) (styles[ri] = styles[ri] || [])[ci] = st;
                            for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) { (grid[ri + dr] = grid[ri + dr] || [])[ci + dc] = true; }
                            ci += cs;
                        });
                    });
                    for (let i = 0; i < rows.length; i++) { rows[i] = rows[i] || []; for (let j = 0; j < rows[i].length; j++) if (rows[i][j] === undefined) rows[i][j] = ''; }
                    return {rows, styles, html: true};
                }
            } catch (_) {}
        }
        const t = String(text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
        const rows = t.includes('\t') || !t.includes(';') ? parseCSV(t, {sep: '\t'}) : parseCSV(t);
        return {rows, styles: []};
    }

    /* ═════════ XML : une petite lecture sûre (aucune entité externe, aucun DOCTYPE) ═════════ */
    const XML_ENT = {lt: '<', gt: '>', amp: '&', quot: '"', apos: "'"};
    const xmlDecode = s => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => { if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''; } return XML_ENT[e] ?? m; }));
    const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    /** texte XML → {n, a, c} ; refuse DOCTYPE et ENTITY (bombes d'entités, fichiers externes) */
    function parseXml(text, {maxNodes = LIMITS.xmlNodes} = {}) {
        const s = String(text);
        if (/<!DOCTYPE|<!ENTITY/i.test(s.slice(0, 4096)) || /<!ENTITY/i.test(s)) throw new Error('fichier refusé : il contient des déclarations XML (DOCTYPE ou ENTITY) qu’un tableur n’utilise pas');
        const root = {n: '#root', a: {}, c: []}, stack = [root]; let i = 0, nodes = 0; const n = s.length;
        while (i < n) {
            const lt = s.indexOf('<', i);
            if (lt < 0) { const t = s.slice(i); if (t.trim()) stack[stack.length - 1].c.push(xmlDecode(t)); break; }
            if (lt > i) { const t = s.slice(i, lt); stack[stack.length - 1].c.push(xmlDecode(t)); }
            if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
            if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt + 9); stack[stack.length - 1].c.push(s.slice(lt + 9, e < 0 ? n : e)); i = e < 0 ? n : e + 3; continue; }
            if (s[lt + 1] === '?' || s[lt + 1] === '!') { const e = s.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
            const gt = s.indexOf('>', lt); if (gt < 0) throw new Error('fichier XML abîmé');
            let tag = s.slice(lt + 1, gt);
            // un « > » dans une valeur d'attribut : on va chercher le vrai bout de la balise
            let q = (tag.match(/"/g) || []).length; let end = gt; while (q % 2) { const g2 = s.indexOf('>', end + 1); if (g2 < 0) throw new Error('fichier XML abîmé'); tag = s.slice(lt + 1, g2); end = g2; q = (tag.match(/"/g) || []).length; }
            i = end + 1;
            if (tag[0] === '/') { if (stack.length > 1) stack.pop(); continue; }
            if (++nodes > maxNodes) throw new Error('fichier refusé : trop d’éléments');
            const self = tag.endsWith('/'); if (self) tag = tag.slice(0, -1);
            const sp = tag.search(/\s/), name = sp < 0 ? tag : tag.slice(0, sp), el = {n: name, a: {}, c: []};
            if (sp >= 0) { const rx = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g; let m; const at = tag.slice(sp); while ((m = rx.exec(at))) el.a[m[1]] = xmlDecode(m[3] ?? m[4] ?? ''); }
            stack[stack.length - 1].c.push(el);
            if (!self) { stack.push(el); if (stack.length > 200) throw new Error('fichier refusé : XML trop imbriqué'); }
        }
        return root;
    }
    const local = n => n.slice(n.indexOf(':') + 1);
    const kids = (el, name) => (el?.c || []).filter(x => typeof x === 'object' && (local(x.n) === name || x.n === name));
    const kid = (el, name) => kids(el, name)[0] || null;
    const xtext = el => (el == null ? '' : typeof el === 'string' ? el : el.c.map(xtext).join(''));
    const findAll = (el, name, out = []) => { (el?.c || []).forEach(x => { if (typeof x === 'object') { if (local(x.n) === name) out.push(x); findAll(x, name, out); } }); return out; };

    /* ═════════ ZIP : le seul fabricant de l'app (Présentation, Atelier, Mise en page, Tableur) ═════════ */
    const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const enc8 = s => new TextEncoder().encode(s);
    async function deflateRaw(u8) { if (typeof CompressionStream !== 'function') return null; try { const st = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw')); return new Uint8Array(await new Response(st).arrayBuffer()); } catch (_) { return null; } }
    function zipParts(entries, date = new Date()) {
        const parts = [], central = []; let offset = 0;
        const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1), dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
        for (const f of entries) {
            const name = enc8(f.name), utf = /[^\x20-\x7e]/.test(f.name) ? 0x0800 : 0;
            const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, utf, true); h.setUint16(8, f.method, true); h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, f.crc, true); h.setUint32(18, f.body.length, true); h.setUint32(22, f.size, true); h.setUint16(26, name.length, true);
            parts.push(new Uint8Array(h.buffer), name, f.body);
            const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, utf, true); c.setUint16(10, f.method, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, f.crc, true); c.setUint32(20, f.body.length, true); c.setUint32(24, f.size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
            central.push(new Uint8Array(c.buffer), name);
            offset += 30 + name.length + f.body.length;
        }
        const cdSize = central.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
        e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
        return [...parts, ...central, new Uint8Array(e.buffer)];
    }
    const toU8 = d => (typeof d === 'string' ? enc8(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
    /** ZIP sans compression, tout de suite : files = [{name, data (Uint8Array ou texte)}] → Blob */
    function zipStore(files, type = 'application/zip') {
        return new Blob(zipParts(files.map(f => { const raw = toU8(f.data); return {name: f.name, body: raw, size: raw.length, crc: crc32(raw), method: 0}; })), {type});
    }
    /** ZIP compressé quand le navigateur sait le faire (deflate) ; f.store garde un fichier tel quel (« mimetype » d'un ePub ou d'un ODS) */
    async function makeZip(files, type = 'application/zip') {
        const entries = [];
        for (const f of files) {
            const raw = toU8(f.data); let body = raw, method = 0;
            if (!f.store && raw.length > 64) { const z = await deflateRaw(raw); if (z && z.length < raw.length) { body = z; method = 8; } }
            entries.push({name: f.name, body, size: raw.length, crc: crc32(raw), method});
        }
        return new Blob(zipParts(entries), {type});
    }
    /** lire un ZIP (xlsx, ods, pptx, odp) avec garde-fous : nombre d'éléments, tailles, bombe de compression */
    async function unzip(buf, {maxTotal = LIMITS.unzipBytes, maxEntry = LIMITS.unzipEntry, maxEntries = LIMITS.zipEntries} = {}) {
        const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const u8 = new Uint8Array(ab), dv = new DataView(ab); let e = -1;
        if (u8.length > LIMITS.fileBytes) throw new Error(`fichier trop gros (plus de ${Math.round(LIMITS.fileBytes / 1048576)} Mo)`);
        for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65600); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
        if (e < 0) throw new Error('ce n’est pas un fichier zip valide');
        const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
        if (n > maxEntries) throw new Error('fichier refusé : trop d’éléments dans le zip');
        const files = new Map(), dec = new TextDecoder();
        for (let k = 0; k < n; k++) {
            if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
            const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
            files.set(dec.decode(u8.subarray(p + 46, p + 46 + nl)), {flags, method, csize, usize, off}); p += 46 + nl + xl + cl;
        }
        let total = 0;
        const read = async name => {
            const f = files.get(name); if (!f) return null;
            if (f.flags & 1) throw new Error('fichier chiffré : ouvre-le d’abord dans son tableur et enregistre-le sans mot de passe');
            if (f.off + 30 > u8.length || dv.getUint32(f.off, true) !== 0x04034b50) throw new Error('fichier zip abîmé');
            const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), data = u8.subarray(start, start + f.csize);
            if (f.usize > maxEntry || total + f.usize > maxTotal) throw new Error('fichier refusé : trop gros une fois décompressé');
            if (f.usize > 1048576 && f.csize > 0 && f.usize / f.csize > LIMITS.zipRatio) throw new Error('fichier refusé : il se décompresse en beaucoup trop gros (bombe zip)');
            let out;
            if (f.method === 0) out = data;
            else if (f.method === 8) {
                if (typeof DecompressionStream !== 'function') throw new Error('ce navigateur ne sait pas ouvrir les fichiers zip (mets-le à jour)');
                const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), chunks = []; let got = 0;
                const cap = Math.min(maxEntry, f.usize + 1024, maxTotal - total + 1024);
                for (;;) { const {done, value} = await reader.read(); if (done) break; got += value.length; if (got > cap) { try { await reader.cancel(); } catch (_) {} throw new Error('fichier refusé : il se décompresse en beaucoup trop gros (bombe zip)'); } chunks.push(value); }
                out = new Uint8Array(got); let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; });
            } else throw new Error('compression inconnue dans le fichier');
            total += out.length;
            return out;
        };
        return {names: [...files.keys()], has: name => files.has(name), read, text: async name => { const b = await read(name); return b ? new TextDecoder().decode(b) : null; }};
    }

    /* ═════════ Le classeur : forme gardée dans la base, nettoyage de ce qui arrive (fichier, base, collage) ═════════ */
    const uid = () => 's' + Math.random().toString(36).slice(2, 9);
    const newSheet = (name = 'Feuille 1') => ({id: uid(), name, cells: {}, cols: {}, rows: {}, merges: [], freeze: {r: 0, c: 0}, cf: [], dv: []});
    const newWorkbook = () => ({v: 1, sheets: [newSheet('Feuille 1')], styles: [{}], names: {}, active: 0});
    const SHEET_BAD = /[\[\]*?:/\\]/g;
    const cleanSheetName = (n, taken = []) => { let s = String(n ?? '').replace(SHEET_BAD, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Feuille'; const base = s; let k = 2; while (taken.some(t => fold(t) === fold(s))) s = `${base} (${k++})`; return s; };
    const FMTS = ['', 'num', 'int', 'pct', 'eur', 'date', 'actdate', 'text'];
    const CF_OPS = ['>', '<', '>=', '<=', '=', '<>', 'between', 'contains', 'empty', 'notempty', 'dup', 'baddate', 'scale'];
    function cleanStyle(st) {
        const o = {}; if (!st || typeof st !== 'object') return o;
        if (st.b) o.b = 1; if (st.i) o.i = 1; if (st.u) o.u = 1; if (st.s) o.s = 1;
        const c = safeCol(st.color), f = safeCol(st.fill), bc = safeCol(st.bc); if (c) o.color = c; if (f) o.fill = f; if (bc) o.bc = bc;
        if (FMTS.includes(st.fmt) && st.fmt) o.fmt = st.fmt;
        if (Number.isInteger(st.dec) && st.dec >= 0 && st.dec <= 10) o.dec = st.dec;
        if (['left', 'center', 'right'].includes(st.h)) o.h = st.h;
        if (['top', 'middle', 'bottom'].includes(st.v)) o.v = st.v;
        if (st.wrap) o.wrap = 1;
        if (typeof st.bd === 'string') { const b = st.bd.replace(/[^tblr]/g, '').slice(0, 4); if (b) o.bd = [...new Set(b)].join(''); }
        if (['thin', 'thick', 'double'].includes(st.bs)) o.bs = st.bs;
        if (Number.isFinite(st.fs) && st.fs >= 6 && st.fs <= 72) o.fs = Math.round(st.fs);
        if (typeof st.font === 'string' && /^[\w\s,'\-À-ÿ.]{1,60}$/.test(st.font)) o.font = st.font;
        return o;
    }
    const styleKey = st => JSON.stringify(cleanStyle(st), Object.keys(cleanStyle(st)).sort());
    /** le numéro d'un style dans le classeur (ajouté s'il n'existe pas encore) */
    function styleId(wb, st) {
        const c = cleanStyle(st); if (!Object.keys(c).length) return 0;
        if (!wb._styleIx) { wb._styleIx = new Map(); wb.styles.forEach((x, i) => wb._styleIx.set(styleKey(x), i)); }
        const k = styleKey(c); let i = wb._styleIx.get(k);
        if (i === undefined) { if (wb.styles.length >= LIMITS.styles) return 0; i = wb.styles.length; wb.styles.push(c); wb._styleIx.set(k, i); }
        return i;
    }
    const cleanRange = r => { const g = parseRange(r); return g ? rangeStr(g) : null; };
    function cleanCell(x, nStyles) {
        if (x == null) return null;
        if (typeof x !== 'object') x = {v: x};
        let v = x.v;
        if (typeof v === 'number') { if (!Number.isFinite(v)) v = null; }
        else if (typeof v === 'string') { if (v.length > LIMITS.text) v = v.slice(0, LIMITS.text); }
        else if (typeof v !== 'boolean') v = null;
        const c = {v};
        if (Number.isInteger(x.s) && x.s > 0 && x.s < nStyles) c.s = x.s;
        if (x.ref && typeof x.ref === 'object' && ['person', 'place', 'source'].includes(x.ref.kind) && Number.isInteger(Number(x.ref.id)) && Number(x.ref.id) > 0) c.ref = {kind: x.ref.kind, id: Number(x.ref.id)};
        if (typeof x.note === 'string' && x.note.trim()) c.note = x.note.slice(0, 2000);
        if (c.v == null && !c.s && !c.ref && !c.note) return null;
        return c;
    }
    /** un classeur venu d'ailleurs (base, fichier, collage) → forme sûre et bornée ; tout ce qui n'est pas connu est laissé de côté */
    function normalize(raw) {
        const o = raw && typeof raw === 'object' ? raw : {};
        const styles = (Array.isArray(o.styles) ? o.styles : [{}]).slice(0, LIMITS.styles).map(cleanStyle); if (!styles.length) styles.push({}); styles[0] = {};
        let total = 0; const names = [];
        const sheets = (Array.isArray(o.sheets) ? o.sheets : []).slice(0, LIMITS.sheets).map(s0 => {
            const s = s0 && typeof s0 === 'object' ? s0 : {}, sh = newSheet(cleanSheetName(s.name, names)); names.push(sh.name);
            if (typeof s.id === 'string' && /^[\w-]{1,30}$/.test(s.id)) sh.id = s.id;
            const col = safeCol(s.color); if (col) sh.color = col;
            if (s.hidden) sh.hidden = true;
            const cells = s.cells && typeof s.cells === 'object' ? s.cells : {};
            const plain = /^[A-Z]{1,3}[1-9]\d{0,6}$/;
            for (const k in cells) { if (total >= LIMITS.cells) break; let key = k; if (!plain.test(k) || k.length > 7 && !parseAddr(k)) { const p = parseAddr(k); if (!p) continue; key = addr(p[0], p[1]); } else if (colNum(k.replace(/\d+$/, '')) >= LIMITS.cols || Number(k.replace(/^[A-Z]+/, '')) > LIMITS.rows) continue; const c = cleanCell(cells[k], styles.length); if (c) { sh.cells[key] = c; total++; } }
            const cols = s.cols && typeof s.cols === 'object' ? s.cols : {};
            Object.keys(cols).slice(0, 20000).forEach(k => { const c = colNum(k); if (c < 0 || c >= LIMITS.cols || !/^[A-Z]{1,3}$/i.test(k)) return; const x = cols[k] || {}, out = {}; if (Number.isFinite(x.w)) out.w = Math.max(16, Math.min(1200, Math.round(x.w))); if (x.hidden) out.hidden = true; if (Object.keys(out).length) sh.cols[colName(c)] = out; });
            const rows = s.rows && typeof s.rows === 'object' ? s.rows : {};
            Object.keys(rows).slice(0, 200000).forEach(k => { const r = Number(k); if (!Number.isInteger(r) || r < 1 || r > LIMITS.rows) return; const x = rows[k] || {}, out = {}; if (Number.isFinite(x.h)) out.h = Math.max(12, Math.min(600, Math.round(x.h))); if (x.hidden) out.hidden = true; if (Object.keys(out).length) sh.rows[String(r)] = out; });
            sh.merges = (Array.isArray(s.merges) ? s.merges : []).slice(0, 10000).map(cleanRange).filter(Boolean);
            const fz = s.freeze || {}; sh.freeze = {r: Math.max(0, Math.min(500, Math.trunc(Number(fz.r) || 0))), c: Math.max(0, Math.min(100, Math.trunc(Number(fz.c) || 0)))};
            sh.cf = (Array.isArray(s.cf) ? s.cf : []).slice(0, 60).map(x => { const range = cleanRange(x?.range); if (!range || !CF_OPS.includes(x.op)) return null; const st = cleanStyle(x.style || {}); return {range, op: x.op, v: typeof x.v === 'number' || typeof x.v === 'string' ? String(x.v).slice(0, 200) : '', v2: typeof x.v2 === 'number' || typeof x.v2 === 'string' ? String(x.v2).slice(0, 200) : '', style: {fill: st.fill || '', color: st.color || '', b: st.b || 0}}; }).filter(Boolean);
            sh.dv = (Array.isArray(s.dv) ? s.dv : []).slice(0, 60).map(x => { const range = cleanRange(x?.range); if (!range || !['list', 'person', 'place', 'number', 'date'].includes(x.kind)) return null; const d = {range, kind: x.kind}; if (x.kind === 'list') d.list = (Array.isArray(x.list) ? x.list : []).slice(0, 300).map(v => String(v ?? '').slice(0, 200)).filter(Boolean); if (x.kind === 'number') { if (Number.isFinite(Number(x.min))) d.min = Number(x.min); if (Number.isFinite(Number(x.max))) d.max = Number(x.max); } if (x.allowFree) d.allowFree = true; return d; }).filter(Boolean);
            if (s.filter && typeof s.filter === 'object' && cleanRange(s.filter.range)) sh.filter = {range: cleanRange(s.filter.range)};
            if (s.zebra) sh.zebra = true;
            if (s.link && typeof s.link === 'object' && !Array.isArray(s.link)) { try { const j = JSON.stringify(s.link); if (j.length < 800000) sh.link = JSON.parse(j); } catch (_) {} } // 🔗 plage tenue à jour (heritage-tableur-base.js)
            return sh;
        });
        if (!sheets.length) sheets.push(newSheet('Feuille 1'));
        const nm = {}; if (o.names && typeof o.names === 'object') Object.entries(o.names).slice(0, 300).forEach(([k, v]) => { if (/^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]{0,60}$/.test(k) && !ADDR_RX.test(k) && typeof v === 'string' && v.length < 200) nm[k] = v; });
        return {v: 1, sheets, styles, names: nm, active: Math.max(0, Math.min(sheets.length - 1, Math.trunc(Number(o.active) || 0)))};
    }
    /** pour l'enregistrement : les cellules sans réglage deviennent leur seule valeur (un classeur presque vide reste léger) */
    function compact(wb) {
        return {v: 1, active: wb.active || 0, styles: wb.styles, names: wb.names || {}, sheets: wb.sheets.map(sh => {
            const cells = {}; for (const k in sh.cells) { const c = sh.cells[k]; if (c == null) continue; if (typeof c !== 'object') { cells[k] = c; continue; } if (!c.s && !c.ref && !c.note) { if (c.v != null) cells[k] = c.v; } else { const o = {v: c.v}; if (c.s) o.s = c.s; if (c.ref) o.ref = c.ref; if (c.note) o.note = c.note; cells[k] = o; } }
            const out = {id: sh.id, name: sh.name, cells, cols: sh.cols, rows: sh.rows, merges: sh.merges, freeze: sh.freeze, cf: sh.cf, dv: sh.dv};
            if (sh.color) out.color = sh.color; if (sh.hidden) out.hidden = true; if (sh.filter) out.filter = {range: sh.filter.range}; if (sh.zebra) out.zebra = true; if (sh.link) out.link = sh.link;
            return out;
        })};
    }
    function usedRange(sh) { let r = -1, c = -1; for (const k in sh.cells) { const p = parseAddr(k); if (p && cellRaw(sh.cells[k]) != null) { if (p[0] > r) r = p[0]; if (p[1] > c) c = p[1]; } } return r < 0 ? null : {r0: 0, c0: 0, r1: r, c1: c}; }
    /** les valeurs (calculées) d'une plage, en tableau de lignes ; dates en texte, erreurs en code */
    function matrix(wb, calc, si, g = null, {display = false} = {}) {
        const sh = wb.sheets[si]; g = g || usedRange(sh); if (!g) return [];
        const out = [];
        for (let r = g.r0; r <= g.r1; r++) { const row = []; for (let c = g.c0; c <= g.c1; c++) { const v = calc ? calc.val(si, r, c) : constVal(sh.cells[addr(r, c)]); const cell = sh.cells[addr(r, c)]; row.push(display ? formatValue(v, wb.styles[cell?.s] || {}, {approx: calc?.isApprox(si, r, c)}) : v instanceof SDate ? toStr(v) : isErr(v) ? v.code : v); } out.push(row); }
        return out;
    }
    /** des lignes de valeurs → cellules d'une feuille (à partir de r0, c0) ; les nombres écrits en texte deviennent des nombres */
    function rowsToCells(rows, {r0 = 0, c0 = 0, typed = true} = {}) {
        const cells = {}; let n = 0;
        rows.forEach((row, i) => (row || []).forEach((v, j) => { if (n >= LIMITS.cells) return; const p = typed && typeof v === 'string' ? parseInput(v).v : v; if (p == null || p === '') return; cells[addr(r0 + i, c0 + j)] = {v: typeof p === 'string' && isFormula(p) && !typed ? "'" + p : p}; n++; }));
        return cells;
    }

    /* ═════════ XLSX (Excel, Numbers) : écrire et lire nous-mêmes ═════════ */
    const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const pxToW = px => Math.max(1, Math.round(((px - 5) / 7) * 100) / 100), wToPx = w => Math.round(Number(w) * 7 + 5);
    const argb = c => { const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(safeCol(c) || ''); if (!h) return null; const x = h[1].length === 3 ? h[1].replace(/./g, m => m + m) : h[1]; return 'FF' + x.toUpperCase(); };
    const fromArgb = s => (/^[0-9a-f]{8}$/i.test(s || '') ? '#' + s.slice(2).toLowerCase() : /^[0-9a-f]{6}$/i.test(s || '') ? '#' + s.toLowerCase() : '');
    const isDateText = s => typeof s === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s.trim()) && (() => { const d = readActDate(s); return d && !d.error && d.y >= 1900; })();
    function fmtCode(st) {
        const d = Number.isInteger(st.dec) ? st.dec : null, z = n => (n ? '.' + '0'.repeat(n) : '');
        switch (st.fmt) {
            case 'num': return '#,##0' + z(d ?? 2);
            case 'int': return '0';
            case 'pct': return '0' + z(d ?? 0) + '%';
            case 'eur': return '#,##0' + z(d ?? 2) + '\\ "€"';
            case 'date': return 'dd/mm/yyyy';
            case 'text': return '@';
        }
        return d !== null ? '0' + z(d) : null;
    }
    function fmtFromCode(code) {
        const c = String(code || ''); if (!c || c === 'General') return {};
        if (c === '@') return {fmt: 'text'};
        const dec = (/\.(0+)/.exec(c)?.[1] || '').length;
        if (c.includes('%')) return {fmt: 'pct', dec};
        if (/€|\[\$€|EUR/i.test(c)) return {fmt: 'eur', dec};
        if (/(^|[^"\\])[dmyjah]/i.test(c.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0,.\s]+$/.test(c)) return {fmt: 'date'};
        if (c.includes(',') || c.includes('#')) return {fmt: 'num', dec};
        if (/^0(\.0+)?$/.test(c)) return dec ? {dec} : {fmt: 'int'};
        return {};
    }
    const BUILTIN_FMT = {1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 22: 'm/d/yy h:mm', 49: '@'};
    /** le classeur → fichier .xlsx (Blob) ; les formules en anglais (traduites), leurs résultats gardés pour l'aperçu */
    async function toXlsx(wb, calc) {
        calc = calc || new Calc(wb);
        const files = [], used = new Map(), xfs = [], fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], numFmts = [];
        const fontIx = new Map(), fillIx = new Map(), bordIx = new Map(), nfIx = new Map();
        const xf0 = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'; xfs.push(xf0);
        const xfFor = (st, forceDate = false) => {
            const key = JSON.stringify(st) + (forceDate ? 'D' : ''); if (used.has(key)) return used.get(key);
            const font = `<font>${st.b ? '<b/>' : ''}${st.i ? '<i/>' : ''}${st.u ? '<u/>' : ''}${st.s ? '<strike/>' : ''}<sz val="${st.fs ? Math.round(st.fs * 0.75) : 11}"/>${argb(st.color) ? `<color rgb="${argb(st.color)}"/>` : ''}<name val="${xmlEsc(st.font || 'Calibri')}"/></font>`;
            let fi = fontIx.get(font); if (fi === undefined) { fi = fonts.length; fonts.push(font); fontIx.set(font, fi); }
            let fl = 0; if (argb(st.fill)) { const f = `<fill><patternFill patternType="solid"><fgColor rgb="${argb(st.fill)}"/><bgColor indexed="64"/></patternFill></fill>`; fl = fillIx.get(f); if (fl === undefined) { fl = fills.length; fills.push(f); fillIx.set(f, fl); } }
            let bi = 0; if (st.bd) { const sty = st.bs === 'thick' ? 'medium' : st.bs === 'double' ? 'double' : 'thin', col = argb(st.bc) ? `<color rgb="${argb(st.bc)}"/>` : '<color auto="1"/>'; const side = (k, t) => (st.bd.includes(k) ? `<${t} style="${sty}">${col}</${t}>` : `<${t}/>`); const b = `<border>${side('l', 'left')}${side('r', 'right')}${side('t', 'top')}${side('b', 'bottom')}<diagonal/></border>`; bi = bordIx.get(b); if (bi === undefined) { bi = borders.length; borders.push(b); bordIx.set(b, bi); } }
            const code = forceDate ? 'dd/mm/yyyy' : fmtCode(st); let nf = 0;
            if (code) { const bid = Object.entries(BUILTIN_FMT).find(([, v]) => v === code)?.[0]; if (bid) nf = Number(bid); else { nf = nfIx.get(code); if (nf === undefined) { nf = 164 + numFmts.length; numFmts.push(`<numFmt numFmtId="${nf}" formatCode="${xmlEsc(code)}"/>`); nfIx.set(code, nf); } } }
            const al = st.h || st.v || st.wrap ? `<alignment${st.h ? ` horizontal="${st.h}"` : ''}${st.v ? ` vertical="${st.v === 'middle' ? 'center' : st.v}"` : ''}${st.wrap ? ' wrapText="1"' : ''}/>` : '';
            const x = `<xf numFmtId="${nf}" fontId="${fi}" fillId="${fl}" borderId="${bi}" xfId="0"${nf ? ' applyNumberFormat="1"' : ''}${fi ? ' applyFont="1"' : ''}${fl ? ' applyFill="1"' : ''}${bi ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`;
            const i = xfs.length; xfs.push(x); used.set(key, i); return i;
        };
        const sheetNames = []; wb.sheets.forEach(sh => sheetNames.push(cleanSheetName(sh.name.slice(0, 31), sheetNames)));
        wb.sheets.forEach((sh, si) => {
            const rowsMap = new Map(), g = usedRange(sh);
            for (const k in sh.cells) { const p = parseAddr(k); if (!p) continue; (rowsMap.get(p[0]) || rowsMap.set(p[0], []).get(p[0])).push([p[1], k]); }
            // les cases d'un débordement (UNIQUE, TRIER…) : leurs valeurs
            calc.spill.forEach((a, key) => { const [s, r, c] = unkey(key); if (s !== si) return; (rowsMap.get(r) || rowsMap.set(r, []).get(r)).push([c, addr(r, c), true]); });
            Object.keys(sh.rows).forEach(k => { const r = Number(k) - 1; if (!rowsMap.has(r)) rowsMap.set(r, []); });
            const rowsXml = [...rowsMap.keys()].sort((a, b) => a - b).map(r => {
                const cells = rowsMap.get(r).sort((a, b) => a[0] - b[0]).map(([c, k, spilled]) => {
                    const cell = sh.cells[k], raw = spilled ? null : cellRaw(cell), st = wb.styles[cell?.s] || {}, v = calc.val(si, r, c);
                    let s = cell?.s || st.fmt ? xfFor(st) : 0, f = '', body = '', t = '';
                    if (isFormula(raw) && !calc.spillOf.has(ROWKEY(si, r, c))) { const en = toEnglish(raw); if (en) f = `<f>${xmlEsc(en)}</f>`; }
                    if (v == null || v === '') { if (!s && !f) return ''; }
                    else if (isErr(v)) { t = 'e'; body = `<v>${xmlEsc(ERR_EN[v.code] || '#VALUE!')}</v>`; }
                    else if (typeof v === 'boolean') { t = 'b'; body = `<v>${v ? 1 : 0}</v>`; }
                    else if (typeof v === 'number') body = `<v>${v}</v>`;
                    else if (v instanceof SDate) { body = `<v>${v.serial}</v>`; s = xfFor(st.fmt ? st : {...st, fmt: 'date'}); }
                    else if (!f && isDateText(v) && !String(raw ?? '').startsWith("'")) { const d = readActDate(v); body = `<v>${actSerial(d)}</v>`; s = xfFor({...st, fmt: 'date'}); }
                    else if (f) { t = 'str'; body = `<v>${xmlEsc(String(v))}</v>`; }
                    else { t = 'inlineStr'; body = `<is><t xml:space="preserve">${xmlEsc(String(v))}</t></is>`; }
                    return `<c r="${k}"${s ? ` s="${s}"` : ''}${t ? ` t="${t}"` : ''}>${f}${body}</c>`;
                }).join('');
                const ri = sh.rows[String(r + 1)] || {};
                return `<row r="${r + 1}"${ri.h ? ` ht="${Math.round(ri.h * 0.75 * 100) / 100}" customHeight="1"` : ''}${ri.hidden ? ' hidden="1"' : ''}>${cells}</row>`;
            }).join('');
            const cols = Object.entries(sh.cols).map(([k, x]) => [colNum(k), x]).sort((a, b) => a[0] - b[0]).map(([c, x]) => `<col min="${c + 1}" max="${c + 1}" width="${pxToW(x.w || 90)}" customWidth="1"${x.hidden ? ' hidden="1"' : ''}/>`).join('');
            const fz = sh.freeze || {}, pane = fz.r || fz.c ? `<pane${fz.c ? ` xSplit="${fz.c}"` : ''}${fz.r ? ` ySplit="${fz.r}"` : ''} topLeftCell="${addr(fz.r || 0, fz.c || 0)}" activePane="${fz.r && fz.c ? 'bottomRight' : fz.r ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
            const merges = sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
            files.push({name: `xl/worksheets/sheet${si + 1}.xml`, data: `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">${sh.color && argb(sh.color) ? `<sheetPr><tabColor rgb="${argb(sh.color)}"/></sheetPr>` : ''}<dimension ref="${g ? rangeStr(g) : 'A1'}"/><sheetViews><sheetView workbookViewId="0"${si === (wb.active || 0) ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml}</sheetData>${merges}</worksheet>`});
        });
        const defNames = Object.entries(wb.names || {}).map(([k, v]) => `<definedName name="${xmlEsc(k)}">${xmlEsc(String(v).replace(/^([^'!]+)!/, (m, n) => quoteSheet(n) + '!').replace(/([A-Z]+)(\d+)/g, '$$$1$$$2'))}</definedName>`).join('');
        files.push({name: 'xl/workbook.xml', data: `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><bookViews><workbookView activeTab="${wb.active || 0}"/></bookViews><sheets>${sheetNames.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}"${wb.sheets[i].hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets>${defNames ? `<definedNames>${defNames}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`});
        files.push({name: 'xl/_rels/workbook.xml.rels', data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wb.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`});
        files.push({name: 'xl/styles.xml', data: `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`});
        files.push({name: '_rels/.rels', data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`});
        files.push({name: 'docProps/core.xml', data: `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(wb.title || '')}</dc:title><dc:creator>LCNDA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`});
        files.unshift({name: '[Content_Types].xml', data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${wb.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`});
        return makeZip(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    const relTarget = (base, t) => { if (t.startsWith('/')) return t.slice(1); const parts = base.split('/'); parts.pop(); t.split('/').forEach(x => { if (x === '..') parts.pop(); else if (x !== '.') parts.push(x); }); return parts.join('/'); };
    /** un fichier .xlsx (ArrayBuffer) → classeur ; refuse les fichiers piégés (taille, bombe zip, XML externe) */
    async function fromXlsx(buf) {
        const z = await unzip(buf);
        const wbXml = await z.text('xl/workbook.xml'); if (!wbXml) throw new Error('ce n’est pas un fichier Excel (.xlsx) : xl/workbook.xml manque');
        const W = parseXml(wbXml), rels = parseXml(await z.text('xl/_rels/workbook.xml.rels') || '<Relationships/>');
        const relMap = new Map(findAll(rels, 'Relationship').map(r => [r.a.Id, relTarget('xl/workbook.xml', r.a.Target || '')]));
        const shared = []; { const t = await z.text('xl/sharedStrings.xml'); if (t) findAll(parseXml(t), 'si').forEach(si => shared.push(findAll(si, 't').filter(x => !findAll(si, 'rPh').some(rp => rp.c.includes(x) || findAll(rp, 't').includes(x))).map(xtext).join(''))); }
        // styles
        const wb = newWorkbook(); wb.sheets = [];
        const xfStyle = []; {
            const t = await z.text('xl/styles.xml');
            if (t) {
                const S = parseXml(t), nf = {...BUILTIN_FMT}; findAll(S, 'numFmt').forEach(n => { nf[n.a.numFmtId] = n.a.formatCode; });
                const fonts = kids(kid(findAll(S, 'styleSheet')[0], 'fonts'), 'font').map(f => ({b: !!kid(f, 'b') && kid(f, 'b').a.val !== '0', i: !!kid(f, 'i') && kid(f, 'i').a.val !== '0', u: !!kid(f, 'u'), s: !!kid(f, 'strike'), color: fromArgb(kid(f, 'color')?.a.rgb), fs: Number(kid(f, 'sz')?.a.val) || 0}));
                const fills = kids(kid(findAll(S, 'styleSheet')[0], 'fills'), 'fill').map(f => { const p = kid(f, 'patternFill'); return p && p.a.patternType === 'solid' ? fromArgb(kid(p, 'fgColor')?.a.rgb) : ''; });
                const borders = kids(kid(findAll(S, 'styleSheet')[0], 'borders'), 'border').map(b => { let s = '', thick = ''; [['left', 'l'], ['right', 'r'], ['top', 't'], ['bottom', 'b']].forEach(([n, k]) => { const e = kid(b, n); if (e?.a.style) { s += k; if (/medium|thick/.test(e.a.style)) thick = 'thick'; if (e.a.style === 'double') thick = 'double'; } }); return {bd: s, bs: thick}; });
                kids(kid(findAll(S, 'styleSheet')[0], 'cellXfs'), 'xf').slice(0, LIMITS.styles).forEach(x => {
                    const f = fonts[x.a.fontId] || {}, st = {}; if (f.b) st.b = 1; if (f.i) st.i = 1; if (f.u) st.u = 1; if (f.s) st.s = 1; if (f.color && f.color !== '#000000') st.color = f.color; if (f.fs && Math.round(f.fs) !== 11) st.fs = Math.round(f.fs / 0.75);
                    const fl = fills[x.a.fillId]; if (fl && fl !== '#ffffff') st.fill = fl;
                    const bd = borders[x.a.borderId]; if (bd?.bd) { st.bd = bd.bd; if (bd.bs) st.bs = bd.bs; }
                    Object.assign(st, fmtFromCode(nf[x.a.numFmtId]));
                    const al = kid(x, 'alignment'); if (al) { if (['left', 'center', 'right'].includes(al.a.horizontal)) st.h = al.a.horizontal; if (al.a.vertical) st.v = al.a.vertical === 'center' ? 'middle' : ['top', 'bottom'].includes(al.a.vertical) ? al.a.vertical : undefined; if (al.a.wrapText === '1' || al.a.wrapText === 'true') st.wrap = 1; }
                    xfStyle.push(st);
                });
            }
        }
        const sIx = xfStyle.map(st => styleId(wb, st)), dateXf = new Set(xfStyle.map((s, i) => (s.fmt === 'date' ? i : -1)).filter(i => i >= 0));
        let total = 0;
        const sheetEls = findAll(W, 'sheet');
        if (sheetEls.length > LIMITS.sheets) throw new Error('fichier refusé : trop de feuilles');
        for (const se of sheetEls) {
            const path = relMap.get(se.a['r:id']); const txt = path ? await z.text(path) : null; if (txt == null) continue;
            const X = parseXml(txt), sh = newSheet(cleanSheetName(se.a.name, wb.sheets.map(s => s.name)));
            if (se.a.state === 'hidden' || se.a.state === 'veryHidden') sh.hidden = true;
            const tab = findAll(X, 'tabColor')[0]; if (tab && fromArgb(tab.a.rgb)) sh.color = fromArgb(tab.a.rgb);
            const masters = new Map();
            for (const row of findAll(X, 'row')) {
                const rr = Number(row.a.r) - 1;
                if (row.a.ht && row.a.customHeight === '1' && rr >= 0) (sh.rows[String(rr + 1)] = sh.rows[String(rr + 1)] || {}).h = Math.round(Number(row.a.ht) / 0.75);
                if (row.a.hidden === '1' && rr >= 0) (sh.rows[String(rr + 1)] = sh.rows[String(rr + 1)] || {}).hidden = true;
                for (const c of kids(row, 'c')) {
                    const p = parseAddr(c.a.r || ''); if (!p) continue;
                    if (++total > LIMITS.cells) throw new Error('fichier refusé : trop de cellules');
                    const t = c.a.t || 'n', vEl = kid(c, 'v'), fEl = kid(c, 'f'), sxf = Number(c.a.s) || 0;
                    let v = null;
                    if (t === 's') v = shared[Number(xtext(vEl))] ?? '';
                    else if (t === 'inlineStr') v = findAll(c, 't').map(xtext).join('');
                    else if (t === 'str') v = xtext(vEl);
                    else if (t === 'b') v = xtext(vEl) === '1';
                    else if (t === 'e') v = null;
                    else if (vEl) { const n = Number(xtext(vEl)); v = Number.isFinite(n) ? n : null; if (v !== null && dateXf.has(sxf)) { const d = serialYmd(v), q = x => String(x).padStart(2, '0'); v = `${q(d.d)}/${q(d.m)}/${d.y}`; } }
                    if (typeof v === 'string' && /^[=+\-@]/.test(v)) v = "'" + v; // un texte n'est jamais lu comme une formule
                    let f = null;
                    if (fEl) {
                        let src = xtext(fEl);
                        if (fEl.a.t === 'shared') { if (src) masters.set(fEl.a.si, {src, r: p[0], c: p[1]}); else { const m = masters.get(fEl.a.si); if (m) src = shiftFormula('=' + m.src, p[0] - m.r, p[1] - m.c).slice(1); } }
                        if (src && fEl.a.t !== 'array') f = toFrench(src);
                    }
                    const cell = {v: f || v}; if (sIx[sxf]) cell.s = sIx[sxf];
                    if (cell.v == null && !cell.s) continue;
                    sh.cells[addr(p[0], p[1])] = cell;
                }
            }
            findAll(X, 'col').forEach(col => { const a = Number(col.a.min), b = Math.min(Number(col.a.max), a + 300); for (let c = a; c <= b; c++) { if (c < 1 || c > LIMITS.cols) continue; const o = {}; if (col.a.width && (col.a.customWidth === '1' || col.a.customWidth === 'true')) o.w = Math.max(16, Math.min(1200, wToPx(col.a.width))); if (col.a.hidden === '1') o.hidden = true; if (Object.keys(o).length) sh.cols[colName(c - 1)] = o; } });
            sh.merges = findAll(X, 'mergeCell').slice(0, 10000).map(m => cleanRange(m.a.ref)).filter(Boolean);
            const pane = findAll(X, 'pane')[0]; if (pane && /frozen/.test(pane.a.state || '')) sh.freeze = {r: Math.min(500, Number(pane.a.ySplit) || 0), c: Math.min(100, Number(pane.a.xSplit) || 0)};
            wb.sheets.push(sh);
        }
        if (!wb.sheets.length) wb.sheets.push(newSheet('Feuille 1'));
        findAll(W, 'definedName').forEach(d => { const n = d.a.name; if (n && !n.startsWith('_xlnm') && /^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]{0,60}$/.test(n)) wb.names[n] = xtext(d).replace(/\$/g, ''); });
        return wb;
    }

    /* ═════════ ODS (LibreOffice) : écrire et lire ═════════ */
    const ODS_NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" office:version="1.2"';
    const odsRef = (t, own) => { const sh = t.sheet != null ? `$${quoteSheet(t.sheet)}` : ''; const one = (r, c, ac, ar) => `${ac ? '$' : ''}${colName(c)}${ar ? '$' : ''}${r + 1}`; if (t.t === 'ref') return `[${sh}.${one(t.r, t.c, t.a[0], t.a[1])}]`; return `[${sh}.${one(t.r0, t.c0, t.a[0], t.a[1])}:${sh ? sh : ''}.${one(t.r1, t.c1, t.a[2], t.a[3])}]`; };
    /** formule française → « of:=SUM([.A1:.A3]) » (null si une fonction n'existe pas en anglais) */
    function toOds(f) {
        const T = safeTok(f); if (!T) return null; let ok = true;
        if (T.toks.some(t => t.t === 'name' || (t.t === 'rng' && t.whole))) return null;
        const out = T.toks.map(t => { let x; if (t.t === 'ref' || t.t === 'rng') x = odsRef(t); else if (t.t === 'fn') { const k = fnKey(t.v); if (!k || !FN[k].en) { ok = false; x = t.v; } else x = FN[k].en; } else if (t.t === 'sep') x = ';'; else if (t.t === 'num') x = String(t.v); else if (t.t === 'str') x = `"${t.v.replace(/"/g, '""')}"`; else if (t.t === 'bool') x = t.v ? 'TRUE()' : 'FALSE()'; else x = t.raw; return (t.pre || '') + x; }).join('');
        return ok ? 'of:=' + out : null;
    }
    /** « of:=SUM([.A1:.A3]) » → « =SOMME(A1:A3) » */
    function fromOds(f) {
        let s = String(f || '').replace(/^(of|oooc|msoxl):/, '').replace(/^=/, '');
        s = s.replace(/\[(\$?(?:'(?:[^']|'')+'|[^.\]:'$]+))?\.(\$?[A-Z]{1,3}\$?\d+)(?::(\$?(?:'(?:[^']|'')+'|[^.\]:'$]+))?\.(\$?[A-Z]{1,3}\$?\d+))?\]/gi, (m, s1, a, s2, b) => { const sh = s1 ? s1.replace(/^\$/, '') + '!' : ''; return sh + a + (b ? ':' + b : ''); });
        if (/\[/.test(s)) return null;
        let toks; try { toks = tokenize(s, 'fr'); } catch (_) { return null; }
        let ok = true; const out = serialize(toks, 'fr', t => { const k = fnKey(t.v); if (!k) { ok = false; return t.v; } return k; });
        return ok ? '=' + out : null;
    }
    const cmPx = v => { const m = /^([\d.]+)(cm|mm|in|pt|px)$/.exec(String(v || '')); if (!m) return 0; const n = Number(m[1]); return Math.round(m[2] === 'cm' ? n * 37.8 : m[2] === 'mm' ? n * 3.78 : m[2] === 'in' ? n * 96 : m[2] === 'pt' ? n * 1.333 : n); };
    async function toOdsFile(wb, calc) {
        calc = calc || new Calc(wb);
        const auto = [], cellStyle = new Map(), colStyle = new Map(), rowStyle = new Map();
        auto.push('<number:number-style style:name="N2"><number:number number:decimal-places="2" number:min-decimal-places="2" number:grouping="true"/></number:number-style>');
        auto.push('<number:percentage-style style:name="NP"><number:number number:decimal-places="0" number:min-decimal-places="0"/><number:text>%</number:text></number:percentage-style>');
        auto.push('<number:currency-style style:name="NE"><number:number number:decimal-places="2" number:min-decimal-places="2" number:grouping="true"/><number:text> </number:text><number:currency-symbol number:language="fr" number:country="FR">€</number:currency-symbol></number:currency-style>');
        auto.push('<number:date-style style:name="ND"><number:day number:style="long"/><number:text>/</number:text><number:month number:style="long"/><number:text>/</number:text><number:year number:style="long"/></number:date-style>');
        const ce = st => {
            const k = JSON.stringify(st); if (cellStyle.has(k)) return cellStyle.get(k);
            const name = 'ce' + (cellStyle.size + 1), ds = {num: 'N2', pct: 'NP', eur: 'NE', date: 'ND'}[st.fmt];
            const cp = [st.fill ? `fo:background-color="${xmlEsc(safeCol(st.fill))}"` : '', st.wrap ? 'fo:wrap-option="wrap"' : '', st.v ? `style:vertical-align="${st.v}"` : '', st.bd ? (st.bd.length === 4 ? `fo:border="${st.bs === 'thick' ? '0.06cm' : '0.02cm'} ${st.bs === 'double' ? 'double' : 'solid'} ${xmlEsc(safeCol(st.bc) || '#000000')}"` : [...st.bd].map(k => `fo:border-${{t: 'top', b: 'bottom', l: 'left', r: 'right'}[k]}="0.02cm solid ${xmlEsc(safeCol(st.bc) || '#000000')}"`).join(' ')) : ''].filter(Boolean).join(' ');
            const tp = [st.b ? 'fo:font-weight="bold"' : '', st.i ? 'fo:font-style="italic"' : '', st.u ? 'style:text-underline-style="solid"' : '', st.color ? `fo:color="${xmlEsc(safeCol(st.color))}"` : '', st.fs ? `fo:font-size="${Math.round(st.fs * 0.75)}pt"` : ''].filter(Boolean).join(' ');
            auto.push(`<style:style style:name="${name}" style:family="table-cell"${ds ? ` style:data-style-name="${ds}"` : ''}>${cp ? `<style:table-cell-properties ${cp}/>` : ''}${st.h ? `<style:paragraph-properties fo:text-align="${st.h === 'left' ? 'start' : st.h === 'right' ? 'end' : 'center'}"/>` : ''}${tp ? `<style:text-properties ${tp}/>` : ''}</style:style>`);
            cellStyle.set(k, name); return name;
        };
        const co = w => { const k = String(w); if (colStyle.has(k)) return colStyle.get(k); const n = 'co' + (colStyle.size + 1); auto.push(`<style:style style:name="${n}" style:family="table-column"><style:table-column-properties style:column-width="${(w / 37.8).toFixed(3)}cm"/></style:style>`); colStyle.set(k, n); return n; };
        const ro = h => { const k = String(h); if (rowStyle.has(k)) return rowStyle.get(k); const n = 'ro' + (rowStyle.size + 1); auto.push(`<style:style style:name="${n}" style:family="table-row"><style:table-row-properties style:row-height="${(h / 37.8).toFixed(3)}cm" style:use-optimal-row-height="false"/></style:style>`); rowStyle.set(k, n); return n; };
        const tables = wb.sheets.map((sh, si) => {
            const g = usedRange(sh); let rMax = g ? g.r1 : 0, cMax = g ? g.c1 : 0;
            calc.spillOf.forEach((sz, key) => { const [s, r, c] = unkey(key); if (s === si) { rMax = Math.max(rMax, r + sz.h - 1); cMax = Math.max(cMax, c + sz.w - 1); } });
            const merges = new Map(), covered = new Set();
            sh.merges.forEach(m => { const q = parseRange(m); if (!q) return; merges.set(addr(q.r0, q.c0), q); for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) if (r !== q.r0 || c !== q.c0) covered.add(addr(r, c)); });
            let cols = ''; for (let c = 0; c <= cMax; c++) { const x = sh.cols[colName(c)] || {}; cols += `<table:table-column table:style-name="${co(x.w || 90)}"${x.hidden ? ' table:visibility="collapse"' : ''}/>`; }
            let rows = '';
            for (let r = 0; r <= rMax; r++) {
                const ri = sh.rows[String(r + 1)] || {}; let cells = '', empty = 0;
                const flush = () => { if (empty) { cells += `<table:table-cell${empty > 1 ? ` table:number-columns-repeated="${empty}"` : ''}/>`; empty = 0; } };
                for (let c = 0; c <= cMax; c++) {
                    const k = addr(r, c), cell = sh.cells[k], raw = cellRaw(cell), v = calc.val(si, r, c), st = wb.styles[cell?.s] || {};
                    if (covered.has(k)) { flush(); cells += '<table:covered-table-cell/>'; continue; }
                    if ((v == null || v === '') && !cell?.s && !merges.has(k)) { empty++; continue; }
                    flush();
                    const m = merges.get(k), span = m ? ` table:number-columns-spanned="${m.c1 - m.c0 + 1}" table:number-rows-spanned="${m.r1 - m.r0 + 1}"` : '';
                    const fml = isFormula(raw) && !calc.spillOf.has(ROWKEY(si, r, c)) ? toOds(raw) : null, fa = fml ? ` table:formula="${xmlEsc(fml)}"` : '';
                    let sty = cell?.s ? ce(st) : '', attrs = '', p = formatValue(v, st);
                    if (v == null || v === '') attrs = '';
                    else if (typeof v === 'number') attrs = st.fmt === 'pct' ? ` office:value-type="percentage" office:value="${v}"` : st.fmt === 'eur' ? ` office:value-type="currency" office:currency="EUR" office:value="${v}"` : ` office:value-type="float" office:value="${v}"`;
                    else if (typeof v === 'boolean') attrs = ` office:value-type="boolean" office:boolean-value="${v}"`;
                    else if (v instanceof SDate || isDateText(v) && !String(raw ?? '').startsWith("'")) { const d = v instanceof SDate ? serialYmd(v.serial) : readActDate(v), q = x => String(x).padStart(2, '0'); attrs = ` office:value-type="date" office:date-value="${String(d.y).padStart(4, '0')}-${q(d.m)}-${q(d.d)}"`; sty = ce({...st, fmt: 'date'}); }
                    else if (isErr(v)) attrs = ' office:value-type="string"';
                    else attrs = ' office:value-type="string"';
                    const text = String(p).split('\n').map(x => `<text:p>${xmlEsc(x)}</text:p>`).join('');
                    cells += `<table:table-cell${sty ? ` table:style-name="${sty}"` : ''}${attrs}${fa}${span}>${v == null || v === '' ? '' : text}</table:table-cell>`;
                }
                flush();
                rows += `<table:table-row${ri.h ? ` table:style-name="${ro(ri.h)}"` : ''}${ri.hidden ? ' table:visibility="collapse"' : ''}>${cells || '<table:table-cell/>'}</table:table-row>`;
            }
            return `<table:table table:name="${xmlEsc(sh.name)}">${cols}${rows}</table:table>`;
        });
        const content = `${XML_HEAD}<office:document-content ${ODS_NS}><office:automatic-styles>${auto.join('')}</office:automatic-styles><office:body><office:spreadsheet>${tables.join('')}</office:spreadsheet></office:body></office:document-content>`;
        const manifest = `${XML_HEAD}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
        const styles = `${XML_HEAD}<office:document-styles ${ODS_NS}><office:styles/></office:document-styles>`;
        const meta = `${XML_HEAD}<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2"><office:meta><meta:generator>LCNDA</meta:generator></office:meta></office:document-meta>`;
        return makeZip([{name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet', store: true}, {name: 'META-INF/manifest.xml', data: manifest}, {name: 'content.xml', data: content}, {name: 'styles.xml', data: styles}, {name: 'meta.xml', data: meta}], 'application/vnd.oasis.opendocument.spreadsheet');
    }
    async function fromOdsFile(buf) {
        const z = await unzip(buf);
        const txt = await z.text('content.xml'); if (!txt) throw new Error('ce n’est pas un fichier LibreOffice (.ods) : content.xml manque');
        const X = parseXml(txt), wb = newWorkbook(); wb.sheets = [];
        // styles automatiques
        const dataFmt = {}; ['number-style', 'percentage-style', 'currency-style', 'date-style'].forEach(k => findAll(X, k).forEach(n => { dataFmt[n.a['style:name']] = k === 'percentage-style' ? {fmt: 'pct'} : k === 'currency-style' ? {fmt: 'eur'} : k === 'date-style' ? {fmt: 'date'} : (() => { const nn = findAll(n, 'number')[0]; const d = Number(nn?.a['number:decimal-places'] || 0); return nn?.a['number:grouping'] === 'true' ? {fmt: 'num', dec: d} : d ? {dec: d} : {}; })(); }));
        const cellSt = {}, colW = {}, rowH = {};
        findAll(X, 'style').forEach(s => {
            const name = s.a['style:name'], fam = s.a['style:family'];
            if (fam === 'table-column') { const w = cmPx(kid(s, 'table-column-properties')?.a['style:column-width']); if (w) colW[name] = w; return; }
            if (fam === 'table-row') { const h = cmPx(kid(s, 'table-row-properties')?.a['style:row-height']); if (h) rowH[name] = h; return; }
            if (fam !== 'table-cell') return;
            const st = {}, tp = kid(s, 'text-properties')?.a || {}, cp = kid(s, 'table-cell-properties')?.a || {}, pp = kid(s, 'paragraph-properties')?.a || {};
            if (tp['fo:font-weight'] === 'bold') st.b = 1; if (tp['fo:font-style'] === 'italic') st.i = 1; if (tp['style:text-underline-style'] && tp['style:text-underline-style'] !== 'none') st.u = 1;
            if (safeCol(tp['fo:color']) && !/^#0{6}$/i.test(tp['fo:color'])) st.color = safeCol(tp['fo:color']);
            if (safeCol(cp['fo:background-color']) && cp['fo:background-color'] !== 'transparent') st.fill = safeCol(cp['fo:background-color']);
            if (cp['fo:wrap-option'] === 'wrap') st.wrap = 1;
            const bdAll = cp['fo:border'] && cp['fo:border'] !== 'none'; let bd = bdAll ? 'tblr' : ''; if (!bdAll) [['top', 't'], ['bottom', 'b'], ['left', 'l'], ['right', 'r']].forEach(([n, k]) => { if (cp['fo:border-' + n] && cp['fo:border-' + n] !== 'none') bd += k; }); if (bd) st.bd = bd;
            const ta = pp['fo:text-align']; if (ta) st.h = ta === 'center' ? 'center' : ta === 'end' || ta === 'right' ? 'right' : 'left';
            Object.assign(st, dataFmt[s.a['style:data-style-name']] || {});
            cellSt[name] = st;
        });
        let total = 0;
        const tables = findAll(X, 'table').filter(t => t.n === 'table:table' || local(t.n) === 'table');
        if (tables.length > LIMITS.sheets) throw new Error('fichier refusé : trop de feuilles');
        for (const tb of tables) {
            const sh = newSheet(cleanSheetName(tb.a['table:name'], wb.sheets.map(s => s.name)));
            let c = 0; findAll(tb, 'table-column').forEach(col => { const rep = Math.min(Number(col.a['table:number-columns-repeated']) || 1, 1024); const w = colW[col.a['table:style-name']]; for (let i = 0; i < rep && c < LIMITS.cols; i++, c++) { const o = {}; if (w && Math.abs(w - 85) > 3) o.w = Math.max(16, Math.min(1200, w)); if (col.a['table:visibility'] === 'collapse') o.hidden = true; if (Object.keys(o).length) sh.cols[colName(c)] = o; } });
            let r = 0;
            for (const row of findAll(tb, 'table-row')) {
                const rrep = Number(row.a['table:number-rows-repeated']) || 1;
                const cellEls = (row.c || []).filter(x => typeof x === 'object' && /table-cell$/.test(x.n));
                const hasContent = cellEls.some(x => local(x.n) === 'table-cell' && (x.a['office:value-type'] || x.a['table:formula'] || x.c.length));
                if (!hasContent) { r += rrep; if (r > LIMITS.rows) break; continue; }
                const times = Math.min(rrep, 1000);
                for (let k = 0; k < times && r < LIMITS.rows; k++, r++) {
                    const rh = rowH[row.a['table:style-name']]; if (rh && Math.abs(rh - 17) > 2) (sh.rows[String(r + 1)] = sh.rows[String(r + 1)] || {}).h = Math.max(12, Math.min(600, rh));
                    if (row.a['table:visibility'] === 'collapse') (sh.rows[String(r + 1)] = sh.rows[String(r + 1)] || {}).hidden = true;
                    let cc = 0;
                    for (const ce of cellEls) {
                        const crep = Number(ce.a['table:number-columns-repeated']) || 1;
                        if (local(ce.n) === 'covered-table-cell') { cc += crep; continue; }
                        const vt = ce.a['office:value-type'], fml = ce.a['table:formula'], has = vt || fml || ce.c.length;
                        if (!has && !ce.a['table:style-name']) { cc += crep; continue; }
                        const n = has ? Math.min(crep, 1024) : 0;
                        for (let j = 0; j < n && cc < LIMITS.cols; j++, cc++) {
                            if (++total > LIMITS.cells) throw new Error('fichier refusé : trop de cellules');
                            let v = null;
                            if (vt === 'float' || vt === 'percentage' || vt === 'currency') v = Number(ce.a['office:value']);
                            else if (vt === 'boolean') v = ce.a['office:boolean-value'] === 'true';
                            else if (vt === 'date') { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(ce.a['office:date-value'] || ''); v = m ? `${m[3]}/${m[2]}/${m[1]}` : null; }
                            else if (vt === 'time') v = findAll(ce, 'p').map(xtext).join('\n');
                            else v = kids(ce, 'p').map(xtext).join('\n') || null;
                            if (typeof v === 'number' && !Number.isFinite(v)) v = null;
                            if (typeof v === 'string' && /^[=+\-@]/.test(v)) v = "'" + v;
                            const f = fml ? fromOds(fml) : null, st = cellSt[ce.a['table:style-name']] || {}, sid = styleId(wb, st);
                            const cell = {v: f || v}; if (sid) cell.s = sid;
                            if (cell.v != null || cell.s) sh.cells[addr(r, cc)] = cell;
                            const cs = Number(ce.a['table:number-columns-spanned']) || 1, rs = Number(ce.a['table:number-rows-spanned']) || 1;
                            if ((cs > 1 || rs > 1) && j === 0 && sh.merges.length < 10000) sh.merges.push(rangeStr({r0: r, c0: cc, r1: r + Math.min(rs, 5000) - 1, c1: cc + Math.min(cs, 500) - 1}));
                        }
                        if (!has) cc += crep;
                        else cc += Math.max(0, crep - n);
                    }
                }
                if (rrep > times) r += rrep - times;
            }
            wb.sheets.push(sh);
        }
        if (!wb.sheets.length) wb.sheets.push(newSheet('Feuille 1'));
        return wb;
    }

    /* ═════════ JSON ═════════ */
    /** les données (valeurs calculées) : {sheets: [{name, rows}]} */
    function toJsonData(wb, calc) { calc = calc || new Calc(wb); return {format: 'lcnda-tableur-donnees', sheets: wb.sheets.map((sh, si) => ({name: sh.name, rows: matrix(wb, calc, si)}))}; }
    /** un JSON reçu : classeur de l'app, {sheets:[{name, rows}]}, tableau de lignes, ou liste d'objets (les clés deviennent les titres) */
    function fromJson(text) {
        let j; try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error('ce fichier n’est pas un JSON valide'); }
        if (j && typeof j === 'object' && !Array.isArray(j) && j.format === 'lcnda-tableur' && j.workbook) j = j.workbook;
        if (j && typeof j === 'object' && Array.isArray(j.sheets) && j.sheets.some(s => s && s.cells)) return normalize(j);
        const fromRows = (name, rows) => { const sh = newSheet(name); sh.cells = rowsToCells(rows.map(r => (Array.isArray(r) ? r : [r]).map(v => (v != null && typeof v === 'object' ? JSON.stringify(v) : v)))); return sh; };
        const objs = arr => { const keys = []; arr.slice(0, 10000).forEach(o => Object.keys(o || {}).forEach(k => { if (!keys.includes(k) && keys.length < 200) keys.push(k); })); return [keys, ...arr.map(o => keys.map(k => o?.[k] ?? ''))]; };
        const asRows = d => (Array.isArray(d) && d.every(x => x && typeof x === 'object' && !Array.isArray(x)) ? objs(d) : Array.isArray(d) ? d : null);
        const wb = newWorkbook(); wb.sheets = [];
        if (j && typeof j === 'object' && Array.isArray(j.sheets)) j.sheets.slice(0, LIMITS.sheets).forEach((s, i) => { const rows = asRows(s?.rows || s?.data || []); if (rows) wb.sheets.push(fromRows(cleanSheetName(s?.name || `Feuille ${i + 1}`, wb.sheets.map(x => x.name)), rows)); });
        else { const rows = asRows(j); if (!rows) throw new Error('je ne trouve pas de tableau dans ce JSON (il faut une liste de lignes ou d’objets)'); wb.sheets.push(fromRows('Feuille 1', rows)); }
        if (!wb.sheets.length) wb.sheets.push(newSheet('Feuille 1'));
        return normalize(wb);
    }
    /** un fichier reçu (nom + ArrayBuffer) → {wb, kind, info} : xlsx, ods, json, csv / tsv / txt */
    async function readFile(name, buf, {encoding = 'auto', sep = null} = {}) {
        const low = String(name || '').toLowerCase(), u8 = new Uint8Array(buf);
        if (u8.length > LIMITS.fileBytes) throw new Error(`fichier trop gros (plus de ${Math.round(LIMITS.fileBytes / 1048576)} Mo)`);
        const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
        if (/\.xls$/.test(low) && !isZip) throw new Error('les anciens fichiers Excel (.xls) ne sont pas lus : ouvre-le dans Excel ou LibreOffice et enregistre-le en .xlsx');
        if (isZip) {
            const z = await unzip(buf);
            if (z.has('xl/workbook.xml')) return {wb: await fromXlsx(buf), kind: 'xlsx'};
            if (z.has('content.xml')) return {wb: await fromOdsFile(buf), kind: 'ods'};
            throw new Error('ce fichier compressé n’est ni un .xlsx ni un .ods');
        }
        const d = decodeBytes(u8, encoding);
        if (/\.json$/.test(low) || /^\s*[\[{]/.test(d.text.slice(0, 50)) && !/\.(csv|tsv|txt)$/.test(low)) return {wb: fromJson(d.text), kind: 'json', encoding: d.encoding};
        const s = sep || (/\.tsv$/.test(low) ? '\t' : sniffSep(d.text));
        const rows = parseCSV(d.text, {sep: s});
        const wb = newWorkbook(); wb.sheets[0].name = cleanSheetName(String(name || 'Feuille 1').replace(/\.[^.]+$/, '').slice(0, 60) || 'Feuille 1'); wb.sheets[0].cells = rowsToCells(rows);
        return {wb: normalize(wb), kind: s === '\t' ? 'tsv' : 'csv', encoding: d.encoding, sep: s, rows: rows.length};
    }

    /* ═════════ Ce que voient l'outil et la vague 2 (Diagrammes, Tableaux, Recueils…) ═════════ */
    return {
        LIMITS, FN, ALIAS, fnKey, explain, errHint, suggest,
        colName, colNum, addr, parseAddr, parseRange, rangeStr, inRange, safeCol, fold, esc, quoteSheet,
        SErr, SDate, SArr, isErr, isFormula, toNum, toStr, toN, truthy, cellRaw, constVal,
        readActDate, republicanToGregorian, gregorianToRepublican, ymdSerial, serialYmd,
        tokenize, parseFormula, formulaMode, serialize, shiftFormula, adjustFormula, renameInFormula, refsOf, cycleAbs, toEnglish, toFrench,
        Calc, parseInput, formatValue, kindOf, sortKey, compareKeys, fillSeries,
        decodeBytes, ENC_LABEL, sniffSep, parseCSV, toCSV, csvSafe, csvCell, parseClipboard,
        parseXml, xmlEsc, crc32, zipStore, makeZip, unzip,
        newWorkbook, newSheet, normalize, compact, cleanStyle, styleId, cleanSheetName, usedRange, matrix, rowsToCells,
        toXlsx, fromXlsx, toOds: toOdsFile, fromOds: fromOdsFile, odsFormula: toOds, odsToFormula: fromOds, toJsonData, fromJson, readFile,
    };
});
