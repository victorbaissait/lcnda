/* LCNDA — 📊 Six diagrammes de plus (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  ⏳ sablier (ascendants au-dessus, descendants au-dessous d'une personne) · 📅 diagramme de Gantt (tâches de recherche, chantiers)
 *  🧠 carte mentale (une idée au centre, ses branches) · 🎯 barres en cercle (classement radial) · 🫧 bulles groupées (noms, métiers, lieux)
 *  ⭕ anneaux d'avancement (une branche, un objectif : où on en est).
 * Chaque sorte : {icon, label, group, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample}.
 * Tout texte passe par esc() ; couleurs vérifiées (R.color) ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => { const n = typeof v === 'number' ? v : R.num ? R.num(v) : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    const color = (c, d) => R.color(c, d);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}), fmt = n => NF.format(Number(n) || 0);
    const TAU = Math.PI * 2;
    const pal = spec => R.PALETTES?.[spec.o?.palette] || R.PALETTES?.vive || ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
    const pick = (spec, i, c) => color(c, pal(spec)[((i % pal(spec).length) + pal(spec).length) % pal(spec).length]);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', baseline = 'middle', op = 0} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${esc(fill)}"${op ? ` fill-opacity="${op}"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const rowsOf = (spec, key = 'rows', max = 2000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, max);
    const str = (v, n = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888888'}), legend: [], desc: msg});
    const H_OPT = C('height', 'Hauteur du dessin (0 = automatique)', 'range', {unit: 'px', min: 0, max: 1600, step: 10, def: 0});
    const P = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const arc = (cx, cy, r0, r1, a0, a1) => { if (a1 - a0 > Math.PI * 1.98) { const m = (a0 + a1) / 2; return arc1(cx, cy, r0, r1, a0, m) + arc1(cx, cy, r0, r1, m, a1); } return arc1(cx, cy, r0, r1, a0, a1); };
    const arc1 = (cx, cy, r0, r1, a0, a1) => { const big = a1 - a0 > Math.PI ? 1 : 0, [x0, y0] = P(cx, cy, r1, a0), [x1, y1] = P(cx, cy, r1, a1), [x2, y2] = P(cx, cy, r0, a1), [x3, y3] = P(cx, cy, r0, a0);
        return `M${r2(x0)} ${r2(y0)}A${r2(r1)} ${r2(r1)} 0 ${big} 1 ${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}A${r2(r0)} ${r2(r0)} 0 ${big} 0 ${r2(x3)} ${r2(y3)}Z`; };
    /** une année (« 1890 », « vers 1890 », « 1890-05-03 ») ou une date ISO → nombre d'années (décimal) */
    const yearOf = v => { const s = str(v, 40); let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/); if (m) return +m[1] + (+m[2] - 1) / 12 + ((+m[3] || 1) - 1) / 365; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return +m[3] + (+m[2] - 1) / 12 + (+m[1] - 1) / 365; m = s.match(/-?\d{1,4}/); return m ? +m[0] : null; };

    /* ═════════ ⏳ Sablier : ascendants (générations −1, −2…) au-dessus, descendants (+1, +2…) au-dessous ═════════ */
    function hourglass(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 600).map(r => ({name: str(r.name, 80), gen: Math.round(clamp(num(r.gen), -8, 8)), dates: str(r.dates, 40), note: str(r.note, 120)})).filter(r => r.name);
        if (!list.some(r => r.gen === 0)) return empty(W, fs, 'Ajoute la personne du milieu (génération 0), puis ses ascendants (−1, −2…) et ses descendants (1, 2…).');
        const gens = [...new Set(list.map(r => r.gen))].sort((a, b) => a - b), rowH = clamp(num(o.rowHeight) || fs * 3.4, fs * 2.2, 140), gap = clamp(num(o.gap) || fs * 1.6, 6, 100);
        const top = clamp(num(o.top), 0, 40) || 4, cUp = color(o.upColor, '#4e79a7'), cDown = color(o.downColor, '#59a14f'), cMid = color(o.midColor, '#e15759');
        let svg = '', y = top; const pos = new Map(), lw = o.genLabels !== false && W > 420 ? fs * 6.2 : 0, AW = W - lw; // la place des noms de générations, à gauche
        gens.forEach(g => {
            const row = list.filter(r => r.gen === g), n = row.length, bw = Math.min(AW * .4, Math.max(fs * 4, (AW - 8) / n - 6)), total = n * bw + (n - 1) * 6, x0 = lw + (AW - total) / 2;
            row.forEach((r, i) => { const x = x0 + i * (bw + 6), c = g < 0 ? cUp : g > 0 ? cDown : cMid, ink = contrast(c);
                svg += `<g>${tip(`${r.name}${r.dates ? ' · ' + r.dates : ''}${r.note ? ' — ' + r.note : ''}`)}<rect x="${r2(x)}" y="${r2(y)}" width="${r2(bw)}" height="${r2(rowH)}" rx="${r2(clamp(num(o.radius ?? 6), 0, 30))}" fill="${c}" fill-opacity="${g === 0 ? 1 : .88}"/>`
                    + T(x + bw / 2, y + rowH * (r.dates && rowH > fs * 2.6 ? .38 : .5), cut(r.name, bw - 8, fs * (g === 0 ? 1 : .9)), {size: fs * (g === 0 ? 1 : .9), anchor: 'middle', weight: g === 0 ? 700 : 600, fill: ink})
                    + (r.dates && rowH > fs * 2.6 ? T(x + bw / 2, y + rowH * .72, cut(r.dates, bw - 8, fs * .75), {size: fs * .75, anchor: 'middle', fill: ink, op: .85}) : '') + '</g>';
                pos.set(r, [x + bw / 2, y]); });
            if (lw) svg += T(4, y + rowH / 2, g === 0 ? '' : g < 0 ? `${-g === 1 ? 'Parents' : -g === 2 ? 'Grands-parents' : `Gén. ${g}`}` : `${g === 1 ? 'Enfants' : g === 2 ? 'Petits-enfants' : `Gén. +${g}`}`, {size: fs * .7, op: .6});
            y += rowH + gap;
        });
        if (o.links !== false) { const mid = list.find(r => r.gen === 0), [mx, my] = pos.get(mid); let lines = '';
            list.filter(r => r.gen !== 0).forEach(r => { const [x, yy] = pos.get(r); const fromY = r.gen < 0 ? yy + rowH : yy; const toY = r.gen < 0 ? my : my + rowH; lines += `<path d="M${r2(x)} ${r2(fromY)}C${r2(x)} ${r2((fromY + toY) / 2)} ${r2(mx)} ${r2((fromY + toY) / 2)} ${r2(mx)} ${r2(toY)}" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1.2"/>`; });
            svg = lines + svg; }
        const up = list.filter(r => r.gen < 0).length, down = list.filter(r => r.gen > 0).length;
        return {h: Math.max(num(o.height) || 0, y - gap + 4), svg, legend: [{label: 'Ascendants', color: cUp}, {label: 'La personne', color: cMid}, {label: 'Descendants', color: cDown}], desc: `Sablier : ${up} ascendant${up > 1 ? 's' : ''} au-dessus, ${down} descendant${down > 1 ? 's' : ''} au-dessous.`};
    }
    const sampleHour = () => ({o: {title: 'Le sablier de Joseph Borie'}, rows: [
        ['Antoine Borie', -2, '1820-1881'], ['Marie Lacoste', -2, '1824-1890'], ['Pierre Faure', -2, '1818-1870'], ['Jeanne Roux', -2, '1822-1899'],
        ['Jean Borie', -1, '1851-1919'], ['Louise Faure', -1, '1855-1932'], ['Joseph Borie', 0, '1890-1964'],
        ['Odette Borie', 1, '1921-2010'], ['Henri Borie', 1, '1924-1944'], ['René Borie', 1, '1927-1999'], ['Claire', 2, '1950'], ['Paul', 2, '1953'], ['Anne', 2, '1956'], ['Luc', 2, '1958'], ['Marc', 2, '1961']].map(([name, gen, dates]) => ({name, gen, dates}))});

    /* ═════════ 📅 Gantt : une ligne par tâche, de son début à sa fin, avec son avancement ═════════ */
    function gantt(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 300).map(r => ({task: str(r.task, 80), group: str(r.group, 40), a: yearOf(r.start), b: yearOf(r.end), pct: clamp(num(r.done), 0, 100)})).filter(r => r.task && r.a !== null).map(r => ({...r, b: r.b === null || r.b < r.a ? r.a + (1 / 52) : r.b}));
        if (!list.length) return empty(W, fs, 'Ajoute des tâches : nom, début, fin (dates ou années), avancement en %.');
        const lo = Math.min(...list.map(r => r.a)), hi = Math.max(...list.map(r => r.b)), span = Math.max(hi - lo, 1 / 12), labW = Math.min(W * .38, Math.max(...list.map(r => textW(r.task, fs * .85))) + 12);
        const rowH = clamp(num(o.rowHeight) || fs * 2, fs * 1.4, 60), x0 = labW, x1 = W - 8, X = v => x0 + (v - lo) / span * (x1 - x0), groups = [...new Set(list.map(r => r.group))];
        const months = span < 3, top = fs * 1.8; let svg = '', y = top;
        // l'échelle : mois (courte durée) ou années
        const step = months ? 1 / 12 : span > 60 ? 10 : span > 20 ? 5 : span > 8 ? 2 : 1, M = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        let lastX = -1e9;
        for (let v = Math.ceil(lo / step - 1e-9) * step, i = 0; v <= hi + 1e-9 && i < 400; v += step, i++) { const x = X(v); if (x - x0 < -1) continue; svg += `<line x1="${r2(x)}" x2="${r2(x)}" y1="${r2(top - 4)}" y2="${r2(top + list.length * rowH)}" stroke="currentColor" stroke-opacity=".1"/>`;
            const mo = Math.round((v - Math.floor(v + 1e-6)) * 12) % 12, lab = months ? (mo === 0 ? `${M[0]} ${Math.floor(v + 1e-6)}` : M[mo]) : String(Math.round(v)), lw2 = textW(lab, fs * .7);
            if (x - lw2 / 2 > lastX + 6 && x + lw2 / 2 < W) { svg += T(x, top - fs * .9, lab, {size: fs * .7, anchor: 'middle', op: .7}); lastX = x + lw2 / 2; } }
        const sorted = o.sort === 'start' ? [...list].sort((p, q) => p.a - q.a) : list, prog = o.progress !== false;
        sorted.forEach((r, i) => { const c = pick(spec, o.colorBy === 'task' ? i : groups.indexOf(r.group), o.colorBy === 'one' ? o.barColor : ''), xa = X(r.a), xb = Math.max(X(r.b), xa + 3), bh = rowH * .62, by = y + (rowH - bh) / 2;
            if (o.stripes !== false && i % 2) svg += `<rect x="0" y="${r2(y)}" width="${r2(W)}" height="${r2(rowH)}" fill="currentColor" fill-opacity=".04"/>`;
            svg += T(4, y + rowH / 2, cut(r.task, labW - 10, fs * .85), {size: fs * .85, weight: 600});
            svg += `<g>${tip(`${r.task}${r.group ? ' (' + r.group + ')' : ''} : ${prog ? fmt(r.pct) + ' % fait' : ''}`)}<rect x="${r2(xa)}" y="${r2(by)}" width="${r2(xb - xa)}" height="${r2(bh)}" rx="${r2(bh / 4)}" fill="${c}" fill-opacity="${prog ? .35 : .9}"/>`
                + (prog && r.pct > 0 ? `<rect x="${r2(xa)}" y="${r2(by)}" width="${r2((xb - xa) * r.pct / 100)}" height="${r2(bh)}" rx="${r2(bh / 4)}" fill="${c}"/>` : '') + '</g>';
            if (prog && o.values !== false && xb - xa > fs * 2.4) svg += T((xa + xb) / 2, by + bh / 2, `${fmt(r.pct)} %`, {size: fs * .7, anchor: 'middle', weight: 700, fill: contrast(c)});
            y += rowH; });
        const today = new Date(), tv = today.getFullYear() + today.getMonth() / 12 + (today.getDate() - 1) / 365;
        if (o.today !== false && tv >= lo && tv <= hi) svg += `<line x1="${r2(X(tv))}" x2="${r2(X(tv))}" y1="${r2(top - 6)}" y2="${r2(y)}" stroke="${color(o.todayColor, '#e15759')}" stroke-width="1.6" stroke-dasharray="4 3"/>` + T(X(tv), y + fs * .7, 'aujourd’hui', {size: fs * .65, anchor: 'middle', fill: color(o.todayColor, '#e15759')});
        const legend = o.colorBy === 'group' || !o.colorBy ? groups.filter(Boolean).map((g, i) => ({label: g, color: pick(spec, groups.indexOf(g))})) : [];
        return {h: Math.max(num(o.height) || 0, y + fs * 1.4), svg, legend, desc: `Diagramme de Gantt : ${list.length} tâche${list.length > 1 ? 's' : ''}.`};
    }
    const sampleGantt = () => ({o: {title: 'Ma recherche sur les Borie'}, rows: [
        ['Relevés de Naves (1700-1792)', 'Archives', '2026-01-10', '2026-03-20', 100], ['État civil de Tulle', 'Archives', '2026-02-15', '2026-06-01', 70], ['Notaires (contrats de mariage)', 'Archives', '2026-04-01', '2026-09-30', 30],
        ['Recensements 1836-1936', 'En ligne', '2026-03-01', '2026-05-15', 90], ['Registres matricules', 'En ligne', '2026-05-01', '2026-07-20', 50], ['Visite à Arnac-la-Poste', 'Terrain', '2026-07-01', '2026-07-08', 0], ['Livre de famille', 'Écriture', '2026-08-01', '2026-12-15', 10]]
        .map(([task, group, start, end, done]) => ({task, group, start, end, done}))});

    /* ═════════ 🧠 Carte mentale : une idée au centre, des branches, des feuilles ═════════ */
    function mindmap(spec, W, fs) {
        const o = spec.o || {}, center = str(o.center || spec.o?.title, 60) || 'Mon idée', list = rowsOf(spec, 'rows', 300).map(r => ({branch: str(r.branch, 50), leaf: str(r.leaf, 60)})).filter(r => r.branch);
        if (!list.length) return empty(W, fs, 'Ajoute des branches (et, à côté, leurs idées).');
        const branches = [...new Set(list.map(r => r.branch))].slice(0, 16), leaves = b => list.filter(r => r.branch === b && r.leaf).map(r => r.leaf).slice(0, 12);
        const H = num(o.height) > 120 ? num(o.height) : Math.max(320, Math.min(1200, 120 + branches.reduce((s, b) => s + Math.max(1, leaves(b).length), 0) * fs * 1.25));
        const cx = W / 2, cy = H / 2, Rb = Math.min(W * .24, H * .3), Rl = Math.min(W * .44, H * .46), curve = o.curves !== false;
        let svg = '', lab = '';
        branches.forEach((b, i) => { const a = -Math.PI / 2 + i * TAU / branches.length, [bx, by] = P(cx, cy, Rb, a), c = pick(spec, i), lv = leaves(b), right = Math.cos(a) >= -1e-6;
            svg += curve ? `<path d="M${r2(cx)} ${r2(cy)}Q${r2((cx + bx) / 2 + Math.sin(a) * 20)} ${r2((cy + by) / 2 - Math.cos(a) * 20)} ${r2(bx)} ${r2(by)}" fill="none" stroke="${c}" stroke-width="${r2(clamp(num(o.thick ?? 5), 1, 16))}" stroke-linecap="round"/>` : `<line x1="${r2(cx)}" y1="${r2(cy)}" x2="${r2(bx)}" y2="${r2(by)}" stroke="${c}" stroke-width="${r2(clamp(num(o.thick ?? 5), 1, 16))}"/>`;
            const spread = Math.min(TAU / branches.length * .8, .25 * lv.length + .1);
            lv.forEach((l, j) => { const aa = a + (lv.length > 1 ? -spread / 2 + spread * j / (lv.length - 1) : 0), [lx, ly] = P(cx, cy, Rl, aa), ra = Math.cos(aa) >= 0;
                svg += curve ? `<path d="M${r2(bx)} ${r2(by)}Q${r2((bx + lx) / 2)} ${r2(ly)} ${r2(lx)} ${r2(ly)}" fill="none" stroke="${c}" stroke-opacity=".7" stroke-width="1.6"/>` : `<line x1="${r2(bx)}" y1="${r2(by)}" x2="${r2(lx)}" y2="${r2(ly)}" stroke="${c}" stroke-opacity=".7" stroke-width="1.6"/>`;
                lab += `<circle cx="${r2(lx)}" cy="${r2(ly)}" r="3" fill="${c}"/>` + T(lx + (ra ? 6 : -6), ly, cut(l, Math.max(fs * 3, ra ? W - lx - 10 : lx - 10), fs * .8), {size: fs * .8, anchor: ra ? 'start' : 'end'}); });
            const bw = Math.min(W * .3, textW(b, fs * .9) + fs * 1.4), bh = fs * 1.9;
            lab += `<g>${tip(`${b}${lv.length ? ' : ' + lv.join(', ') : ''}`)}<rect x="${r2(bx - bw / 2)}" y="${r2(by - bh / 2)}" width="${r2(bw)}" height="${r2(bh)}" rx="${r2(bh / 2)}" fill="${c}"/>${T(bx, by, cut(b, bw - fs, fs * .9), {size: fs * .9, anchor: 'middle', weight: 700, fill: contrast(c)})}</g>`;
            void right; });
        const cw = Math.min(W * .34, textW(center, fs * 1.15) + fs * 2), ch = fs * 2.6, cc = color(o.centerColor, '#1d1d1f');
        lab += `<rect x="${r2(cx - cw / 2)}" y="${r2(cy - ch / 2)}" width="${r2(cw)}" height="${r2(ch)}" rx="${r2(ch / 2)}" fill="${cc}"/>` + T(cx, cy, cut(center, cw - fs, fs * 1.15), {size: fs * 1.15, anchor: 'middle', weight: 800, fill: contrast(cc)});
        return {h: H, svg: svg + lab, legend: [], desc: `Carte mentale « ${center} » : ${branches.length} branche${branches.length > 1 ? 's' : ''}.`};
    }
    const sampleMind = () => ({o: {title: 'Mes pistes de recherche', center: 'Famille Borie'}, rows: [
        ['Archives', 'Registres de Naves'], ['Archives', 'Notaires de Tulle'], ['Archives', 'Registres matricules'], ['Lieux', 'Naves'], ['Lieux', 'Arnac-la-Poste'], ['Lieux', 'Brive'],
        ['Métiers', 'Laboureurs'], ['Métiers', 'Tisserands'], ['Questions', 'Qui était Jeanne Roux ?'], ['Questions', 'Pourquoi le départ en 1902 ?'], ['Photos', 'Mariage 1919'], ['Photos', 'Maison de Naves'], ['Cousins', 'Branche de Paris'], ['Cousins', 'ADN : 3 correspondances']].map(([branch, leaf]) => ({branch, leaf}))});

    /* ═════════ 🎯 Barres en cercle : un classement qui s'enroule ═════════ */
    function radialbar(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 60).map(r => ({label: str(r.label, 50), v: Math.max(0, num(r.value))})).filter(r => r.label);
        if (!list.length || !list.some(r => r.v > 0)) return empty(W, fs, 'Ajoute des noms et leurs chiffres.');
        const sorted = o.sort === 'none' ? list : [...list].sort((a, b) => b.v - a.v), max = num(o.max) > 0 ? num(o.max) : Math.max(...sorted.map(r => r.v)), sweep = clamp(num(o.sweep) || 270, 90, 360) * Math.PI / 180;
        const Rm = Math.max(60, Math.min(W / 2 - 8, (num(o.height) || W) / 2 - 8)), cx = W / 2, cy = Rm + 6, inner = Rm * clamp(num(o.hole ?? 25), 5, 70) / 100, band = (Rm - inner) / sorted.length, th = band * clamp(num(o.thick ?? 70), 20, 100) / 100;
        const a0 = -Math.PI / 2; let svg = '';
        sorted.forEach((r, i) => { const r1 = Rm - i * band, r0 = r1 - th, c = o.colors === 'one' ? color(o.barColor, '#4e79a7') : pick(spec, i), a1 = a0 + sweep * Math.min(1, r.v / max);
            if (o.track !== false) svg += sweep > TAU - .01 ? `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2((r0 + r1) / 2)}" fill="none" stroke="currentColor" stroke-opacity=".07" stroke-width="${r2(r1 - r0)}"/>` : `<path d="${arc(cx, cy, r0, r1, a0, a0 + sweep)}" fill="currentColor" fill-opacity=".07"/>`;
            if (r.v > 0) svg += `<path d="${arc(cx, cy, r0, r1, a0, Math.max(a0 + .01, a1))}" fill="${c}">${tip(`${r.label} : ${fmt(r.v)}${str(o.unit, 20) ? ' ' + str(o.unit, 20) : ''}`)}</path>`;
            if (band > fs * .8) svg += T(cx - 6, cy - (r0 + r1) / 2, `${cut(r.label, cx - inner - 12, fs * .75)}${o.values !== false ? ' · ' + fmt(r.v) : ''}`, {size: Math.min(fs * .75, band * .8), anchor: 'end', weight: 600}); });
        return {h: cy + Rm + 6, svg, legend: [], desc: `Barres en cercle : ${sorted.length} lignes, la plus longue « ${sorted[0].label} » (${fmt(sorted[0].v)}).`};
    }
    const sampleRadial = () => ({o: {title: 'Les prénoms les plus donnés', unit: 'fois'}, rows: [['Jean', 48], ['Marie', 61], ['Pierre', 33], ['Jeanne', 29], ['Antoine', 22], ['Louise', 18], ['François', 16], ['Anne', 15], ['Joseph', 14]].map(([label, value]) => ({label, value}))});

    /* ═════════ 🫧 Bulles groupées : une bulle par nom, sa taille suit le chiffre, rangées serrées ═════════ */
    function circlepack(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 400).map(r => ({label: str(r.label, 50), v: Math.max(0, num(r.value)), group: str(r.group, 40)})).filter(r => r.label && r.v > 0).sort((a, b) => b.v - a.v);
        if (!list.length) return empty(W, fs, 'Ajoute des noms (patronymes, métiers, lieux…) et leurs chiffres.');
        const H = num(o.height) > 120 ? num(o.height) : Math.round(Math.min(900, Math.max(260, W * .7))), total = list.reduce((s, r) => s + r.v, 0), k = Math.sqrt(W * H * .5 / (Math.PI * total)), groups = [...new Set(list.map(r => r.group))];
        const placed = [], pad = clamp(num(o.gap ?? 2), 0, 12);
        list.forEach(r => { const rad = Math.max(3, Math.sqrt(r.v) * k); if (!placed.length) { placed.push({...r, x: W / 2, y: H / 2, r: rad}); return; }
            let best = null; for (let t = 0; t < 1400 && !best; t++) { const a = t * .35, d = 2 + t * .9, x = W / 2 + Math.cos(a) * d, y = H / 2 + Math.sin(a) * d * .8; if (x - rad < 0 || x + rad > W || y - rad < 0 || y + rad > H) continue; if (placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + rad + pad)) best = {x, y}; }
            if (best) placed.push({...r, ...best, r: rad}); });
        let svg = '';
        placed.forEach((p, i) => { const c = o.colorBy === 'one' ? color(o.bubbleColor, '#4e79a7') : pick(spec, o.colorBy === 'item' ? i : groups.indexOf(p.group));
            svg += `<g>${tip(`${p.label}${p.group ? ' (' + p.group + ')' : ''} : ${fmt(p.v)}`)}<circle cx="${r2(p.x)}" cy="${r2(p.y)}" r="${r2(p.r)}" fill="${c}" fill-opacity="${r2(clamp(num(o.opacity ?? 85), 10, 100) / 100)}"/></g>`;
            if (p.r > fs * 1.2) { const s = Math.min(fs, p.r * .45); svg += T(p.x, p.y - (o.values !== false && p.r > fs * 1.8 ? s * .45 : 0), cut(p.label, p.r * 1.8, s), {size: s, anchor: 'middle', weight: 700, fill: contrast(c)}) + (o.values !== false && p.r > fs * 1.8 ? T(p.x, p.y + s * .7, fmt(p.v), {size: s * .8, anchor: 'middle', fill: contrast(c)}) : ''); } });
        const legend = (o.colorBy || 'group') === 'group' ? groups.filter(Boolean).map(g => ({label: g, color: pick(spec, groups.indexOf(g))})) : [];
        return {h: H, svg, legend, desc: `Bulles groupées : ${placed.length} bulles${placed.length < list.length ? ` (${list.length - placed.length} trop petites pour la place)` : ''}.`};
    }
    const sampleBubbles = () => ({o: {title: 'Les noms de famille de l’arbre'}, rows: [['Borie', 84, 'Corrèze'], ['Faure', 52, 'Corrèze'], ['Lacoste', 31, 'Corrèze'], ['Roux', 28, 'Haute-Vienne'], ['Martin', 25, 'Haute-Vienne'], ['Dupuy', 19, 'Corrèze'], ['Peyrat', 14, 'Haute-Vienne'], ['Chastang', 12, 'Corrèze'], ['Lagarde', 11, 'Lot'], ['Bourdet', 9, 'Lot'], ['Vergne', 8, 'Corrèze'], ['Mas', 6, 'Lot'], ['Rivière', 5, 'Haute-Vienne'], ['Soulier', 4, 'Lot'], ['Bos', 3, 'Corrèze']].map(([label, value, group]) => ({label, value, group}))});

    /* ═════════ ⭕ Anneaux d'avancement : un anneau par objectif (branche, registre…), plein = fini ═════════ */
    function rings(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 12).map(r => ({label: str(r.label, 50), v: clamp(num(r.value), 0, 1e12), goal: clamp(num(r.goal), 0, 1e12)})).filter(r => r.label && r.goal > 1e-9);
        if (!list.length) return empty(W, fs, 'Ajoute des objectifs : un nom, où tu en es, et le but (ex. 12 sur 16 ancêtres trouvés).');
        const side = o.layout === 'grid', n = list.length;
        if (side) { const cols = clamp(Math.round(num(o.cols) || Math.min(4, n)), 1, 6), cw = W / cols, r = Math.min(cw * .38, 90), rowH = r * 2 + fs * 3; let svg = '';
            list.forEach((it, i) => { const cx = cw * (i % cols) + cw / 2, cy = Math.floor(i / cols) * rowH + r + 6, c = pick(spec, i), f = Math.min(1, it.v / it.goal), th = r * clamp(num(o.thick ?? 22), 6, 60) / 100;
                svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r - th / 2)}" fill="none" stroke="${c}" stroke-opacity=".18" stroke-width="${r2(th)}"/>` + (f > 0 ? `<path d="${arc(cx, cy, r - th, r, -Math.PI / 2, -Math.PI / 2 + Math.max(.01, f * TAU - 1e-4))}" fill="${c}">${tip(`${it.label} : ${fmt(it.v)} sur ${fmt(it.goal)}`)}</path>` : '')
                    + T(cx, cy, `${Math.round(f * 100)} %`, {size: Math.min(fs * 1.4, r * .5), anchor: 'middle', weight: 800}) + T(cx, cy + r + fs * .9, cut(it.label, cw - 8, fs * .85), {size: fs * .85, anchor: 'middle', weight: 600}) + T(cx, cy + r + fs * 2, `${fmt(it.v)} / ${fmt(it.goal)}`, {size: fs * .7, anchor: 'middle', op: .7}); });
            return {h: Math.ceil(n / cols) * rowH + 6, svg, legend: [], desc: `Anneaux d’avancement : ${n} objectifs.`}; }
        const Rm = Math.min(W * .3, 180), cx = Rm + 8, cy = Rm + 6, band = Rm * .75 / n, th = band * clamp(num(o.thick ?? 80), 30, 100) / 100; let svg = '';
        list.forEach((it, i) => { const r1 = Rm - i * band, r0 = r1 - th, c = pick(spec, i), f = Math.min(1, it.v / it.goal);
            svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2((r0 + r1) / 2)}" fill="none" stroke="${c}" stroke-opacity=".16" stroke-width="${r2(r1 - r0)}"/>` + (f > 0 ? `<path d="${arc(cx, cy, r0, r1, -Math.PI / 2, -Math.PI / 2 + Math.max(.01, f * TAU - 1e-4))}" fill="${c}">${tip(`${it.label} : ${fmt(it.v)} sur ${fmt(it.goal)}`)}</path>` : '');
            const ly = 10 + fs * 1.6 * i + fs; svg += `<rect x="${r2(cx + Rm + 18)}" y="${r2(ly - fs * .45)}" width="${r2(fs * .9)}" height="${r2(fs * .9)}" rx="2" fill="${c}"/>` + T(cx + Rm + 18 + fs * 1.3, ly, cut(`${it.label} — ${Math.round(f * 100)} % (${fmt(it.v)} / ${fmt(it.goal)})`, W - cx - Rm - 30 - fs, fs * .85), {size: fs * .85, weight: 600}); });
        return {h: Math.max(cy + Rm + 6, 10 + fs * 1.6 * n + fs), svg, legend: [], desc: `Anneaux d’avancement : ${n} objectifs, de ${Math.round(Math.min(...list.map(r => Math.min(1, r.v / r.goal))) * 100)} à ${Math.round(Math.max(...list.map(r => Math.min(1, r.v / r.goal))) * 100)} %.`};
    }
    const sampleRings = () => ({o: {title: 'Où j’en suis'}, rows: [['Grands-parents trouvés', 4, 4], ['Arrière-grands-parents', 7, 8], ['Trisaïeuls', 11, 16], ['Actes de naissance sourcés', 38, 60], ['Photos identifiées', 52, 120]].map(([label, value, goal]) => ({label, value, goal}))});

    /* ═════════ « Depuis l'app » : les chiffres de mon arbre (l'arbre lu par ✨ Trésors, tresor_tree) ═════════ */
    const APP = () => window.LCNDA_APP;
    function tree6() {
        if (ext.tresors?.T?.tree) return ext.tresors.T.tree();
        return APP().api('tresor_tree').then(d => { const byId = new Map(d.people.map(p => [p.id, p])), kids = new Map();
            d.families.forEach(f => [f.a, f.b].filter(Boolean).forEach(x => { if (!kids.has(x)) kids.set(x, []); kids.get(x).push(...f.children); })); return {...d, byId, kids}; });
    }
    const nm = p => (p ? p.name || [p.first, p.last].filter(Boolean).join(' ') || 'Sans nom' : '?');
    const life = p => (p.by || p.dy ? `${p.by || '?'}–${p.dy || (p.living ? '' : '?')}` : '');
    const v6 = (pane, k) => pane.querySelector(`[data-n6="${k}"]`)?.value || '';
    const root6 = (pane, tr) => tr.byId.get(Number(pane.querySelector('[name="n6_root"]')?.value)) || tr.byId.get(Number(APP().state?.bootstrap?.startPersonId)) || tr.people.find(p => p.start) || tr.people[0];
    const sel6 = (k, label, opts, def) => `<label>${esc(label)}<select data-n6="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(def) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    /** les ancêtres d'une personne : [{p, gen}] (gen 1 = parents), chacun une seule fois */
    function anc6(tr, p, max) { const out = [], seen = new Set([p.id]); let cur = [p.id];
        for (let g = 1; g <= max && cur.length; g++) { const nx = []; cur.forEach(id => { const q = tr.byId.get(id); [q?.father, q?.mother].filter(Boolean).forEach(a => { if (seen.has(a) || !tr.byId.get(a)) return; seen.add(a); out.push({p: tr.byId.get(a), gen: g}); nx.push(a); }); }); cur = nx; }
        return out; }
    function desc6(tr, p, max) { const out = [], seen = new Set([p.id]); let cur = [p.id];
        for (let g = 1; g <= max && cur.length; g++) { const nx = []; cur.forEach(id => (tr.kids.get(id) || []).forEach(k => { if (seen.has(k) || !tr.byId.get(k)) return; seen.add(k); out.push({p: tr.byId.get(k), gen: g}); nx.push(k); })); cur = nx; }
        return out; }
    const GEN_UP = ['Parents', 'Grands-parents', 'Arrière-grands-parents', 'Trisaïeuls', 'Quadrisaïeuls', 'Génération 6', 'Génération 7'];
    const GEN_DOWN = ['Enfants', 'Petits-enfants', 'Arrière-petits-enfants', 'Génération +4'];
    const count6 = (list, key) => { const m = new Map(); list.forEach(x => { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'fr')); };
    const roman6 = n => { let s = '', x = n; for (const [a, b] of [[20, 'XX'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (x >= a) { s += b; x -= a; } return s; };
    const BYS = [['first', 'Les prénoms les plus donnés', p => String(p.first || '').split(/[\s-]+/)[0]], ['last', 'Les noms de famille', p => p.last || ''], ['occ', 'Les métiers', p => p.occ || ''],
        ['place', 'Les communes de naissance', (p, tr) => (p.bplace && tr.places[p.bplace] ? tr.places[p.bplace].name.split(',')[0] : '')], ['century', 'Les siècles de naissance', p => (p.by ? `${roman6(Math.ceil(p.by / 100))}e siècle` : '')]];
    /** un panneau : titre, phrase, la personne (ou non), des choix, « Prendre dans mon arbre » ; run(pane, tr) → {rows, o} */
    function app6(title, intro, fields, run, {person = true} = {}) {
        return {html: () => `<div class="h-dg-app n6-app"><h4>${esc(title)}</h4><p class="muted">${esc(intro)}</p>${person && APP()?.pickerField ? `<span class="pk-lab">La personne</span>${APP().pickerField({name: 'n6_root', kind: 'person', animals: false, value: Number(APP().state?.bootstrap?.startPersonId) || null})}` : ''}${fields}
                <button type="button" class="button small" data-n6-go>Prendre dans mon arbre</button><p class="muted" data-n6-msg aria-live="polite"></p></div>`,
            bind: (pane, io) => { const btn = pane.querySelector('[data-n6-go]'), msg = pane.querySelector('[data-n6-msg]'); if (!btn) return;
                btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = window.LCNDA_UI.spinner('Lecture de ta généalogie…', {inline: true});
                    try { const tr = await tree6(), r = run(pane, tr); if (!r.rows.length) throw new Error('Rien trouvé dans l’arbre pour ce choix.');
                        const s = io.spec(); s.rows = r.rows.slice(0, 400); s.o = {...s.o, ...r.o}; io.apply(s); if (msg) msg.textContent = ''; APP().toast?.(`${r.rows.length > 400 ? 400 : r.rows.length} lignes prises dans l’arbre.`); }
                    catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } }); }};
    }
    const N_OPTS = [[8, '8'], [10, '10'], [15, '15'], [20, '20']];
    const ranked = (pane, tr) => { const by = BYS.find(b => b[0] === v6(pane, 'by')) || BYS[0], n = Number(v6(pane, 'n')) || 10; return {by, list: count6(tr.people, p => by[2](p, tr)).slice(0, n)}; };
    const FROM6 = {
        hourglass: app6('⏳ Le sablier de quelqu’un de mon arbre', 'Ses ancêtres au-dessus, ses descendants au-dessous, avec leurs dates.',
            sel6('up', 'Générations au-dessus', [[1, '1 (parents)'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], 2) + sel6('down', 'Générations au-dessous', [[1, '1 (enfants)'], [2, '2'], [3, '3'], [4, '4']], 2),
            (pane, tr) => { const p = root6(pane, tr); if (!p) return {rows: []};
                const rows = [...anc6(tr, p, Number(v6(pane, 'up')) || 2).map(x => ({name: nm(x.p), gen: -x.gen, dates: life(x.p)})), {name: nm(p), gen: 0, dates: life(p)}, ...desc6(tr, p, Number(v6(pane, 'down')) || 2).map(x => ({name: nm(x.p), gen: x.gen, dates: life(x.p)}))];
                return {rows, o: {title: `Le sablier de ${nm(p)}`}}; }),
        gantt: app6('📅 Les vies côte à côte', 'Une barre par personne, de sa naissance à son décès (ou à aujourd’hui).',
            sel6('who', 'Qui', [['anc', 'Ses ancêtres directs'], ['fam', 'Sa famille proche (parents, frères et sœurs, enfants)'], ['desc', 'Ses descendants']], 'anc') + sel6('gens', 'Générations', [[2, '2'], [3, '3'], [4, '4'], [5, '5']], 3),
            (pane, tr) => { const p = root6(pane, tr); if (!p) return {rows: []}; const who = v6(pane, 'who'), g = Number(v6(pane, 'gens')) || 3, now = new Date().getFullYear();
                let list = who === 'desc' ? desc6(tr, p, g).map(x => ({p: x.p, group: GEN_DOWN[x.gen - 1] || `Génération +${x.gen}`})) : who === 'fam' ? [] : anc6(tr, p, g).map(x => ({p: x.p, group: GEN_UP[x.gen - 1] || `Génération ${x.gen}`}));
                if (who === 'fam') { const add = (q, group) => { if (q && !list.some(x => x.p.id === q.id)) list.push({p: q, group}); };
                    [p.father, p.mother].forEach(id => add(tr.byId.get(id), 'Parents'));
                    (tr.families || []).filter(f => f.children?.includes(p.id)).forEach(f => f.children.forEach(id => id !== p.id && add(tr.byId.get(id), 'Frères et sœurs')));
                    (tr.kids.get(p.id) || []).forEach(id => add(tr.byId.get(id), 'Enfants')); }
                list = [{p, group: 'La personne'}, ...list];
                const rows = list.filter(x => x.p.by).map(x => ({task: `${nm(x.p)}${x.p.occ ? ` (${x.p.occ})` : ''}`, group: x.group, start: String(x.p.by), end: String(x.p.dy || (x.p.living ? now : x.p.by + 1)), done: x.p.dy || x.p.living ? 100 : 0}));
                return {rows, o: {title: `Les vies autour de ${nm(p)}`}}; }),
        mindmap: app6('🧠 Une personne et ses branches', 'Au centre la personne ; autour, ses enfants (et leurs enfants), ou les métiers et les communes de ses ancêtres.',
            sel6('by', 'Les branches', [['kids', 'Ses enfants, et leurs enfants'], ['occ', 'Les métiers de ses ancêtres'], ['place', 'Les communes de naissance de ses ancêtres']], 'kids'),
            (pane, tr) => { const p = root6(pane, tr); if (!p) return {rows: []}; const by = v6(pane, 'by'); let rows = [];
                if (by === 'kids') (tr.kids.get(p.id) || []).forEach(k => { const c = tr.byId.get(k); if (!c) return; const gk = (tr.kids.get(k) || []).map(x => tr.byId.get(x)).filter(Boolean); rows.push(...(gk.length ? gk.map(g => ({branch: nm(c), leaf: nm(g)})) : [{branch: nm(c), leaf: life(c) || '—'}])); });
                else { const key = by === 'occ' ? q => q.occ : q => (q.bplace && tr.places[q.bplace] ? tr.places[q.bplace].name.split(',')[0] : ''); anc6(tr, p, 6).forEach(x => { const k = key(x.p); if (k) rows.push({branch: k, leaf: nm(x.p)}); }); }
                return {rows, o: {title: by === 'kids' ? `La descendance de ${nm(p)}` : by === 'occ' ? `Les métiers des ancêtres de ${nm(p)}` : `D’où viennent les ancêtres de ${nm(p)}`, center: nm(p)}}; }),
        radialbar: app6('🎯 Un classement de mon arbre', 'Les plus fréquents dans toute la base, en barres autour d’un cercle.', sel6('by', 'Classer', BYS.map(b => [b[0], b[1]]), 'first') + sel6('n', 'Combien', N_OPTS, 10),
            (pane, tr) => { const {by, list} = ranked(pane, tr); return {rows: list.map(([label, value]) => ({label, value})), o: {title: by[1], unit: 'fiches'}}; }, {person: false}),
        circlepack: app6('🫧 Les bulles de mon arbre', 'Une bulle par nom, métier ou commune : plus il y a de fiches, plus elle est grosse.', sel6('by', 'Les bulles', BYS.filter(b => b[0] !== 'century').map(b => [b[0], b[1]]), 'last') + sel6('n', 'Combien', N_OPTS, 15),
            (pane, tr) => { const {by, list} = ranked(pane, tr); return {rows: list.map(([label, value]) => ({label, value, group: ''})), o: {title: by[1]}}; }, {person: false}),
        rings: app6('⭕ Où j’en suis dans mon arbre', 'Un anneau par objectif : plein, c’est fini.', sel6('by', 'Les objectifs', [['gens', 'Les ancêtres trouvés, génération par génération'], ['facts', 'Les fiches complètes (dates, lieux, métier)']], 'gens'),
            (pane, tr) => { const by = v6(pane, 'by');
                if (by === 'facts') { const all = tr.people, dead = all.filter(p => !p.living), n = all.length;
                    return {rows: [['Date de naissance', all.filter(p => p.by).length, n], ['Lieu de naissance', all.filter(p => p.bplace).length, n], ['Date de décès (personnes décédées)', dead.filter(p => p.dy).length, dead.length], ['Métier', all.filter(p => p.occ).length, n]].filter(r => r[2]).map(([label, value, goal]) => ({label, value, goal})), o: {title: 'Mes fiches complètes'}}; }
                const p = root6(pane, tr); if (!p) return {rows: []}; const a = anc6(tr, p, 5);
                return {rows: GEN_UP.slice(0, 5).map((label, i) => ({label, value: a.filter(x => x.gen === i + 1).length, goal: 2 ** (i + 1)})), o: {title: `Les ancêtres de ${nm(p)} : où j’en suis`}}; }),
    };

    /* ═════════ Les sortes : tableaux, réglages ═════════ */
    const PALETTE = C('palette', 'Couleurs', 'select', {choices: Object.keys(R.PALETTES || {vive: 1}).map(k => [k, k.charAt(0).toUpperCase() + k.slice(1)])});
    const KINDS = {
        hourglass: {icon: '⏳', label: 'Sablier (ascendants et descendants d’une personne)', group: 'Généalogie', render: hourglass, noLegend: false, legend: 'bottom',
            help: 'Une personne au milieu ; ses parents, grands-parents… au-dessus ; ses enfants, petits-enfants… au-dessous.',
            grids: [{key: 'rows', label: 'Les personnes (génération : 0 = la personne, −1 = parents, 1 = enfants…)', cols: [C('name', 'Nom'), C('gen', 'Génération', 'number'), C('dates', 'Dates'), C('note', 'Note')]}],
            options: [C('upColor', 'Couleur des ascendants', 'color', {def: '#4e79a7'}), C('midColor', 'Couleur de la personne', 'color', {def: '#e15759'}), C('downColor', 'Couleur des descendants', 'color', {def: '#59a14f'}),
                C('rowHeight', 'Hauteur d’une case', 'range', {unit: 'px', min: 24, max: 120, def: 46}), C('gap', 'Écart entre générations', 'range', {unit: 'px', min: 6, max: 80, def: 22}), C('radius', 'Coins arrondis', 'range', {unit: 'px', min: 0, max: 30, def: 6}),
                C('links', 'Traits vers la personne', 'check', {def: true}), C('genLabels', 'Nom des générations à gauche', 'check', {def: true})],
            sample: sampleHour},
        gantt: {icon: '📅', label: 'Diagramme de Gantt (tâches, chantiers de recherche)', group: 'Frises', render: gantt, legend: 'bottom',
            help: 'Une ligne par tâche, de sa date de début à sa date de fin, avec ce qui est déjà fait.',
            grids: [{key: 'rows', label: 'Les tâches', cols: [C('task', 'Tâche'), C('group', 'Groupe'), C('start', 'Début (date ou année)'), C('end', 'Fin'), C('done', 'Fait', 'number', {unit: '%', min: 0, max: 100})]}],
            options: [C('colorBy', 'Couleur', 'select', {choices: [['group', 'Une par groupe'], ['task', 'Une par tâche'], ['one', 'Une seule']], def: 'group'}), C('barColor', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'}), PALETTE,
                C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['start', 'Par date de début']]}), C('rowHeight', 'Hauteur d’une ligne', 'range', {unit: 'px', min: 16, max: 60, def: 28}),
                C('progress', 'Montrer l’avancement', 'check', {def: true}), C('values', 'Écrire le %', 'check', {def: true}), C('today', 'Trait « aujourd’hui »', 'check', {def: true}), C('todayColor', 'Couleur du trait « aujourd’hui »', 'color', {def: '#e15759'}), C('stripes', 'Une ligne sur deux grisée', 'check', {def: true}), H_OPT],
            sample: sampleGantt},
        mindmap: {icon: '🧠', label: 'Carte mentale (une idée, ses branches)', group: 'Liens', render: mindmap, noLegend: true,
            help: 'Une idée au centre, des branches autour, et les idées de chaque branche.',
            grids: [{key: 'rows', label: 'Les branches et leurs idées (une ligne par idée)', cols: [C('branch', 'Branche'), C('leaf', 'Idée')]}],
            options: [C('center', 'Le mot du centre'), C('centerColor', 'Couleur du centre', 'color', {def: '#1d1d1f'}), PALETTE, C('curves', 'Branches en courbes', 'check', {def: true}), C('thick', 'Épaisseur des branches', 'range', {unit: 'px', min: 1, max: 16, def: 5}), H_OPT],
            sample: sampleMind},
        radialbar: {icon: '🎯', label: 'Barres en cercle (classement qui s’enroule)', group: 'Chiffres', render: radialbar, noLegend: true,
            grids: [{key: 'rows', label: 'Les lignes', cols: [C('label', 'Nom'), C('value', 'Chiffre', 'number')]}],
            options: [C('sweep', 'Tour complet', 'range', {unit: '°', min: 90, max: 360, def: 270}), C('hole', 'Trou au centre', 'range', {unit: '%', min: 5, max: 70, def: 25}), C('thick', 'Épaisseur des barres', 'range', {unit: '%', min: 20, max: 100, def: 70}),
                C('colors', 'Couleurs', 'select', {choices: [['', 'Une par ligne'], ['one', 'Une seule']]}), C('barColor', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colors === 'one'}), PALETTE,
                C('sort', 'Ordre', 'select', {choices: [['', 'Du plus grand au plus petit'], ['none', 'Comme dans le tableau']]}), C('track', 'Rail gris sous chaque barre', 'check', {def: true}), C('values', 'Écrire les chiffres', 'check', {def: true}), C('max', 'Chiffre d’un tour complet (vide = le plus grand)', 'number'), C('unit', 'Unité'), H_OPT],
            sample: sampleRadial},
        circlepack: {icon: '🫧', label: 'Bulles groupées (noms, métiers, lieux)', group: 'Parts', render: circlepack, legend: 'bottom',
            grids: [{key: 'rows', label: 'Les bulles', cols: [C('label', 'Nom'), C('value', 'Chiffre', 'number'), C('group', 'Groupe (couleur)')]}],
            options: [C('colorBy', 'Couleur', 'select', {choices: [['group', 'Une par groupe'], ['item', 'Une par bulle'], ['one', 'Une seule']], def: 'group'}), C('bubbleColor', 'Couleur (une seule)', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'}), PALETTE,
                C('opacity', 'Opacité', 'range', {unit: '%', min: 10, max: 100, def: 85}), C('gap', 'Écart entre les bulles', 'range', {unit: 'px', min: 0, max: 12, def: 2}), C('values', 'Écrire les chiffres', 'check', {def: true}), H_OPT],
            sample: sampleBubbles},
        rings: {icon: '⭕', label: 'Anneaux d’avancement (objectifs de recherche)', group: 'Chiffres clés', render: rings, noLegend: true,
            help: 'Un anneau par objectif : plein quand c’est fini (ancêtres trouvés, actes sourcés, photos identifiées…).',
            grids: [{key: 'rows', label: 'Les objectifs', cols: [C('label', 'Objectif'), C('value', 'Où j’en suis', 'number'), C('goal', 'Le but', 'number')]}],
            options: [C('layout', 'Disposition', 'select', {choices: [['', 'Anneaux l’un dans l’autre'], ['grid', 'Un anneau par objectif, côte à côte']]}), C('cols', 'Par ligne (côte à côte)', 'range', {min: 1, max: 6, def: 4, when: s => s.o?.layout === 'grid'}),
                C('thick', 'Épaisseur', 'range', {unit: '%', min: 6, max: 100, def: 60}), PALETTE],
            sample: sampleRings},
    };
    for (const [k, kind] of Object.entries(KINDS)) { if (FROM6[k]) kind.fromApp = FROM6[k]; if (!R.KINDS[k]) R.KINDS[k] = kind; }
    ext.diagramNouveaux = {KINDS: Object.keys(KINDS)};
})();
