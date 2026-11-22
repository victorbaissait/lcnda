/* LCNDA — 📊 Diagrammes « chiffres, vies et démographie » (lot B, ajoutés au catalogue de heritage-diagrams-render.js) :
 *  Vie et mort : 📐 diagramme de Lexis (âge × année : une vie = une diagonale, mariages, enfants, départs, bandes historiques) ;
 *  Parts : 🔺 diagramme ternaire (trois parts qui font 100 % : secteurs de métiers par village, décennie, famille) ;
 *  Chiffres : 🕯 chandeliers (prix du blé, mercuriales : ouverture, clôture, plus bas, plus haut ; moyenne mobile, années de disette).
 * Et les outils communs des réglages du lot B dans les types qui existaient (heritage-diagram-vie.js, -famille.js, -plus.js,
 * heritage-diagrams-render.js) : l'arbre léger (tresor_tree), les personnes retenues (groupe + « ＋ Critère » + période,
 * api.php?action=diagram_lot_b, lib/diagram_lot_b.php), l'état civil d'une vie, l'état à un âge, les lignées directes,
 * la moyenne et sa marge (Courbe → « 🌳 Des données de mon arbre »).
 * Chaque sorte : {icon, label, group, help, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp}.
 * Les données prises « Depuis l'app » arrivent dans le tableau : on peut ensuite tout retoucher (lignes, valeurs, couleurs).
 * Tout texte passe par esc() ; couleurs vérifiées (R.color) ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const K = R.KINDS;
    const A = () => window.LCNDA_APP;
    const DGO = () => ext.diagramAppOpts;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const isNum = v => v !== '' && v !== null && v !== undefined && Number.isFinite(typeof v === 'number' ? v : parseFloat(String(v).replace(/[\s  ]/g, '').replace(',', '.')));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : R.num(v));
    const color = (c, d) => R.color(c, d);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = [0, 1, 2].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}));
    const fmt = (n, d = 1) => NF[clamp(d, 0, 2)].format(Number(n) || 0);
    const NOW = new Date().getFullYear() + new Date().getMonth() / 12;
    const pal = spec => R.PALETTES?.[spec.o?.palette] || R.PALETTES?.vive || ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
    const pick = (spec, i) => { const p = pal(spec); return p[((i % p.length) + p.length) % p.length]; };
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', baseline = 'middle', op = 0, rotate = 0} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${esc(fill)}"${op ? ` fill-opacity="${op}"` : ''}${rotate ? ` transform="rotate(${r2(rotate)} ${r2(x)} ${r2(y)})"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rows = (spec, key = 'rows', max = 5000) => (Array.isArray(spec?.[key]) ? spec[key] : []).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, max);
    const str = (v, n = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => { msg = i18n(msg); return {h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888888'}), legend: [], desc: msg}; };
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const when = v => { const t = String(v ?? '').replace(/-00\b/g, '').trim(); if (!t) return null; const y = R.when ? R.when(t, false) : (t.match(/-?\d{3,4}/) ? Number(t.match(/-?\d{3,4}/)[0]) : null); return y === null || !Number.isFinite(y) || y < -3000 || y > 3000 ? null : y; };
    const pidList = v => String(v ?? '').split(',').map(x => Math.floor(Number(x))).filter(x => x > 0 && x < 1e9).slice(0, 400);
    const PIDS = (list, title) => (list.length ? ` data-dfa-pids="${list.join(',')}" data-dfa-t="${esc(title)}" style="cursor:pointer"` : '');
    const PID = id => (id > 0 && id < 1e9 ? ` data-dfa-pid="${Math.floor(id)}" style="cursor:pointer"` : '');
    const plural = (n, one, many) => (window.LCNDA_I18N?.plural ? window.LCNDA_I18N.plural(n, one, many) : `${fmt(n, 0)} ${Math.abs(n) >= 2 ? (many || one + 's') : one}`);
    const H_OPT = C('height', 'Hauteur au plus', 'number', {unit: 'px', min: 120, max: 3000});
    const legendOf = list => list.map(([label, c]) => ({label: i18n(label), color: c}));
    const PALETTE = C('palette', 'Couleurs', 'select', {choices: Object.keys(R.PALETTES || {vive: 1}).map(k => [k, k.charAt(0).toUpperCase() + k.slice(1)])});

    /* ═════════════════════ Calculs (purs, testés dans Node) ═════════════════════ */
    /** une date de tresor_tree (« 1850-03-01 ») ou une année → années décimales */
    const dec = (d, y) => { const m = String(d || '').match(/^(-?\d{3,4})-(\d{2})-(\d{2})/); if (m && +m[2] > 0) return +m[1] + (+m[2] - 1) / 12 + (Math.max(1, +m[3]) - 1) / 365; return Number.isFinite(y) && y !== null ? y + .5 : null; };
    const birth = p => (p ? dec(p.bd, p.by) : null), death = p => (p ? dec(p.dd, p.dy) : null);
    const nm = p => (p ? p.name || [p.first, p.last].filter(Boolean).join(' ') || i18n('Sans nom') : '?');
    const commune = (tr, id) => (id && tr.places?.[id] ? String(tr.places[id].name || '').split(',')[0].trim() : '');
    /** l'arbre léger de tresor_tree, avec ses index : byId, kids (parent → enfants), unions (personne → [{fam, spouse}] dans l'ordre), evOf (personne → ses événements et ceux de ses couples) */
    function build(d) {
        const tr = {people: Array.isArray(d?.people) ? d.people : [], families: Array.isArray(d?.families) ? d.families : [], places: d?.places || {}, events: Array.isArray(d?.events) ? d.events : []};
        tr.byId = new Map(tr.people.map(p => [p.id, p])); tr.kids = new Map(); tr.unions = new Map(); tr.evOf = new Map();
        const famOf = new Map(tr.families.map(f => [f.id, f])), push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
        tr.families.forEach(f => [f.a, f.b].forEach((x, i) => { if (!x || !tr.byId.has(x)) return; (f.children || []).forEach(c => push(tr.kids, x, c)); push(tr.unions, x, {fam: f, spouse: i ? f.a : f.b}); }));
        tr.events.forEach(e => { if (e.p) push(tr.evOf, e.p, e); else if (e.f && famOf.has(e.f)) { const f = famOf.get(e.f); [f.a, f.b].forEach(x => { if (x) push(tr.evOf, x, e); }); } });
        // la date d'un couple : le mariage, sinon un an avant le premier enfant
        tr.famDate = f => { if (f.my !== null && f.my !== undefined) return dec(f.md, f.my); const b = (f.children || []).map(c => birth(tr.byId.get(c))).filter(v => v !== null); return b.length ? Math.min(...b) - 1 : null; };
        tr.unions.forEach(l => l.sort((u, v) => (tr.famDate(u.fam) ?? 1e9) - (tr.famDate(v.fam) ?? 1e9)));
        return tr;
    }
    const STATUS = {single: ['Célibataire', '#9ecae1'], married: ['Marié(e)', '#4e79a7'], remarried: ['Remarié(e)', '#59a14f'], widowed: ['Veuf ou veuve', '#e15759'], dead: ['Décédé(e)', '#8c8c8c']};
    /** l'état civil d'une vie, morceau par morceau : [{a, b, state, open}] (b = null : on ne sait pas quand la vie s'arrête) */
    function statusSegs(tr, p, now = NOW) {
        const b = birth(p); if (b === null) return [];
        const end = death(p) ?? (p.living ? now : null), out = []; let cur = b, state = 'single';
        const add = (to, st, open = false) => { if (to === null || to - cur > .02 || open) out.push({a: cur, b: to, state: st, open}); if (to !== null) cur = Math.max(cur, to); };
        const us = (tr.unions.get(p.id) || []).map(u => ({u, m: tr.famDate(u.fam)})).filter(x => x.m !== null);
        for (let i = 0; i < us.length; i++) {
            const m = Math.max(cur, us[i].m); if (end !== null && m >= end) break;
            add(m, state); state = i ? 'remarried' : 'married';
            const sd = death(tr.byId.get(us[i].u.spouse)), next = us[i + 1] ? us[i + 1].m : null;
            if (sd !== null && sd > cur && (end === null || sd < end) && (next === null || sd <= next)) { add(sd, state); state = 'widowed'; }
        }
        add(end, state, end === null);
        return out;
    }
    /** l'état d'une personne une année donnée : track = status (état civil) | place (commune) | job (métier) ; 'dead' si elle est morte ; null si on ne sait pas */
    function stateAt(tr, p, track, year, now = NOW) {
        const b = birth(p), d = death(p); if (b === null || year < b || year > now) return null;
        if (d !== null && d < year) return 'dead';
        if (d === null && !p.living && year - b > 100) return null;
        if (track === 'status') { const s = statusSegs(tr, p, now).find(x => year >= x.a && (x.b === null || year < x.b)) || null; return s ? s.state : null; }
        const ev = (tr.evOf.get(p.id) || []).filter(e => e.y !== null && e.y !== undefined && e.y <= year).sort((x, y) => x.y - y.y);
        if (track === 'place') { const last = [...ev].reverse().find(e => e.place && commune(tr, e.place)); return last ? commune(tr, last.place) : (p.bplace ? commune(tr, p.bplace) || null : null); }
        const job = [...ev].reverse().find(e => e.tag === 'OCCU' && str(e.what)); return job ? str(job.what, 60) : (p.occ && year - b >= 16 ? str(p.occ, 60) : null);
    }
    /** les métiers d'une vie, dans l'ordre : [{a, b, job}] (événements « Profession » datés ; sinon le métier de la fiche, à partir de 16 ans) */
    function jobSegs(tr, p, now = NOW) {
        const b = birth(p); if (b === null) return [];
        const end = death(p) ?? (p.living ? now : null), out = [];
        (tr.evOf.get(p.id) || []).filter(e => e.tag === 'OCCU' && str(e.what) && e.y !== null && e.y !== undefined).sort((x, y) => x.y - y.y).forEach(e => {
            const job = str(e.what, 60), last = out[out.length - 1]; if (last && fold(last.job) === fold(job)) return; if (last) last.b = Math.max(last.a, e.y); out.push({a: Math.max(b, e.y), b: null, job}); });
        if (!out.length && p.occ && (end === null || b + 16 < end)) out.push({a: b + 16, b: null, job: str(p.occ, 60)});
        if (out.length) out[out.length - 1].b = end;
        return out;
    }
    /** les communes d'une vie, dans l'ordre (naissance, puis chaque événement situé ailleurs) : [{a, b, place}] */
    function placeSegs(tr, p, now = NOW) {
        const b = birth(p); if (b === null) return [];
        const end = death(p) ?? (p.living ? now : null), out = [], home = commune(tr, p.bplace);
        if (home) out.push({a: b, b: null, place: home});
        (tr.evOf.get(p.id) || []).filter(e => e.y !== null && e.y !== undefined && e.place && commune(tr, e.place)).sort((x, y) => x.y - y.y).forEach(e => {
            const c = commune(tr, e.place), last = out[out.length - 1]; if (last && last.place === c) return; const a = Math.max(e.y, last ? last.a : b); if (last) last.b = a; out.push({a, b: null, place: c}); });
        if (out.length) out[out.length - 1].b = end;
        return out.filter(x => x.b === null || x.b >= x.a);
    }
    /** les mêmes personnes à plusieurs âges (diagramme alluvial) : une ligne par chemin {g1…g5, value} ; track = status | place | job */
    function agesPaths(tr, people, ages, track, now = NOW) {
        const lab = st => (st === null ? '' : track === 'status' || st === 'dead' ? i18n(STATUS[st]?.[0] || st) : st), m = new Map();
        people.forEach(p => { const b = birth(p); if (b === null || b + ages[0] > now) return;
            const path = ages.slice(0, 5).map(a => lab(stateAt(tr, p, track, b + a, now))); if (!path.some(Boolean)) return;
            const k = path.join('\u0000'); m.set(k, (m.get(k) || 0) + 1); });
        return [...m.entries()].map(([k, n]) => { const g = k.split('\u0000'), o = {value: String(n)}; for (let i = 1; i <= 5; i++) o['g' + i] = g[i - 1] || ''; return o; });
    }
    /** la lignée directe (side p = père du père…, m = mère de la mère…) : l'âge du parent à la naissance de l'enfant de la lignée */
    function lineage(tr, root, side, max = 30) {
        const out = []; let x = tr.byId.get(root), g = 1; const seen = new Set();
        while (x && g <= max && !seen.has(x.id)) { seen.add(x.id);
            const par = tr.byId.get(side === 'm' ? x.mother : x.father); if (!par) break;
            const a = birth(x), pa = birth(par);
            if (a !== null && pa !== null && a - pa > 10 && a - pa < 80) out.push({child: nm(x), year: String(x.by ?? Math.floor(a)), [side === 'm' ? 'ma' : 'fa']: String(Math.round((a - pa) * 10) / 10), gen: String(g), line: side, cid: String(x.id)});
            x = par; g++; }
        return out;
    }
    /** les ancêtres (ou descendants) d'une personne dans l'arbre léger, elle comprise : Set */
    function walk(tr, root, up, max = 40) { const out = new Set([root]); let cur = [root];
        for (let g = 0; g < max && cur.length; g++) { const nx = []; cur.forEach(id => { const q = tr.byId.get(id); (up ? [q?.father, q?.mother] : tr.kids.get(id) || []).forEach(a => { if (a && tr.byId.has(a) && !out.has(a)) { out.add(a); nx.push(a); } }); }); cur = nx; }
        return out; }
    /** moyenne, écart-type, marge : calc = sd (± un écart-type) | ci95 (intervalle de confiance à 95 % de la moyenne) */
    function band(values, calc = 'sd') {
        const v = values.filter(Number.isFinite), n = v.length; if (!n) return null;
        const m = v.reduce((a, b) => a + b, 0) / n, sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
        const e = calc === 'ci95' ? 1.96 * sd / Math.sqrt(n) : sd;
        return {n, mean: m, sd, lo: m - e, hi: m + e};
    }
    /** la valeur d'une personne pour la Courbe avec marge : âge au décès, au (premier) mariage, au premier enfant */
    function ageOf(tr, p, what) {
        const b = birth(p); if (b === null) return null;
        let t = null;
        if (what === 'death') t = death(p);
        else if (what === 'marriage') { const u = (tr.unions.get(p.id) || []).find(x => x.fam.my !== null && x.fam.my !== undefined); t = u ? dec(u.fam.md, u.fam.my) : null; }
        else { const k = (tr.kids.get(p.id) || []).map(c => birth(tr.byId.get(c))).filter(v => v !== null); t = k.length ? Math.min(...k) : null; }
        const a = t === null ? null : t - b; return a !== null && a >= (what === 'death' ? 0 : 12) && a < 120 ? a : null;
    }
    /** les lignes de la Courbe avec marge : une par période de naissance, moyenne + basse + haute */
    function marginRows(tr, ids, what, calc, step = 25) {
        const by = new Map();
        tr.people.forEach(p => { if (ids && !ids.has(p.id)) return; const a = ageOf(tr, p, what), b = birth(p); if (a === null) return; const k = Math.floor(b / step) * step; if (!by.has(k)) by.set(k, []); by.get(k).push(a); });
        return [...by.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => ({k, b: band(v, calc)})).filter(x => x.b && x.b.n >= 3)
            .map(({k, b}) => ({label: String(k), s0: String(Math.round(b.mean * 10) / 10), s1: String(Math.round(b.lo * 10) / 10), s2: String(Math.round(b.hi * 10) / 10), n: String(b.n)}));
    }
    /** les lignes du Lexis : une par vie (+ ses marques) */
    function lexisData(tr, ids, {max = 120, marks = ['marriage', 'child', 'move']} = {}) {
        const list = tr.people.filter(p => (!ids || ids.has(p.id)) && birth(p) !== null).sort((a, b) => birth(a) - birth(b)).slice(0, clamp(max, 1, 400));
        const people = list.map(p => ({name: nm(p), sex: p.gender === 'female' ? 'f' : p.gender === 'male' ? 'h' : '', group: '', birth: p.bd || String(p.by), death: p.dd || (p.dy ? String(p.dy) : ''), living: p.living ? '1' : '', pid: String(p.id)}));
        const mk = [];
        list.forEach(p => {
            if (marks.includes('marriage')) (tr.unions.get(p.id) || []).forEach(u => { if (u.fam.my !== null && u.fam.my !== undefined) mk.push({name: nm(p), date: u.fam.md || String(u.fam.my), kind: 'marriage', label: nm(tr.byId.get(u.spouse)), pid: String(p.id)}); });
            if (marks.includes('child')) (tr.kids.get(p.id) || []).forEach(c => { const k = tr.byId.get(c); if (k && birth(k) !== null) mk.push({name: nm(p), date: k.bd || String(k.by), kind: 'child', label: nm(k), pid: String(p.id)}); });
            if (marks.includes('move')) { const home = commune(tr, p.bplace); if (home) { const e = (tr.evOf.get(p.id) || []).filter(x => x.y !== null && x.y !== undefined && x.place && commune(tr, x.place) && commune(tr, x.place) !== home).sort((x, y) => x.y - y.y)[0];
                if (e) mk.push({name: nm(p), date: e.d || String(e.y), kind: 'move', label: commune(tr, e.place), pid: String(p.id)}); } }
        });
        return {rows: people, marks: mk.slice(0, 3000)};
    }
    /** pour le diagramme ternaire : les comptes par secteur → trois parts (a, b, c) ; parts = [[secteurs], [secteurs], [secteurs] ou 'rest'] */
    function threeParts(by, parts) {
        const used = new Set(parts.filter(Array.isArray).flat()), val = p => (p === 'rest' ? Object.entries(by || {}).filter(([k]) => !used.has(k)).reduce((s, [, n]) => s + num(n), 0) : p.reduce((s, k) => s + num(by?.[k]), 0));
        return parts.map(val);
    }

    /* ═════════════════════ « Depuis l'app » : l'arbre, les personnes retenues ═════════════════════ */
    let treeP = null, treeT = 0;
    function tree() {
        if (treeP && Date.now() - treeT < 30000) return treeP;
        treeT = Date.now();
        treeP = A().api('tresor_tree').then(build).catch(e => { treeP = null; throw e; });
        return treeP;
    }
    /** un bloc « Seulement les personnes… » : le groupe de personnes, « ＋ Critère » (ET / OU) et la période de naissance (heritage-diagram-options.js) */
    function critHtml(kind, {pop = true, period = true} = {}) {
        const O = DGO(); if (!O) return '';
        const fields = [...(pop ? ['pop'] : []), 'rules', ...(period ? ['period'] : [])];
        return `<div class="lb-crit" data-lb-crit="${esc(fields.join(','))}">${O.html({...O.DEF, limit: 0}, {fields, kind, period: 'birth'})}</div>`;
    }
    function critBind(pane) { const O = DGO(); if (!O) return; pane.querySelectorAll('[data-lb-crit] [data-dgo-box]').forEach(box => O.bind(box, {cfg: {fields: box.closest('[data-lb-crit]').dataset.lbCrit.split(','), period: 'birth'}})); }
    /** le réglage lu dans tous les blocs d'options du panneau (le bloc commun ajouté par heritage-diagram-options.js, et le nôtre) */
    function critQuery(pane) {
        const O = DGO(); if (!O || !pane) return null; let q = null;
        for (const box of pane.querySelectorAll('[data-dgo-box]')) {
            if (box.closest('[hidden]')) continue;
            if (!O.check(box)) throw new Error(i18n('Vérifie le groupe de personnes et la période.'));
            const r = O.read(box); q = q || {...r, rules: [], pop: '', from: '', to: ''};
            if (box.querySelector('[data-dgo="pop"]')) Object.assign(q, {pop: r.pop, root: r.root, gens: r.gens, label: r.label, list: r.list, search: r.search, ids: r.ids});
            if (box.querySelector('[data-dgo-rules]')) { q.rules = r.rules; q.match = r.match; }
            if (box.querySelector('[data-dgo="from"]')) { q.from = r.from; q.to = r.to; }
        }
        return q;
    }
    const critParams = q => ({...DGO().dgParams(q), ...(q.rules?.length ? {rules: JSON.stringify(q.rules), match: q.match === 'any' ? 'any' : 'all'} : {})});
    /** les personnes retenues : null = tout le monde (aucun filtre) */
    async function critIds(pane) {
        const q = critQuery(pane); if (!q || (!q.pop && !q.rules?.length && !q.from && !q.to)) return null;
        const r = await A().api('diagram_lot_b', {what: 'people', ...critParams(q)});
        return r.all ? null : new Set((r.ids || []).map(Number));
    }
    const critText = pane => { try { const q = critQuery(pane); return q ? DGO().summary(q, {fields: ['pop', 'rules', 'period'], period: 'birth', source: ''}) : ''; } catch (_) { return ''; } };
    const v = (pane, k) => pane.querySelector(`[data-lb="${k}"]`)?.value ?? '';
    const sel = (k, opts, def = '') => `<select data-lb="${k}">${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(def) ? 'selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>`;
    const field = (label, inner) => `<label>${esc(i18n(label))}${inner}</label>`;
    const box = (title, intro, inner) => `<div class="h-dg-app lb-app"><h4>${esc(i18n(title))}</h4><p class="muted">${esc(i18n(intro))}</p>${inner}<button type="button" class="button small" data-lb-go>${esc(i18n('Prendre dans ma base'))}</button><p class="muted" data-lb-msg aria-live="polite"></p></div>`;
    const titleIf = (s, kind, t) => { s.o = s.o || {}; if (!s.o.title || s.o.title === K[kind]?.sample?.()?.o?.title) s.o.title = t; };
    function bindGo(pane, run) {
        critBind(pane);
        const btn = pane.querySelector('[data-lb-go]'), msg = pane.querySelector('[data-lb-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(i18n('Lecture de ta généalogie…'), {inline: true}) : esc(i18n('Lecture de ta généalogie…'));
            try { const t = await run(); A().toast?.(t || i18n('Données prises dans ta base.')); if (msg?.isConnected) msg.textContent = ''; } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } });
    }

    /* ═════════════════════ 📐 Diagramme de Lexis ═════════════════════ */
    const MARKS = {marriage: ['Mariage', '#f28e2b', 'ring'], child: ['Naissance d’un enfant', '#59a14f', 'dot'], move: ['Départ (autre commune)', '#b07aa1', 'tri'], other: ['Autre', '#5f6b7a', 'diamond']};
    const SEXC = {h: ['Homme', '#4e79a7'], f: ['Femme', '#e15759'], '': ['Sexe inconnu', '#9aa3ad']};
    const sexOf = v => { const t = fold(v); return /^(h|m|homme|male|masculin|♂)/.test(t) ? 'h' : /^(f|femme|female|feminin|♀)/.test(t) ? 'f' : ''; };
    const markOf = v => { const t = fold(v); return /^(marr|mari|noce|💍)/.test(t) ? 'marriage' : /^(child|enf|naiss|bapt|👶)/.test(t) ? 'child' : /^(move|dep|dép|migr|demen|🚶)/.test(t) ? 'move' : 'other'; };
    function symbol(kind, x, y, r, c) {
        if (kind === 'ring') return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="none" stroke="${c}" stroke-width="${r2(Math.max(1.2, r * .45))}"/>`;
        if (kind === 'tri') return `<path d="M${r2(x)} ${r2(y - r * 1.2)}L${r2(x + r * 1.1)} ${r2(y + r * .8)}L${r2(x - r * 1.1)} ${r2(y + r * .8)}Z" fill="${c}"/>`;
        if (kind === 'diamond') return `<path d="M${r2(x)} ${r2(y - r * 1.2)}L${r2(x + r)} ${r2(y)}L${r2(x)} ${r2(y + r * 1.2)}L${r2(x - r)} ${r2(y)}Z" fill="${c}"/>`;
        return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${c}"/>`;
    }
    function lexis(spec, W, fs) {
        const o = spec.o || {}, maxAge = clamp(num(o.maxAge) || 100, 20, 120);
        const people = rows(spec, 'rows', 600).map(r => { const b = when(r.birth), d0 = when(r.death), living = /^(1|oui|yes|x|vrai|true)$/i.test(str(r.living));
            return {name: str(r.name, 80), sex: sexOf(r.sex), group: str(r.group, 40), b, d: d0 ?? (living ? NOW : null), open: d0 === null, living, pid: pidList(r.pid)[0] || 0}; }).filter(p => p.name && p.b !== null && (p.d === null || p.d >= p.b));
        if (!people.length) return empty(W, fs, 'Ajoute des personnes : le nom, la naissance et le décès (années ou dates).');
        const from = isNum(o.from) ? num(o.from) : Math.floor(Math.min(...people.map(p => p.b)) / 10) * 10;
        const to = Math.max(from + 5, isNum(o.to) ? num(o.to) : Math.ceil(Math.max(...people.map(p => p.d ?? p.b + 1), from + 10) / 10) * 10);
        const left = textW(i18n('{n} ans', {n: maxAge}), fs * .78) + 10, top = fs * .8, bottom = fs * 2, right = 8;
        const h = clamp(num(o.height) || Math.max(220, Math.min(W * .62, 640)), 140, 3000), pw = Math.max(60, W - left - right), ph = h - top - bottom;
        const X = y => left + (y - from) / (to - from) * pw, Y = a => top + ph - clamp(a, 0, maxAge) / maxAge * ph;
        // un segment (année, âge) → (année, âge), coupé au cadre
        const seg = (y0, a0, y1, a1) => { let t0 = 0, t1 = 1; const dy = y1 - y0, da = a1 - a0;
            for (const [p, q] of [[-dy, y0 - from], [dy, to - y0], [-da, a0], [da, maxAge - a0]]) { if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; } const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); if (t0 > t1) return null; }
            return [y0 + dy * t0, a0 + da * t0, y0 + dy * t1, a0 + da * t1]; };
        let svg = '';
        // les bandes historiques (guerres, épidémies, disettes)
        const bands = o.bands === false ? [] : rows(spec, 'bands', 60).map(r => ({label: str(r.label, 60), a: when(r.from), b: when(r.to) ?? when(r.from), c: color(r.color, '#e15759')})).filter(b => b.a !== null && b.b >= b.a && b.b >= from && b.a <= to);
        bands.forEach((b, i) => { const x0 = X(Math.max(from, b.a)), x1 = X(Math.min(to, b.b + (b.b === b.a ? 1 : 0))), w = Math.max(2, x1 - x0);
            svg += `<rect x="${r2(x0)}" y="${r2(top)}" width="${r2(w)}" height="${r2(ph)}" fill="${b.c}" fill-opacity=".13">${tip(`${b.label} (${Math.round(b.a)}${b.b !== b.a ? '–' + Math.round(b.b) : ''})`)}</rect>`;
            if (o.bandLabels !== false) svg += T(x0 + 3, top + fs * (.7 + (i % 3) * 1.05), cut(b.label, Math.max(w * 3, fs * 6), fs * .7), {size: fs * .7, fill: b.c, weight: 600}); });
        // le quadrillage : âges (horizontal), années (vertical), générations nées la même année (diagonales)
        const ta = R.ticks(0, maxAge, clamp(Math.round(ph / 45), 2, 10)), ty = R.ticks(from, to, clamp(Math.round(pw / 80), 2, 14));
        ta.ticks.filter(a => a >= 0 && a <= maxAge).forEach(a => { svg += `<line x1="${r2(left)}" x2="${r2(left + pw)}" y1="${r2(Y(a))}" y2="${r2(Y(a))}" stroke="currentColor" stroke-opacity="${a ? .1 : .4}"/>` + T(left - 4, Y(a), i18n('{n} ans', {n: fmt(a, 0)}), {size: fs * .72, anchor: 'end', op: .75}); });
        ty.ticks.filter(y => y >= from && y <= to).forEach(y => { svg += `<line x1="${r2(X(y))}" x2="${r2(X(y))}" y1="${r2(top)}" y2="${r2(top + ph)}" stroke="currentColor" stroke-opacity=".08"/>` + T(X(y), top + ph + fs * .9, String(Math.round(y)), {size: fs * .75, anchor: 'middle'}); });
        if (o.cohorts !== false) { const st = ty.ticks.length > 1 ? Math.abs(ty.ticks[1] - ty.ticks[0]) : 10;
            for (let c = Math.floor((from - maxAge) / st) * st, i = 0; c <= to && i < 300; c += st, i++) { const s = seg(c, 0, c + maxAge, maxAge); if (s) svg += `<line x1="${r2(X(s[0]))}" y1="${r2(Y(s[1]))}" x2="${r2(X(s[2]))}" y2="${r2(Y(s[3]))}" stroke="currentColor" stroke-opacity=".07" stroke-dasharray="3 4"/>`; } }
        // les vies
        const groups = [...new Set(people.map(p => p.group))], by = o.colorBy || 'sex', lw = clamp(num(o.lineW) || 1.8, .4, 8), dot = clamp(num(o.dot) || 3.4, 1, 10);
        const cOf = p => by === 'one' ? color(o.lineColor, '#4e79a7') : by === 'group' ? color(rows(spec, 'cats', 40).find(c => fold(c.value) === fold(p.group))?.color, pick(spec, groups.indexOf(p.group))) : color(o['c_' + (p.sex || 'u')], SEXC[p.sex][1]);
        const byName = new Map(); people.forEach(p => { byName.set(fold(p.name), p); if (p.pid) byName.set('#' + p.pid, p); });
        people.forEach(p => {
            const c = cOf(p), end = p.d ?? Math.min(NOW, p.b + 1), s = seg(p.b, 0, end, end - p.b), t = `${p.name} : ${Math.round(p.b)}${p.d !== null ? ` – ${p.living ? i18n('en vie') : Math.round(p.d)} (${i18n('{n} ans', {n: fmt(p.d - p.b, 0)})})` : ` – ${i18n('décès inconnu')}`}`;
            if (!s) return;
            svg += `<g${PID(p.pid)}>${tip(t)}<line x1="${r2(X(s[0]))}" y1="${r2(Y(s[1]))}" x2="${r2(X(s[2]))}" y2="${r2(Y(s[3]))}" stroke="${c}" stroke-width="${lw}" stroke-linecap="round"${p.d === null || p.living ? ' stroke-dasharray="4 3"' : ''}/>`
                + (p.d !== null && !p.living && end <= to && end - p.b <= maxAge ? `<circle cx="${r2(X(end))}" cy="${r2(Y(end - p.b))}" r="${r2(lw + .8)}" fill="${c}"/>` : '') + '</g>';
            if (o.names && end <= to) svg += T(X(Math.min(end, to)) + 3, Y(Math.min(maxAge, end - p.b)) - 3, cut(p.name, 120, fs * .62), {size: fs * .62, op: .8, baseline: 'auto'});
        });
        // les marques : mariage, enfant, départ
        const marks = o.marks === false ? [] : rows(spec, 'marks', 3000).map(r => ({p: byName.get('#' + (pidList(r.pid)[0] || -1)) || byName.get(fold(r.name)), y: when(r.date), kind: markOf(r.kind), label: str(r.label, 80)})).filter(m => m.p && m.y !== null && m.y >= m.p.b);
        marks.forEach(m => { const a = m.y - m.p.b; if (m.y < from || m.y > to || a > maxAge) return; const [label, c0, shape] = MARKS[m.kind];
            svg += `<g>${tip(`${m.p.name} · ${i18n(label)}${m.label ? ' : ' + m.label : ''} (${Math.round(m.y)}, ${i18n('{n} ans', {n: fmt(a, 0)})})`)}${symbol(shape, X(m.y), Y(a), dot, color(o['m_' + m.kind], c0))}</g>`; });
        const legend = by === 'one' ? [] : by === 'group' ? groups.filter(Boolean).map(g => ({label: g, color: cOf({group: g})})) : Object.entries(SEXC).filter(([k]) => people.some(p => p.sex === k)).map(([k, [l, c]]) => ({label: i18n(l), color: color(o['c_' + (k || 'u')], c)}));
        [...new Set(marks.map(m => m.kind))].forEach(k => legend.push({label: i18n(MARKS[k][0]), color: color(o['m_' + k], MARKS[k][1])}));
        return {h: Math.ceil(h), svg, legend, desc: i18n('Diagramme de Lexis : {n}, de {a} à {b}.', {n: plural(people.length, 'vie'), a: String(Math.round(from)), b: String(Math.round(to))})};
    }
    const sampleLexis = () => {
        const P = [['Jean MAZAUD', 'h', 1792, 1861], ['Marie LACOMBE', 'f', 1798, 1872], ['Pierre MAZAUD', 'h', 1821, 1854], ['Rose MAZAUD', 'f', 1824, 1899], ['Louis MAZAUD', 'h', 1827, 1915], ['Anne VERDIER', 'f', 1830, 1883], ['Léon MAZAUD', 'h', 1856, 1916], ['Jeanne MAZAUD', 'f', 1859, 1861], ['Paul MAZAUD', 'h', 1862, 1948], ['Émile LACOMBE', 'h', 1868, 1931], ['Berthe MAZAUD', 'f', 1891, 1979]];
        const marks = [['Jean MAZAUD', 1820, 'marriage', 'Marie LACOMBE'], ['Marie LACOMBE', 1820, 'marriage', 'Jean MAZAUD'], ['Jean MAZAUD', 1821, 'child', 'Pierre'], ['Jean MAZAUD', 1824, 'child', 'Rose'], ['Jean MAZAUD', 1827, 'child', 'Louis'], ['Marie LACOMBE', 1821, 'child', 'Pierre'], ['Marie LACOMBE', 1824, 'child', 'Rose'], ['Marie LACOMBE', 1827, 'child', 'Louis'],
            ['Louis MAZAUD', 1855, 'marriage', 'Anne VERDIER'], ['Louis MAZAUD', 1856, 'child', 'Léon'], ['Louis MAZAUD', 1859, 'child', 'Jeanne'], ['Louis MAZAUD', 1862, 'child', 'Paul'], ['Pierre MAZAUD', 1846, 'move', 'Limoges'], ['Paul MAZAUD', 1885, 'move', 'Paris'], ['Paul MAZAUD', 1890, 'marriage', ''], ['Paul MAZAUD', 1891, 'child', 'Berthe']];
        return {o: {title: i18n('Les vies de la famille {name}', {name: 'MAZAUD'}), maxAge: 100},
            rows: P.map(([name, sex, b, d]) => ({name, sex, group: '', birth: String(b), death: String(d), living: ''})),
            marks: marks.map(([name, y, kind, label]) => ({name, date: String(y), kind, label})),
            bands: [[i18n('Choléra'), 1832, 1832, '#9c755f'], [i18n('Guerre de 1870'), 1870, 1871, '#e15759'], [i18n('Grande Guerre'), 1914, 1918, '#e15759']].map(([label, from, to, c]) => ({label, from: String(from), to: String(to), color: c}))};
    };
    const lexisApp = {
        html: () => box('📐 Les vies de ma base', 'Chaque vie devient une diagonale, de la naissance (âge 0) au décès ; les mariages, les naissances des enfants et les départs posés dessus.',
            critHtml('lexis') + field('Combien de vies au plus', sel('max', [[30, '30'], [60, '60'], [120, '120'], [250, '250']], 60)) + field('Couleur', sel('colorBy', [['sex', 'Homme / femme'], ['last', 'Une par nom de famille'], ['one', 'Une seule']], 'sex'))
            + `<div class="lb-checks">${[['marriage', 'Mariages'], ['child', 'Naissances des enfants'], ['move', 'Départs (première commune autre que celle de naissance)'], ['history', 'Bandes historiques (guerres, épidémies)']].map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-lb-mark="${k}" checked> ${esc(i18n(l))}</label>`).join('')}</div>`),
        bind: (pane, io) => bindGo(pane, async () => {
            const [tr, ids] = await Promise.all([tree(), critIds(pane)]), marks = [...pane.querySelectorAll('[data-lb-mark]:checked')].map(x => x.dataset.lbMark);
            const d = lexisData(tr, ids, {max: Number(v(pane, 'max')) || 60, marks}); if (!d.rows.length) throw new Error(i18n('Personne avec une date de naissance dans ce groupe.'));
            const s = io.spec(), by = v(pane, 'colorBy'); s.rows = d.rows.map(r => ({...r, group: by === 'last' ? (tr.byId.get(Number(r.pid))?.last || '') : ''})); s.marks = d.marks;
            if (marks.includes('history')) { const ys = d.rows.map(r => when(r.birth)).filter(x => x !== null); try { const h = await A().api('diagram_lot_b', {what: 'history', dg_from: Math.floor(Math.min(...ys)), dg_to: Math.ceil(Math.max(...ys) + 100)}); s.bands = (h.rows || []).map(b => ({label: b.label, from: String(b.from), to: String(b.to), color: /guerre|war|conflit/i.test(b.category + b.label) ? '#e15759' : '#9c755f'})); } catch (_) { s.bands = s.bands || []; } }
            else s.bands = [];
            s.o = {...(s.o || {}), colorBy: by === 'last' ? 'group' : by}; titleIf(s, 'lexis', i18n('Diagramme de Lexis'));
            io.apply(s); return i18n('{n} prises dans ta base.', {n: plural(d.rows.length, 'vie')});
        }),
    };

    /* ═════════════════════ 🔺 Diagramme ternaire ═════════════════════ */
    function ternary(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec, 'rows', 800).map((r, i) => { const a = Math.max(0, num(r.a)), b = Math.max(0, num(r.b)), c = Math.max(0, num(r.c)), t = a + b + c;
            return {label: str(r.label, 60), a, b, c, t, group: str(r.group, 40), order: isNum(r.order) ? num(r.order) : i, ids: pidList(r.ids), i}; }).filter(r => r.t > 0);
        if (!list.length) return empty(W, fs, 'Ajoute des points : un nom et ses trois parts (des nombres ou des %).');
        const names = [str(o.nameA, 40) || i18n('Part A'), str(o.nameB, 40) || i18n('Part B'), str(o.nameC, 40) || i18n('Part C')], cols = [color(o.colorA, '#4d8a2f'), color(o.colorB, '#c2611a'), color(o.colorC, '#2563c9')];
        const H0 = num(o.height) > 120 ? num(o.height) : Math.min(W * .86, 720), side = Math.max(80, Math.min(W - fs * 6, (H0 - fs * 4.2) / .866)), hh = side * .866;
        const cx = W / 2, yTop = fs * 2, VA = [cx, yTop], VB = [cx - side / 2, yTop + hh], VC = [cx + side / 2, yTop + hh];
        const P = (a, b, c) => { const t = a + b + c || 1; return [(a * VA[0] + b * VB[0] + c * VC[0]) / t, (a * VA[1] + b * VB[1] + c * VC[1]) / t]; };
        let svg = `<path d="M${r2(VA[0])} ${r2(VA[1])}L${r2(VB[0])} ${r2(VB[1])}L${r2(VC[0])} ${r2(VC[1])}Z" fill="currentColor" fill-opacity=".03" stroke="currentColor" stroke-opacity=".5"/>`;
        const step = o.grid === '20' ? 20 : o.grid === 'none' ? 0 : 10;
        if (step) for (let k = step; k < 100; k += step) { const f = k / 100;
            // chaque part a ses lignes parallèles au côté opposé ; ses % écrits sur un seul côté : le haut à droite, la gauche à gauche, la droite en bas
            [[[f, 1 - f, 0], [f, 0, 1 - f], 0], [[1 - f, f, 0], [0, f, 1 - f], 1], [[1 - f, 0, f], [0, 1 - f, f], 2]].forEach(([p, q, j]) => { const [x0, y0] = P(...p), [x1, y1] = P(...q);
                svg += `<line x1="${r2(x0)}" y1="${r2(y0)}" x2="${r2(x1)}" y2="${r2(y1)}" stroke="${cols[j]}" stroke-opacity=".18"/>`;
                if (o.ticks !== false && (k % 20 === 0 || step === 20)) { const [tx, ty, an] = j === 0 ? [x1 + 4, y1, 'start'] : j === 1 ? [x0 - 4, y0, 'end'] : [x1, y1 + fs * .75, 'middle']; svg += T(tx, ty, `${k} %`, {size: fs * .62, anchor: an, fill: cols[j], op: .9}); } }); }
        svg += T(VA[0], VA[1] - fs * .8, cut(names[0], W * .6, fs * .9), {size: fs * .9, anchor: 'middle', weight: 700, fill: cols[0]})
            + T(VB[0] - 2, VB[1] + fs * 1.9, cut(names[1], W * .45, fs * .9), {size: fs * .9, anchor: 'start', weight: 700, fill: cols[1]}) + T(VC[0] + 2, VC[1] + fs * 1.9, cut(names[2], W * .45, fs * .9), {size: fs * .9, anchor: 'end', weight: 700, fill: cols[2]});
        const groups = [...new Set(list.map(r => r.group))], by = o.colorBy || 'group', maxT = Math.max(...list.map(r => r.t));
        const cOf = r => by === 'one' ? color(o.dotColor, '#4e79a7') : by === 'point' ? pick(spec, r.i) : color(rows(spec, 'cats', 40).find(c => fold(c.value) === fold(r.group))?.color, pick(spec, groups.indexOf(r.group)));
        const rad = r => (o.size === 'total' ? clamp(3 + Math.sqrt(r.t / maxT) * (num(o.dot) || 5) * 2, 3, 40) : clamp(num(o.dot) || 5, 1.5, 20));
        if (o.connect) groups.forEach(g => { const pts = list.filter(r => r.group === g).sort((a, b) => a.order - b.order).map(r => P(r.a, r.b, r.c)); if (pts.length < 2) return;
            const c = cOf({group: g, i: 0}); svg += `<polyline points="${pts.map(p => `${r2(p[0])},${r2(p[1])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="1.6" stroke-opacity=".75" marker-end=""/>`;
            const [xa, ya] = pts[pts.length - 2], [xb, yb] = pts[pts.length - 1], ang = Math.atan2(yb - ya, xb - xa), L = 7;
            svg += `<path d="M${r2(xb)} ${r2(yb)}L${r2(xb - L * Math.cos(ang - .4))} ${r2(yb - L * Math.sin(ang - .4))}L${r2(xb - L * Math.cos(ang + .4))} ${r2(yb - L * Math.sin(ang + .4))}Z" fill="${c}"/>`; });
        const pc = (x, t) => fmt(x / t * 100, 0);
        list.forEach(r => { const [x, y] = P(r.a, r.b, r.c), c = cOf(r), t = `${r.label}${r.group ? ' (' + r.group + ')' : ''} — ${names[0]} ${pc(r.a, r.t)} %, ${names[1]} ${pc(r.b, r.t)} %, ${names[2]} ${pc(r.c, r.t)} %`;
            svg += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(rad(r))}" fill="${c}" fill-opacity=".82" stroke="#ffffff" stroke-width=".8"${PIDS(r.ids, r.label)}>${tip(t)}</circle>`;
            if (o.labels !== false && list.length <= 60) svg += T(x + rad(r) + 3, y, cut(r.label, Math.max(40, W - x - 10), fs * .7), {size: fs * .7, op: .85}); });
        const legend = by === 'group' ? groups.filter(Boolean).map(g => ({label: g, color: cOf({group: g, i: 0})})) : [];
        return {h: Math.ceil(yTop + hh + fs * 2.8), svg, legend, desc: i18n('Diagramme ternaire : {n} ({a}, {b}, {c}).', {n: plural(list.length, 'point'), a: names[0], b: names[1], c: names[2]})};
    }
    const sampleTernary = () => ({o: {title: i18n('Les métiers de trois villages, siècle par siècle'), nameA: i18n('Agriculture'), nameB: i18n('Artisanat et industrie'), nameC: i18n('Commerce et services'), connect: true},
        rows: [['Naves', 82, 12, 6, 1750], ['Naves', 74, 18, 8, 1800], ['Naves', 61, 24, 15, 1850], ['Naves', 38, 30, 32, 1900], ['Seilhac', 88, 8, 4, 1750], ['Seilhac', 80, 13, 7, 1800], ['Seilhac', 70, 19, 11, 1850], ['Seilhac', 55, 25, 20, 1900],
            ['Tulle', 30, 45, 25, 1750], ['Tulle', 24, 48, 28, 1800], ['Tulle', 15, 52, 33, 1850], ['Tulle', 8, 47, 45, 1900]].map(([g, a, b, c, y]) => ({label: `${g} ${y}`, a: String(a), b: String(b), c: String(c), group: g, order: String(y)}))});
    const SECTORS = [['agri', 'Agriculture et forêt'], ['arti', 'Artisanat'], ['indu', 'Industrie, mines'], ['comm', 'Commerce'], ['tran', 'Transports et mer'], ['serv', 'Services, domestiques'], ['armee', 'Armée et police'], ['clerge', 'Clergé'],
        ['lib', 'Professions libérales, école, administration'], ['rang', 'Rentiers, rangs et statuts'], ['foyer', 'Au foyer, sans profession'], ['autre', 'Autre métier']];
    const PART_CHOICES = [...SECTORS, ['arti,indu', 'Artisanat et industrie'], ['comm,tran,serv,lib', 'Commerce et services'], ['rest', 'Tous les autres métiers']];
    const ternaryApp = {
        html: () => box('🔺 Les métiers de ma base', 'Les métiers (fiche, événements « Profession », recensements) rangés en grands secteurs ; un point par commune de naissance, par décennie ou par famille, placé selon ses trois parts.',
            critHtml('ternary') + field('Un point par', sel('by', [['place', 'Commune de naissance'], ['decade', 'Décennie de naissance (reliées dans le temps)'], ['family', 'Nom de famille']], 'place')) + field('Combien de points au plus', sel('top', [[6, '6'], [12, '12'], [20, '20'], [40, '40']], 12))
            + field('Part du haut', sel('pa', PART_CHOICES, 'agri')) + field('Part de gauche', sel('pb', PART_CHOICES, 'arti,indu')) + field('Part de droite', sel('pc', PART_CHOICES, 'rest'))),
        bind: (pane, io) => bindGo(pane, async () => {
            const q = critQuery(pane), by = v(pane, 'by'), r = await A().api('diagram_lot_b', {what: 'sectors', by, top: v(pane, 'top') || 12, ...(q ? critParams(q) : {})});
            const parts = ['pa', 'pb', 'pc'].map(k => (v(pane, k) === 'rest' ? 'rest' : v(pane, k).split(',').filter(Boolean)));
            if (parts.filter(p => p === 'rest').length > 1) throw new Error(i18n('« Tous les autres métiers » ne peut servir qu’une fois.'));
            const out = (r.rows || []).map(x => { const [a, b, c] = threeParts(x.by, parts); return {label: x.label, a: String(a), b: String(b), c: String(c), group: by === 'decade' ? i18n('Décennies') : '', order: String(x.year ?? ''), ids: x.ids}; }).filter(x => num(x.a) + num(x.b) + num(x.c) > 0);
            if (!out.length) throw new Error(i18n('Aucun métier connu pour ces personnes.'));
            const lab = k => i18n(PART_CHOICES.find(c => c[0] === v(pane, k))?.[1] || '');
            const s = io.spec(); s.rows = out; s.o = {...(s.o || {}), nameA: lab('pa'), nameB: lab('pb'), nameC: lab('pc'), connect: by === 'decade', size: 'total'};
            titleIf(s, 'ternary', i18n('Les métiers de ma base, en trois parts')); io.apply(s);
            return i18n('{n} pris dans ta base.', {n: plural(out.length, 'point')});
        }),
    };

    /* ═════════════════════ 🕯 Chandeliers (prix, mercuriales) ═════════════════════ */
    function candles(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec, 'rows', 1500).map(r => { const op = isNum(r.open) ? num(r.open) : null, cl = isNum(r.close) ? num(r.close) : null; if (op === null && cl === null) return null;
            const a = op ?? cl, b = cl ?? op, lo = isNum(r.low) ? num(r.low) : Math.min(a, b), hi = isNum(r.high) ? num(r.high) : Math.max(a, b);
            return {label: str(r.label, 40), open: a, close: b, low: Math.min(lo, a, b), high: Math.max(hi, a, b)}; }).filter(r => r && r.label);
        if (!list.length) return empty(W, fs, 'Ajoute des périodes : la date, le prix d’ouverture, de clôture, le plus bas et le plus haut.');
        const unit = str(o.unitFree, 20) || (o.unit === 'none' ? '' : i18n(o.unit || 'livres')), up = color(o.upColor, '#2e7d32'), down = color(o.downColor, '#c62828');
        const tk = R.ticks(Math.min(...list.map(r => r.low)), Math.max(...list.map(r => r.high)), 6), lo = tk.lo, hi = Math.max(tk.hi, lo + 1e-9);
        const left = Math.max(...tk.ticks.map(t => textW(fmt(t, 2), fs * .78))) + 10, h = clamp(num(o.height) || Math.max(220, W * .48), 140, 2000), top = unit ? fs * 1.4 : 8, rot = list.length > 1 && Math.max(...list.map(r => textW(r.label, fs * .75))) > (W - left) / list.length * .95, bottom = rot ? Math.min(90, Math.max(...list.map(r => textW(r.label, fs * .75))) * .75 + fs) : fs * 1.8;
        const ph = h - top - bottom, bw = (W - left - 6) / list.length, Y = val => top + ph - (val - lo) / (hi - lo) * ph, Xc = i => left + bw * (i + .5), body = clamp(num(o.bodyW) || 64, 10, 100) / 100;
        let svg = '';
        // les années à part (disettes, guerres) : en bandes derrière
        if (o.bands !== false) rows(spec, 'bands', 40).forEach(b => { const a = when(b.from), z = when(b.to) ?? a, label = str(b.label, 60); if (a === null) return;
            const idx = list.map((r, i) => [when(r.label), i]).filter(([y]) => y !== null && y >= a && y <= z + .999).map(([, i]) => i); if (!idx.length) return;
            const x0 = left + bw * Math.min(...idx), x1 = left + bw * (Math.max(...idx) + 1), c = color(b.color, color(o.bandColor, '#edc948'));
            svg += `<rect x="${r2(x0)}" y="${r2(top)}" width="${r2(x1 - x0)}" height="${r2(ph)}" fill="${c}" fill-opacity=".18">${tip(label)}</rect>` + (label ? T(x0 + 3, top + fs * .8, cut(label, Math.max(x1 - x0 - 4, fs * 5), fs * .7), {size: fs * .7, weight: 600, op: .85}) : ''); });
        tk.ticks.forEach(t => { svg += `<line x1="${r2(left)}" x2="${r2(W - 4)}" y1="${r2(Y(t))}" y2="${r2(Y(t))}" stroke="currentColor" stroke-opacity=".12"/>` + T(left - 5, Y(t), fmt(t, 2), {size: fs * .78, anchor: 'end', op: .8}); });
        list.forEach((r, i) => { const x = Xc(i), c = r.close >= r.open ? up : down, w = Math.max(1.5, bw * body), y0 = Y(Math.max(r.open, r.close)), y1 = Y(Math.min(r.open, r.close));
            const t = `${r.label} — ${i18n('ouverture')} ${fmt(r.open, 2)}, ${i18n('clôture')} ${fmt(r.close, 2)}, ${i18n('plus bas')} ${fmt(r.low, 2)}, ${i18n('plus haut')} ${fmt(r.high, 2)}${unit ? ' ' + unit : ''}`;
            svg += `<g>${tip(t)}<line x1="${r2(x)}" x2="${r2(x)}" y1="${r2(Y(r.high))}" y2="${r2(Y(r.low))}" stroke="${c}" stroke-width="${r2(clamp(bw * .08, 1, 3))}"/><rect x="${r2(x - w / 2)}" y="${r2(y0)}" width="${r2(w)}" height="${r2(Math.max(1.2, y1 - y0))}" fill="${o.hollow && r.close >= r.open ? 'none' : c}" stroke="${c}" stroke-width="1.2"/></g>`;
            const every = Math.max(1, Math.ceil(list.length / Math.max(1, Math.floor((W - left) / (fs * (rot ? 1.2 : 3.2))))));
            if (i % every === 0) svg += rot ? T(x, top + ph + 6, cut(r.label, 90, fs * .75), {size: fs * .75, anchor: 'end', rotate: -45, baseline: 'hanging'}) : T(x, top + ph + fs * .9, cut(r.label, bw * every, fs * .75), {size: fs * .75, anchor: 'middle'}); });
        const n = clamp(Math.round(num(o.ma)), 0, 60), legend = legendOf([['Hausse (clôture plus haute)', up], ['Baisse (clôture plus basse)', down]]);
        if (n >= 2 && list.length > n) { const mc = color(o.maColor, '#1f5fa8'), pts = list.map((r, i) => (i + 1 >= n ? [Xc(i), Y(list.slice(i + 1 - n, i + 1).reduce((s, x) => s + x.close, 0) / n)] : null)).filter(Boolean);
            svg += `<polyline points="${pts.map(p => `${r2(p[0])},${r2(p[1])}`).join(' ')}" fill="none" stroke="${mc}" stroke-width="2.2" stroke-linejoin="round"/>`; legend.push({label: i18n('Moyenne mobile sur {n} périodes', {n}), color: mc, type: 'line'}); }
        if (unit) svg += T(2, 1, unit, {size: fs * .72, op: .7, baseline: 'hanging'});
        const first = list[0], last = list[list.length - 1], ch = first.open ? (last.close - first.open) / first.open * 100 : 0;
        return {h: Math.ceil(h), svg, legend, desc: i18n('Chandeliers : {n}, de {a} à {b} ({p} %).', {n: plural(list.length, 'période'), a: first.label, b: last.label, p: (ch >= 0 ? '+' : '') + fmt(ch, 0)})};
    }
    const sampleCandles = () => ({o: {title: i18n('Prix du setier de blé au marché de {name}', {name: 'Naves'}), unit: 'livres', ma: 3},
        rows: [[1765, 14, 15.5, 13, 17], [1766, 15.5, 17, 15, 18.5], [1767, 17, 16, 15, 18], [1768, 16, 19, 15.5, 21], [1769, 19, 24, 18, 27], [1770, 24, 29, 22, 33], [1771, 29, 23, 21, 30], [1772, 23, 20, 19, 24], [1773, 20, 18.5, 17, 21], [1774, 18.5, 21, 18, 23],
            [1775, 21, 26, 20, 28], [1776, 26, 19, 18, 26.5], [1777, 19, 17.5, 16, 20], [1778, 17.5, 16, 15, 18], [1779, 16, 17, 15.5, 18.5]].map(([y, op, cl, lo, hi]) => ({label: String(y), open: String(op), close: String(cl), low: String(lo), high: String(hi)})),
        bands: [{label: i18n('Disette'), from: '1769', to: '1771', color: '#edc948'}, {label: i18n('Guerre des farines'), from: '1775', to: '1775', color: '#e15759'}]});

    /* ═════════════════════ 📈 Courbe avec marge (heritage-diagrams-render.js) : « 🌳 Des données de mon arbre » ═════════════════════ */
    const MARGIN_SRC = [['death', 'Âge au décès'], ['marriage', 'Âge au premier mariage'], ['child', 'Âge au premier enfant']].flatMap(([w, wl]) => [['sd', '± un écart-type'], ['ci95', 'intervalle à 95 %']]
        .flatMap(([c, cl]) => [['', 'toute ma base'], ['anc', 'mes ancêtres']].map(([p, pl]) => [`lb:${w}:${c}:${p}`, `${wl}, ${cl}, ${pl}`, {w, c, p, wl, cl}])));
    const lineApp = {sources: MARGIN_SRC.map(([k, l]) => [k, i18n('📏 Moyenne et marge : {x}', {x: l.split(', ').map(x => i18n(x)).join(', ')})]),
        fill: async (spec, key) => { const src = MARGIN_SRC.find(s => s[0] === key); if (!src) throw new Error(i18n('Données inconnues.')); const {w, c, p, wl} = src[2];
            const tr = await tree(), start = Number(A()?.state?.bootstrap?.startPersonId) || tr.people.find(x => x.start)?.id || tr.people[0]?.id;
            const ids = p === 'anc' ? walk(tr, start, true) : null, out = marginRows(tr, ids, w, c, 25);
            if (!out.length) throw new Error(i18n('Pas assez de personnes datées (au moins 3 par période).'));
            const sr = spec.series || [];
            spec.rows = out; spec.series = [{name: i18n(wl), color: sr[0]?.color || '#4e79a7'}, {name: i18n('Basse'), color: sr[1]?.color || '#9ecae1'}, {name: i18n('Haute'), color: sr[2]?.color || '#9ecae1'}];
            spec.o = {...(spec.o || {}), band: 'cols', bandLo: 2, bandHi: 3, unit: i18n('ans'), title: i18n('{x} : moyenne et marge', {x: i18n(wl)}), subtitle: i18n(c === 'ci95' ? 'Marge : intervalle de confiance à 95 % de la moyenne, par quart de siècle de naissance' : 'Marge : un écart-type de part et d’autre, par quart de siècle de naissance')};
            return spec; }};
    function wireLine() { const k = K.line; if (!k || k._lotB) return; k._lotB = true;
        if (!k.app) { k.app = lineApp; return; }
        const old = k.app, mine = new Set(lineApp.sources.map(s => s[0]));
        k.app = {...old, sources: [...old.sources, ...lineApp.sources], fill: (spec, key) => (mine.has(key) ? lineApp.fill(spec, key) : old.fill(spec, key))}; }

    /* ═════════════════════ Les types ═════════════════════ */
    const KSEX = [['', '?'], ['h', 'Homme'], ['f', 'Femme']];
    const NEW = {
        lexis: {icon: '📐', label: 'Diagramme de Lexis (âge × année : une vie = une diagonale)', group: 'Vie et mort', render: lexis, legend: 'bottom', fromApp: lexisApp,
            help: 'Les années en bas, les âges à gauche : chaque vie monte en diagonale de sa naissance à son décès ; les mariages, les enfants, les départs et les grandes crises s’y lisent d’un coup d’œil.',
            grids: [{key: 'rows', label: 'Les vies', cols: [C('name', 'Nom'), C('sex', 'Sexe', 'select', {choices: KSEX}), C('group', 'Groupe (couleur)'), C('birth', 'Naissance', 'text', {ph: '7 mai 1925'}), C('death', 'Décès'), C('living', 'En vie', 'select', {choices: [['', 'Non'], ['1', 'Oui']]})]},
                {key: 'marks', label: 'Les marques (sur la vie de la personne)', cols: [C('name', 'Personne (même nom que ci-dessus)'), C('date', 'Date'), C('kind', 'Sorte', 'select', {choices: Object.entries(MARKS).map(([k, [l]]) => [k, l])}), C('label', 'Note')]},
                {key: 'bands', label: 'Bandes historiques', cols: [C('label', 'Nom'), C('from', 'De (année)'), C('to', 'À (année)'), C('color', 'Couleur', 'color')]},
                {key: 'cats', label: 'Couleur de chaque groupe (facultatif)', cols: [C('value', 'Groupe'), C('color', 'Couleur', 'color')]}],
            options: [C('from', 'Début (année, vide = auto)', 'number'), C('to', 'Fin (année, vide = auto)', 'number'), C('maxAge', 'Âge au plus', 'range', {unit: 'ans', min: 20, max: 120, def: 100}),
                C('colorBy', 'Couleur des vies', 'select', {choices: [['sex', 'Homme / femme'], ['group', 'Par groupe'], ['one', 'Une seule']], def: 'sex'}), C('lineColor', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'}),
                C('c_h', 'Couleur des hommes', 'color', {def: '#4e79a7', when: s => !s.o?.colorBy || s.o.colorBy === 'sex'}), C('c_f', 'Couleur des femmes', 'color', {def: '#e15759', when: s => !s.o?.colorBy || s.o.colorBy === 'sex'}), PALETTE,
                C('marks', 'Montrer les marques', 'check', {def: true}), ...Object.entries(MARKS).map(([k, [l, c]]) => C('m_' + k, l, 'color', {def: c, when: s => s.o?.marks !== false})), C('dot', 'Taille des marques', 'range', {min: 1, max: 10, step: .2, def: 3.4}),
                C('bands', 'Bandes historiques', 'check', {def: true}), C('bandLabels', 'Nom des bandes', 'check', {def: true}), C('cohorts', 'Diagonales des générations', 'check', {def: true}), C('names', 'Nom au bout de chaque vie', 'check'), C('lineW', 'Épaisseur des vies', 'range', {min: .4, max: 8, step: .1, def: 1.8}), H_OPT],
            sample: sampleLexis},
        ternary: {icon: '🔺', label: 'Diagramme ternaire (trois parts qui font 100 %)', group: 'Parts', render: ternary, legend: 'bottom', fromApp: ternaryApp,
            help: 'Un triangle : chaque point a trois parts (par exemple agriculture, artisanat, commerce) ; plus il est près d’un coin, plus cette part est grande.',
            grids: [{key: 'rows', label: 'Les points (trois parts chacun)', cols: [C('label', 'Nom'), C('a', 'Part du haut', 'number'), C('b', 'Part de gauche', 'number'), C('c', 'Part de droite', 'number'), C('group', 'Groupe (couleur, points reliés)'), C('order', 'Ordre (année…)', 'number')]},
                {key: 'cats', label: 'Couleur de chaque groupe (facultatif)', cols: [C('value', 'Groupe'), C('color', 'Couleur', 'color')]}],
            options: [C('nameA', 'Nom de la part du haut', 'text', {def: 'Part A'}), C('nameB', 'Nom de la part de gauche', 'text', {def: 'Part B'}), C('nameC', 'Nom de la part de droite', 'text', {def: 'Part C'}),
                C('colorA', 'Couleur du haut', 'color', {def: '#4d8a2f'}), C('colorB', 'Couleur de gauche', 'color', {def: '#c2611a'}), C('colorC', 'Couleur de droite', 'color', {def: '#2563c9'}),
                C('grid', 'Grille', 'select', {choices: [['', 'Tous les 10 %'], ['20', 'Tous les 20 %'], ['none', 'Sans grille']]}), C('ticks', 'Écrire les %', 'check', {def: true}),
                C('colorBy', 'Couleur des points', 'select', {choices: [['group', 'Une par groupe'], ['point', 'Une par point'], ['one', 'Une seule']], def: 'group'}), C('dotColor', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'}), PALETTE,
                C('size', 'Taille des points', 'select', {choices: [['', 'Tous pareils'], ['total', 'Selon le total']]}), C('dot', 'Taille', 'range', {min: 1.5, max: 20, step: .5, def: 5}), C('connect', 'Relier les points d’un groupe dans l’ordre', 'check'), C('labels', 'Noms des points', 'check', {def: true}), H_OPT],
            sample: sampleTernary},
        candles: {icon: '🕯', label: 'Chandeliers (prix du blé, mercuriales)', group: 'Chiffres', render: candles, legend: 'bottom',
            help: 'Pour chaque période : le prix au début (ouverture), à la fin (clôture), le plus bas et le plus haut. Vert si le prix monte, rouge s’il baisse ; les années de disette en bandes.',
            grids: [{key: 'rows', label: 'Les périodes (date, ouverture, clôture, plus bas, plus haut)', cols: [C('label', 'Date ou période'), C('open', 'Ouverture', 'number'), C('close', 'Clôture', 'number'), C('low', 'Plus bas', 'number'), C('high', 'Plus haut', 'number')]},
                {key: 'bands', label: 'Les années à part (disette, guerre…)', cols: [C('label', 'Nom'), C('from', 'De (année)'), C('to', 'À (année)'), C('color', 'Couleur', 'color')]}],
            options: [C('unit', 'Unité', 'select', {choices: [['livres', 'livres'], ['sols', 'sols'], ['deniers', 'deniers'], ['francs', 'francs'], ['none', 'aucune']], def: 'livres'}), C('unitFree', 'Autre unité (écrite)'),
                C('upColor', 'Couleur de la hausse', 'color', {def: '#2e7d32'}), C('downColor', 'Couleur de la baisse', 'color', {def: '#c62828'}), C('hollow', 'Hausse en creux (bougie vide)', 'check'),
                C('ma', 'Moyenne mobile (périodes, 0 = non)', 'range', {min: 0, max: 24, def: 0}), C('maColor', 'Couleur de la moyenne', 'color', {def: '#1f5fa8'}),
                C('bands', 'Années à part en bandes', 'check', {def: true}), C('bandColor', 'Couleur des bandes', 'color', {def: '#edc948'}), C('bodyW', 'Largeur des bougies', 'range', {unit: '%', min: 10, max: 100, def: 64}), H_OPT],
            sample: sampleCandles},
    };
    for (const [k, kind] of Object.entries(NEW)) { if (!K[k]) K[k] = kind; }
    wireLine();
    ext.diagramLotB = {KINDS: Object.keys(NEW), build, statusSegs, jobSegs, placeSegs, agesPaths, stateAt, lineage, walk, band, ageOf, marginRows, lexisData, threeParts, STATUS, SECTORS, tree, critHtml, critBind, critQuery, critIds, critText, critParams, nm, birth, death, commune, MARGIN_SRC};
})();
