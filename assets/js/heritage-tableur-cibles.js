/**
 * 🧾 Tableur, vague 2 : l'éditeur commun des données de l'app (maquette validée « 🧾 Tableur », écrans G et I).
 *  - ext.sheetTargets : ce que chaque endroit attend ({icon, label, columns(opts), build(objets, opts), fromData, back, preview, create}).
 *    Le tableur ne connaît ni les diagrammes ni les tableaux : il lit ces déclarations. Un autre fichier peut en ajouter
 *    (ext.sheetTargets.census = {...}) : elles apparaissent toutes seules dans « 🎯 Préparer pour… ».
 *  - ext.openSheetEditor({target, data, opts, name, onSave, onClose}) : le tableur en grand, déjà préparé (une feuille par tableau,
 *    les colonnes de l'endroit), avec « ✓ Enregistrer et revenir » ; onSave reçoit les données au format de l'endroit.
 *  - « 🎯 Préparer pour… » (menu Données du tableur) : vérifie les colonnes de la plage (✓ / ⚠️ « C7 contient env. 12 : compté
 *    comme 12 »), montre un aperçu, puis crée la chose (diagramme, graphique, présentation…).
 *  - « 📊 Graphique ▾ » : les types conseillés selon la forme de la plage, puis l'éditeur de diagrammes existant, lié à la plage
 *    (spec.live.sheet = {wb, sh, name, sheet, range, grow, head}) : ext.sheetLink.resolve(spec) relit le classeur à l'affichage.
 *  - ext.openRowsInSheet({name, rows}) : « ⤓ Exporter ▾ → 🧾 Ouvrir dans le tableur » des listes et des statistiques.
 * Le moteur : app-tableur-engine.js (LCNDA_SHEET) ; l'écran : heritage-tableur.js. Mode d'emploi : docs/UI.md (« 🧾 Tableur »).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const X = () => window.LCNDA_SHEET;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = () => ext.diagramRender;
    const DI = () => ext.diagramsInternals;
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const plural = (n, w, p) => (A()?.plural ? A().plural(n, w, p) : `${n} ${n > 1 ? p || w + 's' : w}`);
    const fmtN = n => (Number.isFinite(n) ? n.toLocaleString('fr-FR', {maximumFractionDigits: 6, useGrouping: false}) : '');
    const clone = v => JSON.parse(JSON.stringify(v ?? null));
    const HEAD_STYLE = {b: 1, fill: '#e8eef7'};

    /* ═════════ Valeurs ═════════ */
    const str = v => (v == null ? '' : typeof v === 'number' ? fmtN(v) : typeof v === 'boolean' ? (v ? 'VRAI' : 'FAUX') : String(v));
    /** une case attendue en nombre : {n, warn} — « env. 12 » → 12 (avec un avertissement), « ? » → vide */
    function numOf(v) {
        if (typeof v === 'number') return {n: Number.isFinite(v) ? v : null};
        if (v == null || v === '') return {n: null};
        if (typeof v === 'boolean') return {n: v ? 1 : 0, warn: `contient « ${v ? 'VRAI' : 'FAUX'} » : compté comme ${v ? 1 : 0}`};
        const t = String(v).trim(), n0 = X().toNum(t); if (n0 !== null) return {n: n0};
        if (/^#[A-Z/0-9!?]+$/.test(t)) return {n: null, warn: `contient l’erreur « ${t} » : laissée vide`};
        const m = t.match(/-?\d[\d   ]*(?:[.,]\d+)?/);
        if (m) { const n = X().toNum(m[0].replace(/[   ]/g, '')); if (n !== null) return {n, warn: `contient « ${t.slice(0, 40)} » : compté comme ${fmtN(n)}`}; }
        return {n: null, warn: `« ${t.slice(0, 40)} » n’est pas un nombre : laissé vide`};
    }
    const isColor = v => typeof v === 'string' && !!X()?.safeCol(v) && /^#|^rgb|^hsl/i.test(v.trim());
    const fold = s => (X() ? X().fold(s) : String(s ?? '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();

    /* ═════════ Un tableau lu dans une feuille : {range, head, header, rows} ═════════ */
    /** la première ligne donne-t-elle les titres ? des mots au-dessus de chiffres, ou une ligne de mots au-dessus d'autres lignes */
    function guessHead(m) {
        if (m.length < 2) return false;
        const first = m[0], body = m.slice(1), isN = v => typeof v === 'number';
        if (!first.some(v => typeof v === 'string' && v.trim() !== '')) return false;
        if (first.some(isN) && !first.every(v => isN(v) && v > 1000 && v < 2200 && Number.isInteger(v))) return false; // des chiffres en haut : une ligne comme les autres (sauf des années)
        return first.some((v, j) => typeof v === 'string' && v !== '' && body.some(r => isN(r[j]))) || body.length > 0;
    }
    function tableOf(wb, calc, si, g, head = null) {
        const S = X(), m = S.matrix(wb, calc, si, g).map(r => r.map(v => (v === '' ? null : v)));
        while (m.length && m[m.length - 1].every(v => v == null)) m.pop();
        const h = head == null ? guessHead(m) : !!head;
        return {range: g, head: h, header: h ? (m[0] || []).map(str) : [], rows: h ? m.slice(1) : m, sheet: wb.sheets[si]};
    }
    /** la plage de travail d'un éditeur : la sélection, ou le bloc rempli autour de la case choisie */
    const rangeOf = ed => (ed.sortTarget ? ed.sortTarget() : ed.selClip());

    /* ═════════ Ranger les colonnes : ce que l'endroit attend ↔ les colonnes de la plage ═════════ */
    /**
     * columns : [{k, label, type: 'text'|'number'|'color'|'select', many, optional, choices, alias}]
     * → {map: {k: index | [index…]}, status: [{col, idx, state: 'ok'|'warn'|'none'|'missing', text}], warnings: [{cell, text, r, c}], objs: [{k: valeur}]}
     */
    function mapColumns(table, columns, {fixed = null} = {}) {
        const n = Math.max(table.header.length, ...table.rows.map(r => r.length), 0), used = new Set(), map = {};
        const colVals = j => table.rows.map(r => r[j]).filter(v => v != null && v !== '');
        const numShare = j => { const v = colVals(j); return v.length ? v.filter(x => numOf(x).n !== null && (typeof x === 'number' || !numOf(x).warn)).length / v.length : 0; };
        const colorShare = j => { const v = colVals(j); return v.length ? v.filter(isColor).length / v.length : 0; };
        const head = j => fold(table.header[j] || '');
        const names = c => [c.label, c.k, ...(c.alias || [])].map(fold).filter(Boolean);
        const byHead = c => { for (let j = 0; j < n; j++) if (!used.has(j) && head(j) && names(c).some(x => x === head(j))) return j; for (let j = 0; j < n; j++) if (!used.has(j) && head(j) && names(c).some(x => x.length > 2 && (head(j).startsWith(x) || x.startsWith(head(j))))) return j; return -1; };
        if (fixed) Object.entries(fixed).forEach(([k, v]) => { map[k] = v; (Array.isArray(v) ? v : [v]).forEach(j => j >= 0 && used.add(j)); });
        // 1. les titres qui se reconnaissent
        columns.forEach(c => { if (c.k in map || c.many) return; const j = byHead(c); if (j >= 0) { map[c.k] = j; used.add(j); } });
        // 2. par la sorte des valeurs, dans l'ordre (les colonnes facultatives : seulement si elles se reconnaissent)
        columns.forEach(c => {
            if (c.k in map || c.many) return;
            let j = -1;
            if (c.type === 'color') { for (let x = 0; x < n; x++) if (!used.has(x) && colorShare(x) > .6) { j = x; break; } }
            else if (!c.optional) {
                const fit = x => (c.type === 'number' ? numShare(x) >= .5 : numShare(x) < .5 || x === 0);
                for (let x = 0; x < n; x++) if (!used.has(x) && fit(x)) { j = x; break; }
                if (j < 0) for (let x = 0; x < n; x++) if (!used.has(x)) { j = x; break; }
            }
            map[c.k] = j; if (j >= 0) used.add(j);
        });
        // 3. « plusieurs » (les séries) : toutes les colonnes de chiffres qui restent, dans l'ordre
        columns.forEach(c => { if (!c.many || c.k in map) return; const list = []; for (let j = 0; j < n; j++) if (!used.has(j) && (c.type !== 'number' || numShare(j) >= .5 || (colVals(j).length === 0 && head(j)))) { list.push(j); used.add(j); } map[c.k] = c.max ? list.slice(0, c.max) : list; });
        // les valeurs, avec les avertissements (adresse de la case)
        const warnings = [], g = table.range || {r0: 0, c0: 0}, off = table.head ? 1 : 0;
        const cellName = (i, j) => X().addr(g.r0 + off + i, g.c0 + j);
        const conv = (c, v, i, j) => {
            if (c.type === 'number') { const x = numOf(v); if (x.warn) warnings.push({cell: cellName(i, j), r: g.r0 + off + i, c: g.c0 + j, text: x.warn, k: c.k}); return x.n; }
            if (c.type === 'color') return isColor(v) ? String(v).trim() : '';
            if (c.type === 'select' && c.choices) { const t = fold(str(v)); const hit = c.choices.find(([k, l]) => fold(k) === t || fold(l) === t); return hit ? hit[0] : ''; }
            return str(v);
        };
        const objs = table.rows.filter(r => r.some(v => v != null && v !== '')).map(r => { const i = table.rows.indexOf(r), o = {}; columns.forEach(c => { const j = map[c.k]; if (Array.isArray(j)) o[c.k] = j.map(x => conv(c, r[x], i, x)); else o[c.k] = j >= 0 ? conv(c, r[j], i, j) : (c.type === 'number' ? null : ''); }); return o; });
        const status = columns.map(c => {
            const j = map[c.k], idx = Array.isArray(j) ? j : j >= 0 ? [j] : [];
            const name = x => `${X().colName((g.c0 || 0) + x)}${table.header[x] ? ' · ' + table.header[x] : ''}`;
            if (!idx.length) return {col: c, idx, state: c.optional || c.many && c.min === 0 ? 'none' : 'missing', text: c.optional ? '— aucune —' : 'à trouver'};
            const w = warnings.filter(x => x.k === c.k).length;
            return {col: c, idx, state: w ? 'warn' : 'ok', text: idx.map(name).join(', '), warn: w};
        });
        return {map, status, warnings, objs, ok: !status.some(s => s.state === 'missing')};
    }

    /* ═════════ Un classeur fait de tableaux ═════════ */
    /** sheets : [{name, header, rows, widths: {B: 140}, hidden: [index…], refs: {'r:c': {kind, id}}, freeze}] → un classeur sûr (LCNDA_SHEET.normalize) */
    function bookOf(sheets) {
        const S = X(), wb = S.newWorkbook(); wb.sheets = [];
        const head = S.styleId(wb, HEAD_STYLE);
        sheets.forEach(def => {
            const sh = S.newSheet(S.cleanSheetName(def.name || 'Données', wb.sheets.map(x => x.name)));
            const all = def.header?.length ? [def.header, ...(def.rows || [])] : (def.rows || []);
            sh.cells = S.rowsToCells(all, {typed: def.typed !== false});
            if (def.header?.length) { def.header.forEach((_, j) => { const k = S.addr(0, j); sh.cells[k] = {...(sh.cells[k] || {v: null}), s: head}; }); sh.freeze = {r: 1, c: 0}; }
            Object.entries(def.refs || {}).forEach(([rc, ref]) => { const [r, c] = rc.split(':').map(Number), k = S.addr(r, c); if (sh.cells[k]) sh.cells[k].ref = ref; });
            Object.entries(def.widths || {}).forEach(([c, w]) => { sh.cols[c] = {...(sh.cols[c] || {}), w}; });
            (def.hidden || []).forEach(j => { const c = S.colName(j); sh.cols[c] = {...(sh.cols[c] || {}), hidden: true}; });
            (def.merges || []).forEach(m => sh.merges.push(m));
            Object.entries(def.fills || {}).forEach(([k, fill]) => { const cell = sh.cells[k] = sh.cells[k] || {v: null}; cell.s = S.styleId(wb, {...(wb.styles[cell.s] || {}), fill}); });
            if (def.freeze) sh.freeze = def.freeze;
            if (def.dv) sh.dv = def.dv;
            wb.sheets.push(sh);
        });
        if (!wb.sheets.length) wb.sheets.push(S.newSheet('Données'));
        return S.normalize(wb);
    }
    /** une feuille de l'éditeur → tableau (la feuille entière, la première ligne = les titres) */
    const sheetTable = (ed, si, head = true) => { const S = X(), g = S.usedRange(ed.wb.sheets[si]); return g ? tableOf(ed.wb, ed.calc, si, g, head) : {range: {r0: 0, c0: 0}, head, header: [], rows: [], sheet: ed.wb.sheets[si]}; };
    const headerOf = cols => cols.map(c => c.label);

    /* ═════════ Les endroits (ext.sheetTargets) ═════════ */
    const T = ext.sheetTargets = ext.sheetTargets || {};

    /* 📊 Un diagramme : les colonnes du tableau de sa sorte (heritage-diagrams-render.js : kind.grids) */
    const TABLE_ALIAS = {label: ['nom', 'categorie', 'valeur', 'annee', 'decennie', 'lieu', 'groupe']};
    function gridColumns(kind, g, spec = {}) {
        const cols = (DI()?.gridCols ? DI().gridCols(g, {...spec, kind}) : g.cols).filter(c => c.type !== 'readonly' && c.series === undefined);
        const out = cols.map((c, i) => ({k: c.k, label: c.label, type: c.type === 'number' ? 'number' : c.type === 'color' ? 'color' : c.type === 'select' ? 'select' : 'text', choices: c.choices, optional: c.type === 'color' || c.type === 'select' || (c.type !== 'number' && i > 1) || /facultati|vide =/i.test(c.label), alias: TABLE_ALIAS[c.k]}));
        if (g.series) out.splice(1, 0, {k: '__s', label: 'Série', type: 'number', many: true, max: typeof g.series === 'number' ? g.series : 12});
        return out;
    }
    const kindOf = k => R()?.KINDS?.[k] || null;
    /** un tableau rangé → la partie « grille » d'un diagramme (garde les couleurs choisies par ligne) */
    function gridFromObjs(spec, gi, objs, table, status) {
        const kind = kindOf(spec.kind), g = kind.grids[gi], s = spec, keep = new Map((s[g.key] || []).map(r => [r.label ?? r.name ?? r.word, r.color]).filter(([, c]) => c));
        if (g.series) {
            const st = status.find(x => x.col.k === '__s'), idx = st?.idx || [];
            const n = Math.max(1, idx.length);
            s.series = Array.from({length: n}, (_, j) => ({...(s.series?.[j] || {}), name: (table.header[idx[j]] || s.series?.[j]?.name || `Série ${j + 1}`).slice(0, 80)}));
        }
        s[g.key] = objs.map(o => { const r = {}; Object.entries(o).forEach(([k, v]) => { if (k === '__s') (v || []).forEach((x, j) => { r['s' + j] = x ?? ''; }); else r[k] = v ?? ''; }); const key = r.label ?? r.name ?? r.word; if (!r.color && keep.has(key)) r.color = keep.get(key); if (r.color === '') delete r.color; return r; });
        return s;
    }
    T.diagram = {
        icon: '📊', label: 'Un diagramme', hint: 'catégorie + séries', createLabel: '📊 Créer le diagramme', link: true,
        kinds: () => (DI()?.TEMPLATES?.() || []).filter(t => !t.o && !t.preset && kindOf(t.kind)?.grids?.length),
        columns: (o = {}) => { const k = kindOf(o.kind || 'columns') || kindOf('columns'); return k ? gridColumns(o.kind || 'columns', k.grids[0], o.spec || {}) : [{k: 'label', label: 'Catégorie', type: 'text'}, {k: '__s', label: 'Série', type: 'number', many: true}]; },
        build(objs, o = {}, table = {header: []}, status = []) { const kind = o.kind || 'columns'; const base = o.spec ? clone(o.spec) : {...DI().presetSpec({kind}), kind}; base.kind = kind; base.o = {...(base.o || {}), title: o.title ?? base.o?.title ?? ''}; return gridFromObjs(base, 0, objs, table, status); },
        /** les tableaux du diagramme → une feuille par tableau, aux colonnes de sa sorte */
        fromData(spec) {
            const kind = kindOf(spec.kind); if (!kind) return {sheets: [{name: 'Données', header: ['Catégorie', 'Valeur'], rows: []}]};
            return {sheets: kind.grids.map(g => {
                const cols = DI().gridCols(g, spec).filter(c => c.type !== 'readonly');
                return {name: String(g.label || 'Données').replace(/\s*\(.*$/, '').slice(0, 60), header: cols.map(c => c.label), rows: (spec[g.key] || []).map(r => cols.map(c => { const v = r[c.k]; if (c.type === 'select') return (c.choices || []).find(([k]) => k === v)?.[1] ?? v ?? ''; return v ?? ''; })), widths: {A: 150}};
            })};
        },
        back(ed, spec) {
            const s = clone(spec), kind = kindOf(s.kind); if (!kind) return s;
            kind.grids.forEach((g, gi) => {
                if (gi >= ed.wb.sheets.length) return;
                const table = sheetTable(ed, gi, true), cols = gridColumns(s.kind, g, s);
                const res = mapColumns(table, cols);
                if (g.fixed) { s[g.key] = (s[g.key] || []).map((row, i) => ({...row, ...Object.fromEntries(Object.entries(res.objs[i] || {}).filter(([k]) => k !== '__s'))})); return; }
                gridFromObjs(s, gi, res.objs, table, res.status);
            });
            return s;
        },
        preview: data => (R()?.svg ? `<div class="h-dg-svg">${R().svg(data, 520)}</div>` : ''),
        create(data, ctx) { if (!ext.openDiagramEditor) return toast('L’éditeur de diagrammes n’est pas chargé.', 'error'); return ext.openDiagramEditor(null, {spec: data, name: ctx.name || data.o?.title || 'Diagramme'}); },
    };

    /* 📈 Un graphique (Éditeur de graphiques, « ✍️ Mes propres chiffres ») : {series: [{name, color}], rows: [{label, v: ['42', …]}]} */
    const FREE_COLS = [{k: 'label', label: 'Nom', type: 'text', alias: TABLE_ALIAS.label}, {k: 'v', label: 'Série', type: 'number', many: true, max: 12}];
    const freeTxt = n => (n == null ? '' : String(n).replace('.', ','));
    T.graph = {
        icon: '📈', label: 'Un graphique', hint: 'Éditeur de graphiques', createLabel: '📈 Créer le graphique',
        columns: () => FREE_COLS,
        build(objs, o = {}, table = {header: []}, status = []) {
            const idx = status.find(x => x.col.k === 'v')?.idx || [], old = o.free?.series || [];
            const series = (idx.length ? idx : [0]).slice(0, 12).map((x, j) => ({name: String(table.header[x] || old[j]?.name || (idx.length > 1 ? `Série ${j + 1}` : 'Nombre')).slice(0, 80), color: old[j]?.color || ''}));
            return {series, rows: objs.slice(0, 300).map(r => ({label: String(r.label ?? '').slice(0, 120), v: series.map((_, j) => freeTxt(r.v?.[j]))}))};
        },
        fromData(free) { const f = free || {series: [{name: 'Nombre'}], rows: []}; return {sheets: [{name: 'Mes chiffres', header: ['Nom', ...(f.series || []).map((s, j) => s.name || `Série ${j + 1}`)], rows: (f.rows || []).map(r => [r.label, ...(f.series || []).map((_, j) => r.v?.[j] ?? '')]), widths: {A: 160}}]}; },
        back(ed, free) { const table = sheetTable(ed, 0, true), res = mapColumns(table, FREE_COLS, {fixed: {label: 0}}); return this.build(res.objs, {free}, table, res.status); },
        preview: f => (R()?.svg ? `<div class="h-dg-svg">${R().svg({kind: 'columns', o: {title: ''}, series: f.series.map(s => ({name: s.name})), rows: f.rows.map(r => Object.fromEntries([['label', r.label], ...r.v.map((x, j) => ['s' + j, X().toNum(x) ?? 0])]))}, 520)}</div>` : ''),
        create(free, ctx) {
            if (!ext.importCustomStat) return toast('L’éditeur de graphiques n’est pas chargé.', 'error');
            const name = String(ctx.name || 'Mon graphique').slice(0, 80), r = ext.importCustomStat({format: 'lcnda-widget', widget: {name, kind: 'chart', style: free.series.length > 1 ? 'columns' : 'bars', src: {source: 'manual'}, free}});
            const id = String(r.key || '').replace(/^my:/, '');
            toast(`Graphique « ${name} » ajouté à Mes graphiques (Graphiques, tableau de bord…).`, 'success', {action: {label: '↗ Ouvrir', run: () => ctx.editor?.close(() => ext.editStatFor?.(id))}});
        },
    };

    /* 🧩 Un tableau (Enquêtes → Tableaux, objet « ▦ Tableur ») : {cells: [[texte ou =formule]], merges: [{r, c, rs, cs}], colw, cfill} */
    const rawText = cell => { const v = cell?.v; if (v == null) return ''; if (typeof v === 'number') return fmtN(v); if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX'; const s = String(v); return s[0] === "'" ? s.slice(1) : s; };
    function rawGrid(ed, si, g) { const S = X(), sh = ed.wb.sheets[si], out = []; for (let r = g.r0; r <= g.r1; r++) { const row = []; for (let c = g.c0; c <= g.c1; c++) row.push(rawText(sh.cells[S.addr(r, c)])); out.push(row); } return out; }
    const tsv = rows => rows.map(r => r.map(v => String(v ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
    async function copyText(text, msg) {
        try { await navigator.clipboard.writeText(text); toast(msg, 'success'); return true; }
        catch (_) { toast('Le navigateur refuse de copier ici : sélectionne la plage et fais ' + (A()?.keys?.text ? A().keys.text('⌘C') : '⌘C') + '.', 'error'); return false; }
    }
    T.board = {
        icon: '🧩', label: 'Un tableau', hint: 'objet ▦ Tableur', createLabel: '📋 Copier pour un tableau', keepRaw: true,
        columns: () => [],
        fromData(it) {
            const S = X(), cells = Array.isArray(it?.cells) && it.cells.length ? it.cells : [['']], widths = {}, fills = {};
            (it.colw || []).forEach((w, c) => { if (w) widths[S.colName(c)] = Math.round(Math.max(40, Math.min(400, Number(w) || 100))); });
            Object.entries(it.cfill || {}).forEach(([rc, f]) => { const [r, c] = rc.split(':').map(Number); if (S.safeCol(f) && f !== 'transparent') fills[S.addr(r, c)] = f; });
            return {sheets: [{name: 'Tableau', rows: cells.map(r => (r || []).map(v => String(v ?? ''))), widths, fills, merges: (it.merges || []).map(m => S.rangeStr({r0: m.r, c0: m.c, r1: m.r + Math.max(1, m.rs) - 1, c1: m.c + Math.max(1, m.cs) - 1})), freeze: it.header ? {r: 1, c: it.hcol ? 1 : 0} : it.hcol ? {r: 0, c: 1} : {r: 0, c: 0}}]};
        },
        back(ed, it) {
            const S = X(), sh = ed.wb.sheets[0], g = S.usedRange(sh) || {r0: 0, c0: 0, r1: 0, c1: 0};
            const h0 = (it?.cells || []).length, w0 = Math.max(0, ...(it?.cells || []).map(r => (r || []).length)); // la taille de la grille ne rapetisse pas toute seule
            const cells = rawGrid(ed, 0, {r0: 0, c0: 0, r1: Math.min(Math.max(g.r1, h0 - 1), 499), c1: Math.min(Math.max(g.c1, w0 - 1), 59)});
            const merges = (sh.merges || []).map(m => S.parseRange(m)).filter(q => q && q.r0 < cells.length && q.c0 < cells[0].length).map(q => ({r: q.r0, c: q.c0, rs: q.r1 - q.r0 + 1, cs: q.c1 - q.c0 + 1}));
            const colw = cells[0].map((_, c) => Math.round(sh.cols[S.colName(c)]?.w || it?.colw?.[c] || 100));
            const cfill = {}; cells.forEach((row, r) => row.forEach((_, c) => { const st = ed.wb.styles[sh.cells[S.addr(r, c)]?.s]; if (st?.fill && S.safeCol(st.fill)) cfill[r + ':' + c] = st.fill; }));
            return {cells, merges, colw, cfill};
        },
        fromRange: (ed, g) => rawGrid(ed, ed.si, g),
        preview: rows => miniTable(rows),
        create: rows => copyText(tsv(rows), 'Copié : dans un tableau (Enquêtes → 🧩 Tableaux), colle-le (⌘V) : il devient un objet ▦ Tableur, formules comprises.'),
    };

    /* 📚 Un recueil (tableur d'une page) : {cols: [{id, name}], rows: [{id, c: {colId: texte}, person}], merges} */
    const RID = '_ligne';
    T.recueil = {
        icon: '📚', label: 'Un recueil', hint: 'tableur d’une page', createLabel: '📋 Copier pour un recueil', keepRaw: true,
        columns: () => [],
        fromData(t) {
            const cols = t?.cols || [], rows = t?.rows || [], refs = {}, n = cols.length;
            const hasP = rows.some(r => r.person);
            const out = rows.map((r, i) => { const line = cols.map(c => String(r.c?.[c.id] ?? '')); if (hasP) { line.push(r.person?.name || ''); if (r.person) refs[`${i + 1}:${n}`] = {kind: 'person', id: Number(r.person.id)}; } line.push(r.id); return line; });
            const header = [...cols.map((c, j) => c.name || `Colonne ${j + 1}`), ...(hasP ? ['👤 Fiche (se relie dans la page)'] : []), RID];
            const S = X(), merges = (t?.merges || []).map(m => { const r = rows.findIndex(x => x.id === m.r), c = cols.findIndex(x => x.id === m.c); return r >= 0 && c >= 0 ? S.rangeStr({r0: r + 1, c0: c, r1: r + m.rs, c1: c + m.cs - 1}) : null; }).filter(Boolean);
            return {sheets: [{name: 'Tableau de la page', header, rows: out, refs, hidden: [header.length - 1], typed: false, merges, widths: hasP ? {[S.colName(n)]: 170} : {}}]};
        },
        back(ed, t) {
            const S = X(), sh = ed.wb.sheets[0], g = S.usedRange(sh); if (!g) return {...t, rows: [], merges: []};
            const m = S.matrix(ed.wb, ed.calc, 0, g, {display: true}), head = (m[0] || []).map(String), idCol = head.indexOf(RID), pCol = head.findIndex(h => h.startsWith('👤 Fiche'));
            const dataCols = head.map((h, j) => j).filter(j => j !== idCol && j !== pCol);
            const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            const cols = dataCols.map((j, i) => ({id: t.cols?.[i]?.id || uid('c'), name: String(head[j] ?? '').slice(0, 80)}));
            const byId = new Map((t.rows || []).map(r => [r.id, r])), seen = new Set();
            const rows = m.slice(1).filter(line => line.some((v, j) => j !== idCol && String(v ?? '').trim())).map(line => {
                const old = idCol >= 0 ? byId.get(String(line[idCol] || '')) : null; const keep = old && !seen.has(old.id) ? old : null; if (keep) seen.add(keep.id);
                const row = {id: keep ? keep.id : uid('r'), c: {}}; cols.forEach((c, i) => { const v = String(line[dataCols[i]] ?? ''); if (v.trim()) row.c[c.id] = v.slice(0, 4000); });
                if (keep?.person) row.person = keep.person; return row;
            });
            const gone = (t.rows || []).filter(r => !seen.has(r.id) && r.person);
            const merges = (sh.merges || []).map(x => S.parseRange(x)).filter(q => q && q.r0 >= 1 && q.r0 - 1 < rows.length).map(q => { const ci = dataCols.indexOf(q.c0); return ci < 0 ? null : {r: rows[q.r0 - 1].id, c: cols[ci].id, rs: Math.min(q.r1, rows.length) - q.r0 + 1, cs: Math.min(q.c1 - q.c0 + 1, cols.length - ci)}; }).filter(x => x && (x.rs > 1 || x.cs > 1));
            return {...t, cols, rows, merges, _gone: gone};
        },
        fromRange: (ed, g) => X().matrix(ed.wb, ed.calc, ed.si, g, {display: true}),
        preview: rows => miniTable(rows),
        create: rows => copyText(tsv(rows), 'Copié : dans la page d’un recueil, clique une case du tableau et colle (⌘V).'),
    };

    /* 🎤 Une présentation : un objet Tableau (rows : [[texte]]) ou Graphique (spec d'un diagramme « Catégorie ; Série… ») */
    T.keynote = {
        icon: '🎤', label: 'Une présentation', hint: 'tableau ou graphique', createLabel: '🎤 Créer la présentation', keepRaw: true,
        columns: () => [],
        fromData(o) { if (o?.t === 'chart') return T.diagram.fromData({...(o.spec || {}), kind: o.spec?.kind || 'columns'}); return {sheets: [{name: 'Tableau', rows: (o?.rows || [['']]).map(r => (r || []).map(v => String(v ?? ''))), typed: true}]}; },
        back(ed, o) {
            if (o?.t === 'chart') return T.diagram.back(ed, {...(o.spec || {}), kind: o.spec?.kind || 'columns'});
            const S = X(), g = S.usedRange(ed.wb.sheets[0]); if (!g) return [['']];
            return S.matrix(ed.wb, ed.calc, 0, {r0: 0, c0: 0, r1: Math.min(g.r1, 39), c1: Math.min(g.c1, 15)}, {display: true}).map(r => r.map(v => String(v ?? '').slice(0, 600)));
        },
        fromRange: (ed, g) => X().matrix(ed.wb, ed.calc, ed.si, g, {display: true}).slice(0, 40).map(r => r.slice(0, 16)),
        preview: rows => miniTable(rows),
        create(rows, ctx) {
            if (!ext.keynoteWithObject) return toast('La présentation n’est pas chargée.', 'error');
            if (ctx.asChart && ctx.chart) return ext.keynoteWithObject({t: 'chart', spec: ctx.chart}, ctx.name);
            return ext.keynoteWithObject({t: 'table', head: true, rows}, ctx.name);
        },
    };
    const miniTable = rows => `<div class="xl-prev"><table><tbody>${(rows || []).slice(0, 8).map((r, i) => `<tr>${(r || []).slice(0, 8).map(v => `<${i ? 'td' : 'th'}>${esc(str(v))}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</tbody></table>${(rows || []).length > 8 ? `<small class="muted">… et ${plural(rows.length - 8, 'autre ligne', 'autres lignes')}</small>` : ''}</div>`;

    /* ═════════ « 🧾 Modifier les données » : ouvrir le tableur déjà préparé, puis revenir ═════════ */
    /**
     * openSheetEditor({target, data, opts, name, title, onSave, onClose}) — target : une clé de ext.sheetTargets ou une déclaration ;
     * sans target : data est un classeur (ou des lignes) et onSave reçoit le classeur.
     * onSave(données au format de l'endroit, éditeur) ; rendre false garde le tableur ouvert.
     */
    function openSheetEditor({target = null, data = null, opts = undefined, name = '', title = '', onSave = null, onClose = null, id = 0, select = null} = {}) {
        if (!X() || !ext.openWorkbook) { toast('Le tableur n’est pas chargé.', 'error'); return null; }
        if (id) return ext.openWorkbook({id, select, onSaved: onSave, onClose});
        const t = typeof target === 'string' ? T[target] : target;
        const o = opts === undefined ? data : opts;
        const wb = t ? bookOf(t.fromData(data).sheets) : Array.isArray(data) ? bookOf([{name: 'Données', rows: data}]) : X().normalize(data || X().newWorkbook());
        const cols = t?.columns ? t.columns(typeof o === 'object' && o?.kind ? {kind: o.kind, spec: o} : {}) : [];
        const expect = cols.length ? `Colonnes attendues : ${cols.map(c => `${c.label}${c.many ? ' (une ou plusieurs)' : ''}${c.optional ? ' (facultatif)' : ''}`).join(', ')}` : '';
        const label = title || `${t?.icon || '🧾'} Les données de « ${name || t?.label || 'l’outil'} »`;
        return ext.openWorkbook({data: wb, name: `${name || 'Données'} (données)`, onClose,
            back: {label, title: 'Renvoyer les données là d’où elles viennent', html: `<b>${esc(label)}</b><small>${esc(expect ? expect + ' · ' : '')}Formules, tri, coller depuis Excel… « Fichier → Enregistrer une copie… » garde aussi ce classeur dans le Tableur.</small>`,
                save: async ed => { const out = t ? (t.back ? t.back(ed, o) : null) : X().compact(ed.wb); return onSave ? onSave(out, ed) : true; }}});
    }
    ext.openSheetEditor = openSheetEditor;

    /* ═════════ « ⤓ Exporter ▾ → 🧾 Ouvrir dans le tableur » (listes, statistiques) ═════════ */
    /** rows : [[…]] (la première ligne = les titres) ou le texte d'un CSV ; un nouveau classeur, pas encore rangé */
    function openRowsInSheet({name = 'Tableau', rows = [], csv = '', header = true, sheet = ''} = {}) {
        if (!X() || !ext.openWorkbook) return toast('Le tableur n’est pas chargé.', 'error');
        let m = rows; if (!m?.length && csv) m = X().parseCSV(String(csv).replace(/^﻿/, ''), {sep: X().sniffSep(String(csv).slice(0, 4000))});
        m = (m || []).filter(r => r && r.some(v => v != null && String(v).trim() !== ''));
        if (m.length > 1 && m[0].filter(v => String(v ?? '').trim()).length === 1 && m[1].length > 1) m = m.slice(1); // une première ligne qui n'est que le titre (export d'un graphique)
        if (!m.length) return toast('Rien à ouvrir : la liste est vide.');
        const wb = bookOf([{name: sheet || name, header: header ? m[0].map(str) : null, rows: header ? m.slice(1) : m, widths: {A: 160}}]);
        return ext.openWorkbook({data: wb, name: String(name).slice(0, 180)});
    }
    ext.openRowsInSheet = openRowsInSheet;
    /** le format « 🧾 Tableur » d'une fenêtre d'export E3 */
    ext.sheetExportFormat = (getRows, name) => ({id: 'sheet', label: '🧾 Tableur', hint: 'ouvrir dans le tableur', ext: '', quality: false, copy: false, goLabel: '🧾 Ouvrir dans le tableur', run: async () => { const r = await getRows(); setTimeout(() => (typeof r === 'string' ? openRowsInSheet({name: typeof name === 'function' ? name() : name, csv: r}) : openRowsInSheet({name: typeof name === 'function' ? name() : name, rows: r})), 30); }});

    /* ═════════ 🎯 Préparer pour… ═════════ */
    function prepare(ed, key = '') {
        const S = X(), g = rangeOf(ed), si = ed.si, rng = `${S.quoteSheet(ed.S().name)} ! ${S.rangeStr(g)}`;
        if (!S.usedRange(ed.S())) return toast('La feuille est vide : écris ou colle un tableau, puis choisis-le.');
        const list = Object.entries(T).filter(([, t]) => t && t.label && typeof t.create === 'function');
        let cur = key && T[key] ? key : '', head = null, kind = 'columns', keepLink = true, asChart = false;
        const tbl = () => tableOf(ed.wb, ed.calc, si, g, head);
        ext.openDialog({eyebrow: 'TABLEUR · PRÉPARER POUR…', title: `🎯 Préparer pour… (${rng})`, wide: true, submitLabel: 'Continuer',
            body: '<div class="xl-prep" data-xl-prep></div>',
            onOpen: dlg => {
                const box = dlg.querySelector('[data-xl-prep]'), go = dlg.querySelector('.modal-actions [type=submit]');
                const paint = () => {
                    if (!cur) {
                        box.innerHTML = `<p class="muted">Le tableur sait ce que chaque endroit de l’app attend : choisis où vont ces données. Il vérifie les colonnes de la plage <b>${esc(rng)}</b> et les range comme il faut.</p><div class="xl-prep-tiles">${list.map(([k, t]) => `<button type="button" class="xl-tpl" data-prep-to="${esc(k)}"><b>${esc(t.icon)} ${esc(t.label)}</b><small>${esc(t.hint || '')}</small></button>`).join('')}</div>`;
                        go.hidden = true; return;
                    }
                    const t = T[cur], table = tbl(); go.hidden = false;
                    let body = '', res = null, data = null;
                    if (cur === 'diagram') {
                        const kinds = t.kinds(); if (!kinds.some(x => x.kind === kind)) kind = 'columns';
                        res = mapColumns(table, t.columns({kind}));
                        data = t.build(res.objs, {kind, title: table.head && table.header[0] && !/^\d/.test(table.header[0]) ? `${ed.S().name}` : ed.S().name}, table, res.status);
                        body = `<label class="xl-prep-kind">Dessin<select data-prep-kind>${kinds.map(x => `<option value="${esc(x.kind)}"${x.kind === kind ? ' selected' : ''}>${esc(x.icon)} ${esc(x.label)}</option>`).join('')}</select></label>`;
                    } else if (cur === 'graph') { res = mapColumns(table, t.columns(), {fixed: {label: 0}}); data = t.build(res.objs, {}, table, res.status); }
                    else if (cur === 'keynote') {
                        const all = t.fromRange(ed, g); data = all;
                        const cr = mapColumns(table, T.diagram.columns({kind: 'columns'}));
                        const chartOk = cr.ok && (cr.map.__s || []).length > 0;
                        if (!chartOk) asChart = false;
                        const chart = chartOk ? T.diagram.build(cr.objs, {kind: 'columns', title: ed.S().name}, table, cr.status) : null;
                        box._chart = chart; if (asChart) { res = cr; }
                        body = `<div class="segmented xl-prep-seg" role="tablist"><button type="button" data-prep-as="table" class="${asChart ? '' : 'is-active'}">▦ Un tableau</button><button type="button" data-prep-as="chart" class="${asChart ? 'is-active' : ''}"${chartOk ? '' : ' disabled title="Il faut une colonne de chiffres"'}>📊 Un graphique</button></div>`;
                        if (asChart) data = chart;
                    } else if (t.keepRaw) data = t.fromRange(ed, g);
                    else { res = mapColumns(table, t.columns({})); data = t.build ? t.build(res.objs, {}, table, res.status) : res.objs; }
                    box._data = data; box._res = res;
                    const st = res ? res.status : [];
                    const statusHtml = st.length ? `<table class="xl-prep-map"><thead><tr><th>Ce que ${esc(t.label.replace(/^(Un|Une) /, 'le ').toLowerCase())} attend</th><th>Dans la plage</th><th></th></tr></thead><tbody>${st.map(s => `<tr class="is-${s.state}"><td>${esc(s.col.label)} <small>(${s.col.type === 'number' ? 'nombre' : s.col.type === 'color' ? 'couleur' : s.col.type === 'select' ? 'choix' : 'texte'}${s.col.many ? ', une ou plusieurs' : ''}${s.col.optional ? ', facultatif' : ''})</small></td><td>${esc(s.text)}</td><td>${s.state === 'ok' ? '✓' : s.state === 'warn' ? `⚠️ ${plural(s.warn, 'case', 'cases')}` : s.state === 'none' ? '—' : '⛔'}</td></tr>`).join('')}</tbody></table>` : '';
                    const warns = res?.warnings || [];
                    const wHtml = warns.length ? `<div class="xl-prep-warns">${warns.slice(0, 6).map(w => `<div class="ui-notice ui-notice-warn"><span class="ui-notice-ico" aria-hidden="true">⚠️</span><span>${esc(w.cell)} ${esc(w.text)}. <button type="button" class="link-button" data-prep-cell="${w.r}:${w.c}">Voir la cellule</button></span></div>`).join('')}${warns.length > 6 ? `<small class="muted">… et ${plural(warns.length - 6, 'autre case', 'autres cases')} à vérifier.</small>` : ''}</div>` : '';
                    const miss = res && !res.ok ? UI().notice('error', 'Il manque une colonne : ajoute-la dans la plage, ou choisis une autre plage.') : '';
                    let prev = ''; try { prev = t.preview ? t.preview(data) : ''; } catch (_) { prev = ''; }
                    const link = t.link ? `<label class="checkbox-line"><input type="checkbox" data-prep-link${keepLink ? ' checked' : ''}> Garder le lien : le diagramme suit le tableur (mis à jour quand la plage change)${ed.id ? '' : ' — le classeur sera enregistré dans le Tableur'}</label>` : '';
                    box.innerHTML = `<p><button type="button" class="link-button" data-prep-back>← Autre endroit</button> · <b>${esc(t.icon)} ${esc(t.label)}</b> <span class="muted">${esc(t.hint || '')}</span></p>${body}
                        <label class="checkbox-line"><input type="checkbox" data-prep-head${table.head ? ' checked' : ''}> La première ligne donne les titres</label>
                        <div class="xl-prep-cols"><div>${statusHtml}${wHtml}${miss}${link}</div><div class="xl-prep-prev"><span class="section-label">Aperçu</span>${prev || '<p class="muted">Pas d’aperçu.</p>'}</div></div>`;
                    go.textContent = cur === 'keynote' ? '🎤 Créer la présentation' : t.createLabel || 'Continuer'; go.disabled = !!(res && !res.ok);
                };
                box.addEventListener('click', e => {
                    const b = e.target.closest('button'); if (!b) return;
                    if (b.dataset.prepTo) { cur = b.dataset.prepTo; paint(); }
                    else if (b.hasAttribute('data-prep-back')) { cur = ''; paint(); }
                    else if (b.dataset.prepAs) { asChart = b.dataset.prepAs === 'chart'; paint(); }
                    else if (b.dataset.prepCell) { const [r, c] = b.dataset.prepCell.split(':').map(Number); dlg.close(); ed.select(r, c); ed.focusGrid(); toast('Corrige la cellule, puis rouvre « 🎯 Préparer pour… ».'); }
                });
                box.addEventListener('change', e => {
                    if (e.target.matches('[data-prep-kind]')) { kind = e.target.value; paint(); }
                    if (e.target.matches('[data-prep-head]')) { head = e.target.checked; paint(); }
                    if (e.target.matches('[data-prep-link]')) keepLink = e.target.checked;
                });
                paint();
            },
            onSubmit: async form => {
                const box = form.querySelector('[data-xl-prep]'), t = T[cur]; if (!t) return false;
                const data = box._data, name = ed.S().name === 'Feuille 1' ? ed.name : `${ed.name} — ${ed.S().name}`;
                if (cur === 'diagram' && keepLink) { const linked = await linkSpec(ed, data, g, head ?? tbl().head); if (!linked) return false; return t.create(linked, {name, editor: ed}); }
                return t.create(data, {name, editor: ed, asChart, chart: box._chart});
            }});
    }

    /* ═════════ 📊 Graphique ▾ : les types conseillés selon la forme de la plage ═════════ */
    /** forme de la plage : nombre de séries, de lignes, étiquettes en années ou en tranches d'âge */
    function shapeOf(table) {
        const res = mapColumns(table, T.diagram.columns({kind: 'columns'})), n = (res.map.__s || []).length, labels = res.objs.map(o => String(o.label || ''));
        const years = labels.length > 1 && labels.every(l => /^(1[0-9]|20)\d{2}(\s*s)?$|^(1[0-9]|20)\d0\s*[-–à]/.test(l.trim()));
        const ages = labels.length > 2 && labels.filter(l => /^\d{1,3}\s*([-–à]\s*\d{1,3}|\+|\s*ans|\s*et plus)/i.test(l.trim())).length >= labels.length * .6;
        return {res, n, rows: res.objs.length, years, ages};
    }
    function suggest(shape) {
        const {n, rows, years, ages} = shape, out = [];
        const add = (kind, label) => { if (kindOf(kind) && !out.some(x => x.kind === kind)) out.push({kind, label, icon: kindOf(kind).icon}); };
        if (ages && n === 2) add('pyramid', 'Pyramide des âges');
        if (years) { add('line', n > 1 ? 'Courbes' : 'Courbe'); add('columns', n > 1 ? 'Colonnes groupées' : 'Colonnes'); add('area', 'Aire'); }
        if (n > 1) { add('columns', 'Colonnes groupées'); add('stacked', 'Colonnes empilées'); add('line', 'Courbes'); if (rows >= 3 && rows <= 12) add('radar', 'Radar'); add('bars', 'Barres groupées'); }
        else { add('columns', 'Colonnes'); add('bars', 'Barres horizontales'); add('pie', 'Camembert (une seule série)'); add('donut', 'Anneau'); if (rows <= 30) add('treemap', 'Rectangles proportionnels'); add('line', 'Courbe'); }
        return out.slice(0, 6);
    }
    /** un diagramme lié à la plage : le classeur est enregistré au besoin ; rend la spec avec spec.live.sheet */
    async function linkSpec(ed, spec, g, head) {
        if (ed.ctx?.back) { toast('Ces données reviennent dans leur outil : le diagramme est fait d’une copie (pas de lien).'); return spec; }
        if (!ed.id || ed.dirty) { const id = await ed.save(); if (!id && !ed.id) return null; }
        const S = X(), sh = ed.S(), range = S.rangeStr(g);
        return {...spec, live: {sheet: {wb: ed.id, sh: sh.id, name: ed.name, sheet: sh.name, range, grow: true, head: !!head}, label: `« ${ed.name} » ! ${range}`}};
    }
    /** 📊 graphique vivant (heritage-tableur-plus.js) : la spec du diagramme pour la sélection, sans rien enregistrer → {spec, kinds} ou null */
    ext.sheetChartLive = (ed, kind = '') => {
        const g = rangeOf(ed), table = tableOf(ed.wb, ed.calc, ed.si, g), shape = shapeOf(table); if (!shape.n || !shape.rows) return null;
        const kinds = suggest(shape), k = kind && kinds.some(x => x.kind === kind) ? kind : kinds[0]?.kind || 'columns', res = mapColumns(table, T.diagram.columns({kind: k}));
        return {spec: T.diagram.build(res.objs, {kind: k, title: ''}, table, res.status), kinds, kind: k, range: X().rangeStr(g)};
    };
    ext.sheetChartMenu = (ed, btn) => {
        const S = X(), g = rangeOf(ed), table = tableOf(ed.wb, ed.calc, ed.si, g), shape = shapeOf(table);
        if (!shape.n || !shape.rows) return toast('Choisis une plage avec des nombres (par exemple : Décennie, Hommes, Femmes).');
        if (!ext.openDiagramEditor) return toast('L’éditeur de diagrammes n’est pas chargé.', 'error');
        const open = async kind => {
            const spec = T.diagram.build(mapColumns(table, T.diagram.columns({kind})).objs, {kind, title: table.head && table.header[0] ? `${ed.S().name}` : ed.S().name}, table, mapColumns(table, T.diagram.columns({kind})).status);
            const linked = await linkSpec(ed, spec, g, table.head); if (!linked) return;
            ext.openDiagramEditor(null, {spec: linked, name: `${ed.S().name === 'Feuille 1' ? ed.name : ed.S().name} (${S.rangeStr(g)})`});
        };
        const items = suggest(shape).map(x => ({icon: x.icon, label: x.label, run: () => open(x.kind)}));
        items.push('-', {icon: '🎯', label: 'Tous les types de diagrammes…', run: () => prepare(ed, 'diagram')});
        const anchor = btn && btn.isConnected && btn.offsetParent ? btn : ed.$('[data-xl-cmd="chart"]');
        UI().menuAt(anchor || {x: innerWidth / 2, y: 120}, items, {title: `Conseillés pour ${S.rangeStr(g)}`});
    };

    /* ═════════ Plage liée : relue à l'affichage (diagrammes) ═════════ */
    const books = new Map(); // id → {t, p}
    const getBook = id => { let hit = books.get(id); if (!hit || Date.now() - hit.t > 60000) { hit = {t: Date.now(), p: api('workbook', {id}).catch(() => null)}; books.set(id, hit); } return hit.p; };
    document.addEventListener('lcnda:workbook-saved', e => { const id = Number(e.detail?.id) || 0; if (id) books.delete(id); else books.clear(); });
    ext.sheetLink = {
        /** spec.live.sheet → les chiffres relus dans le classeur (la spec telle quelle si le classeur n'est plus là) */
        async resolve(spec) {
            const L = spec?.live?.sheet; if (!L || !X()) return spec;
            const r = await getBook(Number(L.wb)); if (!r?.data) return {...spec, _sheetMissing: true};
            const S = X(), wb = S.normalize(r.data); let si = wb.sheets.findIndex(x => x.id === L.sh); if (si < 0) si = wb.sheets.findIndex(x => S.fold(x.name) === S.fold(L.sheet || '')); if (si < 0) return {...spec, _sheetMissing: true};
            const calc = new S.Calc(wb); let g = S.parseRange(L.range); if (!g) return spec;
            if (L.grow) { const filled = rr => { for (let c = g.c0; c <= g.c1; c++) { const v = calc.val(si, rr, c); if (v != null && v !== '') return true; } return false; }; let k = 0; while (k < 5000 && filled(g.r1 + 1)) { g = {...g, r1: g.r1 + 1}; k++; } }
            const table = tableOf(wb, calc, si, g, L.head), res = mapColumns(table, T.diagram.columns({kind: spec.kind, spec}));
            const out = gridFromObjs(clone(spec), 0, res.objs, table, res.status);
            out.live = {...spec.live, sheet: {...L, name: r.name || L.name, sheet: wb.sheets[si].name}, label: `« ${r.name || L.name} » ! ${S.rangeStr(g)}`};
            return out;
        },
        /** le bandeau : « 🔗 Données : « Classeur » ! A1:C4 · tenu à jour · 🧾 Modifier les données » */
        bannerHtml(spec) { const L = spec.live.sheet; return `<p class="h-dg-live xl-linkbar">🔗 Données : « ${esc(L.name || 'Classeur')} » ! ${esc(L.range)}${L.sheet ? ` <small>(feuille « ${esc(L.sheet)} »)</small>` : ''} · tenu à jour · <button type="button" class="link-button" data-dg-sheet>🧾 Modifier les données</button> · <button type="button" class="link-button" data-dg-unlive>Les figer</button>${spec._sheetMissing ? '<br>⚠️ Classeur introuvable (supprimé ?) : le dessin garde les derniers chiffres lus.' : ''}</p>`; },
        open(spec, onSaved) { const L = spec.live.sheet; return ext.openWorkbook?.({id: Number(L.wb), select: {sheet: L.sh || L.sheet, range: L.range}, onSaved}); },
    };

    /* ═════════ 🧾 Prendre un classeur du Tableur (Diagrammes → Données) : le classeur (menu de choix), la feuille, la plage ═════════ */
    /** → Promise<{mode: 'copy'|'link', cells: [[texte]], link: {wb, sh, name, sheet, range, grow, head}} | null> */
    ext.chooseSheetRange = ({title = 'Prendre un classeur du Tableur', link = true} = {}) => new Promise(resolve => {
        const P = window.LCNDA_PICKER || A(); let done = false, book = null;
        const S = X(); if (!S) { toast('Le tableur n’est pas chargé.', 'error'); return resolve(null); }
        const cur = dlg => { const si = Number(dlg.querySelector('[name=xl_sheet]')?.value || 0), g = S.parseRange(dlg.querySelector('[name=xl_range]')?.value || ''); return {si, g}; };
        ext.openDialog({eyebrow: 'TABLEUR', title: `🧾 ${title}`, wide: true, submitLabel: 'Prendre ces données',
            body: `<div class="xl-take"><label>Classeur</label>${P.pickerField({name: 'xl_book', kind: 'workbook', placeholder: 'Nom du classeur…'})}<div data-xl-take></div></div>`,
            onOpen: dlg => {
                dlg.addEventListener('close', () => { if (!done) resolve(null); }, {once: true});
                const box = dlg.querySelector('[data-xl-take]');
                const prev = () => { const {si, g} = cur(dlg), out = box.querySelector('[data-xl-takeprev]'); if (!out || !book) return; if (!g) { out.innerHTML = UI().notice('warn', 'Plage illisible : écris par exemple A1:C12.'); return; } out.innerHTML = miniTable(S.matrix(book.wb, book.calc, si, {...g, r1: Math.min(g.r1, g.r0 + 8)}, {display: true})) + `<small class="muted">${plural(g.r1 - g.r0 + 1, 'ligne')} · ${plural(g.c1 - g.c0 + 1, 'colonne')}</small>`; };
                const paintBook = () => {
                    const sh = book.wb.sheets, used = si => { const g = S.usedRange(sh[si]); return g ? S.rangeStr(g) : 'A1'; };
                    box.innerHTML = `<div class="form-grid"><label>Feuille<select name="xl_sheet">${sh.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select></label><label>Plage<input name="xl_range" value="${esc(used(0))}" spellcheck="false" placeholder="A1:C12"></label></div>
                        <div data-xl-takeprev></div>
                        <fieldset class="xl-take-mode"><label class="checkbox-line"><input type="radio" name="xl_mode" value="copy" checked> Copier une fois (les chiffres ne bougent plus)</label>${link ? '<label class="checkbox-line"><input type="radio" name="xl_mode" value="link"> Garder le lien : le diagramme suit le classeur (tenu à jour)</label>' : ''}</fieldset>`;
                    box.querySelector('[name=xl_sheet]').addEventListener('change', e => { box.querySelector('[name=xl_range]').value = used(Number(e.target.value)); prev(); });
                    box.querySelector('[name=xl_range]').addEventListener('input', prev); prev();
                };
                dlg.addEventListener('picker-change', async e => { const id = Number(e.detail?.value) || 0; if (!id) { book = null; box.innerHTML = ''; return; }
                    box.innerHTML = UI()?.spinner ? UI().spinner('Lecture du classeur…') : '…';
                    try { const r = await api('workbook', {id}); const wb = S.normalize(r.data); book = {id, name: r.name, wb, calc: new S.Calc(wb)}; paintBook(); } catch (err) { box.innerHTML = UI().notice('error', err.message); } });
            },
            onSubmit: form => {
                if (!book) return UI().fail(form.querySelector('.pk, [name=xl_book]') || form, 'Choisis un classeur.');
                const {si, g} = cur(form); if (!g) return UI().fail(form.querySelector('[name=xl_range]'), 'Écris une plage, par exemple A1:C12.');
                const m = S.matrix(book.wb, book.calc, si, g).map(r => r.map(str)), mode = form.querySelector('[name=xl_mode]:checked')?.value || 'copy';
                done = true; resolve({mode, cells: m, link: {wb: book.id, sh: book.wb.sheets[si].id, name: book.name, sheet: book.wb.sheets[si].name, range: S.rangeStr(g), grow: true, head: guessHead(S.matrix(book.wb, book.calc, si, g))}});
            }});
    });

    /* ═════════ Dans le tableur : menu Données ═════════ */
    ext.sheetMenuExtra = ext.sheetMenuExtra || [];
    ext.sheetMenuExtra.push({menu: 'Données', cmd: 'prepare', label: '🎯 Préparer pour… (diagramme, graphique, présentation…)'});
    ext.sheetCommands = ext.sheetCommands || {};
    ext.sheetCommands.prepare = (ed, arg) => prepare(ed, arg || '');

    ext.tableurCiblesInternals = {mapColumns, numOf, guessHead, tableOf, bookOf, shapeOf, suggest, prepare, linkSpec}; // pour les essais
})();
