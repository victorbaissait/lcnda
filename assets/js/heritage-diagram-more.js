/* LCNDA — 📊 Diagrammes en plus (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  Frises : 🧬 arbre en frise (vies par génération), 📉 naissances, décès et crises, 👨‍👩‍👧 âges comparés d'une fratrie,
 *           🔺 pyramide « qui vivait en … » (curseur des années, ▶ lecture) ;
 *  Généalogie : 🪗 arbre en accordéon (branches qu'on plie et déplie), 🧶 graphe des cousinages, 🔢 matrice de parenté,
 *           🌳 arbre des patronymes (transmission du nom), 🟩 quadrillage des ancêtres (clic : la fiche) ;
 *  Liens : 🎼 diagramme d'accord (mariages entre villages) ; Chiffres : 🎻 violon (répartition par catégorie).
 *  (La carte à symboles proportionnels est dans heritage-diagram-cartes.js, avec les fonds de carte.)
 * Chaque sorte : {icon, label, group, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp}.
 * Données de l'arbre : api.php?action=diagram_more (lib/diagram_more.php), diagram_genea (ascendance), diagram_numbers (âges).
 * Tout texte passe par esc() ; couleurs vérifiées (R.color) ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R?.KINDS) return;
    const A = () => window.LCNDA_APP;
    const K = R.KINDS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : R.num(v)), color = R.color;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = [0, 1, 2].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}));
    const fmt = (n, d = 1) => NF[clamp(d, 0, 2)].format(Number(n) || 0);
    const TAU = Math.PI * 2, NOW = new Date().getFullYear();
    const pal = spec => R.PALETTES[spec.o?.palette] || R.PALETTES.vive;
    const pick = (spec, i, c) => color(c, pal(spec)[((i % pal(spec).length) + pal(spec).length) % pal(spec).length]);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', rotate = 0, baseline = 'middle', style = '', op = 0, halo = ''} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}${rotate ? ` transform="rotate(${r2(rotate)} ${r2(x)} ${r2(y)})"` : ''}${style ? ` font-style="${style}"` : ''}${halo ? ` stroke="${halo}" stroke-width="${r2(size / 4)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const hex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); if (!a || !b) return t < .5 ? c1 : c2; return hex(a.map((v, i) => v + (b[i] - v) * clamp(t, 0, 1))); };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const rows = (spec, key = 'rows', max = 20000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object').slice(0, max);
    const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888'}), legend: [], desc: msg});
    const when = v => { const t = String(v ?? '').replace(/-00\b/g, '').trim(); if (!t) return null; const y = R.when(t, false); return y === null || !Number.isFinite(y) || y < -3000 || y > 3000 ? null : y; };
    const P = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const isNumText = v => /^\s*[-+]?[\d\s ]*[.,]?\d+\s*%?\s*$/.test(String(v ?? ''));
    const H_OPT = C('height', 'Hauteur au plus', 'number', {unit: 'px', min: 120, max: 3000});
    /** les années en bas : traits légers et nombres */
    function yearAxis(from, to, X, y0, h, fs, W) {
        const tk = R.ticks(from, to, clamp(Math.round(W / 80), 2, 24)); let s = '';
        tk.ticks.filter(v => v >= from - 1e-9 && v <= to + 1e-9).forEach(v => { const x = X(v); s += `<line x1="${r2(x)}" y1="${r2(y0)}" x2="${r2(x)}" y2="${r2(y0 + h)}" stroke="currentColor" stroke-opacity=".12"/>` + T(x, y0 + h + fs * .9, String(Math.round(v * 100) / 100), {size: fs * .85, anchor: 'middle'}); });
        return s;
    }
    const SEX = {h: ['Homme', '#4e79a7'], f: ['Femme', '#e15759'], '': ['Inconnu', '#9aa3ad']};
    const sexOf = v => { const t = String(v ?? '').trim().toLowerCase(); return /^(h|m|homme|male|masculin|garçon|♂)/.test(t) ? 'h' : /^(f|femme|female|féminin|fille|♀)/.test(t) ? 'f' : ''; };

    /* ═════════ 🧬 Arbre en frise : une barre par vie, rangées par génération ═════════ */
    const BRANCH = {pat: ['Branche paternelle', '#4e79a7'], mat: ['Branche maternelle', '#e15759'], root: ['Personne de départ', '#59a14f']};
    function genbars(spec, W, fs) {
        const o = spec.o || {};
        const list = rows(spec, 'rows', 3000).map((r, i) => {
            const s = Math.floor(num(r.sosa)), g = Math.floor(num(r.gen)) || (s >= 1 ? Math.floor(Math.log2(s)) + 1 : 1);
            let a = when(r.start), b = when(r.end), open = '';
            if (a === null && b === null) return null;
            if (a === null) { a = b - 30; open = 'start'; }
            if (b === null) { if (a > NOW - 100 && !/^\?/.test(str(r.end))) { b = NOW; open = 'living'; } else { b = a + 25; open = 'end'; } } // « ? » : décès inconnu
            if (b < a) [a, b] = [b, a];
            return {i, s, g: clamp(g, 1, 30), a, b, open, name: str(r.name, 120) || (s ? `Sosa ${s}` : '?'), group: str(r.group, 60), pid: Math.floor(num(r.pid)) || 0};
        }).filter(Boolean);
        if (!list.length) return empty(W, fs, 'Ajoute des personnes : un nom, une génération (ou un n° Sosa), une naissance et un décès.');
        const by = o.colorBy || 'branch', cats = new Map();
        const catOf = p => {
            if (by === 'group' || ((by === 'branch' || by === 'sex') && !p.s && p.group)) return p.group || 'Autres';
            if (by === 'sex') return p.s > 1 ? (p.s % 2 ? 'Femme' : 'Homme') : (p.group || 'Personne de départ');
            if (p.s === 1) return BRANCH.root[0];
            if (p.s >= 2) return (p.s >> Math.max(0, p.g - 2)) === 2 ? BRANCH.pat[0] : BRANCH.mat[0];
            return 'Autres';
        };
        const known = {[BRANCH.pat[0]]: BRANCH.pat[1], [BRANCH.mat[0]]: BRANCH.mat[1], [BRANCH.root[0]]: BRANCH.root[1], Homme: '#4e79a7', Femme: '#e15759', Autres: '#9aa3ad'};
        const colOf = c => { if (!cats.has(c)) cats.set(c, known[c] || pick(spec, cats.size)); return cats.get(c); };
        list.forEach(p => { p.cat = catOf(p); p.col = colOf(p.cat); });
        const evs = o.events === false ? [] : rows(spec, 'events', 60).map((e, i) => { const a = when(e.start), b = when(e.end); return a === null ? null : {a, b: b === null ? a + 1 : Math.max(a, b) + (Number.isInteger(b) ? 1 : 0), label: str(e.label, 60), col: color(e.color, ['#9c755f', '#b07aa1', '#76b7b2', '#edc948'][i % 4])}; }).filter(Boolean);
        let from = when(o.from) ?? Math.min(...list.map(p => p.a)), to = when(o.to) ?? Math.max(...list.map(p => p.b));
        if (to - from < 5) { from -= 3; to += 3; }
        const gens = [...new Set(list.map(p => p.g))].sort((x, y) => o.order === 'young' ? x - y : y - x);
        const rowsMode = o.layout === 'rows', bh = clamp(num(o.barHeight) || fs * 1.35, 4, 40), gap = Math.max(2, bh * .25);
        const nameW = rowsMode ? Math.min(W * .3, Math.max(...list.map(p => textW(p.name, fs * .85))) + 10) : 0, gutter = fs * 3.4;
        const x0 = gutter + nameW, pw = Math.max(40, W - x0 - 6), X = v => x0 + (clamp(v, from, to) - from) / (to - from) * pw;
        const evTop = evs.length ? Math.min(4, evs.length) * fs * 1.15 + 4 : 0;
        let y = evTop, body = '', bands = '';
        gens.forEach((g, gi) => {
            const ps = list.filter(p => p.g === g).sort((x, y2) => (x.s || 1e9) - (y2.s || 1e9) || x.a - y2.a);
            let lanes = [];
            if (rowsMode) ps.forEach((p, k) => { p.lane = k; }); else ps.sort((x, y2) => x.a - y2.a).forEach(p => { let l = lanes.findIndex(e => e + (to - from) * .004 < p.a); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = p.b; p.lane = l; });
            const n = rowsMode ? ps.length : Math.max(1, lanes.length), hh = n * (bh + gap) + gap;
            bands += `<rect x="0" y="${r2(y)}" width="${r2(W)}" height="${r2(hh)}" fill="${gi % 2 ? '#8881' : '#8880'}"/>` + T(4, y + hh / 2, `Gén. ${g}`, {size: fs * .8, weight: 600, fill: '#667'});
            ps.forEach(p => {
                const yy = y + gap + p.lane * (bh + gap), xa = X(p.a), xb = X(p.b), w = Math.max(1.5, xb - xa);
                const dates = `${Math.round(p.a)}${p.open === 'start' ? ' ?' : ''} – ${p.open === 'living' ? 'aujourd’hui' : p.open === 'end' ? '?' : Math.round(p.b)}`;
                const fade = p.open === 'end' || p.open === 'start';
                body += `<g${p.pid ? ` data-dmo-pid="${p.pid}" style="cursor:pointer"` : ''}><rect x="${r2(xa)}" y="${r2(yy)}" width="${r2(w)}" height="${r2(bh)}" rx="${r2(Math.min(3, bh / 3))}" fill="${p.col}"${fade ? ' fill-opacity=".35" stroke-dasharray="3 2"' : ''} stroke="${p.col}" stroke-width="${fade ? 1 : 0}">${tip(`${p.s ? `Sosa ${p.s} · ` : ''}${p.name} (${dates}) · ${p.cat}`)}</rect>`;
                if (rowsMode) body += T(x0 - 6, yy + bh / 2, cut(p.name, nameW - 8, fs * .85), {size: fs * .85, anchor: 'end'});
                else { const f = Math.min(fs * .8, bh * .8), t = cut(p.name, w - 6, f); if (t && o.labels !== false) body += T(xa + 3, yy + bh / 2, t, {size: f, fill: fade ? '#333' : contrast(p.col)}); }
                body += '</g>';
            });
            y += hh;
        });
        let ev = '';
        evs.forEach((e, i) => { const xa = X(e.a), xb = Math.max(xa + 1.5, X(e.b)); if (e.b < from || e.a > to) return;
            ev += `<rect x="${r2(xa)}" y="${r2(evTop)}" width="${r2(xb - xa)}" height="${r2(y - evTop)}" fill="${e.col}" fill-opacity=".14">${tip(e.label)}</rect><line x1="${r2(xa)}" x2="${r2(xa)}" y1="${r2((i % 4) * fs * 1.15 + fs * .9)}" y2="${r2(y)}" stroke="${e.col}" stroke-opacity=".7" stroke-dasharray="3 3"/>`;
            ev += T(Math.min(xa + 3, W - textW(e.label, fs * .78) - 2), (i % 4) * fs * 1.15 + fs * .55, e.label, {size: fs * .78, fill: e.col, weight: 600, halo: '#ffffffcc'}); });
        const axis = yearAxis(from, to, X, evTop, y - evTop, fs, pw);
        const legend = [...cats].map(([label, c]) => ({label, color: c}));
        return {h: y + fs * 1.6, svg: bands + axis + ev + body, legend, desc: `Arbre en frise : ${list.length} vies sur ${gens.length} générations, de ${Math.round(from)} à ${Math.round(to)}.`};
    }
    function sampleGen() {
        const F = ['Jean', 'Pierre', 'Louis', 'François', 'Joseph', 'Julien', 'René', 'Yves'], M = ['Marie', 'Anne', 'Jeanne', 'Rose', 'Perrine', 'Louise', 'Julienne', 'Hélène'], L = ['MARTIN', 'DURAND', 'PETIT', 'MOREAU', 'GARNIER', 'ROUX', 'FOURNIER', 'GIRARD'];
        const out = [];
        for (let s = 1; s < 32; s++) { const g = Math.floor(Math.log2(s)), b = 1985 - g * 30 - (s * 7) % 9, life = 38 + (s * 13) % 45; if (g >= 3 && s % 7 === 0) continue;
            out.push({sosa: s, name: `${(s % 2 && s > 1 ? M : F)[s % 8]} ${s % 2 && s > 1 ? L[(s * 3) % 8] : 'MARTIN'}`, start: String(b), end: s === 1 ? '' : String(Math.min(2020, b + life))}); }
        return out;
    }
    const EVENTS_FR = [['1789', '1799', 'Révolution'], ['1870', '1871', 'Guerre de 1870'], ['1914', '1918', 'Grande Guerre'], ['1939', '1945', 'Seconde Guerre mondiale']];

    /* ═════════ 📉 Naissances, décès et crises ═════════ */
    const CRISES = [['1693', '1694', 'Grande famine', '#b07aa1'], ['1709', '1710', 'Grand hiver', '#76b7b2'], ['1740', '1741', 'Disette', '#b07aa1'], ['1832', '', 'Choléra', '#f28e2b'], ['1849', '', 'Choléra', '#f28e2b'], ['1854', '', 'Choléra', '#f28e2b'],
        ['1870', '1871', 'Guerre de 1870', '#e15759'], ['1914', '1918', 'Grande Guerre', '#e15759'], ['1918', '1919', 'Grippe espagnole', '#edc948'], ['1939', '1945', 'Seconde Guerre mondiale', '#e15759']];
    const smooth = (a, k) => k < 2 ? a : a.map((_, i) => { let s = 0, n = 0; for (let j = i - Math.floor(k / 2); j <= i + Math.floor(k / 2); j++) if (j >= 0 && j < a.length) { s += a[j]; n++; } return s / n; });
    function crises(spec, W, fs) {
        const o = spec.o || {};
        const pts = rows(spec, 'rows', 3000).map(r => ({y: when(r.year), b: Math.max(0, num(r.births)), d: Math.max(0, num(r.deaths))})).filter(p => p.y !== null).sort((a, b) => a.y - b.y);
        if (!pts.length) return empty(W, fs, 'Ajoute des années avec leurs naissances et leurs décès.');
        const k = clamp(Math.round(num(o.smooth)), 0, 25), B = smooth(pts.map(p => p.b), k), D = smooth(pts.map(p => p.d), k);
        const from = when(o.from) ?? pts[0].y, to = Math.max(from + 1, when(o.to) ?? pts[pts.length - 1].y);
        const cr = o.crises === false ? [] : rows(spec, 'crises', 80).map(c => { const a = when(c.start), b = when(c.end); return a === null ? null : {a, b: (b === null ? a : Math.max(a, b)) + 1, label: str(c.label, 60), col: color(c.color, '#f28e2b')}; }).filter(c => c && c.b > from && c.a <= to);
        const lanes = []; cr.forEach(c => { const w = textW(c.label, fs * .78) + 8; let l = lanes.findIndex(e => e < c.a - 1e-9); c.w = w; c.l = l; });
        const H = clamp(num(o.height) || W * .45, 140, 2400), yl = Math.max(...[0, ...pts.map(p => Math.max(p.b, p.d))]), tk = R.ticks(0, Math.max(1, yl), 5);
        const labW = Math.max(...tk.ticks.map(v => textW(fmt(v), fs * .85))) + 10, pw = W - labW - 8, X = v => labW + (clamp(v, from, to) - from) / (to - from || 1) * pw;
        // étiquettes des crises sur des étages, sans chevauchement
        const ends = []; cr.forEach(c => { const x = X(c.a); let l = 0; while (l < 6 && (ends[l] ?? -1e9) > x - 2) l++; c.l = Math.min(l, 5); ends[c.l] = x + c.w; });
        const top = cr.length ? (Math.max(...cr.map(c => c.l)) + 1) * fs * 1.15 + 4 : 4, Y = v => top + H - v / (tk.hi || 1) * H;
        let svg = '';
        tk.ticks.forEach(v => { svg += `<line x1="${r2(labW)}" x2="${r2(labW + pw)}" y1="${r2(Y(v))}" y2="${r2(Y(v))}" stroke="currentColor" stroke-opacity="${v ? .1 : .4}"/>` + T(labW - 6, Y(v), fmt(v, 0), {size: fs * .85, anchor: 'end'}); });
        svg += yearAxis(from, to, X, top, H, fs, pw).replace(/stroke-opacity="\.12"/g, 'stroke-opacity=".06"');
        cr.forEach(c => { const xa = X(c.a), xb = Math.max(xa + 2, X(c.b));
            svg += `<rect x="${r2(xa)}" y="${r2(top)}" width="${r2(xb - xa)}" height="${r2(H)}" fill="${c.col}" fill-opacity=".18" data-dmo-crisis="">${tip(`${c.label} (${Math.round(c.a)}${c.b - c.a > 1 ? '–' + Math.round(c.b - 1) : ''})`)}</rect>`;
            svg += `<line x1="${r2(xa)}" x2="${r2(xa)}" y1="${r2(c.l * fs * 1.15 + fs * .9)}" y2="${r2(top)}" stroke="${c.col}" stroke-opacity=".6"/>` + T(Math.max(labW, Math.min(xa + 2, labW + pw - textW(c.label, fs * .78) - 2)), c.l * fs * 1.15 + fs * .55, c.label, {size: fs * .78, weight: 600, fill: mix(c.col, '#000000', .25)}); });
        const line = A0 => pts.map((p, i) => `${i ? 'L' : 'M'}${r2(X(p.y))} ${r2(Y(A0[i]))}`).join('');
        if (o.excess !== false) { // surmortalité : là où les décès dépassent les naissances
            const up = pts.map((p, i) => `${i ? 'L' : 'M'}${r2(X(p.y))} ${r2(Y(Math.max(B[i], D[i])))}`).join(''), back = pts.map((p, i) => `L${r2(X(p.y))} ${r2(Y(B[i]))}`).reverse().join('');
            svg += `<path d="${up}${back}Z" fill="#e15759" fill-opacity=".28" stroke="none"/>`;
        }
        const cb = color(o.birthColor, '#59a14f'), cd = color(o.deathColor, '#5f6b7a');
        svg += `<path d="${line(B)}" fill="none" stroke="${cb}" stroke-width="2.2" stroke-linejoin="round" data-dmo-line="births"/><path d="${line(D)}" fill="none" stroke="${cd}" stroke-width="2.2" stroke-linejoin="round" data-dmo-line="deaths"/>`;
        // une bulle par année (ou période) : naissances et décès
        const step = pts.length > 1 ? (pts[pts.length - 1].y - pts[0].y) / (pts.length - 1) : 1;
        pts.forEach((p, i) => { if (p.y < from || p.y > to) return; const xa = X(p.y - step / 2), xb = X(p.y + step / 2); svg += `<rect x="${r2(xa)}" y="${r2(top)}" width="${r2(Math.max(.5, xb - xa))}" height="${r2(H)}" fill="#fff" fill-opacity="0">${tip(`${Math.round(p.y)}${step > 1.5 ? '–' + Math.round(p.y + step - 1) : ''} : ${fmt(p.b, 0)} naissance${p.b > 1 ? 's' : ''}, ${fmt(p.d, 0)} décès`)}</rect>`; });
        if (o.yLabel) svg += T(labW, top - 2, o.yLabel, {size: fs * .8, fill: '#667', baseline: 'auto'});
        const legend = [{label: 'Naissances', color: cb, type: 'line', width: 3}, {label: 'Décès', color: cd, type: 'line', width: 3}, ...(o.excess !== false ? [{label: 'Plus de décès que de naissances', color: '#e1575966'}] : []),
            ...[...new Map(cr.map(c => [c.label, c.col])).entries()].slice(0, 8).map(([label, c]) => ({label, color: c + '55'}))];
        const tb = pts.reduce((s, p) => s + p.b, 0), td = pts.reduce((s, p) => s + p.d, 0);
        return {h: top + H + fs * 1.6, svg, legend: legend.map(l => ({...l, color: /^#[0-9a-f]{8}$/i.test(l.color) ? l.color : l.color})), desc: `${fmt(tb, 0)} naissances et ${fmt(td, 0)} décès de ${Math.round(from)} à ${Math.round(to)}, ${cr.length} crise${cr.length > 1 ? 's' : ''} marquée${cr.length > 1 ? 's' : ''}.`};
    }
    function sampleCrises() {
        const out = [];
        for (let y = 1680; y <= 1960; y++) {
            const base = 20 + Math.sin(y / 9) * 3 + (y > 1800 ? 6 : 0), noise = ((y * 7919) % 13) / 3;
            let d = 16 + noise + (y > 1850 ? -2 : 0);
            if (y === 1693 || y === 1694) d += 28; if (y === 1709 || y === 1710) d += 30; if (y === 1832) d += 18; if (y === 1849) d += 12; if (y >= 1914 && y <= 1918) d += 14; if (y === 1918) d += 9;
            const b = base + ((y * 104729) % 11) / 2 - (y >= 1915 && y <= 1918 ? 10 : 0);
            out.push({year: String(y), births: Math.round(b), deaths: Math.round(d)});
        }
        return out;
    }

    /* ═════════ 👨‍👩‍👧 Âges comparés d'une fratrie ═════════ */
    const listOf = v => String(v ?? '').split(/[,;]/).map(s => when(s)).filter(x => x !== null).slice(0, 40);
    function siblings(spec, W, fs) {
        const o = spec.o || {}, byYear = o.axis === 'year';
        const list = rows(spec, 'rows', 60).map((r, i) => {
            const b = when(r.birth); if (b === null) return null;
            let d = when(r.death), open = '';
            if (d === null) { if (/^(oui|vivant|vivante|yes|1|true)$/i.test(str(r.living)) || b > NOW - 100) { d = NOW + .5; open = 'living'; } else { d = b; open = 'unknown'; } }
            return {i, name: str(r.name, 80) || `Enfant ${i + 1}`, sex: sexOf(r.sex), b, d: Math.max(b, d), open, marr: listOf(r.marriages), kids: listOf(r.children), note: str(r.note, 120)};
        }).filter(Boolean);
        if (!list.length) return empty(W, fs, 'Ajoute les enfants : un nom, une naissance, un décès (et leurs mariages, leurs enfants).');
        if (o.order !== 'table') list.sort((a, b) => a.b - b.b);
        const maxAge = Math.max(10, ...list.map(p => (p.open === 'unknown' ? 0 : p.d - p.b)), ...list.flatMap(p => [...p.marr, ...p.kids].map(x => x - p.b)));
        const lo = byYear ? Math.min(...list.map(p => p.b)) : 0, hi = byYear ? Math.max(...list.map(p => p.d), ...list.flatMap(p => [...p.marr, ...p.kids])) : Math.ceil(maxAge / 10) * 10;
        const lab = p => `${list.indexOf(p) + 1}. ${p.name} (${Math.floor(p.b)})`;
        const labW = Math.min(W * .34, Math.max(...list.map(p => textW(lab(p), fs * .9))) + 10), pw = W - labW - fs * 4.5;
        const X = v => labW + (v - lo) / (hi - lo || 1) * pw, bh = clamp(fs * 1.5, 8, 34), rh = bh + fs * .9;
        let svg = '';
        const tk = R.ticks(lo, hi, clamp(Math.round(pw / 70), 2, 20));
        tk.ticks.filter(v => v >= lo && v <= hi).forEach(v => { svg += `<line x1="${r2(X(v))}" x2="${r2(X(v))}" y1="0" y2="${r2(list.length * rh)}" stroke="currentColor" stroke-opacity=".1"/>` + T(X(v), list.length * rh + fs * .9, byYear ? String(v) : `${v} ans`, {size: fs * .85, anchor: 'middle'}); });
        list.forEach((p, k) => {
            const y = k * rh + (rh - bh) / 2, at = v => X(byYear ? v : v - p.b), [sl, sc] = SEX[p.sex];
            const age = p.d - p.b, x1 = at(p.d), x0 = at(p.b);
            svg += T(labW - 8, y + bh / 2, cut(lab(p), labW - 10, fs * .9), {size: fs * .9, anchor: 'end'});
            if (p.open === 'unknown') svg += `<rect x="${r2(x0)}" y="${r2(y)}" width="${r2(Math.max(4, fs * 2))}" height="${r2(bh)}" fill="${sc}" fill-opacity=".2" stroke="${sc}" stroke-dasharray="3 2" rx="3">${tip(`${p.name} : décès inconnu`)}</rect>` + T(x0 + fs * 2 + 4, y + bh / 2, 'décès inconnu', {size: fs * .78, fill: '#777', style: 'italic'});
            else {
                svg += `<rect x="${r2(x0)}" y="${r2(y)}" width="${r2(Math.max(1.5, x1 - x0))}" height="${r2(bh)}" fill="${sc}" fill-opacity="${p.open === 'living' ? .6 : .85}" rx="3" data-dmo-bar="">${tip(`${p.name} (${sl}) : ${fmt(age, 0)} ans${p.open === 'living' ? ' (en vie)' : ''}${p.note ? ' — ' + p.note : ''}`)}</rect>`;
                svg += T(x1 + 5, y + bh / 2, p.open === 'living' ? `${Math.floor(age)} ans →` : `† ${Math.floor(age)} ans`, {size: fs * .8, fill: '#555'});
            }
            p.marr.forEach(m => { const x = at(m), c = y + bh / 2, s = bh * .42; svg += `<path d="M${r2(x)} ${r2(c - s)}L${r2(x + s)} ${r2(c)}L${r2(x)} ${r2(c + s)}L${r2(x - s)} ${r2(c)}Z" fill="#ffffff" stroke="#1d1d1f" stroke-width="1.4" data-dmo-marr="">${tip(`Mariage à ${Math.floor(m - p.b)} ans (${Math.floor(m)})`)}</path>`; });
            p.kids.forEach(m => { svg += `<circle cx="${r2(at(m))}" cy="${r2(y + bh / 2)}" r="${r2(bh * .2)}" fill="#1d1d1f" fill-opacity=".8" stroke="#fff" stroke-width=".8" data-dmo-kid="">${tip(`Naissance d’un enfant à ${Math.floor(m - p.b)} ans (${Math.floor(m)})`)}</circle>`; });
        });
        // les marques (mariage, enfant) expliquées sous le dessin
        let y = list.length * rh + fs * 2.2, x = labW;
        svg += `<path d="M${r2(x + 5)} ${r2(y - 5)}L${r2(x + 10)} ${r2(y)}L${r2(x + 5)} ${r2(y + 5)}L${r2(x)} ${r2(y)}Z" fill="#fff" stroke="#1d1d1f" stroke-width="1.4"/>` + T(x + 15, y, 'mariage', {size: fs * .85}); x += 15 + textW('mariage', fs * .85) + fs * 1.5;
        svg += `<circle cx="${r2(x + 4)}" cy="${r2(y)}" r="3.5" fill="#1d1d1f"/>` + T(x + 12, y, 'naissance d’un enfant', {size: fs * .85});
        const sexes = [...new Set(list.map(p => p.sex))];
        return {h: y + fs, svg, legend: sexes.map(s => ({label: SEX[s][0] === 'Inconnu' ? 'Sexe inconnu' : SEX[s][0], color: SEX[s][1]})), desc: `${list.length} enfants : de ${fmt(Math.min(...list.filter(p => p.open !== 'unknown').map(p => p.d - p.b)), 0)} à ${fmt(maxAge, 0)} ans.`};
    }
    const sampleSib = () => [['Jean', 'h', '1788', '1861', '1812, 1830', '1813, 1815, 1818, 1821'], ['Marie', 'f', '1790', '1790', '', ''], ['Pierre', 'h', '1791', '1813', '', ''], ['Anne', 'f', '1793', '1874', '1815', '1816, 1818, 1820, 1823, 1827'], ['Louis', 'h', '1796', '1832', '1824', '1825'], ['Rose', 'f', '1799', '1891', '1822', '1823, 1826, 1829, 1834'], ['Julien', 'h', '1802', '', '', '']]
        .map(([name, sex, birth, death, marriages, children]) => ({name, sex, birth, death, marriages, children}));

    /* ═════════ 🔺 Pyramide « qui vivait en … » ═════════ */
    /** chaque personne : [naissance, décès|null, sexe 1 homme / 2 femme, vivant] */
    function peopleOf(spec) {
        const out = []; const add = (b, d, g, l) => { if (b === null) return; out.push([b, d, g, l]); };
        rows(spec, 'rows', 20000).forEach(r => { const b = when(r.birth), d = when(r.death), s = sexOf(r.sex); add(b === null ? null : Math.floor(b), d === null ? null : Math.floor(d), s === 'h' ? 1 : s === 'f' ? 2 : 0, /^(oui|vivant|vivante|1)$/i.test(str(r.living)) ? 1 : 0); });
        (Array.isArray(spec.people) ? spec.people : []).slice(0, 40000).forEach(p => { if (Array.isArray(p) && Number.isFinite(p[0])) add(Math.floor(p[0]), Number.isFinite(p[1]) ? Math.floor(p[1]) : null, p[2] === 1 || p[2] === 2 ? p[2] : 0, p[3] ? 1 : 0); });
        return out;
    }
    function aliveCounts(people, year, band, nb, unknownAge, maxAge) {
        const m = new Array(nb).fill(0), f = new Array(nb).fill(0); let other = 0;
        for (const [b, d, g, l] of people) {
            if (b > year) continue;
            const end = d !== null ? d : l ? NOW : unknownAge > 0 ? b + unknownAge : -1e9;
            if (end < year) continue;
            const age = year - b; if (age > maxAge + band) continue;
            const i = Math.min(nb - 1, Math.floor(age / band));
            if (g === 1) m[i]++; else if (g === 2) f[i]++; else other++;
        }
        return {m, f, other};
    }
    function alivePyr(spec, W, fs) {
        const o = spec.o || {}, people = peopleOf(spec);
        if (!people.length) return empty(W, fs, 'Ajoute des personnes (naissance, décès, sexe) ou prends celles de ta base (« Depuis l’app »).');
        const band = [1, 2, 5, 10, 20].includes(num(o.band)) ? num(o.band) : 10, maxAge = clamp(num(o.maxAge) || 100, 20, 120), nb = Math.floor(maxAge / band) + 1, unknownAge = clamp(num(o.unknownAge), 0, 110);
        const lo = Math.min(...people.map(p => p[0])), hiB = Math.max(...people.map(p => p[0])), hi = Math.min(NOW, Math.max(hiB, ...people.map(p => p[1] ?? p[0])));
        const year = Math.round(clamp(num(o.year) || Math.round((lo + hi) / 2), lo, hi));
        const span = hi - lo, st = span <= 400 ? 1 : Math.ceil(span / 400);
        const years = [], frames = []; for (let y = lo; y <= hi; y += st) { years.push(y); frames.push({m: new Array(nb).fill(0), f: new Array(nb).fill(0), other: 0}); }
        // chaque vie n'est parcourue que sur les années où la personne vit (40 000 personnes : rapide)
        for (const [b, d, g, l] of people) {
            const end = Math.min(hi, d !== null ? d : l ? NOW : unknownAge > 0 ? b + unknownAge : -1e9, b + maxAge + band);
            for (let k = Math.max(0, Math.ceil((b - lo) / st)), y = lo + k * st; k < years.length && y <= end; k++, y += st) { const F = frames[k], i = Math.min(nb - 1, Math.floor((y - b) / band)); if (g === 1) F.m[i]++; else if (g === 2) F.f[i]++; else F.other++; }
        }
        let ci = years.indexOf(year);
        if (ci < 0) { ci = years.findIndex(y => y > year); if (ci < 0) ci = years.length; years.splice(ci, 0, year); frames.splice(ci, 0, aliveCounts(people, year, band, nb, unknownAge, maxAge)); }
        const cur = frames[ci];
        const fixed = o.fixedScale !== false, max = Math.max(1, ...(fixed ? frames : [cur]).flatMap(F => [...F.m, ...F.f]));
        const labels = Array.from({length: nb}, (_, i) => i === nb - 1 ? `${i * band} ans et +` : band === 1 ? `${i}` : `${i * band}–${i * band + band - 1}`);
        const labW = Math.max(...labels.map(l => textW(l, fs * .85))) + 14, half = (W - labW) / 2, bh = clamp((num(o.height) || W * .55) / nb - 2, 4, 30);
        const head = fs * 4.6, cM = color(o.menColor, '#4e79a7'), cF = color(o.womenColor, '#e15759'), vals = o.values !== false;
        let svg = T(W / 2, fs * 1.2, String(year), {size: fs * 2.2, anchor: 'middle', weight: 800}).replace('<text ', '<text data-dmo-pyy="" ');
        const total = c => c.m.reduce((a, b) => a + b, 0) + c.f.reduce((a, b) => a + b, 0);
        svg += T(W / 2, fs * 2.6, `${fmt(total(cur), 0)} personnes en vie`, {size: fs * .85, anchor: 'middle', fill: '#666'}).replace('<text ', '<text data-dmo-pyt="" ');
        svg += T(half - 6, head - fs * .3, 'Hommes', {size: fs * .9, anchor: 'end', weight: 600, fill: cM, baseline: 'auto'}) + T(half + labW + 6, head - fs * .3, 'Femmes', {size: fs * .9, weight: 600, fill: cF, baseline: 'auto'});
        for (let i = 0; i < nb; i++) {
            const y = head + (nb - 1 - i) * (bh + 2), wm = cur.m[i] / max * half, wf = cur.f[i] / max * half;
            svg += `<rect x="${r2(half - wm)}" y="${r2(y)}" width="${r2(wm)}" height="${r2(bh)}" fill="${cM}" data-pb="${i}" data-ps="m">${tip(`${labels[i]} : ${cur.m[i]} homme${cur.m[i] > 1 ? 's' : ''}`)}</rect>`;
            svg += `<rect x="${r2(half + labW)}" y="${r2(y)}" width="${r2(wf)}" height="${r2(bh)}" fill="${cF}" data-pb="${i}" data-ps="f">${tip(`${labels[i]} : ${cur.f[i]} femme${cur.f[i] > 1 ? 's' : ''}`)}</rect>`;
            svg += T(half + labW / 2, y + bh / 2, labels[i], {size: Math.min(fs * .85, bh * .95), anchor: 'middle'});
            if (vals) svg += T(half - wm - 4, y + bh / 2, cur.m[i] ? fmt(cur.m[i], 0) : '', {size: Math.min(fs * .78, bh), anchor: 'end'}).replace('<text ', `<text data-pv="${i}" data-ps="m" `) + T(half + labW + wf + 4, y + bh / 2, cur.f[i] ? fmt(cur.f[i], 0) : '', {size: Math.min(fs * .78, bh)}).replace('<text ', `<text data-pv="${i}" data-ps="f" `);
        }
        const data = {y: years, m: frames.map(F => F.m), f: frames.map(F => F.f), max, half, labW, vals, other: frames.map(F => F.other)};
        const out = `<g data-dmo-pyr="${esc(JSON.stringify(data))}">${svg}</g>`;
        return {h: head + nb * (bh + 2) + 4, svg: out, legend: [{label: 'Hommes', color: cM}, {label: 'Femmes', color: cF}], desc: `Pyramide des âges en ${year} : ${fmt(total(cur), 0)} personnes en vie (sur ${fmt(people.length, 0)}).`};
    }
    function samplePyr() {
        const out = []; let s = 7;
        const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        for (let i = 0; i < 260; i++) { const b = 1760 + Math.floor(rnd() * 160), life = rnd() < .25 ? Math.floor(rnd() * 5) : 20 + Math.floor(rnd() * 70); out.push({name: `Personne ${i + 1}`, sex: i % 2 ? 'f' : 'h', birth: String(b), death: String(Math.min(NOW, b + life))}); }
        return out;
    }

    /* ═════════ 🪗 Arbre en accordéon (cousins) ═════════ */
    const DEG_COL = ['#c9a227', '#c9a227', '#59a14f', '#f28e2b', '#4e79a7', '#edc948', '#76b7b2', '#ff9da7', '#b07aa1'];
    const degCol = d => d >= 99 || !Number.isFinite(d) ? '#9aa3ad' : DEG_COL[clamp(Math.round(d), 0, 8)];
    const DEG_NAME = d => d <= 1 ? 'Ligne directe' : d === 2 ? 'Frères et sœurs' : d === 3 ? 'Oncles, tantes, neveux' : d === 4 ? 'Cousins germains' : d === 6 ? 'Cousins issus de germains' : d === 8 ? 'Issus d’issus de germains' : d >= 99 ? 'Sans lien de sang' : `Degré ${d}`;
    /** l'arbre des lignes : clés (spec.rows[].key) ou noms ; boucles évitées */
    function treeOf(list) {
        const byKey = new Map(), byName = new Map();
        list.forEach(n => { if (n.key && !byKey.has(n.key)) byKey.set(n.key, n); if (!byName.has(n.name)) byName.set(n.name, n); });
        list.forEach(n => { const p = (n.pkey && byKey.get(n.pkey)) || (n.parent && byName.get(n.parent)) || null; n.up = p && p !== n ? p : null; n.kids = []; });
        list.forEach(n => { let x = n.up, k = 0; while (x && k++ < 200) { if (x === n) { n.up = null; break; } x = x.up; } if (n.up) n.up.kids.push(n); });
        return list.filter(n => !n.up);
    }
    function accordion(spec, W, fs) {
        const o = spec.o || {};
        const list = rows(spec, 'rows', 3000).map((r, i) => ({i, key: str(r.key, 40), pkey: str(r.pkey, 40), name: str(r.name, 120), parent: str(r.parent, 120), years: str(r.years, 40), kin: str(r.kin, 80), deg: r.degree === '' || r.degree === undefined ? (str(r.kin) ? 5 : 99) : num(r.degree), sex: sexOf(r.sex), pid: Math.floor(num(r.pid)) || 0})).filter(n => n.name);
        if (!list.length) return empty(W, fs, 'Ajoute des personnes : un nom, la personne au-dessus (vide pour le haut), les années, le lien.');
        list.forEach((n, i) => { n.id = n.key || 'n' + i; });
        const roots = treeOf(list), folded = new Set((Array.isArray(o.folded) ? o.folded : []).map(String)), openGen = num(o.open);
        const order = [], walk = (n, d, hidden) => { n.d = d; n.hidden = hidden; order.push(n); n.kids.forEach(k => walk(k, d + 1, hidden || folded.has(n.id) || (openGen > 0 && d + 1 >= openGen && !folded.has('+' + n.id)))); };
        roots.forEach(r => walk(r, 0, false));
        const rh = fs * 2.3, ind = clamp(num(o.indent) || fs * 1.7, 8, 80), tr = fs * .55, showKin = o.kin !== false;
        const count = n => n.kids.reduce((a, k) => a + 1 + count(k), 0);
        let svg = '', vis = 0;
        const yOf = new Map();
        order.forEach(n => { if (!n.hidden) { yOf.set(n, vis * rh); vis++; } });
        order.forEach((n, idx) => {
            const y = yOf.has(n) ? yOf.get(n) : 0, x = n.d * ind, isF = n.kids.length && (folded.has(n.id) || (openGen > 0 && n.d + 1 >= openGen && !folded.has('+' + n.id)));
            const c = degCol(n.deg), bx = x + tr * 2 + 4, name = n.name + (n.years ? `  ${n.years}` : '');
            const kinW = showKin && n.kin ? textW(n.kin, fs * .78) * 1.12 + 14 : 0, maxW = W - bx - 4;
            const nameT = cut(n.name, Math.max(30, maxW - kinW - textW(n.years, fs * .8) - 16), fs * .9);
            const boxW = Math.min(maxW, textW(nameT, fs * .9) * 1.1 + (n.years ? textW(n.years, fs * .8) * 1.08 + 8 : 0) + kinW + 16);
            const py = n.up && yOf.has(n.up) ? yOf.get(n.up) - y : 0, px = n.up ? n.up.d * ind + tr : 0;
            const link = n.up ? `<path data-acc-link="" d="M${r2(px)} ${r2(py + rh / 2 + tr)}V${r2(rh / 2)}H${r2(bx)}" fill="none" stroke="#9aa3ad" stroke-width="1.1"/>` : '';
            svg += `<g data-acc-row="${idx}" data-acc-key="${esc(n.id)}" data-acc-up="${n.up ? order.indexOf(n.up) : -1}" data-acc-d="${n.d}" data-acc-f="${isF ? 1 : 0}"${n.hidden ? ' display="none"' : ''} transform="translate(0 ${r2(y)})">${link}`;
            svg += `<g${n.pid ? ` data-dmo-pid="${n.pid}" style="cursor:pointer"` : ''}><rect x="${r2(bx)}" y="${r2(rh * .12)}" width="${r2(boxW)}" height="${r2(rh * .76)}" rx="${r2(rh * .2)}" fill="${mix(c, '#ffffff', .82)}" stroke="${c}" stroke-width="${n.deg <= 1 ? 2 : 1.2}">${tip(`${n.name}${n.years ? ' (' + n.years + ')' : ''}${n.kin ? ' — ' + n.kin : ''}`)}</rect>`;
            svg += T(bx + 7, rh / 2, nameT, {size: fs * .9, weight: n.deg === 0 ? 800 : 600, fill: '#1d1d1f'});
            let tx = bx + 7 + textW(nameT, fs * .9) * 1.1 + 6;
            if (n.years) { svg += T(tx, rh / 2, n.years, {size: fs * .8, fill: '#555'}); tx += textW(n.years, fs * .8) * 1.08 + 8; }
            if (showKin && n.kin) svg += `<rect x="${r2(tx - 2)}" y="${r2(rh / 2 - fs * .6)}" width="${r2(kinW - 6)}" height="${r2(fs * 1.2)}" rx="${r2(fs * .6)}" fill="${c}"/>` + T(tx + 4, rh / 2, n.kin, {size: fs * .78, fill: contrast(c), weight: 600});
            svg += '</g>';
            if (n.kids.length) svg += `<g data-acc-t="" style="cursor:pointer" role="button" aria-label="${isF ? 'Déplier' : 'Plier'} ${esc(n.name)}"><rect x="${r2(x - fs * 2.6)}" y="${r2(rh / 2 - tr - 2)}" width="${r2(fs * 2.6 + tr * 2 + 2)}" height="${r2(tr * 2 + 4)}" fill="#ffffff" fill-opacity="0"/><circle cx="${r2(x + tr)}" cy="${r2(rh / 2)}" r="${r2(tr)}" fill="#ffffff" stroke="#55606e" stroke-width="1.2"/>${T(x + tr, rh / 2 + .5, isF ? '+' : '−', {size: tr * 1.7, anchor: 'middle', weight: 700, fill: '#33404e'})}${T(x - 2, rh / 2, isF ? `+${count(n)}` : '', {size: fs * .7, anchor: 'end', fill: '#667'}).replace('<text ', '<text data-acc-n="" ')}${tip(isF ? `Déplier (${count(n)} personnes)` : 'Plier cette branche')}</g>`;
            svg += '</g>';
        });
        const degs = [...new Set(list.map(n => n.deg))].sort((a, b) => a - b).slice(0, 9);
        return {h: Math.max(rh, vis * rh) + 4, svg: `<g data-acc="" data-acc-rh="${r2(rh)}" data-acc-tr="${r2(tr)}" data-acc-ind="${r2(ind)}">${svg}</g>`, legend: showKin ? [...new Map(degs.map(d => [DEG_NAME(d), degCol(d)]))].map(([label, c]) => ({label, color: c})) : [], desc: `Arbre en accordéon : ${list.length} personnes, ${roots.length} sommet${roots.length > 1 ? 's' : ''}.`};
    }
    function sampleAcc() {
        const R0 = [['Jean MARTIN × Marie DURAND', '', '1820–1890', 'arrière-grand-père', 3], ['Pierre MARTIN', 'Jean MARTIN × Marie DURAND', '1848–1920', 'grand-père', 2], ['Louis MARTIN', 'Pierre MARTIN', '1875–1950', 'père', 1], ['Moi', 'Louis MARTIN', '1905', 'moi', 0],
            ['Anne MARTIN', 'Louis MARTIN', '1908–1990', 'sœur', 2], ['Rose MARTIN', 'Pierre MARTIN', '1878–1960', 'tante', 3], ['Paul ROBIN', 'Rose MARTIN', '1902–1980', 'cousin germain', 4], ['Lucie ROBIN', 'Rose MARTIN', '1906–1995', 'cousine germaine', 4],
            ['Joseph MARTIN', 'Jean MARTIN × Marie DURAND', '1852–1915', 'grand-oncle', 4], ['Yves MARTIN', 'Joseph MARTIN', '1880–1944', 'cousin germain de mon père', 5], ['René MARTIN', 'Yves MARTIN', '1908–1986', 'cousin issu de germains', 6], ['Hélène MARTIN', 'Yves MARTIN', '1911–2001', 'cousine issue de germains', 6]];
        return R0.map(([name, parent, years, kin, degree]) => ({name, parent, years, kin, degree}));
    }

    /* ═════════ 🧶 Graphe des cousinages ═════════ */
    const KIN_COL = {'frères et sœurs': '#59a14f', 'cousins germains': '#4e79a7', 'cousins issus de germains': '#76b7b2', 'cousins issus d’issus de germains': '#b07aa1', 'parent et enfant': '#c9a227', 'oncle ou tante et neveu ou nièce': '#f28e2b', 'à la mode de Bretagne': '#edc948', 'époux': '#ff9da7'};
    const LAYOUT = new Map();
    function forceLayout(n, edges, key) {
        const hit = LAYOUT.get(key); if (hit) return hit;
        const x = new Float64Array(n), y = new Float64Array(n), dx = new Float64Array(n), dy = new Float64Array(n), k = 1 / Math.sqrt(Math.max(1, n));
        for (let i = 0; i < n; i++) { const r = Math.sqrt(i + .5) / Math.sqrt(n), t = i * 2.399963; x[i] = r * Math.cos(t); y[i] = r * Math.sin(t); }
        const it = n > 120 ? 160 : 320;
        for (let s = 0; s < it; s++) {
            dx.fill(0); dy.fill(0);
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let ux = x[i] - x[j], uy = y[i] - y[j], d2 = ux * ux + uy * uy; if (d2 < 1e-9) { ux = 1e-3 * (i - j); uy = 1e-3; d2 = 1e-6; } const f = k * k / d2; dx[i] += ux * f; dy[i] += uy * f; dx[j] -= ux * f; dy[j] -= uy * f; }
            for (const [i, j, w] of edges) { const ux = x[i] - x[j], uy = y[i] - y[j], d = Math.sqrt(ux * ux + uy * uy) || 1e-4, f = d / k * w; dx[i] -= ux * f; dy[i] -= uy * f; dx[j] += ux * f; dy[j] += uy * f; }
            const t = .1 * (1 - s / it) + .004;
            for (let i = 0; i < n; i++) { dx[i] -= x[i] * .08 / k; dy[i] -= y[i] * .08 / k; const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1, m = Math.min(d, t); x[i] += dx[i] / d * m; y[i] += dy[i] / d * m; }
        }
        const out = {x, y}; LAYOUT.set(key, out); if (LAYOUT.size > 30) LAYOUT.delete(LAYOUT.keys().next().value);
        return out;
    }
    function cousinage(spec, W, fs) {
        const o = spec.o || {}, nodes = [], idx = new Map();
        const add = (name, group = '', root = false) => { const k = name.toLowerCase(); if (idx.has(k)) { const n = nodes[idx.get(k)]; if (group && !n.group) n.group = group; if (root) n.root = true; return idx.get(k); } if (nodes.length >= 150) return -1; idx.set(k, nodes.length); nodes.push({name, group, root, deg: 0}); return nodes.length - 1; };
        rows(spec, 'nodes', 150).forEach(r => { const n = str(r.name, 100); if (n) add(n, str(r.group, 60), r.root === true || r.root === 'oui'); });
        const links = [];
        rows(spec, 'rows', 1500).forEach(r => { const a = str(r.a, 100), b = str(r.b, 100); if (!a || !b || a.toLowerCase() === b.toLowerCase()) return; const i = add(a), j = add(b); if (i < 0 || j < 0) return; links.push({i, j, kind: str(r.kind, 60)}); nodes[i].deg++; nodes[j].deg++; });
        if (!links.length) return empty(W, fs, 'Ajoute des liens : deux personnes et leur lien (cousins germains…), ou prends-les dans ta base.');
        const kinds = [...new Set(links.map(l => l.kind))], kc = new Map(kinds.map((k, i) => [k, KIN_COL[k.toLowerCase()] || pick(spec, i + 3)]));
        const groups = [...new Set(nodes.map(n => n.group).filter(Boolean))], gc = new Map(groups.map((g, i) => [g, pick(spec, i)]));
        const key = nodes.map(n => n.name).join('\u0001') + '|' + links.map(l => l.i + ',' + l.j).join(';') + '|' + (o.strength || '');
        const L = forceLayout(nodes.length, links.map(l => [l.i, l.j, Math.min(2, .6 + 3 / (1 + (DEG_ORDER(l.kind))))]), key);
        const H = clamp(num(o.height) || Math.round(W * .62), 220, 2400), pad = fs * 3;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < nodes.length; i++) { x0 = Math.min(x0, L.x[i]); x1 = Math.max(x1, L.x[i]); y0 = Math.min(y0, L.y[i]); y1 = Math.max(y1, L.y[i]); }
        const s = Math.min((W - pad * 2) / Math.max(1e-6, x1 - x0), (H - pad * 2) / Math.max(1e-6, y1 - y0)), X = i => W / 2 + (L.x[i] - (x0 + x1) / 2) * s, Y = i => H / 2 + (L.y[i] - (y0 + y1) / 2) * s;
        const showEdge = o.edgeLabels === 'none' ? false : o.edgeLabels === 'all' || links.length <= 60;
        let edges = '', labs = '', pts = ''; const placedL = [];
        links.forEach(l => { const c = kc.get(l.kind); edges += `<line x1="${r2(X(l.i))}" y1="${r2(Y(l.i))}" x2="${r2(X(l.j))}" y2="${r2(Y(l.j))}" stroke="${c}" stroke-width="2.2" stroke-opacity=".75" data-dmo-edge="">${tip(`${nodes[l.i].name} — ${nodes[l.j].name} : ${l.kind || 'lien'}`)}</line>`;
            const mx = (X(l.i) + X(l.j)) / 2, my = (Y(l.i) + Y(l.j)) / 2, lw = textW(cut(l.kind, fs * 10, fs * .7), fs * .7) / 2 + 2, bx0 = [mx - lw, my - fs * .45, mx + lw, my + fs * .45];
            if (showEdge && l.kind && !placedL.some(b => !(bx0[2] < b[0] || bx0[0] > b[2] || bx0[3] < b[1] || bx0[1] > b[3]))) placedL.push(bx0); else return;
            labs += T((X(l.i) + X(l.j)) / 2, (Y(l.i) + Y(l.j)) / 2, cut(l.kind, fs * 10, fs * .7), {size: fs * .7, anchor: 'middle', fill: mix(c, '#000000', .35), halo: '#ffffffd9'}); });
        nodes.forEach((n, i) => { const r = n.root ? fs * .85 : fs * (.45 + .25 * Math.min(1, n.deg / 6)), c = o.colorBy === 'none' ? '#55606e' : n.group ? gc.get(n.group) : '#9aa3ad';
            pts += `<g transform="translate(${r2(X(i))} ${r2(Y(i))})"><circle r="${r2(r)}" fill="${c}" stroke="${n.root ? '#1d1d1f' : '#fff'}" stroke-width="${n.root ? 2.5 : 1.4}">${tip(`${n.name}${n.group ? ' · ' + n.group : ''} : ${n.deg} lien${n.deg > 1 ? 's' : ''}`)}</circle>${T(0, r + fs * .75, cut(n.name, fs * 11, fs * .82), {size: fs * .82, anchor: 'middle', weight: n.root ? 800 : 500, halo: '#ffffffcc'})}</g>`; });
        const legend = kinds.filter(Boolean).slice(0, 12).map(k => ({label: k, color: kc.get(k), type: 'line', width: 3}));
        return {h: H, svg: `<g data-dmo-net="">${edges}${labs}${pts}</g>`, legend, desc: `Graphe des cousinages : ${nodes.length} personnes, ${links.length} liens.`};
    }
    const DEG_ORDER = k => { const t = String(k).toLowerCase(); return /frères|sœurs|parent et/.test(t) ? 0 : /oncle|bretagne/.test(t) ? 1 : /germains$/.test(t) && !/issus/.test(t) ? 2 : /issus de germains/.test(t) ? 3 : 4; };
    const sampleCous = () => {
        const L0 = [['Moi', 'Anne', 'frères et sœurs'], ['Moi', 'Paul ROBIN', 'cousins germains'], ['Anne', 'Paul ROBIN', 'cousins germains'], ['Paul ROBIN', 'Lucie ROBIN', 'frères et sœurs'], ['Moi', 'Lucie ROBIN', 'cousins germains'],
            ['Moi', 'René MARTIN', 'cousins issus de germains'], ['René MARTIN', 'Hélène MARTIN', 'frères et sœurs'], ['Paul ROBIN', 'Marc GIRARD', 'cousins germains'], ['Marc GIRARD', 'Moi', 'cousins issus de germains'], ['Hélène MARTIN', 'Jules MOREAU', 'cousins germains']];
        return {rows: L0.map(([a, b, kind]) => ({a, b, kind})), nodes: [{name: 'Moi', group: 'MARTIN', root: true}, {name: 'Anne', group: 'MARTIN'}, {name: 'Paul ROBIN', group: 'ROBIN'}, {name: 'Lucie ROBIN', group: 'ROBIN'}, {name: 'René MARTIN', group: 'MARTIN'}, {name: 'Hélène MARTIN', group: 'MARTIN'}, {name: 'Marc GIRARD', group: 'GIRARD'}, {name: 'Jules MOREAU', group: 'MOREAU'}]};
    };

    /* ═════════ 🔢 Matrice de parenté ═════════ */
    const MAT_COL = ['#7b3294', '#08306b', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#9ecae1', '#c6dbef', '#c6dbef', '#deebf7'];
    const matCol = d => d === null ? '#f1f2f4' : MAT_COL[clamp(Math.round(d), 0, 9)];
    function kinMatrix(spec, W, fs) {
        const o = spec.o || {}, people = rows(spec, 'people', 40).map(r => str(r.name, 80)).filter(Boolean);
        rows(spec, 'rows', 1600).forEach(r => { [str(r.a, 80), str(r.b, 80)].forEach(n => { if (n && !people.includes(n) && people.length < 40) people.push(n); }); });
        if (people.length < 2) return empty(W, fs, 'Ajoute au moins deux personnes, puis ce que chacune est pour l’autre (ou prends-les dans ta base).');
        const n = people.length, cell = new Map();
        rows(spec, 'rows', 1600).forEach(r => { const a = people.indexOf(str(r.a, 80)), b = people.indexOf(str(r.b, 80)); if (a < 0 || b < 0 || a === b) return; cell.set(a + ',' + b, {label: str(r.label, 80), d: r.degree === '' || r.degree === undefined || r.degree === null ? null : clamp(num(r.degree), 0, 40)}); });
        const labW = Math.min(W * .3, Math.max(...people.map(p => textW(p, fs * .85))) + 10);
        const s = clamp((W - labW - 4) / n, 10, fs * 8), topH = Math.min(W * .3, Math.max(...people.map(p => textW(p, fs * .85)))) * .72 + fs, show = o.show || 'label';
        let svg = '';
        people.forEach((p, i) => { svg += T(labW - 6, topH + i * s + s / 2, cut(p, labW - 8, fs * .85), {size: fs * .85, anchor: 'end', weight: 600});
            const cx = labW + i * s + s / 2; svg += T(cx, topH - 6, cut(p, topH * 1.3, fs * .85), {size: fs * .85, rotate: -45, baseline: 'middle'}); });
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const x = labW + j * s, y = topH + i * s, c = i === j ? null : cell.get(i + ',' + j) || null, fill = i === j ? '#3b3f46' : c ? matCol(c.d === null ? 6 : c.d) : '#f1f2f4';
            svg += `<rect x="${r2(x + .5)}" y="${r2(y + .5)}" width="${r2(s - 1)}" height="${r2(s - 1)}" fill="${fill}" data-dmo-cell="${i === j ? 'self' : c ? 'k' : 'none'}">${tip(i === j ? people[i] : c ? `${people[j]} est ${c.label || 'parent'} de ${people[i]}${c.d !== null ? ` (degré ${fmt(c.d, 0)})` : ''}` : `${people[j]} et ${people[i]} : pas de lien trouvé`)}</rect>`;
            if (!c || show === 'none') continue;
            const fc = contrast(fill), f = Math.min(fs * .78, s / 4.2), t = show === 'degree' ? (c.d === null ? '' : String(c.d)) : c.label;
            if (show === 'degree' || textW(t, f) <= s - 4) { svg += T(x + s / 2, y + s / 2, show === 'degree' ? t : t, {size: show === 'degree' ? Math.min(fs, s / 2) : f, anchor: 'middle', fill: fc}); continue; }
            // deux lignes si le lien est long (« cousin issu de germains »)
            const w = t.split(' '), half = Math.ceil(w.length / 2), l1 = cut(w.slice(0, half).join(' '), s - 4, f), l2 = cut(w.slice(half).join(' '), s - 4, f);
            if (f >= 5) svg += T(x + s / 2, y + s / 2 - f * .6, l1, {size: f, anchor: 'middle', fill: fc}) + T(x + s / 2, y + s / 2 + f * .6, l2, {size: f, anchor: 'middle', fill: fc});
        }
        const degs = [...new Set([...cell.values()].map(c => c.d).filter(d => d !== null))].sort((a, b) => a - b);
        const legend = degs.slice(0, 8).map(d => ({label: d === 0 ? 'Conjoints' : `Degré ${d}${d === 1 ? ' (parent, enfant)' : d === 2 ? ' (frère, grand-parent)' : d === 4 ? ' (cousin germain)' : ''}`, color: matCol(d)}));
        return {h: topH + n * s + 4, svg, legend, desc: `Matrice de parenté de ${n} personnes : ${cell.size} liens trouvés.`};
    }
    function sampleMat() {
        const P0 = ['Jean (1850)', 'Pierre (1878)', 'Louis (1905)', 'Anne (1908)', 'Paul (1902)', 'René (1908)'];
        const M = {'0,1': ['fils', 1], '0,2': ['petit-fils', 2], '0,3': ['petite-fille', 2], '0,4': ['petit-fils', 2], '0,5': ['arrière-petit-fils', 3], '1,0': ['père', 1], '1,2': ['fils', 1], '1,3': ['fille', 1], '1,4': ['neveu', 3], '1,5': ['petit-neveu', 4],
            '2,0': ['grand-père', 2], '2,1': ['père', 1], '2,3': ['sœur', 2], '2,4': ['cousin germain', 4], '2,5': ['cousin issu de germains', 6], '3,0': ['grand-père', 2], '3,1': ['père', 1], '3,2': ['frère', 2], '3,4': ['cousin germain', 4], '3,5': ['cousin issu de germains', 6],
            '4,0': ['grand-père', 2], '4,1': ['oncle', 3], '4,2': ['cousin germain', 4], '4,3': ['cousine germaine', 4], '4,5': ['cousin germain', 4], '5,0': ['arrière-grand-père', 3], '5,1': ['grand-oncle', 4], '5,2': ['cousin issu de germains', 6], '5,3': ['cousin issu de germains', 6], '5,4': ['cousin germain', 4]};
        return {people: P0.map(name => ({name})), rows: Object.entries(M).map(([k, [label, degree]]) => { const [a, b] = k.split(','); return {a: P0[a], b: P0[b], label, degree}; })};
    }

    /* ═════════ 🌳 Arbre des patronymes ═════════ */
    function surnameTree(spec, W, fs) {
        const o = spec.o || {};
        const list = rows(spec, 'rows', 600).map((r, i) => ({i, name: str(r.name, 60), parent: str(r.parent, 60), gen: Math.max(1, Math.floor(num(r.gen)) || 1), year: str(r.year, 20), place: str(r.place, 60), who: str(r.who, 80), variants: str(r.variants, 160),
            counts: String(r.counts ?? '').split(/[,;\s]+/).filter(x => x !== '').slice(0, 20).map(x => Math.max(0, num(x)))})).filter(n => n.name);
        if (!list.length) return empty(W, fs, 'Ajoute des noms : le nom, le nom d’où il vient (vide pour le premier), la génération où il entre.');
        const uniq = []; const seen = new Set(); list.forEach(n => { if (!seen.has(n.name)) { seen.add(n.name); uniq.push(n); } });
        const roots = treeOf(uniq); uniq.forEach(n => n.kids.sort((a, b) => a.gen - b.gen || a.name.localeCompare(b.name, 'fr')));
        let depth = 0, leaf = 0; const place = (n, d) => { n.d = d; depth = Math.max(depth, d); if (!n.kids.length) { n.y = leaf++; return; } n.kids.forEach(k => place(k, d + 1)); n.y = (n.kids[0].y + n.kids[n.kids.length - 1].y) / 2; };
        roots.sort((a, b) => a.gen - b.gen).forEach(r => place(r, 0));
        const D = depth + 1, hg0 = fs * 2.2;
        let bw = clamp((W - (D - 1) * hg0) / D, fs * 7, fs * 17), sc = 1;
        if (D * bw + (D - 1) * hg0 > W) sc = W / (D * bw + (D - 1) * hg0);
        const f = fs * Math.min(1, sc), hg = hg0 * sc; bw *= sc;
        const maxC = Math.max(1, ...uniq.flatMap(n => n.counts)), bh = f * 5.4, vg = f * .9;
        const gens = [...new Set(uniq.map(n => n.gen))].sort((a, b) => a - b), gcol = g => (R.PALETTES.terre || R.PALETTES.vive)[gens.indexOf(g) % 12];
        const X = n => n.d * (bw + hg), Y = n => n.y * (bh + vg);
        let edges = '', boxes = '';
        uniq.forEach(n => {
            if (n.up) { const x1 = X(n.up) + bw, y1 = Y(n.up) + bh / 2, x2 = X(n), y2 = Y(n) + bh / 2, mx = (x1 + x2) / 2; edges += `<path d="M${r2(x1)} ${r2(y1)}C${r2(mx)} ${r2(y1)} ${r2(mx)} ${r2(y2)} ${r2(x2)} ${r2(y2)}" fill="none" stroke="#9c8a74" stroke-width="1.4" stroke-opacity=".8"/>`; }
            const x = X(n), y = Y(n), c = color(gcol(n.gen), '#8d5524'), vs = n.variants && n.variants.toLowerCase() !== n.name.toLowerCase() ? n.variants : '';
            const info = [`gén. ${n.gen}`, n.year, n.place].filter(Boolean).join(' · ');
            boxes += `<g data-dmo-name=""><rect x="${r2(x)}" y="${r2(y)}" width="${r2(bw)}" height="${r2(bh)}" rx="${r2(f * .5)}" fill="#fffdf8" stroke="${c}" stroke-width="1.5">${tip(`${n.name}${vs ? ' (' + vs + ')' : ''} — entre à la génération ${n.gen}${n.who ? ' par ' + n.who : ''}${n.year ? ', ' + n.year : ''}${n.place ? ', ' + n.place : ''}${n.counts.length ? ' — porteurs par génération : ' + n.counts.join(', ') : ''}`)}</rect>`;
            boxes += `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(f * .45)}" height="${r2(bh)}" rx="${r2(f * .2)}" fill="${c}"/>`;
            boxes += T(x + f * .9, y + f * .95, cut(n.name, bw - f * 1.3, f * 1.02), {size: f * 1.02, weight: 800, fill: '#2b2118'});
            if (vs) boxes += T(x + f * .9, y + f * 2.1, cut(vs, bw - f * 1.3, f * .78), {size: f * .78, style: 'italic', fill: '#6b5d4f'});
            boxes += T(x + f * .9, y + f * (vs ? 3.15 : 2.3), cut(info, bw - f * 1.3, f * .78), {size: f * .78, fill: '#55483b'});
            if (n.counts.length) { const cw = Math.min(f * 1.1, (bw - f * 1.4) / n.counts.length), base = y + bh - f * .35, hh = f * (vs ? 1.1 : 1.8);
                n.counts.forEach((v, i) => { if (!v) return; const hgt = Math.max(1.5, hh * v / maxC); boxes += `<rect x="${r2(x + f * .9 + i * cw)}" y="${r2(base - hgt)}" width="${r2(Math.max(1, cw - 1.5))}" height="${r2(hgt)}" fill="${c}" fill-opacity=".75">${tip(`Génération ${i + 1} : ${v} porteur${v > 1 ? 's' : ''}`)}</rect>`; }); }
            boxes += '</g>';
        });
        const legend = gens.slice(0, 10).map(g => ({label: `Entre à la génération ${g}`, color: gcol(g)}));
        return {h: leaf * (bh + vg), svg: edges + boxes, legend, desc: `Arbre des patronymes : ${uniq.length} noms sur ${gens.length} générations.`};
    }
    const sampleSur = () => [['MARTIN', '', 1, '1950', 'Rennes', '1,1,1,1,1,1', 'Martin, Martins'], ['DURAND', 'MARTIN', 2, '1925', 'Vitré', '0,1,1,2,2,3', 'Durand, Durant'], ['MOREAU', 'MARTIN', 3, '1898', 'Rennes', '0,0,1,1,1,2', 'Moreau'], ['PETIT', 'DURAND', 3, '1900', 'Fougères', '0,0,1,1,2,2', 'Petit'],
        ['GARNIER', 'MOREAU', 4, '1871', 'Laval', '0,0,0,1,1,1', 'Garnier, Garnié'], ['ROUX', 'DURAND', 4, '1868', 'Vitré', '0,0,0,1,1,3', 'Roux, Leroux'], ['LAMBERT', 'PETIT', 5, '1842', 'Angers', '0,0,0,0,1,1', 'Lambert'], ['GIRARD', 'MARTIN', 5, '1840', 'Rennes', '0,0,0,0,1,2', 'Girard, Girart']]
        .map(([name, parent, gen, year, place, counts, variants]) => ({name, parent, gen, year, place, counts, variants}));

    /* ═════════ 🎼 Diagramme d'accord : mariages entre villages ═════════ */
    function chord(spec, W, fs) {
        const o = spec.o || {}, top = clamp(Math.round(num(o.top) || 12), 2, 40);
        const raw = rows(spec, 'rows', 5000).map(r => ({a: str(r.from, 60), b: str(r.to, 60), v: Math.max(0, num(r.value)), c: color(r.color, '')})).filter(r => r.a && r.b && r.v > 0);
        if (!raw.length) return empty(W, fs, 'Ajoute des paires de lieux et combien de mariages les relient.');
        const tot = new Map(); raw.forEach(r => { tot.set(r.a, (tot.get(r.a) || 0) + r.v); tot.set(r.b, (tot.get(r.b) || 0) + r.v); });
        const keep = new Set([...tot].sort((x, y) => y[1] - x[1]).slice(0, top).map(([k]) => k)), OTH = 'Autres';
        const names = [...keep]; if ([...tot.keys()].some(k => !keep.has(k)) && !keep.has(OTH)) names.push(OTH);
        if (o.sort === 'az') names.sort((a, b) => (a === OTH) - (b === OTH) || a.localeCompare(b, 'fr'));
        const n = names.length, ix = new Map(names.map((k, i) => [k, i])), M = Array.from({length: n}, () => new Array(n).fill(0)), colOf = new Map();
        raw.forEach(r => { const i = ix.get(keep.has(r.a) ? r.a : OTH), j = ix.get(keep.has(r.b) ? r.b : OTH); if (i === undefined || j === undefined) return; if (i === j) { if (o.self !== false) M[i][i] += r.v; } else { M[i][j] += r.v; M[j][i] += r.v; } if (r.c) colOf.set(i, r.c); });
        const T0 = M.map(row => row.reduce((a, b) => a + b, 0)), S = T0.reduce((a, b) => a + b, 0);
        if (!S) return empty(W, fs, 'Aucun mariage entre ces lieux.');
        const labMax = Math.min(W * .2, Math.max(...names.map(k => textW(k, fs * .85)))) + 8, band = clamp(fs * 1.1, 6, 24);
        const Rr = clamp(Math.min((W - 2 * (labMax + band + 10)) / 2, (num(o.height) || W) / 2 - labMax - band - 10), 50, 900), cx = W / 2, cy = Rr + band + labMax + 6;
        const gap = Math.min(.05, TAU * .25 / n), k = (TAU - gap * n) / S, cols = names.map((nm, i) => nm === OTH ? '#9aa3ad' : colOf.get(i) || pick(spec, i));
        const sub = Array.from({length: n}, () => new Array(n)), arc = [];
        let a = -Math.PI / 2;
        for (let i = 0; i < n; i++) { const a0 = a; for (let jj = 0; jj < n; jj++) { const j = (i + jj) % n, w = M[i][j] * k; sub[i][j] = [a, a + w]; a += w; } arc.push([a0, a]); a += gap; }
        const p = (r, t) => P(cx, cy, r, t).map(r2).join(' '), lg = (x0, x1) => (x1 - x0 > Math.PI ? 1 : 0);
        let ribbons = '', ring = '';
        for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
            if (!M[i][j]) continue;
            const [s0, s1] = sub[i][j], c = cols[T0[i] >= T0[j] ? i : j], t = `${names[i]}${i === j ? ' (entre eux)' : ' ↔ ' + names[j]} : ${fmt(M[i][j], 0)} ${String(o.unit || 'mariages').slice(0, 30)}`;
            const d = i === j ? `M${p(Rr, s0)}A${r2(Rr)} ${r2(Rr)} 0 ${lg(s0, s1)} 1 ${p(Rr, s1)}Q${r2(cx)} ${r2(cy)} ${p(Rr, s0)}Z`
                : (() => { const [t0, t1] = sub[j][i]; return `M${p(Rr, s0)}A${r2(Rr)} ${r2(Rr)} 0 ${lg(s0, s1)} 1 ${p(Rr, s1)}Q${r2(cx)} ${r2(cy)} ${p(Rr, t0)}A${r2(Rr)} ${r2(Rr)} 0 ${lg(t0, t1)} 1 ${p(Rr, t1)}Q${r2(cx)} ${r2(cy)} ${p(Rr, s0)}Z`; })();
            ribbons += `<path d="${d}" fill="${c}" fill-opacity="${r2(clamp(num(o.opacity) || 65, 10, 100) / 100)}" stroke="${c}" stroke-opacity=".9" stroke-width=".6" data-dmo-ribbon="">${tip(t)}</path>`;
        }
        names.forEach((nm, i) => { const [a0, a1] = arc[i]; if (a1 - a0 <= 0) return;
            const big = lg(a0, a1); ring += `<path d="M${p(Rr + 2, a0)}A${r2(Rr + 2)} ${r2(Rr + 2)} 0 ${big} 1 ${p(Rr + 2, a1)}L${p(Rr + 2 + band, a1)}A${r2(Rr + 2 + band)} ${r2(Rr + 2 + band)} 0 ${big} 0 ${p(Rr + 2 + band, a0)}Z" fill="${cols[i]}" data-dmo-arc="">${tip(`${nm} : ${fmt(T0[i], 0)} ${String(o.unit || 'mariages').slice(0, 30)}`)}</path>`;
            const am = (a0 + a1) / 2, [lx, ly] = P(cx, cy, Rr + band + 7, am), deg = am * 180 / Math.PI, left = Math.cos(am) < 0;
            if ((a1 - a0) * Rr > fs * .55 || o.labels === 'all') ring += T(lx, ly, cut(nm, labMax, fs * .85), {size: fs * .85, anchor: left ? 'end' : 'start', rotate: left ? deg + 180 : deg, weight: 600}); });
        return {h: cy * 2, svg: ribbons + ring, legend: [], desc: `Diagramme d’accord : ${n} lieux, ${fmt(S / 2, 0)} ${String(o.unit || 'mariages')} environ.`};
    }
    const sampleChord = () => [['Vitré', 'Vitré', 34], ['Vitré', 'Rennes', 12], ['Vitré', 'Balazé', 9], ['Vitré', 'Étrelles', 7], ['Rennes', 'Rennes', 20], ['Rennes', 'Cesson', 6], ['Balazé', 'Balazé', 11], ['Balazé', 'Étrelles', 5], ['Étrelles', 'Étrelles', 8], ['Cesson', 'Rennes', 4], ['Fougères', 'Vitré', 3], ['Fougères', 'Balazé', 2]]
        .map(([from, to, value]) => ({from, to, value}));

    /* ═════════ 🎻 Violon : la répartition d'un chiffre par catégorie ═════════ */
    function quant(s, q) { if (!s.length) return 0; const p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); }
    function violin(spec, W, fs) {
        const o = spec.o || {}, groups = new Map();
        rows(spec, 'rows', 30000).forEach(r => { const v = r.value; if (v === '' || v === undefined || v === null || !isNumText(v)) return; const g = str(r.group, 60) || 'Tout'; if (!groups.has(g)) { if (groups.size >= 24) return; groups.set(g, []); } groups.get(g).push(num(v)); });
        const G = [...groups].map(([name, vals], i) => { const s = vals.sort((a, b) => a - b); return {name, s, i, n: s.length, q1: quant(s, .25), med: quant(s, .5), q3: quant(s, .75), mean: s.reduce((a, b) => a + b, 0) / s.length}; }).filter(g => g.n);
        if (!G.length) return empty(W, fs, 'Ajoute des valeurs : une catégorie (siècle, sexe…) et un chiffre par ligne.');
        if (o.sort === 'median') G.sort((a, b) => a.med - b.med); else if (o.sort === 'az') G.sort((a, b) => a.name.localeCompare(b.name, 'fr', {numeric: true}));
        const all = G.flatMap(g => [g.s[0], g.s[g.n - 1]]), lo0 = o.min !== undefined && o.min !== '' ? num(o.min) : Math.min(...all), hi0 = o.max !== undefined && o.max !== '' ? num(o.max) : Math.max(...all);
        const tk = R.ticks(lo0, hi0 > lo0 ? hi0 : lo0 + 1, 6), lo = tk.lo, hi = tk.hi;
        const H = clamp(num(o.height) || W * .5, 140, 2400), labW = Math.max(...tk.ticks.map(v => textW(fmt(v), fs * .85))) + 12 + (o.yLabel ? fs * 1.4 : 0), pw = W - labW - 6, slot = pw / G.length;
        const Y = v => 6 + H - (v - lo) / (hi - lo || 1) * H, unit = o.unit ? ' ' + String(o.unit).slice(0, 20) : '';
        let svg = '';
        tk.ticks.forEach(v => { svg += `<line x1="${r2(labW)}" x2="${r2(labW + pw)}" y1="${r2(Y(v))}" y2="${r2(Y(v))}" stroke="currentColor" stroke-opacity=".1"/>` + T(labW - 6, Y(v), fmt(v), {size: fs * .85, anchor: 'end'}); });
        if (o.yLabel) svg += T(fs * .8, 6 + H / 2, o.yLabel, {size: fs * .85, anchor: 'middle', rotate: -90});
        const NS = 72, bwUser = num(o.bandwidth);
        const rot = Math.max(...G.map(g => textW(g.name, fs * .9))) > slot * .95;
        G.forEach((g, k) => {
            const cx = labW + slot * (k + .5), c = pick(spec, g.i), sd = Math.sqrt(g.s.reduce((a, v) => a + (v - g.mean) ** 2, 0) / Math.max(1, g.n - 1)), iqr = g.q3 - g.q1;
            const h = bwUser > 0 ? bwUser : Math.max((hi - lo) / 200, 1.06 * Math.min(sd || Infinity, iqr > 0 ? iqr / 1.34 : sd || Infinity) * g.n ** -.2) || (hi - lo) / 20;
            const a = Math.max(lo, g.s[0] - h * 2), b = Math.min(hi, g.s[g.n - 1] + h * 2), xs = [], ds = [];
            const sample = g.n > 4000 ? g.s.filter((_, i) => i % Math.ceil(g.n / 4000) === 0) : g.s;
            for (let t = 0; t <= NS; t++) { const x = a + (b - a) * t / NS; let d = 0; for (const v of sample) { const z = (x - v) / h; if (z > -5 && z < 5) d += Math.exp(-.5 * z * z); } xs.push(x); ds.push(d); }
            const dm = Math.max(...ds) || 1, half = slot * .42;
            const right = xs.map((x, t) => `${t ? 'L' : 'M'}${r2(cx + ds[t] / dm * half)} ${r2(Y(x))}`).join(''), left = xs.map((x, t) => `L${r2(cx - ds[t] / dm * half)} ${r2(Y(x))}`).reverse().join('');
            svg += `<path d="${right}${left}Z" fill="${c}" fill-opacity=".55" stroke="${c}" stroke-width="1.3" data-dmo-violin="">${tip(`${g.name} : ${g.n} valeur${g.n > 1 ? 's' : ''}, médiane ${fmt(g.med)}${unit}, la moitié entre ${fmt(g.q1)} et ${fmt(g.q3)}${unit}, de ${fmt(g.s[0])} à ${fmt(g.s[g.n - 1])}${unit}`)}</path>`;
            if (o.points && g.n <= 3000) { let pts = ''; g.s.forEach((v, i) => { const j = ((i * 9301 + 49297) % 233280) / 233280 - .5, dv = ds[Math.round((v - a) / (b - a || 1) * NS)] || 0; pts += `<circle cx="${r2(cx + j * (dv / dm) * half * 1.4)}" cy="${r2(Y(v))}" r="${r2(clamp(fs * .18, 1, 3))}" fill="#1d1d1f" fill-opacity=".45"/>`; }); svg += `<g pointer-events="none">${pts}</g>`; }
            if (o.box !== false) { const bw = Math.max(3, Math.min(half * .22, fs * .9)); svg += `<line x1="${r2(cx)}" x2="${r2(cx)}" y1="${r2(Y(g.s[0]))}" y2="${r2(Y(g.s[g.n - 1]))}" stroke="#1d1d1f" stroke-opacity=".55"/><rect x="${r2(cx - bw / 2)}" y="${r2(Y(g.q3))}" width="${r2(bw)}" height="${r2(Math.max(1, Y(g.q1) - Y(g.q3)))}" fill="#1d1d1f" fill-opacity=".8" rx="1.5"/><circle cx="${r2(cx)}" cy="${r2(Y(g.med))}" r="${r2(Math.max(2.4, bw * .42))}" fill="#ffffff" stroke="#1d1d1f" data-dmo-median=""/>`; }
            if (o.values !== false) svg += T(cx + Math.min(half, fs * 3) * .25 + 6, Y(g.med), fmt(g.med), {size: fs * .78, weight: 700, halo: '#ffffffcc'});
            svg += rot ? T(cx, 6 + H + fs * .7, cut(g.name, 140, fs * .9), {size: fs * .9, anchor: 'end', rotate: -40}) : T(cx, 6 + H + fs * .9, g.name, {size: fs * .9, anchor: 'middle', weight: 600});
            if (!rot) svg += T(cx, 6 + H + fs * 2.1, `n = ${fmt(g.n, 0)}`, {size: fs * .75, anchor: 'middle', fill: '#777'});
        });
        const bottom = rot ? Math.min(140, Math.max(...G.map(g => textW(g.name, fs * .9))) * .7 + fs) : fs * 2.7;
        return {h: 6 + H + bottom, svg, legend: [], desc: `Violon : ${G.length} catégories, ${fmt(G.reduce((a, g) => a + g.n, 0), 0)} valeurs.`};
    }
    function sampleViolin() {
        const out = []; let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        const gen = (g, n, mode) => { for (let i = 0; i < n; i++) { const u = rnd(); const v = mode === 'old' ? (u < .3 ? rnd() * 5 : 25 + rnd() * 55) : mode === 'mid' ? (u < .18 ? rnd() * 5 : 35 + rnd() * 52) : (u < .04 ? rnd() * 5 : 55 + rnd() * 42); out.push({group: g, value: Math.round(v)}); } };
        gen('XVIIe s.', 70, 'old'); gen('XVIIIe s.', 120, 'old'); gen('XIXe s.', 160, 'mid'); gen('XXe s.', 90, 'new');
        return out;
    }

    /* ═════════ 🟩 Quadrillage des ancêtres ═════════ */
    const COMPLETE = [['Nom seulement', '#f4b9b2'], ['Une date', '#f6dc8e'], ['Dates et lieux', '#9fd19a'], ['Sourcé', '#2e7d32']];
    function grid(spec, W, fs) {
        const o = spec.o || {}, by = new Map();
        rows(spec, 'rows', 5000).forEach(r => { const s = Math.floor(num(r.sosa)); if (s >= 1 && s < 4096 && !by.has(s)) by.set(s, {s, name: str(r.name, 120), value: str(r.value, 80), detail: str(r.detail, 160), pid: Math.floor(num(r.pid)) || 0}); });
        if (!by.size) return empty(W, fs, 'Ajoute des ancêtres : un n° Sosa, un nom et une valeur (ou prends-les dans ta base).');
        const maxS = Math.max(...by.keys()), gens = clamp(Math.round(num(o.gens)) || Math.floor(Math.log2(maxS)) + 1, 2, 12);
        // couleurs : chiffres (dégradé) ou catégories (les miennes, sinon la palette)
        const vals = [...by.values()].map(r => r.value).filter(Boolean), numeric = o.scale === 'num' || (o.scale !== 'cat' && vals.length && vals.filter(isNumText).length >= vals.length * .8);
        const given = new Map(rows(spec, 'cats', 60).filter(c => str(c.value)).map(c => [str(c.value).toLowerCase(), color(c.color, '')]));
        COMPLETE.forEach(([l, c]) => { if (!given.has(l.toLowerCase())) given.set(l.toLowerCase(), c); });
        const lo = numeric ? (o.min !== '' && o.min !== undefined ? num(o.min) : Math.min(...vals.map(num))) : 0, hi = numeric ? (o.max !== '' && o.max !== undefined ? num(o.max) : Math.max(...vals.map(num))) : 1;
        const lowC = color(o.lowColor, '#fde0c5'), highC = color(o.highColor, '#2e7d32'), order = []; vals.forEach(v => { if (!numeric && !order.includes(v)) order.push(v); });
        const colOf = r => { if (!r) return color(o.missingColor, '#e3e5e8'); if (!r.value) return '#c9ced6'; if (numeric) return mix(lowC, highC, hi > lo ? (num(r.value) - lo) / (hi - lo) : 1); return given.get(r.value.toLowerCase()) || pick(spec, order.indexOf(r.value)); };
        const square = o.layout === 'square', labW = square ? 0 : fs * 3.6, cntW = square ? 0 : fs * 4.6, pw = W - labW - cntW;
        let svg = '', h = 0, found = 0;
        const cellSvg = (s, x, y, w, hh) => { const r = by.get(s), c = colOf(r); if (r) found++;
            const t = r ? `Sosa ${s} · ${r.name}${r.value ? ' · ' + r.value : ''}${r.detail ? ' · ' + r.detail : ''}` : `Sosa ${s} · pas encore trouvé`;
            let out = `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(Math.max(.6, w))}" height="${r2(hh)}" rx="${r2(Math.min(3, w / 5))}" fill="${c}"${r ? '' : ' stroke="#b8bec7" stroke-dasharray="2 2" stroke-width=".8"'} data-dmo-slot="${s}"${r?.pid ? ` data-dmo-pid="${r.pid}" style="cursor:pointer"` : ''}>${tip(t)}</rect>`;
            const lab = o.labels || 'auto', f = Math.min(fs * .78, hh * .4);
            if (lab !== 'none' && f >= 6 && w > f * 2.2) { const t1 = lab === 'sosa' || !r ? String(s) : cut(r.name, w - 4, f); if (t1) out += T(x + w / 2, y + hh / 2 - (lab === 'both' && r && hh > f * 2.6 ? f * .6 : 0), t1, {size: f, anchor: 'middle', fill: contrast(c), op: r ? 0 : .7}); if (lab === 'both' && r && hh > f * 2.6) out += T(x + w / 2, y + hh / 2 + f * .7, String(s), {size: f * .85, anchor: 'middle', fill: contrast(c), op: .75}); }
            return out; };
        if (square) {
            const N = 2 ** gens - 1, cols = Math.ceil(Math.sqrt(N * 1.6)), s = Math.min(fs * 4, W / cols), rowsN = Math.ceil(N / cols);
            for (let i = 1; i <= N; i++) { const k = i - 1, x = (k % cols) * s, y = Math.floor(k / cols) * s, g = Math.floor(Math.log2(i)); svg += cellSvg(i, x + .5, y + .5, s - 1, s - 1); if ((i & (i - 1)) === 0 && i > 1) svg += `<line x1="${r2(x)}" y1="${r2(y + 1)}" x2="${r2(x)}" y2="${r2(y + s - 1)}" stroke="#1d1d1f" stroke-width="2"><title>Génération ${g + 1}</title></line>`; }
            h = rowsN * s;
        } else {
            const rh = clamp(num(o.rowHeight) || fs * 2.1, 6, 80);
            for (let g = 0; g < gens; g++) {
                const n = 2 ** g, w = pw / n, y = g * (rh + 3); let f0 = found;
                for (let k = 0; k < n; k++) svg += cellSvg(n + k, labW + k * w + (w > 3 ? .5 : 0), y, w - (w > 3 ? 1 : 0), rh);
                svg += T(labW - 6, y + rh / 2, `Gén. ${g + 1}`, {size: fs * .78, anchor: 'end', weight: 600, fill: '#556'});
                const got = found - f0; svg += T(labW + pw + 6, y + rh / 2, `${got}/${n}`, {size: fs * .78, fill: got === n ? '#2e7d32' : '#556', weight: 600}).replace('<text ', '<text data-dmo-gencount="" ');
            }
            h = gens * (rh + 3);
        }
        const total = 2 ** gens - 1;
        const legend = numeric ? [0, .5, 1].map(t => ({label: fmt(lo + (hi - lo) * t) + (o.unit ? ' ' + o.unit : ''), color: mix(lowC, highC, t)})) : order.slice(0, 16).map(v => ({label: v, color: given.get(v.toLowerCase()) || pick(spec, order.indexOf(v))}));
        legend.push({label: 'Pas encore trouvé', color: color(o.missingColor, '#e3e5e8')});
        return {h, svg, legend, desc: `Quadrillage de ${gens} générations : ${found} ancêtres trouvés sur ${total} places (${fmt(100 * found / total)} %).`};
    }
    function sampleGrid() {
        const out = [], L = ['MARTIN', 'DURAND', 'PETIT', 'MOREAU', 'GARNIER', 'ROUX', 'FOURNIER', 'GIRARD', 'BONNET', 'LAMBERT'];
        for (let s = 1; s < 64; s++) { const g = Math.floor(Math.log2(s)); if (g >= 3 && (s * 13) % 7 === 0) continue; if (g >= 4 && !out.some(r => r.sosa === s >> 1)) continue;
            out.push({sosa: s, name: `${s % 2 && s > 1 ? 'Marie' : 'Jean'} ${L[(s * 3) % 10]}`, value: COMPLETE[g < 2 ? 3 : (s * 7 + g) % 4][0], detail: `° ${1980 - g * 29}`}); }
        return out;
    }

    /* ═════════ « Depuis l'app » : petits outils communs ═════════ */
    const getM = q => A().api('diagram_more', {...q, ...(window.LCNDA_EXT?.diagramAppOpts?.extra() || {})}), getG = q => A().api('diagram_genea', q); // getM : + le groupe et la période communs (heritage-diagram-options.js)
    const PK = (name, o = {}) => (window.LCNDA_PICKER?.pickerField ? window.LCNDA_PICKER.pickerField({name, kind: 'person', ...o}) : '');
    const startId = () => Number(A().state?.bootstrap?.startPersonId) || null;
    const rootField = (label = 'Personne de départ') => `<span class="pk-lab">${esc(label)}</span>${PK('dm_root', {value: startId()})}`;
    const rootOf = pane => Number(pane.querySelector('[name="dm_root"]')?.value) || startId() || 0;
    const idsOf = (pane, name = 'dm_ids') => String(pane.querySelector(`[name="${name}"]`)?.value || '').split(',').map(Number).filter(x => x > 0);
    const val = (pane, k) => pane.querySelector(`[data-dm="${k}"]`)?.value || '';
    const sel = (k, opts, def = '') => `<select data-dm="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(def) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const box = (title, intro, inner, go = 'Prendre dans ma base') => `<div class="h-dg-app dmo-app"><h4>${title}</h4><p class="muted">${intro}</p>${inner}<button type="button" class="button small" data-dm-go>${esc(go)}</button><p class="muted" data-dm-msg aria-live="polite"></p></div>`;
    function bindApp(pane, run) {
        const btn = pane.querySelector('[data-dm-go]'), msg = pane.querySelector('[data-dm-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = window.LCNDA_UI.spinner('Lecture de ta généalogie…', {inline: true});
            try { const t = await run(); A().toast?.(t || 'Données prises dans ta base.'); if (msg?.isConnected) msg.textContent = ''; } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } });
    }
    const clean = d => String(d || '').replace(/-00/g, '');
    const roman = n => { let s = '', x = n; for (const [a, b] of [[20, 'XX'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (x >= a) { s += b; x -= a; } return s; };
    const GENS = (def, max = 10, min = 2) => sel('gens', Array.from({length: max - min + 1}, (_, i) => [min + i, `${min + i} générations`]), def);
    const titleIf = (s, sample, t) => { if (!s.o.title || s.o.title === sample.o?.title) s.o.title = t; };

    const genbarsApp = {
        html: () => box('🧬 Mes ancêtres, génération par génération', 'Chaque ancêtre devient une barre, de sa naissance à son décès ; les générations s’empilent, la couleur montre la branche (paternelle ou maternelle).', `${rootField()}<label>Générations${GENS(5)}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getG({what: 'fan', root: rootOf(pane), gens: val(pane, 'gens')});
            const list = (r.rows || []).filter(p => p.birth || p.death); if (!list.length) throw new Error('Aucun ancêtre daté pour cette personne.');
            const s = io.spec(); s.rows = list.map(p => ({sosa: p.sosa, name: p.name, start: clean(p.birth), end: p.living ? '' : clean(p.death) || '?', pid: p.id}));
            if (!rows(s, 'events').length) s.events = EVENTS_FR.map(([start, end, label]) => ({start, end, label}));
            titleIf(s, K.genbars.sample(), `Les vies de mes ancêtres (${r.root_name})`); io.apply(s);
            return `${list.length} ancêtres pris dans ta base.`;
        }),
    };
    const crisesApp = {
        html: () => box('📉 Naissances et décès de ma base', 'Compte les naissances (ou baptêmes) et les décès (ou sépultures) de chaque année. Laisse le lieu vide pour toute la base.', `<span class="pk-lab">Un seul lieu (facultatif)</span>${window.LCNDA_PICKER?.pickerField ? window.LCNDA_PICKER.pickerField({name: 'dm_place', kind: 'place'}) : ''}<label>Regrouper${sel('step', [[1, 'Année par année'], [5, 'Par 5 ans'], [10, 'Par 10 ans']], 1)}</label><span class="dmo-period"><label>De l’année<input type="number" data-dm="from" inputmode="numeric" placeholder="ex. 1650"></label><label>à l’année<input type="number" data-dm="to" inputmode="numeric" placeholder="ex. 1950"></label></span>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const q = {what: 'crises', step: val(pane, 'step'), place: Number(pane.querySelector('[name="dm_place"]')?.value) || ''}; const f = val(pane, 'from'), t = val(pane, 'to'); if (/^\d{3,4}$/.test(f)) q.from = f; if (/^\d{3,4}$/.test(t)) q.to = t;
            const r = await getM(q); if (!r.rows?.length) throw new Error('Aucune naissance ni aucun décès daté' + (r.place ? ` à ${r.place}` : '') + '.');
            const s = io.spec(); s.rows = r.rows; if (!rows(s, 'crises').length) s.crises = CRISES.map(([start, end, label, c]) => ({start, end, label, color: c}));
            s.o = {...s.o, smooth: Number(q.step) > 1 ? 0 : s.o.smooth}; titleIf(s, K.crises.sample(), `Naissances et décès${r.place ? ' à ' + r.place : ''}`); io.apply(s);
            return `${r.rows.length} ${Number(q.step) > 1 ? 'périodes' : 'années'} prises dans ta base.`;
        }),
    };
    const sibApp = {
        html: () => box('👨‍👩‍👧 Une fratrie de ma base', 'Choisis une personne : ses frères et sœurs (ou ses enfants) deviennent des barres sur le même axe des âges, avec leurs mariages et la naissance de leurs enfants.', `<span class="pk-lab">Personne</span>${PK('dm_root', {value: startId()})}<label>Montrer${sel('mode', [['siblings', 'Sa fratrie (elle comprise)'], ['children', 'Ses enfants']], 'siblings')}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getM({what: 'siblings', person: rootOf(pane), mode: val(pane, 'mode')}); if (!r.people?.length) throw new Error('Personne : aucun enfant trouvé.');
            const s = io.spec(); s.rows = r.people.map(p => ({name: p.name, sex: p.sex, birth: p.birth, death: p.death, living: p.living ? 'oui' : '', marriages: p.marriages, children: p.children})); titleIf(s, K.siblings.sample(), r.title); io.apply(s);
            return `${r.people.length} enfant${r.people.length > 1 ? 's' : ''} pris dans ta base.`;
        }),
    };
    const pyrApp = {
        html: () => box('🔺 Toutes les personnes de ma base', 'Chaque personne née, et pas encore morte, l’année choisie compte dans sa tranche d’âge. Ensuite : le curseur sous le dessin change l’année, ▶ fait défiler le temps.', `<label>Année de départ<input type="number" data-dm="year" inputmode="numeric" placeholder="ex. 1850"></label><label>Décès inconnu${sel('unk', [[0, 'Ne pas compter la personne'], [60, 'Supposer une vie de 60 ans'], [80, 'Supposer une vie de 80 ans']], 0)}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getM({what: 'alive'}); if (!r.people?.length) throw new Error('Aucune personne avec une date de naissance.');
            const s = io.spec(); s.people = r.people; s.rows = []; const y = Number(val(pane, 'year'));
            s.o = {...s.o, year: y || Math.round((r.from + Math.min(new Date().getFullYear(), r.to + 60)) / 2), unknownAge: Number(val(pane, 'unk')) || 0}; titleIf(s, K.alivepyr.sample(), 'Qui vivait en … ?'); io.apply(s);
            return `${r.people.length} personnes prises dans ta base.`;
        }),
    };
    const accApp = {
        html: () => box('🪗 Mes ancêtres et leurs descendants', 'Les ancêtres de la personne sur quelques générations, puis tous leurs descendants jusqu’à sa génération : frères et sœurs, oncles, cousins germains, issus de germains… avec le lien de parenté de chacun.', `${rootField()}<label>Remonter de${GENS(2, 5, 1)}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getM({what: 'accordion', root: rootOf(pane), up: val(pane, 'gens')}); if ((r.nodes || []).length < 2) throw new Error('Pas assez de parents connus pour cette personne.');
            const s = io.spec(); s.rows = r.nodes.map(n => ({key: n.key, pkey: n.parent, name: n.name, parent: '', years: n.years, kin: n.kin, degree: n.degree >= 99 ? '' : n.degree, sex: n.sex, pid: n.id}));
            s.o = {...s.o, folded: []}; titleIf(s, K.accordion.sample(), `Les cousins de ${r.root_name}`); io.apply(s);
            return `${r.nodes.length} personnes prises dans ta base${r.truncated ? ' (les 1 500 premières)' : ''}.`;
        }),
    };
    const cousApp = {
        html: () => box('🧶 Les cousins de ma base', 'Choisis des personnes (au moins deux), ou laisse vide : l’app prend la personne de départ et tous ses cousins de la même génération jusqu’à l’ancêtre commun choisi.', `<span class="pk-lab">Personnes (facultatif)</span>${PK('dm_ids', {multiple: true})}${rootField('Sinon : cousins de')}<label>Ancêtre commun jusqu’à${GENS(3, 6, 1)}</label><label>Liens${sel('links', [['', 'Les plus proches (et de quoi tout relier)'], ['all', 'Tous les liens']], '')}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const ids = idsOf(pane), r = await getM({what: 'cousins', ids: ids.join(','), root: rootOf(pane), gens: val(pane, 'gens'), links: val(pane, 'links')});
            if (!r.links?.length) throw new Error('Aucun lien de parenté trouvé entre ces personnes.');
            const s = io.spec(); s.rows = r.links.map(l => ({a: l.a, b: l.b, kind: l.kind})); s.nodes = r.nodes.map(n => ({name: n.name, group: n.group, ...(n.root ? {root: true} : {})})); titleIf(s, K.cousinage.sample(), 'Les cousinages'); io.apply(s);
            return `${r.nodes.length} personnes et ${r.links.length} liens pris dans ta base.`;
        }),
    };
    const matApp = {
        html: () => box('🔢 Des personnes de ma base', 'Choisis jusqu’à 20 personnes : chaque case dit ce que la personne de la colonne est pour celle de la ligne (père, oncle, cousin germain…), et se colore selon la proximité.', `<span class="pk-lab">Personnes</span>${PK('dm_ids', {multiple: true})}`),
        bind: (pane, io) => bindApp(pane, async () => {
            const ids = idsOf(pane).slice(0, 20); if (ids.length < 2) throw new Error('Choisis au moins deux personnes.');
            const r = await getM({what: 'kinship', ids: ids.join(',')}), seen = new Map(), names = r.people.map(p => { const n = seen.has(p.name) ? `${p.name} (${p.years || p.id})` : p.name; seen.set(p.name, 1); return n; });
            const s = io.spec(); s.people = names.map(name => ({name})); s.rows = r.cells.map(c => ({a: names[c.a], b: names[c.b], label: c.label, degree: c.degree})); titleIf(s, K.kinmatrix.sample(), 'Qui est quoi pour qui'); io.apply(s);
            return `${names.length} personnes, ${r.cells.length} liens trouvés.`;
        }),
    };
    const surApp = {
        html: () => box('🌳 Les noms de mes ancêtres', 'Chaque nom de famille de l’ascendance : par qui et quand il entre dans l’arbre (une femme et son nom), ses variantes d’écriture regroupées, et combien d’ancêtres le portent à chaque génération.', `${rootField()}<label>Générations${GENS(8, 14, 3)}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getM({what: 'surnames', root: rootOf(pane), gens: val(pane, 'gens')}); if (!r.rows?.length) throw new Error('Aucun nom de famille dans cette ascendance.');
            const s = io.spec(); s.rows = r.rows; titleIf(s, K.surnametree.sample(), `Les noms de famille de ${r.root_name}`); io.apply(s);
            return `${r.rows.length} noms pris dans ta base.`;
        }),
    };
    const chordApp = {
        html: () => box('🎼 Les mariages de ma base', 'Chaque mariage relie deux lieux : les lieux de naissance des deux époux, ou le lieu de naissance de chacun et le lieu du mariage. Les lieux les plus fréquents gardent leur nom, les autres vont dans « Autres ».', `<label>Relier${sel('mode', [['spouses', 'Le village de l’époux et celui de l’épouse'], ['marriage', 'Le village de chacun → le lieu du mariage']], 'spouses')}</label><label>Lieux gardés${sel('top', [[6, '6'], [10, '10'], [15, '15'], [20, '20']], 10)}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await getM({what: 'chord', mode: val(pane, 'mode'), top: val(pane, 'top')}); if (!r.rows?.length) throw new Error('Aucun mariage avec des lieux connus.');
            const s = io.spec(); s.rows = r.rows; s.o = {...s.o, top: Number(val(pane, 'top'))}; titleIf(s, K.chord.sample(), val(pane, 'mode') === 'marriage' ? 'Où l’on venait se marier' : 'Mariages entre villages'); io.apply(s);
            return `${r.rows.length} paires de lieux prises dans ta base.`;
        }),
    };
    const violinApp = {
        html: () => box('🎻 Des âges de ma base', 'Chaque personne donne une valeur (son âge au décès, ou au mariage), rangée dans une catégorie (son siècle, son sexe).', `<label>Valeur${sel('what', [['ages_death', 'Âge au décès'], ['ages_marriage', 'Âge au mariage']], 'ages_death')}</label><label>Catégorie${sel('by', [['century', 'Siècle'], ['group', 'Sexe']], 'century')}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const what = val(pane, 'what'), by = val(pane, 'by'), r = await A().api('diagram_numbers', {what, ...(window.LCNDA_EXT?.diagramAppOpts?.extra() || {})}); if (!r.items?.length) throw new Error('Aucune personne avec les deux dates.');
            const s = io.spec(); s.rows = r.items.map(it => ({group: by === 'group' ? it.group : it.century, value: it.value})).sort((a, b) => (by === 'century' ? centuryN(a.group) - centuryN(b.group) : 0));
            s.o = {...s.o, unit: 'ans', yLabel: what === 'ages_marriage' ? 'Âge au mariage' : 'Âge au décès', sort: by === 'century' ? '' : s.o.sort}; titleIf(s, K.violin.sample(), `${what === 'ages_marriage' ? 'Âge au mariage' : 'Âge au décès'} par ${by === 'group' ? 'sexe' : 'siècle'}`); io.apply(s);
            return `${r.items.length} valeurs prises dans ta base.`;
        }),
    };
    const centuryN = s => { const m = String(s).match(/^([IVXL]+)e/); if (!m) return 99; const v = {I: 1, V: 5, X: 10, L: 50}; let n = 0, p = 0; [...m[1]].reverse().forEach(ch => { const x = v[ch]; n += x < p ? -x : x; p = Math.max(p, x); }); return n; };
    const gridApp = {
        html: () => box('🟩 Mes ancêtres (numéros Sosa)', 'Une case par place d’ancêtre ; les cases grises sont les ancêtres pas encore trouvés. Clic sur une case (hors de l’éditeur) : sa fiche.', `${rootField()}<label>Générations${GENS(7, 10, 3)}</label><label>Colorer selon${sel('by', [['complete', 'Ce que je sais (nom, dates, lieux, sources)'], ['score', 'Taux de recherche (%)'], ['state', 'Région de naissance'], ['century', 'Siècle de naissance'], ['occupation', 'Métier'], ['gender', 'Sexe'], ['last', 'Nom de famille']], 'complete')}</label>`),
        bind: (pane, io) => bindApp(pane, async () => {
            const by = val(pane, 'by'), r = await getG({what: 'fan', root: rootOf(pane), gens: val(pane, 'gens')}); if (!r.rows?.length) throw new Error('Aucun ancêtre trouvé pour cette personne.');
            const value = p => by === 'complete' ? (p.sourced && (p.birth || p.death) ? COMPLETE[3][0] : p.birth && p.birth_place && (p.death || p.living) ? COMPLETE[2][0] : p.birth || p.death ? COMPLETE[1][0] : COMPLETE[0][0])
                : by === 'score' ? String(p.score) : by === 'century' ? (p.birth_year ? `${roman(Math.ceil(p.birth_year / 100))}e siècle` : '') : by === 'gender' ? ({male: 'Homme', female: 'Femme'}[p.gender] || 'Inconnu') : str(p[by], 80);
            const s = io.spec(); s.rows = r.rows.map(p => ({sosa: p.sosa, name: p.name, value: value(p), detail: [p.birth ? '° ' + clean(p.birth).slice(0, 10) : '', p.death ? '† ' + clean(p.death).slice(0, 10) : ''].filter(Boolean).join(' '), pid: p.id}));
            s.cats = by === 'complete' ? COMPLETE.map(([v, c]) => ({value: v, color: c})) : by === 'gender' ? [{value: 'Homme', color: '#4e79a7'}, {value: 'Femme', color: '#e15759'}] : [];
            s.o = {...s.o, gens: r.gens, scale: by === 'score' ? 'num' : 'cat', ...(by === 'score' ? {min: 0, max: 100, unit: '%'} : {min: '', max: '', unit: ''})};
            titleIf(s, K.ancestorgrid.sample(), `Les ancêtres de ${r.root_name}`); io.apply(s);
            return `${r.rows.length} ancêtres pris dans ta base.`;
        }),
    };

    /* ═════════ Les types ═════════ */
    const NEW = {
        genbars: {icon: '🧬', label: 'Arbre en frise (vies par génération)', group: 'Frises', render: genbars, legend: 'bottom', fromApp: genbarsApp,
            grids: [{key: 'rows', label: 'Les personnes (une barre par vie)', cols: [C('sosa', 'N° Sosa', 'number'), C('name', 'Nom'), C('gen', 'Génération (vide = d’après le n° Sosa)', 'number'), C('start', 'Naissance', 'text', {ph: '1792 ou 12/05/1792'}), C('end', 'Décès (vide = vivant ; ? = inconnu)'), C('group', 'Groupe (couleur, facultatif)')]},
                {key: 'events', label: 'Les événements historiques en fond (facultatif)', cols: [C('start', 'Début'), C('end', 'Fin'), C('label', 'Nom'), C('color', 'Couleur', 'color')]}],
            options: [C('colorBy', 'Couleur des barres', 'select', {choices: [['branch', 'Branche paternelle ou maternelle'], ['sex', 'Homme ou femme'], ['group', 'Colonne « Groupe »']], def: 'branch'}),
                C('layout', 'Disposition', 'select', {choices: [['', 'Serrée (noms dans les barres)'], ['rows', 'Une ligne par personne (noms à gauche)']]}), C('order', 'Générations', 'select', {choices: [['', 'Les plus anciennes en haut'], ['young', 'Les plus récentes en haut']]}),
                C('labels', 'Noms dans les barres', 'check', {def: true, when: s => s.o?.layout !== 'rows'}), C('events', 'Montrer les événements', 'check', {def: true}), C('barHeight', 'Épaisseur des barres', 'range', {min: 4, max: 40, def: 16}), C('from', 'Début (année, vide = auto)'), C('to', 'Fin (année, vide = auto)')],
            sample: () => ({o: {title: 'Les vies de mes ancêtres', colorBy: 'branch'}, rows: sampleGen(), events: EVENTS_FR.map(([start, end, label]) => ({start, end, label}))})},
        crises: {icon: '📉', label: 'Naissances, décès et crises', group: 'Frises', render: crises, legend: 'bottom', fromApp: crisesApp,
            grids: [{key: 'rows', label: 'Les années', cols: [C('year', 'Année'), C('births', 'Naissances', 'number'), C('deaths', 'Décès', 'number')]},
                {key: 'crises', label: 'Les crises (à changer ou compléter)', cols: [C('start', 'Début'), C('end', 'Fin (vide = une année)'), C('label', 'Nom'), C('color', 'Couleur', 'color')]}],
            options: [C('smooth', 'Lisser les courbes (moyenne sur … ans)', 'select', {choices: [['0', 'Non'], ['3', '3 ans'], ['5', '5 ans'], ['9', '9 ans']], def: '0'}), C('crises', 'Montrer les crises', 'check', {def: true}), C('excess', 'Colorer quand les décès dépassent les naissances', 'check', {def: true}),
                C('birthColor', 'Couleur des naissances', 'color', {def: '#59a14f'}), C('deathColor', 'Couleur des décès', 'color', {def: '#5f6b7a'}), C('from', 'Début (année, vide = auto)'), C('to', 'Fin (année, vide = auto)'), C('yLabel', 'Nom de l’axe des valeurs'), C('height', 'Hauteur du dessin', 'number', {unit: 'px', min: 140, max: 2400})],
            sample: () => ({o: {title: 'Naissances et décès au village', smooth: '3'}, rows: sampleCrises(), crises: CRISES.map(([start, end, label, c]) => ({start, end, label, color: c}))})},
        siblings: {icon: '👨‍👩‍👧', label: 'Âges comparés d’une fratrie', group: 'Frises', render: siblings, legend: 'bottom', fromApp: sibApp,
            grids: [{key: 'rows', label: 'Les enfants (dans l’ordre de naissance)', cols: [C('name', 'Prénom / nom'), C('sex', 'Sexe', 'select', {choices: [['', '?'], ['h', 'Homme'], ['f', 'Femme']]}), C('birth', 'Naissance'), C('death', 'Décès (vide = vivant ou inconnu)'), C('marriages', 'Mariages (dates, séparées par des virgules)'), C('children', 'Naissance de ses enfants (dates)'), C('note', 'Note')]}],
            options: [C('axis', 'Axe', 'select', {choices: [['', 'Les âges (tous partent de 0)'], ['year', 'Les années (calendrier)']]}), C('order', 'Ordre', 'select', {choices: [['', 'Par date de naissance'], ['table', 'Comme dans le tableau']]})],
            sample: () => ({o: {title: 'Les enfants de Jean et Marie'}, rows: sampleSib()})},
        alivepyr: {icon: '🔺', label: 'Pyramide « qui vivait en … »', group: 'Frises', render: alivePyr, legend: 'bottom', fromApp: pyrApp,
            grids: [{key: 'rows', label: 'Les personnes (à la main ; celles de ta base : « Depuis l’app »)', cols: [C('name', 'Nom'), C('sex', 'Sexe', 'select', {choices: [['', '?'], ['h', 'Homme'], ['f', 'Femme']]}), C('birth', 'Naissance'), C('death', 'Décès')]}],
            options: [C('year', 'Année montrée', 'number', {min: -3000, max: 3000}), C('band', 'Tranches d’âge', 'select', {choices: [['5', '5 ans'], ['10', '10 ans'], ['20', '20 ans']], def: '10'}), C('maxAge', 'Dernière tranche à partir de', 'number', {unit: 'ans', min: 20, max: 120, def: 90}),
                C('unknownAge', 'Décès inconnu : supposer une vie de … ans (0 = ne pas compter)', 'number', {min: 0, max: 110, def: 0}), C('fixedScale', 'Même échelle pour toutes les années (lecture)', 'check', {def: true}), C('values', 'Afficher les nombres', 'check', {def: true}),
                C('menColor', 'Couleur des hommes', 'color', {def: '#4e79a7'}), C('womenColor', 'Couleur des femmes', 'color', {def: '#e15759'}), C('height', 'Hauteur des barres (px, au total)', 'number', {min: 100, max: 2400})],
            sample: () => ({o: {title: 'Qui vivait en 1850 ?', year: 1850, maxAge: 90}, rows: samplePyr()}), afterDraw: keepApi},
        accordion: {icon: '🪗', label: 'Arbre en accordéon (cousins)', group: 'Généalogie', render: accordion, legend: 'bottom', fromApp: accApp, afterDraw: accAfterDraw,
            grids: [{key: 'rows', label: 'Les personnes (même nom au-dessus = branche)', cols: [C('name', 'Nom'), C('parent', 'Au-dessus (nom ; vide pour le haut)'), C('years', 'Années'), C('kin', 'Lien de parenté'), C('degree', 'Degré (couleur)', 'number')]}],
            options: [C('kin', 'Montrer le lien de parenté', 'check', {def: true}), C('open', 'Générations ouvertes au départ (0 = toutes)', 'number', {min: 0, max: 12, def: 0}), C('indent', 'Décalage d’une génération', 'range', {unit: 'px', min: 8, max: 60, def: 20})],
            sample: () => ({o: {title: 'Mes cousins'}, rows: sampleAcc()})},
        cousinage: {icon: '🧶', label: 'Graphe des cousinages', group: 'Généalogie', render: cousinage, legend: 'bottom', fromApp: cousApp,
            grids: [{key: 'rows', label: 'Les liens (deux personnes et leur lien)', cols: [C('a', 'Personne A'), C('b', 'Personne B'), C('kind', 'Lien (cousins germains…)')]}, {key: 'nodes', label: 'Les personnes (facultatif : famille pour la couleur)', cols: [C('name', 'Nom'), C('group', 'Famille / groupe')]}],
            options: [C('edgeLabels', 'Noms des liens sur les traits', 'select', {choices: [['', 'Si pas trop nombreux (60)'], ['all', 'Toujours'], ['none', 'Jamais']]}), C('colorBy', 'Couleur des points', 'select', {choices: [['', 'Par famille'], ['none', 'Une seule']]}), C('height', 'Hauteur', 'number', {unit: 'px', min: 220, max: 2400})],
            sample: () => ({o: {title: 'Les cousinages de la famille'}, ...sampleCous()})},
        kinmatrix: {icon: '🔢', label: 'Matrice de parenté (qui est quoi pour qui)', group: 'Généalogie', render: kinMatrix, legend: 'bottom', fromApp: matApp,
            grids: [{key: 'people', label: 'Les personnes (lignes et colonnes, 40 au plus)', cols: [C('name', 'Nom')]}, {key: 'rows', label: 'Les cases : ce que B est pour A', cols: [C('a', 'A (ligne)'), C('b', 'B (colonne)'), C('label', 'Lien (père, cousin germain…)'), C('degree', 'Degré (couleur)', 'number')]}],
            options: [C('show', 'Dans les cases', 'select', {choices: [['label', 'Le lien'], ['degree', 'Le degré'], ['none', 'Rien (couleurs seules)']], def: 'label'})],
            sample: () => ({o: {title: 'Qui est quoi pour qui'}, ...sampleMat()})},
        surnametree: {icon: '🌳', label: 'Arbre des patronymes (transmission du nom)', group: 'Généalogie', render: surnameTree, legend: 'bottom', fromApp: surApp,
            grids: [{key: 'rows', label: 'Les noms (d’où vient chacun)', cols: [C('name', 'Nom'), C('parent', 'Arrive par (nom ; vide pour le premier)'), C('gen', 'Génération d’entrée', 'number'), C('year', 'Année'), C('place', 'Lieu'), C('variants', 'Variantes'), C('counts', 'Porteurs par génération (1,2,4…)')]}],
            options: [], sample: () => ({o: {title: 'D’où viennent mes noms'}, rows: sampleSur()})},
        ancestorgrid: {icon: '🟩', label: 'Quadrillage des ancêtres (une case par Sosa)', group: 'Généalogie', render: grid, legend: 'bottom', fromApp: gridApp,
            grids: [{key: 'rows', label: 'Les ancêtres (n° Sosa → valeur)', cols: [C('sosa', 'N° Sosa', 'number'), C('name', 'Nom'), C('value', 'Valeur (chiffre ou catégorie)'), C('detail', 'Détail')]}, {key: 'cats', label: 'Les catégories et leur couleur (facultatif)', cols: [C('value', 'Valeur'), C('color', 'Couleur', 'color')]}],
            options: [C('layout', 'Disposition', 'select', {choices: [['', 'Une ligne par génération'], ['square', 'Un carré (cases dans l’ordre des numéros)']]}), C('gens', 'Générations', 'range', {min: 2, max: 12, def: 7}),
                C('labels', 'Dans les cases', 'select', {choices: [['', 'Le nom (si la place le permet)'], ['sosa', 'Le n° Sosa'], ['both', 'Le nom et le n° Sosa'], ['none', 'Rien']]}), C('scale', 'Couleurs', 'select', {choices: [['', 'Automatique'], ['num', 'Un dégradé (chiffres)'], ['cat', 'Une couleur par catégorie']]}),
                C('lowColor', 'Couleur des petits chiffres', 'color', {def: '#fde0c5', when: s => s.o?.scale !== 'cat'}), C('highColor', 'Couleur des grands chiffres', 'color', {def: '#2e7d32', when: s => s.o?.scale !== 'cat'}), C('min', 'Dégradé : minimum', 'number', {when: s => s.o?.scale === 'num'}), C('max', 'Dégradé : maximum', 'number', {when: s => s.o?.scale === 'num'}),
                C('missingColor', 'Couleur des ancêtres pas trouvés', 'color', {def: '#e3e5e8'}), C('rowHeight', 'Hauteur des lignes', 'range', {unit: 'px', min: 6, max: 80, def: 24, when: s => s.o?.layout !== 'square'})],
            sample: () => ({o: {title: 'Ce que je sais de mes ancêtres', gens: 6, scale: 'cat'}, rows: sampleGrid(), cats: COMPLETE.map(([value, c]) => ({value, color: c}))})},
        chord: {icon: '🎼', label: 'Diagramme d’accord (mariages entre villages)', group: 'Liens', render: chord, noLegend: true, fromApp: chordApp,
            grids: [{key: 'rows', label: 'Les paires de lieux', cols: [C('from', 'Lieu A'), C('to', 'Lieu B'), C('value', 'Mariages', 'number'), C('color', 'Couleur de A', 'color')]}],
            options: [C('top', 'Lieux gardés (les autres : « Autres »)', 'range', {min: 2, max: 40, def: 12}), C('self', 'Mariages dans le même lieu (boucles)', 'check', {def: true}), C('sort', 'Ordre', 'select', {choices: [['', 'Du plus grand au plus petit'], ['az', 'A → Z']]}),
                C('opacity', 'Opacité des rubans', 'range', {unit: '%', min: 10, max: 100, def: 65}), C('labels', 'Noms', 'select', {choices: [['', 'Là où il y a la place'], ['all', 'Tous']]}), C('unit', 'Unité (ex. : mariages)'), C('height', 'Hauteur au plus', 'number', {unit: 'px', min: 200, max: 2400})],
            sample: () => ({o: {title: 'Mariages entre villages'}, rows: sampleChord()})},
        violin: {icon: '🎻', label: 'Violon (répartition par catégorie)', group: 'Chiffres', render: violin, noLegend: true, fromApp: violinApp,
            grids: [{key: 'rows', label: 'Les valeurs (une par ligne)', cols: [C('group', 'Catégorie (siècle, sexe…)'), C('value', 'Valeur', 'number')]}],
            options: [C('box', 'Médiane et quartiles', 'check', {def: true}), C('points', 'Montrer chaque valeur (points)', 'check'), C('values', 'Écrire la médiane', 'check', {def: true}), C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['median', 'Par médiane'], ['az', 'A → Z']]}),
                C('bandwidth', 'Lissage (vide = automatique)', 'number'), C('min', 'Axe : minimum'), C('max', 'Axe : maximum'), C('unit', 'Unité (ex. : ans)'), C('yLabel', 'Nom de l’axe'), C('height', 'Hauteur du dessin', 'number', {unit: 'px', min: 140, max: 2400})],
            sample: () => ({o: {title: 'Âge au décès par siècle', unit: 'ans', yLabel: 'Âge au décès'}, rows: sampleViolin()})},
    };
    for (const [k, kind] of Object.entries(NEW)) { if (!K[k]) K[k] = kind; }

    /* ═════════ Dans la page : plier, lire les années, ouvrir une fiche ═════════ */
    function keepApi(prev, api) { prev._dmoApi = api; }
    function accAfterDraw(prev, api) {
        prev._dmoApi = api; if (prev._dmoAcc) return; prev._dmoAcc = true;
        prev.addEventListener('click', e => { const t = e.target.closest?.('[data-acc-t]'); if (!t || !prev._dmoApi || prev._dmoApi.spec().kind !== 'accordion') return; e.stopPropagation();
            const row = t.closest('[data-acc-row]'), key = row.dataset.accKey, f = new Set((prev._dmoApi.spec().o?.folded || []).map(String)), isF = row.dataset.accF === '1';
            if (isF) { f.delete(key); f.add('+' + key); } else { f.add(key); f.delete('+' + key); }
            prev._dmoApi.set({folded: [...f].slice(0, 2000)}); });
    }
    /** l'accordéon posé ailleurs (fiche, tableau de bord, page) : plier et déplier sans enregistrer */
    function accToggle(t) {
        const g = t.closest('[data-acc]'), svg = g?.ownerSVGElement; if (!g || !svg) return;
        const row = t.closest('[data-acc-row]'); row.dataset.accF = row.dataset.accF === '1' ? '0' : '1';
        const rh = Number(g.dataset.accRh) || 28, tr = Number(g.dataset.accTr) || 6, ind = Number(g.dataset.accInd) || 20, all = [...g.querySelectorAll(':scope > [data-acc-row]')];
        const old = all.filter(r => r.getAttribute('display') !== 'none').length;
        let vis = 0; const yOf = new Map(), shown = new Set();
        all.forEach((r, i) => { const up = Number(r.dataset.accUp), p = up >= 0 ? all[up] : null, on = !p || (shown.has(p) && p.dataset.accF !== '1'); if (on) { shown.add(r); yOf.set(r, vis * rh); vis++; r.removeAttribute('display'); r.setAttribute('transform', `translate(0 ${r2(yOf.get(r))})`); } else r.setAttribute('display', 'none');
            const tg = r.querySelector(':scope > [data-acc-t]'); if (tg) { const fo = r.dataset.accF === '1'; tg.querySelector('text:not([data-acc-n])').textContent = fo ? '+' : '−'; const nn = tg.querySelector('[data-acc-n]'); if (nn) nn.textContent = fo ? '+' + all.filter(x => isUnder(all, x, r)).length : ''; }
            if (on && p) { const l = r.querySelector(':scope > [data-acc-link]'); if (l) { const d = Number(r.dataset.accD); l.setAttribute('d', `M${r2((d - 1) * ind + tr)} ${r2(yOf.get(p) - yOf.get(r) + rh / 2 + tr)}V${r2(rh / 2)}H${r2(d * ind + tr * 2 + 4)}`); } } });
        const delta = (vis - old) * rh; if (!delta) return;
        const vb = svg.viewBox.baseVal, H = (vb?.height || Number(svg.getAttribute('height'))) + delta;
        svg.setAttribute('viewBox', `0 0 ${vb.width} ${r2(H)}`); svg.setAttribute('height', r2(H));
        let el = g.parentElement; while (el && el.parentElement !== svg) el = el.parentElement; // le groupe du dessin ; ce qui suit (légende, source) descend
        for (let n = el?.nextElementSibling; n; n = n.nextElementSibling) { const m = /translate\(0 (-?[\d.]+)\)/.exec(n.getAttribute('transform') || ''); n.setAttribute('transform', `translate(0 ${r2((m ? Number(m[1]) : 0) + delta)})`); }
    }
    const isUnder = (all, x, r) => { let up = Number(x.dataset.accUp), k = 0; while (up >= 0 && k++ < 200) { if (all[up] === r) return true; up = Number(all[up].dataset.accUp); } return false; };

    /* ── 🔺 la pyramide : curseur des années et lecture ── */
    function pyrEnhance(g) {
        if (g.__dmo) return; g.__dmo = 1;
        let D; try { D = JSON.parse(g.getAttribute('data-dmo-pyr')); } catch (_) { return; }
        const svg = g.ownerSVGElement, host = svg?.parentElement; if (!host || !Array.isArray(D?.y) || D.y.length < 2) return;
        const yt = g.querySelector('[data-dmo-pyy]'), tt = g.querySelector('[data-dmo-pyt]'), bars = [...g.querySelectorAll('rect[data-pb]')], vt = [...g.querySelectorAll('text[data-pv]')];
        let i = Math.max(0, D.y.indexOf(Number(yt?.textContent))), timer = 0;
        const show = k => { i = clamp(k, 0, D.y.length - 1); const m = D.m[i], f = D.f[i]; if (yt) yt.textContent = String(D.y[i]); if (tt) tt.textContent = `${fmt(m.reduce((a, b) => a + b, 0) + f.reduce((a, b) => a + b, 0), 0)} personnes en vie`;
            bars.forEach(b => { const j = Number(b.dataset.pb), side = b.dataset.ps, v = (side === 'm' ? m : f)[j] || 0, w = v / D.max * D.half; b.setAttribute('width', r2(w)); if (side === 'm') b.setAttribute('x', r2(D.half - w)); const t = b.querySelector('title'); if (t) t.textContent = t.textContent.replace(/: \d+/, ': ' + v); });
            vt.forEach(t => { const j = Number(t.dataset.pv), side = t.dataset.ps, v = (side === 'm' ? m : f)[j] || 0, w = v / D.max * D.half; t.textContent = v ? fmt(v, 0) : ''; t.setAttribute('x', r2(side === 'm' ? D.half - w - 4 : D.half + D.labW + w + 4)); });
            if (bar) { bar.querySelector('input').value = String(i); bar.querySelector('output').textContent = String(D.y[i]); } };
        const bar = document.createElement('div'); bar.className = 'dmo-tools';
        bar.innerHTML = `<button type="button" class="icon-button small" data-dmo-play title="Faire défiler les années" aria-label="Faire défiler les années">▶</button><input type="range" min="0" max="${D.y.length - 1}" step="1" value="${i}" aria-label="Année"><output>${esc(D.y[i])}</output>`;
        const btn = bar.querySelector('[data-dmo-play]'), input = bar.querySelector('input');
        const stop = () => { clearInterval(timer); timer = 0; btn.textContent = '▶'; };
        const persist = () => { const prev = g.closest('[data-dg-preview]'); if (prev?._dmoApi?.spec?.().kind === 'alivepyr') prev._dmoApi.set({year: D.y[i]}); };
        input.addEventListener('input', () => { stop(); show(Number(input.value)); });
        input.addEventListener('change', persist);
        btn.addEventListener('click', () => { if (timer) { stop(); persist(); return; } if (i >= D.y.length - 1) show(0); btn.textContent = '⏸'; timer = setInterval(() => { if (!g.isConnected) return stop(); if (i >= D.y.length - 1) { stop(); return; } show(i + Math.max(1, Math.round(D.y.length / 160))); }, 80); });
        host.querySelector(':scope > .dmo-tools')?.remove(); host.appendChild(bar);
    }
    let scanT = 0;
    const scan = () => document.querySelectorAll('[data-dmo-pyr]').forEach(g => { if (!g.__dmo && !g.closest('.h-dg-mini')) pyrEnhance(g); });
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) new MutationObserver(() => { clearTimeout(scanT); scanT = setTimeout(scan, 60); }).observe(document.documentElement, {childList: true, subtree: true});
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', e => {
        const t = e.target.closest?.('[data-acc-t]');
        if (t && !t.closest('[data-dg-preview]') && !t.closest('.h-dg-mini')) { e.preventDefault(); accToggle(t); return; }
        const c = e.target.closest?.('[data-dmo-pid]'); if (!c || c.closest('.h-dg-mini')) return;
        if (c.closest('.h-dg-dlg, dialog[open]')) { A()?.toast?.(`${c.querySelector('title')?.textContent?.split(' · ').slice(0, 2).join(' · ') || 'Cette personne'} : ferme l’éditeur et clique à nouveau pour ouvrir sa fiche.`); return; }
        A()?.openPersonById?.(Number(c.dataset.dmoPid));
    });
    ext.diagramMore = {aliveCounts, peopleOf, treeOf, forceLayout, quant, CRISES, COMPLETE, accToggle};
})();
