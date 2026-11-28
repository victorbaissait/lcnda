/**
 * ＋ Mes listes — le calcul, sans écran (window.LCNDA_LISTES_PERSO_CORE ; aussi require() dans Node pour les essais).
 *  - lire : CSV / TSV (séparateur et encodage devinés), tableau collé (d'un tableur : tabulations ; d'une page web : <table>),
 *    JSON (tableau d'objets ou de lignes, ou une liste partagée « lcnda_list ») ; XLSX / ODS passent par le moteur des tableaux
 *    (LCNDA_SHEET.readFile) dans l'écran ;
 *  - comprendre les colonnes : texte, catégorie, nombre, date (« 12 mars 1813 », « 12/03/1813 », « mars 1813 », « an II » :
 *    LCNDA_SHEET.readActDate), année, lieu / commune (nom ou code Insee : reconnus par la base, lib/listes_perso.php),
 *    latitude, longitude, lien internet, personne ;
 *  - préparer chaque ligne pour le moteur des Listes (app-listes-donnees.js) : dates en AAAA-MM-JJ, nombres, _lat/_lon, _y1/_y2.
 * Une case qui ressemble à une formule de tableur (« =… », « @… », « +NOM( ») n'entre pas : elle est vidée et comptée.
 * Essai : tests/test-listes-perso.js
 */
