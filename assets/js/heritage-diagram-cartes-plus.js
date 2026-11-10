/* LCNDA — 🗺️ Cartes en plus (vague 1), dans Graphiques → Cartes (s'ajoutent au catalogue de heritage-diagrams-render.js) :
 *  🔤 surnamemap   — Carte des patronymes : où se concentre un nom, siècle par siècle (départements colorés ou ronds) ;
 *  🧬 dnamap       — Carte des cousins ADN : les lieux des ancêtres communs avec les correspondances, couleur par groupe ou par cM ;
 *  🔎 researchmap  — Carte de tes recherches : registres consultés, communes fouillées (battues), trous à couvrir — vert, orange,
 *                    rouge, par sorte d'acte et période ; un clic → ce qui a été vu et ce qui manque ;
 *  🔥 heatdecades  — Carte de chaleur dans le temps : décennie par décennie.
 * Le curseur ▶ des années est celui, commun, de ⚙️ Personnaliser (heritage-diagram-perso.js : kind.time = {range, at}) :
 * pas de deuxième lecteur. Les fonds, projections et cadrages sont ceux des cartes de Graphiques (ext.diagramCartes).
 * Données de l'app : api.php?action=cartes_plus (lib/cartes_plus.php) — jamais un vivant ni une fiche confidentielle ;
 * les noms des correspondances ADN (souvent vivantes) ne sont mis que si on le demande.
 * Clair / sombre, 390 px, export PNG / SVG / PDF et impression L1 : ceux de tous les diagrammes. Test : tests/test-cartes-plus-1.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const DR = ext.diagramRender, GC = ext.diagramCartes; if (!DR?.KINDS || !GC) return;
    const K = DR.KINDS, A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : DR.num(v)), color = DR.color;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r1 = v => Math.round((Number.isFinite(v) ? v : 0) * 10) / 10, r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}), fmt = n => NF.format(Number(n) || 0);
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', halo = ''} = {}) =>
        `<text x="${r1(x)}" y="${r1(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="middle" font-weight="${weight}" fill="${fill}"${halo ? ` stroke="${halo}" stroke-width="${r2(size / 4)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`;
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const rows = (spec, max = 20000) => (Array.isArray(spec.rows) ? spec.rows : []).filter(r => r && typeof r === 'object').slice(0, max);
    const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const pl = (n, one, many = '') => A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`;
    const yearOf = v => { const t = String(v ?? '').trim(); if (!t) return null; const y = DR.when(t, false); return y === null || !Number.isFinite(y) || y < -3000 || y > 3000 ? null : Math.floor(y); };
    const tip = s => `<title>${esc(s)}</title>`;
    const pidsAttr = list => [...new Set(list.map(Number).filter(x => x > 0))].slice(0, 500).join(',');
    const HEAT = ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'];
    const siecle = y => { const c = Math.floor(y / 100) + 1; return `${c}${c === 1 ? 'er' : 'e'} siècle`; };
    let seq = 0;

    /* ═════════ Le fond (celui des cartes de Graphiques) ═════════ */
    function bases(spec, W) {
        const o = spec.o || {}, pre = GC.viewOf(o), b0 = GC.baseIdOf(o, pre), c0 = GC.ctxIdOf(o, b0, pre);
        const w = GC.needBases(spec, W, [b0, c0, 'monde-110m', 'fr-departements']); if (w) return {wait: w};
        return {list: [GC.loaded(b0), c0 ? GC.loaded(c0) : null, GC.loaded('monde-110m')].filter(Boolean), deps: GC.loaded('fr-departements')};
    }
    function frame(spec, W, fs, pts, fillOf = null) {
        const o = spec.o || {}, M = GC.MAPS[GC.mapOf(o)];
        const auto = (!o.frame || o.frame === '') && o.fit !== false && pts.length ? GC.fitView(pts.map(p => ({p})), o) : null;
        const view = GC.viewOf(o, auto || M.view), baseId = GC.baseIdOf(o, view), ctxId = GC.ctxIdOf(o, baseId, view);
        const wait = GC.needBases(spec, W, [baseId, ctxId]); if (wait) return {wait};
        const base = GC.loaded(baseId), ctx = ctxId ? GC.loaded(ctxId) : null, uid = 'cpm' + (++seq);
        const pr = GC.fitProj(o.proj && o.proj !== 'auto' ? o.proj : GC.autoProj(view), view, W, clamp(num(o.height) || 2400, 120, 3000), !num(o.height)); pr.allOutre = true;
        const land = color(o.zoneColor, GC.LAND), B = GC.drawBase({...spec, o: {...o, borderColor: o.borderColor || '#cfcabe'}}, base, ctx, pr, W, pr.h, fillOf || (() => ({fill: land, title: ''})), uid);
        const close = `<text x="${r1(W - 4)}" y="${r1(pr.h - 4)}" font-size="${r2(clamp(fs * .62, 7, 12))}" text-anchor="end" fill="#555" fill-opacity=".85">${esc(GC.attrOf(base, ctx))}</text><rect data-geo-hit="1" width="${r1(W)}" height="${r1(pr.h)}" fill="none" stroke="#c8cdd3" stroke-width=".6"/></g>`;
        return {pr, w: W, h: pr.h, uid, base, open: `<g data-geo-map="${uid}">${B.svg}<g clip-path="url(#${uid}c)">`, close: '</g>' + close, geo: {uid, pr, w: W, h: pr.h}};
    }
    /** une ligne → sa position : « Rennes », « Rennes 48.11, -1.68 », ou spec.places (rempli par « Depuis l'app ») */
    function locate(spec, list, key = 'label') {
        const memo = new Map(), out = [], unknown = new Set();
        rows(spec).forEach(r => {
            const label = str(r[key], 120); if (!label) return;
            let p = memo.get(label); if (p === undefined) { p = GC.placeOf(spec, label, list); memo.set(label, p); }
            if (!p) { if (unknown.size < 30) unknown.add(label.slice(0, 40)); return; }
            out.push({r, lon: p[0], lat: p[1], place: p[2] || label, y: yearOf(r.date ?? r.from), pid: Number(r.pid) > 0 ? Number(r.pid) : 0});
        });
        return {pts: out, unknown: [...unknown]};
    }
    const missing = (unknown, y, fs) => unknown.length ? T(0, y + fs * .7, `⚠ Lieux sans position : ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? '…' : ''}`, {size: fs * .78, fill: '#a5552a'}) : '';
    const emptyMsg = (w, h, fs, msg) => T(w / 2, h / 2, msg, {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
    /** la période montrée : l'année du curseur ▶ (o.__year) ou celle choisie (o.at) ; step = 10 (décennie) ou 100 (siècle) */
    const atOf = (o, step) => { const y = Number.isFinite(o.__year) ? o.__year : String(o.at ?? '').trim() !== '' ? num(o.at) : NaN; return Number.isFinite(y) ? Math.floor(y / step) * step : null; };
    const timeOf = step => ({
        range: spec => { const ys = rows(spec).map(r => yearOf(r.date ?? r.from)).filter(y => y !== null); return ys.length ? [Math.floor(Math.min(...ys) / step) * step, Math.floor(Math.max(...ys) / step) * step] : [NaN, NaN]; },
        at: (spec, y) => { spec.o = {...(spec.o || {}), __year: y, time: {...(spec.o?.time || {}), step}}; return spec; },
    });
    const periodTitle = (a, step) => a === null ? '' : step === 100 ? siecle(a) : `années ${a}`;
    const ramp = (o, def) => o.ramp === 'perso' ? [color(o.lowColor, def[0]), color(o.highColor, def[def.length - 1])] : GC.RAMPS[o.ramp] || def;
    function gradientLegend(uid, stops, w, y0, fs, lo, hi, word) {
        const bw = Math.min(w * .6, 300), x0 = (w - bw) / 2, gid = uid + 'g';
        return {h: y0 + fs * 2.7, svg: `<defs><linearGradient id="${gid}" x1="0" x2="1">${[0, .25, .5, .75, 1].map(s => `<stop offset="${s * 100}%" stop-color="${GC.rampAt(stops, .1 + .9 * s)}"/>`).join('')}</linearGradient></defs><rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(bw)}" height="${r1(fs)}" rx="2" fill="url(#${gid})" stroke="#0002"/>`
            + T(x0, y0 + fs * 1.9, fmt(lo), {size: fs * .8, anchor: 'middle'}) + T(x0 + bw, y0 + fs * 1.9, fmt(hi), {size: fs * .8, anchor: 'middle'}) + T(x0 - 6, y0 + fs / 2, word, {size: fs * .8, anchor: 'end', fill: '#555'})};
    }

    /* ═════════ 🔤 Carte des patronymes ═════════ */
    function surnamemap(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const all = locate(spec, B0.list), at = atOf(o, 100), wanted = fold(o.surname || '');
        const pts = all.pts.filter(p => (!wanted || !p.r.surname || fold(p.r.surname) === wanted) && (at === null || (p.y !== null && p.y >= at && p.y < at + 100)));
        const zones = o.show !== 'dots', stops = ramp(o, GC.RAMPS.oranges || HEAT);
        // départements : n° donné par l'app (colonne « zone ») ou retrouvé d'après le nom
        const dep = new Map(), depPids = new Map();
        if (zones) pts.forEach(p => { let z = str(p.r.zone, 3); if (!z && B0.deps) { const m = GC.zoneOfPlace?.(B0.deps, {name: p.place, lat: p.lat, lon: p.lon}); z = m?.id || ''; } if (!z) return; dep.set(z, (dep.get(z) || 0) + 1); (depPids.get(z) || depPids.set(z, []).get(z)).push(p.pid); });
        const maxD = Math.max(1, ...dep.values());
        const s2 = zones ? {...spec, o: {...o, map: 'fr', level: 'dep'}} : spec;
        const F = frame(s2, W, fs, all.pts.map(p => [p.lon, p.lat]), zones ? z => { const n = dep.get(z.id) || 0; return n ? {fill: GC.rampAt(stops, .12 + .88 * Math.sqrt(n / maxD)), title: `${z.name} (${z.id}) : ${pl(n, 'mention')}`} : {fill: color(o.zoneColor, GC.LAND), title: ''}; } : null);
        if (F.wait) return F.wait;
        const {pr, w, h} = F; let svg = `<g data-c2-total="${pts.length}"></g>` + F.open;
        if (!zones) { // des ronds par lieu, la surface suit le nombre
            const g = new Map(); pts.forEach(p => { const k = `${r2(p.lon)}|${r2(p.lat)}`, x = g.get(k); if (x) x.list.push(p); else g.set(k, {p, list: [p]}); });
            const maxN = Math.max(1, ...[...g.values()].map(x => x.list.length)), rMax = clamp(w / 22, 8, 40) * clamp(num(o.dotSize) || 1, .3, 3);
            [...g.values()].sort((a, b) => b.list.length - a.list.length).forEach(x => { const [cx, cy] = pr.p(x.p.lon, x.p.lat); if (!Number.isFinite(cx)) return; const rr = Math.max(2.5, rMax * Math.sqrt(x.list.length / maxN));
                svg += `<g class="c2-pt" data-c2-pids="${pidsAttr(x.list.map(p => p.pid))}" data-c2-n="${x.list.length}" data-c2-label="${esc(x.p.place)}">${tip(`${x.p.place} : ${pl(x.list.length, 'mention')}\n${x.list.slice(0, 8).map(p => `${str(p.r.name, 60)}${p.y !== null ? ' (' + p.y + ')' : ''}`).join('\n')}`)}<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r2(rr)}" fill="${GC.rampAt(stops, .35 + .65 * Math.sqrt(x.list.length / maxN))}" fill-opacity=".8" stroke="#fff" stroke-width="1"/></g>`; });
        } else { // un point discret par département, pour cliquer (qui est compté)
            const D = B0.deps; if (D) D.zones.forEach(z => { const n = dep.get(z.id); if (!n || z.outre) return; const [cx, cy] = pr.p(z.label[0], z.label[1]); if (!Number.isFinite(cx) || cx < 0 || cx > w || cy < 0 || cy > h) return;
                svg += `<g class="c2-pt" data-c2-pids="${pidsAttr(depPids.get(z.id) || [])}" data-c2-n="${n}" data-c2-label="${esc(z.name)}">${tip(`${z.name} (${z.id}) : ${pl(n, 'mention')}`)}${o.values !== false ? T(cx, cy, fmt(n), {size: clamp(fs * .7, 7, 14), anchor: 'middle', weight: 700, fill: '#1d1d1f', halo: '#ffffffcc'}) : `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="3" fill="#0000"/>`}</g>`; }); }
        const word = periodTitle(at, 100);
        if (word) svg += T(10, 18, word, {size: fs * 1.3, weight: 800, fill: '#1d1d1f', halo: '#ffffffd9'});
        svg += F.close;
        let H = h;
        if (zones && dep.size && o.legend !== 'none') { const L = gradientLegend(F.uid, stops, w, h + fs * .8, fs, 1, maxD, 'mentions par département'); svg += L.svg; H = L.h; }
        if (all.unknown.length && o.showMissing !== false) { svg += missing(all.unknown, H, fs); H += fs * 1.5; }
        if (!pts.length) svg += emptyMsg(w, h, fs, all.pts.length ? `Aucune mention ${word ? 'au ' + word : 'pour ce nom'}.` : 'Choisis un nom dans « Depuis l’app » (ou tape des lieux et des dates).');
        return {h: H, svg, legend: [], geo: F.geo, desc: `Carte du nom ${o.surname || ''} : ${pl(pts.length, 'mention')}${word ? ' au ' + word : ''}${zones ? ` dans ${pl(dep.size, 'département')}` : ''}.`};
    }

    /* ═════════ 🔥 Carte de chaleur dans le temps ═════════ */
    function heatdecades(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const all = locate(spec, B0.list), at = atOf(o, 10), cumul = o.window === 'cumul';
        const pts = all.pts.filter(p => at === null || (p.y !== null && (cumul ? p.y < at + 10 : p.y >= at && p.y < at + 10)));
        const F = frame(spec, W, fs, all.pts.map(p => [p.lon, p.lat])); if (F.wait) return F.wait;
        const {pr, w, h} = F, cell = clamp(w / clamp(num(o.cells) || 70, 20, 160), 3, 30), nx = Math.ceil(w / cell), ny = Math.ceil(h / cell), grid = new Float32Array(nx * ny);
        pts.forEach(p => { const [x, y] = pr.p(p.lon, p.lat); if (!Number.isFinite(x) || x < 0 || y < 0 || x >= w || y >= h) return; grid[Math.floor(y / cell) * nx + Math.floor(x / cell)] += 1; });
        // flou gaussien séparable (rayon en cases)
        const rad = clamp(Math.round(num(o.radius) || 2), 1, 6), ker = Array.from({length: rad * 2 + 1}, (_, i) => Math.exp(-((i - rad) ** 2) / (2 * (rad / 1.6) ** 2)));
        const tmp = new Float32Array(nx * ny), out = new Float32Array(nx * ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let k = -rad; k <= rad; k++) { const ii = i + k; if (ii >= 0 && ii < nx) s += grid[j * nx + ii] * ker[k + rad]; } tmp[j * nx + i] = s; }
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let k = -rad; k <= rad; k++) { const jj = j + k; if (jj >= 0 && jj < ny) s += tmp[jj * nx + i] * ker[k + rad]; } out[j * nx + i] = s; }
        // l'échelle : fixe sur toutes les décennies (sinon une décennie vide paraîtrait aussi chaude qu'une pleine)
        let max = 0; if (o.scale !== 'each') { const full = new Float32Array(nx * ny); all.pts.forEach(p => { const [x, y] = pr.p(p.lon, p.lat); if (Number.isFinite(x) && x >= 0 && y >= 0 && x < w && y < h) full[Math.floor(y / cell) * nx + Math.floor(x / cell)] += 1; }); const tot = Math.max(1, all.pts.length), part = Math.max(1, pts.length);
            for (let k = 0; k < out.length; k++) if (out[k] > max) max = out[k]; max = Math.max(max, Math.max(...full) * (cumul ? 1 : part / tot) * ker[rad] ** 2 * 1.5); }
        else for (let k = 0; k < out.length; k++) if (out[k] > max) max = out[k];
        max = max || 1;
        const stops = ramp(o, HEAT), opa = clamp(num(o.opacity) || 85, 10, 100) / 100;
        let svg = `<g data-c2-total="${pts.length}"></g>` + F.open + `<defs><filter id="${F.uid}b" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${r2(cell * .7)}"/></filter></defs><g filter="url(#${F.uid}b)" opacity="${r2(opa)}">`;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = out[j * nx + i] / max; if (v < .04) continue; const t = clamp(Math.sqrt(v), 0, 1); svg += `<rect x="${r1(i * cell)}" y="${r1(j * cell)}" width="${r1(cell + .6)}" height="${r1(cell + .6)}" fill="${GC.rampAt(stops, t)}" fill-opacity="${r2(.25 + .75 * t)}"/>`; }
        svg += '</g>';
        const word = at === null ? '' : cumul ? `jusqu’en ${at + 9}` : `années ${at}`;
        if (word && (!Number.isFinite(o.__year) || cumul)) svg += T(10, 18, word, {size: fs * 1.3, weight: 800, fill: '#1d1d1f', halo: '#ffffffd9'}); // pendant la lecture ▶, l'année est déjà écrite dans le coin
        svg += F.close;
        let H = h; if (o.legend !== 'none') { const L = gradientLegend(F.uid, stops, w, h + fs * .8, fs, 0, 1, 'peu → beaucoup'); svg += L.svg.replace(/>0</, '>peu<').replace(/>1</, '>beaucoup<'); H = L.h; }
        if (all.unknown.length && o.showMissing !== false) { svg += missing(all.unknown, H, fs); H += fs * 1.5; }
        if (!all.pts.length) svg += emptyMsg(w, h, fs, 'Prends les événements de ton arbre (« Depuis l’app »).');
        return {h: H, svg, legend: [], geo: F.geo, desc: `Carte de chaleur : ${pl(pts.length, 'événement')}${word ? ' (' + word + ')' : ''}.`};
    }

    /* ═════════ 🧬 Carte des cousins ADN ═════════ */
    function dnamap(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const all = locate(spec, B0.list), F = frame(spec, W, fs, all.pts.map(p => [p.lon, p.lat])); if (F.wait) return F.wait;
        const {pr, w, h} = F, byCm = o.colorBy === 'cm', stops = ramp(o, GC.RAMPS.bleus || HEAT);
        const cms = all.pts.map(p => num(p.r.cm)).filter(v => v > 0), lo = cms.length ? Math.min(...cms) : 0, hi = cms.length ? Math.max(...cms) : 1;
        const groups = new Map(); all.pts.forEach(p => { const g = str(p.r.group, 60) || 'Sans groupe'; if (!groups.has(g)) groups.set(g, color(p.r.color, DR.PALETTES.vive[groups.size % DR.PALETTES.vive.length])); });
        const colOf = p => byCm ? GC.rampAt(stops, .25 + .75 * (hi > lo ? (num(p.r.cm) - lo) / (hi - lo) : 1)) : groups.get(str(p.r.group, 60) || 'Sans groupe');
        const g = new Map(); all.pts.forEach(p => { const k = `${r2(p.lon)}|${r2(p.lat)}`, x = g.get(k); if (x) x.list.push(p); else g.set(k, {p, list: [p]}); });
        const R0 = clamp(w / 90, 3, 9) * clamp(num(o.dotSize) || 1, .4, 3);
        let svg = `<g data-c2-total="${all.pts.length}"></g>` + F.open;
        [...g.values()].sort((a, b) => b.list.length - a.list.length).forEach(x => {
            const [cx, cy] = pr.p(x.p.lon, x.p.lat); if (!Number.isFinite(cx)) return;
            const matches = [...new Set(x.list.map(p => str(p.r.match, 80)))];
            const title = `${x.p.place}\n${x.list.slice(0, 10).map(p => `${str(p.r.ancestor, 60)}${p.y !== null ? ' (' + p.y + ')' : ''} — ${str(p.r.match, 60)}${num(p.r.cm) ? ' · ' + fmt(num(p.r.cm)) + ' cM' : ''}`).join('\n')}${x.list.length > 10 ? '\n…' : ''}`;
            let dots = ''; x.list.forEach((p, i) => { const a = i * 2.39996, rr = R0 * 1.1 * Math.sqrt(i); dots += `<circle cx="${r1(cx + Math.cos(a) * rr)}" cy="${r1(cy + Math.sin(a) * rr)}" r="${r2(R0)}" fill="${colOf(p)}" fill-opacity=".9" stroke="#fff" stroke-width="1"/>`; });
            svg += `<g class="c2-pt" data-c2-pids="${pidsAttr(x.list.map(p => p.pid))}" data-c2-n="${matches.length}" data-c2-label="${esc(x.p.place)}">${tip(title)}${dots}</g>`;
            if (o.placeLabels !== 'none' && x.list.length >= (o.placeLabels === 'all' ? 1 : 2)) svg += T(cx + R0 * 1.4 * Math.sqrt(x.list.length) + 3, cy, x.p.place, {size: clamp(fs * .75, 7, 16), weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'});
        });
        svg += F.close;
        let H = h; const legend = byCm ? [] : [...groups].slice(0, 16).map(([label, c]) => ({label, color: c}));
        if (byCm && cms.length) { const L = gradientLegend(F.uid, stops, w, h + fs * .8, fs, lo, hi, 'cM partagés'); svg += L.svg; H = L.h; }
        if (all.unknown.length && o.showMissing !== false) { svg += missing(all.unknown, H, fs); H += fs * 1.5; }
        if (!all.pts.length) svg += emptyMsg(w, h, fs, 'Relie des correspondances ADN à leur fiche (onglet ADN), puis « Depuis l’app ».');
        return {h: H, svg, legend, geo: F.geo, desc: `Carte des cousins ADN : ${pl(all.pts.length, 'lieu d’ancêtre commun', 'lieux d’ancêtres communs')}.`};
    }

    /* ═════════ 🔎 Carte de tes recherches ═════════ */
    const STATE = {seen: ['#2e9d4f', 'Vu'], partial: ['#e08a1e', 'En partie, à revoir'], todo: ['#d23b2f', 'Prévu, pas fait'], missing: ['#d23b2f', 'À chercher']};
    const RTYPES = [['', 'Toutes les sortes d’actes'], ['naissance', 'Naissances et baptêmes'], ['mariage', 'Mariages'], ['deces', 'Décès et sépultures'], ['recensement', 'Recensements'], ['tables', 'Tables décennales'], ['autre', 'Autres']];
    const RESEARCH = new Map();
    function researchCommunes(spec, list) {
        const o = spec.o || {}, from = String(o.from ?? '').trim() ? num(o.from) : null, to = String(o.to ?? '').trim() ? num(o.to) : null;
        const memo = new Map(), C2 = new Map(), unknown = new Set();
        rows(spec).forEach(r => {
            if (o.rtype && str(r.type, 20) !== o.rtype) return;
            const a = yearOf(r.from), b = yearOf(r.to) ?? a;
            if ((from !== null && b !== null && b < from) || (to !== null && a !== null && a > to)) return;
            const label = str(r.label, 120); if (!label) return;
            let p = memo.get(label); if (p === undefined) { p = GC.placeOf(spec, label, list); memo.set(label, p); }
            if (!p) { if (unknown.size < 30) unknown.add(label); return; }
            const k = `${r2(p[0])}|${r2(p[1])}|${fold(label)}`, c = C2.get(k) || {name: p[2] || label, lon: p[0], lat: p[1], items: []}; c.items.push(r); C2.set(k, c);
        });
        C2.forEach(c => { const st = new Set(c.items.map(r => STATE[r.state] ? r.state : 'missing')); const bad = st.has('missing') || st.has('todo');
            c.state = st.has('seen') ? (bad || st.has('partial') ? 'orange' : 'green') : st.has('partial') && !bad ? 'orange' : bad && st.has('partial') ? 'orange' : 'red'; });
        return {list: [...C2.values()], unknown: [...unknown]};
    }
    const SC = {green: ['#2e9d4f', 'Tout vu'], orange: ['#e08a1e', 'En partie'], red: ['#d23b2f', 'Trous à couvrir']};
    function researchmap(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const R = researchCommunes(spec, B0.list), F = frame(spec, W, fs, R.list.map(c => [c.lon, c.lat])); if (F.wait) return F.wait;
        const {pr, w, h} = F, id = 'cpr' + (++seq); RESEARCH.set(id, R.list); if (RESEARCH.size > 30) RESEARCH.delete(RESEARCH.keys().next().value);
        const R0 = clamp(w / 110, 3.5, 10) * clamp(num(o.dotSize) || 1, .4, 3);
        let svg = `<g data-c2-total="${R.list.length}"></g>` + F.open + `<g data-cpr="${id}">`;
        const order = {red: 0, orange: 1, green: 2};
        R.list.map((c, i) => ({c, i})).sort((a, b) => order[b.c.state] - order[a.c.state]).forEach(({c, i}) => {
            const [cx, cy] = pr.p(c.lon, c.lat); if (!Number.isFinite(cx)) return;
            const n = c.items.length, rr = R0 * (1 + Math.min(1.4, Math.log10(n + 1)));
            const seen = c.items.filter(r => r.state === 'seen').length;
            svg += `<g class="cpr-c" data-cpr-i="${i}" tabindex="0" role="button" aria-label="${esc(c.name)} : ${esc(SC[c.state][1])}">${tip(`${c.name} — ${SC[c.state][1]}\n${pl(seen, 'recherche vue', 'recherches vues')}, ${pl(n - seen, 'à faire ou à revoir', 'à faire ou à revoir')}\nClic : le détail`)}<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r2(rr)}" fill="${SC[c.state][0]}" fill-opacity=".88" stroke="#fff" stroke-width="1.2"/></g>`;
            if (o.placeLabels !== 'none' && (o.placeLabels === 'all' || c.state === 'red' || n > 2)) svg += T(cx + rr + 3, cy, c.name, {size: clamp(fs * .72, 7, 15), weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'});
        });
        svg += '</g>' + F.close;
        let H = h; if (R.unknown.length && o.showMissing !== false) { svg += missing(R.unknown, H, fs); H += fs * 1.5; }
        if (!R.list.length) svg += emptyMsg(w, h, fs, rows(spec).length ? 'Rien pour ce choix (sorte d’acte, période).' : 'Prends tes dépouillements, battues et trous (« Depuis l’app »).');
        const cnt = s => R.list.filter(c => c.state === s).length;
        return {h: H, svg, legend: ['green', 'orange', 'red'].map(s => ({label: `${SC[s][1]} (${cnt(s)})`, color: SC[s][0]})), geo: F.geo,
            desc: `Carte de tes recherches : ${pl(R.list.length, 'commune')} — ${cnt('green')} tout vu, ${cnt('orange')} en partie, ${cnt('red')} avec des trous.`};
    }
    /** un clic sur une commune : ce qui a été vu, ce qui manque */
    function researchDialog(g) {
        const list = RESEARCH.get(g.closest('[data-cpr]')?.getAttribute('data-cpr')); const c = list?.[Number(g.getAttribute('data-cpr-i'))]; if (!c) return;
        const line = r => { const s = STATE[r.state] || STATE.missing, y = [r.from, r.to].filter(v => String(v ?? '').trim()).filter((v, i, a) => a.indexOf(v) === i).join('–');
            let open = ''; try { const op = JSON.parse(r.open || 'null'); if (Array.isArray(op) && op[0] && Number(op[1])) open = `<button type="button" class="link-button" data-rj-open="${esc(JSON.stringify({kind: op[0], id: Number(op[1])}))}">↗ Ouvrir</button>`; } catch (_) {}
            if (!open && Number(r.pid) > 0) open = `<button type="button" class="link-button" data-cpr-person="${Number(r.pid)}">↗ Fiche</button>`;
            return `<li><span class="cpr-dot" style="background:${s[0]}"></span><span><b>${esc(r.act || RTYPES.find(x => x[0] === r.type)?.[1] || 'Recherche')}</b>${y ? ` · ${esc(y)}` : ''} — ${esc(s[1])}<br><small class="muted">${esc([r.src, r.what].filter(Boolean).join(' · '))}</small></span>${open}</li>`; };
        const seen = c.items.filter(r => r.state === 'seen'), rest = c.items.filter(r => r.state !== 'seen');
        const body = `<div class="cpr-dialog"><p>${window.LCNDA_UI?.badge ? window.LCNDA_UI.badge(SC[c.state][1], c.state === 'green' ? 'green' : c.state === 'orange' ? 'yellow' : 'red') : esc(SC[c.state][1])}</p>
            <h3>✓ Ce qui a été vu</h3>${seen.length ? `<ul class="cpr-list">${seen.map(line).join('')}</ul>` : (A()?.empty ? A().empty('Rien de vu ici pour l’instant.', {icon: '🔎'}) : '<p>Rien de vu ici pour l’instant.</p>')}
            <h3>⚠️ Ce qui manque ou reste à revoir</h3>${rest.length ? `<ul class="cpr-list">${rest.map(line).join('')}</ul>` : (A()?.empty ? A().empty('Rien ne manque ici.', {icon: '✓'}) : '<p>Rien ne manque ici.</p>')}</div>`;
        if (ext.openDialog) ext.openDialog({eyebrow: 'CARTE DE TES RECHERCHES', title: c.name, body, submitLabel: 'Fermer', onSubmit: () => true});
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('click', e => {
            const pb = e.target.closest?.('[data-cpr-person]'); if (pb) { document.querySelectorAll('dialog[open]').forEach(d => { if (d.contains(pb)) d.close(); }); A()?.openPersonById?.(Number(pb.dataset.cprPerson)); return; }
            const g = e.target.closest?.('.cpr-c'); if (!g || g.closest('.h-dg-mini')) return; e.preventDefault(); researchDialog(g);
        });
        document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.cpr-c')) { e.preventDefault(); researchDialog(e.target.closest('.cpr-c')); } });
    }

    /* ═════════ « Depuis l'app » ═════════ */
    const get = q => A().api('cartes_plus', q);
    /** les lieux de la réponse → spec.places (positions), et le nom affiché de chaque lieu (homonymes : « Saint-Martin (Gers) ») */
    function placesOf(spec, places) {
        const cnt = new Map(); Object.values(places).forEach(p => cnt.set(fold(p[0]), (cnt.get(fold(p[0])) || 0) + 1));
        const names = new Map(); spec.places = {};
        Object.entries(places).forEach(([id, p]) => { const n = cnt.get(fold(p[0])) > 1 && p[4] ? `${p[0]} (${p[4]})` : p[0]; names.set(Number(id), n); spec.places[fold(n)] = {lat: p[2], lon: p[3], n}; });
        return names;
    }
    const pane = (title, help, form) => `<div class="h-dg-app cp-app"><h4>${title}</h4><p class="muted">${help}</p><div class="c2-form">${form}<button type="button" class="button small" data-cp-go>Prendre ces données</button><p class="c2-msg" data-cp-msg role="status"></p></div></div>`;
    function bindGo(box, run) {
        const b = box.querySelector('[data-cp-go]'), msg = box.querySelector('[data-cp-msg]');
        b?.addEventListener('click', async () => { b.disabled = true; msg.innerHTML = window.LCNDA_UI.spinner('Lecture de ta généalogie…', {inline: true});
            try { const t = await run(); if (msg.isConnected) msg.textContent = t ? '✓ ' + t : ''; A().toast?.(t ? '✓ ' + t : 'Données prises dans l’app.'); } catch (e) { msg.textContent = '⚠️ ' + (e.message || e); } finally { b.disabled = false; } });
    }
    const EV = '<label>Quels événements<select data-cp="ev"><option value="all">Naissances, mariages, décès, résidences</option><option value="births">Naissances (ou baptêmes)</option><option value="marriages">Mariages</option><option value="deaths">Décès (ou sépultures)</option><option value="residences">Résidences et recensements</option></select></label>';
    const surnameApp = {
        html: spec => pane('🔤 Un nom de ta généalogie', 'Choisis un nom dans la liste (les plus fréquents d’abord) ou une personne : son nom est pris. Jamais un vivant ni une fiche confidentielle.',
            `<label>Nom de famille<select data-cp="name"><option value="">Chargement…</option></select></label><div class="cp-pick"><span class="pk-lab">ou une personne</span>${(window.LCNDA_PICKER || A()).pickerField?.({name: 'cp_person', hiddenName: false, kind: 'person'}) || ''}</div>
            ${EV}<label class="checkbox-line"><input type="checkbox" data-cp="variants"> Avec les variantes du même groupe de noms</label>`),
        bind: (box, io) => {
            const sel = box.querySelector('[data-cp="name"]');
            get({what: 'surnames'}).then(r => { const cur = io.spec().o?.surname || ''; sel.innerHTML = (r.surnames || []).length ? (r.surnames || []).map(s => `<option value="${esc(s.n)}" ${fold(s.n) === fold(cur) ? 'selected' : ''}>${esc(s.n)} (${s.c})</option>`).join('') : '<option value="">Aucun nom</option>'; }).catch(() => { sel.innerHTML = '<option value="">—</option>'; });
            box.addEventListener('picker-change', async e => { const it = e.detail?.item; if (!it || e.detail.name !== 'cp_person' || !Number(it.id)) return;
                try { const d = await A().api('person', {id: Number(it.id)}); const n = String(d?.person?.last_name || '').toUpperCase(); if (n) { if (![...sel.options].some(x => fold(x.value) === fold(n))) sel.insertAdjacentHTML('afterbegin', `<option value="${esc(n)}">${esc(n)}</option>`); sel.value = [...sel.options].find(x => fold(x.value) === fold(n)).value; } } catch (_) {} });
            bindGo(box, async () => {
                const name = sel.value; if (!name) throw new Error('Choisis un nom.');
                const r = await get({what: 'surname', name, ev: box.querySelector('[data-cp="ev"]').value, variants: box.querySelector('[data-cp="variants"]').checked ? 1 : ''});
                const s = io.spec(), names = placesOf(s, r.places || {});
                s.rows = (r.events || []).filter(e => names.has(e[1])).map(([p, plc, y]) => ({label: names.get(plc), date: y === null ? '' : String(y), name: r.people?.[p] || '', pid: p, zone: (r.places[plc] || [])[1] || '', surname: r.name}));
                s.o = {...(s.o || {}), surname: r.name, title: `Le nom ${r.name}, siècle par siècle`, subtitle: r.variants?.length ? `Avec ${r.variants.join(', ')}` : '', time: {...(s.o?.time || {}), show: true, step: 100}};
                if (!s.rows.length) throw new Error('Aucun événement avec un lieu pour ce nom.');
                io.apply(s); return `${pl(s.rows.length, 'mention')} du nom ${r.name}.`;
            });
        },
    };
    const heatApp = {
        html: () => pane('🔥 Les événements de ton arbre', 'Chaque événement daté qui a un lieu compte. Le curseur ▶ passe les décennies une à une.', EV),
        bind: (box, io) => bindGo(box, async () => {
            const r = await get({what: 'heat', ev: box.querySelector('[data-cp="ev"]').value});
            const s = io.spec(), names = placesOf(s, r.places || {});
            s.rows = (r.events || []).filter(e => names.has(e[1])).map(([p, plc, y]) => ({label: names.get(plc), date: String(y), name: r.people?.[p] || '', pid: p}));
            if (!s.rows.length) throw new Error('Aucun événement daté avec un lieu.');
            s.o = {...(s.o || {}), time: {...(s.o?.time || {}), show: true, step: 10}}; io.apply(s); return `${pl(s.rows.length, 'événement')}.`;
        }),
    };
    const dnaApp = {
        html: () => pane('🧬 Tes correspondances ADN', 'Les correspondances reliées à une fiche de l’arbre (onglet ADN) : l’ancêtre commun calculé et ses lieux. Les noms des correspondances (souvent vivantes) ne sont mis que si tu le demandes.',
            '<label>Test ADN<select data-cp="kit"><option value="">Chargement…</option></select></label><label class="checkbox-line"><input type="checkbox" data-cp="names"> Écrire le nom des correspondances (pas pour un export partagé)</label>'),
        bind: (box, io) => {
            const sel = box.querySelector('[data-cp="kit"]');
            get({what: 'dna'}).then(r => { sel.innerHTML = (r.kits || []).map(k => `<option value="${k.id}">${esc(k.name || 'Test n° ' + k.id)}</option>`).join('') || '<option value="">Aucun test ADN</option>'; }).catch(() => { sel.innerHTML = '<option value="">—</option>'; });
            bindGo(box, async () => {
                const r = await get({what: 'dna', kit: sel.value || '', names: box.querySelector('[data-cp="names"]').checked ? 1 : ''});
                const s = io.spec(), names = placesOf(s, r.places || {}); s.rows = [];
                (r.matches || []).forEach(m => m.anc.forEach(a => (r.anc_places?.[a.id] || []).forEach(([plc, y]) => { if (!names.has(plc)) return;
                    const g = r.groups?.[m.group]; s.rows.push({label: names.get(plc), date: y === null ? '' : String(y), ancestor: a.name, match: m.name, group: g?.name || '', color: g?.color || '', cm: m.cm, pid: a.id}); })));
                const seen = new Set(); s.rows = s.rows.filter(x => { const k = `${x.label}|${x.ancestor}|${x.match}`; if (seen.has(k)) return false; seen.add(k); return true; });
                if (!s.rows.length) throw new Error('Aucun ancêtre commun avec un lieu : relie des correspondances à leur fiche dans l’onglet ADN.');
                io.apply(s); return `${pl((r.matches || []).length, 'correspondance')}, ${pl(s.rows.length, 'lieu', 'lieux')}.`;
            });
        },
    };
    const researchApp = {
        html: () => pane('🔎 Tes recherches', 'Les dépouillements (registres consultés), les communes des battues et les actes qui manquent à tes ancêtres (« Que manque-t-il ? »).', ''),
        bind: (box, io) => bindGo(box, async () => {
            const r = await get({what: 'research'}); const s = io.spec(); s.places = {}; s.rows = [];
            (r.communes || []).forEach(c => { s.places[fold(c.name)] = {lat: c.lat, lon: c.lon, n: c.name}; c.items.forEach(it => s.rows.push({label: c.name, type: it.type, act: it.label || '', from: it.from ?? '', to: it.to ?? '', state: it.state, src: it.src || '', what: it.what || '', open: it.open ? JSON.stringify(it.open) : '', pid: it.pid || ''})); });
            if (!s.rows.length) throw new Error('Aucune recherche ni aucun trou avec une commune placée.');
            io.apply(s); return `${pl((r.communes || []).length, 'commune')}, ${pl(s.rows.length, 'ligne')}.`;
        }),
    };

    /* ═════════ Exemples (sans l'app) ═════════ */
    const SAMPLE_PLACES = {Auch: [43.646, .586], Lectoure: [43.934, .622], Condom: [43.958, .372], Mirande: [43.515, .404], Toulouse: [43.604, 1.444], Bordeaux: [44.837, -.579], Agen: [44.203, .616], Paris: [48.857, 2.352], Tarbes: [43.233, .078], Pau: [43.295, -.370], Montauban: [44.018, 1.355], Lyon: [45.764, 4.836]};
    const sp = n => `${n} ${SAMPLE_PLACES[n][0]}, ${SAMPLE_PLACES[n][1]}`;
    const ZONE = {Auch: '32', Lectoure: '32', Condom: '32', Mirande: '32', Toulouse: '31', Bordeaux: '33', Agen: '47', Paris: '75', Tarbes: '65', Pau: '64', Montauban: '82', Lyon: '69'};
    const sampleSurname = () => { const out = []; const plan = [[1620, ['Lectoure', 'Lectoure', 'Condom']], [1710, ['Lectoure', 'Auch', 'Condom', 'Mirande', 'Auch']], [1790, ['Auch', 'Auch', 'Mirande', 'Toulouse', 'Agen', 'Tarbes']], [1850, ['Toulouse', 'Toulouse', 'Bordeaux', 'Auch', 'Montauban', 'Pau', 'Agen']], [1920, ['Paris', 'Toulouse', 'Bordeaux', 'Lyon', 'Paris', 'Paris']]];
        plan.forEach(([y, l]) => l.forEach((n, i) => out.push({label: sp(n), date: String(y + i * 9), name: `Jean DUPOUY`, zone: ZONE[n], surname: 'DUPOUY'}))); return out; };
    const sampleHeat = () => { const out = []; Object.keys(SAMPLE_PLACES).forEach((n, k) => { for (let i = 0; i < 4 + (k % 4) * 3; i++) out.push({label: sp(n), date: String(1700 + ((k * 37 + i * 23) % 230)), name: ''}); }); return out; };
    const sampleDna = () => [['Lectoure', 'Pierre DUPOUY', 'Correspondance n° 1', 'Côté père', '#4e79a7', 212, 1745], ['Auch', 'Marie LABARTHE', 'Correspondance n° 2', 'Côté père', '#4e79a7', 96, 1760], ['Agen', 'Jeanne SOUBIRAN', 'Correspondance n° 3', 'Côté mère', '#e15759', 54, 1788],
        ['Tarbes', 'Bernard CASTÉRA', 'Correspondance n° 4', 'Côté mère', '#e15759', 31, 1702], ['Lectoure', 'Pierre DUPOUY', 'Correspondance n° 5', 'Côté père', '#4e79a7', 140, 1745]].map(([p, a, m, g, c, cm, y]) => ({label: sp(p), ancestor: a, match: m, group: g, color: c, cm, date: String(y)}));
    const sampleResearch = () => [['Lectoure', 'naissance', 1780, 1792, 'seen', 'Registres paroissiaux'], ['Lectoure', 'mariage', 1793, 1802, 'missing', 'À chercher'], ['Auch', 'deces', 1850, 1860, 'seen', 'État civil'], ['Condom', 'naissance', 1700, 1720, 'partial', 'Registre abîmé'],
        ['Mirande', 'recensement', 1836, 1872, 'missing', 'À chercher'], ['Agen', 'mariage', 1810, 1820, 'todo', 'Prévu'], ['Tarbes', 'tables', 1802, 1812, 'seen', 'Tables décennales']].map(([p, type, from, to, state, src]) => ({label: sp(p), type, from: String(from), to: String(to), state, src, act: RTYPES.find(x => x[0] === type)?.[1] || ''}));

    /* ═════════ Les sortes ═════════ */
    async function resolve(spec) {
        const s = await GC.resolve(spec), o = s.o || {}, pre = GC.viewOf(o), b0 = GC.baseIdOf(o, pre);
        await Promise.all([b0, GC.ctxIdOf(o, b0, pre), 'monde-110m', 'fr-departements'].filter(Boolean).map(id => GC.load(id).catch(() => {})));
        const list = [GC.loaded(b0), GC.loaded('monde-110m')].filter(Boolean), pts = rows(s).map(r => GC.placeOf(s, str(r.label, 120), list)).filter(Boolean);
        if (pts.length && !o.frame && o.fit !== false) { const v = GC.fitView(pts.map(p => ({p: [p[0], p[1]]})), o), b = GC.baseIdOf(o, v); await Promise.all([b, GC.ctxIdOf(o, b, v)].filter(Boolean).map(id => GC.load(id).catch(() => {}))); }
        return s;
    }
    const afterDraw = (prev, api) => { GC.afterDraw(prev, api); prev._c2Api = api; };
    const mapOpts = (GC.mapOpts?.() || []).filter(x => !['level'].includes(x.k));
    const COMMON = [C('fit', 'Cadrer tout seul sur les points', 'check', {def: true, when: s => !s.o?.frame}), C('zoneColor', 'Couleur des terres', 'color', {def: GC.LAND}), C('borderColor', 'Couleur des limites', 'color', {def: '#cfcabe'}), C('showMissing', 'Signaler les lieux sans position', 'check', {def: true})];
    const RAMP = C('ramp', 'Couleurs', 'select', {choices: [['', 'Comme le type'], ...Object.keys(GC.RAMPS || {}).map(k => [k, k[0].toUpperCase() + k.slice(1)]), ['perso', 'Mes deux couleurs…']]});
    const PERSO = [C('lowColor', 'Couleur de « peu »', 'color', {def: '#fff3e6', when: s => s.o?.ramp === 'perso'}), C('highColor', 'Couleur de « beaucoup »', 'color', {def: '#7f2704', when: s => s.o?.ramp === 'perso'})];
    const NEW = {
        surnamemap: {icon: '🔤', label: 'Carte des patronymes (siècle par siècle)', group: 'Cartes', render: GC.remember(surnamemap), noLegend: true, time: timeOf(100),
            grids: [{key: 'rows', label: 'Les mentions du nom (une par ligne)', cols: [C('label', 'Lieu (« Auch », « Auch 43.65, 0.59 »)'), C('date', 'Date ou année', 'text', {ph: '1745'}), C('name', 'Personne'), C('zone', 'N° du département'), C('surname', 'Nom')]}],
            options: [C('surname', 'Nom montré (vide = toutes les lignes)'), C('geopat', '🔤 Ce nom sur Géopatronyme (1891-1990) ↗', 'link', {href: s => s.o?.surname && window.LCNDA_SO4 ? window.LCNDA_SO4.url('geopatronyme', {last: s.o.surname}, (() => { try { return JSON.parse(localStorage.getItem('genealogie-sources-ouvertes-4-sites') || '{}'); } catch (_) { return {}; } })()) : '', hint: 'Choisis un nom : un lien ouvrira sa répartition en France de 1891 à 1990 (Géopatronyme).'}), C('show', 'Dessin', 'select', {choices: [['', 'Départements colorés'], ['dots', 'Des ronds par lieu']]}), C('at', 'Siècle montré (une année ; vide = tous)', 'text', {ph: '1700'}),
                C('values', 'Écrire le nombre sur les départements', 'check', {def: true, when: s => s.o?.show !== 'dots'}), C('dotSize', 'Taille des ronds', 'range', {min: .3, max: 3, step: .1, def: 1, when: s => s.o?.show === 'dots'}),
                RAMP, ...PERSO, C('legend', 'Légende', 'select', {choices: [['', 'En dessous'], ['none', 'Aucune']]}), ...mapOpts, ...COMMON],
            sample: () => ({o: {title: 'Le nom DUPOUY, siècle par siècle', surname: 'DUPOUY', map: 'fr', time: {show: true, step: 100}}, rows: sampleSurname()}),
            resolve, afterDraw, fromApp: surnameApp, describe: spec => `Carte des patronymes : ${rows(spec).length} mentions.`},
        heatdecades: {icon: '🔥', label: 'Carte de chaleur dans le temps (décennie par décennie)', group: 'Cartes', render: GC.remember(heatdecades), noLegend: true, time: timeOf(10),
            grids: [{key: 'rows', label: 'Les événements (un par ligne)', cols: [C('label', 'Lieu (« Auch », « Auch 43.65, 0.59 »)'), C('date', 'Date ou année', 'text', {ph: '1745'}), C('name', 'Personne')]}],
            options: [C('at', 'Décennie montrée (une année ; vide = toutes)', 'text', {ph: '1780'}), C('window', 'Chaque image montre', 'select', {choices: [['', 'La décennie seule'], ['cumul', 'Tout jusqu’à cette décennie']]}),
                C('scale', 'Échelle', 'select', {choices: [['', 'La même pour toutes les décennies'], ['each', 'Propre à chaque décennie']]}), C('cells', 'Finesse (cases sur la largeur)', 'range', {min: 20, max: 160, def: 70}),
                C('radius', 'Étalement', 'range', {min: 1, max: 6, def: 2}), C('opacity', 'Opacité', 'range', {unit: '%', min: 10, max: 100, def: 85}), RAMP, ...PERSO, C('legend', 'Légende', 'select', {choices: [['', 'En dessous'], ['none', 'Aucune']]}), ...mapOpts, ...COMMON],
            sample: () => ({o: {title: 'Où vivait la famille, décennie par décennie', map: 'fr', time: {show: true, step: 10}}, rows: sampleHeat()}),
            resolve, afterDraw, fromApp: heatApp, describe: spec => `Carte de chaleur : ${rows(spec).length} événements.`},
        dnamap: {icon: '🧬', label: 'Carte des cousins ADN (lieux des ancêtres communs)', group: 'Cartes', render: GC.remember(dnamap), legend: 'bottom',
            grids: [{key: 'rows', label: 'Les lieux des ancêtres communs', cols: [C('label', 'Lieu'), C('ancestor', 'Ancêtre commun'), C('match', 'Correspondance'), C('group', 'Groupe'), C('color', 'Couleur du groupe', 'color'), C('cm', 'cM partagés', 'number'), C('date', 'Année')]}],
            options: [C('colorBy', 'Couleur', 'select', {choices: [['', 'Selon le groupe'], ['cm', 'Selon les cM partagés']]}), C('dotSize', 'Taille des ronds', 'range', {min: .4, max: 3, step: .1, def: 1}),
                C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Là où plusieurs correspondances'], ['all', 'Tous'], ['none', 'Aucun']]}), RAMP, ...PERSO, ...mapOpts, ...COMMON],
            sample: () => ({o: {title: 'Mes cousins ADN : où vivaient nos ancêtres communs', map: 'fr'}, rows: sampleDna()}),
            resolve, afterDraw, fromApp: dnaApp, describe: spec => `Carte des cousins ADN : ${rows(spec).length} lieux.`},
        researchmap: {icon: '🔎', label: 'Carte de tes recherches (vu, en partie, trous)', group: 'Cartes', render: GC.remember(researchmap), legend: 'bottom',
            grids: [{key: 'rows', label: 'Les recherches, commune par commune', cols: [C('label', 'Commune'), C('type', 'Sorte', 'select', {choices: RTYPES.slice(1)}), C('act', 'Acte'), C('from', 'De l’année'), C('to', 'À l’année'),
                C('state', 'État', 'select', {choices: [['seen', 'Vu'], ['partial', 'En partie, à revoir'], ['todo', 'Prévu, pas fait'], ['missing', 'À chercher']]}), C('src', 'D’où'), C('what', 'Détail')]}],
            options: [C('rtype', 'Sorte d’acte', 'select', {choices: RTYPES}), C('from', 'De l’année', 'number', {min: 1000, max: 2100}), C('to', 'À l’année', 'number', {min: 1000, max: 2100}), C('dotSize', 'Taille des ronds', 'range', {min: .4, max: 3, step: .1, def: 1}),
                C('placeLabels', 'Noms des communes', 'select', {choices: [['', 'Les trous et les plus remplies'], ['all', 'Toutes'], ['none', 'Aucune']]}), ...mapOpts, ...COMMON],
            sample: () => ({o: {title: 'Mes recherches dans le Gers', map: 'fr'}, rows: sampleResearch()}),
            resolve, afterDraw, fromApp: researchApp, describe: spec => `Carte de tes recherches : ${rows(spec).length} lignes.`},
    };
    for (const [k, kind] of Object.entries(NEW)) { if (!K[k]) K[k] = kind; }
    ext.diagramCartesPlus = {surnamemap, heatdecades, dnamap, researchmap, researchCommunes, timeOf, atOf, RESEARCH};
})();
