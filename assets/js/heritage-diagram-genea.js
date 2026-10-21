/* LCNDA — 📊 Diagrammes « Généalogie » et « Frises » (s'ajoutent aux types de heritage-diagrams-render.js) :
 *  - 🪭 Éventail d'ascendance coloré par un chiffre ou une catégorie (demi-cercle, 3/4, cercle ; 3 à 10 générations) ;
 *  - 🌞 Soleil des lignées (anneaux, parts proportionnelles) ;
 *  - 🕸 Réseau de relations (disposition par forces calculée par étapes, glisser les points, zoom) ;
 *  - 🌈 Arcs de liens (personnes sur une ligne) ; ⭕ Venn de 2 à 4 ensembles (remplace l'ancien, mêmes données) ;
 *  - 🗓 Calendrier coloré, 🌸 Rose des mois, 🌀 Spirale du temps.
 * Chaque type : {icon, label, group, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp}.
 * fromApp = {html(spec), bind(pane, {spec, apply})} : l'onglet « Depuis l'app » de l'éditeur (heritage-diagrams.js).
 * Données de l'app : GET diagram_genea (lib/diagram_genea.php). Tout texte passe par esc() ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender; if (!R) return;
    const A = () => window.LCNDA_APP;
    const K = R.KINDS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : /^\d{1,9}$/.test(v) ? +v : R.num(v)), color = R.color;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const r2 = v => Math.round(v * 100) / 100;
    const NF = [0, 1, 2].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}));
    const fmt = (n, d = 1) => NF[clamp(d, 0, 2)].format(Number(n) || 0); // un seul formateur : toLocaleString à chaque nombre est très lent
    const TAU = Math.PI * 2;
    const BASE_PAL = R.PALETTES.vive;
    const pal = spec => R.PALETTES[spec.o?.palette] || BASE_PAL;
    const pick = (spec, i, c) => color(c, pal(spec)[i % pal(spec).length]);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', rotate = 0, baseline = 'middle', style = '', op = 0} = {}) =>
        `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}${rotate ? ` transform="rotate(${r2(rotate)} ${r2(x)} ${r2(y)})"` : ''}${style ? ` font-style="${style}"` : ''}>${esc(s)}</text>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const hex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); if (!a || !b) return t < .5 ? c1 : c2; return hex(a.map((v, i) => v + (b[i] - v) * clamp(t, 0, 1))); };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const rows = (spec, key = 'rows') => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object');
    const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    const isNumText = v => /^\s*[-+]?[\d\s ]*[.,]?\d+\s*%?\s*$/.test(String(v ?? ''));
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888'}), legend: [], desc: msg});
    const P = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    /** une part d'anneau (r0 = 0 : une part de disque ; 360° : un anneau entier) */
    function wedge(cx, cy, r0, r1, a0, a1) {
        if (a1 - a0 >= TAU - 1e-6) { const ring = r => `M${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 1 ${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 1 ${r2(cx + r)} ${r2(cy)}Z`; return r0 > .5 ? ring(r1) + ring(r0) : ring(r1); }
        const lg = a1 - a0 > Math.PI ? 1 : 0, [x1, y1] = P(cx, cy, r1, a0), [x2, y2] = P(cx, cy, r1, a1);
        if (r0 <= .5) return `M${r2(cx)} ${r2(cy)}L${r2(x1)} ${r2(y1)}A${r2(r1)} ${r2(r1)} 0 ${lg} 1 ${r2(x2)} ${r2(y2)}Z`;
        const [x3, y3] = P(cx, cy, r0, a1), [x4, y4] = P(cx, cy, r0, a0);
        return `M${r2(x1)} ${r2(y1)}A${r2(r1)} ${r2(r1)} 0 ${lg} 1 ${r2(x2)} ${r2(y2)}L${r2(x3)} ${r2(y3)}A${r2(r0)} ${r2(r0)} 0 ${lg} 0 ${r2(x4)} ${r2(y4)}Z`;
    }
    /** le texte d'une part : le long de l'arc si la part est large, sinon dans le sens du rayon ; toujours lisible (jamais à l'envers) */
    function wedgeText(cx, cy, r0, r1, a0, a1, lines, fs, fill) {
        lines = lines.map(s => String(s ?? '').trim()).filter(Boolean); if (!lines.length) return '';
        const am = (a0 + a1) / 2, rm = (r0 + r1) / 2, arc = rm * (a1 - a0), depth = r1 - r0, n = lines.length;
        const deg = ((am * 180 / Math.PI) % 360 + 360) % 360;
        let rot, maxW, f;
        if (arc > depth * 1.1) { rot = deg + 90; if (deg > 0 && deg < 180) rot -= 180; maxW = Math.min(arc * .9, rm * 2 * .9); f = Math.min(fs, depth * .78 / n / 1.12); }
        else { rot = deg; if (deg > 90 && deg < 270) rot += 180; maxW = depth * .9; f = Math.min(fs, arc * .78 / n / 1.12); }
        if (f < 4.5) return '';
        const [x, y] = P(cx, cy, rm, am);
        const parts = lines.map((s, i) => { const t = cut(s, maxW, f); return t ? T(x, y + (i - (n - 1) / 2) * f * 1.12, t, {size: f, anchor: 'middle', fill, weight: i === 0 ? 600 : 400}) : ''; }).join('');
        return parts ? `<g transform="rotate(${r2(rot)} ${r2(x)} ${r2(y)})">${parts}</g>` : '';
    }
    /** une échelle de couleurs : chiffres (dégradé) ou catégories (palette, ou les couleurs données) */
    function colorScale(spec, values, {mode = '', cats = [], low = '#fde0c5', high = '#b3261e', min = '', max = ''} = {}) {
        const vals = values.filter(v => v !== '' && v != null).map(String);
        const numeric = mode === 'num' || (mode !== 'cat' && vals.length > 0 && vals.filter(isNumText).length >= vals.length * .8);
        if (numeric) {
            const ns = vals.filter(isNumText).map(num), lo = min !== '' && min != null ? num(min) : Math.min(...ns), hi = max !== '' && max != null ? num(max) : Math.max(...ns);
            const at = v => { if (v === '' || v == null || !isNumText(v)) return null; return mix(low, high, hi > lo ? (num(v) - lo) / (hi - lo) : 1); };
            const steps = ns.length ? [0, .25, .5, .75, 1].map(t => ({label: fmt(lo + (hi - lo) * t), color: mix(low, high, t)})) : [];
            return {numeric: true, at, legend: steps, lo, hi};
        }
        const given = new Map(cats.filter(c => str(c.value)).map(c => [str(c.value).toLowerCase(), color(c.color, '')]));
        const freq = new Map(); vals.forEach(v => freq.set(v, (freq.get(v) || 0) + 1));
        const order = [...cats.map(c => str(c.value)).filter(Boolean), ...[...freq.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)].filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);
        const idx = new Map(order.map((v, i) => [v.toLowerCase(), i]));
        const at = v => { const k = String(v ?? '').trim().toLowerCase(); if (!k) return null; return given.get(k) || pick(spec, idx.get(k) ?? 0); };
        return {numeric: false, at, legend: order.slice(0, 24).map(v => ({label: v, color: at(v)}))};
    }

    /* ═════════ 🪭 Éventail d'ascendance ═════════ */
    const SHAPES = {half: [Math.PI, Math.PI], three: [Math.PI * .75, Math.PI * 1.5], full: [Math.PI / 2, TAU]};
    function fan(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).map(r => ({s: Math.floor(num(r.sosa)), name: str(r.name, 120), value: str(r.value, 120), detail: str(r.detail, 120)})).filter(r => r.s >= 1 && r.s < 2048);
        const by = new Map(); list.forEach(r => { if (!by.has(r.s)) by.set(r.s, r); });
        const maxS = Math.max(1, ...by.keys()), gens = clamp(Math.round(num(o.gens)) || Math.max(3, Math.floor(Math.log2(maxS)) + 1), 3, 10);
        const shape = SHAPES[o.shape] ? o.shape : 'half', [a0, span] = SHAPES[shape];
        const sc = colorScale(spec, [...by.values()].map(r => r.value), {mode: o.scale, cats: rows(spec, 'cats'), low: color(o.lowColor, '#fde0c5'), high: color(o.highColor, '#b3261e'), min: o.min, max: o.max});
        const kh = shape === 'half' ? 1 : shape === 'three' ? 1 + Math.SQRT1_2 : 2;
        const hMax = num(o.height) > 80 ? num(o.height) : 1e9;
        const Rm = Math.max(40, Math.min(W / 2 - 2, (hMax - (shape === 'half' ? fs * 2 : 0)) / kh));
        const cx = W / 2, cy = Rm + 1;
        const r0 = Rm * clamp(num(o.center) || 16, 6, 40) / 100, ring = (Rm - r0) / gens;
        const emptyFill = '#8882', stroke = o.border === false ? 'none' : '#ffffff', mode = o.labels || 'name';
        let svg = '', filled = 0;
        const lines = r => mode === 'none' || !r ? [] : mode === 'value' ? [r.value] : mode === 'both' ? [r.name, r.value] : mode === 'detail' ? [r.name, r.detail] : [r.name];
        for (let g = 1; g < gens; g++) {
            const n = 2 ** g, ri = r0 + (g - 1) * ring, ro = ri + ring;
            for (let k = 0; k < n; k++) {
                const s = n + k, r = by.get(s), b0 = a0 + span * k / n, b1 = a0 + span * (k + 1) / n, fill = (r && sc.at(r.value)) || (r ? '#d9dde3' : emptyFill);
                if (r) filled++;
                svg += `<path d="${wedge(cx, cy, ri, ro, b0, b1)}" fill="${fill}" stroke="${stroke}" stroke-width="${g > 7 ? .4 : 1}" fill-rule="evenodd"><title>${esc(`Sosa ${s}${r ? ' · ' + r.name : ' · inconnu'}${r?.value ? ' · ' + r.value : ''}${r?.detail ? ' · ' + r.detail : ''}`)}</title></path>`;
                if (r) svg += wedgeText(cx, cy, ri, ro, b0, b1, lines(r), fs * (g > 4 ? .85 : 1), contrast(fill));
            }
        }
        // la personne de départ au centre
        const root = by.get(1), rf = (root && sc.at(root.value)) || (root ? '#d9dde3' : emptyFill);
        if (root) filled++;
        if (shape === 'full') svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r0)}" fill="${rf}" stroke="${stroke}"><title>${esc(`Sosa 1 · ${root?.name || ''}${root?.value ? ' · ' + root.value : ''}`)}</title></circle>`;
        else svg += `<path d="${wedge(cx, cy, 0, r0, a0, a0 + span)}" fill="${rf}" stroke="${stroke}"><title>${esc(`Sosa 1 · ${root?.name || ''}${root?.value ? ' · ' + root.value : ''}`)}</title></path>`;
        if (root && mode !== 'none') {
            const f = Math.min(fs * 1.05, r0 / 3.2), y0 = shape === 'half' ? cy - r0 * .42 : cy;
            const l = lines(root).map(s => cut(s, r0 * 1.7, f)).filter(Boolean);
            l.forEach((s, i) => { svg += T(cx, y0 + (i - (l.length - 1) / 2) * f * 1.15, s, {size: f, anchor: 'middle', weight: i ? 400 : 700, fill: contrast(rf)}); });
        }
        if (shape === 'half' && o.genLabels !== false) for (let g = 1; g < gens; g++) { const ri = r0 + (g - .5) * ring; if (ring > fs * .9) { svg += T(cx - ri, cy + fs * .9, `${g + 1}`, {size: fs * .75, anchor: 'middle', fill: '#888'}) + T(cx + ri, cy + fs * .9, `${g + 1}`, {size: fs * .75, anchor: 'middle', fill: '#888'}); } }
        const H = shape === 'half' ? Rm + fs * 2 : shape === 'three' ? Rm * kh + 2 : Rm * 2 + 2;
        const legend = sc.legend.length ? sc.legend.map(it => ({...it, label: sc.numeric && o.unit ? `${it.label} ${o.unit}` : it.label})) : [];
        return {h: H, svg, legend, desc: `Éventail d’ascendance de ${gens} générations : ${filled} ancêtre${filled > 1 ? 's' : ''} sur ${2 ** gens - 1} places.`};
    }
    const FIRST_M = ['Jean', 'Pierre', 'Louis', 'François', 'Joseph', 'Jacques', 'Julien', 'René', 'Mathurin', 'Guillaume', 'Yves', 'Michel', 'Nicolas', 'Étienne', 'Charles', 'Antoine'];
    const FIRST_F = ['Marie', 'Anne', 'Jeanne', 'Françoise', 'Perrine', 'Julienne', 'Louise', 'Catherine', 'Marguerite', 'Rose', 'Madeleine', 'Élisabeth', 'Renée', 'Victoire', 'Agathe', 'Hélène'];
    const LAST = ['MARTIN', 'DURAND', 'LEFÈVRE', 'MOREAU', 'GARNIER', 'ROUX', 'FOURNIER', 'GIRARD', 'BONNET', 'LAMBERT', 'FONTAINE', 'CHEVALIER', 'ROBIN', 'MASSON', 'PETIT', 'LEROY', 'GAUTIER', 'PERRIN', 'MOREL', 'BLANC', 'GUÉRIN', 'BOYER', 'COLIN', 'VIDAL', 'BRUNET', 'RENAUD', 'JOLY', 'ROCHE', 'NOËL', 'MEYER', 'LUCAS', 'DUMAS'];
    function sampleAncestors(gens) {
        const out = [], last = {1: 'MARTIN'}, regions = ['Bretagne', 'Normandie', 'Anjou', 'Poitou'];
        for (let s = 1; s < 2 ** gens; s++) {
            const g = Math.floor(Math.log2(s)); if (s > 1) last[s] = s % 2 === 0 ? last[s >> 1] : LAST[(s * 7) % LAST.length];
            if (g >= 3 && (s * 13) % 11 === 0) continue; // quelques branches inconnues, comme dans la vraie vie
            if (g >= 4 && out.every(r => r.sosa !== s >> 1)) continue;
            const female = s % 2 === 1 && s > 1, first = (female ? FIRST_F : FIRST_M)[(s * 5 + g) % 16], y = 1985 - g * 29 - (s % 5) * 2;
            const region = g < 2 ? 'Paris' : (s * 17) % 9 === 0 ? 'Paris' : regions[(s >> (g - 2)) & 3];
            out.push({sosa: s, name: `${first} ${last[s]}`, value: region, detail: `° ${y}`});
        }
        return out;
    }
    const fanApp = {
        html: () => `<div class="h-dg-app gn-app"><h4>🪭 Mes ancêtres (numéros Sosa)</h4><p class="muted">Chaque case reçoit un ancêtre et se colore selon ce que tu choisis. Les cases vides sont les ancêtres pas encore trouvés.</p>
            <span class="pk-lab">Personne au centre</span>${A().pickerField ? A().pickerField({name: 'gn_root', kind: 'person', value: Number(A().state?.bootstrap?.startPersonId) || null}) : ''}
            <label>Générations<select data-gn="gens">${[3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label>Colorer selon<select data-gn="by"><option value="score">Taux de recherche (dates, lieux, mariage, source)</option><option value="state">Région de naissance</option><option value="county">Département de naissance</option><option value="country">Pays de naissance</option><option value="birth_place">Commune de naissance</option><option value="occupation">Métier</option><option value="century">Siècle de naissance</option><option value="last">Nom de famille</option><option value="gender">Sexe</option></select></label>
            <button type="button" class="button small" data-gn-go>Prendre mes ancêtres</button><p class="muted" data-gn-msg aria-live="polite"></p></div>`,
        bind: (pane, io) => bindApp(pane, async () => {
            const by = val(pane, 'by'), r = await get({what: 'fan', root: rootOf(pane), gens: val(pane, 'gens')});
            if (!r.rows?.length) throw new Error('Aucun ancêtre trouvé pour cette personne.');
            const roman = n => { const v = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = '', x = n; for (const [a, b] of [[20, 'XX'], ...v]) while (x >= a) { s += b; x -= a; } return s; };
            const value = p => by === 'score' ? String(p.score) : by === 'century' ? (p.birth_year ? `${roman(Math.ceil(p.birth_year / 100))}e siècle` : '') : by === 'gender' ? ({male: 'Homme', female: 'Femme'}[p.gender] || 'Inconnu') : str(p[by], 80);
            const s = io.spec(), detail = p => [p.birth ? `° ${String(p.birth).replace(/-00/g, '').slice(0, 10)}${p.birth_place ? ' ' + p.birth_place : ''}` : '', p.death ? `† ${String(p.death).replace(/-00/g, '').slice(0, 10)}` : ''].filter(Boolean).join(' · ');
            s.rows = r.rows.map(p => ({sosa: p.sosa, name: p.name, value: value(p), detail: detail(p)}));
            s.cats = by === 'gender' ? ['Homme', 'Femme', 'Inconnu'].map(v => ({value: v, color: KNOWN[fold(v)]})) : []; s.o = {...s.o, gens: r.gens, scale: by === 'score' ? 'num' : 'cat', ...(by === 'score' ? {min: 0, max: 100, unit: '%', lowColor: '#f6d5d0', highColor: '#2e7d32'} : {min: '', max: '', unit: ''}), title: `Ascendance de ${r.root_name} — ${pane.querySelector('[data-gn="by"]').selectedOptions[0].textContent.replace(/\s*\(.*$/, '').toLowerCase()}`};
            io.apply(s); return `${r.rows.length} ancêtres pris dans l’app.`;
        }),
    };

    /* ═════════ 🌞 Soleil des lignées ═════════ */
    function hierarchy(spec, cap = 5000) {
        const list = rows(spec).slice(0, cap).map((r, i) => ({name: str(r.name, 120), parent: str(r.parent, 120), v: num(r.value), color: color(r.color, ''), i, kids: []})).filter(n => n.name);
        const by = new Map(); list.forEach(n => { if (!by.has(n.name)) by.set(n.name, n); });
        const roots = [];
        by.forEach(n => { const p = n.parent && n.parent !== n.name ? by.get(n.parent) : null; if (p) p.kids.push(n); else roots.push(n); });
        // une boucle (A dans B dans A) : ce qui n'est pas atteint depuis une racine devient une racine
        const seen = new Set(), walk = n => { const st = [n]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); x.kids.forEach(k => st.push(k)); } };
        roots.forEach(walk); by.forEach(n => { if (!seen.has(n)) { roots.push(n); n.kids = n.kids.filter(k => !seen.has(k)); walk(n); } });
        return {roots, count: by.size};
    }
    function sunburst(spec, W, fs) {
        const o = spec.o || {}, {roots, count} = hierarchy(spec);
        if (!roots.length) return empty(W, fs, 'Ajoute des lignes : un nom, le nom au-dessus (vide pour le centre) et un chiffre.');
        const sizeBy = o.sizeBy || 'value', maxD = clamp(Math.round(num(o.depth)) || 6, 1, 12);
        // la taille d'une part : son chiffre, ou la somme de ses parts (le plus grand des deux) ; « descendants » = 1 + ses descendants
        const size = n => { const st = [[n, 0]], order = []; while (st.length) { const [x, d] = st.pop(); order.push([x, d]); if (d < 40) x.kids.forEach(k => st.push([k, d + 1])); }
            for (let i = order.length - 1; i >= 0; i--) { const [x] = order[i], sum = x.kids.reduce((a, k) => a + (k.size || 0), 0); x.size = sizeBy === 'desc' ? 1 + sum : sizeBy === 'leaves' ? (x.kids.length ? sum : 1) : Math.max(Math.max(0, x.v) || (x.kids.length ? 0 : 1), sum); } return n.size; };
        roots.forEach(size);
        const one = roots.length === 1 ? roots[0] : null, top = one ? one.kids : roots, total = one ? one.size : roots.reduce((a, r) => a + r.size, 0);
        const half = o.angle === 'half', a0 = half ? Math.PI : -Math.PI / 2, span = half ? Math.PI : TAU;
        const hMax = num(o.height) > 80 ? num(o.height) : 1e9, Rm = Math.max(40, Math.min(W / 2 - 2, half ? hMax - fs : hMax / 2 - 1)), cx = W / 2, cy = Rm + 1;
        const hole = Rm * clamp(num(o.hole) || 18, 0, 60) / 100;
        let depth = 0; const deepest = (n, d) => { if (d > depth) depth = d; if (d < maxD) n.kids.forEach(k => deepest(k, d + 1)); };
        top.forEach(n => deepest(n, 1)); depth = Math.max(1, Math.min(depth, maxD));
        const ring = (Rm - hole) / depth, stroke = o.border === false ? 'none' : '#ffffff';
        let svg = '', drawn = 0; const legend = [];
        const lab = n => o.labels === 'none' ? [] : o.labels === 'value' ? [`${n.name} (${fmt(n.size)})`] : [n.name];
        const draw = (n, d, b0, b1, base) => {
            if (drawn > 3000 || b1 - b0 < .002) return;
            const ri = hole + (d - 1) * ring, ro = ri + ring;
            const fill = n.color || (o.colorBy === 'depth' ? mix(pick(spec, d - 1), '#ffffff', 0) : mix(base, '#ffffff', Math.min(.6, (d - 1) * .13)));
            drawn++;
            svg += `<path d="${wedge(cx, cy, ri, ro, b0, b1)}" fill="${fill}" stroke="${stroke}" stroke-width="${d > 5 ? .5 : 1}" fill-rule="evenodd"><title>${esc(`${n.name} : ${fmt(n.size)}${total ? ` (${fmt(100 * n.size / total)} %)` : ''}`)}</title></path>`;
            svg += wedgeText(cx, cy, ri, ro, b0, b1, lab(n), fs * .9, contrast(fill));
            if (d >= depth || !n.kids.length) return;
            const tot = n.kids.reduce((a, k) => a + k.size, 0) || 1, inner = sizeBy === 'value' ? Math.min(1, tot / (n.size || tot)) : 1;
            let a = b0; const kids = o.sort === 'size' ? [...n.kids].sort((x, y) => y.size - x.size) : n.kids;
            kids.forEach(k => { const w = (b1 - b0) * inner * k.size / tot; draw(k, d + 1, a, a + w, n.color && o.colorBy !== 'depth' ? n.color : base); a += w; });
        };
        let a = a0; const tops = o.sort === 'size' ? [...top].sort((x, y) => y.size - x.size) : top, sumTop = tops.reduce((s, t) => s + t.size, 0) || 1;
        const inner = one && sizeBy === 'value' ? Math.min(1, sumTop / (one.size || sumTop)) : 1;
        tops.forEach((t, i) => { const w = span * inner * t.size / sumTop, base = t.color || pick(spec, i); draw(t, 1, a, a + w, base); if (i < 16) legend.push({label: t.name, color: base}); a += w; });
        if (hole > 8) {
            svg += half ? `<path d="${wedge(cx, cy, 0, hole, a0, a0 + span)}" fill="#8881"/>` : `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(hole)}" fill="#8881"/>`;
            const f = Math.min(fs * 1.1, hole / 3), y0 = half ? cy - hole * .4 : cy, name = str(o.centerText) || one?.name || '';
            if (name) svg += T(cx, y0 - f * .6, cut(name, hole * 1.8, f), {size: f, anchor: 'middle', weight: 700});
            svg += T(cx, y0 + f * .7, fmt(total), {size: f * .95, anchor: 'middle', fill: '#666'});
        }
        return {h: half ? Rm + 2 : Rm * 2 + 2, svg, legend: o.colorBy === 'depth' ? [] : legend, desc: `Soleil de ${count} parts sur ${depth} anneaux, total ${fmt(total)}.`};
    }
    function sampleSun() {
        const rows = [{name: 'Jean MARTIN (1792)', parent: ''}], kids = [['Pierre', 4], ['Marie', 2], ['Louis', 3], ['Rose', 1]];
        kids.forEach(([k, n], i) => { const me = `${k} MARTIN`; rows.push({name: me, parent: 'Jean MARTIN (1792)'});
            for (let j = 0; j < n; j++) { const c = `${FIRST_M[(i * 3 + j) % 16]} ${k === 'Marie' || k === 'Rose' ? LAST[i + 3] : 'MARTIN'} (${1850 + j * 3})`; rows.push({name: c, parent: me});
                for (let m = 0; m < (i + j) % 4 + 1; m++) rows.push({name: `${FIRST_F[(i + j + m) % 16]} (${1880 + m * 2 + j})`, parent: c}); } });
        return rows;
    }
    const sunApp = {
        html: () => `<div class="h-dg-app gn-app"><h4>🌞 Une descendance</h4><p class="muted">Chaque enfant devient une part de son parent ; la taille d’une part = le nombre de descendants (la personne comprise).</p>
            <span class="pk-lab">Ancêtre au centre</span>${A().pickerField ? A().pickerField({name: 'gn_root', kind: 'person', value: Number(A().state?.bootstrap?.startPersonId) || null}) : ''}
            <label>Générations<select data-gn="gens">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <button type="button" class="button small" data-gn-go>Prendre la descendance</button><p class="muted" data-gn-msg aria-live="polite"></p></div>`,
        bind: (pane, io) => bindApp(pane, async () => {
            const r = await get({what: 'desc', root: rootOf(pane), gens: val(pane, 'gens')});
            if ((r.nodes || []).length < 2) throw new Error('Aucun descendant trouvé pour cette personne.');
            const count = new Map(); r.nodes.forEach(n => count.set(n.name, (count.get(n.name) || 0) + 1));
            const label = new Map(r.nodes.map(n => [n.id, count.get(n.name) > 1 ? `${n.name} (${n.year || 'n° ' + n.id})` : n.name]));
            const used = new Set(); label.forEach((v, k) => { let x = v; if (used.has(x)) x = `${v} · n° ${k}`; used.add(x); label.set(k, x); });
            const s = io.spec(); s.rows = r.nodes.map(n => ({name: label.get(n.id), parent: n.parent ? label.get(n.parent) || '' : '', value: ''}));
            s.o = {...s.o, sizeBy: 'desc', depth: Number(val(pane, 'gens')), title: `Descendance de ${r.nodes[0].name}`};
            io.apply(s); return `${r.nodes.length} personnes prises dans l’app${r.truncated ? ' (les 3 000 premières)' : ''}.`;
        }),
    };

    /* ═════════ Liens (réseau et arcs) : les points et les traits ═════════ */
    function graphOf(spec, {maxNodes = 800, maxLinks = 3000} = {}) {
        const nodes = [], idx = new Map(), deg = [];
        const add = (name, group = '', col = '') => { const k = name.toLowerCase(); if (idx.has(k)) { const n = nodes[idx.get(k)]; if (group && !n.group) n.group = group; if (col && !n.color) n.color = col; return idx.get(k); } if (nodes.length >= maxNodes) return -1; idx.set(k, nodes.length); nodes.push({name, group, color: col}); deg.push(0); return nodes.length - 1; };
        rows(spec, 'nodes').slice(0, maxNodes).forEach(r => { const n = str(r.name, 120); if (n) add(n, str(r.group, 80), color(r.color, '')); });
        const links = [];
        for (const r of rows(spec).slice(0, maxLinks * 2)) {
            const a = str(r.a, 120), b = str(r.b, 120); if (!a || !b || a.toLowerCase() === b.toLowerCase()) continue;
            const i = add(a), j = add(b); if (i < 0 || j < 0) continue;
            links.push({i, j, kind: str(r.kind, 60), w: Math.max(.1, num(r.weight) || 1)}); deg[i]++; deg[j]++;
            if (links.length >= maxLinks) break;
        }
        nodes.forEach((n, i) => { n.deg = deg[i]; });
        return {nodes, links};
    }
    /** des groupes trouvés tout seuls (propagation d'étiquettes, toujours le même résultat) */
    function communities(g) {
        const n = g.nodes.length, lab = Int32Array.from({length: n}, (_, i) => i), adj = Array.from({length: n}, () => []);
        g.links.forEach(l => { adj[l.i].push([l.j, l.w]); adj[l.j].push([l.i, l.w]); });
        for (let it = 0; it < 12; it++) { let moved = 0;
            for (let i = 0; i < n; i++) { if (!adj[i].length) continue; const sc = new Map(); adj[i].forEach(([j, w]) => sc.set(lab[j], (sc.get(lab[j]) || 0) + w)); let best = lab[i], bw = sc.get(best) || 0; sc.forEach((w, l) => { if (w > bw || (w === bw && l < best)) { best = l; bw = w; } }); if (best !== lab[i]) { lab[i] = best; moved++; } }
            if (!moved) break; }
        const size = new Map(); lab.forEach(l => size.set(l, (size.get(l) || 0) + 1));
        const order = [...size.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l), name = new Map(order.map((l, i) => [l, i]));
        return Array.from(lab, l => name.get(l));
    }
    function nodeColors(spec, g, by) {
        const o = spec.o || {};
        if (by === 'none') return {col: g.nodes.map(n => n.color || '#4e79a7'), legend: []};
        if (by === 'community' || (by !== 'kind' && !g.nodes.some(n => n.group))) {
            const c = communities(g), cnt = new Map(); c.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1));
            return {col: g.nodes.map((n, i) => n.color || (cnt.get(c[i]) > 1 ? pick(spec, c[i]) : '#9aa3ad')), legend: [], groups: c};
        }
        if (by === 'kind') return {col: g.nodes.map(n => n.color || '#5f6b7a'), legend: []};
        const groups = [...new Set(g.nodes.map(n => n.group || ''))].filter(Boolean), gi = new Map(groups.map((x, i) => [x, i]));
        const col = g.nodes.map(n => n.color || (n.group ? pick(spec, gi.get(n.group)) : '#9aa3ad'));
        const legend = groups.slice(0, 20).map(x => ({label: x, color: g.nodes.find(n => n.group === x)?.color || pick(spec, gi.get(x))}));
        return {col, legend, groups: g.nodes.map(n => (n.group ? gi.get(n.group) : -1))};
    }
    const kindColors = (spec, g) => { const kinds = [...new Set(g.links.map(l => l.kind))]; const m = new Map(kinds.map((k, i) => [k, rows(spec, 'kinds').find(x => str(x.kind).toLowerCase() === k.toLowerCase())?.color ? color(rows(spec, 'kinds').find(x => str(x.kind).toLowerCase() === k.toLowerCase()).color) : PALETTE_LINKS[i % PALETTE_LINKS.length]])); return {m, kinds}; };
    const PALETTE_LINKS = ['#6b7a8f', '#e15759', '#4e79a7', '#59a14f', '#f28e2b', '#b07aa1', '#9c755f', '#76b7b2', '#edc948', '#ff9da7'];

    /* ═════════ 🕸 Réseau : disposition par forces, gardée en mémoire (le dessin suivant repart de là) ═════════ */
    const NET = new Map();
    const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
    function netState(g, o) {
        const key = 'n' + hashStr(g.nodes.map(n => n.name).join('\u0001') + '\u0002' + g.links.map(l => l.i + ',' + l.j + ',' + l.w).join(';') + '\u0002' + (o.strength || '') + (o.cluster ? 'c' : '') + (o.groupKey || ''));
        let st = NET.get(key);
        if (st) { NET.delete(key); NET.set(key, st); return st; }
        const n = g.nodes.length, x = new Float64Array(n), y = new Float64Array(n);
        for (let i = 0; i < n; i++) { const r = Math.sqrt(i + .5) / Math.sqrt(n), t = i * 2.399963; x[i] = r * Math.cos(t); y[i] = r * Math.sin(t); }
        const E = new Int32Array(g.links.length * 2), Wt = new Float64Array(g.links.length);
        g.links.forEach((l, k) => { E[k * 2] = l.i; E[k * 2 + 1] = l.j; Wt[k] = Math.min(3, 1 + Math.log(l.w)); });
        st = {key, n, x, y, dx: new Float64Array(n), dy: new Float64Array(n), pin: new Uint8Array(n), E, Wt, alpha: 1, iter: 0, k: 1.3 / Math.sqrt(Math.max(1, n)), rep: clamp(num(o.strength) || 1, .2, 4), grp: o.groupArr || null, cluster: !!o.cluster};
        NET.set(key, st); while (NET.size > 40) NET.delete(NET.keys().next().value);
        runFor(st, 60, 400);
        return st;
    }
    function netStep(st) {
        const {n, x, y, dx, dy, E, Wt, pin} = st, k = st.k, k2 = k * k * st.rep;
        dx.fill(0); dy.fill(0);
        if (n <= 450) {
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let ux = x[i] - x[j], uy = y[i] - y[j], d2 = ux * ux + uy * uy; if (d2 < 1e-6) { ux = (i - j) * 1e-3; uy = 1e-3; d2 = 2e-6; } const f = k2 / d2; dx[i] += ux * f; dy[i] += uy * f; dx[j] -= ux * f; dy[j] -= uy * f; }
        } else { // beaucoup de points : seuls les voisins proches se repoussent (grille)
            const cs = k * 3, cells = new Map(), key = (a, b) => a * 73856093 ^ b * 19349663;
            for (let i = 0; i < n; i++) { const c = key(Math.floor(x[i] / cs), Math.floor(y[i] / cs)); let l = cells.get(c); if (!l) cells.set(c, l = []); l.push(i); }
            for (let i = 0; i < n; i++) { const cx = Math.floor(x[i] / cs), cy = Math.floor(y[i] / cs);
                for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = cells.get(key(cx + a, cy + b)); if (!l) continue; for (const j of l) { if (j <= i) continue; let ux = x[i] - x[j], uy = y[i] - y[j], d2 = ux * ux + uy * uy; if (d2 < 1e-6) { ux = 1e-3; uy = (i - j) * 1e-3; d2 = 2e-6; } const f = k2 / d2; dx[i] += ux * f; dy[i] += uy * f; dx[j] -= ux * f; dy[j] -= uy * f; } } }
        }
        for (let e = 0; e < Wt.length; e++) { const i = E[e * 2], j = E[e * 2 + 1], ux = x[i] - x[j], uy = y[i] - y[j], d = Math.sqrt(ux * ux + uy * uy) || 1e-4, f = d / k * Wt[e]; dx[i] -= ux * f; dy[i] -= uy * f; dx[j] += ux * f; dy[j] += uy * f; }
        if (st.cluster && st.grp) { const sx = new Map(); for (let i = 0; i < n; i++) { const gk = st.grp[i]; if (gk < 0) continue; const s = sx.get(gk) || [0, 0, 0]; s[0] += x[i]; s[1] += y[i]; s[2]++; sx.set(gk, s); }
            for (let i = 0; i < n; i++) { const s = sx.get(st.grp[i]); if (!s || s[2] < 2) continue; dx[i] += (s[0] / s[2] - x[i]) * 1.2 / k; dy[i] += (s[1] / s[2] - y[i]) * 1.2 / k; } }
        const t = .09 * st.alpha + .002;
        for (let i = 0; i < n; i++) { if (pin[i]) continue; dx[i] -= x[i] * 1.6 / k * .05; dy[i] -= y[i] * 1.6 / k * .05; const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1, m = Math.min(d, t); x[i] += dx[i] / d * m; y[i] += dy[i] / d * m; }
        st.alpha *= .985; st.iter++;
    }
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function runFor(st, ms, maxIter) { const t0 = now(); let i = 0; while (st.alpha > .02 && i < maxIter && now() - t0 < ms) { netStep(st); i++; } }
    function network(spec, W, fs) {
        const o = spec.o || {}, g = graphOf(spec);
        if (!g.links.length) return empty(W, fs, 'Ajoute des liens : une personne, une autre, et la sorte de lien (témoin, parrain, voisin…).');
        const nc = nodeColors(spec, g, o.colorBy || 'group'), kc = kindColors(spec, g);
        const st = netState(g, {...o, groupArr: nc.groups ? Int32Array.from(nc.groups) : null, groupKey: o.colorBy || ''});
        const H = clamp(num(o.height) || Math.round(W * .68), 220, 2400);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < st.n; i++) { x0 = Math.min(x0, st.x[i]); x1 = Math.max(x1, st.x[i]); y0 = Math.min(y0, st.y[i]); y1 = Math.max(y1, st.y[i]); }
        const pad = fs * 2.2, s = Math.min((W - pad * 2) / Math.max(1e-6, x1 - x0), (H - pad * 2) / Math.max(1e-6, y1 - y0)), ox = W / 2 - (x0 + x1) / 2 * s, oy = H / 2 - (y0 + y1) / 2 * s;
        const maxDeg = Math.max(1, ...g.nodes.map(n => n.deg)), maxW = Math.max(...g.links.map(l => l.w)), big = clamp(num(o.nodeSize) || 9, 3, 30);
        const rad = i => o.sizeBy === 'same' ? big * .7 : big * (.45 + .9 * Math.sqrt(g.nodes[i].deg / maxDeg));
        const labelSet = o.labels === 'none' ? new Set() : o.labels === 'all' || g.nodes.length <= 40 ? null : new Set(g.nodes.map((n, i) => [n.deg, i]).sort((a, b) => b[0] - a[0]).slice(0, 30).map(([, i]) => i));
        const X = i => st.x[i] * s + ox, Y = i => st.y[i] * s + oy;
        let edges = '', nodes = '';
        g.links.forEach((l, e) => { const c = o.edgeKinds === false ? '#8a94a3' : kc.m.get(l.kind); edges += `<line data-e="${e}" data-a="${l.i}" data-b="${l.j}" x1="${r2(X(l.i))}" y1="${r2(Y(l.i))}" x2="${r2(X(l.j))}" y2="${r2(Y(l.j))}" stroke="${c}" stroke-opacity=".6" stroke-width="${r2(.8 + 3.2 * Math.sqrt(l.w / maxW))}"><title>${esc(`${g.nodes[l.i].name} — ${g.nodes[l.j].name}${l.kind ? ' : ' + l.kind : ''}${l.w !== 1 ? ` (${fmt(l.w)})` : ''}`)}</title></line>`; });
        g.nodes.forEach((n, i) => { const r = rad(i), lab = !labelSet || labelSet.has(i);
            nodes += `<g data-n="${i}" transform="translate(${r2(X(i))} ${r2(Y(i))})"><circle r="${r2(r)}" fill="${nc.col[i]}" stroke="#fff" stroke-width="1.2"/><title>${esc(`${n.name}${n.group ? ' · ' + n.group : ''} : ${n.deg} lien${n.deg > 1 ? 's' : ''}`)}</title>${lab ? T(0, r + fs * .75, cut(n.name, fs * 12, fs * .85), {size: fs * .85, anchor: 'middle', weight: n.deg === maxDeg ? 700 : 500}) : ''}</g>`; });
        const svg = `<g data-gn-net="${st.key}" data-fit="${r2(ox)} ${r2(oy)} ${r2(s)}"><rect width="${r2(W)}" height="${r2(H)}" fill="#fff" fill-opacity="0" data-gn-bg=""/><g data-gn-vp=""><g>${edges}</g><g>${nodes}</g></g></g>`;
        const legend = [...nc.legend, ...(o.edgeKinds === false ? [] : kc.kinds.filter(Boolean).slice(0, 12).map(k => ({label: k, color: kc.m.get(k), type: 'line', width: 3})))];
        return {h: H, svg, legend, desc: `Réseau de ${g.nodes.length} personnes et ${g.links.length} liens.`};
    }
    function sampleNet() {
        const L = [['Jean MARTIN', 'Pierre DURAND', 'témoin'], ['Jean MARTIN', 'Anne PETIT', 'parrain'], ['Marie ROUX', 'Anne PETIT', 'marraine'], ['Jean MARTIN', 'Marie ROUX', 'voisin'], ['Pierre DURAND', 'Louis DURAND', 'témoin'], ['Louis DURAND', 'Rose DURAND', 'parrain'],
            ['Rose DURAND', 'Jacques MOREAU', 'témoin'], ['Jacques MOREAU', 'Julien MOREAU', 'parrain'], ['Julien MOREAU', 'Anne PETIT', 'témoin'], ['Michel GARNIER', 'Jacques MOREAU', 'employeur'], ['Michel GARNIER', 'Yves GARNIER', 'parrain'], ['Yves GARNIER', 'Jeanne GARNIER', 'témoin'],
            ['Jeanne GARNIER', 'Marie ROUX', 'marraine'], ['Pierre DURAND', 'Michel GARNIER', 'voisin'], ['Louis DURAND', 'Jean MARTIN', 'témoin'], ['René MARTIN', 'Jean MARTIN', 'parrain'], ['René MARTIN', 'Jeanne GARNIER', 'témoin'], ['Hélène ROUX', 'Marie ROUX', 'marraine'], ['Hélène ROUX', 'Julien MOREAU', 'voisin']];
        return {rows: L.map(([a, b, kind]) => ({a, b, kind, weight: ''})), nodes: [...new Set(L.flatMap(([a, b]) => [a, b]))].map(name => ({name, group: name.split(' ').pop()}))};
    }
    const PICK_ROOT = () => (A().pickerField ? A().pickerField({name: 'gn_root', kind: 'person', value: Number(A().state?.bootstrap?.startPersonId) || null}) : '');
    const linksFromApp = (what) => async (pane, io) => {
        const src = val(pane, 'src') || what;
        const q = src === 'witness' ? {what: 'witness', root: rootOf(pane), depth: val(pane, 'depth') || 1, all: val(pane, 'depth') === 'all' ? 1 : 0} : {what: src, root: rootOf(pane)};
        const r = await get(q);
        if (!r.links?.length) throw new Error(src === 'witness' ? 'Aucun témoin, parrain ou marraine noté dans les actes de ces personnes.' : src === 'implexe' ? 'Pas d’implexe : aucun ancêtre n’apparaît deux fois.' : 'Aucun mariage entre deux familles.');
        const s = io.spec(); s.rows = r.links.map(l => ({a: l.a, b: l.b, kind: l.kind, weight: l.weight === 1 ? '' : String(l.weight)})); s.nodes = (r.nodes || []).map(n => ({name: n.name, group: n.group || ''}));
        s.o = {...s.o, title: src === 'witness' ? 'Témoins, parrains et marraines' : src === 'implexe' ? `Implexe : ${r.total || 0} ancêtre${r.total > 1 ? 's' : ''} à plusieurs places` : 'Mariages entre familles', ...(src === 'implexe' ? {order: 'number', colorBy: 'group'} : src === 'marriages' ? {order: 'degree', colorBy: 'community'} : {colorBy: 'group'})};
        io.apply(s); return `${r.links.length} lien${r.links.length > 1 ? 's' : ''} pris dans l’app.`;
    };
    const netApp = {
        html: () => `<div class="h-dg-app gn-app"><h4>🕸 Témoins, parrains, marraines</h4><p class="muted">Les personnes notées dans les actes (témoins, parrains, déclarants…) et celles pour qui elles l’ont été. Couleur = nom de famille.</p>
            <span class="pk-lab">Autour de</span>${PICK_ROOT()}
            <label>Jusqu’où<select data-gn="depth"><option value="1">Ses liens directs</option><option value="2">Et les liens de ses liens</option><option value="all">Toute ma base (les 2 500 premiers liens)</option></select></label>
            <button type="button" class="button small" data-gn-go>Prendre ces liens</button><p class="muted" data-gn-msg aria-live="polite"></p></div>`,
        bind: (pane, io) => bindApp(pane, () => linksFromApp('witness')(pane, io)),
    };

    /* ═════════ 🌈 Arcs de liens ═════════ */
    function arcs(spec, W, fs) {
        const o = spec.o || {}, g = graphOf(spec, {maxNodes: 300, maxLinks: 2000});
        if (!g.nodes.length) return empty(W, fs, 'Ajoute des liens : une personne, une autre, et la sorte de lien (mariage, implexe…).');
        const nc = nodeColors(spec, g, o.colorBy || 'group'), kc = kindColors(spec, g);
        let order = g.nodes.map((_, i) => i);
        if (o.order === 'az') order.sort((a, b) => g.nodes[a].name.localeCompare(g.nodes[b].name, 'fr', {numeric: true}));
        else if (o.order === 'number') order.sort((a, b) => g.nodes[a].name.localeCompare(g.nodes[b].name, 'fr', {numeric: true}));
        else if (o.order === 'degree') order.sort((a, b) => g.nodes[b].deg - g.nodes[a].deg || a - b);
        else if (o.order === 'group') order.sort((a, b) => String(g.nodes[a].group).localeCompare(String(g.nodes[b].group), 'fr') || a - b);
        const pos = new Float64Array(g.nodes.length), n = order.length, labH = o.labels === 'none' ? fs : Math.min(fs * 11, Math.max(...g.nodes.map(x => textW(x.name, fs * .85))) * .87 + fs);
        const lm = o.labels === 'none' ? fs : Math.min(labH * .5 + fs * .5, W * .2), step = (W - fs - lm) / Math.max(1, n - 1 || 1), lx = n === 1 ? W / 2 : lm;
        order.forEach((i, k) => { pos[i] = lx + k * step; });
        const hk = clamp(num(o.arcHeight) || 55, 10, 120) / 100, maxW = Math.max(1, ...g.links.map(l => l.w));
        const kinds = kc.kinds, below = l => o.side === 'below' || (o.side === 'kind' && kinds.indexOf(l.kind) % 2 === 1);
        let up = 0, down = 0; g.links.forEach(l => { const h = Math.abs(pos[l.i] - pos[l.j]) / 2 * hk; if (below(l)) down = Math.max(down, h); else up = Math.max(up, h); });
        const base = up + fs * .8 + 4, labTop = base + Math.max(down, 7) + fs * .7;
        let svg = '';
        g.links.forEach(l => { const xa = Math.min(pos[l.i], pos[l.j]), xb = Math.max(pos[l.i], pos[l.j]), rx = (xb - xa) / 2, ry = rx * hk, dn = below(l), c = o.edgeKinds === false ? (nc.col[l.i] || '#888') : kc.m.get(l.kind);
            svg += `<path d="M${r2(xa)} ${r2(base)}A${r2(rx)} ${r2(Math.max(.1, ry))} 0 0 ${dn ? 0 : 1} ${r2(xb)} ${r2(base)}" fill="none" stroke="${c}" stroke-opacity=".65" stroke-width="${r2(.8 + 3.6 * Math.sqrt(l.w / maxW))}"><title>${esc(`${g.nodes[l.i].name} — ${g.nodes[l.j].name}${l.kind ? ' : ' + l.kind : ''}${l.w !== 1 ? ` (${fmt(l.w)})` : ''}`)}</title></path>`; });
        svg += `<line x1="${r2(lx - 4)}" y1="${r2(base)}" x2="${r2(lx + (n - 1) * step + 4)}" y2="${r2(base)}" stroke="currentColor" stroke-opacity=".25"/>`;
        const maxDeg = Math.max(1, ...g.nodes.map(x => x.deg)), every = Math.max(1, Math.ceil(fs * .95 / Math.max(1, step)));
        order.forEach((i, k) => { const nd = g.nodes[i], r = clamp(2 + 5 * Math.sqrt(nd.deg / maxDeg), 2, Math.max(2.5, step * .45 + 1));
            svg += `<circle cx="${r2(pos[i])}" cy="${r2(base)}" r="${r2(r)}" fill="${nc.col[i]}" stroke="#fff"><title>${esc(`${nd.name}${nd.group ? ' · ' + nd.group : ''} : ${nd.deg} lien${nd.deg > 1 ? 's' : ''}`)}</title></circle>`;
            if (o.labels !== 'none' && k % every === 0) svg += T(pos[i] + fs * .25, labTop, cut(nd.name, labH / .87, fs * .85), {size: fs * .85, anchor: 'end', rotate: -60, baseline: 'middle'}); });
        const legend = [...nc.legend, ...(o.edgeKinds === false ? [] : kinds.filter(Boolean).slice(0, 12).map(k => ({label: k, color: kc.m.get(k), type: 'line', width: 3})))];
        return {h: labTop + (o.labels === 'none' ? 0 : labH), svg, legend, desc: `Arcs : ${n} personnes et ${g.links.length} liens.`};
    }
    function sampleArcs() {
        const fam = ['MARTIN', 'DURAND', 'PETIT', 'MOREAU', 'GARNIER', 'ROUX', 'LAMBERT', 'ROBIN', 'GIRARD', 'BONNET'];
        const L = [[0, 1, 4], [0, 2, 2], [1, 3, 3], [2, 3, 1], [3, 4, 2], [4, 5, 1], [0, 5, 1], [5, 6, 2], [6, 7, 1], [1, 7, 1], [7, 8, 2], [8, 9, 1], [2, 9, 1], [0, 8, 1], [3, 6, 1]];
        return L.map(([a, b, w]) => ({a: fam[a], b: fam[b], kind: 'mariage', weight: String(w)}));
    }
    const arcsApp = {
        html: () => `<div class="h-dg-app gn-app"><h4>🌈 Des liens de l’app</h4><label>Quels liens<select data-gn="src"><option value="marriages">Mariages entre familles (noms de famille)</option><option value="implexe">Implexe : un même ancêtre à plusieurs numéros Sosa</option><option value="witness">Témoins, parrains, marraines</option></select></label>
            <span class="pk-lab">Personne de départ (implexe, témoins)</span>${PICK_ROOT()}
            <button type="button" class="button small" data-gn-go>Prendre ces liens</button><p class="muted" data-gn-msg aria-live="polite"></p></div>`,
        bind: (pane, io) => bindApp(pane, () => linksFromApp('marriages')(pane, io)),
    };

    /* ═════════ ⭕ Venn de 2 à 4 ensembles (mêmes données que l'ancien : sets + zones A, B, AB…) ═════════ */
    const ZONES = n => { const out = []; for (let m = 1; m < 2 ** n; m++) out.push([...'ABCD'.slice(0, n)].filter((_, i) => m & (1 << i)).join('')); return out.sort((a, b) => a.length - b.length || a.localeCompare(b)); };
    // formes (centre x, y, demi-axes a, b, angle en degrés ; y vers le bas) ; 4 ensembles : 4 ellipses inclinées, les 15 zones existent
    const SHAPES_V = {2: [[-.3, 0, .5, .5, 0], [.3, 0, .5, .5, 0]], 3: [[-.27, -.2, .5, .5, 0], [.27, -.2, .5, .5, 0], [0, .25, .5, .5, 0]],
        4: [[-.2, .2, .9, .35, -40], [-.05, -.4, .9, .35, -40], [.05, -.4, .9, .35, 40], [.2, .2, .9, .35, 40]]};
    const vennMem = new Map();
    function vennLayout(n) {
        if (vennMem.has(n)) return vennMem.get(n);
        const E = SHAPES_V[n].map(([x, y, a, b, deg]) => ({x, y, a, b, c: Math.cos(deg * Math.PI / 180), s: Math.sin(deg * Math.PI / 180)}));
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        E.forEach(e => { const hw = Math.sqrt((e.a * e.c) ** 2 + (e.b * e.s) ** 2), hh = Math.sqrt((e.a * e.s) ** 2 + (e.b * e.c) ** 2); x0 = Math.min(x0, e.x - hw); x1 = Math.max(x1, e.x + hw); y0 = Math.min(y0, e.y - hh); y1 = Math.max(y1, e.y + hh); });
        const q = (e, px, py) => { const ux = px - e.x, uy = py - e.y, u = ux * e.c + uy * e.s, v = -ux * e.s + uy * e.c; return Math.sqrt((u / e.a) ** 2 + (v / e.b) ** 2); };
        // la place de chaque nombre : le point de la zone le plus loin de tous les bords
        const best = {}, G = 120;
        for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
            const px = x0 + (x1 - x0) * i / G, py = y0 + (y1 - y0) * j / G, qs = E.map(e => q(e, px, py)); let code = '';
            qs.forEach((v, k) => { if (v <= 1) code += 'ABCD'[k]; }); if (!code) continue;
            const margin = Math.min(...qs.map((v, k) => Math.abs(v - 1) * Math.min(E[k].a, E[k].b)));
            if (!best[code] || margin > best[code][2]) best[code] = [px, py, margin];
        }
        const L = {E, at: best, box: [x0, y0, x1 - x0, y1 - y0]}; vennMem.set(n, L); return L;
    }
    function venn(spec, W, fs) {
        const o = spec.o || {}, sets = rows(spec, 'sets').slice(0, 4).map((s, i) => ({name: str(s.name, 80) || `Ensemble ${'ABCD'[i]}`, color: pick(spec, i, s.color)}));
        if (sets.length < 2) return empty(W, fs, 'Il faut 2, 3 ou 4 ensembles.');
        const n = sets.length, reg = {}; rows(spec).forEach(r => { const k = String(r.region || '').replace(/[\s∩]/g, '').toUpperCase(); if (k) reg[[...k].sort().join('')] = str(r.value, 40); });
        const L = vennLayout(n), [bx0, by0, bw, bh] = L.box, side = n === 2 ? fs : clamp(Math.max(...sets.map(x => textW(x.name + ' (0000)', fs * 1.05))) * (n === 4 ? .75 : .35), fs * 2, W * .26), top = fs * 2;
        const sc = Math.min((W - side * 2) / bw, (num(o.height) > 80 ? num(o.height) - top * 2 : 1e9) / bh, 900 / bh), size = sc;
        const ox = (W - bw * sc) / 2 - bx0 * sc, oy = top - by0 * sc;
        const X = v => ox + v * size, Y = v => oy + v * size;
        let svg = '';
        L.E.forEach((e, i) => { const deg = Math.atan2(e.s, e.c) * 180 / Math.PI;
            svg += `<ellipse cx="${r2(X(e.x))}" cy="${r2(Y(e.y))}" rx="${r2(e.a * size)}" ry="${r2(e.b * size)}" transform="rotate(${r2(deg)} ${r2(X(e.x))} ${r2(Y(e.y))})" fill="${sets[i].color}" fill-opacity="${clamp(num(o.opacity) || 30, 5, 80) / 100}" stroke="${sets[i].color}" stroke-width="2"><title>${esc(sets[i].name)}</title></ellipse>`; });
        const numeric = Object.values(reg).filter(v => v !== '').every(isNumText), total = numeric ? Object.values(reg).reduce((a, v) => a + num(v), 0) : 0;
        Object.entries(L.at).forEach(([code, [px, py]]) => { const v = reg[code] ?? ''; if (v === '') return;
            const lab = o.pct && numeric && total ? `${v} (${fmt(100 * num(v) / total, 0)} %)` : v;
            svg += `<g><title>${esc(`${[...code].map(c => sets['ABCD'.indexOf(c)]?.name).join(' et ')}${code.length < n ? ' seulement' : ''} : ${lab}`)}</title>${T(X(px), Y(py), lab, {size: fs * (code.length === n ? 1.15 : 1.02), anchor: 'middle', weight: code.length === n ? 800 : 600})}</g>`; });
        // le nom de chaque ensemble : au bord, du côté opposé au centre de la figure
        const mx = bx0 + bw / 2, my = by0 + bh / 2;
        L.E.forEach((e, i) => { let bx = e.x, by = e.y, bd = -1; for (let t = 0; t < 72; t++) { const a = t * TAU / 72, u = e.a * Math.cos(a), v = e.b * Math.sin(a), px = e.x + u * e.c - v * e.s, py = e.y + u * e.s + v * e.c, d = n === 2 ? -py : (px - mx) ** 2 + (py - my) ** 2 * (n === 4 ? .2 : 1.6); if (d > bd) { bd = d; bx = px; by = py; } }
            const right = n !== 2 && bx > mx + bw * .05, left = n !== 2 && bx < mx - bw * .05, top = by < my;
            const sum = numeric ? Object.entries(reg).filter(([c]) => c.includes('ABCD'[i])).reduce((a, [, v]) => a + num(v), 0) : null;
            const room = right ? W - X(bx) - 8 : left ? X(bx) - 8 : W * .5;
            svg += T(X(bx) + (right ? 6 : left ? -6 : 0), Y(by) + (top ? -fs * .8 : fs * .9), cut(`${sets[i].name}${o.totals !== false && sum ? ` (${fmt(sum, 0)})` : ''}`, Math.max(fs * 3, room), fs * 1.05), {size: fs * 1.05, weight: 700, anchor: right ? 'start' : left ? 'end' : 'middle', fill: mix(sets[i].color, '#000000', .25)}); });
        return {h: bh * sc + top * 2, svg, legend: [], desc: `Diagramme de Venn de ${n} ensembles : ${sets.map(s => s.name).join(', ')}.`};
    }
    const vennApp = {
        html: () => `<div class="h-dg-app gn-app"><h4>⭕ Des ensembles de l’app</h4><p class="muted">Choisis 2 à 4 ensembles : chaque zone reçoit le nombre de personnes qui sont dans ces ensembles-là, et pas dans les autres.</p>
            <span class="pk-lab">Étiquettes</span>${A().pickerField ? A().pickerField({name: 'gn_labels', kind: 'label', multiple: true, placeholder: 'Une étiquette…'}) : ''}
            <span class="pk-lab">Autres ensembles</span><div class="gn-sets" data-gn-sets><p class="muted">Chargement…</p></div>
            <span class="pk-lab">Personne de départ (pour « Mes ancêtres »)</span>${PICK_ROOT()}
            <button type="button" class="button small" data-gn-go>Compter</button><p class="muted" data-gn-msg aria-live="polite"></p></div>`,
        bind: (pane, io) => {
            const box = pane.querySelector('[data-gn-sets]'), names = new Map();
            pane.addEventListener('picker-change', e => { if (e.detail?.name === 'gn_labels') (e.detail.items || []).forEach(it => names.set(Number(it.id), String(it.title || ''))); });
            get({what: 'venn_sets'}).then(r => { const g = {}; (r.sets || []).forEach(s => { (g[s.group] = g[s.group] || []).push(s); });
                box.innerHTML = Object.entries(g).map(([grp, l]) => `<fieldset><legend>${esc(grp)}</legend>${l.map(s => `<label class="checkbox-line"><input type="checkbox" value="${esc(s.key)}" data-label="${esc(s.label)}"> ${esc(s.label)}</label>`).join('')}</fieldset>`).join('') || '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Rien d’autre pour l’instant.</span></p>'; }).catch(e => { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
            bindApp(pane, async () => {
                const lab = pane.querySelector('[name="gn_labels"]')?.value || '', labels = lab.split(',').map(Number).filter(Boolean).map(id => ({key: 'label:' + id, label: ''}));
                labels.forEach(l => { l.label = names.get(Number(l.key.slice(6))) || 'Étiquette'; });
                const chosen = [...labels, ...[...box.querySelectorAll('input:checked')].map(c => ({key: c.value, label: c.dataset.label}))];
                if (chosen.length < 2 || chosen.length > 4) throw new Error(`Choisis 2 à 4 ensembles (là : ${chosen.length}).`);
                const r = await get({what: 'venn', keys: chosen.map(c => c.key).join(','), root: rootOf(pane)});
                const s = io.spec(); s.sets = chosen.map((c, i) => ({name: c.label, color: s.sets?.[i]?.color || ''}));
                s.rows = ZONES(chosen.length).map(z => ({region: z, value: String(r.regions?.[z] || 0)})); s.o = {...s.o, title: chosen.map(c => c.label).join(' · ')};
                const n = Object.values(r.regions || {}).reduce((a, b) => a + b, 0); io.apply(s); return `${fmt(n, 0)} personne${n > 1 ? 's' : ''} comptée${n > 1 ? 's' : ''}.`;
            });
        },
    };

    /* ═════════ Dates (C4) : « 7 mai 1925 », « 08/12/1960 », « 1925-05-07 », « 12 thermidor an II », « 7 mai » ═════════ */
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const MK = [['janv', 1], ['jan', 1], ['fevr', 2], ['fev', 2], ['feb', 2], ['mars', 3], ['mar', 3], ['avr', 4], ['apr', 4], ['mai', 5], ['may', 5], ['juin', 6], ['jun', 6], ['juil', 7], ['jul', 7], ['aout', 8], ['aug', 8], ['sept', 9], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12], ['7bre', 9], ['8bre', 10], ['9bre', 11], ['xbre', 12], ['10bre', 12]];
    const REP = ['vendemiaire', 'brumaire', 'frimaire', 'nivose', 'pluviose', 'ventose', 'germinal', 'floreal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'sansculottide'];
    const monthOf = w => { w = String(w).replace(/\.$/, ''); if (/^\d{1,2}$/.test(w)) { const n = +w; return n >= 1 && n <= 12 ? n : 0; } const k = MK.find(([p]) => w.startsWith(p)); return k ? k[1] : 0; };
    const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const dim = (m, y) => (m !== 2 ? DIM[m - 1] : y == null ? 29 : (y < 1583 ? y % 4 === 0 : (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28);
    const romanN = s => { const m = String(s).toUpperCase(); if (/^\d+$/.test(m)) return +m; if (!/^[IVX]+$/.test(m)) return 0; const v = {I: 1, V: 5, X: 10}; let t = 0; for (let i = 0; i < m.length; i++) t += v[m[i]] < (v[m[i + 1]] || 0) ? -v[m[i]] : v[m[i]]; return t; };
    /** → {y, m, d} (m et d facultatifs ; y absent pour « 7 mai ») ou null */
    const dayMem = new Map();
    /** avec une petite mémoire : un grand tableau se redessine sans tout relire */
    function parseDay(raw) {
        const key = String(raw ?? ''); if (!key) return null;
        let m = key.match(/^(\d{4})-(\d\d?)-(\d\d?)$/); // le plus courant (dates de l'app) : tout de suite
        if (m) { const y = +m[1], mo = +m[2], d = +m[3]; return mo >= 1 && mo <= 12 ? (d >= 1 && d <= dim(mo, y) ? {y, m: mo, d} : {y, m: mo}) : {y}; }
        if (dayMem.has(key)) return dayMem.get(key);
        const r = parseDay0(key); if (dayMem.size > 50000) dayMem.clear(); dayMem.set(key, r); return r;
    }
    function parseDay0(raw) {
        let s = fold(raw).trim().replace(/\s+/g, ' ').replace(/,/g, ''); if (!s || s.length > 80) return null;
        let m;
        if ((m = s.match(/^(-?\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?/))) { const y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 0; return mo >= 1 && mo <= 12 ? (d >= 1 && d <= dim(mo, y) ? {y, m: mo, d} : {y, m: mo}) : {y}; }
        for (let i = 0; i < 3; i++) s = s.replace(/^(le|du|vers|environ|env\.?|circa|ca\.?|c\.|~|avant|av\.?|apres|ap\.?|depuis|en)\s*/, '');
        if (/^(entre|de)\s/.test(s)) { const y = s.match(/\d{3,4}/); return y ? {y: +y[0], approx: true} : null; }
        const ok = (d, mo, y) => (mo >= 1 && mo <= 12 && d >= 1 && d <= dim(mo, y) ? {y, m: mo, d} : null);
        if ((m = s.match(/^(?:(\d{1,2}|1er)\s+([a-z]+)\s+)?(?:de\s+l')?an\s+([ivx]+|\d{1,2})$/))) {
            const y = romanN(m[3]); if (!y || y > 14) return null; if (!m[2]) return {y: 1791 + y};
            const mi = REP.findIndex(x => x.startsWith(m[2].slice(0, 4))), d = m[1] === '1er' ? 1 : +m[1]; if (mi < 0 || d < 1 || d > (mi === 12 ? 6 : 30)) return null;
            const app = A(); if (app?.republicanToJdn && app?.jdnToGregorian) { try { const g = app.jdnToGregorian(app.republicanToJdn(y, mi + 1, d)); if (g?.year) return {y: g.year, m: g.month, d: g.day}; } catch (_) {} }
            // sans l'outil de l'app : 1er vendémiaire an I = 22 septembre 1792, 360 jours + jours complémentaires
            const t = Date.UTC(1792, 8, 22) + ((y - 1) * 365 + Math.floor(y / 4) + mi * 30 + d - 1) * 864e5, dt = new Date(t); return {y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate()};
        }
        if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{3,4})$/))) return ok(+m[1], +m[2], +m[3]) || {y: +m[3]};
        if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})$/))) return ok(+m[1], +m[2], null);
        if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) return +m[1] >= 1 && +m[1] <= 12 ? {y: +m[2], m: +m[1]} : {y: +m[2]};
        if ((m = s.match(/^(1er|\d{1,2})\s+([a-z0-9]+\.?)(?:\s+(\d{3,4}))?$/))) { const mo = monthOf(m[2]); if (!mo || /^\d+$/.test(m[2])) return m[3] ? {y: +m[3]} : null; const y = m[3] ? +m[3] : null; const r = ok(m[1] === '1er' ? 1 : +m[1], mo, y); return r ? (y == null ? {m: r.m, d: r.d} : r) : (y ? {y, m: mo} : null); }
        if ((m = s.match(/^([a-z]+\.?)\s+(\d{3,4})$/))) { const mo = monthOf(m[1]); return mo ? {y: +m[2], m: mo} : {y: +m[2]}; }
        if ((m = s.match(/^([a-z]+\.?)$/))) { const mo = monthOf(m[1]); return mo ? {m: mo} : null; }
        if ((m = s.match(/(\d{3,4})/))) return {y: +m[1], approx: true};
        return null;
    }
    const yearDec = d => (d?.y == null ? null : d.y + ((d.m || 1) - 1) / 12 + ((d.d || 1) - 1) / 365.25);
    ext.diagramParseDay = parseDay;

    /* ═════════ 🗓 Calendrier coloré ═════════ */
    const MN = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    function yearsWanted(text) { const out = new Set(); String(text || '').split(/[,;\s]+/).forEach(p => { const m = p.match(/^(\d{3,4})(?:-(\d{3,4}))?$/); if (!m) return; const a = +m[1], b = m[2] ? +m[2] : a; for (let y = Math.min(a, b); y <= Math.max(a, b) && out.size < 30; y++) out.add(y); }); return [...out].sort((a, b) => a - b).slice(0, 12); }
    function calendar(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec).slice(0, 100000), layout = o.layout === 'year' ? 'year' : 'months';
        const byDay = new Map(), perYear = new Map(); let noDay = 0, all = 0;
        for (const r of list) { const d = parseDay(r.date); const v = r.value === '' || r.value == null ? 1 : num(r.value); if (!(v > 0)) continue; all += v;
            if (!d || !d.m || !d.d) { noDay += v; continue; }
            const k = `${d.y ?? 0}-${d.m}-${d.d}`; byDay.set(k, (byDay.get(k) || 0) + v); if (d.y != null) perYear.set(d.y, (perYear.get(d.y) || 0) + v); }
        if (!byDay.size) return empty(W, fs, all ? 'Aucune date avec le jour et le mois (ex. : 7 mai 1925, 08/12/1960).' : 'Ajoute des dates (7 mai 1925, 08/12/1960, 12 thermidor an II…) et, si tu veux, un nombre.');
        let years = yearsWanted(o.years);
        const low = color(o.lowColor, '#e3ecfb'), high = color(o.highColor, '#1e4fd8'), none = '#8881';
        let svg = '', H = 0, max = 0, shownSum = 0;
        if (layout === 'year') {
            if (!years.length) years = [...perYear.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([y]) => y).sort((a, b) => a - b);
            const vals = []; years.forEach(y => { for (let m = 1; m <= 12; m++) for (let d = 1; d <= dim(m, y); d++) { const v = byDay.get(`${y}-${m}-${d}`) || 0; if (v) vals.push(v); } });
            max = Math.max(1, ...vals);
            const lab = fs * 3.2, cs = clamp((W - lab) / 54, 4, 26), gap = cs > 8 ? 1.5 : .6;
            years.forEach((y, yi) => { const top = yi * (cs * 7 + fs * 2.6), first = new Date(Date.UTC(y, 0, 1)).getUTCDay(), off = (first + 6) % 7; // lundi en haut
                svg += T(0, top + fs * 1.5 + cs * 3.5, String(y), {size: fs * 1.05, weight: 700});
                let doy = 0;
                for (let m = 1; m <= 12; m++) { for (let d = 1; d <= dim(m, y); d++, doy++) { const idx = doy + off, wk = Math.floor(idx / 7), wd = idx % 7, v = byDay.get(`${y}-${m}-${d}`) || 0; shownSum += v;
                        const fill = v ? mix(low, high, o.scale === 'linear' ? v / max : Math.sqrt(v / max)) : none;
                        svg += `<rect x="${r2(lab + wk * cs)}" y="${r2(top + fs * 1.5 + wd * cs)}" width="${r2(cs - gap)}" height="${r2(cs - gap)}" rx="${r2(cs * .18)}" fill="${fill}"><title>${esc(`${d === 1 ? '1er' : d} ${MN[m - 1].toLowerCase()} ${y} : ${fmt(v)}`)}</title></rect>`;
                        if (d === 1 && cs * 4.3 > textW(MS[m - 1], fs * .8)) svg += T(lab + Math.floor(idx / 7) * cs, top + fs * .8, MS[m - 1], {size: fs * .8, fill: '#777'}); } }
                if (cs > fs * .7) ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((t, i) => { if (i % 2 === 0) svg += T(lab - 4, top + fs * 1.5 + i * cs + cs / 2, t, {size: Math.min(fs * .7, cs), anchor: 'end', fill: '#999'}); });
                H = top + fs * 1.5 + cs * 7; });
        } else {
            const sum = new Map(); byDay.forEach((v, k) => { const [y, m, d] = k.split('-').map(Number); if (years.length && !years.includes(y)) return; const kk = `${m}-${d}`; sum.set(kk, (sum.get(kk) || 0) + v); });
            max = Math.max(1, ...sum.values());
            const lab = Math.max(...MS.map(x => textW(x, fs * .9))) + 8, cs = clamp((W - lab) / 31, 6, 44), gap = cs > 10 ? 2 : 1;
            for (let d = 1; d <= 31; d++) if (cs > fs * 1.1 || d % 5 === 0 || d === 1) svg += T(lab + (d - .5) * cs, fs * .7, String(d), {size: Math.min(fs * .75, cs * .8), anchor: 'middle', fill: '#888'});
            for (let m = 1; m <= 12; m++) { const y0 = fs * 1.5 + (m - 1) * cs; svg += T(lab - 6, y0 + cs / 2, MS[m - 1], {size: Math.min(fs * .9, cs * .9), anchor: 'end'});
                for (let d = 1; d <= dim(m, null); d++) { const v = sum.get(`${m}-${d}`) || 0; shownSum += v; const fill = v ? mix(low, high, o.scale === 'linear' ? v / max : Math.sqrt(v / max)) : none;
                    svg += `<rect x="${r2(lab + (d - 1) * cs)}" y="${r2(y0)}" width="${r2(cs - gap)}" height="${r2(cs - gap)}" rx="${r2(cs * .15)}" fill="${fill}"><title>${esc(`${d === 1 ? '1er' : d} ${MN[m - 1].toLowerCase()} : ${fmt(v)}`)}</title></rect>`;
                    if (o.values && v && cs > fs * 1.5) svg += T(lab + (d - 1) * cs + (cs - gap) / 2, y0 + (cs - gap) / 2, fmt(v, 0), {size: Math.min(fs * .75, cs * .42), anchor: 'middle', fill: contrast(fill)}); } }
            H = fs * 1.5 + 12 * cs;
        }
        const legend = [{label: 'Aucun', color: '#e6e8eb'}, ...[.15, .4, .7, 1].map(t => { const v = Math.max(1, Math.round(o.scale === 'linear' ? max * t : max * t * t)); return {label: fmt(v, 0), color: mix(low, high, o.scale === 'linear' ? v / max : Math.sqrt(v / max))}; })].filter((it, i, a) => i < 2 || it.label !== a[i - 1].label);
        if (noDay && o.noDayNote !== false) { svg += T(0, H + fs * 1.2, `${fmt(noDay, 0)} date${noDay > 1 ? 's' : ''} sans jour précis (non montrée${noDay > 1 ? 's' : ''})`, {size: fs * .8, fill: '#888', style: 'italic'}); H += fs * 1.8; }
        return {h: H, svg, legend, desc: `Calendrier : ${fmt(shownSum, 0)} événement${shownSum > 1 ? 's' : ''} montré${shownSum > 1 ? 's' : ''}, au plus ${fmt(max, 0)} le même jour.`};
    }
    function sampleCal() {
        const out = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 260; i++) { const m = 1 + Math.floor(rnd() * 12), w = [1.4, 1.5, 1.6, 1.3, 1.1, 1, .9, .8, .9, 1, 1.1, 1.2][m - 1]; if (rnd() > w / 1.6) continue; const d = 1 + Math.floor(rnd() * dim(m, null)); out.push({date: `${d === 1 ? '1er' : d} ${MN[m - 1].toLowerCase()} ${1780 + Math.floor(rnd() * 120)}`, value: '', label: 'Naissance'}); }
        return out;
    }
    const TYPES_HTML = (def = ['birth']) => `<fieldset class="gn-types"><legend>Événements</legend>${[['birth', 'Naissances'], ['bapt', 'Baptêmes'], ['marriage', 'Mariages'], ['death', 'Décès'], ['burial', 'Sépultures']].map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-gn-type value="${k}" ${def.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>`;
    const SCOPE_HTML = () => `<label>Qui<select data-gn="scope"><option value="all">Toute ma base</option><option value="ancestors">Les ancêtres d’une personne</option></select></label><span class="pk-lab">Personne (pour ses ancêtres)</span>${PICK_ROOT()}`;
    const typesOf = pane => [...pane.querySelectorAll('[data-gn-type]:checked')].map(c => c.value);
    const TYPE_FR = {birth: 'Naissances', bapt: 'Baptêmes', marriage: 'Mariages', death: 'Décès', burial: 'Sépultures'};
    const calApp = {
        html: () => `<div class="h-dg-app gn-app"><h4>🗓 Des événements de l’app, jour par jour</h4><p class="muted">Seules les dates avec le jour comptent. « Toutes années ensemble » montre la saison (366 cases) ; « Une ligne par année » montre les années choisies.</p>${TYPES_HTML()}${SCOPE_HTML()}
            <button type="button" class="button small" data-gn-go>Prendre ces dates</button><p class="muted" data-gn-msg aria-live="polite"></p></div>`,
        bind: (pane, io) => bindApp(pane, async () => {
            const types = typesOf(pane); if (!types.length) throw new Error('Coche au moins une sorte d’événement.');
            const r = await get({what: 'dates', types: types.join(','), scope: val(pane, 'scope'), root: rootOf(pane)});
            if (!r.days?.length) throw new Error('Aucune date complète (jour, mois, année) pour ces événements.');
            const s = io.spec(), year = s.o?.layout === 'year', wanted = yearsWanted(s.o?.years);
            let days = r.days;
            // assez peu de jours : les dates complètes (les deux présentations marchent) ; sinon, l'essentiel pour la présentation choisie
            if (days.length <= 15000 && !wanted.length) { s.rows = days.map(([d, t, n]) => ({date: d.split('-').reverse().join('/'), value: String(n), label: TYPE_FR[t] || t})); s.o = {...s.o, title: `${types.map(t => TYPE_FR[t]).join(', ')} jour par jour`}; io.apply(s); return `${fmt(r.total - r.no_day, 0)} dates complètes prises (${fmt(r.no_day, 0)} sans jour précis laissées de côté).`; }
            if (year) { const per = new Map(); days.forEach(([d, , n]) => { const y = +d.slice(0, 4); per.set(y, (per.get(y) || 0) + n); }); const keep = new Set(wanted.length ? wanted : [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([y]) => y)); days = days.filter(([d]) => keep.has(+d.slice(0, 4))); }
            else { const m = new Map(); days.forEach(([d, t, n]) => { if (wanted.length && !wanted.includes(+d.slice(0, 4))) return; const k = d.slice(5) + '|' + t; m.set(k, (m.get(k) || 0) + n); }); days = [...m.entries()].map(([k, n]) => { const [md, t] = k.split('|'); const [mo, d] = md.split('-').map(Number); return [`${d === 1 ? '1er' : d} ${MN[mo - 1].toLowerCase()}`, t, n]; }); }
            s.rows = days.slice(0, 15000).map(([d, t, n]) => ({date: year ? d.split('-').reverse().join('/') : d, value: String(n), label: TYPE_FR[t] || t}));
            s.o = {...s.o, title: `${types.map(t => TYPE_FR[t]).join(', ')} jour par jour`};
            io.apply(s); return `${fmt(r.total - r.no_day, 0)} dates complètes prises (${fmt(r.no_day, 0)} sans jour précis laissées de côté).`;
        }),
    };

    /* ═════════ 🌸 Rose des mois ═════════ */
    function monthIndex(label, i) { const f = fold(label).trim(); const m = monthOf(f.split(/\s/)[0]); return m ? m - 1 : (i < 12 ? i : -1); }
    function monthrose(spec, W, fs) {
        const o = spec.o || {}, ser = (Array.isArray(spec.series) && spec.series.length ? spec.series : [{name: 'Nombre'}]).slice(0, 8).map((s, j) => ({name: str(s?.name, 60) || `Série ${j + 1}`, color: pick(spec, j, s?.color)}));
        const V = Array.from({length: 12}, () => ser.map(() => 0));
        rows(spec).slice(0, 400).forEach((r, i) => { const m = monthIndex(r.label, i); if (m < 0) return; ser.forEach((_, j) => { V[m][j] += Math.max(0, num(r['s' + j])); }); });
        const style = o.style || 'side', stack = style === 'stack';
        const max = Math.max(1e-9, ...V.map(v => stack ? v.reduce((a, b) => a + b, 0) : Math.max(...v)));
        if (max <= 1e-9) return empty(W, fs, 'Ajoute des chiffres pour chaque mois (janvier à décembre).');
        const hMax = num(o.height) > 80 ? num(o.height) : 1e9, labR = fs * 2.4, Rm = Math.max(40, Math.min(W / 2, hMax / 2) - labR), cx = W / 2, cy = Rm + labR;
        const r0 = Rm * clamp(num(o.hole) ?? 10, 0, 60) / 100, rr = v => r0 + (Rm - r0) * (o.scale === 'linear' ? v / max : Math.sqrt(v / max));
        const sec = TAU / 12, gapA = sec * .06;
        let svg = '';
        [.25, .5, .75, 1].forEach(t => { const v = o.scale === 'linear' ? max * t : max * t * t, r = rr(v); svg += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="none" stroke="currentColor" stroke-opacity=".12"/>` + T(cx + 3, cy - r - 1, fmt(v, 0), {size: fs * .72, fill: '#888', baseline: 'auto'}); });
        for (let m = 0; m < 12; m++) {
            const a0 = -Math.PI / 2 - sec / 2 + m * sec + gapA, a1 = a0 + sec - gapA * 2;
            svg += `<line x1="${r2(cx)}" y1="${r2(cy)}" x2="${r2(P(cx, cy, Rm, a0 - gapA)[0])}" y2="${r2(P(cx, cy, Rm, a0 - gapA)[1])}" stroke="currentColor" stroke-opacity=".07"/>`;
            if (style === 'side' && ser.length > 1) { const w = (a1 - a0) / ser.length; ser.forEach((s, j) => { const v = V[m][j]; if (v > 0) svg += `<path d="${wedge(cx, cy, r0, rr(v), a0 + j * w, a0 + (j + 1) * w - w * .08)}" fill="${s.color}"><title>${esc(`${MN[m]} · ${s.name} : ${fmt(v)}`)}</title></path>`; }); }
            else if (stack) { let acc = 0; ser.forEach((s, j) => { const v = V[m][j]; if (v > 0) { svg += `<path d="${wedge(cx, cy, acc ? rr(acc) : r0, rr(acc + v), a0, a1)}" fill="${s.color}" stroke="#fff" stroke-width=".8"><title>${esc(`${MN[m]} · ${s.name} : ${fmt(v)}`)}</title></path>`; acc += v; } }); }
            else ser.map((s, j) => [s, V[m][j]]).sort((a, b) => b[1] - a[1]).forEach(([s, v]) => { if (v > 0) svg += `<path d="${wedge(cx, cy, r0, rr(v), a0, a1)}" fill="${s.color}" fill-opacity="${ser.length > 1 ? .55 : .9}" stroke="${s.color}"><title>${esc(`${MN[m]} · ${s.name} : ${fmt(v)}`)}</title></path>`; });
            const [lx, ly] = P(cx, cy, Rm + labR * .55, (a0 + a1) / 2);
            svg += T(lx, ly, o.short === false ? MN[m] : MS[m], {size: fs * .9, anchor: 'middle', weight: 600});
            if (o.values && ser.length === 1 && V[m][0] > 0) { const [vx, vy] = P(cx, cy, Math.max(r0 + fs, rr(V[m][0]) - fs * .9), (a0 + a1) / 2); svg += T(vx, vy, fmt(V[m][0], 0), {size: fs * .78, anchor: 'middle', fill: contrast(ser[0].color), weight: 600}); }
        }
        const tot = ser.map((_, j) => V.reduce((a, v) => a + v[j], 0)), top = ser.map((_, j) => V.reduce((b, v, m) => (v[j] > V[b][j] ? m : b), 0));
        return {h: cy + Rm + labR, svg, legend: ser.length > 1 || o.legend ? ser.map(s => ({label: s.name, color: s.color})) : [], desc: `Rose des mois : ${ser.map((s, j) => `${s.name} ${fmt(tot[j], 0)} (le plus en ${MN[top[j]].toLowerCase()})`).join(' ; ')}.`};
    }
    const sampleRose = () => ({series: [{name: 'Naissances'}, {name: 'Mariages'}, {name: 'Décès'}], rows: MN.map((label, i) => ({label, s0: [48, 52, 55, 49, 44, 40, 38, 37, 42, 45, 43, 46][i], s1: [38, 40, 6, 12, 16, 22, 18, 14, 16, 18, 34, 5][i], s2: [52, 48, 44, 38, 32, 28, 30, 36, 40, 38, 42, 50][i]}))});
    const roseApp = {
        html: () => `<div class="h-dg-app gn-app"><h4>🌸 Des événements de l’app, mois par mois</h4><p class="muted">Une série par sorte d’événement ; seules les dates avec le mois comptent.</p>${TYPES_HTML(['birth', 'marriage', 'death'])}${SCOPE_HTML()}
            <button type="button" class="button small" data-gn-go>Compter par mois</button><p class="muted" data-gn-msg aria-live="polite"></p></div>`,
        bind: (pane, io) => bindApp(pane, async () => {
            const types = typesOf(pane); if (!types.length) throw new Error('Coche au moins une sorte d’événement.');
            const r = await get({what: 'dates', types: types.join(','), scope: val(pane, 'scope'), root: rootOf(pane)});
            const types2 = (r.types || types).filter(t => r.months?.[t]); if (!types2.some(t => r.months[t].some(Boolean))) throw new Error('Aucune date avec le mois pour ces événements.');
            const s = io.spec(); s.series = types2.map((t, j) => ({name: TYPE_FR[t], ...(s.series?.[j]?.color ? {color: s.series[j].color} : {})}));
            s.rows = MN.map((label, m) => { const row = {label}; types2.forEach((t, j) => { row['s' + j] = r.months[t][m]; }); return row; });
            s.o = {...s.o, title: `${types2.map(t => TYPE_FR[t]).join(', ')} par mois`}; io.apply(s); return 'Chiffres pris dans l’app.';
        }),
    };

    /* ═════════ 🌀 Spirale du temps ═════════ */
    function spiral(spec, W, fs) {
        const o = spec.o || {}, list = [];
        for (const r of rows(spec).slice(0, 3000)) { const a = yearDec(parseDay(r.start)) ?? (r.start !== '' && r.start != null && isNumText(r.start) ? num(r.start) : null); if (a == null) continue; let b = yearDec(parseDay(r.end)); if (b != null && b < a) b = null; list.push({a, b, label: str(r.label, 100), kind: str(r.kind, 60), color: color(r.color, '')}); }
        if (!list.length) return empty(W, fs, 'Ajoute des événements : une date (ou un début et une fin) et un nom.');
        let per = o.turn === 'decade' ? 10 : o.turn === 'custom' ? clamp(num(o.years) || 50, 1, 1000) : 100;
        const lo = num(o.from) || Math.min(...list.map(x => x.a)), hi = num(o.to) || Math.max(...list.map(x => x.b ?? x.a));
        let t0 = Math.floor(lo / per) * per; let turns = Math.max(1, Math.ceil((Math.max(hi, lo + .01) - t0) / per));
        while (turns > 40) { per *= 2; t0 = Math.floor(lo / per) * per; turns = Math.ceil((hi - t0) / per); }
        const hMax = num(o.height) > 80 ? num(o.height) : 1e9, Rm = Math.max(60, Math.min(W / 2 - fs * 2, hMax / 2 - fs * 2)), cx = W / 2, cy = Rm + fs * 2;
        const r0 = Rm * .14, gap = (Rm - r0) / (turns + .3);
        const ang = t => -Math.PI / 2 + TAU * ((t - t0) / per), rad = t => r0 + gap * ((t - t0) / per);
        const at = (t, off = 0) => P(cx, cy, rad(t) + off, ang(t));
        const kinds = [...new Set(list.map(x => x.kind).filter(Boolean))], kcol = new Map(kinds.map((k, i) => [k, KNOWN[fold(k)] || pick(spec, i)]));
        let svg = '';
        // la spirale : un trait fin, une spire par période
        const pts = []; for (let t = t0, end = t0 + turns * per, stp = per / 120; t <= end + 1e-9; t += stp) { const [x, y] = at(t); pts.push(`${r2(x)} ${r2(y)}`); }
        svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1"/>`;
        // repères : les années de début de spire (en haut), et les fractions de la période autour
        for (let k = 0; k <= turns; k++) { const t = t0 + k * per, [x, y] = at(t); svg += `<circle cx="${r2(x)}" cy="${r2(y)}" r="2" fill="currentColor" fill-opacity=".45"/>`; if (gap > fs * .9 || k % Math.ceil(fs / gap) === 0) svg += T(x + 4, y - 1, String(Math.round(t)), {size: fs * .75, fill: '#777', baseline: 'auto'}); }
        for (let q = 1; q < 10; q++) { if (per % 10 && q % 5) continue; const a = -Math.PI / 2 + TAU * q / 10, [x, y] = P(cx, cy, Rm + fs * .9, a); svg += T(x, y, `+${fmt(per * q / 10, 0)}`, {size: fs * .7, anchor: 'middle', fill: '#999'}); }
        // les segments (vies, périodes) puis les points
        const segs = list.filter(x => x.b != null && x.b > x.a).sort((x, y) => x.a - y.a).slice(0, 1500), lanes = [], laneOf = new Map(), maxL = clamp(Math.floor(gap / 4), 1, 6);
        segs.forEach(s => { let l = lanes.findIndex(e => e <= s.a); if (l < 0) { l = lanes.length < maxL ? lanes.length : lanes.indexOf(Math.min(...lanes)); } lanes[l] = s.b; laneOf.set(s, l); });
        const nL = Math.max(1, Math.min(maxL, lanes.length)), lw = Math.max(1.2, Math.min(clamp(num(o.segWidth) || 6, 1, 30), gap * .8 / nL));
        segs.forEach(s => { const off = (laneOf.get(s) - (nL - 1) / 2) * lw * 1.1, c = s.color || (s.kind ? kcol.get(s.kind) : pick(spec, 0)), p = [];
            for (let t = s.a, stp = Math.max(per / (segs.length > 300 ? 60 : 240), (s.b - s.a) / (segs.length > 300 ? 20 : 200)); t <= s.b + 1e-9; t += stp) { const [x, y] = at(Math.min(t, s.b), off); p.push(`${r2(x)} ${r2(y)}`); }
            svg += `<polyline points="${p.join(' ')}" fill="none" stroke="${c}" stroke-width="${r2(lw)}" stroke-linecap="round" stroke-opacity=".8"><title>${esc(`${s.label}${s.kind ? ' · ' + s.kind : ''} : ${fmt(s.a, 0)} – ${fmt(s.b, 0)}`)}</title></polyline>`; });
        const pts2 = list.filter(x => x.b == null || x.b <= x.a), placed = [], maxLab = o.labels === 'none' ? 0 : o.labels === 'all' ? 400 : 40;
        pts2.forEach(p => { const c = p.color || (p.kind ? kcol.get(p.kind) : pick(spec, 1)), [x, y] = at(p.a); svg += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(clamp(num(o.dot) || 4.5, 1.5, 14))}" fill="${c}" stroke="#fff" stroke-width="1"><title>${esc(`${p.label}${p.kind ? ' · ' + p.kind : ''} : ${fmt(p.a, 1)}`)}</title></circle>`; });
        if (maxLab) [...pts2, ...segs].slice(0, 2000).forEach(p => { if (placed.length >= maxLab || !p.label) return; const a = ang(p.a), [x, y] = at(p.a, gap * .35), f = fs * .78, w = textW(p.label, f), right = Math.cos(a) >= 0, bx = right ? x + 4 : x - 4 - w, box = [bx, y - f * .6, w, f * 1.2];
            if (placed.some(b => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1]) || bx < -fs * 1.5 || bx + w > W + fs * 1.5) return; placed.push(box);
            svg += T(right ? x + 4 : x - 4, y, cut(p.label, fs * 14, f), {size: f, anchor: right ? 'start' : 'end'}); });
        return {h: cy + Rm + fs * 2, svg, legend: kinds.slice(0, 16).map(k => ({label: k, color: kcol.get(k)})), desc: `Spirale du temps de ${Math.round(t0)} à ${Math.round(t0 + turns * per)}, ${per} ans par tour : ${list.length} événement${list.length > 1 ? 's' : ''}.`};
    }
    const sampleSpiral = () => [['1715', '', 'Mort de Louis XIV', 'Histoire'], ['1789', '', 'Révolution', 'Histoire'], ['1804', '', 'Code civil', 'Histoire'], ['1870', '', 'Guerre de 1870', 'Histoire'], ['1914', '1918', 'Grande Guerre', 'Histoire'], ['1939', '1945', 'Seconde Guerre mondiale', 'Histoire'],
        ['1742', '1801', 'Jean MARTIN', 'Vie'], ['1768', '1832', 'Pierre MARTIN', 'Vie'], ['1801', '1867', 'Louis MARTIN', 'Vie'], ['1830', '1899', 'Rose MARTIN', 'Vie'], ['1862', '1931', 'Joseph MARTIN', 'Vie'], ['1895', '1972', 'Marie MARTIN', 'Vie'], ['1921', '2004', 'René MARTIN', 'Vie'],
        ['1792', '', 'Mariage à Rennes', 'Famille'], ['1846', '', 'Départ pour Nantes', 'Famille'], ['1903', '', 'Achat de la ferme', 'Famille'], ['1956', '', 'Arrivée à Paris', 'Famille']].map(([start, end, label, kind]) => ({start, end, label, kind}));
    const spiralApp = {
        html: () => `<div class="h-dg-app gn-app"><h4>🌀 Des vies et des événements de l’app</h4><label>Quoi<select data-gn="what"><option value="lives">Les vies (de la naissance au décès)</option><option value="events">Des événements (points)</option></select></label>${TYPES_HTML(['birth', 'marriage', 'death'])}${SCOPE_HTML()}
            <button type="button" class="button small" data-gn-go>Prendre ces dates</button><p class="muted" data-gn-msg aria-live="polite"></p></div>`,
        bind: (pane, io) => bindApp(pane, async () => {
            const what = val(pane, 'what') === 'events' ? 'events' : 'lives', types = typesOf(pane);
            const r = await get({what, types: types.join(','), scope: val(pane, 'scope'), root: rootOf(pane)}), s = io.spec();
            if (what === 'lives') { if (!r.people?.length) throw new Error('Aucune personne avec une date de naissance ou de décès.'); s.rows = r.people.map(p => ({start: p.birth || p.death, end: p.birth && p.death ? p.death : '', label: p.name, kind: {male: 'Homme', female: 'Femme'}[p.gender] || 'Personne'})); s.o = {...s.o, title: 'Vies de la famille'}; }
            else { if (!r.events?.length) throw new Error('Aucun événement daté.'); s.rows = r.events.map(e => ({start: e.date, end: '', label: e.label, kind: e.kind})); s.o = {...s.o, title: 'Les événements de la famille'}; }
            io.apply(s); return `${s.rows.length} ligne${s.rows.length > 1 ? 's' : ''} prise${s.rows.length > 1 ? 's' : ''} dans l’app.`;
        }),
    };

    /* ═════════ « Depuis l'app » : petits outils communs ═════════ */
    // couleurs habituelles de l'app (bleu homme, rose femme…) pour les catégories venues de l'arbre
    const KNOWN = {homme: '#4e79a7', femme: '#e15759', inconnu: '#9aa3ad', personne: '#76b7b2', naissance: '#59a14f', bapteme: '#76b7b2', mariage: '#f28e2b', deces: '#5f6b7a', sepulture: '#9c755f'};
    const get = q => A().api('diagram_genea', q);
    const val = (pane, k) => pane.querySelector(`[data-gn="${k}"]`)?.value || '';
    const rootOf = pane => Number(pane.querySelector('[name="gn_root"]')?.value) || Number(A().state?.bootstrap?.startPersonId) || 0;
    function bindApp(pane, run) {
        const btn = pane.querySelector('[data-gn-go]'), msg = pane.querySelector('[data-gn-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = '<span class="ui-spinner" aria-hidden="true"></span> Lecture de ta généalogie…';
            try { const t = await run(); A().toast?.(t || 'Données prises dans l’app.'); } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; if (msg?.isConnected && msg.querySelector('.ui-spinner')) msg.textContent = ''; } });
    }

    /* ═════════ Les types ═════════ */
    const H_OPT = C('height', 'Hauteur au plus (px)', 'number', {min: 80, max: 2400});
    const LABELS = C('labels', 'Noms', 'select', {choices: [['', 'Les plus reliés (30)'], ['all', 'Tous'], ['none', 'Aucun']]});
    const COLORBY = C('colorBy', 'Couleur des points', 'select', {choices: [['', 'Par groupe (colonne « Groupe »)'], ['community', 'Groupes trouvés tout seuls'], ['kind', 'Une seule (les liens en couleur)'], ['none', 'Couleur du tableau']]});
    const LINKS_GRID = {key: 'rows', label: 'Les liens (une ligne par lien)', cols: [C('a', 'Personne A'), C('b', 'Personne B'), C('kind', 'Sorte de lien (témoin, parrain…)'), C('weight', 'Force (nombre)', 'number')]};
    const NODES_GRID = {key: 'nodes', label: 'Les personnes (facultatif : groupe et couleur)', cols: [C('name', 'Nom'), C('group', 'Groupe (famille, village…)'), C('color', 'Couleur', 'color')]};
    const KINDS_GRID = {key: 'kinds', label: 'Couleur des sortes de liens (facultatif)', cols: [C('kind', 'Sorte'), C('color', 'Couleur', 'color')]};
    const NEW = {
        fan: {icon: '🪭', label: 'Éventail d’ascendance (mes chiffres)', group: 'Généalogie', render: fan, legend: 'bottom', fromApp: fanApp,
            grids: [{key: 'rows', label: 'Les ancêtres (n° Sosa → valeur)', cols: [C('sosa', 'N° Sosa', 'number'), C('name', 'Nom'), C('value', 'Valeur (chiffre ou catégorie)'), C('detail', 'Détail (dates, lieu…)')]},
                {key: 'cats', label: 'Les catégories et leur couleur (facultatif)', cols: [C('value', 'Valeur'), C('color', 'Couleur', 'color')]}],
            options: [C('shape', 'Forme', 'select', {choices: [['half', 'Demi-cercle'], ['three', 'Trois quarts'], ['full', 'Cercle complet']], def: 'half'}), C('gens', 'Générations', 'range', {min: 3, max: 10, def: 5}),
                C('labels', 'Dans les cases', 'select', {choices: [['', 'Le nom'], ['both', 'Le nom et la valeur'], ['detail', 'Le nom et le détail'], ['value', 'La valeur'], ['none', 'Rien']]}),
                C('scale', 'Couleurs', 'select', {choices: [['', 'Automatique'], ['num', 'Un dégradé (chiffres)'], ['cat', 'Une couleur par catégorie']]}),
                C('lowColor', 'Couleur des petits chiffres', 'color', {def: '#fde0c5', when: s => s.o?.scale !== 'cat'}), C('highColor', 'Couleur des grands chiffres', 'color', {def: '#b3261e', when: s => s.o?.scale !== 'cat'}),
                C('min', 'Dégradé : minimum (vide = auto)', 'number', {when: s => s.o?.scale !== 'cat'}), C('max', 'Dégradé : maximum (vide = auto)', 'number', {when: s => s.o?.scale !== 'cat'}), C('unit', 'Unité (%, ans…)', 'text', {when: s => s.o?.scale !== 'cat'}),
                C('center', 'Taille du centre (%)', 'range', {min: 6, max: 40, def: 16}), C('border', 'Traits blancs entre les cases', 'check', {def: true}), C('genLabels', 'Numéro des générations', 'check', {def: true, when: s => (s.o?.shape || 'half') === 'half'}), H_OPT],
            sample: () => ({o: {title: 'Origines de mes ancêtres', shape: 'half', gens: 5, scale: 'cat'}, rows: sampleAncestors(5), cats: [{value: 'Bretagne', color: '#4e79a7'}, {value: 'Normandie', color: '#59a14f'}, {value: 'Anjou', color: '#f28e2b'}, {value: 'Poitou', color: '#b07aa1'}, {value: 'Paris', color: '#e15759'}]})},
        sunburst: {icon: '🌞', label: 'Soleil des lignées (anneaux)', group: 'Généalogie', render: sunburst, legend: 'bottom', fromApp: sunApp,
            grids: [{key: 'rows', label: 'Les parts (parent → enfant → chiffre)', cols: [C('name', 'Nom (unique)'), C('parent', 'Au-dessus (vide = au centre)'), C('value', 'Chiffre', 'number'), C('color', 'Couleur', 'color')]}],
            options: [C('sizeBy', 'Taille des parts', 'select', {choices: [['value', 'Le chiffre (ou la somme des parts)'], ['desc', 'Le nombre de descendants'], ['leaves', 'Le nombre de bouts de branche']], def: 'value'}),
                C('angle', 'Forme', 'select', {choices: [['', 'Cercle complet'], ['half', 'Demi-cercle']]}), C('depth', 'Anneaux au plus', 'range', {min: 1, max: 12, def: 6}), C('hole', 'Trou au centre (%)', 'range', {min: 0, max: 60, def: 18}),
                C('colorBy', 'Couleurs', 'select', {choices: [['', 'Une par branche (plus clair vers l’extérieur)'], ['depth', 'Une par anneau']]}), C('labels', 'Noms', 'select', {choices: [['', 'Le nom'], ['value', 'Le nom et le chiffre'], ['none', 'Aucun']]}),
                C('sort', 'Ordre des parts', 'select', {choices: [['', 'Comme dans le tableau'], ['size', 'De la plus grande à la plus petite']]}), C('centerText', 'Texte au centre'), C('border', 'Traits blancs entre les parts', 'check', {def: true}), H_OPT],
            sample: () => ({o: {title: 'Descendance de Jean Martin', sizeBy: 'desc'}, rows: sampleSun()})},
        network: {icon: '🕸️', label: 'Réseau de relations (témoins, parrains…)', group: 'Généalogie', render: network, legend: 'bottom', fromApp: netApp,
            grids: [LINKS_GRID, NODES_GRID, KINDS_GRID],
            options: [COLORBY, C('cluster', 'Rapprocher les points de même couleur', 'check'), C('edgeKinds', 'Liens colorés selon leur sorte', 'check', {def: true}), LABELS, C('sizeBy', 'Taille des points', 'select', {choices: [['', 'Selon le nombre de liens'], ['same', 'Tous pareils']]}),
                C('nodeSize', 'Taille des points', 'range', {min: 3, max: 30, def: 9}), C('strength', 'Écartement', 'range', {min: .2, max: 4, step: .1, def: 1}), C('height', 'Hauteur (px)', 'number', {min: 220, max: 2400})],
            sample: () => ({o: {title: 'Témoins et parrains au village'}, ...sampleNet()})},
        arcs: {icon: '🌈', label: 'Arcs de liens (implexe, mariages entre familles)', group: 'Généalogie', render: arcs, legend: 'bottom', fromApp: arcsApp,
            grids: [LINKS_GRID, {...NODES_GRID, label: 'Les personnes, dans l’ordre de la ligne (facultatif)'}, KINDS_GRID],
            options: [C('order', 'Ordre sur la ligne', 'select', {choices: [['', 'Comme dans les tableaux'], ['group', 'Par groupe'], ['degree', 'Les plus reliés d’abord'], ['az', 'A → Z'], ['number', 'Par numéro (Sosa 2, 3, 10…)']]}),
                C('side', 'Arcs', 'select', {choices: [['', 'Au-dessus'], ['kind', 'Au-dessus et en dessous selon la sorte'], ['below', 'En dessous']]}), C('arcHeight', 'Hauteur des arcs (%)', 'range', {min: 10, max: 120, def: 55}),
                {...COLORBY, choices: COLORBY.choices}, C('edgeKinds', 'Arcs colorés selon leur sorte', 'check', {def: true}), C('labels', 'Noms', 'select', {choices: [['', 'Sous la ligne'], ['none', 'Aucun']]})],
            sample: () => ({o: {title: 'Mariages entre familles du village', order: 'degree', colorBy: 'community'}, rows: sampleArcs(), nodes: []})},
        venn: {icon: '⭕', label: 'Diagramme de Venn (2 à 4 ensembles)', group: 'Généalogie', render: venn, noLegend: true, fromApp: vennApp,
            grids: [{key: 'sets', label: 'Les ensembles (2 à 4) : A, B, C, D', max: 4, cols: [C('name', 'Nom'), C('color', 'Couleur', 'color')]},
                {key: 'rows', label: 'Ce qu’on écrit dans chaque zone (AB = dans A et B, pas dans les autres)', fixed: spec => ZONES(clamp(rows(spec, 'sets').length, 2, 4)), cols: [C('region', 'Zone', 'readonly'), C('value', 'Nombre ou texte')]}],
            options: [C('pct', 'Ajouter le pourcentage', 'check'), C('totals', 'Total de chaque ensemble à côté de son nom', 'check', {def: true}), C('opacity', 'Transparence des formes (%)', 'range', {min: 5, max: 80, def: 30}), H_OPT],
            sample: () => ({o: {title: 'Mes sources'}, sets: [{name: 'État civil'}, {name: 'Registres paroissiaux'}, {name: 'Notaires'}, {name: 'Recensements'}], rows: ZONES(4).map((region, i) => ({region, value: String([120, 85, 30, 64, 40, 12, 22, 9, 15, 11, 5, 6, 4, 3, 2][i])}))})},
        calendar: {icon: '🗓️', label: 'Calendrier coloré (jour par jour)', group: 'Frises', render: calendar, legend: 'bottom', fromApp: calApp,
            grids: [{key: 'rows', label: 'Les dates (une ligne par événement, ou une date et un nombre)', cols: [C('date', 'Date', 'text', {ph: '7 mai 1925, 08/12/1960, 12 thermidor an II'}), C('value', 'Nombre (vide = 1)', 'number'), C('label', 'Quoi')]}],
            options: [C('layout', 'Présentation', 'select', {choices: [['', 'Toutes années ensemble (12 mois × 31 jours)'], ['year', 'Une ligne par année (semaines)']]}), C('years', 'Années (ex. 1890-1895, 1900 ; vide = auto)'),
                C('lowColor', 'Couleur de « peu »', 'color', {def: '#e3ecfb'}), C('highColor', 'Couleur de « beaucoup »', 'color', {def: '#1e4fd8'}), C('scale', 'Dégradé', 'select', {choices: [['', 'Doux (racine carrée)'], ['linear', 'Proportionnel']]}),
                C('values', 'Écrire les nombres dans les cases', 'check', {when: s => s.o?.layout !== 'year'}), C('noDayNote', 'Dire combien de dates n’ont pas de jour', 'check', {def: true})],
            sample: () => ({o: {title: 'Jours de naissance de mes ancêtres'}, rows: sampleCal()})},
        monthrose: {icon: '🌸', label: 'Rose des mois (12 parts)', group: 'Frises', render: monthrose, legend: 'bottom', fromApp: roseApp,
            grids: [{key: 'rows', label: 'Les mois (janvier à décembre)', series: true, cols: [C('label', 'Mois')]}],
            options: [C('style', 'Plusieurs séries', 'select', {choices: [['side', 'Côte à côte'], ['stack', 'Empilées'], ['overlap', 'Superposées (transparentes)']], def: 'side'}), C('scale', 'Longueur des rayons', 'select', {choices: [['', 'Surface juste (racine carrée)'], ['linear', 'Proportionnelle']]}),
                C('hole', 'Trou au centre (%)', 'range', {min: 0, max: 60, def: 10}), C('values', 'Écrire les nombres (une seule série)', 'check'), C('short', 'Mois en abrégé', 'check', {def: true}), H_OPT],
            sample: () => ({o: {title: 'Naissances, mariages et décès par mois'}, ...sampleRose()})},
        spiral: {icon: '🌀', label: 'Spirale du temps (une spire par siècle)', group: 'Frises', render: spiral, legend: 'bottom', fromApp: spiralApp,
            grids: [{key: 'rows', label: 'Les événements (une date = un point ; un début et une fin = un trait)', cols: [C('start', 'Date ou début', 'text', {ph: '1789, 7 mai 1925'}), C('end', 'Fin (facultatif)'), C('label', 'Nom'), C('kind', 'Sorte (couleur)'), C('color', 'Couleur', 'color')]}],
            options: [C('turn', 'Un tour de spirale', 'select', {choices: [['', 'Un siècle'], ['decade', 'Une décennie'], ['custom', 'Autant d’années que…']]}), C('years', 'Années par tour', 'number', {min: 1, max: 1000, def: 50, when: s => s.o?.turn === 'custom'}),
                C('from', 'Début (année, vide = auto)', 'number'), C('to', 'Fin (année, vide = auto)', 'number'), C('labels', 'Noms', 'select', {choices: [['', 'Quelques-uns (sans chevauchement)'], ['all', 'Tous (sans chevauchement)'], ['none', 'Aucun']]}),
                C('segWidth', 'Épaisseur des traits', 'range', {min: 1, max: 30, def: 6}), C('dot', 'Taille des points', 'range', {min: 1.5, max: 14, step: .5, def: 4.5}), H_OPT],
            sample: () => ({o: {title: 'Trois siècles de la famille Martin'}, rows: sampleSpiral()})},
    };
    // l'ancien Venn (2 ou 3 ensembles) est remplacé : mêmes données, une zone de plus par ensemble ajouté
    delete K.venn;
    Object.assign(K, NEW);
    ext.diagramGenea = {parseDay, netState: () => NET, ZONES, vennLayout, hierarchy, graphOf};

    /* ═════════ 🕸 Le réseau posé dans la page : la disposition continue par étapes, on glisse les points, on zoome ═════════ */
    function enhance(g) {
        if (g.__gn) return; g.__gn = 1;
        const st = NET.get(g.dataset.gnNet), svg = g.ownerSVGElement; if (!st || !svg) return;
        const [ox, oy, s] = g.dataset.fit.split(' ').map(Number), vp = g.querySelector('[data-gn-vp]');
        const nodes = [...g.querySelectorAll('[data-n]')], edges = [...g.querySelectorAll('line[data-e]')];
        const ea = edges.map(e => +e.dataset.a), eb = edges.map(e => +e.dataset.b);
        let z = 1, tx = 0, ty = 0, raf = 0, paused = false, drag = null, pan = null;
        const apply = () => vp.setAttribute('transform', `translate(${r2(tx)} ${r2(ty)}) scale(${r2(z)})`);
        const paint = () => { for (let i = 0; i < nodes.length; i++) nodes[i].setAttribute('transform', `translate(${r2(st.x[i] * s + ox)} ${r2(st.y[i] * s + oy)})`);
            for (let e = 0; e < edges.length; e++) { const l = edges[e]; l.setAttribute('x1', r2(st.x[ea[e]] * s + ox)); l.setAttribute('y1', r2(st.y[ea[e]] * s + oy)); l.setAttribute('x2', r2(st.x[eb[e]] * s + ox)); l.setAttribute('y2', r2(st.y[eb[e]] * s + oy)); } };
        const loop = () => { raf = 0; if (!g.isConnected) return; if (!paused || drag) { runFor(st, nodes.length > 300 ? 9 : 6, 40); paint(); } if ((st.alpha > .02 && !paused) || drag) raf = requestAnimationFrame(loop); };
        const kick = (a = .25) => { st.alpha = Math.max(st.alpha, a); if (!raf) raf = requestAnimationFrame(loop); };
        const local = (ev, el) => { const m = el.getScreenCTM(); if (!m) return {x: 0, y: 0}; const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(m.inverse()); return {x: q.x, y: q.y}; };
        g.style.cursor = 'grab';
        nodes.forEach(n => { n.style.cursor = 'pointer'; n.style.touchAction = 'none'; });
        g.addEventListener('pointerdown', ev => {
            const nd = ev.target.closest?.('[data-n]');
            if (nd) { const i = +nd.dataset.n; drag = {i, id: ev.pointerId}; st.pin[i] = 1; try { g.setPointerCapture(ev.pointerId); } catch (_) {} ev.preventDefault(); kick(.3); return; }
            if (ev.pointerType === 'mouse') { const p = local(ev, g); pan = {x: p.x - tx, y: p.y - ty, id: ev.pointerId}; try { g.setPointerCapture(ev.pointerId); } catch (_) {} g.style.cursor = 'grabbing'; }
        });
        g.addEventListener('pointermove', ev => {
            if (drag && ev.pointerId === drag.id) { const p = local(ev, vp); st.x[drag.i] = (p.x - ox) / s; st.y[drag.i] = (p.y - oy) / s; kick(.25); }
            else if (pan && ev.pointerId === pan.id) { const p = local(ev, g); tx = p.x - pan.x; ty = p.y - pan.y; apply(); }
        });
        const up = ev => { if (drag && ev.pointerId === drag.id) drag = null; if (pan && ev.pointerId === pan.id) { pan = null; g.style.cursor = 'grab'; } };
        g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
        g.addEventListener('dblclick', ev => { const nd = ev.target.closest?.('[data-n]'); if (nd) { st.pin[+nd.dataset.n] = 0; kick(.3); } else { z = 1; tx = ty = 0; apply(); } });
        const zoomAt = (f, p) => { const nz = clamp(z * f, .3, 8); tx = p.x - (p.x - tx) * nz / z; ty = p.y - (p.y - ty) * nz / z; z = nz; apply(); };
        const host = svg.parentElement;
        svg.addEventListener('wheel', ev => { if (!(ev.ctrlKey || ev.metaKey || host?.classList.contains('gn-zoomon'))) return; ev.preventDefault(); zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, local(ev, g)); }, {passive: false});
        // petite barre d'outils à côté du dessin (pas dans l'image exportée)
        if (host && !host.closest('.h-dg-mini') && !host.querySelector(':scope > .gn-net-tools')) {
            host.classList.add('gn-net-host');
            const bar = document.createElement('div'); bar.className = 'gn-net-tools';
            bar.innerHTML = `<button type="button" class="icon-button small" data-z="in" title="Zoomer" aria-label="Zoomer">＋</button><button type="button" class="icon-button small" data-z="out" title="Dézoomer" aria-label="Dézoomer">−</button><button type="button" class="icon-button small" data-z="reset" title="Revenir au départ (ou double-clic sur le fond)" aria-label="Revenir au départ">⟲</button><button type="button" class="icon-button small" data-z="play" title="Arrêter / relancer le mouvement" aria-label="Arrêter ou relancer le mouvement">⏸</button><button type="button" class="icon-button small" data-z="wheel" title="Zoomer avec la molette (sinon : Ctrl + molette)" aria-label="Zoom à la molette" aria-pressed="false">🖱</button><span class="gn-net-hint">Glisse un point pour le placer · double-clic pour le libérer</span>`;
            bar.addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (!b) return; const c = {x: (num(svg.viewBox.baseVal?.width) || 600) / 2, y: (num(svg.viewBox.baseVal?.height) || 400) / 2};
                if (b.dataset.z === 'in') zoomAt(1.3, c); if (b.dataset.z === 'out') zoomAt(1 / 1.3, c); if (b.dataset.z === 'reset') { z = 1; tx = ty = 0; apply(); st.pin.fill(0); kick(.5); }
                if (b.dataset.z === 'play') { paused = !paused; b.textContent = paused ? '▶' : '⏸'; if (!paused) kick(.3); }
                if (b.dataset.z === 'wheel') { const on = host.classList.toggle('gn-zoomon'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); } });
            host.appendChild(bar);
        }
        if (st.alpha > .02) kick(st.alpha);
    }
    let enhT = 0;
    const scan = () => document.querySelectorAll('[data-gn-net]').forEach(g => { if (!g.__gn && !g.closest('.h-dg-mini')) enhance(g); });
    new MutationObserver(() => { clearTimeout(enhT); enhT = setTimeout(scan, 50); }).observe(document.documentElement, {childList: true, subtree: true});
})();
