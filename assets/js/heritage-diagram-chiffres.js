/* LCNDA — 📊 Diagrammes : sortes « Chiffres » et « Chiffres clés » (ajoutées au catalogue de heritage-diagrams-render.js).
 *  Chiffres : classement qui évolue (bump chart), courants empilés (streamgraph), histogramme, boîte à moustaches,
 *  haltères (dumbbell), pente avant / après (slope), cascade (waterfall), sucettes horizontales et verticales (lollipop),
 *  essaim de points (beeswarm), petites courbes en grille (small multiples).
 *  Chiffres clés : cartes de chiffres (KPI), barre d'objectif (bullet chart).
 * Chaque sorte : un dessin SVG (textes échappés, couleurs vérifiées, tailles bornées), ses tableaux, ses réglages, un
 * exemple de départ, et (kind.app) des données prises dans l'arbre : api.php?action=diagram_numbers (lib/diagram_chiffres.php).
 * Point d'enregistrement : ext.diagramRender.KINDS (lu par la fenêtre « Nouveau diagramme » au premier usage).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const DR = ext.diagramRender; if (!DR?.KINDS) return;
    const A = () => window.LCNDA_APP;

    /* ─── Petits outils (les mêmes règles que le dessin commun) ─── */
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = DR.num, color = DR.color, ticks = DR.ticks;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = {}, fmt = (n, d = 2) => (NF[d] || (NF[d] = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}))).format(Number.isFinite(n) ? n : 0); // un seul formateur par précision : bien plus rapide
    const sgn = (n, d = 2) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n), d);
    const blank = v => v === undefined || v === null || String(v).trim() === '';
    const isNum = v => typeof v === 'number' ? Number.isFinite(v) : Number.isFinite(parseFloat(String(v ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')));
    const BIG = 1e12, val = v => clamp(num(v), -BIG, BIG); // des chiffres raisonnables : rien d'infini ni d'absurde dans le dessin
    const pal = spec => DR.PALETTES[spec.o?.palette] || DR.PALETTES.vive;
    const pick = (spec, i, c) => color(c, pal(spec)[((i % pal(spec).length) + pal(spec).length) % pal(spec).length]);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s + '…'; };
    const contrast = c => { const m = String(c).match(/^#([0-9a-f]{6}|[0-9a-f]{3})\b/i); if (!m) return '#fff'; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1d1d1f' : '#fff'; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', rotate = 0, baseline = 'middle', style = '', opacity = 1} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}${rotate ? ` transform="rotate(${rotate} ${r2(x)} ${r2(y)})"` : ''}${style ? ` font-style="${style}"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888'})});
    const rowsOf = (spec, key = 'rows', max = 5000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object').slice(0, max);
    const MAX_CATS = 300, MAX_SERIES = 40;
    /** catégories × séries (comme les colonnes) ; vide = null */
    function table(spec) {
        const series = (Array.isArray(spec.series) && spec.series.length ? spec.series : [{name: 'Valeur'}]).slice(0, MAX_SERIES).map((s, j) => ({name: String(s?.name || `Série ${j + 1}`), color: pick(spec, j, s?.color)}));
        const cats = rowsOf(spec, 'rows', MAX_CATS).map((r, i) => ({label: String(r.label ?? ''), color: r.color, i, raw: series.map((_, j) => r['s' + j]), v: series.map((_, j) => isNum(r['s' + j]) ? val(r['s' + j]) : null)}));
        return {series, cats};
    }
    const unitOf = o => (o.unit ? ' ' + String(o.unit).slice(0, 30) : '');
    /** axe des valeurs vertical : lignes et chiffres */
    function yAxis(tk, x0, y0, plotW, plotH, fs, lab = v => fmt(v)) {
        const V = v => y0 + plotH - (v - tk.lo) / (tk.hi - tk.lo || 1) * plotH;
        return tk.ticks.map(v => `<line x1="${r2(x0)}" y1="${r2(V(v))}" x2="${r2(x0 + plotW)}" y2="${r2(V(v))}" stroke="currentColor" stroke-opacity="${v === 0 ? .45 : .12}"/>` + T(x0 - 6, V(v), lab(v), {size: fs * .85, anchor: 'end'})).join('');
    }
    function xAxis(tk, x0, y0, plotW, plotH, fs, lab = v => fmt(v)) {
        const X = v => x0 + (v - tk.lo) / (tk.hi - tk.lo || 1) * plotW;
        return tk.ticks.map(v => `<line x1="${r2(X(v))}" y1="${r2(y0)}" x2="${r2(X(v))}" y2="${r2(y0 + plotH)}" stroke="currentColor" stroke-opacity="${v === 0 ? .45 : .12}"/>` + T(X(v), y0 + plotH + fs, lab(v), {size: fs * .85, anchor: 'middle'})).join('');
    }
    /** étiquettes de catégories sous un axe, penchées si elles ne tiennent pas */
    function catLabels(labels, x0, band, y, fs) {
        const rot = Math.max(0, ...labels.map(l => textW(l, fs * .9))) > band * .95;
        const every = rot ? Math.max(1, Math.ceil(fs * 1.2 / band)) : 1;
        const svg = labels.map((l, i) => i % every ? '' : rot ? T(x0 + band * (i + .5), y + 6, cut(l, Math.min(130, (x0 + band * (i + .5)) / .77), fs * .9), {size: fs * .9, anchor: 'end', rotate: -40, baseline: 'hanging'}) /* penchées : coupées avant de sortir à gauche */ : T(x0 + band * (i + .5), y + fs, cut(l, band, fs * .9), {size: fs * .9, anchor: 'middle'})).join('');
        return {svg, h: rot ? Math.min(140, Math.max(0, ...labels.map(l => textW(cut(l, 130, fs * .9), fs * .9))) * .72 + fs) : fs * 1.8};
    }
    /** courbe douce passant par les points (Catmull-Rom → Bézier), sans dépasser en hauteur entre deux points */
    function smooth(pts, move = true) {
        if (!pts.length) return '';
        let d = (move ? 'M' : 'L') + r2(pts[0][0]) + ' ' + r2(pts[0][1]);
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
            const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
            const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6, lo, hi)], c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6, lo, hi)];
            d += `C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`;
        }
        return d;
    }
    const line = (pts, move = true) => pts.map((p, i) => (i || !move ? 'L' : 'M') + r2(p[0]) + ' ' + r2(p[1])).join('');
    /** des étiquettes qui ne se chevauchent pas (positions y triées, écart minimal, dans [top, bottom]) */
    function relax(items, gap, top, bottom) {
        const s = [...items].sort((a, b) => a.y - b.y);
        s.forEach((it, i) => { it.ly = Math.max(it.y, i ? s[i - 1].ly + gap : top); });
        for (let i = s.length - 1; i >= 0; i--) { const lim = i === s.length - 1 ? bottom : s[i + 1].ly - gap; if (s[i].ly > lim) s[i].ly = lim; }
        s.forEach((it, i) => { if (i && it.ly < s[i - 1].ly + gap) it.ly = s[i - 1].ly + gap; });
        return items;
    }
    /** quartiles (interpolation linéaire, comme les tableurs) */
    const quant = (sorted, p) => { if (!sorted.length) return 0; const h = (sorted.length - 1) * p, lo = Math.floor(h); return sorted[lo] + (sorted[Math.min(sorted.length - 1, lo + 1)] - sorted[lo]) * (h - lo); };
    /** un petit hasard toujours le même pour une même ligne (points dispersés sans bouger d'un affichage à l'autre) */
    const jitter = i => { let x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

    /* ═════════ 🏁 Classement qui évolue (bump chart) ═════════ */
    function bump(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec);
        if (cats.length < 2 || series.length < 2) return empty(W, fs, 'Ajoute des noms (lignes) et au moins deux périodes (colonnes).');
        let N = clamp(Math.round(num(o.top) || 10), 3, 30); const byRank = o.mode === 'rank';
        const ranks = cats.map(() => series.map(() => null));
        series.forEach((_, j) => {
            if (byRank) cats.forEach((c, i) => { const r = Math.round(c.v[j] ?? 0); ranks[i][j] = r >= 1 && r <= N ? r : null; });
            else cats.map((c, i) => [c.v[j], i]).filter(([v]) => v !== null && v > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, N).forEach(([, i], k) => { ranks[i][j] = k + 1; });
        });
        const shown = cats.filter((_, i) => ranks[i].some(r => r));
        if (!shown.length) return empty(W, fs, 'Aucun rang à montrer : vérifie les chiffres.');
        N = Math.max(...ranks.flat().filter(Boolean)); // pas de rangées vides en bas
        const nameFs = fs * .92, hi = String(o.highlight || '').trim().toLowerCase();
        const top = fs * 2.2, rowH = clamp(num(o.rowHeight) || fs * 2.3, 14, 60), rad = Math.min(rowH * .38, fs * .95);
        const labL = Math.min(W * .26, Math.max(fs * 3, ...cats.filter((_, i) => ranks[i][0]).map(c => textW(c.label, nameFs))) + rad + 14);
        const labR = Math.min(W * .26, Math.max(fs * 3, ...cats.filter((_, i) => ranks[i][series.length - 1]).map(c => textW(c.label, nameFs))) + rad + 14);
        const plotW = Math.max(40, W - labL - labR), X = j => labL + (series.length === 1 ? plotW / 2 : j * plotW / (series.length - 1)), Y = r => top + (r - .5) * rowH;
        let svg = '';
        for (let r = 1; r <= N; r++) svg += `<line x1="${r2(labL)}" y1="${r2(Y(r))}" x2="${r2(labL + plotW)}" y2="${r2(Y(r))}" stroke="currentColor" stroke-opacity=".06"/>`;
        const hdrStep = Math.max(1, Math.ceil(Math.max(...series.map(s => textW(s.name, fs * .85))) / Math.max(1, plotW / Math.max(1, series.length - 1)) * 1.1));
        series.forEach((s, j) => { if (j % hdrStep === 0 || j === series.length - 1) svg += T(X(j), fs * .8, cut(s.name, 90, fs * .85), {size: fs * .85, anchor: 'middle', weight: 600}); });
        const lines = [], dots = [];
        cats.forEach((c, i) => {
            if (!ranks[i].some(r => r)) return;
            const col = pick(spec, i, c.color), dim = hi && !c.label.toLowerCase().includes(hi), op = dim ? .18 : 1;
            let seg = [];
            const flush = () => { if (seg.length > 1) lines.push(`<path d="${smooth(seg)}" fill="none" stroke="${col}" stroke-width="${r2(Math.max(2, rad * .55))}" stroke-opacity="${op}" stroke-linecap="round"/>`); seg = []; };
            ranks[i].forEach((r, j) => { if (r) seg.push([X(j), Y(r)]); else flush(); });
            flush();
            ranks[i].forEach((r, j) => { if (!r) return;
                dots.push(`<g opacity="${op}"><circle cx="${r2(X(j))}" cy="${r2(Y(r))}" r="${r2(rad)}" fill="${col}">${tip(`${c.label} — ${series[j].name} : ${r}${r === 1 ? 'er' : 'e'}${byRank ? '' : ` (${fmt(c.v[j])})`}`)}</circle>${rad > fs * .45 ? T(X(j), Y(r) + .5, String(r), {size: rad * 1.05, anchor: 'middle', weight: 700, fill: contrast(col)}) : ''}</g>`); });
            const first = ranks[i].findIndex(r => r), last = ranks[i].length - 1 - [...ranks[i]].reverse().findIndex(r => r);
            const lw = dim ? 400 : 600;
            if (first === 0) dots.push(T(labL - rad - 6, Y(ranks[i][0]), cut(c.label, labL - rad - 8, nameFs), {size: nameFs, anchor: 'end', weight: lw, opacity: op}));
            else dots.push(T(X(first), Y(ranks[i][first]) - rad - fs * .45, cut(c.label, 110, fs * .78), {size: fs * .78, anchor: 'middle', opacity: op}));
            if (last === series.length - 1) dots.push(T(X(last) + rad + 6, Y(ranks[i][last]), cut(c.label, labR - rad - 8, nameFs), {size: nameFs, weight: lw, opacity: op}));
        });
        return {h: top + N * rowH, svg: svg + lines.join('') + dots.join('')};
    }

    /* ═════════ 🌊 Courants empilés (streamgraph) ═════════ */
    function stream(spec, W, fs) {
        const o = spec.o || {}, t = table(spec), series = t.series.slice(0, 30), cats = t.cats.slice(0, 160); // au-delà, illisible (et trop lourd)
        if (cats.length < 2) return empty(W, fs, 'Ajoute au moins deux périodes (lignes) et des catégories (colonnes).');
        const n = cats.length, m = series.length, offset = o.offset || 'wiggle';
        let val = cats.map(c => c.v.map(v => Math.max(0, v || 0)));
        if (offset === 'expand') val = val.map(r => { const t = r.reduce((a, b) => a + b, 0) || 1; return r.map(v => v / t); });
        const sums = val.map(r => r.reduce((a, b) => a + b, 0));
        const base = new Array(n).fill(0);
        if (offset === 'silhouette') sums.forEach((s, j) => { base[j] = -s / 2; });
        else if (offset === 'wiggle') { // Byron et Wattenberg : le moins de mouvement possible
            let y = 0;
            for (let j = 1; j < n; j++) { let s1 = 0, s2 = 0;
                for (let i = 0; i < m; i++) { const a = val[j][i], b = val[j - 1][i]; let s3 = (a - b) / 2; for (let k = 0; k < i; k++) s3 += val[j][k] - val[j - 1][k]; s1 += a; s2 += s3 * a; }
                if (s1) y -= s2 / s1; base[j] = y; }
            const mid = base.reduce((a, b, j) => a + b + sums[j] / 2, 0) / n; for (let j = 0; j < n; j++) base[j] -= mid;
        }
        let lo = Math.min(...base), hi = Math.max(...base.map((b, j) => b + sums[j]));
        if (!(hi > lo)) { lo = 0; hi = 1; }
        const showAxis = offset === 'zero' || offset === 'expand', tk = showAxis ? ticks(offset === 'expand' ? 0 : 0, offset === 'expand' ? 1 : hi, 4) : null;
        if (tk) { lo = tk.lo; hi = tk.hi; }
        const left = showAxis ? Math.max(...tk.ticks.map(v => textW(offset === 'expand' ? fmt(v * 100, 0) + ' %' : fmt(v), fs * .85))) + 10 : 4;
        const plotW = W - left - 6, plotH = clamp(num(o.height) || W * .42, 100, 1600), band = plotW / (n - 1);
        const X = j => left + j * band, Y = v => plotH - (v - lo) / (hi - lo) * plotH;
        let svg = tk ? yAxis(tk, left, 0, plotW, plotH, fs, v => offset === 'expand' ? fmt(v * 100, 0) + ' %' : fmt(v)) : '';
        const curvy = o.curve !== false, path = curvy ? smooth : line;
        let acc = base.slice();
        series.forEach((s, i) => {
            const bot = acc.map((b, j) => [X(j), Y(b)]), topP = acc.map((b, j) => [X(j), Y(b + val[j][i])]);
            svg += `<path d="${path(topP)}${path([...bot].reverse(), false)}Z" fill="${s.color}" fill-opacity="${r2(clamp(num(o.opacity ?? 90), 10, 100) / 100)}" stroke="${o.bg === 'transparent' ? 'none' : '#fff'}" stroke-width=".6">${tip(`${s.name} — ${cats.map((c, j) => `${c.label} : ${offset === 'expand' ? fmt(val[j][i] * 100, 1) + ' %' : fmt(val[j][i])}`).slice(0, 40).join(', ')}`)}</path>`;
            if (o.values !== false) { let best = -1, bw = 0; val.forEach((r, j) => { if (r[i] > bw) { bw = r[i]; best = j; } });
                const thick = bw / (hi - lo) * plotH, lx = clamp(X(best), left + textW(s.name, fs * .85) / 2 + 2, left + plotW - textW(s.name, fs * .85) / 2 - 2);
                if (best >= 0 && thick > fs * 1.15 && textW(s.name, fs * .85) < plotW * .45) svg += T(lx, Y(acc[best] + bw / 2), s.name, {size: fs * .85, anchor: 'middle', weight: 600, fill: contrast(s.color)}); }
            acc = acc.map((b, j) => b + val[j][i]);
        });
        const L = catLabels(cats.map(c => c.label), left - band / 2, band, plotH, fs);
        return {h: plotH + L.h, svg: svg + L.svg, legend: series.map(s => ({label: s.name, color: s.color}))};
    }

    /* ═════════ 📊 Histogramme (valeurs brutes rangées en tranches) ═════════ */
    function valuesOf(spec, max = 20000) {
        return rowsOf(spec, 'rows', max).filter(r => isNum(r.value)).map((r, i) => ({v: val(r.value), w: blank(r.count) ? 1 : clamp(num(r.count), 0, 1e7), label: String(r.label ?? ''), group: String(r.group ?? '').trim(), color: r.color, i}));
    }
    function histogram(spec, W, fs) {
        const o = spec.o || {}, vals = valuesOf(spec).filter(x => x.w > 0);
        if (!vals.length) return empty(W, fs, 'Ajoute des valeurs (une par ligne) : l’app les range dans les tranches.');
        let mn = Math.min(...vals.map(x => x.v)), mx = Math.max(...vals.map(x => x.v));
        let bw = num(o.bin) > 0 ? num(o.bin) : ticks(mn, mx === mn ? mn + 1 : mx, 12).step;
        if (!(bw > 0) || !Number.isFinite(bw)) bw = 1;
        bw = Math.max(bw, (mx - mn) / 399); // 400 tranches au plus
        let start = blank(o.start) || !isNum(o.start) ? Math.floor(mn / bw) * bw : val(o.start);
        if (start > mn) start = start - Math.ceil((start - mn) / bw) * bw;
        const nb = Math.max(1, Math.floor((mx - start) / bw + 1e-9) + 1), counts = new Array(nb).fill(0), who = Array.from({length: nb}, () => []);
        vals.forEach(x => { const k = clamp(Math.floor((x.v - start) / bw + 1e-9), 0, nb - 1); counts[k] += x.w; if (who[k].length < 6 && x.label) who[k].push(x.label); });
        const ints = vals.every(x => Number.isInteger(x.v)) && Number.isInteger(bw), u = unitOf(o);
        const range = k => { const a = start + k * bw; return ints && bw > 1 ? `${fmt(a)} à ${fmt(a + bw - 1)}${u}` : ints ? `${fmt(a)}${u}` : `${fmt(a)} à ${fmt(a + bw)}${u}`; };
        const tk = ticks(0, Math.max(1, ...counts), 5), left = Math.max(...tk.ticks.map(v => textW(fmt(v), fs * .85))) + 12;
        const plotW = W - left - 8, plotH = clamp(num(o.height) || W * .42, 100, 1600), band = plotW / nb, V = v => plotH - v / (tk.hi || 1) * plotH;
        const col = color(o.barColor, pick(spec, 0)), tot = counts.reduce((a, b) => a + b, 0);
        let svg = yAxis(tk, left, 0, plotW, plotH, fs);
        const pad = fs * (o.median || o.mean ? 1.6 : 1); // place pour les chiffres et les repères au-dessus des colonnes
        counts.forEach((c, k) => { if (!c) return; const x = left + k * band;
            svg += `<rect x="${r2(x + (band > 4 ? .5 : 0))}" y="${r2(V(c))}" width="${r2(Math.max(.5, band - (band > 4 ? 1 : 0)))}" height="${r2(plotH - V(c))}" fill="${col}">${tip(`${range(k)} : ${fmt(c)} (${fmt(c / tot * 100, 1)} %)${who[k].length ? ' — ' + who[k].join(', ') + (c > who[k].length ? '…' : '') : ''}`)}</rect>`;
            if (o.values !== false && band > textW(fmt(c), fs * .75) + 2) svg += T(x + band / 2, V(c) - fs * .55, fmt(c), {size: fs * .75, anchor: 'middle'}); });
        // repères des tranches : leurs bords, espacés pour rester lisibles
        const every = Math.max(1, Math.ceil(textW(fmt(start + nb * bw), fs * .85) * 1.6 / band));
        for (let k = 0; k <= nb; k += every) svg += `<line x1="${r2(left + k * band)}" y1="${r2(plotH)}" x2="${r2(left + k * band)}" y2="${r2(plotH + 4)}" stroke="currentColor" stroke-opacity=".5"/>` + T(left + k * band, plotH + fs, fmt(start + k * bw), {size: fs * .85, anchor: 'middle'});
        const sorted = vals.flatMap(x => x.w === 1 ? [x.v] : Array(Math.min(10000, Math.round(x.w))).fill(x.v)).slice(0, 200000).sort((a, b) => a - b);
        let marks = 0; const mark = (v, lab, dash) => { const x = left + (v - start) / (nb * bw) * plotW; return `<line x1="${r2(x)}" y1="${r2(-pad)}" x2="${r2(x)}" y2="${r2(plotH)}" stroke="currentColor" stroke-width="1.5" stroke-dasharray="${dash}"/>` + T(x + 4, -pad + fs * .6 + (marks++) * fs, `${lab} ${fmt(v, 1)}${u}`, {size: fs * .8, weight: 600}); };
        if (o.median && sorted.length) svg += mark(quant(sorted, .5), 'médiane', '5 4');
        if (o.mean && sorted.length) svg += mark(sorted.reduce((a, b) => a + b, 0) / sorted.length, 'moyenne', '2 3');
        let h = plotH + fs * 1.8;
        if (o.xLabel) { svg += T(left + plotW / 2, h + fs * .4, o.xLabel, {size: fs * .85, anchor: 'middle', weight: 600}); h += fs * 1.4; }
        return {h: h + pad, svg: `<g transform="translate(0 ${r2(pad)})">${svg}</g>`};
    }

    /* ═════════ 📦 Boîte à moustaches ═════════ */
    const ROMAN = {I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000};
    const romanN = s => { const m = String(s).toUpperCase().match(/^([IVXLCDM]+)E?\b/); if (!m) return null; let t = 0; [...m[1]].forEach((c, i, a) => { const v = ROMAN[c], n = ROMAN[a[i + 1]] || 0; t += v < n ? -v : v; }); return t; };
    function boxStats(vals, rule) {
        const s = vals.slice().sort((a, b) => a - b), q1 = quant(s, .25), md = quant(s, .5), q3 = quant(s, .75), iqr = q3 - q1;
        const lo = rule === 'minmax' ? s[0] : s.find(v => v >= q1 - 1.5 * iqr), hi = rule === 'minmax' ? s[s.length - 1] : [...s].reverse().find(v => v <= q3 + 1.5 * iqr);
        return {n: s.length, min: s[0], max: s[s.length - 1], q1, md, q3, lo, hi, mean: s.reduce((a, b) => a + b, 0) / s.length, out: rule === 'minmax' ? [] : s.filter(v => v < lo || v > hi)};
    }
    function boxplot(spec, W, fs) {
        const o = spec.o || {}, vals = valuesOf(spec), groups = new Map();
        vals.forEach(x => { const g = x.group || 'Toutes'; if (!groups.has(g)) { if (groups.size >= 40) return; groups.set(g, []); } groups.get(g).push(x); });
        if (!groups.size) return empty(W, fs, 'Ajoute des valeurs avec leur groupe (siècle, sexe…) : médiane et quartiles sont calculés.');
        const list = [...groups.entries()].map(([name, xs], i) => ({name, xs, st: boxStats(xs.map(x => x.v), o.whiskers), color: pick(spec, o.oneColor ? 0 : i, xs.find(x => x.color)?.color)}));
        const all = vals.map(x => x.v), tk = ticks(Math.min(...all), Math.max(...all), 5), u = unitOf(o), horiz = o.orient === 'h';
        const labW = horiz ? Math.min(W * .3, Math.max(...list.map(g => textW(g.name, fs))) + 12) : Math.max(...tk.ticks.map(v => textW(fmt(v), fs * .85))) + 12;
        const plotW = W - labW - 8, n = list.length;
        const plotH = horiz ? n * clamp(fs * 3.2, 24, 90) : clamp(num(o.height) || W * .42, 120, 1600);
        const P = v => (v - tk.lo) / (tk.hi - tk.lo || 1); // 0 → 1 le long de l'axe des valeurs
        const band = (horiz ? plotH : plotW) / n, bw = Math.min(band * .5, fs * 5);
        let svg = horiz ? xAxis(tk, labW, 0, plotW, plotH, fs, v => fmt(v)) : yAxis(tk, labW, 0, plotW, plotH, fs);
        const at = (c, v) => horiz ? [labW + P(v) * plotW, c] : [c, plotH - P(v) * plotH]; // c : milieu de la boîte (en travers)
        list.forEach((g, i) => {
            const c = band * (i + .5) + (horiz ? 0 : labW), s = g.st, col = g.color;
            const seg = (v1, v2, c1, c2) => { const [x1, y1] = at(c1, v1), [x2, y2] = at(c2, v2); return `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${col}" stroke-width="1.6"/>`; };
            if (o.points) g.xs.slice(0, 2000).forEach((x, k) => { const [px, py] = at(c + (jitter(x.i + k) - .5) * bw * .9, x.v); svg += `<circle cx="${r2(px)}" cy="${r2(py)}" r="${r2(Math.max(1.5, fs * .2))}" fill="${col}" fill-opacity=".45">${tip(`${x.label ? x.label + ' — ' : ''}${fmt(x.v)}${u}`)}</circle>`; });
            svg += seg(s.lo, s.q1, c, c) + seg(s.q3, s.hi, c, c) + seg(s.lo, s.lo, c - bw / 4, c + bw / 4) + seg(s.hi, s.hi, c - bw / 4, c + bw / 4);
            const [ax, ay] = at(c - bw / 2, s.q3), [bx, by] = at(c + bw / 2, s.q1);
            svg += `<rect x="${r2(Math.min(ax, bx))}" y="${r2(Math.min(ay, by))}" width="${r2(Math.abs(bx - ax))}" height="${r2(Math.max(1, Math.abs(by - ay)))}" fill="${col}" fill-opacity=".3" stroke="${col}" stroke-width="1.6">${tip(`${g.name} — ${s.n} valeur${s.n > 1 ? 's' : ''} : médiane ${fmt(s.md, 1)}${u}, quartiles ${fmt(s.q1, 1)} et ${fmt(s.q3, 1)}, de ${fmt(s.min, 1)} à ${fmt(s.max, 1)}${u}, moyenne ${fmt(s.mean, 1)}`)}</rect>`;
            svg += seg(s.md, s.md, c - bw / 2, c + bw / 2).replace('stroke-width="1.6"', 'stroke-width="3"');
            if (o.mean) { const [mx2, my2] = at(c, s.mean); svg += `<path d="M${r2(mx2)} ${r2(my2 - 5)}l5 5l-5 5l-5 -5z" fill="#fff" stroke="${col}" stroke-width="1.5">${tip(`moyenne ${fmt(s.mean, 1)}${u}`)}</path>`; }
            s.out.slice(0, 300).forEach(v => { const [px, py] = at(c, v), who = g.xs.find(x => x.v === v)?.label; svg += `<circle cx="${r2(px)}" cy="${r2(py)}" r="3" fill="none" stroke="${col}" stroke-width="1.4">${tip(`${who ? who + ' — ' : ''}${fmt(v)}${u} (valeur à part)`)}</circle>`; });
            if (o.values !== false) { const [tx, ty] = at(c + bw / 2 + 4, s.md); svg += horiz ? T(at(c, s.md)[0], c - bw / 2 - fs * .55, fmt(s.md, 1), {size: fs * .78, anchor: 'middle', weight: 600}) : T(tx, ty, fmt(s.md, 1), {size: fs * .78, weight: 600}); }
            if (horiz) svg += T(labW - 6, c - fs * .3, cut(g.name, labW - 8, fs), {size: fs, anchor: 'end'}) + T(labW - 6, c + fs * .75, `${s.n} val.`, {size: fs * .72, anchor: 'end', fill: '#888'});
            else svg += T(c, plotH + fs, cut(g.name, band - 2, fs * .9), {size: fs * .9, anchor: 'middle'}) + T(c, plotH + fs * 2.1, `${s.n} val.`, {size: fs * .72, anchor: 'middle', fill: '#888'});
        });
        let h = plotH + (horiz ? fs * 1.8 : fs * 2.8);
        if (o.yLabel) { svg += T(horiz ? labW + plotW / 2 : 2, horiz ? h + fs * .3 : -fs * .2, o.yLabel, {size: fs * .85, anchor: horiz ? 'middle' : 'start', weight: 600}); if (horiz) h += fs * 1.4; }
        const pad = horiz ? 0 : fs * (o.yLabel ? 1.4 : .8);
        return {h: h + pad, svg: `<g transform="translate(0 ${r2(pad)})">${svg}</g>`};
    }

    /* ═════════ 🏋️ Haltères (deux valeurs par ligne) ═════════ */
    function dumbbell(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec), u = unitOf(o);
        let list = cats.filter(c => c.v[0] !== null || c.v[1] !== null);
        if (!list.length) return empty(W, fs, 'Ajoute des lignes avec deux valeurs (ex. âge du mari, âge de la femme).');
        const gap = c => (c.v[1] ?? 0) - (c.v[0] ?? 0);
        if (o.sort === 'gap') list = [...list].sort((a, b) => gap(b) - gap(a)); else if (o.sort === 'a') list = [...list].sort((a, b) => (b.v[0] ?? 0) - (a.v[0] ?? 0)); else if (o.sort === 'b') list = [...list].sort((a, b) => (b.v[1] ?? 0) - (a.v[1] ?? 0));
        const all = list.flatMap(c => c.v.slice(0, 2).filter(v => v !== null)), tk = ticks(o.fromZero ? Math.min(0, ...all) : Math.min(...all), Math.max(...all), 5);
        const labW = Math.min(W * .34, Math.max(...list.map(c => textW(c.label, fs))) + 12), gapW = o.showGap === false ? 0 : textW('+999,9', fs * .8) + 12;
        const plotW = W - labW - gapW - 10, rowH = clamp(fs * 2.1, 14, 48), plotH = list.length * rowH, X = v => labW + (v - tk.lo) / (tk.hi - tk.lo || 1) * plotW;
        const ca = series[0]?.color || pick(spec, 0), cb = series[1]?.color || pick(spec, 1), rad = Math.min(rowH * .3, fs * .6);
        let svg = xAxis(tk, labW, 0, plotW, plotH, fs);
        list.forEach((c, i) => {
            const y = rowH * (i + .5), a = c.v[0], b = c.v[1];
            svg += T(labW - 6, y, cut(c.label, labW - 8, fs), {size: fs, anchor: 'end'});
            if (a !== null && b !== null) svg += `<line x1="${r2(X(a))}" y1="${r2(y)}" x2="${r2(X(b))}" y2="${r2(y)}" stroke="currentColor" stroke-opacity=".3" stroke-width="${r2(rad * .8)}" stroke-linecap="round"/>`;
            [[a, ca, series[0]?.name], [b, cb, series[1]?.name]].forEach(([v, col, name], k) => { if (v === null) return;
                svg += `<circle cx="${r2(X(v))}" cy="${r2(y)}" r="${r2(rad)}" fill="${col}">${tip(`${c.label} — ${name} : ${fmt(v)}${u}`)}</circle>`;
                if (o.values !== false) { const left = (k === 0) === ((a ?? 0) <= (b ?? 0)); svg += T(X(v) + (left ? -rad - 4 : rad + 4), y, fmt(v), {size: fs * .75, anchor: left ? 'end' : 'start', fill: col, weight: 600}); } });
            if (gapW && a !== null && b !== null) svg += T(W - 4, y, sgn(gap(c), 1), {size: fs * .8, anchor: 'end', weight: 600, fill: gap(c) > 0 ? cb : gap(c) < 0 ? ca : '#888'});
        });
        if (gapW) svg += T(W - 4, -fs * .1, 'écart', {size: fs * .72, anchor: 'end', fill: '#888'});
        let h = plotH + fs * 1.8;
        if (o.xLabel) { svg += T(labW + plotW / 2, h + fs * .3, o.xLabel, {size: fs * .85, anchor: 'middle', weight: 600}); h += fs * 1.4; }
        return {h, svg, legend: [{label: series[0]?.name || 'Avant', color: ca}, {label: series[1]?.name || 'Après', color: cb}]};
    }

    /* ═════════ ↗️ Pente avant / après ═════════ */
    function slope(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec), u = unitOf(o);
        const list = cats.filter(c => c.v[0] !== null && c.v[1] !== null);
        if (!list.length) return empty(W, fs, 'Ajoute des lignes avec une valeur « avant » et une valeur « après ».');
        const all = list.flatMap(c => [c.v[0], c.v[1]]); let lo = o.fromZero ? Math.min(0, ...all) : Math.min(...all), hi = Math.max(...all); if (hi === lo) { hi += 1; lo -= 1; }
        const lab = c => `${cut(c.label, W * .26, fs * .9)}`, labW = Math.min(W * .34, Math.max(...list.map(c => textW(lab(c) + ' 99 999', fs * .9))) + 12);
        const top = fs * 2.4, plotH = clamp(num(o.height) || Math.max(fs * 1.4 * list.length, W * .4), 120, 1600), xL = labW, xR = W - labW, Y = v => top + plotH - (v - lo) / (hi - lo) * plotH;
        const up = color(o.upColor, '#2e8b57'), down = color(o.downColor, '#d1495b'), flat = '#9aa0a6';
        let svg = `<line x1="${r2(xL)}" y1="${r2(top)}" x2="${r2(xL)}" y2="${r2(top + plotH)}" stroke="currentColor" stroke-opacity=".35"/><line x1="${r2(xR)}" y1="${r2(top)}" x2="${r2(xR)}" y2="${r2(top + plotH)}" stroke="currentColor" stroke-opacity=".35"/>`;
        svg += T(xL, fs * .8, cut(series[0]?.name || 'Avant', labW * 1.6, fs), {size: fs, anchor: 'middle', weight: 700}) + T(xR, fs * .8, cut(series[1]?.name || 'Après', labW * 1.6, fs), {size: fs, anchor: 'middle', weight: 700});
        const L = relax(list.map(c => ({c, y: Y(c.v[0])})), fs * 1.15, top, top + plotH), Rr = relax(list.map(c => ({c, y: Y(c.v[1])})), fs * 1.15, top, top + plotH);
        const colOf = c => o.colorBy === 'row' ? pick(spec, c.i, c.color) : (c.v[1] > c.v[0] ? up : c.v[1] < c.v[0] ? down : flat);
        const hi2 = String(o.highlight || '').trim().toLowerCase();
        list.forEach(c => { const col = colOf(c), dim = hi2 && !c.label.toLowerCase().includes(hi2), d = c.v[1] - c.v[0], pct = c.v[0] ? d / Math.abs(c.v[0]) * 100 : null;
            svg += `<g opacity="${dim ? .2 : 1}"><line x1="${r2(xL)}" y1="${r2(Y(c.v[0]))}" x2="${r2(xR)}" y2="${r2(Y(c.v[1]))}" stroke="${col}" stroke-width="2.4">${tip(`${c.label} : ${fmt(c.v[0])} → ${fmt(c.v[1])}${u} (${sgn(d)}${pct !== null ? `, ${sgn(pct, 1)} %` : ''})`)}</line><circle cx="${r2(xL)}" cy="${r2(Y(c.v[0]))}" r="4" fill="${col}"/><circle cx="${r2(xR)}" cy="${r2(Y(c.v[1]))}" r="4" fill="${col}"/></g>`; });
        L.forEach(it => { svg += T(xL - 8, it.ly, `${lab(it.c)} ${fmt(it.c.v[0])}`, {size: fs * .9, anchor: 'end', opacity: hi2 && !it.c.label.toLowerCase().includes(hi2) ? .35 : 1}); });
        Rr.forEach(it => { svg += T(xR + 8, it.ly, `${fmt(it.c.v[1])} ${lab(it.c)}`, {size: fs * .9, opacity: hi2 && !it.c.label.toLowerCase().includes(hi2) ? .35 : 1}); });
        return {h: top + plotH + fs * .8, svg};
    }

    /* ═════════ 🪜 Cascade (un total qui monte et descend) ═════════ */
    function waterfall(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 200).map((r, i) => ({label: String(r.label ?? ''), v: val(r.value), type: ['start', 'subtotal', 'total'].includes(r.type) ? r.type : '', color: r.color, i}));
        if (!list.length) return empty(W, fs, 'Ajoute des étapes : un départ, des hausses (+) et des baisses (−), des sous-totaux.');
        let run = 0; const bars = list.map(r => { let a, b;
            if (r.type === 'start') { a = 0; b = run = r.v; } else if (r.type) { a = 0; b = run; } else { a = run; b = run += r.v; }
            return {...r, a, b}; });
        const up = color(o.upColor, '#59a14f'), down = color(o.downColor, '#e15759'), tot = color(o.totalColor, '#4e79a7'), u = unitOf(o);
        const tk = ticks(Math.min(0, ...bars.map(b => Math.min(b.a, b.b))), Math.max(0, ...bars.map(b => Math.max(b.a, b.b))), 5);
        const left = Math.max(...tk.ticks.map(v => textW(fmt(v), fs * .85))) + 12, plotW = W - left - 6, plotH = clamp(num(o.height) || W * .42, 100, 1600), band = plotW / bars.length;
        const Y = v => plotH - (v - tk.lo) / (tk.hi - tk.lo || 1) * plotH;
        let svg = yAxis(tk, left, 0, plotW, plotH, fs), prevEnd = null;
        bars.forEach((b, i) => { const x = left + band * i + band * .14, w = band * .72, isTot = !!b.type, col = color(b.color, isTot ? tot : b.v >= 0 ? up : down);
            if (o.connectors !== false && prevEnd !== null) svg += `<line x1="${r2(x - band * .28)}" y1="${r2(Y(prevEnd))}" x2="${r2(x)}" y2="${r2(Y(prevEnd))}" stroke="currentColor" stroke-opacity=".45" stroke-dasharray="3 3"/>`;
            svg += `<rect x="${r2(x)}" y="${r2(Y(Math.max(b.a, b.b)))}" width="${r2(w)}" height="${r2(Math.max(1, Math.abs(Y(b.a) - Y(b.b))))}" fill="${col}" rx="2">${tip(`${b.label} : ${isTot ? fmt(b.b) : sgn(b.v)}${u}${isTot ? '' : ` → ${fmt(b.b)}`}`)}</rect>`;
            if (o.values !== false && w > textW(fmt(b.v), fs * .75) * .8) { const txt = isTot || b.type === 'start' ? fmt(b.b) : sgn(b.v), above = isTot || b.v >= 0; svg += T(x + w / 2, above ? Y(Math.max(b.a, b.b)) - fs * .6 : Y(Math.min(b.a, b.b)) + fs * .65, txt, {size: fs * .78, anchor: 'middle', weight: isTot ? 700 : 500}); }
            prevEnd = b.b; });
        const L = catLabels(bars.map(b => b.label), left, band, plotH, fs);
        return {h: plotH + L.h, svg: svg + L.svg, legend: [{label: 'Hausse', color: up}, {label: 'Baisse', color: down}, {label: 'Total / sous-total', color: tot}]};
    }

    /* ═════════ 🍭 Sucettes (horizontales ou verticales) ═════════ */
    function lollipop(spec, W, fs, vertical) {
        const o = spec.o || {}, {cats} = table(spec), u = unitOf(o);
        let list = cats.filter(c => c.v[0] !== null).map(c => ({...c, val: c.v[0]}));
        if (!list.length) return empty(W, fs, 'Ajoute des lignes : un nom et un nombre.');
        if (o.sort === 'desc') list = [...list].sort((a, b) => b.val - a.val); else if (o.sort === 'asc') list = [...list].sort((a, b) => a.val - b.val);
        const tk = ticks(Math.min(0, ...list.map(c => c.val)), Math.max(0, ...list.map(c => c.val)), 5), rad = clamp(num(o.dot) || fs * .55, 2, 30);
        const one = o.oneColor !== false, col = c => one ? color(c.color, color(o.dotColor, pick(spec, 0))) : pick(spec, c.i, c.color), P = v => (v - tk.lo) / (tk.hi - tk.lo || 1);
        let svg = '';
        if (!vertical) {
            const labW = Math.min(W * .34, Math.max(...list.map(c => textW(c.label, fs))) + 12), valW = o.values !== false ? textW(fmt(tk.hi) + u, fs * .8) + 10 : 6;
            const plotW = W - labW - valW, rowH = clamp(fs * 2, 12, 50), plotH = list.length * rowH, X = v => labW + P(v) * plotW;
            svg += xAxis(tk, labW, 0, plotW, plotH, fs);
            list.forEach((c, i) => { const y = rowH * (i + .5), cc = col(c);
                svg += T(labW - 6, y, cut(c.label, labW - 8, fs), {size: fs, anchor: 'end'}) + `<line x1="${r2(X(0))}" y1="${r2(y)}" x2="${r2(X(c.val))}" y2="${r2(y)}" stroke="${cc}" stroke-width="2"/><circle cx="${r2(X(c.val))}" cy="${r2(y)}" r="${r2(rad)}" fill="${cc}">${tip(`${c.label} : ${fmt(c.val)}${u}`)}</circle>`;
                if (o.values !== false) svg += T(X(c.val) + (c.val < 0 ? -rad - 4 : rad + 4), y, fmt(c.val) + u, {size: fs * .8, anchor: c.val < 0 ? 'end' : 'start'}); });
            return {h: plotH + fs * 1.8, svg};
        }
        const left = Math.max(...tk.ticks.map(v => textW(fmt(v), fs * .85))) + 12, plotW = W - left - 6, plotH = clamp(num(o.height) || W * .42, 100, 1600), band = plotW / list.length, Y = v => plotH - P(v) * plotH;
        svg += yAxis(tk, left, 0, plotW, plotH, fs);
        list.forEach((c, i) => { const x = left + band * (i + .5), cc = col(c);
            svg += `<line x1="${r2(x)}" y1="${r2(Y(0))}" x2="${r2(x)}" y2="${r2(Y(c.val))}" stroke="${cc}" stroke-width="2"/><circle cx="${r2(x)}" cy="${r2(Y(c.val))}" r="${r2(Math.min(rad, band * .45))}" fill="${cc}">${tip(`${c.label} : ${fmt(c.val)}${u}`)}</circle>`;
            if (o.values !== false && band > textW(fmt(c.val), fs * .75)) svg += T(x, Y(c.val) + (c.val < 0 ? rad + fs * .7 : -rad - fs * .6), fmt(c.val), {size: fs * .75, anchor: 'middle'}); });
        const L = catLabels(list.map(c => c.label), left, band, plotH, fs);
        return {h: plotH + L.h, svg: svg + L.svg};
    }

    /* ═════════ 🐝 Essaim de points (une personne = un point) ═════════ */
    /** place les points le long de l'axe sans qu'ils se touchent : chaque point prend la place libre la plus proche du milieu
     *  (les voisins déjà placés bloquent des intervalles ; on les fusionne et on prend le bord le plus proche de 0) */
    function swarm(xs, d) {
        const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), ys = new Array(xs.length).fill(0), placed = [];
        for (const [x, i] of order) {
            const iv = [];
            for (let k = placed.length - 1; k >= 0 && iv.length < 600; k--) { const p = placed[k], dx = x - p.x; if (dx >= d) break; const dy = Math.sqrt(d * d - dx * dx); iv.push([p.y - dy, p.y + dy]); }
            let y = 0;
            if (iv.length) {
                iv.sort((a, b) => a[0] - b[0]);
                let lo = iv[0][0], hi = iv[0][1];
                for (let k = 1; k <= iv.length; k++) {
                    if (k < iv.length && iv[k][0] < hi) { if (iv[k][1] > hi) hi = iv[k][1]; continue; }
                    if (lo < 0 && hi > 0) { y = -lo < hi ? lo : hi; break; } // 0 est pris : le bord libre le plus proche
                    if (k < iv.length) { lo = iv[k][0]; hi = iv[k][1]; }
                }
            }
            ys[i] = y; placed.push({x, y});
        }
        return ys;
    }
    /** beaucoup de points serrés : empilés par colonnes (tout de suite, sans calcul de voisins) */
    function stack(xs, d) {
        const col = new Map(), ys = new Array(xs.length);
        xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]).forEach(([x, i]) => { const c = Math.round(x / d), n = col.get(c) || 0; col.set(c, n + 1); ys[i] = (n % 2 ? -1 : 1) * Math.ceil(n / 2) * d; });
        return ys;
    }
    /** la plus haute colonne de points (pour choisir la taille avant de placer) */
    const densest = (xs, d) => { const m = new Map(); let mx = 0; xs.forEach(x => { const c = Math.floor(x / d), n = (m.get(c) || 0) + 1; m.set(c, n); if (n > mx) mx = n; }); return mx; };
    function beeswarm(spec, W, fs) {
        const o = spec.o || {}, vals = valuesOf(spec, 5000), u = unitOf(o);
        if (!vals.length) return empty(W, fs, 'Ajoute des valeurs : une ligne = une personne (nom, valeur, groupe).');
        const groups = [...new Set(vals.map(x => x.group).filter(Boolean))].slice(0, 30), gi = g => groups.indexOf(g);
        const tk = ticks(Math.min(...vals.map(x => x.v)), Math.max(...vals.map(x => x.v)), 6), left = 8, plotW = W - 16, X = v => left + (v - tk.lo) / (tk.hi - tk.lo || 1) * plotW;
        const maxH = clamp(num(o.height) || W * .5, 80, 1600);
        let rad = clamp(num(o.dot) || 5, 1.5, 20), ys = [], spread = 0;
        const xs = vals.map(x => X(x.v)), dOf = r => r * 2 + (r > 3 ? 1 : .4);
        for (let k = 0; k < 8 && rad > 1.5 && densest(xs, dOf(rad)) * dOf(rad) * .9 > maxH; k++) rad = Math.max(1.5, rad * .8); // trop serré : des points plus petits
        const dense = densest(xs, dOf(rad)) * dOf(rad) * .9 > maxH * 1.6; // même au plus petit, ça ne tient pas : on empile
        for (let tries = 0; tries < 3; tries++) {
            ys = dense ? stack(xs, dOf(rad)) : swarm(xs, dOf(rad)); spread = Math.max(0, ...ys.map(Math.abs)) * 2 + rad * 2;
            if (dense || spread <= maxH || rad <= 1.5) break; rad = Math.max(1.5, rad * Math.sqrt(maxH / spread) * .95);
        }
        const k = spread > maxH ? maxH / spread : 1, top = o.median !== false ? fs * 1.4 : 0, H = Math.max(Math.min(spread, maxH) + 4, fs * 4) + top, mid = top + (H - top) / 2;
        let svg = '<style>.lc-bs circle:hover{stroke:#000;stroke-width:2;stroke-opacity:1}</style>' + xAxis(tk, left, 0, plotW, H, fs, v => fmt(v));
        if (o.median !== false) { const s = vals.map(x => x.v).sort((a, b) => a - b), m = quant(s, .5); svg += `<line x1="${r2(X(m))}" y1="0" x2="${r2(X(m))}" y2="${r2(H)}" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/>` + T(X(m) + 4, fs * .6, `médiane ${fmt(m, 1)}${u}`, {size: fs * .8, weight: 600}); }
        svg += '<g class="lc-bs">' + vals.map((x, i) => { const c = x.color ? color(x.color, pick(spec, 0)) : pick(spec, groups.length ? gi(x.group) : 0);
            return `<circle cx="${r2(xs[i])}" cy="${r2(mid + ys[i] * k)}" r="${r2(rad)}" fill="${c}" fill-opacity=".85" stroke="${o.bg === 'transparent' ? 'none' : '#fff'}" stroke-width="${rad > 3 ? .8 : 0}">${tip(`${x.label || 'Sans nom'} — ${fmt(x.v)}${u}${x.group ? ` (${x.group})` : ''}`)}</circle>`; }).join('') + '</g>';
        let h = H + fs * 1.8;
        if (o.xLabel) { svg += T(left + plotW / 2, h + fs * .3, o.xLabel, {size: fs * .85, anchor: 'middle', weight: 600}); h += fs * 1.4; }
        const n = rowsOf(spec, 'rows', 1e6).length;
        if (n > 5000) { svg += T(left, h + fs * .3, `5 000 premiers points sur ${fmt(n, 0)}`, {size: fs * .75, fill: '#888'}); h += fs * 1.3; }
        return {h, svg, legend: groups.map(g => ({label: g, color: pick(spec, gi(g))}))};
    }

    /* ═════════ 🔲 Petites courbes en grille (small multiples) ═════════ */
    function smallMultiples(spec, W, fs) {
        const o = spec.o || {}, {series, cats} = table(spec);
        if (cats.length < 2) return empty(W, fs, 'Ajoute des périodes (lignes) et une colonne par petite courbe.');
        const cols = clamp(Math.round(num(o.cols)) || Math.floor(W / Math.max(150, fs * 15)), 1, Math.min(8, series.length)), gap = fs * 1.2;
        const cw = (W - gap * (cols - 1)) / cols, chH = clamp(num(o.chartHeight) || 110, 40, 400), head = fs * 1.7, foot = fs * 1.4, same = o.sameScale !== false;
        const allV = cats.flatMap(c => c.v.filter(v => v !== null)), gLo = Math.min(0, ...allV), gHi = Math.max(1e-9, ...allV);
        let svg = '';
        series.forEach((s, j) => {
            const x0 = (j % cols) * (cw + gap), y0 = Math.floor(j / cols) * (head + chH + foot + gap * .6), vs = cats.map(c => c.v[j]);
            const lv = vs.filter(v => v !== null), lo = same ? gLo : Math.min(0, ...lv), hi = same ? gHi : Math.max(1e-9, ...lv);
            const X = i => x0 + i * cw / (cats.length - 1), Y = v => y0 + head + chH - (v - lo) / (hi - lo || 1) * chH;
            svg += T(x0, y0 + fs * .7, cut(s.name, cw * .7, fs * .95), {size: fs * .95, weight: 700});
            svg += `<rect x="${r2(x0)}" y="${r2(y0 + head)}" width="${r2(cw)}" height="${r2(chH)}" fill="currentColor" fill-opacity=".035"/><line x1="${r2(x0)}" y1="${r2(Y(Math.max(lo, 0)))}" x2="${r2(x0 + cw)}" y2="${r2(Y(Math.max(lo, 0)))}" stroke="currentColor" stroke-opacity=".3"/>`;
            if (!same || j % cols === 0) svg += T(x0 + 3, y0 + head + fs * .55, fmt(hi), {size: fs * .7, fill: '#888'});
            const segs = []; let cur = []; vs.forEach((v, i) => { if (v === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(v)]); }); if (cur.length) segs.push(cur);
            segs.forEach(sg => { if (o.area !== false && sg.length > 1) svg += `<path d="${line(sg)}L${r2(sg[sg.length - 1][0])} ${r2(Y(Math.max(lo, 0)))}L${r2(sg[0][0])} ${r2(Y(Math.max(lo, 0)))}Z" fill="${s.color}" fill-opacity=".18"/>`; svg += `<path d="${line(sg)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round">${tip(`${s.name} : ${cats.map((c, i) => vs[i] === null ? '' : `${c.label} ${fmt(vs[i])}`).filter(Boolean).slice(0, 40).join(', ')}`)}</path>`; });
            const li = vs.map((v, i) => v === null ? -1 : i).filter(i => i >= 0).pop();
            if (li !== undefined) { svg += `<circle cx="${r2(X(li))}" cy="${r2(Y(vs[li]))}" r="3" fill="${s.color}"/>`; if (o.values !== false) svg += T(x0 + cw, y0 + fs * .7, fmt(vs[li]), {size: fs * .9, anchor: 'end', weight: 700, fill: s.color}); }
            svg += T(x0, y0 + head + chH + fs * .75, cut(cats[0].label, cw / 2 - 4, fs * .75), {size: fs * .75, fill: '#888'}) + T(x0 + cw, y0 + head + chH + fs * .75, cut(cats[cats.length - 1].label, cw / 2 - 4, fs * .75), {size: fs * .75, anchor: 'end', fill: '#888'});
        });
        const rowsN = Math.ceil(series.length / cols);
        return {h: rowsN * (head + chH + foot) + (rowsN - 1) * gap * .6, svg};
    }

    /* ═════════ 🔢 Cartes de chiffres (KPI) ═════════ */
    function kpi(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 48);
        if (!list.length) return empty(W, fs, 'Ajoute une carte : un nom, un chiffre (et la valeur d’avant, une mini-courbe, des seuils…).');
        const cols = clamp(Math.round(num(o.cols)) || Math.floor(W / Math.max(170, fs * 16)), 1, Math.min(6, list.length)), gap = fs;
        const cw = (W - gap * (cols - 1)) / cols, hasSpark = o.spark !== false && list.some(r => String(r.spark || '').trim()), ch = fs * 7.6 + (hasSpark ? fs * 3.2 : 0);
        const good = color(o.goodColor, '#2e8b57'), mid = color(o.midColor, '#e8a33d'), bad = color(o.badColor, '#d1495b'), neutral = color(o.accent, pick(spec, 0));
        let svg = '';
        list.forEach((r, i) => {
            const x = (i % cols) * (cw + gap), y = Math.floor(i / cols) * (ch + gap), lowBetter = r.better === 'low';
            const numeric = !blank(r.value) && /^[-+]?[\d\s\u00a0\u202f.,]+%?$/.test(String(r.value).trim()), v = val(r.value), prev = isNum(r.previous) ? val(r.previous) : null;
            let state = color(r.color, '') !== '' && r.color ? color(r.color) : null;
            if (!state && numeric && (!blank(r.good) || !blank(r.bad))) { const g = isNum(r.good) ? val(r.good) : null, b = isNum(r.bad) ? val(r.bad) : null;
                const ok = g !== null && (lowBetter ? v <= g : v >= g), ko = b !== null && (lowBetter ? v >= b : v <= b); state = ok ? good : ko ? bad : mid; }
            const accent = state || neutral;
            svg += `<g><rect x="${r2(x + .5)}" y="${r2(y + .5)}" width="${r2(cw - 1)}" height="${r2(ch - 1)}" rx="${r2(fs * .8)}" fill="${accent}" fill-opacity=".07" stroke="${accent}" stroke-opacity=".45"/><rect x="${r2(x + .5)}" y="${r2(y + fs * .9)}" width="${r2(fs * .35)}" height="${r2(ch - fs * 1.8)}" rx="${r2(fs * .17)}" fill="${accent}"/>`;
            const px = x + fs * 1.2, inner = cw - fs * 2;
            svg += T(px, y + fs * 1.5, cut(r.label || 'Chiffre', inner, fs), {size: fs, weight: 600, opacity: .85});
            const big = numeric ? fmt(v, clamp(Math.round(num(o.decimals ?? 1)), 0, 4)) : String(r.value ?? '—').slice(0, 24), unit = String(r.unit ?? '').slice(0, 16);
            const bigFs = Math.min(fs * 3, (inner - textW(unit, fs * 1.1) - 6) / Math.max(1, textW(big, 1)));
            svg += T(px, y + fs * 3.9, big, {size: bigFs, weight: 800, fill: accent}) + (unit ? T(px + textW(big, bigFs) + 5, y + fs * 4.3, unit, {size: fs * 1.1, weight: 600, opacity: .75}) : '');
            if (numeric && prev !== null) { const d = v - prev, pct = prev ? d / Math.abs(prev) * 100 : null, better = d === 0 ? null : (d > 0) !== lowBetter, tc = better === null ? '#888' : better ? good : bad;
                const txt = `${d > 0 ? '▲' : d < 0 ? '▼' : '▶'} ${o.delta === 'pct' && pct !== null ? sgn(pct, 1) + ' %' : o.delta === 'value' || pct === null ? sgn(d) : `${sgn(d)} (${sgn(pct, 1)} %)`}`;
                svg += T(px, y + fs * 6.1, cut(txt, inner * .62, fs * .95), {size: fs * .95, weight: 700, fill: tc}) + T(x + cw - fs * .8, y + fs * 6.1, cut(String(r.prevLabel || 'avant : ' + fmt(prev)), inner * .38, fs * .78), {size: fs * .78, anchor: 'end', opacity: .6}); }
            else if (r.note) svg += T(px, y + fs * 6.1, cut(r.note, inner, fs * .85), {size: fs * .85, opacity: .65});
            if (hasSpark) { const pts = String(r.spark || '').split(/[\s;|]+/).filter(isNum).slice(-200).map(val);
                if (pts.length > 1) { const lo = Math.min(...pts), hi = Math.max(...pts), sx = px, sw = inner - fs * .4, sy = y + fs * 7.2, sh = fs * 2.4, P = (p, k) => [sx + k * sw / (pts.length - 1), sy + sh - (hi > lo ? (p - lo) / (hi - lo) : .5) * sh], ps = pts.map(P);
                    svg += `<path d="${line(ps)}L${r2(ps[ps.length - 1][0])} ${r2(sy + sh)}L${r2(ps[0][0])} ${r2(sy + sh)}Z" fill="${accent}" fill-opacity=".14"/><path d="${line(ps)}" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linejoin="round">${tip(`${r.label || ''} : ${pts.map(p => fmt(p)).join(' · ')}`)}</path><circle cx="${r2(ps[ps.length - 1][0])}" cy="${r2(ps[ps.length - 1][1])}" r="2.8" fill="${accent}"/>`; } }
            svg += `${tip(`${r.label || ''} : ${big}${unit ? ' ' + unit : ''}${prev !== null && numeric ? ` (avant ${fmt(prev)})` : ''}`)}</g>`;
        });
        const rowsN = Math.ceil(list.length / cols);
        return {h: rowsN * ch + (rowsN - 1) * gap, svg};
    }

    /* ═════════ 🎯 Barre d'objectif (bullet chart) ═════════ */
    function bullet(spec, W, fs) {
        const o = spec.o || {}, list = rowsOf(spec, 'rows', 60).filter(r => !blank(r.value) || !blank(r.label));
        if (!list.length) return empty(W, fs, 'Ajoute une ligne : un nom, une valeur, un objectif (et des zones).');
        const u = String(o.unit ?? '').slice(0, 12), labW = Math.min(W * .32, Math.max(...list.map(r => textW(r.label, fs))) + 14), rightW = o.values !== false ? Math.min(W * .28, fs * 9) : 6;
        const plotW = Math.max(40, W - labW - rightW), bh = clamp(num(o.barHeight) || fs * 2, 10, 60), rowH = bh + fs * 1.3, zoneC = color(o.zoneColor, '#7f8c99'), valC = color(o.barColor, '#1d1d1f'), tgC = color(o.targetColor, '#d1495b');
        let svg = '';
        list.forEach((r, i) => {
            const v = val(r.value), tg = isNum(r.target) ? val(r.target) : null, zones = String(r.zones ?? '').split(/[\s;|/]+/).filter(isNum).map(val).sort((a, b) => a - b).slice(0, 6);
            const mx = val(r.max) > 0 ? val(r.max) : u.trim() === '%' ? Math.max(100, v, tg ?? 0) : ticks(0, Math.max(v, tg ?? 0, ...zones, 1), 4).hi, X = t => labW + clamp(t / mx, 0, 1) * plotW, y = i * rowH;
            const edges = [0, ...zones.filter(z => z > 0 && z < mx), mx];
            edges.slice(0, -1).forEach((a, k) => { svg += `<rect x="${r2(X(a))}" y="${r2(y)}" width="${r2(X(edges[k + 1]) - X(a))}" height="${r2(bh)}" fill="${zoneC}" fill-opacity="${r2(.5 - k * (.38 / Math.max(1, edges.length - 2)))}">${tip(`${r.label} — zone ${fmt(a)} à ${fmt(edges[k + 1])}${u}`)}</rect>`; });
            const col = color(r.color, valC);
            svg += `<rect x="${r2(labW)}" y="${r2(y + bh / 3)}" width="${r2(X(v) - labW)}" height="${r2(bh / 3)}" fill="${col}">${tip(`${r.label} : ${fmt(v)}${u}${tg !== null ? ` (objectif ${fmt(tg)}${u})` : ''}`)}</rect>`;
            if (tg !== null) svg += `<rect x="${r2(X(tg) - 1.5)}" y="${r2(y + bh * .12)}" width="3" height="${r2(bh * .76)}" fill="${tgC}">${tip(`objectif ${fmt(tg)}${u}`)}</rect>`;
            svg += T(labW - 8, y + bh / 2, cut(r.label, labW - 10, fs), {size: fs, anchor: 'end', weight: 600});
            if (o.values !== false) { const ok = tg === null ? null : v >= tg; svg += T(labW + plotW + 8, y + bh * .32, `${fmt(v)}${u}`, {size: fs * 1.05, weight: 800}) + (tg !== null ? T(labW + plotW + 8, y + bh * .32 + fs * 1.05, cut(`${ok ? '✓' : '→'} objectif ${fmt(tg)}${u}`, rightW - 10, fs * .75), {size: fs * .75, fill: ok ? '#2e8b57' : '#888'}) : ''); }
            if (o.scale !== false && i === list.length - 1) { ticks(0, mx, 4).ticks.filter(t => t <= mx).forEach(t => { svg += T(X(t), y + bh + fs * .75, fmt(t), {size: fs * .7, anchor: 'middle', fill: '#888'}); }); }
        });
        return {h: list.length * rowH + (o.scale !== false ? fs * .4 : 0), svg, legend: [{label: 'Valeur', color: valC}, {label: 'Objectif', color: tgC, type: 'line', width: 3}]};
    }

    /* ═════════ Données prises dans l'arbre ═════════ */
    const fetchN = (what, extra = {}) => A().api('diagram_numbers', {what, ...extra});
    const GENDER = [['', 'tout le monde'], ['female', 'les femmes'], ['male', 'les hommes']];
    const sourceKey = k => String(k || '').split(':');
    /** des valeurs (âges, années) → les lignes d'un histogramme, d'une boîte ou d'un essaim */
    const valuesSources = () => [['ages_death:', 'Âge au décès (tout le monde)'], ['ages_death:female', 'Âge au décès (les femmes)'], ['ages_death:male', 'Âge au décès (les hommes)'],
        ['ages_marriage:', 'Âge au mariage'], ['birth_years:', 'Années de naissance']];
    const centuryOrder = g => romanN(g) ?? 999;
    async function fillValues(spec, key, groupBy) {
        const [what, gender] = sourceKey(key), r = await fetchN(what, gender ? {gender} : {}), items = r.items || [];
        if (!items.length) throw new Error('Aucune donnée dans l’arbre pour ce choix (dates manquantes ?).');
        const g = groupBy === 'century' ? x => x.century : groupBy === 'sex' ? x => x.group : () => '';
        let rows = items.map(x => ({label: x.name, value: x.value, group: g(x)}));
        if (groupBy === 'century') rows.sort((a, b) => centuryOrder(a.group) - centuryOrder(b.group));
        const lbl = valuesSources().find(([k]) => k === key)?.[1] || '';
        spec.rows = rows; spec.o = {...(spec.o || {}), title: lbl + (groupBy === 'century' ? (what === 'ages_marriage' ? ', par siècle du mariage' : ', par siècle de naissance') : ''), unit: what === 'birth_years' ? '' : 'ans', source: `D’après ${fmt(r.total || items.length, 0)} personnes de l’arbre`};
        if (spec.kind === 'histogram') spec.o.bin = what === 'birth_years' ? 10 : 5;
        if (spec.kind === 'beeswarm') spec.o.xLabel = what === 'birth_years' ? 'Année de naissance' : lbl;
        return spec;
    }
    async function fillTable(spec, key) { // périodes × noms (courants, petites courbes)
        const [what, step] = sourceKey(key), r = await fetchN(what, step ? {step} : {});
        if (!r.rows?.length) throw new Error('Aucune donnée dans l’arbre pour ce choix.');
        spec.series = r.series.map(name => ({name})); spec.rows = r.rows;
        spec.o = {...(spec.o || {}), title: {occupations: 'Les métiers de la famille', births_places: 'Naissances par commune', births_surnames: 'Naissances par nom de famille'}[what] || '', subtitle: `par tranches de ${r.step} ans`, source: 'D’après les fiches de l’arbre'};
        return spec;
    }
    const APP = {
        bump: {sources: GENDER.map(([g, l]) => [`firstnames:${g}`, `Prénoms les plus donnés par décennie (${l})`]),
            fill: async (spec, key) => { const [, gender] = sourceKey(key), r = await fetchN('firstnames', gender ? {gender} : {}); if (!r.rows?.length) throw new Error('Pas assez de naissances datées.');
                const names = [...new Set(r.rows.map(x => x[1]))]; spec.series = r.periods.map(name => ({name}));
                spec.rows = names.map(n => { const row = {label: n}; r.periods.forEach((p, j) => { const hit = r.rows.find(x => x[0] === p && x[1] === n); row['s' + j] = hit ? hit[2] : ''; }); return row; });
                spec.o = {...(spec.o || {}), mode: 'value', top: 10, title: 'Les 10 prénoms les plus donnés par décennie', source: 'D’après les naissances de l’arbre'}; return spec; }},
        stream: {sources: [['occupations:25', 'Métiers (par 25 ans)'], ['occupations:50', 'Métiers (par 50 ans)'], ['births_surnames:10', 'Naissances par nom de famille (par décennie)'], ['births_places:25', 'Naissances par commune (par 25 ans)']], fill: fillTable},
        smallmult: {sources: [['births_surnames:10', 'Naissances par nom de famille (par décennie)'], ['births_places:10', 'Naissances par commune (par décennie)'], ['occupations:25', 'Métiers (par 25 ans)']], fill: fillTable},
        histogram: {sources: valuesSources(), fill: (s, k) => fillValues(s, k, '')},
        beeswarm: {sources: valuesSources(), fill: (s, k) => fillValues(s, k, 'sex')},
        boxplot: {sources: [['ages_death:', 'Âge au décès, par siècle de naissance'], ['ages_marriage:', 'Âge au mariage, par siècle'], ['ages_death:|sex', 'Âge au décès, femmes et hommes'], ['ages_marriage:|sex', 'Âge au mariage, femmes et hommes']],
            fill: (s, k) => fillValues(s, k.split('|')[0], k.endsWith('|sex') ? 'sex' : 'century')},
        dumbbell: {sources: [['couples:25', 'Âges des époux au mariage (25 couples les plus récents)'], ['couples:50', 'Âges des époux au mariage (50 couples)']],
            fill: async (spec, key) => { const r = await fetchN('couples'), n = Number(sourceKey(key)[1]) || 25; if (!r.items?.length) throw new Error('Aucun couple marié avec les deux dates de naissance.');
                spec.series = [{name: 'Lui', color: spec.series?.[0]?.color || '#4e79a7'}, {name: 'Elle', color: spec.series?.[1]?.color || '#e15759'}];
                spec.rows = r.items.slice(0, n).map(x => ({label: `${x.label} (${x.year})`, s0: x.a, s1: x.b})); spec.o = {...(spec.o || {}), title: 'Âge des époux au mariage', unit: 'ans', source: 'D’après les mariages de l’arbre'}; return spec; }},
        slope: {sources: [['births_places:100', 'Naissances par commune : un siècle et le suivant']],
            fill: async (spec) => { const r = await fetchN('births_places', {step: 100}); const rows = (r.rows || []).filter(x => r.series.some((_, j) => x['s' + j]));
                if (rows.length < 2) throw new Error('Il faut des naissances sur au moins deux siècles.');
                const a = rows[rows.length - 2], b = rows[rows.length - 1], cn = y => { const c = Math.floor((Number(y) - 1) / 100) + 2; return `${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'][c - 1] || c}e siècle`; };
                spec.series = [{name: cn(a.label)}, {name: cn(b.label)}]; spec.rows = r.series.map((name, j) => ({label: name, s0: a['s' + j] || 0, s1: b['s' + j] || 0}));
                spec.o = {...(spec.o || {}), title: 'Naissances par commune, d’un siècle à l’autre', source: 'D’après les naissances de l’arbre'}; return spec; }},
        waterfall: {sources: [['living:50', 'Naissances et décès dans l’arbre (par 50 ans)'], ['living:25', 'Naissances et décès dans l’arbre (par 25 ans)'], ['living:100', 'Naissances et décès dans l’arbre (par siècle)']],
            fill: async (spec, key) => { const r = await fetchN('living', {step: sourceKey(key)[1] || 50}); if (!r.rows?.length) throw new Error('Aucune naissance datée.');
                spec.rows = r.rows; spec.o = {...(spec.o || {}), title: 'Les vivants de l’arbre, période par période', subtitle: 'naissances (+) et décès (−) ; décès inconnu d’une naissance ancienne : compté 60 ans après', source: 'D’après les fiches de l’arbre'}; return spec; }},
        kpi: {sources: [['counters', 'Les compteurs de ma base (personnes, familles, médias…)']],
            fill: async (spec) => { const [r, s] = await Promise.all([fetchN('counters'), fetchN('sosa').catch(() => ({rows: []}))]);
                spec.rows = (r.items || []).map(x => ({label: x.label, value: x.value, previous: x.previous, prevLabel: 'il y a un mois', spark: (x.spark || []).join(' ')}));
                const g8 = (s.rows || []).filter(x => Number(String(x.label).replace(/\D/g, '')) <= 8), f = g8.reduce((a, x) => a + x.found, 0), e = g8.reduce((a, x) => a + x.expected, 0);
                if (e) spec.rows.push({label: 'Ancêtres trouvés (8 générations)', value: Math.round(f / e * 1000) / 10, unit: '%', good: 75, bad: 40, spark: g8.map(x => x.value).join(' '), note: `${f} sur ${e}`});
                spec.o = {...(spec.o || {}), title: 'Ma base en chiffres', subtitle: 'mini-courbes : les 12 derniers mois', source: ''}; return spec; }},
        bullet: {sources: [['sosa', 'Ancêtres trouvés par génération (SOSA)']],
            fill: async (spec) => { const r = await fetchN('sosa'); if (!r.rows?.length) throw new Error('Pas d’ascendance SOSA : choisis une personne de départ.');
                spec.rows = r.rows.map(x => ({label: x.label.replace('Génération', 'Génér.'), value: x.value, target: 75, max: 100, zones: '50;75'})); spec.o = {...(spec.o || {}), unit: ' %', title: 'Ancêtres trouvés, génération par génération', subtitle: r.root ? `à partir de ${r.root}` : '', source: 'Objectif : 75 % (à changer dans le tableau)'}; return spec; }},
    };

    /* ═════════ Les sortes : tableaux, réglages, exemples ═════════ */
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const O = {
        values: C('values', 'Afficher les valeurs', 'check', {def: true}), height: C('height', 'Hauteur du dessin (px)', 'range', {min: 80, max: 1600, step: 10, def: 380}),
        unit: C('unit', 'Unité (ex. : ans, personnes)'), xLabel: C('xLabel', 'Nom de l’axe des valeurs'), yLabel: C('yLabel', 'Nom de l’axe des valeurs'),
        highlight: C('highlight', 'Mettre en avant (un nom ; les autres pâlissent)'), fromZero: C('fromZero', 'Axe à partir de zéro', 'check'),
    };
    const TABLE = (label, first = 'Catégorie', n = true) => ({key: 'rows', label, series: n, cols: [C('label', first), C('color', 'Couleur', 'color')]});
    const VALUES = (label, group) => ({key: 'rows', label, cols: [C('label', 'Nom (personne…)'), C('value', 'Valeur', 'number'), ...(group ? [C('group', group)] : []), C('count', 'Combien de fois (vide = 1)', 'number'), C('color', 'Couleur', 'color')]});
    const decades = ['1850', '1860', '1870', '1880', '1890', '1900', '1910', '1920', '1930', '1940'];
    const SAMPLE_AGES = [0, 1, 2, 0, 3, 72, 68, 81, 77, 64, 59, 85, 90, 45, 38, 71, 66, 79, 83, 52, 74, 69, 88, 61, 57, 75, 80, 0, 1, 4, 33, 47, 62, 70, 73, 78, 84, 86, 91, 67, 76, 65, 58, 63, 82, 87, 23, 29, 41, 55, 68, 72, 74, 79];
    const FIRST = ['Jean', 'Marie', 'Pierre', 'Louis', 'Joseph', 'Anne', 'Jeanne', 'François', 'Louise', 'Marguerite', 'Henri', 'André', 'Germaine'];
    const NAMES = ['Jean Martin', 'Marie Durand', 'Pierre Petit', 'Anne Moreau', 'Louis Garnier', 'Jeanne Roux', 'Joseph Fournier', 'Rose Girard', 'François Bonnet', 'Louise Lambert'];
    const sample = {
        bump: () => { const trend = [[40, 12], [45, 20], [25, 10], [22, 15], [31, 5], [13, 6], [28, 17], [16, 3], [9, 17], [7, 19], [4, 22], [1, 25], [0, 15, 14]];
            return {o: {title: 'Les prénoms les plus donnés, décennie par décennie', top: 8, subtitle: 'rang de 1 (le plus donné) à 8 ; dans le tableau : le nombre de naissances'}, series: decades.map(name => ({name: name + 's'})),
                rows: FIRST.map((label, i) => { const [a, b, peak = 0] = trend[i], row = {label}; decades.forEach((_, j) => { row['s' + j] = Math.max(0, Math.round(a + (b - a) * j / 9 + peak * Math.sin(Math.PI * j / 9))); }); return row; })}; },
        stream: () => { const per = ['1750', '1775', '1800', '1825', '1850', '1875', '1900', '1925', '1950']; const jobs = [['Laboureur', [30, 34, 31, 26, 18, 11, 6, 3, 1]], ['Tisserand', [12, 15, 18, 14, 8, 3, 1, 0, 0]], ['Meunier', [3, 4, 4, 5, 4, 2, 1, 0, 0]], ['Ouvrier', [0, 1, 2, 6, 14, 20, 24, 18, 10]], ['Cheminot', [0, 0, 0, 0, 2, 6, 9, 8, 5]], ['Instituteur', [0, 0, 1, 1, 3, 5, 7, 9, 8]], ['Employé', [0, 0, 0, 1, 2, 5, 9, 15, 22]]];
            return {o: {title: 'Les métiers de la famille sur 200 ans', subtitle: 'nombre de personnes, par tranches de 25 ans'}, series: jobs.map(([name]) => ({name})), rows: per.map((label, j) => { const row = {label}; jobs.forEach(([, v], i) => { row['s' + i] = v[j]; }); return row; })}; },
        histogram: () => ({o: {title: 'Âge au décès', subtitle: 'par tranches de 5 ans', bin: 5, unit: 'ans', median: true}, rows: SAMPLE_AGES.map((value, i) => ({label: NAMES[i % NAMES.length], value}))}),
        boxplot: () => { const by = {'XVIIe s.': [19, 21, 22, 24, 25, 23, 27, 30, 20, 26, 35], 'XVIIIe s.': [22, 24, 25, 26, 27, 28, 25, 29, 31, 23, 40], 'XIXe s.': [21, 23, 24, 25, 26, 27, 28, 26, 30, 33, 24, 45], 'XXe s.': [22, 23, 24, 25, 26, 27, 28, 29, 31, 33, 35]};
            return {o: {title: 'Âge au mariage, par siècle', unit: 'ans', points: true}, rows: Object.entries(by).flatMap(([group, vs], k) => vs.map((value, i) => ({group, value, label: NAMES[(i + k) % NAMES.length]})))}; },
        dumbbell: () => ({o: {title: 'Âge des époux au mariage', unit: 'ans', sort: ''}, series: [{name: 'Lui', color: '#4e79a7'}, {name: 'Elle', color: '#e15759'}],
            rows: [['Jean et Marie (1789)', 27, 22], ['Pierre et Anne (1812)', 31, 24], ['Louis et Rose (1838)', 25, 26], ['Joseph et Jeanne (1861)', 34, 19], ['François et Louise (1889)', 28, 25], ['Henri et Germaine (1919)', 24, 21], ['André et Simone (1946)', 26, 23]].map(([label, s0, s1]) => ({label, s0, s1}))}),
        slope: () => ({o: {title: 'Naissances par commune, d’un siècle à l’autre'}, series: [{name: 'XVIIIe siècle'}, {name: 'XIXe siècle'}],
            rows: [['Rennes', 18, 42], ['Vitré', 25, 14], ['Fougères', 12, 15], ['Redon', 9, 3], ['Nantes', 4, 21], ['Saint-Malo', 7, 7]].map(([label, s0, s1]) => ({label, s0, s1}))}),
        waterfall: () => ({o: {title: 'Les vivants de la famille', subtitle: 'naissances (+), décès et départs (−)'}, rows: [['En 1800', 40, 'start'], ['Naissances 1800-1849', 85, ''], ['Décès 1800-1849', -60, ''], ['En 1850', '', 'subtotal'], ['Naissances 1850-1899', 70, ''], ['Départs (Amérique)', -15, ''], ['Décès 1850-1899', -52, ''], ['En 1900', '', 'total']].map(([label, value, type]) => ({label, value, type}))}),
        lollipop: () => ({o: {title: 'Métiers les plus fréquents', sort: 'desc'}, series: [{name: 'Personnes'}], rows: [['Laboureur', 64], ['Journalier', 41], ['Tisserand', 22], ['Domestique', 17], ['Meunier', 9], ['Charpentier', 7], ['Marchand', 6], ['Forgeron', 4]].map(([label, s0]) => ({label, s0}))}),
        lollipop_v: () => ({o: {title: 'Naissances par mois'}, series: [{name: 'Naissances'}], rows: ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'].map((label, i) => ({label, s0: [42, 45, 51, 39, 33, 30, 28, 31, 36, 40, 38, 44][i]}))}),
        beeswarm: () => ({o: {title: 'Âge au décès : une personne, un point', unit: 'ans', xLabel: 'Âge au décès', dot: 6}, rows: SAMPLE_AGES.map((value, i) => ({label: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` (${Math.floor(i / NAMES.length) + 1})` : ''), value, group: i % 2 ? 'Femmes' : 'Hommes'}))}),
        smallmult: () => { const per = ['1800', '1820', '1840', '1860', '1880', '1900', '1920', '1940']; const br = [['Martin', [4, 6, 9, 11, 8, 6, 3, 2]], ['Durand', [2, 3, 3, 5, 7, 9, 8, 6]], ['Petit', [7, 5, 4, 3, 2, 2, 1, 1]], ['Moreau', [1, 2, 4, 4, 5, 4, 5, 6]], ['Garnier', [3, 3, 2, 4, 6, 3, 2, 1]], ['Roux', [0, 1, 1, 2, 3, 5, 6, 8]]];
            return {o: {title: 'Naissances par branche', subtitle: 'tous les 20 ans, même échelle'}, series: br.map(([name]) => ({name})), rows: per.map((label, j) => { const row = {label}; br.forEach(([, v], i) => { row['s' + i] = v[j]; }); return row; })}; },
        kpi: () => ({o: {title: 'Ma généalogie en chiffres'}, rows: [
            {label: 'Personnes', value: 1284, previous: 1190, prevLabel: 'l’an dernier', spark: '980 1010 1040 1060 1090 1120 1150 1190 1210 1240 1262 1284'},
            {label: 'Familles', value: 432, previous: 415, prevLabel: 'l’an dernier', spark: '360 370 381 390 398 405 411 415 420 426 430 432'},
            {label: 'Ancêtres trouvés (8 générations)', value: 64, unit: '%', previous: 58, good: 75, bad: 40, spark: '41 44 47 50 52 55 58 60 61 62 63 64'},
            {label: 'Actes numérisés', value: 318, previous: 290, good: 300, bad: 150, spark: '120 150 180 200 230 250 270 290 300 305 312 318'},
            {label: 'Fiches sans source', value: 212, previous: 240, better: 'low', good: 100, bad: 300, spark: '320 310 300 290 280 270 260 250 240 230 220 212'},
            {label: 'Photos légendées', value: 88, unit: '%', previous: 88, prevLabel: 'pareil', spark: '70 72 75 78 80 82 85 86 87 88 88 88'}]}),
        bullet: () => ({o: {title: 'Ancêtres trouvés, génération par génération', unit: ' %', source: 'Objectif : 75 %'}, rows: [['Génér. 2 (parents)', 100], ['Génér. 3', 100], ['Génér. 4', 87.5], ['Génér. 5', 81], ['Génér. 6', 75], ['Génér. 7', 70], ['Génér. 8', 64], ['Génér. 9', 41]].map(([label, value]) => ({label, value, target: 75, max: 100, zones: '50;75'}))}),
    };
    const SORT_DUMB = C('sort', 'Ordre des lignes', 'select', {choices: [['', 'Comme dans le tableau'], ['gap', 'Par écart'], ['a', 'Par la 1re valeur'], ['b', 'Par la 2e valeur']]});
    const LOLLI = [O.values, C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['desc', 'Du plus grand au plus petit'], ['asc', 'Du plus petit au plus grand']]}), C('dot', 'Taille des ronds (px)', 'range', {min: 2, max: 30, def: 7}),
        C('oneColor', 'Une seule couleur', 'check', {def: true}), C('dotColor', 'Couleur', 'color', {def: '#4e79a7', when: s => s.o?.oneColor !== false}), O.unit];
    const KINDS = {
        bump: {icon: '🏁', label: 'Classement qui évolue (prénoms par décennie…)', group: 'Chiffres', render: bump, noLegend: true, table: true,
            grids: [TABLE('Les noms (lignes) et les périodes (colonnes)', 'Nom / prénom')],
            options: [C('mode', 'Les chiffres du tableau sont', 'select', {choices: [['', 'Des nombres : l’app calcule le rang'], ['rank', 'Déjà des rangs (1 = premier)']]}), C('top', 'Combien de rangs montrer', 'range', {min: 3, max: 30, def: 10}),
                C('rowHeight', 'Hauteur d’un rang (px)', 'range', {min: 14, max: 60, def: 28}), O.highlight]},
        stream: {icon: '🌊', label: 'Courants empilés (métiers sur 200 ans…)', group: 'Chiffres', render: stream, table: true,
            grids: [TABLE('Les périodes (lignes) et les catégories (colonnes)', 'Période')],
            options: [C('offset', 'Forme', 'select', {choices: [['wiggle', 'Courants (centrés, le moins de mouvement)'], ['silhouette', 'Centrés sur l’axe'], ['zero', 'Empilés sur le sol'], ['expand', 'En parts (100 %)']], def: 'wiggle'}),
                C('curve', 'Courbes arrondies', 'check', {def: true}), C('values', 'Noms dans les courants', 'check', {def: true}), C('opacity', 'Opacité (%)', 'range', {min: 10, max: 100, def: 90}), O.height]},
        histogram: {icon: '📶', label: 'Histogramme (valeurs rangées en tranches)', group: 'Chiffres', render: histogram, noLegend: true,
            grids: [VALUES('Les valeurs (une par ligne : l’app les range en tranches)')],
            options: [C('bin', 'Largeur des tranches (0 = automatique)', 'range', {min: 0, max: 100, step: 1, def: 0}), C('start', 'Début de la première tranche (vide = automatique)', 'number'), O.unit, C('barColor', 'Couleur des colonnes', 'color', {def: '#4e79a7'}),
                O.values, C('median', 'Montrer la médiane', 'check'), C('mean', 'Montrer la moyenne', 'check'), O.xLabel, O.height]},
        boxplot: {icon: '📦', label: 'Boîte à moustaches (médiane, quartiles)', group: 'Chiffres', render: boxplot, noLegend: true,
            grids: [VALUES('Les valeurs et leur groupe (médiane, quartiles et extrêmes sont calculés)', 'Groupe (siècle, sexe…)')],
            options: [C('orient', 'Sens', 'select', {choices: [['', 'Boîtes debout'], ['h', 'Boîtes couchées']]}), C('whiskers', 'Moustaches', 'select', {choices: [['', 'Jusqu’à 1,5 × l’écart des quartiles (valeurs à part en ronds)'], ['minmax', 'Du minimum au maximum']]}),
                C('points', 'Montrer chaque valeur (points)', 'check'), C('mean', 'Montrer la moyenne (◆)', 'check'), C('values', 'Écrire la médiane', 'check', {def: true}), C('oneColor', 'Une seule couleur', 'check'), O.unit, O.yLabel, O.height]},
        dumbbell: {icon: '🏋️', label: 'Haltères (deux valeurs par ligne)', group: 'Chiffres', render: dumbbell, table: true,
            grids: [{...TABLE('Les lignes et leurs deux valeurs', 'Nom'), series: 2}], options: [O.values, C('showGap', 'Écrire l’écart', 'check', {def: true}), SORT_DUMB, O.fromZero, O.unit, O.xLabel]},
        slope: {icon: '↗️', label: 'Pente avant / après', group: 'Chiffres', render: slope, noLegend: true, table: true,
            grids: [{...TABLE('Les lignes : la valeur avant, la valeur après', 'Nom'), series: 2}],
            options: [C('colorBy', 'Couleurs', 'select', {choices: [['', 'Hausse / baisse'], ['row', 'Une couleur par ligne']]}), C('upColor', 'Couleur des hausses', 'color', {def: '#2e8b57', when: s => s.o?.colorBy !== 'row'}), C('downColor', 'Couleur des baisses', 'color', {def: '#d1495b', when: s => s.o?.colorBy !== 'row'}),
                O.highlight, O.fromZero, O.unit, O.height]},
        waterfall: {icon: '🪜', label: 'Cascade (un total qui monte et descend)', group: 'Chiffres', render: waterfall,
            grids: [{key: 'rows', label: 'Les étapes (dans l’ordre)', cols: [C('label', 'Étape'), C('value', 'Valeur (+ ou −)', 'number'), C('type', 'Sorte', 'select', {choices: [['', 'Hausse ou baisse'], ['start', 'Départ'], ['subtotal', 'Sous-total (calculé)'], ['total', 'Total (calculé)']]}), C('color', 'Couleur', 'color')]}],
            options: [O.values, C('connectors', 'Traits entre les marches', 'check', {def: true}), C('upColor', 'Couleur des hausses', 'color', {def: '#59a14f'}), C('downColor', 'Couleur des baisses', 'color', {def: '#e15759'}), C('totalColor', 'Couleur des totaux', 'color', {def: '#4e79a7'}), O.unit, O.height]},
        lollipop: {icon: '🍭', label: 'Sucettes couchées', group: 'Chiffres', render: (s, W, fs) => lollipop(s, W, fs, false), noLegend: true, table: true, pairs: true, grids: [TABLE('Les chiffres', 'Catégorie', 1)], options: LOLLI},
        lollipop_v: {icon: '🍡', label: 'Sucettes debout', group: 'Chiffres', render: (s, W, fs) => lollipop(s, W, fs, true), noLegend: true, table: true, pairs: true, grids: [TABLE('Les chiffres', 'Catégorie', 1)], options: [...LOLLI, O.height]},
        beeswarm: {icon: '🐝', label: 'Essaim de points (une personne = un point)', group: 'Chiffres', render: beeswarm,
            grids: [VALUES('Les points (une ligne = une personne)', 'Groupe (couleur)')],
            options: [C('dot', 'Taille des points (px)', 'range', {min: 2, max: 20, def: 5}), C('median', 'Montrer la médiane', 'check', {def: true}), O.unit, O.xLabel, C('height', 'Hauteur au plus (px)', 'range', {min: 80, max: 1600, step: 10, def: 450})]},
        smallmult: {icon: '🔲', label: 'Petites courbes en grille', group: 'Chiffres', render: smallMultiples, noLegend: true, table: true,
            grids: [TABLE('Les périodes (lignes) et une colonne par petite courbe', 'Période')],
            options: [C('sameScale', 'Même échelle pour toutes', 'check', {def: true}), C('cols', 'Courbes par ligne (0 = automatique)', 'range', {min: 0, max: 8, def: 0}), C('chartHeight', 'Hauteur d’une courbe (px)', 'range', {min: 40, max: 400, def: 110}),
                C('area', 'Remplir sous la courbe', 'check', {def: true}), C('values', 'Écrire la dernière valeur', 'check', {def: true})]},
        kpi: {icon: '🔢', label: 'Cartes de chiffres (KPI)', group: 'Chiffres clés', render: kpi, noLegend: true,
            grids: [{key: 'rows', label: 'Les cartes', cols: [C('label', 'Nom'), C('value', 'Chiffre'), C('unit', 'Unité'), C('previous', 'Valeur d’avant (flèche, écart)', 'number'), C('prevLabel', 'Texte « avant » (ex. : l’an dernier)'),
                C('spark', 'Mini-courbe (chiffres séparés par des espaces)', 'text', {ph: '12 15 18 21'}), C('good', 'Seuil vert', 'number'), C('bad', 'Seuil rouge', 'number'), C('better', 'Mieux quand', 'select', {choices: [['', 'C’est plus haut'], ['low', 'C’est plus bas']]}), C('note', 'Petit texte'), C('color', 'Couleur (sinon selon les seuils)', 'color')]}],
            options: [C('cols', 'Cartes par ligne (0 = automatique)', 'range', {min: 0, max: 6, def: 0}), C('delta', 'Écart', 'select', {choices: [['', 'En valeur et en %'], ['value', 'En valeur'], ['pct', 'En %']]}), C('decimals', 'Chiffres après la virgule (au plus)', 'range', {min: 0, max: 4, def: 1}),
                C('spark', 'Mini-courbes', 'check', {def: true}), C('goodColor', 'Couleur « bien »', 'color', {def: '#2e8b57'}), C('midColor', 'Couleur « moyen »', 'color', {def: '#e8a33d'}), C('badColor', 'Couleur « à surveiller »', 'color', {def: '#d1495b'}), C('accent', 'Couleur sans seuil', 'color', {def: '#4e79a7'})]},
        bullet: {icon: '🎯', label: 'Barre d’objectif (valeur, objectif, zones)', group: 'Chiffres clés', render: bullet,
            grids: [{key: 'rows', label: 'Les barres', cols: [C('label', 'Nom'), C('value', 'Valeur', 'number'), C('target', 'Objectif', 'number'), C('max', 'Maximum (vide = auto)', 'number'), C('zones', 'Zones (seuils, ex. 50;75)', 'text', {ph: '50;75'}), C('color', 'Couleur', 'color')]}],
            options: [O.values, C('unit', 'Unité (ex. : %)'), C('barHeight', 'Épaisseur des barres (px)', 'range', {min: 10, max: 60, def: 24}), C('scale', 'Graduations sous la dernière barre', 'check', {def: true}),
                C('barColor', 'Couleur de la valeur', 'color', {def: '#1d1d1f'}), C('targetColor', 'Couleur de l’objectif', 'color', {def: '#d1495b'}), C('zoneColor', 'Couleur des zones', 'color', {def: '#7f8c99'})]},
    };
    for (const [k, kind] of Object.entries(KINDS)) { if (DR.KINDS[k]) continue; DR.KINDS[k] = {...kind, sample: sample[k], ...(APP[k] ? {app: APP[k]} : {})}; }
    // les sucettes se dessinent aussi à partir des statistiques de l'app (Éditeur de graphiques, « D'un graphique »)
    ['lollipop', 'lollipop_v'].forEach(k => ext.diagramKindsInternals?.PAIR_KINDS?.add(k));
    ext.diagramChiffres = {KINDS: Object.keys(KINDS), swarm, boxStats, quant, bump, histogram, APP};
})();
