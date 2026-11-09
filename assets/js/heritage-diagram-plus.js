/* LCNDA — 📊 Douze diagrammes de plus (ajoutés au catalogue de heritage-diagrams-render.js) :
 *  Généalogie : 🔗 chemin de parenté entre deux personnes · 🧩 complétude de l'arbre (barres ou éventail) · 📜 tableau d'ascendance
 *               (ahnentafel, prêt à imprimer par la fenêtre « Imprimer ») ;
 *  Cartes : 🎯 centre de gravité de la famille par génération (avec sa trajectoire) · 🌈 carte des générations ;
 *  ADN : 🧬 matrice des correspondances partagées (méthode de Leeds) ; Frises : 🎡 roue de l'année ;
 *  Chiffres : 📊 barres + courbe (deuxième axe à droite) · ↔️ barres divergentes · 🏔 collines empilées · 🧵 coordonnées
 *             parallèles · 📶 courbe en escalier (ex. combien de vivants dans la famille, année par année).
 * Calculs purs (chemin, mots du lien, complétude, centre de gravité, Leeds, vivants par année) : app-diagram-plus-core.js
 * (window.LCNDA_DIAGPLUS, testés dans Node). Données de l'arbre : api.php?action=diagram_plus (lib/diagram_plus.php) et
 * api.php?action=dna (l'onglet ADN). Un clic sur un élément relié à des personnes ouvre la fiche (data-dfa-pid) ou la liste
 * des personnes (data-dfa-pids), comme les autres diagrammes (heritage-diagram-famille.js).
 * Chaque sorte : {icon, label, group, help, render(spec, W, fs) → {h, svg, legend, desc}, grids, options, sample, fromApp}.
 * Tout texte passe par esc() ; couleurs vérifiées (R.color) ; tailles et nombres bornés.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const R = ext.diagramRender, P = window.LCNDA_DIAGPLUS; if (!R?.KINDS || !P) return;
    const GC = ext.diagramCartes;
    const A = () => window.LCNDA_APP;
    const K = R.KINDS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const num = v => (typeof v === 'number' ? (Number.isFinite(v) ? v : 0) : R.num(v)), color = R.color;
    const isNum = v => v !== '' && v !== null && v !== undefined && Number.isFinite(typeof v === 'number' ? v : parseFloat(String(v).replace(/[\s  ]/g, '').replace(',', '.')));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
    const r1 = v => Math.round((Number.isFinite(v) ? v : 0) * 10) / 10, r2 = v => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
    const NF = [0, 1, 2].map(d => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: d}));
    const fmt = (n, d = 1) => NF[clamp(d, 0, 2)].format(Number(n) || 0);
    const TAU = Math.PI * 2;
    const pal = spec => R.PALETTES[spec.o?.palette] || R.PALETTES.vive;
    const pick = (spec, i, c) => color(c, pal(spec)[((i % pal(spec).length) + pal(spec).length) % pal(spec).length]);
    const textW = (s, fs) => [...String(s ?? '')].reduce((w, ch) => w + (/[ilI.,:;'!|]/.test(ch) ? .28 : /[mwMW@]/.test(ch) ? .85 : /[A-Z]/.test(ch) ? .66 : /\s/.test(ch) ? .3 : .55), 0) * fs;
    const cut = (s, max, fs) => { s = String(s ?? ''); if (textW(s, fs) <= max) return s; while (s.length > 1 && textW(s + '…', fs) > max) s = s.slice(0, -1); return s.length > 1 ? s + '…' : ''; };
    const wrap = (s, max, fs, maxLines = 4) => { const out = []; let cur = ''; for (const w of String(s ?? '').split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (textW(t, fs) > max && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out.length > maxLines ? [...out.slice(0, maxLines - 1), cut(out.slice(maxLines - 1).join(' '), max, fs)] : out; };
    const T = (x, y, s, {size = 12, anchor = 'start', weight = 400, fill = 'currentColor', rotate = 0, baseline = 'middle', style = '', op = 0, halo = ''} = {}) =>
        `<text x="${r1(x)}" y="${r1(y)}" font-size="${r2(size)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-weight="${weight}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}${rotate ? ` transform="rotate(${r2(rotate)} ${r1(x)} ${r1(y)})"` : ''}${style ? ` font-style="${style}"` : ''}${halo ? ` stroke="${halo}" stroke-width="${r2(size / 4)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`;
    const tip = s => `<title>${esc(s)}</title>`;
    const rgb = c => { const m = String(c).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const hex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    const mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); if (!a || !b) return t < .5 ? c1 : c2; return hex(a.map((v, i) => v + (b[i] - v) * clamp(t, 0, 1))); };
    const contrast = c => { const a = rgb(c); if (!a) return '#1d1d1f'; return (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff'; };
    const rows = (spec, key = 'rows', max = 20000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, max);
    const str = (v, n = 200) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const empty = (W, fs, msg) => ({h: 60, svg: T(W / 2, 30, cut(msg, W - 10, fs * .9), {anchor: 'middle', size: fs * .9, fill: '#888'}) + tip(msg), legend: [], desc: msg});
    const pid = v => { const n = Math.floor(num(v)); return n > 0 && n < 1e9 ? n : 0; };
    const pidList = v => String(v ?? '').split(',').map(pid).filter(Boolean).slice(0, 400);
    const PID = id => (id ? ` data-dfa-pid="${id}" style="cursor:pointer"` : '');
    const PIDS = (list, title) => (list.length ? ` data-dfa-pids="${list.slice(0, 400).join(',')}" data-dfa-t="${esc(title)}" style="cursor:pointer"` : '');
    const H_OPT = C('height', 'Hauteur au plus', 'number', {unit: 'px', min: 120, max: 3000});
    const yearOf = v => { const t = String(v ?? '').replace(/-00\b/g, '').trim(); if (!t) return null; const y = R.when(t, false); return y === null || !Number.isFinite(y) || y < -3000 || y > 3000 ? null : Math.floor(y + 1e-9); };
    const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    /** « 1784-05-07 » → « 7 mai 1784 » ; « 1784-05 » → « mai 1784 » ; le reste tel quel */
    const dateFr = v => { const t = str(v, 40).replace(/-00\b/g, ''); let m; if ((m = t.match(/^(-?\d{1,4})-(\d{2})-(\d{2})$/)) && +m[2] >= 1 && +m[2] <= 12) return `${+m[3] === 1 ? '1er' : +m[3]} ${MOIS_L[+m[2] - 1]} ${+m[1]}`; if ((m = t.match(/^(-?\d{1,4})-(\d{2})$/)) && +m[2] >= 1 && +m[2] <= 12) return `${MOIS_L[+m[2] - 1]} ${+m[1]}`; return t; };
    const genName = g => { g = Math.round(g); if (g <= 1) return 'La personne'; if (g === 2) return 'Parents'; if (g === 3) return 'Grands-parents'; if (g <= 6) return 'Arrière-' + 'arrière-'.repeat(g - 4) + 'grands-parents'; return `Génération ${g}`; };
    /** axe de chiffres : traits légers et nombres */
    const ticksOf = (lo, hi, n) => R.ticks(lo, hi, clamp(n, 2, 12)).ticks.filter(v => v >= lo - 1e-9 && v <= hi + 1e-9);
    const seriesOf = spec => (Array.isArray(spec.series) && spec.series.length ? spec.series : [{name: 'Valeur'}]).slice(0, 24).map((s, j) => ({name: str(s?.name, 80) || `Série ${j + 1}`, color: pick(spec, j, s?.color)}));
    const val = (r, j) => (isNum(r['s' + j]) ? num(r['s' + j]) : null);
    const TABLE = (label, first = 'Catégorie', n = true, extra = []) => ({key: 'rows', label, series: n, cols: [C('label', first), ...extra]});

    /* ═════════ 1 🔗 Chemin de parenté ═════════ */
    const STEP_OK = new Set(['u', 'd', 's']);
    function pathOf(spec) {
        const list = rows(spec, 'rows', 80).map((r, i) => ({i, name: str(r.name, 120) || `Personne ${i + 1}`, sex: r.sex === 'h' || r.sex === 'f' ? r.sex : '', years: str(r.years, 30), step: STEP_OK.has(r.step) ? r.step : 'u', pid: pid(r.pid)}));
        return {list, steps: list.slice(1).map(p => p.step)};
    }
    function kinpath(spec, W, fs) {
        const o = spec.o || {}, {list, steps} = pathOf(spec);
        if (list.length < 2) return empty(W, fs, 'Choisis deux personnes (« Depuis l’app ») ou écris le chemin, une personne par ligne.');
        const sentence = P.kinSentence(steps, list.map(p => p.sex), list.map(p => p.name));
        const others = rows(spec, 'others', 12).map(r => str(r.label, 200)).filter(Boolean);
        const useList = o.layout === 'list' || (o.layout !== 'chart' && (W < 560 || list.length > Math.max(6, Math.floor(W / 120))));
        const showY = o.years !== false, bySex = o.colorBy !== 'one', one = color(o.boxColor, '#4e79a7');
        const SEXC = {h: color(o.manColor, '#4e79a7'), f: color(o.womanColor, '#e15759'), '': '#8a94a6'};
        const fill = p => (bySex ? SEXC[p.sex] : one);
        let svg = '', h = 0;
        const box = (p, x, y, w, bh, top) => {
            const c = fill(p), lines = [cut(p.name, w - 12, fs * .95), showY && p.years ? p.years : ''].filter(Boolean);
            return `<g class="dpl-box"${PID(p.pid)}>${tip(`${p.name}${p.years ? ' (' + p.years + ')' : ''}`)}<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(bh)}" rx="${r1(fs * .5)}" fill="${mix(c, '#ffffff', .82)}" stroke="${c}" stroke-width="${top ? 2.6 : 1.4}"/>`
                + lines.map((t, k) => T(x + w / 2, y + bh / 2 + (k - (lines.length - 1) / 2) * fs * 1.15, t, {anchor: 'middle', size: k ? fs * .8 : fs * .95, weight: k ? 400 : 650, fill: '#1d1d1f'})).join('') + (top ? T(x + w / 2, y - fs * .55, '★ ancêtre commun', {anchor: 'middle', size: fs * .72, fill: '#8a6d1d', weight: 600}) : '') + '</g>';
        };
        // la génération de chaque personne (en haut : l'ancêtre commun)
        const lev = [0]; steps.forEach((d, k) => lev.push(lev[k] + (d === 'u' ? 1 : d === 'd' ? -1 : 0)));
        const maxL = Math.max(...lev), minL = Math.min(...lev);
        const tops = new Set(lev.map((l, k) => (k > 0 && k < lev.length - 1 && l === maxL && steps[k - 1] === 'u' && steps[k] === 'd' ? k : -1)).filter(k => k >= 0));
        const word = (d, p) => P.stepLabel(d, p.sex).replace(/^(son|sa) /, ''), mk = 'dplArr' + (++mseq);
        if (useList) {
            const w = Math.min(W - 8, 420), x = (W - w) / 2, bh = fs * (showY ? 2.9 : 2.1), gap = fs * 2.3;
            list.forEach((p, k) => {
                const y = h + (tops.has(k) ? fs * .9 : 0);
                if (k) { const d = steps[k - 1], ay = h - gap; svg += `<line x1="${r1(W / 2)}" y1="${r1(ay + 3)}" x2="${r1(W / 2)}" y2="${r1(h - 4)}" stroke="#8a94a6" stroke-width="1.5" marker-end="url(#${mk})"/>` + T(W / 2 + fs * .7, ay + gap / 2, `${d === 'u' ? '↑' : d === 'd' ? '↓' : '⚭'} ${word(d, p)}`, {size: fs * .82, fill: '#555'}); }
                svg += box(p, x, y, w, bh, tops.has(k)); h = y + bh + gap;
            });
            h -= gap;
        } else {
            const n = list.length, colW = W / n, bw = Math.min(170, colW - 8), bh = fs * (showY ? 2.9 : 2.1), rowH = bh + fs * 3.2, top = fs * 1.2;
            const pos = list.map((p, k) => [k * colW + (colW - bw) / 2, top + (maxL - lev[k]) * rowH]);
            steps.forEach((d, k) => {
                const [x1, y1] = pos[k], [x2, y2] = pos[k + 1], ax = x1 + bw, ay = y1 + bh / 2, bx = x2, by = y2 + bh / 2;
                svg += `<path d="M${r1(ax)} ${r1(ay)} L${r1(bx - 3)} ${r1(by)}" fill="none" stroke="${d === 's' ? '#c08a2b' : '#8a94a6'}" stroke-width="1.6"${d === 's' ? ' stroke-dasharray="5 3"' : ''} marker-end="url(#${mk})"/>`
                    + T((ax + bx) / 2, (ay + by) / 2 - fs * .55, d === 's' ? '⚭' : word(d, list[k + 1]), {anchor: 'middle', size: fs * .78, fill: '#555', halo: '#ffffff'});
            });
            list.forEach((p, k) => { svg += box(p, pos[k][0], pos[k][1], bw, bh, tops.has(k)); });
            h = top + (maxL - minL) * rowH + bh;
        }
        svg = `<defs><marker id="${mk}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8a94a6"/></marker></defs>` + svg;
        if (o.sentence !== false) { const L = wrap(sentence, W - 10, fs * 1.05, 4); h += fs * 1.3; L.forEach((t, k) => { svg += T(W / 2, h + k * fs * 1.35, t, {anchor: 'middle', size: fs * 1.05, weight: 650}); }); h += L.length * fs * 1.35; }
        if (others.length && o.others !== false) { h += fs * .4; others.forEach(t => { const L = wrap('Aussi : ' + t, W - 10, fs * .88, 2); L.forEach(x => { svg += T(W / 2, h + fs * .6, x, {anchor: 'middle', size: fs * .88, fill: '#6b5a2a', style: 'italic'}); h += fs * 1.2; }); }); }
        const legend = bySex ? [{label: 'Homme', color: SEXC.h}, {label: 'Femme', color: SEXC.f}] : [];
        return {h: Math.ceil(h + fs * .4), svg, legend, desc: sentence};
    }
    const sampleKin = () => ({o: {title: 'Comment sont-ils parents ?'}, rows: [
        ['Hugo MARTIN', 'h', '2014', ''], ['Joseph MARTIN', 'h', '1952–2010', 'u'], ['Jean MARTIN', 'h', '1922–1999', 'u'], ['Pierre MARTIN', 'h', '1890–1960', 'u'],
        ['Louise MARTIN', 'f', '1925–2001', 'd'], ['Anne PEYRE', 'f', '1950', 'd'], ['Léa PEYRE', 'f', '1979', 'd']].map(([name, sex, years, step]) => ({name, sex, years, step})),
        others: [{label: 'cousins issus de germains aussi par Jeanne FAURE (implexe)'}]});

    /* ═════════ 🗺️ Cartes : le fond de heritage-diagram-cartes.js ═════════ */
    let mseq = 0;
    function mapFrame(spec, W, fs, pts) {
        const o = spec.o || {}, M = GC.MAPS[GC.mapOf(o)];
        if (o.frame === 'zone' && M.zoneBase) { const w0 = GC.needBases(spec, W, [M.zoneBase]); if (w0) return {wait: w0}; }
        const auto = (!o.frame || o.frame === '') && o.fit !== false && pts.length ? GC.fitView(pts.map(p => ({p})), o) : null;
        const view = GC.viewOf(o, auto || M.view), baseId = GC.baseIdOf(o, view), ctxId = GC.ctxIdOf(o, baseId, view);
        const wait = GC.needBases(spec, W, [baseId, ctxId]); if (wait) return {wait};
        const base = GC.loaded(baseId), ctx = ctxId ? GC.loaded(ctxId) : null, uid = 'dplm' + (++mseq);
        const pr = GC.fitProj(o.proj && o.proj !== 'auto' ? o.proj : GC.autoProj(view), view, W, clamp(num(o.height) || 2400, 120, 3000), !num(o.height)); pr.allOutre = true;
        const B = GC.drawBase({...spec, o: {...o, borderColor: o.borderColor || '#cfcabe'}}, base, ctx, pr, W, pr.h, () => ({fill: color(o.zoneColor, GC.LAND), title: ''}), uid);
        const close = `</g>${T(W - 4, pr.h - 4, GC.attrOf(base, ctx), {anchor: 'end', size: clamp(fs * .62, 7, 12), fill: '#555'})}<rect data-geo-hit="1" width="${r1(W)}" height="${r1(pr.h)}" fill="none" stroke="#c8cdd3" stroke-width=".6"/></g>`;
        return {pr, h: pr.h, open: `<g data-geo-map="${uid}">${B.svg}<g clip-path="url(#${uid}c)">`, close, geo: {uid, pr, w: W, h: pr.h}};
    }
    /** les lignes → points {lon, lat, place, gen, name, pid, y} (« Rennes 48.11, -1.68 », ou un lieu connu du fond) */
    function genPoints(spec, maxGen = 40) {
        const out = [], unknown = new Set(), memo = new Map();
        for (const r of rows(spec, 'rows', 20000)) {
            const label = str(r.label, 120); if (!label) continue;
            const g = Math.round(num(r.gen)); if (!(g >= 1 && g <= maxGen)) continue;
            let p = memo.get(label); if (p === undefined) { p = GC.placeOf(spec, label, []); memo.set(label, p); }
            if (!p) { if (unknown.size < 30) unknown.add(label.slice(0, 40)); continue; }
            out.push({lon: p[0], lat: p[1], place: p[2], gen: g, name: str(r.name, 120), pid: pid(r.pid), y: yearOf(r.year)});
        }
        return {pts: out, unknown: [...unknown]};
    }
    const genColor = (spec, g, gmin, gmax) => { const o = spec.o || {}; if (o.genColors === 'palette') return pick(spec, g - 1); return mix(color(o.lowColor, '#f6c453'), color(o.highColor, '#5b2a86'), gmax > gmin ? (g - gmin) / (gmax - gmin) : 1); };
    const missing = (unknown, W, y, fs) => unknown.length ? T(0, y + fs * .7, cut(`⚠ Lieux sans position : ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? '…' : ''} — écris « Nom 48.11, -1.68 »`, W, fs * .78), {size: fs * .78, fill: '#a5552a'}) : '';

    /* ═════════ 2 🎯 Centre de gravité par génération ═════════ */
    function gravity(spec, W, fs) {
        if (!GC) return empty(W, fs, 'Les cartes ne sont pas chargées.');
        const o = spec.o || {}, gmax0 = clamp(Math.round(num(o.maxGen) || 12), 2, 40), {pts, unknown} = genPoints(spec, gmax0);
        const cg = P.gravity(pts.map(p => ({gen: p.gen, lat: p.lat, lon: p.lon})));
        const F = mapFrame(spec, W, fs, pts.length ? pts.map(p => [p.lon, p.lat]) : []); if (F.wait) return F.wait;
        const {pr, h} = F, gs = cg.map(c => c.gen), gmin = Math.min(...gs, 1), gmax = Math.max(...gs, 2);
        let svg = F.open;
        if (o.points !== false) pts.forEach(p => { const [x, y] = pr.p(p.lon, p.lat); if (!Number.isFinite(x)) return; svg += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r2(clamp(num(o.dot) || 2.4, .6, 10))}" fill="${genColor(spec, p.gen, gmin, gmax)}" fill-opacity=".45"${PID(p.pid)}>${tip(`${p.name || 'Ancêtre'} — ${p.place}${p.y ? ' (' + p.y + ')' : ''} · ${genName(p.gen)}`)}</circle>`; });
        const order = o.order === 'near' ? [...cg] : [...cg].reverse(); // des plus anciens vers la personne (ou l'inverse)
        const xy = order.map(c => pr.p(c.lon, c.lat));
        if (o.path !== false && xy.length > 1) {
            svg += `<defs><marker id="${F.geo.uid}a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="${color(o.pathColor, '#1d3557')}"/></marker></defs>`;
            for (let k = 0; k < xy.length - 1; k++) { const [x1, y1] = xy[k], [x2, y2] = xy[k + 1]; if (![x1, y1, x2, y2].every(Number.isFinite)) continue; svg += `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${color(o.pathColor, '#1d3557')}" stroke-width="${r2(clamp(num(o.lineW) || 2.2, .5, 8))}" marker-end="url(#${F.geo.uid}a)" stroke-linecap="round"/>`; }
        }
        order.forEach((c, k) => {
            const [x, y] = xy[k]; if (!Number.isFinite(x)) return;
            const col = genColor(spec, c.gen, gmin, gmax), rr = clamp(fs * .5 + Math.sqrt(c.n) * 1.6, fs * .6, fs * 1.8);
            if (o.spread === true && c.spread > 0) { const [, y2] = pr.p(c.lon, c.lat + c.spread / 111.2); const rad = Math.abs(y2 - y); if (rad > rr && rad < W) svg += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rad)}" fill="${col}" fill-opacity=".08" stroke="${col}" stroke-opacity=".5" stroke-dasharray="3 3"/>`; }
            svg += `<g${PIDS(pts.filter(p => p.gen === c.gen && p.pid).map(p => p.pid), genName(c.gen))}>${tip(`${genName(c.gen)} : centre de ${c.n} lieu${c.n > 1 ? 'x' : ''} de naissance\nécart moyen ${fmt(c.spread, 0)} km`)}<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(rr)}" fill="${col}" stroke="#ffffff" stroke-width="1.6"/>${T(x, y + .5, String(c.gen), {anchor: 'middle', size: fs * .78, weight: 700, fill: contrast(col)})}</g>`;
        });
        if (!cg.length) svg += T(W / 2, h / 2, 'Ajoute des lieux de naissance avec leur génération (ou « Depuis l’app »).', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
        svg += F.close;
        let H = h; if (unknown.length && o.showMissing !== false) { svg += missing(unknown, W, H, fs); H += fs * 1.5; }
        const moved = cg.length > 1 ? P.km(cg[0].lat, cg[0].lon, cg[cg.length - 1].lat, cg[cg.length - 1].lon) : 0;
        if (cg.length > 1 && o.summary !== false) { svg += T(W / 2, H + fs, cut(`De la génération ${cg[cg.length - 1].gen} à la génération ${cg[0].gen}, le centre de la famille s’est déplacé de ${fmt(moved, 0)} km.`, W, fs * .9), {anchor: 'middle', size: fs * .9, weight: 600}); H += fs * 2; }
        return {h: H, svg, geo: F.geo, legend: cg.slice(0, 16).map(c => ({label: `${c.gen}. ${genName(c.gen)} (${c.n})`, color: genColor(spec, c.gen, gmin, gmax)})), desc: `Centre de gravité de ${cg.length} générations${moved ? `, ${fmt(moved, 0)} km parcourus` : ''}.`};
    }
    const CITY = {Rennes: [48.11, -1.68], Vitré: [48.12, -1.21], Fougères: [48.35, -1.2], Nantes: [47.22, -1.55], Laval: [48.07, -.77], Angers: [47.47, -.55], 'Le Mans': [48, .2], Caen: [49.18, -.37], Paris: [48.86, 2.35], Tours: [47.39, .69], Brest: [48.39, -4.49], Quimper: [48, -4.1], Limoges: [45.83, 1.26], Tulle: [45.27, 1.77], Orléans: [47.9, 1.9], Rouen: [49.44, 1.1]};
    const L = n => `${n} ${CITY[n][0]}, ${CITY[n][1]}`;
    const sampleGen = () => {
        const by = {2: ['Paris', 'Paris'], 3: ['Paris', 'Le Mans', 'Tours', 'Orléans'], 4: ['Le Mans', 'Laval', 'Angers', 'Tours', 'Laval', 'Rennes', 'Orléans', 'Rouen'], 5: ['Laval', 'Vitré', 'Rennes', 'Angers', 'Fougères', 'Rennes', 'Nantes', 'Laval', 'Caen', 'Vitré', 'Rennes', 'Le Mans'], 6: ['Vitré', 'Rennes', 'Fougères', 'Rennes', 'Nantes', 'Brest', 'Quimper', 'Vitré', 'Rennes', 'Fougères', 'Nantes', 'Caen']};
        const out = []; Object.entries(by).forEach(([g, list]) => list.forEach((n, i) => out.push({label: L(n), gen: g, name: `Ancêtre ${g}.${i + 1}`, year: String(2000 - g * 28)})));
        return out;
    };

    /* ═════════ 3 🌈 Carte des générations ═════════ */
    function genmap(spec, W, fs) {
        if (!GC) return empty(W, fs, 'Les cartes ne sont pas chargées.');
        const o = spec.o || {}, {pts, unknown} = genPoints(spec, clamp(Math.round(num(o.maxGen) || 12), 2, 40));
        const F = mapFrame(spec, W, fs, pts.map(p => [p.lon, p.lat])); if (F.wait) return F.wait;
        const {pr, h} = F, gs = [...new Set(pts.map(p => p.gen))].sort((a, b) => a - b), gmin = gs[0] || 1, gmax = gs[gs.length - 1] || 2;
        const R0 = clamp(num(o.dot) || 4, 1, 14), groups = new Map();
        pts.forEach(p => { const k = `${r2(p.lon)}|${r2(p.lat)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
        let svg = F.open;
        for (const list of [...groups.values()].sort((a, b) => b.length - a.length)) {
            const [x0, y0] = pr.p(list[0].lon, list[0].lat); if (!Number.isFinite(x0)) continue;
            list.sort((a, b) => b.gen - a.gen).forEach((p, i) => { const a = i * 2.39996, rr = o.spread === false ? 0 : R0 * 1.1 * Math.sqrt(i), c = genColor(spec, p.gen, gmin, gmax);
                svg += `<circle cx="${r1(x0 + Math.cos(a) * rr)}" cy="${r1(y0 + Math.sin(a) * rr)}" r="${r2(R0)}" fill="${c}" stroke="#ffffff" stroke-width="${r2(Math.min(1, R0 / 3))}"${PID(p.pid)}>${tip(`${p.name || 'Ancêtre'} — ${p.place}${p.y ? ' (' + p.y + ')' : ''}\n${genName(p.gen)}`)}</circle>`; });
            if (o.labels !== false && list.length >= Math.max(2, num(o.labelMin) || 3)) svg += T(x0 + R0 * 1.2 * Math.sqrt(list.length) + R0 + 2, y0, list[0].place, {size: fs * .78, weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'});
        }
        if (!pts.length) svg += T(W / 2, h / 2, 'Ajoute des lieux avec leur génération (ou « Depuis l’app »).', {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
        svg += F.close;
        let H = h; if (unknown.length && o.showMissing !== false) { svg += missing(unknown, W, H, fs); H += fs * 1.5; }
        return {h: H, svg, geo: F.geo, legend: gs.slice(0, 16).map(g => ({label: `${genName(g)} (${pts.filter(p => p.gen === g).length})`, color: genColor(spec, g, gmin, gmax)})), desc: `Carte des générations : ${pts.length} lieux de naissance.`};
    }

    /* ═════════ 4 🧩 Complétude de l'arbre ═════════ */
    function complete(spec, W, fs) {
        const o = spec.o || {};
        let list = rows(spec, 'rows', 60).map(r => { const g = Math.round(num(r.gen)); if (!(g >= 1 && g <= 60)) return null; const theo = isNum(r.theo) && num(r.theo) > 0 ? num(r.theo) : 2 ** (g - 1); return {g, theo, found: clamp(num(r.found), 0, theo), distinct: isNum(r.distinct) ? clamp(num(r.distinct), 0, theo) : null, ids: pidList(r.ids)}; }).filter(Boolean).sort((a, b) => a.g - b.g);
        const known = new Set(String(spec.known ?? '').split(/[\s,;]+/).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n < 2 ** 16));
        if (!list.length && known.size) list = P.completeness([...known], 10).map(x => ({g: x.gen, theo: x.theo, found: x.found, distinct: null, ids: []}));
        if (!list.length) return empty(W, fs, 'Ajoute des générations : la génération et le nombre d’ancêtres trouvés.');
        const cKnown = color(o.knownColor, '#2e7d6b'), cDist = color(o.distinctColor, '#1f5fa8'), cMiss = color(o.missingColor, '#e6e9ee');
        const tot = list.reduce((a, x) => a + x.found, 0), totT = list.reduce((a, x) => a + x.theo, 0);
        let svg = '', h = 0, axis;
        if (o.layout === 'fan') {
            const maxG = clamp(Math.min(list.length, num(o.fanGens) || 8), 2, 10), R0 = Math.min(W / 2 - 4, (num(o.height) || 2000) - fs * 2), r0 = R0 * .1, cx = W / 2, cy = R0 + 4, dr = (R0 - r0) / maxG;
            const arc = (a0, a1, ri, ro) => { const p = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)], [x1, y1] = p(a0, ro), [x2, y2] = p(a1, ro), [x3, y3] = p(a1, ri), [x4, y4] = p(a0, ri), lg = a1 - a0 > Math.PI ? 1 : 0; return `M${r1(x1)} ${r1(y1)}A${r1(ro)} ${r1(ro)} 0 ${lg} 1 ${r1(x2)} ${r1(y2)}L${r1(x3)} ${r1(y3)}A${r1(ri)} ${r1(ri)} 0 ${lg} 0 ${r1(x4)} ${r1(y4)}Z`; };
            svg += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r0)}" fill="${cKnown}"/>`;
            for (let g = 2; g <= maxG; g++) {
                const n = 2 ** (g - 1), ri = r0 + (g - 2) * dr, ro = ri + dr - .6, row = list.find(x => x.g === g), share = row ? row.found / row.theo : 0;
                for (let k = 0; k < n; k++) {
                    const s = n + k, a0 = Math.PI + k / n * Math.PI, a1 = Math.PI + (k + 1) / n * Math.PI;
                    const on = known.size ? known.has(s) : k < Math.round(share * n);
                    svg += `<path d="${arc(a0, a1, ri, ro)}" fill="${on ? cKnown : cMiss}" stroke="#ffffff" stroke-width="${n > 128 ? .2 : .6}">${n <= 256 ? tip(`Sosa ${s} : ${on ? 'connu' : 'à trouver'}`) : ''}</path>`;
                }
                if (row && o.values !== false) svg += T(cx + ri + dr / 2, cy + fs * .8, `${fmt(row.found / row.theo * 100, 0)} %`, {anchor: 'middle', size: clamp(fs * .7, 6, dr * .5), fill: '#555'});
            }
            h = cy + fs * 1.8;
        } else {
            const rowH = clamp(num(o.barH) || fs * 1.9, 8, 60), labW = Math.min(W * .32, textW('Gén. 10 (512)', fs * .85) + 8), pctW = textW('100 %', fs * .85) + 10, bw = W - labW - pctW;
            const scaleLog = o.scale === 'log';
            list.forEach((x, k) => {
                const y = k * (rowH + 4), wT = scaleLog ? bw * (Math.log2(x.theo) + 1) / (Math.log2(list[list.length - 1].theo) + 1) : bw;
                svg += `<g${PIDS(x.ids, `Génération ${x.g}`)}>${tip(`Génération ${x.g} (${genName(x.g)}) : ${fmt(x.found, 0)} sur ${fmt(x.theo, 0)} possibles${x.distinct !== null && x.distinct < x.found ? ` — ${fmt(x.distinct, 0)} personnes différentes (implexe)` : ''}`)}`
                    + T(labW - 6, y + rowH / 2, `Gén. ${x.g} (${fmt(x.theo, 0)})`, {anchor: 'end', size: fs * .85})
                    + `<rect x="${r1(labW)}" y="${r1(y)}" width="${r1(wT)}" height="${r1(rowH)}" rx="3" fill="${cMiss}"/><rect x="${r1(labW)}" y="${r1(y)}" width="${r1(wT * x.found / x.theo)}" height="${r1(rowH)}" rx="3" fill="${cKnown}"/>`
                    + (x.distinct !== null && x.distinct < x.found && o.distinct !== false ? `<rect x="${r1(labW)}" y="${r1(y + rowH * .62)}" width="${r1(wT * x.distinct / x.theo)}" height="${r1(rowH * .38)}" fill="${cDist}"/>` : '')
                    + T(labW + wT + 5, y + rowH / 2, `${fmt(x.found / x.theo * 100, x.found / x.theo < .1 ? 1 : 0)} %`, {size: fs * .85, weight: 600}) + '</g>';
            });
            h = list.length * (rowH + 4);
            if (!scaleLog) axis = {dir: 'x', x0: labW, y0: 0, w: bw, h, lo: 0, hi: 100, unit: '%', series: [{name: 'Ancêtres connus', color: cKnown, values: list.map(x => x.found / x.theo * 100)}]};
        }
        if (o.summary !== false) { svg += T(W / 2, h + fs * .8, cut(`${fmt(tot, 0)} ancêtres trouvés sur ${fmt(totT, 0)} possibles en ${list.length} générations (${fmt(tot / totT * 100, 1)} %).`, W, fs * .9), {anchor: 'middle', size: fs * .9, weight: 600}); h += fs * 1.8; }
        const legend = [{label: 'Ancêtres connus', color: cKnown}, {label: 'Encore à trouver', color: cMiss}, ...(o.layout !== 'fan' && list.some(x => x.distinct !== null && x.distinct < x.found) && o.distinct !== false ? [{label: 'Personnes différentes (implexe)', color: cDist}] : [])];
        return {h: Math.ceil(h), svg, legend, desc: `Complétude : ${fmt(tot / totT * 100, 1)} % des ancêtres sur ${list.length} générations.`, ...(axis ? {axis} : {})};
    }
    const sampleComplete = () => [[1, 1], [2, 2], [3, 4], [4, 8], [5, 15], [6, 27], [7, 41], [8, 52], [9, 48, 46], [10, 31, 29], [11, 12, 11], [12, 4, 4]].map(([gen, found, distinct]) => ({gen: String(gen), theo: '', found: String(found), distinct: distinct ? String(distinct) : ''}));

    /* ═════════ 5 📜 Tableau d'ascendance (ahnentafel) ═════════ */
    function ahnRows(spec) {
        return rows(spec, 'rows', 5000).map(r => ({sosa: Math.floor(num(r.sosa)), name: str(r.name, 120), sex: r.sex === 'h' || r.sex === 'f' ? r.sex : '', birth: dateFr(r.birth), bplace: str(r.bplace, 80), marriage: dateFr(r.marriage), mplace: str(r.mplace, 80), death: dateFr(r.death), dplace: str(r.dplace, 80), job: str(r.job, 80), again: str(r.again, 12), pid: pid(r.pid)}))
            .filter(r => r.sosa >= 1 && Number.isSafeInteger(r.sosa)).sort((a, b) => a.sosa - b.sosa);
    }
    const ahnGen = s => Math.floor(Math.log2(s)) + 1;
    const ahnPart = (d, pl) => [d, pl].filter(Boolean).join(', ');
    function ahnentafel(spec, W, fs) {
        const o = spec.o || {}, list = ahnRows(spec);
        if (!list.length) return empty(W, fs, 'Ajoute des ancêtres : leur numéro Sosa et leur nom (ou « Depuis l’app »).');
        const max = clamp(Math.round(num(o.maxRows) || 400), 10, 2000), shown = list.slice(0, max), places = o.places !== false, jobs = o.jobs !== false;
        const narrow = W < 620, sw = textW(String(shown[shown.length - 1].sosa), fs * .9) + 14;
        const cols = narrow ? null : [['Naissance', 'birth', 'bplace'], ['Mariage', 'marriage', 'mplace'], ['Décès', 'death', 'dplace']];
        const nameW = narrow ? W - sw : Math.max(150, W * .3), cw = narrow ? 0 : (W - sw - nameW) / 3;
        const lineH = fs * 1.35, zebra = o.zebra !== false;
        let svg = '', y = 0, g0 = 0;
        if (!narrow) { svg += `<rect x="0" y="0" width="${r1(W)}" height="${r1(lineH * 1.3)}" fill="#eef1f5"/>` + T(4, lineH * .65, 'N°', {size: fs * .85, weight: 700}) + T(sw, lineH * .65, 'Nom', {size: fs * .85, weight: 700}) + cols.map(([t], k) => T(sw + nameW + k * cw, lineH * .65, t, {size: fs * .85, weight: 700})).join(''); y = lineH * 1.4; }
        shown.forEach((r, k) => {
            const g = ahnGen(r.sosa);
            if (o.genHeads !== false && g !== g0) { g0 = g; y += k ? fs * .5 : 0; svg += T(0, y + lineH * .55, `Génération ${g} — ${genName(g)}`, {size: fs * .9, weight: 700, fill: '#1f5fa8'}) + `<line x1="0" y1="${r1(y + lineH * 1.05)}" x2="${r1(W)}" y2="${r1(y + lineH * 1.05)}" stroke="#1f5fa8" stroke-opacity=".35"/>`; y += lineH * 1.2; }
            const line1 = `${r.name || 'Sans nom'}${jobs && r.job ? ' — ' + r.job : ''}${r.again ? ` (voir n° ${r.again})` : ''}`;
            const parts = narrow ? [r.birth || r.bplace ? '° ' + ahnPart(r.birth, places ? r.bplace : '') : '', r.marriage || r.mplace ? '⚭ ' + ahnPart(r.marriage, places ? r.mplace : '') : '', r.death || r.dplace ? '† ' + ahnPart(r.death, places ? r.dplace : '') : ''].filter(Boolean) : [];
            const sub = narrow ? wrap(parts.join(' · '), W - sw - 4, fs * .78, 3) : [];
            const rh = narrow ? lineH * (1 + sub.length * .85) + 4 : lineH + 2;
            svg += `<g${PID(r.pid)}>${tip(`${r.sosa}. ${line1}`)}${zebra && k % 2 ? `<rect x="0" y="${r1(y)}" width="${r1(W)}" height="${r1(rh)}" fill="#f6f7f9"/>` : ''}`
                + T(sw - 8, y + lineH * .55, String(r.sosa), {anchor: 'end', size: fs * .9, weight: 700, fill: r.sex === 'f' ? '#b04050' : r.sex === 'h' ? '#2f5d8a' : 'currentColor'})
                + T(sw, y + lineH * .55, cut(line1, (narrow ? W - sw : nameW) - 6, fs * .9), {size: fs * .9, weight: 600, fill: r.again ? '#777' : 'currentColor'});
            if (narrow) sub.forEach((t, j) => { svg += T(sw, y + lineH * (1.45 + j * .85), t, {size: fs * .78, fill: '#444'}); });
            else cols.forEach(([, d, p], j) => { svg += T(sw + nameW + j * cw, y + lineH * .55, cut(ahnPart(r[d], places ? r[p] : ''), cw - 6, fs * .8), {size: fs * .8, fill: '#333'}); });
            svg += '</g>'; y += rh;
        });
        if (list.length > shown.length) { svg += T(W / 2, y + fs, `… et ${list.length - shown.length} lignes de plus (« 🖨 Imprimer le tableau » les met toutes)`, {anchor: 'middle', size: fs * .85, fill: '#777', style: 'italic'}); y += fs * 2; }
        return {h: Math.ceil(y + 4), svg, legend: [], desc: `Tableau d’ascendance : ${list.length} ancêtres.`};
    }
    /** le tableau en HTML, pour la fenêtre « Imprimer » (L1) */
    function ahnentafelHtml(spec, {places = true, jobs = true, genHeads = true} = {}) {
        const list = ahnRows(spec), title = str(spec.o?.title, 200) || 'Tableau d’ascendance';
        let g0 = 0, body = '';
        list.forEach(r => {
            const g = ahnGen(r.sosa);
            if (genHeads && g !== g0) { g0 = g; body += `<tr class="g"><th colspan="5">Génération ${g} — ${esc(genName(g))}</th></tr>`; }
            body += `<tr><td class="n">${r.sosa}</td><td><b>${esc(r.name || 'Sans nom')}</b>${jobs && r.job ? `<br><small>${esc(r.job)}</small>` : ''}${r.again ? `<br><small>voir n° ${esc(r.again)}</small>` : ''}</td><td>${esc(ahnPart(r.birth, places ? r.bplace : ''))}</td><td>${esc(ahnPart(r.marriage, places ? r.mplace : ''))}</td><td>${esc(ahnPart(r.death, places ? r.dplace : ''))}</td></tr>`;
        });
        return `<style>.dpl-ahn{font:10.5pt/1.35 Georgia,serif;color:#111;padding:12mm}.dpl-ahn h1{font-size:16pt;margin:0 0 4mm}.dpl-ahn table{width:100%;border-collapse:collapse}.dpl-ahn th,.dpl-ahn td{text-align:left;vertical-align:top;padding:1.2mm 2mm;border-bottom:.2mm solid #ccc}.dpl-ahn td.n{text-align:right;font-weight:700;width:12mm}.dpl-ahn tr.g th{background:#eef1f5;color:#1f5fa8;padding-top:3mm}.dpl-ahn thead th{border-bottom:.4mm solid #333}.dpl-ahn small{color:#555}.dpl-ahn tr{break-inside:avoid}</style>`
            + `<div class="dpl-ahn"><h1>${esc(title)}</h1><table><thead><tr><th>N°</th><th>Nom</th><th>Naissance</th><th>Mariage</th><th>Décès</th></tr></thead><tbody>${body}</tbody></table></div>`;
    }
    const sampleAhn = () => [[1, 'Joseph MARTIN', 'h', '1952-03-04', 'Naves', '', '', '2010-10-02', 'Brive-la-Gaillarde', 'Instituteur'], [2, 'Jean MARTIN', 'h', '1922-06-11', 'Tulle', '1949-09-17', 'Tulle', '1999-01-20', 'Tulle', 'Menuisier'], [3, 'Marie BORIE', 'f', '1925-02-02', 'Naves', '1949-09-17', 'Tulle', '2001-12-24', 'Tulle', ''],
        [4, 'Pierre MARTIN', 'h', '1890', 'Tulle', '1919-05-03', 'Tulle', '1960', 'Tulle', 'Cultivateur'], [5, 'Louise FAURE', 'f', '1894', 'Seilhac', '1919-05-03', 'Tulle', '1971', 'Tulle', ''], [6, 'Antoine BORIE', 'h', '1888', 'Naves', '1915-11-08', 'Naves', '1964', 'Naves', 'Forgeron'], [7, 'Jeanne PEYRE', 'f', '1890', 'Naves', '1915-11-08', 'Naves', '1943', 'Naves', '']]
        .map(([sosa, name, sex, birth, bplace, marriage, mplace, death, dplace, job]) => ({sosa: String(sosa), name, sex, birth, bplace, marriage, mplace, death, dplace, job}));

    /* ═════════ 6 🧬 Matrice des correspondances ADN (méthode de Leeds) ═════════ */
    const GP = ['Grand-père paternel', 'Grand-mère paternelle', 'Grand-père maternel', 'Grand-mère maternelle'];
    const LEEDS_C = ['#4e79a7', '#59a14f', '#e15759', '#f28e2b', '#b07aa1', '#76b7b2', '#edc948', '#9c755f', '#ff9da7', '#bab0ac', '#1f77b4', '#d62728'];
    function leedsM(spec, W, fs) {
        const o = spec.o || {}, src = rows(spec, 'rows', 2000).map(r => ({name: str(r.name, 120), cm: r.cm, shared: str(r.shared, 4000), pid: pid(r.pid)}));
        const lo = isNum(o.lo) ? num(o.lo) : 90, hi = isNum(o.hi) ? num(o.hi) : 400, max = clamp(Math.round(num(o.max) || 4), 1, 12);
        const Ld = P.leeds(src, {lo, hi, max});
        if (!Ld.pool.length) return empty(W, fs, `Ajoute des correspondances de ${fmt(lo, 0)} à ${fmt(hi, 0)} cM avec leurs correspondances en commun (ou « Depuis l’app »).`);
        const names = str(o.names, 400) ? str(o.names, 400).split(',').map(x => x.trim()).filter(Boolean) : GP;
        const cOf = k => color(rows(spec, 'colors', 12)[k]?.color, LEEDS_C[k % LEEDS_C.length]);
        const order = Ld.order.slice(0, clamp(Math.round(num(o.maxRows) || 60), 5, 150)), n = order.length, byI = new Map(Ld.list.map(m => [m.i, m]));
        const labW = Math.min(W * .42, Math.max(...order.map(i => textW(`${byI.get(i).name} ${fmt(byI.get(i).cm, 0)}`, fs * .8))) + 10);
        const cell = clamp((W - labW - 4) / n, 3, 36), gridW = cell * n, top = o.colLabels !== false && cell >= fs * .7 ? Math.min(140, Math.max(...order.map(i => textW(byI.get(i).name, fs * .72))) + 8) : 6;
        let svg = '';
        if (top > 6) order.forEach((i, k) => { svg += T(labW + k * cell + cell / 2, top - 4, cut(byI.get(i).name, top - 8, fs * .72), {size: fs * .72, rotate: -60, fill: '#444'}); });
        order.forEach((i, r) => {
            const m = byI.get(i), gi = Ld.groupOf.get(i), y = top + r * cell, c = gi === undefined ? '#9aa3ad' : cOf(gi), srcRow = src[i];
            svg += `<g${PID(srcRow?.pid)}>${tip(`${m.name} — ${fmt(m.cm, 0)} cM${gi !== undefined ? ' · ' + (names[gi] || `Groupe ${gi + 1}`) : ' · sans groupe'}`)}<rect x="${r1(labW - 6)}" y="${r1(y + 1)}" width="4" height="${r1(cell - 2)}" fill="${c}"/>${T(labW - 9, y + cell / 2, cut(`${m.name} ${fmt(m.cm, 0)}`, labW - 12, Math.min(fs * .8, cell * .9)), {anchor: 'end', size: Math.min(fs * .8, Math.max(5, cell * .9))})}</g>`;
            order.forEach((j, cI) => {
                const x = labW + cI * cell; let f = '';
                if (i === j) f = '#2b2f36';
                else if (Ld.shares(i, j)) { const ga = Ld.groupOf.get(i), gb = Ld.groupOf.get(j); f = ga !== undefined && ga === gb ? cOf(ga) : ga !== undefined && gb !== undefined ? mix(cOf(ga), cOf(gb), .5) : '#9aa3ad'; }
                svg += `<rect x="${r1(x + .3)}" y="${r1(y + .3)}" width="${r1(cell - .6)}" height="${r1(cell - .6)}" fill="${f || '#f1f3f6'}">${f && i !== j ? tip(`${m.name} ↔ ${byI.get(j).name}`) : ''}</rect>`;
            });
        });
        let h = top + n * cell;
        if (o.summary !== false) { svg += T(0, h + fs, cut(`${Ld.clusters.length} groupe${Ld.clusters.length > 1 ? 's' : ''} sur ${Ld.pool.length} correspondances de ${fmt(lo, 0)} à ${fmt(hi, 0)} cM${Ld.pool.length > Ld.clusters.flat().length ? ` · ${Ld.pool.length - Ld.clusters.flat().length} sans groupe` : ''}.`, W, fs * .85), {size: fs * .85, fill: '#555'}); h += fs * 1.8; }
        return {h: Math.ceil(h), svg, legend: Ld.clusters.map((c, k) => ({label: `${names[k] || 'Groupe ' + (k + 1)} (${c.length})`, color: cOf(k)})), desc: `Méthode de Leeds : ${Ld.clusters.length} groupes de couleur.`};
    }
    const sampleLeeds = () => {
        const g = [['Paul R.', 'Marc R.', 'Lise R.', 'Hervé B.'], ['Anne C.', 'Yves C.', 'Rose D.'], ['Jean P.', 'Sylvie P.', 'Noël T.', 'Eva P.'], ['Louis G.', 'Agnès G.', 'Théo M.']];
        const out = [];
        g.forEach((list, k) => list.forEach((name, i) => out.push({name, cm: String(360 - k * 40 - i * 37), shared: list.filter(x => x !== name).join('; ') + (k === 2 && i === 0 ? '; Louis G.' : '')})));
        out.push({name: 'Inconnu X.', cm: '120', shared: ''});
        return out;
    };

    /* ═════════ 7 🎡 Roue de l'année ═════════ */
    const WK = {birth: ['Naissances', '#59a14f', '🎂'], union: ['Mariages', '#f28e2b', '💍'], death: ['Décès', '#5f6b7a', '🕯'], fete: ['Fêtes des prénoms', '#b07aa1', '🌸']};
    const kindKey = v => { const t = String(v ?? '').toLowerCase(); return /^(birth|naiss|anniv|🎂)/.test(t) ? 'birth' : /^(union|mari|noces|💍)/.test(t) ? 'union' : /^(death|déc|dec|mort|🕯)/.test(t) ? 'death' : /^(fete|fête|saint|🌸)/.test(t) ? 'fete' : t.slice(0, 40) || 'birth'; };
    function wheel(spec, W, fs) {
        const o = spec.o || {}, list = rows(spec, 'rows', 3000).map(r => ({day: P.dayOfYear(r.date), kind: kindKey(r.kind), label: str(r.label, 140), year: str(r.year, 8), pid: pid(r.pid), ids: pidList(r.ids)})).filter(x => x.day !== null);
        if (!list.length) return empty(W, fs, 'Ajoute des dates (« 14/07 » ou « 07-14 »), une sorte et un nom (ou « Depuis l’app »).');
        const kinds = [...new Set(list.map(x => x.kind))].sort((a, b) => (Object.keys(WK).indexOf(a) + 1 || 99) - (Object.keys(WK).indexOf(b) + 1 || 99));
        const kc = (k, i) => color(o['c_' + k], WK[k]?.[1] || pick(spec, i + 4));
        const D = Math.min(W, clamp(num(o.height) || 900, 200, 3000)), cx = W / 2, cy = D / 2, Rout = D / 2 - fs * 2.2, Rin = Rout * clamp((num(o.hole) || 34) / 100, .1, .7);
        const ringW = (Rout - Rin) / kinds.length, ang = d => d / 366 * TAU - Math.PI / 2, pt = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        let svg = '';
        // les mois
        const CUM = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];
        for (let m = 0; m < 12; m++) {
            const a0 = ang(CUM[m]), [x1, y1] = pt(a0, Rin), [x2, y2] = pt(a0, Rout + fs * .3), am = ang((CUM[m] + CUM[m + 1]) / 2), [tx, ty] = pt(am, Rout + fs * 1.15);
            if (m % 2) { const [a1x, a1y] = pt(a0, Rout), [b1x, b1y] = pt(ang(CUM[m + 1]), Rout), [b2x, b2y] = pt(ang(CUM[m + 1]), Rin), [a2x, a2y] = pt(a0, Rin); svg += `<path d="M${r1(a1x)} ${r1(a1y)}A${r1(Rout)} ${r1(Rout)} 0 0 1 ${r1(b1x)} ${r1(b1y)}L${r1(b2x)} ${r1(b2y)}A${r1(Rin)} ${r1(Rin)} 0 0 0 ${r1(a2x)} ${r1(a2y)}Z" fill="#000" fill-opacity=".035"/>`; }
            svg += `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="currentColor" stroke-opacity=".2"/>` + T(tx, ty, D < 420 ? MOIS[m].slice(0, 3).replace('.', '') : MOIS[m], {anchor: 'middle', size: fs * (D < 420 ? .72 : .85), weight: 600});
        }
        kinds.forEach((k, i) => { const r = Rin + ringW * (i + 1); svg += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="none" stroke="currentColor" stroke-opacity=".12"/>`; });
        // les points : ceux d'un même jour s'empilent dans l'anneau
        const dot = clamp(num(o.dot) || Math.min(7, ringW / 4.2, D / 90), 1.2, 12), stack = new Map();
        list.sort((a, b) => a.day - b.day).forEach(x => {
            const i = kinds.indexOf(x.kind), key = i + ':' + x.day, s = stack.get(key) || 0; stack.set(key, s + 1);
            const r = Rin + ringW * i + dot * 1.4 + s * dot * 2.1; if (r > Rin + ringW * (i + 1) - dot) return;
            const [x0, y0] = pt(ang(x.day + .5), r), d = new Date(2000, 0, 1 + x.day);
            svg += `<circle cx="${r1(x0)}" cy="${r1(y0)}" r="${r2(dot)}" fill="${kc(x.kind, i)}"${x.pid ? PID(x.pid) : PIDS(x.ids, x.label)}>${tip(`${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS_L[d.getMonth()]} — ${WK[x.kind]?.[0]?.replace(/s$/, '') || x.kind} : ${x.label}${x.year ? ' (' + x.year + ')' : ''}`)}</circle>`;
        });
        if (o.today !== false) { const t = new Date(), d = P.dayOfYear(`${t.getMonth() + 1}-${t.getDate()}`), [x1, y1] = pt(ang(d + .5), Rin * .92), [x2, y2] = pt(ang(d + .5), Rout + fs * .2); const [tx, ty] = pt(ang(d + .5), Rin * .78); svg += `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="#d62728" stroke-width="1.6"/>${T(tx, ty, 'aujourd’hui', {anchor: 'middle', size: fs * .7, fill: '#d62728', weight: 600, halo: '#ffffff'})}`; }
        // au centre : le mois le plus chargé
        const perM = new Array(12).fill(0); list.forEach(x => { perM[CUM.findIndex((c, m) => x.day < CUM[m + 1])]++; });
        const best = perM.indexOf(Math.max(...perM));
        if (o.center !== false && Rin > fs * 2.5) { svg += T(cx, cy + fs * .5, `${list.length}`, {anchor: 'middle', size: fs * 1.6, weight: 700}) + T(cx, cy + fs * 1.7, `dates · surtout en ${MOIS_L[best]}`, {anchor: 'middle', size: fs * .72, fill: '#555'}); }
        return {h: Math.ceil(D), svg, legend: kinds.map((k, i) => ({label: `${WK[k]?.[0] || k} (${list.filter(x => x.kind === k).length})`, color: kc(k, i)})), desc: `Roue de l’année : ${list.length} dates, surtout en ${MOIS_L[best]}.`};
    }
    const sampleWheel = () => [['01-14', 'birth', 'Hugo', '2014'], ['03-02', 'birth', 'Marie', '1925'], ['03-19', 'fete', 'Joseph (saint Joseph)', ''], ['04-20', 'birth', 'Léa', '2017'], ['05-07', 'union', 'Jean et Marie', '1949'], ['06-06', 'birth', 'Pierre', '1958'], ['06-24', 'fete', 'Jean (saint Jean-Baptiste)', ''],
        ['07-14', 'union', 'Pierre et Claire', '1985'], ['08-15', 'fete', 'Marie (Assomption)', ''], ['09-17', 'union', 'Joseph et Anne', '1979'], ['10-02', 'death', 'Joseph', '2010'], ['11-11', 'birth', 'Anne', '1955'], ['12-12', 'birth', 'Claire', '1960'], ['12-24', 'death', 'Marie', '2001'], ['01-20', 'death', 'Jean', '1999']]
        .map(([date, kind, label, year]) => ({date, kind, label, year}));

    /* ═════════ Axes communs (chiffres) ═════════ */
    function axisY(lo, hi, x0, x1, top, ph, fs, {right = false, unit = '', grid = true} = {}) {
        const Y = v => top + ph - (v - lo) / (hi - lo || 1) * ph; let s = '';
        ticksOf(lo, hi, Math.round(ph / 45)).forEach(v => { const y = Y(v); if (grid) s += `<line x1="${r1(x0)}" y1="${r1(y)}" x2="${r1(x1)}" y2="${r1(y)}" stroke="currentColor" stroke-opacity=".1"/>`; s += T(right ? x1 + 5 : x0 - 5, y, fmt(v, 2) + (unit ? ' ' + unit : ''), {anchor: right ? 'start' : 'end', size: fs * .78, fill: '#555'}); });
        return {svg: s, Y};
    }
    /** les noms sous l'axe : un sur deux, trois… s'ils ne tiennent pas ; « 1775–1799 » devient « 1775 » si la place manque */
    const xLabels = (labels, X, y, fs, maxW) => {
        if (!labels.length) return '';
        const f = fs * .78, slot = Math.max(1, maxW / labels.length), full = Math.max(...labels.map(l => textW(l, f))), short = labels.map(l => String(l).split(/[–-](?=\d)/)[0]);
        const useShort = full + 6 > slot * 2 && short.some((x, i) => x !== labels[i]), L = useShort ? short : labels, lw = Math.max(...L.map(l => textW(l, f)));
        const step = Math.max(1, Math.ceil((lw + 6) / slot));
        return L.map((l, i) => (i % step ? '' : T(X(i), y, cut(l, slot * step - 4, f), {anchor: 'middle', size: f}))).join('');
    };
    const tableRows = (spec, n) => rows(spec, 'rows', n).map(r => ({label: str(r.label, 80), r, ids: pidList(r.ids), off: !!r.__off}));
    /* ⚙️ Personnaliser (heritage-diagram-perso.js) : ▶ lecture dans le temps, lignes de repère, annotations à une date */
    const labYear = l => { const m = String(l ?? '').match(/^\s*(-?\d{3,4})(?!\d)/); return m ? Number(m[1]) : null; };
    const yearsOfRows = spec => { const ys = rows(spec, 'rows', 6000).map(r => labYear(r.label)); return ys.length >= 3 && ys.every(y => y !== null) ? ys : null; };
    /** lecture : les lignes à venir restent à leur place, vides (l'échelle ne bouge pas) */
    const OFF_TIME = {range: sp => { const ys = yearsOfRows(sp); return ys ? [Math.min(...ys), Math.max(...ys)] : null; },
        at: (sp, y) => { sp.o = {...(sp.o || {}), __year: y}; sp.rows = rows(sp, 'rows', 6000).map(r => (labYear(r.label) > y + 1e-9 ? {...r, __off: true} : r)); return sp; }};
    const STEP_TIME = {range: sp => { const l = rows(sp, 'rows', 6000); if (l.length < 2 || !l.every(r => isNum(r.label))) return null; const xs = l.map(r => num(r.label)); return [Math.min(...xs), Math.max(...xs)]; },
        at: (sp, y) => { sp.o = {...(sp.o || {}), __year: y}; return sp; }};
    const timePts = (list, X) => { const P = list.map((x, i) => [labYear(x.label), X(i)]); return P.length >= 2 && P.every(q => q[0] !== null) ? P : null; };

    /* ═════════ 8 📊 Barres + courbe (deuxième axe à droite) ═════════ */
    function barline(spec, W, fs) {
        const o = spec.o || {}, S = seriesOf(spec), list = tableRows(spec, 400);
        if (!list.length || S.length < 2) return empty(W, fs, 'Il faut au moins deux colonnes de chiffres : des barres à gauche, une courbe à droite.');
        const li = clamp(isNum(o.y2) ? Math.round(num(o.y2)) : isNum(o.lineSeries) ? Math.round(num(o.lineSeries)) - 1 : S.length - 1, 0, S.length - 1), bars = S.map((s, j) => j).filter(j => j !== li);
        const bv = list.flatMap(x => bars.map(j => val(x.r, j)).filter(v => v !== null)), lv = list.map(x => val(x.r, li)).filter(v => v !== null);
        if (!bv.length && !lv.length) return empty(W, fs, 'Aucun chiffre dans le tableau.');
        const blo = Math.min(0, ...bv), bhi = Math.max(1e-9, ...bv) * 1.08, llo = o.lineZero === false ? Math.min(...lv) : Math.min(0, ...lv), lhi = (Math.max(...lv, llo + 1e-9)) * 1.08;
        const ph = clamp(num(o.height) || W * .45, 120, 1200), lW = textW(fmt(bhi, 1) + ' ' + str(o.unit, 12), fs * .78) + 10, rW = textW(fmt(lhi, 1) + ' ' + str(o.unit2, 12), fs * .78) + 10, x0 = lW, x1 = W - rW, top = fs * 1.4;
        const A1 = axisY(blo, bhi, x0, x1, top, ph, fs, {unit: str(o.unit, 12)}), A2 = axisY(llo, lhi, x0, x1, top, ph, fs, {right: true, grid: false, unit: str(o.unit2, 12)});
        const n = list.length, slot = (x1 - x0) / n, X = i => x0 + slot * (i + .5), gw = slot * clamp((num(o.barW) || 70) / 100, .2, 1), bw = gw / Math.max(1, bars.length);
        let svg = A1.svg + A2.svg + T(x0, fs * .5, str(o.yLabel, 60) || S[bars[0]]?.name || '', {size: fs * .8, weight: 600, fill: S[bars[0]]?.color}) + T(x1, fs * .5, str(o.y2Label, 60) || S[li].name, {anchor: 'end', size: fs * .8, weight: 600, fill: S[li].color});
        list.forEach((x, i) => bars.forEach((j, k) => { const v = val(x.r, j); if (v === null || x.off) return; const y = A1.Y(Math.max(0, v)), y0 = A1.Y(Math.min(0, v)); svg += `<rect x="${r1(X(i) - gw / 2 + k * bw)}" y="${r1(y)}" width="${r1(Math.max(.5, bw - 1))}" height="${r1(Math.max(.5, y0 - y))}" fill="${S[j].color}"${PIDS(x.ids, `${x.label} — ${S[j].name}`)}>${tip(`${x.label} — ${S[j].name} : ${fmt(v, 2)}`)}</rect>`; }));
        svg += `<line x1="${r1(x0)}" y1="${r1(A1.Y(0))}" x2="${r1(x1)}" y2="${r1(A1.Y(0))}" stroke="currentColor" stroke-opacity=".5"/>`;
        const pts = list.map((x, i) => [X(i), x.off ? null : val(x.r, li)]).filter(p => p[1] !== null).map(([x, v]) => [x, A2.Y(v), v]);
        if (pts.length) svg += `<path d="${pts.map((p, k) => (k ? 'L' : 'M') + r1(p[0]) + ' ' + r1(p[1])).join('')}" fill="none" stroke="${S[li].color}" stroke-width="${r2(clamp(num(o.lineW) || 2.6, .5, 8))}" stroke-linejoin="round"/>` + pts.map(p => `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r2(clamp(num(o.dot) || 3.2, 0, 10))}" fill="#fff" stroke="${S[li].color}" stroke-width="2">${tip(`${S[li].name} : ${fmt(p[2], 2)}`)}</circle>`).join('');
        if (o.values) list.forEach((x, i) => { const v = val(x.r, li); if (v !== null && !x.off) svg += T(X(i), A2.Y(v) - fs * .8, fmt(v, 1), {anchor: 'middle', size: fs * .72, fill: S[li].color, halo: '#ffffff'}); });
        svg += xLabels(list.map(x => x.label), X, top + ph + fs * .9, fs, x1 - x0);
        return {h: Math.ceil(top + ph + fs * 1.8), svg, legend: [...bars.map(j => ({label: `${S[j].name} (à gauche)`, color: S[j].color})), {label: `${S[li].name} (à droite)`, color: S[li].color, type: 'line'}], desc: `Barres et courbe : ${n} lignes.`,
            axis: {dir: 'y', x0, y0: top, w: x1 - x0, h: ph, lo: blo, hi: bhi, unit: str(o.unit, 12), series: [...bars.map(j => ({name: S[j].name, color: S[j].color, values: list.filter(x => !x.off).map(x => val(x.r, j)).filter(v => v !== null)})), {name: S[li].name, color: S[li].color, right: true, values: list.filter(x => !x.off).map(x => val(x.r, li)).filter(v => v !== null)}]},
            ...(timePts(list, X) ? {time: {x0, y0: top, w: x1 - x0, h: ph, points: timePts(list, X)}} : {})};
    }
    const samplePeriods = () => [['1750', 18, 31.2], ['1775', 24, 33.5], ['1800', 31, 36.1], ['1825', 38, 41.8], ['1850', 41, 44.3], ['1875', 35, 49.0], ['1900', 27, 56.4], ['1925', 19, 63.1], ['1950', 14, 71.8]].map(([label, s0, s1]) => ({label, s0: String(s0), s1: String(s1)}));

    /* ═════════ 9 ↔️ Barres divergentes ═════════ */
    function diverging(spec, W, fs) {
        const o = spec.o || {}, S = seriesOf(spec); let list = tableRows(spec, 300);
        if (!list.length) return empty(W, fs, 'Ajoute des lignes : un nom et deux chiffres (gauche, droite), ou un seul chiffre autour du centre.');
        const two = S.length >= 2 && o.mode !== 'one', center = isNum(o.center) ? num(o.center) : 0;
        const L = x => (two ? Math.abs(val(x.r, 0) ?? 0) : Math.max(0, center - (val(x.r, 0) ?? center))), Rv = x => (two ? Math.abs(val(x.r, 1) ?? 0) : Math.max(0, (val(x.r, 0) ?? center) - center));
        if (o.sort === 'diff') list = [...list].sort((a, b) => (Rv(b) - L(b)) - (Rv(a) - L(a))); else if (o.sort === 'total') list = [...list].sort((a, b) => (Rv(b) + L(b)) - (Rv(a) + L(a)));
        const m = Math.max(1e-9, ...list.map(L), ...list.map(Rv)) * 1.05, labIn = o.labels === 'middle';
        const labW = labIn ? 0 : Math.min(W * .3, Math.max(...list.map(x => textW(x.label, fs * .82))) + 8), bandH = clamp(num(o.rowH) || fs * 1.6, 6, 60), top = fs * 1.6;
        const cxp = labW + (W - labW) / 2, half = (W - labW) / 2 - textW(fmt(m, 0), fs * .78) - 6;
        const cL = two ? S[0].color : color(o.leftColor, '#e15759'), cR = two ? S[1].color : color(o.rightColor, '#4e79a7');
        let svg = T(cxp - 6, fs * .5, str(o.leftLabel, 60) || (two ? S[0].name : `Sous ${fmt(center, 2)}`), {anchor: 'end', size: fs * .85, weight: 700, fill: cL}) + T(cxp + 6, fs * .5, str(o.rightLabel, 60) || (two ? S[1].name : `Au-dessus de ${fmt(center, 2)}`), {size: fs * .85, weight: 700, fill: cR});
        list.forEach((x, i) => {
            if (x.off) return;
            const y = top + i * (bandH + 3), l = L(x) / m * half, r = Rv(x) / m * half;
            svg += `<g${PIDS(x.ids, x.label)}>${tip(`${x.label} : ${two ? `${S[0].name} ${fmt(L(x), 2)} · ${S[1].name} ${fmt(Rv(x), 2)}` : fmt(val(x.r, 0) ?? 0, 2)}`)}`
                + (labIn ? '' : T(labW - 6, y + bandH / 2, cut(x.label, labW - 8, fs * .82), {anchor: 'end', size: fs * .82}))
                + (l > 0 ? `<rect x="${r1(cxp - l)}" y="${r1(y)}" width="${r1(l)}" height="${r1(bandH)}" fill="${cL}" rx="2"/>` : '') + (r > 0 ? `<rect x="${r1(cxp)}" y="${r1(y)}" width="${r1(r)}" height="${r1(bandH)}" fill="${cR}" rx="2"/>` : '')
                + (o.values !== false ? (l > 0 ? T(cxp - l - 3, y + bandH / 2, fmt(two ? L(x) : -L(x), 1), {anchor: 'end', size: fs * .72, fill: '#555'}) : '') + (r > 0 ? T(cxp + r + 3, y + bandH / 2, fmt(Rv(x), 1), {size: fs * .72, fill: '#555'}) : '') : '')
                + (labIn ? T(cxp, y + bandH / 2, cut(x.label, half, fs * .78), {anchor: 'middle', size: fs * .78, weight: 600, fill: '#1d1d1f', halo: '#ffffffcc'}) : '') + '</g>';
        });
        const h = top + list.length * (bandH + 3);
        svg += `<line x1="${r1(cxp)}" y1="${r1(top - 3)}" x2="${r1(cxp)}" y2="${r1(h)}" stroke="currentColor" stroke-opacity=".6"/>`;
        const shown = list.filter(x => !x.off);
        return {h: Math.ceil(h + 4), svg, legend: [], desc: `Barres divergentes : ${list.length} lignes.`,
            axis: {dir: 'x', x0: cxp - half, y0: top, w: half * 2, h: h - top, lo: -m, hi: m, series: [{name: two ? S[0].name : 'Sous le centre', color: cL, values: shown.map(x => -L(x))}, {name: two ? S[1].name : 'Au-dessus', color: cR, values: shown.map(Rv)}]}};
    }
    const sampleDiv = () => [['1800–1824', 22, 19], ['1825–1849', 31, 24], ['1850–1874', 35, 33], ['1875–1899', 28, 37], ['1900–1924', 19, 30], ['1925–1949', 15, 21], ['1950–1974', 12, 9]].map(([label, s0, s1]) => ({label, s0: String(s0), s1: String(s1)}));

    /* ═════════ 10 🏔 Collines empilées ═════════ */
    function hills(spec, W, fs) {
        const o = spec.o || {}, S = seriesOf(spec), list = tableRows(spec, 600);
        if (!list.length || !S.length) return empty(W, fs, 'Ajoute des lignes (années, décennies…) et une colonne de chiffres par colline.');
        const n = list.length, labW = Math.min(W * .3, Math.max(...S.map(s => textW(s.name, fs * .85))) + 10), x0 = labW, x1 = W - 6;
        const rowH = clamp(num(o.rowHeight) || fs * 2.8, 10, 200), lap = clamp((isNum(o.overlap) ? num(o.overlap) : 140) / 100, 0, 4), top = rowH * (1 + lap) + 4;
        const same = o.scaleBy === 'same', gmax = Math.max(1e-9, ...S.flatMap((s, j) => list.map(x => val(x.r, j) ?? 0)));
        const X = i => x0 + (n > 1 ? i / (n - 1) : .5) * (x1 - x0);
        const grad = o.colors === 'gradient', one = o.colors === 'one';
        let svg = '';
        S.forEach((s, j) => {
            const k = o.order === 'reverse' ? S.length - 1 - j : j, base = top + k * rowH, all = list.map(x => Math.max(0, val(x.r, j) ?? 0)), mx = same ? gmax : Math.max(1e-9, ...all), vals = all.map((v, i) => (list[i].off ? 0 : v)), hh = rowH * (1 + lap);
            const pts = vals.map((v, i) => [X(i), base - v / mx * hh]);
            let d = `M${r1(x0)} ${r1(base)}`;
            if (o.smooth !== false && pts.length > 2) { d += `L${r1(pts[0][0])} ${r1(pts[0][1])}`; for (let i = 1; i < pts.length; i++) { const [xa, ya] = pts[i - 1], [xb, yb] = pts[i], mxp = (xa + xb) / 2; d += `C${r1(mxp)} ${r1(ya)} ${r1(mxp)} ${r1(yb)} ${r1(xb)} ${r1(yb)}`; } }
            else pts.forEach(p => { d += `L${r1(p[0])} ${r1(p[1])}`; });
            d += `L${r1(x1)} ${r1(base)}Z`;
            const c = one ? color(o.oneColor, '#4e79a7') : grad ? mix(color(o.lowColor, '#9ecae1'), color(o.highColor, '#08519c'), S.length > 1 ? j / (S.length - 1) : 1) : s.color;
            const peak = vals.indexOf(Math.max(...vals)), tot = vals.reduce((a, b) => a + b, 0);
            svg += `<g>${tip(`${s.name} : ${fmt(tot, 0)} en tout, le plus en ${list[peak]?.label || ''} (${fmt(vals[peak] || 0, 0)})`)}<path d="${d}" fill="${c}" fill-opacity="${r2(clamp(num(o.opacity) || 80, 10, 100) / 100)}" stroke="${o.line === false ? 'none' : '#ffffff'}" stroke-width="1.2"/></g>`
                + `<line x1="${r1(x0)}" y1="${r1(base)}" x2="${r1(x1)}" y2="${r1(base)}" stroke="currentColor" stroke-opacity=".25"/>` + T(labW - 6, base - fs * .4, cut(s.name, labW - 8, fs * .85), {anchor: 'end', size: fs * .85, weight: 600});
            if (o.peaks) svg += T(pts[peak][0], pts[peak][1] - fs * .5, list[peak].label, {anchor: 'middle', size: fs * .7, fill: '#555', halo: '#ffffff'});
        });
        const bottom = top + (S.length - 1) * rowH;
        svg += xLabels(list.map(x => x.label), X, bottom + fs, fs, x1 - x0);
        return {h: Math.ceil(bottom + fs * 1.8), svg, legend: [], desc: `Collines empilées : ${S.length} séries sur ${n} périodes.`, ...(timePts(list, X) ? {time: {x0, y0: 0, w: x1 - x0, h: bottom, points: timePts(list, X)}} : {})};
    }
    const sampleHills = () => ({series: ['Martin', 'Durand', 'Garnier', 'Roux', 'Moreau'].map(name => ({name})), rows: ['1700', '1725', '1750', '1775', '1800', '1825', '1850', '1875', '1900', '1925', '1950'].map((label, i) => ({label, s0: String(Math.round(8 + 10 * Math.exp(-((i - 3) ** 2) / 6))), s1: String(Math.round(2 + 12 * Math.exp(-((i - 6) ** 2) / 4))), s2: String(Math.round(1 + 9 * Math.exp(-((i - 8) ** 2) / 3))), s3: String(Math.round(4 + 6 * Math.exp(-((i - 2) ** 2) / 5))), s4: String(Math.round(1 + 11 * Math.exp(-((i - 9) ** 2) / 2)))}))});

    /* ═════════ 11 🧵 Coordonnées parallèles ═════════ */
    function parallel(spec, W, fs) {
        const o = spec.o || {}, S = seriesOf(spec), list = tableRows(spec, 3000).map(x => ({...x, group: str(x.r.group, 60), pid: pid(x.r.pid)}));
        if (!list.length || S.length < 2) return empty(W, fs, 'Il faut au moins deux colonnes de chiffres (les axes) et une ligne par personne ou par chose.');
        const ax = S.map((s, j) => { const v = list.map(x => val(x.r, j)).filter(v => v !== null); let lo = Math.min(...v), hi = Math.max(...v); if (!v.length) { lo = 0; hi = 1; } if (!(hi > lo)) hi = lo + 1; return {s, lo, hi}; });
        const groups = [...new Set(list.map(x => x.group || 'Tous'))].slice(0, 20), gc = new Map(groups.map((g, i) => [g, color(rows(spec, 'cats', 40).find(c => str(c.value) === g)?.color, pick(spec, i))]));
        const ph = clamp(num(o.height) || W * .5, 120, 1400), top = fs * 2.6, padX = Math.min(W * .12, textW(S[0].name, fs * .8) / 2 + 8), x0 = padX, x1 = W - padX;
        const X = j => x0 + (S.length > 1 ? j / (S.length - 1) : .5) * (x1 - x0), Y = (a, v) => top + ph - (v - a.lo) / (a.hi - a.lo) * ph;
        const hl = str(o.highlight, 60), op = clamp(num(o.opacity) || 55, 5, 100) / 100;
        let svg = '';
        ax.forEach((a, j) => { const x = X(j); svg += `<line x1="${r1(x)}" y1="${r1(top)}" x2="${r1(x)}" y2="${r1(top + ph)}" stroke="currentColor" stroke-opacity=".55"/>` + T(x, top - fs * 1.4, cut(a.s.name, (x1 - x0) / Math.max(1, S.length - 1) * .95 + (j === 0 || j === S.length - 1 ? padX : 0), fs * .8), {anchor: 'middle', size: fs * .8, weight: 700}) + T(x, top - fs * .45, fmt(a.hi, 1), {anchor: 'middle', size: fs * .7, fill: '#666'}) + T(x, top + ph + fs * .7, fmt(a.lo, 1), {anchor: 'middle', size: fs * .7, fill: '#666'}); });
        list.forEach(x => {
            const g = x.group || 'Tous', c = gc.get(g) || '#888', dim = hl && g !== hl && !x.label.includes(hl);
            let d = '', pen = false;
            ax.forEach((a, j) => { const v = val(x.r, j); if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${r1(X(j))} ${r1(Y(a, v))}`; pen = true; });
            if (d) svg += `<path d="${d}" fill="none" stroke="${c}" stroke-opacity="${dim ? .08 : op}" stroke-width="${r2(clamp(num(o.lineW) || 1.4, .3, 6))}"${PID(x.pid)}>${tip(`${x.label}${x.group ? ' (' + x.group + ')' : ''}\n${S.map((s, j) => `${s.name} : ${val(x.r, j) === null ? '—' : fmt(val(x.r, j), 1)}`).join('\n')}`)}</path>`;
        });
        return {h: Math.ceil(top + ph + fs * 1.4), svg, legend: groups.length > 1 || list.some(x => x.group) ? groups.map(g => ({label: `${g} (${list.filter(x => (x.group || 'Tous') === g).length})`, color: gc.get(g)})) : [], desc: `Coordonnées parallèles : ${list.length} lignes sur ${S.length} axes.`};
    }
    const sampleParallel = () => ({series: ['Âge au mariage', 'Âge au 1er enfant', 'Enfants', 'Âge au décès'].map(name => ({name})),
        rows: [['Jean', 'XVIIIe s.', 24, 25, 9, 58], ['Marie', 'XVIIIe s.', 19, 21, 11, 47], ['Pierre', 'XVIIIe s.', 28, 30, 6, 71], ['Anne', 'XVIIIe s.', 22, 23, 8, 39], ['Louis', 'XIXe s.', 27, 28, 5, 66], ['Rose', 'XIXe s.', 23, 24, 4, 81], ['Paul', 'XIXe s.', 30, 32, 3, 74], ['Jeanne', 'XIXe s.', 21, 22, 7, 62], ['Marcel', 'XXe s.', 26, 28, 2, 79], ['Simone', 'XXe s.', 22, 24, 3, 88]]
            .map(([label, group, a, b, c, d]) => ({label, group, s0: String(a), s1: String(b), s2: String(c), s3: String(d)}))});

    /* ═════════ 12 📶 Courbe en escalier ═════════ */
    function stepline(spec, W, fs) {
        const o = spec.o || {}, S = seriesOf(spec), list = tableRows(spec, 6000);
        if (!list.length) return empty(W, fs, 'Ajoute des lignes : une année (ou un nom) et un chiffre.');
        const numeric = list.every(x => isNum(x.label)), xs = numeric ? list.map(x => num(x.label)) : list.map((_, i) => i);
        const xlo = Math.min(...xs), xhi = Math.max(...xs) + (numeric ? 0 : 1) || xlo + 1;
        const vs = list.flatMap(x => S.map((_, j) => val(x.r, j)).filter(v => v !== null));
        const lo = o.fromZero === false ? Math.min(...vs) : Math.min(0, ...vs), hi = Math.max(lo + 1e-9, ...vs) * 1.06;
        const ph = clamp(num(o.height) || W * .42, 100, 1200), lW = textW(fmt(hi, 0) + ' ' + str(o.unit, 12), fs * .78) + 10, x0 = lW, x1 = W - 8, top = fs * .8;
        const A = axisY(lo, hi, x0, x1, top, ph, fs, {unit: str(o.unit, 12)}), X = v => x0 + (v - xlo) / ((xhi - xlo) || 1) * (x1 - x0);
        let svg = A.svg;
        S.forEach((s, j) => {
            const pts = list.map((x, i) => [xs[i], val(x.r, j), x]).filter(p => p[1] !== null && !(numeric && isNum(o.__year) && p[0] > num(o.__year) + 1e-9)).sort((a, b) => a[0] - b[0]); if (!pts.length) return;
            const before = o.step === 'before'; let d = `M${r1(X(pts[0][0]))} ${r1(A.Y(pts[0][1]))}`;
            for (let k = 1; k < pts.length; k++) { const [xb, yb] = pts[k]; d += before ? `V${r1(A.Y(yb))}H${r1(X(xb))}` : `H${r1(X(xb))}V${r1(A.Y(yb))}`; }
            if (!numeric) d += `H${r1(X(pts[pts.length - 1][0] + 1))}`;
            if (o.fill !== false && S.length === 1) svg += `<path d="${d}V${r1(A.Y(Math.max(lo, 0)))}H${r1(X(pts[0][0]))}Z" fill="${s.color}" fill-opacity=".14"/>`;
            svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${r2(clamp(num(o.lineW) || 2.2, .5, 8))}" stroke-linejoin="miter"/>`;
            // un repère tous les … (et au plus haut)
            const peak = pts.reduce((m, p) => (p[1] > m[1] ? p : m), pts[0]);
            if (o.peak !== false) svg += `<circle cx="${r1(X(peak[0]))}" cy="${r1(A.Y(peak[1]))}" r="3.5" fill="${s.color}"/>` + T(X(peak[0]), A.Y(peak[1]) - fs * .8, `${fmt(peak[1], 0)} en ${numeric ? peak[0] : peak[2].label}`, {anchor: X(peak[0]) > W * .8 ? 'end' : X(peak[0]) < W * .2 ? 'start' : 'middle', size: fs * .75, weight: 600, fill: s.color, halo: '#ffffff'});
            if (list.length <= 400) pts.forEach(p => { if (p[2].ids.length) svg += `<rect x="${r1(X(p[0]) - 2)}" y="${r1(A.Y(p[1]) - 4)}" width="${r1(Math.max(4, (x1 - x0) / pts.length))}" height="8" fill="transparent"${PIDS(p[2].ids, p[2].label)}>${tip(`${p[2].label} : ${fmt(p[1], 1)}`)}</rect>`; });
        });
        svg += `<line x1="${r1(x0)}" y1="${r1(top + ph)}" x2="${r1(x1)}" y2="${r1(top + ph)}" stroke="currentColor" stroke-opacity=".5"/>`;
        if (numeric) ticksOf(xlo, xhi, Math.round((x1 - x0) / 70)).forEach(v => { svg += T(X(v), top + ph + fs * .9, String(v), {anchor: 'middle', size: fs * .78}); });
        else svg += xLabels(list.map(x => x.label), i => X(i + .5), top + ph + fs * .9, fs, x1 - x0);
        return {h: Math.ceil(top + ph + fs * 1.9), svg, legend: S.length > 1 ? S.map(s => ({label: s.name, color: s.color, type: 'line'})) : [], desc: `Courbe en escalier : ${list.length} points.`,
            axis: {dir: 'y', x0, y0: top, w: x1 - x0, h: ph, lo, hi, unit: str(o.unit, 12), series: S.map((s, j) => ({name: s.name, color: s.color, values: list.map(x => val(x.r, j)).filter(v => v !== null)}))},
            time: numeric ? {x0, y0: top, w: x1 - x0, h: ph, from: xlo, to: xhi} : (timePts(list, i => X(i + .5)) ? {x0, y0: top, w: x1 - x0, h: ph, points: timePts(list, i => X(i + .5))} : undefined)};
    }
    const sampleAlive = () => { const out = []; let n = 4; for (let y = 1780; y <= 2020; y += 5) { n = Math.max(2, Math.round(n + Math.sin(y / 23) * 3 + (y > 1850 && y < 1914 ? 2 : 0) - (y >= 1914 && y <= 1918 ? 6 : 0) + (y > 1950 ? 1 : 0))); out.push({label: String(y), s0: String(n)}); } return out; };

    /* ═════════ « Depuis l'app » ═════════ */
    const get = q => A().api('diagram_plus', {...q, ...(ext.diagramAppOpts?.extra?.() || {})}); // + le groupe de personnes et la période communs (heritage-diagram-options.js)
    const PK = (name, o = {}) => (window.LCNDA_PICKER?.pickerField ? window.LCNDA_PICKER.pickerField({name, kind: 'person', ...o}) : `<input name="${esc(name)}" inputmode="numeric" placeholder="n° de fiche">`);
    const startId = () => Number(A()?.state?.bootstrap?.startPersonId) || null;
    const curId = () => Number(A()?.state?.currentPersonId) || startId();
    const field = (pane, name) => Number(pane.querySelector(`[name="${name}"]`)?.value) || 0;
    const v = (pane, k) => pane.querySelector(`[data-dpl="${k}"]`);
    const sel = (k, opts, def = '') => `<select data-dpl="${k}">${opts.map(([x, l]) => `<option value="${esc(x)}" ${String(x) === String(def) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const SHARE = '<label class="ui-toggle"><input type="checkbox" data-dpl="share"><i></i>🔒 Pour partager : sans les noms des personnes en vie</label>';
    const ROOT = () => `<span class="pk-lab">Personne de départ</span>${PK("dpl_root", {value: startId()})}`;
    const GENS = (def, min, max) => `<label>Générations${sel('gens', Array.from({length: max - min + 1}, (_, i) => [min + i, `${min + i} générations`]), def)}</label>`;
    const SCOPE = `<label>Personnes comptées${sel('scope', [['', 'Toute ma base'], ['anc', 'Les ancêtres de la personne de départ']])}</label>`;
    const box = (title, intro, inner, go = 'Prendre dans ma base') => `<div class="h-dg-app dpl-app"><h4>${title}</h4><p class="muted">${intro}</p><div class="dpl-form">${inner}</div><button type="button" class="button small" data-dpl-go>${esc(go)}</button><p class="muted" data-dpl-msg aria-live="polite"></p></div>`;
    function bindGo(pane, run) {
        const btn = pane.querySelector('[data-dpl-go]'), msg = pane.querySelector('[data-dpl-msg]'); if (!btn) return;
        btn.addEventListener('click', async () => { btn.disabled = true; if (msg) msg.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner('Lecture de ta généalogie…', {inline: true}) : 'Lecture…';
            try { const t = await run(); A().toast?.(t || 'Données prises dans ta base.'); if (msg?.isConnected) msg.textContent = ''; } catch (e) { if (msg) msg.textContent = '⚠️ ' + (e.message || e); } finally { btn.disabled = false; } });
    }
    const titleIf = (s, k, t) => { s.o = s.o || {}; if (!s.o.title || s.o.title === K[k].sample().o?.title) s.o.title = t; };
    const rootOf = pane => field(pane, 'dpl_root') || startId() || 0;
    const share = pane => (v(pane, 'share')?.checked ? '1' : '');

    const kinApp = {
        html: () => box('🔗 Deux personnes de ma base', 'L’app cherche le plus court chemin : on remonte jusqu’à l’ancêtre commun et on redescend ; avec les alliances, elle passe aussi par les époux (beau-frère, cousin de l’épouse…). Un même lien par plusieurs ancêtres (implexe) est signalé.',
            `<span class="pk-lab">Première personne</span>${PK('dpl_a', {value: curId()})}<span class="pk-lab">Deuxième personne</span>${PK('dpl_b')}<label class="ui-toggle"><input type="checkbox" data-dpl="all" checked><i></i>Passer aussi par les alliances (époux, épouses)</label>${SHARE}`, 'Trouver le chemin'),
        bind: (pane, io) => bindGo(pane, async () => {
            const a = field(pane, 'dpl_a'), b = field(pane, 'dpl_b');
            if (!a || !b) throw new Error('Choisis les deux personnes dans les menus.');
            const r = await get({what: 'kinpath', a, b, alliances: v(pane, 'all').checked ? '1' : '0', share: share(pane)});
            const G = P.normGraph(r.nodes || {}), path = P.kinPath(G, a, b, {alliances: v(pane, 'all').checked});
            if (!path) throw new Error(v(pane, 'all').checked ? 'Aucun lien trouvé entre ces deux personnes dans ta base.' : 'Aucun ancêtre commun : essaie avec les alliances.');
            const N = id => r.nodes[id] || {};
            const s = io.spec(); s.rows = path.path.map((id, k) => ({name: N(id).n || 'Sans nom', sex: N(id).s || '', years: N(id).y || '', step: k ? path.steps[k - 1] : '', pid: N(id).pid ? String(N(id).pid) : ''}));
            const all = P.kinAll(G, a, b, N(a).s || ''), main = all[0];
            s.others = all.filter((x, k) => k > 0 || x.via.length > 2).slice(0, 6).map(x => ({label: `${x.word} par ${x.via.slice(0, 3).map(id => N(id).n).join(' et ')}${x.via.length > 3 ? '…' : ''}`}));
            if (main && all.length > 1) s.others.unshift({label: `liens de sang par ${all.length} branches (implexe)`});
            titleIf(s, 'dplkin', `${N(a).n} et ${N(b).n}`); io.apply(s);
            return `Chemin trouvé en ${path.steps.length} étape${path.steps.length > 1 ? 's' : ''}.`;
        }),
    };
    const placesApp = (k, gens) => ({
        html: () => box(k === 'dplgrav' ? '🎯 Les lieux de naissance de mes ancêtres' : '🌈 Les lieux de naissance de mes ancêtres', 'Chaque ancêtre (numéro Sosa) est placé à son lieu de naissance (ou de baptême), avec sa génération. Les lieux sans coordonnées sont laissés de côté.', `${ROOT()}${GENS(gens, 3, 16)}${SHARE}`),
        bind: (pane, io) => bindGo(pane, async () => {
            const r = await get({what: 'ancplaces', root: rootOf(pane), gens: v(pane, 'gens').value, share: share(pane)});
            if (!r.rows?.length) throw new Error(`Aucun ancêtre dont le lieu de naissance a des coordonnées${r.missing ? ` (${r.missing} sans lieu situé)` : ''}.`);
            const s = io.spec(); s.rows = r.rows.map(x => ({label: `${x.place} ${x.lat}, ${x.lon}`, gen: String(x.gen), name: x.name, year: x.year ? String(x.year) : '', pid: x.pid ? String(x.pid) : ''}));
            s.o = {...(s.o || {}), frame: '', view: ''};
            titleIf(s, k, k === 'dplgrav' ? `Le centre de la famille de ${r.root_name}` : `Les générations de ${r.root_name}`); io.apply(s);
            return `${r.rows.length} lieux de naissance pris dans ta base${r.missing ? ` (${r.missing} sans lieu situé)` : ''}.`;
        }),
    });
    const completeApp = {
        html: () => box('🧩 L’ascendance d’une personne', 'Pour chaque génération : les ancêtres possibles (1, 2, 4, 8…), les places trouvées et les personnes différentes (implexe).', `${ROOT()}${GENS(10, 4, 30)}`),
        bind: (pane, io) => bindGo(pane, async () => {
            const r = await get({what: 'completeness', root: rootOf(pane), gens: v(pane, 'gens').value});
            if (!r.rows?.length) throw new Error('Aucun ancêtre trouvé pour cette personne.');
            const s = io.spec(); s.rows = r.rows.map(x => ({gen: String(x.gen), theo: x.theo, found: String(x.found), distinct: String(x.distinct), ids: x.ids})); s.known = (r.known || []).join(',');
            titleIf(s, 'dplcomp', `L’arbre de ${r.root_name} : ce qu’on connaît`); io.apply(s);
            return `${r.rows.length} générations prises dans ta base.`;
        }),
    };
    function printAhn(spec) {
        const UI = window.LCNDA_UI; if (!UI?.openPrintDialog) return;
        UI.openPrintDialog({title: str(spec.o?.title, 200) || 'Tableau d’ascendance', key: 'diagram-ahnentafel', photos: false,
            options: [{key: 'places', label: 'Les lieux', checked: true}, {key: 'jobs', label: 'Les métiers', checked: true}, {key: 'genHeads', label: 'Un titre par génération', checked: true}],
            html: c => ahnentafelHtml(spec, {places: c.places !== false, jobs: c.jobs !== false, genHeads: c.genHeads !== false})});
    }
    const ahnApp = {
        html: () => box('📜 Les ancêtres d’une personne', 'Une ligne par numéro Sosa : nom, naissance, mariage, décès (dates et lieux). Un ancêtre présent plusieurs fois (implexe) renvoie à son premier numéro.', `${ROOT()}${GENS(5, 2, 12)}${SHARE}`)
            + '<p><button type="button" class="button small secondary" data-dpl-print>🖨 Imprimer le tableau…</button></p>',
        bind: (pane, io) => {
            pane.querySelector('[data-dpl-print]')?.addEventListener('click', () => printAhn(io.spec()));
            bindGo(pane, async () => {
                const r = await get({what: 'ahnentafel', root: rootOf(pane), gens: v(pane, 'gens').value, share: share(pane)});
                if (!r.rows?.length) throw new Error('Aucun ancêtre trouvé pour cette personne.');
                const s = io.spec(); s.rows = r.rows.map(x => ({sosa: String(x.sosa), name: x.name, sex: x.sex, birth: x.birth, bplace: x.bplace, marriage: x.marriage, mplace: x.mplace, death: x.death, dplace: x.dplace, job: x.job, again: x.again, pid: x.pid ? String(x.pid) : ''}));
                titleIf(s, 'dplahn', `Tableau d’ascendance de ${r.root_name}`); io.apply(s);
                return `${r.rows.length} ancêtres pris dans ta base${r.truncated ? ' (arrêt à 4 096 lignes)' : ''}.`;
            });
        },
    };
    const leedsApp = {
        html: () => box('🧬 Mes correspondances ADN', 'Depuis l’onglet ADN : les correspondances d’un test et leurs « correspondances en commun ». La méthode de Leeds range celles de 90 à 400 cM (cousins de 2e et 3e degré) en groupes de couleur, souvent un par grand-parent.',
            `<label>Test${sel('kit', [['', 'Tous mes tests']])}</label><label>De<input data-dpl="lo" type="number" data-unit="cM" value="90" min="0" max="4000"></label><label>à<input data-dpl="hi" type="number" data-unit="cM" value="400" min="0" max="4000"></label>`),
        bind: (pane, io) => {
            A().api('dna', {}).then(d => { const s = v(pane, 'kit'); if (!s) return; (d.kits || []).forEach(k => { const o = document.createElement('option'); o.value = String(k.id); o.textContent = `${k.label || k.person_name || 'Test'}${k.company ? ' (' + k.company + ')' : ''}`; s.appendChild(o); }); }).catch(() => {});
            bindGo(pane, async () => {
                const d = await A().api('dna', {}), kit = Number(v(pane, 'kit').value) || 0;
                const ms = (d.matches || []).filter(m => !kit || Number(m.kit_id) === kit);
                if (!ms.length) throw new Error('Aucune correspondance ADN dans ta base (onglet ADN → Correspondances).');
                if (!ms.some(m => (m.data?.shared_matches || []).length)) throw new Error('Il manque les « correspondances en commun » : remplis-les dans l’onglet ADN (ou importe-les).');
                const s = io.spec(); s.rows = ms.slice(0, 2000).map(m => ({name: String(m.name || ''), cm: String(m.shared_cm ?? ''), shared: (m.data?.shared_matches || []).join('; '), pid: m.person_id ? String(m.person_id) : ''}));
                s.o = {...(s.o || {}), lo: v(pane, 'lo').value, hi: v(pane, 'hi').value};
                titleIf(s, 'dplleeds', 'Méthode de Leeds'); io.apply(s);
                return `${ms.length} correspondances prises dans l’onglet ADN.`;
            });
        },
    };
    const wheelApp = {
        html: () => box('🎡 Les dates de ma famille', 'Les naissances, mariages et décès datés au jour près, et la fête du prénom de chacun (calendrier des saints). Les fiches confidentielles ne sont jamais prises.',
            `<label>Qui${sel('who', [['living', 'Les personnes en vie (et leurs mariages)'], ['anc', 'Mes ancêtres'], ['all', 'Toute ma base']], 'living')}</label>${ROOT()}<div class="dpl-checks">${Object.entries(WK).map(([k, [l, , ic]]) => `<label class="checkbox-line"><input type="checkbox" data-dpl-k="${k}" ${k === 'death' ? '' : 'checked'}> ${ic} ${esc(l)}</label>`).join('')}</div>${SHARE}`),
        bind: (pane, io) => bindGo(pane, async () => {
            const kinds = [...pane.querySelectorAll('[data-dpl-k]:checked')].map(x => x.dataset.dplK); if (!kinds.length) throw new Error('Coche au moins une sorte de date.');
            const r = await get({what: 'wheel', who: v(pane, 'who').value, kinds: kinds.join(','), root: rootOf(pane), share: share(pane)});
            if (!r.rows?.length) throw new Error('Aucune date au jour près pour ce choix.');
            const s = io.spec(); s.rows = r.rows.map(x => ({date: x.date, kind: x.kind, label: x.label, year: x.year, pid: x.pid ? String(x.pid) : '', ids: x.ids || ''}));
            titleIf(s, 'dplwheel', 'L’année de la famille'); io.apply(s);
            return `${r.rows.length} dates prises dans ta base.`;
        }),
    };
    const STEPS = [['10', 'Par décennie'], ['25', 'Par quart de siècle'], ['50', 'Par demi-siècle'], ['100', 'Par siècle']];
    const periodsApp = k => ({
        html: () => box(k === 'dplbarline' ? '📊 Naissances et âge au décès' : '↔️ Naissances et décès', k === 'dplbarline' ? 'Les naissances de chaque période en barres (à gauche), l’âge moyen au décès en courbe (à droite).' : 'Les décès à gauche, les naissances à droite, période par période (ou les femmes et les hommes).',
            `${k === 'dpldiv' ? `<label>Face à face${sel('pair', [['bd', 'Décès ↔ naissances'], ['sex', 'Naissances : filles ↔ garçons']])}</label>` : ''}<label>Périodes${sel('step', STEPS, '25')}</label>${SCOPE}${ROOT()}`),
        bind: (pane, io) => bindGo(pane, async () => {
            const r = await get({what: 'periods', step: v(pane, 'step').value, scope: v(pane, 'scope').value, root: rootOf(pane)});
            if (!r.rows?.length) throw new Error('Aucune naissance ni aucun décès daté.');
            const s = io.spec(), pair = v(pane, 'pair')?.value;
            if (k === 'dplbarline') { s.series = [{name: 'Naissances', color: s.series?.[0]?.color || '#4e79a7'}, {name: 'Âge moyen au décès', color: s.series?.[1]?.color || '#e15759'}]; s.rows = r.rows.map(x => ({label: x.label, s0: String(x.births), s1: x.age === null ? '' : String(x.age), ids: x.ids})); s.o = {...(s.o || {}), unit2: 'ans'}; }
            else if (pair === 'sex') { s.series = [{name: 'Filles', color: '#e15759'}, {name: 'Garçons', color: '#4e79a7'}]; s.rows = r.rows.map(x => ({label: x.label, s0: String(x.births_f), s1: String(x.births_h), ids: x.ids})); }
            else { s.series = [{name: 'Décès', color: '#5f6b7a'}, {name: 'Naissances', color: '#59a14f'}]; s.rows = r.rows.map(x => ({label: x.label, s0: String(x.deaths), s1: String(x.births), ids: [x.ids, x.dids].filter(Boolean).join(',')})); }
            titleIf(s, k, k === 'dplbarline' ? 'Naissances et âge moyen au décès' : pair === 'sex' ? 'Filles et garçons à la naissance' : 'Décès et naissances'); io.apply(s);
            return `${r.rows.length} périodes prises dans ta base.`;
        }),
    });
    const hillsApp = {
        html: () => box('🏔 Les noms de famille au fil du temps', 'Les noms les plus portés : une colline par nom, la hauteur = les naissances de chaque période.', `<label>Noms${sel('top', [['4', '4 noms'], ['6', '6 noms'], ['8', '8 noms'], ['12', '12 noms']], '6')}</label><label>Périodes${sel('step', STEPS.slice(0, 3), '25')}</label>${SCOPE}${ROOT()}`),
        bind: (pane, io) => bindGo(pane, async () => {
            const r = await get({what: 'surnames', top: v(pane, 'top').value, step: v(pane, 'step').value, scope: v(pane, 'scope').value, root: rootOf(pane)});
            if (!r.series?.length) throw new Error('Aucune naissance datée avec un nom de famille.');
            const s = io.spec(); s.series = r.series.map((x, j) => ({name: x.name, color: s.series?.[j]?.color || ''})).map(x => (x.color ? x : {name: x.name}));
            s.rows = r.labels.map((label, i) => { const row = {label}; r.series.forEach((x, j) => { row['s' + j] = String(x.values[i]); }); return row; });
            titleIf(s, 'dplhills', 'Les noms de famille au fil du temps'); io.apply(s);
            return `${r.series.length} noms sur ${r.labels.length} périodes.`;
        }),
    };
    const parallelApp = {
        html: () => box('🧵 Les vies de ma base', 'Pour chaque personne (vies finies seulement) : l’âge au premier mariage, au premier enfant, le nombre d’enfants et l’âge au décès ; une couleur par siècle de naissance.', `${SCOPE}${ROOT()}<label>Personnes au plus${sel('max', [['100', '100'], ['200', '200'], ['400', '400']], '200')}</label>`),
        bind: (pane, io) => bindGo(pane, async () => {
            const r = await get({what: 'parallel', scope: v(pane, 'scope').value, root: rootOf(pane), max: v(pane, 'max').value});
            if (!r.rows?.length) throw new Error('Pas assez de vies datées (il faut au moins 3 des 4 chiffres).');
            const s = io.spec(); s.series = ['Âge au 1er mariage', 'Âge au 1er enfant', 'Enfants', 'Âge au décès'].map(name => ({name}));
            s.rows = r.rows.map(x => ({label: x.label, group: x.group, s0: x.marr, s1: x.child, s2: x.kids, s3: x.death, pid: String(x.pid)}));
            titleIf(s, 'dplpar', 'Les vies de la famille'); io.apply(s);
            return `${r.rows.length} vies prises dans ta base.`;
        }),
    };
    const aliveApp = {
        html: () => box('📶 Combien en vie, année par année', 'Une personne compte de sa naissance à son décès ; décès inconnu : en vie si elle est née il y a moins de 100 ans, sinon jusqu’à 60 ans (comme « Les vivants de l’arbre »).', `${SCOPE}${ROOT()}<span class="dpl-period"><label>De l’année<input data-dpl="from" type="number" inputmode="numeric" placeholder="ex. 1700"></label><label>à l’année<input data-dpl="to" type="number" inputmode="numeric" placeholder="ex. 2025"></label></span>`),
        bind: (pane, io) => bindGo(pane, async () => {
            const q = {what: 'alive', scope: v(pane, 'scope').value, root: rootOf(pane)}; const f = v(pane, 'from').value.trim(), t = v(pane, 'to').value.trim(); if (/^-?\d{1,4}$/.test(f)) q.from = f; if (/^-?\d{1,4}$/.test(t)) q.to = t;
            const r = await get(q); if (!r.rows?.length) throw new Error('Aucune naissance datée.');
            const s = io.spec(); s.series = [{name: 'Personnes en vie', color: s.series?.[0]?.color || '#2e7d6b'}]; s.rows = r.rows.map(x => ({label: String(x.year), s0: String(x.n)}));
            titleIf(s, 'dplstep', 'Combien de la famille étaient en vie'); io.apply(s);
            return `${r.people} personnes comptées, ${r.rows.length} années.`;
        }),
    };

    /* ═════════ Les sortes ═════════ */
    const mapOpts = GC ? GC.mapOpts() : [];
    const MAPC = [C('zoneColor', 'Couleur des terres', 'color', {def: GC?.LAND || '#f1f0ec'}), C('showMissing', 'Signaler les lieux sans position', 'check', {def: true})];
    const GENC = [C('genColors', 'Couleurs des générations', 'select', {choices: [['', 'Un dégradé'], ['palette', 'Une couleur chacune']]}), C('lowColor', 'Dégradé : la plus proche', 'color', {def: '#f6c453', when: s => s.o?.genColors !== 'palette'}), C('highColor', 'Dégradé : la plus ancienne', 'color', {def: '#5b2a86', when: s => s.o?.genColors !== 'palette'}), C('maxGen', 'Générations au plus', 'range', {min: 2, max: 20, def: 12})];
    const GEN_GRID = {key: 'rows', label: 'Les ancêtres (lieu de naissance « Nom 48.11, -1.68 » et génération : 2 = parents, 3 = grands-parents…)', cols: [C('label', 'Lieu'), C('gen', 'Génération', 'number'), C('name', 'Personne'), C('year', 'Année')]};
    const resolveMap = async spec => { if (!GC) return spec; const s = await GC.resolve(spec); const o = s.o || {}, pts = genPoints(s).pts; const view = !o.frame && o.fit !== false && pts.length ? GC.fitView(pts.map(p => ({p: [p.lon, p.lat]})), o) : GC.viewOf(o); const b = GC.baseIdOf(o, view); await Promise.all([b, GC.ctxIdOf(o, b, view)].filter(Boolean).map(id => GC.load(id).catch(() => {}))); return s; };
    const remember = fn => (GC?.remember ? GC.remember(fn) : fn);
    const NEW = {
        dplkin: {icon: '🔗', label: 'Chemin de parenté entre deux personnes', group: 'Généalogie', render: kinpath, legend: 'bottom', fromApp: kinApp,
            help: 'Le plus court chemin entre deux personnes, étape par étape, et la phrase qui dit le lien (« cousin issu de germains », « beau-frère »…).',
            grids: [{key: 'rows', label: 'Le chemin (une personne par ligne, de la première à la seconde)', cols: [C('name', 'Nom'), C('sex', 'Sexe', 'select', {choices: [['', '?'], ['h', 'Homme'], ['f', 'Femme']]}), C('years', 'Années'), C('step', 'Lien avec la personne d’avant', 'select', {choices: [['', '—'], ['u', 'son père / sa mère (on monte)'], ['d', 'son enfant (on descend)'], ['s', 'son époux / épouse']]})]},
                {key: 'others', label: 'Autres liens (implexe : doubles cousins…)', cols: [C('label', 'Lien')]}],
            options: [C('layout', 'Dessin', 'select', {choices: [['', 'Selon la place'], ['chart', 'En V (montée puis descente)'], ['list', 'En liste, étape par étape']]}), C('sentence', 'La phrase du lien', 'check', {def: true}), C('others', 'Les autres liens (implexe)', 'check', {def: true}), C('years', 'Les années', 'check', {def: true}),
                C('colorBy', 'Couleur des cases', 'select', {choices: [['', 'Homme / femme'], ['one', 'Une seule']]}), C('manColor', 'Hommes', 'color', {def: '#4e79a7', when: s => s.o?.colorBy !== 'one'}), C('womanColor', 'Femmes', 'color', {def: '#e15759', when: s => s.o?.colorBy !== 'one'}), C('boxColor', 'Couleur', 'color', {def: '#4e79a7', when: s => s.o?.colorBy === 'one'})],
            sample: sampleKin},
        dplgrav: {icon: '🎯', label: 'Centre de gravité de la famille par génération', group: 'Cartes', render: remember(gravity), legend: 'bottom', fromApp: placesApp('dplgrav', 10), resolve: resolveMap, afterDraw: GC?.afterDraw,
            help: 'Le point moyen des lieux de naissance de chaque génération, et le chemin qu’il a fait jusqu’à toi.',
            grids: [GEN_GRID],
            options: [...mapOpts, C('fit', 'Cadrer tout seul sur les lieux', 'check', {def: true, when: s => !s.o?.frame}), C('order', 'Sens des flèches', 'select', {choices: [['', 'Des plus anciens vers toi'], ['near', 'De toi vers les plus anciens']]}), C('points', 'Montrer chaque lieu (pâle)', 'check', {def: true}), C('spread', 'Cercle de l’écart moyen', 'check'), C('path', 'La trajectoire', 'check', {def: true}),
                C('pathColor', 'Couleur de la trajectoire', 'color', {def: '#1d3557'}), C('lineW', 'Épaisseur', 'range', {min: .5, max: 8, step: .1, def: 2.2}), C('dot', 'Taille des lieux', 'range', {min: .6, max: 10, step: .2, def: 2.4}), C('summary', 'La phrase du déplacement', 'check', {def: true}), ...GENC, ...MAPC],
            sample: () => ({o: {title: 'Le centre de la famille, génération par génération', map: 'fr'}, rows: sampleGen()})},
        dplgenmap: {icon: '🌈', label: 'Carte des générations (une couleur par génération)', group: 'Cartes', render: remember(genmap), legend: 'bottom', fromApp: placesApp('dplgenmap', 8), resolve: resolveMap, afterDraw: GC?.afterDraw,
            help: 'Les lieux de naissance des ancêtres, une couleur par génération : on voit la famille venir de plus loin.',
            grids: [GEN_GRID],
            options: [...mapOpts, C('fit', 'Cadrer tout seul sur les lieux', 'check', {def: true, when: s => !s.o?.frame}), C('dot', 'Taille des points', 'range', {min: 1, max: 14, step: .5, def: 4}), C('spread', 'Écarter les points d’un même lieu', 'check', {def: true}), C('labels', 'Noms des lieux les plus remplis', 'check', {def: true}), C('labelMin', 'Nom écrit à partir de … ancêtres', 'range', {min: 2, max: 20, def: 3}), ...GENC, ...MAPC],
            sample: () => ({o: {title: 'D’où viennent mes ancêtres', map: 'fr'}, rows: sampleGen()})},
        dplcomp: {icon: '🧩', label: 'Complétude de l’arbre (ancêtres connus par génération)', group: 'Généalogie', render: complete, legend: 'bottom', fromApp: completeApp,
            help: 'La part des ancêtres connus à chaque génération (1, 2, 4, 8… possibles), en barres ou en éventail.',
            grids: [{key: 'rows', label: 'Les générations (1 = la personne)', cols: [C('gen', 'Génération', 'number'), C('theo', 'Possibles (vide = 1, 2, 4…)', 'number'), C('found', 'Trouvés', 'number'), C('distinct', 'Personnes différentes', 'number')]}],
            options: [C('layout', 'Présentation', 'select', {choices: [['', 'Barres'], ['fan', 'Éventail (une case par ancêtre)']]}), C('fanGens', 'Éventail : générations', 'range', {min: 2, max: 10, def: 8, when: s => s.o?.layout === 'fan'}), C('scale', 'Longueur des barres', 'select', {choices: [['', 'Toutes pareilles (en %)'], ['log', 'Selon le nombre possible']], when: s => s.o?.layout !== 'fan'}),
                C('distinct', 'Montrer les personnes différentes (implexe)', 'check', {def: true}), C('values', 'Écrire les %', 'check', {def: true}), C('summary', 'Phrase de résumé', 'check', {def: true}), C('knownColor', 'Couleur des connus', 'color', {def: '#2e7d6b'}), C('missingColor', 'Couleur des manquants', 'color', {def: '#e6e9ee'}), C('distinctColor', 'Couleur de l’implexe', 'color', {def: '#1f5fa8'}), C('barH', 'Épaisseur des barres', 'range', {min: 8, max: 40, def: 23})],
            sample: () => ({o: {title: 'Ce que je connais de mon arbre'}, rows: sampleComplete()})},
        dplahn: {icon: '📜', label: 'Tableau d’ascendance (ahnentafel, une ligne par Sosa)', group: 'Généalogie', render: ahnentafel, noLegend: true, fromApp: ahnApp,
            help: 'La liste des ancêtres par numéro Sosa, génération par génération, prête à imprimer.',
            grids: [{key: 'rows', label: 'Les ancêtres', cols: [C('sosa', 'Sosa', 'number'), C('name', 'Nom'), C('sex', 'Sexe', 'select', {choices: [['', '?'], ['h', 'Homme'], ['f', 'Femme']]}), C('birth', 'Naissance', 'text', {ph: '7 mai 1925'}), C('bplace', 'Lieu'), C('marriage', 'Mariage'), C('mplace', 'Lieu du mariage'), C('death', 'Décès'), C('dplace', 'Lieu du décès'), C('job', 'Métier')]}],
            options: [C('places', 'Les lieux', 'check', {def: true}), C('jobs', 'Les métiers', 'check', {def: true}), C('genHeads', 'Un titre par génération', 'check', {def: true}), C('zebra', 'Une ligne sur deux grisée', 'check', {def: true}), C('maxRows', 'Lignes montrées au plus', 'range', {min: 10, max: 2000, step: 10, def: 400})],
            sample: () => ({o: {title: 'Tableau d’ascendance de Joseph MARTIN'}, rows: sampleAhn()})},
        dplleeds: {icon: '🧬', label: 'Matrice des correspondances ADN (méthode de Leeds)', group: 'ADN', render: leedsM, legend: 'bottom', fromApp: leedsApp,
            help: 'Les correspondances ADN qui se correspondent entre elles, rangées en groupes de couleur (souvent un par grand-parent).',
            grids: [{key: 'rows', label: 'Les correspondances', cols: [C('name', 'Nom'), C('cm', 'ADN partagé', 'number', {unit: 'cM'}), C('shared', 'Correspondances en commun (séparées par ;)')]}, {key: 'colors', label: 'Couleur de chaque groupe (facultatif)', max: 12, cols: [C('color', 'Couleur', 'color')]}],
            options: [C('lo', 'De', 'number', {unit: 'cM', def: 90}), C('hi', 'À', 'number', {unit: 'cM', def: 400}), C('max', 'Groupes de couleur au plus', 'range', {min: 1, max: 12, def: 4}), C('names', 'Noms des groupes (séparés par des virgules)', 'text', {def: GP.join(', ')}), C('colLabels', 'Noms en haut des colonnes', 'check', {def: true}), C('maxRows', 'Correspondances au plus', 'range', {min: 5, max: 150, def: 60}), C('summary', 'Phrase de résumé', 'check', {def: true})],
            sample: () => ({o: {title: 'Mes cousins ADN, par grand-parent'}, rows: sampleLeeds()})},
        dplwheel: {icon: '🎡', label: 'Roue de l’année (anniversaires et fêtes de la famille)', group: 'Frises', render: wheel, legend: 'bottom', fromApp: wheelApp,
            help: 'Les anniversaires, mariages, décès et fêtes des prénoms autour d’un cercle de douze mois.',
            grids: [{key: 'rows', label: 'Les dates', cols: [C('date', 'Jour (14/07 ou 07-14)'), C('kind', 'Sorte', 'select', {choices: Object.entries(WK).map(([k, [l]]) => [k, l])}), C('label', 'Qui'), C('year', 'Année')]}],
            options: [C('today', 'Le trait « aujourd’hui »', 'check', {def: true}), C('center', 'Le nombre au centre', 'check', {def: true}), C('hole', 'Trou au centre', 'range', {unit: '%', min: 10, max: 70, def: 34}), C('dot', 'Taille des points', 'range', {min: 1.2, max: 12, step: .2, def: 4.6}),
                ...Object.entries(WK).map(([k, [l, c]]) => C('c_' + k, l, 'color', {def: c})), H_OPT],
            sample: () => ({o: {title: 'L’année de la famille'}, rows: sampleWheel()})},
        dplbarline: {icon: '📊', label: 'Barres + courbe (deuxième axe à droite)', group: 'Chiffres', render: barline, legend: 'bottom', fromApp: periodsApp('dplbarline'), axes: {y2: true}, time: OFF_TIME,
            help: 'Des barres sur l’axe de gauche et une courbe sur un deuxième axe à droite, pour comparer deux sortes de chiffres.',
            grids: [TABLE('Les chiffres (la dernière colonne = la courbe)', 'Catégorie')],
            options: [C('lineSeries', 'La courbe = la colonne n°', 'number', {min: 1, max: 24}), C('yLabel', 'Nom de l’axe de gauche'), C('y2Label', 'Nom de l’axe de droite'), C('unit', 'Unité à gauche'), C('unit2', 'Unité à droite'), C('lineZero', 'Axe de droite à partir de zéro', 'check', {def: true}),
                C('barW', 'Largeur des barres', 'range', {unit: '%', min: 20, max: 100, def: 70}), C('lineW', 'Épaisseur de la courbe', 'range', {min: .5, max: 8, step: .1, def: 2.6}), C('dot', 'Points de la courbe', 'range', {min: 0, max: 10, step: .2, def: 3.2}), C('values', 'Écrire les chiffres de la courbe', 'check'), H_OPT],
            sample: () => ({o: {title: 'Naissances et âge moyen au décès', unit2: 'ans'}, series: [{name: 'Naissances', color: '#4e79a7'}, {name: 'Âge moyen au décès', color: '#e15759'}], rows: samplePeriods()})},
        dpldiv: {icon: '↔️', label: 'Barres divergentes (gauche / droite d’un centre)', group: 'Chiffres', render: diverging, noLegend: true, fromApp: periodsApp('dpldiv'), time: OFF_TIME,
            help: 'Deux chiffres face à face de chaque côté d’un trait (décès et naissances, femmes et hommes), ou un chiffre au-dessus et en dessous d’un centre.',
            grids: [TABLE('Les lignes (1re colonne à gauche, 2e à droite)', 'Nom', 2)],
            options: [C('mode', 'Chiffres', 'select', {choices: [['', 'Deux colonnes face à face'], ['one', 'Une colonne autour du centre']]}), C('center', 'Le centre (une colonne)', 'number', {def: 0, when: s => s.o?.mode === 'one'}), C('leftLabel', 'Titre à gauche'), C('rightLabel', 'Titre à droite'),
                C('leftColor', 'Couleur à gauche', 'color', {def: '#e15759', when: s => s.o?.mode === 'one'}), C('rightColor', 'Couleur à droite', 'color', {def: '#4e79a7', when: s => s.o?.mode === 'one'}),
                C('sort', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['diff', 'Par écart'], ['total', 'Par total']]}), C('labels', 'Noms', 'select', {choices: [['', 'À gauche'], ['middle', 'Sur le trait du milieu']]}), C('values', 'Écrire les chiffres', 'check', {def: true}), C('rowH', 'Épaisseur des barres', 'range', {min: 6, max: 60, def: 19})],
            sample: () => ({o: {title: 'Décès et naissances dans la famille'}, series: [{name: 'Décès', color: '#5f6b7a'}, {name: 'Naissances', color: '#59a14f'}], rows: sampleDiv()})},
        dplhills: {icon: '🏔', label: 'Collines empilées (une courbe par série, décalées)', group: 'Chiffres', render: hills, noLegend: true, fromApp: hillsApp, time: OFF_TIME,
            help: 'Une colline par série (un nom de famille, un prénom, une commune…), l’une derrière l’autre, au fil du temps.',
            grids: [TABLE('Les chiffres (une ligne par période, une colonne par colline)', 'Période')],
            options: [C('overlap', 'Chevauchement', 'range', {unit: '%', min: 0, max: 300, def: 140}), C('rowHeight', 'Écart entre les collines', 'range', {unit: 'px', min: 10, max: 120, def: 34}), C('scaleBy', 'Hauteur', 'select', {choices: [['', 'Chaque colline à sa hauteur'], ['same', 'Même échelle pour toutes']]}), C('smooth', 'Courbes douces', 'check', {def: true}),
                C('order', 'Ordre', 'select', {choices: [['', 'Comme dans le tableau'], ['reverse', 'À l’envers']]}), C('colors', 'Couleurs', 'select', {choices: [['', 'Une par série'], ['gradient', 'Un dégradé'], ['one', 'Une seule']]}), C('lowColor', 'Dégradé : première', 'color', {def: '#9ecae1', when: s => s.o?.colors === 'gradient'}), C('highColor', 'Dégradé : dernière', 'color', {def: '#08519c', when: s => s.o?.colors === 'gradient'}), C('oneColor', 'Couleur', 'color', {def: '#4e79a7', when: s => s.o?.colors === 'one'}),
                C('opacity', 'Opacité', 'range', {unit: '%', min: 10, max: 100, def: 80}), C('line', 'Trait blanc autour', 'check', {def: true}), C('peaks', 'Écrire le sommet', 'check')],
            sample: () => ({o: {title: 'Les noms de famille au fil du temps'}, ...sampleHills()})},
        dplpar: {icon: '🧵', label: 'Coordonnées parallèles (plusieurs chiffres par personne)', group: 'Chiffres', render: parallel, legend: 'bottom', fromApp: parallelApp,
            help: 'Chaque personne est une ligne qui passe par plusieurs axes (âge au mariage, enfants, âge au décès…) : les profils se voient d’un coup d’œil.',
            grids: [TABLE('Les lignes (une par personne ; une colonne par axe)', 'Nom', true, [C('group', 'Groupe (couleur)')]), {key: 'cats', label: 'Couleur de chaque groupe (facultatif)', cols: [C('value', 'Groupe'), C('color', 'Couleur', 'color')]}],
            options: [C('highlight', 'Mettre en avant (un groupe ou un nom)'), C('opacity', 'Opacité des lignes', 'range', {unit: '%', min: 5, max: 100, def: 55}), C('lineW', 'Épaisseur', 'range', {min: .3, max: 6, step: .1, def: 1.4}), H_OPT],
            sample: () => ({o: {title: 'Les vies de la famille'}, ...sampleParallel()})},
        dplstep: {icon: '📶', label: 'Courbe en escalier (ex. combien de vivants, année par année)', group: 'Chiffres', render: stepline, legend: 'bottom', fromApp: aliveApp, time: STEP_TIME,
            help: 'Une courbe qui avance par marches : le chiffre reste le même jusqu’au prochain changement (vivants de la famille, ancêtres trouvés…).',
            grids: [TABLE('Les chiffres (une année ou un nom par ligne)', 'Année')],
            options: [C('step', 'La marche', 'select', {choices: [['', 'Après le point'], ['before', 'Avant le point']]}), C('fill', 'Remplir dessous (une série)', 'check', {def: true}), C('fromZero', 'Axe à partir de zéro', 'check', {def: true}), C('peak', 'Montrer le plus haut', 'check', {def: true}), C('unit', 'Unité'), C('lineW', 'Épaisseur', 'range', {min: .5, max: 8, step: .1, def: 2.2}), H_OPT],
            sample: () => ({o: {title: 'Combien de la famille étaient en vie'}, series: [{name: 'Personnes en vie', color: '#2e7d6b'}], rows: sampleAlive()})},
    };
    if (!GC) { delete NEW.dplgrav; delete NEW.dplgenmap; }
    for (const [k, kind] of Object.entries(NEW)) { if (!K[k]) K[k] = kind; }
    ext.diagramPlus = {KINDS: Object.keys(NEW), ahnentafelHtml, printAhnentafel: printAhn, dateFr};
})();
