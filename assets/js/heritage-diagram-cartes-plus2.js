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
    /** un fond cadré sur ces points ; fillOf colore les zones (départements…) */
    function frame(spec, W, fs, pts, fillOf = null, H = 0) {
        const o = spec.o || {}, M = GC.MAPS[GC.mapOf(o)];
        const auto = (!o.frame || o.frame === '') && o.fit !== false && pts.length ? GC.fitView(pts.map(p => ({p})), o) : null;
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
    const personField = (name, label) => `<div class="cq-pick"><span class="pk-lab">${i18n(label)}</span>${(window.LCNDA_PICKER || A())?.pickerField?.({name, hiddenName: false, kind: 'person'}) || ''}</div>`;
    const pickedId = (box, name) => Number(box.querySelector(`input[name="${name}"]`)?.closest('.pk')?.querySelector('input[type=hidden]')?.value || box.querySelector(`input[name="${name}"]`)?.value || 0) || 0;

    /* ═════════ Les sortes ═════════ */
    async function resolve(spec) {
        const s = await GC.resolve(spec), o = s.o || {}, pre = GC.viewOf(o), b0 = GC.baseIdOf(o, pre);
        await Promise.all([b0, GC.ctxIdOf(o, b0, pre), 'monde-110m', 'fr-departements'].filter(Boolean).map(id => GC.load(id).catch(() => {})));
        const list = [GC.loaded(b0), GC.loaded('monde-110m')].filter(Boolean);
        const labels = [...rows(s).map(r => r.label), ...rows(s, 'links').flatMap(r => [r.from, r.to])];
        const pts = labels.map(l => GC.placeOf(s, str(l, 120), list)).filter(Boolean);
        if (pts.length && !o.frame && o.fit !== false) { const v = GC.fitView(pts.map(p => ({p: [p[0], p[1]]})), o), b = GC.baseIdOf(o, v); await Promise.all([b, GC.ctxIdOf(o, b, v)].filter(Boolean).map(id => GC.load(id).catch(() => {}))); }
        return s;
    }
    const afterDraw = (prev, api) => { GC.afterDraw(prev, api); prev._c2Api = api; };
    const mapOpts = (GC.mapOpts?.() || []).filter(x => !['level'].includes(x.k));
    const COMMON = [C('fit', 'Cadrer tout seul sur les points', 'check', {def: true, when: s => !s.o?.frame}), C('zoneColor', 'Couleur des terres', 'color', {def: GC.LAND}), C('borderColor', 'Couleur des limites', 'color', {def: '#cfcabe'}), C('showMissing', 'Signaler les lieux sans position', 'check', {def: true})];
    const H = {T, esc, num, clamp, r1, r2, fmt, fold, rows, str, C, pl, yearOf, tip, pidsAttr, opt, optN, siecle, KM, median, bases, frame, locate, missing, emptyMsg, title, atOf, timeOf, periodWord, curve, slice, hull, geoRing, poly,
        get, placesOf, keepUnplaced, pane, bindGo, sel, val, checks, startId, personField, pickedId, resolve, afterDraw, mapOpts, COMMON, i18n, A, ext, DR, GC, color};
    const NEW = {};
    /** une carte de plus : rangée dans le catalogue (groupe « Cartes ») si elle n'y est pas déjà */
    const add = (k, kind) => { NEW[k] = kind; if (!K[k]) K[k] = {group: 'Cartes', resolve, afterDraw, logExport: true, ...kind}; };

    /* ═════════ Les clics dans l'aperçu ═════════ */
    if (typeof document !== 'undefined') {
        document.addEventListener('click', e => {
            const m = e.target.closest?.('.cq-miss'); if (m && !m.closest('.h-dg-mini')) { e.preventDefault(); const ids = String(m.dataset.cqPlace || '').split(',').map(Number).filter(Boolean); ext.lieuxAPlacer?.open?.({ids}); }
        });
    }

    ext.diagramCartesPlus2 = {H, NEW, add};
})();
