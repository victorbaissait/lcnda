/* LCNDA — 🗺️ Cartes en plus (vague 2), dans Graphiques → Cartes (maquette validée : docs/design/cartes-nouvelles.html) :
 *  🔨 trademap   — Les métiers sur la carte : un camembert par commune, couleur par grand secteur ou famille de métiers ;
 *  👫 mirrormap  — Les deux lignées en miroir : côté père en bleu, côté mère en orange, et là où elles se rencontrent ;
 *  ⭕ lifearea   — L'aire de vie, génération par génération : le cercle (ou l'enveloppe) qui tient l'essentiel des événements ;
 *  🕸 linkmap    — Parrains, marraines et témoins : un trait entre le village de l'acte et celui d'où vient le témoin ;
 *  ⚰️ crisismap  — Crises et épidémies : les années où les décès montent d'un coup, commune par commune, avec un repère
 *                  « à la même époque » du 🌍 Monde autour — jamais une cause affirmée.
 * Chaque choix de la maquette est un réglage (onglet Réglages du diagramme), l'option conseillée réglée au départ.
 * Fonds, projections, cadrages : ceux des cartes de Graphiques (ext.diagramCartes) ; le curseur ▶ et les ▦ petits multiples :
 * ceux de ⚙️ Personnaliser (kind.time = {range, at}, heritage-diagram-perso.js). Export E3 et impression L1 : ceux de tous les
 * diagrammes. Données de l'app : api.php?action=cartes_plus2 (lib/cartes_plus2.php) — jamais un vivant ni une fiche
 * confidentielle (filtrés côté serveur). Test : tests/test-cartes-nouvelles.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
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
    const rows = (spec, key = 'rows', max = 40000) => (Array.isArray(spec[key]) ? spec[key] : []).filter(r => r && typeof r === 'object').slice(0, max);
    const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    const C = (k, label, type = 'text', extra = {}) => ({k, label, type, ...extra});
    const pl = (n, one, many = '') => A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`;
    const yearOf = v => { const t = String(v ?? '').trim(); if (!t) return null; const y = DR.when(t, false); return y === null || !Number.isFinite(y) || y < -3000 || y > 3000 ? null : Math.floor(y); };
    const tip = s => `<title>${esc(s)}</title>`;
    const pidsAttr = list => [...new Set(list.map(Number).filter(x => x > 0))].slice(0, 500).join(',');
    /** la valeur d'un réglage, sinon celle conseillée */
    const opt = (o, k, def) => (o[k] === undefined || o[k] === null || o[k] === '' ? def : o[k]);
    const optN = (o, k, def, lo, hi) => { const v = o[k] === '' || o[k] == null ? NaN : Number(o[k]); return clamp(Number.isFinite(v) ? v : def, lo, hi); };
    const siecle = y => { const c = Math.floor(y / 100) + 1; return c === 1 ? i18n('1er siècle') : i18n('{n}e siècle', {n: String(c), ctx: 'nombre'}); };
    const KM = (a, b) => { const R = 6371, d1 = (b[1] - a[1]) * Math.PI / 180, d2 = (b[0] - a[0]) * Math.PI / 180; const x = Math.sin(d1 / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(d2 / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };
    const median = list => { const s = [...list].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
    let seq = 0;

    /* ═════════ Le fond (celui des cartes de Graphiques) ═════════ */
    function bases(spec, W) {
        const o = spec.o || {}, pre = GC.viewOf(o), b0 = GC.baseIdOf(o, pre), c0 = GC.ctxIdOf(o, b0, pre);
        const w = GC.needBases(spec, W, [b0, c0, 'monde-110m', 'fr-departements']); if (w) return {wait: w};
        return {list: [GC.loaded(b0), c0 ? GC.loaded(c0) : null, GC.loaded('monde-110m')].filter(Boolean), deps: GC.loaded('fr-departements')};
    }
    /** le cadrage au plus près des points (une famille tient souvent dans quelques villages : pas de marge d'un degré) */
    function tight(pts) {
        let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; pts.forEach(p => { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); });
        if (!Number.isFinite(w)) return null;
        const dx = Math.max(.12, (e - w) * .2), dy = Math.max(.08, (n - s) * .2);
        return [clamp(w - dx, -180, 180), clamp(s - dy, -85, 85), clamp(e + dx, -180, 180), clamp(n + dy, -85, 85)];
    }
    /** un fond cadré sur ces points ; fillOf colore les zones (départements…) */
    function frame(spec, W, fs, pts, fillOf = null, H = 0) {
        const o = spec.o || {}, M = GC.MAPS[GC.mapOf(o)];
        const auto = (!o.frame || o.frame === '') && o.fit !== false && pts.length ? tight(pts) : null;
        const view = GC.viewOf(o, auto || M.view), baseId = GC.baseIdOf(o, view), ctxId = GC.ctxIdOf(o, baseId, view);
        const wait = GC.needBases(spec, W, [baseId, ctxId]); if (wait) return {wait};
        const base = GC.loaded(baseId), ctx = ctxId ? GC.loaded(ctxId) : null, uid = 'cq' + (++seq);
        const pr = GC.fitProj(o.proj && o.proj !== 'auto' ? o.proj : GC.autoProj(view), view, W, H || clamp(num(o.height) || 2400, 120, 3000), !H && !num(o.height)); pr.allOutre = true;
        const land = color(o.zoneColor, GC.LAND), B = GC.drawBase({...spec, o: {...o, borderColor: o.borderColor || '#cfcabe'}}, base, ctx, pr, W, pr.h, fillOf || (() => ({fill: land, title: ''})), uid);
        const close = `<text x="${r1(W - 4)}" y="${r1(pr.h - 4)}" font-size="${r2(clamp(fs * .62, 7, 12))}" text-anchor="end" fill="#555" fill-opacity=".85">${esc(GC.attrOf(base, ctx))}</text><rect data-geo-hit="1" width="${r1(W)}" height="${r1(pr.h)}" fill="none" stroke="#c8cdd3" stroke-width=".6"/></g>`;
        return {pr, w: W, h: pr.h, uid, base, open: `<g data-geo-map="${uid}">${B.svg}<g clip-path="url(#${uid}c)">`, close: '</g>' + close, geo: {uid, pr, w: W, h: pr.h}};
    }
    /** une ligne → sa position : « Tulle », « Tulle 45.27, 1.77 », ou spec.places (rempli par « Depuis l'app ») */
    function locate(spec, list, key = 'label', gridKey = 'rows') {
        const memo = new Map(), out = [], unknown = new Set();
        rows(spec, gridKey).forEach(r => {
            const label = str(r[key], 120); if (!label) return;
            let p = memo.get(label); if (p === undefined) { p = GC.placeOf(spec, label, list); memo.set(label, p); }
            if (!p) { if (unknown.size < 30) unknown.add(label.slice(0, 40)); return; }
            out.push({r, lon: p[0], lat: p[1], place: p[2] || label, y: yearOf(r.date ?? r.year ?? r.from), pid: Number(r.pid) > 0 ? Number(r.pid) : 0});
        });
        return {pts: out, unknown: [...unknown]};
    }
    /** « ⚠ Lieux sans position : … · 📍 Les placer » (à l'écran, un clic ouvre 📍 Lieux à placer réglé sur ces lieux) */
    const missing = (unknown, y, fs, spec) => {
        const n = Math.max(unknown.length, Number(spec?.o?.__unplaced) || 0); if (!n) return '';
        const ids = Array.isArray(spec?.unplaced) ? spec.unplaced.map(Number).filter(x => x > 0).slice(0, 200).join(',') : '';
        return `<g class="cq-miss" data-cq-place="${esc(ids)}" role="button" tabindex="0">${T(0, y + fs * .7, i18n('⚠ Lieux sans position : {list}', {list: unknown.slice(0, 6).join(', ') + (unknown.length > 6 || n > unknown.length ? '…' : '')}) + ' · 📍 ' + i18n('Les placer'), {size: fs * .78, fill: '#a5552a'})}</g>`;
    };
    const emptyMsg = (w, h, fs, msg) => T(w / 2, h / 2, i18n(msg), {anchor: 'middle', size: fs, fill: '#555', halo: '#ffffffcc'});
    const title = (s, fs) => T(10, 18, s, {size: fs * 1.3, weight: 800, fill: '#1d1d1f', halo: '#ffffffd9'});
    /** la période montrée : l'année du curseur ▶ (o.__year) ou celle choisie (o.at), arrondie au pas */
    const atOf = (o, step) => { const y = Number.isFinite(o.__year) ? o.__year : String(o.at ?? '').trim() !== '' ? num(o.at) : NaN; return Number.isFinite(y) ? Math.floor(y / step) * step : null; };
    /** le curseur ▶ commun : pas fixe ou lu dans un réglage (stepOf(spec)) */
    const timeOf = (step, {stepOf = null, key = 'rows', yearKey = 'date'} = {}) => ({
        range: spec => { const s = stepOf ? stepOf(spec) : step; if (!s) return [NaN, NaN]; const ys = rows(spec, key).map(r => yearOf(r[yearKey] ?? r.date ?? r.year)).filter(y => y !== null); return ys.length ? [Math.floor(Math.min(...ys) / s) * s, Math.floor(Math.max(...ys) / s) * s] : [NaN, NaN]; },
        at: (spec, y) => { const s = stepOf ? stepOf(spec) || step : step; spec.o = {...(spec.o || {}), __year: y, time: {...(spec.o?.time || {}), step: s}}; return spec; },
    });
    const periodWord = (a, step) => a === null ? '' : step >= 100 ? siecle(a) : step === 50 || step === 25 ? `${a}–${a + step - 1}` : step === 1 ? String(a) : i18n('années {y}', {y: String(a)});
    /** une courbe entre deux points (traits de 🕸) */
    const curve = (x1, y1, x2, y2, bend = .18) => { const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1; return `M${r1(x1)},${r1(y1)} Q${r1(mx - dy * bend)},${r1(my + dx * bend)} ${r1(x2)},${r1(y2)}`; };
    /** une part de camembert */
    const slice = (cx, cy, r, a0, a1) => { if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M${r1(cx - r)},${r1(cy)}a${r1(r)},${r1(r)} 0 1,0 ${r1(2 * r)},0a${r1(r)},${r1(r)} 0 1,0 ${r1(-2 * r)},0Z`;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1); return `M${r1(cx)},${r1(cy)}L${r1(x0)},${r1(y0)}A${r1(r)},${r1(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0},1 ${r1(x1)},${r1(y1)}Z`; };
    /** l'enveloppe convexe de points écran [[x, y]] (Andrew) */
    function hull(P) {
        const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
        const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
        for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
        for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
        return lo.slice(0, -1).concat(up.slice(0, -1));
    }
    /** le cercle de rayon en km autour d'un point, sur la carte (polygone de 48 côtés) */
    const geoRing = (pr, lon, lat, km) => { const out = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, dLat = km / 111.2 * Math.sin(a), dLon = km / (111.2 * Math.max(.05, Math.cos(lat * Math.PI / 180))) * Math.cos(a); const [x, y] = pr.p(lon + dLon, lat + dLat); if (Number.isFinite(x)) out.push([x, y]); } return out; };
    const poly = pts => pts.length ? 'M' + pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join('L') + 'Z' : '';

    /* ═════════ « Depuis l'app » ═════════ */
    const get = q => A().api('cartes_plus2', q);
    /** les lieux de la réponse → spec.places (positions), et le nom affiché de chaque lieu (homonymes : « Saint-Martin (Gers) ») */
    function placesOf(spec, places) {
        const cnt = new Map(); Object.values(places || {}).forEach(p => cnt.set(fold(p[0]), (cnt.get(fold(p[0])) || 0) + 1));
        const names = new Map(); spec.places = {};
        Object.entries(places || {}).forEach(([id, p]) => { const n = cnt.get(fold(p[0])) > 1 && p[4] ? `${p[0]} (${p[4]})` : p[0]; names.set(Number(id), n); spec.places[fold(n)] = {lat: p[2], lon: p[3], n}; });
        return names;
    }
    /** ce qui n'a pas de position : gardé avec le diagramme pour « 📍 Les placer » */
    const keepUnplaced = (spec, u) => { spec.unplaced = (u?.list || []).map(x => x.id); spec.o = {...(spec.o || {}), __unplaced: u?.count || 0}; };
    const pane = (head, help, form, goLabel = 'Prendre ces données') => `<div class="h-dg-app cq-app"><h4>${i18n(head)}</h4><p class="muted">${i18n(help)}</p><div class="c2-form">${form}<button type="button" class="button small" data-cq-go>${i18n(goLabel)}</button><p class="muted cq-hint">${i18n('Rien n’est pris tant que tu ne cliques pas.')}</p><p class="c2-msg" data-cq-msg role="status"></p></div></div>`;
    function bindGo(box, run) {
        const b = box.querySelector('[data-cq-go]'), msg = box.querySelector('[data-cq-msg]');
        b?.addEventListener('click', async () => { b.disabled = true; msg.innerHTML = window.LCNDA_UI?.spinner ? window.LCNDA_UI.spinner(i18n('Lecture de ta généalogie…'), {inline: true}) : esc(i18n('Lecture de ta généalogie…'));
            try { const t = await run(); if (msg.isConnected) msg.textContent = t ? '✓ ' + t : ''; A().toast?.(t ? '✓ ' + t : i18n('Données prises dans l’app.')); } catch (e) { if (msg.isConnected) msg.textContent = '⚠️ ' + (e.message || e); } finally { b.disabled = false; } });
    }
    const sel = (k, label, choices, v = '') => `<label>${i18n(label)}<select data-cq="${k}">${choices.map(([a, l]) => `<option value="${esc(a)}"${String(v) === a ? ' selected' : ''}>${esc(i18n(l))}</option>`).join('')}</select></label>`;
    const val = (box, k) => box.querySelector(`[data-cq="${k}"]`)?.value ?? '';
    const checks = (box, k) => [...box.querySelectorAll(`[data-cq="${k}"]:checked`)].map(x => x.value);
    const startId = () => Number(A()?.state?.bootstrap?.startPersonId) || 0;
    const personField = (name, label) => `<div class="cq-pick" data-cq-pk="${name}"><span class="pk-lab">${i18n(label)}</span>${(window.LCNDA_PICKER || A())?.pickerField?.({name, hiddenName: false, kind: 'person'}) || ''}</div>`;
    const pickedId = (box, name) => { const pk = box.querySelector(`[data-cq-pk="${name}"] .pk`); let v = null; try { v = pk ? window.LCNDA_PICKER?.pickerValue?.(pk) : null; } catch (_) {} return Number(v) > 0 ? Number(v) : 0; };
    const pickerPut = (box, name, id) => { const pk = box.querySelector(`[data-cq-pk="${name}"] .pk`); if (pk && id) try { window.LCNDA_PICKER?.pickerSet?.(pk, Number(id)); } catch (_) {} };

    /* ═════════ Les sortes ═════════ */
    async function resolve(spec) {
        const s = await GC.resolve(spec), o = s.o || {}, pre = GC.viewOf(o), b0 = GC.baseIdOf(o, pre);
        await Promise.all([b0, GC.ctxIdOf(o, b0, pre), 'monde-110m', 'fr-departements'].filter(Boolean).map(id => GC.load(id).catch(() => {})));
        const list = [GC.loaded(b0), GC.loaded('monde-110m')].filter(Boolean);
        const labels = [...rows(s).map(r => r.label), ...rows(s, 'links').flatMap(r => [r.from, r.to])];
        const pts = labels.map(l => GC.placeOf(s, str(l, 120), list)).filter(Boolean);
        if (pts.length && !o.frame && o.fit !== false) { const v = tight(pts.map(p => [p[0], p[1]])), b = GC.baseIdOf(o, v); await Promise.all([b, GC.ctxIdOf(o, b, v)].filter(Boolean).map(id => GC.load(id).catch(() => {}))); }
        return s;
    }
    const afterDraw = (prev, api) => { GC.afterDraw(prev, api); prev._c2Api = api; };
    const mapOpts = (GC.mapOpts?.() || []).filter(x => !['level'].includes(x.k));
    /** une ligne en tête des réglages : le premier choix de chaque menu est celui conseillé, réglé au départ */
    const REC = C('rec', '', 'link', {href: () => '', hint: 'Dans chaque menu, le premier choix est celui conseillé : il est réglé au départ.'});
    const COMMON = [C('fit', 'Cadrer tout seul sur les points', 'check', {def: true, when: s => !s.o?.frame}), C('zoneColor', 'Couleur des terres', 'color', {def: GC.LAND}), C('borderColor', 'Couleur des limites', 'color', {def: '#cfcabe'}), C('showMissing', 'Signaler les lieux sans position', 'check', {def: true})];
    /** ▦ un petit dessin par période (ou par groupe), côte à côte, au même cadrage : draw(sous-réglages, largeur) → {h, svg} */
    function multiples(spec, W, fs, list, draw) {
        const n = list.length; if (!n) return {h: 0, svg: ''};
        const cols = W < 520 ? 1 : clamp(Math.min(n, Math.floor(W / 240)), 1, 4), gap = fs, pw = (W - gap * (cols - 1)) / cols;
        let svg = '', y = 0, rowH = 0;
        list.forEach((it, j) => {
            const c = j % cols; if (c === 0 && j) { y += rowH + gap; rowH = 0; }
            const r = draw({...spec, o: {...(spec.o || {}), ...it.o, height: Math.round(pw * .9)}}, pw); if (r.wait) return;
            const x = c * (pw + gap);
            svg += `<g class="cq-facet" transform="translate(${r1(x)} ${r1(y + fs * 1.5)})">${r.svg}</g>${T(x + pw / 2, y + fs * .7, it.label, {size: fs * 1.05, weight: 800, anchor: 'middle'})}`;
            rowH = Math.max(rowH, r.h + fs * 1.5);
        });
        return {h: y + rowH, svg};
    }
    /** les noms des lieux les plus présents (réglage « Noms des lieux » : les principaux, tous, aucun) */
    function placeNames(spec, F, pts, fs) {
        const how = spec.o?.placeLabels || ''; if (how === 'none') return '';
        const g = new Map(); pts.forEach(p => { const k = `${r2(p.lon)}|${r2(p.lat)}`, x = g.get(k); if (x) x.n++; else g.set(k, {p, n: 1}); });
        return [...g.values()].sort((a, b) => b.n - a.n).slice(0, how === 'all' ? 80 : 8).map(({p}) => { const [x, y] = F.pr.p(p.lon, p.lat); return Number.isFinite(x) ? T(x + 6, y - 6, p.place, {size: clamp(fs * .72, 7, 14), weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'}) : ''; }).join('');
    }
    const PLACE_LABELS = C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Les plus grands'], ['all', 'Tous'], ['none', 'Aucun']]});
    /** les fiches derrière un clic sur la carte (le détail reste à l'écran ; jamais à l'export) */
    const DETAIL = new Map();
    const keepDetail = (id, data) => { DETAIL.set(id, data); if (DETAIL.size > 40) DETAIL.delete(DETAIL.keys().next().value); };
    const H = {T, esc, multiples, DETAIL, keepDetail, placeNames, PLACE_LABELS, num, clamp, r1, r2, fmt, fold, rows, str, C, pl, yearOf, tip, pidsAttr, opt, optN, siecle, KM, median, bases, frame, locate, missing, emptyMsg, title, atOf, timeOf, periodWord, curve, slice, hull, geoRing, poly,
        get, placesOf, keepUnplaced, pane, bindGo, sel, val, checks, startId, personField, pickedId, pickerPut, resolve, afterDraw, mapOpts, COMMON, REC, i18n, A, ext, DR, GC, color};
    const NEW = {};
    /** une carte de plus : rangée dans le catalogue (groupe « Cartes ») si elle n'y est pas déjà */
    const add = (k, kind) => { NEW[k] = kind; if (!K[k]) K[k] = {group: 'Cartes', resolve, afterDraw, logExport: true, ...kind}; };

    /* ═════════ Les clics dans l'aperçu ═════════ */
    if (typeof document !== 'undefined') {
        document.addEventListener('click', e => {
            const m = e.target.closest?.('.cq-miss'); if (m && !m.closest('.h-dg-mini')) { e.preventDefault(); const ids = String(m.dataset.cqPlace || '').split(',').map(Number).filter(Boolean); ext.lieuxAPlacer?.open?.({ids}); return; }
            const pb = e.target.closest?.('[data-cq-person]'); if (pb) { document.querySelectorAll('dialog[open]').forEach(d => { if (d.contains(pb)) d.close(); }); A()?.openPersonById?.(Number(pb.dataset.cqPerson)); return; }
            const tb = e.target.closest?.('[data-cq-trade]'); if (tb) { ext.oldTrade?.open?.('', {key: tb.dataset.cqTrade}); return; }
            const g = e.target.closest?.('[data-cq-i]'); if (!g || g.closest('.h-dg-mini')) return;
            const d = DETAIL.get(g.closest('[data-cq-d]')?.getAttribute('data-cq-d')); if (!d) return; e.preventDefault(); d(Number(g.getAttribute('data-cq-i')), g);
        });
        document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-cq-i]')) { const g = e.target.closest('[data-cq-i]'), d = DETAIL.get(g.closest('[data-cq-d]')?.getAttribute('data-cq-d')); if (d) { e.preventDefault(); d(Number(g.getAttribute('data-cq-i')), g); } } });
    }

    ext.diagramCartesPlus2 = {H, NEW, add};
})();

/* ═════════ 🔨 Les métiers sur la carte (maquette, partie 4) ═════════
 * Une couleur par grand secteur (classement de lib/metiers_carte.php, celui de l'Arbre des métiers : rien n'est reclassé à part)
 * ou par famille de métiers du dictionnaire, commune par commune, siècle par siècle (curseur ▶ commun) ou ▦ un petit dessin par
 * siècle. Où placer un métier : le lieu de l'acte, sinon la résidence de l'époque, sinon le lieu de naissance (réglable). */
(() => {
    'use strict';
    const P2 = window.LCNDA_EXT?.diagramCartesPlus2; if (!P2) return;
    const {T, esc, num, clamp, r1, r2, fold, rows, str, C, pl, tip, opt, siecle, bases, frame, locate, missing, emptyMsg, title, atOf, timeOf, periodWord, slice, multiples, keepDetail,
        get, placesOf, keepUnplaced, pane, bindGo, sel, val, startId, mapOpts, COMMON, REC, i18n, ext, GC, color} = P2.H;
    // les grands secteurs (lib/metiers_carte.php, METIERS_SECTORS) et les familles du dictionnaire : gardés avec le diagramme (spec.sectors / spec.domains)
    const SECT = [['agri', '🌾', 'Agriculture et forêt', '#4d8a2f'], ['arti', '🔨', 'Artisanat', '#c2611a'], ['indu', '🏭', 'Industrie, mines', '#5b6573'], ['comm', '🛒', 'Commerce', '#c99a06'], ['tran', '🚂', 'Transports et mer', '#0e7f99'],
        ['serv', '🏠', 'Services, domestiques', '#9b5fc0'], ['armee', '🎖', 'Armée et police', '#b42318'], ['clerge', '⛪', 'Clergé', '#6941c6'], ['lib', '⚖️', 'Professions libérales, école, administration', '#2563c9'],
        ['rang', '🏰', 'Rentiers, rangs et statuts', '#8a6a2f'], ['foyer', '🧺', 'Au foyer, sans profession', '#8c8c8c'], ['autre', '❔', 'Autre métier', '#a3a3a3']];
    const DPAL = ['#4d8a2f', '#2f6b3a', '#5b6573', '#7b3fa0', '#8a5a2b', '#b5651d', '#c99a06', '#c2611a', '#0e7f99', '#1f4e79', '#9b5fc0', '#2563c9', '#6941c6', '#d14a7a', '#b42318', '#6b4f3a', '#3a8a8a', '#8a6a2f'];
    const stepOf = spec => { const t = spec.o?.tmode; return t === 'all' || t === 'small' ? 0 : t === 'half' ? 50 : 100; };
    /** les catégories de la carte : [clé, icône, nom, couleur] selon « Classer par » */
    function cats(spec) {
        const o = spec.o || {}, by = opt(o, 'classify', '');
        if (by === 'domain') { const D = Array.isArray(spec.domains) && spec.domains.length ? spec.domains : []; return D.map((d, i) => [d.k, d.icon || '', d.label || d.k, DPAL[i % DPAL.length]]).concat([['', '❔', 'Autre métier', '#a3a3a3']]); }
        if (by === 'one') return [[String(o.trade || ''), '🔨', String(o.tradeName || o.trade || ''), '#c2611a']];
        if (by === 'mine') { const out = []; String(o.colors || '').split(/[;\n]+/).forEach(x => { const m = x.match(/^\s*([^=]+?)\s*=\s*(#[0-9a-f]{6})\s*$/i); if (m) out.push([fold(m[1]), '', m[1].trim(), m[2]]); }); return out.concat([['', '❔', 'Autre métier', '#a3a3a3']]); }
        return (Array.isArray(spec.sectors) && spec.sectors.length ? spec.sectors.map(x => [x.k, x.icon, x.label, x.color]) : SECT);
    }
    const catOf = (spec, r) => { const by = opt(spec.o || {}, 'classify', '');
        if (by === 'domain') return str(r.domain, 4);
        if (by === 'one') return str(r.key, 80) === String(spec.o?.trade || '') ? String(spec.o.trade) : null;
        if (by === 'mine') { const f = fold(r.trade); return cats(spec).some(c => c[0] === f) ? f : ''; }
        return str(r.sector, 10) || 'autre'; };
    const who = p => p.pid || p.r.name;
    /** les lignes gardées : où placer, plusieurs métiers, au foyer, la période */
    function kept(spec, all, at, step) {
        const o = spec.o || {};
        let pts = all.filter(p => (opt(o, 'where', '') !== 'act' || ['act', 'census'].includes(p.r.how || 'act')) && !(opt(o, 'foyer', '') === 'hide' && p.r.sector === 'foyer'));
        if (opt(o, 'multi', '') === 'main') { const best = new Map(); pts.forEach(p => { const m = best.get(who(p)) || new Map(); m.set(p.r.key, (m.get(p.r.key) || 0) + 1); best.set(who(p), m); });
            pts = pts.filter(p => [...best.get(who(p))].sort((a, b) => b[1] - a[1])[0][0] === p.r.key); }
        if (at !== null && step) pts = pts.filter(p => p.y !== null && p.y >= at && p.y < at + step);
        return pts;
    }
    function legendOf(spec, pts) {
        const C0 = cats(spec), n = new Map(); pts.forEach(p => { const c = catOf(spec, p.r); if (c === null) return; if (!n.has(c)) n.set(c, new Set()); n.get(c).add(who(p)); });
        const shown = C0.filter(c => n.has(c[0])), empty = C0.length - shown.length;
        return [...shown.map(c => ({label: `${c[1] ? c[1] + ' ' : ''}${i18n(c[2])} · ${n.get(c[0]).size}`, color: c[3]})), ...(empty > 0 && opt(spec.o || {}, 'classify', '') === '' ? [{label: i18n('+ {n} secteurs vides', {n: String(empty)}), color: '#e5e5e5'}] : [])];
    }
    function trademap(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const all = locate(spec, B0.list), step = stepOf(spec);
        if (o.tmode === 'small' && !o.__inFacet) { // ▦ un petit dessin par siècle, au même cadrage
            const ys = all.pts.map(p => p.y).filter(y => y !== null), lo = ys.length ? Math.floor(Math.min(...ys) / 100) * 100 : null, hi = ys.length ? Math.floor(Math.max(...ys) / 100) * 100 : null;
            const list = []; if (lo !== null) for (let a = lo; a <= hi && list.length < 8; a += 100) { const k = kept(spec, all.pts, a, 100); if (k.length) list.push({label: `${siecle(a)} · ${pl(new Set(k.map(who)).size, 'personne')}`, o: {__inFacet: true, at: a, __step: 100, title: ''}}); }
            const M = multiples(spec, W, fs, list, (sp, w) => trademap(sp, w, fs * .8)); let svg = M.svg, h = Math.max(M.h, list.length ? 0 : 300);
            if (all.unknown.length && o.showMissing !== false) { svg += missing(all.unknown, h, fs, spec); h += fs * 1.5; }
            if (!list.length) svg += emptyMsg(W, 150, fs, 'Prends les métiers de ta généalogie (« Depuis l’app »).');
            return {h, svg, legend: legendOf(spec, kept(spec, all.pts, null, 0)), desc: i18n('Carte des métiers : {n}, un petit dessin par siècle.', {n: pl(all.pts.length, 'mention')})};
        }
        const st = o.__step || step, at = st ? atOf(o, st) : null, pts = kept(spec, all.pts, at, st), C0 = cats(spec), colOf = new Map(C0.map(c => [c[0], c[3]]));
        const draw = opt(o, 'draw', ''), size = opt(o, 'size', '');
        // par lieu : les catégories et qui les porte
        const g = new Map();
        pts.forEach(p => { const c = catOf(spec, p.r); if (c === null) return; const k = `${r2(p.lon)}|${r2(p.lat)}`; let x = g.get(k); if (!x) g.set(k, x = {p, by: new Map()});
            const e = x.by.get(c) || {people: new Set(), n: 0, trades: new Map()}; e.people.add(who(p)); e.n++; e.trades.set(p.r.key, (e.trades.get(p.r.key) || 0) + 1); x.by.set(c, e); });
        const val = e => size === 'mentions' ? e.n : e.people.size;
        const tot = x => [...x.by.values()].reduce((a, e) => a + val(e), 0);
        let F;
        if (draw === 'deps') { // départements colorés : le secteur le plus fréquent du département
            const dep = new Map(); pts.forEach(p => { const z = str(p.r.zone, 3), c = catOf(spec, p.r); if (!z || c === null) return; const m = dep.get(z) || new Map(); m.set(c, (m.get(c) || 0) + 1); dep.set(z, m); });
            F = frame({...spec, o: {...o, map: 'fr', level: 'dep'}}, W, fs, all.pts.map(p => [p.lon, p.lat]), z => { const m = dep.get(z.id); if (!m) return {fill: color(o.zoneColor, GC.LAND), title: ''}; const [c, n] = [...m].sort((a, b) => b[1] - a[1])[0]; const cc = C0.find(x => x[0] === c); return {fill: colOf.get(c) || '#a3a3a3', title: `${z.name} (${z.id}) : ${i18n(cc?.[2] || 'Autre métier')} (${n})`}; });
        } else F = frame(spec, W, fs, all.pts.map(p => [p.lon, p.lat]));
        if (F.wait) return F.wait;
        const {pr, w, h} = F, id = 'cqt' + Math.random().toString(36).slice(2, 8), list = [...g.values()].sort((a, b) => tot(b) - tot(a)), maxN = Math.max(1, ...list.map(tot));
        const rMax = clamp(w / 32, 6, 30) * clamp(num(o.dotSize) || 1, .3, 3);
        let svg = `<g data-c2-total="${pts.length}"></g>` + F.open + `<g data-cq-d="${id}">`;
        if (draw !== 'deps') list.forEach((x, i) => {
            const [cx, cy] = pr.p(x.p.lon, x.p.lat); if (!Number.isFinite(cx)) return;
            const n = tot(x), rr = size === 'same' ? rMax * .45 : Math.max(3, rMax * Math.sqrt(n / maxN)), parts = [...x.by].sort((a, b) => val(b[1]) - val(a[1]));
            const label = `${x.p.place} : ${parts.map(([c, e]) => `${i18n(C0.find(k => k[0] === c)?.[2] || 'Autre métier')} ${val(e)}`).join(', ')}`;
            let shape = '';
            if (draw === 'dots') { let k = 0; parts.forEach(([c, e]) => { for (let j = 0; j < Math.min(val(e), 60); j++, k++) { const a = k * 2.39996, d = rMax * .16 * Math.sqrt(k); shape += `<circle cx="${r1(cx + Math.cos(a) * d)}" cy="${r1(cy + Math.sin(a) * d)}" r="${r2(clamp(rMax * .12, 2, 5))}" fill="${colOf.get(c) || '#a3a3a3'}" stroke="#fff" stroke-width=".6"/>`; } }); }
            else if (draw === 'top' || rr < 7 || parts.length === 1) shape = `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r2(rr)}" fill="${colOf.get(parts[0][0]) || '#a3a3a3'}" fill-opacity=".9" stroke="#fff" stroke-width="1"/>`; // trop petit pour être lu : la couleur du plus fréquent
            else { let a0 = -Math.PI / 2; parts.forEach(([c, e]) => { const a1 = a0 + Math.PI * 2 * val(e) / n; shape += `<path d="${slice(cx, cy, rr, a0, a1)}" fill="${colOf.get(c) || '#a3a3a3'}" stroke="#fff" stroke-width=".8"/>`; a0 = a1; }); }
            svg += `<g class="cq-pt" data-cq-i="${i}" tabindex="0" role="button" aria-label="${esc(label)}">${tip(label + '\n' + i18n('Clic : les métiers de ce lieu'))}${shape}</g>`;
            if (o.placeLabels !== 'none' && (o.placeLabels === 'all' || i < 8)) svg += T(cx + rr + 3, cy, x.p.place, {size: clamp(fs * .72, 7, 15), weight: 600, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'});
        });
        svg += '</g>';
        const word = st && at !== null ? periodWord(at, st) : '';
        if (word && !o.__inFacet && !Number.isFinite(o.__year)) svg += title(word, fs);
        svg += F.close;
        let H = h;
        if (all.unknown.length && o.showMissing !== false && !o.__inFacet) { svg += missing(all.unknown, H, fs, spec); H += fs * 1.5; }
        if (!all.pts.length && !o.__inFacet) svg += emptyMsg(w, h, fs, 'Prends les métiers de ta généalogie (« Depuis l’app »).');
        else if (!pts.length && !o.__inFacet) svg += emptyMsg(w, h, fs, word ? i18n('Aucun métier noté au {when}.', {when: word}) : 'Aucun métier pour ce choix.');
        keepDetail(id, i => detail(spec, list[i], C0, val));
        const people = new Set(pts.map(who)).size;
        return {h: H, svg, legend: o.__inFacet ? [] : legendOf(spec, pts), geo: F.geo, desc: word ? i18n('Carte des métiers : {a}, {b} ({when}).', {a: pl(people, 'personne'), b: pl(pts.length, 'mention'), when: word}) : i18n('Carte des métiers : {a}, {b}.', {a: pl(people, 'personne'), b: pl(pts.length, 'mention')})};
    }
    function detail(spec, x, C0, val) {
        if (!x || !ext.openDialog) return;
        const parts = [...x.by].sort((a, b) => val(b[1]) - val(a[1]));
        const body = `<div class="cq-detail">${parts.map(([c, e]) => { const k = C0.find(y => y[0] === c) || ['', '❔', 'Autre métier'];
            const tr = [...e.trades].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, n]) => `<button type="button" class="link-button" data-cq-trade="${esc(key)}">🛠️ ${esc(rows(spec).find(r => r.key === key)?.trade || key)}</button> (${n})`).join(', ');
            return `<p><b>${esc(k[1])} ${esc(i18n(k[2]))} · ${val(e)}</b><br>${tr}</p>`; }).join('')}
            <p class="muted">${esc(i18n('Un clic sur un métier ouvre sa fiche (🛠️ Métiers anciens).'))}</p></div>`;
        ext.openDialog({eyebrow: i18n('LES MÉTIERS SUR LA CARTE'), title: x.p.place, body, submitLabel: i18n('Fermer'), onSubmit: () => true});
    }

    /* ─── Depuis l'app ─── */
    function fill(s, r, extra = {}) {
        const names = placesOf(s, r.places || {});
        s.rows = (r.rows || []).filter(e => names.has(e[1])).map(([pid, plc, y, key, sector, dom, how]) => ({label: names.get(plc), date: y === null ? '' : String(y), trade: r.names?.[key] || key, key, sector, domain: dom || '', how, name: r.people?.[pid] || '', pid, zone: (r.places[plc] || [])[1] || ''}));
        s.sectors = r.sectors || []; s.domains = r.domains || []; s.unclassed = (r.unclassed || []).slice(0, 60); keepUnplaced(s, r.unplaced);
        s.o = {...(s.o || {}), ...extra};
        return s;
    }
    const tradeName = el => (el?.selectedOptions?.[0]?.textContent || '').replace(/\s*\(\d+\)$/, '');
    const tradeApp = {
        html: () => pane('🔨 Les métiers de ta généalogie', 'Les métiers notés (profession, recensement, fiche), classés comme dans l’Arbre des métiers. Jamais un vivant ni une fiche confidentielle.',
            sel('classify', 'Classer par', [['', 'Grand secteur (12)'], ['domain', 'Famille de métiers du dictionnaire (18)'], ['one', 'Un métier et ses variantes']])
            + `<label data-cq-onlyone>${esc(i18n('Le métier'))}<select data-cq="trade"><option value="">${esc(i18n('Chargement…'))}</option></select></label>`
            + sel('pop', 'Qui', [['all', 'Toute ma base'], ['anc', 'Mes ancêtres'], ['pat', 'Ma branche paternelle (côté père)'], ['mat', 'Ma branche maternelle (côté mère)']])
            + sel('sex', 'Hommes et femmes', [['', 'Tous'], ['m', 'Les hommes'], ['f', 'Les femmes']])
            + sel('from', 'Période', [['', 'Toutes les époques'], ['1801', 'Au XIXe siècle'], ['-1789', 'Avant la Révolution (jusqu’en 1789)']])
            + sel('draw', 'Dessin', [['', 'Camembert par commune'], ['top', 'Un rond de la couleur du plus fréquent'], ['dots', 'Un point par personne'], ['deps', 'Départements colorés']])
            + sel('time', 'Temps', [['', '▶ Siècle par siècle'], ['small', '▦ Un petit dessin par siècle'], ['half', 'Par demi-siècle'], ['all', 'Tout ensemble']])),
        bind: (box, io) => {
            const ts = box.querySelector('[data-cq="trade"]'), one = box.querySelector('[data-cq-onlyone]');
            const sync = () => { one.hidden = val(box, 'classify') !== 'one'; }; sync(); box.addEventListener('change', sync);
            get({what: 'trade_list'}).then(r => { const cur = io.spec().o?.trade || ''; ts.innerHTML = (r.trades || []).slice(0, 400).map(t => `<option value="${esc(t.key)}"${t.key === cur ? ' selected' : ''}>${esc(t.name)} (${t.n})</option>`).join('') || `<option value="">${esc(i18n('Aucun métier'))}</option>`; }).catch(() => { ts.innerHTML = '<option value="">—</option>'; });
            bindGo(box, async () => {
                const r = await get({what: 'trades', pop: val(box, 'pop'), root: startId()}), s = io.spec(), classify = val(box, 'classify');
                if (r.error) throw new Error(r.error);
                const sex = val(box, 'sex'), from = val(box, 'from');
                r.rows = (r.rows || []).filter(e => (!sex || r.gender?.[e[0]] === sex) && (!from || (e[2] !== null && (from.startsWith('-') ? e[2] <= Number(from.slice(1)) : e[2] >= Number(from) && e[2] <= Number(from) + 99))));
                fill(s, r, {classify, trade: classify === 'one' ? ts.value : '', tradeName: classify === 'one' ? tradeName(ts) : '', draw: val(box, 'draw'), tmode: val(box, 'time'), time: {...(s.o?.time || {}), show: !['all', 'small'].includes(val(box, 'time')), step: val(box, 'time') === 'half' ? 50 : 100},
                    title: classify === 'one' ? i18n('Où on était {trade}', {trade: tradeName(ts)}) : i18n('Les métiers de la famille')});
                if (!s.rows.length) throw new Error(i18n('Aucun métier avec un lieu pour ce choix.'));
                io.apply(s);
                return i18n('{a} notés · {b} classés · {c} « ❔ autre » à classer', {a: pl(s.rows.length, 'métier'), b: s.rows.filter(x => x.sector !== 'autre').length, c: s.rows.filter(x => x.sector === 'autre').length});
            });
        },
    };
    const SP = {Tulle: [45.2694, 1.768], Naves: [45.3118, 1.7521], Seilhac: [45.3667, 1.7167], Meymac: [45.5361, 2.1464], Ussel: [45.548, 2.31], Brive: [45.159, 1.533]};
    const sp = n => `${n} ${SP[n][0]}, ${SP[n][1]}`;
    const sample = () => { const out = []; const plan = [['Naves', 1690, 'laboureur', 'agri'], ['Naves', 1745, 'tisserand', 'arti'], ['Tulle', 1760, 'tanneur', 'arti'], ['Tulle', 1772, 'marchand', 'comm'], ['Seilhac', 1790, 'cultivateur', 'agri'], ['Meymac', 1720, 'laboureur', 'agri'],
        ['Tulle', 1830, 'sabotier', 'arti'], ['Tulle', 1846, 'instituteur', 'lib'], ['Naves', 1850, 'cultivateur', 'agri'], ['Brive', 1880, 'cheminot', 'tran'], ['Ussel', 1870, 'aubergiste', 'comm'], ['Tulle', 1890, 'ouvrier', 'indu'], ['Seilhac', 1860, 'cultivateur', 'agri'], ['Naves', 1870, 'ménagère', 'foyer'], ['Brive', 1910, 'employé', 'lib']];
        plan.forEach(([p, y, t, s], i) => { for (let k = 0; k < 1 + (i % 3); k++) out.push({label: sp(p), date: String(y + k * 7), trade: t, key: t, sector: s, how: 'act', name: `MAZAUD ${i}-${k}`}); }); return out; };
    P2.add('trademap', {icon: '🔨', label: 'Les métiers sur la carte (par secteur, siècle par siècle)', render: GC.remember(trademap), legend: 'bottom', time: timeOf(100, {stepOf}),
        grids: [{key: 'rows', label: 'Les métiers notés (un par ligne)', cols: [C('label', 'Lieu (« Tulle », « Tulle 45.27, 1.77 »)'), C('date', 'Date ou année', 'text', {ph: '1850'}), C('trade', 'Métier'), C('sector', 'Secteur', 'select', {choices: SECT.map(x => [x[0], x[2]])}), C('name', 'Personne')]}],
        options: [REC, C('classify', 'Classer par', 'select', {choices: [['', 'Grand secteur (12)'], ['domain', 'Famille de métiers du dictionnaire (18)'], ['one', 'Un seul métier et ses variantes'], ['mine', 'Mes couleurs à moi par métier']]}),
            C('colors', 'Mes couleurs (« tisserand=#aa3300 ; meunier=#3355aa »)', 'text', {when: s => s.o?.classify === 'mine'}),
            C('draw', 'Dessin', 'select', {choices: [['', 'Camembert par commune'], ['top', 'Un rond de la couleur du plus fréquent'], ['dots', 'Un point par personne'], ['deps', 'Départements colorés']]}),
            C('tmode', 'Temps', 'select', {choices: [['', '▶ Siècle par siècle'], ['small', '▦ Un petit dessin par siècle'], ['half', 'Par demi-siècle'], ['all', 'Tout ensemble']]}),
            C('at', 'Siècle montré (une année ; vide = tous)', 'text', {ph: '1800', when: s => !['all', 'small'].includes(s.o?.tmode)}),
            C('where', 'Où placer le métier', 'select', {choices: [['', 'Lieu de l’acte, sinon résidence, sinon naissance'], ['act', 'Lieu de l’acte seulement']]}),
            C('multi', 'Plusieurs métiers', 'select', {choices: [['', 'Chacun à sa date'], ['main', 'Le principal seulement']]}),
            C('foyer', '🧺 Au foyer, sans profession', 'select', {choices: [['', 'Montrés'], ['hide', 'Cachés']]}),
            C('size', 'Taille', 'select', {choices: [['', 'Nombre de personnes'], ['mentions', 'Nombre de mentions'], ['same', 'Tous pareils']]}),
            C('dotSize', 'Taille des ronds', 'range', {min: .3, max: 3, step: .1, def: 1}), C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Les plus grands'], ['all', 'Tous'], ['none', 'Aucun']]}), ...mapOpts, ...COMMON],
        sample: () => ({o: {title: i18n('Les métiers de la famille'), map: 'fr', time: {show: true, step: 100}}, rows: sample()}),
        fromApp: tradeApp, describe: spec => i18n('Carte des métiers : {n}.', {n: pl(rows(spec).length, 'mention')})});
    ext.diagramCartesPlus2.trademap = trademap;
    /** 🛠️ fiche d'un métier ancien → « 🗺 Où on l'exerçait » : la carte réglée sur ce métier et ses variantes */
    ext.diagramCartesPlus2.openTrade = async (key, name) => {
        try { const r = await get({what: 'trades'}); r.rows = (r.rows || []).filter(e => e[3] === key);
            if (!r.rows.length) return window.LCNDA_APP?.toast?.(i18n('Aucun métier avec un lieu pour ce choix.'));
            const s = fill({kind: 'trademap', o: {map: 'fr'}}, r, {classify: 'one', trade: key, tradeName: name, title: i18n('Où on était {trade}', {trade: name}), tmode: 'all'});
            ext.openDiagramEditor?.(null, {spec: s, name: s.o.title});
        } catch (e) { window.LCNDA_APP?.toast?.(e.message || String(e), 'error'); }
    };
})();

/* ═════════ 👫 Les deux lignées en miroir (maquette, partie 1) ═════════
 * Les ancêtres du côté du père en bleu, ceux du côté de la mère en orange (ou quatre grands-parents, deux personnes, deux noms,
 * deux listes), sur la même carte : les communes où les deux lignées sont passées sont entourées. Superposées, côte à côte ou
 * ⇆ glisser (un trait qui découvre l'autre côté). Données : op mirror de lib/cartes_plus2.php (dgn_sosa, cp_hidden). */
(() => {
    'use strict';
    const P2 = window.LCNDA_EXT?.diagramCartesPlus2; if (!P2) return;
    const {T, esc, num, clamp, r1, r2, rows, str, C, pl, tip, opt, optN, KM, bases, frame, locate, missing, emptyMsg, title, periodWord, keepDetail, placeNames, PLACE_LABELS,
        get, placesOf, keepUnplaced, pane, bindGo, sel, val, checks, startId, personField, pickedId, pickerPut, mapOpts, COMMON, REC, i18n, A, ext, GC, color} = P2.H;
    const PAL = {'': ['#1f6fd1', '#e8890c', '#6fa8ef', '#f2b766'], pink: ['#1f6fd1', '#d6408f', '#6fa8ef', '#ee8fc0']};
    const MIX = '#7b4fb0';
    const colorsOf = (spec, n) => { const o = spec.o || {}; if (o.colors === 'mine') return [color(o.colorA, '#1f6fd1'), color(o.colorB, '#e8890c'), color(o.colorC, '#6fa8ef'), color(o.colorD, '#f2b766')].slice(0, n); return (PAL[o.colors] || PAL['']).slice(0, n).length === n ? (PAL[o.colors] || PAL['']).slice(0, n) : PAL[''].slice(0, n); };
    const groupsOf = spec => { const g = Array.isArray(spec.groups) && spec.groups.length ? spec.groups : [{label: 'Côté père'}, {label: 'Côté mère'}]; return g.slice(0, 4); };
    const stepOf = spec => { const s = spec.o?.step; return s === 'gen' ? 1 : s === '25' ? 25 : 10; };
    /** le curseur ▶ : par décennie, par 25 ans, ou par génération (1 = la personne de départ) */
    const time = {
        range: spec => { if (spec.o?.step === 'gen') { const gs = rows(spec).map(r => Number(r.gen)).filter(g => g > 0); return gs.length ? [Math.max(2, Math.min(...gs)), Math.max(...gs)] : [NaN, NaN]; }
            const s = stepOf(spec), ys = rows(spec).map(r => H2.yearOf(r.date)).filter(y => y !== null); return ys.length ? [Math.floor(Math.min(...ys) / s) * s, Math.floor(Math.max(...ys) / s) * s] : [NaN, NaN]; },
        at: (spec, y) => { spec.o = {...(spec.o || {}), __year: y, time: {...(spec.o?.time || {}), step: stepOf(spec)}}; return spec; },
    };
    const H2 = P2.H;
    /** les lignes gardées pour l'image en cours (curseur ▶ : tout jusqu'à cette date, ou seulement la période) */
    function kept(spec, all) {
        const o = spec.o || {}, gen = o.step === 'gen', st = stepOf(spec), y = Number.isFinite(o.__year) ? o.__year : String(o.at ?? '').trim() !== '' ? num(o.at) : null;
        const at = y === null ? null : gen ? Math.round(y) : Math.floor(y / st) * st, cumul = opt(o, 'window', '') !== 'period';
        return {at, pts: all.filter(p => {
            if (opt(o, 'implex', '') === 'short' && p.r.both && String(p.r.short ?? '') !== '' && Number(p.r.short) !== Number(p.r.side)) return false; // seulement du côté du chemin le plus court
            if (at === null) return true;
            if (gen) { const g = Number(p.r.gen) || 0; return cumul ? g >= at : g === at; } // par génération : des plus anciens vers les plus récents
            return p.y !== null && (cumul ? p.y < at + st : p.y >= at && p.y < at + st);
        })};
    }
    /** les lieux et, par lieu, ce que chaque côté y a laissé */
    function byPlace(pts, n) {
        const g = new Map();
        pts.forEach(p => { const k = `${r2(p.lon)}|${r2(p.lat)}`; let x = g.get(k); if (!x) g.set(k, x = {p, sides: Array.from({length: n}, () => ({n: 0, y0: null, y1: null, pids: new Set(), ys: []})), mix: 0});
            const s = x.sides[clamp(Number(p.r.side) || 0, 0, n - 1)]; s.n++; s.pids.add(p.pid || p.r.name); if (p.y !== null) { s.ys.push(p.y); s.y0 = s.y0 === null ? p.y : Math.min(s.y0, p.y); s.y1 = s.y1 === null ? p.y : Math.max(s.y1, p.y); } if (p.r.both) x.mix++; });
        return [...g.values()];
    }
    /** à la même époque : deux côtés avec des événements à moins de N ans l'un de l'autre */
    const sameEra = (a, b, n) => a.ys.some(x => b.ys.some(y => Math.abs(x - y) <= n));
    function meetings(spec, list) {
        const o = spec.o || {}, how = opt(o, 'meet', ''), era = optN(o, 'eraYears', 25, 1, 200), near = optN(o, 'nearKm', 10, 1, 50), out = [];
        if (how === 'near') { // à moins de N km : la même commune ou deux communes voisines
            list.forEach((x, i) => { const here = x.sides.map((s, k) => s.n ? k : -1).filter(k => k >= 0); if (here.length > 1) out.push({x, y: null, km: 0, era: here.length > 1 && sameEra(x.sides[here[0]], x.sides[here[1]], era)});
                list.slice(i + 1).forEach(y => { const km = KM([x.p.lon, x.p.lat], [y.p.lon, y.p.lat]); if (km > near) return; const a = x.sides.findIndex(s => s.n), b = y.sides.findIndex((s, k) => s.n && k !== a); if (a >= 0 && b >= 0 && !(here.length > 1)) out.push({x, y, km: Math.round(km), era: sameEra(x.sides[a], y.sides[b], era)}); }); });
            return out;
        }
        list.forEach(x => { const here = x.sides.map((s, k) => (s.n ? k : -1)).filter(k => k >= 0); if (here.length < 2) return; const e = sameEra(x.sides[here[0]], x.sides[here[1]], era); if (how === 'era' && !e) return; out.push({x, y: null, km: 0, era: e}); });
        return out;
    }
    function layer(spec, F, list, n, cols, R0, maxN, only = null) {
        const {pr} = F, o = spec.o || {}; let svg = '';
        const offs = n === 2 ? [[-.42, 0], [.42, 0]] : [[-.42, -.42], [.42, -.42], [-.42, .42], [.42, .42]];
        list.forEach(x => {
            const [cx, cy] = pr.p(x.p.lon, x.p.lat); if (!Number.isFinite(cx)) return;
            x.sides.forEach((s, k) => { if (!s.n || (only !== null && k !== only)) return;
                const rr = opt(o, 'size', '') === 'same' ? R0 : Math.max(2.5, R0 * Math.sqrt(s.n / maxN) * 1.6), solo = x.sides.filter(z => z.n).length === 1 || only !== null;
                const dx = solo ? 0 : offs[k][0] * rr, dy = solo ? 0 : offs[k][1] * rr;
                svg += `<circle cx="${r1(cx + dx)}" cy="${r1(cy + dy)}" r="${r2(rr)}" fill="${cols[k]}" fill-opacity=".72" stroke="#fff" stroke-width="1">${tip(`${x.p.place} — ${i18n(groupsOf(spec)[k]?.label || '')} : ${pl(s.n, 'événement')}${s.y0 !== null ? ` (${s.y0}${s.y1 !== s.y0 ? '–' + s.y1 : ''})` : ''}`)}</circle>`; });
            if (x.mix && opt(o, 'implex', '') !== 'short' && only === null) svg += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r2(clamp(R0 * .45, 2, 6))}" fill="${MIX}" stroke="#fff" stroke-width="1">${tip(i18n('Ancêtre des deux côtés'))}</circle>`;
        });
        return svg;
    }
    function mirrormap(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const all = locate(spec, B0.list), G = groupsOf(spec), n = G.length, cols = colorsOf(spec, n);
        const {at, pts} = kept(spec, all.pts), list = byPlace(pts, n), M = meetings(spec, list), draw = opt(o, 'draw', '');
        const maxN = Math.max(1, ...list.flatMap(x => x.sides.map(s => s.n))), id = 'cqm' + Math.random().toString(36).slice(2, 8);
        const allPts = all.pts.map(p => [p.lon, p.lat]);
        let svg = `<g data-c2-total="${pts.length}"></g>`, H = 0, geo = null;
        // un côté vide : on le dit au-dessus de la carte, l'autre reste dessiné
        const empty = G.map((g, k) => (all.pts.some(p => Number(p.r.side) === k) ? null : g)).filter(Boolean);
        if (empty.length && all.pts.length) { empty.forEach(g => { svg += T(0, H + fs * .8, i18n('Aucun ancêtre connu : {who}', {who: i18n(g.label)}), {size: fs * .9, fill: '#a5552a', weight: 700}); H += fs * 1.4; }); }
        const word = at === null ? '' : o.step === 'gen' ? i18n('Génération {g}', {g: String(at)}) : periodWord(at, stepOf(spec));
        if (draw === 'side') { // côte à côte : un dessin par côté, au même cadrage
            const gap = fs, cw = W < 520 ? W : (W - gap * (n === 4 ? 1 : n - 1)) / (n === 4 ? 2 : n), percol = W < 520 ? 1 : (n === 4 ? 2 : n);
            let rowH = 0, y0 = H;
            G.forEach((g, k) => { const F = frame({...spec, o: {...o, height: Math.round(cw * .95)}}, cw, fs, allPts, null, Math.round(cw * .95)); if (F.wait) return;
                const c = k % percol; if (c === 0 && k) { y0 += rowH + gap; rowH = 0; } const x = c * (cw + gap);
                const R0 = clamp(cw / 70, 3, 9) * clamp(num(o.dotSize) || 1, .3, 3);
                svg += `<g transform="translate(${r1(x)} ${r1(y0 + fs * 1.6)})">${F.open}${layer(spec, F, list, n, cols, R0, maxN, k)}${placeNames(spec, F, pts.filter(p => Number(p.r.side) === k), fs * .85)}${F.close}</g>` + T(x + 4, y0 + fs * .8, `● ${i18n(g.label)} · ${pl(list.filter(z => z.sides[k].n).length, 'lieu', 'lieux')}`, {size: fs * .95, weight: 800, fill: cols[k]});
                rowH = Math.max(rowH, F.h + fs * 1.6); });
            H = y0 + rowH;
        } else {
            const F = frame(spec, W, fs, allPts); if (F.wait) return F.wait; geo = F.geo;
            const R0 = clamp(F.w / 90, 3, 10) * clamp(num(o.dotSize) || 1, .3, 3), {pr} = F;
            let body = '';
            if (draw === 'swipe') { // ⇆ glisser : le premier côté à gauche du trait, l'autre à droite
                const xs = F.w * clamp(optN(o, 'swipe', 50, 0, 100) / 100, 0, 1), cid = id + 's';
                body += `<defs><clipPath id="${cid}a"><rect x="0" y="0" width="${r1(xs)}" height="${r1(F.h)}"/></clipPath><clipPath id="${cid}b"><rect x="${r1(xs)}" y="0" width="${r1(F.w - xs)}" height="${r1(F.h)}"/></clipPath></defs>`
                    + `<g clip-path="url(#${cid}a)">${layer(spec, F, list, n, cols, R0, maxN, 0)}</g><g clip-path="url(#${cid}b)">${G.slice(1).map((_, k) => layer(spec, F, list, n, cols, R0, maxN, k + 1)).join('')}</g>`
                    + `<line x1="${r1(xs)}" y1="0" x2="${r1(xs)}" y2="${r1(F.h)}" stroke="#111" stroke-width="2" stroke-dasharray="6 4"/>`;
            } else body += layer(spec, F, list, n, cols, R0, maxN);
            body += placeNames(spec, F, pts, fs);
            // ⭕ là où elles se rencontrent (trait plein : à la même époque ; pointillé : jamais à la même époque)
            body += `<g data-cq-d="${id}">`;
            M.forEach((m, i) => { const [cx, cy] = pr.p(m.x.p.lon, m.x.p.lat); if (!Number.isFinite(cx)) return;
                const rr = R0 * 2.4 + 4, ring = `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r2(rr)}" fill="none" stroke="#111" stroke-width="1.8"${m.era ? '' : ' stroke-dasharray="4 3"'}/>`;
                const link = m.y ? (() => { const [x2, y2] = pr.p(m.y.p.lon, m.y.p.lat); return `<line x1="${r1(cx)}" y1="${r1(cy)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="#111" stroke-width="1.4" stroke-dasharray="2 3"/>`; })() : '';
                body += `<g class="cq-pt" data-cq-i="${i}" tabindex="0" role="button" aria-label="${esc(m.x.p.place)}">${tip(meetText(spec, m))}${ring}${link}</g>`; });
            body += '</g>';
            const wd = spec.wedding; if (wd?.label && opt(o, 'wedding', '') !== 'hide') { const p = GC.placeOf(spec, wd.label, B0.list); if (p) { const [cx, cy] = pr.p(p[0], p[1]); if (Number.isFinite(cx)) body += T(cx, cy - R0 * 2.4 - fs * .6, '💍', {size: fs * 1.1, anchor: 'middle'}); } }
            svg += `<g transform="translate(0 ${r1(H)})">${F.open}${body}${word && !Number.isFinite(o.__year) ? title(word, fs) : ''}${F.close}</g>`;
            H += F.h;
            // sous la carte : les communes où elles se rencontrent (des lieux et des années, jamais un vivant)
            if (M.length && o.meetList !== false) {
                H += fs * .6; svg += T(0, H + fs * .6, `⭕ ${i18n('Où elles se rencontrent')} · ${M.length}`, {size: fs, weight: 800}); H += fs * 1.5;
                M.slice(0, clamp(Math.round(num(o.meetMax) || 5), 1, 20)).forEach(m => { svg += T(0, H + fs * .55, meetText(spec, m), {size: fs * .8, fill: '#333'}); H += fs * 1.25; });
            }
            keepDetail(id, i => detail(spec, M[i], list));
        }
        if (all.unknown.length && o.showMissing !== false) { svg += missing(all.unknown, H, fs, spec); H += fs * 1.5; }
        if (!all.pts.length) svg += emptyMsg(W, Math.max(H, 300), fs, 'Prends les deux lignées de ta personne de départ (« Depuis l’app »).');
        const legend = G.map((g, k) => ({label: `${i18n(g.label)}${g.who ? ` (${g.who})` : ''} · ${pl(list.filter(x => x.sides[k].n).length, 'lieu', 'lieux')}`, color: cols[k]}));
        if (M.length) legend.push({label: `⭕ ${i18n('Les deux lignées')} · ${M.length}`, color: '#111111'});
        return {h: Math.max(H, all.pts.length ? 0 : 300), svg, legend, geo, desc: i18n('Les deux lignées : {a}, {b} où elles se rencontrent.', {a: pl(list.length, 'lieu', 'lieux'), b: pl(M.length, 'commune')})};
    }
    function meetText(spec, m) {
        const G = groupsOf(spec), span = s => (s.y0 !== null ? ` (${s.y0}${s.y1 !== s.y0 ? '–' + s.y1 : ''})` : '');
        const parts = (m.y ? [m.x, m.y] : [m.x]).flatMap(x => x.sides.map((s, k) => (s.n ? `${i18n(G[k]?.label || '')} ${s.n}${span(s)}` : null)).filter(Boolean));
        const head = m.y ? i18n('{a} et {b}, à {km} km', {a: m.x.p.place, b: m.y.p.place, km: String(m.km)}) : m.x.p.place;
        const wd = spec.wedding && str(spec.wedding.label) === str(m.x.p.place) ? ` · 💍 ${i18n('mariage de {a} et {b}', {a: spec.wedding.a || '?', b: spec.wedding.b || '?'})}${spec.wedding.date ? ' (' + spec.wedding.date + ')' : ''}` : '';
        return `${head} — ${parts.join(' · ')}${m.era ? '' : ' · ' + i18n('jamais à la même époque')}${wd}`;
    }
    function detail(spec, m, list) {
        if (!m || !ext.openDialog) return;
        const names = new Map(rows(spec).map(r => [Number(r.pid) || 0, r.name]));
        const G = groupsOf(spec), places = m.y ? [m.x, m.y] : [m.x];
        const body = `<div class="cq-detail"><p>${esc(meetText(spec, m))}</p>${places.map(x => x.sides.map((s, k) => s.n ? `<p><b>${esc(i18n(G[k]?.label || ''))} · ${esc(x.p.place)}</b><br>${[...s.pids].slice(0, 30).map(pid => names.get(Number(pid)) ? `<button type="button" class="link-button" data-cq-person="${Number(pid)}">${esc(names.get(Number(pid)))}</button>` : '').filter(Boolean).join(', ')}</p>` : '').join('')).join('')}</div>`;
        ext.openDialog({eyebrow: i18n('LES DEUX LIGNÉES'), title: m.x.p.place, body, submitLabel: i18n('Fermer'), onSubmit: () => true});
    }

    /* ─── Depuis l'app ─── */
    const EVS = [['births', 'Naissances'], ['marriages', 'Mariages'], ['deaths', 'Décès'], ['residences', 'Résidences et recensements']];
    function fill(s, r, extra = {}) {
        const names = placesOf(s, r.places || {});
        s.rows = [];
        (r.events || []).forEach(([pid, plc, y, tag]) => { if (!names.has(plc)) return; (r.member?.[pid] || []).forEach(side => s.rows.push({label: names.get(plc), date: y === null ? '' : String(y), side, name: r.people?.[pid] || '', pid, both: r.both?.[pid] ? 1 : 0, short: r.short?.[pid] ?? '', gen: r.gen?.[pid] || '', tag})); });
        s.groups = (r.groups || []).map(g => ({label: g.label, who: g.who || ''}));
        s.wedding = r.wedding ? {label: names.get(r.wedding.place) || '', year: r.wedding.year, date: r.wedding.date, a: r.wedding.a, b: r.wedding.b} : null;
        keepUnplaced(s, r.unplaced);
        const fam = r.root?.family || '';
        const t = r.side === 'pat' ? (r.root?.shown ? i18n('Les deux lignées de {name}', {name: r.root.name}) : i18n('Les deux lignées de la famille {name}', {name: fam})) : r.side === 'grand' ? (r.root?.shown ? i18n('Les quatre grands-parents de {name}', {name: r.root.name}) : i18n('Les quatre grands-parents de la famille {name}', {name: fam})) : s.groups.map(g => g.who || i18n(g.label)).join(' · ');
        s.o = {...(s.o || {}), title: t, ...extra};
        return s;
    }
    const mirrorApp = {
        html: () => pane('👫 Deux lignées de ta généalogie', 'Côté père et côté mère de la personne de départ (ou quatre grands-parents, deux personnes, deux noms, deux listes). Jamais un vivant ni une fiche confidentielle : une personne de départ vivante n’est jamais un point.',
            sel('side', 'Les deux côtés', [['pat', 'Côté père / côté mère'], ['grand', 'Mes quatre grands-parents (4 couleurs)'], ['two', 'Deux personnes au choix'], ['names', 'Deux noms de famille'], ['lists', 'Deux groupes de Mes listes']])
            + `<div data-cq-for="pat grand">${personField('cq_root', 'Personne de départ')}</div>`
            + `<div data-cq-for="two">${personField('cq_a', 'Première personne')}${personField('cq_b', 'Deuxième personne')}</div>`
            + `<div data-cq-for="names"><label>${esc(i18n('Premier nom'))}<input data-cq="na" maxlength="80"></label><label>${esc(i18n('Deuxième nom'))}<input data-cq="nb" maxlength="80"></label></div>`
            + `<div data-cq-for="lists"><label>${esc(i18n('Première liste'))}<select data-cq="la"></select></label><label>${esc(i18n('Deuxième liste'))}<select data-cq="lb"></select></label></div>`
            + sel('gens', 'Générations', [['8', '8'], ['4', '4'], ['6', '6'], ['10', '10'], ['0', 'tout']])
            + `<fieldset><legend>${esc(i18n('Événements'))}</legend><div class="cq-checks">${EVS.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-cq="ev" value="${k}" checked> ${esc(i18n(l))}</label>`).join('')}</div></fieldset>`
            + sel('period', 'Période', [['', 'Toutes les époques'], ['-1789', 'Avant la Révolution (jusqu’en 1789)']])),
        bind: (box, io) => {
            const sync = () => { const v = val(box, 'side'); box.querySelectorAll('[data-cq-for]').forEach(d => { d.hidden = !d.dataset.cqFor.split(' ').includes(v); }); };
            sync(); box.addEventListener('change', sync);
            pickerPut(box, 'cq_root', startId());
            A().api('my_lists').then(r => { const opts = (r.lists || []).filter(l => ['persons', 'events', 'records'].includes(l.source)).map(l => `<option value="${Number(l.id)}">${esc(l.name)}</option>`).join('') || `<option value="">${esc(i18n('Aucune liste'))}</option>`; ['la', 'lb'].forEach(k => { const s = box.querySelector(`[data-cq="${k}"]`); if (s) s.innerHTML = opts; }); }).catch(() => {});
            bindGo(box, async () => {
                const side = val(box, 'side'), q = {what: 'mirror', side, gens: val(box, 'gens'), ev: checks(box, 'ev').join(',') || 'births', root: pickedId(box, 'cq_root') || startId(), a: pickedId(box, 'cq_a'), b: pickedId(box, 'cq_b'), na: val(box, 'na'), nb: val(box, 'nb'), la: val(box, 'la'), lb: val(box, 'lb')};
                const r = await get(q); if (r.error) throw new Error(r.error);
                const per = val(box, 'period'); if (per.startsWith('-')) r.events = (r.events || []).filter(e => e[2] !== null && e[2] <= Number(per.slice(1)));
                const s = fill(io.spec(), r, {time: {...(io.spec().o?.time || {}), show: true, step: 10}});
                if (!s.rows.length) throw new Error(i18n('Aucun événement avec un lieu pour ce choix.'));
                io.apply(s); return s.groups.map((g, k) => `${i18n(g.label)} : ${pl(new Set(s.rows.filter(x => x.side === k).map(x => x.label)).size, 'lieu', 'lieux')}`).join(' · ');
            });
        },
    };
    /** fiche → ⋯ → « 👫 Ses deux lignées sur la carte » : le diagramme réglé sur elle */
    async function openFor(pid) {
        try { const r = await get({what: 'mirror', side: 'pat', root: pid, gens: 8}); if (r.error) throw new Error(r.error);
            const s = fill({kind: 'mirrormap', o: {map: 'fr', time: {show: true, step: 10}}}, r); if (!s.rows.length) throw new Error(i18n('Aucun événement avec un lieu pour ce choix.'));
            ext.openDiagramEditor?.(null, {spec: s, name: s.o.title});
        } catch (e) { A()?.toast?.(e.message || String(e), 'error'); }
    }
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal' || !ext.openDiagramEditor) return null; return {icon: '👫', label: 'Ses deux lignées sur la carte', run: () => openFor(Number(p.id))}; });

    const SP = {Tulle: [45.2694, 1.768], Naves: [45.3118, 1.7521], Seilhac: [45.3667, 1.7167], Chameyrat: [45.2471, 1.7043], Laguenne: [45.242, 1.781], Meymac: [45.5361, 2.1464], Favars: [45.263, 1.670], Gimel: [45.297, 1.844]};
    const sp = n => `${n} ${SP[n][0]}, ${SP[n][1]}`;
    const sample = () => { const out = [];
        [['Naves', 0, 1772], ['Naves', 0, 1810], ['Naves', 0, 1838], ['Tulle', 0, 1861], ['Tulle', 0, 1890], ['Chameyrat', 0, 1840], ['Favars', 0, 1795], ['Tulle', 0, 1919],
            ['Laguenne', 1, 1830], ['Laguenne', 1, 1861], ['Seilhac', 1, 1868], ['Tulle', 1, 1895], ['Tulle', 1, 1919], ['Naves', 1, 1898], ['Gimel', 1, 1802], ['Meymac', 1, 1760]]
            .forEach(([p, side, y], i) => out.push({label: sp(p), date: String(y), side, name: side ? `LACOMBE ${i}` : `MAZAUD ${i}`, gen: 2 + (1919 - y) / 30 | 0}));
        return out; };
    P2.add('mirrormap', {icon: '👫', label: 'Les deux lignées en miroir (côté père, côté mère)', render: GC.remember(mirrormap), legend: 'bottom', time,
        grids: [{key: 'rows', label: 'Les événements des deux côtés (un par ligne)', cols: [C('label', 'Lieu (« Tulle », « Tulle 45.27, 1.77 »)'), C('date', 'Date ou année', 'text', {ph: '1850'}), C('side', 'Côté', 'select', {choices: [['0', 'Côté père'], ['1', 'Côté mère'], ['2', '3e groupe'], ['3', '4e groupe']]}), C('name', 'Personne')]}],
        options: [REC,
            C('meet', 'Elles se rencontrent', 'select', {choices: [['', 'Même commune'], ['era', 'Même commune à la même époque'], ['near', 'À moins de quelques km']]}),
            C('eraYears', 'À la même époque : à plus ou moins', 'number', {min: 1, max: 200, def: 25, unit: i18n('ans', {ctx: 'unite'})}),
            C('nearKm', 'Distance', 'range', {min: 1, max: 50, def: 10, unit: 'km', when: s => s.o?.meet === 'near'}),
            C('draw', 'Dessin', 'select', {choices: [['', 'Superposées'], ['side', 'Côte à côte'], ['swipe', '⇆ Glisser (un trait à déplacer)']]}),
            C('swipe', 'Position du trait', 'range', {min: 0, max: 100, def: 50, unit: '%', when: s => s.o?.draw === 'swipe'}),
            C('implex', 'Ancêtre des deux côtés', 'select', {choices: [['', 'Compté des deux côtés, couleur mélangée'], ['short', 'Seulement du côté du chemin le plus court']]}),
            C('step', 'Curseur ▶', 'select', {choices: [['', 'Par décennie'], ['25', 'Par 25 ans'], ['gen', 'Par génération']]}),
            C('window', 'Chaque image montre', 'select', {choices: [['', 'Tout jusqu’à cette date'], ['period', 'Seulement la période']]}),
            C('colors', 'Couleurs', 'select', {choices: [['', 'Bleu / orange (lisibles aussi par les daltoniens)'], ['pink', 'Bleu / rose'], ['mine', 'Mes deux couleurs…']]}),
            C('colorA', 'Couleur du premier côté', 'color', {def: '#1f6fd1', when: s => s.o?.colors === 'mine'}), C('colorB', 'Couleur du deuxième côté', 'color', {def: '#e8890c', when: s => s.o?.colors === 'mine'}),
            C('size', 'Taille des points', 'select', {choices: [['', 'Selon le nombre d’événements'], ['same', 'Tous pareils']]}), C('dotSize', 'Taille des ronds', 'range', {min: .3, max: 3, step: .1, def: 1}),
            C('meetList', 'Lister sous la carte où elles se rencontrent', 'check', {def: true}), C('meetMax', 'Combien de lignes', 'number', {min: 1, max: 20, def: 5, when: s => s.o?.meetList !== false}),
            C('wedding', 'Le mariage des parents (💍)', 'select', {choices: [['', 'Montré'], ['hide', 'Caché']]}), PLACE_LABELS, ...mapOpts, ...COMMON],
        sample: () => ({o: {title: i18n('Les deux lignées de la famille {name}', {name: 'MAZAUD'}), map: 'fr', time: {show: true, step: 10}}, groups: [{label: 'Côté père', who: 'MAZAUD'}, {label: 'Côté mère', who: 'LACOMBE'}], wedding: {label: sp('Tulle'), year: 1919, date: '12 avril 1919', a: 'Pierre MAZAUD', b: 'Marie LACOMBE'}, rows: sample()}),
        fromApp: mirrorApp, describe: spec => i18n('Les deux lignées : {n}.', {n: pl(rows(spec).length, 'événement')})});
    ext.diagramCartesPlus2.mirrormap = mirrormap; ext.diagramCartesPlus2.openMirror = openFor;
})();

/* ═════════ ⭕ L'aire de vie, génération par génération (maquette, partie 5) ═════════
 * Pour chaque génération d'ancêtres (ou chaque siècle, ou une vie), la zone qui tient l'essentiel de leurs naissances, mariages
 * et décès : le centre est le milieu des événements (médiane : un ancêtre parti au loin ne le tire pas), on garde les 80 % les plus
 * proches, puis un cercle qui passe par le plus loin des gardés, ou l'enveloppe (le contour au plus juste). Mêmes distances que
 * 🧭 Loin du berceau et 💍 Rayon des mariages. Données : op areas de lib/cartes_plus2.php. */
(() => {
    'use strict';
    const P2 = window.LCNDA_EXT?.diagramCartesPlus2; if (!P2) return;
    const {T, esc, num, clamp, r1, r2, rows, C, pl, tip, opt, optN, KM, median, hull, geoRing, poly, siecle, bases, frame, locate, missing, emptyMsg, multiples, keepDetail, placeNames, PLACE_LABELS,
        get, placesOf, keepUnplaced, pane, bindGo, sel, val, checks, startId, personField, pickedId, pickerPut, mapOpts, COMMON, REC, i18n, A, ext, GC, DR} = P2.H;
    const RAMP = ['#f6c48b', '#eea25a', '#e0782f', '#c85a1d', '#a8420f', '#86300b', '#5f2208', '#3d1605'];
    const SIDE = ['#1f6fd1', '#e8890c'];
    /** la clé de groupe d'une ligne : génération, siècle, ou personne (et le côté si « bleu / orange ») */
    const by = spec => opt(spec.o || {}, 'groupBy', spec.group || 'gen');
    const keyOf = (spec, p) => { const g = by(spec), side = opt(spec.o || {}, 'colors', '') === 'side' && Number(p.r.side) >= 0 ? `|${p.r.side}` : '';
        if (g === 'century') return p.y === null ? null : String(Math.floor(p.y / 100) * 100);
        if (g === 'person') return String(p.pid || p.r.name || '');
        return Number(p.r.gen) > 0 ? String(Number(p.r.gen)) + side : null; };
    const labelOf = (spec, k, x) => { const g = by(spec); if (g === 'century') return siecle(Number(k)); if (g === 'person') return x.pts[0]?.r.name || ''; const [gen, side] = k.split('|');
        return (Number(gen) === 2 ? i18n('Gén. {g} · ses parents', {g: gen}) : i18n('Gén. {g}', {g: gen})) + (side !== undefined ? ` · ${i18n(side === '0' ? 'Côté père' : 'Côté mère')}` : ''); };
    const share = o => { const s = opt(o, 'share', ''); return s === '50' ? .5 : s === '90' ? .9 : s === 'custom' ? clamp(optN(o, 'shareN', 80, 40, 100) / 100, .4, 1) : .8; };
    /** les aires : centre (médiane), distances, part gardée, rayon, surface, hors de l'aire */
    function areas(spec, all) {
        const o = spec.o || {}, part = share(o), min = optN(o, 'min', 5, 2, 50), groups = new Map();
        all.forEach(p => { const k = keyOf(spec, p); if (k === null || k === '') return; let x = groups.get(k); if (!x) groups.set(k, x = {k, pts: []}); x.pts.push(p); });
        // le centre « berceau des plus anciens » : le milieu des naissances de la génération la plus lointaine
        const gens = all.filter(p => Number(p.r.gen) > 0), maxG = gens.length ? Math.max(...gens.map(p => Number(p.r.gen))) : 0;
        const oldest = gens.filter(p => Number(p.r.gen) === maxG); const cradle = oldest.length ? [median(oldest.map(p => p.lon)), median(oldest.map(p => p.lat))] : null;
        const rootB = spec.rootBirth ? GC.placeOf(spec, spec.rootBirth, []) || null : null;
        const out = [...groups.values()].map(x => {
            const c = opt(o, 'center', '') === 'root' && rootB ? [rootB[0], rootB[1]] : opt(o, 'center', '') === 'oldest' && cradle ? cradle : [median(x.pts.map(p => p.lon)), median(x.pts.map(p => p.lat))];
            const d = x.pts.map(p => ({p, km: KM(c, [p.lon, p.lat])})).sort((a, b) => a.km - b.km);
            const keep = d.slice(0, Math.max(1, Math.ceil(d.length * part))), out = d.slice(keep.length);
            const radius = keep.length ? keep[keep.length - 1].km : 0, ys = x.pts.map(p => p.y).filter(y => y !== null);
            return {...x, c, keep, out, radius, n: x.pts.length, y0: ys.length ? Math.min(...ys) : null, y1: ys.length ? Math.max(...ys) : null, few: x.pts.length < 10, none: x.pts.length < min};
        });
        const g = by(spec); out.sort((a, b) => g === 'gen' ? Number(b.k.split('|')[0]) - Number(a.k.split('|')[0]) || a.k.localeCompare(b.k) : g === 'century' ? Number(a.k) - Number(b.k) : (a.y0 ?? 0) - (b.y0 ?? 0));
        return out;
    }
    /** la surface d'une enveloppe, en km² (projection locale autour de son centre) */
    function hullKm2(a) {
        const P = a.keep.map(({p}) => [(p.lon - a.c[0]) * 111.32 * Math.cos(a.c[1] * Math.PI / 180), (p.lat - a.c[1]) * 110.57]), H = hull(P); if (H.length < 3) return 0;
        let s = 0; for (let i = 0; i < H.length; i++) { const [x1, y1] = H[i], [x2, y2] = H[(i + 1) % H.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s) / 2;
    }
    const roundKm2 = v => { const n = v < 100 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 100) * 100; return `≈ ${new Intl.NumberFormat('fr-FR').format(n)}`; };
    const colorsFor = (spec, list) => { const o = spec.o || {}, n = list.length;
        if (opt(o, 'colors', '') === 'side') return list.map(a => SIDE[Number(a.k.split('|')[1])] || '#7b4fb0');
        const ramp = opt(o, 'colors', '') === 'reverse' ? [...RAMP].reverse() : RAMP; return list.map((_, i) => ramp[Math.round(i / Math.max(1, n - 1) * (ramp.length - 1))]); };
    function drawAreas(spec, F, list, cols, fs) {
        const {pr} = F, o = spec.o || {}, shape = opt(o, 'shape', ''); let svg = '';
        list.forEach((a, i) => { if (a.none) return; const col = cols[i], dash = a.few ? ' stroke-dasharray="6 4"' : '', lab = `${labelOf(spec, a.k, a)} · ${i18n('rayon {km} km', {km: String(Math.round(a.radius))})}`;
            if (shape !== 'hull') { const ring = geoRing(pr, a.c[0], a.c[1], Math.max(.3, a.radius)); svg += `<path d="${poly(ring)}" fill="${col}" fill-opacity=".14" stroke="${col}" stroke-width="2.2"${dash}>${tip(lab)}</path>`; }
            if (shape !== '') { const P = a.keep.map(({p}) => pr.p(p.lon, p.lat)).filter(q => Number.isFinite(q[0])), H = hull(P); if (H.length >= 3) svg += `<path d="${poly(H)}" fill="${col}" fill-opacity="${shape === 'hull' ? .16 : .05}" stroke="${col}" stroke-width="${shape === 'hull' ? 2.2 : 1.4}"${shape === 'hull' ? dash : ' stroke-dasharray="2 3"'}>${tip(lab)}</path>`; }
            a.pts.forEach(p => { const [x, y] = pr.p(p.lon, p.lat); if (Number.isFinite(x)) svg += `<circle cx="${r1(x)}" cy="${r1(y)}" r="2.2" fill="${col}" stroke="#fff" stroke-width=".6"/>`; });
            const [cx, cy] = pr.p(a.c[0], a.c[1]); if (Number.isFinite(cx)) svg += `<g class="cq-pt" data-cq-i="${i}" tabindex="0" role="button" aria-label="${esc(lab)}">${tip(lab + '\n' + i18n('Clic : ses lieux, et ceux qui sont hors de l’aire'))}<circle cx="${r1(cx)}" cy="${r1(cy)}" r="4" fill="${col}" stroke="#111" stroke-width="1"/></g>`; });
        return svg;
    }
    function lifearea(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const all = locate(spec, B0.list), A0 = areas(spec, all.pts), cols = colorsFor(spec, A0), id = 'cqa' + Math.random().toString(36).slice(2, 8);
        // le cadrage tient les cercles en entier (le centre ± le rayon)
        const kept = A0.flatMap(a => { if (a.none) return []; const dl = a.radius / 111.2, dg = a.radius / (111.2 * Math.max(.05, Math.cos(a.c[1] * Math.PI / 180))); return [...a.keep.map(k => [k.p.lon, k.p.lat]), [a.c[0] - dg, a.c[1] - dl], [a.c[0] + dg, a.c[1] + dl]]; });
        const framePts = opt(o, 'frameAll', '') === 'all' ? all.pts.map(p => [p.lon, p.lat]) : kept.length ? kept : all.pts.map(p => [p.lon, p.lat]);
        let svg = `<g data-c2-total="${all.pts.length}"></g>`, H = 0, geo = null;
        const draw = opt(o, 'draw', '');
        if (draw === 'small' && !o.__inFacet) { // ▦ une aire par case, au même cadrage
            const list = A0.filter(a => !a.none).slice(0, 12).map(a => ({label: `${labelOf(spec, a.k, a)} · ${Math.round(a.radius)} km`, o: {__inFacet: true, __only: a.k}}));
            const M = multiples(spec, W, fs, list, (sp, w) => { const F = frame(sp, w, fs * .8, framePts, null, Math.round(w * .9)); if (F.wait) return F; const i = A0.findIndex(a => a.k === sp.o.__only); return {h: F.h, svg: F.open + drawAreas(sp, F, [A0[i]], [cols[i]], fs * .8) + F.close}; });
            svg += M.svg; H = M.h;
        } else {
            const F = frame(spec, W, fs, framePts); if (F.wait) return F.wait; geo = F.geo;
            let only = A0; const gi = Number.isFinite(o.__year) && draw === 'play' ? clamp(Math.round(o.__year), 0, A0.length - 1) : null;
            if (gi !== null) only = A0.map((a, i) => (i === gi ? a : {...a, none: true}));
            svg += `<g data-cq-d="${id}">` + F.open + drawAreas(spec, F, only, cols, fs) + placeNames(spec, F, all.pts, fs) + (gi !== null && A0[gi] ? T(10, 18, labelOf(spec, A0[gi].k, A0[gi]), {size: fs * 1.3, weight: 800, fill: '#1d1d1f', halo: '#ffffffd9'}) : '') + F.close + '</g>';
            H = F.h;
        }
        keepDetail(id, i => detail(spec, A0[i]));
        // le tableau sous la carte : génération, années, événements, rayon, surface, hors de l'aire (des lieux et des années, jamais un vivant)
        if (A0.length && o.table !== false && !o.__inFacet) {
            const cw = [.22, .2, .13, .13, .14, .18].map(x => x * W), head = [by(spec) === 'gen' ? i18n('Génération') : by(spec) === 'century' ? i18n('Siècle') : i18n('Personne'), i18n('Années'), i18n('Événements'), i18n('Rayon ({p} %)', {p: String(Math.round(share(o) * 100))}), i18n('Surface'), i18n('Hors de l’aire')];
            const line = (cells, y, bold) => { let x = 0; return cells.map((c, i) => { const t = T(x, y, c, {size: fs * .78, weight: bold ? 800 : 400, fill: bold ? '#555' : '#222'}); x += cw[i]; return t; }).join(''); };
            H += fs * .8; svg += line(head, H + fs * .5, true); H += fs * 1.3;
            A0.forEach((a, i) => { const surf = a.none ? '—' : `${roundKm2(opt(o, 'shape', '') === 'hull' ? hullKm2(a) : Math.PI * a.radius ** 2)} km²`;
                const outs = a.out.slice(0, 2).map(({p}) => `${p.place}${p.y !== null ? ` (${p.y})` : ''}`).join(', ') + (a.out.length > 2 ? ` +${a.out.length - 2}` : '');
                svg += `<rect x="0" y="${r1(H + fs * .1)}" width="${r1(fs * .5)}" height="${r1(fs * .7)}" fill="${cols[i]}"/>` + line([` ${labelOf(spec, a.k, a)}`, a.y0 === null ? '—' : `${a.y0}–${a.y1}`, `${a.n}${a.none ? ' · ' + i18n('trop peu') : a.few ? ' · ' + i18n('peu') : ''}`, a.none ? '—' : `${Math.round(a.radius)} km`, surf, a.out.length ? outs : '—'], H + fs * .5, false);
                H += fs * 1.15; });
        }
        if (all.unknown.length && o.showMissing !== false && !o.__inFacet) { svg += missing(all.unknown, H, fs, spec); H += fs * 1.5; }
        if (!all.pts.length) svg += emptyMsg(W, Math.max(H, 300), fs, 'Prends les ancêtres de ta personne de départ (« Depuis l’app »).');
        const sh = A0.filter(a => !a.none);
        return {h: Math.max(H, all.pts.length ? 0 : 300), svg, legend: [], geo, desc: sh.length ? i18n('Aire de vie : {n}, de {a} km à {b} km de rayon.', {n: pl(sh.length, 'aire', 'aires'), a: String(Math.round(Math.min(...sh.map(a => a.radius)))), b: String(Math.round(Math.max(...sh.map(a => a.radius))))}) : i18n('Aire de vie : pas assez d’événements.')};
    }
    function detail(spec, a) {
        if (!a || !ext.openDialog) return;
        const places = new Map(); a.pts.forEach(p => places.set(p.place, (places.get(p.place) || 0) + 1));
        const body = `<div class="cq-detail"><p><b>${esc(labelOf(spec, a.k, a))}</b> · ${esc(pl(a.n, 'événement'))}${a.y0 !== null ? ` · ${a.y0}–${a.y1}` : ''} · ${esc(i18n('rayon {km} km', {km: String(Math.round(a.radius))}))}</p>
            <p>${[...places].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([pl0, n]) => `${esc(pl0)} (${n})`).join(', ')}</p>
            ${a.out.length ? `<p><b>${esc(i18n('Hors de l’aire'))}</b> : ${a.out.slice(0, 20).map(({p, km}) => `${esc(p.place)}${p.y !== null ? ` (${p.y})` : ''} · ${Math.round(km)} km`).join(', ')}</p>` : ''}</div>`;
        ext.openDialog({eyebrow: i18n('L’AIRE DE VIE'), title: labelOf(spec, a.k, a), body, submitLabel: i18n('Fermer'), onSubmit: () => true});
    }
    // « une à la fois avec ▶ » : le curseur passe les aires une à une (des plus anciens aux plus récents)
    const time = {
        range: spec => { if (opt(spec.o || {}, 'draw', '') !== 'play') return [NaN, NaN]; const n = new Set(rows(spec).map(r => (by(spec) === 'gen' ? r.gen : by(spec) === 'century' ? Math.floor((P2.H.yearOf(r.date) ?? 0) / 100) : r.pid))).size; return n > 1 ? [0, n - 1] : [NaN, NaN]; },
        at: (spec, y) => { spec.o = {...(spec.o || {}), __year: y, time: {...(spec.o?.time || {}), step: 1}}; return spec; },
    };

    /* ─── Depuis l'app ─── */
    function fill(s, r, extra = {}) {
        const names = placesOf(s, r.places || {});
        s.rows = (r.rows || []).filter(e => names.has(e[1])).map(([pid, plc, y, tag, gen, side]) => ({label: names.get(plc), date: y === null ? '' : String(y), name: r.people?.[pid] || '', pid, tag, gen: gen || '', side}));
        s.group = r.group; s.rootBirth = r.birth && names.has(r.birth) ? names.get(r.birth) : ''; keepUnplaced(s, r.unplaced);
        const who = r.root?.shown ? r.root.name : r.root?.family ? i18n('la famille {name}', {name: r.root.family}) : '';
        s.o = {...(s.o || {}), groupBy: r.group, title: r.group === 'century' ? i18n('L’aire de vie de la famille, siècle par siècle') : r.group === 'person' ? i18n('L’aire d’une vie : {name}', {name: who}) : i18n('L’aire de vie des ancêtres de {name}', {name: who}), ...extra};
        return s;
    }
    const areaApp = {
        html: () => pane('⭕ L’aire de vie de tes ancêtres', 'Pour chaque génération, la zone qui tient l’essentiel de leurs naissances, mariages et décès. Mêmes distances que 🧭 Loin du berceau. Jamais un vivant ni une fiche confidentielle.',
            sel('group', 'Regrouper par', [['gen', 'Génération d’ancêtres'], ['century', 'Siècle (toute la base)'], ['person', 'Une vie (les étapes d’une personne)']])
            + personField('cq_root', 'Personne de départ')
            + sel('gens', 'Générations', [['8', '8'], ['6', '6'], ['10', '10'], ['14', '14'], ['4', '4']])
            + sel('ev', 'Événements', [['births,marriages,deaths', 'Naissances, mariages et décès'], ['births,marriages,deaths,residences', 'Avec les résidences et recensements'], ['births', 'Naissances (ou baptêmes)']])
            + sel('colors', 'Couleurs', [['', 'Du clair (anciens) au foncé (récents)'], ['side', 'Bleu / orange pour père / mère']])),
        bind: (box, io) => {
            pickerPut(box, 'cq_root', startId());
            bindGo(box, async () => {
                const r = await get({what: 'areas', group: val(box, 'group'), gens: val(box, 'gens'), ev: val(box, 'ev'), root: pickedId(box, 'cq_root') || startId()}); if (r.error) throw new Error(r.error);
                const s = fill(io.spec(), r, {colors: val(box, 'colors')}); if (!s.rows.length) throw new Error(i18n('Aucun événement avec un lieu pour ce choix.'));
                io.apply(s); const k = new Set(s.rows.map(x => (s.group === 'gen' ? x.gen : x.pid))).size; return `${pl(s.rows.length, 'événement')}, ${pl(k, s.group === 'gen' ? 'génération' : 'personne')}.`;
            });
        },
    };
    async function openFor(root, gens = 8) {
        try { const r = await get({what: 'areas', group: 'gen', gens, root}); if (r.error) throw new Error(r.error);
            const s = fill({kind: 'lifearea', o: {map: 'fr'}}, r); if (!s.rows.length) throw new Error(i18n('Aucun événement avec un lieu pour ce choix.'));
            ext.openDiagramEditor?.(null, {spec: s, name: s.o.title});
        } catch (e) { A()?.toast?.(e.message || String(e), 'error'); }
    }
    // 🧭 Loin du berceau et 💍 Rayon des mariages → onglet Relier → « ⭕ Voir sur la carte »
    const K = DR.KINDS, relate = () => [{label: '⭕ ' + i18n('Voir l’aire de vie sur la carte'), run: () => openFor(startId())}];
    ['vieberceau', 'famariages'].forEach(k => { if (K[k] && !K[k].relate) K[k].relate = relate; });

    const SP = {Tulle: [45.2694, 1.768], Naves: [45.3118, 1.7521], Seilhac: [45.3667, 1.7167], Chameyrat: [45.2471, 1.7043], Laguenne: [45.242, 1.781], Favars: [45.263, 1.670], Gimel: [45.297, 1.844], Brive: [45.159, 1.533], Paris: [48.857, 2.352], Lyon: [45.764, 4.836], Ussel: [45.548, 2.31], Uzerche: [45.424, 1.563]};
    const sp = n => `${n} ${SP[n][0]}, ${SP[n][1]}`;
    const sample = () => { const out = []; const plan = {6: [['Naves', 1765], ['Naves', 1770], ['Chameyrat', 1772], ['Favars', 1780], ['Naves', 1790], ['Gimel', 1795], ['Naves', 1800], ['Laguenne', 1805], ['Tulle', 1812], ['Naves', 1818]],
        4: [['Naves', 1825], ['Tulle', 1830], ['Seilhac', 1834], ['Tulle', 1840], ['Chameyrat', 1845], ['Laguenne', 1850], ['Uzerche', 1852], ['Gimel', 1858], ['Tulle', 1862], ['Brive', 1870], ['Naves', 1874]],
        2: [['Tulle', 1890], ['Brive', 1895], ['Tulle', 1900], ['Ussel', 1905], ['Uzerche', 1910], ['Tulle', 1919], ['Brive', 1925], ['Lyon', 1902], ['Paris', 1938], ['Tulle', 1950]]};
        Object.entries(plan).forEach(([g, l]) => l.forEach(([p, y], i) => out.push({label: sp(p), date: String(y), gen: g, side: i % 2, name: `MAZAUD ${g}-${i}`}))); return out; };
    P2.add('lifearea', {icon: '⭕', label: 'L’aire de vie, génération par génération', render: GC.remember(lifearea), noLegend: true, time,
        grids: [{key: 'rows', label: 'Les événements (un par ligne)', cols: [C('label', 'Lieu (« Tulle », « Tulle 45.27, 1.77 »)'), C('date', 'Date ou année', 'text', {ph: '1850'}), C('gen', 'Génération', 'number'), C('name', 'Personne')]}],
        options: [REC,
            C('share', 'Part des événements', 'select', {choices: [['', '80 %'], ['50', '50 % (le cœur)'], ['90', '90 %'], ['custom', 'À la main']]}),
            C('shareN', 'Part gardée', 'range', {min: 40, max: 100, def: 80, unit: '%', when: s => s.o?.share === 'custom'}),
            C('shape', 'Forme', 'select', {choices: [['', 'Cercle (facile à comparer)'], ['hull', 'Enveloppe (le contour au plus juste)'], ['both', 'Les deux']]}),
            C('groupBy', 'Regrouper par', 'select', {choices: [['gen', 'Génération d’ancêtres'], ['century', 'Siècle'], ['person', 'Personne (l’aire d’une vie)']]}),
            C('center', 'Centre', 'select', {choices: [['', 'Le milieu des événements'], ['root', 'Le lieu de naissance de la personne de départ'], ['oldest', 'Le berceau des plus anciens']]}),
            C('draw', 'Dessin', 'select', {choices: [['', 'Toutes les aires superposées'], ['small', '▦ Une par case'], ['play', 'Une à la fois avec ▶']]}),
            C('min', 'Minimum pour tracer une aire', 'select', {choices: [['', '5 événements'], ['3', '3'], ['10', '10']]}),
            C('colors', 'Couleurs', 'select', {choices: [['', 'Du clair (anciens) au foncé (récents)'], ['reverse', 'L’inverse'], ['side', 'Bleu / orange pour père / mère']]}),
            C('frameAll', 'Cadrage', 'select', {choices: [['', 'Sur les aires (un ancêtre parti au loin reste hors de l’aire)'], ['all', 'Cadrer sur tout']]}),
            C('table', 'Le tableau sous la carte', 'check', {def: true}), PLACE_LABELS, ...mapOpts, ...COMMON],
        sample: () => ({o: {title: i18n('L’aire de vie des ancêtres de {name}', {name: 'Jean MAZAUD'}), map: 'fr', groupBy: 'gen'}, group: 'gen', rows: sample()}),
        fromApp: areaApp, describe: spec => i18n('Aire de vie : {n}.', {n: pl(rows(spec).length, 'événement')})});
    ext.diagramCartesPlus2.lifearea = lifearea; ext.diagramCartesPlus2.openArea = openFor;
})();

/* ═════════ 🕸 Parrains, marraines et témoins sur la carte (maquette, partie 2) ═════════
 * Chaque lien du 🕸 Réseau de relations devient un trait entre deux villages : celui de l'acte (le baptême, le mariage) et celui
 * d'où vient le parrain ou le témoin (écrit dans l'acte, sinon sa résidence la plus proche de la date, sinon sa naissance).
 * Plus il y a de liens, plus le trait est épais ; les liens dans le même village font un anneau autour du point.
 * Données : op links de lib/cartes_plus2.php (rôle lu par dgn_witness_role, comme le Réseau ; vivants jamais comptés). */
(() => {
    'use strict';
    const P2 = window.LCNDA_EXT?.diagramCartesPlus2; if (!P2) return;
    const {T, esc, num, clamp, r1, r2, rows, str, C, pl, tip, opt, optN, curve, bases, frame, emptyMsg, missing, title, periodWord, keepDetail, placeNames, PLACE_LABELS,
        get, placesOf, keepUnplaced, pane, bindGo, sel, val, checks, startId, mapOpts, COMMON, REC, i18n, A, ext, GC, DR, color} = P2.H;
    const ROLE_COL = {parrain: '#1f6fd1', marraine: '#d6408f', 'témoin': '#2e8b57', 'déclarant': '#8a6a2f', voisin: '#6929c4', officier: '#5b6573', 'curé': '#5b6573'};
    const SIDE = ['#1f6fd1', '#e8890c'];
    const ROLESETS = {'': ['parrain', 'marraine'], witness: ['parrain', 'marraine', 'témoin'], nocler: null, all: null};
    const roleOk = (o, role) => { const set = opt(o, 'roles', ''); if (set === 'all') return true; if (set === 'nocler') return !['curé', 'officier'].includes(role); return (ROLESETS[set] || ROLESETS['']).includes(role); };
    /** d'où vient le témoin : ce qui est écrit dans l'acte, sa résidence de l'époque, sa naissance (selon le réglage) */
    const fromOf = (o, r) => { const how = opt(o, 'from', ''); if (how === 'note') return str(r.from_note); if (how === 'birth') return str(r.from_birth); return str(r.from_note) || str(r.from_resi) || str(r.from_birth); };
    const stepOf = spec => { const s = spec.o?.step; return s === '25' ? 25 : s === 'gen' ? 1 : 0; };
    const time = {
        range: spec => { const s = stepOf(spec); if (!s) return [NaN, NaN]; if (s === 1) { const gs = rows(spec).map(r => Number(r.gen)).filter(g => g > 0); return gs.length ? [Math.min(...gs), Math.max(...gs)] : [NaN, NaN]; }
            const ys = rows(spec).map(r => P2.H.yearOf(r.date)).filter(y => y !== null); return ys.length ? [Math.floor(Math.min(...ys) / s) * s, Math.floor(Math.max(...ys) / s) * s] : [NaN, NaN]; },
        at: (spec, y) => { spec.o = {...(spec.o || {}), __year: y, time: {...(spec.o?.time || {}), step: stepOf(spec) || 25}}; return spec; },
    };
    function kept(spec) {
        const o = spec.o || {}, s = stepOf(spec), y = Number.isFinite(o.__year) ? o.__year : null;
        const from = String(o.yfrom ?? '').trim() ? num(o.yfrom) : null, to = String(o.yto ?? '').trim() ? num(o.yto) : null;
        return rows(spec).filter(r => { if (!roleOk(o, r.role)) return false; const yy = P2.H.yearOf(r.date);
            if ((from !== null && (yy === null || yy < from)) || (to !== null && (yy === null || yy > to))) return false;
            if (y !== null && s === 1) return Number(r.gen) === Math.round(y); if (y !== null && s) return yy !== null && yy >= Math.floor(y / s) * s && yy < Math.floor(y / s) * s + s; return true; });
    }
    function linkmap(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const loc = new Map(), unknown = new Set(), at = label => { if (!label) return null; if (!loc.has(label)) loc.set(label, GC.placeOf(spec, label, B0.list)); const p = loc.get(label); if (!p && unknown.size < 30) unknown.add(label.slice(0, 40)); return p; };
        const list = kept(spec), pairs = new Map(); let noPlace = 0;
        list.forEach(r => { const a = at(str(r.label)), f = fromOf(o, r), b = at(f); if (!a || !b) { noPlace++; return; }
            const k = `${f}→${r.label}`; let x = pairs.get(k); if (!x) pairs.set(k, x = {a: b, b: a, from: f, to: str(r.label), rows: [], people: new Set()}); x.rows.push(r); x.people.add(r.wname || r.wid); });
        const weight = x => opt(o, 'weight', '') === 'people' ? x.people.size : x.rows.length;
        let P = [...pairs.values()].sort((a, b) => weight(b) - weight(a));
        const min = opt(o, 'minLinks', ''); if (min === 'top30') P = P.filter(x => x.from === x.to).concat(P.filter(x => x.from !== x.to).slice(0, 30)); else if (min) P = P.filter(x => weight(x) >= Number(min));
        const pts = P.flatMap(x => [[x.a[0], x.a[1]], [x.b[0], x.b[1]]]);
        const F = frame(spec, W, fs, pts.length ? pts : [...loc.values()].filter(Boolean).map(p => [p[0], p[1]])); if (F.wait) return F.wait;
        const {pr, w, h} = F, id = 'cql' + Math.random().toString(36).slice(2, 8), maxW = Math.max(1, ...P.map(weight)), wmax = clamp(w / 90, 3, 12) * clamp(num(o.lineW) || 1, .3, 3);
        const colOf = x => { const c = opt(o, 'color', ''); if (c === 'role') { const r = x.rows[0].role; return ROLE_COL[r] || '#555'; } if (c === 'side') { const s = Number(x.rows[0].side); return SIDE[s] || '#8a8f99'; } return color(o.lineColor, '#1f4e79'); };
        let defs = ''; if (opt(o, 'arrow', '') === 'arrow') defs = `<defs><marker id="${id}m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="context-stroke"/></marker></defs>`;
        let svg = `<g data-c2-total="${list.length}"></g>` + F.open + defs + `<g data-cq-d="${id}">`;
        const same = opt(o, 'same', '');
        P.forEach((x, i) => {
            const [x1, y1] = pr.p(x.a[0], x.a[1]), [x2, y2] = pr.p(x.b[0], x.b[1]); if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;
            const wd = Math.max(1, wmax * Math.sqrt(weight(x) / maxW)), col = colOf(x), lab = `${x.from} → ${x.to} : ${pl(x.rows.length, 'lien')}${x.people.size !== x.rows.length ? ` (${pl(x.people.size, 'personne')})` : ''}`;
            if (x.from === x.to) { if (same === 'hide') return; // les liens dans le même village
                svg += `<g class="cq-link" data-cq-i="${i}" tabindex="0" role="button" aria-label="${esc(lab)}">${tip(lab + '\n' + i18n('Clic : les liens derrière ce trait'))}${same === 'number' ? T(x1, y1 - wd - 6, String(weight(x)), {size: fs * .85, anchor: 'middle', weight: 800, fill: col, halo: '#ffffffcc'}) : `<circle cx="${r1(x1)}" cy="${r1(y1)}" r="${r2(6 + wd * 1.2)}" fill="none" stroke="${col}" stroke-width="${r2(wd)}" stroke-opacity=".75"/>`}</g>`; return; }
            svg += `<g class="cq-link" data-cq-i="${i}" tabindex="0" role="button" aria-label="${esc(lab)}">${tip(lab + '\n' + i18n('Clic : les liens derrière ce trait'))}<path d="${curve(x1, y1, x2, y2)}" fill="none" stroke="${col}" stroke-width="${r2(wd)}" stroke-opacity=".78" stroke-linecap="round"${x.rows.length === 1 ? ' stroke-dasharray="5 4"' : ''}${defs ? ` marker-end="url(#${id}m)"` : ''}/><path d="${curve(x1, y1, x2, y2)}" fill="none" stroke="transparent" stroke-width="${r2(wd + 8)}"/></g>`;
        });
        svg += '</g>';
        const villages = new Map(); P.forEach(x => { [[x.from, x.a], [x.to, x.b]].forEach(([n, p]) => villages.set(n, p)); });
        villages.forEach((p, n) => { const [x, y] = pr.p(p[0], p[1]); if (Number.isFinite(x)) svg += `<circle cx="${r1(x)}" cy="${r1(y)}" r="3.4" fill="#111" stroke="#fff" stroke-width="1">${tip(n)}</circle>`; });
        svg += placeNames(spec, F, [...villages].map(([n, p]) => ({lon: p[0], lat: p[1], place: n})), fs);
        const st = stepOf(spec), word = Number.isFinite(o.__year) && st ? (st === 1 ? i18n('Génération {g}', {g: String(Math.round(o.__year))}) : periodWord(Math.floor(o.__year / st) * st, st)) : '';
        if (word) svg += title(word, fs);
        svg += F.close;
        let H = h;
        // la phrase sous la carte : la part du village même, et d'où viennent les autres (calculé sur les liens dont le village est connu)
        if (o.summary !== false && P.length) {
            const byTo = new Map(); P.forEach(x => { const t = byTo.get(x.to) || {same: 0, total: 0, others: new Map()}; t.total += x.rows.length; if (x.from === x.to) t.same += x.rows.length; else t.others.set(x.from, (t.others.get(x.from) || 0) + x.rows.length); byTo.set(x.to, t); });
            const [top, t] = [...byTo].sort((a, b) => b[1].total - a[1].total)[0];
            const others = [...t.others].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, k]) => `${n} (${k})`).join(', ');
            const line1 = i18n('{place} : {p} % des liens sont du village même ; les autres viennent surtout de {others}.', {place: top, p: String(Math.round(t.same / t.total * 100)), others: others || '—'});
            const line2 = i18n('Calculé sur {a} dont le village est connu ; {b} sans lieu ne sont pas dessinés.', {a: pl(list.length - noPlace, 'lien'), b: pl(noPlace, 'lien')});
            svg += T(0, H + fs * .9, line1, {size: fs * .82}) + T(0, H + fs * 2.1, line2, {size: fs * .75, fill: '#666'}); H += fs * 2.8;
        }
        if (unknown.size && o.showMissing !== false) { svg += missing([...unknown], H, fs, spec); H += fs * 1.5; }
        if (!rows(spec).length) svg += emptyMsg(w, h, fs, 'Prends les parrains, marraines et témoins de ta généalogie (« Depuis l’app »).');
        else if (!P.length) svg += emptyMsg(w, h, fs, 'Aucun lien pour ce choix (rôles, période, lieux).');
        keepDetail(id, i => detail(spec, P[i]));
        const legend = opt(o, 'color', '') === 'role' ? [...new Set(list.map(r => r.role))].filter(r => ROLE_COL[r]).map(r => ({label: i18n(r[0].toUpperCase() + r.slice(1)), color: ROLE_COL[r]})) : opt(o, 'color', '') === 'side' ? [{label: i18n('Côté père'), color: SIDE[0]}, {label: i18n('Côté mère'), color: SIDE[1]}] : [];
        return {h: H, svg, legend, geo: F.geo, desc: i18n('Parrains et témoins : {a} entre {b}.', {a: pl(list.length - noPlace, 'lien'), b: pl(villages.size, 'lieu', 'lieux')})};
    }
    const EV = {CHR: 'bapt.', BAPM: 'bapt.', BIRT: 'naiss.', MARR: 'mar.', DEAT: 'déc.', BURI: 'inh.'};
    function detail(spec, x) {
        if (!x || !ext.openDialog) return;
        const line = r => `<tr><td>${esc(i18n(EV[r.tag] || 'acte'))} ${esc(r.date || '')}, ${esc(r.label)}</td><td>${Number(r.pid) ? `<button type="button" class="link-button" data-cq-person="${Number(r.pid)}">${esc(r.pname || '')}</button>` : esc(r.pname || '')}${r.pname2 ? ' · ' + esc(r.pname2) : ''}</td><td>${Number(r.wid) ? `<button type="button" class="link-button" data-cq-person="${Number(r.wid)}">${esc(r.wname || '')}</button>` : esc(r.wname || '')}${x.from !== x.to ? `, ${esc(i18n('de {place}', {place: x.from}))}` : ''}</td><td>${esc(i18n(r.role))}</td></tr>`;
        const sorted = [...x.rows].sort((a, b) => (P2.H.yearOf(a.date) ?? 0) - (P2.H.yearOf(b.date) ?? 0));
        const body = `<div class="cq-detail"><div class="cq-scroll"><table><thead><tr><th>${esc(i18n('Acte'))}</th><th>${esc(i18n('Filleul ou époux'))}</th><th>${esc(i18n('Parrain, marraine, témoin'))}</th><th>${esc(i18n('Rôle'))}</th></tr></thead><tbody>${sorted.slice(0, 80).map(line).join('')}</tbody></table></div>
            ${sorted.length > 80 ? `<p class="muted">+ ${esc(i18n('{n} autres · triés par date', {n: String(sorted.length - 80)}))}</p>` : ''}
            ${ext.openDiagramEditor && DR.KINDS.network ? `<p><button type="button" class="button small secondary" data-cq-net>🕸 ${esc(i18n('Ouvrir dans le Réseau'))}</button></p>` : ''}</div>`;
        const dlg = ext.openDialog({eyebrow: i18n('PARRAINS ET TÉMOINS'), title: x.from === x.to ? x.to : `${x.from} ↔ ${x.to}`, body, submitLabel: i18n('Fermer'), onSubmit: () => true});
        dlg?.querySelector?.('[data-cq-net]')?.addEventListener('click', () => { dlg.close(); openNetwork(x.rows); });
    }
    /** « 🕸 Ouvrir dans le Réseau » : les mêmes liens, sans géographie */
    function openNetwork(list) {
        const agg = new Map(); list.forEach(r => { const k = `${r.wname}|${r.pname}|${r.role}`; agg.set(k, (agg.get(k) || 0) + 1); });
        const links = [...agg].map(([k, n]) => { const [a, b, kind] = k.split('|'); return {a, b, kind, weight: n}; });
        ext.openDiagramEditor(null, {spec: {kind: 'network', o: {title: i18n('Parrains, marraines et témoins')}, rows: links, nodes: [...new Set(links.flatMap(l => [l.a, l.b]))].map(name => ({name}))}});
    }

    /* ─── Depuis l'app ─── */
    const ROLES = [['parrain', 'Parrain'], ['marraine', 'Marraine'], ['témoin', 'Témoin'], ['déclarant', 'Déclarant'], ['voisin', 'Voisin'], ['curé', 'Curé, officier']];
    function fill(s, r, extra = {}) {
        const names = placesOf(s, r.places || {}), nm = id => (id ? names.get(id) || '' : '');
        s.rows = (r.rows || []).filter(e => names.has(e[0])).map(([act, fn, fr, fb, role, y, wid, pid, pid2, tag, side, gen]) => ({label: nm(act), from_note: nm(fn), from_resi: nm(fr), from_birth: nm(fb), role: role === 'officier' ? 'officier' : role, date: y === null ? '' : String(y), wid, wname: r.people?.[wid] || '', pid, pname: r.people?.[pid] || '', pname2: pid2 ? r.people?.[pid2] || '' : '', tag, side, gen: gen || ''}));
        keepUnplaced(s, r.unplaced); s.o = {...(s.o || {}), ...extra}; return s;
    }
    const linkApp = {
        html: () => pane('🕸 Parrains, marraines et témoins', 'Les liens du 🕸 Réseau de relations, sur la carte : le village de l’acte et celui d’où vient le témoin. Les témoins vivants ne sont jamais comptés.',
            `<fieldset><legend>${esc(i18n('Rôles'))}</legend><div class="cq-checks">${ROLES.map(([k, l], i) => `<label class="checkbox-line"><input type="checkbox" data-cq="roles" value="${esc(k)}"${i < 2 ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}</div></fieldset>`
            + `<label>${esc(i18n('De l’année'))}<input data-cq="yfrom" inputmode="numeric" maxlength="4"></label><label>${esc(i18n('À l’année'))}<input data-cq="yto" inputmode="numeric" maxlength="4"></label>`
            + sel('pop', 'Branche', [['all', 'Toute ma base'], ['anc', 'Mes ancêtres'], ['pat', 'Ma branche paternelle (côté père)'], ['mat', 'Ma branche maternelle (côté mère)'], ['name', 'Un nom de famille']])
            + `<label data-cq-onlyname>${esc(i18n('Nom de famille'))}<input data-cq="name" maxlength="80"></label>`),
        bind: (box, io) => {
            const sync = () => { box.querySelector('[data-cq-onlyname]').hidden = val(box, 'pop') !== 'name'; }; sync(); box.addEventListener('change', sync);
            bindGo(box, async () => {
                const r = await get({what: 'links', pop: val(box, 'pop'), name: val(box, 'name'), root: startId()}); if (r.error) throw new Error(r.error);
                const set = checks(box, 'roles'), want = new Set(set.flatMap(k => (k === 'curé' ? ['curé', 'officier'] : [k])));
                const roles = want.size === 2 && want.has('parrain') && want.has('marraine') ? '' : [...want].every(k => ['parrain', 'marraine', 'témoin'].includes(k)) && want.size === 3 ? 'witness' : want.has('curé') ? 'all' : 'nocler';
                const s = fill(io.spec(), r, {roles, yfrom: val(box, 'yfrom'), yto: val(box, 'yto'), title: roles === '' ? i18n('Parrains et marraines') : i18n('Parrains, marraines et témoins')});
                s.rows = s.rows.filter(x => roles !== 'nocler' || want.has(x.role) || (want.has('curé') && x.role === 'officier'));
                if (!s.rows.length) throw new Error(i18n('Aucun lien avec un lieu pour ce choix.'));
                io.apply(s); return pl(s.rows.length, 'lien');
            });
        },
    };
    // 🕸 Réseau de relations → onglet Relier → « 🗺 Voir sur la carte »
    async function openAll() {
        try { const r = await get({what: 'links', root: startId()}); const s = fill({kind: 'linkmap', o: {map: 'fr', roles: 'all'}}, r, {title: i18n('Parrains, marraines et témoins')});
            if (!s.rows.length) throw new Error(i18n('Aucun lien avec un lieu pour ce choix.')); ext.openDiagramEditor?.(null, {spec: s, name: s.o.title}); } catch (e) { A()?.toast?.(e.message || String(e), 'error'); }
    }
    if (DR.KINDS.network && !DR.KINDS.network.relate) DR.KINDS.network.relate = () => [{label: '🗺 ' + i18n('Voir sur la carte'), run: openAll}];

    const SP = {Tulle: [45.2694, 1.768], Naves: [45.3118, 1.7521], Seilhac: [45.3667, 1.7167], Chameyrat: [45.2471, 1.7043], Laguenne: [45.242, 1.781], Favars: [45.263, 1.670], Gimel: [45.297, 1.844]};
    const sp = n => `${n} ${SP[n][0]}, ${SP[n][1]}`;
    const sample = () => { const out = []; const plan = [['Naves', 'Naves', 'parrain', 9], ['Naves', 'Tulle', 'parrain', 5], ['Naves', 'Tulle', 'marraine', 4], ['Naves', 'Seilhac', 'marraine', 3], ['Tulle', 'Naves', 'parrain', 2], ['Tulle', 'Tulle', 'marraine', 4],
        ['Seilhac', 'Gimel', 'parrain', 1], ['Chameyrat', 'Favars', 'témoin', 2], ['Laguenne', 'Tulle', 'parrain', 1]];
        plan.forEach(([to, from, role, n], i) => { for (let k = 0; k < n; k++) out.push({label: sp(to), from_note: sp(from), role, date: String(1760 + (i * 13 + k * 7) % 90), wname: `DURAND ${i}-${k}`, pname: `MAZAUD ${i}-${k}`, tag: 'CHR'}); }); return out; };
    P2.add('linkmap', {icon: '🕸', label: 'Parrains, marraines et témoins sur la carte', render: GC.remember(linkmap), legend: 'bottom', time,
        grids: [{key: 'rows', label: 'Les liens (un par ligne)', cols: [C('label', 'Lieu de l’acte'), C('from_note', 'D’où vient le témoin'), C('role', 'Rôle'), C('date', 'Date ou année', 'text', {ph: '1790'}), C('wname', 'Parrain, marraine, témoin'), C('pname', 'Filleul ou époux')]}],
        options: [REC,
            C('from', 'D’où vient le parrain', 'select', {choices: [['', 'Ce qui est écrit dans l’acte, sinon sa résidence à la date, sinon sa naissance'], ['note', 'Seulement ce qui est écrit dans l’acte'], ['birth', 'Seulement sa naissance']]}),
            C('weight', 'Épaisseur', 'select', {choices: [['', 'Nombre de liens'], ['people', 'Nombre de personnes différentes']]}),
            C('same', 'Liens dans le même village', 'select', {choices: [['', 'Anneau autour du point'], ['hide', 'Cachés'], ['number', 'Un chiffre seulement']]}),
            C('roles', 'Rôles montrés', 'select', {choices: [['', 'Parrain, marraine'], ['witness', 'Parrain, marraine, témoin'], ['nocler', 'Tous sauf curé et officier'], ['all', 'Tous']]}),
            C('minLinks', 'Traits montrés', 'select', {choices: [['', 'À partir de 1 lien'], ['2', 'À partir de 2'], ['3', 'À partir de 3'], ['top30', 'Les 30 plus forts seulement']]}),
            C('color', 'Couleur des traits', 'select', {choices: [['', 'Une seule'], ['role', 'Par rôle'], ['side', 'Par branche (bleu père, orange mère)']]}),
            C('lineColor', 'Couleur', 'color', {def: '#1f4e79', when: s => !s.o?.color}),
            C('arrow', 'Sens', 'select', {choices: [['', 'Sans flèche'], ['arrow', 'Flèche du village du parrain vers celui de l’acte']]}),
            C('step', 'Curseur ▶', 'select', {choices: [['', 'Sans'], ['25', 'Par 25 ans'], ['gen', 'Par génération']]}),
            C('yfrom', 'De l’année', 'number', {min: 1000, max: 2100}), C('yto', 'À l’année', 'number', {min: 1000, max: 2100}),
            C('lineW', 'Épaisseur des traits', 'range', {min: .3, max: 3, step: .1, def: 1}), C('summary', 'La phrase sous la carte', 'check', {def: true}), PLACE_LABELS, ...mapOpts, ...COMMON],
        sample: () => ({o: {title: i18n('Parrains et marraines'), map: 'fr'}, rows: sample()}),
        fromApp: linkApp, describe: spec => i18n('Parrains et témoins : {n}.', {n: pl(rows(spec).length, 'lien')})});
    ext.diagramCartesPlus2.linkmap = linkmap; ext.diagramCartesPlus2.openLinks = openAll;
})();

/* ═════════ ⚰️ Crises et épidémies (maquette, partie 3) ═════════
 * Les communes et les années où les décès de la famille montent d'un coup par rapport à l'habitude de cette commune : même règle
 * par défaut que la liste 🌡️ « Années de forte mortalité de la famille » (au moins 3 décès, 2,5 fois la moyenne des 5 ans avant et
 * après), mais commune par commune, les petits villages regroupés avec leurs voisines. À côté de chaque année repérée, ce qui se
 * passait à la même époque dans la région (🌍 Le monde autour) : un repère à vérifier, jamais une cause affirmée.
 * À l'export : des nombres et des lieux, jamais les noms des morts (le détail reste à l'écran). Données : op crises. */
(() => {
    'use strict';
    const P2 = window.LCNDA_EXT?.diagramCartesPlus2; if (!P2) return;
    const {T, esc, num, clamp, r1, r2, fold, rows, str, C, pl, tip, opt, optN, median, bases, frame, locate, missing, emptyMsg, title, periodWord, keepDetail, placeNames, PLACE_LABELS,
        get, placesOf, keepUnplaced, pane, bindGo, sel, val, startId, mapOpts, COMMON, REC, i18n, A, ext, GC} = P2.H;
    const INT = [[2.5, 3, '#f2b766', '×2,5 à 3'], [3, 5, '#e0782f', '×3 à 5'], [5, Infinity, '#a8420f', 'plus de ×5']];
    const intCol = x => (INT.find(([a, b]) => x >= a && x < b) || INT[0])[2];
    const minN = o => { const v = opt(o, 'minDeaths', ''); return v === 'custom' ? optN(o, 'minN', 3, 1, 50) : Number(v || 3); };
    const ratio = o => { const v = opt(o, 'ratio', ''); return v === 'custom' ? optN(o, 'ratioN', 2.5, 1.2, 20) : Number(v || 2.5); };
    const kidsAge = o => optN(o, 'kidsAge', 10, 1, 18);
    /** la crise couvre-t-elle la commune ? (même lecture que crisis_in_scope : France, n° de département, région ou département écrits) */
    function covers(c, r) {
        const sc = String(c.scope || '').trim(), f = fold(sc), country = fold(r.country || '');
        if (f === 'monde' || f === 'europe') return true;
        if (f === 'france' || f === '') return !c.own ? ['france', ''].includes(country) : fold(c.place || '') === fold(r.label.replace(/\s*\(.*$/, ''));
        return sc.split(',').some(part => { const p = part.trim(); if (!p) return false; if (/^(\d{2}|2[AB]|97\d)$/i.test(p)) return String(r.zone || '').toUpperCase() === p.toUpperCase();
            const k = fold(p); return k && [r.county, r.state, r.label].some(t => fold(t || '').includes(k)); });
    }
    const refsFor = (spec, r, y) => { const how = opt(spec.o || {}, 'refs', ''); if (how === 'none') return []; return (spec.crises || []).filter(c => y >= c.from && y <= c.to && (how === 'all' || covers(c, r))).slice(0, 3); };
    /** les unités : la commune, les petites regroupées avec leurs voisines, ou le département */
    function units(spec, pts) {
        const o = spec.o || {}, scale = opt(o, 'scale', ''), byPlace = new Map();
        pts.forEach(p => { const k = scale === 'dept' ? str(p.r.zone) || p.place : p.place; let u = byPlace.get(k); if (!u) byPlace.set(k, u = {key: k, label: scale === 'dept' ? (p.r.county || k) : p.place, pts: [], insee: str(p.r.insee)}); u.pts.push(p); });
        if (scale !== '') return [...byPlace.values()];
        // les petits villages (moins de N décès sur toute la période) : regroupés avec leurs voisines (union-find par les communes voisines)
        const small = optN(o, 'smallN', 10, 2, 100), list = [...byPlace.values()], byInsee = new Map(list.filter(u => u.insee).map(u => [u.insee, u]));
        const parent = new Map(list.map(u => [u.key, u.key])), find = k => { while (parent.get(k) !== k) k = parent.get(k); return k; };
        const nb = spec.neighbors || {};
        list.forEach(u => { if (u.pts.length >= small || !u.insee) return; (nb[u.insee] || []).forEach(v => { const w = byInsee.get(v); if (w && w.pts.length < small) parent.set(find(u.key), find(w.key)); }); });
        const groups = new Map(); list.forEach(u => { const g = find(u.key); groups.set(g, [...(groups.get(g) || []), u]); });
        return [...groups.values()].map(us => { us.sort((a, b) => b.pts.length - a.pts.length); const head = us[0];
            return {key: us.map(u => u.key).join('+'), label: us.length > 1 ? i18n('{name} + {n} voisines', {name: head.label, n: String(us.length - 1)}) : head.label, pts: us.flatMap(u => u.pts), insee: head.insee, members: us.length}; });
    }
    /** les années « à voir » d'une unité : au moins N décès et R fois l'habitude (moyenne ou médiane de la fenêtre, sans l'année elle-même) */
    function spikes(spec, u, filter) {
        const o = spec.o || {}, w = opt(o, 'window', ''), med = opt(o, 'stat', '') === 'median', by = new Map();
        u.pts.filter(filter).forEach(p => { if (p.y !== null) by.set(p.y, [...(by.get(p.y) || []), p]); });
        const out = [];
        by.forEach((list, y) => { const n = list.length; if (n < minN(o)) return;
            const ys = w === 'before' ? Array.from({length: 10}, (_, i) => y - 10 + i) : Array.from({length: w === '10' ? 20 : 10}, (_, i) => { const k = w === '10' ? 10 : 5; return i < k ? y - k + i : y + i - k + 1; });
            const counts = ys.map(k => (by.get(k) || []).length), usual = med ? median(counts) : counts.reduce((a, b) => a + b, 0) / counts.length, x = n / Math.max(.5, usual);
            if (x >= ratio(o)) out.push({u, y, n, usual, x, list}); });
        return out;
    }
    function all(spec, pts) {
        const o = spec.o || {}, kids = opt(o, 'kids', ''), ka = kidsAge(o), isKid = p => Number.isFinite(Number(p.r.age)) && String(p.r.age) !== '' && Number(p.r.age) < ka;
        const U = units(spec, pts);
        return U.flatMap(u => kids === 'apart' ? [...spikes(spec, u, p => !isKid(p)), ...spikes(spec, u, isKid).map(s => ({...s, kids: true}))] : spikes(spec, u, p => kids !== 'out' || !isKid(p))).sort((a, b) => a.y - b.y || b.x - a.x);
    }
    const stepOf = spec => { const s = opt(spec.o || {}, 'step', ''); return s === '5' ? 5 : s === '10' ? 10 : 1; };
    const time = {
        range: spec => { const ys = rows(spec).map(r => P2.H.yearOf(r.date)).filter(y => y !== null), s = stepOf(spec); return ys.length ? [Math.floor(Math.min(...ys) / s) * s, Math.floor(Math.max(...ys) / s) * s] : [NaN, NaN]; },
        at: (spec, y) => { spec.o = {...(spec.o || {}), __year: y, time: {...(spec.o?.time || {}), step: stepOf(spec)}}; return spec; },
    };
    function crisismap(spec, W, fs) {
        const o = spec.o || {}, B0 = bases(spec, W); if (B0.wait) return B0.wait;
        const loc = locate(spec, B0.list), S0 = all(spec, loc.pts), st = stepOf(spec), y = Number.isFinite(o.__year) ? Math.floor(o.__year / st) * st : null;
        const S = y === null ? S0 : S0.filter(s => s.y >= y && s.y < y + st);
        const F = frame(spec, W, fs, loc.pts.map(p => [p.lon, p.lat])); if (F.wait) return F.wait;
        const {pr, w, h} = F, id = 'cqc' + Math.random().toString(36).slice(2, 8), maxN = Math.max(1, ...S.map(s => s.n)), R0 = clamp(w / 40, 5, 22);
        let svg = `<g data-c2-total="${S.length}"></g>` + F.open + `<g data-cq-d="${id}">`;
        // sans curseur : le plus fort de chaque unité ; avec le curseur : les années de cette image
        const shown = y === null ? [...new Map([...S].sort((a, b) => a.x - b.x).map(s => [s.u.key + (s.kids ? '|k' : ''), s])).values()] : S;
        shown.sort((a, b) => b.n - a.n).forEach(s => {
            const lon = median(s.u.pts.map(p => p.lon)), lat = median(s.u.pts.map(p => p.lat)), [cx, cy] = pr.p(lon, lat); if (!Number.isFinite(cx)) return;
            const rr = Math.max(4, R0 * Math.sqrt(s.n / maxN)), i = S0.indexOf(s), lab = `${s.u.label} · ${s.y} · ${pl(s.n, 'décès')} (${i18n('d’habitude {u} par an', {u: new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}).format(s.usual)})}, ×${new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}).format(s.x)})${s.kids ? ' · ' + i18n('enfants') : ''}`;
            svg += `<g class="cq-pt" data-cq-i="${i}" tabindex="0" role="button" aria-label="${esc(lab)}">${tip(lab + '\n' + i18n('Clic : les personnes, et ce qui se passait à la même époque'))}<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r2(rr)}" fill="${intCol(s.x)}" fill-opacity=".85" stroke="#111" stroke-width="1"${s.kids ? ' stroke-dasharray="3 2"' : ''}/>${o.yearLabels !== false ? T(cx + rr + 3, cy, `${s.u.label} ${s.y}`, {size: clamp(fs * .7, 7, 13), weight: 700, fill: '#1d1d1f', halo: 'rgba(255,255,255,.85)'}) : ''}</g>`;
        });
        svg += '</g>';
        if (y !== null) svg += title(periodWord(y, st), fs);
        svg += F.close;
        let H = h;
        const total = loc.pts.length;
        if (total && total < optN(o, 'minTotal', 20, 1, 1000)) svg += emptyMsg(w, h, fs, 'Pas assez de décès placés pour repérer des crises.');
        // le tableau des années à voir, puis la mise en garde (toujours) : des nombres, jamais les noms des morts
        if (S.length && o.table !== false) {
            const cw = [.22, .08, .08, .17, .45].map(x => x * W), fmt1 = v => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}).format(v);
            const line = (cells, yy, bold) => { let x = 0; return cells.map((c, k) => { const t = T(x, yy, c, {size: fs * .76, weight: bold ? 800 : 400, fill: bold ? '#555' : '#222'}); x += cw[k]; return t; }).join(''); };
            H += fs * .8; svg += T(0, H + fs * .5, i18n('Les années à voir · {n}', {n: String(S.length)}), {size: fs, weight: 800}); H += fs * 1.4;
            svg += line([i18n('Commune'), i18n('Année'), i18n('Décès'), i18n('Habitude'), '🌍 ' + i18n('À la même époque (repère)')], H + fs * .5, true); H += fs * 1.3;
            S.slice(0, clamp(Math.round(num(o.tableMax) || 8), 1, 40)).forEach(s => { const r0 = s.list[0]?.r || {}, refs = refsFor(spec, {...r0, label: s.u.label}, s.y);
                svg += line([s.u.label + (s.kids ? ` (${i18n('enfants')})` : ''), String(s.y), String(s.n), `${fmt1(s.usual)} · ×${fmt1(s.x)}`, refs.length ? refs.map(c => c.title).join(' ; ') : i18n('rien de connu dans cette région à cette date')], H + fs * .5, false); H += fs * 1.15; });
            if (S.length > (num(o.tableMax) || 8)) { svg += T(0, H + fs * .5, i18n('+ {n} autres', {n: String(S.length - (num(o.tableMax) || 8))}), {size: fs * .75, fill: '#666'}); H += fs * 1.15; }
        }
        if (total) { const care = i18n('À lire avec prudence : l’app compare des nombres de décès, elle ne sait pas pourquoi ils montent. Le repère est ce qui se passait à la même époque : une piste à vérifier dans les actes (cause notée, âge, mois). Sur de petits nombres, le hasard suffit parfois.');
            const words = care.split(' '), lines = []; let cur = ''; const maxC = Math.max(30, Math.floor(W / (fs * .42))); words.forEach(wd => { if ((cur + ' ' + wd).length > maxC) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; }); if (cur) lines.push(cur);
            H += fs * .6; lines.forEach(l => { svg += T(0, H + fs * .5, l, {size: fs * .74, fill: '#7a5d00'}); H += fs * 1.05; }); }
        const out = Number(spec.o?.__noPlace || 0) + Number(spec.o?.__noYear || 0);
        if (out && o.showMissing !== false) { svg += T(0, H + fs * .7, i18n('Décès sans année ou sans lieu, comptés à part : {n}', {n: String(out)}), {size: fs * .74, fill: '#a5552a'}); H += fs * 1.3; }
        if (loc.unknown.length && o.showMissing !== false) { svg += missing(loc.unknown, H, fs, spec); H += fs * 1.5; }
        if (!total) svg += emptyMsg(w, h, fs, 'Prends les décès de ta généalogie (« Depuis l’app »).');
        keepDetail(id, i => detail(spec, S0[i]));
        return {h: H, svg, legend: INT.map(([, , c, l]) => ({label: l, color: c})), geo: F.geo, desc: i18n('Les années de crise : {n}, sur {d}.', {n: pl(S.length, 'année à voir', 'années à voir'), d: pl(total, 'décès')})};
    }
    function detail(spec, s) {
        if (!s || !ext.openDialog) return;
        const refs = refsFor(spec, {...(s.list[0]?.r || {}), label: s.u.label}, s.y), fmt1 = v => new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 1}).format(v);
        const body = `<div class="cq-detail"><p><b>${esc(s.u.label)} · ${s.y} · ${esc(pl(s.n, 'décès'))}</b> (${esc(i18n('d’habitude {u} par an', {u: fmt1(s.usual)}))})</p>
            <ul>${s.list.slice(0, 40).map(p => `<li>✝ ${Number(p.pid) ? `<button type="button" class="link-button" data-cq-person="${Number(p.pid)}">${esc(p.r.name || '')}</button>` : esc(p.r.name || '')} — ${esc(p.r.dtext || p.r.date || '')}${p.r.age !== '' && p.r.age != null ? ` · ${esc(pl(Number(p.r.age), 'an', 'ans'))}` : ''}${p.r.cause ? ` · ${esc(i18n('cause notée : « {c} »', {c: p.r.cause}))}` : ''}</li>`).join('')}</ul>
            <p class="cq-careful">🌍 ${refs.length ? esc(i18n('À la même époque : {what} — un repère, pas une explication.', {what: refs.map(c => `${c.title} (${c.from === c.to ? c.from : c.from + '–' + c.to})`).join(' ; ')})) : esc(i18n('Rien de connu dans cette région à cette date.'))}</p></div>`;
        ext.openDialog({eyebrow: i18n('LES ANNÉES DE CRISE'), title: `${s.u.label} · ${s.y}`, body, submitLabel: i18n('Fermer'), onSubmit: () => true});
    }

    /* ─── Depuis l'app ─── */
    function fill(s, r, extra = {}) {
        const names = placesOf(s, r.places || {});
        s.rows = (r.deaths || []).filter(d => names.has(d[1])).map(([pid, plc, y, dtext, age, cause]) => { const inf = r.info?.[plc] || {};
            return {label: names.get(plc), date: String(y), dtext, age: age === null ? '' : age, cause, name: r.people?.[pid] || '', pid, zone: (r.places[plc] || [])[1] || '', insee: inf.insee || '', county: inf.county || '', state: inf.state || '', country: inf.country || ''}; });
        s.neighbors = r.neighbors || {}; s.crises = (r.crises || []).slice(0, 2000); keepUnplaced(s, r.unplaced);
        s.o = {...(s.o || {}), __noPlace: r.no_place || 0, __noYear: r.no_year || 0, title: i18n('Les années de crise de la famille'), ...extra};
        return s;
    }
    const crisisApp = {
        html: () => pane('⚰️ Les décès de ta généalogie', 'Les décès placés et datés (le décès, sinon l’inhumation ; chaque personne une seule fois), et les crises du 🌍 Monde autour avec tes événements locaux. Jamais un vivant ni une fiche confidentielle.',
            sel('pop', 'Qui', [['all', 'Toute ma base'], ['anc', 'Mes ancêtres et leurs familles'], ['pat', 'Ma branche paternelle (côté père)'], ['mat', 'Ma branche maternelle (côté mère)'], ['name', 'Un nom de famille']])
            + `<label data-cq-onlyname>${esc(i18n('Nom de famille'))}<input data-cq="name" maxlength="80"></label>`
            + sel('kids', 'Enfants', [['', 'Comptés avec tout le monde'], ['apart', 'À part (moins de 10 ans)'], ['out', 'Pas comptés']])
            + sel('period', 'Période', [['', 'Toutes les époques'], ['1700', 'Le XVIIIe siècle'], ['1800', 'Le XIXe siècle']])),
        bind: (box, io) => {
            const sync = () => { box.querySelector('[data-cq-onlyname]').hidden = val(box, 'pop') !== 'name'; }; sync(); box.addEventListener('change', sync);
            bindGo(box, async () => {
                const r = await get({what: 'crises', pop: val(box, 'pop'), name: val(box, 'name'), root: startId()}); if (r.error) throw new Error(r.error);
                const per = val(box, 'period'); if (per) r.deaths = (r.deaths || []).filter(d => d[2] >= Number(per) - 10 && d[2] <= Number(per) + 109); // la fenêtre de l'habitude déborde un peu
                const s = fill(io.spec(), r, {kids: val(box, 'kids'), time: {...(io.spec().o?.time || {}), show: true, step: 1}});
                if (!s.rows.length) throw new Error(i18n('Aucun décès daté avec un lieu pour ce choix.'));
                io.apply(s); return pl(s.rows.length, 'décès');
            });
        },
    };
    async function openCrises() {
        try { const r = await get({what: 'crises', root: startId()}); const s = fill({kind: 'crisismap', o: {map: 'fr', time: {show: true, step: 1}}}, r);
            if (!s.rows.length) throw new Error(i18n('Aucun décès daté avec un lieu pour ce choix.')); ext.openDiagramEditor?.(null, {spec: s, name: s.o.title}); } catch (e) { A()?.toast?.(e.message || String(e), 'error'); }
    }
    // Listes → Histoire → 🌡️ Épidémies, guerres, hivers terribles → « 🗺 Sur la carte » ; 📉 Naissances, décès et crises → Relier
    if (typeof document !== 'undefined') document.addEventListener('click', e => { if (e.target.closest?.('[data-cq-crisis-open]')) { e.preventDefault(); openCrises(); } });
    if (P2.H.DR.KINDS.crises && !P2.H.DR.KINDS.crises.relate) P2.H.DR.KINDS.crises.relate = () => [{label: '⚰️ ' + i18n('Les années de crise sur la carte'), run: openCrises}];

    const SP = {Tulle: [45.2694, 1.768], Naves: [45.3118, 1.7521], Seilhac: [45.3667, 1.7167], Meymac: [45.5361, 2.1464], Ussel: [45.548, 2.31], Gimel: [45.297, 1.844]};
    const sp = n => `${n} ${SP[n][0]}, ${SP[n][1]}`;
    const sample = () => { const out = []; let k = 0; const add = (p, y, n, age = 40) => { for (let i = 0; i < n; i++) out.push({label: sp(p), date: String(y), age: age + i * 3, name: `VIALLE ${k++}`, country: 'France', zone: '19'}); };
        for (let y = 1820; y <= 1845; y++) { add('Naves', y, y % 3 === 0 ? 1 : 0); add('Tulle', y, 1); add('Seilhac', y, y % 4 === 0 ? 1 : 0); }
        add('Naves', 1832, 6); add('Tulle', 1832, 3); for (let y = 1700; y <= 1718; y++) add('Meymac', y, y % 2); add('Meymac', 1709, 5); add('Ussel', 1854, 3, 2); add('Gimel', 1870, 1);
        return out; };
    const SAMPLE_CRISES = [{from: 1832, to: 1832, cat: 'épidémie', title: 'Choléra de 1832', scope: 'France'}, {from: 1709, to: 1709, cat: 'hiver', title: 'Grand hiver de 1709', scope: 'France'}];
    P2.add('crisismap', {icon: '⚰️', label: 'Crises et épidémies (les années où les décès montent)', render: GC.remember(crisismap), legend: 'bottom', time,
        grids: [{key: 'rows', label: 'Les décès (un par ligne)', cols: [C('label', 'Lieu (« Tulle », « Tulle 45.27, 1.77 »)'), C('date', 'Année', 'text', {ph: '1832'}), C('age', 'Âge', 'number'), C('cause', 'Cause notée'), C('name', 'Personne')]}],
        options: [REC,
            C('minDeaths', 'Minimum de décès dans l’année', 'select', {choices: [['', '3'], ['2', '2'], ['5', '5'], ['custom', 'À la main']]}), C('minN', 'Décès au moins', 'number', {min: 1, max: 50, def: 3, when: s => s.o?.minDeaths === 'custom'}),
            C('ratio', 'Seuil', 'select', {choices: [['', '2,5 fois l’habitude'], ['2', '2 fois'], ['3', '3 fois'], ['4', '4 fois'], ['custom', 'À la main']]}), C('ratioN', 'Fois l’habitude', 'number', {min: 1.2, max: 20, def: 2.5, when: s => s.o?.ratio === 'custom'}),
            C('window', 'Fenêtre de l’habitude', 'select', {choices: [['', '5 ans avant et 5 ans après'], ['10', '10 et 10'], ['before', 'Seulement les 10 ans avant']]}),
            C('stat', 'L’habitude se calcule par', 'select', {choices: [['', 'La moyenne'], ['median', 'La médiane (moins dérangée par une autre crise toute proche)']]}),
            C('scale', 'Échelle', 'select', {choices: [['', 'La commune, les petites regroupées avec leurs voisines'], ['commune', 'Toujours la commune'], ['dept', 'Le département']]}),
            C('smallN', 'Petit village : nombre de décès sur toute la période, moins de', 'number', {min: 2, max: 100, def: 10, when: s => !s.o?.scale}),
            C('kids', 'Enfants', 'select', {choices: [['', 'Comptés avec tout le monde'], ['apart', 'À part'], ['out', 'Pas comptés']]}), C('kidsAge', 'Enfant : moins de', 'number', {min: 1, max: 18, def: 10, unit: i18n('ans', {ctx: 'unite'}), when: s => !!s.o?.kids}),
            C('refs', 'Repères proposés', 'select', {choices: [['', 'Les crises du 🌍 Monde autour qui couvrent la commune, et mes événements'], ['all', 'Toutes les crises de l’année'], ['none', 'Aucun']]}),
            C('step', 'Pas du temps', 'select', {choices: [['', 'Année par année'], ['5', 'Par 5 ans'], ['10', 'Par 10 ans']]}),
            C('table', 'Le tableau sous la carte', 'check', {def: true}), C('tableMax', 'Combien de lignes', 'number', {min: 1, max: 40, def: 8, when: s => s.o?.table !== false}),
            C('yearLabels', 'Écrire la commune et l’année près des ronds', 'check', {def: true}), C('minTotal', 'Pas assez de décès placés : moins de', 'number', {min: 1, max: 1000, def: 20}), ...mapOpts, ...COMMON],
        sample: () => ({o: {title: i18n('Les années de crise de la famille'), map: 'fr', time: {show: true, step: 1}}, crises: SAMPLE_CRISES, rows: sample()}),
        fromApp: crisisApp, describe: spec => i18n('Les années de crise : {n}.', {n: pl(rows(spec).length, 'décès')})});
    ext.diagramCartesPlus2.crisismap = crisismap; ext.diagramCartesPlus2.openCrises = openCrises;
})();
