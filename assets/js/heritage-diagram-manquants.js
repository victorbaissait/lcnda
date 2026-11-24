/* LCNDA — 📊 Les diagrammes qui manquaient (maquette docs/design/idees-suite.html, partie 1, comparée au « Data Viz Catalogue ») :
 *  🔀 ensembles parallèles · ⏳ dates incertaines (avec leur marge) · 📏 barres de durée de vie · 〰️ densité (courbe lissée)
 *  🌿 tige et feuilles · ✋ bâtons (comptage) · 🕸 cordes sans rubans · ⚫ points (un point = une personne) · ◻️ aire proportionnelle
 *  🌞 colonnes en cercle (mois, heures) · ⛰ aire empilée · 🧭 schéma pas à pas (écrit en liste) · 📍 image annotée · 🗓 emploi du temps.
 * Chaque sorte : {icon, label, group, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp?} (comme heritage-diagram-nouveaux.js).
 * « Prendre dans ma base » : les naissances, décès, lieux, métiers, couples de la base (api anim_people, lib/anim_studio.php).
 * Tout texte passe par esc() ; couleurs vérifiées (R.color) ; tailles et nombres bornés. Essai : tests/test-diagrammes-manquants.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => { const n = typeof v === 'number' ? v : R.num ? R.num(v) : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
    const n0 = v => (Number.isFinite(num(v)) ? num(v) : 0);
    const color = (c, d) => R.color(c, d);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}), fmt = n => NF.format(Number(n) || 0);
    const TAU = Math.PI * 2;
    const pal = spec => R.PALETTES?.[spec.o?.palette] || R.PALETTES?.vive || ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
    const pick = (spec, i) => pal(spec)[((i % pal(spec).length) + pal(spec).length) % pal(spec).length];
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', baseline = 'middle', op = 0, rot = 0} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${esc(fill)}"${op ? ` fill-opacity="${op}"` : ''}${rot ? ` transform="rotate(${r2(rot)} ${r2(x)} ${r2(y)})"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const rowsOf = (spec, key = 'rows', max = 3000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, max);
    const str = (v, n = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => { msg = i18n(msg); return {h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888888'}), legend: [], desc: msg}; };
    const H_OPT = C('height', 'Hauteur du dessin (0 = automatique)', 'range', {unit: 'px', min: 0, max: 1600, step: 10, def: 0});
    const PALETTE = C('palette', 'Couleurs', 'select', {choices: Object.keys(R.PALETTES || {vive: 1}).map(k => [k, k.charAt(0).toUpperCase() + k.slice(1)])});
    const niceStep = span => { const raw = span / 6, p = 10 ** Math.floor(Math.log10(raw || 1)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || p * 10; };
    const groupsOf = (list, key) => { const m = new Map(); list.forEach(r => { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
    const axisX = (x0, x1, y, lo, hi, fs, {fmtV = v => String(Math.round(v))} = {}) => {
        const st = niceStep(hi - lo); let svg = `<line x1="${r2(x0)}" y1="${r2(y)}" x2="${r2(x1)}" y2="${r2(y)}" stroke="currentColor" stroke-opacity=".35"/>`;
        for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) { const x = x0 + (v - lo) / ((hi - lo) || 1) * (x1 - x0); svg += `<line x1="${r2(x)}" y1="${r2(y)}" x2="${r2(x)}" y2="${r2(y + 4)}" stroke="currentColor" stroke-opacity=".4"/>` + T(x, y + fs * .9, fmtV(v), {size: fs * .78, anchor: 'middle', op: .7}); }
        return svg;
    };

    /* ═════════ 🔀 Ensembles parallèles : chaque personne passe d'une catégorie à l'autre (origine → métier → lieu de décès) ═════════ */
    function parsets(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec).map(r => ({a: str(r.a, 60), b: str(r.b, 60), c: str(r.c, 60), v: Math.max(0, n0(r.value) || 1)})).filter(r => r.a && r.b);
        if (!list.length) return empty(W, fs, 'Une ligne par groupe de personnes : 1er axe, 2e axe (et 3e si tu veux), combien.');
        const axes = ['a', 'b', ...(list.some(r => r.c) ? ['c'] : [])], names = [o.axisA || i18n('Axe 1'), o.axisB || i18n('Axe 2'), o.axisC || i18n('Axe 3')];
        const H = clamp(n0(o.height) || Math.max(260, Math.min(900, list.length * 14 + 160)), 160, 1600), top = fs * 2.2, bot = H - fs * .8, bw = clamp(n0(o.barWidth) || fs * .9, 4, 40);
        const total = list.reduce((s, r) => s + r.v, 0), gapPx = clamp(n0(o.gap ?? 6), 0, 40);
        const colorAxis = axes.includes(o.colorBy) ? o.colorBy : 'a';
        const cats = {}, pos = {};
        axes.forEach(ax => { const m = new Map(); list.forEach(r => { const k = r[ax] || '—'; m.set(k, (m.get(k) || 0) + r.v); }); let arr = [...m.entries()]; arr = o.sort === 'alpha' ? arr.sort((x, y) => x[0].localeCompare(y[0], 'fr')) : arr.sort((x, y) => y[1] - x[1]); cats[ax] = arr; });
        const usable = bot - top, xs = axes.map((_, i) => fs * 7 + (W - fs * 14) * (axes.length > 1 ? i / (axes.length - 1) : .5));
        axes.forEach(ax => { const gaps = (cats[ax].length - 1) * gapPx, k = (usable - gaps) / (total || 1); let y = top; pos[ax] = new Map(); cats[ax].forEach(([key, v]) => { pos[ax].set(key, {y, h: v * k, cur: y, cur2: y}); y += v * k + gapPx; }); });
        const colKeys = cats[colorAxis].map(x => x[0]), colOf = k => color(o['c_' + k], pick(spec, colKeys.indexOf(k)));
        let svg = '';
        for (let i = 0; i < axes.length - 1; i++) {
            const A1 = axes[i], A2 = axes[i + 1], k = (usable - (cats[A1].length - 1) * gapPx) / (total || 1);
            const flows = new Map(); list.forEach(r => { const key = `${r[A1] || '—'}\u0001${r[A2] || '—'}\u0001${r[colorAxis] || '—'}`; flows.set(key, (flows.get(key) || 0) + r.v); });
            const arr = [...flows.entries()].map(([key, v]) => { const [p, q, c] = key.split('\u0001'); return {p, q, c, v}; });
            const ordA = new Map(cats[A1].map((x, j) => [x[0], j])), ordB = new Map(cats[A2].map((x, j) => [x[0], j])), ordC = new Map(colKeys.map((x, j) => [x, j]));
            arr.sort((x, y) => ordA.get(x.p) - ordA.get(y.p) || ordB.get(x.q) - ordB.get(y.q) || ordC.get(x.c) - ordC.get(y.c));
            const outY = new Map(), inY = new Map();
            cats[A1].forEach(([key]) => outY.set(key, pos[A1].get(key).y)); cats[A2].forEach(([key]) => inY.set(key, pos[A2].get(key).y));
            const inOrder = [...arr].sort((x, y) => ordB.get(x.q) - ordB.get(y.q) || ordA.get(x.p) - ordA.get(y.p) || ordC.get(x.c) - ordC.get(y.c)), inAt = new Map();
            inOrder.forEach(f => { const h = f.v * k; inAt.set(f, inY.get(f.q)); inY.set(f.q, inY.get(f.q) + h); });
            arr.forEach(f => {
                const h = f.v * k, y0 = outY.get(f.p), y1 = inAt.get(f); outY.set(f.p, y0 + h);
                const x0 = xs[i] + bw / 2, x1 = xs[i + 1] - bw / 2, mx = (x0 + x1) / 2, c = colOf(f.c);
                svg += `<path d="M${r2(x0)} ${r2(y0)}C${r2(mx)} ${r2(y0)} ${r2(mx)} ${r2(y1)} ${r2(x1)} ${r2(y1)}L${r2(x1)} ${r2(y1 + h)}C${r2(mx)} ${r2(y1 + h)} ${r2(mx)} ${r2(y0 + h)} ${r2(x0)} ${r2(y0 + h)}Z" fill="${c}" fill-opacity="${r2(clamp(n0(o.opacity) || 55, 10, 100) / 100)}">${tip(`${f.p} → ${f.q}${colorAxis !== A1 && colorAxis !== A2 ? ` (${f.c})` : ''} : ${fmt(f.v)}`)}</path>`;
            });
        }
        axes.forEach((ax, i) => {
            svg += T(xs[i], fs * .9, names[i], {size: fs * .95, anchor: 'middle', weight: 700});
            cats[ax].forEach(([key, v]) => { const pp = pos[ax].get(key), c = ax === colorAxis ? colOf(key) : '#55595f';
                svg += `<rect x="${r2(xs[i] - bw / 2)}" y="${r2(pp.y)}" width="${r2(bw)}" height="${r2(Math.max(1, pp.h))}" fill="${c}">${tip(`${key} : ${fmt(v)}`)}</rect>`;
                if (pp.h >= fs * .8) { const right = i < axes.length - 1 || axes.length === 1, lab = o.values !== false ? `${key} (${fmt(v)})` : key; svg += T(xs[i] + (i === axes.length - 1 ? -bw : bw), pp.y + pp.h / 2, cut(lab, fs * 9, fs * .8), {size: fs * .8, anchor: i === axes.length - 1 ? 'end' : 'start'}); void right; } });
        });
        return {h: H, svg, legend: colKeys.slice(0, 12).map(k => ({label: k, color: colOf(k)})), desc: i18n('Ensembles parallèles : {n} personnes, {a} axes.', {n: fmt(total), a: String(axes.length)})};
    }
    const sampleParsets = () => ({o: {title: i18n('D’où l’on vient, ce qu’on fait, où l’on meurt'), axisA: i18n('Né en'), axisB: i18n('Métier'), axisC: i18n('Mort en')}, rows: [
        ['Auvergne', 'Cultivateur', 'Auvergne', 34], ['Auvergne', 'Cultivateur', 'Paris', 6], ['Auvergne', 'Porteur d’eau', 'Paris', 12], ['Auvergne', 'Marchand', 'Paris', 5], ['Limousin', 'Maçon', 'Paris', 9],
        ['Limousin', 'Cultivateur', 'Limousin', 21], ['Paris', 'Employé', 'Paris', 14], ['Paris', 'Marchand', 'Paris', 7]].map(([a, b, c, value]) => ({a: i18n(a), b: i18n(b), c: i18n(c), value}))});

    /* ═════════ ⏳ Dates incertaines : « vers 1750 », « avant 1802 », « entre 1750 et 1760 » dessinées avec leur marge ═════════ */
    /** une date écrite → {lo, best, hi, kind} (années) ; margin : la marge de « vers » ; span : la portée de « avant »/« après » */
    function fuzzy(s, margin = 5, span = 20) {
        const t = str(s, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (!t) return null;
        const ys = [...t.matchAll(/-?\d{3,4}/g)].map(m => Number(m[0])); if (!ys.length) return null;
        if (/^(entre|de)\b/.test(t) || (ys.length >= 2 && /(\/|\bet\b|\ba\b|–|—|-|\bou\b)/.test(t.replace(/^\d{4}-\d{2}(-\d{2})?$/, '')))) { const [a, b] = [Math.min(ys[0], ys[1]), Math.max(ys[0], ys[1])]; if (ys.length >= 2 && !/^\d{4}-\d{1,2}(-\d{1,2})?$/.test(t)) return {lo: a, best: (a + b) / 2, hi: b, kind: 'range'}; }
        const y = ys[0];
        if (/\b(vers|env|environ|circa|ca|c\.|~|abt|about)\b|^c\s|^~/.test(t)) return {lo: y - margin, best: y, hi: y + margin, kind: 'about'};
        if (/\b(avant|av\.?|bef|before|<)\b/.test(t)) return {lo: y - span, best: y, hi: y, kind: 'before'};
        if (/\b(apres|ap\.?|aft|after|>)\b/.test(t)) return {lo: y, best: y, hi: y + span, kind: 'after'};
        if (/\?/.test(t)) return {lo: y - margin, best: y, hi: y + margin, kind: 'about'};
        return {lo: y, best: y, hi: y, kind: 'sure'};
    }
    function uncertain(spec, W, fs) {
        const o = spec.o || {}, m = clamp(n0(o.margin) || 5, 1, 50), sp = clamp(n0(o.span) || 20, 1, 100);
        const list = rowsOf(spec, 'rows', 400).map(r => ({label: str(r.label, 70), d: fuzzy(r.date, m, sp), e: str(r.end) ? fuzzy(r.end, m, sp) : null, note: str(r.note, 120), raw: str(r.date, 40), rawE: str(r.end, 40)})).filter(r => r.label && r.d);
        if (!list.length) return empty(W, fs, 'Une ligne par fait : son nom et sa date comme elle est écrite (« vers 1750 », « avant 1802 », « entre 1750 et 1760 »).');
        if (o.sort === 'date') list.sort((a, b) => a.d.best - b.d.best);
        const lo = Math.floor(Math.min(...list.map(r => r.d.lo)) / 10) * 10, hi = Math.ceil(Math.max(...list.map(r => (r.e ? r.e.hi : r.d.hi))) / 10) * 10 || lo + 10;
        const lw = Math.min(W * .32, Math.max(...list.map(r => textW(r.label, fs * .85))) + 10), x0 = lw + 6, x1 = W - 12, X = v => x0 + (v - lo) / ((hi - lo) || 1) * (x1 - x0);
        const rh = clamp(n0(o.rowHeight) || fs * 1.9, 12, 60), cS = color(o.sureColor, '#2f6db5'), cU = color(o.fuzzyColor, '#e15759'), style = o.style || 'bar';
        let svg = '', y = 6;
        list.forEach((r, i) => {
            const cy = y + rh / 2, segs = [r.d, ...(r.e ? [r.e] : [])];
            if (o.stripes !== false && i % 2) svg += `<rect x="0" y="${r2(y)}" width="${r2(W)}" height="${r2(rh)}" fill="currentColor" fill-opacity=".04"/>`;
            svg += T(lw, cy, cut(r.label, lw - 4, fs * .85), {size: fs * .85, anchor: 'end'});
            if (r.e) svg += `<line x1="${r2(X(r.d.best))}" y1="${r2(cy)}" x2="${r2(X(r.e.best))}" y2="${r2(cy)}" stroke="${cS}" stroke-width="${r2(rh * .18)}" stroke-opacity=".5"/>`;
            segs.forEach((d, j) => {
                const raw = j ? r.rawE : r.raw, sure = d.kind === 'sure', c = sure ? cS : cU, t = tip(`${r.label} : ${raw}${sure ? '' : ` → ${i18n('entre {a} et {b}', {a: String(Math.round(d.lo)), b: String(Math.round(d.hi))})}`}${r.note ? ' — ' + r.note : ''}`);
                if (!sure) {
                    if (style === 'fade') { const id = `dgm-u${i}-${j}`, w = Math.max(2, X(d.hi) - X(d.lo)), ld = d.kind === 'before' ? [0, 1] : d.kind === 'after' ? [1, 0] : [0, .5, 0];
                        svg += `<defs><linearGradient id="${id}">${(d.kind === 'about' ? [[0, 0], [50, 1], [100, 0]] : d.kind === 'before' ? [[0, 0], [100, 1]] : d.kind === 'after' ? [[0, 1], [100, 0]] : [[0, 1], [100, 1]]).map(([of, op]) => `<stop offset="${of}%" stop-color="${c}" stop-opacity="${op * .7}"/>`).join('')}</linearGradient></defs><rect x="${r2(X(d.lo))}" y="${r2(cy - rh * .3)}" width="${r2(w)}" height="${r2(rh * .6)}" fill="url(#${id})">${t}</rect>`; void ld; }
                    else if (style === 'whisker') svg += `<g stroke="${c}" stroke-width="1.6">${t}<line x1="${r2(X(d.lo))}" y1="${r2(cy)}" x2="${r2(X(d.hi))}" y2="${r2(cy)}"/><line x1="${r2(X(d.lo))}" y1="${r2(cy - rh * .25)}" x2="${r2(X(d.lo))}" y2="${r2(cy + rh * .25)}"/><line x1="${r2(X(d.hi))}" y1="${r2(cy - rh * .25)}" x2="${r2(X(d.hi))}" y2="${r2(cy + rh * .25)}"/></g>`;
                    else svg += `<rect x="${r2(X(d.lo))}" y="${r2(cy - rh * .28)}" width="${r2(Math.max(2, X(d.hi) - X(d.lo)))}" height="${r2(rh * .56)}" rx="${r2(rh * .28)}" fill="${c}" fill-opacity=".3">${t}</rect>`;
                }
                svg += `<circle cx="${r2(X(d.best))}" cy="${r2(cy)}" r="${r2(rh * .2)}" fill="${sure ? cS : '#ffffff'}" stroke="${c}" stroke-width="2">${t}</circle>`;
                if (o.labels !== false && !sure) svg += T(X(d.hi) + 4, cy, raw, {size: fs * .7, op: .75});
            });
            y += rh;
        });
        svg += axisX(x0, x1, y + 4, lo, hi, fs);
        return {h: Math.max(n0(o.height), y + fs * 2), svg, legend: [{label: i18n('Date sûre'), color: cS}, {label: i18n('Date approchée (avec sa marge)'), color: cU}], desc: i18n('{n} dates, dont {u} approchées.', {n: String(list.length), u: String(list.filter(r => r.d.kind !== 'sure').length)})};
    }
    const sampleUncertain = () => ({o: {title: i18n('Ce qu’on sait vraiment des MAZAUD'), sort: 'date'}, rows: [
        ['Pierre MAZAUD, naissance', 'vers 1720', '', 'âge au décès'], ['Pierre MAZAUD, mariage', '12 février 1745', ''], ['Marie LACOMBE, naissance', 'avant 1728', '', 'mariée en 1745'],
        ['Jean MAZAUD, naissance', 'entre 1750 et 1756', '', 'recensement'], ['Jean MAZAUD, vie', '1753', 'après 1810', 'vivant au mariage de son fils'], ['Anne DURAND, naissance', '1758?', '']].map(([label, date, end, note]) => ({label: i18n(label), date: i18n(date), end: i18n(end), note: i18n(note || '')}))});

    /* ═════════ 📏 Barres de durée de vie : une barre par personne, de la naissance au décès ═════════ */
    function lifespans(spec, W, fs) {
        const o = spec.o || {}, now = new Date().getFullYear();
        let list = rowsOf(spec, 'rows', 600).map(r => ({name: str(r.name, 70), a: num(String(r.from).match(/-?\d{3,4}/)?.[0]), b: num(String(r.to).match(/-?\d{3,4}/)?.[0]), g: str(r.group, 40)})).filter(r => r.name && Number.isFinite(r.a));
        if (!list.length) return empty(W, fs, 'Une ligne par personne : son nom, l’année de naissance, l’année de décès (vide : toujours en vie ou inconnue), un groupe (couleur).');
        list.forEach(r => { r.open = !Number.isFinite(r.b); if (r.open) r.b = o.openEnd === 'now' ? now : r.a + clamp(n0(o.unknownLen) || 0, 0, 120); });
        if (o.sort === 'birth') list.sort((x, y) => x.a - y.a); else if (o.sort === 'length') list.sort((x, y) => (y.b - y.a) - (x.b - x.a)); else if (o.sort === 'group') list.sort((x, y) => x.g.localeCompare(y.g, 'fr') || x.a - y.a);
        const lo = Math.floor(Math.min(...list.map(r => r.a)) / 10) * 10, hi = Math.ceil(Math.max(...list.map(r => r.b)) / 10) * 10 || lo + 10;
        const lw = o.namesInside ? 0 : Math.min(W * .3, Math.max(...list.map(r => textW(r.name, fs * .82))) + 10), x0 = lw + 4, x1 = W - 10, X = v => x0 + (v - lo) / ((hi - lo) || 1) * (x1 - x0);
        const rh = clamp(n0(o.rowHeight) || fs * 1.6, 8, 50), groups = [...new Set(list.map(r => r.g))], colOf = g => (o.colorBy === 'one' ? color(o.barColor, '#4e79a7') : color(o['c_' + g], pick(spec, groups.indexOf(g))));
        let svg = '', y = 4;
        const marks = String(o.marks || '').split(/[,;\s]+/).map(Number).filter(Number.isFinite);
        marks.forEach(m => { if (m >= lo && m <= hi) svg += `<line x1="${r2(X(m))}" y1="0" x2="${r2(X(m))}" y2="${r2(list.length * rh + 8)}" stroke="#e15759" stroke-dasharray="4 3" stroke-opacity=".7"/>` + T(X(m) + 3, 6, String(m), {size: fs * .7, fill: '#e15759'}); });
        list.forEach(r => {
            const c = colOf(r.g), w = Math.max(2, X(r.b) - X(r.a)), age = Math.round(r.b - r.a);
            if (!o.namesInside) svg += T(lw, y + rh / 2, cut(r.name, lw - 4, fs * .82), {size: fs * .82, anchor: 'end'});
            svg += `<rect x="${r2(X(r.a))}" y="${r2(y + rh * .14)}" width="${r2(w)}" height="${r2(rh * .72)}" rx="${r2(clamp(n0(o.radius ?? 3), 0, 20))}" fill="${c}"${r.open ? ` fill-opacity=".45" stroke="${c}" stroke-dasharray="3 2"` : ''}>${tip(`${r.name} : ${Math.round(r.a)} – ${r.open ? '?' : Math.round(r.b)}${r.open ? '' : ` (${i18n('{n} ans', {n: String(age)})})`}`)}</rect>`;
            if (o.namesInside && w > textW(r.name, fs * .75) + 8) svg += T(X(r.a) + 4, y + rh / 2, r.name, {size: fs * .75, fill: contrast(c)});
            if (o.ages !== false && !r.open) svg += T(X(r.b) + 4, y + rh / 2, i18n('{n} ans', {n: String(age)}), {size: fs * .7, op: .7});
            y += rh;
        });
        svg += axisX(x0, x1, y + 4, lo, hi, fs);
        return {h: Math.max(n0(o.height), y + fs * 2), svg, legend: groups.filter(Boolean).map(g => ({label: g, color: colOf(g)})), desc: i18n('{n} vies, de {a} à {b}.', {n: String(list.length), a: String(lo), b: String(hi)})};
    }
    const sampleLifespans = () => ({o: {title: i18n('Les vies de la famille'), sort: 'birth', marks: '1789, 1870, 1914'}, rows: [
        ['Pierre MAZAUD', 1720, 1781, 'MAZAUD'], ['Marie LACOMBE', 1726, 1790, 'LACOMBE'], ['Jean MAZAUD', 1753, 1818, 'MAZAUD'], ['Anne DURAND', 1758, 1830, 'DURAND'], ['Louis MAZAUD', 1789, 1871, 'MAZAUD'],
        ['Rose MAZAUD', 1792, 1801, 'MAZAUD'], ['Paul DURAND', 1840, 1915, 'DURAND'], ['Jeanne MAZAUD', 1895, '', 'MAZAUD']].map(([name, from, to, group]) => ({name, from, to, group}))});

    /* ═════════ 〰️ Densité : la courbe lissée des valeurs (âges au décès, au mariage…), un groupe = une courbe ═════════ */
    function kde(values, bw, lo, hi, n = 160) { const out = []; const k = 1 / (values.length * bw * Math.sqrt(TAU)); for (let i = 0; i <= n; i++) { const x = lo + (hi - lo) * i / n; let s = 0; for (const v of values) { const z = (x - v) / bw; s += Math.exp(-.5 * z * z); } out.push([x, s * k]); } return out; }
    function density(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec).map(r => ({g: str(r.group, 40) || '·', v: num(r.value)})).filter(r => Number.isFinite(r.v));
        if (list.length < 3) return empty(W, fs, 'Au moins 3 valeurs : une ligne par valeur (un âge, une année…), avec son groupe si tu veux comparer.');
        const G = groupsOf(list, 'g'), all = list.map(r => r.v), lo0 = Math.min(...all), hi0 = Math.max(...all), sd = Math.sqrt(all.reduce((s, v) => s + (v - all.reduce((a, b) => a + b, 0) / all.length) ** 2, 0) / all.length) || 1;
        const bw = n0(o.bandwidth) > 0 ? n0(o.bandwidth) : 1.06 * sd * all.length ** -.2, lo = Number.isFinite(num(o.min)) ? num(o.min) : lo0 - bw * 2, hi = Number.isFinite(num(o.max)) ? num(o.max) : hi0 + bw * 2;
        const H = clamp(n0(o.height) || 300, 120, 1200), x0 = fs * 3, x1 = W - 10, y0 = 8, y1 = H - fs * 2.6, X = v => x0 + (v - lo) / ((hi - lo) || 1) * (x1 - x0);
        const curves = [...G.entries()].map(([g, rs], i) => ({g, rs, c: color(o['c_' + g], pick(spec, i)), d: kde(rs.map(r => r.v), bw, lo, hi).map(([x, y]) => [x, o.scale === 'count' ? y * rs.length : y])}));
        const ymax = Math.max(...curves.flatMap(c => c.d.map(p => p[1]))) || 1, Y = v => y1 - v / ymax * (y1 - y0);
        let svg = '';
        curves.forEach(({g, rs, c, d}) => {
            const path = d.map(([x, y], j) => `${j ? 'L' : 'M'}${r2(X(x))} ${r2(Y(y))}`).join('');
            if (o.fill !== false) svg += `<path d="${path}L${r2(X(hi))} ${r2(y1)}L${r2(X(lo))} ${r2(y1)}Z" fill="${c}" fill-opacity="${curves.length > 1 ? .22 : .3}"/>`;
            svg += `<path d="${path}" fill="none" stroke="${c}" stroke-width="2">${tip(`${g} : ${i18n('{n} valeurs', {n: String(rs.length)})}`)}</path>`;
            if (o.rug !== false) rs.slice(0, 600).forEach(r => { svg += `<line x1="${r2(X(r.v))}" y1="${r2(y1)}" x2="${r2(X(r.v))}" y2="${r2(y1 + 6)}" stroke="${c}" stroke-opacity=".6"/>`; });
            if (o.median !== false) { const s = rs.map(r => r.v).sort((a, b) => a - b), med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; svg += `<line x1="${r2(X(med))}" y1="${r2(y0)}" x2="${r2(X(med))}" y2="${r2(y1)}" stroke="${c}" stroke-dasharray="4 3">${tip(i18n('Médiane de {g} : {m}', {g, m: fmt(med)}))}</line>`; }
        });
        svg += axisX(x0, x1, y1 + 8, lo, hi, fs, {fmtV: v => fmt(v)}) + (o.xLabel ? T((x0 + x1) / 2, H - fs * .5, o.xLabel, {size: fs * .8, anchor: 'middle', op: .8}) : '');
        return {h: H, svg, legend: curves.length > 1 ? curves.map(c => ({label: c.g, color: c.c})) : [], desc: i18n('Densité de {n} valeurs.', {n: String(list.length)})};
    }
    const sampleDensity = () => ({o: {title: i18n('L’âge au décès, avant et après 1850'), xLabel: i18n('Âge au décès (ans)'), min: 0, max: 100}, rows: [
        ...[1, 2, 3, 15, 30, 42, 55, 61, 64, 68, 70, 72, 75, 78, 81, 0, 1, 2, 45, 66].map(v => ({group: i18n('Avant 1850'), value: v})), ...[2, 25, 50, 58, 63, 67, 70, 72, 74, 76, 78, 80, 82, 85, 88, 90, 71, 69].map(v => ({group: i18n('Après 1850'), value: v}))]});

    /* ═════════ 🌿 Tige et feuilles : chaque valeur écrite (tige = les dizaines, feuille = l'unité) ═════════ */
    function stemleaf(spec, W, fs) {
        const o = spec.o || {}, unit = [1, 10, 100].includes(n0(o.unit)) ? n0(o.unit) : 10, list = rowsOf(spec).map(r => ({g: str(r.group, 30), v: num(r.value)})).filter(r => Number.isFinite(r.v));
        if (!list.length) return empty(W, fs, 'Une ligne par valeur (un âge au décès, un nombre d’enfants…) ; deux groupes : dos à dos.');
        const groups = [...new Set(list.map(r => r.g))].slice(0, 2), two = groups.length === 2 && o.back !== false;
        const leafOf = v => Math.floor(Math.abs(v) / (unit / 10)) % 10, stemOf = v => Math.floor(v / unit);
        const stems = []; const s0 = Math.min(...list.map(r => stemOf(r.v))), s1 = Math.max(...list.map(r => stemOf(r.v))); for (let s = s0; s <= s1; s++) stems.push(s);
        const leaves = (g, s) => list.filter(r => (!two || r.g === g) && stemOf(r.v) === s).map(r => leafOf(r.v)).sort((a, b) => a - b);
        const lh = fs * 1.35, cw = fs * .62, mid = two ? W / 2 : fs * 4, c1 = color(o.color1, pick(spec, 0)), c2 = color(o.color2, pick(spec, 1));
        let svg = '', y = fs * (two ? 2.2 : 1);
        if (two) { svg += T(mid - fs * 2, fs * .9, groups[0], {size: fs * .9, anchor: 'end', weight: 700, fill: c1}) + T(mid + fs * 2, fs * .9, groups[1], {size: fs * .9, weight: 700, fill: c2}); }
        stems.forEach(s => {
            svg += T(mid, y, String(s), {size: fs, anchor: 'middle', weight: 700});
            const L = two ? leaves(groups[0], s) : [], Rr = two ? leaves(groups[1], s) : leaves(groups[0] ?? '', s);
            L.reverse().forEach((l, i) => { svg += T(mid - fs * 1.6 - i * cw, y, String(l), {size: fs * .95, anchor: 'end', fill: c1, baseline: 'middle'}); });
            (two ? Rr : leaves(null, s)).forEach((l, i) => { svg += T(mid + fs * 1.6 + i * cw, y, String(l), {size: fs * .95, fill: two ? c2 : c1}); });
            y += lh;
        });
        svg += `<line x1="${r2(mid - fs * 1.05)}" y1="${r2(fs * (two ? 1.6 : .3))}" x2="${r2(mid - fs * 1.05)}" y2="${r2(y - lh / 2)}" stroke="currentColor" stroke-opacity=".5"/>`;
        if (two) svg += `<line x1="${r2(mid + fs * 1.05)}" y1="${r2(fs * 1.6)}" x2="${r2(mid + fs * 1.05)}" y2="${r2(y - lh / 2)}" stroke="currentColor" stroke-opacity=".5"/>`;
        const key = i18n('Exemple : {s} | {l} = {v}', {s: String(stems[Math.floor(stems.length / 2)]), l: '4', v: fmt(stems[Math.floor(stems.length / 2)] * unit + 4 * unit / 10)});
        svg += T(4, y + fs * .4, key, {size: fs * .75, op: .7});
        return {h: Math.max(n0(o.height), y + fs * 1.4), svg, legend: [], desc: i18n('Tige et feuilles de {n} valeurs.', {n: String(list.length)})};
    }
    const sampleStem = () => ({o: {title: i18n('Âges au décès relevés dans le registre de Sancoins, 1790-1799'), unit: 10}, rows: [0, 1, 1, 2, 4, 7, 12, 18, 23, 27, 31, 34, 38, 42, 45, 47, 51, 55, 58, 61, 63, 64, 67, 69, 70, 72, 74, 78, 81, 86, 92].map(v => ({value: v}))});

    /* ═════════ ✋ Bâtons : compter à la main (|||| barré par 5) ═════════ */
    function tally(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 200).map(r => ({label: str(r.label, 60), v: Math.max(0, Math.round(n0(r.value)))})).filter(r => r.label);
        if (!list.length) return empty(W, fs, 'Une ligne par chose comptée : son nom, combien.');
        if (o.sort === 'desc') list.sort((a, b) => b.v - a.v);
        const lw = Math.min(W * .35, Math.max(...list.map(r => textW(r.label, fs * .9))) + 12), sw = clamp(n0(o.stroke) || 2, 1, 6), gh = clamp(n0(o.size) || fs * 1.5, 10, 60), gw = gh * .9, lineGap = gh * .45;
        const perLine = Math.max(1, Math.floor((W - lw - fs * 3) / (gw + gh * .5))), rough = o.style !== 'neat';
        let svg = '', y = 6, seed = 1; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - .5; };
        list.forEach((r, i) => {
            const c = o.colorBy === 'row' ? pick(spec, i) : color(o.color, '#1d1d1f'), groups = Math.ceil(r.v / 5), lines = Math.max(1, Math.ceil(groups / perLine));
            svg += T(lw - 8, y + gh / 2, cut(r.label, lw - 12, fs * .9), {size: fs * .9, anchor: 'end'});
            let g = '';
            for (let k = 0; k < groups; k++) {
                const left = lw + (k % perLine) * (gw + gh * .5), top = y + Math.floor(k / perLine) * (gh + lineGap), n = Math.min(5, r.v - k * 5);
                for (let j = 0; j < Math.min(4, n); j++) { const x = left + j * gw / 4 + gw / 8, j1 = rough ? rnd() * 1.5 : 0, j2 = rough ? rnd() * 1.5 : 0; g += `<line x1="${r2(x + j1)}" y1="${r2(top + 1)}" x2="${r2(x + j2)}" y2="${r2(top + gh - 1)}"/>`; }
                if (n === 5) g += `<line x1="${r2(left - 2)}" y1="${r2(top + gh * .8)}" x2="${r2(left + gw + 1)}" y2="${r2(top + gh * .2)}"/>`;
            }
            svg += `<g stroke="${c}" stroke-width="${r2(sw)}" stroke-linecap="round">${tip(`${r.label} : ${r.v}`)}${g}</g>`;
            if (o.values !== false) svg += T(W - 4, y + gh / 2, String(r.v), {size: fs * .85, anchor: 'end', weight: 700, op: .75});
            y += lines * (gh + lineGap) + fs * .5;
        });
        return {h: Math.max(n0(o.height), y), svg, legend: [], desc: i18n('Comptage : {n} lignes.', {n: String(list.length)})};
    }
    const sampleTally = () => ({o: {title: i18n('Relevé du registre de Naves, 1790 (à la main)')}, rows: [['Baptêmes', 23], ['Mariages', 7], ['Sépultures', 18], ['dont enfants de moins d’un an', 9]].map(([label, value]) => ({label: i18n(label), value}))});

    /* ═════════ 🕸 Cordes sans rubans : les liens en simples traits (mariages entre familles, entre villages) ═════════ */
    function chordlines(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec).map(r => ({a: str(r.from, 50), b: str(r.to, 50), v: Math.max(0, n0(r.value) || 1)})).filter(r => r.a && r.b);
        if (!list.length) return empty(W, fs, 'Une ligne par lien : de, vers, combien (par exemple deux noms de famille et le nombre de mariages entre eux).');
        const tot = new Map(); list.forEach(r => { tot.set(r.a, (tot.get(r.a) || 0) + r.v); tot.set(r.b, (tot.get(r.b) || 0) + r.v); });
        let nodes = [...tot.entries()].sort((x, y) => (o.sort === 'alpha' ? x[0].localeCompare(y[0], 'fr') : y[1] - x[1])).slice(0, clamp(n0(o.top) || 40, 3, 120)).map(x => x[0]);
        const keep = new Set(nodes), H = clamp(n0(o.height) || Math.min(W, 760), 200, 1600), cx = W / 2, cy = H / 2, Rr = Math.min(W, H) / 2 - fs * 7;
        const ang = new Map(nodes.map((n, i) => [n, -Math.PI / 2 + TAU * i / nodes.length])), P = (n, r = Rr) => [cx + Math.cos(ang.get(n)) * r, cy + Math.sin(ang.get(n)) * r];
        const vmax = Math.max(...list.map(r => r.v)), colOf = n => color(o['c_' + n], pick(spec, nodes.indexOf(n)));
        let svg = '';
        list.filter(r => keep.has(r.a) && keep.has(r.b)).sort((x, y) => x.v - y.v).forEach(r => {
            const [x0, y0] = P(r.a), [x1, y1] = P(r.b), c = o.colorBy === 'one' ? color(o.lineColor, '#4e79a7') : colOf(r.a), w = clamp(1 + (r.v / vmax) * (n0(o.maxWidth) || 8), .6, 30);
            const d = r.a === r.b ? `M${r2(x0)} ${r2(y0)}m-1 0a${r2(fs)} ${r2(fs)} 0 1 0 2 0` : `M${r2(x0)} ${r2(y0)}Q${r2(cx + (x0 + x1 - 2 * cx) * clamp(n0(o.bend ?? 15), 0, 100) / 200)} ${r2(cy + (y0 + y1 - 2 * cy) * clamp(n0(o.bend ?? 15), 0, 100) / 200)} ${r2(x1)} ${r2(y1)}`;
            svg += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${r2(w)}" stroke-opacity="${r2(clamp(n0(o.opacity) || 60, 10, 100) / 100)}" stroke-linecap="round">${tip(`${r.a} — ${r.b} : ${fmt(r.v)}`)}</path>`;
        });
        nodes.forEach(n => { const [x, y] = P(n), [lx, ly] = P(n, Rr + fs * .7), a = ang.get(n), deg = a * 180 / Math.PI, flip = Math.cos(a) < 0;
            svg += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(clamp(3 + Math.sqrt(tot.get(n)) * 1.2, 3, fs * 1.2))}" fill="${colOf(n)}">${tip(`${n} : ${fmt(tot.get(n))}`)}</circle>` + T(lx, ly, cut(n, fs * 6.5, fs * .8), {size: fs * .8, anchor: flip ? 'end' : 'start', rot: flip ? deg + 180 : deg}); });
        return {h: H, svg, legend: [], desc: i18n('{n} liens entre {m} noms.', {n: String(list.length), m: String(nodes.length)})};
    }
    const sampleChordLines = () => ({o: {title: i18n('Les mariages entre familles')}, rows: [['MAZAUD', 'LACOMBE', 4], ['MAZAUD', 'DURAND', 3], ['LACOMBE', 'DURAND', 2], ['DURAND', 'BORIE', 5], ['BORIE', 'MAZAUD', 1], ['CHASTANG', 'BORIE', 2], ['CHASTANG', 'LACOMBE', 1], ['MAZAUD', 'MAZAUD', 1]].map(([from, to, value]) => ({from, to, value}))});

    /* ═════════ ⚫ Points : un point = une personne (ou un nombre), rangés en colonnes ou en grille ═════════ */
    function unitdots(spec, W, fs) {
        const o = spec.o || {}, per = Math.max(1, n0(o.per) || 1), list = rowsOf(spec, 'rows', 200).map(r => ({col: str(r.column, 40), g: str(r.group, 40) || '·', v: Math.max(0, n0(r.value))})).filter(r => r.v > 0);
        if (!list.length) return empty(W, fs, 'Une ligne par paquet : la colonne (décennie, village…), le groupe (couleur), combien.');
        const cols = [...new Set(list.map(r => r.col))], groups = [...new Set(list.map(r => r.g))], colOf = g => color(o['c_' + g], pick(spec, groups.indexOf(g)));
        const sz = clamp(n0(o.size) || fs * .8, 3, 40), gap = sz * .35, step = sz + gap, perRow = clamp(n0(o.perRow) || 5, 1, 50);
        const layout = o.layout === 'waffle' ? 'waffle' : 'columns';
        let svg = '', H = 0;
        const dot = (x, y, c, t) => (o.shape === 'square' ? `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(sz)}" height="${r2(sz)}" rx="1" fill="${c}">${t}</rect>` : `<circle cx="${r2(x + sz / 2)}" cy="${r2(y + sz / 2)}" r="${r2(sz / 2)}" fill="${c}">${t}</circle>`);
        if (layout === 'waffle') {
            const across = Math.max(1, Math.floor((W - 8) / step)); let k = 0;
            groups.forEach(g => { const n = Math.round(list.filter(r => r.g === g).reduce((s, r) => s + r.v, 0) / per); for (let i = 0; i < n && k < 5000; i++, k++) svg += dot(4 + (k % across) * step, 4 + Math.floor(k / across) * step, colOf(g), tip(g)); });
            H = 8 + Math.ceil(k / across) * step;
        } else {
            const cw = Math.max(perRow * step + fs, (W - 8) / Math.max(1, cols.length)), base = clamp(n0(o.height) || 0, 0, 1600);
            let maxRows = 0; const stacks = cols.map(c => { const items = []; groups.forEach(g => { const n = Math.round(list.filter(r => r.col === c && r.g === g).reduce((s, r) => s + r.v, 0) / per); for (let i = 0; i < n; i++) items.push(g); }); maxRows = Math.max(maxRows, Math.ceil(items.length / perRow)); return items; });
            const bottom = Math.max(base - fs * 2, maxRows * step + 6);
            stacks.forEach((items, ci) => { const x0 = 4 + ci * cw + (cw - perRow * step) / 2; items.slice(0, 3000).forEach((g, i) => { svg += dot(x0 + (i % perRow) * step, bottom - (Math.floor(i / perRow) + 1) * step, colOf(g), tip(`${cols[ci]} · ${g}`)); }); svg += T(4 + ci * cw + cw / 2, bottom + fs * .9, cut(cols[ci], cw - 4, fs * .78), {size: fs * .78, anchor: 'middle'}) + (o.values !== false ? T(4 + ci * cw + cw / 2, bottom - (Math.ceil(items.length / perRow)) * step - fs * .6, String(items.length * per), {size: fs * .72, anchor: 'middle', op: .7}) : ''); });
            H = bottom + fs * 1.8;
        }
        return {h: Math.max(n0(o.height), H), svg, legend: groups.filter(g => g !== '·').map(g => ({label: g, color: colOf(g)})), desc: per > 1 ? i18n('Un point = {n}.', {n: String(per)}) : i18n('Un point = une personne.')};
    }
    const sampleUnits = () => ({o: {title: i18n('Les naissances par décennie, garçons et filles')}, rows: [['1800', 'Garçons', 6], ['1800', 'Filles', 4], ['1810', 'Garçons', 9], ['1810', 'Filles', 8], ['1820', 'Garçons', 5], ['1820', 'Filles', 7], ['1830', 'Garçons', 11], ['1830', 'Filles', 10]].map(([column, group, value]) => ({column, group: i18n(group), value}))});

    /* ═════════ ◻️ Aire proportionnelle : un carré (ou un rond) dont la surface dit le nombre ═════════ */
    function proparea(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 120).map(r => ({label: str(r.label, 50), v: Math.max(0, n0(r.value))})).filter(r => r.label && r.v > 0);
        if (!list.length) return empty(W, fs, 'Une ligne par chose : son nom, combien.');
        if (o.sort !== 'none') list.sort((a, b) => b.v - a.v);
        const max = Math.max(...list.map(r => r.v)), big = clamp(n0(o.maxSize) || Math.min(W * .35, 220), 30, 600), side = v => big * Math.sqrt(v / max), gap = fs;
        let svg = '', x = 4, y = 4, rowH = 0; const circle = o.shape === 'circle';
        list.forEach((r, i) => {
            const s = Math.max(3, side(r.v)); if (x + s > W - 4 && x > 4) { x = 4; y += rowH + fs * 2.6; rowH = 0; }
            const c = o.colorBy === 'one' ? color(o.color, '#4e79a7') : pick(spec, i), base = y + big - s;
            svg += circle ? `<circle cx="${r2(x + s / 2)}" cy="${r2(base + s / 2)}" r="${r2(s / 2)}" fill="${c}">${tip(`${r.label} : ${fmt(r.v)}`)}</circle>` : `<rect x="${r2(x)}" y="${r2(base)}" width="${r2(s)}" height="${r2(s)}" fill="${c}">${tip(`${r.label} : ${fmt(r.v)}`)}</rect>`;
            if (s > fs * 2.2) svg += T(x + s / 2, base + s / 2, fmt(r.v), {size: Math.min(fs * 1.2, s / 3), anchor: 'middle', weight: 700, fill: contrast(c)});
            svg += T(x + Math.max(s, fs) / 2, y + big + fs * .9, cut(r.label, Math.max(s, fs * 5), fs * .78), {size: fs * .78, anchor: 'middle'}) + (s <= fs * 2.2 ? T(x + Math.max(s, fs) / 2, y + big + fs * 1.9, fmt(r.v), {size: fs * .72, anchor: 'middle', op: .7}) : '');
            x += Math.max(s, textW(cut(r.label, Math.max(s, fs * 5), fs * .78), fs * .78)) + gap; rowH = Math.max(rowH, big);
        });
        return {h: Math.max(n0(o.height), y + big + fs * 2.8), svg, legend: [], desc: i18n('{n} surfaces proportionnelles.', {n: String(list.length)})};
    }
    const sampleProp = () => ({o: {title: i18n('Les naissances de la famille, par village')}, rows: [['Aurillac', 48], ['Mauriac', 21], ['Paris', 17], ['Saint-Flour', 9], ['Lyon', 4], ['Vic-sur-Cère', 2]].map(([label, value]) => ({label, value}))});

    /* ═════════ 🌞 Colonnes en cercle : les 12 mois (ou 24 heures) en colonnes autour d'un cercle ═════════ */
    function radialcol(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 120).map(r => ({label: str(r.label, 30), v: Math.max(0, n0(r.value)), g: str(r.group, 30)})).filter(r => r.label);
        if (!list.length) return empty(W, fs, 'Une ligne par colonne : son nom (janvier, février… ou 0 h, 1 h…), combien.');
        const labels = [...new Set(list.map(r => r.label))], groups = [...new Set(list.map(r => r.g))], H = clamp(n0(o.height) || Math.min(W, 620), 200, 1400);
        const cx = W / 2, cy = H / 2, r0 = Math.min(W, H) / 2 * clamp(n0(o.hole) || 22, 5, 70) / 100, r1 = Math.min(W, H) / 2 - fs * 2.6, n = labels.length, slot = TAU / n, pad = slot * clamp(n0(o.pad ?? 12), 0, 60) / 100;
        const sums = labels.map(l => list.filter(r => r.label === l).reduce((s, r) => s + r.v, 0)), max = n0(o.max) > 0 ? n0(o.max) : Math.max(...sums) || 1;
        let svg = `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r0)}" fill="none" stroke="currentColor" stroke-opacity=".2"/>`;
        if (o.grid !== false) for (let k = 1; k <= 4; k++) svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r0 + (r1 - r0) * k / 4)}" fill="none" stroke="currentColor" stroke-opacity=".08"/>`;
        const P = (r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
        labels.forEach((l, i) => {
            const a0 = -Math.PI / 2 + i * slot + pad / 2, a1 = a0 + slot - pad; let rr = r0;
            (groups.length > 1 ? groups : ['']).forEach((g, gi) => {
                const v = list.filter(r => r.label === l && (groups.length > 1 ? r.g === g : true)).reduce((s, r) => s + r.v, 0), h = (r1 - r0) * v / max, c = groups.length > 1 ? color(o['c_' + g], pick(spec, gi)) : (o.colorBy === 'one' ? color(o.color, '#4e79a7') : pick(spec, i)); if (!v) return;
                const [x0, y0] = P(rr, a0), [x1, y1] = P(rr + h, a0), [x2, y2] = P(rr + h, a1), [x3, y3] = P(rr, a1);
                svg += `<path d="M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(y1)}A${r2(rr + h)} ${r2(rr + h)} 0 0 1 ${r2(x2)} ${r2(y2)}L${r2(x3)} ${r2(y3)}A${r2(rr)} ${r2(rr)} 0 0 0 ${r2(x0)} ${r2(y0)}Z" fill="${c}">${tip(`${l}${g ? ' · ' + g : ''} : ${fmt(v)}`)}</path>`; rr += h;
            });
            const am = (a0 + a1) / 2, [lx, ly] = P(r1 + fs * 1.1, am); svg += T(lx, ly, cut(l, fs * 5, fs * .78), {size: fs * .78, anchor: 'middle'});
            if (o.values !== false && sums[i]) { const [vx, vy] = P(r0 + (r1 - r0) * sums[i] / max + fs * .6, am); svg += T(vx, vy, fmt(sums[i]), {size: fs * .65, anchor: 'middle', op: .75}); }
        });
        if (o.center) svg += T(cx, cy, o.center, {size: fs, anchor: 'middle', weight: 700});
        return {h: H, svg, legend: groups.length > 1 ? groups.map((g, gi) => ({label: g, color: color(o['c_' + g], pick(spec, gi))})) : [], desc: i18n('{n} colonnes en cercle.', {n: String(n)})};
    }
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const sampleRadialCol = () => ({o: {title: i18n('Les naissances selon le mois'), center: i18n('Naissances')}, rows: [14, 17, 21, 19, 15, 12, 10, 9, 13, 16, 18, 15].map((value, i) => ({label: i18n(MONTHS[i]), value}))});

    /* ═════════ ⛰ Aire empilée : des courbes posées les unes sur les autres, sur une ligne droite (ou en %) ═════════ */
    function stackarea(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec).map(r => ({x: num(String(r.x).match(/-?\d+(\.\d+)?/)?.[0]), s: str(r.series, 40) || '·', v: Math.max(0, n0(r.value))})).filter(r => Number.isFinite(r.x));
        if (!list.length) return empty(W, fs, 'Une ligne par point : l’année (ou un nombre), la série (couleur), la valeur.');
        const xs = [...new Set(list.map(r => r.x))].sort((a, b) => a - b), series = [...new Set(list.map(r => r.s))], pct = o.percent === true;
        const val = (s, x) => list.filter(r => r.s === s && r.x === x).reduce((a, r) => a + r.v, 0);
        const tot = xs.map(x => series.reduce((a, s) => a + val(s, x), 0)), max = pct ? 100 : Math.max(...tot) || 1;
        const H = clamp(n0(o.height) || 320, 140, 1200), x0 = fs * 3, x1 = W - (o.labels !== false ? fs * 6 : 10), y0 = 8, y1 = H - fs * 2.4, X = v => x0 + (v - xs[0]) / ((xs[xs.length - 1] - xs[0]) || 1) * (x1 - x0), Y = v => y1 - v / max * (y1 - y0);
        let svg = '', base = xs.map(() => 0);
        for (let k = 0; k <= 4; k++) { const v = max * k / 4; svg += `<line x1="${r2(x0)}" y1="${r2(Y(v))}" x2="${r2(x1)}" y2="${r2(Y(v))}" stroke="currentColor" stroke-opacity=".08"/>` + T(x0 - 4, Y(v), pct ? `${Math.round(v)} %` : fmt(v), {size: fs * .7, anchor: 'end', op: .7}); }
        series.forEach((s, i) => {
            const c = color(o['c_' + s], pick(spec, i)), top = xs.map((x, j) => base[j] + (pct ? (tot[j] ? val(s, x) / tot[j] * 100 : 0) : val(s, x)));
            const curve = (arr, rev = false) => { const pts = arr.map((v, j) => [X(xs[j]), Y(v)]); if (rev) pts.reverse(); return pts.map(([x, y], j) => `${j ? 'L' : (rev ? 'L' : 'M')}${r2(x)} ${r2(y)}`).join(''); };
            svg += `<path d="${curve(top)}${curve(base, true)}Z" fill="${c}" fill-opacity="${r2(clamp(n0(o.opacity) || 85, 10, 100) / 100)}" stroke="${c}">${tip(s)}</path>`;
            if (o.labels !== false) svg += T(x1 + 4, Y((top[top.length - 1] + base[base.length - 1]) / 2), cut(s, fs * 5.5, fs * .78), {size: fs * .78, fill: c, weight: 600});
            base = top;
        });
        svg += axisX(x0, x1, y1 + 4, xs[0], xs[xs.length - 1], fs);
        return {h: H, svg, legend: series.map((s, i) => ({label: s, color: color(o['c_' + s], pick(spec, i))})), desc: i18n('Aire empilée : {n} séries.', {n: String(series.length)})};
    }
    const sampleStack = () => ({o: {title: i18n('Les naissances par nom de famille')}, rows: [1750, 1770, 1790, 1810, 1830, 1850].flatMap((x, j) => [['MAZAUD', [3, 5, 6, 8, 7, 9][j]], ['LACOMBE', [2, 2, 4, 3, 5, 4][j]], ['DURAND', [0, 1, 2, 4, 6, 8][j]]].map(([series, value]) => ({x, series, value})))});

    /* ═════════ 🧭 Schéma pas à pas : écrit comme une liste (étape, question oui/non, fin), dessiné tout seul ═════════ */
    function flowtext(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 80).map((r, i) => ({id: str(r.id, 20) || String(i + 1), text: str(r.text, 140), kind: ['question', 'end', 'start'].includes(r.kind) ? r.kind : 'step', yes: str(r.yes, 20), no: str(r.no, 20)})).filter(r => r.text);
        if (!list.length) return empty(W, fs, 'Une ligne par case : un numéro, le texte, la sorte (étape, question, début, fin), et pour une question : où aller si oui, si non.');
        const byId = new Map(list.map(r => [r.id, r])), next = r => (r.kind === 'question' ? [r.yes, r.no] : [r.yes || list[list.indexOf(r) + 1]?.id]).filter(x => x && byId.has(x));
        const level = new Map(), col = new Map(); level.set(list[0].id, 0); col.set(list[0].id, 0);
        const queue = [list[0].id]; while (queue.length) { const id = queue.shift(), r = byId.get(id); next(r).forEach((nid, k) => { if (!level.has(nid)) { level.set(nid, level.get(id) + 1); col.set(nid, col.get(id) + (r.kind === 'question' && k === 1 ? 1 : 0)); queue.push(nid); } }); }
        list.forEach(r => { if (!level.has(r.id)) { level.set(r.id, Math.max(0, ...level.values()) + 1); col.set(r.id, 0); } });
        const cols = Math.max(...col.values()) + 1, bw = Math.min(W / cols - fs * 2, fs * 16), bh = fs * 3.2, vg = fs * 1.8, cw = W / cols;
        const box = r => ({x: cw * col.get(r.id) + (cw - bw) / 2, y: 6 + level.get(r.id) * (bh + vg)});
        const cS = color(o.stepColor, '#eef4ff'), cQ = color(o.questionColor, '#fff4d6'), cE = color(o.endColor, '#e8f5e9'), ink = '#1d1d1f';
        let svg = `<defs><marker id="dgm-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="currentColor" fill-opacity=".6"/></marker></defs>`, H = 0;
        list.forEach(r => { const a = box(r); next(r).forEach((nid, k) => { const b = box(byId.get(nid)), x0 = a.x + bw / 2, y0 = a.y + bh, x1 = b.x + bw / 2, y1 = b.y;
            const back = y1 <= y0; const d = back ? `M${r2(a.x + bw)} ${r2(a.y + bh / 2)}C${r2(a.x + bw + fs * 3)} ${r2(a.y + bh / 2)} ${r2(b.x + bw + fs * 3)} ${r2(b.y + bh / 2)} ${r2(b.x + bw)} ${r2(b.y + bh / 2)}` : `M${r2(x0)} ${r2(y0)}C${r2(x0)} ${r2((y0 + y1) / 2)} ${r2(x1)} ${r2((y0 + y1) / 2)} ${r2(x1)} ${r2(y1)}`;
            svg += `<path d="${d}" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.5" marker-end="url(#dgm-arr)"/>`;
            if (r.kind === 'question') svg += T(back ? a.x + bw + fs * 1.5 : (x0 + x1) / 2 + (k ? fs * .8 : -fs * .8), back ? (a.y + b.y + bh) / 2 : y0 + vg * .45, k ? i18n('non') : i18n('oui'), {size: fs * .75, anchor: 'middle', weight: 700, fill: k ? '#b3261e' : '#1a7f37'}); }); });
        list.forEach(r => { const {x, y} = box(r), c = r.kind === 'question' ? cQ : r.kind === 'end' || r.kind === 'start' ? cE : cS;
            svg += r.kind === 'question' ? `<path d="M${r2(x + bw / 2)} ${r2(y)}L${r2(x + bw)} ${r2(y + bh / 2)}L${r2(x + bw / 2)} ${r2(y + bh)}L${r2(x)} ${r2(y + bh / 2)}Z" fill="${c}" stroke="currentColor" stroke-opacity=".5"/>` : `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(bw)}" height="${r2(bh)}" rx="${r2(r.kind === 'step' ? 6 : bh / 2)}" fill="${c}" stroke="currentColor" stroke-opacity=".5"/>`;
            const words = r.text.split(' '), lines = []; let cur = ''; words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (textW(t, fs * .8) > bw * (r.kind === 'question' ? .62 : .9) && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur);
            lines.slice(0, 3).forEach((l, i) => { svg += T(x + bw / 2, y + bh / 2 + (i - (Math.min(3, lines.length) - 1) / 2) * fs * .95, l, {size: fs * .8, anchor: 'middle', fill: ink}); });
            H = Math.max(H, y + bh + 8); });
        return {h: Math.max(n0(o.height), H), svg, legend: [], desc: i18n('Schéma de {n} cases.', {n: String(list.length)})};
    }
    const sampleFlow = () => ({o: {title: i18n('Retrouver un acte de naissance')}, rows: [
        ['1', 'Je connais le lieu et l’année', 'start', '', ''], ['2', 'Avant 1792 ?', 'question', '3', '4'], ['3', 'Registres paroissiaux (baptêmes)', 'step', '5', ''], ['4', 'État civil de la mairie', 'step', '5', ''],
        ['5', 'Trouvé en ligne ?', 'question', '7', '6'], ['6', 'Écrire aux archives départementales', 'step', '7', ''], ['7', 'Noter la cote et la vue', 'end', '', '']].map(([id, text, kind, yes, no]) => ({id, text: i18n(text), kind, yes, no}))});

    /* ═════════ 📍 Image annotée : une photo (maison, tombe, acte) avec des repères numérotés et leurs légendes ═════════ */
    function annotated(spec, W, fs) {
        const o = spec.o || {}, img = str(o.img, 300), list = rowsOf(spec, 'rows', 60).map((r, i) => ({x: clamp(n0(r.x), 0, 100), y: clamp(n0(r.y), 0, 100), label: str(r.label, 80), note: str(r.note, 200), n: i + 1})).filter(r => r.label);
        if (!img) return empty(W, fs, 'Choisis l’image : Données → « 🖼 Choisir l’image… ».');
        const ratio = clamp(n0(o.ratio) || .66, .2, 3), side = o.list === 'side' && W > 600, iw = side ? W * .62 : W, ih = iw * ratio, cM = color(o.markColor, '#e15759'), mr = clamp(n0(o.markSize) || fs * .95, 6, 40);
        let svg = `<image href="media/${esc(encodeURIComponent(img))}" x="0" y="0" width="${r2(iw)}" height="${r2(ih)}" preserveAspectRatio="xMidYMid ${o.fit === 'cover' ? 'slice' : 'meet'}"/>`;
        list.forEach(r => { const x = iw * r.x / 100, y = ih * r.y / 100; svg += `<g>${tip(`${r.n}. ${r.label}${r.note ? ' — ' + r.note : ''}`)}<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(mr)}" fill="${cM}" stroke="#ffffff" stroke-width="2"/>${T(x, y, String(r.n), {size: mr, anchor: 'middle', weight: 700, fill: contrast(cM)})}</g>`; });
        let y = side ? fs : ih + fs * 1.4; const lx = side ? iw + fs : 4, lw = side ? W - iw - fs * 1.5 : W - 8;
        list.forEach(r => { svg += `<circle cx="${r2(lx + mr * .8)}" cy="${r2(y)}" r="${r2(mr * .8)}" fill="${cM}"/>` + T(lx + mr * .8, y, String(r.n), {size: mr * .8, anchor: 'middle', weight: 700, fill: contrast(cM)}) + T(lx + mr * 2.2, y, cut(r.label + (r.note && o.notes !== false ? ' — ' + r.note : ''), lw - mr * 2.4, fs * .82), {size: fs * .82}); y += fs * 1.6; });
        return {h: Math.max(n0(o.height), side ? Math.max(ih, y) : y), svg, legend: [], desc: i18n('Image annotée : {n} repères.', {n: String(list.length)})};
    }
    const sampleAnnot = () => ({o: {title: i18n('La maison des MAZAUD à Aurillac (photo de 1910)'), img: '', ratio: .66}, rows: [[30, 40, 'La porte d’entrée', 'refaite en 1902'], [62, 30, 'La chambre de Jean', ''], [80, 70, 'Le four à pain', 'encore là en 1950']].map(([x, y, label, note]) => ({x, y, label: i18n(label), note: i18n(note)}))});
    const annotApp = {
        html: spec => `<div class="h-dg-app dmo-app"><h4>🖼 ${esc(i18n('L’image à annoter'))}</h4><p class="muted">${esc(spec.o?.img ? i18n('Image : {f}', {f: spec.o.img}) : i18n('Aucune image pour l’instant.'))}</p><button type="button" class="button small" data-dgm-img>🖼 ${esc(i18n('Choisir l’image…'))}</button>
            <p class="muted">${esc(i18n('Un repère : sa place en % (x = depuis la gauche, y = depuis le haut). Astuce : clique sur l’image dans l’aperçu pour lire la place.'))}</p></div>`,
        bind: (pane, io) => { pane.querySelector('[data-dgm-img]')?.addEventListener('click', async () => {
            const P = window.LCNDA_MEDIA_PICKER || window.LCNDA_PICKER; const it = await P?.openMediaPicker?.({types: ['image']}); if (!it?.filename) return;
            const s = io.spec(); s.o = {...(s.o || {}), img: it.filename}; const im = new Image(); im.onload = () => { s.o.ratio = Math.round(im.naturalHeight / im.naturalWidth * 1000) / 1000; io.apply(s); }; im.onerror = () => io.apply(s); im.src = `media/${encodeURIComponent(it.filename)}`; }); },
    };

    /* ═════════ 🗓 Emploi du temps : des jours en colonnes, les heures en lignes ═════════ */
    const hm = v => { const m = String(v ?? '').match(/(\d{1,2})(?:\s*[h:]\s*(\d{1,2}))?/); return m ? clamp(+m[1] + (+m[2] || 0) / 60, 0, 24) : NaN; };
    function timetable(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 300).map(r => ({day: str(r.day, 30), a: hm(r.start), b: hm(r.end), label: str(r.label, 80), g: str(r.group, 40)})).filter(r => r.day && Number.isFinite(r.a) && Number.isFinite(r.b) && r.b > r.a);
        if (!list.length) return empty(W, fs, 'Une ligne par moment : le jour, le début et la fin (8 h, 12:30), ce qu’on fait, un groupe (couleur).');
        const days = [...new Set(list.map(r => r.day))], groups = [...new Set(list.map(r => r.g))];
        const h0 = Number.isFinite(hm(o.from)) ? hm(o.from) : Math.floor(Math.min(...list.map(r => r.a))), h1 = Number.isFinite(hm(o.to)) ? hm(o.to) : Math.ceil(Math.max(...list.map(r => r.b)));
        const H = clamp(n0(o.height) || (h1 - h0) * fs * 2.6 + fs * 2, 160, 1600), x0 = fs * 3, top = fs * 1.6, cw = (W - x0 - 4) / days.length, Y = h => top + (h - h0) / ((h1 - h0) || 1) * (H - top - 6);
        const colOf = g => color(o['c_' + g], pick(spec, groups.indexOf(g)));
        let svg = '';
        for (let h = Math.ceil(h0); h <= h1; h++) svg += `<line x1="${r2(x0)}" y1="${r2(Y(h))}" x2="${r2(W - 4)}" y2="${r2(Y(h))}" stroke="currentColor" stroke-opacity=".1"/>` + T(x0 - 4, Y(h), `${h} h`, {size: fs * .72, anchor: 'end', op: .7});
        days.forEach((d, i) => { svg += T(x0 + cw * i + cw / 2, fs * .8, cut(d, cw - 4, fs * .85), {size: fs * .85, anchor: 'middle', weight: 700}) + (i ? `<line x1="${r2(x0 + cw * i)}" y1="${r2(top)}" x2="${r2(x0 + cw * i)}" y2="${r2(H - 6)}" stroke="currentColor" stroke-opacity=".12"/>` : ''); });
        list.forEach(r => { const i = days.indexOf(r.day), x = x0 + cw * i + 2, y = Y(r.a), h = Math.max(4, Y(r.b) - Y(r.a)), c = colOf(r.g), lab = `${r.label}`;
            svg += `<rect x="${r2(x)}" y="${r2(y + 1)}" width="${r2(cw - 4)}" height="${r2(h - 2)}" rx="4" fill="${c}">${tip(`${r.day} · ${r.label} · ${fmt(r.a)} h → ${fmt(r.b)} h`)}</rect>`;
            if (h > fs * 1.1) svg += T(x + 4, y + Math.min(h / 2, fs * .9), cut(lab, cw - 10, fs * .78), {size: fs * .78, fill: contrast(c), weight: 600}); });
        return {h: H, svg, legend: groups.filter(Boolean).map(g => ({label: g, color: colOf(g)})), desc: i18n('Emploi du temps : {n} moments sur {d} jours.', {n: String(list.length), d: String(days.length)})};
    }
    const sampleTimetable = () => ({o: {title: i18n('Une journée à la ferme des MAZAUD, été 1900')}, rows: [
        ['Le père', '5h', '7h', 'Traire les vaches', 'Bêtes'], ['Le père', '7h', '12h', 'Faucher le pré', 'Champs'], ['Le père', '14h', '19h', 'Rentrer le foin', 'Champs'], ['La mère', '5h', '6h30', 'Feu et soupe', 'Maison'],
        ['La mère', '7h', '11h', 'Lessive au lavoir', 'Maison'], ['La mère', '11h', '12h', 'Repas', 'Maison'], ['La mère', '14h', '18h', 'Jardin et volailles', 'Bêtes'], ['Les enfants', '8h', '11h30', 'École', 'École'], ['Les enfants', '13h30', '16h', 'École', 'École'], ['Les enfants', '17h', '19h', 'Garder les vaches', 'Bêtes']]
        .map(([day, start, end, label, group]) => ({day: i18n(day), start, end, label: i18n(label), group: i18n(group)}))});

    /* ═════════ Prendre dans ma base (api anim_people) ═════════ */
    let base = null;
    const loadBase = async () => (base ||= A().api('anim_people').then(d => ({...d, byId: new Map((d.people || []).map(p => [p.id, p]))})).catch(e => { base = null; throw e; }));
    const ROMAN = n => [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]].reduce((s, [r, v]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
    const century = y => (Number.isFinite(y) ? i18n('{c}e siècle', {c: ROMAN(Math.floor((y - 1) / 100) + 1)}) : '');
    const placeName = (D, id) => (id && D.places[id] ? D.places[id][0] : '');
    const ageClass = p => { if (!Number.isFinite(p.by) || !Number.isFinite(p.dy)) return ''; const a = p.dy - p.by; return a < 1 ? i18n('Avant 1 an') : a < 20 ? i18n('1 à 19 ans') : a < 40 ? i18n('20 à 39 ans') : a < 60 ? i18n('40 à 59 ans') : a < 80 ? i18n('60 à 79 ans') : i18n('80 ans et plus'); };
    /** les « axes » qu'on peut prendre dans la base (ensembles parallèles, points, aires) */
    const DIMS = {bplace: ['Lieu de naissance', (D, p) => placeName(D, p.bp)], dplace: ['Lieu de décès', (D, p) => placeName(D, p.dp)], surname: ['Nom de famille', (D, p) => String(p.l || '').trim().toUpperCase()],
        first: ['Prénom', (D, p) => String(p.f || '').split(/[\s-]+/)[0]], sex: ['Sexe', (D, p) => (p.g === 'm' ? i18n('Homme') : p.g === 'f' ? i18n('Femme') : '')], century: ['Siècle de naissance', (D, p) => century(p.by)],
        decade: ['Décennie de naissance', (D, p) => (Number.isFinite(p.by) ? String(Math.floor(p.by / 10) * 10) : '')], occ: ['Métier', (D, p) => String(p.occ || '')], age: ['Âge au décès', (D, p) => ageClass(p)],
        moved: ['Mort au même lieu ?', (D, p) => (p.bp && p.dp ? (p.bp === p.dp ? i18n('Même lieu') : i18n('Ailleurs')) : '')]};
    const dimSel = (k, def) => `<select data-dgm="${k}">${['', ...Object.keys(DIMS)].map(d => `<option value="${d}" ${d === def ? 'selected' : ''}>${esc(d ? i18n(DIMS[d][0]) : i18n('— aucun —'))}</option>`).join('')}</select>`;
    const sel = (k, opts, def = '') => `<select data-dgm="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(def) ? 'selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select>`;
    const val = (pane, k) => pane.querySelector(`[data-dgm="${k}"]`)?.value || '';
    const appBox = (title, intro, inner) => `<div class="h-dg-app dmo-app"><h4>${esc(i18n(title))}</h4><p class="muted">${esc(i18n(intro))}</p>${inner}<label>${esc(i18n('Au plus'))} <input type="number" data-dgm="top" value="12" min="2" max="60"></label><button type="button" class="button small" data-dgm-go>${esc(i18n('Prendre dans ma base'))}</button><p class="muted" data-dgm-msg aria-live="polite"></p></div>`;
    const bind = run => (pane, io) => {
        const btn = pane.querySelector('[data-dgm-go]'), msg = pane.querySelector('[data-dgm-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.textContent = i18n('Lecture de ta généalogie…');
            try { const D = await loadBase(); const s = io.spec(); const t = run(D, pane, s); io.apply(s); A().toast?.(t || i18n('Données prises dans ta base.')); if (msg?.isConnected) msg.textContent = ''; } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } });
    };
    const topN = (pane, d = 12) => clamp(Math.round(n0(val(pane, 'top')) || d), 2, 60);
    const people = D => (D.people || []);
    const topKeys = (arr, n) => { const m = new Map(); arr.forEach(k => { if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); };
    const othersOf = (keys, k) => (keys.has(k) ? k : k ? i18n('Autres') : '');
    const FROM = {
        parsets: {html: () => appBox('🔀 Des parcours de ma base', 'Chaque personne passe d’une catégorie à l’autre. Choisis 2 ou 3 axes ; les plus fréquents gardent leur nom, les autres sont regroupés.', `<label>${esc(i18n('1er axe'))}${dimSel('a', 'bplace')}</label><label>${esc(i18n('2e axe'))}${dimSel('b', 'occ')}</label><label>${esc(i18n('3e axe'))}${dimSel('c', 'dplace')}</label>`),
            bind: bind((D, pane, s) => { const ax = ['a', 'b', 'c'].map(k => val(pane, k)).filter(Boolean); if (ax.length < 2) throw new Error(i18n('Choisis au moins deux axes.')); const n = topN(pane, 8);
                const unk = i18n('Inconnu'), vals = people(D).map(p => ax.map(a => DIMS[a][1](D, p))).filter(v => v.some(Boolean)).map(v => v.map(x => x || unk)); if (!vals.length) throw new Error(i18n('Aucune personne n’a ces renseignements.')); // un renseignement qui manque : « Inconnu » (la personne reste)
                const keep = ax.map((_, i) => new Set(topKeys(vals.map(v => v[i]), n).map(x => x[0]))), m = new Map();
                vals.forEach(v => { const k = v.map((x, i) => othersOf(keep[i], x)).join('\u0001'); m.set(k, (m.get(k) || 0) + 1); });
                s.rows = [...m.entries()].map(([k, value]) => { const [a, b, c] = k.split('\u0001'); return {a, b, c: c || '', value}; }); s.o = {...(s.o || {}), axisA: i18n(DIMS[ax[0]][0]), axisB: i18n(DIMS[ax[1]][0]), axisC: ax[2] ? i18n(DIMS[ax[2]][0]) : ''};
                return i18n('{n} personnes prises dans ta base.', {n: String(vals.length)}); })},
        uncertain: {html: () => appBox('⏳ Les dates approchées de ma base', 'Les naissances et décès écrits « vers », « avant », « après », « entre » (et les dates sûres, si tu veux).', `<label>${esc(i18n('Montrer'))}${sel('what', [['fuzzy', 'Seulement les dates approchées'], ['all', 'Toutes les dates']], 'fuzzy')}</label>`),
            bind: bind((D, pane, s) => { const fz = val(pane, 'what') !== 'all', n = topN(pane, 30), rows = [];
                people(D).forEach(p => { const nm = [p.f, String(p.l || '').toUpperCase()].filter(Boolean).join(' '); [['bt', 'naissance'], ['dt', 'décès']].forEach(([k, w]) => { const t = p[k]; if (!t) return; const f = fuzzy(t); if (f && (!fz || f.kind !== 'sure')) rows.push({label: `${nm}, ${i18n(w)}`, date: t, end: '', note: ''}); }); });
                if (!rows.length) throw new Error(i18n('Aucune date approchée dans ta base.')); s.rows = rows.slice(0, n); s.o = {...(s.o || {}), sort: 'date'}; return i18n('{n} dates prises dans ta base.', {n: String(s.rows.length)}); })},
        lifespans: {html: () => appBox('📏 Des vies de ma base', 'Une barre par personne, de sa naissance à son décès.', `<label>${esc(i18n('Couleur selon'))}${dimSel('g', 'surname')}</label><label>${esc(i18n('Un seul nom de famille (facultatif)'))}<input data-dgm="sur" maxlength="60"></label>`),
            bind: bind((D, pane, s) => { const g = val(pane, 'g'), sur = val(pane, 'sur').trim().toUpperCase(), n = topN(pane, 40);
                const list = people(D).filter(p => Number.isFinite(p.by) && (!sur || String(p.l || '').toUpperCase() === sur)).sort((a, b) => a.by - b.by).slice(0, n); if (!list.length) throw new Error(i18n('Aucune personne avec une année de naissance.'));
                s.rows = list.map(p => ({name: [p.f, String(p.l || '').toUpperCase()].filter(Boolean).join(' '), from: p.by, to: Number.isFinite(p.dy) ? p.dy : '', group: g ? DIMS[g][1](D, p) : ''})); s.o = {...(s.o || {}), sort: 'birth'}; return i18n('{n} vies prises dans ta base.', {n: String(list.length)}); })},
        density: {html: () => appBox('〰️ Des âges de ma base', 'Une valeur par personne (âge au décès), une courbe par groupe.', `<label>${esc(i18n('Groupes'))}${dimSel('g', 'century')}</label>`),
            bind: bind((D, pane, s) => { const g = val(pane, 'g'), keep = new Set(topKeys(people(D).map(p => (g ? DIMS[g][1](D, p) : '·')), topN(pane, 4)).map(x => x[0]));
                const rows = people(D).filter(p => Number.isFinite(p.by) && Number.isFinite(p.dy) && p.dy >= p.by).map(p => ({group: g ? DIMS[g][1](D, p) : i18n('Tous'), value: p.dy - p.by})).filter(r => !g || keep.has(r.group)); if (rows.length < 3) throw new Error(i18n('Pas assez de personnes avec les deux dates.'));
                s.rows = rows; s.o = {...(s.o || {}), xLabel: i18n('Âge au décès (ans)'), min: 0}; return i18n('{n} âges pris dans ta base.', {n: String(rows.length)}); })},
        stemleaf: {html: () => appBox('🌿 Des âges de ma base', 'L’âge au décès de chaque personne ; deux groupes (hommes et femmes) dos à dos si tu veux.', `<label>${esc(i18n('Dos à dos'))}${sel('two', [['sex', 'Hommes et femmes'], ['', 'Non']], 'sex')}</label>`),
            bind: bind((D, pane, s) => { const two = val(pane, 'two') === 'sex', rows = people(D).filter(p => Number.isFinite(p.by) && Number.isFinite(p.dy) && p.dy >= p.by && (!two || p.g === 'm' || p.g === 'f')).map(p => ({group: two ? DIMS.sex[1](D, p) : '', value: p.dy - p.by}));
                if (!rows.length) throw new Error(i18n('Pas assez de personnes avec les deux dates.')); s.rows = rows.slice(0, 600); s.o = {...(s.o || {}), unit: 10}; return i18n('{n} âges pris dans ta base.', {n: String(s.rows.length)}); })},
        tally: {html: () => appBox('✋ Compter dans ma base', 'Les naissances par décennie, ou par prénom, ou par village.', `<label>${esc(i18n('Compter'))}${dimSel('k', 'decade')}</label>`),
            bind: bind((D, pane, s) => { const k = val(pane, 'k') || 'decade', list = topKeys(people(D).map(p => DIMS[k][1](D, p)), topN(pane, 12)); if (!list.length) throw new Error(i18n('Rien à compter.'));
                if (k === 'decade') list.sort((a, b) => a[0] - b[0]); s.rows = list.map(([label, value]) => ({label, value})); return i18n('{n} lignes prises dans ta base.', {n: String(list.length)}); })},
        chordlines: {html: () => appBox('🕸 Les mariages de ma base', 'Qui s’est marié avec qui : entre noms de famille, ou entre lieux de naissance des époux.', `<label>${esc(i18n('Entre'))}${sel('by', [['surname', 'Noms de famille'], ['bplace', 'Lieux de naissance']], 'surname')}</label>`),
            bind: bind((D, pane, s) => { const by = val(pane, 'by') || 'surname', m = new Map();
                (D.couples || []).forEach(([a, b]) => { const pa = D.byId.get(a), pb = D.byId.get(b); if (!pa || !pb) return; const x = DIMS[by][1](D, pa), y = DIMS[by][1](D, pb); if (!x || !y) return; const k = [x, y].sort().join('\u0001'); m.set(k, (m.get(k) || 0) + 1); });
                if (!m.size) throw new Error(i18n('Aucun mariage avec ces renseignements.')); s.rows = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, topN(pane, 40) * 3).map(([k, value]) => { const [from, to] = k.split('\u0001'); return {from, to, value}; }); s.o = {...(s.o || {}), top: topN(pane, 40)}; return i18n('{n} liens pris dans ta base.', {n: String(s.rows.length)}); })},
        unitdots: {html: () => appBox('⚫ Des personnes de ma base', 'Un point par personne : en colonnes (par décennie, par siècle…), coloré (par sexe, par nom…).', `<label>${esc(i18n('Colonnes'))}${dimSel('c', 'decade')}</label><label>${esc(i18n('Couleur'))}${dimSel('g', 'sex')}</label>`),
            bind: bind((D, pane, s) => { const c = val(pane, 'c') || 'decade', g = val(pane, 'g'), cols = new Set(topKeys(people(D).map(p => DIMS[c][1](D, p)), topN(pane, 12)).map(x => x[0])), gk = new Set(g ? topKeys(people(D).map(p => DIMS[g][1](D, p)), 6).map(x => x[0]) : []), m = new Map();
                people(D).forEach(p => { const col = DIMS[c][1](D, p); if (!cols.has(col)) return; const gr = g ? othersOf(gk, DIMS[g][1](D, p)) || i18n('Inconnu') : '·'; const k = col + '\u0001' + gr; m.set(k, (m.get(k) || 0) + 1); });
                if (!m.size) throw new Error(i18n('Aucune personne avec ces renseignements.')); s.rows = [...m.entries()].map(([k, value]) => { const [column, group] = k.split('\u0001'); return {column, group, value}; }).sort((a, b) => String(a.column).localeCompare(String(b.column), 'fr', {numeric: true})); return i18n('{n} personnes prises dans ta base.', {n: String([...m.values()].reduce((a, b) => a + b, 0))}); })},
        proparea: {html: () => appBox('◻️ Compter dans ma base', 'Les plus fréquents : villages de naissance, noms, prénoms, métiers.', `<label>${esc(i18n('Compter'))}${dimSel('k', 'bplace')}</label>`),
            bind: bind((D, pane, s) => { const k = val(pane, 'k') || 'bplace', list = topKeys(people(D).map(p => DIMS[k][1](D, p)), topN(pane, 12)); if (!list.length) throw new Error(i18n('Rien à compter.')); s.rows = list.map(([label, value]) => ({label, value})); return i18n('{n} lignes prises dans ta base.', {n: String(list.length)}); })},
        radialcol: {html: () => appBox('🌞 Les mois de ma base', 'Le mois des naissances (ou des décès) écrit dans les dates.', `<label>${esc(i18n('Quoi'))}${sel('what', [['bt', 'Naissances'], ['dt', 'Décès']], 'bt')}</label>`),
            bind: bind((D, pane, s) => { const w = val(pane, 'what') || 'bt', cnt = new Array(12).fill(0); let n = 0;
                const MN = [['janv', 'jan'], ['fev', 'feb', 'févr'], ['mars', 'mar'], ['avr', 'apr'], ['mai', 'may'], ['juin', 'jun'], ['juil', 'jul'], ['aout', 'aug', 'août'], ['sept', 'sep'], ['oct'], ['nov'], ['dec', 'déc']];
                people(D).forEach(p => { const t = String(p[w] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (!t) return; let m = t.match(/^\d{4}-(\d{1,2})/) || t.match(/\b\d{1,2}[/.-](\d{1,2})[/.-]\d{4}/); let k = m ? +m[1] - 1 : MN.findIndex(a => a.some(x => new RegExp('\\b' + x).test(t))); if (k >= 0 && k < 12) { cnt[k]++; n++; } });
                if (!n) throw new Error(i18n('Aucune date avec un mois.')); s.rows = cnt.map((value, i) => ({label: i18n(MONTHS[i]), value})); s.o = {...(s.o || {}), center: w === 'bt' ? i18n('Naissances') : i18n('Décès')}; return i18n('{n} dates prises dans ta base.', {n: String(n)}); })},
        stackarea: {html: () => appBox('⛰ Les naissances de ma base', 'Par décennie, une couleur par nom de famille (ou par sexe, par lieu…).', `<label>${esc(i18n('Séries'))}${dimSel('g', 'surname')}</label>`),
            bind: bind((D, pane, s) => { const g = val(pane, 'g') || 'surname', keep = new Set(topKeys(people(D).map(p => DIMS[g][1](D, p)), Math.min(topN(pane, 6), 12)).map(x => x[0])), m = new Map();
                people(D).forEach(p => { if (!Number.isFinite(p.by)) return; const k = DIMS[g][1](D, p); const se = othersOf(keep, k) || i18n('Inconnu'), x = Math.floor(p.by / 10) * 10; m.set(x + '\u0001' + se, (m.get(x + '\u0001' + se) || 0) + 1); });
                if (!m.size) throw new Error(i18n('Aucune naissance datée.')); s.rows = [...m.entries()].map(([k, value]) => { const [x, series] = k.split('\u0001'); return {x: Number(x), series, value}; }).sort((a, b) => a.x - b.x); return i18n('{n} naissances prises dans ta base.', {n: String([...m.values()].reduce((a, b) => a + b, 0))}); })},
        annotated: annotApp,
    };

    /* ═════════ Les sortes : tableaux, réglages ═════════ */
    const COLOR_BY = (choices, def) => C('colorBy', 'Couleur', 'select', {choices, def});
    const KINDS = {
        parsets: {icon: '🔀', label: 'Ensembles parallèles (parcours : origine → métier → lieu)', group: 'Liens', render: parsets, legend: 'bottom', help: 'Chaque personne passe d’une catégorie à l’autre : les bandes montrent combien vont d’où à où.',
            grids: [{key: 'rows', label: 'Les groupes de personnes', cols: [C('a', '1er axe'), C('b', '2e axe'), C('c', '3e axe (facultatif)'), C('value', 'Combien', 'number')]}],
            options: [C('axisA', 'Nom du 1er axe'), C('axisB', 'Nom du 2e axe'), C('axisC', 'Nom du 3e axe'), C('colorBy', 'Couleur des bandes selon', 'select', {choices: [['a', 'Le 1er axe'], ['b', 'Le 2e axe'], ['c', 'Le 3e axe']], def: 'a'}), PALETTE,
                C('sort', 'Ordre des catégories', 'select', {choices: [['', 'Du plus grand au plus petit'], ['alpha', 'Alphabétique']]}), C('opacity', 'Opacité des bandes', 'range', {unit: '%', min: 10, max: 100, def: 55}), C('gap', 'Écart entre catégories', 'range', {unit: 'px', min: 0, max: 30, def: 6}), C('barWidth', 'Largeur des colonnes', 'range', {unit: 'px', min: 4, max: 40, def: 12}), C('values', 'Écrire les chiffres', 'check', {def: true}), H_OPT],
            sample: sampleParsets},
        uncertain: {icon: '⏳', label: 'Dates incertaines (avec leur marge : vers, avant, entre…)', group: 'Frises', render: uncertain, legend: 'bottom', help: 'Les dates comme elles sont écrites : « vers 1750 » devient une marge, « avant 1802 » une flèche vers le passé.',
            grids: [{key: 'rows', label: 'Les faits', cols: [C('label', 'Fait'), C('date', 'Date (comme écrite)'), C('end', 'Fin (facultatif)'), C('note', 'Note')]}],
            options: [C('style', 'Dessin de la marge', 'select', {choices: [['bar', 'Barre pâle'], ['fade', 'Flou (de plus en plus clair)'], ['whisker', 'Trait avec des bords']], def: 'bar'}), C('margin', 'Marge de « vers »', 'range', {unit: 'ans', min: 1, max: 30, def: 5}), C('span', 'Portée de « avant » / « après »', 'range', {unit: 'ans', min: 1, max: 100, def: 20}),
                C('sureColor', 'Couleur des dates sûres', 'color', {def: '#2f6db5'}), C('fuzzyColor', 'Couleur des dates approchées', 'color', {def: '#e15759'}), C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['date', 'Par date']]}), C('labels', 'Écrire la date telle quelle', 'check', {def: true}), C('stripes', 'Une ligne sur deux grisée', 'check', {def: true}), C('rowHeight', 'Hauteur d’une ligne', 'range', {unit: 'px', min: 12, max: 60, def: 24}), H_OPT],
            sample: sampleUncertain},
        lifespans: {icon: '📏', label: 'Barres de durée de vie (une barre par vie)', group: 'Frises', render: lifespans, legend: 'bottom', help: 'Une barre de la naissance au décès ; les vies en cours ou inconnues en pointillé.',
            grids: [{key: 'rows', label: 'Les personnes', cols: [C('name', 'Nom'), C('from', 'Naissance (année)'), C('to', 'Décès (année, vide : inconnue)'), C('group', 'Groupe (couleur)')]}],
            options: [C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['birth', 'Par naissance'], ['length', 'Les plus longues d’abord'], ['group', 'Par groupe']]}), COLOR_BY([['group', 'Une par groupe'], ['one', 'Une seule']], 'group'), C('barColor', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'}), PALETTE,
                C('openEnd', 'Sans date de décès', 'select', {choices: [['', 'Barre courte en pointillé'], ['now', 'Jusqu’à aujourd’hui']]}), C('unknownLen', 'Longueur d’une vie sans fin connue', 'range', {unit: 'ans', min: 0, max: 100, def: 0}), C('marks', 'Années à marquer (ex. 1789, 1914)'), C('ages', 'Écrire l’âge au décès', 'check', {def: true}), C('namesInside', 'Les noms dans les barres', 'check', {def: false}), C('radius', 'Coins arrondis', 'range', {unit: 'px', min: 0, max: 20, def: 3}), C('rowHeight', 'Hauteur d’une ligne', 'range', {unit: 'px', min: 8, max: 50, def: 20}), H_OPT],
            sample: sampleLifespans},
        density: {icon: '〰️', label: 'Densité (courbe lissée des valeurs)', group: 'Chiffres', render: density, legend: 'bottom', help: 'Où se concentrent les valeurs (âges au décès, au mariage…) : une courbe par groupe.',
            grids: [{key: 'rows', label: 'Les valeurs', cols: [C('group', 'Groupe'), C('value', 'Valeur', 'number')]}],
            options: [C('bandwidth', 'Lissage (vide = automatique)', 'number'), C('scale', 'Hauteur', 'select', {choices: [['', 'Proportion (courbes comparables)'], ['count', 'Nombre (les groupes nombreux plus hauts)']]}), C('min', 'De'), C('max', 'À'), C('xLabel', 'Nom de l’axe'), C('fill', 'Remplir sous les courbes', 'check', {def: true}), C('rug', 'Un trait par valeur', 'check', {def: true}), C('median', 'Ligne de la médiane', 'check', {def: true}), PALETTE, H_OPT],
            sample: sampleDensity},
        stemleaf: {icon: '🌿', label: 'Tige et feuilles (chaque valeur écrite)', group: 'Chiffres', render: stemleaf, noLegend: true, help: 'Les dizaines à gauche (la tige), les unités à droite (les feuilles) : toutes les valeurs restent lisibles.',
            grids: [{key: 'rows', label: 'Les valeurs', cols: [C('group', 'Groupe (deux : dos à dos)'), C('value', 'Valeur', 'number')]}],
            options: [C('unit', 'Tige', 'select', {choices: [['10', 'Les dizaines'], ['100', 'Les centaines'], ['1', 'Les unités (feuilles = dixièmes)']], def: '10'}), C('back', 'Deux groupes dos à dos', 'check', {def: true}), C('color1', 'Couleur du 1er groupe', 'color', {def: '#4e79a7'}), C('color2', 'Couleur du 2e groupe', 'color', {def: '#e15759'}), H_OPT],
            sample: sampleStem},
        tally: {icon: '✋', label: 'Bâtons (comptage à la main)', group: 'Chiffres', render: tally, noLegend: true, help: 'Compter comme sur un carnet de relevé : |||| barré tous les 5.',
            grids: [{key: 'rows', label: 'Ce qui est compté', cols: [C('label', 'Quoi'), C('value', 'Combien', 'number')]}],
            options: [C('style', 'Trait', 'select', {choices: [['', 'À la main (un peu tremblé)'], ['neat', 'Bien droit']]}), C('colorBy', 'Couleur', 'select', {choices: [['', 'Une seule'], ['row', 'Une par ligne']]}), C('color', 'Couleur', 'color', {def: '#1d1d1f'}), PALETTE, C('size', 'Taille des bâtons', 'range', {unit: 'px', min: 10, max: 60, def: 20}), C('stroke', 'Épaisseur', 'range', {unit: 'px', min: 1, max: 6, def: 2}), C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['desc', 'Du plus grand au plus petit']]}), C('values', 'Écrire le nombre', 'check', {def: true}), H_OPT],
            sample: sampleTally},
        chordlines: {icon: '🕸', label: 'Cordes sans rubans (liens en simples traits)', group: 'Liens', render: chordlines, noLegend: true, help: 'Des noms (ou des lieux) en cercle, et un trait pour chaque lien : plus il y en a, plus il est épais.',
            grids: [{key: 'rows', label: 'Les liens', cols: [C('from', 'De'), C('to', 'Vers'), C('value', 'Combien', 'number')]}],
            options: [C('top', 'Noms montrés au plus', 'range', {min: 3, max: 120, def: 40}), C('sort', 'Ordre autour du cercle', 'select', {choices: [['', 'Les plus liés d’abord'], ['alpha', 'Alphabétique']]}), COLOR_BY([['', 'Couleur du premier nom'], ['one', 'Une seule']], ''), C('lineColor', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'}), PALETTE, C('maxWidth', 'Épaisseur la plus grande', 'range', {unit: 'px', min: 1, max: 30, def: 8}), C('bend', 'Courbure', 'range', {unit: '%', min: 0, max: 100, def: 15}), C('opacity', 'Opacité', 'range', {unit: '%', min: 10, max: 100, def: 60}), H_OPT],
            sample: sampleChordLines},
        unitdots: {icon: '⚫', label: 'Points (un point = une personne)', group: 'Chiffres', render: unitdots, legend: 'bottom', help: 'Chaque point compte : en colonnes (par décennie, par village…) ou en grille.',
            grids: [{key: 'rows', label: 'Les paquets', cols: [C('column', 'Colonne'), C('group', 'Groupe (couleur)'), C('value', 'Combien', 'number')]}],
            options: [C('layout', 'Disposition', 'select', {choices: [['', 'En colonnes'], ['waffle', 'En grille (tous ensemble)']]}), C('per', 'Un point vaut', 'number', {def: 1}), C('perRow', 'Points par rangée (colonnes)', 'range', {min: 1, max: 30, def: 5}), C('shape', 'Forme', 'select', {choices: [['', 'Ronds'], ['square', 'Carrés']]}), C('size', 'Taille des points', 'range', {unit: 'px', min: 3, max: 40, def: 12}), PALETTE, C('values', 'Écrire le total', 'check', {def: true}), H_OPT],
            sample: sampleUnits},
        proparea: {icon: '◻️', label: 'Aire proportionnelle (carrés ou ronds)', group: 'Parts', render: proparea, noLegend: true, help: 'La surface de chaque carré dit le nombre : facile de comparer d’un coup d’œil.',
            grids: [{key: 'rows', label: 'Les lignes', cols: [C('label', 'Nom'), C('value', 'Combien', 'number')]}],
            options: [C('shape', 'Forme', 'select', {choices: [['', 'Carrés'], ['circle', 'Ronds']]}), COLOR_BY([['', 'Une par ligne'], ['one', 'Une seule']], ''), C('color', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'}), PALETTE, C('maxSize', 'Taille du plus grand', 'range', {unit: 'px', min: 30, max: 600, def: 200}), C('sort', 'Ordre', 'select', {choices: [['', 'Du plus grand au plus petit'], ['none', 'Comme dans le tableau']]}), H_OPT],
            sample: sampleProp},
        radialcol: {icon: '🌞', label: 'Colonnes en cercle (mois, heures)', group: 'Chiffres', render: radialcol, legend: 'bottom', help: 'Les 12 mois (ou les 24 heures) en colonnes autour d’un cercle : les saisons se voient tout de suite.',
            grids: [{key: 'rows', label: 'Les colonnes', cols: [C('label', 'Nom (mois, heure…)'), C('value', 'Combien', 'number'), C('group', 'Groupe (empilé, facultatif)')]}],
            options: [C('hole', 'Trou au centre', 'range', {unit: '%', min: 5, max: 70, def: 22}), C('pad', 'Écart entre colonnes', 'range', {unit: '%', min: 0, max: 60, def: 12}), C('center', 'Texte du centre'), COLOR_BY([['', 'Une par colonne'], ['one', 'Une seule']], ''), C('color', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'}), PALETTE, C('max', 'Chiffre du bord (vide = le plus grand)', 'number'), C('grid', 'Cercles de repère', 'check', {def: true}), C('values', 'Écrire les chiffres', 'check', {def: true}), H_OPT],
            sample: sampleRadialCol},
        stackarea: {icon: '⛰', label: 'Aire empilée (séries posées les unes sur les autres)', group: 'Évolution', render: stackarea, legend: 'bottom', help: 'Des séries empilées sur une ligne droite : le total et la part de chacune, au fil du temps.',
            grids: [{key: 'rows', label: 'Les points', cols: [C('x', 'Année (ou nombre)'), C('series', 'Série'), C('value', 'Valeur', 'number')]}],
            options: [C('percent', 'En pourcentages (100 % en haut)', 'check', {def: false}), C('opacity', 'Opacité', 'range', {unit: '%', min: 10, max: 100, def: 85}), C('labels', 'Noms des séries au bout', 'check', {def: true}), PALETTE, H_OPT],
            sample: sampleStack},
        flowtext: {icon: '🧭', label: 'Schéma pas à pas (écrit en liste)', group: 'Liens', render: flowtext, noLegend: true, help: 'Écris les cases en liste (étape, question oui/non, fin) : le schéma se dessine tout seul.',
            grids: [{key: 'rows', label: 'Les cases', cols: [C('id', 'N°'), C('text', 'Texte'), C('kind', 'Sorte', 'select', {choices: [['step', 'Étape'], ['question', 'Question (oui / non)'], ['start', 'Début'], ['end', 'Fin']]}), C('yes', 'Ensuite (ou si oui) : n°'), C('no', 'Si non : n°')]}],
            options: [C('stepColor', 'Couleur des étapes', 'color', {def: '#eef4ff'}), C('questionColor', 'Couleur des questions', 'color', {def: '#fff4d6'}), C('endColor', 'Couleur du début et de la fin', 'color', {def: '#e8f5e9'}), H_OPT],
            sample: sampleFlow},
        annotated: {icon: '📍', label: 'Image annotée (repères numérotés)', group: 'Images', render: annotated, noLegend: true, help: 'Une photo (maison, tombe, acte) avec des repères numérotés et leur légende.',
            grids: [{key: 'rows', label: 'Les repères', cols: [C('x', 'x (% depuis la gauche)', 'number', {unit: '%'}), C('y', 'y (% depuis le haut)', 'number', {unit: '%'}), C('label', 'Nom'), C('note', 'Note')]}],
            options: [C('list', 'La liste des repères', 'select', {choices: [['', 'Sous l’image'], ['side', 'À côté de l’image']]}), C('markColor', 'Couleur des repères', 'color', {def: '#e15759'}), C('markSize', 'Taille des repères', 'range', {unit: 'px', min: 6, max: 40, def: 14}), C('fit', 'Image', 'select', {choices: [['', 'Entière'], ['cover', 'Remplir (bords coupés)']]}), C('notes', 'Écrire les notes', 'check', {def: true}), H_OPT],
            sample: sampleAnnot},
        timetable: {icon: '🗓', label: 'Emploi du temps (une journée, une semaine)', group: 'Frises', render: timetable, legend: 'bottom', help: 'Les jours (ou les personnes) en colonnes, les heures de haut en bas : une journée à la ferme, une semaine d’école.',
            grids: [{key: 'rows', label: 'Les moments', cols: [C('day', 'Jour (ou personne)'), C('start', 'Début (8h, 12:30)'), C('end', 'Fin'), C('label', 'Quoi'), C('group', 'Groupe (couleur)')]}],
            options: [C('from', 'Première heure (vide : la plus tôt)'), C('to', 'Dernière heure'), PALETTE, H_OPT],
            sample: sampleTimetable},
    };
    for (const [k, kind] of Object.entries(KINDS)) { if (FROM[k]) kind.fromApp = FROM[k]; if (!R.KINDS[k]) R.KINDS[k] = kind; }
    ext.diagramManquants = {KINDS: Object.keys(KINDS), fuzzy, kde, DIMS, loadBase, reset: () => { base = null; }};
})();