(function (root, factory) {
    const M = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = M;
    if (typeof window !== 'undefined') window.LCNDA_LISTES_PERSO_CORE = M;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
    'use strict';
    const LIMITS = {bytes: 50 * 1024 * 1024, rows: 500000, cols: 200, cell: 5000, chunk: 5000};
    const TYPES = ['text', 'enum', 'number', 'date', 'year', 'place', 'lat', 'lon', 'url', 'person'];
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toLowerCase().replace(/[’'`´]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const isFormula = s => typeof s === 'string' && (/^\s*[=@]/.test(s) || /^\s*[+\-]\s*[A-Za-z(]/.test(s));

    /** une case → texte propre ; une formule → '' (comptée) */
    function cleanCell(v, stats) {
        if (v == null) return '';
        let s = typeof v === 'number' ? String(v) : String(v);
        s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (isFormula(s)) { if (stats) stats.formulas = (stats.formulas || 0) + 1; return ''; }
        if (/^#[A-Z/0-9!?]+$/.test(s) && s.length < 9) return '';
        if (s.length > LIMITS.cell) { if (stats) stats.cut = (stats.cut || 0) + 1; s = s.slice(0, LIMITS.cell); }
        return s;
    }

    /* ═════════ lire ═════════ */
    function sniffSep(text) {
        const lines = []; let cur = '', q = false;
        for (let i = 0; i < text.length && lines.length < 30; i++) { const ch = text[i]; if (ch === '"') q = !q; if (!q && (ch === '\n' || ch === '\r')) { if (cur) lines.push(cur); cur = ''; continue; } if (!q) cur += ch; }
        if (cur) lines.push(cur);
        let best = ',', score = -1;
        for (const sep of ['\t', ';', ',', '|']) {
            const counts = lines.map(l => l.split(sep).length - 1); if (!counts.length) continue;
            const min = Math.min(...counts), max = Math.max(...counts); if (max === 0) continue;
            const s = (min === max ? 1000 : 0) + min * 10 + (sep === '\t' ? 5 : sep === ';' ? 3 : 0);
            if (s > score) { score = s; best = sep; }
        }
        return best;
    }
    /** CSV → lignes ; maxRows : on s'arrête après (le reste est compté dans more) */
    function parseDelimited(text, {sep = null, maxRows = LIMITS.rows + 1} = {}) {
        const t = String(text || '').replace(/^﻿/, ''); sep = sep || sniffSep(t);
        const out = []; let row = [], cur = '', q = false, i = 0, more = false; const n = t.length;
        while (i < n) {
            const ch = t[i];
            if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; } cur += ch; i++; continue; }
            if (ch === '"' && cur === '') { q = true; i++; continue; }
            if (ch === sep) { row.push(cur); cur = ''; i++; continue; }
            if (ch === '\r' || ch === '\n') { row.push(cur); cur = ''; out.push(row); row = []; if (ch === '\r' && t[i + 1] === '\n') i++; i++; if (out.length >= maxRows) { more = i < n; break; } continue; }
            cur += ch; i++;
        }
        if (!more && (cur !== '' || row.length)) { row.push(cur); out.push(row); }
        out.more = more; out.sep = sep;
        return out;
    }
    /** octets → texte (BOM, UTF-8, sinon Windows-1252 : vieil Excel) */
    function decodeBytes(u8) {
        if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
        const dec = (name, fatal = false) => new TextDecoder(name, {fatal}).decode(u8);
        if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return {text: dec('utf-8').replace(/^﻿/, ''), encoding: 'utf-8'};
        if (u8[0] === 0xff && u8[1] === 0xfe) return {text: dec('utf-16le').replace(/^﻿/, ''), encoding: 'utf-16le'};
        if (u8[0] === 0xfe && u8[1] === 0xff) return {text: dec('utf-16be').replace(/^﻿/, ''), encoding: 'utf-16be'};
        try { return {text: dec('utf-8', true), encoding: 'utf-8'}; } catch (_) {}
        try { return {text: dec('windows-1252'), encoding: 'windows-1252'}; } catch (_) { return {text: dec('latin1'), encoding: 'latin1'}; }
    }
    /** un JSON : [{…}], [[…]], {rows|data|records: […]} ou une liste partagée {lcnda_list: 1, name, columns, rows} */
    function fromJson(text) {
        let j; try { j = JSON.parse(String(text).replace(/^﻿/, '')); } catch (_) { throw new Error('json'); }
        if (j && j.lcnda_list === 1 && Array.isArray(j.columns) && Array.isArray(j.rows)) {
            const cols = j.columns.filter(c => c && c.key).slice(0, LIMITS.cols);
            return {rows: [cols.map(c => String(c.label || c.key)), ...j.rows.map(r => cols.map(c => (r && typeof r === 'object' ? r[c.key] ?? '' : '')))], header: true,
                shared: {name: String(j.name || ''), icon: String(j.icon || ''), source: String(j.source || ''), licence: String(j.licence || ''), source_url: String(j.source_url || ''), types: cols.map(c => TYPES.includes(c.type) ? c.type : 'text')}};
        }
        const arr = Array.isArray(j) ? j : (j && (j.rows || j.data || j.records || j.items || j.results)) || [];
        if (!Array.isArray(arr) || !arr.length) throw new Error('json');
        if (Array.isArray(arr[0])) return {rows: arr.map(r => (Array.isArray(r) ? r.map(v => (v && typeof v === 'object' ? JSON.stringify(v) : v)) : [])), header: null};
        const cols = []; const seen = new Set();
        for (const o of arr.slice(0, 2000)) if (o && typeof o === 'object') for (const k of Object.keys(o)) if (!seen.has(k) && cols.length < LIMITS.cols) { seen.add(k); cols.push(k); }
        return {rows: [cols, ...arr.map(o => cols.map(c => { const v = o?.[c]; return v && typeof v === 'object' ? JSON.stringify(v) : v; }))], header: true};
    }
    /** du HTML collé (une page web, un tableur) → les lignes du plus grand <table> ; DOMParser n'exécute rien */
    function fromHtml(html, DP) {
        const P = DP || (G && G.DOMParser); if (!P) return null;
        const doc = new P().parseFromString(String(html || ''), 'text/html');
        const tables = [...doc.querySelectorAll('table')]; if (!tables.length) return null;
        const t = tables.sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0];
        const rows = [...t.querySelectorAll('tr')].map(tr => [...tr.children].filter(c => /^(TD|TH)$/.test(c.tagName)).flatMap(c => { const n = Math.min(20, Number(c.getAttribute('colspan')) || 1); return [String(c.textContent || '').replace(/\s+/g, ' ').trim(), ...Array(n - 1).fill('')]; }));
        const head = t.querySelector('thead tr, tr:first-child th') ? true : null;
        return {rows: rows.filter(r => r.length), header: head};
    }
    /** un texte collé : tabulations (tableur), sinon le séparateur deviné */
    function fromText(text) {
        const t = String(text || '').replace(/^﻿/, '');
        const trimmed = t.trim();
        if (/^[\[{]/.test(trimmed)) { try { return fromJson(trimmed); } catch (_) {} }
        const first = t.split(/\r?\n/).find(l => l.trim()) || '';
        const sep = first.includes('\t') ? '\t' : sniffSep(t);
        const rows = parseDelimited(t, {sep});
        return {rows, sep, more: rows.more};
    }

    /** lignes brutes → {head, body, header} ; header : null = deviner */
    function shape(raw, header = null, stats = {}) {
        let rows = (raw || []).filter(r => Array.isArray(r)).map(r => r.map(v => cleanCell(v, stats)));
        rows = rows.filter(r => r.some(c => c !== ''));
        const width = Math.min(LIMITS.cols, rows.reduce((m, r) => Math.max(m, r.length), 0));
        // les colonnes entièrement vides (à droite d'un tableur) ne comptent pas
        const used = Array.from({length: width}, (_, j) => rows.some(r => (r[j] ?? '') !== ''));
        const keep = used.map((u, j) => (u ? j : -1)).filter(j => j >= 0);
        rows = rows.map(r => keep.map(j => r[j] ?? ''));
        const h = header == null ? detectHeader(rows) : !!header;
        const head = h && rows.length ? rows[0].map((c, j) => c || `Colonne ${j + 1}`) : keep.map((_, j) => `Colonne ${j + 1}`);
        const body = h ? rows.slice(1) : rows;
        return {head, body, header: h, stats};
    }
    const looksValue = (s, readDate) => /^-?[\d\s.,/:-]+$/.test(s) || /^https?:\/\//i.test(s) || !!(readDate && /\d{3,4}/.test(s) && readDate(s));
    /** la première ligne est-elle une ligne de titres ? */
    function detectHeader(rows, readDate = dateReader()) {
        if (rows.length < 2) return false;
        const r0 = rows[0].filter(Boolean); if (r0.length < Math.max(1, rows[0].length - 1)) return false;
        if (r0.some(c => looksValue(c, readDate) || c.length > 60)) return false;
        if (new Set(r0.map(fold)).size !== r0.length) return false;
        // une colonne qui contient des valeurs (nombres, dates) en dessous et un mot en tête : des titres
        const sample = rows.slice(1, 40);
        const typed = rows[0].some((_, j) => sample.filter(r => r[j] && looksValue(r[j], readDate)).length >= Math.max(1, sample.filter(r => r[j]).length * 0.6));
        if (typed) return true;
        // des mots de titre connus
        return rows[0].some(c => HINT.some(([, re]) => re.test(fold(c))));
    }

    /* ═════════ comprendre les colonnes ═════════ */
    const HINT = [
        ['lat', /^(lat|latitude|y)$|^lat\b|latitude/],
        ['lon', /^(lon|lng|long|longitude|x)$|^lon\b|^lng\b|longitude/],
        ['url', /^(url|lien|link|lien internet|site|page|adresse web|source url)$|^url\b|\burl$|^lien\b/],
        ['year', /^(an|annee|annees|year|millesime)$|^annee\b|\bannee$/],
        ['date', /^(date|le|jour|ne le|nee le|decede le|date de|date d)|\bdate\b|naissance|deces|mariage|bapteme|inhumation|sepulture|deces le|^ne$|^nee$|^mort$|birth|death|married|baptism/],
        ['place', /^(lieu|lieux|commune|communes|ville|village|paroisse|localite|place|city|town|municipality|code insee|insee|code commune|cog|lieu de|commune de|ville de|lieu d)|\blieu\b|\bcommune\b|\bparoisse\b|\binsee\b/],
        ['person', /^(nom|noms|prenom|prenoms|personne|name|names|nom prenom|nom et prenom|nom complet|defunt|defunte|epoux|epouse|mari|femme|pere|mere|parrain|marraine|temoin|enfant|individu|qui|soldat|conjoint|conjointe|auteur|full name|surname|first name|given name)$|^nom (de famille|d usage|du defunt|de l)|^prenom|^nom$/],
        ['number', /^(nombre|nb|n|total|montant|prix|age|population|habitants|quantite|surface|altitude|count|amount)$|\bnombre\b|\bmontant\b/],
    ];
    const NOT_PERSON = /\b(commune|lieu|ville|paroisse|rue|voie|departement|region|pays|fichier|document|cote|titre|registre)\b/;
    const NUM_RE = /^[-+]?(\d{1,3}([   .]\d{3})+|\d+)([.,]\d+)?$/;
    const parseNumber = s => {
        let x = String(s ?? '').trim().replace(/[\s  ]/g, ''); if (!x || x.length > 30) return null;
        if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '').replace(',', '.'); // 1.234,5
        else if (/^[-+]?\d{1,3}(,\d{3})+\.\d+$/.test(x)) x = x.replace(/,/g, ''); // 1,234.5
        else if (/^[-+]?\d*,\d+$/.test(x)) x = x.replace(',', '.');
        if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(x)) return null;
        const n = Number(x); return Number.isFinite(n) ? n : null;
    };
    const MONTHS = [['janv', 1], ['fevr', 2], ['fev', 2], ['mars', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['juil', 7], ['aout', 8], ['sept', 9], ['oct', 10], ['nov', 11], ['dec', 12],
        ['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4], ['may', 5], ['jun', 6], ['jul', 7], ['aug', 8], ['sep', 9]];
    /** sans le moteur des tableaux : « 12 mars 1813 », « 12/03/1813 », « 1813-03-12 », « mars 1813 », « 1813 » */
    function simpleDate(s) {
        const t = fold(s).replace(/^(le|en|vers|environ|ca|circa)\s+/, ''); let m;
        if ((m = t.match(/^(\d{4}) (\d{1,2}) (\d{1,2})$/))) return {y: +m[1], m: +m[2], d: +m[3]};
        if ((m = t.match(/^(\d{1,2}) (\d{1,2}) (\d{4})$/))) return {y: +m[3], m: +m[2], d: +m[1]};
        if ((m = t.match(/^(1er|\d{1,2})(?: er)? ([a-z]+) (\d{3,4})$/))) { const k = MONTHS.find(([p]) => m[2].startsWith(p)); return k ? {y: +m[3], m: k[1], d: m[1] === '1er' ? 1 : +m[1]} : null; }
        if ((m = t.match(/^([a-z]+) (\d{3,4})$/))) { const k = MONTHS.find(([p]) => m[1].startsWith(p)); return k ? {y: +m[2], m: k[1]} : null; }
        if ((m = t.match(/^(\d{3,4})$/))) return {y: +m[1]};
        return null;
    }
    function dateReader() {
        const SH = G && G.LCNDA_SHEET;
        if (SH && typeof SH.readActDate === 'function') return s => { try { return SH.readActDate(String(s)) || simpleDate(s); } catch (_) { return simpleDate(s); } };
        return simpleDate;
    }
    const pad = n => String(n).padStart(2, '0');
    /** une date → « AAAA-MM-JJ » (ou « AAAA-MM », « AAAA ») ; null si ce n'est pas une date */
    function isoDate(s, readDate = dateReader()) {
        const t = String(s ?? '').trim(); if (!t || t.length > 60) return null;
        if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(t)) return t.slice(0, 10);
        if (/^\d{5}$/.test(t)) { const n = Number(t); if (n > 2000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return d.toISOString().slice(0, 10); } } // date de série d'Excel
        const r = readDate(t); if (!r || !r.y || r.y < 1 || r.y > 2200) return null;
        const y = String(r.y).padStart(4, '0');
        return r.d && r.m ? `${y}-${pad(r.m)}-${pad(r.d)}` : r.m ? `${y}-${pad(r.m)}` : y;
    }
    const yearOf = v => { const m = String(v ?? '').match(/^-?\d{3,4}/); return m ? Number(m[0]) : null; };
    const isInsee = s => /^\d[\dAB]\d{3}$/.test(String(s || '').trim());
    const looksName = s => { const w = String(s || '').trim().split(/\s+/); if (w.length < 2 || w.length > 6 || /\d/.test(s)) return false; return w.some(x => x.length > 1 && x === x.toUpperCase() && /\p{Lu}/u.test(x)) && w.some(x => /^\p{Lu}\p{Ll}/u.test(x)); };

    /** une colonne : le type le plus probable, d'après son titre et ses valeurs */
    function guessType(label, values, {readDate = dateReader(), placeHits = null} = {}) {
        const f = fold(label), vals = values.filter(v => v !== '' && v != null).slice(0, 400), n = vals.length;
        const hint = (HINT.find(([, re]) => re.test(f)) || [])[0] || '';
        if (!n) return hint === 'person' ? 'person' : hint && hint !== 'number' ? hint : 'text';
        const share = test => vals.filter(test).length / n;
        const nums = share(v => parseNumber(v) != null);
        if (share(v => /^https?:\/\/\S+$/i.test(v)) >= 0.7) return 'url';
        if (hint === 'lat' && share(v => { const x = parseNumber(v); return x != null && x >= -90 && x <= 90; }) >= 0.8) return 'lat';
        if (hint === 'lon' && share(v => { const x = parseNumber(v); return x != null && x >= -180 && x <= 180; }) >= 0.8) return 'lon';
        if (share(v => isInsee(v)) >= 0.8 && (hint === 'place' || (placeHits != null && placeHits >= 0.6))) return 'place';
        const years = share(v => /^\d{3,4}$/.test(v.trim()) && Number(v) >= 500 && Number(v) <= 2100);
        if (years >= 0.8 && (hint === 'year' || hint === 'date' || hint === '')) return 'year';
        const dates = share(v => /\d/.test(v) && !NUM_RE.test(v.trim()) && isoDate(v, readDate) != null);
        if (dates >= 0.7 || (hint === 'date' && dates + years >= 0.6)) return 'date';
        if (hint === 'place' || (placeHits != null && placeHits >= 0.6)) return 'place';
        if (nums >= 0.9) return hint === 'year' && years >= 0.6 ? 'year' : 'number';
        if (hint === 'person' && !NOT_PERSON.test(f) && nums < 0.2) return 'person';
        if (share(looksName) >= 0.6) return 'person';
        const distinct = new Set(vals.map(fold)).size, avg = vals.reduce((a, v) => a + v.length, 0) / n;
        if (n >= 20 && distinct <= 12 && avg <= 25 && nums < 0.5) return 'enum';
        return 'text';
    }
    /** les valeurs d'une colonne à demander à la base (« est-ce une commune ? ») : textes courts, sans chiffres (ou code Insee) */
    function placeCandidates(values, max = 40) {
        const out = new Set();
        for (const v of values) { const s = String(v || '').trim(); if (!s || s.length > 60 || (/\d/.test(s) && !isInsee(s) && !/\(\d{1,3}\)$/.test(s))) continue; out.add(s); if (out.size >= max) break; }
        return [...out];
    }
    /** toutes les colonnes : [{key, label, type, src}] */
    function guessColumns(head, body, {readDate = dateReader(), placeHits = {}} = {}) {
        const used = new Set();
        return head.map((label, j) => {
            const vals = body.slice(0, 400).map(r => r[j] ?? '');
            let type = guessType(label, vals, {readDate, placeHits: placeHits[j] ?? null});
            if ((type === 'lat' || type === 'lon') && used.has(type)) type = 'number';
            used.add(type);
            return {key: 'c' + j, label: String(label || `Colonne ${j + 1}`).slice(0, 120), type, src: j};
        });
    }

    /* ═════════ une ligne pour le moteur des Listes ═════════ */
    /** la valeur affichée et filtrée selon le type */
    function normValue(type, raw, readDate = dateReader()) {
        const s = String(raw ?? '').trim(); if (!s) return '';
        switch (type) {
            case 'number': case 'lat': case 'lon': { const n = parseNumber(s); return n == null ? s : n; }
            case 'year': { const y = yearOf(s); if (y != null) return y; const d = isoDate(s, readDate); return d ? Number(d.slice(0, 4)) : s; }
            case 'date': return isoDate(s, readDate) || s;
            case 'url': return /^https?:\/\//i.test(s) ? s : '';
            default: return s;
        }
    }
    /** une ligne stockée {c0: '…'} → la ligne du moteur ; places : {valeur: [insee, nom, lat, lon, dép.]} */
    function buildRow(raw, cols, places = {}, readDate = dateReader()) {
        const r = {_r: raw._r};
        let lat = null, lon = null, y = [], plc = null;
        for (const c of cols) {
            const v = normValue(c.type, raw[c.key], readDate); r[c.key] = v;
            if (c.type === 'lat' && typeof v === 'number') lat = v;
            if (c.type === 'lon' && typeof v === 'number') lon = v;
            if ((c.type === 'date' || c.type === 'year') && y.length < 2) y.push(yearOf(v));
            if (c.type === 'place' && !plc && v !== '') { const p = places[String(raw[c.key]).trim()]; if (p) plc = p; }
        }
        if (lat != null && lon != null && !(lat === 0 && lon === 0)) { r._lat = lat; r._lon = lon; } else if (plc) { r._lat = Number(plc[2]); r._lon = Number(plc[3]); }
        if (plc) { r._insee = plc[0] || ''; r._commune = plc[1] || ''; r._dep = plc[4] || ''; }
        const ys = y.filter(x => x != null);
        if (ys.length) { r._y1 = Math.min(...ys); r._y2 = Math.max(...ys); }
        return r;
    }
    /** les champs du moteur (app-listes-donnees.js) */
    function fieldsOf(cols) {
        const map = {text: 'text', enum: 'enum', number: 'number', date: 'date', year: 'year', place: 'place', lat: 'number', lon: 'number', url: 'url', person: 'text'};
        return cols.map(c => ({key: c.key, label: c.label, type: map[c.type] || 'text', ...(c.type === 'person' ? {person: true} : {}), ...(c.hidden ? {hidden: true} : {})}));
    }
    /** pour relier les noms aux fiches (app-listes-personnes.js) : nom + prénom séparés, période, commune */
    function personMatchOf(cols) {
        const ps = cols.filter(c => c.type === 'person' && !c.hidden); if (!ps.length) return null;
        const first = ps.find(c => /^prenom/.test(fold(c.label))), last = ps.find(c => c !== first && /^(nom|surname|last)/.test(fold(c.label)));
        const m = {};
        if (first && last) { m.last = last.key; m.first = first.key; }
        if (cols.some(c => c.type === 'date' || c.type === 'year')) m.period = r => (r._y1 != null ? [r._y1, r._y2] : null);
        if (cols.some(c => c.type === 'place')) m.place = r => ({insee: r._insee || '', name: r._commune || '', dep: r._dep || ''});
        return m;
    }
    /** les titres d'un fichier à fusionner → les colonnes existantes (même titre, accents ignorés) ou de nouvelles */
    function mapMerge(cols, head) {
        const out = []; let next = cols.reduce((m, c) => Math.max(m, Number(String(c.key).slice(1)) || 0), -1) + 1; const add = [];
        head.forEach((h, j) => { const c = cols.find(x => fold(x.label) === fold(h)); if (c) out.push({src: j, key: c.key}); else { const k = 'c' + next++; add.push({key: k, label: String(h).slice(0, 120), type: 'text'}); out.push({src: j, key: k}); } });
        return {map: out, added: add};
    }
    /** une liste à partager : JSON relisible par « ＋ Créer ma liste » */
    function shareJson(meta, cols, rows) {
        return JSON.stringify({lcnda_list: 1, name: meta.name, icon: meta.icon, source: meta.source || '', licence: meta.licence || '', source_url: meta.source_url || '',
            columns: cols.map(c => ({key: c.key, label: c.label, type: c.type})), rows: rows.map(r => Object.fromEntries(cols.map(c => [c.key, r[c.key] ?? ''])))});
    }

    return {LIMITS, TYPES, fold, isFormula, cleanCell, sniffSep, parseDelimited, decodeBytes, fromJson, fromHtml, fromText, shape, detectHeader,
        guessType, guessColumns, placeCandidates, parseNumber, isoDate, simpleDate, dateReader, yearOf, isInsee, normValue, buildRow, fieldsOf, personMatchOf, mapMerge, shareJson};
});
