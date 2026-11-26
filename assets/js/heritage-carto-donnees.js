/**
 * 🗺 Données ouvertes sur les cartes, en option : « ＋ Données » pose par-dessus une carte des diagrammes (cartes colorées,
 * migrations, ronds, points, chaleur… : toutes les sortes du groupe « Cartes ») ou dans le dessin vectoriel (menu Plan) une couche :
 * une source, des filtres (texte, années, catégorie, autour d'un lieu, dans un territoire), un style (symbole, couleur, taille,
 * noms oui / non), une ligne de légende et la mention de la source. Les couches sont gardées avec le diagramme (spec.carto.layers)
 * ou deviennent des objets du dessin (un groupe par couche) ; elles partent avec l'export (SVG, PNG, PDF) et leur source.
 * Les sources :
 *  - tout jeu de données du registre commun LCNDA_EXT.dataLists qui a geo(row) (points ; geoShape(row) → {type:'area', rings} ou
 *    {type:'line', pts} pour des zones ou des traits) — moteur des Listes (app-listes-donnees.js) : query() est utilisé s'il existe ;
 *  - 🧩 Mes territoires (heritage-territoires.js) ; 🗺 frontières des pays d'une année (CShapes, heritage-monde-contexte.js) ;
 *    📍 les lieux de ta base ; les packs installés : 🌋 séismes (Histoire du lieu), 🌡 stations météo, 🏰 lieux anciens (GOV) ;
 *  - tout module qui ajoute une source à LCNDA_EXT.mapLayerSources : {id, icon, label, group, kind:'points'|'areas'|'lines',
 *    source, needsYear?, run: async ({q, from, to, year, bbox, max}) => ({features:[{type:'pt', lat, lon, label} |
 *    {type:'area', rings:[[[lon,lat]…]…], label} | {type:'line', pts:[[lon,lat]…], label}], source})}
 *    (👑 territoires d'autrefois de heritage-chateaux-territoires.js : ce crochet, ou ext.chateauxTerritoires.mapLayerSources).
 * Branchements : les sortes « Cartes » de ext.diagramRender.KINDS (render, resolve, afterDraw enveloppés ici, rien à changer chez
 * elles) ; le dessin vectoriel : LCNDA_EXT.vectorPlanItems (menu Plan, heritage-vector.js).
 *   window.LCNDA_EXT.cartoDonnees = {sources, fetchLayer, layersSvg, layerDialog, addToVector, wrapKinds}
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m)));
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const A = () => root.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const num = (v, d = null) => { const n = Number(String(v ?? '').replace(',', '.')); return v === '' || v == null || !Number.isFinite(n) ? d : n; };
    const r1 = v => Math.round(v * 10) / 10;
    const toast = (m, k) => A()?.toast?.(m, k);
    const TR = () => ext.territories;
    const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x))); };
    const hex6 = c => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : '');
    const PALETTE = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053'];
    const SYMBOLS = [['circle', '● Rond'], ['square', '■ Carré'], ['triangle', '▲ Triangle'], ['diamond', '◆ Losange'], ['star', '★ Étoile'], ['cross', '✚ Croix'], ['pin', '📍 Épingle']];

    /* ═════════ les sources ═════════ */
    let packs = null; // ['seismes', 'stations', 'gov'] : les packs installés
    const loadPacks = () => (packs ? Promise.resolve(packs) : !A()?.api ? Promise.resolve([]) : A().api('carto_packs').then(r => (packs = r.packs || [])).catch(() => (packs = [])));
    const PACKS = {seismes: ['🌋', 'Séismes d’autrefois (pack Histoire du lieu)', 'Le monde', 'hist_seismes'], stations: ['🌡', 'Stations météo (pack météo)', 'Le lieu', 'meteo_stations'], gov: ['🏰', 'Lieux anciens (pack GOV)', 'Le lieu', 'gov_noms']};
    const labelOf = (dl, row) => { const f = (dl.fields || []).find(x => x.type === 'text'); return String(row?.name ?? row?.title ?? row?.label ?? (f ? row?.[f.key] : '') ?? '').slice(0, 80); };
    /** le catalogue : [{key, icon, label, group, kind, source, fields, period, needsYear}] */
    function sources() {
        const out = [];
        (ext.dataLists || []).forEach(dl => {
            if (!dl?.id || dl.link || (typeof dl.geo !== 'function' && typeof dl.geoShape !== 'function') || dl.id === 'mes_territoires') return;
            try { if (typeof dl.enabled === 'function' && !dl.enabled()) return; } catch (_) { return; }
            out.push({key: 'dl:' + dl.id, icon: dl.icon || '📋', label: dl.label || dl.id, group: dl.group || 'Données', kind: dl.geoShape ? 'mixed' : 'points', source: dl.source || '', fields: dl.fields || [], period: typeof dl.period === 'function', dl});
        });
        out.push({key: 'terr', icon: '🧩', label: T('Mes territoires (communes réunies)'), group: 'Le lieu', kind: 'areas', source: TR()?.ATTR || ''});
        out.push({key: 'places', icon: '📍', label: T('Les lieux de ta base'), group: 'Ta famille', kind: 'points', source: T('Ta base')});
        if (ext.mondeContexte) out.push({key: 'borders', icon: '🗺', label: T('Frontières des pays en une année (1816 → 2019)'), group: 'Le monde', kind: 'areas', needsYear: true, source: 'CShapes 2.0 (ETH Zürich), CC BY-NC-SA 4.0'});
        // les packs lus directement ici, seulement quand les Listes (app-listes-donnees.js) ne les donnent pas déjà
        (packs || []).forEach(k => { const P = PACKS[k]; if (P && !out.some(o => o.key === 'dl:' + P[3])) out.push({key: 'pack:' + k, icon: P[0], label: T(P[1]), group: P[2], kind: 'points', period: true, source: ''}); });
        const extra = [...(ext.mapLayerSources || []), ...(Array.isArray(ext.chateauxTerritoires?.mapLayerSources) ? ext.chateauxTerritoires.mapLayerSources : [])];
        extra.forEach(s => { if (s?.id && typeof s.run === 'function' && !out.some(o => o.key === 'x:' + s.id)) out.push({key: 'x:' + s.id, icon: s.icon || '🗺', label: s.label || s.id, group: s.group || 'Le monde', kind: s.kind || 'areas', needsYear: !!s.needsYear, period: true, source: s.source || '', ext: s}); });
        return out;
    }
    const srcOf = key => sources().find(s => s.key === key) || null;

    /* ═════════ une couche → des éléments à dessiner ═════════ */
    const mem = new Map(); // clé → {t, p (promesse), r (résultat)}
    const keyOf = L => JSON.stringify([L.src, L.f || {}, L.max || 0]);
    function passFilters(L, row, latlon, src) {
        const f = L.f || {};
        if (f.cat?.key && String(f.cat.val ?? '') !== '' && fold(row?.[f.cat.key]) !== fold(f.cat.val) && !fold(row?.[f.cat.key]).includes(fold(f.cat.val))) return false;
        if (f.near && Number.isFinite(f.near.lat) && latlon && km(f.near.lat, f.near.lon, latlon[0], latlon[1]) > (Number(f.near.km) || 10)) return false;
        if (f.terr && latlon && TR() && !TR().contains(latlon[0], latlon[1], f.terr)) return false;
        if ((f.from != null || f.to != null) && src?.dl?.period) { const p = src.dl.period(row); if (!p || p[0] == null) return false; const a = f.from ?? -1e9, b = f.to ?? 1e9; if (p[0] > b || (p[1] ?? p[0]) < a) return false; }
        if (f.q && !Object.values(row || {}).some(v => typeof v === 'string' && fold(v).includes(fold(f.q)))) return false;
        return true;
    }
    async function run(L, ctx = {}) {
        const src = srcOf(L.src), f = L.f || {}, max = Math.max(1, Math.min(20000, Number(L.max) || 1500));
        if (!src) {
            if (/^pack:/.test(L.src)) { await loadPacks(); if (!srcOf(L.src)) return {features: [], source: '', total: 0, missing: T('Ce pack n’est pas installé (Réglages).')}; return run(L, ctx); }
            return {features: [], source: '', total: 0, missing: T('Cette source n’est pas disponible ici.')};
        }
        if (f.terr && TR()) await TR().list().catch(() => {});
        if (src.key === 'terr') {
            const all = TR() ? await TR().list() : [], ids = Array.isArray(f.ids) && f.ids.length ? f.ids.map(Number) : all.map(t => t.id);
            const feats = all.filter(t => ids.includes(t.id)).map(t => ({...TR().feature(t), style: t.style}));
            return {features: feats, source: src.source, total: feats.length};
        }
        if (src.key === 'places') {
            const ps = (await A().api('terr_places')).places || [];
            const feats = ps.filter(p => passFilters(L, p, [p.lat, p.lon], src)).slice(0, max).map(p => ({type: 'pt', lat: p.lat, lon: p.lon, label: p.name}));
            return {features: feats, source: src.source, total: feats.length};
        }
        if (src.key === 'borders') {
            const M = ext.mondeContexte, B = await M.load(), y = Math.max(M.FIRST_EUROPE || 1816, Math.min(M.LAST || 2019, Math.round(Number(f.year ?? f.from) || 1900))), d = y * 10000 + 701;
            const feats = [];
            for (const e of M.entsAt(B, d)) {
                const name = M.nameAt(B, e.gw, d); if (f.q && !fold(name).includes(fold(f.q))) continue;
                const rings = []; for (const poly of M.rings(B, e.g)) for (const r of poly) { const pts = []; for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]); rings.push(pts); }
                feats.push({type: 'area', rings, label: name});
            }
            return {features: feats, source: T('Frontières de {y} — {s}', {y: String(y), s: src.source}), total: feats.length};
        }
        if (src.key.startsWith('pack:')) {
            const b = ctx.bbox || [-180, -90, 180, 90];
            const r = await A().api('carto_pack_rows', {kind: src.key.slice(5), bbox: b.join(','), ...(f.from != null ? {from: f.from} : {}), ...(f.to != null ? {to: f.to} : {}), ...(f.q ? {q: f.q} : {}), limit: max * 2});
            const feats = (r.rows || []).filter(p => passFilters({...L, f: {...f, q: '', from: null, to: null}}, p, [p.lat, p.lon], src)).slice(0, max).map(p => ({type: 'pt', lat: p.lat, lon: p.lon, label: p.name}));
            return {features: feats, source: r.source || src.label, total: feats.length};
        }
        if (src.ext) {
            const r = await src.ext.run({q: f.q || '', from: f.from ?? null, to: f.to ?? null, year: f.year ?? f.from ?? null, bbox: ctx.bbox || null, max});
            const feats = (r?.features || []).filter(x => x && (x.type !== 'pt' || passFilters({...L, f: {...f, q: '', from: null, to: null}}, x, [x.lat, x.lon], src))).slice(0, max);
            return {features: feats, source: r?.source || src.source, total: feats.length};
        }
        // un jeu de données du registre commun (Listes)
        const dl = src.dl;
        if (dl.installed && !(await dl.installed())) return {features: [], source: src.source, total: 0, missing: T('Ces données ne sont pas installées (Réglages).')};
        let rows;
        if (typeof dl.query === 'function') {
            const filters = f.cat?.key && String(f.cat.val ?? '') !== '' ? [{key: f.cat.key, op: 'eq', value: f.cat.val}] : [];
            const r = await dl.query({q: f.q || '', filters, ...(f.near ? {near: {lat: f.near.lat, lon: f.near.lon, km: Number(f.near.km) || 10}} : {}), ...(f.from != null || f.to != null ? {years: {from: f.from ?? null, to: f.to ?? null, mode: 'overlap'}} : {}), offset: 0, limit: Math.min(5000, max * 2)});
            rows = r?.rows || [];
        } else rows = (await dl.load?.()) || [];
        const feats = [];
        for (const row of rows) {
            if (feats.length >= max) break;
            const shp = dl.geoShape ? dl.geoShape(row) : null;
            const g = typeof dl.geo === 'function' ? dl.geo(row) : null, ll = Array.isArray(g) && Number.isFinite(Number(g[0])) && Number.isFinite(Number(g[1])) ? [Number(g[0]), Number(g[1])] : null;
            if (!passFilters(L, row, ll || (shp?.rings?.[0]?.[0] ? [shp.rings[0][0][1], shp.rings[0][0][0]] : null), src)) continue;
            if (shp && (shp.type === 'area' || shp.type === 'line')) feats.push({...shp, label: shp.label || labelOf(dl, row)});
            else if (ll) feats.push({type: 'pt', lat: ll[0], lon: ll[1], label: labelOf(dl, row)});
        }
        return {features: feats, source: src.source || src.label, total: feats.length};
    }
    /** les éléments d'une couche (gardés une minute) */
    function fetchLayer(L, ctx = {}) {
        const k = keyOf(L) + (ctx.bbox ? '|' + ctx.bbox.map(v => Math.round(v * 100) / 100).join(',') : ''), hit = mem.get(k);
        if (hit && (hit.p || Date.now() - hit.t < 60000) && L.src !== 'terr') return hit.p || Promise.resolve(hit.r);
        const p = run(L, ctx).then(r => { mem.set(k, {t: Date.now(), r}); return r; }).catch(e => { mem.delete(k); return {features: [], source: '', total: 0, missing: e.message}; });
        mem.set(k, {t: Date.now(), p}); return p;
    }
    /** déjà là ? (pour dessiner sans attendre) */
    const ready = (L, ctx = {}) => { if (L.src === 'terr') { const all = TR()?.cached() || [], ids = Array.isArray(L.f?.ids) && L.f.ids.length ? L.f.ids.map(Number) : all.map(t => t.id); return {features: all.filter(t => ids.includes(t.id)).map(t => ({...TR().feature(t), style: t.style})), source: TR()?.ATTR || '', total: ids.length}; }
        const k = keyOf(L) + (ctx.bbox ? '|' + ctx.bbox.map(v => Math.round(v * 100) / 100).join(',') : ''); return mem.get(k)?.r || null; };

    /* ═════════ le dessin (SVG) : zones, traits, symboles, noms, légende, source ═════════ */
    function symbolSvg(sym, x, y, s, fill, stroke = '#ffffff', sw = 1) {
        const a = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
        if (sym === 'square') return `<rect x="${r1(x - s)}" y="${r1(y - s)}" width="${r1(s * 2)}" height="${r1(s * 2)}" ${a}/>`;
        if (sym === 'triangle') return `<path d="M${r1(x)} ${r1(y - s * 1.2)}L${r1(x + s * 1.1)} ${r1(y + s * .8)}L${r1(x - s * 1.1)} ${r1(y + s * .8)}Z" ${a}/>`;
        if (sym === 'diamond') return `<path d="M${r1(x)} ${r1(y - s * 1.3)}L${r1(x + s)} ${r1(y)}L${r1(x)} ${r1(y + s * 1.3)}L${r1(x - s)} ${r1(y)}Z" ${a}/>`;
        if (sym === 'star') { let d = ''; for (let k = 0; k < 10; k++) { const ang = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * .5 : s * 1.3; d += `${k ? 'L' : 'M'}${r1(x + Math.cos(ang) * rr)} ${r1(y + Math.sin(ang) * rr)}`; } return `<path d="${d}Z" ${a}/>`; }
        if (sym === 'cross') { const w = s * .4; return `<path d="M${r1(x - w)} ${r1(y - s)}H${r1(x + w)}V${r1(y - w)}H${r1(x + s)}V${r1(y + w)}H${r1(x + w)}V${r1(y + s)}H${r1(x - w)}V${r1(y + w)}H${r1(x - s)}V${r1(y - w)}H${r1(x - w)}Z" ${a}/>`; }
        if (sym === 'pin') return `<path d="M${r1(x)} ${r1(y)}C${r1(x - s * .3)} ${r1(y - s * .9)} ${r1(x - s * 1.1)} ${r1(y - s * 1.3)} ${r1(x - s * 1.1)} ${r1(y - s * 2.1)}A${r1(s * 1.1)} ${r1(s * 1.1)} 0 1 1 ${r1(x + s * 1.1)} ${r1(y - s * 2.1)}C${r1(x + s * 1.1)} ${r1(y - s * 1.3)} ${r1(x + s * .3)} ${r1(y - s * .9)} ${r1(x)} ${r1(y)}Z" ${a}/>`;
        return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(s)}" ${a}/>`;
    }
    const styleOf = (L, i) => ({sym: 'circle', color: PALETTE[i % PALETTE.length], size: 4, labels: false, opacity: .9, hatch: '', ...(L.st || {})});
    /**
     * les couches dessinées dans une boîte w × h ; P(lon, lat) → [x, y]. Rend {svg, legend:[{sym,color,label,area}], sources:[…]}.
     */
    function layersSvg(layers, P, w, h, {fs = 12, uid = 'cd', ctx = {}} = {}) {
        let defs = '', areas = '', lines = '', pts = '', labs = ''; const legend = [], srcs = [], placed = [];
        const lab = (x, y, s, size, color) => {
            const tw = String(s).length * size * .55, box = [x + size * .5, y - size * .6, x + size * .5 + tw, y + size * .6];
            if (box[2] > w || box[1] < 0 || box[3] > h || placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return; placed.push(box);
            if (placed.length > 400) return;
            labs += `<text x="${r1(box[0])}" y="${r1(y)}" font-size="${r1(size)}" dominant-baseline="middle" fill="${color}" stroke="#ffffff" stroke-width="${r1(size / 4)}" stroke-linejoin="round" paint-order="stroke">${esc(s)}</text>`;
        };
        const ringD = rings => { let d = ''; for (const r of rings || []) { let s = '', n = 0, plon = NaN, off = 0; for (const [lo, la] of r) { if (lo - plon > 180) off -= 360; else if (lo - plon < -180) off += 360; plon = lo; const [x, y] = P(lo + off, la); if (!Number.isFinite(x) || !Number.isFinite(y)) continue; s += `${n ? 'L' : 'M'}${r1(x)} ${r1(y)}`; n++; } if (n >= 3) d += s + 'Z'; } return d; };
        (layers || []).forEach((L, i) => {
            if (L.hidden) return;
            const res = ready(L, ctx); if (!res) return;
            const st = styleOf(L, i), color = hex6(st.color) || '#c0392b', size = Math.max(1, Math.min(30, Number(st.size) || 4)) * fs / 12;
            let n = 0;
            res.features.forEach((ft, j) => {
                const fst = ft.style && L.src === 'terr' ? {...st, ...ft.style, color: hex6(ft.style.color) || color} : st, c = hex6(fst.color) || color;
                if (ft.type === 'area') {
                    const d = ringD(ft.rings); if (!d) return; n++;
                    let fill = c, fo = Math.max(0, Math.min(1, Number(fst.opacity ?? .25)));
                    if (fst.hatch && TR()) { const pid = `${uid}h${i}_${j}`; defs += TR().hatchDef(pid, fst, Math.max(5, fs * .7)); fill = `url(#${pid})`; fo = 1; }
                    areas += `<path d="${d}" fill="${fill}" fill-opacity="${fo}" fill-rule="evenodd" stroke="${c}" stroke-width="${r1(Math.max(.6, Number(fst.width) || 1.5) * fs / 12)}"${fst.dash ? ' stroke-dasharray="5 3"' : ''} stroke-linejoin="round"><title>${esc(ft.label || '')}</title></path>`;
                    if ((fst.labels || (L.src === 'terr' && fst.label !== false)) && ft.label) { const b = ft.rings.flat().reduce((b, [lo, la]) => [Math.min(b[0], lo), Math.min(b[1], la), Math.max(b[2], lo), Math.max(b[3], la)], [Infinity, Infinity, -Infinity, -Infinity]); const [x, y] = P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); if (Number.isFinite(x) && x > 0 && x < w && y > 0 && y < h) { const tw = String(ft.label).length * fs * .55; lab(x - tw / 2 - fs * .5, y, ft.label, fs * .95, c); } }
                } else if (ft.type === 'line') {
                    const d = ringD([ft.pts]).replace(/Z$/, ''); if (!d) return; n++;
                    lines += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${r1(size / 2)}" stroke-linejoin="round" stroke-linecap="round"><title>${esc(ft.label || '')}</title></path>`;
                } else {
                    const [x, y] = P(ft.lon, ft.lat); if (!Number.isFinite(x) || x < -size || y < -size || x > w + size || y > h + size) return; n++;
                    pts += `<g opacity="${Math.max(.1, Math.min(1, Number(st.opacity) || .9))}">${symbolSvg(st.sym, x, y, size, c, '#ffffff', r1(Math.max(.5, size / 5)))}<title>${esc(ft.label || '')}</title></g>`;
                    if (st.labels && ft.label) lab(x, y, ft.label, fs * .8, '#222222');
                }
            });
            legend.push({sym: st.sym, color, area: res.features.some(f => f.type === 'area'), hatch: st.hatch, label: `${L.label || srcOf(L.src)?.label || ''}${n ? ` (${n})` : ''}`});
            if (res.source && !srcs.includes(res.source)) srcs.push(res.source);
        });
        // la légende et la source : sous la carte (rien ne cache la carte ni ses encarts) — legendBlock(x, y, largeur) → {svg, h}
        const legendBlock = (x0, y0, maxW) => {
            if (!legend.length) return {svg: '', h: 0};
            let x = x0, y = y0, out = '<g class="cd-legend">'; const lh = fs * 1.5;
            legend.forEach(l => {
                const lw = fs * 1.6 + l.label.length * fs * .5 + fs;
                if (x > x0 && x + lw > x0 + maxW) { x = x0; y += lh; }
                const my = y + lh / 2;
                out += l.area ? `<rect x="${r1(x)}" y="${r1(my - fs * .35)}" width="${r1(fs * .9)}" height="${r1(fs * .7)}" fill="${l.color}" fill-opacity=".35" stroke="${l.color}"/>` : symbolSvg(l.sym, x + fs * .45, l.sym === 'pin' ? my + fs * .35 : my, fs * .35, l.color, '#ffffff', .6);
                out += `<text x="${r1(x + fs * 1.3)}" y="${r1(my)}" font-size="${r1(fs * .85)}" dominant-baseline="middle" fill="currentColor">${esc(l.label)}</text>`;
                x += lw;
            });
            y += lh;
            if (srcs.length) { out += `<text x="${r1(x0)}" y="${r1(y + fs * .5)}" font-size="${r1(Math.max(7, fs * .7))}" fill="#555555" font-style="italic">${esc(T('Données : {s}', {s: srcs.join(' ; ')}))}</text>`; y += fs * 1.1; }
            return {svg: out + '</g>', h: y - y0};
        };
        return {svg: `<g class="cd-layers">${defs ? `<defs>${defs}</defs>` : ''}${areas}${lines}${pts}${labs}</g>`, legend, sources: srcs, legendBlock};
    }

    /* ═════════ 📊 les cartes des diagrammes ═════════ */
    const layersOf = spec => (Array.isArray(spec?.carto?.layers) ? spec.carto.layers.filter(l => l && typeof l === 'object' && l.src) : []);
    function wrapKinds() {
        const K = ext.diagramRender?.KINDS; if (!K) return;
        for (const kind of Object.values(K)) {
            if (!kind || kind._cd || kind.group !== 'Cartes' || typeof kind.render !== 'function') continue;
            kind._cd = true;
            const render0 = kind.render, resolve0 = kind.resolve, after0 = kind.afterDraw;
            kind.render = (spec, W, fs) => {
                const out = render0(spec, W, fs), Ls = layersOf(spec);
                if (!Ls.length || !out?.geo?.pr || typeof out.svg !== 'string') return out;
                const g = out.geo, w = g.w || W, h = g.h || out.h, uid = String(g.uid || 'cd').replace(/[^\w-]/g, '');
                Ls.forEach(l => { if (!ready(l)) fetchLayer(l); }); // pas encore là (sorte sans resolve) : chargé pour le prochain dessin
                const L = layersSvg(Ls, (lo, la) => g.pr.p(lo, la), w, h, {fs: fs || 12, uid: 'cd' + uid});
                const block = out.svg.includes(`id="${uid}c"`) ? `<g clip-path="url(#${uid}c)">${L.svg}</g>` : L.svg;
                const at = out.svg.indexOf('<rect data-geo-hit');
                const LB = L.legendBlock(0, (out.h || h) + (fs || 12) * .6, w);
                return {...out, h: (out.h || h) + (LB.h ? LB.h + (fs || 12) * .6 : 0), svg: (at >= 0 ? out.svg.slice(0, at) + block + out.svg.slice(at) : out.svg + block) + LB.svg, desc: [out.desc, L.sources.length ? T('Données : {s}', {s: L.sources.join(' ; ')}) : ''].filter(Boolean).join(' ')};
            };
            if (resolve0) kind.resolve = async spec => { // seulement là où la sorte prépare déjà son dessin (sinon resolveLive suivrait un autre chemin)
                const s = resolve0 ? await resolve0(spec) : spec, Ls = layersOf(s);
                if (Ls.length) { if (Ls.some(l => l.src === 'terr' || l.f?.terr)) await TR()?.list().catch(() => {}); await Promise.all(Ls.map(l => fetchLayer(l))); }
                return s;
            };
            kind.afterDraw = (prev, api) => { try { after0?.(prev, api); } catch (e) { console.error(e); } bar(prev, api); };
        }
    }
    /** la barre « 🗺 Données sur la carte » de l'éditeur de diagramme */
    function bar(prev, api) {
        const host = prev?.parentElement; if (!host) return;
        let b = host.querySelector(':scope > .cd-bar');
        if (!b) {
            b = document.createElement('div'); b.className = 'cd-bar'; b.setAttribute('role', 'group'); b.setAttribute('aria-label', T('Données sur la carte'));
            prev.before(b);
            b.addEventListener('click', async e => {
                const a = b._api; if (!a) return;
                const spec = a.spec(), Ls = layersOf(spec);
                const setLayers = (next, msg) => {
                    const before = JSON.parse(JSON.stringify(Ls));
                    spec.carto = {...(spec.carto || {}), layers: next}; if (!next.length) delete spec.carto;
                    a.changed(); paint();
                    A()?.undoToast?.(msg, {undo: () => { const s2 = a.spec(); s2.carto = {...(s2.carto || {}), layers: before}; if (!before.length) delete s2.carto; a.changed(); paint(); }});
                };
                if (e.target.closest('[data-cd-add]')) { const L = await layerDialog(null); if (L) setLayers([...layersOf(a.spec()), L], T('Couche « {n} » ajoutée.', {n: L.label})); return; }
                if (e.target.closest('[data-cd-terr]')) { const t = await TR()?.open(null); if (t) setLayers([...layersOf(a.spec()), {id: lid(), src: 'terr', label: t.name, f: {ids: [t.id]}, st: {color: t.style?.color || '#c0392b'}}], T('Territoire « {n} » posé sur la carte.', {n: t.name})); return; }
                const ed = e.target.closest('[data-cd-edit]'); if (ed) { const i = Number(ed.dataset.cdEdit), L = await layerDialog(Ls[i]); if (L) { const n = Ls.slice(); n[i] = L; setLayers(n, T('Couche « {n} » modifiée.', {n: L.label})); } return; }
                const rm = e.target.closest('[data-cd-rm]'); if (rm) { const i = Number(rm.dataset.cdRm); setLayers(Ls.filter((_, k) => k !== i), T('Couche « {n} » retirée.', {n: Ls[i]?.label || ''})); return; }
                const up = e.target.closest('[data-cd-up]'); if (up) { const i = Number(up.dataset.cdUp); if (i > 0) { const n = Ls.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; setLayers(n, T('Ordre des couches changé.')); } return; }
                const tg = e.target.closest('[data-cd-eye]'); if (tg) { const i = Number(tg.dataset.cdEye), n = Ls.map((l, k) => (k === i ? {...l, hidden: !l.hidden} : l)); setLayers(n, n[i].hidden ? T('Couche « {n} » cachée.', {n: n[i].label}) : T('Couche « {n} » montrée.', {n: n[i].label})); }
            });
        }
        b._api = api;
        const paint = () => {
            const Ls = layersOf(b._api.spec());
            b.innerHTML = `<span class="cd-bar-t">🗺 ${esc(T('Données sur la carte'))}</span>${Ls.map((l, i) => { const st = styleOf(l, i);
                return `<span class="cd-chip${l.hidden ? ' is-off' : ''}"><i style="background:${esc(hex6(st.color) || '#c0392b')}"></i>${esc(l.label || '')}<button type="button" data-cd-eye="${i}" title="${esc(l.hidden ? T('Montrer') : T('Cacher'))}">${l.hidden ? '🙈' : '👁'}</button>${i ? `<button type="button" data-cd-up="${i}" title="${esc(T('Plus bas (dessinée avant)'))}">↑</button>` : ''}<button type="button" data-cd-edit="${i}" title="${esc(T('Modifier'))}">✏️</button><button type="button" data-cd-rm="${i}" title="${esc(T('Retirer'))}">✕</button></span>`; }).join('')}
                <button type="button" class="button small secondary" data-cd-add title="${esc(T('Des données ouvertes (et tes lieux) par-dessus la carte'))}">＋ ${esc(T('Données'))}</button><button type="button" class="button small secondary" data-cd-terr title="${esc(T('Réunir des communes en un territoire, posé sur la carte'))}">🧩 ${esc(T('Territoire à partir de communes'))}</button>`;
        };
        b.hidden = !prev.querySelector('[data-geo-map]') && !prev.querySelector('[data-geo-wait]');
        paint();
    }
    let lidSeq = 0; const lid = () => 'l' + Date.now().toString(36) + (lidSeq++).toString(36);

    /* ═════════ la fenêtre « ＋ Données sur la carte » ═════════ */
    async function layerDialog(L0 = null) {
        await loadPacks();
        const srcs = sources(); let places = [];
        try { places = (await A().api('terr_places')).places || []; } catch (_) {}
        let terrs = []; try { terrs = TR() ? await TR().list() : []; } catch (_) {}
        return new Promise(resolve => {
            const dlg = document.createElement('dialog'); dlg.className = 'ct-dialog cd-dialog'; document.body.appendChild(dlg);
            const L = L0 ? JSON.parse(JSON.stringify(L0)) : {id: lid(), src: srcs[0]?.key || '', label: '', f: {}, st: {}, max: 1500};
            const st = styleOf(L, Number(String(L.id).length) % PALETTE.length);
            const groups = [...new Set(srcs.map(s => s.group))];
            dlg.innerHTML = `<form method="dialog" class="ct-shell">
                <header class="ct-head"><h2>🗺 ${esc(L0 ? T('Modifier la couche') : T('Ajouter des données sur la carte'))}</h2><button type="button" class="icon-button" data-cd-x aria-label="${esc(T('Fermer'))}">×</button></header>
                <div class="cd-body">
                  <label class="ct-f">${esc(T('Quelles données ?'))}<select data-cd-src>${groups.map(g => `<optgroup label="${esc(T(g))}">${srcs.filter(s => s.group === g).map(s => `<option value="${esc(s.key)}" ${s.key === L.src ? 'selected' : ''}>${esc(s.icon)} ${esc(s.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
                  <p class="muted cd-src" data-cd-srcline></p>
                  <fieldset class="cd-filters"><legend>${esc(T('Filtrer'))}</legend>
                    <div data-cd-terrs class="cd-terrs" hidden>${terrs.map(t => `<label class="checkbox-line"><input type="checkbox" data-cd-tid value="${t.id}" ${(L.f.ids || []).map(Number).includes(t.id) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('') || `<p class="muted">${esc(T('Pas encore de territoire.'))}</p>`}<button type="button" class="button small secondary" data-cd-newterr>🧩 ${esc(T('Nouveau territoire à partir de communes…'))}</button></div>
                    <label class="ct-f" data-cd-w="q">${esc(T('Le nom contient'))}<input data-cd-f="q" value="${esc(L.f.q || '')}"></label>
                    <div class="ct-row" data-cd-w="years"><label class="ct-f">${esc(T('De l’an'))}<input type="number" data-cd-f="from" value="${esc(L.f.from ?? '')}" min="-3000" max="2100"></label><label class="ct-f">${esc(T('à l’an'))}<input type="number" data-cd-f="to" value="${esc(L.f.to ?? '')}" min="-3000" max="2100"></label></div>
                    <label class="ct-f" data-cd-w="year">${esc(T('L’année'))}<input type="number" data-cd-f="year" value="${esc(L.f.year ?? 1900)}" min="1816" max="2019"></label>
                    <div class="ct-row" data-cd-w="cat"><label class="ct-f">${esc(T('Catégorie'))}<select data-cd-catkey></select></label><label class="ct-f">${esc(T('vaut'))}<input data-cd-catval list="cd-catvals" value="${esc(L.f.cat?.val || '')}"><datalist id="cd-catvals"></datalist></label></div>
                    <div class="ct-row" data-cd-w="near"><label class="ct-f">${esc(T('Autour de'))}<input data-cd-near list="cd-places" value="${esc(L.f.near?.name || '')}" placeholder="${esc(T('un lieu de ta base'))}"><datalist id="cd-places">${places.slice(0, 1500).map(p => `<option value="${esc(p.name)}${p.county ? ` (${esc(p.county)})` : ''}">`).join('')}</datalist></label><label class="ct-f">${esc(T('à moins de (km)'))}<input type="number" data-cd-km value="${esc(L.f.near?.km ?? 20)}" min="1" max="2000"></label></div>
                    <label class="ct-f" data-cd-w="terr">${esc(T('Seulement dans le territoire'))}<select data-cd-interr><option value="">${esc(T('— partout —'))}</option>${terrs.map(t => `<option value="${t.id}" ${Number(L.f.terr) === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
                    <label class="ct-f" data-cd-w="max">${esc(T('Au plus'))}<input type="number" data-cd-max value="${esc(L.max || 1500)}" min="1" max="20000"></label>
                  </fieldset>
                  <fieldset class="cd-style"><legend>${esc(T('Dessin'))}</legend>
                    <div class="ct-row"><label class="ct-f" data-cd-w="sym">${esc(T('Symbole'))}<select data-cd-st="sym">${SYMBOLS.map(([k, l]) => `<option value="${k}" ${st.sym === k ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label>
                      <label class="ct-f">${esc(T('Couleur'))}<input type="color" data-cd-st="color" value="${esc(hex6(st.color) || '#c0392b')}"></label>
                      <label class="ct-f" data-cd-w="sym">${esc(T('Taille'))}<input type="range" min="1" max="14" step="0.5" data-cd-st="size" value="${esc(st.size)}"></label></div>
                    <div class="ct-row" data-cd-w="hatch"><label class="ct-f">${esc(T('Hachure'))}<select data-cd-st="hatch">${[['', 'Aucune (couleur pleine)'], ['diag', 'Traits en biais ╱'], ['diag2', 'Traits en biais ╲'], ['cross', 'Quadrillage'], ['horiz', 'Traits couchés'], ['vert', 'Traits debout'], ['dots', 'Points']].map(([k, l]) => `<option value="${k}" ${st.hatch === k ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label>
                      <label class="ct-f">${esc(T('Remplissage'))}<input type="range" min="0" max="1" step="0.05" data-cd-st="opacity" value="${esc(st.opacity)}"></label></div>
                    <label class="checkbox-line"><input type="checkbox" data-cd-st="labels" ${st.labels ? 'checked' : ''}> ${esc(T('Écrire les noms'))}</label>
                    <label class="ct-f">${esc(T('Ligne de la légende'))}<input data-cd-label value="${esc(L.label || '')}" maxlength="80"></label>
                  </fieldset>
                  <p class="cd-count" data-cd-count aria-live="polite"></p>
                </div>
                <footer class="ct-foot"><button type="button" class="button small secondary" data-cd-try>👁 ${esc(T('Combien ?'))}</button><span class="ct-sp"></span><button type="button" class="button secondary" data-cd-x>${esc(T('Annuler'))}</button><button type="submit" class="button">${esc(L0 ? T('✓ Modifier la couche') : T('＋ Ajouter à la carte'))}</button></footer></form>`;
            const $ = s => dlg.querySelector(s);
            let done = false; const finish = v => { if (done) return; done = true; try { dlg.close(); } catch (_) {} dlg.remove(); resolve(v); };
            dlg.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
            let autoLabel = !L.label;
            const show = () => {
                const s = srcOf($('[data-cd-src]').value), isTerr = s?.key === 'terr', areas = s?.kind === 'areas';
                const vis = {q: !isTerr, years: !isTerr && !!s?.period && !s?.needsYear, year: !!s?.needsYear, cat: !!s?.fields?.some(f => f.type === 'enum'), near: !isTerr && !areas, terr: !isTerr && !areas, max: !isTerr, sym: !areas, hatch: areas};
                dlg.querySelectorAll('[data-cd-w]').forEach(el => { el.hidden = !vis[el.dataset.cdW]; });
                $('[data-cd-terrs]').hidden = !isTerr;
                $('[data-cd-srcline]').textContent = s?.source ? T('Source : {s}', {s: s.source}) : '';
                const ck = $('[data-cd-catkey]'); const enums = (s?.fields || []).filter(f => f.type === 'enum');
                ck.innerHTML = `<option value="">${esc(T('— toutes —'))}</option>` + enums.map(f => `<option value="${esc(f.key)}" ${L.f.cat?.key === f.key ? 'selected' : ''}>${esc(f.label || f.key)}</option>`).join('');
                const fv = enums.find(f => f.key === ck.value); $('#cd-catvals').innerHTML = (fv?.values || []).map(v => `<option value="${esc(v)}">`).join('');
                if (autoLabel) $('[data-cd-label]').value = s ? s.label : '';
            };
            const collect = () => {
                const s = srcOf($('[data-cd-src]').value); if (!s) return null;
                const f = {}; const v = k => $(`[data-cd-f="${k}"]`).value.trim();
                if (s.key === 'terr') f.ids = [...dlg.querySelectorAll('[data-cd-tid]:checked')].map(i => Number(i.value));
                else {
                    if (v('q')) f.q = v('q');
                    if (s.needsYear) f.year = num(v('year'), 1900); else if (s.period) { const a = num(v('from')), b = num(v('to')); if (a != null) f.from = a; if (b != null) f.to = b; }
                    const ck = $('[data-cd-catkey]').value, cv = $('[data-cd-catval]').value.trim(); if (ck && cv) f.cat = {key: ck, val: cv};
                    const nm = $('[data-cd-near]').value.trim(); if (nm && s.kind !== 'areas') { const p = places.find(x => `${x.name}${x.county ? ` (${x.county})` : ''}` === nm) || places.find(x => fold(x.name) === fold(nm.replace(/\s*\(.*\)$/, ''))); if (p) f.near = {name: nm, lat: p.lat, lon: p.lon, km: num($('[data-cd-km]').value, 20)}; }
                    const it = Number($('[data-cd-interr]').value); if (it && s.kind !== 'areas') f.terr = it;
                }
                const stv = {}; dlg.querySelectorAll('[data-cd-st]').forEach(el => { stv[el.dataset.cdSt] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value; });
                return {id: L.id, src: s.key, label: $('[data-cd-label]').value.trim() || s.label, f, st: stv, max: Math.max(1, Math.min(20000, Number($('[data-cd-max]').value) || 1500))};
            };
            $('[data-cd-src]').addEventListener('change', () => { L.f = {}; show(); $('[data-cd-count]').textContent = ''; });
            $('[data-cd-label]').addEventListener('input', () => { autoLabel = false; });
            $('[data-cd-catkey]').addEventListener('change', show);
            dlg.addEventListener('click', async e => {
                if (e.target.closest('[data-cd-x]')) return finish(null);
                if (e.target.closest('[data-cd-newterr]')) { const t = await TR()?.open(null); if (t) { terrs = await TR().list(); const box = $('[data-cd-terrs]'); box.insertAdjacentHTML('afterbegin', `<label class="checkbox-line"><input type="checkbox" data-cd-tid value="${t.id}" checked> ${esc(t.name)}</label>`); } return; }
                if (e.target.closest('[data-cd-try]')) { const l = collect(); if (!l) return; $('[data-cd-count]').textContent = T('Recherche…'); const r = await fetchLayer(l); $('[data-cd-count]').textContent = r.missing || (r.features.length ? T('{n} à dessiner.', {n: A()?.plural ? A().plural(r.features.length, T('élément')) : r.features.length}) : T('Rien ne correspond à ces filtres.')); }
            });
            dlg.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const l = collect(); if (!l) { toast(T('Choisis des données.'), 'error'); return; } if (l.src === 'terr' && !l.f.ids?.length) { toast(T('Coche au moins un territoire.'), 'error'); return; } finish(l); });
            ext.dataListSelect?.($('[data-cd-src]')); // 🧰 « Quelles données ? » : le choix commun (recherche, thèmes, cartes), replié en une ligne ; le menu reste, caché
            show(); dlg.showModal();
        });
    }

    /* ═════════ ✒️ le dessin vectoriel (menu Plan) ═════════ */
    const mercY = lat => { const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180; return Math.log(Math.tan(Math.PI / 4 + r / 2)); };
    const latOfY = y => Math.atan(Math.sinh(y)) * 180 / Math.PI;
    /** la projection du plan (celle du mode Plan : Mercator dans le cadre doc.map.geo) ; la pose si le plan n'est pas encore situé */
    function vectorProj(doc, feats) {
        let g = doc.map?.geo;
        if (!g || !(g.e > g.w && g.n > g.s)) {
            const b = [Infinity, Infinity, -Infinity, -Infinity];
            feats.forEach(f => { const each = (lo, la) => { b[0] = Math.min(b[0], lo); b[2] = Math.max(b[2], lo); b[1] = Math.min(b[1], la); b[3] = Math.max(b[3], la); };
                if (f.type === 'pt') each(f.lon, f.lat); else (f.rings || [f.pts || []]).forEach(r => r.forEach(([lo, la]) => each(lo, la))); });
            if (b[0] === Infinity) return null;
            const mx = Math.max(.02, (b[2] - b[0]) * .08), my = Math.max(.02, (b[3] - b[1]) * .08);
            let w = b[0] - mx, e = b[2] + mx, yS = mercY(b[1] - my), yN = mercY(b[3] + my);
            const xw = (e - w) * Math.PI / 180, yh = yN - yS, ar = (doc.h || 600) / (doc.w || 800);
            if (yh / xw > ar) { const nx = yh / ar * 180 / Math.PI, c = (w + e) / 2; w = c - nx / 2; e = c + nx / 2; } else { const ny = xw * ar, c = (yS + yN) / 2; yS = c - ny / 2; yN = c + ny / 2; }
            g = {n: latOfY(yN), s: latOfY(yS), w, e, lat: (latOfY(yN) + latOfY(yS)) / 2, lon: (w + e) / 2, name: '', place_id: 0};
            doc.map = {on: false, style: 'modern', auto: true, scale: 1, ...(doc.map || {}), geo: g};
        }
        return (lon, lat) => [(lon - g.w) / (g.e - g.w) * doc.w, (mercY(g.n) - mercY(lat)) / (mercY(g.n) - mercY(g.s)) * doc.h];
    }
    const PAT = {diag: {kind: 'lines', angle: 45}, diag2: {kind: 'lines', angle: -45}, vert: {kind: 'lines', angle: 0}, horiz: {kind: 'lines', angle: 90}, cross: {kind: 'grid'}, dots: {kind: 'dots'}};
    const a2 = o => Math.round(Math.max(0, Math.min(1, o)) * 255).toString(16).padStart(2, '0');
    /** une couche → un groupe d'objets du dessin (zones, symboles, noms), plus la légende et la source */
    async function addToVector(ed, L) {
        const doc = ed.doc(), res = await fetchLayer(L, {bbox: doc.map?.geo ? [doc.map.geo.w, doc.map.geo.s, doc.map.geo.e, doc.map.geo.n] : null});
        if (res.missing) { toast(res.missing, 'error'); return false; }
        if (!res.features.length) { toast(T('Rien ne correspond à ces filtres.'), 'error'); return false; }
        const P = vectorProj(doc, res.features); if (!P) return false;
        const st = styleOf(L, 0), color = hex6(st.color) || '#c0392b', size = Math.max(1, Number(st.size) || 4) * Math.max(1, doc.w / 800), uid = ed.uid, kids = [], labs = [];
        const ringD = rings => rings.map(r => r.map(([lo, la], i) => { const [x, y] = P(lo, la); return `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`; }).join('') + 'Z').join('');
        const fsz = Math.max(9, doc.w / 70);
        res.features.forEach(ft => {
            const fst = ft.style && L.src === 'terr' ? {...st, ...ft.style} : st, c = hex6(fst.color) || color;
            if (ft.type === 'area') {
                const pat = PAT[fst.hatch]; const o = {id: uid(), type: 'svgpath', name: String(ft.label || L.label).slice(0, 60), d: ringD(ft.rings), evenodd: true, fill: pat ? c : c + a2(fst.opacity ?? .25), stroke: c, sw: Math.max(.5, Number(fst.width) || 1.5), ...(fst.dash ? {dash: 'dash'} : {}), ...(pat ? {pat: {...pat, size: 8, width: 1, color: c, bg: '#ffffff00'}} : {})};
                kids.push(o);
                if (fst.labels || (L.src === 'terr' && fst.label !== false)) { const b = ft.rings.flat().reduce((b, [lo, la]) => [Math.min(b[0], lo), Math.min(b[1], la), Math.max(b[2], lo), Math.max(b[3], la)], [Infinity, Infinity, -Infinity, -Infinity]); const [x, y] = P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
                    labs.push({id: uid(), type: 'text', name: String(ft.label).slice(0, 30), text: String(ft.label), x: r1(x), y: r1(y), size: r1(fsz * 1.2), font: 'Helvetica, Arial, sans-serif', align: 'middle', bold: true, fill: c, sw: 0}); }
            } else if (ft.type === 'line') {
                kids.push({id: uid(), type: 'svgpath', name: String(ft.label || L.label).slice(0, 60), d: ringD([ft.pts]).replace(/Z$/, ''), fill: 'none', stroke: c, sw: Math.max(1, size / 2)});
            } else {
                const [x, y] = P(ft.lon, ft.lat); if (x < -size || y < -size || x > doc.w + size || y > doc.h + size) return;
                if (st.sym === 'circle') kids.push({id: uid(), type: 'ellipse', name: String(ft.label || '').slice(0, 40), x: r1(x - size), y: r1(y - size), w: r1(size * 2), h: r1(size * 2), fill: c, stroke: '#ffffff', sw: r1(Math.max(.5, size / 5)), ...(st.opacity < 1 ? {op: st.opacity} : {})});
                else { const m = symbolSvg(st.sym, x, y, size, c).match(/ d="([^"]+)"/) || [null, `M${r1(x - size)} ${r1(y - size)}h${r1(size * 2)}v${r1(size * 2)}h${r1(-size * 2)}Z`];
                    kids.push({id: uid(), type: 'svgpath', name: String(ft.label || '').slice(0, 40), d: m[1], fill: c, stroke: '#ffffff', sw: r1(Math.max(.5, size / 5))}); }
                if (st.labels && ft.label) labs.push({id: uid(), type: 'text', name: String(ft.label).slice(0, 30), text: String(ft.label), x: r1(x + size * 1.4), y: r1(y + fsz * .35), size: r1(fsz), font: 'Helvetica, Arial, sans-serif', fill: '#222222', sw: 0});
            }
        });
        if (!kids.length) { toast(T('Ces données tombent en dehors du dessin.'), 'error'); return false; }
        const n = kids.length;
        const legendY = doc.h - fsz * 1.2;
        const grp = {id: uid(), type: 'group', name: `🗺 ${String(L.label || '').slice(0, 50)}`, carto: {src: L.src, f: L.f, st: L.st}, children: [...kids, ...labs,
            {id: uid(), type: 'group', name: T('Légende et source'), children: [
                st.sym === 'circle' || res.features[0].type === 'area' ? {id: uid(), type: res.features[0].type === 'area' ? 'rect' : 'ellipse', name: T('Légende'), x: fsz, y: legendY - fsz * 2.1, w: fsz * .9, h: fsz * .9, fill: res.features[0].type === 'area' ? color + '66' : color, stroke: color, sw: 1}
                    : {id: uid(), type: 'svgpath', name: T('Légende'), d: symbolSvg(st.sym, fsz * 1.45, legendY - fsz * 1.65, fsz * .45, color).match(/ d="([^"]+)"/)?.[1] || '', fill: color, sw: 0},
                {id: uid(), type: 'text', name: T('Légende'), text: `${L.label} (${n})`, x: r1(fsz * 2.3), y: r1(legendY - fsz * 1.3), size: r1(fsz), font: 'Helvetica, Arial, sans-serif', fill: '#222222', sw: 0},
                {id: uid(), type: 'text', name: T('Source'), text: T('Données : {s}', {s: res.source || L.label}), x: r1(fsz), y: r1(legendY), size: r1(fsz * .75), font: 'Helvetica, Arial, sans-serif', fill: '#555555', sw: 0}]}]};
        ed.cur().push(grp); ed.commit(T('Couche « {n} » ajoutée', {n: L.label}));
        return true;
    }
    (ext.vectorPlanItems = ext.vectorPlanItems || []).push(
        {k: 'cd_data', label: T('＋ Données ouvertes sur le plan (séismes, châteaux, lieux…)…'), run: async ed => { const L = await layerDialog(null); if (L) await addToVector(ed, L); }},
        {k: 'cd_terr_new', label: T('🧩 Territoire à partir de communes…'), run: async ed => { const t = await TR()?.open(null); if (t) await addToVector(ed, {id: lid(), src: 'terr', label: t.name, f: {ids: [t.id]}, st: {color: t.style?.color}}); }},
        {k: 'cd_terr', label: T('🧩 Mes territoires sur le plan…'), run: async ed => { const t = await TR()?.pick(); if (t) await addToVector(ed, {id: lid(), src: 'terr', label: t.name, f: {ids: [t.id]}, st: {color: t.style?.color}}); }});

    ext.cartoDonnees = {sources, fetchLayer, ready, layersSvg, layerDialog, addToVector, wrapKinds, vectorProj, symbolSvg, loadPacks};
    wrapKinds();
    const later = () => { wrapKinds(); setTimeout(wrapKinds, 1500); loadPacks(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later, {once: true}); else setTimeout(later, 0);
})(typeof window !== 'undefined' ? window : globalThis);
