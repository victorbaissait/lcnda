/* LCNDA — 🗺️ Cartes et arbres en plus (s'ajoutent au catalogue de heritage-diagrams-render.js) :
 *  Cartes : 📍 carte en points (un point par événement), ⬢ carte en hexagones (densité en alvéoles égales),
 *           🫧 carte déformée (cartogramme : départements, régions ou pays grossis selon leur chiffre, ronds ou carrés),
 *           📖 carte qui raconte (la vie d'une personne étape par étape, frise en bas, ◀ ▶ et lecture) ;
 *  Généalogie : 🧱 descendance en rectangles (icicle), 🎀 prénoms transmis (parrain, marraine → filleul),
 *           🎗 causes de décès en anneaux (grandes familles au centre, le détail autour).
 * Les cartes réutilisent les fonds, projections, cadrages et le cadrage à la souris de heritage-diagram-cartes.js
 * (ext.diagramCartes) ; les données de l'arbre viennent de api.php?action=diagram_cartes2 (lib/diagram_cartes2.php),
 * de diagram_genea (descendance) et de diagram_geo (cartogramme, comme la carte colorée).
 * Chaque sorte : {icon, label, group, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp}.
 * Un clic sur un point, une alvéole, une case ou une part ouvre la fiche, ou la fenêtre « qui est compté » (ext.whoDialog).
 * Tout texte passe par esc() ; couleurs vérifiées (DR.color) ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const DR = ext.diagramRender, GC = ext.diagramCartes; if (!DR?.KINDS || !GC) return;
    const K = DR.KINDS;
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : DR.num(v)), color = DR.color;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r1 = v => Math.round((Number.isFinite(v) ? v : 0) * 10) / 10, r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = [0, 1].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}));
    const fmt = (n, d = 0) => NF[d ? 1 : 0].format(Number(n) || 0);
    const TAU = Math.PI * 2;
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', baseline = 'middle', style = '', halo = '', rotate = 0} = {}) =>
        `<text x="${r1(x)}" y="${r1(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${style ? ` font-style="${style}"` : ''}${rotate ? ` transform="rotate(${r2(rotate)} ${r1(x)} ${r1(y)})"` : ''}${halo ? ` stroke="${halo}" stroke-width="${r2(size / 4)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const hex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); if (!a || !b) return t < .5 ? c1 : c2; return hex(a.map((v, i) => v + (b[i] - v) * clamp(t, 0, 1))); };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const rows = (spec, max = 20000, key = 'rows') => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object').slice(0, max);
    const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const pl = (n, one, many = '') => A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`;
    const pal = spec => DR.PALETTES[spec.o?.palette] || DR.PALETTES.vive;
    const pick = (spec, i) => { const p = pal(spec); return p[((i % p.length) + p.length) % p.length]; };
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, msg, {anchor: 'middle', size: fs, fill: '#888'}), legend: [], desc: msg});
    /** l'année d'une date tapée comme dans un acte (« 7 mai 1925 », « 08/12/1960 », « 1832 ») */
    const yearOf = v => { const t = String(v ?? '').replace(/-00\b/g, '').trim(); if (!t) return null; const y = DR.when(t, false); return y === null || !Number.isFinite(y) || y < -3000 || y > 3000 ? null : Math.floor(y); };
    const GENDER = {male: '#4e79a7', female: '#e15759', unknown: '#9aa3ad'};
    const pidsAttr = list => [...new Set(list.map(Number).filter(x => x > 0))].slice(0, 500).join(',');
    let seq = 0;

    /* ═════════ Le fond des cartes (celui de heritage-diagram-cartes.js) ═════════ */
    const H_OPT = C('height', 'Hauteur au plus', 'number', {unit: 'px', min: 120, max: 3000});
    /** les fonds qui servent à placer les lieux (département, pays : leur centre), puis le cadrage, le fond et la projection */
    function placeBases(spec, W) {
        const o = spec.o || {}, M = GC.MAPS[GC.mapOf(o)];
        if (o.frame === 'zone' && M.zoneBase) { const w0 = GC.needBases(spec, W, [M.zoneBase]); if (w0) return {wait: w0}; }
        const pre = GC.viewOf(o), b0 = GC.baseIdOf(o, pre), c0 = GC.mapOf(o) === 'monde' || GC.mapOf(o) === 'eu' ? 'monde-50m' : GC.ctxIdOf(o, b0, pre);
        const w1 = GC.needBases(spec, W, [b0, c0, 'monde-110m']); if (w1) return {wait: w1};
        return {bases: [GC.loaded(b0), c0 ? GC.loaded(c0) : null, GC.loaded('monde-110m')].filter(Boolean)};
    }
    function mapFrame(spec, W, fs, pts, {view: forced = null, hMax = 2400} = {}) {
        const o = spec.o || {}, M = GC.MAPS[GC.mapOf(o)];
        const auto = forced || ((!o.frame || o.frame === '') && o.fit !== false && pts.length ? GC.fitView(pts.map(p => ({p})), o) : null);
        const view = forced || GC.viewOf(o, auto || M.view), baseId = GC.baseIdOf(o, view), ctxId = GC.ctxIdOf(o, baseId, view);
        const wait = GC.needBases(spec, W, [baseId, ctxId]); if (wait) return {wait};
        const base = GC.loaded(baseId), ctx = ctxId ? GC.loaded(ctxId) : null, uid = 'c2m' + (++seq);
        const pr = GC.fitProj(o.proj && o.proj !== 'auto' ? o.proj : GC.autoProj(view), view, W, clamp(num(o.height) || hMax, 120, 3000), !num(o.height)); pr.allOutre = true;
        const land = color(o.zoneColor, GC.LAND), B = GC.drawBase({...spec, o: {...o, borderColor: o.borderColor || '#cfcabe'}}, base, ctx, pr, W, pr.h, () => ({fill: land, title: ''}), uid);
        const close = `<text x="${r1(W - 4)}" y="${r1(pr.h - 4)}" font-size="${r2(clamp(fs * .62, 7, 12))}" text-anchor="end" fill="#555" fill-opacity=".85">${esc(GC.attrOf(base, ctx))}</text><rect data-geo-hit="1" width="${r1(W)}" height="${r1(pr.h)}" fill="none" stroke="#c8cdd3" stroke-width=".6"/></g>`;
        return {pr, w: W, h: pr.h, uid, open: `<g data-geo-map="${uid}">${B.svg}<g clip-path="url(#${uid}c)">`, close: '</g>' + close, geo: {uid, pr, w: W, h: pr.h}};
    }
    /** les lignes du tableau → des points [{lon, lat, place, y, kind, name, pid, color}] ; un lieu cherché une seule fois */
    function pointsOf(spec, bases, max = 20000) {
        const o = spec.o || {}, from = String(o.from ?? '').trim() ? num(o.from) : null, to = String(o.to ?? '').trim() ? num(o.to) : null;
        const out = [], unknown = new Set(), memo = new Map();
        for (const r of rows(spec, max)) {
            const label = str(r.label, 120); if (!label) continue;
            const y = yearOf(r.date);
            if ((from !== null && (y === null || y < from)) || (to !== null && (y === null || y > to))) continue;
            let p = memo.get(label); if (p === undefined) { p = GC.placeOf(spec, label, bases); memo.set(label, p); }
            if (!p) { if (unknown.size < 40) unknown.add(label.slice(0, 40)); continue; }
            out.push({lon: p[0], lat: p[1], place: p[2], y, kind: str(r.kind, 60), name: str(r.name, 120), pid: Number(r.pid) > 0 ? Number(r.pid) : 0, color: color(r.color, '')});
        }
        return {pts: out, unknown: [...unknown]};
    }
    const missingLine = (unknown, y, fs) => unknown.length ? T(0, y + fs * .7, `⚠ Lieux sans position : ${unknown.slice(0, 8).join(', ')}${unknown.length > 8 ? '…' : ''} — tape « Nom 48.11, -1.68 » ou « Depuis l’app » → Retrouver les lieux`, {size: fs * .78, fill: '#a5552a'}) : '';
    const centuryOf = y => y === null ? 'Sans date' : `${Math.floor(y / 100) + 1}${Math.floor(y / 100) + 1 === 1 ? 'er' : 'e'} siècle`;
    /** la couleur d'un point (sorte, siècle, une seule) et la légende qui va avec */
    function pointColors(spec, pts) {
        const o = spec.o || {}, by = o.colorBy || 'kind', one = color(o.dotColor, '#e15759');
        if (by === 'one') return {of: p => p.color || one, legend: []};
        const key = p => by === 'century' ? centuryOf(p.y) : (p.kind || 'Événement');
        const freq = new Map(); pts.forEach(p => { const k = key(p); freq.set(k, (freq.get(k) || 0) + 1); });
        const order = by === 'century' ? [...freq.keys()].sort((a, b) => (a === 'Sans date') - (b === 'Sans date') || parseInt(a, 10) - parseInt(b, 10)) : [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
        const KNOWN = {naissance: '#59a14f', bapteme: '#76b7b2', mariage: '#f28e2b', deces: '#5f6b7a', sepulture: '#9c755f', residence: '#4e79a7', recensement: '#b07aa1'};
        const cm = new Map(order.map((k, i) => [k, (by === 'kind' && KNOWN[fold(k)]) || (by === 'century' ? mix('#fdd49e', '#7f2704', order.length > 1 ? i / (order.length - 1) : 1) : pick(spec, i))]));
        return {of: p => p.color || cm.get(key(p)), legend: order.slice(0, 16).map(k => ({label: `${k} (${fmt(freq.get(k))})`, color: cm.get(k)}))};
    }

    /* ═════════ 📍 Carte en points ═════════ */
    function dotmap(spec, W, fs) {
        const o = spec.o || {}, B0 = placeBases(spec, W); if (B0.wait) return B0.wait;
        const {pts, unknown} = pointsOf(spec, B0.bases), F = mapFrame(spec, W, fs, pts.map(p => [p.lon, p.lat])); if (F.wait) return F.wait;
        const {pr, w, h} = F, col = pointColors(spec, pts), R0 = clamp(num(o.dotSize) || 3.2, .8, 14), opa = clamp(num(o.opacity) || 80, 10, 100) / 100;
        const groups = new Map();
        pts.forEach(p => { const k = `${r2(p.lon)}|${r2(p.lat)}|${fold(p.place)}`, g = groups.get(k); if (g) g.list.push(p); else groups.set(k, {p, list: [p]}); });
        let svg = `<g data-c2-total="${pts.length}"></g>` + F.open, drawn = 0;
        const unit = String(o.unit || 'événement').slice(0, 30);
        [...groups.values()].sort((a, b) => b.list.length - a.list.length).forEach(g => {
            const [x0, y0] = pr.p(g.p.lon, g.p.lat); if (!Number.isFinite(x0) || x0 < -20 || x0 > w + 20 || y0 < -20 || y0 > h + 20) return;
            const ys = g.list.map(p => p.y).filter(y => y !== null), names = g.list.filter(p => p.name).slice(0, 8).map(p => `${p.name}${p.y !== null ? ' (' + p.y + ')' : ''}`);
            const kinds = new Map(); g.list.forEach(p => kinds.set(p.kind || 'Événement', (kinds.get(p.kind || 'Événement') || 0) + 1));
            const title = `${g.p.place} : ${fmt(g.list.length)} ${g.list.length > 1 ? (unit.endsWith('s') ? unit : unit + 's') : unit}${ys.length ? ` (${Math.min(...ys)}${Math.max(...ys) !== Math.min(...ys) ? '–' + Math.max(...ys) : ''})` : ''}\n${[...kinds].map(([k, n]) => `${k} : ${fmt(n)}`).join(' · ')}${names.length ? '\n' + names.join('\n') + (g.list.length > names.length ? '\n…' : '') : ''}`;
            let dots = '';
            g.list.forEach((p, i) => { // les points d'un même lieu s'écartent en spirale (sinon : un seul rond, plus gros)
                const a = i * 2.39996, rr = o.spread === false ? 0 : R0 * 1.15 * Math.sqrt(i);
                dots += `<circle cx="${r1(x0 + Math.cos(a) * rr)}" cy="${r1(y0 + Math.sin(a) * rr)}" r="${r2(R0)}" fill="${col.of(p)}" fill-opacity="${r2(opa)}" stroke="#ffffff" stroke-width="${r2(Math.min(1, R0 / 3))}"/>`; drawn++; });
            svg += `<g class="c2-pt" data-c2-pids="${pidsAttr(g.list.map(p => p.pid))}" data-c2-n="${g.list.length}">${tip(title)}${dots}</g>`;
        });
        if (o.placeLabels !== 'none') { const placed = [], lf = clamp(fs * .8 * (num(o.labelSize) || 1), 6, 30);
            [...groups.values()].sort((a, b) => b.list.length - a.list.length).slice(0, o.placeLabels === 'all' ? 150 : 10).forEach(g => {
                const [x, y] = pr.p(g.p.lon, g.p.lat), rr = o.spread === false ? R0 : R0 * 1.15 * Math.sqrt(g.list.length) + R0, t = g.p.place, tw = textW(t, lf), bx = x + rr + 3;
                const box = [bx, y - lf * .6, bx + tw, y + lf * .6]; if (!Number.isFinite(x) || box[2] > w || placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return; placed.push(box);
                svg += T(bx, y, t, {size: lf, weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'}); }); }
        svg += F.close;
        let H = h; if (unknown.length && o.showMissing !== false) { svg += missingLine(unknown, H, fs); H += fs * 1.5; }
        if (!pts.length) svg += T(w / 2, h / 2, 'Ajoute des événements : un lieu, une date, une sorte (ou « Depuis l’app »).', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
        return {h: H, svg, legend: col.legend, geo: F.geo, desc: `Carte en points : ${fmt(drawn)} événements dans ${pl(groups.size, 'lieu', 'lieux')}.`};
    }

    /* ═════════ ⬢ Carte en hexagones ═════════ */
    function hexmap(spec, W, fs) {
        const o = spec.o || {}, B0 = placeBases(spec, W); if (B0.wait) return B0.wait;
        const {pts, unknown} = pointsOf(spec, B0.bases), F = mapFrame(spec, W, fs, pts.map(p => [p.lon, p.lat])); if (F.wait) return F.wait;
        const {pr, w, h} = F, size = clamp(num(o.hexSize) || 4, 1, 15), R = Math.max(3, w * size / 100 / Math.sqrt(3)), S3 = Math.sqrt(3);
        const cells = new Map();
        pts.forEach(p => {
            const [x, y] = pr.p(p.lon, p.lat); if (!Number.isFinite(x) || x < -R || x > w + R || y < -R || y > h + R) return;
            const qf = (S3 / 3 * x - y / 3) / R, rf = (2 / 3 * y) / R; let q = Math.round(qf), r = Math.round(rf), s = Math.round(-qf - rf);
            const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s + qf + rf); if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
            const k = q + ':' + r, c = cells.get(k) || {q, r, n: 0, pids: [], places: new Map(), ys: []}; c.n++; if (p.pid) c.pids.push(p.pid); c.places.set(p.place, (c.places.get(p.place) || 0) + 1); if (p.y !== null) c.ys.push(p.y); cells.set(k, c);
        });
        const list = [...cells.values()], max = Math.max(1, ...list.map(c => c.n)), stops = o.ramp === 'perso' ? [color(o.lowColor, '#fff3e6'), color(o.highColor, '#7f2704')] : GC.RAMPS[o.ramp] || GC.RAMPS.jaunerouge;
        const log = o.logScale !== false && max > 20, t = n => max <= 1 ? 1 : log ? Math.log(n) / Math.log(max) : (n - 1) / (max - 1), opa = clamp(num(o.opacity) || 85, 10, 100) / 100;
        const corner = (cx, cy, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${r1(cx + R * .97 * Math.cos(a))} ${r1(cy + R * .97 * Math.sin(a))}`; };
        const unit = String(o.unit || 'événement').slice(0, 30), units = n => n > 1 ? (unit.endsWith('s') ? unit : unit + 's') : unit;
        let svg = `<g data-c2-total="${pts.length}"></g>` + F.open;
        list.sort((a, b) => a.n - b.n).forEach(c => {
            const cx = R * S3 * (c.q + c.r / 2), cy = R * 1.5 * c.r, f = GC.rampAt(stops, .12 + .88 * t(c.n));
            const top = [...c.places].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, k]) => `${n} (${fmt(k)})`).join(', ');
            const yr = c.ys.length ? ` · ${Math.min(...c.ys)}${Math.max(...c.ys) > Math.min(...c.ys) ? '–' + Math.max(...c.ys) : ''}` : '';
            svg += `<path class="c2-hex" data-c2-pids="${pidsAttr(c.pids)}" data-c2-n="${c.n}" d="M${[0, 1, 2, 3, 4, 5].map(i => corner(cx, cy, i)).join('L')}Z" fill="${f}" fill-opacity="${r2(opa)}" stroke="${o.outline === false ? 'none' : '#ffffff'}" stroke-width=".8">${tip(`${fmt(c.n)} ${units(c.n)}${yr}\n${top}${c.places.size > 5 ? '…' : ''}`)}</path>`;
            if (o.values !== false && R > fs * .75) { const fz = Math.min(fs * .78, R * .62); if (textW(fmt(c.n), fz) < R * 1.5) svg += `<text x="${r1(cx)}" y="${r1(cy)}" font-size="${r2(fz)}" text-anchor="middle" dominant-baseline="middle" font-weight="600" fill="${contrast(f)}" pointer-events="none">${fmt(c.n)}</text>`; }
        });
        svg += F.close;
        let H = h;
        if (list.length && o.legend !== 'none') { // le dégradé, de 1 au maximum
            const vals = log ? [...new Set([1, Math.round(Math.sqrt(max)), max])] : [...new Set([1, Math.round(max / 2), max])], bw = Math.min(w * .6, 300), x0 = (w - bw) / 2, y0 = h + fs * .8, gid = F.uid + 'g';
            svg += `<defs><linearGradient id="${gid}" x1="0" x2="1">${[0, .25, .5, .75, 1].map(s => `<stop offset="${s * 100}%" stop-color="${GC.rampAt(stops, .12 + .88 * s)}"/>`).join('')}</linearGradient></defs><rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(bw)}" height="${r1(fs)}" rx="2" fill="url(#${gid})" stroke="#0002"/>`;
            vals.forEach(v => { const x = x0 + bw * t(v); svg += T(x, y0 + fs * 1.9, fmt(v), {size: fs * .8, anchor: 'middle'}); });
            svg += T(x0 - 6, y0 + fs / 2, `${unit.endsWith('s') ? unit : unit + 's'} par alvéole`, {size: fs * .8, anchor: 'end', fill: '#555'});
            H = y0 + fs * 2.6;
        }
        if (unknown.length && o.showMissing !== false) { svg += missingLine(unknown, H, fs); H += fs * 1.5; }
        if (!pts.length) svg += T(w / 2, h / 2, 'Ajoute des événements : un lieu et une date (ou « Depuis l’app »).', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
        return {h: H, svg, legend: [], geo: F.geo, desc: `Carte en hexagones : ${fmt(pts.length)} événements dans ${pl(list.length, 'alvéole')} ; la plus remplie en compte ${fmt(max)}.`};
    }

    /* ═════════ 🫧 Carte déformée (cartogramme de Dorling ou de Demers) ═════════ */
    function cartogram(spec, W, fs) {
        const o0 = spec.o || {}, o = GC.levelOf(o0)[0] === 'com' ? {...o0, level: ''} : o0, s2 = {...spec, o}, M = GC.MAPS[GC.mapOf(o)];
        if (o.frame === 'zone' && M.zoneBase) { const w0 = GC.needBases(s2, W, [M.zoneBase]); if (w0) return w0; }
        const view = GC.viewOf(o), baseId = GC.baseIdOf(o, view), ctxId = GC.ctxIdOf(o, baseId, view);
        const wait = GC.needBases(s2, W, [baseId, ctxId]); if (wait) return wait;
        const base = GC.loaded(baseId), ctx = ctxId ? GC.loaded(ctxId) : null, uid = 'c2c' + (++seq);
        const pr = GC.fitProj(o.proj && o.proj !== 'auto' ? o.proj : GC.autoProj(view), view, W, clamp(num(o.height) || 2400, 120, 3000), !num(o.height)), w = W, h = pr.h; pr.allOutre = true;
        const {byZone, missing} = GC.joinRows(s2, base), square = o.shape === 'square', gap = clamp(num(o.gap ?? 1.5), 0, 10);
        let items = [...byZone].filter(([z, e]) => e.has && e.v > 0 && (!z.outre || o.frame)).map(([z, e]) => { const [x, y] = pr.p(z.label[0], z.label[1]); return {z, v: e.v, notes: e.notes, x0: x, y0: y, x, y}; }).filter(it => Number.isFinite(it.x) && it.x > -w * .2 && it.x < w * 1.2 && it.y > -h * .2 && it.y < h * 1.2);
        const tot = items.reduce((a, it) => a + it.v, 0) || 1, fill = clamp(num(o.fill) || 20, 5, 80) / 100;
        let k = Math.sqrt(w * h * fill / (Math.PI * tot)); const maxR = Math.min(w, h) * .28; items.forEach(it => { it.r = k * Math.sqrt(it.v); });
        const big = Math.max(0, ...items.map(it => it.r)); if (big > maxR) { k *= maxR / big; items.forEach(it => { it.r = k * Math.sqrt(it.v); }); }
        // les formes se poussent pour ne pas se chevaucher, tout en restant près de leur zone
        const half = it => square ? it.r * Math.sqrt(Math.PI) / 2 : it.r, n = items.length;
        for (let iter = 0; iter < 220 && n > 1; iter++) {
            let moved = 0;
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
                const a = items[i], b = items[j]; let dx = b.x - a.x, dy = b.y - a.y; if (!dx && !dy) { dx = (j - i) * .01; dy = .01; }
                const wa = b.r * b.r / (a.r * a.r + b.r * b.r), wb = 1 - wa;
                if (square) { const ox = half(a) + half(b) + gap - Math.abs(dx), oy = half(a) + half(b) + gap - Math.abs(dy); if (ox <= 0 || oy <= 0) continue;
                    if (ox < oy) { const s = Math.sign(dx) * ox; a.x -= s * wa; b.x += s * wb; } else { const s = Math.sign(dy) * oy; a.y -= s * wa; b.y += s * wb; } moved++; }
                else { const d = Math.hypot(dx, dy), ov = a.r + b.r + gap - d; if (ov <= 0) continue; const ux = dx / d, uy = dy / d; a.x -= ux * ov * wa; a.y -= uy * ov * wa; b.x += ux * ov * wb; b.y += uy * ov * wb; moved++; }
            }
            items.forEach(it => { it.x += (it.x0 - it.x) * .04; it.y += (it.y0 - it.y) * .04; });
            if (!moved && iter > 10) break;
        }
        // tout tient dans le cadre (les formes poussées vers l'extérieur sont ramenées)
        if (n) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; items.forEach(it => { const r = half(it); x0 = Math.min(x0, it.x - r); x1 = Math.max(x1, it.x + r); y0 = Math.min(y0, it.y - r); y1 = Math.max(y1, it.y + r); });
            const pad = 4, s = Math.min(1, (w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0));
            if (s < 1 || x0 < pad || y0 < pad || x1 > w - pad || y1 > h - pad) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; items.forEach(it => { it.x = w / 2 + (it.x - cx) * s; it.y = h / 2 + (it.y - cy) * s; it.r *= s; }); } }
        const vals = items.map(it => it.v), sc = vals.length && o.colorBy !== 'one' ? GC.scaleOf(vals, {ramp: o.ramp || 'oranges', colorMode: o.colorMode || '', classes: o.classes, method: o.method, logScale: o.logScale, lowColor: o.lowColor, highColor: o.highColor}) : null;
        const one = color(o.shapeColor, '#e15759'), unit = String(o.unit || '').slice(0, 30), series = String(spec.series?.[0]?.name || '').slice(0, 60);
        const ghost = o.ghost !== false, land = color(o.ghostColor, '#ecebe6');
        const Bd = GC.drawBase({...s2, o: {...o, sea: ghost ? o.sea : false, borderColor: '#ffffff', borderWidth: .6}}, base, ghost ? ctx : null, pr, w, h, () => ({fill: ghost ? land : '#ffffff00', title: ''}), uid);
        let svg = `<g data-geo-map="${uid}">${Bd.svg}<g clip-path="url(#${uid}c)">`;
        if (o.links !== false) items.forEach(it => { if (Math.hypot(it.x - it.x0, it.y - it.y0) > half(it) + 2) svg += `<line x1="${r1(it.x0)}" y1="${r1(it.y0)}" x2="${r1(it.x)}" y2="${r1(it.y)}" stroke="#6b7280" stroke-opacity=".45" stroke-width=".7" pointer-events="none"/>`; });
        const lf0 = fs * clamp(num(o.labelSize) || 1, .5, 2.5);
        items.sort((a, b) => b.r - a.r).forEach(it => {
            const f = sc ? sc.color(it.v) : one, r = half(it), name = it.z.name, code = it.z.id && !/^x-/.test(it.z.id) ? it.z.id : '';
            const t = `${name}${code && fold(code) !== fold(name) ? ` (${code})` : ''} : ${fmt(it.v, 1)}${unit ? ' ' + unit : ''}${series ? ' — ' + series : ''}${it.notes.length ? '\n' + it.notes.join('\n') : ''}`;
            svg += square ? `<rect class="c2-cg" x="${r1(it.x - r)}" y="${r1(it.y - r)}" width="${r1(r * 2)}" height="${r1(r * 2)}" rx="${r1(Math.min(3, r * .15))}" fill="${f}" stroke="#ffffff" stroke-width="1">${tip(t)}</rect>`
                : `<circle class="c2-cg" cx="${r1(it.x)}" cy="${r1(it.y)}" r="${r1(r)}" fill="${f}" stroke="#ffffff" stroke-width="1">${tip(t)}</circle>`;
            if (o.labels === 'none') return;
            const fz = Math.min(lf0 * .85, r * .55); if (fz < 6) return;
            const lines = [], room = r * 1.7;
            const nm = o.labels === 'value' ? '' : textW(name, fz) <= room ? name : code && textW(code, fz) <= room ? code : ''; if (nm) lines.push(nm);
            if (o.labels !== 'name' && r > fz * 1.6) lines.push(fmt(it.v, 1));
            const fc = contrast(f); lines.forEach((s, i) => { svg += T(it.x, it.y + (i - (lines.length - 1) / 2) * fz * 1.12, s, {size: i ? fz * .9 : fz, anchor: 'middle', weight: i ? 400 : 600, fill: fc}); });
        });
        svg += `</g><text x="${r1(w - 4)}" y="${r1(h - 4)}" font-size="${r2(clamp(fs * .62, 7, 12))}" text-anchor="end" fill="#555" fill-opacity=".85">${esc(GC.attrOf(base, ctx))}</text><rect data-geo-hit="1" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="#c8cdd3" stroke-width=".6"/></g>`;
        let H = h;
        if (o.legend !== 'none' && items.length) { // trois tailles de référence
            const vmax = Math.max(...vals), kf = items[0].r / Math.sqrt(items[0].v), nice = v => { const m = 10 ** Math.floor(Math.log10(v || 1)); return [1, 2, 5, 10].map(q => q * m).filter(x => x <= v).pop() || v; };
            const refs = [...new Set([nice(vmax / 3), nice(vmax / 12), nice(vmax / 40)])].filter(v => v > 0).slice(0, 3), hs = v => (square ? Math.sqrt(Math.PI) / 2 : 1) * kf * Math.sqrt(v);
            const R0 = hs(refs[0]), by = h + fs * .8 + R0 * 2, cx = R0 + 4; let x = cx + R0 + fs;
            refs.forEach(v => { const r = hs(v), t = `${fmt(v, 1)}${unit ? ' ' + (v < 2 ? unit.replace(/(\S)s\b/g, '$1') : unit) : ''}`, top = by - r * 2; // formes emboîtées, posées en bas
                svg += square ? `<rect x="${r1(cx - r)}" y="${r1(top)}" width="${r1(r * 2)}" height="${r1(r * 2)}" fill="none" stroke="#55606e"/>` : `<circle cx="${r1(cx)}" cy="${r1(by - r)}" r="${r1(r)}" fill="none" stroke="#55606e"/>`;
                svg += `<line x1="${r1(cx)}" x2="${r1(cx + R0 + 8)}" y1="${r1(top)}" y2="${r1(top)}" stroke="#55606e" stroke-dasharray="2 2" stroke-width=".8"/>` + T(cx + R0 + 11, top, t, {size: fs * .78}); });
            x = cx + R0 + 14 + Math.max(...refs.map(v => textW(`${fmt(v, 1)}${unit ? ' ' + unit : ''}`, fs * .78))) + fs;
            if (sc && !sc.classes) svg += T(x, by - R0, `${series || 'Couleur'} : de ${fmt(sc.lo, 1)} (clair) à ${fmt(sc.hi, 1)} (foncé)`, {size: fs * .8, fill: '#555'});
            H = by + fs * .6;
        }
        if (missing.length && o.showMissing !== false) { svg += T(0, H + fs * .7, `⚠ Pas trouvé sur ce fond : ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`, {size: fs * .78, fill: '#a5552a'}); H += fs * 1.6; }
        if (!items.length) svg += T(w / 2, h / 2, 'Ajoute des zones et leurs chiffres (onglet Données ou « Depuis l’app »).', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
        return {h: H, svg, legend: [], geo: {uid, pr, w, h}, desc: `Carte déformée : ${pl(items.length, 'zone')} grossies selon leur chiffre (${square ? 'carrés' : 'ronds'}).`};
    }

    /* ═════════ 📖 Carte qui raconte ═════════ */
    const STORY = new Map(); // jeton → {spec, W} : pour redessiner une autre étape dans la page
    function stepsOf(spec, bases) {
        return rows(spec, 400).map((r, i) => {
            const place = str(r.place, 120), p = place ? GC.placeOf(spec, place, bases) : null;
            return {i, date: str(r.date, 60), y: yearOf(r.date), label: str(r.label, 120), place, note: str(r.note, 200), p, color: color(r.color, '')};
        }).filter(s => s.label || s.place || s.date);
    }
    function storymap(spec, W, fs) {
        const o = spec.o || {}, B0 = placeBases(spec, W); if (B0.wait) return B0.wait;
        const steps = stepsOf(spec, B0.bases), n = steps.length, cur = clamp(Math.round(num(o.step ?? -1)), -1, n - 1), all = cur < 0;
        const located = steps.filter(s => s.p), upto = all ? located : located.filter(s => s.i <= steps[cur].i);
        let view = null;
        if (!all && o.follow !== 'all' && !o.frame) { // la carte suit : l'étape et celle d'avant
            const near = upto.slice(-2).map(s => ({p: [s.p[0], s.p[1]]}));
            if (near.length) { const v = GC.fitView(near, o), span = clamp(num(o.zoom) || 3, .5, 60); const cx = (v[0] + v[2]) / 2, cy = (v[1] + v[3]) / 2, hw = Math.max((v[2] - v[0]) / 2, span), hh = Math.max((v[3] - v[1]) / 2, span * .62); view = [clamp(cx - hw, -180, 180), clamp(cy - hh, -85, 85), clamp(cx + hw, -180, 180), clamp(cy + hh, -85, 85)]; }
        }
        const F = mapFrame(spec, W, fs, located.map(s => [s.p[0], s.p[1]]), {view, hMax: num(o.height) || Math.max(220, W * .62)}); if (F.wait) return F.wait;
        const {pr, w, h} = F, lc = color(o.lineColor, '#c0392b'), tok = 't' + (++seq);
        STORY.set(tok, {spec: JSON.parse(JSON.stringify(spec)), W}); if (STORY.size > 80) STORY.delete(STORY.keys().next().value);
        const xy = s => pr.p(s.p[0], s.p[1]), rr = clamp(fs * .72 * (num(o.dotSize) || 1), 4, 22);
        let svg = `<g data-c2-story="${tok}" data-c2-n="${n}" data-c2-cur="${cur}">` + F.open;
        // le chemin : déjà parcouru (plein), à venir (pointillés, si on le montre)
        const seg = (a, b, done) => { const [x1, y1] = xy(a), [x2, y2] = xy(b), dx = x2 - x1, dy = y2 - y1; if (Math.hypot(dx, dy) < 1) return '';
            const cx = (x1 + x2) / 2 - dy * .18, cy = (y1 + y2) / 2 + dx * .18;
            return `<path d="M${r1(x1)} ${r1(y1)}Q${r1(cx)} ${r1(cy)} ${r1(x2)} ${r1(y2)}" fill="none" stroke="${done ? lc : '#7d8590'}" stroke-width="${done ? 2.6 : 1.4}" stroke-opacity="${done ? .85 : .55}" ${done ? '' : 'stroke-dasharray="4 4"'} stroke-linecap="round"/>`; };
        for (let k = 1; k < located.length; k++) { const done = all || located[k].i <= steps[cur].i; if (done || o.future !== false) svg += seg(located[k - 1], located[k], done); }
        // les étapes : un rond numéroté (une seule fois par lieu : les numéros s'y suivent)
        const byPlace = new Map(); located.forEach(s => { const k = fold(s.place) + '|' + r2(s.p[0]) + '|' + r2(s.p[1]); (byPlace.get(k) || byPlace.set(k, []).get(k)).push(s); });
        byPlace.forEach(list => {
            const done = list.filter(s => all || s.i <= steps[cur].i); if (!done.length && o.future === false) return;
            const [x, y] = xy(list[0]), isCur = !all && list.some(s => s.i === steps[cur].i), c = list[0].color || lc;
            const label = list.map(s => `${s.i + 1}`).join(', '), t = list.map(s => `${s.i + 1}. ${[s.date, s.label].filter(Boolean).join(' — ')}`).join('\n');
            if (isCur) svg += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rr * 1.9)}" fill="${c}" fill-opacity=".18" stroke="${c}" stroke-width="1.4"/>`;
            svg += `<g class="c2-st" data-c2-step="${list[list.length - 1].i}">${tip(`${list[0].place}\n${t}`)}<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rr)}" fill="${done.length ? c : '#ffffff'}" stroke="${done.length ? '#ffffff' : '#7d8590'}" stroke-width="1.5"/>`
                + T(x, y + .5, cut(label, rr * 3.4, rr * .95), {size: rr * (label.length > 2 ? .78 : .95), anchor: 'middle', weight: 700, fill: done.length ? contrast(c) : '#555'}) + '</g>';
        });
        // le nom des lieux (les plus importants), et la bulle de l'étape en cours
        if (o.placeLabels !== 'none') { const placed = [], lf = clamp(fs * .78, 6, 18);
            [...byPlace.values()].forEach(list => { const [x, y] = xy(list[0]), tw = textW(list[0].place, lf), bx = x + rr + 4, box = [bx, y - lf * .6, bx + tw, y + lf * .6];
                if (all ? false : list.some(s => s.i === steps[cur].i)) return; if (box[2] > w || placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return; placed.push(box);
                svg += T(bx, y, list[0].place, {size: lf, weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'}); }); }
        if (!all && steps[cur].p) {
            const s = steps[cur], [x, y] = xy(s), lines = [[s.date, s.label].filter(Boolean).join(' · '), s.place, s.note].filter(Boolean).map(t => cut(t, Math.min(w * .6, 320), fs * .9)), bw = Math.max(...lines.map(t => textW(t, fs * .9))) + fs * 1.2, bh = lines.length * fs * 1.25 + fs * .7;
            let bx = x + rr * 2 + 6, by = y - bh / 2; if (bx + bw > w - 4) bx = x - rr * 2 - 6 - bw; bx = clamp(bx, 4, w - bw - 4); by = clamp(by, 4, h - bh - 4);
            svg += `<g pointer-events="none"><rect x="${r1(bx)}" y="${r1(by)}" width="${r1(bw)}" height="${r1(bh)}" rx="6" fill="#ffffff" fill-opacity=".94" stroke="${lc}" stroke-width="1.2"/>${lines.map((t, i) => T(bx + fs * .6, by + fs * .95 + i * fs * 1.25, t, {size: fs * .9, weight: i ? 400 : 700, fill: '#1d1d1f'})).join('')}</g>`;
        }
        svg += F.close;
        // la frise : une marque par étape, l'étape en cours en grand, les années en dessous
        const fy = h + fs * 1.4, dated = steps.filter(s => s.y !== null), y0 = dated.length ? Math.min(...dated.map(s => s.y)) : 0, y1 = dated.length ? Math.max(...dated.map(s => s.y)) : 1;
        const xs = steps.map((s, k) => s.y !== null && y1 > y0 ? 10 + (w - 20) * (s.y - y0) / (y1 - y0) : 10 + (w - 20) * (n > 1 ? k / (n - 1) : .5));
        for (let k = 1; k < n; k++) if (xs[k] < xs[k - 1]) xs[k] = xs[k - 1]; // sans date : à la suite
        svg += `<line x1="10" x2="${r1(w - 10)}" y1="${r1(fy)}" y2="${r1(fy)}" stroke="#9aa3ad" stroke-width="2" stroke-linecap="round"/>`;
        if (!all && n) svg += `<line x1="10" x2="${r1(xs[cur])}" y1="${r1(fy)}" y2="${r1(fy)}" stroke="${lc}" stroke-width="3" stroke-linecap="round"/>`;
        if (dated.length) { const tk = DR.ticks(y0, Math.max(y1, y0 + 1), Math.max(2, Math.floor(w / 90))).ticks.filter(v => v >= y0 && v <= y1); tk.forEach(v => { const x = 10 + (w - 20) * (v - y0) / Math.max(1, y1 - y0); svg += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${r1(fy + 4)}" y2="${r1(fy + 8)}" stroke="#9aa3ad"/>` + T(x, fy + fs * 1.3, String(v), {size: fs * .75, anchor: 'middle', fill: '#666'}); }); }
        steps.forEach((s, k) => { const on = !all && k === cur, done = all || k <= cur;
            svg += `<g class="c2-st" data-c2-step="${k}">${tip(`${k + 1}. ${[s.date, s.label, s.place].filter(Boolean).join(' — ')}`)}<rect x="${r1(xs[k] - 7)}" y="${r1(fy - 9)}" width="14" height="18" fill="#fff" fill-opacity="0"/><circle cx="${r1(xs[k])}" cy="${r1(fy)}" r="${on ? 6.5 : 4}" fill="${done ? (s.color || lc) : '#ffffff'}" stroke="${on ? '#1d1d1f' : done ? '#ffffff' : '#7d8590'}" stroke-width="${on ? 2 : 1.2}"/></g>`; });
        const capY = fy + fs * 2.6, curS = all ? null : steps[cur];
        const caption = curS ? `Étape ${cur + 1} sur ${n} : ${[curS.date, curS.label, curS.place].filter(Boolean).join(' · ')}` : n ? `${pl(n, 'étape')}${dated.length ? ` de ${y0} à ${y1}` : ''} — ${pl(located.length, 'étape placée', 'étapes placées')} sur la carte` : '';
        if (caption) svg += T(w / 2, capY, cut(caption, w - 8, fs * .95), {size: fs * .95, anchor: 'middle', weight: 600});
        let H = capY + fs;
        const unknown = steps.filter(s => s.place && !s.p).map(s => s.place);
        if (unknown.length && o.showMissing !== false) { svg += missingLine([...new Set(unknown)], H, fs); H += fs * 1.5; }
        svg += '</g>';
        if (!n) return {h: h + fs * 2, svg: svg + T(w / 2, h / 2, 'Ajoute les étapes d’une vie : une date, ce qui s’est passé, un lieu.', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'}), legend: [], geo: F.geo, desc: 'Carte qui raconte : aucune étape.'};
        return {h: H, svg, legend: [], geo: F.geo, desc: `Carte qui raconte : ${pl(n, 'étape')}${curS ? `, étape ${cur + 1} : ${[curS.date, curS.label, curS.place].filter(Boolean).join(', ')}` : ''}.`};
    }

    /* ═════════ 🧱 Descendance en rectangles (icicle) ═════════ */
    function icicle(spec, W, fs) {
        const o = spec.o || {}, G = ext.diagramGenea; if (!G?.hierarchy) return empty(W, fs, 'Diagrammes Généalogie indisponibles.');
        const list = rows(spec, 6000), {roots, count} = G.hierarchy({rows: list}, 6000);
        if (!roots.length) return empty(W, fs, 'Ajoute des lignes : un nom, le nom du parent (vide pour l’ancêtre) et un chiffre si tu veux.');
        const sizeBy = o.sizeBy || 'desc', maxD = clamp(Math.round(num(o.depth)) || 8, 1, 20);
        const size = n => { const st = [[n, 0]], order = []; while (st.length) { const [x, d] = st.pop(); order.push(x); if (d < 60) x.kids.forEach(k => st.push([k, d + 1])); }
            for (let i = order.length - 1; i >= 0; i--) { const x = order[i], sum = x.kids.reduce((a, k) => a + (k.size || 0), 0); x.size = sizeBy === 'desc' ? 1 + sum : sizeBy === 'leaves' ? (x.kids.length ? sum : 1) : Math.max(Math.max(0, x.v) || (x.kids.length ? 0 : 1), sum); } };
        roots.forEach(size);
        let depth = 0; const deepest = (n, d) => { if (d > depth) depth = d; if (d < maxD - 1) n.kids.forEach(k => deepest(k, d + 1)); }; roots.forEach(r => deepest(r, 0)); depth = Math.min(depth + 1, maxD);
        const down = o.dir !== 'right', total = roots.reduce((a, r) => a + r.size, 0) || 1;
        const band = down ? clamp(num(o.band) || fs * 2.6, fs * 1.2, 120) : (W - 2) / depth;
        const H = down ? band * depth : clamp(num(o.height) || Math.max(260, Math.round(W * .7)), 160, 3000), len = down ? W : H;
        const by = o.colorBy || '', stroke = o.border === false ? 'none' : '#ffffff';
        let svg = '', drawn = 0; const legend = [];
        const fillOf = (node, d, base) => { const r = list[node.i] || {}; if (color(r.color, '')) return color(r.color, '');
            if (by === 'gender') return GENDER[r.gender] || GENDER.unknown; if (by === 'gen') return pick(spec, d); return mix(base, '#ffffff', Math.min(.55, Math.max(0, d - 1) * .12)); };
        const draw = (node, d, a0, a1, base) => {
            if (drawn > 5000 || a1 - a0 < .4 || d >= depth) return;
            const r = list[node.i] || {}, f = fillOf(node, d, base), pid = Number(r.pid) > 0 ? Number(r.pid) : 0;
            const [x, y, w, h] = down ? [a0, d * band, a1 - a0, band] : [d * band, a0, band, a1 - a0];
            const yr = str(r.year, 12), desc = node.size - 1, t = `${node.name}${yr && !node.name.includes(yr) ? ` (${yr})` : ''}\n${sizeBy === 'desc' ? `${pl(desc, 'descendant')} · ${fmt(100 * node.size / total, 1)} % de la descendance` : `${fmt(node.size, 1)} · ${fmt(100 * node.size / total, 1)} %`}${pid ? '\nClic : ouvrir la fiche' : ''}`;
            svg += `<g class="c2-ic"${pid ? ` data-c2-pid="${pid}"` : ''}>${tip(t)}<rect x="${r2(x + .5)}" y="${r2(y + .5)}" width="${r2(Math.max(.5, w - 1))}" height="${r2(Math.max(.5, h - 1))}" rx="${w > 8 && h > 8 ? 3 : 0}" fill="${f}" stroke="${stroke}" stroke-width=".8"/>`;
            if (o.labels !== 'none') {
                const fz = Math.min(fs * .9, (down ? h : Math.min(h, band)) * .42), lines = [node.name, o.labels === 'size' ? `${fmt(node.size)}` : yr && !node.name.includes(yr) ? yr : ''].filter(Boolean), fc = contrast(f);
                if (down && w >= fz * 3 && fz >= 5) { const l0 = cut(lines[0], w - 6, fz); if (l0) { svg += T(x + w / 2, y + h / 2 - (lines[1] && h > fz * 2.6 ? fz * .55 : 0), l0, {size: fz, anchor: 'middle', weight: 600, fill: fc}); if (lines[1] && h > fz * 2.6) svg += T(x + w / 2, y + h / 2 + fz * .7, cut(lines[1], w - 6, fz * .85), {size: fz * .85, anchor: 'middle', fill: fc}); } }
                else if (down && w < fz * 3 && w >= fz * 1.1 && h >= fz * 4) { const l0 = cut(lines[0], h - 6, fz * .9); if (l0) svg += T(x + w / 2, y + h / 2, l0, {size: Math.min(fz * .9, w * .8), anchor: 'middle', weight: 600, fill: fc, rotate: -90}); }
                else if (!down && h >= fz * 1.1 && fz >= 5) { const l = cut(lines.join(' · '), w - 8, fz); if (l) svg += T(x + 5, y + h / 2, l, {size: fz, weight: 600, fill: fc}); }
            }
            svg += '</g>'; drawn++;
            const tot = node.kids.reduce((a, k) => a + k.size, 0) || 1, inner = sizeBy === 'value' ? Math.min(1, tot / (node.size || tot)) : 1;
            let a = a0; const kids = o.sort === 'size' ? [...node.kids].sort((p, q) => q.size - p.size) : node.kids;
            kids.forEach((k, i) => { const span = (a1 - a0) * inner * k.size / tot; draw(k, d + 1, a, a + span, d === 0 && roots.length === 1 && by === '' ? pick(spec, i) : base); if (d === 0 && roots.length === 1 && i < 14 && by === '') legend.push({label: k.name, color: pick(spec, i)}); a += span; });
        };
        let a = 0; roots.forEach((r, i) => { const span = len * r.size / total; draw(r, 0, a, a + span, roots.length === 1 ? '#8a94a3' : pick(spec, i)); a += span; });
        if (by === 'gender') legend.push(...[['Homme', 'male'], ['Femme', 'female'], ['Inconnu', 'unknown']].map(([l, g]) => ({label: l, color: GENDER[g]})));
        if (by === 'gen') for (let d = 0; d < Math.min(depth, 12); d++) legend.push({label: `Génération ${d + 1}`, color: pick(spec, d)});
        return {h: H, svg, legend, desc: `Descendance en rectangles : ${pl(count, 'personne')} sur ${pl(depth, 'génération')}.`};
    }

    /* ═════════ 🎀 Prénoms transmis (parrain, marraine → filleul) ═════════ */
    const REL_COL = {'grand-père': '#b07aa1', 'grand-mère': '#b07aa1', 'arrière-grand-père': '#9c755f', 'arrière-grand-mère': '#9c755f', oncle: '#f28e2b', tante: '#f28e2b', 'frère': '#59a14f', 'sœur': '#59a14f', 'père': '#4e79a7', 'mère': '#4e79a7'};
    const relGroup = r => /grand/.test(r) ? (/arri/.test(r) ? 'Arrière-grand-parent' : 'Grand-parent') : /oncle|tante/.test(r) ? 'Oncle ou tante' : /frère|sœur|soeur/.test(r) ? 'Frère ou sœur' : /père|mère/.test(r) ? 'Père ou mère' : 'Autre lien (ou inconnu)';
    const REL_GCOL = {'Grand-parent': '#b07aa1', 'Arrière-grand-parent': '#9c755f', 'Oncle ou tante': '#f28e2b', 'Frère ou sœur': '#59a14f', 'Père ou mère': '#4e79a7', 'Autre lien (ou inconnu)': '#8a94a3'};
    /** « Jean-Baptiste Marie MARTIN » → prénoms ['jean-baptiste', 'marie'] (le nom : les mots en capitales, sinon le dernier) */
    function givenOf(name) {
        const words = String(name ?? '').trim().split(/\s+/).filter(Boolean); if (!words.length) return {given: [], show: ''};
        let k = words.findIndex((w, i) => i > 0 && w.length > 1 && w === w.toUpperCase() && /[A-ZÀ-Ý]/.test(w)); if (k < 0) k = words.length > 1 ? words.length - 1 : words.length;
        const g = words.slice(0, k); return {given: g.map(w => fold(w).replace(/ /g, '-')), show: g[0] || ''};
    }
    const sameName = (a, b) => { if (!a || !b) return false; if (a === b) return true; const [s, l] = a.length < b.length ? [a, b] : [b, a]; return s.length >= 3 && l.startsWith(s) && l.length - s.length <= 3; }; // Jean / Jeanne, Louis / Louise, Pierre / Pierrette
    function transmissions(spec) {
        return rows(spec, 4000).map(r => {
            const gp = str(r.godparent, 120), gc = str(r.godchild, 120); if (!gp || !gc) return null;
            const a = givenOf(gp), b = givenOf(gc), first = a.given[0] || '';
            const how = first && sameName(first, b.given[0]) ? 'premier' : first && b.given.slice(1).some(x => sameName(first, x)) ? 'autre' : 'non';
            const gcY = yearOf(r.gcYear), gpY0 = yearOf(r.gpYear);
            return {gp, gc, role: /marr/i.test(r.role) ? 'marraine' : 'parrain', rel: str(r.rel, 40).toLowerCase(), how, first: a.show, gcY, gpY: gpY0 ?? (gcY !== null ? gcY - 25 : null), gpGuess: gpY0 === null, gpPid: Number(r.gpPid) || 0, gcPid: Number(r.gcPid) || 0, gpG: r.gpGender || (/marr/i.test(r.role) ? 'female' : 'male'), gcG: r.gcGender || ''};
        }).filter(Boolean);
    }
    function godnames(spec, W, fs) {
        const o = spec.o || {}, all = transmissions(spec);
        if (!all.length) return empty(W, fs, 'Ajoute des lignes : le parrain ou la marraine, le filleul, et leurs années de naissance.');
        const kept = all.filter(t => t.how !== 'non'), byRole = r => { const l = all.filter(t => t.role === r); return [l.filter(t => t.how !== 'non').length, l.length]; };
        const groups = new Map(); kept.forEach(t => { const k = fold(t.first); const g = groups.get(k) || {name: t.first, list: []}; g.list.push(t); groups.set(k, g); });
        let lines = [...groups.values()].sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name, 'fr'));
        const maxRows = clamp(Math.round(num(o.maxRows)) || 15, 1, 80); lines = lines.slice(0, maxRows);
        const other = o.show === 'all' ? all.filter(t => t.how === 'non') : [];
        if (other.length) lines.push({name: 'Autre prénom', list: other.slice(0, 300), other: true});
        if (!lines.length) return empty(W, fs, `Aucun filleul ne porte le prénom de son parrain ou de sa marraine (${pl(all.length, 'filleul')}).`);
        const ys = lines.flatMap(g => g.list.flatMap(t => [t.gcY, t.gpY])).filter(y => y !== null), y0 = ys.length ? Math.min(...ys) : 1800, y1 = ys.length ? Math.max(...ys, y0 + 10) : 1900;
        const labW = Math.min(W * .28, fs * 9), x0 = labW + fs * 2.5, x1 = W - fs * 2.5, X = y => y === null ? x0 : x0 + (x1 - x0) * (y - y0) / Math.max(1, y1 - y0);
        const rowH = clamp(num(o.rowHeight) || fs * 4.2, fs * 2.4, 120), head = fs * 3.4, nr = r => clamp(fs * .42 * (num(o.dotSize) || 1), 2.5, 12);
        const [pk, pn] = byRole('parrain'), [mk, mn] = byRole('marraine'), share = all.length ? Math.round(100 * kept.length / all.length) : 0;
        let svg = T(0, fs * .8, `${fmt(kept.length)} filleul${kept.length > 1 ? 's' : ''} sur ${fmt(all.length)} (${share} %) portent le prénom de leur parrain ou marraine`, {size: fs * .95, weight: 700})
            + T(0, fs * 2, `parrains : ${fmt(pk)} sur ${fmt(pn)} · marraines : ${fmt(mk)} sur ${fmt(mn)}`, {size: fs * .8, fill: '#666'});
        const legendUsed = new Set();
        lines.forEach((g, li) => {
            const cy = head + li * rowH + rowH * .62, base = cy;
            svg += `<line x1="${r1(x0)}" x2="${r1(x1)}" y1="${r1(base)}" y2="${r1(base)}" stroke="currentColor" stroke-opacity=".12"/>`;
            svg += T(labW, base, cut(g.name, labW - 4, fs), {size: fs, anchor: 'end', weight: 700, fill: g.other ? '#888' : 'currentColor'}) + T(labW, base + fs * 1.05, g.other ? `${fmt(g.list.length)} fois` : `${g.list.length} fois`, {size: fs * .72, anchor: 'end', fill: '#888'});
            const nodes = new Map(), node = (name, y, pid, gender, guess) => { const k = pid ? 'p' + pid : 'n' + fold(name) + '|' + y; if (!nodes.has(k)) nodes.set(k, {name, y, pid, gender, guess}); return nodes.get(k); };
            g.list.forEach(t => {
                const a = node(t.gp, t.gpY, t.gpPid, t.gpG, t.gpGuess), b = node(t.gc, t.gcY, t.gcPid, t.gcG, false), xa = X(a.y), xb = X(b.y), grp = relGroup(t.rel), c = REL_GCOL[grp];
                legendUsed.add(grp);
                const lift = clamp(Math.abs(xb - xa) * .35, rowH * .18, rowH * .55), mx = (xa + xb) / 2, my = base - lift, op = g.other ? .35 : .8;
                const ang = Math.atan2(base - my, xb - mx), hs = Math.max(4, fs * .4), ex = xb - Math.cos(ang) * nr(), ey = base - Math.sin(ang) * nr();
                svg += `<g class="c2-gn">${tip(`${t.gp} (${t.role}${t.rel ? ', ' + t.rel : ''}${a.y !== null ? `, né${t.role === 'marraine' ? 'e' : ''} ${t.gpGuess ? 'vers ' : 'en '}${a.y}` : ''}) → ${t.gc}${b.y !== null ? `, né${t.gcG === 'female' ? 'e' : ''} en ${b.y}` : ''}${t.how === 'premier' ? ' : même premier prénom' : t.how === 'autre' ? ' : un autre de ses prénoms' : ' : prénom différent'}`)}<path d="M${r1(xa)} ${r1(base)}Q${r1(mx)} ${r1(my)} ${r1(ex)} ${r1(ey)}" fill="none" stroke="${c}" stroke-opacity="${op}" stroke-width="${t.how === 'premier' ? 2.2 : 1.4}"${t.how === 'autre' ? ' stroke-dasharray="4 3"' : ''}/>`
                    + `<path d="M${r1(ex)} ${r1(ey)}l${r1(-Math.cos(ang - .45) * hs)} ${r1(-Math.sin(ang - .45) * hs)}l${r1(Math.cos(ang - .45) * hs - Math.cos(ang + .45) * hs)} ${r1(Math.sin(ang - .45) * hs - Math.sin(ang + .45) * hs)}Z" fill="${c}" fill-opacity="${op}"/></g>`;
            });
            const few = nodes.size <= Math.max(4, (x1 - x0) / (fs * 6)), placed = [];
            [...nodes.values()].sort((p, q) => (p.y ?? 0) - (q.y ?? 0)).forEach(nd => {
                const x = X(nd.y), r = nr(), f = GENDER[nd.gender] || GENDER.unknown;
                svg += `<g class="c2-gnn"${nd.pid ? ` data-c2-pid="${nd.pid}"` : ''}>${tip(`${nd.name}${nd.y !== null ? (nd.guess ? ` (vers ${nd.y})` : ` (${nd.y})`) : ''}${nd.pid ? '\nClic : ouvrir la fiche' : ''}`)}<circle cx="${r1(x)}" cy="${r1(base)}" r="${r1(r)}" fill="${f}" stroke="#ffffff" stroke-width="1.2"${nd.guess ? ' stroke-dasharray="2 1.5"' : ''}/></g>`;
                const nm = o.names || ''; if (nm === 'off' || !(few || nm === 'all')) return;
                const last = nd.name.split(/\s+/).slice(1).join(' ') || nd.name, t = `${cut(last, fs * 7, fs * .7)}${nd.y !== null ? ' ' + nd.y : ''}`, tw = textW(t, fs * .7), lx = clamp(x, x0 - fs * 2 + tw / 2, W - tw / 2 - 1), box = [lx - tw / 2, lx + tw / 2];
                if (placed.some(b => !(box[1] < b[0] - 2 || box[0] > b[1] + 2))) return; placed.push(box);
                svg += T(lx, base + r + fs * .75, t, {size: fs * .7, anchor: 'middle', fill: '#555'});
            });
        });
        const axisY = head + lines.length * rowH + fs * .4, tk = DR.ticks(y0, y1, Math.max(2, Math.floor((x1 - x0) / 80))).ticks.filter(v => v >= y0 && v <= y1);
        svg += `<line x1="${r1(x0)}" x2="${r1(x1)}" y1="${r1(axisY)}" y2="${r1(axisY)}" stroke="currentColor" stroke-opacity=".35"/>` + tk.map(v => T(X(v), axisY + fs * .9, String(v), {size: fs * .75, anchor: 'middle', fill: '#666'})).join('');
        const legend = [...Object.keys(REL_GCOL).filter(k => legendUsed.has(k)).map(k => ({label: k, color: REL_GCOL[k], type: 'line', width: 3})), {label: 'Trait plein : même premier prénom', color: '#555', type: 'line', width: 2}, {label: 'Pointillés : un autre de ses prénoms', color: '#555', type: 'dash', width: 2}];
        return {h: axisY + fs * 1.6, svg, legend, desc: `Prénoms transmis : ${fmt(kept.length)} filleuls sur ${fmt(all.length)} portent le prénom de leur parrain ou marraine ; le plus transmis : ${lines[0].name}.`};
    }

    /* ═════════ 🎗 Causes de décès en anneaux ═════════ */
    // les grandes familles, devinées d'après les mots (anciens et nouveaux) de la cause écrite dans l'acte
    const FAMILIES = [
        ['Guerre et violence', '#5f6b7a', /guerre|ennemi|mort pour la france|\bmpf\b|combat|bataille|fusill|deport|assassin|meurtre|homicide|tue a|tue par|bombard|blessures? de guerre|front\b|camp de/],
        ['Accidents', '#9c755f', /accident|noy|chute|tomb|brul|ecras|foudr|incendie|asphyx|route|train|cheval|explosion|electrocut|gel\b|froid|insolation|empoisonn|intoxic/],
        ['Suicide', '#3d4451', /suicid|pendu|pendaison/],
        ['Naissance et petite enfance', '#ff9da7', /couche|accouch|mort[- ]?ne|en naissant|congenital|premature|naissance|debilite|dentition|nourrisson|sevrage|faiblesse de naissance|athrepsie|muguet/],
        ['Maladies infectieuses', '#e15759', /tuberc|phtisi|poitrinaire|cholera|typho|typhus|variole|petite verole|rougeole|diphter|croup|coqueluche|scarlatine|grippe|influenza|fievre|dysent|peste|syphilis|meningit|tetanos|infecti|septic|gangren|paludisme|malaria|rage\b|polio|covid|erysipele|charbon|epidemi|contagi/],
        ['Poumons et respiration', '#76b7b2', /pneumon|fluxion|pleur|bronch|asthme|catarrhe|poumon|poitrine|respirat|emphysem|congestion pulmonaire/],
        ['Cœur et vaisseaux', '#b07aa1', /coeur|cœur|cardi|infarctus|apoplex|attaque|\bavc\b|congestion cerebrale|hemorragie cerebrale|anevrism|embolie|hydropisie|hypertension|arteri|thrombose|rupture d anevrisme|syncope/],
        ['Cancers et tumeurs', '#edc948', /cancer|tumeur|leucemi|carcinom|sarcom|squirr|lymphom|mélanome|melanom/],
        ['Ventre et digestion', '#f28e2b', /cirrhose|gastr|enterit|peritonit|appendic|occlusion|foie|ulcere|intestin|colique|hernie|diarrh|estomac|dysenter/],
        ['Nerfs et cerveau', '#4e79a7', /epilep|paralys|folie|alien|demence|convuls|cerveau|nerv|alzheimer|parkinson|meningite/],
        ['Reins, sang et autres maladies', '#59a14f', /diabet|nephr|uremi|rein|anemi|scorbut|goutte|rhumatism|hydrop|cachexie|maladie|langueur|marasme/],
        ['Vieillesse', '#bab0ac', /vieilless|senil|caducit|grand age|age avance|usure|epuisement|decrepit/],
    ];
    const familyOf = cause => { const f = fold(cause); for (const [name, , re] of FAMILIES) if (re.test(f)) return name; return 'Autres et inconnues'; };
    const FAM_COL = Object.fromEntries([...FAMILIES.map(([n, c]) => [n, c]), ['Autres et inconnues', '#c9c9c9']]);
    const P = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    function wedge(cx, cy, r0, r1, a0, a1) {
        if (a1 - a0 >= TAU - 1e-6) { const ring = r => `M${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 1 ${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 1 ${r2(cx + r)} ${r2(cy)}Z`; return r0 > .5 ? ring(r1) + ring(r0) : ring(r1); }
        const lg = a1 - a0 > Math.PI ? 1 : 0, [x1, y1] = P(cx, cy, r1, a0), [x2, y2] = P(cx, cy, r1, a1);
        if (r0 <= .5) return `M${r2(cx)} ${r2(cy)}L${r2(x1)} ${r2(y1)}A${r2(r1)} ${r2(r1)} 0 ${lg} 1 ${r2(x2)} ${r2(y2)}Z`;
        const [x3, y3] = P(cx, cy, r0, a1), [x4, y4] = P(cx, cy, r0, a0);
        return `M${r2(x1)} ${r2(y1)}A${r2(r1)} ${r2(r1)} 0 ${lg} 1 ${r2(x2)} ${r2(y2)}L${r2(x3)} ${r2(y3)}A${r2(r0)} ${r2(r0)} 0 ${lg} 0 ${r2(x4)} ${r2(y4)}Z`;
    }
    function wedgeText(cx, cy, r0, r1, a0, a1, lines, fs, fill) {
        lines = lines.filter(Boolean); if (!lines.length) return '';
        const am = (a0 + a1) / 2, rm = (r0 + r1) / 2, arc = rm * (a1 - a0), depth = r1 - r0, n = lines.length, deg = ((am * 180 / Math.PI) % 360 + 360) % 360;
        let rot, maxW, f;
        if (arc > depth * 1.1) { rot = deg + 90; if (deg > 0 && deg < 180) rot -= 180; maxW = Math.min(arc * .9, rm * 1.8); f = Math.min(fs, depth * .78 / n / 1.12); }
        else { rot = deg; if (deg > 90 && deg < 270) rot += 180; maxW = depth * .9; f = Math.min(fs, arc * .78 / n / 1.12); }
        if (f < 5) return '';
        const [x, y] = P(cx, cy, rm, am), parts = lines.map((s, i) => { const t = cut(s, maxW, f); return t ? T(x, y + (i - (n - 1) / 2) * f * 1.12, t, {size: f, anchor: 'middle', fill, weight: i ? 400 : 600}) : ''; }).join('');
        return parts ? `<g transform="rotate(${r2(rot)} ${r2(x)} ${r2(y)})" pointer-events="none">${parts}</g>` : '';
    }
    function causesOf(spec) {
        const fams = new Map();
        rows(spec, 3000).forEach(r => { const label = str(r.label, 80), v = Math.max(0, num(r.s0)); if (!label || !v) return;
            const fam = str(r.family, 60) || (spec.o?.guess === false ? 'Autres et inconnues' : familyOf(label)), F = fams.get(fold(fam)) || {name: fam, v: 0, kids: [], pids: []};
            F.v += v; F.kids.push({name: label, v, pids: Array.isArray(r.pids) ? r.pids.slice(0, 500) : [], color: color(r.color, '')}); if (Array.isArray(r.pids)) F.pids.push(...r.pids.slice(0, 500)); fams.set(fold(fam), F); });
        return [...fams.values()].sort((a, b) => b.v - a.v);
    }
    function causesun(spec, W, fs) {
        const o = spec.o || {}, fams = causesOf(spec), total = fams.reduce((a, f) => a + f.v, 0);
        if (!total) return empty(W, fs, 'Ajoute des causes de décès et leur nombre (ou « Depuis l’app »).');
        const half = o.angle === 'half', a0 = half ? Math.PI : -Math.PI / 2, span = half ? Math.PI : TAU;
        const hMax = num(o.height) > 80 ? num(o.height) : 1e9, Rm = Math.max(50, Math.min(W / 2 - 2, half ? hMax - fs : hMax / 2 - 1)), cx = W / 2, cy = Rm + 1;
        const hole = Rm * clamp(num(o.hole) || 26, 0, 60) / 100, mid = hole + (Rm - hole) * clamp(num(o.inner) || 42, 20, 70) / 100, stroke = o.border === false ? 'none' : '#ffffff';
        const lab = (name, v) => o.labels === 'none' ? [] : o.labels === 'value' ? [name, fmt(v)] : o.labels === 'pct' ? [name, `${fmt(100 * v / total, 1)} %`] : [name];
        let svg = `<g data-c2-total="${total}"></g>`, a = a0; const legend = [];
        fams.forEach((F, i) => {
            const w = span * F.v / total, fc = FAM_COL[F.name] || pick(spec, i), b0 = a, b1 = a + w;
            svg += `<g class="c2-cs" data-c2-pids="${pidsAttr(F.pids)}" data-c2-n="${F.v}" data-c2-label="${esc(F.name)}">${tip(`${F.name} : ${fmt(F.v)} (${fmt(100 * F.v / total, 1)} %)\n${F.kids.slice(0, 8).map(k => `${k.name} : ${fmt(k.v)}`).join('\n')}${F.kids.length > 8 ? '\n…' : ''}`)}<path d="${wedge(cx, cy, hole, mid, b0, b1)}" fill="${fc}" stroke="${stroke}" stroke-width="1.2" fill-rule="evenodd"/></g>`;
            svg += wedgeText(cx, cy, hole, mid, b0, b1, lab(F.name, F.v), fs * .88, contrast(fc));
            let c = b0; const kids = o.sort === false ? F.kids : [...F.kids].sort((p, q) => q.v - p.v);
            kids.forEach((k, j) => { const kw = w * k.v / F.v, kc = k.color || mix(fc, '#ffffff', .18 + .45 * (j % 4) / 4);
                svg += `<g class="c2-cs" data-c2-pids="${pidsAttr(k.pids)}" data-c2-n="${k.v}" data-c2-label="${esc(k.name)}">${tip(`${k.name} : ${fmt(k.v)} (${fmt(100 * k.v / total, 1)} % des décès, ${fmt(100 * k.v / F.v, 1)} % de « ${F.name} »)`)}<path d="${wedge(cx, cy, mid, Rm, c, c + kw)}" fill="${kc}" stroke="${stroke}" stroke-width=".8" fill-rule="evenodd"/></g>`;
                svg += wedgeText(cx, cy, mid, Rm, c, c + kw, lab(k.name, k.v), fs * .8, contrast(kc)); c += kw; });
            if (i < 14) legend.push({label: `${F.name} (${fmt(F.v)})`, color: fc});
            a += w;
        });
        if (hole > 10) { const f = Math.min(fs * 1.3, hole / 2.6), y0 = half ? cy - hole * .4 : cy;
            svg += T(cx, y0 - f * .45, fmt(total), {size: f * 1.15, anchor: 'middle', weight: 700}) + T(cx, y0 + f * .75, total > 1 ? 'décès' : 'décès', {size: f * .7, anchor: 'middle', fill: '#666'}); }
        return {h: half ? Rm + 2 : Rm * 2 + 2, svg, legend, desc: `Causes de décès : ${fmt(total)} décès en ${pl(fams.length, 'grande famille', 'grandes familles')} ; la plus fréquente : ${fams[0].name}.`};
    }

    /* ═════════ Exemples ═════════ */
    const CITY = {Rennes: [48.1147, -1.6794], 'Vitré': [48.1236, -1.2094], 'Fougères': [48.3525, -1.1986], Nantes: [47.2184, -1.5536], Laval: [48.0707, -.7734], 'Saint-Brieuc': [48.5136, -2.7653], Paris: [48.8566, 2.3522], Redon: [47.6514, -2.0843], 'Saint-Malo': [48.6493, -2.0257], Angers: [47.4784, -.5632], Brest: [48.3904, -4.4861], Dinan: [48.4553, -2.0503]};
    const placesOfCity = () => Object.fromEntries(Object.entries(CITY).map(([n, [lat, lon]]) => [fold(n), {lat, lon, n}]));
    const FIRST = ['Jean', 'Marie', 'Pierre', 'Anne', 'Louis', 'Jeanne', 'Joseph', 'Françoise', 'François', 'Perrine', 'Julien', 'Rose'], LAST = ['MARTIN', 'DURAND', 'GARNIER', 'ROUX', 'MOREAU', 'LEROY', 'PETIT', 'GUÉRIN'];
    function samplePoints(n) {
        const w = [['Rennes', 9], ['Vitré', 6], ['Fougères', 4], ['Nantes', 3], ['Laval', 2], ['Saint-Brieuc', 2], ['Redon', 2], ['Saint-Malo', 1], ['Dinan', 1], ['Paris', 2], ['Angers', 1], ['Brest', 1]], tot = w.reduce((a, x) => a + x[1], 0), out = [];
        for (let i = 0; i < n; i++) { let k = (i * 7919) % tot, j = 0; while (k >= w[j][1]) { k -= w[j][1]; j++; }
            const kind = ['Naissance', 'Naissance', 'Mariage', 'Décès'][(i * 13) % 4], y = 1700 + (i * 37) % 220;
            out.push({label: w[j][0], date: String(y), kind, name: `${FIRST[(i * 5) % 12]} ${LAST[(i * 3) % 8]}`}); }
        return out;
    }
    const DOT_SAMPLE = () => ({o: {title: 'Naissances, mariages et décès de la famille', subtitle: 'un point par événement', map: 'fr', level: 'dep'}, places: placesOfCity(), rows: samplePoints(140)});
    /** des villages autour des villes (positions inventées, toujours les mêmes) : la densité se voit */
    function sampleVillages(n) {
        const places = placesOfCity(), rows0 = samplePoints(n);
        rows0.forEach((r, i) => { if (i % 3 === 0) return; const [lat, lon] = CITY[r.label], a = i * 2.39996, d = .08 + ((i * 37) % 23) / 23 * .5, name = `Village ${1 + (i * 7) % 90} (près de ${r.label})`;
            places[fold(name)] = {lat: Math.round((lat + Math.sin(a) * d * .7) * 1e4) / 1e4, lon: Math.round((lon + Math.cos(a) * d) * 1e4) / 1e4, n: name}; r.label = name; });
        return {places, rows: rows0};
    }
    const HEX_SAMPLE = () => ({o: {title: 'Où vivait la famille', subtitle: 'nombre d’événements par alvéole', map: 'fr', level: 'dep', hexSize: 3}, ...sampleVillages(500)});
    const CARTO_SAMPLE = () => ({o: {title: 'Où sont nés mes ancêtres', subtitle: 'chaque département grossi selon le nombre d’ancêtres', map: 'fr', level: 'dep', unit: 'ancêtres'}, series: [{name: 'Ancêtres'}],
        rows: [['Ille-et-Vilaine', 64], ['Côtes-d’Armor', 31], ['Morbihan', 18], ['Loire-Atlantique', 22], ['Mayenne', 15], ['Manche', 9], ['Finistère', 6], ['Maine-et-Loire', 8], ['Paris', 7], ['Calvados', 4], ['Sarthe', 5], ['Orne', 3], ['Gironde', 2], ['Nord', 2], ['Rhône', 1], ['Corrèze', 3]].map(([label, s0]) => ({label, s0}))});
    const STORY_SAMPLE = () => ({o: {title: 'La vie de Jean Martin', subtitle: '1792 – 1868', map: 'fr', level: 'dep', step: -1}, places: placesOfCity(),
        rows: [['12 mars 1792', 'Naissance', 'Vitré', 'fils de Pierre, tisserand'], ['13 mars 1792', 'Baptême', 'Vitré', 'parrain : Jean Martin, son grand-père'], ['1806', 'Apprenti tisserand', 'Fougères', ''], ['7 mai 1815', 'Mariage avec Marie Durand', 'Rennes', ''], ['1817', 'Naissance de Pierre', 'Rennes', ''], ['1836', 'Recensement : tisserand', 'Nantes', ''], ['1846', 'Départ pour Paris', 'Paris', 'avec sa fille Rose'], ['2 février 1868', 'Décès', 'Paris', '']].map(([date, label, place, note]) => ({date, label, place, note}))});
    function sampleIcicle() {
        const out = [{name: 'Jean MARTIN (1742)', parent: '', gender: 'male', year: '1742'}];
        [['Pierre', 'male', 4], ['Marie', 'female', 3], ['Louis', 'male', 2], ['Rose', 'female', 2]].forEach(([fn, g, n], i) => {
            const me = `${fn} MARTIN (${1768 + i * 3})`; out.push({name: me, parent: out[0].name, gender: g, year: String(1768 + i * 3)});
            for (let j = 0; j < n; j++) { const yy = 1795 + i * 3 + j * 2, cg = (i + j) % 2 ? 'female' : 'male', c = `${(cg === 'male' ? ['Jean', 'Joseph', 'Julien', 'François'] : ['Anne', 'Jeanne', 'Perrine', 'Rose'])[(i + j) % 4]} ${g === 'male' ? 'MARTIN' : LAST[i + 1]} (${yy})`; out.push({name: c, parent: me, gender: cg, year: String(yy)});
                for (let m = 0; m < (i + j) % 3 + 1; m++) { const y3 = yy + 26 + m * 2, g3 = m % 2 ? 'female' : 'male'; out.push({name: `${(g3 === 'male' ? ['René', 'Yves', 'Louis'] : ['Marie', 'Louise', 'Hélène'])[m % 3]} (${y3})`, parent: c, gender: g3, year: String(y3)}); } }
        });
        return out;
    }
    const GOD_SAMPLE = () => ({o: {title: 'Prénoms transmis par les parrains et marraines'}, rows: [
        ['Jean MARTIN', 'Jean MARTIN', 'parrain', 'grand-père', '1712', '1768'], ['Jean MARTIN', 'Jean Pierre MARTIN', 'parrain', 'grand-père', '1768', '1796'], ['Jean Pierre MARTIN', 'Jean MARTIN', 'parrain', 'oncle', '1796', '1826'], ['Jean MARTIN', 'Jean Louis MARTIN', 'parrain', 'oncle', '1826', '1858'],
        ['Marie DURAND', 'Marie MARTIN', 'marraine', 'grand-mère', '1716', '1770'], ['Marie MARTIN', 'Marie Anne ROUX', 'marraine', 'tante', '1770', '1801'], ['Marie Anne ROUX', 'Marie GARNIER', 'marraine', 'sœur', '1801', '1812'],
        ['Julien ROUX', 'Julienne ROUX', 'parrain', 'oncle', '1774', '1803'], ['Julienne ROUX', 'Julienne MOREAU', 'marraine', 'tante', '1803', '1834'],
        ['Pierre GARNIER', 'Joseph GARNIER', 'parrain', '', '1780', '1808'], ['Anne PETIT', 'Rose MARTIN', 'marraine', '', '1790', '1823'], ['François LEROY', 'François LEROY', 'parrain', 'grand-père', '1760', '1815'], ['François LEROY', 'Françoise LEROY', 'parrain', 'oncle', '1815', '1847'],
        ['Louis MARTIN', 'Louise MARTIN', 'parrain', 'frère', '1828', '1840'], ['Rose MARTIN', 'Anne MOREAU', 'marraine', 'tante', '1823', '1852']].map(([godparent, godchild, role, rel, gpYear, gcYear]) => ({godparent, godchild, role, rel, gpYear, gcYear}))});
    const CAUSE_SAMPLE = () => ({o: {title: 'De quoi sont morts mes ancêtres', subtitle: 'causes relevées dans les actes de décès'}, series: [{name: 'Décès'}],
        rows: [['Phtisie', 12], ['Choléra', 7], ['Variole', 4], ['Fièvre typhoïde', 5], ['Croup', 3], ['Vieillesse', 15], ['Apoplexie', 6], ['Maladie de cœur', 4], ['Cancer', 5], ['Fluxion de poitrine', 6], ['Bronchite', 3], ['Mort pour la France', 4], ['Noyade', 2], ['Chute de cheval', 1], ['Suites de couches', 3], ['Convulsions', 5], ['Cirrhose', 2], ['Entérite', 4], ['Inconnue', 6]].map(([label, s0]) => ({label, s0}))});

    /* ═════════ « Depuis l'app » ═════════ */
    const get = q => A().api('diagram_cartes2', {...q, ...(window.LCNDA_EXT?.diagramAppOpts?.extra() || {})}); // + le groupe de personnes commun (heritage-diagram-options.js)
    const fname = p => p ? `${p[0] || ''} ${String(p[1] || '').toUpperCase()}`.trim() || 'Sans nom' : '';
    const typeOptions = () => (A()?.state?.bootstrap?.eventTypes || []).filter(t => t && Number(t.id) > 0 && Number(t.is_active ?? 1) !== 0).sort((a, b) => String(a.label).localeCompare(String(b.label), 'fr')).map(t => `<option value="${Number(t.id)}">${esc(t.label)}</option>`).join('');
    /** les lieux de la base sans coordonnées : retrouvés dans les communes (France) par leur code ou leur nom et leur département */
    async function placesToSpec(spec, places, names) {
        const out = {}, needFr = Object.values(places).some(p => (p[4] === null || p[5] === null) && (!fold(p[3]) || /^(france|fr|fra)$/.test(fold(p[3]))));
        let com = null; if (needFr) { try { com = await GC.load('fr-communes'); } catch (_) { com = null; } }
        let lost = 0;
        Object.entries(places).forEach(([id, p]) => {
            const label = names.get(Number(id)); if (!label) return;
            let lat = p[4], lon = p[5];
            if ((lat === null || lon === null) && com && (!fold(p[3]) || /^(france|fr|fra)$/.test(fold(p[3])))) { const z = GC.communeOfPlace(com, {name: p[0], county: p[1], state: p[2], country: p[3], insee: p[6], code: '', lat: null, lon: null}, {}); if (z) { lon = Math.round(z.label[0] * 1e5) / 1e5; lat = Math.round(z.label[1] * 1e5) / 1e5; } }
            if (lat === null || lon === null) { lost++; return; }
            out[fold(label)] = {lat, lon, n: label};
        });
        spec.places = out; return lost;
    }
    /** les noms des lieux : « Saint-Martin (Gers) » quand deux lieux portent le même nom */
    const placeNames = places => { const cnt = new Map(); Object.values(places).forEach(p => cnt.set(fold(p[0]), (cnt.get(fold(p[0])) || 0) + 1));
        return new Map(Object.entries(places).map(([id, p]) => [Number(id), cnt.get(fold(p[0])) > 1 && (p[1] || p[2] || p[3]) ? `${p[0]} (${p[1] || p[2] || p[3]})` : p[0]])); };
    function bindGo(pane, run) {
        const btn = pane.querySelector('[data-c2-go]'), msg = pane.querySelector('[data-c2-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = '<span class="ui-spinner" aria-hidden="true"></span> Lecture de ta généalogie…';
            try { const t = await run(); if (msg?.isConnected) msg.textContent = t ? '✓ ' + t : ''; A().toast?.(t || 'Données prises dans l’app.'); } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } });
    }
    const findBtn = '<button type="button" class="button small secondary" data-c2-find>🔎 Retrouver les lieux sans position</button>';
    /** « Retrouver les lieux sans position » : chaque lieu du tableau sans position est cherché dans la base et les villes du monde */
    function bindFind(pane, io, key) {
        pane.querySelector('[data-c2-find]')?.addEventListener('click', async e => {
            const b = e.currentTarget; b.disabled = true; let found = 0;
            try { const s = io.spec(), o = s.o || {}, ids = [GC.baseIdOf(o, GC.viewOf(o)), 'monde-110m']; await Promise.all(ids.map(id => GC.load(id).catch(() => {}))); const bases = ids.map(GC.loaded).filter(Boolean);
                const miss = [...new Set(rows(s).map(r => str(r[key], 120)).filter(n => n && !GC.placeOf(s, n, bases)))].slice(0, 40);
                for (const n of miss) { try { const r = await A().api('picker_search', {kind: 'place', q: n.replace(/\(.*\)$/, '').trim(), limit: 5}); const it = (r.groups || []).flatMap(g => g.items || []).find(x => x.lat !== null && x.lat !== undefined && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lon))); if (it) { s.places = {...(s.places || {}), [fold(n)]: {lat: Number(it.lat), lon: Number(it.lon), n: String(it.title || n).slice(0, 80)}}; found++; } } catch (_) {} }
                A().toast(miss.length ? (found ? `${pl(found, 'lieu retrouvé', 'lieux retrouvés')} : vérifie-les sur la carte.` : 'Aucun lieu retrouvé : tape leurs coordonnées dans le tableau (« Nom 48.11, -1.68 »).') : 'Tous les lieux ont une position.'); if (found) io.set(s);
            } finally { b.disabled = false; }
        });
    }
    const pointsApp = {
        html: () => `<div class="h-dg-app c2-app"><h4>📍 Les événements de ton arbre</h4><p class="muted">Chaque événement qui a un lieu devient un point (un mariage compte pour chacun des deux époux). Les lieux sans coordonnées sont retrouvés dans les communes de France par leur nom et leur département. Le tableau est remplacé.</p>
            <div class="c2-form"><label>Quoi<select data-c2="ev"><option value="births">Naissances (ou baptêmes)</option><option value="deaths">Décès (ou sépultures)</option><option value="marriages">Mariages</option><option value="residences">Résidences et recensements</option><option value="all">Naissances, mariages et décès</option><option value="type">Une sorte d’événement…</option></select></label>
            <label data-c2-typebox hidden>Quelle sorte d’événement<select data-c2="type">${typeOptions() || '<option value="">Aucune</option>'}</select></label>
            <label class="checkbox-line"><input type="checkbox" data-c2="anc"> Seulement mes ancêtres (lignée Sosa)</label>
            <span class="c2-period"><label>De l’année<input type="number" inputmode="numeric" data-c2="from" placeholder="ex. 1700" min="-3000" max="3000"></label><label>à l’année<input type="number" inputmode="numeric" data-c2="to" placeholder="ex. 1900" min="-3000" max="3000"></label></span>
            <button type="button" class="button small" data-c2-go>Prendre ces événements</button><p class="c2-msg" data-c2-msg role="status"></p>${findBtn}</div></div>`,
        bind: (pane, io) => {
            const v = k => pane.querySelector(`[data-c2="${k}"]`);
            v('ev').addEventListener('change', () => { pane.querySelector('[data-c2-typebox]').hidden = v('ev').value !== 'type'; });
            bindFind(pane, io, 'label');
            bindGo(pane, async () => {
                const q = {what: 'points', ev: v('ev').value}; if (q.ev === 'type') { q.type = Number(v('type').value) || 0; if (!q.type) throw new Error('Choisis une sorte d’événement.'); }
                if (v('anc').checked) q.ancestors = 1; const f = v('from').value.trim(), t = v('to').value.trim(); if (/^-?\d{1,4}$/.test(f)) q.from = Number(f); if (/^-?\d{1,4}$/.test(t)) q.to = Number(t);
                const r = await get(q); if (!r.events?.length) throw new Error('Aucun événement avec un lieu pour ce choix.');
                const s = io.spec(), names = placeNames(r.places || {}), people = r.people || {};
                const lost = await placesToSpec(s, r.places || {}, names);
                s.rows = r.events.map(([p, plc, y, k]) => ({label: names.get(plc) || '', date: y === null ? '' : String(y), kind: r.kinds[k] || '', name: fname(people[p]), pid: p})).filter(x => x.label);
                const what = v('ev').selectedOptions[0]?.textContent.replace(/\s*\(.*$/, '').replace(/…$/, '') || 'Événements', smp = (s.kind === 'hexmap' ? HEX_SAMPLE() : DOT_SAMPLE()).o;
                s.o = {...s.o}; if (!s.o.title || s.o.title === smp.title) s.o.title = `${q.ev === 'type' ? v('type').selectedOptions[0]?.textContent || what : what}${q.ancestors ? ' de mes ancêtres' : ' de la famille'}`; if (s.o.subtitle === smp.subtitle) s.o.subtitle = q.from || q.to ? `${q.from ?? '…'} – ${q.to ?? '…'}` : '';
                if (s.kind === 'hexmap' && (!s.o.unit || s.o.unit === 'événement')) s.o.unit = ''; s.o.frame = s.o.frame === 'custom' ? '' : s.o.frame;
                io.apply(s);
                return `${pl(s.rows.length, 'point')} pris dans l’arbre${r.truncated ? ' (les 12 000 premiers)' : ''}.${lost ? ` ${pl(lost, 'lieu sans position', 'lieux sans position')} : « 🔎 Retrouver les lieux sans position ».` : ''}`;
            });
        },
    };
    const storyApp = {
        html: () => `<div class="h-dg-app c2-app"><h4>📖 La vie d’une personne</h4><p class="muted">Ses événements (naissance, baptême, mariages, résidences, métiers, décès…) deviennent les étapes, dans l’ordre des dates. Le tableau est remplacé.</p>
            <div class="c2-form"><span class="pk-lab">Personne</span>${A().pickerField ? A().pickerField({name: 'c2_person', kind: 'person', value: Number(A().state?.bootstrap?.startPersonId) || null}) : ''}
            <label class="checkbox-line"><input type="checkbox" data-c2="noplace"> Garder aussi les étapes sans lieu (sur la frise seulement)</label>
            <button type="button" class="button small" data-c2-go>Prendre sa vie</button><p class="c2-msg" data-c2-msg role="status"></p>${findBtn}</div></div>`,
        bind: (pane, io) => {
            bindFind(pane, io, 'place');
            bindGo(pane, async () => {
                const id = Number(pane.querySelector('[name="c2_person"]')?.value) || Number(A().state?.bootstrap?.startPersonId) || 0; if (!id) throw new Error('Choisis une personne.');
                const r = await get({what: 'story', person: id}), keep = pane.querySelector('[data-c2="noplace"]').checked;
                const steps = (r.steps || []).filter(x => keep || x.place); if (!steps.length) throw new Error('Aucun événement avec un lieu pour cette personne.');
                const s = io.spec(), places = {}, names = new Map();
                steps.forEach((x, i) => { if (!x.place) return; const label = x.county && steps.some(y => y.place === x.place && y.county !== x.county) ? `${x.place} (${x.county})` : x.place; x.label2 = label; places[i] = [x.place, x.county, '', x.country, x.lat ?? null, x.lon ?? null, x.insee || '']; names.set(i, label); });
                const lost = await placesToSpec(s, places, names);
                s.rows = steps.map(x => ({date: x.date || (x.year ? String(x.year) : ''), label: [x.kind, x.with ? `avec ${x.with}` : ''].filter(Boolean).join(' ') + (x.title && x.title !== x.kind ? ` : ${x.title}` : ''), place: x.label2 || '', note: ''}));
                s.o = {...s.o, step: -1, title: `La vie de ${r.name}`, subtitle: (() => { const ys = steps.map(x => x.year).filter(Boolean); return ys.length ? `${Math.min(...ys)} – ${Math.max(...ys)}` : ''; })()};
                io.apply(s); return `${pl(s.rows.length, 'étape')} prise${s.rows.length > 1 ? 's' : ''} dans la vie de ${r.name}.${lost ? ` ${pl(lost, 'lieu sans position', 'lieux sans position')}.` : ''}`;
            });
        },
    };
    const icicleApp = {
        html: () => `<div class="h-dg-app c2-app"><h4>🧱 Une descendance</h4><p class="muted">Chaque enfant devient une case sous son parent ; sa largeur = le nombre de ses descendants (la personne comprise). Un clic sur une case ouvre la fiche.</p>
            <div class="c2-form"><span class="pk-lab">Ancêtre en haut</span>${A().pickerField ? A().pickerField({name: 'c2_root', kind: 'person', value: Number(A().state?.bootstrap?.startPersonId) || null}) : ''}
            <label>Générations<select data-c2="gens">${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <button type="button" class="button small" data-c2-go>Prendre la descendance</button><p class="c2-msg" data-c2-msg role="status"></p></div></div>`,
        bind: (pane, io) => bindGo(pane, async () => {
            const root = Number(pane.querySelector('[name="c2_root"]')?.value) || Number(A().state?.bootstrap?.startPersonId) || 0, gens = Number(pane.querySelector('[data-c2="gens"]').value) || 5;
            const r = await A().api('diagram_genea', {what: 'desc', root, gens}); if ((r.nodes || []).length < 2) throw new Error('Aucun descendant trouvé pour cette personne.');
            const count = new Map(); r.nodes.forEach(n => count.set(n.name, (count.get(n.name) || 0) + 1));
            const label = new Map(r.nodes.map(n => [n.id, count.get(n.name) > 1 ? `${n.name} (${n.year || 'n° ' + n.id})` : n.name])), used = new Set();
            label.forEach((v, k) => { let x = v; if (used.has(x)) x = `${v} · n° ${k}`; used.add(x); label.set(k, x); });
            const s = io.spec(); s.rows = r.nodes.map(n => ({name: label.get(n.id), parent: n.parent ? label.get(n.parent) || '' : '', value: '', pid: n.id, gender: n.gender || '', year: n.year ? String(n.year) : ''}));
            s.o = {...s.o, sizeBy: 'desc', depth: gens, title: `Descendance de ${r.nodes[0].name}`}; io.apply(s);
            return `${pl(r.nodes.length, 'personne')} prise${r.nodes.length > 1 ? 's' : ''} dans l’app${r.truncated ? ' (les 3 000 premières)' : ''}.`;
        }),
    };
    const godApp = {
        html: () => `<div class="h-dg-app c2-app"><h4>🎀 Parrains, marraines et filleuls</h4><p class="muted">Les témoins des naissances et des baptêmes dont le rôle dit « parrain » ou « marraine ». Le lien de parenté (grand-père, oncle, sœur…) est trouvé dans l’arbre.</p>
            <div class="c2-form"><label class="checkbox-line"><input type="checkbox" data-c2="anc"> Seulement autour de mes ancêtres (lignée Sosa)</label>
            <span class="c2-period"><label>De l’année<input type="number" inputmode="numeric" data-c2="from" placeholder="ex. 1700"></label><label>à l’année<input type="number" inputmode="numeric" data-c2="to" placeholder="ex. 1900"></label></span>
            <button type="button" class="button small" data-c2-go>Prendre les parrains et marraines</button><p class="c2-msg" data-c2-msg role="status"></p></div></div>`,
        bind: (pane, io) => bindGo(pane, async () => {
            const v = k => pane.querySelector(`[data-c2="${k}"]`), q = {what: 'godnames'}; if (v('anc').checked) q.ancestors = 1; const f = v('from').value.trim(), t = v('to').value.trim(); if (/^-?\d{1,4}$/.test(f)) q.from = Number(f); if (/^-?\d{1,4}$/.test(t)) q.to = Number(t);
            const r = await get(q); if (!r.rows?.length) throw new Error('Aucun parrain ni marraine dans les témoins des naissances et baptêmes (rôle « parrain » ou « marraine »).');
            const s = io.spec(), nm = (f0, l) => `${f0 || ''} ${String(l || '').toUpperCase()}`.trim();
            s.rows = r.rows.map(x => ({godparent: nm(x.gpFirst, x.gpLast), godchild: nm(x.gcFirst, x.gcLast), role: x.role, rel: x.rel || '', gpYear: x.gpYear ? String(x.gpYear) : '', gcYear: x.gcYear ? String(x.gcYear) : '', gpPid: x.gp, gcPid: x.gc, gpGender: x.gpG, gcGender: x.gcG}));
            io.apply(s); return `${pl(s.rows.length, 'filleul')} pris dans l’app${r.truncated ? ' (les 3 000 premiers)' : ''}.`;
        }),
    };
    const causeApp = {
        html: () => `<div class="h-dg-app c2-app"><h4>🎗 Les causes de décès de ton arbre</h4><p class="muted">La cause écrite sur le décès (ou la sépulture) de chaque personne. Les grandes familles (maladies infectieuses, cœur, accidents, guerre…) sont devinées d’après les mots ; corrige-les dans la colonne « Grande famille ».</p>
            <div class="c2-form"><label class="checkbox-line"><input type="checkbox" data-c2="anc"> Seulement mes ancêtres (lignée Sosa)</label>
            <span class="c2-period"><label>De l’année<input type="number" inputmode="numeric" data-c2="from" placeholder="ex. 1700"></label><label>à l’année<input type="number" inputmode="numeric" data-c2="to" placeholder="ex. 1900"></label></span>
            <button type="button" class="button small" data-c2-go>Prendre les causes de décès</button><p class="c2-msg" data-c2-msg role="status"></p></div></div>`,
        bind: (pane, io) => bindGo(pane, async () => {
            const v = k => pane.querySelector(`[data-c2="${k}"]`), q = {what: 'causes'}; if (v('anc').checked) q.ancestors = 1; const f = v('from').value.trim(), t = v('to').value.trim(); if (/^-?\d{1,4}$/.test(f)) q.from = Number(f); if (/^-?\d{1,4}$/.test(t)) q.to = Number(t);
            const r = await get(q); if (!r.rows?.length) throw new Error('Aucune cause de décès relevée : elle s’écrit dans le champ « Cause » d’un décès.');
            const s = io.spec(); s.series = [{...(s.series?.[0] || {}), name: 'Décès'}];
            s.rows = r.rows.map(x => ({label: x.label, s0: x.n, family: '', pids: x.ids})); if (!s.o?.title || s.o.title === CAUSE_SAMPLE().o.title) s.o = {...s.o, title: q.ancestors ? 'De quoi sont morts mes ancêtres' : 'Causes de décès dans la famille', subtitle: ''};
            io.apply(s); return `${pl(r.rows.reduce((a, x) => a + x.n, 0), 'décès')} avec une cause, en ${pl(r.rows.length, 'cause')} différente${r.rows.length > 1 ? 's' : ''}.`;
        }),
    };

    /* ═════════ Avant le dessin : les fonds de carte chargés ═════════ */
    async function resolvePts(spec) {
        const s = await GC.resolve(spec), o = s.o || {};
        const pre = GC.viewOf(o), ids = [GC.baseIdOf(o, pre), GC.ctxIdOf(o, GC.baseIdOf(o, pre), pre), 'monde-110m', GC.mapOf(o) === 'monde' || GC.mapOf(o) === 'eu' ? 'monde-50m' : ''];
        await Promise.all(ids.filter(Boolean).map(id => GC.load(id).catch(() => {})));
        const bases = ids.filter(Boolean).map(GC.loaded).filter(Boolean);
        const views = [];
        if (s.kind === 'storymap') { const st = stepsOf(s, bases).filter(x => x.p); if (st.length) views.push(GC.fitView(st.map(x => ({p: x.p})), o)); st.forEach(x => views.push([x.p[0] - 3, x.p[1] - 2, x.p[0] + 3, x.p[1] + 2])); }
        else { const P0 = pointsOf(s, bases).pts; if (P0.length && !o.frame && o.fit !== false) views.push(GC.fitView(P0.map(p => ({p: [p.lon, p.lat]})), o)); }
        const need = new Set(); views.slice(0, 30).forEach(v => { const b = GC.baseIdOf(o, v); need.add(b); need.add(GC.ctxIdOf(o, b, v)); });
        await Promise.all([...need].filter(Boolean).map(id => GC.load(id).catch(() => {})));
        return s;
    }

    /* ═════════ Dans la page : un clic ouvre la fiche ou « qui est compté », la carte qui raconte avance ═════════ */
    async function showPeople(el) {
        const ids = String(el.getAttribute('data-c2-pids') || el.getAttribute('data-c2-pid') || '').split(',').map(Number).filter(x => x > 0).slice(0, 500), inEditor = !!el.closest('dialog[open]');
        const label = el.getAttribute('data-c2-label') || (el.querySelector('title')?.textContent || '').split('\n')[0].split(' : ')[0] || 'Ces personnes', n = Number(el.getAttribute('data-c2-n')) || ids.length;
        if (!ids.length) { A()?.toast?.('Pas de fiche derrière ce point : les lignes ont été tapées à la main (« Depuis l’app » les relie aux fiches).'); return; }
        if (ids.length === 1 && !inEditor) { A()?.openPersonById?.(ids[0]); return; }
        try {
            const r = await get({what: 'people', ids: ids.join(',')}), svg = el.closest('svg');
            const title = svg?.getAttribute('aria-label') || 'DIAGRAMME', total = Number(svg?.querySelector('[data-c2-total]')?.getAttribute('data-c2-total')) || 0;
            if (ext.whoDialog) ext.whoDialog({eyebrow: title, label, n, total, color: el.querySelector('[fill]')?.getAttribute('fill') || el.getAttribute('fill') || '#0066cc', res: {people: r.people || [], truncated: ids.length >= 500}, csvName: `${title} - ${label}`});
            else if (ids.length === 1) A()?.openPersonById?.(ids[0]);
        } catch (e) { A()?.toast?.(e.message || 'Lecture impossible.', 'error'); }
    }
    const clickable = t => t?.closest?.('[data-c2-pids],[data-c2-pid]');
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('click', e => {
            const st = e.target.closest?.('[data-c2-step]'); if (st && !st.closest('.h-dg-mini')) { const g = st.closest('[data-c2-story]'); if (g) { e.preventDefault(); storyGo(g, Number(st.getAttribute('data-c2-step'))); } return; }
            const c = clickable(e.target); if (!c || c.closest('.h-dg-mini') || c.closest('[data-dg-preview] [data-geo-map]')) return; // dans l'aperçu d'une carte : le glisser déplace la carte (voir afterDraw)
            e.preventDefault(); showPeople(c);
        });
        document.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const c = clickable(e.target); if (c && !c.closest('.h-dg-mini')) { e.preventDefault(); showPeople(c); } });
    }
    /** l'aperçu d'une carte (éditeur) : le cadrage à la souris de la carte colorée, et un clic sans glisser sur un point */
    function mapAfterDraw(prev, api) {
        GC.afterDraw(prev, api);
        if (prev._c2Click) return; prev._c2Click = true;
        let down = null;
        prev.addEventListener('pointerdown', e => { down = {el: clickable(e.target), x: e.clientX, y: e.clientY}; }, true);
        prev.addEventListener('pointerup', e => { const d = down; down = null; if (d?.el && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 4 && d.el.isConnected) showPeople(d.el); }, true);
    }
    /* ── 📖 la carte qui raconte : ◀ ▶, lecture, curseur des étapes ── */
    function storyGo(g, i, persist = true) {
        const svg = g.ownerSVGElement, host = svg?.parentElement, n = Number(g.getAttribute('data-c2-n')) || 0; if (!svg || !host || !n) return;
        i = clamp(Math.round(i), -1, n - 1);
        const S = STORY.get(g.getAttribute('data-c2-story'));
        if (S) { try { svg.outerHTML = DR.svg({...S.spec, o: {...(S.spec.o || {}), step: i}}, S.W + 32); } catch (_) {} }
        paintTools(host, i, n);
        // dans l'éditeur : l'étape est enregistrée avec le diagramme (pas pendant la lecture)
        const api = host.closest('[data-dg-preview]')?._c2Api || host._c2Api;
        if (persist && api && api.spec().kind === 'storymap') { clearTimeout(host._c2Save); host._c2Save = setTimeout(() => { if (api.spec().o?.step !== i) api.set({step: i}); }, 500); }
    }
    function paintTools(host, i, n) { const bar = host.querySelector(':scope > .c2-tools'); if (!bar) return; bar.querySelector('input').max = String(n - 1); bar.querySelector('input').value = String(i); bar.querySelector('output').textContent = i < 0 ? 'Toute la vie' : `Étape ${i + 1} / ${n}`; }
    function storyEnhance(g) {
        if (g.__c2) return; g.__c2 = 1;
        const svg = g.ownerSVGElement, host = svg?.parentElement; if (!host) return;
        const n = Number(g.getAttribute('data-c2-n')) || 0, cur = Number(g.getAttribute('data-c2-cur'));
        let bar = host.querySelector(':scope > .c2-tools');
        if (!bar) {
            bar = document.createElement('div'); bar.className = 'c2-tools'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Étapes de la vie');
            bar.innerHTML = `<button type="button" class="button small secondary" data-c2-t="all" title="Voir toute la vie">⤢ Toute la vie</button><button type="button" class="icon-button small" data-c2-t="prev" title="Étape précédente" aria-label="Étape précédente">◀</button><button type="button" class="icon-button small" data-c2-t="play" title="Lecture : les étapes défilent" aria-label="Lecture">▶︎</button><button type="button" class="icon-button small" data-c2-t="next" title="Étape suivante" aria-label="Étape suivante">▶</button><input type="range" min="-1" step="1" aria-label="Étape"><output></output>`;
            host.appendChild(bar);
            const cur0 = () => { const gg = host.querySelector('[data-c2-story]'); return gg ? [gg, Number(gg.getAttribute('data-c2-cur')), Number(gg.getAttribute('data-c2-n'))] : [null, -1, 0]; };
            const playBtn = () => host.querySelector(':scope > .c2-tools [data-c2-t="play"]'); // la lecture tient à la boîte (l'éditeur peut redessiner la barre)
            const stop = () => { if (!host._c2T) return; clearInterval(host._c2T); host._c2T = 0; const pb = playBtn(); if (pb) pb.textContent = '▶︎'; const [gg, c] = cur0(); if (gg) storyGo(gg, c); };
            bar.addEventListener('click', e => { const b = e.target.closest('[data-c2-t]'); if (!b) return; const [gg, c, nn] = cur0(); if (!gg) return;
                if (b.dataset.c2T === 'all') { stop(); storyGo(gg, -1); }
                if (b.dataset.c2T === 'prev') { stop(); storyGo(gg, c <= 0 ? nn - 1 : c - 1); }
                if (b.dataset.c2T === 'next') { stop(); storyGo(gg, c >= nn - 1 ? 0 : c + 1); }
                if (b.dataset.c2T === 'play') { if (host._c2T) return stop(); b.textContent = '⏸'; clearTimeout(host._c2Save); if (c >= nn - 1 || c < 0) storyGo(gg, 0, false);
                    host._c2T = setInterval(() => { const [g2, c2, n2] = cur0(); if (!g2 || !host.isConnected) { clearInterval(host._c2T); host._c2T = 0; return; } if (c2 >= n2 - 1) return stop(); storyGo(g2, c2 + 1, false); }, 1700); } });
            bar.querySelector('input').addEventListener('input', e => { stop(); const [gg] = cur0(); if (gg) storyGo(gg, Number(e.target.value)); });
        }
        paintTools(host, cur, n);
        const pb = bar.querySelector('[data-c2-t="play"]'); if (pb) pb.textContent = host._c2T ? '⏸' : '▶︎';
    }
    let scanT = 0;
    const scan = () => document.querySelectorAll('[data-c2-story]').forEach(g => { if (!g.__c2 && !g.closest('.h-dg-mini')) storyEnhance(g); });
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) new MutationObserver(() => { clearTimeout(scanT); scanT = setTimeout(scan, 60); }).observe(document.documentElement, {childList: true, subtree: true});
    const storyAfterDraw = (prev, api) => { prev._c2Api = api; };
    const keepApi = (prev, api) => { prev._c2Api = api; };

    /* ═════════ Réglages et enregistrement des sortes ═════════ */
    const mapOpts = GC.mapOpts();
    const PERIOD = [C('from', 'Seulement à partir de l’année', 'number'), C('to', 'Jusqu’à l’année', 'number')];
    const RAMP = C('ramp', 'Gamme de couleurs', 'select', {choices: [['', 'Du jaune au rouge'], ['bleus', 'Bleus'], ['verts', 'Verts'], ['oranges', 'Oranges'], ['rouges', 'Rouges'], ['violets', 'Violets'], ['sepia', 'Sépia (ancien)'], ['gris', 'Gris'], ['perso', 'Mes deux couleurs…']]});
    const POINT_GRID = {key: 'rows', label: 'Les événements (un point par ligne)', cols: [C('label', 'Lieu (« Rennes », « Rennes 48.11, -1.68 », « 35 »…)'), C('date', 'Date ou année', 'text', {ph: '7 mai 1925, 1832'}), C('kind', 'Sorte (naissance, mariage…)'), C('name', 'Personne'), C('color', 'Couleur', 'color')]};
    const COMMON_MAP = [C('zoneColor', 'Couleur des terres', 'color', {def: GC.LAND}), C('borderColor', 'Couleur des limites', 'color', {def: '#cfcabe'}), C('showMissing', 'Signaler les lieux sans position', 'check', {def: true})];
    const NEW = {
        dotmap: {icon: '📍', label: 'Carte en points (un point par événement)', group: 'Cartes', render: GC.remember(dotmap), legend: 'bottom', grids: [POINT_GRID],
            options: [...mapOpts, C('fit', 'Cadrer tout seul sur les points', 'check', {def: true, when: s => !s.o?.frame}), ...PERIOD,
                C('colorBy', 'Couleur des points', 'select', {choices: [['kind', 'Selon la sorte d’événement'], ['century', 'Selon le siècle'], ['one', 'Une seule couleur']], def: 'kind'}), C('dotColor', 'Couleur des points', 'color', {def: '#e15759', when: s => s.o?.colorBy === 'one'}),
                C('dotSize', 'Taille des points', 'range', {min: .8, max: 14, step: .2, def: 3.2}), C('opacity', 'Opacité des points', 'range', {unit: '%', min: 10, max: 100, def: 80}), C('spread', 'Écarter les points d’un même lieu', 'check', {def: true}),
                C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Les 10 plus remplis'], ['all', 'Tous (sans se chevaucher)'], ['none', 'Aucun']]}), C('labelSize', 'Taille des noms', 'range', {min: .5, max: 2.5, step: .1, def: 1}), C('unit', 'Mot pour un point (ex. : naissance)'), ...COMMON_MAP],
            sample: DOT_SAMPLE, resolve: resolvePts, afterDraw: mapAfterDraw, fromApp: pointsApp,
            describe: spec => `Carte en points : ${rows(spec).length} événements.`},
        hexmap: {icon: '⬢', label: 'Carte en hexagones (densité en alvéoles)', group: 'Cartes', render: GC.remember(hexmap), noLegend: true, grids: [POINT_GRID],
            options: [...mapOpts, C('fit', 'Cadrer tout seul sur les points', 'check', {def: true, when: s => !s.o?.frame}), ...PERIOD,
                C('hexSize', 'Taille des alvéoles (% de la largeur)', 'range', {min: 1, max: 15, step: .5, def: 4}), RAMP, C('lowColor', 'Couleur de « peu »', 'color', {def: '#fff3e6', when: s => s.o?.ramp === 'perso'}), C('highColor', 'Couleur de « beaucoup »', 'color', {def: '#7f2704', when: s => s.o?.ramp === 'perso'}),
                C('logScale', 'Échelle douce (très grands écarts)', 'check', {def: true}), C('opacity', 'Opacité des alvéoles', 'range', {unit: '%', min: 10, max: 100, def: 85}), C('values', 'Écrire le nombre dans les alvéoles', 'check', {def: true}), C('outline', 'Traits blancs entre les alvéoles', 'check', {def: true}),
                C('legend', 'Légende', 'select', {choices: [['', 'En dessous'], ['none', 'Aucune']]}), C('unit', 'Mot pour un point (ex. : naissance)'), ...COMMON_MAP],
            sample: HEX_SAMPLE, resolve: resolvePts, afterDraw: mapAfterDraw, fromApp: pointsApp,
            describe: spec => `Carte en hexagones : ${rows(spec).length} événements.`},
        cartogram: {icon: '🫧', label: 'Carte déformée (zones grossies selon leur chiffre)', group: 'Cartes', render: GC.remember(cartogram), noLegend: true,
            grids: [{key: 'rows', label: 'Les zones et leurs chiffres', series: 1, cols: [C('label', 'Zone (nom ou code : 35, Gers, FR, Vaud…)'), C('note', 'Note (dans la bulle)')]}],
            options: [...mapOpts.map(x => x.k === 'level' ? {...x, choices: x.choices.filter(([l]) => l !== 'com')} : x), C('shape', 'Forme', 'select', {choices: [['', 'Des ronds (Dorling)'], ['square', 'Des carrés (Demers)']]}),
                C('fill', 'Taille des formes (% de la carte)', 'range', {min: 5, max: 80, def: 20}), C('gap', 'Écart entre les formes', 'range', {unit: 'px', min: 0, max: 10, step: .5, def: 1.5}),
                C('colorBy', 'Couleur', 'select', {choices: [['', 'Selon le chiffre (dégradé)'], ['one', 'Une seule couleur']]}), C('shapeColor', 'Couleur des formes', 'color', {def: '#e15759', when: s => s.o?.colorBy === 'one'}),
                {...RAMP, choices: [['', 'Oranges'], ...RAMP.choices.filter(([k]) => k && k !== 'oranges' && k !== 'perso'), ['jaunerouge', 'Du jaune au rouge'], ['perso', 'Mes deux couleurs…']], when: s => s.o?.colorBy !== 'one'}, C('lowColor', 'Couleur des petits chiffres', 'color', {def: '#fff3e6', when: s => s.o?.ramp === 'perso'}), C('highColor', 'Couleur des grands chiffres', 'color', {def: '#7f2704', when: s => s.o?.ramp === 'perso'}),
                C('ghost', 'La vraie carte en fond (pâle)', 'check', {def: true}), C('ghostColor', 'Couleur de la carte en fond', 'color', {def: '#ecebe6', when: s => s.o?.ghost !== false}), C('links', 'Un trait vers la vraie place quand une forme a bougé', 'check', {def: true}),
                C('labels', 'Étiquettes', 'select', {choices: [['', 'Nom et chiffre (là où il y a la place)'], ['name', 'Noms'], ['value', 'Chiffres'], ['none', 'Aucune']]}), C('labelSize', 'Taille des étiquettes', 'range', {min: .5, max: 2.5, step: .1, def: 1}),
                C('legend', 'Légende des tailles', 'select', {choices: [['', 'En dessous'], ['none', 'Aucune']]}), C('unit', 'Unité (ex. : ancêtres)'), C('showMissing', 'Signaler les zones pas trouvées', 'check', {def: true})],
            sample: CARTO_SAMPLE, resolve: GC.resolve, afterDraw: GC.afterDraw, fromApp: GC.FROM_APP,
            describe: spec => `Carte déformée : ${rows(spec).length} zones.`},
        storymap: {icon: '📖', label: 'Carte qui raconte (une vie étape par étape)', group: 'Cartes', render: GC.remember(storymap), noLegend: true,
            grids: [{key: 'rows', label: 'Les étapes, dans l’ordre', cols: [C('date', 'Date', 'text', {ph: '7 mai 1925, 1832'}), C('label', 'Ce qui s’est passé'), C('place', 'Lieu (« Rennes », « Rennes 48.11, -1.68 »)'), C('note', 'Détail (dans la bulle)'), C('color', 'Couleur', 'color')]}],
            options: [C('step', 'Étape montrée (-1 = toute la vie)', 'range', {min: -1, max: 60, def: -1}), C('follow', 'La carte', 'select', {choices: [['', 'Suit l’étape en cours (zoom)'], ['all', 'Montre toute la vie (fixe)']]}), C('zoom', 'Zoom sur l’étape (degrés autour)', 'range', {min: .5, max: 20, step: .5, def: 3, when: s => s.o?.follow !== 'all'}),
                ...mapOpts.filter(x => x.k !== 'frame' && x.k !== 'frameZone' && x.k !== 'view'), C('future', 'Montrer les étapes à venir (pointillés)', 'check', {def: true}), C('lineColor', 'Couleur du chemin', 'color', {def: '#c0392b'}), C('dotSize', 'Taille des ronds', 'range', {min: .5, max: 2.5, step: .1, def: 1}),
                C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Oui (sans se chevaucher)'], ['none', 'Aucun']]}), ...COMMON_MAP],
            sample: STORY_SAMPLE, resolve: resolvePts, afterDraw: storyAfterDraw, fromApp: storyApp,
            describe: spec => `Carte qui raconte : ${rows(spec).length} étapes.`},
        icicle: {icon: '🧱', label: 'Descendance en rectangles (icicle)', group: 'Généalogie', render: icicle, legend: 'bottom', fromApp: icicleApp, afterDraw: keepApi,
            grids: [{key: 'rows', label: 'Les personnes (parent → enfant)', cols: [C('name', 'Nom (unique)'), C('parent', 'Parent (vide = l’ancêtre)'), C('year', 'Année'), C('value', 'Chiffre (facultatif)', 'number'), C('gender', 'Sexe', 'select', {choices: [['', '—'], ['male', 'Homme'], ['female', 'Femme']]}), C('color', 'Couleur', 'color')]}],
            options: [C('dir', 'Sens', 'select', {choices: [['', 'De haut en bas (générations en lignes)'], ['right', 'De gauche à droite (générations en colonnes)']]}), C('sizeBy', 'Largeur des cases', 'select', {choices: [['desc', 'Le nombre de descendants'], ['leaves', 'Le nombre de bouts de branche'], ['value', 'Le chiffre (ou la somme)']], def: 'desc'}),
                C('colorBy', 'Couleurs', 'select', {choices: [['', 'Une par branche (plus clair en descendant)'], ['gen', 'Une par génération'], ['gender', 'Selon le sexe']]}), C('depth', 'Générations au plus', 'range', {min: 1, max: 20, def: 8}),
                C('band', 'Hauteur d’une génération', 'range', {unit: 'px', min: 14, max: 120, def: 31, when: s => s.o?.dir !== 'right'}), C('height', 'Hauteur du dessin', 'number', {unit: 'px', min: 160, max: 3000, when: s => s.o?.dir === 'right'}),
                C('labels', 'Dans les cases', 'select', {choices: [['', 'Le nom et l’année'], ['size', 'Le nom et le nombre'], ['none', 'Rien']]}), C('sort', 'Ordre des enfants', 'select', {choices: [['', 'Comme dans le tableau'], ['size', 'Les plus grandes familles d’abord']]}), C('border', 'Traits blancs entre les cases', 'check', {def: true})],
            sample: () => ({o: {title: 'Descendance de Jean Martin', sizeBy: 'desc'}, rows: sampleIcicle()})},
        godnames: {icon: '🎀', label: 'Prénoms transmis (parrain, marraine → filleul)', group: 'Généalogie', render: godnames, legend: 'bottom', fromApp: godApp, afterDraw: keepApi,
            grids: [{key: 'rows', label: 'Les parrains, marraines et filleuls', cols: [C('godparent', 'Parrain ou marraine (Prénom NOM)'), C('godchild', 'Filleul ou filleule (Prénom NOM)'), C('role', 'Rôle', 'select', {choices: [['parrain', 'Parrain'], ['marraine', 'Marraine']]}), C('rel', 'Lien (grand-père, oncle…)'), C('gpYear', 'Né(e) en (parrain)', 'number'), C('gcYear', 'Né(e) en (filleul)', 'number')]}],
            options: [C('show', 'Montrer', 'select', {choices: [['', 'Seulement les prénoms transmis'], ['all', 'Aussi les filleuls au prénom différent']]}), C('maxRows', 'Prénoms au plus (lignes)', 'range', {min: 1, max: 80, def: 15}),
                C('rowHeight', 'Hauteur d’une ligne', 'range', {unit: 'px', min: 24, max: 120, def: 50}), C('dotSize', 'Taille des ronds', 'range', {min: .5, max: 2.5, step: .1, def: 1}), C('names', 'Noms sous les ronds', 'select', {choices: [['', 'Quand il y a la place'], ['all', 'Toujours (sans se chevaucher)'], ['off', 'Jamais']]})],
            sample: GOD_SAMPLE},
        causesun: {icon: '🎗️', label: 'Causes de décès en anneaux (familles puis détail)', group: 'Généalogie', render: causesun, legend: 'bottom', fromApp: causeApp, afterDraw: keepApi,
            grids: [{key: 'rows', label: 'Les causes de décès', series: 1, cols: [C('label', 'Cause du décès'), C('family', 'Grande famille (vide = devinée)'), C('color', 'Couleur', 'color')]}],
            options: [C('guess', 'Deviner les grandes familles d’après les mots', 'check', {def: true}), C('angle', 'Forme', 'select', {choices: [['', 'Cercle complet'], ['half', 'Demi-cercle']]}), C('hole', 'Trou au centre', 'range', {unit: '%', min: 0, max: 60, def: 26}),
                C('inner', 'Épaisseur des grandes familles', 'range', {unit: '%', min: 20, max: 70, def: 42}), C('labels', 'Textes', 'select', {choices: [['', 'Les noms'], ['value', 'Les noms et les nombres'], ['pct', 'Les noms et les pourcentages'], ['none', 'Aucun']]}),
                C('sort', 'Ranger les causes de la plus fréquente à la plus rare', 'check', {def: true}), C('border', 'Traits blancs entre les parts', 'check', {def: true}), H_OPT],
            sample: CAUSE_SAMPLE},
    };
    for (const [k, kind] of Object.entries(NEW)) { if (!K[k]) K[k] = kind; }
    ext.diagramCartes2 = {pointsOf, stepsOf, familyOf, givenOf, sameName, transmissions, causesOf, STORY, showPeople};
})();
