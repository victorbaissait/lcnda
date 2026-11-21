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
    /** les fiches derrière un clic sur la carte (le détail reste à l'écran ; jamais à l'export) */
    const DETAIL = new Map();
    const keepDetail = (id, data) => { DETAIL.set(id, data); if (DETAIL.size > 40) DETAIL.delete(DETAIL.keys().next().value); };
    const H = {T, esc, multiples, DETAIL, keepDetail, num, clamp, r1, r2, fmt, fold, rows, str, C, pl, yearOf, tip, pidsAttr, opt, optN, siecle, KM, median, bases, frame, locate, missing, emptyMsg, title, atOf, timeOf, periodWord, curve, slice, hull, geoRing, poly,
        get, placesOf, keepUnplaced, pane, bindGo, sel, val, checks, startId, personField, pickedId, resolve, afterDraw, mapOpts, COMMON, REC, i18n, A, ext, DR, GC, color};
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
    const stepOf = spec => { const t = spec.o?.time; return t === 'all' || t === 'small' ? 0 : t === 'half' ? 50 : 100; };
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
        if (o.time === 'small' && !o.__inFacet) { // ▦ un petit dessin par siècle, au même cadrage
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
                fill(s, r, {classify, trade: classify === 'one' ? ts.value : '', tradeName: classify === 'one' ? tradeName(ts) : '', draw: val(box, 'draw'), time: val(box, 'time'),
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
            C('time', 'Temps', 'select', {choices: [['', '▶ Siècle par siècle'], ['small', '▦ Un petit dessin par siècle'], ['half', 'Par demi-siècle'], ['all', 'Tout ensemble']]}),
            C('at', 'Siècle montré (une année ; vide = tous)', 'text', {ph: '1800', when: s => !['all', 'small'].includes(s.o?.time)}),
            C('where', 'Où placer le métier', 'select', {choices: [['', 'Lieu de l’acte, sinon résidence, sinon naissance'], ['act', 'Lieu de l’acte seulement']]}),
            C('multi', 'Plusieurs métiers', 'select', {choices: [['', 'Chacun à sa date'], ['main', 'Le principal seulement']]}),
            C('foyer', '🧺 Au foyer, sans profession', 'select', {choices: [['', 'Montrés'], ['hide', 'Cachés']]}),
            C('size', 'Taille', 'select', {choices: [['', 'Nombre de personnes'], ['mentions', 'Nombre de mentions'], ['same', 'Tous pareils']]}),
            C('dotSize', 'Taille des ronds', 'range', {min: .3, max: 3, step: .1, def: 1}), C('placeLabels', 'Noms des lieux', 'select', {choices: [['', 'Les plus grands'], ['all', 'Tous'], ['none', 'Aucun']]}), ...mapOpts, ...COMMON],
        sample: () => ({o: {title: i18n('Les métiers de la famille'), map: 'fr', time: ''}, rows: sample()}),
        fromApp: tradeApp, describe: spec => i18n('Carte des métiers : {n}.', {n: pl(rows(spec).length, 'mention')})});
    ext.diagramCartesPlus2.trademap = trademap;
    /** 🛠️ fiche d'un métier ancien → « 🗺 Où on l'exerçait » : la carte réglée sur ce métier et ses variantes */
    ext.diagramCartesPlus2.openTrade = async (key, name) => {
        try { const r = await get({what: 'trades'}); r.rows = (r.rows || []).filter(e => e[3] === key);
            if (!r.rows.length) return window.LCNDA_APP?.toast?.(i18n('Aucun métier avec un lieu pour ce choix.'));
            const s = fill({kind: 'trademap', o: {map: 'fr'}}, r, {classify: 'one', trade: key, tradeName: name, title: i18n('Où on était {trade}', {trade: name}), time: 'all'});
            ext.openDiagramEditor?.(null, {spec: s, name: s.o.title});
        } catch (e) { window.LCNDA_APP?.toast?.(e.message || String(e), 'error'); }
    };
})();
